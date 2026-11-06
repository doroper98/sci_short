// Episode scenes — "얼마나 차가워질 수 있을까 — 절대영도"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Ideal gas (이상기체 모형): N particles in a box, no collisions between particles. Velocity components are a seeded
//    normal (2D Maxwell–Boltzmann) sample, rescaled so the sample's mean speed is exactly √(π/2) σ. On screen every
//    velocity is multiplied by σ(T) = DISP·v̄(T)/√(π/2), v̄(T) = √(8RT/πM) (air, M = 0.02897 kg/mol; 20 °C → 463 m/s,
//    DISP = 0.8 px/s per m/s). Positions are folded straight lines: x = fold(x0 + u·Φ(t)), Φ(t) = ∫σ(T)dt (tables).
//    Wall hits are the exact fold crossings → hit rate ∝ √T, hit strength (normal speed) ∝ √T, pressure P ∝ T.
//  - Constant-volume air: P = T/273.15 atm (1 atm at 0 °C). Its straight line reaches P = 0 at −273.15 °C (dashed
//    extrapolation; real air liquefies first).
//  - Ladder (설명 모형): each cooling step halves the remaining temperature, T_n = 2^−n K from 1 K; never 0.
//  - Space: a small object in empty space cools by radiation and is warmed by the background light:
//    dT/dτ = −κ(T⁴ − Tc⁴)/T³ (radiation ∝ T⁴, Debye heat capacity ∝ T³), Tc = 2.725 K (설명 모형, 시간 압축).
//    Boomerang Nebula outflow: constant speed, adiabatic (γ = 5/3, ρ ∝ r⁻²) → T ∝ r^(−4/3), 1 K at the drawn edge.
//  - Laser cooling (설명 모형): optical molasses v(t) = v0·e^(−γt) + a small residual random walk (Doppler limit);
//    an absorption kick each time ∫|v|dt passes a fixed length → kicks thin out as the atoms slow.
//    Cloud temperature T = 300 K·e^(−2γt) + 100 μK.
//  - 2021 Bremen drop tower: free fall y = ½gt² (g = 9.81, 110 m drop in 4.74 s, real time). Cloud width
//    σ(τ) = √(σ0² + kT τ²/m) for ⁸⁷Rb: 38 pK → ≈ 0.12 mm in 2 s; a 1 μK cloud would spread ≈ 2 cm.
//  - Mercury: R drops to 0 below 4.15 K (Onnes 1911). Helium-4 film creeps above 2.17 K → below (silhouette only).
//  - Zero-point motion: harmonic well, ground level ½ħω above the bottom; jitter amplitude exaggerated (과장).
//  - Sound: node episodes/absolute-zero/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow, sphere,
  withAlpha, rect, clipRect, clipEllipse, TAU, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = {base: 'navy', accent: '#7FE3FF', bg: '#08122A', deep: '#030814', plate: '#0D1A36', border: '#26406A', light: '#BFEFFF'};
export const captionLayout = {};
export const events = [];

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const T0 = 273.15, R_GAS = 8.314462, M_AIR = 0.02897, KB = 1.380649e-23, M_RB = 86.909 * 1.66054e-27, G = 9.81;
/** Maxwell–Boltzmann mean speed of air molecules (m/s) at TK kelvin */
export const vMean = TK => Math.sqrt(8 * R_GAS * Math.max(0, TK) / (Math.PI * M_AIR));
/** constant-volume air (ideal gas), 1 atm at 0 °C */
export const pAtm = TK => Math.max(0, TK) / T0;
export const DISP = 0.8;                                                   // px/s on screen per m/s
export const sigmaDisp = TK => DISP * vMean(TK) / Math.sqrt(Math.PI / 2);   // per-component σ so that mean |v| = DISP·v̄
const gauss = R => { const u = Math.max(1e-12, R()), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
/** seeded 2D Maxwell–Boltzmann sample on a jittered grid; mean speed normalised to √(π/2) (so screen mean = DISP·v̄) */
export function gasSample(n, seed, cols = Math.ceil(Math.sqrt(n))) {
  const R = rng(seed), rows = Math.ceil(n / cols);
  const P = [...Array(n)].map((_, i) => ({fx: ((i % cols) + 0.2 + 0.6 * R()) / cols, fy: (Math.floor(i / cols) + 0.2 + 0.6 * R()) / rows, ux: gauss(R), uy: gauss(R), hue: R()}));
  const m = P.reduce((a, p) => a + Math.hypot(p.ux, p.uy), 0) / n, k = Math.sqrt(Math.PI / 2) / m;
  for (const p of P) { p.ux *= k; p.uy *= k; }
  return P;
}
const fold = (u, L) => { const m = ((u % (2 * L)) + 2 * L) % (2 * L); return m <= L ? m : 2 * L - m; };
/** Φ(t) = ∫σ(T(t))dt as a table on [t0, t1]; linear extrapolation outside; inv(Φ) by bisection */
export function phiTable(Tof, t0, t1, dt = 1 / 240) {
  const n = Math.ceil((t1 - t0) / dt) + 2, F = new Float64Array(n);
  for (let i = 1; i < n; i++) F[i] = F[i - 1] + sigmaDisp(Tof(t0 + (i - 0.5) * dt)) * dt;
  const s0 = sigmaDisp(Tof(t0)), s1 = sigmaDisp(Tof(t0 + (n - 1) * dt));
  const at = t => { const u = (t - t0) / dt; if (u <= 0) return u * dt * s0; if (u >= n - 1) return F[n - 1] + (u - n + 1) * dt * s1; const i = Math.floor(u); return lerp(F[i], F[i + 1], u - i); };
  const inv = f => { let lo = 0, hi = n - 1; if (f <= 0) return t0 + f / Math.max(1e-9, s0); if (f >= F[n - 1]) return t0 + (n - 1) * dt + (f - F[n - 1]) / Math.max(1e-9, s1);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m] < f) lo = m; else hi = m; } return t0 + (lo + (f - F[lo]) / Math.max(1e-12, F[hi] - F[lo])) * dt; };
  return {t0, t1, at, inv, T: Tof};
}
/** particles of a sample inside a w×h box (radius r): positions and exact wall hits */
export function boxGas(sample, w, h, r, phi) {
  const Lx = w - 2 * r, Ly = h - 2 * r;
  const pos = (p, t) => { const f = phi.at(t); return [r + fold(p.fx * Lx + p.ux * f, Lx), r + fold(p.fy * Ly + p.uy * f, Ly)]; };
  /** all wall hits in [ta, tb]: {t, i, wall: 'L'|'R'|'T'|'B', s (normal speed px/s), along (px)} sorted by t */
  function hits(ta, tb) {
    const fa = phi.at(ta), fb = phi.at(tb), out = [];
    sample.forEach((p, i) => {
      for (const [u0, uu, L, axis] of [[p.fx * Lx, p.ux, Lx, 'x'], [p.fy * Ly, p.uy, Ly, 'y']]) {
        if (Math.abs(uu) < 1e-9) continue;
        const a = u0 + uu * fa, b = u0 + uu * fb, lo = Math.min(a, b), hi = Math.max(a, b);
        for (let k = Math.ceil(lo / L); k <= Math.floor(hi / L); k++) {
          const f = (k * L - u0) / uu, t = phi.inv(f); if (t < ta || t > tb) continue;
          const odd = Math.abs(k) % 2 === 1, wall = axis === 'x' ? (odd ? 'R' : 'L') : (odd ? 'B' : 'T');
          const q = pos(p, t);
          out.push({t: +t.toFixed(4), i, wall, s: Math.abs(uu) * sigmaDisp(phi.T(t)), along: axis === 'x' ? q[1] : q[0]});
        }
      }
    });
    return out.sort((x, y) => x.t - y.t);
  }
  return {pos, hits, Lx, Ly};
}
/** piecewise schedule through knots [[t, v], …] with smoothstep easing; log = interpolate log10(v).
 *  Knot times are forced to increase (≥ 0.05 s apart) so a faster or slower narration cannot fold the schedule. */
export function sched(knots, log = false) {
  knots = knots.map(k => [...k]); for (let i = 1; i < knots.length; i++) knots[i][0] = Math.max(knots[i][0], knots[i - 1][0] + 0.05);
  const f = log ? Math.log10 : x => x, g = log ? x => 10 ** x : x => x;
  return t => {
    if (t <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [a, va] = knots[i - 1], [b, vb] = knots[i]; return g(lerp(f(va), f(vb), smooth((t - a) / Math.max(1e-6, b - a)))); }
    return knots.at(-1)[1];
  };
}

// ---- ladder (설명 모형): T_n = 2^−n K ----
export const LADDER_N = 20, ladderT = n => 2 ** -n;

// ---- space: radiative cooling with Debye heat capacity, background Tc = 2.725 K ----
export const T_CMB = 2.725, PROBE = {T0: 300, kap: 2.3};
export const PROBE_TAB = (() => { const dt = 1 / 600, n = Math.round(8 / dt) + 1, Tt = new Float64Array(n); let T = PROBE.T0;
  for (let i = 0; i < n; i++) { Tt[i] = T; for (let s = 0; s < 4; s++) { const d = dt / 4; T += -PROBE.kap * (T ** 4 - T_CMB ** 4) / T ** 3 * d; } }
  return {dt, n, Tt}; })();
export const probeT = tau => { if (tau <= 0) return PROBE.T0; const u = Math.min(tau / PROBE_TAB.dt, PROBE_TAB.n - 1.001), i = Math.floor(u); return lerp(PROBE_TAB.Tt[i], PROBE_TAB.Tt[i + 1], u - i); };
/** Boomerang outflow (설명 모형): T ∝ r^(−4/3), 1 K at the drawn edge r = 1 */
export const nebT = r => Math.max(r, 0.04) ** (-4 / 3);
export const R_CMB = T_CMB ** (-3 / 4);                                    // radius where the gas falls below 2.725 K (0.471)

// ---- laser cooling (설명 모형) ----
export const MOLASSES = {gamma: 1.9, T_hot: 300, T_min: 1e-4, lkick: 30};
export const ATOM_S0 = 230, DOP = {v0: 320, l: 18};
export const cloudT = tau => (tau <= 0 ? MOLASSES.T_hot : MOLASSES.T_hot * Math.exp(-2 * MOLASSES.gamma * tau) + MOLASSES.T_min);

// ---- 2021 drop tower and the cloud width ----
export const DROP = {H: 110, T: Math.sqrt(2 * 110 / G)};                    // 4.74 s
export const cloudSigma = (TK, tau, s0 = 4e-5) => Math.sqrt(s0 * s0 + KB * TK / M_RB * tau * tau);   // m
export const T_REC = 38e-12;

// ---- s16: mercury and helium ----
export const TC_HG = 4.15, T_LAMBDA = 2.17;
export const hgR = TK => (TK > TC_HG + 0.03 ? 0.93 + 0.07 * clamp((TK - 4.2) / 6) : TK > TC_HG ? 0.93 * (TK - TC_HG) / 0.03 : 0);   // R/R(10 K), schematic above Tc

// ---- temperature colour (log scale), formatting ----
const TSTOPS = [[-12, '#5C8DFF'], [-4, '#6FB6FF'], [0, '#7FE3FF'], [1.3, '#A8EDFF'], [2.2, '#DCEFF5'], [2.47, '#F2EEE6'], [2.62, '#FFD9A8'], [3.4, '#FFB36A'], [5, '#FF8A4A'], [8.5, '#FF5A5A']];
export function tempCol(TK) {
  const L = Math.log10(Math.max(1e-13, TK));
  if (L <= TSTOPS[0][0]) return TSTOPS[0][1];
  for (let i = 1; i < TSTOPS.length; i++) if (L <= TSTOPS[i][0]) return mix(TSTOPS[i - 1][1], TSTOPS[i][1], (L - TSTOPS[i - 1][0]) / (TSTOPS[i][0] - TSTOPS[i - 1][0]));
  return TSTOPS.at(-1)[1];
}
const MINUS = '−';
export const fmtNum = (x, d = 0) => x.toFixed(d).replace('-', MINUS);
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmtC = TK => (TK >= 10 ? `${fmtNum(Math.round(TK - T0))} °C` : `${fmtNum(TK - T0, 2)} °C`);
export function fmtK(TK, sig = 3) {
  if (TK <= 0) return '0 K';
  const P = [[1, ''], [1e-3, 'm'], [1e-6, 'μ'], [1e-9, 'n'], [1e-12, 'p']];
  let [s, pre] = P.find(([s]) => TK >= s * 0.9995) || P.at(-1); const v = TK / s;
  const d = v >= 100 ? 0 : v >= 10 ? Math.max(0, sig - 2) : Math.max(0, sig - 1);
  return `${group(v.toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'))} ${pre}K`;
}

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  colder: W('s01', '차가워질'), temp1: W('s01', '온도,'), az1: W('s01', '절대영도에'),
  temp2: W('s02', '온도는'), up: W('s02', '위로는'), hundredM: W('s02', '수억'), rise: W('s02', '오르지만'), down: W('s02', '아래로는'), minus: W('s02', '영하'), num2: W('s02', '이백칠십삼점일오도라는'), floor2: W('s02', '바닥이'),
  jeoldae: W('s03', '절대는'), oppo: W('s03', '맞설'), cut: W('s03', '끊는다는'), hanja: W('s03', '한자말로'), what: W('s03', '무엇과'), compare: W('s03', '견주지'), fixed: W('s03', '정해진'), floor3: W('s03', '바닥이라는'),
  y1702: W('s04', '천칠백이년'), amontons: W('s04', '아몽통은'), air: W('s04', '공기를'), cool4: W('s04', '식힐수록'), even: W('s04', '고르게'), dec4: W('s04', '줄어든다는'),
  line5: W('s05', '줄을'), extend: W('s05', '늘이면'), zero5: W('s05', '영이'), temp5: W('s05', '온도가'), today5: W('s05', '오늘날'), value5: W('s05', '이백칠십삼점일오도입니다'),
  temp6: W('s06', '온도는'), grains: W('s06', '알갱이들이'), lively: W('s06', '활발하게'), moving: W('s06', '움직이는지를'),
  cool7: W('s07', '식힐수록'), slow7: W('s07', '느려지고'), wall: W('s07', '벽을'), press7: W('s07', '압력도'), dec7: W('s07', '줄어듭니다'),
  move8: W('s08', '움직임이'), below8: W('s08', '내려갈'), floor8: W('s08', '바닥이'), az8: W('s08', '절대영도입니다'),
  zero9: W('s09', '영으로'), kelvin: W('s09', '켈빈'), zeroK: W('s09', '영켈빈이'), az9: W('s09', '절대영도입니다'),
  az10: W('s10', '절대영도에는'), never: W('s10', '끝내'), cool10: W('s10', '식힐'), left10: W('s10', '남은'), part: W('s10', '일부만'), remove: W('s10', '덜어'),
  half: W('s11', '반씩'), step11: W('s11', '걸음처럼'), closer: W('s11', '가까이'), more: W('s11', '갈수록'), one11: W('s11', '한 걸음이'), short: W('s11', '짧아져'), times: W('s11', '몇'), zero11: W('s11', '영에'), fail: W('s11', '이르지'),
  space: W('s12', '우주'), bigbang: W('s12', '빅뱅이'), light: W('s12', '빛'), k27: W('s12', '이점칠켈빈'), m270: W('s12', '영하'),
  coldest: W('s13', '가장'), boom: W('s13', '부메랑'), gas13: W('s13', '가스가'), spread: W('s13', '퍼지며'), cool13: W('s13', '식어'), k1: W('s13', '일켈빈까지'),
  ground: W('s14', '지상의'), colder14: W('s14', '훨씬'), laser: W('s14', '레이저'), atoms14: W('s14', '원자의'), grab: W('s14', '붙잡아'), slow14: W('s14', '늦추기'),
  y2021: W('s15', '이천이십일년'), cloud: W('s15', '원자'), tower: W('s15', '낙하탑에서'), drop: W('s15', '떨어뜨려'), above: W('s15', '절대영도보다'), trillion: W('s15', '일조분의'), p38: W('s15', '삼십팔도'), record: W('s15', '기록했습니다'),
  so16: W('s16', '이렇게'), face: W('s16', '얼굴을'), resist: W('s16', '전기'), vanish: W('s16', '사라지고'), liquid: W('s16', '액체가'), climb: W('s16', '오르기도'),
  all17: W('s17', '모든'), stop17: W('s17', '멈출까요'), no18: W('s18', '그렇지'), qm: W('s18', '양자역학에'), lowest18: W('s18', '가장'), little: W('s18', '조금'), tremble: W('s18', '떨리며'), zp: W('s18', '영점'),
  tech: W('s19', '냉각'), reach19: W('s19', '영에'), not19: W('s19', '아니라'), decimal: W('s19', '소수점'), zeros: W('s19', '영의'), count: W('s19', '개수를'), fight: W('s19', '싸움입니다'),
  az20: W('s20', '절대영도는'),
};

// ---- hook world: a vertical temperature axis (linear with breaks), floor at the bottom ----
export const HK = {x: 540, floor: 1300, sA: 1.9, cTop: 450};
export const yOfC = c => HK.floor - (c + T0) * HK.sA;
const Y_ATOP = yOfC(HK.cTop);
export const HOT = [{y: -234, c: 5500, v: '약 5,500 °C', n: '태양 표면'}, {y: -504, c: 1.5e7, v: '약 1,500만 °C', n: '태양 중심'}, {y: -774, c: 1e8, v: '1억 °C 이상', n: '핵융합 장치'}];
export const PIECES = [[HK.floor, Y_ATOP], [Y_ATOP - 50, -344], [-394, -614], [-664, -1000]];
const HKNOTS = [[Y_ATOP, Math.log10(HK.cTop + T0)], ...HOT.map(h => [h.y, Math.log10(h.c + T0)])];
/** temperature (K) at a world y on the hook axis */
export function hookTK(y) {
  if (y >= Y_ATOP) return Math.max(0, (HK.floor - y) / HK.sA);
  for (let i = 1; i < HKNOTS.length; i++) if (y >= HKNOTS[i][0]) return 10 ** lerp(HKNOTS[i - 1][1], HKNOTS[i][1], (HKNOTS[i - 1][0] - y) / (HKNOTS[i - 1][0] - HKNOTS[i][0]));
  return 10 ** HKNOTS.at(-1)[1];
}
const BEAD_REST = HK.floor - 15;

