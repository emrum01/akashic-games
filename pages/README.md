# Legacy Pages artifact and published baseline

`build-site.sh` assembles the ten legacy source routes. It is a **partial**
artifact: it predates the shared React Web games and micro-cell publication.
Do not publish that partial output alone.

`published-baseline.json` pins public repository `emrum01/akashic-games` commit
`1fc3702e126ec1a7b4ea14f7e38d8199a847a5c4`, tree
`6d82fe4232b53ebc6a023d51108bfb0f49b79e2e`: 377 already public files. The receipt
lists exactly 95 files absent or stale in the legacy assembly (59,163,151 bytes).
93 are missing; `kobako/index.html` and `robots.txt` have older source versions.
Their exact superseded source hashes are recorded so a later source edit cannot
be silently overwritten. The public versions preserve the shared React small-box
game and current search-exclusion policy.

The retained files cover the eight adopted Web games, shared JS/CSS/OGP/legal
notices, `cafe.css`, and all 63 published micro-cell files. They come from the
immutable Git commit, never a guessed asset or mutable working-tree file.
The other 282 files still come from the monorepo source. By default, after
completion all 377 baseline paths must match the pinned Git blobs. New additive
files are permitted; the independent publisher then checks the *current*
gh-pages checkout and rejects any deletion or modification, including newer
public files missing from this pinned snapshot. Updating this baseline requires
a separately reviewed public snapshot and receipts.

## Reviewed two-file update receipt

Additive-only remains the default. The explicit
`reviewed-public-updates.json` receipt authorizes only these replacements in the
pinned 377-file snapshot:

| Path | Public bytes | Reviewed source bytes |
| --- | --- | --- |
| `last-stitch/game.js` | SHA-256 `8bb7607f931c320ffa8fbd5150477589fd4c501f134f2b9b8291cb5605e2fdc2`, 41,054 bytes | SHA-256 `e71aec9380c9ab7f3aa2bb6b406ac10a404f2a75aa77f2741e46b0f66581ae06`, 37,641 bytes |
| `last-stitch/index.html` | SHA-256 `3513b449d1702fea3c45a12af81cc31917f469b3b885269ecd7ac20b54db6299`, 18,013 bytes | SHA-256 `66ac2e90ea631137577273613389fe33ce85c076ccf36d2b551ad3426401f157`, 20,312 bytes |

The receipt binds the public repository, exact public commit/tree/count, and the
preserved `emrum01/akashic` source commit plus its root commit tree and
`apps/akashic-games` subtree. `reviewed_update.py` rejects unknown or duplicate
JSON fields, extra/missing/duplicate paths, unsafe paths, non-regular Git
objects, and receipt hashes or sizes that do not match those actual Git blobs.
It has no network or provider writes. The workflow fetches the full history of
the fixed PR 192 head so the preserved source commit remains available if this
policy lands before that source change.

Both retention and publishing independently validate the receipt and source
Git objects. Retention accepts the two artifact files only when both are still
the exact old public bytes or both are the exact reviewed source bytes. The
publisher additionally checks every current `gh-pages` file. It permits the
old/old state before the source merge, old-live to new-artifact replacement,
and new/new reruns; it rejects mixed states, unknown bytes, a live downgrade,
deletions, and unrelated replacements. All inventory checks finish before any
copy. Every other pinned file and any newer public files retain the existing
byte-for-byte checks. The receipt is passed explicitly; without it the existing
additive-only behavior remains unchanged.

This policy does not itself publish a release. It only provides a reviewed
path for the later two-file Last Stitch artifact change; public deployment
remains controlled by the existing main-branch workflow and its non-force push.

```sh
git clone --depth 1 --single-branch --branch gh-pages \
  https://github.com/emrum01/akashic-games.git /tmp/akashic-public
# If the latest gh-pages no longer includes the pinned commit locally:
git -C /tmp/akashic-public fetch --depth 1 origin \
  1fc3702e126ec1a7b4ea14f7e38d8199a847a5c4
bash apps/akashic-games/pages/build-site.sh --output /tmp/akashic-pages
python3 apps/akashic-games/pages/retain-published.py \
  --artifact /tmp/akashic-pages --baseline-repo /tmp/akashic-public
bash apps/akashic-games/pages/publish-site.sh --check-only \
  --artifact /tmp/akashic-pages --pages-root /tmp/akashic-public
# Opt into the reviewed two-file scope explicitly when the source object is available.
python3 apps/akashic-games/pages/retain-published.py \
  --artifact /tmp/akashic-pages --baseline-repo /tmp/akashic-public \
  --reviewed-update apps/akashic-games/pages/reviewed-public-updates.json \
  --source-repo /path/to/akashic-source-clone
bash apps/akashic-games/pages/publish-site.sh --check-only \
  --artifact /tmp/akashic-pages --pages-root /tmp/akashic-public \
  --reviewed-update apps/akashic-games/pages/reviewed-public-updates.json \
  --source-repo /path/to/akashic-source-clone
bash scripts/test-mirror-legacy.sh
```

The workflow performs both completion and the live additive-only check before
pushing the legacy main mirror. It checks again when assembling gh-pages and
pushes without force. A clean snapshot at the pinned public commit produces no
public change. No Worker, credential, DNS, Pages setting, or route ownership is
changed. This is a publication-preservation repair, not a new Web-game release.

## Media preservation exception

The retained JPEG/PNG/WebP/WebM bytes are already public. This repair copies them
unchanged from the pinned Git snapshot and validates their SHA-256 and sizes;
it performs no media conversion, optimization, or generated replacement. Their
before/after sizes and hashes are identical (0% change). Re-encoding would violate
the required public byte equality. Some original micro-cell media source/recipes
are not in the monorepo; this receipt preserves publication provenance, and does
not claim a newly reproduced media optimization build. Future media changes need
the shared media pipeline and their own reviewed publication scope.

`test-retain-published.py` uses offline Git fixtures to check exact completion,
source collisions, missing/changed baseline files, receipts, path traversal and
symlinks. `test-reviewed-update.py` adds offline fixtures for the opt-in
two-file state machine and publisher preflight. `test-mirror-legacy.sh` also
retains the independent additive-only publisher and shared nine-route platform
ownership tests. Platform CI runs these checks on PRs without deployment
credentials.

## Bounded compiler update preparation

[compiler-update.md](compiler-update.md) specifies a separate offline preparation
contract for exactly two software-file replacements. It preserves every other
published byte, including the OGP whose encoder comment differs in CI, and
produces a complete candidate plus independently verifiable rollback data.
Compiler preparation does not authorize publication. The default additive-only
publisher and the separate Last Stitch two-file mode above grant no compiler
replacement scope. The preparer cannot upload, commit, push or grant publication
approval.
