# 効果音の出典と加工

実録素材はすべてFreesoundのCC0。`source-freesound/`・`source/`・`reveal-v2/source/` のMP3は加工入力として保管し、原本・出典は公開静的ファイルへコピーしない。ゲーム内では派生Ogg/Opus・M4A/AACだけを配信する。採用済みの試聴マスターは `approved-masters/manifest.json` に固定し、FLACもリポジトリで管理する。FLACは再生成用で、公開静的ファイルには含めない。取得・出現音の低い共鳴には独自合成音も重ねている。

追加したCC0入力素材:

- Scratching Fake Nails ASMR.wav by vero.marengere (Freesound #513355, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/513355/
- Metal Door Opening & Closing Horror Sound (3).wav by iammokhtari (Freesound #529719, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/529719/
- Scary Strings Crescendo Slow 1 by MathewHenry (Freesound #684799, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/684799/
- Dark Tension Drone by HarmonicMess (Freesound #826597, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/826597/

- Wet Sloppy Eating.wav by bbrocer (Freesound #382673, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/382673/
- Lock 3 - Remove Key 2.wav by SpaceJoe (Freesound #342710, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/342710/
- Leather Stress 3 (Short) by Crinkem (Freesound #501013, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/501013/
- Fire Burst Flash by Za-Games (Freesound #539972, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/539972/
- Creaking Wood 4.wav by Greg_Surr (Freesound #590151, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/590151/
- Electric zap.wav by michael_grinnell (Freesound #512471, http://creativecommons.org/publicdomain/zero/1.0/) — https://freesound.org/s/512471/
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
| room-texture | 513355 | ユーザー選定のカリカリAをステレオのまま26秒に保持。5つの疎な塊と塊の外のデジタル無音を維持。 |
| key | acquisition v2（650513 + 342710 + 684799 + 826597） | 承認済みの質感と重苦しい演出を2.35秒のステレオマスターとして保持。 |
| weapon-ready | acquisition v2（182252 + 501013 + 684799 + 826597） | 承認済みの機構音と重苦しい演出を2.95秒のステレオマスターとして保持。 |
| door | 529719 + 590151 + 342710 | 承認済みの扉候補を2.95秒のステレオマスターとして保持し、動画の実再生時間に合わせて再生。 |
| presence | reveal v2-A（684799 + 826597 + 590151 + 529719） | 承認済みの沈み込む絶望を4.8秒のステレオマスターとして保持。虫の画像が見えた時に一度だけ再生。 |
| discharge | first-round candidate（567308 + 539972 + 512471） | 承認済みの4.4秒ステレオマスターを放電演出に合わせて再生し、発射後約4.45秒で虫を除去する。 |

採用音はカリカリA（26秒）、鍵v2「質感と重苦しい演出」（2.35秒）、銃取得v2（2.95秒）、扉（動画の実再生時間）、虫の出現v2-A（4.8秒）、放電（4.4秒）。再生成は `python3 scripts/build-audio.py`（FFmpeg必須）、確認は `python3 scripts/build-audio.py --verify`。48kHz/stereo、Opus 112kbpsとAAC 160kbpsで、承認時の音量を保ったまま本番マスター`.65`と相殺するゲインで書き出す。Web Audioの共通バスで音量・消音・非表示時の停止を管理する。素材失敗時は音の手がかりだけを合成で維持し、読込み後に遅れて効果音を鳴らさない。

## 旧版・フォールバック設計メモ

以下は旧版の咀嚼音設計と、録音取得に失敗した場合のフォールバック方針を残すための履歴です。現在の承認済みマスターの加工内容ではありません。

- 旧版では同一の上昇音を鍵・銃の両方に使う演出を廃止し、物が手元に来た感覚へ置き換えた。
- 旧版ではPlasmaCannon（#567308）を強い放電の主素材として1.34秒へ圧縮していた。現在は承認済み4.4秒候補を使用する。
- 「サリサリ自体を齧る音にし、齧りつつ動く音も入れる」という指定に合わせ、咀嚼素材を短片として採用。咀嚼を主、クランチを歯の接触、擦過音を小さな移動として重ねる。連続した有機音・暖かなクラックル・低音の持続層は作らない。
- 咀嚼は280Hz以下、擦過音は900Hz以下を抑え、端をフェードする。5つの塊を26秒に配置し、塊の外はデジタル無音。真相が分かっても音色・音量・距離は変えず、虫の除去で止める。
- 旧版の反復音全体はRMS目標を約-29.93dBFSとしていた。現在は採用済みマスターのRMSとピークを基準にし、配信時だけ本番マスター`.65`と相殺するゲインを適用する。フォールバックは短い脈動と小さな擦れを合成し、実録素材の近似として扱う。
- 質問の正誤、文章送り、移動ごとに通知音を追加しない。除去後は完全な無音を保ち、クリアのファンファーレも足さない。
- 実装レビューで、素材取得に失敗した鍵・扉にも反復音の合成ノイズを流す案は意味が混ざるため撤回。失敗した単発音は無音にし、物語に必要な反復音だけをフォールバックで残す。

選定と見直しは出典・波形/音量測定・演出のタイミング・ブラウザ上の再生状態で実施。カリカリA、鍵2.35秒、虫の出現v2-Aはユーザー試聴で選定し、残りは承認された提案を組み込んだ。
