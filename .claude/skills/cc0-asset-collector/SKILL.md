---
name: cc0-asset-collector
description: ゲーム/Web用のCC0・パブリックドメイン素材（テクスチャ/効果音/BGM/3Dモデル/画像）をwebから収集し、配信元に負荷をかけず一度だけDL・ライセンス検証・manifest/CREDITS化する。「素材収集」「CC0」「アセット」「テクスチャ/効果音/モデルを集める」でトリガー。
---

# cc0-asset-collector

## 実績のある配信元（CC0 / パブリックドメイン）

| カテゴリ | サイト | ライセンス | 備考 |
|----------|--------|-----------|------|
| テクスチャ | [ambientCG](https://ambientcg.com/) | CC0 | DL URL: `https://ambientcg.com/get?file={ID}_1K-JPG.zip` |
| テクスチャ/HDRI/3Dモデル | [Poly Haven](https://polyhaven.com/) | CC0 | |
| オーディオ/3Dモデル/スプライト | [Kenney](https://kenney.nl/) | CC0 | 家具・Blocky Characters・効果音パックなど多数 |
| 各種ゲームアセット | [OpenGameArt](https://opengameart.org/) | CC0フィルタで絞る | ライセンスが混在するので要確認 |
| 画像 | [Wikimedia Commons](https://commons.wikimedia.org/)、[Rawpixel](https://www.rawpixel.com/public-domain)、[NASA](https://images.nasa.gov/) | パブリックドメイン | |

## DLワークフロー

1. **1ファイル1回だけ** `curl -L -A "Mozilla/5.0" -o <出力先> <URL>` でDL（連打しない＝配信元への負荷配慮）
2. **本物か検証**（HTMLエラーページを掴んでいないか）:
   - `file <ダウンロード済みファイル>` でMIMEを確認
   - GLBはバイト先頭が `glTF` マジック
   - 画像・音声も同様に先頭バイトで確認
3. **巨大画像はリサイズ**: `sips -Z 1024 <file>`（macOS）または ImageMagick `convert -resize 1024x1024\> <in> <out>`
4. **zip配布は展開して必要分だけ配置**、zipは削除（容量節約）
5. **配置先**:
   - `assets/tex/` — テクスチャ
   - `assets/sfx/` — 効果音
   - `assets/bgm/` — BGM
   - `assets/models/` — 3Dモデル
   - `assets/img/` — 画像
6. **manifest.json + CREDITS.md** に各素材の配布元URL・作者・ライセンスを記載（CC0でも明記する）

## ライセンス方針

- **CC0/PD優先**。帰属不要で扱いが楽。
- **CC-BY** は帰属（クレジット表記）が必須なので採否を判断する。今回は不採用にした例あり。
- 実在の直リンクが取れないものはでっち上げず「候補（要手動DL）」と記載すること。

## Kenney Blocky Characters の特記事項

- **全キャラ共通メッシュ**で `texture-a〜r.png` を差し替えるだけで別衣装にできる（安価な衣装バリエーション）。
- GLBが参照する `Textures/texture-a.png` などのテクスチャファイルは**GLBと同じ相対パスに同梱**しないとロード失敗する。外部テクスチャ参照のGLBを配置する際は必ずテクスチャも一緒に配置すること。

## CREDITS.md テンプレート

```markdown
# Asset Credits

## Textures
- `assets/tex/Wood.jpg` — ambientCG "WoodFloor050" — https://ambientcg.com/view?id=WoodFloor050 — CC0

## Audio
- `assets/sfx/footstep.ogg` — Kenney "Footsteps Pack" — https://kenney.nl/assets/footstep-sounds — CC0

## 3D Models
- `assets/models/character.glb` — Kenney "Blocky Characters" — https://kenney.nl/assets/blocky-characters — CC0
```
