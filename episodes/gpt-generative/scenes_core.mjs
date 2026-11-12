// 43 GPT는 대답을 어떻게 쓸까 — the key loop: loop (s11–s14) and dice (s15–s16). PLAN.md §6, §1.1.
// Exports: scenes {loop, dice}, titles, planCore(tl, P), soundCore(tl, P), signature(P).
// Every time comes from planCore (word anchors via kit.wd); picture, instrument and sound read the same numbers.
import * as K from './kit.mjs';
import {Q1, PATH, RUN, DROPS, dist, segsOf, segMid, pct} from './model.mjs';
import {CH, MACH, STRIP_Y, STRIP_H, SX0, SX1, BARS_Y0, WAIT, lay, makeRun, drawRun, centre, flyPath, along, chipAt, segX, uX,
  fallingMarker, ghostDividers, big, barRows, slab, morphSegs, panel2, strip2, frameBoxes, edgeA, STRIP_RECT, machRect, BAR_P, BAR_H, bbox} from './parts.mjs';
import {world} from './parts.mjs';
const D0 = dist(Q1);
import {backOut, spring, drop, squash, camAt, withCam, camPt, streak, ringPop, rollNum, speedBadge} from './motion.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, fadeIn, fadeOut, hitFlash} = K;
const FULL = {cx: 540, cy: 800, z: 1};
const STRIPCAM = frameBoxes([machRect(), STRIP_RECT]);
const segBox = (i, padX = 110) => { let a = 0; for (let k = 0; k < i; k++) a += D0[k].p; return {x: SX0 + a * (SX1 - SX0) - padX, y: STRIP_Y - 50, w: D0[i].p * (SX1 - SX0) + 2 * padX, h: STRIP_H + 110}; };

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planCore(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  // ---------------- loop
  {
    const L = {};
    L.merge0 = W_('s11', '이 확률에') - 0.1;                      // bars join end to end into the strip (domino, 0.09 s apart)
    L.mergeEnd = L.merge0 + 0.09 * 4 + 0.42;
    L.dice = W_('s11', '주사위를');                                 // camera pushes into the strip, marker starts falling
    L.pickA = W_('s11', '던지듯');                                  // marker lands (RUN.A step 0 → 햇빛)
    L.rise = W_('s11', '뽑습니다');                                 // 햇빛 lifts out of its segment and flies (whip pan) to wait under the line end
    L.riseEnd = L.rise + 0.45;
    L.drops = DROPS.map((u, k) => ({u, t: W_('s12', '높은') + 0.09 + 0.28 * k}));   // rain: one every 0.28 s, each falls 0.38 s
    L.dropFall = 0.38;
    L.low = L.drops[11].t;                                          // the single '바다' drop (DROPS seed puts it last) ≈ "낮은 조각도"
    L.attach = W_('s13', '붙이고') + 0.25;                          // 햇빛 springs up into place at the line end
    L.attach0 = W_('s13', '붙이고');
    L.read0 = W_('s13', '처음부터'); L.read1 = L.read0 + 0.9;        // sweep over the 7 chips
    L.pulse1 = L.read1 + 0.35;
    L.newDiv = W_('s13', '새로');                                   // the strip re-divides (dist(Q1 + 햇빛))
    // s14: the rest of path A, accelerating ×1 → ×2 → ×4 → ×8
    const iv = [0.9, 0.9, 0.45, 0.45, 0.45, 0.22, 0.22, 0.22, 0.22, 0.11, 0.11, 0.11, 0.11];
    L.mult = [1, 1, 1, 2, 2, 2, 4, 4, 4, 4, 8, 8, 8, 8];             // per step of the run (A steps 1..14)
    const picks = [L.newDiv + 1.0]; for (const d of iv) picks.push(picks[picks.length - 1] + d);
    L.run = makeRun({ctx: [...Q1, '햇빛'], ctxKinds: [...Q1.map(() => 'given'), 'made'], steps: RUN.A.steps.slice(1), picks,
      sweep: k => k > 0 && L.mult[k] === 1, switch0: L.newDiv,
      over: {0: {tSwitch: L.newDiv, sweep: [L.read0, L.read1], pulse: [L.read1, L.pulse1], busy: [L.pulse1, L.newDiv]}}});
    L.fast = L.run.S[3].tSwitch;                                    // "빨리 감기" from the first ×2 step
    L.endLand = L.run.done;                                         // ■ attached
    L.push = L.endLand + 0.3;                                       // camera pushes onto the finished answer
    L.cam = [
      {t: SC.loop.start, ...FULL}, {t: L.dice - 0.05, ...FULL}, {t: L.dice + 0.4, ...STRIPCAM},
      {t: L.pickA + 0.3, ...STRIPCAM}, {t: L.rise - 0.05, ...frameBoxes([segBox(0, 40)], {zMax: 1.6})},          // slow push onto the picked segment
      {t: L.riseEnd, ...hoverCam()}, {t: W_('s12', '확률이') - 0.45, ...hoverCam()},               // whip pan with the piece
      {t: W_('s12', '확률이') + 0.05, ...STRIPCAM}, {t: L.low - 0.1, ...STRIPCAM},
      {t: L.low + 0.35, ...frameBoxes([segBox(2)], {zMax: 1.6})}, {t: SC.loop.start + 12.1, ...frameBoxes([segBox(2)], {zMax: 1.6})},
      {t: L.attach0 - 0.45, ...FULL}, {t: L.attach0 - 0.05, ...hoverCam(1.4)}, {t: L.read0 - 0.3, ...hoverCam(1.4)},
      {t: L.read0 + 0.3, ...FULL}, {t: L.push, ...FULL}, {t: L.push + 0.7, ...frameBoxes(L.run.boxes, {zMax: 1.3})}];
    P.loop = L;
  }
  // ---------------- dice
  {
    const D = {};
    D.ghost0 = SC.dice.start + 0.05;                               // A slides down into its own block and turns into an outline
    D.bLay = {...CH, y0: 394};                                    // B, G1, G2 are written over the outline of A
    D.aBlock = lay(PATH.A, D.bLay);
    const bPicks = RUN.B.steps.map((_, k) => W_('s15', '뽑기') + 0.3 * k);
    D.runB = makeRun({ctx: [], steps: RUN.B.steps, picks: bPicks, layout: D.bLay, switch0: bPicks[0] - 0.35, fly: 0.2});
    D.diff = W_('s15', '조금씩');                                    // B chips not in A light up
    D.needle = W_('s16', '맡기지');                                  // marker → fixed needle on the widest segment
    const g1 = RUN.G.steps.map((_, k) => W_('s16', '확률이') + 0.2 * k);
    D.runG1 = makeRun({ctx: [], steps: RUN.G.steps, picks: g1, layout: D.bLay, switch0: g1[0] - 0.25, fly: 0.12});
    D.bGone = D.needle - 0.4;                                       // B is erased (backspace) before the needle
    D.bOut = D.runG1.done + 0.1;                                     // G1 is erased, G2 writes again
    const g2 = RUN.G.steps.map((_, k) => D.bOut + 0.4 + 0.11 * k);
    D.runG2 = makeRun({ctx: [], steps: RUN.G.steps, picks: g2, layout: D.bLay, switch0: g2[0] - 0.2, fly: 0.07, over: {0: {tSwitch: D.bOut + 0.15}}});
    D.cam = [{t: SC.dice.start, ...FULL}, {t: D.diff - 0.3, ...FULL}, {t: D.diff + 0.2, ...frameBoxes(D.aBlock, {zMax: 1.4})}, {t: P.tl.at('s15:end') + 0.4, ...frameBoxes(D.aBlock, {zMax: 1.4})},
      {t: D.needle - 0.2, ...STRIPCAM}, {t: g1[0] - 0.25, ...STRIPCAM}, {t: g1[0] + 0.25, ...FULL}];
    P.dice = D;
  }
  return P;
}
function hoverCam(z = 1.4) { const B = lay([...Q1, '햇빛']), b = B[6], hp = hoverPt(); return frameBoxes([...B.filter(x => x.line === b.line), {...b, x: hp[0] - b.w / 2, y: hp[1] - b.h / 2}], {zMax: z}); }
const hoverPt = () => { const b = lay([...Q1, '햇빛'])[6]; return [b.x + b.w / 2, b.y + b.h / 2 + 120]; };

