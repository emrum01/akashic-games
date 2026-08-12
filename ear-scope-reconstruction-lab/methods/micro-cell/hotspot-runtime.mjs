import { HOTSPOT_MANIFEST, normalizeHotspotBox, validateHotspotManifest } from "./hotspot-manifest.mjs";

const MIN_TARGET_CSS_PX = 44;
const MIN_TOUCH_TARGET_CSS_PX = 48;
const MIN_VISUAL_CORE_CSS_PX = 12;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function expandHotspotBox(bbox, displayScale, { sourceWidth = 1536, sourceHeight = 1024, minimumCssPixels = MIN_TARGET_CSS_PX } = {}) {
  const box = normalizeHotspotBox(bbox);
  const scale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  const width = Math.min(sourceWidth, Math.max(box.width, minimumCssPixels / scale));
  const height = Math.min(sourceHeight, Math.max(box.height, minimumCssPixels / scale));
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return deepFreeze({
    x: clamp(centerX - width / 2, 0, sourceWidth - width),
    y: clamp(centerY - height / 2, 0, sourceHeight - height),
    width,
    height
  });
}

export function projectHotspotBox(bbox, {
  viewportWidth, viewportHeight, coverScale, renderScale, focal,
  sourceWidth = 1536, sourceHeight = 1024, frameShiftX = 0, frameShiftY = 0
}) {
  const box = normalizeHotspotBox(bbox);
  const scale = coverScale * renderScale;
  const left = viewportWidth / 2 + frameShiftX + coverScale * (focal.x + (box.x - focal.x) * renderScale - sourceWidth / 2);
  const top = viewportHeight / 2 + frameShiftY + coverScale * (focal.y + (box.y - focal.y) * renderScale - sourceHeight / 2);
  return deepFreeze({ left, top, width: box.width * scale, height: box.height * scale, right: left + box.width * scale, bottom: top + box.height * scale });
}

function boxesIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function visibleRatio(box, viewportWidth, viewportHeight) {
  const width = Math.max(0, Math.min(viewportWidth, box.right) - Math.max(0, box.left));
  const height = Math.max(0, Math.min(viewportHeight, box.bottom) - Math.max(0, box.top));
  return box.width > 0 && box.height > 0 ? width * height / (box.width * box.height) : 0;
}

function whollyVisible(box, viewportWidth, viewportHeight) {
  return box.left >= 0 && box.top >= 0 && box.right <= viewportWidth && box.bottom <= viewportHeight;
}

export function activeHotspotsForContext(manifest, { nodeId, owner }) {
  return manifest.objects
    .flatMap((entry) => entry.targets
      .filter((target) => target.owner === owner && target.nodes.includes(nodeId))
      .map((target) => ({ ...entry, target, boxes: target.boxes })))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || a.id.localeCompare(b.id));
}

