import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA_SUFFIXES = new Set(['.mp4', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.webm', '.mov', '.avif']);
const MANIFEST_MEDIA_SUFFIXES = new Set(['.mp4', '.jpg', '.jpeg', '.png', '.webp']);
const PIPELINE_PATH = fileURLToPath(new URL('./optimize-media.py', import.meta.url));
const PREPARED_SCHEMA = 'akashic-media-prepared-v1';

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}
export const canonical = (value) => JSON.stringify(sortKeys(value));
export const identityHash = (value) => createHash('sha256').update(canonical(value)).digest('hex');

const digest = async (file) => {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
};

function patternToRegex(pattern) {
  let expression = '';
  for (let index = 0; index < pattern.length;) {
    if (pattern.startsWith('**/', index)) { expression += '(?:.*/)?'; index += 3; continue; }
    if (pattern[index] === '*') { expression += '[^/]*'; index += 1; continue; }
    const char = pattern[index];
    expression += '.+?^${}()|[]\\'.includes(char) ? `\\${char}` : char;
    index += 1;
  }
  return new RegExp(`^${expression}$`);
}

function validateRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')) throw new Error(`invalid ${label}: ${value}`);
  const parts = value.split('/');
  if (parts.includes('..') || parts.includes('.')) throw new Error(`invalid ${label}: ${value}`);
}
function validateGlob(value, label) {
  validateRelativePath(value, label);
  const parts = value.split('/');
  if (/[?\[\]]/.test(value) || parts.some((part) => part.includes('**') && part !== '**')) throw new Error(`invalid ${label}: ${value}`);
}
function configManifestRules(config) {
  if (!Array.isArray(config.manifests)) throw new Error('media config must define a manifests list');
  const seen = new Set();
  return config.manifests.map((rule) => {
    if (!rule || typeof rule.glob !== 'string' || typeof rule.media_root !== 'string') throw new Error('each media manifest rule needs string glob and media_root');
    validateGlob(rule.glob, 'media manifest glob');
    validateRelativePath(rule.media_root, 'media manifest media_root');
    const identity = `${rule.glob}\0${rule.media_root}`;
    if (seen.has(identity)) throw new Error(`duplicate media manifest rule: ${identity}`);
    seen.add(identity);
    return { ...rule, regex: patternToRegex(rule.glob) };
  });
}

