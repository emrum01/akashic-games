import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HYBRID_TIMING,
  SHOT_DURATION,
  beamPower,
  moteAt,
  motes,
  targetOpacity,
  targetPower,
} from '../app/beam-effects/timing.js';
import { textureSourceInfo } from '../app/beam-effects/webgl.js';
import { measureAimPoints } from '../app/beam-effects/geometry.js';

test('the long shot sustains its beam and settles cleanly', () => {
  assert.equal(SHOT_DURATION, 6);
  assert.ok(beamPower(.8) > .9, 'the beam reaches full power after charge');
  assert.ok(beamPower(3.9) > .9, 'the beam remains active during the long irradiation');
  assert.equal(beamPower(4.6), 0, 'the beam is off after its fade window');
  assert.equal(targetOpacity(4.45), 0, 'the insect is gone at the end of dissolve');
  assert.equal(targetPower(HYBRID_TIMING.targetFxOff), 0, 'the local GLSL effect has a finite tail');
});

test('motes finish their own lifetimes and never respawn after emission stops', () => {
  const residual = motes.some((mote) => moteAt(mote, HYBRID_TIMING.emitStop + .2));
  assert.equal(residual, true, 'some motes remain visible briefly after the emitter stops');
  assert.equal(motes.some((mote) => moteAt(mote, 5.5)), false, 'all motes have faded by the shot tail');
});

test('target anchor geometry ignores animated target transforms', () => {
  const app = { left: 100, top: 40, width: 1000, height: 700 };
  const muzzle = { left: 820, top: 590, width: 0, height: 0 };
  const first = measureAimPoints(app, { left: 300, top: 130, width: 200, height: 200 }, muzzle, { x: 400, y: 230 });
  const transformed = measureAimPoints(app, { left: 360, top: 170, width: 80, height: 80 }, muzzle, { x: 400, y: 230 });
  assert.deepEqual([first.tx, first.ty], [400, 230]);
  assert.deepEqual([transformed.tx, transformed.ty], [400, 230]);
  assert.deepEqual([first.mx, first.my], [720, 550]);
});

// A completed door video stays visible while its poster may still show a closed door.
test('background textures accept decoded video frames and track their frame time', () => {
  const frame = { currentSrc: 'door-open.mp4', videoWidth: 1920, videoHeight: 1080, readyState: 2, currentTime: 8 };
  const first = textureSourceInfo(frame);
  assert.equal(first.width / first.height, 16 / 9);
  assert.equal(textureSourceInfo({ ...frame, readyState: 1 }), null);
  assert.notEqual(textureSourceInfo({ ...frame, currentTime: 9 }).key, first.key);
  assert.equal(textureSourceInfo({ ...frame, videoWidth: 0 }), null);
  assert.equal(textureSourceInfo({ src: 'poster.jpg', naturalWidth: 900, naturalHeight: 1600, complete: true }).height, 1600);
  assert.equal(textureSourceInfo(null), null);
});
