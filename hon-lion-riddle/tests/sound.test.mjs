import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundDesign } from '../app/sound.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(t, { fetcher, rejectOpus = false, deferEnded = false } = {}) {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  const nodes = [], gains = [], requests = [], contexts = [], resumes = [], states = [];
  const param = () => ({
    value: 0, calls: [],
    setValueAtTime(value) { this.value = value; this.calls.push(value); },
    linearRampToValueAtTime(value) { this.value = value; this.calls.push(value); },
    setTargetAtTime(value) { this.value = value; this.calls.push(value); },
    cancelScheduledValues() {},
  });
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 24000; destination = {};
    constructor() { contexts.push(this); }
    createGain() {
      const gain = { gain: param(), disconnected: false, connect() { return this; }, disconnect() { this.disconnected = true; } };
      gains.push(gain);
      return gain;
    }
    createBuffer(_channels, length, rate) { return { duration: length / rate, copyToChannel() {} }; }
    createBufferSource() {
      const node = {
        playbackRate: param(), stopped: false, started: false, disconnected: false, stopCalls: [],
        connect(target) { this.connectedTo = target; return this; }, disconnect() { this.disconnected = true; },
        start() { this.started = true; },
        stop(time = 0) {
          this.stopCalls.push(time);
          if (!time) {
            this.stopped = true;
            if (!deferEnded) this.onended?.();
          }
        },
      };
      nodes.push(node);
      return node;
    }
    addEventListener() {}
    resume() { resumes.push(this); this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    decodeAudioData(data) {
      if (rejectOpus && data.includes('.ogg')) return Promise.reject(new Error('unsupported codec'));
      return Promise.resolve({ duration: data.includes('room-texture') ? 26 : data.includes('presence') ? 1.63 : data.includes('weapon-ready') ? .45 : data.includes('key') ? .67 : data.includes('discharge') ? 1.34 : 2.95, asset: data });
    }
  }
  globalThis.window = { AudioContext: Context };
  globalThis.fetch = (url, options) => {
    requests.push(String(url));
    return fetcher ? fetcher(String(url), options) : Promise.resolve({ ok: true, arrayBuffer: async () => String(url) });
  };
  t.after(() => { globalThis.window = previous.window; globalThis.fetch = previous.fetch; });
  const sound = createSoundDesign(state => states.push(state));
  t.after(() => sound.stop());
  return { sound, nodes, gains, requests, contexts, resumes, states };
}

test('late audio decode cannot restart a removed insect or a reset game', async t => {
  const pending = [];
  const x = harness(t, { fetcher: url => new Promise(resolve => pending.push(() => resolve({ ok: true, arrayBuffer: async () => url }))) });
  x.sound.start();
  const before = x.nodes.length;
  x.sound.removeInsect();
  assert.equal(x.nodes.length, before);
  assert.ok(x.nodes.every(node => node.stopped));
  assert.equal(x.states.at(-1).removed, true);
  pending.forEach(resolve => resolve());
  await tick();
  assert.equal(x.nodes.length, before, 'a decode finishing while removed cannot create another voice');
  assert.ok(x.nodes.every(node => node.stopped));
  assert.equal(x.states.at(-1).removed, true);
  x.sound.start();
  assert.equal(x.nodes.filter(node => node.loop && !node.stopped).length, 1);
  x.sound.stop();
  x.sound.reward(); x.sound.reveal(); x.sound.shoot(); x.sound.door();
  assert.ok(x.nodes.every(node => node.stopped));
});

test('replay reuses in-flight asset requests without scheduling delayed one-shots', async t => {
  const pending = [];
  const x = harness(t, { fetcher: url => new Promise(resolve => pending.push(() => resolve({ ok: true, arrayBuffer: async () => url }))) });
  x.sound.start();
  const initialRequests = x.requests.length;
  x.sound.stop();
  x.sound.start();
  assert.equal(x.requests.length, initialRequests, 'replay deduplicates each in-flight asset load');
  pending.forEach(resolve => resolve());
  await tick();
  assert.equal(x.requests.length, initialRequests);
  assert.ok(x.nodes.some(node => node.buffer.asset?.includes('room-texture')));
  assert.ok(x.nodes.every(node => node.loop), 'loading a cue never plays it late');
});

