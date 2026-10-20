import { readFile, readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const defaultBase = 'https://games.escape-safari.com/turtle-soup/manor/';
const defaultDist = fileURLToPath(new URL('../dist/public/', import.meta.url));
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.svg']);

async function publicTextFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) {
      files.push(...await publicTextFiles(join(directory, entry.name), relative + '/'));
    } else if (textExtensions.has(extname(entry.name))) {
      files.push(relative);
    }
  }
  return files;
}

// Read-only smoke check: never sends a chat request or spends JEV credits.
// Compare actual bytes, since a 200 response could be an old build or SPA fallback.
export async function verifyDeployment(baseUrl = defaultBase, dist = defaultDist, fetchImpl = fetch) {
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith('/')) throw new Error('Deployment URL must end with /');
  const options = { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) };
  const status = await fetchImpl(new URL('api/status', base), options);
  if (!status.ok || !status.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Worker status is not a successful JSON response');
  }
  const configuration = await status.json();
  if (configuration.configured !== true || !configuration.model || configuration.model === 'local-demo') {
    throw new Error('Production JEV/Rate Limiting configuration is unavailable');
  }
  const files = await publicTextFiles(dist);
  if (!files.includes('index.html') || !files.includes('game.js')) {
    throw new Error('Build the public assets before checking the deployment');
  }
  for (const relative of files) {
    const url = new URL(relative === 'index.html' ? './' : relative, base);
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Public asset request failed: ${relative}`);
    const actual = Buffer.from(await response.arrayBuffer());
    const expected = await readFile(join(dist, relative));
    if (!actual.equals(expected)) throw new Error(`Public asset differs from this build: ${relative}`);
  }
  return files.length;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const count = await verifyDeployment(process.argv[2]);
      console.log(`Deployment verified: ${count} public text assets and configured Worker.`);
      break;
    } catch (error) {
      if (attempt === 6) throw error;
      console.log(`Deployment check ${attempt}/6 has not passed; retrying in 5 seconds.`);
      await setTimeout(5000);
    }
  }
}
