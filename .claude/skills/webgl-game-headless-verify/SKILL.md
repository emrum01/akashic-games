---
name: webgl-game-headless-verify
description: Three.js/WebGLの単体HTMLゲームを、ローカルhttpサーバ＋Playwrightヘッドレスで起動検証・スクショ・console/pageerror収集する。目視推測に頼わずゲーム内デバッグHUDで実測値を読む。「ゲーム 検証」「WebGL スクショ」「ヘッドレス確認」でトリガー。
---

# webgl-game-headless-verify

## 手順

### 1. ローカルHTTPサーバを立てる

```bash
python3 -m http.server 8777 --directory <ゲームルートディレクトリ>
```

**必ずhttpサーバ経由で配信する**。`file://` 直接だと `fetch`/`XHR` がブロックされ、GLBや音声ファイルが読み込めない。

### 2. Playwright Chromiumで開く

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--enable-webgl", "--use-gl=angle"]
    )
    page = browser.new_page(viewport={"width": 1280, "height": 720})

    console_msgs = []
    errors = []
    page.on("console", lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: errors.append(str(err)))

    page.goto("http://localhost:8777/index.html")
    page.wait_for_timeout(3000)  # ロード待ち

    page.screenshot(path="screenshot.png")
    browser.close()

print("Console:", console_msgs)
print("Errors:", errors)
```

### 3. スクショとログを確認する

- `console` / `pageerror` で 404・パースエラー・例外を確認
- テクスチャ404は想定内（httpサーバのパス設定ミスの場合が多い）と実際のエラーを区別する

## 最重要教訓: デバッグHUDを実装せよ

**3Dの微妙な見え方（壁のポスター位置・カメラ画角・傾き壁など）はヘッドレスの1枚スクショでは判定困難**。アングル依存で「見えてるか見えていないか」が分からない。

→ **ゲーム内に `?debug=1` で表示するテキストHUD**を実装し、以下の実測値を文字で読む:

```javascript
// URLパラメータでデバッグモード切り替え
const DEBUG = new URLSearchParams(location.search).has('debug');

function updateDebugHUD() {
    if (!DEBUG) return;
    document.getElementById('debug-hud').textContent = [
        `cam: ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`,
        `state: ${gameState}`,
        `entities: ${entities.length}`,
        `assets loaded: ${assetsLoaded}/${assetsTotal}`,
    ].join('\n');
}
```

オブジェクトのworld座標をコンソールログして「見える位置に確実にある」ことをコードで担保する方が、スクショで目視するより確実。

## 必須チェック: Xアプリ内ブラウザの縮小ビューポート確認

Xアプリ内ブラウザは画面下部の約25〜30%をX自身のUIが恒常的に覆う
（詳細は `threejs-single-file-game` スキルの「Xアプリ内ブラウザ対応」が正）。
通常ビューポートのスクショだけでは見落とすため、**下部30%を欠いた縮小ビューポート**
でも進行必須オブジェクト・UIの可視性とタップ可否を必ず確認する:

```python
normal_vp = {"width": 390, "height": 844}  # 例: iPhone相当
shrunk_vp = {"width": 390, "height": round(844 * 0.7)}  # 下部30%をXのUIが覆う想定

page = browser.new_page(viewport=shrunk_vp)
page.goto("http://localhost:8777/index.html")
page.wait_for_timeout(3000)
page.screenshot(path="screenshot_shrunk.png")
# 進行必須オブジェクトの座標がshrunk_vp内に収まっているか、
# デバッグHUDの実測値（world座標）とあわせて確認する
```

通常ビューポートとの2枚を比較し、進行必須オブジェクト・UIが縮小後も可視・
タップ可能であることを確認できて初めて検証完了とする。

### 検証マトリクス（外部UI×自前オーバーレイUIの掛け合わせ）

外部UI（Xアプリ内ブラウザ）対策だけでは、自前のゲーム内オーバーレイUI（制御装置パネル等の
恒常表示ダイアログ）が進行必須オブジェクトを覆う事故を見逃す（broken-web、2026-07-12で発生。
詳細は `threejs-single-file-game` スキルの「セーフゾーンは自前オーバーレイUIの実測占有域も
含めて計算する」が正）。以下のマトリクスで必ず確認する:

- ビューポート: `390×844` / `390×590`（外部UI縮小相当） / `390×600` / `852×600`（横持ち最小）
- 各ビューポートで「オーバーレイUI表示中」「非表示」の両状態をスクショ＋実測
- オーバーレイ表示状態は正答注入等で強制的に発火させて検証する（自然な進行待ちでは
  発火し忘れる）
- 判定基準: 進行必須オブジェクトのタップ領域**下端**がオーバーレイ**上端**より上にあること
  （オブジェクト全体ではなく、タップ可能な最下端で判定する）

## 実プレイ経路でも確認する

URLショートカット（例: `?preview=room2`）はロード中に発火してアニメを撮り逃すことがある。
**実際の操作経路（キー入力シミュレーション）**でも確認すること:

```python
page.goto("http://localhost:8777/index.html")
page.wait_for_timeout(2000)
page.keyboard.press("Enter")  # ゲーム開始
page.wait_for_timeout(1000)
page.screenshot(path="gameplay.png")
```

## サーバ停止

```python
import subprocess, signal, os
server = subprocess.Popen(["python3", "-m", "http.server", "8777"], cwd=game_dir)
# ... 検証 ...
os.kill(server.pid, signal.SIGTERM)
```
