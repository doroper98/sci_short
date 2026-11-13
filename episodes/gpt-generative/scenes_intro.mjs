// 43 GPT는 대답을 어떻게 쓸까 — hook (s01–s03), origin (s04–s05), essence (s06). PLAN.md §6, §1.1.
// Exports: scenes {hook, origin, essence}, titles, planIntro(tl, P), soundIntro(tl, P), signature(P), posterRun, drawPoster.
import * as K from './kit.mjs';
import {Q1, PATH, RUN, dist} from './model.mjs';
import {CH, MACH, INLET, OUTLET, STRIP_Y, panel2, strip2, edgeA, frameBoxes, machRect, lay, makeRun, drawRun, centre, flyPath, along, chipAt, big, slab, madeKind} from './parts.mjs';
import {world} from './parts.mjs';
import {backOut, spring, drop, squash, camAt, withCam, camPt, streak, ringPop, rollNum, speedBadge} from './motion.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, easeIn, fadeIn, fadeOut} = K;
const FULL = {cx: 540, cy: 800, z: 1};
const A = PATH.A;

// =====================================================================================================
// the poster loop (0 s and the last 1.4 s): Q1 + 햇빛 의 파란 빛 이 on the line, path A continues every 0.5 s
// =====================================================================================================
/** run for the poster loop, local time τ (0 = the thumbnail frame) */
export const posterRun = makeRun({ctx: [...Q1, ...A.slice(0, 5)], ctxKinds: [...Q1.map(() => 'given'), ...A.slice(0, 5).map(() => 'made')],
  steps: RUN.A.steps.slice(5), picks: RUN.A.steps.slice(5).map((_, k) => 0.2 + 0.5 * k), switch0: -0.6});
