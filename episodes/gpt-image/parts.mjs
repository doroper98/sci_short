// 46 GPT는 그림을 어떻게 그릴까 — the stage (PLAN §2) and the drawing engine shared by the scene modules.
// One stage: the prompt line (world, y 300), the picture board (world, 680 px), the draw strip in its panel (fixed on
// screen under the world window, so a camera push into the board never crops its numbers). A "board run" is a list of
// model steps with their pick times; drawBoardRun() draws the chain of a step: strip re-divides → marker falls → the
// picked segment and the new tile flash (warm glow) → the tile lands on the board.
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import * as K from '../gpt-generative/kit.mjs';
import {backOut, spring, drop, squash, camAt, withCam, camPt, streak, ringPop, rollNum, speedBadge} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
export {backOut, spring, drop, squash, camAt, withCam, camPt, streak, ringPop, rollNum, speedBadge};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
const {PAL, clamp, lerp, smooth} = K;

// ---------------------------------------------------------------------------------------------
// layout (PLAN §2, §1.2 sizes)
// ---------------------------------------------------------------------------------------------
export const CH = {x0: 70, x1: 1010, y0: 300, size: 56, gap: 14};               // prompt line, 56 px chips (84 px high)
export const BOARD = {x: 200, y: 400, w: 680, h: 680};                          // 20 × 34 px
export const PBOARD = {x: 310, y: 836, w: 460, h: 460};                         // poster board (0 s): under the title, ends above y 1300
export const PANEL = {x: 70, y: 1106, w: 940, h: 200};
export const STRIP_Y = 1150, STRIP_H = 64, SX0 = 94, SX1 = 986;
export const POSTER = {q: '그림을 어떻게 그릴까?', a: 'GPT', n: '4 of 4', y: 415, y2: 579, AS: 220, qw: 920};   // 2026-11-13: 흰 물음 + 큰 주제어
export const CHIP_Y0 = 246;                                                     // prompt chips at 0 s (above the title); they slide to CH.y0 during the morph
export const HEAD_BOTTOM = 262;
export const WIN = {x0: 0, x1: 1080, y0: HEAD_BOTTOM + 16, y1: 1360};            // world window (full)
export const WIN_P = {...WIN, y1: 1096};                                         // world window above the strip panel
export const FULL = {cx: 540, cy: 800, z: 1};
export const G = M.G, N = M.N;

// ---------------------------------------------------------------------------------------------
// framing (PLAN §1.2): camera targets from boxes; text-bearing things are fully visible or hidden
// ---------------------------------------------------------------------------------------------
export function bbox(boxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}
/** camera that shows all boxes inside win with pad (z ≤ zMax) */
export function frameBoxes(boxes, {pad = 40, zMax = 1.6, zMin = 0.05, z: zFix, win = WIN} = {}) {
  const b = bbox(boxes), ww = win.x1 - win.x0 - 2 * pad, wh = win.y1 - win.y0 - 2 * pad;
  const z = zFix ?? clamp(Math.min(zMax, ww / b.w, wh / b.h), zMin, zMax);
  const wcx = (win.x0 + win.x1) / 2, wcy = (win.y0 + win.y1) / 2;
  return {cx: b.x + b.w / 2 - (wcx - 540) / z, cy: b.y + b.h / 2 - (wcy - 800) / z, z};
}
/** 1 when the world rect is fully inside win under cam, 0 once an edge is crossed (soft px) */
export function edgeA(cam, r, win = WIN, soft = 18) {
  if (!cam) return 1;
  const [x0, y0] = camPt(cam, r.x, r.y), [x1, y1] = camPt(cam, r.x + r.w, r.y + r.h);
  return clamp(Math.min(x0 - win.x0, win.x1 - x1, y0 - win.y0, win.y1 - y1) / soft);
}
/** world layer: clipped to [WIN.y0, y1] (below the header title) and transformed by cam */
export function world(stage, cam, draw, y1 = WIN.y1, y0 = WIN.y0) {
  const c = stage.ctx; c.save(); c.beginPath(); c.rect(0, y0, 1080, y1 - y0); c.clip();
  try { withCam(stage, cam, draw); } finally { c.restore(); }
}

