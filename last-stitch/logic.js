/*
 * さいごのひとめ (last-stitch) — 純粋ロジック層
 *
 * このファイルは副作用（DOM・描画・タイマー・乱数・location）を一切持たない。
 * ほどき順序の判定・三条件の候補絞り込み・ドラッグ閾値・ヒント段階遷移・
 * 誤順カウント・状態機械のみを純粋関数として提供する。
 * game.js（描画・入力・演出）と tests/logic.test.js の両方から読めるよう
 * UMD 風に window / module.exports の両対応にする。
 *
 * 世界律（単一原理・DESIGN.md が正）:
 *   「この世界は一本の糸で編まれており、最後に編まれた目からしか、ほどくことができない」
 *   → 家具に残る記憶を読み、古いものから順にすべてほどく。
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  /* eslint-disable no-undef */
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LastStitchLogic = api;
  }
  /* eslint-enable no-undef */
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /* ================================================================
   * 既定オブジェクトデータ（体験仕様の正は DESIGN.md）
   * ------------------------------------------------------------
   * age は記憶の古さ（大きいほど古い）。全家具に一意な値を持たせる。
   * saturation は表現用の色味であり、現行謎の正解根拠ではない。
   * ================================================================ */
  // age は画面上に数値で露出させず、各家具のフレーバーから比較させる。
  var DEFAULT_OBJECTS = Object.freeze([
    // 家具への対応順（椅子→額縁→チェスト→姿見）は、フレーバーで
    // 示す「部屋の記憶が形になった順」と一致させる。
    { id: "blanket", label: "膝掛け", age: 7, saturation: 58, worn:false, pair:false, zone:"low", form:"wide", holds:false, soft:true },
    { id: "scarf", label: "マフラー", age: 6, saturation: 92, worn:true, pair:false, zone:"high", form:"long", holds:false, soft:true },
    { id: "mittens", label: "手袋", age: 3, saturation: 80, worn:true, pair:true, zone:"middle", form:"small", holds:false, soft:true },
    { id: "socks", label: "靴下", age: 5, saturation: 68, worn:true, pair:true, zone:"low", form:"small", holds:false, soft:true },
    { id: "hat", label: "帽子", age: 2, saturation: 55, worn:true, pair:false, zone:"high", form:"round", holds:true, soft:true },
    { id: "teacosy", label: "ティーコジー", age: 4, saturation: 43, worn:false, pair:false, zone:"table", form:"round", holds:true, soft:false },
    { id: "cushion", label: "クッション", age: 1, saturation: 30, worn:false, pair:false, zone:"middle", form:"square", holds:true, soft:true },
    { id: "rug", label: "ラグ", age: 8, saturation: 18, worn:false, pair:false, zone:"floor", form:"wide", holds:false, soft:false }
  ]);

  // 差し替え用アセット契約。未配置時は game.js の簡易シルエットへフォールバック。
  var FURNITURE_ASSETS = Object.freeze({
    clock:{src:"assets/furniture/clock.png",reveal:"assets/furniture/clock-fray.png",collapse:"assets/furniture/clock-collapse.png"},
    portrait:{src:"assets/furniture/portrait.png",reveal:"assets/furniture/portrait-fray.png",collapse:"assets/furniture/portrait-collapse.png"},
    chest:{src:"assets/furniture/chest.png",reveal:"assets/furniture/chest-fray.png",collapse:"assets/furniture/chest-collapse.png"},
    mirror:{src:"assets/furniture/mirror.png",reveal:"assets/furniture/mirror-fray.png",collapse:"assets/furniture/mirror-collapse.png"},
    chair:{src:"assets/furniture/chair.png",reveal:"assets/furniture/chair-fray.png",collapse:"assets/furniture/chair-collapse.png"},
    bookcase:{src:"assets/furniture/bookcase.png",reveal:"assets/furniture/bookcase-fray.png",collapse:"assets/furniture/bookcase-collapse.png"},
    trunk:{src:"assets/furniture/trunk.png",reveal:"assets/furniture/trunk-fray.png",collapse:"assets/furniture/trunk-collapse.png"},
    door:{src:"assets/furniture/door.png",reveal:"assets/furniture/door-fray.png",collapse:"assets/furniture/door-collapse.png"}
  });
  var FURNITURE_LABELS = Object.freeze({clock:"壁掛け時計",portrait:"古い額縁",chest:"引き出し付きチェスト",mirror:"姿見",chair:"古い椅子",bookcase:"本棚",trunk:"古いトランク",door:"古い扉"});

  // 各段の証言は、単独では複数候補に当てはまり、積集合だけが一意になる。
  // 正解後に次段が開くため、プレイヤーは毎手ごとに仮説を更新する。
  var CLUE_SETS = Object.freeze([
    [{key:"worn",value:true,text:"身につけるもの"},{key:"pair",value:false,text:"ひとつだけで使う"},{key:"holds",value:false,text:"何かを中に包むものではない"}],
    [{key:"worn",value:true,text:"身につけるもの"},{key:"pair",value:true,text:"ふたつで一組"},{key:"zone",value:"low",text:"手より低い場所に触れる"}],
    [{key:"worn",value:false,text:"人は身につけない"},{key:"holds",value:true,text:"何かを中に包む"},{key:"soft",value:false,text:"休むための柔らかさではない"}],
    [{key:"worn",value:true,text:"身につけるもの"},{key:"pair",value:true,text:"ふたつで一組"},{key:"zone",value:"middle",text:"足ではなく手に触れる"}]
  ]);

  function candidateIdsForClues(objects, clues, excludedIds) {
    var done = excludedIds || [];
    return (objects || DEFAULT_OBJECTS).filter(function (o) {
      return done.indexOf(o.id) === -1 && (clues || []).every(function (c) { return o[c.key] === c.value; });
    }).map(function (o) { return o.id; });
  }

  function cluesForProgress(unraveledCount) {
    return CLUE_SETS[Math.min(CLUE_SETS.length - 1, Math.max(0, Number(unraveledCount) || 0))];
  }

  var DEFAULT_CONFIG = Object.freeze({
    drag: 110, // ドラッグ移動量の閾値(px)。これ以上引くと「糸一段分」ほどき判定
    hint: 1, // ヒント段階のステップ。誤操作 hint*n 回で段n(1..3)が開く
    scissors: 3, // ハサミが何回目の使用でBAD ENDになるか
    unravelMs: 900, // 正順ほどきアニメの尺(ms)
    settleMs: 420, // 誤順「目が締まる」アニメの尺(ms)
    mistakes: 3 // 機嫌を損ね、糸に変えられるまでの誤順回数
  });

  /* ---------------- 入力の安全なパース（境界で検証） ---------------- */

  // URLSearchParams / プレーンオブジェクト / null のいずれでも読めるアクセサを作る
  function toGetter(source) {
    if (!source) {
      return function () {
        return null;
      };
    }
    if (typeof source.get === "function") {
      return function (key) {
        return source.get(key);
      };
    }
    return function (key) {
      return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : null;
    };
  }

  // 正の数のみ採用。NaN・0以下・未指定は既定値へフォールバック
  function positiveNumberOr(raw, fallback) {
    if (raw === null || raw === undefined || raw === "") return fallback;
    var n = Number(raw);
    if (!isFinite(n) || n <= 0) return fallback;
    return n;
  }

  // 正の整数のみ採用（丸め・下限1）。不正は既定値へ
  function positiveIntOr(raw, fallback) {
    var n = positiveNumberOr(raw, NaN);
    if (!isFinite(n)) return fallback;
    return Math.max(1, Math.round(n));
  }

  // デバッグフラグの単一の正。game.js / analytics.js で共通に使い判定を揃える。
  // ?debug（値なし）・?debug=1 等は true、?debug=0 と未指定は false。
  function parseDebug(source) {
    var raw = toGetter(source)("debug");
    if (raw === null || raw === undefined) return false;
    if (raw === "") return true; // クエリにキーだけ存在（?debug）
    return String(raw) !== "0";
  }

  function parseConfig(source, defaults) {
    var base = defaults || DEFAULT_CONFIG;
    var get = toGetter(source);
    return {
      drag: positiveNumberOr(get("drag"), base.drag),
      hint: positiveIntOr(get("hint"), base.hint),
      scissors: positiveIntOr(get("scissors"), base.scissors),
      unravelMs: positiveNumberOr(get("unravelMs"), base.unravelMs),
      settleMs: positiveNumberOr(get("settleMs"), base.settleMs),
      mistakes: positiveIntOr(get("mistakes"), base.mistakes || 3)
    };
  }

  /* ---------------- ドラッグ計測（純粋・幾何のみ） ---------------- */

  // 2点間のユークリッド距離。演出由来の移動は呼び出し側で混入させない（G-003）
  function dragDistance(from, to) {
    if (!from || !to) return 0;
    var dx = Number(to.x) - Number(from.x);
    var dy = Number(to.y) - Number(from.y);
    if (!isFinite(dx) || !isFinite(dy)) return 0;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 引いた距離が閾値以上か
  function isDragSufficient(distance, threshold) {
    var d = Number(distance);
    var t = Number(threshold);
    if (!isFinite(d) || !isFinite(t)) return false;
    return d >= t;
  }

  /* ---------------- 段階開示される腹の証言 → ほどき順序 ---------------- */

  // 全家具を記憶の古い順へ。age同値でも id で決定的な一意順にする。
  function deriveSolutionOrder(objects) {
    var list = objects || DEFAULT_OBJECTS;
    return list.slice()
      .sort(function (a, b) {
        var ageDiff = Number(b.age) - Number(a.age);
        if (isFinite(ageDiff) && ageDiff !== 0) return ageDiff;
        return String(a.id).localeCompare(String(b.id));
      })
      .map(function (o) {
        return o.id;
      });
  }

  // まだほどいていないオブジェクトのうち、次にほどくべき id（無ければ null）
  function nextExpectedId(objects, unraveledIds) {
    var done = unraveledIds || [];
    var order = deriveSolutionOrder(objects || DEFAULT_OBJECTS);
    for (var i = 0; i < order.length; i++) if (done.indexOf(order[i]) === -1) return order[i];
    return null;
  }

  /* ---------------- ほどき判定 ----------------
   * 戻り値: { ok, reason }
   *   reason: "order-correct" | "already" | "unknown" | "order-wrong"
   */
  function evaluateUnravel(objects, unraveledIds, targetId) {
    var list = objects || DEFAULT_OBJECTS;
    var done = unraveledIds || [];
    var target = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === targetId) {
        target = list[i];
        break;
      }
    }
    if (!target) return { ok: false, reason: "unknown" };
    if (done.indexOf(targetId) !== -1) return { ok: false, reason: "already" };
    if (targetId === nextExpectedId(list, done)) {
      return { ok: true, reason: "order-correct" };
    }
    return { ok: false, reason: "order-wrong" };
  }

  /* ---------------- ほどきの巻き取り進捗（糸玉の育ち） ----------------
   * ほどいた数 / 全数 を 0..1 で返す純粋関数。game.js が糸玉のスケール段
   * （8段階の世界内進捗）に使う。範囲外・非数は 0..1 にクランプする。
   */
  function windProgress(unraveledCount, totalObjects) {
    var n = Number(unraveledCount);
    var t = Number(totalObjects);
    if (!isFinite(n) || n <= 0) return 0;
    if (!isFinite(t) || t <= 0) return 0;
    return Math.min(1, n / t);
  }

  // 8家具すべてを古い順にほどき終えたか。
  function isComplete(objects, unraveledIds) {
    var done = unraveledIds || [];
    var required = deriveSolutionOrder(objects || DEFAULT_OBJECTS);
    return required.length > 0 && required.every(function (id) { return done.indexOf(id) !== -1; });
  }

  /* ---------------- ヒント段階遷移 ----------------
   * 誤操作回数 wrongCount と ステップ step から開くべき段(0..3)を返す。
   * 段は後戻りしない（呼び出し側で max を取る＝advanceHintLevel）。
   */
  var MAX_HINT_LEVEL = 3;

  function computeHintLevel(wrongCount, step) {
    var w = Number(wrongCount);
    var s = Math.max(1, Math.round(Number(step) || 1));
    if (!isFinite(w) || w <= 0) return 0;
    return Math.min(MAX_HINT_LEVEL, Math.floor(w / s));
  }

  // 現在の段を下げずに前進させる
  function advanceHintLevel(currentLevel, wrongCount, step) {
    var cur = Number(currentLevel) || 0;
    return Math.max(cur, computeHintLevel(wrongCount, step));
  }

  /* ---------------- ハサミ（唯一の非編み物・意図した例外） ----------------
   * 使用回数を1つ進め、limit回目でBAD ENDになるかを返す。
   * 戻り値: { count, badEnd }
   */
  function registerScissorUse(currentCount, limit) {
    var next = (Number(currentCount) || 0) + 1;
    var lim = Math.max(1, Math.round(Number(limit) || DEFAULT_CONFIG.scissors));
    return { count: next, badEnd: next >= lim };
  }

  /* ================================================================
   * 状態機械（純粋リデューサ）
   * ------------------------------------------------------------
   * phase: "title" | "room" | "epilogue" | "goodEnd" | "badEnd"
   *   title    : 縁の糸端が垂れる。引いても固くて動かない（最後まで残る違和感）
   *   room     : メイン。三条件の積集合で選んだオブジェクトをほどく
   *   epilogue : 全ほどき完了。床の糸文字＋縁の糸端が緩む
   *   goodEnd  : 縁の糸端を引く→視界がほどけて白
   *   badEnd   : ハサミ規定回数→糸が絡まり暗転（編み直し）
   * lastEvent: 直近の出来事（描画・演出のトリガ。ロジックには影響しない）
   * ================================================================ */
  function createInitialState(objects, config) {
    return {
      phase: "title",
      objects: objects || DEFAULT_OBJECTS,
      config: config || DEFAULT_CONFIG,
      unraveled: [],
      wrongCount: 0,
      hintLevel: 0,
      scissorCount: 0,
      lastEvent: null
    };
  }

  function reduce(state, action) {
    if (!state) return state;
    if (!action || !action.type) return state;

    switch (action.type) {
      case "START": {
        if (state.phase !== "title") return state;
        return Object.assign({}, state, { phase: "room", lastEvent: "start" });
      }

      case "PULL_EDGE": {
        // タイトルの縁の糸端: title では固くて動かない / epilogue では GOOD END へ
        if (state.phase === "title") {
          return Object.assign({}, state, { lastEvent: "edge-stuck" });
        }
        if (state.phase === "epilogue") {
          return Object.assign({}, state, { phase: "goodEnd", lastEvent: "edge-release" });
        }
        return state;
      }

      case "UNRAVEL": {
        if (state.phase !== "room") return state;
        var res = evaluateUnravel(state.objects, state.unraveled, action.targetId);
        if (!res.ok) {
          // 未知・既にほどき済みはカウントせず（プレイヤーの誤順ではない）
          if (res.reason === "unknown" || res.reason === "already") {
            return Object.assign({}, state, { lastEvent: "noop-" + res.reason });
          }
          // 誤順＝目が締まる。誤操作を数えヒント段階を前進
          var wrongCount = state.wrongCount + 1;
          var bad = wrongCount >= (state.config.mistakes || 3);
          return Object.assign({}, state, {
            wrongCount: wrongCount,
            hintLevel: advanceHintLevel(state.hintLevel, wrongCount, state.config.hint),
            phase: bad ? "badEnd" : "room",
            lastEvent: bad ? "temper-badend" : "unravel-wrong"
          });
        }
        var unraveled = state.unraveled.concat([action.targetId]);
        var complete = isComplete(state.objects, unraveled);
        return Object.assign({}, state, {
          unraveled: unraveled,
          phase: complete ? "epilogue" : "room",
          lastEvent: complete ? "complete" : "unravel-ok"
        });
      }

      case "CONNECTION_WRONG": {
        if (state.phase !== "room") return state;
        var connectionWrongCount = state.wrongCount + 1;
        var connectionBad = connectionWrongCount >= (state.config.mistakes || 3);
        return Object.assign({}, state, {
          wrongCount: connectionWrongCount,
          hintLevel: advanceHintLevel(state.hintLevel, connectionWrongCount, state.config.hint),
          phase: connectionBad ? "badEnd" : "room",
          lastEvent: connectionBad ? "temper-badend" : "unravel-wrong"
        });
      }

      case "USE_SCISSORS": {
        // ハサミは部屋にいる間のみ有効
        if (state.phase !== "room" && state.phase !== "epilogue") return state;
        var r = registerScissorUse(state.scissorCount, state.config.scissors);
        return Object.assign({}, state, {
          scissorCount: r.count,
          phase: r.badEnd ? "badEnd" : state.phase,
          lastEvent: r.badEnd ? "scissor-badend" : "scissor-flee"
        });
      }

      case "RESTART": {
        return createInitialState(state.objects, state.config);
      }

      default:
        return state;
    }
  }

  return {
    FURNITURE_ASSETS: FURNITURE_ASSETS,
    FURNITURE_LABELS: FURNITURE_LABELS,
    DEFAULT_OBJECTS: DEFAULT_OBJECTS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    CLUE_SETS: CLUE_SETS,
    MAX_HINT_LEVEL: MAX_HINT_LEVEL,
    parseConfig: parseConfig,
    parseDebug: parseDebug,
    dragDistance: dragDistance,
    isDragSufficient: isDragSufficient,
    deriveSolutionOrder: deriveSolutionOrder,
    candidateIdsForClues: candidateIdsForClues,
    cluesForProgress: cluesForProgress,
    nextExpectedId: nextExpectedId,
    evaluateUnravel: evaluateUnravel,
    windProgress: windProgress,
    isComplete: isComplete,
    computeHintLevel: computeHintLevel,
    advanceHintLevel: advanceHintLevel,
    registerScissorUse: registerScissorUse,
    createInitialState: createInitialState,
    reduce: reduce
  };
});
