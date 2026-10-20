"""Render the CC0 sound palette. Requires ffmpeg; source previews stay private.

Run from any directory: python3 scripts/build-audio.py
The deployed assets use neutral names so filenames do not reveal the mystery.
"""
from array import array
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
    source = next(SOURCE.glob(f"*-{sound_id}.mp3"))
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


# Only dry, discrete scratch clusters. The untouched stretches are digital zero:
# no fire bed, wet layer, low drone, or crossfade connecting the gaps.
scratch = decode(477710, "atrim=0.17:0.7,highpass=f=900:p=2,lowpass=f=6500,agate=threshold=0.012:ratio=6:attack=2:release=12")
crunch = decode(816237, "atrim=0.025:0.22,highpass=f=1000:p=2,lowpass=f=6500")
scratch = fade(normalized(scratch, -22, -7), .006, .035)
crunch = fade(normalized(crunch, -22, -7), .004, .035)
# Add one second of silence between each cluster, including the loop boundary.
# Five clusters in 26 seconds; their sound, length and relative levels stay intact.
texture = mix(26, [
    (scratch, .4, .9), (crunch, .96, .6),
    (crunch, 5.1, .85), (crunch, 5.39, .6),
    (scratch, 10.9, .8),
    (crunch, 15.1, .7), (crunch, 15.35, .9), (crunch, 15.61, .55),
    (scratch, 20.8, .85), (crunch, 21.35, .65),
])
key = decode(650513, "atrim=0.08:0.75,highpass=f=500,lowpass=f=8000")
weapon = decode(182252, "atrim=0.06:0.45,highpass=f=220,lowpass=f=7500,apad=pad_dur=0.06")
lock = decode(342710, "highpass=f=180,lowpass=f=5200,apad=pad_dur=0.08")
wood = decode(590151, "highpass=f=110,lowpass=f=3300")
door = mix(2.95, [(normalized(lock, -25, -10), 0, .45),
                  (normalized(wood, -24, -9), .08, 1)])
# This is an event sting, never an ambient bed. It plays once at the visible reveal.
presence = decode(271945, "atrim=0.12:1.75,highpass=f=250,lowpass=f=7000,afade=t=out:st=1.3:d=0.33")
# Retain the cannon's initial impact and energy trail, compressed in time, not pitch.
plasma = decode(567308, "atempo=1.7,highpass=f=120,lowpass=f=8500")
burst = decode(539972, "atrim=0:0.21,highpass=f=900,lowpass=f=7500")
shot = mix(1.34, [(normalized(plasma, -16, -3), 0, 1),
                  (normalized(burst, -20, -5), .015, .45)])
report = [
    # Account for the added silence so RMS normalization does not boost the bursts.
    render("room-texture", texture, -29 - 10 * math.log10(26 / 21), -7, loop=True),
    render("key", key, -19, -4),
    render("weapon-ready", weapon, -18, -4),
    render("door", door, -24, -7),
    render("presence", presence, -21, -6),
    render("discharge", shot, -15.5, -2.5),
]
print(json.dumps(report, ensure_ascii=False, indent=2))
