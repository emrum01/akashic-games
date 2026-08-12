const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

const EXISTING_NODES = Array.from({ length: 12 }, (_, index) => `z${String(index).padStart(3, "0")}`);
const WINDOW_NODES = ["w000", "w001", "w002", "w003"];
const PORTAL_NODE = "wp000";
const SHIP_NODES = Array.from({ length: 10 }, (_, index) => `s${String(index).padStart(3, "0")}`);
const BOSS_NODE = "b000";
const GRANDMA_COMPANION_ACTIONS = freeze([
  "おばあさんは編み物の目を数えている。",
  "おばあさんは老眼鏡を探している。",
  "おばあさんは膝掛けの皺を直している。"
]);

export const SPACE_ARC_COMPANION_TAXONOMY = freeze({
  grandma: freeze({
    kind: "earwax_manifestation",
    livingOrganism: false,
    disguisedLarva: false,
    description: "耳垢が一時的におばあさんの姿を取った仲間。生物の幼虫ではない。"
  }),
  clown: freeze({
    kind: "anomalous_cannibal_larva",
    livingOrganism: true,
    disguisedLarva: true,
    description: "道化師の姿へ擬態した、人食い性を持つ生きた異常幼虫。耳垢ではない。"
  })
});

export const SPACE_ARC_ROUTE = freeze([
  ...EXISTING_NODES,
  ...WINDOW_NODES,
  PORTAL_NODE,
  ...SHIP_NODES,
  BOSS_NODE
]);

const VIEW_ROOT = "./generated/view-cells/space-window-arc-v1";
const CAST_ROOT = "./generated/characters/space-window-cast-v1";
const approvedImage = (path, sha256, width, height) => freeze({ path, sha256, width, height, raw: false, approved: true });
const stageHashes = freeze([
  ["1820a6df7ae0f5d63798fdbab23b4e34a2647db7753c25169920c70a26b1f323", "143db7c8e7a602c6eb937ed19f83795c8ddcdcd7bf32cf71878bb6b1c7889de4"],
  ["0e4ee9c29454a0656663fc3d92fd589db05423907f6a7ea8f2daf16886036ccc", "3cc589cae4de1a7615332ae1c78ebe6dcc8589f01d9db7a48de248f2cea19511"],
  ["0be41bc391f4dd0ff6f2d129ff863e6387332d620f31d86eb2730308c662eaf7", "3abfbe73fc657f7c8ec5be8d0fe2eeeb94a74e28fb30e8d1d2425e0c115ca4af"],
  ["0fc83b9f3358ba968cef110550c81c688b32c419443c684da6f4f47d19b4265f", "6192919d992c7342951beeb988d734f8abb57cf3464d3c7d805bc62683382dda"],
  ["10a426297b16f747d7f4e319c79e866879040f18dfd30fa73c38bc33252391b5", "39b66d3271e4f5db4c7a6f2fb1c8b0d88d9646849855722e0140fefee22cae74"],
  ["4ce26179f4368fc689fb5335d33a1b49ff0c987e1e541ef8391f9567527ec87f", "ddba460dcff644b9f90535999b838cbf78d370b657c89c2e9f9545036a0b20e6"],
  ["e49c597425d0b9a92359f344caa820e3d4bcf0ba898ee622df09d63c9b5597c0", "ea0719551d51fcf98239f30c9a99863e77b79d01f907fc67997ac1e51bc5d7de"],
  ["0f4f1055dd49980e564403ab94195e678008cc2353555ae063680a7f885b0fd6", "d16f9e4dde742ca77e0f26c57b8569845508fda99e15b42195d0715fdee2cf6f"],
  ["5feb10c9f30323c80244226217379a6b888b7fc811de1fd70fc0fd4ba4d4122a", "e359ac60f39686da4dc04667c862ca5a8f28622fd185684c0c99d916b38d0c7a"],
  ["118f882a358656579f06d0affed22ae3c7ce01996dae09c254738e08b0cb0123", "08432b25816ff7056fbc24fb98cf83d48e12853d9f51be888212358e2d354f39"]
]);

const characterImage = (id, file, sha256, width, height) => freeze({
  id,
  kind: "image",
  image: approvedImage(`${CAST_ROOT}/characters/${file}`, sha256, width, height),
  playbackScope: "active-encounter-only",
  wired: true
});

