/*
 * AkashicAnalytics — GA4 計測ラッパー（zoo-escape）
 * window.AkashicAnalytics = { track, game, isLive }
 * - 本番ホスト（games.escape-safari.com 等）でのみ gtag 送信（isLive=true）
 * - localhost / file:// では送信せず、?debug=1 のとき console 出力
 */
(function () {
  "use strict";

  var GA4_ID = "G-F53JLZ0Z44";

  var GAME = {
    id: "zoo-escape",
    title: "まっすぐ読むな｜動物園脱出"
  };

  var params = new URLSearchParams(window.location.search);
  var DEBUG = params.get("debug") === "1";

  // ローカル / 開発環境では計測を無効化する
  var host = window.location.hostname;
  var isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "" ||
    host === "0.0.0.0" ||
    window.location.protocol === "file:";
  var IS_LIVE = !isLocal;

  // 本番のみ gtag をロード
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
      extra || {}
    );
    if (DEBUG) {
      // eslint-disable-next-line no-console
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
