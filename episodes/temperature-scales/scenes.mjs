// Episode scenes — "섭씨, 화씨, 켈빈 — 온도를 재는 세 눈금"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - One variable drives the picture, the readouts and the sound: the temperature T(t) in °C, a list of eased knots in
//    plan(). Every scale is a linear map of T: °F = 1.8·°C + 32, K = °C + 273.15. The thermometer column height is linear
//    in T (one vertical map per layout); all rulers that stand next to it use the same map, so a level line reads them.
//  - Historical scales: Fahrenheit 1724 — 0 at an ice + ammonium-chloride mixture, 96 at body temperature. The mixture is
//    placed at 4 °F (−15.6 °C) of today's scale and the body at 37 °C (98.6 °F); the refined scale is 32 = freezing,
//    212 = boiling (180 divisions). Celsius 1742 — 0 at boiling, 100 at freezing (100 divisions), later flipped.
//  - Myth: average kinetic energy of an ideal gas ∝ K → 293.15 / 283.15 = 1.035. Particle boxes: free particles (no
//    collisions) with speeds ∝ √K (설명 모형). Light colour: Planck spectrum × CIE 1931 colour matching functions
//    (Wyman–Sloan–Shirley 2013 fit) → linear sRGB → normalised; this is the colour of an ideal black body at that K.
//  - Sound: node episodes/temperature-scales/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rng, rand, loadTimeline, sphere,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = {base: 'graphite', accent: '#FF9A3D'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const F_OF_C = c => 1.8 * c + 32, K_OF_C = c => c + 273.15, C_OF_F = f => (f - 32) / 1.8, C_OF_K = k => k - 273.15;
export const T_HOT = C_OF_F(100);                       // 37.78 °C = 100 °F = 310.93 K (the poster)
export const ABS0 = -273.15, T_BODY = 37;
export const F24 = {mixC: C_OF_F(4), bodyC: T_BODY, bodyN: 96};  // Fahrenheit 1724: mixture ≈ 4 °F today, body 37 °C
export const f24OfC = c => F24.bodyN * (c - F24.mixC) / (F24.bodyC - F24.mixC);
export const cOfF24 = u => F24.mixC + u * (F24.bodyC - F24.mixC) / F24.bodyN;
export const COL = {C: '#72C6EE', F: '#F3CF5E', K: '#9AD98B', liquid: '#FF6A2E', liquidHi: '#FFC08A', glass: '#DCE6EA',
  old: '#CDBBA4', ice: '#CFEFFF', water: '#3F86B5', hot: '#FF9A3D', bad: '#F07F5E', steam: '#E8E2DA'};
/** scale units: toC(u) and ofC(c) */
export const UNITS = {
  C: {toC: u => u, ofC: c => c, sym: '°C', name: '섭씨', col: COL.C},
  F: {toC: C_OF_F, ofC: F_OF_C, sym: '°F', name: '화씨', col: COL.F},
  K: {toC: C_OF_K, ofC: K_OF_C, sym: 'K', name: '켈빈', col: COL.K},
  F24: {toC: cOfF24, ofC: f24OfC, sym: '', name: '1724', col: COL.old},
  C42: {toC: u => 100 - u, ofC: c => 100 - c, sym: '', name: '1742', col: COL.old},
  GEN: {toC: u => 10 * u, ofC: c => c / 10, sym: '', name: '', col: '#E9E2D6'},
};
/** sound mappings (all below 700 Hz) */
export const humHz = c => 0.6 * K_OF_C(c);              // column height ∝ absolute temperature → pitch (311 K → 187 Hz)
export const numHz = n => 150 * 2 ** (n / 140);         // the NUMBER read on one scale → pitch (convert: −40 → 123 Hz)
export const degHz = n => 11 * n;                       // myth: pitch ∝ °C number (10 → 110 Hz, 20 → 220 Hz)
export const lightHz = k => 0.06 * k;                   // colour temperature → pitch (2700 K → 162 Hz, 6500 K → 390 Hz)
export const KE_RATIO = K_OF_C(20) / K_OF_C(10);        // 1.0353

// ---- black-body colour (Planck × CIE 1931 2° CMF fit, Wyman–Sloan–Shirley 2013) ----
const g3 = (x, m, s1, s2) => { const u = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * u * u); };
const CMF = l => [1.056 * g3(l, 599.8, 37.9, 31.0) + 0.362 * g3(l, 442.0, 16.0, 26.7) - 0.065 * g3(l, 501.1, 20.4, 26.2),
  0.821 * g3(l, 568.8, 46.9, 40.5) + 0.286 * g3(l, 530.9, 16.3, 31.1), 1.217 * g3(l, 437.0, 11.8, 36.0) + 0.681 * g3(l, 459.0, 26.0, 13.8)];
function bbCompute(K) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) { const m = l * 1e-9, B = 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * K)) - 1)), [x, y, z] = CMF(l); X += B * x; Y += B * y; Z += B * z; }
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const mx = Math.max(r, g, b); [r, g, b] = [r, g, b].map(v => Math.max(0, v / mx));
  const gam = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return '#' + [r, g, b].map(v => Math.round(clamp(gam(v)) * 255).toString(16).padStart(2, '0')).join('');
}
const BB = new Map();
export const bbColor = K => { const k = Math.round(clamp(K, 1000, 12000) / 25) * 25; if (!BB.has(k)) BB.set(k, bbCompute(k)); return BB.get(k); };

// ---- particles (free, no collisions; speeds ∝ √K; 설명 모형) ----
export const PARTS = (() => { const r = rng(5); return [...Array(30)].map(() => { const a = r() * TAU, s = Math.sqrt(-2 * Math.log(1 - r() * 0.97)); return {x: r(), y: r(), vx: Math.cos(a) * s, vy: Math.sin(a) * s, h: r()}; }); })();
export const speedK = K => Math.sqrt(Math.max(0, K) / K_OF_C(20));

// =====================================================================================================
// Time anchors and the plan (all motion that the sound also needs)
// =====================================================================================================
function knotFn(knots) {
  for (let i = 1; i < knots.length; i++) if (!(knots[i][0] >= knots[i - 1][0] - 1e-9)) throw new Error(`T knots out of order at ${i}: ${knots[i - 1][0].toFixed(3)} → ${knots[i][0].toFixed(3)}`);
  return t => {
    if (t <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [a, va] = knots[i - 1], [b, vb] = knots[i]; return b - a < 1e-9 ? vb : lerp(va, vb, easeInOut((t - a) / (b - a))); }
    return knots.at(-1)[1];
  };
}
/** evenly spaced knots between t0 and t1 (a gentle room-temperature wander that scales with the timeline) */
const drift = (t0, t1, vals) => vals.map((v, i) => [t0 + (t1 - t0) * i / (vals.length - 1), v]);
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export const SWEEP = 1.5;                                                // every "draw the divisions" sweep lasts the same time
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const sc = id => tl.scene(id), w = (s, word, off = 0) => tl.at({sentence: s, word}) + off;
  // hook
  P.tagC = w('s01', '섭씨와', -0.05); P.tagF = w('s01', '화씨', -0.05); P.kIn = w('s01', '켈빈까지', -0.15); P.measure = w('s01', '온도를', -0.05); P.three = w('s01', '세 가지', -0.05);
  P.wx = w('s02', '미국', -0.1); P.f100 = w('s02', '백도는', -0.05); P.boil = w('s02', '물이', -0.1); P.no = w('s02', '아니라', 0.05); P.boilTop = Math.min(P.boil + 0.85, P.no - 0.05); P.backT = P.no + 0.95;
  P.c38 = w('s02', '섭씨', -0.05); P.heat = w('s02', '무더위입니다', -0.1);
  // origin
  P.o0 = sc('origin').start; P.updown = w('s03', '오르내림만', -0.1); P.what = w('s03', '몇', -0.1); P.noScale = w('s03', '눈금이', -0.1);
  P.anyone = w('s04', '누구나', -0.1); P.ref1 = w('s04', '기준점'); P.climb = P.ref1 + 0.3; P.ref2 = w('s04', '정하고', 0.1);
  P.div0 = w('s04', '고르게', -0.3); P.div1 = P.div0 + 1.2; P.read = P.div1 + 0.15;
  // fahr
  P.f0 = sc('fahr').start; P.y1724 = w('s05', '천칠백이십사년', -0.1); P.nl = w('s05', '네덜란드에서', -0.1); P.maker = w('s05', '온도계를', -0.05); P.ice = w('s05', '얼음에', -0.1);
  P.mixT0 = w('s05', '염화암모늄을'); P.zero = w('s05', '영도로'); P.mixT1 = P.zero - 0.1;
  P.person = w('s06', '사람의', -0.1); P.bodyT0 = w('s06', '체온을', -0.2); P.n96 = w('s06', '구십육도로', 0.05); P.div96 = [P.n96 + 0.5, P.n96 + 0.5 + SWEEP];
  P.later = w('s07', '나중에', -0.1); P.bodyTag = w('s07', '다듬으면서', 0.2);
  P.cupF = w('s07', '어는', -0.15); P.n32 = w('s07', '삼십이도', 0.05); P.potF = w('s07', '끓는', -0.15); P.n212 = w('s07', '이백십이도가', 0.05);
  P.div180 = [P.n212 + 0.45, P.n212 + 0.45 + SWEEP]; P.c180 = P.div180[1] + 0.05;
  // cels
  P.c0 = sc('cels').start; P.y1742 = w('s08', '천칠백사십이년', -0.1); P.astro = w('s08', '천문학자', -0.1);
  P.boilC = w('s08', '끓는', -0.2); P.freezeC = w('s08', '어는', -0.15); P.div100 = [w('s08', '백칸으로'), w('s08', '백칸으로') + SWEEP];
  P.lab0 = w('s09', '영도', -0.05); P.lab100 = w('s09', '백도로', -0.05); P.inv = w('s09', '거꾸로였고', -0.1); P.death = w('s09', '세상을', -0.1);
  P.flip = [w('s09', '뒤집혔습니다', -0.55), w('s09', '뒤집혔습니다', 0.55)];
  P.names = w('s10', '섭씨와', -0.1); P.shift = [P.names - 0.85, P.names + 0.15];
  P.han = w('s10', '한자로', -0.25); P.first = w('s10', '첫', -0.05); P.ssi = w('s10', '성씨의', -0.05); P.join = w('s10', '붙인', -0.05);
  // convert
  P.v0 = sc('convert').start; P.cC = w('s11', '섭씨는', -0.05); P.sweepC = [P.cC + 0.05, P.cC + 0.05 + SWEEP];
  P.cF = w('s11', '화씨는'); P.sweepF = [Math.max(P.sweepC[1] + 0.05, P.cF + 0.05), 0]; P.sweepF[1] = P.sweepF[0] + SWEEP;
  P.zoom = [Math.max(P.sweepF[1] + 0.1, w('s11', '화씨 한', -0.35)), 0]; P.zoom[1] = P.zoom[0] + 0.9; P.small = w('s11', '작습니다', -0.1);
  P.toB = [w('s12', '그래서', -0.75), w('s12', '그래서', 0.45)]; P.line = [w('s12', '섭씨에', -0.1), w('s12', '곱하고', 0.2)];
  P.x18 = w('s12', '일점팔을', -0.05); P.p32 = w('s12', '삼십이를', -0.05); P.form = w('s12', '화씨가', -0.1);
  P.yx = [w('s13', '두', -0.1), w('s13', '두', 0.8)]; P.meet = w('s13', '딱', -0.05); P.same = w('s13', '같은', -0.05);
  // kelvin
  P.k0 = sc('kelvin').start; P.y1848 = w('s14', '천팔백사십팔년', -0.1); P.thomson = w('s14', '톰슨', -0.1); P.lord = w('s14', '켈빈', -0.1);
  P.zoomK = [w('s14', '가장', -0.15), w('s14', '온도인', 0.2)]; P.drop = [w('s14', '절대영도를', -0.3), w('s14', '영으로', 0.05)];
  P.zeroK = w('s14', '영으로', 0.05); P.kLabels = w('s14', '눈금을', -0.1);
  P.unit1 = w('s15', '한 칸의', -0.05); P.addT = [w('s15', '섭씨에', -0.05), w('s15', '더하면', 0.25)]; P.kform = w('s15', '이백칠십삼점일오를', -0.1);
  P.noDeg = w('s15', '켈빈에는', -0.1); P.strike = w('s15', '붙이지', -0.05);
  // myth
  P.m0 = sc('myth').start; P.m20 = w('s16', '이십도는', -0.1); P.m10 = w('s16', '십도보다', -0.1); P.twice = w('s16', '두 배', -0.05);
  P.no17 = w('s17', '아닙니다'); P.toK = [w('s17', '켈빈으로', -0.1), w('s17', '바꾸면', 0.6)]; P.k293 = w('s17', '이백구십삼과', -0.05); P.k283 = w('s17', '이백팔십삼이라', -0.05);
  P.parts = w('s17', '알갱이들의', -0.15); P.pct = w('s17', '사퍼센트도', -0.1);
  // use
  P.u0 = sc('use').start; P.ratio = w('s18', '비율이', -0.1); P.bulb = w('s18', '전구', -0.1); P.box = w('s18', '상자에', -0.1);
  P.k65 = [w('s18', '육천오백켈빈', -0.25), w('s18', '육천오백켈빈', 0.85)]; P.colT = w('s18', '색온도도', -0.1);
  P.Kc = knotFn([[P.bulb, 2700], [P.k65[0], 2700], [P.k65[1], 6500]]);
  // close
  P.cl0 = sc('close').start; P.hot1 = w('s19', '무더위도', 0.3); P.r38 = w('s19', '삼십팔', -0.05); P.r100 = w('s19', '백,', -0.05); P.r311 = w('s19', '삼백십일이라는', -0.05);
  P.diff = w('s19', '다른', -0.1); P.reason = w('s20', '온도', -0.1);

  // ---- the temperature T(t) in °C: one list of eased knots for the whole video ----
  P.cap0 = tl.at('s01') - 0.05;
  const osc = [[P.o0 + 0.3, T_HOT], [P.o0 + 1.5, 24]]; { const vals = [33, 15, 30, 18, 28, 20, 26, 22]; let tt = P.o0 + 1.5; for (const v of vals) { tt += 1.12; if (tt > P.anyone - 0.2) break; osc.push([tt, v]); } }
  const lastOsc = osc.at(-1);
  P.Tk = [
    [0, T_HOT], [P.boil, T_HOT], [P.boilTop, 100], [P.no, 100], [P.backT, T_HOT],
    ...osc, [P.anyone, lastOsc[1]], [P.ref1 - 0.15, 0], [P.climb, 0], [P.ref2 - 0.1, 100], [P.div1 + 0.1, 100], [Math.min(P.div1 + 1.1, P.f0 + 0.15), 64],
    [P.f0 + 0.2, 64], ...drift(P.f0 + 1.4, P.mixT0 - 0.3, [20, 23.5, 18.5, 20]), [P.mixT0, 20], [P.mixT1, F24.mixC], [P.bodyT0, F24.mixC], [P.n96 - 0.15, T_BODY],
    [P.cupF + 0.1, T_BODY], [P.n32 - 0.1, 0], [P.potF + 0.1, 0], [P.n212 - 0.1, 100],
    [P.c0 + 0.1, 100], ...drift(P.c0 + 1.3, P.boilC - 0.1, [20, 24, 18.5, 20]), [P.boilC, 20], [Math.min(P.boilC + 0.8, P.freezeC - 0.05), 100], [P.freezeC, 100], [P.freezeC + 0.85, 0],
    [P.inv, 0], [P.inv + 1.2, 40],
    [P.v0 + 0.05, 40], [P.v0 + 0.9, 20], [P.toB[1], 20], [w('s12', '곱하고', 0.05), 100], [P.p32, 100], [w('s12', '더하면', 0.3), 0],
    [Math.max(w('s12', '화씨가', -0.15), w('s12', '더하면', 0.35)), 0], [w('s12', '됩니다', 0.35), T_HOT], [w('s13', '두'), T_HOT], [P.meet, -40],
    [P.k0 + 0.1, -40], [P.k0 + 1.1, 20], [P.drop[0], 20], [P.drop[1], ABS0], [P.addT[0], ABS0], [P.addT[1], T_HOT],
    [P.m0 + 0.5, T_HOT], [P.m0 + 0.6, 20], [P.cl0 + 0.05, 20], [P.hot1, T_HOT],
  ];
  P.T = knotFn(P.Tk);
  // particle phase in the kelvin scene: ∫ speed(K(t)) dt (box widths at unit speed)
  { const t0 = P.k0, t1 = sc('kelvin').end, d = 1 / 120, n = Math.ceil((t1 - t0) / d) + 2, PH = new Float64Array(n);
    for (let i = 1; i < n; i++) PH[i] = PH[i - 1] + speedK(K_OF_C(P.T(t0 + (i - 0.5) * d))) * d;
    P.phaseK = t => { const u = clamp((t - t0) / d, 0, n - 1.001), i = Math.floor(u); return lerp(PH[i], PH[i + 1], u - i); }; }
  // ordering checks (the plan follows the words; warn if a new timeline squeezes two animations into each other)
  P.warnings = [['boil→top', P.boil, P.boilTop], ['top→no', P.boilTop, P.no], ['divisions→fahr', P.div1, P.f0], ['96 sweep→refine', P.div96[1], P.later],
    ['180 sweep→scene end', P.div180[1], sc('fahr').end], ['100 sweep→"영도"', P.div100[1], P.lab0], ['flip→names', P.flip[1], P.shift[0]],
    ['°C sweep→°F sweep', P.sweepC[1], P.sweepF[0]], ['zoom→graph', P.zoom[1], P.toB[0]], ['−40→scene end', P.meet, sc('convert').end - 0.5],
    ['zoom out→drop end', P.zoomK[1], P.drop[1]], ['0 K→add', P.zeroK, P.addT[0]], ['rebase→293', P.toK[0], P.k293], ['6500 K→tag', P.k65[1], P.colT + 0.6],
    ['38→100→311', P.r38, P.r100], ['311→poster', P.r311, P.reason]].filter(([, a, b]) => !(a <= b)).map(([n, a, b]) => `${n}: ${a.toFixed(2)} > ${b.toFixed(2)}`);
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const gr = c.createLinearGradient(0, 0, W * 0.3, H); gr.addColorStop(0, '#1C1D20'); gr.addColorStop(1, T.deep);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  glow(c, 560, 820, 900, '#FFD9B0', 0.035);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
const pop = (t, t0, d = 0.5) => (t < t0 || t > t0 + d ? 0 : Math.sin(Math.PI * (t - t0) / d));
const MINUS = '−';
export const fmt = (v, d = 1) => { const s = Math.abs(v).toFixed(d); return v < 0 && +s !== 0 ? MINUS + s : s; };
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 26, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 7, rgba(stage.theme.plate, o.plateA ?? 0.88), o.border ? rgba(o.border, 0.95) : null, 1.5);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12, border = null) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(border || T.border, 1), border ? 2.5 : 1.5); }
function cross(c, x, y, s, col = COL.bad, w = 5, q = 1) {
  if (q <= 0) return; const a = Math.min(1, q * 2), b = clamp(q * 2 - 1);
  line(c, [[x - s, y - s], [lerp(x - s, x + s, a), lerp(y - s, y + s, a)]], col, w);
  if (b > 0) line(c, [[x + s, y - s], [lerp(x + s, x - s, b), lerp(y - s, y + s, b)]], col, w);
}
/** readout tile: small label above a big value. o: {h, size, col, a, hi (accent border), sub} */
function tile(stage, cx, y, w, label, value, o = {}) {
  const c = stage.ctx, T = stage.theme, h = o.h ?? 104;
  withAlpha(c, o.a ?? 1, () => {
    panel(c, T, cx - w / 2, y, w, h, 0.9, 12, o.hi > 0 ? mix(T.border, T.accent, o.hi) : null);
    stage.text(label, cx, y + 27, {size: 24, weight: 700, color: o.labelCol || T.muted, align: 'center'});
    stage.text(value, cx, y + h * 0.66, {role: 'display', size: o.size ?? 40, weight: 700, color: o.col || T.ink, align: 'center', maxWidth: w - 16});
  });
}
const lerpObj = (A, B, q) => { const o = {}; for (const k of Object.keys(B)) o[k] = typeof B[k] === 'number' && typeof A[k] === 'number' ? lerp(A[k], B[k], q) : (q < 0.5 ? A[k] : B[k]); return o; };
const mapY = M => c => M.y0 + (c - M.T0) * (M.y1 - M.y0) / (M.T1 - M.T0);