/** draw the poster world at local time τ (inside withCam). o: {G, cam, machA} */
export function drawPoster(stage, tau, o = {}) {
  return drawRun(stage, tau, posterRun, {G: o.G, cam: o.cam, machA: o.machA ?? 0, a: o.a ?? 1});
}
/** camera keys following the writing head (caret) of a run: one key per landing */
function followKeys(R, from, to, z = 1.3, dy = 250) {
  const keys = [];
  R.S.forEach((s, k) => { if (s.tLand < from || s.tLand > to) return; const b = R.boxes[R.ctx.length + k]; keys.push({t: s.tLand + 0.05, cx: clamp(b.x + b.w, 420, 660), cy: b.y + dy, z}); });
  return keys;
}

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planIntro(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc, at = r => tl.at(r);
  // ---------------- hook
  {
    const H = {};
    H.erase0 = posterRun.done + 0.45;                 // answer is pulled back into the caret (backspace), strip folds away
    H.erase1 = H.erase0 + 0.5;
    H.ask0 = W_('s02', '질문하면'); H.ask1 = H.ask0 + 0.9;      // the question is read (sweep)
    H.ghost0 = W_('s02', '한꺼번에'); H.ghost1 = W_('s02', '않고') + 0.1;   // the whole answer at once — then it is not so
    H.stream0 = W_('s02', '앞에서부터');
    H.reveal = W_('s03', '한', 0.5);                   // "한 조각씩": the machine and the path appear
    const inplace = RUN.A.steps.slice(0, 11), pIn = inplace.map((_, k) => H.stream0 + 0.45 * k);
    H.runIn = makeRun({ctx: Q1, steps: inplace, picks: pIn, from: 'inplace'});
    const outl = RUN.A.steps.slice(11), pOut = outl.map((_, k) => H.reveal + 0.1 + 0.45 * k);
    H.runOut = makeRun({ctx: [...Q1, ...A.slice(0, 11)], ctxKinds: [...Q1.map(() => 'given'), ...A.slice(0, 11).map(madeKind)], steps: outl, picks: pOut, from: 'outlet', switch0: pOut[0] - 0.3});
    H.toMach = at('s03:end') - 0.6;                    // camera pushes into the machine's name plate (→ origin)
    const posterEnd = posterRun.S[posterRun.n - 1].tLand;
    H.cam = [{t: 0, ...FULL}, {t: P.MORPH[1] + 0.1, ...FULL}, ...followKeys(posterRun, P.MORPH[1] + 0.2, posterEnd + 0.1, 1.3, 250),
      {t: H.erase0 + 0.1, ...FULL}, {t: H.stream0 - 0.1, ...FULL}, ...followKeys(H.runIn, H.stream0, H.reveal - 0.35, 1.3, 230),
      {t: H.reveal - 0.15, cx: 600, cy: 660, z: 1.3}, {t: H.reveal + 0.35, ...FULL}, {t: H.toMach, ...FULL}, {t: SC.hook.end + 0.05, cx: 540, cy: 900, z: 1.6}];
    P.hook = H;
  }
  // ---------------- origin
  {
    const O = {};
    O.tiles = [W_('s04', '지피티는'), W_('s04', '지피티는') + 0.3, W_('s04', '지피티는') + 0.6];
    O.year = W_('s04', '이천십팔년에');
    O.first = W_('s04', '첫'); O.gen = W_('s04', '글자는'); O.tag = W_('s04', '생성');
    O.back = at('s05') - 0.45;                        // tiles drop back into the machine, the machine slides right, the drawer slides in
    O.drawer = W_('s05', '답을');                      // the stored answer rises out of the drawer all at once
    O.notIt = W_('s05', '아니라');                     // … dims
    O.make = W_('s05', '글을');                        // the machine makes pieces one by one
    O.picks = Array.from({length: 6}, (_, k) => O.make + 0.45 * k);
    O.cam = [{t: SC.origin.start, cx: 540, cy: 900, z: 1.6}, {t: O.tiles[0] - 0.05, cx: 540, cy: 900, z: 1.6}, {t: O.tiles[2] + 0.5, ...FULL},
      {t: O.first - 0.05, cx: 540, cy: 640, z: 1.12}, {t: O.first + 0.4, ...GCAM()}, {t: O.back - 0.1, ...GCAM()}, {t: O.back + 0.5, ...FULL},
      {t: O.make - 0.2, ...FULL}, {t: O.make + 0.3, ...MCAM()}, {t: SC.origin.end - 0.3, ...MCAM()}, {t: SC.origin.end + 0.3, ...FULL}];
    P.origin = O;
  }
  // ---------------- essence
  {
    const E = {};
    E.in0 = P.sc.essence.start;                       // Q1 drops in, the machine slides back to the centre
    E.ctxTag = W_('s06', '지금까지의'); E.slotTag = W_('s06', '바로');
    E.read0 = W_('s06', '읽고') - 0.3; E.read1 = E.read0 + 0.75; E.pulse1 = E.read1 + 0.35;
    E.pick = W_('s06', '하나를');
    E.run = makeRun({ctx: Q1, steps: RUN.A.steps.slice(0, 1), picks: [E.pick], from: 'outlet', fly: 0.42,
      over: {0: {tSwitch: E.pick - 0.2, sweep: [E.read0, E.read1], pulse: [E.read1, E.pulse1], busy: [E.pulse1, E.pick]}}});
    const slot = E.run.boxes[6], SCAM = () => frameBoxes([slot, ...E.run.boxes.slice(3, 6), {x: slot.x, y: slot.y + slot.h + 10, w: 200, h: 70}], {zMax: 1.4});
    E.cam = [{t: E.in0, ...FULL}, {t: E.pick - 0.4, ...FULL}, {t: E.pick - 0.05, ...frameBoxes([machRect(), {x: 470, y: 900, w: 140, h: 80}], {zMax: 1.4})}, {t: E.run.done, ...SCAM()},
      {t: E.run.done + 0.9, ...SCAM()}, {t: P.sc.essence.end, ...FULL}];
    P.essence = E;
  }
  return P;
}

