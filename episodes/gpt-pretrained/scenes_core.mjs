// 44 GPT는 어떻게 배웠을까 — core mechanism: guess (s09–s12) and fix (s13–s16). PLAN.md §3 + §1.1 (gpt-generative).
// Exports: scenes {guess, fix}, planCore(tl, P), soundCore(tl, P), titles {guess, fix}, signature(P).
// Every event time is computed once in planCore (word anchors) and shared by the picture and the sound.
import {PAL, clamp, lerp, smooth, easeOut, easeInOut, wd, bigNum, glowBegin, glowFlush, chip, tag, snd, r3, withAlpha, rgba, line} from '../gpt-generative/kit.mjs';
import {camAt, withCam, camPt, backOut, spring, rollNum, speedBadge, streak, ringPop, squash} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
import {LINE, BODY, DIALC, BARS, LOSS, BIGPOS, INLET, BOX, CAM_HOME, lineBoxes, boxOf, union, camKey, visA, withCamH, coverChip, revealGlow, body, dialBoard, arrowLen,
  barRows, bars, rowCy, rowY, rowBox, barX, lossBar, curvePanel, flowIn, pulseBack} from './parts.mjs';

const EXP = ['해는', '동쪽에서', '뜬다'];                     // the example line (last piece covered)
const EX_CTX = M.toIds('해는 동쪽에서'), T_ID = M.ID['뜬다'], PREV = '동쪽에서';
export const ROW_IDS = (() => { const p = M.probs(M.init, EX_CTX); return p.map((v, i) => i).filter(i => i !== T_ID).sort((a, b) => p[b] - p[a]).slice(0, 3).concat([T_ID]); })();
const T_ROW = 3;                                                 // the right piece's bar row
const K = M.K_SMALL, B = M.BIG;
const S0 = M.SNAP[0], S1 = M.SNAP[1], SK0 = M.SNAP[K - 1], SK = M.SNAP[K];
const OTHER = {pieces: ['해는', '서쪽으로', '진다'], ctx: M.toIds(B.other.ctx), target: M.ID[B.other.target]};

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planCore(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  {
    const G = {};
    G.flow = W_('s09', '답을') - 0.05;                 // the line flows into the body
    G.bars = W_('s09', '다음에') - 0.15;                // bars spring up (initial model)
    G.rowHi = [0, 1, 2, 3, 4].map(i => W_('s09', '조각마다') + 0.22 * i);
    G.dials = W_('s10', '수많은') - 0.05;               // the 18 dials pop in (a wave)
    G.turn0 = W_('s10', '달라지면') - 0.15; G.turn1 = W_('s10', '달라집니다') - 0.1;   // hand-turn +1.0 and back
    G.sweep = W_('s11', '아무렇게나') - 0.1;            // hi runs over the dials (all different)
    G.wrong = W_('s11', '엉뚱하게');                    // the wrong top row hi
    G.open = W_('s12', '열었을') + 0.05;                // the cover flips open
    G.big = W_('s12', '정답') - 0.1;                    // big number: the right piece's probability
    G.loss = W_('s12', '크게');                         // the 'how wrong' bar shoots out
    const s9 = SC.guess.start;
    const p0 = M.pOf(S0, EX_CTX, T_ID), H = c => ({t: c, ...CAM_HOME}), lineB = boxOf(lineBoxes(EXP));
    const fBars = BOX.bars, fTurn = union(BOX.dialRow(2), rowBox(T_ROW, p0 + 0.3)), fRow = rowBox(T_ROW, p0), fLoss = union(rowBox(T_ROW, p0), BOX.loss);
    G.cam = [H(s9), H(G.rowHi[0] - 0.3), camKey(G.rowHi[0] + 0.15, fBars), camKey(G.dials - 0.5, fBars), H(G.dials - 0.05), H(G.turn0 - 0.45), camKey(G.turn0 - 0.05, fTurn),
      camKey(G.turn1 + 0.6, fTurn), H(G.sweep - 0.2), H(G.wrong - 0.35), camKey(G.wrong + 0.05, fBars), camKey(G.open - 0.45, fBars), H(G.open - 0.1), H(G.open + 0.35),
      camKey(G.open + 0.8, fRow), camKey(G.loss - 0.3, fRow), camKey(G.loss + 0.2, fLoss)];
    G.fLoss = fLoss;
    P.guess = G;
  }
  {
    const X = {};
    X.calc = W_('s13', '확률을');                        // the calculation that made the bars: rows light up in turn
    X.back = W_('s13', '거꾸로');                        // backward pulses start at the loss bar
    X.leg1 = 0.4; X.leg2 = 0.55;
    // the fan: each dial's pulse leaves the right bar with a delay by its row (bottom first) and column
    X.arrive = DIALC.map((_, i) => X.back + X.leg1 + (2 - Math.floor(i / 6)) * 0.1 + (i % 6) * 0.035 + X.leg2);
    X.up = W_('s13', '키워야'); X.down = W_('s13', '줄여야');
    X.turn1 = W_('s14', '방향으로') - 0.05;              // wave: first step (big error → big turn)
    X.many = W_('s14', '많이');
    X.jump = W_('s14', '조금') - 0.25;                   // fast-forward to step K_SMALL
    X.arrK = X.jump + 0.5;
    X.turnK = W_('s14', '적게') - 0.05;                  // wave: small error → small turn
    X.wave = i => (2 - Math.floor(i / 6)) * 0.11 + (i % 6) * 0.02;   // bottom row first, a wave upward
    X.waveDur = 0.55;
    X.otherIn = W_('s15', '그래도') - 0.1;              // the other line slides in at s15
    X.rewindPre = W_('s15', '크게') - 0.2;               // back to the params before step K (0.25 s)
    X.bigT = W_('s15', '고치면');                        // the ×30 step (whip)
    X.otherHi = W_('s15', '다른');
    X.rewind = W_('s15', '흐트러지기');                  // REWIND to the small step's result
    X.rewindDur = 0.6;
    // s16 time-lapse ×1 → ×64 from K to N_PRE
    X.ff0 = W_('s16', '다음') - 0.05; X.ffEnd = SC.fix.end - 0.35;
    const stages = [1, 2, 4, 8, 16, 32], base = 2.5;   // steps per second at ×1
    let left = M.N_PRE - K, d = 0.8;
    const fixedSteps = stages.reduce((s, m) => s + base * m * d, 0), t64 = (left - fixedSteps) / (base * 64);
    const span = stages.length * d + t64, scale = Math.min(1, (X.ffEnd - X.ff0) / span);   // shrink if it would not fit
    X.ffSeg = []; let tt = X.ff0, kk = K;
    for (const m of [...stages, 64]) { const dur = (m === 64 ? t64 : d) * scale, n = m === 64 ? M.N_PRE - kk : base * m * d; X.ffSeg.push({t0: tt, t1: tt + dur, k0: kk, k1: kk + n, m}); tt += dur; kk += n; }
    X.ffDone = tt;
    X.kAt = t => { if (t <= X.ff0) return K; for (const s of X.ffSeg) if (t < s.t1) return s.k0 + (s.k1 - s.k0) * (t - s.t0) / (s.t1 - s.t0); return M.N_PRE; };
    X.multAt = t => { for (const s of X.ffSeg) if (t < s.t1) return s.m; return 64; };
    X.tOfK = tOfKFactory(X);
    // tick times of the time-lapse: every step at ×1/×2, then thinned (≤ 12 per second) — pitch rises with the speed
    X.ffTicks = []; { let last = -1; for (let k = K + 1; k <= M.N_PRE; k++) { const t = X.tOfK(k); if (t - last >= 1 / 12) { X.ffTicks.push({t, k, m: X.multAt(t)}); last = t; } } }
    const p0 = M.pOf(S0, EX_CTX, T_ID), H = c => ({t: c, ...CAM_HOME}), fLoss = P.guess.fLoss;
    const fBack = union(BOX.body, BOX.bars), fAll = union(BOX.body, BOX.bars, BOX.loss);
    const otherBox = {x0: BARS.x0, y0: LOSS.y - 10, x1: BARS.x1, y1: LOSS.y + 70};
    const fOther = union(rowBox(T_ROW, 1), otherBox);
    X.cam = [camKey(SC.fix.start, fLoss), camKey(X.back - 0.15, fLoss), camKey(X.back + X.leg1, fBack), H(X.arrive[17] + 0.15), H(X.turn1 - 0.4),
      camKey(X.turn1 + 0.1, fAll), camKey(X.many + 0.3, fAll), H(X.jump + 0.25), H(X.turnK - 0.2), camKey(X.turnK + 0.15, fAll), H(X.otherIn - 0.1),
      H(X.bigT - 0.05), H(X.otherHi - 0.1), camKey(X.otherHi + 0.3, fOther), camKey(X.rewind - 0.25, fOther), H(X.rewind + 0.2), H(X.ff0), H(X.ffDone)];
    P.fix = X;
  }
  return P;
}
// step k → its time in the time-lapse (inverse of kAt); set on the plan object lazily
function tOfKFactory(X) { return k => { for (const s of X.ffSeg) if (k <= s.k1) return s.t0 + (s.t1 - s.t0) * (k - s.k0) / Math.max(1e-9, s.k1 - s.k0); return X.ffDone; }; }

