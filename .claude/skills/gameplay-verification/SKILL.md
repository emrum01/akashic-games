---
name: gameplay-verification
description: ゲーム/Web謎/インタラクティブUIの変更を、実プレイ導線でPlaywright検証する。クリック/タップ判定、z-index、ダイアログ被り、ヒント解放、状態遷移など「プレイヤーが当然ぶつかる問題」をまとめて確認する時に使う。
---

# gameplay-verification

ゲーム、Web謎、Three.js/WebGL、またはタップ/クリックで進行するUIを変更したら、個別指摘だけを確認して終わらせない。**プレイヤーが最初から遊んだ時に通る実導線**で、周辺のインタラクションまでまとめて検証する。

## 絶対ルール

1. **最終検証は実プレイ経路で行う**
   - DOMを直接書き換えて状態を作る検証は、原因切り分け用に限る。
   - 最終報告・PRスクショには、実際のプレイヤー操作で到達した状態だけを使う。
   - 例: `devicePanel.classList.remove("is-hidden")` だけで「制御装置あり」とみなさない。謎を解いて `revealDevice()` が通常経路で発火した状態を作る。

2. **言われた箇所だけでなく、隣接する操作も検査する**
   - 床ヒビを直したら、床全体、制御装置、起動ボタン、ダイアログ、ヒント解放も確認する。
   - 3Dオブジェクトの位置を変えたら、ホットスポット、見た目、z-index、`elementFromPoint` の最前面要素を確認する。
   - ヒント文言を変えたら、そのヒントが実際に解放される導線も確認する。

3. **「見えているもの」と「押せるもの」を一致させる**
   - タップ対象が透明ホットスポットの場合でも、投影元の3Dオブジェクトや可視DOMと矩形が合っているか確認する。
   - `getBoundingClientRect()`、`elementFromPoint()`、`z-index`、`pointer-events`、重なり判定を出す。
   - ボタンやダイアログの背後にクリックが抜けていないか確認する。

4. **スクショはマージ前に撮る**
   - mobile viewport と必要なら desktop viewport の両方を撮る。
   - 可能なら「タップ前」「タップ後」「該当ダイアログ表示中」の状態を分けて保存する。
   - ユーザーが見られるPR画像が必要な場合、Cursor artifact URLだけに頼らない。GitHubで確実に見せる必要がある時は、レビュー用PNGを一時的にPRブランチへ追加し、`raw.githubusercontent.com` URLを貼る。不要ならマージ前に削除する。

## 標準チェックリスト

### 1. 実プレイ導線

- 初期表示から開始する。
- 必要な順序でプレイヤー操作を再現する。
  - 例: ディスプレイを調べる → 謎を入力 → 送信 → 制御装置出現 → ヒビを調べる → 掛け軸ヒント → ヒビ2回目ヒント。
- ショートカットやDOM直接操作を使った場合は、最終検証とは別に扱う。

### 2. 状態・レイヤー検証

Playwrightで最低限以下を取得する。

- 対象要素の `getBoundingClientRect()`
- 近接要素（ダイアログ、ボタン、ホットスポット）の `getBoundingClientRect()`
- `z-index`
- `pointer-events`
- `elementFromPoint()` でタップ中心の最前面要素
- 重なり判定:
  - `overlapPanel`
  - `overlapButton`
  - `gapToPanel`
- 状態フラグやUI文言:
  - objective
  - panel hidden/visible
  - puzzle hidden/visible
  - hint unlocked/visible

### 3. タップ/クリック結果

- 実際に `page.touchscreen.tap()` または `locator.click()` する。
- クリック後の表示テキスト・状態変化を読む。
- 期待する結果と、起きてはいけない結果を両方確認する。
  - 例: ヒビタップで床説明が出ない。
  - 例: 制御装置パネルをタップして背後の3D制御装置説明が出ない。
  - 例: 起動ボタンは押せる。

### 4. ヒント/段階解放

ヒント機能を触ったら、段階を通して確認する。

- 未解放状態で触った時の表示
- 解放条件を満たす操作
- 解放後1回目の表示
- 解放後2回目の表示
- 「読む」「次のヒントへ」などのアクションボタン結果

### 5. ログとエラー

- `console` と `pageerror` を収集する。
- 404、WebGL初期化失敗、JS例外を確認する。
- WebGLの `ReadPixels` パフォーマンス警告だけなら、通常は機能NGにしない。

## Playwright検証テンプレート

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--use-gl=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-dev-shm-usage",
        ],
    )
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    logs = []
    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: logs.append(f"[pageerror] {err}"))

    page.goto("http://127.0.0.1:8777/index.html", wait_until="networkidle")
    page.wait_for_timeout(3000)

    # 実プレイ操作をここに書く。DOM直書きで状態を作らない。
    # page.locator("#displayHotspot").click(force=True)
    # ...

    info = page.evaluate("""() => {
      const target = document.getElementById("floorCrackHotspot");
      const panel = document.getElementById("devicePanel");
      const targetRect = target.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const cx = targetRect.left + targetRect.width / 2;
      const cy = targetRect.top + targetRect.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      const rect = r => ({
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
      return {
        target: rect(targetRect),
        panel: rect(panelRect),
        targetZ: getComputedStyle(target).zIndex,
        panelZ: getComputedStyle(panel).zIndex,
        topAtTargetCenter: topEl ? {
          id: topEl.id,
          tag: topEl.tagName,
          className: String(topEl.className),
        } : null,
        overlapPanel: !(targetRect.right < panelRect.left ||
                        targetRect.left > panelRect.right ||
                        targetRect.bottom < panelRect.top ||
                        targetRect.top > panelRect.bottom),
        gapToPanel: Math.round(panelRect.top - targetRect.bottom),
      };
    }""")

    page.screenshot(path="artifacts/gameplay-mobile.png", full_page=False)
    browser.close()

print("info:", info)
print("consoleTail:", logs[-12:])
```

## 報告フォーマット

最終報告やPR本文には、最低限これを書く。

- 実プレイ操作手順
- viewport / deviceScaleFactor
- 対象要素と近接要素の矩形
- overlap / gap / top element
- 実タップ結果
- console/pageerror の要約
- スクショパスまたは見えるURL

悪い例:

- 「制御装置ありで確認しました」だけ。
- DOMを直接表示した状態のスクショを、実プレイ状態として貼る。
- 指摘された要素だけタップして、隣接するダイアログやボタンとの重なりを確認しない。

良い例:

- 「ディスプレイ→`→→→←←`→送信で通常経路の `revealDevice()` を発火。`deviceVisible=true`、ヒビ `bottom=609`、制御装置パネル `top=657`、`gapToPanel=47`、`elementFromPoint` は `#floorCrackHotspot`。ヒビタップで `深い亀裂...` 表示。起動ボタン矩形とは非重複。」
