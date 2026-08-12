import {
  NARRATIVE_AMBIENT_EVENTS,
  NARRATIVE_TALKS,
  NARRATIVE_WORLD_ITEMS,
  NARRATIVE_WORLD_PLACEMENTS,
  narrativeReactionFor
} from "./narrative-content.mjs";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

const clone = (value) => structuredClone(value);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const BATTLE_V2_ACTIONS = freeze({
  ear_pick_strike: { label: "耳かきで殴打" },
  ear_pick_beam: { label: "耳かきビーム" },
  glass_jar: { label: "透明びんをかぶせる", itemId: "glass_jar" },
  amber_bottle: { label: "琥珀の小瓶を使う", itemId: "amber_bottle" },
  brass_clasp: { label: "真鍮留めで固定", itemId: "brass_clasp" },
  lidded_bowl: { label: "蓋つき器を渡す", itemId: "lidded_bowl" },
  wax_thread: { label: "琥珀の糸で束ねる", itemId: "wax_thread" },
  loose_page: { label: "抜け頁を影へ置く", itemId: "loose_page" },
  mirror_light_conduit: { label: "鏡面導光管へ通す", itemId: "mirror_light_conduit" },
  sun_filament: { label: "太陽の細光を通す", itemId: "sun_filament" },
  recruit: { label: "仲間にする" },
  sever: { label: "最後の神経を切る" }
});

export const BATTLE_V2_ITEMS = freeze({
  glass_jar: { ...NARRATIVE_WORLD_ITEMS.glass_jar, sourceHotspotId: null },
  amber_bottle: { ...NARRATIVE_WORLD_ITEMS.amber_bottle, sourceHotspotId: null },
  brass_clasp: { ...NARRATIVE_WORLD_ITEMS.brass_clasp, sourceHotspotId: null },
  lidded_bowl: { ...NARRATIVE_WORLD_ITEMS.lidded_bowl, sourceHotspotId: null },
  wax_thread: { ...NARRATIVE_WORLD_ITEMS.wax_thread, sourceHotspotId: null },
  loose_page: { ...NARRATIVE_WORLD_ITEMS.loose_page, sourceHotspotId: null },
  mirror_light_conduit: { ...NARRATIVE_WORLD_ITEMS.mirror_light_conduit, sourceHotspotId: null },
  sun_filament: { ...NARRATIVE_WORLD_ITEMS.sun_filament, sourceHotspotId: null }
});

const encounter = (definition) => freeze({
  recruitable: true,
  recruitCondition: "always",
  wrongDamage: 8,
  ...definition
});