// ---------------------------------------------------------------------------------------------
// chips
// ---------------------------------------------------------------------------------------------
const LC = new Map();
/** centred chip line: layoutChips, then shifted so each line is centred at x 540 */
export function lay(pieces, o = CH) {
  const key = JSON.stringify([pieces, o]); let v = LC.get(key); if (v) return v;
  v = K.layoutChips(pieces, o);
  if (o.center !== false) { const lines = {}; for (const b of v) (lines[b.line] ||= []).push(b);
    for (const L of Object.values(lines)) { const x0 = L[0].x, x1 = L[L.length - 1].x + L[L.length - 1].w, dx = 540 - (x0 + x1) / 2; for (const b of L) b.x += dx; } }
  LC.set(key, v); return v;
}
export const centre = b => [b.x + b.w / 2, b.y + b.h / 2];
/** chip with the contact squash */
export function chipAt(stage, b, t, t0, o) {
  const k = squash(t, t0, 0.12, 0.08), c = stage.ctx;
  if (k === 1 || t0 == null) return K.chip(stage, b, o);
  const [cx, cy] = centre(b); c.save(); c.translate(cx, cy); c.scale(k, 1 / Math.sqrt(k)); c.translate(-cx, -cy); K.chip(stage, b, o); c.restore();
}
/** chip that springs in (backOut from 0.6× at t0, 0.3 s) */
export function chipPop(stage, b, t, t0, o = {}) {
  const q = clamp((t - t0) / 0.3); if (q <= 0) return;
  const c = stage.ctx, [cx, cy] = centre(b), s = 0.6 + 0.4 * backOut(q);
  c.save(); c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy); K.chip(stage, b, {...o, a: (o.a ?? 1) * clamp(q * 3)}); c.restore();
}

// ---------------------------------------------------------------------------------------------
// tiles and pictures
// ---------------------------------------------------------------------------------------------
const rgbS = (a, k = 1) => `rgb(${a.map(v => Math.round(clamp(v * k, 0, 255))).join(',')})`;
export const TILE = M.RGB.map(c => ({face: rgbS(c), top: rgbS(c.map(v => v + 40)), bot: rgbS(c, 0.55)}));
/** text colour on a palette code */
export const onCode = k => ([3, 4, 6, 7].includes(k) ? '#04090D' : PAL.ink);
/** one matte tile (code k) at x, y, size s */
export function tile(c, k, x, y, s, a = 1) {
  if (a <= 0) return; const T = TILE[k], g = Math.max(0.6, s * 0.035);
  const draw = () => {
    c.fillStyle = T.face; c.fillRect(x + g, y + g, s - 2 * g, s - 2 * g);
    if (s >= 10) { c.fillStyle = T.top; c.fillRect(x + g, y + g, s - 2 * g, Math.max(1, s * 0.04)); c.fillStyle = T.bot; c.fillRect(x + g, y + s - g - Math.max(1, s * 0.05), s - 2 * g, Math.max(1, s * 0.05)); }
  };
  if (a < 1) K.withAlpha(c, a, draw); else draw();
}
/** board frame (dark plate) + faint ghost grid */
export function boardPlate(stage, R, {a = 1, grid = 1} = {}) {
  if (a <= 0) return; const c = stage.ctx, s = R.w / G;
  K.withAlpha(c, a, () => {
    c.fillStyle = '#02070A'; c.fillRect(R.x - 6, R.y - 6, R.w + 12, R.h + 12);                       // empty slots: darker than any panel
    c.strokeStyle = K.rgba(PAL.muted, 0.35); c.lineWidth = 1.5; c.strokeRect(R.x - 6, R.y - 6, R.w + 12, R.h + 12);
    if (grid > 0) { c.save(); c.strokeStyle = K.rgba(PAL.muted, 0.22 * grid); c.lineWidth = 1; const d = Math.max(1.5, s / 10); c.setLineDash([d, d * 1.6]); c.beginPath();
      for (let i = 0; i <= G; i++) { c.moveTo(R.x + i * s, R.y); c.lineTo(R.x + i * s, R.y + R.h); c.moveTo(R.x, R.y + i * s); c.lineTo(R.x + R.w, R.y + i * s); }
      c.stroke(); c.restore(); }
  });
}
/**
 * tiles of a board: codes[400]; show(i) → alpha (or a count n: cells 0..n−1). o = {a, mod(i) → {dx, dy, s (scale), a}}.
 */
