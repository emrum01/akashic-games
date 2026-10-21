#!/usr/bin/env python3
"""Reproducible, source-preserving media optimization for static games.

The command operates on a build staging directory. It never writes to the
source tree and only publishes a report after every asset has been verified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any


SCHEMA = "akashic-media-optimization-v1"
MEDIA_SUFFIXES = {".mp4", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".webm", ".mov", ".avif"}
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".txt"}


class PipelineError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise PipelineError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def command_version(command: str, args: list[str]) -> str:
    try:
        result = subprocess.run([command, *args], check=True, capture_output=True, text=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        fail(f"required media tool unavailable: {command}: {exc}")
    text = (result.stdout or result.stderr).strip().splitlines()
    return text[0] if text else f"{command} (version unavailable)"


def run(command: list[str]) -> None:
    try:
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = getattr(exc, "stderr", b"")
        if isinstance(detail, bytes):
            detail = detail.decode("utf-8", "replace")
        tail = "\n".join(str(detail).splitlines()[-8:])
        fail(f"media tool failed ({' '.join(command)}):\n{tail}")


def load_config(config_path: Path) -> dict[str, Any]:
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read media optimization config {config_path}: {exc}")
    if config.get("schema") != SCHEMA:
        fail(f"unsupported media config schema: {config.get('schema')!r}")
    if not isinstance(config.get("assets"), list) or not config["assets"]:
        fail("media config must define a non-empty assets list")
    manifests = config.get("manifests")
    if not isinstance(manifests, list):
        fail("media config must define a manifests list")
    if not isinstance(config.get("recipes"), dict):
        fail("media config must define recipes")
    budgets = config.get("budgets")
    if not isinstance(budgets, dict):
        fail("media config must define budgets")
    for key in ("total_bytes", "video_bytes", "image_bytes", "video_asset_bytes", "image_asset_bytes"):
        if not isinstance(budgets.get(key), int) or budgets[key] <= 0:
            fail(f"media budget {key} must be a positive integer")
    for item in config["assets"]:
        if not isinstance(item, dict) or not isinstance(item.get("glob"), str) or not isinstance(item.get("kind"), str):
            fail("each media asset rule needs string glob and kind")
        glob = item["glob"]
        parts = PurePosixPath(glob).parts
        if not glob or glob.startswith("/") or "\\" in glob or any(char in glob for char in "?[]") or any("**" in part and part != "**" for part in parts):
            fail(f"invalid media asset glob: {glob!r}")
        if item["kind"] not in {"video", "jpeg", "png"}:
            fail(f"unsupported media asset kind: {item['kind']!r}")
        recipe = item.get("recipe", item["kind"])
        if recipe not in config["recipes"]:
            fail(f"media asset rule references unknown recipe: {recipe!r}")
    seen_manifests: set[tuple[str, str]] = set()
    for item in manifests:
        if not isinstance(item, dict) or not isinstance(item.get("glob"), str) or not isinstance(item.get("media_root"), str):
            fail("each media manifest rule needs string glob and media_root")
        glob = item["glob"]
        media_root = PurePosixPath(item["media_root"])
        parts = PurePosixPath(glob).parts
        if not glob or glob.startswith("/") or "\\" in glob or ".." in parts or any(char in glob for char in "?[]") or any("**" in part and part != "**" for part in parts):
            fail(f"invalid media manifest glob: {glob!r}")
        if not item["media_root"] or media_root.is_absolute() or ".." in media_root.parts or "." in media_root.parts:
            fail(f"invalid media manifest media_root: {item['media_root']!r}")
        identity = (glob, media_root.as_posix())
        if identity in seen_manifests:
            fail(f"duplicate media manifest rule: {glob!r} / {item['media_root']!r}")
        seen_manifests.add(identity)
        item["media_root"] = media_root.as_posix()
    return config


def resolve_assets(source: Path, config: dict[str, Any]) -> list[dict[str, Any]]:
    matched: dict[str, dict[str, Any]] = {}
    for rule in config["assets"]:
        pattern = rule["glob"]
        for path in source.glob(pattern):
            if not path.is_file():
                continue
            try:
                path.resolve().relative_to(source.resolve())
            except ValueError:
                fail(f"media asset symlink escapes source directory: {path}")
            rel = path.relative_to(source).as_posix()
            if rel in matched:
                fail(f"media asset matched multiple rules: {rel}")
            matched[rel] = {"path": path, "rel": rel, "kind": rule["kind"], "recipe": rule.get("recipe", rule["kind"])}
    if not matched:
        fail("media config matched no assets")
    for path in source.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in MEDIA_SUFFIXES:
            continue
        rel = path.relative_to(source).as_posix()
        if rel not in matched:
            fail(f"unsupported or unoptimized media asset: {rel}")
    return [matched[key] for key in sorted(matched)]


def safe_destination(root: Path, relative_path: str) -> Path:
    destination = (root / relative_path).resolve()
    root_resolved = root.resolve()
    if destination != root_resolved and root_resolved not in destination.parents:
        fail(f"media path escapes output directory: {relative_path}")
    return destination


def ffprobe(path: Path, ffprobe_command: str) -> dict[str, Any]:
    try:
        result = subprocess.run(
            [ffprobe_command, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        fail(f"cannot inspect media {path}: {exc}")


def rational(value: Any) -> float | None:
    if not isinstance(value, str) or "/" not in value:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    numerator, denominator = value.split("/", 1)
    try:
        if float(denominator) == 0:
            return None
        return float(numerator) / float(denominator)
    except ValueError:
        return None


def verify_video(source: Path, output: Path, ffprobe_command: str) -> dict[str, Any]:
    before = ffprobe(source, ffprobe_command)
    after = ffprobe(output, ffprobe_command)
    before_streams = before.get("streams", [])
    after_streams = after.get("streams", [])
    before_video = next((item for item in before_streams if item.get("codec_type") == "video"), None)
    after_video = next((item for item in after_streams if item.get("codec_type") == "video"), None)
    if not before_video or not after_video:
        fail(f"video has no video stream: {source}")
    # FFprobe labels full-range 8-bit 4:2:0 as yuvj420p. Preserve its range.
    if after_video.get("codec_name") != "h264" or after_video.get("pix_fmt") not in {"yuv420p", "yuvj420p"}:
        fail(f"public video must be H.264 with 8-bit 4:2:0 pixels: {output}")
    for key in ("width", "height"):
        if before_video.get(key) != after_video.get(key):
            fail(f"video {key} changed for {source}: {before_video.get(key)} -> {after_video.get(key)}")
    before_rate = rational(before_video.get("avg_frame_rate") or before_video.get("r_frame_rate"))
    after_rate = rational(after_video.get("avg_frame_rate") or after_video.get("r_frame_rate"))
    if before_rate is None or after_rate is None or abs(before_rate - after_rate) > 0.0001:
        fail(f"video frame rate changed for {source}: {before_rate} -> {after_rate}")
    if before_video.get("nb_frames") and after_video.get("nb_frames") and before_video["nb_frames"] != after_video["nb_frames"]:
        fail(f"video frame count changed for {source}")
    before_duration = rational(before_video.get("duration") or before.get("format", {}).get("duration"))
    after_duration = rational(after_video.get("duration") or after.get("format", {}).get("duration"))
    if before_duration is None or after_duration is None or abs(before_duration - after_duration) > 0.08:
        fail(f"video duration changed for {source}: {before_duration} -> {after_duration}")
    before_audio = [item for item in before_streams if item.get("codec_type") == "audio"]
    after_audio = [item for item in after_streams if item.get("codec_type") == "audio"]
    if len(before_audio) != len(after_audio):
        fail(f"video audio stream count changed for {source}")
    for before_item, after_item in zip(before_audio, after_audio):
        if before_item.get("codec_name") != after_item.get("codec_name"):
            fail(f"video audio codec changed for {source}")
    return {"width": before_video.get("width"), "height": before_video.get("height"), "frame_rate": before_rate, "duration": before_duration, "audio_streams": len(before_audio)}


def verify_image(source: Path, output: Path, ffprobe_command: str) -> dict[str, Any]:
    before = ffprobe(source, ffprobe_command)
    after = ffprobe(output, ffprobe_command)
    before_video = next((item for item in before.get("streams", []) if item.get("codec_type") == "video"), None)
    after_video = next((item for item in after.get("streams", []) if item.get("codec_type") == "video"), None)
    if not before_video or not after_video or before_video.get("width") != after_video.get("width") or before_video.get("height") != after_video.get("height"):
        fail(f"image dimensions changed for {source}")
    return {"width": before_video.get("width"), "height": before_video.get("height")}


def cache_paths(cache_dir: Path, key: str, extension: str) -> tuple[Path, Path]:
    return cache_dir / f"{key}{extension}", cache_dir / f"{key}.json"


def cache_read(cache_file: Path, metadata_file: Path, expected: dict[str, Any]) -> bool:
    if not cache_file.is_file() or not metadata_file.is_file():
        return False
    try:
        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    for key in ("schema", "key", "source_sha256", "recipe"):
        if metadata.get(key) != expected.get(key):
            return False
    if not isinstance(metadata.get("output_sha256"), str) or not isinstance(metadata.get("output_bytes"), int):
        return False
    return metadata.get("output_sha256") == sha256(cache_file) and metadata.get("output_bytes") == cache_file.stat().st_size


def cache_write(cache_file: Path, metadata_file: Path, output: Path, metadata: dict[str, Any]) -> None:
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache_file.with_name(f".{cache_file.name}.tmp-{os.getpid()}")
    shutil.copyfile(output, temporary)
    os.replace(temporary, cache_file)
    metadata_file.write_text(f"{canonical(metadata)}\n", encoding="utf-8")


def optimize_one(item: dict[str, Any], output_root: Path, cache_dir: Path, config: dict[str, Any], tools: dict[str, str]) -> dict[str, Any]:
    source: Path = item["path"]
    rel = item["rel"]
    recipe_name = item["recipe"]
    recipe = config["recipes"][recipe_name]
    source_hash = sha256(source)
    recipe_identity = {"name": recipe_name, "settings": recipe, "toolchain": tools["versions"], "pipeline_sha256": config["_pipeline_sha256"]}
    key = hashlib.sha256((source_hash + canonical(recipe_identity)).encode()).hexdigest()
    extension = ".webp" if item["kind"] == "png" else source.suffix.lower()
    output_rel = f"{rel[:-len(source.suffix)]}{extension}" if item["kind"] == "png" else rel
    destination = safe_destination(output_root, output_rel)
    cache_file, metadata_file = cache_paths(cache_dir, key, extension)
    metadata = {"schema": SCHEMA, "key": key, "source_sha256": source_hash, "recipe": recipe_identity, "output_sha256": None, "output_bytes": None}
    cache_hit = cache_read(cache_file, metadata_file, metadata)
    temporary = destination.with_name(f".{destination.stem}.tmp-{os.getpid()}{destination.suffix}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    dimensions: dict[str, Any]
    source_kept = False
    if cache_hit:
        shutil.copyfile(cache_file, temporary)
        os.replace(temporary, destination)
        dimensions = verify_video(source, destination, tools["commands"]["ffprobe"]) if item["kind"] == "video" else verify_image(source, destination, tools["commands"]["ffprobe"])
    else:
        if item["kind"] == "video":
            run([tools["commands"]["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-map", "0", "-c:v", "libx264", "-preset", str(recipe["preset"]), "-crf", str(recipe["crf"]), "-pix_fmt", str(recipe["pix_fmt"]), "-c:a", "copy", "-c:s", "copy", "-movflags", str(recipe["movflags"]), str(temporary)])
            dimensions = verify_video(source, temporary, tools["commands"]["ffprobe"])
        elif item["kind"] == "jpeg":
            run([tools["commands"]["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-frames:v", "1", "-q:v", str(recipe["quality"]), "-map_metadata", "0", str(temporary)])
            dimensions = verify_image(source, temporary, tools["commands"]["ffprobe"])
        else:
            run([tools["commands"]["cwebp"], "-quiet", "-lossless", "-exact", "-m", str(recipe["method"]), str(source), "-o", str(temporary)])
            dimensions = verify_image(source, temporary, tools["commands"]["ffprobe"])
        can_keep_video = item["kind"] == "video" and any(
            stream.get("codec_type") == "video" and stream.get("codec_name") == "h264" and stream.get("pix_fmt") in {"yuv420p", "yuvj420p"}
            for stream in ffprobe(source, tools["commands"]["ffprobe"]).get("streams", [])
        )
        if can_keep_video and temporary.stat().st_size >= source.stat().st_size:
            # Keep the source codec when re-encoding would grow the file, but
            # still remux it so the public MP4 retains faststart ordering.
            run([tools["commands"]["ffmpeg"], "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-map", "0", "-c", "copy", "-movflags", str(recipe["movflags"]), str(temporary)])
            source_kept = True
            dimensions = verify_video(source, temporary, tools["commands"]["ffprobe"])
        elif item["kind"] == "jpeg" and temporary.stat().st_size >= source.stat().st_size:
            shutil.copyfile(source, temporary)
            source_kept = True
            dimensions = verify_image(source, temporary, tools["commands"]["ffprobe"])
        os.replace(temporary, destination)
        metadata["output_sha256"] = sha256(destination)
        metadata["output_bytes"] = destination.stat().st_size
        cache_write(cache_file, metadata_file, destination, metadata)
    if item["kind"] == "png":
        source_output = safe_destination(output_root, rel)
        if source_output.exists():
            source_output.unlink()
    return {"source": rel, "output": output_rel, "kind": item["kind"], "recipe": recipe_name, "source_bytes": source.stat().st_size, "output_bytes": destination.stat().st_size, "source_sha256": source_hash, "output_sha256": sha256(destination), "cache_key": key, "cache_hit": cache_hit, "source_kept": source_kept, "dimensions": dimensions}


def rewrite_png_references(output_root: Path, png_records: list[dict[str, Any]], revision: str) -> None:
    replacements = {f"./{item['source']}": f"./{item['output']}" for item in png_records}
    tails = r"(?P<tail>(?:\?[^\"'`\s),<>#]*)?(?:#[^\"'`\s),<>]*)?)"
    for path in output_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8")
        updated = text
        for source, target in replacements.items():
            def rewrite(match: re.Match[str]) -> str:
                tail = match.group("tail") or ""
                if tail.startswith("?"):
                    parts = tail.split("#", 1)
                    query = parts[0]
                    query_parts = query[1:].split("&")
                    if any(part.startswith("v=") for part in query_parts):
                        query_parts = [f"v={revision}" if part.startswith("v=") else part for part in query_parts]
                    else:
                        query_parts.append(f"v={revision}")
                    tail = "?" + "&".join(query_parts) + (("#" + parts[1]) if len(parts) == 2 else "")
                elif tail.startswith("#"):
                    tail = f"?v={revision}{tail}"
                else:
                    tail = f"?v={revision}"
                return target + tail

            updated = re.sub(re.escape(source) + tails + r"(?![A-Za-z0-9_.-])", rewrite, updated)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
    for path in output_root.rglob("*"):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES and "./assets/" in path.read_text(encoding="utf-8"):
            text = path.read_text(encoding="utf-8")
            if any(re.search(re.escape(f"./{item['source']}") + r"(?![A-Za-z0-9_.-])", text) for item in png_records):
                fail(f"stale PNG reference remains in output: {path}")


MANIFEST_MEDIA_SUFFIXES = {".mp4", ".jpg", ".jpeg", ".webp", ".png"}


def manifest_media_target(value: str, output_root: Path, media_root: Path) -> tuple[Path, str] | None:
    reference = re.split(r"[?#]", value, maxsplit=1)[0]
    if not reference or reference.startswith(("http://", "https://", "data:")):
        return None
    if Path(reference).suffix.lower() not in MANIFEST_MEDIA_SUFFIXES:
        return None
    if "\\" in reference or reference.startswith("/"):
        fail(f"invalid runtime manifest media path: {value!r}")
    explicit = reference.startswith("./")
    relative_reference = reference[2:] if explicit else reference
    candidate = (output_root / relative_reference) if explicit else (media_root / relative_reference)
    candidate = candidate.resolve()
    root_resolved = output_root.resolve()
    media_root_resolved = media_root.resolve()
    if root_resolved != candidate and root_resolved not in candidate.parents:
        fail(f"runtime manifest media path escapes public root: {value!r}")
    if media_root_resolved != candidate and media_root_resolved not in candidate.parents:
        fail(f"runtime manifest media path escapes media_root: {value!r}")
    return candidate, candidate.relative_to(media_root_resolved).as_posix()


def update_manifests(output_root: Path, records: list[dict[str, Any]], config: dict[str, Any], recipe_identity: dict[str, Any]) -> None:
    by_output = {Path(item["output"]).as_posix(): item for item in records}
    matched: dict[str, tuple[Path, dict[str, Any]]] = {}
    for rule in config["manifests"]:
        paths = sorted(path for path in output_root.glob(rule["glob"]) if path.is_file())
        if not paths:
            fail(f"media manifest rule matched no files: {rule['glob']}")
        media_root = (output_root / rule["media_root"]).resolve()
        for path in paths:
            relative_path = path.relative_to(output_root).as_posix()
            if relative_path in matched:
                fail(f"media manifest matched multiple rules: {relative_path}")
            matched[relative_path] = (media_root, rule)
    for relative_path in sorted(matched):
        manifest_path = output_root / relative_path
        media_root, _rule = matched[relative_path]
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            fail(f"invalid runtime manifest {manifest_path}: {exc}")
        references: dict[str, Path] = {}

        def collect(value: Any) -> None:
            if isinstance(value, dict):
                for nested in value.values():
                    collect(nested)
            elif isinstance(value, list):
                for nested in value:
                    collect(nested)
            elif isinstance(value, str):
                target = manifest_media_target(value, output_root, media_root)
                if target:
                    path, key = target
                    references[key] = path

        collect({key: value for key, value in manifest.items() if key not in {"media_sha256", "asset_revision"}})
        hashes: dict[str, str] = {}
        for key in sorted(references):
            path = references[key]
            output_key = path.relative_to(output_root.resolve()).as_posix()
            record = by_output.get(output_key)
            if not record:
                fail(f"runtime manifest references media outside optimization records: {manifest_path.name}: {key}")
            if not path.is_file():
                fail(f"runtime manifest references missing media: {manifest_path.name}: {key}")
            hashes[key] = record["output_sha256"]
        manifest["media_sha256"] = hashes
        manifest["asset_revision"] = hashlib.sha256(canonical({"media_sha256": hashes, "recipe": recipe_identity}).encode()).hexdigest()
        manifest_path.write_text(f"{json.dumps(manifest, ensure_ascii=False, indent=2)}\n", encoding="utf-8")


def optimize(args: argparse.Namespace) -> dict[str, Any]:
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    config_path = Path(args.config).resolve()
    cache_dir = Path(args.cache_dir).resolve()
    report_path = Path(args.report).resolve()
    def overlaps(left: Path, right: Path) -> bool:
        return left == right or left in right.parents or right in left.parents

    for left_name, left in (("source", source), ("output", output), ("cache", cache_dir), ("report", report_path)):
        for right_name, right in (("source", source), ("output", output), ("cache", cache_dir), ("report", report_path)):
            if left_name < right_name and overlaps(left, right):
                fail(f"media paths overlap unsafely: {left_name}={left} {right_name}={right}")
    if not source.is_dir() or not output.is_dir():
        fail("source and output must be existing directories")
    for tree in (source, output):
        if any(path.is_symlink() for path in tree.rglob("*")):
            fail("symlinks are not supported in media source or staging trees")
    config = load_config(config_path)
    config["_pipeline_sha256"] = sha256(Path(__file__).resolve())
    tool_cfg = config.get("tools", {})
    commands = {"ffmpeg": tool_cfg.get("ffmpeg", "ffmpeg"), "ffprobe": tool_cfg.get("ffprobe", "ffprobe"), "cwebp": tool_cfg.get("cwebp", "cwebp")}
    versions = {name: command_version(command, ["-version"]) for name, command in commands.items()}
    config_hash = sha256(config_path)
    assets = resolve_assets(source, config)
    records = [optimize_one(item, output, cache_dir, config, {"commands": commands, "versions": versions}) for item in assets]
    recipe_identity = {"recipes": config["recipes"], "toolchain": versions, "pipeline_sha256": config["_pipeline_sha256"]}
    global_revision = hashlib.sha256(canonical({"assets": [(item["output"], item["output_sha256"]) for item in records], "recipe": recipe_identity}).encode()).hexdigest()
    rewrite_png_references(output, [item for item in records if item["kind"] == "png"], global_revision)
    update_manifests(output, records, config, recipe_identity)
    total = sum(item["output_bytes"] for item in records)
    source_total = sum(item["source_bytes"] for item in records)
    video_total = sum(item["output_bytes"] for item in records if item["kind"] == "video")
    image_total = sum(item["output_bytes"] for item in records if item["kind"] in {"jpeg", "png"})
    budgets = config["budgets"]
    if total > budgets["total_bytes"]:
        fail(f"optimized media exceeds total budget: {total} > {budgets['total_bytes']}")
    if video_total > budgets["video_bytes"]:
        fail(f"optimized video exceeds budget: {video_total} > {budgets['video_bytes']}")
    if image_total > budgets["image_bytes"]:
        fail(f"optimized images exceed budget: {image_total} > {budgets['image_bytes']}")
    for item in records:
        limit = budgets["video_asset_bytes"] if item["kind"] == "video" else budgets["image_asset_bytes"]
        if item["output_bytes"] > limit:
            fail(f"optimized asset exceeds per-file budget: {item['output']} ({item['output_bytes']} > {limit})")
    report = {"schema": SCHEMA, "config_sha256": config_hash, "toolchain": versions, "recipe_identity": recipe_identity, "asset_revision": global_revision, "budgets": budgets, "totals": {"assets": len(records), "source_bytes": source_total, "output_bytes": total, "saved_bytes": source_total - total, "saved_percent": round((source_total - total) / source_total * 100, 3) if source_total else 0, "video_bytes": video_total, "image_bytes": image_total}, "assets": records}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(f"{json.dumps(report, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        report = optimize(args)
    except PipelineError as exc:
        print(f"media optimization failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report["totals"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
