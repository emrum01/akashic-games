"""Build and verify the approved Hon Lion sound palette.

The accepted audition masters in ``audio/approved-masters`` are the rendering
source of truth. FFmpeg is the only external dependency; inspection and
validation use the Python standard library. Delivery files are stereo, 48 kHz
Ogg Opus 112 kbps and AAC 160 kbps. Run ``--verify`` after a build to check
codec shape, duration, calibrated level, clipping, and room-texture gaps.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "audio" / "approved-masters"
OUT = ROOT / "app" / "assets" / "audio"
MANIFEST = MASTERS / "manifest.json"
RATE = 48_000
CHANNELS = 2
RUNTIME_MASTER_GAIN = 0.65
PRODUCTION_GAIN = 1 / RUNTIME_MASTER_GAIN
CODEC_DURATION_TOLERANCE = 0.04
RMS_TOLERANCE_DB = 0.5
SOUND_NAMES = ("room-texture", "key", "weapon-ready", "door", "presence", "discharge")
CODECS = (("ogg", "libopus", "112k"), ("m4a", "aac", "160k"))


def command(args: list[str], *, input_bytes: bytes | None = None) -> bytes:
    try:
        return subprocess.check_output(args, input=input_bytes, stderr=subprocess.PIPE)
    except FileNotFoundError as error:
        raise RuntimeError("ffmpeg and ffprobe are required to build the approved audio") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"command failed: {' '.join(args)}\n{detail}") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode(path: Path, *, samples: int | None = None) -> tuple[float, ...]:
    filters = [f"aformat=sample_rates={RATE}:channel_layouts=stereo"]
    if samples is not None:
        filters += [f"atrim=end_sample={samples}", "asetpts=N/SR/TB"]
    raw = command([
        "ffmpeg", "-v", "error", "-i", str(path), "-af", ",".join(filters),
        "-ar", str(RATE), "-ac", str(CHANNELS), "-f", "f32le", "-",
    ])
    if len(raw) % 4:
        raise RuntimeError(f"decoded PCM is not float32-aligned: {path}")
    values = struct.unpack(f"<{len(raw) // 4}f", raw)
    if not values or any(not math.isfinite(value) for value in values):
        raise RuntimeError(f"decoded PCM contains no finite samples: {path}")
    return values


def stats(values: tuple[float, ...]) -> dict[str, float]:
    rms = math.sqrt(sum(value * value for value in values) / len(values))
    peak = max(abs(value) for value in values)
    return {
        "rms_dbfs": 20 * math.log10(max(rms, 1e-12)),
        "peak_dbfs": 20 * math.log10(max(peak, 1e-12)),
        "peak": peak,
    }


def ffprobe(path: Path) -> dict[str, object]:
    raw = command([
        "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
        "stream=sample_rate,channels:format=duration", "-of", "json", str(path),
    ])
    payload = json.loads(raw)
    stream = payload.get("streams", [{}])[0]
    return {
        "sample_rate": int(stream.get("sample_rate", 0)),
        "channels": int(stream.get("channels", 0)),
        "duration": float(payload.get("format", {}).get("duration", 0)),
    }


def load_manifest() -> dict[str, object]:
    try:
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RuntimeError(f"missing approved master manifest: {MANIFEST}") from error


def validate_gain_metadata(manifest: dict[str, object]) -> tuple[float, float]:
    try:
        runtime_gain = float(manifest["runtime_master_gain"])
        production_gain = float(manifest["production_gain"])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("manifest gain calibration is incomplete") from error
    if not math.isfinite(runtime_gain) or not math.isfinite(production_gain) or runtime_gain <= 0 or production_gain <= 0:
        raise RuntimeError("manifest gains must be finite and positive")
    if abs(runtime_gain - RUNTIME_MASTER_GAIN) > 1e-9 or abs(production_gain - PRODUCTION_GAIN) > 1e-9:
        raise RuntimeError("manifest gain calibration does not match production constants")
    if abs(runtime_gain * production_gain - 1) > 1e-9:
        raise RuntimeError("runtime and production gains do not cancel")
    return runtime_gain, production_gain


def verify_runtime_calibration(manifest: dict[str, object], runtime_gain: float, production_gain: float) -> None:
    source = (ROOT / "app" / "sound.js").read_text(encoding="utf-8")
    if not re.search(r"const masterLevel = \.65\s*;", source):
        raise RuntimeError("runtime master gain is not .65")
    cue_levels = re.findall(r"(?:key|raygun|door|reveal|discharge):\s*Object\.freeze\(\{[^}]*?level:\s*([0-9.]+)", source, re.S)
    if len(cue_levels) != 5 or any(float(level) != 1 for level in cue_levels):
        raise RuntimeError(f"recorded cue gains are not unity: {cue_levels}")
    if not re.search(r"loop\s*\(\s*recorded\s*,\s*1\s*\)", source):
        raise RuntimeError("recorded room texture does not use unity gain")
    if not re.search(r"useRecordedTexture[\s\S]*?loop\s*\(\s*buffer\s*,\s*1\s*\)", source):
        raise RuntimeError("async recorded room texture does not use unity gain")
    if not re.search(r"loop\s*\(\s*buffer\s*,\s*\.5\s*\)", source):
        raise RuntimeError("offline fallback gain is no longer .5")
    if abs(runtime_gain - RUNTIME_MASTER_GAIN) > 1e-9:
        raise RuntimeError("manifest runtime master gain does not match renderer calibration")
    if abs(production_gain - PRODUCTION_GAIN) > 1e-9:
        raise RuntimeError("manifest production gain does not match renderer calibration")


def validate_manifest(manifest: dict[str, object]) -> dict[str, dict[str, object]]:
    runtime_gain, production_gain = validate_gain_metadata(manifest)
    verify_runtime_calibration(manifest, runtime_gain, production_gain)
    sounds = manifest.get("sounds")
    if not isinstance(sounds, dict) or set(sounds) != set(SOUND_NAMES):
        raise RuntimeError(f"manifest palette must contain exactly {SOUND_NAMES}")
    entries = {name: validate_entry_metadata(name, sounds[name]) for name in SOUND_NAMES}
    return {name: validate_master(name, entries[name]) for name in SOUND_NAMES}


def validate_entry_metadata(name: str, entry: object) -> dict[str, object]:
    if not isinstance(entry, dict):
        raise RuntimeError(f"{name}: manifest entry is not an object")
    required = ("master", "sha256", "duration_seconds", "gain")
    if any(field not in entry for field in required):
        raise RuntimeError(f"{name}: manifest entry is missing required fields")
    master = MASTERS / str(entry["master"])
    if not master.is_file():
        raise RuntimeError(f"missing approved master: {master}")
    if sha256(master) != str(entry["sha256"]):
        raise RuntimeError(f"{name}: approved master SHA-256 does not match manifest")
    try:
        duration = float(entry["duration_seconds"])
        gain = float(entry["gain"])
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"{name}: manifest duration/gain is invalid") from error
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(gain) or gain <= 0:
        raise RuntimeError(f"{name}: manifest duration/gain must be finite and positive")
    if abs(gain - PRODUCTION_GAIN) > 1e-9:
        raise RuntimeError(f"{name}: manifest gain does not match production calibration")
    return {"master": master, "duration_seconds": duration, "gain": gain}


def validate_master(name: str, entry: dict[str, object]) -> dict[str, object]:
    master = entry["master"]
    duration = float(entry["duration_seconds"])
    master_info = ffprobe(master)
    if master_info["sample_rate"] != RATE or master_info["channels"] != CHANNELS:
        raise RuntimeError(f"{name}: approved master is not stereo 48 kHz: {master_info}")
    if abs(float(master_info["duration"]) - duration) > 1e-6:
        raise RuntimeError(f"{name}: approved master duration does not match manifest")
    sample_count = round(duration * RATE)
    values = decode(master, samples=sample_count)
    expected_values = sample_count * CHANNELS
    if len(values) != expected_values:
        raise RuntimeError(f"{name}: expected {expected_values} samples, got {len(values)}")
    master_stats = stats(values)
    if master_stats["peak"] * PRODUCTION_GAIN >= 1:
        raise RuntimeError(f"{name}: production gain would clip the approved master")
    return {"name": name, "master": master, "duration_seconds": duration, "values": values, "stats": master_stats}


def render(master_data: dict[str, object]) -> dict[str, object]:
    name = str(master_data["name"])
    values = master_data["values"]
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        raw = Path(directory) / f"{name}.f32"
        # Apply 1/.65 here; the runtime Web Audio bus applies .65 once.
        raw.write_bytes(struct.pack(f"<{len(values)}f", *(value * PRODUCTION_GAIN for value in values)))
        for extension, codec, bitrate in CODECS:
            target = OUT / f"{name}.{extension}"
            command([
                "ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE),
                "-ac", str(CHANNELS), "-i", str(raw), "-map_metadata", "-1",
                "-c:a", codec, "-b:a", bitrate, str(target),
            ])
    return {"name": name, "master": Path(master_data["master"]).name, "duration_seconds": master_data["duration_seconds"], "master_stats": master_data["stats"]}


def verify_output(name: str, duration: float, master_stats: dict[str, float], extension: str) -> dict[str, object]:
    target = OUT / f"{name}.{extension}"
    if not target.is_file():
        raise RuntimeError(f"missing delivery asset: {target}")
    info = ffprobe(target)
    if info["sample_rate"] != RATE or info["channels"] != CHANNELS:
        raise RuntimeError(f"{name}.{extension}: expected stereo 48 kHz, got {info}")
    if abs(float(info["duration"]) - duration) > CODEC_DURATION_TOLERANCE:
        raise RuntimeError(f"{name}.{extension}: duration drift {info['duration']:.3f}s vs {duration:.3f}s")
    delivery_stats = stats(decode(target))
    calibrated_rms = delivery_stats["rms_dbfs"] + 20 * math.log10(RUNTIME_MASTER_GAIN)
    rms_delta = abs(calibrated_rms - master_stats["rms_dbfs"])
    if rms_delta > RMS_TOLERANCE_DB:
        raise RuntimeError(f"{name}.{extension}: calibrated RMS delta {rms_delta:.2f} dB")
    if delivery_stats["peak"] >= 1:
        raise RuntimeError(f"{name}.{extension}: encoded delivery clips")
    return {
        "duration_seconds": round(float(info["duration"]), 6),
        "rms_dbfs": round(calibrated_rms, 3),
        "peak_dbfs": round(delivery_stats["peak_dbfs"], 3),
        "rms_delta_db": round(rms_delta, 3),
    }


def verify(manifest: dict[str, object]) -> list[dict[str, object]]:
    masters = validate_manifest(manifest)
    report: list[dict[str, object]] = []
    for name in SOUND_NAMES:
        master = masters[name]
        outputs = {}
        for extension, _codec, _bitrate in CODECS:
            outputs[extension] = verify_output(name, float(master["duration_seconds"]), master["stats"], extension)
        report.append({"name": name, "master_rms_dbfs": round(master["stats"]["rms_dbfs"], 3), "outputs": outputs})
    room = masters["room-texture"]["values"]
    window = RATE // 10 * CHANNELS
    silent_windows = sum(1 for offset in range(0, len(room) - window + 1, window) if stats(room[offset:offset + window])["rms_dbfs"] < -90)
    if silent_windows < 5:
        raise RuntimeError(f"room texture has only {silent_windows} verified silent 100 ms gaps")
    return [{"gain_calibration": {"runtime_master_gain": RUNTIME_MASTER_GAIN, "production_gain": PRODUCTION_GAIN, "silent_100ms_windows": silent_windows}}, *report]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=SOUND_NAMES)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    manifest = load_manifest()
    if args.verify:
        print(json.dumps(verify(manifest), ensure_ascii=False, indent=2))
        return
    masters = validate_manifest(manifest)
    selected = [args.only] if args.only else list(SOUND_NAMES)
    print(json.dumps([render(masters[name]) for name in selected], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(str(error)) from error
