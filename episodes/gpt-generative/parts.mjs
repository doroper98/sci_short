// 43 GPT는 대답을 어떻게 쓸까 — the stage (PLAN §5) and the writing engine shared by all scene modules.
// One stage: chip line (world) at the top, the machine in the middle, the instrument (bars or the draw strip) below.
// A "run" is a list of steps (from model.mjs) with their times; drawRun() draws the whole causal chain of a step:
// read (sweep, cool) → pulse into the inlet (cool glow) → busy → strip re-divides (warm) → marker falls → picked segment
// flashes (warm glow) → the piece flies from the strip round the machine's right side to the line end (0.35 s) → pop.
import * as K from './kit.mjs';
import {segsOf, END, REST} from './model.mjs';
import {backOut, spring, drop, squash, camPt, streak, ringPop} from './motion.mjs';
export {backOut, spring, drop, squash, camPt, streak, ringPop};

// Sizes follow PLAN §1.2 (window filled at z = 1): chips 52 px (long answer lines), chat 40 px, machine 360×260,
// strip 64 px high with 34 px text, bars 46 px rows / 34 px text / 62 px pitch.
export const CH = {x0: 70, x1: 1010, y0: 300, size: 52};                      // chip line (52 px → 94 px per line)
export const CH40 = {x0: 70, x1: 1010, y0: 300, size: 40, lineGap: 34};        // chat scene (40 px)
export const MACH = {x: 360, y: 640, w: 360, h: 260};
export const INLET = [540, 640], OUTLET = [540, 900];
export const STRIP_Y = 1120, STRIP_H = 64, SX0 = 94, SX1 = 986, BARS_Y0 = 1000, BAR_P = 62, BAR_H = 46;
export const PANEL = {x: 70, y: 1036, w: 940, h: 236};
export const POSTER = {q: ['대답을 어떻게', '써 내려갈까?'], a: 'GPT', n: '1 of 4', y: 545, y2: 802, AS: 180, QM: 96};   // 2026-11-13: 흰 물음 + 큰 주제어
export const BIG = {x: 70, y: 805, size: 100, align: 'left'};                 // big number: left of the machine, above the instrument
export const WIN = {x0: 0, x1: 1080, y0: 276, y1: 1360};                       // world window (below the header title, above captions)
export const WAIT = [225, 1022];

// ---------------------------------------------------------------------------------------------
// framing (PLAN §1.2): camera targets from bounding boxes; nothing with text is ever partly visible
// ---------------------------------------------------------------------------------------------
/** union box of rects [{x, y, w, h}] */
export function bbox(boxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}
/** camera {cx, cy, z} that shows all boxes inside the window with pad (z ≤ zMax). o.zMin, o.z (fixed z) */
export function frameBoxes(boxes, {pad = 40, zMax = 1.6, zMin = 0.05, z: zFix} = {}) {
  const b = bbox(boxes), ww = WIN.x1 - WIN.x0 - 2 * pad, wh = WIN.y1 - WIN.y0 - 2 * pad;
  const z = zFix ?? K.clamp(Math.min(zMax, ww / b.w, wh / b.h), zMin, zMax);
  const wcx = (WIN.x0 + WIN.x1) / 2, wcy = (WIN.y0 + WIN.y1) / 2;
  return {cx: b.x + b.w / 2 - (wcx - 540) / z, cy: b.y + b.h / 2 - (wcy - 800) / z, z};
}
/** alpha for a text-bearing rect under cam: 1 when fully inside the window, 0 before any edge is crossed (fades in the
 *  last `soft` px). World coordinates in, screen test. */
export function edgeA(cam, r, soft = 18) {
  if (!cam) return 1;
  const [x0, y0] = camPt(cam, r.x, r.y), [x1, y1] = camPt(cam, r.x + r.w, r.y + r.h);
  const m = Math.min(x0 - WIN.x0, WIN.x1 - x1, y0 - WIN.y0, WIN.y1 - y1);
  return K.clamp(m / soft);
}
/** screen point inside the world window */
export const inWin = (x, y) => x >= WIN.x0 && x <= WIN.x1 && y >= WIN.y0 && y <= WIN.y1;
export const machRect = (m = MACH) => ({x: m.x, y: m.y, w: m.w, h: m.h});
export const STRIP_RECT = {x: PANEL.x, y: STRIP_Y - 40, w: PANEL.w, h: PANEL.y + PANEL.h - STRIP_Y + 40};
export const barsRect = (n = 5, y0 = BARS_Y0) => ({x: SX0, y: y0, w: SX1 - SX0, h: (n - 1) * BAR_P + BAR_H});

