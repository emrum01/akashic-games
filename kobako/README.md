# ひらがなの小箱

静的 HTML/CSS/JS の小謎。問題データは index.html の5個の `.box` にある33文字。スクリプトは同じ DOM から読み取り、任意の文字の消去・復元、取り消し・リセット、答え合わせを追加する。途中状態は保存しない。

## ローカル表示

akashic ルートから:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory apps/akashic-games
```

http://127.0.0.1:8000/kobako/ を開く。JS を実行しない添付プレビューでは操作できない。通常のブラウザで URL を開く。JS 無効時も盤面は読める。

## 既存配信経路（公開操作は別途承認後）

予定 URL: https://games.escape-safari.com/kobako/

`pages/legacy-routes.json` の許可リスト → `pages/build-site.sh` → `.github/workflows/mirror-legacy.yml` → `emrum01/akashic-games` の `gh-pages` → 既存 GitHub Pages。

既存9ルートの `routes` は platform の配信契約も参照するため維持し、小箱だけを `pagesOnlyRoutes` に宣言する。Pages ビルドは両方を明示的に検証して10ルートを組み立てる。platform 側の配信範囲・検証条件は変更しない。

main の対象パス変更がワークフローを起動する。main への反映は公開を伴う操作として扱う。手動で旧リポへ二重投入しない。別 platform の Workers release manifest、本ライオン Worker、DNS、認証は変更しない。

```sh
bash apps/akashic-games/pages/build-site.sh --output /tmp/kobako-pages-site
bash scripts/test-mirror-legacy.sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/kobako-pages-site
```

全体ビルドには jq・rsync が必要。publish-site.sh は既存公開ファイルの変更・削除を拒否する追加専用検証を維持している。実公開前に現 gh-pages と照合し、不一致時は停止する。今回、そのリモート照合と公開は未実施。

## ブラウザ検証

既存 Playwright が使える環境で:

```sh
node apps/akashic-games/kobako/tests/browser.cjs
# 配信ビルドそのものを確認する場合
node apps/akashic-games/kobako/tests/browser.cjs /tmp/kobako-pages-site/kobako/index.html
```

必要時は `CHROMIUM_PATH` に既存 Chromium のパス、`NODE_PATH` に既存 Playwright の親モジュールディレクトリを指定する。証跡先は `KOBAKO_EVIDENCE` で指定可能（既定 /tmp/kobako-browser-evidence）。テストは一時的なループバック HTTP サーバーで実際にページを開く。JS 有効／無効、文字盤、操作、答え合わせ、動作軽減、横はみ出し、外部通信がないことを確認する。実機スマホ・人間の難度評価は別途必要。
