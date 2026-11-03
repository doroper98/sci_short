// Episode scenes — "한 칸에 열 배 — 지진 규모·데시벨·pH와 로그"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - ONE idea drives every scene: a 곱하기 자 (log ruler) where one step = ×10. Picture, readouts and sound.json all
//    read the same pure functions below (ampRatio, intensityRatio, hRatio, stepPitch …) and the same time plan(tl).
//  - Quake: Richter-style amplitude reading (+1 magnitude = ×10 seismograph amplitude, energy ×10^1.5 ≈ 31.6).
//    The trace shape is a fixed, made-up burst; only its height scales. The vertical axis zooms out ×10 per step.
//  - Sound: +10 dB = ×10 intensity; perceived loudness ≈ ×2 per +10 dB (rule of thumb) → 30 dB ≈ ×8.
//  - pH: −1 pH = ×10 H⁺. Dot counts in the pH boxes are exact powers of ten (1 / 10 / 100), not a simulation.
//  - Ant 3 mg vs elephant 6 t → 2×10⁹ ("약 20억 배"). Linear 0–120 dB contrast: 1 mm × 10¹² = 10⁶ km ≈ 2.6 × Moon distance.
//  - 수모형 (base-ten blocks) are drawn with exact unit counts: 1 / 10 / 100 / 1000 cubes.
//  - Sound mapping kept for the whole episode: each ×10 step = a perfect fourth (×4/3) up from 130.8 Hz; 더하기 자 steps are
//    identical ticks. Levels are compressed (seismograph scratch +2 dB per magnitude, dB tone +2 dB per 10 dB).
//      node episodes/log-scale/scenes.mjs --emit-sound [--timeline outputs/log-scale/narration/timeline.json]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, rand, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const STEP = 10;
export const lg = Math.log10;
export const ANT_MG = 3, ELEPHANT_MG = 6e9;                         // 약 3 mg, 약 6 t
export const ANT_RATIO = ELEPHANT_MG / ANT_MG;                      // 2×10⁹ → "약 20억 배"
export const ampRatio = dM => STEP ** dM;                           // seismograph amplitude
export const energyRatio = dM => 10 ** (1.5 * dM);                  // ≈ 31.6 per magnitude
export const intensityRatio = dDb => 10 ** (dDb / 10);
export const loudRatio = dDb => 2 ** (dDb / 10);                    // perceived loudness, rule of thumb
export const hRatio = dPh => 10 ** dPh;                             // H⁺ for a pH drop of dPh
export const DB = {quiet: 0, whisper: 30, talk: 60, thunder: 120};
export const PH = {water: 7, vinegar: 3};
export const MOON_KM = 384400;
export const LINEAR_KM = 1e-6 * intensityRatio(DB.thunder - DB.quiet);   // 1 mm per 0-dB unit → km
// sound mappings (one per quantity, kept for the whole episode)
export const STEP_F0 = 130.81, STEP_RATIO = 4 / 3;                  // ×10 = one perfect fourth
export const stepPitch = k => STEP_F0 * STEP_RATIO ** k;
export const ADD_TICK_HZ = 1100;                                    // 더하기 자: identical ticks
export const DB_TONE_HZ = 392;
export const dbGain = db => -33 + 0.2 * (db - 30);                  // +10 dB → +2 dB (compressed)
export const scratchGain = M => -29 + 2 * (M - 3);                  // +1 magnitude (×10 amplitude) → +2 dB (compressed)
const fmtInt = x => Math.round(x).toLocaleString('en-US');

/** fixed seismogram burst shape, |w| ≤ 1 (deterministic) */
const BURST = (() => {
  const N = 360, w = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, env = u < 0.1 ? smooth(u / 0.1) * 0.35 : u < 0.22 ? 0.35 : u < 0.3 ? lerp(0.35, 1, smooth((u - 0.22) / 0.08)) : Math.exp(-(u - 0.3) * 3.4);
    const v = 0.6 * Math.sin(u * TAU * 11.3) + 0.3 * Math.sin(u * TAU * 17.9 + 1.3) + 0.12 * (rand(i * 3.1) - 0.5) * 2;
    w.push(env * v);
  }
  const m = Math.max(...w.map(Math.abs));
  return w.map(v => v / m);
})();
export const burstAt = u => { const x = clamp(u) * (BURST.length - 1), i = Math.floor(x), f = x - i; return lerp(BURST[i], BURST[Math.min(i + 1, BURST.length - 1)], f); };
export const burstEnv = u => (u < 0.1 ? smooth(u / 0.1) * 0.35 : u < 0.22 ? 0.35 : u < 0.3 ? lerp(0.35, 1, smooth((u - 0.22) / 0.08)) : Math.exp(-(u - 0.3) * 3.4));

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  quake: W('s01', '지진'), db: W('s01', '데시벨'), ph: W('s01', '피에이치가'), step: W('s01', '한 칸에'), ten: W('s01', '열 배씩'),
  m6: W('s02', '규모 육'), m3: W('s02', '규모 삼'), guess: W('s02', '두 배'), no: W('s02', '아닙니다'), seis: W('s02', '지진계에'), thousand: W('s02', '천 배나'),
  first: W('s03', '먼저'), oneStep: W('s03', '한 칸'), plus1: W('s03', '일씩'), addRuler: W('s03', '더하기 자'),
  thisRuler: W('s04', '이 자에'), ant: W('s04', '개미의'), eleph: W('s04', '코끼리의'), together: W('s04', '함께'), antW: W('s04', '개미는'), invisible: W('s04', '보이지'),
  tenx: W('s05', '열 배씩'), mult: W('s05', '곱해지는'), mulRuler: W('s05', '곱하기 자를'), n1: W('s05', '일,'), n10: W('s05', '십,'), n100: W('s05', '백,'), n1000: W('s05', '천이'), equal: W('s05', '같은 간격'),
  tick: W('s06', '눈금은'), zeros: W('s06', '영의 개수'), same: W('s06', '같습니다'), hundred: W('s06', '백은'), twoZeros: W('s06', '영이 두'), second: W('s06', '두 번째'), thousandW: W('s06', '천은'), third: W('s06', '세 번째'),
  howMany: W('s07', '몇 번'), count: W('s07', '세는'), log: W('s07', '로그라고'), ratio: W('s07', '비율의'), greek: W('s07', '그리스어에서'),
  qSeis: W('s08', '지진계에'), qRuler: W('s08', '이 자로'), plusOne: W('s08', '일 커지면'), tenTimes: W('s08', '열 배가'),
  from3: W('s09', '삼에서'), to6: W('s09', '육까지는'), three: W('s09', '세 칸이라'), ten3: W('s09', '십을'), q1000: W('s09', '천 배입니다'), energy: W('s09', '에너지는'), e32: W('s09', '서른두'),
  bel: W('s10', '벨은'), phone: W('s10', '전화를'), deci: W('s10', '데시는'), tenth: W('s10', '십분의'), came: W('s10', '왔습니다'),
  tenDb: W('s11', '십데시벨'), up: W('s11', '오를'), x10: W('s11', '열 배가'), whisper: W('s11', '속삭임이'), w30: W('s11', '삼십'), talk: W('s11', '대화가'), t60: W('s11', '육십데시벨이니'), talk2: W('s11', '대화는'), d1000: W('s11', '천 배입니다'),
  eight: W('s12', '여덟'), loud: W('s12', '크게'), ear: W('s12', '귀도'), mulLike: W('s12', '곱하기 자처럼'),
  phW: W('s13', '피에이치는'), acid: W('s13', '산성의'), seven: W('s13', '칠이'), smaller: W('s13', '작아질'), grain: W('s13', '작은 알갱이가'), hx10: W('s13', '열 배'),
  water: W('s14', '물은'), vinegar: W('s14', '식초는'), v3: W('s14', '삼이니'), vinegar2: W('s14', '식초에는'), man: W('s14', '만 배'),
  thanks: W('s15', '덕분에'), onePic: W('s15', '한 그림에'), quiet: W('s15', '들릴락'), thunder: W('s15', '천둥소리는'), trillion: W('s15', '일조'), dbW: W('s15', '데시벨로는'), w120: W('s15', '백이십까지'),
  myth: W('s16', '흔한'), num: W('s16', '숫자가'), threeX: W('s16', '세 배가'), notW: W('s16', '아니라'), mTen: W('s16', '십을'), mThree: W('s16', '세 번'), mMult: W('s16', '곱한'), m1000: W('s16', '천 배입니다'),
  cStep: W('s17', '한 칸에'), cMul: W('s17', '곱하기 자'), cLog: W('s17', '로그입니다'), cQuake: W('s17', '지진도'), cSound: W('s17', '소리도'), cAcid: W('s17', '산성도'), glance: W('s17', '한눈에'),
};

// =====================================================================================================
// Time plan: every reveal / step / zoom, in absolute seconds (picture and sound read the same numbers)
// =====================================================================================================
const PLANS = new WeakMap();
/** z(t) for the s04 zoom-out: decades of "한 칸 = 10^z mg", eased 0 → 9 */
const ZOOM_DEC = 9;
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  const at = r => tl.at(r), sc = id => tl.scene(id);
  P = {};
  // hook
  const st = at(A.step);
  P.hook = {badges: [at(A.quake), at(A.db), at(A.ph)], mini: [st, st + 0.45, st + 0.9, st + 1.35],
    stripsIn: at('s02') - 0.35, m3: [at(A.m3) + 0.05, at(A.m3) + 1.15], guess: [at(A.guess), at(A.guess) + 0.85], no: at(A.no),
    m6: [at(A.seis) + 0.1, at(A.thousand) - 0.15], grow: [at(A.thousand) - 0.05, at(A.thousand) + 1.45], thousand: at(A.thousand)};
  { const [g0, g1] = P.hook.grow; P.hook.growDec = [1, 2].map(k => { let lo = g0, hi = g1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (3 * easeInOut((m - g0) / (g1 - g0)) < k) lo = m; else hi = m; } return (lo + hi) / 2; }).concat([g1]); }
  // ruler
  const h0 = at(A.oneStep);
  P.ruler = {hops: Array.from({length: 10}, (_, i) => h0 + i * 0.27), addLabel: at(A.addRuler),
    unit: at(A.thisRuler) - 0.1, ant: [at(A.ant), at(A.ant) + 0.6], eleph: [at(A.eleph), at(A.eleph) + 1.0],
    zoom: [at(A.together) - 0.05, at(A.together) + 1.85], antGone: at(A.antW), ratio: at(A.invisible),
    morph: [at(A.tenx), at(A.mulRuler) + 0.2], fit: at(A.mulRuler) + 0.2, lift: [at(A.mulRuler) + 0.75, at(A.mulRuler) + 1.55],
    nums: [at(A.n1), at(A.n10), at(A.n100), at(A.n1000)], equal: at(A.equal)};
  const [z0, z1] = P.ruler.zoom;
  P.ruler.zoomZ = t => ZOOM_DEC * easeInOut((t - z0) / (z1 - z0));
  P.ruler.decades = [];
  for (let k = 1; k <= ZOOM_DEC; k++) { let lo = z0, hi = z1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (P.ruler.zoomZ(m) < k) lo = m; else hi = m; } P.ruler.decades.push((lo + hi) / 2); }
  // essence
  const zt = at(A.zeros);
  P.essence = {glowZeros: zt, digits: [zt - 0.1, zt + 0.75, at(A.second), at(A.third)], heading: at(A.same) + 0.15,
    drops: [[], [zt + 0.3], [at(A.twoZeros), at(A.twoZeros) + 0.3], [at(A.thousandW) + 0.05, at(A.thousandW) + 0.27, at(A.thousandW) + 0.49]],
    eq: at('s07') - 0.2, tens: [at(A.howMany) + 0.1, at(A.howMany) + 0.45, at(A.howMany) + 0.8], times3: at(A.count), log: at(A.log), card: at(A.ratio), napier: at(A.greek)};
  P.essence.FALL = 0.45;
  // quake
  P.quake = {bursts: [[at(A.qSeis) + 0.05, at(A.qSeis) + 1.55], [at(A.plusOne), at(A.plusOne) + 1.3], [at(A.three) - 0.55, at(A.three) + 0.35], [at(A.ten3) - 0.1, at(A.ten3) + 0.8]],
    zooms: [[at(A.tenTimes) - 0.1, at(A.tenTimes) + 0.8], [at(A.three) + 0.2, at(A.three) + 1.0], [at(A.ten3) + 0.7, at(A.ten3) + 1.5]],
    dial: at(A.qRuler), from3: at(A.from3), to6: at(A.to6), span: at(A.three), result: at(A.q1000), energy: at(A.energy)};
  const Q = P.quake;
  Q.view = t => Q.zooms.reduce((v, [a, b]) => v + easeInOut((t - a) / (b - a)), 0);   // decades zoomed out
  // sound
  const d2 = at(A.talk2);
  P.sound = {bel: at(A.bel), phone: at(A.phone), deci: at(A.deci), tenth: at(A.tenth), came: at(A.came),
    rulerIn: at('s11') - 0.5, demo: [at(A.tenDb), at(A.up)], demoX10: at(A.x10), whisper: at(A.whisper), w30: at(A.w30), talk: at(A.talk), t60: at(A.t60),
    // three ×10 hops spaced 0.8 s apart, landing just before "천 배" (user: the steps used to flash past in 1.2 s)
    steps: (b => [b - 0.6, b + 0.2, b + 1.0, b + 1.8])(at(A.t60) + 0.4), d1000: at(A.d1000),
    feel: [at(A.eight) - 0.1, at(A.eight) + 0.2, at(A.eight) + 0.5, at(A.eight) + 0.8], loud: at(A.loud), ear: at(A.ear), twos: [at(A.mulLike), at(A.mulLike) + 0.3, at(A.mulLike) + 0.6]};
  // pH
  const sm = at(A.smaller);
  P.ph = {acid: at(A.acid), seven: at(A.seven), boxes: [sm - 0.2, sm + 0.5, sm + 1.2], legend: at(A.grain), x10: [at(A.hx10), at(A.hx10) + 0.3],
    water: at(A.water), vinegar: at(A.vinegar), arcs: [at(A.v3), at(A.v3) + 0.3, at(A.v3) + 0.6, at(A.v3) + 0.9], blocks: at(A.vinegar2), product: at(A.vinegar2) + 0.8, man: at(A.man)};
  // wide
  const w0 = at(A.thanks);
  P.wide = {ticks: Array.from({length: 13}, (_, i) => w0 + i * 0.3), quiet: at(A.quiet), thunder: at(A.thunder), trillion: at(A.trillion),
    linear: at(A.trillion) + 0.7, ends: at(A.dbW)};
  // myth
  P.myth = {ruler: at(A.num), threeX: at(A.threeX), cross: at(A.notW), arcs: [at(A.mTen), at(A.mThree), at(A.mMult)], result: at(A.m1000)};
  // close
  P.close = {card: sc('close').start + 0.15, mul: at(A.cMul), rows: [at(A.cQuake), at(A.cSound), at(A.cAcid)], glance: at(A.glance)};
  PLANS.set(tl, P);
  return P;
}