// =====================================================================================================
// Per-timeline plan (all motion that the sound also needs)
// =====================================================================================================
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export const GAS_N = 22, GAS_SAMPLE = gasSample(GAS_N, 11, 6), BOX_N = 34, BOX_SAMPLE = gasSample(BOX_N, 29, 6);
export const GS = {flask: [214, 566, 252, 196], r: 8};
export const MO = {ax: 300, top: 430, floor: 1250, kTop: 120 + T0, box: [440, 430, 480, 440], r: 11};
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook: bead level 0 (floor) → 1 (top tick) → 0
  P.floorLab = at(A.az1) - 0.1; P.rise = [at(A.temp2) + 0.25, at(A.rise) + 0.35]; P.fall = [at(A.down) - 0.05, at(A.floor2) - 0.35]; P.floorGlow = at(A.floor2) - 0.1;
  P.minus = at(A.minus) - 0.1;
  const yTop = HOT[2].y;
  P.s01 = [MORPH[1] + 0.05]; P.s01.push(Math.max(at(A.colder) - 0.05, P.s01[0] + 0.55)); P.s01.push(Math.max(at(A.temp1) - 0.05, P.s01[1] + 0.8));   // s01: up to 20 °C, then down onto the floor
  const y20 = yOfC(20), land = (q, y0) => lerp(y0, BEAD_REST, q < 0.75 ? easeIn(q / 0.75) * 0.93 : 0.93 + 0.07 * easeOut((q - 0.75) / 0.25));
  P.beadY = t => {
    if (t > P.s01[0] && t < P.s01[2]) { if (t < P.s01[0] + 0.45) return lerp(BEAD_REST, y20, easeInOut((t - P.s01[0]) / 0.45)); if (t < P.s01[1]) return y20; return land((t - P.s01[1]) / (P.s01[2] - P.s01[1]), y20); }
    if (t < P.rise[0] || t > P.fall[1]) return BEAD_REST;
    if (t < P.rise[1]) return lerp(BEAD_REST, yTop, easeInOut((t - P.rise[0]) / (P.rise[1] - P.rise[0])));
    if (t < P.fall[0]) return yTop;
    return land((t - P.fall[0]) / (P.fall[1] - P.fall[0]), yTop); };
  P.cam = t => Math.max(0, 720 - P.beadY(t));
  P.hotPass = HOT.map(h => { let lo = P.rise[0], hi = P.rise[1]; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (P.beadY(m) > h.y) lo = m; else hi = m; } return (lo + hi) / 2; });
  P.arrowLab = P.rise[1] + 0.1;
  // origin
  P.hanja = at(A.jeoldae) - 0.15; P.oppo = at(A.oppo) - 0.1; P.cut = at(A.cut) + 0.15; P.cards = at(A.hanja) - 0.1; P.floor3 = at(A.what) - 0.1; P.bars = at(A.compare) - 0.05; P.fixed = at(A.fixed) - 0.1;
  // gas: bath 100 → −20 °C linearly, one point every 20 °C
  P.app = at(A.y1702) - 0.3; P.cool = [at(A.cool4) - 0.2, at(A.dec4) + 0.6];
  P.bathC = t => 100 - 120 * clamp((t - P.cool[0]) / (P.cool[1] - P.cool[0]));
  P.ptC = [100, 80, 60, 40, 20, 0, -20]; P.ptT = P.ptC.map((c, k) => P.cool[0] + k / 6 * (P.cool[1] - P.cool[0]) + (k === 0 ? 0.05 : 0));
  P.even = at(A.even) - 0.1; P.fit = at(A.line5) - 0.1; P.ext = [at(A.extend) - 0.1, at(A.zero5) + 0.35]; P.cross = at(A.temp5) - 0.1; P.liq = at(A.today5) - 0.3; P.val5 = at(A.value5) - 0.05;
  P.gasPhi = phiTable(t => P.bathC(t) + T0, sc('gas').start - 1, sc('gas').end + 1);
  P.gas = boxGas(GAS_SAMPLE, GS.flask[2], GS.flask[3], GS.r, P.gasPhi);
  // motion: knob schedule (K)
  P.lively = at(A.lively) - 0.15; P.cool7 = at(A.cool7) - 0.1; P.wall = at(A.wall) - 0.1; P.press7 = at(A.press7) - 0.1;
  P.move8 = at(A.move8) - 0.1; P.floor8 = at(A.floor8) - 0.1; P.az8 = at(A.az8) - 0.1;
  P.zero9 = at(A.zero9) - 0.1; P.kelvin = at(A.kelvin) - 0.2; P.zeroK = at(A.zeroK) - 0.1;
  P.moT = sched([[sc('motion').start, 293.15], [P.lively, 293.15], [P.lively + 1.0, 373.15], [P.cool7, 373.15], [at(A.dec7) + 0.4, 60], [P.move8, 60], [P.floor8 + 0.2, 1.0]]);
  P.moPhi = phiTable(P.moT, sc('motion').start - 1, sc('motion').end + 1);
  P.box = boxGas(BOX_SAMPLE, MO.box[2], MO.box[3], MO.r, P.moPhi);
  P.moHits = P.box.hits(sc('motion').start - 0.5, sc('motion').end + 0.2);
  P.gasHits = P.gas.hits(sc('gas').start - 0.5, sc('gas').end + 0.2);
  // ladder: zoom 300 K → 1.25 K, then steps
  P.zoom1 = [at(A.az10) - 0.1, Math.min(at(A.never) + 0.9, at(A.cool10) - 0.6)];
  const st = [at(A.cool10), at(A.remove), at(A.half), at(A.step11), at(A.closer), at(A.more), at(A.one11), at(A.short)].map(x => x - 0.05);
  const r0 = at(A.times) - 0.05, r1 = at(A.zero11) + 0.1;
  const nr = LADDER_N - st.length; for (let k = 0; k < nr; k++) st.push(r0 + k * (r1 - r0) / (nr - 1));
  P.stepT = st;                                                          // P.stepT[k−1] = time of step k (drop to 2^−k)
  P.zoomStart = r0 - 0.1;
  P.nEff = t => { let n = 0; for (let k = 0; k < st.length; k++) { const dd = Math.min(0.3, 0.6 * ((st[k + 1] ?? st[k] + 1) - st[k])); n += clamp((t - st[k]) / dd); } return n; };
  P.ladderMax = t => { const z1 = 10 ** lerp(Math.log10(300), Math.log10(1.25), smooth((t - P.zoom1[0]) / (P.zoom1[1] - P.zoom1[0])));
    if (t < P.zoomStart) return z1; const ramp = smooth((t - P.zoomStart) / 0.6); return 1.25 * 2 ** -(Math.max(0, P.nEff(t) - 3) * ramp + 0); };
  P.never = at(A.fail) - 0.1;
  // space
  P.sky = at(A.space) - 0.25; P.probe0 = at(A.space) + 0.15; P.k27 = at(A.k27) - 0.1; P.m270 = at(A.m270) - 0.1;
  { let tau = 0; while (probeT(tau) > T_CMB * 1.004 && tau < 7.9) tau += 0.005; P.probeK = Math.max(1, tau / Math.max(0.5, P.k27 - 0.1 - P.probe0)); }
  P.probeTK = t => probeT((t - P.probe0) * P.probeK);
  { // light leaving the object: rate 14/s·min(5, (T/Tc)⁴) (picture cap); light arriving: constant 14/s (PHOTONS)
    const R = rng(808), out = []; let acc = 0; const dt = 1 / 120;
    for (let tt = P.probe0 - 0.6; tt < sc('space').end; tt += dt) { const TK = P.probeTK(tt); acc += 14 * Math.min(5, (TK / T_CMB) ** 4) * dt; while (acc >= 1) { acc -= 1; out.push({t: tt, th: R() * TAU, T: TK}); } }
    P.outPh = out;
  }
  P.neb = sc('space').start + (at('s13') - sc('space').start) - 0.6; P.boom = at(A.boom) - 0.1; P.gas13 = at(A.gas13) - 0.1; P.k1 = at(A.k1) - 0.1;
  P.parcel = [at(A.gas13) - 0.3, at(A.k1) + 0.2];                          // tagged parcel r: 0.12 → 1
  P.parcelR = t => lerp(0.12, 1.0, clamp((t - P.parcel[0]) / (P.parcel[1] - P.parcel[0])));
  P.belowCMB = (() => { let lo = P.parcel[0], hi = P.parcel[1]; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (P.parcelR(m) < R_CMB) lo = m; else hi = m; } return (lo + hi) / 2; })();
  // lab
  P.labIn = at(A.ground) - 0.2; P.laserOn = at(A.laser) - 0.1; P.dop = at(A.atoms14) - 0.2;
  P.cloudTK = t => cloudT(t - P.laserOn);
  P.towerIn = at(A.y2021) - 0.3; P.capsule = at(A.cloud) - 0.1; P.release = at(A.drop); P.land = P.release + DROP.T;
  P.above = at(A.above) - 0.1; P.p38 = at(A.p38) - 0.1; P.obs = [P.release + 0.4, P.release + 2.4];
  P.recTK = sched([[P.above, 1e-4], [P.p38 + 0.2, T_REC]], true); P.trillion = at(A.trillion) - 0.1;
  { // absorption kicks (laser cooling): atom i's k-th kick when its path since the beams came on reaches k·lkick
    const g = MOLASSES.gamma;
    P.kickTime = (i, k) => { const a = ATOMS[i], v0 = Math.hypot(a.ux, a.uy) * ATOM_S0, q = k * MOLASSES.lkick * g / v0; return q >= 1 ? Infinity : P.laserOn - Math.log(1 - q) / g; };
    P.kicks = []; ATOMS.forEach((a, i) => { for (let k = 1; k < 400; k++) { const tk = P.kickTime(i, k); if (!isFinite(tk) || tk > P.towerIn) break; P.kicks.push(tk); } }); P.kicks.sort((x, y) => x - y);
    const v0 = DOP.v0, t0 = P.dop + 0.3; P.dopKicks = []; for (let k = 1; k < 50; k++) { const q = k * DOP.l * g / v0; if (q >= 1) break; const tk = t0 - Math.log(1 - q) / g; if (tk > P.towerIn) break; P.dopKicks.push(tk); }
  }
  P.s16 = sc('lab').start + (at('s16') - sc('lab').start) - 0.5; P.vanish = at(A.vanish) - 0.1; P.climb = at(A.liquid) - 0.1;
  P.lowT = sched([[at('s16') - 0.2, 10], [at(A.resist) + 0.55, 4.6], [at(A.vanish) + 0.1, 3.9], [at(A.liquid) + 0.1, 2.15], [sc('lab').end - 0.3, 1.4]], true);
  const cross = (f, lv, a, b) => { for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (f(m) > lv) a = m; else b = m; } return (a + b) / 2; };
  P.tcHg = cross(P.lowT, TC_HG, at('s16'), sc('lab').end); P.tLam = cross(P.lowT, T_LAMBDA, at('s16'), sc('lab').end);
  // myth
  P.mythQ = at(A.all17) - 0.1; P.stop = at(A.stop17) - 0.1; P.no18 = at(A.no18) - 0.1; P.qm = at(A.qm) - 0.1; P.little = at(A.little) - 0.1; P.zp = at(A.zp) - 0.1;
  P.classAmp = t => 1 - smooth((t - (sc('myth').start + 0.3)) / (P.stop + 0.8 - sc('myth').start - 0.3));
  // close
  P.closeIn = sc('close').start + 0.1; P.reach19 = at(A.reach19) - 0.1; P.not19 = at(A.not19) - 0.05; P.decimal = at(A.decimal) - 0.1; P.zeros = at(A.zeros) - 0.1; P.count = at(A.count) - 0.05;
  P.rows = [P.decimal + 0.1, 0, at(A.zeros) + 0.15]; P.rows[1] = Math.min(P.decimal + 0.75, P.rows[2] - 0.35);
  P.reason = at(A.az20) - 0.1;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export const PAL = {ice: '#7FE3FF', iceHi: '#DDF8FF', frost: '#D2F2FF', warm: '#FFB36A', hot: '#FF7A4A', glass: '#9CC4E4', answer: '#7FE3FF',
  bad: '#FF7A7A', good: '#8FE3BF', laser: '#FF5C7A', gold: '#FFD27A', cmb: '#E8925A', star: '#FFF3D6', hg: '#C9D3DC'};
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage;
  const gr = c.createLinearGradient(0, 0, W * 0.25, H); gr.addColorStop(0, '#0A1632'); gr.addColorStop(0.6, '#050D20'); gr.addColorStop(1, '#02060F');
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  glow(c, 540, 820, 900, '#2A5C8A', 0.07);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.25, b = 0.25) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
function cross(c, x, y, s, col = PAL.bad, w = 5, q = 1) {
  if (q <= 0) return; const a = Math.min(1, q * 2), b = clamp(q * 2 - 1);
  line(c, [[x - s, y - s], [lerp(x - s, x + s, a), lerp(y - s, y + s, a)]], col, w);
  if (b > 0) line(c, [[x + s, y - s], [lerp(x + s, x - s, b), lerp(y - s, y + s, b)]], col, w);
}
/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1350, 0, 1600);
  g.addColorStop(0, 'rgba(1,5,12,0)'); g.addColorStop(0.35, `rgba(1,5,12,${0.6 * a})`); g.addColorStop(0.75, `rgba(1,5,12,${0.6 * a})`); g.addColorStop(1, 'rgba(1,5,12,0)');
  c.fillStyle = g; c.fillRect(0, 1350, 1080, 250);
}
/** a gas particle (shaded sphere) tinted by temperature */
function particle(c, x, y, r, TK, a = 1, hue = 0.5) {
  const col = mix(tempCol(TK), hue < 0.5 ? '#9FD8FF' : '#E8F4FF', 0.18);
  sphere(c, x, y, r, col, {alpha: a, light: '#FFFFFF', shade: mix(col, '#020812', 0.75)});
}