// =====================================================================================================
// shared drawing of the stage state
// =====================================================================================================
const wave = (t, t0, X, i) => spring(clamp((t - t0 - X.wave(i)) / X.waveDur));
function exampleLine(stage, t, o = {}) {
  const bx = lineBoxes(EXP);
  chip(stage, bx[0], {kind: 'given', a: o.a ?? 1}); chip(stage, bx[1], {kind: 'given', a: o.a ?? 1});
  coverChip(stage, bx[2], t, o.open ?? Infinity, {a: o.a ?? 1, coverHi: o.coverHi || 0});
  return bx;
}
const exBars = (stage, Pm, o = {}) => bars(stage, barRows(Pm, EX_CTX, ROW_IDS).map((r, i) => ({...r, hi: o.hi ? o.hi[i] || 0 : 0, ghostP: o.ghost ? o.ghost[i] ?? null : null, grow: o.grow ? o.grow[i] : 1})), {a: o.a ?? 1, cam: o.cam});
const ghostRows = Pm => barRows(Pm, EX_CTX, ROW_IDS).map(r => r.p);

// =====================================================================================================
// GUESS (s09–s12)
// =====================================================================================================
function guessScene(stage, t, p, ctx) {
  const P = ctx.P, G = P.guess, cam = camAt(t, G.cam), {GW, GC} = glowBegin(), D = M.ID;
  // params now: the hand-turned dial (s10) on the initial numbers
  const turnQ = t < G.turn1 ? spring(clamp((t - G.turn0) / 0.55)) : 1 - spring(clamp((t - G.turn1) / 0.55));
  const Pm = turnQ !== 0 ? M.withA(S0, PREV, T_ID, 1.0 * turnQ) : S0;
  const vals = M.rowA(Pm, PREV);
  withCamH(stage, cam, () => {
    const lA = visA(cam, boxOf(lineBoxes(EXP)));
    if (lA > 0) withAlpha(stage.ctx, lA, () => { const bx = exampleLine(stage, t, {open: G.open}); revealGlow(GC, cam, bx[2], t, G.open); });
    body(stage, 1, {cam, label: visA(cam, {x0: BODY.x, y0: BODY.y, x1: BODY.x + 140, y1: BODY.y + 58}) > 0.5});
    // forward flow of the given text into the body (matte, cool)
    const cb = lineBoxes(EXP)[1]; flowIn(stage, [cb.x + cb.w / 2, cb.y + cb.h + 4], INLET, (t - G.flow) / 0.45);
    // dials: pop in as a wave (s10)
    const hiDial = i => {
      let h = 0;
      if (i === T_ID && turnQ !== 0) h = 1;
      const sw = (t - G.sweep - i * 0.075) / 0.35; if (sw > 0 && sw < 1) h = Math.max(h, Math.sin(Math.PI * sw));
      return h;
    };
    // before s10 the dials sit dim in the body (not yet introduced); at "수많은" they light up as a wave (pop)
    dialBoard(stage, vals, {cam}, i => ({a: t < G.dials ? 0.3 : 0.3 + 0.7 * clamp((t - G.dials - i * 0.035) / 0.15), s: t < G.dials ? 1 : 0.85 + 0.15 * backOut(clamp((t - G.dials - i * 0.035) / 0.32)), hi: hiDial(i), ghostV: i === T_ID && turnQ !== 0 ? M.rowA(S0, PREV)[i] : null, wedge: i === T_ID ? 1 : 0}));
    // bars spring up (row by row), then the hi run, the wrong top row, the right row after the cover opens
    const grow = [0, 1, 2, 3, 4].map(i => spring(clamp((t - G.bars - i * 0.12) / 0.6)));
    const hi = [0, 1, 2, 3, 4].map(i => { let h = Math.sin(Math.PI * clamp((t - G.rowHi[i]) / 0.5)); if (i === 0) h = Math.max(h, clamp((t - G.wrong) / 0.15) * (1 - smooth((t - G.open + 0.2) / 0.4))); if (i === T_ROW) h = Math.max(h, turnQ !== 0 ? 1 : 0, t >= G.open ? 1 : 0); return h; });
    if (t >= G.bars) exBars(stage, Pm, {cam, grow, hi, ghost: turnQ !== 0 ? [null, null, null, ghostRows(S0)[3]] : null});
    // the 'how wrong' bar shoots out (backOut) at "크게"
    if (t >= G.loss) { const q = backOut(clamp((t - G.loss) / 0.45)); lossBar(stage, M.pOf(S0, EX_CTX, T_ID), {cam, grow: q, hi: 1 - smooth((t - G.loss - 0.8) / 0.5)}); ringPop(stage, LOSS.bx0 + q * (Math.log(1 / M.pOf(S0, EX_CTX, T_ID)) / LOSS.max) * (LOSS.bx1 - LOSS.bx0), LOSS.y + LOSS.h / 2, t, G.loss + 0.3, {r1: 56}); }
  });
  glowFlush(stage);
  // big number: probability given to the right piece (model value, rolls up)
  if (t >= G.big) { const pv = 100 * M.pOf(S0, EX_CTX, T_ID); bigNum(stage, rollNum(Math.round(pv), (t - G.big) / 0.5), '%', t, G.big, 1, BIGPOS); }
}