// =====================================================================================================
// UI helpers
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
const endFade = (t, ctx, d = 0.5) => fadeOut(t, ctx.scene.end - d - 0.05, d);
const evT = (ctx, id, fallback) => (ctx.events.has(id) ? ctx.events.get(id).time : fallback);
const PL = ctx => plan(ctx.tl);
const PAL = {block: '#D8C49B', blockTop: '#F0E3C4', blockSide: '#A48E66', blockGrid: '#6B5638', mark: '#FFD27A', cool: '#8FD0EF',
  quake: '#E9A46A', sound: '#8FD0EF', acid: '#F08A6B', ant: '#C9A27A', eleph: '#9FB0B6', ink2: '#CFC4B6', paper: '#E9E1D2', trace: '#2B2A33'};
function panel(c, T, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 12, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function crossOut(c, x0, x1, y, q, col = '#FF8A5C') { if (q > 0) line(c, [[x0 - 8, y + 2], [lerp(x0 - 8, x1 + 8, easeOut(q)), y + 2]], rgba(col, 0.95), 5); }
const txt = (stage, s, x, y, o = {}) => stage.text(s, x, y, {align: 'center', ...o});
const big = (stage, s, x, y, size, col, o = {}) => stage.text(s, x, y, {role: 'display', weight: 700, size, color: col, align: 'center', ...o});

/** curved hop arrow from xa to xb over baseline y (height h); q = draw progress; label at the top */
function hop(stage, xa, xb, y, h, col, q, label = '', o = {}) {
  if (q <= 0) return;
  const {ctx: c} = stage, n = 28, pts = [];
  for (let i = 0; i <= n * clamp(q); i++) { const u = i / n; pts.push([lerp(xa, xb, u), y - h * Math.sin(Math.PI * u)]); }
  if (pts.length > 1) line(c, pts, rgba(col, o.alpha ?? 0.95), o.w ?? 3);
  if (q > 0.85 && pts.length > 2) { const [px, py] = pts[pts.length - 2], [ex, ey] = pts[pts.length - 1]; arrow(c, [px, py], [ex + (ex - px) * 0.01, ey + (ey - py) * 0.01], rgba(col, o.alpha ?? 0.95), 3, {head: 12}); }
  if (label) stage.text(label, (xa + xb) / 2, y - h - (o.labelGap ?? 20), {size: o.size ?? 26, weight: 700, color: col, align: 'center', alpha: smooth((q - 0.4) / 0.4) * (o.alpha ?? 1)});
}

// =====================================================================================================
// 수모형 (base-ten blocks): exact unit counts, oblique (cabinet) projection, (x, yb) = centre-bottom of the whole drawing
// =====================================================================================================
const BLOCK_DIMS = {1: [1, 1, 1], 10: [1, 10, 1], 100: [10, 10, 1], 1000: [10, 10, 10]};   // [cols, rows, depth]
export function blockSize(n, u) { const [cl, rw, dp] = BLOCK_DIMS[n], k = dp * u * 0.36; return {w: cl * u + k, h: rw * u + k, k}; }
function blocks(c, n, x, yb, u, o = {}) {
  const [cl, rw, dp] = BLOCK_DIMS[n], k = dp * u * 0.36, w = cl * u, h = rw * u;
  const x0 = x - (w + k) / 2, y0 = yb - h;                            // front face top-left
  const dpx = k / dp, a = o.a ?? 1;
  if (a <= 0) return;
  withAlpha(c, a, () => {
    const front = o.col || PAL.block, top = o.top || PAL.blockTop, side = o.side || PAL.blockSide, grid = rgba(PAL.blockGrid, 0.7);
    if (o.glow) glow(c, x, yb - (h + k) / 2, Math.max(w, h) * 1.1, PAL.mark, 0.22 * o.glow);
    poly(c, [[x0, y0], [x0 + w, y0], [x0 + w + k, y0 - k], [x0 + k, y0 - k]], top);
    poly(c, [[x0 + w, y0], [x0 + w + k, y0 - k], [x0 + w + k, yb - k], [x0 + w, yb]], side);
    rect(c, x0, y0, w, h, 0, front);
    const lw = u >= 9 ? 1.2 : 0.9;
    c.beginPath();
    for (let i = 1; i < cl; i++) { c.moveTo(x0 + i * u, yb); c.lineTo(x0 + i * u, y0); c.lineTo(x0 + i * u + k, y0 - k); }   // front verticals + top
    for (let j = 1; j < rw; j++) { c.moveTo(x0, y0 + j * u); c.lineTo(x0 + w, y0 + j * u); c.lineTo(x0 + w + k, y0 + j * u - k); }   // front rows + side
    for (let d = 1; d < dp; d++) { const ox = d * dpx; c.moveTo(x0 + ox, y0 - ox); c.lineTo(x0 + w + ox, y0 - ox); c.lineTo(x0 + w + ox, yb - ox); }   // depth layers
    c.strokeStyle = grid; c.lineWidth = lw; c.stroke();
    const edge = rgba(PAL.blockGrid, 0.95);
    poly(c, [[x0, yb], [x0, y0], [x0 + k, y0 - k], [x0 + w + k, y0 - k], [x0 + w + k, yb - k], [x0 + w, yb]], null, edge, 1.6);
    line(c, [[x0, y0], [x0 + w, y0], [x0 + w + k, y0 - k]], edge, 1.4); line(c, [[x0 + w, y0], [x0 + w, yb]], edge, 1.4);
  });
}
export const BLOCK_NAME = {1: '낱개', 10: '십모형', 100: '백모형', 1000: '천모형'};

// =====================================================================================================
// Line-drawn icons (no faces, no mascots)
// =====================================================================================================
function antIcon(c, x, y, L, a = 1, col = PAL.ant) {     // (x, y) = centre; L = body length
  withAlpha(c, a, () => {
    const s = L / 2.6;
    for (const k of [-1, 0, 1]) {                         // legs from the thorax
      const bx = x + k * 0.22 * s;
      line(c, [[bx, y], [bx + k * 0.35 * s - 0.15 * s, y - 0.55 * s], [bx + k * 0.6 * s - 0.3 * s, y - 0.75 * s]], col, Math.max(1.2, s * 0.09));
      line(c, [[bx, y], [bx + k * 0.35 * s - 0.15 * s, y + 0.55 * s], [bx + k * 0.6 * s - 0.3 * s, y + 0.75 * s]], col, Math.max(1.2, s * 0.09));
    }
    c.save(); c.fillStyle = col;
    for (const [dx, rx, ry] of [[-0.95, 0.55, 0.38], [0, 0.34, 0.22], [0.75, 0.3, 0.26]]) { c.beginPath(); c.ellipse(x + dx * s, y, rx * s, ry * s, 0, 0, TAU); c.fill(); }
    c.restore();
    line(c, [[x + 0.95 * s, y - 0.12 * s], [x + 1.3 * s, y - 0.5 * s], [x + 1.55 * s, y - 0.45 * s]], col, Math.max(1, s * 0.07));
    line(c, [[x + 0.95 * s, y + 0.1 * s], [x + 1.32 * s, y + 0.42 * s], [x + 1.58 * s, y + 0.36 * s]], col, Math.max(1, s * 0.07));
  });
}
function elephantIcon(c, x, y, s, a = 1, col = PAL.eleph) {   // (x, y) = centre-bottom (feet); width ≈ 2.7 s
  withAlpha(c, a, () => {
    c.save(); c.fillStyle = col;
    for (const lx of [-0.62, -0.3, 0.2, 0.5]) rect(c, x + lx * s, y - 0.75 * s, 0.24 * s, 0.75 * s, 0.05 * s, col);
    c.beginPath(); c.ellipse(x - 0.05 * s, y - 1.05 * s, 0.85 * s, 0.55 * s, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(x + 0.85 * s, y - 1.25 * s, 0.38 * s, 0.4 * s, 0, 0, TAU); c.fill();
    c.restore();
    c.save(); c.fillStyle = mix(col, '#000000', 0.18); c.beginPath(); c.ellipse(x + 0.68 * s, y - 1.22 * s, 0.24 * s, 0.34 * s, -0.15, 0, TAU); c.fill(); c.restore();
    const tr = [[x + 1.12 * s, y - 1.2 * s], [x + 1.3 * s, y - 0.8 * s], [x + 1.28 * s, y - 0.35 * s], [x + 1.4 * s, y - 0.2 * s]];
    line(c, tr, col, 0.2 * s);
    line(c, [[x - 0.88 * s, y - 1.2 * s], [x - 1.05 * s, y - 0.75 * s]], col, 0.06 * s);
  });
}
function speakerIcon(c, x, y, s, n, a = 1, col = '#D9E3E6') {   // a speaker cone with n sound arcs (n = 0..3)
  withAlpha(c, a, () => {
    poly(c, [[x - 0.9 * s, y - 0.3 * s], [x - 0.5 * s, y - 0.3 * s], [x - 0.05 * s, y - 0.7 * s], [x - 0.05 * s, y + 0.7 * s], [x - 0.5 * s, y + 0.3 * s], [x - 0.9 * s, y + 0.3 * s]], null, col, 2.4);
    for (let i = 0; i < n; i++) ring(c, x - 0.05 * s, y, (0.45 + 0.35 * i) * s, rgba(col, 0.95 - 0.15 * i), 2.4, -0.75, 0.75);
  });
}
function bubbleIcon(c, x, y, s, n, a = 1, col = '#D9E3E6', dashed = false) {   // speech bubble with n sound arcs inside
  withAlpha(c, a, () => {
    c.save(); if (dashed) c.setLineDash([6, 5]);
    c.beginPath(); c.roundRect(x - s, y - 0.62 * s, 2 * s, 1.24 * s, 0.4 * s); c.moveTo(x - 0.35 * s, y + 0.62 * s); c.lineTo(x - 0.6 * s, y + 1.0 * s); c.lineTo(x - 0.05 * s, y + 0.62 * s);
    c.strokeStyle = col; c.lineWidth = 2.4; c.stroke(); c.restore();
    for (let i = 0; i < n; i++) ring(c, x - 0.45 * s, y, (0.3 + 0.28 * i) * s, rgba(col, 0.9 - 0.12 * i), 2.2, -0.8, 0.8);
  });
}
function phoneIcon(c, x, y, s, a = 1, col = '#D9E3E6') {   // candlestick telephone, (x, y) = base centre
  withAlpha(c, a, () => {
    c.save(); c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); c.ellipse(x, y, 0.55 * s, 0.14 * s, 0, 0, TAU); c.stroke(); c.restore();
    line(c, [[x, y - 0.12 * s], [x, y - 1.55 * s]], col, 3);
    poly(c, [[x - 0.32 * s, y - 1.95 * s], [x + 0.32 * s, y - 1.95 * s], [x + 0.12 * s, y - 1.6 * s], [x - 0.12 * s, y - 1.6 * s]], null, col, 2.4);
    line(c, [[x + 0.05 * s, y - 1.2 * s], [x + 0.45 * s, y - 1.2 * s]], col, 2.4);
    poly(c, [[x + 0.42 * s, y - 1.38 * s], [x + 0.62 * s, y - 1.38 * s], [x + 0.58 * s, y - 0.8 * s], [x + 0.46 * s, y - 0.8 * s]], null, col, 2.2);
    line(c, [[x + 0.52 * s, y - 0.8 * s], [x + 0.75 * s, y - 0.45 * s], [x + 0.55 * s, y - 0.1 * s]], rgba(col, 0.7), 1.8);
  });
}
function glassIcon(c, x, y, s, a = 1) {   // (x, y) = bottom centre
  withAlpha(c, a, () => {
    const g = [[x - 0.5 * s, y - 1.5 * s], [x + 0.5 * s, y - 1.5 * s], [x + 0.38 * s, y], [x - 0.38 * s, y]];
    poly(c, [[x - 0.45 * s, y - 1.1 * s], [x + 0.45 * s, y - 1.1 * s], [x + 0.38 * s, y], [x - 0.38 * s, y]], rgba('#6FB6D8', 0.55));
    poly(c, g, null, '#D9E3E6', 2.4);
  });
}
function bottleIcon(c, x, y, s, a = 1) {
  withAlpha(c, a, () => {
    const b = [[x - 0.45 * s, y], [x - 0.45 * s, y - 1.1 * s], [x - 0.16 * s, y - 1.45 * s], [x - 0.16 * s, y - 1.9 * s], [x + 0.16 * s, y - 1.9 * s], [x + 0.16 * s, y - 1.45 * s], [x + 0.45 * s, y - 1.1 * s], [x + 0.45 * s, y]];
    poly(c, [[x - 0.45 * s, y], [x - 0.45 * s, y - 0.95 * s], [x + 0.45 * s, y - 0.95 * s], [x + 0.45 * s, y]], rgba('#D9A55A', 0.6));
    rect(c, x - 0.45 * s, y - 0.75 * s, 0.9 * s, 0.4 * s, 0, rgba('#EFE3D4', 0.75));
    poly(c, b, null, '#D9E3E6', 2.4);
  });
}
function cloudIcon(c, x, y, s, a = 1, flash = 0) {   // thunder cloud with a bolt; (x, y) = cloud centre
  withAlpha(c, a, () => {
    c.save(); c.fillStyle = '#7F8E96';
    for (const [dx, dy, r] of [[-0.55, 0.1, 0.42], [0, -0.15, 0.55], [0.55, 0.08, 0.42], [0.2, 0.22, 0.4], [-0.25, 0.25, 0.38]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, TAU); c.fill(); }
    c.restore();
    poly(c, [[x + 0.05 * s, y + 0.45 * s], [x - 0.18 * s, y + 1.0 * s], [x + 0.02 * s, y + 0.98 * s], [x - 0.12 * s, y + 1.45 * s], [x + 0.25 * s, y + 0.82 * s], [x + 0.05 * s, y + 0.84 * s], [x + 0.2 * s, y + 0.45 * s]], mix('#FFE2A0', '#FFFFFF', flash));
  });
}
function wiggleIcon(c, x, y, w, h, a = 1, col = PAL.quake) {
  withAlpha(c, a, () => { const pts = []; for (let i = 0; i <= 60; i++) { const u = i / 60; pts.push([x - w / 2 + u * w, y - h / 2 * burstAt(0.12 + u * 0.6)]); } line(c, pts, col, 2.4); });
}
function dropIcon(c, x, y, s, a = 1, col = PAL.acid) {
  withAlpha(c, a, () => { c.beginPath(); c.moveTo(x, y - 1.2 * s); c.bezierCurveTo(x + 0.4 * s, y - 0.6 * s, x + 0.75 * s, y - 0.2 * s, x + 0.75 * s, y + 0.25 * s); c.arc(x, y + 0.25 * s, 0.75 * s, 0, Math.PI); c.bezierCurveTo(x - 0.75 * s, y - 0.2 * s, x - 0.4 * s, y - 0.6 * s, x, y - 1.2 * s); c.strokeStyle = col; c.lineWidth = 2.6; c.stroke(); });
}

// =====================================================================================================
// Header (centred)
// =====================================================================================================
function head(stage, kicker, title, aK, aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 940}));
}
export const titles = {
  hook: ['오늘의 주제 · 한 칸에 열 배', '로그, 곱하기 자'],
  ruler: ['배경 · 보통의 자', '한 칸에 1씩 더하는 자'],
  essence: ['본질 · 눈금 읽기', '눈금 = 0의 개수'],
  quake: ['메커니즘 ① 지진 규모', '한 칸에 흔들림 10배'],
  sound: ['메커니즘 ② 데시벨', '데시 + 벨'],
  ph: ['메커니즘 ③ pH', '한 칸에 알갱이 10배'],
  wide: ['현상 · 한 그림에', '아주 작은 것부터 아주 큰 것까지'],
  myth: ['오해 바로잡기', '흔한 오해 하나'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'ruler') return [[-Infinity, ...titles.ruler], [at('s05') - 0.2, '배경 · 곱하기 자', '한 칸에 10배 곱하는 자']];
  if (id === 'essence') return [[-Infinity, ...titles.essence], [at('s07') - 0.3, '본질 · 이름', '몇 번 곱했나 = 로그']];
  if (id === 'sound') return [[-Infinity, ...titles.sound], [at('s11') - 0.5, '메커니즘 ② 데시벨', '10 dB 오르면 세기 10배'], [at('s12') - 0.4, '메커니즘 ② 데시벨', '귀도 곱하기 자로 듣는다']];
  if (id === 'ph') return [[-Infinity, ...titles.ph], [at('s14') - 0.4, '사례 · 물과 식초', '네 칸 차이 = 만 배']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}

let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const want = soundEvents(ctx.tl), have = new Map(ctx.events.map(e => [e.id, e]));
  const bad = want.filter(e => { const h = have.get(e.id); return !h || Math.abs(h.time - ctx.tl.at(e.at)) > 1e-3 || JSON.stringify(h.params || {}) !== JSON.stringify(e.params || {}); });
  if (bad.length) console.warn(`warning: sound.json is stale (${bad.length} events differ, e.g. ${bad[0].id}) — run node episodes/log-scale/scenes.mjs --emit-sound`);
}

