// 45 GPT는 문맥을 어떻게 읽을까 — layers (s16–s18), far (s19), learned (s20), close (s21). PLAN.md §3, ../gpt-generative/PLAN.md §1.1–1.2.
// Every time is computed once in planOut (word anchors via kit.wd); picture and sound read the same numbers.
import * as K from '../gpt-generative/kit.mjs';
import {camAt, camPt, drop, squash, streak, ringPop, rollNum, backOut, spring} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
import {rowOf, slotOf, topC, botC, drawRow, morphRow, drawMorph, glink, flushGlow, wbars, mapWorld, mp, MAPW, MAPP, bigC, pull, lerp2, lerpR,
  capsule, world, frameBoxes, chipE, probBars34, panelAt, layerStack, PANEL_Y, BAR_Y, LONG_SIZE, apexFor} from './parts.mjs';
import {rowGroup, ptsBox} from './scenes_core.mjs';
import {cycleState, drawCycle} from './scenes_intro.mjs';
const {PAL, clamp, lerp, smooth, easeOut, easeIn, easeInOut, fadeIn, fadeOut, wd, tag, snd, hitFlash, withAlpha, line, rgba, mix} = K;

const E0 = M.E.배, RS = M.RUN.SHIP, SHIPW = RS.W[0], X1P = M.RUN.PEAR.X[1][2];
const LONGW = M.RUN.LONG.W[0][M.LONG.length - 1];
const ROWS3 = M.topRows(RS.X[4][2]).slice(0, 3).map(r => r.label);
const END_ROWS = M.rows5(RS.X[4][2]), START_ROWS = M.rows5(E0);
const CLOSE_P = 3.25, PH0 = 1.0;
// s20: lines of other text the model reads while learning (ghost chips; context words in cool)
const CORPUS = [['배가', '항구를', '떠났다'], ['잘', '익은', '배는', '달다'], ['항구를', '떠난', '배는', '바다로'], ['달게', '익은', '배를', '깎았다'],
  ['폭풍을', '만난', '배가', '돌아왔다'], ['익은', '배', '한', '개를'], ['배를', '타고', '항구를', '떠난다'], ['배', '맛이', '달게', '익었다']];
const CTXW = new Set(['항구를', '떠난', '떠났다', '익은', '달게', '익었다', '떠난다', '타고', '폭풍을', '만난', '바다로', '맛이', '깎았다', '달다']);

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planOut(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  const L = {};
  L.t0 = SC.layers.start;
  L.look = [W_('s16', '모든'), W_('s16', '저마다')];
  L.move = [W_('s16', '동시에')]; const t2 = W_('s17', '다시'); L.move.push(t2, t2 + 1.45, t2 + 2.9);
  L.moveD = [0.9, 0.8, 0.75, 0.7];
  L.one = W_('s16', '층이라고');
  L.n96 = W_('s17', '아흔여섯개'); L.n96D = 0.75;
  L.lit = W_('s18', '마지막'); L.endDot = W_('s18', '점이'); L.tilt = W_('s18', '자리에');
  L.bars = W_('s18', '다음에'); L.barT = [0, 1, 2, 3, 4].map(i => L.bars + 0.15 * i);
  L.top = W_('s18', '확률이'); L.back = P.tl.at('s18:end') - 0.3;
  P.L = L;
  const F = {};
  F.t0 = SC.far.start;
  F.mid = W_('s19', '가운데'); F.skip = W_('s19', '않고'); F.line = W_('s19', '곧바로'); F.lineD = 0.2;
  F.lineEnd = F.line + F.lineD; F.crawl0 = F.line; F.crawlEnd = P.tl.at('s19:end') - 0.6;
  F.bar = W_('s19', '맨');
  P.F = F;
  const G = {};
  G.t0 = SC.learned.start;
  G.look = W_('s20', '주의를'); G.flow = W_('s20', '사람이'); G.k0 = W_('s20', '지피티가'); G.k1 = W_('s20', '익혔습니다') + 0.4;
  G.tag = W_('s20', '익혔습니다');
  G.pass = CORPUS.map((_, i) => G.flow + 0.62 * i + 0.9);           // each line crosses the map's middle height
  P.G = G;
  const C = {};
  C.t0 = SC.close.start; C.c0 = P.end - PH0 - 2 * CLOSE_P;
  C.whips = [C.c0, C.c0 + CLOSE_P, C.c0 + 2 * CLOSE_P].filter(x => x < P.end - 0.2);
  P.C = C;
  return P;
}
export const signature = P => [P.L.move[0], P.L.n96, P.L.bars, P.F.line, P.G.k0, P.C.c0].map(x => x.toFixed(3)).join(',');

