import {
  applyBattleV2Command,
  BATTLE_V2_ACTIONS,
  BATTLE_V2_BOSS,
  BATTLE_V2_ENCOUNTERS,
  BATTLE_V2_ITEMS,
  canonicalBattleV2Serialize,
  createBattleV2State,
  hashBattleV2Transcript
} from "./battle-system-v2.mjs";
import { NARRATIVE_AMBIENT_EVENTS, NARRATIVE_TALKS, NARRATIVE_WORLD_PLACEMENTS } from "./narrative-content.mjs";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

export const BATTLE_V2_STORAGE_KEY = "micro-cell:battle-v2:v1";

const RECORD = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const uniqueStrings = (value, maximum, allowed = null) => Array.isArray(value)
  && value.length <= maximum
  && new Set(value).size === value.length
  && value.every((entry) => typeof entry === "string" && entry.length <= 120 && (!allowed || allowed.has(entry)));
const isIntegerBetween = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;
const exact = (value, required) => RECORD(value)
  && Object.keys(value).length === required.length
  && required.every((key) => Object.hasOwn(value, key));

function isBoundedJson(value, depth = 0) {
  if (depth > 16) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 4096;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 768 && value.every((entry) => isBoundedJson(entry, depth + 1));
  if (!RECORD(value) || Object.keys(value).length > 64) return false;
  return Object.entries(value).every(([key, entry]) => key.length <= 100 && isBoundedJson(entry, depth + 1));
}

const encounterIds = new Set(Object.keys(BATTLE_V2_ENCOUNTERS));
const itemIds = new Set(Object.keys(BATTLE_V2_ITEMS));
const ambientIds = new Set(Object.keys(NARRATIVE_AMBIENT_EVENTS));
const placementIds = new Set(NARRATIVE_WORLD_PLACEMENTS.map(({ id }) => id));
const talkIds = new Set(Object.keys(NARRATIVE_TALKS));
const eventTypes = new Set([
  "battle:brain-integrity-changed", "battle:failed", "battle:encounter-resolved", "battle:drop-unlocked",
  "battle:encounter-spawned", "battle:talk-opened", "battle:talk-branch-selected", "battle:talk-branch-read",
  "battle:talk-closed", "battle:reaction-shown", "battle:reaction-finished", "battle:ambient-triggered",
  "battle:encounter-left", "battle:boss-started", "battle:checkpoint-restored", "battle:boss-segment-removed",
  "battle:victory", "battle:item-discovered", "battle:grandma-observer-changed"
]);
const commandTypes = new Set([
  "RESET", "DISCOVER_ITEM", "SET_GRANDMA_OBSERVER", "SPAWN_ENCOUNTER", "TALK", "SELECT_TALK_BRANCH",
  "ADVANCE_TALK", "CLOSE_TALK", "ACK_REACTION", "TRIGGER_AMBIENT", "DISMISS_AMBIENT", "ACTION", "RECRUIT",
  "LEAVE", "ACK_RESOLUTION", "BEGIN_BOSS", "RETRY"
]);
const eventDetailSafe = (value) => RECORD(value) && isBoundedJson(value);

function validEventLog(state) {
  if (!Array.isArray(state.eventLog) || state.eventLog.length > 768 || state.eventSeq !== state.eventLog.length) return false;
  return state.eventLog.every((event, index) => exact(event, ["seq", "type", "detail"])
    && event.seq === index + 1
    && eventTypes.has(event.type)
    && eventDetailSafe(event.detail));
}

function validBattleActionId(value) {
  return typeof value === "string" && Object.hasOwn(BATTLE_V2_ACTIONS, value);
}

