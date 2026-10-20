# 推論チェックポイントと5カット（2026-10-21）

この文書は、理解の判定、5つの固定ID、実際のメディア手順、復旧規則の正です。基準コードは `e3ac86a` のゲーム状態・期限・観察を土台にし、この変更で `checkpoint-manifest.json` の実メディア経路を追加します。手前の廊下と奥のL字廊下を含む承認済み3Dを使い、5つの停止地点とその間の移動・取得・開扉動画を実装しています。

## 理解と進行は別の台帳

| ID | 到達した理解 |
| --- | --- |
| cp1 | 見ている洋館は幻覚である |
| cp2 | 音は幻覚ではない |
| cp3 | 音は自分の内部で鳴っている |
| cp4 | 音を鳴らしているのは自分ではない |
| cp5 | 音を発する存在・出来事が思考力低下の原因である |

Workerは各IDを独立に判定し、クライアントは重複のない到達集合だけを持ち回ります。到達ID、完了済みの演出手順、実行中の手順、待機中の手順は別です。5 IDをすべて得ても最終扉は開きません。最終解答が正解なら、未完了の演出手順を5件まで排出してから扉の導線を開きます。初回の正解でも同じです。

## 固定された5手順

| 手順 | 出発 → 到着 | clip / poster | 操作 |
| --- | --- | --- | --- |
| step1 | hall → entrance | `hall-entrance` / `entrance` | 次へ |
| step2 | entrance → rear-door | `entrance-rear-door` / `rear-door-locked` | 次へ |
| step3 | rear-door → cross | `rear-door-cross` / `cross`、`cross-key` / `cabinet-key` | 戸棚の鍵を拾う |
| step4 | cross → armed | `key-cabinet` / `cabinet`、`cabinet-open` / `cabinet-open`、`cabinet-take` / `gun-held`、`cabinet-stow` / `gun-stowed`、`cabinet-door-key` / `armed` | 開錠、銃を取る、次へ、扉の鍵を取る |
| step5 | armed → rear-door-ready | `cabinet-rear-door` / `rear-door-ready` | 次へ |

最終解答を完了した後にだけ `rear-door-open` / `bug` を使う。旧 `walk-a-b`、`walk-b-c`、`walk-c-entry`、`door-open` はこの新経路の代替素材ではない。最終扉の成功、動画失敗時のposter到着、クリア後の表示も同じ `bug` posterを保ち、旧経路へ戻らない。

## メディア契約と復旧

`app/assets/video/checkpoint-manifest.json` は `hon-lion-checkpoint-media-v1`、64文字の `asset_revision` と `source_scene_sha256` を持つ。wide / portrait の全clipとposterを指定し、ファイル名は `checkpoint-{key}-{profile}.mp4` / `.jpg` である。

手順は動画の完走または検証済みposterへの有限フォールバックの後、必要な操作が一度完了したときだけ進む。Reduced Motionもposterが実際に読み込まれた後に操作を表示する。動画が失敗してもposterが読めれば続行できる。動画とposterの両方が使えない場合は、未完了のまま「映像を再試行」を表示する。

途中で失敗した手順は、最後に完了したsegmentから再開する。たとえば銃の取得後に次のclipが失敗しても、銃の取得操作、メッセージ、効果音を繰り返さない。リセット、ページ離脱、期限切れはAbortSignalと世代番号で待機中のposter、動画、操作を完了不能として解決し、古い完了からアイテムを付与しない。

## 検証

`npm test` は理解順・重複・最初の正解・5 IDだけの未解決、posterフォールバック、リトライのsegment再開、二重付与防止、リセット・期限切れ・ページ離脱を検証する。`npm run test:worker` と `npm run check:worker` はWorker契約を検証する。

実素材があるローカルサーバーでは、次を使う。

```sh
python3 tests/browser-smoke.py --url http://127.0.0.1:8831/ --checkpoint-production
```

この専用suiteはデスクトップとモバイルで実MP4を再生し、初回正解→5手順→最終扉→虫→クリア→再プレイ、および5 IDだけで扉が開かないことを確認する。スクリーンショットと実行結果は、その実行後にのみリリース記録へ追加する。

### ローカル検証結果（2026-10-21）

- `npm test`: 120件成功。順不同、同時到達、重複防止、早期正解、再試行、キャンセルを含む。
- `npm run test:worker`: 44件成功。`npm run check:worker`も成功。
- `npm run build` / `npm run check:static`: 成功。公開対象136ファイル。
- 上記の実メディア用ブラウザsuite: Chromium、1280×720と390×844で成功。最初の最終解答からクリア・再プレイ、否定応答を含む順不同の5条件達成と最終未解決の維持を確認。実際のクリックで、チェックポイント操作がCSSに隠される不具合も修正した。
- `python3 scripts/capture-checkpoints/verify-capture.py app/assets/video`: 46個のメディアファイルのハッシュ・形式を確認。動画22本はH.264/yuv420p/30fps、横1280×720・縦720×1280、最大4,265,564 bytes。静止画24枚とmanifestを含め、新しい公開素材は47ファイル。
- 動画44端点を隣接する停止画像と比較し、黒い端点0、最小SSIM 0.908854。移動6経路は各1001サンプル、半径0.16mの干渉確認を通過。詳細は `scripts/capture-checkpoints/evidence/` に保存。

確定素材の `asset_revision` は `0aff97cb3e9a77ce47e9c46dbbde850d836a21ba9695ccee60da76d493472521`。ブラウザが読み込んだ3DのSHA-256は `6c2c34a3816c501d58e307d0f4e171fb39e4aee97aab89c0879e9b64e815035d`。再生成手順は `scripts/capture-checkpoints/README.md` を参照する。元モデル・個別素材・ローカルパスを含む制作証跡は公開ディレクトリに含めない。

ブラウザ検証はローカルWorkerの固定応答デモを使用した。実JEVへの課金を伴う自由入力の判定精度評価は未実施。5手順の割り当ては確定済みで、本番デプロイは行っていない。別worktreeの未コミット演出差分は取り込んでいない。
