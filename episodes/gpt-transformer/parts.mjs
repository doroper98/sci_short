// 45 GPT는 문맥을 어떻게 읽을까 — local drawing helpers on top of the shared kit (../gpt-generative/kit.mjs, read-only)
// and the shared motion tools (../gpt-generative/motion.mjs). PLAN.md §2 (stage).
// World layer = everything drawn inside withCam (chip row, weight bars, map, panel). Glow works in screen coordinates,
// so attention lines go through glink(), which converts world points with camPt and scales widths by cam.z.
import * as K from '../gpt-generative/kit.mjs';
import {camPt, backOut, spring, withCam} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
const {PAL, WARM, rgba, mix, clamp, lerp, smooth, easeOut, line, circle, ring, withAlpha, TAU} = K;

// sizes after the first review (../gpt-generative/PLAN.md §1.2): chips 58 px, map fills the window, labels 36 / 40 px, % 34 px
export const ROW_Y = 340, SIZE = 58, LONG_Y = 352, LONG_SIZE = 36, ROW2_DY = 105;
export const MAPW = {x: 60, y: 515, w: 960, h: 820};          // working map (window y 286..1360 at z = 1)
export const MAPP = {x: 60, y: 985, w: 960, h: 355};          // poster map (0 s and the last 1.4 s)
export const BAR_Y = 440, BAR_H = 16, BAR_S = 200, PCT = 34;  // weight bars under the words: 100 % = 200 px
export const PANEL_Y = 1400;                                  // s18: the next-word meter below the map (the camera tilts down to it)
export const LABEL = 36, REGION = 40, DOT_R = 16, CENTRE_Y = 640;
export const lerpR = (a, b, q) => ({x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q)});

// =====================================================================================================
// rows (centred; PEAR is placed so that its '배' sits exactly where SHIP's '배' sits)
// =====================================================================================================
const RC = new Map();
function centred(words, size, y) {
  const probe = K.layoutChips(words, {x0: 0, x1: 1e5, y0: y, size}), last = probe[probe.length - 1], wTot = last.x + last.w;
  return K.layoutChips(words, {x0: Math.round(540 - wTot / 2), x1: 1e5, y0: y, size});
}
export function rowOf(name) {
  if (RC.has(name)) return RC.get(name);
  let b;
  if (name === 'SHIP') b = centred(M.SHIP, SIZE, ROW_Y);
  else if (name === 'PEAR') {
    const ship = rowOf('SHIP'), probe = K.layoutChips(M.PEAR, {x0: 0, x1: 1e5, y0: ROW_Y, size: SIZE});
    b = K.layoutChips(M.PEAR, {x0: ship[2].x - probe[2].x, x1: 1e5, y0: ROW_Y, size: SIZE});
  } else if (name === 'PEAR2') b = rowOf('PEAR').map(x => ({...x, y: x.y + ROW2_DY}));          // second row (s02, s10)
  else if (name === 'LONG') b = centred(M.LONG, LONG_SIZE, LONG_Y);
  else if (name === 'LONGC') b = centred(M.LONG, 38, CENTRE_Y);                     // s19: the long row at the window's middle
  else if (name === 'SHIPC') b = rowOf('SHIP').map(x => ({...x, y: CENTRE_Y}));      // s20
  RC.set(name, b); return b;
}
export const slotOf = boxes => { const l = boxes[boxes.length - 1]; return {i: -1, text: '', x: l.x + l.w + 12, y: l.y, w: 160, h: l.h}; };
export const topC = b => [b.x + b.w / 2, b.y - 3];
export const botC = b => [b.x + b.w / 2, b.y + b.h + 3];
/** draw a row; o(i) → chip options (kind, a, pop, hi, dim, dx, dy, sc) */
/** a chip with the edge rule */
export function chipE(stage, b, o = {}) { K.chip(stage, b, {...o, a: (o.a ?? 1) * edgeA(b.x, b.y, b.x + b.w, b.y + b.h)}); }
export function drawRow(stage, boxes, o = () => ({})) {
  boxes.forEach((b, i) => {
    const op = o(i, b) || {}; if ((op.a ?? 1) <= 0) return;
    const sc = op.sc ?? 1, bb = {...b, x: b.x + (op.dx || 0) - b.w * (sc - 1) / 2, y: b.y + (op.dy || 0) - b.h * (sc - 1) / 2, w: b.w * sc, h: b.h * sc};
    K.chip(stage, bb, {kind: op.kind || (b.text === '배' ? 'made' : 'given'), a: (op.a ?? 1) * edgeA(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h), pop: op.pop ?? 1, hi: op.hi || 0, dim: op.dim || 0});
  });
}
/**
 * row morph: boxes A → boxes B at q (0..1). Matching words slide/scale; extra A chips drop away, extra B chips pop in.
 * → list of {box, text, kind, a, pop}
 */
