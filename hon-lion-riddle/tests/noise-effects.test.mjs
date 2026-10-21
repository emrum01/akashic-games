import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoiseEffects } from '../app/noise-effects.js';

function setup({ reduced = false, broken = false, videoPlaying = false } = {}) {
  let now = 0;
  let reducedMotion = reduced;
  let width = 400;
  let resizeHandler = null;
  let nextId = 0;
  const timers = new Map();
  const frames = new Map();
  const calls = [];
  const context = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '',
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    setTransform: (...args) => calls.push(['setTransform', ...args]),
    drawImage: (...args) => { if (broken) throw new Error('decode'); calls.push(['drawImage', ...args]); },
    fillRect: (...args) => calls.push(['fillRect', ...args]),
  };
  const scratchContext = { ...context, drawImage: (...args) => { if (broken) throw new Error('decode'); calls.push(['scratchDrawImage', ...args]); } };
  const canvas = { width: 0, height: 0, getContext: () => context };
  const scratch = { width: 0, height: 0, getContext: () => scratchContext };
  const app = { dataset: { phase: 'question' }, clientWidth: 400, clientHeight: 300, getBoundingClientRect: () => ({ left: 0, top: 0, width, height: 300 }) };
  const sceneBackground = { classList: { contains: name => videoPlaying && name === 'video-playing' } };
  const conversation = { getBoundingClientRect: () => ({ top: 220, left: 0, width: 400, height: 80 }) };
  const poster = { naturalWidth: 800, naturalHeight: 600, complete: true };
  const video = { readyState: 4, videoWidth: 640, videoHeight: 360 };
  const lion = { naturalWidth: 100, naturalHeight: 100, hidden: false, getBoundingClientRect: () => ({ left: 150, top: 40, width: 100, height: 100 }) };
  const windowRef = {
    innerWidth: 400, innerHeight: 300, performance: { now: () => now },
    matchMedia: () => ({ matches: reducedMotion }),
    addEventListener: (name, handler) => { if (name === 'resize') resizeHandler = handler; },
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, delay, interval: true }); return id; },
    clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const controller = createNoiseEffects({ canvas, app, sceneBackground, scenePoster: poster, sceneVideo: video, conversation, lion, windowRef, documentRef: { createElement: () => scratch }, nowFn: () => now });
  return {
    controller, app, canvas, windowRef, sceneBackground, timers, frames, calls,
    setReducedMotion(value) { reducedMotion = value; },
    resize(nextWidth = 520) { width = nextWidth; resizeHandler?.(); },
    timeoutCount() { return [...timers.values()].filter(timer => !timer.interval).length; },
    runTimer() { const entry = [...timers.entries()].find(([, timer]) => !timer.interval); const [id, timer] = entry || []; if (id !== undefined) { timers.delete(id); timer.fn(); } return timer; },
    runFrame(ms = 100) { now += ms; const [id, frame] = frames.entries().next().value || []; if (id !== undefined) { frames.delete(id); frame(now); } },
  };
}

test('level zero stays inert and clearing a level cancels the scheduled burst', () => {
  const x = setup();
  x.controller.setLevel(0);
  assert.equal(x.timers.size, 0);
  x.controller.setLevel(3);
  assert.equal(x.timeoutCount(), 1);
  const timer = [...x.timers.entries()].find(([, value]) => !value.interval)?.[0];
  x.controller.setLevel(3);
  assert.equal([...x.timers.entries()].find(([, value]) => !value.interval)?.[0], timer, 'repeating the same stage does not restart its cadence');
  x.controller.setLevel(0);
  assert.equal(x.timers.size, 0);
  assert.equal(x.frames.size, 0);
  assert.equal(x.controller.active, false);
});

