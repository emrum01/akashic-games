/**
 * Navigation contract for the intentional ear-scope blink room-entry trial.
 */

export const GRANDMA_ROOM_FLOW_PLAN = Object.freeze({
  status: "trial-room-scope-blink",
  active: true,
  approachNode: "z009",
  encounterNode: "z010",
  clearedNode: "z011",
  encounterRenderScale: 1,
  clearedRenderScale: 1.075,
  ungatedEntryEdge: "z009-z010",
  gatedExitEdge: "z010-z011",
  gate: "pathUnlocked"
});

const INDEX_BY_NODE = Object.freeze({ z009: 9, z010: 10, z011: 11 });

export function stepRoomFlow(node, direction, { pathUnlocked = false } = {}) {
  const index = INDEX_BY_NODE[node];
  if (!Number.isInteger(index) || !Number.isFinite(direction) || direction === 0) return node;
  if (direction > 0 && node === GRANDMA_ROOM_FLOW_PLAN.encounterNode && !pathUnlocked) return node;
  const nextIndex = Math.max(9, Math.min(11, index + Math.sign(direction)));
  return `z${String(nextIndex).padStart(3, "0")}`;
}

export function resolveRoomFlowPose(targetNode, { pathUnlocked = false } = {}) {
  if (!(targetNode in INDEX_BY_NODE)) return null;
  if (targetNode === GRANDMA_ROOM_FLOW_PLAN.clearedNode && !pathUnlocked) {
    return GRANDMA_ROOM_FLOW_PLAN.encounterNode;
  }
  return targetNode;
}

export function retreatFromEncounterAction() {
  return GRANDMA_ROOM_FLOW_PLAN.approachNode;
}