export function morphRow(A, B, q) {
  const used = new Set(), out = [];
  B.forEach(b => {
    const j = A.findIndex((a, k) => !used.has(k) && a.text === b.text);
    if (j >= 0) { used.add(j); const e = easeOut(clamp(q * 1.25)); out.push({box: {...b, ...lerpR(A[j], b, e)}, text: b.text, a: 1, pop: 1}); }
    else out.push({box: b, text: b.text, a: 1, pop: backOut(clamp((q - 0.35) / 0.65))});
  });
  A.forEach((a, k) => { if (used.has(k)) return; const d = clamp(q / 0.6); out.push({box: {...a, y: a.y + 260 * d * d}, text: a.text, a: 1 - d, pop: 1}); });
  return out;
}
export function drawMorph(stage, list, kindOf = txt => (txt === '배' ? 'made' : 'given')) {
  for (const m of list) if (m.a > 0) K.chip(stage, m.box, {kind: kindOf(m.text), a: m.a * edgeA(m.box.x, m.box.y, m.box.x + m.box.w, m.box.y + m.box.h), pop: m.pop});
}

// =====================================================================================================
// attention lines through the camera (signal → Glow). World points in, screen points out.
// =====================================================================================================
let LQ = [];
// ---- camera state of the frame being drawn (set by world()); edge rule: text is fully inside the window or invisible
export const WIN = {x0: 0, x1: 1080, y1: 1360};
let CAM = {cx: 540, cy: 800, z: 1};
export const curCam = () => CAM;
/** alpha for a text-bearing world box [x0, y0, x1, y1]: 1 when ≥ 36 px inside the window, 0 before it touches the edge */
export function edgeA(x0, y0, x1, y1) {
  const [a, b] = camPt(CAM, x0, y0), [c, d] = camPt(CAM, x1, y1);
  const m = Math.min(a - WIN.x0, WIN.x1 - c, b - WORLD_TOP, WIN.y1 - d);
  return clamp((m - 4) / 8);                                          // steep: an object near the edge is either in or out (2nd review)
}
/** camera that frames the union of world boxes [{x, y, w, h}] (or [x0, y0, x1, y1]) with padding, z ≤ zMax */
export function frameBoxes(boxes, {pad = 40, zMax = 1.6, zMin = 1} = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of boxes) { const r = Array.isArray(b) ? b : [b.x, b.y, b.x + b.w, b.y + b.h]; x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); }
  const ww = 1080 - 2 * pad, wh = WIN.y1 - WORLD_TOP - 2 * pad, z = clamp(Math.min(ww / (x1 - x0), wh / (y1 - y0)), zMin, zMax);
  const sc = (WORLD_TOP + WIN.y1) / 2;                                  // window centre on screen
  return {cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - (sc - 800) / z, z};
}
/** world clip top: just under the header title (the shared withCam clips at 240, which lets a pushed-in row slide under the title) */
export const WORLD_TOP = 286;
export function world(stage, cam, fn) { CAM = cam; const c = stage.ctx; c.save(); c.beginPath(); c.rect(0, WORLD_TOP, 1080, 1360 - WORLD_TOP); c.clip(); try { withCam(stage, cam, fn); } finally { c.restore(); } }
const bez = (from, to, apex) => {
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2 - 2 * apex;     // control point straight above the middle: the arc's top is `apex` above
  const n = Math.max(2, Math.ceil(L / 6)), pts = [];
  for (let i = 0; i <= n; i++) { const s = i / n, u = 1 - s; pts.push([u * u * from[0] + 2 * u * s * mx + s * s * to[0], u * u * from[1] + 2 * u * s * my + s * s * to[1]]); }
  return pts;
};
const part = (pts, q) => {
  if (q >= 1) return pts;
  const seg = []; let L = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  let rem = clamp(q) * L; const out = [pts[0]];
  for (let i = 1; i < pts.length && rem > 0; i++) { const d = seg[i - 1], k = Math.min(1, rem / Math.max(d, 1e-9)); out.push([lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]); rem -= d; }
  return out;
};
/** default arc height over a row for a line of horizontal length L */
export const apexFor = (L, max = 42) => clamp(16 + 0.11 * L, 24, max);
/**
 * one attention line: world from → to, w (0..1) = width and brightness, q = reach. o: {a, apex (px, arcs upward),
 * straight (bool), whip (s since it landed → wobble of the arc)}. Must be followed by flushGlow().
 */
