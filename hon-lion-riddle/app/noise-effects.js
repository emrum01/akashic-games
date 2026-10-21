const MAX_CANVAS_WIDTH = 1280;
const MIN_LEVEL = 0;
const MAX_LEVEL = 5;

const LEVELS = Object.freeze({
  1: { interval: [16000, 24000], bands: [1, 1], displacement: [4, 6], height: [14, 18], alpha: .22 },
  2: { interval: [7000, 10000], bands: [1, 2], displacement: [5, 8], height: [16, 22], alpha: .29 },
  3: { interval: [4000, 6000], bands: [2, 2], displacement: [7, 11], height: [18, 26], alpha: .37 },
  4: { interval: [2500, 4500], bands: [2, 3], displacement: [10, 15], height: [20, 30], alpha: .46 },
  5: { interval: [1800, 3200], bands: [2, 3], displacement: [12, 18], height: [22, 34], alpha: .54 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const randomBetween = (random, [min, max]) => min + random() * (max - min);

function sourceSize(source) {
  if (!source) return null;
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * A bounded image-coherence failure: a cached persistent layer degrades the
 * scene between occasional sampled-image bursts without touching the dialog.
 */
export function createNoiseEffects({
  canvas,
  app,
  scenePoster,
  sceneVideo,
  sceneBackground,
  conversation,
  lion,
  lionContainer,
  windowRef = typeof window !== 'undefined' ? window : null,
  documentRef = typeof document !== 'undefined' ? document : null,
  nowFn = () => windowRef?.performance?.now?.() ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeoutFn = windowRef?.setTimeout?.bind(windowRef) || setTimeout,
  clearTimeoutFn = windowRef?.clearTimeout?.bind(windowRef) || clearTimeout,
  requestAnimationFrameFn = windowRef?.requestAnimationFrame?.bind(windowRef) || ((callback) => setTimeoutFn(() => callback(Date.now()), 16)),
  cancelAnimationFrameFn = windowRef?.cancelAnimationFrame?.bind(windowRef) || clearTimeoutFn,
  setIntervalFn = windowRef?.setInterval?.bind(windowRef) || setInterval,
  clearIntervalFn = windowRef?.clearInterval?.bind(windowRef) || clearInterval,
} = {}) {
  const getContextSafely = (target) => {
    try { return target?.getContext?.('2d', { alpha: true }) || null; } catch { return null; }
  };
  const context = getContextSafely(canvas);
  const scratch = (() => {
    try {
      const created = documentRef?.createElement?.('canvas');
      if (created) return created;
    } catch { /* optional scratch canvas */ }
    try { return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null; } catch { return null; }
  })();
  const scratchContext = getContextSafely(scratch);
  const state = { level: 0, timer: null, raf: null, persistentTimer: null, hidden: false, disposed: false, burst: null, reducedMotion: false, width: 0, height: 0 };
  let seed = 0x4d595df4;

  const seededRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clear = () => {
    if (!context || !state.width || !state.height) return;
    try { context.clearRect(0, 0, state.width, state.height); } catch { /* canvas is optional */ }
  };
  const cancelFrame = () => {
    if (state.raf !== null) cancelAnimationFrameFn(state.raf);
    state.raf = null;
  };
  const cancelTimer = () => {
    if (state.timer !== null) clearTimeoutFn(state.timer);
    state.timer = null;
  };
  const cancelPersistentTimer = () => {
    if (state.persistentTimer !== null) clearIntervalFn(state.persistentTimer);
    state.persistentTimer = null;
  };
  const stopBurst = () => {
    cancelFrame();
    state.burst = null;
    clear();
  };
  const stopActivity = () => {
    cancelTimer();
    cancelPersistentTimer();
    stopBurst();
  };
  const isReducedMotion = () => {
    try { return windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
  };
  const appRect = () => {
    const rect = app?.getBoundingClientRect?.();
    const width = rect?.width || app?.clientWidth || windowRef?.innerWidth || 0;
    const height = rect?.height || app?.clientHeight || windowRef?.innerHeight || 0;
    return { width, height, left: rect?.left || 0, top: rect?.top || 0 };
  };
  const resize = () => {
    if (!canvas || !context) return null;
    const rect = appRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    const scale = Math.min(1, MAX_CANVAS_WIDTH / rect.width);
    const pixelWidth = Math.max(1, Math.round(rect.width * scale));
    const pixelHeight = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    if (scratch && (scratch.width !== pixelWidth || scratch.height !== pixelHeight)) {
      scratch.width = pixelWidth;
      scratch.height = pixelHeight;
    }
    try { context.setTransform(scale, 0, 0, scale, 0, 0); } catch { /* simple test doubles */ }
    try { scratchContext?.setTransform(scale, 0, 0, scale, 0, 0); } catch { /* simple test doubles */ }
    state.width = rect.width;
    state.height = rect.height;
    return { ...rect, scale };
  };
  const textureMarks = [];
  const dropoutMarks = [];
  const rebuildTexture = () => {
    textureMarks.length = 0;
    dropoutMarks.length = 0;
    const count = [0, 34, 58, 92, 132, 176][state.level] || 0;
    for (let index = 0; index < count; index += 1) {
      textureMarks.push({ x: seededRandom(), y: seededRandom(), width: 1 + seededRandom() * (state.level >= 4 ? 4 : 2), height: .5 + seededRandom() * (state.level >= 4 ? 2.8 : 1.4), warm: seededRandom() > .72 });
    }
    if (state.level >= 4) {
      const dropoutCount = state.level === 4 ? 3 : 7;
      for (let index = 0; index < dropoutCount; index += 1) {
        const segments = state.level === 5 ? 3 : 2;
        dropoutMarks.push({
          y: .03 + seededRandom() * .82,
          height: .012 + seededRandom() * (state.level === 5 ? .038 : .024),
          segments: Array.from({ length: segments }, () => ({ x: seededRandom(), width: .08 + seededRandom() * .22 })),
        });
      }
    }
  };
  const renderPersistent = (rect = resize()) => {
    if (!rect || !context || state.hidden || state.disposed || state.level <= 0 || app?.dataset?.phase === 'dead') return;
    try {
      clear();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = [0, .035, .065, .11, .18, .29][state.level];
      context.fillStyle = '#050708';
      context.fillRect(0, 0, rect.width, rect.height);
      const scanStep = [0, 12, 8, 6, 5, 4][state.level];
      if (scanStep) {
        context.globalAlpha = [0, .025, .045, .07, .1, .14][state.level];
        context.fillStyle = '#b8c4c2';
        for (let y = 0; y < rect.height; y += scanStep) context.fillRect(0, y, rect.width, state.level >= 4 ? .85 : .55);
      }
      for (const mark of textureMarks) {
        context.globalAlpha = (state.level >= 4 ? .17 : .1) * (mark.warm ? .72 : 1);
        context.fillStyle = mark.warm ? '#b39a76' : '#c8d3d2';
        context.fillRect(mark.x * rect.width, mark.y * rect.height, mark.width, mark.height);
      }
      if (state.level >= 4) {
        context.fillStyle = '#020304';
        for (const dropout of dropoutMarks) {
          context.globalAlpha = state.level === 5 ? .42 : .28;
          for (const segment of dropout.segments) context.fillRect(segment.x * rect.width, dropout.y * rect.height, segment.width * rect.width, dropout.height * rect.height);
        }
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    } catch {
      clear();
    }
  };
  const drawCover = (target, source, width, height) => {
    const size = sourceSize(source);
    if (!size || !target) return false;
    const scale = Math.max(width / size.width, height / size.height);
    const drawWidth = size.width * scale;
    const drawHeight = size.height * scale;
    try {
      target.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      return true;
    } catch { return false; }
  };
  const capture = (rect) => {
    if (!scratchContext || !scratch) return false;
    const videoVisible = sceneBackground?.classList?.contains?.('video-playing') === true;
    const source = videoVisible && sceneVideo?.readyState >= 2 && sourceSize(sceneVideo) ? sceneVideo : scenePoster;
    if (!drawCover(scratchContext, source, rect.width, rect.height)) return false;
    const lionSize = sourceSize(lion);
    const lionRect = lion?.getBoundingClientRect?.();
    const lionVisible = !lion?.hidden && !lionContainer?.hidden;
    if (lionSize && lionRect && lionRect.width > 0 && lionRect.height > 0 && lionVisible) {
      const x = lionRect.left - rect.left;
      const y = lionRect.top - rect.top;
      try { scratchContext.drawImage(lion, x, y, lionRect.width, lionRect.height); } catch { /* source may decode between checks */ }
    }
    return true;
  };
  const makeBands = (level, rect) => {
    const profile = LEVELS[level];
    const count = Math.round(randomBetween(seededRandom, profile.bands));
    const bands = [];
    const conversationRect = conversation?.getBoundingClientRect?.();
    const sceneBottom = conversationRect && conversationRect.top > 0
      ? Math.min(rect.height - 18, conversationRect.top - (appRect().top || 0) - 12)
      : rect.height - 18;
    const usable = Math.max(1, sceneBottom - 42);
    for (let index = 0; index < count; index += 1) {
      const height = randomBetween(seededRandom, profile.height);
      const y = 18 + seededRandom() * Math.max(1, usable - height);
      const displacement = randomBetween(seededRandom, profile.displacement) * (seededRandom() > .5 ? 1 : -1);
      bands.push({ y, height, displacement, tint: index % 2 ? 'amber' : 'cyan' });
    }
    bands.sort((a, b) => a.y - b.y);
    for (let index = 1; index < bands.length; index += 1) {
      const previous = bands[index - 1];
      bands[index].y = Math.max(bands[index].y, previous.y + previous.height + 8);
      bands[index].y = Math.min(bands[index].y, Math.max(0, rect.height - bands[index].height - 2));
    }
    return bands;
  };
  const drawBurst = (progress) => {
    const burst = state.burst;
    if (!burst || !context || (state.level < 5 && !scratchContext)) return;
    const rect = resize();
    if (!rect) { stopBurst(); scheduleNext(); return; }
    renderPersistent(rect);
    if (state.level < 5 && !capture(rect)) { stopBurst(); renderPersistent(rect); scheduleNext(); return; }
    const decay = progress <= 0 ? 1 : Math.pow(1 - progress, 1.35);
    try {
      for (const band of burst.bands) {
        const alpha = burst.alpha * decay;
        const sourceY = band.y * rect.scale;
        const sourceHeight = band.height * rect.scale;
        const sourceWidth = rect.width * rect.scale;
        if (state.level < 5) {
          context.globalAlpha = alpha;
          context.drawImage(scratch, 0, sourceY, sourceWidth, sourceHeight, band.displacement, band.y, rect.width, band.height);
          context.globalCompositeOperation = 'screen';
          context.globalAlpha = alpha * .14;
          context.drawImage(scratch, 0, sourceY, sourceWidth, sourceHeight, band.displacement + (band.tint === 'cyan' ? -2 : 2), band.y, rect.width, band.height);
        } else {
          context.globalAlpha = alpha * .7;
          context.fillStyle = '#020304';
          context.fillRect(Math.max(0, band.displacement), band.y, rect.width * .72, band.height * .62);
          context.globalAlpha = alpha * .16;
          context.fillStyle = band.tint === 'cyan' ? '#90d9da' : '#d4ad75';
          context.fillRect(Math.max(0, band.displacement + (band.tint === 'cyan' ? -2 : 2)), band.y + band.height * .7, rect.width * .42, 1);
        }
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = alpha * .3;
        context.fillStyle = band.tint === 'cyan' ? '#90d9da' : '#d4ad75';
        for (let scratchLine = 0; scratchLine < 2; scratchLine += 1) {
          const lineY = band.y + 2 + seededRandom() * Math.max(1, band.height - 4);
          const lineWidth = 8 + seededRandom() * Math.min(120, rect.width * .22);
          const lineX = seededRandom() * Math.max(1, rect.width - lineWidth);
          context.fillRect(lineX, lineY, lineWidth, .7);
        }
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    } catch { stopBurst(); renderPersistent(rect); scheduleNext(); }
  };
  const finishBurst = () => {
    cancelFrame();
    state.burst = null;
    renderPersistent();
    scheduleNext();
  };
  const animateBurst = (startedAt) => {
    if (!state.burst || state.hidden || state.disposed) return;
    const elapsed = nowFn() - startedAt;
    const progress = elapsed <= state.burst.hold ? 0 : clamp((elapsed - state.burst.hold) / state.burst.decay, 0, 1);
    drawBurst(progress);
    if (!state.burst) return;
    if (progress >= 1) { finishBurst(); return; }
    state.raf = requestAnimationFrameFn(() => animateBurst(startedAt));
  };
  const startBurst = () => {
    state.timer = null;
    if (state.hidden || state.disposed || state.level <= 0 || app?.dataset?.phase === 'dead' || isReducedMotion()) return;
    const rect = resize();
    if (!rect || (state.level < 5 && !scratchContext)) { scheduleNext(); return; }
    const profile = LEVELS[state.level];
    state.burst = { bands: makeBands(state.level, rect), alpha: profile.alpha, hold: randomBetween(seededRandom, [80, 130]), decay: randomBetween(seededRandom, [360, 700]) };
    animateBurst(nowFn());
  };
  function scheduleNext(initial = false) {
    cancelTimer();
    if (state.hidden || state.disposed || state.level <= 0 || state.reducedMotion || app?.dataset?.phase === 'dead' || !context || !canvas || (state.level < 5 && !scratchContext)) return;
    const profile = LEVELS[state.level];
    const delay = initial ? randomBetween(seededRandom, [650, 1150]) : randomBetween(seededRandom, profile.interval);
    state.timer = setTimeoutFn(startBurst, delay);
  }
  function schedulePersistent() {
    cancelPersistentTimer();
    if (state.level < 4 || state.reducedMotion || state.hidden || state.disposed || !context || !canvas || app?.dataset?.phase === 'dead' || (state.level < 5 && !scratchContext)) return;
    state.persistentTimer = setIntervalFn(() => {
      if (state.burst) return;
      rebuildTexture();
      renderPersistent();
    }, state.level >= 5 ? 120 : 140);
  }
  const drawReducedMotion = () => {
    stopBurst();
    renderPersistent();
  };
  const updateReducedMotion = () => {
    const reduced = isReducedMotion();
    if (reduced === state.reducedMotion) return false;
    state.reducedMotion = reduced;
    stopActivity();
    if (reduced) drawReducedMotion();
    else { renderPersistent(); schedulePersistent(); scheduleNext(true); }
    return true;
  };
  const reducedMotionQuery = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  const onReducedMotionChange = () => updateReducedMotion();
  const onResize = () => {
    const rect = resize();
    if (!rect || state.hidden || state.disposed || state.level <= 0 || app?.dataset?.phase === 'dead') return;
    if (state.burst) { stopBurst(); scheduleNext(); }
    renderPersistent(rect);
  };
  const setLevel = (level) => {
    const next = clamp(level, MIN_LEVEL, MAX_LEVEL);
    if (next === state.level) {
      if (app?.dataset?.phase === 'dead' || !next) stopActivity();
      return;
    }
    state.level = next;
    state.reducedMotion = isReducedMotion();
    stopActivity();
    rebuildTexture();
    if (!next || app?.dataset?.phase === 'dead') return;
    if (state.reducedMotion) { drawReducedMotion(); return; }
    renderPersistent();
    schedulePersistent();
    scheduleNext(true);
  };
  const visibility = (hidden) => {
    const wasHidden = state.hidden;
    state.hidden = Boolean(hidden);
    if (state.hidden) stopActivity();
    else {
      const changed = updateReducedMotion();
      if (!wasHidden && !changed) return;
      if (!changed) {
        renderPersistent();
        if (!state.reducedMotion) { schedulePersistent(); scheduleNext(true); }
      }
    }
  };
  const suspend = () => { state.hidden = true; stopActivity(); };
  const resume = () => { if (!state.disposed) visibility(false); };
  const dispose = () => {
    state.disposed = true;
    stopActivity();
    windowRef?.removeEventListener?.('resize', onResize);
    if (reducedMotionQuery?.removeEventListener) reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
    else reducedMotionQuery?.removeListener?.(onReducedMotionChange);
  };

  if (canvas && windowRef?.addEventListener) windowRef.addEventListener('resize', onResize, { passive: true });
  if (reducedMotionQuery?.addEventListener) reducedMotionQuery.addEventListener('change', onReducedMotionChange);
  else reducedMotionQuery?.addListener?.(onReducedMotionChange);
  state.reducedMotion = isReducedMotion();
  return { setLevel, visibility, suspend, resume, dispose, get level() { return state.level; }, get active() { return state.timer !== null || state.raf !== null || state.persistentTimer !== null; } };
}

export { LEVELS as NOISE_LEVELS };