function validActive(value) {
  if (value === null) return true;
  if (!RECORD(value)) return false;
  const keys = Object.keys(value);
  if (["id", "mode", "phase", "message"].some((key) => !Object.hasOwn(value, key))) return false;
  if (keys.some((key) => !["id", "mode", "phase", "message", "result", "selectedActionId", "suspended"].includes(key))) return false;
  if (value.mode === "encounter" ? !encounterIds.has(value.id) : value.mode === "boss" ? value.id !== BATTLE_V2_BOSS.id : true) return false;
  if (!["choice", "reaction", "resolved", "game-over", "victory", "talk"].includes(value.phase)) return false;
  if (value.message !== null && (typeof value.message !== "string" || value.message.length > 4096)) return false;
  if (Object.hasOwn(value, "selectedActionId") && value.selectedActionId !== null && !validBattleActionId(value.selectedActionId)) return false;
  if (Object.hasOwn(value, "suspended") && typeof value.suspended !== "boolean") return false;
  if (Object.hasOwn(value, "result") && value.result !== null) {
    const result = value.result;
    if (!exact(result, ["actionId", "correct", "damage", "before", "after", "reason", "message"])) return false;
    if (result.actionId !== null && !validBattleActionId(result.actionId)) return false;
    if (typeof result.correct !== "boolean" || !isIntegerBetween(result.damage, 0, 100)
      || !isIntegerBetween(result.before, 0, 100) || !isIntegerBetween(result.after, 0, 100)
      || typeof result.reason !== "string" || result.reason.length > 1000
      || typeof result.message !== "string" || result.message.length > 2000) return false;
  }
  return true;
}

function validBoss(value) {
  return exact(value, ["entered", "segmentsRemaining", "brainIntegrity", "defeated", "endingTier"])
    && typeof value.entered === "boolean"
    && isIntegerBetween(value.segmentsRemaining, 0, BATTLE_V2_BOSS.segments)
    && isIntegerBetween(value.brainIntegrity, 0, 100)
    && typeof value.defeated === "boolean"
    && [null, "full", "damaged", "dire"].includes(value.endingTier);
}

function validEncounterMap(value) {
  if (!RECORD(value) || Object.keys(value).length !== encounterIds.size) return false;
  for (const id of encounterIds) {
    const status = value[id];
    if (!exact(status, ["spawned", "resolved", "outcome", "recruited", "damaged", "suspended"])) return false;
    if (["spawned", "resolved", "recruited", "damaged", "suspended"].some((key) => typeof status[key] !== "boolean")) return false;
    if (![null, "defeated", "recruited", "fled"].includes(status.outcome)) return false;
    if (status.resolved !== (status.outcome !== null) || status.recruited !== (status.outcome === "recruited")) return false;
    if (status.resolved && !status.spawned || status.suspended && (!status.spawned || status.resolved)) return false;
  }
  return true;
}

function validCheckpoint(value) {
  if (value === null) return true;
  if (!exact(value, ["id", "brainIntegrity", "inventory", "claimedPlacementIds", "unlockedDropIds", "seenAmbientIds", "readTalkBranchIds", "talkInsights", "companions", "grandmaObserver", "encounters", "boss", "active"])) return false;
  if (typeof value.id !== "string" || value.id.length > 100 || !isIntegerBetween(value.brainIntegrity, 0, 100)) return false;
  if (!uniqueStrings(value.inventory, itemIds.size, itemIds)
    || !uniqueStrings(value.claimedPlacementIds, placementIds.size, placementIds)
    || !uniqueStrings(value.unlockedDropIds, 32)
    || !uniqueStrings(value.seenAmbientIds, ambientIds.size, ambientIds)
    || !uniqueStrings(value.readTalkBranchIds, 200)
    || !uniqueStrings(value.companions, encounterIds.size, encounterIds)) return false;
  if (typeof value.grandmaObserver !== "boolean" || !validEncounterMap(value.encounters) || !validBoss(value.boss) || !validActive(value.active)) return false;
  if (!RECORD(value.talkInsights) || Object.keys(value.talkInsights).length > talkIds.size) return false;
  return Object.entries(value.talkInsights).every(([id, text]) => talkIds.has(id) && typeof text === "string" && text.length <= 4096);
}