// =====================================================================================================
// Instruments: thermometer, ruler, knob, level line
// =====================================================================================================
/** glass thermometer. o: {x, top, bulbY, w, r, yLevel, a} */
function thermometer(stage, o) {
  const c = stage.ctx, {x, top, bulbY, w, r} = o, bw = Math.max(8, w * 0.36);
  withAlpha(c, o.a ?? 1, () => {
    glow(c, x, bulbY, r * 2.6, COL.liquid, 0.16 * (o.heat ?? 1));
    // glass body (back)
    rect(c, x - w / 2, top, w, bulbY - top, w / 2, rgba('#0E1012', 0.72), null);
    circle(c, x, bulbY, r, rgba('#0E1012', 0.78));
    // liquid: bulb + column
    const yl = clamp(o.yLevel, top + w * 0.45, bulbY - r * 0.55);
    const lg = c.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0); lg.addColorStop(0, mix(COL.liquid, '#7A1A08', 0.35)); lg.addColorStop(0.45, COL.liquidHi); lg.addColorStop(1, COL.liquid);
    rect(c, x - bw / 2, yl, bw, bulbY - yl, bw / 2, lg);
    sphere(c, x, bulbY, r * 0.8, COL.liquid, {light: '#FFD7B0', shade: '#6A1606'});
    circle(c, x, yl + 2, bw * 0.34, rgba('#FFE7D0', 0.8));                                  // meniscus highlight
    // glass (front): rim, highlights
    c.save(); c.beginPath(); c.roundRect(x - w / 2, top, w, bulbY - top - r * 0.6, w / 2); c.strokeStyle = rgba(COL.glass, 0.55); c.lineWidth = 2.2; c.stroke(); c.restore();
    ring(c, x, bulbY, r, rgba(COL.glass, 0.55), 2.2, -Math.PI / 2 + 0.38, 3 * Math.PI / 2 - 0.38);
    line(c, [[x - w * 0.28, top + w * 0.6], [x - w * 0.28, bulbY - r * 1.05]], rgba('#FFFFFF', 0.22), Math.max(2, w * 0.09));
    ring(c, x, bulbY, r * 0.72, rgba('#FFFFFF', 0.28), Math.max(2, r * 0.07), Math.PI * 1.1, Math.PI * 1.45);
    if (o.glint > 0 && o.glint < 1) clipRect(c, x - w / 2, top, w, bulbY - top, w / 2, () => {           // a glint running up the glass
      const gy = lerp(bulbY, top - 60, o.glint), g = c.createLinearGradient(0, gy - 60, 0, gy + 60);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - w / 2, gy - 60, w, 120);
    });
  });
  return clamp(o.yLevel, top + w * 0.45, bulbY - r * 0.55);
}
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
const pickStep = (px, min, from = 0) => STEPS.find(s => s >= from && s * px >= min) ?? 500;
/**
 * A scale next to the thermometer. o: {u (unit key), x, y (°C → y), lo, hi (unit values), side ±1 (tick direction),
 * lab ±1 (label side), len, col, a, minor, major, labels: 'auto' | [values] | null, must: [values], labelMin (px), size,
 * reveal(u) → 0..1 (per tick), labA, labFn(u) → string, avoidY (skip labels near this y), squash (label y-scale), clip [y0,y1]}
 */
function ruler(stage, o) {
  const c = stage.ctx, U = UNITS[o.u], a = o.a ?? 1; if (a <= 0) return;
  const col = o.col || U.col, yOf = u => o.y(U.toC(u)), px = Math.abs(yOf(o.lo + 1) - yOf(o.lo));
  const len = o.len ?? 26, side = o.side ?? 1, lab = o.lab ?? side, size = o.size ?? 26;
  const minor = pickStep(px, o.minPx ?? 2.6, o.minor ?? 1), major = Math.max(o.major ?? 10, minor * 2);
  const clipY = o.clip || [-1e9, 1e9];
  withAlpha(c, a, () => {
    const ys = [yOf(o.lo), yOf(o.hi)].map(y => clamp(y, clipY[0], clipY[1]));
    line(c, [[o.x, ys[0]], [o.x, ys[1]]], rgba(col, 0.85), 2.4, {cap: 'butt'});
    const k0 = Math.ceil(o.lo / minor - 1e-6), k1 = Math.floor(o.hi / minor + 1e-6);
    const full = [];
    for (let k = k0; k <= k1; k++) {
      const u = +(k * minor).toFixed(6), y = yOf(u); if (y < clipY[0] - 1 || y > clipY[1] + 1) continue;
      const isMaj = Math.abs(u / major - Math.round(u / major)) < 1e-6, isMid = !isMaj && Math.abs(u / (major / 2) - Math.round(u / (major / 2))) < 1e-6;
      const L = isMaj ? len : isMid ? len * 0.68 : len * 0.42, rv = o.reveal ? o.reveal(u) : 1;
      if (rv <= 0) continue;
      if (rv >= 1) full.push(y, L);
      else line(c, [[o.x, y], [o.x + side * L * rv, y]], rgba(col, rv), isMaj ? 2.4 : 1.6, {cap: 'butt'});
    }
    if (full.length) { c.save(); c.beginPath(); for (let i = 0; i < full.length; i += 2) { c.moveTo(o.x, full[i]); c.lineTo(o.x + side * full[i + 1], full[i]); } c.strokeStyle = rgba(col, 0.9); c.lineWidth = 1.7; c.lineCap = 'butt'; c.stroke(); c.restore(); }
    // labels
    if (o.labels === null || (o.labA ?? 1) <= 0) return;
    let vals = [];
    if (Array.isArray(o.labels)) vals = o.labels.slice();
    else { const st = pickStep(px, o.labelMin ?? 44, major / 2 >= 1 ? 1 : 0.1); const j0 = Math.ceil(o.lo / st - 1e-6), j1 = Math.floor(o.hi / st + 1e-6); for (let j = j0; j <= j1; j++) vals.push(+(j * st).toFixed(6)); }
    const must = o.must || [];
    vals = vals.filter(v => !must.some(m => Math.abs(yOf(m) - yOf(v)) < size * 1.6 && m !== v)).concat(must.filter(m => !vals.includes(m)));
    withAlpha(c, o.labA ?? 1, () => {
      for (const v of vals) {
        const y = yOf(v); if (y < clipY[0] - 2 || y > clipY[1] + 2) continue;
        if (o.avoidY != null && Math.abs(y - o.avoidY) < size * 0.95) continue;
        const ra = o.labReveal ? o.labReveal(v) : 1; if (ra <= 0) continue;
        const s = o.labFn ? o.labFn(v) : fmt(v, Math.abs(v - Math.round(v)) > 1e-6 ? 1 : 0), tx = o.x + lab * (len + 10);
        const sq = o.squash ?? 1;
        c.save(); c.translate(tx, y); c.scale(1, Math.max(0.02, sq));
        stage.text(s, 0, 0, {size, weight: 500, color: o.labCol || mix(col, '#FFFFFF', 0.25), align: lab > 0 ? 'left' : 'right', alpha: ra});
        c.restore();
      }
    });
  });
}
/** rotary temperature knob */
function knob(stage, x, y, T, Tmin, Tmax, a = 1, label = '온도 손잡이') {
  const c = stage.ctx, R = 38, q = clamp((T - Tmin) / (Tmax - Tmin)), a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  withAlpha(c, a, () => {
    for (let k = 0; k <= 20; k++) { const an = lerp(a0, a1, k / 20); line(c, [[x + Math.cos(an) * (R + 7), y + Math.sin(an) * (R + 7)], [x + Math.cos(an) * (R + 15), y + Math.sin(an) * (R + 15)]], mix('#6FB7E8', '#FF7A35', k / 20), k % 5 ? 2 : 3.5); }
    sphere(c, x, y, R, '#4A4C52', {light: '#B9BBC0', shade: '#101113'});
    const an = lerp(a0, a1, q);
    line(c, [[x + Math.cos(an) * 8, y + Math.sin(an) * 8], [x + Math.cos(an) * (R - 6), y + Math.sin(an) * (R - 6)]], COL.hot, 5);
    stage.text(label, x, y + R + 32, {size: 24, weight: 700, color: stage.theme.muted, align: 'center'});
  });
}
/** dashed level line from the column top across the rulers; gaps [[x0,x1],…] leave the label columns readable */
function levelLine(c, x0, x1, y, a = 1, col = COL.hot, gaps = []) {
  if (a <= 0) return; let x = x0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g1 <= x || g0 >= x1) continue; if (g0 > x) line(c, [[x, y], [g0, y]], rgba(col, 0.75 * a), 2.5, {dash: [9, 7]}); x = Math.max(x, g1); }
  if (x1 > x) line(c, [[x, y], [x1, y]], rgba(col, 0.75 * a), 2.5, {dash: [9, 7]});
}
/** objects the bulb is dipped into (drawn over the bulb): 'mix' (ice + ammonium chloride), 'ice' (ice water), 'boil' (pot) */
function dipped(stage, kind, L, t, a = 1, label = '', fall = 1) {
  if (a <= 0) return; const c = stage.ctx, x = L.tx, y = L.bulbY, r = L.br, Th = stage.theme;
  let wR = 0;
  withAlpha(c, a, () => {
    if (kind === 'boil') {
      const w = r * 4.2, h = r * 2.5, top = y - r * 1.15; wR = w / 2;
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.55 + k / 4) % 1, xx = x + (k - 1.5) * w * 0.24, pts = [];
        for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([xx + Math.sin(u * 6 + t * 2 + k) * 8, top - 10 - u * 90 - ph * 14]); }
        line(c, pts, rgba(COL.steam, 0.42 * (1 - ph * 0.6)), 3.5);
      }
      rect(c, x - w / 2, top, w, h, [4, 4, w * 0.16, w * 0.16], '#5E636B', rgba('#C9CDD3', 0.7), 2);
      const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.35, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
      rect(c, x - w / 2, top, w, h, [4, 4, w * 0.16, w * 0.16], g);
      rect(c, x - w * 0.54, top - 7, w * 1.08, 10, 4, '#8A9098');
      rect(c, x - w * 0.68, top + h * 0.22, w * 0.15, 10, 4, '#8A9098'); rect(c, x + w * 0.53, top + h * 0.22, w * 0.15, 10, 4, '#8A9098');
      for (let k = 0; k < 6; k++) { const bx = x - w * 0.36 + k * w * 0.144, by = top + 4 - ((t * 1.7 + k * 0.37) % 1) * 5; if (Math.abs(bx - x) > L.tw * 0.6) circle(c, bx, by, 3.2, rgba('#E8F6FF', 0.6)); }
    } else {
      const w = r * 3.6, top = y - r * 1.6, bot = y + r * 1.55; wR = w / 2;
      const lvl = top + r * 0.55;
      poly(c, [[x - w / 2 + 7, lvl], [x + w / 2 - 7, lvl], [x + w / 2 - 10, bot - 4], [x - w / 2 + 10, bot - 4]], rgba(kind === 'ice' ? COL.water : '#8FB2C4', 0.42));
      const cubes = kind === 'ice' ? [[-0.34, 0.15, 0.2], [0.33, 0.25, 0.19], [-0.3, 0.62, 0.17], [0.3, 0.7, 0.18]] : [[-0.34, 0.2, 0.17], [0.34, 0.3, 0.16], [-0.33, 0.68, 0.15], [0.33, 0.74, 0.16], [-0.12, 0.88, 0.13], [0.14, 0.9, 0.12]];
      cubes.forEach(([dx, dy, s2], k) => { c.save(); c.translate(x + dx * w, lvl + dy * (bot - lvl) - 4); c.rotate(k * 0.8 + 0.3); rect(c, -s2 * w / 2, -s2 * w / 2, s2 * w, s2 * w, 3, rgba(COL.ice, 0.88), rgba('#FFFFFF', 0.85), 1.5); c.restore(); });
      if (kind === 'mix') for (let k = 0; k < 22; k++) {                      // ammonium chloride crystals falling in
        const u = clamp(fall * 1.6 - (k / 22) * 0.6), sx = x + (rand(k + 3) - 0.5) * w * 0.8, sy = lerp(top - 70 - rand(k + 9) * 40, lvl + 6 + rand(k + 40) * (bot - lvl - 16), easeInOut(u));
        if (fall > 0) circle(c, sx, sy, 3, rgba('#FFFFFF', 0.9));
      }
      line(c, [[x - w / 2, top], [x - w / 2 + 6, top + 8], [x - w / 2 + 10, bot], [x + w / 2 - 10, bot], [x + w / 2 - 6, top + 8], [x + w / 2 + 4, top - 6]], rgba(COL.glass, 0.85), 2.5);
    }
    if (label) stage.text(label, x + wR + 18, y + r * 0.45, {size: 26, weight: 700, color: Th.ink});
  });
}

