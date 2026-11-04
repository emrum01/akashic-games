#!/usr/bin/env python3
"""Offline tests for the narrowly scoped reviewed Pages update receipt."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


PAGES_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PAGES_DIR))
import reviewed_update

retain_spec = importlib.util.spec_from_file_location(
    "retain_published_reviewed_tests", PAGES_DIR / "retain-published.py"
)
retainer = importlib.util.module_from_spec(retain_spec)
retain_spec.loader.exec_module(retainer)


ROUTES = (
    "blessing-alert", "bookcafe-3d", "broken-web", "kobako", "last-stitch",
    "notification-gale", "sic", "still-thread", "three-forward-two-back", "zoo-escape",
)
PUBLIC_FILES = 377
OLD_GAME = b"old public game bytes"
OLD_INDEX = b"<html>old public page</html>"
NEW_GAME = b"new preserved-source game bytes"
NEW_INDEX = b"<html>new preserved-source page</html>"


def sha(data):
    return hashlib.sha256(data).hexdigest()


class ReviewedUpdateFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.public_repo = self.root / "public-repo"
        self.source_repo = self.root / "source-repo"
        self.public_repo.mkdir()
        self.source_repo.mkdir()
        self.git(self.public_repo, "init", "-q", "--initial-branch=gh-pages")
        self.git(self.source_repo, "init", "-q", "--initial-branch=main")
        self.configure(self.public_repo)
        self.configure(self.source_repo)
        self.public_files = self.create_public_tree()
        self.public_commit = self.commit(self.public_repo, "public snapshot")
        self.public_tree = self.git(self.public_repo, "rev-parse", "HEAD^{tree}")
        self.source_files = self.create_source_tree()
        self.source_commit = self.commit(self.source_repo, "preserved reviewed source")
        self.source_commit_tree = self.git(self.source_repo, "rev-parse", "HEAD^{tree}")
        self.source_tree = self.git(
            self.source_repo, "rev-parse", "HEAD:apps/akashic-games"
        )
        self.receipt_path = self.root / "reviewed-public-updates.json"
        self.receipt = self.make_receipt()
        self.write_receipt()
        self.manifest_path = self.root / "baseline.json"
        self.manifest = self.make_manifest()
        self.write_manifest()
        self.artifact = self.root / "artifact"
        self.live = self.root / "live-pages"
        self.copy_public(self.artifact)
        subprocess.run(["git", "clone", "-q", "--branch", "gh-pages",
                        str(self.public_repo), str(self.live)], check=True)
        self.publisher_dir = self.root / "pages-script"
        self.publisher_dir.mkdir()
        shutil.copy2(PAGES_DIR / "publish-site.sh", self.publisher_dir / "publish-site.sh")
        self.copy_patched_validator()

    def git(self, repo, *args):
        output = subprocess.check_output(["git", "-C", str(repo), *args], text=True)
        return output.strip()

    def configure(self, repo):
        self.git(repo, "config", "user.name", "Reviewed update fixture")
        self.git(repo, "config", "user.email", "reviewed-update@example.invalid")
        self.git(repo, "config", "commit.gpgsign", "false")

    def commit(self, repo, message):
        self.git(repo, "add", "-A")
        self.git(repo, "commit", "-q", "-m", message)
        return self.git(repo, "rev-parse", "HEAD")

    def create_public_tree(self):
        files = {
            "index.html": b"<html>public index</html>",
            "robots.txt": b"User-agent: *\nDisallow:\n",
            "CNAME": b"games.escape-safari.com",
            ".nojekyll": b"",
        }
        for route in ROUTES:
            data = b"<html>public " + route.encode() + b"</html>"
            files[f"{route}/index.html"] = data
        files["last-stitch/game.js"] = OLD_GAME
        files["last-stitch/index.html"] = OLD_INDEX
        extra_count = PUBLIC_FILES - len(files)
        for index in range(extra_count):
            files[f"assets/file-{index:03d}.bin"] = f"fixture-{index}".encode()
        self.write_files(self.public_repo, files)
        return files

    def create_source_tree(self):
        files = {
            "apps/akashic-games/last-stitch/game.js": NEW_GAME,
            "apps/akashic-games/last-stitch/index.html": NEW_INDEX,
        }
        self.write_files(self.source_repo, files)
        return files

    @staticmethod
    def write_files(root, files):
        for relative, data in files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    def copy_public(self, destination):
        destination.mkdir()
        for relative, data in self.public_files.items():
            path = destination / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    def make_receipt(self):
        return {
            "schemaVersion": 1,
            "publicRepository": reviewed_update.PUBLIC_REPOSITORY,
            "publicCommitSha": self.public_commit,
            "publicTreeSha": self.public_tree,
            "publicFileCount": PUBLIC_FILES,
            "sourceRepository": reviewed_update.SOURCE_REPOSITORY,
            "sourceCommitSha": self.source_commit,
            "sourceCommitTreeSha": self.source_commit_tree,
            "sourceTreePath": reviewed_update.SOURCE_TREE_PATH,
            "sourceTreeSha": self.source_tree,
            "sourceFetchRef": reviewed_update.SOURCE_FETCH_REF,
            "updates": [
                {
                    "path": "last-stitch/game.js",
                    "oldSha256": sha(OLD_GAME), "oldBytes": len(OLD_GAME),
                    "newSha256": sha(NEW_GAME), "newBytes": len(NEW_GAME),
                },
                {
                    "path": "last-stitch/index.html",
                    "oldSha256": sha(OLD_INDEX), "oldBytes": len(OLD_INDEX),
                    "newSha256": sha(NEW_INDEX), "newBytes": len(NEW_INDEX),
                },
            ],
        }

    def write_receipt(self):
        self.receipt_path.write_text(json.dumps(self.receipt), encoding="utf-8")

    def make_manifest(self):
        retained_path = "assets/file-000.bin"
        data = self.public_files[retained_path]
        return {
            "schemaVersion": 1,
            "sourceRepository": reviewed_update.PUBLIC_REPOSITORY,
            "sourceCommitSha": self.public_commit,
            "sourceTreeSha": self.public_tree,
            "baselineFileCount": PUBLIC_FILES,
            "files": [{"path": retained_path, "sha256": sha(data), "bytes": len(data)}],
        }

    def write_manifest(self):
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def patched_pins(self):
        return patch.multiple(
            reviewed_update,
            PUBLIC_COMMIT=self.public_commit,
            PUBLIC_TREE=self.public_tree,
            SOURCE_COMMIT=self.source_commit,
            SOURCE_COMMIT_TREE=self.source_commit_tree,
            SOURCE_TREE=self.source_tree,
        )

    def copy_patched_validator(self):
        source = (PAGES_DIR / "reviewed_update.py").read_text(encoding="utf-8")
        values = {
            "PUBLIC_COMMIT": self.public_commit,
            "PUBLIC_TREE": self.public_tree,
            "SOURCE_COMMIT": self.source_commit,
            "SOURCE_COMMIT_TREE": self.source_commit_tree,
            "SOURCE_TREE": self.source_tree,
        }
        for name, value in values.items():
            original = getattr(reviewed_update, name)
            old = f'{name} = "{original}"'
            new = f'{name} = "{value}"'
            if source.count(old) != 1:
                raise AssertionError(f"expected one {name} pin in helper source")
            source = source.replace(old, new)
        (self.publisher_dir / "reviewed_update.py").write_text(source, encoding="utf-8")

    def snapshot(self, root):
        return {
            path.relative_to(root).as_posix(): path.read_bytes()
            for path in root.rglob("*")
            if path.is_file() and not path.is_symlink() and ".git" not in path.parts
        }

    def source_state_snapshot(self, root):
        return self.snapshot(root)

    def call_retain(self):
        with self.patched_pins():
            retainer.retain(
                self.artifact, self.public_repo, self.manifest_path,
                self.receipt_path, self.source_repo,
            )

    def run_publisher(self, *, check_only=False, artifact=None, live=None, source=None):
        args = [
            "bash", str(self.publisher_dir / "publish-site.sh"),
            "--artifact", str(artifact or self.artifact),
            "--pages-root", str(live or self.live),
            "--reviewed-update", str(self.receipt_path),
            "--source-repo", str(source or self.source_repo),
        ]
        if check_only:
            args.append("--check-only")
        return subprocess.run(args, text=True, capture_output=True)

    def replace_artifact_updates(self, paths=None):
        paths = paths or {
            "last-stitch/game.js": NEW_GAME,
            "last-stitch/index.html": NEW_INDEX,
        }
        for relative, contents in paths.items():
            (self.artifact / relative).write_bytes(contents)

    def replace_live_updates(self, paths=None):
        paths = paths or {
            "last-stitch/game.js": NEW_GAME,
            "last-stitch/index.html": NEW_INDEX,
        }
        for relative, contents in paths.items():
            (self.live / relative).write_bytes(contents)


class ReviewedUpdateRetainTests(ReviewedUpdateFixture):
    def test_receipt_is_explicit_and_old_artifact_is_noop(self):
        before = self.snapshot(self.artifact)
        self.call_retain()
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_exact_two_source_updates_preserve_other_375_public_files(self):
        original = self.snapshot(self.artifact)
        self.replace_artifact_updates()
        self.call_retain()
        updated = self.snapshot(self.artifact)
        self.assertEqual(set(updated), set(original))
        changed = {path for path in original if original[path] != updated[path]}
        self.assertEqual(changed, {"last-stitch/game.js", "last-stitch/index.html"})
        self.assertEqual(len(original) - len(changed), 375)
        self.assertEqual(updated["last-stitch/game.js"], NEW_GAME)
        self.assertEqual(updated["last-stitch/index.html"], NEW_INDEX)

    def test_mixed_artifact_states_fail_without_writes(self):
        self.replace_artifact_updates({"last-stitch/game.js": NEW_GAME})
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "mixed old/new"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_unreviewed_baseline_modification_fails_without_writes(self):
        (self.artifact / "assets/file-010.bin").write_bytes(b"unreviewed")
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "baseline file changed"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_baseline_deletion_fails_without_writes(self):
        (self.artifact / "assets/file-010.bin").unlink()
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "baseline file is missing"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_missing_source_commit_fails_closed(self):
        missing_repo = self.root / "missing-source"
        missing_repo.mkdir()
        self.git(missing_repo, "init", "-q", "--initial-branch=main")
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "Git object is unavailable"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, missing_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_corrupt_source_blob_fails_closed(self):
        corrupt_repo = self.root / "corrupt-source"
        subprocess.run(["git", "clone", "-q", "--no-hardlinks", str(self.source_repo),
                        str(corrupt_repo)], check=True)
        blob = self.git(self.source_repo, "rev-parse",
                        f"{self.source_commit}:apps/akashic-games/last-stitch/game.js")
        object_path = corrupt_repo / ".git" / "objects" / blob[:2] / blob[2:]
        self.assertTrue(object_path.is_file())
        object_path.write_bytes(b"corrupt Git object")
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaises(ValueError):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, corrupt_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_wrong_pinned_public_tree_fails(self):
        self.receipt["publicTreeSha"] = "0" * 40
        self.write_receipt()
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "wrong reviewed update publicTreeSha"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_wrong_public_and_source_commit_fail(self):
        for field, message in (
            ("publicCommitSha", "wrong reviewed update publicCommitSha"),
            ("sourceCommitSha", "wrong reviewed update sourceCommitSha"),
        ):
            with self.subTest(field=field):
                self.receipt[field] = "0" * 40
                self.write_receipt()
                with self.patched_pins(), self.assertRaisesRegex(ValueError, message):
                    retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                                    self.receipt_path, self.source_repo)
                self.receipt = self.make_receipt()

    def test_wrong_preserved_source_tree_fails(self):
        self.receipt["sourceTreeSha"] = "0" * 40
        self.write_receipt()
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "wrong reviewed update sourceTreeSha"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.assertEqual(self.snapshot(self.artifact), before)

    def test_wrong_old_hash_and_size_fail(self):
        for field, value, message in (
            ("oldSha256", "0" * 64, "old bytes differ from pinned public"),
            ("oldBytes", 999, "old bytes differ from pinned public"),
        ):
            with self.subTest(field=field):
                self.receipt["updates"][0][field] = value
                self.write_receipt()
                with self.patched_pins(), self.assertRaisesRegex(ValueError, message):
                    retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                                    self.receipt_path, self.source_repo)
                self.receipt = self.make_receipt()

    def test_wrong_new_hash_and_size_fail(self):
        for field, value, message in (
            ("newSha256", "0" * 64, "new bytes differ from preserved source"),
            ("newBytes", 999, "new bytes differ from preserved source"),
        ):
            with self.subTest(field=field):
                self.receipt["updates"][0][field] = value
                self.write_receipt()
                with self.patched_pins(), self.assertRaisesRegex(ValueError, message):
                    retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                                    self.receipt_path, self.source_repo)
                self.receipt = self.make_receipt()

    def test_unknown_field_and_duplicate_key_fail(self):
        self.receipt["unexpected"] = "value"
        self.write_receipt()
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "receipt schema"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.receipt = self.make_receipt()
        self.receipt_path.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding="utf-8")
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)

    def test_duplicate_path_and_path_traversal_fail(self):
        self.receipt["updates"][1]["path"] = self.receipt["updates"][0]["path"]
        self.write_receipt()
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "duplicate reviewed update path"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.receipt = self.make_receipt()
        self.receipt["updates"][0]["path"] = "../outside"
        self.write_receipt()
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "unsafe path"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)

    def test_symlink_and_hardlink_artifact_files_fail_without_writes(self):
        (self.artifact / "last-stitch/game.js").unlink()
        (self.artifact / "last-stitch/game.js").symlink_to(self.public_repo / "last-stitch/game.js")
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "symlink"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        (self.artifact / "last-stitch/game.js").unlink()
        shutil.copy2(self.public_repo / "last-stitch/game.js", self.artifact / "last-stitch/game.js")
        hardlink = self.artifact / "assets/hardlink.bin"
        os.link(self.artifact / "last-stitch/game.js", hardlink)
        before = self.snapshot(self.artifact)
        with self.patched_pins(), self.assertRaisesRegex(ValueError, "hard-linked file"):
            retainer.retain(self.artifact, self.public_repo, self.manifest_path,
                            self.receipt_path, self.source_repo)
        self.assertEqual(self.snapshot(self.artifact), before)


class ReviewedUpdatePublisherTests(ReviewedUpdateFixture):
    def test_old_noop_preservation_check_only(self):
        before = self.snapshot(self.live)
        result = self.run_publisher(check_only=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("reviewed update state old/old", result.stdout)
        self.assertEqual(self.snapshot(self.live), before)

    def test_exact_two_replacements_and_new_new_rerun(self):
        self.replace_artifact_updates()
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        published = self.snapshot(self.live)
        changed = {path for path, data in self.public_files.items() if published[path] != data}
        self.assertEqual(changed, {"last-stitch/game.js", "last-stitch/index.html"})
        self.assertEqual(len(published), PUBLIC_FILES)
        self.assertEqual(published["last-stitch/game.js"], NEW_GAME)
        self.assertEqual(published["last-stitch/index.html"], NEW_INDEX)
        rerun_before = self.snapshot(self.live)
        rerun = self.run_publisher()
        self.assertEqual(rerun.returncode, 0, rerun.stderr)
        self.assertIn("reviewed update state new/new", rerun.stdout)
        self.assertEqual(self.snapshot(self.live), rerun_before)

    def test_check_only_validates_new_replacements_without_writes(self):
        self.replace_artifact_updates()
        before = self.snapshot(self.live)
        result = self.run_publisher(check_only=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("reviewed update state old/new", result.stdout)
        self.assertEqual(self.snapshot(self.live), before)

    def test_reverse_downgrade_fails_without_writes(self):
        self.replace_live_updates()
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("downgrade", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_mixed_artifact_state_fails_without_writes(self):
        self.replace_artifact_updates({"last-stitch/game.js": NEW_GAME})
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mixed old/new", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_mixed_live_state_fails_without_writes(self):
        self.replace_artifact_updates()
        self.replace_live_updates({"last-stitch/game.js": NEW_GAME})
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mixed old/new", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_unknown_target_bytes_fail_without_writes(self):
        self.replace_artifact_updates()
        (self.live / "last-stitch/game.js").write_bytes(b"third-party bytes")
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("neither old nor new", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_unrelated_live_file_deletion_from_artifact_fails_without_writes(self):
        self.replace_artifact_updates()
        (self.artifact / "assets/file-010.bin").unlink()
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deleted from the artifact", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_unrelated_artifact_modification_fails_without_writes(self):
        self.replace_artifact_updates()
        with (self.artifact / "index.html").open("ab") as file:
            file.write(b"tampered")
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("changed in the artifact", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_unknown_live_addition_missing_from_artifact_fails_without_writes(self):
        self.replace_artifact_updates()
        (self.live / "newer-public-file.txt").write_bytes(b"current live addition")
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deleted from the artifact", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_preflight_failure_copies_no_earlier_additive_file(self):
        self.replace_artifact_updates()
        (self.artifact / "new-a.txt").write_bytes(b"new additive file")
        (self.artifact / "z-conflict").write_bytes(b"file conflicts with live directory")
        (self.live / "z-conflict").mkdir()
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("non-file", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)
        self.assertFalse((self.live / "new-a.txt").exists())

    def test_hardlinked_artifact_fails_before_live_write(self):
        self.replace_artifact_updates()
        os.link(self.artifact / "last-stitch/game.js", self.artifact / "last-stitch/hardlink")
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hard-linked", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_hardlinked_live_file_fails_before_write(self):
        self.replace_artifact_updates()
        os.link(self.live / "last-stitch/game.js", self.live / "last-stitch/hardlink")
        before = self.snapshot(self.live)
        result = self.run_publisher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hard-linked", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_missing_source_object_fails_before_live_write(self):
        self.replace_artifact_updates()
        before = self.snapshot(self.live)
        result = self.run_publisher(source=self.public_repo)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed validation", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_corrupt_source_object_fails_before_live_write(self):
        self.replace_artifact_updates()
        corrupt_repo = self.root / "corrupt-source-publisher"
        subprocess.run(["git", "clone", "-q", "--no-hardlinks", str(self.source_repo),
                        str(corrupt_repo)], check=True)
        blob = self.git(self.source_repo, "rev-parse",
                        f"{self.source_commit}:apps/akashic-games/last-stitch/game.js")
        (corrupt_repo / ".git" / "objects" / blob[:2] / blob[2:]).write_bytes(
            b"corrupt Git object"
        )
        before = self.snapshot(self.live)
        result = self.run_publisher(source=corrupt_repo)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed validation", result.stderr)
        self.assertEqual(self.snapshot(self.live), before)

    def test_receipt_arguments_must_be_paired(self):
        result = subprocess.run([
            "bash", str(self.publisher_dir / "publish-site.sh"),
            "--artifact", str(self.artifact), "--pages-root", str(self.live),
            "--reviewed-update", str(self.receipt_path),
        ], text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be supplied together", result.stderr)


if __name__ == "__main__":
    unittest.main()
