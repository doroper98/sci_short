// Episode scenes — "AI는 어떻게 배우고 답할까" (37)
// Shape: export {theme, scenes, overlays, background, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Visual grammar (docs/ANIMATION_QUALITY.md top section, 2026-11-10 "움직임이 설명하고, 빛은 조금만"):
// ONE stage, three bands on one vertical axis — the TEXT STRIP (matte token tiles, y ≈ 600) → the MODEL (a matte slab
// with four layers of knobs = parameters, y 732…1028) → the GAUGE (probability bars of the next token, y 1100…1290).
// Every moving thing is a link of the chain: tokens go in → a warm wave of computation passes the layers top → bottom →
// bars rise → one bar is picked → that tile flies up and is appended (inference). Training adds the cool link: the answer
// is revealed → the gap to the answer → a cool wave runs bottom → top and each knob it passes turns a little.
// Light only on signals: the warm wave (the model's computation / its guess), the cool wave (correction from the answer),
// and the GPUs' compute pulses. Tiles, slab, knobs, cards and chips are matte bodies with faces and shading.
// Warm = the model's own computation and choice; cool = the answer / human feedback / correction. Ghosts = dashed grey.
// Time: training and inference are drawn slower than real (one pass ≈ 1 s on screen; real passes take far less);
// "몇 달" is compressed — declared in kickers. Knobs are a metaphor for parameters (declared in the title "손잡이 = 매개변수").
// Numbers (sources in brief.md): 1955 Dartmouth proposal; 習 = 說文 "數飛也"; GPT-3 175B parameters (2020);
// a recent open model (Llama 3.1 405B, 2024): > 15T tokens, ~16,000 H100 GPUs, months; ChatGPT 2022-11-30 (RLHF);
// Constitutional AI (Anthropic, 2022-12). Probabilities on the bars are illustrative, not measured from a real model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, glow, arrow, poly, rect, withAlpha, TAU, rand, loadTimeline} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920;
export const theme = 'noturno';
export const captionLayout = {};

const PAL = {ink: '#EFE3D4', muted: '#8AA0A6', warm: '#FFB454', cool: '#8CD9FF', ghost: '#C9D6DC',
  tileHi: '#E4EDF0', tileLo: '#9DB1B8', tileInk: '#0B1A20', slabHi: '#1E3B47', slabLo: '#0A1A21', rim: '#4C7F90',
  knobHi: '#D5E1E5', knobLo: '#5C747E', chipHi: '#3A4F57', chipLo: '#18252B'};

// ---------------------------------------------------------------------------------------------------- geometry
const STRIP = {x0: 96, x1: 984, rows: [598, 674], h: 58, size: 32, gap: 12};
const SLAB = {x: 130, y: 732, w: 820, h: 296, r: 26};
const ROWS = [786, 852, 918, 984];                       // the four layers (top → bottom)
const COLS = [222, 328, 434, 540, 646, 752, 858];
const BARS = {base: 1252, full: 178, w: 98, labelY: 1288, xs: [236, 388, 540, 692, 844]};   // bar height = p × full (p = 1 is the dashed answer box)
const WAVE = {top: 708, bot: 1096};                        // the wave runs between the strip and the bars
const rowU = y => (y - WAVE.top) / (WAVE.bot - WAVE.top);

// ---------------------------------------------------------------------------------------------------- helpers
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const onAt = (t, t0, d = 0.1) => smooth((t - t0 + 0.034) / d);          // a number is already up on its event frame
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 28, weight = o.weight ?? 700, w = stage.measure(s, {size, weight}), pad = 9;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba('#03141C', 0.8), o.border ? rgba(o.border, 0.85) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink});
  });
  return w;
}
function bigNum(stage, label, num, unit, x, y, a, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18}, size = o.size || 112, us = Math.round(size * 0.46);
  withAlpha(c, a, () => {
    const uw = unit ? stage.measure(unit, {role: 'display', size: us, weight: 700}) + 12 : 0;
    stage.text(num, x - uw, y, {role: 'display', size, weight: 700, color: o.col || PAL.ink, align: 'right', ...so});
    if (unit) stage.text(unit, x, y + size * 0.12, {role: 'display', size: us, weight: 700, color: o.ucol || PAL.warm, align: 'right', ...so});
    if (label) stage.text(label, x, y - size * 0.8, {size: 30, weight: 500, color: PAL.muted, align: 'right', ...so});
  });
}

// ---------------------------------------------------------------------------------------------------- plan (one clock)
// passes: {t0, dur, dir: 'f'|'b', k (knob turn for 'b')}; dists: {t, labels, p, pick, target, ghostPrev, until}
// strips: per scene {base: [...], ghostAfter} ; appends: {tok, t0 (fly start), t (land), from (bar index), scene, cool}
const PLANS = new WeakMap();
const Q = ['하늘은', '왜', '파랄까?'];
const HOOK_STEPS = [
  [['햇빛', '하늘', '공기', '바다', '빛'], [0.42, 0.2, 0.16, 0.12, 0.1]],
  [['속', '에서', '의', '은', '이'], [0.38, 0.25, 0.17, 0.11, 0.09]],
  [['파란', '여러', '빨간', '모든', '짧은'], [0.45, 0.17, 0.15, 0.13, 0.1]],
  [['빛이', '색이', '파장이', '것이', '빛은'], [0.5, 0.18, 0.14, 0.1, 0.08]],
  [['더', '잘', '먼저', '공기에', '많이'], [0.4, 0.22, 0.14, 0.13, 0.11]],
  [['많이', '잘', '넓게', '강하게', '자주'], [0.46, 0.2, 0.13, 0.11, 0.1]],
  [['흩어져서', '퍼져서', '튀어서', '남아서', '꺾여서'], [0.52, 0.2, 0.11, 0.09, 0.08]],
];
const TRAIN = {tokens: ['하늘이', '정말', '파랗다'], labels: ['맑다', '높다', '파랗다', '넓다', '흐리다'], target: 2,
  p: [[0.36, 0.24, 0.12, 0.16, 0.12], [0.33, 0.2, 0.22, 0.14, 0.11], [0.24, 0.14, 0.45, 0.1, 0.07], [0.12, 0.06, 0.74, 0.05, 0.03]]};
const pct = x => `${Math.round(x * 100)}`;

