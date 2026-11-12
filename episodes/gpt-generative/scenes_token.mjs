// 43 GPT는 대답을 어떻게 쓸까 — token (s07–s10): pieces, the vocabulary pull-back, the probability bars, where they come from.
// PLAN.md §6 rows s07–s10, §1.1 (s07 fast cuts and springing pieces; s08 pull back from five bars to the 50,257-row column).
import * as K from './kit.mjs';
import {Q1, RUN, dist, CORPUS, VOCAB} from './model.mjs';
import {CH, MACH, INLET, BARS_Y0, BAR_P, BAR_H, SX0, SX1, lay, makeRun, drawRun, centre, chipAt, big, barRows, slab, world, OUTLET, bars2, edgeA, frameBoxes, barsRect, machRect, bbox} from './parts.mjs';
import {backOut, spring, drop, squash, camAt, camPt, streak, ringPop, rollNum} from './motion.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, easeIn, fadeIn, fadeOut} = K;
const FULL = {cx: 540, cy: 800, z: 1};
const D0 = dist(Q1);
const TEXT = '하늘은 왜 파랄까?';
const PRE = ['', '하늘', '하늘은 ', '하늘은 왜 ', '하늘은 왜 파랄', '하늘은 왜 파랄까'];   // text before each piece in the merged line
const WORDS = [['', '하늘은'], ['하늘은 ', '왜'], ['하늘은 왜 ', '파랄까?']];

// the read text (s10): ten snippets "하늘 은 왜 파랄 까 ? X …", X counted by CORPUS (ratio = first-step probability)
const TAILS = {햇빛: ['햇빛', '이', '공기', '에'], 공기: ['공기', '가', '빛', '을'], 바다: ['바다', '색', '이']};
const ORDER = ['햇빛', '공기', '햇빛', '햇빛', '바다', '햇빛', '공기', '햇빛', '햇빛', '햇빛'];   // 7 · 2 · 1 = CORPUS
const LINES = (() => {
  if (ORDER.filter(x => x === '햇빛').length !== CORPUS['햇빛'] || ORDER.filter(x => x === '공기').length !== CORPUS['공기'] || ORDER.filter(x => x === '바다').length !== CORPUS['바다']) throw new Error('ORDER must match model CORPUS');
  const fill = [['여름', '에는'], ['그래서'], ['낮', '에'], ['맑은', '날'], ['왜냐하면'], ['오후', '의']];
  const per = [3, 3, 2, 2], out = []; let j = 0;
  for (let l = 0; l < 4; l++) {
    const pieces = [], colour = [];
    pieces.push(...fill[l]); colour.push(...fill[l].map(() => null));
    for (let s = 0; s < per[l]; s++) { const X = ORDER[j++]; pieces.push(...Q1.slice(0, -1), '?', ...TAILS[X]); colour.push(...Q1.map(() => null), X, ...TAILS[X].slice(1).map(() => null)); if (s + 1 < per[l]) { pieces.push('…'); colour.push(null); } }
    out.push({pieces, colour, off: [150, 520, 300, 820, 60, 420][l], v: [26, 34, 22, 30, 38, 28][l]});
  }
  return out;
})();
const LINE_Y0 = 394, LINE_P = 60, LSIZE = 34;

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planToken(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc, at = r => tl.at(r);
  const T = {};
  T.back0 = SC.token.start;                         // 햇빛 slides back into the outlet
  T.merge0 = W_('s07', '글은'); T.merge1 = T.merge0 + 0.4;   // the question closes into one block of text
  T.words = W_('s07', '낱말보다');                    // word boundaries
  T.cut0 = W_('s07', '조각으로');                     // five cuts, 60 ms apart
  T.cuts = [0, 1, 2, 3, 4].map(i => T.cut0 + 0.06 * i);
  T.apart = T.cuts[4] + 0.14;                        // pieces spring apart
  T.token = W_('s07', '토큰이라고');
  T.rows = W_('s08', '아는') ;                         // five empty rows spring in under the machine
  T.out0 = W_('s08', '수만'); T.out1 = T.out0 + 0.8;   // pull back: the rows are the top of a 50,257-row column
  T.ret0 = W_('s08', '하나하나에') + 0.45; T.ret1 = T.ret0 + 0.6;
  T.read0 = W_('s08', '다음에'); T.read1 = T.read0 + 0.45; T.pulse1 = T.read1 + 0.25;
  T.grow = W_('s08', '확률을');                        // bars grow (dist(Q1))
  T.q1hi = [W_('s09', "'하늘은"), W_('s09', '질문')];
  T.hi = [W_('s09', "'햇빛'"), W_('s09', "'공기'"), W_('s09', "'바다'")];
  T.read = W_('s10', '읽어');                          // the read lines appear
  T.links = Array.from({length: CORPUS['햇빛']}, (_, k) => W_('s10', '그런') + 0.32 * k);
  T.leave = at('s10:end') + 0.2;                      // read lines run off to the left (→ loop)
  const QB = lay(Q1), QF = frameBoxes([{x: 70, y: 290, w: bbox(QB).x + bbox(QB).w - 70, h: 160}], {zMax: 1.5});
  const BF = frameBoxes([barsRect(), machRect()], {zMax: 1.4});
  T.cam = [{t: SC.token.start, ...FULL}, {t: T.merge1, ...QF}, {t: T.token + 0.4, ...QF}, {t: T.token + 1.2, ...FULL},
    {t: T.q1hi[0] - 0.1, ...FULL}, {t: T.hi[0] - 0.4, ...FULL}, {t: T.hi[0] + 0.05, ...BF}, {t: T.hi[2] + 0.6, ...BF},
    {t: T.read - 0.3, ...FULL}];
  P.token = T;
  return P;
}
/** the vocabulary wall: entry n (0 … 50,256) at column ⌊n / 900⌋, row n mod 900 (rows 62 px, columns 1000 px apart) */
const WROWS = 900, WCOLS = Math.ceil(VOCAB / WROWS), WALL = {x: SX0, y: BARS_Y0, w: (WCOLS - 1) * 1000 + (SX1 - SX0), h: WROWS * BAR_P};
const WALLCAM = frameBoxes([WALL], {pad: 30, zMin: 1e-4});
/** s08 camera: pull back from the five bars to the whole wall (log zoom; the bars' corner slides to the wall's corner) */
function columnCam(t, T) {
  if (t < T.out0 || t > T.ret1) return null;
  let q;
  if (t < T.out1) q = easeInOut((t - T.out0) / (T.out1 - T.out0));
  else if (t < T.ret0) q = 1;
  else q = 1 - easeInOut((t - T.ret0) / (T.ret1 - T.ret0));
  const z = Math.exp(Math.log(WALLCAM.z) * q), end = camPt(WALLCAM, SX0, BARS_Y0), ax = lerp(SX0, end[0], q), ay = lerp(BARS_Y0, end[1], q);
  return {cx: SX0 - (ax - 540) / z, cy: BARS_Y0 - (ay - 800) / z, z, q};
}