// ---- icons ----
function iceCup(c, x, y, s, a = 1) {
  withAlpha(c, a, () => {
    const w = s, h = s * 1.1, top = y - h / 2, bot = y + h / 2;
    poly(c, [[x - w / 2, top], [x + w / 2, top], [x + w * 0.4, bot], [x - w * 0.4, bot]], rgba('#9FD4F0', 0.10), rgba(COL.glass, 0.75), 2.5);
    poly(c, [[x - w * 0.47, top + h * 0.25], [x + w * 0.47, top + h * 0.25], [x + w * 0.4, bot - 2], [x - w * 0.4, bot - 2]], rgba(COL.water, 0.55));
    for (const [dx, dy, r] of [[-0.18, 0.28, 0.2], [0.14, 0.22, 0.18], [0.0, 0.5, 0.17]]) {
      c.save(); c.translate(x + dx * w, top + dy * h); c.rotate(dx * 3 + 0.3); rect(c, -r * w / 2, -r * w / 2, r * w, r * w, 3, rgba(COL.ice, 0.92), rgba('#FFFFFF', 0.9), 1.5); c.restore();
    }
  });
}
function pot(c, x, y, s, t, a = 1) {
  withAlpha(c, a, () => {
    const w = s, h = s * 0.62;
    for (let k = 0; k < 3; k++) {                                             // steam
      const ph = (t * 0.6 + k / 3) % 1, xx = x + (k - 1) * w * 0.25, pts = [];
      for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([xx + Math.sin(u * 6 + t * 2 + k) * w * 0.06, y - h / 2 - 8 - u * h * 1.3 - ph * 10]); }
      line(c, pts, rgba(COL.steam, 0.45 * (1 - ph * 0.6)), 3.5);
    }
    rect(c, x - w / 2, y - h / 2, w, h, [4, 4, w * 0.18, w * 0.18], '#5E636B', rgba('#C9CDD3', 0.7), 2);
    rect(c, x - w * 0.56, y - h / 2 - 6, w * 1.12, 9, 4, '#8A9098');
    rect(c, x - w * 0.72, y - h * 0.25, w * 0.18, 9, 4, '#8A9098'); rect(c, x + w * 0.54, y - h * 0.25, w * 0.18, 9, 4, '#8A9098');
    for (let k = 0; k < 4; k++) { const bx = x - w * 0.3 + k * w * 0.2, by = y - h * 0.5 + 6 - ((t * 1.6 + k * 0.37) % 1) * 4; circle(c, bx, by, 3, rgba('#E8F6FF', 0.6)); }
  });
}
function beaker(c, x, y, s, a = 1) {
  withAlpha(c, a, () => {
    const w = s * 0.86, h = s * 1.1, top = y - h / 2, bot = y + h / 2;
    poly(c, [[x - w * 0.42, bot - h * 0.55], [x + w * 0.42, bot - h * 0.55], [x + w * 0.42, bot - 3], [x - w * 0.42, bot - 3]], rgba('#BFD9E6', 0.35));
    for (let k = 0; k < 7; k++) { const px = x - w * 0.32 + (k % 4) * w * 0.2 + (k > 3 ? w * 0.1 : 0), py = bot - h * (k > 3 ? 0.4 : 0.2); c.save(); c.translate(px, py); c.rotate(k * 0.9); rect(c, -9, -9, 18, 18, 3, rgba(COL.ice, 0.9)); c.restore(); }
    for (let k = 0; k < 14; k++) circle(c, x - w * 0.36 + rng(k + 3)() * w * 0.72, bot - 6 - rng(k + 40)() * h * 0.5, 2.6, rgba('#FFFFFF', 0.85));
    line(c, [[x - w / 2, top], [x - w * 0.44, top + 10], [x - w * 0.44, bot], [x + w * 0.44, bot], [x + w * 0.44, top + 10], [x + w * 0.52, top - 4]], rgba(COL.glass, 0.8), 2.5);
  });
}
function person(c, x, y, s, a = 1) {
  withAlpha(c, a, () => {
    const col = '#B9A08A';
    circle(c, x, y - s * 0.32, s * 0.24, col);
    c.beginPath(); c.moveTo(x - s * 0.48, y + s * 0.5); c.quadraticCurveTo(x - s * 0.46, y - s * 0.02, x, y - s * 0.04); c.quadraticCurveTo(x + s * 0.46, y - s * 0.02, x + s * 0.48, y + s * 0.5); c.closePath(); c.fillStyle = col; c.fill();
  });
}
function sunIcon(c, x, y, r, a = 1) {
  withAlpha(c, a, () => { for (let k = 0; k < 8; k++) { const an = k * TAU / 8; line(c, [[x + Math.cos(an) * r * 1.35, y + Math.sin(an) * r * 1.35], [x + Math.cos(an) * r * 1.75, y + Math.sin(an) * r * 1.75]], '#FFC15A', 4); } circle(c, x, y, r, '#FFC15A'); });
}

// ---- hot summer evening (poster, hook, close) ----
const CITY = (() => { const r = rng(11), far = [], near = []; let x = -30; while (x < 1110) { const w = 40 + r() * 70; far.push({x, w, h: 150 + r() * 150}); x += w + r() * 6; }
  x = -40; while (x < 1120) { const w = 60 + r() * 110; near.push({x, w, h: 70 + r() * 190, seed: r()}); x += w + 2 + r() * 10; } return {far, near}; })();
function summer(stage, t, a = 1, o = {}) {
  if (a <= 0) return; const c = stage.ctx, H = stage.H, hz = o.horizon ?? 1600, heat = o.heat ?? 0;
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#0D0B18'); g.addColorStop(0.42, '#22152E'); g.addColorStop(0.7, '#4A1D38'); g.addColorStop(0.88, '#93362F'); g.addColorStop(1, '#E2702F');
    c.fillStyle = g; c.fillRect(0, 0, 1080, hz + 10);
    glow(c, 720, hz - 30, 520, '#FF9A3D', 0.30 + 0.12 * heat);
    circle(c, 720, hz - 10, 96, rgba('#FFC27A', 0.9));
    for (let k = 0; k < 6; k++) {                                            // heat shimmer above the roofs
      const yy = hz - 240 + k * 34 - ((t * 9 + k * 13) % 34), pts = [];
      for (let i = 0; i <= 54; i++) { const xx = i * 20; pts.push([xx, yy + Math.sin(xx * 0.025 + t * 2.2 + k) * 4]); }
      line(c, pts, rgba('#FFB070', (0.06 + 0.07 * heat) * (1 - k / 7)), 2.5);
    }
    for (const b of CITY.far) rect(c, b.x, hz - b.h + 60, b.w, H, 0, '#2A1626');
    const ng = c.createLinearGradient(0, hz - 400, 0, H); ng.addColorStop(0, '#120B12'); ng.addColorStop(1, '#070508');
    for (const b of CITY.near) {
      const top = hz + 30 - b.h; rect(c, b.x, top, b.w, H - top, 0, ng);
      const r = rng(Math.floor(b.seed * 1e6));
      for (let yy = top + 18; yy < H - 30; yy += 34) for (let xx = b.x + 10; xx < b.x + b.w - 16; xx += 24) if (r() < 0.16) rect(c, xx, yy, 11, 15, 1, rgba('#FFC77A', 0.35 + 0.3 * r()));
    }
    if ((o.dim ?? 0) > 0) { c.fillStyle = rgba('#0A0810', clamp(o.dim)); c.fillRect(0, 0, 1080, H); }   // dim as a whole (no see-through layers)
  });
}

// =====================================================================================================
// Layouts (tube, vertical map, ruler positions)
// =====================================================================================================
export const L_POSTER = {tx: 540, top: 250, bulbY: 1480, tw: 64, br: 80, T0: -10, y0: 1360, T1: 50, y1: 330};
export const L_PANEL = {tx: 420, top: 500, bulbY: 1215, tw: 46, br: 46, T0: -10, y0: 1150, T1: 110, y1: 530};
const L_FAHR = {...L_PANEL, T0: -25, y0: 1150, T1: 105, y1: 530};
const L_NAMES = {...L_PANEL, tx: 205};
const L_CONV_A = {tx: 210, top: 500, bulbY: 1215, tw: 46, br: 46, T0: 0, y0: 1130, T1: 100, y1: 560};
const L_CONV_Z = {...L_CONV_A, tx: 170, T0: 15, y0: 1130, T1: 25, y1: 560};
const L_CONV_B = {tx: 180, top: 500, bulbY: 1225, tw: 40, br: 40, T0: -60, y0: 1180, T1: 110, y1: 520};
const L_KEL_Z = {...L_PANEL, bulbY: 1238, T0: -290, y0: 1190, T1: 110, y1: 540};
const tubeOf = (L, yLevel, a = 1, heat = 1, glint = 0) => ({x: L.tx, top: L.top, bulbY: L.bulbY, w: L.tw, r: L.br, yLevel, a, heat, glint});
const panelGaps = L => { const xF = L.tx + L.tw / 2 + 12; return [[xF + 30, xF + 92]]; };

/** the hook / close panel: thermometer, °C (left), °F (right), K (far right), tiles, knob, level line */
function panelHook(stage, t, T, o) {
  const c = stage.ctx, Th = stage.theme, L = o.L, Y = mapY(L), yl = Y(T), q = o.q ?? 1, lq = smooth((q - 0.45) / 0.55);
  const ry = [L.y1 - 20, L.y0 + 10];
  ruler(stage, {u: 'C', x: L.tx - L.tw / 2 - 12, y: Y, lo: lerp(-10, -10, q), hi: lerp(50, 110, q), side: -1, len: lerp(34, 26, q), labA: lq * (o.labA ?? 1), a: o.aC ?? 1, clip: ry, major: 10, labelMin: 46});
  ruler(stage, {u: 'F', x: L.tx + L.tw / 2 + 12, y: Y, lo: 14, hi: lerp(122, 230, q), side: 1, len: lerp(34, 26, q), labA: lq * (o.labA ?? 1), a: o.aF ?? 1, clip: ry, major: 10, minPx: lerp(8, 2.6, q), labelMin: 52});
  if ((o.aK ?? 0) > 0) ruler(stage, {u: 'K', x: o.kx ?? 700, y: Y, lo: 263, hi: 383, side: 1, len: 26, a: o.aK, clip: ry, major: 10, labelMin: 46, labA: lq * (o.labA ?? 1)});
  const ylv = thermometer(stage, tubeOf(L, yl, 1, o.heat ?? 1));
  const xF = L.tx + L.tw / 2 + 12;
  levelLine(c, L.tx + L.tw / 2 + 4, lerp(L.tx + 120, (o.aK ?? 0) > 0.05 ? (o.kx ?? 700) + 30 : xF + 30, q), ylv, o.lvA ?? q, COL.hot, [[xF + 30, xF + 92]]);
  return ylv;
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '화씨 100도면 물이 끓을까?'],
  origin: ['기원 · 처음의 온도계', '오르내림만 보였다'],
  fahr: ['역사 · 1724년', '파렌하이트의 눈금'],
  cels: ['역사 · 1742년', '셀시우스의 100칸'],
  convert: ['본질 · 칸의 크기', '100칸과 180칸'],
  kelvin: ['역사 · 1848년', '절대영도에서 시작하는 눈금'],
  myth: ['오해 바로잡기', '20도는 10도의 두 배?'],
  use: ['쓰임 · 색온도', '전구 상자의 6500K'],
  close: ['정리', '같은 무더위, 세 숫자'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [tl.at('s04') - 0.55, '본질 · 눈금 만들기', '기준점 두 개 + 고르게 나누기']];
  if (id === 'fahr') return [[-Infinity, ...titles.fahr], [tl.at('s07') - 0.55, '역사 · 다듬은 눈금', '어는 점 32, 끓는 점 212']];
  if (id === 'cels') return [[-Infinity, ...titles.cels], [tl.at('s09') - 0.55, '역사 · 거꾸로 눈금', '처음엔 끓는 점이 0'], [tl.at('s10') - 0.55, '이름 · 한자', '섭씨(攝氏)와 화씨(華氏)']];
  if (id === 'convert') return [[-Infinity, ...titles.convert], [P.toB[0] + 0.2, '본질 · 환산', '섭씨를 화씨로 바꾸기'], [tl.at('s13') - 0.55, '본질 · 만나는 점', '영하 40도에서 같은 숫자']];
  if (id === 'kelvin') return [[-Infinity, ...titles.kelvin], [tl.at('s15') - 0.55, '본질 · 켈빈', '칸은 그대로, 바닥은 0 K']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 34, color: T.accent, align: 'center', ...so}));
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', POSTER_Q.q, fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, POSTER_Q.ans, ho, 'rgba(0,0,0,0.95)');
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  if (id === 'close') {
    const a = smooth(ctx.scene.p / 0.04) * fadeOut(t, P.reason - 0.35, 0.3);
    if (a > 0) head(stage, ...titles.close, a, a);
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
const POSTER_Q = {y: 1012, y2: 1184, q: '화씨 100도면 물이 끓을까?', ans: '아니, 섭씨 38도'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q, 790, 88); ASIZE ||= fit(POSTER_Q.ans, 800, 190);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 34, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 880, 0, 1310); g2.addColorStop(0, 'rgba(8,4,10,0)'); g2.addColorStop(0.2, 'rgba(8,4,10,0.74)'); g2.addColorStop(0.82, 'rgba(8,4,10,0.74)'); g2.addColorStop(1, 'rgba(8,4,10,0)');
    c.fillStyle = g2; c.fillRect(0, 880, 1080, 430);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    stage.text(POSTER_Q.q, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: sh, shadowBlur: 20, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: T.accent, align: 'center', tracking: tr * s2, shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 26});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/temperature-scales/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl); let h = 0;
  for (let t = 0; t < tl.duration; t += 0.7) h += P.T(t) / 1000;
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${P.Tk.length}/${KE_RATIO.toFixed(5)}/${bbColor(2700)}${bbColor(6500)}/${[P.div96[0], P.div180[0], P.div100[0], P.sweepC[0], P.sweepF[0], P.flip[0], P.meet].map(x => x.toFixed(3)).join(',')}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  fahr(stage, t, p, ctx) { fahrScene(stage, t, ctx); },
  cels(stage, t, p, ctx) { celsScene(stage, t, ctx); },
  convert(stage, t, p, ctx) { convertScene(stage, t, ctx); },
  kelvin(stage, t, p, ctx) { kelvinScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  use(stage, t, p, ctx) { useScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1340, 0, 1620);
  g.addColorStop(0, 'rgba(6,4,8,0)'); g.addColorStop(0.35, `rgba(6,4,8,${0.66 * a})`); g.addColorStop(0.75, `rgba(6,4,8,${0.66 * a})`); g.addColorStop(1, 'rgba(6,4,8,0)');
  c.fillStyle = g; c.fillRect(0, 1340, 1080, 280);
}

// ------------------------------------------------------------------ poster picture (t = 0 and the close bookend)
function posterPicture(stage, t, a = 1, T = T_HOT) {
  const c = stage.ctx, L = L_POSTER, Y = mapY(L), yl = Y(T);
  summer(stage, t, a, {heat: 0.6});
  withAlpha(c, a, () => {
    ruler(stage, {u: 'C', x: L.tx - L.tw / 2 - 12, y: Y, lo: -10, hi: 50, side: -1, len: 34, labels: null, major: 10, minPx: 8});
    ruler(stage, {u: 'F', x: L.tx + L.tw / 2 + 12, y: Y, lo: 14, hi: 122, side: 1, len: 34, labels: null, major: 10, minPx: 8});
    const ylv = thermometer(stage, tubeOf(L, yl, 1, 1.4));
    levelLine(c, L.tx - 210, L.tx + 210, ylv, 1);
    bigReadout(stage, '38', '°C', L.tx - 74, ylv, -1, COL.C, 168);
    bigReadout(stage, '100', '°F', L.tx + 74, ylv, 1, COL.F, 168);
    pot(c, 836, 770, 110, t, 0.85);
    stage.text('끓는 물 100 °C', 836, 850, {size: 30, weight: 700, color: '#C9C1B6', align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
  });
}
/** a huge numeral + unit beside the level line (poster) */
let BIG_K = 0;
function bigReadout(stage, num, unit, x, y, side, col, size0, a = 1) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.85)', shadowBlur: 22};
  // one common scale so that "100 °F" fits between the tube and x = 930 (and "38 °C" matches it)
  BIG_K ||= Math.min(1, 300 / (stage.measure('100', {role: 'display', weight: 700, size: 100}) + stage.measure('°F', {role: 'display', weight: 700, size: 42}) + 8) * 100 / 168);
  const size = size0 * BIG_K;
  const wn = stage.measure(num, {role: 'display', weight: 700, size}), wu = stage.measure(unit, {role: 'display', weight: 700, size: size * 0.42});
  const x0 = side < 0 ? x - wn - wu - 8 : x;
  withAlpha(c, a, () => {
    stage.text(num, x0, y - size * 0.06, {role: 'display', weight: 700, size, color: col, ...so});
    stage.text(unit, x0 + wn + 8, y - size * 0.22, {role: 'display', weight: 700, size: size * 0.42, color: col, ...so});
  });
}