export function createHotspotRuntime({
  layer, inspector, title, observation, closeButton, scene, viewport,
  manifest = HOTSPOT_MANIFEST, validNodes = [], validOwners = [], isExternalModalOpen = () => false
}) {
  const validation = validateHotspotManifest(manifest, { validNodes, validOwners });
  if (!validation.valid) throw new Error(`hotspot manifest invalid: ${validation.errors.join("; ")}`);

  let context = { nodeId: null, owner: null, renderScale: 1, coverScale: 1, focal: { x: 768, y: 512 } };
  let activeEntries = [];
  let regionRecords = [];
  let suppressedRegions = [];
  let activeButtons = new Map();
  let contextIdentity = "";
  let renderSignature = "";
  let focusBeforeInspector = null;
  let selectedId = null;

  function updateDataset() {
    viewport.dataset.hotspotCount = String(activeEntries.length);
    viewport.dataset.hotspotRegionCount = String(regionRecords.length);
    viewport.dataset.hotspotVisible = String(!layer.hidden);
    viewport.dataset.hotspotInspector = inspector.hidden ? "closed" : "open";
    viewport.dataset.hotspotSelected = selectedId || "none";
  }

  function closeInspector({ restoreFocus = true } = {}) {
    if (inspector.hidden) return false;
    inspector.hidden = true;
    selectedId = null;
    if (!isExternalModalOpen()) {
      scene.inert = false;
      scene.removeAttribute("aria-hidden");
    }
    if (restoreFocus) {
      const target = focusBeforeInspector?.isConnected ? focusBeforeInspector : viewport;
      target.focus?.({ preventScroll: true });
    }
    focusBeforeInspector = null;
    updateDataset();
    window.dispatchEvent(new CustomEvent("micro-cell:hotspot-closed"));
    return true;
  }

  function openInspector(id) {
    const entry = activeEntries.find((candidate) => candidate.id === id);
    const buttons = activeButtons.get(id) || [];
    if (!entry || !buttons.some((button) => button.dataset.liveVisible !== "false") || layer.hidden) return false;
    focusBeforeInspector = document.activeElement;
    selectedId = id;
    title.textContent = entry.name;
    observation.textContent = entry.observation;
    inspector.hidden = false;
    inspector.scrollTop = 0;
    inspector.dataset.hotspotId = id;
    scene.inert = true;
    scene.setAttribute("aria-hidden", "true");
    title.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (!inspector.hidden && document.activeElement !== title) title.focus({ preventScroll: true });
    });
    updateDataset();
    const detail = { id: entry.id, name: entry.name, observation: entry.observation, nodeId: context.nodeId, owner: context.owner };
    window.dispatchEvent(new CustomEvent("micro-cell:hotspot-opened", { detail }));
    if (detail.item?.acquired) observation.textContent = `${entry.observation}\n\n入手：${detail.item.name}`;
    return true;
  }

  function clear({ restoreFocus = false } = {}) {
    closeInspector({ restoreFocus });
    layer.hidden = true;
    layer.replaceChildren();
    activeEntries = [];
    regionRecords = [];
    suppressedRegions = [];
    activeButtons = new Map();
    contextIdentity = "";
    renderSignature = "";
    updateDataset();
  }

  function makeButton(entry, region, order) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hotspot-target";
    button.dataset.hotspotId = entry.id;
    button.dataset.hotspotRegion = String(region.regionIndex);
    button.setAttribute("aria-label", `${entry.name}を調べる`);
    button.style.left = `${region.hit.x}px`;
    button.style.top = `${region.hit.y}px`;
    button.style.width = `${region.hit.width}px`;
    button.style.height = `${region.hit.height}px`;
    button.style.zIndex = String(1000 + Number(entry.priority || 0) * 10 - order);
    button.style.setProperty("--hotspot-visual-left", `${region.visual.x - region.hit.x}px`);
    button.style.setProperty("--hotspot-visual-top", `${region.visual.y - region.hit.y}px`);
    button.style.setProperty("--hotspot-visual-width", `${region.visual.width}px`);
    button.style.setProperty("--hotspot-visual-height", `${region.visual.height}px`);
    for (const type of ["pointerdown", "pointerup"]) button.addEventListener(type, (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openInspector(entry.id);
    });
    return button;
  }

  function refreshLiveVisibility({ minimumRatio = 0.25 } = {}) {
    const liveVisibleIds = new Set();
    for (const [id, buttons] of activeButtons) {
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        const width = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left));
        const height = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
        const ratio = rect.width > 0 && rect.height > 0 ? width * height / (rect.width * rect.height) : 0;
        const visible = ratio >= minimumRatio;
        button.dataset.liveVisible = String(visible);
        button.dataset.liveVisibleRatio = ratio.toFixed(6);
        button.tabIndex = visible ? 0 : -1;
        button.setAttribute("aria-hidden", String(!visible));
        button.style.pointerEvents = visible ? "auto" : "none";
        if (visible) liveVisibleIds.add(id);
        else if (document.activeElement === button) viewport.focus({ preventScroll: true });
      }
    }
    viewport.dataset.hotspotLiveVisibleCount = String(liveVisibleIds.size);
    return getState();
  }

  function sync({ nodeId, owner, renderScale, coverScale, focal, active, viewportWidth = innerWidth, viewportHeight = innerHeight }) {
    if (!active) {
      clear({ restoreFocus: false });
      return getState();
    }
    const nextIdentity = `${nodeId}:${owner}`;
    if (contextIdentity && contextIdentity !== nextIdentity) closeInspector({ restoreFocus: false });
    context = { nodeId, owner, renderScale, coverScale, focal, viewportWidth, viewportHeight };
    const entries = activeHotspotsForContext(manifest, context);
    const minimumCssPixels = globalThis.matchMedia?.("(pointer: coarse)")?.matches ? MIN_TOUCH_TARGET_CSS_PX : MIN_TARGET_CSS_PX;
    const displayScale = coverScale * renderScale;
    const candidates = entries.flatMap((entry) => entry.boxes.map((rawBox, regionIndex) => {
      const visual = normalizeHotspotBox(rawBox);
      const hit = expandHotspotBox(visual, displayScale, { minimumCssPixels });
      const projectedVisual = projectHotspotBox(visual, context);
      const projectedHit = projectHotspotBox(hit, context);
      const ratio = visibleRatio(projectedVisual, viewportWidth, viewportHeight);
      const visualCore = Math.min(projectedVisual.width, projectedVisual.height);
      const partial = entry.target.visibility !== "full" && !entry.target.visibility.startsWith("full-") && entry.target.visibility !== "stage-derived-exact";
      // The boss plate uses a single-bitmap mobile camera pan. Keep its verified
      // source regions mounted so they travel with that owner and become
      // inspectable as the pan exposes them; ordinary owners stay fail-closed at
      // crop edges.
      const eligible = owner === "boss"
        ? visualCore >= MIN_VISUAL_CORE_CSS_PX
        : ratio >= 0.5 && visualCore >= MIN_VISUAL_CORE_CSS_PX && (!partial || whollyVisible(projectedHit, viewportWidth, viewportHeight));
      return { id: entry.id, entry, regionIndex, visual, hit, projectedVisual, projectedHit, visibleRatio: ratio, eligible };
    }));

    const accepted = [];
    const suppressed = [];
    for (const candidate of candidates) {
      if (!candidate.eligible) {
        suppressed.push({ id: candidate.id, regionIndex: candidate.regionIndex, reason: "visibility" });
        continue;
      }
      const conflict = owner === "boss"
        ? null
        : accepted.find((other) => other.id !== candidate.id && boxesIntersect(other.hit, candidate.hit));
      if (conflict) {
        suppressed.push({ id: candidate.id, regionIndex: candidate.regionIndex, reason: `overlap:${conflict.id}` });
        continue;
      }
      accepted.push(candidate);
    }
    const acceptedIds = new Set(accepted.map(({ id }) => id));
    const nextEntries = entries.filter(({ id }) => acceptedIds.has(id));
    const signature = `${nextIdentity}:${renderScale}:${coverScale}:${viewportWidth}x${viewportHeight}:${accepted.map(({ id, regionIndex, hit }) => `${id}.${regionIndex}:${Object.values(hit).join(",")}`).join("|")}`;
    if (renderSignature === signature) return getState();
    contextIdentity = nextIdentity;
    renderSignature = signature;
    activeEntries = nextEntries;
    regionRecords = accepted;
    suppressedRegions = suppressed;
    activeButtons = new Map();
    const buttons = accepted.map((region, index) => {
      const button = makeButton(region.entry, region, index);
      const list = activeButtons.get(region.id) || [];
      list.push(button);
      activeButtons.set(region.id, list);
      return button;
    });
    layer.style.setProperty("--hotspot-layer-scale", String(renderScale));
    layer.style.setProperty("--hotspot-origin-x", `${focal.x}px`);
    layer.style.setProperty("--hotspot-origin-y", `${focal.y}px`);
    layer.replaceChildren(...buttons);
    layer.hidden = buttons.length === 0;
    refreshLiveVisibility();
    updateDataset();
    return getState();
  }

  function handleKeyDown(event) {
    if (inspector.hidden) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeInspector();
      return true;
    }
    if (["w", "W", "ArrowUp", "s", "S", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      closeButton.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  function getState() {
    const overlapPairs = [];
    for (let left = 0; left < regionRecords.length; left += 1) {
      for (let right = left + 1; right < regionRecords.length; right += 1) {
        const a = regionRecords[left];
        const b = regionRecords[right];
        if (a.id !== b.id && boxesIntersect(a.hit, b.hit)) overlapPairs.push({ above: a.id, below: b.id, abovePriority: a.entry.priority, belowPriority: b.entry.priority });
      }
    }
    return deepFreeze({
      manifestVersion: manifest.version, manifestValid: validation.valid, manifestCount: validation.count,
      rawAssetReferences: validation.rawAssetReferences, nodeId: context.nodeId, owner: context.owner,
      visible: !layer.hidden, inspectorOpen: !inspector.hidden, selectedId,
      activeIds: activeEntries.map(({ id }) => id),
      liveVisibleIds: [...activeButtons.entries()].filter(([, buttons]) => buttons.some((button) => button.dataset.liveVisible !== "false")).map(([id]) => id),
      hitBoxes: regionRecords.map(({ id, regionIndex, entry, visual, hit, projectedVisual, projectedHit, visibleRatio: ratio }) => {
        const button = (activeButtons.get(id) || []).find((candidate) => candidate.dataset.hotspotRegion === String(regionIndex));
        const rect = button?.getBoundingClientRect();
        return {
          id, regionIndex, priority: entry.priority, visual: { ...visual }, hit: { ...hit }, projectedVisual: { ...projectedVisual }, projectedHit: { ...projectedHit }, visibleRatio: ratio,
          domRect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
          liveVisible: button?.dataset.liveVisible !== "false",
          liveVisibleRatio: Number(button?.dataset.liveVisibleRatio || 0)
        };
      }),
      suppressedRegions: suppressedRegions.map((value) => ({ ...value })), overlapPairs,
      minimumTargetCssPixels: globalThis.matchMedia?.("(pointer: coarse)")?.matches ? MIN_TOUCH_TARGET_CSS_PX : MIN_TARGET_CSS_PX
    });
  }

  closeButton.addEventListener("click", () => closeInspector());
  title.tabIndex = -1;
  clear({ restoreFocus: false });
  return deepFreeze({ sync, clear, reset: () => clear({ restoreFocus: false }), refreshLiveVisibility, inspect: openInspector, close: () => closeInspector(), handleKeyDown, isOpen: () => !inspector.hidden, getState });
}
