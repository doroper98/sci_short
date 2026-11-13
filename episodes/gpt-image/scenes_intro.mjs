// 46 — hook (s01–s03) and origin (s04–s05). PLAN.md §3.
// Exports: scenes {hook, origin}, titles, planIntro(tl, P), soundIntro(tl, P), signature(P).
import * as K from '../gpt-generative/kit.mjs';
import * as M from './model.mjs';
import {CH, CHIP_Y0, BOARD, PBOARD, FULL, WIN, WIN_P, STRIP_Y, G, N, lay, centre, chipAt, chipPop, boardPlate, boardTiles, tile, cellRect, cellC,
  panelP, strip, fallingMarker, morphDist, segXc, uX, makeBoardRun, runTiles, runStrip, frameBoxes, edgeA, world, camAt, camPt,
  ringPop, backOut, spring, streak, slab, lineLayout, piece, speedBadge} from './parts.mjs';
import {MAIN} from './scenes_draw.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, fadeIn, fadeOut, hitFlash} = K;
const PROMPT = ['불을', '뿜는', '아기', '용'];
const S2B = {x: 390, y: 410, w: 300, h: 300};                       // the board, moved aside while GPT picks a text piece
const TXT = M.TEXT_NEXT, TXT_LINE = {...CH, y0: 760};
const TXT_SEGS = TXT.next.map((r, k) => ({label: r.piece, p: r.p, col: ['#7A4E16', '#5C3B12', '#4C3311', '#3A2A12'][k]}));
export const LINE = lineLayout(PROMPT, 32, 36);
const lerpR = (a, b, q) => ({x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q)});
const lerpB = (a, b, q) => ({...b, x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q)});

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planIntro(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  const H = {};
  // s01: the poster board already shows rows 0–9; the rest fills from 0 s (×32), while it grows to the working place
  H.dt = 0.6 / 32;
  const PRE = 280;                                                            // rows 0–13 already drawn at 0 s
  const picks = []; for (let i = 0; i < N; i++) picks[i] = i < PRE ? -2 + i * 0.001 : 0.05 + (i - PRE) * H.dt;
  H.run = makeBoardRun(MAIN, picks, {first: 0.1});
  H.grow = [P.MORPH[0], P.MORPH[1] + 0.2]; H.done = picks[N - 1];
  // s02: the board steps aside; GPT's usual job: pick the next text piece
  H.aside = [tl.at('s02') - 0.5, tl.at('s02') + 0.1];
  H.txtPop = tl.at('s02') + 0.15;
  H.div = W_('s02', '목록에서'); H.drop = W_('s02', '하나를'); H.pick = W_('s02', '고르는'); H.fly = [H.pick + 0.1, H.pick + 0.5];
  // s03: the board returns; at "조각으로" it breaks into its 400 pieces, which start to line up after the prompt
  H.back = [W_('s03', '그림을') - 0.2, W_('s03', '그림을') + 0.45];
  H.txtOut = H.back[0] - 0.3;
  H.brk = W_('s03', '조각으로');
  P.hook = H;
  const O = {};
  // pieces leave the board in raster order: 60 during s03, the rest (accelerating) in s04
  O.r0 = tl.at('s04') - 0.25;
  O.leave = Array.from({length: N}, (_, i) => (i < 60 ? H.brk + 0.025 * i : O.r0 + 0.0072 * (i - 60)));
  O.flight = i => (i < 60 ? 0.45 : 0.32);
  O.full = O.leave[N - 1] + O.flight(N - 1);
  O.chipSlide = [H.brk - 0.1, H.brk + 0.45];
  O.seam = W_('s04', '그림'); O.seamOut = tl.at('s05') - 0.4;
  const L = LINE, seamBoxes = [L.chips[L.chips.length - 1], ...L.slots.slice(0, 6).map(s => ({x: s.x, y: s.y, w: s.s, h: s.s})), ...L.slots.slice(0, 40).map(s => ({x: s.x, y: s.y, w: s.s, h: s.s})).slice(0, 1)];
  O.camSeam = frameBoxes(seamBoxes, {zMax: 1.6});
  O.cam = [{t: SC.origin.start, ...FULL}, {t: O.seam - 0.1, ...FULL}, {t: O.seam + 0.45, ...O.camSeam}, {t: O.seamOut, ...O.camSeam}, {t: O.seamOut + 0.5, ...FULL}];
  O.dali = W_('s05', '달리와') - 0.35; O.walle = W_('s05', '월리를') - 0.35; O.merge = [W_('s05', '합쳐'), W_('s05', '달리라고')]; O.tag = W_('s05', '달리라고') + 0.3;
  O.dim = [tl.at('s05') - 0.3, tl.at('s05') + 0.2];
  P.origin = O;
  return P;
}