export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  const at = r => tl.at(r), wd = (s, w, o = 0) => tl.wordStart(s, w) + o, sc = id => tl.scene(id);
  P = {tl, end: tl.duration, passes: [], dists: [], appends: [], marks: {}};
  P.sc = Object.fromEntries(tl.scenes.map(s => [s.id, s]));
  P.MORPH = [0.9, 1.7];
  P.poster = at('s22:end') - 1.6;
  const fwd = (t0, dur = 0.8) => P.passes.push({t0, dur, dir: 'f'});
  const back = (t0, dur = 0.9, k = 1) => P.passes.push({t0, dur, dir: 'b', k});
  const dist = (t, labels, p, o = {}) => P.dists.push({t, labels, p, pick: o.pick ?? -1, pickT: o.pickT ?? Infinity, target: o.target ?? -1, targetT: o.targetT ?? Infinity, ghostPrev: !!o.ghostPrev, until: o.until ?? Infinity, scene: o.scene});
  const append = (tok, t0, from, scene, o = {}) => P.appends.push({tok, t0, t: t0 + 0.55, from, scene, cool: !!o.cool, row: o.row});
  /** one inference step: forward pass → bars → pick → tile flies up and lands */
  const step = (t0, [labels, p], scene, o = {}) => {
    fwd(t0, o.dur ?? 0.8); const tb = t0 + (o.dur ?? 0.8), pick = o.pick ?? 0;
    dist(tb, labels, p, {pick, pickT: tb + (o.hold ?? 0.25), scene, until: o.until});
    append(labels[pick], tb + (o.hold ?? 0.25) + 0.1, pick, scene);
    return tb + (o.hold ?? 0.25) + 0.65;
  };
  // ---- hook: the poster already shows step 1's bars; from 1.9 s one token every 1.6 s
  { const s = sc('hook');
    dist(-1, ...HOOK_STEPS[0], {pick: 0, pickT: 0, scene: 'hook'}); append(HOOK_STEPS[0][0][0], 1.85, 0, 'hook');
    for (let k = 1; k < HOOK_STEPS.length; k++) step(2.6 + (k - 1) * 1.55, HOOK_STEPS[k], 'hook', {until: s.end - 0.2});
  }
  // ---- origin: two quiet training loops on "날갯짓을" and "되풀이해" (practice, repeated)
  P.y1955 = wd('s03', '천구백오십오년'); P.sup = wd('s04', '습은'); P.wing = wd('s04', '날갯짓을'); P.rep = wd('s04', '되풀이해');
  fwd(P.wing - 0.1, 0.6); back(P.wing + 0.6, 0.6, 0.35); fwd(P.rep - 0.1, 0.6); back(P.rep + 0.6, 0.6, 0.35);
  // ---- essence: four fast loops; the answer's probability climbs 12 → 22 → 45 → 74 %
  { const s = sc('essence'); P.essLoops = [];
    for (let k = 0; k < 4; k++) { const t0 = s.start + 0.5 + k * 1.55; fwd(t0, 0.45); dist(t0 + 0.45, TRAIN.labels, TRAIN.p[k], {target: TRAIN.target, targetT: t0 + 0.5, scene: 'essence', ghostPrev: k === 3}); back(t0 + 0.75, 0.5, 0.6); P.essLoops.push(t0 + 0.45); }
  }
  // ---- train: one loop in slow motion
  P.tokWord = wd('s06', '토큰이라'); P.cover = wd('s06', '가리고');
  P.cand = wd('s07', '후보마다'); P.ans = wd('s07', '정답에'); P.wrong = wd('s07', '틀렸다고');
  P.backW = wd('s08', '거꾸로'); P.turn = wd('s08', '돌립니다');
  P.param = wd('s09', '매개변수,'); P.bprop = wd('s09', '역전파라고');
  fwd(P.cand - 0.1, 1.1); dist(P.cand + 1.0, TRAIN.labels, TRAIN.p[0], {target: TRAIN.target, targetT: P.ans, scene: 'train'});
  back(P.backW, 3.0, 1);
  fwd(P.turn - 0.2, 0.9); dist(P.turn + 0.7, TRAIN.labels, TRAIN.p[1], {target: TRAIN.target, targetT: P.turn + 0.7, ghostPrev: true, scene: 'train'});
  back(P.bprop - 0.15, 1.2, 0.5);
  // ---- scale
  P.n175 = wd('s10', '천칠백오십억개'); P.n15 = wd('s11', '십오조개가'); P.gpu = wd('s11', '지피유'); P.months = wd('s11', '몇');
  // ---- tune: the base model only continues; a human example; a choice of two; principles
  P.cont = wd('s12', '이어'); P.dunno = wd('s12', '모릅니다');
  { const s = sc('tune'); let t = s.start + 1.6;
    for (const [lab, p] of [[['바다는', '그리고', '하늘은', '구름은', '왜'], [0.34, 0.22, 0.18, 0.14, 0.12]], [['왜', '언제', '얼마나', '어디서', '누가'], [0.4, 0.2, 0.16, 0.13, 0.11]], [['짤까?', '깊을까?', '넓을까?', '클까?', '찰까?'], [0.38, 0.24, 0.16, 0.12, 0.1]]]) t = step(t, [lab, p], 'tune', {until: P.dunno + 0.4, dur: 0.6});
  }
  P.demo = wd('s13', '문답'); P.two = wd('s13', '두'); P.better = wd('s13', '더'); P.rate = wd('s13', '평가로');
  back(P.demo + 0.9, 0.9, 0.7); back(P.rate + 0.1, 0.9, 0.7);
  P.y2022 = wd('s14', '이천이십이년'); P.princ = wd('s14', '원칙'); P.fix = wd('s14', '고치게');
  back(P.fix + 0.6, 0.9, 0.6);
  // ---- infer: knobs locked; compute only
  P.lock = wd('s15', '그대로'); P.calc = wd('s15', '계산만'); P.layers = wd('s16', '층을'); P.table = wd('s16', '확률표가');
  P.pick1 = wd('s17', '골라'); P.again = wd('s17', '다시'); P.prob = wd('s18', '확률로'); P.differ = wd('s18', '달라질');
  fwd(P.calc - 0.1, 0.7);
  P.resample = wd('s18', '확률로') + 0.6;
  fwd(P.layers - 0.2, P.table - P.layers + 0.2); dist(P.table, ...HOOK_STEPS[0], {pick: 0, pickT: P.pick1, scene: 'infer', until: P.resample - 0.3}); append('햇빛', P.pick1 + 0.15, 0, 'infer');
  { let t = P.again - 0.1; t = step(t, HOOK_STEPS[1], 'infer', {dur: 0.6, until: P.resample - 0.3}); t = step(t, HOOK_STEPS[2], 'infer', {dur: 0.6, until: P.resample - 0.3}); P.infLast = t; }
  // the same bars, a different draw: '여러' instead of '파란' (ghost of '파란' kept below)
  // ---- myth
  P.net = wd('s19', '인터넷에서'); P.no = wd('s20', '아닙니다,'); P.piece = wd('s20', '한'); P.wrongA = wd('s21', '틀린'); P.check = wd('s21', '확인해야');
  { let t = P.no + 0.9; for (let k = 0; k < 4; k++) t = step(t, HOOK_STEPS[k], 'myth', {dur: 0.55, hold: 0.2, until: P.wrongA - 0.3}); }
  // ---- close: one more step, then the poster
  P.closeStep = wd('s22', '맞히는');
  step(P.closeStep - 0.2, HOOK_STEPS[0], 'close', {dur: 0.8, until: P.poster + 0.3});
  P.passes.sort((a, b) => a.t0 - b.t0); P.dists.sort((a, b) => a.t - b.t); P.appends.sort((a, b) => a.t - b.t);
  P.backs = P.passes.filter(x => x.dir === 'b');
  PLANS.set(tl, P);
  return P;
}

