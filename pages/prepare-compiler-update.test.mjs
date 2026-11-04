import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { inventory, listFiles, sha256 } from "../../../packages/game-delivery/files.mjs";
import {
  prepare,
  verifyPrepared,
  prepareRollback,
  verifyRollback,
  replacements,
  preservedOgp,
  publicFiles,
} from "./prepare-compiler-update.mjs";

const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function put(root, name, bytes) {
  await mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await writeFile(path.join(root, name), bytes);
}
function commit(root, tracking) {
  git(root, "add", "-A");
  git(
    root,
    "-c",
    "user.name=Offline fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "fixture"
  );
  const sha = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", `refs/remotes/origin/${tracking}`, sha);
  return sha;
}
function jpeg(comment, tail = "same encoded scan") {
  const text = Buffer.from(comment);
  const size = Buffer.alloc(2);
  size.writeUInt16BE(text.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xfe]),
    size,
    text,
    Buffer.from([0xff, 0xda]),
    Buffer.from(tail),
  ]);
}

let fixture;
beforeEach(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "compiler-pages-offline-"));
  const source = path.join(root, "source"),
    pages = path.join(root, "pages"),
    release = path.join(root, "release");
  for (const [directory, repository, branch] of [
    [source, "akashic", "main"],
    [pages, "akashic-games", "gh-pages"],
  ]) {
    await mkdir(directory);
    git(directory, "init", "-q", `--initial-branch=${branch}`);
    git(directory, "remote", "add", "origin", `https://github.com/emrum01/${repository}.git`);
  }
  await put(source, "source.txt", "fixture source; never a production approval");
  const sourceSha = commit(source, "main");
  const original = new Map(publicFiles.map((name) => [name, Buffer.from(`published:${name}`)]));
  original.set(preservedOgp, jpeg("Lavc61.19.101"));
  original.set(replacements[0], Buffer.from("MIT License\nCopyright original holders\n"));
  original.set("CNAME", Buffer.from("games.escape-safari.com"));
  original.set(".nojekyll", Buffer.alloc(0));
  original.set("index.html", Buffer.from("published root page"));
  for (const route of [
    "blessing-alert",
    "bookcafe-3d",
    "broken-web",
    "last-stitch",
    "notification-gale",
    "sic",
    "still-thread",
    "three-forward-two-back",
    "zoo-escape",
  ]) {
    original.set(`${route}/index.html`, Buffer.from(`published legacy route:${route}`));
  }
  for (let i = original.size; i < 377; i++) {
    original.set(`legacy/retained-${i}.txt`, Buffer.from(`retained:${i}`));
  }
  for (const [name, bytes] of original) {
    await put(pages, name, bytes);
  }
  const pagesSha = commit(pages, "gh-pages");
  for (const name of publicFiles) {
    await put(path.join(release, "public"), name, original.get(name));
  }
  await put(
    path.join(release, "public"),
    replacements[0],
    "MIT License\n\nCopyright original holders\n"
  );
  await put(path.join(release, "public"), replacements[1], "export const compilerMemo = true;\n");
  await put(path.join(release, "public"), preservedOgp, jpeg("Lavc60.31.102"));
  const seal = {
    schema: 1,
    target: "public-web",
    execution: "LOCAL_ONLY_NOT_UPLOADED",
    revision: sourceSha,
    catalogSha256: "a".repeat(64),
    buildReceiptSha256: "b".repeat(64),
    selection: [],
    public: await inventory(path.join(release, "public")),
    worker: null,
    overlay: null,
  };
  await writeFile(path.join(release, "release.json"), json(seal));
  const releaseSha = sha256(json(seal));
  const scope = {
    schema: 1,
    decision: "APPROVED_SCOPE_FOR_LOCAL_PREPARATION",
    sourceCommit: sourceSha,
    publishedCommit: pagesSha,
    publishedTree: git(pages, "rev-parse", "HEAD^{tree}"),
    releaseSha256: releaseSha,
    scopeEvidence: "fixture:offline-scope-only-not-a-real-approval",
    rightsDecision: "CONFIRMED_SCOPED_SOFTWARE_ONLY_NO_MEDIA_CHANGE",
    rightsEvidence: "fixture:synthetic-plain-text-and-jpeg-comment-only",
    replacements: await Promise.all(
      replacements.map(async (name) => ({
        path: name,
        beforeSha256: sha256(original.get(name)),
        afterSha256: sha256(await readFile(path.join(release, "public", name))),
      }))
    ),
    preservations: [
      {
        path: preservedOgp,
        publishedSha256: sha256(original.get(preservedOgp)),
        candidateSha256: sha256(await readFile(path.join(release, "public", preservedOgp))),
      },
    ],
  };
  const scopeFile = path.join(root, "scope.json");
  await writeFile(scopeFile, json(scope));
  fixture = {
    root,
    source,
    pages,
    release,
    scope,
    scopeFile,
    seal,
    original,
    args: {
      sourceRepo: source,
      pagesRepo: pages,
      expectSource: sourceSha,
      expectPages: pagesSha,
      release,
      expectRelease: releaseSha,
      scope: scopeFile,
      expectScope: sha256(json(scope)),
      out: path.join(root, "prepared"),
    },
  };
});
afterEach(async () => {
  await rm(fixture.root, { recursive: true, force: true });
});

