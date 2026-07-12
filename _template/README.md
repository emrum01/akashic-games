# _template — Web謎/ミニゲーム 新作雛形

`apps/akashic-games/` 配下の新作を始めるための最小雛形。ビルド無し・素のHTML/JS/CSSのみ。
参考実装: `apps/akashic-games/still-thread/`, `apps/akashic-games/notification-gale/`,
`apps/akashic-games/broken-web/`, `apps/akashic-games/three-forward-two-back/`

## 1. ディレクトリコピー手順

```bash
cp -r apps/akashic-games/_template apps/akashic-games/<new-game-id>
cd apps/akashic-games/<new-game-id>
```

`<new-game-id>` は英数字とハイフンのみ（例: `midnight-signal`）。既存ゲームと同様、URLパス
（`https://games.escape-safari.com/<new-game-id>/`）にそのまま使われる。

## 2. プレースホルダ置換チェックリスト

`index.html` / `analytics.js` / `game.js` に埋め込まれた `{{...}}` を検索して全て置換する。

```bash
grep -rn '{{' apps/akashic-games/<new-game-id>/
```

| プレースホルダ | 置換内容 | 出現ファイル |
|---|---|---|
| `{{GAME_ID}}` | ディレクトリ名と一致させる（例: `midnight-signal`） | index.html, analytics.js, game.js |
| `{{GAME_TITLE}}` | ゲームタイトル（日本語可） | index.html, analytics.js, game.js |
| `{{SERIES_LABEL}}` | シリーズ表記（例: `SAFARI FUTURE RELAY` のような世界観ラベル） | index.html |
| `{{GAME_DESCRIPTION}}` | OGP/meta description用の1〜2文 | index.html |
| `{{EPISODE_CODE}}` | 話数・回次表示（任意。不要なら削除可） | index.html |
| `{{GAME_LEAD_COPY}}` | タイトル画面の導入コピー（**操作指示・答えを書かない**。違和感の提示にとどめる） | index.html |
| `{{THEME_COLOR}}` | `<meta name="theme-color">` の色 | index.html |
| `{{UTM_CAMPAIGN}}` | クリア画面LPリンクのutm_campaign値（例: `weekly_webnazo_<new-game-id>`） | index.html |
| `{{GA4_MEASUREMENT_ID}}` | GA4測定ID（`G-XXXXXXXXXX`のまま残すとローカルではgtagが読み込まれず安全） | analytics.js |

置換後、OGP画像 `ogp.jpg`（1200x630）をディレクトリ直下に配置する
（`notification-gale/ogp.jpg`, `still-thread/assets/ogp.jpg` を参考にサイズ・命名を揃える）。

GA4測定IDは、既存ゲームと同様に **akashic-lp (`invite.escape-safari.com`) と同一プロパティを流用**
するのが通例（`game_id`ディメンションで区別する）。新規プロパティを切る場合はチームで合意の上で。

## 3. ローカル起動

```bash
cd apps/akashic-games/<new-game-id>
python3 -m http.server 8000
# http://localhost:8000/ をブラウザで開く
```

ヒント段階開放やGA4送信ログを確認したい場合は `?debug=1` を付ける
（`console.log("[GA4]", ...)` が出力される。`analytics.js` 参照）。

## 4. デプロイ注意（本番反映は旧リポにも push が必要）

`apps/akashic-games/` は akashic モノレポに **git subtree で取り込み済み**だが、
GitHub Pages 配信（`games.escape-safari.com`）は旧リポ `emrum01/akashic-games` が継続している。
**akashic モノレポにコミットしただけでは本番に反映されない。**

本番反映が必要なタイミングでは、akashic 側の変更を旧リポ `emrum01/akashic-games` にも
push する（具体的な subtree push 手順は `.claude/references/repos.md` の「モノレポ運用」を参照）。

## 5. X内蔵ブラウザ検証の要点

詳細は `ontology/procedures/webnazo-x-inapp-browser.md` を参照。要約:

- 主なプレイ経路は **X 投稿リンクからの X アプリ内ブラウザ**。画面下部の約25〜30%が
  常時 X の UI（URLバー＋元ポストのシート）に覆われる。
- 進行必須のオブジェクト・ボタンは **可視領域の上部70%（セーフゾーン）** に配置する。
- 高さは `100dvh` 決め打ちにせず、`window.visualViewport` を見て実効高さ(`--vvh`)を
  JSで随時更新する（本雛形の `game.js` の `applyViewport()` / `styles.css` の `.app` 参照）。
- **高さで見た目を圧縮する分岐は `@media (max-height)` では発火しない**（X のオーバーレイは
  `visualViewport` だけを縮め、レイアウトビューポート高さ自体は変えないため）。
  JS が `visualViewport.height` を見て `<html>` に `vvh-short` / `vvh-tiny` クラスを付与し、
  CSS 側はそのクラスで分岐させる（本雛形に実装済み。しきい値640px/520pxは実測ベース）。
- 自前のゲーム内オーバーレイ（下部固定パネル等）自身がセーフゾーンを覆ってしまう事故も
  過去に発生している（broken-web）。自前UIの占有域も含めてセーフゾーンを再計算すること。
- 実装後は必ず **縮小ビューポート（下部30%を欠いた状態）** での可視性・タップ可否をQAで確認する。
  手順は `apps/akashic-games/.claude/skills/webgl-game-headless-verify/SKILL.md`。
- 縦600px級の環境（横852×縦600など）を最小サポート基準として、その解像度で3導線
  （タイトル開始／クリア画面のLPリンク・シェア・再プレイ）が必ず画面内に収まることを確認する。

## 6. 設計方針（雛形に埋め込み済み。削除しないこと）

- **ヒントは段階的後出し**: UIに操作指示や答えを直接書かない。詰まった後（経過時間や
  誤操作回数などの詰み検知）にのみ、段階的にヒントを開放する。`game.js` の `checkHints()` /
  ヒント設計方針コメントを参照。
- **世界観モチーフの散りばめ**: コアギミックのモチーフを全画面（タイトル/本編/クリア）に
  控えめに配置し、クリアで回収する。難易度補助ではなく一貫性のための伏線。
  `index.html` の `.motif-layer` / `styles.css` の `.motif` を参照。