export function boardTiles(stage, R, codes, show = N, o = {}) {
  const c = stage.ctx, s = R.w / G, a = o.a ?? 1; if (a <= 0) return;
  for (let i = 0; i < N; i++) {
    let al = typeof show === 'number' ? (i < show ? 1 : 0) : show(i); if (al <= 0 || codes[i] == null || codes[i] < 0) continue;
    let x = R.x + (i % G) * s, y = R.y + Math.floor(i / G) * s, ss = s;
    if (o.mod) { const m = o.mod(i); if (m) { if (m.a != null) al *= m.a; x += m.dx || 0; y += m.dy || 0; if (m.s) { x += ss * (1 - m.s) / 2; y += ss * (1 - m.s) / 2; ss *= m.s; } } }
    tile(c, codes[i], x, y, ss, al * a);
  }
}
export const cellRect = (R, i) => { const s = R.w / G; return {x: R.x + (i % G) * s, y: R.y + Math.floor(i / G) * s, w: s, h: s}; };
export const cellC = (R, i) => { const r = cellRect(R, i); return [r.x + r.w / 2, r.y + r.h / 2]; };
/** a square [r,g,b] picture (40×40 or 80×80) drawn crisp (nearest neighbour, cached canvas) */
const IMG = new Map();
export function picImg(stage, R, pix, a = 1, key = null) {
  if (a <= 0) return; let cv = key && IMG.get(key);
  if (!cv) {
    const m = Math.round(Math.sqrt(pix.length)); cv = createCanvas(m, m); const cc = cv.getContext('2d'), im = cc.createImageData(m, m);
    pix.forEach((p, i) => { im.data[4 * i] = p[0]; im.data[4 * i + 1] = p[1]; im.data[4 * i + 2] = p[2]; im.data[4 * i + 3] = 255; });
    cc.putImageData(im, 0, 0); if (key) IMG.set(key, cv);
  }
  const c = stage.ctx; K.withAlpha(c, a, () => { c.save(); c.imageSmoothingEnabled = false; c.drawImage(cv, R.x, R.y, R.w, R.h); c.restore(); });
}
/** "back to a picture": tiles → Scale2x once (40×40) → twice (80×80); the stair-steps round off. q 0 → 1 */
export function meltPic(stage, R, codes, q, key, tilesFn) {
  const q1 = clamp(q * 2), q2 = clamp(q * 2 - 1);
  if (q1 < 1) tilesFn(1 - q1);
  if (q1 > 0 && q2 < 1) picImg(stage, R, M.decode40(codes), q1 * (q2 > 0 ? 1 : 1), key + '-40');
  if (q2 > 0) picImg(stage, R, M.decode(codes), q2, key + '-80');
}
// ---------------------------------------------------------------------------------------------
// the draw strip (palette-coloured segments, width = probability, code numbers where they fit)
// ---------------------------------------------------------------------------------------------
export function panelP(stage, a = 1, r = PANEL) { if (a > 0) K.withAlpha(stage.ctx, a, () => K.rect(stage.ctx, r.x, r.y, r.w, r.h, 10, K.rgba('#03141C', 0.8), PAL.panelEdge, 1.4)); }
const cumX = (dist, x0, x1) => { const xs = [x0]; for (const p of dist) xs.push(xs[xs.length - 1] + p * (x1 - x0)); return xs; };
export const uX = (u, x0 = SX0, x1 = SX1) => x0 + clamp(u) * (x1 - x0);
export const segXc = (dist, k, x0 = SX0, x1 = SX1) => { const xs = cumX(dist, x0, x1); return (xs[k] + xs[k + 1]) / 2; };
/**
 * dist[8] (or labelled segs [{label, p, col}]) → strip at y. o = {a, u (landed marker), pick (hi), ghost (old dist,
 * dashed dividers), x0, x1, h, ticks, labelSize}
 */