function validReaction(value) {
  if (value === null) return true;
  return exact(value, ["encounterId", "actionId", "attack", "reaction", "step", "nextPhase", "nextMessage", "holdMs"])
    && (encounterIds.has(value.encounterId) || value.encounterId === BATTLE_V2_BOSS.id)
    && validBattleActionId(value.actionId)
    && typeof value.attack === "string" && value.attack.length <= 2000
    && typeof value.reaction === "string" && value.reaction.length <= 2000
    && ["attack", "reaction"].includes(value.step)
    && ["choice", "resolved", "victory"].includes(value.nextPhase)
    && typeof value.nextMessage === "string" && value.nextMessage.length <= 2000
    && isIntegerBetween(value.holdMs, 0, 5000);
}

function validTalk(value) {
  if (value === null) return true;
  if (!exact(value, ["encounterId", "screen", "branchId", "lineIndex", "visitedBranchIds"])) return false;
  if (!talkIds.has(value.encounterId) || !["menu", "line"].includes(value.screen)) return false;
  if (value.branchId !== null && typeof value.branchId !== "string") return false;
  if (!isIntegerBetween(value.lineIndex, 0, 1000)) return false;
  if (!uniqueStrings(value.visitedBranchIds, 200)) return false;
  const branches = NARRATIVE_TALKS[value.encounterId].map(({ id }) => id);
  if (value.visitedBranchIds.some((id) => !branches.includes(id))) return false;
  if (value.screen === "menu" && (value.branchId !== null || value.lineIndex !== 0)) return false;
  if (value.screen === "line" && (!branches.includes(value.branchId) || value.lineIndex > 100)) return false;
  return true;
}

function validBattleState(state) {
  const keys = ["schema", "seed", "eventSeq", "eventLog", "brainIntegrity", "inventory", "claimedPlacementIds", "unlockedDropIds", "seenAmbientIds", "ambientQueue", "readTalkBranchIds", "talkInsights", "talk", "reaction", "companions", "grandmaObserver", "encounters", "active", "boss", "checkpoint", "gameOver", "victory"];
  if (!exact(state, keys) || state.schema !== "micro-cell-battle-v2/simple-v1") return false;
  if (!isIntegerBetween(state.seed, 0, 0xffffffff) || !isIntegerBetween(state.brainIntegrity, 0, 100) || !validEventLog(state)) return false;
  if (!uniqueStrings(state.inventory, itemIds.size, itemIds)
    || !uniqueStrings(state.claimedPlacementIds, placementIds.size, placementIds)
    || !uniqueStrings(state.unlockedDropIds, 32)
    || !uniqueStrings(state.seenAmbientIds, ambientIds.size, ambientIds)
    || !uniqueStrings(state.ambientQueue, ambientIds.size, ambientIds)
    || !uniqueStrings(state.readTalkBranchIds, 200)
    || !uniqueStrings(state.companions, encounterIds.size, encounterIds)) return false;
  if (state.ambientQueue.some((id) => !state.seenAmbientIds.includes(id))) return false;
  if (typeof state.grandmaObserver !== "boolean" || !validEncounterMap(state.encounters) || !validBoss(state.boss)) return false;
  if (!RECORD(state.talkInsights) || Object.keys(state.talkInsights).length > talkIds.size) return false;
  if (!Object.entries(state.talkInsights).every(([id, text]) => talkIds.has(id) && typeof text === "string" && text.length <= 4096)) return false;
  if (!validTalk(state.talk) || !validReaction(state.reaction) || !validActive(state.active) || !validCheckpoint(state.checkpoint)) return false;
  if (state.gameOver !== null && state.gameOver !== "brain_integrity_depleted") return false;
  if (typeof state.victory !== "boolean" || state.boss.brainIntegrity !== state.brainIntegrity) return false;
  if ((state.active?.phase === "reaction") !== (state.reaction !== null)) return false;
  if ((state.active?.phase === "talk") !== (state.talk !== null)) return false;
  if (state.gameOver !== null && (state.brainIntegrity !== 0 || state.active?.phase !== "game-over")) return false;
  if (state.victory !== state.boss.defeated) return false;
  if (state.victory && (!state.boss.entered || state.active?.mode !== "boss" || !["reaction", "victory"].includes(state.active.phase))) return false;
  if (state.active?.mode === "encounter" && (!state.encounters[state.active.id].spawned || state.encounters[state.active.id].resolved && !["resolved", "reaction"].includes(state.active.phase))) return false;
  if (state.active?.mode === "boss" && !state.boss.entered) return false;
  return isBoundedJson(state);
}

