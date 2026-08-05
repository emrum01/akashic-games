# さいごのひとめ (last-stitch)

編み物の部屋を舞台にしたモバイル向けWEB謎解きゲーム。2D 静的単体HTML（ビルド無し・外部CDN依存なし）。
編み地・オブジェクトは CSS/SVG で表現し、BAD END のカードイラストのみローカル画像素材を使用する。

- **体験仕様の正**: `DESIGN.md`（現在形。画面構成・ギミック・ヒント段・END分岐・URLクエリ一覧）
- **設計判断の経緯**: `ADR.md`（ADR-001〜012）
- **横断原則**: `../../ontology/game-adr-digest.md`（G-nnn）

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面のDOM骨組み（タイトル/部屋/エピローグ/GOOD/BAD） |
| `logic.js` | **純粋ロジック層**（副作用なし）。ほどき判定・彩度→順序・ドラッグ閾値・ヒント段階・ハサミ・状態機械。UMD風で node/ブラウザ両対応 |
| `game.js` | 描画・ポインタ入力の計測・演出・GA4送信。判定は `logic.js` に委譲 |
| `styles.css` | 編み物の部屋のスタイル・演出・セーフゾーン・高さゲート |
| `analytics.js` | GA4計測（akashic-lp と同一プロパティ流用、`game_id` で区別） |
| `assets/bad-end-yarn-captive.png` | BAD END カード用イラスト（糸へ変えられ毛玉へ巻き取られるプレイヤー） |
| `tests/logic.test.js` | `logic.js` の単体テスト（node標準 `node:test`、依存ゼロ） |

## ローカル起動

```bash
cd apps/akashic-games/last-stitch
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

`?debug=1` でデバッグHUD（phase / unraveled / next / wrong / hint / scissors）表示＋GA4送信のconsole出力。
体験パラメータは URLクエリで上書き可（例 `?drag=200&hint=2&scissors=5`）。一覧は `DESIGN.md`。

## 遊び方（初見導線）

ゲーム開始時の説明は3項目だけ。細かな規則や危険は、家具の反応と段階ヒントで遊びながら学ぶ。

1. **腹の経路図**をひらく。
2. 入口から出口へ、**一本の糸**をたどる。
3. 気になる家具を**長押しして引く**。糸が露出したら、そのまま観察を続ける。

正しい順にほどけた先で出口の糸端が緩み、脱出できる。答えの家具名や不要な対象は導入では明かさない。

ゲーム中は、長押しで糸が露出する、正しい対象だけがほどける、という反応を手掛かりに次の一手を学習する。詰まりが続いた場合のみ、画面内の段階ヒントが追加で示される。
5. **BAD END**: 右下のハサミを3回タップすると糸が絡まり暗転→編み直し。

## テスト

```bash
node --test "tests/*.test.js"
```

（Node 25 系ではディレクトリ指定でなく glob 指定が必要。正常系・境界値・異常系を網羅、43ケース。）

## デプロイ注意（本番反映は旧リポにも push が必要）

`apps/akashic-games/` は akashic モノレポに git subtree で取り込み済みだが、GitHub Pages 配信
（`games.escape-safari.com`）は旧リポ `emrum01/akashic-games` が継続。モノレポにコミットしただけでは
本番に反映されない。本番反映時は旧リポにも push する（`.claude/references/repos.md` の「モノレポ運用」）。

リリース前チェック:
- OGP画像 `ogp.jpg`（1200×630）を配置。
- `analytics.js` の `GA4_ID` を本番測定IDへ差し替え（`G-XXXXXXXXXX` のままだとローカルで gtag を読み込まず安全）。
- アセットを変更したらキャッシュバスター `?v=` を参照箇所すべてで揃えて更新（G-011）。
- 縮小ビューポート（下部30%欠け）・縦600px級で3導線の可視性・タップ可否をQA（`webgl-game-headless-verify`）。
- `akashic-nazo-blind-playtest` を実施し指摘をPhase 1〜3へ差し戻す。
# 家具アセット契約

`assets/furniture/` に各家具の `id.png`（通常）、`id-fray.png`（糸露出）、`id-collapse.png`（崩壊）を置くと自動表示されます。ドラッグ開始で糸露出、正解で崩壊画像へ遷移し、完了後は対象が透明化されます。画像が無い場合は暗色シルエットへフォールバックします。

初見導線は、遊び方ダイアログで「腹の経路図を開く」「家具を長押しして引く」「糸の出口までたどる」を提示し、最初のドラッグ時に家具の内側が糸であることを短いヒントで示します。10秒操作がなければ経路図が脈動し、誤答時は次の観察を促します。
