// 44 GPT는 어떻게 배웠을까 — this episode's stage parts (PLAN.md §2), on top of the shared kit and motion tools.
// Sizes follow ../gpt-generative/PLAN.md §1.2 (화면 구성 규칙): the world window y 286–1360 is filled at z = 1.
// World coordinates throughout (scenes draw them inside withCamH); Glow helpers take the cam and convert with camPt.
import {PAL, COOL, rgba, mix, clamp, lerp, smooth, easeOut, line, circle, ring, withAlpha, TAU,
  layoutChips, chip, dial, curve, beamPulse} from '../gpt-generative/kit.mjs';
import {camPt, withCam, streak, ringPop, backOut, spring} from '../gpt-generative/motion.mjs';
import {CURVE, N_PRE, probs, VOCAB} from './model.mjs';

// ---------------------------------------------------------------------------------------------- layout
export const HEAD_BOTTOM = 270, WIN = {x0: 0, x1: 1080, y0: HEAD_BOTTOM + 16, y1: 1360};
export const LINE = {x0: 70, x1: 1010, y0: 300, size: 58};
export const BODY = {x: 90, y: 418, w: 900, h: 486};
export const DG = {x0: 190, y0: 545, cols: 6, dx: 140, dy: 128, r: 54};
export const VMAX = 1.6;                        // dial full scale (±135°); trained values beyond it pin at the stop
export const BARS = {y0: 932, rowH: 46, pitch: 62, x0: 94, x1: 1010, lw: 210};
BARS.bx0 = BARS.x0 + BARS.lw + 14; BARS.bx1 = BARS.x1 - 128;
export const LOSS = {x0: 94, y: 1252, h: 46, bx0: BARS.bx0, bx1: BARS.bx1, max: 4.6};
export const CPANEL = {x0: 70, x1: 1010, y0: 944, y1: 1340};
export const CP = {x0: 140, x1: 900, top: 1030, base: 1262};
export const BIGPOS = {x: 1010, y: 372, size: 84};
export const INLET = [540, BODY.y + 12];
export const dialXY = i => [DG.x0 + (i % DG.cols) * DG.dx, DG.y0 + Math.floor(i / DG.cols) * DG.dy];
export const DIALC = Array.from({length: 18}, (_, i) => dialXY(i));
export const rowY = i => BARS.y0 + i * BARS.pitch;
export const rowCy = i => rowY(i) + BARS.rowH / 2;
export const barX = p => BARS.bx0 + clamp(p) * (BARS.bx1 - BARS.bx0);
/** a bar row's box up to its % text (for framing) */
export const rowBox = (i, p) => ({x0: BARS.x0, y0: rowY(i) - 4, x1: barX(p) + 110, y1: rowY(i) + BARS.rowH + 4});
// group boxes (world) for camera framing and visibility
export const BOX = {
  body: {x0: BODY.x, y0: BODY.y, x1: BODY.x + BODY.w, y1: BODY.y + BODY.h},
  bars: {x0: BARS.x0, y0: BARS.y0 - 6, x1: BARS.x1, y1: rowY(4) + BARS.rowH + 6},
  loss: {x0: LOSS.x0, y0: LOSS.y - 4, x1: LOSS.bx1 + 8, y1: LOSS.y + LOSS.h + 46},
  panel: {x0: CPANEL.x0, y0: CPANEL.y0, x1: CPANEL.x1, y1: CPANEL.y1},
  row: i => ({x0: BARS.x0, y0: rowY(i) - 4, x1: BARS.x1, y1: rowY(i) + BARS.rowH + 4}),
  dialRow: r => ({x0: DG.x0 - DG.r - 14, y0: DG.y0 + r * DG.dy - DG.r - 14, x1: DG.x0 + 5 * DG.dx + DG.r + 14, y1: DG.y0 + r * DG.dy + DG.r + 14}),
};
export const union = (...bs) => ({x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1))});
export const boxOf = bx => union(...bx.map(b => ({x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h})));
/** camera that shows the whole box inside the world window with pad px of margin (z ≤ zMax, never below zMin) */
export function frameBoxes(box, {pad = 40, zMax = 1.6, zMin = 0.5} = {}) {
  const w = box.x1 - box.x0, h = box.y1 - box.y0, wh = WIN.y1 - WIN.y0;
  const z = clamp(Math.min((1080 - 2 * pad) / w, (wh - 2 * pad) / h), zMin, zMax);
  const wy = (WIN.y0 + WIN.y1) / 2;                     // window centre on screen (823)
  return {cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 - (wy - 800) / z, z};
}
/** cam key at time t that frames box */
export const camKey = (t, box, o) => ({t, ...frameBoxes(box, o)});
export const CAM_HOME = {cx: 540, cy: 800, z: 1};
/** alpha of a text-carrying group under cam: 1 when fully inside the window, falling to 0 as it sticks out (40 px) */
export function visA(cam, b, soft = 14) {
  const [sx0, sy0] = camPt(cam, b.x0, b.y0), [sx1, sy1] = camPt(cam, b.x1, b.y1);
  const over = Math.max(0, WIN.x0 - sx0, sx1 - WIN.x1, WIN.y0 - sy0, sy1 - WIN.y1);
  return clamp(1 - over / soft);
}
/** withCam plus a second clip below the header title: world objects never overlap the header */
export function withCamH(stage, cam, draw) {
  const c = stage.ctx; c.save(); c.beginPath(); c.rect(0, WIN.y0, 1080, WIN.y1 - WIN.y0); c.clip();
  try { withCam(stage, cam, draw); } finally { c.restore(); }
}
/** draw the body's GPT name plate only when it is fully in the window */
export const bodyLabel = cam => visA(cam, {x0: BODY.x, y0: BODY.y, x1: BODY.x + 140, y1: BODY.y + 58}) > 0.5;
const F = {body: ['#33444C', '#222F35'], deep: '#0A151B'};

