# akashic-games

3Dブラウザゲーム置き場。各ゲームはサブディレクトリに格納。

---

## bookcafe-3d — ブックカフェ思想改造ゲーム

Three.js製の三人称ステルスゲーム。本を平積みに入れ替えながら店を思想改造する。

7ジャンルを制覇すると、店の空間レイアウト・客の衣装・BGM・掲示物がすべて変貌する。

### 遊び方

```bash
cd bookcafe-3d
python3 -m http.server
```

ブラウザで http://localhost:8000/bookcafe-3d.html を開く。

| 操作 | 説明 |
|------|------|
| 数字キー `1`–`7` | ジャンル変貌（思想改造のトリガー） |
| `E` | 調べる／会話 |
| `?debug=1` | デバッグモード有効化（URLパラメータ） |

### 素材について

全素材 CC0 / Public Domain。詳細は [`bookcafe-3d/CREDITS.md`](bookcafe-3d/CREDITS.md) を参照。
