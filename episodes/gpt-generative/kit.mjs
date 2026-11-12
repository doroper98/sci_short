// GPT 3부작 (43 G · 44 P · 45 T) — shared kit: palette, helpers, background, header and poster, signals, instrument strip,
// and the trilogy's matte parts (chips, machine, probability bars, draw strip, dials, meaning map). PLAN.md §1–2.
// 44/45 import from '../gpt-generative/kit.mjs'. Generic helpers are copied from episodes/submarine-detection/kit.mjs
// (2026-11-12) with the same names and arguments; the sea, camera, bodies and rays are left out.
//
// Grammar (docs/ANIMATION_QUALITY.md, 2026-11-10): parts are matte filled masses (top face a little lighter + a 1 px top
// highlight and a dark bottom edge); only signals glow. Cool = given text (question, training text, context words),
// warm = what GPT puts out or changes (probabilities, the drawn piece, corrected numbers, attention). Others are greys.
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, ring, rect, withAlpha, TAU, rand, rng, progressBar,
  registerFonts, fontString} from '../../pipeline/render/index.mjs';
import {Glow} from './glow.mjs';

export const W = 1080, H = 1920;
export const theme = {base: 'noturno', accent: '#FFB454'};
export const captionLayout = {};
export const PAL = {ink: '#F4EBDD', muted: '#93A8AE', warm: '#FFB454', hot: '#FFE2B0', cool: '#8CD9FF', coolHi: '#D6F4FF', line: '#3C7387',
  field: '#9FC3CF', panelEdge: '#24505F', rec: '#9FD8F0', sea: '#06303D'};
export const WARM = [1.0, 0.70, 0.30], COOL = [0.55, 0.85, 1.0];
export const PX0 = 70, PX1 = 1010, PY0 = 1128, PY1 = 1338;      // instrument strip
export {rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, ring, rect, withAlpha, TAU, rand, rng, progressBar};

// matte faces (greys and the two hues only)
const F = {plate: '#03141C', given: ['#1F3B48', '#152A34'], made: ['#5C3B12', '#472D0C'], neutral: ['#26343B', '#1A252B'],
  body: ['#33444C', '#222F35'], deep: '#0A151B', dark: '#020B10'};

// =====================================================================================================
// helpers
// =====================================================================================================
export const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
export const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
export const win = (t, a, b, d = 0.4) => fadeIn(t, a, d) * fadeOut(t, b, d);
export const EASE = {io: easeInOut, o: easeOut, i: easeIn, lin: q => clamp(q)};
/** keyed schedule [[t, v, ease], …] → f(t); ease ('io' | 'o' | 'i' | 'lin') shapes the segment ending at that key */
export function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [t1, v1, e] = K[i]; if (t < t1) { const [t0, v0] = K[i - 1]; return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / Math.max(1e-6, t1 - t0)); } }
    return K[K.length - 1][1];
  };
}
/** 1 at t0 falling linearly to 0 over d (0 before t0) — the "struck" flash */
export const hitFlash = (t, t0, d = 0.25) => { const a = t - t0; return a < 0 || a > d ? 0 : 1 - a / d; };
/** max of hitFlash over several hit times */
export const hitAny = (t, times, d = 0.25) => times.reduce((m, t0) => Math.max(m, hitFlash(t, t0, d)), 0);
// rng(seed) (mulberry32 → () => [0, 1)) is the pipeline's, re-exported above.
/** softmax / argmax — shared by model and scenes */
export function softmax(arr) { const m = Math.max(...arr), e = arr.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); }
export const argmax = arr => arr.reduce((k, v, i) => (v > arr[k] ? i : k), 0);

const WARNED = new Set();
/**
 * word anchor: start of `word` in sentence `sid` (searched in the spoken tts chars — GPT is '지피티'). If the word is
 * missing (script under review), warn once and return start + frac·(end − start) of that sentence instead of throwing.
 */
export function wd(tl, sid, word, frac = 0.5) {
  try { return tl.wordStart(sid, word); } catch (e) {
    const s = tl.sentence(sid), key = sid + '/' + word;
    if (!WARNED.has(key)) { WARNED.add(key); console.warn(`warning: word "${word}" not in ${sid}; using ${(frac * 100).toFixed(0)}% of the sentence`); }
    return s.start + frac * (s.end - s.start);
  }
}

