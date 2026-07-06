# bookcafe-3d 引き継ぎ書（HANDOFF）

このファイルは、実装担当エンジニア交代のための引き継ぎ書です。新任は **これ＋実ファイル `bookcafe-3d.html`＋設計書4本** を読めば作業を継続できます。オーケストレーターが各実装報告から集約したもので、関数名・挙動は正確ですが、**正確な行番号は実ファイルを grep で確認**してください（セッション中に増減しています）。

---

## 0. 成果物と起動・検証

- 成果物: `/Users/hirokiiwakubo/Downloads/bookcafe-3d/bookcafe-3d.html`（単体HTML、約4300+行）。
- 起動: `cd /Users/hirokiiwakubo/Downloads/bookcafe-3d && python3 -m http.server 8777` → `http://localhost:8777/bookcafe-3d.html`。**http経由だとGLB/画像の実体**が出る。file:// 直開きでも自作人型フォールバックで完動。
- デバッグ:
  - `?preview=<genre>` … タイトルを飛ばして即プレイ＋そのジャンルへ変貌（準備完了後に発火）。genre = ishiki/shokai/gossip/tetsu/shizen/occult/chaos。
  - プレイ中の **数字キー 1〜7** = ishiki/shokai/gossip/tetsu/shizen/occult/chaos に即変貌（＝実プレイの変貌と同じ経路。最も信頼できる確認手段）。
  - `?debug=1` … 画面隅にHUD（genre / eventTriggered / reveal状態・残り時間 / **cam pos(x,y,z)・distXZ** / player(x,z)・ROOM_ACTIVE / NPC costumes(letter一覧) / clerk costumes / tex loaded(applied)/tried）。目視でなく数値で検証できる。
- 検証は基本 headless Chromium（Playwright）でスクショ＋HUD読み取り。**視界コーンは改造前(潜入フェーズ)のみ表示**なので、コーン確認は `?preview` でなく通常プレイの潜入中で行う。

## 1. 技術と制約（厳守）

- three.js **r128 UMD**（`vendor/three.min.js`、グローバル `THREE`）。CDN/ESM不可。
- `vendor/GLTFLoader.js` / `vendor/SkeletonUtils.js`（r128 UMD、onerrorガード、`if(THREE.GLTFLoader)`判定）。
- **`fetch` 不使用**（file://ブロック回避）。音声=HTMLAudio、テクスチャ/モデル=Loader。
- **`CapsuleGeometry` 不使用**（r128に無い。人型はCylinder/Box/Sphere/Coneで構成）。
- **新規外部DLはしない**（同梱素材のみ使用）。
- `node --check`（inline script抽出）を必ず通す。RAFループは try/catch 保護（1フレーム例外でも固まらない）。
- **切替/リトライで完全復元**（genreProps/roomProps/solids/ROOM_ACTIVE/roomCircleClamp/巡回ルート/衣装tex/リベール/フォグ/照明 すべてリセット）。
- **性能安全弁**: 共有ジオメトリ、群衆上限14、大量同種は InstancedMesh、mixer LOD（遠いGLBキャラは updateAnim スキップ）、部屋リビルドは変貌時のみ。

## 2. アーキテクチャ（主要関数と役割）※行番号は grep で確認

