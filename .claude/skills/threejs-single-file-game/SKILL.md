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

## まとめ: 設計方針

「httpサーバ経由なら実素材、file://直開きでもフォールバックで完動」の二段設計が堅い。

| 要素 | http経由 | file://直接 |
|------|---------|------------|
| テクスチャ | TextureLoader（実ファイル） | TextureLoader（実ファイル、`<img>`ベースなのでOK） |
| GLB | GLTFLoader（実モデル） | プリミティブフォールバック |
| 音声ファイル | `<audio>` / HTMLAudioElement | フォールバック可能ならオシレータ合成 |
| fetch/XHR | 使用可 | **使用不可** |
