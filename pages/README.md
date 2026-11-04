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
The other 282 files still come from the monorepo source. After completion all
377 baseline paths must match the pinned Git blobs. New additive files are
permitted; the independent publisher then checks the *current* gh-pages checkout
and rejects any deletion or modification, including newer public files missing
from this pinned snapshot. Updating this baseline requires a separately reviewed
public snapshot and receipts.

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
symlinks. `test-mirror-legacy.sh` also retains the independent additive-only
publisher and shared nine-route platform ownership tests. Platform CI runs these
checks on PRs without deployment credentials.
