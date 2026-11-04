import { connectVisualViewport } from "../../hon-lion-riddle/app/viewport.js";

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const isEditor = element => element?.id === "question-input";

// The chat is a viewport-sized document panel, not the legacy fixed scene.
// Keep native WebKit focus scrolling enabled and consume its viewport origin
// once, in document coordinates. Never move the composer ahead of the log.
function connectMessengerViewport(app, host) {
  const document = host.document;
  const viewport = host.visualViewport;
  const html = document.documentElement;
  const previous = html.getAttribute("data-game-viewport");
  html.setAttribute("data-game-viewport", "messenger");
  let frame = null, disposed = false, settleUntil = 0;
  const last = new Map();
  const write = (key, value) => {
    if (last.get(key) === value) return;
    last.set(key, value); app.style.setProperty(key, value);
  };
  const update = () => {
    if (disposed || document.hidden) return;
    // Pinch zoom belongs to the browser; do not chase its scaled viewport.
    if (Math.abs((number(viewport?.scale) || 1) - 1) > .01) return;
    const heights = [number(viewport?.height), number(host.innerHeight), number(html.clientHeight)].filter(n => n > 0);
    const height = Math.min(...heights);
    const top = Math.max(0, number(host.scrollY) + number(viewport?.offsetTop));
    const baseline = Math.max(number(host.innerHeight), number(html.clientHeight), height);
    write("--chat-viewport-top", `${top}px`);
    write("--chat-visible-height", `${height}px`);
    write("--visible-height", `${height}px`);
    write("--scene-height", `${baseline}px`);
    write("--scene-width", `${number(host.innerWidth)}px`);
    write("--keyboard-inset", `${Math.max(0, baseline - height)}px`);
    write("--viewport-offset-top", "0px");
    app.dataset.shortViewport = String(height <= 240);
  };
  const tick = () => {
    frame = null; update();
    if (isEditor(document.activeElement) || host.performance.now() < settleUntil) schedule();
  };
  const schedule = () => {
    if (!disposed && !document.hidden && frame === null) frame = host.requestAnimationFrame(tick);
  };
  const changed = () => { update(); schedule(); };
  const focusChanged = () => { settleUntil = host.performance.now() + 1000; changed(); };
  const visibility = () => {
    if (document.hidden && frame !== null) { host.cancelAnimationFrame(frame); frame = null; }
    else changed();
  };
  const listeners = [[host,"resize",changed],[host,"scroll",changed],[host,"focusin",focusChanged],[host,"focusout",focusChanged],[host,"pageshow",changed],[document,"visibilitychange",visibility]];
  if (viewport) listeners.push([viewport,"resize",changed],[viewport,"scroll",changed]);
  for (const [target,event,handler] of listeners) target.addEventListener(event,handler);
  changed();
  return () => {
    disposed = true;
    if (frame !== null) host.cancelAnimationFrame(frame);
    for (const [target,event,handler] of listeners) target.removeEventListener(event,handler);
    for (const key of last.keys()) app.style.removeProperty(key);
    delete app.dataset.shortViewport;
    if (previous === null) html.removeAttribute("data-game-viewport");
    else html.setAttribute("data-game-viewport",previous);
  };
}

/**
 * iOS can scroll even fixed roots while opening its keyboard. Its window scroll
 * arrives before VisualViewport.offsetTop, so those values cannot be added or
 * used interchangeably. Measure the untransformed app host (outside .app) and
 * consume pan once, on the whole scene. Keep legacy canvas sizing read-only.
 */
