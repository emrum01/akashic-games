#!/usr/bin/env python3
"""Offline regressions for completing, never reconstructing, published files."""

from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("retain_published", Path(__file__).with_name("retain-published.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def sha(data):
    return hashlib.sha256(data).hexdigest()


class RetainPublishedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "public-repo"
        self.repo.mkdir()
        self.command("init", "-q", "--initial-branch=gh-pages")
        self.public = {"index.html": b"unchanged public page", "robots.txt": b"current public policy",
                       "assets/og.jpg": b"exact published media bytes"}
        for path, data in self.public.items():
            destination = self.repo / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        self.command("add", "-A")
        self.command("-c", "user.name=Pages fixture", "-c", "user.email=pages@example.invalid",
                     "-c", "commit.gpgsign=false", "commit", "-q", "-m", "public seed")
        commit = self.command("rev-parse", "HEAD").strip()
        tree = self.command("rev-parse", "HEAD^{tree}").strip()
        self.artifact = self.root / "artifact"
        self.artifact.mkdir()
        (self.artifact / "index.html").write_bytes(self.public["index.html"])
        (self.artifact / "robots.txt").write_bytes(b"older source policy")
        entries = [{"path": path, "sha256": sha(self.public[path]), "bytes": len(self.public[path])}
                   for path in ("assets/og.jpg", "robots.txt")]
        entries[1]["replacesSourceSha256"] = sha(b"older source policy")
        self.manifest = {"schemaVersion": 1, "sourceRepository": "emrum01/akashic-games",
                         "sourceCommitSha": commit, "sourceTreeSha": tree,
                         "baselineFileCount": 3, "files": entries}
        self.manifest_path = self.root / "baseline.json"

    def command(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], text=True)

    def run_helper(self):
        self.manifest_path.write_text(json.dumps(self.manifest))
        with redirect_stdout(io.StringIO()):
            helper.retain(self.artifact, self.repo, self.manifest_path)

    def snapshot(self):
        return {p.relative_to(self.artifact).as_posix(): p.read_bytes()
                for p in self.artifact.rglob("*") if p.is_file() and not p.is_symlink()}

    def assert_rejected_without_writes(self, expected):
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, expected):
            self.run_helper()
        self.assertEqual(before, self.snapshot())

    def test_exact_completion_retains_bytes_and_new_additive_file(self):
        (self.artifact / "new.html").write_bytes(b"new source page")
        self.run_helper()
        self.assertEqual(self.snapshot(), self.public | {"new.html": b"new source page"})
        self.run_helper()
        self.assertEqual(self.snapshot(), self.public | {"new.html": b"new source page"})

    def test_wrong_tree(self):
        self.manifest["sourceTreeSha"] = "0" * 40
        self.assert_rejected_without_writes("baseline tree differs")

    def test_wrong_count(self):
        self.manifest["baselineFileCount"] = 2
        self.assert_rejected_without_writes("baseline file count differs")

    def test_tampered_media_receipt(self):
        self.manifest["files"][0]["sha256"] = "0" * 64
        self.assert_rejected_without_writes("retained bytes differ")

    def test_tampered_size(self):
        self.manifest["files"][0]["bytes"] += 1
        self.assert_rejected_without_writes("retained bytes differ")

    def test_unknown_source_edit_is_not_silently_overridden(self):
        (self.artifact / "robots.txt").write_bytes(b"new unreviewed source policy")
        self.assert_rejected_without_writes("superseded source changed")

    def test_missing_superseded_source(self):
        (self.artifact / "robots.txt").unlink()
        self.assert_rejected_without_writes("superseded source is missing")

    def test_source_collision_without_override_receipt(self):
        (self.artifact / "assets").mkdir()
        (self.artifact / "assets/og.jpg").write_bytes(b"different media")
        self.assert_rejected_without_writes("retained file conflicts")

    def test_unretained_public_file_missing(self):
        (self.artifact / "index.html").unlink()
        self.assert_rejected_without_writes("public baseline file is missing")

    def test_unretained_public_file_changed(self):
        (self.artifact / "index.html").write_bytes(b"different page")
        self.assert_rejected_without_writes("public baseline file changed")

    def test_incomplete_retained_list(self):
        self.manifest["files"] = self.manifest["files"][1:]
        self.assert_rejected_without_writes("public baseline file is missing")

    def test_duplicate_retained_path(self):
        self.manifest["files"].append(self.manifest["files"][0])
        self.assert_rejected_without_writes("duplicate retained path")

    def test_path_traversal(self):
        for path in ("../outside", "/absolute", ".git/config", "assets/../outside", "assets\\outside"):
            with self.subTest(path=path):
                self.manifest["files"][0]["path"] = path
                self.assert_rejected_without_writes("unsafe path")

    def test_unknown_public_path(self):
        self.manifest["files"][0]["path"] = "assets/guessed.jpg"
        self.assert_rejected_without_writes("not in pinned baseline")

    def test_symlink_parent(self):
        (self.root / "outside").mkdir()
        (self.artifact / "assets").symlink_to(self.root / "outside", target_is_directory=True)
        self.assert_rejected_without_writes("symlink")

    def test_symlink_file(self):
        (self.artifact / "robots.txt").unlink()
        (self.artifact / "robots.txt").symlink_to(self.repo / "robots.txt")
        self.assert_rejected_without_writes("symlink")

    def test_non_file_parent(self):
        (self.artifact / "assets").write_bytes(b"file blocking directory")
        self.assert_rejected_without_writes("parent is not a directory")

    def test_duplicate_json_key(self):
        self.manifest_path.write_text('{"schemaVersion":1,"schemaVersion":2}')
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            helper.retain(self.artifact, self.repo, self.manifest_path)
        self.assertEqual(before, self.snapshot())

    def test_baseline_does_not_follow_mutated_working_tree(self):
        (self.repo / "assets/og.jpg").write_bytes(b"uncommitted mutation")
        self.run_helper()
        self.assertEqual(self.snapshot(), self.public)


if __name__ == "__main__":
    unittest.main()
