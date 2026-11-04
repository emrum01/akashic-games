#!/usr/bin/env python3
"""Complete a Pages artifact from a pinned, already published Git snapshot.

No network or provider writes. Verify the entire candidate before copying any
retained file; publish-site.sh remains the independent live additive-only gate.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

import reviewed_update


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_path(value):
    require(isinstance(value, str) and value, "empty or non-string path")
    require(not any(ord(c) < 32 or c == "\\" for c in value), f"unsafe path: {value!r}")
    require(all(p not in ("", ".", "..", ".git") for p in value.split("/")),
            f"unsafe path: {value!r}")
    return value


def digest(value, length, label):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{%d}" % length, value),
            f"invalid {label}")
    return value


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.PIPE)


def git_blob_hash(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def load_json(path):
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(), object_pairs_hook=unique_keys)


def retain(artifact, baseline_repo, manifest_path, reviewed_update_path=None, source_repo=None):
    require((reviewed_update_path is None) == (source_repo is None),
            "--reviewed-update and --source-repo must be supplied together")
    require(artifact.is_dir() and not artifact.is_symlink(), "artifact must be a real directory")
    artifact = artifact.resolve()
    baseline_repo = baseline_repo.resolve()
    require(artifact != baseline_repo and baseline_repo not in artifact.parents
            and artifact not in baseline_repo.parents, "artifact and baseline repository overlap")
    for path in artifact.rglob("*"):
        require(not path.is_symlink(), f"artifact contains symlink: {path}")
        require(path.is_dir() or path.is_file(), f"artifact contains non-file: {path}")
        if path.is_file():
            require(path.stat().st_nlink == 1, f"artifact contains hard-linked file: {path}")
        safe_path(path.relative_to(artifact).as_posix())

    manifest = load_json(manifest_path)
    require(isinstance(manifest, dict) and set(manifest) == {
        "schemaVersion", "sourceRepository", "sourceCommitSha", "sourceTreeSha",
        "baselineFileCount", "files"}, "invalid baseline schema")
    require(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1,
            "unsupported baseline schema")
    require(manifest["sourceRepository"] == "emrum01/akashic-games", "wrong baseline repository")
    commit = digest(manifest["sourceCommitSha"], 40, "baseline commit")
    tree = digest(manifest["sourceTreeSha"], 40, "baseline tree")
    actual_tree = git(baseline_repo, "rev-parse", f"{commit}^{{tree}}").decode().strip()
    require(actual_tree == tree, "baseline tree differs from pinned commit")
    baseline = {}
    for entry in git(baseline_repo, "ls-tree", "-rz", commit).split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        path = safe_path(raw_path.decode())
        require(kind == "blob" and mode in ("100644", "100755"),
                f"baseline contains non-regular file: {path}")
        baseline[path] = blob
    require(type(manifest["baselineFileCount"]) is int
            and len(baseline) == manifest["baselineFileCount"], "baseline file count differs")

    reviewed_updates = []
    update_mode = None
    update_by_path = {}
    if reviewed_update_path is not None:
        reviewed_updates = reviewed_update.validate_reviewed_update(
            reviewed_update_path, baseline_repo, source_repo
        )
        require(commit == reviewed_update.PUBLIC_COMMIT
                and tree == reviewed_update.PUBLIC_TREE
                and len(baseline) == reviewed_update.PUBLIC_FILE_COUNT,
                "baseline manifest differs from the reviewed update snapshot")
        source_repo = Path(source_repo).resolve()
        require(artifact != source_repo and source_repo not in artifact.parents
                and artifact not in source_repo.parents,
                "artifact and source repository overlap")
        update_by_path = {entry["path"]: entry for entry in reviewed_updates}
        states = set()
        for entry in reviewed_updates:
            path = entry["path"]
            require(path in baseline, f"reviewed update path is not in pinned baseline: {path}")
            destination = artifact / path
            require(destination.is_file() and not destination.is_symlink(),
                    f"reviewed artifact path is missing or not a file: {path}")
            candidate_data = destination.read_bytes()
            if (hashlib.sha256(candidate_data).hexdigest() == entry["oldSha256"]
                    and len(candidate_data) == entry["oldBytes"]):
                require(candidate_data == git(baseline_repo, "cat-file", "blob",
                                              f"{commit}:{path}"),
                        f"reviewed old bytes differ from pinned public Git object: {path}")
                states.add("old")
            elif (hashlib.sha256(candidate_data).hexdigest() == entry["newSha256"]
                    and len(candidate_data) == entry["newBytes"]):
                source_path = f"{reviewed_update.SOURCE_TREE_PATH}/{path}"
                require(candidate_data == git(source_repo, "cat-file", "blob",
                                              f"{reviewed_update.SOURCE_COMMIT}:{source_path}"),
                        f"reviewed new bytes differ from preserved source Git object: {path}")
                states.add("new")
            else:
                raise ValueError(f"reviewed artifact bytes are neither old nor new: {path}")
        require(len(states) == 1, "reviewed artifact contains a mixed old/new source state")
        update_mode = states.pop()

    entries = manifest["files"]
    require(isinstance(entries, list) and entries, "retained file list must not be empty")
    planned = {}
    for entry in entries:
        require(isinstance(entry, dict) and set(entry) in (
            {"path", "sha256", "bytes"},
            {"path", "sha256", "bytes", "replacesSourceSha256"}), "invalid retained file schema")
        path = safe_path(entry["path"])
        require(path not in planned, f"duplicate retained path: {path}")
        require(path not in update_by_path,
                f"path cannot be both retained and reviewed for update: {path}")
        require(path in baseline, f"retained file is not in pinned baseline: {path}")
        expected = digest(entry["sha256"], 64, "retained SHA-256")
        require(type(entry["bytes"]) is int and entry["bytes"] >= 0, "invalid retained byte count")
        data = git(baseline_repo, "cat-file", "blob", f"{commit}:{path}")
        require(hashlib.sha256(data).hexdigest() == expected and len(data) == entry["bytes"],
                f"retained bytes differ from receipt: {path}")
        destination = artifact / path
        for parent in destination.parents:
            if parent == artifact:
                break
            require(not parent.exists() or parent.is_dir(), f"retained parent is not a directory: {path}")
        require(not destination.exists() or destination.is_file(), f"retained path is not a file: {path}")
        if "replacesSourceSha256" in entry:
            old_sha = digest(entry["replacesSourceSha256"], 64, "superseded source SHA-256")
            require(destination.is_file(), f"superseded source is missing: {path}")
            current_sha = hashlib.sha256(destination.read_bytes()).hexdigest()
            require(current_sha in (old_sha, expected), f"superseded source changed: {path}")
        elif destination.is_file():
            require(destination.read_bytes() == data, f"retained file conflicts with source: {path}")
        planned[path] = data

    # Check *every* public baseline path, including those built from monorepo
    # source. Missing files or newer unexpected source edits cannot be hidden by
    # the retained subset. The publisher checks the current remote again later.
    for path, blob in baseline.items():
        if path in planned:
            data = planned[path]
        else:
            candidate = artifact / path
            require(candidate.is_file(), f"public baseline file is missing: {path}")
            data = candidate.read_bytes()
        if path in update_by_path and update_mode == "new":
            entry = update_by_path[path]
            source_path = f"{reviewed_update.SOURCE_TREE_PATH}/{path}"
            source_bytes = git(source_repo, "cat-file", "blob",
                               f"{reviewed_update.SOURCE_COMMIT}:{source_path}")
            require(data == source_bytes
                    and hashlib.sha256(data).hexdigest() == entry["newSha256"]
                    and len(data) == entry["newBytes"],
                    f"reviewed public update differs from preserved source bytes: {path}")
            continue
        require(git_blob_hash(data) == blob, f"public baseline file changed: {path}")

    for path, data in planned.items():
        destination = artifact / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    print(f"retain-published: verified {len(baseline)} public files at {commit}; "
          f"retained {len(planned)} exact files"
          + (f"; reviewed update state {update_mode}" if reviewed_update_path is not None else ""))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--baseline-repo", type=Path, required=True)
    parser.add_argument("--manifest", type=Path,
                        default=Path(__file__).with_name("published-baseline.json"))
    parser.add_argument("--reviewed-update", type=Path,
                        help="explicit receipt authorizing its exact two public file replacements")
    parser.add_argument("--source-repo", type=Path,
                        help="local Git clone containing the receipt's preserved source commit")
    args = parser.parse_args()
    try:
        retain(args.artifact, args.baseline_repo, args.manifest,
               args.reviewed_update, args.source_repo)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Do not echo subprocess stderr (which may include transport details).
        print(f"retain-published: error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