// =====================================================================================================
// HOOK
// =====================================================================================================
function hookScene(stage, t, p, ctx) {
  const P = ctx.P, H = P.hook, cam = camAt(t, H.cam), G = glowBegin(), c = stage.ctx;
  let count = null;
  world(stage, cam, () => {
    if (t < H.erase0) {
      drawPoster(stage, t, {G, cam, machA: fadeIn(t, P.MORPH[0], 0.8)});
    } else {
      const machA = t < H.reveal - 0.3 ? 0.4 : lerp(0.4, 1, spring(clamp((t - H.reveal + 0.3) / 0.5)));
      // erase: the answer is pulled back into the caret, right to left (backspace)
      if (t < H.erase1) {
        const B = posterRun.boxes, n = B.length;
        for (let i = 0; i < Q1.length; i++) K.chip(stage, B[i], {kind: 'given'});
        for (let i = n - 1; i >= Q1.length; i--) {
          const q = clamp((t - H.erase0 - 0.03 * (n - 1 - i)) / 0.22); if (q >= 1) continue;
          const b = B[i], s = 1 - easeIn(q), qb = B[Q1.length - 1];
          const x = lerp(b.x, qb.x + qb.w, easeIn(q)), y = lerp(b.y, qb.y, easeIn(q));
          K.chip(stage, {...b, x, y, w: b.w * s + 1, h: b.h}, {kind: madeKind(posterRun.texts[i]), a: s});
        }
        // the strip folds away to the left
        const f = 1 - backOut(clamp((t - H.erase0) / 0.4));
        if (f > 0.01) { c.save(); c.translate(94, 0); c.scale(Math.max(0.001, f), 1); c.translate(-94, 0); panel2(stage, 1); strip2(stage, [{label: '', p: 1}], {y: STRIP_Y, ticks: false}); c.restore(); }
        K.machine(stage, MACH, {a: lerp(1, 0.4, clamp((t - H.erase0) / 0.3))});
      } else if (t < H.reveal) {
        // what the user sees: the question, then the answer appearing piece by piece (in place)
        drawRun(stage, t, H.runIn, {G, cam, machA, strip: false, caret: true,
          chipMod: i => (i < Q1.length && t >= H.ask0 && t < H.ask1 + 0.3 ? {hi: 1 - smooth((t - H.ask1) / 0.3)} : null)});
        if (t >= H.ask0 && t < H.ask1 + 0.3) K.sweep(stage, H.runIn.boxes.slice(0, Q1.length), (t - H.ask0) / (H.ask1 - H.ask0), {a: fadeOut(t, H.ask1, 0.3)});
        // "한꺼번에": the whole answer as outlines at once — then it is not so (they snap away)
        if (t >= H.ghost0 && t < H.ghost1 + 0.25) {
          const sIn = backOut(clamp((t - H.ghost0) / 0.25)), sOut = 1 - easeIn(clamp((t - H.ghost1) / 0.25));
          H.runOut.boxes.slice(Q1.length).forEach(b => { const s = sIn * sOut, [cx, cy] = centre(b); c.save(); c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy); K.chip(stage, b, {kind: 'ghost'}); c.restore(); });
        }
        count = H.runIn.landed(t);
      } else {
        // "한 조각씩": the machine makes them — out of the outlet, round to the line end, along a visible path
        const R = H.runOut, nb = R.boxes.length, tgt = centre(R.boxes[nb - 1]);
        K.trail(stage, flyPath(OUTLET, tgt, 'outlet'), clamp((t - H.reveal + 0.1) / 0.4), {a: fadeOut(t, R.done + 0.2, 0.5)});
        drawRun(stage, t, R, {G, cam, machA, strip: false, caret: t < R.done});
        count = 11 + R.landed(t);
      }
    }
  });
  glowFlush(stage);
  if (count != null && count > 0) big(stage, String(count), '조각', t, H.stream0, 1, {pop: false});
}

