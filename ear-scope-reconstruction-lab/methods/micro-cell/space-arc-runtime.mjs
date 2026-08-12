import { SPACE_ARC_ASSET_MANIFEST, SPACE_ARC_ROUTE } from "./space-arc-state.mjs";
import { BATTLE_V2_ACTIONS, BATTLE_V2_BOSS, BATTLE_V2_ENCOUNTERS, BATTLE_V2_ITEMS, selectBattleV2 } from "./battle-system-v2.mjs";
import { createSpaceArcV2Adapter } from "./space-arc-v2-adapter.mjs";
import { NARRATIVE_AMBIENT_EVENTS } from "./narrative-content.mjs";

const CHARACTER_PLACEMENTS = Object.freeze({
  clown: Object.freeze({ x: 768, y: 910, width: 520, height: 520 }),
  flower_seller: Object.freeze({ x: 768, y: 945, width: 330, height: 640 }),
  booklion: Object.freeze({ x: 768, y: 880, width: 520, height: 520 }),
  construction_worker: Object.freeze({ x: 768, y: 950, width: 330, height: 650 }),
  smiling_priest: Object.freeze({ x: 768, y: 945, width: 300, height: 640 }),
  ninja: Object.freeze({ x: 768, y: 945, width: 340, height: 640 }),
  beggar: Object.freeze({ x: 768, y: 945, width: 320, height: 640 }),
  smiling_sun: Object.freeze({ x: 768, y: 790, width: 520, height: 470 })
});

const assetById = new Map(SPACE_ARC_ASSET_MANIFEST.characters.map((asset) => [asset.id, asset]));
const itemByHotspotId = new Map(Object.entries(BATTLE_V2_ITEMS).filter(([, item]) => item.sourceHotspotId).map(([itemId, item]) => [item.sourceHotspotId, itemId]));

function button(label, action, { primary = false, value = null } = {}) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (primary) element.dataset.primary = "true";
  if (value) element.dataset.value = value;
  element.addEventListener("click", action);
  return element;
}