// =====================================================================================================
// Scene parts
// =====================================================================================================
/** one seismogram drawn by a pen up to uEnd (0..1) across x0..x1, centred on yc, peak A px */
function trace(c, x0, x1, yc, A, uEnd, col, w = 2.4, n = 220) {
  const m = Math.round(n * clamp(uEnd)), pts = [];
  for (let i = 0; i <= m; i++) { const u = i / n; pts.push([lerp(x0, x1, u), yc - A * burstAt(u)]); }
  if (pts.length > 1) line(c, pts, col, w);
  return pts[pts.length - 1];
}
function penTip(c, p, a = 1) { if (p) withAlpha(c, a, () => { line(c, [[p[0], p[1]], [p[0] + 26, p[1] - 34]], rgba('#D9E3E6', 0.8), 3); circle(c, p[0], p[1], 5, PAL.mark); }); }
function gridPaper(c, T, x, y, w, h, step = 40) {
  panel(c, T, x, y, w, h, 0.92);
  c.save(); c.beginPath(); for (let yy = y + step; yy < y + h - 4; yy += step) { c.moveTo(x + 8, yy); c.lineTo(x + w - 8, yy); }
  c.strokeStyle = rgba(T.border, 0.7); c.lineWidth = 1; c.stroke(); c.restore();
}
function plateText(stage, s, x, y, o = {}) {
  const size = o.size || 28, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role});
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.alpha ?? 1, () => {
    rect(stage.ctx, x0 - 12, y - size * 0.75, w + 24, size * 1.5, 8, rgba(stage.theme.deep, 0.88), o.border ? rgba(o.border, 0.9) : null, 1.5);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
}

// ---- ruler scene geometry ----
const RX0 = 200, RX1 = 880, RU = (RX1 - RX0) / 10, RY = 1000, RY_UP = 600;
const MX = [195, 418, 642, 865], MY = 1092, MU = 12;
const unitName = k => ['1 mg', '10 mg', '100 mg', '1 g', '10 g', '100 g', '1 kg', '10 kg', '100 kg', '1 t', '10 t'][clamp(k, 0, 10)];
function hBar(c, x0, len, y, h, col, a = 1) {
  if (a <= 0 || len <= 0) return;
  withAlpha(c, a, () => {
    const end = x0 + len;
    if (end <= 1010) { rect(c, x0, y - h / 2, Math.max(1.5, len), h, Math.min(5, len / 2), col); return; }
    rect(c, x0, y - h / 2, 1010 - x0, h, 0, col);
    const g = c.createLinearGradient(1010, 0, 1080, 0); g.addColorStop(0, col); g.addColorStop(1, rgba(col, 0));
    rect(c, 1010, y - h / 2, 70, h, 0, g);
  });
}

/** The weight ruler of s03–s05: same 11 ticks; linear (z = decades per 칸) morphing into the 곱하기 자 (q). */
function weightRuler(stage, t, ctx, o) {
  const {ctx: c} = stage, T = stage.theme, P = PL(ctx).ruler, y = o.y, q = o.q;
  const z = P.zoomZ(t);
  withAlpha(c, o.a, () => {
    line(c, [[RX0 - 24, y], [RX1 + 24, y]], rgba(T.ink, 0.85), 3);
    for (let k = 0; k <= 10; k++) {
      const x = RX0 + k * RU;
      line(c, [[x, y - 12], [x, y + 12]], rgba(T.ink, 0.9), k % 5 === 0 ? 3 : 2);
      if (q < 0.5) txt(stage, String(k), x, y + 38, {size: 30, weight: 500, color: T.ink, alpha: 1 - smooth(q / 0.4)});
      if (q > 0.5 && k % 3 === 0 && k < 10) txt(stage, unitName(k), x, y + 38, {size: 26, weight: 700, color: PAL.mark, alpha: smooth((q - 0.6) / 0.4)});
    }
    // rows: ant and elephant (bar lengths in 칸)
    const linAnt = ANT_MG / 10 ** z, linEle = ELEPHANT_MG / 10 ** z;
    const lenAnt = lerp(linAnt, lg(ANT_MG), easeInOut(q)), lenEle = lerp(linEle, lg(ELEPHANT_MG), easeInOut(q));
    const aAnt = o.ant, aEle = o.eleph, yA = y - 200, yE = y - 88;
    withAlpha(c, aAnt, () => {
      antIcon(c, 148, yA, 46, 1);
      stage.text('개미 · 약 3 mg', RX0, yA - 40, {size: 30, weight: 700, color: PAL.ant});
      hBar(c, RX0, lenAnt * RU * o.antGrow, yA, 22, PAL.ant);
    });
    withAlpha(c, aEle, () => {
      elephantIcon(c, 140, yE + 26, 30, 1);
      stage.text('코끼리 · 약 6 t', RX0, yE - 46, {size: 30, weight: 700, color: PAL.eleph});
      const len = lenEle * RU * o.eleGrow;
      hBar(c, RX0, len, yE, 22, PAL.eleph);
      if (RX0 + len > 1000) txt(stage, '화면 밖으로 →', 930, yE - 46, {size: 26, weight: 700, color: T.muted, align: 'right', alpha: smooth((RX0 + len - 1000) / 80)});
    });
    if (o.fit > 0) for (const [len, yy] of [[lenAnt, yA], [lenEle, yE]]) ring(c, RX0 + len * RU, yy, 22 + 10 * (1 - o.fit), rgba(PAL.mark, o.fit), 3);
    if (q > 0) for (let k = 0; k < 10; k++) hop(stage, RX0 + k * RU + 6, RX0 + (k + 1) * RU - 6, y - 16, 16, PAL.mark, clamp(q * 1.6 - k * 0.06), '', {w: 2, alpha: 0.75});
  });
  return {z};
}

