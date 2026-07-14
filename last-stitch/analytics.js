/*
 * akashic-games 計測モジュール（GA4） — last-stitch「さいごのひとめ」
 * notification-gale/analytics.js 系の共通形。akashic-lp と同一プロパティを流用し
 * game_id でゲーム別に区別する運用。イベント名は既存ゲームと揃える。
 */
(function () {
  "use strict";

  // ==== 差し替え必須プレースホルダ ====
  // 本番反映時に akashic-lp と同一の測定ID（例: "G-F53JLZ0Z44"）へ差し替える。
  // このまま（G-XXXXXXXXXX）ならローカルでは gtag を読み込まず事故を防ぐ。
  var GA4_ID = "G-XXXXXXXXXX";
  var PLACEHOLDER = "G-XXXXXXXXXX";

  var GAME = {
    id: "last-stitch",
    title: "さいごのひとめ"
  };

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  var isLive = Boolean(GA4_ID) && GA4_ID !== PLACEHOLDER && GA4_ID.indexOf("G-") === 0;

  if (isLive) {
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA4_ID);
    document.head.appendChild(script);
    gtag("js", new Date());
    gtag("config", GA4_ID, { send_page_view: true });
  }

  // debug 判定は logic.js の単一の正 parseDebug に統一する（game.js と揃える）。
  // logic.js は本ファイルより先に読み込まれる。念のため未定義時は false フォールバック。
  var isDebug = Boolean(
    window.LastStitchLogic &&
      window.LastStitchLogic.parseDebug(new URLSearchParams(window.location.search))
  );

  function readUtmParams() {
    var query = new URLSearchParams(window.location.search);
    var utm = {};
    if (query.has("utm_source")) utm.source = query.get("utm_source");
    if (query.has("utm_medium")) utm.medium = query.get("utm_medium");
    if (query.has("utm_campaign")) utm.campaign = query.get("utm_campaign");
    if (query.has("utm_content")) utm.content = query.get("utm_content");
    return utm;
  }
  var utmParams = readUtmParams();

  function track(eventName, params) {
    var payload = Object.assign(
      {
        game_id: GAME.id,
        game_title: GAME.title
      },
      utmParams,
      params || {}
    );
    window.gtag("event", eventName, payload);
    if (isDebug) {
      console.log("[GA4]", eventName, payload);
    }
  }

  window.AkashicAnalytics = { track: track, game: GAME, isLive: isLive };
})();

/*
 * ==== イベント名の慣例（既存ゲーム全体で揃えているもの） ====
 *
 * game_start                        タイトルからゲーム開始した瞬間
 * phase_advance   { phase }         フェーズ進行（room / epilogue / good_end / bad_end）
 * hint_opened     { hint_level }    段階的後出しヒントの各段(1..3)を開いた瞬間
 * fallback_used   { kind }          救済導線を使った瞬間（本作では未使用だが語彙は温存）
 * game_clear      { elapsed_sec }   GOOD END 到達
 * game_over       { reason }        BAD END 到達（reason: "scissors"）
 * lp_click        { link_target }   クリア画面からのLP誘導クリック
 * share_click     { share_type }    結果シェアボタンのクリック
 *
 * last-stitch 固有:
 * unravel_ok      { object_id, order_index }  正順で1つほどいた
 * unravel_wrong   { object_id, wrong_count }  誤順（目が締まる）
 * scissors_used   { count }                    ハサミ使用（count回目）
 */
