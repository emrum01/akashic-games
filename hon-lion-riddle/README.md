# 水平思考ゲーム

本ライオンとの会話で真実に近づく短編水平思考ゲーム。質問への返答は「はい」「いいえ」「関係ない」。推理が進むと奥へ進み、十字架のカットでランプの下の戸棚のカギを取り、奥の部屋の左側まで歩いて戸棚を開け、棚から光線銃と部屋のドアの鍵を受け取って開かずの間の虫を焼きます。

## 起動

このディレクトリで一度 `npm install` を実行し、`npm run dev` で起動します。静的ファイルの生成と、APIを含む配信をまとめて行います。

- 本編: http://127.0.0.1:8796/
- 旧プレビューURL: http://127.0.0.1:8796/?demo=1

接続設定がある環境では、どちらのURLでも実際のJEVが自由文を判定します。`?demo=1` の例文判定は接続設定がない環境での画面確認に限ります。

`npm run dev` はローカルWorkerにだけ `HON_LION_DEMO=1` を渡します。キーがないlocalhostで、かつ`?demo=1`を明示した場合だけWorker内のオフライン判定を使い、キーが設定されている場合は同じURLでも必ず実際のJEVを呼びます。デモ判定や正解文は公開静的ファイルへ含めません。

ローカル配信を終了すると、これらのURLは開けなくなります。再開するときは `npm run dev` を実行します。ソース変更後は `npm run build` で配信内容を更新できます。

## 実際のTypeSafe JEVを接続する