const characterVideo = (id, file, poster, sha256, posterSha256, width, height, fps, durationSeconds) => freeze({
  id,
  kind: "video",
  video: freeze({ path: `${CAST_ROOT}/videos/${file}`, sha256, width, height, fps, durationSeconds, alpha: true, raw: false, approved: true }),
  poster: approvedImage(`${CAST_ROOT}/videos/${poster}`, posterSha256, width, height),
  autoplay: true,
  muted: true,
  loop: true,
  playsInline: true,
  playbackScope: "active-encounter-only",
  fallback: "poster",
  wired: true
});

export const SPACE_ARC_ASSET_MANIFEST = freeze({
  schema: "micro-cell-space-window-arc-assets/v1",
  root: `${VIEW_ROOT}/`,
  visibleRuntimePolicy: "never-render-unavailable-slot",
  rawAssetPolicy: "forbidden",
  anchors: freeze({
    portal: approvedImage(`${VIEW_ROOT}/portal-threshold/final.png`, "c59445037c509072bc78fd93585d464f54d3c2a70d321dd29c38da75139ce07b", 1536, 1024),
    corridorNear: approvedImage(`${VIEW_ROOT}/corridor-near/final.png`, "66f454b2f9940144211cc3b9ca31d653bb4145322a8d0fce10171f5ecf509541", 1536, 1024),
    corridorDeep: approvedImage(`${VIEW_ROOT}/corridor-deep/final.png`, "c4548dee29c9996a518095d5b7b066df48ba0531a45f4b76900f747c73e0a9b4", 1536, 1024),
    boss: approvedImage(`${VIEW_ROOT}/boss-chamber/final.png`, "099d9f37b84a7fc12eab2631ed2945d68218a9fd815a670d4fcb14db469dff3e", 1536, 1024)
  }),
  nodeSlots: freeze([
    ...WINDOW_NODES.map((nodeId) => freeze({ nodeId, owner: "active-room", inherited: true, wired: true })),
    freeze({ nodeId: PORTAL_NODE, owner: "portal", wired: true }),
    ...SHIP_NODES.map((nodeId, index) => freeze({
      nodeId,
      owner: index < 5 ? "corridor-near" : "corridor-deep",
      pc: approvedImage(`${VIEW_ROOT}/stages-pc/ship-z${String(index + 1).padStart(3, "0")}.png`, stageHashes[index][0], 1536, 1024),
      mobile: approvedImage(`${VIEW_ROOT}/stages-mobile/ship-z${String(index + 1).padStart(3, "0")}.png`, stageHashes[index][1], 390, 844),
      wired: true
    })),
    freeze({ nodeId: BOSS_NODE, owner: "boss", wired: true })
  ]),
  characters: [
    characterVideo("clown", "clown-scythe-loop-v2.webm", "clown-scythe-poster-v2.png", "6982ae5809f77e22d665de7eee17204fbaea3ce25bc787389548d239e1b6486b", "79e8f8c662e65ed1d7c73979458573c1ca2173f7321a30133682e0487721dcb0", 512, 512, 12, 1),
    characterImage("flower_seller", "flower-seller.png", "9dd5c7c517d22bad05357c8f169bd41e88e1af40086716e44ea77b7eab4dbc3b", 376, 755),
    characterImage("booklion", "hon-lion.png", "fa55141d0e7e9c9b842822b10a560935dd7cd19e3012a564dfe63a25083c5de8", 1272, 1236),
    characterImage("construction_worker", "construction-worker.png", "c3fa0c6e0fb93ab212d14ec1a3aea8bd87036c2853233b7502b480ed40e5d772", 384, 752),
    characterImage("smiling_priest", "priest.png", "d0b3e5f0547abdc31da570b54257a463c5494ea5bbcc7e3732d9c6786626c9bb", 277, 749),
    characterImage("ninja", "ninja.png", "f76c754fd7ebc656a55798fd37b69d0836067a246bd50b483a0535059c862fba", 340, 729),
    characterImage("beggar", "begging-man.png", "4b709165fe54268bfe271fb7eb08f5a95418665cf01597fff78125508fc74e4f", 308, 742),
    characterVideo("smiling_sun", "sun-laser-loop.webm", "sun-laser-poster.png", "e224750a9284905bd16b0a5f6a39b2188f52d134ad09bbe9301332c96d8b1a5c", "4778f08cbfe59c1a33e49ae6dad7a30055518a756a3b210e339e436b770fb7f7", 576, 512, 8, 1.5)
  ],
  bossBrainOverlay: freeze({
    owner: "code-native",
    label: "脳残量",
    unit: "%",
    sourceBbox: freeze([1125, 282, 1406, 487]),
    fillRgb: freeze([0, 229, 255]),
    wired: true
  }),
  domBudget: freeze({ imagePlates: 2, decodedResidentHardLimit: 4 })
});

