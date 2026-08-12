const QUESTIONS = Object.freeze({
  identity: Object.freeze({
    label: "あなたは誰ですか",
    answer: "おばあさん「名前は置いてきたよ。ここへ入るには重すぎたからねえ。」\nあなた「本当に忘れたの？」\nおばあさん「忘れた人の手つきだけ借りたの。世話をする手は名前がなくても動くでしょう。」"
  }),
  reason: Object.freeze({
    label: "何を待っているの？",
    answer: "おばあさん「窓の向こうで、白い廊下が口を開けるのを。」\nあなた「ここは家じゃない？」\nおばあさん「待つ場所には家の形が要るのよ。本当の壁なら、同じ縫い目へ戻らない。」"
  }),
  place: Object.freeze({
    label: "この編み糸は何？",
    answer: "おばあさん「ほどけた名前を結ぶ糸。強く引くと切れるから、脳塊へ続く細いものだけ束ねるの。」"
  })
});

const GRANDMA_TURNS = Object.freeze([
  "おばあさんは編み物の目を数えている。",
  "おばあさんは老眼鏡を探している。",
  "おばあさんは膝掛けの皺を直している。"
]);

const BATTLE_RESULTS = Object.freeze({
  surface: "耳かきで表面をなぞった。薄い筋が一本ついた。",
  edge: "耳かきで端を起こした。塊の縁が少し浮いた。",
  loosen: "耳かきでもう少しほぐした。塊の端がさらにほどけた。",
  tweezers: "おばあさんの姿がほどけ、琥珀の編み糸がソファに残った。編み糸は脳塊へ続く細いものだけを束ねられる。"
});

export const GRANDMA_COPY = Object.freeze({
  recruit: "おばあさんは見守り役として同行した。ソファには琥珀の編み糸が残った。",
  questions: QUESTIONS,
  grandmaTurns: GRANDMA_TURNS,
  battleResults: BATTLE_RESULTS
});

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function freshState() {
  return {
    screen: "hidden",
    message: null,
    answerId: null,
    encounterResolved: false,
    grandmaRecruited: false,
    pathUnlocked: false,
    spriteVisible: false,
    earwaxVisible: false,
    battleStage: 0,
    nextBattleStage: 0,
    grandmaTurnIndex: 0,
    companionTurnIndex: 0
  };
}

export function createGrandmaEncounter({ onChange = () => {}, onCompanionTurn = () => {} } = {}) {
  let state = freshState();

  const snapshot = () => freeze({ ...state });
  const commit = (patch) => {
    state = { ...state, ...patch };
    const next = snapshot();
    onChange(next);
    return next;
  };

  function reset() {
    state = freshState();
    const next = snapshot();
    onChange(next);
    return next;
  }

  function open() {
    if (state.encounterResolved) {
      return commit({ screen: "hidden", message: null, spriteVisible: false, earwaxVisible: false });
    }
    return commit({ screen: "action", message: null, answerId: null, spriteVisible: true, earwaxVisible: false });
  }

  function hide() {
    return commit({ screen: "hidden", message: null, answerId: null, spriteVisible: false, earwaxVisible: false });
  }

  function chooseAction(action) {
    if (state.encounterResolved) return snapshot();
    if (action === "talk") {
      return commit({ screen: "questions", message: null, answerId: null, spriteVisible: true });
    }
    if (action === "recruit") {
      return commit({
        screen: "recruit-result",
        message: GRANDMA_COPY.recruit,
        encounterResolved: true,
        grandmaRecruited: true,
        pathUnlocked: true,
        spriteVisible: false,
        earwaxVisible: false
      });
    }
    if (action === "battle") {
      return commit({
        screen: "battle-player",
        message: null,
        battleStage: 0,
        nextBattleStage: 0,
        grandmaTurnIndex: 0,
        spriteVisible: true,
        earwaxVisible: false
      });
    }
    if (action === "none") return hide();
    return snapshot();
  }

  function chooseQuestion(questionId) {
    if (questionId === "stop") return commit({ screen: "action", message: null, answerId: null });
    const question = QUESTIONS[questionId];
    if (!question || state.screen !== "questions") return snapshot();
    return commit({ screen: "answer", answerId: questionId, message: question.answer });
  }

  function questions() {
    if (state.screen !== "answer") return snapshot();
    return commit({ screen: "questions", message: null, answerId: null });
  }

  function quitBattle() {
    if (!state.screen.startsWith("battle-")) return snapshot();
    return commit({
      screen: "action",
      message: null,
      battleStage: 0,
      nextBattleStage: 0,
      grandmaTurnIndex: 0,
      spriteVisible: true,
      earwaxVisible: false
    });
  }

  function battleAction(action) {
    if (state.screen !== "battle-player") return snapshot();
    if (action === "quit") return quitBattle();
    if (state.battleStage === 0 && action === "surface") {
      return commit({ screen: "battle-result", message: BATTLE_RESULTS.surface, nextBattleStage: 1 });
    }
    if (state.battleStage === 1 && action === "edge") {
      return commit({ screen: "battle-result", message: BATTLE_RESULTS.edge, nextBattleStage: 2 });
    }
    if (state.battleStage === 2 && action === "loosen") {
      return commit({ screen: "battle-result", message: BATTLE_RESULTS.loosen, nextBattleStage: 2 });
    }
    if (state.battleStage === 2 && action === "tweezers") {
      return commit({
        screen: "victory",
        message: BATTLE_RESULTS.tweezers,
        encounterResolved: true,
        grandmaRecruited: false,
        pathUnlocked: true,
        spriteVisible: false,
        earwaxVisible: true
      });
    }
    return snapshot();
  }

  function advanceBattle() {
    if (state.screen !== "battle-result") return snapshot();
    const message = GRANDMA_TURNS[state.grandmaTurnIndex % GRANDMA_TURNS.length];
    return commit({
      screen: "battle-grandma",
      message,
      grandmaTurnIndex: state.grandmaTurnIndex + 1
    });
  }

  function continueBattle() {
    if (state.screen !== "battle-grandma") return snapshot();
    return commit({ screen: "battle-player", message: null, battleStage: state.nextBattleStage });
  }

  function back() {
    if (state.screen === "answer") return questions();
    if (state.screen === "questions") return commit({ screen: "action", message: null, answerId: null });
    if (state.screen.startsWith("battle-")) return quitBattle();
    return snapshot();
  }

  function takeCompanionTurn() {
    if (!state.grandmaRecruited) return null;
    const action = GRANDMA_TURNS[state.companionTurnIndex % GRANDMA_TURNS.length];
    state = { ...state, companionTurnIndex: state.companionTurnIndex + 1 };
    onCompanionTurn(action, snapshot());
    return action;
  }

  return freeze({
    getState: snapshot,
    reset,
    open,
    hide,
    chooseAction,
    chooseQuestion,
    questions,
    battleAction,
    advanceBattle,
    continueBattle,
    quitBattle,
    back,
    takeCompanionTurn
  });
}
