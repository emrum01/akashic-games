/*
 * {{GAME_TITLE}} — ゲームロジック骨組み（テンプレート）
 *
 * 参考実装: apps/akashic-games/still-thread/, apps/akashic-games/notification-gale/
 * 必読の蓄積知見: ontology/procedures/webnazo-x-inapp-browser.md
 *
 * ==== このファイルの使い方 ====
 * 1. state.phase の値と分岐を、実際のゲームのフェーズ構成に置き換える。
 * 2. analytics.track(...) の呼び出し箇所（GA4送信ポイント）はそのまま踏襲し、
 *    イベント名は analytics.js 冒頭コメントの慣例に合わせる。
 * 3. checkHints() を、そのゲーム固有の詰み検知条件で実装する（下記コメント必読）。
 */
(function () {
  "use strict";

  var analytics = window.AkashicAnalytics || { track: function () {} };

  var params = new URLSearchParams(location.search);
  var DEBUG = params.has("debug") && params.get("debug") !== "0";

  var el = {
    app: document.getElementById("app"),
    titleScreen: document.getElementById("title-screen"),
    gameScreen: document.getElementById("game-screen"),
    clearScreen: document.getElementById("clear-screen"),
    startButton: document.getElementById("start-button"),
    restartButton: document.getElementById("restart-button"),
    shareButton: document.getElementById("share-button"),
    lpLink: document.getElementById("lp-link"),
    hintWhisper: document.getElementById("hint-whisper"),
    debugPanel: document.getElementById("debug-panel")
  };

  // ==== ステート管理の最小構造 ====
  // phase: "title" | "playing" | "clear" （実際のゲームでは playing をさらに細分化してよい）
  var state = {
    phase: "title",
    startedAt: 0,
    // ヒント段階開放のフラグ。段階ごとに1回しか開かないようにするためのラッチ。
    // 実際のヒント本数・条件に合わせてキーを増減する。
    hintFlags: {
      level1: false,
      level2: false,
      level3: false
    }
  };

  /* ================================================================
   * ヒント設計方針（必読・削除しないこと）
   * ------------------------------------------------------------
   * - UI に操作指示や答えを直接書かない。タイトル・ゲーム画面のテキストは
   *   状況・違和感の提示にとどめ、遊び方はプレイヤーに発見させる。
   * - ヒントは「詰まった後に」段階的に後出しする。判定は主に経過時間や
   *   誤操作回数などの詰み検知条件で行い、最初から見せない。
   * - 各段階は前段より一歩だけ踏み込む（例: level1=観察を促す一言 →
   *   level2=軽い示唆 → level3=ほぼ答えに近い救済）。全段階を一度に出さない。
   * - showHint() は hint-whisper 要素にテキストを差し込み、一定時間で
   *   自動的にフェードアウトさせる（styles.css の .hint-whisper.show 参照）。
   * ================================================================ */
  function checkHints(elapsedMs) {
    // TODO: ゲーム固有の詰み検知条件に置き換える。以下は時間経過のみの最小例。
    if (!state.hintFlags.level1 && elapsedMs > 15000) {
      state.hintFlags.level1 = true;
      showHint("……なにか、様子がおかしい？");
      analytics.track("hint_opened", { hint_level: 1 });
    }
    if (!state.hintFlags.level2 && elapsedMs > 35000) {
      state.hintFlags.level2 = true;
      showHint("");
      analytics.track("hint_opened", { hint_level: 2 });
    }
    if (!state.hintFlags.level3 && elapsedMs > 60000) {
      state.hintFlags.level3 = true;
      showHint("");
      analytics.track("hint_opened", { hint_level: 3 });
    }
  }

  var hintTimer = null;
  function showHint(text) {
    if (!el.hintWhisper) return;
    if (!text) {
      el.hintWhisper.classList.remove("show");
      return;
    }
    el.hintWhisper.textContent = text;
    el.hintWhisper.classList.add("show");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      el.hintWhisper.classList.remove("show");
    }, 5200);
  }

  /* ---------------- フェーズ遷移 ---------------- */
  function startGame() {
    el.titleScreen.hidden = true;
    el.gameScreen.hidden = false;
    state.phase = "playing";
    state.startedAt = performance.now();
    analytics.track("game_start");
    // GA4送信ポイント: フェーズが増える場合はここで各フェーズ突入時に
    // analytics.track("phase_advance", { phase: "<フェーズ名>" }); を呼ぶ。
  }

  function clearGame() {
    if (state.phase === "clear") return;
    state.phase = "clear";
    var elapsedSec = Math.round((performance.now() - state.startedAt) / 1000);
    el.gameScreen.hidden = true;
    el.clearScreen.hidden = false;
    document.getElementById("clear-detail").textContent = ""; // 任意: クリアタイム等を表示する場合はここに入れる
    analytics.track("game_clear", { elapsed_sec: elapsedSec });
  }

  function restart() {
    location.reload();
  }

  function shareResult() {
    var text = "「{{GAME_TITLE}}」をクリアした。";
    var url = "https://games.escape-safari.com/{{GAME_ID}}/";
    if (navigator.share) {
      navigator.share({ title: "{{GAME_TITLE}}", text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + " " + url).then(function () {
        el.shareButton.textContent = "コピーしました";
        setTimeout(function () {
          el.shareButton.textContent = "結果をシェア";
        }, 1800);
      }).catch(function () {});
    } else {
      window.open(
        "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url),
        "_blank"
      );
    }
    analytics.track("share_click", { share_type: navigator.share ? "web_share" : "clipboard_or_intent" });
  }

  if (el.startButton) el.startButton.addEventListener("click", startGame);
  if (el.restartButton) el.restartButton.addEventListener("click", restart);
  if (el.shareButton) el.shareButton.addEventListener("click", shareResult);
  if (el.lpLink) {
    el.lpLink.addEventListener("click", function () {
      analytics.track("lp_click", { link_target: el.lpLink.href });
    });
  }

  /* ================================================================
   * X アプリ内ブラウザ対応: --vvh 追従 ＋ 高さゲートのクラス付与
   * ------------------------------------------------------------
   * still-thread / notification-gale 実装から抽出したパターン。
   * - window.visualViewport.height を実効高さとして --vvh に反映する
   *   （100dvh 決め打ちだと X の下部UIに隠れた領域までレイアウトしてしまう）。
   * - 高さで見た目を圧縮する分岐は @media (max-height) では拾えないため
   *   （X のオーバーレイは visualViewport だけを縮めレイアウトビューポートは
   *   変えない）、JS側で <html> に vvh-short / vvh-tiny クラスを付け、
   *   CSS 側はそのクラスで分岐させる（styles.css 参照）。
   * - しきい値 640 / 520 は notification-gale の実測に基づく値。ゲーム固有の
   *   レイアウトに応じて調整してよいが、「JSクラス付与＋CSSクラス分岐」という
   *   構造自体は変えないこと。
   * ================================================================ */
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
  applyViewport();

  /* ---------------- メインループ（ヒント判定など時間依存の処理はここで回す） ---------------- */
  function loop(now) {
    requestAnimationFrame(loop);
    try {
      if (state.phase === "playing") {
        var elapsed = now - state.startedAt;
        checkHints(elapsed);
      }
      updateDebug();
    } catch (e) {
      if (DEBUG) console.error("loop error", e);
    }
  }

  /* ---------------- 検証用フック（ヘッドレスQAで状態を読むための最小限の公開） ---------------- */
  function updateDebug() {
    window.__GAME_STATE__ = {
      phase: state.phase,
      hintFlags: state.hintFlags
    };
    if (!DEBUG || !el.debugPanel) return;
    el.debugPanel.hidden = false;
    el.debugPanel.textContent = "phase: " + state.phase + "\nhints: " + JSON.stringify(state.hintFlags);
  }

  requestAnimationFrame(loop);
})();