// ---- frost on the "window" (poster, hook, close): hexagonal dendrites grown once into an offscreen layer ----
let FROST = null;
function frostLayer() {
  if (FROST) return FROST;
  const cv = createCanvas(1080, 1920), c = cv.getContext('2d'), R = rng(2026);
  const seg = [];
  function branch(x, y, ang, len, depth, w) {
    if (len < 5 || depth < 0) return;
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len; seg.push([x, y, x1, y1, w, depth]);
    const nb = 2 + Math.floor(R() * 3);
    for (let k = 1; k <= nb; k++) { const u = k / (nb + 1), bx = lerp(x, x1, u), by = lerp(y, y1, u), bl = len * (0.42 - 0.18 * u) * (0.7 + 0.5 * R());
      branch(bx, by, ang + Math.PI / 3, bl, depth - 1, w * 0.6); branch(bx, by, ang - Math.PI / 3, bl, depth - 1, w * 0.6); }
    branch(x1, y1, ang + (R() - 0.5) * 0.25, len * 0.62, depth - 1, w * 0.75);
  }
  const seedEdge = (n, side) => { for (let i = 0; i < n; i++) {
    const y = 120 + R() * 1700, x = side < 0 ? -10 + R() * 30 : 1090 - R() * 30, a0 = (side < 0 ? 0 : Math.PI) + (R() - 0.5) * 1.3;
    branch(x, y, a0, 40 + R() * 70, 3, 2.2); } };
  seedEdge(11, -1); seedEdge(11, 1);
  for (const [x, y, a] of [[-10, 1930, -0.75], [1090, 1930, -2.39], [-10, -10, 0.75], [1090, -10, 2.39]]) branch(x, y, a, 190, 3, 3.0);
  c.lineCap = 'round';
  for (const pass of [0, 1]) for (const [x0, y0, x1, y1, w, d] of seg) {
    c.strokeStyle = pass ? rgba('#EAFBFF', 0.12 + 0.05 * d) : rgba('#7FD8FF', 0.06);
    c.lineWidth = pass ? Math.max(0.8, w) : Math.max(2, w * 3.2);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  // icy haze along the edges
  for (const [x0, x1] of [[0, 170], [1080, 910]]) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(190,235,255,0.10)'); g.addColorStop(1, 'rgba(190,235,255,0)'); c.fillStyle = g; c.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), 1920); }
  FROST = cv; return cv;
}
const HOTP = (() => { const R = rng(91); return [...Array(64)].map(() => { const ang = (R() - 0.5) * 1.4; return {yw: lerp(640, -1000, R() ** 1.15), x0: R() * 1180, dir: R() < 0.5 ? -1 : 1, ang, ph: R() * TAU, r: 3 + R() * 4}; }); })();
const FLOOR_GRAINS = (() => { const R = rng(73), out = []; let x = 150;
  while (x < 935) { const r = 9 + R() * 7; if (Math.abs(x - 540) > 62) out.push({x, r, ph: R() * TAU, ph2: R() * TAU, f: 5 + R() * 3, hue: R()}); x += 2 * r + 6 + R() * 26; }
  return out; })();

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '얼마나 차가워질 수 있을까'],
  origin: ['기원 · 이름', '절대(絶對)라는 말'],
  gas: ['기원 · 1702년 무렵 프랑스', 'Amontons의 공기 온도계'],
  motion: ['본질 · 온도', '알갱이가 움직이는 정도'],
  ladder: ['메커니즘 · 도달할 수 없음', '끝내 닿지 않는 바닥'],
  space: ['현상 · 우주', '빈 우주도 약 2.7 K'],
  lab: ['현상 · 실험실', '빛으로 원자를 늦춘다'],
  myth: ['오해 바로잡기', '0 K에서는 다 멈출까?'],
  close: ['정리', '0의 개수를 늘리는 싸움'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'gas') return [[-Infinity, ...titles.gas], [tl.at('s05') - 0.55, '기원 · 직선 늘이기', '압력이 0이 되는 온도']];
  if (id === 'motion') return [[-Infinity, ...titles.motion], [tl.at('s07') - 0.55, '본질 · 식히기', '식힐수록 느려지는 알갱이'], [P.wall - 0.25, '본질 · 압력', '벽을 두드리는 힘'], [tl.at('s08') - 0.55, '본질 · 바닥', '움직임이 가장 낮은 곳'], [tl.at('s09') - 0.55, '본질 · 켈빈 온도', '바닥을 0으로: 0 K']];
  if (id === 'ladder') return [[-Infinity, ...titles.ladder], [tl.at('s11') - 0.55, '메커니즘 · 설명 모형', '반씩 줄어드는 걸음']];
  if (id === 'space') return [[-Infinity, ...titles.space], [tl.at('s13') - 0.55, '현상 · 가장 차가운 곳', '부메랑 성운 약 1 K']];
  if (id === 'lab') return [[-Infinity, ...titles.lab], [tl.at('s15') - 0.55, '현상 · 2021년 독일', '절대영도 위 38 pK'], [P.s16, '현상 · 아주 낮은 온도', '전혀 다른 얼굴']];
  if (id === 'myth') return [[-Infinity, ...titles.myth], [P.no18 - 0.3, '오해 바로잡기 · 양자역학', '가장 낮은 상태에서도 떨림'], [P.zp - 0.3, '오해 바로잡기 · 양자역학', '영점 진동']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  logRuler(stage, t, ctx);
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', '얼마나 차가워질 수 있을까', fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, `${MINUS}273.15 °C`, ho, 'rgba(0,0,0,0.95)');
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
const POSTER_Q = {y: 1002, y2: 1168, q: '얼마나 차가워질 수 있을까', ans: `${MINUS}273.15 °C`};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 780, 92); ASIZE ||= fit(POSTER_Q.ans, 790, 230);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 880, 0, 1275); g2.addColorStop(0, 'rgba(1,6,16,0)'); g2.addColorStop(0.24, 'rgba(1,6,16,0.8)'); g2.addColorStop(0.8, 'rgba(1,6,16,0.8)'); g2.addColorStop(1, 'rgba(1,6,16,0)');
    c.fillStyle = g2; c.fillRect(0, 880, 1080, 395);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (q < 0.5) withAlpha(c, 1 - q * 2, () => glow(c, 540, y2, 420, PAL.ice, 0.10));
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', tracking: tr * s2, shadow: q < 0.5 ? 'rgba(0,10,30,0.95)' : null, shadowBlur: 26});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/absolute-zero/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [30, 47, 55, 60, 70, 96, 105, 116, 126, 135]) h += Math.log10(P.moT(t)) + P.gasPhi.at(t) / 1e4 + P.moPhi.at(t) / 1e5 + Math.log10(P.ladderMax(t)) / 10;
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${P.moHits.length}/${P.gasHits.length}/${P.stepT.map(x => x.toFixed(2)).join(',')}/${P.tcHg.toFixed(3)}/${P.belowCMB.toFixed(3)}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  gas(stage, t, p, ctx) { gasScene(stage, t, ctx); },
  motion(stage, t, p, ctx) { motionScene(stage, t, ctx); },
  ladder(stage, t, p, ctx) { ladderScene(stage, t, ctx); },
  space(stage, t, p, ctx) { spaceScene(stage, t, ctx); },
  lab(stage, t, p, ctx) { labScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook / poster: the temperature axis down to the floor
function zigzag(c, x, y0, y1, col, w = 3) {
  const n = 4, pts = []; for (let i = 0; i <= n; i++) pts.push([x + (i % 2 ? 16 : -16) * (i === 0 || i === n ? 0 : 1), lerp(y0, y1, i / n)]);
  line(c, pts, col, w);
}
/** the poster/hook picture. o: {labels (0..1), t, P, cam, beadY, floorPulse, a} */
function axisWorld(stage, t, o) {
  const c = stage.ctx, T = stage.theme, cam = o.cam ?? 0, by = o.beadY ?? BEAD_REST, X = HK.x, a = o.a ?? 1, la = o.labels ?? 0;
  const sy = y => y + cam, FL = sy(HK.floor), TK = hookTK(by), bcol = tempCol(Math.max(TK, 0.5));
  withAlpha(c, a, () => {
    // cold mist above the floor, the icy ground below it
    if (FL < 2100) {
      const m = c.createLinearGradient(0, FL - 520, 0, FL); m.addColorStop(0, 'rgba(120,210,255,0)'); m.addColorStop(1, `rgba(120,210,255,${0.13 + 0.1 * (o.floorPulse ?? 0)})`);
      c.fillStyle = m; c.fillRect(0, FL - 520, 1080, 520);
      const g = c.createLinearGradient(0, FL, 0, FL + 640); g.addColorStop(0, '#16324C'); g.addColorStop(0.08, '#0B1D33'); g.addColorStop(1, '#030914');
      c.fillStyle = g; c.fillRect(0, FL, 1080, 1920 - FL + 10);
      const R = rng(5); for (let k = 0; k < 26; k++) { const x0 = R() * 1080, y0 = FL + 14 + R() * 420, l = 40 + R() * 160; line(c, [[x0, y0], [x0 + l, y0 + (R() - 0.5) * 10]], rgba('#9FDFFF', 0.06 + 0.06 * R()), 1.5); }
      // floor line
      glow(c, 540, FL, 620, PAL.ice, 0.10 + 0.14 * (o.floorPulse ?? 0));
      const lg = c.createLinearGradient(0, 0, 1080, 0); lg.addColorStop(0, rgba(PAL.ice, 0)); lg.addColorStop(0.15, rgba(PAL.ice, 0.85)); lg.addColorStop(0.85, rgba(PAL.ice, 0.85)); lg.addColorStop(1, rgba(PAL.ice, 0));
      line(c, [[0, FL], [1080, FL]], lg, 3 + 2 * (o.floorPulse ?? 0), {cap: 'butt'});
      line(c, [[60, FL + 3], [1020, FL + 3]], rgba('#FFFFFF', 0.25), 1, {cap: 'butt'});
      // grains resting on the floor: barely trembling
      const ga = clamp((1400 - FL) / 100);
      if (ga > 0) for (const g0 of FLOOR_GRAINS) {
        const jx = 1.3 * Math.sin(g0.f * t + g0.ph) + 0.6 * Math.sin(2.3 * g0.f * t + g0.ph2), jy = 0.8 * Math.sin(1.7 * g0.f * t + g0.ph2);
        const x = g0.x + jx, y = FL - g0.r - 1 + jy;
        glow(c, x, y, g0.r * 2.6, PAL.ice, 0.10 * ga);
        particle(c, x, y, g0.r, 0.3, ga, g0.hue);
      }
    }
    // warm, fast grains high on the axis (screen speed ∝ T^¼: a display compression, decoration only)
    for (const h of HOTP) {
      const y = sy(h.yw); if (y < -20 || y > 1940) continue;
      const TKh = hookTK(h.yw), v = Math.min(1100, 60 * TKh ** 0.25), x = ((h.x0 + h.dir * v * t) % 1180 + 1180) % 1180 - 50, yy = y + 30 * Math.sin(h.ang + 0.0 * t) * Math.sin(2.1 * t + h.ph);
      const col = mix(tempCol(TKh), PAL.warm, 0.35), a0 = 0.45 + 0.3 * clamp((Math.log10(TKh) - 2.5) / 5), k = 0.08;
      const g = c.createLinearGradient(x - h.dir * v * k, yy, x, yy); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a0 * 0.7));
      line(c, [[x - h.dir * v * k, yy], [x, yy]], g, h.r * 1.5);
      glow(c, x, yy, h.r * 5, col, a0 * 0.45); circle(c, x, yy, h.r, rgba(mix(col, '#FFFFFF', 0.35), Math.min(1, a0 + 0.3)));
    }
    { const g = c.createLinearGradient(0, sy(-1100), 0, sy(700)); g.addColorStop(0, 'rgba(255,120,70,0)'); g.addColorStop(0.5, 'rgba(255,120,70,0.22)'); g.addColorStop(1, 'rgba(255,120,70,0)'); c.fillStyle = g; c.fillRect(0, Math.max(0, sy(-1100)), 1080, Math.min(1920, sy(700)) - Math.max(0, sy(-1100))); }
    // the axis tube, piece by piece, with breaks
    const tubeA = y => clamp((y - 40) / 160);
    PIECES.forEach(([ya, yb], k) => {
      const y0 = sy(yb), y1 = sy(ya); if (y1 < -50 || y0 > 1980) return;
      const top = k === PIECES.length - 1 ? y0 + 30 : y0;
      rect(c, X - 32, top, 64, y1 - top, 32, rgba('#0A1A30', 0.78), rgba(PAL.glass, 0.6), 3);
      line(c, [[X - 17, top + 32], [X - 17, y1 - 24]], rgba('#FFFFFF', 0.12), 5); line(c, [[X + 20, top + 40], [X + 20, y1 - 30]], rgba('#FFFFFF', 0.05), 3);
      if (k > 0) zigzag(c, X, y1, y1 + 50, rgba(PAL.glass, 0.6), 3);
      if (k === PIECES.length - 1) { arrow(c, [X, top + 8], [X, top - 46], rgba(PAL.glass, 0.8), 4, {head: 20}); }
    });
    // ticks on segment A (every 10 °C, major every 50 °C)
    for (let cc = -270; cc <= HK.cTop; cc += 10) {
      const y = sy(yOfC(cc)); if (y < -10 || y > 1930) continue; const big = cc % 50 === 0, L = big ? 20 : 10;
      line(c, [[X - 36, y], [X - 36 - L, y]], rgba(PAL.glass, big ? 0.75 : 0.4), big ? 2.5 : 1.5); line(c, [[X + 36, y], [X + 36 + L, y]], rgba(PAL.glass, big ? 0.75 : 0.4), big ? 2.5 : 1.5);
    }
    for (const h of HOT) { const y = sy(h.y); line(c, [[X - 36, y], [X - 58, y]], rgba(PAL.glass, 0.8), 2.5); line(c, [[X + 36, y], [X + 58, y]], rgba(PAL.glass, 0.8), 2.5); }
    // liquid column from the floor to the bead (like a thermometer), coloured by temperature
    const bY = sy(by);
    if (bY < FL - 2) {
      const g = c.createLinearGradient(0, FL, 0, bY); g.addColorStop(0, rgba(PAL.ice, 0.85)); g.addColorStop(1, rgba(bcol, 0.95));
      PIECES.forEach(([ya, yb]) => { const y0 = Math.max(sy(yb), bY), y1 = sy(ya) - 4; if (y1 > y0) rect(c, X - 13, y0, 26, y1 - y0, 13, g); });
    }
    glow(c, X, bY, 70 + 40 * clamp(Math.log10(Math.max(TK, 1)) / 8), bcol, 0.55);
    sphere(c, X, bY, 20, bcol, {light: '#FFFFFF', shade: mix(bcol, '#03101C', 0.6)});
    // labels
    if (la > 0) withAlpha(c, la, () => {
      for (const cc of [-200, -100, 0, 100, 200]) { const y = sy(yOfC(cc)); if (y < 330 || y > 1330) continue;
        stage.text(`${fmtNum(cc)} °C`, X - 70, y, {size: 26, weight: 500, color: T.muted, align: 'right'}); }
      const wl = [[100, '물이 끓는 온도'], [0, '물이 어는 온도']];
      for (const [cc, s] of wl) { const y = sy(yOfC(cc)); if (y < 330 || y > 1330) continue; stage.text(s, X + 70, y, {size: 26, weight: 500, color: T.muted}); }
    });
    HOT.forEach((h, k) => { const q = o.hot?.[k] ?? 0, y = sy(h.y); if (q <= 0 || y < 330 || y > 1340) return;
      withAlpha(c, q, () => { stage.text(h.v, X - 70, y, {role: 'display', size: 32, weight: 700, color: mix(tempCol(h.c + T0), '#FFFFFF', 0.25), align: 'right'});
        stage.text(h.n, X + 70, y, {size: 28, weight: 700, color: T.ink}); }); });
    if ((o.arrowLab ?? 0) > 0) { const y = sy(-1000) - 8; if (y > 330) stage.text('수억 도 넘게', X + 54, y, {size: 28, weight: 700, color: PAL.warm, alpha: o.arrowLab}); }
    const fq = o.floorLab ?? 0;
    if (fq > 0 && FL < 1345) withAlpha(c, fq, () => {
      stage.text(`${MINUS}273.15 °C`, X - 70, FL - 64, {role: 'display', size: 30 + 8 * (o.floorBig ?? 0), weight: 700, color: PAL.ice, align: 'right', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
      stage.text('절대영도 · 바닥', X + 70, FL - 64, {role: 'display', size: 30, weight: 700, color: PAL.ice, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
    });
  });
}
function posterPicture(stage, t, a = 1) {
  withAlpha(stage.ctx, a, () => {
    axisWorld(stage, t, {});
    stage.ctx.drawImage(frostLayer(), 0, 0);
  });
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  const cam = P.cam(t), by = P.beadY(t), m = smooth((t - MORPH[0]) / (MORPH[1] - MORPH[0]));
  withAlpha(c, ef, () => {
    axisWorld(stage, t, {cam, beadY: by, labels: fadeIn(t, MORPH[1] + 0.2, 0.5), hot: P.hotPass.map(x => fadeIn(t, x - 0.05, 0.3)), arrowLab: fadeIn(t, P.arrowLab, 0.3),
      floorLab: fadeIn(t, P.floorLab, 0.4), floorBig: fadeIn(t, P.minus, 0.4) * fadeOut(t, ctx.scene.end - 1.0, 0.6), floorPulse: Math.max(fadeIn(t, P.floorLab, 0.4) * 0.4, 0.4 * Math.exp(-Math.max(0, t - P.floorGlow) * 1.2) * (t > P.floorGlow ? 1.5 : 0))});
    c.drawImage(frostLayer(), 0, 0);
    if (m > 0) { const g = c.createLinearGradient(0, 0, 0, 380); g.addColorStop(0, `rgba(4,10,24,${0.9 * m})`); g.addColorStop(0.75, `rgba(4,10,24,${0.75 * m})`); g.addColorStop(1, 'rgba(4,10,24,0)'); c.fillStyle = g; c.fillRect(0, 0, 1080, 380); }
    captionShade(c, fadeIn(t, 0.95, 0.4));
  });
}
// ------------------------------------------------------------------ origin: 絶對 = 絶(끊을 절) + 對(마주할 대); comparison cut → one floor
const OR = {xl: 380, xr: 700, top: 840, floor: 1250, k: 1.0};
function thermo(stage, x, TK, a, o = {}) {
  const c = stage.ctx, y1 = OR.floor - TK * OR.k, col = o.col || tempCol(TK);
  withAlpha(c, a, () => {
    rect(c, x - 22, OR.top, 44, OR.floor - OR.top + 22, 22, rgba('#0A1A30', 0.8), rgba(PAL.glass, 0.6), 2.5);
    if ((o.fill ?? 1) > 0) { const yy = lerp(OR.floor, y1, o.fill ?? 1); rect(c, x - 10, yy, 20, OR.floor + 8 - yy, 10, rgba(col, 0.9)); glow(c, x, yy, 34, col, 0.4); }
    line(c, [[x - 14, OR.top + 26], [x - 14, OR.floor - 10]], rgba('#FFFFFF', 0.1), 4);
  });
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const a0 = fadeIn(t, P.hanja, 0.4), hiJ = fadeIn(t, P.cut - 0.1, 0.3) * fadeOut(t, P.cards + 0.6, 0.4), hiD = fadeIn(t, P.oppo, 0.3) * fadeOut(t, P.cut - 0.1, 0.3);
    if (hiJ > 0) glow(c, 452, 450, 130, PAL.ice, 0.22 * hiJ);
    if (hiD > 0) glow(c, 628, 450, 130, PAL.warm, 0.2 * hiD);
    stage.text('絶', 452, 450, {size: 140, weight: 700, color: mix(T.ink, PAL.ice, hiJ), align: 'center', alpha: a0, shadow: 'rgba(0,0,0,0.6)', shadowBlur: 16});
    stage.text('對', 628, 450, {size: 140, weight: 700, color: mix(T.ink, PAL.warm, hiD), align: 'center', alpha: a0, shadow: 'rgba(0,0,0,0.6)', shadowBlur: 16});
    stage.text('절대', 540, 562, {role: 'display', size: 34, weight: 700, color: T.muted, align: 'center', alpha: a0});
    const ah = fadeIn(t, P.cards, 0.4);
    if (ah > 0) withAlpha(c, ah, () => {
      panel(c, T, 160, 610, 360, 84, 0.86); panel(c, T, 560, 610, 360, 84, 0.86);
      stage.text('絶', 215, 652, {size: 46, weight: 700, color: PAL.ice, align: 'center'}); stage.text('끊을 절', 380, 652, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('對', 615, 652, {size: 46, weight: 700, color: PAL.warm, align: 'center'}); stage.text('마주할 대', 780, 652, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('+', 540, 652, {role: 'display', size: 40, weight: 700, color: T.muted, align: 'center'});
      stage.text('absolute ← 라틴어 absolutus (풀려난)', 540, 730, {size: 26, weight: 500, color: T.muted, align: 'center'});
    });
    // two thermometers facing each other: compared with each other, then measured from one floor
    const ap = fadeIn(t, P.oppo, 0.4); if (ap <= 0) return;
    const fq = fadeIn(t, P.bars, 1.0);
    withAlpha(c, ap, () => {
      stage.text('찬 물', OR.xl, 800, {role: 'display', size: 30, weight: 700, color: PAL.ice, align: 'center'});
      stage.text('뜨거운 물', OR.xr, 800, {role: 'display', size: 30, weight: 700, color: PAL.warm, align: 'center'});
      const shimmer = 3 * Math.sin(2.1 * t);
      // before the floor: the columns float (no common zero), only their difference is drawn
      const lift = 1 - fq;
      withAlpha(c, 1, () => {
        thermo(stage, OR.xl, 278 + shimmer * lift, 1, {fill: fq, col: PAL.ice});
        thermo(stage, OR.xr, 363 - shimmer * lift, 1, {fill: fq, col: PAL.warm});
      });
      if (lift > 0.02) withAlpha(c, lift, () => {                      // relative levels only: two short marks
        for (const [x, TK, cl] of [[OR.xl, 278, PAL.ice], [OR.xr, 363, PAL.warm]]) { const y = OR.floor - TK * OR.k; rect(c, x - 10, y - 16, 20, 32, 8, rgba(cl, 0.9)); }
      });
      // comparison arrow (對), cut (絶)
      const cutq = smooth((t - P.cut) / 0.5), ya = 915, gap = 70 * cutq;
      const arrA = (1 - smooth((t - P.cut - 0.6) / 0.6));
      if (arrA > 0) withAlpha(c, arrA, () => {
        arrow(c, [540 - gap / 2, ya], [OR.xl + 40, ya], rgba(T.ink, 0.85), 4, {head: 18});
        arrow(c, [540 + gap / 2, ya], [OR.xr - 40, ya], rgba(T.ink, 0.85), 4, {head: 18});
        stage.text('견주기', 540, ya - 36, {size: 26, weight: 700, color: T.ink, align: 'center'});
        if (cutq > 0) { line(c, [[520, ya + 34], [560, ya - 34]], rgba(PAL.ice, cutq), 5); }
      });
      // the floor
      const fl = fadeIn(t, P.floor3, 0.5);
      if (fl > 0) withAlpha(c, fl, () => {
        glow(c, 540, OR.floor, 420, PAL.ice, 0.14);
        line(c, [[180, OR.floor], [900, OR.floor]], PAL.ice, 4);
        tag(stage, '정해진 바닥', 540, OR.floor + 40, {size: 30, color: PAL.ice, role: 'display', plateA: 0.6, a: fadeIn(t, P.fixed, 0.4)});
      });
      if (fq > 0.05) withAlpha(c, fq, () => {
        for (const [x, TK] of [[OR.xl, 278], [OR.xr, 363]]) { const y = OR.floor - TK * OR.k * fq;
          line(c, [[x + 46, OR.floor], [x + 46, y]], rgba(PAL.ice, 0.8), 3); line(c, [[x + 38, y], [x + 54, y]], rgba(PAL.ice, 0.8), 3); }
        stage.text('바닥에서 잰 높이', 540, 1110, {size: 26, weight: 700, color: PAL.ice, align: 'center'});
      });
    });
  });
}

// ------------------------------------------------------------------ gas: Amontons's air thermometer → P–T points → dashed extension to P = 0
const GG = {x0: 200, x1: 900, y0: 1265, y1: 880, cMin: -300, cMax: 120, pMax: 1.5};
const gx = cc => GG.x0 + (cc - GG.cMin) / (GG.cMax - GG.cMin) * (GG.x1 - GG.x0), gy = p => GG.y0 - p / GG.pMax * (GG.y0 - GG.y1);
const MANO = {x: 606, y0: 790, k: 160};
function flashes(c, hits, t, toXY, o = {}) {
  const win = o.win ?? 0.35; let i = lowerBound(hits, t - win);
  for (; i < hits.length && hits[i].t <= t; i++) {
    const h = hits[i], age = t - h.t, q = 1 - age / win, [x, y, vert] = toXY(h), sz = clamp(h.s / 300, 0.15, 1.3) * (o.k ?? 1);
    if (o.only && !o.only(h)) continue;
    const col = o.col?.(h) ?? PAL.iceHi;
    glow(c, x, y, 26 * sz + 6, col, 0.5 * q * Math.min(1, sz + 0.2));
    if (vert) line(c, [[x, y - 12 * sz - 3], [x, y + 12 * sz + 3]], rgba(col, 0.9 * q), 3 * sz + 1.5); else line(c, [[x - 12 * sz - 3, y], [x + 12 * sz + 3, y]], rgba(col, 0.9 * q), 3 * sz + 1.5);
  }
}
function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; } return lo; }
function gasScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), cc = P.bathC(t), TK = cc + T0, pa = pAtm(TK);
  withAlpha(c, sf, () => {
    const ap = fadeIn(t, P.app, 0.5), dim = lerp(1, 0.55, fadeIn(t, P.fit, 0.6));
    withAlpha(c, ap * dim, () => {
      // bath
      const [fx, fy, fw, fh] = GS.flask, liq = mix('#4A8FB8', '#C8703C', clamp((cc + 20) / 120));
      rect(c, 160, 470, 360, 330, 18, rgba('#0A1A30', 0.6), rgba(PAL.glass, 0.55), 2.5);
      rect(c, 163, 512, 354, 285, 16, rgba(liq, 0.38));
      line(c, [[164, 512], [516, 512]], rgba(mix(liq, '#FFFFFF', 0.4), 0.7), 2);
      if (cc > 85) { const R = rng(3); for (let k = 0; k < 12; k++) { const x = 180 + R() * 320, ph = R(), yy = 790 - ((t * 0.9 + ph) % 1) * 270; if (yy > 520) ring(c, x, yy, 3 + 3 * R(), rgba('#FFFFFF', 0.35 * clamp((cc - 85) / 15)), 1.5); } }
      if (cc < 2) { const R = rng(8); for (let k = 0; k < 7; k++) { const x = 185 + R() * 300, y = 520 + 6 * Math.sin(t + k); rect(c, x, y - 6, 20 + 10 * R(), 12, 3, rgba('#DDF6FF', 0.5 * clamp((2 - cc) / 10))); } }
      stage.text('물통', 180, 448, {size: 24, weight: 700, color: T.muted});
      // flask with the gas
      rect(c, fx, fy, fw, fh, 14, rgba('#06142A', 0.82), rgba(PAL.glass, 0.75), 3);
      clipRect(c, fx, fy, fw, fh, 14, () => {
        flashes(c, P.gasHits, t, h => (h.wall === 'L' ? [fx + 2, fy + h.along, true] : h.wall === 'R' ? [fx + fw - 2, fy + h.along, true] : h.wall === 'T' ? [fx + h.along, fy + 2, false] : [fx + h.along, fy + fh - 2, false]), {k: 0.8});
        GAS_SAMPLE.forEach(pp => { const [x, y] = P.gas.pos(pp, t); particle(c, fx + x, fy + y, GS.r, TK, 1, pp.hue); });
      });
      stage.text('공기', fx + fw / 2, fy + fh + 22, {size: 24, weight: 700, color: T.muted, align: 'center'});
      // tube to the manometer
      line(c, [[fx + fw / 2, fy], [fx + fw / 2, 430], [MANO.x, 430], [MANO.x, 470]], rgba(PAL.glass, 0.7), 6);
      line(c, [[fx + fw / 2, fy], [fx + fw / 2, 430], [MANO.x, 430], [MANO.x, 470]], rgba('#06142A', 1), 2.5);
      rect(c, MANO.x - 15, 470, 30, 330, 15, rgba('#06142A', 0.85), rgba(PAL.glass, 0.7), 2.5);
      const ym = MANO.y0 - pa * MANO.k;
      const mg = c.createLinearGradient(MANO.x - 8, 0, MANO.x + 8, 0); mg.addColorStop(0, '#8E9AA6'); mg.addColorStop(0.4, '#E8EEF4'); mg.addColorStop(1, '#6E7A86');
      rect(c, MANO.x - 8, ym, 16, MANO.y0 + 6 - ym, 8, mg);
      for (let k = 0; k <= 7; k++) { const y = MANO.y0 - k * 0.2 * MANO.k; line(c, [[MANO.x + 16, y], [MANO.x + (k % 5 === 0 ? 30 : 24), y]], rgba(PAL.glass, 0.6), 1.5); }
      stage.text('수은 기둥', MANO.x, 820, {size: 24, weight: 700, color: T.muted, align: 'center'});
      // readouts
      panel(c, T, 680, 445, 250, 110, 0.88); panel(c, T, 680, 570, 250, 110, 0.88);
      stage.text('물통 온도', 805, 475, {size: 24, weight: 700, color: T.muted, align: 'center'});
      stage.text(`${fmtNum(Math.round(cc))} °C`, 805, 520, {role: 'display', size: 40, weight: 700, color: mix(tempCol(TK), '#FFFFFF', 0.2), align: 'center'});
      stage.text('공기 압력', 805, 600, {size: 24, weight: 700, color: T.muted, align: 'center'});
      stage.text(`${pa.toFixed(2)} atm`, 805, 645, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
      stage.text('이상기체 모형', 805, 712, {size: 24, weight: 500, color: T.muted, align: 'center'});
    });
    // the graph
    const ga = fadeIn(t, P.cool[0] - 0.4, 0.5);
    if (ga <= 0) return;
    withAlpha(c, ga, () => {
      line(c, [[GG.x0, GG.y1 - 10], [GG.x0, GG.y0], [GG.x1 + 10, GG.y0]], rgba(T.muted, 0.8), 2.5);
      for (const p of [0.5, 1.0, 1.5]) { const y = gy(p); line(c, [[GG.x0 - 6, y], [GG.x0, y]], rgba(T.muted, 0.8), 2); line(c, [[GG.x0, y], [GG.x1, y]], rgba(T.border, 0.5), 1); stage.text(p.toFixed(1), GG.x0 - 12, y, {size: 24, weight: 500, color: T.muted, align: 'right'}); }
      for (const x of [-200, -100, 0, 100]) { const X = gx(x); line(c, [[X, GG.y0], [X, GG.y0 + 7]], rgba(T.muted, 0.8), 2); stage.text(`${fmtNum(x)}`, X, GG.y0 + 27, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
      stage.text('압력 (atm)', GG.x0 + 12, GG.y1 - 18, {size: 24, weight: 700, color: T.muted});
      stage.text('온도 (°C)', GG.x1, GG.y0 - 22, {size: 24, weight: 700, color: T.muted, align: 'right'});
      // equal steps between consecutive points
      const ev = fadeIn(t, P.even, 0.4) * fadeOut(t, P.fit + 0.4, 0.4);
      // fitted line and dashed extension
      const fit = fadeIn(t, P.fit, 0.4);
      if (fit > 0) line(c, [[gx(-20), gy(pAtm(-20 + T0))], [gx(100), gy(pAtm(100 + T0))]], rgba(PAL.ice, 0.9 * fit), 4);
      const eq = clamp((t - P.ext[0]) / (P.ext[1] - P.ext[0]));
      if (eq > 0) { const c1 = lerp(-20, -273.15, easeInOut(eq)); line(c, [[gx(-20), gy(pAtm(-20 + T0))], [gx(c1), gy(pAtm(c1 + T0))]], rgba(PAL.ice, 0.9), 4, {dash: [14, 10]}); }
      P.ptC.forEach((x, k) => {
        const q = fadeIn(t, P.ptT[k], 0.2); if (q <= 0) return; const X = gx(x), Y = gy(pAtm(x + T0));
        if (ev > 0 && k > 0) withAlpha(c, ev, () => { const Xp = gx(P.ptC[k - 1]), Yp = gy(pAtm(P.ptC[k - 1] + T0)); line(c, [[Xp, Yp], [Xp, Y], [X, Y]], rgba(PAL.warm, 0.85), 2.5); });
        const pulse = Math.exp(-Math.max(0, t - P.ptT[k]) * 4);
        glow(c, X, Y, 26 + 20 * pulse, PAL.iceHi, 0.35 * q);
        circle(c, X, Y, 8 * q, mix(tempCol(x + T0), '#FFFFFF', 0.3)); ring(c, X, Y, 8 * q, rgba('#03101C', 0.9), 2);
      });
      if (ev > 0) tag(stage, '20 °C 내릴 때마다 같은 만큼 ↓', 220, 915, {size: 26, color: PAL.warm, align: 'left', a: ev, plateA: 0.7});
      // live dot while cooling
      if (t > P.cool[0] - 0.2 && t < P.fit + 0.3) { const X = gx(cc), Y = gy(pa); ring(c, X, Y, 14, rgba(PAL.iceHi, 0.8 * fadeOut(t, P.fit, 0.3)), 2.5); }
      const lq = fadeIn(t, P.liq, 0.4);
      if (lq > 0) { tag(stage, '점선: 직선을 늘인 것 (외삽)', 220, 912, {size: 24, color: PAL.ice, align: 'left', a: lq, plateA: 0.75}); tag(stage, '실제 공기는 그 전에 액체가 됨', 220, 952, {size: 24, color: T.muted, align: 'left', a: lq, plateA: 0.75}); }
      const xq = fadeIn(t, P.cross, 0.35);
      if (xq > 0) withAlpha(c, xq, () => {
        const X = gx(-273.15); glow(c, X, GG.y0, 60, PAL.ice, 0.5 * (0.6 + 0.4 * Math.sin(5 * t)));
        ring(c, X, GG.y0, 15, PAL.ice, 4); line(c, [[X, GG.y0 - 70], [X, GG.y0 - 20]], rgba(PAL.ice, 0.8), 2.5);
        stage.text('압력 0', X + 12, GG.y0 - 84, {size: 26, weight: 700, color: PAL.ice});
        const vq = fadeIn(t, P.val5, 0.3);
        stage.text(vq > 0.5 ? `${MINUS}273.15 °C` : '?', Math.max(X, 150 + stage.measure(`${MINUS}273.15 °C`, {role: 'display', size: 34, weight: 700}) / 2), GG.y0 + 52, {role: 'display', size: 34, weight: 700, color: PAL.ice, align: 'center', alpha: vq > 0.5 ? vq : 1});
      });
    });
  });
}

// ------------------------------------------------------------------ motion: 3-tier instrument (box · knob · gauges), Kelvin ruler
const yTK = TK => MO.floor - TK / MO.kTop * (MO.floor - MO.top);
const BOX_ARROWS = [0, 7, 13, 21, 28];
function motionScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), TK = P.moT(t);
  const [bx, by, bw, bh] = MO.box, kq = fadeIn(t, P.kelvin, 0.6), fl = fadeIn(t, P.floor8, 0.5);
  withAlpha(c, sf, () => {
    // floor
    if (fl > 0) withAlpha(c, fl, () => {
      glow(c, 560, MO.floor, 460, PAL.ice, 0.12 + 0.1 * Math.exp(-Math.max(0, t - P.floor8) * 1.5));
      line(c, [[285, MO.floor], [930, MO.floor]], PAL.ice, 4);
      stage.text('바닥 = 절대영도', 680, MO.floor + 42, {role: 'display', size: 30, weight: 700, color: PAL.ice, align: 'center', alpha: fadeIn(t, P.az8, 0.4)});
    });
    // thermometer axis (°C left; K right from s09)
    const X = MO.ax;
    rect(c, X - 16, MO.top - 10, 32, MO.floor - MO.top + 20, 16, rgba('#0A1A30', 0.8), rgba(PAL.glass, 0.6), 2.5);
    const yk = yTK(TK), col = tempCol(TK);
    const g = c.createLinearGradient(0, MO.floor, 0, yk); g.addColorStop(0, rgba(PAL.ice, 0.9)); g.addColorStop(1, rgba(col, 0.95));
    if (MO.floor - yk > 2) rect(c, X - 7, yk, 14, MO.floor + 4 - yk, 7, g);
    stage.text('온도', X, MO.top - 34, {size: 24, weight: 700, color: T.muted, align: 'center'});
    for (const cc of [100, 0, -100, -200]) { const y = yTK(cc + T0); line(c, [[X - 18, y], [X - 30, y]], rgba(PAL.glass, 0.8), 2); stage.text(`${fmtNum(cc)} °C`, X - 38, y, {size: 24, weight: 500, color: T.muted, align: 'right'}); }
    for (let cc = -270; cc <= 120; cc += 10) { if (cc % 100 === 0) continue; const y = yTK(cc + T0); line(c, [[X - 18, y], [X - 24, y]], rgba(PAL.glass, 0.4), 1.2); }
    stage.text(`${MINUS}273.15 °C`, X - 38, MO.floor, {size: 24, weight: 700, color: fl > 0 ? PAL.ice : T.muted, align: 'right'});
    if (kq > 0) withAlpha(c, kq, () => {
      const dx = (1 - kq) * -40;
      line(c, [[X + 22 + dx, MO.top], [X + 22 + dx, MO.floor]], rgba(PAL.ice, 0.7), 2);
      for (const cc of [100, 0, -100, -200]) { const y = yTK(cc + T0); line(c, [[X + 22 + dx, y], [X + 34 + dx, y]], rgba(PAL.ice, 0.8), 2); stage.text(`${cc + 273} K`, X + 40 + dx, y, {size: 24, weight: 700, color: PAL.ice}); }
            stage.text('0 K', X + 40 + dx, MO.floor - 24, {role: 'display', size: 28, weight: 700, color: PAL.ice});
    });
    const zq = fadeIn(t, P.zeroK, 0.4);
    if (zq > 0) withAlpha(c, zq, () => { glow(c, X, MO.floor, 90, PAL.ice, 0.5); ring(c, X, MO.floor, 30, PAL.ice, 3); tag(stage, `0 K = ${MINUS}273.15 °C`, 300, 1300, {size: 30, color: PAL.ice, role: 'display', plateA: 0.75, border: PAL.ice}); });
    // knob
    glow(c, X, yk, 50, col, 0.5); circle(c, X, yk, 21, '#0B1A30'); ring(c, X, yk, 21, mix(col, '#FFFFFF', 0.3), 4); circle(c, X, yk, 9, col);
    const coolA = fadeIn(t, P.cool7, 0.3) * fadeOut(t, P.floor8 + 0.4, 0.4);
    if (coolA > 0) { const yy = yk + 34 + 6 * Math.sin(6 * t); arrow(c, [X, yy], [X, yy + 36], rgba(PAL.ice, coolA), 4, {head: 14}); }
    const upA = fadeIn(t, P.lively, 0.3) * fadeOut(t, P.lively + 1.2, 0.3);
    if (upA > 0) { const yy = yk - 34 - 6 * Math.sin(6 * t); arrow(c, [X, yy], [X, yy - 36], rgba(PAL.warm, upA), 4, {head: 14}); }
    // temperature readout
    panel(c, T, bx, 328, bw, 78, 0.88);
    stage.text('온도', bx + 24, 367, {size: 26, weight: 700, color: T.muted});
    const val = kq > 0.5 ? `${fmtC(TK)}  =  ${fmtK(TK)}` : fmtC(TK);
    stage.text(val, bx + bw / 2 + 30, 367, {role: 'display', size: 38, weight: 700, color: mix(col, '#FFFFFF', 0.25), align: 'center'});
    // the box
    rect(c, bx, by, bw, bh, 6, rgba('#06142A', 0.85), rgba(PAL.glass, 0.7), 3);
    line(c, [[bx + bw, by + 4], [bx + bw, by + bh - 4]], rgba(PAL.ice, 0.85), 5);
    clipRect(c, bx, by, bw, bh, 6, () => {
      flashes(c, P.moHits, t, h => (h.wall === 'L' ? [bx + 2, by + h.along, true] : h.wall === 'R' ? [bx + bw - 3, by + h.along, true] : h.wall === 'T' ? [bx + h.along, by + 2, false] : [bx + h.along, by + bh - 2, false]),
        {col: h => (h.wall === 'R' ? PAL.ice : '#B8D8EE'), k: 1});
      BOX_SAMPLE.forEach((pp, i) => {
        const [x, y] = P.box.pos(pp, t), [x0, y0] = P.box.pos(pp, t - 0.05);
        if (Math.hypot(x - x0, y - y0) < 40) line(c, [[bx + x0, by + y0], [bx + x, by + y]], rgba(mix(tempCol(TK), '#FFFFFF', 0.3), 0.25), MO.r * 1.2);
        particle(c, bx + x, by + y, MO.r, TK, 1, pp.hue);
      });
      const s = sigmaDisp(TK), aa = fadeIn(t, ctx.scene.start + 0.6, 0.5);
      for (const i of BOX_ARROWS) { const pp = BOX_SAMPLE[i], [x, y] = P.box.pos(pp, t), vx = pp.ux * s * 0.22, vy = pp.uy * s * 0.22, L = Math.hypot(vx, vy);
        if (L > 8) arrow(c, [bx + x, by + y], [bx + x + vx, by + y + vy], rgba('#FFFFFF', 0.8 * aa * clamp((L - 8) / 10)), 3, {head: 12}); }
    });
    tag(stage, '이상기체 모형', bx + 14, by + 26, {size: 24, color: T.muted, align: 'left', plateA: 0.55});
    // wall-hit rate on the right wall (analytic expectation of the same sample)
    const rate = BOX_SAMPLE.reduce((a, pp) => a + Math.abs(pp.ux), 0) * sigmaDisp(TK) / (2 * P.box.Lx);
    const hl = fadeIn(t, P.wall, 0.3);
    stage.text(`오른쪽 벽을 두드리는 횟수 · 초당 ${rate.toFixed(1)}번`, bx + bw / 2, by + bh + 22, {size: 24, weight: 700, color: mix(T.muted, PAL.ice, hl), align: 'center'});
    // gauges
    const gy0 = 915, gh = 250;
    panel(c, T, bx, gy0, 230, gh, 0.88); panel(c, T, bx + 250, gy0, 230, gh, 0.88);
    const vm = vMean(TK);
    stage.text('평균 속력', bx + 115, gy0 + 32, {size: 24, weight: 700, color: T.muted, align: 'center'});
    rect(c, bx + 25, gy0 + 80, 180, 24, 12, rgba(T.border, 0.9)); rect(c, bx + 25, gy0 + 80, Math.max(24, 180 * vm / 600), 24, 12, mix(col, '#FFFFFF', 0.2));
    stage.text(`${Math.round(vm)} m/s`, bx + 115, gy0 + 150, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'});
    stage.text('공기 분자', bx + 115, gy0 + 200, {size: 24, weight: 500, color: T.muted, align: 'center'});
    const pa = pAtm(TK), dx = bx + 365, dy = gy0 + 150, rr = 72, ph = fadeIn(t, P.press7, 0.3) * fadeOut(t, P.move8, 0.5);
    stage.text('압력', dx, gy0 + 32, {size: 24, weight: 700, color: ph > 0 ? mix(T.muted, PAL.ice, ph) : T.muted, align: 'center'});
    ring(c, dx, dy, rr, rgba(T.border, 1), 10, Math.PI, TAU);
    ring(c, dx, dy, rr, rgba(PAL.ice, 0.9), 10, Math.PI, Math.PI + Math.PI * clamp(pa / 1.5));
    for (let k = 0; k <= 3; k++) { const an = Math.PI + Math.PI * k / 3; line(c, [[dx + Math.cos(an) * (rr - 18), dy + Math.sin(an) * (rr - 18)], [dx + Math.cos(an) * (rr - 8), dy + Math.sin(an) * (rr - 8)]], rgba(T.muted, 0.8), 2); }
    const an = Math.PI + Math.PI * clamp(pa / 1.5); line(c, [[dx, dy], [dx + Math.cos(an) * (rr - 14), dy + Math.sin(an) * (rr - 14)]], T.ink, 4); circle(c, dx, dy, 7, T.ink);
    stage.text(`${pa.toFixed(pa < 0.1 ? 3 : 2)} atm`, dx, dy + 52, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
    if (ph > 0) glow(c, bx + bw, by + bh / 2, 120, PAL.ice, 0.18 * ph);
    line(c, [[bx + bw - 30, by + bh], [bx + bw - 30, gy0]], rgba(PAL.ice, 0.5), 3, {dash: [6, 6]});
  });
}

// ------------------------------------------------------------------ ladder: zoom into the floor, then halving steps (설명 모형)
const LD = {x0: 250, x1: 680, top: 500, floor: 1180, dx: 20};
function niceTicks(max) { const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p, st = (m < 1.5 ? 1 : m < 3.5 ? 2 : 5) * p, out = []; for (let v = st; v <= max * 1.0001; v += st) out.push(v); return out; }
function ladderScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), Tm = P.ladderMax(t), nE = P.nEff(t);
  const yv = v => Math.max(LD.top - 120, LD.floor - v / Tm * (LD.floor - LD.top)), xs = k => LD.x0 + 18 + k * LD.dx;
  withAlpha(c, sf, () => {
    // readouts
    const n = Math.floor(nE + 1e-6), cur = 2 ** -nE;
    panel(c, T, 150, 330, 200, 100, 0.88); panel(c, T, 365, 330, 315, 100, 0.88);
    stage.text('걸음', 250, 358, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text(`${n}번`, 250, 400, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'});
    stage.text('남은 온도', 522, 358, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text(fmtK(cur), 522, 400, {role: 'display', size: 38, weight: 700, color: PAL.ice, align: 'center'});
    stage.text('설명 모형 · 한 걸음마다 남은 온도의 절반', 425, 456, {size: 24, weight: 500, color: T.muted, align: 'center'});
    // axis and ticks (linear, zooming)
    line(c, [[LD.x0, LD.top - 10], [LD.x0, LD.floor]], rgba(T.muted, 0.8), 2.5);
    for (const v of niceTicks(Tm)) { const y = yv(v); if (y < LD.top - 5) continue; line(c, [[LD.x0 - 7, y], [LD.x0, y]], rgba(T.muted, 0.8), 2); line(c, [[LD.x0, y], [LD.x1, y]], rgba(T.border, 0.45), 1);
      stage.text(fmtK(v, 2), LD.x0 - 12, y, {size: 24, weight: 500, color: T.muted, align: 'right'}); }
    glow(c, 475, LD.floor, 300, PAL.ice, 0.16);
    line(c, [[LD.x0, LD.floor], [LD.x1, LD.floor]], PAL.ice, 4);
    stage.text('0 K · 절대영도', 475, LD.floor + 38, {role: 'display', size: 28, weight: 700, color: PAL.ice, align: 'center'});
    const zm = 1.25 / Tm;
    if (t > P.zoomStart) tag(stage, `확대 ×${group(Math.round(zm).toString())}`, LD.x0 + 14, LD.top + 6, {size: 26, color: PAL.ice, align: 'left', a: fadeIn(t, P.zoomStart, 0.3), plateA: 0.8});
    else if (t < P.zoom1[1] + 0.3) tag(stage, `확대 ×${group(Math.round(Math.max(1, 300 / Tm)).toString())}`, LD.x0 + 14, LD.top + 6, {size: 26, color: PAL.ice, align: 'left', a: fadeIn(t, P.zoom1[0], 0.3) * fadeOut(t, P.zoom1[1] + 0.2, 0.3), plateA: 0.8});
    // the staircase
    clipRect(c, LD.x0 + 2, LD.top - 20, LD.x1 - LD.x0 + 10, LD.floor - LD.top + 18, 0, () => {
      const pts = [[xs(0), yv(1)]];
      for (let k = 1; k <= LADDER_N; k++) {
        const q = clamp(nE - (k - 1)); if (q <= 0) { pts.push([lerp(xs(k - 1), xs(k), clamp((t - (P.stepT[k - 2] ?? P.zoom1[1])) / Math.max(0.1, (P.stepT[k - 1] - (P.stepT[k - 2] ?? P.zoom1[1])) * 0.95))), yv(2 ** -(k - 1))]); break; }
        pts.push([xs(k), yv(2 ** -(k - 1))]); pts.push([xs(k), yv(2 ** -(k - 1 + easeOut(q)))]);
        if (q < 1) break;
        if (k === LADDER_N) pts.push([xs(k) + 10, yv(2 ** -k)]);
      }
      const g = c.createLinearGradient(0, LD.top, 0, LD.floor); g.addColorStop(0, rgba(PAL.iceHi, 0.95)); g.addColorStop(1, rgba(PAL.ice, 0.95));
      line(c, pts, g, 4.5);
      const [ex, ey] = pts.at(-1); glow(c, ex, ey, 34, PAL.ice, 0.6); circle(c, ex, ey, 8, PAL.iceHi);
      // the first drops: half taken away
      for (let k = 1; k <= 3; k++) { const q = fadeIn(t, P.stepT[k - 1] + 0.15, 0.3) * fadeOut(t, P.stepT[k - 1] + (k === 1 ? 2.4 : 1.1), 0.3); if (q <= 0) continue;
        const y0 = yv(2 ** -(k - 1)), y1 = yv(2 ** -k); line(c, [[xs(k) + 12, y0], [xs(k) + 20, y0], [xs(k) + 20, y1], [xs(k) + 12, y1]], rgba(PAL.warm, q), 2.5);
        stage.text(k === 1 ? '덜어 낸 열: 절반' : '절반', xs(k) + 30, (y0 + y1) / 2, {size: 26, weight: 700, color: PAL.warm, alpha: q}); }
    });
    const nv = fadeIn(t, P.never, 0.4);
    if (nv > 0) tag(stage, '0에는 닿지 않음', 475, LD.floor - 60, {size: 30, color: PAL.iceHi, role: 'display', a: nv, plateA: 0.85, border: PAL.ice});
    const nr = fadeIn(t, P.zoom1[1] - 0.3, 0.4) * fadeOut(t, P.stepT[0] - 0.2, 0.3);
    if (nr > 0) tag(stage, '바닥에 닿은 듯해도 아직 1 K', 475, LD.floor - 60, {size: 28, color: PAL.ice, a: nr, plateA: 0.85});
  });
}

// ------------------------------------------------------------------ the shared log temperature ruler (ladder → space → lab)
const LR = {x: 820, y0: 440, y1: 1250};
function rulerView(t, tl) {
  const P = plan(tl), sp = tl.scene('space').start, lb = tl.scene('lab').start;
  const V0 = [0.6, -6.6], V1 = [2.7, -0.6], V2 = [2.7, -11.6];
  const q1 = smooth((t - sp) / 1.2), q2 = smooth((t - lb) / 1.5);
  const v = t < lb ? [lerp(V0[0], V1[0], q1), lerp(V0[1], V1[1], q1)] : [lerp(V1[0], V2[0], q2), lerp(V1[1], V2[1], q2)];
  return v;
}
export function rulerMarkers(t, tl) {
  const P = plan(tl), sp = tl.scene('space'), lb = tl.scene('lab'), ld = tl.scene('ladder'), out = [];
  if (t >= ld.start && t < sp.start + 0.6) out.push({T: 2 ** -P.nEff(t), name: '남은 온도', live: true, a: fadeOut(t, sp.start + 0.1, 0.4)});
  if (t >= P.probe0 - 0.3) { const TK = P.probeTK(t), done = t > P.k27; out.push({T: done ? T_CMB : TK, name: done ? '우주 배경' : '빈 공간의 물체', val: done ? '2.7 K' : null, live: !done, a: fadeIn(t, P.probe0 - 0.3, 0.3), keep: done}); }
  if (t >= P.parcel[0] - 0.2) { const done = t > P.k1; out.push({T: done ? 1 : nebT(P.parcelR(t)), name: done ? '부메랑 성운' : '성운 가스', val: done ? '1 K' : null, live: !done, a: fadeIn(t, P.parcel[0] - 0.2, 0.3), keep: done}); }
  if (t >= P.laserOn - 0.2) { const TK = P.cloudTK(t), done = TK < 1.2e-4 || t > P.towerIn; out.push({T: done ? 1e-4 : TK, name: done ? '레이저 냉각' : '원자 구름', val: done ? '0.1 mK' : null, live: !done, a: fadeIn(t, P.laserOn - 0.2, 0.3), keep: done}); }
  if (t >= P.above - 0.2) { const done = t > P.p38 + 0.2; out.push({T: done ? T_REC : P.recTK(t), name: '2021 낙하탑', val: done ? '38 pK' : null, live: !done, a: fadeIn(t, P.above - 0.2, 0.3), keep: done, big: done}); }
  return out;
}
function logRuler(stage, t, ctx) {
  const tl = ctx.tl, P = plan(tl), ld = tl.scene('ladder'), a = fadeIn(t, ld.start + 0.2, 0.5) * fadeOut(t, P.s16, 0.5);
  if (a <= 0) return;
  const c = stage.ctx, T = stage.theme, [hi, lo] = rulerView(t, tl), Y = L => LR.y0 + (hi - L) / (hi - lo) * (LR.y1 - LR.y0), ppd = (LR.y1 - LR.y0) / (hi - lo);
  withAlpha(c, a, () => {
    stage.text('온도 (로그 눈금)', LR.x - 4, LR.y0 - 40, {size: 24, weight: 700, color: T.muted, align: 'center'});
    const g = c.createLinearGradient(0, LR.y0, 0, LR.y1); g.addColorStop(0, rgba(PAL.warm, 0.8)); g.addColorStop(0.35, rgba(T.ink, 0.7)); g.addColorStop(1, rgba(PAL.ice, 0.9));
    line(c, [[LR.x, LR.y0], [LR.x, LR.y1]], g, 3);
    arrow(c, [LR.x, LR.y1 - 4], [LR.x, LR.y1 + 30], rgba(PAL.ice, 0.8), 3, {head: 12});
    stage.text(`0 K: 끝없이 아래`, 940, LR.y1 + 58, {size: 24, weight: 700, color: PAL.ice, align: 'right'});
    const M = rulerMarkers(t, tl), occupied = M.filter(m => m.a > 0.3).map(m => Y(Math.log10(m.T)));
    const every = ppd >= 90 ? 1 : 3;
    for (let L = Math.ceil(lo); L <= Math.floor(hi); L++) {
      const y = Y(L); line(c, [[LR.x - 8, y], [LR.x + 8, y]], rgba(T.muted, 0.8), 2);
      if (ppd >= 160) for (let m = 2; m <= 9; m++) { const yy = Y(L + Math.log10(m)); if (yy > LR.y0 && yy < LR.y1) line(c, [[LR.x - 4, yy], [LR.x + 4, yy]], rgba(T.muted, 0.45), 1.2); }
      if (((L % every) + every) % every !== 0) continue;
      if (occupied.some(o => Math.abs(o - y) < 28)) continue;
      stage.text(fmtK(10 ** L), LR.x + 16, y, {size: 24, weight: 500, color: T.muted});
    }
    // markers (older names hide when a newer one is close)
    const ys = M.map(m => Y(Math.log10(m.T)));
    M.forEach((m, i) => {
      const y = ys[i]; if (y < LR.y0 - 10 || y > LR.y1 + 10 || m.a <= 0) return;
      const crowded = M.some((n, j) => j > i && n.a > 0.02 && Math.abs(ys[j] - y) < 30);
      withAlpha(c, m.a, () => {
        const col = m.live ? PAL.iceHi : PAL.ice;
        if (m.live) glow(c, LR.x, y, 30, col, 0.6);
        circle(c, LR.x, y, m.live ? 8 : 6, col); line(c, [[LR.x - 18, y], [LR.x - 8, y]], col, 2);
        if (!crowded) stage.text(m.name, LR.x - 24, y, {size: 24, weight: 700, color: m.live ? PAL.iceHi : T.ink, align: 'right'});
        if (!crowded || m.live) stage.text(m.val || fmtK(m.T, 2), LR.x + 16, y, {role: 'display', size: m.big ? 28 : 24, weight: 700, color: PAL.ice});
      });
    });
  });
}

// ------------------------------------------------------------------ space: background light keeps an object at 2.7 K; the Boomerang outflow cools below it
const SK = {x: 415, y: 760, r: 245};
let CMBL = null;
function cmbLayer() {
  if (CMBL) return CMBL; const S = 2 * SK.r, cv = createCanvas(S, S), c = cv.getContext('2d'), R = rng(1965);
  c.save(); c.beginPath(); c.arc(SK.r, SK.r, SK.r, 0, TAU); c.clip();
  c.fillStyle = '#120A18'; c.fillRect(0, 0, S, S);
  for (let k = 0; k < 520; k++) { const x = R() * S, y = R() * S, r = 10 + R() * 34, warm = R(); glow(c, x, y, r, warm < 0.5 ? '#C0503A' : warm < 0.8 ? '#D88A4A' : '#3A5AA8', 0.22 + 0.12 * R()); }
  for (let k = 0; k < 160; k++) circle(c, R() * S, R() * S, 0.6 + R() * 1.2, rgba('#FFFFFF', 0.25 + 0.5 * R()));
  const v = c.createRadialGradient(SK.r, SK.r, SK.r * 0.6, SK.r, SK.r, SK.r); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = v; c.fillRect(0, 0, S, S);
  c.restore(); CMBL = cv; return cv;
}
const PHOTONS = (() => { const R = rng(404), inn = []; let tt = 0; while (tt < 20) { tt += -Math.log(Math.max(1e-9, R())) / 14; inn.push({t: tt, th: R() * TAU}); } return inn; })();
const NEB = (() => { const R = rng(777); return [...Array(190)].map(() => { const lobe = R() < 0.72, s = R() < 0.5 ? -1 : 1; const th = lobe ? -Math.PI / 2 * s + (R() - 0.5) * 1.1 : R() * TAU; return {th, ph: R(), sp: 0.85 + 0.3 * R(), sz: 1.8 + 2.2 * R()}; }); })();
function spaceScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), nb = fadeIn(t, P.neb, 0.7), sk = fadeIn(t, P.sky, 0.6) * (1 - nb);
  withAlpha(c, sf, () => {
    // s12: the sky and the probe
    if (sk > 0) withAlpha(c, sk, () => {
      glow(c, SK.x, SK.y, SK.r * 1.3, '#C0603A', 0.10);
      withAlpha(c, 0.25 + 0.75 * fadeIn(t, at12(P), 0.6), () => c.drawImage(cmbLayer(), SK.x - SK.r, SK.y - SK.r));
      ring(c, SK.x, SK.y, SK.r, rgba('#E8B090', 0.35), 2);
      const la = fadeIn(t, at12(P), 0.4);
      stage.text('빅뱅이 남긴 빛 (우주 배경 복사)', SK.x, SK.y - SK.r - 30, {size: 26, weight: 700, color: '#F2B894', align: 'center', alpha: la});
      const tau0 = P.probe0, TK = P.probeTK(t);
      if (t > tau0 - 0.6) {
        // incoming background light: constant rate from all directions
        clipEllipse(c, SK.x, SK.y, SK.r, SK.r, () => {
          for (const ph of PHOTONS) { const age = t - (tau0 - 2 + ph.t); if (age < 0 || age > 0.6) continue; const u = age / 0.6, r = lerp(SK.r, 24, u), x = SK.x + Math.cos(ph.th) * r, y = SK.y + Math.sin(ph.th) * r;
            line(c, [[x, y], [x + Math.cos(ph.th) * 22, y + Math.sin(ph.th) * 22]], rgba('#FFB08A', 0.8 * Math.sin(u * Math.PI)), 3); }
          // outgoing light: rate ∝ T⁴ (capped for the picture)
          for (const e of P.outPh) { const age = t - e.t; if (age < 0 || age > 0.6) continue; const u = age / 0.6, r = lerp(24, SK.r, u), x = SK.x + Math.cos(e.th) * r, y = SK.y + Math.sin(e.th) * r;
            line(c, [[x, y], [x - Math.cos(e.th) * 22, y - Math.sin(e.th) * 22]], rgba(mix(tempCol(e.T), '#FFFFFF', 0.3), 0.85 * Math.sin(u * Math.PI)), 3); }
        });
        const col = tempCol(TK); glow(c, SK.x, SK.y, 40 + 30 * clamp(Math.log10(TK) / 2.5), col, 0.6);
        sphere(c, SK.x, SK.y, 20, mix(col, '#556677', 0.3), {light: '#FFFFFF', shade: '#05101C'});
        stage.text('물체', SK.x + 34, SK.y - 30, {size: 24, weight: 700, color: T.ink});
        // legend and readout
        panel(c, T, 165, 1048, 490, 150, 0.88);
        stage.text('빈 공간에 놓인 물체의 온도', 410, 1080, {size: 24, weight: 700, color: T.muted, align: 'center'});
        const fin = fadeIn(t, P.m270, 0.4);
        stage.text(fin > 0.5 ? `2.7 K  ≈  ${MINUS}270 °C` : fmtK(TK), 410, 1132, {role: 'display', size: 44, weight: 700, color: PAL.ice, align: 'center'});
        const bal = fadeIn(t, P.k27, 0.4);
        stage.text(bal > 0.5 ? '들어오는 빛 = 나가는 빛' : '나가는 빛 > 들어오는 빛 → 식음', 410, 1176, {size: 24, weight: 700, color: bal > 0.5 ? PAL.good : T.muted, align: 'center'});
        tag(stage, '설명 모형 · 시간 압축', SK.x, 1240, {size: 24, color: T.muted, plate: false, a: fadeOut(t, P.neb - 0.5, 0.3)});
      }
    });
    // s13: the Boomerang Nebula
    if (nb > 0) withAlpha(c, nb, () => {
      glow(c, SK.x, SK.y, 360, '#C0603A', 0.07);                         // the 2.7 K background all around (warmer than the outer gas)
      for (const s of [-1, 1]) {                                          // hourglass lobes
        c.save(); c.translate(SK.x, SK.y); c.scale(1, s);
        const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, rgba('#CFE6FF', 0.22)); g.addColorStop(1, rgba('#7FB8FF', 0.02));
        c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-60, 60, -175, 160, -120, 270); c.bezierCurveTo(-60, 320, 60, 320, 120, 270); c.bezierCurveTo(175, 160, 60, 60, 0, 0); c.fillStyle = g; c.fill(); c.restore();
      }
      const R = 300;
      for (const g0 of NEB) { const r = ((g0.ph + (t - P.neb) * 0.13 * g0.sp) % 1 + 1) % 1, TK = nebT(r);
        const x = SK.x + Math.cos(g0.th) * r * R, y = SK.y + Math.sin(g0.th) * r * R * 0.95;
        const col = TK > T_CMB ? mix('#F2C49A', '#DDEFFF', clamp((10 - TK) / 8)) : mix('#9FDFFF', '#4D8DFF', clamp((T_CMB - TK) / 1.8));
        circle(c, x, y, g0.sz, rgba(col, 0.85 * clamp(r / 0.08) * clamp((1.05 - r) / 0.2))); }
      glow(c, SK.x, SK.y, 70, PAL.star, 0.8); circle(c, SK.x, SK.y, 7, '#FFFFFF');
      // the 2.7 K contour
      const cq = fadeIn(t, P.belowCMB - 0.3, 0.4);
      if (cq > 0) withAlpha(c, cq, () => { c.save(); c.setLineDash([8, 8]); c.beginPath(); c.ellipse(SK.x, SK.y, R_CMB * R, R_CMB * R * 0.95, 0, 0, TAU); c.strokeStyle = rgba('#F2B894', 0.7); c.lineWidth = 2; c.stroke(); c.restore();
        tag(stage, '이 선 밖은 2.7 K보다 차가움', SK.x - 60, SK.y + R_CMB * R * 0.95 + 28, {size: 24, color: '#F2B894', plateA: 0.75}); });
      // tagged parcel
      if (t > P.parcel[0] - 0.2) { const r = P.parcelR(t), th = -1.05, x = SK.x + Math.cos(th) * r * R, y = SK.y + Math.sin(th) * r * R * 0.95, TK = nebT(r);
        withAlpha(c, fadeIn(t, P.parcel[0] - 0.2, 0.3), () => { ring(c, x, y, 16, PAL.iceHi, 3); circle(c, x, y, 5, PAL.iceHi); });
        panel(c, T, 165, 1080, 490, 120, 0.88);
        stage.text('표시한 가스의 온도', 410, 1112, {size: 24, weight: 700, color: T.muted, align: 'center'});
        stage.text(t > P.k1 ? '약 1 K' : fmtK(TK), 410, 1160, {role: 'display', size: 44, weight: 700, color: PAL.ice, align: 'center'}); }
      const sq = fadeIn(t, P.gas13, 0.4);
      if (sq > 0) withAlpha(c, sq, () => { for (const s of [-1, 1]) arrow(c, [SK.x - 60, SK.y + s * 95], [SK.x - 105, SK.y + s * 200], rgba(PAL.iceHi, 0.8), 3, {head: 14});
        tag(stage, '빠르게 퍼지며 식음', 262, SK.y, {size: 26, color: PAL.iceHi, plateA: 0.75}); });
      stage.text('센타우루스자리 · 약 5,000광년', SK.x, 448, {size: 26, weight: 700, color: T.muted, align: 'center', alpha: fadeIn(t, P.boom, 0.4)});
      tag(stage, '설명 모형 · 퍼질수록 식는 가스', SK.x, 1240, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.neb + 0.4, 0.3)});
    });
  });
}
const at12 = P => P.sky + 0.9;

