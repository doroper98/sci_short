// 43 GPT는 대답을 어떻게 쓸까 — chat (s17–s18), wrong (s19–s20), close (s21–s22). PLAN.md §6, §1.1, §1.2.
// Exports: scenes {chat, wrong, close}, titles, planEnd(tl, P), soundEnd(tl, P), signature(P).
import * as K from './kit.mjs';
import {Q1, Q2, PATH, RUN, CTX_R, dist, segsOf, pct} from './model.mjs';
import {CH, CH40, MACH, STRIP_Y, STRIP_H, SX0, SX1, lay, makeRun, drawRun, centre, chipAt, big, slab, world, panel2, strip2, edgeA, frameBoxes, machRect,
  STRIP_RECT, bbox, uX, segX, fallingMarker, madeKind} from './parts.mjs';
import {posterRun, drawPoster} from './scenes_intro.mjs';
import {backOut, spring, drop, squash, camAt, camPt, streak, ringPop, rollNum, speedBadge} from './motion.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, easeIn, fadeIn, fadeOut, hitFlash} = K;
const FULL = {cx: 540, cy: 800, z: 1};
const A = PATH.A, A0 = A.slice(0, -1);
const MLOW = {...MACH, y: 770};                                    // chat / wrong: the machine moves down for the long text
const io = m => ({inlet: [m.x + m.w / 2, m.y], outlet: [m.x + m.w / 2, m.y + m.h]});
const D0 = dist(Q1);
/** backspace: chips pulled into the first box, right to left */
function erase(stage, boxes, kinds, t, t0, d = 0.4, cam = null) {
  const n = boxes.length, f = boxes[0];
  boxes.forEach((b, i) => {
    const q = clamp((t - t0 - (d - 0.2) * (n - 1 - i) / Math.max(1, n - 1)) / 0.2); if (q >= 1) return;
    const e = q * q;
    K.chip(stage, {...b, x: lerp(b.x, f.x, e), y: lerp(b.y, f.y, e), w: b.w * (1 - e) + 1}, {kind: kinds[i], a: (1 - e) * (cam ? edgeA(cam, b) : 1)});
  });
}
const kindsOf = arr => arr.map(madeKind);

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planEnd(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc, at = r => tl.at(r);
  // ---------------- chat
  {
    const C = {};
    C.in0 = SC.chat.start;                                         // pieces shrink to 40 px and gather into three blocks
    C.q1 = W_('s17', '내'); C.a = W_('s17', '지피티의'); C.q2 = W_('s17', '그다음');
    C.join = W_('s17', '이어');                                     // the three blocks slide into one long text
    C.read0 = W_('s17', '들어갑니다'); C.read1 = C.read0 + 0.7; C.pulse1 = C.read1 + 0.3;
    C.blocks = {q1: lay(Q1, {...CH40, y0: 310}), a: lay(A0, {...CH40, y0: 430}), q2: lay(Q2, {...CH40, y0: 640})};
    const n = RUN.R.steps.length, p0 = C.pulse1 + 0.35, dt = Math.min(0.55, (SC.chat.end - 0.35 - p0) / (n - 1));
    C.picks = RUN.R.steps.map((_, k) => p0 + dt * k);
    C.run = makeRun({ctx: CTX_R, ctxKinds: [...Q1.map(() => 'given'), ...A0.map(() => 'made'), ...Q2.map(() => 'given')], steps: RUN.R.steps, picks: C.picks,
      layout: CH40, fly: 0.16, sweep: k => k > 0, over: {0: {tSwitch: C.pulse1 + 0.02, sweep: [C.read0, C.read1], pulse: [C.read1, C.pulse1], busy: [C.pulse1 - 0.05, C.pulse1 + 0.02]}}});
    C.dt = dt;
    const all = C.run.boxes;
    C.cam = [{t: C.in0, ...FULL}, {t: C.join - 0.1, ...FULL}, {t: C.join + 0.5, ...frameBoxes([...all, machRect(MLOW), STRIP_RECT], {pad: 50, zMax: 1})}];
    P.chat = C;
  }
  // ---------------- wrong
  {
    const Wr = {};
    Wr.in0 = SC.wrong.start;                                       // the conversation is erased back to the question; machine back up
    Wr.drop0 = W_('s19', "'바다'가") - 0.85;                         // slow motion: the marker drifts down into the narrow 바다 segment
    Wr.pick0 = W_('s19', '뽑히면');
    const rest = RUN.C.steps.slice(1).map((_, k) => W_('s19', '바다가') + 0.4 * k);
    Wr.run = makeRun({ctx: Q1, steps: RUN.C.steps, picks: [Wr.pick0, ...rest], switch0: Wr.in0 + 0.5, over: {0: {tDrop: Wr.drop0}}});
    Wr.split = at('s20') - 0.5;                                     // C moves down into its own block, A appears above as an outline
    Wr.aLay = {...CH, y0: 394}; Wr.cLay = {...CH, y0: 582};
    Wr.tag = W_('s20', '사실을');
    Wr.replay0 = W_('s20', '그럴듯한');                              // C's steps are replayed: each piece lights with its %
    Wr.hiT = W_('s20', '확률이');                                   // the high-probability word piece ('때문')
    const steps = RUN.C.steps; let kMax = 1;
    steps.forEach((s, k) => { if (k > 0 && !['.', '■'].includes(s.piece) && s.p > steps[kMax].p) kMax = k; });
    Wr.kMax = kMax;
    Wr.replay = Array.from({length: kMax}, (_, k) => Wr.replay0 + (Wr.hiT - Wr.replay0) * k / kMax);   // steps 0 … kMax−1, then kMax at hiT
    Wr.replay.push(Wr.hiT);
    const segB = (() => { let a = 0; for (let k = 0; k < 2; k++) a += D0[k].p; return {x: SX0 + a * (SX1 - SX0) - 120, y: STRIP_Y - 150, w: D0[2].p * (SX1 - SX0) + 240, h: STRIP_H + 210}; })();
    const lineF = frameBoxes(Wr.run.boxes, {zMax: 1.3});
    Wr.cam = [{t: Wr.in0, ...FULL}, {t: Wr.drop0 - 0.1, ...FULL}, {t: Wr.drop0 + 0.5, ...frameBoxes([segB], {zMax: 1.6})}, {t: Wr.pick0 + 0.15, ...frameBoxes([segB], {zMax: 1.6})},
      {t: Wr.run.S[0].tLand, ...lineF}, {t: rest[0] - 0.1, ...lineF}, {t: rest[0] + 0.4, ...FULL},
      {t: Wr.split + 0.2, ...FULL}, {t: Wr.split + 0.8, ...frameBoxes([...lay(A, Wr.aLay), ...lay(RUN.C.pieces, Wr.cLay)], {zMax: 1.3})}, {t: Wr.hiT - 0.05, ...frameBoxes([...lay(A, Wr.aLay), ...lay(RUN.C.pieces, Wr.cLay)], {zMax: 1.3})}, {t: Wr.hiT + 0.6, ...frameBoxes(lay(RUN.C.pieces, Wr.cLay).slice(2, 7), {zMax: 1.45})}];
    P.wrong = Wr;
  }
  // ---------------- close
  {
    const Cl = {};
    Cl.in0 = SC.close.start;
    Cl.split = Cl.in0 + 0.15;                                       // two more machines slide out from behind
    Cl.emit = [W_('s21', '챗지피티와'), W_('s21', '클로드'), W_('s21', '제미나이')];
    Cl.emit2 = W_('s21', '방식으로');
    Cl.emit3 = W_('s21', '씁니다');                                // all three put out the next piece together
    Cl.merge = at('s22') - 0.2;                                     // back to one machine
    const n = 5, p0 = W_('s22', '다음'), last = P.poster - 1.1;
    Cl.picks = Array.from({length: n}, (_, k) => p0 + (last - p0) * k / (n - 1));
    Cl.run = makeRun({ctx: Q1, steps: RUN.A.steps.slice(0, n), picks: Cl.picks, switch0: Cl.merge + 0.3});
    Cl.cam = [{t: Cl.in0, ...FULL}];
    P.close = Cl;
  }
  return P;
}
const M3 = i => ({x: 45 + i * 340, y: MACH.y, w: 310, h: MACH.h});
const NAMES = ['챗GPT', '클로드', '제미나이'];