export const BATTLE_V2_ENCOUNTERS = freeze({
  clown: encounter({
    nodeId: "w001", name: "道化師",
    cue: "腹の口は曇った瓶の光だけを追っている。",
    safeActionId: "glass_jar", wrongDamage: 6,
    recruitCondition: "risky",
    recruitPenalty: 5, actionOrder: ["ear_pick_strike", "glass_jar", "recruit"]
  }),
  flower_seller: encounter({
    nodeId: "w003", name: "花売り",
    cue: "花束の茎が乾き、小瓶を見ている。",
    safeActionId: "amber_bottle", safeRecruits: true, wrongDamage: 7,
    recruitResult: "花売りは琥珀の小瓶を受け取り、花束を抱えてついてきた。", actionOrder: ["recruit", "amber_bottle", "ear_pick_beam"]
  }),
  booklion: encounter({
    nodeId: "s001", name: "本ライオン",
    cue: "敵意より、ついて来たい様子が強い。",
    safeActionId: "recruit", wrongDamage: 8,
    defeatOutcome: "fled",
    recruitResult: "本ライオンは林檎をかじり、頭の本を読んでほしそうについてきた。", actionOrder: ["ear_pick_beam", "recruit", "ear_pick_strike"]
  }),
  construction_worker: encounter({
    nodeId: "s003", name: "工事作業員",
    cue: "柵の蝶番に留め具一個分の穴がある。",
    safeActionId: "brass_clasp", recruitable: false, wrongDamage: 9, actionOrder: ["ear_pick_strike", "brass_clasp", "ear_pick_beam"]
  }),
  smiling_priest: encounter({
    nodeId: "s004", name: "微笑む司祭",
    cue: "白い輪は敵意ではなく、飢えを押さえている。",
    safeActionId: "recruit", wrongDamage: 10,
    recruitResult: "司祭は白い輪を静め、穏やかな笑みのままついてきた。", actionOrder: ["ear_pick_beam", "ear_pick_strike", "recruit"]
  }),
  ninja: encounter({
    nodeId: "s006", name: "忍者",
    cue: "影だけが床に残り、足元まで届いている。",
    safeActionId: "ear_pick_strike", wrongDamage: 11,
    recruitResult: "忍者は影へ沈み、こちらの背後を守るようについてきた。", actionOrder: ["recruit", "loose_page", "ear_pick_strike"], alternateItemActionId: "loose_page"
  }),
  beggar: encounter({
    nodeId: "s008", name: "物乞い",
    cue: "手ではなく、空の器を差し出している。",
    safeActionId: "lidded_bowl", safeRecruits: true, wrongDamage: 12,
    recruitResult: "物乞いは蓋つき器を抱え、満足そうについてきた。", actionOrder: ["ear_pick_strike", "lidded_bowl", "recruit"]
  }),
  smiling_sun: encounter({
    nodeId: "s009", name: "微笑む太陽",
    cue: "光が床際の鏡面導光管へ集まり、反射の道筋を示している。",
    safeActionId: "mirror_light_conduit", safeRecruits: true, wrongDamage: 13,
    recruitResult: "微笑む太陽は鏡面導光管で光を絞り、安全な軌道へ加わった。",
    recruitWarning: "鏡面導光管があれば、ボスへ安全に細光を使える。", actionOrder: ["recruit", "ear_pick_beam", "mirror_light_conduit"]
  })
});

export const BATTLE_V2_BOSS = freeze({
  id: "segmented_glutton_larva", name: "飽食幼虫", segments: 3,
  phases: freeze([
    { id: "shell", cue: "硬い外殻の継ぎ目が見える。打撃で割れそうだ。", safeActionId: "ear_pick_strike", wrongDamage: 12 },
    { id: "nerve", cue: "露出した神経は青白く瞬いている。光線で焼き切れそうだ。", safeActionId: "ear_pick_beam", wrongDamage: 15 },
    { id: "core", cue: "幼虫はスプーンを握る手しか見ていない。耳かきで手を叩けば落としそうだ。", safeActionId: "ear_pick_strike", wrongDamage: 15 }
  ]),
  finalCue: "三つの節が外れ、最後の神経だけが脳塊へ続いている。"
});

const emptyEncounterState = () => Object.fromEntries(Object.keys(BATTLE_V2_ENCOUNTERS).map((id) => [id, {
  spawned: false, resolved: false, outcome: null, recruited: false, damaged: false, suspended: false
}]));

const DROP_BY_ENCOUNTER = freeze({
  booklion: "drop.loose-page",
  construction_worker: "drop.mirror-light-conduit",
  smiling_sun: "drop.sun-filament"
});

const AFTERMATH_BY_ENCOUNTER = freeze({
  clown: "風船だけが借りた声を一度鳴らして静まった。",
  flower_seller: "根は床板の継ぎ目から離れ、花束へ巻き戻った。",
  booklion: "抜け頁が床へ滑り、影を受ける浅い角度で止まった。",
  construction_worker: "柵が立ち、不要になった鏡面導光管が床へ置かれた。",
  smiling_priest: "白い輪の振動が止まり、青い表示盤だけが点いた。",
  ninja: "床の影が輪郭へ戻り、手裏剣の音も止んだ。",
  beggar: "器を抱えた両手が下がり、通路の中央が空いた。",
  smiling_sun: "太陽の縁から細光が一本ほどけ、床へ残った。"
});