/** 수모형 ruler 1 · 10 · 100 · 1000 */
function blockRuler(stage, t, P, y, a, o = {}) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    line(c, [[MX[0] - 40, y], [MX[3] + 40, y]], rgba(T.ink, 0.85 * fadeIn(t, P.nums[0] - 0.5, 0.4)), 3);
    [1, 10, 100, 1000].forEach((n, i) => {
      const s = fadeIn(t, P.nums[i] - 0.1, 0.4), x = MX[i];
      withAlpha(c, s, () => {
        line(c, [[x, y - 14], [x, y + 14]], T.ink, 3);
        big(stage, String(n), x, y + 48, 52, T.ink);
        txt(stage, BLOCK_NAME[n], x, y + 96, {size: 26, weight: 500, color: T.muted});
        blocks(c, n, x, y - 18, MU, {a: o.blockA ?? 1, glow: (o.glow ?? 0) * (i === 3 ? 1 : 0)});
      });
      if (i) hop(stage, MX[i - 1] + 24, x - 24, y - 215, 42, PAL.mark, (t - P.nums[i] + 0.35) / 0.45, '×10');
    });
    const eq = fadeIn(t, P.equal - 0.05, 0.5);
    if (eq > 0 && o.equal !== false) withAlpha(c, eq, () => {
      for (let i = 0; i < 3; i++) {
        const xa = MX[i] + 8, xb = MX[i + 1] - 8, yy = y + 138;
        line(c, [[xa, yy], [xb, yy]], rgba(PAL.mark, 0.85), 2); line(c, [[xa, yy - 9], [xa, yy + 9]], rgba(PAL.mark, 0.85), 2); line(c, [[xb, yy - 9], [xb, yy + 9]], rgba(PAL.mark, 0.85), 2);
      }
      txt(stage, '같은 간격', 540, y + 176, {size: 30, weight: 700, color: PAL.mark});
    });
  });
}