export function glink(G, cam, from, to, w, q, o = {}) {
  const a = o.a ?? 1; if (a <= 0 || q <= 0) return null;
  const z = cam.z, wb = o.whip != null && o.whip >= 0 ? 1 + 0.55 * Math.exp(-5 * o.whip) * Math.cos(16 * o.whip) : 1;   // whip: the arc overshoots and settles
  const apex = (o.apex ?? apexFor(Math.abs(to[0] - from[0]))) * (o.straight ? 0 : wb);
  const wpts = o.straight ? [from, ...Array.from({length: 24}, (_, i) => [lerp(from[0], to[0], (i + 1) / 24), lerp(from[1], to[1], (i + 1) / 24)])] : bez(from, to, apex);
  const P = part(wpts, q).map(p => camPt(cam, p[0], p[1])), ww = clamp(w);
  LQ.push({pts: P, w: ww, a, z});
  const k = a * (0.12 + 0.38 * ww), rad = (3 + 4 * ww) * z;
  for (let i = 0; i < P.length; i++) G.splat(P[i][0], P[i][1], rad, WARM, k);
  const hd = P[P.length - 1]; if (q < 1) G.splat(hd[0], hd[1], rad * 1.6, WARM, k * 1.5);
  return P;
}
/** matte under-lines, then both glow buffers (inside the world clip, screen coordinates) */
export function flushGlow(stage) {
  const c = stage.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.rect(0, WORLD_TOP, 1080, 1360 - WORLD_TOP); c.clip();
  for (const L of LQ) withAlpha(c, L.a, () => line(c, L.pts, rgba(PAL.warm, 0.35 + 0.4 * L.w), (1 + 2 * L.w) * L.z));
  LQ = [];
  K.glowFlush(stage);
  c.restore();
}

