// 45 GPT는 문맥을 어떻게 읽을까 — key mechanism: attend (s10–s14) and swap (s15). PLAN.md §3, ../gpt-generative/PLAN.md §1.1.
// Chain: the '배' starts at the same point → lines reach out to the words before it → the weights split (bars, %) → the
// bars slide into one 100 % band → on the map the looked-at words pull the '배' point (rubber band, ease-in, spring) →
// swap one condition (달게 익은) → the point snaps back and shoots to the fruit side; the old arrival stays as a ghost.
// Every time is computed once in planCore; drawing and sound read the same numbers.
import * as K from '../gpt-generative/kit.mjs';
import {camAt, withCam, camPt, drop, squash, streak, ringPop, rollNum, backOut, spring} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
import {rowOf, topC, botC, drawRow, glink, flushGlow, wbars, mapWorld, mp, MAPW, bigC, pull, lerp2, apexFor, LONG_SIZE, world, frameBoxes, chipE, BAR_Y} from './parts.mjs';
const {PAL, clamp, lerp, smooth, easeOut, easeIn, easeInOut, fadeIn, fadeOut, wd, tag, snd, hitFlash, withAlpha, line} = K;

const SHIPW = M.RUN.SHIP.W[0][2], PEARW = M.RUN.PEAR.W[0][2], EQ = M.attnAt(M.SHIP, 0)[2];
const X1S = M.RUN.SHIP.X[1][2], X1P = M.RUN.PEAR.X[1][2], E0 = M.E.배;

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planCore(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  const A = {};
  A.t0 = SC.attend.start;
  A.drop1 = W_('s10', "'배'는"); A.land1 = A.drop1 + 0.55;
  A.pear2 = W_('s10', '같으니') - 0.55; A.drop2 = W_('s10', '같으니'); A.land2 = A.drop2 + 0.55;
  A.ghostT = W_('s10', '늘'); A.vehT = W_('s10', '탈것과'); A.fruT = W_('s10', '과일');
  A.pearOut = P.tl.at('s11') - 0.5;
  A.look = W_('s11', '한꺼번에');
  A.eval = [W_('s11', '얼마나'), W_('s11', '관련이'), W_('s11', '깊은지')];
  A.att = W_('s12', '주의,'); A.split = W_('s12', '더'); A.barT = [0, 1, 2].map(i => A.split + 0.12 * i);
  A.band = W_('s12', '백퍼센트');
  A.unband = P.tl.at('s13') - 0.4;
  A.vehHi = W_('s13', '탈것'); A.hi1 = W_('s13', "항구'와"); A.hi2 = W_('s13', "떠난',");
  A.mixT = W_('s14', '숫자가'); A.tight = W_('s14', '섞여서'); A.pullT = W_('s14', '점이'); A.pullD = 1.2;
  P.A = A;
  const S = {};
  S.t0 = SC.swap.start;
  S.back = S.t0 + 0.05;                               // camera pulls back (whip) from the s14 push-in
  S.off = W_('s15', '달게') - 0.25;                   // lines retract
  S.chg = W_('s15', '달게');                         // the two words are swapped
  S.snap = W_('s15', '바꾸면'); S.snapD = 0.32;      // the point snaps back to its start
  S.look = W_('s15', '같은'); S.barT = [0, 1, 2].map(i => S.look + 0.25 + 0.12 * i);
  S.mixT = W_('s15', '이번에는'); S.pullT = W_('s15', '과일'); S.pullD = 1.1;
  S.end = SC.swap.end;
  P.S = S;
  return P;
}
export const signature = P => [P.A.look, P.A.split, P.A.band, P.A.pullT, P.S.chg, P.S.pullT].map(x => x.toFixed(3)).join(',');

// =====================================================================================================
// helpers
// =====================================================================================================
/** reach of a line that whips out at t0 (0.22 s, ease-out) */
/** the row with its arcs above and its bars/percent below */
export const rowGroup = row => [row[0].x - 30, row[0].y - 46, row[row.length - 1].x + row[row.length - 1].w + 30, BAR_Y + 62];
/** map points (uv) → world box with room for their names */
export const ptsBox = uvs => { const p = uvs.map(uv => mp(MAPW, uv)); return [Math.min(...p.map(q => q[0])) - 110, Math.min(...p.map(q => q[1])) - 60, Math.max(...p.map(q => q[0])) + 150, Math.max(...p.map(q => q[1])) + 60]; };
const reach = (t, t0, d = 0.22) => easeOut(clamp((t - t0) / d));
const since = (t, t0, d = 0.22) => (t >= t0 + d ? t - t0 - d : -1);
/** the '배' map point while being pulled from a to b starting at t0 (duration d) */
const pulled = (t, t0, d, a, b) => lerp2(a, b, pull((t - t0) / d));