function initialState({ seed = 46081, grandmaObserver = false, brainIntegrity = 100 } = {}) {
  const initialBrain = clamp(Math.round(Number(brainIntegrity) || 0), 1, 100);
  return {
    schema: "micro-cell-battle-v2/simple-v1",
    seed: seed >>> 0,
    eventSeq: 0,
    eventLog: [],
    brainIntegrity: initialBrain,
    inventory: [],
    claimedPlacementIds: [],
    unlockedDropIds: [],
    seenAmbientIds: [],
    ambientQueue: [],
    readTalkBranchIds: [],
    talkInsights: {},
    talk: null,
    reaction: null,
    companions: [],
    grandmaObserver: Boolean(grandmaObserver),
    encounters: emptyEncounterState(),
    active: null,
    boss: { entered: false, segmentsRemaining: 3, brainIntegrity: initialBrain, defeated: false, endingTier: null },
    checkpoint: null,
    gameOver: null,
    victory: false
  };
}

const appendEvent = (state, type, detail = {}) => {
  const event = freeze({ seq: state.eventSeq + 1, type, detail: clone(detail) });
  return { ...state, eventSeq: event.seq, eventLog: [...state.eventLog, event] };
};

const captureCheckpoint = (state, id) => freeze({
  id,
  brainIntegrity: state.brainIntegrity,
  inventory: clone(state.inventory),
  claimedPlacementIds: clone(state.claimedPlacementIds),
  unlockedDropIds: clone(state.unlockedDropIds),
  seenAmbientIds: clone(state.seenAmbientIds),
  readTalkBranchIds: clone(state.readTalkBranchIds),
  talkInsights: clone(state.talkInsights),
  companions: clone(state.companions),
  grandmaObserver: state.grandmaObserver,
  encounters: clone(state.encounters),
  boss: clone(state.boss),
  active: clone(state.active)
});

const activeForEncounter = (id, suspended = false) => ({
  id, mode: "encounter", phase: "choice", message: BATTLE_V2_ENCOUNTERS[id].cue,
  result: null, selectedActionId: null, suspended
});

function startReaction(state, { encounterId, actionId, nextPhase, nextMessage }) {
  const copy = narrativeReactionFor(encounterId, actionId) || narrativeReactionFor(encounterId, "default");
  if (!copy) return { ...state, active: { ...state.active, phase: nextPhase, message: nextMessage } };
  return {
    ...state,
    talk: null,
    reaction: { encounterId, actionId, attack: copy.attack, reaction: copy.reaction, step: "attack", nextPhase, nextMessage, holdMs: 450 },
    active: { ...state.active, phase: "reaction", message: copy.attack }
  };
}

const applyBrainDamage = (state, amount, reason) => {
  const before = state.brainIntegrity;
  const after = clamp(before - amount, 0, 100);
  let next = { ...state, brainIntegrity: after, boss: { ...state.boss, brainIntegrity: after } };
  next = appendEvent(next, "battle:brain-integrity-changed", { before, after, delta: after - before, reason });
  if (after === 0) {
    next = { ...next, gameOver: "brain_integrity_depleted", active: { ...next.active, phase: "game-over", message: `脳残存率 ${before}% → 0%。${reason}` } };
    next = appendEvent(next, "battle:failed", { reason: "brain_integrity_depleted" });
  }
  return { state: next, before, after };
};

