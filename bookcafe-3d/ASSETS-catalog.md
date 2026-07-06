# ASSETS-catalog.md — bookcafe-3d 内装素材カタログ

調査・収集日: 2026-07-05

---

## 凡例
- **採用済み**: DL・配置済み、即使用可能
- **候補（要手動）**: 直リンク特定済みだが未DL
- **見送り**: 取得困難・非CC0等の理由で不採用

---

## 壁・床テクスチャ

### wood_floor.jpg ★採用済み（最優先・コード参照名）
| 項目 | 内容 |
|------|------|
| 配置先 | `assets/tex/wood_floor.jpg` |
| サイズ | 1.2MB / 1024x1024 JPEG |
| 配布元 | ambientCG — WoodFloor007 |
| URL | https://ambientcg.com/view?id=WoodFloor007 |
| ライセンス | CC0 (Public Domain) |
| 用途 | 通常カフェ・基本床 |
| 備考 | Color mapのみ抽出（PBRセット全体の_Color.jpg） |

### wall.jpg ★採用済み（最優先・コード参照名）
| 項目 | 内容 |
|------|------|
| 配置先 | `assets/tex/wall.jpg` |
| サイズ | 809KB / 1024x1024 JPEG |
| 配布元 | ambientCG — Plaster001 |
| URL | https://ambientcg.com/view?id=Plaster001 |
| ライセンス | CC0 (Public Domain) |
| 用途 | 通常カフェ・壁（漆喰調） |
| 備考 | Color mapのみ抽出 |

### wall_white.jpg ★採用済み
| 項目 | 内容 |
|------|------|
| 配置先 | `assets/tex/wall_white.jpg` |
| サイズ | 1.4MB / 1024x1024 JPEG |
| 配布元 | ambientCG — PaintedPlaster002 |
| URL | https://ambientcg.com/view?id=PaintedPlaster002 |
| ライセンス | CC0 (Public Domain) |
| 用途 | 「意識高い」ジャンル向け白壁 |
| 備考 | Color mapのみ抽出 |

### wall_dark.jpg ★採用済み
| 項目 | 内容 |
|------|------|
| 配置先 | `assets/tex/wall_dark.jpg` |
| サイズ | 468KB / 1024x1024 JPEG |
| 配布元 | ambientCG — Concrete015 |
| URL | https://ambientcg.com/view?id=Concrete015 |
| ライセンス | CC0 (Public Domain) |
| 用途 | オカルト/暗いジャンル向け暗色壁 |
| 備考 | Color mapのみ抽出 |

### wood_floor_light.jpg ★採用済み
| 項目 | 内容 |
|------|------|
| 配置先 | `assets/tex/wood_floor_light.jpg` |
| サイズ | 599KB / 1024x512 JPEG |
| 配布元 | ambientCG — WoodFloor044 |
| URL | https://ambientcg.com/view?id=WoodFloor044 |
| ライセンス | CC0 (Public Domain) |
| 用途 | 自然派/明るい床バリエーション |
| 備考 | Color mapのみ抽出 |

### Poly Haven テクスチャ（候補・要手動）
| 名称 | URL | 用途 |
|------|-----|------|
| Fabric Carpet | https://polyhaven.com/a/fabric_carpet | カーペット床 |
| Brick Wall 002 | https://polyhaven.com/a/brick_wall_002 | 煉瓦壁（レトロ系） |
| Wood Floor 014 | https://polyhaven.com/a/wood_floor_014 | 別木目床 |
| 備考 | Poly Havenは直リンクURLが動的生成のため本ツールでは取得困難。手動DLを推奨 | — |

---

## ポスター/掲示物の画像

**推奨: CanvasTextureで文言生成**（Canvas 2D API でテキスト/図形を描画してテクスチャ化）

CC0のパブリックドメイン画像については以下を検討したが、壁ポスター用の小さなPNG直リンクが取得困難だったため手動取得を推奨：