// =====================================================================================================
// weight bars under the words (meter in the world row). band 0..1: bars slide together into one 100 % band.
// =====================================================================================================
export function wbars(stage, boxes, ws, {pctShow = null, pv = null, g = () => 1, band = 0, a = 1, pctA = 1, hi = [], y = BAR_Y, S = BAR_S, show = null, ghost = null} = {}) {
  if (a <= 0) return;
  const c = stage.ctx, P = pctShow ? (pv || ws).map(w => Math.round(w * 100)) : M.pct100(pv || ws), x0 = boxes[0].x, wTot = boxes[boxes.length - 1].x + boxes[boxes.length - 1].w - x0;
  let acc = x0; const segs = ws.map(w => { const s = {bx: acc, bw: w * wTot}; acc += w * wTot; return s; });
  withAlpha(c, a, () => {
    if (band > 0) withAlpha(c, band, () => { c.beginPath(); c.roundRect(x0 - 3, y - 3, wTot + 6, BAR_H + 6, 6); c.strokeStyle = rgba(PAL.hot, 0.6); c.lineWidth = 1.5; c.stroke(); });
    boxes.forEach((b, i) => {
      if (show && !show[i]) return;
      const gi = g(i), w0 = ws[i] * S * gi, cx = b.x + b.w / 2, h = hi[i] || 0;
      const bw = lerp(w0, segs[i].bw, band), bx = lerp(cx - w0 / 2, segs[i].bx, band);
      if (ghost && ghost[i] != null) { const gw = ghost[i] * S; c.beginPath(); c.roundRect(cx - gw / 2, y, Math.max(gw, 3), BAR_H, 4); c.strokeStyle = rgba(PAL.muted, 0.7); c.lineWidth = 1.5; c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]); }
      if (bw > 0.5) {
        const gr = c.createLinearGradient(0, y, 0, y + BAR_H); gr.addColorStop(0, '#E9A24C'); gr.addColorStop(1, '#C9863A');
        c.beginPath(); c.roundRect(bx, y, bw, BAR_H, 4); c.fillStyle = gr; c.fill();
        line(c, [[bx + 3, y + 1.5], [bx + bw - 3, y + 1.5]], rgba('#FFFFFF', 0.2), 1);
        if (h > 0) { c.beginPath(); c.roundRect(bx - 2, y - 2, bw + 4, BAR_H + 4, 5); c.strokeStyle = rgba(PAL.hot, 0.95 * h); c.lineWidth = 2.5; c.stroke(); }
      }
      if (pctA > 0 && gi > 0.05 && (!pctShow || pctShow[i])) { const px = lerp(cx, segs[i].bx + segs[i].bw / 2, band), py = y + BAR_H + 24;
        stage.text(Math.round(P[i] * clamp(gi)) + '%', px, py, {size: PCT, weight: 700, color: h > 0 ? PAL.hot : PAL.warm, align: 'center', alpha: pctA * clamp(gi * 2) * edgeA(px - 40, py - 20, px + 40, py + 20)}); }
    });
  });
}

// =====================================================================================================
// meaning map: plate (kit), regions (local, so they can fade on their own), dots
// =====================================================================================================
export const mp = (R, uv) => K.mapPt(R, uv);
export function plate(stage, R, a = 1) { K.mapPlane(stage, R, {a, grid: true, regions: []}); }
/** region ellipses: o = {a, la (label alpha), hi: {탈것, 과일}} */
export function regions(stage, R, {a = 1, la = 1, hi = {}, only = null} = {}) {
  if (a <= 0) return;
  const c = stage.ctx;
  for (const [name, g] of Object.entries(M.REGIONS)) {
    if (only && only !== name) continue;
    const [cx, cy] = mp(R, [g.cx, g.cy]), rx = g.rx * R.w / 2, ry = g.ry * R.h / 2, h = hi[name] || 0, col = mix(PAL.muted, PAL.ink, h);
    withAlpha(c, a, () => {
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fillStyle = rgba(PAL.muted, 0.08 + 0.05 * h); c.fill();
      c.setLineDash([6, 7]); c.strokeStyle = rgba(col, 0.5 + 0.3 * h); c.lineWidth = 1.5 + h; c.stroke(); c.setLineDash([]);
      if (la > 0) { const [lx, ly] = regionLabelAt(R, name); stage.text(name, lx, ly, {size: REGION, weight: 700, color: col, align: 'center', alpha: 0.9 * la * edgeA(lx - 46, ly - 24, lx + 46, ly + 24)}); }
    });
  }
}
/** region names sit beside the ellipse, away from every word dot (탈것: upper left, 과일: lower right) */
export function regionLabelAt(R, name) {
  const g = M.REGIONS[name], [cx, cy] = mp(R, [g.cx, g.cy]), rx = g.rx * R.w / 2, ry = g.ry * R.h / 2;
  return name === '탈것' ? [cx - rx * 0.86, cy - ry * 0.80] : [cx + rx * 0.80, cy + ry * 0.86];
}
/** word dot on the map. o: {kind, a, label (default word), r, hi, sq (squash scale), labelDx, labelDy} */
export function wdot(stage, R, uv, word, o = {}) {
  if ((o.a ?? 1) <= 0) return null;
  const [x, y] = mp(R, uv), r = (o.r ?? DOT_R) * (o.sq ?? 1);
  dot36(stage, x, y, {r, kind: o.kind || 'given', label: o.label === false ? undefined : (o.label ?? word), a: o.a ?? 1, labelDx: o.labelDx, labelDy: o.labelDy ?? 0});
  if (o.hi > 0) withAlpha(stage.ctx, o.hi, () => ring(stage.ctx, x, y, r + 5, o.kind === 'made' ? PAL.hot : PAL.coolHi, 2.5));
  return [x, y];
}
/** the kit's map dot with a 36 px name (the kit's dot draws 30 px) and the edge rule for the name */
export function dot36(stage, x, y, {r = DOT_R, kind = 'given', label, a = 1, labelDx, labelDy = 0} = {}) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    if (kind === 'ghost') ring(c, x, y, r, rgba(PAL.muted, 0.6), 1.5);
    else {
      const col = kind === 'made' ? PAL.warm : PAL.cool, g = c.createLinearGradient(0, y - r, 0, y + r);
      g.addColorStop(0, col); g.addColorStop(1, mix(col, '#0A1A22', 0.22));
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill(); ring(c, x, y, r, rgba('#000000', 0.35), 1);
    }
    if (label) {
      const lw = stage.measure(label, {size: LABEL, weight: 500}), lx = x + (labelDx ?? r + 10), ly = y + labelDy;
      stage.text(label, lx, ly, {size: LABEL, weight: 500, color: kind === 'ghost' ? PAL.muted : PAL.ink, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 8, alpha: edgeA(lx, ly - 22, lx + lw, ly + 22)});
    }
  });
  return [x, y];
}
/** label offsets so names never sit on each other (checked on the review sheets) */
export const LAB = {항구를: {labelDx: 24}, 떠난: {labelDx: 24}, 기차: {labelDx: -40, labelDy: 40}, 버스: {labelDx: 24},
  돛: {labelDx: 24}, 익은: {labelDx: 24}, 달게: {labelDx: 24}, 사과: {labelDx: -36, labelDy: 40}, 포도: {labelDx: 24}, 감: {labelDx: 24}, 배: {labelDx: -60, labelDy: 0}};