// =====================================================================================================
// SCENE
// =====================================================================================================
function tokenScene(stage, t, p, ctx) {
  const P = ctx.P, T = P.token, c = stage.ctx, G = glowBegin();
  const colCam = columnCam(t, T), cam = colCam || camAt(t, T.cam);
  const B = lay(Q1), size = CH.size, h = Math.round(CH.size * 1.5), pad = 18;
  const mw = s => stage.measure(s, {size, weight: 500});
  world(stage, cam, () => {
    // ---- the corpus lines (s10): flowing read text; 햇빛 / 공기 / 바다 after the question are cool
    if (t >= T.read) drawCorpus(stage, t, T, cam);
    // ---- machine (busy while reading s08)
    const busy = t >= T.pulse1 && t < T.grow ? (t - T.pulse1) / (T.grow - T.pulse1) : t >= T.grow && t < T.grow + 0.2 ? 1 - (t - T.grow) / 0.2 : 0;
    K.machine(stage, MACH, {busy, a: edgeA(cam, MACH)});
    // ---- 햇빛 (from essence) slides back into the outlet
    if (t < T.back0 + 0.4) {
      const b = lay([...Q1, '햇빛'])[6], q = easeIn(clamp((t - T.back0) / 0.4)), x = lerp(b.x + b.w / 2, OUTLET[0], q), y = lerp(b.y + b.h / 2, OUTLET[1] - 20, q), s = 1 - 0.8 * q;
      streak(stage, centre(b), [x, y], 1, {len: 0.4, w: 24, a: 0.3});
      c.save(); c.translate(x, y); c.scale(s, s); K.chip(stage, {...b, x: -b.w / 2, y: -b.h / 2}, {kind: 'made'}); c.restore();
    }
    // ---- the question: separate → one block → cut → apart
    const mergedW = mw(TEXT) + 2 * pad;
    const qm = backOut(clamp((t - T.merge0) / 0.4)), qa = spring(clamp((t - T.apart) / 0.6));
    if (t < T.apart) {
      // pieces slide together; at the end one face
      if (qm < 1) B.forEach((b, i) => { const tx = 70 + pad + mw(PRE[i]) - (i ? 0 : 0); const x = lerp(b.x, tx - pad, qm); K.chip(stage, {...b, x, w: lerp(b.w, mw(b.text) + 2 * pad, qm)}, {kind: 'given'}); });
      else {
        K.chip(stage, {text: TEXT, x: 70, y: 300, w: mergedW, h}, {kind: 'given', a: edgeA(cam, {x: 70, y: 300, w: mergedW, h})});
        // word boundaries (muted, under the words)
        const wq = spring(clamp((t - T.words) / 0.5));
        if (wq > 0) WORDS.forEach(([pre, w]) => { const x0 = 70 + pad + mw(pre), x1 = x0 + mw(w); K.line(c, [[x0, 300 + h + 9], [x0 + (x1 - x0) * clamp(wq), 300 + h + 9]], K.rgba(PAL.muted, 0.8), 3); });
        // cuts: thin lines drawn top-down fast, 60 ms apart
        T.cuts.forEach((tc, i) => { const q = clamp((t - tc) / 0.08); if (q <= 0) return; const x = 70 + pad + mw(PRE[i + 1]) - (PRE[i + 1].endsWith(' ') ? mw(' ') / 2 : 0);
          K.line(c, [[x, 290], [x, 290 + (h + 20) * q]], PAL.coolHi, 2.5); ringPop(stage, x, 290 + (h + 20) * q, t, tc + 0.08, {r0: 4, r1: 18, color: PAL.cool, a: 0.6}); });
      }
    } else {
      // pieces spring apart into their own chips
      B.forEach((b, i) => {
        const sx = 70 + mw(PRE[i]) + (i ? 0 : 0), sw = mw(b.text) + 2 * pad;
        const x = lerp(sx, b.x, qa), w = lerp(sw, b.w, clamp(qa));
        const hiT = t >= T.q1hi[0] && t < T.q1hi[1] + 0.4 ? 1 - smooth((t - T.q1hi[1]) / 0.4) : 0;
        K.chip(stage, {...b, x, w}, {kind: 'given', a: edgeA(cam, b), hi: i === 3 && t >= T.token ? 1 - smooth((t - T.token - 1.6) / 0.4) : hiT});
      });
      if (t >= T.token && t < P.tl.at('s08') + 0.3) { const b = B[3]; K.tag(stage, '토큰', b.x + b.w / 2, b.y + b.h + 44, {size: 34, color: PAL.coolHi, a: edgeA(cam, {x: b.x, y: b.y + b.h + 18, w: b.w, h: 52}) * backOut(clamp((t - T.token) / 0.3)) * fadeOut(t, P.tl.at('s08'), 0.3)}); }
    }
    // ---- read the question (s08) → pulse → bars
    if (t >= T.read0 && t < T.read1 + 0.3) K.sweep(stage, B, (t - T.read0) / (T.read1 - T.read0), {a: fadeOut(t, T.read1, 0.3)});
    if (t >= T.read1 && t < T.pulse1) K.beamPulse(G.GC, camPt(cam, B[5].x + B[5].w / 2, B[5].y + B[5].h + 4), camPt(cam, ...INLET), (t - T.read1) / (T.pulse1 - T.read1));
    // ---- rows: five empty rows → the column of 50,257 → back; bars grow
    if (t >= T.rows) drawRows(stage, t, T, cam);
    // ---- s10 links: each 햇빛 in the read text → the 햇빛 bar (thin cool lines, one after another)
    if (t >= T.links[0]) corpusLinks(stage, t, T);
  });
  glowFlush(stage);
  // fixed: the rolling vocabulary size
  if (t >= T.out0 && t < T.ret1) { const q = clamp((t - T.out0) / (T.ret0 - T.out0 - 0.1)); K.bigNum(stage, rollNum(VOCAB, q), '가지', t, T.out0, fadeOut(t, T.ret0 + 0.1, 0.3), {x: 150, y: 470, size: 112, align: 'left', pop: false, sub: 'GPT-2·3의 조각 종류'}); }
  if (t >= T.grow && t < P.tl.at('s09')) {}
}