/** short name tag (sar style): plate + text. size ≥ 24 (default 30). Returns text width. */
export function tag(stage, s, x, y, o = {}) {
  const size = Math.max(24, o.size || 30), weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba(F.plate, o.plateA ?? 0.8), o.border ? rgba(o.border, 0.85) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink, role: o.role});
  });
  return w;
}
/** leader line from a body point to a tag; then the tag */
export function tagLeader(stage, s, from, at, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  withAlpha(stage.ctx, a, () => line(stage.ctx, [from, at], rgba(o.lineCol || PAL.field, 0.6), 1.4));
  tag(stage, s, at[0], at[1], o);
}
/** big number (sar bigNum): value + unit, right aligned at x (default 940, baseline 356), pops in at t0 */
export function bigNum(stage, val, unit, t, t0, a = 1, o = {}) {
  const x = o.x ?? 940, y = o.y ?? 356;
  const al = a * smooth((t - t0 + 0.03) / 0.12); if (al <= 0) return;
  const c = stage.ctx, sc = o.pop === false ? 1 : 1 + 0.10 * (1 - easeOut((t - t0) / 0.3)), size = o.size || 120, align = o.align || 'right';
  c.save(); c.translate(x, y); c.scale(sc, sc);
  const sh = {shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16};
  if (align === 'right') {
    const wu = unit ? stage.text(unit, 0, size * 0.2, {role: 'display', weight: 700, size: 55 * size / 120, color: o.unitColor || PAL.warm, alpha: al, align: 'right', ...sh}) : 0;
    stage.text(val, -wu - (unit ? 12 : 0), 0, {role: 'display', weight: 700, size, color: o.color || PAL.ink, alpha: al, align: 'right', ...sh});
  } else {
    const wv = stage.text(val, 0, 0, {role: 'display', weight: 700, size, color: o.color || PAL.ink, alpha: al, align: 'left', ...sh});
    if (unit) stage.text(unit, wv + 12, size * 0.2, {role: 'display', weight: 700, size: 55 * size / 120, color: o.unitColor || PAL.warm, alpha: al, align: 'left', ...sh});
  }
  if (o.sub) stage.text(o.sub, 0, size * 0.62, {role: 'body', weight: 500, size: 30, color: PAL.muted, alpha: al, align, ...sh});
  c.restore();
}

// =====================================================================================================
// background: noturno, a little lighter at the top, darker edges. Still (no motion).
// =====================================================================================================
export function background(stage, t, ctx) {
  const c = stage.ctx;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#08232F'); g.addColorStop(0.42, '#03151E'); g.addColorStop(1, '#010A10');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(540, 820, 420, 540, 820, 1250);
  v.addColorStop(0, 'rgba(0,4,7,0)'); v.addColorStop(1, 'rgba(0,4,7,0.55)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// signals: two Glow buffers per frame. glowBegin() → splats / link() → glowFlush(stage) at the scene's end.
// =====================================================================================================
let GW = null, GC = null, LINKS = [];
/** start a frame's glow; → {GW (warm), GC (cool)} */
export function glowBegin() { GW ||= new Glow(); GC ||= new Glow(); GW.begin(); GC.begin(); LINKS = []; return {GW, GC}; }
/** draws the matte under-lines queued by link(), then both glow buffers */
export function glowFlush(stage, o = {}) {
  const c = stage.ctx;
  for (const L of LINKS) withAlpha(c, L.a, () => line(c, L.pts, rgba(L.col, 0.35 + 0.4 * L.w), 1 + 2 * L.w));
  LINKS = [];
  GW.flush(stage, {gain: 1.25, bloom: 0.38, ...o}); GC.flush(stage, {gain: 1.25, bloom: 0.38, ...o});
}
export const colOf = G => (G === GW ? WARM : COOL);
/** radar-style pulse at fraction q of from → to: three short arcs across the direction (±0.16 rad). o: {col, amp} */
export function beamPulse(G, from, to, q, o = {}) {
  if (q < 0 || q > 1) return;
  const col = o.col || colOf(G), amp = o.amp ?? 1, dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  for (const [lag, k] of [[0, 1], [11, 0.6], [22, 0.32]]) {
    const d = q * L - lag; if (d < 0) continue;
    for (let u = -0.16; u <= 0.1601; u += 0.04) G.splat(from[0] + d * Math.cos(ang + u), from[1] + d * Math.sin(ang + u), 5.5, col, amp * k * 0.6 * (1 - 2 * u * u / 0.0256 * 0.25));
  }
}
/** a short burst at a point (e.g. the piece just drawn) */
export function splatBurst(G, x, y, r, k, col) { G.splat(x, y, r, col || colOf(G), k); }

// =====================================================================================================
// instrument strip
// =====================================================================================================
export const REC_BASE = PY1 - 52;
export function panel(stage, a = 1) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => rect(stage.ctx, PX0, PY0, PX1 - PX0, PY1 - PY0, 8, rgba(F.plate, 0.78), PAL.panelEdge, 1.4));
}
/** panel name, top-left (PX0 + 16, PY0 + 26) unless x/y given; 30 px */
export function panelLabel(stage, text, a = 1, o = {}) {
  if (a <= 0 || !text) return;
  stage.text(text, o.x ?? PX0 + 16, o.y ?? PY0 + 26, {role: 'body', weight: 500, size: o.size || 30, color: o.color || PAL.muted, alpha: a, align: o.align || 'left'});
}
/** tick labels along the bottom (y = PY1 − 22, 30 px), 6 px tick marks above them. ticks: [{x, label}] */
export function axisTicks(stage, ticks, a = 1, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, y = o.y ?? PY1 - 22, base = o.base ?? REC_BASE;
  withAlpha(c, a, () => {
    if (o.axis !== false) line(c, [[o.x0 ?? 100, base], [o.x1 ?? 940, base]], rgba(PAL.field, 0.22), 1);
    for (const tk of ticks) { line(c, [[tk.x, base], [tk.x, base + 6]], rgba(PAL.muted, 0.7), 1.4); stage.text(tk.label, tk.x, y, {size: o.size || 30, weight: 500, color: PAL.muted, align: tk.align || 'center'}); }
  });
}
/** record line: pts [[x, y]] drawn as a 2 px line; the pen tip (last point) glows. o: {col, alpha, lw, G, pen (bool), dash} */
export function recordLine(stage, pts, o = {}) {
  if (pts.length < 2) return;
  const a = o.alpha ?? 0.85;
  line(stage.ctx, pts, rgba(o.col || PAL.rec, a), o.lw ?? 2, {dash: o.dash || null});
  if (o.G && o.pen !== false) { const p = pts[pts.length - 1]; o.G.splat(p[0], p[1], 6, o.gcol || colOf(o.G), 0.7); }
}
/** sample a record function y(x) from x0 to x1 (step px) → [[x, y]] */
export function sampleRec(fy, x0, x1, step = 3) { const p = []; for (let x = x0; x <= x1 + 1e-6; x += step) p.push([x, fy(x)]); if (p.length && p[p.length - 1][0] < x1) p.push([x1, fy(x1)]); return p; }
/** dotted tie from a world point down to the panel's top edge */
export function tieLine(stage, x, yFrom, a = 1, o = {}) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => line(stage.ctx, [[x, yFrom], [x, o.yTo ?? PY0]], rgba(o.col || PAL.line, 0.5), 1.2, {dash: [3, 8]}));
}
/** matte record line inside the panel (screen pts); head = small solid dot at the end. No glow. */
export function curve(stage, pts, o = {}) {
  if (pts.length < 2 || (o.a ?? 1) <= 0) return;
  const col = o.color || PAL.warm, w = o.width ?? 3;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    line(stage.ctx, pts, col, w);
    if (o.head !== false) { const p = pts[pts.length - 1]; circle(stage.ctx, p[0], p[1], w + 3, col); }
  });
}