// ------------------------------------------------------------------ lab: laser cooling (six beams, Doppler inset) → Bremen drop tower → s16 tease
const CH = {x: 425, y: 690, r: 215, half: 150};
const ATOMS = gasSample(26, 515, 6);
function atomPhi(P, t) { const ts = P.labIn - 1, on = P.laserOn, g = MOLASSES.gamma; return t < on ? t - ts : (on - ts) + (1 - Math.exp(-g * (t - on))) / g; }
function beam(c, x0, y0, x1, y1, w, a, col = PAL.laser) {
  if (a <= 0) return; const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(col, 0.32 * a)); g.addColorStop(1, rgba(col, 0.08 * a));
  c.save(); c.lineCap = 'butt'; c.strokeStyle = g; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore();
  arrow(c, [lerp(x0, x1, 0.06), lerp(y0, y1, 0.06)], [lerp(x0, x1, 0.2), lerp(y0, y1, 0.2)], rgba(col, 0.9 * a), 3, {head: 14});
}
function labScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const a14 = fadeIn(t, P.labIn, 0.5) * fadeOut(t, P.towerIn - 0.4, 0.4);
    if (a14 > 0) withAlpha(c, a14, () => laserPart(stage, t, P));
    const a15 = fadeIn(t, P.towerIn, 0.5) * fadeOut(t, P.s16 - 0.3, 0.4);
    if (a15 > 0) withAlpha(c, a15, () => towerPart(stage, t, P));
    const a16 = fadeIn(t, P.s16 + 0.2, 0.5);
    if (a16 > 0) withAlpha(c, a16, () => lowPart(stage, t, P));
  });
}
function laserPart(stage, t, P) {
  const c = stage.ctx, T = stage.theme, on = fadeIn(t, P.laserOn, 0.3), TK = P.cloudTK(t);
  // chamber
  glow(c, CH.x, CH.y, CH.r * 1.2, '#2A4A7A', 0.15);
  ring(c, CH.x, CH.y, CH.r, rgba(PAL.glass, 0.6), 3);
  // six beams: ±x, ±y in the picture plane, ±z drawn obliquely
  const d = CH.r + 30, z = [Math.cos(-0.6) * d * 0.75, Math.sin(-0.6) * d * 0.75];
  beam(c, CH.x - d, CH.y, CH.x, CH.y, 46, on); beam(c, CH.x + d, CH.y, CH.x, CH.y, 46, on);
  beam(c, CH.x, CH.y - d, CH.x, CH.y, 46, on); beam(c, CH.x, CH.y + d, CH.x, CH.y, 46, on);
  beam(c, CH.x - z[0], CH.y - z[1], CH.x, CH.y, 30, on * 0.8); beam(c, CH.x + z[0], CH.y + z[1], CH.x, CH.y, 30, on * 0.8);
  if (on > 0) tag(stage, '레이저 빛 · 여섯 방향', CH.x, CH.y - CH.r - 34, {size: 26, color: PAL.laser, a: on, plateA: 0.75});
  // atoms
  const f = atomPhi(P, t), s0 = ATOM_S0, L = 2 * CH.half, g = MOLASSES.gamma;
  const vNow = t < P.laserOn ? 1 : Math.exp(-g * (t - P.laserOn));
  ATOMS.forEach((a, i) => {
    const x = CH.x - CH.half + fold(a.fx * L + a.ux * s0 * f, L), y = CH.y - CH.half + fold(a.fy * L + a.uy * s0 * f, L);
    const jx = 2.2 * Math.sin(7.1 * t + i * 1.7) + 1.3 * Math.sin(12.9 * t + i), jy = 2.2 * Math.cos(6.3 * t + i * 2.3) + 1.3 * Math.sin(11.7 * t + i * 0.7);
    const xx = x + jx * (1 - vNow), yy = y + jy * (1 - vNow);
    // absorption kicks: each time the path length passes another lkick px
    if (t > P.laserOn) { const S = Math.hypot(a.ux, a.uy) * s0 * (f - atomPhi(P, P.laserOn)), k = Math.floor(S / MOLASSES.lkick);
      if (k >= 1) { const tk = P.kickTime(i, k), age = t - tk; if (age >= 0 && age < 0.16) { const vx = a.ux, vy = a.uy, n = Math.hypot(vx, vy) || 1;
        glow(c, xx, yy, 22, PAL.laser, 0.7 * (1 - age / 0.16)); line(c, [[xx + vx / n * 20, yy + vy / n * 20], [xx + vx / n * 8, yy + vy / n * 8]], rgba('#FFC2CF', 1 - age / 0.16), 3); } } }
    glow(c, xx, yy, 16, tempCol(Math.max(TK, 1e-4)), 0.35);
    sphere(c, xx, yy, 8, mix(tempCol(Math.max(TK, 1e-4)), '#FFFFFF', 0.25), {light: '#FFFFFF', shade: '#06223A'});
  });
  stage.text('원자 구름', CH.x + CH.r * 0.55, CH.y + CH.r + 10, {size: 24, weight: 700, color: T.muted, align: 'center'});
  // Doppler inset
  const dq = fadeIn(t, P.dop, 0.4); if (dq <= 0) return;
  withAlpha(c, dq, () => {
    panel(c, T, 150, 1010, 550, 280, 0.9);
    stage.text('도플러 냉각 · 설명 모형', 425, 1042, {size: 24, weight: 700, color: T.muted, align: 'center'});
    const yr = 1150, xl = 175, xr = 675, tau = t - P.dop - 0.3, v0 = DOP.v0, vv = tau < 0 ? v0 : v0 * Math.exp(-g * tau), xa = 330 + (tau < 0 ? v0 * tau : v0 * (1 - Math.exp(-g * tau)) / g);
    const hot = clamp(vv / 120);
    beam(c, xl, yr, xa - 10, yr, 26, 0.45 + 0.1 * (1 - hot)); beam(c, xr, yr, xa + 10, yr, 26, 0.45 + 0.75 * hot);
    stage.text('같은 방향 빛: 거의 통과', 205, 1092, {size: 24, weight: 700, color: T.muted});
    stage.text('마주 오는 빛: 흡수', 650, 1092, {size: 24, weight: 700, color: mix(T.muted, PAL.laser, hot), align: 'right'});
    const kicks = P.dopKicks.filter(k => k <= t), last = kicks.at(-1), age = last == null ? 9 : t - last;
    if (age < 0.2) { glow(c, xa, yr, 30, PAL.laser, 0.8 * (1 - age / 0.2)); arrow(c, [xa - 6, yr - 30], [xa - 46, yr - 30], rgba('#FFC2CF', 1 - age / 0.2), 3, {head: 12}); }
    sphere(c, xa, yr, 13, '#CFEFFF', {light: '#FFFFFF', shade: '#06223A'});
    if (vv > 12) arrow(c, [xa, yr + 34], [xa + vv * 0.32, yr + 34], rgba(PAL.iceHi, 0.9), 3, {head: 12});
    stage.text(`흡수할 때마다 뒤로 밀려 느려짐 · ${kicks.length}번`, 425, 1250, {size: 24, weight: 700, color: T.ink, align: 'center'});
  });
}
const TW = {x: 240, top: 420, bot: 1230, hpx: 800};
function towerPart(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  // the tower
  const tg = c.createLinearGradient(TW.x - 40, 0, TW.x + 40, 0); tg.addColorStop(0, '#5E7186'); tg.addColorStop(0.45, '#C9D6E2'); tg.addColorStop(1, '#4A5A6C');
  rect(c, TW.x - 34, TW.top - 20, 68, TW.bot - TW.top + 80, 6, tg);
  c.beginPath(); c.ellipse(TW.x, TW.top - 20, 46, 40, 0, Math.PI, TAU); c.fillStyle = rgba('#9FD4F0', 0.55); c.fill();
  rect(c, TW.x - 80, TW.bot + 40, 160, 44, 4, '#3A4A5C');
  rect(c, TW.x - 14, TW.top, 28, TW.bot - TW.top + 20, 3, '#0A1A2A');
  stage.text('Bremen 낙하탑', TW.x, 360, {size: 26, weight: 700, color: T.ink, align: 'center'});
  stage.text('자유 낙하 110 m', TW.x, 1326, {size: 24, weight: 500, color: T.muted, align: 'center'});
  // capsule (real-time free fall)
  const ca = fadeIn(t, P.capsule, 0.3), tau = clamp(t - P.release, 0, DROP.T), yc = TW.top + 34 + (TW.hpx - 70) * (0.5 * G * tau * tau / DROP.H);
  rect(c, TW.x - 11, yc - 30, 22, 60, 8, mix('#DCE6EE', '#FFFFFF', 0.2)); glow(c, TW.x, yc, 18, PAL.ice, 0.8 * ca); circle(c, TW.x, yc, 4, PAL.iceHi);
  if (t > P.release && t < P.land) { const v = G * tau; for (let k = 1; k <= 3; k++) line(c, [[TW.x - 6 + 6 * (k - 2), yc - 36 - k * 4], [TW.x - 6 + 6 * (k - 2), yc - 36 - k * 4 - v * 2.2]], rgba('#FFFFFF', 0.25), 2); }
  // zoom: inside the capsule
  const zx = 505, zy = 720, zr = 165, za = fadeIn(t, P.capsule, 0.5);
  withAlpha(c, za, () => {
    line(c, [[TW.x + 12, yc - 10], [zx - zr * 0.7, zy - zr * 0.7]], rgba(PAL.glass, 0.35), 1.5); line(c, [[TW.x + 12, yc + 10], [zx - zr * 0.7, zy + zr * 0.7]], rgba(PAL.glass, 0.35), 1.5);
    circle(c, zx, zy, zr, '#040B18'); ring(c, zx, zy, zr, rgba(PAL.glass, 0.7), 3);
    stage.text('캡슐 안 원자 구름', zx, zy - zr - 30, {size: 26, weight: 700, color: T.ink, align: 'center'});
    clipEllipse(c, zx, zy, zr, zr, () => {
      for (let k = -4; k <= 4; k++) { line(c, [[zx + k * 40, zy - zr], [zx + k * 40, zy + zr]], rgba(T.border, 0.35), 1); line(c, [[zx - zr, zy + k * 40], [zx + zr, zy + k * 40]], rgba(T.border, 0.35), 1); }
      const ot = clamp(t - P.obs[0], 0, 2), sg = cloudSigma(T_REC, ot) * 1e3 * 800;     // px (800 px per mm)
      const g = c.createRadialGradient(zx, zy, 0, zx, zy, sg * 2.4); g.addColorStop(0, rgba('#DDF6FF', 0.95 * (32 / sg) ** 0.6)); g.addColorStop(0.45, rgba(PAL.ice, 0.45 * (32 / sg) ** 0.6)); g.addColorStop(1, rgba(PAL.ice, 0));
      c.fillStyle = g; c.fillRect(zx - zr, zy - zr, 2 * zr, 2 * zr);
      const R = rng(9); for (let k = 0; k < 70; k++) { const rr = sg * Math.sqrt(-2 * Math.log(Math.max(1e-6, R()))) * 0.8, th = R() * TAU; circle(c, zx + Math.cos(th) * rr + 1.5 * Math.sin(3 * t + k), zy + Math.sin(th) * rr + 1.5 * Math.cos(2.7 * t + k), 2.2, rgba('#FFFFFF', 0.7)); }
    });
    line(c, [[zx + zr - 110, zy + zr + 22], [zx + zr - 30, zy + zr + 22]], T.ink, 3); stage.text('0.1 mm', zx + zr - 70, zy + zr + 46, {size: 24, weight: 500, color: T.muted, align: 'center'});
  });
  // readouts
  const ra = fadeIn(t, P.release - 0.2, 0.4);
  if (ra > 0) withAlpha(c, ra, () => {
    panel(c, T, 340, 965, 320, 160, 0.9);
    const ot = clamp(t - P.obs[0], 0, 2), w = 2 * cloudSigma(T_REC, ot) * 1e3;
    stage.text('관찰 시간', 420, 995, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text('구름 폭', 580, 995, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text(`${ot.toFixed(1)} s`, 420, 1042, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'}); stage.text(`${w.toFixed(2)} mm`, 580, 1042, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'});
    stage.text('1 μK였다면 2초 뒤 약 4 cm', 500, 1092, {size: 24, weight: 500, color: T.muted, align: 'center'});
  });
  const tq = fadeIn(t, P.trillion - 0.1, 0.4);
  if (tq > 0) tag(stage, '38 pK = 1조분의 38 K', 500, 1175, {size: 30, color: PAL.ice, role: 'display', a: tq, plateA: 0.85, border: PAL.ice});
  const lq = fadeIn(t, P.land - 0.05, 0.2) * fadeOut(t, P.land + 0.6, 0.4); if (lq > 0) glow(c, TW.x, TW.bot + 20, 60, '#FFFFFF', 0.4 * lq);
}
function lowPart(stage, t, P) {
  const c = stage.ctx, T = stage.theme, TK = P.lowT(t);
  // shared temperature slider (log, 10 K → 1 K)
  panel(c, T, 150, 330, 780, 92, 0.88);
  stage.text('온도', 180, 376, {size: 26, weight: 700, color: T.muted});
  stage.text(fmtK(TK, 3), 330, 376, {role: 'display', size: 40, weight: 700, color: PAL.ice, align: 'center'});
  const sx = TT => lerp(460, 890, 1 - Math.log10(TT)), sy0 = 392;
  line(c, [[sx(10), sy0], [sx(1), sy0]], rgba(T.muted, 0.7), 3);
  for (const [TT, s, col] of [[10, '10 K', T.muted], [TC_HG, '4.2 K', PAL.gold], [T_LAMBDA, '2.17 K', PAL.ice], [1, '1 K', T.muted]]) { line(c, [[sx(TT), sy0 - 8], [sx(TT), sy0 + 8]], col, 2); stage.text(s, sx(TT), sy0 - 26, {size: 24, weight: 700, color: col, align: 'center'}); }
  glow(c, sx(TK), sy0, 24, PAL.ice, 0.7); circle(c, sx(TK), sy0, 9, PAL.iceHi);
  // left: mercury wire, resistance
  const R = hgR(TK), sc = R > 0;
  panel(c, T, 150, 450, 370, 840, 0.5);
  stage.text('전기 저항 · 수은', 335, 490, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
  const wy = 620; rect(c, 175, wy - 40, 320, 80, 14, rgba(PAL.hg, 0.14), rgba(PAL.hg, 0.6), 2);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) circle(c, 200 + i * 40, wy - 22 + j * 22, 5, rgba(PAL.hg, 0.5));
  const Rn = rng(31);
  for (let k = 0; k < 14; k++) { const ph = Rn(), lane = Rn(), x = 180 + ((ph + t * 0.35) % 1) * 310, yb = wy - 28 + lane * 56, jit = R * 9 * Math.sin(23 * t + k * 3.1);
    circle(c, x, yb + jit, 4.5, PAL.gold);
    if (R > 0.05 && Math.sin(23 * t + k * 3.1) > 0.92) glow(c, x, yb + jit, 16, PAL.warm, 0.6 * R); }
  stage.text('전자의 흐름', 335, wy + 66, {size: 24, weight: 500, color: T.muted, align: 'center'});
  // R–T trace
  const G0 = {x0: 200, x1: 480, y0: 1040, y1: 790}, gxT = TT => lerp(G0.x0, G0.x1, 1 - Math.log10(TT)), gyR = r => lerp(G0.y0, G0.y1, r);
  line(c, [[G0.x0, G0.y1 - 10], [G0.x0, G0.y0], [G0.x1 + 6, G0.y0]], rgba(T.muted, 0.8), 2);
  stage.text('저항', G0.x0 + 8, G0.y1 - 16, {size: 24, weight: 700, color: T.muted});
  stage.text('10 K', G0.x0, G0.y0 + 24, {size: 24, weight: 500, color: T.muted, align: 'center'}); stage.text('1 K', G0.x1, G0.y0 + 24, {size: 24, weight: 500, color: T.muted, align: 'center'});
  const pts = []; for (let TT = 10; TT >= TK; TT /= 1.004) pts.push([gxT(TT), gyR(hgR(TT))]); pts.push([gxT(TK), gyR(R)]);
  if (pts.length > 1) line(c, pts, PAL.gold, 4);
  circle(c, gxT(TK), gyR(R), 7, PAL.gold);
  line(c, [[gxT(TC_HG), G0.y0], [gxT(TC_HG), G0.y1]], rgba(PAL.gold, 0.35), 1.5, {dash: [5, 5]});
  const zq = fadeIn(t, P.tcHg, 0.25);
  stage.text(zq > 0.5 ? '저항 0' : `저항 ${Math.round(R * 100)} %`, 335, 1130, {role: 'display', size: 44, weight: 700, color: zq > 0.5 ? PAL.gold : T.ink, align: 'center'});
  if (zq > 0) stage.text('초전도 (수은 4.2 K, 1911년)', 335, 1190, {size: 24, weight: 700, color: PAL.gold, align: 'center', alpha: zq});
  // right: liquid helium climbing the wall (silhouette only)
  panel(c, T, 560, 450, 370, 840, 0.5);
  stage.text('액체 헬륨', 745, 490, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
  const cx = 745, cl = 660, cr = 830, ctop = 640, cbot = 980, lev = 880, fq = clamp((t - P.tLam) / 1.6);
  // cup
  rect(c, cl, ctop, cr - cl, cbot - ctop, 14, rgba('#0A1A30', 0.5), rgba(PAL.glass, 0.8), 4);
  const lvl = lev + 16 * clamp((t - P.tLam) / 1.6); rect(c, cl + 6, lvl, cr - cl - 12, cbot - lvl - 6, 10, rgba(PAL.ice, 0.55)); glow(c, cx, (lvl + cbot) / 2, 110, PAL.ice, 0.2);
  line(c, [[cl + 6, lvl], [cr - 6, lvl]], rgba(PAL.iceHi, 0.8), 2);
  if (fq > 0) {
    const up = clamp(fq / 0.4), over = clamp((fq - 0.4) / 0.6), lv = lev + 16 * fq, yF = lerp(lv, ctop, up);
    for (const [xin, sgn] of [[cl + 8, -1], [cr - 8, 1]]) {
      const xo = xin + sgn * 16, pts = [[xin, lv], [xin, yF]];
      if (up >= 1) { pts.push([xin, ctop - 3], [xin + sgn * 8, ctop - 11], [xo, ctop - 3]); if (over > 0) pts.push([xo, lerp(ctop, cbot + 4, over)]); }
      line(c, pts, rgba(PAL.ice, 0.35), 16); line(c, pts, rgba(PAL.iceHi, 0.95), 6);
      if (over >= 1) { const ph = ((t - P.tLam - 1.6) * 1.1) % 1, yd = cbot + 10 + ph * 150; circle(c, xo, yd, 7 * (1 - 0.3 * ph), rgba(PAL.iceHi, 0.9 * (1 - ph))); }
    }
    glow(c, cx, ctop, 140, PAL.ice, 0.22 * up);
  }
  if (fq > 0) stage.text('벽을 타고 오르는 액체', 745, 1130, {role: 'display', size: 30, weight: 700, color: PAL.ice, align: 'center', alpha: fadeIn(t, P.tLam + 0.4, 0.4)});
  if (fq > 0) stage.text('초유체 (헬륨 2.17 K 아래)', 745, 1190, {size: 24, weight: 700, color: PAL.ice, align: 'center', alpha: fadeIn(t, P.tLam + 0.4, 0.4)});
}

// ------------------------------------------------------------------ myth: classical "stop" vs quantum "lowest tremble" (zero-point motion, exaggerated)
const MY = [{x: 335, name: '고전적 예상', sub: '0 K에서 정지'}, {x: 745, name: '양자역학', sub: '0 K에서도 가장 낮은 떨림'}];
const zpX = (t, k) => 0.55 * Math.sin(7.3 * t + k * 1.9) + 0.3 * Math.sin(12.7 * t + k * 0.7) + 0.25 * Math.sin(19.1 * t + k * 2.9);
const zpY = (t, k) => 0.5 * Math.sin(8.9 * t + k * 2.3) + 0.3 * Math.sin(14.3 * t + k * 1.1) + 0.2 * Math.sin(21.7 * t + k * 0.4);
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), rq = fadeIn(t, P.no18, 0.5), amp = P.classAmp(t);
  withAlpha(c, sf, () => {
    MY.forEach((m, j) => {
      const a = j === 0 ? 1 : rq; if (a <= 0) return;
      withAlpha(c, a, () => {
        panel(c, T, m.x - 185, 430, 370, 700, 0.5);
        stage.text(m.name, m.x, 470, {role: 'display', size: 32, weight: 700, color: j ? PAL.ice : T.ink, align: 'center'});
        // the bowl (harmonic well)
        const bw = 140, by = 820, bh = 230, pts = []; for (let u = -1; u <= 1.0001; u += 0.05) pts.push([m.x + u * bw, by - bh * u * u]);
        line(c, pts, rgba(PAL.glass, 0.85), 4);
        line(c, [[m.x - bw - 10, by + 30], [m.x + bw + 10, by + 30]], rgba(T.muted, 0.4), 1.5);
        if (j === 0) {
          const ph = Math.sin(4.2 * (t - ctx.scene.start)), u = 0.75 * amp * ph, x = m.x + u * bw, y = by - bh * u * u - 15;
          sphere(c, x, y, 15, '#DCEFF5', {light: '#FFFFFF', shade: '#0A2030'});
          if (amp < 0.02) stage.text('멈춤', m.x, by + 70, {size: 26, weight: 700, color: T.ink, align: 'center'});
          stage.text(`온도 ${Math.round(30 * amp * amp)} K`, m.x, by - bh - 32, {size: 24, weight: 700, color: amp < 0.02 ? PAL.ice : T.muted, align: 'center'});
        } else {
          const E0 = 70, w0 = Math.sqrt(E0 / bh) * bw;                    // ground level ½ħω above the bottom (exaggerated)
          line(c, [[m.x - w0, by - E0], [m.x + w0, by - E0]], PAL.ice, 3);
          line(c, [[m.x + 20, by - bh - 14], [m.x + w0 * 0.6, by - E0 - 4]], rgba(PAL.ice, 0.7), 2);
          stage.text('가장 낮은 에너지 > 0', m.x, by - bh - 32, {size: 24, weight: 700, color: PAL.ice, align: 'center'});
          const g = c.createRadialGradient(m.x, by - 18, 0, m.x, by - 18, w0); g.addColorStop(0, rgba(PAL.ice, 0.4)); g.addColorStop(1, rgba(PAL.ice, 0)); c.fillStyle = g; c.fillRect(m.x - w0, by - 18 - w0, 2 * w0, 2 * w0);
          const x = m.x + zpX(t, 0) * w0 * 0.6, y = by - 18 + zpY(t, 0) * 10;
          sphere(c, x, y, 15, '#DCEFF5', {light: '#FFFFFF', shade: '#0A2030'});
          stage.text('0이 아님', m.x, by + 70, {size: 26, weight: 700, color: PAL.ice, align: 'center'});
        }
        // a row of atoms in a crystal (springs)
        const yr = 1020, xs = k => m.x - 120 + k * 60;
        const P0 = [...Array(5)].map((_, k) => j === 0 ? [xs(k) + 10 * amp * Math.sin(5 * t + k * 1.3), yr + 6 * amp * Math.sin(6.1 * t + k)] : [xs(k) + 9 * zpX(t, k + 3), yr + 7 * zpY(t, k + 3)]);
        for (let k = 0; k < 4; k++) { const [x0, y0] = P0[k], [x1, y1] = P0[k + 1], sp = []; for (let i = 0; i <= 12; i++) { const u = i / 12; sp.push([lerp(x0, x1, u), lerp(y0, y1, u) + (i % 2 ? 6 : -6) * (i > 0 && i < 12 ? 1 : 0)]); } line(c, sp, rgba(PAL.glass, 0.5), 2); }
        P0.forEach(([x, y]) => sphere(c, x, y, 13, j ? '#BDEBFF' : '#DCEFF5', {light: '#FFFFFF', shade: '#0A2030'}));
        stage.text(m.sub, m.x, 1100, {size: 24, weight: 700, color: j ? PAL.ice : T.ink, align: 'center'});
      });
      if (j === 0) { const xq = fadeIn(t, P.no18 + 0.2, 0.4); if (xq > 0) cross(c, m.x + 150, 470, 16, PAL.bad, 5, xq); }
    });
    const tq = fadeIn(t, ctx.scene.start + 0.4, 0.4) * (1 - rq);
    if (tq > 0) stage.text('온도를 0 K까지 낮추면?', 745, 820, {role: 'display', size: 30, weight: 700, color: T.muted, align: 'center', alpha: tq});
    const zq = fadeIn(t, P.zp, 0.4);
    if (zq > 0) { glow(c, 540, 1205, 260, PAL.ice, 0.12 * zq); stage.text('영점 진동', 540, 1205, {role: 'display', size: 56, weight: 700, color: PAL.ice, align: 'center', alpha: zq, shadow: 'rgba(0,0,0,0.8)', shadowBlur: 14}); }
    tag(stage, '설명 모형 · 떨림 크기 과장', 745, 1150, {size: 24, color: T.muted, plate: false, a: rq});
  });
}

