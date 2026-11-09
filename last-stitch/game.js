const completionAttempt = globalThis.AkashicCompletion.createCompletionAttempt("last-stitch");
/*
 * さいごのひとめ (last-stitch) — 描画・入力・演出層
 *
 * 純粋ロジック（ほどき判定・状態機械・条件→候補・ヒント段階・誤順・巻き取り進捗）は logic.js。
 * このファイルは DOM 構築・ポインタ入力の計測・演出・GA4送信という副作用のみを担う。
 * コア判定はユーザーのドラッグ移動量のみで行い、演出由来の移動を混入させない（G-003 / ADR-010）。
 *
 * 表現方針（2026-07-13 全面改修）:
 *  - カードUI全廃。部屋は「夜、ランプの灯る編み物の部屋」の一枚絵（SVG/CSS）＋イラストSVGオブジェクト。
 *  - 8オブジェクトは最初から全て可視（覆い隠し方式=covered は廃止・ADR-013）。
 *  - 手掛かりは用途・形・位置等の異種三条件。積集合から一意候補を推理させる。
 *  - 各オブジェクトから毛糸の糸端(.fray)が垂れる＝引けるサイン。膝掛けの糸端は長く大きく揺れて誘う。
 *  - 正順ほどき＝編み目が縮み消え、糸が糸玉へ走って巻き取られ糸玉が育つ（世界内の進捗・ADR-009）。
 */
