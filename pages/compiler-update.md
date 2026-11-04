# Bounded React Compiler Pages update: offline preparation

This is a separate local preparation contract. It does not add a replacement
mode to `publish-site.sh`, change its 377-file preservation policy, modify a
published baseline, or invoke a provider/Git write. There is no `publish`,
`apply`, force, wildcard or approval-generation command.

The operator must still obtain an independently reviewed publication mechanism
and authorization before any live update. A local package, test pass, receipt
field or successful CI is not permission to publish. No production scope or
rights approval receipt is included in this change.

## Fixed boundary and source authority

`prepare-compiler-update.mjs` accepts exactly the current 32 public-web paths
and a complete 377-file published Git tree. It permits only:

- `assets/web-games.js`: the exact reviewed compiler bundle.
- `assets/web-games-LICENSE.txt`: exact reviewed bytes, with license text equal
  to the existing notice after whitespace removal.

All other 375 published paths keep their exact bytes and Git file modes. No
HTML, CSS, robots, CNAME, OGP, puzzle media, route, preview, Worker, private
scenario or lateral story may be added/deleted/replaced. New candidate paths,
extra files, symlinks, special files, path traversal, wrong repository identity,
dirty worktrees, short SHA values, stale HEAD/tracking refs and noncanonical or
duplicate-key scope JSON fail. A different public count/route requires a policy
review rather than a parameter override.

The source repo must be `emrum01/akashic`, with HEAD and `origin/main` exactly
equal to the caller's full source SHA. The public repo must be
`emrum01/akashic-games`, with HEAD and `origin/gh-pages` exactly equal to the
caller's full published SHA. Both must be clean. Inputs are checked before
assembly and refs/worktrees again before returning. Git objects, never mutable
public worktree files, supply the complete baseline. A locally stale tracking
ref cannot prove the remote is fresh: authorized remote readback is a separate
requirement immediately before preparation and again before any future write.