// ------------------------------------------------------------------ hook: poster → panel with three scales → "100 °F is not boiling"
function hookScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0]));
  if (t < MORPH[0]) { posterPicture(stage, t); return; }
  const heat = fadeIn(t, P.heat, 0.6);
  summer(stage, t, 1, {heat: 0.6 + heat, dim: lerp(0, 0.5, q) - 0.18 * heat});
  const L = lerpObj(L_POSTER, L_PANEL, q), Y = mapY(L);
  // K ruler slides in on "켈빈까지"
  const kq = easeOut((t - P.kIn) / 0.8), kx = lerp(800, 700, kq);
  const ylv = panelHook(stage, t, T, {L, q, aK: kq, kx, heat: 1 + heat});
  // poster numerals shrink away
  if (q < 1) { const ba = 1 - smooth(q / 0.45); bigReadout(stage, '38', '°C', L.tx - lerp(74, 60, q), ylv, -1, COL.C, lerp(168, 60, q), ba); bigReadout(stage, '100', '°F', L.tx + lerp(74, 60, q), ylv, 1, COL.F, lerp(168, 60, q), ba); pot(c, 836, 770, 110, t, 0.85 * ba); }
  captionShade(c, fadeIn(t, P.cap0, 0.2));
  const ta = fadeIn(t, MORPH[1] - 0.1, 0.4);
  if (ta <= 0) return;
  // tiles (three scales), name tags pop on the words
  const hiC = Math.max(pop(t, P.tagC, 0.7), pop(t, P.three, 0.6), fadeIn(t, P.c38, 0.3) * fadeOut(t, P.heat + 0.8, 0.5));
  const hiF = Math.max(pop(t, P.tagF, 0.7), pop(t, P.three + 0.2, 0.6), fadeIn(t, P.f100, 0.3) * fadeOut(t, P.boil + 0.2, 0.4)), hiK = Math.max(pop(t, P.kIn + 0.4, 0.7), pop(t, P.three + 0.4, 0.6));
  withAlpha(c, ta, () => {
    tile(stage, 300, 336, 196, '섭씨 °C', fmt(T, 1), {col: COL.C, hi: hiC, a: fadeIn(t, MORPH[1] - 0.1, 0.4)});
    tile(stage, 540, 336, 196, '화씨 °F', fmt(F_OF_C(T), 1), {col: COL.F, hi: hiF});
    tile(stage, 780, 336, 196, '켈빈 K', fmt(K_OF_C(T), 1), {col: COL.K, hi: hiK, a: kq});
    knob(stage, 236, 1150, T, -10, 110, fadeIn(t, MORPH[1], 0.5));
    // "온도를 재는" pulse on the level line
    const pm = pop(t, P.measure, 0.9); if (pm > 0) levelLine(c, L.tx + L.tw / 2 + 4, 730, ylv, pm, '#FFE2B8', panelGaps(L));
    // s02: weather card, 100 °F, boiling pot at 100 °C, back to ≈ 38 °C
    const wa = fadeIn(t, P.wx, 0.4);
    if (wa > 0) withAlpha(c, wa, () => {
      panel(c, Th, 560, 1172, 360, 150, 0.92, 14);
      stage.text('미국 일기 예보', 590, 1206, {size: 24, weight: 700, color: Th.muted});
      sunIcon(c, 618, 1272, 20); stage.text('100°F', 670, 1272, {role: 'display', size: 56, weight: 700, color: COL.F});
      stage.text('맑음', 900, 1206, {size: 24, weight: 700, color: Th.muted, align: 'right'});
      const yF = Y(C_OF_F(100)), xl = L.tx + L.tw / 2 + 12;
      const fa = fadeIn(t, P.f100, 0.3);
      if (fa > 0) withAlpha(c, fa, () => { line(c, [[612, 1172], [xl + 70, yF + 27]], rgba(COL.F, 0.75), 2.5, {dash: [8, 6]}); ring(c, xl + 64, yF, 26, rgba(COL.F, 0.95), 3); });
    });
    const ba = fadeIn(t, P.boil, 0.35);
    if (ba > 0) withAlpha(c, ba, () => {
      const yB = Y(100); pot(c, 206, yB - 10, 84, t); tag(stage, '끓는 물', 206, yB + 50, {size: 26, color: Th.ink, plateA: 0.8});
      const ta2 = fadeIn(t, P.boilTop - 0.15, 0.3) * fadeOut(t, P.no + 0.3, 0.4);
      if (ta2 > 0) tag(stage, '끓는 물 = 100 °C = 212 °F', 540, 470, {size: 28, color: COL.F, a: ta2, border: COL.F});
    });
    const ca = fadeIn(t, P.c38 + 0.3, 0.4);
    if (ca > 0) tag(stage, '100 °F ≈ 섭씨 38도', 540, 470, {size: 30, color: Th.accent, a: ca, border: Th.accent});
  });
}

// ------------------------------------------------------------------ origin: a tube without a scale → two fixed points + equal divisions
function originScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), L = L_PANEL, Y = mapY(L), out = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const ra = 1 - fadeIn(t, ctx.scene.start, 0.5);                           // the hook's rulers fade away
  if (ra > 0) withAlpha(c, ra, () => { ruler(stage, {u: 'C', x: L.tx - L.tw / 2 - 12, y: Y, lo: -10, hi: 110, side: -1, len: 26, major: 10, labelMin: 46}); ruler(stage, {u: 'F', x: L.tx + L.tw / 2 + 12, y: Y, lo: 14, hi: 230, side: 1, len: 26, major: 10, labelMin: 52}); ruler(stage, {u: 'K', x: 700, y: Y, lo: 263, hi: 383, side: 1, len: 26, major: 10, labelMin: 46}); });
  const gx = L.tx + L.tw / 2 + 12, m1 = fadeIn(t, P.ref1, 0.3), m2 = fadeIn(t, P.ref2, 0.3);
  withAlpha(c, out, () => {
    // generic ruler: two marks, then equal divisions
    const dq = clamp((t - P.div0) / (P.div1 - P.div0));
    if (m1 > 0) ruler(stage, {u: 'GEN', x: gx, y: Y, lo: 0, hi: lerp(0, 10, m2), side: 1, len: 40, major: 10, minor: 1, labels: null, a: m1, reveal: u => (u === 0 || u === 10 ? 1 : clamp((dq * 10 - u + 1) * 1.5))});
    if (m1 > 0) tag(stage, '기준점 ①', gx + 58, Y(0), {size: 28, color: COL.C, a: m1, border: COL.C, align: 'left'});
    if (m2 > 0) tag(stage, '기준점 ②', gx + 58, Y(100), {size: 28, color: COL.C, a: m2, border: COL.C, align: 'left'});
    const da = fadeIn(t, P.div0 + 0.6, 0.4);
    if (da > 0) { const bx = gx + 214; line(c, [[bx - 12, Y(0)], [bx, Y(0)], [bx, Y(100)], [bx - 12, Y(100)]], rgba(Th.ink, 0.7 * da), 2.5); tag(stage, '고르게 10칸', bx + 16, Y(50), {size: 28, a: da, align: 'left'}); }
    const ex = fadeIn(t, P.anyone, 0.4);
    if (ex > 0) tag(stage, '누구나 다시 만들 수 있는 온도', 540, 470, {size: 26, color: Th.muted, a: ex * fadeOut(t, P.div0 - 0.2, 0.4)});
    // s03: no scale, only up and down; "몇 도?"
    const na = fadeIn(t, P.noScale, 0.4) * fadeOut(t, P.anyone, 0.4);
    if (na > 0) tag(stage, '눈금 없음', gx + 130, 860, {size: 30, color: COL.bad, a: na, border: COL.bad});
    const ua = fadeIn(t, P.updown, 0.4) * fadeOut(t, P.anyone, 0.4);
    if (ua > 0) withAlpha(c, ua, () => { const yl = Y(T); arrow(c, [L.tx + 64, yl + 40], [L.tx + 64, yl - 40], rgba(Th.ink, 0.8), 3); arrow(c, [L.tx + 64, yl - 40], [L.tx + 64, yl + 40], rgba(Th.ink, 0.8), 3); });
    const rv = fadeIn(t, P.read + 0.9, 0.3);
    tile(stage, 540, 336, 240, '읽은 값', rv > 0 ? '6.4칸' : '몇 도?', {col: rv > 0 ? COL.C : Th.ink, hi: Math.max(pop(t, P.what, 0.7), pop(t, P.read + 0.9, 0.6)), a: fadeIn(t, ctx.scene.start + 0.2, 0.4)});
  });
  const ylv = thermometer(stage, tubeOf(L, Y(T)));
  withAlpha(c, out, () => {
    if (m1 > 0) levelLine(c, L.tx + L.tw / 2 + 4, gx + 44, ylv, m1 * 0.9);
    // reproducible references: the bulb in ice water, then in boiling water
    dipped(stage, 'ice', L, t, fadeIn(t, P.anyone, 0.35) * fadeOut(t, P.climb - 0.15, 0.3), '얼음물');
    dipped(stage, 'boil', L, t, fadeIn(t, P.climb + 0.12, 0.3) * fadeOut(t, P.div1 + 0.2, 0.4), '끓는 물');
  });
}

// ------------------------------------------------------------------ fahr: 1724 · 0 = mixture, 96 = body → 32 / 212, 180 divisions
function fahrScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), out = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const L = lerpObj(L_PANEL, L_FAHR, easeInOut((t - ctx.scene.start) / 0.8)), Y = mapY(L);
  const ox = L.tx + L.tw / 2 + 12, nx = 640;
  const old = fadeIn(t, P.zero - 0.2, 0.3), dimOld = lerp(1, 0.45, fadeIn(t, P.later, 0.6)), ra = fadeIn(t, P.later, 0.6);
  withAlpha(c, out, () => {
    // card
    const ca = fadeIn(t, P.y1724, 0.4) * fadeOut(t, P.later - 0.2, 0.4);
    if (ca > 0) withAlpha(c, ca, () => { stage.text('Fahrenheit', 540, 372, {role: 'display', size: 44, weight: 700, color: COL.F, align: 'center'}); stage.text('네덜란드 · 온도계 제작자', 540, 426, {size: 26, weight: 500, color: Th.muted, align: 'center', alpha: fadeIn(t, P.nl, 0.4)}); });
    // the first scale: 0 (mixture) and 96 (body), divisions between
    const n96 = fadeIn(t, P.n96, 0.3), dq = clamp((t - P.div96[0]) / SWEEP);
    if (old > 0) ruler(stage, {u: 'F24', x: ox, y: Y, lo: 0, hi: lerp(0, 96, n96), side: 1, len: 30, major: 12, minor: 1, labels: [0, 96].filter(v => v === 0 || n96 > 0), a: old * dimOld,
      reveal: u => (u === 0 || u === 96 ? 1 : clamp((dq * 96 - u + 1) * 0.5)), labReveal: v => (v === 0 ? old : n96), labCol: '#E8DCCB'});
    const oa = fadeOut(t, P.later, 0.4);
    if (old > 0) tag(stage, '처음의 0도', ox + 100, Y(F24.mixC), {size: 26, color: COL.old, a: old * oa, align: 'left'});
    if (n96 > 0) tag(stage, '체온 = 96', ox + 100, Y(T_BODY), {size: 26, color: COL.old, a: n96 * oa, align: 'left'});
    if (old > 0) stage.text('1724 처음 눈금', ox + 6, Y(lerp(F24.mixC, T_BODY, n96)) - 52, {size: 24, weight: 700, color: COL.old, alpha: old * dimOld});
    // the refined scale (°F): 32 / 212, then 180 divisions; body → 98.6
    const n32 = fadeIn(t, P.n32, 0.3), n212 = fadeIn(t, P.n212, 0.3), sq = clamp((t - P.div180[0]) / SWEEP);
    if (ra > 0) {
      ruler(stage, {u: 'F', x: nx, y: Y, lo: -13, hi: 221, side: 1, len: 30, major: 10, minor: 1, a: ra, labels: [32, 212].filter(v => (v === 32 ? n32 : n212) > 0),
        reveal: u => (u === 32 ? n32 : u === 212 ? n212 : u > 32 && u < 212 ? clamp((sq * 180 - (u - 32) + 1) * 0.5) : 0), labReveal: v => (v === 32 ? n32 : n212)});
      stage.text('다듬은 눈금 °F', nx + 6, Y(105) - 6, {size: 24, weight: 700, color: COL.F, alpha: ra});
      const ba = fadeIn(t, P.bodyTag, 0.4);
      if (ba > 0) tag(stage, '체온 98.6', nx + 100, Y(T_BODY), {size: 26, color: COL.F, a: ba, align: 'left'});
      if (n32 > 0) tag(stage, '물이 어는 점', nx + 100, Y(0) + 40, {size: 24, color: Th.muted, a: n32, plate: false, align: 'left'});
      if (n212 > 0) tag(stage, '물이 끓는 점', nx + 100, Y(100) + 40, {size: 24, color: Th.muted, a: n212, plate: false, align: 'left'});
      const ka = fadeIn(t, P.c180 - 0.3, 0.4);
      if (ka > 0) { const bx = 900; line(c, [[bx - 12, Y(0)], [bx, Y(0)], [bx, Y(100)], [bx - 12, Y(100)]], rgba(COL.F, 0.85 * ka), 3); tag(stage, '180칸', bx - 18, Y(50), {size: 30, color: COL.F, a: ka, align: 'right', border: COL.F}); }
    }
  });
  const glint = clamp((t - P.maker) / 0.9);
  const ga = fadeIn(t, P.maker, 0.4) * fadeOut(t, P.ice - 0.3, 0.4);
  if (ga > 0) withAlpha(c, ga * out, () => {                                // a maker's thermometers: same temperature, same height
    for (const dx of [-210, 210]) { const L2 = {...L, tx: L.tx + dx, tw: 34, br: 34, top: L.top + 120}; thermometer(stage, tubeOf(L2, Y(T), 0.85, 0.6)); levelLine(c, L2.tx + 20, L2.tx + 70, Y(T), 0.7); }
    tag(stage, '같은 온도면 같은 높이', 540, 1300, {size: 26, color: Th.ink, plateA: 0.8});
  });
  const ylv = thermometer(stage, tubeOf(L, Y(T), 1, 1, glint));
  withAlpha(c, out, () => {
    levelLine(c, L.tx + L.tw / 2 + 4, lerp(ox + 32, nx + 32, ra), ylv, Math.max(old, ra) * 0.85, COL.hot, ra > 0 ? [[ox + 34, ox + 96]] : []);
    // the fixed-point objects, the bulb dipped in each
    dipped(stage, 'mix', L, t, fadeIn(t, P.ice, 0.35) * fadeOut(t, P.person - 0.1, 0.4), '얼음 + 염화암모늄', clamp((t - P.ice - 0.2) / 1.6));
    const pa = fadeIn(t, P.person, 0.35) * fadeOut(t, P.cupF - 0.1, 0.4);
    if (pa > 0) withAlpha(c, pa, () => {
      const px = L.tx - 170, py = L.bulbY - 20;
      c.save(); c.beginPath(); c.moveTo(px + 34, py + 24); c.quadraticCurveTo(px + 90, py + 60, L.tx - L.br * 1.05, L.bulbY + 4); c.strokeStyle = '#B9A08A'; c.lineWidth = 13; c.lineCap = 'round'; c.stroke(); c.restore();
      person(c, px, py, 120); circle(c, L.tx - L.br * 0.92, L.bulbY + 4, 15, rgba('#B9A08A', 0.92)); glow(c, L.tx - L.br, L.bulbY, 60, '#FFB070', 0.3);
      stage.text('사람의 체온', px, py + 86, {size: 26, weight: 700, color: Th.ink, align: 'center'});
    });
    dipped(stage, 'ice', L, t, fadeIn(t, P.cupF, 0.35) * fadeOut(t, P.potF - 0.1, 0.3), '얼음물');
    dipped(stage, 'boil', L, t, fadeIn(t, P.potF + 0.2, 0.3), '끓는 물');
  });
}

