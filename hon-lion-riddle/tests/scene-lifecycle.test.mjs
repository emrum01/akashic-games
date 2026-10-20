import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createCheckpointStepRunner } from '../app/checkpoint-procedures.js';

const source = (await readFile(new URL('../app/scene-runtime.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup({ fetchManifest = async () => ({ ok: true, json: async () => ({}) }) } = {}) {
  const events = new Map();
  const warnings = [];
  const timers = new Map();
  let nextTimer = 0;
  const video = {
    currentTime: 0, duration: 5, readyState: 4,
    play: () => Promise.resolve(), pause() {}, load() {}, removeAttribute() {},
  };
  const poster = { src: '', complete: true, naturalWidth: 1 };
  const error = { hidden: true };
  const elements = {
    '#app': {},
    '.scene-background': { classList: { add() {}, remove() {} } },
    '#scene-poster': poster, '#scene-video': video, '#scene-error': error,
  };
  const setTimer = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  };
  const document = {
    hidden: false,
    querySelector: selector => elements[selector],
    addEventListener: (name, handler) => events.set(name, handler),
  };
  const window = {
    innerWidth: 1280, innerHeight: 720,
    location: { href: 'http://localhost/' },
    matchMedia: () => ({ matches: false }),
    setTimeout: setTimer,
    addEventListener() {},
    dispatchEvent: event => warnings.push(event),
  };
  const context = vm.createContext({
    window, document, URL, structuredClone, console, createCheckpointStepRunner,
    fetch: fetchManifest,
    setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  vm.runInContext(source, context);
  return {
    video, document, events, warnings, error, timers,
    runtime: window.__HON_LION_SCENE_RUNTIME__,
    snapshot: () => window.__HON_LION_SCENE__.snapshot(),
  };
}

test('a clip with no media events falls back after the load timeout', async () => {
  const x = setup();
  await tick();
  const movement = x.runtime.setStage(1);
  const timeout = [...x.timers.values()].find(timer => timer.delay === 5000);
  assert.ok(timeout, 'starting a route arms the load deadline before metadata');
  timeout.callback();
  const result = await movement;
  assert.equal(result.fallback, true);
  assert.equal(result.cancelled, false);
  assert.equal(x.snapshot().currentNode, 'b');
  assert.equal(x.snapshot().media.playing, false);
  assert.match(x.snapshot().error, /静止画/);
});

for (const restart of [false, true]) {
  test(`late resume rejection cannot change a ${restart ? 'restarted' : 'halted'} scene`, async () => {
    const x = setup();
    await tick();
    const movement = x.runtime.setStage(1);
    x.video.onplay();
    x.document.hidden = true;
    x.events.get('visibilitychange')();
    const resumed = deferred();
    x.video.play = () => resumed.promise;
    x.document.hidden = false;
    x.events.get('visibilitychange')();
    x.runtime.halt();
    assert.equal((await movement).cancelled, true);
    if (restart) {
      await x.runtime.reset();
      x.video.play = () => Promise.resolve();
      x.runtime.setStage(2);
      x.video.onplay();
    }
    const before = x.snapshot();
    resumed.reject(new Error('old play request aborted'));
    await tick();
    assert.deepEqual(x.snapshot(), before, 'old playback failure must not finish or replace the current scene');
    assert.equal(x.warnings.length, 0);
  });
}

for (const ok of [true, false]) {
  test(`manifest ${ok ? 'success' : 'failure'} arriving after halt leaves the death scene stopped`, async () => {
    const pending = deferred();
    const x = setup({ fetchManifest: () => pending.promise });
    x.runtime.halt();
    pending.resolve({ ok, status: 503, json: async () => ({}) });
    await tick();
    assert.equal(x.snapshot().ready, true, 'assets settle so a retry can proceed');
    assert.equal(x.snapshot().context, 'stopped');
    assert.equal(x.snapshot().status, 'stopped');
    assert.equal(x.error.hidden, true);
    assert.equal(x.warnings.length, 0);
    await x.runtime.reset();
    assert.equal(x.snapshot().context, 'active');
    assert.equal(x.snapshot().currentNode, 'a');
  });
}
