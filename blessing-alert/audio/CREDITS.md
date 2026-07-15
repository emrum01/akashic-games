# 効果音クレジットとライセンス

ゲーム同梱音声は、Sonniss GDC 2026 Game Audio Bundle の商用音源と CC0
録音を本作向けに加工したものです。原素材の追跡可能性を保つため、表示義務の
有無にかかわらず出典と加工内容を記録します。

## Sonniss GDC 2026 Game Audio Bundle

- 配布ページ: https://gdc.sonniss.com/
- 公式トラックリスト:
  https://docs.google.com/spreadsheets/d/1MkoGwA6FfgNXhye9wLnY0gNLvjEp4H2iYXM1YxMI6Qs/edit?usp=sharing
- ライセンス: https://sonniss.com/gdc-bundle-license/
- 取得日: 2026-07-15

GDC Bundle License は、ゲームを含む個人・商用プロジェクトでの加工・同期利用を
認め、帰属表示を要求しません。原音のままの販売・素材集としての再配布は禁止、
AI/ML 学習への利用は禁止です。リポジトリにはゲームへ組み込んだ加工済み OGG
だけを置き、抽出した原 WAV はコミット・配布しません。

### 使用原音

- **Epic Stock Media — HD Lock And Mechanism Sound Design Kit**
  - https://sonniss.com/sound-effects/hd-lock-and-mechanism-sound-design-kit/
  - `MECHLtch_Click Deep Mechanism Latch Button Nearfield Thunk 02_ESM_HDLM.wav`
- **Federico Soler — Effective Trailer Booms Vol. 2**
  - https://sonniss.com/sound-effects/effective-trailer-booms-vol-2/
  - `EffectiveTrailer_Booms_Vol2_075.wav`
- **Cinematic Sound Design — Sci-Fi Drones**
  - https://sonniss.com/sound-effects/sci-fi-drones/
  - `Dark Industrial Ambience.wav`
- **Cinematic Sound Design — Ultra Transitions & Impacts**
  - https://sonniss.com/sound-effects/ultra-transitions-impacts/
  - `Transition Braam Slow Dark Creepy.wav`
- **Epic Stock Media — Halloween Game: Haunted House and Horror Audio Scare Kit**
  - https://sonniss.com/sound-effects/halloween-game-haunted-house-and-horror-audio-scare-kit/
  - `GORESplt_Gore Designed Transient Heavy Impact Smash 01_ESM_HALG.wav`
- **Jake Fielding — Cinematic Horn Braams**
  - https://sonniss.com/sound-effects/cinematic-horn-braams/
  - `DSGNBram____Cinematic Horn Braam, Epic, Cinematic, Dark, Instrument, Huge-32.wav`
- **The Noisery — Moaning Metal**
  - https://sonniss.com/sound-effects/moaning-metal/
  - `DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav`
  - `DSGNTonl_Metal Scrape Low Tonal LFE 4_The Noisery_Moaning Metal.wav`

### ゲーム同梱ファイルと加工

- `message-click.ogg`: Deep Mechanism Latch の実録接点音。ログ送信用の乾いた
  「カタッ」を残して帯域・ピークだけを調整。
- `relay-click.ogg`: 同じラッチを短縮・低音化し、選択、取消、戻る用の機械接点へ。
- `instruction-signal.ogg`: 本作専用に合成した、無人の館内放送の案内開始信号。
  低めの金属打音を3音だけ鳴らし、わずかな不協和、狭い残響、59 Hzの放送機ハム、
  薄いピンクノイズを加えた。明るい学校チャイムや既存の警報旋律は使わない。
- `broadcast-alarm.ogg`: 本作専用に合成した、館内放送風の切迫した反復警報。
  低い鉄琴／ビブラフォン状の3音（下降を含む）を二度反復し、左右差、狭い残響、
  59 Hzのハム、薄い放送機ノイズを加えた。実在する地震・気象警報の旋律を複製しない。
- `metal-impact.ogg`: Horror Audio Scare Kit の重いトランジェントを、解除・確定用の
  短い筐体衝撃へ調整。