// ---------------------------------------------------------------------------------------------
// layout (cached), paths
// ---------------------------------------------------------------------------------------------
const LC = new Map();
export function lay(pieces, o = CH) {
  const key = JSON.stringify([pieces, o]); let v = LC.get(key);
  if (!v) { v = K.layoutChips(pieces, o); LC.set(key, v); }
  return v;
}
/** chip kind for a piece text in an answer */
export const madeKind = s => (s === END ? 'end' : 'made');
export const centre = b => [b.x + b.w / 2, b.y + b.h / 2];
/** Catmull-Rom polyline through pts */
export function spline(pts, n = 14) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 1; k <= n; k++) {
      const s = k / n, s2 = s * s, s3 = s2 * s;
      out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * s + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * s2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * s3)));
    }
  }
  return out;
}
/** point at arc-length fraction q of a polyline */
export function along(pts, q) {
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  let r = K.clamp(q) * L;
  for (let i = 1; i < pts.length; i++) { if (r <= seg[i - 1] || i === pts.length - 1) { const k = K.clamp(r / Math.max(seg[i - 1], 1e-9)); return [K.lerp(pts[i - 1][0], pts[i][0], k), K.lerp(pts[i - 1][1], pts[i][1], k)]; } r -= seg[i - 1]; }
  return pts[pts.length - 1];
}
/** flight path of a drawn piece: from the strip (or the outlet / the waiting spot) round the machine's right side */
export function flyPath(from, to, kind = 'strip') {
  if (kind === 'outlet') return spline([from, [660, 950], [860, 860], [870, 620], to]);
  if (kind === 'down') return spline([from, [from[0], from[1] + 40], to]);
  return spline([from, [870, Math.min(from[1] - 70, 1010)], [870, 620], to]);
}

// ---------------------------------------------------------------------------------------------
// matte helpers not in the kit
// ---------------------------------------------------------------------------------------------
/** matte rounded tile (same 2-tone + top highlight as the kit's faces) */
export function slab(c, x, y, w, h, r, top, bot, edge = null) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bot);
  c.beginPath(); c.roundRect(x, y, Math.max(w, 0.1), h, Math.min(r, w / 2, h / 2)); c.fillStyle = g; c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); }
  if (w > 2 * r) { K.line(c, [[x + r, y + 1.5], [x + w - r, y + 1.5]], K.rgba('#FFFFFF', 0.16), 1); K.line(c, [[x + r, y + h - 1.5], [x + w - r, y + h - 1.5]], K.rgba('#000000', 0.45), 2); }
}
/** falling marker above the strip (tip at y = STRIP_Y − 6 when q = 1) */
export function fallingMarker(stage, u, q, a = 1, o = {}) {
  if (a <= 0 || q <= 0) return;
  const c = stage.ctx, x = SX0 + K.clamp(u) * (SX1 - SX0), tip = STRIP_Y - 6 - (o.h ?? 90) * (1 - drop(q));
  if (q < 0.72) streak(stage, [x, tip - 24 - (o.h ?? 90) * 0.6], [x, tip - 24], 1, {len: 1, w: 5, a: 0.35 * a});
  K.withAlpha(c, a * K.smooth(q / 0.15), () => { c.beginPath(); c.moveTo(x - 15, tip - 28); c.lineTo(x + 15, tip - 28); c.lineTo(x, tip); c.closePath(); c.fillStyle = K.PAL.warm; c.fill(); });
}
/** faint old dividers (afterimage of the previous division of the strip) */
export function ghostDividers(stage, d, a) {
  if (!d || a <= 0) return;
  const c = stage.ctx; let acc = 0;
  K.withAlpha(c, a, () => d.slice(0, -1).forEach(r => { acc += r.p; const x = SX0 + acc * (SX1 - SX0); K.line(c, [[x, STRIP_Y - 10], [x, STRIP_Y + STRIP_H + 10]], K.rgba(K.PAL.hot, 0.8), 1.5, {dash: [4, 4]}); }));
}
/** x centre of segment i of distribution d on the strip */
export function segX(d, i) { let a = 0; for (let k = 0; k < i; k++) a += d[k].p; return SX0 + (a + d[i].p / 2) * (SX1 - SX0); }
export const uX = u => SX0 + K.clamp(u) * (SX1 - SX0);
/** big number at the stage's place (left of the machine) */
export function big(stage, val, unit, t, t0, a = 1, o = {}) { K.bigNum(stage, val, unit, t, t0, a, {...BIG, ...o}); }
/** bars rows for a distribution */
export const barRows = (d, o = {}) => d.map((r, i) => ({label: r.piece === END ? '■' : r.piece, p: r.p, kind: r.piece === REST ? 'rest' : 'cand', ...(o[i] || {})}));


