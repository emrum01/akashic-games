import { beamPower, moteAt, motes } from './timing.js';

export function createCanvasRenderer(canvas, size) {
  const ctx = canvas.getContext('2d', { alpha: true });
  function setup() {
    const { w, h } = size();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }
  function draw(time, p) {
    const { w, h } = setup();
    ctx.clearRect(0, 0, w, h);
    const power = beamPower(time);
    const dx = p.tx - p.mx, dy = p.ty - p.my, len = Math.max(Math.hypot(dx, dy), .0001);
    const ux = dx / len, uy = dy / len;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (power > 0) {
      ctx.save();
      try { ctx.filter = 'blur(14px)'; } catch (error) { /* shadowBlur remains fallback. */ }
      ctx.strokeStyle = `rgba(48,224,255,${.45 * power})`;
      ctx.lineCap = 'round'; ctx.shadowColor = '#20dfff'; ctx.shadowBlur = 24; ctx.lineWidth = 58 * power;
      ctx.beginPath(); ctx.moveTo(p.mx, p.my); ctx.lineTo(p.tx, p.ty); ctx.stroke(); ctx.restore();
      const grad = ctx.createLinearGradient(p.mx, p.my, p.tx, p.ty);
      grad.addColorStop(0, `rgba(216,255,255,${.36 * power})`);
      grad.addColorStop(.1, `rgba(47,226,255,${.92 * power})`);
      grad.addColorStop(.67, `rgba(40,175,255,${.34 * power})`); grad.addColorStop(1, 'rgba(40,160,255,0)');
      ctx.strokeStyle = grad; ctx.shadowColor = '#20dfff'; ctx.shadowBlur = 30; ctx.lineWidth = 46 * power;
      ctx.beginPath(); ctx.moveTo(p.mx, p.my); ctx.lineTo(p.tx, p.ty); ctx.stroke();
      ctx.shadowBlur = 10; ctx.strokeStyle = `rgba(140,249,255,${.9 * power})`; ctx.lineWidth = 16 * power;
      ctx.beginPath(); ctx.moveTo(p.mx, p.my); ctx.lineTo(p.tx, p.ty); ctx.stroke();
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; ctx.strokeStyle = `rgba(248,255,255,${.98 * power})`; ctx.lineWidth = 3.5 * power;
      ctx.beginPath(); ctx.moveTo(p.mx, p.my); ctx.lineTo(p.tx, p.ty); ctx.stroke();
      for (let s = 0; s < 10; s += 1) {
        const offset = ((time * (.38 + s * .07) + s * .17) % 1) * len;
        const wiggle = Math.sin(time * 18 + s * 4.3) * (2 + s % 3);
        ctx.fillStyle = `rgba(225,255,255,${.2 * power})`;
        ctx.fillRect(p.mx + ux * offset - uy * wiggle, p.my + uy * offset + ux * wiggle, 25 + s * 3, 1.2 + (s % 2));
      }
    }
    const scale = Math.min(w, h) / 1080;
    for (const mote of motes) {
      const state = moteAt(mote, time);
      if (!state) continue;
      const along = Math.min(.87, .08 + mote.seed * .58 + state.age * mote.speed);
      const lateral = ((mote.lane * 2 - 1) * (25 + mote.spread * 65) * scale * (.34 + state.age * .66))
        + Math.sin(time * (8 + mote.speed * 9) + mote.phase) * 4 * scale;
      const x = p.mx + ux * len * along - uy * lateral, y = p.my + uy * len * along + ux * lateral;
      const trail = (7 + mote.seed * 18) * scale * (1 - state.age * .45), gold = mote.hue > .86;
      const alpha = state.fade * (gold ? .82 : .72);
      ctx.strokeStyle = gold ? `rgba(255,218,137,${alpha})` : `rgba(196,251,255,${alpha})`;
      ctx.shadowColor = gold ? '#ffd982' : '#5ceeff'; ctx.shadowBlur = (gold ? 7 : 5) * scale;
      ctx.lineWidth = Math.max(.7, mote.size * scale * (gold ? .8 : .65));
      ctx.beginPath(); ctx.moveTo(x - ux * trail, y - uy * trail); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = gold ? `rgba(255,231,169,${alpha})` : `rgba(239,255,255,${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(.8, mote.size * scale), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function dispose() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  return { draw, dispose };
}
