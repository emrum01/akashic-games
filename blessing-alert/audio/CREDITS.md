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

いずれも48 kHzのOpus-in-Ogg。館内放送の二音はFFmpegの合成音をステレオで
レンダリングし、ほかのステレオ原音も空間と低域の厚みを保つためステレオのまま
使用しています。

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
- `distant-high-pitch.ogg`: ザトウクジラの鳴き声を別ピッチで重ね、高音化、軽い歪み、
  短い反響を加えた遠方の1.8秒ワンショット。
- `high-pitch-recede.ogg`: 別の鯨声を高音化し、ピッチ、高域、音量を落としながら
  急速に遠ざけた4.5秒ワンショット。

## 再生時フォールバック

加工には FFmpeg を使用しました。ブラウザで素材の取得またはデコードに失敗した
場合、`game.js` は Web Audio で作る低域、ノイズ、接点音へフォールバックします。
フォールバックは実在する地震速報・気象警報の旋律、音程列、周期を複製しません。