export function strip(stage, dist, o = {}) {
  const c = stage.ctx, a = o.a ?? 1, y = o.y ?? STRIP_Y, h = o.h ?? STRIP_H, x0 = o.x0 ?? SX0, x1 = o.x1 ?? SX1; if (a <= 0) return;
  const segs = dist.map((d, k) => (typeof d === 'number' ? {p: d, code: k, label: String(k)} : d));
  const xs = cumX(segs.map(s => s.p), x0, x1), size = o.labelSize ?? 34;
  K.withAlpha(c, a, () => {
    c.beginPath(); c.roundRect(x0, y, x1 - x0, h, 9); c.fillStyle = '#0B1419'; c.fill(); c.strokeStyle = K.rgba(PAL.muted, 0.35); c.lineWidth = 1.5; c.stroke();
    segs.forEach((g, k) => {
      const sx = xs[k], sw = xs[k + 1] - xs[k]; if (sw < 0.4) return;
      const T = g.code != null ? TILE[g.code] : {face: g.col || '#5C3B12', top: g.col || '#5C3B12', bot: '#2a1a08'};
      const gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, T.top); gr.addColorStop(0.12, T.face); gr.addColorStop(1, T.bot);
      c.beginPath(); c.roundRect(sx + 0.5, y + 1, Math.max(0.6, sw - 1), h - 2, Math.min(6, sw / 2)); c.fillStyle = gr; c.fill();
      if (sw > 3) { c.strokeStyle = K.rgba('#000000', 0.55); c.lineWidth = 1; c.stroke(); }
    });
    if (o.ghost) { const gx = cumX(o.ghost, x0, x1); K.withAlpha(c, o.ghostA ?? 0.7, () => gx.slice(1, -1).forEach((x, k) => { if (o.ghost[k] > 0.004) K.line(c, [[x, y - 10], [x, y + h + 10]], K.rgba(PAL.hot, 0.85), 1.5, {dash: [4, 4]}); })); }
    if (o.pick != null && o.pick >= 0) { const sx = xs[o.pick], sw = Math.max(3, xs[o.pick + 1] - sx); c.beginPath(); c.roundRect(sx - 1, y - 1, sw + 2, h + 2, 7); c.strokeStyle = K.rgba(PAL.hot, 0.95 * (o.pickA ?? 1)); c.lineWidth = 3; c.stroke(); }
    segs.forEach((g, k) => {
      const sx = xs[k], sw = xs[k + 1] - xs[k], lab = g.label; if (!lab) return;
      const lw = stage.measure(lab, {size, weight: 700}); if (lw + 10 > sw) return;          // too narrow: hide, never shrink
      stage.text(lab, sx + sw / 2, y + h / 2, {size, weight: 700, align: 'center', color: g.code != null ? onCode(g.code) : PAL.ink});
    });
    if (o.ticks !== false) for (const f of [0, 0.5, 1]) { const tx = x0 + f * (x1 - x0); K.line(c, [[tx, y + h + 2], [tx, y + h + 11]], K.rgba(PAL.muted, 0.7), 1.4);
      stage.text(Math.round(f * 100) + '%', tx, y + h + 38, {size: 30, weight: 500, color: PAL.muted, align: f === 0 ? 'left' : f === 1 ? 'right' : 'center'}); }
    if (o.u != null) { const ux = uX(o.u, x0, x1); K.withAlpha(c, o.uA ?? 1, () => { K.line(c, [[ux, y - 6], [ux, y + h + 4]], PAL.warm, 2.5); c.beginPath(); c.moveTo(ux - 15, y - 34); c.lineTo(ux + 15, y - 34); c.lineTo(ux, y - 6); c.closePath(); c.fillStyle = PAL.warm; c.fill(); }); }
  });
  return xs;
}
/** marker falling onto the strip (tip at y − 6 when q = 1) */
export function fallingMarker(stage, u, q, a = 1, o = {}) {
  if (a <= 0 || q <= 0 || q >= 1) return;
  const c = stage.ctx, y = o.y ?? STRIP_Y, x = uX(u, o.x0 ?? SX0, o.x1 ?? SX1), hh = o.h ?? 90, tip = y - 6 - hh * (1 - drop(q));
  if (q < 0.72) streak(stage, [x, tip - 24 - hh * 0.6], [x, tip - 24], 1, {len: 1, w: 5, a: 0.35 * a});
  K.withAlpha(c, a * smooth(q / 0.15), () => { c.beginPath(); c.moveTo(x - 15, tip - 28); c.lineTo(x + 15, tip - 28); c.lineTo(x, tip); c.closePath(); c.fillStyle = PAL.warm; c.fill(); });
}
/** strip division morph (springs from old to new cumulative boundaries) */
export function morphDist(oldD, newD, q) {
  if (!oldD || q >= 1) return newD;
  const e = spring(clamp(q)), co = [0], cn = [0]; oldD.forEach(p => co.push(co[co.length - 1] + p)); newD.forEach(p => cn.push(cn[cn.length - 1] + p));
  const out = []; let prev = 0;
  for (let k = 0; k < newD.length; k++) { const x = k === newD.length - 1 ? 1 : clamp(lerp(co[k + 1], cn[k + 1], e), prev, 1); out.push(x - prev); prev = x; }
  return out;
}

