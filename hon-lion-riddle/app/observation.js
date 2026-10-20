const OBSERVATION_DELAY_MS = 350;

const clampNoiseLevel = (level) => Math.max(0, Math.min(5, Number(level) || 0));

/**
 * Coordinates the two observations that can be produced by a run of the
 * conversation.  Scene transitions and timers are asynchronous, so this
 * controller owns one invalidation token for both queues.  The game only
 * supplies whether a message may be shown right now.
 */
export function createObservationController({
  scheduleFn = setTimeout,
  cancelFn = clearTimeout,
  delayMs = OBSERVATION_DELAY_MS,
  canShowArrival = () => true,
  canQueueNoise = () => true,
  canShowNoise = () => true,
  onArrival = () => {},
  onNoise = () => {},
  onNoiseLevel = () => {},
} = {}) {
  let generation = 0;
  let arrivalOffered = false;
  let arrival = null;
  let nextRevision = 0;
  let noiseLevel = -1;
  let pendingNoise = 0;
  let arrivalTimer = null;
  let noiseTimer = null;

  const cancelTimers = () => {
    if (arrivalTimer !== null) cancelFn(arrivalTimer);
    if (noiseTimer !== null) cancelFn(noiseTimer);
    arrivalTimer = null;
    noiseTimer = null;
  };

  const invalidate = () => {
    generation += 1;
    cancelTimers();
    arrival = null;
    pendingNoise = 0;
  };

  const reset = () => {
    invalidate();
    arrivalOffered = false;
    nextRevision = 0;
    noiseLevel = -1;
    onNoiseLevel(null);
  };

  const clearNoise = () => {
    pendingNoise = 0;
    noiseLevel = -1;
    onNoiseLevel(null);
  };

  const showArrival = () => {
    if (arrivalTimer !== null) return false;
    if (!arrival?.arrived || arrival.token !== generation || arrivalOffered || !canShowArrival()) return false;
    arrival = null;
    arrivalOffered = true;
    onArrival();
    return true;
  };

  const showNoise = () => {
    if (!pendingNoise || !canShowNoise()) return false;
    pendingNoise -= 1;
    onNoise();
    if (pendingNoise) scheduleNoise();
    return true;
  };

  function scheduleArrival() {
    const token = generation;
    if (arrivalTimer !== null) return;
    arrivalTimer = scheduleFn(() => {
      arrivalTimer = null;
      if (token !== generation) return;
      showArrival();
    }, delayMs);
  }

  function scheduleNoise() {
    const token = generation;
    if (noiseTimer !== null) return;
    noiseTimer = scheduleFn(() => {
      noiseTimer = null;
      if (token !== generation) return;
      showNoise();
    }, delayMs);
  }

  const queueArrival = () => {
    if (arrivalOffered) return null;
    if (arrival?.arrived) return arrival;
    const ticket = { revision: ++nextRevision, token: generation, arrived: false };
    arrival = ticket;
    return ticket;
  };

  const markArrival = (ticket, result = {}) => {
    if (!arrival || arrival !== ticket || arrival.token !== generation) return false;
    if (result?.cancelled || result?.superseded) return ticket.arrived;
    arrival.arrived = true;
    if (!canShowArrival()) return true;
    scheduleArrival();
    return true;
  };

  const setNoiseLevel = (level) => {
    const next = clampNoiseLevel(level);
    const previous = noiseLevel;
    noiseLevel = next;
    onNoiseLevel(next);
    if (next <= previous || !canQueueNoise()) return false;
    pendingNoise += 1;
    if (noiseTimer === null) scheduleNoise();
    return true;
  };

  const flush = () => {
    const arrivalShown = showArrival();
    const noiseShown = showNoise();
    return arrivalShown || noiseShown;
  };

  return {
    queueArrival,
    markArrival,
    setNoiseLevel,
    flush,
    invalidate,
    reset,
    clearNoise,
    get arrivalOffered() { return arrivalOffered; },
    get noiseLevel() { return noiseLevel; },
    get pendingNoise() { return pendingNoise; },
  };
}
