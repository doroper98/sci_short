// 46 — token (s06–s09), line (s10), learn (s11). PLAN.md §3.
// Exports: scenes {token, line, learn}, titles, planToken(tl, P), soundToken(tl, P), signature(P).
import * as K from '../gpt-generative/kit.mjs';
import * as M from './model.mjs';
import {CH, BOARD, FULL, WIN, WIN_P, STRIP_Y, STRIP_H, SX0, SX1, G, N, lay, centre, chipAt, chipPop, boardPlate, boardTiles, tile, cellRect, cellC,
  picImg, meltPic, panelP, strip, frameBoxes, edgeA, world, camAt, camPt, ringPop, rollNum, backOut, spring, streak, slab, lineLayout, piece, onCode, TILE} from './parts.mjs';
import {MAIN, bigPlate} from './scenes_draw.mjs';
import {LINE} from './scenes_intro.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, fadeIn, fadeOut, hitFlash} = K;
const PROMPT = ['불을', '뿜는', '아기', '용'];
const Q = M.SMOOTH_CODES;                                            // the quantized picture (cell mean → nearest code)
const SW = Array.from({length: 8}, (_, k) => ({x: SX0 + k * (SX1 - SX0) / 8 + 5, y: STRIP_Y, w: (SX1 - SX0) / 8 - 10, h: STRIP_H}));
const LINE2 = lineLayout(PROMPT, 32, 36);
const rc = (r, c) => r * G + c;
const groupBox = (r0, c0, r1, c1) => { const a = cellRect(BOARD, rc(r0, c0)), b = cellRect(BOARD, rc(r1, c1)); return {x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y}; };

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planToken(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  const T = {};
  T.s = SC.token.start;
  T.back = i => T.s + 0.05 + 0.0018 * i;                              // the line's pieces fly back into the board
  T.melt = [T.s + 1.1, T.s + 1.9];
  T.cut0 = W_('s06', '바둑판처럼'); T.cutDt = 0.06;
  T.cutV = i => T.cut0 + T.cutDt * (i - 1); T.cutH = i => T.cut0 + T.cutDt * (18 + i);
  T.cutEnd = T.cutH(19) + 0.12;
  T.sw = W_('s07', '무늬'); T.wave0 = W_('s07', '가장'); T.waveAt = i => T.wave0 + 0.035 * (Math.floor(i / G) + (i % G));
  T.waveEnd = T.waveAt(N - 1) + 0.2;
  T.links = W_('s07', '찾아'); T.nums = W_('s07', '번호를');
  T.linkCells = [rc(8, 8), rc(5, 9), rc(11, 9), rc(9, 15)];
  T.camGroup = frameBoxes([groupBox(4, 6, 12, 15)], {win: WIN_P, zMax: 1.6});
  T.merge = [W_('s08', '목록에서'), W_('s08', '고르는')];
  T.all = [W_('s08', '번호로') - 0.6, P.tl.at('s08:end') + 0.85];
  T.scan = [W_('s07', '칸마다'), T.sw - 0.1];
  T.camL = frameBoxes([groupBox(1, 0, 15, 10)], {win: WIN_P, zMax: 1.6}); T.camR = frameBoxes([groupBox(1, 9, 15, 19)], {win: WIN_P, zMax: 1.6});
  T.n1024 = W_('s09', '천스물네개'); T.n8192 = W_('s09', '팔천백아흔두가지');
  T.camWide = {cx: BOARD.x + BOARD.w / 2, cy: BOARD.y + BOARD.h / 2 + 30, z: 0.62};
  T.cam = [{t: T.s, ...FULL}, {t: T.nums - 0.35, ...FULL}, {t: T.nums + 0.15, ...T.camGroup}, {t: T.merge[0] - 0.45, ...T.camGroup}, {t: T.merge[0], ...FULL},
    {t: T.all[0], ...FULL}, {t: T.all[0] + 0.45, ...T.camL}, {t: T.all[0] + 0.9, ...T.camL}, {t: T.all[1] - 0.5, ...T.camR}, {t: T.all[1], ...FULL},
    {t: T.n1024 - 0.1, ...FULL}, {t: T.n1024 + 0.8, ...T.camWide}, {t: SC.token.end, ...T.camWide}];
  P.token = T;
  // ---------------- line
  const L = {};
  L.s = SC.line.start; L.reset = [L.s, L.s + 0.55];
  L.row0 = W_('s10', '번호'); L.rows = W_('s10', '한'); L.chips = W_('s10', '글');
  L.leave = i => { const r = Math.floor(i / G); return r === 0 ? L.row0 + 0.05 * i : L.rows + 0.075 * (r - 1) + 0.004 * (i % G); };
  L.flight = i => (i < G ? 0.5 : 0.35);
  L.done = L.leave(N - 1) + L.flight(N - 1);
  const firstRow = LINE2.slots.slice(0, G).map(s => ({x: s.x, y: s.y, w: s.s, h: s.s}));
  L.camRow = frameBoxes(firstRow.slice(0, 10), {zMax: 1.6});
  L.cam = [{t: L.s, ...T.camWide}, {t: L.reset[1], ...FULL}, {t: L.row0 + 0.2, ...FULL}, {t: L.row0 + 0.7, ...L.camRow}, {t: L.rows - 0.1, ...L.camRow}, {t: L.rows + 0.8, ...FULL},
    {t: L.done + 0.2, ...FULL}, {t: SC.line.end, cx: 540, cy: 760, z: 1.06}];
  P.line = L;
  // ---------------- learn
  const E = {};
  E.s = SC.learn.start; E.gather = [E.s, E.s + 0.6];
  E.flow0 = E.s + 0.35; E.catch = [W_('s11', '이억오천만장') - 0.2, W_('s11', '이억오천만장') + 0.6];
  E.count = W_('s11', '이억오천만장');
  E.cells = [137, 178, 218];
  E.rev = E.cells.map((_, k) => W_('s11', '설명 뒤에') + 0.2 + 0.6 * k);
  E.full = E.rev[2] + 0.75; E.who = W_('s11', '가르쳤습니다');
  P.learn = E;
  return P;
}