// ---------------------------------------------------------------------------------------------
// board runs
// ---------------------------------------------------------------------------------------------
/**
 * makeBoardRun(run, picks, o) — run = model generate() result; picks[i] = time the marker lands for cell i (cells with
 * no time are not shown by this run). o.fall(i) = marker fall time (default min(0.3, 0.6 · gap)).
 */
export function makeBoardRun(run, picks, o = {}) {
  const S = run.steps.map((s, i) => ({...s, tPick: picks[i]})).filter(s => s.tPick != null);
  S.forEach((s, k) => { const gap = k ? s.tPick - S[k - 1].tPick : 0.6; s.tSwitch = k ? S[k - 1].tPick + Math.min(0.08, gap * 0.25) : s.tPick - (o.first ?? 0.6); s.tDrop = Math.max(s.tSwitch + 0.02, s.tPick - Math.min(o.fallMax ?? 0.32, 0.6 * gap)); });
  const R = {run, S, codes: run.codes, t0: S.length ? S[0].tSwitch : 0, done: S.length ? S[S.length - 1].tPick : 0};
  const T = new Float64Array(N).fill(Infinity); for (const s of S) T[s.i] = s.tPick;
  R.T = T;
  R.cur = t => { let lo = 0, hi = S.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S[m].tSwitch <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  R.filled = t => { let n = 0; for (const s of S) if (s.tPick <= t) n++; return n; };
  return R;
}
/**
 * draw a board run at t: tiles (with a pop + ring when placed), and (o.strip) the strip in its panel with the current
 * cell's division, falling marker, landed marker, flash. Board inside world (cam), strip on screen.
 * o = {R (board rect), G (glow), cam, strip (bool), stripA, pre (codes shown before the run, e.g. previous fills), head
 *  (show the writing-head outline), slow (bool: show the falling marker), rings (Set of cells to ring after landing)}
 * Call boardTiles part inside world(), strip part outside: drawBoardRun returns {k, s} for the strip; use stripOf().
 */
export function runTiles(stage, t, BR, o = {}) {
  const R = o.R || BOARD, c = stage.ctx, s = R.w / G;
  boardTiles(stage, R, BR.codes, i => (BR.T[i] <= t ? 1 : 0), {a: o.a ?? 1, mod: i => {
    const dt = t - BR.T[i]; if (dt > 0.25) return null; const q = clamp(dt / 0.18); return {s: lerp(1.35, 1, backOut(q))};
  }});
  // writing head: thin warm outline on the next cell
  const k = BR.cur(t), st = k >= 0 ? BR.S[k] : null;
  if (o.head !== false && st && t < st.tPick && t < BR.done + 0.01) { const r = cellRect(R, st.i); K.withAlpha(c, o.a ?? 1, () => { c.strokeStyle = K.rgba(PAL.warm, 0.95); c.lineWidth = Math.max(2, s * 0.08); c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }); }
  if (o.rings) for (const i of o.rings) if (BR.T[i] <= t) { const [x, y] = cellC(R, i); ringPop(stage, x, y, t, BR.T[i], {r0: s * 0.4, r1: s * 1.4, a: 0.9, w: 2.5, d: o.ringD ?? 0.5}); }
  // flash on the landed tile (glow, screen coords)
  if (o.G && st) for (const q of [k, k - 1]) { const sq = BR.S[q]; if (!sq) continue; const fl = K.hitFlash(t, sq.tPick, o.flashD ?? 0.3); if (fl > 0) { const [x, y] = camPt(o.cam || FULL, ...cellC(R, sq.i)); K.splatBurst(o.G.GW, x, y, s * 0.9 * (o.cam?.z || 1), 0.55 * fl * (o.a ?? 1)); } }
  return {k, st};
}
/** the strip for a board run at t (screen layer) */
export function runStrip(stage, t, BR, o = {}) {
  const k = BR.cur(t); if (k < 0) return; const st = BR.S[k], a = o.a ?? 1, landed = t >= st.tPick;
  panelP(stage, a);
  const prev = k > 0 ? BR.S[k - 1].dist : o.prevDist, md = Math.max(0.05, Math.min(0.3, st.tDrop - st.tSwitch + 0.05));
  const d = prev ? morphDist(prev, st.dist, (t - st.tSwitch) / md) : st.dist;
  strip(stage, d, {a, u: landed && st.u != null ? st.u : null, pick: landed ? st.pick : null});
  if (!landed && st.u != null && t >= st.tDrop && o.fall !== false) fallingMarker(stage, st.u, (t - st.tDrop) / Math.max(0.03, st.tPick - st.tDrop), a);
  if (landed && o.G) { const fl = K.hitFlash(t, st.tPick, 0.3); if (fl > 0) K.splatBurst(o.G.GW, segXc(st.dist, st.pick), STRIP_Y + STRIP_H / 2, 26, 0.6 * fl * a); }
  if (landed && st.u != null) ringPop(stage, uX(st.u), STRIP_Y - 6, t, st.tPick, {a: 0.6 * a});
}
/** evenly spaced pick times for a list of cells: [{n (cells), dt (s per cell)}] from t0 → picks[400] (undefined elsewhere) */
export function schedule(cells, t0, phases) {
  const picks = []; let t = t0, j = 0;
  for (const ph of phases) for (let m = 0; m < ph.n && j < cells.length; m++, j++) { t += ph.dt; picks[cells[j]] = t; }
  return picks;
}
/** the speed (×) of the phase a time falls in: phases with absolute [t0, t1, mult] */
export const multAt = (t, spans) => { for (const [a, b, m] of spans) if (t >= a && t < b) return m; return null; };

// ---------------------------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------------------------
export function big(stage, val, unit, t, t0, a = 1, o = {}) { K.bigNum(stage, val, unit, t, t0, a, {x: 1010, y: 1040, size: 96, ...o}); }
/** matte rounded slab */
export function slab(c, x, y, w, h, r, top, bot, edge = null) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bot);
  c.beginPath(); c.roundRect(x, y, Math.max(w, 0.1), h, Math.min(r, w / 2, h / 2)); c.fillStyle = g; c.fill();
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1.5; c.stroke(); }
  if (w > 2 * r) { K.line(c, [[x + r, y + 1.5], [x + w - r, y + 1.5]], K.rgba('#FFFFFF', 0.16), 1); K.line(c, [[x + r, y + h - 1.5], [x + w - r, y + h - 1.5]], K.rgba('#000000', 0.45), 2); }
}
/** thin matte machine body above the strip ("GPT" label plate) — PLAN §2: a slim body with a name tag over the strip */
export function machineBar(stage, a = 1, busy = 0) {
  if (a <= 0) return; const c = stage.ctx, x = 70, y = 1106 - 0, w = 940;
  K.withAlpha(c, a, () => {
    const lx = 470, lw = 140;
    slab(c, lx, y - 52, lw, 46, 10, '#33444C', '#222F35', K.rgba(PAL.muted, 0.35));
    stage.text('GPT', lx + lw / 2, y - 29, {role: 'display', weight: 700, size: 32, color: PAL.ink, align: 'center'});
    for (let i = 0; i < 3; i++) { const lv = clamp(busy * 3 - i); K.line(c, [[lx + 22 + i * 36, y - 12], [lx + 46 + i * 36, y - 12]], lv > 0 ? K.mix('#2E3E46', PAL.warm, lv) : '#2E3E46', 4, {cap: 'round'}); }
  });
}
export {K, M};

