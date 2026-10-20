export const GAME_DURATION_MS = 20 * 60 * 1000;

export const NOISE_STEPS = Object.freeze([
  Object.freeze({ elapsedMs: 0, level: 0 }),
  Object.freeze({ elapsedMs: 5 * 60 * 1000, level: 1 }),
  Object.freeze({ elapsedMs: 10 * 60 * 1000, level: 2 }),
  Object.freeze({ elapsedMs: 15 * 60 * 1000, level: 3 }),
  Object.freeze({ elapsedMs: 18 * 60 * 1000, level: 4 }),
  Object.freeze({ elapsedMs: 19.5 * 60 * 1000, level: 5 }),
]);

/**
 * A wall-clock deadline that can be checked after a tab was backgrounded.
 * The callback timer is only a prompt; `check()` is authoritative.
 */
export function createDeadlineController({
  durationMs = GAME_DURATION_MS,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onNoise = () => {},
  onExpire = () => {},
} = {}) {
  let started = false;
  let expired = false;
  let deadlineMs = 0;
  let timeoutId = null;
  let noiseLevel = -1;

  const levelAt = (elapsedMs) => {
    let level = NOISE_STEPS[0].level;
    for (const step of NOISE_STEPS) {
      if (elapsedMs >= step.elapsedMs) level = step.level;
      else break;
    }
    return level;
  };

  const emitNoise = (elapsedMs) => {
    const nextLevel = levelAt(Math.max(0, elapsedMs));
    if (nextLevel <= noiseLevel) return;
    for (const step of NOISE_STEPS) {
      if (step.level <= noiseLevel) continue;
      if (step.level > nextLevel) break;
      noiseLevel = step.level;
      onNoise(step.level);
    }
  };

  const clearTimer = () => {
    if (timeoutId !== null) clearTimeoutFn(timeoutId);
    timeoutId = null;
  };

  const expire = () => {
    if (!started || expired) return false;
    expired = true;
    clearTimer();
    emitNoise(Math.max(0, durationMs));
    onExpire();
    return true;
  };

  const schedule = (currentMs = now()) => {
    if (!started || expired) return;
    clearTimer();
    const remainingMs = deadlineMs - currentMs;
    if (remainingMs <= 0) {
      expire();
      return;
    }
    const elapsedMs = durationMs - remainingMs;
    const nextStep = NOISE_STEPS.find((step) => step.elapsedMs > elapsedMs);
    const untilNoise = nextStep ? nextStep.elapsedMs - elapsedMs : remainingMs;
    timeoutId = setTimeoutFn(() => {
      timeoutId = null;
      check();
    }, Math.max(0, Math.min(remainingMs, untilNoise)));
  };

  function start() {
    if (started) return false;
    started = true;
    expired = false;
    deadlineMs = now() + durationMs;
    noiseLevel = -1;
    emitNoise(0);
    schedule();
    return true;
  }

  function check() {
    if (!started || expired) return expired;
    const currentMs = now();
    const elapsedMs = currentMs - (deadlineMs - durationMs);
    emitNoise(elapsedMs);
    if (currentMs >= deadlineMs) return expire();
    schedule(currentMs);
    return false;
  }

  function stop() {
    clearTimer();
    started = false;
    expired = false;
    deadlineMs = 0;
    noiseLevel = -1;
  }

  return {
    start,
    check,
    stop,
    get started() { return started; },
    get expired() { return expired; },
    get deadlineMs() { return deadlineMs; },
    get noiseLevel() { return noiseLevel; },
  };
}
