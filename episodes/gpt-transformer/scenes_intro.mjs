// 45 GPT는 문맥을 어떻게 읽을까 — hook (s01–s03), origin (s04–s05), essence (s06–s09). PLAN.md §3, ../gpt-generative/PLAN.md §1.1.
// Every time is computed once in planIntro (word anchors via kit.wd); picture and sound read the same numbers.
import * as K from '../gpt-generative/kit.mjs';
import {camAt, camPt, drop, squash, streak, ringPop, rollNum, backOut, spring} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
import {rowOf, slotOf, topC, botC, drawRow, morphRow, drawMorph, glink, flushGlow, wbars, mapWorld, mp, plate, MAPW, MAPP, bigC, pull, lerp2, lerpR,
  bundle, capsule, world, BAR_Y, CELL_H, CELL_GAP, CELL_W, frameBoxes, chipE, probBars34, panelAt, edgeA} from './parts.mjs';
import {rowGroup, ptsBox} from './scenes_core.mjs';
const {PAL, clamp, lerp, smooth, easeOut, easeIn, easeInOut, fadeIn, fadeOut, wd, tag, snd, hitFlash, withAlpha, line, rgba, rng, mix} = K;

const E0 = M.E.배, CYC = 2.6, PH0 = 1.0, S03_PANEL = 1030;
const SENT = [{name: 'SHIP', words: M.SHIP, W: M.RUN.SHIP.W[0][2], X4: M.RUN.SHIP.X[4][2]}, {name: 'PEAR', words: M.PEAR, W: M.RUN.PEAR.W[0][2], X4: M.RUN.PEAR.X[4][2]}];
// s03 / s18 rows: the three most likely next words after 4 layers (SHIP), here at the start point
const ROWS3 = M.topRows(M.RUN.SHIP.X[4][2]).slice(0, 3).map(r => r.label);
const START_ROWS = M.rows5(E0);
// number bundles (s07): cells 1–2 = the word's map u, v; cells 3–8 = seeded values (rng 45)
const R45 = rng(45), BVALS = Object.fromEntries(M.SHIP.map(w => [w, [M.E[w][0], M.E[w][1], ...Array.from({length: 6}, () => R45() * 2 - 1)]]));
const COLV = Array.from({length: 90}, () => R45() * 2 - 1);                     // the long column's further cells (s07)
const GPT = ['G', 'P', 'T'], TILE = {w: 160, h: 160, y: 620, gap: 26};
const tileBox = i => ({i, text: GPT[i], x: 540 - (3 * TILE.w + 2 * TILE.gap) / 2 + i * (TILE.w + TILE.gap), y: TILE.y, w: TILE.w, h: TILE.h});

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planIntro(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  const H = {};
  H.cycEnd = W_('s02', "'항구를") - 0.35;
  H.cycStarts = []; for (let k = 0; ; k++) { const t0 = k * CYC - PH0; if (t0 >= H.cycEnd) break; if (t0 >= 0) H.cycStarts.push(t0); }
  H.pear2 = W_('s02', "'달게");
  H.same = W_('s02', '글자가'); H.arr = [H.same + 0.35, H.same + 0.5];
  H.which = W_('s02', '뜻이');
  H.s03 = P.tl.at('s03') - 0.2;
  H.bars = W_('s03', '다음에'); H.barT = [0, 1, 2, 3, 4].map(i => H.bars + 0.3 * i);
  H.ctxRead = W_('s03', '앞의'); H.ctx = W_('s03', '문맥을'); H.look = W_('s03', '보고'); H.which2 = W_('s03', '어느'); H.slotHi = W_('s03', '가려내야');
  P.H = H;
  const O = {};
  O.t0 = SC.origin.start;
  O.k0 = W_('s04', '한');
  const gaps = [0.75, 0.68, 0.61, 0.54, 0.47, 0.40, 0.33];                       // hops get faster
  O.hop = []; let tt = O.k0 + 0.55; for (const g of gaps) { O.hop.push(tt); tt += g; }
  O.hopD = 0.3; O.land = O.hop.map(x => x + O.hopD);
  O.big = O.land[6];
  O.clear = W_('s05', '이천십칠년');
  O.prob = W_('s05', '문제를'); O.push = W_('s05', '새'); O.burst = W_('s05', '트랜스포머를');
  O.again = W_('s05', '이것이');
  O.tiles = W_('s05', '마지막'); O.tHi = W_('s05', '티입니다');
  P.O = O;
  const E = {};
  E.t0 = SC.essence.start;
  E.shape = W_('s06', "'모양을"); E.mean = W_('s06', '낱말의'); E.drop = W_('s06', '뜻을'); E.change = W_('s06', '바꿉니다');
  E.read = W_('s07', '계산으로'); E.each = W_('s07', '낱말'); E.fan = W_('s07', '숫자'); E.fanT = [0, 1, 2].map(i => E.fan + 0.15 * i);
  E.big = W_('s07', '묶음으로');
  E.fold = P.tl.at('s08') - 0.1; E.mapLit = W_('s08', '지도의');
  E.slide = [W_('s08', '읽으면'), W_('s08', '하나는'), W_('s08', '점') - 0.75]; E.land = E.slide.map(x => x + 0.75);
  E.back = W_('s09', '가까운'); E.backT = [...M.BACKDROP.vehicle, '달게', '익은', ...M.BACKDROP.fruit].map((w, i) => ({w, t: E.back + 0.13 * i}));
  E.reg = W_('s09', '가까워서'); E.veh = W_('s09', '탈것에'); E.fru = W_('s09', '과일에'); E.both = W_('s09', '서로');
  P.E = E;
  return P;
}
export const signature = P => [P.H.cycEnd, P.H.bars, P.O.k0, P.O.burst, P.E.fan, P.E.land[2], P.E.back].map(x => x.toFixed(3)).join(',');

