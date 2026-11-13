// 46 — the core: draw (s12–s15), vary (s16–s17), mix (s18). PLAN.md §3.
// Exports: scenes {draw, vary, mix}, titles, planDraw(tl, P), soundDraw(tl, P), signature(P).
// Every time comes from planDraw (word anchors via kit.wd on the tts text); board, strip and sound read the same numbers.
import * as K from '../gpt-generative/kit.mjs';
import * as M from './model.mjs';
import {CH, BOARD, FULL, WIN_P, WIN, STRIP_Y, STRIP_H, G, N, lay, centre, chipAt, chipPop, boardPlate, boardTiles, tile, cellRect, cellC,
  picImg, meltPic, panelP, strip, fallingMarker, morphDist, segXc, uX, makeBoardRun, runTiles, runStrip, schedule, multAt, frameBoxes, edgeA,
  world, camAt, camPt, ringPop, rollNum, speedBadge, backOut, spring, streak, slab, bbox} from './parts.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, fadeIn, fadeOut, hitFlash} = K;
/** the drawing board of s12–s17: 580 px, so the big number and the GPT plate sit in a clear band above the panel */
const DBOARD = {x: 250, y: 400, w: 580, h: 580};
const WIN_D = {...WIN_P, y1: 1000};                                  // world window of the draw scene: the band 1000–1106 stays clear
const PROMPT = ['불을', '뿜는', '아기', '용'], PROMPT_W = ['물을', '뿜는', '아기', '용'], PROMPT_CAT = ['물을', '뿜는', '고양이'];
export const MAIN = M.runOf('용', '불', M.RUN.MAIN), WATER = M.runOf('용', '물', M.RUN.WATER), HELDR = M.runOf(M.HELD.what, M.HELD.breath, M.RUN.HELD);
export const SRUNS = ['S1', 'S2', 'S3'].map(k => M.runOf('용', '불', M.RUN[k]));
export const SPLIT = M.SPLIT_CELLS(MAIN);
const DT = {1: 0.6, 2: 0.3, 4: 0.15, 8: 0.075, 16: 0.0375, 64: 0.6 / 64};
const range = (a, b) => Array.from({length: b - a}, (_, k) => a + k);
const pctS = p => (p > 0.995 ? (100 * p).toFixed(2) : Math.round(100 * p).toString());

