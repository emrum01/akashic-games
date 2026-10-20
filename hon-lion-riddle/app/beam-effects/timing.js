export const SHOT_DURATION = 6;
export const HYBRID_TIMING = Object.freeze({
  beamStart: .45, beamFull: .64, beamFadeStart: 4.1, beamOff: 4.5,
  emitStop: 4.25, targetDissolveStart: 3.5, targetDissolveEnd: 4.45,
  targetFxFadeStart: 4.25, targetFxOff: 5.2
});
export const smooth = (a, b, x) => {
  const v = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return v * v * (3 - 2 * v);
};
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const motes = Array.from({ length: 180 }, (_, i) => ({
  seed: hash(i + 401), lane: hash(i + 461), speed: .16 + hash(i + 521) * .24,
  spread: hash(i + 581), size: .8 + hash(i + 641) * 2.4,
  hue: hash(i + 701), phase: hash(i + 761) * Math.PI * 2
}));
export function beamPower(time) {
  const envelope = 1 - smooth(HYBRID_TIMING.beamFadeStart, HYBRID_TIMING.beamOff, time);
  return clamp(smooth(.05, .55, time) * envelope * .25 + smooth(HYBRID_TIMING.beamStart, HYBRID_TIMING.beamFull, time) * envelope);
}
export function targetPower(time) {
  return clamp(smooth(.35, .72, time) * (1 - smooth(HYBRID_TIMING.targetFxFadeStart, HYBRID_TIMING.targetFxOff, time)));
}
export function targetOpacity(time) {
  return 1 - smooth(HYBRID_TIMING.targetDissolveStart, HYBRID_TIMING.targetDissolveEnd, time);
}
export function moteAt(mote, time) {
  const firstEmit = .48 + mote.seed * .72;
  const life = .62 + mote.lane * .54;
  const cycle = life + .08;
  if (time < firstEmit) return null;
  const lastCycle = Math.floor((HYBRID_TIMING.emitStop - firstEmit) / cycle);
  const cycleIndex = Math.min(Math.floor((time - firstEmit) / cycle), lastCycle);
  const emit = firstEmit + Math.max(0, cycleIndex) * cycle;
  const age = (time - emit) / life;
  if (age <= 0 || age >= 1) return null;
  return { emit, age, fade: smooth(0, .12, age) * (1 - smooth(.64, 1, age)) };
}
export function frameTiming(time, reducedMotion) {
  const hit = smooth(.72, 1.1, time);
  const dissolve = 1 - targetOpacity(time);
  const recoil = Math.sin(clamp((time - .53) / .42, 0, 1) * Math.PI) * (1 - smooth(.63, 1.1, time));
  const initialShake = hit * (1 - smooth(1.15, 1.85, time));
  const rumble = smooth(.62, .92, time) * (1 - smooth(HYBRID_TIMING.beamFadeStart, HYBRID_TIMING.beamOff + .16, time)) * .34;
  const shakeSignal = Math.sin(time * 71) * .55 + Math.sin(time * 43 + 1.7) * .3;
  return { hit, dissolve, recoil: reducedMotion ? 0 : recoil, shakePower: reducedMotion ? 0 : shakeSignal * clamp(initialShake + rumble) };
}
