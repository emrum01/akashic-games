# 共通ゲームUI

`apps/akashic-games/shared/game-ui/` は、新しい水平思考ゲームのUI、スタイル、テーマ、モバイル入力動作の唯一の実装元です。物語、判定、controller、API状態は含みません。本ライオンの既存画面は対象外で、変更していません。

## 所有範囲

- `GameUI.tsx` と `components.tsx`: 舞台、キャラクター、ツールバー、メニュー、会話とページ送り、composer、reader dialog、汎用ボタン、操作行、履歴、ヒント、確認操作。
- `tokens.css`, `components.css`, `conversation.css`: 色、文字、間隔、角丸、影、タッチ寸法、動き、すべての共有UIの表示。
- `theme.ts`: 6桁hexアクセントのみを受け付ける型付きtheme helper。値は各 `.game-ui` root のみに適用し、話者名とreader見出しへ同じ色を使います。
- `useComposerDock.ts`, `viewport.js`: 入力フォーカス、iOS WebKitの300ms文字表示ガード、キーボード表示中の会話窓と画面補正。
- `index.css`: UIコンポーネントのスタイル。通常のページ向けで、`html` / `body` を固定しません。
- `fullscreen.css`: `index.css` にフルスクリーン用 `document.css` を加えた明示的なentryです。root viewportの固定が必要なゲームだけが選びます。

`package.json` のexportsはReact部品、theme、入力hook、viewport adapter、通常CSS、フルスクリーンCSSを公開します。packageはprivateで、依存は追加しません。Kit buildはesbuildで `app/styles.css` からCSSを一度bundleします。app stylesheetはimport adapterだけです。

## 次の作品を追加するとき

新しい作品は既存kitのデータ駆動実行面を使い、`stories/<id>.json`、許可済みの素材、6桁hexのthemeだけを追加します。画面ごとのJSX/CSS、色や寸法のコピー、モバイルhookの複製は作りません。共通UIに必要な新しい見た目や部品は、このpackageへ追加して全作品で使えるpropsにします。作品固有の文言・イベント・API動作はcontroller adapter側で組み立てます。

スタンドアロンの合成状態一覧はkitで `npm run ui:catalog` を実行します。問題、会話、pending/error/retry、toolbar/menu、履歴、ヒント、確認、disabled/focus、theme/tokensを表示します。カタログはメモリ上のdev bundleとしてローカル配信し、通常buildやWorker routeへ入りません。

## 保持する動作

会話文の自然な句読点境界でページを切り、表示可能高さを測るDOMをReact内に保ちます。質問・解答ボタン、送信中の入力保持、通信失敗後の再送、履歴と真相の再読はkit controller側の操作を共通UIに渡します。

入力フォーカス時に会話窓を上げ、キーボードが閉じるか入力からblurすると戻します。iOS WebKitのtouch環境では入力文字をフォーカス直後300msだけ隠し、native focus panを抑えます。キットの既存テストがimportする `app/useComposerDock.ts` と `app/viewport.js` は共有moduleへの再exportだけを持ち、実装を複製しません。page split helperは元の相対import `../../hon-lion-riddle/app/dialogue-pagination.js` を維持します。

viewport adapterは `#app-root` を測り、背景、操作、会話窓をまとめて補正します。offsetの二重加算、pinch zoom中のpan、focusの取り直し、scroll補正を追加しません。各ページでは同じIDを複数配置せず、現行のsingle-game/single-dialog契約を保ちます。