- **部屋**: `buildBaseShell`（床/天井/4壁を baseRoomMeshes に）/ `buildRoom`（初回：カウンター/装飾本棚含む）/ `buildRoomFor(genre)`（変貌時に殻を撤去→ジャンル別の壁Box群/天井高/床/照明/フォグを roomProps に生成し **solids/ROOM_ACTIVE/roomCircleClamp を設定**）。
- **衝突/範囲**: `ROOM`（最大外寸の定数）/ `ROOM_ACTIVE`（現在の実効bounds、ジャンルで縮小/拡張）/ `solids[]`（内部仕切りAABB）/ `roomCircleClamp`（shizen用の円クランプ、通常null）。`clampToRoom(x,z,pad)` = ROOM_ACTIVE bounds→各solid押し出し→円クランプ。`clampAlongX/Z` = 壁沿い座標クランプ。
- **変貌**: `applyTransformation(genre)`（本3冊 or デバッグ発火の共通経路）→ `applyGenreScene(genre)`（commonTransformFlash＋`buildRoomFor`[**addGenreProps より前に同期実行**]＋rebuildCrowd/swapCustomers＋updateClerkAppearance＋addGenreProps＋setGenreAtmosphere＋startGenreGags）。`updateGenreGags(dt)`（animateループで eventTriggered 時のみ）。
- **リベールカメラ**: `startRevealCam`/`resetRevealCam`、定数 `REVEAL{dur:2.0, dist:13, height:11, lookY, ...}`。変貌直後に店中心(0,1.2,0)を斜め45°俯瞰(dist13/height11)から見せ、約2秒で肩越しへease復帰。tetsu等 暗いジャンルは reveal中フォグ緩和＋hemi/amb底上げ（revealEnvBoost/Restore）。
- **カメラ**: `updateCamera(dt)` … 通常=肩越し(`CAM{dist:5.8, height:2.6, lookY:1.4}`、cameraYaw固定＝移動で回さない、手動 Q/Z)。**wall-aware距離短縮**（壁が背後なら effDist を詰める、下限≈2.0）＋**solidクリップ**（レイ×AABB slab法で仕切り手前まで詰める）。reveal中は別分岐。
- **キャラ**: `makeCharacter(role)`（GLB使えれば `makeGLBInstance`＋プロップ、失敗時 `buildHumanoid` 自作人型に自動フォールバック。返り値は必ず `userData.updateAnim(dt,moving,tempo)`）。GLBは全キャラ**共通メッシュ＋texture差し替え**。`applyCostumeTexture(charGroup, letter)`（material.map を texture-<a〜r>.png へ、needsUpdate/sRGB/flipY踏襲、map無し材質にも付与、装飾小物は costumeAccessory タグで除外、onLoad適用）。`dressHumanoid`/`undressHumanoid`（プリミティブ着衣/小物）。`GENRE_COSTUME_LETTERS`={ishiki:['q','i','j'], shokai:['q','i','j'], gossip:['c','f','n','p'], tetsu:['d','g','r'], shizen:['b','m','k'], occult:['e','l','o'], chaos:['q','i','c','f','d','g','b','m','e','l','o','p','n','k','r','j']}（**'a'=デフォルト衣装は含めない**）。`GLB_TARGET_HEIGHT=1.6`、足元y=0正規化、`CLIP_WALK`/`CLIP_IDLE` 候補配列で findClip。プレイヤーは大きめ明色ニット帽＋薄い明色tintで背後から識別可。
- **群衆**: `rebuildCrowd`/`swapCustomers`（ジャンル別に人数/構成/座標/ポーズ/ラリー/衣装を作り直し。ishiki11/shokai12[勧誘2+カモ1×3+受付3]/gossip10/tetsu6/shizen8/occult6+/chaos13、上限14）。`applyPose`/`POSES`（GLBはクリップ sit/emote-yes/emote-no/static/holding、プリミティブは pivot回転で近似）。
- **会話**: `RALLIES`（genre×話者[cust/clerk]の多往復台本。**player行は削除済み**＝NPCのみ）/ `pickRally(genre,kind,indexHint)`（NPCごとに重複なく巡回割当）/ `onTalk`（Eで rally[idx] を1行ずつ、1周で次パターン。近いNPC対象。巡回店員も対象。tetsu「……」/occult幽霊は1回で消滅 ghostVanish）。
- **拾う/置く**: `onSpace`（床の本を拾う→`showHint('「タイトル」を拾った')`＋ログ、中央棚に置く→3冊で triggerEvent）。
- **警戒/検知**: `updateAlert(dt,seen)`（**手ぶら安全＝carrying時のみ危険**、所持中ハートビート[危険度で可変]、**eventTriggered後は監視無効**＝コーン非表示/警戒bust停止）。`clerkSeesPlayer(c)`（視界コーン内のみ検知、`cone.userData`のhalfAngle/range/cosHalfを単一の真実に、XZ平面、背後横安全、本棚/カウンターLOS遮蔽）。`makeConeMesh`（コーンは店員前方。rotation.x=+π/2で前方へ）。`c.cone.visible=!eventTriggered`（改造前のみ表示）。
- **本のスポーン**: `seedBooks`（全6ジャンル各3冊→minまで補充）/ `spawnFloorBook(genre)` / `topUpDeficientGenres`（`MIN_PER_GENRE=3`、床＋所持で全ジャンル常時3冊確保）/ `updateBooks`。
- **壁掲示**: `addPoster(text,x,y,z,rotY,...)`（**ROOM_ACTIVE基準の内壁面スナップ＋along-wallクランプ**）/ `makePoster`→`makeTextPlane`（CanvasTextureでテキスト生成、**DoubleSide**）。**注意: お札/看板/コルクボード等の一部壁掲示は props*() 内で座標ハードコードされていたが、`wallFaceX/Z(sign)`（ROOM_ACTIVE基準）ヘルパで置換済み**。
- **アセットロード**: `loadGLBTemplate`（human.glb）/ `loadCharacterVariants`（b/c/d）/ `loadPropModels`（props/*.glb 12種を propTemplates にキャッシュ）/ `spawnProp(name,x,y,z,{scale,rotY})`（clone配置、雛形無ければ小Box代替）。ブートチェーンは各段done保証でタイトル表示を妨げない。`charsReady` ガード。
- **音**: `Audio2`（sfx / heartbeat(vol) / BGM cafe・tension クロスフェード。HTMLAudio、失敗時WebAudio合成フォールバック。初回操作でresume）。
- **復元**: `restoreDefaultRoom`（clearRoomProps＋solids=[]＋ROOM_ACTIVE=ROOM＋roomCircleClamp=null＋巡回ルート復元＋殻再生成）/ `restoreFloorWall`（床壁テクスチャ/色を通常へ）/ `resetGame`。プロップ管理: `roomProps[]`/`clearRoomProps()`（建築）と `genreProps[]`/`clearGenreProps()`（内装小物）は分離。

## 3. 実装済み機能（すべて node --check 通過・非破壊で積み上げ）

1. カメラ自動回転を廃止（固定方位・肩越し追従・手動Q/Z）
2. 難易度を「クリア可能」に緩和（DIFF: alertRateStanding14/alertSneakMult0.20/alertDecay30/coneAngleDeg45/coneRange6.0/clerkSpeed1.8/sneakSpeed2.4/pickupSeenSpike30/placeSeenSpike55/carryRiskPerBook0.25/alertMax等）
3. 視界コーン外の誤検知バグ修正＋本棚/カウンターLOS遮蔽（検知math=cone.userData）
4. web由来CC0人体モデル（Kenney Blocky Characters）主読込＋自作人型フォールバック
5. 手ぶら安全・本所持時のみ危険・所持数でリスク増
6. 本所持中ハートビート（警戒度/被視認で速さ・音量可変）
7. 改造成功後(eventTriggered)は監視無効（コーン非表示・警戒/bust/ハートビート停止）
8. 全7ジャンルの改造後バリエーション（客入替/店員変化/プロップ物量/壁ポスター/照明フォグ色/ギャグ）
9. 左右反転バグ修正（strafe符号）
10. 会話無制限化＋「タイトルへ戻る」ボタン常時表示（3回でクリアボタン、強制終了なし）
11. 会話ラリー（多往復・NPCのみ・player行削除・tetsu「……」/occult幽霊消滅/chaos混線）
12. 内装抜本刷新（家具GLB物量・壁ポスター・床壁テクスチャ・InstancedMesh/LOD）
13. 空間モーフ＝**部屋の"形"がジャンル別に変わる**（ishiki高天井ロフト/shokai個室迷路/gossip L字/tetsu高天井霧/shizen丸ドーム/occult歪み聖堂/chaos継ぎ接ぎ）＋**変貌リベールカメラ**（全景→肩越し）＋**衣装差し替え**（GENRE_COSTUME_LETTERS）
- 追加7点: 視界コーンを前方へ＆本棚を部屋内向き（初回）/NPCごとに別セリフ/player行削除/開始カメラ壁埋まり対策(wall-aware)/壁ポスターオフセット/拾得ポップ表示/shokai通路拡張（BFS到達確認）
- 追加: 本棚**作り直し**（背表紙が部屋側-Xに露出・突出、rotation.y=0）/ shokai着地カメラの**solidクリップ**/ 壁掲示の**ROOM_ACTIVE基準化**（addPoster＋ハードコード掲示の wallFaceX/Z 置換）