const encounter = (config) => freeze({
  actions: ["talk", "fight", "recruit", "leave"],
  actionLabels: freeze({ talk: "話す", fight: "戦う", recruit: "仲間にする", leave: "立ち去る" }),
  advanceLabel: "先へ進む",
  optional: false,
  ...config
});

export const SPACE_ARC_ENCOUNTERS = freeze({
  clown: encounter({
    nodeId: "w001",
    displayName: "道化師",
    taxonomy: "anomalous_cannibal_larva",
    notEarwax: true,
    talk: "道化師は笑いながら、自分の影だけを先に食べた。『次は、きみの番かな』",
    attack: "道化師の腹が縦に割れ、幼虫の顎がこちらの記憶を噛みちぎろうとする。",
    recruitRule: "weakened-only",
    recruitSuccess: "弱った道化師は薄い皮を脱いだ。人ではない幼虫が、従うふりをして後ろにつく。",
    recruitFailure: "まだ飢えが強すぎる。仲間にするには、まず弱らせる必要がある。",
    betrayalDelayMs: 180000
  }),
  flower_seller: encounter({
    nodeId: "w003",
    displayName: "花売り",
    taxonomy: "space_drifter",
    talk: "花売りは真空でも萎れない花束を持ち上げる。『敵にも値札は付く。払わせればいい』",
    attack: "花びらの請求書が舞い、支払いを拒んだ者の足元へ根を張る。",
    recruitRule: "always",
    recruitSuccess: "花売りは帳簿を開き、以後の敵から通行料を取り立てることにした。"
  }),
  booklion: encounter({
    nodeId: "s001",
    displayName: "本ライオン",
    taxonomy: "library_beast",
    talk: "頭に開いた本の頁が風もないのにめくれる。『読めるなら、ここを読んでくれ』",
    attack: "本ライオンはこちらの構えを見るなり、栞を落として全速力で逃げた。",
    fightOutcome: "flee",
    recruitRule: "always",
    recruitSuccess: "本ライオンは林檎を一口かじり、頭の本を読んでもらうためについてきた。"
  }),
  construction_worker: encounter({
    nodeId: "s003",
    displayName: "工事作業員",
    taxonomy: "route_blocker",
    talk: "作業員は遠い扉へ赤い灯棒を向ける。『この先は工事中だ。責任は取らないぞ』",
    attack: "安全柵が床からせり上がり、進路を正面から塞ぐ。",
    recruitRule: "never",
    recruitFailure: "作業員はヘルメットを押さえた。『勤務中だ。仲間にはならない』"
  }),
  smiling_priest: encounter({
    nodeId: "s004",
    displayName: "微笑む司祭",
    taxonomy: "signal_cleric",
    talk: "司祭は歯を見せたまま囁く。『飢えには名前を、名前には輪を与えましょう』",
    attack: "白い輪唱が耳鳴りのように重なり、こちらの行動順を一つ遅らせる。",
    recruitRule: "always",
    recruitSuccess: "司祭は幼虫の飢えへ制御印を刻んだ。裏切りの時刻が凍りつく。",
    controlsLarva: true
  }),
  ninja: encounter({
    nodeId: "s006",
    displayName: "忍者",
    taxonomy: "silence_agent",
    talk: "忍者は声を出さず、『音は敵に位置を教える』と書いた札を裏返した。",
    attack: "耳鳴り手裏剣が飛び、次に選んだ行動の音だけを切り落とす。",
    recruitRule: "always",
    recruitSuccess: "忍者は影へ沈み、次の敵の一手を一度だけ影縫いする役を引き受けた。"
  }),
  beggar: encounter({
    nodeId: "s008",
    displayName: "物乞い",
    taxonomy: "memory_scavenger",
    talk: "物乞いは空の器を差し出す。『金はいらない。もう使わない記憶を一つくれ』",
    attack: "器の底が開き、こちらの直前の選択を丸ごと盗もうとする。",
    recruitRule: "always",
    recruitSuccess: "物乞いは捨てられた記憶を薄い盾へ編み直し、こちらへ返した。"
  }),
  smiling_sun: encounter({
    nodeId: "s009",
    displayName: "微笑む太陽",
    taxonomy: "stellar_companion",
    talk: "太陽は笑顔を崩さない。『暗いところは、ぜんぶ照らしてあげる』",
    attack: "細い光線が床をなぞり、逃げ道だけを正確に焼き切る。",
    recruitRule: "always",
    recruitSuccess: "微笑む太陽が軌道へ加わった。敵には強力だが、脳には近づけないほうがいい。",
    bossHazard: "burns-floating-brain"
  })
});

