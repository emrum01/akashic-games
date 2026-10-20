"""Render the CC0 sound palette. Requires ffmpeg; source previews stay private.

Run from any directory: python3 scripts/build-audio.py [--only room-texture]
The deployed assets use neutral names so filenames do not reveal the mystery.
"""
from array import array
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "audio/source-freesound"
OUT = ROOT / "app/assets/audio"
RATE = 48000


def decode(sound_id, filters="anull"):
    source = next(SOURCE.glob(f"*-{sound_id}.mp3"), None)
    if source is None:
        raise FileNotFoundError(f"Missing source *-{sound_id}.mp3 in {SOURCE}; see audio/CREDITS.md")
    data = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(source), "-af", filters,
        "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-",
    ])
    pcm = array("f")
    pcm.frombytes(data)
    return pcm


def normalized(pcm, rms_db, peak_db):
    target = 10 ** (rms_db / 20)
    ceiling = 10 ** (peak_db / 20)
    # Catch sharp recording clicks before RMS matching. A peak-only gain change
    # made the first texture draft inaudible (-51.6 dBFS).
    for _ in range(4):
        rms = math.sqrt(sum(x * x for x in pcm) / len(pcm))
        gain = target / max(rms, 1e-9)
        pcm = array("f", (ceiling * math.tanh(x * gain / ceiling) for x in pcm))
    return pcm


def fade(pcm, attack=.008, release=.05):
    for i in range(min(len(pcm), int(attack * RATE))):
        pcm[i] *= i / max(1, int(attack * RATE))
    for i in range(min(len(pcm), int(release * RATE))):
        pcm[-1-i] *= i / max(1, int(release * RATE))
    return pcm


def mix(seconds, layers):
    result = array("f", [0]) * round(seconds * RATE)
    for pcm, start, level in layers:
        offset = round(start * RATE)
        for i, value in enumerate(pcm[:len(result) - offset]):
            result[offset + i] += value * level
    return result


def render(name, pcm, rms_db, peak_db, loop=False):
    pcm = normalized(pcm, rms_db, peak_db)
    if not loop:
        fade(pcm)
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        raw = Path(directory) / "mix.f32"
        raw.write_bytes(pcm.tobytes())
        for extension, codec, bitrate in [("ogg", "libopus", "112k"), ("m4a", "aac", "160k")]:
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE),
                "-ac", "1", "-i", str(raw), "-map_metadata", "-1", "-c:a", codec,
                "-b:a", bitrate, str(OUT / f"{name}.{extension}"),
            ], check=True)
    return {
        "file": name, "seconds": round(len(pcm) / RATE, 3),
        "rms_dbfs": round(20 * math.log10(math.sqrt(sum(x*x for x in pcm) / len(pcm))), 2),
        "peak_dbfs": round(20 * math.log10(max(abs(x) for x in pcm)), 2),
    }


def room_texture():
    # Five gnawing clusters with quieter movement under or after each bite.
    # Nothing connects the clusters: gaps and the loop boundary stay digital zero.
    chews = [
        fade(normalized(decode(382673, f"atrim={start}:{end},highpass=f=280:p=2,lowpass=f=6500"), -22, -7), .008, .04)
        for start, end in [(.35, .8), (1.58, 2.05), (2.56, 3.05), (4.1, 4.55), (4.38, 4.86)]
    ]
    scratch = decode(477710, "atrim=0.17:0.7,highpass=f=900:p=2,lowpass=f=6500,agate=threshold=0.012:ratio=6:attack=2:release=12")
    crunch = decode(816237, "atrim=0.025:0.22,highpass=f=600:p=2,lowpass=f=6500")
    scratch = fade(normalized(scratch, -28, -10), .012, .06)
    crunch = fade(normalized(crunch, -25, -9), .004, .035)
    return mix(26, [
        (chews[0], .4, 1), (crunch, .43, .65), (scratch, .65, .8),
        (chews[1], 5.1, .9), (crunch, 5.12, .75), (crunch, 5.43, .5), (scratch, 5.34, .7),
        (chews[2], 10.9, 1), (crunch, 10.94, .7), (scratch, 11.12, .9),
        (chews[3], 15.1, .9), (crunch, 15.13, .8), (crunch, 15.43, .5), (scratch, 15.35, .7),
        (chews[4], 20.8, .95), (crunch, 20.83, .65), (scratch, 21.05, .85),
    ])


def door_sound():
    lock = decode(342710, "highpass=f=180,lowpass=f=5200,apad=pad_dur=0.08")
    wood = decode(590151, "highpass=f=110,lowpass=f=3300")
    return mix(2.95, [(normalized(lock, -25, -10), 0, .45),
                     (normalized(wood, -24, -9), .08, 1)])


def discharge():
    # Retain the initial impact and energy trail, compressed in time, not pitch.
    plasma = decode(567308, "atempo=1.7,highpass=f=120,lowpass=f=8500")
    burst = decode(539972, "atrim=0:0.21,highpass=f=900,lowpass=f=7500")
    return mix(1.34, [(normalized(plasma, -16, -3), 0, 1),
                     (normalized(burst, -20, -5), .015, .45)])


# Defer decoding until after selection so --only needs only that sound's sources.
PALETTE = {
    "room-texture": (room_texture, -29 - 10 * math.log10(26 / 21), -7, True),
    "key": (lambda: decode(650513, "atrim=0.08:0.75,highpass=f=500,lowpass=f=8000"), -19, -4, False),
    "weapon-ready": (lambda: decode(182252, "atrim=0.06:0.45,highpass=f=220,lowpass=f=7500,apad=pad_dur=0.06"), -18, -4, False),
    "door": (door_sound, -24, -7, False),
    # An event sting at the visible reveal, never an ambient bed.
    "presence": (lambda: decode(271945, "atrim=0.12:1.75,highpass=f=250,lowpass=f=7000,afade=t=out:st=1.3:d=0.33"), -21, -6, False),
    "discharge": (discharge, -15.5, -2.5, False),
}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=PALETTE)
    args = parser.parse_args(argv)
    selected = [args.only] if args.only else PALETTE
    report = []
    try:
        for name in selected:
            build, rms_db, peak_db, loop = PALETTE[name]
            report.append(render(name, build(), rms_db, peak_db, loop))
    except FileNotFoundError as error:
        parser.error(str(error))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