// ------------------------------------------------------------------ cels: 1742 · boiling 0 / freezing 100 → flip → names (攝氏 · 華氏)
function celsScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), out = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const sh = easeInOut((t - P.shift[0]) / (P.shift[1] - P.shift[0]));
  const L = sh > 0 ? lerpObj(L_PANEL, L_NAMES, sh) : lerpObj(L_FAHR, L_PANEL, easeInOut((t - ctx.scene.start) / 0.8)), Y = mapY(L);
  const rx = L.tx + L.tw / 2 + 12, fq = easeInOut((t - P.flip[0]) / (P.flip[1] - P.flip[0])), th = Math.PI * fq, mid = Y(50);
  const yFlip = cc => mid + (Y(cc) - mid) * Math.cos(th);
  const mB = fadeIn(t, P.boilC + 0.8, 0.3), mF = fadeIn(t, P.freezeC + 0.85, 0.3), dq = clamp((t - P.div100[0]) / SWEEP);
  const l0 = fadeIn(t, P.lab0, 0.3), l100 = fadeIn(t, P.lab100, 0.3), lAll = fadeIn(t, P.lab100 + 0.45, 0.4);
  const fadeA = fadeIn(t, P.c0 + 0.3, 0.4), flat = smooth((Math.abs(Math.cos(th)) - 0.9) / 0.08);   // labels only when the card faces us
  withAlpha(c, out, () => {
    // fahr's rulers fade out
    const fo = 1 - fadeIn(t, ctx.scene.start, 0.5);
    if (fo > 0) withAlpha(c, fo, () => ruler(stage, {u: 'F', x: 640, y: mapY(L_FAHR), lo: -13, hi: 221, side: 1, len: 30, major: 10, labels: [32, 212]}));
    // card
    const ca = fadeIn(t, P.y1742, 0.4) * fadeOut(t, P.lab0 - 0.3, 0.4);
    if (ca > 0) withAlpha(c, ca, () => { stage.text('Celsius', 540, 372, {role: 'display', size: 44, weight: 700, color: COL.C, align: 'center'}); stage.text('스웨덴 · 천문학자', 540, 426, {size: 26, weight: 500, color: Th.muted, align: 'center', alpha: fadeIn(t, P.astro, 0.4)}); });
    // the 1742 scale (0 at boiling, 100 at freezing) — flipped about the 50 mark like a card
    const col = mix(COL.old, COL.C, fq);
    if (mB > 0) {
      const labs = lAll > 0 ? [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] : [0, 100].filter(v => (v === 0 ? l0 : l100) > 0);
      ruler(stage, {u: 'C42', x: rx, y: cc => yFlip(cc), lo: 0, hi: lerp(0, 100, mF), side: 1, len: 32 * (1 + 0.3 * Math.sin(th)), major: 10, minor: 1, col, a: fadeA,
        reveal: u => (u === 0 || u === 100 ? 1 : clamp((dq * 100 - u + 1) * 0.5)), labels: labs, labReveal: v => (v === 0 ? l0 : v === 100 ? l100 : lAll), labA: flat, labCol: mix('#E8DCCB', '#BFE4F8', fq)});
      stage.text(fq >= 0.5 ? '섭씨 °C' : '1742 셀시우스 눈금', rx + 6, Y(110) - 4, {size: 24, weight: 700, color: col, alpha: fadeA * flat});
    }
    const ka = fadeIn(t, P.div100[1] - 0.2, 0.4) * fadeOut(t, P.lab0 - 0.3, 0.4);
    if (ka > 0) { const bx = 640; line(c, [[bx - 12, Y(0)], [bx, Y(0)], [bx, Y(100)], [bx - 12, Y(100)]], rgba(COL.C, 0.85 * ka), 3); tag(stage, '100칸', bx + 14, Y(50), {size: 30, color: COL.C, a: ka, align: 'left', border: COL.C}); }
    // inverted: numbers grow downward; warming makes the number smaller
    const ia = fadeIn(t, P.inv, 0.35) * fadeOut(t, P.flip[0] - 0.1, 0.3);
    if (ia > 0) withAlpha(c, ia, () => {
      arrow(c, [rx + 150, Y(80)], [rx + 150, Y(20)], COL.old, 4); tag(stage, '숫자가 커지는 쪽', rx + 170, Y(50), {size: 26, color: COL.old, align: 'left'});
      tile(stage, 790, 336, 250, '1742 눈금 읽기', fmt(100 - T, 0), {col: COL.old, size: 44});
    });
    const da = fadeIn(t, P.death, 0.4) * fadeOut(t, P.shift[0], 0.4);
    if (da > 0) tag(stage, 'Celsius가 세상을 떠날 무렵', 540, 470, {size: 26, color: Th.muted, a: da});
    const aa = fadeIn(t, P.flip[1] - 0.1, 0.35) * fadeOut(t, P.shift[0], 0.4);
    if (aa > 0) withAlpha(c, aa, () => { tile(stage, 790, 336, 250, '섭씨 °C 읽기', fmt(T, 0), {col: COL.C, size: 44}); arrow(c, [rx + 150, Y(20)], [rx + 150, Y(80)], COL.C, 4); tag(stage, '지금의 방향', rx + 170, Y(50), {size: 26, color: COL.C, align: 'left'}); });
    // names card
    if (t > P.shift[0]) namesCard(stage, t, P);
  });
  const ylv = thermometer(stage, tubeOf(L, Y(T)));
  withAlpha(c, out, () => {
    if (mB > 0) levelLine(c, L.tx + L.tw / 2 + 4, rx + 34, ylv, fadeA * 0.85 * fadeOut(t, P.shift[0], 0.4));
    dipped(stage, 'boil', L, t, fadeIn(t, P.boilC, 0.3) * fadeOut(t, P.freezeC - 0.15, 0.3), '끓는 물');
    dipped(stage, 'ice', L, t, fadeIn(t, P.freezeC + 0.12, 0.3) * fadeOut(t, P.inv - 0.35, 0.3), '얼음물');
    const kn = fadeIn(t, P.inv - 0.3, 0.4) * fadeOut(t, P.shift[0], 0.4);
    if (kn > 0) knob(stage, 236, 1150, T, -10, 110, kn);
  });
}
const HAN = [
  {latin: 'Celsius', chars: ['攝', '爾', '修', '斯'], read: ['섭', '이', '수', '사'], out: '攝氏', ko: '섭씨', col: COL.C, y: 580},
  {latin: 'Fahrenheit', chars: ['華', '倫', '海', '特'], read: ['화', '륜', '해', '특'], out: '華氏', ko: '화씨', col: COL.F, y: 920},
];
function namesCard(stage, t, P) {
  const c = stage.ctx, Th = stage.theme, a = fadeIn(t, P.names, 0.4);
  withAlpha(c, a, () => {
    HAN.forEach((R, j) => {
      const x0 = 386, cy = R.y, hx = k => 420 + k * 92;
      stage.text(R.latin, x0, cy - 74, {role: 'display', size: 34, weight: 700, color: R.col});
      R.chars.forEach((ch, k) => {
        const ka = fadeIn(t, P.han + j * 0.35 + k * 0.12, 0.25); if (ka <= 0) return;
        const hi = k === 0 ? fadeIn(t, P.first, 0.3) : 0;
        withAlpha(c, ka * (k === 0 ? 1 : lerp(1, 0.45, fadeIn(t, P.first, 0.4))), () => {
          if (hi > 0) rect(c, hx(k) - 38, cy - 40, 76, 80, 8, rgba(R.col, 0.18 * hi), rgba(R.col, 0.9 * hi), 2.5);
          stage.text(ch, hx(k), cy, {size: 60, weight: 700, color: Th.ink, align: 'center'});
          stage.text(R.read[k], hx(k), cy + 62, {size: 24, weight: 500, color: Th.muted, align: 'center'});
        });
      });
      stage.text('(음역)', hx(3) + 70, cy, {size: 24, weight: 500, color: Th.muted, alpha: fadeIn(t, P.han + j * 0.35 + 0.5, 0.3)});
      // first char + 氏 → 攝氏 / 華氏
      const fy = cy + 150, q1 = easeInOut((t - P.first - 0.25) / 0.6);
      if (q1 > 0) stage.text(R.chars[0], hx(0) - 72 * Math.sin(Math.PI * q1), lerp(cy, fy, q1), {size: 60, weight: 700, color: R.col, align: 'center', alpha: q1 >= 1 ? 1 : smooth((q1 - 0.22) / 0.25)});
      const sa = fadeIn(t, P.ssi, 0.3);
      if (sa > 0) withAlpha(c, sa, () => { stage.text('+', 488, fy, {size: 46, weight: 700, color: Th.muted, align: 'center'}); stage.text('氏', 556, fy, {size: 60, weight: 700, color: Th.ink, align: 'center'}); });
      const ja = fadeIn(t, P.join + j * 0.25, 0.35);
      if (ja > 0) withAlpha(c, ja, () => { stage.text('=', 626, fy, {size: 46, weight: 700, color: Th.muted, align: 'center'}); stage.text(R.out, 736, fy, {size: 64, weight: 700, color: R.col, align: 'center'}); stage.text(R.ko, 878, fy, {role: 'display', size: 44, weight: 700, color: Th.accent, align: 'center'}); });
    });
    const sa = fadeIn(t, P.ssi + 0.3, 0.4);
    if (sa > 0) tag(stage, '氏 = 성씨 씨 (~씨)', 660, 1260, {size: 28, color: Th.ink, a: sa});
  });
}

// ------------------------------------------------------------------ convert: 100 vs 180 divisions → the graph °F = 1.8·°C + 32 → −40
const GR = {x0: 510, x1: 925, c0: -60, c1: 110};
function convertScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), sf = sceneFade(t, ctx);
  const zq = easeInOut((t - P.zoom[0]) / (P.zoom[1] - P.zoom[0])), bq = easeInOut((t - P.toB[0]) / (P.toB[1] - P.toB[0]));
  const LA = zq > 0 ? lerpObj(L_CONV_A, L_CONV_Z, zq) : L_CONV_A;
  // the zoom is a log-scale camera move (keeps 20 °C in place)
  const zoomL = q => { const sA = (L_CONV_A.y0 - L_CONV_A.y1) / 100, sZ = (L_CONV_Z.y0 - L_CONV_Z.y1) / 10, s = Math.exp(lerp(Math.log(sA), Math.log(sZ), q)), yc = lerp(mapY(L_CONV_A)(20), 845, q); return {...L_CONV_A, T0: 20 - (1130 - yc) / s, y0: 1130, T1: 20 + (yc - 560) / s, y1: 560}; };
  const LZ = {...zoomL(zq * (1 - bq)), tx: lerp(L_CONV_A.tx, L_CONV_Z.tx, zq)};
  const L = bq > 0 ? lerpObj({...zoomL(1), tx: L_CONV_Z.tx}, L_CONV_B, bq) : LZ, Y = mapY(L);
  const xC = lerp(480, 300, bq), xF = lerp(600, 390, bq), clipR = [lerp(500, 500, bq) - 20, lerp(1150, 1200, bq)];
  const sC = clamp((t - P.sweepC[0]) / SWEEP), sF = clamp((t - P.sweepF[0]) / SWEEP), outer = bq;
  withAlpha(c, sf, () => {
    // two rulers facing each other (ticks inward), the 100 and 180 divisions drawn by sweeps
    ruler(stage, {u: 'C', x: xC, y: Y, lo: lerp(0, -60, bq), hi: lerp(100, 110, bq), side: 1, lab: -1, len: 30, major: 10, minor: 1, clip: [518, 1200],
      reveal: u => (u >= 0 && u <= 100 ? (u === 0 || u === 100 ? 1 : clamp((sC * 100 - u + 1) * 0.5)) : outer), labels: 'auto', must: bq > 0.5 ? [] : [0, 100], labelMin: 44});
    ruler(stage, {u: 'F', x: xF, y: Y, lo: lerp(32, -76, bq), hi: lerp(212, 230, bq), side: -1, lab: 1, len: 30, major: 10, minor: 1, clip: [518, 1200],
      reveal: u => (u >= 32 && u <= 212 ? (u === 32 || u === 212 ? 1 : clamp((sF * 180 - (u - 32) + 1) * 0.5)) : outer), labels: 'auto', must: bq > 0.5 ? [-40] : [32, 212], labelMin: 46});
    stage.text('섭씨 °C', xC - 10, 488, {size: 26, weight: 700, color: COL.C, align: 'right'});
    stage.text('화씨 °F', xF + 10, 488, {size: 26, weight: 700, color: COL.F, align: 'left'});
    const bA = (1 - zq) * (1 - bq);
    const kC = fadeIn(t, P.sweepC[1] - 0.15, 0.3) * bA, kF = fadeIn(t, P.sweepF[1] - 0.15, 0.3) * bA, Y0 = mapY(L_CONV_A);
    if (kC > 0) { line(c, [[xC - 100, Y0(0)], [xC - 112, Y0(0)], [xC - 112, Y0(100)], [xC - 100, Y0(100)]], rgba(COL.C, 0.85 * kC), 3); tag(stage, '100칸', xC - 126, Y0(50), {size: 32, color: COL.C, a: kC, align: 'right', border: COL.C}); }
    if (kF > 0) { line(c, [[xF + 98, Y0(0)], [xF + 110, Y0(0)], [xF + 110, Y0(100)], [xF + 98, Y0(100)]], rgba(COL.F, 0.85 * kF), 3); tag(stage, '180칸', xF + 124, Y0(50), {size: 32, color: COL.F, a: kF, align: 'left', border: COL.F}); }
    // zoom: one division each
    const za = zq * (1 - bq) * fadeIn(t, P.zoom[1] - 0.2, 0.3);
    if (za > 0) withAlpha(c, za, () => {
      const y20 = Y(20), y21 = Y(21), f68 = Y(C_OF_F(68)), f69 = Y(C_OF_F(69));
      rect(c, xC + 2, y21, 34, y20 - y21, 3, rgba(COL.C, 0.45)); rect(c, xF - 36, f69, 34, f68 - f69, 3, rgba(COL.F, 0.5));
      tag(stage, '섭씨 1칸', xC - 150, (y20 + y21) / 2, {size: 28, color: COL.C, align: 'right', border: COL.C});
      tag(stage, '화씨 1칸', xF + 150, (f68 + f69) / 2, {size: 28, color: COL.F, align: 'left', border: COL.F});
      const sa = fadeIn(t, P.small, 0.4);
      if (sa > 0) tag(stage, '화씨 1칸 = 섭씨 5/9칸', 540, 1268, {size: 30, color: Th.ink, a: sa});
    });
    if (bq > 0) graphPanel(stage, t, T, L, Y, P, bq);
  });
  const ylv = thermometer(stage, {...tubeOf(L, Y(T)), a: sf});
  withAlpha(c, sf, () => {
    const xEnd = bq > 0 ? lerp(xF, GR.x0 + (T - GR.c0) / (GR.c1 - GR.c0) * (GR.x1 - GR.x0), bq) : xF;
    levelLine(c, L.tx + L.tw / 2 + 4, xEnd, ylv, 0.9, COL.hot, [[xC - 100, xC - 34], [xF + 34, xF + 100]]);
  });
}
function graphPanel(stage, t, T, L, Y, P, bq) {
  const c = stage.ctx, Th = stage.theme, ga = smooth((bq - 0.3) / 0.7);
  const xOf = cc => GR.x0 + (cc - GR.c0) / (GR.c1 - GR.c0) * (GR.x1 - GR.x0), yTop = Y(110), yBot = Y(-60), YB = mapY(L_CONV_B), yBotB = YB(-60), yTopB = YB(110);
  withAlpha(c, ga, () => {
    rect(c, GR.x0, yTop, GR.x1 - GR.x0, yBot - yTop, 0, rgba('#000000', 0.18));
    for (const cc of [-40, 0, 40, 80]) { line(c, [[xOf(cc), yTop], [xOf(cc), yBot]], rgba(Th.border, 0.7), 1.2); stage.text(fmt(cc, 0), xOf(cc), yBotB + 28, {size: 24, weight: 500, color: COL.C, align: 'center'}); }
    for (const f of [-40, 0, 50, 100, 150, 200]) line(c, [[GR.x0, Y(C_OF_F(f))], [GR.x1, Y(C_OF_F(f))]], rgba(Th.border, 0.55), 1.2);
    line(c, [[GR.x0, yTop], [GR.x0, yBot], [GR.x1, yBot]], rgba(Th.muted, 0.9), 2.2);
    stage.text('섭씨 °C →', GR.x1, yBotB + 62, {size: 24, weight: 700, color: COL.C, align: 'right'});
    stage.text('↑ 화씨 °F', GR.x0 + 10, yTopB + 22, {size: 24, weight: 700, color: COL.F, alpha: smooth((bq - 0.85) / 0.15)});
    // the conversion line, drawn on "섭씨에 … 곱하고"
    const lq = clamp((t - P.line[0]) / (P.line[1] - P.line[0]));
    if (lq > 0) { const c1 = lerp(GR.c0, GR.c1, lq); line(c, [[xOf(GR.c0), Y(GR.c0)], [xOf(c1), Y(c1)]], COL.F, 4.5); }
    // slope: +50 °C → +90 °F
    const sa = fadeIn(t, P.x18, 0.35) * fadeOut(t, P.meet - 1.2, 0.5);
    if (sa > 0) withAlpha(c, sa, () => {
      line(c, [[xOf(0), Y(0)], [xOf(50), Y(0)], [xOf(50), Y(50)]], rgba(Th.ink, 0.85), 2.5, {dash: [7, 5]});
      stage.text('+50 °C', (xOf(0) + xOf(50)) / 2, Y(0) + 28, {size: 24, weight: 700, color: COL.C, align: 'center'});
      stage.text('+90 °F', xOf(50) + 12, (Y(0) + Y(50)) / 2, {size: 24, weight: 700, color: COL.F});
      tag(stage, '90 ÷ 50 = 1.8배', xOf(50) + 12, (Y(0) + Y(50)) / 2 + 40, {size: 24, color: Th.ink, align: 'left'});
    });
    const ia = fadeIn(t, P.p32, 0.35) * fadeOut(t, P.meet - 1.2, 0.5);
    if (ia > 0) withAlpha(c, ia, () => { circle(c, xOf(0), Y(0), 7, COL.F); line(c, [[GR.x0, Y(0)], [xOf(0), Y(0)]], rgba(COL.F, 0.8), 2, {dash: [5, 5]}); stage.text('32 °F', GR.x0 + 8, Y(0) - 22, {size: 24, weight: 700, color: COL.F}); });
    // the "same number" line °F = °C, and the meeting point
    const yq = clamp((t - P.yx[0]) / (P.yx[1] - P.yx[0]));
    if (yq > 0) { const c1 = lerp(GR.c0, GR.c1, yq); line(c, [[xOf(GR.c0), Y((GR.c0 - 32) / 1.8)], [xOf(c1), Y((c1 - 32) / 1.8)]], rgba(Th.ink, 0.85), 3, {dash: [10, 6]}); }
    const ya = fadeIn(t, P.yx[1] - 0.2, 0.4);
    if (ya > 0) tag(stage, '°F = °C', GR.x1 - 6, 740, {size: 26, color: Th.ink, a: ya, align: 'right', border: Th.ink});
    const ma = fadeIn(t, P.meet, 0.3);
    if (ma > 0) { const px = xOf(-40), py = Y(-40); glow(c, px, py, 60, COL.hot, 0.5 * ma); ring(c, px, py, 16 + 10 * pop(t, P.meet, 0.6), rgba(COL.hot, ma), 3.5); tag(stage, '−40 °C = −40 °F', px + 34, py + 52, {size: 30, color: COL.hot, a: fadeIn(t, P.same, 0.35), align: 'left', border: COL.hot}); }
    // moving point (°C, °F) and the °C handle on the axis
    const px = xOf(T), py = Y(T);
    line(c, [[px, py], [px, yBot + 4]], rgba(COL.C, 0.7), 2, {dash: [6, 5]});
    circle(c, px, py, 9, COL.hot); ring(c, px, py, 14, rgba('#FFFFFF', 0.7), 2);
    const hy = yBotB + 96;
    rect(c, GR.x0, hy - 4, GR.x1 - GR.x0, 8, 4, rgba(Th.border, 1));
    rect(c, px - 18, hy - 16, 36, 32, 8, '#5A5C62', rgba(COL.C, 0.95), 2.5);
    stage.text('온도 손잡이', GR.x0 - 16, hy, {size: 24, weight: 700, color: Th.muted, align: 'right'});
    // readouts
    const mHi = pop(t, P.meet, 0.9);
    tile(stage, 615, yTopB + 46, 190, '섭씨 °C', fmt(T, 1), {col: COL.C, h: 96, size: 38, hi: mHi});
    tile(stage, 615, yTopB + 156, 190, '화씨 °F', fmt(F_OF_C(T), 1), {col: COL.F, h: 96, size: 38, hi: mHi});
  });
  // formula header tile
  const fq = fadeIn(t, P.toB[1] - 0.3, 0.4);
  if (fq > 0) withAlpha(c, fq, () => {
    panel(c, Th, 230, 336, 620, 92, 0.9, 12, fadeIn(t, P.form, 0.3) > 0 ? mix(Th.border, Th.accent, fadeIn(t, P.form, 0.3) * fadeOut(t, P.form + 1.5, 0.5)) : null);
    const parts = [['°F = ', Th.ink, 1], ['1.8 × ', COL.F, fadeIn(t, P.x18, 0.3)], ['°C', COL.C, 1], [' + 32', COL.F, fadeIn(t, P.p32, 0.3)]];
    const sz = 44, ws = parts.map(([s]) => stage.measure(s, {role: 'display', size: sz, weight: 700})), W0 = ws.reduce((a, b) => a + b, 0);
    let x = 540 - W0 / 2; parts.forEach(([s, col, al], k) => { stage.text(s, x, 384, {role: 'display', size: sz, weight: 700, color: col, alpha: 0.25 + 0.75 * al}); x += ws[k]; });
  });
}