The original release must already have passed the canonical regression for
that exact main revision. Existing `delivery.mjs verify` checks the specified
seal and exact files; the preparer adds the fixed 32-path/public-only and
revision checks. The caller must independently verify CI run/job/checkout,
artifact digest and result identity. An offline tool cannot authenticate those
external facts merely from a JSON claim or a source-revision string.
The candidate-retention change in [PR #199](https://github.com/emrum01/akashic/pull/199)
provides an archive for future successful main runs; a PR merge-checkout archive
must not be treated as a main archive.

## Reviewed scope and rights receipt

The caller supplies an external scope file **and its independently reviewed
SHA-256**. Do not derive the trusted digest from a newly generated receipt and
present that as approval. The tool has no signing identity or user-history API;
it can reject a mismatched digest and unapproved paths, but cannot establish
that a human authorized a self-authored receipt. Future publication must check
the actual authorization separately.

The exact JSON fields are:

```json
{
  "schema": 1,
  "decision": "PENDING_REVIEW",
  "sourceCommit": "FULL_SOURCE_SHA_FROM_REVIEW",
  "publishedCommit": "FULL_CURRENT_PUBLIC_SHA_FROM_REVIEW",
  "publishedTree": "FULL_PUBLIC_TREE_SHA_FROM_REVIEW",
  "releaseSha256": "EXACT_VERIFIED_RELEASE_SEAL",
  "scopeEvidence": "",
  "rightsDecision": "PENDING",
  "rightsEvidence": "",
  "replacements": [
    { "path": "assets/web-games-LICENSE.txt", "beforeSha256": "REVIEWED_HASH", "afterSha256": "REVIEWED_HASH" },
    { "path": "assets/web-games.js", "beforeSha256": "REVIEWED_HASH", "afterSha256": "REVIEWED_HASH" }
  ],
  "preservations": []
}
```

This template intentionally fails. Only a separately reviewed receipt may use
`APPROVED_SCOPE_FOR_LOCAL_PREPARATION` and
`CONFIRMED_SCOPED_SOFTWARE_ONLY_NO_MEDIA_CHANGE`, with nonempty evidence.
The evidence must identify the user-approved scope and the existing games'
adoption/rights review. React/React DOM/Scheduler, Sonner and Radix notices must
be retained. React 19.3.1 supplies the compiler runtime; Babel/compiler are
build dependencies. Existing publication proves provenance, not ownership or a
new license grant. No new rights decision is fabricated by the preparer.

### Retain the original OGP bytes

The observed canonical artifact changes the JPEG comment in
`assets/og-nazo-20261031-shiritori-prototype-3.jpg` from `Lavc61.19.101` to
`Lavc60.31.102`. Size is 26,499 bytes in both cases and decoded pixels match,
but its SHA-256 changes. This OGP replacement was not requested.

When that exact discrepancy exists, the reviewed receipt must explicitly list
one `preservations` entry with `path`, `publishedSha256` and `candidateSha256`.
Only that named OGP can use this preservation exception. The preparer checks
both hashes and verifies that removing JPEG COM segments makes the byte streams
identical, including all encoded scan data. A scan/palette/profile/structure
change or an unknown exception is refused. It always writes the original
published bytes to the composed site. If both inputs already match, the receipt
must have no preservation exception. There is no media conversion: all retained
media hashes and sizes stay identical (0% size change).

## Prepare and verify, with no provider operation

Run Node 22+ from a reviewed checkout. All paths and pins are explicit. The
output must be new and outside all inputs; symlink parents are refused. The
command uses no network, credentials, rebuild, Git index/object/ref writes or
publication step.

```sh
node apps/akashic-games/pages/prepare-compiler-update.mjs prepare \
  --source-repo /absolute/clean-source \
  --expect-source FULL_CURRENT_MAIN_SHA \
  --pages-repo /absolute/clean-gh-pages \
  --expect-pages FULL_CURRENT_PUBLIC_SHA \
  --release /absolute/verified-public-web-release \
  --expect-release REVIEWED_SEAL_SHA256 \
  --scope /absolute/externally-reviewed-scope.json \
  --expect-scope INDEPENDENTLY_REVIEWED_SCOPE_SHA256 \
  --out /absolute/NEW-preparation

node apps/akashic-games/pages/prepare-compiler-update.mjs verify \
  --out /absolute/NEW-preparation --expect RETURNED_PLAN_SHA256
```

The package has a complete `site/` (377 files), exact two-file `rollback/`,
unchanged `verified-source/` (original 32 files and original release seal),
`approved-scope.json` and `update.json`. The new plan hash binds original
source/base/scope identities, complete before/after inventories and Git trees.
Every output file is rechecked, including retained source paths. Failed
assembly removes only its own newly created output; an existing output is
never overwritten or removed. Two identical inputs produce identical plan
bytes; local paths/timestamps are not included.

This is a **new composition**, not the original canonical artifact. Its plan
does not claim the original 32-file seal covers a different OGP. Keep the source
archive unchanged. The composed site needs its own canonical eight-flow/ten-image
verification before any publication; the original gate only proves the source
artifact. Do not substitute a local flow-only run for that verification or
weaken the existing gate to make the composition pass.

## Rollback and future publication transaction

Offline tests create a normal local commit of the composed site, then assemble
a rollback from that exact updated SHA. Rollback requires the current public
tree to equal the known candidate tree. It refuses unknown files or later
changes, including unrelated changes, rather than discarding them.

```sh
node apps/akashic-games/pages/prepare-compiler-update.mjs rollback \
  --prepared /absolute/NEW-preparation --expect-plan RETURNED_PLAN_SHA256 \
  --pages-repo /absolute/clean-updated-gh-pages \
  --expect-pages KNOWN_UPDATED_PUBLIC_SHA --out /absolute/NEW-rollback

node apps/akashic-games/pages/prepare-compiler-update.mjs verify-rollback \
  --out /absolute/NEW-rollback --expect RETURNED_ROLLBACK_SHA256 \
  --prepared /absolute/NEW-preparation --expect-plan RETURNED_PLAN_SHA256
```

The result is a new complete site matching the original Git tree, plus a
separate rollback receipt. Neither command changes the public repo. Future
restoration must be a new ordinary commit, never reset/force-push. Drift needs
a new review; unknown publication outcomes need remote readback before retry
or rollback.

A future publisher must consume the reviewed composition and serialize with
`mirror-legacy-production`, re-read remote refs/Pages state immediately before
one non-force fast-forward write, compare the exact two-path Git diff and all
375 retained blobs, and record the prior/new SHA plus uncertain outcomes.
Maintain the existing additive-only path. Update `published-baseline.json`
only to the **confirmed published** successor with exact receipts; coordinate
that transition with the writer so normal mirrors do not stop on the old
baseline. Do not relax the independent live gate during this transition.

Read back the actual HTTPS HTML/JS/CSS/media hashes and ordinary unqueried
`/assets/web-games.js` in fresh and warm browser sessions. Require eight public
flows, ten unchanged images, completion persistence and no console/404 errors.
Pages build metadata is insufficient to prove CDN delivery. This environment
cannot reach the public domain under its current egress policy; actual live
acceptance, composed canonical regression, publication authorization and the
final serialized provider writer remain release prerequisites.

## Offline regressions

```sh
node --test apps/akashic-games/pages/prepare-compiler-update.test.mjs
bash scripts/test-mirror-legacy.sh
```

Fixtures use local Git repos and explicitly synthetic scope/rights evidence.
They cover full forward/rollback tree identity, all retained bytes, source
archive immutability, the unchanged additive publisher's refusal, stale refs,
approval/hash/rights mismatches, unknown paths, wrong count/domain, symlinks,
traversal, real JPEG scan changes, tampered source/site/rollback/plan, and
rollback after drift. No fixture invokes a remote, publisher, real approval,
auth setting or media encoder.
