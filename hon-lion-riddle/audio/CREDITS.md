# 効果音の出典と加工

全素材はFreesoundのCC0。`akashic-freesound-sfx` の `search` / `get` で取得したHQ MP3プレビューを `source-freesound/` に保管する。原本・出典は公開静的ファイルへコピーしない。ゲーム内では派生Ogg/Opus・M4A/AACだけを配信する。

- Wet Sloppy Eating.wav by bbrocer (Freesound #382673, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/382673/ — **未使用・旧候補（保管のみ）**
- Lock 3 - Remove Key 2.wav by SpaceJoe (Freesound #342710, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/342710/
- Leather Stress 3 (Short) by Crinkem (Freesound #501013, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/501013/ — **未使用・旧候補（保管のみ）**
- Fire Burst Flash by Za-Games (Freesound #539972, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/539972/
- Creaking Wood 4.wav by Greg_Surr (Freesound #590151, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/590151/
- Electric zap.wav by michael_grinnell (Freesound #512471, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/512471/ — **未使用・旧候補（保管のみ）**
- crackling fire stereo.wav by oldbean3 (Freesound #658872, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/658872/ — **未使用・旧候補（保管のみ）**
- Light Wood Surface Hard Scratching 1_1 by Joao_Janz (Freesound #477710, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/477710/
- Crunch by qubodup (Freesound #816237, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/816237/
- loy's gun cock+bullet in-clip.wav by martian (Freesound #182252, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/182252/
- keys jingling.wav by MeganH2304 (Freesound #650513, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/650513/
- Stingers and Stabs 001.wav by OverlookHotelRecords (Freesound #271945, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/271945/
- PlasmaCannon.wav by BigDino1995 (Freesound #567308, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/567308/

## 採用内容

| 配信名 | 素材ID | 加工・役割 |
|---|---|---|
| room-texture | 477710 + 816237 | モノラル、高域通過、ゲート処理した乾いた擦過音とクランチを26秒に5つの疎な塊で配置。塊の外はデジタル無音。真相の前後で同じ音・同じ音量。 |
| key | 650513 | 金属鍵の短い接触音。高域整理、端のフェード。鍵の受け取り。 |
| weapon-ready | 182252 | 金属機構を0.45秒に整理。戸棚から光線銃を受け取る時の準備音。 |
| door | 342710 + 590151 | 錠の接触と木の軋み。2.95秒、実際の扉動画の長さに合わせて再生。 |
| presence | 271945 | 高域整理した不穏なスティンガー。虫の画像が見えた時に一度だけ再生。 |
| discharge | 567308 + 539972 | PlasmaCannonの初速と短い噴出を1.34秒に圧縮。発射後1.4秒で虫を除去する。 |

再生成: `python3 scripts/build-audio.py`（FFmpeg必須）。48kHz/mono、Opus 112kbpsとAAC 160kbps。Web Audioの共通バスで音量・消音・非表示時の停止を管理する。素材失敗時は音の手がかりだけを合成で維持し、読込み後に遅れて効果音を鳴らさない。

## クリエイター観点での見直し

- 旧版の同一の上昇音を鍵・銃の両方に使う演出を廃止。物が手元に来た感覚へ置き換えた。
- PlasmaCannon（#567308）はユーザーのフィードバックを受け、強い放電の主素材として1.34秒へ圧縮して採用した。
- 咀嚼と暖かなクラックルを使った旧テクスチャ案は、連続した有機音と低い層を残すため撤回し、旧素材を未使用・保管扱いにした。
- 反復音はピーク基準の正規化だけに頼らず、乾いた高域通過素材を短い塊へ加工した。塊の外はデジタル無音で、音の変化で答えを教えない。
- 反復音は21秒5回から26秒5回へ変更し、各塊の間（ループ境界を含む）の無音を1秒ずつ延長した。頻度は約19%減。音色・各塊の長さ・音量を維持し、無音追加によるRMS正規化の増幅を補正する。Opusのデコード後RMSは約-30.27dBFSで、各塊の音量は旧版と一致。AACも差は0.11dB以内。
- 質問の正誤、文章送り、移動ごとに通知音を追加しない。除去後は完全な無音を保ち、クリアのファンファーレも足さない。
- 実装レビューで、素材取得に失敗した鍵・扉にも反復音の合成ノイズを流す案は意味が混ざるため撤回。失敗した単発音は無音にし、物語に必要な反復音だけをフォールバックで残す。

選定と見直しは出典・波形/音量測定・演出のタイミング・ブラウザ上の再生状態で実施。今回の変更では人間による試聴検証を実施していない。