// =====================================================================================================
// CHAT
// =====================================================================================================
function chatScene(stage, t, p, ctx) {
  const P = ctx.P, C = P.chat, D = P.dice, cam = camAt(t, C.cam), G = glowBegin(), c = stage.ctx, R = C.run;
  const mq = backOut(clamp((t - C.in0) / 0.5)), mach = {...MACH, y: lerp(MACH.y, MLOW.y, mq)}, {inlet, outlet} = io(mach);
  world(stage, cam, () => {
    if (t < C.join) {
      // pieces shrink into three blocks: Q1 (given), A (made, without ■), Q2 drops in
      const big52 = lay(Q1), aBig = lay(A, D.bLay), q = backOut(clamp((t - C.in0) / 0.5));
      Q1.forEach((s, i) => { const f = big52[i], b = C.blocks.q1[i]; K.chip(stage, {...b, x: lerp(f.x, b.x, q), y: lerp(f.y, b.y, q), w: lerp(f.w, b.w, q), h: lerp(f.h, b.h, q)}, {kind: 'given'}); });
      A0.forEach((s, i) => { const f = aBig[i], b = C.blocks.a[i], qi = backOut(clamp((t - C.in0 - 0.02 * i) / 0.5)); K.chip(stage, {...b, x: lerp(f.x, b.x, qi), y: lerp(f.y, b.y, qi), w: lerp(f.w, b.w, qi), h: lerp(f.h, b.h, qi)}, {kind: 'made', hi: t >= C.a && t < C.a + 0.6 ? 1 - (t - C.a) / 0.6 : 0}); });
      if (t < C.in0 + 0.4) { const b = aBig[A.length - 1], s = 1 - easeIn(clamp((t - C.in0) / 0.3)); K.chip(stage, {...b, x: b.x + b.w / 2 * (1 - s), w: b.w * s + 1}, {kind: 'end', a: s}); }
      Q2.forEach((s, i) => { const b = C.blocks.q2[i], q2 = clamp((t - C.q2 - 0.06 * i) / 0.45); if (q2 <= 0) return; K.chip(stage, {...b, y: lerp(b.y - 50, b.y, drop(q2))}, {kind: 'given', a: clamp(q2 * 3)}); });
      if (t >= C.q1 && t < C.q1 + 0.6) Q1.forEach((s, i) => K.chip(stage, C.blocks.q1[i], {kind: 'given', hi: 1 - (t - C.q1) / 0.6}));
      K.machine(stage, mach, {a: edgeA(cam, mach)});
      // the last strip of the dice scene folds away
      const f = 1 - backOut(clamp((t - C.in0) / 0.45));
      if (f > 0.01) { c.save(); c.translate(SX0, 0); c.scale(Math.max(0.001, f), 1); c.translate(-SX0, 0); panel2(stage, 1); strip2(stage, [{label: '', p: 1}], {y: STRIP_Y, ticks: false}); c.restore(); }
    } else {
      // one long text; the run continues it (each step re-reads the whole conversation from the first piece)
      const B = R.boxes, nC = CTX_R.length, blk = [...C.blocks.q1, ...C.blocks.a, ...C.blocks.q2];
      const jq = i => backOut(clamp((t - C.join - 0.015 * i) / 0.5));
      drawRun(stage, t, R, {G, cam, mach, inlet, outlet, caret: t < R.done, hideCtx: t < C.join + 0.9, strip: t >= R.S[0].tSwitch, prevDist: D0});
      if (t < C.join + 0.9) for (let i = 0; i < nC; i++) { const f = blk[i], b = B[i], q = jq(i); K.chip(stage, {...b, x: lerp(f.x, b.x, q), y: lerp(f.y, b.y, q)}, {kind: R.kinds[i], a: edgeA(cam, b)}); }
      if (t < R.S[0].tSwitch) { const g = backOut(clamp((t - C.read0) / 0.4)); if (g > 0) { c.save(); c.translate(SX0, 0); c.scale(Math.max(0.001, g), 1); c.translate(-SX0, 0); panel2(stage, 1); strip2(stage, [{label: '', p: 1}], {y: STRIP_Y, ticks: false}); c.restore(); } }
    }
    // tags: 나 over the question, GPT over the answer (they ride on their head pieces)
    const headQ = t < C.join ? C.blocks.q1[0] : R.boxes[0], headA = t < C.join ? C.blocks.a[0] : R.boxes[Q1.length];
    const jq0 = backOut(clamp((t - C.join) / 0.5));
    const hq = t < C.join ? headQ : {...headQ, x: lerp(C.blocks.q1[0].x, headQ.x, jq0), y: lerp(C.blocks.q1[0].y, headQ.y, jq0)};
    const ha = t < C.join ? headA : {...headA, x: lerp(C.blocks.a[0].x, headA.x, jq0), y: lerp(C.blocks.a[0].y, headA.y, jq0)};
    const tg = (s, b, t0, col) => { if (t >= t0) K.tag(stage, s, b.x + 4, b.y - 26, {size: 30, color: col, align: 'left', a: backOut(clamp((t - t0) / 0.3)) * fadeOut(t, C.join + 1.2, 0.3) * edgeA(cam, {x: b.x, y: b.y - 30, w: 80, h: 34})}); };
    tg('나', hq, C.q1, PAL.coolHi); tg('GPT', ha, C.a, PAL.warm);
  });
  glowFlush(stage);
}