function resolveEncounter(state, encounterId, { outcome, recruited = false, actionId, correct, damage = 0, reason }) {
  const definition = BATTLE_V2_ENCOUNTERS[encounterId];
  let next = state;
  let before = state.brainIntegrity;
  let after = before;
  if (damage > 0) ({ state: next, before, after } = applyBrainDamage(next, damage, reason));
  if (next.gameOver) return next;
  const companions = recruited && !next.companions.includes(encounterId) ? [...next.companions, encounterId] : next.companions;
  const resolvedVerb = outcome === "fled" ? "退かせた" : "倒した";
  const recruitCopy = definition.recruitResult || `${definition.name}が仲間になった。`;
  const baseResult = damage
    ? `脳残存率 ${before}% → ${after}%（-${damage}）。${reason}${recruited ? recruitCopy : `${definition.name}を${resolvedVerb}。`}`
    : recruited
      ? `${recruitCopy} 脳残存率 ${after}%（損傷なし）。`
      : `${definition.name}を${resolvedVerb}。脳残存率 ${after}%（損傷なし）。`;
  const result = `${baseResult} ${AFTERMATH_BY_ENCOUNTER[encounterId]}`;
  const dropId = DROP_BY_ENCOUNTER[encounterId] || null;
  const unlockedDropIds = dropId && !next.unlockedDropIds.includes(dropId) ? [...next.unlockedDropIds, dropId] : next.unlockedDropIds;
  next = {
    ...next,
    companions,
    unlockedDropIds,
    encounters: { ...next.encounters, [encounterId]: { ...next.encounters[encounterId], resolved: true, outcome, recruited, damaged: damage > 0, suspended: false } },
    active: { ...next.active, message: result, result: { actionId, correct, damage, before, after, reason, message: result } }
  };
  next = appendEvent(next, "battle:encounter-resolved", { encounterId, outcome, recruited, actionId, correct, damage, before, after, reason });
  if (dropId) next = appendEvent(next, "battle:drop-unlocked", { encounterId, dropId });
  next = startReaction(next, { encounterId, actionId, nextPhase: "resolved", nextMessage: result });
  return { ...next, checkpoint: captureCheckpoint(next, encounterId) };
}

function resolveEncounterChoice(state, actionId) {
  const active = state.active;
  if (!active || active.mode !== "encounter" || active.phase !== "choice") return state;
  const definition = BATTLE_V2_ENCOUNTERS[active.id];
  if (!BATTLE_V2_ACTIONS[actionId]) return state;
  if (BATTLE_V2_ACTIONS[actionId].itemId && !state.inventory.includes(BATTLE_V2_ACTIONS[actionId].itemId)) return state;
  if (actionId === "recruit") {
    if (!definition.recruitable) return { ...state, active: { ...active, message: `${definition.name}は仲間にならない。別の方法を選ぶ必要がある。` } };
    if (definition.safeActionId === "recruit") {
      return resolveEncounter(state, active.id, { outcome: "recruited", recruited: true, actionId, correct: true, reason: "敵意がないという兆候に従った。" });
    }
    return resolveEncounter(state, active.id, {
      outcome: "recruited", recruited: true, actionId, correct: false,
      damage: definition.recruitPenalty ?? Math.min(5, definition.wrongDamage),
      reason: definition.recruitCondition === "risky" ? "弱らせず近づいたため、道化師に記憶をかじられた。" : "兆候に示された安全策を使わず近づいた。"
    });
  }
  const correct = actionId === definition.safeActionId || actionId === definition.alternateItemActionId;
  const recruited = correct && definition.safeRecruits === true;
  const outcome = definition.defeatOutcome || "defeated";
  return resolveEncounter(state, active.id, {
    outcome: recruited ? "recruited" : outcome, recruited, actionId, correct,
    damage: correct ? 0 : definition.wrongDamage,
    reason: correct ? "予兆に合う方法を選んだ。" : "目に見えた兆候と合わない方法を選び、反撃を受けた。"
  });
}