// =====================================================================================================
// TOKEN
// =====================================================================================================
function cutLines(stage, R, t, T) {
  const c = stage.ctx, s = R.w / G;
  K.withAlpha(c, 1, () => {
    for (let i = 1; i < G; i++) {
      const qv = clamp((t - T.cutV(i)) / 0.12), qh = clamp((t - T.cutH(i)) / 0.12);
      if (qv > 0) K.line(c, [[R.x + i * s, R.y], [R.x + i * s, R.y + R.h * qv]], '#03141C', 2.2);
      if (qh > 0) K.line(c, [[R.x, R.y + i * s], [R.x + R.w * qh, R.y + i * s]], '#03141C', 2.2);
    }
  });
}
function swatch(stage, k, b, a = 1, pop = 1) {
  if (a <= 0) return; const c = stage.ctx, [cx, cy] = centre(b), sc = 0.6 + 0.4 * backOut(pop);
  c.save(); c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy);
  K.withAlpha(c, a * clamp(pop * 3), () => { const T = TILE[k], g = c.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, T.top); g.addColorStop(0.12, T.face); g.addColorStop(1, T.bot);
    c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 8); c.fillStyle = g; c.fill(); c.strokeStyle = K.rgba(PAL.muted, 0.45); c.lineWidth = 1.5; c.stroke();
    stage.text(String(k), cx, cy, {size: 34, weight: 700, align: 'center', color: onCode(k)}); });
  c.restore();
}
/** numbers on the cells that are fully inside the window */
function cellNumbers(stage, R, codes, cam, a, win = WIN_P, filter = null) {
  if (a <= 0) return; const s = R.w / G;
  for (let i = 0; i < N; i++) { if (filter && !filter(i)) continue; const r = cellRect(R, i), ea = edgeA(cam, r, win) ** 4; if (ea <= 0) continue;
    stage.text(String(codes[i]), r.x + s / 2, r.y + s / 2 + 1, {size: s * 0.6, weight: 700, align: 'center', color: onCode(codes[i]), alpha: a * ea}); }
}
const WALL = (() => { const r = K.rng(31), cols = 128, rows = 64, out = [];
  for (let i = 0; i < cols * rows; i++) { const k = 2 + Math.floor(r() * 6), b = M.RGB[k], j = 0.75 + 0.5 * r(); out.push(`rgb(${b.map(v => Math.round(Math.min(255, v * j))).join(',')})`); } return {cols, rows, out}; })();