// =====================================================================================================
// ATTEND (s10–s14)
// =====================================================================================================
function attendScene(stage, t, p, ctx) {
  const P = ctx.P, A = P.A, c = stage.ctx, ship = rowOf('SHIP'), pear2 = rowOf('PEAR2');
  // ---- camera: neutral → push into the row (s11–s12) → back (s13) → push into the map following the point (s14)
  const dotNow = pulled(t, A.pullT, A.pullD, E0, X1S), dotS = mp(MAPW, dotNow), endS = mp(MAPW, X1S);
  const camRow = frameBoxes([rowGroup(ship), ptsBox([M.E.항구를, M.E.떠난, E0])], {zMax: 1.4}), camMix = frameBoxes([ptsBox([M.E.항구를, M.E.떠난, E0])]), camEnd = frameBoxes([ptsBox([M.E.항구를, M.E.떠난, E0, X1S])], {zMax: 1.5});
  const cam = camAt(t, [{t: A.look - 0.55}, {t: A.look - 0.05, ...camRow}, {t: A.unband - 0.05, ...camRow},
    {t: A.unband + 0.45}, {t: A.mixT - 0.35}, {t: A.mixT + 0.25, ...camMix}, {t: A.pullT, ...camMix}, {t: A.pullT + A.pullD, ...camEnd}]);
  const {GW} = K.glowBegin();
  // ---- weights over time
  const lineA = t < A.att ? 0.55 : lerp(0.55, 1, smooth((t - A.att) / 0.3));
  const wq = spring(clamp((t - A.split) / 0.7), 12, 5);
  const ws = [0, 1, 2].map(j => lerp(EQ[j], SHIPW[j], wq));
  const evalHi = j => hitFlash(t, A.eval[j], 0.6);
  const hiW = j => (j === 0 ? Math.max(hitFlash(t, A.hi1, 1.6) * (t < A.hi1 + 1.6 ? 1 : 0), t > A.hi1 && t < P.tl.at('s14') ? 0.8 : 0) : j === 1 ? (t > A.hi2 && t < P.tl.at('s14') ? 0.9 : 0) : 0);
  const band = t < A.band ? 0 : t < A.unband ? backOut(clamp((t - A.band) / 0.45)) : 1 - easeInOut(clamp((t - A.unband) / 0.4));
  world(stage, cam, () => {
    // ---- map (world)
    const mixQ = reach(t, A.mixT, 0.45);
    const words = {항구를: {hi: Math.max(hiW(0), t > A.mixT ? 0.6 : 0)}, 떠난: {hi: Math.max(hiW(1), t > A.mixT ? 0.6 : 0)}, 달게: {a: 0.75}, 익은: {a: 0.75}};
    const landF = Math.max(hitFlash(t, A.land1, 0.5), hitFlash(t, A.land2, 0.5));
    const pulling = t >= A.pullT;
    mapWorld(stage, MAPW, {regA: 1, regLA: 1, regHi: {탈것: Math.max(hitFlash(t, A.vehT, 1.2), t > A.vehHi && t < P.tl.at('s14') ? 0.8 : 0, pulling ? 0.6 : 0), 과일: hitFlash(t, A.fruT, 1.2)},
      backA: 0.55, words,
      ghosts: t > A.ghostT ? [{uv: E0, a: smooth((t - A.ghostT) / 0.25)}] : [],
      trails: pulling ? [{pts: [E0, X1S], q: clamp(pull((t - A.pullT) / A.pullD))}] : [],
      bae: {uv: dotNow, sq: squash(t, A.land1, 0.14, 0.25) * squash(t, A.land2, 0.14, 0.25) * squash(t, A.pullT + A.pullD * 0.6, 0.14, 0.2), hi: landF}});
    ringPop(stage, ...mp(MAPW, E0), t, A.land1, {color: PAL.hot}); ringPop(stage, ...mp(MAPW, E0), t, A.land2, {color: PAL.hot});
    ringPop(stage, ...mp(MAPW, E0), t, A.ghostT, {color: PAL.muted, r1: 34});
    if (pulling) { const q = (t - A.pullT) / A.pullD; if (q < 0.7) streak(stage, mp(MAPW, E0), endS, pull(q) / 1.08, {w: 7, len: 0.35}); }
    // map pull lines: from the two looked-at words to the point. Sag (slack) → taut at "섞여서"; brighter while pulling.
    if (t >= A.mixT) {
      const taut = spring(clamp((t - A.tight) / 0.5), 16, 6), sag = lerp(-38, 0, taut);
      const boost = pulling ? 1 - 0.5 * smooth((t - A.pullT - A.pullD) / 0.6) : 0.6;
      ['항구를', '떠난'].forEach((w, j) => {
        const from = mp(MAPW, M.E[w]);
        glink(GW, cam, from, dotS, SHIPW[j] * (0.7 + 0.6 * boost), mixQ, {apex: sag * (j ? 0.6 : 1), a: 0.65 + 0.35 * boost});
      });
    }
    // ---- the falling copies of '배' (s10): chip → the same start point
    for (const [rowB, t0] of [[ship, A.drop1], [pear2, A.drop2]]) {
      const q = (t - t0) / 0.55; if (q < 0 || q > 1) continue;
      const from = botC(rowB[2]), to = mp(MAPW, E0), d = drop(q), pt = lerp2(from, to, Math.min(1, d));
      streak(stage, from, to, Math.min(1, d), {w: 8, len: 0.3});
      K.dot(stage, pt[0], pt[1], {r: 13, kind: 'made'});
    }
    // ---- rows
    const pearA = t < A.pear2 ? 0 : 1, pearOut = clamp((t - A.pearOut) / 0.45);
    drawRow(stage, ship, i => ({hi: i === 2 ? Math.max(hitFlash(t, A.drop1, 0.5), evalHi(2), t > A.look && t < A.look + 0.3 ? 1 : 0) : hiW(i)}));
    if (pearA > 0 && pearOut < 1) drawRow(stage, pear2, i => ({pop: backOut(clamp((t - A.pear2 - i * 0.07) / 0.35)), dy: 220 * pearOut * pearOut, a: 1 - pearOut, hi: i === 2 ? hitFlash(t, A.drop2, 0.5) : 0}));
    // ---- weight bars (meter under the words)
    if (t > A.split) wbars(stage, ship, ws, {pv: SHIPW, g: i => spring(clamp((t - A.barT[i]) / 0.5), 13, 6), band, hi: [hiW(0), hiW(1), 0], a: fadeOut(t, A.mixT - 0.3, 0.3)});
    // ---- attention lines over the row
    if (t >= A.look) for (let j = 0; j < 2; j++) {
      const wj = t < A.split ? EQ[j] : ws[j];
      glink(GW, cam, topC(ship[2]), topC(ship[j]), clamp(wj * 1.4 + 0.5 * evalHi(j) + 0.4 * hiW(j)), reach(t, A.look), {a: lineA, whip: since(t, A.look)});
    }
  });
  flushGlow(stage);
  // ---- screen-fixed: big number 100 % (above the pushed-in row), tags
  if (t > A.band - 0.05 && t < A.unband + 0.2) bigC(stage, rollNum(100, (t - A.band) / 0.5) , '%', t, A.band, fadeOut(t, A.unband - 0.1, 0.3), {x: 880, y: 470, size: 100});
  const tagA = fadeIn(t, A.vehT - 0.1, 0.3) * fadeOut(t, A.pearOut, 0.3);
  if (tagA > 0) { const [x, y] = camPt(cam, ...mp(MAPW, E0)); tag(stage, '출발점', x, y + 52, {size: 30, color: PAL.muted, a: tagA}); }
}

