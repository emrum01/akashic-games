---
name: threejs-single-file-game
description: file://でもhttpでも動く単体HTMLのThree.js/WebGLゲームを作る際の制約と雛形。オフライン単体で完結させたい時に。「Three.js ゲーム」「単体HTML 3D」「file:// で動く WebGL」でトリガー。
---

# threejs-single-file-game

## 制約サマリー（ハマりやすい順）

### Three.js バージョン: r128 UMD ビルドを使う

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
```

- **r128 のUMDビルド**はグローバル `THREE` を提供する。ESM/importmapは `file://` で動かない。
- **新しいバージョン（r150+）はUMDを廃止している**ので注意。r128に固定すること。
- GLTFLoader は `examples/js` のUMD版を使う:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
  ```

### fetch 不使用

`file://` で `fetch`/`XHR` はブロックされる。

- 設定・データ: JSにインライン定義
- 音声: `new Audio("path/to/file.mp3")`（`<audio>` タグ経由はfile://で動く）
- テクスチャ: `new THREE.TextureLoader().load(path)` — r128は `<img>` ベースなのでfile://可
- GLB: `GLTFLoader` は XHR を使うので**file://では動かない**。httpサーバ経由が必要

### CapsuleGeometry は r128 に存在しない

r142+ の機能。r128 では使えない。代替:

```javascript
// カプセル → Cylinder + SphereGeometry 2つで構成、または単純にBoxGeometry
const body = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
```

## GLBロードの二段構え（推奨パターン）

httpサーバ経由なら実素材、file://直開きでもフォールバックで完動させる:

```javascript
function loadCharacter(url, onSuccess, onFallback) {
    const loader = new THREE.GLTFLoader();
    loader.load(
        url,
        (gltf) => onSuccess(gltf.scene),
        undefined,
        (err) => {
            console.warn("GLB load failed, using primitive fallback:", err);
            onFallback(buildPrimitiveHuman());
        }
    );
}

function buildPrimitiveHuman() {
    const group = new THREE.Group();
    // 頭
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0xffcc88 })
    );
    head.position.y = 1.5;
    group.add(head);
    // 胴体
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.8, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x4444ff })
    );
    body.position.y = 0.9;
    group.add(body);
    return group;
}
```

## 音声: フォールバック付き実装

```javascript
// 効果音: ファイルが無くてもWebAudioオシレータ合成で鳴らす
function playSFX(type) {
    if (sfxFiles[type]) {
        sfxFiles[type].currentTime = 0;
        sfxFiles[type].play().catch(() => {});
        return;
    }
    // フォールバック: オシレータ合成
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'footstep' ? 220 : 440;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
}

// 自動再生制限対応: 初回ユーザー操作でresume
let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
document.addEventListener('click', getAudioContext, { once: true });
document.addEventListener('keydown', getAudioContext, { once: true });
```

## RAFループ: try/catch 保護

1フレームの例外でゲームが止まらないよう保護する:

```javascript
function animate() {
    requestAnimationFrame(animate);
    try {
        const delta = clock.getDelta();
        update(delta);
        renderer.render(scene, camera);
    } catch (e) {
        console.error("Frame error:", e);
    }
}
```