// ------------------------------------------------------------------ kelvin: 1848 · down to absolute zero · K = °C + 273.15 · no "degree"
function kelvinScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), sf = sceneFade(t, ctx);
  const zq = easeInOut((t - P.zoomK[0]) / (P.zoomK[1] - P.zoomK[0]));
  const sA = (L_PANEL.y0 - L_PANEL.y1) / 120, sZ = (L_KEL_Z.y0 - L_KEL_Z.y1) / 400, s = Math.exp(lerp(Math.log(sA), Math.log(sZ), zq));
  const yTop = lerp(530, 540, zq), T1 = 110, L = {...lerpObj(L_PANEL, L_KEL_Z, zq), T1, y1: yTop, T0: T1 - (lerp(1150, 1190, zq) - yTop) / s, y0: lerp(1150, 1190, zq)}, Y = mapY(L);
  const cx = L.tx - L.tw / 2 - 12, kx = L.tx + L.tw / 2 + 12, ka = fadeIn(t, P.zeroK - 0.1, 0.35), kl = fadeIn(t, P.kLabels, 0.4), lo = Math.max(ABS0, L.T0);
  const ylv0 = clamp(Y(T), L.top + L.tw * 0.45, L.bulbY - L.br * 0.55);
  withAlpha(c, sf, () => {
    // card, then the formula
    const ca = fadeIn(t, P.y1848, 0.4) * fadeOut(t, P.kform - 0.45, 0.35);
    if (ca > 0) withAlpha(c, ca, () => { stage.text('1848 · William Thomson', 540, 372, {role: 'display', size: 40, weight: 700, color: COL.K, align: 'center', alpha: fadeIn(t, P.thomson, 0.4)}); stage.text('훗날 Lord Kelvin · 영국', 540, 426, {size: 26, weight: 500, color: Th.muted, align: 'center', alpha: fadeIn(t, P.lord, 0.4)}); });
    const fa = fadeIn(t, P.kform, 0.4);
    if (fa > 0) withAlpha(c, fa, () => {
      panel(c, Th, 260, 336, 560, 92, 0.9, 12);
      const parts = [['K', COL.K], [' = ', Th.ink], ['°C', COL.C], [' + 273.15', COL.K]], ws = parts.map(([s2]) => stage.measure(s2, {role: 'display', size: 44, weight: 700})), W0 = ws.reduce((a, b) => a + b, 0);
      let x = 540 - W0 / 2; parts.forEach(([s2, col], k) => { stage.text(s2, x, 384, {role: 'display', size: 44, weight: 700, color: col}); x += ws[k]; });
    });
    ruler(stage, {u: 'C', x: cx, y: Y, lo: Math.max(lo, -275), hi: 110, side: -1, len: 26, major: 10, labelMin: 50, clip: [500, 1200], must: zq > 0.5 ? [-273.15] : [], labFn: v => (v === -273.15 ? '−273.15' : fmt(v, 0)), avoidY: ylv0});
    if (ka > 0) ruler(stage, {u: 'K', x: kx, y: Y, lo: 0, hi: lerp(0, 383, kl), side: 1, len: 26, major: 10, a: ka, labels: [0, 100, 200, 300].filter(v => v === 0 || kl > 0), labReveal: v => (v === 0 ? ka : kl), labelMin: 50, avoidY: ylv0});
    stage.text('섭씨 °C', cx - 10, 488, {size: 26, weight: 700, color: COL.C, align: 'right'});
    if (ka > 0) stage.text('켈빈 K', kx + 10, 488, {size: 26, weight: 700, color: COL.K, alpha: ka});
    // absolute zero: the floor
    const fl = fadeIn(t, P.drop[1] - 0.4, 0.4);
    if (fl > 0) withAlpha(c, fl, () => { const y0 = Y(ABS0); line(c, [[150, y0], [740, y0]], rgba(COL.K, 0.6), 2, {dash: [8, 6]}); tag(stage, '절대영도 = 0 K', 935, y0, {size: 28, color: COL.K, align: 'right', border: COL.K}); });
    // +273.15 arrow from 0 K to 0 °C
    const ba = fadeIn(t, P.addT[0] + 0.2, 0.4);
    if (ba > 0) withAlpha(c, ba, () => { const bx = 712; arrow(c, [bx, Y(ABS0) - 4], [bx, lerp(Y(ABS0), Y(0), clamp((t - P.addT[0]) / 1.2)) + 2], COL.K, 4); line(c, [[bx - 10, Y(0)], [bx + 10, Y(0)]], COL.K, 3); stage.text('+273.15', bx + 14, (Y(ABS0) + Y(0)) / 2, {role: 'display', size: 30, weight: 700, color: COL.K}); stage.text('0 °C', bx - 16, Y(0), {size: 24, weight: 700, color: COL.C, align: 'right'}); });
    // particles: speeds ∝ √K (the box stays on; it stops at 0 K)
    const pa = fadeIn(t, P.zoomK[0] - 0.6, 0.5) * fadeOut(t, P.unit1 - 0.3, 0.4) + fadeIn(t, P.addT[0], 0.5);
    if (pa > 0) { particleBox(stage, 730, 600, 190, 220, P.phaseK(t), K_OF_C(T), COL.K, pa, 16); stage.text('알갱이 운동 (모형)', 825, 576, {size: 24, weight: 700, color: Th.muted, align: 'center', alpha: pa}); }
    // one division: 1 K = 1 °C
    const ua = fadeIn(t, P.unit1, 0.4) * fadeOut(t, P.addT[0] + 0.2, 0.4);
    if (ua > 0) magnifier(stage, 822, 680, 100, ua);
    // °K → K (1967)
    const na = fadeIn(t, P.noDeg, 0.4);
    if (na > 0) withAlpha(c, na, () => {
      panel(c, Th, 590, 1196, 340, 130, 0.94, 12);
      const sx = 660, yy = 1246; stage.text('°K', sx, yy, {role: 'display', size: 48, weight: 700, color: Th.muted, align: 'center'});
      const sq2 = clamp((t - P.strike) / 0.35); if (sq2 > 0) line(c, [[sx - 36, yy + 16], [lerp(sx - 36, sx + 36, sq2), lerp(yy + 16, yy - 18, sq2)]], COL.bad, 5);
      arrow(c, [sx + 46, yy], [sx + 96, yy], Th.ink, 3.5);
      stage.text('K', sx + 128, yy, {role: 'display', size: 48, weight: 700, color: COL.K, align: 'center'});
      stage.text('1967', 880, yy, {size: 26, weight: 700, color: Th.muted, align: 'center'});
      stage.text('켈빈에는 "도"를 붙이지 않음', 760, 1300, {size: 24, weight: 700, color: Th.ink, align: 'center'});
    });
  });
  const ylv = thermometer(stage, {...tubeOf(L, Y(T)), a: sf});
  withAlpha(c, sf, () => {
    levelLine(c, cx - 30, kx + (ka > 0 ? 30 : 0), ylv, 0.9);
    const cs = T <= ABS0 + 0.005 ? '−273.15 °C' : fmt(T, 1) + ' °C', ks = K_OF_C(T) < 0.005 ? '0 K' : fmt(K_OF_C(T), 1) + ' K';
    pill(stage, cx - 32, ylv, cs, COL.C, 'right');
    if (ka > 0) pill(stage, kx + 32, ylv, ks, COL.K, 'left', ka);
  });
}
function pill(stage, x, y, s, col, align = 'left', a = 1) {
  const c = stage.ctx, size = 26, w = stage.measure(s, {role: 'display', size, weight: 700}), x0 = align === 'right' ? x - w - 14 : x;
  withAlpha(c, a, () => { rect(c, x0, y - 21, w + 14, 42, 10, rgba('#121315', 0.96), rgba(col, 0.95), 2); stage.text(s, x0 + 7, y + 1, {role: 'display', size, weight: 700, color: col}); });
}
function magnifier(stage, x, y, r, a) {
  const c = stage.ctx, Th = stage.theme;
  withAlpha(c, a, () => {
    circle(c, x, y, r, rgba('#0D0E10', 0.95));
    const px = 30;                                                          // px per degree inside the lens
    clipRect(c, x - r, y - r, 2 * r, 2 * r, r, () => {
      for (let k = -4; k <= 4; k++) { const yy = y + k * px; line(c, [[x - 44, yy], [x - 44 + (k % 5 ? 16 : 26), yy]], COL.C, 2.5); line(c, [[x + 44, yy], [x + 44 - (k % 5 ? 16 : 26), yy]], COL.K, 2.5); }
      line(c, [[x - 44, y - r], [x - 44, y + r]], COL.C, 2.5); line(c, [[x + 44, y - r], [x + 44, y + r]], COL.K, 2.5);
      rect(c, x - 42, y, 16, px, 2, rgba(COL.C, 0.6)); rect(c, x + 26, y, 16, px, 2, rgba(COL.K, 0.6));
      line(c, [[x - 20, y], [x + 20, y]], rgba(Th.ink, 0.6), 1.5, {dash: [4, 4]}); line(c, [[x - 20, y + px], [x + 20, y + px]], rgba(Th.ink, 0.6), 1.5, {dash: [4, 4]});
    });
    ring(c, x, y, r, rgba(Th.ink, 0.8), 3);
    stage.text('1 °C', x - 44, y + r + 26, {size: 24, weight: 700, color: COL.C, align: 'center'});
    stage.text('1 K', x + 44, y + r + 26, {size: 24, weight: 700, color: COL.K, align: 'center'});
    tag(stage, '한 칸 크기가 같음', x, y + r + 70, {size: 26, color: Th.ink});
  });
}
/** box of free particles; phase = ∫ speed dt (box widths at unit speed); trails show the speed */
function particleBox(stage, x, y, w, h, phase, K, col, a = 1, n = 22) {
  const c = stage.ctx, Th = stage.theme, pad = 12, tri = u => { u = ((u % 2) + 2) % 2; return u < 1 ? u : 2 - u; }, sp = speedK(K);
  withAlpha(c, a, () => {
    rect(c, x, y, w, h, 10, rgba('#0D0E10', 0.9), rgba(Th.border, 1), 2);
    clipRect(c, x + 2, y + 2, w - 4, h - 4, 8, () => {
      for (let i = 0; i < n; i++) {
        const p = PARTS[i], pos = d => [x + pad + tri(p.x + p.vx * (phase - d) * 0.42) * (w - 2 * pad), y + pad + tri(p.y + p.vy * (phase - d) * 0.42) * (h - 2 * pad)];
        for (let g = 3; g >= 1; g--) { const [gx, gy] = pos(g * 0.05 * Math.max(0.2, sp)); circle(c, gx, gy, 7 - g, rgba(col, 0.14 * (4 - g) * Math.min(1, sp * 3))); }
        const [px, py] = pos(0); sphere(c, px, py, 8, col, {shade: '#0b1a10'});
      }
    });
  });
}