// ---------------------------------------------------------------------------------------------- chips
const LCACHE = new Map();
/** cached layoutChips for a piece list (text array) at size / y0 */
export function lineBoxes(pieces, size = LINE.size, y0 = LINE.y0, x0 = LINE.x0, o = {}) {
  const key = pieces.join('|') + '@' + size + '/' + y0 + '/' + x0 + '/' + (o.padX ?? '') + (o.gap ?? '') + (o.x1 ?? '');
  let b = LCACHE.get(key); if (!b) { b = layoutChips(pieces, {x0, x1: o.x1 ?? LINE.x1, y0, size, lineGap: 14, ...(o.padX != null ? {padX: o.padX} : {}), ...(o.gap != null ? {gap: o.gap} : {})}); LCACHE.set(key, b); }
  return b;
}
/**
 * a covered piece. Before tOpen: cover. After: the piece (given + hi) under a cover hinged on its top edge that flips up
 * (0.22 s, backOut) and fades. peek (0..1) makes the closed cover see-through (s07).
 */
export function coverChip(stage, box, t, tOpen = Infinity, o = {}) {
  const c = stage.ctx, q = (t - tOpen) / 0.22, a = o.a ?? 1;
  if (q >= 0) chip(stage, box, {kind: 'given', a, hi: o.hi ?? (1 - smooth((t - tOpen - 0.8) / 0.6)) * 0.9 + 0.1});
  else if ((o.peek || 0) > 0) chip(stage, box, {kind: 'given', a: a * o.peek});
  if (q >= 1.6) return;
  const s = q < 0 ? 1 : lerp(1, -0.45, backOut(q, 1.2)), fa = q < 0 ? 1 - 0.65 * (o.peek || 0) : 1 - smooth((q - 0.9) / 0.7);
  withAlpha(c, a * fa, () => {
    c.save(); c.translate(0, box.y); c.scale(1, s === 0 ? 0.001 : s); c.translate(0, -box.y);
    chip(stage, box, {kind: 'cover', hi: o.coverHi || 0});
    if (s < 0) { c.beginPath(); c.roundRect(box.x, box.y, box.w, box.h, 12); c.fillStyle = 'rgba(2,10,14,0.55)'; c.fill(); }
    c.restore();
  });
}
/** Glow at the moment the cover opens: cool burst on the revealed piece (screen coords through cam) */
export function revealGlow(GC, cam, box, t, tOpen) {
  const f = t - tOpen; if (f < 0 || f > 0.55) return;
  const [x, y] = camPt(cam, box.x + box.w / 2, box.y + box.h / 2), k = (1 - f / 0.55) ** 1.5;
  GC.splat(x, y, Math.min(70, box.w * 0.45) * cam.z, COOL, 0.9 * k);
}