const reach = (t, t0, d = 0.22) => easeOut(clamp((t - t0) / d));
const since = (t, t0, d = 0.22) => (t >= t0 + d ? t - t0 - d : -1);

// =====================================================================================================
// the hook cycle (also used by close, with its own period): row + lines + bars + map point pulled to X4
// cyc = {idx, tau, period}; R = map rect; o = {barsA, camz}
// =====================================================================================================
export function cycleState(t, t0Phase, period) { const u = t + t0Phase, idx = Math.floor(u / period); return {idx, tau: u - idx * period, period, sent: SENT[((idx % 2) + 2) % 2], next: SENT[(((idx + 1) % 2) + 2) % 2]}; }
export function drawCycle(stage, G, cam, t, cy, R, o = {}) {
  const {tau, period, sent, next} = cy, row = rowOf(sent.name), rowN = rowOf(next.name), sw = clamp((tau - (period - 0.4)) / 0.4);
  const outA = o.outA ?? 1;
  // map: the sentence's two words, the point pulled toward X4, its ghost start
  const pq = (tau - 0.45) / 1.2, pt = lerp2(E0, sent.X4, pull(pq)), back = sw > 0 ? easeIn(clamp(sw / 0.6)) : 0, now = lerp2(pt, E0, back);
  const words = {}; sent.words.slice(0, 2).forEach(w => (words[w] = {a: outA * (1 - sw)})); next.words.slice(0, 2).forEach(w => (words[w] = {a: outA * sw}));
  const dots = mapWorld(stage, R, {a: o.mapA ?? 1, regA: o.regA ?? 0.8, regLA: o.regA ?? 0.8, words, ghosts: [{uv: E0, a: 0.8}], trails: [{pts: [E0, sent.X4], q: clamp(pull(pq)) * (1 - back), a: outA}],
    bae: {uv: now, sq: squash(t, t - tau + 0.45 + 1.2 * 0.6, 0.14, 0.2)}});
  if (pq > 0 && pq < 0.7) streak(stage, mp(R, E0), mp(R, sent.X4), pull(pq) / 1.08, {w: 7, len: 0.35, a: 0.5 * outA});
  // map pull lines (thin) while the point moves
  if (pq > -0.1 && pq < 1.3 && outA > 0) sent.words.slice(0, 2).forEach((w, j) => glink(G, cam, mp(R, M.E[w]), mp(R, now), sent.W[j] * 0.8, reach(t, t - tau + 0.3, 0.2), {apex: 0, straight: true, a: 0.7 * outA * (1 - smooth((pq - 1) / 0.3))}));
  // row: the first two words swap to the next sentence at the end of the cycle; '배' stays
  row.slice(0, 2).forEach((b, i) => { const d = drop(clamp(sw / 0.8)); chipE(stage, {...b, y: b.y + 120 * d}, {kind: 'given', a: (1 - d) * outA}); });
  if (sw > 0) rowN.slice(0, 2).forEach((b, i) => { const q = clamp((sw - 0.3) / 0.7); chipE(stage, {...b, y: lerp(b.y - 90, b.y, backOut(q))}, {kind: 'given', a: clamp(q * 3) * outA}); });
  chipE(stage, row[2], {kind: 'made', hi: hitFlash(tau, 0, 0.3)});
  // bars + lines
  const lq = reach(tau, 0) * (1 - clamp(sw / 0.25));
  wbars(stage, row, sent.W, {g: i => spring(clamp((tau - 0.15 - 0.08 * i) / 0.5), 13, 6) * (1 - clamp(sw / 0.3)), a: (o.barsA ?? 1) * outA});
  for (let j = 0; j < 2; j++) glink(G, cam, topC(row[2]), topC(row[j]), clamp(sent.W[j] * 1.4), lq, {whip: tau >= 0.22 ? tau - 0.22 : -1, a: outA});
  return {now, dots};
}