function validTranscriptCommand(value) {
  if (!RECORD(value) || !commandTypes.has(value.type) || Object.keys(value).length > 8 || !isBoundedJson(value)) return false;
  if (value.type === "ACTION") return validBattleActionId(value.actionId);
  if (value.type === "DISCOVER_ITEM") return itemIds.has(value.itemId)
    && (value.sourceHotspotId === null || value.sourceHotspotId === undefined || typeof value.sourceHotspotId === "string")
    && (value.placementId === null || value.placementId === undefined || typeof value.placementId === "string");
  if (value.type === "SET_GRANDMA_OBSERVER") return typeof value.enabled === "boolean";
  if (value.type === "SPAWN_ENCOUNTER") return encounterIds.has(value.encounterId);
  if (value.type === "SELECT_TALK_BRANCH") return typeof value.branchId === "string" && value.branchId.length <= 100;
  if (value.type === "TRIGGER_AMBIENT") return ambientIds.has(value.ambientId);
  if (value.type === "RESET") return (value.seed === undefined || isIntegerBetween(value.seed, 0, 0xffffffff))
    && (value.grandmaObserver === undefined || typeof value.grandmaObserver === "boolean");
  if (value.type === "ACTION" || value.type === "DISCOVER_ITEM" || value.type === "SET_GRANDMA_OBSERVER" || value.type === "SPAWN_ENCOUNTER" || value.type === "SELECT_TALK_BRANCH" || value.type === "TRIGGER_AMBIENT" || value.type === "RESET") return false;
  return true;
}

export function isValidBattleV2Save(value) {
  let parsed = value;
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).byteLength > 96 * 1024) return false;
    try { parsed = JSON.parse(value); } catch { return false; }
  }
  return exact(parsed, ["schema", "transcript", "transcriptHash", "state"])
    && parsed.schema === "micro-cell-battle-v2-save-v1"
    && Array.isArray(parsed.transcript)
    && parsed.transcript.length <= 768
    && parsed.transcript.every(validTranscriptCommand)
    && parsed.transcriptHash === hashBattleV2Transcript(parsed.transcript)
    && validBattleState(parsed.state);
}

function cloneSave(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBattleV2Store({
  initialState = createBattleV2State(),
  onChange = () => {},
  onEvent = () => {},
  runEffect = () => {},
  savedSnapshot = null
} = {}) {
  const restored = isValidBattleV2Save(savedSnapshot) ? savedSnapshot : null;
  let state = restored ? freeze(cloneSave(restored.state)) : initialState;
  let transcript = restored ? cloneSave(restored.transcript) : [];

  function dispatch(input) {
    const result = applyBattleV2Command(state, input);
    if (result.state === state) return freeze({ state, events: [], effects: [] });
    transcript = [...transcript, freeze(structuredClone(input))];
    state = result.state;
    for (const event of result.events) onEvent(event, state);
    for (const effect of result.effects) runEffect(effect, state, transcript);
    onChange(state);
    return result;
  }

  function serialize() {
    return canonicalBattleV2Serialize({
      schema: "micro-cell-battle-v2-save-v1",
      transcript,
      transcriptHash: hashBattleV2Transcript(transcript),
      state
    });
  }

  return freeze({
    dispatch,
    getState: () => state,
    getTranscript: () => freeze(structuredClone(transcript)),
    getTranscriptHash: () => hashBattleV2Transcript(transcript),
    serialize
  });
}