## SkeletonUtils（アニメーション切り替えに必要）

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
```

GLBキャラクターを複数インスタンス化する際は `THREE.SkeletonUtils.clone(gltf.scene)` を使う。

## Xアプリ内ブラウザ対応（セーフゾーン実装）

主プレイ経路は X の投稿リンクから開く**X アプリ内ブラウザ**（iOS/Android）。
画面下部の約25〜30%を X 自身の UI（URLバー＋元ポストのシート）が恒常的に覆うため、
進行必須オブジェクト・UI は可視領域の**上部70%（セーフゾーン）**に収まるようカメラ・
レイアウトを設計する（設計判断そのものは `akashic-nazo-design` スキルの
Phase 3「プレイ環境前提」が正）。ここでは実装要件のみ扱う。

- `100vh` は使わない。`100dvh` を基本にし、非対応ブラウザ向けフォールバック
  （例: JSで `window.innerHeight` を計測してCSS変数に反映）を用意する。
  ```css
  height: 100dvh; /* フォールバック */
  height: var(--app-height, 100vh);
  ```
- `window.visualViewport` の `resize` イベントを監視し、可視高さの変化に追従して
  キャンバス・カメラを再計算する:
  ```javascript
  function onViewportResize() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      renderer.setSize(window.innerWidth, vh);
      camera.aspect = window.innerWidth / vh;
      camera.updateProjectionMatrix();
      reframeCameraForSafeZone(vh); // 進行必須オブジェクトが上部70%に収まるよう再調整
  }
  if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportResize);
  } else {
      window.addEventListener('resize', onViewportResize);
  }
  ```
- **セーフゾーンは外部UI（X下部25〜30%）だけでなく自前の固定オーバーレイUIの実測占有域も
  含めて計算する**。閉じるボタンのない恒常表示パネル（制御装置UI等）が下部を覆い、
  外部UI対策だけでは進行必須オブジェクトが隠れて詰む事故が実機で確認された
  （broken-web、2026-07-12）。オーバーレイ表示中はその上端Yを `getBoundingClientRect()`
  で取得し、進行必須オブジェクトの投影Yが「上端 − タップ領域分マージン
  （`Math.max(64, height * 0.08)` 目安）」より上に来るまでカメラを引き＋俯瞰化する
  反復補正を行う（オブジェクトの座標自体は動かさず、フレーミングのみ調整する）:
  ```javascript
  function reframeAvoidingOverlay(overlayEl, targetObject) {
      if (!overlayEl || overlayEl.classList.contains('is-hidden')) return;
      const overlayTop = overlayEl.getBoundingClientRect().top;
      const margin = Math.max(64, window.innerHeight * 0.08);
      let guard = 0;
      while (projectToScreenY(targetObject) > overlayTop - margin && guard++ < 20) {
          pullCameraBackAndTiltDown(); // カメラのみ調整、オブジェクト座標は不変
      }
  }
  ```
- **オーバーレイの出現・文言変化のたびに再フレーミングを明示的に発火する**（`resize`
  イベント頼みにしない）。オーバーレイの表示切り替え関数内で `reframeAvoidingOverlay()`
  相当の明示フックを呼ぶ。
- **縦が短い環境では `@media (max-height: ...)` でオーバーレイ自体を圧縮する**。
  `max-width` ベースの縮小だけでは横長スマホ（例: 852×600）で効かず、パネルが
  大きいまま床のヒビ等を覆い続けた事例がある。
- **サポートする最小ビューポートの目安は縦600px**（縦持ち390×600・横持ち852×600）。
  この解像度でゲームが成立することを実装完了の基準にする。
- **state初期化前に走る構成でのオーバーレイ表示判定はDOMクラスで行う**（`is-hidden`等）。
  `initThreeScene` 等が state 定義より先に実行される構成で state 変数を参照すると
  TDZ（Temporal Dead Zone）エラーになるため、判定は state ではなく DOM のクラス付与で行う。
- `env(safe-area-inset-bottom)` をレイアウトの下部余白計算に含める（ノッチ・
  ホームインジケータとXのUIが二重に食い込むケースがある）。
- カメラは固定フレーミングにせず、可視高さの変化に応じて動的にフレーミングし直す
  （`reframeCameraForSafeZone` 相当の関数を持つ）。下部が隠れる構図を放置しない。

## まとめ: 設計方針

「httpサーバ経由なら実素材、file://直開きでもフォールバックで完動」の二段設計が堅い。

| 要素 | http経由 | file://直接 |
|------|---------|------------|
| テクスチャ | TextureLoader（実ファイル） | TextureLoader（実ファイル、`<img>`ベースなのでOK） |
| GLB | GLTFLoader（実モデル） | プリミティブフォールバック |
| 音声ファイル | `<audio>` / HTMLAudioElement | フォールバック可能ならオシレータ合成 |
| fetch/XHR | 使用可 | **使用不可** |
