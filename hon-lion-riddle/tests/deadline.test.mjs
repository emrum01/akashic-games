import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeadlineController, GAME_DURATION_MS, NOISE_STEPS } from '../app/deadline.js';

function harness() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const noise = [];
  let expired = 0;
  const controller = createDeadlineController({
    now: () => now,
    setTimeoutFn: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id),
    onNoise: (level) => noise.push({ level, at: now }),
    onExpire: () => { expired += 1; },
  });
  const advance = (milliseconds, runTimers = true) => {
    now += milliseconds;
    if (!runTimers) return;
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= now && timers.delete(id)) timer.callback();
    }
  };
  return { controller, advance, noise, get now() { return now; }, get expired() { return expired; }, timers };
}

test('starts once, emits progressive noise steps, and expires at the wall-clock boundary', () => {
  const x = harness();
  assert.equal(x.controller.start(), true);
  assert.equal(x.controller.start(), false);
  assert.equal(x.controller.deadlineMs, GAME_DURATION_MS);
  for (const step of NOISE_STEPS.slice(1)) {
    x.advance(step.elapsedMs - x.now);
    assert.equal(x.noise.at(-1).level, step.level);
  }
  assert.equal(x.noise.at(-1).level, 5);
  x.advance(GAME_DURATION_MS - x.now - 1);
  assert.equal(x.controller.check(), false, 'one millisecond before the deadline is still playable');
  x.advance(1);
  assert.equal(x.controller.expired, true);
  assert.equal(x.expired, 1);
  assert.equal(x.controller.check(), true);
});

test('a suspended tab still expires on the first visible check', () => {
  const x = harness();
  x.controller.start();
  x.advance(GAME_DURATION_MS + 1, false);
  assert.equal(x.expired, 0, 'a backgrounded timer may not have fired');
  assert.equal(x.controller.check(), true);
  assert.equal(x.expired, 1, 'the visible check enforces the original wall-clock deadline');
});

test('a background jump emits every crossed noise level in order', () => {
  const x = harness();
  x.controller.start();
  assert.deepEqual(x.noise.map(({ level }) => level), [0]);
  x.advance(17 * 60 * 1000, false);
  assert.equal(x.controller.check(), false);
  assert.deepEqual(x.noise.map(({ level }) => level), [0, 1, 2, 3]);
  assert.equal(x.controller.check(), false, 'rechecking at the same time does not duplicate levels');
  assert.deepEqual(x.noise.map(({ level }) => level), [0, 1, 2, 3]);
  x.advance(60 * 1000, false);
  x.controller.check();
  assert.deepEqual(x.noise.map(({ level }) => level), [0, 1, 2, 3, 4]);
  x.controller.stop();
  x.controller.start();
  assert.equal(x.noise.at(-1).level, 0, 'replay starts a fresh level sequence');
});

test('stop clears the deadline and allows a clean replay start', () => {
  const x = harness();
  x.controller.start();
  assert.ok(x.timers.size > 0);
  x.controller.stop();
  assert.equal(x.timers.size, 0);
  assert.equal(x.controller.started, false);
  assert.equal(x.controller.start(), true);
  assert.equal(x.controller.deadlineMs, x.now + GAME_DURATION_MS);
});

test('a stale timeout callback cannot expire a stopped run', () => {
  const x = harness();
  x.controller.start();
  const staleCallback = [...x.timers.values()][0].callback;
  x.controller.stop();
  staleCallback();
  assert.equal(x.expired, 0);
  assert.equal(x.controller.expired, false);
});

test('check keeps one clock sample authoritative when the clock crosses the boundary', () => {
  let now = 0;
  const timers = new Map();
  let nextId = 0;
  let readsAfterStart = 0;
  let expired = 0;
  const controller = createDeadlineController({
    now: () => {
      if (now === GAME_DURATION_MS - 1) {
        readsAfterStart += 1;
        return readsAfterStart === 1 ? now : GAME_DURATION_MS + 1;
      }
      return now;
    },
    setTimeoutFn: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id),
    onExpire: () => { expired += 1; },
  });
  controller.start();
  now = GAME_DURATION_MS - 1;
  assert.equal(controller.check(), false);
  assert.equal(expired, 0, 'a second clock read must not expire this check');
  now = GAME_DURATION_MS + 1;
  assert.equal(controller.check(), true);
  assert.equal(expired, 1);
});