// =====================================================================================================
// SWAP (s15) — one condition changed: 항구를 떠난 → 달게 익은
// =====================================================================================================
function swapScene(stage, t, p, ctx) {
  const P = ctx.P, S = P.S, A = P.A, c = stage.ctx, ship = rowOf('SHIP'), pear = rowOf('PEAR');
  const snapQ = clamp((t - S.snap) / S.snapD), shoot = t >= S.pullT;
  const dotNow = shoot ? pulled(t, S.pullT, S.pullD, E0, X1P) : lerp2(X1S, E0, easeIn(snapQ));
  const dotS = mp(MAPW, dotNow), endS = mp(MAPW, X1P), e0S = mp(MAPW, E0), s14S = mp(MAPW, X1S);
  // camera: from the s14 push-in, whip back to the whole stage; then across the map with the point
  const camEnd14 = frameBoxes([ptsBox([M.E.항구를, M.E.떠난, E0, X1S])], {zMax: 1.5}), camStart = frameBoxes([ptsBox([M.E.달게, M.E.익은, E0, X1S])]), camFruit = frameBoxes([ptsBox([M.E.달게, M.E.익은, E0, X1P])], {zMax: 1.5});
  const cam = camAt(t, [{t: S.t0, ...camEnd14}, {t: S.t0 + 0.45}, {t: S.mixT - 0.1}, {t: S.pullT, ...camStart}, {t: S.pullT + S.pullD, ...camFruit}]);
  const {GW} = K.glowBegin();
  const off = 1 - clamp((t - S.off) / 0.2);           // old lines retract fast
  const swapQ = clamp((t - S.chg) / 0.5);
  world(stage, cam, () => {
    // ---- map
    mapWorld(stage, MAPW, {regA: 1, regLA: 1, regHi: {과일: shoot ? 0.7 : 0, 탈것: 0}, backA: 0.55,
      words: {항구를: {a: 0.75}, 떠난: {a: 0.75}, 달게: {hi: t > S.mixT ? 0.6 : 0}, 익은: {hi: t > S.mixT ? 0.6 : 0}},
      ghosts: [{uv: E0}, ...(t > S.snap ? [{uv: X1S, warm: true, a: 0.9}] : [])],
      trails: [{pts: [E0, X1S], q: 1, a: t > S.snap ? 0.45 : 1}, ...(shoot ? [{pts: [E0, X1P], q: clamp(pull((t - S.pullT) / S.pullD))}] : [])],
      bae: {uv: dotNow, sq: squash(t, S.snap + S.snapD, 0.14, 0.25) * squash(t, S.pullT + S.pullD * 0.6, 0.14, 0.2), hi: hitFlash(t, S.snap + S.snapD, 0.5)}});
    if (snapQ > 0 && snapQ < 1) streak(stage, s14S, e0S, easeIn(snapQ), {w: 8, len: 0.4});
    ringPop(stage, e0S[0], e0S[1], t, S.snap + S.snapD, {color: PAL.hot});
    if (shoot) { const q = (t - S.pullT) / S.pullD; if (q < 0.7) streak(stage, e0S, endS, pull(q) / 1.08, {w: 7, len: 0.35}); }
    if (t >= S.mixT) {
      const boost = shoot ? 1 - 0.5 * smooth((t - S.pullT - S.pullD) / 0.6) : 0.6, taut = spring(clamp((t - S.mixT - 0.2) / 0.5), 16, 6);
      ['달게', '익은'].forEach((w, j) => glink(GW, cam, mp(MAPW, M.E[w]), dotS, PEARW[j] * (0.7 + 0.6 * boost), reach(t, S.mixT, 0.4), {apex: lerp(-38, 0, taut) * (j ? 1 : 0.6), a: 0.65 + 0.35 * boost}));
    }
    // ---- rows: the old words fall to a ghost line under the meter, the new words fly in from above
    if (t < S.chg) drawRow(stage, ship);
    else {
      ship.slice(0, 2).forEach((b, i) => { const d = drop(clamp((swapQ - i * 0.08) / 0.7)), gy = 500;
        const sz = lerp(1, LONG_SIZE / 58, d), bb = {...b, x: b.x + b.w * (1 - sz) / 2, y: lerp(b.y, gy, d), w: b.w * sz, h: b.h * sz};
        chipE(stage, bb, {kind: d > 0.5 ? 'ghost' : 'given', a: lerp(1, 0.85, d) * (pear[2] ? 1 : 1)}); });
      pear.slice(0, 2).forEach((b, i) => { const q = clamp((swapQ - 0.15 - i * 0.08) / 0.55); if (q <= 0) return; const e = backOut(q);
        chipE(stage, {...b, y: lerp(b.y - 120, b.y, e)}, {kind: 'given', a: clamp(q * 3), hi: hitFlash(t, S.chg + 0.5 + i * 0.08, 0.4)}); });
      chipE(stage, pear[2], {kind: 'made', hi: t > S.look && t < S.look + 0.4 ? 1 : 0});
    }
    // ---- weight bars: old values shrink, new values spring
    
    if (t > S.look) wbars(stage, pear, PEARW, {a: fadeOut(t, S.mixT - 0.2, 0.25), g: i => spring(clamp((t - S.barT[i]) / 0.5), 13, 6)});
    // ---- attention lines: old ones retract, new ones whip out
    if (off > 0) for (let j = 0; j < 2; j++) glink(GW, cam, topC(ship[2]), topC(ship[j]), clamp(SHIPW[j] * 1.4), off, {});
    if (t >= S.look) for (let j = 0; j < 2; j++) glink(GW, cam, topC(pear[2]), topC(pear[j]), clamp(PEARW[j] * 1.4), reach(t, S.look), {whip: since(t, S.look)});
  });
  flushGlow(stage);
}

