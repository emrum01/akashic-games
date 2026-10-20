# Checkpoint capture

This harness records the approved rear-corridor checkpoint cuts and finalizes the public media contract. It loads the scene from `SCENE_SOURCE`, hashes the bytes fetched by the browser, and refuses to finalize if that hash differs from the scene manifest identity.

Run the preview server with a new empty output directory:

```sh
CAPTURE_OUTPUT=/private/tmp/checkpoint-output \
CAPTURE_PORT=8848 \
SCENE_SOURCE=/absolute/path/to/rear-corridor \
PADLOCK_ASSET=/absolute/path/to/rusty-padlock.glb \
node scripts/capture-checkpoints/server.mjs
```

In another terminal, capture both profiles. `PLAYWRIGHT_MODULE` is only needed when Playwright is installed outside this game package.

```sh
CAPTURE_OUTPUT=/private/tmp/checkpoint-output \
CAPTURE_PORT=8848 \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node scripts/capture-checkpoints/capture-runner.mjs
python3 scripts/capture-checkpoints/verify-capture.py /private/tmp/checkpoint-output
```

`CAPTURE_RECOVERY=affected-routes` records only the poster-bound reverse route and cabinet-to-door route. `CAPTURE_PROFILES=wide` or `portrait` selects one profile for a bounded recapture, followed by normal finalization.

The final public directory contains only JPG, MP4, and `checkpoint-manifest.json`. Capture evidence belongs under this script directory; it may contain source paths and licensed-asset hashes and must not be copied into `app/assets/video`.
