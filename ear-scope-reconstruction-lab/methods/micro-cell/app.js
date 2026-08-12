import { GRANDMA_COPY, createGrandmaEncounter } from "./grandma-encounter-state.mjs";
import { GRANDMA_ROOM_FLOW_PLAN } from "./grandma-room-flow-plan.mjs";
import { createSpaceArcRuntime } from "./space-arc-runtime.mjs";
import { HOTSPOT_MANIFEST } from "./hotspot-manifest.mjs";
import { createHotspotRuntime } from "./hotspot-runtime.mjs";
import { createWorldItemRuntime } from "./world-item-runtime.mjs";

(() => {
  "use strict";

  const GRAPH_URL = "./view-cell-graph.json";
  const RUNTIME_VERSION = "micro-cell-space-window-arc-active-v1";
  const SOURCE_SHA256 = "974969b6ab13b78100249560db79e687b33c5b2e3193f190cec5306e8ca18b24";
  const DETAIL_SHA256 = "c29b6a1e4cf30c147693ecc31b44518d21b3e66e92e4aaa27d3500bbbd146767";
  const SOURCE_SIZE = Object.freeze({ width: 1536, height: 1024 });
  const FOCAL = Object.freeze({ x: 838.65234375, y: 411.5484375 });
  const WINDOW_FOCAL = Object.freeze({ x: 768, y: 350 });
  const SHIP_FOCAL = Object.freeze({ x: 768, y: 480 });
  const STATES = Object.freeze([
    { id: "z000", owner: "exact", renderScale: 1, effectiveScale: 1 },
    { id: "z001", owner: "exact", renderScale: 1.2, effectiveScale: 1.2 },
    { id: "z002", owner: "exact", renderScale: 1.44, effectiveScale: 1.44 },
    { id: "z003", owner: "exact", renderScale: 1.728, effectiveScale: 1.728 },
    { id: "z004", owner: "detail", renderScale: 1.2, effectiveScale: 2.0736 },
    { id: "z005", owner: "detail", renderScale: 1.44, effectiveScale: 2.48832 },
    { id: "z006", owner: "z006", renderScale: 1, effectiveScale: 2.985984 },
    { id: "z007", owner: "z007", renderScale: 1, effectiveScale: 3.5831808 },
    { id: "z008", owner: "z008", renderScale: 1, effectiveScale: 4.29981696 },
    { id: "z009", owner: "z009", renderScale: 1, effectiveScale: 5.159780352 },
    { id: "z010", owner: "room", renderScale: 1, effectiveScale: 5.6757583872 },
    { id: "z011", owner: "room", renderScale: 1.075, effectiveScale: 6.1917364224 },
    { id: "w000", owner: "room", renderScale: 1.18, effectiveScale: 6.75, focal: FOCAL },
    { id: "w001", owner: "room", renderScale: 1.32, effectiveScale: 7.4, focal: FOCAL },
    { id: "w002", owner: "room", renderScale: 1.48, effectiveScale: 8.1, focal: FOCAL },
    { id: "w003", owner: "room", renderScale: 1.68, effectiveScale: 8.9, focal: FOCAL },
    { id: "wp000", owner: "portal", renderScale: 1, effectiveScale: 9, focal: SHIP_FOCAL },
    { id: "s000", owner: "stage-s000", renderScale: 1, effectiveScale: 10, focal: SHIP_FOCAL },
    { id: "s001", owner: "stage-s001", renderScale: 1, effectiveScale: 11.5, focal: SHIP_FOCAL },
    { id: "s002", owner: "stage-s002", renderScale: 1, effectiveScale: 13.225, focal: SHIP_FOCAL },
    { id: "s003", owner: "stage-s003", renderScale: 1, effectiveScale: 15.20875, focal: SHIP_FOCAL },
    { id: "s004", owner: "stage-s004", renderScale: 1, effectiveScale: 17.4900625, focal: SHIP_FOCAL },
    { id: "s005", owner: "stage-s005", renderScale: 1, effectiveScale: 17.4900625, focal: SHIP_FOCAL },
    { id: "s006", owner: "stage-s006", renderScale: 1, effectiveScale: 20.11357187, focal: SHIP_FOCAL },
    { id: "s007", owner: "stage-s007", renderScale: 1, effectiveScale: 23.13060766, focal: SHIP_FOCAL },
    { id: "s008", owner: "stage-s008", renderScale: 1, effectiveScale: 26.6001988, focal: SHIP_FOCAL },
    { id: "s009", owner: "stage-s009", renderScale: 1, effectiveScale: 30.59022863, focal: SHIP_FOCAL },
    { id: "b000", owner: "boss", renderScale: 1, effectiveScale: 33, focal: SHIP_FOCAL }
  ].map(Object.freeze));
  const NODE_IDS = Object.freeze(STATES.map(({ id }) => id));
  const BOUNDARIES = Object.freeze({
    "3-4": Object.freeze({ id: "z003-z004", order: "fade-then-zoom", fromOwner: "exact", toOwner: "detail", toStartScale: 1, label: "detail" }),
    "5-6": Object.freeze({ id: "z005-z006", order: "zoom-then-fade", fromOwner: "detail", toOwner: "z006", geometryScale: 1.728, label: "refined-z006" }),
    "6-7": Object.freeze({ id: "z006-z007", order: "zoom-then-fade", fromOwner: "z006", toOwner: "z007", geometryScale: 1.2, label: "refined-z007" }),
    "7-8": Object.freeze({ id: "z007-z008", order: "zoom-then-fade", fromOwner: "z007", toOwner: "z008", geometryScale: 1.2, label: "refined-z008" }),
    "8-9": Object.freeze({ id: "z008-z009", order: "zoom-then-fade", fromOwner: "z008", toOwner: "z009", geometryScale: 1.2, label: "refined-z009" }),
    "9-10": Object.freeze({ id: "z009-z010", order: "scope-blink", fromOwner: "z009", toOwner: "room", label: "room-entry" }),
    "15-16": Object.freeze({ id: "w003-wp000", order: "scope-blink", fromOwner: "room", toOwner: "portal", label: "window-portal" }),
    "16-17": Object.freeze({ id: "wp000-s000", order: "bulkhead", fromOwner: "portal", toOwner: "stage-s000", label: "ship-entry" }),
    "17-18": Object.freeze({ id: "s000-s001", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "18-19": Object.freeze({ id: "s001-s002", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "19-20": Object.freeze({ id: "s002-s003", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "20-21": Object.freeze({ id: "s003-s004", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "21-22": Object.freeze({ id: "s004-s005", order: "bulkhead", fromOwner: "stage-s004", toOwner: "stage-s005", label: "deep-corridor-lighting" }),
    "22-23": Object.freeze({ id: "s005-s006", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "23-24": Object.freeze({ id: "s006-s007", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "24-25": Object.freeze({ id: "s007-s008", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "25-26": Object.freeze({ id: "s008-s009", order: "stage-step", ratio: 1.15, label: "ship-step" }),
    "26-27": Object.freeze({ id: "s009-b000", order: "scope-blink", fromOwner: "stage-s009", toOwner: "boss", label: "boss-door" })
  });
  const APPROACH_INDEX = 9;
  const ENCOUNTER_INDEX = 10;
  const CLEARED_INDEX = 11;
  const ZOOM_MS = 360;
  const DETAIL_FADE_MS = 300;
  const BLINK_PUSH_MS = 320;
  const BLINK_CLOSE_MS = 180;
  const BLINK_OPEN_MS = 200;
  const BLINK_PUSH_SCALE = 1.12;
  const TIMER_MARGIN_MS = 34;
  const BULKHEAD_CLOSE_MS = 170;
  const BULKHEAD_OPEN_MS = 190;

  const viewport = document.querySelector("#viewport");
  const scene = document.querySelector("#scene");
  const sourceFrame = document.querySelector("#source-frame");
  const grandmaSprite = document.querySelector("#grandma-sprite");
  const grandmaForeground = document.querySelector("#grandma-foreground-occluder");
  const earwaxReveal = document.querySelector("#earwax-reveal");
  const encounterDialog = document.querySelector("#encounter-dialog");
  const encounterMessage = document.querySelector("#encounter-message");
  const encounterActions = document.querySelector("#encounter-actions");
  const scopeBlink = document.querySelector("#scope-blink");
  const bulkheadEvent = document.querySelector("#bulkhead-event");
  const spaceCharacterImage = document.querySelector("#space-character-image");
  const spaceCharacterVideo = document.querySelector("#space-character-video");
  const bossBrainOverlay = document.querySelector("#boss-brain-overlay");
  const spaceDialog = document.querySelector("#space-dialog");
  const spaceHeading = document.querySelector("#space-heading");
  const spaceStatus = document.querySelector("#space-status");
  const spaceMessage = document.querySelector("#space-message");
  const spaceResult = document.querySelector("#space-result");
  const spaceActions = document.querySelector("#space-actions");
  const brainHud = document.querySelector("#space-hud");
  const brainProgress = document.querySelector("#brain-progress");
  const brainValue = document.querySelector("#brain-value");
  const spaceInventory = document.querySelector("#space-inventory");
  const spaceItemToast = document.querySelector("#space-item-toast");
  const spaceAmbientToast = document.querySelector("#space-ambient-toast");
  const hotspotLayer = document.querySelector("#hotspot-layer");
  const worldItemLayer = document.querySelector("#world-item-layer");
  const hotspotInspector = document.querySelector("#hotspot-inspector");
  const hotspotTitle = document.querySelector("#hotspot-title");
  const hotspotObservation = document.querySelector("#hotspot-observation");
  const hotspotClose = document.querySelector("#hotspot-close");
  const plates = Object.freeze({
    a: document.querySelector("#plate-a"),
    b: document.querySelector("#plate-b")
  });
  const plateState = {
    a: { owner: null, scale: 1, opacity: 0, zIndex: 1, focal: FOCAL },
    b: { owner: null, scale: 1, opacity: 0, zIndex: 1, focal: FOCAL }
  };
  let graph = null;
  let assets = null;
  let assetRecords = null;
  let assetPreparing = false;
  let assetRequestToken = 0;
  let ready = false;
  let currentIndex = 0;
  let activePlate = "a";
  let renderOwner = "exact";
  let handoffPhase = "idle";
  let activeBoundary = null;
  let transitionActive = false;
  let transitionDirection = 0;
  let transitionTimer = 0;
  let pointerStart = null;
  let consoleFailure = null;
  let grandmaAsset = null;
  let earwaxAsset = null;
  let grandmaHideTimer = 0;
  let focusBeforeEncounter = null;
  let spaceArcStarted = false;
  let currentCoverScale = 1;
  let bossInspectionPanIndex = 2;
  let bossInspectionActive = false;
  let bossInspectionVisibilityRaf = 0;
  let bossInspectionPointerStart = null;

  const BOSS_INSPECTION_FOCUS_X = Object.freeze([290, 768, 1228]);
  const BOSS_INSPECTION_PAN_NAMES = Object.freeze(["left", "center", "right"]);

  const grandmaEncounter = createGrandmaEncounter({
    onChange: (storyState) => {
      renderEncounter(storyState);
      updateDiagnostics();
    },
    onCompanionTurn: (action, storyState) => {
      window.dispatchEvent(new CustomEvent("micro-cell:grandma-companion-turn", {
        detail: freeze({ action, state: storyState })
      }));
    }
  });

  const spaceArc = createSpaceArcRuntime({
    scene,
    viewport,
    dialog: spaceDialog,
    heading: spaceHeading,
    status: spaceStatus,
    message: spaceMessage,
    resultLive: spaceResult,
    actions: spaceActions,
    characterImage: spaceCharacterImage,
    characterVideo: spaceCharacterVideo,
    brainOverlay: bossBrainOverlay,
    brainHud,
    brainProgress,
    brainValue,
    inventoryHud: spaceInventory,
    itemToast: spaceItemToast,
    ambientToast: spaceAmbientToast,
    onNavigate: (index) => requestIndex(index),
    onResetRequested: () => reset(),
    onDiagnostics: () => updateDiagnostics()
  });

  const hotspots = createHotspotRuntime({
    layer: hotspotLayer,
    inspector: hotspotInspector,
    title: hotspotTitle,
    observation: hotspotObservation,
    closeButton: hotspotClose,
    scene,
    viewport,
    manifest: HOTSPOT_MANIFEST,
    validNodes: NODE_IDS,
    validOwners: [...new Set(STATES.map(({ owner }) => owner))],
    isExternalModalOpen: () => !encounterDialog.hidden || !spaceDialog.hidden
  });

  const worldItems = createWorldItemRuntime({
    layer: worldItemLayer,
    viewport,
    onClaim: (placement) => spaceArc.discoverItem(placement.itemId, null, placement.id),
    getPlacements: (context) => spaceArc.getWorldPlacements(context)
  });

  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const nested of Object.values(value)) freeze(nested);
      Object.freeze(value);
    }
    return value;
  }

  function actionButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function forwardFromEncounter() {
    if (!grandmaEncounter.getState().pathUnlocked || currentIndex !== ENCOUNTER_INDEX || transitionActive || assetPreparing) return getState();
    grandmaEncounter.hide();
    hideEncounterVisualsImmediately();
    return requestIndex(CLEARED_INDEX);
  }

  function retreatFromEncounter() {
    grandmaEncounter.hide();
    hideEncounterVisualsImmediately();
    return currentIndex === ENCOUNTER_INDEX ? requestIndex(APPROACH_INDEX) : getState();
  }

  function renderEncounter(storyState = grandmaEncounter.getState()) {
    const atSettledEncounter = ready && currentIndex === ENCOUNTER_INDEX && !transitionActive && !assetPreparing;
    const showDialog = atSettledEncounter && storyState.screen !== "hidden";
    const showSprite = atSettledEncounter && storyState.spriteVisible && Boolean(grandmaAsset);
    const showEarwax = atSettledEncounter && storyState.earwaxVisible && Boolean(earwaxAsset);
    const dialogWasHidden = encounterDialog.hidden;

    clearTimeout(grandmaHideTimer);
    grandmaHideTimer = 0;
    if (showSprite) {
      const foregroundUrl = assets?.room?.url;
      if (foregroundUrl && grandmaForeground.src !== foregroundUrl) grandmaForeground.src = foregroundUrl;
      grandmaSprite.hidden = false;
      grandmaSprite.dataset.leaving = "false";
      grandmaForeground.hidden = false;
    } else {
      grandmaSprite.dataset.leaving = "false";
      grandmaSprite.hidden = true;
      grandmaForeground.hidden = true;
    }
    earwaxReveal.hidden = !showEarwax;
    scene.inert = showDialog;
    if (showDialog) scene.setAttribute("aria-hidden", "true");
    else scene.removeAttribute("aria-hidden");
    if (showDialog && dialogWasHidden) focusBeforeEncounter = document.activeElement;
    encounterDialog.hidden = !showDialog;
    encounterActions.replaceChildren();
    if (!showDialog) {
      if (!dialogWasHidden) (focusBeforeEncounter?.focus ? focusBeforeEncounter : viewport).focus({ preventScroll: true });
      focusBeforeEncounter = null;
      return;
    }

    const dialogLabels = {
      action: "おばあさんへの行動",
      questions: "おばあさんへの質問",
      answer: "おばあさんの答え",
      "recruit-result": "仲間になった結果",
      "battle-player": "戦う行動の選択",
      "battle-result": "耳かき行動の結果",
      "battle-grandma": "おばあさんのターン",
      victory: "戦いの結果"
    };
    encounterDialog.setAttribute("aria-label", dialogLabels[storyState.screen] || "おばあさんとの遭遇");
    encounterActions.setAttribute("aria-label", dialogLabels[storyState.screen] || "行動を選ぶ");

    let message = storyState.message || "編み物をするおばあさんが、こちらを見ている。";
    const buttons = [];
    if (storyState.screen === "action") {
      buttons.push(
        actionButton("話す", () => grandmaEncounter.chooseAction("talk")),
        actionButton("仲間にする", () => grandmaEncounter.chooseAction("recruit")),
        actionButton("戦う", () => grandmaEncounter.chooseAction("battle")),
        actionButton("何もしない", retreatFromEncounter)
      );
    } else if (storyState.screen === "questions") {
      message = "何を尋ねますか。";
      buttons.push(
        actionButton(GRANDMA_COPY.questions.identity.label, () => grandmaEncounter.chooseQuestion("identity")),
        actionButton(GRANDMA_COPY.questions.reason.label, () => grandmaEncounter.chooseQuestion("reason")),
        actionButton(GRANDMA_COPY.questions.place.label, () => grandmaEncounter.chooseQuestion("place")),
        actionButton("話すのをやめる", () => grandmaEncounter.chooseQuestion("stop"))
      );
    } else if (storyState.screen === "answer") {
      buttons.push(actionButton("質問に戻る", () => grandmaEncounter.questions()));
    } else if (storyState.screen === "recruit-result" || storyState.screen === "victory") {
      buttons.push(actionButton("前へ進む", forwardFromEncounter));
    } else if (storyState.screen === "battle-player") {
      message = "どうしますか。";
      if (storyState.battleStage === 0) {
        buttons.push(actionButton("耳かきで表面をなぞる", () => grandmaEncounter.battleAction("surface")));
      } else if (storyState.battleStage === 1) {
        buttons.push(actionButton("耳かきで端を起こす", () => grandmaEncounter.battleAction("edge")));
      } else {
        buttons.push(
          actionButton("ピンセットで除去する", () => grandmaEncounter.battleAction("tweezers")),
          actionButton("耳かきでもう少しほぐす", () => grandmaEncounter.battleAction("loosen"))
        );
      }
      buttons.push(actionButton("戦うのをやめる", () => grandmaEncounter.quitBattle()));
    } else if (storyState.screen === "battle-result") {
      buttons.push(
        actionButton("次へ", () => grandmaEncounter.advanceBattle()),
        actionButton("戦うのをやめる", () => grandmaEncounter.quitBattle())
      );
    } else if (storyState.screen === "battle-grandma") {
      buttons.push(
        actionButton("続ける", () => grandmaEncounter.continueBattle()),
        actionButton("戦うのをやめる", () => grandmaEncounter.quitBattle())
      );
    }

    encounterMessage.textContent = message;
    encounterActions.append(...buttons);
    requestAnimationFrame(() => buttons[0]?.focus({ preventScroll: true }));
  }

  function syncEncounterForNode() {
    const storyState = grandmaEncounter.getState();
    if (currentIndex === ENCOUNTER_INDEX && !transitionActive && !assetPreparing && !storyState.encounterResolved) {
      spaceArc.suppressAmbient();
      if (storyState.screen === "hidden") grandmaEncounter.open();
      else renderEncounter(storyState);
      return;
    }
    if (currentIndex !== ENCOUNTER_INDEX || storyState.encounterResolved) {
      if (storyState.screen !== "hidden" && currentIndex !== ENCOUNTER_INDEX) grandmaEncounter.hide();
      else renderEncounter(storyState);
    }
  }

  function hideEncounterVisualsImmediately() {
    clearTimeout(grandmaHideTimer);
    grandmaHideTimer = 0;
    grandmaSprite.dataset.leaving = "false";
    grandmaSprite.hidden = true;
    grandmaForeground.hidden = true;
    earwaxReveal.hidden = true;
  }

  function updateCoverScale() {
    const bossPortrait = STATES[currentIndex]?.id === "b000" && innerWidth / innerHeight < 0.9;
    const scale = Math.max(innerWidth / SOURCE_SIZE.width, innerHeight / SOURCE_SIZE.height);
    currentCoverScale = scale;
    document.documentElement.style.setProperty("--cover-scale", String(scale));
    if (bossPortrait) {
      const startFocusX = 820;
      const endFocusX = 1170;
      document.documentElement.style.setProperty("--source-frame-left", "50%");
      document.documentElement.style.setProperty("--boss-pan-start-shift", `${SOURCE_SIZE.width / 2 - startFocusX}px`);
      document.documentElement.style.setProperty("--boss-pan-end-shift", `${SOURCE_SIZE.width / 2 - endFocusX}px`);
    } else {
      document.documentElement.style.setProperty("--source-frame-left", "50%");
    }
    viewport.dataset.bossPortraitComposition = bossPortrait ? "immersive-panning-pc-owner" : "standard-cover";
    if (bossInspectionActive) setBossInspectionPan(bossInspectionPanIndex, { durationMs: 1 });
    if (ready) syncHotspots();
  }

  function scheduleBossInspectionVisibility(durationMs = 320) {
    cancelAnimationFrame(bossInspectionVisibilityRaf);
    const startedAt = performance.now();
    const refresh = (now) => {
      hotspots.refreshLiveVisibility({ minimumRatio: 0.25 });
      if (bossInspectionActive && now - startedAt < durationMs) bossInspectionVisibilityRaf = requestAnimationFrame(refresh);
      else bossInspectionVisibilityRaf = 0;
    };
    bossInspectionVisibilityRaf = requestAnimationFrame(refresh);
  }

  function setBossInspectionPan(index, { durationMs = 320 } = {}) {
    bossInspectionPanIndex = Math.max(0, Math.min(BOSS_INSPECTION_FOCUS_X.length - 1, Math.round(index)));
    const focusX = BOSS_INSPECTION_FOCUS_X[bossInspectionPanIndex];
    document.documentElement.style.setProperty("--boss-inspection-shift", `${SOURCE_SIZE.width / 2 - focusX}px`);
    viewport.dataset.bossInspectionPan = BOSS_INSPECTION_PAN_NAMES[bossInspectionPanIndex];
    scheduleBossInspectionVisibility(durationMs);
    return bossInspectionPanIndex;
  }

  function syncBossInspectionMode() {
    const active = spaceArc.isBossInspectionMode();
    if (active && !bossInspectionActive) {
      bossInspectionActive = true;
      setBossInspectionPan(2);
    } else if (!active && bossInspectionActive) {
      bossInspectionActive = false;
      cancelAnimationFrame(bossInspectionVisibilityRaf);
      bossInspectionVisibilityRaf = 0;
      viewport.dataset.bossInspectionPan = "none";
    }
    viewport.dataset.bossInspectionActive = String(active);
  }

  function syncHotspots() {
    const state = STATES[currentIndex];
    return hotspots.sync({
      nodeId: state.id,
      owner: renderOwner,
      renderScale: state.renderScale,
      coverScale: currentCoverScale,
      focal: state.focal || FOCAL,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      active: ready
        && !transitionActive
        && !assetPreparing
        && handoffPhase === "idle"
        && renderOwner === state.owner
        && encounterDialog.hidden
        && spaceDialog.hidden
        && scopeBlink.hidden
        && bulkheadEvent.hidden
    });
  }

  function syncWorldItems() {
    const state = STATES[currentIndex];
    const storyState = grandmaEncounter.getState();
    const battleState = spaceArc.getBattleState();
    const resolvedDialogMayShowDrop = !spaceDialog.hidden && battleState.active?.phase === "resolved";
    const grandmaResultMayShowDrop = !encounterDialog.hidden && storyState.pathUnlocked;
    const dialogsAllowWorldItemVisual = encounterDialog.hidden && spaceDialog.hidden
      || resolvedDialogMayShowDrop
      || grandmaResultMayShowDrop;
    return worldItems.sync({
      nodeId: state.id,
      owner: renderOwner,
      renderScale: state.renderScale,
      coverScale: currentCoverScale,
      focal: state.focal || FOCAL,
      grandmaResolved: storyState.pathUnlocked,
      active: ready
        && !transitionActive
        && !assetPreparing
        && handoffPhase === "idle"
        && renderOwner === state.owner
        && dialogsAllowWorldItemVisual
        && scopeBlink.hidden
        && bulkheadEvent.hidden
    });
  }

  function setPlateSource(name, owner) {
    if (!assets || !owner || plateState[name].owner === owner) return;
    if (!assets[owner]) throw new Error(`asset owner is not resident: ${owner}`);
    plates[name].src = assets[owner].url;
    plates[name].dataset.assetOwner = owner;
    plateState[name].owner = owner;
  }

  function setPlateScale(name, scale) {
    plateState[name].scale = scale;
    document.documentElement.style.setProperty(`--plate-${name}-scale`, String(scale));
  }

  function setPlateOpacity(name, opacity) {
    plateState[name].opacity = opacity;
    document.documentElement.style.setProperty(`--plate-${name}-opacity`, String(opacity));
  }

  function setPlateZ(name, zIndex) {
    plateState[name].zIndex = zIndex;
    plates[name].style.zIndex = String(zIndex);
  }

  function setPlateFocal(name, focal = FOCAL) {
    plateState[name].focal = focal;
    document.documentElement.style.setProperty(`--plate-${name}-origin-x`, `${focal.x}px`);
    document.documentElement.style.setProperty(`--plate-${name}-origin-y`, `${focal.y}px`);
  }

  function configurePlate(name, { owner, scale, opacity, zIndex, focal = FOCAL }) {
    setPlateSource(name, owner);
    setPlateFocal(name, focal);
    setPlateScale(name, scale);
    setPlateOpacity(name, opacity);
    setPlateZ(name, zIndex);
  }

  function setBlinkPhase(phase, { hidden = false } = {}) {
    scopeBlink.hidden = hidden;
    scopeBlink.dataset.phase = hidden ? "open" : phase;
  }

  function clearBlink() {
    setBlinkPhase("open", { hidden: true });
  }

  function setBulkheadPhase(phase, { hidden = false } = {}) {
    bulkheadEvent.hidden = hidden;
    bulkheadEvent.dataset.phase = hidden ? "open" : phase;
  }

  function clearBulkhead() {
    setBulkheadPhase("open", { hidden: true });
  }

  function inactivePlateName() {
    return activePlate === "a" ? "b" : "a";
  }

  function updateDiagnostics() {
    const state = STATES[currentIndex];
    const storyState = grandmaEncounter.getState();
    scene.dataset.state = state.id;
    viewport.dataset.zoomNode = state.id;
    viewport.dataset.zoomIndex = String(currentIndex);
    viewport.dataset.zoomScale = String(state.effectiveScale);
    viewport.dataset.renderScale = String(state.renderScale);
    viewport.dataset.renderOwner = renderOwner;
    viewport.dataset.handoffPhase = handoffPhase;
    viewport.dataset.activeBoundary = activeBoundary?.id || "none";
    viewport.dataset.activePlate = activePlate;
    viewport.dataset.plateAOwner = plateState.a.owner || "none";
    viewport.dataset.plateBOwner = plateState.b.owner || "none";
    viewport.dataset.plateAScale = String(plateState.a.scale);
    viewport.dataset.plateBScale = String(plateState.b.scale);
    viewport.dataset.plateAOpacity = String(plateState.a.opacity);
    viewport.dataset.plateBOpacity = String(plateState.b.opacity);
    viewport.dataset.transitionActive = String(transitionActive);
    viewport.dataset.assetPreparing = String(assetPreparing);
    viewport.dataset.encounterScreen = storyState.screen;
    viewport.dataset.pathUnlocked = String(storyState.pathUnlocked);
    viewport.dataset.grandmaRecruited = String(storyState.grandmaRecruited);
    viewport.dataset.grandmaAssetReady = String(Boolean(grandmaAsset));
    viewport.dataset.earwaxAssetReady = String(Boolean(earwaxAsset));
    viewport.dataset.blinkPhase = scopeBlink.hidden ? "idle" : scopeBlink.dataset.phase;
    viewport.dataset.bulkheadPhase = bulkheadEvent.hidden ? "idle" : bulkheadEvent.dataset.phase;
    viewport.dataset.renderer = renderOwner === "handoff"
      ? "same-geometry-bounded-fade"
      : `${renderOwner}-css-zoom`;
    viewport.dataset.zoomReady = String(ready);
    viewport.dataset.spaceArcStarted = String(spaceArcStarted);
    viewport.dataset.spaceRouteIndex = String(spaceArc.getState().routeIndex);
    viewport.dataset.residentCount = String(assets ? Object.keys(assets).length : 0);
    syncBossInspectionMode();
    if (transitionActive) {
      encounterDialog.hidden = true;
      encounterActions.replaceChildren();
      hideEncounterVisualsImmediately();
      spaceArc.syncRoute(state.id, false);
    }
    syncHotspots();
    syncWorldItems();
  }

  function clearTransitionTimer() {
    clearTimeout(transitionTimer);
    transitionTimer = 0;
  }

  function after(ms, callback) {
    clearTransitionTimer();
    transitionTimer = window.setTimeout(callback, ms + TIMER_MARGIN_MS);
  }

  function boundaryBetween(fromIndex, toIndex) {
    return BOUNDARIES[`${Math.min(fromIndex, toIndex)}-${Math.max(fromIndex, toIndex)}`] || null;
  }

  function settleTransition() {
    clearTransitionTimer();
    const state = STATES[currentIndex];
    const hidden = inactivePlateName();
    clearBlink();
    clearBulkhead();
    sourceFrame.dataset.resetting = "true";
    configurePlate(activePlate, { owner: state.owner, scale: state.renderScale, opacity: 1, zIndex: 2, focal: state.focal });
    configurePlate(hidden, { owner: state.owner, scale: state.renderScale, opacity: 0, zIndex: 1, focal: state.focal });
    void sourceFrame.offsetWidth;
    requestAnimationFrame(() => { delete sourceFrame.dataset.resetting; });
    renderOwner = state.owner;
    handoffPhase = "idle";
    activeBoundary = null;
    transitionActive = false;
    transitionDirection = 0;
    updateDiagnostics();
    syncNarrativeForNode();
  }

  function desiredOwnersForIndex(index) {
    const desired = new Set(["exact"]);
    for (let cursor = Math.max(0, index - 1); cursor <= Math.min(STATES.length - 1, index + 1); cursor += 1) {
      desired.add(STATES[cursor].owner);
    }
    return desired;
  }

  function syncNarrativeForNode() {
    const state = STATES[currentIndex];
    if (currentIndex <= CLEARED_INDEX) {
      spaceArc.syncRoute(state.id, !transitionActive && !assetPreparing);
      syncEncounterForNode();
      return;
    }
    grandmaEncounter.hide();
    hideEncounterVisualsImmediately();
    encounterDialog.hidden = true;
    spaceArc.syncRoute(state.id, !transitionActive && !assetPreparing);
    syncHotspots();
    syncWorldItems();
  }

  function evictOutside(desired) {
    const visible = new Set(Object.values(plateState).map(({ owner }) => owner).filter(Boolean));
    for (const owner of Object.keys(assets || {})) {
      if (desired.has(owner) || visible.has(owner)) continue;
      assets[owner].image.src = "";
      delete assets[owner];
    }
  }

  async function ensureResidentsForIndex(index) {
    const desired = desiredOwnersForIndex(index);
    evictOutside(desired);
    for (const owner of desired) {
      if (!assets[owner]) assets[owner] = await preload(assetRecords[owner].path);
    }
    evictOutside(desired);
    if (Object.keys(assets).length > 4) throw new Error("decoded resident hard limit exceeded");
    return desired;
  }

  function requestIndex(index, options = {}) {
    const next = Math.max(0, Math.min(STATES.length - 1, Math.round(index)));
    if (transitionActive || assetPreparing) return getState();
    if (spaceArcStarted && next > CLEARED_INDEX && next > currentIndex && !spaceArc.canEnterRouteIndex(next)) return getState();
    const desired = desiredOwnersForIndex(next);
    if ([...desired].every((owner) => Boolean(assets?.[owner]))) return applyIndex(next, options);
    const token = ++assetRequestToken;
    assetPreparing = true;
    updateDiagnostics();
    ensureResidentsForIndex(next).then(() => {
      if (token !== assetRequestToken) return;
      assetPreparing = false;
      applyIndex(next, options);
    }).catch((error) => {
      if (token !== assetRequestToken) return;
      assetPreparing = false;
      consoleFailure = String(error?.message || error);
      updateDiagnostics();
    });
    return getState();
  }

  function applyAtomic(index) {
    if (index !== ENCOUNTER_INDEX) hideEncounterVisualsImmediately();
    clearTransitionTimer();
    const state = STATES[index];
    const hidden = inactivePlateName();
    currentIndex = index;
    renderOwner = state.owner;
    handoffPhase = "idle";
    activeBoundary = null;
    transitionActive = false;
    transitionDirection = 0;
    clearBlink();
    clearBulkhead();
    sourceFrame.dataset.resetting = "true";
    configurePlate(activePlate, { owner: state.owner, scale: state.renderScale, opacity: 1, zIndex: 2, focal: state.focal });
    configurePlate(hidden, { owner: state.owner, scale: state.renderScale, opacity: 0, zIndex: 1, focal: state.focal });
    void sourceFrame.offsetWidth;
    requestAnimationFrame(() => { delete sourceFrame.dataset.resetting; });
    updateDiagnostics();
    syncNarrativeForNode();
    return getState();
  }

  function beginForwardFadeThenZoom(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = "handoff";
    handoffPhase = `${boundary.label}-fade-forward`;
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = 1;
    sourceFrame.dataset.resetting = "true";
    configurePlate(oldPlate, { owner: fromState.owner, scale: fromState.renderScale, opacity: 1, zIndex: 1 });
    configurePlate(targetPlate, { owner: toState.owner, scale: boundary.toStartScale, opacity: 0, zIndex: 2 });
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    requestAnimationFrame(() => {
      setPlateOpacity(targetPlate, 1);
      updateDiagnostics();
    });
    updateDiagnostics();
    after(DETAIL_FADE_MS, () => {
      setPlateOpacity(oldPlate, 0);
      activePlate = targetPlate;
      renderOwner = toState.owner;
      handoffPhase = `${boundary.label}-zoom-forward`;
      setPlateScale(targetPlate, toState.renderScale);
      updateDiagnostics();
      after(ZOOM_MS, settleTransition);
    });
    return getState();
  }

  function beginReverseZoomThenFade(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = fromState.owner;
    handoffPhase = `${boundary.label}-zoom-reverse`;
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = -1;
    setPlateScale(oldPlate, boundary.toStartScale);
    updateDiagnostics();
    after(ZOOM_MS, () => {
      sourceFrame.dataset.resetting = "true";
      configurePlate(targetPlate, { owner: toState.owner, scale: toState.renderScale, opacity: 0, zIndex: 2 });
      configurePlate(oldPlate, { owner: fromState.owner, scale: boundary.toStartScale, opacity: 1, zIndex: 1 });
      void sourceFrame.offsetWidth;
      delete sourceFrame.dataset.resetting;
      renderOwner = "handoff";
      handoffPhase = `${boundary.label}-fade-reverse`;
      requestAnimationFrame(() => {
        setPlateOpacity(targetPlate, 1);
        updateDiagnostics();
      });
      updateDiagnostics();
      after(DETAIL_FADE_MS, () => {
        setPlateOpacity(oldPlate, 0);
        activePlate = targetPlate;
        settleTransition();
      });
    });
    return getState();
  }

  function beginForwardZoomThenFade(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = fromState.owner;
    handoffPhase = `${boundary.label}-zoom-forward`;
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = 1;
    sourceFrame.dataset.resetting = "true";
    configurePlate(oldPlate, { owner: fromState.owner, scale: fromState.renderScale, opacity: 1, zIndex: 1 });
    configurePlate(targetPlate, { owner: toState.owner, scale: toState.renderScale, opacity: 0, zIndex: 2 });
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    setPlateScale(oldPlate, boundary.geometryScale);
    updateDiagnostics();
    after(ZOOM_MS, () => {
      renderOwner = "handoff";
      handoffPhase = `${boundary.label}-same-geometry-fade-forward`;
      requestAnimationFrame(() => {
        setPlateOpacity(targetPlate, 1);
        updateDiagnostics();
      });
      updateDiagnostics();
      after(DETAIL_FADE_MS, () => {
        setPlateOpacity(oldPlate, 0);
        activePlate = targetPlate;
        settleTransition();
      });
    });
    return getState();
  }

  function beginReverseFadeThenZoom(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = "handoff";
    handoffPhase = `${boundary.label}-same-geometry-fade-reverse`;
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = -1;
    sourceFrame.dataset.resetting = "true";
    configurePlate(oldPlate, { owner: fromState.owner, scale: fromState.renderScale, opacity: 1, zIndex: 1 });
    configurePlate(targetPlate, { owner: toState.owner, scale: boundary.geometryScale, opacity: 0, zIndex: 2 });
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    requestAnimationFrame(() => {
      setPlateOpacity(targetPlate, 1);
      updateDiagnostics();
    });
    updateDiagnostics();
    after(DETAIL_FADE_MS, () => {
      setPlateOpacity(oldPlate, 0);
      activePlate = targetPlate;
      renderOwner = toState.owner;
      handoffPhase = `${boundary.label}-zoom-reverse`;
      setPlateScale(targetPlate, toState.renderScale);
      updateDiagnostics();
      after(ZOOM_MS, settleTransition);
    });
    return getState();
  }

  function beginForwardScopeBlink(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = fromState.owner;
    handoffPhase = "blink-push";
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = 1;
    sourceFrame.dataset.resetting = "true";
    configurePlate(oldPlate, { owner: fromState.owner, scale: fromState.renderScale, opacity: 1, zIndex: 2, focal: fromState.focal });
    configurePlate(targetPlate, { owner: toState.owner, scale: toState.renderScale, opacity: 0, zIndex: 1, focal: toState.focal });
    setBlinkPhase("open");
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    requestAnimationFrame(() => {
      setPlateScale(oldPlate, fromState.renderScale * BLINK_PUSH_SCALE);
      updateDiagnostics();
    });
    updateDiagnostics();
    after(BLINK_PUSH_MS, () => {
      handoffPhase = "blink-closing";
      setBlinkPhase("closing");
      updateDiagnostics();
      after(BLINK_CLOSE_MS, () => {
        setBlinkPhase("closed");
        updateCoverScale();
        sourceFrame.dataset.resetting = "true";
        setPlateOpacity(oldPlate, 0);
        setPlateOpacity(targetPlate, 1);
        setPlateZ(oldPlate, 1);
        setPlateZ(targetPlate, 2);
        activePlate = targetPlate;
        renderOwner = toState.owner;
        handoffPhase = "blink-opening";
        void sourceFrame.offsetWidth;
        delete sourceFrame.dataset.resetting;
        requestAnimationFrame(() => {
          setBlinkPhase("opening");
          updateDiagnostics();
        });
        updateDiagnostics();
        after(BLINK_OPEN_MS, settleTransition);
      });
    });
    return getState();
  }

  function beginReverseScopeBlink(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = fromState.owner;
    handoffPhase = "blink-closing";
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = -1;
    sourceFrame.dataset.resetting = "true";
    configurePlate(oldPlate, { owner: fromState.owner, scale: fromState.renderScale, opacity: 1, zIndex: 2, focal: fromState.focal });
    configurePlate(targetPlate, { owner: toState.owner, scale: toState.renderScale * BLINK_PUSH_SCALE, opacity: 0, zIndex: 1, focal: toState.focal });
    setBlinkPhase("open");
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    requestAnimationFrame(() => {
      setBlinkPhase("closing");
      updateDiagnostics();
    });
    updateDiagnostics();
    after(BLINK_CLOSE_MS, () => {
      setBlinkPhase("closed");
      updateCoverScale();
      sourceFrame.dataset.resetting = "true";
      setPlateOpacity(oldPlate, 0);
      setPlateOpacity(targetPlate, 1);
      setPlateZ(oldPlate, 1);
      setPlateZ(targetPlate, 2);
      activePlate = targetPlate;
      renderOwner = toState.owner;
      handoffPhase = "blink-opening";
      void sourceFrame.offsetWidth;
      delete sourceFrame.dataset.resetting;
      requestAnimationFrame(() => {
        setBlinkPhase("opening");
        updateDiagnostics();
      });
      updateDiagnostics();
      after(BLINK_OPEN_MS, () => {
        clearBlink();
        handoffPhase = "blink-unpush";
        setPlateScale(targetPlate, toState.renderScale);
        updateDiagnostics();
        after(BLINK_PUSH_MS, settleTransition);
      });
    });
    return getState();
  }

  function beginBulkheadSwitch(fromIndex, toIndex, boundary) {
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    renderOwner = fromState.owner;
    handoffPhase = `${boundary.label}-closing`;
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = Math.sign(toIndex - fromIndex);
    sourceFrame.dataset.resetting = "true";
    configurePlate(oldPlate, { owner: fromState.owner, scale: fromState.renderScale, opacity: 1, zIndex: 2, focal: fromState.focal });
    configurePlate(targetPlate, { owner: toState.owner, scale: toState.renderScale, opacity: 0, zIndex: 1, focal: toState.focal });
    setBulkheadPhase("open");
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    requestAnimationFrame(() => {
      setBulkheadPhase("closing");
      updateDiagnostics();
    });
    updateDiagnostics();
    after(BULKHEAD_CLOSE_MS, () => {
      setBulkheadPhase("closed");
      updateCoverScale();
      sourceFrame.dataset.resetting = "true";
      setPlateOpacity(oldPlate, 0);
      setPlateOpacity(targetPlate, 1);
      setPlateZ(oldPlate, 1);
      setPlateZ(targetPlate, 2);
      activePlate = targetPlate;
      renderOwner = toState.owner;
      handoffPhase = `${boundary.label}-opening`;
      void sourceFrame.offsetWidth;
      delete sourceFrame.dataset.resetting;
      requestAnimationFrame(() => {
        setBulkheadPhase("opening");
        updateDiagnostics();
      });
      after(BULKHEAD_OPEN_MS, settleTransition);
    });
    return getState();
  }

  function beginStageStep(fromIndex, toIndex, boundary) {
    const forward = toIndex > fromIndex;
    const fromState = STATES[fromIndex];
    const toState = STATES[toIndex];
    const oldPlate = activePlate;
    const targetPlate = inactivePlateName();
    currentIndex = toIndex;
    activeBoundary = boundary;
    transitionActive = true;
    transitionDirection = forward ? 1 : -1;
    sourceFrame.dataset.resetting = "true";
    if (forward) {
      configurePlate(oldPlate, { owner: fromState.owner, scale: 1, opacity: 1, zIndex: 2, focal: SHIP_FOCAL });
      configurePlate(targetPlate, { owner: toState.owner, scale: 1, opacity: 0, zIndex: 1, focal: SHIP_FOCAL });
      renderOwner = fromState.owner;
      handoffPhase = "stage-zoom-forward";
      void sourceFrame.offsetWidth;
      delete sourceFrame.dataset.resetting;
      requestAnimationFrame(() => {
        setPlateScale(oldPlate, boundary.ratio);
        updateDiagnostics();
      });
      after(ZOOM_MS, () => {
        sourceFrame.dataset.resetting = "true";
        setPlateOpacity(oldPlate, 0);
        setPlateOpacity(targetPlate, 1);
        setPlateZ(oldPlate, 1);
        setPlateZ(targetPlate, 2);
        activePlate = targetPlate;
        renderOwner = toState.owner;
        void sourceFrame.offsetWidth;
        delete sourceFrame.dataset.resetting;
        settleTransition();
      });
      return getState();
    }
    configurePlate(oldPlate, { owner: fromState.owner, scale: 1, opacity: 1, zIndex: 1, focal: SHIP_FOCAL });
    configurePlate(targetPlate, { owner: toState.owner, scale: boundary.ratio, opacity: 1, zIndex: 2, focal: SHIP_FOCAL });
    renderOwner = toState.owner;
    handoffPhase = "stage-zoom-reverse";
    activePlate = targetPlate;
    void sourceFrame.offsetWidth;
    delete sourceFrame.dataset.resetting;
    requestAnimationFrame(() => {
      setPlateOpacity(oldPlate, 0);
      setPlateScale(targetPlate, 1);
      updateDiagnostics();
    });
    after(ZOOM_MS, settleTransition);
    return getState();
  }

  function applyIndex(index, { atomic = false } = {}) {
    const next = Math.max(0, Math.min(STATES.length - 1, Math.round(index)));
    if (next !== ENCOUNTER_INDEX) hideEncounterVisualsImmediately();
    if (atomic || Math.abs(next - currentIndex) > 1) return applyAtomic(next);
    if (next === currentIndex || transitionActive) return getState();
    const previous = currentIndex;
    const boundary = boundaryBetween(previous, next);
    if (boundary) {
      if (boundary.order === "scope-blink") {
        return next > previous
          ? beginForwardScopeBlink(previous, next, boundary)
          : beginReverseScopeBlink(previous, next, boundary);
      }
      if (boundary.order === "bulkhead") return beginBulkheadSwitch(previous, next, boundary);
      if (boundary.order === "stage-step") return beginStageStep(previous, next, boundary);
      if (boundary.order === "zoom-then-fade") {
        return next > previous
          ? beginForwardZoomThenFade(previous, next, boundary)
          : beginReverseFadeThenZoom(previous, next, boundary);
      }
      return next > previous
        ? beginForwardFadeThenZoom(previous, next, boundary)
        : beginReverseZoomThenFade(previous, next, boundary);
    }
    const state = STATES[next];
    if (state.owner !== renderOwner) return applyAtomic(next);
    currentIndex = next;
    transitionActive = true;
    transitionDirection = Math.sign(next - previous);
    handoffPhase = "zoom";
    setPlateFocal(activePlate, state.focal || FOCAL);
    setPlateScale(activePlate, state.renderScale);
    updateDiagnostics();
    after(ZOOM_MS, settleTransition);
    return getState();
  }

  function step(direction) {
    if (transitionActive || assetPreparing) return getState();
    if (direction > 0 && currentIndex === ENCOUNTER_INDEX && !grandmaEncounter.getState().pathUnlocked) {
      grandmaEncounter.open();
      return getState();
    }
    if (direction > 0 && currentIndex === CLEARED_INDEX) {
      if (!spaceArcStarted) {
        spaceArc.begin({ grandmaRecruited: grandmaEncounter.getState().grandmaRecruited });
        spaceArcStarted = true;
      }
      return spaceArc.forward();
    }
    if (currentIndex > CLEARED_INDEX) return direction > 0 ? spaceArc.forward() : spaceArc.back();
    return requestIndex(currentIndex + Math.sign(direction));
  }

  function reset() {
    assetRequestToken += 1;
    assetPreparing = false;
    spaceArcStarted = false;
    hotspots.reset();
    worldItems.reset();
    spaceArc.begin({ grandmaRecruited: false, reset: true });
    grandmaEncounter.reset();
    return applyIndex(0, { atomic: true });
  }

  function setPose(value) {
    if (typeof value === "string" && NODE_IDS.includes(value)) {
      const index = NODE_IDS.indexOf(value);
      if (index <= CLEARED_INDEX) {
        const guarded = index === CLEARED_INDEX && !grandmaEncounter.getState().pathUnlocked ? ENCOUNTER_INDEX : index;
        return requestIndex(guarded, { atomic: true });
      }
      if (!grandmaEncounter.getState().pathUnlocked) return getState();
      if (!spaceArcStarted) {
        spaceArc.begin({ grandmaRecruited: grandmaEncounter.getState().grandmaRecruited });
        spaceArcStarted = true;
      }
      const routed = spaceArc.requestRouteIndex(index);
      if (routed.routeIndex !== index) return getState();
      return requestIndex(index, { atomic: true });
    }
    if (typeof value === "string" && /^z(?:00[0-9]|01[01])$/.test(value)) {
      const index = Number(value.slice(1));
      const guarded = index === CLEARED_INDEX && !grandmaEncounter.getState().pathUnlocked ? ENCOUNTER_INDEX : index;
      return requestIndex(guarded, { atomic: true });
    }
    const z = typeof value === "number" ? value : Number(value?.z);
    if (!Number.isInteger(z) || z > 0 || z < -11) return getState();
    const index = z === -11 && !grandmaEncounter.getState().pathUnlocked ? ENCOUNTER_INDEX : -z;
    return requestIndex(index, { atomic: true });
  }

  function getState() {
    const state = STATES[currentIndex];
    const visibleOwners = Object.entries(plateState)
      .filter(([, value]) => value.opacity > 0)
      .map(([name, value]) => ({ plate: name, owner: value.owner, opacity: value.opacity, scale: value.scale }));
    const activeAsset = visibleOwners.length === 1
      ? assets?.[visibleOwners[0].owner]?.path || null
      : visibleOwners.map(({ owner }) => assets?.[owner]?.path).filter(Boolean);
    return freeze({
      ready,
      runtimeVersion: RUNTIME_VERSION,
      roomFlowPlan: GRANDMA_ROOM_FLOW_PLAN,
      cacheVersion: graph?.cache?.version || RUNTIME_VERSION,
      node: state.id,
      index: currentIndex,
      scale: state.effectiveScale,
      renderScale: state.renderScale,
      renderOwner,
      handoffPhase,
      focal: { ...FOCAL, normalized: [FOCAL.x / SOURCE_SIZE.width, FOCAL.y / SOURCE_SIZE.height] },
      source: {
        path: graph?.source?.path || null,
        sha256: SOURCE_SHA256,
        width: SOURCE_SIZE.width,
        height: SOURCE_SIZE.height,
        exactReturn: currentIndex === 0 && renderOwner === "exact" && !transitionActive
      },
      anchors: {
        detail: { path: graph?.detailAnchor?.path || null, sha256: DETAIL_SHA256, nativeEffectiveScale: 1.728 },
        refined: Object.fromEntries(Object.entries(graph?.refinedAnchors || {}).map(([node, record]) => [node, {
          path: record.path,
          sha256: record.sha256,
          nativeEffectiveScale: record.nativeEffectiveScale
        }]))
      },
      returns: {
        source: currentIndex === 0 && renderOwner === "exact" && !transitionActive,
        z005: currentIndex === 5 && renderOwner === "detail" && !transitionActive,
        refinedEndpoint: currentIndex >= 6 && renderOwner === state.owner && !transitionActive
      },
      transition: {
        active: transitionActive,
        direction: transitionDirection,
        durationMs: activeBoundary?.order === "scope-blink"
          ? BLINK_PUSH_MS + BLINK_CLOSE_MS + BLINK_OPEN_MS
          : activeBoundary ? ZOOM_MS + DETAIL_FADE_MS : ZOOM_MS,
        zoomMs: ZOOM_MS,
        detailFadeMs: DETAIL_FADE_MS,
        easing: "smoothstep",
        detailDeltaCrossfade: handoffPhase.includes("fade"),
        geometryCrossfade: false,
        sameGeometryHandoff: handoffPhase.includes("fade"),
        opaqueScopeBlink: activeBoundary?.order === "scope-blink",
        opaqueBulkheadSwitch: activeBoundary?.order === "bulkhead",
        singleOwnerStageStep: activeBoundary?.order === "stage-step",
        boundary: activeBoundary?.id || null
      },
      graph: {
        nodeCount: STATES.length,
        edgeCount: STATES.length - 1,
        nodes: NODE_IDS,
        activeEdge: transitionActive && transitionDirection
          ? `${NODE_IDS[Math.min(currentIndex, currentIndex - transitionDirection)]}-${NODE_IDS[Math.max(currentIndex, currentIndex - transitionDirection)]}`
          : null,
        residentAssets: assets ? Object.values(assets).map(({ path }) => path) : [],
        residentCount: assets ? Object.keys(assets).length : 0,
        residentBudget: 4,
        residentHardLimit: 4,
        imagePlateCount: 2,
        visibleOwners,
        activeAsset,
        legacyAssetFetches: 0,
        rawAssetResident: false,
        pendingAssets: assetPreparing ? 1 : 0
      },
      telemetry: { endpointExact: !transitionActive && !assetPreparing, consoleFailure },
      encounter: grandmaEncounter.getState(),
      spaceArc: spaceArc.getState(),
      hotspots: hotspots.getState()
    });
  }

  function onKey(event) {
    if (hotspots.handleKeyDown(event)) return;
    if (spaceArc.isBossInspectionMode()) {
      if (hotspots.isOpen()) {
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setBossInspectionPan(bossInspectionPanIndex + (event.key === "ArrowLeft" ? -1 : 1));
        return;
      }
      if (["w", "W", "s", "S", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        return;
      }
    }
    if (event.code === "KeyR") {
      event.preventDefault();
      reset();
      return;
    }
    if (spaceArc.isDialogOpen() && spaceArc.handleKeyDown(event)) return;
    const storyState = grandmaEncounter.getState();
    if (!encounterDialog.hidden) {
      if (event.code === "Tab") {
        const focusable = [...encounterActions.querySelectorAll("button:not([disabled])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        if (storyState.screen === "action") retreatFromEncounter();
        else grandmaEncounter.back();
        return;
      }
      if ((event.code === "KeyS" || event.code === "ArrowDown") && storyState.screen === "action") {
        event.preventDefault();
        retreatFromEncounter();
        return;
      }
      if ((event.code === "KeyW" || event.code === "ArrowUp") && storyState.pathUnlocked) {
        event.preventDefault();
        forwardFromEncounter();
        return;
      }
      if (["KeyW", "ArrowUp", "KeyS", "ArrowDown"].includes(event.code)) event.preventDefault();
      return;
    }
    const actions = {
      KeyW: () => step(1),
      ArrowUp: () => step(1),
      KeyS: () => step(-1),
      ArrowDown: () => step(-1)
    };
    if (actions[event.code]) {
      event.preventDefault();
      actions[event.code]();
    }
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.("#encounter-dialog, #space-dialog, #hotspot-layer, #hotspot-inspector")) return;
    pointerStart = { x: event.clientX, y: event.clientY };
    viewport.setPointerCapture?.(event.pointerId);
  });
  viewport.addEventListener("pointerdown", (event) => {
    if (!spaceArc.isBossInspectionMode() || hotspots.isOpen()) return;
    bossInspectionPointerStart = { x: event.clientX, y: event.clientY };
  }, { capture: true });
  viewport.addEventListener("pointerup", (event) => {
    if (!bossInspectionPointerStart || !spaceArc.isBossInspectionMode() || hotspots.isOpen()) {
      bossInspectionPointerStart = null;
      return;
    }
    const dx = event.clientX - bossInspectionPointerStart.x;
    const dy = event.clientY - bossInspectionPointerStart.y;
    bossInspectionPointerStart = null;
    if (Math.abs(dx) < 30 || Math.abs(dx) <= Math.abs(dy)) return;
    event.preventDefault();
    event.stopPropagation();
    pointerStart = null;
    setBossInspectionPan(bossInspectionPanIndex + (dx < 0 ? 1 : -1));
  }, { capture: true });
  viewport.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (spaceArc.isBossInspectionMode()) {
      if (Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy)) setBossInspectionPan(bossInspectionPanIndex + (dx < 0 ? 1 : -1));
      return;
    }
    if (!encounterDialog.hidden || !spaceDialog.hidden || hotspots.isOpen()) return;
    if (Math.abs(dy) >= 30 && Math.abs(dy) > Math.abs(dx)) step(dy < 0 ? 1 : -1);
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", updateCoverScale, { passive: true });

  async function preload(path) {
    const url = new URL(path, location.href).href;
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth !== SOURCE_SIZE.width || image.naturalHeight !== SOURCE_SIZE.height) {
      throw new Error(`asset dimensions mismatch: ${path}`);
    }
    return { path, url, image };
  }

  async function preloadOptionalCharacter(path, element) {
    if (!path) return null;
    try {
      const url = new URL(path, location.href).href;
      const image = new Image();
      image.src = url;
      await image.decode();
      element.src = url;
      return { path, url, image, width: image.naturalWidth, height: image.naturalHeight };
    } catch {
      element.removeAttribute("src");
      return null;
    }
  }

  function configureGrandmaPlacement(placement = {}) {
    const values = {
      x: Number(placement.x ?? 620),
      y: Number(placement.y ?? 930),
      width: Number(placement.width ?? 300),
      height: Number(placement.height ?? 420)
    };
    for (const [name, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new Error(`grandma placement ${name} is invalid`);
      document.documentElement.style.setProperty(`--grandma-source-${name}`, `${value}px`);
    }
    return freeze(values);
  }

  function configureEarwaxPlacement(placement = {}) {
    const values = {
      x: Number(placement.x ?? 800),
      y: Number(placement.y ?? 650),
      width: Number(placement.width ?? 500)
    };
    for (const [name, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new Error(`earwax placement ${name} is invalid`);
      document.documentElement.style.setProperty(`--earwax-source-${name}`, `${value}px`);
    }
    return freeze(values);
  }

  async function boot() {
    updateCoverScale();
    const response = await fetch(GRAPH_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`zoom graph HTTP ${response.status}`);
    graph = await response.json();
    const expectedScales = STATES.map(({ effectiveScale }) => effectiveScale);
    if (graph.version !== RUNTIME_VERSION || JSON.stringify(graph.scales) !== JSON.stringify(expectedScales)) {
      throw new Error("zoom graph contract mismatch");
    }
    if (graph.roomFlow?.active !== true || graph.encounterNode !== "z010" || graph.terminalNode !== "z011") {
      throw new Error("room flow contract mismatch");
    }
    assetRecords = {
      exact: graph.source,
      detail: graph.detailAnchor,
      ...graph.refinedAnchors,
      room: graph.roomInterior,
      ...graph.spaceArc.backgroundOwners
    };
    configureGrandmaPlacement(graph.encounter?.placement);
    configureEarwaxPlacement(graph.encounter?.victoryPlacement);
    const grandmaPromise = preloadOptionalCharacter(graph.encounter?.asset?.path, grandmaSprite);
    const earwaxPromise = preloadOptionalCharacter(graph.encounter?.victoryAsset?.path, earwaxReveal);
    assets = Object.create(null);
    assets.exact = await preload(graph.source.path);
    grandmaAsset = await grandmaPromise;
    earwaxAsset = await earwaxPromise;
    configurePlate("a", { owner: "exact", scale: 1, opacity: 1, zIndex: 2, focal: FOCAL });
    configurePlate("b", { owner: "exact", scale: 1, opacity: 0, zIndex: 1, focal: FOCAL });
    await Promise.all([plates.a.decode(), plates.b.decode()]);
    activePlate = "a";
    ready = true;
    spaceArc.begin({ grandmaRecruited: false });
    reset();
  }

  const publicGrandmaEncounter = freeze({
    getState: grandmaEncounter.getState,
    takeCompanionTurn: grandmaEncounter.takeCompanionTurn
  });
  const api = freeze({
    getState,
    setPose,
    reset,
    stepForward: () => step(1),
    stepBack: () => step(-1),
    roomFlowPlan: GRANDMA_ROOM_FLOW_PLAN,
    grandmaEncounter: publicGrandmaEncounter,
    takeCompanionTurn: grandmaEncounter.takeCompanionTurn,
    spaceArc: freeze({
      getState: spaceArc.getState,
      getBattleState: spaceArc.getBattleState,
      getTranscript: spaceArc.getTranscript,
      getTranscriptHash: spaceArc.getTranscriptHash,
      serialize: spaceArc.serialize,
      forward: spaceArc.forward,
      advance: spaceArc.forward,
      back: spaceArc.back,
      canEnterRouteIndex: spaceArc.canEnterRouteIndex,
      requestRouteIndex: spaceArc.requestRouteIndex,
      chooseAction: spaceArc.chooseAction,
      discoverItem: spaceArc.discoverItem,
      recruit: spaceArc.recruit,
      retry: spaceArc.retry,
      returnToAction: spaceArc.returnToAction,
      takeCompanionTurn: spaceArc.takeCompanionTurn,
      bossAction: spaceArc.bossAction,
      beginBossInspection: spaceArc.beginBossInspection,
      isBossInspectionMode: spaceArc.isBossInspectionMode,
      getBossInspectionPan: () => Object.freeze({ index: bossInspectionPanIndex, name: BOSS_INSPECTION_PAN_NAMES[bossInspectionPanIndex] }),
      setBossInspectionPan
    }),
    hotspots: freeze({
      getState: hotspots.getState,
      inspect: hotspots.inspect,
      close: hotspots.close
    })
  });
  Object.defineProperty(globalThis, "MicroCell", {
    value: api,
    enumerable: false,
    writable: false,
    configurable: false
  });
  Object.defineProperty(globalThis, "grandmaEncounter", {
    value: publicGrandmaEncounter,
    enumerable: false,
    writable: false,
    configurable: false
  });
  viewport.dataset.microCellApi = "ready";
  updateDiagnostics();
  boot().catch((error) => {
    consoleFailure = String(error?.message || error);
    ready = false;
    updateDiagnostics();
  });
})();