| 候補 | URL | 理由 |
|------|-----|------|
| NASA Public Domain | https://images.nasa.gov/ | PD宇宙写真。手動DLで利用可 |
| Rawpixel PD | https://www.rawpixel.com/category/53/public-domain | ヴィンテージ広告PD。手動DL要 |
| Wikimedia Commons PD | https://commons.wikimedia.org/ | 各種PD素材。手動DL要 |

**見送り理由**: 実在商標・著作物混入リスクを避けるため、CanvasTextureによる自動生成が安全確実。

---

## ローポリ小道具 GLB

### Kenney Furniture Kit — 採用済み12点
**ソース**: https://kenney.nl/assets/furniture-kit  
**ライセンス**: CC0  
**外部テクスチャ**: なし（全GLBが自己完結、頂点色ベース）

| ファイル | 配置先 | 用途 |
|---------|--------|------|
| chairCushion.glb | `assets/models/props/` | 椅子（クッション付き） |
| table.glb | `assets/models/props/` | テーブル（長方形） |
| tableRound.glb | `assets/models/props/` | テーブル（丸） |
| bookcaseOpen.glb | `assets/models/props/` | 本棚（オープン） |
| bookcaseClosed.glb | `assets/models/props/` | 本棚（クローズ） |
| books.glb | `assets/models/props/` | 本（複数） |
| pottedPlant.glb | `assets/models/props/` | 観葉植物 |
| loungeSofa.glb | `assets/models/props/` | ソファ |
| lampSquareFloor.glb | `assets/models/props/` | フロアランプ |
| lampRoundTable.glb | `assets/models/props/` | テーブルランプ |
| stoolBar.glb | `assets/models/props/` | バースツール |
| tableCoffee.glb | `assets/models/props/` | コーヒーテーブル |

### その他 Kenney Furniture Kit 内 追加候補（zip内に存在・未配置）
| ファイル名 | 用途 |
|-----------|------|
| desk.glb | デスク（カウンター風） |
| kitchenCoffeeMachine.glb | コーヒーマシン（カフェ小道具） |
| kitchenBar.glb | バーカウンター |
| loungeDesignSofa.glb | デザインソファ |
| rugRectangle.glb | ラグ |
| trashcan.glb | ゴミ箱 |
| speaker.glb | スピーカー |
| computerScreen.glb | ディスプレイ |
| coatRackStanding.glb | コートハンガー |
| ceilingFan.glb | シーリングファン |

ソースzip: `/tmp/kenney_furniture-kit.zip`（セッション内のみ有効。再DL URL: https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip）

### Quaternius 家具（候補・要手動）
| 名称 | URL | 用途 |
|------|-----|------|
| Ultimate Furniture Pack | https://quaternius.com/packs/ultimatefurniture.html | CC0、Blender/FBX。GLB変換要 |

**見送り理由**: Quaternius直リンクは取得困難（Download buttonが動的生成）。FBX→GLB変換が必要。

---

## キャラクターテクスチャ一覧（共通メッシュ判定 + 衣装説明 + ジャンル割当案）

### 共通メッシュ判定: **YES — 1メッシュ＋テクスチャ差し替えで全衣装を出せる**

character-a〜e の GLB を比較した結果、全キャラで以下が完全一致：
- メッシュ数: 6（head, torso, arm-left, arm-right, leg-left, leg-right）
- 各メッシュの頂点数: (24, 24, 24, 24, 24, 23)
- accessor数: 318
- 差異: `images[0].uri` だけ異なる（texture-X.png のXのみ違う）

**実装指針**: `human.glb` 1体をロードし、`material.map` を `TextureLoader.load('Textures/texture-X.png')` で差し替えるだけで全18衣装が出せる。GLB個別ロード不要。

---

### テクスチャ衣装一覧 + ジャンル割当案