- `low-impact.ogg`: Geofon 収録の低い金属衝撃を、写真表示・暗転用に整音。
- `reveal-stinger.ogg`: Dark Creepy BRAAM、重いトランジェント、Geofon 低音を
  レイヤーし、正体判明時の4.8秒の不穏な衝撃へ。
- `bad-approach.ogg`: Dark Industrial Ambience と低い金属LFEを重ね、旧サイレンを
  使わない接近圧へ。
- `bad-celebration.ogg`: 実録ホーン由来の Huge BRAAM に上方の完全5度を薄く重ね、
  別調の低い金属LFEと Boom を衝突させた8.6秒の禍々しい祝祭音。

既存の効果音は48 kHzのOpus-in-Oggです。館内放送の二音はFFmpegの合成音を
ステレオでレンダリングし、ほかのステレオ原音も空間と低域の厚みを保つため
ステレオのまま使用しています。

モバイルSafariの互換性確保のため、同梱の各 `.ogg` を FFmpeg で AAC 128 kbps の
`.m4a` に変換して併置しています。`game.js` はブラウザの対応状況に応じて選択し、
デコード失敗時はもう一方の形式へリトライします。

現行のゲーム実行時は、割り込み警報と鯨の唸り声を同梱サンプルで主再生します。
ブラウザで取得またはデコードに失敗した場合だけ `game.js` のプロシージャル合成へ
フォールバックします。

## 鯨声（今回の差し替え：ElevenLabs）

今回の `distant-high-pitch` / `high-pitch-recede` は、ユーザー支給の ElevenLabs
生成音源を原素材として制作しました。ユーザー自身が生成した音源であり、本作での
利用についてユーザーから支給・許諾されています。

- 原素材: `source-elevenlabs/ElevenLabs_ホラーの要素を加えたクジラの歌、不気味で不安を誘う.mp3`
- 出典: ElevenLabs 生成、ユーザー支給
- 原素材仕様: 2.09秒、44.1 kHz stereo、`mean_volume -17.0 dB`、
  `max_volume -0.9 dB`

加工レシピ（FFmpeg）:

- 共通: 48 kHz stereoへ変換し、`atempo=0.55`〜`0.58` のタイムストレッチを主軸にした。
  速度・ピッチ違いの枝には `asetrate` → `aresample=48000` を使い、
  `acrusher`（bits 9〜10、薄いmix）で壊れた放送越しの質感を加えた。最終段は
  `alimiter=limit=0.82`、`loudnorm`、`volume=1.4` とし、最大ピークに余裕を残した。
- `distant-high-pitch.ogg` / `.m4a`: 主声は `atempo=0.55`、4200 Hzローパス、
  軽い `acrusher` とコンプレッサー。93%速度の低い声を `atempo=0.56` で伸ばし
  2250 ms遅延、76%速度の低音層を180 Hzローパス・160 ms遅延で薄く重ねた。
  `amix` 後に `aecho=640|1280|2180|3180 ms`（減衰 0.22|0.13|0.08|0.04）を
  追加し、0.7秒フェードイン、1.4秒フェードアウトで9.2秒に整えた。
- `high-pitch-recede.ogg` / `.m4a`: 主声は `atempo=0.56`、3000〜4000 Hz帯域。
  90%速度の低い声を1900 ms遅延、72%速度の低音層を220 Hzローパス・350 ms遅延で
  重ねた。反響後の3区間をクロスフェードしながら、0〜3.1秒は3800 Hz／音量1.0、
  2.75〜5.9秒は1800 Hz／0.58、5.55〜8.4秒は550 Hz／0.20へ狭め、1.7秒の
  フェードアウトで高域・音量が遠ざかるようにした。

出力は48 kHz stereoのネイティブVorbis 128 kbps Oggと、FFmpeg AAC 128 kbps M4Aを
併置しています。

## 鯨声（旧素材・現行4ファイルでは未使用）

NOAA PMEL Acoustics Program の公開録音を使用しました。米国連邦政府機関の記録の
ためパブリックドメインですが、出典を明記します。

