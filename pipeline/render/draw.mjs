// Drawing primitives, easing, seeded randomness and a tiny 3D projection.
// Every ctx-taking function is also available pre-bound as stage.draw.<name>(...) without ctx.

// ---------- math / easing ----------
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, q) => a + (b - a) * q;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d, clamped = true) => lerp(c, d, clamped ? clamp(invLerp(a, b, x)) : invLerp(a, b, x));
/** smoothstep on [0,1] (clamped) */
export const smooth = q => { q = clamp(q); return q * q * (3 - 2 * q); };
export const easeInOut = q => { q = clamp(q); return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2; };
export const easeOut = q => { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
export const easeIn = q => { q = clamp(q); return q * q * q; };
/** 0→1→0 bump over [a,b] (useful for a highlight that rises and falls) */
export const bump = (q, a = 0, b = 1) => { const u = clamp(invLerp(a, b, q)); return Math.sin(u * Math.PI); };
export const TAU = Math.PI * 2;

// ---------- seeded randomness ----------
/** Deterministic hash → [0,1). Same i gives the same value in every frame. */
export const rand = i => { const a = Math.sin(i * 127.1 + 97.2) * 43758.5453; return a - Math.floor(a); };
/** Seeded PRNG (mulberry32). const r = rng(7); r() → [0,1) */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- colour ----------
/** '#rgb' | '#rrggbb' | '#rrggbbaa' + alpha → 'rgba(...)' */
export function rgba(hex, a = 1) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const base = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${clamp(a * base)})`;
}
/** Mix two hex colours, q in [0,1] → '#rrggbb' */
export function mix(h1, h2, q) {
  const p = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const a = p(h1), b = p(h2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(q))).toString(16).padStart(2, '0')).join('');
}

// ---------- primitives ----------
export function circle(ctx, x, y, r, fill) { if (r <= 0) return; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
/** Stroked circle or arc (angles in radians, clockwise from +x). */
export function ring(ctx, x, y, r, stroke, w = 1, a0 = 0, a1 = TAU) { if (r <= 0) return; ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); }
export const arc = ring;
export function line(ctx, pts, stroke, w = 1, {dash = null, cap = 'round'} = {}) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = w; ctx.lineCap = cap; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke;
  if (dash) ctx.setLineDash(dash); ctx.stroke(); if (dash) ctx.setLineDash([]);
}
export function poly(ctx, pts, fill, stroke = null, w = 1) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke(); }
}
export function rect(ctx, x, y, w, h, r = 0, fill = null, stroke = null, lw = 1) {
  ctx.beginPath(); if (r) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
/** Soft radial glow. Use for explanatory emphasis; keep a small. */
export function glow(ctx, x, y, r, col, a = 0.3) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.25, rgba(col, a * 0.4)); g.addColorStop(1, rgba(col, 0));
  circle(ctx, x, y, r, g);
}
/** Shaded sphere lit from upper-left. o: {alpha, light:'#fffef3', shade:'#0b1e26', lx:-.35, ly:-.4} */
export function sphere(ctx, x, y, r, col, o = {}) {
  if (r <= 0) return;
  const {alpha = 1, light = '#fffef3', shade = '#0b1e26', lx = -0.35, ly = -0.4} = typeof o === 'number' ? {alpha: o} : o;
  ctx.save(); ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x + r * lx, y + r * ly, Math.max(0.5, r * 0.03), x, y, r);
  g.addColorStop(0, light); g.addColorStop(0.3, col); g.addColorStop(0.72, col); g.addColorStop(1, shade);
  circle(ctx, x, y, r, g); ctx.restore();
}
/** Contact shadow ellipse under an object (sells depth). */
export function contactShadow(ctx, x, y, rx, ry, a = 0.45) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  circle(ctx, 0, 0, rx, g); ctx.restore();
}
/** Arrow from a to b with a filled or open head. o: {head:18, spread:.45, fill:true, dash} */
export function arrow(ctx, a, b, col, w = 3, o = {}) {
  const {head = 6 + w * 4, spread = 0.45, fill = true, dash = null} = o;
  const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const back = [b[0] - head * Math.cos(th) * 0.85, b[1] - head * Math.sin(th) * 0.85];
  line(ctx, [a, fill ? back : b], col, w, {dash});
  const p1 = [b[0] - head * Math.cos(th - spread), b[1] - head * Math.sin(th - spread)];
  const p2 = [b[0] - head * Math.cos(th + spread), b[1] - head * Math.sin(th + spread)];
  if (fill) poly(ctx, [p1, b, p2], col); else line(ctx, [p1, b, p2], col, w);
}
/** Points along a quadratic curve a→b bending by `bend` (px, perpendicular). */
export function curve(a, b, bend = 0, n = 32) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
  const c = [mx - dy / d * bend, my + dx / d * bend], pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]]); }
  return pts;
}
/** Run fn with multiplied globalAlpha. */
export function withAlpha(ctx, a, fn) { if (a <= 0) return; ctx.save(); ctx.globalAlpha *= clamp(a); try { fn(); } finally { ctx.restore(); } }
/** Run fn clipped to an ellipse (magnifier insets, sections). */
export function clipEllipse(ctx, cx, cy, rx, ry, fn, rot = 0) {
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU); ctx.clip();
  try { fn(); } finally { ctx.restore(); }
}
export function clipRect(ctx, x, y, w, h, r, fn) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  try { fn(); } finally { ctx.restore(); }
}

// ---------- labels that need fonts (take the stage) ----------
/**
 * Leader label: text placed at `at`, with a thin line to the object point `to` and a small dot.
 * o: {color, lineColor, size:30, weight:500, align (auto from side), dot:true, alpha, sub (second smaller line)}
 */
export function leader(stage, label, to, at, o = {}) {
  const {ctx} = stage, th = stage.theme || {};
  const color = o.color || th.ink || '#EFE3D4', lc = o.lineColor || rgba(th.muted || '#8AA0A6', 0.8), size = o.size || 30;
  const align = o.align || (at[0] < to[0] ? 'right' : 'left');
  withAlpha(ctx, o.alpha ?? 1, () => {
    const gap = 10, ex = align === 'right' ? at[0] + gap : align === 'left' ? at[0] - gap : at[0];
    const elbow = [ex, at[1]];
    line(ctx, [to, elbow], lc, o.lineWidth || 2);
    if (o.dot !== false) { circle(ctx, to[0], to[1], 5, lc); ring(ctx, to[0], to[1], 9, rgba(th.muted || '#8AA0A6', 0.5), 1.5); }
    stage.text(label, at[0], at[1] - (o.sub ? size * 0.35 : 0), {size, color, weight: o.weight ?? 500, align});
    if (o.sub) stage.text(o.sub, at[0], at[1] + size * 0.75, {size: Math.round(size * 0.72), color: o.subColor || th.muted || '#8AA0A6', align});
  });
}
/** Scale bar: a ruler of `px` pixels labelled with the physical length it stands for. */
export function scaleBar(stage, x, y, px, label, o = {}) {
  const {ctx} = stage, col = o.color || stage.theme?.muted || '#8AA0A6';
  line(ctx, [[x, y], [x + px, y]], col, 2.5);
  line(ctx, [[x, y - 9], [x, y + 9]], col, 2.5); line(ctx, [[x + px, y - 9], [x + px, y + 9]], col, 2.5);
  stage.text(label, x + px / 2, y - 24, {size: o.size || 24, color: col, align: 'center', weight: 500});
}

// ---------- 3D ----------
/**
 * Simple perspective projection (ported from samples/quartz). Rotates about the vertical axis by `angle`,
 * tilts by `tilt`, then applies perspective with camera `distance` (in model units).
 * Returns [x, y, depth, scale]; larger depth = nearer the viewer (draw later).
 */
export function project(v, {angle = 0.6, tilt = 0.16, scale = 180, cx = 540, cy = 1020, distance = 10} = {}) {
  const [x, y, z] = v;
  const xx = x * Math.cos(angle) + z * Math.sin(angle), zz = -x * Math.sin(angle) + z * Math.cos(angle);
  const yy = y * Math.cos(tilt) - zz * Math.sin(tilt), depth = y * Math.sin(tilt) + zz * Math.cos(tilt);
  const p = distance / Math.max(1e-3, distance - depth);
  return [cx + xx * scale * p, cy - yy * scale * p, depth, p];
}
/** A reusable camera: const cam = camera({angle, tilt, scale, cx, cy}); cam.project([x,y,z]) */
export function camera(opts = {}) { const o = {...opts}; return {opts: o, project: v => project(v, o), with: more => camera({...o, ...more})}; }
/** Face shading helper: brightness (0..1) of a face whose normal is n against light dir l. */
export function lambert(n, l = [-0.4, 0.7, 0.6]) {
  const ln = Math.hypot(...l), nn = Math.hypot(...n) || 1;
  return clamp((n[0] * l[0] + n[1] * l[1] + n[2] * l[2]) / (ln * nn) * 0.5 + 0.5);
}

/** Depth-sorted draw queue: q.push(z, fn) … q.flush() draws ascending z (far → near). */
export class DrawQueue {
  constructor() { this.items = []; }
  push(z, fn) { this.items.push({z, fn, i: this.items.length}); return this; }
  flush() { this.items.sort((a, b) => a.z - b.z || a.i - b.i).forEach(o => o.fn()); this.items = []; return this; }
}

// ---------- binding ----------
const CTX_FNS = {circle, ring, arc, line, poly, rect, glow, sphere, contactShadow, arrow, withAlpha, clipEllipse, clipRect};
/** Returns {circle(x,y,r,fill), line(pts,col,w), …} bound to ctx, plus pure helpers. */
export function bind(ctx) {
  const out = {};
  for (const [k, f] of Object.entries(CTX_FNS)) out[k] = (...a) => f(ctx, ...a);
  return Object.assign(out, {rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, bump, rand, rng, project, camera, curve, lambert, DrawQueue});
}