// =====================================================================================================
// ORIGIN
// =====================================================================================================
const MADE_LAY = {x0: 600, x1: 1010, y0: 300, size: 40, lineGap: 12}, STORED_LAY = {x0: 70, x1: 490, y0: 300, size: 40, lineGap: 12};
const GEN = () => ({text: 'Generative', x: TILE(0).x - 35, y: 528, w: 270, h: 66});
const GCAM = () => frameBoxes([TILE(0), GEN(), {x: GEN().x, y: 610, w: 200, h: 60}], {zMax: 1.3});
const MCAM = () => frameBoxes([{x: 660, y: MACH.y, w: MACH.w, h: MACH.h}, ...lay(A.slice(0, 6), MADE_LAY)], {zMax: 1.3});
const TILE = (i, y = 300) => ({text: 'GPT'[i], x: 540 + (i - 1) * 240 - 100, y, w: 200, h: 210});
function originScene(stage, t, p, ctx) {
  const P = ctx.P, O = P.origin, cam = camAt(t, O.cam), c = stage.ctx, G = glowBegin();
  const machX = lerp(MACH.x, 660, backOut(clamp((t - O.back - 0.35) / 0.5)));
  const mach = {...MACH, x: machX};
  const back = clamp((t - O.back) / 0.4);
  world(stage, cam, () => {
    // the machine: steps back (0.25) while the name is shown, then makes pieces on the right
    const machA = t < O.back ? lerp(1, 0.25, clamp((t - O.tiles[2]) / 0.4)) : lerp(0.25, 1, clamp((t - O.back - 0.3) / 0.3));
    const busy = O.picks.reduce((m, tp) => Math.max(m, t > tp - 0.3 && t < tp ? (t - tp + 0.3) / 0.3 : 0), 0);
    K.machine(stage, mach, {a: machA, busy});
    // G P T tiles spring out of the name plate, then drop back into the inlet
    for (let i = 0; i < 3; i++) {
      const b = TILE(i), q = clamp((t - O.tiles[i]) / 0.55); if (q <= 0) continue;
      const from = [540 + (i - 1) * 40, MACH.y + 110], to = centre(b), e = backOut(q);
      let cx = lerp(from[0], to[0], e), cy = lerp(from[1], to[1], e), s = lerp(0.2, 1, e);
      if (back > 0) { const qb = clamp(back * 1.6 - i * 0.2); cx = lerp(to[0], 540, easeIn(qb)); cy = lerp(to[1], MACH.y, easeIn(qb)); s = 1 - 0.85 * easeIn(qb); if (qb >= 1) continue; }
      const hot = i === 0 && t >= O.first, dimP = i > 0 && t >= O.first ? 0.6 * smooth((t - O.first) / 0.3) : 0;
      c.save(); c.translate(cx, cy); c.scale(s * squash(t, O.tiles[i] + 0.3), s); c.translate(-to[0], -to[1]);
      K.chip(stage, b, {kind: hot ? 'made' : 'given', hi: hot ? 1 : 0, dim: dimP, a: edgeA(cam, b)}); c.restore();
      if (q < 0.5) streak(stage, from, to, e, {len: 0.4, w: 10, a: 0.3, color: PAL.cool});
    }
    // "Generative" springs out under G; tag 생성
    if (t >= O.gen && back < 1) {
      const b = GEN(), q = spring(clamp((t - O.gen) / 0.6));
      const s = 1 - back;
      c.save(); c.translate(b.x + b.w / 2, b.y); c.scale(q * s, q * s); c.translate(-b.x - b.w / 2, -b.y); K.chip(stage, b, {kind: 'made', a: edgeA(cam, b)}); c.restore();
      if (t >= O.tag) K.tag(stage, '생성', b.x + b.w / 2 - 60, b.y + 112, {size: 34, color: PAL.warm, a: backOut(clamp((t - O.tag) / 0.3)) * s * edgeA(cam, {x: b.x, y: 610, w: 160, h: 60})});
    }
    // left: a drawer with a stored answer (comes out whole, then dims)
    const dx = lerp(-460, 70, backOut(clamp((t - O.back - 0.4) / 0.5)));
    if (t >= O.back) drawer(stage, t, O, dx, mach, cam);
    // right: pieces made one by one, out of the outlet, round to their line
    const made = lay(A.slice(0, 6), MADE_LAY);
    const outlet = [machX + 180, MACH.y + MACH.h];
    O.picks.forEach((tp, k) => {
      if (t < tp) return;
      const b = made[k], tl = tp + 0.4, q = clamp((t - tp) / 0.4);
      if (q < 1) {
        const path = [outlet, [machX + 40, MACH.y + MACH.h + 60], [585, 820], [585, 600], centre(b)];
        const pts = splinePts(path), pt = along(pts, easeInOut(q)), pb = along(pts, Math.max(0, easeInOut(q) - 0.2));
        streak(stage, pb, pt, 1, {len: 1, w: 24, a: 0.3});
        K.chip(stage, {...b, x: pt[0] - b.w / 2, y: pt[1] - b.h / 2}, {kind: 'made'});
      } else { chipAt(stage, b, t, tl, {kind: 'made', a: edgeA(cam, b)}); ringPop(stage, ...centre(b), t, tl, {r0: 20, r1: 50, a: 0.5}); }
    });
  });
  glowFlush(stage);
}
import {spline as splinePts} from './parts.mjs';
function drawer(stage, t, O, x, mach, cam) {
  const c = stage.ctx, y = MACH.y, w = 400, h = MACH.h, dim = t >= O.notIt ? 0.7 * smooth((t - O.notIt) / 0.2) : 0;
  K.withAlpha(c, 1 - dim, () => {
    slab(c, x, y, w, h, 22, '#33444C', '#222F35', K.rgba(PAL.muted, 0.28));
    const pull = backOut(clamp((t - O.drawer + 0.3) / 0.35)) * 40;
    slab(c, x + 30, y + 60 + pull, w - 60, h - 100, 14, '#2A3940', '#1C282E', K.rgba(PAL.muted, 0.3));
    K.line(c, [[x + w / 2 - 50, y + 130 + pull], [x + w / 2 + 50, y + 130 + pull]], '#5C6E76', 8, {cap: 'round'});
    // the stored answer, whole, rises out at once
    if (t >= O.drawer) {
      const q = backOut(clamp((t - O.drawer) / 0.45)), B = lay(A.slice(0, -1), {...STORED_LAY, x0: x, x1: x + 420});
      B.forEach(b => K.chip(stage, {...b, y: lerp(y + 60, b.y, q)}, {kind: 'ghost', a: clamp(q * 2) * edgeA(cam, b)}));
    }
  });
}