- `source-noaa-whale/noaa_humpback_alaska.wav`: ザトウクジラ、実時間録音、8000 Hz
  mono。出典: NOAA PMEL Acoustics Program、
  https://www.pmel.noaa.gov/acoustics/whales/sounds/whalewav/akhumphi1x.wav
  （掲載元: https://www.pmel.noaa.gov/acoustics/whales/sounds/sounds_whales_hump.html）
- `source-noaa-whale/noaa_blue_nepacific.wav`: シロナガスクジラ、原音10倍速の可聴化
  録音、8000 Hz mono。出典: NOAA PMEL Acoustics Program、
  https://www.pmel.noaa.gov/acoustics/whales/sounds/whalewav/nepblue24s10x.wav
  （掲載元: https://www.pmel.noaa.gov/acoustics/whales/sounds/sounds_whales_blue.html）
- 代替候補として確認した `Humpbackwhale2.ogg`: Wikimedia Commons、Spyrogumas、
  CC0 1.0。最終4ファイルには未使用。
  https://commons.wikimedia.org/wiki/File:Humpbackwhale2.ogg

旧加工レシピ（FFmpeg）:

- `distant-high-pitch.ogg` / `.m4a`: ザトウクジラの25.5–29.1秒と41.3–44.9秒を
  それぞれ約2.4倍へピッチアップし、高域を主役にした。600 Hzハイパス、1600 Hzの
  プレゼンスEQ、4200 Hzローパス、`acrusher` を薄く適用し、240/480 msの短い反響と
  0.75秒フェードイン、終端フェードを加えた。シロナガスクジラの4.6–12.4秒は約
  0.32倍へピッチダウンし、90 Hzを8 dB持ち上げた350 Hzローパスの低音層として重ねた。
  最後に軽いリミッターと `loudnorm=I=-23:LRA=8:TP=-2.0` を適用。
- `high-pitch-recede.ogg` / `.m4a`: ザトウクジラの25.5–33.5秒を約2.4倍へピッチアップし、
  3区間を3600 → 2000 → 720 Hzのローパス、音量1.0 → 0.67 → 0.25でつないだ。
  シロナガスクジラの4.6–12.6秒も350 → 230 → 140 Hzへ区間ごとに狭め、音量を
  0.52 → 0.27 → 0.10へ落とした。約8秒の間に高域と音量が失われ、反響だけが残るよう
  1.5秒のフェードアウトを加えた。

両方とも48 kHz、Vorbis 128 kbpsのOggとAAC 128 kbpsのM4Aを併置しています。使用した
  FFmpegビルドには `libvorbis` がなく、ネイティブ `vorbis` エンコーダがmonoを受け付け
  なかったため、Oggは同一信号を左右に複製した2chで書き出しました。

## CC0 原素材

以下は 2026-07-15 に OpenGameArt および Wikimedia Commons から取得しました。

- **Wind** — IgnasD
  - https://opengameart.org/content/wind
  - License: CC0 1.0
  - 使用原音: `wind.zip` 内 `Wind2.ogg`
- **Tree Creaking** — AntumDeluge（原録音: Department64）
  - https://opengameart.org/content/tree-creaking
  - License: CC0 1.0
  - 使用原音: `tree_creak.ogg`
- **Humpbackwhale2** — Spyrogumas
  - https://commons.wikimedia.org/wiki/File:Humpbackwhale2.ogg
  - License: CC0 1.0 / Own work
  - 使用原音: `Humpbackwhale2.ogg`

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

- `wind-loop.ogg`: `Wind2.ogg` を帯域調整、ラウドネス正規化、ループ端をフェード。
- `structural-creak.ogg`: `tree_creak.ogg` を3.2秒へ短縮し、帯域・音量・終端を調整。

## 再生時フォールバック

加工には FFmpeg を使用しました。ブラウザで素材の取得またはデコードに失敗した
場合、`game.js` は Web Audio で作る低域、ノイズ、接点音へフォールバックします。
フォールバックは実在する地震速報・気象警報の旋律、音程列、周期を複製しません。