// =====================================================================================================
// number bundle: n small cells stacked under a word; brightness = value (−1..1). fan 0..1 spreads them out.
// =====================================================================================================
export const CELL_H = 13, CELL_GAP = 2, CELL_W = 46;
export function bundle(stage, cx, y0, vals, {fan = 1, a = 1, warm = false, n = vals.length, fold = 0} = {}) {
  if (a <= 0) return [];
  const c = stage.ctx, col = warm ? PAL.warm : PAL.cool, out = [];
  withAlpha(c, a, () => {
    for (let i = 0; i < n; i++) {
      const fi = i < 2 ? 1 : 1 - fold;                                 // folding: cells 3.. collapse into cell 2
      const yi = y0 + i * (CELL_H + CELL_GAP) * fan * (i < 2 ? 1 : lerp(1, 1 / i, fold));
      if (fi <= 0.02 && i >= 2) continue;
      const v = (vals[i] + 1) / 2;
      c.beginPath(); c.roundRect(cx - CELL_W / 2, yi, CELL_W, CELL_H, 3); c.fillStyle = mix('#0E1A20', col, 0.15 + 0.75 * v); c.globalAlpha *= 1; c.fill();
      c.strokeStyle = rgba('#000000', 0.4); c.lineWidth = 1; c.stroke();
      out.push([cx, yi + CELL_H / 2]);
    }
  });
  return out;
}