export const SPACE_ARC_GRAPH = freeze({
  schema: "micro-cell-space-window-arc-graph/v1",
  status: "active-assets-wired",
  nodes: SPACE_ARC_ROUTE.map((id, index) => freeze({
    id,
    index,
    owner: id.startsWith("z") ? "active-runtime" : "space-window-arc-v1-slot",
    visible: id.startsWith("z"),
    assetRequiredBeforeActivation: !id.startsWith("z")
  })),
  edges: SPACE_ARC_ROUTE.slice(0, -1).map((from, index) => {
    const to = SPACE_ARC_ROUTE[index + 1];
    const scopeBlink = (from === "w003" && to === PORTAL_NODE) || (from === "s009" && to === BOSS_NODE);
    const encounterId = Object.entries(SPACE_ARC_ENCOUNTERS).find(([, value]) => value.nodeId === from)?.[0] || null;
    return freeze({
      id: `${from}-${to}`,
      from,
      to,
      gate: encounterId ? { type: "encounter-resolved", encounterId } : null,
      forwardPolicy: "encounter-resolution-required",
      encounterPolicy: "hard-block-until-resolved",
      transition: scopeBlink ? "opaque-scope-blink" : "deterministic-zoom"
    });
  }),
  encounterSchedule: Object.fromEntries(Object.entries(SPACE_ARC_ENCOUNTERS).map(([id, value]) => [value.nodeId, id])),
  portal: freeze({ nodeId: PORTAL_NODE, entryEdge: "w003-wp000", transition: "opaque-scope-blink" }),
  shipStages: SHIP_NODES,
  farDoor: freeze({ edge: "s009-b000", transition: "opaque-scope-blink" }),
  boss: freeze({
    id: "segmented_glutton_larva",
    nodeId: BOSS_NODE,
    brainRemainingInitialPercent: 100,
    options: ["観察する", "耳かきで節を削る", "仲間に任せる", "一つ前へ戻る"]
  })
});

const EVENT_BY_NODE = SPACE_ARC_GRAPH.encounterSchedule;
const START_INDEX = SPACE_ARC_ROUTE.indexOf("z011");
const ENCOUNTER_IDS = Object.keys(SPACE_ARC_ENCOUNTERS);

const freshEncounterStatus = () => Object.fromEntries(ENCOUNTER_IDS.map((id) => [id, { resolved: false, outcome: null }]));

function freshState(initialCompanions) {
  return {
    nodeId: "z011",
    routeIndex: START_INDEX,
    screen: "hidden",
    activeEncounterId: null,
    message: null,
    encounterStatus: freshEncounterStatus(),
    companions: [...initialCompanions],
    money: 0,
    shield: 0,
    clockMs: 0,
    larvaBackstabDueAtMs: null,
    larvaControlled: false,
    grandmaTurnIndex: 0,
    booklionTurnIndex: 0,
    booklionAwaitingRead: false,
    booklionUnderstood: false,
    brainRemainingPercent: 100,
    bossDefeated: false,
    gameOver: null
  };
}