async function rescope() {
  await writeFile(fixture.scopeFile, json(fixture.scope));
  fixture.args.expectScope = sha256(json(fixture.scope));
}
async function resealFixture() {
  fixture.seal.public = await inventory(path.join(fixture.release, "public"));
  await writeFile(path.join(fixture.release, "release.json"), json(fixture.seal));
  fixture.args.expectRelease = sha256(json(fixture.seal));
  fixture.scope.releaseSha256 = fixture.args.expectRelease;
  await rescope();
}
async function rejected(pattern) {
  const oldHead = git(fixture.pages, "rev-parse", "HEAD");
  await assert.rejects(prepare(fixture.args), pattern);
  assert.equal(git(fixture.pages, "rev-parse", "HEAD"), oldHead);
  await assert.rejects(readFile(path.join(fixture.args.out, "update.json")), { code: "ENOENT" });
}

test("compose exactly two replacements, preserve every other public byte and original sealed archive", async () => {
  const result = await prepare(fixture.args);
  const plan = await verifyPrepared({ out: result.out, expect: result.planSha256 });
  assert.equal(plan.baseline.length, 377);
  assert.equal(plan.site.length, 377);
  assert.notEqual(plan.siteTree, fixture.scope.publishedTree);
  for (const [name, bytes] of fixture.original) {
    const actual = await readFile(path.join(result.out, "site", name));
    const expected = replacements.includes(name)
      ? await readFile(path.join(fixture.release, "public", name))
      : bytes;
    assert(actual.equals(expected), name);
  }
  for (const name of await listFiles(fixture.release)) {
    assert(
      (await readFile(path.join(result.out, "verified-source", name))).equals(
        await readFile(path.join(fixture.release, name))
      )
    );
  }
  assert.equal((await listFiles(result.out)).length, 414);
  assert.equal(git(fixture.pages, "status", "--porcelain"), "");
  assert.equal(git(fixture.source, "status", "--porcelain"), "");
});

test("offline forward commit and rollback reproduce the exact original 377-file Git tree", async () => {
  const result = await prepare(fixture.args);
  await cp(path.join(result.out, "site"), fixture.pages, { recursive: true });
  const updated = commit(fixture.pages, "gh-pages");
  assert.equal(git(fixture.pages, "rev-parse", "HEAD^{tree}"), result.siteTree);
  const rollback = await prepareRollback({
    prepared: result.out,
    expectPlan: result.planSha256,
    pagesRepo: fixture.pages,
    expectPages: updated,
    out: path.join(fixture.root, "rollback-candidate"),
  });
  for (const [name, bytes] of fixture.original) {
    assert((await readFile(path.join(rollback.out, "site", name))).equals(bytes), name);
  }
  assert.equal(rollback.restoredTree, fixture.scope.publishedTree);
  await verifyRollback({
    out: rollback.out,
    expect: rollback.rollbackSha256,
    prepared: result.out,
    expectPlan: result.planSha256,
  });
  await put(rollback.out, "site/robots.txt", "tampered rollback");
  await assert.rejects(
    verifyRollback({
      out: rollback.out,
      expect: rollback.rollbackSha256,
      prepared: result.out,
      expectPlan: result.planSha256,
    }),
    /rollback site mutated/u
  );
  assert.equal(git(fixture.pages, "rev-parse", "HEAD"), updated);
});

