import { NARRATIVE_WORLD_ITEMS } from "./narrative-content.mjs";

const SOURCE_WIDTH = 1536;
const SOURCE_HEIGHT = 1024;
const MIN_TARGET_CSS_PX = 48;

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

function visibleCanvasSize(asset, visualSize) {
  const [x0, y0, x1, y1] = asset.visibleAlphaBounds;
  const visibleWidth = x1 - x0;
  const visibleHeight = y1 - y0;
  const containScale = Math.min(visualSize[0] / visibleWidth, visualSize[1] / visibleHeight);
  return {
    canvasWidth: asset.width * containScale,
    canvasHeight: asset.height * containScale,
    visibleWidth: visibleWidth * containScale,
    visibleHeight: visibleHeight * containScale,
    offsetX: x0 * containScale,
    offsetY: y0 * containScale
  };
}

export function createWorldItemRuntime({ layer, viewport, onClaim, getPlacements }) {
  let context = { nodeId: null, owner: null, renderScale: 1, coverScale: 1, focal: { x: 768, y: 512 } };
  let records = [];

  function clear() {
    layer.hidden = true;
    layer.replaceChildren();
    records = [];
    viewport.dataset.worldItemCount = "0";
  }

  function makeButton(placement, displayScale) {
    const item = NARRATIVE_WORLD_ITEMS[placement.itemId];
    const asset = item?.asset;
    if (!asset?.approved || asset.raw || asset.path.includes("/raw/")) return null;
    const canvas = visibleCanvasSize(asset, placement.visualSize);
    const hitWidth = Math.max(canvas.visibleWidth, MIN_TARGET_CSS_PX / displayScale);
    const hitHeight = Math.max(canvas.visibleHeight, MIN_TARGET_CSS_PX / displayScale);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "world-item-target";
    button.dataset.placementId = placement.id;
    button.dataset.itemId = placement.itemId;
    button.setAttribute("aria-label", `${item.name}を拾う`);
    button.style.left = `${placement.anchor[0] - hitWidth / 2}px`;
    button.style.top = `${placement.anchor[1] - hitHeight / 2}px`;
    button.style.width = `${hitWidth}px`;
    button.style.height = `${hitHeight}px`;
    button.style.zIndex = String(100 + placement.priority);
    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.src = asset.path;
    image.width = asset.width;
    image.height = asset.height;
    image.style.width = `${canvas.canvasWidth}px`;
    image.style.height = `${canvas.canvasHeight}px`;
    image.style.left = `${hitWidth / 2 - canvas.visibleWidth / 2 - canvas.offsetX}px`;
    image.style.top = `${hitHeight / 2 - canvas.visibleHeight / 2 - canvas.offsetY}px`;
    if (placement.transform) image.style.transform = placement.transform;
    if (placement.contactShadow) button.dataset.contactShadow = "true";
    button.append(image);
    for (const type of ["pointerdown", "pointerup"]) button.addEventListener(type, (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClaim(placement);
    });
    return { placement, button, image, hitWidth, hitHeight };
  }

  function sync({ nodeId, owner, renderScale, coverScale, focal, active, grandmaResolved = false }) {
    context = { nodeId, owner, renderScale, coverScale, focal };
    if (!active) {
      clear();
      return getState();
    }
    const placements = getPlacements({ nodeId, owner, grandmaResolved });
    const displayScale = coverScale * renderScale;
    records = placements.map((placement) => makeButton(placement, displayScale)).filter(Boolean);
    layer.style.setProperty("--world-item-layer-scale", String(renderScale));
    layer.style.setProperty("--world-item-origin-x", `${focal.x}px`);
    layer.style.setProperty("--world-item-origin-y", `${focal.y}px`);
    layer.replaceChildren(...records.map(({ button }) => button));
    layer.hidden = records.length === 0;
    viewport.dataset.worldItemCount = String(records.length);
    return getState();
  }

  function getState() {
    return freeze({
      ...context,
      visible: !layer.hidden,
      minimumTargetCssPixels: MIN_TARGET_CSS_PX,
      placements: records.map(({ placement, button }) => {
        const rect = button.getBoundingClientRect();
        return {
          id: placement.id,
          itemId: placement.itemId,
          owner: placement.owner,
          anchor: [...placement.anchor],
          targetCss: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        };
      })
    });
  }

  clear();
  return freeze({ sync, clear, reset: clear, getState });
}
