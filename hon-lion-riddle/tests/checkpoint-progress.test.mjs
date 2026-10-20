import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_IDS, CHECKPOINT_STEP_IDS, createCheckpointProgress } from '../app/checkpoint-progress.js';
import { CHECKPOINT_PROCEDURES, createCheckpointStepRunner } from '../app/checkpoint-procedures.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

test('any discovery order advances ordinal procedures, not condition-specific procedures', async () => {
  for (const order of [CHECKPOINT_IDS, [...CHECKPOINT_IDS].reverse(), ['cp3','cp1','cp5','cp2','cp4']]) {
    const calls = [];
    const progress = createCheckpointProgress({ runStep: async id => { calls.push(id); return { completed: true }; } });
    for (const id of order) {
      progress.accept({ reachedCheckpointIds: [id] });
      await tick();
      progress.accept({ reachedCheckpointIds: [id, id] });
      await tick();
    }
    assert.deepEqual(calls, CHECKPOINT_STEP_IDS);
    assert.deepEqual(progress.snapshot().reachedCheckpointIds, CHECKPOINT_IDS);
    assert.deepEqual(progress.snapshot().completedStepIds, CHECKPOINT_STEP_IDS);
    assert.equal(progress.snapshot().solved, false, 'five understandings never grant the final solution');
  }
});

test('simultaneous arrivals are queued once while an active procedure is pending', async () => {
  const gates = CHECKPOINT_STEP_IDS.map(deferred);
  const calls = [];
  const progress = createCheckpointProgress({ runStep: id => { calls.push(id); return gates[calls.length - 1].promise; } });
  progress.accept({ reachedCheckpointIds: ['cp3','cp5'] });
  await tick();
  assert.equal(progress.snapshot().activeStepId, 'step1');
  assert.deepEqual(progress.snapshot().queuedStepIds, ['step2']);
  progress.accept({ reachedCheckpointIds: ['cp1','cp3','cp2','cp4'] });
  progress.accept({ reachedCheckpointIds: CHECKPOINT_IDS, finalSolved: true });
  progress.accept({ finalSolved: true });
  const completion = progress.whenSolvedComplete();
  assert.deepEqual(calls, ['step1']);
  assert.deepEqual(progress.snapshot().queuedStepIds, ['step2','step3','step4','step5']);
  for (const gate of gates) { gate.resolve({ completed: true }); await tick(); }
  assert.deepEqual(calls, CHECKPOINT_STEP_IDS);
  assert.equal((await completion).completed, true);
});

test('first-turn final solution drains all five without inventing reached understandings', async () => {
  const calls = [];
  const progress = createCheckpointProgress({ runStep: async id => { calls.push(id); return { completed: true }; } });
  progress.accept({ finalSolved: true });
  assert.equal(progress.snapshot().targetCount, 5);
  assert.equal((await progress.whenSolvedComplete()).completed, true);
  assert.deepEqual(calls, CHECKPOINT_STEP_IDS);
  assert.deepEqual(progress.snapshot().reachedCheckpointIds, []);
});

test('reset clears both ledgers and cancels old completion even when the runner ignores abort', async () => {
  const old = deferred();
  let oldSignal;
  let calls = 0;
  const progress = createCheckpointProgress({ runStep: (_id, { signal }) => {
    calls += 1;
    if (calls === 1) { oldSignal = signal; return old.promise; }
    return Promise.resolve({ completed: true });
  } });
  progress.accept({ finalSolved: true, reachedCheckpointIds: ['cp2'] });
  const staleCompletion = progress.whenSolvedComplete();
  await tick();
  progress.reset();
  assert.equal(oldSignal.aborted, true);
  assert.equal((await staleCompletion).cancelled, true);
  progress.accept({ reachedCheckpointIds: ['cp5'] });
  await tick();
  old.resolve({ completed: true });
  await tick();
  assert.deepEqual(progress.snapshot().reachedCheckpointIds, ['cp5']);
  assert.deepEqual(progress.snapshot().completedStepIds, ['step1']);
  assert.equal(progress.snapshot().solved, false);
  assert.deepEqual(progress.snapshot().queuedStepIds, []);
});

test('unassigned or failed procedures remain pending and can resume without repeating completed work', async () => {
  let assigned = false;
  let fail = true;
  const calls = [];
  const progress = createCheckpointProgress({ runStep: async id => {
    calls.push(id);
    if (id === 'step2' && !assigned) return { completed: false, reason: 'unassigned' };
    if (id === 'step3' && fail) throw new Error('media unavailable');
    return { completed: true };
  } });
  progress.accept({ finalSolved: true });
  await tick();
  assert.deepEqual(progress.snapshot().completedStepIds, ['step1']);
  assert.deepEqual(progress.snapshot().blocked, { stepId: 'step2', reason: 'unassigned' });
  progress.accept({ reachedCheckpointIds: CHECKPOINT_IDS });
  await tick();
  assert.deepEqual(calls, ['step1','step2'], 'new discoveries do not retry a blocked step');
  assigned = true;
  progress.retry();
  await tick();
  assert.deepEqual(progress.snapshot().blocked, { stepId: 'step3', reason: 'failed' });
  fail = false;
  progress.retry();
  assert.equal((await progress.whenSolvedComplete()).completed, true);
  assert.deepEqual(calls, ['step1','step2','step2','step3','step3','step4','step5']);
});

test('the shipped cut plan names every media procedure without granting an ACK itself', async () => {
  assert.deepEqual(Object.keys(CHECKPOINT_PROCEDURES), CHECKPOINT_STEP_IDS);
  assert.deepEqual(Object.values(CHECKPOINT_PROCEDURES).map(procedure => procedure.segments.length), [1, 1, 2, 5, 1]);
  let arrivals = 0;
  const runStep = createCheckpointStepRunner({ arrive: async () => { arrivals++; return { completed: true }; } });
  const progress = createCheckpointProgress({ runStep });
  progress.accept({ finalSolved: true });
  await tick();
  assert.equal(arrivals, 5);
  assert.deepEqual(progress.snapshot().completedStepIds, CHECKPOINT_STEP_IDS);
  assert.deepEqual(progress.snapshot().queuedStepIds, []);
});

test('arrival adapters require an explicit completion ACK and respect cancellation', async () => {
  for (const result of [undefined, {}, { cancelled: true }]) {
    const run = createCheckpointStepRunner({ procedures: { step1: { stage: 1, scene: 'living' } }, arrive: async () => result });
    assert.equal((await run('step1')).completed, false);
  }
  const run = createCheckpointStepRunner({ procedures: { step1: {} }, arrive: async () => ({ completed: true, fallback: true }) });
  assert.deepEqual(await run('step1'), { completed: true, fallback: true });
  const controller = new AbortController();
  controller.abort();
  assert.equal((await run('step1', { signal: controller.signal })).cancelled, true);
});

test('invalid IDs, duplicates and later truncated server states do not erase or inflate reach', async () => {
  const progress = createCheckpointProgress({ runStep: async () => ({ completed: true }) });
  progress.accept({ reachedCheckpointIds: ['cp3','cp3','unknown',null] });
  progress.accept({ reachedCheckpointIds: ['cp1'] });
  await tick();
  assert.deepEqual(progress.snapshot().reachedCheckpointIds, ['cp1','cp3']);
  assert.deepEqual(progress.snapshot().completedStepIds, ['step1','step2']);
});