// =====================================================================================================
// FIX (s13–s16)
// =====================================================================================================
function fixScene(stage, t, p, ctx) {
  const P = ctx.P, X = P.fix, cam = camAt(t, X.cam), {GW, GC} = glowBegin();
  // ---- which parameters are shown now (one source for dials, bars, loss bar, other line)
  let Pm = S0, ghostVals = null, ghostBars = null, wedge = 0, qWave = i => 0, arrows = null, pPrevLoss = null;
  const vS0 = M.rowA(S0, PREV), vS1 = M.rowA(S1, PREV), vK0 = M.rowA(SK0, PREV), vK = M.rowA(SK, PREV), vBig = M.rowA(B.paramsBig, PREV);
  let vals = vS0;
  const gradArrows = (g, tA, aA = 1) => i => ({arrow: {len: arrowLen(g[i]), q: backOut(clamp((t - tA[i]) / 0.3)), a: aA}});
  if (t < X.turn1) {                                   // s13: initial numbers + the fan of backward pulses → arrows
    Pm = S0; vals = vS0;
    const g = M.TRACE[1].grad, sel = i => (t >= X.down ? (g[i] > 0 ? 1 : 0.35) : t >= X.up ? (g[i] < 0 ? 1 : 0.35) : 1);
    arrows = i => ({arrow: {...gradArrows(g, X.arrive)(i).arrow, a: sel(i)}, hi: (t >= X.up && g[i] < -0.05 && t < X.down) || (t >= X.down && g[i] > 0.05) ? 0.8 : 0});
    pPrevLoss = null;
  } else if (t < X.jump) {                             // s14 first step: the wave of turns S0 → S1
    const qs = DIALC.map((_, i) => wave(t, X.turn1, X, i)), qm = qs.reduce((a, b) => a + b, 0) / 18;
    Pm = M.lerpP(S0, S1, qm); vals = vS0.map((v, i) => lerp(v, vS1[i], qs[i])); ghostVals = vS0; ghostBars = ghostRows(S0); wedge = 1; pPrevLoss = M.pOf(S0, EX_CTX, T_ID);
    const g = M.TRACE[1].grad; arrows = i => ({arrow: {len: arrowLen(g[i]), q: 1, a: 1 - smooth((t - X.turn1 - X.wave(i)) / 0.25)}});
  } else if (t < X.turnK) {                            // fast-forward to K − 1 (spring), arrows of step K
    const q = spring(clamp((t - X.jump) / 0.5));
    Pm = M.lerpP(S1, SK0, q); vals = vS1.map((v, i) => lerp(v, vK0[i], q));
    const g = M.TRACE[K].grad; arrows = i => ({arrow: {len: arrowLen(g[i]), q: backOut(clamp((t - X.arrK) / 0.3))}});
  } else if (t < X.rewindPre) { // step K: small wave; then hold (s15 start)
    const qs = DIALC.map((_, i) => wave(t, X.turnK, X, i)), qm = qs.reduce((a, b) => a + b, 0) / 18;
    Pm = M.lerpP(SK0, SK, qm); vals = vK0.map((v, i) => lerp(v, vK[i], qs[i])); ghostVals = vK0; ghostBars = ghostRows(SK0); wedge = 1; pPrevLoss = M.pOf(SK0, EX_CTX, T_ID);
    const g = M.TRACE[K].grad; arrows = i => ({arrow: {len: arrowLen(g[i]), q: 1, a: 1 - smooth((t - X.turnK - X.wave(i)) / 0.25)}});
  } else if (t < X.bigT) {                             // rewind to the params before step K
    const q = easeInOut(clamp((t - X.rewindPre) / 0.2));
    Pm = M.lerpP(SK, SK0, q); vals = vK.map((v, i) => lerp(v, vK0[i], q));
  } else if (t < X.rewind) {                           // ×30: the whip
    const q = spring(clamp((t - X.bigT) / 0.5), 11, 5);
    Pm = M.lerpP(SK0, B.paramsBig, q); vals = vK0.map((v, i) => lerp(v, vBig[i], q)); ghostVals = vK0; ghostBars = ghostRows(SK0); wedge = 1;
  } else if (t < X.ff0) {                              // REWIND to the small step's result, big result as a 0.8 s afterimage
    const q = easeInOut(clamp((t - X.rewind) / X.rewindDur));
    Pm = M.lerpP(B.paramsBig, SK, q); vals = vBig.map((v, i) => lerp(v, vK[i], q));
    const ga = 1 - smooth((t - X.rewind - X.rewindDur - 0.8) / 0.3);
    if (ga > 0) { ghostVals = vBig; ghostBars = ghostRows(B.paramsBig); }
  } else {                                             // s16 time-lapse
    const k = X.kAt(t), k0 = Math.floor(k), f = k - k0;
    Pm = M.lerpP(M.snapAt(k0), M.snapAt(k0 + 1), f); vals = M.rowA(Pm, PREV);
  }
  const ffA = smooth((t - X.ff0) / 0.35);              // bars fold into the curve panel
  const otherA = t < X.ff0 ? smooth((t - X.otherIn + 0.1) / 0.3) : 1 - smooth((t - X.ff0) / 0.3);
  withCamH(stage, cam, () => {
    // ---- line: the example; in the time-lapse it shows the step being taken
    const lA = visA(cam, {x0: LINE.x0, y0: LINE.y0, x1: 800, y1: LINE.y0 + 88});
    if (lA <= 0) {}
    else if (t < X.ff0 + 0.05) withAlpha(stage.ctx, lA, () => exampleLine(stage, t, {open: -Infinity}));
    else {
      const m = X.multAt(t), hold = m >= 8 ? 0.12 : 0;   // at high speed the line is refreshed ~8× a second
      const kk = Math.max(K + 1, Math.min(M.N_PRE, Math.ceil(hold ? X.kAt(X.ff0 + Math.floor((t - X.ff0) / hold) * hold) : X.kAt(t))));
      const tr = M.TRACE[kk], s = M.CORPUS[tr.sent].split(' ').slice(0, tr.pos + 1), bx = lineBoxes(s);
      const tOpen = hold ? -Infinity : (X.tOfK(kk - 1) + X.tOfK(kk)) / 2;
      bx.forEach((b, i) => { if (i < tr.pos) chip(stage, b, {kind: 'given'}); else coverChip(stage, b, t, tOpen); });
      if (!hold) revealGlow(GC, cam, bx[tr.pos], t, tOpen);
    }
    body(stage, 1, {cam, label: visA(cam, {x0: BODY.x, y0: BODY.y, x1: BODY.x + 140, y1: BODY.y + 58}) > 0.5});
    dialBoard(stage, vals, {cam, ghost: ghostVals, wedge}, i => ({...(arrows ? arrows(i) : {}), s: 1}));
    // ---- s13 backward pulses: loss bar → right bar → each dial (Glow, warm)
    const lossEnd = [LOSS.bx0 + (-Math.log(M.pOf(S0, EX_CTX, T_ID)) / LOSS.max) * (LOSS.bx1 - LOSS.bx0), LOSS.y + LOSS.h / 2];
    const tRow = [barX(M.pOf(S0, EX_CTX, T_ID)) + 4, rowCy(T_ROW)];
    pulseBack(GW, cam, lossEnd, tRow, (t - X.back) / X.leg1, 1.1);
    DIALC.forEach((d, i) => { const t0 = X.arrive[i] - X.leg2; pulseBack(GW, cam, tRow, d, (t - t0) / X.leg2, 0.75); if (t >= X.arrive[i] && t < X.arrive[i] + 0.3) ringPop(stage, d[0], d[1], t, X.arrive[i], {r0: 54, r1: 74, color: PAL.warm}); });
    // ---- bars + loss bar (until the time-lapse), the other line (s15)
    if (ffA < 1) {
      const hiT = t >= X.otherIn ? [0, 0, 0, 1, 0] : [0, 1, 2, 3, 4].map(i => Math.max(i === 3 && t >= X.turn1 ? 1 : 0, Math.sin(Math.PI * clamp((t - X.calc - i * 0.16) / 0.4))));
      exBars(stage, Pm, {cam, a: 1 - ffA, hi: hiT, ghost: ghostBars ? ghostBars.map((v, i) => (i === T_ROW || t >= X.bigT ? v : null)) : null});
      const lossA = (1 - ffA) * (1 - smooth((t - X.otherIn + 0.1) / 0.3));
      if (lossA > 0) lossBar(stage, M.pOf(Pm, EX_CTX, T_ID), {cam, a: lossA, ghostP: pPrevLoss});
    }
    if (otherA > 0) {
      const sx = (1 - backOut(clamp((t - X.otherIn + 0.1) / 0.45))) * 700 + (t >= X.ff0 ? -smooth((t - X.ff0) / 0.3) * 900 : 0);
      const ob = lineBoxes(OTHER.pieces, 40, LOSS.y - 7, BARS.x0).map(b => ({...b, x: b.x + sx}));
      chip(stage, ob[0], {kind: 'given', a: otherA}); chip(stage, ob[1], {kind: 'given', a: otherA}); chip(stage, ob[2], {kind: 'given', a: otherA, hi: t >= X.otherHi ? 1 : 0});
      const x0 = ob[2].x + ob[2].w + 24, x1 = BARS.bx1 + 90 + sx, po = M.probs(Pm, OTHER.ctx)[OTHER.target];
      const gp = t >= X.bigT ? (t < X.rewind ? M.pOf(SK0, OTHER.ctx, OTHER.target) : ghostVals ? M.pOf(B.paramsBig, OTHER.ctx, OTHER.target) : null) : null;
      miniBar(stage, x0, x1, LOSS.y, 46, po, gp, otherA, t >= X.otherHi && t < X.ff0 ? 1 : 0);
    }
    if (ffA > 0) curvePanel(stage, t < X.ff0 ? K : X.kAt(t), {a: ffA, cam});
  });
  glowFlush(stage);
  // ---- screen-fixed: big number (which step), speed badge
  if (t >= X.turn1 - 0.1 && t < X.otherIn - 0.4) {
    const kv = t < X.jump ? 1 : Math.round(1 + (K - 1) * easeOut(clamp((t - X.jump) / 0.5)));
    bigNum(stage, String(kv), '번째', t, X.turn1 - 0.1, 1 - smooth((t - X.otherIn + 0.7) / 0.3), BIGPOS);
  }
  if (t >= X.ff0) bigNum(stage, rollNum(Math.round(X.kAt(t)), 1), '번째', t, X.ff0, 1, BIGPOS);
  if (t >= X.jump && t < X.otherIn - 0.4) speedBadge(stage, '빨리 감기', fadeA(t, X.jump, X.otherIn - 0.7));
  if (t >= X.rewind && t < X.rewind + X.rewindDur + 0.3) speedBadge(stage, '◀◀ 되감기', 1);
  if (t >= X.ff0) speedBadge(stage, X.multAt(t), 1);
}
const fadeA = (t, a, b) => clamp((t - a) / 0.15) * (1 - clamp((t - b) / 0.2));
/** one bar for the other line (s15): rounded bar x0..x1 at p, % text, optional ghost and hi */
function miniBar(stage, x0, x1, y, h, p, ghostP, a, hi) {
  const c = stage.ctx, L = x1 - x0 - 90, len = Math.max(0, p) * L;
  withAlpha(c, a, () => {
    c.beginPath(); c.roundRect(x0, y, L, h, 6); c.fillStyle = rgba('#0A151B', 0.8); c.fill(); c.strokeStyle = rgba(PAL.muted, 0.25); c.lineWidth = 1; c.stroke();
    if (len > 0.5) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#E9A24C'); g.addColorStop(1, '#C9863A'); c.beginPath(); c.roundRect(x0, y, len, h, 6); c.fillStyle = g; c.fill(); }
    if (ghostP != null) { c.beginPath(); c.roundRect(x0, y, ghostP * L, h, 6); c.strokeStyle = rgba(PAL.hot, 0.6); c.lineWidth = 1.5; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
    if (hi) { c.beginPath(); c.roundRect(x0 - 2, y - 2, Math.max(len, 8) + 4, h + 4, 8); c.strokeStyle = rgba(PAL.hot, 0.95 * hi); c.lineWidth = 2.5; c.stroke(); }
    stage.text(Math.round(p * 100) + '%', x0 + Math.max(len, ghostP != null ? ghostP * L : 0) + 12, y + h / 2, {size: 34, weight: 700, color: hi ? PAL.hot : PAL.warm});
  });
}

export const scenes = {guess: guessScene, fix: fixScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  guess: P => { const at = s => P.tl.at(s) - 0.5, K1 = '메커니즘 ① · 실제보다 느리게';
    return [[-Infinity, K1, '조각마다 확률을 매긴다'], [at('s10'), K1, '확률은 속의 숫자가 정한다'], [at('s11'), K1, '처음 숫자는 아무렇게나'], [at('s12'), K1, '정답 확률이 낮으면 크게 틀림']]; },
  fix: P => { const at = s => P.tl.at(s) - 0.5, X = P.fix, K2 = '메커니즘 ② · 실제보다 느리게';
    return [[-Infinity, K2, '거꾸로 되짚어 고칠 방향 찾기'], [at('s14'), K2, '그 방향으로 조금 고친다'], [X.jump - 0.1, `메커니즘 ② · 빨리 감기 → ${K}번째`, '조금 틀렸으면 조금만'],
      [at('s15'), '조건 하나 · 30배로 고치면', '크게 고치면 다른 글이 흐트러진다'], [X.ff0 - 0.3, `빨리 감기 · ${M.N_PRE}걸음`, '되풀이하면 정답 확률이 오른다']]; },
};
export const signature = P => [P.guess.open, P.fix.back, P.fix.turn1, P.fix.bigT, P.fix.ff0].map(x => x.toFixed(3)).join('/');

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundCore(tl, P) {
  const G = P.guess, X = P.fix, ev = [];
  ev.push(snd.whoosh('guess_flow', G.flow, 0.45, 300, 160, -40, 's09: 주어진 글이 몸통으로 들어감(한색 흐름)'));
  barRows(S0, EX_CTX, ROW_IDS).forEach((r, i) => ev.push(snd.tone('guess_bar' + (i + 1), G.bars + i * 0.12, 160 + 260 * r.p, 0.16, -36, `s09: 확률 막대 ${r.label} 이 솟음(음높이 = 막대 길이)`, {decay: 0.08, sustain: 0})));
  ev.push(snd.tick('guess_dials', G.dials, 260, -36, 's10: 다이얼 18개가 물결처럼 나타남', {decay: 0.1}));
  ev.push(snd.tick('guess_turn_up', G.turn0, 330, -33, "s10: '뜬다' 다이얼을 손으로 돌림 — 같은 프레임에 '뜬다' 막대가 늘어남"));
  ev.push(snd.tick('guess_turn_back', G.turn1, 250, -35, 's10: 다이얼을 되돌림 — 막대가 줄어듦'));
  ev.push(snd.train('guess_sweep', DIALC.map((_, i) => [G.sweep + i * 0.075, 'tick', {freq: 200 + 12 * i, decay: 0.04, gain_db: -6, click: 0}]), -38, 's11: 다이얼마다 제각각인 초깃값을 훑음(다이얼 하나에 틱 하나)'));
  ev.push(snd.tick('guess_wrong', G.wrong, 180, -34, 's11: 엉뚱한 맨 윗줄 강조', {decay: 0.12}));
  ev.push(snd.tick('guess_open', G.open, 392, -31, 's12: 가림막이 젖혀지며 정답이 드러남', {decay: 0.09}));
  ev.push(snd.tick('guess_big', G.big, 147, -36, 's12: 큰 숫자(정답에 준 확률)', {decay: 0.12}));
  ev.push(snd.tone('guess_loss', G.loss, 110, 1.1, -32, "s12: '틀린 정도' 막대가 길게 뻗음(크게 틀림 → 낮고 긴 음)", {decay: 0.5, sustain: 0.4}));
  ev.push(snd.chirp('fix_back', X.back, [[0, 520, 0], [0.05, 520, 0.7], [X.leg1 + X.leg2, 220, 0.7], [X.leg1 + X.leg2 + 0.3, 200, 0]], -38, 's13: 틀린 정도가 거꾸로 거슬러 올라감(위로 갈수록 내려가는 처프 — 펄스와 같은 시각)'));
  ev.push(snd.tick('fix_arrows', X.arrive[0], 300, -37, 's13: 펄스가 닿은 다이얼에 고칠 방향(호 화살표)이 생김'));
  ev.push(snd.tick('fix_up', X.up, 330, -37, 's13: 키울 숫자(시계 방향 화살표) 강조'));
  ev.push(snd.tick('fix_down', X.down, 220, -37, 's13: 줄일 숫자(반대 방향 화살표) 강조'));
  ev.push(snd.train('fix_turn1', DIALC.map((_, i) => [X.turn1 + X.wave(i), 'tick', {freq: 330, decay: 0.05, gain_db: 0, click: 0}]), -34, 's14: 첫걸음 — 다이얼이 아래에서 위로 물결처럼 돎(크게 틀림 → 큰 틱)'));
  ev.push(snd.whoosh('fix_jump', X.jump, 0.5, 200, 420, -40, `s14: 빨리 감기 — ${K}번째 걸음으로 건너뜀`));
  ev.push(snd.train('fix_turnK', DIALC.map((_, i) => [X.turnK + X.wave(i), 'tick', {freq: 330, decay: 0.03, gain_db: -10, click: 0}]), -34, `s14: ${K}번째 걸음 — 조금 틀림 → 다이얼이 조금, 작은 틱`));
  ev.push(snd.tick('fix_other', X.otherIn, 260, -37, 's15: 다른 글(해는 서쪽으로 → 진다)이 들어옴'));
  ev.push(snd.whoosh('fix_rewind_pre', X.rewindPre, 0.2, 420, 200, -40, `s15: ${K}번째 걸음 앞으로 되돌림`));
  ev.push(snd.tone('fix_big', X.bigT, 82, 0.6, -30, 's15: 30배로 고침 — 다이얼이 휙 돌고 다른 글의 정답 막대가 주저앉음(거친 낮은 음)', {harmonics: [1, 0.6, 0.45, 0.3], decay: 0.3, sustain: 0.3}));
  ev.push(snd.tick('fix_other_hi', X.otherHi, 180, -36, 's15: 주저앉은 다른 글의 막대 강조', {decay: 0.12}));
  ev.push(snd.whoosh('fix_rewind', X.rewind, X.rewindDur, 420, 180, -38, 's15: 되감기 — 작은 걸음의 결과로 돌아옴'));
  ev.push(snd.tick('fix_clear', X.rewind + X.rewindDur, 392, -34, 's15: 작은 걸음의 결과에 자리 잡음(맑은 틱)'));
  ev.push(snd.train('fix_ff', X.ffTicks.map(x => [x.t, 'tick', {freq: Math.min(560, 220 + 50 * Math.log2(x.m)), decay: 0.03, gain_db: -4 + 0 * x.k, click: 0}]), -38, `s16: 타임랩스 ×1 → ×64 — 걸음마다 틱(빨라질수록 간격이 좁아지고 음이 올라감, 초당 12개까지만)`));
  const cp = []; for (let tt = X.ff0; tt <= X.ffDone + 1e-6; tt += 0.25) cp.push([tt - X.ff0, 180 + 300 * M.CURVE[Math.round(X.kAt(tt))], 0.5]);
  cp[0][2] = 0; cp.push([cp[cp.length - 1][0] + 0.3, cp[cp.length - 1][1], 0]);
  ev.push(snd.chirp('fix_curve', X.ff0, cp, -42, 's16: 곡선(정답에 준 평균 확률)을 따르는 음 — 확률이 오르면 음이 오름'));
  return ev;
}