test('a burst reads the current scene and uses displaced bands without an idle RAF loop', () => {
  const x = setup();
  x.controller.setLevel(4);
  x.runTimer();
  assert.equal(x.frames.size, 1);
  assert.ok(x.calls.some(call => call[0] === 'drawImage'), 'the scene and lion are sampled into the burst');
  x.runFrame(100);
  assert.ok(x.calls.some(call => call[0] === 'fillRect'), 'localized scratches are added to the copied bands');
  for (let i = 0; i < 12 && x.frames.size; i += 1) x.runFrame(100);
  assert.equal(x.frames.size, 0, 'decay ends the animation');
  assert.equal(x.timeoutCount(), 1, 'one next burst timer is kept during the idle period');
});

test('a preloaded hidden video never replaces the displayed poster', () => {
  const x = setup({ videoPlaying: false });
  x.controller.setLevel(4);
  x.runTimer();
  const sourceDraw = x.calls.find(call => call[0] === 'scratchDrawImage');
  assert.equal(sourceDraw[1].videoWidth, undefined, 'the first source draw uses the poster');
});

test('dead phase, hidden page, and dispose stop all animated work', () => {
  const x = setup();
  x.app.dataset.phase = 'dead';
  x.controller.setLevel(5);
  assert.equal(x.timers.size, 0);
  x.app.dataset.phase = 'question';
  x.controller.setLevel(4);
  assert.equal(x.timeoutCount(), 1);
  x.controller.visibility(true);
  assert.equal(x.timers.size, 0);
  x.controller.visibility(false);
  assert.equal(x.timeoutCount(), 1);
  x.controller.dispose();
  assert.equal(x.timers.size, 0);
  assert.equal(x.frames.size, 0);
  x.controller.resume();
  assert.equal(x.timers.size, 0);
});

test('reduced motion clears copied strips and has no recurring timer or RAF', () => {
  const reduced = setup({ reduced: true });
  assert.doesNotThrow(() => reduced.controller.setLevel(5));
  assert.equal(reduced.timers.size, 0);
  assert.equal(reduced.frames.size, 0);
  assert.equal(reduced.calls.some(call => call[0] === 'drawImage'), false);

  const resumed = setup();
  resumed.controller.setLevel(5);
  resumed.runTimer();
  resumed.setReducedMotion(true);
  resumed.controller.visibility(true);
  assert.equal(resumed.frames.size, 0);
  resumed.controller.visibility(false);
  assert.equal(resumed.timers.size, 0, 'preference changes clear the copied strip without starting a loop');

  const broken = setup({ broken: true });
  broken.controller.setLevel(2);
  assert.doesNotThrow(() => broken.runTimer());
  assert.equal(broken.frames.size, 0);

  const missing = createNoiseEffects({ canvas: null, app: { dataset: { phase: 'question' } }, windowRef: { matchMedia: () => ({ matches: false }) } });
  missing.setLevel(5);
  assert.equal(missing.active, false, 'missing canvas does not schedule repeated no-op timers');
});

test('reduced mode redraws its frozen layer after hide and show', () => {
  const x = setup({ reduced: true });
  x.controller.setLevel(5);
  x.controller.visibility(true);
  const before = x.calls.filter(call => call[0] === 'fillRect').length;
  x.controller.visibility(false);
  const after = x.calls.filter(call => call[0] === 'fillRect').length;
  assert.ok(after > before, 'returning to the page redraws the static degradation');
  x.controller.suspend();
  x.controller.resume();
  assert.ok(x.calls.filter(call => call[0] === 'fillRect').length > after, 'page restore redraws the frozen layer too');
  const beforeResize = x.calls.filter(call => call[0] === 'fillRect').length;
  x.resize(640);
  assert.ok(x.calls.filter(call => call[0] === 'fillRect').length > beforeResize, 'resize redraws frozen noise after resizing clears the canvas');
  assert.equal(x.timers.size, 0, 'reduced mode never starts cadence timers');
  assert.equal(x.frames.size, 0);
});

test('resize redraws the persistent layer without duplicating its cadence', () => {
  const x = setup();
  x.controller.setLevel(4);
  const timeout = [...x.timers.entries()].find(([, value]) => !value.interval)?.[0];
  const before = x.calls.filter(call => call[0] === 'clearRect').length;
  x.resize(640);
  const after = x.calls.filter(call => call[0] === 'clearRect').length;
  assert.ok(after > before);
  assert.equal([...x.timers.entries()].find(([, value]) => !value.interval)?.[0], timeout);
  assert.equal([...x.timers.values()].filter(value => value.interval).length, 1);
});