// ---------------------------------------------------------------------------------------------------- knobs (parameters)
const BASE = ROWS.map((_, i) => COLS.map((_, j) => (rand(i * 17.3 + j * 3.1) - 0.5) * 2.4));
const DELTA = ROWS.map((_, i) => COLS.map((_, j) => (rand(i * 5.7 + j * 11.9 + 3) - 0.5) * 0.9));
function knobAngle(P, i, j, t) {
  let a = BASE[i][j];
  for (const b of P.backs) { const tp = b.t0 + b.dur * (1 - rowU(ROWS[i])); a += b.k * DELTA[i][j] * smooth((t - tp) / 0.35); }
  return a;
}

// ---------------------------------------------------------------------------------------------------- drawing: bodies
function tileW(stage, s) { return stage.measure(s, {size: STRIP.size, weight: 700}) + 34; }
/** a matte token tile: face gradient (lit top-left), soft shadow, dark text. o.edge = event colour, o.ghost = dashed */
function tile(stage, s, x, y, o = {}) {
  const c = stage.ctx, w = o.w ?? tileW(stage, s), h = STRIP.h, x0 = x, y0 = y - h / 2;
  withAlpha(c, o.a ?? 1, () => {
    if (o.ghost) { rect(c, x0, y0, w, h, 10, rgba(PAL.ghost, 0.05)); c.setLineDash([6, 6]); rect(c, x0, y0, w, h, 10, null, rgba(PAL.ghost, 0.55), 2); c.setLineDash([]); stage.text(s, x0 + w / 2, y, {size: STRIP.size, weight: 700, color: rgba(PAL.ghost, 0.6), align: 'center'}); return; }
    rect(c, x0 + 3, y0 + 6, w, h, 10, 'rgba(0,0,0,0.35)');
    const g = c.createLinearGradient(x0, y0, x0 + w * 0.35, y0 + h); g.addColorStop(0, o.hi || PAL.tileHi); g.addColorStop(1, o.lo || PAL.tileLo);
    rect(c, x0, y0, w, h, 10, g);
    line(c, [[x0 + 10, y0 + 1.5], [x0 + w - 10, y0 + 1.5]], 'rgba(255,255,255,0.55)', 1.5);
    if (o.edge && (o.edgeA ?? 1) > 0) withAlpha(c, o.edgeA ?? 1, () => rect(c, x0, y0, w, h, 10, null, o.edge, 3.5));
    stage.text(s, x0 + w / 2, y + 1, {size: STRIP.size, weight: 700, color: o.ink || PAL.tileInk, align: 'center'});
  });
  return w;
}
function slab(stage, a = 1) {
  const c = stage.ctx, {x, y, w, h, r} = SLAB;
  withAlpha(c, a, () => {
    rect(c, x + 6, y + 10, w, h, r, 'rgba(0,0,0,0.4)');
    const g = c.createLinearGradient(x, y, x + w * 0.3, y + h); g.addColorStop(0, PAL.slabHi); g.addColorStop(1, PAL.slabLo);
    rect(c, x, y, w, h, r, g);
    line(c, [[x + r, y + 1.5], [x + w - r, y + 1.5]], rgba('#7FB2C2', 0.55), 2);
    rect(c, x, y, w, h, r, null, rgba(PAL.rim, 0.7), 1.6);
    for (const yy of ROWS) line(c, [[x + 40, yy], [x + w - 40, yy]], rgba('#5C8C9C', 0.22), 1.2);    // layer rails
  });
}
/** a matte knob (parameter): radial face, dark pointer. lit = warm energy rim while the wave passes */
function knob(stage, x, y, ang, o = {}) {
  const c = stage.ctx, r = 19;
  circle(c, x + 2, y + 4, r, 'rgba(0,0,0,0.35)');
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r); g.addColorStop(0, o.locked ? '#B8C3C7' : PAL.knobHi); g.addColorStop(1, o.locked ? '#4F5F66' : PAL.knobLo);
  circle(c, x, y, r, g);
  line(c, [[x, y], [x + Math.cos(ang - Math.PI / 2) * r * 0.82, y + Math.sin(ang - Math.PI / 2) * r * 0.82]], '#0B1A20', 3.2);
  if (o.lit > 0.02) { glow(c, x, y, r * 2.1, o.litCol || PAL.warm, 0.45 * o.lit); ring(c, x, y, r + 2, rgba(o.litCol || PAL.warm, 0.9 * o.lit), 2.4); }
}
function chip(stage, x, y, s, heat) {
  const c = stage.ctx;
  for (let k = 0; k < 5; k++) { const d = -s * 0.36 + k * s * 0.18; line(c, [[x + d, y - s / 2 - 7], [x + d, y - s / 2]], '#62777F', 2); line(c, [[x + d, y + s / 2], [x + d, y + s / 2 + 7]], '#62777F', 2); }
  rect(c, x - s / 2 + 3, y - s / 2 + 5, s, s, 6, 'rgba(0,0,0,0.35)');
  const g = c.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2); g.addColorStop(0, PAL.chipHi); g.addColorStop(1, PAL.chipLo);
  rect(c, x - s / 2, y - s / 2, s, s, 6, g); rect(c, x - s / 4, y - s / 4, s / 2, s / 2, 3, rgba('#55707A', 0.9));
  if (heat > 0.02) glow(c, x, y, s * 0.9, PAL.warm, 0.5 * heat);       // compute = energy
}

// ---------------------------------------------------------------------------------------------------- drawing: the strip
/** lay out tokens left → right, wrapping to the second row. returns positions [{x, w, y}] */
function layout(stage, toks) {
  const pos = []; let x = STRIP.x0, row = 0;
  for (const s of toks) { const w = tileW(stage, s); if (x + w > STRIP.x1 && row === 0) { row = 1; x = STRIP.x0; } pos.push({x, w, y: STRIP.rows[row]}); x += w + STRIP.gap; }
  return pos;
}

