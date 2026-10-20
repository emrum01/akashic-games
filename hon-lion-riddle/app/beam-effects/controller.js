import { createCanvasRenderer } from './canvas.js';
import { measureAimPoints } from './geometry.js';
import { createWebGLRenderer } from './webgl.js';
import { SHOT_DURATION, clamp, frameTiming } from './timing.js';

export function createBeamEffects({ app, target, weapon, muzzle, getBackground, reducedMotion = false }) {
  const canvas = document.createElement('canvas');
  const glCanvas = document.createElement('canvas');
  canvas.className = 'beam-canvas'; glCanvas.className = 'beam-gl-canvas';
  canvas.setAttribute('aria-hidden', 'true'); glCanvas.setAttribute('aria-hidden', 'true');
  app.append(glCanvas, canvas);
  const size = () => ({ w: Math.max(1, app.clientWidth), h: Math.max(1, app.clientHeight) });
  const canvasRenderer = createCanvasRenderer(canvas, size);
  const glRenderer = createWebGLRenderer(glCanvas, getBackground, reducedMotion);
  let raf = 0, startedAt = 0, running = false;
  function points() {
    const appRect = app.getBoundingClientRect();
    const targetAnchor = target.offsetParent === app ? { x: target.offsetLeft, y: target.offsetTop } : null;
    return measureAimPoints(appRect, target.getBoundingClientRect(), muzzle.getBoundingClientRect(), targetAnchor);
  }
  function render(time) {
    const frame = frameTiming(clamp(time, 0, SHOT_DURATION), reducedMotion);
    weapon.style.transform = `translate(${frame.recoil * 10}px, ${frame.recoil * 5}px)`;
    const p = points();
    canvasRenderer.draw(time, p);
    glRenderer.draw(time, p);
    app.style.transform = `translate(${frame.shakePower * 14}px, ${frame.shakePower * 9}px)`;
    target.style.opacity = String(1 - frame.dissolve);
    const targetRotation = reducedMotion ? 0 : Math.sin(time * 21) * frame.dissolve * 5;
    target.style.transform = `translate(-50%, -50%) scale(${1 + frame.hit * .12 + frame.dissolve * .18}) rotate(${targetRotation}deg)`;
    target.style.filter = `blur(${frame.dissolve * 5}px) saturate(${1 + frame.hit}) drop-shadow(0 0 ${Math.round(3 + frame.hit * 25)}px rgba(152,239,255,${.04 + frame.hit * .72}))`;
  }
  function tick(now) {
    if (!running) return;
    const time = (now - startedAt) / 1000;
    render(time);
    if (time >= SHOT_DURATION) { running = false; raf = 0; return; }
    raf = requestAnimationFrame(tick);
  }
  function start() { stop(); running = true; startedAt = performance.now(); render(0); raf = requestAnimationFrame(tick); }
  function stop() {
    running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    app.style.transform = ''; weapon.style.transform = ''; target.style.opacity = ''; target.style.transform = ''; target.style.filter = '';
    canvasRenderer.dispose(); glRenderer.clear();
  }
  function dispose() { stop(); glRenderer.dispose(); canvas.remove(); glCanvas.remove(); }
  return { shotDuration: SHOT_DURATION, start, stop, dispose, render: (time) => render(clamp(time, 0, SHOT_DURATION)) };
}