// ---- essence geometry ----
const EX = [190, 410, 630, 850], EY = 470, ENUM_Y = 548, ENUM_S = 70, TRAY_Y = 700, DIG_Y = 832;
const ORD = ['출발', '첫 번째 칸', '두 번째 칸', '세 번째 칸'];
/** glyph x positions of a centred number string (display 700) */
function glyphs(stage, s, cx, size) {
  const o = {role: 'display', weight: 700, size}, W = stage.measure(s, o), x0 = cx - W / 2, out = [];
  for (let i = 0; i < s.length; i++) out.push({ch: s[i], x: x0 + stage.measure(s.slice(0, i), o), w: stage.measure(s[i], o)});
  return out;
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  // ------------------------------------------------------------------ hook: the topic, then 규모 3 vs 규모 6 on one scale
  hook(stage, t, p, ctx) {
    checkSoundTable(ctx);
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).hook, e = endFade(t, ctx);
    const outA = fadeOut(t, P.stripsIn - 0.6, 0.5);
    if (outA > 0) withAlpha(c, e * outA, () => {
      const names = ['지진 규모', '데시벨', 'pH'], cols = [PAL.quake, PAL.sound, PAL.acid];
      [270, 540, 810].forEach((x, i) => withAlpha(c, fadeIn(t, P.badges[i] - 0.1, 0.45), () => {
        rect(c, x - 120, 470, 240, 160, 14, rgba(T.plate, 0.92), rgba(cols[i], 0.7), 2);
        if (i === 0) wiggleIcon(c, x, 522, 150, 56, 1);
        else if (i === 1) speakerIcon(c, x + 6, 522, 34, 3, 1, cols[i]);
        else dropIcon(c, x, 526, 26, 1);
        txt(stage, names[i], x, 592, {size: 32, weight: 700, color: T.ink});
      }));
      const X = [270, 450, 630, 810], y = 900;
      withAlpha(c, fadeIn(t, P.mini[0] - 0.3, 0.4), () => line(c, [[220, y], [860, y]], rgba(T.ink, 0.8), 3));
      ['1', '10', '100', '1000'].forEach((s, i) => {
        withAlpha(c, fadeIn(t, P.mini[i] - 0.05, 0.3), () => { line(c, [[X[i], y - 14], [X[i], y + 14]], T.ink, 3); big(stage, s, X[i], y + 56, 48, T.ink); });
        if (i) hop(stage, X[i - 1] + 14, X[i] - 14, y - 26, 48, PAL.mark, (t - P.mini[i] + 0.4) / 0.4, '×10');
      });
      big(stage, '한 칸 = ×10', 540, 1060, 44, PAL.mark, {alpha: fadeIn(t, P.mini[3] + 0.3, 0.5)});
    });
    const sA = fadeIn(t, P.stripsIn, 0.5) * e;
    if (sA <= 0) return;
    withAlpha(c, sA, () => {
      const A3 = 1920 / 1000 * 10;                  // M3 trace peak 19.2 px → M6 (×1000) = 19,200 px = 10 screen heights
      const X0 = 200, X1 = 900;
      // 규모 3 strip
      gridPaper(c, T, 140, 350, 800, 150, 30);
      plateText(stage, '규모 3', 162, 380, {size: 28, align: 'left', color: PAL.quake});
      const u3 = (t - P.m3[0]) / (P.m3[1] - P.m3[0]);
      const tip3 = trace(c, X0, X1, 440, A3, u3, PAL.quake);
      if (u3 > 0 && u3 < 1) penTip(c, tip3);
      // 규모 6 strip (tall)
      const y6 = 560, h6 = 760, c6 = y6 + h6 / 2;
      gridPaper(c, T, 140, y6, 800, h6, 40);
      
      clipRect(c, 142, y6 + 2, 796, h6 - 4, 10, () => {
        // the guess: twice as tall (fades after "아닙니다")
        const ug = (t - P.guess[0]) / (P.guess[1] - P.guess[0]), ga = fadeOut(t, P.no + 0.35, 0.45);
        if (ga > 0) withAlpha(c, ga, () => { const tip = trace(c, X0, X1, c6, 2 * A3, ug, rgba(PAL.quake, 0.8)); if (ug > 0 && ug < 1) penTip(c, tip); });
        // the real one: drawn at the 규모 3 size, then multiplied ×10, ×10, ×10
        const um = (t - P.m6[0]) / (P.m6[1] - P.m6[0]), g = 10 ** (3 * easeInOut((t - P.grow[0]) / (P.grow[1] - P.grow[0])));
        if (um > 0) { const tip = trace(c, X0, X1, c6, A3 * g, um, rgba(PAL.quake, g > 30 ? 0.75 : 1), 2.4, g > 30 ? 120 : 220); if (um < 1) penTip(c, tip); }
      });
      plateText(stage, '규모 6', 162, y6 + 32, {size: 28, align: 'left', color: PAL.quake});
      // labels
      const gA = fadeIn(t, P.guess[0], 0.3) * fadeOut(t, P.no + 0.4, 0.45);
      if (gA > 0) {
        plateText(stage, '2배?', 905, y6 + 80, {size: 44, role: 'display', align: 'right', alpha: gA});
        const w = stage.measure('2배?', {size: 44, weight: 700, role: 'display'}); crossOut(c, 905 - w, 905, y6 + 80, (t - P.no) / 0.35);
      }
      if (t > P.growDec[0]) {
        const k = Math.min(3, Math.floor(3 * easeInOut((t - P.grow[0]) / (P.grow[1] - P.grow[0])) + 1e-6));
        plateText(stage, ['×1', '×10', '×100', '×1000'][Math.max(1, k)], 905, y6 + 80, {size: 48, role: 'display', align: 'right', color: PAL.mark, border: PAL.mark});
      }
      const bA = fadeIn(t, P.grow[1] - 0.1, 0.5);
      if (bA > 0) withAlpha(c, bA, () => {
        plateText(stage, '규모 3의 1,000배 — 칸을 훌쩍 넘음', 540, y6 + 160, {size: 30});
        plateText(stage, '진짜 크기로 그리면 화면 10개 높이', 540, y6 + h6 - 50, {size: 30, color: PAL.mark});
      });
    });
  },

  // ------------------------------------------------------------------ ruler: 더하기 자 → ant & elephant → 곱하기 자 + 수모형
  ruler(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).ruler, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5);
    const pos = P.hops.reduce((v, h) => v + easeInOut((t - h) / 0.2), 0);
    const s03A = fadeOut(t, P.unit - 0.2, 0.45);
    const lift = easeInOut((t - P.lift[0]) / (P.lift[1] - P.lift[0])), y = lerp(RY, RY_UP, lift);
    const q = easeInOut((t - P.morph[0]) / (P.morph[1] - P.morph[0]));
    withAlpha(c, inA * e, () => {
      weightRuler(stage, t, ctx, {y, q, a: 1, ant: fadeIn(t, P.ant[0] - 0.2, 0.3), eleph: fadeIn(t, P.eleph[0] - 0.2, 0.3),
        antGrow: easeOut((t - P.ant[0]) / (P.ant[1] - P.ant[0])), eleGrow: easeIn((t - P.eleph[0]) / (P.eleph[1] - P.eleph[0])) , fit: E1(ctx, 'fit', P.fit, t)});
      // s03: marker hops +1, big counter
      withAlpha(c, s03A, () => {
        const x = RX0 + pos * RU;
        poly(c, [[x - 12, y - 40], [x + 12, y - 40], [x, y - 20]], PAL.mark);
        P.hops.forEach((h, i) => hop(stage, RX0 + i * RU + 6, RX0 + (i + 1) * RU - 6, y - 50, 30, PAL.mark, (t - h) / 0.2, '+1', {size: 24, labelGap: 16}));
        const v = Math.round(pos), pulse = P.hops.reduce((m, h) => Math.max(m, 1 - clamp((t - h - 0.2) / 0.35) - (t < h + 0.2 ? 1 : 0)), 0);
        withAlpha(c, fadeIn(t, P.hops[0] - 0.6, 0.4), () => {
          big(stage, String(v), 540, 640, 140, T.ink);
          txt(stage, '+1', 660, 580, {role: 'display', size: 44, weight: 700, color: PAL.mark, align: 'left', alpha: clamp(pulse)});
        });
        big(stage, '더하기 자 · 한 칸 = +1', 540, RY + 110, 40, PAL.mark, {alpha: fadeIn(t, P.addLabel - 0.1, 0.5)});
      });
      // s04/s05 chip: what one 칸 means
      const chipA = fadeIn(t, P.unit, 0.4) * fadeOut(t, P.lift[0] - 0.3, 0.4);
      if (chipA > 0) {
        const z = P.zoomZ(t), k = Math.floor(z + 1e-6);
        const lab = q < 0.5 ? `한 칸 = ${unitName(k)}` : '한 칸 = ×10', col = q < 0.5 ? T.ink : PAL.mark;
        const flash = P.decades.reduce((m, d) => Math.max(m, 1 - clamp((t - d) / 0.3) - (t < d ? 1 : 0)), 0);
        plateText(stage, lab, 540, RY + 110, {size: 40, role: 'display', color: col, border: flash > 0 ? PAL.mark : T.border, alpha: chipA * (q > 0.35 && q < 0.65 ? Math.abs(q - 0.5) / 0.15 : 1)});
      }
      // s04 annotations
      const goneA = fadeIn(t, P.antGone, 0.4) * fadeOut(t, P.morph[0], 0.4);
      if (goneA > 0) withAlpha(c, goneA, () => {
        ring(c, RX0, y - 200, 24, rgba(PAL.ant, 0.9), 2.5);
        stage.text('0에 붙어서 보이지 않음', RX0 + 40, y - 200, {size: 28, weight: 500, color: PAL.ant});
      });
      big(stage, '코끼리는 개미의 약 20억 배', 540, 640, 44, T.ink, {alpha: fadeIn(t, P.ratio - 0.1, 0.5) * fadeOut(t, P.morph[0] - 0.2, 0.4)});
      big(stage, '둘 다 한 자에 들어옴', 540, 640, 44, PAL.mark, {alpha: fadeIn(t, P.fit, 0.4) * fadeOut(t, P.lift[0] - 0.2, 0.3)});
      // s05: the 수모형 곱하기 자
      blockRuler(stage, t, P, MY, fadeIn(t, P.nums[0] - 0.6, 0.4));
    });
  },

  // ------------------------------------------------------------------ essence: zeros → step number; 몇 번 곱했나 = 로그
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).essence, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5), glowZ = fadeIn(t, P.glowZeros - 0.1, 0.4);
    withAlpha(c, inA * e, () => {
      line(c, [[EX[0] - 40, EY], [EX[3] + 40, EY]], rgba(T.ink, 0.85), 3);
      ['1', '10', '100', '1000'].forEach((s, i) => {
        const x = EX[i], G = glyphs(stage, s, x, ENUM_S);
        line(c, [[x, EY - 14], [x, EY + 14]], T.ink, 3);
        if (i) hop(stage, EX[i - 1] + 20, x - 20, EY - 26, 40, PAL.mark, 1, '×10', {alpha: 0.8});
        // tray + digit
        rect(c, x - 80, TRAY_Y - 34, 160, 68, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
        const dA = fadeIn(t, P.digits[i] - 0.05, 0.35), hi = i === 3 ? fadeIn(t, P.times3, 0.4) * fadeOut(t, sc.end - 1.2, 0.5) : 0;
        withAlpha(c, dA, () => {
          if (hi > 0) glow(c, x, DIG_Y, 90, PAL.mark, 0.3 * hi);
          big(stage, String(i), x, DIG_Y, 68, PAL.mark);
          txt(stage, ORD[i], x, DIG_Y + 56, {size: 26, weight: 500, color: T.ink});
        });
        if (i === 0) txt(stage, '—', x, TRAY_Y, {size: 30, color: T.muted, alpha: dA});
        G.forEach((g, j) => {
          const cx = g.x + g.w / 2, zi = j - 1;   // zero index (glyph 0 is the leading "1")
          if (j === 0 || g.ch !== '0') { stage.text(g.ch, g.x, ENUM_Y, {role: 'display', weight: 700, size: ENUM_S, color: T.ink}); return; }
          const t0 = P.drops[i][zi], u = clamp((t - t0) / P.FALL);
          const tx = x + (zi - (s.length - 2) / 2) * 42, ty = TRAY_Y;
          const col = mix(T.ink, PAL.mark, glowZ);
          if (u > 0) stage.text('0', cx, ENUM_Y, {role: 'display', weight: 700, size: ENUM_S, color: T.ink, align: 'center', alpha: 0.28});
          const lift = u < 0.25 ? -14 * easeOut(u / 0.25) : -14 + (ty - ENUM_Y + 14) * easeIn((u - 0.25) / 0.75);
          const xx = lerp(cx, tx, smooth((u - 0.2) / 0.8)), sz = lerp(ENUM_S, 46, smooth(u / 0.6));
          stage.text('0', xx, ENUM_Y + lift, {role: 'display', weight: 700, size: sz, color: col, align: 'center'});
        });
      });
      big(stage, '0의 개수 = 칸 번호', 540, 990, 48, T.ink, {alpha: fadeIn(t, P.heading, 0.5) * fadeOut(t, P.eq - 0.4, 0.4)});
      // s07: 1000 = 10 × 10 × 10 → 3번 곱함 → 로그; name card
      const eqA = fadeIn(t, P.eq, 0.45);
      if (eqA > 0) withAlpha(c, eqA, () => {
        const parts = ['1000 =', ' 10', ' ×', ' 10', ' ×', ' 10'], o = {role: 'display', weight: 700, size: 54};
        const Wd = stage.measure(parts.join(''), o); let x = 540 - Wd / 2;
        const tenX = [];
        parts.forEach((s, k) => {
          const w = stage.measure(s, o), ti = k === 1 ? 0 : k === 3 ? 1 : k === 5 ? 2 : k === 2 ? 1 : k === 4 ? 2 : -1;
          const a = ti < 0 ? 1 : fadeIn(t, P.tens[ti] - 0.05, 0.3);
          stage.text(s, x, 990, {...o, color: k % 2 && k > 0 && s.trim() === '10' ? PAL.mark : T.ink, alpha: a});
          if (s.trim() === '10') tenX.push([x + stage.measure(' ', o), x + w]);
          x += w;
        });
        const bq = fadeIn(t, P.times3 - 0.05, 0.4);
        if (bq > 0 && tenX.length === 3) withAlpha(c, bq, () => {
          const xa = tenX[0][0], xb = tenX[2][1], yb = 1036;
          line(c, [[xa, yb], [xa, yb + 12], [xb, yb + 12], [xb, yb]], rgba(PAL.mark, 0.9), 2.5);
          txt(stage, '10을 3번 곱함 → 세 번째 칸', 540, 1084, {size: 32, weight: 700, color: PAL.mark});
        });
        txt(stage, 'log₁₀ 1000 = 3', 540, 1132, {size: 28, weight: 500, color: T.muted, alpha: fadeIn(t, P.log + 0.2, 0.5)});
      });
      const cA = fadeIn(t, P.card - 0.1, 0.5);
      if (cA > 0) withAlpha(c, cA, () => {
        rect(c, 190, 1172, 700, 156, 14, rgba(T.plate, 0.94), rgba(T.border, 1), 1.5);
        big(stage, 'logarithm', 540, 1210, 40, T.ink);
        txt(stage, 'logos(비율) + arithmos(수) = 비율의 수', 540, 1256, {size: 28, weight: 500, color: T.ink});
        txt(stage, '1614 · 존 네이피어', 540, 1298, {size: 26, weight: 500, color: T.muted, alpha: fadeIn(t, P.napier - 0.1, 0.5)});
      });
    });
  },

  // ------------------------------------------------------------------ quake: each step up = ×10 amplitude; the vertical axis zooms out ×10
  quake(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).quake, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5), view = P.view(t), SX = [280, 465, 650, 835], QY0 = 380, QH = 480, QC = QY0 + QH / 2;
    withAlpha(c, inA * e, () => {
      gridPaper(c, T, 140, QY0, 800, QH, 40);
      line(c, [[160, QC], [920, QC]], rgba(T.muted, 0.35), 1.2);
      clipRect(c, 142, QY0 + 2, 796, QH - 4, 10, () => {
        P.bursts.forEach(([b0, b1], i) => {
          const u = (t - b0) / (b1 - b0); if (u <= 0) return;
          const A = 170 * ampRatio(i - view);
          const tip = trace(c, SX[i] - 82, SX[i] + 82, QC, A, u, PAL.quake, 2.4, A > 900 ? 90 : 160);
          if (u < 1) penTip(c, tip);
        });
      });
      P.bursts.forEach(([b0], i) => plateText(stage, `규모 ${i + 3}`, SX[i], QY0 + 32, {size: 26, color: PAL.quake, alpha: fadeIn(t, b0 - 0.1, 0.3)}));
      // what the vertical axis shows now
      const k = Math.round(view), zoomA = P.zooms.reduce((m, [a, b]) => Math.max(m, smooth((t - a + 0.1) / 0.2) * (1 - smooth((t - b - 0.3) / 0.3))), 0);
      if (zoomA > 0) plateText(stage, '세로를 1/10로 줄여서 보기', 540, QY0 + QH - 34, {size: 28, color: PAL.mark, border: PAL.mark, alpha: zoomA});
      plateText(stage, k ? `세로 눈금 1/${fmtInt(10 ** k)}` : '세로 눈금 그대로', 160, QY0 + QH - 34, {size: 26, align: 'left', alpha: (1 - zoomA) * fadeIn(t, P.bursts[0][0], 0.4)});
      // magnitude dial: a 곱하기 자 under the slots
      const DY = 960, dialA = fadeIn(t, P.bursts[0][0] - 0.3, 0.5), dialHi = fadeIn(t, P.dial - 0.1, 0.3) * fadeOut(t, P.dial + 1.2, 0.5);
      withAlpha(c, dialA, () => {
        if (dialHi > 0) rect(c, 170, DY - 66, 740, 186, 12, rgba(PAL.mark, 0.06 * dialHi), rgba(PAL.mark, 0.7 * dialHi), 2);
        line(c, [[200, DY], [900, DY]], rgba(T.ink, 0.85), 3);
        let cur = -1;
        P.bursts.forEach(([b0], i) => {
          const a = fadeIn(t, b0 - 0.1, 0.3), x = SX[i]; if (t >= b0) cur = i;
          const hl = (i === 0 ? fadeIn(t, P.from3, 0.3) : i === 3 ? fadeIn(t, P.to6, 0.3) : 0) * fadeOut(t, P.result + 1.5, 0.5);
          line(c, [[x, DY - 14], [x, DY + 14]], T.ink, 3);
          txt(stage, `규모 ${i + 3}`, x, DY + 42, {size: 30, weight: 700, color: hl > 0.5 ? PAL.mark : T.ink});
          big(stage, `×${fmtInt(ampRatio(i))}`, x, DY + 92, 36, PAL.quake, {alpha: a});
          if (i) hop(stage, SX[i - 1] + 16, x - 16, DY - 24, 26, PAL.mark, (t - b0 + 0.2) / 0.4, '×10', {size: 24, labelGap: 16});
        });
        if (cur >= 0) { const x = lerp(SX[Math.max(0, cur - 1)], SX[cur], easeInOut((t - P.bursts[cur][0]) / 0.4)); poly(c, [[x - 11, DY - 40], [x + 11, DY - 40], [x, DY - 22]], PAL.mark); }
        txt(stage, '흔들림', 196, DY + 92, {size: 26, weight: 500, color: T.muted, alpha: fadeIn(t, P.bursts[1][0], 0.4)});
      });
      const spA = fadeIn(t, P.span - 0.1, 0.4);
      if (spA > 0) withAlpha(c, spA, () => {
        const yb = DY + 132; line(c, [[SX[0], yb - 10], [SX[0], yb], [SX[3], yb], [SX[3], yb - 10]], rgba(PAL.mark, 0.9), 2.5);
        txt(stage, '세 칸', (SX[0] + SX[3]) / 2, yb + 26, {size: 30, weight: 700, color: PAL.mark});
      });
      big(stage, '규모 3 → 6 : 10 × 10 × 10 = 1,000배', 540, 1206, 44, T.ink, {alpha: fadeIn(t, P.result - 0.05, 0.5), maxWidth: 800});
      txt(stage, '땅을 흔드는 에너지는 한 칸에 약 32배', 540, 1276, {size: 32, weight: 500, color: T.ink, alpha: fadeIn(t, P.energy - 0.1, 0.5)});
    });
  },

  // ------------------------------------------------------------------ sound: 데시 + 벨; 10 dB = 세기 ×10; the ear also hears ratios
  sound(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).sound, tl = ctx.tl, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5);
    // s10 name card
    const cardA = fadeOut(t, P.rulerIn - 0.5, 0.45);
    if (cardA > 0) withAlpha(c, inA * cardA, () => {
      const sp = easeInOut((t - P.bel + 0.2) / 0.6), bA = fadeIn(t, P.bel, 0.4), dA = fadeIn(t, P.deci - 0.1, 0.4);
      const o = {role: 'display', weight: 700, size: 96};
      const wDe = stage.measure('데시', o), wBel = stage.measure('벨', o), x0 = 540 - (wDe + wBel) / 2;
      stage.text('데시', lerp(x0 + wDe / 2, 330, sp), 470, {...o, align: 'center', color: mix(T.ink, PAL.mark, dA)});
      stage.text('벨', lerp(x0 + wDe + wBel / 2, 750, sp), 470, {...o, align: 'center', color: mix(T.ink, PAL.mark, bA)});
      big(stage, '+', 540, 470, 64, T.muted, {alpha: sp});
      withAlpha(c, bA, () => {
        rect(c, 580, 560, 340, 340, 14, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
        phoneIcon(c, 750, 760, 72, fadeIn(t, P.phone - 0.1, 0.4));
        txt(stage, '알렉산더 그레이엄 벨', 750, 820, {size: 28, weight: 700, color: T.ink});
        txt(stage, '전화를 만든 사람', 750, 862, {size: 26, weight: 500, color: T.muted, alpha: fadeIn(t, P.phone, 0.4)});
      });
      withAlpha(c, dA, () => {
        rect(c, 160, 560, 340, 340, 14, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
        big(stage, '1/10', 330, 690, 72, PAL.mark, {alpha: fadeIn(t, P.tenth - 0.1, 0.4)});
        txt(stage, '10분의 1', 330, 790, {size: 32, weight: 700, color: T.ink, alpha: fadeIn(t, P.tenth - 0.1, 0.4)});
        txt(stage, 'deci-', 330, 840, {size: 28, weight: 500, color: T.muted});
      });
      big(stage, '1 벨 = 10 데시벨', 540, 1000, 44, T.ink, {alpha: fadeIn(t, P.came - 0.1, 0.5)});
    });
    // s11/s12 dB meter on the 곱하기 자
    const rA = fadeIn(t, P.rulerIn, 0.5);
    if (rA <= 0) return;
    const X = db => lerp(160, 860, db / 60), SY = 700;
    withAlpha(c, inA * rA * e, () => {
      line(c, [[136, SY], [884, SY]], rgba(T.ink, 0.85), 3);
      for (let d = 0; d <= 60; d += 10) { line(c, [[X(d), SY - 14], [X(d), SY + 14]], T.ink, 3); txt(stage, String(d), X(d), SY + 42, {size: 32, weight: 500, color: T.ink}); }
      stage.text('dB', 896, SY + 2, {size: 26, weight: 500, color: T.muted});
      // demo: one step
      const dmA = fadeIn(t, P.demo[0] - 0.1, 0.3) * fadeOut(t, P.whisper - 0.4, 0.4);
      if (dmA > 0) withAlpha(c, dmA, () => {
        hop(stage, X(30) + 10, X(40) - 10, SY - 24, 40, PAL.mark, (t - P.demo[0]) / 0.5, '+10 dB', {size: 26});
        big(stage, '세기 ×10', (X(30) + X(40)) / 2, SY + 130, 40, PAL.mark, {alpha: fadeIn(t, P.demoX10 - 0.1, 0.4)});
      });
      // icons + blocks
      const wA = fadeIn(t, P.whisper - 0.1, 0.4), tA = fadeIn(t, P.talk - 0.1, 0.4);
      withAlpha(c, wA, () => { bubbleIcon(c, X(30), 556, 44, 1, 1, '#D9E3E6', true); txt(stage, '속삭임 약 30', X(30), 474, {size: 30, weight: 700, color: T.ink, alpha: fadeIn(t, P.w30 - 0.1, 0.4)}); });
      withAlpha(c, tA, () => { bubbleIcon(c, X(60) - 8, 556, 48, 3, 1); txt(stage, '대화 약 60', X(60) - 14, 474, {size: 30, weight: 700, color: T.ink, alpha: fadeIn(t, P.t60 - 0.1, 0.4)}); });
      const by = 990;
      stage.text('소리의 세기', 160, 940, {size: 30, weight: 700, color: T.muted, alpha: wA});
      [[30, 1, wA], [40, 10, fadeIn(t, P.steps[1] - 0.05, 0.45)], [50, 100, fadeIn(t, P.steps[2] - 0.05, 0.45)], [60, 1000, fadeIn(t, P.steps[3] - 0.05, 0.45)]].forEach(([d, n, a], i) => {
        blocks(c, n, X(d), by, 9 * (i ? 0.55 + 0.45 * easeOut(a) : 1), {a});   // each block grows into place as its hop lands
        txt(stage, `×${fmtInt(n)}`, X(d), by + 38, {role: 'display', size: 30, weight: 700, color: PAL.sound, alpha: a});
        if (i) hop(stage, X(d - 10) + 10, X(d) - 10, SY - 22, 22, PAL.mark, (t - P.steps[i] + 0.4) / 0.5, '×10', {size: 24, labelGap: 14});
      });
      const res = fadeIn(t, P.d1000 - 0.05, 0.5) * fadeOut(t, tl.at('s12') - 0.5, 0.4);
      big(stage, '30 → 60 dB : 세 칸 = 세기 1,000배', 540, 1088, 42, T.ink, {alpha: res, maxWidth: 820});
      // s12: perceived loudness doubles per 10 dB
      const fA = fadeIn(t, P.feel[0] - 0.2, 0.4);
      if (fA > 0) withAlpha(c, fA, () => {
        stage.text('귀에 들리는 크기', 160, 1236, {size: 30, weight: 700, color: T.muted});
        const base = 1306, U = 18;
        [30, 40, 50, 60].forEach((d, i) => {
          const a = fadeIn(t, P.feel[i] - 0.05, 0.3), f = loudRatio(d - 30), h = U * f * easeOut(a);
          rect(c, X(d) - 26, base - h, 52, h, 5, rgba(PAL.cool, 0.85));
          txt(stage, `×${fmtInt(f)}`, X(d), base - U * f - 22, {role: 'display', size: 28, weight: 700, color: PAL.cool, alpha: a});
          if (i) txt(stage, '×2', (X(d - 10) + X(d)) / 2, base - 16, {size: 24, weight: 700, color: PAL.mark, alpha: fadeIn(t, P.twos[i - 1] - 0.05, 0.3)});
        });
        big(stage, '세기 1,000배 → 귀에는 약 8배 (2 × 2 × 2)', 540, 1088, 38, T.ink, {alpha: fadeIn(t, P.loud - 0.1, 0.5), maxWidth: 820});
      });
    });
  },

  // ------------------------------------------------------------------ ph: one step left = ×10 H⁺; 물 7 vs 식초 3 = 만 배
  ph(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).ph, tl = ctx.tl, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5), cw = 770 / 15, X = v => 155 + (v + 0.5) * cw, SY0 = 500, SY1 = 550;
    withAlpha(c, inA * e, () => {
      for (let v = 0; v <= 14; v++) { rect(c, 155 + v * cw, SY0, cw + 0.5, SY1 - SY0, 0, phColour(v)); txt(stage, String(v), X(v), SY1 + 24, {size: 24, weight: v === 7 ? 700 : 500, color: v === 7 ? T.ink : T.muted}); }
      rect(c, 155, SY0, 770, SY1 - SY0, 6, null, rgba(T.ink, 0.6), 1.5);
      const aA = fadeIn(t, P.acid - 0.1, 0.4);
      stage.text('← 산성', 155, 466, {size: 28, weight: 700, color: phColour(1), alpha: aA});
      stage.text('염기성 →', 925, 466, {size: 28, weight: 700, color: phColour(13), align: 'right', alpha: aA});
      const s14 = tl.at('s14') - 0.4, midA = fadeIn(t, P.seven - 0.1, 0.4);
      withAlpha(c, midA, () => { poly(c, [[X(7) - 10, SY0 - 22], [X(7) + 10, SY0 - 22], [X(7), SY0 - 6]], T.ink); });
      plateText(stage, '7 = 중간', X(7), 640, {size: 30, alpha: midA * fadeOut(t, s14, 0.3)});
      // s13: boxes of H⁺ dots (exact 1 / 10 / 100)
      const boxOut = fadeOut(t, s14, 0.4), BY = 730, BH = 270, BW = 220;
      if (boxOut > 0) withAlpha(c, boxOut, () => {
        [[5, 255, 100], [6, 540, 10], [7, 825, 1]].forEach(([v, bx, n], i) => {
          const a = fadeIn(t, P.boxes[2 - i] - 0.05, 0.4); if (a <= 0) return;
          withAlpha(c, a, () => {
            line(c, [[X(v), SY1 + 42], [bx, BY]], rgba(T.muted, 0.7), 1.5);
            rect(c, bx - BW / 2, BY, BW, BH, 12, rgba(T.plate, 0.94), rgba(phColour(v), 0.8), 2);
            txt(stage, `pH ${v}`, bx, BY + 30, {size: 30, weight: 700, color: T.ink});
            const cols = n === 100 ? 10 : n === 10 ? 5 : 1, rows = Math.ceil(n / cols), sp = n === 100 ? 17 : 34, r = n === 100 ? 5 : 8;
            for (let k = 0; k < n; k++) { const ix = k % cols, iy = Math.floor(k / cols); circle(c, bx + (ix - (cols - 1) / 2) * sp, BY + 140 + (iy - (rows - 1) / 2) * sp, r, H_DOT); }
            txt(stage, `알갱이 ${n}`, bx, BY + BH - 28, {size: 26, weight: 500, color: T.muted});
          });
        });
        P.x10.forEach((tt, i) => withAlpha(c, fadeIn(t, tt - 0.05, 0.3), () => {
          const xa = i === 0 ? 706 : 421, xb = i === 0 ? 659 : 374;
          arrow(c, [xa, BY + 150], [xb, BY + 150], rgba(PAL.mark, 0.95), 3, {head: 13});
          txt(stage, '×10', (xa + xb) / 2, BY + 116, {size: 26, weight: 700, color: PAL.mark});
        }));
        withAlpha(c, fadeIn(t, P.legend - 0.1, 0.4), () => {
          const s = '수소 이온 H⁺ — 산성을 만드는 알갱이', w = stage.measure(s, {size: 30, weight: 500});
          circle(c, 540 - w / 2 - 22, BY + BH + 50, 8, H_DOT); stage.text(s, 540 - w / 2, BY + BH + 50, {size: 30, weight: 500, color: T.ink});
        });
      });
      // s14: 물 7, 식초 3 → 4 steps → 만 배
      const wA = fadeIn(t, P.water - 0.1, 0.4), vA = fadeIn(t, P.vinegar - 0.1, 0.4);
      withAlpha(c, wA, () => { glassIcon(c, X(7), SY0 - 34, 40); plateText(stage, '물 7', X(7), 708, {size: 30, color: phColour(7)}); });
      withAlpha(c, vA, () => { bottleIcon(c, X(3), SY0 - 30, 34); plateText(stage, '식초 약 3', X(3), 708, {size: 30, color: phColour(3)}); });
      P.arcs.forEach((tt, i) => hop(stage, X(7 - i) - 4, X(6 - i) + 4, SY1 + 44, -30, PAL.mark, (t - tt) / 0.3, '', {w: 2.5}));
      txt(stage, '네 칸 (×10 네 번)', (X(3) + X(7)) / 2, SY1 + 106, {size: 26, weight: 700, color: PAL.mark, alpha: fadeIn(t, P.arcs[3] + 0.1, 0.4) * fadeOut(t, P.blocks - 0.3, 0.3)});
      const bA = fadeIn(t, P.blocks - 0.1, 0.5);
      if (bA > 0) withAlpha(c, bA, () => {
        for (let k = 0; k < 10; k++) blocks(c, 1000, 345 + (k % 5 - 2) * 82, 870 + Math.floor(k / 5) * 92, 5.6);
        txt(stage, '식초 · 천모형 10개', 345, 1000, {size: 28, weight: 700, color: T.ink});
        blocks(c, 1, 790, 950, 5.6);
        ring(c, 792, 946, 16, rgba(PAL.mark, 0.9), 2);
        txt(stage, '물 · 낱개 1개', 790, 1000, {size: 28, weight: 700, color: T.ink});
      });
      big(stage, '10 × 10 × 10 × 10 = 10,000', 540, 1086, 44, T.ink, {alpha: fadeIn(t, P.product - 0.1, 0.5)});
      big(stage, '만 배', 540, 1180, 64, PAL.mark, {alpha: fadeIn(t, P.man - 0.1, 0.4)});
    });
  },

  // ------------------------------------------------------------------ wide: 0 → 120 dB on one 곱하기 자 (12칸 = 1조 배)
  wide(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).wide, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5), X = d => lerp(160, 880, d / 120), WY = 640;
    withAlpha(c, inA * e, () => {
      withAlpha(c, fadeIn(t, P.ticks[0] - 0.4, 0.4), () => line(c, [[140, WY], [900, WY]], rgba(T.ink, 0.85), 3));
      const endA = fadeIn(t, P.ends - 0.05, 0.4);
      P.ticks.forEach((tt, i) => {
        const a = fadeIn(t, tt - 0.05, 0.25), d = 10 * i, x = X(d), main = i === 0 || i === 12;
        withAlpha(c, a, () => {
          if (main && endA > 0) glow(c, x, WY, 60, PAL.mark, 0.35 * endA);
          line(c, [[x, WY - 13], [x, WY + 13]], T.ink, main ? 3.5 : 2.5);
          txt(stage, String(d), x, WY + 38, {size: main ? 32 : 24, weight: main ? 700 : 500, color: main ? T.ink : T.muted});
        });
        if (i) hop(stage, X(d - 10) + 6, x - 6, WY - 20, 16, PAL.mark, (t - tt + 0.2) / 0.25, '', {w: 2, alpha: 0.8});
      });
      stage.text('dB', 902, WY + 2, {size: 26, weight: 500, color: T.muted, alpha: fadeIn(t, P.ticks[12], 0.3)});
      withAlpha(c, fadeIn(t, P.quiet - 0.1, 0.4), () => { speakerIcon(c, X(0) + 14, 540, 26, 1, 1, rgba('#D9E3E6', 0.75)); txt(stage, '들릴락 말락 0', X(0) + 40, 460, {size: 28, weight: 700, color: T.ink}); });
      withAlpha(c, fadeIn(t, P.thunder - 0.1, 0.4), () => { cloudIcon(c, X(120) - 6, 520, 44, 1, E1(ctx, 'wide_thunder', P.thunder, t, 0.6)); txt(stage, '천둥 약 120', X(120) - 40, 448, {size: 28, weight: 700, color: T.ink}); });
      const trA = fadeIn(t, P.trillion - 0.05, 0.45);
      if (trA > 0) withAlpha(c, trA, () => {
        line(c, [[X(0), 704], [X(0), 716], [X(120), 716], [X(120), 704]], rgba(PAL.mark, 0.9), 2.5);
        big(stage, '세기 1조 배 = 10을 12번 곱함', 540, 770, 42, PAL.mark, {maxWidth: 820});
        big(stage, '1,000,000,000,000', 540, 828, 34, T.muted);
      });
      // the same range on a 더하기 자 runs off the screen
      const lA = fadeIn(t, P.linear - 0.1, 0.5);
      if (lA > 0) withAlpha(c, lA, () => {
        panel(c, T, 140, 900, 800, 290, 0.9);
        txt(stage, '더하기 자로 그리면?', 540, 944, {size: 30, weight: 700, color: T.ink});
        const run = easeIn((t - P.linear) / 1.4), xe = lerp(200, 1240, run);
        circle(c, 190, 1040, 6, T.ink);
        clipRect(c, 140, 900, 940, 290, 0, () => {
          line(c, [[190, 1040], [Math.min(xe, 1100), 1040]], rgba(PAL.mark, 0.9), 4);
          if (xe < 1120) arrow(c, [xe - 30, 1040], [xe, 1040], PAL.mark, 4, {head: 18});
        });
        stage.text('들릴락 말락 = 1 mm', 190, 1086, {size: 26, weight: 500, color: T.ink});
        stage.text('천둥은 약 100만 km →', 920, 996, {size: 30, weight: 700, color: PAL.mark, align: 'right', alpha: fadeIn(t, P.linear + 0.8, 0.4)});
        stage.text('달까지 거리의 약 2.6배', 920, 1140, {size: 28, weight: 500, color: T.ink, align: 'right', alpha: fadeIn(t, P.linear + 1.1, 0.4)});
      });
      plateText(stage, '데시벨로는 0 → 120, 열두 칸', 540, 1252, {size: 34, role: 'display', color: T.ink, border: PAL.mark, alpha: endA});
    });
  },

  // ------------------------------------------------------------------ myth: 3 차이 = 3배? → 10 × 10 × 10
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).myth, sc = ctx.scene, e = endFade(t, ctx);
    const inA = fadeIn(t, sc.start + 0.1, 0.5), X = [240, 440, 640, 840], RYm = 760;
    withAlpha(c, inA * e, () => {
      const hq = '3 차이 = 3배?', o = {role: 'display', weight: 700, size: 64}, w = stage.measure(hq, o);
      stage.text(hq, 540, 440, {...o, align: 'center', color: T.ink});
      crossOut(c, 540 - w / 2, 540 + w / 2, 442, (t - P.cross) / 0.35);
      big(stage, '아니다', 540, 524, 40, T.accent, {alpha: fadeIn(t, P.cross + 0.2, 0.4)});
      withAlpha(c, fadeIn(t, P.ruler - 0.1, 0.45), () => {
        line(c, [[200, RYm], [880, RYm]], rgba(T.ink, 0.85), 3);
        X.forEach((x, i) => { line(c, [[x, RYm - 14], [x, RYm + 14]], T.ink, 3); big(stage, String(i + 3), x, RYm + 46, 44, T.ink); });
        const yb = RYm + 90; line(c, [[X[0], yb - 10], [X[0], yb], [X[3], yb], [X[3], yb - 10]], rgba(T.muted, 0.9), 2.5);
        txt(stage, '숫자 3 차이', 540, yb + 28, {size: 28, weight: 700, color: T.muted});
      });
      [1, 10, 100, 1000].forEach((n, i) => {
        const a = i === 0 ? fadeIn(t, P.ruler, 0.4) : fadeIn(t, P.arcs[i - 1] - 0.05, 0.35);
        blocks(c, n, X[i], 1110, 11, {a});
        if (i) hop(stage, X[i - 1] + 18, X[i] - 18, RYm - 26, 36, PAL.mark, (t - P.arcs[i - 1] + 0.1) / 0.35, '×10', {size: 26});
      });
      big(stage, '10 × 10 × 10 = 1,000배', 540, 1222, 56, PAL.mark, {alpha: fadeIn(t, P.result - 0.1, 0.45)});
    });
  },

  // ------------------------------------------------------------------ close: the proposition + three parallel 곱하기 자
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, P = PL(ctx).close, e = endFade(t, ctx, 0.6);
    const q = fadeIn(t, P.card, 0.6), mA = fadeIn(t, P.mul - 0.1, 0.5);
    withAlpha(c, e, () => {
      withAlpha(c, q, () => {
        stage.text('정리', 540, 296, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
        big(stage, '한 칸에 열 배', 540, 376, 64, T.ink);
        big(stage, '곱하기 자 = 로그', 540, 456, 50, PAL.mark, {alpha: mA});
        line(c, [[480, 506], [600, 506]], T.accent, 4, {cap: 'butt'});
      });
      const CX = [260, 420, 580, 740, 900], rows = [
        ['지진 규모', ['3', '4', '5', '6', '7'], '흔들림 ×10', PAL.quake],
        ['데시벨', ['30', '40', '50', '60', '70'], '소리 세기 ×10', PAL.sound],
        ['pH', ['7', '6', '5', '4', '3'], 'H⁺ 알갱이 ×10', PAL.acid]];
      const gA = fadeIn(t, P.glance - 0.1, 0.5);
      if (gA > 0) withAlpha(c, gA, () => CX.forEach(x => line(c, [[x, 600], [x, 1090]], rgba(PAL.mark, 0.35), 2, {dash: [6, 8]})));
      rows.forEach(([name, labs, qty, col], r) => {
        const y = 660 + r * 196, a = fadeIn(t, P.rows[r] - 0.15, 0.45), hi = E1(ctx, `close_row${r}`, P.rows[r], t, 1.0);
        if (a <= 0) return;
        withAlpha(c, a, () => {
          const wn = stage.measure(name, {size: 32, weight: 700});
          stage.text(name, 160, y - 64, {size: 32, weight: 700, color: col});
          stage.text('· ' + qty, 160 + wn + 14, y - 62, {size: 26, weight: 500, color: T.muted});
          line(c, [[220, y], [920, y]], rgba(mix(T.ink, col, 0.4 * hi), 0.85), 3);
          CX.forEach((x, i) => {
            line(c, [[x, y - 13], [x, y + 13]], T.ink, 3);
            txt(stage, labs[i], x, y + 40, {role: 'display', size: 32, weight: 700, color: T.ink});
            if (i) hop(stage, CX[i - 1] + 12, x - 12, y - 18, 20, col, 1, '', {w: 2, alpha: 0.75});
          });
        });
      });
      big(stage, '어느 자든 한 칸 = ×10', 540, 1180, 44, PAL.mark, {alpha: gA});
    });
  },
};

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  const L = titleList(ctx.scene.id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.42, 0.37);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  // title change: the old line fades out first, then the new one fades in (no overlapping glyphs)
  const u = k > 0 ? (t - L[k][0]) / 0.7 : 1, out = 1 - smooth(u / 0.45), inn = smooth((u - 0.5) / 0.5), prev = L[Math.max(0, k - 1)], cur = L[k];
  const sameK = k > 0 && prev[1] === cur[1];
  if (k > 0 && u < 0.5) head(stage, sameK ? '' : prev[1], prev[2], a * out, a * out);
  head(stage, cur[1], cur[2], k > 0 && !sameK ? a * inn : a, k > 0 ? a * inn : a);
  progressBar(stage, t, ctx.tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// =====================================================================================================
const NOTE = {dur: 0.55, harmonics: [1, 0.45, 0.2], attack: 0.012, decay: 0.24, release: 0.08};
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const custom = (id, times, layer, gain, means, extra = {}) => { const t0 = times[0]; ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, i) => ({kind: layer(i).kind, offset: r(tt - t0, 4), params: layer(i).params}))}, means, ...extra}); };
  const notes = (id, times, ks, gain, means, o = {}) => custom(id, times, i => ({kind: 'tone', params: {...NOTE, ...o, freq: r(stepPitch(ks[i]), 2)}}), gain, means);
  const ticks = (id, times, freq, gain, means, o = {}) => custom(id, times, () => ({kind: 'tick', params: {freq, decay: 0.05, click: 0.25, ...o}}), gain, means);
  const scratch = (id, [t0, t1], gain, means, scale = 1) => {
    const pts = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) pts.push([r(tt - t0), r(scale * burstEnv((tt - t0) / (t1 - t0)), 4)]);
    pts.push([r(t1 - t0 + 0.12), 0]);
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {low: 1400, high: 5200, gain_db: r(gain, 2), fade: 0.03, points: pts}, means});
  };
  const sil = (id, at, means) => ev.push({id, at: r(at, 4), kind: 'silent', means});
  const H = P.hook, R = P.ruler, E = P.essence, Q = P.quake, S = P.sound, Ph = P.ph, Wd = P.wide, My = P.myth, C = P.close;
  // hook
  ticks('hook_badges', H.badges, 880, -30, '세 주제 카드(지진 규모 · 데시벨 · pH)가 하나씩 나타남', {decay: 0.06, click: 0.15});
  notes('hook_steps', H.mini, [0, 1, 2, 3], -28, '미리 보는 곱하기 자 1 · 10 · 100 · 1000: 한 칸(×10)마다 같은 음정(완전4도)만큼 위로 — 이 대응을 끝까지 유지');
  scratch('m3_scratch', H.m3, scratchGain(3), '규모 3 기록을 그리는 펜 긁힘(합성 잡음) — 크기는 그림 속 흔들림의 모양을 따름');
  scratch('guess_scratch', H.guess, -29 + 2 * lg(2), '"두 배?" 추측 기록을 그리는 펜 긁힘 (2배 → +0.6 dB, 압축한 대응)');
  sil('guess_lab', H.guess[0], '"2배?" 표시');
  ticks('no_cross', [H.no, H.no + 0.12], 520, -26, '"2배?"에 줄을 그음 (낮은 틱 두 번)', {decay: 0.1, click: 0.2});
  scratch('m6_scratch', H.m6, scratchGain(3), '규모 6 칸에 규모 3과 같은 크기로 먼저 그림(같은 긁힘)');
  notes('grow_steps', [H.grow[0], ...H.growDec], [0, 1, 2, 3], -27, '규모 6 기록이 ×10, ×10, ×10 커짐: 10배가 될 때마다 같은 음정 위로 (세 번 = 천 배)');
  sil('hook_1000', H.grow[1] - 0.1, '"규모 3의 1,000배 · 화면 10개 높이" 표시');
  // ruler
  ticks('add_ticks', R.hops.map(h => h + 0.2), ADD_TICK_HZ, -27, '더하기 자: 한 칸(+1)마다 똑같은 높이·크기의 틱 10번 (같은 차이 = 같은 소리)', {decay: 0.045, click: 0.3});
  sil('add_lab', R.addLabel, '"더하기 자 · 한 칸 = +1" 표시');
  sil('unit_chip', R.unit, '"한 칸 = 1 mg" 표시');
  ticks('ant_bar', [R.ant[0]], 1500, -30, '개미 막대(3 mg)가 그려짐', {decay: 0.05});
  ev.push({id: 'eleph_run', at: r(R.eleph[0], 4), kind: 'whoosh', params: {dur: 1.0, f_start: 400, f_end: 2400, q: 2.0, gain_db: -29}, means: '코끼리 막대가 화면 밖으로 뻗어 나감'});
  notes('zoom_decades', R.decades, Array.from({length: ZOOM_DEC}, (_, i) => i + 1), -30, '자를 줄여 보는 동안 "한 칸"이 10배씩 커질 때마다(9번: 1 mg → 1 t) 같은 음정 위로', {dur: 0.32, decay: 0.12});
  sil('ant_gone', R.antGone, '"0에 붙어서 보이지 않음" 표시');
  sil('ratio_lab', R.ratio, '"코끼리는 개미의 약 20억 배" 표시');
  ticks('fit', [R.fit, R.fit + 0.14], 990, -27, '곱하기 자로 바뀌자 개미와 코끼리가 한 자에 함께 들어옴 (두 점)', {decay: 0.07, click: 0.2});
  notes('mul_notes', R.nums, [0, 1, 2, 3], -27, '곱하기 자 1 · 10 · 100 · 1000(수모형): 한 칸마다 같은 음정(완전4도) 위로 — 같은 비율 = 같은 간격');
  sil('equal_lab', R.equal, '"같은 간격" 표시');
  // essence
  const lands = E.drops.flat().map(x => x + E.FALL).sort((a, b) => a - b);
  ticks('zero_drops', lands, 1600, -28, '0이 쟁반에 떨어질 때마다 딸깍 (10은 한 번, 100은 두 번, 1000은 세 번)', {decay: 0.04, click: 0.4});
  notes('digits', E.digits, [0, 1, 2, 3], -30, '칸 번호 0 · 1 · 2 · 3이 나타날 때 같은 음정 계단', {dur: 0.4});
  notes('tens', E.tens, [1, 2, 3], -30, '10을 한 번 곱할 때마다 한 칸 위의 음 (세 번 = 1000)', {dur: 0.4});
  sil('log_lab', E.log, '"log₁₀ 1000 = 3" 작은 표시');
  sil('name_card', E.card, 'logarithm 이름 카드');
  // quake
  Q.bursts.forEach((b, i) => scratch(`q_scratch${i + 3}`, b, scratchGain(i + 3), `규모 ${i + 3} 기록을 그리는 펜 긁힘 — 진폭 ×${fmtInt(ampRatio(i))}를 압축해 ${r(scratchGain(i + 3) - scratchGain(3), 1)} dB 더 크게(실제 ×10 크기 차를 그대로 재생하지 않음)`));
  notes('q_steps', Q.bursts.map(b => b[0]), [0, 1, 2, 3], -28, '규모가 한 칸 오를 때마다 같은 음정 위로 (흔들림 ×10)');
  ev.push({id: 'q_zooms', at: r(Q.zooms[0][0], 4), kind: 'custom', params: {gain_db: -31, layers: Q.zooms.map(([a, b]) => ({kind: 'whoosh', offset: r(a - Q.zooms[0][0], 4), params: {dur: r(b - a, 3), f_start: 2600, f_end: 700, q: 2.0}}))},
    means: '세로 눈금을 1/10로 줄여 보는 순간 (내려가는 바람 소리, 세 번)'});
  sil('q_dial', Q.dial, '규모 곱하기 자 강조');
  ticks('q_result', [Q.result], 880, -27, '"10 × 10 × 10 = 1,000배" 표시', {decay: 0.08, click: 0.2});
  sil('q_energy', Q.energy, '"에너지는 한 칸에 약 32배" 표시');
  // sound
  ticks('bel_card', [S.bel], 784, -29, '"벨" 카드 (알렉산더 그레이엄 벨)', {decay: 0.09, click: 0.15});
  ticks('deci_card', [S.deci], 784, -29, '"데시 = 10분의 1" 카드', {decay: 0.09, click: 0.15});
  sil('one_bel', S.came, '"1 벨 = 10 데시벨" 표시');
  const dbt = (id, times, dbs, means) => custom(id, times, i => ({kind: 'tone', params: {freq: DB_TONE_HZ, dur: 0.36, harmonics: [1, 0.3], attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.08, gain_db: r(dbGain(dbs[i]) + 30, 2)}}), -30, means);
  dbt('db_demo', S.demo, [30, 40], '같은 높이의 음: 30 dB → 40 dB (세기 ×10을 +2 dB로 압축해 들려줌)');
  dbt('db_whisper', [S.w30], [30], '속삭임 30 dB의 음 (압축 대응: 10 dB마다 +2 dB)');
  dbt('db_talk', [S.t60], [60], '대화 60 dB의 음 (압축 대응, 속삭임보다 +6 dB)');
  dbt('db_steps', S.steps, [30, 40, 50, 60], '30 → 40 → 50 → 60 dB 계단 — 한 칸마다 같은 만큼(+2 dB) 커짐; 실제 세기는 칸마다 ×10');
  sil('db_1000', S.d1000, '"30 → 60 dB : 세기 1,000배" 표시');
  ticks('feel_bars', S.feel, 660, -30, '"귀에 들리는 크기" 막대 ×1 · ×2 · ×4 · ×8이 하나씩 나타남', {decay: 0.06, click: 0.15});
  sil('feel_lab', S.loud, '"귀에는 약 8배" 표시');
  // pH
  ticks('ph_mid', [Ph.seven], 880, -28, '"7 = 중간" 표시', {decay: 0.08, click: 0.15});
  notes('ph_boxes', Ph.boxes, [0, 1, 2], -28, 'pH 7 → 6 → 5 상자(알갱이 1 · 10 · 100): 산성 쪽으로 한 칸마다 같은 음정 위로');
  sil('ph_legend', Ph.legend, '수소 이온 H⁺ 범례');
  notes('ph_arcs', Ph.arcs, [1, 2, 3, 4], -28, '물 7 → 식초 3: 네 칸, 칸마다 같은 음정 위로 (×10 네 번)');
  ticks('ph_blocks', [Ph.blocks], 990, -29, '천모형 10개와 낱개 1개 비교가 나타남', {decay: 0.07});
  ev.push({id: 'ph_man', at: r(Ph.man, 4), kind: 'swell', params: {freqs: [r(stepPitch(0), 2), r(stepPitch(2), 2), r(stepPitch(4), 2)], dur: 1.6, gain_db: -30}, means: '"만 배" — 첫 칸 · 둘째 칸 · 넷째 칸 음을 함께'});
  // wide
  notes('wide_ticks', Wd.ticks, Array.from({length: 13}, (_, i) => i), -30, '0 → 120 dB 눈금 13개: 한 칸마다 같은 음정 위로 — 12칸이면 다섯 옥타브(처음 음의 약 32배 높이)', {dur: 0.34, decay: 0.12});
  ticks('wide_quiet', [Wd.quiet], 2000, -36, '"들릴락 말락" 표시 (아주 작은 틱)', {decay: 0.03, click: 0.1});
  ev.push({id: 'wide_thunder', at: r(Wd.thunder, 4), kind: 'noise', params: {dur: 1.1, low: 60, high: 420, attack: 0.04, release: 0.9, gain_db: -31}, means: '"천둥" 표시 — 합성한 낮은 잡음(녹음 아님, 크기는 안전하게 압축)'});
  ticks('wide_trillion', [Wd.trillion], 880, -27, '"세기 1조 배 = 10을 12번 곱함" 표시', {decay: 0.08, click: 0.2});
  ev.push({id: 'wide_linear', at: r(Wd.linear, 4), kind: 'whoosh', params: {dur: 1.4, f_start: 500, f_end: 3200, q: 2.0, gain_db: -29}, means: '더하기 자의 화살표가 화면 밖으로 끝없이 뻗어 나감'});
  sil('wide_ends', Wd.ends, '"데시벨로는 0 → 120, 열두 칸" 표시');
  // myth
  ticks('myth_x', [My.cross, My.cross + 0.12], 520, -25, '"3배?"에 줄을 그음', {decay: 0.1, click: 0.2});
  notes('myth_steps', My.arcs, [1, 2, 3], -28, '10을 한 번 곱할 때마다 같은 음정 위로 (세 번 = 천 배)');
  ticks('myth_1000', [My.result], 880, -27, '"10 × 10 × 10 = 1,000배" 표시', {decay: 0.08, click: 0.2});
  // close
  C.rows.forEach((tt, i) => ticks(`close_row${i}`, [tt], 880, -30, ['지진 규모 자', '데시벨 자', 'pH 자'][i] + '가 나타남', {decay: 0.07, click: 0.15}));
  ev.push({id: 'close_swell', at: r(C.glance, 4), kind: 'swell', params: {freqs: [r(2 * stepPitch(0), 2), r(2 * stepPitch(1), 2), r(2 * stepPitch(2), 2)], dur: 2.0, gain_db: -29}, means: '세 자의 같은 칸을 잇는 세로선 — 한 칸씩 올라간 음 셋을 함께 (정리)'});
  return ev;
}
const E1 = (ctx, id, t0, t, dur = 0.8) => { const a = t - evT(ctx, id, t0); return a < 0 || a > dur ? 0 : 1 - a / dur; };
const H_DOT = '#FF8A5C';
const PH_STOPS = [[0, '#D23C3C'], [2, '#E8613A'], [4, '#EFA13C'], [6, '#E2D24C'], [7, '#78BC5C'], [8, '#4FA88A'], [10, '#3E7EC0'], [12, '#5A5AB2'], [14, '#7A4EA6']];
function phColour(v) { for (let i = 1; i < PH_STOPS.length; i++) { const [a, ca] = PH_STOPS[i - 1], [b, cb] = PH_STOPS[i]; if (v <= b) return mix(ca, cb, (v - a) / (b - a)); } return PH_STOPS.at(-1)[1]; }

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음(사용자 결정). 모든 사건은 `node episodes/log-scale/scenes.mjs --emit-sound`가 scenes.mjs의 같은 시간표 plan(tl)과 모형에서 써 넣습니다. 대응: 곱하기 자의 한 칸(×10) = 완전4도(×4/3) 위, 130.8 Hz에서 시작; 더하기 자 한 칸 = 똑같은 틱. 크기는 압축(지진계 긁힘 규모당 +2 dB, 데시벨 음 10 dB당 +2 dB). 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  const txtOut = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txtOut + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length} (${sound.events.filter(e => e.kind !== 'silent').length} audible)`);
  console.log(`check: ant/elephant ×${ANT_RATIO.toExponential(2)}; energy/step ×${energyRatio(1).toFixed(1)}; 30→60 dB ×${intensityRatio(30)}; loudness ×${loudRatio(30)}; pH 7→3 ×${hRatio(4)}; 0→120 dB ×${intensityRatio(120).toExponential(0)}; linear 1 mm → ${LINEAR_KM.toExponential(2)} km = ${(LINEAR_KM / MOON_KM).toFixed(2)} × Moon`);
  console.log(`pitch: step 0 ${stepPitch(0).toFixed(1)} Hz … step 4 ${stepPitch(4).toFixed(1)} … step 12 ${stepPitch(12).toFixed(1)} Hz; zoom decades ${P.ruler.decades.map(x => x.toFixed(2)).join(' ')}`);
}