// ---------------------------------------------------------------------------------------------------- drawing: waves, bars
function waves(stage, P, t, o = {}) {
  const c = stage.ctx;
  for (const ps of P.passes) {
    const u = (t - ps.t0) / ps.dur; if (u < -0.02 || u > 1.25) continue;
    const q = clamp(u), y = ps.dir === 'f' ? lerp(WAVE.top, WAVE.bot, q) : lerp(WAVE.bot, WAVE.top, q), col = ps.dir === 'f' ? PAL.warm : PAL.cool;
    const fade = u > 1 ? 1 - smooth((u - 1) / 0.25) : smooth(u / 0.08);
    const inSlab = y > SLAB.y + 8 && y < SLAB.y + SLAB.h - 8;
    const half = inSlab ? SLAB.w / 2 - 44 : lerp(60, SLAB.w / 2 - 44, smooth(1 - Math.min(Math.abs(y - SLAB.y), Math.abs(y - SLAB.y - SLAB.h)) / 60));
    withAlpha(c, fade * (o.a ?? 1), () => {
      for (let k = -8; k <= 8; k++) { const x = 540 + half * k / 8; glow(c, x, y, 20, col, 0.42); }
      line(c, [[540 - half, y], [540 + half, y]], rgba(col, 0.85), 2.4);
    });
  }
}
function waveAt(P, t, y) {      // how much a wave is at height y now → {f, b}
  let f = 0, b = 0;
  for (const ps of P.passes) { const u = (t - ps.t0) / ps.dur; if (u < 0 || u > 1) continue; const wy = ps.dir === 'f' ? lerp(WAVE.top, WAVE.bot, u) : lerp(WAVE.bot, WAVE.top, u); const v = Math.exp(-(((wy - y) / 28) ** 2)); if (ps.dir === 'f') f = Math.max(f, v); else b = Math.max(b, v); }
  return {f, b};
}
function model(stage, P, t, o = {}) {
  slab(stage, o.a ?? 1);
  withAlpha(stage.ctx, o.a ?? 1, () => {
    ROWS.forEach((y, i) => { const w = waveAt(P, t, y); COLS.forEach((x, j) => knob(stage, x, y, knobAngle(P, i, j, t), {lit: Math.max(w.f, w.b), litCol: w.b > w.f ? PAL.cool : PAL.warm, locked: o.locked})); });
  });
}
/** the probability bars on one clock with the dists; ghost of the previous dist when asked */
function bars(stage, P, t, scene, o = {}) {
  const c = stage.ctx, list = P.dists.filter(d => d.scene === scene && t >= d.t - 0.0001 && t < d.until);
  if (!list.length) return null;
  const d = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null, rise = d.t < 0 ? 1 : easeOut((t - d.t) / 0.3);
  withAlpha(c, o.a ?? 1, () => {
    line(c, [[150, BARS.base], [930, BARS.base]], rgba(PAL.muted, 0.6), 1.6);
    BARS.xs.forEach((x, i) => {
      const h = BARS.full * d.p[i] * rise, picked = d.pick === i && t >= d.pickT, isT = d.target === i && t >= d.targetT;
      if (d.ghostPrev && prev) { const hp = BARS.full * prev.p[i]; c.setLineDash([5, 5]); rect(c, x - BARS.w / 2, BARS.base - hp, BARS.w, hp, 6, null, rgba(PAL.ghost, 0.55), 2); c.setLineDash([]); }
      const g = c.createLinearGradient(0, BARS.base - h, 0, BARS.base); g.addColorStop(0, picked ? '#FFD08A' : '#B9C9CE'); g.addColorStop(1, picked ? '#B9772C' : '#5C747E');
      if (h > 1) rect(c, x - BARS.w / 2, BARS.base - h, BARS.w, h, 6, g);
      if (picked) { const q = smooth((t - d.pickT) / 0.15); withAlpha(c, q, () => { glow(c, x, BARS.base - h, 34, PAL.warm, 0.5); rect(c, x - BARS.w / 2, BARS.base - h, BARS.w, h, 6, null, PAL.warm, 3); }); }
      if (isT) { const q = smooth((t - d.targetT + 0.034) / 0.12); withAlpha(c, q, () => { c.setLineDash([7, 5]); rect(c, x - BARS.w / 2 - 4, BARS.base - BARS.full, BARS.w + 8, BARS.full, 8, null, rgba(PAL.cool, 0.9), 2.4); c.setLineDash([]); }); }
      stage.text(d.labels[i], x, BARS.labelY, {size: 27, weight: 700, color: isT ? PAL.cool : picked ? PAL.warm : PAL.ink, align: 'center'});
      if (rise > 0.9 && !o.noPct) stage.text(`${pct(d.p[i])}%`, x, BARS.base - h - 18, {size: 22, weight: 500, color: PAL.muted, align: 'center'});
    });
  });
  return d;
}

// ---------------------------------------------------------------------------------------------------- one stage
/** strip (base tiles + appends of this scene with flying tile), model, waves, bars */
function stageDraw(stage, P, t, scene, base, o = {}) {
  const c = stage.ctx, aps = P.appends.filter(a => a.scene === scene && t >= a.t0 && (o.apUntil === undefined || a.t0 < o.apUntil));
  const toks = [...base, ...aps.map(a => o.swap && o.swap[a.tok] && t >= o.swap[a.tok].t ? o.swap[a.tok].tok : a.tok)];
  const pos = layout(stage, toks);
  if (!o.noModel) { model(stage, P, t, {locked: o.locked, a: o.modelA}); waves(stage, P, t, {a: o.modelA}); }
  const d = bars(stage, P, t, scene, {a: o.barsA});
  const sa = o.stripA ?? 1; if (sa <= 0) return {pos, toks, d};
  stage.ctx.save(); stage.ctx.globalAlpha *= sa;
  // tiles
  toks.forEach((s, i) => {
    const ap = i >= base.length ? aps[i - base.length] : null, p = pos[i];
    const st = o.tileStyle ? o.tileStyle(i, s, t) : {};
    if (st.hide) return;
    if (ap && t < ap.t) {        // flying from its bar label up to its slot
      const q = easeInOut((t - ap.t0) / (ap.t - ap.t0)), fx = BARS.xs[ap.from] - p.w / 2, fy = BARS.labelY;
      tile(stage, s, lerp(fx, p.x, q), lerp(fy, p.y, q) - Math.sin(q * Math.PI) * 60, {w: p.w, edge: PAL.warm, ...st});
      return;
    }
    const landed = ap ? smooth(1 - (t - ap.t) / 0.5) : 0;
    tile(stage, s, p.x, p.y, {w: p.w, edge: st.edge ?? (landed > 0 ? PAL.warm : null), edgeA: st.edge ? 1 : landed, ...st});
  });
  stage.ctx.restore();
  return {pos, toks, d};
}