## 4. 既知の状態（直近の検証で解消済み / 要フォロー・微調整余地）

> **注（オーケストレーター訂正・重要）**: 前任は下記1・2を「解消済み」と書いたが、**直近の実機検証（headless Chromium で実描画）では 1・2 とも依然 再現した**。単体テストは通るが実描画で失敗している状態。**新任は 1・2 を「未解決・要対応」として扱い、`?debug=1` HUD の実測値（cam pos / ROOM_ACTIVE 等）で必ず確認すること**。3 はコーン仕様（バグでない）で前任の記述どおり正しい。着手順: **1（最優先）→2→（3は確認のみ）→ その後 §6 の Eオブジェクト実装**。

### 1【未解決・要対応/最優先】shokai 着地カメラのベージュ埋まり
- **実機検証: 未解消**。`?preview=shokai` の settled で画面がベージュ壁一色（3D空間が見えない）。HUD実測 **cam pos z=8.5 だが shokai ROOM_ACTIVE maxZ=7** ＝カメラが前壁の外/中へ逸脱している。既存の距離短縮＋solidクリップだけでは外壁外への逸脱を防げていない。
- **根治案（未実装）: `updateCamera` の最終カメラ位置を ROOM_ACTIVE 内にクランプ**（pad≈0.5：x∈[minX+pad,maxX-pad], z∈[minZ+pad,maxZ-pad]、y は天井高でクランプ）。距離短縮＋solidクリップ＋この最終クランプの併用で、どの形状でもカメラが室内に留まる（プレイヤー開始(6,6.5)が前壁寄りで背後+Zに出るのが原因）。確認基準＝HUD cam pos が常に ROOM_ACTIVE 内、shokai settled で肩越しに個室が見える。通常/リベール分岐は非破壊。見る関数: `updateCamera`。