// =====================================================================================================
// header, poster, caption band (sar style)
// =====================================================================================================
export function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 880, ...so}));
}
/** header from a title list [[t, kicker, title], …] (first t = −Infinity), cross-fading at each switch; a = scene alpha */
export function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
}
const PSIZE = new WeakMap();
/**
 * poster title. POSTER = {q: string | [line1, line2], a, y (centre of the first question line), y2 (answer centre)}.
 * q = 0 poster (big white question + big warm answer on a dark plate), q = 1 header title (one line at 228, 56 px):
 * the question lines slide onto one line, the answer shrinks toward 292 and fades.
 */
export function posterTitle(stage, POSTER, q, a = 1) {
  const c = stage.ctx, Q = [].concat(POSTER.q), fnt = s => ({role: 'display', weight: 700, size: s, tracking: -0.03 * s});
  const fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, fnt(max)));
  let S = PSIZE.get(POSTER);
  if (!S) { S = {QS: Math.min(...Q.map(s => fit(s, 880, 104))), AS: fit(POSTER.a, 860, 150)}; PSIZE.set(POSTER, S); }
  const {QS, AS} = S, LH = QS * 1.14, tr = lerp(-0.03, -0.011, q), s1 = lerp(QS, 56, q);
  // header layout: the lines side by side, one space apart, centred at 540
  const wf = Q.map(s => stage.measure(s, {role: 'display', weight: 700, size: 56, tracking: -0.011 * 56})), sp = 56 * 0.28;
  let xh = 540 - (wf.reduce((x, y) => x + y, 0) + sp * (Q.length - 1)) / 2;
  const hx = wf.map(w => { const x = xh + w / 2; xh += w + sp; return x; });
  const yTop = POSTER.y - QS * 0.75, yBot = POSTER.y2 + AS * 0.7;
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, yTop - 60, 0, yBot + 60); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.25, 'rgba(0,10,16,0.55)'); g.addColorStop(0.75, 'rgba(0,10,16,0.55)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, yTop - 60, W, yBot - yTop + 120); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    // lines part sideways first (offsets scale with the current size), then close up vertically: they never overlap
    const qx = smooth(q / 0.45), qy = smooth((q - 0.4) / 0.6), yc = lerp(POSTER.y + (Q.length - 1) * LH / 2, 228, q), k = s1 / 56;
    Q.forEach((s, i) => stage.text(s, 540 + (hx[i] - 540) * k * qx, yc + (i - (Q.length - 1) / 2) * LH * (s1 / QS) * (1 - qy), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1}));
    withAlpha(c, 1 - q, () => stage.text(POSTER.a, 540, lerp(POSTER.y2, 292, q), {role: 'display', weight: 700, size: lerp(AS, 34, q), color: PAL.warm, align: 'center', tracking: tr * AS, shadow: sh, shadowBlur: 28}));
  });
}
export function captionBand(c) { const g = c.createLinearGradient(0, 1376, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0.6)'); c.fillStyle = g; c.fillRect(0, 1376, W, 544); }

// =====================================================================================================
// chips (pieces of text). Box = {i, text, x, y (top-left), w, h, line}; font size = h / 1.5.
// =====================================================================================================
const HERE = path.dirname(fileURLToPath(import.meta.url));
let MC = null;
const measureBody = (s, size) => {
  if (!MC) { registerFonts(); const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas'); MC = createCanvas(8, 8).getContext('2d'); }
  MC.font = fontString('body', size, 500); if ('letterSpacing' in MC) MC.letterSpacing = '0px';
  return MC.measureText(String(s)).width;
};
/** pieces → boxes, left-aligned with line wrap. Greedy, so adding pieces never moves the earlier ones. */
export function layoutChips(pieces, {x0, x1, y0, size = 44, padX = 18, gap = 10, lineGap = 16}) {
  const h = Math.round(size * 1.5); let x = x0, ln = 0;
  return pieces.map((text, i) => {
    const w = Math.max(h, Math.ceil(measureBody(text, size)) + 2 * padX);
    if (x > x0 && x + w > x1) { x = x0; ln++; }
    const b = {i, text, x, y: y0 + ln * (h + lineGap), w, h, line: ln}; x += w + gap; return b;
  });
}
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
/** matte tile: face a little lighter at the top, 1 px top highlight, dark bottom edge */
function face(c, x, y, w, h, r, [top, bot], o = {}) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bot);
  rr(c, x, y, w, h, r); c.fillStyle = g; c.fill();
  if (o.edge) { c.strokeStyle = o.edge; c.lineWidth = o.edgeW ?? 1.5; c.stroke(); }
  line(c, [[x + r, y + 1.5], [x + w - r, y + 1.5]], rgba('#FFFFFF', 0.16), 1);
  line(c, [[x + r, y + h - 1.5], [x + w - r, y + h - 1.5]], rgba('#000000', 0.45), 2);
}
/** one chip. kind: 'given' | 'made' | 'ghost' | 'end' | 'cover'. pop 0→1 = appear (0.92→1×), hi = 2 px bright edge, dim → 0.35 */
export function chip(stage, box, {kind = 'given', a = 1, pop = 1, hi = 0, dim = 0} = {}) {
  const al = a * clamp(pop * 1.6); if (al <= 0) return;
  const c = stage.ctx, {x, y, w, h} = box, size = h / 1.5, r = 12, sc = lerp(0.92, 1, easeOut(pop)), cx = x + w / 2, cy = y + h / 2;
  withAlpha(c, al, () => {
    c.save(); c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy);
    const T = {size, weight: 500, align: 'center'};
    if (kind === 'given') { face(c, x, y, w, h, r, F.given, {edge: rgba(PAL.cool, 0.55)}); stage.text(box.text, cx, cy, {...T, color: PAL.ink}); }
    else if (kind === 'made' || kind === 'end') {
      face(c, x, y, w, h, r, F.made, {edge: rgba(PAL.warm, 0.35)});
      if (kind === 'made') stage.text(box.text, cx, cy, {...T, color: mix(PAL.warm, PAL.hot, 0.35)});
      else { const s = size * 0.42; c.fillStyle = mix(PAL.warm, PAL.hot, 0.35); c.fillRect(cx - s / 2, cy - s / 2, s, s); }
    } else if (kind === 'ghost') { rr(c, x, y, w, h, r); c.strokeStyle = rgba(PAL.muted, 0.5); c.lineWidth = 1.5; c.stroke(); stage.text(box.text, cx, cy, {...T, color: PAL.muted, alpha: 0.55}); }
    else if (kind === 'cover') {
      face(c, x, y, w, h, r, ['#16242B', '#101C22'], {edge: rgba(PAL.muted, 0.35)});
      c.save(); rr(c, x, y, w, h, r); c.clip(); c.strokeStyle = rgba(PAL.muted, 0.22); c.lineWidth = 2;
      for (let u = x - h; u < x + w; u += 14) { c.beginPath(); c.moveTo(u, y + h); c.lineTo(u + h, y); c.stroke(); }
      c.restore();
    }
    if (hi > 0) { rr(c, x - 1, y - 1, w + 2, h + 2, r + 1); c.strokeStyle = rgba(kind === 'given' ? PAL.coolHi : PAL.hot, 0.95 * clamp(hi)); c.lineWidth = 2.5; c.stroke(); }
    if (dim > 0) { rr(c, x - 1, y - 1, w + 2, h + 2, r); c.fillStyle = rgba(F.dark, 0.65 * clamp(dim)); c.fill(); }
    c.restore();
  });
}
/** text caret right of the box (blinks with a 0.5 s period) */
export function caret(stage, box, t, a = 1) {
  if (a <= 0 || ((t % 0.5) + 0.5) % 0.5 >= 0.25) return;
  withAlpha(stage.ctx, a, () => { stage.ctx.fillStyle = PAL.warm; stage.ctx.fillRect(box.x + box.w + 8, box.y + box.h * 0.15, 4, box.h * 0.7); });
}
/** "read again from the start": q 0→1 underlines chip after chip (cool, matte), passed ones fade to 0.3, the read head gets a bright edge */
export function sweep(stage, boxes, q, {a = 1} = {}) {
  if (a <= 0 || !boxes.length) return;
  const c = stage.ctx, f = clamp(q) * boxes.length, k = Math.floor(f);
  withAlpha(c, a, () => boxes.forEach((b, i) => {
    if (i === k && q < 1) { rr(c, b.x - 1, b.y - 1, b.w + 2, b.h + 2, 13); c.strokeStyle = rgba(PAL.coolHi, 0.95); c.lineWidth = 2.5; c.stroke(); }
    const u = clamp(f - i); if (u <= 0) return;
    const al = 1 - 0.7 * clamp(f - i - 1);
    line(c, [[b.x + 4, b.y + b.h + 6], [b.x + 4 + (b.w - 8) * u, b.y + b.h + 6]], rgba(PAL.cool, 0.9 * al), 3, {cap: 'butt'});
  }));
}