/** GPT name plate on the panel's top-left (screen layer) — the slim "machine" of PLAN §2 */
const TAG = {x: 76, y: 1080, w: 112, h: 44};
export function gptTag(stage, a = 1, busy = 0) {
  if (a <= 0) return; const c = stage.ctx;
  K.withAlpha(c, a, () => {
    slab(c, TAG.x, TAG.y, TAG.w, TAG.h, 10, '#33444C', '#222F35', K.rgba(PAL.muted, 0.4));
    stage.text('GPT', TAG.x + TAG.w / 2, TAG.y + TAG.h / 2 - 1, {role: 'display', weight: 700, size: 30, color: busy > 0 ? K.mix(PAL.ink, PAL.warm, clamp(busy)) : PAL.ink, align: 'center'});
  });
}
export const TAG_IN = [TAG.x + TAG.w / 2, TAG.y];
/** cool read scan over filled cells: rows passed get a thin underline, the current row a bright outline */
export function sweepCells(stage, R, n, q, a = 1) {
  if (a <= 0 || n <= 0) return; const c = stage.ctx, s = R.w / G, rows = Math.ceil(n / G), f = clamp(q) * rows, k = Math.floor(f);
  K.withAlpha(c, a, () => { for (let r = 0; r < rows; r++) {
    const w = r < rows - 1 ? R.w : (n - r * G) * s, y = R.y + r * s; if (r > f) break;
    const u = clamp(f - r), al = 1 - 0.7 * clamp(f - r - 1);
    K.line(c, [[R.x, y + s - 2], [R.x + w * u, y + s - 2]], K.rgba(PAL.cool, 0.9 * al), 3, {cap: 'butt'});
    if (r === k && q < 1) { c.strokeStyle = K.rgba(PAL.coolHi, 0.95); c.lineWidth = 2.5; c.strokeRect(R.x, y, w, s); }
  } });
}
/** camera that follows the writing row of a run (z, centred on the row, clamped to the board) */
function followCam(R, i, z) {
  const row = Math.floor(i / G), y = R.y + (row + 0.5) * R.w / G, wcy = (WIN_D.y0 + WIN_D.y1) / 2, half = (WIN_D.y1 - WIN_D.y0) / 2 / z - 30;
  const yc = clamp(y, R.y + half - 40, R.y + R.h - half + 40);
  return {cx: R.x + R.w / 2, cy: yc - (wcy - 800) / z, z};
}
const mixCam = (a, b, q) => ({cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), z: a.z * Math.pow(b.z / a.z, q)});
const BIGP = {x: 1046, y: 1080, size: 70};                        // band between the board (≤ 986) and the panel (1106)
function bigPlate(stage, val, unit, t, t0, a = 1, o = {}) {
  const BIGPOS = {...BIGP, ...o};
  if (a <= 0 || t < t0) return; const c = stage.ctx, w = stage.measure(val, {role: 'display', weight: 700, size: BIGPOS.size}) + (unit ? stage.measure(unit, {role: 'display', weight: 700, size: BIGPOS.size * 0.46}) + 12 : 0);
  K.withAlpha(c, a * smooth((t - t0) / 0.15), () => { c.beginPath(); c.roundRect(BIGPOS.x - w - 24, BIGPOS.y - BIGPOS.size * 0.82, w + 40, BIGPOS.size * 1.05, 14); c.fillStyle = K.rgba('#03141C', 0.82); c.fill(); });
  K.bigNum(stage, val, unit, t, t0, a, {x: BIGPOS.x, y: BIGPOS.y, size: BIGPOS.size});
}
export {bigPlate};

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planDraw(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  // ---------------- draw
  {
    const D = {};
    D.start = SC.draw.start;
    D.pop = ['불을', '뿜는', '아기', '용'].map(w => W_('s12', w));
    D.read = [W_('s12', '글을'), W_('s12', '글을') + 0.75]; D.pulse = [D.read[1], D.read[1] + 0.45];
    D.div0 = W_('s12', '첫'); D.big0 = W_('s12', '확률을');
    const picks = [];
    picks[0] = W_('s13', '첫');                                        // marker lands on 0 (99.98 %) — slow
    D.drop0 = W_('s13', '뽑아');
    D.fast0 = W_('s13', '확률이');
    const fe = W_('s13', '무늬일수록') + 0.1, dtF = (fe - D.fast0) / 97;
    range(1, 98).forEach((i, k) => { picks[i] = D.fast0 + dtF * (k + 1); });
    D.fastEnd = picks[97];
    D.split = SPLIT[0].i;                                               // 98: the first cell whose division is really split
    picks[D.split] = W_('s13', '뽑힙니다'); D.splitSwitch = D.fastEnd + 0.08; D.splitDrop = picks[D.split] - 0.42;
    // s14: read again (prompt, then the filled cells), then the next cells one by one, ×2, ×4
    D.sweepChips = [W_('s14', '주문'), W_('s14', '글과') + 0.25]; D.sweepCells = [D.sweepChips[1], W_('s14', '읽고')]; D.pulse2 = [D.sweepCells[1], D.sweepCells[1] + 0.4];
    picks[99] = W_('s14', '다음'); picks[100] = W_('s14', '무늬를'); picks[101] = W_('s14', '뽑습니다') + 0.05;
    let t = picks[101];
    const ph = [[2, 3], [4, 6], [8, 8], [16, 16], [64, N]], spans = [[D.fast0 - 0.05, D.fastEnd + 0.05, 64], [D.pulse2[1], picks[101] + 0.01, 1]];
    let i = 102;
    for (const [m, n] of ph) { const t0 = t; for (let q = 0; q < n && i < N; q++, i++) { t += DT[m]; picks[i] = t; } spans.push([t0 + 0.01, t + 0.01, m]); }
    D.spans = spans; D.done = t;
    D.run = makeBoardRun(MAIN, picks);
    D.run.S[0].tSwitch = D.div0; D.run.S[0].tDrop = D.drop0;               // cell 0: strip divides on "첫", falls on "뽑아"
    const s98 = D.run.S.find(s => s.i === D.split); s98.tSwitch = D.splitSwitch; s98.tDrop = D.splitDrop;
    const s99 = D.run.S.find(s => s.i === 99); s99.tSwitch = D.pulse2[1]; s99.tDrop = picks[99] - 0.35;
    D.decode = [W_('s15', '그림으로'), W_('s15', '그림으로') + 0.9];
    D.follow = [picks[118], D.done];
    // camera: push into the split cell's corner (slow moment), back for the read, follow the writing row when fast
    const r98 = cellRect(DBOARD, D.split), around = [{...r98, x: r98.x - 34 * 6, y: r98.y - 34 * 3, w: 34 * 8, h: 34 * 7}];
    D.camSplit = frameBoxes(around, {win: WIN_D, zMax: 1.6});
    D.camKeys = [{t: D.start, ...FULL}, {t: D.fastEnd - 0.05, ...FULL}, {t: D.splitSwitch + 0.45, ...D.camSplit}, {t: D.sweepChips[0] - 0.55, ...D.camSplit}, {t: D.sweepChips[0] - 0.05, ...FULL}];
    D.splitRings = SPLIT.map(s => s.i);
    P.draw = D;
  }
  // ---------------- vary
  {
    const V = {}, s = SC.vary.start;
    V.flip = W_('s16', "'불'을"); V.redraw = W_('s16', '바꾸면');
    const picks = []; let t = V.redraw; for (let i = 0; i < N; i++) { t += DT[64]; picks[i] = t; }
    V.run = makeBoardRun(WATER, picks); V.done = t;
    V.changed = M.diffCells(MAIN.codes, WATER.codes);
    V.lines = W_('s16', '칸들에서');
    V.cell = V.changed.find(i => M.SPLIT_CELLS(WATER).some(x => x.i === i)) ?? V.changed[0];     // a breath cell whose division is shown with its afterimage
    V.cellDist = [MAIN.steps[V.cell].dist, WATER.steps[V.cell].dist];
    V.showCell = V.done + 0.3;
    // s17: back to 불을; three boards draw at once
    V.flipBack = P.tl.at('s17') - 0.1; V.three = [W_('s17', '같은') - 0.5, W_('s17', '같은')];
    const p3 = []; let t3 = W_('s17', '같은'); for (let i = 0; i < N; i++) { t3 += 0.0085; p3[i] = t3; }
    V.runs3 = SRUNS.map(r => makeBoardRun(r, p3)); V.done3 = t3;
    V.diff3 = range(0, N).filter(i => SRUNS[0].codes[i] !== SRUNS[1].codes[i] || SRUNS[1].codes[i] !== SRUNS[2].codes[i]);
    V.cam = [{t: s, ...FULL}];
    P.vary = V;
  }
  // ---------------- mix
  {
    const X = {}, s = SC.mix.start;
    X.swap = s + 0.15;                                               // the prompt turns into 물을 · 뿜는 · 고양이
    X.lines = [W_('s18', '낱말'), W_('s18', '하나하나가')];
    X.draw0 = W_('s18', '움직여서') + 0.1;
    const picks = []; let t = X.draw0; for (let i = 0; i < N; i++) { t += 0.0085; picks[i] = t; }
    X.run = makeBoardRun(HELDR, picks); X.done = t;
    X.fly = [W_('s18', '그려'), W_('s18', '그려') + 0.6];
    P.mix = X;
  }
  return P;
}

