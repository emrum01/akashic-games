# Cupboard reward capture

The approved room is read-only. This harness adds the lamp key, animated cabinet doors, licensed padlock, fitted hasp, Tripo gun, and separate room key for local video rendering. The game receives only the rendered MP4/JPEG media.

## Padlock sources and preparation

- Mesh: [Animated Padlock & Key Pack](https://raulleonvalero.itch.io/animated-padlock-key-pack-game-ready-3d-assets), raulleonvalero. Download `candado.blend` using the free option. Personal/commercial projects and modification are allowed; re-uploading the original or modified model is prohibited. Keep the model and derivative GLB outside the repository and public asset directory.
- Rust: [Rusty Metal 05](https://polyhaven.com/a/rusty_metal_05), Amal Kumar, CC0. Fetch the 1K JPG Diffuse, Rough and Normal (GL) maps using the official [file metadata](https://api.polyhaven.com/files/rusty_metal_05), and place them in `$PADLOCK_WORKSPACE/assets/` with their original filenames.
- Poly Haven was searched first; no suitable padlock mesh was found. The animated pack was chosen over a static scan because the shackle is a separate movable part.

Set `PADLOCK_WORKSPACE` to a private local directory. Run Blender with automatic source-file script execution disabled:

```sh
blender --background --disable-autoexec /absolute/path/candado.blend --python scripts/capture-rewards/prepare-padlock.py
```

The conversion preserves the model's recognizable shape, remaps UVs, adds rust PBR maps, and prepares a lifted/free shackle leg that swivels 65 degrees toward the camera. `assets/rusty-padlock.glb` embeds its maps and animation. The harness scales it to approximately 0.166 m wide.

## Capture and integration

From the application root, set these environment variables:

- `SCENE_SOURCE`: approved ear-scope-free-scene directory, with `public/scene.glb`, `scene-manifest.json`, and its installed Three.js dependency.
- `PADLOCK_ASSET`: absolute path to the private `rusty-padlock.glb`.
- `CAPTURE_OUTPUT`: new, empty local output directory for this capture session. The server refuses a nonempty directory so previous renders cannot be mixed in.
- `GUN_ASSET`: optional override for the existing approved Tripo gun GLB.

Run `node scripts/capture-rewards/server.mjs`, then visit `http://127.0.0.1:8812/`. Use the slider and profile selector to inspect the action. “全シーンを書き出す” saves both profiles plus `reward-audit.json`. Once the page says `capture complete: wide + portrait`, run:

```sh
node scripts/capture-rewards/finalize-capture.mjs
```

The finalizer checks both profile identities, scene/gun/padlock hashes, and all seven completed recordings before encoding. This encodes H.264 MP4s and generates `manifest.json` / `provenance.json` with SHA-256 hashes. Copy the manifest-listed clips and posters into `app/assets/video/`, replace `reward-manifest.json`, and retain provenance under `design/`. The existing `capture-runner.mjs` also uses the same finalizer.

The 6.6-second opening sequence has these boundaries: approach; insert key; turn key; lift/swivel shackle; remove lock; open hasp; open doors after 69% of the clip. The camera returns to the established pickup position before the doors finish opening. The gun pickup, acquisition dialog, stow and separate room-key pickup remain separate transitions. Reduced-motion and video-failure paths use the new closed/open posters.

Validate the visible unlock at 0%, 28%, 48%, 66% and 85%, in both capture profiles; confirm mounted contact, a visible gap under the open shackle, the lock gone before doors move, and the gun still stopping in front of the camera. Run `npm test`, `npm run build`, `npm run check:static`, and `node scripts/check-source-snapshot.mjs`.

## Existing route and pickup audits

The harness still checks each route at 1,001 points with a 16 cm walking radius against floor boundaries, walls and furniture. It raycasts the gun and separate door key onto the shelf and checks 101 pickup poses per item/profile, requiring at least 15 cm camera clearance and a fully framed final pose. `gun-held` waits for the acquisition dialog; Next lowers the gun to `gun-stowed`, then the separate key leads to `armed`. Keep `generated_asset`, `scene_source`, `renderer` and `interactions` provenance when refreshing capture data.

For the optional existing headless runner, set `PLAYWRIGHT_MODULE` to the installed `playwright/index.mjs` if it cannot be resolved locally. `FFMPEG_BIN` can override ffmpeg.