// =====================================================================================================
// HOOK (s01–s03)
// =====================================================================================================
function hookScene(stage, t, p, ctx) {
  const P = ctx.P, H = P.H, c = stage.ctx, ship = rowOf('SHIP'), pear2 = rowOf('PEAR2'), slot = slotOf(ship);
  const mq = easeInOut(clamp((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))), R = lerpR(MAPP, MAPW, mq);
  const camTwo = frameBoxes([rowGroup(ship), [pear2[0].x, pear2[0].y, pear2[2].x + pear2[2].w, pear2[2].y + pear2[2].h], ptsBox([E0])], {zMax: 1.3});
  const cam = camAt(t, [{t: H.same - 0.25}, {t: H.same + 0.2, ...camTwo}, {t: H.s03}, {t: H.s03 + 0.45}]);
  const {GW} = K.glowBegin();
  world(stage, cam, () => {
    if (t < H.cycEnd) { drawCycle(stage, GW, cam, t, cycleState(t, PH0, CYC), R); return; }
    // ---- after the cycles: the point snaps back to the start (the cycle in progress is SHIP)
    const cy = cycleState(H.cycEnd, PH0, CYC), pq = (cy.tau - 0.45) / 1.2, from = lerp2(E0, cy.sent.X4, pull(pq)), sb = easeIn(clamp((t - H.cycEnd) / 0.3));
    const now = lerp2(from, E0, sb), wordsA = 1 - clamp((t - H.cycEnd) / 0.3);
    const words = {}; cy.sent.words.slice(0, 2).forEach(w => (words[w] = {a: wordsA}));
    const regA = 0.8 * (1 - clamp((t - H.cycEnd) / 0.4));
    const pt = mapWorld(stage, R, {regA, regLA: regA, words, ghosts: [{uv: E0, a: 0.8 * wordsA}], bae: {uv: now, sq: squash(t, H.cycEnd + 0.3, 0.14, 0.25), hi: Math.max(hitFlash(t, H.arr[1], 0.5), hitFlash(t, H.which2, 0.6))}}).배;
    if (sb > 0 && sb < 1) streak(stage, mp(R, from), mp(R, E0), sb, {w: 7, len: 0.4});
    ringPop(stage, ...pt, t, H.arr[1], {color: PAL.hot}); ringPop(stage, ...pt, t, H.which2, {color: PAL.hot, r1: 40});
    // s02: two rows, pointer lines from both '배' chips to the one point (matte, not attention)
    const r2out = clamp((t - H.s03) / 0.5);
    [[ship[2], H.same], [pear2[2], H.same + 0.15]].forEach(([b, t0], k) => {
      const q = easeOut(clamp((t - t0) / 0.35)); if (q <= 0) return;
      const a = k === 1 ? 1 - r2out : 1 - clamp((t - H.s03) / 0.3);
      withAlpha(c, a, () => line(c, [botC(b), lerp2(botC(b), pt, q)], rgba(PAL.warm, 0.75), 2.5, {dash: [6, 7]}));
    });
    drawRow(stage, ship, i => ({hi: i === 2 ? Math.max(t > H.same && t < H.s03 ? 1 : 0, hitFlash(t, H.which2, 0.8)) : 0}));
    if (t > H.pear2 && r2out < 1) drawRow(stage, pear2, i => ({pop: backOut(clamp((t - H.pear2 - 0.08 * i) / 0.35)), dy: 220 * r2out * r2out, a: 1 - r2out, hi: i === 2 && t > H.same ? 1 : 0}));
    // retract the cycle's lines and bars
    const off = 1 - clamp((t - H.cycEnd) / 0.2);
    if (off > 0) { for (let j = 0; j < 2; j++) glink(GW, cam, topC(ship[2]), topC(ship[j]), clamp(cy.sent.W[j] * 1.4), off); wbars(stage, ship, cy.sent.W, {g: () => off}); }
    // s03: the empty slot for the next word, the context bracket, the panel with the next-word bars (start values)
    if (t > H.s03) {
      chipE(stage, slot, {kind: 'ghost', pop: backOut(clamp((t - H.s03) / 0.35)), hi: hitFlash(t, H.slotHi, 0.8)});
      K.sweep(stage, ship.slice(0, 2), clamp((t - H.ctxRead) / 0.6), {a: fadeOut(t, H.ctx + 0.6, 0.4) * (t > H.ctxRead ? 1 : 0)});
      const bq = easeOut(clamp((t - H.ctx) / 0.3)), bp = hitFlash(t, H.look, 0.45);
      if (bq > 0) {
        const x0 = ship[0].x, x1 = ship[1].x + ship[1].w, y = BAR_Y + 4, xm = (x0 + x1) / 2;
        withAlpha(c, bq, () => line(c, [[xm - (xm - x0) * bq, y + 10], [xm - (xm - x0) * bq, y], [xm + (x1 - xm) * bq, y], [xm + (x1 - xm) * bq, y + 10]], bp > 0 ? mix(PAL.cool, PAL.coolHi, bp) : rgba(PAL.cool, 0.9), 2.5 + 2.5 * bp));
        if (bp > 0) K.sweep(stage, ship.slice(0, 2), clamp((t - H.look) / 0.4), {a: bp});
        tag(stage, '문맥', xm, y + 38, {size: 30, color: PAL.cool, a: bq});
      }
      const pa = smooth((t - H.bars + 0.3) / 0.3);
      panelAt(stage, S03_PANEL - 22, 330, pa);
      if (pa > 0) probBars34(stage, START_ROWS.map((r, i) => ({label: r.label, p: r.p * spring(clamp((t - H.barT[i]) / 0.5), 13, 6), kind: r.kind})), {y0: S03_PANEL, a: pa});
    }
  });
  flushGlow(stage);
  if (t > H.which - 0.1 && t < H.s03 + 0.3) { const [x, y] = camPt(cam, ...mp(MAPW, E0)); tag(stage, '어느 배?', x, y - 56, {size: 34, color: PAL.hot, a: fadeIn(t, H.which - 0.1, 0.2) * fadeOut(t, H.s03 - 0.1, 0.3)}); }
}