// =====================================================================================================
// DRAW
// =====================================================================================================
function drawScene(stage, t, p, ctx) {
  const P = ctx.P, D = P.draw, R = D.run, c = stage.ctx, G = glowBegin();
  let cam = camAt(t, D.camKeys);
  if (t >= D.follow[0] - 0.4) {                                          // follow the writing row while fast, then pull back
    const k = Math.max(0, R.cur(t)), fc = followCam(DBOARD, R.S[k].i, 1.3);
    const qin = smooth((t - D.follow[0] + 0.4) / 0.5), qout = smooth((t - D.done - 0.1) / 0.6);
    cam = mixCam(mixCam(FULL, fc, qin), FULL, qout);
  }
  const chips = lay(PROMPT), decodeQ = clamp((t - D.decode[0]) / (D.decode[1] - D.decode[0]));
  world(stage, cam, () => {
    // prompt chips spring in on their words
    const chA = Math.min(...chips.map(b => edgeA(cam, b, WIN_D))) ** 6;
    chips.forEach((b, i) => chipPop(stage, b, t, D.pop[i] - 0.05, {kind: 'given', a: chA}));
    // read sweeps (cool, matte)
    if (t >= D.read[0] && t < D.read[1] + 0.3) K.sweep(stage, chips, (t - D.read[0]) / (D.read[1] - D.read[0]), {a: fadeOut(t, D.read[1], 0.3) * chA});
    if (t >= D.sweepChips[0] && t < D.sweepCells[1] + 0.3) {
      K.sweep(stage, chips, (t - D.sweepChips[0]) / (D.sweepChips[1] - D.sweepChips[0]), {a: fadeOut(t, D.sweepCells[1], 0.3) * chA});
      if (t >= D.sweepCells[0]) sweepCells(stage, DBOARD, D.split + 1, (t - D.sweepCells[0]) / (D.sweepCells[1] - D.sweepCells[0]), fadeOut(t, D.sweepCells[1], 0.3));
    }
    boardPlate(stage, DBOARD, {grid: 1 - decodeQ});
    // the last training picture (learn) falls away: the board is cleared for the order
    if (t < D.start + 1.0) boardTiles(stage, BOARD, M.TRAIN[0].codes, N, {mod: i => { const q = clamp((t - D.start - 0.012 * (19 - Math.floor(i / G)) - 0.004 * (i % G)) / 0.45); return {dy: 700 * q * q, a: 1 - q}; }});
    if (decodeQ <= 0) runTiles(stage, t, R, {R: DBOARD, G, cam, rings: D.splitRings.filter(i => i !== D.split), ringD: 0.6});
    else meltPic(stage, DBOARD, MAIN.codes, decodeQ, 'main', a => boardTiles(stage, DBOARD, MAIN.codes, N, {a}));
    // the slow split cell: thin warm frame while it is being decided
    if (t >= D.splitSwitch && t < R.T[D.split] + 0.6) { const r = cellRect(DBOARD, D.split); K.withAlpha(c, fadeOut(t, R.T[D.split] + 0.3, 0.3), () => { c.strokeStyle = PAL.hot; c.lineWidth = 3; c.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6); }); }
  }, WIN_D.y1);
  // screen layer: GPT tag, read pulses, strip
  const busy = Math.max(K.clamp((t - D.pulse[0]) / 0.45) * (t < D.div0 + 0.2 ? 1 : 0), t >= D.pulse2[0] && t < D.pulse2[1] + 0.2 ? 1 : 0);
  const stripOn = t >= D.div0 - 0.4;
  gptTag(stage, smooth((t - D.read[0] + 0.4) / 0.4), busy);
  for (const [w, from] of [[D.pulse, centre(chips[3])], [D.pulse2, null]]) if (t >= w[0] && t < w[1]) {
    const f = from ? camPt(cam, from[0], from[1] + 42) : camPt(cam, ...cellC(DBOARD, D.split));
    K.beamPulse(G.GC, f, TAG_IN, (t - w[0]) / (w[1] - w[0]), {amp: 1});
  }
  if (stripOn) {
    if (t < D.div0) { panelP(stage, smooth((t - D.div0 + 0.4) / 0.4)); strip(stage, [1], {a: smooth((t - D.div0 + 0.4) / 0.4), ticks: true}); }
    else runStrip(stage, t, R, {G, prevDist: [1, 0, 0, 0, 0, 0, 0, 0], a: fadeOut(t, D.decode[0], 0.4)});
  }
  glowFlush(stage);
  // fixed: big numbers (one at a time), speed badge
  const s0 = R.S[0];
  if (t >= D.big0 && t < D.fast0 - 0.1) bigPlate(stage, (100 * s0.dist[0]).toFixed(2), '%', t, D.big0, fadeOut(t, D.fast0 - 0.4, 0.3));
  const s98 = R.S.find(s => s.i === D.split);
  if (t >= D.splitSwitch + 0.3 && t < D.sweepChips[0] - 0.3) {
    const sel = t >= s98.tPick ? s98.pick : M.argmax(s98.dist);
    bigPlate(stage, String(Math.round(100 * s98.dist[sel])), '%', t, D.splitSwitch + 0.3, fadeOut(t, D.sweepChips[0] - 0.6, 0.3));
  }
  if (t >= D.follow[0] && t < D.decode[0]) bigPlate(stage, String(R.filled(t)), '칸', t, D.follow[0], fadeOut(t, D.decode[0] - 0.3, 0.3));
  const m = multAt(t, D.spans); if (m && t < D.done + 0.3) speedBadge(stage, m, 1);
}

