// GPT 3부작 (43 G · 44 P · 45 T) — shared motion tools. PLAN.md §1.1 "다이내믹 지침" (2026-11-12 사용자).
// 44/45 import from '../gpt-generative/motion.mjs'. Names and arguments are fixed by the plan; do not rename.
// Energy comes from motion, not from light: every helper here draws matte things (no Glow) or returns numbers.
// Camera: world layer only. Header, big number and captions are drawn outside withCam (fixed on screen).
// Glow buffers work in screen coordinates: pass world points through camPt(cam, x, y) and multiply radii by cam.z.
import {clamp, easeInOut, rgba, line, withAlpha, PAL} from './kit.mjs';

const clamp01 = q => clamp(q, 0, 1);
/** overshoots a little, then settles (0 → 1) */
export const backOut = (q, s = 1.70158) => { q = clamp01(q) - 1; return q * q * ((s + 1) * q + s) + 1; };
/** springs into place (0 → 1, damped oscillation) */
export const spring = (q, w = 14, d = 6) => (q <= 0 ? 0 : q >= 1 ? 1 : 1 - Math.exp(-d * q) * Math.cos(w * q));
/** accelerates down and bounces once (0 → 1) */
export const drop = q => { q = clamp01(q); return q < 0.72 ? (q / 0.72) ** 2 : 1 - 0.10 * Math.sin((q - 0.72) / 0.28 * Math.PI); };
/** squash scale at the moment of contact: 1 + k at t0 falling back to 1 over d */
export const squash = (t, t0, d = 0.12, k = 0.08) => { const a = t - t0; return a < 0 || a > d ? 1 : 1 + k * (1 - a / d); };

const CAM0 = {cx: 540, cy: 800, z: 1};
/** keys = [{t, cx, cy, z}] (sorted by t); easeInOut between keys → {cx, cy, z}. Default {cx: 540, cy: 800, z: 1}. */
export function camAt(t, keys) {
  if (!keys || !keys.length) return {...CAM0};
  const g = (k, f) => k[f] ?? CAM0[f];
  if (t <= keys[0].t) return {cx: g(keys[0], 'cx'), cy: g(keys[0], 'cy'), z: g(keys[0], 'z')};
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]; if (t >= b.t) continue;
    const a = keys[i - 1], q = easeInOut(clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)));
    // zoom interpolated in log space (constant-feeling push), centre linear
    const za = g(a, 'z'), zb = g(b, 'z');
    return {cx: g(a, 'cx') + (g(b, 'cx') - g(a, 'cx')) * q, cy: g(a, 'cy') + (g(b, 'cy') - g(a, 'cy')) * q, z: za * Math.pow(zb / za, q)};
  }
  const e = keys[keys.length - 1]; return {cx: g(e, 'cx'), cy: g(e, 'cy'), z: g(e, 'z')};
}
/** world layer only: clip to y 240..1360, apply cam about the screen centre (540, 800), run draw() */
export function withCam(stage, cam, draw) {
  const c = stage.ctx, k = cam || CAM0;
  c.save();
  c.beginPath(); c.rect(0, 240, 1080, 1120); c.clip();
  c.translate(540, 800); c.scale(k.z, k.z); c.translate(-k.cx, -k.cy);
  try { draw(); } finally { c.restore(); }
}
/** world point → screen point under cam (for Glow splats; multiply radii and widths by cam.z) */
export const camPt = (cam, x, y) => [540 + (x - cam.cx) * cam.z, 800 + (y - cam.cy) * cam.z];

/**
 * short matte trail behind a fast object moving from → to, now at fraction q. o = {len = 0.18 (fraction of the path),
 * w = 6, a = 0.5, color}. Fades toward the tail. Not Glow.
 */
export function streak(stage, from, to, q, o = {}) {
  const len = o.len ?? 0.18, w = o.w ?? 6, a = o.a ?? 0.5, col = o.color || PAL.warm;
  const q1 = clamp01(q), q0 = Math.max(0, q1 - len); if (q1 - q0 <= 1e-4 || a <= 0) return;
  const P = s => [from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s], c = stage.ctx, n = 8;
  for (let i = 0; i < n; i++) {
    const s0 = q0 + (q1 - q0) * i / n, s1 = q0 + (q1 - q0) * (i + 1) / n, k = (i + 1) / n;
    line(c, [P(s0), P(s1)], rgba(col, a * k * k), w * (0.35 + 0.65 * k), {cap: 'round'});
  }
}
/** thin matte ring at the moment of contact (0.25 s, radius 10 → 46). o = {color, a, r0, r1, w, d} */
export function ringPop(stage, x, y, t, t0, o = {}) {
  const d = o.d ?? 0.25, s = (t - t0) / d; if (s < 0 || s > 1) return;
  const r = (o.r0 ?? 10) + ((o.r1 ?? 46) - (o.r0 ?? 10)) * (1 - (1 - s) ** 2), c = stage.ctx;
  withAlpha(c, (o.a ?? 0.8) * (1 - s), () => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.strokeStyle = o.color || PAL.hot; c.lineWidth = o.w ?? 2; c.stroke(); });
}
/** rolling number: q 0 → 1 rolls from o.from (default 0) up to target (ease-out). → string with thousands commas. o.digits = decimals */
export function rollNum(target, q, o = {}) {
  const from = o.from ?? 0, dg = o.digits ?? 0, e = 1 - (1 - clamp01(q)) ** 3, v = from + (target - from) * e;
  const s = (Math.round(v * 10 ** dg) / 10 ** dg).toFixed(dg), [ip, fp] = s.split('.');
  return ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fp ? '.' + fp : '');
}
/** small speed badge at the top right ("×4", 34 px, warm on a dark plate). mult: number or string */
export function speedBadge(stage, mult, a = 1) {
  if (a <= 0 || mult == null) return;
  const c = stage.ctx, s = typeof mult === 'number' ? '×' + mult : String(mult), size = 34;
  const w = stage.measure(s, {role: 'display', weight: 700, size}), x1 = 1040, y = 146;
  withAlpha(c, a, () => {
    c.beginPath(); c.roundRect(x1 - w - 22, y - 26, w + 22, 52, 10); c.fillStyle = rgba('#03141C', 0.85); c.fill();
    c.strokeStyle = rgba(PAL.warm, 0.6); c.lineWidth = 1.5; c.stroke();
    stage.text(s, x1 - 11, y, {role: 'display', weight: 700, size, color: PAL.warm, align: 'right'});
  });
}