// =====================================================================================================
// machine (rect top-left), probability bars, draw strip
// =====================================================================================================
/** matte machine body. busy 0..1 lights the three front lines in turn. → {inlet, outlet, center} */
export function machine(stage, {x, y, w, h}, {a = 1, busy = 0, label = 'GPT'} = {}) {
  const c = stage.ctx, cx = x + w / 2, top = Math.min(h * 0.2, 60);
  withAlpha(c, a, () => {
    rr(c, x, y, w, h, 28); c.fillStyle = F.body[1]; c.fill();
    c.save(); rr(c, x, y, w, h, 28); c.clip(); c.fillStyle = F.body[0]; c.fillRect(x, y, w, top);
    line(c, [[x, y + top], [x + w, y + top]], rgba('#000000', 0.35), 2); c.restore();
    line(c, [[x + 28, y + 1.5], [x + w - 28, y + 1.5]], rgba('#FFFFFF', 0.18), 1.2);
    rr(c, x, y, w, h, 28); c.strokeStyle = rgba(PAL.muted, 0.28); c.lineWidth = 1.5; c.stroke();
    const sw = Math.min(w * 0.38, 220);                             // inlet / outlet slots
    rr(c, cx - sw / 2, y + top * 0.32, sw, Math.max(10, top * 0.36), 7); c.fillStyle = F.deep; c.fill();
    rr(c, cx - sw / 2, y + h - top * 0.68, sw, Math.max(10, top * 0.36), 7); c.fillStyle = F.deep; c.fill();
    const fy0 = y + top + 22, fh = h - top - top * 0.9 - 34;             // front plate
    rr(c, x + 26, fy0, w - 52, fh, 16); c.fillStyle = rgba('#0E1A20', 0.85); c.fill();
    const ls = Math.min(fh * 0.34, 72);
    stage.text(label, cx, fy0 + fh * 0.36, {role: 'display', weight: 700, size: ls, color: PAL.ink, align: 'center'});
    for (let i = 0; i < 3; i++) {
      const lv = clamp(busy * 3 - i), ly = fy0 + fh * (0.66 + 0.11 * i);
      line(c, [[cx - w * 0.26, ly], [cx + w * 0.26, ly]], lv > 0 ? mix('#2E3E46', PAL.warm, lv) : '#2E3E46', 4, {cap: 'round'});
    }
  });
  return {inlet: [cx, y], outlet: [cx, y + h], center: [cx, y + h / 2]};
}
const pct = p => (p < 0.01 ? '<1%' : Math.round(p * 100) + '%');
/**
 * probability bars. rows: [{label, p, kind = 'cand' | 'rest', hi, ghostP, a}]. y0 = top of row 0; each row is a rowH-high
 * label plate + bar, rows rowH + 14 apart. Bar from bx0 = x0 + 200, length p / unit × (x1 − 110 − bx0). Text 30 px.
 * → {bx0, bx1, rows: [{y, cy, xEnd}]}
 */