// ------------------------------------------------------------------ close: zeros after the decimal point → the poster again
export const CLOSE_STEPS = 14;
export const ROWS = [{name: '부메랑 성운', s: '1 K'}, {name: '레이저 냉각', s: '0.000 1 K'}, {name: '2021 낙하탑', s: '0.000 000 000 038 K'}];
/** zeros after the decimal point already typed in a row that starts typing at t0 (same timing as the picture and the 'zeros' ticks) */
export const typeDur = s => Math.max(0.3, zeroCount(s) * 0.07);
export function zerosShown(s, t0, t) { const chars = [...s], shown = Math.floor(clamp((t - t0) / typeDur(s)) * chars.length + 1e-6), first = s.search(/[1-9]/); let n = 0; for (let i = 2; i < Math.min(shown, first); i++) if (chars[i] === '0') n++; return n; }
export const zeroCount = s => { const m = s.match(/^0\.([0 ]*)/); return m ? m[1].replace(/ /g, '').length : 0; };
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), fin = fadeIn(t, P.reason - 0.2, 0.6), out = 1 - fadeIn(t, P.reason - 0.55, 0.32);
  if (out > 0) withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * out, () => {
    // the floor that is never reached
    const FY = 1210; glow(c, 540, FY, 460, PAL.ice, 0.14); line(c, [[170, FY], [910, FY]], PAL.ice, 4);
    stage.text('0 K', 540, FY + 40, {role: 'display', size: 32, weight: 700, color: PAL.ice, align: 'center'});
    // a reprise of the ladder: halving steps toward the floor (never reached)
    const sa = fadeIn(t, P.closeIn + 0.2, 0.4) * lerp(1, 0.28, fadeIn(t, P.rows[0] - 0.2, 0.5));
    if (sa > 0) withAlpha(c, sa, () => {
      const n = clamp((t - P.closeIn - 0.4) / 0.28, 0, CLOSE_STEPS), top = 470, H = FY - top, pts = [[600, top]];
      for (let k = 1; k <= Math.max(1, Math.ceil(n)); k++) { const q = clamp(n - (k - 1)), x = 600 + k * 22; pts.push([x, FY - H * 2 ** -(k - 1)]); if (q > 0) pts.push([x, FY - H * 2 ** -(k - 1 + easeOut(q))]); }
      line(c, pts, rgba(PAL.iceHi, 0.9), 4); const [ex, ey] = pts.at(-1); glow(c, ex, ey, 30, PAL.ice, 0.6); circle(c, ex, ey, 7, PAL.iceHi);
    });
    const rq = fadeIn(t, P.reach19, 0.4), xq = fadeIn(t, P.not19 + 0.1, 0.4);
    if (rq > 0) withAlpha(c, rq * lerp(1, 0.5, fadeIn(t, P.rows[0], 0.4)), () => { stage.text('0에 닿기', 330, FY - 64, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'}); arrow(c, [330, FY - 40], [330, FY - 8], rgba(T.ink, 0.8), 3, {head: 12}); });
    if (xq > 0) cross(c, 330, FY - 64, 34, PAL.bad, 6, xq);
    // rows: zeros typed in one by one
    ROWS.forEach((r, k) => {
      const t0 = P.rows[k], q = fadeIn(t, t0, 0.3); if (q <= 0) return; const y = 560 + k * 190;
      withAlpha(c, q, () => {
        stage.text(r.name, 170, y - 52, {size: 26, weight: 700, color: T.muted});
        const chars = [...r.s], nz = zeroCount(r.s), dur = Math.max(0.3, nz * 0.07), shown = Math.floor(clamp((t - t0) / dur) * chars.length + 1e-6);
        let x = 170; const size = 58;
        chars.slice(0, Math.max(1, shown)).forEach((ch, i) => { const isZ = ch === '0' && i >= 2 && r.s.startsWith('0.') && i < r.s.search(/[1-9]/);
          const w = stage.measure(ch, {role: 'display', size, weight: 700}); stage.text(ch, x, y, {role: 'display', size, weight: 700, color: isZ ? PAL.ice : T.ink}); x += w; });
      });
    });
    const cq = fadeIn(t, P.count, 0.4);
    if (cq > 0) { const n = zerosShown(ROWS[2].s, P.rows[2], t); tag(stage, `소수점 아래 0의 개수: ${n}개`, 170, 1045, {size: 32, color: PAL.ice, role: 'display', align: 'left', a: cq, plateA: 0.85, border: PAL.ice}); }
  });
  if (fin > 0) { posterPicture(stage, t, fin); captionShade(c, fin); posterTitle(stage, t, 0, fin); }
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Temperature → a low hum whose pitch is the mean speed of air molecules at that temperature: 60 + 0.35·v̄(T) Hz
//    (20 °C 222 Hz, 100 °C 243 Hz, 1 K 70 Hz, → 60 Hz as T → 0). Used for the box, the object in space, the nebula gas
//    and the laser-cooled cloud. Hook only: the bead's temperature on the axis → 60 + 46·log10(1 + T) Hz (1억 °C 428 Hz).
//  - Gas pressure → pitch 60 + 100·P Hz (atm): the Amontons points step down evenly, the dashed extension glides to 60 Hz.
//  - Wall hits on the box's right (pressure) wall → 147 Hz ticks at the model's hit times; loudness follows the hitting
//    particle's normal speed (∝ √T on average), so cooling makes them both rarer and softer.
//  - Ladder steps → 131 Hz ticks, 1.2 dB softer each step (the steps keep getting shorter).
//  - Laser-cooling absorption kicks → 165 Hz ticks at the model's kick times (they thin out as the atoms slow).
//  - Free fall → pitch 70 + 3·v Hz (v = g·τ, m/s). Zero-point motion → a quiet tone that keeps trembling (never stops).
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export const humHz = TK => 60 + 0.35 * vMean(TK);
export const hookHz = TK => 60 + 46 * Math.log10(1 + Math.max(0, TK));
export const pressHz = p => 60 + 100 * p;
const thin = (times, gap = 0.15) => { const o = []; for (const x of times.slice().sort((a, b) => a - b)) if (!o.length || x - o.at(-1) >= gap) o.push(x); return o; };
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [], sc = id => tl.scene(id);
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.4], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? r(o.gains[k], 2) : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -33}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -30, f = 58) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur: 0.6, harmonics: [1, 0.35], attack: 0.006, decay: 0.2, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.3, low: 40, high: 220, release: 0.22, gain_db: -9}}]}, means});
  const tapL = off => [{kind: 'tone', offset: r(off, 4), params: {freq: 70, dur: 0.2, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}, {kind: 'noise', offset: r(off, 4), params: {dur: 0.09, low: 40, high: 200, attack: 0.002, release: 0.07, gain_db: -8}}];
  const misfit = (id, t0, means, gain = -29) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: tapL(0)}, means});
  const tremor = (t, k = 0) => 1 + 0.25 * Math.sin(2 * Math.PI * 6.3 * t + k) * Math.sin(2 * Math.PI * 1.7 * t);

  // hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 바닥선까지 내려간 온도 축, 거의 멈춘 알갱이, 질문과 답', {dur: 1.8, gain: -35});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  chirp('bead', P.s01[0] - 0.1, P.fall[1] + 0.4, tt => hookHz(hookTK(P.beadY(tt))), tt => (tt > P.s01[2] + 0.2 && tt < P.rise[0] - 0.1 ? 0.12 : 0.3), -36,
    `온도 축의 구슬이 가리키는 온도 T → 음높이 60 + 46·log₁₀(1 + T) Hz: 20 °C ${hookHz(293.15).toFixed(0)} Hz → 바닥 60 Hz, 1억 °C ${hookHz(1e8).toFixed(0)} Hz → 다시 바닥 60 Hz`, {h: [1, 0.5, 0.25], fi: 0.2, fo: 0.4});
  thump('floor_land1', P.s01[2], '구슬이 바닥선에 내려앉음 (더 내려가지 않음)', -31, 55);
  tick('floor_label', P.floorLab, 131, -33, '"−273.15 °C · 절대영도 · 바닥" 표시', {decay: 0.14});
  ticks('hot_marks', P.hotPass, [165, 196, 233], -33, '구슬이 지나가며 태양 표면 · 태양 중심 · 핵융합 장치 표시가 차례로 나타남 (점점 높은 틱)', {decay: 0.12});
  thump('floor_land2', P.fall[1], '수억 도에서 내려온 구슬이 다시 바닥선에 멈춤', -30, 55);
  swell('floor_glow', P.floorGlow, [73, 110, 147], '"바닥이" — 바닥선이 빛남', {dur: 1.6, gain: -33});
  // origin
  tick('hanja', P.hanja + 0.1, 147, -32, '"絶 對" 글자', {decay: 0.14});
  tick('compare', P.oppo + 0.1, 123, -33, '두 온도계 사이 "견주기" 화살표 (對)', {decay: 0.12});
  misfit('cut', P.cut, '화살표가 끊김 (絶)', -29);
  tick('cards', P.cards, 165, -33, '"絶 끊을 절 + 對 마주할 대" 카드', {decay: 0.12});
  swell('origin_floor', P.floor3, [73, 110], '"정해진 바닥" 선', {dur: 1.4, gain: -33});
  ticks('bars', [P.bars + 0.45, P.bars + 0.75], [110, 131], -33, '두 온도계의 높이를 바닥에서 잼', {decay: 0.1});
  // gas
  tick('apparatus', P.app + 0.3, 131, -33, 'Amontons의 공기 온도계 (물통 · 공기 · 수은 기둥)', {decay: 0.12});
  ticks('points', P.ptT, P.ptC.map(cc => r(pressHz(pAtm(cc + T0)), 1)), -33.5, `물통을 20 °C씩 식힐 때마다 측정점 하나: 압력 → 음높이 60 + 100·P Hz (${P.ptC.map(cc => pressHz(pAtm(cc + T0)).toFixed(0)).join(' · ')} Hz, 같은 간격으로 내려감)`, {decay: 0.16});
  tick('fit', P.fit + 0.1, 165, -34, '측정점을 잇는 직선', {decay: 0.1});
  chirp('extend', P.ext[0], P.ext[1] + 0.25, tt => pressHz(pAtm(lerp(-20, -273.15, easeInOut(clamp((tt - P.ext[0]) / (P.ext[1] - P.ext[0])))) + T0)), () => 0.32, -35,
    `점선으로 직선을 늘임: 같은 대응(60 + 100·P Hz)으로 ${pressHz(pAtm(-20 + T0)).toFixed(0)} Hz → 압력 0에서 60 Hz`, {h: [1, 0.5, 0.25], fi: 0.15, fo: 0.2});
  thump('zero_p', P.cross, '압력 0이 되는 점 표시', -31, 55);
  swell('value5', P.val5, [73, 110, 147], '"−273.15 °C" 값', {dur: 1.6, gain: -33});
  // motion
  chirp('box_hum', sc('motion').start + 0.25, sc('motion').end - 0.2, tt => humHz(P.moT(tt)), () => 0.3, -36,
    `상자 속 기체의 온도 → 공기 분자 평균 속력 v̄ → 웅웅 음높이 60 + 0.35·v̄ Hz: 20 °C ${humHz(293.15).toFixed(0)} Hz, 100 °C ${humHz(373.15).toFixed(0)} Hz, 1 K ${humHz(1).toFixed(0)} Hz (화면의 "평균 속력"과 같은 값)`, {h: [1, 0.5, 0.3], fi: 0.4, fo: 0.3});
  const wr = P.moHits.filter(h => h.wall === 'R' && h.t > sc('motion').start + 0.25 && h.t < sc('motion').end - 0.25), wt = [], wg = [];
  for (const h of wr) if (!wt.length || h.t - wt.at(-1) >= 0.05) { wt.push(h.t); wg.push(clamp(20 * Math.log10(h.s / 420), -24, 0)); }
  ticks('wall_hits', wt, 147, -32, `알갱이가 오른쪽(압력) 벽을 칠 때마다 틱 (${wt.length}번, 모형의 충돌 시각): 크기는 그 알갱이의 벽 방향 속력, 식힐수록 드물고 작아짐 (20 °C 초당 약 8번 → 1 K 초당 약 0.5번)`, {decay: 0.04, gains: wg});
  tick('press_label', P.press7, 165, -34, '"압력" 계기 강조', {decay: 0.1});
  swell('floor8', P.floor8, [73, 110, 147], '"바닥이" — 온도축 바닥선 = 절대영도', {dur: 1.6, gain: -33});
  whoosh('kelvin', P.kelvin, 0.8, 90, 160, '켈빈 눈금이 섭씨 눈금 옆으로 들어옴', -35);
  swell('zero_k', P.zeroK, [73, 110], '"0 K = −273.15 °C"', {dur: 1.4, gain: -33});
  // ladder
  whoosh('zoom', P.zoom1[0], P.zoom1[1] - P.zoom1[0], 170, 80, '바닥 근처를 300배 확대: 닿은 듯해도 아직 1 K', -35);
  ticks('steps', P.stepT, 131, -30, `냉각 한 걸음(남은 온도의 절반)마다 틱 ${LADDER_N}번, 걸음이 짧아질수록 1.2 dB씩 작아짐 (설명 모형)`, {decay: 0.1, gains: P.stepT.map((_, k) => -1.2 * k)});
  swell('never', P.never, [73, 110], '"0에는 닿지 않음"', {dur: 1.5, gain: -33});
  // space
  chirp('probe_hum', P.probe0 - 0.05, P.neb + 0.2, tt => humHz(P.probeTK(tt)), () => 0.3, -36, `빈 공간에 놓인 물체의 온도 → 같은 웅웅 음높이 60 + 0.35·v̄(T) Hz: 300 K ${humHz(300).toFixed(0)} Hz → 2.7 K ${humHz(T_CMB).toFixed(0)} Hz에서 멈춤 (들어오는 빛 = 나가는 빛)`, {h: [1, 0.5, 0.3], fi: 0.3, fo: 0.4});
  swell('balance', P.k27, [73, 110], '"들어오는 빛 = 나가는 빛 → 2.7 K"', {dur: 1.4, gain: -34});
  whoosh('nebula', P.neb, 1.2, 80, 150, '부메랑 성운: 가스가 바깥으로 퍼짐', -35);
  chirp('parcel_hum', P.parcel[0], P.parcel[1] + 0.2, tt => humHz(nebT(P.parcelR(tt))), () => 0.3, -36, `표시한 가스 덩어리의 온도(퍼질수록 식음, T ∝ r^−4/3) → 같은 웅웅: ${humHz(nebT(0.12)).toFixed(0)} Hz → 1 K ${humHz(1).toFixed(0)} Hz`, {h: [1, 0.5, 0.3], fi: 0.3, fo: 0.3});
  tick('below_cmb', P.belowCMB, 98, -33, '가스가 우주 배경(2.7 K)보다 차가워지는 선을 지남', {decay: 0.16});
  // lab
  chirp('cloud_hum', P.laserOn, P.towerIn - 0.2, tt => humHz(P.cloudTK(tt)), () => 0.3, -36, `레이저로 식는 원자 구름의 온도 → 같은 웅웅: 300 K ${humHz(300).toFixed(0)} Hz → 0.1 mK ${humHz(1e-4).toFixed(1)} Hz`, {h: [1, 0.5, 0.3], fi: 0.2, fo: 0.3});
  const kt = thin([...P.kicks, ...P.dopKicks].filter(x => x < P.towerIn - 0.3), 0.07);
  ticks('kicks', kt, 165, -37, `원자가 마주 오는 빛을 흡수해 뒤로 밀릴 때마다 작은 틱 (${kt.length}번, 0.07초보다 가까운 것은 솎음): 원자가 느려질수록 드물어짐 (설명 모형)`, {decay: 0.03});
  tick('tower', P.towerIn + 0.3, 131, -33, 'Bremen 낙하탑', {decay: 0.12});
  tick('capsule', P.capsule + 0.1, 196, -34, '캡슐 안 원자 구름 확대', {decay: 0.1});
  chirp('fall', P.release, P.land, tt => 70 + 3 * G * clamp(tt - P.release, 0, DROP.T), () => 0.3, -36, `캡슐의 자유 낙하 속력 v = g·t → 음높이 70 + 3·v Hz (실제 시간, 110 m 낙하 ${DROP.T.toFixed(2)}초 동안 70 → ${(70 + 3 * G * DROP.T).toFixed(0)} Hz)`, {h: [1, 0.4], fi: 0.15, fo: 0.15});
  thump('land', P.land, '캡슐이 낙하탑 바닥에 닿음', -31, 58);
  whoosh('rec_drop', P.above, P.p38 + 0.2 - P.above, 150, 70, '로그 눈금의 표시가 0.1 mK에서 38 pK로 내려감', -36);
  swell('p38', P.p38 + 0.1, [73, 110, 147], '"38 pK = 1조분의 38 K"', {dur: 1.8, gain: -34});
  thump('sc_zero', P.tcHg, '수은의 저항이 4.2 K에서 0으로 떨어짐 (초전도)', -30, 62);
  ev.push({id: 'creep', at: r(P.tLam, 4), kind: 'env_noise', params: {low: 110, high: 260, fade: 0.1, gain_db: -33, points: [[0, 0], [0.4, 0.5], [1.6, 0.7], [2.2, 0.3], [2.6, 0]]}, means: '2.17 K 아래에서 액체 헬륨이 벽을 타고 오르는 동안 낮은 쉬익 소리'});
  // myth
  const ms = sc('myth').start;
  chirp('classical', ms + 0.2, P.stop + 1.0, tt => 98 + 4 * Math.sin(2 * Math.PI * 0.67 * (tt - ms)), tt => 0.32 * P.classAmp(tt), -35, '고전적 예상: 온도를 낮추면 공의 흔들림이 줄어 완전히 멈춤 → 소리도 사라짐', {h: [1, 0.4], fi: 0.3, fo: 0.2});
  misfit('cross_classical', P.no18 + 0.2, '"고전적 예상"에 ✕', -30);
  chirp('zero_point', P.no18 + 0.1, sc('myth').end - 0.2, tt => 98 + 3 * Math.sin(2 * Math.PI * 7.3 * tt) + 2 * Math.sin(2 * Math.PI * 12.7 * tt), tt => 0.26 * tremor(tt), -36, '영점 진동: 가장 낮은 상태에서도 멈추지 않는 작은 떨림 (음높이가 계속 조금씩 흔들림, 설명 모형)', {h: [1, 0.4], dt: 0.02, fi: 0.4, fo: 0.4});
  swell('zp_name', P.zp, [73, 110, 147], '"영점 진동"', {dur: 1.6, gain: -33});
  // close
  const cst = [...Array(CLOSE_STEPS)].map((_, k) => P.closeIn + 0.4 + k * 0.28 + 0.05);
  ticks('close_steps', cst, 131, -32, `반씩 줄어드는 걸음 다시 보기 (${CLOSE_STEPS}걸음, 걸음마다 1.2 dB씩 작아짐)`, {decay: 0.08, gains: cst.map((_, k) => -1.2 * k)});
  misfit('cross_reach', P.not19 + 0.15, '"0에 닿기"에 ✕', -30);
  const zt = []; ROWS.forEach((row, k) => { const chars = [...row.s], nz = zeroCount(row.s), dur = Math.max(0.3, nz * 0.07), first = row.s.search(/[1-9]/);
    chars.forEach((ch, i) => { if (ch === '0' && i >= 2 && i < first) zt.push(P.rows[k] + ((i + 1) / chars.length) * dur); }); });
  ticks('zeros', zt, 196, -35, `소수점 아래 0이 하나씩 찍힐 때마다 작은 틱 (${zt.length}번: 레이저 냉각 3개, 2021 낙하탑 10개)`, {decay: 0.05});
  tick('count', P.count + 0.05, 165, -33, '"소수점 아래 0의 개수: 10개"', {decay: 0.12});
  swell('poster_back', P.reason, [73, 110, 147], '"절대영도는" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  chirp('poster_tremor', P.reason + 0.6, tl.duration - 0.05, tt => 98 + 3 * Math.sin(2 * Math.PI * 7.3 * tt) + 2 * Math.sin(2 * Math.PI * 12.7 * tt), tt => 0.2 * tremor(tt), -39, '포스터 바닥선의 알갱이들: 거의 멈췄지만 멈추지 않는 떨림 (영점 진동과 같은 소리, 더 작게)', {h: [1, 0.4], dt: 0.02, fi: 0.8, fo: 0.3});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz, because the band-pass skirts fall only 12 dB/octave); swell overtones (2f)
 * are kept below it by construction (frequencies < HIGH_CUT/2). Events that would break this throw.
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/absolute-zero/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(이상기체 상자·공기 온도계, 반씩 줄어드는 걸음, 복사 냉각, 단열 팽창, 레이저 냉각, 자유 낙하, 영점 진동)에서 써 넣습니다. 대응: 온도 → 공기 분자 평균 속력 v̄ → 웅웅 음높이 60 + 0.35·v̄ Hz(20 °C 222 Hz, 0 K 쪽으로 60 Hz), 훅의 온도 축 구슬 → 60 + 46·log₁₀(1 + T) Hz, 압력 → 60 + 100·P Hz, 오른쪽 벽 충돌 → 147 Hz 틱(모형 시각, 크기 = 벽 방향 속력), 걸음 → 131 Hz 틱(걸음마다 1.2 dB 작게), 흡수 반동 → 165 Hz 틱, 낙하 속력 → 70 + 3·v Hz, 영점 진동 → 멈추지 않는 작은 떨림 음. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; wall hits ${P.moHits.length} (R ${P.moHits.filter(h => h.wall === 'R').length}); kicks ${P.kicks.length}+${P.dopKicks.length}; steps ${P.stepT.map(x => x.toFixed(2)).join(' ')}`);
  console.log(`probe at k27 ${P.probeTK(P.k27).toFixed(3)} K; parcel below CMB ${P.belowCMB.toFixed(2)}; Tc Hg ${P.tcHg.toFixed(2)}, lambda ${P.tLam.toFixed(2)}; land ${P.land.toFixed(2)}; cloud at towerIn ${fmtK(P.cloudTK(P.towerIn))}`);
}