| テクスチャ | 外見説明 | 推奨ジャンル |
|-----------|---------|------------|
| texture-a | 灰ひげ・黒帽子のおじさん。茶色の革鎧/ベルト、緑のズボン。RPG系冒険者 | オカルト・自然派 |
| texture-b | 褐色肌・黒ひげの男性。赤いオーバーオール・青いズボン。作業員/大工風 | 自然派・週刊誌ゴシップ |
| texture-c | 白肌の若者。緑のTシャツにゲームパッドアイコン。カジュアルなゲーマー | 週刊誌ゴシップ・カジュアル |
| texture-d | 黄色全身スーツ、黒ライン・チャック。クラッシュダミー/テスト人形風 | 偏り哲学・週刊誌ゴシップ |
| texture-e | 茶髪の若い女性（そばかす）。パープルのチュニック・茶ベルト・素足。魔法使い系 | オカルト・自然派 |
| texture-f | 褐色肌・黒帽子の女性、ピアス付き。ティールのシャツ・デニム。カジュアル女子 | 週刊誌ゴシップ・カジュアル |
| texture-g | グレーのロボット/サイボーグ。赤いマーキング、胸に稲妻バッジ、腕にジップ。SF戦闘員 | 偏り哲学・オカルト |
| texture-h | グレーのロボット/サイボーグ（gの紫バリアント）。胸にハートバッジ。SF戦闘員・女性型 | 偏り哲学・オカルト |
| texture-i | 白肌・眼鏡の初老男性（メガネ、耳毛）。水色の白衣・名札・淡い青ズボン。医者/研究者 | 意識高いビジネス・紹介制ビジネス |
| texture-j | 白ヒゲ・グレー髪の老人。濃紺のシャツ・袖にバッジ・無線機。警察官/警備員 | 紹介制ビジネス |
| texture-k | 白ヒゲ・茶色がかった老人。赤いジャケット・茶いベルト・デニム、足元に星マーク。カウボーイ/西部 | 週刊誌ゴシップ・自然派 |
| texture-l | 緑の怪物（ゾンビ/鬼）。グレーの古いジャケット・茶ベルト、爪跡テクスチャ。ゾンビ/アンデッド | オカルト |
| texture-m | グレー髭の男性。ダークグリーンのアーミージャケット、革ストラップ×2、爪跡。サバイバー/傭兵 | 自然派・オカルト |
| texture-n | 白肌・白髪の女性キャラ（ツインテール）。ティール＋赤のシャツ・白スカート。ポップ/アイドル系 | 週刊誌ゴシップ |
| texture-o | 青緑の怪物（別の鬼/トロル）。茶色の下着/腰布、ボコボコ肌。モンスター系 | オカルト |
| texture-p | 赤毛・眼帯の男性（海賊）。白シャツ・紫ジャケット・茶ベルト。海賊/冒険者 | 週刊誌ゴシップ・偏り哲学 |
| texture-q | 褐色肌の男性。黒スーツ・赤ネクタイ・白ポケットチーフ。フォーマルスーツ | 意識高いビジネス・紹介制ビジネス |
| texture-r | 小顔・グレーのニンジャ/暗殺者風。全身ダークグレー、胸のV字カット・赤ライン。ステルス系 | オカルト・偏り哲学 |

### ジャンル別おすすめ割当

| ゲームジャンル | 推奨テクスチャ |
|--------------|-------------|
| **意識高いビジネス** | q（スーツ）、i（白衣/研究者）、j（警察/警備） |
| **紹介制ビジネス** | q（スーツ）、j（警備）、i（研究者） |
| **週刊誌ゴシップ** | c（ゲーマー）、b（作業員）、k（カウボーイ）、n（アイドル）、p（海賊） |
| **偏り哲学** | d（クラッシュダミー）、g（ロボット）、h（ロボット紫）、r（ニンジャ）、p（海賊） |
| **自然派** | a（冒険者）、e（魔法使い）、m（傭兵/サバイバー）、b（作業員） |
| **オカルト** | l（ゾンビ）、o（怪物）、r（ニンジャ）、g（ロボット）、e（魔法使い）、a（冒険者） |

---

## 追加キャラクター GLB

