import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservationController } from '../app/observation.js';

function scheduler() {
  let nextId = 0;
  const timers = new Map();
  const run = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  return {
    timers,
    run,
    scheduleFn: (callback) => {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    cancelFn: (id) => timers.delete(id),
  };
}

test('arrival is deferred while composing and stale scene completions are ignored', () => {
  const clock = scheduler();
  let available = false;
  let arrivals = 0;
  const observations = createObservationController({
    ...clock,
    canShowArrival: () => available,
    onArrival: () => { arrivals += 1; },
  });

  const stale = observations.queueArrival();
  observations.invalidate();
  assert.equal(observations.markArrival(stale), false);

  const current = observations.queueArrival();
  assert.equal(observations.markArrival(current), true);
  assert.equal(clock.timers.size, 0, 'a composing screen does not start an arrival timer');
  available = true;
  assert.equal(observations.flush(), true);
  assert.equal(arrivals, 1);
  clock.run();
  assert.equal(arrivals, 1, 'a late timer cannot repeat the arrival');
});

test('noise increases are retained while blocked and duplicate levels are ignored', () => {
  const clock = scheduler();
  let available = false;
  let noise = 0;
  const observations = createObservationController({
    ...clock,
    canQueueNoise: () => true,
    canShowNoise: () => available,
    onNoise: () => { noise += 1; },
  });

  observations.setNoiseLevel(1);
  observations.setNoiseLevel(1);
  observations.setNoiseLevel(2);
  assert.equal(observations.pendingNoise, 2);
  clock.run();
  assert.equal(noise, 0, 'blocked observations remain queued');

  available = true;
  assert.equal(observations.flush(), true);
  assert.equal(observations.flush(), true);
  assert.equal(noise, 2);
  observations.invalidate();
  assert.equal(observations.pendingNoise, 0);
  clock.run();
  assert.equal(noise, 2, 'invalidating a run cancels queued noise');
});