test('persistent dropout geometry stays stable while a burst is redrawn', () => {
  const x = setup();
  x.controller.setLevel(4);
  x.runTimer();
  const snapshots = [];
  for (let frame = 0; frame < 2; frame += 1) {
    x.runFrame(40);
    const clearIndex = x.calls.map(call => call[0]).lastIndexOf('clearRect');
    const imageIndex = x.calls.map(call => call[0]).indexOf('drawImage', clearIndex);
    snapshots.push(x.calls.slice(clearIndex, imageIndex).filter(call => call[0] === 'fillRect').map(call => call.slice(1)));
  }
  assert.deepEqual(snapshots[0], snapshots[1], 'persistent grain and dropout marks are cached between RAF frames');
});

test('repeated visible notifications preserve an idle cadence and an active burst', () => {
  const idle = setup();
  idle.controller.setLevel(1);
  const timer = idle.timers.keys().next().value;
  idle.controller.visibility(false);
  assert.equal(idle.timers.keys().next().value, timer);

  const burst = setup();
  burst.controller.setLevel(1);
  burst.runTimer();
  assert.equal(burst.frames.size, 1);
  burst.controller.resume();
  assert.equal(burst.frames.size, 1, 'resume while visible does not start a second RAF chain');
  assert.equal(burst.timeoutCount(), 0);
});

test('a visible notification rechecks a newly enabled reduced-motion preference', () => {
  const x = setup();
  x.controller.setLevel(4);
  x.setReducedMotion(true);
  x.calls.length = 0;
  x.controller.visibility(false);
  assert.ok(x.calls.some(call => call[0] === 'fillRect'), 'the frozen reduced-motion layer is redrawn');
  assert.equal(x.timers.size, 0, 'both burst and persistent cadence stop');
  assert.equal(x.frames.size, 0);
});

test('level five bursts remain procedural when the scratch source is unavailable', () => {
  const x = setup();
  const controller = createNoiseEffects({
    canvas: x.canvas, app: x.app, sceneBackground: x.sceneBackground, conversation: null,
    scenePoster: { naturalWidth: 800, naturalHeight: 600 }, sceneVideo: { readyState: 0 }, lion: null,
    windowRef: x.windowRef, documentRef: { createElement: () => ({ getContext: () => null }) }, nowFn: () => 0,
  });
  controller.setLevel(5);
  controller.resume();
  x.calls.length = 0;
  x.runTimer();
  assert.equal(x.calls.some(call => call[0] === 'drawImage' || call[0] === 'scratchDrawImage'), false);
  assert.ok(x.calls.some(call => call[0] === 'fillRect'), 'procedural bands render without a source');
  assert.equal(x.frames.size, 1, 'the burst really starts despite the unavailable source');
  assert.equal(controller.active, true);
  controller.dispose();
});

test('unavailable canvas contexts produce an inert controller without throwing', () => {
  const x = setup();
  const throwing = createNoiseEffects({ canvas: { getContext: () => { throw new Error('canvas'); } }, app: x.app, windowRef: x.windowRef });
  assert.doesNotThrow(() => throwing.setLevel(5));
  assert.equal(throwing.active, false);

  const scratchFailure = createNoiseEffects({ canvas: x.canvas, app: x.app, sceneBackground: x.sceneBackground, windowRef: x.windowRef, documentRef: { createElement: () => { throw new Error('scratch'); } } });
  assert.doesNotThrow(() => scratchFailure.setLevel(4));
  assert.equal(scratchFailure.active, false, 'image levels stay inert without a scratch context');
  scratchFailure.setLevel(5);
  assert.equal(scratchFailure.active, true, 'procedural level five can run without a source canvas');
  scratchFailure.dispose();
});
