import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA_SUFFIXES = new Set(['.mp4', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.webm', '.mov', '.avif']);
const MANIFEST_MEDIA_SUFFIXES = new Set(['.mp4', '.jpg', '.jpeg', '.png', '.webp']);
const PIPELINE_PATH = fileURLToPath(new URL('./optimize-media.py', import.meta.url));

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

export async function verifyMedia({ root, files, sourceRoot = null, configFile = null }) {
  const publicRoot = resolve(root);
  if (Boolean(sourceRoot) !== Boolean(configFile)) throw new Error('media verification requires both source and config');
  const reportPath = join(publicRoot, '..', 'media-report.json');
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT' && !sourceRoot && !configFile && !publicRoot.endsWith('/dist/public')) return;
    throw error;
  }
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
