# EAR SCOPE — Credits and provenance

## ImageGen assets

All files in `assets/generated/` were supplied as ImageGen outputs for this task and copied without deleting the source files. The source paths, dimensions, prompt summaries, selection decisions, and runtime uses are recorded in [design/generation-manifest.json](design/generation-manifest.json). The three supplied concepts and the phone / ear-scope reference are stored under `design/references/` for traceability.

## Runtime audio

The current liminal slice does not load external audio files. Its `VIDEO`, `INNER`, `CONTACT`, `WAX_REMOVE`, `WALL`, `LIMINAL`, `UI`, and `WEAPON` cues are small Web Audio oscillator / gain / envelope syntheses authored in `game.js`. This avoids inventing a third-party sound license or claiming an audio source that is not used. The older `assets/door.ogg` and `assets/heartbeat.wav` are retained from the previous slice but are not referenced by the current runtime.

## Software

- Three.js UMD build: local vendored `vendor/three.min.js`, retained from the existing project asset set. It is loaded with a relative script path; no CDN is used.
- Browser QA: existing Python Playwright installation and local Chromium / Google Chrome executable. QA launch flags are documented in `verify/playwright_verify.py` because this managed sandbox blocks normal Chromium process startup.
