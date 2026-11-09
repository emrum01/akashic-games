import { HOTSPOT_MANIFEST } from "./hotspot-manifest.mjs";
import { isValidGrandmaEncounterState } from "./grandma-encounter-state.mjs";
import { isValidSpaceArcProgress } from "./space-arc-v2-adapter.mjs";
import { SPACE_ARC_ROUTE } from "./space-arc-state.mjs";

export const MICRO_CELL_PROGRESS_KEY = "akashic.game-progress.v1:ear-scope-micro-cell";
export const MICRO_CELL_PROGRESS_SCHEMA = "micro-cell-progress-v1";
export const MAX_MICRO_CELL_PROGRESS_BYTES = 96 * 1024;

const PRE_ARC_NODES = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `z${String(index).padStart(3, "0")}`)
);
const ZOOM_NODES = new Set([...PRE_ARC_NODES, ...SPACE_ARC_ROUTE]);
const HOTSPOT_IDS = new Set(HOTSPOT_MANIFEST.objects.map(({ id }) => id));
const START_ROUTE_INDEX = SPACE_ARC_ROUTE.indexOf("z011");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) =>
  isRecord(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

export function isValidMicroCellProgress(value) {
  if (
    !exactKeys(value, [
      "schema",
      "version",
      "zoomNode",
      "grandma",
      "spaceArcStarted",
      "spaceArc",
      "discoveredHotspotIds",
    ])
  ) {
    return false;
  }
  if (value.schema !== MICRO_CELL_PROGRESS_SCHEMA || value.version !== 1) {
    return false;
  }
  if (typeof value.zoomNode !== "string" || !ZOOM_NODES.has(value.zoomNode)) {
    return false;
  }
  if (!isValidGrandmaEncounterState(value.grandma)) {
    return false;
  }
  if (typeof value.spaceArcStarted !== "boolean" || !isValidSpaceArcProgress(value.spaceArc)) {
    return false;
  }
  if (
    !Array.isArray(value.discoveredHotspotIds) ||
    value.discoveredHotspotIds.length > HOTSPOT_IDS.size
  ) {
    return false;
  }
  const discoveries = new Set(value.discoveredHotspotIds);
  if (discoveries.size !== value.discoveredHotspotIds.length) {
    return false;
  }
  if (value.discoveredHotspotIds.some((id) => typeof id !== "string" || !HOTSPOT_IDS.has(id))) {
    return false;
  }

  const routeIndex = value.spaceArc.routeIndex;
  const zoomRouteIndex = SPACE_ARC_ROUTE.indexOf(value.zoomNode);
  if (zoomRouteIndex < START_ROUTE_INDEX && routeIndex !== START_ROUTE_INDEX) {
    return false;
  }
  if (zoomRouteIndex >= START_ROUTE_INDEX && zoomRouteIndex !== routeIndex) {
    return false;
  }
  if (routeIndex > START_ROUTE_INDEX && !value.spaceArcStarted) {
    return false;
  }
  if (routeIndex > START_ROUTE_INDEX && !value.grandma.pathUnlocked) {
    return false;
  }
  if (
    value.spaceArc.battle.state.grandmaObserver !==
    (value.spaceArcStarted && value.grandma.grandmaRecruited)
  ) {
    return false;
  }
  if (
    value.zoomNode === "z010" &&
    !value.grandma.encounterResolved &&
    value.grandma.screen === "hidden"
  ) {
    return false;
  }
  if (value.zoomNode !== "z010" && value.grandma.screen !== "hidden") {
    return false;
  }
  return true;
}

function readProgress() {
  try {
    const raw = globalThis.localStorage?.getItem(MICRO_CELL_PROGRESS_KEY);
    if (
      typeof raw !== "string" ||
      !raw ||
      new TextEncoder().encode(raw).byteLength > MAX_MICRO_CELL_PROGRESS_BYTES
    ) {
      return null;
    }
    const value = JSON.parse(raw);
    return isValidMicroCellProgress(value) ? value : null;
  } catch {
    return null;
  }
}

function writeProgress(value) {
  try {
    if (!isValidMicroCellProgress(value)) {
      return false;
    }
    const raw = JSON.stringify(value);
    if (new TextEncoder().encode(raw).byteLength > MAX_MICRO_CELL_PROGRESS_BYTES) {
      return false;
    }
    const storage = globalThis.localStorage;
    if (!storage) {
      return false;
    }
    storage.setItem(MICRO_CELL_PROGRESS_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

function clearProgress() {
  try {
    globalThis.localStorage?.removeItem(MICRO_CELL_PROGRESS_KEY);
  } catch {
    // Storage may be denied by the browser; the current play session stays usable.
  }
}

export function createMicroCellProgressStore() {
  return Object.freeze({ read: readProgress, write: writeProgress, clear: clearProgress });
}