export function createSpaceArcRuntime({
  scene, viewport, dialog, heading, status, message, resultLive, actions,
  characterImage, characterVideo, brainOverlay,
  brainHud, brainProgress, brainValue, inventoryHud, itemToast, ambientToast,
  onNavigate, onResetRequested, onDiagnostics = () => {}
}) {
  let api = null;
  let currentNodeId = "z011";
  let settled = true;
  let focusBeforeDialog = null;
  let dialogContextKey = "";
  let mediaResetTimer = 0;
  let toastTimer = 0;
  let bossInspectionMode = false;
  let reactionTimer = 0;
  let ambientTimer = 0;
  let renderedAmbientId = null;
  let itemToastActive = false;

  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));

  function createState(grandmaRecruited) {
    api = createSpaceArcV2Adapter({
      grandmaRecruited,
      onChange: () => { render(); onDiagnostics(); },
      onEvent: (event, state) => emit(event.type, { ...event, state }),
      runEffect: (effect, state) => {
        if (effect.type === "announce") emit("micro-cell:battle-v2-announcement", { effect, state });
      }
    });
    return api.getState();
  }

  function renderHud(battle) {
    const value = battle.brainIntegrity;
    brainHud.dataset.danger = String(value <= 35);
    brainProgress.value = value;
    brainProgress.setAttribute("aria-valuenow", String(value));
    brainProgress.setAttribute("aria-valuetext", `脳残存率 ${value}%`);
    brainValue.textContent = `${value}%`;
    const names = selectBattleV2.inventoryNames(battle);
    const children = [Object.assign(document.createElement("span"), { className: "inventory-count", textContent: `所持品 ${names.length}` })];
    const visibleInventory = battle.inventory.slice(0, 4);
    for (const itemId of visibleInventory) {
      const item = BATTLE_V2_ITEMS[itemId];
      if (!item?.asset?.thumbnail?.approved) continue;
      const image = document.createElement("img");
      image.className = "inventory-thumb";
      image.src = item.asset.thumbnail.path;
      image.alt = item.name;
      image.width = 24;
      image.height = 24;
      children.push(image);
    }
    const hiddenCount = battle.inventory.length - visibleInventory.length;
    if (hiddenCount > 0) {
      const more = document.createElement("span");
      more.className = "inventory-more";
      more.textContent = `+${hiddenCount}`;
      more.setAttribute("aria-hidden", "true");
      children.push(more);
    }
    inventoryHud.replaceChildren(...children);
    inventoryHud.setAttribute("aria-label", names.length ? `所持品${names.length}個、${names.join("、")}` : "所持品なし");
  }

  function announceItem(itemId) {
    const item = BATTLE_V2_ITEMS[itemId];
    if (!item) return;
    clearTimeout(toastTimer);
    clearTimeout(ambientTimer);
    itemToastActive = true;
    renderedAmbientId = null;
    ambientToast.hidden = true;
    itemToast.textContent = `${item.name}を手に入れた`;
    itemToast.hidden = false;
    toastTimer = window.setTimeout(() => {
      itemToastActive = false;
      itemToast.hidden = true;
      renderAmbient(api.getBattleState());
    }, 2200);
  }

  function renderAmbient(battle) {
    if (itemToastActive) {
      clearTimeout(ambientTimer);
      renderedAmbientId = null;
      ambientToast.hidden = true;
      return;
    }
    const ambient = selectBattleV2.ambientCurrent(battle);
    if (!ambient) {
      clearTimeout(ambientTimer);
      renderedAmbientId = null;
      ambientToast.textContent = "";
      ambientToast.hidden = true;
      return;
    }
    const ambientId = battle.ambientQueue[0];
    ambientToast.textContent = ambient.text;
    ambientToast.hidden = false;
    if (renderedAmbientId === ambientId) return;
    clearTimeout(ambientTimer);
    renderedAmbientId = ambientId;
    ambientTimer = window.setTimeout(() => {
      api.dismissAmbient();
      render();
    }, ambient.durationMs);
  }

  function onHotspotOpened(event) {
    const hotspotId = event.detail?.id;
    const itemId = itemByHotspotId.get(hotspotId);
    if (!itemId || api.getBattleState().inventory.includes(itemId)) return;
    api.discoverItem(itemId, hotspotId);
    event.detail.item = Object.freeze({ id: itemId, name: BATTLE_V2_ITEMS[itemId].name, acquired: true });
    announceItem(itemId);
  }

  window.addEventListener("micro-cell:hotspot-opened", onHotspotOpened);

  function hideCharacter() {
    clearTimeout(mediaResetTimer);
    characterImage.hidden = true;
    characterImage.removeAttribute("src");
    characterVideo.pause();
    try { characterVideo.currentTime = 0; } catch {}
    characterVideo.hidden = true;
    characterVideo.removeAttribute("src");
    characterVideo.removeAttribute("poster");
    mediaResetTimer = window.setTimeout(() => {
      if (characterVideo.hasAttribute("src")) return;
      characterVideo.load();
      try { characterVideo.currentTime = 0; } catch {}
    }, 240);
  }

  function configurePlacement(id) {
    const placement = CHARACTER_PLACEMENTS[id];
    if (!placement) return;
    for (const [key, value] of Object.entries(placement)) document.documentElement.style.setProperty(`--space-character-${key}`, `${value}px`);
    viewport.dataset.spaceCharacter = id;
  }

  function showCharacter(id, state) {
    clearTimeout(mediaResetTimer);
    const asset = assetById.get(id);
    const resolved = Boolean(state.encounterStatus[id]?.resolved);
    const reacting = state.v2.active?.phase === "reaction";
    if (!asset || resolved && !reacting || !settled || currentNodeId !== state.nodeId) return hideCharacter();
    configurePlacement(id);
    if (asset.kind === "video") {
      characterImage.hidden = true;
      characterImage.removeAttribute("src");
      const expected = new URL(asset.video.path, document.baseURI).href;
      if (characterVideo.src !== expected) characterVideo.src = asset.video.path;
      characterVideo.poster = asset.poster.path;
      characterVideo.muted = true;
      characterVideo.loop = true;
      characterVideo.playsInline = true;
      characterVideo.autoplay = true;
      characterVideo.hidden = false;
      characterVideo.play().catch(() => {
        characterVideo.hidden = true;
        characterImage.src = asset.poster.path;
        characterImage.hidden = false;
      });
      return;
    }
    characterVideo.pause();
    characterVideo.hidden = true;
    const expected = new URL(asset.image.path, document.baseURI).href;
    if (characterImage.src !== expected) characterImage.src = asset.image.path;
    characterImage.hidden = false;
  }

  function closeDialog() {
    const wasOpen = !dialog.hidden;
    dialog.hidden = true;
    actions.replaceChildren();
    const inspectorOpen = viewport.dataset.hotspotInspector === "open";
    if (!inspectorOpen) {
      scene.inert = false;
      scene.removeAttribute("aria-hidden");
    }
    if (wasOpen) (focusBeforeDialog?.focus ? focusBeforeDialog : viewport).focus({ preventScroll: true });
    focusBeforeDialog = null;
    dialogContextKey = "";
  }

  function openDialog(label) {
    if (dialog.hidden) focusBeforeDialog = document.activeElement;
    dialog.hidden = false;
    dialog.setAttribute("aria-label", label);
    actions.setAttribute("aria-label", label);
    scene.inert = true;
    scene.setAttribute("aria-hidden", "true");
  }

  function focusContext(key) {
    const changed = dialogContextKey !== key;
    dialogContextKey = key;
    if (changed) dialog.scrollTop = 0;
    requestAnimationFrame(() => {
      if (dialog.hidden || dialogContextKey !== key) return;
      if (changed) dialog.scrollTop = 0;
      if (changed || !dialog.contains(document.activeElement)) heading.focus({ preventScroll: true });
    });
  }

  function routeResult(next, beforeIndex) {
    if (next.routeIndex !== beforeIndex) onNavigate(next.routeIndex);
    else render();
    return next;
  }

  function forward() {
    const before = api.getState().routeIndex;
    return routeResult(api.forward(), before);
  }

  function back() {
    const before = api.getState().routeIndex;
    return routeResult(api.back(), before);
  }

  function act(actionId) {
    const next = actionId === "recruit" ? api.recruit() : api.act(actionId);
    render();
    return next;
  }

  function scheduleReaction(battle) {
    clearTimeout(reactionTimer);
    if (battle.active?.phase !== "reaction" || !battle.reaction) return;
    const expectedStep = battle.reaction.step;
    reactionTimer = window.setTimeout(() => {
      const current = api.getBattleState();
      if (current.active?.phase !== "reaction" || current.reaction?.step !== expectedStep) return;
      api.acknowledgeReaction();
      render();
    }, battle.reaction.holdMs);
  }

  function visibleResolvedDrops(state) {
    const active = state.v2.active;
    if (active?.mode !== "encounter" || active.phase !== "resolved") return [];
    return selectBattleV2.worldPlacements(state.v2, { nodeId: state.nodeId }).filter((placement) => (
      placement.unlock?.type === "encounter-resolved" && placement.unlock.encounterId === active.id
    ));
  }

  function resolvedDropButton(placement) {
    const item = BATTLE_V2_ITEMS[placement.itemId];
    const control = button(`${item.name}を拾う`, () => {
      api.discoverItem(placement.itemId, null, placement.id);
      announceItem(placement.itemId);
      render();
    }, { value: `pickup:${placement.id}` });
    const thumbnail = item.asset?.thumbnail;
    if (thumbnail?.approved) {
      const image = document.createElement("img");
      image.className = "inventory-thumb";
      image.src = thumbnail.path;
      image.alt = "";
      image.width = 24;
      image.height = 24;
      control.prepend(image);
    }
    return control;
  }

  function availableButtons(state) {
    const battle = state.v2;
    const active = battle.active;
    if (!active) return [];
    if (active.phase === "resolved") return [
      ...visibleResolvedDrops(state).map(resolvedDropButton),
      button("先へ進む", forward)
    ];
    if (active.phase === "reaction") return [];
    if (active.phase === "game-over") return [button("チェックポイントから再開", () => { api.retry(); render(); }, { primary: true }), button("最初から", onResetRequested)];
    if (active.phase === "victory") return [button("周囲を調べる", beginBossInspection, { primary: true }), button("最初から", onResetRequested)];
    const ids = selectBattleV2.availableActions(battle);
    const controls = ids.map((actionId) => button(BATTLE_V2_ACTIONS[actionId]?.label || actionId, () => act(actionId), { value: actionId }));
    if (active.phase === "choice") controls.push(button("話す", () => { api.talk(); render(); }));
    if (active.mode === "encounter" && active.phase === "choice") controls.push(button("立ち去る", back));
    return controls;
  }

  function renderActive(state) {
    const battle = state.v2;
    const active = battle.active;
    const boss = active?.mode === "boss";
    if (!settled || currentNodeId !== state.nodeId || !active) return closeDialog();
    if (boss && state.bossDefeated && bossInspectionMode) return closeDialog();
    const title = battle.gameOver ? "ゲームオーバー" : battle.victory && active.phase !== "reaction" ? "脳を守って制圧" : boss ? "飽食幼虫" : BATTLE_V2_ENCOUNTERS[active.id].name;
    openDialog(title);
    heading.textContent = title;
    if (active.phase === "talk" && battle.talk) {
      status.textContent = "会話は戦闘を解決しない";
      resultLive.textContent = "";
      if (battle.talk.screen === "menu") {
        const insight = selectBattleV2.talkInsight(battle);
        message.textContent = insight ? `気づき：${insight}` : "何を聞きますか。";
        const talkControls = selectBattleV2.talkBranches(battle).map((branch) => button(`${battle.talk.visitedBranchIds.includes(branch.id) ? "既読・" : ""}${branch.label}`, () => { api.selectTalkBranch(branch.id); render(); }));
        talkControls.push(button("話を終える", () => { api.closeTalk(); render(); }));
        actions.replaceChildren(...talkControls);
      } else {
        const talkLine = selectBattleV2.talkLine(battle);
        message.textContent = `${talkLine?.speaker === "player" ? "あなた" : BATTLE_V2_ENCOUNTERS[active.id]?.name || "飽食幼虫"}：${talkLine?.text || ""}`;
        actions.replaceChildren(button("次へ", () => { api.advanceTalk(); render(); }));
      }
      focusContext([state.nodeId, active.id, active.phase, battle.talk.screen, battle.talk.branchId, battle.talk.lineIndex].join(":"));
      return;
    }
    const risk = active.mode === "boss" && battle.boss.segmentsRemaining
      ? BATTLE_V2_BOSS.phases[BATTLE_V2_BOSS.segments - battle.boss.segmentsRemaining].wrongDamage
      : active.mode === "encounter" ? BATTLE_V2_ENCOUNTERS[active.id].wrongDamage : 0;
    status.textContent = active.phase === "choice" && risk ? `方法を誤ると最大 脳 -${risk}` : selectBattleV2.statusText(battle);
    const isTerminalCopy = ["resolved", "game-over", "victory"].includes(active.phase);
    message.textContent = isTerminalCopy ? "" : selectBattleV2.cue(battle);
    resultLive.textContent = isTerminalCopy ? active.message : "";
    actions.replaceChildren(...availableButtons(state));
    scheduleReaction(battle);
    focusContext([state.nodeId, active.id, active.phase, battle.brainIntegrity, battle.boss.segmentsRemaining].join(":"));
  }

  function render() {
    const state = api.getState();
    const battle = state.v2;
    renderHud(battle);
    renderAmbient(battle);
    viewport.dataset.spaceNode = state.nodeId;
    viewport.dataset.spaceScreen = state.screen;
    viewport.dataset.spaceEncounter = state.activeEncounterId || "none";
    viewport.dataset.encounterResolved = JSON.stringify(state.encounterResolved);
    viewport.dataset.spaceGameOver = state.gameOver || "none";
    viewport.dataset.spaceCompanions = state.companions.join(",");
    viewport.dataset.battleV2 = "simple-v1";
    viewport.dataset.battlePhase = battle.active?.phase || "hidden";
    viewport.dataset.battleTranscriptHash = state.transcriptHash;
    viewport.dataset.brainRemaining = String(state.brainRemainingPercent);
    viewport.dataset.inventory = battle.inventory.join(",");
    viewport.dataset.bossDefeated = String(state.bossDefeated);
    viewport.dataset.spaceMediaResident = characterVideo.hasAttribute("src") ? "1" : "0";
    brainOverlay.hidden = currentNodeId !== "b000" || !settled;
    brainOverlay.textContent = `脳残存率 ${state.brainRemainingPercent}%`;
    if (state.activeEncounterId) showCharacter(state.activeEncounterId, state);
    else hideCharacter();
    if (battle.active) return renderActive(state);
    clearTimeout(reactionTimer);
    closeDialog();
  }

  function begin({ grandmaRecruited = false, reset = false } = {}) {
    if (reset) {
      clearTimeout(toastTimer);
      clearTimeout(ambientTimer);
      itemToastActive = false;
      itemToast.textContent = "";
      itemToast.hidden = true;
      ambientToast.textContent = "";
      ambientToast.hidden = true;
      renderedAmbientId = null;
    }
    if (reset || !api) createState(grandmaRecruited);
    else api.setGrandmaObserver(grandmaRecruited);
    currentNodeId = "z011";
    settled = true;
    bossInspectionMode = false;
    viewport.dataset.bossInspection = "false";
    brainOverlay.hidden = true;
    hideCharacter();
    closeDialog();
    render();
    return api.getState();
  }

  function syncRoute(nodeId, isSettled) {
    if (nodeId !== "b000") bossInspectionMode = false;
    currentNodeId = nodeId;
    settled = Boolean(isSettled);
    if (settled) {
      const ambient = Object.entries(NARRATIVE_AMBIENT_EVENTS).find(([, event]) => event.nodeId === nodeId);
      if (ambient) api.triggerAmbient(ambient[0]);
    }
    render();
  }

  function suppressAmbient() {
    clearTimeout(ambientTimer);
    renderedAmbientId = null;
    while (api.getBattleState().ambientQueue.length) api.dismissAmbient();
    ambientToast.textContent = "";
    ambientToast.hidden = true;
    render();
  }

  function beginBossInspection() {
    const state = api.getState();
    if (!state.bossDefeated || currentNodeId !== "b000" || !settled) return false;
    bossInspectionMode = true;
    viewport.dataset.bossInspection = "true";
    closeDialog();
    onDiagnostics();
    emit("micro-cell:boss-inspection-opened", { nodeId: currentNodeId, brainRemainingPercent: state.brainRemainingPercent });
    return true;
  }

  function handleKeyDown(event) {
    if (dialog.hidden) return false;
    const active = api.getBattleState().active;
    if (["w", "W", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (active?.phase === "resolved") forward();
      return true;
    }
    if (event.key === "Escape" && active?.phase === "talk") {
      event.preventDefault();
      api.closeTalk();
      render();
      return true;
    }
    if (["s", "S", "ArrowDown", "Escape"].includes(event.key)) {
      event.preventDefault();
      if (active?.mode === "encounter" && active.phase === "choice") back();
      return true;
    }
    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("button:not([disabled])")];
      if (!focusable.length) return true;
      const direction = event.shiftKey ? -1 : 1;
      const current = focusable.indexOf(document.activeElement);
      event.preventDefault();
      focusable[current < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : (current + direction + focusable.length) % focusable.length].focus();
      return true;
    }
    return false;
  }

  characterVideo.addEventListener("error", () => {
    const id = api.getState().activeEncounterId;
    const asset = assetById.get(id);
    if (!asset?.poster) return;
    characterVideo.hidden = true;
    characterImage.src = asset.poster.path;
    characterImage.hidden = false;
  });

  createState(false);

  return Object.freeze({
    begin, getState: () => api.getState(), getBattleState: () => api.getBattleState(),
    getTranscript: () => api.getTranscript(), getTranscriptHash: () => api.getTranscriptHash(), serialize: () => api.serialize(),
    forward, back, syncRoute, suppressAmbient, render, handleKeyDown,
    chooseAction: (actionId) => actionId === "leave" ? back() : actionId === "talk" ? (api.talk(), render(), api.getState()) : act(actionId),
    discoverItem: (itemId, sourceHotspotId = null, placementId = null) => { const before = api.getBattleState().inventory.includes(itemId); const next = api.discoverItem(itemId, sourceHotspotId, placementId); if (!before && api.getBattleState().inventory.includes(itemId)) announceItem(itemId); render(); return next; },
    getWorldPlacements: (context) => selectBattleV2.worldPlacements(api.getBattleState(), context),
    recruit: () => act("recruit"),
    canEnterRouteIndex: (index) => api.canEnterRouteIndex(index),
    requestRouteIndex: (index) => { const before = api.getState().routeIndex; return routeResult(api.requestRouteIndex(index), before); },
    returnToAction: render,
    takeCompanionTurn: () => api.getBattleState().grandmaObserver ? { text: "おばあさんは静かに見守っている。" } : null,
    bossAction: (actionId) => act(actionId), retry: () => { const next = api.retry(); render(); return next; },
    beginBossInspection, isBossInspectionMode: () => bossInspectionMode, isDialogOpen: () => !dialog.hidden
  });
}
