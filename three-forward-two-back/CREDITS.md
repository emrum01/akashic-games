# three-forward-two-back credits

## Floor textures

- `assets/textures/cracked-concrete-{color,normal,roughness,height}.jpg`
  - Source: Poly Haven, [Concrete Floor Damaged 01](https://polyhaven.com/a/concrete_floor_damaged_01)
  - Author: Rob Tuytel
  - License: [CC0 1.0](https://polyhaven.com/license), including commercial use and redistribution.
  - Retrieved: 2026-11-14 JST from the official Poly Haven download links, using the previously retrieved API file inventory; source URLs and SHA-256 hashes are recorded in `media-source/provenance.json`.
  - Local changes: The color and height maps retain 1K dimensions. Normal and roughness inputs are derived at 512px by `scripts/prepare-floor.mjs`, then processed with the shared `optimize-media.py` JPEG recipe. Color uses sRGB; the OpenGL normal, roughness, and height maps remain linear data.
  - Originals remain in `media-source/` and `artwork/floor-originals/`; only verified optimizer outputs in `assets/textures/` are delivery inputs. See `media-report.json` and `README.md`.

## Video

- `assets/explosion.webm`
  - Source: Wikimedia Commons, `File:Greenhouse George Early Fireball.ogv`
  - URL: https://commons.wikimedia.org/wiki/File:Greenhouse_George_Early_Fireball.ogv
  - Author: Federal government of the United States
  - License/status: Public domain in the United States, U.S. federal government work
  - Local changes: transcoded to WebM, scaled/cropped to 1280x720, adjusted contrast/saturation/brightness.

## 3D Models

- `assets/models/sconce_03/sconce_03.glb`
  - Source: Free3D, `Lamp/Sconce 03`
  - URL: https://free3d.com/ja/3d-model/lampsconce-03-43588.html
  - Author: TomaszCGB
  - License/status: Personal Use License
  - Local changes: user-provided RAR was extracted locally, OBJ was converted to GLB with Blender, then used as the embedded front control lamps.

## Social cover

- `assets/textures/ogp.jpg`
  - Created: OpenAI built-in imagegen, 2026-11-14 JST, using a screenshot of this game's procedural room as a reference.
  - Original: `artwork/ogp-source.png`; exact prompt: `artwork/ogp-prompt.txt`.
  - Local changes: reproducible 1200×630 JPEG source preparation via `scripts/prepare-ogp.mjs`, followed by the shared JPEG optimizer. No puzzle solution is shown.
  - Generated artwork, separate from the Poly Haven floor texture attribution. The retained third-party sconce model was not used as cover-art input.

## Pre-rendered room

- `assets/textures/scene-{wide,narrow}-{room,device}.jpg`
  - Selected liminal room concept and four production frames generated with OpenAI's built-in imagegen. Retained originals: `artwork/liminal-*.png`; prompts and edit invariants: `artwork/room-art.md`.
  - `scripts/prepare-room-art.mjs` resizes retained PNGs to PC 1440×822 / mobile 720×1280 JPEG inputs. `artwork/room-art.json` annotates exploration and light positions; input/output SHA-256 and preparation details are retained in `artwork/room-render-provenance.json`. The shared media optimizer prepares the delivery frames with the scene JPEG recipe.
  - Lamp colors, activation indication and the arrival ring/particles are programmed CSS/Canvas 2D layers over the still frames. Runtime loads no Three.js, WebGL, GLTF loader or model.
  - Earlier procedural authoring snapshot `artwork/room-reference.js`, `scripts/bake-room.mjs`, CC0 floor maps and the separately licensed sconce model remain as historical source assets. They are not rendered or requested by the current game runtime. Their original credits/licenses above remain applicable to those retained files.
