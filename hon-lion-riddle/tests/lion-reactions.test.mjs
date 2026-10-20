import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLionReactions,
  LION_REACTION_ASSETS,
  LION_REACTION_DURATIONS,
} from '../app/lion-reactions.js';

class FakeElement {
  constructor({ complete = true, naturalWidth = 1 } = {}) {
    this.complete = complete;
    this.naturalWidth = naturalWidth;
    this.hidden = false;
    this.src = '';
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {
      setProperty: (name, value) => this.style[name] = value,
      removeProperty: (name) => delete this.style[name],
    };
  }
  addEventListener(name, handler) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(handler);
    this.listeners.set(name, listeners);
  }
  dispatch(name) {
    for (const handler of [...(this.listeners.get(name) || [])]) handler();
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
}

function harness({ loaded = true } = {}) {
  const button = new FakeElement();
  const image = new FakeElement();
  const preloadImages = [];
  const timers = new Map();
  let nextTimer = 0;
  let now = 0;
  const setTimeoutFn = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  const clearTimeoutFn = (id) => timers.delete(id);
  const reactions = createLionReactions({
    button,
    image,
    documentRef: { createElement: () => {
      const preload = new FakeElement({ complete: loaded, naturalWidth: loaded ? 1 : 0 });
      preloadImages.push(preload);
      return preload;
    } },
    idleSrc: './assets/characters/hon-lion-dialogue.png?v=test',
    setTimeoutFn,
    clearTimeoutFn,
  });
  const advance = (milliseconds) => {
    now += milliseconds;
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= now && timers.delete(id)) timer.callback();
    }
  };
  return { reactions, button, image, preloadImages, advance };
}

test('maps server choices to approved sprites and restores the idle sprite at the canonical duration', () => {
  const x = harness();
  x.reactions.preload();
  x.reactions.show('PARTIAL');
  assert.match(x.image.src, /hon-lion-yes\.png/);
  assert.equal(x.button.getAttribute('data-reaction'), 'yes');
  assert.equal(x.button.style['--lion-reaction-duration'], `${LION_REACTION_DURATIONS.YES}ms`);
  x.advance(LION_REACTION_DURATIONS.YES - 1);
  assert.equal(x.button.getAttribute('data-reaction'), 'yes');
  x.advance(1);
  assert.match(x.image.src, /hon-lion-dialogue\.png/);
  assert.equal(x.button.getAttribute('data-reaction'), undefined);

  x.reactions.show('SOLVED');
  assert.match(x.image.src, /hon-lion-yes\.png/);
  x.reactions.show('NEEDS_CLARIFICATION');
  assert.match(x.image.src, /hon-lion-irrelevant-round\.png/);
  assert.equal(x.button.getAttribute('data-reaction'), 'irrelevant');
  assert.equal(x.button.style['--lion-reaction-duration'], `${LION_REACTION_DURATIONS.IRRELEVANT}ms`);
});

test('replaying the same answer cancels its old timer and starts a fresh reaction', () => {
  const x = harness();
  x.reactions.preload();
  x.reactions.show('PARTIAL');
  x.advance(300);
  x.reactions.show('PARTIAL');
  x.advance(300);
  assert.equal(x.button.getAttribute('data-reaction'), 'yes');
  x.advance(300);
  assert.equal(x.button.getAttribute('data-reaction'), undefined);
});

test('a late load after clear cannot resurrect a cancelled reaction', () => {
  const x = harness({ loaded: false });
  x.reactions.preload();
  x.reactions.show('PARTIAL');
  x.reactions.clear();
  x.preloadImages[0].complete = true;
  x.preloadImages[0].naturalWidth = 1;
  x.preloadImages[0].dispatch('load');
  assert.match(x.image.src, /hon-lion-dialogue\.png/);
  assert.equal(x.button.getAttribute('data-reaction'), undefined);
});

test('a newer pending answer supersedes an older late load without adding listeners', () => {
  const x = harness({ loaded: false });
  x.reactions.preload();
  const yes = x.preloadImages[0];
  const irrelevant = x.preloadImages[2];
  assert.equal(yes.listeners.get('load').length, 1);
  x.reactions.show('PARTIAL');
  x.reactions.show('NEEDS_CLARIFICATION');
  assert.equal(yes.listeners.get('load').length, 1);
  yes.complete = true;
  yes.naturalWidth = 1;
  yes.dispatch('load');
  assert.match(x.image.src, /hon-lion-dialogue\.png/);
  irrelevant.complete = true;
  irrelevant.naturalWidth = 1;
  irrelevant.dispatch('load');
  assert.match(x.image.src, /hon-lion-irrelevant-round\.png/);
  assert.equal(x.button.getAttribute('data-reaction'), 'irrelevant');
});

test('a missing reaction image falls back quietly to idle', () => {
  const x = harness({ loaded: false });
  x.reactions.preload();
  x.reactions.show('PARTIAL');
  x.preloadImages[0].dispatch('error');
  assert.match(x.image.src, /hon-lion-dialogue\.png/);
  assert.equal(x.button.getAttribute('data-reaction'), undefined);
});

test('duration metadata covers every approved reaction asset', () => {
  assert.deepEqual(Object.keys(LION_REACTION_ASSETS).sort(), ['IRRELEVANT', 'NO', 'YES']);
  assert.deepEqual(Object.keys(LION_REACTION_DURATIONS).sort(), ['IRRELEVANT', 'NO', 'YES']);
});