### 2【未解決・要対応】壁掲示物が occult 等で見えない
- **実機検証: 未解消**。ROOM_ACTIVE基準化・DoubleSide・buildRoomFor同期先行を入れた後も、**直近検証で occult は3方向とも壁に掲示物が見えなかった**（壁はのっぺり）。傾き/非対称の occult 壁では ROOM_ACTIVE の矩形端と実壁メッシュ位置がズレ、掲示物が宙 or 壁裏に出ている疑い。**まず ?debug 等で掲示物の生成数と各world座標を出力し、実壁面に載っているか確認**。傾きジャンルは ROOM_ACTIVE 矩形でなく**実際の壁メッシュ位置/向きに合わせて配置**する。矩形ジャンル(shokai等)も併せて実機確認。
- 真因（判明済み・対処済みの部分）: お札/看板/コルクボード等は addPoster 経由でなく props*() 内で座標ハードコード（例 x=10.7）だったため、縮んだ改造壁(ROOM_ACTIVE)の外＝裏に隠れていた。addPoster 自体は ROOM_ACTIVE 自己スナップ済みだった。
- 対処済み: `wallFaceX/Z(sign)`＋`clampAlongX/Z`（ROOM_ACTIVE基準）ヘルパを新設し、全ハードコード壁掲示を置換（お札は occult maxX=10 の内側 9.75 へ）。makeTextPlane は DoubleSide。buildRoomFor を addGenreProps より前に同期実行して ROOM_ACTIVE を確定させてある。
- 微調整余地: **occult は傾き/非対称の壁**なので ROOM_ACTIVE の矩形端と実壁メッシュ位置が完全一致しない → 掲示物が壁と微妙にズレる余地あり。実機で気になれば occult だけ実壁座標に直値で微調整。矩形ジャンル(shokai等)は ROOM_ACTIVE 基準で問題なし。見る関数: `addPoster`/`wallFaceX/Z`/各 `props<Genre>()`。