const reach = (t, t0, d = 0.22) => easeOut(clamp((t - t0) / d));
const since = (t, t0, d = 0.22) => (t >= t0 + d ? t - t0 - d : -1);

// =====================================================================================================
// LAYERS (s16–s18)
// =====================================================================================================
/** positions of the three words at time t: layer l moves X[l-1] → X[l] at L.move[l-1] with the pull profile */
function layerPos(t, L) {
  let l = 0; while (l < 4 && t >= L.move[l]) l++;
  if (l === 0) return {X: RS.X[0], cur: 0, q: 0};
  const q = (t - L.move[l - 1]) / L.moveD[l - 1], f = pull(q);
  return {X: RS.X[l].map((x, i) => lerp2(RS.X[l - 1][i], x, f)), cur: l, q, from: RS.X[l - 1], to: RS.X[l]};
}
function layersScene(stage, t, p, ctx) {
  const P = ctx.P, L = P.L, S = P.S, c = stage.ctx, ship = rowOf('SHIP'), pear = rowOf('PEAR');
  const lp = layerPos(t, L), X = lp.X;
  const camFruit = frameBoxes([ptsBox([M.E.달게, M.E.익은, E0, X1P])], {zMax: 1.5});
  const camStack = frameBoxes([[0, 520, 420, 1335]], {zMax: 1.35}), camPanel = frameBoxes([[60, 740, 1020, PANEL_Y + 340]]);
  const cam = camAt(t, [{t: L.t0, ...camFruit}, {t: L.t0 + 0.45}, {t: L.n96 - 0.6}, {t: L.n96 - 0.1, ...camStack}, {t: L.n96 + L.n96D}, {t: L.tilt - 0.1}, {t: L.tilt + 0.5, ...camPanel},
    {t: L.back, ...camPanel}, {t: L.back + 0.5}]);
  const {GW} = K.glowBegin();
  const nCells = t < L.n96 ? 4 : lerp(4, 96, easeIn(clamp((t - L.n96) / L.n96D)));
  world(stage, cam, () => {
    // ---- map: the three words move together each layer; the swap's ghosts leave
    const gA = 1 - clamp((t - L.t0) / 0.35), snapQ = easeIn(clamp((t - L.t0) / 0.3));
    const words = {항구를: {uv: X[0]}, 떠난: {uv: X[1]}, 달게: {a: 0.75}, 익은: {a: 0.75}};
    const baeUV = t < L.t0 + 0.3 ? lerp2(X1P, E0, snapQ) : X[2];
    const trails = []; for (let l = 1; l <= lp.cur; l++) { const q = l < lp.cur ? 1 : clamp(pull(lp.q)); trails.push({pts: [RS.X[l - 1][2], RS.X[l][2]], q}, {pts: [RS.X[l - 1][1], RS.X[l][1]], q, a: 0.6}); }
    const dots = mapWorld(stage, MAPW, {regA: 1, regLA: 1, backA: 0.55, words, ghosts: [{uv: E0}, ...(gA > 0 ? [{uv: X1P, warm: true, a: gA}] : [])],
      trails: [...(gA > 0 ? [{pts: [E0, X1P], q: 1, a: gA * 0.6}] : []), ...trails],
      bae: {uv: baeUV, sq: L.move.reduce((m, te, i) => m * squash(t, te + L.moveD[i] * 0.6, 0.14, 0.2), 1), hi: Math.max(hitFlash(t, L.endDot, 0.8), t > L.endDot && t < L.back ? 0.7 : 0)}});
    ringPop(stage, ...mp(MAPW, RS.X[4][2]), t, L.endDot, {color: PAL.hot, r1: 52});
    // pull lines on the map while a layer moves (each word from the words it looks at)
    if (lp.cur > 0 && lp.q < 1.4) {
      const fa = 1 - smooth((lp.q - 1) / 0.4), pairs = [[2, 0, SHIPW[2][0]], [2, 1, SHIPW[2][1]], [1, 0, SHIPW[1][0]]];
      for (const [i, j, w] of pairs) glink(GW, cam, mp(MAPW, X[j]), mp(MAPW, X[i]), w * 0.9, 1, {straight: true, a: 0.85 * fa});
      if (lp.q < 0.7) streak(stage, mp(MAPW, lp.from[2]), mp(MAPW, lp.to[2]), pull(lp.q) / 1.08, {w: 7, len: 0.4});
    }
    // ---- layer stack (left edge): 4 cells, then it shoots up to 96; s18 lights them bottom → top
    layerStack(stage, nCells, {x: 14, w: 34, y1: 520, y2: 1330, cur: t < L.n96 ? lp.cur : 0, done: t < L.n96 ? lp.cur : 0, lit: t >= L.lit ? clamp((t - L.lit) / 1.0) : t >= L.n96 ? 1 : -1, a: backOut(clamp((t - L.t0 - 0.3) / 0.4))});
    // ---- the line from the last point down to the meter; the meter below the map
    const dq = easeOut(clamp((t - L.tilt) / 0.45)), backA = 1 - clamp((t - L.back - 0.4) / 0.3);
    if (dq > 0 && backA > 0) { const from = mp(MAPW, RS.X[4][2]), to = [from[0], PANEL_Y - 4]; withAlpha(c, backA, () => line(c, [from, lerp2(from, to, dq)], rgba(PAL.warm, 0.8), 2.5, {dash: [6, 7]})); }
    if (t > L.tilt) { panelAt(stage, PANEL_Y, 340, fadeIn(t, L.tilt + 0.2, 0.3));
      probBars34(stage, END_ROWS.map((r, i) => ({...r, p: r.p * spring(clamp((t - L.barT[i]) / 0.5), 13, 6), ghostP: t > L.barT[i] ? START_ROWS[i].p : null, hi: i === 0 && t > L.top ? 1 : 0})), {y0: PANEL_Y + 24}); }
    // ---- row: PEAR → SHIP at the start; lines of every word re-reach at each layer
    const mq = clamp((t - L.t0) / 0.5);
    if (mq < 1) drawMorph(stage, morphRow(pear, ship, mq)); else drawRow(stage, ship, i => ({hi: i === 2 ? hitFlash(t, L.endDot, 0.8) : 0}));
    const lookT = l => (l === 0 ? null : L.move[l - 1] - 0.3);
    for (const [i, j] of [[2, 0], [2, 1], [1, 0]]) {
      const t0 = i === 2 ? L.look[0] : L.look[1]; if (t < t0) continue;
      let q = reach(t, t0), wv = since(t, t0);
      for (let l = 2; l <= 4; l++) { const tl = lookT(l); if (t >= tl) { q = reach(t, tl, 0.18); wv = since(t, tl, 0.18); } }
      glink(GW, cam, topC(ship[i]), topC(ship[j]), clamp(SHIPW[i][j] * 1.4), q, {whip: wv, a: 1 - clamp((t - L.tilt) / 0.3)});
    }
    // the most likely next word appears as a ghost in the slot after '배'
    if (t > L.back + 0.3) chipE(stage, {...slotOf(ship), text: END_ROWS[0].label, w: 200}, {kind: 'ghost', pop: backOut(clamp((t - L.back - 0.3) / 0.35))});
  });
  flushGlow(stage);
  // big number: the layer count (screen-fixed, lower right of the map)
  if (t > L.move[0] && t < L.tilt - 0.2) {
    const n = t < L.n96 ? String(Math.max(1, lp.cur)) : rollNum(96, (t - L.n96) / L.n96D, {from: 4});
    bigC(stage, n, '층', t, L.move[0], fadeOut(t, L.tilt - 0.6, 0.3), {x: 800, y: 1230, size: 110, pop: false, sub: t > L.n96 ? 'GPT-3' : null});
  }
}