/** rows under the machine: five bars (dist(Q1)); during the pull-back every other piece of the vocabulary as a row */
function drawRows(stage, t, T, cam) {
  const c = stage.ctx, inq = backOut(clamp((t - T.rows) / 0.4));
  const growI = i => (t >= T.grow ? spring(clamp((t - T.grow - 0.08 * i) / 0.7)) : 0);
  const hiOf = i => (t < T.hi[i] ? 0 : 1 - smooth((t - T.leave) / 0.4));
  const rows = barRows(D0).map((r, i) => ({...r, p: r.p * growI(i), hi: i < 3 ? hiOf(i) : 0}));
  if (t >= T.out0 && t < T.ret1) drawWall(stage, cam);
  c.save(); c.translate(SX0, BARS_Y0); c.scale(1, Math.max(0.01, inq)); c.translate(-SX0, -BARS_Y0);
  bars2(stage, rows, {y0: BARS_Y0, a: clamp(inq * 2), cam: cam.z < 0.9 ? null : cam});
  c.restore();
  if (t >= T.grow) barRows(D0).forEach((r, i) => ringPop(stage, SX0 + 212 + r.p * (SX1 - 120 - SX0 - 212), BARS_Y0 + BAR_P * i + BAR_H / 2, t, T.grow + 0.25 + 0.08 * i, {r0: 6, r1: 26, a: 0.5}));
}
/** the vocabulary wall (entries 5 … 50,256; the first five are the bars). Rows ≥ 4 px: plates; smaller: column bands */
function drawWall(stage, cam) {
  const c = stage.ctx, z = cam.z, ph = BAR_P * z;
  const vx0 = cam.cx + (0 - 540) / z, vx1 = cam.cx + (1080 - 540) / z, vy0 = cam.cy + (272 - 800) / z, vy1 = cam.cy + (1360 - 800) / z;
  for (let col = 0; col < WCOLS; col++) {
    const x = SX0 + col * 1000; if (x > vx1 || x + 892 < vx0) continue;
    const n0 = col * WROWS + (col === 0 ? 5 : 0), n1 = Math.min(VOCAB, (col + 1) * WROWS);
    const r0 = n0 - col * WROWS, r1 = n1 - col * WROWS;
    if (ph >= 4) {
      const a0 = Math.max(r0, Math.floor((vy0 - BARS_Y0) / BAR_P)), a1 = Math.min(r1 - 1, Math.ceil((vy1 - BARS_Y0) / BAR_P));
      c.fillStyle = '#26343B';
      for (let r = a0; r <= a1; r++) { const y = BARS_Y0 + r * BAR_P; c.fillRect(x, y, 200, BAR_H); c.fillRect(x + 212, y + 20, 5, 6); }
    } else {
      const y0 = BARS_Y0 + r0 * BAR_P, y1 = BARS_Y0 + r1 * BAR_P;
      c.fillStyle = '#26343B'; c.fillRect(x, y0, 200, y1 - y0);
      c.fillStyle = '#44525A'; c.fillRect(x + 212, y0, 6, y1 - y0);
      if (ph >= 1.2) { c.fillStyle = 'rgba(0,0,0,0.5)'; const st = Math.max(1, Math.round(3 / ph)); for (let r = r0; r < r1; r += st) c.fillRect(x, BARS_Y0 + r * BAR_P + BAR_H, 200, BAR_P - BAR_H); }
    }
  }
}
const P_END = T => T.leave;