// =====================================================================================================
// ORIGIN (s04–s05)
// =====================================================================================================
const LONGW = M.RUN.LONG.W[0][M.LONG.length - 1], LONG_Y_ = 352, BIGCAP = {y: 640, w: 200, h: 300};
let BIG_STATE = null;
function originScene(stage, t, p, ctx) {
  const P = ctx.P, O = P.O, H = P.H, c = stage.ctx, ship = rowOf('SHIP'), long = rowOf('LONG');
  const mq = clamp((t - O.t0) / 0.6);
  // capsule state: index k (0..7), hop progress
  let k = 0, hq = -1; for (let i = 0; i < 7; i++) { if (t >= O.land[i]) k = i + 1; else if (t >= O.hop[i]) { hq = (t - O.hop[i]) / O.hopD; k = i; break; } }
  const share = i => M.oldShare(i), shNow = k > 0 && t >= O.land[k - 1] ? lerp(share(k - 1), share(k), easeOut(clamp((t - O.land[k - 1]) / 0.22))) : share(k);
  const capX = hq >= 0 ? lerp(long[k].x + long[k].w / 2, long[k + 1].x + long[k + 1].w / 2, easeInOut(hq)) : long[k].x + long[k].w / 2;
  const capY = 418 - (hq >= 0 ? 46 * Math.sin(Math.PI * hq) : 0);
  const follow = clamp(capX, 450, 630);
  const capCam = i => ({cx: clamp(long[i].x + long[i].w / 2, 372, 708), cy: LONG_Y_ + 380 / 1.45, z: 1.45});
  const camFirst = frameBoxes([[long[0].x - 20, LONG_Y_ - 50, long[2].x + long[2].w + 20, 500]], {zMax: 1.6});
  const camBae = frameBoxes([[long[5].x, LONG_Y_ - 50, long[7].x + long[7].w + 20, 500]], {zMax: 1.6});
  const cam = camAt(t, [{t: O.k0 - 0.4}, {t: O.k0 + 0.1, ...capCam(0)}, ...O.land.map((x, i) => ({t: x + 0.05, ...capCam(i + 1)})),
    {t: O.big + 0.15}, {t: O.prob - 0.35}, {t: O.prob + 0.15, ...camFirst}, {t: O.push - 0.05, ...camFirst}, {t: O.push + 0.3, ...camBae}, {t: O.burst + 0.05, ...camBae}, {t: O.burst + 0.6}]);
  void follow;
  const {GW} = K.glowBegin();
  const burst = t >= O.burst;
  world(stage, cam, () => {
    plate(stage, MAPW, 0.5);
    // ---- the row: SHIP morphs into the long sentence
    if (mq < 1) drawMorph(stage, morphRow(ship, long, mq));
    else drawRow(stage, long, i => ({dim: i === 0 && !burst ? (1 - shNow) * 0.9 * (t > O.k0 ? 1 : 0) : 0, hi: i === 7 ? Math.max(t > O.push && t < O.burst + 0.4 ? 1 : 0, 0) : i === 0 && t > O.clear && !burst ? 0.5 * Math.abs(Math.sin((t - O.clear) * 4)) * (t < O.push ? 1 : 0) : 0}));
    // fading parts of the hook (slot, panel)
    const out = 1 - clamp((t - O.t0) / 0.35);
    if (out > 0) { chipE(stage, slotOf(ship), {kind: 'ghost', a: out}); panelAt(stage, S03_PANEL - 22, 330, out); probBars34(stage, START_ROWS.map(r => ({...r, p: r.p * out})), {y0: S03_PANEL, a: out}); }
    // ---- s04: the memory capsule hops word to word; remnant bars of the first word's share stay behind
    const capA = t < O.k0 ? 0 : 1 - clamp((t - O.clear) / 0.45), capDrop = drop(clamp((t - O.clear) / 0.45));
    const remA = 1 - clamp((t - O.burst) / 0.3);
    if (remA > 0) for (let i = 0; i < k; i++) { if (t < O.land[i]) break; const b = long[i], hh = 56 * share(i), cx = b.x + b.w / 2;
      withAlpha(c, remA, () => { c.beginPath(); c.roundRect(cx - 9, 474 - hh, 18, Math.max(hh, 2), 4); c.fillStyle = mix('#3A86A8', '#5FB4D9', 0.4); c.fill(); }); }
    if (capA > 0) {
      const sq = Math.max(squash(t, O.land[k - 1] ?? -9, 0.14, 0.18), 1), pre = t < O.k0 + 0.3 ? backOut(clamp((t - O.k0) / 0.3)) : 1;
      if (hq >= 0) streak(stage, [long[k].x + long[k].w / 2, 446], [long[k + 1].x + long[k + 1].w / 2, 446], easeInOut(hq), {w: 6, color: PAL.cool, len: 0.5, a: 0.4});
      capsule(stage, capX, capY + 260 * capDrop, shNow, {a: capA * clamp(pre * 3), sq: sq * lerp(0.6, 1, pre)});
      BIG_STATE = {a: capA * clamp(pre * 3), share: shNow, drop: capDrop, from: [capX, capY + 58], pre};
    } else BIG_STATE = null;
    // ---- s05: the fan burst — '배' reaches every word before it at once, straight over the middle words
    if (burst) {
      const again = t >= O.again ? reach(t, O.again, 0.2) : 1, wv = t >= O.again ? since(t, O.again, 0.2) : since(t, O.burst, 0.2);
      for (let j = 0; j < 7; j++) glink(GW, cam, topC(long[7]), topC(long[j]), clamp(LONGW[j] * 1.8), Math.min(reach(t, O.burst, 0.2), again), {whip: wv});
      wbars(stage, long, LONGW, {g: i => spring(clamp((t - O.burst - 0.1 - 0.03 * i) / 0.5), 13, 6), pctA: 0, S: 140, show: LONGW.map((_, i) => i < 7)});
    }
    // ---- G P T tiles drop in; T stays lit
    for (let i = 0; i < 3; i++) {
      const q = clamp((t - O.tiles - 0.1 * i) / 0.45); if (q <= 0) continue; const d = drop(q), b = tileBox(i);
      chipE(stage, {...b, y: lerp(b.y - 360, b.y, d)}, {kind: i === 2 && t > O.tHi ? 'made' : 'given', hi: i === 2 && t > O.tHi ? 1 : 0, dim: i < 2 && t > O.tHi ? 0.6 * smooth((t - O.tHi) / 0.3) : 0});
      ringPop(stage, b.x + b.w / 2, b.y + b.h, t, O.tiles + 0.1 * i + 0.45 * 0.72, {color: PAL.muted, r1: 60});
    }
  });
  flushGlow(stage);
  // the same memory, large and screen-fixed (meter): its cool part is the first word's share; tied to the small capsule
  if (BIG_STATE && BIG_STATE.a > 0) { const B = BIG_STATE, f = camPt(cam, ...B.from);
    withAlpha(c, B.a * 0.7 * (1 - B.drop), () => line(c, [f, [540, BIGCAP.y - 6]], rgba(PAL.cool, 0.5), 1.5, {dash: [4, 7]}));
    capsule(stage, 540, BIGCAP.y + 420 * B.drop, B.share, {a: B.a, w: BIGCAP.w * lerp(0.6, 1, B.pre), h: BIGCAP.h}); }
  // big number: the first word's share, rolling down at every hop (100 → 60 → … → 3 %)
  if (t > O.k0 && t < O.clear + 0.4) { let shN = 1; for (let i = 0; i < 7; i++) if (t >= O.land[i]) shN = lerp(M.oldShare(i), M.oldShare(i + 1), easeOut(clamp((t - O.land[i]) / 0.22)));
    bigC(stage, String(Math.round(shN * 100)), '%', t, O.k0, fadeOut(t, O.clear, 0.3), {y: 1150, sub: '첫 낱말의 몫', pop: false, size: 110}); }
}

