#!/usr/bin/env python3
"""Validate the one reviewed public update receipt for legacy Pages.

The receipt is an opt-in exception to the default additive-only policy. This
module binds it to exact public and source Git objects; callers must still run
their own complete artifact/live inventory checks before copying anything.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


PUBLIC_REPOSITORY = "emrum01/akashic-games"
PUBLIC_COMMIT = "1fc3702e126ec1a7b4ea14f7e38d8199a847a5c4"
PUBLIC_TREE = "6d82fe4232b53ebc6a023d51108bfb0f49b79e2e"
PUBLIC_FILE_COUNT = 377

SOURCE_REPOSITORY = "emrum01/akashic"
SOURCE_COMMIT = "cd05b5a67b5950e9399a67ffaae2e9211bdc7b6b"
SOURCE_COMMIT_TREE = "20a9c59447a5b511ebd02416b947d189d521280b"
SOURCE_TREE_PATH = "apps/akashic-games"
SOURCE_TREE = "25e75e0a9c0d976ed67853008347fdcdbcfad885"
SOURCE_FETCH_REF = "refs/pull/192/head"

UPDATE_PATHS = ("last-stitch/game.js", "last-stitch/index.html")
RECEIPT_FIELDS = {
    "schemaVersion", "publicRepository", "publicCommitSha", "publicTreeSha",
    "publicFileCount", "sourceRepository", "sourceCommitSha",
    "sourceCommitTreeSha", "sourceTreePath", "sourceTreeSha", "sourceFetchRef",
    "updates",
}
UPDATE_FIELDS = {"path", "oldSha256", "oldBytes", "newSha256", "newBytes"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value, length, label):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{%d}" % length, value),
            f"invalid {label}")
    return value


def safe_path(value):
    require(isinstance(value, str) and value, "empty or non-string path")
    require(not any(ord(char) < 32 or char == "\\" for char in value),
            f"unsafe path: {value!r}")
    require(all(part not in ("", ".", "..", ".git") for part in value.split("/")),
            f"unsafe path: {value!r}")
    return value


def load_json(path):
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result

    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_keys)
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid reviewed update JSON: {error}") from error


def git(repo, *args):
    try:
        return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as error:
        raise ValueError("required reviewed-update Git object is unavailable") from error


def git_tree(repo, commit):
    return git(repo, "rev-parse", f"{commit}^{{tree}}").decode().strip()


def git_blob(repo, commit, path):
    return git(repo, "cat-file", "blob", f"{commit}:{path}")


def tree_entries(repo, commit, *, require_regular=True):
    entries = {}
    output = git(repo, "ls-tree", "-rz", "-r", commit)
    for entry in output.split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode("ascii").split()
        path = safe_path(raw_path.decode("utf-8"))
        if require_regular:
            require(kind == "blob" and mode in ("100644", "100755"),
                    f"reviewed Git tree contains a non-regular file: {path}")
        require(path not in entries, f"duplicate path in reviewed Git tree: {path}")
        entries[path] = (mode, kind, blob)
    return entries


def _validate_receipt_schema(receipt_path):
    require(receipt_path.is_file() and not receipt_path.is_symlink(),
            "reviewed update receipt must be a regular file")
    receipt = load_json(receipt_path)
    require(isinstance(receipt, dict) and set(receipt) == RECEIPT_FIELDS,
            "invalid reviewed update receipt schema")
    require(type(receipt["schemaVersion"]) is int and receipt["schemaVersion"] == 1,
            "unsupported reviewed update receipt schema")
    for field, expected in (
        ("publicRepository", PUBLIC_REPOSITORY),
        ("publicCommitSha", PUBLIC_COMMIT),
        ("publicTreeSha", PUBLIC_TREE),
        ("sourceRepository", SOURCE_REPOSITORY),
        ("sourceCommitSha", SOURCE_COMMIT),
        ("sourceCommitTreeSha", SOURCE_COMMIT_TREE),
        ("sourceTreePath", SOURCE_TREE_PATH),
        ("sourceTreeSha", SOURCE_TREE),
        ("sourceFetchRef", SOURCE_FETCH_REF),
    ):
        require(receipt[field] == expected, f"wrong reviewed update {field}")
    require(type(receipt["publicFileCount"]) is int
            and receipt["publicFileCount"] == PUBLIC_FILE_COUNT,
            "wrong reviewed update public file count")

    updates = receipt["updates"]
    require(isinstance(updates, list) and len(updates) == len(UPDATE_PATHS),
            "reviewed update must contain exactly two paths")
    seen = set()
    normalized = []
    for update in updates:
        require(isinstance(update, dict) and set(update) == UPDATE_FIELDS,
                "invalid reviewed update entry schema")
        path = safe_path(update["path"])
        require(path not in seen, f"duplicate reviewed update path: {path}")
        seen.add(path)
        normalized.append(update)
    require(tuple(update["path"] for update in normalized) == UPDATE_PATHS,
            "reviewed update paths or order differ from the exact allowlist")
    for update in normalized:
        digest(update["oldSha256"], 64, "old SHA-256")
        digest(update["newSha256"], 64, "new SHA-256")
        require(type(update["oldBytes"]) is int and update["oldBytes"] >= 0,
                "invalid old byte count")
        require(type(update["newBytes"]) is int and update["newBytes"] >= 0,
                "invalid new byte count")
    return normalized


def validate_reviewed_update(receipt_path, baseline_repo, source_repo):
    receipt_path = Path(receipt_path)
    baseline_repo = Path(baseline_repo)
    source_repo = Path(source_repo)
    require(baseline_repo.is_dir() and not baseline_repo.is_symlink(),
            "baseline repository must be a real directory")
    require(source_repo.is_dir() and not source_repo.is_symlink(),
            "source repository must be a real directory")
    baseline_repo = baseline_repo.resolve()
    source_repo = source_repo.resolve()
    require(baseline_repo != source_repo and baseline_repo not in source_repo.parents
            and source_repo not in baseline_repo.parents,
            "baseline and source repositories must be separate")

    updates = _validate_receipt_schema(receipt_path)
    require(git_tree(baseline_repo, PUBLIC_COMMIT) == PUBLIC_TREE,
            "pinned public tree differs from reviewed update receipt")
    public_entries = tree_entries(baseline_repo, PUBLIC_COMMIT)
    require(len(public_entries) == PUBLIC_FILE_COUNT,
            "pinned public file count differs from reviewed update receipt")

    actual_source_tree = git_tree(source_repo, SOURCE_COMMIT)
    require(actual_source_tree == SOURCE_COMMIT_TREE,
            "preserved source commit tree differs from reviewed update receipt")
    actual_source_subtree = git(
        source_repo, "rev-parse", f"{SOURCE_COMMIT}:{SOURCE_TREE_PATH}"
    ).decode().strip()
    require(actual_source_subtree == SOURCE_TREE,
            "preserved source subtree differs from reviewed update receipt")
    source_entries = tree_entries(source_repo, SOURCE_COMMIT, require_regular=False)

    for update in updates:
        path = update["path"]
        source_path = f"{SOURCE_TREE_PATH}/{path}"
        require(path in public_entries, f"reviewed path is not in the pinned public tree: {path}")
        require(source_path in source_entries
                and source_entries[source_path][0] in ("100644", "100755")
                and source_entries[source_path][1] == "blob",
                f"reviewed path is not in the preserved source tree: {path}")
        old_data = git_blob(baseline_repo, PUBLIC_COMMIT, path)
        new_data = git_blob(source_repo, SOURCE_COMMIT, source_path)
        require(hashlib.sha256(old_data).hexdigest() == update["oldSha256"]
                and len(old_data) == update["oldBytes"],
                f"reviewed old bytes differ from pinned public Git object: {path}")
        require(hashlib.sha256(new_data).hexdigest() == update["newSha256"]
                and len(new_data) == update["newBytes"],
                f"reviewed new bytes differ from preserved source Git object: {path}")
    return updates


def validate_artifact_update_bytes(artifact, baseline_repo, source_repo, updates):
    artifact = Path(artifact)
    require(artifact.is_dir() and not artifact.is_symlink(),
            "reviewed artifact must be a real directory")
    artifact = artifact.resolve()
    baseline_repo = Path(baseline_repo).resolve()
    source_repo = Path(source_repo).resolve()
    require(artifact != baseline_repo and baseline_repo not in artifact.parents
            and artifact not in baseline_repo.parents,
            "artifact and baseline repository must be separate")
    require(artifact != source_repo and source_repo not in artifact.parents
            and artifact not in source_repo.parents,
            "artifact and source repository must be separate")
    states = set()
    for update in updates:
        path = safe_path(update["path"])
        candidate = artifact / path
        require(candidate.is_file() and not candidate.is_symlink(),
                f"reviewed artifact path is missing or not a regular file: {path}")
        for parent in candidate.parents:
            if parent == artifact:
                break
            require(not parent.is_symlink(), f"reviewed artifact path has a symlink parent: {path}")
        candidate_data = candidate.read_bytes()
        old_data = git_blob(baseline_repo, PUBLIC_COMMIT, path)
        source_path = f"{SOURCE_TREE_PATH}/{path}"
        new_data = git_blob(source_repo, SOURCE_COMMIT, source_path)
        if candidate_data == old_data:
            states.add("old")
        elif candidate_data == new_data:
            states.add("new")
        else:
            raise ValueError(f"reviewed artifact bytes are neither exact old nor new Git bytes: {path}")
    require(len(states) == 1, "reviewed artifact contains a mixed old/new source state")
    return states.pop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--baseline-repo", type=Path, required=True)
    parser.add_argument("--source-repo", type=Path, required=True)
    parser.add_argument("--artifact", type=Path,
                        help="also require each reviewed artifact file to match exact old or new Git bytes")
    args = parser.parse_args()
    try:
        updates = validate_reviewed_update(args.receipt, args.baseline_repo, args.source_repo)
        if args.artifact is not None:
            validate_artifact_update_bytes(
                args.artifact, args.baseline_repo, args.source_repo, updates
            )
        for update in updates:
            print("\t".join(str(update[field]) for field in (
                "path", "oldSha256", "oldBytes", "newSha256", "newBytes"
            )))
    except (OSError, ValueError) as error:
        print(f"reviewed-update: error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