export function probBars(stage, rows, {x0 = PX0 + 24, x1 = PX1 - 24, y0, rowH = 38, a = 1, unit = 1} = {}) {
  const c = stage.ctx, bx0 = x0 + 200, bx1 = x1 - 110, pitch = rowH + 14, out = [];
  withAlpha(c, a, () => {
    const yb = y0 + rows.length * pitch - 14;
    for (const f of [0, 0.5, 1]) line(c, [[bx0 + f * (bx1 - bx0), y0 - 8], [bx0 + f * (bx1 - bx0), yb + 8]], rgba(PAL.muted, 0.14), 1, {dash: f ? [3, 6] : null});
    rows.forEach((r, i) => {
      const y = y0 + i * pitch, cy = y + rowH / 2, rest = r.kind === 'rest', hi = clamp(r.hi || 0), len = clamp(r.p / unit) * (bx1 - bx0);
      withAlpha(c, r.a ?? 1, () => {
        face(c, x0, y, 190, rowH, 9, rest ? ['#1C252A', '#151D21'] : F.neutral, {edge: rgba(PAL.muted, 0.3)});
        stage.text(r.label, x0 + 95, cy, {size: 30, weight: 500, align: 'center', color: rest ? PAL.muted : PAL.ink, maxWidth: 170});
        if (len > 0.5) face(c, bx0, y + 3, len, rowH - 6, 6, rest ? ['#56656B', '#44525A'] : ['#E9A24C', '#C9863A']);
        if (r.ghostP != null) { const gl = clamp(r.ghostP / unit) * (bx1 - bx0); rr(c, bx0, y + 3, gl, rowH - 6, 6); c.strokeStyle = rgba(PAL.hot, 0.55); c.lineWidth = 1.5; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
        if (hi > 0) for (const [bx, bw] of [[x0, 190], [bx0, Math.max(len, 8)]]) { rr(c, bx - 2, y - 2 + (bx === x0 ? 0 : 3), bw + 4, rowH + 4 - (bx === x0 ? 0 : 6), 10); c.strokeStyle = rgba(PAL.hot, 0.95 * hi); c.lineWidth = 2.5; c.stroke(); }
        stage.text(pct(r.p), bx0 + Math.max(len, r.ghostP != null ? clamp(r.ghostP / unit) * (bx1 - bx0) : 0) + 12, cy, {size: 30, weight: 700, color: rest ? PAL.muted : hi > 0 ? PAL.hot : PAL.warm});
      });
      out.push({y, cy, xEnd: bx0 + len});
    });
  });
  return {bx0, bx1, rows: out};
}
const segNorm = segs => { const s = segs.reduce((m, g) => m + g.p, 0); return s > 1 ? segs.map(g => g.p / s) : segs.map(g => g.p); };
/** index of the segment u (0..1) falls in (cumulative probability); −1 if u is past the last segment */
export function stripPick(segs, u) { const P = segNorm(segs); let acc = 0; for (let i = 0; i < P.length; i++) { acc += P[i]; if (u < acc) return i; } return -1; }
/** draw strip: 0–100 % band cut by probability (y = top). u → warm marker from above; its segment is hi. → {xs, pick} */
export function strip(stage, segs, {x0 = PX0 + 24, x1 = PX1 - 24, y, h = 46, a = 1, u = null, uA = 1} = {}) {
  const c = stage.ctx, P = segNorm(segs), pick = u == null ? -1 : stripPick(segs, u), xs = [x0];
  P.forEach(p => xs.push(xs[xs.length - 1] + p * (x1 - x0)));
  withAlpha(c, a, () => {
    face(c, x0, y, x1 - x0, h, 8, ['#141F25', '#0F181D'], {edge: rgba(PAL.muted, 0.3)});
    segs.forEach((g, i) => {
      const sx = xs[i], sw = xs[i + 1] - xs[i], hi = Math.max(clamp(g.hi || 0), i === pick ? 1 : 0); if (sw < 1) return;
      face(c, sx + 1, y + 1, sw - 2, h - 2, 6, hi > 0 ? [mix(F.made[0], '#B9782E', hi), mix(F.made[1], '#9A6324', hi)] : i % 2 ? ['#4C3311', '#3C280C'] : F.made);
      if (hi > 0) { rr(c, sx, y, sw, h, 7); c.strokeStyle = rgba(PAL.hot, 0.95 * hi); c.lineWidth = 2.5; c.stroke(); }
    });
    const ux = u == null ? null : x0 + clamp(u) * (x1 - x0);
    if (ux != null && uA > 0) withAlpha(c, uA, () => line(c, [[ux, y - 6], [ux, y + h + 4]], PAL.warm, 2));   // under the names
    segs.forEach((g, i) => {
      const sx = xs[i], sw = xs[i + 1] - xs[i], hi = Math.max(clamp(g.hi || 0), i === pick ? 1 : 0);
      if (g.label && stage.measure(g.label, {size: 30, weight: 500}) + 16 < sw) stage.text(g.label, sx + sw / 2, y + h / 2, {size: 30, weight: 500, align: 'center', color: hi > 0 ? PAL.hot : PAL.ink});
    });
    for (const f of [0, 0.5, 1]) { const tx = x0 + f * (x1 - x0); line(c, [[tx, y + h + 2], [tx, y + h + 10]], rgba(PAL.muted, 0.7), 1.4); stage.text(Math.round(f * 100) + '%', tx, y + h + 32, {size: 30, weight: 500, color: PAL.muted, align: f === 0 ? 'left' : f === 1 ? 'right' : 'center'}); }
    if (ux != null && uA > 0) withAlpha(c, uA, () => {
      c.beginPath(); c.moveTo(ux - 13, y - 30); c.lineTo(ux + 13, y - 30); c.lineTo(ux, y - 6); c.closePath(); c.fillStyle = PAL.warm; c.fill();
    });
  });
  return {xs, pick};
}

// =====================================================================================================
// dials (a number = a matte dial)
// =====================================================================================================
/** needle angle = v / vmax × 135° from straight up, stops at ±135°. ghostV = old needle (thin, faint). hi → warm. */
export function dial(stage, x, y, r, v, {a = 1, ghostV = null, hi = 0, vmax = 3} = {}) {
  const c = stage.ctx, ang = q => -Math.PI / 2 + clamp(q / vmax, -1, 1) * 0.75 * Math.PI, hv = clamp(+hi || 0);
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, '#24343C'); g.addColorStop(1, '#131D23');
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
    ring(c, x, y, r, hv > 0 ? mix('#4F6670', PAL.warm, hv) : rgba(PAL.field, 0.4), 1.5 + hv);
    for (const s of [-1, 0, 1]) { const t = -Math.PI / 2 + s * 0.75 * Math.PI; line(c, [[x + 0.8 * r * Math.cos(t), y + 0.8 * r * Math.sin(t)], [x + 0.95 * r * Math.cos(t), y + 0.95 * r * Math.sin(t)]], rgba(PAL.muted, 0.6), 1.2); }
    if (ghostV != null) { const t = ang(ghostV); line(c, [[x, y], [x + 0.78 * r * Math.cos(t), y + 0.78 * r * Math.sin(t)]], rgba(PAL.muted, 0.5), Math.max(1, r * 0.04)); }
    const t = ang(v), nc = hv > 0 ? mix('#C9D3D6', PAL.warm, hv) : '#C9D3D6';
    line(c, [[x, y], [x + 0.78 * r * Math.cos(t), y + 0.78 * r * Math.sin(t)]], nc, Math.max(2, r * 0.09));
    circle(c, x, y, Math.max(2.5, r * 0.13), nc);
  });
}
/** dial grid; (x0, y0) = centre of the first dial. ghost / hi: arrays parallel to vals (or null). → centres */
export function dialGrid(stage, vals, {x0, y0, cols, dx, dy, r, ghost = null, hi = null, a = 1, vmax} = {}) {
  return vals.map((v, i) => {
    const x = x0 + (i % cols) * dx, y = y0 + Math.floor(i / cols) * dy;
    dial(stage, x, y, r, v, {a, ghostV: ghost ? ghost[i] ?? null : null, hi: hi ? +hi[i] || 0 : 0, ...(vmax ? {vmax} : {})});
    return [x, y];
  });
}