// =====================================================================================================
// WRONG
// =====================================================================================================
function wrongScene(stage, t, p, ctx) {
  const P = ctx.P, Wr = P.wrong, C = P.chat, cam = camAt(t, Wr.cam), G = glowBegin(), c = stage.ctx, R = Wr.run;
  const mach = MLOW;
  const split = t >= Wr.split, sq = backOut(clamp((t - Wr.split) / 0.55));
  const aB = lay(A, Wr.aLay), cB = lay(RUN.C.pieces, Wr.cLay);
  // replay index (s20)
  let rk = -1; Wr.replay.forEach((tr, k) => { if (t >= tr) rk = k; });
  world(stage, cam, () => {
    // the conversation is erased back to the question (and the question grows back to 52 px)
    if (t < Wr.in0 + 0.6) {
      const B = C.run.boxes, nQ = Q1.length;
      erase(stage, B.slice(nQ), C.run.kinds.slice(nQ), t, Wr.in0, 0.45, cam);
    }
    if (!split) {
      const g = backOut(clamp((t - Wr.in0 - 0.2) / 0.45));
      drawRun(stage, t, R, {G, cam, mach, ...io(mach), hideCtx: true, prevDist: C.run.S[C.run.n - 1].dist});
      const small = C.run.boxes, big52 = R.boxes;
      Q1.forEach((s, i) => { const f = small[i], b = big52[i]; const bx = {...b, x: lerp(f.x, b.x, g), y: lerp(f.y, b.y, g), w: lerp(f.w, b.w, g), h: lerp(f.h, b.h, g)}; K.chip(stage, bx, {kind: 'given', a: edgeA(cam, bx)}); });
    } else {
      // C moves down into its own block; A appears above it as an outline (afterimage of the right answer)
      Q1.forEach((s, i) => K.chip(stage, R.boxes[i], {kind: 'given', a: edgeA(cam, R.boxes[i])}));
      aB.forEach((b, i) => { const q = backOut(clamp((t - Wr.split - 0.2 - 0.02 * i) / 0.4)); if (q > 0) K.chip(stage, {...b, y: lerp(b.y - 40, b.y, q)}, {kind: 'ghost', a: clamp(q * 2) * edgeA(cam, b)}); });
      cB.forEach((b, i) => {
        const f = R.boxes[Q1.length + i], bx = {...b, x: lerp(f.x, b.x, sq), y: lerp(f.y, b.y, sq)};
        const hiNow = rk >= 0 && i === Math.min(rk, Wr.kMax) ? (i === Wr.kMax ? 1 : 1 - smooth((t - Wr.replay[rk]) / 0.3)) : 0;
        chipAt(stage, bx, t, i === Wr.kMax ? Wr.hiT : -9, {kind: madeKind(b.text), hi: hiNow, a: edgeA(cam, bx)});
      });
      if (t >= Wr.hiT) ringPop(stage, ...centre(cB[Wr.kMax]), t, Wr.hiT, {r0: 30, r1: 80, a: 0.7});
      const last = cB[cB.length - 1], tx = Math.min(last.x + last.w + 30, 830);
      if (t >= Wr.tag) K.tag(stage, '틀린 설명', tx, last.y + last.h / 2, {size: 34, align: 'left', color: PAL.muted, border: PAL.muted, a: backOut(clamp((t - Wr.tag) / 0.3)) * edgeA(cam, {x: tx - 10, y: last.y, w: 190, h: last.h})});
      K.machine(stage, mach, {a: edgeA(cam, mach)});
    }
  });
  glowFlush(stage);
  // big number: the drawn step's probability (9% → each step); in s20 the replayed steps, ending on the high one
  const kNow = R.cur(t), landed = kNow >= 0 && t >= R.S[kNow].tPick ? kNow : kNow - 1;
  if (!split && landed >= 0) { const s = R.S[landed], prev = landed > 0 ? R.S[landed - 1].p : 0; big(stage, rollNum(Math.round(s.p * 100), clamp((t - s.tPick) / 0.25), {from: Math.round(prev * 100)}), '%', t, R.S[0].tPick, 1, {pop: landed === 0}); }
  if (split && rk >= 0) { const s = R.S[Math.min(rk, Wr.kMax)], hot = t >= Wr.hiT; big(stage, String(Math.round(s.p * 100)), '%', t, Wr.replay[0], 1, {pop: hot, y: 1225, color: hot ? PAL.hot : PAL.ink}); }
}