// ------------------------------------------------------------------ myth: 10 °C vs 20 °C — "twice"? → from 0 K: 283 vs 293
function mythScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), zq = easeInOut((t - P.toK[0]) / (P.toK[1] - P.toK[0]));
  const base = 1200, s = Math.exp(lerp(Math.log(28), Math.log(2.133), zq)), y20 = lerp(640, base - 293.15 * 2.133, zq), Tb = 20 - (base - y20) / s;
  const Y = cc => base - s * (cc - Tb), ax = 240;
  const r20 = easeOut((t - P.m20) / 0.6), r10 = easeOut((t - P.m10) / 0.6);
  withAlpha(c, sf, () => {
    // axis: °C, then K
    const lo = Math.max(ABS0, Tb), hiC = Tb + (base - 520) / s;
    ruler(stage, {u: 'C', x: ax, y: Y, lo: Math.ceil(Math.max(lo, -275)), hi: Math.min(25, hiC), side: 1, lab: -1, len: 24, major: 5, a: 1 - zq, labelMin: 50, clip: [520, base]});
    ruler(stage, {u: 'K', x: ax, y: Y, lo: 0, hi: Math.min(310, K_OF_C(hiC)), side: 1, lab: -1, len: 24, major: 10, a: zq, labels: [0, 100, 200, 300], clip: [520, base]});
    stage.text(zq < 0.5 ? '섭씨 °C' : '켈빈 K', ax - 8, 488, {size: 26, weight: 700, color: zq < 0.5 ? COL.C : COL.K, align: 'right'});
    line(c, [[ax, base], [600, base]], rgba(Th.muted, 0.9), 2.5);
    stage.text(zq < 0.5 ? '바닥: 0 °C' : '바닥: 0 K', 600, base + 32, {size: 24, weight: 700, color: zq < 0.5 ? COL.C : COL.K, align: 'right'});
    // bars from the baseline
    const bars = [{x: 340, v: 10, r: r10, f: P.k283}, {x: 500, v: 20, r: r20, f: P.k293}];
    for (const B of bars) {
      if (B.r <= 0) continue;
      const top = lerp(base, Y(B.v), B.r), col = mix(COL.C, COL.K, zq);
      const g = c.createLinearGradient(0, top, 0, base); g.addColorStop(0, col); g.addColorStop(1, mix(col, '#000000', 0.45));
      rect(c, B.x - 58, top, 116, base - top, [6, 6, 0, 0], g);
      const la = fadeIn(t, B.f, 0.3);
      stage.text(`${B.v} °C`, B.x, top - 30, {role: 'display', size: 34, weight: 700, color: COL.C, align: 'center', alpha: 1 - la});
      if (la > 0) stage.text(`${Math.round(K_OF_C(B.v))} K`, B.x, top - 30, {role: 'display', size: 34, weight: 700, color: COL.K, align: 'center', alpha: la});
    }
    // the old baseline after redrawing
    if (zq > 0) withAlpha(c, zq, () => { const y0 = Y(0); line(c, [[ax, y0], [600, y0]], rgba(COL.C, 0.7), 2, {dash: [8, 6]}); stage.text('0 °C', 606, y0, {size: 24, weight: 700, color: COL.C}); });
    // "두 배?" bracket
    const ta = fadeIn(t, P.twice, 0.3) * fadeOut(t, P.toK[0], 0.4);
    if (ta > 0) withAlpha(c, ta, () => {
      const xb = 590; line(c, [[xb - 10, Y(10)], [xb, Y(10)], [xb, base], [xb - 10, base]], rgba(Th.ink, 0.8), 2.5); line(c, [[xb + 30, Y(20)], [xb + 40, Y(20)], [xb + 40, base], [xb + 30, base]], rgba(Th.ink, 0.8), 2.5);
      tag(stage, '두 배?', xb + 60, (Y(20) + base) / 2, {size: 40, color: Th.accent, align: 'left', role: 'display', border: Th.accent});
      cross(c, xb + 120, (Y(20) + base) / 2, 40, COL.bad, 7, clamp((t - P.no17) / 0.4));
    });
    // number tones become 283 : 293
    const ra = fadeIn(t, P.k283 + 0.4, 0.4);
    if (ra > 0) tag(stage, '293 ÷ 283 ≈ 1.035', 420, 470, {size: 30, color: COL.K, a: ra, border: COL.K});
    // particle boxes (same model as the kelvin scene): 283 K and 293 K
    const pa = fadeIn(t, P.parts, 0.4);
    if (pa > 0) {
      const tt = t - P.parts;
      particleBox(stage, 664, 560, 260, 230, tt * speedK(283.15) * 0.55 + 3, 283.15, COL.K, pa);
      particleBox(stage, 664, 850, 260, 230, tt * speedK(293.15) * 0.55 + 7.3, 293.15, COL.K, pa);
      stage.text('283 K (10 °C)', 794, 538, {size: 24, weight: 700, color: Th.ink, align: 'center', alpha: pa});
      stage.text('293 K (20 °C)', 794, 828, {size: 24, weight: 700, color: Th.ink, align: 'center', alpha: pa});
      const ka = fadeIn(t, P.pct, 0.4);
      if (ka > 0) withAlpha(c, ka, () => { stage.text('평균 운동 에너지 ∝ K', 794, 1118, {size: 26, weight: 700, color: Th.ink, align: 'center'}); stage.text('차이 약 3.5 %', 794, 1162, {role: 'display', size: 36, weight: 700, color: Th.accent, align: 'center'}); });
      tag(stage, '이상기체 모형', 794, 1272, {size: 24, color: Th.muted, plate: false, a: pa});
    }
  });
}

// ------------------------------------------------------------------ use: colour temperature 2700 K → 6500 K
function useScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), Kc = P.Kc(t), col = bbColor(Kc), on = fadeIn(t, P.bulb, 0.5);
  withAlpha(c, sf, () => {
    // ratio tags
    const ra = fadeIn(t, P.ratio, 0.4) * lerp(1, 0.55, fadeIn(t, P.bulb, 0.5));
    if (ra > 0) { tag(stage, '기체 압력 ∝ K', 370, 380, {size: 28, color: COL.K, a: ra, border: COL.K}); tag(stage, '알갱이 운동 에너지 ∝ K', 700, 380, {size: 28, color: COL.K, a: ra, border: COL.K}); }
    // ratios from 0 K: 150 K → 300 K is really "twice" (bars from the floor), before the bulb lights
    const ma = fadeIn(t, P.u0 + 0.1, 0.4) * fadeOut(t, P.bulb - 0.35, 0.3);
    if (ma > 0) withAlpha(c, ma, () => {
      const base = 840, k = 0.95, grow = easeOut((t - P.u0 - 0.2) / 0.8), grow2 = easeOut((t - P.ratio) / 0.8);
      line(c, [[310, base], [610, base]], rgba(Th.muted, 0.9), 2.5); stage.text('바닥: 0 K', 610, base + 30, {size: 24, weight: 700, color: COL.K, align: 'right'});
      [[380, 150, grow], [520, 300, grow2]].forEach(([x, K, g]) => {
        if (g <= 0) return; const top = base - K * k * g;
        rect(c, x - 40, top, 80, base - top, [5, 5, 0, 0], rgba(COL.K, 0.85));
        stage.text(`${Math.round(K * g)} K`, x, top - 24, {role: 'display', size: 30, weight: 700, color: COL.K, align: 'center'});
      });
      if (grow2 >= 1) { const xb = 580, ta = fadeIn(t, P.ratio + 0.8, 0.3); line(c, [[xb, base - 300 * k], [xb + 12, base - 300 * k], [xb + 12, base], [xb, base]], rgba(Th.ink, 0.8), 2.5); tag(stage, '켈빈 2배', xb + 30, base - 172, {size: 28, color: COL.K, align: 'left', a: ta}); tag(stage, '→ 압력 · 운동 에너지도 2배', xb + 30, base - 122, {size: 26, color: Th.ink, align: 'left', a: ta}); }
    });
    // light on the wall
    if (on > 0) { glow(c, 540, 700, 760, col, 0.32 * on); glow(c, 540, 700, 300, col, 0.35 * on); }
    bulb(stage, 540, 690, 118, col, on, fadeIn(t, P.bulb - 0.35, 0.35));
    // the box
    const ba = fadeIn(t, P.box, 0.4);
    if (ba > 0) withAlpha(c, ba, () => {
      const x = 170, y = 980, w = 230, h = 200, d = 36;
      poly(c, [[x, y], [x + d, y - d], [x + w + d, y - d], [x + w, y]], '#D9D2C4'); poly(c, [[x + w, y], [x + w + d, y - d], [x + w + d, y + h - d], [x + w, y + h]], '#A39B8D');
      rect(c, x, y, w, h, 0, '#ECE6DA');
      stage.text('LED 전구', x + w / 2, y + 40, {size: 26, weight: 700, color: '#3A3530', align: 'center'});
      stage.text('6500K', x + w / 2, y + 104, {role: 'display', size: 54, weight: 700, color: '#1F3E66', align: 'center'});
      stage.text('주광색', x + w / 2, y + 158, {size: 26, weight: 700, color: '#3A3530', align: 'center'});
    });
    // readout
    if (on > 0) tile(stage, 790, 960, 240, '빛의 색온도', `${Math.round(Kc / 10) * 10} K`, {col: mix(col, '#FFFFFF', 0.1), a: on, size: 44});
    // colour-temperature knob: a slider over the black-body colours
    const sa = fadeIn(t, P.bulb + 0.2, 0.4);
    if (sa > 0) withAlpha(c, sa, () => {
      const x0 = 200, x1 = 880, y = 1236, xk = k => lerp(x0, x1, (k - 2000) / 5000);
      for (let k = 2000; k < 7000; k += 100) rect(c, xk(k), y - 9, xk(k + 100) - xk(k) + 0.6, 18, 0, bbColor(k + 50));
      rect(c, x0, y - 9, x1 - x0, 18, 4, null, rgba(Th.border, 1), 1.5);
      for (const k of [2700, 6500]) { line(c, [[xk(k), y + 12], [xk(k), y + 22]], Th.ink, 2.5); stage.text(`${k} K`, xk(k), y + 42, {size: 24, weight: 700, color: Th.ink, align: 'center'}); }
      stage.text('따뜻한 빛', xk(2700), y + 78, {size: 24, weight: 700, color: bbColor(2700), align: 'center'});
      stage.text('낮빛', xk(6500), y + 78, {size: 24, weight: 700, color: mix(bbColor(6500), '#9FC8FF', 0.2), align: 'center'});
      const xp = xk(Kc); poly(c, [[xp, y - 13], [xp - 13, y - 34], [xp + 13, y - 34]], Th.ink);
    });
    const ca = fadeIn(t, P.colT, 0.4);
    if (ca > 0) { tag(stage, '빛의 색을 켈빈으로', 660, 1110, {size: 30, color: Th.ink, a: ca, border: Th.accent}); tag(stage, '전구가 그만큼 뜨겁다는 뜻이 아님', 660, 1162, {size: 24, color: Th.muted, a: ca, plate: false}); }
  });
}
function bulb(stage, x, y, r, col, on, a = 1) {
  if (a <= 0) return; const c = stage.ctx; c.save(); c.globalAlpha *= a;
  // base (screw)
  const by = y + r * 1.05;
  poly(c, [[x - r * 0.42, y + r * 0.72], [x + r * 0.42, y + r * 0.72], [x + r * 0.3, by], [x - r * 0.3, by]], rgba(mix('#2A2C30', col, 0.5 * on), 0.95));
  for (let k = 0; k < 4; k++) rect(c, x - r * 0.32, by + k * 18, r * 0.64, 13, 5, k % 2 ? '#8E949C' : '#B5BBC3');
  rect(c, x - r * 0.16, by + 72, r * 0.32, 16, 6, '#3A3D42');
  // glass
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  g.addColorStop(0, mix('#3A3C40', '#FFFFFF', on)); g.addColorStop(0.45, mix('#2E3034', col, on)); g.addColorStop(1, mix('#1C1D20', mix(col, '#000000', 0.25), on));
  c.beginPath(); c.arc(x, y, r, Math.PI * 0.78, Math.PI * 2.22); c.lineTo(x + r * 0.42, y + r * 0.72); c.lineTo(x - r * 0.42, y + r * 0.72); c.closePath(); c.fillStyle = g; c.fill();
  c.strokeStyle = rgba('#FFFFFF', 0.35); c.lineWidth = 2; c.stroke();
  ring(c, x - r * 0.1, y - r * 0.12, r * 0.72, rgba('#FFFFFF', 0.25), 4, Math.PI * 1.08, Math.PI * 1.42);
  c.restore();
}

