// 46 — other (s19–s21: the diffusion illustration and the timeline) and close (s22). PLAN.md §3.
// The diffusion boards and the timeline are ILLUSTRATIONS of the idea (kicker "설명용 그림"), not the model's method:
// noisy() just replaces a fraction of the cells with fixed random codes, lowered step by step.
// Exports: scenes {other, close}, titles, planEnd(tl, P), soundEnd(tl, P), signature(P).
import * as K from '../gpt-generative/kit.mjs';
import * as M from './model.mjs';
import {CH, CHIP_Y0, BOARD, PBOARD, FULL, WIN, WIN_P, STRIP_Y, G, N, lay, centre, chipPop, boardPlate, boardTiles, tile, cellRect, cellC, picImg,
  panelP, strip, makeBoardRun, runTiles, runStrip, frameBoxes, edgeA, world, camAt, camPt, ringPop, backOut, spring, drop, streak, slab, speedBadge} from './parts.mjs';
import {MAIN, WATER, SRUNS, HELDR} from './scenes_draw.mjs';

const {wd, snd, glowBegin, glowFlush, PAL, clamp, lerp, smooth, easeInOut, fadeIn, fadeOut, hitFlash} = K;
const PROMPT = ['불을', '뿜는', '아기', '용'];
const BIGB = {x: 70, y: 420, w: 520, h: 520}, SMALLB = {x: 650, y: 515, w: 360, h: 360};
// timeline (world): slots 360 px apart, boards 280 px, axis at y 980
const TL_Y = 980, SLOT_W = 280, SLOTS = [{year: '2021', kind: '조각', x: 100}, {year: '2022', kind: '확산', x: 460}, {year: '2023', kind: '확산', x: 820}, {year: '2025', kind: '조각', x: 1180}, {year: '그 뒤', kind: '?', x: 1540}]
  .map(s => ({...s, R: {x: s.x, y: TL_Y - 40 - SLOT_W, w: SLOT_W, h: SLOT_W}}));
const slotBox = k => ({x: SLOTS[k].x - 30, y: SLOTS[k].R.y - 20, w: SLOT_W + 60, h: TL_Y + 130 - SLOTS[k].R.y + 20});
const lerpR = (a, b, q) => ({x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q)});

export function planEnd(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  const O = {};
  O.s = SC.other.start; O.in = [O.s, O.s + 0.6];
  O.denoise0 = W_('s19', '조금씩'); O.stepDt = (W_('s19', '방식을') - O.denoise0) / (M.NOISE_STEPS.length - 1);
  O.stepAt = k => O.denoise0 + O.stepDt * k;
  const p1 = []; let t = O.denoise0; for (let i = 0; i < N; i++) { t += 0.6 / 64; p1[i] = t; }
  O.seq = makeBoardRun(MAIN, p1); O.seqDone = t;
  O.tlIn = [tl.at('s19:end') + 0.05, tl.at('s20') - 0.05];                    // the timeline slides in, the two boards shrink into 2021 / 2022
  O.d23 = [O.tlIn[1] - 0.2, O.tlIn[1] + 0.8];                                   // 2023 board denoises quickly
  O.pan25 = [W_('s20', '이천이십오년'), W_('s20', '이천이십오년') + 0.45];
  const p25 = []; t = W_('s20', '챗지피티의'); for (let i = 0; i < N; i++) { t += 0.6 / 64; p25[i] = t; }
  O.run25 = makeBoardRun(SRUNS[1], p25); O.done25 = t;
  O.drift = [tl.at('s21'), W_('s21', '그') - 0.05]; O.cover = W_('s21', '뒤의') + 0.15; O.tag = O.cover + 0.6;
  const z = 0.95;
  O.camA = frameBoxes([slotBox(0), slotBox(2)], {zMax: z}); O.cam25 = frameBoxes([slotBox(3)], {zMax: 1.6}); O.camNext = frameBoxes([slotBox(4)], {zMax: 1.6});
  O.camMid = frameBoxes([slotBox(3), slotBox(4)], {zMax: 1.6});
  O.cam = [{t: O.tlIn[0], ...FULL}, {t: O.tlIn[1], ...O.camA}, {t: O.pan25[0], ...O.camA}, {t: O.pan25[1], ...O.cam25}, {t: O.drift[0], ...O.cam25}, {t: O.drift[1], ...O.camMid}, {t: O.cover - 0.3, ...O.camNext}];
  P.other = O;
  const C = {};
  C.s = SC.close.start; C.in = [C.s, C.s + 0.6];
  const pc = []; t = W_('s22', '바꾸면'); for (let i = 0; i < N; i++) { t += 0.6 / 64; pc[i] = t; }
  C.run = makeBoardRun(MAIN, pc); C.done = t;
  P.close = C;
  return P;
}