// ---------------------------------------------------------------------------------------------- body (GPT's inside)
/** matte body (same face treatment as kit.machine), GPT name plate top-left, inlet slot top centre */
export function body(stage, a = 1, o = {}) {
  if (o.cam) a *= o.strict ? boardVisAll(o.cam) : boardVis(o.cam);   // strict: any dial cut → no body          // no empty slab: when every dial is out of the window, the body goes too (§1.2)
  if (a <= 0) return;
  const c = stage.ctx, {x, y, w, h} = o.rect || BODY, top = 58;
  withAlpha(c, a, () => {
    c.beginPath(); c.roundRect(x, y, w, h, 28); c.fillStyle = F.body[1]; c.fill();
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 28); c.clip(); c.fillStyle = F.body[0]; c.fillRect(x, y, w, top);
    line(c, [[x, y + top], [x + w, y + top]], rgba('#000000', 0.35), 2); c.restore();
    line(c, [[x + 28, y + 1.5], [x + w - 28, y + 1.5]], rgba('#FFFFFF', 0.18), 1.2);
    c.beginPath(); c.roundRect(x, y, w, h, 28); c.strokeStyle = o.edge ? rgba(PAL.cool, 0.8 * o.edge) : rgba(PAL.muted, 0.28); c.lineWidth = o.edge ? 3 : 1.5; c.stroke();
    c.beginPath(); c.roundRect(x + w / 2 - 110, y + 16, 220, 18, 8); c.fillStyle = F.deep; c.fill();
    if (o.label !== false) stage.text('GPT', x + 30, y + top / 2 + 2, {role: 'display', weight: 700, size: 36, color: PAL.ink, alpha: 0.85});
  });
}

// ---------------------------------------------------------------------------------------------- dials
const ang = v => -Math.PI / 2 + clamp(v / VMAX, -1, 1) * 0.75 * Math.PI;
/**
 * one dial. o: {a, ghostV, hi, s (scale about its centre), wedge (0..1 alpha of the turned sector between ghostV and v),
 * arrow: {len (rad, signed: + = clockwise = make it bigger), q (0..1 growth), a}}
 */
