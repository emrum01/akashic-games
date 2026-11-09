window.AkashicTelemetryRoutes=[{"route":"blessing-alert","gameId":"blessing-alert","mode":"legacy"},{"route":"broken-web","gameId":"broken-web","mode":"legacy"},{"route":"last-stitch","gameId":"last-stitch","mode":"legacy"},{"route":"notification-gale","gameId":"notification-gale","mode":"legacy"},{"route":"still-thread","gameId":"still-thread","mode":"legacy"},{"route":"zoo-escape","gameId":"zoo-escape","mode":"legacy"},{"route":"sic","gameId":"sic","mode":"sic"},{"route":"three-forward-two-back","gameId":"three-forward-two-back","mode":"history"},{"route":"last-bridge","gameId":"nazo-20261102-last-bridge","mode":"react"},{"route":"one-heavy","gameId":"nazo-20261102-one-heavy","mode":"react"},{"route":"long-way","gameId":"nazo-20261102-long-way","mode":"react"},{"route":"two-exits","gameId":"nazo-20261102-two-exits","mode":"react"},{"route":"three-cuts","gameId":"nazo-20261102-nine-points","mode":"react"},{"route":"kobako","gameId":"kobako","mode":"react"},{"route":"three-pictures","gameId":"nazo-20261031-turn-letter","mode":"react"},{"route":"symbol-rule","gameId":"nazo-20261031-shiritori-prototype-3","mode":"react"},{"route":"nine-minutes","gameId":"nazo-20261104-nine-minutes","mode":"sand"},{"route":"weekday-alley","gameId":"nazo-20261107-shared-windows","mode":"review","root":"main[data-work]","board":"main[data-work]"},{"route":"press-all-buttons","gameId":"nazo-20261107-picture-kanji","mode":"review","root":"main[data-work]","board":".type-game"},{"route":"mukaiau","gameId":"nazo-20261107-ordering-sticks","mode":"review","root":"main[data-work]","board":".scan-game"},{"route":"moving-editor","gameId":"nazo-20261107-single-punch","mode":"editor"},{"route":"connected-frames","gameId":"nazo-20261108-03","mode":"review","root":"main[data-work]","board":".frames-game"},{"route":"letter-delivery","gameId":"nazo-20261108-04","mode":"postage"},{"route":"waterway-inspection","gameId":"waterway-inspection","mode":"waterway"},{"route":"ear-scope-reconstruction-lab/methods/micro-cell","gameId":"ear-scope-micro-cell","mode":"micro"},{"route":"games/nazo-20261104-open-interval","gameId":"nazo-20261104-open-interval","mode":"interval"}];
/* Compatibility for retained public games. New source uses semantic hooks.
 * Only explicit public state attributes count as success, never share links or
 * saved clear panels. No answer text, action payloads or DOM text is collected. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.AkashicTelemetry) {
    return;
  }
  const script = document.currentScript;
  const routeKey = script && script.getAttribute("data-game-route");
  const routes = window.AkashicTelemetryRoutes || [];
  const config = routes.find(function (route) {
    return route.route === routeKey;
  });
  if (!config || window.AkashicTelemetryAdapterInstalled) {
    return;
  }
  window.AkashicTelemetryAdapterInstalled = true;
  const telemetry = window.AkashicTelemetry.init({ gameId: config.gameId });
  let previous = null;
  let interacted = false;
  let cleared = false;
  let actions = 0;
  let lastStage = null;
  let lastStep;
  function emit(type, data) {
    if (window.AkashicTelemetrySemanticGame === config.gameId) {
      return;
    }
    try {
      telemetry.track(type, data || {});
    } catch (_) {
      /* never block play */
    }
  }
  function progress(stage, step) {
    if (!interacted || (lastStage === stage && lastStep === step)) {
      return;
    }
    lastStage = stage;
    lastStep = step;
    emit("progress", { stage: stage, step: step });
  }
  function start() {
    if (interacted) {
      return;
    }
    // An actual new play after a completed saved run may follow navigation.
    // Merely opening a saved completion never reaches this function.
    try {
      const saved = telemetry.snapshot && telemetry.snapshot();
      if (saved && (saved.cleared || saved.failed)) {
        emit("reset");
      }
    } catch (_) {
      /* optional */
    }
    interacted = true;
    emit("start", { stage: "playing", step: 0 });
  }
  function restart() {
    if (!interacted) {
      return;
    }
    interacted = true;
    cleared = false;
    actions = 0;
    lastStage = null;
    lastStep = undefined;
    emit("restart", { stage: "playing", step: 0 });
  }
  function reset() {
    // Reset ends the old session; actual gameplay starts the next one.
    interacted = false;
    cleared = false;
    actions = 0;
    lastStage = null;
    lastStep = undefined;
    emit("reset");
  }
  function clear() {
    if (!interacted || cleared) {
      return;
    }
    cleared = true;
    emit("clear");
  }
  function q(selector) {
    return document.querySelector(selector);
  }
  function visible(element) {
    return (
      !!element &&
      !element.hidden &&
      !element.closest("[hidden], [inert], template") &&
      element.getAttribute("aria-hidden") !== "true"
    );
  }
  function attr(element, name) {
    return element && element.getAttribute(name);
  }
  function activeNode(selector) {
    const element = q(selector);
    return visible(element) ? element : null;
  }
  function actionStep(value) {
    return value >= 20 ? 20 : value >= 10 ? 10 : value >= 5 ? 5 : value > 0 ? 1 : 0;
  }
  function resetControl(target) {
    if (!target || typeof target.closest !== "function") {
      return null;
    }
    const selectors = {
      "nine-minutes": "nav.utilities > button:nth-child(2)",
      "weekday-alley": ".weekday-actions > button:last-child",
      mukaiau: ".scan-secondary-controls > button:last-child",
      "games/nazo-20261104-open-interval": "main.same-tools nav > button:last-child",
      "waterway-inspection": ".game-actions > button:last-child",
      "three-forward-two-back": "#titleReturn",
    };
    if (
      config.mode === "editor" &&
      !q(".editor-item.is-armed") &&
      target.closest(".editor-guide-reset")
    ) {
      return target.closest(".editor-guide-reset");
    }
    if (config.mode === "micro") {
      const button = target.closest("#space-actions button");
      if (button && button.textContent.trim() === "最初から") {
        return button;
      }
    }
    const selector = config.mode === "react" ? "#reset, #confirm-reset" : selectors[config.route];
    return target.closest(".completion-retry") || (selector && target.closest(selector));
  }
  function confirmedReset(target) {
    const control = resetControl(target);
    if (!control) {
      return false;
    }
    // This route opens a confirmation instead of resetting an unfinished run.
    if (
      config.route === "long-way" &&
      control.id === "reset" &&
      previous &&
      previous.step > 0 &&
      !previous.won
    ) {
      return false;
    }
    return true;
  }
  function state() {
    let root,
      board,
      won = false,
      stage = "playing",
      step = 0;
    if (config.mode === "react") {
      root = q('#web-game-root[data-hydrated="true"] main.react-game');
      if (!root) {
        return null;
      }
      won = attr(root, "data-won") === "true";
      step = actionStep(Number(attr(root, "data-actions")) || 0);
    } else if (config.mode === "sand") {
      root = q("main[data-game][data-phase]");
      if (!root) {
        return null;
      }
      const phase = attr(root, "data-phase");
      won = phase === "won";
      stage = phase === "ready" ? "ready" : "playing";
      step = actionStep(Number(attr(root, "data-actions")) || 0);
    } else if (config.mode === "review") {
      root = q(config.root);
      if (!root) {
        return null;
      }
      board = root.querySelector(config.board) || (root.matches(config.board) ? root : null);
      // The permanent section can be a restored achievement. Only the new-run
      // clear announcement opens this dialog, after the player has acted.
      won = !!root.querySelector('dialog.completion-dialog[data-kind="clear"][open]');
      if (config.route === "connected-frames" && root.querySelector(".frames-board.is-cleared")) {
        stage = "level-complete";
      }
      if (
        config.route === "mukaiau" &&
        root.querySelector('[data-carrying-key="true"], .scan-key-grip')
      ) {
        stage = "key-found";
      }
      if (config.route === "weekday-alley" && !root.querySelector(".weekday-intro")) {
        stage = "calendar";
      }
    } else if (config.mode === "editor") {
      root = q('section[data-editor-page="true"]');
      won = attr(root, "data-won") === "true";
      step = Number(attr(root, "data-stage")) || 0;
      stage = "stage-" + Math.min(3, Math.max(1, step));
    } else if (config.mode === "postage") {
      root = q("section.postage-game");
      step = Number(attr(root, "data-stage")) || 0;
      stage = "stage-" + Math.min(3, Math.max(1, step));
      won = step === 3 && attr(root, "data-complete") === "true";
    } else if (config.mode === "waterway") {
      root = q("main.inspection");
      won = attr(root, "data-solved") === "true";
    } else if (config.mode === "interval") {
      root = q("main.same-tools");
      won = attr(root, "data-won") === "true";
    } else if (config.mode === "sic") {
      root = q("main") || document.body;
      won = !!activeNode("#overlay.show #modal.good");
      if (activeNode(".quote-link.show")) {
        stage = "quote-found";
      }
    } else if (config.mode === "history") {
      root = q("#app") || document.body;
      won = !!activeNode("#clearStage.is-visible");
      if (activeNode("#puzzlePanel:not(.is-hidden)")) {
        stage = "puzzle";
      }
      if (activeNode("#devicePanel:not(.is-hidden)")) {
        stage = "device";
      }
    } else if (config.mode === "micro") {
      const viewport = q("[data-space-node]");
      root = q("main") || q("#app") || viewport;
      won = attr(viewport, "data-boss-defeated") === "true";
      const node = attr(viewport, "data-space-node");
      if (node && /^[a-z0-9-]{1,40}$/.test(node)) {
        stage = "node-" + node;
      }
    }
    if (!root || !visible(root)) {
      return null;
    }
    return { root: root, board: board || root, won: won, stage: stage, step: step };
  }
  function check() {
    try {
      const current = state();
      if (!current) {
        return;
      }
      // Sand-clock controls have an explicit ready/running transition. Merely
      // touching its board while ready is not a gameplay start.
      if (
        config.mode === "sand" &&
        previous &&
        ((previous.stage === "ready" && current.stage === "playing") ||
          current.step > previous.step)
      ) {
        start();
      }
      // Initial hydration/restored wins establish the baseline only.
      if (previous && current.won && !previous.won) {
        clear();
      }
      if (interacted && !current.won) {
        progress(current.stage, current.step || lastStep || 0);
      }
      previous = current;
    } catch (_) {
      /* malformed/changed DOM produces no fabricated events */
    }
  }
  function interact(event) {
    if (config.mode === "legacy" || config.mode === "sand") {
      return;
    }
    if (
      event.type === "pointerdown" &&
      ((typeof event.button === "number" && event.button !== 0) || event.isPrimary === false)
    ) {
      return;
    }
    if (config.mode === "micro" && event.code === "KeyR") {
      return;
    }
    const current = state();
    const target = event.target;
    if (!current || !target || !current.board.contains(target)) {
      return;
    }
    if (resetControl(target)) {
      return;
    }
    if (
      target.closest(
        'a, summary, nav, [data-telemetry-ignore], .completion-actions, .book-menu, .game-menu, .scan-menu, dialog, [role="dialog"]'
      )
    ) {
      return;
    }
    if (
      !target.closest(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="button"], [role="slider"], [draggable="true"], svg path, svg circle, svg rect, .frames-star-hit, .frames-exit-hit, .weekday-node, .scan-print, .scan-model'
      )
    ) {
      return;
    }
    if (
      event.type === "keydown" &&
      !/^(Enter| |ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Backspace|Delete|[a-zA-Z0-9])$/.test(
        event.key
      )
    ) {
      return;
    }
    // A restored win is not a fresh attempt; an explicit replay will remove it.
    if (current.won) {
      return;
    }
    if (cleared) {
      restart();
    } else {
      start();
    }
    actions += 1;
    if (actions === 1 || actions === 5 || actions === 10 || actions === 20) {
      progress(current.stage, current.step || actionStep(actions));
    }
  }
  // Legacy adapters forward only named milestones, and only allowlisted enums.
  function handleLegacy(detail) {
    if (detail.gameId !== config.gameId) {
      return;
    }
    const name = detail.event,
      p = detail.params || {};
    if (name === "game_reset") {
      reset();
      return;
    }
    if (name === "game_start") {
      if (config.gameId === "zoo-escape" && p.resume) {
        // Legacy zoo emits resume before deciding to reopen a saved ending.
        // Inspect the resulting explicit CLEAR title without sending its text.
        const kicker = q("#title .kicker");
        if (kicker && kicker.textContent.trim() === "CLEAR") {
          return;
        }
        start();
        return;
      }
      if (interacted && !p.resume) {
        restart();
      } else {
        start();
      }
      return;
    }
    if (name === "game_clear") {
      clear();
      return;
    }
    if (/^hint_open(?:_[123])?$/.test(name)) {
      emit("hint");
      return;
    }
    if (name === "wrong_answer") {
      emit("wrong");
      return;
    }
    if (name === "bad_end" || name === "timeout_bad_end") {
      emit("fail");
      return;
    }
    if (
      config.gameId === "last-stitch" &&
      (name === "game_over" || (name === "phase_advance" && p.phase === "bad_end"))
    ) {
      progress("phase-bad-end");
      emit("fail");
      return;
    }
    const milestones = [
      "first_action",
      "controls_revealed",
      "entity_revealed",
      "television_turned_off",
      "fragment_align",
      "stay_proven",
      "main_pull_start",
      "main_pull_settled",
      "stay_begin",
      "meat_delivered",
      "sign_solved",
      "patrol_complete",
      "mic_prompt_shown",
      "mic_granted",
      "mic_denied",
      "first_blow",
      "approve_click",
      "fallback_used",
    ];
    if (milestones.indexOf(name) >= 0) {
      progress(name.replace(/_/g, "-"));
    }
    if (
      name === "phase_advance" &&
      [
        "download",
        "alert",
        "flood",
        "detected",
        "contacted",
        "revealed",
        "intro",
        "playing",
        "unravel",
        "final",
        "room",
        "epilogue",
        "good_end",
        "bad_end",
      ].indexOf(p.phase) >= 0
    ) {
      progress("phase-" + p.phase.replace(/_/g, "-"));
    }
    if (
      name === "unravel_ok" &&
      Number.isInteger(p.order_index) &&
      p.order_index >= 0 &&
      p.order_index <= 20
    ) {
      progress("unravel-" + p.order_index, p.order_index);
    }
    if (
      name === "area_enter" &&
      [
        "central",
        "lion",
        "bird",
        "reptile",
        "zou",
        "saru",
        "penguin",
        "kirin",
        "mizube",
        "exit",
      ].indexOf(p.area_id) >= 0
    ) {
      progress("area-" + p.area_id);
    }
  }
  window.addEventListener("akashic:legacy-game", function (event) {
    // Observe the synchronous UI decision, preserving event order (resume then
    // area-enter) while allowing saved-ending detection before counting start.
    const detail = event.detail || {};
    queueMicrotask(function () {
      handleLegacy(detail);
    });
  });
  if (config.mode === "micro") {
    window.addEventListener("battle:victory", function () {
      clear();
    });
    document.addEventListener(
      "keydown",
      function (event) {
        if (event.code === "KeyR" && !event.target.closest("input, textarea, select")) {
          reset();
        }
      },
      true
    );
  }
  if (config.mode !== "legacy") {
    document.addEventListener(
      "click",
      function (event) {
        const target = event.target;
        if (confirmedReset(target)) {
          reset();
        }
      },
      true
    );
    ["pointerdown", "input", "change", "submit", "keydown"].forEach(function (type) {
      document.addEventListener(type, interact, true);
    });
    document.addEventListener(
      "toggle",
      function (event) {
        const target = event.target;
        if (
          interacted &&
          target &&
          target.open &&
          target.matches("details, dialog.hint-dialog, dialog.scan-hint-dialog")
        ) {
          emit("hint");
        }
      },
      true
    );
    let scheduled = false;
    new MutationObserver(function () {
      if (scheduled) {
        return;
      }
      scheduled = true;
      queueMicrotask(function () {
        scheduled = false;
        check();
      });
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "class",
        "hidden",
        "open",
        "data-hydrated",
        "data-won",
        "data-actions",
        "data-stage",
        "data-phase",
        "data-complete",
        "data-solved",
        "data-space-node",
        "data-boss-defeated",
        "data-carrying-key",
      ],
    });
    check();
  }
})();