function manifestMediaTarget(value, root, mediaRoot) {
  const reference = String(value).split(/[?#]/, 1)[0];
  if (!reference || reference.startsWith('http://') || reference.startsWith('https://') || reference.startsWith('data:')) return null;
  const suffix = reference.slice(reference.lastIndexOf('.')).toLowerCase();
  if (!MANIFEST_MEDIA_SUFFIXES.has(suffix)) return null;
  if (reference.includes('\\') || reference.startsWith('/')) throw new Error(`invalid runtime manifest media path: ${value}`);
  const explicit = reference.startsWith('./');
  const candidate = resolve(explicit ? root : mediaRoot, explicit ? reference.slice(2) : reference);
  const rootResolved = resolve(root);
  const mediaRootResolved = resolve(mediaRoot);
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}/`)) throw new Error(`runtime manifest media path escapes public root: ${value}`);
  if (candidate !== mediaRootResolved && !candidate.startsWith(`${mediaRootResolved}/`)) throw new Error(`runtime manifest media path escapes media_root: ${value}`);
  return { candidate, key: relative(mediaRootResolved, candidate).split('\\').join('/') };
}
function collectManifestReferences(value, root, mediaRoot, references = new Map()) {
  if (Array.isArray(value)) {
    for (const nested of value) collectManifestReferences(nested, root, mediaRoot, references);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key !== 'media_sha256' && key !== 'asset_revision') collectManifestReferences(nested, root, mediaRoot, references);
    }
  } else if (typeof value === 'string') {
    const target = manifestMediaTarget(value, root, mediaRoot);
    if (target) references.set(target.key, target.candidate);
  }
  return references;
}
function matchedManifestPaths(paths, rules, label) {
  const matched = new Map();
  for (const file of paths) {
    const matches = rules.filter((rule) => rule.regex.test(file));
    if (matches.length > 1) throw new Error(`${label} manifest matched multiple rules: ${file}`);
    if (matches.length === 1) matched.set(file, matches[0]);
  }
  for (const rule of rules) if (![...matched.values()].includes(rule)) throw new Error(`media manifest rule matched no files: ${rule.glob}`);
  return matched;
}
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}
export async function assertNoSymlinks(directory, label = directory) {
  const rootInfo = await lstat(directory).catch(() => null);
  if (!rootInfo) throw new Error(`${label} does not exist: ${directory}`);
  if (rootInfo.isSymbolicLink()) throw new Error(`${label} itself must not be a symlink: ${directory}`);
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink() || (await lstat(path)).isSymbolicLink()) throw new Error(`${label} contains a symlink: ${relative(directory, path)}`);
      if (entry.isDirectory()) await visit(path);
    }
  }
  await visit(directory);
}
async function verifyRuntimeManifest({ manifestPath, root, mediaRoot, reportOutputs, reportByOutput, recipeIdentity }) {
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  const references = collectManifestReferences(parsed, root, mediaRoot);
  if (!parsed.media_sha256 || typeof parsed.media_sha256 !== 'object' || Array.isArray(parsed.media_sha256)) throw new Error(`missing runtime media hashes: ${relative(root, manifestPath)}`);
  const actualKeys = Object.keys(parsed.media_sha256).sort();
  const expectedKeys = [...references.keys()].sort();
  if (canonical(actualKeys) !== canonical(expectedKeys)) throw new Error(`runtime media manifest media hash keys mismatch: ${relative(root, manifestPath)} (expected ${expectedKeys.join(',')}; actual ${actualKeys.join(',')})`);
  for (const key of expectedKeys) {
    const target = references.get(key);
    const output = relative(root, target).split('\\').join('/');
    if (!reportOutputs.has(output)) throw new Error(`runtime manifest media is outside optimization report: ${relative(root, manifestPath)}: ${key}`);
    if (reportByOutput.get(output)?.output_sha256 !== parsed.media_sha256[key]) throw new Error(`runtime media manifest hash does not match optimization report: ${relative(root, manifestPath)}: ${key}`);
    if (await digest(target) !== parsed.media_sha256[key]) throw new Error(`runtime media manifest hash mismatch: ${relative(root, manifestPath)}: ${key}`);
  }
  if (parsed.asset_revision !== identityHash({ media_sha256: parsed.media_sha256, recipe: recipeIdentity })) throw new Error(`runtime media revision mismatch: ${relative(root, manifestPath)}`);
}

function safeReceiptPath(value) {
  validateRelativePath(value, 'prepared media receipt');
  if (!value.endsWith('.json')) throw new Error(`prepared media receipt must be JSON: ${value}`);
  return value;
}

function receiptRevision(receipt) {
  const { receipt_revision: _ignored, ...content } = receipt;
  return identityHash(content);
}

function assertDimensions(asset) {
  const dimensions = asset.dimensions;
  if (!dimensions || !Number.isInteger(dimensions.width) || dimensions.width <= 0 || !Number.isInteger(dimensions.height) || dimensions.height <= 0) {
    throw new Error(`prepared media dimensions missing or invalid: ${asset.output}`);
  }
  if (asset.kind === 'video' && (!Number.isFinite(dimensions.frame_rate) || dimensions.frame_rate <= 0 || !Number.isFinite(dimensions.duration) || dimensions.duration < 0 || !Number.isInteger(dimensions.audio_streams) || dimensions.audio_streams < 0)) {
    throw new Error(`prepared video metadata missing or invalid: ${asset.output}`);
  }
}

async function verifyPreparedMedia({ publicRoot, outputFiles, sourceRoot = null, configFile, report }) {
  if (report.schema !== PREPARED_SCHEMA || !Array.isArray(report.assets)) throw new Error('invalid prepared media receipt schema');
  const configBytes = await readFile(configFile);
  const config = JSON.parse(configBytes);
  if (config.prepared?.mode !== 'checked-in' || typeof config.prepared.receipt !== 'string') throw new Error('prepared media config is missing checked-in receipt settings');
  const receiptPath = resolve(configFile, '..', safeReceiptPath(config.prepared.receipt));
  let checkedInReceipt;
  try { checkedInReceipt = JSON.parse(await readFile(receiptPath, 'utf8')); }
  catch (error) { throw new Error(`cannot read checked-in prepared media receipt: ${receiptPath}: ${error.message}`); }
  if (canonical(checkedInReceipt) !== canonical(report)) throw new Error('dist prepared media receipt differs from checked-in receipt');
  if (report.receipt_revision !== receiptRevision(report)) throw new Error('prepared media receipt revision mismatch');
  if (report.config_sha256 !== createHash('sha256').update(configBytes).digest('hex')) throw new Error('prepared media config is stale');
  if (report.recipe_identity?.pipeline_sha256 !== await digest(PIPELINE_PATH)) throw new Error('prepared media tool is stale');
  if (canonical(config.budgets) !== canonical(report.budgets)) throw new Error('prepared media budgets differ from config');
  if (!/^[a-f0-9]{40}$/i.test(report.source_provenance?.base_commit || '') || !report.source_provenance?.recovery_command) throw new Error('prepared media receipt is missing original source provenance');
  if (!Array.isArray(report.source_provenance.source_assets) || report.source_provenance.source_assets.length !== report.assets.length) throw new Error('prepared media receipt is missing source asset provenance');
  const sourceAssets = new Map();
  for (const sourceAsset of report.source_provenance.source_assets) {
    if (!sourceAsset || typeof sourceAsset.path !== 'string' || !/^[a-f0-9]{64}$/.test(sourceAsset.sha256) || !/^[a-f0-9]{40}$/i.test(sourceAsset.commit || '') || typeof sourceAsset.git_path !== 'string' || sourceAssets.has(sourceAsset.path)) throw new Error('prepared media receipt has invalid source asset provenance');
    validateRelativePath(sourceAsset.path, 'prepared media source provenance path');
    validateRelativePath(sourceAsset.git_path, 'prepared media Git source provenance path');
    sourceAssets.set(sourceAsset.path, sourceAsset);
  }
  for (const asset of report.assets) if (sourceAssets.get(asset.source)?.sha256 !== asset.source_sha256) throw new Error(`prepared media source provenance mismatch: ${asset.source}`);
  const sourceCommits = [...new Set([...sourceAssets.values()].map((asset) => asset.commit.toLowerCase()))].sort();
  if (!Array.isArray(report.source_provenance.source_commits) || canonical(report.source_provenance.source_commits.map((commit) => String(commit).toLowerCase()).sort()) !== canonical(sourceCommits)) throw new Error('prepared media source commit coverage is stale');
  if (!report.coverage || report.coverage.assets !== report.assets.length) throw new Error('prepared media receipt coverage is stale');

  const expectedRevision = identityHash({ assets: report.assets.map((asset) => [asset.output, asset.output_sha256]), recipe: report.recipe_identity });
  if (report.asset_revision !== expectedRevision) throw new Error('prepared media asset revision mismatch');
  if (!report.recipe_identity?.recipes || !report.recipe_identity?.toolchain || !/^[a-f0-9]{64}$/.test(report.recipe_identity.pipeline_sha256)) throw new Error('prepared media receipt is missing recipe or toolchain identity');
  if (canonical(config.recipes) !== canonical(report.recipe_identity.recipes)) throw new Error('prepared media recipes differ from config');
  const outputMedia = new Set(outputFiles.filter((file) => MEDIA_SUFFIXES.has(file.slice(file.lastIndexOf('.')).toLowerCase())).map((file) => relative(publicRoot, file).split('\\').join('/')));
  const reportOutputs = new Set();
  const reportByOutput = new Map();
  for (const asset of report.assets) {
    if (!asset || typeof asset.output !== 'string' || asset.output.startsWith('/') || asset.output.includes('..') || !asset.output.startsWith('assets/')) throw new Error(`invalid prepared media output path: ${asset?.output}`);
    if (typeof asset.source !== 'string') throw new Error(`invalid prepared media source path: ${asset?.output}`);
    validateRelativePath(asset.source, 'prepared media source path');
    const output = asset.output.split('\\').join('/');
    if (reportOutputs.has(output)) throw new Error(`duplicate prepared media output: ${output}`);
    if (!['video', 'jpeg', 'png'].includes(asset.kind) || typeof asset.recipe !== 'string' || !config.assets.some((rule) => rule.kind === asset.kind && rule.recipe === asset.recipe)) throw new Error(`invalid prepared media asset kind or recipe: ${output}`);
    if (!Number.isInteger(asset.source_bytes) || asset.source_bytes <= 0 || !/^[a-f0-9]{64}$/.test(asset.source_sha256) || !Number.isInteger(asset.output_bytes) || asset.output_bytes <= 0 || !/^[a-f0-9]{64}$/.test(asset.output_sha256)) throw new Error(`invalid prepared media hashes or sizes: ${output}`);
    const preparation = asset.preparation;
    const sourceProvenance = sourceAssets.get(asset.source);
    if (!preparation || !sourceProvenance || typeof preparation.source_basename !== 'string' || !preparation.source_basename || preparation.source_basename.includes('/') || !/^[a-f0-9]{64}$/.test(preparation.source_sha256) || preparation.source_sha256 !== asset.source_sha256 || preparation.source_commit !== sourceProvenance.commit || preparation.source_path !== sourceProvenance.git_path || preparation.config_sha256 !== report.config_sha256 || !/^[a-f0-9]{64}$/.test(preparation.optimizer_config_sha256) || !preparation.recipe_identity || !preparation.toolchain || canonical(preparation.recipe_identity.recipes) !== canonical(config.recipes) || preparation.recipe_identity.pipeline_sha256 !== report.recipe_identity.pipeline_sha256 || canonical(preparation.recipe_identity.toolchain) !== canonical(preparation.toolchain)) throw new Error(`invalid prepared media provenance: ${output}`);
    assertDimensions(asset);
    reportOutputs.add(output); reportByOutput.set(output, asset);
    const file = join(publicRoot, output);
    const info = await stat(file).catch(() => null);
    if (!info) throw new Error(`prepared media output missing: ${output}`);
    if (info.size !== asset.output_bytes || await digest(file) !== asset.output_sha256) throw new Error(`prepared media hash/size mismatch: ${output}`);
    if (asset.kind === 'png' && !output.toLowerCase().endsWith('.webp')) throw new Error(`prepared PNG output must be WebP: ${output}`);
    if (asset.kind === 'jpeg' && !/\.(?:jpg|jpeg)$/i.test(output)) throw new Error(`prepared JPEG output has invalid suffix: ${output}`);
    if (asset.kind === 'video' && !output.toLowerCase().endsWith('.mp4')) throw new Error(`prepared video output has invalid suffix: ${output}`);
  }
  if (outputMedia.size !== reportOutputs.size || [...outputMedia].some((file) => !reportOutputs.has(file))) throw new Error('public media set differs from prepared media receipt');
  if (sourceRoot) {
    const sourceFiles = await walk(resolve(sourceRoot));
    const sourceMedia = new Set(sourceFiles.filter((file) => MEDIA_SUFFIXES.has(file.slice(file.lastIndexOf('.')).toLowerCase())).map((file) => relative(resolve(sourceRoot), file).split('\\').join('/')));
    if (sourceMedia.size !== reportOutputs.size || [...sourceMedia].some((file) => !reportOutputs.has(file))) throw new Error('prepared app media set differs from prepared media receipt');
    for (const output of reportOutputs) {
      const sourceFile = join(resolve(sourceRoot), output);
      const info = await stat(sourceFile).catch(() => null);
      const asset = reportByOutput.get(output);
      if (!info || info.size !== asset.output_bytes || await digest(sourceFile) !== asset.output_sha256) throw new Error(`prepared app media hash/size mismatch: ${output}`);
    }
  }
  if (!report.totals || report.totals.assets !== report.assets.length || report.totals.output_bytes !== report.assets.reduce((sum, asset) => sum + asset.output_bytes, 0)) throw new Error('prepared media totals are stale');

  const rules = configManifestRules(config);
  const outputFilesRelative = outputFiles.map((file) => relative(publicRoot, file).split('\\').join('/')).filter((file) => file.endsWith('.json'));
  const outputManifests = matchedManifestPaths(outputFilesRelative, rules, 'public');
  const receiptManifests = new Map((Array.isArray(report.runtime_manifests) ? report.runtime_manifests : []).map((entry) => [entry.path, entry]));
  if (receiptManifests.size !== outputManifests.size || [...outputManifests.keys()].some((path) => !receiptManifests.has(path))) throw new Error('prepared receipt runtime manifest coverage is stale');
  for (const [manifest, rule] of outputManifests) {
    const entry = receiptManifests.get(manifest);
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`invalid prepared runtime manifest receipt: ${manifest}`);
    const manifestPath = join(publicRoot, manifest);
    if (await digest(manifestPath) !== entry.sha256) throw new Error(`prepared runtime manifest hash mismatch: ${manifest}`);
    const parsedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (entry.asset_revision !== parsedManifest.asset_revision || canonical(entry.media_sha256) !== canonical(parsedManifest.media_sha256)) throw new Error(`prepared runtime manifest receipt is stale: ${manifest}`);
    await verifyRuntimeManifest({ manifestPath, root: publicRoot, mediaRoot: resolve(publicRoot, rule.media_root), reportOutputs, reportByOutput, recipeIdentity: report.recipe_identity });
  }
  const total = report.assets.reduce((sum, asset) => sum + asset.output_bytes, 0);
  const videoTotal = report.assets.filter((asset) => asset.kind === 'video').reduce((sum, asset) => sum + asset.output_bytes, 0);
  const imageTotal = report.assets.filter((asset) => asset.kind === 'jpeg' || asset.kind === 'png').reduce((sum, asset) => sum + asset.output_bytes, 0);
  if (total > report.budgets.total_bytes || videoTotal > report.budgets.video_bytes || imageTotal > report.budgets.image_bytes) throw new Error('prepared media budget exceeded');
  for (const asset of report.assets) {
    const limit = asset.kind === 'video' ? report.budgets.video_asset_bytes : report.budgets.image_asset_bytes;
    if (asset.output_bytes > limit) throw new Error(`prepared media per-file budget exceeded: ${asset.output}`);
  }
  return report;
}

export async function verifyMedia({ root, files, sourceRoot = null, configFile = null, reportFile = null }) {
  const publicRoot = resolve(root);
  await assertNoSymlinks(publicRoot, 'prepared media root');
  if (sourceRoot) await assertNoSymlinks(resolve(sourceRoot), 'prepared media source root');
  if (Boolean(sourceRoot) !== Boolean(configFile)) throw new Error('media verification requires both source and config');
  const reportPath = reportFile ? resolve(reportFile) : join(publicRoot, '..', 'media-report.json');
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT' && !sourceRoot && !configFile && !publicRoot.endsWith('/dist/public')) return;
    throw error;
  }
  if (report.schema === PREPARED_SCHEMA) return verifyPreparedMedia({ publicRoot, outputFiles: files || await walk(publicRoot), sourceRoot, configFile, report });
  if (report.schema !== 'akashic-media-optimization-v1' || !Array.isArray(report.assets)) throw new Error('invalid media optimization report schema');
  const expectedRevision = identityHash({ assets: report.assets.map((asset) => [asset.output, asset.output_sha256]), recipe: report.recipe_identity });
  if (report.asset_revision !== expectedRevision) throw new Error('media report revision mismatch');
  const outputFiles = files || await walk(publicRoot);
  const outputMedia = new Set(outputFiles.filter((file) => MEDIA_SUFFIXES.has(file.slice(file.lastIndexOf('.')).toLowerCase())).map((file) => relative(publicRoot, file).split('\\').join('/')));
  const reportOutputs = new Set();
  const reportByOutput = new Map();
  for (const asset of report.assets) {
    if (!asset.output || asset.output.startsWith('/') || asset.output.includes('..')) throw new Error(`invalid media report output path: ${asset.output}`);
    const output = asset.output.split('\\').join('/');
    if (reportOutputs.has(output)) throw new Error(`duplicate media report output: ${output}`);
    reportOutputs.add(output); reportByOutput.set(output, asset);
    const file = join(publicRoot, output);
    const info = await stat(file).catch(() => null);
    if (!info) throw new Error(`media report output missing: ${output}`);
    if (info.size !== asset.output_bytes || await digest(file) !== asset.output_sha256) throw new Error(`media report hash/size mismatch: ${output}`);
    if (output.toLowerCase().endsWith('.png')) throw new Error(`optimized public output still contains PNG: ${output}`);
  }
  if (outputMedia.size !== reportOutputs.size || [...outputMedia].some((file) => !reportOutputs.has(file))) throw new Error('public media set differs from optimization report');
  if (sourceRoot && configFile) {
    const source = resolve(sourceRoot);
    const configBytes = await readFile(configFile);
    if (report.config_sha256 !== createHash('sha256').update(configBytes).digest('hex')) throw new Error('media optimization config is stale');
    if (report.recipe_identity?.pipeline_sha256 !== await digest(PIPELINE_PATH)) throw new Error('media optimization tool is stale');
    const config = JSON.parse(configBytes);
    if (canonical(config.budgets) !== canonical(report.budgets)) throw new Error('media report budgets differ from config');
    const assetRules = (config.assets || []).map((rule) => {
      if (!rule || typeof rule.glob !== 'string' || typeof rule.kind !== 'string') throw new Error('each media asset rule needs string glob and kind');
      validateGlob(rule.glob, 'media asset glob');
      return { ...rule, regex: patternToRegex(rule.glob) };
    });
    const sourceFiles = await walk(source);
    const expectedSources = new Map();
    for (const file of sourceFiles.filter((item) => MEDIA_SUFFIXES.has(item.slice(item.lastIndexOf('.')).toLowerCase()))) {
      const rel = relative(source, file).split('\\').join('/');
      const matches = assetRules.filter((rule) => rule.regex.test(rel));
      if (matches.length === 0) throw new Error(`unoptimized source media: ${rel}`);
      if (matches.length > 1) throw new Error(`media asset matched multiple rules: ${rel}`);
      expectedSources.set(rel, { kind: matches[0].kind, bytes: (await stat(file)).size, sha256: await digest(file) });
    }
    const reportSources = new Map();
    for (const asset of report.assets) {
      if (reportSources.has(asset.source)) throw new Error(`duplicate media report source: ${asset.source}`);
      reportSources.set(asset.source, asset);
      const expected = expectedSources.get(asset.source);
      if (!expected || expected.kind !== asset.kind || expected.bytes !== asset.source_bytes || expected.sha256 !== asset.source_sha256) throw new Error(`media report source is stale: ${asset.source}`);
    }
    if (reportSources.size !== expectedSources.size) throw new Error('media report does not cover every configured source asset');
    const rules = configManifestRules(config);
    const sourceFilesRelative = sourceFiles.map((file) => relative(source, file).split('\\').join('/')).filter((file) => file.endsWith('.json'));
    const outputFilesRelative = outputFiles.map((file) => relative(publicRoot, file).split('\\').join('/')).filter((file) => file.endsWith('.json'));
    const sourceManifests = matchedManifestPaths(sourceFilesRelative, rules, 'source');
    const outputManifests = matchedManifestPaths(outputFilesRelative, rules, 'public');
    if (canonical([...sourceManifests.keys()].sort()) !== canonical([...outputManifests.keys()].sort())) throw new Error('runtime manifest set differs from configured source manifests');
    for (const [manifest, rule] of outputManifests) await verifyRuntimeManifest({ manifestPath: join(publicRoot, manifest), root: publicRoot, mediaRoot: resolve(publicRoot, rule.media_root), reportOutputs, reportByOutput, recipeIdentity: report.recipe_identity });
  } else {
    for (const manifestPath of outputFiles.filter((file) => file.endsWith('manifest.json'))) await verifyRuntimeManifest({ manifestPath, root: publicRoot, mediaRoot: join(publicRoot, 'assets', 'video'), reportOutputs, reportByOutput, recipeIdentity: report.recipe_identity });
  }
  const total = report.assets.reduce((sum, asset) => sum + asset.output_bytes, 0);
  if (total !== report.totals.output_bytes || total > report.budgets.total_bytes) throw new Error('media report total budget/hash mismatch');
  const videoTotal = report.assets.filter((asset) => asset.kind === 'video').reduce((sum, asset) => sum + asset.output_bytes, 0);
  const imageTotal = report.assets.filter((asset) => asset.kind === 'jpeg' || asset.kind === 'png').reduce((sum, asset) => sum + asset.output_bytes, 0);
  if (videoTotal > report.budgets.video_bytes || imageTotal > report.budgets.image_bytes) throw new Error('media report category budget exceeded');
  for (const asset of report.assets) {
    const limit = asset.kind === 'video' ? report.budgets.video_asset_bytes : report.budgets.image_asset_bytes;
    if (asset.output_bytes > limit) throw new Error(`media report per-file budget exceeded: ${asset.output}`);
  }
  return report;
}