// ---------------------------------------------------------------------------------------------
// the "line": prompt chips (left-aligned) followed by the picture's 400 pieces, wrapped like text
// ---------------------------------------------------------------------------------------------
const LL = new Map();
/** → {chips (boxes), slots [400] {x, y, s}} ; ts = piece size, pitch = ts + gap */
export function lineLayout(prompt, ts = 32, pitch = 36, y0 = CH.y0) {
  const key = prompt.join('|') + ts + ':' + pitch + ':' + y0; let v = LL.get(key); if (v) return v;
  const chips = lay(prompt, {...CH, y0, center: false}), last = chips[chips.length - 1], slots = [];
  let x = last.x + last.w + 16, y = last.y + (last.h - ts) / 2;
  const rowY0 = last.y + last.h + 16;
  for (let i = 0; i < N; i++) {
    if (x + ts > CH.x1) { x = CH.x0; y = slots.length && y < rowY0 ? rowY0 : y + pitch; }
    slots.push({x, y, s: ts}); x += pitch;
  }
  v = {chips, slots}; LL.set(key, v); return v;
}
/** a picture piece: a matte tile with its code number (number shown when its screen size ≥ minPx) */
export function piece(stage, k, x, y, s, {a = 1, num = 0, z = 1} = {}) {
  if (a <= 0) return; tile(stage.ctx, k, x, y, s, a);
  const fs = s * 0.6; if (num > 0 && fs * z >= 30) stage.text(String(k), x + s / 2, y + s / 2 + 1, {size: fs, weight: 700, align: 'center', color: onCode(k), alpha: a * num});
}