// =====================================================================================================
// CLOSE
// =====================================================================================================
function closeScene(stage, t, p, ctx) {
  const P = ctx.P, Cl = P.close, Wr = P.wrong, cam = camAt(t, Cl.cam), G = glowBegin(), c = stage.ctx;
  if (t >= P.poster - 0.6) {   // the poster world (identical to 0 s)
    world(stage, FULL, () => drawPoster(stage, t - P.poster, {G, cam: FULL, machA: 1 - easeInOut(clamp((t - P.poster) / 0.8))}));
    glowFlush(stage); return;
  }
  world(stage, cam, () => {
    // wrong's blocks are erased; the question stays
    if (t < Cl.in0 + 0.6) { erase(stage, lay(A, Wr.aLay), A.map(() => 'ghost'), t, Cl.in0, 0.4, cam); erase(stage, lay(RUN.C.pieces, Wr.cLay), RUN.C.pieces.map(madeKind), t, Cl.in0, 0.4, cam); }
    const merged = t >= Cl.merge;
    if (!merged) {
      lay(Q1).forEach(b => K.chip(stage, b, {kind: 'given', a: edgeA(cam, b)}));
      // three machines: the side ones slide out from behind the middle one; each puts out a piece
      const sq = backOut(clamp((t - Cl.split) / 0.55));
      for (const i of [0, 2, 1]) {
        const m = M3(i), mm = {...m, x: lerp(M3(1).x, m.x, sq), y: lerp(MLOW.y, MACH.y, backOut(clamp((t - Cl.in0) / 0.5)))};
        if (i !== 1 && sq <= 0) continue;
        const ma = edgeA(cam, mm);
        K.machine(stage, mm, {label: i === 1 && sq < 0.5 ? 'GPT' : NAMES[i], a: ma, busy: clamp(1 - Math.abs(t - Cl.emit[i] + 0.15) / 0.25)});
        for (const [j, t0, piece] of [[0, Cl.emit[i], '햇빛'], [1, Cl.emit2, '의'], [2, Cl.emit3, '파란']]) {
          if (t < t0) continue;
          const q = clamp((t - t0) / 0.4), L = lay(['햇빛', '의', '파란'], {x0: mm.x + 10, x1: mm.x + mm.w, y0: 940, size: 52}), b = L[j], [ox, oy] = [mm.x + mm.w / 2, mm.y + mm.h];
          const bx = {...b, x: lerp(ox - b.w / 2, b.x, q), y: lerp(oy - b.h / 2, b.y, drop(q))};
          K.chip(stage, bx, {kind: 'made', a: clamp(q * 4) * edgeA(cam, b)});
          ringPop(stage, ...centre(b), t, t0 + 0.4 * 0.72, {r0: 20, r1: 60, a: 0.5});
        }
      }
    } else {
      // back to one machine (the side ones slide in behind it), then A is written again → the poster
      const sq = 1 - backOut(clamp((t - Cl.merge) / 0.45));
      for (const i of [0, 2]) if (sq > 0.02) { const m = M3(i), mm = {...m, x: lerp(M3(1).x, m.x, sq)}; K.machine(stage, mm, {label: NAMES[i], a: clamp(sq * 2)}); }
      const mw = lerp(MACH.w, M3(1).w, sq), mx = 540 - mw / 2;
      drawRun(stage, t, Cl.run, {G, cam, mach: {...MACH, x: mx, w: mw}, caret: true, strip: t >= Cl.run.S[0].tSwitch});
      if (t >= Cl.run.S[0].tSwitch && t < Cl.run.S[0].tSwitch + 0.5) { /* strip springs in via drawRun */ }
    }
  });
  glowFlush(stage);
}

