/*
 * akashic-games 計測モジュール（GA4）
 * akashic-lp と同一プロパティを流用し、hostname / game_id でゲーム別に区別する。
 * 他ゲームへ流用する場合はこのファイルをコピーし、GAME の id/title のみ書き換えればよい。
 */
(function () {
  "use strict";

  var GA4_ID = "G-F53JLZ0Z44"; // akashic-lp (invite.escape-safari.com) と同一プロパティを流用
  var PLACEHOLDER = "G-XXXXXXXXXX";

  var GAME = {
    id: "notification-gale",
    title: "夜間窓口"
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

  var isDebug = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);

  // utm_source/medium/campaign/content を読み取り、全イベント共通パラメータとして付与する
  // （source=x 等の流入元別に customEvent ディメンションで集計できるようにするため）
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
