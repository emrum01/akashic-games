// Offline preparation only. This module has no transport, Git-write or publish command.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactSet,
  listFiles,
  publicPath,
  sha256,
} from "../../../packages/game-delivery/files.mjs";
import { verify as verifyRelease } from "../lateral-thinking-kit/scripts/delivery.mjs";

export const replacements = Object.freeze(["assets/web-games-LICENSE.txt", "assets/web-games.js"]);
export const preservedOgp = "assets/og-nazo-20261031-shiritori-prototype-3.jpg";
// Freeze this release's public boundary. A new file/route needs a policy review.
export const publicFiles = Object.freeze(
  [
    "assets/og-kobako.jpg",
    preservedOgp,
    "assets/og-nazo-20261031-turn-letter.jpg",
    ...["last-bridge", "long-way", "nine-points", "one-heavy", "two-exits"].map(
      (id) => `assets/og-nazo-20261102-${id}.jpg`
    ),
    ...replacements,
    "assets/web-games.css",
    "cafe.css",
    "kobako/completion.css",
    "kobako/index.html",
    ...[
      "last-bridge",
      "long-way",
      "one-heavy",
      "symbol-rule",
      "three-cuts",
      "three-pictures",
      "two-exits",
    ].flatMap((route) => [`${route}/index.html`, `${route}/style.css`]),
    "robots.txt",
    "symbol-rule/assets/problem.webp",
    "three-pictures/assets/nazo-20261031-turn-letter.webp",
    "three-pictures/completion.css",
  ].toSorted()
);

const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const keys = (value, names, label) => {
  assert(value && typeof value === "object" && !Array.isArray(value), `invalid ${label}`);
  assertExactSet(label, Object.keys(value), names);
};
const hash = (value, length = 64) => {
  assert(
    typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "u").test(value),
    "full hash required"
  );
  return value;
};
const safePath = (name) => {
  publicPath(name);
  assert(
    !name.split("/").some((part) => part.toLowerCase() === ".git"),
    "Git metadata path forbidden"
  );
  return name;
};
const objectHash = (kind, bytes) =>
  createHash("sha1").update(`${kind} ${bytes.length}\0`).update(bytes).digest("hex");
const record = (name, bytes, mode = "100644") => ({
  path: safePath(name),
  mode,
  bytes: bytes.length,
  sha256: sha256(bytes),
  gitBlob: objectHash("blob", bytes),
});

// Calculate a Git tree without writing objects or invoking mktree/update-index.
export function treeHash(files) {
  const root = new Map();
  for (const file of files) {
    let branch = root;
    const parts = safePath(file.path).split("/");
    for (const part of parts.slice(0, -1)) {
      if (!branch.has(part)) {
        branch.set(part, new Map());
      }
      branch = branch.get(part);
      assert(branch instanceof Map, "tree path collision");
    }
    assert(!branch.has(parts.at(-1)), "duplicate tree entry");
    branch.set(parts.at(-1), file);
  }
  const encode = (branch) => {
    const items = [...branch.entries()].toSorted(([a, av], [b, bv]) =>
      Buffer.compare(
        Buffer.from(a + (av instanceof Map ? "/" : "")),
        Buffer.from(b + (bv instanceof Map ? "/" : ""))
      )
    );
    return objectHash(
      "tree",
      Buffer.concat(
        items.flatMap(([name, value]) => [
          Buffer.from(`${value instanceof Map ? "40000" : value.mode} ${name}\0`),
          Buffer.from(value instanceof Map ? encode(value) : hash(value.gitBlob, 40), "hex"),
        ])
      )
    );
  };
  return encode(root);
}

