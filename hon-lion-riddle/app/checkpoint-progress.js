// IDs are deliberately opaque in public code. The semantic rubric lives in the Worker.
export const CHECKPOINT_IDS = Object.freeze(['cp1', 'cp2', 'cp3', 'cp4', 'cp5']);
export const CHECKPOINT_STEP_IDS = Object.freeze(['step1', 'step2', 'step3', 'step4', 'step5']);

export function normalizeCheckpointIds(ids) {
  const supplied = new Set(Array.isArray(ids) ? ids : []);
  return CHECKPOINT_IDS.filter(id => supplied.has(id));
}

/**
 * Reached understandings and completed presentation steps are different ledgers.
 * The runner must explicitly acknowledge completion; an unassigned/cancelled
 * step is never counted as executed. Reset invalidates even a non-cooperative
 * runner that resolves after its AbortSignal has fired.
 */
export function createCheckpointProgress({ runStep, onChange = () => {} }) {
  let reached = new Set();
  let completed = [];
  let solved = false;
  let active = null;
  let blocked = null;
  let generation = 0;
  let waiters = [];

  const targetCount = () => solved ? CHECKPOINT_STEP_IDS.length : reached.size;
  function snapshot() {
    const pending = CHECKPOINT_STEP_IDS.slice(completed.length, targetCount());
    return {
      reachedCheckpointIds: normalizeCheckpointIds([...reached]),
      completedStepIds: [...completed],
      activeStepId: active?.id ?? null,
      queuedStepIds: pending.filter(id => id !== active?.id),
      targetCount: targetCount(),
      solved,
      blocked: blocked ? { ...blocked } : null,
      generation,
    };
  }
  function notify() { onChange(snapshot()); }
  function settleWaiters(cancelled = false) {
    if (!cancelled && (!solved || completed.length !== CHECKPOINT_STEP_IDS.length)) return;
    const result = { cancelled, completed: !cancelled, generation };
    const pending = waiters;
    waiters = [];
    for (const resolve of pending) resolve(result);
  }
  function pump() {
    if (active || blocked || completed.length >= targetCount()) {
      settleWaiters();
      return;
    }
    const token = { id: CHECKPOINT_STEP_IDS[completed.length], generation, controller: new AbortController() };
    active = token;
    notify();
    // Defer the runner so accept() updates its complete batch atomically.
    Promise.resolve().then(() => {
      if (token.generation !== generation) return { cancelled: true };
      return runStep(token.id, { signal: token.controller.signal, generation: token.generation });
    }).then(result => {
      if (token.generation !== generation || active !== token) return;
      active = null;
      if (result?.completed === true && !result.cancelled) {
        completed.push(token.id);
        blocked = null;
        notify();
        pump();
      } else {
        blocked = { stepId: token.id, reason: result?.reason || (result?.cancelled ? 'cancelled' : 'unassigned') };
        notify();
      }
    }, () => {
      if (token.generation !== generation || active !== token) return;
      active = null;
      blocked = { stepId: token.id, reason: 'failed' };
      notify();
    });
  }
  function accept({ reachedCheckpointIds = [], finalSolved = false } = {}) {
    for (const id of normalizeCheckpointIds(reachedCheckpointIds)) reached.add(id);
    solved ||= finalSolved === true;
    notify();
    pump();
    return snapshot();
  }
  function whenSolvedComplete() {
    if (solved && completed.length === CHECKPOINT_STEP_IDS.length) {
      return Promise.resolve({ completed: true, cancelled: false, generation });
    }
    return new Promise(resolve => waiters.push(resolve));
  }
  function retry() {
    blocked = null;
    notify();
    pump();
  }
  function reset() {
    generation += 1;
    active?.controller.abort();
    active = null;
    blocked = null;
    reached = new Set();
    completed = [];
    solved = false;
    settleWaiters(true);
    notify();
    return snapshot();
  }
  return Object.freeze({ accept, snapshot, whenSolvedComplete, retry, reset });
}