// =====================================================================================================
// layer stack (left edge): n cells between y1 (top) and y2 (bottom); cur = current layer (1-based) hi; lit = sweep 0..1
// =====================================================================================================
export function layerStack(stage, n, {x = 30, w = 40, y1 = 528, y2 = 1092, cur = 0, a = 1, lit = -1, done = 0} = {}) {
  if (a <= 0 || n <= 0) return;
  const c = stage.ctx, pitch = (y2 - y1) / Math.max(n, 4), gap = Math.min(4, pitch * 0.25), cnt = Math.ceil(n);
  withAlpha(c, a, () => {
    for (let i = 0; i < cnt; i++) {
      const yb = y2 - i * pitch, h = Math.max(1, pitch - gap), hiOn = i + 1 === cur, isDone = i + 1 <= done, lt = lit >= 0 && i / cnt <= lit ? 1 : 0;
      c.beginPath(); c.roundRect(x, yb - h, w, h, Math.min(4, h / 2));
      c.fillStyle = hiOn || lt ? mix('#5C3B12', '#B9782E', 0.8) : isDone ? '#3E2A10' : '#22323A'; c.fill();
      if (hiOn) { c.strokeStyle = rgba(PAL.hot, 0.95); c.lineWidth = 2; c.stroke(); }
    }
  });
}

// =====================================================================================================
// memory capsule (the old way): matte box; the cool part (bottom) = share of the first word
// =====================================================================================================
export function capsule(stage, cx, y, share, {a = 1, w = 64, h = 56, sq = 1} = {}) {
  if (a <= 0) return;
  const c = stage.ctx, ww = w * sq, hh = h / sq;
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, '#3A4A52'); g.addColorStop(1, '#25333A');
    c.beginPath(); c.roundRect(cx - ww / 2, y + h - hh, ww, hh, 14); c.fillStyle = g; c.fill();
    c.save(); c.beginPath(); c.roundRect(cx - ww / 2, y + h - hh, ww, hh, 14); c.clip();
    const fh = hh * clamp(share), gc = c.createLinearGradient(0, y + h - fh, 0, y + h); gc.addColorStop(0, '#5FB4D9'); gc.addColorStop(1, '#3A86A8');
    c.fillStyle = gc; c.fillRect(cx - ww / 2, y + h - fh, ww, fh);
    c.restore();
    line(c, [[cx - ww / 2 + 12, y + h - hh + 1.5], [cx + ww / 2 - 12, y + h - hh + 1.5]], rgba('#FFFFFF', 0.2), 1);
    c.beginPath(); c.roundRect(cx - ww / 2, y + h - hh, ww, hh, 14); c.strokeStyle = rgba(PAL.muted, 0.45); c.lineWidth = 1.5; c.stroke();
  });
}

// =====================================================================================================
// big number, centred at x (screen-fixed; drawn outside the camera)
// =====================================================================================================
export function bigC(stage, val, unit, t, t0, a = 1, o = {}) {
  const size = o.size || 120, us = 55 * size / 120;
  const wv = stage.measure(val, {role: 'display', weight: 700, size}), wu = unit ? stage.measure(unit, {role: 'display', weight: 700, size: us}) + 12 : 0;
  if (o.plate) { const al = a * smooth((t - t0 + 0.03) / 0.12), x0 = (o.x ?? 540) - (wv + wu) / 2 - 28, y0 = (o.y ?? 1240) - size * 0.62;
    withAlpha(stage.ctx, al, () => K.rect(stage.ctx, x0, y0, wv + wu + 56, size * 1.24, 16, rgba('#03141C', 0.94), rgba(PAL.panelEdge, 0.9), 1.4)); }
  K.bigNum(stage, val, unit, t, t0, a, {x: (o.x ?? 540) - (wv + wu) / 2, y: o.y ?? 1240, size, align: 'left', sub: o.sub, pop: o.pop, color: o.color, unitColor: o.unitColor});
}

/** pull profile: accelerates (ease-in) to a small overshoot, then settles with a spring — the '배' point being pulled */
export function pull(q) {
  const s = clamp(q);
  if (s < 0.6) return 1.08 * (s / 0.6) ** 2;
  const u = (s - 0.6) / 0.4; return 1 + 0.08 * Math.exp(-6 * u) * Math.cos(10 * u);
}
export const lerp2 = (a, b, q) => [lerp(a[0], b[0], q), lerp(a[1], b[1], q)];
/** positions along a polyline of map points (layers), q 0..1 each segment handled by f */
export {spring, backOut};

