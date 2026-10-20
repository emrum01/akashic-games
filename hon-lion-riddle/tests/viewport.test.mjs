import test from 'node:test';
import assert from 'node:assert/strict';
import { connectVisualViewport } from '../app/viewport.js';

function setup() {
  const host = new EventTarget();
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 844, offsetTop: 0, scale: 1 });
  const frames = new Map();
  const styles = new Map();
  let id = 0;
  Object.assign(host, {
    innerHeight: 844,
    visualViewport: viewport,
    requestAnimationFrame: callback => { frames.set(id, callback); return id++; },
    cancelAnimationFrame: frame => frames.delete(frame),
  });
  const disconnect = connectVisualViewport({ style: {
    setProperty: (key, value) => styles.set(key, value),
    removeProperty: key => styles.delete(key),
  } }, host);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  };
  const px = name => parseFloat(styles.get(name));
  return { host, viewport, frames, styles, disconnect, flush, px };
}

test('keyboard resize and Safari pan keep the scene fixed and the conversation above the keyboard', () => {
  const x = setup();
  x.viewport.height = 460;
  x.viewport.offsetTop = 70;
  x.viewport.dispatchEvent(new Event('resize'));
  x.viewport.dispatchEvent(new Event('scroll'));
  assert.equal(x.frames.size, 1, 'resize and pan share one animation frame, even with RAF id 0');
  x.flush();
  const sceneScreenTop = x.px('--viewport-top') - x.viewport.offsetTop;
  const conversationScreenBottom = sceneScreenTop + x.host.innerHeight - x.px('--keyboard-inset');
  assert.equal(sceneScreenTop, 0);
  assert.equal(conversationScreenBottom, x.viewport.height);
  assert.equal(x.px('--visible-height'), 460);

  x.viewport.height = 844;
  x.viewport.offsetTop = 0;
  x.viewport.dispatchEvent(new Event('resize'));
  x.flush();
  assert.equal(x.px('--viewport-top'), 0);
  assert.equal(x.px('--keyboard-inset'), 0);
  assert.equal(x.px('--visible-height'), 844);
});

test('pinch zoom keeps browser pan and does not lift the conversation', () => {
  const x = setup();
  Object.assign(x.viewport, { scale: 2, height: 422, offsetTop: 40 });
  x.viewport.dispatchEvent(new Event('resize'));
  x.flush();
  assert.equal(x.px('--viewport-top'), 0);
  assert.equal(x.px('--keyboard-inset'), 0);
  assert.equal(x.px('--visible-height'), 844);
});

test('rotation refreshes layout bounds and oversized visual viewports never create a negative inset', () => {
  const x = setup();
  x.host.innerHeight = 390;
  x.viewport.height = 400;
  x.host.dispatchEvent(new Event('resize'));
  x.flush();
  assert.equal(x.px('--keyboard-inset'), 0);
  assert.equal(x.px('--visible-height'), 400);
});

test('page restoration refreshes the viewport after a pending frame is cancelled on pagehide', () => {
  const x = setup();
  x.viewport.height = 460;
  x.viewport.dispatchEvent(new Event('resize'));
  x.host.dispatchEvent(new Event('pagehide'));
  assert.equal(x.frames.size, 0);
  x.viewport.height = 600;
  x.host.dispatchEvent(new Event('pageshow'));
  assert.equal(x.frames.size, 1);
  x.flush();
  assert.equal(x.px('--visible-height'), 600);
});

test('disconnect cancels work and removes listeners and viewport overrides', () => {
  const x = setup();
  x.viewport.dispatchEvent(new Event('resize'));
  x.disconnect();
  x.disconnect();
  assert.equal(x.frames.size, 0);
  assert.equal(x.styles.size, 0);
  for (const type of ['resize', 'scroll']) x.viewport.dispatchEvent(new Event(type));
  for (const type of ['resize', 'pageshow', 'pagehide']) x.host.dispatchEvent(new Event(type));
  assert.equal(x.frames.size, 0);
  assert.equal(x.styles.size, 0);
});

test('browsers without VisualViewport retain the CSS fallback', () => {
  const disconnect = connectVisualViewport({}, {});
  assert.doesNotThrow(disconnect);
});
