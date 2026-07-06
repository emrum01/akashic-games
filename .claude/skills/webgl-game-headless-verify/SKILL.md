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
