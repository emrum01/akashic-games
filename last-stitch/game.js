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

  var L = window.LastStitchLogic;
  var analytics = window.AkashicAnalytics || { track: function () {} };
  var SVGNS = "http://www.w3.org/2000/svg";

  var params = new URLSearchParams(location.search);
  var DEBUG = L.parseDebug(params);
  var config = L.parseConfig(params);

  // オブジェクトごとの基本色（見た目の区別用。色は正解根拠にしない）
  var BASE_COLOR = {
    blanket: "#d8b46e",
    scarf: "#e0655f",
    mittens: "#d98a4a",
    socks: "#4f97b0",
    hat: "#7aa863",
    teacosy: "#a877a2",
    cushion: "#c9a94f",
    rug: "#8a7f9c"
  };

  // 各オブジェクトの微回転（deg）。並びは #room グリッド（row-major）で非重複を担保しつつ、
  // 回転で「並べた感」を崩し、部屋に置かれた風合いを出す。位置調整は CSS グリッド側。
  var ROT = {
    blanket: -3, scarf: 4, mittens: -5, socks: 6,
    hat: -4, teacosy: 5, cushion: -3, rug: 3
  };
  var FURNITURE_VISUAL = { blanket:"chair", scarf:"portrait", mittens:"chest", socks:"mirror", hat:"clock", teacosy:"bookcase", cushion:"trunk", rug:"door" };
  // 背景画（941x1672）に合わせた透明ヒット領域。x/y は左上、w/h はサイズ（%）。
  var HIT_MAP = {
    // room-bg-integrated-v2.png の各家具の見える外郭を実測した値。
    // 背景画と同じ座標系を保ち、クリック層だけに別の補正を加えないこと。
    blanket:{x:3,y:52,w:25,h:20},       // chair
    scarf:{x:45,y:18,w:18,h:13},        // portrait
    mittens:{x:77,y:34,w:23,h:32},      // chest
    socks:{x:20,y:42,w:19,h:24},        // mirror
    hat:{x:38,y:33,w:10,h:15},          // clock
    teacosy:{x:0,y:23,w:19,h:45},       // bookcase
    cushion:{x:3,y:72,w:40,h:18},       // trunk
    rug:{x:51,y:34,w:25,h:33}           // door
  };

  var el = {
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
    phaseLabel: document.getElementById("phase-label")
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
  var FURNITURE_FLAVOR = {
    chair:{title:"古い椅子", flavor:"扉の綴じ目ができた直後、誰かを待つ形として生まれた。額縁より古い記憶だ。", thread:"よく見ると、背もたれ左の継ぎ目から細い糸が出ている。"},
    portrait:{title:"古い額縁", flavor:"椅子の次に飲み込まれた景色。姿見が映す記憶より古い。", thread:"額の裏、右下の釘穴から糸が一筋のぞいている。"},
    chest:{title:"引き出し付きチェスト", flavor:"本棚の物語をしまうため、その後に生まれた。時計よりは古い。", thread:"一番下の引き出しの取っ手の裏から糸が垂れている。"},
    mirror:{title:"姿見", flavor:"額縁の景色を飲み込んだ後に生まれ、本棚より前からここに立っている。", thread:"鏡面の左端、黒い縁の内側から糸が出ている。"},
    clock:{title:"壁掛け時計", flavor:"チェストの後に時を刻み始めた。床のトランクだけが、この時計より新しい。", thread:"振り子の根元から糸が伸びている。"},
    bookcase:{title:"本棚", flavor:"姿見の次に、食べた物語を腹の壁へ綴じた。チェストより古い。", thread:"最下段の奥、影の切れ目から糸が出ている。"},
    trunk:{title:"古いトランク", flavor:"八つの中で最後に形になった、もっとも新しい記憶だ。", thread:"留め金の下から糸が一本だけ逃げている。"},
    door:{title:"古い扉", flavor:"扉に見えるのは、外へ通じる入口ではない。いちばん古い記憶を閉じる、腹の綴じ目だ。", thread:"敷居の中央から糸が床の下へ潜っている。"}
  };
  var selectedFurnitureId = null;
  var NEXT_CONNECTION = { rug:"blanket", blanket:"scarf", scarf:"socks", socks:"teacosy", teacosy:"mittens", mittens:"hat", hat:"cushion", cushion:"exit" };
  var connectionSource = null;

  var state = L.createInitialState(L.DEFAULT_OBJECTS, config);
  var startedAt = 0;
  var solutionOrder = L.deriveSolutionOrder(state.objects);
  // 古さ(0..1): データの age を表示上の褪色へ反映する。
  var ageOf = {};
  (function () {
    var ages = state.objects.map(function (obj) { return Number(obj.age) || 0; });
    var maxAge = Math.max.apply(Math, ages) || 1;
    state.objects.forEach(function (obj) {
      ageOf[obj.id] = (Number(obj.age) || 0) / maxAge;
    });
  })();

  // 段3で表示する明示テキスト（読ませる文字＝演出をかけない）
  var HINT_TEXT = "新しい層は古い記憶の上にある。最奥の綴じ目から順に緩めて。";

  /* ================================================================
   * オブジェクトのイラストSVG（編み目テクスチャ・褪色ベール・埃つき）
   * ================================================================ */

  // 主シルエット path に fill(currentColor)・編み目・褪色・輪郭を重ねる共通ラッパ
  function knit(sil, details, dust) {
    return (
      '<svg class="obj-svg" viewBox="0 0 100 100">' +
      '<g filter="url(#softshadow)">' +
      '<path class="obj-fill" d="' + sil + '"/>' +
      '<path d="' + sil + '" fill="url(#stitch)"/>' +
      '<path class="obj-wear" d="' + sil + '"/>' +
      (details || "") +
      '<path d="' + sil + '" fill="none" stroke="rgba(30,18,8,0.5)" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<g class="obj-dust" fill="#d3c8ac">' + (dust || "") + "</g>" +
      "</g></svg>"
    );
  }

  var dustSpecks =
    '<circle cx="34" cy="44" r="1.1"/><circle cx="58" cy="38" r="0.9"/>' +
    '<circle cx="66" cy="62" r="1.2"/><circle cx="42" cy="66" r="0.9"/><circle cx="50" cy="52" r="0.8"/>';

  var SHAPES = {
    // 膝掛け: 畳んだ throw ＋ 折り目 ＋ 房
    blanket: knit(
      "M18 34 Q18 27 26 27 L74 27 Q82 27 82 34 L82 74 Q82 80 74 80 L26 80 Q18 80 18 74 Z",
      '<path d="M18 41 Q50 35 82 41" stroke="rgba(255,255,255,0.14)" stroke-width="2" fill="none"/>' +
      '<path d="M18 52 Q50 58 82 52" stroke="rgba(0,0,0,0.22)" stroke-width="2" fill="none"/>' +
      '<g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
      '<path d="M26 80 L25 88"/><path d="M38 80 L37 88"/><path d="M50 80 L50 88"/><path d="M62 80 L63 88"/><path d="M74 80 L75 88"/></g>',
      dustSpecks
    ),
    // マフラー: ループして垂れる
    scarf: knit(
      "M30 20 Q50 10 70 20 L70 40 Q70 47 63 47 L57 47 L57 80 Q57 84 53 84 L45 84 Q41 84 41 80 L41 47 L37 47 Q30 47 30 40 Z",
      '<path d="M41 30 Q50 26 57 30" stroke="rgba(255,255,255,0.12)" stroke-width="1.6" fill="none"/>' +
      '<g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M43 84 L42 91"/><path d="M50 84 L50 92"/><path d="M55 84 L56 91"/></g>',
      dustSpecks
    ),
    // ミトン: 本体＋親指＋リブ袖口
    mittens: knit(
      "M36 42 Q36 27 51 27 Q66 27 66 42 L66 64 Q66 78 51 80 Q36 78 36 64 Z",
      '<path class="obj-fill" d="M35 47 Q23 44 23 55 Q23 65 35 61 Z"/>' +
      '<path d="M35 47 Q23 44 23 55 Q23 65 35 61 Z" fill="none" stroke="rgba(30,18,8,0.45)" stroke-width="2"/>' +
      '<path class="obj-fill" d="M35 66 L67 66 L67 79 Q67 84 62 84 L40 84 Q35 84 35 79 Z"/>' +
      '<g stroke="rgba(0,0,0,0.28)" stroke-width="1.6"><path d="M40 67 L40 83"/><path d="M47 67 L47 83"/><path d="M54 67 L54 83"/><path d="M61 67 L61 83"/></g>',
      dustSpecks
    ),
    // 靴下: 脚＋足＋リブ口
    socks: knit(
      "M40 24 L60 24 L60 56 Q60 63 67 66 L79 72 Q84 74 81 79 Q78 84 72 81 L45 71 Q37 68 37 58 L37 24 Z",
      '<path class="obj-fill" d="M39 24 L61 24 L61 33 L39 33 Z"/>' +
      '<g stroke="rgba(0,0,0,0.26)" stroke-width="1.6"><path d="M43 24 L43 33"/><path d="M49 24 L49 33"/><path d="M55 24 L55 33"/></g>',
      dustSpecks
    ),
    // 帽子: ニット帽＋折り返し＋ポンポン
    hat: knit(
      "M27 62 Q27 30 51 30 Q75 30 75 62 Z",
      '<path class="obj-fill" d="M23 62 L79 62 L79 73 Q79 78 73 78 L29 78 Q23 78 23 73 Z"/>' +
      '<g stroke="rgba(0,0,0,0.26)" stroke-width="1.6"><path d="M30 63 L30 77"/><path d="M40 63 L40 77"/><path d="M51 63 L51 77"/><path d="M62 63 L62 77"/><path d="M72 63 L72 77"/></g>' +
      '<circle class="obj-fill" cx="51" cy="25" r="7"/>' +
      '<circle cx="51" cy="25" r="7" fill="url(#stitch)"/>',
      dustSpecks
    ),
    // ティーコジー: ドーム＋つまみ
    teacosy: knit(
      "M25 72 Q25 34 51 34 Q77 34 77 72 Z",
      '<path class="obj-fill" d="M22 72 L80 72 L80 79 Q80 82 76 82 L26 82 Q22 82 22 79 Z"/>' +
      '<path d="M51 34 Q51 24 58 24" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M32 60 Q51 66 70 60" stroke="rgba(0,0,0,0.2)" stroke-width="2" fill="none"/>',
      dustSpecks
    ),
    // クッション: ぷっくり四角＋角房
    cushion: knit(
      "M32 28 Q24 24 27 34 L27 66 Q24 76 34 72 L66 72 Q76 76 73 66 L73 34 Q76 24 68 28 Q50 34 32 28 Z",
      '<path d="M35 50 Q50 46 65 50" stroke="rgba(255,255,255,0.1)" stroke-width="1.6" fill="none"/>',
      '<circle cx="42" cy="46" r="1"/><circle cx="58" cy="54" r="1.1"/><circle cx="50" cy="40" r="0.9"/>' +
      '<path d="M27 30 L21 24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M73 30 L79 24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    ),
    // ラグ: 床の平たい楕円＋縁取り＋房
    rug: knit(
      "M16 52 Q16 42 50 42 Q84 42 84 52 Q84 64 50 64 Q16 64 16 52 Z",
      '<path d="M24 52 Q24 47 50 47 Q76 47 76 52 Q76 58 50 58 Q24 58 24 52 Z" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>' +
      '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<path d="M16 52 L9 50"/><path d="M17 56 L10 57"/><path d="M84 52 L91 50"/><path d="M83 56 L90 57"/></g>',
      '<circle cx="40" cy="52" r="1"/><circle cx="60" cy="53" r="0.9"/><circle cx="50" cy="49" r="0.8"/>'
    )
  };

  // 垂れる糸端（.fray）: 引けるサイン。SVGで実際の毛糸らしく描く
  var FRAY_SVG =
    '<svg viewBox="0 0 40 60" preserveAspectRatio="none">' +
    '<path class="fray-shadow" d="M20 0 C 14 14, 26 26, 18 40 C 13 49, 24 55, 20 60" />' +
    '<path class="fray-core" d="M20 0 C 14 14, 26 26, 18 40 C 13 49, 24 55, 20 60" />' +
    '<path class="fray-fiber" d="M20 0 C 14 14, 26 26, 18 40 C 13 49, 24 55, 20 60" />' +
    '<circle class="fray-tip" cx="20" cy="60" r="2.1" />' +
    "</svg>";

  /* ---------------- 部屋の DOM 構築（1回だけ） ---------------- */
  function buildRoom() {
    el.room.textContent = "";
    // A generated room plate already contains the furniture silhouettes; keep
    // fallback drawings available in markup but visually transparent so they
    // never double-render over the plate. Hit areas and frays remain active.
    el.room.dataset.background = "generated";
    var plate = new Image();
    plate.onload = function () { el.room.dataset.background = "generated"; };
    plate.onerror = function () { el.room.dataset.background = "fallback"; };
    plate.src = "./assets/furniture/room-bg-integrated-v2.png";
    state.objects.forEach(function (obj) {
      var node = document.createElement("div");
      node.className = "knit-object";
      node.dataset.id = obj.id;
      node.setAttribute("aria-label", obj.label);
      node.style.setProperty("--rot", (ROT[obj.id] || 0) + "deg");
      node.style.setProperty("--base", BASE_COLOR[obj.id] || "#caa267");
      node.style.setProperty("--sat", obj.saturation);
      node.style.setProperty("--age", (ageOf[obj.id] != null ? ageOf[obj.id] : 0.5).toFixed(3));
      node.style.setProperty("--settle-ms", config.settleMs + "ms");
      node.style.setProperty("--unravel-ms", config.unravelMs + "ms");
      var hit = HIT_MAP[obj.id] || {x:45,y:40,w:16,h:16};
      node.style.setProperty("--hit-x", hit.x + "%");
      node.style.setProperty("--hit-y", hit.y + "%");
      node.style.setProperty("--hit-w", hit.w + "%");
      node.style.setProperty("--hit-h", hit.h + "%");

      // 家具素材は assets/furniture に差し替え可能。未配置時もクリック領域が
      // 消えないよう、暗い家具の簡易シルエットをフォールバック表示する。
      var visualId = FURNITURE_VISUAL[obj.id] || obj.id;
      node.dataset.furniture = visualId;
      node.setAttribute("aria-label", (L.FURNITURE_LABELS || {})[visualId] || obj.label);
      var asset = (L.FURNITURE_ASSETS || {})[visualId];
      if (asset) {
        node.dataset.assetSrc = asset.src;
        node.dataset.assetReveal = asset.reveal;
        node.dataset.assetCollapse = asset.collapse;
      }
      // 家具は一枚の背景画に自然に描き込まれている。ここでは絵を重ねず、
      // 実景上の透明な当たり判定だけを置く（ドラッグ時のみ糸を露出）。
      node.innerHTML = '';
      Array.prototype.forEach.call(node.querySelectorAll('.furniture-asset'), function (img) {
        img.addEventListener('error', function () { img.remove(); });
      });

      var fray = document.createElement("span");
      fray.className = "fray";
      fray.tabIndex = -1;
      fray.setAttribute("role", "button");
      fray.setAttribute("aria-label", "露出した糸口: " + node.getAttribute("aria-label"));
      fray.setAttribute("aria-hidden", "true");
      fray.innerHTML = FRAY_SVG;
      fray.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
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
  var drag = null; // { id, pointerId, start:{x,y}, node }
  var firstPullHintShown = false;

  function onPointerDown(ev) {
    if (state.phase !== "room") return;
    if (drag) return;
    var node = ev.target.closest(".knit-object");
    if (!node || node.classList.contains("unraveled") || node.classList.contains("unraveling")) return;
    if (ev.target.closest(".fray") && node.classList.contains("reveal")) {
      drag = { id: node.dataset.id, pointerId: ev.pointerId, start: { x: ev.clientX, y: ev.clientY }, node: node };
      node.classList.add("dragging", "connection-source");
      connectionSource = node.dataset.id;
      resetIdle();
      if (node.setPointerCapture) try { node.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      return;
    }
    openFurnitureDialog(node.dataset.id);
    return;
    /* legacy drag path retained for debug builds */
    drag = { id: node.dataset.id, pointerId: ev.pointerId, start: { x: ev.clientX, y: ev.clientY }, node: node };
    node.classList.add("dragging", "reveal");
    el.app.classList.add("world-reveal");
    if (!firstPullHintShown) {
      firstPullHintShown = true;
      showHint("家具の形は仮の姿。長く引くと、内側の糸が姿を見せる。");
    }
    resetIdle();
    if (node.setPointerCapture) {
      try { node.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    }
  }

  function furnitureVisualId(id) { return FURNITURE_VISUAL[id] || id; }
  function openFurnitureDialog(id) {
    var data = FURNITURE_FLAVOR[furnitureVisualId(id)];
    if (!data || !el.furnitureDialog) return;
    selectedFurnitureId = id;
    el.furnitureTitle.textContent = data.title;
    el.furnitureFlavor.textContent = data.flavor;
    el.furnitureThread.textContent = data.thread;
    // closeFurnitureDialog marks the element hidden for the non-modal fallback.
    // Clear it before reopening so subsequent furniture clicks are visible.
    el.furnitureDialog.hidden = false;
    if (typeof el.furnitureDialog.showModal === "function") el.furnitureDialog.showModal();
    analytics.track("furniture_inspected", { object_id:id });
  }
  function closeFurnitureDialog() {
    if (!el.furnitureDialog) return;
    if (el.furnitureDialog.open) el.furnitureDialog.close();
    el.furnitureDialog.hidden = true;
    selectedFurnitureId = null;
  }

  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    // 糸端が指へ引かれ張力がかかる表現（--pull 0..1）。判定には使わない（G-003）
    var dist = L.dragDistance(drag.start, { x: ev.clientX, y: ev.clientY });
    var pull = Math.min(dist, config.drag) / config.drag;
    drag.node.style.setProperty("--pull", pull.toFixed(3));
    updateLiveConnection(drag.node, ev.clientX, ev.clientY);
  }

  function endDrag() {
    if (drag && drag.node) {
      drag.node.classList.remove("dragging");
      drag.node.style.setProperty("--pull", "0");
    }
    var live = el.connectionFx && el.connectionFx.querySelector(".connection-live");
    if (live) live.remove();
    drag = null;
  }

  function restoreExposedOutlet(id, focusOutlet) {
    var node = nodeById(id);
    if (!node || node.classList.contains("unraveled")) return;
    node.classList.add("reveal");
    node.classList.remove("dragging", "connection-source");
    node.style.setProperty("--pull", "0");
    var fray = node.querySelector(".fray");
    if (fray) {
      fray.tabIndex = 0;
      fray.setAttribute("aria-hidden", "false");
      if (focusOutlet) window.setTimeout(function () { fray.focus(); }, 0);
    }
  }

  function onPointerUp(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    var sourceId = drag.id;
    var hit = document.elementFromPoint(ev.clientX, ev.clientY);
    var targetNode = hit && hit.closest ? hit.closest(".knit-object") : null;
    var targetId = targetNode ? targetNode.dataset.id : (hit && hit.closest && hit.closest("#exit-thread-target") ? "exit" : null);
    endDrag();
    document.querySelectorAll(".connection-source").forEach(function (n) { n.classList.remove("connection-source"); });
    connectionSource = null;
    if (sourceId === L.nextExpectedId(state.objects, state.unraveled) && targetId === NEXT_CONNECTION[sourceId]) acceptConnection(sourceId, targetId);
    else rejectConnection(sourceId, targetId);
  }

  function acceptConnection(sourceId, targetId) {
    drawPermanentConnection(sourceId, targetId);
    dispatch({ type: "UNRAVEL", targetId: sourceId });
  }

  function rejectConnection(sourceId, targetId) {
    showHint(targetId ? "新しい層を先に引き、下の記憶が締まった。古い綴じ目からつないで。" : "糸の先を、次の層の糸口までつないで。 ");
    dispatch({ type: "CONNECTION_WRONG", targetId: sourceId });
    if (state.phase === "room") restoreExposedOutlet(sourceId, true);
  }

  function updateLiveConnection(sourceNode, clientX, clientY) {
    if (!el.connectionFx || !el.stage || !sourceNode) return;
    var old = el.connectionFx.querySelector(".connection-live");
    if (old) old.remove();
    var stageRect = el.stage.getBoundingClientRect();
    var from = centerPct(sourceNode.querySelector(".fray").getBoundingClientRect(), stageRect);
    var to = { x: ((clientX - stageRect.left) / stageRect.width) * 100, y: ((clientY - stageRect.top) / stageRect.height) * 100 };
    appendYarnPath("connection-live", from, to);
  }

  function drawPermanentConnection(sourceId, targetId) {
    if (!el.connectionFx || !el.stage) return;
    var fromNode = nodeById(sourceId);
    var toNode = targetId === "exit" ? el.exitThreadTarget : nodeById(targetId);
    if (!fromNode || !toNode) return;
    var stageRect = el.stage.getBoundingClientRect();
    var from = centerPct(fromNode.querySelector(".fray").getBoundingClientRect(), stageRect);
    var toRect = targetId === "exit" ? toNode.getBoundingClientRect() : toNode.querySelector(".fray").getBoundingClientRect();
    var to = centerPct(toRect, stageRect);
    appendYarnPath("connection-fixed", from, to);
  }

  function appendYarnPath(className, from, to) {
    var group = document.createElementNS(SVGNS, "g");
    group.setAttribute("class", className);
    var dx = to.x - from.x;
    var sag = Math.min(9, 3 + Math.abs(dx) * 0.055);
    var d = "M" + from.x + " " + from.y + " C" + (from.x + dx * 0.28) + " " + (from.y + sag) + " " + (from.x + dx * 0.72) + " " + (to.y + sag) + " " + to.x + " " + to.y;
    ["yarn-shadow", "yarn-core", "yarn-fiber"].forEach(function (kind) {
      var path = document.createElementNS(SVGNS, "path");
      path.setAttribute("class", kind);
      path.setAttribute("d", d);
      group.appendChild(path);
    });
    el.connectionFx.appendChild(group);
  }

  function keyboardConnect(targetId) {
    if (!connectionSource) {
      var sourceNode = nodeById(targetId);
      if (!sourceNode || !sourceNode.classList.contains("reveal")) return;
      connectionSource = targetId;
      sourceNode.classList.add("connection-source");
      showHint("接続先の糸口を選んで。 ");
      return;
    }
    var sourceId = connectionSource;
    var source = nodeById(sourceId);
    if (source) source.classList.remove("connection-source");
    connectionSource = null;
    if (sourceId === L.nextExpectedId(state.objects, state.unraveled) && targetId === NEXT_CONNECTION[sourceId]) acceptConnection(sourceId, targetId);
    else rejectConnection(sourceId, targetId);
  }

  /* ---------------- ディスパッチ（reduce → 副作用） ---------------- */
  function dispatch(action) {
    var prev = state;
    state = L.reduce(state, action);
    handleEvent(prev, state, action);
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
        window.setTimeout(function () { openHowTo(true); }, 0);
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

  function orderIndexOf(id) { return solutionOrder.indexOf(id); }

  function onUnravelOk(prev, next) {
    resetIdle();
    var added = next.unraveled[next.unraveled.length - 1];
    var node = nodeById(added);
    if (node) {
      runYarnToBall(node); // 糸が糸玉へ走って巻き取られる
      node.classList.remove("reveal");
      node.classList.add("unraveling", "collapse");
      var connectedFray = node.querySelector(".fray");
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
    el.stage.style.setProperty("--loosen-progress", String(next.unraveled.length / solutionOrder.length));
    el.stage.classList.remove("layer-loosen");
    void el.stage.offsetWidth;
    el.stage.classList.add("layer-loosen");
    analytics.track("unravel_ok", { object_id: added, order_index: orderIndexOf(added) });
  }

  // 糸玉のスケール段（ほどいた数/全数の巻き取り進捗）
  function updateYarnBall() {
    if (!el.yarnBall) return;
    var p = L.windProgress(state.unraveled.length, solutionOrder.length);
    el.yarnBall.style.setProperty("--ball", (0.42 + p * 0.78).toFixed(3));
  }

  // 対象中心から糸玉中心へ「糸の線が走って巻き取られる」線を unravel-fx に描く
  function runYarnToBall(node) {
    if (!el.unravelFx || !el.stage) return;
    var stageRect = el.stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;
    var from = centerPct(node.getBoundingClientRect(), stageRect);
    var ballRect = el.yarnBall ? el.yarnBall.getBoundingClientRect() : null;
    var to = ballRect ? centerPct(ballRect, stageRect) : { x: 12, y: 62 };
    var midx = (from.x + to.x) / 2 + (from.x < to.x ? -10 : 10);
    var midy = Math.min(from.y, to.y) - 12;
    var path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", "M" + from.x + " " + from.y + " Q" + midx + " " + midy + " " + to.x + " " + to.y);
    el.unravelFx.appendChild(path);
    var len = path.getTotalLength ? path.getTotalLength() : 200;
    var ms = Math.max(400, config.unravelMs * 0.9);
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    // reflow で初期状態を確定してから遷移
    void path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset " + ms + "ms cubic-bezier(.4,0,.4,1), opacity 260ms ease " + (ms - 160) + "ms";
    path.style.strokeDashoffset = "0";
    path.style.opacity = "0";
    window.setTimeout(function () { if (path.parentNode) path.parentNode.removeChild(path); }, ms + 400);
  }

  function centerPct(rect, stageRect) {
    return {
      x: ((rect.left + rect.width / 2 - stageRect.left) / stageRect.width) * 100,
      y: ((rect.top + rect.height / 2 - stageRect.top) / stageRect.height) * 100
    };
  }

  function onUnravelWrong(next, targetId, actionType) {
    resetIdle();
    var node = targetId ? nodeById(targetId) : null;
    if (node) {
      node.classList.remove("settle");
      if (actionType !== "CONNECTION_WRONG") node.classList.remove("reveal");
      void node.offsetWidth;
      node.classList.add("settle");
    }
    analytics.track("unravel_wrong", { object_id: targetId || "", wrong_count: next.wrongCount });
    applyHints(next.hintLevel);
    el.app.classList.remove("player-threat");
    void el.app.offsetWidth;
    el.app.classList.add("player-threat");
    window.setTimeout(function () { el.app.classList.remove("player-threat"); }, 1200);
  }

  /* ---------------- ヒント段階の描画（後出し・先出し禁止 — ADR-003 / G-002） ---------------- */
  function applyHints(level) {
    clearHintSway();
    if (level >= 1) {
      var nextId = L.nextExpectedId(state.objects, state.unraveled);
      var swayNode = nextId ? nodeById(nextId) : null;
      if (swayNode) swayNode.classList.add("hint-sway");
    }
    el.room.classList.toggle("hint-emphasize", level >= 2);
    if (level >= 3) showHint(HINT_TEXT);
    if (level >= 1) analytics.track("hint_opened", { hint_level: level });
  }

  function clearHintSway() {
    var swayed = el.room.querySelectorAll(".knit-object.hint-sway");
    Array.prototype.forEach.call(swayed, function (n) { n.classList.remove("hint-sway"); });
  }

  var hintTimer = null;
  function showHint(text) {
    if (!el.hintWhisper) return;
    if (!text) { el.hintWhisper.classList.remove("show"); return; }
    el.hintWhisper.textContent = text;
    el.hintWhisper.classList.add("show");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = window.setTimeout(function () { el.hintWhisper.classList.remove("show"); }, 5200);
  }

  /* ---------------- 無操作12/24/40秒: 観察→方向比較→候補絞り込み ---------------- */
  var idleTimers = [];
  function resetIdle() {
    idleTimers.forEach(clearTimeout);
    idleTimers = [
      window.setTimeout(function () { if (state.phase === "room") showHint("家具の説明だけでなく、露出した糸口を観察して。"); }, 12000),
      window.setTimeout(function () { if (state.phase === "room") showHint("糸口が向く方向と、隣の家具の糸口を比べて。"); }, 24000),
      window.setTimeout(function () { if (state.phase === "room") showHint("古い記憶から順に、一本の線が途切れない組を探して。"); }, 40000)
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
    el.badendScreen.hidden = state.phase !== "badEnd";
    if (el.phaseLabel) {
      el.phaseLabel.textContent = state.phase === "epilogue" ? "出口がひらく" : "イトヌシの体内";
    }
    var pips = document.querySelectorAll(".temper i");
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
    var elapsedSec = Math.round((performance.now() - startedAt) / 1000);
    document.getElementById("clear-detail").textContent = elapsedSec + " 秒でほどいた";
    el.app.classList.add("to-white");
    analytics.track("phase_advance", { phase: "good_end" });
    analytics.track("game_clear", { elapsed_sec: elapsedSec });
  }

  function buildTangle() {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "tangle-fx");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    // 編み目が絡まる見た目のもつれ（GOODの糸描画と対称の糸演出）
    var ds = [
      "M20 30 C 45 10, 70 50, 45 60 C 25 68, 60 80, 80 62",
      "M15 55 C 40 40, 55 75, 78 48 C 90 34, 60 30, 42 46",
      "M30 72 C 50 55, 68 78, 82 66 C 62 90, 40 88, 22 70"
    ];
    ds.forEach(function (d) {
      var p = document.createElementNS(SVGNS, "path");
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
  var howToReturnFocus = null;

  function openHowTo(isFirstOpen) {
    if (!el.howToDialog || typeof el.howToDialog.showModal !== "function" || el.howToDialog.open) return;
    howToReturnFocus = isFirstOpen ? null : document.activeElement;
    idleTimers.forEach(clearTimeout);
    el.howToDialog.showModal();
    // showModal のフォーカストラップに加え、主要操作へ明示的に着地させる。
    if (el.howToStart) el.howToStart.focus();
    analytics.track("how_to_opened", { first_open: Boolean(isFirstOpen) });
  }

  function restoreAfterHowTo() {
    resetIdle();
    if (howToReturnFocus && typeof howToReturnFocus.focus === "function") howToReturnFocus.focus();
    howToReturnFocus = null;
  }

  function closeHowTo() {
    if (!el.howToDialog || !el.howToDialog.open) return;
    el.howToDialog.close();
    restoreAfterHowTo();
  }

  /* ---------------- 入力ハンドラ登録 ---------------- */
  if (el.startButton) el.startButton.addEventListener("click", function () { dispatch({ type: "START" }); });
  if (el.restartButton) el.restartButton.addEventListener("click", function () { location.reload(); });
  if (el.badendRestartButton) el.badendRestartButton.addEventListener("click", function () { location.reload(); });
  if (el.pullEdgeButton) el.pullEdgeButton.addEventListener("click", function () { dispatch({ type: "PULL_EDGE" }); });
  if (el.scissors) el.scissors.addEventListener("click", function () { dispatch({ type: "USE_SCISSORS" }); });
  if (el.shareButton) el.shareButton.addEventListener("click", shareResult);
  if (el.howToButton) el.howToButton.addEventListener("click", function () { openHowTo(false); });
  if (el.howToClose) el.howToClose.addEventListener("click", closeHowTo);
  if (el.howToStart) el.howToStart.addEventListener("click", closeHowTo);
  if (el.furnitureClose) el.furnitureClose.addEventListener("click", closeFurnitureDialog);
  if (el.pullThreadButton) el.pullThreadButton.addEventListener("click", function () {
    if (!selectedFurnitureId) return;
    var id = selectedFurnitureId;
    closeFurnitureDialog();
    var node = nodeById(id);
    if (node) {
      node.classList.add("reveal");
      var fray = node.querySelector(".fray");
      if (fray) {
        fray.tabIndex = 0;
        fray.setAttribute("aria-hidden", "false");
        fray.focus();
      }
    }
  });
  if (el.exitThreadTarget) el.exitThreadTarget.addEventListener("click", function () { if (connectionSource) keyboardConnect("exit"); });
  if (el.furnitureDialog) el.furnitureDialog.addEventListener("cancel", function () { selectedFurnitureId = null; });
  if (el.howToDialog) el.howToDialog.addEventListener("cancel", function () {
    // Escape で閉じる場合、ブラウザの既定処理後にタイマーとフォーカスを戻す。
    window.setTimeout(restoreAfterHowTo, 0);
  });
  if (el.lpLink) {
    el.lpLink.addEventListener("click", function () {
      analytics.track("lp_click", { link_target: el.lpLink.href });
    });
  }
  el.room.addEventListener("pointerdown", onPointerDown);
  el.room.addEventListener("pointermove", onPointerMove);
  el.room.addEventListener("pointerup", onPointerUp);
  el.room.addEventListener("pointercancel", function (ev) {
    if (drag && ev.pointerId !== drag.pointerId) return;
    var cancelledId = drag ? drag.id : connectionSource;
    endDrag();
    connectionSource = null;
    if (cancelledId) restoreExposedOutlet(cancelledId, false);
  });

  function shareResult() {
    var text = "「さいごのひとめ」をほどいた。";
    var url = "https://games.escape-safari.com/last-stitch/";
    if (navigator.share) {
      navigator.share({ title: "さいごのひとめ", text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + " " + url).then(function () {
        el.shareButton.textContent = "コピーしました";
        setTimeout(function () { el.shareButton.textContent = "結果をシェア"; }, 1800);
      }).catch(function () {});
    } else {
      window.open(
        "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url),
        "_blank"
      );
    }
    analytics.track("share_click", { share_type: navigator.share ? "web_share" : "clipboard_or_intent" });
  }

  /* ---------------- X アプリ内ブラウザ対応: --vvh 追従＋高さゲート ---------------- */
  function applyViewport() {
    var vv = window.visualViewport;
    var visH = Math.max(1, Math.round(vv ? vv.height : (window.innerHeight || 0)));
    var root = document.documentElement;
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
    if (!DEBUG) return;
    window.__GAME_STATE__ = {
      phase: state.phase,
      unraveled: state.unraveled.slice(),
      wrongCount: state.wrongCount,
      hintLevel: state.hintLevel,
      scissorCount: state.scissorCount,
      nextExpected: L.nextExpectedId(state.objects, state.unraveled),
      lastEvent: state.lastEvent
    };
    if (!el.debugPanel) return;
    el.debugPanel.hidden = false;
    el.debugPanel.textContent =
      "phase: " + state.phase +
      "\nunraveled: " + state.unraveled.join(",") +
      "\nnext: " + window.__GAME_STATE__.nextExpected +
      "\nwrong: " + state.wrongCount + " hint: " + state.hintLevel +
      "\nscissors: " + state.scissorCount + "/" + config.scissors;
  }

  /* ---------------- 初期化 ---------------- */
  buildRoom();
  buildTangle();
  render();
  applyViewport();
  updateDebug();
  if (DEBUG) console.log("[last-stitch] config", config, "order", solutionOrder);
})();
