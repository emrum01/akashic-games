export function measureAimPoints(appRect, targetRect, muzzleRect, targetAnchor = null) {
  const w = Math.max(1, appRect.width);
  const h = Math.max(1, appRect.height);
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  return {
    w, h,
    // offsetLeft/offsetTop are the CSS anchor coordinates and stay stable when
    // the renderer animates the target's scale/rotation during dissolve.
    tx: finite(targetAnchor?.x, targetRect.left + targetRect.width / 2 - appRect.left),
    ty: finite(targetAnchor?.y, targetRect.top + targetRect.height / 2 - appRect.top),
    mx: finite(muzzleRect.left - appRect.left, w * .8),
    my: finite(muzzleRect.top - appRect.top, h * .7)
  };
}