function git(repo, ...args) {
  return execFileSync(
    "git",
    [
      "--no-optional-locks",
      "-c",
      `safe.directory=${repo}`,
      "-c",
      "core.fsmonitor=false",
      "-C",
      repo,
      ...args,
    ],
    {
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
}
async function noLinks(name, directory = true) {
  const absolute = path.resolve(name);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    assert(!(await lstat(current)).isSymbolicLink(), "symlink input/parent forbidden");
  }
  const info = await lstat(absolute);
  assert(directory ? info.isDirectory() : info.isFile(), "regular input required");
  return absolute;
}
async function repository(repo, expected, name, branch) {
  const root = await noLinks(repo);
  hash(expected, 40);
  assert.equal(
    git(root, "rev-parse", "--show-toplevel").toString().trim(),
    root,
    "repository root required"
  );
  const origin = git(root, "remote", "get-url", "origin").toString().trim();
  assert(
    ["https://github.com/emrum01/", "git@github.com:emrum01/"].some((prefix) =>
      [prefix + name, prefix + name + ".git"].includes(origin)
    ),
    "wrong origin repository"
  );
  assert.equal(git(root, "rev-parse", "HEAD").toString().trim(), expected, "stale repository HEAD");
  assert.equal(
    objectHash("commit", git(root, "cat-file", "commit", expected)),
    expected,
    "commit object integrity mismatch"
  );
  assert.equal(
    git(root, "rev-parse", `refs/remotes/origin/${branch}`).toString().trim(),
    expected,
    "stale tracking ref"
  );
  assert.equal(
    git(root, "status", "--porcelain", "--untracked-files=normal").length,
    0,
    "dirty repository"
  );
  return root;
}
function baseline(repo, commit) {
  const files = new Map();
  const entries = git(repo, "ls-tree", "-rz", "--full-tree", commit)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const entry of entries) {
    const [metadata, name] = entry.split("\t");
    const [mode, kind, blob] = metadata.split(" ");
    safePath(name);
    assert(kind === "blob" && ["100644", "100755"].includes(mode), "non-regular baseline entry");
    assert(!files.has(name), "duplicate baseline path");
    const bytes = git(repo, "cat-file", "blob", hash(blob, 40));
    files.set(name, { bytes, record: record(name, bytes, mode) });
  }
  assert.equal(files.size, 377, "exact 377-file published baseline required");
  assert.equal(files.get("CNAME")?.bytes.toString(), "games.escape-safari.com", "wrong CNAME");
  assert.equal(files.get(".nojekyll")?.bytes.length, 0, "missing .nojekyll");
  return files;
}
async function readJson(file, expect) {
  hash(expect);
  const bytes = await readFile(await noLinks(file, false));
  assert.equal(sha256(bytes), expect, "receipt hash mismatch");
  const value = JSON.parse(bytes);
  assert(
    bytes.equals(json(value)),
    "canonical JSON required (duplicate/unknown encoding rejected)"
  );
  return { bytes, value };
}
function scopeContract(scope) {
  keys(
    scope,
    [
      "schema",
      "decision",
      "sourceCommit",
      "publishedCommit",
      "publishedTree",
      "releaseSha256",
      "scopeEvidence",
      "rightsDecision",
      "rightsEvidence",
      "replacements",
      "preservations",
    ],
    "scope receipt"
  );
  assert(
    scope.schema === 1 && scope.decision === "APPROVED_SCOPE_FOR_LOCAL_PREPARATION",
    "scope not reviewed"
  );
  for (const key of ["sourceCommit", "publishedCommit", "publishedTree"]) {
    hash(scope[key], 40);
  }
  hash(scope.releaseSha256);
  assert.equal(
    scope.rightsDecision,
    "CONFIRMED_SCOPED_SOFTWARE_ONLY_NO_MEDIA_CHANGE",
    "rights review pending"
  );
  for (const key of ["scopeEvidence", "rightsEvidence"]) {
    assert(
      typeof scope[key] === "string" && scope[key].trim().length > 0,
      "scope/rights review evidence required"
    );
  }
  assert(Array.isArray(scope.replacements), "replacement allowlist required");
  assert.equal(
    scope.replacements.length,
    replacements.length,
    "exact two replacement paths required"
  );
  assertExactSet(
    "approved replacements",
    scope.replacements.map((r) => r.path),
    replacements
  );
  for (const change of scope.replacements) {
    keys(change, ["path", "beforeSha256", "afterSha256"], "replacement");
    hash(change.beforeSha256);
    hash(change.afterSha256);
    assert.notEqual(change.beforeSha256, change.afterSha256, "replacement must change bytes");
  }
  assert(
    Array.isArray(scope.preservations) && scope.preservations.length <= 1,
    "invalid preservation receipt"
  );
  for (const retain of scope.preservations) {
    keys(retain, ["path", "publishedSha256", "candidateSha256"], "preservation");
    assert.equal(retain.path, preservedOgp, "unreviewed preservation path");
    hash(retain.publishedSha256);
    hash(retain.candidateSha256);
    assert.notEqual(
      retain.publishedSha256,
      retain.candidateSha256,
      "redundant preservation receipt"
    );
  }
}
function withoutJpegComments(bytes) {
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, "JPEG required for metadata preservation");
  const parts = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    assert(bytes[offset] === 0xff, "invalid JPEG segment");
    const marker = bytes[offset + 1];
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset));
      return Buffer.concat(parts);
    }
    assert(
      marker !== 0xd8 && marker !== 0xd9 && !(marker >= 0xd0 && marker <= 0xd7),
      "unexpected JPEG marker"
    );
    const size = bytes.readUInt16BE(offset + 2);
    assert(size >= 2 && offset + 2 + size <= bytes.length, "invalid JPEG segment length");
    if (marker !== 0xfe) {
      parts.push(bytes.subarray(offset, offset + 2 + size));
    }
    offset += 2 + size;
  }
  assert.fail("JPEG scan missing");
}
async function sourceRelease(root, expect, revision) {
  await noLinks(root);
  await verifyRelease({ out: root, expect, target: "public-web" });
  const seal = JSON.parse(await readFile(path.join(root, "release.json"), "utf8"));
  assert.equal(seal.revision, revision, "stale sealed source revision");
  assert(seal.worker === null && seal.overlay === null, "public-only release required");
  assert.equal(seal.public.length, 32, "exact public candidate size required");
  assertExactSet(
    "public candidate paths",
    seal.public.map((f) => f.path),
    publicFiles
  );
  return seal;
}
async function records(root) {
  return Promise.all(
    (await listFiles(root)).map(async (name) => {
      const file = path.join(root, safePath(name));
      return record(
        name,
        await readFile(file),
        (await lstat(file)).mode & 0o111 ? "100755" : "100644"
      );
    })
  );
}
async function put(root, name, bytes, mode = "100644") {
  const destination = path.join(root, safePath(name));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  await chmod(destination, mode === "100755" ? 0o755 : 0o644);
}
async function newOutput(out, inputs, build) {
  const destination = path.resolve(out);
  await noLinks(path.dirname(destination));
  for (const input of inputs) {
    const root = path.resolve(input);
    assert(
      destination !== root &&
        !destination.startsWith(root + path.sep) &&
        !root.startsWith(destination + path.sep),
      "output/input overlap"
    );
  }
  await mkdir(destination, { mode: 0o700 }); // Existing outputs are never replaced.
  try {
    return await build(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function prepare(args) {
  const source = await repository(args.sourceRepo, args.expectSource, "akashic", "main");
  const pages = await repository(args.pagesRepo, args.expectPages, "akashic-games", "gh-pages");
  const { bytes: scopeBytes, value: scope } = await readJson(args.scope, args.expectScope);
  scopeContract(scope);
  assert.equal(scope.sourceCommit, args.expectSource, "scope source mismatch");
  assert.equal(scope.publishedCommit, args.expectPages, "scope published SHA mismatch");
  assert.equal(scope.releaseSha256, args.expectRelease, "scope release mismatch");
  const release = await noLinks(args.release);
  await sourceRelease(release, hash(args.expectRelease), args.expectSource);
  const original = baseline(pages, args.expectPages);
  const baseRecords = [...original.values()]
    .map((f) => f.record)
    .toSorted((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  assert.equal(treeHash(baseRecords), scope.publishedTree, "scope published tree mismatch");
  const selected = new Map();
  for (const name of publicFiles) {
    assert(original.has(name), `new public file forbidden: ${name}`);
    const bytes = await readFile(path.join(release, "public", name));
    const before = original.get(name).bytes;
    const change = scope.replacements.find((item) => item.path === name);
    const retain = scope.preservations.find((item) => item.path === name);
    if (change) {
      assert.equal(sha256(before), change.beforeSha256, `before hash mismatch: ${name}`);
      assert.equal(sha256(bytes), change.afterSha256, `after hash mismatch: ${name}`);
      if (name.endsWith("LICENSE.txt")) {
        assert.equal(
          before.toString("utf8").replace(/\s/gu, ""),
          bytes.toString("utf8").replace(/\s/gu, ""),
          "license text change outside compiler scope"
        );
      }
      selected.set(name, bytes);
    } else if (retain) {
      assert.equal(sha256(before), retain.publishedSha256, "preserved published hash mismatch");
      assert.equal(sha256(bytes), retain.candidateSha256, "preserved candidate hash mismatch");
      assert(
        withoutJpegComments(before).equals(withoutJpegComments(bytes)),
        "unreviewed JPEG pixels/structure changed"
      );
    } else {
      assert(before.equals(bytes), `unapproved candidate difference: ${name}`);
    }
  }
  return newOutput(args.out, [source, pages, release, args.scope], async (out) => {
    for (const [name, file] of original) {
      await put(path.join(out, "site"), name, selected.get(name) ?? file.bytes, file.record.mode);
    }
    for (const name of replacements) {
      await put(path.join(out, "rollback"), name, original.get(name).bytes);
    }
    for (const name of await listFiles(release)) {
      await put(path.join(out, "verified-source"), name, await readFile(path.join(release, name)));
    }
    await put(out, "approved-scope.json", scopeBytes);
    const plan = {
      schema: 1,
      execution: "LOCAL_ONLY_NOT_PUBLISHED",
      direction: "forward",
      sourceCommit: args.expectSource,
      publishedCommit: args.expectPages,
      publishedTree: scope.publishedTree,
      releaseSha256: args.expectRelease,
      scopeSha256: args.expectScope,
      baseline: baseRecords,
      site: await records(path.join(out, "site")),
    };
    plan.siteTree = treeHash(plan.site);
    await put(out, "update.json", json(plan));
    const expect = sha256(json(plan));
    await verifyPrepared({ out, expect });
    await repository(source, args.expectSource, "akashic", "main");
    await repository(pages, args.expectPages, "akashic-games", "gh-pages");
    return {
      out,
      planSha256: expect,
      siteTree: plan.siteTree,
      changed: replacements,
      execution: plan.execution,
    };
  });
}

export async function verifyPrepared({ out, expect }) {
  await noLinks(out);
  const { value: plan } = await readJson(path.join(out, "update.json"), expect);
  keys(
    plan,
    [
      "schema",
      "execution",
      "direction",
      "sourceCommit",
      "publishedCommit",
      "publishedTree",
      "releaseSha256",
      "scopeSha256",
      "baseline",
      "site",
      "siteTree",
    ],
    "update plan"
  );
  assert(
    plan.schema === 1 &&
      plan.execution === "LOCAL_ONLY_NOT_PUBLISHED" &&
      plan.direction === "forward",
    "invalid prepared plan"
  );
  const { value: scope } = await readJson(path.join(out, "approved-scope.json"), plan.scopeSha256);
  scopeContract(scope);
  assert.equal(scope.sourceCommit, plan.sourceCommit, "plan source mismatch");
  assert.equal(scope.publishedCommit, plan.publishedCommit, "plan published mismatch");
  assert.equal(scope.publishedTree, plan.publishedTree, "plan tree mismatch");
  assert.equal(scope.releaseSha256, plan.releaseSha256, "plan release mismatch");
  await sourceRelease(path.join(out, "verified-source"), plan.releaseSha256, plan.sourceCommit);
  assert(
    Array.isArray(plan.baseline) && plan.baseline.length === 377,
    "invalid baseline inventory"
  );
  const actual = await records(path.join(out, "site"));
  assert.deepEqual(actual, plan.site, "composed site mutated");
  assert.equal(treeHash(actual), plan.siteTree, "composed tree mismatch");
  assert.equal(treeHash(plan.baseline), plan.publishedTree, "baseline tree mismatch");
  assertExactSet(
    "composed baseline paths",
    actual.map((f) => f.path),
    plan.baseline.map((f) => f.path)
  );
  const changes = [];
  for (const before of plan.baseline) {
    keys(before, ["path", "mode", "bytes", "sha256", "gitBlob"], "baseline file");
    assert(["100644", "100755"].includes(before.mode), "invalid baseline file mode");
    const change = scope.replacements.find((item) => item.path === before.path);
    const originalBytes = await readFile(
      path.join(out, change ? "rollback" : "site", safePath(before.path))
    );
    assert.deepEqual(
      record(before.path, originalBytes, before.mode),
      before,
      "baseline/rollback bytes mismatch"
    );
    const after = actual.find((f) => f.path === before.path);
    if (change) {
      assert.equal(before.sha256, change.beforeSha256, "approved before mismatch");
      assert.equal(after.sha256, change.afterSha256, "approved after mismatch");
      assert.equal(before.mode, after.mode, "file mode replacement forbidden");
      const source = await readFile(path.join(out, "verified-source/public", before.path));
      assert.equal(sha256(source), after.sha256, "replacement differs from verified source");
      if (before.path.endsWith("LICENSE.txt")) {
        assert.equal(
          originalBytes.toString("utf8").replace(/\s/gu, ""),
          source.toString("utf8").replace(/\s/gu, ""),
          "license text change outside compiler scope"
        );
      }
      changes.push(before.path);
    } else {
      assert.deepEqual(after, before, "unapproved output change");
    }
  }
  assertExactSet("actual replacements", changes, replacements);
  // Recheck every retained source path, not just the two replacements.
  for (const name of publicFiles.filter((p) => !replacements.includes(p))) {
    const source = await readFile(path.join(out, "verified-source/public", name));
    const kept = await readFile(path.join(out, "site", name));
    const retain = scope.preservations.find((item) => item.path === name);
    if (retain) {
      assert.equal(sha256(source), retain.candidateSha256, "source preservation mismatch");
      assert.equal(sha256(kept), retain.publishedSha256, "published preservation mismatch");
      assert(
        withoutJpegComments(source).equals(withoutJpegComments(kept)),
        "preserved image structure mismatch"
      );
    } else {
      assert(source.equals(kept), "unapproved retained source difference");
    }
  }
  assertExactSet("prepared package", await listFiles(out), [
    "update.json",
    "approved-scope.json",
    ...actual.map((f) => "site/" + f.path),
    ...replacements.map((name) => "rollback/" + name),
    "verified-source/release.json",
    ...publicFiles.map((name) => "verified-source/public/" + name),
  ]);
  return plan;
}

export async function prepareRollback(args) {
  const plan = await verifyPrepared({ out: args.prepared, expect: args.expectPlan });
  const pages = await repository(args.pagesRepo, args.expectPages, "akashic-games", "gh-pages");
  const current = baseline(pages, args.expectPages);
  assert.equal(
    treeHash([...current.values()].map((f) => f.record)),
    plan.siteTree,
    "rollback target drifted"
  );
  return newOutput(args.out, [pages, args.prepared], async (out) => {
    for (const [name, file] of current) {
      const bytes = replacements.includes(name)
        ? await readFile(path.join(args.prepared, "rollback", name))
        : file.bytes;
      await put(path.join(out, "site"), name, bytes, file.record.mode);
    }
    const site = await records(path.join(out, "site"));
    assert.equal(treeHash(site), plan.publishedTree, "rollback failed to restore original tree");
    const rollback = {
      schema: 1,
      execution: "LOCAL_ONLY_NOT_PUBLISHED",
      direction: "rollback",
      forwardPlanSha256: args.expectPlan,
      expectedPublishedCommit: args.expectPages,
      expectedPublishedTree: plan.siteTree,
      restoredTree: plan.publishedTree,
      site,
    };
    await put(out, "rollback.json", json(rollback));
    const expect = sha256(json(rollback));
    await verifyRollback({ out, expect, prepared: args.prepared, expectPlan: args.expectPlan });
    await repository(pages, args.expectPages, "akashic-games", "gh-pages");
    return {
      out,
      rollbackSha256: expect,
      restoredTree: plan.publishedTree,
      execution: rollback.execution,
    };
  });
}

export async function verifyRollback({ out, expect, prepared, expectPlan }) {
  await noLinks(out);
  const forward = await verifyPrepared({ out: prepared, expect: expectPlan });
  const { value: receipt } = await readJson(path.join(out, "rollback.json"), expect);
  keys(
    receipt,
    [
      "schema",
      "execution",
      "direction",
      "forwardPlanSha256",
      "expectedPublishedCommit",
      "expectedPublishedTree",
      "restoredTree",
      "site",
    ],
    "rollback plan"
  );
  assert(
    receipt.schema === 1 &&
      receipt.execution === "LOCAL_ONLY_NOT_PUBLISHED" &&
      receipt.direction === "rollback",
    "invalid rollback plan"
  );
  hash(receipt.expectedPublishedCommit, 40);
  assert.equal(receipt.forwardPlanSha256, expectPlan, "rollback forward binding mismatch");
  assert.equal(receipt.expectedPublishedTree, forward.siteTree, "rollback expected tree mismatch");
  assert.equal(receipt.restoredTree, forward.publishedTree, "rollback original tree mismatch");
  const actual = await records(path.join(out, "site"));
  assert.deepEqual(actual, receipt.site, "rollback site mutated");
  assert.equal(treeHash(actual), forward.publishedTree, "rollback tree mutated");
  assertExactSet("rollback package", await listFiles(out), [
    "rollback.json",
    ...actual.map((file) => "site/" + file.path),
  ]);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...flags] = process.argv.slice(2);
  const schemas = {
    prepare: [
      "source-repo",
      "expect-source",
      "pages-repo",
      "expect-pages",
      "release",
      "expect-release",
      "scope",
      "expect-scope",
      "out",
    ],
    verify: ["out", "expect"],
    rollback: ["prepared", "expect-plan", "pages-repo", "expect-pages", "out"],
    "verify-rollback": ["out", "expect", "prepared", "expect-plan"],
  };
  try {
    assert(
      Object.hasOwn(schemas, command),
      "use prepare, verify, rollback or verify-rollback; no publication command exists"
    );
    const args = {};
    for (let i = 0; i < flags.length; i += 2) {
      const name = flags[i].replace(/^--/u, "");
      assert(
        flags[i].startsWith("--") &&
          schemas[command].includes(name) &&
          flags[i + 1] &&
          !flags[i + 1].startsWith("--"),
        "invalid argument"
      );
      const key = name.replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
      assert(!Object.hasOwn(args, key), "duplicate argument");
      args[key] = flags[i + 1];
    }
    assert.equal(
      Object.keys(args).length,
      schemas[command].length,
      "all explicit pins/paths required"
    );
    const result = await {
      prepare,
      verify: verifyPrepared,
      rollback: prepareRollback,
      "verify-rollback": verifyRollback,
    }[command](args);
    console.log(
      JSON.stringify(
        command.startsWith("verify")
          ? { status: "verified", siteTree: result.siteTree ?? result.restoredTree }
          : result
      )
    );
  } catch (error) {
    console.error(`prepare-compiler-update: ${error.message}`);
    process.exitCode = 1;
  }
}