test("the existing additive-only publisher still refuses the composed replacement", async () => {
  const result = await prepare(fixture.args);
  const publisher = fileURLToPath(new URL("./publish-site.sh", import.meta.url));
  assert.throws(
    () =>
      execFileSync(
        "bash",
        [
          publisher,
          "--artifact",
          path.join(result.out, "site"),
          "--pages-root",
          fixture.pages,
          "--check-only",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      ),
    (error) => {
      assert.match(error.stderr.toString(), /existing public file changed/u);
      return true;
    }
  );
  assert.equal(git(fixture.pages, "status", "--porcelain"), "");
});

for (const [label, mutate, pattern] of [
  [
    "wrong source HEAD",
    () => {
      fixture.args.expectSource = "0".repeat(40);
    },
    /stale repository HEAD/u,
  ],
  [
    "wrong public HEAD",
    () => {
      fixture.args.expectPages = "0".repeat(40);
    },
    /stale repository HEAD/u,
  ],
  [
    "short source pin",
    () => {
      fixture.args.expectSource = fixture.args.expectSource.slice(0, 8);
    },
    /full hash/u,
  ],
  [
    "wrong release seal",
    () => {
      fixture.args.expectRelease = "0".repeat(64);
    },
    /scope release mismatch/u,
  ],
  [
    "untrusted scope digest",
    () => {
      fixture.args.expectScope = "0".repeat(64);
    },
    /receipt hash mismatch/u,
  ],
  [
    "missing scope evidence",
    () => {
      fixture.scope.scopeEvidence = "";
    },
    /scope\/rights review evidence/u,
  ],
  [
    "missing rights evidence",
    () => {
      fixture.scope.rightsEvidence = "";
    },
    /scope\/rights review evidence/u,
  ],
  [
    "pending rights",
    () => {
      fixture.scope.rightsDecision = "PENDING";
    },
    /rights review pending/u,
  ],
  [
    "pending approval",
    () => {
      fixture.scope.decision = "PENDING_REVIEW";
    },
    /scope not reviewed/u,
  ],
  [
    "unknown approval field",
    () => {
      fixture.scope.allowAnyPath = true;
    },
    /exact output mismatch/u,
  ],
  [
    "wrong source approval",
    () => {
      fixture.scope.sourceCommit = "0".repeat(40);
    },
    /scope source mismatch/u,
  ],
  [
    "wrong public approval",
    () => {
      fixture.scope.publishedCommit = "0".repeat(40);
    },
    /scope published SHA mismatch/u,
  ],
  [
    "wrong public tree",
    () => {
      fixture.scope.publishedTree = "0".repeat(40);
    },
    /scope published tree mismatch/u,
  ],
  [
    "unapproved replacement",
    () => {
      fixture.scope.replacements[0].path = "robots.txt";
    },
    /approved replacements exact output mismatch/u,
  ],
  [
    "duplicate replacement",
    () => {
      fixture.scope.replacements[1] = fixture.scope.replacements[0];
    },
    /approved replacements exact output mismatch/u,
  ],
  [
    "wrong before bytes",
    () => {
      fixture.scope.replacements[0].beforeSha256 = "0".repeat(64);
    },
    /before hash mismatch/u,
  ],
  [
    "wrong after bytes",
    () => {
      fixture.scope.replacements[0].afterSha256 = "0".repeat(64);
    },
    /after hash mismatch/u,
  ],
  [
    "wrong retained public bytes",
    () => {
      fixture.scope.preservations[0].publishedSha256 = "0".repeat(64);
    },
    /preserved published hash mismatch/u,
  ],
  [
    "wrong retained source bytes",
    () => {
      fixture.scope.preservations[0].candidateSha256 = "0".repeat(64);
    },
    /preserved candidate hash mismatch/u,
  ],
  [
    "unreviewed image exception",
    () => {
      fixture.scope.preservations[0].path = "assets/og-kobako.jpg";
    },
    /unreviewed preservation path/u,
  ],
  [
    "no explicit OGP preservation",
    () => {
      fixture.scope.preservations = [];
    },
    /unapproved candidate difference/u,
  ],
]) {
  test(`reject ${label} before creating output`, async () => {
    await mutate();
    if (!label.includes("digest")) {
      await rescope();
    }
    await rejected(pattern);
  });
}

test("reject stale source tracking ref even when HEAD and receipt match", async () => {
  git(fixture.source, "update-ref", "-d", "refs/remotes/origin/main");
  await rejected(/Command failed/u);
});
test("reject public tracking ref that moved after the pinned snapshot", async () => {
  const old = fixture.args.expectPages;
  await put(fixture.pages, "legacy/retained-34.txt", "newer remote edit");
  commit(fixture.pages, "gh-pages");
  git(fixture.pages, "checkout", "--detach", old);
  await rejected(/stale tracking ref/u);
});
test("reject dirty public worktree", async () => {
  await put(fixture.pages, "robots.txt", "uncommitted");
  await rejected(/dirty repository/u);
});
test("reject dirty source worktree", async () => {
  await put(fixture.source, "source.txt", "uncommitted");
  await rejected(/dirty repository/u);
});
test("reject wrong public repository", async () => {
  git(fixture.pages, "remote", "set-url", "origin", "https://github.com/other/repo.git");
  await rejected(/wrong origin repository/u);
});
test("reject mutated sealed source file", async () => {
  await put(path.join(fixture.release, "public"), replacements[1], "tampered");
  await rejected(/mutated output/u);
});
test("reject stale revision inside a validly resealed source fixture", async () => {
  fixture.seal.revision = "0".repeat(40);
  await resealFixture();
  await rejected(/stale sealed source/u);
});
test("reject extra public candidate file even after fixture resealing", async () => {
  await put(path.join(fixture.release, "public"), "private-story.json", "not public");
  await resealFixture();
  await rejected(/exact public candidate size/u);
});
test("reject unknown public candidate path at the same file count", async () => {
  await rm(path.join(fixture.release, "public", "cafe.css"));
  await put(path.join(fixture.release, "public"), "secret.txt", "not public");
  await resealFixture();
  await rejected(/public candidate paths exact output mismatch/u);
});
test("reject unrelated candidate CSS change", async () => {
  await put(path.join(fixture.release, "public"), "cafe.css", "changed CSS");
  await resealFixture();
  await rejected(/unapproved candidate difference/u);
});
test("reject changed license text even if its hash is in fixture scope", async () => {
  await put(path.join(fixture.release, "public"), replacements[0], "different license terms");
  await resealFixture();
  fixture.scope.replacements[0].afterSha256 = sha256(Buffer.from("different license terms"));
  await rescope();
  await rejected(/license text change/u);
});
test("reject real JPEG scan changes despite explicit metadata exception", async () => {
  const changed = jpeg("Lavc60.31.102", "changed encoded scan");
  await put(path.join(fixture.release, "public"), preservedOgp, changed);
  await resealFixture();
  fixture.scope.preservations[0].candidateSha256 = sha256(changed);
  await rescope();
  await rejected(/pixels\/structure changed/u);
});
test("reject source symlink without following it", async () => {
  const target = path.join(fixture.release, "public", replacements[1]);
  await rm(target);
  await symlink(fixture.scopeFile, target);
  await rejected(/symlinks/u);
});
test("reject symlink parent of output", async () => {
  const link = path.join(fixture.root, "link");
  await symlink(fixture.root, link);
  fixture.args.out = path.join(link, "escape");
  await rejected(/symlink input\/parent/u);
});
test("existing output is never overwritten or cleaned up", async () => {
  await mkdir(fixture.args.out);
  await put(fixture.args.out, "sentinel", "keep");
  await assert.rejects(prepare(fixture.args), { code: "EEXIST" });
  assert.equal(await readFile(path.join(fixture.args.out, "sentinel"), "utf8"), "keep");
});
for (const [name, destination] of [
  ["candidate bytes", "site/robots.txt"],
  ["original source bytes", "verified-source/public/assets/web-games.js"],
  ["rollback bytes", "rollback/assets/web-games.js"],
]) {
  test(`verification rejects changed ${name}`, async () => {
    const result = await prepare(fixture.args);
    await put(result.out, destination, "tampered");
    await assert.rejects(verifyPrepared({ out: result.out, expect: result.planSha256 }));
  });
}
test("verification rejects extra output files", async () => {
  const r = await prepare(fixture.args);
  await put(r.out, "extra.txt", "extra");
  await assert.rejects(
    verifyPrepared({ out: r.out, expect: r.planSha256 }),
    /prepared package exact output mismatch/u
  );
});
test("verification rejects changed plan instead of resealing it", async () => {
  const r = await prepare(fixture.args);
  await put(r.out, "update.json", "{}\n");
  await assert.rejects(
    verifyPrepared({ out: r.out, expect: r.planSha256 }),
    /receipt hash mismatch/u
  );
});
test("rollback refuses later unrelated drift and produces no candidate", async () => {
  const r = await prepare(fixture.args);
  await cp(path.join(r.out, "site"), fixture.pages, { recursive: true });
  await put(fixture.pages, "robots.txt", "later unrelated edit");
  const updated = commit(fixture.pages, "gh-pages");
  const out = path.join(fixture.root, "rollback-refused");
  await assert.rejects(
    prepareRollback({
      prepared: r.out,
      expectPlan: r.planSha256,
      pagesRepo: fixture.pages,
      expectPages: updated,
      out,
    }),
    /rollback target drifted/u
  );
  await assert.rejects(readFile(path.join(out, "rollback.json")), { code: "ENOENT" });
});

async function advancePublicFixture() {
  fixture.args.expectPages = commit(fixture.pages, "gh-pages");
  fixture.scope.publishedCommit = fixture.args.expectPages;
  fixture.scope.publishedTree = git(fixture.pages, "rev-parse", "HEAD^{tree}");
  await rescope();
}
test("reject a 378th public file rather than silently extending scope", async () => {
  await put(fixture.pages, "new-public-path.txt", "new");
  await advancePublicFixture();
  await rejected(/exact 377-file/u);
});
test("reject a missing baseline file", async () => {
  await rm(path.join(fixture.pages, "index.html"));
  await advancePublicFixture();
  await rejected(/exact 377-file/u);
});
test("reject baseline symlink entries", async () => {
  const name = path.join(fixture.pages, "index.html");
  await rm(name);
  await symlink("robots.txt", name);
  await advancePublicFixture();
  await rejected(/non-regular baseline entry/u);
});
test("reject a domain change in the pinned public snapshot", async () => {
  await put(fixture.pages, "CNAME", "other.invalid");
  await advancePublicFixture();
  await rejected(/wrong CNAME/u);
});
test("reject output nested in the source repository", async () => {
  fixture.args.out = path.join(fixture.source, "new-output");
  await rejected(/output\/input overlap/u);
});
test("reject a symlink approval receipt", async () => {
  const file = fixture.scopeFile + ".real";
  await writeFile(file, await readFile(fixture.scopeFile));
  await rm(fixture.scopeFile);
  await symlink(file, fixture.scopeFile);
  await rejected(/symlink input\/parent/u);
});
test("reject duplicate JSON scope keys even if the file digest is supplied", async () => {
  const canonical = json(fixture.scope).toString();
  const bytes = Buffer.from(canonical.replace('  "schema": 1,', '  "schema": 1,\n  "schema": 1,'));
  await writeFile(fixture.scopeFile, bytes);
  fixture.args.expectScope = sha256(bytes);
  await rejected(/canonical JSON required/u);
});
test("reject path traversal in the sealed inventory", async () => {
  fixture.seal.public[0].path = "../escape.txt";
  const bytes = json(fixture.seal);
  await writeFile(path.join(fixture.release, "release.json"), bytes);
  fixture.args.expectRelease = sha256(bytes);
  fixture.scope.releaseSha256 = sha256(bytes);
  await rescope();
  await rejected(/invalid release file path/u);
});
test("metadata-identical source needs no preservation exception", async () => {
  await put(path.join(fixture.release, "public"), preservedOgp, fixture.original.get(preservedOgp));
  fixture.scope.preservations = [];
  await resealFixture();
  const r = await prepare(fixture.args);
  await verifyPrepared({ out: r.out, expect: r.planSha256 });
});
test("repeated preparation of the same pins is reproducible without receipt reuse", async () => {
  const first = await prepare(fixture.args);
  const second = await prepare({
    ...fixture.args,
    out: path.join(fixture.root, "second-preparation"),
  });
  assert.equal(first.planSha256, second.planSha256);
  assert.equal(first.siteTree, second.siteTree);
  assert(
    (await readFile(path.join(first.out, "update.json"))).equals(
      await readFile(path.join(second.out, "update.json"))
    )
  );
});
test("accept the same repository identity with checkout's URL spelling without .git", async () => {
  git(fixture.source, "remote", "set-url", "origin", "https://github.com/emrum01/akashic");
  git(fixture.pages, "remote", "set-url", "origin", "git@github.com:emrum01/akashic-games");
  const result = await prepare(fixture.args);
  await verifyPrepared({ out: result.out, expect: result.planSha256 });
});
test("CLI verifies the pinned candidate and rejects missing or publication commands", async () => {
  const script = fileURLToPath(new URL("./prepare-compiler-update.mjs", import.meta.url));
  const result = await prepare(fixture.args);
  const output = execFileSync(
    process.execPath,
    [script, "verify", "--out", result.out, "--expect", result.planSha256],
    { encoding: "utf8" }
  );
  assert.deepEqual(JSON.parse(output), { status: "verified", siteTree: result.siteTree });
  for (const args of [
    ["publish"],
    ["toString"],
    ["__proto__"],
    ["prepare"],
    ["verify", "--out", result.out],
    ["verify", "--out", result.out, "--out", result.out],
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "pipe"] }),
      (error) => error.status === 1
    );
  }
});