// =====================================================================================================
// OTHER
// =====================================================================================================
/** noisy picture at level (with a flicker of the random codes before the first step) */
function noisyCodes(level, t, seed = M.RUN.NOISE) { return M.noisy(MAIN.codes, level, level >= 1 ? seed + Math.floor(t * 8) : seed); }
function levelAt(t, O) { let k = -1; for (let j = 0; j < M.NOISE_STEPS.length; j++) if (t >= O.stepAt(j)) k = j; return k < 0 ? 1 : M.NOISE_STEPS[k]; }
function otherScene(stage, t, p, ctx) {
  const P = ctx.P, O = P.other, c = stage.ctx, G_ = glowBegin(), cam = camAt(t, O.cam), inQ = smooth((t - O.in[0]) / (O.in[1] - O.in[0]));
  const tq = easeInOut(clamp((t - O.tlIn[0]) / (O.tlIn[1] - O.tlIn[0]))), lv = levelAt(t, O);
  world(stage, cam, () => {
    // mix's four slots slide away to the left
    if (inQ < 1) for (let k = 0; k < 4; k++) { const R = {x: 70 + k * 240 - 1100 * inQ, y: 1000, w: 220, h: 220}; boardPlate(stage, R, {grid: 0, a: 1 - inQ}); boardTiles(stage, R, [M.TRAIN[0].codes, M.TRAIN[M.NV].codes, M.TRAIN[2 * M.NV].codes, HELDR.codes][k], N, {a: 1 - inQ}); }
    // the timeline axis and its slots
    if (tq > 0) {
      const a = tq; K.withAlpha(c, a, () => K.line(c, [[40, TL_Y], [SLOTS[4].x + SLOT_W + 200, TL_Y]], K.rgba(PAL.muted, 0.6), 2));
      SLOTS.forEach((s, k) => { const sa = a * edgeA(cam, slotBox(k)) ** 4, mx = s.x + SLOT_W / 2;
        K.withAlpha(c, a, () => K.line(c, [[mx, TL_Y - 12], [mx, TL_Y + 12]], K.rgba(PAL.muted, 0.8), 2));
        stage.text(s.year, mx, TL_Y + 50, {role: 'display', weight: 700, size: 40, align: 'center', color: PAL.ink, alpha: sa});
        if (k < 4) K.tag(stage, s.kind, mx, TL_Y + 104, {size: 30, color: s.kind === '조각' ? PAL.warm : PAL.cool, a: sa});
      });
    }
    // the diffusion board (all cells at once) and the one-at-a-time board; they move into 2022 and 2021
    const RB = lerpR(BIGB, SLOTS[1].R, tq), RS = lerpR(SMALLB, SLOTS[0].R, tq);
    boardPlate(stage, RB, {grid: 0, a: inQ}); boardTiles(stage, RB, noisyCodes(lv, t), N, {a: inQ});
    if (t >= O.denoise0) for (let k = 1; k < M.NOISE_STEPS.length; k++) { const t0 = O.stepAt(k); if (t >= t0 && t < t0 + 0.25) K.withAlpha(c, 1 - (t - t0) / 0.25, () => { c.strokeStyle = K.rgba(PAL.hot, 0.8); c.lineWidth = 3; c.strokeRect(RB.x - 8, RB.y - 8, RB.w + 16, RB.h + 16); }); }
    boardPlate(stage, RS, {grid: 1, a: inQ}); runTiles(stage, t, O.seq, {R: RS, G: G_, cam, a: inQ, head: t < O.seqDone});
    const la = inQ * (1 - tq);
    K.tag(stage, '한꺼번에', BIGB.x + BIGB.w / 2, BIGB.y + BIGB.h + 50, {size: 34, color: PAL.cool, a: la});
    K.tag(stage, '한 칸씩', SMALLB.x + SMALLB.w / 2, SMALLB.y + SMALLB.h + 50, {size: 34, color: PAL.warm, a: la});
    // 2023: another diffusion board; 2025: one piece after another; after 2025: a cover that never opens
    if (tq > 0) {
      const s3 = SLOTS[2], l3 = (() => { const q = clamp((t - O.d23[0]) / (O.d23[1] - O.d23[0])); return M.NOISE_STEPS[Math.min(7, Math.floor(q * 8))]; })();
      boardPlate(stage, s3.R, {grid: 0, a: tq}); boardTiles(stage, s3.R, M.noisy(WATER.codes, l3, 11), N, {a: tq});
      boardPlate(stage, SLOTS[3].R, {grid: 1, a: tq}); runTiles(stage, t, O.run25, {R: SLOTS[3].R, G: G_, cam, head: t < O.done25});
      const R4 = SLOTS[4].R; boardPlate(stage, R4, {grid: 1, a: tq});
      if (t >= O.cover - 0.45) { const q = clamp((t - O.cover + 0.45) / 0.45), y = R4.y - 420 * (1 - drop(q)); K.chip(stage, {x: R4.x - 6, y: y - 6, w: R4.w + 12, h: R4.h + 12, text: ''}, {kind: 'cover', a: smooth(q * 4)});
        if (q < 0.72) streak(stage, [R4.x + R4.w / 2, y - 200], [R4.x + R4.w / 2, y], 1, {len: 1, w: 10, a: 0.3, color: PAL.muted}); }
      if (t >= O.cover) ringPop(stage, R4.x + R4.w / 2, R4.y + R4.h / 2, t, O.cover, {r0: 60, r1: 200, a: 0.5, color: PAL.muted});
      K.tag(stage, '구조 미공개', R4.x + R4.w / 2, TL_Y + 104, {size: 30, color: PAL.muted, a: smooth((t - O.tag) / 0.4) * edgeA(cam, slotBox(4)) ** 4});
    }
  });
  glowFlush(stage);
  if (t >= O.run25.S[0].tSwitch && t < O.done25 + 0.2) speedBadge(stage, 64, 1);
  else if (t >= O.denoise0 && t < O.seqDone + 0.2 && tq <= 0) speedBadge(stage, 64, 1);
}