// =====================================================================================================
// FAR (s19) — the long row at the window's middle: tall attention arcs (the stroke to 항구를 highest), the weight bars
// under the words, the old way's lane below (the capsule crawls, its first-word share shrinking), two results side by side.
// The map is not shown in s19–s20 (2nd review).
// =====================================================================================================
const LANE = {y: 800, h: 84}, RES_Y = 1090;
const tallApex = L => clamp(50 + 0.25 * L, 60, 270);
/** left and right results: same size, short labels */
function results(stage, t, F, oldShare) {
  const a = fadeIn(t, F.lineEnd, 0.15);
  if (a > 0) { bigC(stage, rollNum(Math.round(LONGW[0] * 100), (t - F.lineEnd) / 0.5), '%', t, F.lineEnd, a, {x: 300, y: RES_Y, size: 130});
    stage.text('트랜스포머', 300, RES_Y + 92, {size: 34, weight: 700, color: PAL.warm, align: 'center', alpha: a}); }
  const b = fadeIn(t, F.crawl0, 0.15);
  if (b > 0) { bigC(stage, String(Math.round(oldShare * 100)), '%', t, F.crawl0, b, {x: 780, y: RES_Y, size: 130, pop: false, unitColor: PAL.cool});
    stage.text('예전 방식', 780, RES_Y + 92, {size: 34, weight: 700, color: PAL.cool, align: 'center', alpha: b}); }
}
function farScene(stage, t, p, ctx) {
  const P = ctx.P, F = P.F, c = stage.ctx, ship = rowOf('SHIP'), long = rowOf('LONGC');
  const cam = {cx: 540, cy: 800, z: 1};
  const {GW} = K.glowBegin();
  // crawl: constant slow speed from the first word to '배'; its share drops at each word it passes
  const cq = clamp((t - F.crawl0) / (F.crawlEnd - F.crawl0)), pos = cq * 7, k = Math.floor(pos), fr = pos - k;
  const cx = i => long[Math.min(7, i)].x + long[Math.min(7, i)].w / 2;
  const capX = lerp(cx(k), cx(k + 1), fr), passed = Math.min(7, k + (fr > 0.5 ? 1 : 0)), share = M.oldShare(passed);
  world(stage, cam, () => {
    // the map leaves (layers → far)
    const mA = 1 - clamp((t - F.t0) / 0.3);
    if (mA > 0) { const X4 = RS.X[4]; mapWorld(stage, MAPW, {a: mA, regA: 1, regLA: 1, backA: 0.55, words: {항구를: {uv: X4[0]}, 떠난: {uv: X4[1]}, 달게: {a: 0.75}, 익은: {a: 0.75}}, ghosts: [{uv: E0}], bae: {uv: X4[2]}});
      chipE(stage, {...slotOf(ship), text: END_ROWS[0].label, w: 200}, {kind: 'ghost', a: mA}); }
    const mq = clamp((t - F.t0) / 0.6);
    const midHi = i => (i >= 2 && i <= 6 ? hitFlash(t, F.mid + 0.12 * (6 - i), 0.5) : 0);
    if (mq < 1) drawMorph(stage, morphRow(ship, long, mq));
    else drawRow(stage, long, i => ({hi: i === 0 ? (t > F.lineEnd ? 1 : 0) : midHi(i), dim: i >= 2 && i <= 6 ? 0.45 * smooth((t - F.skip) / 0.3) : 0}));
    // weight bars under the words (% for the three that matter; the others are 6 % each — the bars say it)
    if (t > F.lineEnd) wbars(stage, long, LONGW, {y: long[0].y + long[0].h + 14, S: 220, g: i => spring(clamp((t - F.lineEnd - 0.03 * i) / 0.5), 13, 6), show: LONGW.map((_, i) => i < 7), pctA: 1, pctShow: LONGW.map(w => w >= 0.1)});
    // the old way's lane: a track under the row, a tick under each word, the capsule crawling along it
    const la = fadeIn(t, F.t0 + 0.3, 0.3);
    withAlpha(c, la, () => {
      K.rect(c, long[0].x - 12, LANE.y, long[7].x + long[7].w - long[0].x + 24, LANE.h, 14, rgba('#03141C', 0.7), rgba(PAL.panelEdge, 0.9), 1.4);
      for (let i = 0; i < 8; i++) line(c, [[cx(i), LANE.y + LANE.h - 12], [cx(i), LANE.y + LANE.h - 4]], rgba(PAL.muted, 0.7), 1.5);
      if (t > F.crawl0) line(c, [[cx(0), LANE.y + LANE.h - 8], [capX, LANE.y + LANE.h - 8]], rgba(PAL.cool, 0.6), 2.5, {dash: [3, 6]});
    });
    if (t > F.crawl0 - 0.3) capsule(stage, t > F.crawl0 ? capX : cx(0), LANE.y + 10, t > F.crawl0 ? share : 1, {a: backOut(clamp((t - F.crawl0 + 0.3) / 0.3)), w: 70, h: 62});
    // attention: the stroke to 항구를 in one go (highest, thickest); the other words' lines come with it, lower and thinner
    if (t > F.line) for (let j = 0; j < 7; j++) {
      const q = j === 0 ? easeIn(clamp((t - F.line) / F.lineD)) : easeOut(clamp((t - F.line - 0.05) / 0.25));
      const L = Math.abs(cx(7) - cx(j));
      glink(GW, cam, topC(long[7]), topC(long[j]), clamp(LONGW[j] * 2.2), q, {apex: tallApex(L), whip: since(t, F.line, F.lineD)});
    }
  });
  flushGlow(stage);
  results(stage, t, F, t > F.crawl0 ? share : 1);
}