export function dialX(stage, x, y, v, o = {}) {
  const c = stage.ctx, r = DG.r * (o.r ?? 1), s = o.s ?? 1, a = o.a ?? 1; if (a <= 0 || s <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(s, s); c.translate(-x, -y);
  dial(stage, x, y, r, v, {a, ghostV: o.ghostV ?? null, hi: o.hi || 0, vmax: VMAX});
  if (o.ghostV != null && (o.wedge || 0) > 0 && Math.abs(v - o.ghostV) > 1e-4) {
    const a0 = ang(o.ghostV), a1 = ang(v);
    withAlpha(c, a * o.wedge, () => { c.beginPath(); c.moveTo(x, y); c.arc(x, y, 0.78 * r, Math.min(a0, a1), Math.max(a0, a1)); c.closePath(); c.fillStyle = rgba(PAL.warm, 0.42); c.fill(); });
  }
  if (o.arrow && o.arrow.q > 0.01 && Math.abs(o.arrow.len) > 0.06) {
    const L = o.arrow.len * clamp(o.arrow.q), a0 = ang(v), a1 = a0 + L, R = r + 11;
    withAlpha(c, a * (o.arrow.a ?? 1), () => {
      c.beginPath(); c.arc(x, y, R, Math.min(a0, a1), Math.max(a0, a1)); c.strokeStyle = PAL.warm; c.lineWidth = 4; c.lineCap = 'round'; c.stroke();
      const d = Math.sign(L), hx = x + R * Math.cos(a1), hy = y + R * Math.sin(a1), tx = -Math.sin(a1) * d, ty = Math.cos(a1) * d, nx = Math.cos(a1), ny = Math.sin(a1);
      c.beginPath(); c.moveTo(hx + tx * 12, hy + ty * 12); c.lineTo(hx - tx * 3 + nx * 9, hy - ty * 3 + ny * 9); c.lineTo(hx - tx * 3 - nx * 9, hy - ty * 3 - ny * 9); c.closePath(); c.fillStyle = PAL.warm; c.fill();
    });
  }
  c.restore();
}
/** arrow arc length for a gradient component g (d loss / d number): increase (g < 0) = clockwise */
export const arrowLen = g => -Math.sign(g) * Math.min(2.3, Math.abs(g) * 2.4);
/** visibility of the dial board under cam: the best-visible dial (0 when every dial sticks out of the window) */
export const boardVis = cam => Math.max(...DIALC.map(([x, y]) => visA(cam, {x0: x - DG.r - 14, y0: y - DG.r - 14, x1: x + DG.r + 14, y1: y + DG.r + 14})));
/** strict version: 0 as soon as any dial sticks out of the window */
export const boardVisAll = cam => Math.min(...DIALC.map(([x, y]) => visA(cam, {x0: x - DG.r - 14, y0: y - DG.r - 14, x1: x + DG.r + 14, y1: y + DG.r + 14})));
/** the 18-dial board. per(i) → extra options for dial i. o.cam → rows that stick out of the window fade (§1.2) */
export function dialBoard(stage, vals, o = {}, per = null) {
  const R = DG.r + 14, dA = i => (o.cam ? visA(o.cam, {x0: DIALC[i][0] - R, y0: DIALC[i][1] - R, x1: DIALC[i][0] + R, y1: DIALC[i][1] + R}) : 1);
  vals.forEach((v, i) => {
    const [x, y] = DIALC[i], g = o.ghost ? o.ghost[i] : null;
    // a turned dial's needle goes warm in proportion to how far it turned (0.15 = full): "많이 / 적게" readable
    const turned = g != null && (o.wedge ?? 0) > 0 ? clamp(Math.abs(v - g) / 0.15) * o.wedge : 0;
    const ex = per ? per(i) : {};
    dialX(stage, x, y, v, {ghostV: g, wedge: o.wedge ?? 0, ...ex, a: (o.a ?? 1) * (ex.a ?? 1) * dA(i), hi: Math.max(turned, ex.hi || 0, o.hi ? o.hi[i] : 0)});
  });
}

// ---------------------------------------------------------------------------------------------- bars / loss / curve
function face(c, x, y, w, h, r, top, bot, edge) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bot);
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = g; c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); }
}
const pct = p => (p < 0.01 ? '<1%' : Math.round(p * 100) + '%');
/** rows for the bars from params: ids fixed by the caller, + '그 밖' */
export function barRows(P, ctx, ids) {
  const p = probs(P, ctx), rows = ids.map(id => ({label: VOCAB[id], p: p[id], id}));
  rows.push({label: '그 밖', p: Math.max(0, 1 - rows.reduce((s, r) => s + r.p, 0)), kind: 'rest'});
  return rows;
}
/**
 * probability bars (this episode's sizes: plates and bars 46 high, 34 px text, 62 px pitch; kit.probBars has 30 px text).
 * rows: [{label, p, kind, hi, ghostP, a, grow}]. o: {a, cam (rows sticking out of the window fade), y0}
 */
