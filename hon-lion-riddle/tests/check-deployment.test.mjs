import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyDeployment } from '../scripts/check-deployment.mjs';

const base = 'https://games.example/turtle-soup/manor/';

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hon-lion-deployment-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'index.html'), '<html>current game</html>');
  await writeFile(join(dir, 'game.js'), 'currentGame();');
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url.pathname, options]);
    assert.ok(url.pathname.startsWith('/turtle-soup/manor/'));
    const path = url.pathname.slice('/turtle-soup/manor/'.length);
    if (overrides[path]) return overrides[path]();
    if (path === 'api/status') return Response.json({ configured: true, model: 'jev-latest' });
    if (path === '') return new Response('<html>current game</html>');
    if (path === 'game.js') return new Response('currentGame();');
    throw new Error('Unexpected request');
  };
  return { dir, calls, fetchImpl };
}

test('deployment verifies current bytes and configuration without paid API calls', async t => {
  const { dir, calls, fetchImpl } = await fixture(t);
  assert.equal(await verifyDeployment(base, dir, fetchImpl), 2);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([path, options]) => !path.includes('chat') && !options.method));
  assert.ok(calls.every(([, options]) => options.redirect === 'error' && options.cache === 'no-store'));
});

for (const [name, status] of [
  ['missing secrets or rate limiter', { configured: false, model: 'jev-latest' }],
  ['local demo', { configured: true, model: 'local-demo' }],
]) {
  test(`deployment rejects ${name}`, async t => {
    const { dir, fetchImpl } = await fixture(t, { 'api/status': () => Response.json(status) });
    await assert.rejects(verifyDeployment(base, dir, fetchImpl), /configuration is unavailable/);
  });
}

test('deployment rejects an HTML fallback for the status API', async t => {
  const { dir, fetchImpl } = await fixture(t, {
    'api/status': () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }),
  });
  await assert.rejects(verifyDeployment(base, dir, fetchImpl), /JSON response/);
});

test('deployment rejects an old build even when HTTP succeeds', async t => {
  const { dir, fetchImpl } = await fixture(t, { 'game.js': () => new Response('oldGame();') });
  await assert.rejects(verifyDeployment(base, dir, fetchImpl), /differs from this build: game.js/);
});

test('deployment rejects unavailable assets', async t => {
  const { dir, fetchImpl } = await fixture(t, { 'game.js': () => new Response('unavailable', { status: 503 }) });
  await assert.rejects(verifyDeployment(base, dir, fetchImpl), /asset request failed/);
});