// =====================================================================================================
// HOOK
// =====================================================================================================
/** board rect of the hook at t */
function hookRect(t, H) {
  let R = lerpR(PBOARD, BOARD, easeInOut(clamp((t - H.grow[0]) / (H.grow[1] - H.grow[0]))));
  if (t >= H.aside[0]) R = lerpR(R, S2B, backOut(clamp((t - H.aside[0]) / (H.aside[1] - H.aside[0])), 1.2));
  if (t >= H.back[0]) R = lerpR(R, BOARD, easeInOut(clamp((t - H.back[0]) / (H.back[1] - H.back[0]))));
  return R;
}
/** pieces flying from the board to their line slots (shared by hook and origin) */
function flyingPieces(stage, t, R, P, codes, o = {}) {
  const O = P.origin, s = R.w / G;
  for (let i = 0; i < N; i++) {
    const t0 = O.leave[i], d = O.flight(i), q = clamp((t - t0) / d), sl = LINE.slots[i];
    if (q <= 0) { const k = o.sep ?? 1; tile(stage.ctx, codes[i], R.x + (i % G) * s + s * (1 - k) / 2, R.y + Math.floor(i / G) * s + s * (1 - k) / 2, s * k); continue; }
    const from = [R.x + (i % G) * s, R.y + Math.floor(i / G) * s], e = easeInOut(q), x = lerp(from[0], sl.x, e), y = lerp(from[1], sl.y, e) - 60 * Math.sin(Math.PI * e), ss = lerp(s, sl.s, e);
    if (q < 1 && i % 3 === 0) streak(stage, [from[0] + s / 2, from[1] + s / 2], [x + ss / 2, y + ss / 2], 1, {len: 0.25, w: ss * 0.4, a: 0.22, color: M.PALETTE[codes[i]].hex});
    const k = q >= 1 ? 1 + 0.25 * Math.max(0, 1 - (t - t0 - d) / 0.12) : 1;
    tile(stage.ctx, codes[i], x - ss * (k - 1) / 2, y - ss * (k - 1) / 2, ss * k);
  }
}
function hookScene(stage, t, p, ctx) {
  const P = ctx.P, H = P.hook, O = P.origin, c = stage.ctx, G_ = glowBegin(), cam = FULL;
  const R = hookRect(t, H), broken = t >= H.brk;
  const chips = lay(PROMPT), dimQ = smooth((t - H.aside[0]) / 0.4) * (1 - smooth((t - H.txtOut) / 0.4));
  const slideQ = backOut(clamp((t - O.chipSlide[0]) / (O.chipSlide[1] - O.chipSlide[0])));
  world(stage, cam, () => {
    const cy = lerp(CHIP_Y0 - CH.y0, 0, easeInOut(clamp((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))));   // chips sit above the poster title at 0 s
    chips.forEach((b, i) => K.chip(stage, broken ? lerpB(b, LINE.chips[i], slideQ) : {...b, y: b.y + cy}, {kind: 'given', dim: 0.7 * dimQ}));
    boardPlate(stage, R, {grid: 1, a: broken ? fadeOut(t, H.brk + 0.6, 0.5) : 1});
    const sep = 1 - 0.22 * smooth((t - H.back[1]) / (H.brk - H.back[1]));      // the seams open while the narration builds to "조각으로"
    if (!broken && t < H.back[1]) runTiles(stage, t, H.run, {R, G: G_, cam, head: t < H.done, flashD: 0.12});
    else flyingPieces(stage, t, R, P, MAIN.codes, {sep});
    // s02: the text line '아기 용이 불을 [ ]' and the picked piece
    const tA = smooth((t - H.txtPop) / 0.3) * fadeOut(t, H.txtOut, 0.35);
    if (tA > 0) {
      const boxes = lay([...TXT.ctx, TXT.next[0].piece], TXT_LINE);
      boxes.slice(0, 3).forEach((b, i) => chipPop(stage, b, t, H.txtPop + 0.1 * i, {kind: 'given', a: tA}));
      const blank = boxes[3];
      if (t < H.fly[1]) K.withAlpha(c, tA * smooth((t - H.txtPop - 0.3) / 0.3), () => { c.save(); c.setLineDash([8, 6]); c.beginPath(); c.roundRect(blank.x, blank.y, blank.w, blank.h, 12); c.strokeStyle = K.rgba(PAL.warm, 0.7); c.lineWidth = 2; c.stroke(); c.restore(); });
      if (t >= H.fly[0]) {
        const q = easeInOut(clamp((t - H.fly[0]) / (H.fly[1] - H.fly[0]))), from = [segXc(TXT_SEGS.map(s => s.p), 0), STRIP_Y + 32], to = centre(blank);
        const pt = [lerp(from[0], to[0], q), lerp(from[1], to[1], q) - 120 * Math.sin(Math.PI * q)];
        if (q < 1) streak(stage, from, pt, 1, {len: 0.4, w: 26, a: 0.3});
        chipAt(stage, {...blank, x: pt[0] - blank.w / 2, y: pt[1] - blank.h / 2}, t, H.fly[1], {kind: 'made', a: tA, hi: q < 1 ? 1 : 0});
        if (q >= 1) ringPop(stage, ...to, t, H.fly[1], {r0: 30, r1: 80, a: 0.6 * tA});
      }
    }
  }, WIN.y1, t < P.MORPH[1] ? 150 : WIN.y0);
  // screen: strip (picture run while it grows, then the text pieces in s02)
  if (t >= H.grow[1] - 0.2 && t < H.aside[0]) runStrip(stage, t, H.run, {G: G_, fall: false, a: smooth((t - H.grow[1] + 0.2) / 0.3) * fadeOut(t, H.done + 0.3, 0.4)});
  if (t >= H.div - 0.35 && t < H.txtOut + 0.4) {
    const a = smooth((t - H.div + 0.35) / 0.35) * fadeOut(t, H.txtOut, 0.4); panelP(stage, a);
    const q = clamp((t - H.div) / 0.35), d = morphDist([1, 0, 0, 0], TXT_SEGS.map(s => s.p), q);
    strip(stage, TXT_SEGS.map((s, k) => ({...s, p: d[k], label: q > 0.6 ? s.label : ''})), {a, u: t >= H.pick ? TXT.u : null, pick: t >= H.pick ? 0 : null});
    if (t >= H.drop && t < H.pick) fallingMarker(stage, TXT.u, (t - H.drop) / (H.pick - H.drop), a);
    if (t >= H.pick) { const fl = hitFlash(t, H.pick, 0.35); if (fl > 0) K.splatBurst(G_.GW, segXc(TXT_SEGS.map(s => s.p), 0), STRIP_Y + 32, 28, 0.7 * fl); }
  }
  glowFlush(stage);
  if (t >= H.grow[1] && t < H.done + 0.2) speedBadge(stage, 32, 1);
}