export const scenes = {attend: attendScene, swap: swapScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  attend: P => { const at = s => P.tl.at(s) - 0.5, K1 = '메커니즘 · 주의(어텐션)';
    return [[-Infinity, K1, '배의 출발점은 늘 같다'], [at('s11'), K1, '앞의 낱말을 한꺼번에 살핀다'], [at('s12'), K1, '주의를 모두 합치면 100%'], [at('s13'), K1, '탈것 쪽 낱말에 쏠린 주의'], [at('s14'), K1, '주의만큼 끌려간다']]; },
  swap: P => [[-Infinity, '조건 하나만 바꿈', '달게 익은 배는 과일 쪽으로']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundCore(tl, P) {
  const A = P.A, S = P.S, ev = [];
  ev.push(snd.tick('att_drop1', A.land1, 330, -30, "s10: 첫 문장의 '배'가 지도의 출발점에 찍힘", {decay: 0.1}));
  ev.push(snd.tick('att_drop2', A.land2, 330, -30, "s10: 둘째 문장의 '배'도 같은 자리에 찍힘(같은 음)", {decay: 0.1}));
  ev.push(snd.tick('att_ghost', A.ghostT, 196, -36, 's10: 출발점 고리가 남음', {decay: 0.12}));
  ev.push(snd.swell('att_look', A.look, [196, 294], 1.2, -34, "s11: '배'에서 앞의 두 낱말로 주의의 선이 한꺼번에 뻗음"));
  A.eval.forEach((te, j) => ev.push(snd.tick('att_eval' + (j + 1), te, 262, -38, `s11: 관련 정도를 따짐(${['항구를', '떠난', '자기'][j]})`, {decay: 0.07})));
  A.barT.forEach((te, j) => ev.push(snd.tone('att_bar' + (j + 1), te, Math.round(220 + 300 * SHIPW[j]), 0.22, -32, `s12: 주의 막대 ${M.SHIP[j]} ${M.pct100(SHIPW)[j]}% — 길이에 따른 높이`, {decay: 0.1})));
  ev.push(snd.tick('att_band', A.band, 147, -32, 's12: 막대가 붙어 100% 띠가 됨, 큰 숫자 100%', {decay: 0.14}));
  ev.push(snd.tick('att_hi1', A.hi1, 294, -34, "s13: '항구를' 선·막대·점 강조", {decay: 0.08}));
  ev.push(snd.tick('att_hi2', A.hi2, 294, -34, "s13: '떠난' 선·막대·점 강조", {decay: 0.08}));
  ev.push(snd.tick('att_mix', A.mixT, 220, -36, 's14: 지도에서 두 낱말의 점이 배의 점으로 선을 뻗음', {decay: 0.1}));
  ev.push(snd.chirp('att_pull', A.pullT, [[0, 247, 0], [0.05, 247, 0.7], [A.pullD * 0.6, 392, 0.7], [A.pullD, 392, 0]], -36, "s14: '배'의 점이 1층 값만큼 탈것 쪽으로 끌려감(올라가는 음)"));
  ev.push(snd.tick('swap_chg', S.chg, 262, -32, "s15: 앞의 두 낱말이 '달게 익은'으로 바뀜", {decay: 0.1}));
  ev.push(snd.whoosh('swap_snap', S.snap, S.snapD, 300, 160, -38, "s15: '배'의 점이 출발점으로 휙 돌아옴"));
  ev.push(snd.swell('swap_look', S.look, [196, 294], 1.0, -35, 's15: 새 주의의 선이 뻗음'));
  ev.push(snd.chirp('swap_pull', S.pullT, [[0, 392, 0], [0.05, 392, 0.7], [S.pullD * 0.6, 247, 0.7], [S.pullD, 247, 0]], -36, "s15: 같은 '배'가 과일 쪽으로 옮겨 감(내려가는 음)"));
  return ev;
}