// ---------------------------------------------------------------------------------------------------- titles, poster, overlays, background
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.4;
  if (id === 'hook') return [[-Infinity, '오늘의 주제 · 한 번을 느리게', 'AI는 어떻게 답할까?']];
  if (id === 'origin') return [[-Infinity, '기원 · 이름', '인공지능, 1955'], [at('s04'), '기원 · 글자', '학습의 習 = 거듭 날갯짓']];
  if (id === 'essence') return [[-Infinity, '본질 · 확률은 설명용', '다음 말 맞히기 연습']];
  if (id === 'train') return [[-Infinity, '메커니즘 ① 학습 · 한 번을 느리게', '틀린 만큼 고친다'], [at('s09'), '메커니즘 ① 학습 · 비유', '손잡이 = 매개변수']];
  if (id === 'scale') return [[-Infinity, '메커니즘 ② 규모 · 크기는 상징', '1,750억 개의 손잡이'], [at('s11'), '메커니즘 ② 규모 · 몇 달을 몇 초로', '15조 개의 토큰']];
  if (id === 'tune') return [[-Infinity, '메커니즘 ③ 다듬기', '이어 쓰기에서 대답으로']];
  if (id === 'infer') return [[-Infinity, '메커니즘 ④ 추론 · 손잡이는 고정', '한 조각씩 고른다']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '인터넷에서 찾아올까?'], [P.no - 0.2, '오해 바로잡기', '배운 값으로 새로 짓는다']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 900, ...so}));
}
const POSTER = {q: 'ChatGPT는 어떻게 답할까?', a: '다음 말 맞히기', y: 940, y2: 1080};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 880, 96); AS ||= fit(POSTER.a, 880, 150);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 56, q), tr = lerp(-0.03, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, 820, 0, 1190); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.3, 'rgba(0,10,16,0.66)'); g.addColorStop(0.75, 'rgba(0,10,16,0.66)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, 820, W, 370); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    withAlpha(c, 1 - q, () => stage.text(POSTER.a, 540, lerp(POSTER.y2, 292, q), {role: 'display', weight: 700, size: lerp(AS, 34, q), color: PAL.warm, align: 'center', tracking: tr * AS, shadow: sh, shadowBlur: 28}));
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1320, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,8,12,0.38)'); g.addColorStop(1, 'rgba(0,8,12,0.6)'); c.fillStyle = g; c.fillRect(0, 1320, W, 600); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < P.MORPH[1]) { posterTitle(stage, easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    captionBand(stage.ctx); progressBar(stage, t, ctx.tl.duration); return;
  }
  captionBand(stage.ctx);
  const L = titleList(id, P), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook') head(stage, cur[1], cur[2], fadeIn(t, P.MORPH[1] - 0.05, 0.4) * a, a);
  else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, P.MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
