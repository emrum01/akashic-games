/*
 * AkashicAnalytics — GA4 計測ラッパー（still-thread）
 * window.AkashicAnalytics = { track, game, isLive }
 * - 本番ホスト（games.escape-safari.com 等）でのみ gtag 送信（isLive=true）
 * - localhost / file:// では送信せず、?debug=1 のとき console 出力
 * zoo-escape / notification-gale と同一プロパティ・同一構造。id/title のみ差し替え。
 */
(function () {
  "use strict";

  var GA4_ID = "G-F53JLZ0Z44"; // akashic-lp と同一プロパティを流用し hostname / game_id で区別

  var GAME = {
    id: "still-thread",
    title: "流れないスレ"
  };

  var params = new URLSearchParams(window.location.search);
  var DEBUG = params.get("debug") === "1";

  // utm_source/medium/campaign/content を全イベント共通パラメータに付与（source=x 等の流入元別集計用）
  var UTM_PARAMS = (function () {
    var utm = {};
    if (params.has("utm_source")) utm.source = params.get("utm_source");
    if (params.has("utm_medium")) utm.medium = params.get("utm_medium");
    if (params.has("utm_campaign")) utm.campaign = params.get("utm_campaign");
    if (params.has("utm_content")) utm.content = params.get("utm_content");
    return utm;
  })();

  // ローカル / 開発環境では計測を無効化する
  var host = window.location.hostname;
  var isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "" ||
    host === "0.0.0.0" ||
    window.location.protocol === "file:";
  var IS_LIVE = !isLocal;

  if (IS_LIVE) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA4_ID, {
      page_title: GAME.title,
      game_id: GAME.id
    });
  }

  function track(event, extra) {
    var payload = Object.assign(
      { game_id: GAME.id, game_title: GAME.title },
      UTM_PARAMS,
      extra || {}
    );
    if (DEBUG) {
      console.log("[analytics]", event, payload);
    }
    if (IS_LIVE && typeof window.gtag === "function") {
      window.gtag("event", event, payload);
    }
  }

  window.AkashicAnalytics = {
    track: track,
    game: GAME,
    isLive: IS_LIVE
  };
})();
