# 効果音クレジットとライセンス

ゲーム同梱音声は、Sonniss GDC 2026 Game Audio Bundle の商用音源と、Freesound 等の
CC0 録音を本作向けに加工したものです。原素材の追跡可能性を保つため、表示義務の
有無にかかわらず出典と加工内容を記録します。

## Sonniss GDC 2026 Game Audio Bundle

- 配布ページ: https://gdc.sonniss.com/
- 公式トラックリスト: https://docs.google.com/spreadsheets/d/1MkoGwA6FfgNXhye9wLnY0gNLvjEp4H2iYXM1YxMI6Qs/edit?usp=sharing
- ライセンス: https://sonniss.com/gdc-bundle-license/
- 取得日: 2026-07-15

GDC Bundle License は、ゲームを含む個人・商用プロジェクトでの加工・同期利用を
認め、帰属表示を要求しません。原音のままの販売・素材集としての再配布は禁止、
AI/ML 学習への利用は禁止です。リポジトリにはゲームへ組み込んだ加工済み音声だけを
置き、抽出した原 WAV はコミット・配布しません。

主な原音:

- Epic Stock Media — HD Lock And Mechanism Sound Design Kit: `MECHLtch_Click Deep Mechanism Latch Button Nearfield Thunk 02_ESM_HDLM.wav`
- Federico Soler — Effective Trailer Booms Vol. 2: `EffectiveTrailer_Booms_Vol2_075.wav`
- Cinematic Sound Design — Sci-Fi Drones: `Dark Industrial Ambience.wav`
- Cinematic Sound Design — Ultra Transitions & Impacts: `Transition Braam Slow Dark Creepy.wav`
- Epic Stock Media — Halloween Game: Haunted House and Horror Audio Scare Kit: `GORESplt_Gore Designed Transient Heavy Impact Smash 01_ESM_HALG.wav`
- Jake Fielding — Cinematic Horn Braams: `DSGNBram____Cinematic Horn Braam, Epic, Cinematic, Dark, Instrument, Huge-32.wav`
- The Noisery — Moaning Metal: `DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav`, `DSGNTonl_Metal Scrape Low Tonal LFE 4_The Noisery_Moaning Metal.wav`

## ゲーム同梱ファイルと加工

以下の各項目は、同名の `.ogg` / `.m4a` 最終ファイルを指します。Ogg は 48 kHz
Vorbis、M4A は互換用の AAC 128 kbps です。

- `structural-creak.ogg` / `.m4a`: Sonniss の Moaning Metal と CC0 Tree Creaking（AntumDeluge／Department64、https://opengameart.org/content/tree-creaking）を短く切り、帯域・音量・終端を整えた BAD END 突入時の一発音。
- `bad-approach.ogg` / `.m4a`: Freesound #794270（slime）、#454622（gore）、#30928（rip/tear）を低域と湿った成分が残るよう重ね、長い接近圧へ加工。
- `message-click.ogg` / `.m4a`: Sonniss の Deep Mechanism Latch を短く整音し、ログ送信用の乾いた接点音に加工。
- `relay-click.ogg` / `.m4a`: 同じラッチ素材を短縮・低音化し、選択・取消・戻る用の柔らかい機械接点に加工。
- `metal-impact.ogg` / `.m4a`: Sonniss の重いトランジェントを短い筐体衝撃へ調整。
- `low-impact.ogg` / `.m4a`: Sonniss の Geofon 収録の低い金属衝撃を写真調査の暗転用に整音。
- `instruction-signal.ogg` / `.m4a`: Sonniss 素材を基に、本作専用の低い金属3音、狭い残響、59 Hz ハム、薄い放送機ノイズへ合成。
- `broadcast-alarm.ogg` / `.m4a`: 本作専用合成のビブラフォン風反復警報（G→C→E→G上行アルペジオ×2反復、トレモロ＋帯域制限。実在の警報旋律は複製していない）。
- `reveal-stinger.ogg` / `.m4a`: Sonniss の Dark Creepy BRAAM、重いトランジェント、Geofon 低音をレイヤーし、正体判明時の不穏な衝撃へ加工。
- `bad-celebration.ogg` / `.m4a`: Sonniss の実録ホーン BRAAM、Boom、低い金属 LFE を衝突させ、BAD END の持続する祝祭音へ加工。
- `ambient-bed.ogg` / `.m4a`: Freesound #799536（analog video hum）と #466123（深夜の室内 room tone）を CRT 帯域へ整え、継ぎ目を処理したループへ加工。
- `bell-distant.ogg` / `.m4a`: Freesound #824588（St Peters Church の遠い鐘）を伸長・帯域制限し、壊れた遠距離放送の鐘へ加工。
- `bell-recede.ogg` / `.m4a`: Freesound #390200（Bell 03）を伸長し、時間経過に合わせて高域と音量を狭める鐘の遠ざかりへ加工。
- `reveal-subtle.ogg` / `.m4a`: Freesound #794270（slime stretching）を短く抽出・低音を整理し、擬態の最初の剥がれを示す微細な湿音へ加工。
- `reveal-partial.ogg` / `.m4a`: Freesound #454622（gore）と #30928（rip/tear）を薄くレイヤーし、部分露出の湿った身体音へ加工。
- `photo-appear.ogg` / `.m4a`: Sonniss の低い衝撃と遷移音を短く整え、写真表示・GOOD END の TV 復帰に使うフルレンジの出現音へ加工。
- `tv-off.ogg` / `.m4a`: Freesound #693859（On/Off Button）を短く切り、ローファイの筐体感と消灯の余韻を残す音へ加工。
- `burn.ogg` / `.m4a`: Freesound #528662（Paper Burn）を切り出し、焼き切りの終端が残るよう帯域・音量・フェードを調整。
- `confirm-latch.ogg` / `.m4a`: Sonniss の Lock And Mechanism Latch を短く加工し、選択確定のラッチ音へ調整。