export const scenes = {chat: chatScene, wrong: wrongScene, close: closeScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  chat: P => [[-Infinity, '대화', '이어 붙인 긴 글 하나'], [P.tl.at('s18') - 0.5, '실제보다 느리게', '매번 처음부터 다시 읽는다']],
  wrong: P => [[-Infinity, '첫걸음', "'바다'가 뽑히면"], [P.wrong.drop0 - 0.2, '느리게', "'바다'가 뽑히면"], [P.wrong.run.S[0].tLand + 0.2, '빨리 감기', "'바다'가 뽑히면"],
    [P.tl.at('s20') - 0.5, '설명용 확률표', '그럴듯해도 틀릴 수 있다']],
  close: P => [[-Infinity, '같은 방식', '대화 서비스도 이렇게 쓴다'], [P.tl.at('s22') - 0.5, '정리', '다음 조각 하나를 되풀이']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundEnd(tl, P) {
  const C = P.chat, Wr = P.wrong, Cl = P.close, ev = [];
  ev.push(snd.tone('chat_join', C.join + 0.3, 196, 0.35, -32, '질문·대답·다음 질문이 한 줄의 긴 글로 붙음', {decay: 0.18}));
  ev.push(snd.swell('chat_read', C.read0, [131, 196], 1.2, -32, '대화 전체가 처음부터 읽혀 기계로 들어감'));
  ev.push(snd.train('chat_reads', C.run.S.filter(s => s.sweep && s.k > 0).map(s => [s.sweep[0], 'swell', {freqs: [131, 196], dur: 0.35, attack: 0.08, gain_db: 0}]), -40, '걸음마다 대화 전체를 첫 조각부터 다시 읽음(약한 스웰)'));
  ev.push(snd.train('chat_steps', C.run.S.map(s => [s.tPick, 'tick', {freq: s.piece === '■' ? 220 : 330, decay: 0.06, click: 0, gain_db: 0}]), -29, '대화 뒤에 대답이 한 조각씩 뽑힘(걸음마다 틱)'));
  ev.push(snd.tick('wrong_pick', Wr.pick0, 196, -24, "느리게: 표지가 좁은 '바다' 칸(9%)에 떨어짐", {decay: 0.2}));
  ev.push(snd.train('wrong_steps', Wr.run.S.slice(1).map(s => [s.tPick, 'tick', {freq: s.piece === '■' ? 220 : 392, decay: 0.05, click: 0, gain_db: 0}]), -29, '틀린 설명이 매끄럽게 이어짐(걸음마다 넓은 칸)'));
  ev.push(snd.tone('wrong_high', Wr.hiT, 147, 0.6, -27, `확률이 높은 조각('${RUN.C.steps[Wr.kMax].piece}' ${Math.round(RUN.C.steps[Wr.kMax].p * 100)}%)이 강조됨 — 그래도 틀린 설명`, {decay: 0.3, sustain: 0.2}));
  Cl.emit.forEach((te, i) => ev.push(snd.tick('close_emit' + (i + 1), te + 0.29, 262 + 30 * i, -29, `${NAMES[i]} 기계가 조각 하나를 내놓음`, {decay: 0.08})));
  ev.push(snd.tick('close_emit_all', Cl.emit2 + 0.29, 330, -28, '세 기계가 함께 다음 조각을 내놓음', {decay: 0.08}));
  ev.push(snd.tick('close_emit_all2', Cl.emit3 + 0.29, 330, -28, '세 기계가 함께 그다음 조각을 내놓음', {decay: 0.08}));
  ev.push(snd.train('close_steps', Cl.run.S.map(s => [s.tPick, 'tick', {freq: 392, decay: 0.05, click: 0, gain_db: 0}]), -30, '기계 하나가 대답을 한 조각씩 다시 씀'));
  ev.push(snd.train('close_poster', posterRun.S.map(s => [P.poster + s.tPick, 'tick', {freq: 392, decay: 0.05, click: 0, gain_db: 0}]).filter(x => x[0] > P.poster && x[0] < P.end - 0.05), -31, '포스터 구도: 0.5초마다 표지가 떨어짐(첫 화면과 같음)'));
  ev.push(snd.swell('poster_end', P.poster, [98, 147], 1.8, -32, '포스터 구도로 돌아옴(맺음)'));
  return ev;
}
export const signature = P => [P.chat.join, P.wrong.pick0, P.close.merge].map(x => x.toFixed(3)).join(',');