// =====================================================================================================
// ORIGIN
// =====================================================================================================
const NAMES = {dali: 'Dalí', walle: 'WALL·E', dalle: 'DALL·E'};
function nameTile(stage, s, cx, cy, a = 1, o = {}) {
  if (a <= 0) return; const c = stage.ctx, size = 66, w = stage.measure(s, {role: 'display', weight: 700, size}) + 56, h = 104;
  K.withAlpha(c, a, () => { slab(c, cx - w / 2, cy - h / 2, w, h, 16, o.warm ? '#5C3B12' : '#26343B', o.warm ? '#472D0C' : '#1A252B', K.rgba(o.warm ? PAL.warm : PAL.muted, 0.5));
    stage.text(s, cx, cy + 2, {role: 'display', weight: 700, size, align: 'center', color: o.warm ? K.mix(PAL.warm, PAL.hot, 0.35) : PAL.ink}); });
  return w;
}
function originScene(stage, t, p, ctx) {
  const P = ctx.P, O = P.origin, c = stage.ctx, G_ = glowBegin(), cam = camAt(t, O.cam);
  const dim = smooth((t - O.dim[0]) / (O.dim[1] - O.dim[0]));
  world(stage, cam, () => {
    LINE.chips.forEach(b => K.chip(stage, b, {kind: 'given', a: edgeA(cam, b) ** 6, dim: 0.7 * dim, hi: t >= O.seam && t < O.seamOut && b === LINE.chips[3] ? 1 : 0}));
    K.withAlpha(c, 1 - 0.65 * dim, () => flyingPieces(stage, t, BOARD, P, MAIN.codes, {sep: 0.78}));
    // seam marker: a thin warm bracket between the last text piece and the first picture piece
    const sa = smooth((t - O.seam - 0.3) / 0.3) * fadeOut(t, O.seamOut, 0.3);
    if (sa > 0) { const b = LINE.chips[3], s0 = LINE.slots[0], x = (b.x + b.w + s0.x) / 2; K.withAlpha(c, sa, () => K.line(c, [[x, b.y - 10], [x, b.y + b.h + 10]], PAL.warm, 3)); }
    // name tiles (text only): Dalí from the left, WALL·E from the right → DALL·E
    const y = 1110, mq = clamp((t - O.merge[0]) / (O.merge[1] - O.merge[0])), me = backOut(mq);
    const xl = lerp(-300, 330, backOut(clamp((t - O.dali) / 0.45))), xr = lerp(1380, 760, backOut(clamp((t - O.walle) / 0.45)));
    if (mq < 1) { nameTile(stage, NAMES.dali, lerp(xl, 540, me), y, (t >= O.dali ? 1 : 0) * (1 - smooth((mq - 0.6) / 0.4))); nameTile(stage, NAMES.walle, lerp(xr, 540, me), y, (t >= O.walle ? 1 : 0) * (1 - smooth((mq - 0.6) / 0.4))); }
    if (mq > 0.6) { const sq = 1 + 0.08 * Math.max(0, 1 - (t - O.merge[1]) / 0.15); c.save(); c.translate(540, y); c.scale(sq, sq); c.translate(-540, -y); nameTile(stage, NAMES.dalle, 540, y, smooth((mq - 0.6) / 0.3), {warm: false}); c.restore(); }
    if (t >= O.merge[1]) ringPop(stage, 540, y, t, O.merge[1], {r0: 60, r1: 220, a: 0.6});
    K.tag(stage, '달리', 540, y + 92, {size: 34, a: smooth((t - O.tag) / 0.3), color: PAL.muted});
  });
  glowFlush(stage);
}

