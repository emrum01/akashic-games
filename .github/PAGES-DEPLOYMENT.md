# Legacy Pages deployment retirement

The monorepo [emrum01/akashic](https://github.com/emrum01/akashic) owns the
publication path for this mirror. `.github/workflows/deploy-pages.yml` is
retired: on the updated `main`, it has no push trigger or write permissions,
does not check out code, and refuses a manual dispatch with an error. It cannot
build an artifact, push to `gh-pages`, or change any public file, including
unknown files added later.

## Why the old publisher must stay retired

The old workflow assembled only `bookcafe-3d`, `broken-web`, `zoo-escape`,
`still-thread`, `notification-gale`, and `blessing-alert`, then used
`peaceiris/actions-gh-pages` to replace `gh-pages` with that partial artifact.
The published snapshot at commit
`1fc3702e126ec1a7b4ea14f7e38d8199a847a5c4` contains 377 files. The old build
omits 158 of them and replaces the published `robots.txt` with an older version.
Omitted files include the shared Web games, OGP assets, and micro-cell.

`keep_files` alone cannot protect existing files from an old build overwriting
them. Retirement removes the second publisher entirely rather than adding a
second implementation of the public-file preservation checks.

## Publication owner and prerequisites

The reviewed publication path is
[`Mirror legacy repos`](https://github.com/emrum01/akashic/blob/main/.github/workflows/mirror-legacy.yml)
in the monorepo. Its public-inventory preservation repair is tracked separately
in [akashic PR #191](https://github.com/emrum01/akashic/pull/191). Complete its
review and required checks before resuming publication. Do not bypass a failed
preservation gate or publish the six-route legacy build as a fallback.

The monorepo's publisher must validate the complete candidate against **every**
file in the current `gh-pages` checkout, including newer unknown additions,
reject changes and deletions, and push without force. This retirement does not
change that publisher, the `gh-pages` branch, Pages settings, credentials, DNS,
Workers, or media bytes. GitHub Pages continues to serve the configured
`gh-pages` branch.

The monorepo mirror excludes this repository's `.github` directory. Both this
workflow retirement and this document live there so normal source mirroring
does not restore the old publisher.

## Scope and remaining historical-run risk

This source change takes effect only after review and merge into `main`.
It does not alter old workflow versions in other branches or past runs, cancel
queued/running jobs, or revoke their credentials. Dispatching an old ref or
re-running an old deployment can still execute the old publisher. Do not use
those paths. Repository-level retirement of historical execution needs a
separately authorized settings/permissions change and verification; it is not
part of this PR.

Read-only inspection on 2026-11-04 found the workflow active, Pages configured
for `gh-pages` at `/`, and no unfinished runs among the latest 100 runs of this
workflow. The connected integration could read repository permissions but
received HTTP 403 for `actions/permissions/workflow`; no assertion is made
about the repository's default token permissions. No settings change or
provider workflow execution was performed for this repair.

## Validation

Validate the YAML with a GitHub Actions workflow validator. Locally parse the
workflow and verify that the only event is `workflow_dispatch`, `permissions`
is empty, and the only job contains one shell step with no action references,
checkout, credentials, or publication commands. Running that extracted refusal
script locally must exit with status 1, print the retirement explanation, and
leave an existing public snapshot plus an unknown-file fixture unchanged.

Reproduce the old-build impact only in a temporary output directory; never run
its deployment step. Compare every tracked file in the pinned public snapshot
with the temporary artifact. Source and public files, media, and generated
assets are unchanged by this PR, so media conversion and game rebuilds are not
required.