const STARS = Array.from({length: 120}, (_, i) => ({x: rand(i * 3.1 + 1) * W, y: rand(i * 7.7 + 2) * H, m: rand(i * 1.9 + 5) ** 3}));
export function background(stage, t, ctx) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 300, H); g.addColorStop(0, '#02202D'); g.addColorStop(1, '#000B12');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (const s of STARS) { c.fillStyle = rgba('#E8F0F6', 0.06 + 0.22 * s.m); const r = 0.6 + 1.2 * s.m; c.fillRect(s.x - r / 2, s.y - r / 2, r, r); }
  const v = c.createRadialGradient(540, 900, 560, 540, 900, 1500); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------------------------------- scenes
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/ai-learning/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.passes.length}/${P.appends.length}/${(P.passes[0]?.t0 || 0).toFixed(3)}`; }
const dip = (c, t, t0, d = 0.45) => { const q = (t - t0) / d; if (q >= 0 && q < 1) { c.fillStyle = `rgba(0,10,16,${1 - smooth(q)})`; c.fillRect(0, 0, W, H); } };
/** zoom of the whole stage about (540, 900) — scale scene only (structure: one model among many) */
function zoomed(c, k, fn) { c.save(); c.translate(540, 900); c.scale(k, k); c.translate(-540, -900); try { fn(); } finally { c.restore(); } }

export const scenes = {
  // chain: (poster) the question's tiles and the bars of the first answer token → the top bar is picked → its tile flies up and is
  // appended → the warm wave runs through the layers again → new bars → pick → append … one token at a time (1 day … no: ~1.5 s each)
  hook(stage, t, p, ctx) {
    checkSoundTable(ctx);
    const P = plan(ctx.tl);
    stageDraw(stage, P, t, 'hook', Q);
  },

  // chain: 1955 (the name) → 習: the model repeats a quiet guess/correct loop on "날갯짓을" and "되풀이해"
  origin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const dim = 0.45 + 0.55 * fadeIn(t, P.wing - 0.4, 0.5);
    withAlpha(c, dim, () => stageDraw(stage, P, t, 'origin', ['하늘이', '정말', '파랗다'], {stripA: fadeIn(t, s0 + 0.35, 0.45)}));
    const hk = fadeOut(t, s0, 0.4); if (hk > 0) withAlpha(c, hk, () => { const toks = [...Q, ...HOOK_STEPS.map(x => x[0][0])], pos = layout(stage, toks); toks.forEach((s, i) => tile(stage, s, pos[i].x, pos[i].y, {w: pos[i].w})); });
    bigNum(stage, '인공지능이라는 이름', '1955', '', 980, 440, onAt(t, P.y1955) * fadeOut(t, P.sup - 0.5, 0.3), {col: PAL.ink});
    // 習 card: the glyph and its reading (the scene's one large character)
    const gA = fadeIn(t, P.sup - 0.2, 0.3) * fadeOut(t, ctx.scene.end - 0.35, 0.3);
    if (gA > 0) withAlpha(c, gA, () => {
      rect(c, 640, 318, 300, 236, 16, rgba('#06222E', 0.9), rgba(PAL.cool, 0.7), 2);
      stage.text('習', 790, 418, {size: 128, weight: 700, color: PAL.ink, align: 'center'});
      stage.text('습 · 자주 날다', 790, 520, {size: 30, weight: 700, color: PAL.cool, align: 'center'});
    });
    void s0;
  },

  // chain: guess (warm down) → bars → the answer shown (cool frame) → correction (cool up, knobs turn) → again ×4; the answer's bar climbs
  essence(stage, t, p, ctx) {
    const P = plan(ctx.tl);
    stageDraw(stage, P, t, 'essence', ['하늘이', '정말', '파랗다'], {tileStyle: i => i === 2 ? {edge: PAL.cool, hi: '#DDF3FB', lo: '#8DB9C9'} : {}});
    const k = P.essLoops.filter(x => x <= t + 0.034).length - 1;
    if (k >= 0) bigNum(stage, '정답에 준 확률', pct(TRAIN.p[k][TRAIN.target]), '%', 980, 440, 1, {ucol: PAL.cool});
  },

  // chain (slow): sentence → cut into tokens → last one covered → warm wave → bars → answer revealed → gap → cool wave up, knobs turn
  //               → warm wave again → bars, old bars as ghosts, the answer's bar higher
  train(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const split = easeInOut((t - P.tokWord + 0.1) / 0.6), cover = t >= P.cover && t < P.ans;
    const base = ['하늘이', '정말', '파랗다'];
    // the sentence as one piece, then cut into token tiles (the gap opens on "토큰이라")
    const r = stageDraw(stage, P, t, 'train', base.map((s, i) => i === 2 && cover ? '?' : s), {
      tileStyle: (i) => i === 2 && t >= P.ans ? {edge: PAL.cool, hi: '#DDF3FB', lo: '#8DB9C9'} : {}});
    if (split < 1) withAlpha(c, 1 - split, () => {         // the joined sentence over the tiles before the cut
      const w = r.pos[2].x + r.pos[2].w - r.pos[0].x;
      tile(stage, '하늘이 정말 파랗다', r.pos[0].x, r.pos[0].y, {w});
    });
    tag(stage, '토큰', r.pos[1].x + r.pos[1].w / 2, r.pos[0].y - 58, {size: 26, color: PAL.ink, a: fadeIn(t, P.tokWord, 0.3) * fadeOut(t, P.cand - 0.3, 0.3)});
    // the gap between the answer's bar and full certainty (the error), on "틀렸다고"
    const d = r.d;
    if (d && t >= P.wrong - 0.05 && t < P.turn + 0.5) withAlpha(c, onAt(t, P.wrong, 0.2) * fadeOut(t, P.turn, 0.3), () => {
      const x = BARS.xs[TRAIN.target] + BARS.w / 2 + 14, yTop = BARS.base - BARS.full, yBar = BARS.base - BARS.full * d.p[TRAIN.target];
      line(c, [[x - 6, yTop], [x, yTop], [x, yBar], [x - 6, yBar]], PAL.cool, 3);
      tag(stage, '오차', x + 52, (yTop + yBar) / 2, {size: 26, color: PAL.cool});
    });
    // the answer's probability: the scene's one number, on the bars' frames
    const n = t >= P.turn + 0.7 ? 1 : t >= P.ans ? 0 : -1;
    if (n >= 0) bigNum(stage, '정답에 준 확률', pct(TRAIN.p[n][TRAIN.target]), '%', 980, 440, onAt(t, n ? P.turn + 0.7 : P.ans) * fadeOut(t, ctx.scene.end - 0.35, 0.3), {ucol: PAL.cool});
    // names of two links: the knob (parameter) and the backward wave (backprop)
    tag(stage, '매개변수', COLS[5], ROWS[0] - 52, {size: 26, color: PAL.ink, a: fadeIn(t, P.param, 0.25) * fadeOut(t, ctx.scene.end - 0.4, 0.3)});
    const bA = fadeIn(t, P.bprop - 0.1, 0.25) * fadeOut(t, ctx.scene.end - 0.4, 0.3);
    if (bA > 0) withAlpha(c, bA, () => { arrow(c, [100, 1080], [100, 760], PAL.cool, 3, {head: 16}); tag(stage, '역전파', 100, 1130, {size: 26, color: PAL.cool}); });
    void s0;
  },

  // chain: the stage shrinks → it is one of many → (1,750억) → token tiles stream in from above → GPU chips pulse with compute
  scale(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start, s1 = ctx.scene.end;
    const k = lerp(1, 0.3, easeInOut((t - s0) / 1.3));
    const out = easeInOut((t - s1 + 1.2) / 1.1);            // zoom back in at the end (into the next scene)
    const kk = lerp(k, 1, out);
    zoomed(c, kk, () => {
      // neighbours: the same slab repeated (a schematic of "very many knobs"), appearing outward
      const nb = fadeIn(t, s0 + 0.6, 0.6) * (1 - out);
      if (nb > 0) for (let gy = -2; gy <= 2; gy++) for (let gx = -2; gx <= 2; gx++) {
        if (!gx && !gy) continue; const ring_ = Math.max(Math.abs(gx), Math.abs(gy)), on = smooth((t - s0 - 0.6 - ring_ * 0.35) / 0.4) * nb;
        if (on <= 0) continue;
        withAlpha(c, on * 0.8, () => { c.save(); c.translate(gx * 900, gy * 360); slab(stage, 1); ROWS.forEach((y, i) => COLS.forEach((x, j) => knob(stage, x, y, BASE[(i + gx + 9) % 4][(j + gy + 9) % 7]))); c.restore(); });
      }
      model(stage, P, t);
      const tr = fadeOut(t, s0, 0.5); if (tr > 0) stageDraw(stage, P, t, 'train', ['하늘이', '정말', '파랗다'], {noModel: true, stripA: tr, barsA: tr, tileStyle: i => i === 2 ? {edge: PAL.cool, hi: '#DDF3FB', lo: '#8DB9C9'} : {}});
    });
    bigNum(stage, 'GPT-3의 손잡이(2020)', '1,750억', '개', 980, 440, onAt(t, P.n175) * fadeOut(t, P.n15 - 0.3, 0.3), {size: 104});
    // data: tiny token tiles raining into the grid
    const dA = fadeIn(t, P.n15 - 0.2, 0.3) * fadeOut(t, s1 - 1.2, 0.4);
    if (dA > 0) withAlpha(c, dA, () => {
      for (let i = 0; i < 60; i++) { const sp = 0.55 + rand(i * 2.3) * 0.5, ph = rand(i * 7.1), q = ((t - P.n15) * sp * 0.45 + ph) % 1, x = 80 + rand(i * 5.9) * 920, y = lerp(560, 1060, q);
        const a = smooth(q / 0.15) * (1 - smooth((q - 0.85) / 0.15)); withAlpha(c, a, () => { rect(c, x, y, 34, 16, 4, rgba(PAL.tileHi, 0.9)); rect(c, x, y + 11, 34, 5, 2, rgba(PAL.tileLo, 0.9)); }); }
    });
    bigNum(stage, '배운 토큰', '15조', '개+', 980, 440, onAt(t, P.n15) * fadeOut(t, s1 - 0.4, 0.3), {size: 104});
    // compute: GPU chips; each lights when a compute pulse passes (energy)
    const gA = fadeIn(t, P.gpu - 0.15, 0.3) * fadeOut(t, s1 - 0.6, 0.4);
    if (gA > 0) withAlpha(c, gA, () => {
      for (let i = 0; i < 8; i++) { const x = 150 + i * 111, y = 1222, ph = (t - P.gpu) * 2.2 - i * 0.18, heat = Math.max(0, Math.cos(ph * TAU)) ** 6 * fadeIn(t, P.gpu + 0.2, 0.3); chip(stage, x, y, 70, heat); }
      tag(stage, 'GPU × 2,000 = 1만 6천 개', 420, 1300, {size: 28, color: PAL.ink});
      tag(stage, '몇 달', 800, 1300, {size: 28, color: PAL.warm, a: fadeIn(t, P.months, 0.25)});
    });
  },

  // chain: the base model only continues the question (3 tiles) → they become ghosts → a human example (cool tiles) → cool correction
  //        → two answers, the better one ticked → cool correction → 2022 → principles card → its answer revised → cool correction
  tune(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const ghostCont = t >= P.dunno, demoOn = t >= P.demo;
    const demo = ['파란', '빛이', '더', '흩어져서'];
    const r = stageDraw(stage, P, t, 'tune', Q, {stripA: fadeIn(t, s0 + 0.1, 0.4), barsA: fadeOut(t, P.dunno + 0.2, 0.3),
      tileStyle: (i) => i >= 3 ? (demoOn ? {hide: true} : ghostCont ? {ghost: true} : {}) : {}});
    // the human-written example answer (cool: teaching), on "문답"
    if (demoOn) { const pos = layout(stage, [...Q, ...demo]); demo.forEach((s, i) => { const q = easeOut((t - P.demo - i * 0.12) / 0.35); if (q > 0) tile(stage, s, pos[3 + i].x, pos[3 + i].y - (1 - q) * 30, {w: pos[3 + i].w, a: q, edge: PAL.cool, hi: '#DDF3FB', lo: '#8DB9C9'}); }); }
    // two answers in the gauge band; the better one ticked (cool) on "더"
    const twoA = fadeIn(t, P.two - 0.1, 0.3) * fadeOut(t, P.y2022 - 0.4, 0.3);
    if (twoA > 0) withAlpha(c, twoA, () => {
      const A = '몰라요', B = '파란 빛이 더 흩어져서', wa = tileW(stage, A), wb = tileW(stage, B), ok = onAt(t, P.better, 0.15);
      tile(stage, A, 150, 1190, {w: wa, a: 1 - 0.5 * ok});
      tile(stage, B, 930 - wb, 1190, {w: wb, edge: PAL.cool, edgeA: ok});
      if (ok > 0) withAlpha(c, ok, () => line(c, [[930 - wb - 46, 1190], [930 - wb - 32, 1206], [930 - wb - 8, 1172]], PAL.cool, 5));
    });
    bigNum(stage, 'ChatGPT 공개', '2022', '', 980, 440, onAt(t, P.y2022) * fadeOut(t, ctx.scene.end - 0.35, 0.3));
    // principles: a matte card with three ruled lines; an answer is revised against it (cool), on "원칙" / "고치게"
    const pA = fadeIn(t, P.princ - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.35, 0.3);
    if (pA > 0) withAlpha(c, pA, () => {
      rect(c, 150 + 3, 1112 + 5, 230, 150, 10, 'rgba(0,0,0,0.35)');
      const g = c.createLinearGradient(150, 1112, 380, 1262); g.addColorStop(0, PAL.tileHi); g.addColorStop(1, PAL.tileLo); rect(c, 150, 1112, 230, 150, 10, g);
      stage.text('원칙', 265, 1146, {size: 28, weight: 700, color: PAL.tileInk, align: 'center'});
      for (let k = 0; k < 3; k++) line(c, [[180, 1182 + k * 26], [350 - (k === 2 ? 50 : 0), 1182 + k * 26]], rgba(PAL.tileInk, 0.55), 3);
      const fq = easeInOut((t - P.fix + 0.1) / 0.5), old = '모르겠어요', nw = '파란 빛이 더 흩어져서', w1 = tileW(stage, old), w2 = tileW(stage, nw);
      if (fq > 0) arrow(c, [390, 1187], [lerp(390, 470, fq), 1187], PAL.cool, 3, {head: 14});
      withAlpha(c, 1 - fq, () => tile(stage, old, 490, 1187, {w: w1, edge: PAL.warm}));
      withAlpha(c, fq, () => tile(stage, nw, 490, 1187, {w: Math.min(w2, 450), edge: PAL.cool}));
    });
    void r; void s0;
  },

  // chain: knobs lock (grey) → warm wave only → bars → pick → tile up → appended → again …; then the same bars, a different draw
  infer(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const locked = t >= P.lock;
    const rs = t >= P.resample;     // after the resample, '파란' (3rd answer) is replaced by '여러'; its ghost drops below
    const r = stageDraw(stage, P, t, 'infer', Q, {locked, swap: {'파란': {t: P.resample + 0.55, tok: '여러'}}});
    tag(stage, '고정', COLS[6] + 40, ROWS[0] - 54, {size: 26, color: PAL.ink, a: fadeIn(t, P.lock, 0.25) * fadeOut(t, ctx.scene.end - 0.4, 0.3)});
    if (rs && r.toks.length >= 6) {
      const i = 5, pp = r.pos[i], q = easeInOut((t - P.resample) / 0.55);
      // the bars of that step return; the pick moves to the 2nd bar; the old tile sinks to a ghost below the strip
      withAlpha(c, fadeIn(t, P.resample - 0.3, 0.25) * fadeOut(t, ctx.scene.end - 0.4, 0.3), () => {
        const [labels, prob] = HOOK_STEPS[2];
        BARS.xs.forEach((x, j) => { const h = BARS.full * prob[j], pk = j === 1; const g = c.createLinearGradient(0, BARS.base - h, 0, BARS.base); g.addColorStop(0, pk ? '#FFD08A' : '#B9C9CE'); g.addColorStop(1, pk ? '#B9772C' : '#5C747E'); rect(c, x - BARS.w / 2, BARS.base - h, BARS.w, h, 6, g); if (j === 0) { c.setLineDash([5, 5]); rect(c, x - BARS.w / 2, BARS.base - h, BARS.w, h, 6, null, rgba(PAL.ghost, 0.7), 2); c.setLineDash([]); } stage.text(labels[j], x, BARS.labelY, {size: 27, weight: 700, color: pk ? PAL.warm : PAL.ink, align: 'center'}); });
        line(c, [[150, BARS.base], [930, BARS.base]], rgba(PAL.muted, 0.6), 1.6);
      });
      tile(stage, '파란', pp.x, pp.y + 76 * q, {w: tileW(stage, '파란'), ghost: true, a: q});
      if (q < 1) tile(stage, '여러', lerp(BARS.xs[1] - tileW(stage, '여러') / 2, pp.x, q), lerp(BARS.labelY, pp.y, q) - Math.sin(q * Math.PI) * 60, {edge: PAL.warm});
    }
    void s0;
  },

  // chain: an "인터넷" box tied by a dashed line → the tie is cut → the answer is built from the knobs one tile at a time
  //        → a plausible-but-wrong pair of tiles → a cool "확인" bracket under them
  myth(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const wrongOn = t >= P.wrongA;
    const r = stageDraw(stage, P, t, 'myth', Q, {locked: true, tileStyle: (i) => wrongOn && i >= 3 ? {hide: true} : {}});
    // the internet box (dashed ghost) and its tie to the slab
    const nA = fadeIn(t, P.net - 0.2, 0.3) * fadeOut(t, P.wrongA - 0.4, 0.4), cut = onAt(t, P.no, 0.2);
    if (nA > 0) withAlpha(c, nA, () => {
      const bx = 720, by = 330, bw = 250, bh = 150;
      rect(c, bx, by, bw, bh, 14, rgba(PAL.ghost, 0.05)); c.setLineDash([7, 6]); rect(c, bx, by, bw, bh, 14, null, rgba(PAL.ghost, 0.7), 2); c.setLineDash([]);
      stage.text('인터넷', bx + bw / 2, by + bh / 2, {size: 34, weight: 700, color: rgba(PAL.ghost, 0.9), align: 'center'});
      // the tie runs down the right margin (outside the strip) into the slab's top-right corner
      withAlpha(c, 1 - 0.7 * cut, () => line(c, [[bx + bw - 30, by + bh], [bx + bw - 30, SLAB.y]], rgba(PAL.ghost, 0.6), 2, {dash: [6, 8]}));
      if (cut > 0) withAlpha(c, cut, () => { const mx = bx + bw - 30, my = 692; line(c, [[mx - 16, my - 16], [mx + 16, my + 16]], PAL.ink, 4); line(c, [[mx - 16, my + 16], [mx + 16, my - 16]], PAL.ink, 4); });
    });
    // the plausible-but-wrong answer (an old misconception) and the check bracket
    if (wrongOn) {
      const W2 = ['바다가', '비쳐서'], pos = layout(stage, [...Q, ...W2]);
      W2.forEach((s, i) => { const q = easeOut((t - P.wrongA - i * 0.25) / 0.35); if (q > 0) tile(stage, s, pos[3 + i].x, pos[3 + i].y, {w: pos[3 + i].w, a: q, edge: PAL.warm, edgeA: q}); });
      const cq = onAt(t, P.check, 0.2);
      if (cq > 0) withAlpha(c, cq, () => { const x0 = pos[3].x, x1 = pos[4].x + pos[4].w, y = pos[3].y + 40; line(c, [[x0, y - 8], [x0, y], [x1, y], [x1, y - 8]], PAL.cool, 3); tag(stage, '확인', (x0 + x1) / 2, y + 34, {size: 26, color: PAL.cool}); });
    }
    void r; dip(c, t, s0, 0.35);
  },

  // chain: one more step (warm down → bars → pick → append), the proposition, then the poster returns
  close(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    stageDraw(stage, P, t, 'close', Q);
    const qA = fadeIn(t, s0 + 0.4, 0.5) * fadeOut(t, P.poster - 0.5, 0.4);
    if (qA > 0) withAlpha(c, qA, () => stage.text('“다음에 올 말을 맞히는 연습”', 540, 372, {role: 'display', size: 46, weight: 700, color: PAL.ink, align: 'center', maxWidth: 900, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16}));
    dip(c, t, s0, 0.35);
  },
};

// ---------------------------------------------------------------------------------------------------- --emit-sound
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const tones = (id, times, f, gain, means, o = {}) => { if (!times.length) return; const T = [...times].sort((a, b) => a - b); ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((tt, k) => ({kind: 'tone', offset: r(tt - T[0], 4), params: {freq: Array.isArray(f) ? f[k] : f, dur: o.dur ?? 0.5, harmonics: [1, 0.25], attack: 0.03, decay: 0.15, sustain: 0.4, release: 0.3, gain_db: 0}}))}, means}); };
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 질문의 토큰과 다음 토큰의 확률 막대', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  // forward waves (warm, the model computing) → a soft low tone per wave; backward waves (cool, correction) → a rising whoosh
  const fw = P.passes.filter(x => x.dir === 'f').map(x => x.t0), bw = P.passes.filter(x => x.dir === 'b');
  for (const [sid, lo, hi] of [['f_a', 0, 40], ['f_b', 40, 100], ['f_c', 100, 999]]) tones(sid, fw.filter(x => x >= lo && x < hi), 131, -38, '계산의 물결(따뜻한 색)이 층을 지나감: 장면의 순전파마다 낮은 음', {dur: 0.4});
  bw.forEach((b, k) => whoosh(`b_${k}`, b.t0, Math.max(0.5, b.dur), 90, 200, '고치는 물결(차가운 색)이 아래에서 위로: 손잡이가 조금씩 돔', -37));
  // a tile lands in the strip (one token appended)
  tones('land_a', P.appends.filter(a => a.t < 60).map(a => a.t), 196, -37, '고른 토큰이 글 뒤에 붙음', {dur: 0.25});
  tones('land_b', P.appends.filter(a => a.t >= 60).map(a => a.t), 196, -37, '고른 토큰이 글 뒤에 붙음', {dur: 0.25});
  tick('y1955', P.y1955, 147, -35, '1955', {decay: 0.12}); tick('sup', P.sup, 131, -35, '習 글자', {decay: 0.12});
  tick('cover', P.cover, 110, -35, '마지막 토큰을 가림', {decay: 0.12}); swell('answer', P.ans, [131, 196], '정답이 드러남(차가운 테)', {dur: 1.2, gain: -35});
  tick('gap', P.wrong, 98, -34, '오차', {decay: 0.18}); tick('param', P.param, 165, -36, '매개변수 이름표', {decay: 0.1}); tick('bprop', P.bprop, 147, -36, '역전파 이름표', {decay: 0.1});
  tick('n175', P.n175, 196, -34, '1,750억', {decay: 0.16}); tick('n15', P.n15, 196, -34, '15조', {decay: 0.16}); swell('gpu', P.gpu, [82, 123], 'GPU가 계산을 시작함', {dur: 1.6, gain: -36});
  tick('dunno', P.dunno, 98, -35, '이어 쓰기만 한 토큰이 잔상으로', {decay: 0.16}); swell('demo', P.demo, [131, 196], '사람이 쓴 문답 예시', {dur: 1.2, gain: -36});
  tick('better', P.better, 165, -35, '더 나은 답에 표시', {decay: 0.14}); tick('y2022', P.y2022, 147, -35, '2022', {decay: 0.12}); tick('princ', P.princ, 131, -36, '원칙 카드', {decay: 0.12});
  tick('lock', P.lock, 110, -35, '손잡이 고정', {decay: 0.16}); tick('resample', P.resample + 0.55, 165, -36, '같은 막대, 다른 선택', {decay: 0.14});
  tick('net', P.net, 110, -36, '인터넷 상자', {decay: 0.12}); tick('cut', P.no, 98, -34, '연결을 끊음', {decay: 0.18}); tick('check', P.check, 165, -35, '확인 표시', {decay: 0.14});
  swell('poster_back', P.poster, [98, 147, 196], '첫 화면의 포스터가 돌아옴', {dur: 1.8, gain: -32});
  return lowBandOnly(ev, modelSignature(tl));
}
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev.sort((a, b) => a.at - b.at);
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const tl = loadTimeline(path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json'));
  const sound = {version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 계산·고침의 물결, 토큰이 붙는 순간, 숫자와 표시의 순간을 화면과 같은 시각에 냅니다. 모든 사건은 `node episodes/ai-learning/scenes.mjs --emit-sound`가 장면과 같은 계획(plan)에서 씁니다. 기본음 700 Hz 미만, 배경음악 없음.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(path.join(HERE, 'sound.json'), JSON.stringify(sound, null, 2) + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; passes ${P.passes.length} (f ${P.passes.filter(x => x.dir === 'f').length}, b ${P.backs.length}); appends ${P.appends.length}; poster ${P.poster.toFixed(2)} s`);
}