function wall(stage, rect, a = 1) {
  if (a <= 0) return; const c = stage.ctx, cw = rect.w / WALL.cols, ch = rect.h / WALL.rows;
  K.withAlpha(c, a, () => { for (let y = 0; y < WALL.rows; y++) for (let x = 0; x < WALL.cols; x++) { c.fillStyle = WALL.out[y * WALL.cols + x]; c.fillRect(rect.x + x * cw, rect.y + y * ch, Math.max(0.6, cw - 0.8), Math.max(0.6, ch - 0.8)); } });
}
function tokenScene(stage, t, p, ctx) {
  const P = ctx.P, T = P.token, O = P.origin, c = stage.ctx, cam = camAt(t, T.cam), meltQ = clamp((t - T.melt[0]) / (T.melt[1] - T.melt[0]));
  const panelOn = t >= T.sw - 0.3;
  world(stage, cam, () => {
    // the line's chips fade, its pieces fly back into the board
    LINE.chips.forEach(b => K.chip(stage, b, {kind: 'given', a: fadeOut(t, T.s + 0.1, 0.4), dim: 0.7}));
    boardPlate(stage, BOARD, {grid: 0});
    if (meltQ < 1) for (let i = 0; i < N; i++) {
      const q = clamp((t - T.back(i)) / 0.35), sl = LINE.slots[i], to = cellRect(BOARD, i), e = easeInOut(q);
      const x = lerp(sl.x, to.x, e), y = lerp(sl.y, to.y, e), s = lerp(sl.s, to.w, e);
      K.withAlpha(c, (q > 0 ? 1 : 0.35) * (1 - meltQ), () => tile(c, MAIN.codes[i], x, y, s));
    }
    if (meltQ > 0) picImg(stage, BOARD, M.SMOOTH, meltQ, 'smooth-80');
    // quantize wave: cells turn into flat tiles (nearest palette code of the cell's mean colour)
    for (let i = 0; i < N; i++) { const ts = T.waveAt(i); if (t < ts) continue; const r = cellRect(BOARD, i), q = clamp((t - ts) / 0.2), k = lerp(1.3, 1, backOut(q)); tile(c, Q[i], r.x - r.w * (k - 1) / 2, r.y - r.w * (k - 1) / 2, r.w * k); }
    // "칸마다": a cool frame runs over the cells in raster order (faster and faster)
    if (t >= T.scan[0] && t < T.scan[1]) { const q = (t - T.scan[0]) / (T.scan[1] - T.scan[0]), i = Math.min(N - 1, Math.floor(N * q * q)), r = cellRect(BOARD, i);
      c.strokeStyle = K.rgba(PAL.coolHi, 0.95); c.lineWidth = 3; c.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
    if (t >= T.cut0 && t < T.wave0 + 1.6) K.withAlpha(c, fadeOut(t, T.wave0 + 1.0, 0.5), () => cutLines(stage, BOARD, t, T));
    // numbers: on the close-up group (s07) and over the whole picture while the camera pans (s08)
    const na = smooth((t - T.nums) / 0.3) * fadeOut(t, T.merge[0] - 0.5, 0.25) + smooth((t - T.all[0] - 0.5) / 0.3) * fadeOut(t, T.all[1] - 0.45, 0.25);
    cellNumbers(stage, BOARD, Q, cam, na);
    // s09: DALL·E's 32 × 32 grid around the 20 × 20 board
    const ga = smooth((t - T.n1024) / 0.6) * fadeOut(t, T.n8192 - 0.2, 0.4);
    if (ga > 0) { const s = BOARD.w / G, n = 32, x0 = BOARD.x + BOARD.w / 2 - n * s / 2, y0 = BOARD.y + BOARD.h / 2 - n * s / 2, gq = easeInOut(clamp((t - T.n1024) / 0.8));
      K.withAlpha(c, ga, () => { c.strokeStyle = K.rgba(PAL.cool, 0.35); c.lineWidth = 1.5 / cam.z; c.beginPath();
        const half = lerp(10, 16, gq) * s, cx = BOARD.x + BOARD.w / 2, cy = BOARD.y + BOARD.h / 2;
        for (let i = 0; i <= n; i++) { const u = -half + i * (2 * half / n); c.moveTo(cx + u, cy - half); c.lineTo(cx + u, cy + half); c.moveTo(cx - half, cy + u); c.lineTo(cx + half, cy + u); }
        c.stroke(); c.strokeStyle = K.rgba(PAL.cool, 0.8); c.lineWidth = 3 / cam.z; c.strokeRect(cx - half, cy - half, 2 * half, 2 * half); }); }
  }, panelOn ? WIN_P.y1 : WIN.y1);
  // screen: links from 4 cells to their swatches, the swatches (list) → strip, then the wall of 8,192
  const mq = clamp((t - T.merge[0]) / (T.merge[1] - T.merge[0])), wq = clamp((t - T.n8192) / 0.9), wA = fadeOut(t, P.sc.token.end - 0.1, 0.3);
  if (panelOn) {
    panelP(stage, smooth((t - T.sw + 0.3) / 0.3) * (1 - smooth(wq * 3)));
    if (mq < 1) SW.forEach((b, k) => swatch(stage, k, {...b, x: lerp(b.x, SX0 + k * (SX1 - SX0) / 8, mq), w: lerp(b.w, (SX1 - SX0) / 8, mq)}, 1, clamp((t - T.sw - 0.08 * k) / 0.3)));
    else if (wq < 1) strip(stage, Array(8).fill(1 / 8), {a: 1 - smooth(wq * 2)});
    const la = smooth((t - T.links) / 0.3) * fadeOut(t, T.merge[0] - 0.3, 0.3);
    if (la > 0) T.linkCells.forEach((i, j) => { const q = clamp((t - T.links - 0.08 * j) / 0.35), [x0, y0] = camPt(cam, ...cellC(BOARD, i)), b = SW[Q[i]], to = [b.x + b.w / 2, b.y - 4];
      K.withAlpha(c, la, () => { K.line(c, [[x0, y0], [lerp(x0, to[0], q), lerp(y0, to[1], q)]], K.rgba(PAL.cool, 0.85), 2); K.circle(c, x0, y0, 5, PAL.coolHi); }); });
  }
  if (wq > 0) { const e = easeInOut(wq), r = {x: SX0, y: lerp(STRIP_Y, 450, e), w: SX1 - SX0, h: lerp(STRIP_H, STRIP_Y + STRIP_H - 450, e)}; wall(stage, r, wA); }
  // big numbers (one at a time), top centre over the pulled-back view
  if (t >= T.n1024 && t < T.n8192 - 0.1) bigPlate(stage, rollNum(1024, clamp((t - T.n1024) / 0.8)), '개', t, T.n1024, fadeOut(t, T.n8192 - 0.35, 0.25), {x: 760, y: 420, size: 84});
  if (t >= T.n8192) bigPlate(stage, rollNum(8192, clamp((t - T.n8192) / 0.9)), '가지', t, T.n8192, wA, {x: 760, y: 420, size: 84});
}

// =====================================================================================================
// LINE
// =====================================================================================================
function lineScene(stage, t, p, ctx) {
  const P = ctx.P, L = P.line, T = P.token, c = stage.ctx, cam = camAt(t, L.cam), rq = clamp((t - L.reset[0]) / (L.reset[1] - L.reset[0]));
  world(stage, cam, () => {
    // pieces: from the board cells to the line slots, row 0 first (big, numbered), then the rest row by row
    boardPlate(stage, BOARD, {a: 1 - smooth((t - L.rows - 0.6) / 0.5), grid: 1});
    let landed = 0;
    for (let i = 0; i < N; i++) {
      const q = clamp((t - L.leave(i)) / L.flight(i)), from = cellRect(BOARD, i), sl = LINE2.slots[i], e = easeInOut(q);
      const x = lerp(from.x, sl.x, e), y = lerp(from.y, sl.y, e) - (i < G ? 80 : 30) * Math.sin(Math.PI * e), s = lerp(from.w, sl.s, e);
      if (q >= 1) landed++;
      if (q > 0 && q < 1 && i % 2 === 0) streak(stage, [from.x + from.w / 2, from.y + from.h / 2], [x + s / 2, y + s / 2], 1, {len: 0.3, w: s * 0.35, a: 0.2, color: M.PALETTE[Q[i]].hex});
      piece(stage, Q[i], x, y, s, {num: i < G ? smooth((t - L.leave(i) - L.flight(i) + 0.1) / 0.2) : 0, z: cam.z});
    }
    // the prompt chips attach in front of the pieces
    LINE2.chips.forEach((b, i) => chipPop(stage, b, t, L.chips + 0.06 * i, {kind: 'given', a: edgeA(cam, b) ** 6}));
    if (t >= L.chips + 0.3) { const b = LINE2.chips[3]; ringPop(stage, b.x + b.w + 8, b.y + b.h / 2, t, L.chips + 0.3, {r0: 20, r1: 70, a: 0.7}); }
  });
  // the wall shrinks back into the strip (continuity from s09)
  if (rq < 1) { const e = easeInOut(rq), r = {x: SX0, y: lerp(450, STRIP_Y, e), w: SX1 - SX0, h: lerp(STRIP_Y + STRIP_H - 450, STRIP_H, e)}; wall(stage, r, 1 - rq); }
  let n = 0; for (let i = 0; i < N; i++) if (t >= L.leave(i) + L.flight(i)) n++;
  if (t >= L.row0 + 0.3) bigPlate(stage, String(n), '조각', t, L.row0 + 0.3, 1, {x: 1046, y: 1052, size: 84});
}

// =====================================================================================================
// LEARN
// =====================================================================================================
const CAPTION = p => `${p.breath}을 뿜는 ${p.what === '용' ? '아기 용' : '고양이'}`;
const COLS = [200, 540, 880], TH = 190, PITCH = 330;
const ITEMS = Array.from({length: 33}, (_, k) => ({p: M.TRAIN[(k * 7) % M.TRAIN.length], col: k % 3, row: Math.floor(k / 3)}));
const CATCH = 16;                                                 // the item that is caught (TRAIN[0] at the centre column)
ITEMS[CATCH] = {p: M.TRAIN[0], col: 1, row: Math.floor(CATCH / 3)};
function learnScene(stage, t, p, ctx) {
  const P = ctx.P, E = P.learn, L = P.line, c = stage.ctx, G_ = glowBegin(), cam = FULL;
  const scroll = u => { const a = Math.max(0, u - E.flow0); return 700 * a + 170 * a * a; };   // accelerating waterfall (px)
  const yOf = it => 1500 + it.row * PITCH - scroll(Math.min(t, E.catch[0]));
  const cq = easeInOut(clamp((t - E.catch[0]) / (E.catch[1] - E.catch[0])));
  const chips = lay(PROMPT), prompt = {what: '용', breath: '불'};
  world(stage, cam, () => {
    // the finished line gathers into a thumbnail that joins the stream
    const gq = clamp((t - E.gather[0]) / (E.gather[1] - E.gather[0]));
    if (gq < 1) { LINE2.chips.forEach(b => K.chip(stage, b, {kind: 'given', a: 1 - gq}));
      for (let i = 0; i < N; i++) { const sl = LINE2.slots[i], ts = TH / G, to = {x: COLS[1] - TH / 2 + (i % G) * ts, y: 900 + Math.floor(i / G) * ts}, e = easeInOut(gq); tile(c, Q[i], lerp(sl.x, to.x, e), lerp(sl.y, to.y, e), lerp(sl.s, ts, e), 1 - smooth((gq - 0.7) / 0.3)); } }
    // the stream of captioned training pictures (upwards, accelerating), the caught one grows into the board
    ITEMS.forEach((it, k) => {
      const caught = k === CATCH && t >= E.catch[0];
      let x = COLS[it.col] - TH / 2, y = yOf(it), w = TH, a = smooth((t - E.flow0) / 0.3);
      if (t >= E.catch[0] && !caught) { y -= 2600 * (t - E.catch[0]) ** 1.5; a *= 1 - cq; }
      if (caught) { const y0 = yOf(it); x = lerp(x, BOARD.x, cq); y = lerp(y0, BOARD.y, cq); w = lerp(TH, BOARD.w, cq); }
      if (y > 1400 || y + w < 200 || a <= 0) return;
      const R = {x, y, w, h: w};
      boardPlate(stage, R, {a, grid: 1});
      if (caught && t < E.full) { const lim = t < E.rev[0] ? E.cells[0] : E.cells.reduce((m, ci, j) => (t >= E.rev[j] ? (E.cells[j + 1] ?? N) : m), E.cells[0]);
        boardTiles(stage, R, it.p.codes, lim, {a});
        const ci = lim < N ? lim : null;
        if (ci != null) { const r = cellRect(R, ci); K.chip(stage, {x: r.x, y: r.y, w: r.w, h: r.h, text: ''}, {kind: 'cover'}); }
        E.cells.forEach((ci2, j) => { if (t >= E.rev[j] + 0.35) { const [cx2, cy2] = cellC(R, ci2); ringPop(stage, cx2, cy2, t, E.rev[j] + 0.35, {r0: 10, r1: 50, a: 0.9}); } });
      } else boardTiles(stage, R, it.p.codes, caught && t >= E.full ? N : N, {a});
      // caption chip under the thumbnail; for the caught one it becomes the prompt line
      if (!caught) { const cb = lay([CAPTION(it.p)], {...CH, size: 30, x0: x - 40, x1: x + w + 40, y0: y + w + 12}); K.chip(stage, {...cb[0], x: x + w / 2 - cb[0].w / 2}, {kind: 'given', a}); }
    });
    // prompt chips (the caught caption) + WHO links
    const pa = smooth((t - E.catch[0] - 0.3) / 0.4) * fadeOut(t, P.sc.learn.end - 0.1, 0.3);
    chips.forEach(b => K.chip(stage, b, {kind: 'given', a: pa}));
    const la = smooth((t - E.who) / 0.4);
    if (la > 0) {
      const q = easeInOut(clamp((t - E.who) / 0.6));
      for (const [ci, kind, col] of [[3, 'what', PAL.cool], [0, 'breath', PAL.warm]]) {
        const from = [chips[ci].x + chips[ci].w / 2, chips[ci].y + chips[ci].h];
        K.withAlpha(c, la * 0.55 * fadeOut(t, P.sc.learn.end - 0.1, 0.3), () => M.WHO.forEach((w, i) => { if (w !== kind || (i % 3)) return; const to = cellC(BOARD, i); K.line(c, [from, [lerp(from[0], to[0], q), lerp(from[1], to[1], q)]], K.rgba(col, 0.8), 1.2); }));
      }
    }
  }, t >= E.rev[0] - 0.4 && t < E.full + 0.4 ? WIN_P.y1 : WIN.y1);
  // the strip for the three reveals: prediction, then the true code lights
  if (t >= E.rev[0] - 0.4 && t < E.full + 0.4) {
    const a = smooth((t - E.rev[0] + 0.4) / 0.3) * fadeOut(t, E.full, 0.35); panelP(stage, a);
    let j = 0; while (j + 1 < E.cells.length && t >= E.rev[j + 1] - 0.45) j++;
    const ci = E.cells[j], d = M.cellDist(ci, prompt, M.TRAIN[0].codes).dist, shown = t >= E.rev[j] + 0.35;
    strip(stage, d, {a, pick: shown ? M.TRAIN[0].codes[ci] : null});
    if (shown) { const fl = hitFlash(t, E.rev[j] + 0.35, 0.3); if (fl > 0) { let acc = 0; for (let k = 0; k < M.TRAIN[0].codes[ci]; k++) acc += d[k]; K.splatBurst(G_.GW, SX0 + (acc + d[M.TRAIN[0].codes[ci]] / 2) * (SX1 - SX0), STRIP_Y + 32, 26, 0.6 * fl * a); } }
  }
  glowFlush(stage);
  if (t >= E.count) { const q = clamp((t - E.count) / 1.0), v = 2.5e8 * (1 - (1 - q) ** 3), eok = Math.floor(v / 1e8), man = Math.floor((v % 1e8) / 1e4);
    const s = q >= 1 ? '2억 5천만' : (eok ? eok + '억 ' : '') + man.toLocaleString('en-US') + '만';
    bigPlate(stage, s, '장', t, E.count, fadeOut(t, E.rev[0] - 0.5, 0.3), {x: 1046, y: 1052, size: 84}); }
}

export const scenes = {token: tokenScene, line: lineScene, learn: learnScene};

export const titles = {
  token: P => { const at = s => P.tl.at(s) - 0.4; return [[-Infinity, '그림 → 조각', '바둑판처럼 칸으로 나눈다'], [at('s07'), '그림 → 조각', '가장 닮은 무늬의 번호'], [at('s08'), '그림 → 조각', '그림도 목록의 번호로'], [at('s09'), 'DALL·E · 2021', '번호의 수, 무늬의 수']]; },
  line: P => [[-Infinity, '그림 → 조각', '번호를 한 줄로']],
  learn: P => [[-Infinity, 'DALL·E', '설명 뒤의 그림 조각을 맞힌다']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundToken(tl, P) {
  const T = P.token, L = P.line, E = P.learn, ev = [];
  ev.push(snd.tone('token_melt', T.melt[0], 196, 0.6, -31, '조각들이 그림판으로 돌아가 부드러운 원래 그림이 됨', {decay: 0.3}));
  ev.push(snd.train('token_cutV', Array.from({length: 19}, (_, i) => [T.cutV(i + 1), 'tick', {freq: 330, decay: 0.03, click: 0, gain_db: 0}]), -31, '세로로 자르는 선이 60 ms 간격으로 그어짐'));
  ev.push(snd.train('token_cutH', Array.from({length: 19}, (_, i) => [T.cutH(i + 1), 'tick', {freq: 294, decay: 0.03, click: 0, gain_db: 0}]), -31, '가로로 자르는 선 — 그림이 400칸이 됨'));
  ev.push(snd.train('token_swatches', Array.from({length: 8}, (_, k) => [T.sw + 0.08 * k, 'tick', {freq: 196 + 30 * k, decay: 0.06, click: 0, gain_db: 0}]), -29, '무늬 목록의 견본 여덟이 차례로 나타남(0~7번)'));
  ev.push(snd.train('token_wave', Array.from({length: 39}, (_, d) => [T.wave0 + 0.035 * d, 'tick', {freq: 220 + 4 * d, decay: 0.03, click: 0, gain_db: 0}]), -32, '왼쪽 위부터 물결처럼 칸들이 가장 닮은 무늬로 바뀜'));
  ev.push(snd.tone('token_links', T.links, 262, 0.3, -30, '칸 넷에서 무늬 목록의 견본으로 선이 이어짐', {decay: 0.15}));
  ev.push(snd.swell('token_nums', T.nums, [147, 220], 0.9, -32, '칸 위에 무늬 번호가 뜸'));
  ev.push(snd.tone('token_merge', T.merge[1], 220, 0.4, -28, '견본들이 붙어 뽑기 띠가 됨(고를 수 있는 목록 = 띠)', {decay: 0.2}));
  ev.push(snd.swell('token_all', T.all[0] + 0.3, [131, 196], 1.6, -33, '그림의 모든 칸에 번호가 뜸'));
  ev.push(snd.swell('token_1024', T.n1024, [110, 165], 1.0, -29, '카메라가 물러나며 32 × 32 = 1,024칸'));
  ev.push(snd.swell('token_8192', T.n8192, [98, 147], 1.1, -29, '띠가 8,192가지 무늬의 벽으로 늘어남'));
  for (let r = 0; r < G; r++) { const t0 = L.leave(r * G + (r ? 0 : G - 1)) + L.flight(r * G); ev.push(snd.tone('line_row' + String(r + 1).padStart(2, '0'), r ? L.leave(r * G) + L.flight(r * G) : L.leave(G - 1) + L.flight(G - 1), 196 + 12 * r, 0.12, r ? -33 : -28, `그림판의 ${r + 1}번째 줄이 풀려 한 줄로 이어짐`, {decay: 0.06})); }
  ev.push(snd.tone('line_chips', L.chips + 0.3, 330, 0.3, -28, '주문 글 조각 뒤에 그림 조각들이 붙음', {decay: 0.15}));
  ev.push(snd.train('learn_flow', Array.from({length: 18}, (_, k) => [E.flow0 + 0.6 * Math.sqrt(k / 18) * (E.catch[0] - E.flow0) / 0.6, 'tick', {freq: 247 + 8 * k, decay: 0.03, click: 0, gain_db: 0}]), -34, '설명이 붙은 그림들이 폭포처럼 흘러감(점점 빠르게)'));
  ev.push(snd.swell('learn_count', E.count, [110, 165], 1.0, -30, '그림의 수가 2억 5천만 장으로 굴러감'));
  E.cells.forEach((ci, j) => ev.push(snd.tick('learn_reveal' + (j + 1), E.rev[j] + 0.35, 330 + 30 * j, -26, `가려진 칸이 열림 — 정답 무늬 ${M.TRAIN[0].codes[ci]}번`, {decay: 0.08})));
  ev.push(snd.swell('learn_who', E.who, [147, 220], 1.1, -32, "몸의 칸에서 '용'으로, 숨의 칸에서 '불을'로 선이 뻗음(어느 낱말이 그 칸을 정하는지)"));
  return ev;
}
export const signature = P => [P.token.n8192, P.line.done, P.learn.who].map(x => x.toFixed(3)).join(',');