function corpusBoxes(l, t, T) {
  const L = LINES[l], y0 = LINE_Y0 + l * LINE_P;
  const base = lay(L.pieces, {x0: 0, x1: 1e6, y0, size: LSIZE, gap: 8});
  let dx = 70 - L.off - L.v * (t - T.read);
  if (t > T.leave) dx -= 2600 * easeIn(clamp((t - T.leave) / 0.6));
  const enter = backOut(clamp((t - T.read - 0.08 * l) / 0.5));
  dx += (1 - enter) * 1100;
  return base.map(b => ({...b, x: b.x + dx}));
}
function drawCorpus(stage, t, T, cam) {
  for (let l = 0; l < LINES.length; l++) {
    const L = LINES[l];
    corpusBoxes(l, t, T).forEach((b, i) => { if (b.x > 1080 || b.x + b.w < 0) return; K.chip(stage, b, {kind: L.colour[i] ? 'given' : 'ghost', a: (L.colour[i] ? 1 : 0.8) * edgeA(cam, b)}); });
  }
}
function corpusLinks(stage, t, T) {
  const c = stage.ctx, target = [SX0 + 100, BARS_Y0 + BAR_H / 2];
  let k = 0;
  for (let l = 0; l < LINES.length; l++) {
    const L = LINES[l], bx = corpusBoxes(l, t, T);
    L.colour.forEach((col, i) => {
      if (col !== '햇빛') return;
      const t0 = T.links[k++]; if (t < t0) return;
      const b = bx[i], from = [b.x + b.w / 2, b.y + b.h], q = backOut(clamp((t - t0) / 0.3)), a = fadeOut(t, T.leave, 0.3);
      const to = [lerp(from[0], target[0], clamp(q)), lerp(from[1], target[1] - 4, clamp(q))];
      K.withAlpha(c, a, () => { K.line(c, [from, to], K.rgba(PAL.cool, 0.75), 2); K.chip(stage, b, {kind: 'given', hi: 1 - smooth((t - t0) / 0.4)}); });
      ringPop(stage, target[0], target[1], t, t0 + 0.3, {r0: 8, r1: 30, color: PAL.cool, a: 0.5});
    });
  }
}