### character-b.glb / character-c.glb / character-d.glb ★採用済み
| 項目 | 内容 |
|------|------|
| 配置先 | `assets/models/character-{b,c,d}.glb` |
| テクスチャ | `assets/models/Textures/texture-{b,c,d}.png`（各1024x1024 PNG, CC0） |
| 配布元 | Kenney "Blocky Characters" |
| URL | https://kenney.nl/assets/blocky-characters |
| ライセンス | CC0 |
| アニメーション | 27クリップ（idle, walk, sprint, die等 human.glbと同一セット） |
| テクスチャ参照一致 | character-b→Textures/texture-b.png ✓, c→c ✓, d→d ✓ |

### 追加キャラ候補（zip内に e〜r まで存在・未配置）
texture-e.png 〜 texture-r.png も同zip内に存在（`Models/GLB format/Textures/`）。
必要なら同じ手順で抽出可能（zip: `/tmp/kenney_blocky-characters.zip`）。

---

## テクスチャ参照整合チェック（全採用GLB）

| GLBファイル | 参照テクスチャ | 実配置 | 一致 |
|------------|--------------|--------|------|
| human.glb | `Textures/texture-a.png` | `assets/models/Textures/texture-a.png` | ✓ |
| character-b.glb | `Textures/texture-b.png` | `assets/models/Textures/texture-b.png` | ✓ |
| character-c.glb | `Textures/texture-c.png` | `assets/models/Textures/texture-c.png` | ✓ |
| character-d.glb | `Textures/texture-d.png` | `assets/models/Textures/texture-d.png` | ✓ |
| props/*.glb（12点）| 外部テクスチャなし（自己完結） | — | ✓ |

---

## 追加テクスチャ — 床/壁バリエーション（2026-07-05 追加）

全9種 CC0 (ambientCG), 全て `assets/tex/` に配置済み。

| キー名 | ファイル | 配布元ID | サイズ | 説明 | 推奨ジャンル |
|--------|---------|---------|--------|------|------------|
| carpet_gray | carpet_gray.jpg | Carpet001 | 1.5MB / 1024x1024 | グレーカーペット（ラグ型） | ビジネス・哲学 |
| carpet_gray2 | carpet_gray2.jpg | Carpet003 | 1.1MB / 1024x1024 | グレーカーペット（手続き生成） | 落ち着いた空間 |
| brick_red | brick_red.jpg | Bricks059 | 1.5MB / 1024x1024 | 赤レンガ壁 | オカルト・紹介制 |
| brick_patch | brick_patch.jpg | Bricks074 | 1.5MB / 1024x1024 | パッチワーク状レンガ | 古びた・オカルト |
| tile_blue | tile_blue.jpg | Tiles044 | 2.0MB / 1024x1024 | ブルーテラゾータイル | カフェカウンター・自然派 |
| tile_marble | tile_marble.jpg | Tiles074 | 1.1MB / 1024x1024 | 大理石系フロアタイル | 高級・ビジネス |
| wood_floor_dark | wood_floor_dark.jpg | WoodFloor025 | 1.2MB / 1024x1024 | 濃色・光沢パーケット | ビジネス・紹介制 |
| wood_floor_brown | wood_floor_brown.jpg | WoodFloor049 | 1.3MB / 1024x1024 | ブラウン・滑らか木材床 | 汎用床バリエ |
| concrete_rough | concrete_rough.jpg | Concrete013 | 587KB / 1024x512 | 荒め波状コンクリート | 壁ダークバリエ・倉庫風 |

---

## 追加SFX — アイテムE押しインタラクション用（2026-07-05 追加）

全12種 CC0, 全て `assets/sfx/` に配置済み。

| キー名 | ファイル | フォーマット | サイズ | ソースパック | 用途 |
|--------|---------|------------|--------|------------|------|
| coin | coin.wav | WAV 16-bit PCM ステレオ 96kHz | 622KB | OpenGameArt "Purchasing Sound Effect" (CC0) | コイン投入・購入 |
| register | register.ogg | OGG ステレオ 44.1kHz | 5.6KB | Kenney Casino Audio (CC0) chip-lay-1.ogg | レジ・チップ置き |
| card | card.ogg | OGG ステレオ 44.1kHz | 9.4KB | Kenney Casino Audio (CC0) card-place-1.ogg | カード・本をめくる |
| bell | bell.ogg | OGG ステレオ 48kHz | 37.2KB | OpenGameArt 100 CC0 SFX | ベル音 |
| chime | chime.ogg | OGG ステレオ 44.1kHz | 13.6KB | Kenney Impact Sounds (CC0) impactBell_heavy_000.ogg | ドアチャイム・鐘 |
| glass_bell | glass_bell.ogg | OGG ステレオ 44.1kHz | 8.2KB | Kenney Impact Sounds (CC0) impactGlass_medium_000.ogg | ガラスベル・水晶音 |
| gong | gong.ogg | OGG ステレオ 48kHz | 54.0KB | OpenGameArt 100 CC0 SFX | ゴング・鐘大 |
| door | door.ogg | OGG ステレオ 48kHz | 107KB | OpenGameArt 100 CC0 SFX | ドア音 |
| clock | clock.ogg | OGG モノ 44.1kHz | 10.6KB | OpenGameArt "Ticking Clock" (CC0) | 柱時計チック音ループ |
| windchime | windchime.ogg | OGG ステレオ 44.1kHz | 2.37MB | OpenGameArt "Wind Chimes" (CC0) | 風鈴・自然派アイテム用 |
| machine | machine.ogg | OGG ステレオ 48kHz | 54.8KB | OpenGameArt "30 CC0 SFX Loops" (CC0) | コーヒーマシン・機器音 |
| drone | drone.ogg | OGG ステレオ 48kHz | 13.1KB | OpenGameArt 100 CC0 SFX (weird_01.ogg) | オカルト系不気味音 |

**注意**: windchime.ogg が 2.37MB と大きい。3Dシーンで常駐BGMとして使う場合はトリム推奨。
**却下**: horror ambient.ogg (CC-BY 3.0) — CC0要件を満たさないため不採用。

---

## 追加ポスター画像 assets/img/（2026-07-05 追加・新規ディレクトリ）

全7枚 Public Domain (Wikimedia Commons), 全て `assets/img/` に配置済み。

| キー名 | ファイル | サイズ | ライセンス | 説明 | 推奨ジャンル |
|--------|---------|--------|----------|------|------------|
| poster_alchemy_symbols | poster_alchemy_symbols.jpg | 2.5MB / 1657x2397px | PD (歴史的文書) | 錬金術記号一覧図 | オカルト |
| poster_alchemy_bell | poster_alchemy_bell.jpg | 3.7MB / 2350x2944px | PD (Wellcome Collection) | A.Bell版錬金術記号彫刻 | オカルト |
| poster_botanical_flowers_a | poster_botanical_flowers_a.jpg | 1.3MB / 2530x3602px | PD (Adolphe Millot †1928) | 花類ボタニカルイラスト A | 自然派 |
| poster_botanical_flowers_b | poster_botanical_flowers_b.jpg | 1.1MB / 2530x3602px | PD (Adolphe Millot †1928) | 花類ボタニカルイラスト B | 自然派 |
| poster_star_gemini | poster_star_gemini.jpg | 199KB / 1024x768px | PD (Flamsteed 1729) | ふたご座星座図（リサイズ済み） | オカルト・哲学 |
| poster_star_ophiuchus | poster_star_ophiuchus.jpg | 236KB / 1024x768px | PD (Bayer 1603) | へびつかい座星座図（リサイズ済み） | オカルト・哲学 |
| poster_zodiac | poster_zodiac.jpg | 59KB / 1024x312px | PD (Ch. Dien 19世紀) | 黄道帯パノラマ図（リサイズ済み） | オカルト・哲学 |

**CanvasTexture生成推奨（DL不可・不採用）:**
- ビジネス系グラフ/数式/タイポグラフィポスター → Canvas 2D API で動的生成
- カフェメニューボード/黒板テキスト → Canvas 2D API で動的生成
- 食品写真（コーヒー・ケーキ等）→ Pixabay直リンク取得困難のため Canvas 2D API 推奨