export function connectGameViewport(app, host = window) {
  if (app.dataset?.chatLayout === "messenger") return connectMessengerViewport(app, host);
  const disconnectCanvas = connectVisualViewport(app, host);
  const document = host.document;
  const viewport = host.visualViewport;
  if (!viewport || !document?.body) return disconnectCanvas;
  // #app-root is outside the translated .app. A fixed anchor can remain at
  // viewport origin while the app host moves, hiding the native root pan.
  const origin = app.parentElement;
  if (typeof origin?.getBoundingClientRect !== "function") return disconnectCanvas;
  let nativeRootDrift = false;
  let disposed = false;
  let frame = null;
  let settleUntil = 0;
  const now = () => host.performance.now();
  const last = new Map();
  const write = (key, value) => {
    if (last.get(key) === value) return;
    last.set(key, value);
    app.style.setProperty(key, value);
  };
  const update = () => {
    if (disposed) return;
    const focused = isEditor(document.activeElement);
    const scale = number(viewport.scale) || 1;
    // Match the canvas helper's zoom contract, including focus while already
    // zoomed. Starting a new focus must not turn a pinch into keyboard pan.
    const pinching = Math.abs(scale - 1) > 0.01;
    const messenger = app.dataset.chatLayout === "messenger";
    const heights = [number(viewport.height), number(host.innerHeight), number(document.documentElement?.clientHeight)].filter(n => n > 0);
    const visibleHeight = messenger && !pinching ? Math.min(...heights) : number(viewport.height) || number(host.innerHeight);
    if (messenger) write("--chat-visible-height", `${pinching ? number(host.innerHeight) : visibleHeight}px`);
    // VisualViewport, rather than the layout viewport, measures keyboard space.
    // This is a layout hint only; it never scrolls, blurs, or submits input.
    const shortViewport = String(!pinching && visibleHeight <= 240);
    if (app.dataset && app.dataset.shortViewport !== shortViewport) app.dataset.shortViewport = shortViewport;
    const rect = origin.getBoundingClientRect();
    const driftX = -number(rect.left);
    const driftY = -number(rect.top);
    const offsetX = number(viewport.offsetLeft);
    const offsetY = number(viewport.offsetTop);
    if (focused && !pinching && (driftX > 1 || driftY > 1)) nativeRootDrift = true;

    // Retain the measured-origin mode through blur and staggered close events.
    // A stale offsetTop must not move the restored scene down a second time.
    const sceneHeight = Number.parseFloat(app.style.getPropertyValue("--scene-height")) || number(host.innerHeight);
    const recovered = number(viewport.height) >= sceneHeight - 1;
    if (nativeRootDrift && Math.abs(driftX) < 1 && Math.abs(driftY) < 1 &&
        Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1 && recovered) nativeRootDrift = false;

    // Preserve user pinch zoom; this adapter never scrolls or refocuses the page.
    const nativeChatPan = messenger && focused && visibleHeight >= sceneHeight - 1;
    const x = pinching || nativeChatPan ? 0 : nativeRootDrift ? driftX : offsetX;
    const y = pinching || nativeChatPan ? 0 : nativeRootDrift ? driftY : offsetY;
    write("--scene-pan-x", `${x}px`);
    write("--scene-pan-y", `${y}px`);
  };
  const tick = () => {
    frame = null;
    update();
    if (isEditor(document.activeElement) || now() < settleUntil) schedule();
  };
  const schedule = () => {
    if (!disposed && !document.hidden && frame === null) frame = host.requestAnimationFrame(tick);
  };
  const focusIn = () => { update(); schedule(); };
  const focusOut = () => { settleUntil = now() + 1000; update(); schedule(); };
  const visibilityChange = () => {
    if (document.hidden && frame !== null) { host.cancelAnimationFrame(frame); frame = null; }
    else { update(); schedule(); }
  };
  // Scroll correction is synchronous; React rendering and RAF must not delay it.
  const listeners = [
    [host, "scroll", update],
    [host, "resize", update],
    [host, "focusin", focusIn],
    [host, "focusout", focusOut],
    [host, "pageshow", update],
    [viewport, "resize", update],
    [viewport, "scroll", update],
    [document, "visibilitychange", visibilityChange],
  ];
  for (const [target, event, handler] of listeners) target.addEventListener(event, handler);
  update();
  if (isEditor(document.activeElement)) schedule();
  return () => {
    disposed = true;
    if (frame !== null) host.cancelAnimationFrame(frame);
    for (const [target, event, handler] of listeners) target.removeEventListener(event, handler);
    for (const property of ["--scene-pan-x", "--scene-pan-y", "--chat-visible-height"]) app.style.removeProperty(property);
    if (app.dataset) delete app.dataset.shortViewport;
    disconnectCanvas();
  };
}