export function createSpaceArcState({
  onChange = () => {},
  onEvent = () => {},
  grandmaRecruited = false
} = {}) {
  const initialCompanions = freeze(grandmaRecruited ? ["grandma"] : []);
  let state = freshState(initialCompanions);
  const snapshot = () => freeze({
    ...state,
    encounterStatus: { ...state.encounterStatus },
    encounterResolved: Object.fromEntries(ENCOUNTER_IDS.map((id) => [id, Boolean(state.encounterStatus[id]?.resolved)])),
    companions: [...state.companions]
  });
  const emit = (type, detail = {}) => onEvent(freeze({ type, ...detail }), snapshot());
  const commit = (patch, event = null) => {
    state = { ...state, ...patch };
    const next = snapshot();
    onChange(next);
    if (event) emit(event.type, event.detail);
    return next;
  };
  const encounterState = (id) => state.encounterStatus[id] || {};
  const patchEncounter = (id, patch) => ({
    ...state.encounterStatus,
    [id]: { ...encounterState(id), ...patch }
  });

  const normalizedRouteIndex = (index) => Math.max(START_INDEX, Math.min(SPACE_ARC_ROUTE.length - 1, Math.round(Number(index))));
  const blockingEncounterForIndex = (index) => {
    const targetIndex = normalizedRouteIndex(index);
    if (targetIndex <= state.routeIndex) return null;
    const currentEncounterId = EVENT_BY_NODE[state.nodeId] || null;
    if (currentEncounterId && !encounterState(currentEncounterId).resolved) return currentEncounterId;
    for (let routeIndex = state.routeIndex + 1; routeIndex < targetIndex; routeIndex += 1) {
      const encounterId = EVENT_BY_NODE[SPACE_ARC_ROUTE[routeIndex]] || null;
      if (encounterId && !encounterState(encounterId).resolved) return encounterId;
    }
    return null;
  };

  function canEnterRouteIndex(index) {
    return blockingEncounterForIndex(index) === null;
  }

  function requestRouteIndex(index) {
    const targetIndex = normalizedRouteIndex(index);
    const encounterId = blockingEncounterForIndex(targetIndex);
    if (encounterId) {
      emit("space-arc:encounter-forward-blocked", { encounterId, nodeId: state.nodeId, requestedNodeId: SPACE_ARC_ROUTE[targetIndex] });
      return snapshot();
    }
    return enterNode(targetIndex);
  }

  function reset() {
    state = freshState(initialCompanions);
    const next = snapshot();
    onChange(next);
    emit("space-arc:reset");
    return next;
  }

  function enterNode(index) {
    const nodeId = SPACE_ARC_ROUTE[index];
    const encounterId = EVENT_BY_NODE[nodeId] || null;
    if (nodeId === BOSS_NODE) {
      if (state.bossDefeated) {
        return commit({ routeIndex: index, nodeId, screen: "victory", activeEncounterId: null, message: "脳残量は0%。幼虫と脳は停止した残像として視界に焼き付いている。" });
      }
      return commit({ routeIndex: index, nodeId, screen: "boss-menu", activeEncounterId: null, message: "遠い扉が開き、節の連なる幼虫と浮遊する脳が現れた。" },
        { type: "space-arc:boss-entered", detail: { bossId: "segmented_glutton_larva" } });
    }
    if (encounterId && !encounterState(encounterId).resolved) {
      return commit({ routeIndex: index, nodeId, screen: "action", activeEncounterId: encounterId, message: null },
        { type: "space-arc:encounter-opened", detail: { encounterId, nodeId } });
    }
    return commit({ routeIndex: index, nodeId, screen: "hidden", activeEncounterId: null, message: null });
  }

  function advance() {
    if (state.gameOver) return snapshot();
    if (state.activeEncounterId && state.screen !== "hidden") {
      if (!encounterState(state.activeEncounterId).resolved) {
        emit("space-arc:encounter-forward-blocked", { encounterId: state.activeEncounterId, nodeId: state.nodeId, requestedNodeId: SPACE_ARC_ROUTE[state.routeIndex + 1] || state.nodeId });
        return snapshot();
      }
      state = { ...state, screen: "hidden", activeEncounterId: null, message: null };
    }
    if (state.routeIndex >= SPACE_ARC_ROUTE.length - 1) return snapshot();
    return requestRouteIndex(state.routeIndex + 1);
  }

  function retreat() {
    if (state.routeIndex <= START_INDEX || state.gameOver) return snapshot();
    return enterNode(state.routeIndex - 1);
  }

  function chooseAction(action) {
    const id = state.activeEncounterId;
    const definition = SPACE_ARC_ENCOUNTERS[id];
    if (!definition || state.gameOver) return snapshot();
    if (action === "leave") {
      const routeIndex = Math.max(START_INDEX, state.routeIndex - 1);
      return commit({
        routeIndex,
        nodeId: SPACE_ARC_ROUTE[routeIndex],
        screen: "hidden",
        activeEncounterId: null,
        message: null,
        encounterStatus: patchEncounter(id, { resolved: false, outcome: "left" })
      }, { type: "space-arc:encounter-left", detail: { encounterId: id, unresolved: true, nodeId: SPACE_ARC_ROUTE[routeIndex] } });
    }
    if (action === "talk") return commit({ screen: "result", message: definition.talk },
      { type: "space-arc:talk", detail: { encounterId: id } });
    if (action === "fight") {
      if (id === "construction_worker" && state.companions.includes("clown")) {
        return commit({
          screen: "result",
          message: "幼虫が工事作業員を一息で呑み込み、安全柵だけが残った。",
          encounterStatus: patchEncounter(id, { resolved: true, outcome: "clown-auto-kill" })
        }, { type: "space-arc:clown-auto-kill", detail: { encounterId: id } });
      }
      if (definition.fightOutcome === "flee") {
        return commit({
          screen: "result",
          message: definition.attack,
          encounterStatus: patchEncounter(id, { resolved: true, outcome: "fled" })
        }, { type: "space-arc:fight-fled", detail: { encounterId: id } });
      }
      if (id === "clown") {
        return commit({
          screen: "result",
          message: `${definition.attack} こちらの耳かきが顎の付け根を押さえ、幼虫は弱った。`,
          encounterStatus: patchEncounter(id, { weakened: true, outcome: "weakened" })
        }, { type: "space-arc:clown-weakened", detail: { encounterId: id } });
      }
      return commit({
        screen: "result",
        message: definition.attack,
        encounterStatus: patchEncounter(id, { resolved: true, outcome: id === "construction_worker" ? "defeated" : "fought" })
      }, { type: "space-arc:fight", detail: { encounterId: id } });
    }
    if (action === "recruit") return recruit(id);
    return snapshot();
  }

  function recruit(id = state.activeEncounterId) {
    const definition = SPACE_ARC_ENCOUNTERS[id];
    if (!definition || id !== state.activeEncounterId) return snapshot();
    const status = encounterState(id);
    if (definition.recruitRule === "never" || (definition.recruitRule === "weakened-only" && !status.weakened)) {
      return commit({ screen: "result", message: definition.recruitFailure },
        { type: "space-arc:recruit-rejected", detail: { encounterId: id } });
    }
    const companions = state.companions.includes(id) ? state.companions : [...state.companions, id];
    const patch = {
      companions,
      screen: "result",
      message: definition.recruitSuccess,
      encounterStatus: patchEncounter(id, { resolved: true, recruited: true, outcome: "recruited" })
    };
    if (id === "clown") patch.larvaBackstabDueAtMs = state.clockMs + definition.betrayalDelayMs;
    if (definition.controlsLarva) patch.larvaControlled = true;
    return commit(patch, { type: "space-arc:companion-recruited", detail: { encounterId: id } });
  }

  function returnToAction() {
    if (!state.activeEncounterId || state.gameOver) return snapshot();
    const resolved = Boolean(encounterState(state.activeEncounterId).resolved);
    return commit({ screen: resolved ? "hidden" : "action", message: null, activeEncounterId: resolved ? null : state.activeEncounterId });
  }

  function advanceTime(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0 || state.gameOver) return snapshot();
    const clockMs = state.clockMs + deltaMs;
    if (state.larvaBackstabDueAtMs !== null && clockMs >= state.larvaBackstabDueAtMs && !state.larvaControlled) {
      return commit({ clockMs, screen: "game-over", gameOver: "cannibal_larva_backstab", message: "道化師の皮を被った幼虫が背後から噛みついた。" },
        { type: "space-arc:game-over", detail: { reason: "cannibal_larva_backstab" } });
    }
    return commit({ clockMs });
  }

  function takeCompanionTurn(enemyId = null) {
    if (state.gameOver) return null;
    const actions = [];
    if (state.companions.includes("grandma")) {
      const text = GRANDMA_COMPANION_ACTIONS[state.grandmaTurnIndex % GRANDMA_COMPANION_ACTIONS.length];
      actions.push({ companionId: "grandma", text, harmless: true });
      state = { ...state, grandmaTurnIndex: state.grandmaTurnIndex + 1 };
    }
    if (state.companions.includes("flower_seller")) {
      state = { ...state, money: state.money + 30 };
      actions.push({ companionId: "flower_seller", text: "花売りは敵から通行料を30取り立てた。", moneyDelta: 30 });
    }
    if (state.companions.includes("booklion")) {
      if (state.booklionTurnIndex % 2 === 0) {
        actions.push({ companionId: "booklion", text: "本ライオンは林檎を食べている。", harmless: true });
        state = { ...state, booklionTurnIndex: state.booklionTurnIndex + 1 };
      } else {
        actions.push({ companionId: "booklion", text: "本ライオンは頭の本を読んでほしそうにしている。", requestsReading: true });
        state = { ...state, booklionTurnIndex: state.booklionTurnIndex + 1, booklionAwaitingRead: true };
      }
    }
    if (state.companions.includes("clown") && enemyId === "construction_worker") {
      actions.push({ companionId: "clown", text: "幼虫が工事作業員を一息で呑み込み、安全柵だけが残った。", autoKill: true });
    }
    if (state.companions.includes("smiling_priest")) actions.push({ companionId: "smiling_priest", text: "微笑む司祭が飢えの制御印を確かめた。", controlsLarva: true });
    if (state.companions.includes("ninja")) actions.push({ companionId: "ninja", text: "忍者の影縫いが敵の次の一手を止めた。", cancelsEnemyTurn: true });
    if (state.companions.includes("beggar")) {
      state = { ...state, shield: state.shield + 1 };
      actions.push({ companionId: "beggar", text: "物乞いが捨てられた記憶を盾へ編み直した。", shieldDelta: 1 });
    }
    if (state.companions.includes("smiling_sun")) actions.push({ companionId: "smiling_sun", text: "微笑む太陽が敵へ細い光線を放った。", laser: true });
    const result = freeze({ enemyId, actions, money: state.money, shield: state.shield });
    onChange(snapshot());
    emit("space-arc:companion-turn", result);
    return result;
  }

  function readBooklionHeadBook() {
    if (!state.companions.includes("booklion") || !state.booklionAwaitingRead) return null;
    const text = "全てわかったぞ！！！！！";
    commit({ booklionAwaitingRead: false, booklionUnderstood: true }, { type: "space-arc:booklion-understood", detail: { text } });
    return text;
  }

  function bossAction(action) {
    if (state.nodeId !== BOSS_NODE || state.gameOver || state.bossDefeated) return snapshot();
    if (action === "companion" && state.companions.includes("smiling_sun")) {
      return commit({ screen: "game-over", gameOver: "sun_burned_floating_brain", message: "微笑む太陽の光線が浮遊する脳を焼き切った。" },
        { type: "space-arc:game-over", detail: { reason: "sun_burned_floating_brain" } });
    }
    if (action === "scrape") {
      const brainRemainingPercent = Math.max(0, state.brainRemainingPercent - 10);
      if (brainRemainingPercent === 0) {
        return commit({ brainRemainingPercent, bossDefeated: true, screen: "victory", message: "脳残量は0%。幼虫と脳は停止した残像として視界に焼き付いている。" },
          { type: "space-arc:boss-defeated", detail: { brainRemainingPercent: 0 } });
      }
      return commit({ brainRemainingPercent, message: `脳残量 ${brainRemainingPercent}%` },
        { type: "space-arc:boss-brain-updated", detail: { brainRemainingPercent } });
    }
    if (action === "observe") return commit({ message: "節の隙間で、浮遊する脳へ細い神経が伸び縮みしている。" });
    if (action === "back") return retreat();
    return snapshot();
  }

  return freeze({
    getState: snapshot,
    reset,
    advance,
    retreat,
    canEnterRouteIndex,
    requestRouteIndex,
    chooseAction,
    returnToAction,
    advanceTime,
    takeCompanionTurn,
    readBooklionHeadBook,
    bossAction
  });
}
