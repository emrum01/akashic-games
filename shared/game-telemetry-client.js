import "./game-telemetry.js";

const eventTypes = new Set([
  "start",
  "progress",
  "clear",
  "hint",
  "wrong",
  "fail",
  "reset",
  "restart",
]);

const gameIdAliases = Object.freeze({
  "weekday-alley": "nazo-20261107-shared-windows",
  "press-all-buttons": "nazo-20261107-picture-kanji",
  mukaiau: "nazo-20261107-ordering-sticks",
  "moving-editor": "nazo-20261107-single-punch",
});

/**
 * Convert route and completion-record IDs into the stable public game identity
 * used by telemetry. Completion revisions stay separate from the game ID.
 * @param {string} id
 * @returns {{ gameId: string, revision?: string }}
 */
export function canonicalGameTelemetryIdentity(id) {
  if (typeof id !== "string" || !id.trim()) {
    return { gameId: "" };
  }

  let gameId = id.trim();
  let revision;
  const versioned = /^(.*)-r(\d+)$/.exec(gameId);
  if (versioned) {
    gameId = versioned[1];
    revision = `r${versioned[2]}`;
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(gameId)) {
    return { gameId: "" };
  }
  if (Object.prototype.hasOwnProperty.call(gameIdAliases, gameId)) {
    gameId = gameIdAliases[gameId];
  }
  return revision ? { gameId, revision } : { gameId };
}

function safeData(data) {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const result = {};
  if (typeof data.stage === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(data.stage)) {
    result.stage = data.stage;
  }
  if (Number.isSafeInteger(data.step) && data.step >= 0 && data.step <= 9999) {
    result.step = data.step;
  }
  return Object.keys(result).length ? result : undefined;
}

/** Initialize a validated game's saved telemetry without inventing a start. */
export function initializeGameTelemetry(gameId) {
  const identity = canonicalGameTelemetryIdentity(gameId);
  if (!identity.gameId) {
    return false;
  }
  try {
    const tracker = globalThis.AkashicTelemetry?.init(identity);
    if (!tracker || typeof tracker.track !== "function") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Keep an operation milestone from restarting at one after a same-stage reload. */
export function nextGameTelemetryStep(gameId, stage, previous = 0) {
  let current = Number.isSafeInteger(previous) && previous >= 0 ? previous : 0;
  try {
    const identity = canonicalGameTelemetryIdentity(gameId);
    const tracker = identity.gameId && globalThis.AkashicTelemetry?.init(identity);
    const snapshot = tracker && typeof tracker.snapshot === "function" && tracker.snapshot();
    if (
      snapshot &&
      snapshot.play_status === "playing" &&
      snapshot.stage === stage &&
      Number.isSafeInteger(snapshot.step) &&
      snapshot.step >= 0
    ) {
      current = Math.max(current, snapshot.step);
    }
  } catch {
    // Local milestones remain available when the optional runtime cannot be read.
  }
  return Math.min(current + 1, 9999);
}

/**
 * Emit a semantic event through the shared browser runtime. Only the game ID,
 * event type, and bounded stage/step fields can cross this boundary.
 * @param {string} gameId
 * @param {"start"|"progress"|"clear"|"hint"|"wrong"|"fail"|"reset"|"restart"} type
 * @param {{stage?: unknown, step?: unknown}} [data]
 */
export function emitGameTelemetry(gameId, type, data) {
  if (typeof type !== "string" || !eventTypes.has(type)) {
    return false;
  }

  const identity = canonicalGameTelemetryIdentity(gameId);
  if (!identity.gameId) {
    return false;
  }
  try {
    const runtime = globalThis.AkashicTelemetry;
    if (!runtime || typeof runtime.init !== "function") {
      return false;
    }
    const tracker = runtime.init(identity);
    if (!tracker || typeof tracker.track !== "function") {
      return false;
    }
    if (type === "start" && typeof tracker.snapshot === "function") {
      let snapshot = null;
      try {
        snapshot = tracker.snapshot();
      } catch {
        // A snapshot is only needed to reopen a terminal SPA run; normal start
        // remains available even when an older runtime cannot provide it.
      }
      if (
        snapshot &&
        (snapshot.cleared === true ||
          snapshot.failed === true ||
          ["cleared", "failed", "fail"].includes(snapshot.play_status))
      ) {
        tracker.track("reset");
      }
    }
    const runtimeType = type === "restart" ? "reset" : type;
    const accepted = tracker.track(runtimeType, safeData(data)) === true;
    if (accepted) {
      markSemanticGame(identity.gameId);
    }
    return accepted;
  } catch {
    return false;
  }
}

function markSemanticGame(gameId) {
  try {
    globalThis.AkashicTelemetrySemanticGame = gameId;
  } catch {
    // A locked-down page still records through the runtime; marker is an
    // optional handoff to the delivery-side compatibility adapter.
  }
}