export const scenes = {token: tokenScene};
export const titles = {
  token: P => { const T = P.token, at = s => P.tl.at(s) - 0.5;
    return [[-Infinity, '조각 = 토큰', '글은 조각으로 나뉜다'], [T.rows - 0.3, '설명용 확률표', '조각마다 다음에 올 확률'], [T.out0, 'GPT-2·3 · 뒤로 빠져 보기', '조각 종류 전체'], [T.ret0 + 0.3, '설명용 확률표', '조각마다 다음에 올 확률'],
      [at('s10'), '설명용 확률표', '읽어 둔 글에서 이어진 만큼']]; },
};

export function soundToken(tl, P) {
  const T = P.token, ev = [];
  T.cuts.forEach((tc, i) => ev.push(snd.tick('token_cut' + (i + 1), tc + 0.08, 300 + 40 * i, -28, `자르는 선 ${i + 1}이 그어짐(60 ms 간격)`, {decay: 0.05})));
  ev.push(snd.whoosh('token_pullback', T.out0, 0.8, 200, 520, -34, '뒤로 빠짐: 막대 다섯이 조각 50,257가지의 기둥 맨 위임이 드러남'));
  ev.push(snd.whoosh('token_return', T.ret0, 0.6, 520, 200, -34, '기둥에서 막대 다섯으로 돌아옴'));
  ev.push(snd.swell('token_read', T.read0, [131, 196], 1.0, -34, '질문을 읽음 → 기계로 펄스'));
  barRows(D0).forEach((r, i) => ev.push(snd.tone('token_bar' + (i + 1), T.grow + 0.25 + 0.08 * i, Math.round(150 + 420 * r.p), 0.35, -32 - (r.kind === 'rest' ? 4 : 0), `확률 막대 '${r.label}'가 ${Math.round(r.p * 100)}%까지 자람(높이 = 확률)`, {decay: 0.15})));
  T.hi.forEach((th, i) => ev.push(snd.tick('token_hi' + (i + 1), th, [392, 330, 262][i], -28, `'${D0[i].piece}' 막대가 강조됨`, {decay: 0.08})));
  T.links.forEach((tl0, k) => ev.push(snd.tick('token_link' + (k + 1), tl0 + 0.3, 494, -36, `읽어 둔 글의 '햇빛' ${k + 1}이 햇빛 막대에 이어짐`, {decay: 0.04})));
  return ev;
}
export const signature = P => [P.token.cut0, P.token.grow, P.token.links[0]].map(x => x.toFixed(3)).join(',');