// ---------------------------------------------------------------------------------------------
// local instrument variants (PLAN §1.2 sizes; the kit's strip / probBars draw 30 px text and fixed panel rows)
// ---------------------------------------------------------------------------------------------
const FM = {made: ['#5C3B12', '#472D0C']};
/** instrument panel behind the strip */
export function panel2(stage, a = 1) { if (a > 0) K.withAlpha(stage.ctx, a, () => K.rect(stage.ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 10, K.rgba('#03141C', 0.78), K.PAL.panelEdge, 1.4)); }
/** draw strip, kit.strip with h 64 and 34 px text. segs [{label, p, hi}], u → landed marker + hi. → {xs, pick} */
export function strip2(stage, segs, {y = STRIP_Y, h = STRIP_H, a = 1, u = null, uA = 1, x0 = SX0, x1 = SX1, ticks = true, cam = null} = {}) {
  const ea = r => (cam ? edgeA(cam, r) : 1);
  const c = stage.ctx, sum = segs.reduce((m, g) => m + g.p, 0), P = sum > 1 ? segs.map(g => g.p / sum) : segs.map(g => g.p);
  const pick = u == null ? -1 : K.stripPick(segs, u), xs = [x0];
  P.forEach(p => xs.push(xs[xs.length - 1] + p * (x1 - x0)));
  K.withAlpha(c, a, () => {
    slab(c, x0, y, x1 - x0, h, 9, '#141F25', '#0F181D', K.rgba(K.PAL.muted, 0.3));
    segs.forEach((g, i) => {
      const sx = xs[i], sw = xs[i + 1] - xs[i], hi = Math.max(K.clamp(g.hi || 0), i === pick ? 1 : 0); if (sw < 1) return;
      const top = hi > 0 ? K.mix(FM.made[0], '#B9782E', hi) : i % 2 ? '#4C3311' : FM.made[0], bot = hi > 0 ? K.mix(FM.made[1], '#9A6324', hi) : i % 2 ? '#3C280C' : FM.made[1];
      slab(c, sx + 1, y + 1, sw - 2, h - 2, 7, top, bot);
      if (hi > 0) { c.beginPath(); c.roundRect(sx, y, sw, h, 8); c.strokeStyle = K.rgba(K.PAL.hot, 0.95 * hi); c.lineWidth = 3; c.stroke(); }
    });
    const ux = u == null ? null : x0 + K.clamp(u) * (x1 - x0);
    if (ux != null && uA > 0) K.withAlpha(c, uA, () => K.line(c, [[ux, y - 6], [ux, y + h + 4]], K.PAL.warm, 2.5));
    segs.forEach((g, i) => {
      const sx = xs[i], sw = xs[i + 1] - xs[i], hi = Math.max(K.clamp(g.hi || 0), i === pick ? 1 : 0);
      const lw = g.label ? stage.measure(g.label, {size: 34, weight: 500}) : 0;
      if (g.label && lw + 8 < sw) stage.text(g.label, sx + sw / 2, y + h / 2, {size: 34, weight: 500, align: 'center', color: hi > 0 ? K.PAL.hot : K.PAL.ink, alpha: ea({x: sx + sw / 2 - lw / 2, y, w: lw, h})});
    });
    if (ticks) for (const f of [0, 0.5, 1]) { const tx = x0 + f * (x1 - x0); K.line(c, [[tx, y + h + 2], [tx, y + h + 11]], K.rgba(K.PAL.muted, 0.7), 1.4); const tw = 90, tx0 = f === 0 ? tx : f === 1 ? tx - tw : tx - tw / 2;
      stage.text(Math.round(f * 100) + '%', tx, y + h + 38, {size: 34, weight: 500, color: K.PAL.muted, align: f === 0 ? 'left' : f === 1 ? 'right' : 'center', alpha: ea({x: tx0, y: y + h + 18, w: tw, h: 40})}); }
    if (ux != null && uA > 0) K.withAlpha(c, uA, () => { c.beginPath(); c.moveTo(ux - 15, y - 34); c.lineTo(ux + 15, y - 34); c.lineTo(ux, y - 6); c.closePath(); c.fillStyle = K.PAL.warm; c.fill(); });
  });
  return {xs, pick};
}
const pct2 = p => (p < 0.01 ? '<1%' : Math.round(p * 100) + '%');
/** probability bars, kit.probBars with 46 px rows, 34 px text, 62 px pitch. rows [{label, p, kind, hi, ghostP, a}] */
export function bars2(stage, rows, {y0 = BARS_Y0, a = 1, x0 = SX0, x1 = SX1, cam = null} = {}) {
  const c = stage.ctx, lw = 200, bx0 = x0 + lw + 12, bx1 = x1 - 120, out = [];
  K.withAlpha(c, a, () => {
    const yb = y0 + (rows.length - 1) * BAR_P + BAR_H;
    for (const f of [0, 0.5, 1]) K.line(c, [[bx0 + f * (bx1 - bx0), y0 - 8], [bx0 + f * (bx1 - bx0), yb + 8]], K.rgba(K.PAL.muted, 0.14), 1, {dash: f ? [3, 6] : null});
    rows.forEach((r, i) => {
      const y = y0 + i * BAR_P, cy = y + BAR_H / 2, rest = r.kind === 'rest', hi = K.clamp(r.hi || 0), len = K.clamp(r.p) * (bx1 - bx0);
      const ea = cam ? edgeA(cam, {x: x0, y, w: x1 - x0, h: BAR_H}) : 1;
      K.withAlpha(c, (r.a ?? 1) * ea, () => {
        slab(c, x0, y, lw, BAR_H, 10, rest ? '#1C252A' : '#26343B', rest ? '#151D21' : '#1A252B', K.rgba(K.PAL.muted, 0.3));
        stage.text(r.label, x0 + lw / 2, cy, {size: 34, weight: 500, align: 'center', color: rest ? K.PAL.muted : K.PAL.ink, maxWidth: lw - 20});
        if (len > 0.5) slab(c, bx0, y + 4, len, BAR_H - 8, 7, rest ? '#56656B' : '#E9A24C', rest ? '#44525A' : '#C9863A');
        if (r.ghostP != null) { const gl = K.clamp(r.ghostP) * (bx1 - bx0); c.beginPath(); c.roundRect(bx0, y + 4, gl, BAR_H - 8, 7); c.strokeStyle = K.rgba(K.PAL.hot, 0.55); c.lineWidth = 1.5; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
        if (hi > 0) for (const [bx, bw, yy, hh] of [[x0, lw, y, BAR_H], [bx0, Math.max(len, 8), y + 4, BAR_H - 8]]) { c.beginPath(); c.roundRect(bx - 2, yy - 2, bw + 4, hh + 4, 10); c.strokeStyle = K.rgba(K.PAL.hot, 0.95 * hi); c.lineWidth = 3; c.stroke(); }
        stage.text(pct2(r.p), bx0 + Math.max(len, r.ghostP != null ? K.clamp(r.ghostP) * (bx1 - bx0) : 0) + 14, cy, {size: 34, weight: 700, color: rest ? K.PAL.muted : hi > 0 ? K.PAL.hot : K.PAL.warm});
      });
      out.push({y, cy, xEnd: bx0 + len, bx0, bx1});
    });
  });
  return {bx0, bx1, rows: out};
}
// ---------------------------------------------------------------------------------------------
// runs
// ---------------------------------------------------------------------------------------------
/**
 * makeRun({ctx, ctxKinds, steps, picks, from, layout, sweep, fly, switch0, over})
 *  ctx: pieces already on the line; steps: model steps (subset); picks: marker landing times (one per step).
 *  from: 'strip' (default) | 'outlet' | 'inplace' (pops in place at the pick time, no strip) | 'wait'.
 *  sweep(k) → true for steps whose gap shows the whole read chain (sweep → pulse → busy).
 *  over[k]: explicit {tSwitch, sweep: [a, b], pulse: [a, b], busy: [a, b], tDrop, tFly, tLand}.
 * Every time a step has is fixed here; drawing and sound read the same numbers.
 */
export function makeRun(o) {
  const {ctx, steps, picks} = o, n = steps.length, flyMax = o.fly ?? 0.35;
  const S = steps.map((s, k) => ({...s, k, tPick: picks[k], text: s.piece}));
  for (let k = 0; k < n; k++) {
    const s = S[k], ov = (o.over || {})[k] || {}, next = k + 1 < n ? picks[k + 1] - picks[k] : 1;
    const fly = Math.min(flyMax, 0.6 * next);
    s.tFly = ov.tFly ?? s.tPick + Math.min(0.05, fly * 0.2); s.tLand = ov.tLand ?? s.tFly + fly;
    const prevLand = k ? S[k - 1].tLand : (o.switch0 ?? s.tPick - 0.5) - 0.02, avail = s.tPick - prevLand;
    const sw = o.sweep ? o.sweep(k) : false;
    if (ov.tSwitch != null) s.tSwitch = ov.tSwitch;
    else if (sw) {
      s.sweep = [prevLand + 0.02, prevLand + 0.02 + avail * 0.38];
      s.pulse = [s.sweep[1], s.sweep[1] + avail * 0.14];
      s.busy = [s.pulse[1], s.pulse[1] + avail * 0.14];
      s.tSwitch = s.busy[1];
    } else s.tSwitch = k ? prevLand + 0.02 : (o.switch0 ?? s.tPick - 0.5);
    if (ov.sweep) s.sweep = ov.sweep; if (ov.pulse) s.pulse = ov.pulse; if (ov.busy) s.busy = ov.busy;
    if (!s.busy) s.busy = [Math.max(prevLand, s.tSwitch - 0.16), s.tSwitch];
    s.tDrop = ov.tDrop ?? Math.max(s.tSwitch + 0.03, s.tPick - 0.3);
  }
  const texts = [...ctx, ...S.map(s => s.text)];
  const kinds = [...(o.ctxKinds || ctx.map(() => 'given')), ...S.map(s => madeKind(s.text))];
  const R = {o, ctx, S, n, texts, kinds, from: o.from || 'strip', layout: o.layout || CH};
  R.boxes = lay(texts, R.layout);
  R.start = S.length ? Math.min(S[0].tSwitch, S[0].tDrop) : 0;
  R.end = S.length ? S[n - 1].tLand : 0;
  R.done = n ? S[n - 1].tLand : -Infinity;
  /** index of the step whose division the strip shows at t (−1 before the first) */
  R.cur = t => { let k = -1; for (let i = 0; i < n; i++) if (t >= S[i].tSwitch) k = i; return k; };
  /** number of step chips already on the line at t */
  R.landed = t => { let m = 0; for (let i = 0; i < n; i++) if (t >= (R.from === 'inplace' ? S[i].tPick : S[i].tLand)) m = i + 1; return m; };
  return R;
}

/** strip segments re-dividing: boundaries move from the old division to the new one with a spring (q 0 → 1) */
export function morphSegs(oldD, newD, q) {
  if (!oldD || q >= 1) return segsOf(newD);
  const cum = d => { const c = [0]; for (const r of d) c.push(c[c.length - 1] + r.p); return c; };
  const co = cum(oldD), cn = cum(newD), e = spring(q), out = [];
  let prev = 0;
  for (let i = 0; i < newD.length; i++) {
    const x = i === newD.length - 1 ? 1 : K.clamp(K.lerp(co[Math.min(i + 1, co.length - 1)], cn[i + 1], e), prev, 1);
    out.push({label: e > 0.6 ? (newD[i].piece === END ? '■' : newD[i].piece) : '', p: x - prev}); prev = x;
  }
  return out;
}
/** draw a chip with the contact squash (1.08 → 1 over 0.12 s at t0) */
export function chipAt(stage, b, t, t0, o) {
  const k = squash(t, t0, 0.12, 0.08), c = stage.ctx;
  if (k === 1) return K.chip(stage, b, o);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  c.save(); c.translate(cx, cy); c.scale(k, 1 / Math.sqrt(k)); c.translate(-cx, -cy); K.chip(stage, b, o); c.restore();
}

/**
 * draw one run at t, in world coordinates (call inside withCam). o: {a, chipA, stripA, machA, strip (bool), panel (bool),
 *  caret, G ({GW, GC}), cam (for Glow: world → screen), chipMod(i, box, t) → {dim, hi, a}, machine (bool), label,
 *  hideCtx, ghostOld (bool), mach, inlet, outlet}. → {boxes (visible), last (box), flying ([x, y] | null), k}
 */
export function drawRun(stage, t, R, o = {}) {
  const a = o.a ?? 1, S = R.S, nCtx = R.ctx.length, landed = R.landed(t), G = o.G, cam = o.cam || {cx: 540, cy: 800, z: 1};
  const sp = (x, y) => camPt(cam, x, y);
  const vis = R.boxes.slice(0, nCtx + landed);
  // chips (pop with the contact squash and a thin ring)
  vis.forEach((b, i) => {
    if (i < nCtx && o.hideCtx) return;
    const m = o.chipMod ? o.chipMod(i, b, t) || {} : {};
    const tl = i >= nCtx ? (R.from === 'inplace' ? S[i - nCtx].tPick : S[i - nCtx].tLand) : -Infinity;
    const al = a * (o.chipA ?? 1) * (m.a ?? 1) * edgeA(o.cam, b);
    if (R.from === 'inplace' && i >= nCtx) { const q = K.clamp((t - tl) / 0.25), c = stage.ctx, sc = 0.6 + 0.4 * backOut(q), [cx, cy] = centre(b);
      c.save(); c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy); K.chip(stage, b, {kind: R.kinds[i], a: al * K.clamp(q * 3), hi: m.hi || 0, dim: m.dim || 0}); c.restore(); }
    else chipAt(stage, b, t, tl, {kind: R.kinds[i], a: al, hi: m.hi || 0, dim: m.dim || 0});
    if (i >= nCtx && al > 0) ringPop(stage, b.x + b.w / 2, b.y + b.h / 2, t, tl, {r0: b.h * 0.4, r1: b.h * 0.95, a: 0.5 * al, color: K.PAL.hot});
  });
  const last = vis[vis.length - 1];
  if (o.caret !== false && last && t < R.done + 0.05 && a > 0) K.caret(stage, last, t, a * (o.chipA ?? 1) * edgeA(o.cam, last));
  // read sweep (cool, matte) over the line as it was when the step started reading
  const k = R.cur(t), sK = k >= 0 ? S[k] : null;
  for (const s of S) if (s.sweep && t >= s.sweep[0] && t < s.sweep[1] + 0.25) {
    const nb = R.boxes.slice(0, nCtx + s.k); K.sweep(stage, nb, (t - s.sweep[0]) / (s.sweep[1] - s.sweep[0]), {a: a * K.fadeOut(t, s.sweep[1], 0.25)});
  }
  // machine
  if (o.machine !== false) {
    let busy = 0;
    for (const s of S) { if (t >= s.busy[0] && t < s.busy[1]) busy = Math.max(busy, (t - s.busy[0]) / Math.max(0.05, s.busy[1] - s.busy[0])); else if (t >= s.busy[1] && t < s.busy[1] + 0.2) busy = Math.max(busy, 1 - (t - s.busy[1]) / 0.2); }
    K.machine(stage, o.mach || MACH, {a: a * (o.machA ?? 1) * edgeA(o.cam, o.mach || MACH), busy, label: o.label});
  }
  // strip
  if (o.strip !== false && R.from !== 'inplace' && sK) {
    const sa = a * (o.stripA ?? 1);
    if (o.panel !== false) panel2(stage, sa);
    const landedK = t >= sK.tPick, md = Math.max(0.06, Math.min(0.3, sK.tDrop - sK.tSwitch + 0.05));
    const prevD = k > 0 ? S[k - 1].dist : o.prevDist;
    const segs = prevD ? morphSegs(prevD, sK.dist, (t - sK.tSwitch) / md) : segsOf(sK.dist);
    strip2(stage, segs, {y: STRIP_Y, a: sa, u: landedK && sK.u != null ? sK.u : null, cam});
    if (o.ghostOld !== false && prevD) ghostDividers(stage, prevD, sa * 0.6 * K.fadeOut(t, sK.tSwitch + 0.15, 0.45));
    if (!o.noFall && !landedK && sK.u != null && t >= sK.tDrop) fallingMarker(stage, sK.u, (t - sK.tDrop) / Math.max(0.05, sK.tPick - sK.tDrop), sa);
    if (landedK && sK.u != null) {
      ringPop(stage, uX(sK.u), STRIP_Y - 6, t, sK.tPick, {a: 0.7 * sa});
      const fl = K.hitFlash(t, sK.tPick, 0.35);
      if (G && fl > 0) { const [x, y] = sp(segX(sK.dist, sK.pick), STRIP_Y + STRIP_H / 2); if (inWin(x, y)) K.splatBurst(G.GW, x, y, 28 * cam.z, 0.75 * fl * sa); }
    }
  }
  // read pulse: last chip → inlet (cool glow, screen coordinates)
  if (G) for (const s of S) if (s.pulse && t >= s.pulse[0] && t < s.pulse[1]) {
    const lb = R.boxes[nCtx + s.k - 1] || R.boxes[nCtx - 1]; if (!lb) continue;
    const inl = o.inlet || INLET;
    const p0 = sp(lb.x + lb.w / 2, lb.y + lb.h + 4), p1 = sp(inl[0], inl[1]); if (!inWin(...p0) && !inWin(...p1)) continue;
    K.beamPulse(G.GC, p0, p1, (t - s.pulse[0]) / (s.pulse[1] - s.pulse[0]), {amp: a});
  }
  // the flying piece (with a matte streak behind it)
  let flying = null;
  if (R.from !== 'inplace') for (const s of S) if (t >= s.tFly && t < s.tLand) {
    const b = R.boxes[nCtx + s.k], from = R.from === 'outlet' ? (o.outlet || OUTLET) : R.from === 'wait' ? (o.waitAt || WAIT) : [segX(s.dist, s.pick), STRIP_Y + STRIP_H / 2];
    const path = flyPath(from, centre(b), R.from === 'outlet' && o.outletKind ? o.outletKind : R.from);
    const q = K.easeInOut((t - s.tFly) / (s.tLand - s.tFly)), p = along(path, q), pb = along(path, Math.max(0, q - 0.22));
    streak(stage, pb, p, 1, {len: 1, w: b.h * 0.5, a: 0.3 * a});
    K.chip(stage, {...b, x: p[0] - b.w / 2, y: p[1] - b.h / 2}, {kind: madeKind(s.text), a});
    flying = p;
  }
  return {boxes: vis, last, flying, k};
}
/** busy of the machine outside a run (e.g. a held state) */
export const pulseQ = (t, w) => (w && t >= w[0] && t < w[1] ? (t - w[0]) / (w[1] - w[0]) : -1);
import {withCam} from './motion.mjs';
/** world layer for this episode: withCam, additionally clipped at y 272 so the world never runs under the header title */
export function world(stage, cam, draw) { const c = stage.ctx; c.save(); c.beginPath(); c.rect(0, 272, 1080, 1088); c.clip(); try { withCam(stage, cam, draw); } finally { c.restore(); } }