// =====================================================================================================
// ESSENCE (s06–s09)
// =====================================================================================================
function essenceScene(stage, t, p, ctx) {
  const P = ctx.P, E = P.E, O = P.O, c = stage.ctx, ship = rowOf('SHIP'), long = rowOf('LONG');
  const mq = clamp((t - E.t0) / 0.6);
  const camT = frameBoxes([rowGroup(ship), [300, TILE.y, 780, TILE.y + TILE.h + 170]], {zMax: 1.3}), camB = frameBoxes([rowGroup(ship), [300, BAR_Y, 780, BAR_Y + 8 * (CELL_H + CELL_GAP)]], {zMax: 1.4});
  const camV = frameBoxes([ptsBox([M.E.항구를, M.E.떠난, M.E.기차, M.E.버스, M.E.돛])], {zMax: 1.4}), camF = frameBoxes([ptsBox([M.E.익은, M.E.달게, M.E.사과, M.E.포도, M.E.감])], {zMax: 1.4});
  const cam = camAt(t, [{t: E.t0}, {t: E.t0 + 0.6, ...camT}, {t: E.mean}, {t: E.mean + 0.6}, {t: E.fan - 0.4}, {t: E.fan + 0.1, ...camB},
    {t: E.big, ...camB}, {t: E.big + 0.8}, {t: E.veh - 0.1}, {t: E.veh + 0.35, ...camV}, {t: E.fru - 0.05, ...camV},
    {t: E.fru + 0.3, ...camF}, {t: E.both - 0.05, ...camF}, {t: E.both + 0.55}]);
  const {GW} = K.glowBegin();
  world(stage, cam, () => {
    // ---- map plate brightens when it becomes the meaning map
    const plA = lerp(0.5, 1, smooth((t - E.drop) / 0.4));
    plate(stage, MAPW, plA);
    if (t > E.mapLit - 0.3 && t < E.mapLit + 0.6) withAlpha(c, hitFlash(t, E.mapLit, 0.6) * 0.8, () => { c.beginPath(); c.roundRect(MAPW.x, MAPW.y, MAPW.w, MAPW.h, 16); c.strokeStyle = PAL.coolHi; c.lineWidth = 2.5; c.stroke(); });
    // ---- s09: backdrop + the other two words pop in, regions, names
    const backEach = {}, words = {};
    for (const {w, t: t0} of E.backT) { const q = clamp((t - t0) / 0.3); if (w === '달게' || w === '익은') { if (q > 0) words[w] = {a: clamp(q * 3), sq: lerp(1.6, 1, backOut(q)) * squash(t, t0 + 0.3, 0.14, 0.2)}; } else backEach[w] = clamp(q * 3); }
    const regQ = backOut(clamp((t - E.reg) / 0.45));
    // regions grow from their centres
    if (regQ > 0) { const c2 = stage.ctx; c2.save(); for (const [name, g] of Object.entries(M.REGIONS)) {
      const [cx, cy] = mp(MAPW, [g.cx, g.cy]); c2.save(); c2.translate(cx, cy); c2.scale(lerp(0.4, 1, regQ), lerp(0.4, 1, regQ)); c2.translate(-cx, -cy);
      mapRegion(stage, name, clamp(regQ * 2), fadeIn(t, name === '탈것' ? E.veh : E.fru, 0.25), name === '탈것' ? hitFlash(t, E.veh, 1.0) + hitFlash(t, E.both, 0.8) : hitFlash(t, E.fru, 1.0) + hitFlash(t, E.both + 0.25, 0.8)); c2.restore(); }
      c2.restore(); }
    const back = Object.keys(backEach).length ? 0.55 : 0, backHi = {};
    // s08: words placed one by one
    const placed = M.SHIP.map((w, k) => t >= E.land[k]);
    M.SHIP.slice(0, 2).forEach((w, k) => { if (placed[k]) words[w] = {sq: squash(t, E.land[k], 0.14, 0.3)}; });
    const dots = mapWorld(stage, MAPW, {a: 1, plate: false, regA: 0, backA: back, backEach, backHi, words, bae: placed[2] ? {uv: E0, sq: squash(t, E.land[2], 0.14, 0.3)} : null,
      ghosts: []}) || {};
    void dots;
    // landing rings
    M.SHIP.forEach((w, k) => ringPop(stage, ...mp(MAPW, M.E[w]), t, E.land[k], {color: w === '배' ? PAL.hot : PAL.coolHi}));
    // ---- the row: long sentence → SHIP; then the T tile flies into '배'
    if (mq < 1) drawMorph(stage, morphRow(long, ship, mq));
    else drawRow(stage, ship, i => ({hi: i === 2 ? Math.max(hitFlash(t, E.mean + 0.45, 0.5), hitFlash(t, E.change, 0.6)) : 0, sc: i === 2 ? squash(t, E.mean + 0.45, 0.14, 0.12) : 1}));
    if (t >= E.each && t < E.fan + 0.6) K.sweep(stage, ship, clamp((t - E.each) / 0.8), {a: fadeOut(t, E.fan + 0.2, 0.3)});
    // lines/bars of the burst retract at the switch
    const off = 1 - clamp((t - E.t0) / 0.25);
    if (off > 0) for (let j = 0; j < 7; j++) glink(GW, cam, topC(long[7]), topC(long[j]), clamp(LONGW[j] * 1.8), off);
    // GPT tiles: G, P fall away; T rises, then flies into the '배' chip
    for (let i = 0; i < 3; i++) {
      const b = tileBox(i);
      if (i < 2) { const d = drop(clamp((t - E.t0) / 0.5)); if (d < 1) chipE(stage, {...b, y: b.y + 500 * d}, {kind: 'given', dim: 0.6, a: 1 - d}); continue; }
      const fq = clamp((t - E.mean) / 0.45); if (fq >= 1) continue;
      const to = ship[2], e = easeIn(fq), bb = {...b, ...lerpR(b, to, e)};
      if (fq > 0) streak(stage, [b.x + b.w / 2, b.y + b.h / 2], [to.x + to.w / 2, to.y + to.h / 2], e, {w: 10, len: 0.4});
      chipE(stage, bb, {kind: 'made', hi: 1 - fq});
      if (fq <= 0) { const la = fadeIn(t, E.t0 + 0.2, 0.3);
        const s = 'Transformer', x0 = 540 - stage.measure(s, {role: 'display', weight: 700, size: 64}) / 2;
        stage.text('T', x0, b.y + b.h + 62, {role: 'display', weight: 700, size: 64, color: PAL.warm, align: 'left', alpha: la});
        stage.text('ransformer', x0 + stage.measure('T', {role: 'display', weight: 700, size: 64}) - 1, b.y + b.h + 62, {role: 'display', weight: 700, size: 64, color: PAL.ink, align: 'left', alpha: la});
        tag(stage, '모양을 바꾸는 것', 540, b.y + b.h + 140, {size: 32, color: PAL.ink, a: fadeIn(t, E.shape, 0.25) * backOut(clamp((t - E.shape) / 0.3))}); }
    }
    // the meaning line: '배' → the (still empty) map
    const dq = easeOut(clamp((t - E.drop) / 0.4)), dOff = 1 - clamp((t - E.read) / 0.3);
    if (dq > 0 && dOff > 0) { const from = botC(ship[2]), to = mp(MAPW, [0, 0]);
      withAlpha(c, dOff, () => { line(c, [from, lerp2(from, to, dq)], rgba(PAL.warm, 0.8), 2.5, {dash: [6, 7]}); if (dq >= 1) K.dot(stage, to[0], to[1], {r: 8, kind: 'ghost'}); }); }
    // ---- s07: number bundles fan out; s07 end: columns shoot down (12,288); s08: fold to two, slide to the axes
    const colQ = t < E.fold ? easeIn(clamp((t - E.big) / 0.8)) : 1 - easeOut(clamp((t - E.fold) / 0.35));
    const foldQ = easeInOut(clamp((t - E.fold - 0.4) / 0.35));
    M.SHIP.forEach((w, k) => {
      const b = ship[k], cx = b.x + b.w / 2, y0 = BAR_Y, warm = w === '배';
      const fan = backOut(clamp((t - E.fanT[k]) / 0.4)); if (t < E.fanT[k] || fan <= 1e-3) return;
      const sl = clamp((t - E.slide[k]) / 0.45), gone = t >= E.land[k] + 0.2;
      if (gone) return;
      // the long column (12,288 numbers; only the first ~65 fit in the picture)
      if (colQ > 0) { const n = Math.floor(8 + 90 * clamp(colQ * 1.15 - 0.03 * k)); for (let i = 8; i < n; i++) { const yi = y0 + i * (CELL_H + CELL_GAP); if (yi > 1400) break;
        c.beginPath(); c.roundRect(cx - CELL_W / 2, yi, CELL_W, CELL_H, 3); c.fillStyle = mix('#0E1A20', warm ? PAL.warm : PAL.cool, 0.15 + 0.75 * (COLV[(i + 7 * k) % 90] + 1) / 2); c.fill(); } }
      const cells = bundle(stage, cx, y0, BVALS[w], {fan, warm, fold: foldQ, n: sl > 0 ? 2 : 8, a: sl > 0 ? 0 : 1});
      void cells;
      if (sl > 0) {
        // the two cells slide: u → bottom axis, v → left axis; then guides meet and the dot drops in
        const uv = M.E[w], [px, py] = mp(MAPW, uv), tu = [px, MAPW.y + MAPW.h - 12], tv = [MAPW.x + 12 + CELL_W / 2, py];
        const fu = [cx, y0 + CELL_H / 2], fv = [cx, y0 + CELL_H + CELL_GAP + CELL_H / 2], e = easeInOut(sl);
        const pu = lerp2(fu, tu, e), pv = lerp2(fv, tv, e);
        streak(stage, fu, tu, e, {w: 8, color: warm ? PAL.warm : PAL.cool, len: 0.3}); streak(stage, fv, tv, e, {w: 8, color: warm ? PAL.warm : PAL.cool, len: 0.3});
        const cell = (x, y, v) => { c.beginPath(); c.roundRect(x - CELL_W / 2, y - CELL_H / 2, CELL_W, CELL_H, 3); c.fillStyle = mix('#0E1A20', warm ? PAL.warm : PAL.cool, 0.15 + 0.75 * (v + 1) / 2); c.fill(); };
        const ga = 1 - clamp((t - E.land[k]) / 0.2);
        const gq = easeOut(clamp((t - E.slide[k] - 0.45) / 0.22));
        if (gq > 0) withAlpha(c, ga, () => { line(c, [tu, [tu[0], lerp(tu[1], py, gq)]], rgba(PAL.field, 0.6), 1.5, {dash: [4, 6]}); line(c, [tv, [lerp(tv[0], px, gq), tv[1]]], rgba(PAL.field, 0.6), 1.5, {dash: [4, 6]}); });
        withAlpha(c, ga, () => { cell(pu[0], pu[1], uv[0]); cell(pv[0], pv[1], uv[1]); });
        const dq2 = clamp((t - E.slide[k] - 0.6) / 0.15);
        if (dq2 > 0 && dq2 < 1) K.dot(stage, px, lerp(py - 90, py, drop(dq2)), {r: 13, kind: warm ? 'made' : 'given'});
      }
    });
  });
  flushGlow(stage);
  if (t > E.big - 0.05 && t < E.fold + 0.3) bigC(stage, rollNum(12288, (t - E.big) / 0.9), '개', t, E.big, fadeOut(t, E.fold, 0.3), {y: 1240, plate: true});
}
/** one region (the map's dashed ellipse) with its own alpha, label alpha and highlight */
function mapRegion(stage, name, a, la, hi) {
  const g = M.REGIONS[name], R = MAPW, c = stage.ctx, [cx, cy] = mp(R, [g.cx, g.cy]), rx = g.rx * R.w / 2, ry = g.ry * R.h / 2, h = clamp(hi), col = mix(PAL.muted, PAL.ink, h);
  withAlpha(c, a, () => {
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = rgba(PAL.muted, 0.08 + 0.05 * h); c.fill();
    c.setLineDash([6, 7]); c.strokeStyle = rgba(col, 0.5 + 0.3 * h); c.lineWidth = 1.5 + h; c.stroke(); c.setLineDash([]);
    if (la > 0) stage.text(name, cx, cy - ry - 22, {size: 32, weight: 700, color: col, align: 'center', alpha: 0.9 * la});
  });
}