// =====================================================================================================
// VARY
// =====================================================================================================
/** chip that flips (scaleX → 0 → new text) around tF */
function flipChip(stage, b, nb, t, tF, kindA = 'given', kindB = 'given', a = 1) {
  const q = clamp((t - tF) / 0.38), c = stage.ctx, [cx, cy] = centre(t < tF + 0.19 ? b : nb), sx = Math.abs(Math.cos(q * Math.PI));
  c.save(); c.translate(cx, cy); c.scale(Math.max(0.02, sx), 1); c.translate(-cx, -cy);
  K.chip(stage, q < 0.5 ? b : nb, {kind: q < 0.5 ? kindA : kindB, a, hi: q > 0 && q < 1 ? 1 : smooth(1 - (t - tF - 0.38) / 0.6) * (t > tF ? 1 : 0)}); c.restore();
}
const MINI = [{x: 60, y: 560, w: 300, h: 300}, {x: 390, y: 560, w: 300, h: 300}, {x: 720, y: 560, w: 300, h: 300}];
function varyScene(stage, t, p, ctx) {
  const P = ctx.P, V = P.vary, D = P.draw, c = stage.ctx, G = glowBegin(), cam = FULL;
  const A = lay(PROMPT), B = lay(PROMPT_W), redrawn = t >= V.redraw;
  const back = t >= V.flipBack, threeQ = clamp((t - V.three[0]) / 0.5);
  world(stage, cam, () => {
    // prompt: 불을 → 물을 (old chip drops below the line as a ghost), and back in s17
    A.forEach((b, i) => {
      if (i !== 0) return K.chip(stage, b, {kind: 'given'});
      if (!back) flipChip(stage, b, B[0], t, V.flip);
      else flipChip(stage, B[0], b, t, V.flipBack);
    });
    if (t >= V.flip && !back) { const q = backOut(clamp((t - V.flip) / 0.5)), g = {...A[0], x: lerp(A[0].x, 36, q), y: A[0].y + 110 * q}; K.chip(stage, g, {kind: 'ghost', a: 0.9 * clamp(q * 2)}); }
    // the board: MAIN picture; the water run lands over it (body cells land on identical tiles, breath cells change)
    const mainA = 1 - threeQ;
    if (mainA > 0) {
      const R = DBOARD, sc = lerp(1, MINI[1].w / DBOARD.w, easeInOut(threeQ)), RB = {x: lerp(R.x, MINI[1].x, easeInOut(threeQ)), y: lerp(R.y, MINI[1].y, easeInOut(threeQ)), w: R.w * sc, h: R.h * sc};
      boardPlate(stage, RB, {grid: 0});
      if (!back) {
        const startQ = clamp((t - P.sc.vary.start) / 0.6);
        if (startQ < 1) picImg(stage, RB, M.decode(MAIN.codes), 1 - startQ, 'main-80');
        boardTiles(stage, RB, MAIN.codes, i => (V.run.T[i] <= t ? 0 : 1), {a: startQ});
        runTiles(stage, t, V.run, {R: RB, G, cam, rings: V.changed, ringD: 0.7, head: true});
        // lines from 물을 to the changed cells
        const la = smooth((t - V.lines) / 0.4) * fadeOut(t, V.flipBack - 0.6, 0.4);
        if (la > 0) { const from = [B[0].x + B[0].w / 2, B[0].y + B[0].h]; K.withAlpha(c, la * 0.55, () => V.changed.forEach(i => { if (V.run.T[i] > t) return; K.line(c, [from, cellC(RB, i)], K.rgba(PAL.cool, 0.7), 1.2); })); }
        if (t >= V.showCell) { const r = cellRect(RB, V.cell); c.strokeStyle = PAL.hot; c.lineWidth = 3; c.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6); }
      } else boardTiles(stage, RB, MAIN.codes, N);
    }
    // s17: three boards draw the same prompt with three seeds at once
    if (threeQ > 0) MINI.forEach((R, k) => {
      const al = k === 1 ? 1 : threeQ, slide = k === 1 ? 0 : (1 - backOut(threeQ)) * (k === 0 ? -200 : 200), RR = {...R, x: R.x + slide};
      boardPlate(stage, RR, {a: al, grid: 1});
      runTiles(stage, t, V.runs3[k], {R: RR, G, cam, head: true, a: al});
      if (t >= V.done3 + 0.2) for (const i of V.diff3) { const r = cellRect(RR, i); K.withAlpha(c, smooth((t - V.done3 - 0.2) / 0.3), () => { c.strokeStyle = K.rgba(PAL.hot, 0.85); c.lineWidth = 1.5; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }); }
      const lab = `씨앗 ${k + 1}`; K.tag(stage, lab, RR.x + RR.w / 2, RR.y + RR.h + 44, {size: 30, a: al * smooth((t - V.three[1]) / 0.3), color: PAL.muted});
    });
  });
  // strip: the water run (fast), then one breath cell with the old division as an afterimage
  if (!back) {
    if (t < V.showCell) { if (t >= V.run.S[0].tSwitch) runStrip(stage, t, V.run, {G, fall: false}); }
    else { panelP(stage, 1); const q = clamp((t - V.showCell) / 0.35); strip(stage, morphDist(V.cellDist[0], V.cellDist[1], q), {ghost: V.cellDist[0], ghostA: 0.8}); K.tag(stage, '바뀐 칸 하나 · 점선 = 불일 때', 540, 1336, {size: 30, color: PAL.muted, a: q}); }
  } else if (t < V.three[1] + 0.2) { panelP(stage, fadeOut(t, V.flipBack + 0.2, 0.3)); }
  else if (t < V.done3 + 0.2) runStrip(stage, t, V.runs3[1], {G, fall: false});
  glowFlush(stage);
  if (t >= V.lines && t < V.flipBack - 0.4) bigPlate(stage, rollNum(V.changed.length, clamp((t - V.lines) / Math.max(0.3, V.done - V.lines))), '칸', t, V.lines, fadeOut(t, V.flipBack - 0.7, 0.3));
  if ((t >= V.redraw && t < V.done + 0.2) || (t >= V.three[1] && t < V.done3 + 0.2)) speedBadge(stage, 64, 1);
}