// =====================================================================================================
// LEARNED (s20) — the same centred layout for 항구를 떠난 배: equal weights at first, learned while text flows behind
// =====================================================================================================
function learnedScene(stage, t, p, ctx) {
  const P = ctx.P, G = P.G, F = P.F, c = stage.ctx, shipC = rowOf('SHIPC'), ship = rowOf('SHIP'), long = rowOf('LONGC');
  const kq = easeInOut(clamp((t - G.k0) / (G.k1 - G.k0))), W = M.attnAt(M.SHIP, kq)[2];
  const camRow = frameBoxes([[shipC[0].x - 40, shipC[0].y - 170, shipC[2].x + shipC[2].w + 40, shipC[0].y + shipC[0].h + 150]], {zMax: 1.3});
  const tOut = P.sc.learned.end - 0.6;                                          // back to the stage's top row for the close
  const cam = camAt(t, [{t: G.k0 - 0.3}, {t: G.k0 + 0.3, ...camRow}, {t: tOut - 0.05, ...camRow}, {t: P.sc.learned.end - 0.05}]);
  const {GW} = K.glowBegin();
  const oq = easeInOut(clamp((t - tOut) / 0.55)), row = shipC.map((b, i) => ({...b, y: lerp(b.y, ship[i].y, oq)}));
  world(stage, cam, () => {
    // other text flowing up behind the row (read while learning)
    CORPUS.forEach((ws, i) => {
      const y = 1360 - (t - (G.pass[i] - 1.0)) * 520; if (y > 1360 || y < 300) return;
      const boxes = K.layoutChips(ws, {x0: 0, x1: 1e5, y0: 0, size: LONG_SIZE}), wt = boxes[boxes.length - 1].x + boxes[boxes.length - 1].w, x0 = 540 - wt / 2 + (i % 2 ? 150 : -150);
      const band = Math.min(clamp((row[0].y - 120 - (y + 54)) / 40), 1) + clamp((y - (row[0].y + row[0].h + 110)) / 40);   // hidden while it passes behind the row and its bars
      const a = 0.5 * clamp((1360 - y - 54) / 60) * clamp((y - 300) / 60) * clamp(band);
      boxes.forEach(b => chipE(stage, {...b, x: b.x + x0, y}, {kind: b.text.startsWith('배') ? 'made' : CTXW.has(b.text) ? 'given' : 'ghost', a}));
    });
    // the far scene's lane and bars leave; the row: long → 항구를 떠난 배 (centred)
    const off = 1 - clamp((t - G.t0) / 0.25);
    if (off > 0) { withAlpha(c, off, () => K.rect(c, long[0].x - 12, LANE.y, long[7].x + long[7].w - long[0].x + 24, LANE.h, 14, rgba('#03141C', 0.7), rgba(PAL.panelEdge, 0.9), 1.4));
      for (let j = 0; j < 7; j++) glink(GW, cam, topC(long[7]), topC(long[j]), clamp(LONGW[j] * 2.2), off, {apex: tallApex(Math.abs(long[7].x - long[j].x))}); }
    const mq = clamp((t - G.t0) / 0.6);
    if (mq < 1) drawMorph(stage, morphRow(long, shipC, mq)); else drawRow(stage, row);
    if (mq > 0.5) wbars(stage, row, W, {y: row[0].y + row[0].h + 14, g: i => (t < G.look ? 0 : spring(clamp((t - G.look - 0.1 * i) / 0.5), 13, 6))});
    if (t > G.look) for (let j = 0; j < 2; j++) {
      const L = Math.abs(row[2].x - row[j].x);
      glink(GW, cam, topC(row[2]), topC(row[j]), clamp(W[j] * 1.4), reach(t, G.look), {whip: since(t, G.look), a: lerp(0.55, 1, kq), apex: lerp(clamp(40 + 0.35 * L, 60, 150), apexFor(L), oq)});
    }
    if (t > G.tag - 0.1) tag(stage, '글을 읽으며 익힘', 540, row[0].y + row[0].h + 110, {size: 34, color: PAL.ink, a: fadeIn(t, G.tag - 0.1, 0.15) * (1 - oq)});
  });
  flushGlow(stage);
}