export const scenes = {hook: hookScene, origin: originScene, essence: essenceScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  hook: P => { const at = s => P.tl.at(s) - 0.5; return [[-Infinity, '오늘의 주제', 'GPT는 문맥을 어떻게 읽을까?'], [at('s02'), '같은 글자, 다른 뜻', '어느 배일까?'], [at('s03'), '다음 말을 맞히려면', '문맥을 보고 가려내야']]; },
  origin: P => [[-Infinity, '예전 방식 · 차례로 읽기', '읽을수록 앞말이 흐려졌다'], [P.tl.at('s05') - 0.5, '2017 · 트랜스포머', '모든 앞말을 곧바로 살핀다']],
  essence: P => { const at = s => P.tl.at(s) - 0.5;
    return [[-Infinity, '이름 · Transformer', '모양을 바꾸는 것'], [at('s07'), 'GPT-3 · 낱말 하나', '낱말은 숫자 묶음'], [at('s08'), '두 방향만 그린 지도', '숫자 둘 = 지도 위의 점 하나'], [at('s09'), '두 방향만 그린 지도', '뜻이 가까우면 가까이']]; },
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundIntro(tl, P) {
  const H = P.H, O = P.O, E = P.E, ev = [];
  ev.push(snd.swell('poster', 0.05, [196, 294], 1.6, -36, '첫 화면(썸네일): 주의의 선과 끌려가는 점'));
  H.cycStarts.forEach((te, i) => ev.push(snd.tone('hook_whip' + (i + 1), te, 294, 0.3, -32, `훅: 주의의 선이 채찍처럼 뻗음(${i + 1})`, {decay: 0.12})));
  H.arr.forEach((te, i) => ev.push(snd.tick('hook_same' + (i + 1), te, 330, -32, `s02: ${i ? '둘째' : '첫'} '배'에서 내려온 선이 같은 점에 닿음`, {decay: 0.1})));
  ev.push(snd.tone('hook_bars', H.bars, 220, 0.35, -33, 's03: 다음에 올 말의 확률 막대(처음 자리: 엇비슷)', {decay: 0.2}));
  ev.push(snd.tick('hook_ctx', H.ctx, 262, -36, "s03: '문맥' 괄호", {decay: 0.08}));
  ev.push(snd.tick('hook_which', H.which2, 330, -36, "s03: 어느 배인지 — 배 점에 고리", {decay: 0.08}));
  ev.push(snd.tick('old_start', O.k0, 494, -34, 's04: 기억 덩어리가 첫 낱말에서 출발', {decay: 0.08}));
  O.land.forEach((te, i) => ev.push(snd.tick('old_hop' + (i + 1), te, Math.round(220 + 270 * M.oldShare(i + 1)), -33, `s04: 덩어리가 한 칸 건너뜀(${i + 1}) — 첫 낱말의 몫 ${Math.round(M.oldShare(i + 1) * 100)}%, 몫만큼 낮아지는 음`, {decay: 0.09})));
  ev.push(snd.tone('tf_again', O.again, 294, 0.3, -36, 's05: 주의의 선이 한 번 더 한꺼번에 뻗음', {decay: 0.12}));
  ev.push(snd.swell('tf_burst', O.burst, [196, 294], 1.4, -32, "s05: '배'에서 앞의 모든 낱말로 선이 한꺼번에 뻗음"));
  [0, 1, 2].forEach(i => ev.push(snd.tick('tf_tile' + (i + 1), O.tiles + 0.1 * i + 0.45 * 0.72, 196, -34, `s05: 글자 타일 ${GPT[i]} 가 떨어져 닿음`, {decay: 0.1})));
  ev.push(snd.tone('tf_T', O.tHi, 330, 0.3, -33, "s05: 'T' 강조", {decay: 0.15}));
  ev.push(snd.tone('ess_meaning', E.drop, 262, 0.4, -34, "s06: '배'에서 지도(빈 판)로 선이 내려옴", {decay: 0.2}));
  E.fanT.forEach((te, i) => ev.push(snd.tick('ess_fan' + (i + 1), te, 392, -35, `s07: ${M.SHIP[i]}의 숫자 묶음이 펼쳐짐`, {decay: 0.07})));
  ev.push(snd.whoosh('ess_column', E.big, 0.8, 200, 120, -38, 's07: 숫자 묶음이 12,288개의 기둥으로 뻗음'));
  ev.push(snd.tick('ess_big', E.big + 0.02, 147, -34, 's07: 큰 숫자 12,288개', {decay: 0.14}));
  E.land.forEach((te, i) => ev.push(snd.tick('ess_dot' + (i + 1), te, i === 2 ? 330 : 294, -32, `s08: ${M.SHIP[i]}의 점이 지도에 찍힘`, {decay: 0.1})));
  ev.push(snd.train('ess_backdrop', E.backT.map(({t: te}) => [te + 0.3, 'tick', {freq: 262, decay: 0.06, click: 0, gain_db: 0}]), -40, 's09: 다른 낱말의 점들이 지도에 찍힘'));
  ev.push(snd.tone('ess_regions', E.reg, 196, 0.5, -36, 's09: 가까운 것끼리 영역 타원', {decay: 0.25}));
  return ev;
}
