import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCaptureReports } from '../scripts/capture-checkpoints/finalize-capture.mjs';

const edges = ['hall-entrance','entrance-rear-door','rear-door-cross','cross-key','key-cabinet','cabinet-open','cabinet-take','cabinet-stow','cabinet-door-key','cabinet-rear-door','rear-door-open'];

function fixture() {
  const info = { scene:{sha256:'a'.repeat(64)}, loaded_scene_sha256:'a'.repeat(64), gun_sha256:'b'.repeat(64), padlock_sha256:'c'.repeat(64) };
  const cameras = Object.fromEntries(['wide','portrait'].map((profile) => [profile, {
    profile, sourceScene:info.scene.sha256, loadedSceneSha256:info.loaded_scene_sha256, gunSha256:info.gun_sha256, padlockSha256:info.padlock_sha256,
    records:Object.fromEntries(edges.map((edge) => [edge, { seconds:3, frames:90 }]))
  }]));
  return { info, cameras };
}

test('checkpoint finalization rejects stale loaded scene bytes and incomplete edges', () => {
  const good = fixture();
  assert.doesNotThrow(() => validateCaptureReports(good.info, good.cameras));
  const stale = fixture(); stale.info.loaded_scene_sha256 = 'd'.repeat(64);
  assert.throws(() => validateCaptureReports(stale.info, stale.cameras), /Loaded scene hash/);
  const profileMismatch = fixture(); profileMismatch.cameras.portrait.loadedSceneSha256 = 'd'.repeat(64);
  assert.throws(() => validateCaptureReports(profileMismatch.info, profileMismatch.cameras), /Capture identity mismatch/);
  const missing = fixture(); delete missing.cameras.wide.records['rear-door-open'];
  assert.throws(() => validateCaptureReports(missing.info, missing.cameras), /Incomplete capture edges/);
});