// =====================================================================================================
// CLOSE
// =====================================================================================================
const CB = {x: 290, y: 540, w: 500, h: 500};
const MINI_LINE = (() => { const ts = 13, pitch = 14.6, per = Math.floor((CH.x1 - CH.x0) / pitch), out = []; for (let i = 0; i < N; i++) out.push({x: CH.x0 + (i % per) * pitch + ((CH.x1 - CH.x0) - per * pitch) / 2, y: 410 + Math.floor(i / per) * pitch, s: ts}); return out; })();
function closeScene(stage, t, p, ctx) {
  const P = ctx.P, C = P.close, c = stage.ctx, G_ = glowBegin(), cam = FULL, inQ = clamp((t - C.in[0]) / (C.in[1] - C.in[0]));
  const pq = easeInOut(clamp((t - P.poster) / 0.8)), chips = lay(PROMPT);
  world(stage, cam, () => {
    // the timeline slides out to the left
    const cyq = lerp(0, CHIP_Y0 - CH.y0, pq);
    chips.forEach((b, i) => chipPop(stage, {...b, y: b.y + cyq}, t, C.s + 0.08 * i, {kind: 'given'}));
    // the line of picture pieces behind the prompt fills in step with the board
    const la = 1 - smooth((t - P.poster) / 0.4);
    if (la > 0) for (let i = 0; i < N; i++) { if (C.run.T[i] > t) break; const sl = MINI_LINE[i]; tile(c, MAIN.codes[i], sl.x, sl.y, sl.s, la); }
    const R0 = {...CB, x: CB.x + 900 * (1 - backOut(inQ, 1.2))}, R = lerpR(R0, PBOARD, pq);
    boardPlate(stage, R, {grid: 1 - pq});
    runTiles(stage, t, C.run, {R, G: G_, cam, head: t < C.done});
  }, t < P.poster ? WIN_P.y1 : WIN.y1, t < P.poster ? WIN.y0 : 150);
  if (t >= C.run.S[0].tSwitch && t < P.poster + 0.2) runStrip(stage, t, C.run, {G: G_, fall: false, a: fadeOut(t, P.poster - 0.3, 0.4)});
  glowFlush(stage);
  if (t >= C.run.S[0].tSwitch && t < C.done + 0.2) speedBadge(stage, 64, fadeOut(t, P.poster - 0.3, 0.3));
}