// =====================================================================================================
// the map as one world: plate, regions, backdrop words, sentence words, '배' (+ ghosts and trails)
// o = {a, regA, regLA, regHi, backA, words: {word: {a, hi, uv}}, bae: {uv, a, sq, hi}, ghosts: [{uv, a}], trails: [{pts (uv), q, a}]}
// =====================================================================================================
export function mapWorld(stage, R, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return {};
  const c = stage.ctx, out = {};
  withAlpha(c, a, () => {
    if (o.plate !== false) plate(stage, R, 1);
    regions(stage, R, {a: o.regA ?? 0, la: o.regLA ?? 0, hi: o.regHi || {}});
    const ba = o.backA ?? 0, BACK = ba > 0 ? [...M.BACKDROP.vehicle, ...M.BACKDROP.fruit] : [];
    const words = Object.entries(o.words || {}).filter(([, s]) => (s.a ?? 1) > 0.02);
    const posOf = (w, s) => mp(R, (s && s.uv) || M.E[w]);
    const labRect = (w, x, y, dx, dy) => [x + dx, y + dy - 20, x + dx + 36 * w.length + 4, y + dy + 20];
    const ov = (r, q) => Math.max(0, Math.min(r[2], q[2]) - Math.max(r[0], q[0])) * Math.max(0, Math.min(r[3], q[3]) - Math.max(r[1], q[1]));
    const dotsR = [...words.map(([w, s]) => posOf(w, s)), ...BACK.map(w => posOf(w))].map(([x, y]) => [x - 18, y - 18, x + 18, y + 18]);
    // label priority: '배' (placed where it hits least), then the sentence words, then the backdrop words; a name that would
    // sit on a name already placed (or on a dot) is left out for that frame
    const taken = [];
    let baeLab = null;
    if (o.bae && (o.bae.a ?? 1) > 0) {
      const [bx, by] = mp(R, o.bae.uv), cand = [[-64, 0], [-18, 44], [-18, -44], [26, 0]];
      const others = [...dotsR, ...words.map(([w, s]) => { const [x, y] = posOf(w, s), L = LAB[w] || {}; return labRect(w, x, y, L.labelDx ?? 26, L.labelDy ?? 0); })];
      const cost = ([dx, dy]) => { const r = labRect('배', bx, by, dx, dy); return others.reduce((m, q) => m + ov(r, q), 0); };
      let best = cand[0], bc = cost(best); for (const cd of cand.slice(1)) { const k = cost(cd); if (k < bc - 1) { best = cd; bc = k; } }
      baeLab = best; taken.push(labRect('배', bx, by, best[0], best[1]), [bx - 20, by - 20, bx + 20, by + 20]);
    }
    const labOK = {};
    for (const [w, s] of [...words, ...BACK.map(w => [w, null])]) {
      const [x, y] = posOf(w, s), L = LAB[w] || {}, r = labRect(w, x, y, L.labelDx ?? 26, L.labelDy ?? 0);
      const hit = taken.some(q => ov(r, q) > 30) || dotsR.some(q => ov(r, q) > 30 && !(Math.abs((q[0] + q[2]) / 2 - x) < 1 && Math.abs((q[1] + q[3]) / 2 - y) < 1));
      labOK[w] = !hit; if (!hit) taken.push(r);
    }
    for (const w of BACK) wdot(stage, R, M.E[w], w, {a: ba * (o.backEach?.[w] ?? 1), r: 12, ...LAB[w], hi: o.backHi?.[w] || 0, label: labOK[w] ? undefined : false});
    for (const tr of o.trails || []) if ((tr.a ?? 1) > 0 && tr.q > 0) K.trail(stage, tr.pts.map(uv => mp(R, uv)), tr.q, {a: tr.a ?? 1});
    for (const g of o.ghosts || []) if ((g.a ?? 1) > 0) { const [x, y] = mp(R, g.uv); withAlpha(c, g.a ?? 1, () => ring(c, x, y, g.r ?? 19, rgba(g.warm ? PAL.warm : PAL.muted, 0.75), 1.8)); }
    for (const [w, s] of words) out[w] = wdot(stage, R, s.uv || M.E[w], w, {a: s.a ?? 1, hi: s.hi || 0, sq: s.sq, ...LAB[w], label: labOK[w] ? s.label : false});
    if (baeLab) out.배 = wdot(stage, R, o.bae.uv, '배', {kind: 'made', r: 18, a: o.bae.a ?? 1, sq: o.bae.sq, hi: o.bae.hi || 0, labelDx: baeLab[0], labelDy: baeLab[1], label: o.bae.label});
  });
  return out;
}