// =====================================================================================================
// CLOSE (s21) — SHIP → vehicle, PEAR → fruit, once each; the poster returns (same picture as 0 s)
// =====================================================================================================
function closeScene(stage, t, p, ctx) {
  const P = ctx.P, C = P.C, G = P.G;
  const mq = easeInOut(clamp((t - P.poster) / 0.8)), R = lerpR(MAPW, MAPP, mq);
  const {GW} = K.glowBegin(), cam = {cx: 540, cy: 800, z: 1};
  const tc = Math.max(t, C.c0);
  world(stage, cam, () => {
    drawCycle(stage, GW, cam, tc, cycleState(tc, PH0 - P.end, CLOSE_P), R, {mapA: smooth((t - C.t0) / 0.5)});
    // the learned scene's backdrop words leave
    const la = 1 - clamp((t - C.t0) / 0.35);
    if (la > 0) for (const w of [...M.BACKDROP.vehicle, ...M.BACKDROP.fruit]) { const [x, y] = mp(R, M.E[w]); K.withAlpha(stage.ctx, la * 0.55, () => K.circle(stage.ctx, x, y, 12, PAL.cool)); }
  });
  flushGlow(stage);
}

export const scenes = {layers: layersScene, far: farScene, learned: learnedScene, close: closeScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  layers: P => [[-Infinity, '층 · 모든 낱말이 동시에', '한 번 살피고 옮기면 한 층'], [P.tl.at('s17') - 0.5, '층 · 화면의 모형은 4층', '다시 살필수록 또렷해진다'], [P.L.n96 - 0.4, 'GPT-3 · 화면의 모형은 4층', '층을 아흔여섯 개 쌓았다'],
    [P.tl.at('s18') - 0.5, '마지막 층 → 다음 말', '다음에 올 말의 확률']],
  far: P => [[-Infinity, '멀리 있는 낱말', '맨 앞 낱말도 곧바로']],
  learned: P => [[-Infinity, '익힌 주의', '어디를 볼지는 글에서 익혔다']],
  close: P => [[-Infinity, '정리', '앞말을 살펴 뜻을 바꾼다']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundOut(tl, P) {
  const L = P.L, F = P.F, G = P.G, C = P.C, ev = [];
  ev.push(snd.swell('lay_look', L.look[0], [196, 294], 1.0, -35, 's16: 모든 낱말이 저마다 앞을 살핌(선이 낱말마다)'));
  L.move.forEach((te, i) => ev.push(snd.tone('lay_move' + (i + 1), te, [262, 294, 330, 349][i], 0.35, -32 - 1.5 * i, `${i + 1}층: 세 점이 함께 옮겨 감(옮기는 폭 ${M.moves(M.RUN.SHIP)[i].toFixed(2)} — 층마다 한 음씩 높고 작게)`, {decay: 0.15})));
  ev.push(snd.tick('lay_one', L.one, 147, -34, 's16: 큰 숫자 1층', {decay: 0.14}));
  ev.push(snd.whoosh('lay_96', L.n96, L.n96D, 160, 420, -36, 's17: 층 칸이 96까지 솟구침'));
  ev.push(snd.swell('lay_96s', L.n96 + L.n96D, [147, 220], 1.2, -36, 's17: 큰 숫자 96층'));
  ev.push(snd.whoosh('lay_lit', L.lit, 1.0, 140, 320, -40, 's18: 96층을 아래에서 위로 지나감'));
  ev.push(snd.tick('lay_end', L.endDot, 330, -32, "s18: 마지막 층의 '배' 점", {decay: 0.1}));
  L.barT.forEach((te, i) => ev.push(snd.tone('lay_bar' + (i + 1), te, Math.round(196 + 400 * END_ROWS[i].p), 0.22, -33, `s18: 다음 말 막대 ${END_ROWS[i].label} ${Math.round(END_ROWS[i].p * 100)}% — 길이에 따른 높이`, {decay: 0.1})));
  ev.push(snd.tick('lay_top', L.back + 0.3, 262, -34, `s18: 맨 윗말 '${END_ROWS[0].label}'이 빈 자리에 흐리게`, {decay: 0.1}));
  ev.push(snd.chirp('far_line', F.line, [[0, 220, 0], [0.02, 220, 0.8], [F.lineD, 440, 0.8], [F.lineD + 0.6, 440, 0]], -34, "s19: '배'에서 맨 앞 낱말로 한 획에 닿음(긴 음)"));
  ev.push(snd.train('far_crawl', Array.from({length: 7}, (_, i) => [F.crawl0 + (F.crawlEnd - F.crawl0) * (i + 1) / 7, 'tick', {freq: Math.round(220 + 270 * M.oldShare(i + 1)), decay: 0.08, click: 0, gain_db: 0}]), -40,
    's19: 예전 방식의 기억 덩어리가 느리게 한 칸씩 기어감(몫만큼 낮아지는 틱)'));
  ev.push(snd.tick('far_res', F.lineEnd, 147, -34, `s19: 왼쪽 결과 ${Math.round(LONGW[0] * 100)}%(트랜스포머)가 뜸`, {decay: 0.14}));
  ev.push(snd.tick('far_old', F.crawlEnd, 147, -36, `s19: 기억 덩어리가 '배'에 닿음 — 예전 방식 ${Math.round(M.oldShare(7) * 100)}%`, {decay: 0.14}));
  ev.push(snd.swell('learn_look', G.look, [196, 294], 1.0, -36, 's20: 처음에는 같은 굵기의 선'));
  ev.push(snd.train('learn_flow', G.pass.map(te => [te, 'tick', {freq: 247, decay: 0.05, click: 0, gain_db: 0}]), -42, 's20: 다른 글줄이 하나 지나갈 때마다 약한 틱(익히는 동안)'));
  ev.push(snd.tone('learn_tag', G.tag, 294, 0.4, -36, "s20: 굵기가 지금 값으로 갈림, 꼬리표 '글을 읽으며 익힘'", {decay: 0.2}));
  C.whips.forEach((te, i) => ev.push(snd.tone('close_whip' + (i + 1), te, 294, 0.3, -32, `s21: 주의의 선이 뻗음(${i % 2 ? '달게 익은 배' : '항구를 떠난 배'})`, {decay: 0.12})));
  ev.push(snd.swell('poster_end', P.poster, [196, 294], 1.6, -35, '포스터 구도로 돌아옴'));
  return ev;
}