### 廃止・差し替えたファイル

- `wind-loop.ogg` / `.m4a`: CC0 の `Wind2.ogg`（https://opengameart.org/content/wind）を加工した旧風ループ。**2026-07-15 廃止・ambient-bed に差し替え**。
- `distant-high-pitch.ogg` / `.m4a`: ユーザー支給 ElevenLabs 生成の旧鯨声。**2026-07-15 廃止・bell-distant に差し替え**。
- `high-pitch-recede.ogg` / `.m4a`: 同じ ElevenLabs 生成音源を遠ざかる音へ加工した旧鯨声。**2026-07-15 廃止・bell-recede に差し替え**。

## CC0 原素材

以下は 2026-07-15 に取得した Freesound の CC0 1.0 録音です。各ページのライセンス表記も
併せて確認しています。

- St Peters Church, Kinver - Distant Tolling Bell by TicAshfield (#824588): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/824588/
- Bell 03 by ganapataye (#390200): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/390200/
- Analog video hum by LukaCafuka (#799536): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/799536/
- Interior bedroom apartment night room tone roomtone.wav by franciscopcoutinho (#466123): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/466123/
- Slime stretching and squeezing by greenlinker (#794270): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/794270/
- gore_blood_flesh_gurgle.wav by EricsSoundschmiede (#454622): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/454622/
- rip_tear FLESH!!!!.wav by aust_paul (#30928): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/30928/
- Paper Burn.wav by Soonus (#528662): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/528662/
- On/Off Button by Fission9 (#693859): http://creativecommons.org/publicdomain/zero/1.0/ — https://freesound.org/s/693859/
- Moscow Metro Station Buzzer/Chime 3 by chungus43A (#720570): http://creativecommons.org/publicdomain/zero/1.0/ — **取得のみ・未使用** — https://freesound.org/s/720570/

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

## 旧鯨声の出典

旧 `distant-high-pitch` / `high-pitch-recede` は、ユーザー支給の ElevenLabs 生成音源を
原素材とした。原素材は `source-elevenlabs/ElevenLabs_ホラーの要素を加えたクジラの歌、不気味で不安を誘う.mp3`
であり、本作での利用についてユーザーから支給・許諾されていた。これらのゲーム同梱
ファイルは上記のとおり 2026-07-15 に廃止・差し替え済みである。

## 再生時フォールバック

加工には FFmpeg を使用しました。ブラウザで素材の取得またはデコードに失敗した場合、
`game.js` は Web Audio で作る低域、ノイズ、接点音へフォールバックします。フォールバックは
実在する地震速報・気象警報の旋律、音程列、周期を複製しません。全再生はマスターゲインと
ダイナミクスコンプレッサーを経由し、ブラウザの対応状況に応じて Ogg/M4A を選択します。