// =====================================================================================================
// LOOP
// =====================================================================================================
/** bars (token's final state) → strip, domino: row i slides into its segment with backOut */
function mergeBars(stage, t, L, a = 1) {
  const c = stage.ctx, bx0 = SX0 + 212, bx1 = SX1 - 120, rows = barRows(D0);
  let acc = 0;
  rows.forEach((r, i) => {
    const q = clamp((t - L.merge0 - 0.09 * i) / 0.42), e = backOut(q), y0 = BARS_Y0 + i * BAR_P + 4, h0 = BAR_H - 8;
    const x = lerp(bx0, SX0 + acc * (SX1 - SX0) + 1, e), y = lerp(y0, STRIP_Y + 1, e), w = lerp(r.p * (bx1 - bx0), r.p * (SX1 - SX0) - 2, e), h = lerp(h0, STRIP_H - 2, e);
    acc += r.p;
    const rest = r.kind === 'rest';
    // label plate slides into its bar and goes
    K.withAlpha(c, a * (1 - smooth(q / 0.5)), () => { slab(c, lerp(SX0, x, e), y0 - 4, 200, BAR_H, 10, '#26343B', '#1A252B'); stage.text(r.label, lerp(SX0, x, e) + 100, y0 + BAR_H / 2 - 4, {size: 34, weight: 500, align: 'center', color: PAL.ink}); });
    K.withAlpha(c, a, () => slab(c, x, y, w, h, 6, rest ? '#56656B' : i % 2 ? '#C9863A' : '#E9A24C', rest ? '#44525A' : '#A56E2E'));
    if (q > 0 && q < 0.8) streak(stage, [bx0 + w, y0 + 19], [x + w, y + h / 2], 1, {len: 0.5, w: 4, a: 0.3 * a});
  });
}
function loopScene(stage, t, p, ctx) {
  const P = ctx.P, L = P.loop, R = L.run, c = stage.ctx, cam = camAt(t, L.cam), G = glowBegin(), sp = (x, y) => camPt(cam, x, y);
  const merged = t >= L.mergeEnd;
  world(stage, cam, () => {
    // chips: Q1 + 햇빛 (hidden until it attaches) + the run's pieces
    const attached = t >= L.attach;
    drawRun(stage, t, R, {G, cam, strip: t >= R.S[0].tSwitch, prevDist: D0, caret: attached || t < L.rise,
      chipMod: i => (i === 6 ? {a: attached ? 1 : 0} : null)});
    if (attached) ringPop(stage, ...centre(R.boxes[6]), t, L.attach, {r0: 30, r1: 70, a: 0.6});
    // step 0 (s11–s13): bars → strip, marker, the rain of DROPS, the drawn 햇빛 waiting under the line end
    if (t < R.S[0].tSwitch) {
      if (!merged) { panel2(stage, smooth((t - L.merge0) / 0.5)); mergeBars(stage, t, L); }
      else {
        panel2(stage, 1);
        const landed = t >= L.pickA, dropsOn = t >= L.drops[0].t - L.dropFall;
        strip2(stage, segsOf(D0), {y: STRIP_Y, u: landed && !dropsOn ? RUN.A.steps[0].u : null, uA: 1, cam});
        if (!landed && t >= L.dice) fallingMarker(stage, RUN.A.steps[0].u, (t - L.dice) / (L.pickA - L.dice), 1, {h: 120});
        if (landed && !dropsOn) {
          ringPop(stage, uX(RUN.A.steps[0].u), STRIP_Y - 6, t, L.pickA, {a: 0.8});
          const fl = hitFlash(t, L.pickA, 0.4); if (fl > 0) K.splatBurst(G.GW, ...sp(segX(D0, 0), STRIP_Y + STRIP_H / 2), 30 * cam.z, 0.8 * fl);
        }
        // DROPS: each falls 0.38 s, leaves a thin warm tick through the band
        for (const d of L.drops) {
          if (t < d.t - L.dropFall) continue;
          const x = uX(d.u);
          if (t < d.t) fallingMarker(stage, d.u, (t - (d.t - L.dropFall)) / L.dropFall, 0.95);
          else {
            const isLow = d === L.drops[11];
            K.line(c, [[x, STRIP_Y - 8], [x, STRIP_Y + STRIP_H + 6]], K.rgba(isLow ? PAL.hot : PAL.warm, 0.85), isLow ? 3 : 2);
            ringPop(stage, x, STRIP_Y - 6, t, d.t, {a: 0.6, r1: 34});
            if (isLow) { // the low one: its segment lights
              const pick = 2, sx0 = SX0 + D0[0].p * (SX1 - SX0) + D0[1].p * (SX1 - SX0);
              K.withAlpha(c, smooth((t - d.t) / 0.1), () => { c.beginPath(); c.roundRect(sx0, STRIP_Y, D0[pick].p * (SX1 - SX0), STRIP_H, 7); c.strokeStyle = PAL.hot; c.lineWidth = 3; c.stroke(); });
              const fl = hitFlash(t, d.t, 0.35); if (fl > 0) K.splatBurst(G.GW, ...sp(segX(D0, pick), STRIP_Y + STRIP_H / 2), 26 * cam.z, 0.8 * fl);
            }
          }
        }
      }
    }
    // the drawn 햇빛: lifts out of its segment, flies (whip pan) to wait under the line end, springs into place
    if (t >= L.rise && t < L.attach) {
      const b = R.boxes[6], from = [segX(D0, 0), STRIP_Y + STRIP_H / 2], hp = hoverPt();
      let pt;
      if (t < L.riseEnd) { const path = flyPath(from, hp); const q = easeInOut((t - L.rise) / (L.riseEnd - L.rise)); pt = along(path, q); streak(stage, along(path, Math.max(0, q - 0.2)), pt, 1, {len: 1, w: 30, a: 0.3}); }
      else if (t < L.attach0) pt = hp;
      else { const q = backOut((t - L.attach0) / (L.attach - L.attach0)); pt = [hp[0], lerp(hp[1], b.y + b.h / 2, q)]; }
      K.chip(stage, {...b, x: pt[0] - b.w / 2, y: pt[1] - b.h / 2}, {kind: 'made', hi: t < L.riseEnd ? 1 : 0});
    }
  });
  glowFlush(stage);
  // fixed layer: big number, speed badge
  if (t >= L.pickA && t < P.tl.at('s12') - 0.2) big(stage, rollNum(Math.round(D0[0].p * 100), clamp((t - L.pickA) / 0.4)), '%', t, L.pickA, fadeOut(t, P.tl.at('s12') - 0.5, 0.3), {y: 470});
  if (t >= R.S[0].tSwitch) {
    const n = 1 + R.landed(t), t0 = R.S[0].tLand;
    if (t >= t0) big(stage, String(n), '조각', t, t0, fadeOut(t, L.push, 0.25), {pop: false});
    const k = Math.max(0, R.cur(t)), done = t > R.done + 0.6;
    if (t >= R.S[1].tSwitch - 0.1 && !done) speedBadge(stage, L.mult[k], 1);
  }
}