// =====================================================================================================
// probability bars at 34 px (the kit's probBars draws 30 px text; same look otherwise): rows 46 high, 62 apart
// rows: [{label, p, kind, hi, ghostP}] → {bx0, bx1, rows: [{y, cy, xEnd}]}
// =====================================================================================================
export function probBars34(stage, rows, {x0 = 84, x1 = 996, y0, rowH = 46, a = 1, labW = 210} = {}) {
  const c = stage.ctx, bx0 = x0 + labW + 12, bx1 = x1 - 120, pitch = rowH + 16, out = [];
  const pct = p => (p < 0.01 ? '<1%' : Math.round(p * 100) + '%');
  withAlpha(c, a * edgeA(x0, y0 - 10, x1, y0 + rows.length * pitch), () => {
    const yb = y0 + rows.length * pitch - 16;
    for (const f of [0, 0.5, 1]) line(c, [[bx0 + f * (bx1 - bx0), y0 - 8], [bx0 + f * (bx1 - bx0), yb + 8]], rgba(PAL.muted, 0.14), 1, {dash: f ? [3, 6] : null});
    rows.forEach((r, i) => {
      const y = y0 + i * pitch, cy = y + rowH / 2, rest = r.kind === 'rest', hi = clamp(r.hi || 0), len = clamp(r.p) * (bx1 - bx0);
      const plate = (x, yy, w, h, rad, top, bot, edge) => { const g = c.createLinearGradient(0, yy, 0, yy + h); g.addColorStop(0, top); g.addColorStop(1, bot); c.beginPath(); c.roundRect(x, yy, w, h, rad); c.fillStyle = g; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); } };
      plate(x0, y, labW, rowH, 10, rest ? '#1C252A' : '#26343B', rest ? '#151D21' : '#1A252B', rgba(PAL.muted, 0.3));
      stage.text(r.label, x0 + labW / 2, cy, {size: 34, weight: 500, align: 'center', color: rest ? PAL.muted : PAL.ink, maxWidth: labW - 16});
      if (len > 0.5) plate(bx0, y + 4, len, rowH - 8, 7, rest ? '#56656B' : '#E9A24C', rest ? '#44525A' : '#C9863A');
      if (r.ghostP != null) { const gl = clamp(r.ghostP) * (bx1 - bx0); c.beginPath(); c.roundRect(bx0, y + 4, Math.max(gl, 3), rowH - 8, 7); c.strokeStyle = rgba(PAL.hot, 0.6); c.lineWidth = 1.5; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
      if (hi > 0) { c.beginPath(); c.roundRect(bx0 - 2, y + 2, Math.max(len, 8) + 4, rowH - 4, 8); c.strokeStyle = rgba(PAL.hot, 0.95 * hi); c.lineWidth = 2.5; c.stroke(); }
      stage.text(pct(r.p), bx0 + Math.max(len, r.ghostP != null ? clamp(r.ghostP) * (bx1 - bx0) : 0) + 14, cy, {size: 34, weight: 700, color: rest ? PAL.muted : hi > 0 ? PAL.hot : PAL.warm});
      out.push({y, cy, xEnd: bx0 + len});
    });
  });
  return {bx0, bx1, rows: out};
}
/** the meter's plate (the kit's panel draws at the fixed strip; this one goes where it is asked) */
export function panelAt(stage, y0, h, a = 1) { if (a <= 0) return; withAlpha(stage.ctx, a * edgeA(60, y0, 1020, y0 + h), () => K.rect(stage.ctx, 60, y0, 960, h, 10, rgba('#03141C', 0.85), PAL.panelEdge, 1.4)); }