export const scenes = {hook: hookScene, origin: originScene};

export const titles = {
  hook: P => { const at = s => P.tl.at(s) - 0.4; return [[-Infinity, '오늘의 주제 · GPT 4 of 4', '그림을 어떻게 그릴까?'], [at('s02'), 'GPT가 원래 하는 일', '다음 글 조각 하나를 고른다'], [at('s03'), '', '그림도 글처럼 조각으로']]; },
  origin: P => [[-Infinity, '2021', '글 뒤에 그림 조각을 잇는 GPT'], [P.tl.at('s05') - 0.4, '2021', '이름은 DALL·E']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
const CODEF = [196, 175, 220, 262, 294, 330, 392, 440];
export function soundIntro(tl, P) {
  const H = P.hook, O = P.origin, ev = [];
  ev.push(snd.train('hook_fill', H.run.S.filter(s => s.tPick >= 0).filter((s, k) => k % 2 === 0).map(s => [s.tPick, 'tick', {freq: CODEF[s.pick], decay: 0.035, click: 0, gain_db: 0}]), -34, '0초부터 작은 그림판의 칸이 한 칸씩 빠르게 채워짐(두 칸에 한 번 틱, 무늬마다 음높이)'));
  ev.push(snd.tone('hook_aside', H.aside[0], 196, 0.3, -32, '그림판이 옆으로 물러남', {decay: 0.15}));
  ev.push(snd.tone('hook_div', H.div, 220, 0.35, -30, '띠가 다음 글 조각 후보로 나뉨', {decay: 0.2}));
  ev.push(snd.tick('hook_pick', H.pick, 392, -24, "표지가 '뿜는다'(86%)에 떨어짐", {decay: 0.1}));
  ev.push(snd.tone('hook_attach', H.fly[1], 330, 0.25, -28, "'뿜는다'가 빈 자리에 붙음", {decay: 0.12}));
  ev.push(snd.swell('hook_break', H.brk - 0.2, [131, 196], 1.2, -31, '그림이 400개의 조각으로 부서짐'));
  const land = (a, b) => O.leave.map((t0, i) => [t0 + O.flight(i), i]).filter(([tt, i]) => i >= a && i < b && i % 2 === 0).map(([tt, i]) => [tt, 'tick', {freq: 262 + (i % 5) * 20, decay: 0.03, click: 0, gain_db: 0}]);
  ev.push(snd.train('hook_line', land(0, 60), -33, '조각들이 글 조각 뒤로 날아가 줄을 섬'));
  ev.push(snd.train('origin_line', land(60, N), -35, '나머지 조각이 빠르게 이어 붙어 한 줄이 완성됨'));
  ev.push(snd.tone('origin_seam', O.seam + 0.3, 247, 0.4, -30, '글 조각과 그림 조각의 이음매로 다가감', {decay: 0.2}));
  ev.push(snd.tone('origin_dali', O.dali + 0.4, 220, 0.2, -30, "이름 타일 'Dalí'가 미끄러져 옴", {decay: 0.1}));
  ev.push(snd.tone('origin_walle', O.walle + 0.4, 262, 0.2, -30, "이름 타일 'WALL·E'가 미끄러져 옴", {decay: 0.1}));
  ev.push(snd.tone('origin_merge', O.merge[1], 330, 0.45, -26, "두 타일이 붙어 'DALL·E'", {decay: 0.25}));
  return ev;
}
export const signature = P => [P.hook.brk, P.origin.full, P.origin.merge[1]].map(x => x.toFixed(3)).join(',');