// =====================================================================================================
// MIX
// =====================================================================================================
const SLOTS = [0, 1, 2, 3].map(k => ({x: 70 + k * 240, y: 1000, w: 220, h: 220}));
const MBOARD = {x: 290, y: 410, w: 500, h: 500};
const SEEN = [M.TRAIN[0].codes, M.TRAIN[M.NV].codes, M.TRAIN[2 * M.NV].codes];
function mixScene(stage, t, p, ctx) {
  const P = ctx.P, X = P.mix, c = stage.ctx, G = glowBegin(), cam = FULL;
  const A = lay(PROMPT), B = lay(PROMPT_CAT), swq = clamp((t - X.swap) / 0.4), flyQ = clamp((t - X.fly[0]) / (X.fly[1] - X.fly[0]));
  world(stage, cam, () => {
    // prompt swap: the old line slides up and fades, the new one springs in
    if (swq < 1) A.forEach(b => K.chip(stage, {...b, y: b.y - 40 * swq}, {kind: 'given', a: 1 - swq}));
    B.forEach((b, i) => chipPop(stage, b, t, X.swap + 0.08 * i, {kind: 'given', hi: i === 0 || i === 2 ? smooth((t - X.lines[i === 0 ? 1 : 0]) / 0.3) * fadeOut(t, X.draw0 + 0.6, 0.4) : 0}));
    // three trained kinds + the empty fourth slot
    SLOTS.forEach((R, k) => {
      const a = smooth((t - P.sc.mix.start - 0.1 * k) / 0.4);
      boardPlate(stage, R, {a, grid: k === 3 ? 0.8 : 0});
      if (k < 3) boardTiles(stage, R, SEEN[k], N, {a});
      else { c.save(); c.setLineDash([8, 6]); c.strokeStyle = K.rgba(PAL.muted, 0.7 * a); c.lineWidth = 2; c.strokeRect(R.x - 6, R.y - 6, R.w + 12, R.h + 12); c.restore(); }
    });
    K.tag(stage, '배운 적 없는 조합', SLOTS[3].x + SLOTS[3].w / 2 - 50, SLOTS[3].y + SLOTS[3].h + 48, {size: 30, color: PAL.warm, a: smooth((t - P.sc.mix.start - 0.4) / 0.4)});
    // the drawing board: WHO outlines (what → 고양이, breath → 물을), then the run, then it flies to the empty slot
    const e = easeInOut(flyQ), R = {x: lerp(MBOARD.x, SLOTS[3].x, e), y: lerp(MBOARD.y, SLOTS[3].y, e), w: lerp(MBOARD.w, SLOTS[3].w, e), h: lerp(MBOARD.h, SLOTS[3].h, e)};
    if (flyQ > 0 && flyQ < 1) streak(stage, [MBOARD.x + MBOARD.w / 2, MBOARD.y + MBOARD.h / 2], [R.x + R.w / 2, R.y + R.h / 2], 1, {len: 0.5, w: 40, a: 0.25});
    boardPlate(stage, R, {a: smooth((t - P.sc.mix.start) / 0.4), grid: 1});
    const la = smooth((t - X.lines[0]) / 0.4) * fadeOut(t, X.draw0 + 0.4, 0.5);
    if (la > 0) {
      const s = MBOARD.w / G;
      K.withAlpha(c, la, () => M.WHO.forEach((w, i) => { if (!w) return; const r = cellRect(MBOARD, i); c.strokeStyle = K.rgba(w === 'what' ? PAL.cool : PAL.warm, 0.55); c.lineWidth = 1.2; c.strokeRect(r.x + 2, r.y + 2, s - 4, s - 4); }));
      for (const [chipI, kind, q0] of [[2, 'what', X.lines[0]], [0, 'breath', X.lines[1]]]) {
        const q = smooth((t - q0) / 0.45), from = [B[chipI].x + B[chipI].w / 2, B[chipI].y + B[chipI].h];
        K.withAlpha(c, la * 0.5, () => M.WHO.forEach((w, i) => { if (w !== kind || (i * 7) % 5) return; const to = cellC(MBOARD, i); K.line(c, [from, [lerp(from[0], to[0], q), lerp(from[1], to[1], q)]], K.rgba(kind === 'what' ? PAL.cool : PAL.warm, 0.8), 1.1); }));
      }
    }
    runTiles(stage, t, X.run, {R, G, cam, head: flyQ === 0});
    if (flyQ >= 1) ringPop(stage, SLOTS[3].x + SLOTS[3].w / 2, SLOTS[3].y + SLOTS[3].h / 2, t, X.fly[1], {r0: 60, r1: 150, a: 0.7});
  });
  glowFlush(stage);
  if (t >= X.draw0 && t < X.done + 0.2) speedBadge(stage, 64, 1);
}

