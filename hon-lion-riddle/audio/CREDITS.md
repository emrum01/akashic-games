# 効果音の出典と加工

全素材はFreesoundのCC0。`akashic-freesound-sfx` の `search` / `get` で取得したHQ MP3プレビューを `source-freesound/` に保管する。原本・出典は公開静的ファイルへコピーしない。ゲーム内では派生Ogg/Opus・M4A/AACだけを配信する。

- Wet Sloppy Eating.wav by bbrocer (Freesound #382673, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/382673/
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
| room-texture | 382673 + 816237 + 477710 | 実際の咀嚼音から短い5片を切り出し、歯の接触を感じさせるクランチと、齧りながら動く短い擦れ音を重ねる。26秒に5つの疎な塊。塊の外はデジタル無音。真相の前後で同じ音・同じ音量。 |
| key | 650513 | 金属鍵の短い接触音。高域整理、端のフェード。鍵の受け取り。 |
| weapon-ready | 182252 | 金属機構を0.45秒に整理。戸棚から光線銃を受け取る時の準備音。 |
| door | 342710 + 590151 | 錠の接触と木の軋み。2.95秒、実際の扉動画の長さに合わせて再生。 |
| presence | 271945 | 高域整理した不穏なスティンガー。虫の画像が見えた時に一度だけ再生。 |
| discharge | 567308 + 539972 | PlasmaCannonの初速と短い噴出を1.34秒に圧縮。約4秒の照射演出に合わせて再生し、発射後約4.45秒で虫を除去する。 |

再生成: `python3 scripts/build-audio.py`（FFmpeg必須）。反復音のみ更新する場合は `--only room-texture` を付ける。48kHz/mono、Opus 112kbpsとAAC 160kbps。Web Audioの共通バスで音量・消音・非表示時の停止を管理する。素材失敗時は音の手がかりだけを合成で維持し、読込み後に遅れて効果音を鳴らさない。

## クリエイター観点での見直し

- 旧版の同一の上昇音を鍵・銃の両方に使う演出を廃止。物が手元に来た感覚へ置き換えた。
- PlasmaCannon（#567308）はユーザーのフィードバックを受け、強い放電の主素材として1.34秒へ圧縮して採用した。
- 「サリサリ自体を齧る音にし、齧りつつ動く音も入れる」という指定に合わせ、咀嚼素材を短片として採用。咀嚼を主、クランチを歯の接触、擦過音を小さな移動として重ねる。連続した有機音・暖かなクラックル・低音の持続層は作らない。
- 咀嚼は280Hz以下、擦過音は900Hz以下を抑え、端をフェードする。5つの塊を26秒に配置し、塊の外はデジタル無音。真相が分かっても音色・音量・距離は変えず、虫の除去で止める。
- 反復音全体のRMS目標は従来と同じ約-29.93dBFS。音色と塊の長さは今回の指定で変更している。フォールバックは短い脈動と小さな擦れを合成し、実録素材の近似として扱う。
- 質問の正誤、文章送り、移動ごとに通知音を追加しない。除去後は完全な無音を保ち、クリアのファンファーレも足さない。
- 実装レビューで、素材取得に失敗した鍵・扉にも反復音の合成ノイズを流す案は意味が混ざるため撤回。失敗した単発音は無音にし、物語に必要な反復音だけをフォールバックで残す。

選定と見直しは出典・波形/音量測定・演出のタイミング・ブラウザ上の再生状態で実施。今回の変更では人間による試聴検証を実施していない。