// =====================================================================================================
// meaning map: rect = {x, y, w, h}; map coords u, v ∈ [−1, 1], v up
// =====================================================================================================
export const mapPt = (R, [u, v]) => [R.x + (u + 1) / 2 * R.w, R.y + (1 - v) / 2 * R.h];
const TONE = {warm: PAL.warm, cool: PAL.cool, neutral: PAL.muted};
export function mapPlane(stage, R, {a = 1, grid = true, regions = []} = {}) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    face(c, R.x, R.y, R.w, R.h, 16, ['#0D1D24', '#0A171D'], {edge: rgba(PAL.panelEdge, 0.9)});
    if (grid) for (const s of [-0.5, 0, 0.5]) { line(c, [mapPt(R, [s, -1]), mapPt(R, [s, 1])], rgba(PAL.field, 0.08), 1); line(c, [mapPt(R, [-1, s]), mapPt(R, [1, s])], rgba(PAL.field, 0.08), 1); }
    for (const g of regions) {
      const [cx, cy] = mapPt(R, [g.cx, g.cy]), rx = g.rx * R.w / 2, ry = g.ry * R.h / 2, col = TONE[g.tone] || PAL.muted;
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fillStyle = rgba(col, 0.09); c.fill();
      c.setLineDash([6, 7]); c.strokeStyle = rgba(col, 0.5); c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
      if (g.label) stage.text(g.label, cx, cy - ry - 24, {size: 32, weight: 700, color: col, align: 'center', alpha: 0.9});
    }
  });
}
/** a point on the map: matte disc (lighter top) + name. kind 'given' cool, 'made' warm, 'ghost' outline. → [x, y] */
export function dot(stage, x, y, {r = 12, kind = 'given', label, a = 1, labelDx, labelDy = 0} = {}) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    if (kind === 'ghost') ring(c, x, y, r, rgba(PAL.muted, 0.6), 1.5);
    else {
      const col = kind === 'made' ? PAL.warm : PAL.cool, g = c.createLinearGradient(0, y - r, 0, y + r);
      g.addColorStop(0, col); g.addColorStop(1, mix(col, '#0A1A22', 0.22));
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill(); ring(c, x, y, r, rgba('#000000', 0.35), 1);
    }
    if (label) stage.text(label, x + (labelDx ?? r + 10), y + labelDy, {size: 30, weight: 500, color: kind === 'ghost' ? PAL.muted : PAL.ink, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 8});
  });
  return [x, y];
}
/** sub-path of pts up to fraction q of its length */
function partPath(pts, q) {
  const seg = []; let L = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  let rem = clamp(q) * L; const out = [pts[0]];
  for (let i = 1; i < pts.length && rem > 0; i++) { const d = seg[i - 1], k = Math.min(1, rem / Math.max(d, 1e-9)); out.push([lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]); rem -= d; }
  return out;
}
/** the path a dot came along (thin warm dashed line) up to q */
export function trail(stage, pts, q, {a = 1} = {}) {
  if (a <= 0 || pts.length < 2 || q <= 0) return;
  withAlpha(stage.ctx, a, () => line(stage.ctx, partPath(pts, q), rgba(PAL.warm, 0.7), 2, {dash: [4, 7]}));
}
/**
 * attention line (signal → Glow). w (0..1) = width and brightness, q = how far it has reached. o.bend bows it sideways
 * (fraction of its length, + = left of from→to). Only between glowBegin() and glowFlush(stage): the matte under-line
 * is queued here and drawn by glowFlush just before the glow.
 */