// ------------------------------------------------------------------ close: s19 the same heat, three numbers → s20 the poster again
function closeScene(stage, t, ctx) {
  const c = stage.ctx, Th = stage.theme, P = plan(ctx.tl), T = P.T(t), fin = easeInOut((t - P.reason) / 0.8);
  const lastCap = ctx.tl.captions.at(-1).end + 0.15, shade = 1 - fadeIn(t, lastCap, 0.4);
  if (fin >= 1) { posterPicture(stage, t, 1, T); captionShade(c, shade); posterTitle(stage, t, 0, 1); return; }
  const sf = fadeIn(t, ctx.scene.start, 0.25), L = lerpObj(L_PANEL, L_POSTER, fin);
  summer(stage, t, sf, {heat: 0.6, dim: lerp(0.5, 0, fin)});
  withAlpha(c, sf, () => {
    const q = 1 - fin, Y = mapY(L);
    const ylv = panelHook(stage, t, T, {L, q, aK: q, kx: 700, heat: 1.4});
    if (fin > 0) { const ba = smooth((fin - 0.55) / 0.45); bigReadout(stage, '38', '°C', L.tx - lerp(60, 74, fin), ylv, -1, COL.C, lerp(60, 168, fin), ba); bigReadout(stage, '100', '°F', L.tx + lerp(60, 74, fin), ylv, 1, COL.F, lerp(60, 168, fin), ba); pot(c, 836, 770, 110, t, 0.85 * ba); }
    const ta = q;
    const b38 = fadeIn(t, P.r38, 0.25), b100 = fadeIn(t, P.r100, 0.25), b311 = fadeIn(t, P.r311, 0.25);
    withAlpha(c, ta, () => {
      tile(stage, 300, 330, 210, '섭씨 °C', b38 > 0 ? '38' : fmt(T, 1), {col: COL.C, h: 124, size: lerp(40, 60, b38), hi: pop(t, P.r38, 0.8)});
      tile(stage, 540, 330, 210, '화씨 °F', b100 > 0 ? '100' : fmt(F_OF_C(T), 1), {col: COL.F, h: 124, size: lerp(40, 60, b100), hi: pop(t, P.r100, 0.8)});
      tile(stage, 780, 330, 210, '켈빈 K', b311 > 0 ? '311' : fmt(K_OF_C(T), 1), {col: COL.K, h: 124, size: lerp(40, 60, b311), hi: pop(t, P.r311, 0.8)});
      const da = fadeIn(t, P.diff, 0.4);
      if (da > 0) tag(stage, '같은 높이 · 다른 숫자', 640, 1240, {size: 30, color: Th.accent, a: da, border: Th.accent});
      knob(stage, 236, 1150, T, -10, 110);
      const pl = Math.max(pop(t, P.r38, 0.8), pop(t, P.r100, 0.8), pop(t, P.r311, 0.8), pop(t, P.diff, 1.0)); if (pl > 0) levelLine(c, L.tx + L.tw / 2 + 4, 730, ylv, pl, '#FFE2B8', panelGaps(L));
    });
    captionShade(c, shade);
  });
  if (fin > 0) posterTitle(stage, t, 0, fin);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Column height (absolute temperature) → pitch of a low hum f = 0.6·K Hz (0 K silent, 273 K 164 Hz, 311 K 187 Hz,
//    373 K 224 Hz). The same temperature gives the same sound whichever scale is read.
//  - Drawing divisions: one low tick for every 5 divisions; every sweep lasts 1.5 s, so 180 divisions tick 1.8× faster than 100.
//  - Convert: the NUMBER read on each scale → pitch 150·2^(n/140) Hz, °C and °F as two tones that beat and merge at −40.
//  - Myth: pitch ∝ °C number (11·n Hz: 10 → 110, 20 → 220 = an octave, "double") vs pitch ∝ K (0.6·K: 170 vs 176 Hz).
//  - Colour temperature → pitch 0.06·K Hz (2700 → 162, 6500 → 390). Marks and cards → short low ticks / swells.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.4, 0.2], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -33) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur: 0.6, harmonics: [1, 0.35], attack: 0.006, decay: 0.2, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.3, low: 40, high: 220, release: 0.22, gain_db: -9}}]}, means});
  const tone = (id, t0, freq, dur, gain, means) => ev.push({id, at: r(t0, 4), kind: 'tone', params: {freq: r(freq, 2), dur, harmonics: [1, 0.4], attack: 0.05, decay: 0.5, sustain: 0.7, release: 0.3, gain_db: gain}, means});
  const hum = (id, t0, t1, means) => chirp(id, t0, t1, tt => Math.max(30, humHz(P.T(tt))), tt => 0.32 * smooth((humHz(P.T(tt)) - 35) / 50), -35, means, {fi: 0.3, fo: 0.35, h: [1, 0.4]});
  const sweepTicks = (t0, n) => [...Array(Math.floor(n / 5))].map((_, k) => t0 + ((k + 1) * 5 / n) * SWEEP);
  const hz = c => humHz(c).toFixed(0);

  // hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 여름 저녁, 한 높이를 두 눈금이 38 °C · 100 °F로 읽음', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  tick('tag_c', P.tagC, 131, -33, '"섭씨" 칸이 밝아짐', {decay: 0.12});
  tick('tag_f', P.tagF, 147, -33, '"화씨" 칸이 밝아짐', {decay: 0.12});
  whoosh('k_in', P.kIn, 0.8, 90, 160, '켈빈 자가 오른쪽에서 들어옴', -35);
  ticks('three', [P.three, P.three + 0.2, P.three + 0.4], [131, 147, 165], -34, '세 눈금 칸이 차례로 밝아짐: 섭씨 · 화씨 · 켈빈', {decay: 0.1});
  tick('weather', P.wx, 131, -33, '"미국 일기 예보 · 100°F" 카드', {decay: 0.12});
  tick('f100', P.f100, 165, -34, '화씨 자의 100에 고리', {decay: 0.1});
  hum('hum_hook', P.boil - 0.5, P.backT + 0.7, `기둥 높이(절대온도) → 낮은 음 0.6·K Hz: 100 °F(${hz(T_HOT)} Hz) → 끓는 물 100 °C(${hz(100)} Hz) → 다시 100 °F. 세 눈금 어느 것으로 읽어도 같은 음`);
  tick('pot_hook', P.boil, 110, -33, '"끓는 물" 냄비가 100 °C 높이에 나타남', {decay: 0.14});
  swell('c38', P.c38 + 0.3, [98, 147], '"100 °F ≈ 섭씨 38도"', {dur: 1.4, gain: -33});
  swell('heat', P.heat, [82, 123], '"무더위": 여름 저녁 배경이 밝아지고 아지랑이', {dur: 1.6, gain: -34});
  // origin
  hum('hum_o1', P.o0 + 0.3, P.anyone - 0.3, '눈금 없는 온도계: 기둥이 오르내림 → 같은 대응의 음이 오르내림 (숫자는 읽을 수 없음)');
  tick('what', P.what, 147, -34, '"몇 도?" 칸', {decay: 0.1});
  tick('no_scale', P.noScale, 98, -33, '"눈금 없음" 표시', {decay: 0.14});
  hum('hum_o2', P.anyone - 0.1, P.read + 1.4, `얼음물에 닿아 0 °C(${hz(0)} Hz), 끓는 물에 닿아 100 °C(${hz(100)} Hz)로 기둥이 움직임`);
  tick('ref1', P.ref1, 131, -32, '기준점 ① 표시(얼음물 높이)', {decay: 0.16});
  tick('ref2', P.ref2, 196, -32, '기준점 ② 표시(끓는 물 높이)', {decay: 0.16});
  ticks('div10', [...Array(10)].map((_, k) => P.div0 + (k + 1) / 10 * (P.div1 - P.div0)), 147, -36, '두 기준점 사이를 10칸으로 고르게 나눔: 칸마다 틱', {decay: 0.05});
  tick('read', P.read + 0.9, 165, -34, '이제 숫자로 읽힘 "6.4칸"', {decay: 0.12});
  // fahr
  tick('card_1724', P.y1724, 131, -33, '"Fahrenheit" 카드 (1724)', {decay: 0.12});
  tick('beaker', P.ice, 110, -34, '얼음 + 염화암모늄 비커', {decay: 0.12});
  hum('hum_f1', P.mixT0 - 0.3, P.zero + 0.5, `혼합물에 닿아 기둥이 내려감 (약 −15.6 °C, ${hz(F24.mixC)} Hz)`);
  tick('mark0', P.zero, 98, -31, '"처음의 0도" 표시', {decay: 0.18});
  tick('person', P.person, 110, -34, '사람 실루엣', {decay: 0.12});
  hum('hum_f2', P.bodyT0 - 0.3, P.n96 + 0.4, `체온으로 기둥이 올라감 (37 °C, ${hz(37)} Hz)`);
  tick('mark96', P.n96, 165, -31, '"96" 표시(체온)', {decay: 0.18});
  ticks('div96', sweepTicks(P.div96[0], 96), 147, -36, '처음 눈금 0~96 사이를 그림: 5칸마다 틱 (1.5초에 19번)', {decay: 0.04});
  swell('refined', P.later, [110, 165], '다듬은 눈금(°F)이 나타남, 체온은 98.6', {dur: 1.4, gain: -34});
  hum('hum_f3', P.cupF - 0.2, P.n212 + 0.45, `얼음물 0 °C(${hz(0)} Hz) → 끓는 물 100 °C(${hz(100)} Hz)`);
  tick('mark32', P.n32, 131, -31, '"32" 표시(물이 어는 점)', {decay: 0.18});
  tick('mark212', P.n212, 196, -31, '"212" 표시(물이 끓는 점)', {decay: 0.18});
  ticks('div180', sweepTicks(P.div180[0], 180), 147, -36, '어는 점~끓는 점 180칸을 그림: 5칸마다 틱, 1.5초에 36번 (섭씨 100칸보다 1.8배 빠름)', {decay: 0.04});
  tick('c180', P.c180, 165, -33, '"180칸" 괄호', {decay: 0.12});
  // cels
  tick('card_1742', P.y1742, 131, -33, '"Celsius" 카드 (1742)', {decay: 0.12});
  hum('hum_c1', P.boilC - 0.3, P.freezeC + 1.1, `끓는 물 100 °C(${hz(100)} Hz) → 얼음물 0 °C(${hz(0)} Hz)`);
  tick('mark_boil', P.boilC + 0.8, 196, -32, '끓는 점 표시', {decay: 0.16});
  tick('mark_freeze', P.freezeC + 0.85, 131, -32, '어는 점 표시', {decay: 0.16});
  ticks('div100', sweepTicks(P.div100[0], 100), 147, -36, '끓는 점~어는 점 100칸을 그림: 5칸마다 틱, 1.5초에 20번 (화씨 180칸보다 느림)', {decay: 0.04});
  tick('lab0', P.lab0, 196, -33, '끓는 점에 "0"', {decay: 0.12});
  tick('lab100', P.lab100, 131, -33, '어는 점에 "100"', {decay: 0.12});
  hum('hum_c2', P.inv - 0.2, P.inv + 1.6, '거꾸로 눈금: 기둥이 올라가는데(음이 오름) 1742 눈금의 숫자는 100 → 60으로 작아짐');
  whoosh('flip', P.flip[0], P.flip[1] - P.flip[0] + 0.2, 60, 140, '눈금이 뒤집힘(0이 아래, 100이 위로)', -32);
  swell('flipped', P.flip[1], [98, 147], '뒤집힌 눈금 = 지금의 섭씨', {dur: 1.2, gain: -34});
  ticks('hanja', [0, 1].flatMap(j => [0, 1, 2, 3].map(k => P.han + j * 0.35 + k * 0.12)).sort((a, b) => a - b), 123, -37, '한자 음역 攝爾修斯 · 華倫海特이 한 글자씩', {decay: 0.05});
  whoosh('first', P.first + 0.25, 0.6, 90, 150, '첫 글자(攝 · 華)가 아래로 내려옴', -35);
  tick('ssi', P.ssi, 147, -33, '"+ 氏" (성씨 씨)', {decay: 0.12});
  swell('joined', P.join, [110, 165, 220], '"攝氏 = 섭씨", "華氏 = 화씨"', {dur: 1.6, gain: -33});
  // convert
  ticks('sweep_c', sweepTicks(P.sweepC[0], 100), 147, -35, '섭씨 자의 100칸을 그림: 5칸마다 틱, 1.5초에 20번', {decay: 0.04});
  ticks('sweep_f', sweepTicks(P.sweepF[0], 180), 147, -35, '화씨 자의 180칸을 그림: 같은 1.5초에 36번 → 틱이 1.8배 빠름 = 화씨 한 칸이 더 작음', {decay: 0.04});
  whoosh('zoom', P.zoom[0], 0.9, 80, 150, '두 자를 가까이 확대: 한 칸씩 비교', -35);
  tick('small', P.small, 131, -33, '"화씨 1칸 = 섭씨 5/9칸"', {decay: 0.12});
  whoosh('to_graph', P.toB[0], P.toB[1] - P.toB[0], 150, 80, '확대를 풀고 환산 그래프가 나타남', -36);
  const nc = tt => numHz(P.T(tt)), nf = tt => numHz(F_OF_C(P.T(tt))), cEnd = tl.scene('convert').end - 0.3;
  chirp('num_c', P.toB[1] - 0.2, cEnd, nc, () => 0.26, -37, `섭씨 눈금이 읽는 숫자 n → 음 150·2^(n/140) Hz (37.8 → ${numHz(T_HOT).toFixed(0)} Hz, −40 → ${numHz(-40).toFixed(0)} Hz)`, {h: [1], fi: 0.4, fo: 0.4});
  chirp('num_f', P.toB[1] - 0.2, cEnd, nf, () => 0.26, -37, `화씨 눈금이 읽는 숫자 → 같은 대응의 두 번째 음 (100 → ${numHz(100).toFixed(0)} Hz). 영하 40도에서 두 음이 맥놀이를 내며 하나로 겹침`, {h: [1], fi: 0.4, fo: 0.4});
  tick('slope', P.x18, 147, -34, '기울기 "+50 °C → +90 °F = 1.8배"', {decay: 0.1});
  tick('icpt', P.p32, 131, -34, '"0 °C → 32 °F (+32)"', {decay: 0.1});
  tick('yx', P.yx[0], 110, -34, '"같은 숫자 선" (°F = °C)이 그려짐', {decay: 0.12});
  swell('meet', P.meet, [r(numHz(-40), 1), r(numHz(-40) * 1.5, 1)], `두 직선이 −40에서 만남: "−40 °C = −40 °F" (두 숫자 음이 같은 ${numHz(-40).toFixed(0)} Hz)`, {dur: 1.8, gain: -33});
  // kelvin
  tick('card_1848', P.y1848, 131, -33, '"1848 · William Thomson" 카드', {decay: 0.12});
  tick('lord', P.lord, 147, -34, '"훗날 Lord Kelvin"', {decay: 0.1});
  whoosh('zoom_out', P.zoomK[0], P.zoomK[1] - P.zoomK[0], 150, 70, '눈금이 아래로 늘어나 절대영도까지 보임', -35);
  hum('hum_k1', P.drop[0] - 0.4, P.zeroK + 0.6, `기둥이 절대영도로 내려감: 음 ${hz(20)} Hz → 0 (들리지 않는 바닥), 알갱이 운동이 멈춤 (모형)`);
  thump('zero_k', P.zeroK, '"0 K" 바닥 표시', -30, 55);
  ticks('k_labels', [0, 1, 2].map(k => P.kLabels + k * 0.12), [110, 131, 147], -35, '켈빈 자에 100 · 200 · 300', {decay: 0.08});
  tick('unit1', P.unit1, 131, -34, '돋보기: "1 °C"와 "1 K" 한 칸 크기가 같음', {decay: 0.12});
  hum('hum_k2', P.addT[0] - 0.2, P.addT[1] + 0.6, `0 K에서 273.15를 더해 올라감: 0 °C(${hz(0)} Hz) 지나 37.8 °C(${hz(T_HOT)} Hz)`);
  tick('kform', P.kform, 165, -34, '"K = °C + 273.15" 식', {decay: 0.12});
  tick('no_deg', P.noDeg, 131, -33, '"°K → K (1967)" 칸', {decay: 0.12});
  thump('strike', P.strike + 0.1, '"°K"에 줄 (켈빈에는 도를 붙이지 않음)', -31, 70);
  // myth
  tone('bar20', P.m20 + 0.55, degHz(20), 0.9, -34, `20 °C 막대 → 음높이를 °C 숫자에 비례시킴: 11·20 = ${degHz(20)} Hz`);
  tone('bar10', P.m10 + 0.55, degHz(10), 0.9, -34, `10 °C 막대 → 11·10 = ${degHz(10)} Hz: 숫자만 보면 한 옥타브(두 배)`);
  tick('twice', P.twice, 147, -33, '"두 배?" 괄호', {decay: 0.12});
  thump('no', P.no17 + 0.1, '"아닙니다": "두 배?"에 ✕', -30, 70);
  whoosh('rebase', P.toK[0], P.toK[1] - P.toK[0], 150, 70, '바닥을 0 °C에서 0 K로 내려 다시 그림', -35);
  tone('k293', P.k293, humHz(20), 1.0, -34, `293 K → 기둥 높이와 같은 대응 0.6·K = ${humHz(20).toFixed(0)} Hz`);
  tone('k283', P.k283, humHz(10), 1.0, -34, `283 K → ${humHz(10).toFixed(0)} Hz: 293 K와 3.5 % 차이 → 음이 거의 같음`);
  ev.push({id: 'boxes', at: r(P.parts + 0.1, 4), kind: 'custom', params: {gain_db: -38, layers: [10, 20].map(v => ({kind: 'tone', offset: 0, params: {freq: r(humHz(v), 2), dur: 2.6, harmonics: [1, 0.4], attack: 0.3, decay: 1.0, sustain: 0.8, release: 0.6, gain_db: 0}}))},
    means: `두 상자(283 K · 293 K)가 함께: ${humHz(10).toFixed(0)} Hz와 ${humHz(20).toFixed(0)} Hz를 같이 울림 → 거의 같은 음, 느린 맥놀이 ${(humHz(20) - humHz(10)).toFixed(0)} Hz`});
  tick('pct', P.pct, 165, -36, '"차이 약 3.5 %"', {decay: 0.12});
  // use
  ticks('ratio', [P.u0 + 0.2, P.ratio, P.ratio + 0.8], [131, 165, 147], -34, '0 K에서 그린 150 K 막대, 300 K 막대("기체 압력 ∝ K", "알갱이 운동 에너지 ∝ K"), "켈빈이 2배 → 2배"', {decay: 0.1});
  swell('bulb_on', P.bulb, [110, 165], '전구가 켜짐 (2700 K 색)', {dur: 1.2, gain: -34});
  tick('box', P.box, 123, -34, '"6500K 주광색" 상자', {decay: 0.12});
  chirp('color_sweep', P.k65[0] - 0.4, P.k65[1] + 0.8, tt => lightHz(P.Kc(tt)), () => 0.3, -36, `색온도 손잡이 2700 K → 6500 K: 음높이 0.06·K (${lightHz(2700).toFixed(0)} → ${lightHz(6500).toFixed(0)} Hz), 빛이 따뜻한 색에서 낮빛으로`, {h: [1, 0.3], fi: 0.3, fo: 0.4});
  tick('col_tag', P.colT, 147, -34, '"빛의 색을 켈빈으로"', {decay: 0.12});
  // close
  hum('hum_close', P.cl0 + 0.1, P.hot1 + 0.6, `같은 무더위로 기둥이 올라감: 20 °C(${hz(20)} Hz) → 37.8 °C(${hz(T_HOT)} Hz)`);
  tick('r38', P.r38, 131, -32, '섭씨 칸 "38"', {decay: 0.14});
  tick('r100', P.r100, 147, -32, '화씨 칸 "100"', {decay: 0.14});
  tick('r311', P.r311, 165, -32, '켈빈 칸 "311"', {decay: 0.14});
  swell('diff', P.diff, [r(humHz(T_HOT), 1), r(humHz(T_HOT) * 1.5, 1)], `"같은 높이 · 다른 숫자": 같은 온도의 음 ${hz(T_HOT)} Hz (+ 5도 위)`, {dur: 1.6, gain: -34});
  swell('poster_back', P.reason, [110, 165, 220], '"온도 눈금은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz); swell overtones (2f) are kept below it by construction.
 */
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') {
      const f = Math.max(...p.points.map(q => q[1])); if (f >= HIGH_CUT) throw new Error(`${e.id}: chirp ${f} Hz`);
      p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT);
    } else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/temperature-scales/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(온도 T(t)의 매듭 목록, 눈금 환산식, 이상기체 비율, 흑체 색)에서 써 넣습니다. 대응: 온도계 기둥 높이(절대온도) → 낮은 음 0.6·K Hz(같은 온도 = 같은 음, 어느 눈금으로 읽든), 눈금 칸 그리기 → 5칸마다 낮은 틱(모든 그리기는 1.5초: 화씨 180칸이 섭씨 100칸보다 1.8배 빠르게 들림), 환산 장면 → 섭씨 숫자와 화씨 숫자를 각각 음 150·2^(n/140) Hz로(영하 40도에서 하나로 겹침), 오해 장면 → °C 숫자에 비례한 음(10 → 110 Hz, 20 → 220 Hz: 한 옥타브)과 켈빈에 비례한 음(283 K 170 Hz, 293 K 176 Hz: 거의 같음), 색온도 → 0.06·K Hz. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; T knots ${P.Tk.length}; sweeps 96@${P.div96[0].toFixed(2)} 180@${P.div180[0].toFixed(2)} 100@${P.div100[0].toFixed(2)} C@${P.sweepC[0].toFixed(2)} F@${P.sweepF[0].toFixed(2)}; flip ${P.flip.map(x => x.toFixed(2)).join('–')}; meet ${P.meet.toFixed(2)}`);
  if (P.warnings.length) console.warn('plan warnings:\n  ' + P.warnings.join('\n  ')); else console.log('plan order checks: ok');
  console.log(`colours 2700 K ${bbColor(2700)} 6500 K ${bbColor(6500)}; KE ratio ${KE_RATIO.toFixed(4)}; 100 °F = ${T_HOT.toFixed(2)} °C = ${K_OF_C(T_HOT).toFixed(2)} K`);
}