(function () {
  "use strict";

  const L = window.LastStitchLogic;
  const analytics = window.AkashicAnalytics || { track: function () {} };
  const SVGNS = "http://www.w3.org/2000/svg";

  const params = new URLSearchParams(location.search);
  const DEBUG = L.parseDebug(params);
  const config = L.parseConfig(params);

  // オブジェクトごとの基本色（見た目の区別用。色は正解根拠にしない）
  const BASE_COLOR = {
    blanket: "#d8b46e",
    scarf: "#e0655f",
    mittens: "#d98a4a",
    socks: "#4f97b0",
    hat: "#7aa863",
    teacosy: "#a877a2",
    cushion: "#c9a94f",
    rug: "#8a7f9c",
  };

  // 各オブジェクトの微回転（deg）。並びは #room グリッド（row-major）で非重複を担保しつつ、
  // 回転で「並べた感」を崩し、部屋に置かれた風合いを出す。位置調整は CSS グリッド側。
  const ROT = {
    blanket: -3,
    scarf: 4,
    mittens: -5,
    socks: 6,
    hat: -4,
    teacosy: 5,
    cushion: -3,
    rug: 3,
  };
  const FURNITURE_VISUAL = {
    blanket: "chair",
    scarf: "portrait",
    mittens: "chest",
    socks: "mirror",
    hat: "clock",
    teacosy: "bookcase",
    cushion: "trunk",
    rug: "door",
  };
  // 背景画（941x1672）に合わせた透明ヒット領域。x/y は左上、w/h はサイズ（%）。
  const HIT_MAP = {
    // room-bg-integrated-v2.png の各家具の見える外郭を実測した値。
    // 背景画と同じ座標系を保ち、クリック層だけに別の補正を加えないこと。
    blanket: { x: 3, y: 52, w: 25, h: 20 }, // chair
    scarf: { x: 45, y: 18, w: 18, h: 13 }, // portrait
    mittens: { x: 77, y: 34, w: 23, h: 32 }, // chest
    socks: { x: 20, y: 42, w: 19, h: 24 }, // mirror
    hat: { x: 38, y: 33, w: 10, h: 15 }, // clock
    teacosy: { x: 0, y: 23, w: 19, h: 45 }, // bookcase
    cushion: { x: 3, y: 72, w: 40, h: 18 }, // trunk
    rug: { x: 51, y: 34, w: 25, h: 33 }, // door
  };

  const el = {
    app: document.getElementById("app"),
    titleScreen: document.getElementById("title-screen"),
    gameScreen: document.getElementById("game-screen"),
    epilogueScreen: document.getElementById("epilogue-screen"),
    clearScreen: document.getElementById("clear-screen"),
    badendScreen: document.getElementById("badend-screen"),
    startButton: document.getElementById("start-button"),
    restartButton: document.getElementById("restart-button"),
    badendRestartButton: document.getElementById("badend-restart-button"),
    pullEdgeButton: document.getElementById("pull-edge-button"),
    shareButton: document.getElementById("share-button"),
    xShareLink: document.getElementById("x-share-link"),
    lpLink: document.getElementById("lp-link"),
    hintWhisper: document.getElementById("hint-whisper"),
    debugPanel: document.getElementById("debug-panel"),
    stage: document.getElementById("stage"),
    room: document.getElementById("room"),
    scissors: document.getElementById("scissors"),
    yarnBall: document.getElementById("yarn-ball"),
    unravelFx: document.getElementById("unravel-fx"),
    connectionFx: document.getElementById("connection-fx"),
    exitThreadTarget: document.getElementById("exit-thread-target"),
    epilogueThread: document.getElementById("epilogue-thread"),
    phaseLabel: document.getElementById("phase-label"),
  };
  el.howToButton = document.getElementById("how-to-button");
  el.howToDialog = document.getElementById("how-to-dialog");
  el.howToClose = document.getElementById("how-to-close");
  el.howToStart = document.getElementById("how-to-start");
  el.furnitureDialog = document.getElementById("furniture-dialog");
  el.furnitureClose = document.getElementById("furniture-close");
  el.furnitureTitle = document.getElementById("furniture-title");
  el.furnitureFlavor = document.getElementById("furniture-flavor");
  el.furnitureThread = document.getElementById("furniture-thread");
  el.pullThreadButton = document.getElementById("pull-thread-button");

  // フレーバーは謎の部品。家具の「記憶の年代」と糸の出口を読ませ、古い順にほどく。
  const FURNITURE_FLAVOR = {
    chair: {
      title: "古い椅子",
      flavor: "扉の綴じ目ができた直後、誰かを待つ形として生まれた。額縁より古い記憶だ。",
      thread: "よく見ると、背もたれ左の継ぎ目から細い糸が出ている。",
    },
    portrait: {
      title: "古い額縁",
      flavor: "椅子の次に飲み込まれた景色。姿見が映す記憶より古い。",
      thread: "額の裏、右下の釘穴から糸が一筋のぞいている。",
    },
    chest: {
      title: "引き出し付きチェスト",
      flavor: "本棚の物語をしまうため、その後に生まれた。時計よりは古い。",
      thread: "一番下の引き出しの取っ手の裏から糸が垂れている。",
    },
    mirror: {
      title: "姿見",
      flavor: "額縁の景色を飲み込んだ後に生まれ、本棚より前からここに立っている。",
      thread: "鏡面の左端、黒い縁の内側から糸が出ている。",
    },
    clock: {
      title: "壁掛け時計",
      flavor: "チェストの後に時を刻み始めた。床のトランクだけが、この時計より新しい。",
      thread: "振り子の根元から糸が伸びている。",
    },
    bookcase: {
      title: "本棚",
      flavor: "姿見の次に、食べた物語を腹の壁へ綴じた。チェストより古い。",
      thread: "最下段の奥、影の切れ目から糸が出ている。",
    },
    trunk: {
      title: "古いトランク",
      flavor: "八つの中で最後に形になった、もっとも新しい記憶だ。",
      thread: "留め金の下から糸が一本だけ逃げている。",
    },
    door: {
      title: "古い扉",
      flavor: "扉に見えるのは、外へ通じる入口ではない。いちばん古い記憶を閉じる、腹の綴じ目だ。",
      thread: "敷居の中央から糸が床の下へ潜っている。",
    },
  };
  let selectedFurnitureId = null;
  const NEXT_CONNECTION = {
    rug: "blanket",
    blanket: "scarf",
    scarf: "socks",
    socks: "teacosy",
    teacosy: "mittens",
    mittens: "hat",
    hat: "cushion",
    cushion: "exit",
  };
  let connectionSource = null;

  let state = L.createInitialState(L.DEFAULT_OBJECTS, config);
  const savedProgress = window.AkashicProgress.readProgress("last-stitch", function (saved) {
    return Boolean(L.restoreProgress(saved, L.DEFAULT_OBJECTS, config));
  });
  if (savedProgress) {
    state = L.restoreProgress(savedProgress, L.DEFAULT_OBJECTS, config) || state;
    if (state.hintLevel > 0) {
      completionAttempt.hint();
    }
  }
  let startedAt = state.phase === "title" ? 0 : performance.now();
  if (savedProgress) {
    saveProgress();
  }

  function saveProgress() {
    window.AkashicProgress.writeProgress("last-stitch", L.serializeProgress(state));
  }
  const solutionOrder = L.deriveSolutionOrder(state.objects);
  // 古さ(0..1): データの age を表示上の褪色へ反映する。
  const ageOf = {};
  (function () {
    const ages = state.objects.map(function (obj) {
      return Number(obj.age) || 0;
    });
    const maxAge = Math.max.apply(Math, ages) || 1;
    state.objects.forEach(function (obj) {
      ageOf[obj.id] = (Number(obj.age) || 0) / maxAge;
    });
  })();

  // 段3で表示する明示テキスト（読ませる文字＝演出をかけない）
  const HINT_TEXT = "新しい層は古い記憶の上にある。最奥の綴じ目から順に緩めて。";

  /* ================================================================
   * オブジェクトのイラストSVG（編み目テクスチャ・褪色ベール・埃つき）
   * ================================================================ */

  // 垂れる糸端（.fray）: 引けるサイン。SVGで実際の毛糸らしく描く
  const FRAY_SVG =
    '<svg viewBox="0 0 40 60" preserveAspectRatio="none">' +
    '<path class="fray-shadow" d="M20 0 C 14 14, 26 26, 18 40 C 13 49, 24 55, 20 60" />' +
    '<path class="fray-core" d="M20 0 C 14 14, 26 26, 18 40 C 13 49, 24 55, 20 60" />' +
    '<path class="fray-fiber" d="M20 0 C 14 14, 26 26, 18 40 C 13 49, 24 55, 20 60" />' +
    '<circle class="fray-tip" cx="20" cy="60" r="2.1" />' +
    "</svg>";

  /* ---------------- 部屋の DOM 構築（1回だけ） ---------------- */
  function buildRoom() {
    el.room.textContent = "";
    // A generated room plate already contains the furniture silhouettes. Keep
    // transparent hit areas and frays active over it.
    el.room.dataset.background = "generated";
    const plate = new Image();
    plate.addEventListener("load", function () {
      el.room.dataset.background = "generated";
    });
    plate.addEventListener("error", function () {
      el.room.dataset.background = "fallback";
    });
    plate.src = "./assets/furniture/room-bg-integrated-v2.png";
    state.objects.forEach(function (obj) {
      const node = document.createElement("div");
      node.className = "knit-object";
      node.dataset.id = obj.id;
      node.setAttribute("aria-label", obj.label);
      node.style.setProperty("--rot", (ROT[obj.id] || 0) + "deg");
      node.style.setProperty("--base", BASE_COLOR[obj.id] || "#caa267");
      node.style.setProperty("--sat", obj.saturation);
      node.style.setProperty("--age", (ageOf[obj.id] != null ? ageOf[obj.id] : 0.5).toFixed(3));
      node.style.setProperty("--settle-ms", config.settleMs + "ms");
      node.style.setProperty("--unravel-ms", config.unravelMs + "ms");
      const hit = HIT_MAP[obj.id] || { x: 45, y: 40, w: 16, h: 16 };
      node.style.setProperty("--hit-x", hit.x + "%");
      node.style.setProperty("--hit-y", hit.y + "%");
      node.style.setProperty("--hit-w", hit.w + "%");
      node.style.setProperty("--hit-h", hit.h + "%");

      // 家具素材は assets/furniture に差し替え可能。未配置時もクリック領域が
      // 消えないよう、暗い家具の簡易シルエットをフォールバック表示する。
      const visualId = FURNITURE_VISUAL[obj.id] || obj.id;
      node.dataset.furniture = visualId;
      node.setAttribute("aria-label", (L.FURNITURE_LABELS || {})[visualId] || obj.label);
      const asset = (L.FURNITURE_ASSETS || {})[visualId];
      if (asset) {
        node.dataset.assetSrc = asset.src;
        node.dataset.assetReveal = asset.reveal;
        node.dataset.assetCollapse = asset.collapse;
      }
      // 家具は一枚の背景画に自然に描き込まれている。ここでは絵を重ねず、
      // 実景上の透明な当たり判定だけを置く（ドラッグ時のみ糸を露出）。
      node.innerHTML = "";
      Array.prototype.forEach.call(node.querySelectorAll(".furniture-asset"), function (img) {
        img.addEventListener("error", function () {
          img.remove();
        });
      });

      const fray = document.createElement("span");
      fray.className = "fray";
      fray.tabIndex = -1;
      fray.setAttribute("role", "button");
      fray.setAttribute("aria-label", "露出した糸口: " + node.getAttribute("aria-label"));
      fray.setAttribute("aria-hidden", "true");
      fray.innerHTML = FRAY_SVG;
      fray.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") {
          return;
        }
        ev.preventDefault();
        keyboardConnect(node.dataset.id);
      });
      node.appendChild(fray);

      el.room.appendChild(node);
    });
    updateYarnBall();
  }

  function nodeById(id) {
    return el.room.querySelector('.knit-object[data-id="' + id + '"]');
  }

  /* ---------------- ドラッグ計測（純度: ユーザー入力のみ） ---------------- */
  let drag = null; // { id, pointerId, start:{x,y}, node }

  function onPointerDown(ev) {
    if (state.phase !== "room") {
      return;
    }
    if (drag) {
      return;
    }
    const node = ev.target.closest(".knit-object");
    if (!node || node.classList.contains("unraveled") || node.classList.contains("unraveling")) {
      return;
    }
    if (ev.target.closest(".fray") && node.classList.contains("reveal")) {
      drag = {
        id: node.dataset.id,
        pointerId: ev.pointerId,
        start: { x: ev.clientX, y: ev.clientY },
        node: node,
      };
      node.classList.add("dragging", "connection-source");
      connectionSource = node.dataset.id;
      resetIdle();
      if (node.setPointerCapture) {
        try {
          node.setPointerCapture(ev.pointerId);
        } catch (_error) {
          /* noop */
        }
      }
      return;
    }
    openFurnitureDialog(node.dataset.id);
    return;
  }

  function furnitureVisualId(id) {
    return FURNITURE_VISUAL[id] || id;
  }
  function openFurnitureDialog(id) {
    const data = FURNITURE_FLAVOR[furnitureVisualId(id)];
    if (!data || !el.furnitureDialog) {
      return;
    }
    selectedFurnitureId = id;
    el.furnitureTitle.textContent = data.title;
    el.furnitureFlavor.textContent = data.flavor;
    el.furnitureThread.textContent = data.thread;
    // closeFurnitureDialog marks the element hidden for the non-modal fallback.
    // Clear it before reopening so subsequent furniture clicks are visible.
    el.furnitureDialog.hidden = false;
    if (typeof el.furnitureDialog.showModal === "function") {
      el.furnitureDialog.showModal();
    }
    analytics.track("furniture_inspected", { object_id: id });
  }
  function closeFurnitureDialog() {
    if (!el.furnitureDialog) {
      return;
    }
    if (el.furnitureDialog.open) {
      el.furnitureDialog.close();
    }
    el.furnitureDialog.hidden = true;
    selectedFurnitureId = null;
  }

  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) {
      return;
    }
    // 糸端が指へ引かれ張力がかかる表現（--pull 0..1）。判定には使わない（G-003）
    const dist = L.dragDistance(drag.start, { x: ev.clientX, y: ev.clientY });
    const pull = Math.min(dist, config.drag) / config.drag;
    drag.node.style.setProperty("--pull", pull.toFixed(3));
    updateLiveConnection(drag.node, ev.clientX, ev.clientY);
  }

  function endDrag() {
    if (drag && drag.node) {
      drag.node.classList.remove("dragging");
      drag.node.style.setProperty("--pull", "0");
    }
    const live = el.connectionFx && el.connectionFx.querySelector(".connection-live");
    if (live) {
      live.remove();
    }
    drag = null;
  }

  function restoreExposedOutlet(id, focusOutlet) {
    const node = nodeById(id);
    if (!node || node.classList.contains("unraveled")) {
      return;
    }
    node.classList.add("reveal");
    node.classList.remove("dragging", "connection-source");
    node.style.setProperty("--pull", "0");
    const fray = node.querySelector(".fray");
    if (fray) {
      fray.tabIndex = 0;
      fray.setAttribute("aria-hidden", "false");
      if (focusOutlet) {
        window.setTimeout(function () {
          fray.focus();
        }, 0);
      }
    }
  }

  function onPointerUp(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) {
      return;
    }
    const sourceId = drag.id;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const targetNode = hit && hit.closest ? hit.closest(".knit-object") : null;
    const targetId = targetNode
      ? targetNode.dataset.id
      : hit && hit.closest && hit.closest("#exit-thread-target")
        ? "exit"
        : null;
    endDrag();
    document.querySelectorAll(".connection-source").forEach(function (n) {
      n.classList.remove("connection-source");
    });
    connectionSource = null;
    if (
      sourceId === L.nextExpectedId(state.objects, state.unraveled) &&
      targetId === NEXT_CONNECTION[sourceId]
    ) {
      acceptConnection(sourceId, targetId);
    } else {
      rejectConnection(sourceId, targetId);
    }
  }

  function acceptConnection(sourceId, targetId) {
    drawPermanentConnection(sourceId, targetId);
    dispatch({ type: "UNRAVEL", targetId: sourceId });
  }

  function rejectConnection(sourceId, targetId) {
    showHint(
      targetId
        ? "新しい層を先に引き、下の記憶が締まった。古い綴じ目からつないで。"
        : "糸の先を、次の層の糸口までつないで。 "
    );
    dispatch({ type: "CONNECTION_WRONG", targetId: sourceId });
    if (state.phase === "room") {
      restoreExposedOutlet(sourceId, true);
    }
  }

  function updateLiveConnection(sourceNode, clientX, clientY) {
    if (!el.connectionFx || !el.stage || !sourceNode) {
      return;
    }
    const old = el.connectionFx.querySelector(".connection-live");
    if (old) {
      old.remove();
    }
    const stageRect = el.stage.getBoundingClientRect();
    const from = centerPct(sourceNode.querySelector(".fray").getBoundingClientRect(), stageRect);
    const to = {
      x: ((clientX - stageRect.left) / stageRect.width) * 100,
      y: ((clientY - stageRect.top) / stageRect.height) * 100,
    };
    appendYarnPath("connection-live", from, to);
  }

  function drawPermanentConnection(sourceId, targetId) {
    if (!el.connectionFx || !el.stage) {
      return;
    }
    const fromNode = nodeById(sourceId);
    const toNode = targetId === "exit" ? el.exitThreadTarget : nodeById(targetId);
    if (!fromNode || !toNode) {
      return;
    }
    const stageRect = el.stage.getBoundingClientRect();
    const from = centerPct(fromNode.querySelector(".fray").getBoundingClientRect(), stageRect);
    const toRect =
      targetId === "exit"
        ? toNode.getBoundingClientRect()
        : toNode.querySelector(".fray").getBoundingClientRect();
    const to = centerPct(toRect, stageRect);
    appendYarnPath("connection-fixed", from, to);
  }

  function appendYarnPath(className, from, to) {
    const group = document.createElementNS(SVGNS, "g");
    group.setAttribute("class", className);
    const dx = to.x - from.x;
    const sag = Math.min(9, 3 + Math.abs(dx) * 0.055);
    const d =
      "M" +
      from.x +
      " " +
      from.y +
      " C" +
      (from.x + dx * 0.28) +
      " " +
      (from.y + sag) +
      " " +
      (from.x + dx * 0.72) +
      " " +
      (to.y + sag) +
      " " +
      to.x +
      " " +
      to.y;
    ["yarn-shadow", "yarn-core", "yarn-fiber"].forEach(function (kind) {
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("class", kind);
      path.setAttribute("d", d);
      group.appendChild(path);
    });
    el.connectionFx.appendChild(group);
  }

  function keyboardConnect(targetId) {
    if (!connectionSource) {
      const sourceNode = nodeById(targetId);
      if (!sourceNode || !sourceNode.classList.contains("reveal")) {
        return;
      }
      connectionSource = targetId;
      sourceNode.classList.add("connection-source");
      showHint("接続先の糸口を選んで。 ");
      return;
    }
    const sourceId = connectionSource;
    const source = nodeById(sourceId);
    if (source) {
      source.classList.remove("connection-source");
    }
    connectionSource = null;
    if (
      sourceId === L.nextExpectedId(state.objects, state.unraveled) &&
      targetId === NEXT_CONNECTION[sourceId]
    ) {
      acceptConnection(sourceId, targetId);
    } else {
      rejectConnection(sourceId, targetId);
    }
  }

  /* ---------------- ディスパッチ（reduce → 副作用） ---------------- */
  function dispatch(action) {
    const prev = state;
    state = L.reduce(state, action);
    handleEvent(prev, state, action);
    saveProgress();
    render();
    updateDebug();
  }

  function handleEvent(prev, next, action) {
    switch (next.lastEvent) {
      case "start":
        startedAt = performance.now();
        analytics.track("game_start");
        analytics.track("phase_advance", { phase: "room" });
        resetIdle();
        window.setTimeout(function () {
          openHowTo(true);
        }, 0);
        break;
      case "unravel-ok":
        onUnravelOk(prev, next);
        break;
      case "unravel-wrong":
        onUnravelWrong(next, action ? action.targetId : null, action ? action.type : null);
        break;
      case "temper-badend":
        onUnravelWrong(next, action ? action.targetId : null, action ? action.type : null);
        goBadEnd("temper");
        break;
      case "complete":
        onUnravelOk(prev, next); // 最後の1個のほどき演出
        renderEpilogue(); // 含み文（#epilogue-thread）は即時確定。見せ場の書き順アニメは CSS
        analytics.track("phase_advance", { phase: "epilogue" });
        break;
      case "scissor-flee":
        flashScissors();
        analytics.track("scissors_used", { count: next.scissorCount });
        break;
      case "scissor-badend":
        analytics.track("scissors_used", { count: next.scissorCount });
        goBadEnd();
        break;
      case "edge-release":
        goGoodEnd();
        break;
      default:
        break;
    }
  }

  function orderIndexOf(id) {
    return solutionOrder.indexOf(id);
  }

  function onUnravelOk(prev, next) {
    resetIdle();
    const added = next.unraveled[next.unraveled.length - 1];
    const node = nodeById(added);
    if (node) {
      runYarnToBall(node); // 糸が糸玉へ走って巻き取られる
      node.classList.remove("reveal");
      node.classList.add("unraveling", "collapse");
      const connectedFray = node.querySelector(".fray");
      if (connectedFray) {
        connectedFray.tabIndex = -1;
        connectedFray.setAttribute("aria-hidden", "true");
      }
      window.setTimeout(function () {
        node.classList.remove("unraveling");
        node.classList.add("unraveled");
      }, config.unravelMs);
    }
    updateYarnBall(); // 糸玉が育つ（世界内の進捗）
    el.stage.style.setProperty(
      "--loosen-progress",
      String(next.unraveled.length / solutionOrder.length)
    );
    el.stage.classList.remove("layer-loosen");
    void el.stage.offsetWidth;
    el.stage.classList.add("layer-loosen");
    analytics.track("unravel_ok", { object_id: added, order_index: orderIndexOf(added) });
  }

  // 糸玉のスケール段（ほどいた数/全数の巻き取り進捗）
  function updateYarnBall() {
    if (!el.yarnBall) {
      return;
    }
    const p = L.windProgress(state.unraveled.length, solutionOrder.length);
    el.yarnBall.style.setProperty("--ball", (0.42 + p * 0.78).toFixed(3));
  }

  // 対象中心から糸玉中心へ「糸の線が走って巻き取られる」線を unravel-fx に描く
  function runYarnToBall(node) {
    if (!el.unravelFx || !el.stage) {
      return;
    }
    const stageRect = el.stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) {
      return;
    }
    const from = centerPct(node.getBoundingClientRect(), stageRect);
    const ballRect = el.yarnBall ? el.yarnBall.getBoundingClientRect() : null;
    const to = ballRect ? centerPct(ballRect, stageRect) : { x: 12, y: 62 };
    const midx = (from.x + to.x) / 2 + (from.x < to.x ? -10 : 10);
    const midy = Math.min(from.y, to.y) - 12;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute(
      "d",
      "M" + from.x + " " + from.y + " Q" + midx + " " + midy + " " + to.x + " " + to.y
    );
    el.unravelFx.appendChild(path);
    const len = path.getTotalLength ? path.getTotalLength() : 200;
    const ms = Math.max(400, config.unravelMs * 0.9);
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    // reflow で初期状態を確定してから遷移
    void path.getBoundingClientRect();
    path.style.transition =
      "stroke-dashoffset " +
      ms +
      "ms cubic-bezier(.4,0,.4,1), opacity 260ms ease " +
      (ms - 160) +
      "ms";
    path.style.strokeDashoffset = "0";
    path.style.opacity = "0";
    window.setTimeout(function () {
      if (path.parentNode) {
        path.parentNode.removeChild(path);
      }
    }, ms + 400);
  }

  function centerPct(rect, stageRect) {
    return {
      x: ((rect.left + rect.width / 2 - stageRect.left) / stageRect.width) * 100,
      y: ((rect.top + rect.height / 2 - stageRect.top) / stageRect.height) * 100,
    };
  }

  function onUnravelWrong(next, targetId, actionType) {
    resetIdle();
    const node = targetId ? nodeById(targetId) : null;
    if (node) {
      node.classList.remove("settle");
      if (actionType !== "CONNECTION_WRONG") {
        node.classList.remove("reveal");
      }
      void node.offsetWidth;
      node.classList.add("settle");
    }
    analytics.track("unravel_wrong", { object_id: targetId || "", wrong_count: next.wrongCount });
    applyHints(next.hintLevel);
    el.app.classList.remove("player-threat");
    void el.app.offsetWidth;
    el.app.classList.add("player-threat");
    window.setTimeout(function () {
      el.app.classList.remove("player-threat");
    }, 1200);
  }

  /* ---------------- ヒント段階の描画（後出し・先出し禁止 — ADR-003 / G-002） ---------------- */
  function applyHints(level) {
    if (level >= 1) {
      completionAttempt.hint();
    }
    clearHintSway();
    if (level >= 1) {
      const nextId = L.nextExpectedId(state.objects, state.unraveled);
      const swayNode = nextId ? nodeById(nextId) : null;
      if (swayNode) {
        swayNode.classList.add("hint-sway");
      }
    }
    el.room.classList.toggle("hint-emphasize", level >= 2);
    if (level >= 3) {
      showHint(HINT_TEXT);
    }
    if (level >= 1) {
      analytics.track("hint_opened", { hint_level: level });
    }
  }

  function clearHintSway() {
    const swayed = el.room.querySelectorAll(".knit-object.hint-sway");
    Array.prototype.forEach.call(swayed, function (n) {
      n.classList.remove("hint-sway");
    });
  }

  let hintTimer = null;
  function showHint(text) {
    if (!el.hintWhisper) {
      return;
    }
    if (!text) {
      el.hintWhisper.classList.remove("show");
      return;
    }
    el.hintWhisper.textContent = text;
    el.hintWhisper.classList.add("show");
    if (hintTimer) {
      clearTimeout(hintTimer);
    }
    hintTimer = window.setTimeout(function () {
      el.hintWhisper.classList.remove("show");
    }, 5200);
  }

  /* ---------------- 無操作12/24/40秒: 観察→方向比較→候補絞り込み ---------------- */
  let idleTimers = [];
  function resetIdle() {
    idleTimers.forEach(clearTimeout);
    idleTimers = [
      window.setTimeout(function () {
        if (state.phase === "room") {
          completionAttempt.hint();
          showHint("家具の説明だけでなく、露出した糸口を観察して。");
        }
      }, 12000),
      window.setTimeout(function () {
        if (state.phase === "room") {
          completionAttempt.hint();
          showHint("糸口が向く方向と、隣の家具の糸口を比べて。");
        }
      }, 24000),
      window.setTimeout(function () {
        if (state.phase === "room") {
          completionAttempt.hint();
          showHint("古い記憶から順に、一本の線が途切れない組を探して。");
        }
      }, 40000),
    ];
  }

  /* ---------------- ハサミ / 縁の糸端 ---------------- */
  function flashScissors() {
    el.scissors.classList.remove("flee");
    void el.scissors.offsetWidth;
    el.scissors.classList.add("flee");
  }

  /* ---------------- 画面遷移 / END ---------------- */
  function render() {
    el.app.dataset.phase = state.phase;
    el.titleScreen.hidden = state.phase !== "title";
    el.gameScreen.hidden = !(state.phase === "room" || state.phase === "epilogue");
    el.epilogueScreen.hidden = state.phase !== "epilogue";
    el.clearScreen.hidden = state.phase !== "goodEnd";
    if (state.phase === "goodEnd") {
      updateXShareLink();
    }
    el.badendScreen.hidden = state.phase !== "badEnd";
    el.scissors.hidden = !(state.phase === "room" || state.phase === "epilogue");
    if (el.phaseLabel) {
      el.phaseLabel.textContent = state.phase === "epilogue" ? "出口がひらく" : "イトヌシの体内";
    }
    const pips = document.querySelectorAll(".temper i");
    Array.prototype.forEach.call(pips, function (pip, i) {
      pip.classList.toggle("lost", i < state.wrongCount);
    });
    // 進行は家具ダイアログと画面反応で伝える。旧経路図UIは廃止。
  }

  function renderEpilogue() {
    // 床の糸文字エピローグ（GOOD側の見せ場）。オチは含みに留める（G-008: 本文に結論を書かない）。
    // 見せ場は thread-svg の書き順アニメ、#epilogue-thread は読ませる含み文（E2E/a11y）。
    el.epilogueThread.textContent =
      "最奥から外した八つの層は、一本の脱出糸になった。腹の壁がゆるみ、夜の空気が流れ込む。";
  }

  function goGoodEnd() {
    completionAttempt.complete();
    const elapsedSec = Math.round((performance.now() - startedAt) / 1000);
    document.getElementById("clear-detail").textContent = elapsedSec + " 秒でほどいた";
    el.app.classList.add("to-white");
    analytics.track("phase_advance", { phase: "good_end" });
    analytics.track("game_clear", { elapsed_sec: elapsedSec });
  }

  function buildTangle() {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "tangle-fx");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    // 編み目が絡まる見た目のもつれ（GOODの糸描画と対称の糸演出）
    const ds = [
      "M20 30 C 45 10, 70 50, 45 60 C 25 68, 60 80, 80 62",
      "M15 55 C 40 40, 55 75, 78 48 C 90 34, 60 30, 42 46",
      "M30 72 C 50 55, 68 78, 82 66 C 62 90, 40 88, 22 70",
    ];
    ds.forEach(function (d) {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    el.app.appendChild(svg);
  }

  function goBadEnd(reason) {
    endDrag();
    el.app.classList.add("to-dark");
    analytics.track("phase_advance", { phase: "bad_end" });
    analytics.track("game_over", { reason: reason || "scissors" });
    window.setTimeout(function () {
      el.gameScreen.hidden = true;
      el.badendScreen.hidden = false;
    }, 1500);
  }

  /* ---------------- 遊び方ダイアログ ---------------- */
  let howToReturnFocus = null;

  function openHowTo(isFirstOpen) {
    if (!el.howToDialog || typeof el.howToDialog.showModal !== "function" || el.howToDialog.open) {
      return;
    }
    howToReturnFocus = isFirstOpen ? null : document.activeElement;
    idleTimers.forEach(clearTimeout);
    el.howToDialog.showModal();
    // showModal のフォーカストラップに加え、主要操作へ明示的に着地させる。
    if (el.howToStart) {
      el.howToStart.focus();
    }
    analytics.track("how_to_opened", { first_open: Boolean(isFirstOpen) });
  }

  function restoreAfterHowTo() {
    resetIdle();
    if (howToReturnFocus && typeof howToReturnFocus.focus === "function") {
      howToReturnFocus.focus();
    }
    howToReturnFocus = null;
  }

  function closeHowTo() {
    if (!el.howToDialog || !el.howToDialog.open) {
      return;
    }
    el.howToDialog.close();
    restoreAfterHowTo();
  }

  /* ---------------- 入力ハンドラ登録 ---------------- */
  if (el.startButton) {
    el.startButton.addEventListener("click", function () {
      dispatch({ type: "START" });
    });
  }
  function restartGame() {
    completionAttempt.reset();
    window.AkashicProgress.removeProgress("last-stitch");
    location.reload();
  }
  if (el.restartButton) {
    el.restartButton.addEventListener("click", restartGame);
  }
  if (el.badendRestartButton) {
    el.badendRestartButton.addEventListener("click", restartGame);
  }
  if (el.pullEdgeButton) {
    el.pullEdgeButton.addEventListener("click", function () {
      dispatch({ type: "PULL_EDGE" });
    });
  }
  if (el.scissors) {
    el.scissors.addEventListener("click", function () {
      dispatch({ type: "USE_SCISSORS" });
    });
  }
  if (el.shareButton) {
    el.shareButton.addEventListener("click", shareResult);
  }
  if (el.howToButton) {
    el.howToButton.addEventListener("click", function () {
      openHowTo(false);
    });
  }
  if (el.howToClose) {
    el.howToClose.addEventListener("click", closeHowTo);
  }
  if (el.howToStart) {
    el.howToStart.addEventListener("click", closeHowTo);
  }
  if (el.furnitureClose) {
    el.furnitureClose.addEventListener("click", closeFurnitureDialog);
  }
  if (el.pullThreadButton) {
    el.pullThreadButton.addEventListener("click", function () {
      if (!selectedFurnitureId) {
        return;
      }
      const id = selectedFurnitureId;
      closeFurnitureDialog();
      const node = nodeById(id);
      if (node) {
        dispatch({ type: "EXPOSE_THREAD", targetId: id });
        restoreExposedOutlet(id, true);
      }
    });
  }
  if (el.exitThreadTarget) {
    el.exitThreadTarget.addEventListener("click", function () {
      if (connectionSource) {
        keyboardConnect("exit");
      }
    });
  }
  if (el.furnitureDialog) {
    el.furnitureDialog.addEventListener("cancel", function () {
      selectedFurnitureId = null;
    });
  }
  if (el.howToDialog) {
    el.howToDialog.addEventListener("cancel", function () {
      // Escape で閉じる場合、ブラウザの既定処理後にタイマーとフォーカスを戻す。
      window.setTimeout(restoreAfterHowTo, 0);
    });
  }
  if (el.lpLink) {
    el.lpLink.addEventListener("click", function () {
      analytics.track("lp_click", { link_target: el.lpLink.href });
    });
  }
  el.room.addEventListener("pointerdown", onPointerDown);
  el.room.addEventListener("pointermove", onPointerMove);
  el.room.addEventListener("pointerup", onPointerUp);
  el.room.addEventListener("pointercancel", function (ev) {
    if (drag && ev.pointerId !== drag.pointerId) {
      return;
    }
    const cancelledId = drag ? drag.id : connectionSource;
    endDrag();
    connectionSource = null;
    if (cancelledId) {
      restoreExposedOutlet(cancelledId, false);
    }
  });

  function shareResult() {
    const { text, url } = shareDetails();
    if (navigator.share) {
      navigator
        .share({
          title: "さいごのひとめ",
          text: globalThis.AkashicCompletion.formatShareText(text, url),
        })
        .catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(globalThis.AkashicCompletion.formatShareText(text, url))
        .then(function () {
          el.shareButton.textContent = "コピーしました";
          setTimeout(function () {
            el.shareButton.textContent = "結果をシェア";
          }, 1800);
        })
        .catch(function () {});
    } else {
      window.open(globalThis.AkashicCompletion.createShareIntent(text, url), "_blank");
    }
    analytics.track("share_click", {
      share_type: navigator.share ? "web_share" : "clipboard_or_intent",
    });
  }

  function shareDetails() {
    return {
      text:
        "「さいごのひとめ」をほどいた。" +
        (completionAttempt.noHints ? "\nノーヒントでクリアしました！" : ""),
      url: "https://games.escape-safari.com/last-stitch/",
    };
  }

  function updateXShareLink() {
    const { text, url } = shareDetails();
    el.xShareLink.href = globalThis.AkashicCompletion.createShareIntent(text, url);
  }

  /* ---------------- X アプリ内ブラウザ対応: --vvh 追従＋高さゲート ---------------- */
  function applyViewport() {
    const vv = window.visualViewport;
    const visH = Math.max(1, Math.round(vv ? vv.height : window.innerHeight || 0));
    const root = document.documentElement;
    root.style.setProperty("--vvh", visH + "px");
    root.classList.toggle("vvh-short", visH <= 640);
    root.classList.toggle("vvh-tiny", visH <= 520);
  }
  window.addEventListener("resize", applyViewport);
  window.addEventListener("orientationchange", applyViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", applyViewport);
    window.visualViewport.addEventListener("scroll", applyViewport);
  }

  /* ---------------- 検証用フック（?debug=1 のときだけ状態を公開） ---------------- */
  function updateDebug() {
    if (!DEBUG) {
      return;
    }
    window["__GAME_STATE__"] = {
      phase: state.phase,
      unraveled: state.unraveled.slice(),
      wrongCount: state.wrongCount,
      hintLevel: state.hintLevel,
      scissorCount: state.scissorCount,
      nextExpected: L.nextExpectedId(state.objects, state.unraveled),
      lastEvent: state.lastEvent,
    };
    if (!el.debugPanel) {
      return;
    }
    el.debugPanel.hidden = false;
    el.debugPanel.textContent =
      "phase: " +
      state.phase +
      "\nunraveled: " +
      state.unraveled.join(",") +
      "\nnext: " +
      window["__GAME_STATE__"].nextExpected +
      "\nwrong: " +
      state.wrongCount +
      " hint: " +
      state.hintLevel +
      "\nscissors: " +
      state.scissorCount +
      "/" +
      config.scissors;
  }

  /* ---------------- 初期化 ---------------- */
  buildRoom();
  if (savedProgress) {
    state.unraveled.forEach(function (id) {
      const node = nodeById(id);
      if (node) {
        node.classList.add("unraveled");
      }
    });
    state.exposed.forEach(function (id) {
      restoreExposedOutlet(id, false);
    });
    updateYarnBall();
    if (state.phase === "epilogue") {
      renderEpilogue();
    }
    if (state.hintLevel > 0) {
      applyHints(state.hintLevel);
    }
  }
  buildTangle();
  render();
  applyViewport();
  updateDebug();
  if (DEBUG) {
    console.log("[last-stitch] config", config, "order", solutionOrder);
  }
})();