### 3【仕様・バグでない】視界コーンが ?preview で見えない
- コーンは `c.cone.visible = !eventTriggered`＝**改造前(潜入フェーズ)のみ表示**（#7＝改造後は監視無効の仕様）。`?preview` は改造後状態へ飛ぶのでコーンは意図的に非表示。
- 確認は**通常プレイの潜入フェーズ（改造前・本を集めている間）**で。店員前方に赤い扇が出て、その中で検知される。向きは修正済み（rotation.x=+π/2 で前方一致、検知math=clerkSeesPlayer は無改変）。opacity0.14 と薄めなので、検証時だけ一時的に上げてもよい。見る関数: `makeConeMesh`/`updateClerks`(cone visible/opacity)/`clerkSeesPlayer`(数式は触らない)。

## 5. 同梱アセット

- SFX（`assets/sfx/`、21種）: 既存9（footstep/pickup/place/heartbeat.wav/alert/bust/event/clear/talk）＋追加12（coin/register/card/bell/chime/glass_bell/gong/door/clock/windchime/machine/drone）。全CC0。
- BGM（`assets/bgm/`）: cafe.mp3 / tension.mp3。
- テクスチャ（`assets/tex/`、14種）: wood_floor/wall/wall_white/wall_dark/wood_floor_light＋carpet_gray/carpet_gray2/brick_red/brick_patch/tile_blue/tile_marble/wood_floor_dark/wood_floor_brown/concrete_rough。全CC0(ambientCG)。
- モデル（`assets/models/`）: human.glb＋character-b/c/d.glb（共通メッシュ、texture-a〜r.png 18種が Textures/ に）、`props/` に家具GLB12種（chairCushion/table/tableRound/tableCoffee/bookcaseOpen/bookcaseClosed/books/pottedPlant/loungeSofa/lampSquareFloor/lampRoundTable/stoolBar）。全CC0(Kenney)。
- **PDポスター画像（`assets/img/`、7枚・未使用）**: poster_alchemy_symbols/alchemy_bell/botanical_flowers_a/b/star_gemini/ophiuchus/zodiac。壁貼りは次作業で。
- manifest.json / CREDITS.md（全素材の出典・全CC0/PD）。
- 設計書: `DESIGN-variations.md`（ジャンル別内装）/ `DESIGN-dialogue-and-overhaul.md`（会話ラリー＋内装）/ `DESIGN-space-morph.md`（部屋の形＋衣装）/ `DESIGN-interactables.md`（次作業＝Eオブジェクト）。

## 6. 次の未実装作業（`DESIGN-interactables.md` 準拠）

「画像素材をふんだんに／E=アクション統一で"物"にもコメント／音の出るアイテム」:
1. **Eオブジェクト・インタラクション**: E で 近いNPC か "調べられる物" の近い方に作用。物にEで**フレーバーコメント**（※プレイヤーのツッコミでなく観察/説明の声・複数パターン・改造前後で変化）。調べられる物リスト＋座標/紐づくプロップは設計書参照。
2. **音の出るアイテム**: 追加SFXを割当（ジュークボックス/スピーカー=machine or BGM切替、レジ=register/coin/card、ベル=bell/chime/glass_bell、柱時計=clock/gong、風鈴=windchime、ドア=door、occult謎の物=drone、本=page）。鳴らし方(1回/トグル/ループ)と既存BGM(cafe/tension)との関係を設計書どおり。
3. **画像リッチ化**: 壁ポスターを CanvasTexture から `assets/img/` の実PDポスター画像へ差し替え可能に（`addPoster` に画像パス対応を追加）＋追加テクスチャで床壁の密度UP。ジャンル別に「画で語る」（ビジネス=グラフ、オカルト=星図/錬金術、自然派=ボタニカル、ゴシップ=新聞）。

着手順の推奨: §4 の1・2・3 は解消済み/仕様なので、いきなり **Eオブジェクト実装（まず基盤＋1ジャンル→横展開）** に入ってよい。まず `DESIGN-interactables.md` を読む。着手前に念のため §7 の検証手順で現状（各ジャンルの変貌・掲示物・カメラ）が崩れていないことを ?preview/数字キー/?debug=1 で確認 → その後 3項目を実装。§4 の「微調整余地」（occult 傾き壁のポスター位置）は Eオブジェクト実装のついでに気になれば直す程度でよい。各段階で node --check＋?preview/数字キー/?debug=1 HUD で確認。