export function link(G, from, to, w, q, {a = 1, bend = 0} = {}) {
  if (a <= 0 || q <= 0) return;
  const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy), mx = (from[0] + to[0]) / 2 - dy * bend, my = (from[1] + to[1]) / 2 + dx * bend;
  const n = Math.max(2, Math.ceil(L / 6)), pts = [];
  for (let i = 0; i <= n; i++) { const s = i / n, u = 1 - s; pts.push([u * u * from[0] + 2 * u * s * mx + s * s * to[0], u * u * from[1] + 2 * u * s * my + s * s * to[1]]); }
  const P = partPath(pts, q), col = colOf(G);
  LINKS.push({pts: P, w: clamp(w), a, col: G === GW ? PAL.warm : PAL.cool});
  const k = a * (0.12 + 0.38 * clamp(w)), rad = 3 + 4 * clamp(w);
  for (let i = 0; i < P.length; i += 1) G.splat(P[i][0], P[i][1], rad, col, k);
  const hd = P[P.length - 1]; if (q < 1) G.splat(hd[0], hd[1], rad * 1.6, col, k * 1.5);
}

// =====================================================================================================
// sound helpers (sar soundEvents style) — build event objects for sound.json
// =====================================================================================================
export const r3 = (x, d = 4) => +(+x).toFixed(d);
export const snd = {
  tick: (id, t0, freq, gain, means, o = {}) => ({id, at: r3(t0), kind: 'tick', params: {freq, decay: o.decay ?? 0.08, gain_db: gain, click: 0}, means}),
  tone: (id, t0, freq, dur, gain, means, o = {}) => ({id, at: r3(t0), kind: 'tone', params: {freq, dur, harmonics: o.harmonics ?? [1, 0.2], attack: 0.005, decay: o.decay ?? dur * 0.5, sustain: o.sustain ?? 0.1, release: o.release ?? Math.min(0.08, dur / 3), gain_db: gain}, means}),
  swell: (id, t0, freqs, dur, gain, means) => ({id, at: r3(t0), kind: 'swell', params: {freqs, dur, attack: 0.4, gain_db: gain}, means}),
  whoosh: (id, t0, dur, f0, f1, gain, means) => ({id, at: r3(t0), kind: 'whoosh', params: {dur: r3(dur, 3), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means}),
  chirp: (id, t0, points, gain, means) => ({id, at: r3(t0), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.25], fade: 0.03, points: points.map(p => p.map(v => r3(v, 3)))}, means}),
  /** many layers in one event: items [[t, kind, params]] */
  train: (id, items, gain, means) => { if (!items.length) return null; const T0 = Math.min(...items.map(x => x[0]));
    return {id, at: r3(T0), kind: 'custom', params: {gain_db: gain, layers: items.map(([tt, kind, params]) => ({kind, offset: r3(tt - T0), params}))}, means}; },
};