// =====================================================================================================
// ESSENCE
// =====================================================================================================
function essenceScene(stage, t, p, ctx) {
  const P = ctx.P, E = P.essence, O = P.origin, cam = camAt(t, E.cam), c = stage.ctx, G = glowBegin(), R = E.run;
  const inq = clamp((t - E.in0) / 0.5);
  world(stage, cam, () => {
    // what was on stage leaves: drawer out to the left, the made pieces off to the right, the machine back to the centre
    if (inq < 1) {
      const e = easeIn(inq);
      drawerOut(stage, t, O, lerp(70, -480, e));
      lay(A.slice(0, 6), MADE_LAY).forEach((b, k) => { const x = lerp(b.x, 1120 + k * 30, easeIn(clamp(inq * 1.4 - k * 0.06))); streak(stage, [b.x + b.w / 2, b.y + b.h / 2], [x + b.w / 2, b.y + b.h / 2], 1, {len: 0.5, w: 20, a: 0.25}); K.chip(stage, {...b, x}, {kind: 'made'}); });
    }
    const mx = lerp(660, MACH.x, backOut(clamp((t - E.in0) / 0.5)));
    // Q1 drops in from above (staggered), the empty slot waits after '?'
    const slot = R.boxes[6];
    drawRun(stage, t, R, {G, cam, mach: {...MACH, x: mx}, strip: false, caret: t >= E.in0 + 0.6 && t < R.done,
      chipMod: (i, b) => (i < Q1.length ? {a: 1} : null), hideCtx: true});
    for (let i = 0; i < Q1.length; i++) {
      const b = R.boxes[i], q = clamp((t - E.in0 - 0.06 * i) / 0.45), y = lerp(b.y - 260, b.y, drop(q));
      K.chip(stage, {...b, y}, {kind: 'given', a: clamp(q * 3) * edgeA(cam, {...b, y})});
      if (t >= E.read0 && t < E.read1 + 0.3) { /* sweep drawn by drawRun */ }
    }
    if (t < R.done) { const s = backOut(clamp((t - E.in0 - 0.5) / 0.3)); if (s > 0) { const [cx, cy] = centre(slot); c.save(); c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy); K.chip(stage, {...slot, text: ''}, {kind: 'ghost', a: edgeA(cam, slot)}); c.restore(); } }
    // bracket under the text so far + its tag; tag of the slot
    const q1 = R.boxes[5], bx0 = R.boxes[0].x, bx1 = q1.x + q1.w, by = q1.y + q1.h + 18, wq = spring(clamp((t - E.ctxTag) / 0.5));
    if (wq > 0) {
      const xm = (bx0 + bx1) / 2, hw = (bx1 - bx0) / 2 * wq;
      K.line(c, [[xm - hw, by - 8], [xm - hw, by], [xm + hw, by], [xm + hw, by - 8]], K.rgba(PAL.cool, 0.8), 2);
      K.tag(stage, '지금까지의 글', xm, by + 40, {size: 34, color: PAL.coolHi, a: clamp(wq) * edgeA(cam, {x: xm - 120, y: by + 14, w: 240, h: 52})});
    }
    if (t >= E.slotTag) { const tx = Math.min(slot.x + slot.w / 2 + 40, 880); K.tag(stage, '다음 조각 하나', tx, by + 40, {size: 34, color: PAL.warm, a: backOut(clamp((t - E.slotTag) / 0.3)) * edgeA(cam, {x: tx - 125, y: by + 14, w: 250, h: 52})}); }
  });
  glowFlush(stage);
}
function drawerOut(stage, t, O, x) {
  const c = stage.ctx, y = MACH.y;
  K.withAlpha(c, 0.3, () => { slab(c, x, y, 400, MACH.h, 22, '#33444C', '#222F35'); lay(A.slice(0, -1), {...STORED_LAY, x0: x, x1: x + 420}).forEach(b => K.chip(stage, b, {kind: 'ghost'})); });
}