function resolveBossChoice(state, actionId) {
  const active = state.active;
  if (!active || active.mode !== "boss" || active.phase !== "choice") return state;
  if (BATTLE_V2_ACTIONS[actionId]?.itemId && !state.inventory.includes(BATTLE_V2_ACTIONS[actionId].itemId)) return state;
  if (state.boss.segmentsRemaining === 0) {
    if (!["sever", "wax_thread"].includes(actionId)) return state;
    const endingTier = state.brainIntegrity >= 70 ? "full" : state.brainIntegrity >= 35 ? "damaged" : "dire";
    const victoryMessage = `最後の神経を切断した。脳残存率 ${state.brainIntegrity}%。`;
    let next = { ...state, victory: true, boss: { ...state.boss, defeated: true, endingTier }, active: { ...active, message: victoryMessage } };
    next = appendEvent(next, "battle:victory", { brainIntegrity: state.brainIntegrity, endingTier, actionId });
    return startReaction(next, { encounterId: BATTLE_V2_BOSS.id, actionId, nextPhase: "victory", nextMessage: victoryMessage });
  }
  const phaseIndex = BATTLE_V2_BOSS.segments - state.boss.segmentsRemaining;
  const phase = BATTLE_V2_BOSS.phases[phaseIndex];
  const correct = actionId === phase.safeActionId || phase.id === "nerve" && actionId === "sun_filament";
  let next = state;
  let before = state.brainIntegrity;
  let after = before;
  if (!correct) ({ state: next, before, after } = applyBrainDamage(next, phase.wrongDamage, `${phase.cue} に合わない攻撃で、幼虫が脳塊を食べた。`));
  if (next.gameOver) return next;
  const remaining = state.boss.segmentsRemaining - 1;
  const resultMessage = correct
    ? `節を一つ除去した。脳残存率 ${after}%（損傷なし）。`
    : `節は外れたが、脳残存率 ${before}% → ${after}%（-${phase.wrongDamage}）。方法を誤り、幼虫に食べられた。`;
  const nextCue = remaining ? BATTLE_V2_BOSS.phases[BATTLE_V2_BOSS.segments - remaining].cue : BATTLE_V2_BOSS.finalCue;
  next = { ...next, boss: { ...next.boss, segmentsRemaining: remaining, brainIntegrity: after }, active: { ...next.active, message: nextCue, result: { actionId, correct, damage: correct ? 0 : phase.wrongDamage, before, after, message: resultMessage } } };
  next = appendEvent(next, "battle:boss-segment-removed", { phaseId: phase.id, actionId, correct, damage: correct ? 0 : phase.wrongDamage, before, after, segmentsRemaining: remaining });
  return startReaction(next, { encounterId: BATTLE_V2_BOSS.id, actionId, nextPhase: "choice", nextMessage: nextCue });
}

function addItem(state, itemId, sourceHotspotId = null, placementId = null) {
  const item = BATTLE_V2_ITEMS[itemId];
  if (!item || state.inventory.includes(itemId) || placementId && state.claimedPlacementIds.includes(placementId)) return state;
  const next = {
    ...state,
    inventory: [...state.inventory, itemId],
    claimedPlacementIds: placementId ? [...state.claimedPlacementIds, placementId] : state.claimedPlacementIds
  };
  return appendEvent(next, "battle:item-discovered", { itemId, name: item.name, sourceHotspotId, placementId });
}

export const createBattleV2State = (options = {}) => freeze(initialState(options));