export const scenes = {other: otherScene, close: closeScene};

export const titles = {
  other: P => { const at = s => P.tl.at(s) - 0.4; return [[-Infinity, '확산 방식 · 설명용 그림', '잡음을 조금씩 걷어 낸다'], [P.other.tlIn[0], '연표 · 설명용 그림', '다시 조각을 차례로 잇는 방식'], [at('s21'), '연표 · 설명용 그림', '그 뒤는 밝히지 않았다']]; },
  close: P => [[-Infinity, '', '그림도 한 조각씩']],
};

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundEnd(tl, P) {
  const O = P.other, C = P.close, ev = [];
  ev.push(snd.whoosh('other_noise', O.s + 0.2, 1.2, 300, 120, -36, '그림판 가득 잡음(무작위 칸)'));
  M.NOISE_STEPS.slice(1).forEach((lv, k) => ev.push(snd.tone('other_step' + (k + 1), O.stepAt(k + 1), 196 + 40 * k, 0.18, -31, `확산(설명용): 모든 칸이 한꺼번에 한 걸음 — 잡음 ${Math.round(lv * 100)}% (걷힐수록 높고 맑게)`, {decay: 0.1})));
  ev.push(snd.train('other_seq', O.seq.S.filter((s, k) => k % 3 === 0).map(s => [s.tPick, 'tick', {freq: 330, decay: 0.03, click: 0, gain_db: 0}]), -36, '옆의 작은 그림판: 한 칸씩 차례로(×64)'));
  ev.push(snd.whoosh('other_timeline', O.tlIn[0], 0.6, 200, 500, -33, '가로 연표가 미끄러져 들어옴'));
  ev.push(snd.whoosh('other_pan25', O.pan25[0], 0.45, 250, 600, -32, '카메라가 2025로 휙 넘어감'));
  ev.push(snd.train('other_2025', O.run25.S.filter((s, k) => k % 3 === 0).map(s => [s.tPick, 'tick', {freq: 370, decay: 0.03, click: 0, gain_db: 0}]), -34, '2025: 다시 조각을 차례로 이어 그림(×64)'));
  ev.push(snd.tone('other_cover', O.cover, 110, 0.6, -26, '다음 그림판에 가림막이 내려앉음(열리지 않음)', {decay: 0.3}));
  ev.push(snd.train('close_draw', C.run.S.filter((s, k) => k % 2 === 0).map(s => [s.tPick, 'tick', {freq: [196, 175, 220, 262, 294, 330, 392, 440][s.pick], decay: 0.03, click: 0, gain_db: 0}]), -34, '맺음: 주문 뒤에 그림 조각이 한 칸씩 이어짐(×64)'));
  ev.push(snd.tone('close_done', C.done + 0.05, 220, 0.8, -27, '그림이 완성됨(맺음 음)', {decay: 0.4, sustain: 0.2}));
  ev.push(snd.tone('close_poster', P.poster, 165, 0.8, -30, '포스터가 돌아옴', {decay: 0.4}));
  return ev;
}
export const signature = P => [P.other.cover, P.close.done].map(x => x.toFixed(3)).join(',');
