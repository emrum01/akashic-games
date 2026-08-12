import { SPACE_ARC_ENCOUNTERS, SPACE_ARC_ROUTE } from "./space-arc-state.mjs";
import { BATTLE_V2_ENCOUNTERS, createBattleV2State, selectBattleV2 } from "./battle-system-v2.mjs";
import { createBattleV2Store } from "./battle-v2-store.mjs";

const START_INDEX = SPACE_ARC_ROUTE.indexOf("z011");
const BOSS_INDEX = SPACE_ARC_ROUTE.indexOf("b000");
const ENCOUNTER_BY_NODE = Object.fromEntries(Object.entries(SPACE_ARC_ENCOUNTERS).map(([id, definition]) => [definition.nodeId, id]));
  const RETREATABLE_PHASES = Object.freeze(["choice"]);
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

export function createSpaceArcV2Adapter({
  grandmaRecruited = false,
  onChange = () => {},
  onEvent = () => {},
  runEffect = () => {},
  seed = 46081,
  initialBrainIntegrity = 100
} = {}) {
  let routeIndex = START_INDEX;
  const store = createBattleV2Store({
    initialState: createBattleV2State({ seed, grandmaObserver: grandmaRecruited, brainIntegrity: initialBrainIntegrity }),
    onChange: () => onChange(snapshot()),
    onEvent: (event) => onEvent(event, snapshot()),
    runEffect
  });

  const battle = () => store.getState();
  const encounterStatus = () => Object.fromEntries(Object.entries(battle().encounters).map(([id, status]) => [id, {
    ...status,
    weakened: Boolean(status.resolved || battle().active?.id === id && battle().active.progress >= 2)
  }]));

  function snapshot() {
    const state = battle();
    const activeId = state.active?.mode === "encounter" ? state.active.id : null;
    const statuses = encounterStatus();
    return freeze({
      nodeId: SPACE_ARC_ROUTE[routeIndex],
      routeIndex,
      screen: state.gameOver ? "game-over" : state.victory ? "victory" : state.active?.phase || "hidden",
      activeEncounterId: activeId,
      message: state.active?.message || null,
      encounterStatus: statuses,
      encounterResolved: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, Boolean(status.resolved)])),
      companions: [...state.companions, ...(state.grandmaObserver ? ["grandma"] : [])],
      combatParty: [...state.companions],
      grandmaObserver: state.grandmaObserver,
      inventory: [...state.inventory],
      brainRemainingPercent: state.brainIntegrity,
      bossDefeated: state.boss.defeated,
      gameOver: state.gameOver,
      v2: state,
      transcriptHash: store.getTranscriptHash()
    });
  }

  function emitBlocked(requestedIndex) {
    onEvent(freeze({ type: "battle:encounter-forward-blocked", detail: { encounterId: selectBattleV2.unresolvedEncounterId(battle()), nodeId: SPACE_ARC_ROUTE[routeIndex], requestedNodeId: SPACE_ARC_ROUTE[requestedIndex] || null } }), snapshot());
  }

  function blockingEncounterForIndex(index) {
    if (index <= routeIndex) return null;
    const state = battle();
    const spawnedUnresolved = selectBattleV2.unresolvedEncounterId(state);
    if (spawnedUnresolved) {
      const reentryIndex = SPACE_ARC_ROUTE.indexOf(BATTLE_V2_ENCOUNTERS[spawnedUnresolved].nodeId);
      const isExactReentry = state.active === null && routeIndex === reentryIndex - 1 && index === reentryIndex;
      if (!isExactReentry) return spawnedUnresolved;
    }
    for (let cursor = routeIndex; cursor < index; cursor += 1) {
      const encounterId = ENCOUNTER_BY_NODE[SPACE_ARC_ROUTE[cursor]];
      if (encounterId && !state.encounters[encounterId].resolved) return encounterId;
    }
    return null;
  }

  function enter(index) {
    routeIndex = Math.max(START_INDEX, Math.min(BOSS_INDEX, Math.round(index)));
    const nodeId = SPACE_ARC_ROUTE[routeIndex];
    const encounterId = ENCOUNTER_BY_NODE[nodeId];
    if (encounterId && !battle().encounters[encounterId].resolved && battle().active?.id !== encounterId) {
      store.dispatch({ type: "SPAWN_ENCOUNTER", encounterId });
    } else if (nodeId === "b000" && !battle().boss.entered) {
      store.dispatch({ type: "BEGIN_BOSS" });
    }
    onChange(snapshot());
    return snapshot();
  }

  function requestRouteIndex(index) {
    const numeric = Number(index);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
      onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: String(index), reason: "finite-integer-required" } }), snapshot());
      return snapshot();
    }
    const target = Math.max(START_INDEX, Math.min(BOSS_INDEX, numeric));
    if (target === routeIndex) return snapshot();
    const state = battle();
    const unresolvedId = selectBattleV2.unresolvedEncounterId(state);
    if (target < routeIndex) {
      if (state.active?.mode === "boss" || state.gameOver || state.victory) {
        onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: target, reason: "active-battle-locked" } }), snapshot());
        return snapshot();
      }
      if (state.active?.mode === "encounter" && !state.encounters[state.active.id].resolved) {
        if (target !== routeIndex - 1 || !RETREATABLE_PHASES.includes(state.active.phase)) {
          onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: target, reason: "exact-retreat-required" } }), snapshot());
          return snapshot();
        }
        const activeId = state.active.id;
        store.dispatch({ type: "LEAVE" });
        if (battle().active !== null || !battle().encounters[activeId].suspended) {
          onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: target, reason: "retreat-not-acknowledged" } }), snapshot());
          return snapshot();
        }
        return enter(target);
      }
      if (unresolvedId) {
        onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: target, reason: "encounter-reentry-required" } }), snapshot());
        return snapshot();
      }
      if (state.active && state.active.phase !== "resolved") {
        onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: target, reason: "active-state-locked" } }), snapshot());
        return snapshot();
      }
      if (state.active?.phase === "resolved") store.dispatch({ type: "ACK_RESOLUTION" });
      return enter(target);
    }
    if (blockingEncounterForIndex(target)) {
      emitBlocked(target);
      return snapshot();
    }
    if (state.active && state.active.phase !== "resolved") {
      onEvent(freeze({ type: "battle:route-request-rejected", detail: { requestedIndex: target, reason: "active-state-locked" } }), snapshot());
      return snapshot();
    }
    if (target > routeIndex && battle().active?.phase === "resolved") store.dispatch({ type: "ACK_RESOLUTION" });
    return enter(target);
  }

  function forward() {
    if (battle().gameOver || battle().victory || routeIndex >= BOSS_INDEX) return snapshot();
    if (blockingEncounterForIndex(routeIndex + 1)) {
      emitBlocked(routeIndex + 1);
      return snapshot();
    }
    if (battle().active?.phase === "resolved") store.dispatch({ type: "ACK_RESOLUTION" });
    return requestRouteIndex(routeIndex + 1);
  }

  function back() {
    if (routeIndex <= START_INDEX) return snapshot();
    return requestRouteIndex(routeIndex - 1);
  }

  function canEnterRouteIndex(index) {
    const numeric = Number(index);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return false;
    const target = Math.max(START_INDEX, Math.min(BOSS_INDEX, numeric));
    if (target === routeIndex) return true;
    const state = battle();
    const unresolvedId = selectBattleV2.unresolvedEncounterId(state);
    if (target < routeIndex) {
      if (state.active?.mode === "boss" || state.gameOver || state.victory) return false;
      if (state.active?.mode === "encounter" && !state.encounters[state.active.id].resolved) {
        return target === routeIndex - 1 && RETREATABLE_PHASES.includes(state.active.phase);
      }
      if (unresolvedId || state.active && state.active.phase !== "resolved") return false;
      return true;
    }
    return blockingEncounterForIndex(target) === null;
  }

  function dispatch(command) {
    store.dispatch(command);
    return snapshot();
  }

  return freeze({
    getState: snapshot,
    getBattleState: battle,
    getTranscript: store.getTranscript,
    getTranscriptHash: store.getTranscriptHash,
    serialize: store.serialize,
    forward,
    back,
    retreat: back,
    canEnterRouteIndex,
    requestRouteIndex,
    talk: () => dispatch({ type: "TALK" }),
    act: (actionId, options = {}) => dispatch({ type: "ACTION", actionId, ...options }),
    discoverItem: (itemId, sourceHotspotId = null, placementId = null) => dispatch({ type: "DISCOVER_ITEM", itemId, sourceHotspotId, placementId }),
    selectTalkBranch: (branchId) => dispatch({ type: "SELECT_TALK_BRANCH", branchId }),
    advanceTalk: () => dispatch({ type: "ADVANCE_TALK" }),
    closeTalk: () => dispatch({ type: "CLOSE_TALK" }),
    acknowledgeReaction: () => dispatch({ type: "ACK_REACTION" }),
    triggerAmbient: (ambientId) => dispatch({ type: "TRIGGER_AMBIENT", ambientId }),
    dismissAmbient: () => dispatch({ type: "DISMISS_AMBIENT" }),
    setGrandmaObserver: (enabled) => dispatch({ type: "SET_GRANDMA_OBSERVER", enabled }),
    recruit: () => dispatch({ type: "RECRUIT" }),
    retry: () => dispatch({ type: "RETRY" }),
    reset: () => {
      routeIndex = START_INDEX;
      return dispatch({ type: "RESET", seed, grandmaObserver: grandmaRecruited });
    }
  });
}