export const scenes = {draw: drawScene, vary: varyScene, mix: mixScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  draw: P => { const D = P.draw, at = s => P.tl.at(s) - 0.5;
    return [[-Infinity, '실제보다 느리게', '첫 칸의 확률'], [at('s13'), '실제보다 느리게', '운에 맡겨 하나를 뽑는다'], [D.fast0 - 0.25, '빨리 감기', '확률이 높을수록 잘 뽑힌다'],
      [D.splitSwitch, '느리게', '확률이 갈리는 칸'], [at('s14'), '실제보다 느리게', '채운 칸까지 읽고 다음 칸'], [P.tl.at('s14:end') - 0.6, '빨리 감기', '채운 칸까지 읽고 다음 칸'], [at('s15'), '빨리 감기', '끝까지 채우고 그림으로']]; },
  vary: P => [[-Infinity, '빨리 감기', "'불' → '물'"], [P.tl.at('s17') - 0.4, '빨리 감기', '같은 주문, 다른 그림']],
  mix: P => [[-Infinity, '빨리 감기', '배운 적 없는 조합']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
const CODEF = [196, 175, 220, 262, 294, 330, 392, 440];               // a pitch per code (all < 700 Hz)
const trainOf = (id, S, gain, means, f0 = null) => snd.train(id, S.map(s => [s.tPick, 'tick', {freq: f0 ?? CODEF[s.pick], decay: 0.04, click: 0, gain_db: 0}]), gain, means);
export function soundDraw(tl, P) {
  const D = P.draw, V = P.vary, X = P.mix, R = D.run, ev = [];
  D.pop.forEach((t0, k) => ev.push(snd.tone('draw_chip' + (k + 1), t0, 262 + 30 * k, 0.18, -31, `주문 조각 '${PROMPT[k]}'이 나타남`, {decay: 0.1})));
  ev.push(snd.swell('draw_read', D.read[0], [131, 196], 1.3, -32, '주문 글을 읽음(밑줄이 조각을 지나감) → GPT 이름표로 읽기 펄스'));
  ev.push(snd.tone('draw_div0', D.div0, 196, 0.35, -30, '띠가 첫 칸의 확률로 나뉨(0번 바탕이 거의 전부)', {decay: 0.2}));
  const s0 = R.S[0];
  ev.push(snd.tick('draw_pick0', s0.tPick, CODEF[s0.pick], -24, '첫 칸: 표지가 0번에 떨어져 칸이 채워짐(느리게)', {decay: 0.1}));
  ev.push(trainOf('draw_fast', R.S.filter(s => s.i >= 1 && s.i < D.split), -32, '빨리 감기 ×64: 2~98번째 칸이 차례로 채워짐(칸마다 그 무늬의 음높이)'));
  ev.push(snd.tone('draw_split_div', D.splitSwitch, 220, 0.4, -29, '확률이 갈리는 칸: 띠가 60 / 40 으로 나뉨', {decay: 0.25}));
  const s98 = R.S.find(s => s.i === D.split);
  ev.push(snd.tick('draw_split_pick', s98.tPick, CODEF[s98.pick], -23, `갈리는 칸: 표지가 ${s98.pick}번(${Math.round(100 * s98.dist[s98.pick])}%)에 떨어짐`, {decay: 0.12}));
  ev.push(snd.swell('draw_read2', D.sweepChips[0], [131, 196], 2.3, -33, '주문 글과 지금까지 채운 칸을 함께 다시 읽음'));
  for (const i of [99, 100, 101]) { const s = R.S.find(x => x.i === i); ev.push(snd.tick('draw_cell' + i, s.tPick, CODEF[s.pick], -27, `칸 ${i + 1}: 무늬 ${s.pick}번이 뽑힘(×1)`, {decay: 0.08})); }
  for (const [a, b, m] of D.spans.slice(2)) ev.push(trainOf('draw_x' + m, R.S.filter(s => s.tPick > a && s.tPick <= b), m >= 64 ? -33 : -30, `빨리 감기 ×${m}: 칸이 채워질 때마다 틱(빨라질수록 촘촘하게)`));
  ev.push(snd.tone('draw_decode', D.decode[0], 220, 0.9, -27, '무늬 번호를 다시 그림으로: 칸의 경계가 녹아 한 장이 완성됨(맺음 음)', {decay: 0.4, sustain: 0.2}));
  // vary
  ev.push(snd.tone('vary_flip', V.flip, 247, 0.25, -28, "주문 조각 '불을'이 뒤집혀 '물을'", {decay: 0.12}));
  ev.push(trainOf('vary_redraw', V.run.S, -34, '같은 씨앗으로 다시 그림(×64): 몸의 칸은 같은 무늬'));
  ev.push(snd.tone('vary_changed', V.lines, 294, 0.4, -30, "'물을'에서 바뀐 숨의 칸들로 선이 뻗음", {decay: 0.2}));
  ev.push(snd.tone('vary_cell', V.showCell, 220, 0.4, -31, '숨의 한 칸: 옛 나뉨(점선)과 새 나뉨', {decay: 0.2}));
  ev.push(snd.tone('vary_back', V.flipBack, 247, 0.25, -30, "주문을 '불을'로 되돌림", {decay: 0.12}));
  ev.push(trainOf('vary_three', V.runs3[1].S, -32, '같은 주문, 씨앗 셋 — 세 그림판이 동시에 그려짐(×64)'));
  ev.push(snd.tone('vary_diff', V.done3 + 0.2, 330, 0.4, -30, '세 그림에서 서로 다른 칸이 드러남', {decay: 0.2}));
  // mix
  ev.push(snd.tone('mix_prompt', X.swap, 262, 0.25, -30, "주문이 '물을 뿜는 고양이'로 바뀜", {decay: 0.12}));
  ev.push(snd.swell('mix_lines', X.lines[0], [147, 220], 1.2, -33, "'고양이' → 몸의 칸, '물을' → 숨의 칸으로 선이 뻗음"));
  ev.push(trainOf('mix_draw', X.run.S, -33, '배운 적 없는 조합을 그림(×64)'));
  ev.push(snd.tone('mix_land', X.fly[1], 330, 0.5, -27, '완성된 물·고양이 그림이 빈 넷째 자리에 앉음', {decay: 0.25}));
  return ev;
}
export const signature = P => [P.draw.done, P.vary.done, P.vary.done3, P.mix.done].map(x => x.toFixed(3)).join(',');