export function reduceBattleV2(state, command = {}) {
  if (!state || !command || typeof command.type !== "string") return state;
  if (command.type === "RESET") return freeze(initialState({ seed: command.seed ?? state.seed, grandmaObserver: command.grandmaObserver ?? state.grandmaObserver }));
  if (state.gameOver && command.type !== "RETRY") return state;
  if (state.victory && command.type !== "ACK_REACTION") return state;
  let next = state;
  switch (command.type) {
    case "DISCOVER_ITEM": next = addItem(state, command.itemId, command.sourceHotspotId, command.placementId); break;
    case "SET_GRANDMA_OBSERVER": {
      const grandmaObserver = Boolean(command.enabled);
      if (grandmaObserver === state.grandmaObserver) break;
      next = appendEvent({ ...state, grandmaObserver }, "battle:grandma-observer-changed", { enabled: grandmaObserver });
      break;
    }
    case "SPAWN_ENCOUNTER": {
      const definition = BATTLE_V2_ENCOUNTERS[command.encounterId];
      if (!definition || state.boss.entered || state.encounters[command.encounterId].resolved) break;
      const blocking = Object.entries(state.encounters).find(([, value]) => value.spawned && !value.resolved)?.[0];
      if (blocking && blocking !== command.encounterId) break;
      if (state.active && state.active.phase !== "resolved" && state.active.id !== command.encounterId) break;
      next = {
        ...state,
        encounters: { ...state.encounters, [command.encounterId]: { ...state.encounters[command.encounterId], spawned: true, suspended: false } },
        active: activeForEncounter(command.encounterId)
      };
      next = { ...next, checkpoint: captureCheckpoint(next, command.encounterId) };
      next = appendEvent(next, "battle:encounter-spawned", { encounterId: command.encounterId });
      break;
    }
    case "TALK": {
      if (!state.active || state.active.phase !== "choice") break;
      const talkId = state.active.mode === "boss" ? BATTLE_V2_BOSS.id : state.active.id;
      if (!NARRATIVE_TALKS[talkId]?.length) break;
      const branchIds = NARRATIVE_TALKS[talkId].map(({ id }) => id);
      next = { ...state, talk: { encounterId: talkId, screen: "menu", branchId: null, lineIndex: 0, visitedBranchIds: state.readTalkBranchIds.filter((id) => branchIds.includes(id)) }, active: { ...state.active, phase: "talk" } };
      next = appendEvent(next, "battle:talk-opened", { encounterId: talkId });
      break;
    }
    case "SELECT_TALK_BRANCH": {
      if (state.active?.phase !== "talk" || !state.talk || state.talk.screen !== "menu") break;
      const selected = NARRATIVE_TALKS[state.talk.encounterId]?.find(({ id }) => id === command.branchId);
      if (!selected) break;
      next = { ...state, talk: { ...state.talk, screen: "line", branchId: selected.id, lineIndex: 0 } };
      next = appendEvent(next, "battle:talk-branch-selected", { encounterId: state.talk.encounterId, branchId: selected.id });
      break;
    }
    case "ADVANCE_TALK": {
      if (state.active?.phase !== "talk" || state.talk?.screen !== "line") break;
      const selected = NARRATIVE_TALKS[state.talk.encounterId]?.find(({ id }) => id === state.talk.branchId);
      if (!selected) break;
      const nextIndex = state.talk.lineIndex + 1;
      if (nextIndex < selected.lines.length) next = { ...state, talk: { ...state.talk, lineIndex: nextIndex } };
      else {
        const visitedBranchIds = state.talk.visitedBranchIds.includes(selected.id) ? state.talk.visitedBranchIds : [...state.talk.visitedBranchIds, selected.id];
        const readTalkBranchIds = state.readTalkBranchIds.includes(selected.id) ? state.readTalkBranchIds : [...state.readTalkBranchIds, selected.id];
        const insight = selected.lines.at(-1)?.text || "";
        next = { ...state, readTalkBranchIds, talkInsights: { ...state.talkInsights, [state.talk.encounterId]: insight }, talk: { ...state.talk, screen: "menu", branchId: null, lineIndex: 0, visitedBranchIds } };
        next = appendEvent(next, "battle:talk-branch-read", { encounterId: state.talk.encounterId, branchId: selected.id });
      }
      break;
    }
    case "CLOSE_TALK": {
      if (state.active?.phase !== "talk" || !state.talk) break;
      const cue = state.active.mode === "boss" ? selectBattleV2.cue({ ...state, talk: null, active: { ...state.active, phase: "choice" } }) : BATTLE_V2_ENCOUNTERS[state.active.id].cue;
      const insight = state.talkInsights[state.talk.encounterId];
      next = { ...state, talk: null, active: { ...state.active, phase: "choice", message: insight ? `${cue} 気づき：${insight}` : cue } };
      next = appendEvent(next, "battle:talk-closed", { encounterId: state.talk.encounterId });
      break;
    }
    case "ACK_REACTION": {
      if (state.active?.phase !== "reaction" || !state.reaction) break;
      if (state.reaction.step === "attack") {
        next = { ...state, reaction: { ...state.reaction, step: "reaction" }, active: { ...state.active, message: state.reaction.reaction } };
        next = appendEvent(next, "battle:reaction-shown", { encounterId: state.reaction.encounterId, actionId: state.reaction.actionId });
      } else {
        next = { ...state, reaction: null, active: { ...state.active, phase: state.reaction.nextPhase, message: state.reaction.nextMessage } };
        next = appendEvent(next, "battle:reaction-finished", { encounterId: state.reaction.encounterId, actionId: state.reaction.actionId });
      }
      break;
    }
    case "TRIGGER_AMBIENT": {
      const ambient = NARRATIVE_AMBIENT_EVENTS[command.ambientId];
      if (!ambient || state.seenAmbientIds.includes(command.ambientId) || state.ambientQueue.includes(command.ambientId)) break;
      next = { ...state, seenAmbientIds: [...state.seenAmbientIds, command.ambientId], ambientQueue: [...state.ambientQueue, command.ambientId] };
      next = appendEvent(next, "battle:ambient-triggered", { ambientId: command.ambientId, nodeId: ambient.nodeId });
      break;
    }
    case "DISMISS_AMBIENT": {
      if (!state.ambientQueue.length) break;
      next = { ...state, ambientQueue: state.ambientQueue.slice(1) };
      break;
    }
    case "ACTION": next = state.active?.mode === "boss" ? resolveBossChoice(state, command.actionId) : resolveEncounterChoice(state, command.actionId); break;
    case "RECRUIT": next = resolveEncounterChoice(state, "recruit"); break;
    case "LEAVE": {
      if (state.active?.mode !== "encounter" || !["choice", "talk"].includes(state.active.phase)) break;
      const id = state.active.id;
      next = { ...state, active: null, talk: null, reaction: null, encounters: { ...state.encounters, [id]: { ...state.encounters[id], suspended: true } } };
      next = appendEvent(next, "battle:encounter-left", { encounterId: id });
      break;
    }
    case "ACK_RESOLUTION": if (state.active?.phase === "resolved") next = { ...state, active: null, talk: null, reaction: null }; break;
    case "BEGIN_BOSS": {
      if (state.boss.entered || Object.values(state.encounters).some(({ resolved }) => !resolved)) break;
      next = { ...state, boss: { ...state.boss, entered: true }, active: { id: BATTLE_V2_BOSS.id, mode: "boss", phase: "choice", message: BATTLE_V2_BOSS.phases[0].cue, result: null } };
      next = { ...next, checkpoint: captureCheckpoint(next, "boss") };
      next = appendEvent(next, "battle:boss-started", { brainIntegrity: state.brainIntegrity, segmentsRemaining: 3 });
      break;
    }
    case "RETRY": {
      if (!state.checkpoint) break;
      const cp = state.checkpoint;
      next = { ...state, brainIntegrity: cp.brainIntegrity, inventory: clone(cp.inventory), claimedPlacementIds: clone(cp.claimedPlacementIds), unlockedDropIds: clone(cp.unlockedDropIds), seenAmbientIds: clone(cp.seenAmbientIds), ambientQueue: [], readTalkBranchIds: clone(cp.readTalkBranchIds), talkInsights: clone(cp.talkInsights), talk: null, reaction: null, companions: clone(cp.companions), grandmaObserver: cp.grandmaObserver, encounters: clone(cp.encounters), boss: clone(cp.boss), active: clone(cp.active), gameOver: null, victory: false };
      if (next.active) next.active = { ...next.active, phase: "choice", message: next.active.mode === "boss" ? BATTLE_V2_BOSS.phases[0].cue : BATTLE_V2_ENCOUNTERS[next.active.id].cue };
      next = appendEvent(next, "battle:checkpoint-restored", { checkpointId: cp.id, brainIntegrity: next.brainIntegrity });
      break;
    }
    default: return state;
  }
  return next === state ? state : freeze(next);
}

