/*
 * akashic-games 計測モジュール（GA4）テンプレート
 * notification-gale/analytics.js をベースに、他ゲームへ流用しやすい形へ整理したもの。
 * akashic-lp と同一プロパティを流用し、hostname / game_id でゲーム別に区別する運用。
 *
 * 新作を始めるとき: このファイルをコピーし、下の GA4_ID と GAME の id/title だけ書き換えれば動く。
 * イベント名・呼び出し方（track の第1引数）は既存ゲームと揃えること（後段の集計・比較がしやすいため）。
 */
(function () {
  "use strict";

  // ==== 差し替え必須プレースホルダ ====
  var GA4_ID = "{{GA4_MEASUREMENT_ID}}"; // 例: "G-F53JLZ0Z44"（akashic-lp と同一プロパティを流用するのが通例）
  var PLACEHOLDER = "G-XXXXXXXXXX"; // このままなら isLive=false になり、gtag は読み込まれない（ローカル確認時の事故防止）

  var GAME = {
    id: "{{GAME_ID}}", // 例: "notification-gale"（ディレクトリ名と合わせる）
    title: "{{GAME_TITLE}}" // 例: "夜間窓口"（GA4上の表示用。日本語可）
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

/*
 * ==== イベント名の慣例（既存ゲーム全体で揃えているもの。新規イベントを増やす場合もこの語彙に合わせる） ====
 *
 * game_start                        タイトルからゲーム開始した瞬間
 * phase_advance   { phase }         ステージ/フェーズが進行した瞬間（phase名は自由。ゲーム固有のフェーズ名を入れる）
 * hint_opened     { hint_level }    ヒントを開封した瞬間（段階的後出しヒントの各段階。game.js 側の設計参照）
 * fallback_used                     詰み検知後の救済導線（代替操作等）を使った瞬間
 * game_clear      { elapsed_sec }   クリア達成
 * lp_click        { link_target }   クリア画面等からのLP誘導クリック
 * share_click     { share_type }    結果シェアボタンのクリック
 *
 * 上記に無いイベントが必要な場合はゲーム固有の名前を追加してよいが、
 * 「開始・進行・ヒント・クリア・LP誘導・シェア」の6分類のどれに属するかは意識して命名する。
 */