test('mute and hidden state suppress one-shots; replay and codec fallback remain usable', async t => {
  const x = harness(t, { rejectOpus: true });
  x.sound.start();
  await tick();
  assert.equal(x.requests.filter(url => url.includes('.m4a')).length, 6);
  x.sound.start();
  assert.equal(x.contexts.length, 1);
  x.sound.toggle();
  let count = x.nodes.length;
  x.sound.reward(); x.sound.reveal(); x.sound.shoot(); x.sound.door();
  assert.equal(x.nodes.length, count);
  x.sound.visibility(true);
  x.sound.reveal();
  assert.equal(x.nodes.length, count);
  x.sound.toggle();
  assert.equal(x.contexts[0].state, 'suspended', 'unmuting in a hidden tab cannot resume audio');
  x.sound.visibility(false);
  await tick();
  x.sound.reward('raygun');
  assert.match(x.nodes.at(-1).buffer.asset, /weapon-ready\.m4a/);
  x.sound.door({ duration: 3 });
  const door = x.nodes.at(-1);
  assert.equal(door.playbackRate.value, 2.95 / 3);
  assert.equal(door.stopped, false, 'a scheduled natural end is not an immediate cancellation');
  const doorStops = door.stopCalls.length;
  x.sound.stopDoor();
  assert.equal(door.stopped, true);
  assert.equal(door.stopCalls.length, doorStops + 1);
  assert.equal(door.stopCalls.at(-1), 0);
  x.sound.reveal();
  const reveal = x.nodes.at(-1);
  assert.match(reveal.buffer.asset, /presence\.m4a/);
  assert.equal(reveal.stopped, false);
  const revealStops = reveal.stopCalls.length;
  x.sound.shoot();
  assert.equal(reveal.stopped, true, 'firing stops an active reveal sting before the beam');
  assert.equal(reveal.stopCalls.length, revealStops + 1);
  assert.equal(reveal.stopCalls.at(-1), 0);
  assert.match(x.nodes.at(-1).buffer.asset, /discharge\.m4a/);
  x.sound.removeInsect();
  assert.ok(x.nodes.every(node => node.stopped));
  x.sound.visibility(false);
  count = x.nodes.length;
  await tick();
  assert.equal(x.nodes.length, count);
});

test('failed audio files retain the clue and never schedule a delayed one-shot', async t => {
  const x = harness(t, { fetcher: async () => ({ ok: false }) });
  x.sound.start();
  await tick();
  assert.equal(x.nodes.filter(node => node.loop && !node.stopped).length, 1);
  x.sound.reward('key'); x.sound.shoot();
  assert.equal(x.nodes.length, 1, 'unavailable Foley stays silent instead of borrowing the clue noise');
  await tick();
  assert.equal(x.nodes.length, 1);
  x.sound.stop();
  assert.ok(x.nodes.every(node => node.stopped));
});

test('explicit stop disconnects delayed-ending sources and their gains', async t => {
  const x = harness(t, { deferEnded: true });
  x.sound.start();
  await tick();
  x.sound.reveal();
  const source = x.nodes.at(-1);
  const gain = x.gains.at(-1);
  x.sound.stop();
  assert.equal(source.stopped, true);
  assert.equal(source.disconnected, true);
  assert.equal(gain.disconnected, true);
  source.onended?.();
  assert.equal(source.disconnected, true, 'late onended cleanup is idempotent');
  assert.equal(gain.disconnected, true);
});

test('a transient load failure is retried after replay', async t => {
  let available = false;
  const x = harness(t, { fetcher: async url => available
    ? { ok: true, arrayBuffer: async () => url }
    : { ok: false } });
  x.sound.start();
  await tick();
  x.sound.stop();
  available = true;
  x.sound.start();
  await tick();
  x.sound.reward('raygun');
  assert.match(x.nodes.at(-1).buffer.asset, /weapon-ready\.ogg/);
  assert.ok(x.requests.length > 12, 'replay issued fresh requests after the failed pass');
});

test('starting while hidden waits to resume until visibility returns', async t => {
  const x = harness(t);
  x.sound.visibility(true);
  x.sound.start();
  await tick();
  assert.equal(x.resumes.length, 0);
  x.sound.visibility(false);
  await tick();
  assert.equal(x.resumes.length, 1);
  x.sound.stop();
});

test('an environment without Web Audio can finish without throwing', t => {
  const x = harness(t);
  globalThis.window = {};
  x.sound.start(); x.sound.reward(); x.sound.reveal(); x.sound.door(); x.sound.shoot();
  x.sound.removeInsect(); x.sound.visibility(false);
  assert.equal(x.states.at(-1).available, false);
  assert.equal(x.states.at(-1).removed, true);
});