export const scenes = {hook: hookScene, origin: originScene, essence: essenceScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  hook: P => { const at = s => P.tl.at(s) - 0.5;
    return [[-Infinity, 'GPT 1 of 4 · 실제보다 느리게', '대답을 어떻게 써 내려갈까?'], [at('s02'), '화면에서 보이는 것', '대답은 앞에서부터 나타난다'], [at('s03'), '실제보다 느리게', '한 조각씩 만들고 있다']]; },
  origin: P => [[-Infinity, '2018', 'GPT의 첫 글자'], [P.origin.back, 'G = Generative', '꺼내지 않고 새로 만든다']],
  essence: P => [[-Infinity, '본질', '읽고, 다음 조각 하나를 고른다']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundIntro(tl, P) {
  const H = P.hook, O = P.origin, E = P.essence, ev = [];
  ev.push(snd.swell('poster', 0.05, [98, 147], 1.8, -34, '첫 화면(썸네일): 포스터 구도'));
  ev.push(snd.train('hook_poster', posterRun.S.filter(s => s.tPick > 0).map(s => [s.tPick, 'tick', {freq: 392, decay: 0.05, click: 0, gain_db: 0}]), -30, '첫 화면: 0.5초마다 표지가 띠에 떨어짐(조각마다 틱)'));
  ev.push(snd.whoosh('hook_erase', H.erase0, 0.45, 520, 180, -36, '대답이 캐럿 쪽으로 지워짐'));
  ev.push(snd.tone('hook_ghost', H.ghost0, 196, 0.3, -34, '"한꺼번에": 대답 전체의 윤곽이 한 번에 보였다가 사라짐', {decay: 0.15}));
  ev.push(snd.train('hook_stream', H.runIn.S.map(s => [s.tPick, 'tick', {freq: 330, decay: 0.05, click: 0, gain_db: 0}]), -31, '대답이 앞에서부터 한 조각씩 나타남(조각마다 틱)'));
  H.runOut.S.forEach((s, k) => {
    ev.push(snd.tone('hook_make' + (k + 1), s.tPick, 165, 0.22, -32, `기계 출구에서 조각 '${s.piece}'이 나옴`, {decay: 0.1}));
    ev.push(snd.tone('hook_attach' + (k + 1), s.tLand, s.piece === '■' ? 220 : 330, s.piece === '■' ? 0.5 : 0.2, -29, `조각 '${s.piece}'이 글줄 끝에 붙음`, {decay: 0.1}));
  });
  O.tiles.forEach((tt, i) => ev.push(snd.tick('origin_tile' + (i + 1), tt + 0.3, 262 + 40 * i, -30, `글자 타일 '${'GPT'[i]}'가 튕겨 나와 자리 잡음`, {decay: 0.08})));
  ev.push(snd.swell('origin_G', O.first, [147, 220], 1.4, -32, '첫 글자 G가 난색으로 강조됨'));
  O.picks.forEach((tp, k) => ev.push(snd.tick('origin_make' + (k + 1), tp + 0.4, 330, -31, `기계가 새 조각 하나를 만들어 붙임(${k + 1})`, {decay: 0.06})));
  ev.push(snd.swell('essence_read', E.read0, [131, 196], 1.6, -32, '지금까지의 글을 읽음(밑줄) → 기계로 펄스'));
  ev.push(snd.tone('essence_attach', E.run.done, 330, 0.25, -28, '조각 하나가 빈 자리를 채움', {decay: 0.12}));
  return ev;
}
export const signature = P => [P.hook.reveal, P.origin.first, P.essence.pick].map(x => x.toFixed(3)).join(',');
