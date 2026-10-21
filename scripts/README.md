# Shared media optimization

`optimize-media.py` converts source media into a build staging directory and
records a hashable report. It never writes source assets. A game opts in with
`media-optimization.json` and calls the tool from its build script.

For an adopted game, the one command is:

```bash
npm run media:check
```

The build copies the game source, optimizes configured MP4/JPEG/PNG files,
updates the explicitly configured runtime manifests, writes `dist/media-report.json`,
and runs the game allowlist plus the reusable [`check-media.mjs`](check-media.mjs)
report/source/media verifier. The cache in `dist/.media-cache`
is keyed by source SHA-256, recipe settings, and tool versions. Remove `dist`
when diagnosing a local build; changing a source file or recipe also invalidates
its cache entry.

New games should start from [`../_template/README.md`](../_template/README.md),
keep original media under their source directory, and add browser quality checks
for the chosen CRF/quality settings. FFmpeg output can vary between builds, so
the report captures tool identity and recipe semantics rather than promising
cross-platform byte identity.

Install the required system tools before adopting the pipeline:

```bash
brew install ffmpeg webp                 # macOS
sudo apt-get install ffmpeg webp         # Ubuntu CI/host
```

Each adopted game must declare a `manifests` array. Every entry has a `glob` and
`media_root`; manifest media references may use explicit `./assets/...` paths or
bare paths relative to that entry's `media_root`. Hash keys are normalized paths
relative to `media_root`, so nested files with the same basename remain distinct.
The build script should copy the source tree to a staging directory and invoke
the tool with `--source`, `--output`, `--config`, `--cache-dir`, and `--report`,
then atomically publish the staging directory as `dist/public`. PNG rewriting
supports literal `./assets/...png` references in HTML/JS/JSON; keep dynamic or
bare path construction out of the optimized set, or add an explicit game-level
rewrite rule and test it before publishing.

## 新作への導入

1. 公開ソースを `app/` に置き、元素材は `app/assets/` に保管する。制作資料・3Dモデル・秘密情報は公開ソースの外に置く。
2. [`../hon-lion-riddle/media-optimization.json`](../hon-lion-riddle/media-optimization.json) をゲーム直下にコピーし、対象 glob と予算を作品に合わせる。予算はバイト単位。`video_bytes` / `image_bytes` はカテゴリ全体、`*_asset_bytes` は1ファイルの上限。
3. [`../hon-lion-riddle/scripts/build-static.mjs`](../hon-lion-riddle/scripts/build-static.mjs) の staging 作成・最適化・公開切替を build に組み込む。毎回 source から新しい staging を作り、前回の変換済みテキストを入力として再利用しない。
4. 公開チェックで source/config/tool のハッシュ、全メディアの網羅、生成物ハッシュ、容量上限を照合する。共有検証は [`check-media.mjs`](check-media.mjs)、ゲーム固有の allowlist・秘密情報チェックは作品側の `check-static.mjs` に置く。
5. CI に Python 3・FFmpeg（libx264）・WebP tools を用意し、`npm test` → `npm run build` → `npm run check:static` を実行する。ビルドで生成した同じ `dist/public` と `dist/media-report.json` をアーティファクトとして昇格・配信し、デプロイ工程で再ビルドしない。共有スクリプトの変更も CI の対象に含める。

コピー済み staging からの実行例（ゲーム直下）:

```bash
python3 ../scripts/optimize-media.py \
  --source app --output dist/staging \
  --config media-optimization.json \
  --cache-dir dist/.media-cache --report dist/media-report.json
```

キャッシュには source・レシピ・ツールバージョンに加えて optimizer 自体の SHA-256 を含める。圧縮処理を改修した場合も古いキャッシュを使わない。変更なしの再ビルドはキャッシュを再利用し、生成物のハッシュと寸法・動画情報を再検査する。

CRF 26 / JPEG q:v 3 は本ライオンで確認した初期値。文字・小さな記号・謎の手掛かりを含む画像は、作品の実表示で判読性を確認してから採用する。PNG はリサイズせず lossless WebP に変換する。音声はコピーし、映像の長さ・フレームレート・フレーム数・寸法を変えない。未対応形式はエラーになる。

新作の確認項目: PC/スマホで開始→本編→実動画→取得操作→クリア/再プレイ、Reduced Motion/媒体失敗時の静止画、画像の透過、コンソール/404、初回の不要な動画取得。転送量は同じブラウザー・画面サイズ・キャッシュ条件で比較する。実機Safari/X内ブラウザーの確認は、デスクトップ上のモバイルサイズ検証と区別する。