1. [TypeSafeの公式コンソール](https://console.typesafe.ai/)でAPIキーを用意します。
2. `worker/.dev.vars` に `TYPESAFE_API_KEY=取得したキー` を設定します。新しい環境では `.dev.vars.example` をコピーして作成します。このファイルはGit管理・公開配信の対象外です。キーをチャットやフロントのJavaScriptに記入しないでください。
3. `npm run dev` で起動します。すでに起動中なら設定変更後に再起動します。
4. `npm run check:live` で本物のAPIに12件の日本語質問・最終推理を送り、三択の返答・部分推理・鍵の判定・返答した実モデル名を確認します。キーが未設定なら未検証として終了します。
5. 本編URLを開きます。旧プレビューURLの `?demo=1` から開いても、接続設定が確認できれば本編の判定を使います。最初の質問は接続確認の完了を待ってから送信します。

[公式API仕様](https://docs.typesafe.ai/api)に従い、Workerから `https://api.typesafe.ai/v1/systemone` へ `state` と型付きの `questions` を送ります。通常質問の選択肢は三つ、進捗は別のChoiceで判定します。最終推理は幻覚・耳の虫による自分の脳への捕食・音の正体の三点を個別に判定し、単語ではなく説明の意味と関係を確認します。病院で自分の耳を映すカメラ映像という設定は保持しますが、その説明を省いても正解です。モデルは `JEV_MODEL` で指定でき、初期値は安定版エイリアスの `jev-latest` です。レスポンスにはエイリアス名ではなく、実際に判定したモデルのIDを返します。[モデルとエイリアス](https://docs.typesafe.ai/models)

キーがない、認証に失敗する、応答が時間切れになる場合はエラーを表示し、再入力できます。体験版へ自動的に切り替えません。キー・正解判定用の真相はWorker側で管理します。

設定の出典と未確定事項は [DESIGN.md](DESIGN.md) に整理しています。

## 進行と表示

暗い開始画面 → ASMRを聴く日常・入眠・目覚めの導入を三回に分けて表示 → 洋館と本ライオンを表示 → 自由質問 → 複数行で最終推理 → C到着 → 「ランプの下で何か光っている」→「調べる」→「戸棚のカギを見つけた」→ 奥の部屋の左側の戸棚へ歩行 → 鍵を錆びた錠前に差し込み、回して輪を開く → 錠前を外す → 戸棚を開く → 光線銃を取る → 次へ → 銃を下ろす → 戸棚から部屋のドアの鍵を取る → 入口へ歩行 → 部屋の鍵でドアを開ける → 虫への発射 → 虫の消失と音の停止 → 幻覚の消失 → 脱出成功。報酬の各場面は背景の動画または到着静止画で示し、補助画像の失敗でも文章による操作を続行できます。部分正解の最終推理は入力を残し、そのまま修正できます。

音は開始操作で再生し、真相が分かっても同じものが続き、虫を除去した時に停止します。音を消す切替と、音の存在を伝える短い感覚描写があります。報酬は一つずつ過去の会話から独立して見せ、対峙では本ライオンを隠して虫と光線銃を見せます。再プレイや離脱では音と遅延中の演出も解除します。

背景は承認済みの屋敷を撮影した歩行動画で、キャラクターは2D立ち絵です。新しい核心を一つ理解するとA→B、別の核心を理解するとB→Cへ移動します。核心同士の関係を一度に理解した場合もCへ進めます。同じ理解の繰り返しや周辺の質問では進みません。Workerは直近6件の履歴に加えて、正の進捗として確認済みの最大4件の`knownInsights`をJEVへ渡すため、履歴から押し出された核心も再計上しません。正解後はC→ランプ→左側の戸棚→入口へ移動します。椅子に到着する画角は、ランプ・椅子・右上の十字架が見える構図です。動画再生中に次の進捗が来ても現在の動画を飛ばさず、次の到着点を予約します。各地点への移動・扉の開閉・銃の取得が完了してから、次の操作が有効になります。

戸棚には錆びた錠前と留め金を取り付けています。開錠映像は6.6秒で、鍵の差し込み・回転、輪の持ち上げと旋回、錠前の取り外し、留め金と扉の開放の順に進みます。錠前が外れるまで扉は開きません。開錠時だけ視点を寄せ、その後は元の取得位置へ戻します。錠前の出典と再生成手順は `scripts/capture-rewards/README.md` を参照してください。

戸棚内の銃は既存の光線銃画像を参照してTripoで生成した3Dモデルです。元の戸棚の両扉を開き、棚の中から銃を取り出して画面手前で止め、次の映像で銃を下ろし、最後に部屋のドアの鍵を取り出す動きを横・縦画面で撮影しています。`reward-manifest.json` が各映像と到着静止画を管理します。モデルと生成記録は公開フォルダー外の `assets/models/`・`design/cabinet-reward.provenance.json` に保管します。

音響はCC0の実録素材を加工した乾いた断続的な反復音、金属鍵、銃の機械音、扉、虫の出現音、1.34秒の強い放電の6種類です。反復音は26秒の中に短い「カリカリ」を5つの疎な塊で置き、塊の外はデジタル無音にしています。有機的な低い連続音や発射音の代用は入れません。扉の音は動画の実再生に合わせ、静止画への切替時は鳴らしません。虫の出現音は画像の読み込み完了時に一度だけ鳴り、発射時に止めます。質問の三択や文章送りには通知音を足さず、除去後はクリアまで無音を保ちます。放電は約4秒照射し、開始から約4.45秒で虫が消えて反復音が止まり、残った粒子が消える約6秒後に脱出の進行へ戻ります。照射本体はCanvas 2D、虫の周囲の発光・局所歪みはWebGL1 GLSLで描画し、画面揺れと銃の反動はReduced Motion設定に従います。Opusが読めないブラウザーではAACを試し、素材取得に失敗してもゲームは進行します。出典・加工・選定の見直しは [audio/CREDITS.md](audio/CREDITS.md)、再生成は `python3 scripts/build-audio.py`（FFmpeg必須）を参照してください。人間による試聴検証は今回も実施していません。

導入後に問題文を表示し、洋館の正体・音の正体・自分の身に起きていることを答えると明示します。「推理をはじめる」で質問画面へ入ると壁時計で20分（1,200,000ms）の制限が始まります。5分・10分・15分・18分・19分30秒で、入力や会話を隠さない画面ノイズが強くなります。各段階で「思考力が下がったような気がする。」を毎回表示し、入力中・返答待ちなら操作後まで保留します。同じ段階の再検査では重複表示せず、前回の同文を隠して新しい表示に置き換えます。Reduced Motionではノイズを静止表示します。期限はタブを離れている間も進み、表示へ戻った時と各操作・応答の前後に検査されます。時間切れになると、虫・本ライオン・光線銃を隠して暗い死亡画面と「もう一度」を表示し、期限後に返る通信・画像・移動・ビームの処理は無効になります。虫を除去した時点でタイマーとノイズを止め、再プレイで全状態を初期化します。最初の核心での移動到着後には、「あれ、進んでも音が大きくならない。」という観察を一度だけ追加します。

入口では、同じ元モデルの扉が開く動画を最後まで再生してから虫を表示します。扉を開く映像は独立した `door-manifest.json` で管理し、既存の歩行素材を変更しません。

媒体エラーやReduced Motionでは到着静止画へ移り、理由を会話欄に表示します。報酬画像は成功・エラー・有限時間のタイムアウトのいずれでも文章による次の操作へ進めます。動画・画像のURLにはマニフェストのrevisionを付けてキャッシュを更新します。3Dモデルは公開配信しません。ページをBFCacheから復元した場合は、音・会話・移動・戦闘を初期状態へ戻します。

## 本ライオンの返答アニメーション

会話中の本ライオンは画面中央に配置します。「はい」はニコニコ顔で下に2pxだけ一度うなずきます。「いいえ」は静かに目を閉じ、左右に2.5度・3pxだけ一度首を振ります。「関係ない」は丸い目の黒目を大きくし、目の間隔を狭めた虚無顔で、片側へ2度だけ首をかしげて戻ります。待機中の上下動はなく、動きは0.6〜0.9秒で終わります。同じ答えが続いても動きが再生され、動きを減らす設定では表情の切り替えだけを行います。画像の読み込み失敗時は通常の立ち絵を維持します。採用画像と生成条件は `design/hon-lion-round-reactions.provenance.json` を参照してください。

## 検証

    npm test
    npm --prefix worker install
    npm run check:worker
    npm run test:worker
    npm run build
    npm run check:static
    node scripts/check-source-snapshot.mjs
    npm run check:live

`npm test` はブラウザーを使わず、会話からクリア・再プレイまでの状態遷移、移動完了の待機、ライブ応答が時間切れになった後の再入力を検証します。Workerテストは公式APIのリクエスト形式、入力上限、Origin、鍵の発行条件とエラー処理を検証します。モックのテストは実モデルの精度確認の代わりにはなりません。

スマホでは「質問する」「答えを伝える」で入力欄を表示し、入力欄へのタップでキーボードを開きます。背景はレイアウトの大きさを保ち、会話欄を表示可能領域に合わせます。`npm test` では表示領域の変化・ズーム・ページ復帰も検証します。Python版Playwrightと対象ブラウザーが利用可能な環境では、ローカル配信中に `python3 tests/browser-smoke.py --url http://127.0.0.1:8796/ --keyboard-only --browser chromium`（Safari系は `--browser webkit`）で入力・送信・エラー・回転を確認できます。ブラウザーの実行パスを指定する場合は `--executable-path` を追加します。この検証はAPIとキーボードの表示領域を模擬しており、実機のOSキーボード確認とは区別します。

チャットPOSTは完全一致するOriginとJSONだけを受け付けます。本文16KiB、質問180文字、履歴6件までです。公開版はログイン不要です。Origin検査は認証ではありません。staging・productionではCloudflareのRate Limiting bindingで、同じ接続元IPからの有効な質問を1分30回に制限します。両APIパスで同じカウンターを使い、超過時は429と`Retry-After: 60`を返します。入力は残るので約1分後に再送できます。bindingやCloudflareの接続元IPが欠ける場合、制限処理が失敗する場合は503で停止し、JEVを呼びません。ローカル環境の動作は変わりません。

同じネットワークの利用者は制限を共有します。カウンターはCloudflareの拠点単位で結果整合となるため、厳密な課金上限ではありません。[Cloudflare Rate Limiting公式仕様](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## Cloudflareでの試験配信

本ゲームはCloudflare Workers Static Assetsで画面・画像・動画を配信し、同じWorkerのAPIからJEVを呼びます。ローカルのルートプレビューと試験Workerでは `/api/hon-lion/chat`・`/api/hon-lion/status` を使い、本番のゲームマウントでは `/turtle-soup/manor/api/chat`・`/turtle-soup/manor/api/status` を使います。`apps/akashic-games-platform` は本番ドメインに未接続の別のARG用基盤で、本ゲームの単体試験には使用しません。

`npm run check:cloudflare` は公開ファイルを生成・検査し、`hon-lion-riddle-staging` 向けのWorkerをローカルでビルドするだけです。Cloudflareへのアップロード、キー登録、DNS変更は行いません。APIパスはHTMLへのフォールバックより先にWorkerが処理します。

試験配信先は専用の `hon-lion-riddle-staging.<アカウントのサブドメイン>.workers.dev` です。実際のURLは配信後にCloudflareから返されます。配信はCloudflareにログインした環境で `npm run deploy:staging` を実行します。試験Workerでも `/turtle-soup/manor/` を確認でき、`/turtle-soup/manor` はクエリ文字列を保ったまま末尾スラッシュへ308リダイレクトします。ルートの `http://127.0.0.1:8796/` は既存のローカルプレビューとして引き続き使えます。

`worker/.dev.vars` のキーはローカル専用で、配信されません。JEVを有効にする場合は同じstaging Workerに `TYPESAFE_API_KEY` をSecretとして別途登録します。未登録なら接続状態は `configured: false` になり、質問は503を返します。試験配信にも本番と同じIP単位の呼び出し制限を適用します。APIキーはSecretとしてWorkerにだけ置き、静的ファイルやブラウザーへ渡しません。

本番URLは `https://games.escape-safari.com/turtle-soup/manor/` です。`worker/wrangler.toml` の production 環境には `games.escape-safari.com/turtle-soup/manor*` の本番ルートを置いています。Cloudflareのルートパターンはクエリ文字列を別に判定できないため、Worker側でパスを厳密に検査し、`manor-other` などの近似パスは既存オリジンへ通過させます。`/turtle-soup/manor/` 以下の静的要求だけ、Workerがマウント接頭辞を除いてStatic Assetsへ渡します。2026-10-20にこの経路を本番Workerへ接続し、JEVのキーをWorker Secretへ登録しました。

公開時はCNAME先 `emrum01.github.io` と既存のGitHub Pages配信は保持します。Cloudflareのプロキシは2026-10-20に有効化しました。この変更は、既存ゲームを含むホスト全体のHTTPS・キャッシュ挙動にも影響するため、manor用のガード付きルート追加と同じ作業として扱います。切り戻しはmanor用ルートだけを削除してDNSをDNS-onlyへ戻し、CNAME先と既存配信は残します。

ブラウザーへJEVのキーは渡しません。ゲームは本番パスではゲーム相対のAPIを使い、ルートプレビューでは従来のAPIを使います。`?demo=1` は明示的なローカルデモ用で、接続状態が設定済みならWorkerのライブ判定へ切り替わります。未設定のライブ接続をデモ判定へ自動フォールバックさせません。

## 公開URL（2026-10-20）

- 本番: https://games.escape-safari.com/turtle-soup/manor/
- 確認用: https://hon-lion-riddle-staging.emrum01.workers.dev/turtle-soup/manor/

本番Workerは `hon-lion-riddle`、確認用Workerは `hon-lion-riddle-staging` です。両方にJEVのSecretと1分30回のチャット制限を登録しています。本番では `workers.dev` とpreview URLを無効にし、manor専用ルートで配信します。

通常の本番更新は、CloudflareのWorker編集・ルート編集・ゾーン参照権限を持つ環境で `npm run deploy:production` を実行します。初回公開は既存のCLI認証がWorker編集だけに限定されていたため、同じ本番変数・bindingでWorkerを作成してから、Cloudflareの管理画面で専用ルートとDNSプロキシを接続しました。既存CNAME先は `emrum01.github.io` です。


## mainへのマージ後の自動デプロイ

`.github/workflows/hon-lion-riddle-ci.yml` は、このゲームのディレクトリまたは同workflowに変更がある `main` へのpushで起動します。PRではオフライン検証のみを実行し、マージ後はテスト・型検査・公開allowlist検査・staging/productionのdry runが成功してからWranglerの `production` 環境で本番Workerを更新します。GitHub Actionsの同workflowを `main` で手動実行して再デプロイすることもできます。

本番ジョブは直列に実行し、デプロイ開始前に最新mainとゲーム・workflowの内容を比較します。新しい変更があれば古い実行をスキップし、無関係なディレクトリだけの変更ではスキップしません。配信後は `node scripts/check-deployment.mjs` で、公開されたHTML・JavaScript・CSS・JSON・SVGがそのビルドと一致すること、およびJEVのSecretとレート制限bindingが設定済みであることを確認します。この確認は有料のチャットAPIを呼びません。

初回設定はGitHubの `hon-lion-production` Environmentに行います。デプロイ可能なブランチを `main` に限定し、以下を登録してください。

- Environment secret `CLOUDFLARE_API_TOKEN`: 本番の `hon-lion-riddle` 単体のEditor権限と、`escape-safari.com` のWorkers Routes編集・Zone参照に限定した専用Account API token（[Cloudflareの権限仕様](https://developers.cloudflare.com/workers/authorization/workers/)）。
- Environment variable `CLOUDFLARE_ACCOUNT_ID`: 本番WorkerがあるアカウントID。

依存の導入・公開ファイル生成・dry runは資格情報なしで行い、トークンはWranglerを実行するデプロイstepだけに渡します。`TYPESAFE_API_KEY` は登録済みのWorker Secretをそのまま使い、GitHubや公開ファイルへ複製しません。トークンの失効・権限不足・未登録はジョブを失敗させます。失敗した場合はGitHub Actionsのログで原因を修正してから、最新mainのworkflowを再実行してください。切り戻しはゲーム変更をrevertするPRをmainへマージすると同じ経路で反映されます。