// =====================================================================================================
// DICE
// =====================================================================================================
/** backspace: chips pulled into the first box, right to left, between t0 and t0 + d */
function erase(stage, boxes, kinds, t, t0, d = 0.35) {
  const n = boxes.length, f = boxes[0];
  boxes.forEach((b, i) => {
    const q = clamp((t - t0 - (d - 0.2) * (n - 1 - i) / Math.max(1, n - 1)) / 0.2); if (q >= 1) return;
    const e = q * q, w = b.w * (1 - e) + 1;
    K.chip(stage, {...b, x: lerp(b.x, f.x, e), y: lerp(b.y, f.y, e), w}, {kind: kinds[i], a: 1 - e});
  });
}
function diceScene(stage, t, p, ctx) {
  const P = ctx.P, D = P.dice, L = P.loop, cam = camAt(t, D.cam), G = glowBegin(), c = stage.ctx;
  const flow = L.run.boxes, nQ = Q1.length, aSet = new Set(PATH.A), kindsA = PATH.A.map(x => (x === '■' ? 'end' : 'made'));
  const cur = t < D.bOut ? D.runG1 : D.runG2, covered = i => t >= D.needle && cur.landed(t) > i;
  world(stage, cam, () => {
    // Q1 stays on the first line
    for (let i = 0; i < nQ; i++) K.chip(stage, flow[i], {kind: 'given', a: edgeA(cam, flow[i])});
    // A slides into its block under the question (spring, staggered) and becomes an outline (afterimage)
    PATH.A.forEach((s, i) => {
      const f = flow[nQ + i], b = D.aBlock[i], q = clamp((t - D.ghost0 - 0.03 * i) / 0.45), e = backOut(q);
      const box = {...b, x: lerp(f.x, b.x, e), y: lerp(f.y, b.y, e)}, ghost = q >= 1;
      if (ghost && covered(i)) return;
      K.chip(stage, box, {kind: ghost ? 'ghost' : kindsA[i], a: edgeA(cam, box)});
    });
    // B: drawn fast over A's outline; where it differs from A, its pieces light up; erased before the needle
    if (t < D.bGone) drawRun(stage, t, D.runB, {G, cam, caret: t < D.runB.done,
      chipMod: i => ({hi: !aSet.has(PATH.B[i]) || i === 0 ? smooth((t - D.diff) / 0.2) : 0})});
    else {
      if (t < D.needle + 0.1) erase(stage, lay(PATH.B, D.bLay), PATH.B.map(x => (x === '■' ? 'end' : 'made')), t, D.bGone);
      K.machine(stage, MACH, {busy: 0, a: edgeA(cam, MACH)});
    }
    // greedy: a fixed needle on the widest segment; G1 writes over A exactly, is erased, G2 writes it again
    if (t >= D.needle) {
      drawRun(stage, t, cur, {G, cam, noFall: true, machine: false, caret: t < cur.done});
      if (t >= D.bOut && t < D.bOut + 0.4) erase(stage, lay(PATH.A, D.bLay), kindsA, t, D.bOut);
      if (t < D.runG1.S[0].tSwitch) { panel2(stage, 1); strip2(stage, segsOf(D0), {y: STRIP_Y, cam}); }
      const k = cur.cur(t), d = k >= 0 ? cur.S[k].dist : D0;
      const x0 = uX(D.runB.S[D.runB.n - 1].u), x1 = uX(segMid(d, 0));
      const x = t < D.runG1.S[0].tSwitch ? lerp(x0, uX(segMid(D0, 0)), spring(clamp((t - D.needle) / 0.6))) : x1;
      K.line(c, [[x, MACH.y + MACH.h], [x, STRIP_Y + STRIP_H + 4]], K.rgba(PAL.warm, 0.9), 3);
      c.beginPath(); c.moveTo(x - 15, STRIP_Y - 34); c.lineTo(x + 15, STRIP_Y - 34); c.lineTo(x, STRIP_Y - 6); c.closePath(); c.fillStyle = PAL.warm; c.fill();
      const tx = Math.min(Math.max(x + 160, 250), 830), ta = smooth((t - D.needle - 0.4) / 0.3) * edgeA(cam, {x: tx - 140, y: 966, w: 280, h: 50});
      K.tag(stage, '가장 높은 것만', tx, 990, {size: 34, color: PAL.warm, a: ta});
    }
  });
  glowFlush(stage);
  if (t >= D.needle) { if (t >= cur.S[0].tSwitch && t < cur.done + 0.4) speedBadge(stage, t < D.bOut ? 4 : 8, 1); }
  else if (t >= D.runB.S[0].tSwitch && t < D.runB.done + 0.4) speedBadge(stage, 3, 1);
}