export function bars(stage, rows, o = {}) {
  const c = stage.ctx, y0 = o.y0 ?? BARS.y0, {x0, lw, bx0, bx1, rowH, pitch} = BARS;
  withAlpha(c, o.a ?? 1, () => {
    for (const f of [0, 0.5, 1]) line(c, [[bx0 + f * (bx1 - bx0), y0 - 8], [bx0 + f * (bx1 - bx0), y0 + rows.length * pitch - 8]], rgba(PAL.muted, 0.14), 1, {dash: f ? [3, 6] : null});
    rows.forEach((r, i) => {
      const y = y0 + i * pitch, cy = y + rowH / 2, rest = r.kind === 'rest', hi = clamp(r.hi || 0), len = clamp(r.p) * (r.grow ?? 1) * (bx1 - bx0);
      const ext = bx0 + Math.max(len, r.ghostP != null ? clamp(r.ghostP) * (bx1 - bx0) : 0) + 12 + stage.measure(pct(r.p), {size: 34, weight: 700});
      const ra = (r.a ?? 1) * (o.cam ? visA(o.cam, {x0, y0: y - 4, x1: ext + 6, y1: y + rowH + 4}) : 1); if (ra <= 0) return;
      withAlpha(c, ra, () => {
        face(c, x0, y, lw, rowH, 10, rest ? '#1C252A' : '#26343B', rest ? '#151D21' : '#1A252B', rgba(PAL.muted, 0.3));
        stage.text(r.label, x0 + lw / 2, cy, {size: 34, weight: 500, align: 'center', color: rest ? PAL.muted : PAL.ink, maxWidth: lw - 16});
        if (len > 0.5) face(c, bx0, y + 3, len, rowH - 6, 7, rest ? '#56656B' : '#E9A24C', rest ? '#44525A' : '#C9863A');
        const gl = r.ghostP != null ? clamp(r.ghostP) * (bx1 - bx0) : null;
        if (gl != null) { c.beginPath(); c.roundRect(bx0, y + 3, Math.max(gl, 4), rowH - 6, 7); c.strokeStyle = rgba(PAL.hot, 0.6); c.lineWidth = 1.6; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
        if (hi > 0) for (const [bx, bw, yy, hh] of [[x0, lw, y, rowH], [bx0, Math.max(len, 8), y + 3, rowH - 6]]) { c.beginPath(); c.roundRect(bx - 2, yy - 2, bw + 4, hh + 4, 10); c.strokeStyle = rgba(PAL.hot, 0.95 * hi); c.lineWidth = 2.5; c.stroke(); }
        stage.text(pct(r.p), bx0 + Math.max(len, gl ?? 0) + 12, cy, {size: 34, weight: 700, color: rest ? PAL.muted : hi > 0 ? PAL.hot : PAL.warm});
      });
    });
  });
}
/** −ln p bar ("틀린 정도"), 0 … 4.6 (p = 1 %). o: {a, ghostP, hi, grow (0..1 length factor), cam} */
export function lossBar(stage, p, o = {}) {
  const a = (o.a ?? 1) * (o.cam ? visA(o.cam, BOX.loss) : 1); if (a <= 0) return null;
  const c = stage.ctx, L = LOSS, v = Math.min(L.max, -Math.log(Math.max(1e-6, p))), len = (v / L.max) * (L.bx1 - L.bx0) * (o.grow ?? 1);
  withAlpha(c, a, () => {
    face(c, L.x0, L.y, BARS.lw, L.h, 10, '#26343B', '#1A252B', rgba(PAL.muted, 0.3));
    stage.text('틀린 정도', L.x0 + BARS.lw / 2, L.y + L.h / 2, {size: 34, weight: 500, align: 'center', color: PAL.ink});
    c.beginPath(); c.roundRect(L.bx0, L.y + 3, L.bx1 - L.bx0, L.h - 6, 7); c.fillStyle = rgba('#0A151B', 0.8); c.fill();
    if (len > 0.5) face(c, L.bx0, L.y + 3, len, L.h - 6, 7, '#E9A24C', '#C9863A');
    if (o.ghostP != null) { const gl = Math.min(L.max, -Math.log(o.ghostP)) / L.max * (L.bx1 - L.bx0); c.beginPath(); c.roundRect(L.bx0, L.y + 3, gl, L.h - 6, 7); c.strokeStyle = rgba(PAL.hot, 0.6); c.lineWidth = 1.6; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
    if (o.hi) { c.beginPath(); c.roundRect(L.bx0 - 2, L.y + 1, Math.max(len, 8) + 4, L.h - 2, 9); c.strokeStyle = rgba(PAL.hot, 0.95 * o.hi); c.lineWidth = 2.5; c.stroke(); }
    for (const x of [L.bx0, L.bx1]) line(c, [[x, L.y + L.h + 2], [x, L.y + L.h + 9]], rgba(PAL.muted, 0.7), 1.4);
    stage.text('작음', L.bx0, L.y + L.h + 30, {size: 30, weight: 500, color: PAL.muted, align: 'left'});
    stage.text('큼', L.bx1, L.y + L.h + 30, {size: 30, weight: 500, color: PAL.muted, align: 'right'});
  });
  return {xEnd: L.bx0 + len, cy: L.y + L.h / 2};
}
export const curveX = k => CP.x0 + (k / N_PRE) * (CP.x1 - CP.x0);
export const curveY = v => CP.base - v * (CP.base - CP.top);
/** instrument panel: mean right-piece probability vs step, drawn up to step k (fractional ok). o: {a, cam, label} */
export function curvePanel(stage, k, o = {}) {
  const a = (o.a ?? 1) * (o.cam ? visA(o.cam, BOX.panel) : 1); if (a <= 0) return null;
  const c = stage.ctx, P = CPANEL;
  withAlpha(c, a, () => {
    c.beginPath(); c.roundRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 10); c.fillStyle = rgba('#03141C', 0.8); c.fill(); c.strokeStyle = PAL.panelEdge; c.lineWidth = 1.4; c.stroke();
    stage.text(o.label ?? '정답에 준 확률 (평균)', P.x0 + 20, P.y0 + 36, {size: 32, weight: 500, color: PAL.muted});
    if (o.content === false) return;
    for (const v of [0.5, 1]) line(c, [[CP.x0, curveY(v)], [CP.x1, curveY(v)]], rgba(PAL.muted, 0.22), 1, {dash: [3, 6]});
    line(c, [[CP.x0, CP.base], [CP.x1, CP.base]], rgba(PAL.field, 0.3), 1);
    stage.text('100%', P.x1 - 18, curveY(1), {size: 30, weight: 500, color: PAL.muted, align: 'right'});
    stage.text('50%', P.x1 - 18, curveY(0.5), {size: 30, weight: 500, color: PAL.muted, align: 'right'});
    for (const [x, lab, al] of [[CP.x0, '0', 'center'], [CP.x1, N_PRE + '걸음', 'right']]) { line(c, [[x, CP.base], [x, CP.base + 7]], rgba(PAL.muted, 0.7), 1.4); stage.text(lab, x + (al === 'right' ? 20 : 0), CP.base + 40, {size: 30, weight: 500, color: PAL.muted, align: al}); }
  });
  if (o.content === false) return null;
  const kk = clamp(k, 0, N_PRE), pts = [];
  for (let i = 0; i <= Math.floor(kk); i += 2) pts.push([curveX(i), curveY(CURVE[i])]);
  const fl = Math.floor(kk), fr = kk - fl;
  pts.push(fr > 0 && fl + 1 <= N_PRE ? [curveX(kk), curveY(lerp(CURVE[fl], CURVE[fl + 1], fr))] : [curveX(fl), curveY(CURVE[fl])]);
  curve(stage, pts, {a, color: PAL.warm, width: 4});
  return pts[pts.length - 1];
}

// ---------------------------------------------------------------------------------------------- signals
/** forward flow (given text going in): matte cool streaks — not Glow */
export function flowIn(stage, from, to, q, a = 1) {
  if (q <= 0 || q >= 1.3 || a <= 0) return;
  for (const lag of [0, 0.12, 0.24]) { const s = q - lag; if (s <= 0 || s > 1) continue; streak(stage, from, to, s, {len: 0.22, w: 8, a: 0.75 * a * (1 - lag * 2), color: PAL.cool}); }
}
/** backward pulse (Glow, warm): from → to at q, through the cam */
export function pulseBack(GW, cam, from, to, q, amp = 1) {
  if (q < 0 || q > 1) return;
  beamPulse(GW, camPt(cam, ...from), camPt(cam, ...to), q, {amp});
}
export {ringPop, spring, backOut};