export const selectBattleV2 = freeze({
  unresolvedEncounterId: (state) => Object.entries(state.encounters).find(([, value]) => value.spawned && !value.resolved)?.[0] || null,
  isForwardBlocked: (state) => Boolean(
    Object.values(state.encounters).some(({ spawned, resolved }) => spawned && !resolved) ||
    state.active && ["talk", "reaction"].includes(state.active.phase)
  ),
  isEncounterResolved: (state, id) => Boolean(state.encounters[id]?.resolved),
  availableActions: (state) => {
    if (!state.active || state.gameOver || state.victory || !["choice", "resolved"].includes(state.active.phase)) return [];
    if (state.active.phase === "resolved") return ["forward"];
    if (state.active.mode === "boss") {
      if (state.boss.segmentsRemaining === 0) return [...(state.inventory.includes("wax_thread") ? ["wax_thread"] : []), "sever"];
      const phase = BATTLE_V2_BOSS.phases[BATTLE_V2_BOSS.segments - state.boss.segmentsRemaining];
      const alternate = phase.id === "nerve" && state.inventory.includes("sun_filament") ? ["sun_filament"] : [];
      return [...alternate, "ear_pick_strike", "ear_pick_beam"].slice(0, 4);
    }
    const definition = BATTLE_V2_ENCOUNTERS[state.active.id];
    return definition.actionOrder.filter((id) => {
      const itemId = BATTLE_V2_ACTIONS[id]?.itemId;
      return (!itemId || state.inventory.includes(itemId)) && (id !== "recruit" || definition.recruitable);
    }).slice(0, 3);
  },
  cue: (state) => {
    if (!state.active) return "";
    if (state.active.phase === "resolved" || state.active.phase === "game-over" || state.active.phase === "victory") return state.active.message;
    if (state.active.mode === "boss") return state.boss.segmentsRemaining ? BATTLE_V2_BOSS.phases[BATTLE_V2_BOSS.segments - state.boss.segmentsRemaining].cue : BATTLE_V2_BOSS.finalCue;
    return state.active.message || BATTLE_V2_ENCOUNTERS[state.active.id].cue;
  },
  inventoryNames: (state) => state.inventory.map((id) => BATTLE_V2_ITEMS[id]?.name || id),
  worldPlacements: (state, context = {}) => NARRATIVE_WORLD_PLACEMENTS.filter((placement) => {
    if (state.claimedPlacementIds.includes(placement.id) || state.inventory.includes(placement.itemId)) return false;
    if (context.nodeId && !placement.nodes.includes(context.nodeId)) return false;
    if (context.owner && placement.owner !== context.owner) return false;
    if (placement.unlock.type === "initial") return true;
    if (placement.unlock.type === "grandma-resolved") return Boolean(context.grandmaResolved);
    if (placement.unlock.type === "encounter-resolved") {
      const unlockId = placement.unlock.unlockId || placement.id;
      return state.unlockedDropIds.includes(unlockId) && Boolean(state.encounters[placement.unlock.encounterId]?.resolved);
    }
    return false;
  }),
  talkBranches: (state) => state.talk ? NARRATIVE_TALKS[state.talk.encounterId] || [] : [],
  talkLine: (state) => {
    if (state.talk?.screen !== "line") return null;
    const selected = NARRATIVE_TALKS[state.talk.encounterId]?.find(({ id }) => id === state.talk.branchId);
    return selected?.lines[state.talk.lineIndex] || null;
  },
  talkInsight: (state) => state.active ? state.talkInsights[state.active.mode === "boss" ? BATTLE_V2_BOSS.id : state.active.id] || "" : "",
  ambientCurrent: (state) => state.ambientQueue.length ? NARRATIVE_AMBIENT_EVENTS[state.ambientQueue[0]] || null : null,
  statusText: (state) => `脳残存率 ${state.brainIntegrity}%${state.active?.mode === "boss" ? `　残り節 ${state.boss.segmentsRemaining}/3` : ""}`,
  snapshot: (state) => freeze(clone(state))
});

export function applyBattleV2Command(state, input) {
  const beforeSeq = state.eventSeq;
  const next = reduceBattleV2(state, input);
  const events = next.eventLog.filter(({ seq }) => seq > beforeSeq);
  const effects = events.flatMap((event) => [{ type: "persist-session", schema: next.schema, eventSeq: event.seq }, ...(event.type === "battle:encounter-resolved" || event.type === "battle:failed" || event.type === "battle:victory" || event.type === "battle:item-discovered" || event.type === "battle:ambient-triggered" ? [{ type: "announce", eventType: event.type, detail: event.detail }] : [])]);
  return freeze({ state: next, events, effects });
}

export function replayBattleV2(initial, transcript) {
  return transcript.reduce((state, input) => applyBattleV2Command(state, input).state, initial);
}

export function canonicalBattleV2Serialize(value) {
  const canonical = (input) => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object") return Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical(input[key])]));
    return input;
  };
  return JSON.stringify(canonical(value));
}

export function hashBattleV2Transcript(transcript) {
  const text = canonicalBattleV2Serialize(transcript);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export function nextBattleV2Rng(rngState) {
  let value = Number(rngState) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}