export const scenes = {loop: loopScene, dice: diceScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  loop: P => { const at = s => P.tl.at(s) - 0.5, K1 = '실제보다 느리게';
    return [[-Infinity, K1, '확률대로 하나를 뽑는다'], [at('s12'), K1, '높으면 자주, 낮아도 가끔'], [at('s13'), K1, '붙이고, 처음부터 다시 읽는다'], [P.loop.fast - 0.2, '빨리 감기', "'끝' 조각이 나올 때까지"]]; },
  dice: P => [[-Infinity, '빨리 감기', '다시 물으면 다른 대답'], [P.tl.at('s16') - 0.5, '빨리 감기', '가장 높은 것만 고르면']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
const SEGF = [262, 330, 392, 440];
export function soundCore(tl, P) {
  const L = P.loop, D = P.dice, ev = [], R = L.run;
  ev.push(snd.tick('loop_pick', L.pickA, 392, -24, '표지가 띠의 햇빛 칸(62%)에 떨어짐 — 칸의 번쩍임과 같은 프레임', {decay: 0.1}));
  ev.push(snd.tone('loop_rise', L.rise, 196, 0.3, -32, '뽑힌 햇빛 조각이 칸에서 떠올라 글줄 쪽으로 감', {decay: 0.15}));
  L.drops.forEach((d, k) => { const i = segsOf(D0).findIndex((_, j) => K.stripPick(segsOf(D0), d.u) === j);
    ev.push(snd.tick('drop' + String(k + 1).padStart(2, '0'), d.t, SEGF[i] || 494, k === 11 ? -24 : -30, `연달아 떨어지는 표지 ${k + 1} — ${D0[i].piece} 칸(칸마다 음높이가 다름)`, {decay: 0.07})); });
  ev.push(snd.tone('loop_attach', L.attach, 330, 0.25, -28, '햇빛 조각이 글줄 끝에 붙음', {decay: 0.12}));
  ev.push(snd.swell('loop_read', L.read0, [131, 196], 1.6, -32, '한 조각 길어진 글을 처음부터 다시 읽음(밑줄이 첫 조각부터)'));
  ev.push(snd.tone('loop_redivide', L.newDiv, 262, 0.3, -30, '띠가 새 확률로 다시 나뉨', {decay: 0.15}));
  // s14: ×1 steps one by one (with their read swells), then one train per speed (pitch and density rise)
  R.S.forEach((s, k) => { if (L.mult[k] === 1) ev.push(snd.tick('step' + String(k + 1).padStart(2, '0'), s.tPick, 330, -27, `한 걸음(×1): 표지가 '${s.piece}' 칸에 떨어짐`, {decay: 0.08})); });
  R.S.forEach((s, k) => { if (s.sweep && k > 0) ev.push(snd.swell('step' + String(k + 1).padStart(2, '0') + '_read', s.sweep[0], [131, 196], 0.7, -36, `걸음 ${k + 1}: 처음부터 다시 읽음`)); });
  for (const [m, f] of [[2, 392], [4, 466], [8, 554]]) {
    const items = R.S.filter((s, k) => L.mult[k] === m && s.piece !== '■').map(s => [s.tPick, 'tick', {freq: f, decay: 0.05, click: 0, gain_db: 0}]);
    ev.push(snd.train('steps_x' + m, items, -29, `빨리 감기 ×${m}: 표지가 떨어질 때마다 틱(배속이 오를수록 높고 촘촘하게)`));
  }
  const endS = R.S[R.n - 1];
  ev.push(snd.tick('end_pick', endS.tPick, 554, -29, "'■' 칸에 표지가 떨어짐", {decay: 0.05}));
  ev.push(snd.tone('end_attach', endS.tLand, 220, 0.6, -26, "끝 조각 '■'이 붙고 대답이 완성됨(맺음 음)", {decay: 0.3, sustain: 0.2}));
  // dice
  ev.push(snd.train('dice_B', D.runB.S.map(s => [s.tPick, 'tick', {freq: 220 + Math.round(300 * s.p), decay: 0.05, click: 0, gain_db: 0}]), -29, '같은 질문을 다시: 대답 B가 빠르게 뽑힘(걸음마다 뽑힌 확률에 비례한 높이)'));
  ev.push(snd.tone('dice_diff', D.diff, 262, 0.3, -31, 'A와 다른 조각이 드러남', {decay: 0.15}));
  ev.push(snd.tone('dice_needle', D.needle + 0.3, 196, 0.35, -30, '표지가 가장 넓은 칸에 붙는 고정 바늘로 바뀜', {decay: 0.2}));
  for (const [id, run, nm] of [['dice_G1', D.runG1, '첫째'], ['dice_G2', D.runG2, '둘째']])
    ev.push(snd.train(id, run.S.map(s => [s.tPick, 'tick', {freq: 220 + Math.round(300 * s.p), decay: 0.05, click: 0, gain_db: 0}]), -29, `가장 높은 것만(${nm}): 같은 음 순서가 되풀이됨 — 대답이 A와 같음`));
  return ev;
}
export const signature = P => [P.loop.pickA, P.loop.attach, P.loop.run.done, P.dice.runG2.done].map(x => x.toFixed(3)).join(',');
