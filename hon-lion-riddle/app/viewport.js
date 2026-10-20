// Keep the scene in layout-viewport coordinates and fit the conversation to
// the visible area. Requires interactive-widget=resizes-visual in index.html.
export function connectVisualViewport(app, host = window) {
  const viewport = host.visualViewport;
  if (!viewport) return () => {};

  let frame = null;
  const update = () => {
    frame = null;
    // A pinch zoom is not keyboard occlusion; leave zoom and pan to the browser.
    const zoomed = Math.abs(viewport.scale - 1) > .01;
    const height = zoomed ? host.innerHeight : viewport.height;
    // App top cancels Safari's viewport pan, so offsetTop must not also be
    // subtracted from the bottom inset.
    app.style.setProperty('--viewport-top', `${zoomed ? 0 : viewport.offsetTop}px`);
    app.style.setProperty('--keyboard-inset', `${Math.max(0, host.innerHeight - height)}px`);
    app.style.setProperty('--visible-height', `${height}px`);
  };
  const schedule = () => {
    if (frame === null) frame = host.requestAnimationFrame(update);
  };
  const cancel = () => {
    if (frame !== null) host.cancelAnimationFrame(frame);
    frame = null;
  };
  const listeners = [
    [viewport, 'resize', schedule],
    [viewport, 'scroll', schedule],
    [host, 'resize', schedule],
    [host, 'pageshow', schedule],
    [host, 'pagehide', cancel],
  ];
  for (const [target, event, handler] of listeners) target.addEventListener(event, handler);
  update();

  return () => {
    cancel();
    for (const [target, event, handler] of listeners) target.removeEventListener(event, handler);
    for (const property of ['--viewport-top', '--keyboard-inset', '--visible-height']) {
      app.style.removeProperty(property);
    }
  };
}
