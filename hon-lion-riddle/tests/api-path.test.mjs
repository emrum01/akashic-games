import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiEndpoints, isMountedPath } from '../app/api-path.js';

test('uses local API aliases at the root and for near-mount paths', () => {
  for (const pathname of ['/', '/?demo=1', '/turtle-soup/manor-other/', '/turtle-soup/manor-house/']) {
    assert.equal(isMountedPath(pathname), false, pathname);
    assert.deepEqual(getApiEndpoints(pathname), { chat: '/api/hon-lion/chat', status: '/api/hon-lion/status' });
  }
});

test('uses mounted API paths for the canonical manor and its index alias', () => {
  for (const pathname of ['/turtle-soup/manor/', '/turtle-soup/manor/index.html', '/turtle-soup/manor/index.html?from=legacy']) {
    assert.equal(isMountedPath(pathname), true, pathname);
    assert.deepEqual(getApiEndpoints(pathname), { chat: '/turtle-soup/manor/api/chat', status: '/turtle-soup/manor/api/status' });
  }
});
