// Episode scenes — "벽을 타고 넘는 액체 — 초유체 헬륨"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Thermal de Broglie wavelength of He-4: λ = h / √(2π m k_B T), m = 6.646×10⁻²⁷ kg → 0.59 nm at 2.17 K, 0.43 nm at 4.2 K,
//    0.19 nm at 20 K. Atom spacing in the liquid d ≈ 0.36 nm (fixed in the picture). λ = d at 5.9 K. On screen each atom's
//    "물결" (halo) has diameter λ (300 px per nm), so halos touch at 5.9 K and overlap strongly at 2.17 K (설명 모형).
//  - Two-fluid picture, used only qualitatively: ρs/ρ = 1 − (T/Tλ)^5.6 below Tλ = 2.17 K → how far the halos' colours and
//    rhythms lock to one common phase (no percentage on screen).
//  - Heat capacity (모형 곡선): C(T) = (0.5 − ln|t|)(T/Tλ)^6 below, 0.4 − 0.75 ln|t| + 0.3·max(0, T − 3.3) above, t = T/Tλ − 1,
//    |t| ≥ 1.2×10⁻³. Not data; only the λ shape and the peak at 2.17 K matter.
//  - Boiling: bubbles are born at a rate set by T (Poisson, seeded), zero below Tλ (heat spreads at once in He II).
//  - Narrow gap (1938): He I drains like a viscous leak h = e^(−s/260 s) (barely moves); He II drains at a constant rate
//    (superflow limited by a critical speed, not by the pressure head) and empties in 6.25 s (시간 압축).
//  - Rollin film: real thickness ≈ 30 nm (drawn thick, tagged). Constant transfer rate → drops at a fixed period, the level
//    in the cup falls at a constant speed (시간 압축).
//  - Fountain: heater on → ΔT(s) ∝ 1 − e^(−s/1.3 s); fountain pressure ∝ ΔT → jet height H = 360 px · (1 − e^(−s/1.3)).
//  - Solid: 1 atm → 25.5 atm; rows lock into lattice sites between 24 and 25 atm (bottom row first). Melting pressure of
//    He-4 near 0 K ≈ 25 atm. Zero-point tremor kept large (He light); Ne chip tremor 1/3 (Lindemann ratios ≈ 0.28 vs 0.09).
//  - LHC magnet: 1-D heat diffusion with a constant heat source at the centre and cold ends; He II D = 2.5, normal liquid
//    D = 0.006 (normalised length, s); explicit finite differences at module load.
//  - Sound: node episodes/superfluid-helium/scenes.mjs --emit-sound writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow, sphere,
  withAlpha, rect, clipRect, clipEllipse, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = {base: 'slate', accent: '#5FF0D2'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const PHYS = {h: 6.62607015e-34, kB: 1.380649e-23, m: 6.646e-27};
export const T_LAMBDA = 2.17, T_BOIL = 4.2, D_NM = 0.36, P_MELT = 25;
/** thermal de Broglie wavelength of He-4 in nm */
export const lambdaNm = T => PHYS.h / Math.sqrt(2 * Math.PI * PHYS.m * PHYS.kB * T) * 1e9;
/** temperature (K) at which λ equals the atom spacing */
export const T_TOUCH = PHYS.h ** 2 / (2 * Math.PI * PHYS.m * PHYS.kB * (D_NM * 1e-9) ** 2);
/** superfluid fraction of the two-fluid picture (qualitative use only) */
export const superFrac = T => (T >= T_LAMBDA ? 0 : 1 - (T / T_LAMBDA) ** 5.6);
export const toC = T => T - 273.15;
/** heat-capacity model with the λ shape (arbitrary units) */
export function heatCap(T) {
  const tt = T / T_LAMBDA - 1, L = -Math.log(Math.max(Math.abs(tt), 1.2e-3));
  return tt < 0 ? (0.5 + L) * (T / T_LAMBDA) ** 6 : 0.4 + 0.75 * L + 0.3 * Math.max(0, T - 3.3);
}
export const C_PEAK = heatCap(T_LAMBDA - 1e-5);
// boiling: bubbles per second at T (screen time)
export const BOIL = {gentle: 7, vigorous: 52};
export const boilRate = (T, k) => (T > T_LAMBDA ? k * (0.75 + 0.25 * clamp((T - T_LAMBDA) / (T_BOIL - T_LAMBDA))) : 0);
/** seeded Poisson births of a rate(t) process on [t0, t1) → [{t, u, v, w}] */
export function births(t0, t1, rate, seed, dt = 1 / 600) {
  const r = rng(seed), out = []; let acc = 0, next = -Math.log(1 - r());
  for (let t = t0; t < t1; t += dt) { acc += rate(t) * dt; while (acc >= next) { out.push({t: +t.toFixed(4), u: r(), v: r(), w: r()}); next += -Math.log(1 - r()); } }
  return out;
}
// narrow gap (s = seconds since the flow starts)
export const FLOW = {tauI: 260, rateII: 0.11, dropI: 0.006};
export const levelI = s => Math.exp(-Math.max(0, s) / FLOW.tauI);
export const levelII = s => Math.max(0, 1 - FLOW.rateII * Math.max(0, s));
// fountain (s = seconds since the heater is on)
export const FOUNT = {tau: 1.3, hMax: 320, lag: 0.25};
export const fountH = s => (s <= FOUNT.lag ? 0 : FOUNT.hMax * (1 - Math.exp(-(s - FOUNT.lag) / FOUNT.tau)));
// solid: lattice lock of row r (0 = bottom) at pressure P (atm)
export const SOLID = {rows: 5, cols: 6, p0: 24.0, dp: 0.2, w: 0.3, pEnd: 25.2};
export const rowLock = (P, r) => smooth((P - (SOLID.p0 + SOLID.dp * r)) / SOLID.w);
// LHC magnet: 1-D diffusion with a source at x = 0, ends held cold (x = ±1). Tables HEAT.I / HEAT.II [k][j], τ = k·HEAT.dt
export const HEAT = (() => {
  const nx = 61, dx = 2 / (nx - 1), dt = 0.05, nk = 181, src = 1.0;
  const run = D => {
    const h = Math.min(0.4 * dx * dx / D, dt), sub = Math.ceil(dt / h), hh = dt / sub, out = []; let u = new Float64Array(nx);
    for (let k = 0; k < nk; k++) {
      out.push(Array.from(u));
      for (let s = 0; s < sub; s++) { const v = new Float64Array(nx); for (let j = 1; j < nx - 1; j++) v[j] = u[j] + hh * (D * (u[j + 1] - 2 * u[j] + u[j - 1]) / (dx * dx) + (j === (nx - 1) / 2 ? src / dx : 0)); u = v; }
    }
    return out;
  };
  return {nx, dt, nk, I: run(0.006), II: run(2.5)};
})();
export const heatAt = (tab, tau, j) => { const u = clamp(tau / HEAT.dt, 0, HEAT.nk - 1.001), k = Math.floor(u); return lerp(tab[k][j], tab[k + 1][j], u - k); };
export const HEAT_BOIL = 0.55;                                            // "끓기 시작" level on the graph (relative units)

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  zero: W('s01', '절대영도'), near: W('s01', '가까이'), strange: W('s01', '기묘한'),
  cup: W('s02', '컵에'), liq2: W('s02', '액체가'), wall2: W('s02', '벽을'), up2: W('s02', '올라가'), out2: W('s02', '바깥으로'),
  he3: W('s03', '헬륨이라는'), greek3: W('s03', '그리스어로'), sun3: W('s03', '태양을'), helios3: W('s03', '헬리오스에서'),
  y1868: W('s04', '천팔백육십팔년'), eclipse: W('s04', '일식'), light4: W('s04', '빛의'), pattern: W('s04', '무늬에서'), first4: W('s04', '처음'),
  earth4: W('s04', '지구보다'), sun4: W('s04', '태양에서'), elem4: W('s04', '원소이기'),
  y1908: W('s05', '천구백팔년'), nl5: W('s05', '네덜란드의'), onnes: W('s05', '카메를링'), k4: W('s05', '사켈빈'), c269: W('s05', '영하'),
  firstL: W('s05', '처음으로'), liquid5: W('s05', '액체로'),
  pump: W('s06', '펌프로'), more6: W('s06', '식히면'), k217: W('s06', '이점일칠켈빈에서'), boil6: W('s06', '거세게'), sudden: W('s06', '갑자기'), calm: W('s06', '잠잠해집니다'),
  heat7: W('s07', '열을'), graph7: W('s07', '그래프가'), greek7: W('s07', '그리스'), lam7: W('s07', '람다'), shape7: W('s07', '모양으로'), soar7: W('s07', '치솟아'), lpoint: W('s07', '람다점이라고'),
  y1938: W('s08', '천구백삼십팔년'), moscow: W('s08', '모스크바와'), camb: W('s08', '케임브리지의'), each8: W('s08', '각각'), liq8: W('s08', '이 액체가'),
  narrow: W('s08', '좁은'), gap8: W('s08', '틈을'), nores: W('s08', '저항'), found8: W('s08', '발견했습니다'),
  visc: W('s09', '끈적임이'), kapitza: W('s09', '카피차는'), name9: W('s09', '초유체라고'),
  qm: W('s10', '양자역학에'), atom10: W('s10', '원자를'), wave10: W('s10', '물결로'), cold10: W('s10', '차가워질수록'), wide10: W('s10', '퍼집니다'),
  wave11: W('s11', '물결이'), nb11: W('s11', '이웃'), wide11: W('s11', '넓어지면'), many11: W('s11', '많은'), same11: W('s11', '같은'), gather11: W('s11', '모여'), lump11: W('s11', '덩어리처럼'), move11: W('s11', '움직입니다'),
  lump12: W('s12', '덩어리로'), wall12: W('s12', '벽에'), energy12: W('s12', '에너지를'), lose12: W('s12', '잃을'), fric12: W('s12', '마찰'),
  wall13: W('s13', '벽에'), hair: W('s13', '머리카락'), thou: W('s13', '수천분의'), film13: W('s13', '막을'), climb13: W('s13', '기어올라'), over13: W('s13', '넘어'), out13: W('s13', '흘러나옵니다'),
  side14: W('s14', '한쪽을'), warm14: W('s14', '데우면'), that14: W('s14', '그쪽으로'), rush14: W('s14', '몰려들어'), fount14: W('s14', '분수처럼'), up14: W('s14', '솟구치기도'),
  abs15: W('s15', '절대영도에'), any15: W('s15', '무엇이든'), freeze15: W('s15', '얼어붙을까요'),
  except16: W('s16', '예외입니다'), atom16: W('s16', '원자가'), light16: W('s16', '가벼워'), lowest16: W('s16', '가장'), shake16: W('s16', '크게'),
  atm16: W('s16', '대기압의'), x25: W('s16', '이십오배쯤으로'), press16: W('s16', '눌러야'), solid16: W('s16', '고체가'),
  real17: W('s17', '실제로'), eu17: W('s17', '유럽의'), big17: W('s17', '거대'), acc17: W('s17', '가속기는'), sf17: W('s17', '초유체'), mag17: W('s17', '자석을'), k19: W('s17', '일점구켈빈까지'),
  heat18: W('s18', '열을'), fast18: W('s18', '빠르게'), boil18: W('s18', '끓어오를'), long18: W('s18', '긴'), whole18: W('s18', '전체를'), even18: W('s18', '고르게'),
  one19: W('s19', '하나하나가'), all19: W('s19', '모두가'), move19: W('s19', '움직이는'), new19: W('s19', '새로운'),
  reason20: W('s20', '초유체'), wave20: W('s20', '물결이'), overlap20: W('s20', '겹쳐'),
};

// geometry shared by drawing and sound (drops, falls)
export const POSTER = {cx: 540, rim: 392, w: 400, h: 438, wt: 22, rc: 60, bath: 1530, level0: 566, levelRate: 1.4, flow: 70};
export const DRIP = {g: 2600, period: 1.05, phase: -0.64};
export const FILMCUP = {cx: 430, rim: 430, w: 380, h: 430, wt: 24, rc: 60, bath: 1240, level0: 560, levelRate: 4.0, flow: 90};
export const FILM_DRIP = {period: 0.85};
const hangY = g => g.rim + g.h + g.wt + 3;
export const fallTime = (g, bath) => Math.sqrt(2 * Math.max(10, bath - hangY(g) - 10) / DRIP.g);
/** screen times of drop impacts on the bath: detach times phase + k·period in [m0, m1] (model time) */
export function dripImpacts(g, bath, period, phase, m0, m1, kMin = -1e9) {
  const tf = fallTime(g, bath), out = [];
  for (let k = Math.max(kMin, Math.ceil((m0 - tf - phase) / period)); phase + k * period + tf <= m1; k++) out.push(phase + k * period + tf);
  return out;
}

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
/** piecewise log-linear temperature path: knots [[t, T], …] (eased between knots) */
const tempPath = raw => {
  const knots = []; for (const [t, T] of raw) knots.push([knots.length ? Math.max(t, knots.at(-1)[0] + 0.05) : t, T]);   // keep knot times increasing for any timeline
  return t => {
  if (t <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [a, Ta] = knots[i - 1], [b, Tb] = knots[i]; return Math.exp(lerp(Math.log(Ta), Math.log(Tb), easeInOut((t - a) / (b - a)))); }
  return knots.at(-1)[1];
  };
};
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook
  P.zero = at(A.zero) - 0.1; P.near = at(A.near) - 0.1; P.cup = at(A.cup) - 0.1; P.climb = at(A.wall2) - 0.1; P.outside = at(A.out2) - 0.1;
  P.posterM = t => t - tl.duration;                                       // bookend: model time 0 at the last frame = the thumbnail state
  // origin
  P.he = at(A.he3) - 0.15; P.greek = at(A.greek3) - 0.1; P.sun = at(A.sun3) - 0.1; P.helios = at(A.helios3) - 0.05;
  P.s04 = at('s04') - 0.55; P.moon = [at('s04') - 0.3, at(A.eclipse) + 0.25]; P.total = at(A.eclipse) + 0.25;
  P.pattern = at(A.pattern) - 0.15; P.first = at(A.first4) - 0.05; P.earth = at(A.earth4) - 0.1; P.sunFirst = at(A.sun4) - 0.05;
  // liquid
  P.y1908 = at(A.y1908) - 0.1; P.onnes = at(A.onnes) - 0.1; P.cool0 = at(A.nl5); P.k4 = at(A.k4); P.c269 = at(A.c269) - 0.1; P.firstL = at(A.firstL) - 0.1;
  P.TQ = t => (t <= P.cool0 ? 293 : t >= P.k4 ? T_BOIL : Math.exp(lerp(Math.log(293), Math.log(T_BOIL), easeInOut((t - P.cool0) / (P.k4 - P.cool0)))));
  P.pool = [P.k4 + 0.3, P.firstL + 1.6];                                  // the pool fills between these times
  { const R = rng(41); P.condense = [...Array(14)].map((_, k) => ({t0: lerp(P.pool[0], P.pool[1] - 0.6, (k + R() * 0.6) / 14), side: k % 2 ? -1 : 1, r: R(), d: 0.55 + 0.35 * R()})); }
  P.condenseHit = P.condense.map(d => d.t0 + d.d);
  P.gentle = births(P.pool[0] + 0.6, sc('liquid').end + 0.5, () => BOIL.gentle, 7);
  // lambda: pumped from 4.2 K, crossing 2.17 K on "갑자기", approaching 1.4 K
  P.pump = at(A.pump) - 0.1; P.mark217 = at(A.k217) - 0.1; P.lam = at(A.sudden); P.calm = at(A.calm) - 0.05;
  { const T1 = 1.4, tau = (P.lam - P.pump) / Math.log((T_BOIL - T1) / (T_LAMBDA - T1)); P.TL = t => (t <= P.pump ? T_BOIL : T1 + (T_BOIL - T1) * Math.exp(-(t - P.pump) / tau)); P.tauL = tau; }
  P.lStart = sc('lambda').start;
  P.bubbles = births(P.lStart - 1.6, P.lam, t => boilRate(P.TL(t), t < P.pump ? BOIL.gentle * 1.6 : BOIL.vigorous), 11)
    .map(b => { const x = 290 + b.u * 360, y0 = 872 - b.v * 30, vr = 190 + 110 * b.w, rad = 3 + 5 * b.w; return {...b, x, y0, vr, rad, ts: b.t + (y0 - L_LEVEL) / vr}; });
  P.heat7 = at(A.heat7) - 0.1; P.greekL = at(A.greek7) - 0.1; P.shape = at(A.shape7) - 0.1; P.lpoint = at(A.lpoint) - 0.1;
  // flow
  P.y1938 = at(A.y1938) - 0.1; P.moscow = at(A.moscow) - 0.1; P.camb = at(A.camb) - 0.1; P.flow0 = at(A.liq8) - 0.2; P.narrow = at(A.narrow) - 0.1;
  P.nores = at(A.nores) - 0.1; P.visc = at(A.visc) - 0.1; P.kapitza = at(A.kapitza) - 0.1; P.name = at(A.name9) - 0.1;
  P.dropsI = []; for (let k = 1; k < 40; k++) { const s = -FLOW.tauI * Math.log(1 - k * FLOW.dropI); if (P.flow0 + s > sc('flow').end - 0.3) break; P.dropsI.push(P.flow0 + s); }
  P.emptyII = P.flow0 + 1 / FLOW.rateII;
  // wave: dial temperature 20 K → 6 K (s10) → 2.17 K → 1.2 K (s11)
  P.qm = at(A.qm) - 0.1; P.waveOn = at(A.wave10) - 0.1; P.cold = at(A.cold10);
  P.TW = tempPath([[P.cold, 20], [at(A.wide10) + 0.5, 6.0], [at(A.wave11), 6.0], [at(A.wide11) + 0.35, T_LAMBDA], [at(A.many11), T_LAMBDA], [at(A.gather11) + 0.35, 1.2]]);
  { let lo = P.cold, hi = at(A.wide11) + 0.35; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (lambdaNm(P.TW(m)) < D_NM) lo = m; else hi = m; } P.touch = (lo + hi) / 2; }
  { let lo = P.cold, hi = at(A.gather11) + 0.35; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (P.TW(m) > T_LAMBDA + 1e-6) lo = m; else hi = m; } P.lamW = (lo + hi) / 2; }
  P.lockW = t => superFrac(P.TW(t));
  P.lump = at(A.lump11) - 0.15; P.lanes = at('s12') - 0.55; P.go12 = P.lanes + 0.75; P.wall12 = at(A.wall12) - 0.1; P.lose = at(A.lose12) - 0.1; P.fric = at(A.fric12) - 0.1;
  P.sparks = laneSparks(P.go12, sc('wave').end);
  // film: front climbs the inner wall from "벽에" to the rim just after "기어올라", then over and down to the bottom by "넘어"
  P.front = [at(A.wall13), at(A.climb13) + 0.2, at(A.over13) + 0.1]; P.hair = at(A.hair) - 0.1; P.thou = at(A.thou) - 0.1;
  P.firstDrip = P.front[2] + 0.45; P.pan = at('s14') - 0.15;
  P.filmImpacts = dripImpacts(FILMCUP, FILMCUP.bath, FILM_DRIP.period, P.firstDrip, P.firstDrip, P.pan + 0.5, 0);
  P.heatOn = at(A.warm14); P.that = at(A.that14) - 0.1; P.fount = at(A.fount14) - 0.1;
  // solid
  P.q15 = at(A.abs15) - 0.1; P.coolS = [at(A.abs15), at(A.freeze15) + 0.3]; P.freezeQ = at(A.freeze15) + 0.1;
  P.TS = t => Math.exp(lerp(Math.log(293), Math.log(0.6), clamp((t - P.coolS[0]) / (P.coolS[1] - P.coolS[0]))));
  P.freezeT = VIALS.map(v => { if (!v.tm) return null; let lo = P.coolS[0], hi = P.coolS[1]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (P.TS(m) > v.tm) lo = m; else hi = m; } return (lo + hi) / 2; });
  P.except = at(A.except16) - 0.1; P.box = at(A.atom16) - 0.55; P.light = at(A.light16) - 0.1; P.shake = at(A.shake16) - 0.1;
  P.press = [at(A.atm16), at(A.press16) - 0.15, at(A.solid16) + 0.25];      // 1 → 23 atm, then slowly 23 → 25.2 atm
  P.PS = t => (t <= P.press[0] ? 1 : t <= P.press[1] ? lerp(1, 23, easeInOut((t - P.press[0]) / (P.press[1] - P.press[0]))) : lerp(23, SOLID.pEnd, clamp((t - P.press[1]) / (P.press[2] - P.press[1]))));
  P.rowT = [...Array(SOLID.rows)].map((_, r) => { let lo = P.press[0], hi = P.press[2] + 0.5; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (rowLock(P.PS(m), r) < 0.5) lo = m; else hi = m; } return (lo + hi) / 2; });
  P.solidT = P.rowT.at(-1);
  P.jostle = births(P.box + 0.6, P.rowT[0] - 0.05, () => 4.5, 23).map(b => b.t);
  // use
  P.real = at(A.real17) - 0.15; P.ring = at(A.eu17) - 0.1; P.km27 = at(A.big17) - 0.05; P.beams = at(A.acc17) - 0.1; P.magnet = at(A.mag17) - 0.15; P.k19 = at(A.k19) - 0.1;
  P.s18 = at('s18') - 0.5; P.heatP = at(A.heat18) - 0.05; P.fast = at(A.fast18) - 0.1; P.boil18 = at(A.boil18) - 0.1; P.whole = at(A.whole18) - 0.1;
  P.boilCross = (() => { const jm = (HEAT.nx - 1) / 2; for (let tau = 0; tau < (HEAT.nk - 1) * HEAT.dt; tau += 0.01) if (heatAt(HEAT.I, tau, jm) * heatScale(P) >= HEAT_BOIL) return P.heatP + tau; return null; })();
  // close
  P.one = at(A.one19) - 0.1; P.all = at(A.all19) - 0.1; P.move19 = at(A.move19) - 0.1;
  P.TC = tempPath([[P.all, 2.6], [P.all + 1.3, 1.2]]);
  P.lockC = t => superFrac(P.TC(t));
  P.reason = at(A.reason20) - 0.1;
  PLANS.set(tl, P); return P;
}
/** scale so that the normal-liquid peak crosses the boil level at the word "끓어오를" (P.boil18 + 0.1) */
function heatScale(P) { const jm = (HEAT.nx - 1) / 2, tau = clamp(P.boil18 + 0.1 - P.heatP, 0.8, 6); return HEAT_BOIL / heatAt(HEAT.I, tau, jm); }

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export const PAL = {sf: '#5FF0D2', sfDeep: '#0B5E57', he1: '#8FB8E8', glass: '#BFE9F2', rim: '#E9FFFB', warm: '#FFB36A', heat: '#FF8048', hot: '#FF5A3A',
  sodium: '#FFB43C', d3: '#FFE96A', sun: '#FFCF6E', prom: '#FF5C6A', bad: '#FF7A5C', good: '#8FE3BF', frost: '#E6F4FA', iron: '#5E6B73', coil: '#C9824A', neutral: '#B9C6D3'};
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const gr = c.createLinearGradient(0, 0, W * 0.3, H); gr.addColorStop(0, '#0B1A20'); gr.addColorStop(1, T.deep);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  glow(c, 540, 720, 900, '#1E5A5A', 0.07);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.25) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
const frac = x => x - Math.floor(x);
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
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: T.accent, align: 'center', ...so}));
}
/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1340, 0, 1600);
  g.addColorStop(0, 'rgba(2,10,12,0)'); g.addColorStop(0.35, `rgba(2,10,12,${0.6 * a})`); g.addColorStop(0.75, `rgba(2,10,12,${0.6 * a})`); g.addColorStop(1, 'rgba(2,10,12,0)');
  c.fillStyle = g; c.fillRect(0, 1340, 1080, 260);
}
const fmtK = T => (T >= 100 ? `${Math.round(T)} K` : T >= 10 ? `${T.toFixed(1)} K` : `${T.toFixed(2)} K`);
const fmtC = T => { const c = Math.round(toC(T)); return c < 0 ? `영하 ${-c} °C` : `${c} °C`; };
/** polyline helpers */
function plen(pts) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return L; }
function pAt(pts, L, s) { let i = 1; while (i < L.length - 1 && L[i] < s) i++; const u = clamp((s - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1])); return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; }
function sub(pts, L, s0, s1) { s0 = clamp(s0, 0, L.at(-1)); s1 = clamp(s1, 0, L.at(-1)); if (s1 <= s0) return []; const o = [pAt(pts, L, s0)]; for (let i = 1; i < pts.length; i++) if (L[i] > s0 && L[i] < s1) o.push(pts[i]); o.push(pAt(pts, L, s1)); return o; }
function ellRing(c, x, y, rx, ry, col, w) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
function glowLine(c, pts, col, w, a = 1) { if (pts.length < 2 || a <= 0) return; line(c, pts, rgba(col, 0.13 * a), w * 4.2); line(c, pts, rgba(col, 0.3 * a), w * 2.2); line(c, pts, rgba(mix(col, '#FFFFFF', 0.4), 0.95 * a), w); }
function halo(c, x, y, R, col, a) {
  if (R <= 0 || a <= 0) return; const g = c.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.5, rgba(col, a * 0.62)); g.addColorStop(0.82, rgba(col, a * 0.2)); g.addColorStop(1, rgba(col, 0));
  circle(c, x, y, R, g);
}
function atomCore(c, x, y, r, col, a = 1) { sphere(c, x, y, r, mix(col, '#FFFFFF', 0.45), {alpha: a, shade: mix(col, '#021012', 0.65), light: '#FFFFFF'}); }
/** circular dial: q ∈ [0,1] maps to the arc a0 … a0 + span (radians, clockwise from +x) */
function dial(stage, cx, cy, r, q, o = {}) {
  const c = stage.ctx, T = stage.theme, a0 = o.a0 ?? (150 * Math.PI / 180), span = o.span ?? (240 * Math.PI / 180), ang = a0 + span * clamp(q);
  ring(c, cx, cy, r, rgba(T.border, 1), 10, a0, a0 + span);
  if (o.grad) for (let i = 0; i < 24; i++) { const u0 = i / 24, u1 = (i + 1) / 24; ring(c, cx, cy, r, rgba(mix(o.grad[0], o.grad[1], (u0 + u1) / 2), 0.75), 10, a0 + span * u0, a0 + span * u1 + 0.002); }
  for (const [tq, lab, col] of o.ticks || []) {
    const ta = a0 + span * tq; line(c, [[cx + (r - 16) * Math.cos(ta), cy + (r - 16) * Math.sin(ta)], [cx + (r + 9) * Math.cos(ta), cy + (r + 9) * Math.sin(ta)]], col || T.muted, 3);
    if (lab) stage.text(lab, cx + (r + 30) * Math.cos(ta), cy + (r + 30) * Math.sin(ta), {size: 24, weight: 700, color: col || T.muted, align: 'center'});
  }
  const kr = r * 0.62, g = c.createRadialGradient(cx - kr * 0.3, cy - kr * 0.35, kr * 0.1, cx, cy, kr);
  g.addColorStop(0, '#3C5359'); g.addColorStop(1, '#13232A'); circle(c, cx, cy, kr, g); ring(c, cx, cy, kr, rgba(T.border, 1), 2);
  line(c, [[cx + (kr + 2) * Math.cos(ang), cy + (kr + 2) * Math.sin(ang)], [cx + (r - 4) * Math.cos(ang), cy + (r - 4) * Math.sin(ang)]], o.col || T.accent, 5);
  circle(c, cx + (r - 4) * Math.cos(ang), cy + (r - 4) * Math.sin(ang), 7, o.col || T.accent);
}

// =====================================================================================================
// Glass cup, bath, drops, vapour (poster, hook, film, close)
// =====================================================================================================
function arcPts(ox, oy, r, a0, a1, n = 10) { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]); } return o; }
function cupGeom(g) {
  const {cx, rim, w, h, wt, rc} = g, xL = cx - w / 2, xR = cx + w / 2, yb = rim + h, PI = Math.PI;
  const glassPts = [[xL - wt, rim], ...arcPts(xL + rc, yb - rc, rc + wt, PI, PI / 2), ...arcPts(xR - rc, yb - rc, rc + wt, PI / 2, 0), [xR + wt, rim],
    ...arcPts(xR + wt / 2, rim, wt / 2, 0, -PI, 8), [xR, yb - rc], ...arcPts(xR - rc, yb - rc, rc, 0, PI / 2), ...arcPts(xL + rc, yb - rc, rc, PI / 2, PI), [xL, rim],
    ...arcPts(xL - wt / 2, rim, wt / 2, 0, -PI, 8)];
  const liquid = lv => [[xL + 26, lv], [xL + 10, lv - 1], [xL, lv - 7], ...arcPts(xL + rc, yb - rc, rc, PI, PI / 2), ...arcPts(xR - rc, yb - rc, rc, PI / 2, 0), [xR, lv - 7], [xR - 10, lv - 1], [xR - 26, lv]];
  // right half of the film path, from the liquid surface up the inner wall, over the rim, down the outside to the bottom centre
  const film = (lv, f = 3) => [[xR - f, lv - 6], [xR - f, rim], ...arcPts(xR + wt / 2, rim, wt / 2 + f, PI, 2 * PI, 10), [xR + wt + f, yb - rc], ...arcPts(xR - rc, yb - rc, rc + wt + f, 0, PI / 2, 10), [cx, yb + wt + f]];
  return {xL, xR, yb, glassPts, liquid, film, hang: [cx, yb + wt + 3]};
}
const mirrorX = (pts, cx) => pts.map(([x, y]) => [2 * cx - x, y]);
/**
 * The cup in cross-section. o: {level, front (px of film along each half; Infinity = complete), flowT (tracer clock), flow (px/s),
 *  a, filmW, rimGlow}
 */
function drawCup(stage, g, o) {
  const c = stage.ctx, G = cupGeom(g), a = o.a ?? 1, lv = o.level, fw = o.filmW ?? 4;
  withAlpha(c, a, () => {
    // back glow and liquid
    glow(c, g.cx, lv + 80, g.w * 0.9, PAL.sf, 0.10);
    const lg = c.createLinearGradient(0, lv, 0, G.yb); lg.addColorStop(0, rgba(PAL.sf, 0.62)); lg.addColorStop(0.18, rgba('#2FBFAE', 0.55)); lg.addColorStop(1, rgba(PAL.sfDeep, 0.75));
    poly(c, G.liquid(lv), lg);
    glowLine(c, [[G.xL + 2, lv - 6], [G.xL + 12, lv - 1], [G.xL + 30, lv], [G.xR - 30, lv], [G.xR - 12, lv - 1], [G.xR - 2, lv - 6]], PAL.sf, 2.5, 0.9);
    // glass
    poly(c, G.glassPts, rgba(PAL.glass, 0.14), rgba(PAL.glass, 0.55), 2);
    line(c, [[G.xL - g.wt * 0.55, g.rim + 30], [G.xL - g.wt * 0.55, G.yb - g.rc]], rgba('#FFFFFF', 0.22), 3);
    line(c, [[G.xR + g.wt * 0.45, g.rim + 30], [G.xR + g.wt * 0.45, G.yb - g.rc - 30]], rgba('#FFFFFF', 0.12), 2);
    // glowing rim
    for (const [ox] of [[G.xL - g.wt / 2], [G.xR + g.wt / 2]]) glowLine(c, arcPts(ox, g.rim, g.wt / 2 + 1, -Math.PI, 0, 10), PAL.rim, 2.2, 0.75 * (o.rimGlow ?? 1));
    // film (both halves) and tracers
    const half = G.film(lv), L = plen(half), front = Math.min(o.front ?? Infinity, L.at(-1));
    for (const pts of [half, mirrorX(half, g.cx)]) {
      const seg = sub(pts, L, 0, front);
      glowLine(c, seg, PAL.sf, fw, 0.95);
      if (o.flow) { const Lt = L.at(-1), Lin = lv - 6 - g.rim + 30; for (let k = 0; k < Math.floor(Lt / 130); k++) { const sb = ((k * 130 + (o.flowT ?? 0) * o.flow) % Lt + Lt) % Lt; if (sb > Lin && sb < front) { const p = pAt(pts, L, sb); glow(c, p[0], p[1], 16, PAL.sf, 0.5); circle(c, p[0], p[1], fw * 1.05, rgba('#C8FFF5', 0.95)); } } }
      if (o.flow) { const Lt = L.at(-1), n = Math.floor(Lt / 34); for (let k = 0; k < n; k++) { const s2 = ((k * 34 + (o.flowT ?? 0) * o.flow) % Lt + Lt) % Lt; if (s2 + 12 < front) line(c, sub(pts, L, s2, s2 + 12), rgba('#F2FFFC', 0.5), fw * 0.55); } }
      if (front < L.at(-1) && front > 0) { const p = pAt(pts, L, front); glow(c, p[0], p[1], 18, PAL.sf, 0.6); }
    }
  });
  return G;
}
/** the bath surface with drop ripples; ripples: [{x, age}] */
function drawBath(stage, y, m, ripples = [], a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, y - 10, 0, 1920); g.addColorStop(0, rgba(PAL.sf, 0.34)); g.addColorStop(0.12, rgba('#1D8F86', 0.36)); g.addColorStop(1, rgba('#03201F', 0.6));
    const pts = []; for (let x = -10; x <= 1090; x += 20) pts.push([x, y + 2.2 * Math.sin(x / 47 + m * 1.1) + 1.4 * Math.sin(x / 19 - m * 1.7)]);
    poly(c, [...pts, [1090, 1920], [-10, 1920]], g);
    glowLine(c, pts, PAL.sf, 2, 0.7);
    for (const r of ripples) {
      if (r.age < 0 || r.age > 1.4) continue; const q = r.age / 1.4, rx = 14 + 170 * easeOut(q);
      ellRing(c, r.x, y + 2, rx, rx * 0.17, rgba('#E6FFFB', 0.7 * (1 - q)), 2.5); if (q < 0.6) ellRing(c, r.x, y + 2, rx * 0.55, rx * 0.55 * 0.17, rgba('#E6FFFB', 0.45 * (1 - q / 0.6)), 2);
      if (r.age < 0.25) { const u = r.age / 0.25; for (let k = 0; k < 5; k++) { const ang = -Math.PI / 2 + (k - 2) * 0.42, d = 44 * u; circle(c, r.x + Math.cos(ang) * d, y - 6 + Math.sin(ang) * d + 60 * u * u, 2.6 * (1 - u), rgba('#E6FFFB', 0.85)); } }
    }
  });
}
/** hanging drop, falling drops and bath ripples for a periodic drip; returns nothing. kMin: first drop index (film scene) */
function drawDrips(stage, g, bath, m, period, phase, a = 1, o = {}) {
  const c = stage.ctx, [hx, hy] = cupGeom(g).hang, tf = fallTime(g, bath), kMin = o.kMin ?? -1e9, ripples = [];
  withAlpha(c, a, () => {
    const kNow = Math.floor((m - phase) / period);                       // last detached drop index
    // hanging drop grows until it detaches
    let q;
    if (kNow + 1 < kMin) q = o.preQ ?? 0; else q = frac((m - phase) / period);
    if (o.grow0 != null && kNow + 1 <= kMin) q = o.grow0;
    if (q > 0.02) { const r = 4 + 12 * q, cy = hy + r * 0.85; glow(c, hx, cy, r * 3.2, PAL.sf, 0.35); poly(c, [[hx - r * 0.5, hy - 1], [hx + r * 0.5, hy - 1], [hx + r * 0.9, cy], [hx - r * 0.9, cy]], rgba('#9FF5E6', 0.9)); circle(c, hx, cy, r, rgba('#9FF5E6', 0.9)); circle(c, hx - r * 0.35, cy - r * 0.3, r * 0.28, rgba('#FFFFFF', 0.8)); }
    for (let k = kNow; k > kNow - 3; k--) {
      if (k < kMin) break; const tau = m - (phase + k * period); if (tau < 0) continue;
      if (tau < tf) { const y = hy + 10 + 0.5 * DRIP.g * tau * tau, v = DRIP.g * tau, e = 1 + Math.min(0.6, v / 2600);
        c.save(); c.translate(hx, y); c.scale(1 / Math.sqrt(e), e); glow(c, 0, 0, 30, PAL.sf, 0.45); circle(c, 0, 0, 10.5, rgba('#AFFFF0', 0.95)); circle(c, -3.4, -3.2, 3, rgba('#FFFFFF', 0.9)); c.restore(); }
      else ripples.push({x: hx, age: tau - tf});
    }
  });
  return ripples;
}
/** soft cold vapour drifting up from the bath and around the cup (deterministic in m) */
function vapour(c, m, x0, x1, yTop, yBot, n = 12, a = 1) {
  for (let i = 0; i < n; i++) {
    const H = yBot - yTop, u = frac(rand(i * 7 + 1) + m * (0.035 + 0.02 * rand(i + 3))), y = yBot - u * H, x = lerp(x0, x1, rand(i * 3 + 2)) + 40 * Math.sin(m * 0.3 + i * 1.7) + 30 * u;
    glow(c, x, y, 70 + 50 * rand(i + 11) + 40 * u, '#E3FBF6', a * 0.1 * Math.sin(Math.PI * u));
  }
}
/** the poster picture at model time m (t = 0 → the thumbnail) */
function posterPicture(stage, m, o = {}) {
  const c = stage.ctx, a = o.a ?? 1, g = POSTER, G = cupGeom(g);
  withAlpha(c, a, () => {
    glow(c, 540, 640, 620, '#1D6F6A', 0.16);
    // hanger wires
    const wa = 0.35 * (o.wire ?? 1); line(c, [[G.xL - g.wt / 2, g.rim - 6], [540, -40]], rgba('#9FB7BC', wa), 2); line(c, [[G.xR + g.wt / 2, g.rim - 6], [540, -40]], rgba('#9FB7BC', wa), 2);
    vapour(c, m, 140, 940, 880, g.bath + 40, 12, 1.5);
    const ripples = drawDrips(stage, g, g.bath, m, DRIP.period, DRIP.phase, 1, {});
    drawBath(stage, g.bath, m, ripples, 1);
    drawCup(stage, g, {level: g.level0 + g.levelRate * m, flowT: m, flow: g.flow, filmW: 4.5});
    vapour(c, m + 13, 280, 800, 330, 660, 7, 1.3);
  });
}

// =====================================================================================================
// Atom field (wave, close): helium atoms with their "물결" halos (설명 모형)
// =====================================================================================================
export const FIELD_PX = 300;                                              // px per nm
const HUES = ['#5FF0D2', '#7FC4FF', '#B9A0FF', '#8EF0A6', '#FFC98A', '#6FE2F5', '#FF9EC0'];
export const FIELD = (() => {
  const out = [], dx = D_NM * FIELD_PX, dy = dx * 0.866;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) {
    const k = out.length;
    out.push({k, r, c, x: (c - 4 + (r % 2 ? 0.5 : 0)) * dx + (rand(r * 17 + c) - 0.5) * 22, y: (r - 2.5) * dy + (rand(r * 31 + c + 5) - 0.5) * 22,
      w: 1 + (rand(k * 7 + 3) - 0.5) * 0.55, ph: rand(k * 13 + 1) * TAU, col: HUES[(k * 5 + r) % HUES.length], jx: rand(k + 50) * TAU, jy: rand(k + 90) * TAU, jf: 1.2 + rand(k + 7)});
  }
  return out;
})();
const OMEGA = TAU * 0.7;
function atomPhase(a, t, L) { const own = OMEGA * a.w * t + a.ph, com = OMEGA * t; const d = (((com - own) % TAU) + TAU * 1.5) % TAU - Math.PI; return own + L * d; }
const jitterAmp = T => clamp(7.5 * Math.sqrt(T / T_LAMBDA), 3, 20);
/** o: {box:[x,y,w,h], cx, cy, T, L, sway, a, rows (filter), drift (px, wraps), coreA} */
function drawField(stage, t, o) {
  const c = stage.ctx, T = stage.theme, lam = lambdaNm(o.T) * FIELD_PX, R = 0.62 * lam, J = jitterAmp(o.T), L = o.L ?? 0, a = o.a ?? 1;
  const [bx, by, bw, bh] = o.box, period = 9 * D_NM * FIELD_PX, list = o.rows ? FIELD.filter(f => o.rows.includes(f.r)) : FIELD;
  const pos = list.map(f => {
    let x = f.x + (o.drift ?? 0); if (o.drift != null) x = ((x + period / 2) % period + period) % period - period / 2;
    const jk = 1 - 0.85 * L;
    return [o.cx + x + J * jk * Math.sin(TAU * f.jf * t + f.jx) + (o.sway ?? 0), o.cy + (o.rowY ? o.rowY(f.r) - f.y : 0) + f.y + J * jk * Math.sin(TAU * f.jf * 1.13 * t + f.jy)];
  });
  withAlpha(c, a, () => clipRect(c, bx, by, bw, bh, 18, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    list.forEach((f, i) => {
      const [x, y] = pos[i], col = mix(f.col, T.accent, L), ph = atomPhase(f, t, L), br = (0.11 + 0.08 * (0.5 + 0.5 * Math.cos(ph))) * (o.haloA ?? 1);
      halo(c, x, y, R, col, br);
      const u = frac(ph / TAU); ring(c, x, y, Math.max(1, lam * 0.5 * (0.25 + 0.75 * u)), rgba(col, 0.32 * (1 - u) * (o.haloA ?? 1)), 2);
    });
    c.restore();
    list.forEach((f, i) => atomCore(c, pos[i][0], pos[i][1], 9, mix(f.col, T.accent, L), o.coreA ?? 1));
    if (o.after) o.after(pos, list);
  }));
  return {pos, list};
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '헬륨을 영하 271도로 식히면'],
  origin: ['기원 · 이름', 'helium ← helios'],
  liquid: ['배경 · 1908년 Leiden', '헬륨을 처음 액체로'],
  lambda: ['현상 · 람다점', '끓던 액체가 잠잠해진다'],
  flow: ['발견 · 1938년', '좁은 틈을 빠져나가는 액체'],
  wave: ['본질 · 양자역학', '원자를 물결로 보면'],
  film: ['현상 · 벽을 타는 막', '그릇을 넘어 흘러나온다'],
  solid: ['오해 바로잡기', '절대영도면 무엇이든 얼까'],
  use: ['쓰임 · LHC · CERN', '자석을 1.9 K로'],
  close: ['정리', '모두가 함께 움직이는 상태'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [P.s04, '기원 · 1868년 일식', '태양에서 먼저 찾은 원소']];
  if (id === 'lambda') return [[-Infinity, ...titles.lambda], [tl.at('s07') - 0.55, '현상 · 람다점', '비열이 λ 모양으로 치솟는다']];
  if (id === 'flow') return [[-Infinity, ...titles.flow], [tl.at('s09') - 0.55, '이름 · Kapitza', '끈적임이 사라진 액체']];
  if (id === 'wave') return [[-Infinity, ...titles.wave], [tl.at('s11') - 0.55, '본질 · 겹치는 물결', '한 덩어리처럼 움직인다'], [P.lanes, '메커니즘 · 마찰', '에너지를 조금씩 잃을 수 없다']];
  if (id === 'film') return [[-Infinity, ...titles.film], [P.pan, '현상 · 분수 효과', '데운 쪽으로 몰려든다']];
  if (id === 'solid') return [[-Infinity, ...titles.solid], [tl.at('s16') - 0.55, '오해 바로잡기', '헬륨은 25기압에서야 고체']];
  if (id === 'use') return [[-Infinity, ...titles.use], [P.s18, '쓰임 · 열을 퍼뜨리는 액체', '끓어오를 틈이 없다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
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
const POSTER_Q = {y: 1000, y2: 1162, q: '헬륨을 영하 271도로 식히면', ans: '벽을 타고 탈출'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 800, 96); ASIZE ||= fit(POSTER_Q.ans, 800, 230);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 870, 0, 1320); g2.addColorStop(0, 'rgba(2,10,12,0)'); g2.addColorStop(0.2, 'rgba(2,10,12,0.74)'); g2.addColorStop(0.8, 'rgba(2,10,12,0.74)'); g2.addColorStop(1, 'rgba(2,10,12,0)');
    c.fillStyle = g2; c.fillRect(0, 870, 1080, 450);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 20, tracking: tr * s1});
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
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/superfluid-helium/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [43.1, 46.0, 52.0, 80.0, 84.0, 88.0, 91.0, 133.0, 134.5, 160.5, 162.0]) h += P.TL(t) + P.TW(t) / 10 + P.lockW(t) + P.PS(t) / 30 + P.lockC(t);
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${P.bubbles.length}/${P.sparks.length}/${P.filmImpacts.length}/${P.rowT.map(x => x.toFixed(3)).join(',')}/${P.touch.toFixed(3)}/${P.lamW.toFixed(3)}/${(P.boilCross ?? 0).toFixed(3)}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  liquid(stage, t, p, ctx) { liquidScene(stage, t, ctx); },
  lambda(stage, t, p, ctx) { lambdaScene(stage, t, ctx); },
  flow(stage, t, p, ctx) { flowScene(stage, t, ctx); },
  wave(stage, t, p, ctx) { waveScene(stage, t, ctx); },
  film(stage, t, p, ctx) { filmScene(stage, t, ctx); },
  solid(stage, t, p, ctx) { solidScene(stage, t, ctx); },
  use(stage, t, p, ctx) { useScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: the poster cup → "절대영도 가까이" → the film climbs and runs down
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3), g = POSTER, G = cupGeom(g);
  posterPicture(stage, t, {a: ef, wire: lerp(1, 0.25, smooth((t - MORPH[0]) / 0.8))});
  if (t < MORPH[1]) return;
  captionShade(c, ef * fadeIn(t, 0.95, 0.4));
  withAlpha(c, ef, () => {
    // temperature scale: 0 K … 300 K, the cup near the left end
    const qa = fadeIn(t, P.zero, 0.45);
    if (qa > 0) withAlpha(c, qa, () => {
      const x0 = 190, x1 = 890, y = 1110, xK = K => x0 + (x1 - x0) * K / 300;
      const gr = c.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, PAL.sf); gr.addColorStop(0.5, '#6FA7B0'); gr.addColorStop(1, PAL.warm);
      rect(c, x0, y - 7, (x1 - x0) * clamp((t - P.zero) / 0.6), 14, 7, gr);
      line(c, [[x0, y - 20], [x0, y + 20]], T.ink, 3); line(c, [[xK(293), y - 16], [xK(293), y + 16]], PAL.warm, 3);
      stage.text('절대영도 0 K', x0, y - 46, {size: 28, weight: 700, color: T.ink, shadow: 'rgba(0,0,0,0.9)'});
      stage.text('실온 약 293 K', x1, y - 46, {size: 28, weight: 700, color: PAL.warm, align: 'right', shadow: 'rgba(0,0,0,0.9)'});
      const qn = fadeIn(t, P.near, 0.4);
      if (qn > 0) withAlpha(c, qn, () => {
        const x = xK(2); glow(c, x, y, 40, PAL.sf, 0.8); circle(c, x, y, 9, '#E9FFFB');
        stage.text('컵 속 헬륨 약 2 K · 영하 271 °C', x0, y + 50, {size: 30, weight: 700, color: T.accent, shadow: 'rgba(0,0,0,0.9)'});
      });
    });
    // s02: the film climbs the inner wall and runs down the outside (arrows on both sides)
    const lv = g.level0 + g.levelRate * t, qc = fadeIn(t, P.climb, 0.35), qo = fadeIn(t, P.outside, 0.35);
    if (qc > 0) withAlpha(c, qc, () => {
      for (const s of [-1, 1]) { const x = g.cx + s * (g.w / 2 - 30); arrow(c, [x, lv - 22], [x, lerp(lv - 22, g.rim + 26, easeOut(clamp((t - P.climb) / 0.6)))], rgba(T.ink, 0.9), 4); }
      stage.text('막이 벽을 타고 올라감', g.cx, 492, {size: 28, weight: 700, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)'});
    });
    if (qo > 0) withAlpha(c, qo, () => {
      for (const s of [-1, 1]) { const x = g.cx + s * (g.w / 2 + g.wt + 26); arrow(c, [x, g.rim + 40], [x, lerp(g.rim + 40, G.yb - 30, easeOut(clamp((t - P.outside) / 0.6)))], rgba(T.ink, 0.9), 4); }
      stage.text('바깥으로', 234, 640, {size: 28, weight: 700, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)'});
      stage.text('흘러내림', 234, 676, {size: 28, weight: 700, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)'});
    });
    tag(stage, '막 두께는 과장해서 그림', 540, 1290, {size: 24, color: T.muted, plate: false, a: qc});
  });
}

// ------------------------------------------------------------------ origin: helium ← helios; 1868 eclipse, the yellow line beside sodium's two
const SPEC = {x0: 190, x1: 890, l0: 580, l1: 596};
const specX = l => SPEC.x0 + (SPEC.x1 - SPEC.x0) * (l - SPEC.l0) / (SPEC.l1 - SPEC.l0);
const specCol = l => { const u = clamp((l - 580) / 16); return u < 0.5 ? mix('#D8F23A', '#FFD21E', u * 2) : mix('#FFD21E', '#FF9420', (u - 0.5) * 2); };
function sunDisk(c, x, y, r, t, a = 1) {
  withAlpha(c, a, () => {
    glow(c, x, y, r * 3.2, '#FFB040', 0.22); glow(c, x, y, r * 1.8, '#FFD27A', 0.35);
    const g = c.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r); g.addColorStop(0, '#FFF6D6'); g.addColorStop(0.6, '#FFD27A'); g.addColorStop(1, '#F59B2A');
    circle(c, x, y, r, g);
    for (let k = 0; k < 16; k++) { const an = k / 16 * TAU + t * 0.05; line(c, [[x + Math.cos(an) * r * 1.12, y + Math.sin(an) * r * 1.12], [x + Math.cos(an) * r * (1.3 + 0.06 * Math.sin(t * 1.3 + k)), y + Math.sin(an) * r * (1.3 + 0.06 * Math.sin(t * 1.3 + k))]], rgba('#FFD27A', 0.5), 4); }
  });
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    // s03: the word card
    const w03 = fadeOut(t, P.s04, 0.4), sx = 540, sy = 560, sr = 120;
    if (t < P.s04 + 0.5) withAlpha(c, w03, () => {
      sunDisk(c, sx, sy, sr, t, fadeIn(t, P.he, 0.5) * (0.75 + 0.25 * fadeIn(t, P.sun, 0.4)));
      if (t > P.sun) glow(c, sx, sy, sr * 2.6, '#FFE7A8', 0.35 * (1 - clamp((t - P.sun) / 1.2)));
      const qa = fadeIn(t, P.he, 0.4);
      if (qa > 0) withAlpha(c, qa, () => {
        const wHe = stage.measure('helium', {role: 'display', weight: 700, size: 104}), wHeli = stage.measure('heli', {role: 'display', weight: 700, size: 104}), x0 = 540 - wHe / 2;
        stage.text('heli', x0, 830, {role: 'display', weight: 700, size: 104, color: PAL.sun});
        stage.text('um', x0 + wHeli, 830, {role: 'display', weight: 700, size: 104, color: T.ink});
        stage.text('헬륨', 540, 912, {size: 34, weight: 700, color: T.muted, align: 'center'});
      });
      const qg = fadeIn(t, P.greek, 0.4);
      if (qg > 0) withAlpha(c, qg, () => {
        stage.text('helios · 그리스어', 540, 1010, {role: 'display', weight: 700, size: 44, color: PAL.sun, align: 'center'});
        const qs = fadeIn(t, P.sun, 0.35); stage.text('= 태양', 540, 1076, {role: 'display', weight: 700, size: 44, color: T.ink, align: 'center', alpha: qs});
      });
      tag(stage, '-ium: 금속 원소 이름의 끝말', 540, 1160, {size: 26, color: T.muted, plate: false, a: fadeIn(t, P.helios, 0.4)});
    });
    // s04: the 1868 eclipse, the prominence light and its spectrum
    const q4 = fadeIn(t, P.s04 + 0.25, 0.45);
    if (q4 > 0) withAlpha(c, q4, () => {
      const ex = 540, ey = 520, er = 112, mq = easeInOut((t - P.moon[0]) / (P.moon[1] - P.moon[0])), tot = fadeIn(t, P.total - 0.15, 0.35);
      // corona and prominences appear at totality
      if (tot > 0) withAlpha(c, tot, () => {
        glow(c, ex, ey, er * 2.6, '#DDEBFF', 0.4); glow(c, ex, ey, er * 1.5, '#FFFFFF', 0.6);
        for (let k = 0; k < 18; k++) { const an = k / 18 * TAU + 0.2 * Math.sin(k * 3.1), L = er * (1.25 + 0.55 * rand(k + 40)); line(c, [[ex + Math.cos(an) * er, ey + Math.sin(an) * er], [ex + Math.cos(an) * L, ey + Math.sin(an) * L]], rgba('#EAF2FF', 0.18), 7); }
        for (const [an, s] of [[-0.35, 0.8], [1.95, 0.6], [2.95, 0.7], [4.4, 0.5]]) {
          const pts = []; for (let k = 0; k <= 20; k++) { const u = k / 20, b = an + (u - 0.5) * 0.36 * s, h = er + Math.sin(Math.PI * u) * 30 * s * (1 + 0.08 * Math.sin(t * 2 + an)); pts.push([ex + Math.cos(b) * h, ey + Math.sin(b) * h]); }
          poly(c, pts, rgba(PAL.prom, 0.55)); glowLine(c, pts, PAL.prom, 3.5, 0.95);
        }
      });
      sunDisk(c, ex, ey, er, t, 1 - tot * 0.85);
      const mx = lerp(ex - 320, ex, mq); circle(c, mx, ey, er * 1.01, '#04090B'); ring(c, mx, ey, er * 1.01, rgba('#2A3A40', 0.8), 2);
      tag(stage, '1868 · 개기 일식', 540, 690, {size: 28, color: T.ink, plate: false, a: fadeIn(t, P.moon[0] + 0.3, 0.4)});
      // light from the top prominence to the spectrum
      const qp = fadeIn(t, P.pattern, 0.4);
      if (qp > 0) withAlpha(c, qp, () => {
        const px = ex + Math.cos(-0.6) * (er + 30), py = ey + Math.sin(-0.6) * (er + 30);
        line(c, [[px, py], [px + 120, py + 40], [specX(587.56), 900]], rgba(PAL.d3, 0.45), 2, {dash: [6, 8]});
        // sunlight strip with the two dark sodium lines
        stage.text('햇빛', SPEC.x0, 788, {size: 26, weight: 700, color: T.muted});
        for (let x = SPEC.x0; x < SPEC.x1; x += 4) rect(c, x, 806, 4.5, 48, 0, specCol(SPEC.l0 + (x - SPEC.x0) / (SPEC.x1 - SPEC.x0) * 16));
        for (const l of [588.995, 589.592]) rect(c, specX(l) - 2.5, 806, 5, 48, 0, '#1A0E04');
        stage.text('나트륨 두 선 · 589 nm', specX(589.3), 788, {size: 26, weight: 700, color: PAL.sodium, align: 'center'});
        // prominence strip: one bright yellow line
        rect(c, SPEC.x0, 890, SPEC.x1 - SPEC.x0, 48, 0, '#07090A'); rect(c, SPEC.x0, 890, SPEC.x1 - SPEC.x0, 48, 0, null, rgba(T.border, 1), 1.5);
        const fl = fadeIn(t, P.first, 0.25), xl = specX(587.56);
        glow(c, xl, 914, 50, PAL.d3, 0.35 + 0.4 * fl * (1 - clamp((t - P.first) / 1.5)) + 0.15); rect(c, xl - 3, 890, 6, 48, 0, PAL.d3);
        stage.text('홍염의 빛', SPEC.x0, 966, {size: 26, weight: 700, color: T.muted});
        withAlpha(c, fl, () => stage.text('D3 · 587 nm · 새 선', xl + 14, 966, {size: 26, weight: 700, color: PAL.d3}));
        for (const l of [585, 590]) stage.text(`${l}`, specX(l), 1004, {size: 24, weight: 500, color: T.muted, align: 'center'});
        stage.text('nm', SPEC.x1, 1004, {size: 24, weight: 500, color: T.muted, align: 'right'});
      });
      // first in the sun, then on the earth
      const qe = fadeIn(t, P.earth, 0.4);
      if (qe > 0) withAlpha(c, qe, () => {
        const y = 1170, xa = 300, xb = 780;
        line(c, [[xa, y], [lerp(xa, xb, easeOut(clamp((t - P.earth - 0.3) / 0.7))), y]], rgba(T.muted, 0.8), 3);
        circle(c, xa, y, 9, PAL.sun); glow(c, xa, y, 34, PAL.sun, 0.5);
        stage.text('1868 · 태양에서', xa, 1122, {role: 'display', weight: 700, size: 32, color: PAL.sun, align: 'center'});
        stage.text('Janssen · Lockyer', xa, 1216, {size: 24, weight: 500, color: T.muted, align: 'center'});
        const qb = fadeIn(t, P.earth + 0.85, 0.4);
        withAlpha(c, qb, () => { circle(c, xb, y, 9, '#7FC4FF'); stage.text('1895 · 지구에서', xb, 1122, {role: 'display', weight: 700, size: 32, color: '#9FD2FF', align: 'center'}); stage.text('Ramsay', xb, 1216, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
      });
    });
  });
}

// ------------------------------------------------------------------ liquid: 1908 Leiden, 293 K → 4.2 K, the first liquid helium in a flask
const FLASK = {cx: 650, cy: 770, r: 185};
function liquidScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), TQ = P.TQ(t);
  withAlpha(c, sf, () => {
    tag(stage, 'Kamerlingh Onnes', 540, 350, {size: 36, color: T.ink, plate: false, role: 'display', a: fadeIn(t, P.onnes, 0.4)});
    // thermometer 0 … 300 K (linear)
    const bx = 300, y0 = 1190, y1 = 440, yK = K => y0 - (y0 - y1) * K / 300;
    rect(c, bx - 10, y1 - 10, 20, y0 - y1 + 20, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 2);
    const gr = c.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, PAL.sf); gr.addColorStop(1, PAL.warm);
    rect(c, bx - 6, yK(TQ), 12, y0 - yK(TQ) + 4, 6, gr);
    glow(c, bx, yK(TQ), 30, TQ < 20 ? PAL.sf : PAL.warm, 0.6);
    line(c, [[bx + 14, yK(293)], [bx + 30, yK(293)]], PAL.warm, 3); stage.text('실온 293 K', bx + 40, yK(293), {size: 26, weight: 700, color: PAL.warm});
    stage.text('0 K', bx - 22, y0, {size: 26, weight: 700, color: T.muted, align: 'right'});
    const q4 = fadeIn(t, P.k4 - 0.1, 0.35);
    withAlpha(c, q4, () => { line(c, [[bx + 14, yK(4.2)], [bx + 30, yK(4.2)]], PAL.sf, 3); stage.text('4.2 K', bx + 40, yK(4.2) - 14, {size: 26, weight: 700, color: T.accent}); });
    // the flask: gas atoms slow down; at 4.2 K droplets condense and run into a pool
    const {cx, cy, r} = FLASK, poolQ = smooth((t - P.pool[0]) / (P.pool[1] - P.pool[0])), poolY = lerp(cy + r - 2, cy + r * 0.52, poolQ);
    clipEllipse(c, cx, cy, r - 4, r - 4, () => {
      if (poolQ > 0) { const lg = c.createLinearGradient(0, poolY, 0, cy + r); lg.addColorStop(0, rgba(PAL.he1, 0.75)); lg.addColorStop(1, rgba('#24506E', 0.85)); rect(c, cx - r, poolY, 2 * r, cy + r - poolY + 4, 0, lg);
        glowLine(c, [[cx - r, poolY], [cx + r, poolY]], PAL.he1, 2, 0.8);
        for (const b of P.gentle) { const age = t - b.t; const y = cy + r - 10 - age * 110; if (age < 0 || y < poolY) continue; circle(c, cx + (b.u - 0.5) * r * 1.2 + 3 * Math.sin(age * 9 + b.v * 6), y, 2.5 + 3 * b.w, rgba('#E8F6FF', 0.7)); }
      }
      // gas atoms
      const n = 18, thermal = Math.sqrt(TQ / 293);
      for (let i = 0; i < n; i++) {
        const gone = clamp((t - lerp(P.pool[0], P.pool[1], i / n)) / 0.5); if (gone >= 1) continue;
        const ph = phaseTQ(P, t) * (0.8 + 0.4 * rand(i + 3)), x = cx + (r - 30) * Math.sin(ph * 1.7 + i * 2.1) * Math.cos(ph * 0.6 + i), y = cy + (r - 30) * Math.sin(ph * 1.3 + i * 1.3) * 0.9;
        const yy = Math.min(y, poolY - 12); atomCore(c, x, lerp(yy, poolY, gone), 7, PAL.he1, (1 - gone) * (0.5 + 0.5 * thermal + 0.3));
      }
      // condensing droplets
      for (const d of P.condense) {
        const u = (t - d.t0) / d.d; if (u < 0 || u > 1) continue;
        const a0 = d.side > 0 ? -1.1 + 0.5 * d.r : -Math.PI + 1.1 - 0.5 * d.r, a1 = d.side > 0 ? 0.5 : Math.PI - 0.5, aa = lerp(a0, a1, easeIn(u));
        circle(c, cx + (r - 9) * Math.cos(aa), Math.min(poolY, cy + (r - 9) * Math.sin(aa)), 5, rgba('#DFF1FF', 0.9));
      }
    });
    // glass flask (bulb + neck)
    ring(c, cx, cy, r, rgba(PAL.glass, 0.6), 4, -Math.PI / 2 + 0.2, 3 * Math.PI / 2 - 0.2);
    line(c, [[cx - r * Math.sin(0.2), cy - r * Math.cos(0.2)], [cx - 36, cy - r - 90]], rgba(PAL.glass, 0.6), 4); line(c, [[cx + r * Math.sin(0.2), cy - r * Math.cos(0.2)], [cx + 36, cy - r - 90]], rgba(PAL.glass, 0.6), 4);
    ring(c, cx - r * 0.35, cy - r * 0.3, r * 0.55, rgba('#FFFFFF', 0.16), 6, Math.PI * 1.05, Math.PI * 1.45);
    // readout
    stage.text(fmtK(TQ), cx, 1040, {role: 'display', weight: 700, size: 64, color: TQ < 20 ? T.accent : T.ink, align: 'center'});
    stage.text(fmtC(TQ), cx, 1102, {size: 32, weight: 700, color: T.muted, align: 'center', alpha: TQ < 273 ? 1 : 0.7});
    tag(stage, '시간 압축', cx, 1160, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.cool0, 0.4) * fadeOut(t, P.k4 + 1.2, 0.4)});
    tag(stage, '액체 헬륨', cx, FLASK.cy + FLASK.r * 0.78, {size: 28, color: '#E6F4FF', plate: true, plateA: 0.55, a: fadeIn(t, P.firstL, 0.4)});
  });
}
const phaseTQ = (P, t) => { // ∫ √(T/293) dt (thermal clock of the gas atoms)
  if (!P._ph) { const t0 = P.y1908 - 3, d = 1 / 60, n = 1500, arr = new Float64Array(n); for (let i = 1; i < n; i++) arr[i] = arr[i - 1] + Math.sqrt(P.TQ(t0 + i * d) / 293) * d * 2.2; P._ph = {t0, d, n, arr}; }
  const {t0, d, n, arr} = P._ph, u = clamp((t - t0) / d, 0, n - 1.001), i = Math.floor(u); return lerp(arr[i], arr[i + 1], u - i);
};

// ------------------------------------------------------------------ lambda: pumping 4.2 K → 2.17 K, boiling stops; C(T) traces the λ
const DEW = {x0: 270, x1: 670, top: 400, bot: 900};
const L_LEVEL = 520;
const GR = {x0: 190, x1: 890, y0: 1280, y1: 1046, T0: 1.0, T1: 4.4, cMax: 7.6};
const grX = T => GR.x0 + (GR.x1 - GR.x0) * (T - GR.T0) / (GR.T1 - GR.T0), grY = C => GR.y0 - (GR.y0 - GR.y1) * clamp(C / GR.cMax, 0, 1.02);
function lambdaScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), TL = P.TL(t);
  const act = clamp(boilRate(TL, BOIL.vigorous) / BOIL.vigorous) * (t < P.pump ? 0.45 : 1);
  withAlpha(c, sf, () => {
    // dewar: double-walled glass
    const {x0, x1, top, bot} = DEW, cxd = (x0 + x1) / 2;
    rect(c, x0 - 22, top, x1 - x0 + 44, bot - top + 22, 30, rgba(PAL.glass, 0.08), rgba(PAL.glass, 0.45), 2);
    rect(c, x0, top + 10, x1 - x0, bot - top, 22, null, rgba(PAL.glass, 0.4), 2);
    const waves = x => (5 * Math.sin(x / 23 + t * 9) + 3 * Math.sin(x / 11 - t * 13)) * act;
    const surf = []; for (let x = x0; x <= x1; x += 8) surf.push([x, L_LEVEL + waves(x)]);
    clipRect(c, x0, top + 10, x1 - x0, bot - top, 22, () => {
      const lg = c.createLinearGradient(0, L_LEVEL, 0, bot); lg.addColorStop(0, rgba(TL > T_LAMBDA ? PAL.he1 : PAL.sf, 0.6)); lg.addColorStop(1, rgba('#123C48', 0.85));
      poly(c, [...surf, [x1, bot + 20], [x0, bot + 20]], lg);
      if (TL <= T_LAMBDA) { const mq = fadeIn(t, P.lam, 0.5); withAlpha(c, mq, () => { const rg = c.createLinearGradient(0, L_LEVEL, 0, L_LEVEL + 70); rg.addColorStop(0, 'rgba(230,255,250,0.32)'); rg.addColorStop(1, 'rgba(230,255,250,0)'); rect(c, x0, L_LEVEL, x1 - x0, 70, 0, rg); }); }
      const kill = 1 - smooth((t - P.lam) / 0.25);
      for (const b of P.bubbles) {
        if (t < b.t || t > b.ts) continue; const age = t - b.t, y = b.y0 - b.vr * age, rr = (b.rad + age * 6) * (t > P.lam ? kill : 1); if (rr <= 0.3) continue;
        const x = b.x + 6 * Math.sin(age * 8 + b.u * 9); ring(c, x, y, rr, rgba('#EAFBFF', 0.75), 1.6); circle(c, x - rr * 0.3, y - rr * 0.3, rr * 0.25, rgba('#FFFFFF', 0.7));
      }
      for (const b of P.bubbles) { const age = t - b.ts; if (age < 0 || age > 0.22 || b.ts > P.lam) continue; ring(c, b.x, L_LEVEL - 2, 4 + 30 * age, rgba('#EAFBFF', 0.6 * (1 - age / 0.22)), 2); }
    });
    glowLine(c, surf, TL > T_LAMBDA ? PAL.he1 : PAL.sf, 2.2, 0.9);
    // pump neck and vapour
    const nx = cxd; rect(c, nx - 22, 330, 44, top - 330 + 12, 6, rgba(T.plate, 0.9), rgba(T.border, 1), 2);
    const qp = fadeIn(t, P.pump, 0.4);
    if (qp > 0) withAlpha(c, qp, () => {
      const rate = t < P.lam ? 1 : 0.45;
      for (let k = 0; k < 10; k++) { const u = frac(k / 10 + t * 1.2 * rate), y = lerp(L_LEVEL - 10, 330, u), x = nx + 18 * Math.sin(k * 2.3 + t * 3) * (1 - u); if (y > 400 || Math.abs(x - nx) < 18) circle(c, x, y, 3.2, rgba('#DFF6F2', 0.5 * Math.sin(Math.PI * u))); }
      arrow(c, [nx + 30, 372], [nx + 92, 340], rgba(T.ink, 0.85), 3);
      stage.text('펌프로 증기를 빼냄', nx + 104, 342, {size: 26, weight: 700, color: T.ink});
    });
    withAlpha(c, fadeIn(t, P.calm, 0.35), () => stage.text('끓음이 갑자기 멈춤', cxd, 466, {size: 30, weight: 700, color: T.accent, align: 'center', shadow: 'rgba(0,0,0,0.8)'}));
    // thermometer 1.0 … 4.5 K
    const tx = 812, ty0 = 850, ty1 = 430, yT = K => ty0 - (ty0 - ty1) * (K - 1) / 3.5;
    rect(c, tx - 10, ty1 - 10, 20, ty0 - ty1 + 20, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 2);
    const tg = c.createLinearGradient(0, ty0, 0, ty1); tg.addColorStop(0, PAL.sf); tg.addColorStop(1, PAL.he1); rect(c, tx - 6, yT(TL), 12, ty0 - yT(TL) + 4, 6, tg);
    glow(c, tx, yT(TL), 28, TL > T_LAMBDA ? PAL.he1 : PAL.sf, 0.7);
    line(c, [[tx + 14, yT(4.2)], [tx + 28, yT(4.2)]], T.muted, 3); stage.text('4.2 K', tx + 36, yT(4.2), {size: 24, weight: 700, color: T.muted});
    withAlpha(c, fadeIn(t, P.mark217, 0.35), () => { line(c, [[tx - 28, yT(T_LAMBDA)], [tx + 28, yT(T_LAMBDA)]], T.accent, 3); stage.text('2.17 K', tx + 36, yT(T_LAMBDA), {size: 26, weight: 700, color: T.accent}); });
    stage.text(TL.toFixed(2) + ' K', tx, 898, {role: 'display', weight: 700, size: 42, color: TL > T_LAMBDA ? T.ink : T.accent, align: 'center'});
    tag(stage, '시간 압축', tx, 944, {size: 24, color: T.muted, plate: false, a: qp});
    // C(T) graph: the dot follows the liquid's temperature and leaves the curve behind it
    const qg = fadeIn(t, P.pump - 0.2, 0.5);
    if (qg > 0) withAlpha(c, qg, () => {
      line(c, [[GR.x0, GR.y1 - 20], [GR.x0, GR.y0], [GR.x1, GR.y0]], rgba(T.muted, 0.8), 2);
      for (const K of [1, 2, 3, 4]) { line(c, [[grX(K), GR.y0], [grX(K), GR.y0 + 8]], T.muted, 2); stage.text(`${K} K`, grX(K), GR.y0 + 30, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
      stage.text('열을 담는 능력 (비열)', GR.x0, GR.y1 - 44, {size: 26, weight: 700, color: T.ink, alpha: 0.6 + 0.4 * fadeIn(t, P.heat7, 0.3)});
      tag(stage, '모형 곡선', GR.x1, GR.y1 - 44, {size: 24, color: T.muted, plate: false, align: 'right'});
      const pts = []; const Tn = Math.max(TL, GR.T0);
      for (let k = 0; k <= 160; k++) { const u = k / 160, TT = lerp(T_BOIL, Tn, u); pts.push([grX(TT), grY(heatCap(TT))]); }
      // densify around the peak
      if (Tn < T_LAMBDA) { pts.length = 0; const seg = (a, b, n) => { for (let k = 0; k <= n; k++) { const TT = lerp(a, b, k / n); pts.push([grX(TT), grY(heatCap(TT))]); } }; seg(T_BOIL, T_LAMBDA + 0.002, 120); seg(T_LAMBDA - 0.002, Tn, 120); }
      glowLine(c, pts, T.accent, 3, 0.9);
      const dp = [grX(Tn), grY(heatCap(Tn))]; glow(c, dp[0], dp[1], 30, T.accent, 0.7); circle(c, dp[0], dp[1], 8, '#FFFFFF');
      // the Greek letter beside the peak, then the name
      const ql = fadeIn(t, P.greekL, 0.4);
      if (ql > 0) withAlpha(c, ql, () => stage.text('λ', 770, 1112, {role: 'display', weight: 700, size: 130, color: rgba(T.accent, 0.9), align: 'center', shadow: 'rgba(0,0,0,0.6)'}));
      const qn = fadeIn(t, P.lpoint, 0.4);
      if (qn > 0) withAlpha(c, qn, () => {
        stage.text('λ점 · 2.17 K', grX(T_LAMBDA) + 18, GR.y1 + 4, {size: 30, weight: 700, color: T.accent});
        stage.text('헬륨 II', grX(1.55), GR.y0 - 40, {size: 26, weight: 700, color: T.accent, align: 'center'});
        stage.text('헬륨 I', grX(3.4), GR.y0 - 62, {size: 26, weight: 700, color: PAL.he1, align: 'center'});
        line(c, [[grX(T_LAMBDA), GR.y0], [grX(T_LAMBDA), GR.y1 + 24]], rgba(T.accent, 0.5), 2, {dash: [5, 6]});
      });
    });
  });
}

// ------------------------------------------------------------------ flow: 1938, the narrow gap — He I barely seeps, He II pours
const FCOL = [{x: 320, T: 2.5, name: '헬륨 I · 2.5 K', col: PAL.he1, lev: levelI}, {x: 760, T: 1.8, name: '헬륨 II · 1.8 K', col: PAL.sf, lev: levelII}];
const FR = {top: 500, bot: 690, w: 230, gap: 46, cTop: 830, cBot: 1000};
function flowScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), s = t - P.flow0;
  withAlpha(c, sf, () => {
    // who and the name
    const qn = fadeIn(t, P.moscow, 0.4) * fadeOut(t, P.visc - 0.2, 0.35);
    if (qn > 0) withAlpha(c, qn, () => {
      stage.text('Kapitza · 모스크바', 540, 352, {role: 'display', weight: 700, size: 34, color: T.ink, align: 'center'});
      withAlpha(c, fadeIn(t, P.camb, 0.4), () => stage.text('Allen · Misener · 케임브리지', 540, 400, {role: 'display', weight: 700, size: 34, color: T.ink, align: 'center'}));
    });
    const qs = fadeIn(t, P.name, 0.45);
    if (qs > 0) withAlpha(c, qs, () => { stage.text('superfluid · 초유체', 540, 362, {role: 'display', weight: 700, size: 56, color: T.accent, align: 'center', shadow: 'rgba(0,0,0,0.7)'}); });
    for (const col of FCOL) {
      const x = col.x, h = col.lev(s), II = col.lev === levelII, rate = II ? (h > 0 && s > 0 ? 1 : 0) : 0;
      stage.text(col.name, x, 460, {size: 30, weight: 700, color: col.col, align: 'center'});
      // reservoir
      const rx0 = x - FR.w / 2, lv = lerp(FR.bot - 8, FR.top + 24, h);
      rect(c, rx0, FR.top, FR.w, FR.bot - FR.top, 14, rgba(PAL.glass, 0.07), rgba(PAL.glass, 0.5), 2);
      clipRect(c, rx0 + 2, FR.top, FR.w - 4, FR.bot - FR.top - 2, 12, () => { const lg = c.createLinearGradient(0, lv, 0, FR.bot); lg.addColorStop(0, rgba(col.col, 0.65)); lg.addColorStop(1, rgba(mix(col.col, '#0A2A30', 0.6), 0.85)); rect(c, rx0, lv, FR.w, FR.bot - lv, 0, lg); if (h > 0.01) glowLine(c, [[rx0, lv], [rx0 + FR.w, lv]], col.col, 2, 0.8); });
      // the narrow gap (two blocks)
      const gy0 = FR.bot, gy1 = FR.bot + FR.gap;
      rect(c, x - 70, gy0, 66, FR.gap, 4, '#2B3A40', rgba(T.border, 1), 1.5); rect(c, x + 4, gy0, 66, FR.gap, 4, '#2B3A40', rgba(T.border, 1), 1.5);
      if (II && rate) { line(c, [[x, gy0], [x, gy1]], rgba(col.col, 0.95), 4); }
      // stream / drips into the collector
      const cl = II ? 1 - h : 1 - h;                                        // drained fraction
      const cy0 = FR.cTop, cy1 = FR.cBot, clv = lerp(cy1 - 6, cy1 - 6 - (cy1 - cy0 - 30) * 1.0, cl);
      if (II && rate) { glowLine(c, [[x, gy1], [x, clv]], col.col, 4, 0.9); for (let k = 0; k < 8; k++) { const u = frac(k / 8 + t * 2.4), y = lerp(gy1, clv, u); circle(c, x, y, 2.6, rgba('#FFFFFF', 0.8)); } }
      if (!II) for (const td of P.dropsI) { const a = t - td; if (a < 0 || a > 0.5) continue; const y = gy1 + 0.5 * 2600 * a * a; if (y < clv) { circle(c, x, y, 5, rgba(col.col, 0.95)); } else if (a < 0.5) ring(c, x, clv, 6 + 40 * (a - Math.sqrt(2 * (clv - gy1) / 2600)), rgba(col.col, 0.6), 2); }
      if (!II && s > 0) { const nx = P.dropsI.find(td => td > t), pv = [P.flow0, ...P.dropsI].filter(td => td <= t).at(-1); if (nx) { const grow = clamp((t - pv) / (nx - pv)); circle(c, x, gy1 + 2 + 2 * grow, 1.5 + 3.5 * grow, rgba(col.col, 0.9)); } }
      rect(c, x - 90, cy0, 180, cy1 - cy0, 12, rgba(PAL.glass, 0.07), rgba(PAL.glass, 0.5), 2);
      clipRect(c, x - 88, cy0, 176, cy1 - cy0 - 2, 10, () => { if (cl > 0.002) { rect(c, x - 90, clv, 180, cy1 - clv, 0, rgba(col.col, 0.55)); glowLine(c, [[x - 90, clv], [x + 90, clv]], col.col, 2, 0.7); } });
    }
    // labels between the columns
    const qg = fadeIn(t, P.narrow, 0.35);
    if (qg > 0) withAlpha(c, qg, () => { stage.text('아주 좁은 틈', 540, FR.bot + FR.gap / 2, {size: 28, weight: 700, color: T.ink, align: 'center'}); arrow(c, [460, FR.bot + 23], [400, FR.bot + 23], rgba(T.ink, 0.8), 3); arrow(c, [620, FR.bot + 23], [680, FR.bot + 23], rgba(T.ink, 0.8), 3); });
    tag(stage, '거의 저항 없이', 760, 1036, {size: 26, color: T.accent, a: fadeIn(t, P.nores, 0.35) * fadeOut(t, P.visc - 0.4, 0.3), plateA: 0.75});
    tag(stage, '끈적임 ≈ 0', 760, 1036, {size: 28, color: T.accent, a: fadeIn(t, P.visc, 0.35), plateA: 0.75});
    tag(stage, '거의 못 지나감', 320, 1036, {size: 26, color: PAL.he1, a: fadeIn(t, P.nores + 0.4, 0.35), plateA: 0.75});
    // graph: drained amount vs time
    const gx0 = 200, gx1 = 900, gy0 = 1290, gy1 = 1110, win = 12;
    const qa = fadeIn(t, P.flow0 - 0.4, 0.4);
    if (qa > 0) withAlpha(c, qa, () => {
      line(c, [[gx0, gy1 - 10], [gx0, gy0], [gx1, gy0]], rgba(T.muted, 0.8), 2);
      stage.text('흘러나간 양', gx0, gy1 - 34, {size: 26, weight: 700, color: T.ink});
      stage.text('시간 →', gx1, gy0 + 28, {size: 24, weight: 500, color: T.muted, align: 'right'});
      for (const col of FCOL) {
        const pts = []; for (let u = 0; u <= Math.min(win, s); u += 0.05) pts.push([gx0 + (gx1 - gx0) * u / win, gy0 - (gy0 - gy1) * (1 - col.lev(u))]);
        if (pts.length > 1) glowLine(c, pts, col.col, 3, 0.9);
        if (pts.length) { const pe = pts.at(-1); circle(c, pe[0], pe[1], 6, '#FFFFFF'); }
      }
      tag(stage, '시간 압축', gx1, gy1 - 34, {size: 24, color: T.muted, plate: false, align: 'right'});
    });
  });
}

// ------------------------------------------------------------------ wave: the instrument panel (temperature knob → λ vs spacing → one rhythm), then the wall
const WBOX = [150, 340, 780, 560], WC = [540, 620];
const CLOCKS = [10, 13, 20, 23, 29, 31, 38];
const LANES = [{y0: 340, h: 268, T: 2.5, L: 0, name: '람다점 위 · 따로따로'}, {y0: 632, h: 268, T: 1.2, L: 1, name: '람다점 아래 · 한 덩어리'}];
export const LANE = {v0: 150, tau: 2.4, bump: 90, b0: 162};
const laneX = (P, t, k) => { const s = Math.max(0, t - P.go12); return k === 0 ? LANE.v0 * LANE.tau * (1 - Math.exp(-s / LANE.tau)) : LANE.v0 * s; };
/** sparks in the top lane: a bottom-row atom passing over a bump of the wall while the lane still moves (screen times) */
function laneSparks(t0, t1) {
  const out = [], period = 9 * D_NM * FIELD_PX, Xmax = LANE.v0 * LANE.tau;
  for (const f of FIELD.filter(q => q.r === 1)) for (let m = -1; m <= 1; m++) for (let j = 0; LANE.b0 + j * LANE.bump < 930; j++) {
    // atom screen x = 540 + wrap(f.x + X) meets the bump at b0 + j·bump
    const X = (LANE.b0 + j * LANE.bump - 540) + m * period - f.x; if (X <= 0 || X >= Xmax * 0.985) continue;
    const tt = t0 - LANE.tau * Math.log(1 - X / Xmax); if (tt > t1) continue;
    out.push({t: +tt.toFixed(4), x: LANE.b0 + j * LANE.bump, k: f.k});
  }
  return out.sort((a, b) => a.t - b.t);
}
function waveScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), TW = P.TW(t), L = P.lockW(t), lam = lambdaNm(TW);
  const pa = fadeOut(t, P.lanes, 0.4), pb = fadeIn(t, P.lanes + 0.42, 0.45);
  withAlpha(c, sf, () => {
    if (pa > 0) withAlpha(c, pa, () => {
      const [bx, by, bw, bh] = WBOX; rect(c, bx, by, bw, bh, 18, rgba('#04121A', 0.75), rgba(T.border, 1), 2);
      const sway = 24 * Math.sin(TAU * 0.42 * (t - P.lump)) * smooth((t - P.lump) / 0.8);
      drawField(stage, t, {box: WBOX, cx: WC[0], cy: WC[1], T: TW, L, sway, haloA: fadeIn(t, P.waveOn, 0.6)});
      tag(stage, '설명 모형', bx + 18, by + 30, {size: 24, color: T.muted, align: 'left', plateA: 0.7});
      withAlpha(c, fadeIn(t, P.touch - 0.1, 0.3) * fadeOut(t, P.lamW + 0.6, 0.4), () => tag(stage, '이웃 원자와 물결이 겹침', bx + bw - 18, by + 30, {size: 26, color: T.ink, align: 'right', plateA: 0.75}));
      withAlpha(c, fadeIn(t, P.lamW + 1.05, 0.4), () => tag(stage, '같은 가장 낮은 상태 · 같은 박자', bx + bw - 18, by + 30, {size: 26, color: T.accent, align: 'right', plateA: 0.75}));
      withAlpha(c, fadeIn(t, P.lump, 0.4), () => tag(stage, '한 덩어리처럼 함께 움직임', 540, by + bh - 30, {size: 26, color: T.accent, plateA: 0.75}));
      // instruments: temperature knob, λ vs d bars, the rhythm clocks
      const qi = fadeIn(t, P.qm, 0.5);
      if (qi > 0) withAlpha(c, qi, () => {
        const lq = K => (Math.log(20) - Math.log(K)) / Math.log(20);
        stage.text('온도 (조절)', 290, 980, {size: 26, weight: 700, color: T.ink, align: 'center'});
        dial(stage, 290, 1135, 108, lq(TW), {grad: [PAL.warm, PAL.sf], ticks: [[0, '20 K'], [lq(T_LAMBDA), '', T.accent], [1, '1 K']], col: TW > T_LAMBDA ? '#FFFFFF' : T.accent});
        { const ta = 150 * Math.PI / 180 + 240 * Math.PI / 180 * lq(T_LAMBDA); stage.text('2.17 K', 290 + 124 * Math.cos(ta) + 4, 1135 + 124 * Math.sin(ta) - 14, {size: 24, weight: 700, color: T.accent, align: 'left'}); }
        stage.text(TW >= 10 ? `${TW.toFixed(1)} K` : `${TW.toFixed(2)} K`, 290, 1140, {role: 'display', weight: 700, size: 34, color: TW > T_LAMBDA ? T.ink : T.accent, align: 'center'});
        const bx0 = 470, bx1 = 900, sc = (bx1 - bx0) / 0.9, rowsY = [1018, 1108];
        stage.text('물결 크기 λ', bx0, rowsY[0] - 22, {size: 26, weight: 700, color: T.ink}); stage.text(`${lam.toFixed(2)} nm`, 920, rowsY[0] - 22, {role: 'display', size: 28, weight: 700, color: lam > D_NM ? T.accent : T.ink, align: 'right'});
        stage.text('원자 간격 d', bx0, rowsY[1] - 22, {size: 26, weight: 700, color: T.ink}); stage.text(`${D_NM.toFixed(2)} nm`, 920, rowsY[1] - 22, {role: 'display', size: 28, weight: 700, color: T.muted, align: 'right'});
        for (const y of rowsY) rect(c, bx0, y, bx1 - bx0, 24, 6, rgba(T.border, 0.8));
        rect(c, bx0, rowsY[0], Math.min(bx1 - bx0, sc * lam), 24, 6, lam > D_NM ? T.accent : PAL.he1); rect(c, bx0, rowsY[1], sc * D_NM, 24, 6, PAL.neutral);
        line(c, [[bx0 + sc * D_NM, rowsY[0] - 6], [bx0 + sc * D_NM, rowsY[1] + 30]], rgba('#FFFFFF', 0.55), 2, {dash: [5, 5]});
        stage.text('물결의 박자', bx0, 1190, {size: 26, weight: 700, color: T.ink});
        if (L > 0.6) stage.text('맞춰짐', 920, 1190, {size: 26, weight: 700, color: T.accent, align: 'right', alpha: smooth((L - 0.6) / 0.2)});
        CLOCKS.forEach((k, i) => { const f = FIELD[k], x = 492 + i * 68, y = 1258, ph = atomPhase(f, t, L), col = mix(f.col, T.accent, L);
          circle(c, x, y, 25, rgba('#06161C', 0.9)); ring(c, x, y, 25, rgba(col, 0.8), 2.5); line(c, [[x, y], [x + 19 * Math.cos(ph - Math.PI / 2), y + 19 * Math.sin(ph - Math.PI / 2)]], col, 4); circle(c, x, y, 3.5, col); });
      });
    });
    // s12: two lanes over a rough wall
    if (pb > 0) withAlpha(c, pb, () => {
      LANES.forEach((ln, k) => {
        const {y0, h} = ln, floor = y0 + h - 22, X = laneX(P, t, k);
        rect(c, 150, y0, 780, h, 18, rgba('#04121A', 0.75), rgba(T.border, 1), 2);
        drawField(stage, t, {box: [150, y0, 780, h], cx: 540, cy: 0, T: ln.T, L: ln.L, drift: X, rows: [1, 2], rowY: r => floor - 62 - (r - 1) * 94});
        // the rough wall: bumps along the floor; warm glow where a spark hit it
        clipRect(c, 150, y0, 780, h, 18, () => {
          rect(c, 150, floor, 780, 30, 0, '#26343A');
          for (let x = LANE.b0; x < 930; x += LANE.bump) { poly(c, arcPts(x, floor + 2, 12, Math.PI, 2 * Math.PI, 8), '#33464D'); }
          if (k === 0) for (const s of P.sparks) { const a = t - s.t; if (a < 0 || a > 0.7) continue; const bxp = s.x; glow(c, bxp, floor + 4, 46, PAL.heat, 0.65 * (1 - a / 0.7)); if (a < 0.3) arrow(c, [bxp, floor - 34], [bxp, floor + 2], rgba(PAL.heat, 0.9 * (1 - a / 0.3)), 3); }
        });
        tag(stage, ln.name, 170, y0 + 30, {size: 26, color: k ? T.accent : PAL.neutral, align: 'left', plateA: 0.75});
        tag(stage, k ? '마찰 없음 · 그대로 흐름' : '벽에 에너지를 조금씩 잃음', 910, y0 + 30, {size: 26, color: k ? T.accent : PAL.heat, align: 'right', plateA: 0.75, a: fadeIn(t, k ? P.fric : P.lose, 0.4)});
      });
      tag(stage, '설명 모형', 540, 930 - 4, {size: 24, color: T.muted, plate: false});
      // speed trace
      const gx0 = 200, gx1 = 900, gy0 = 1290, gy1 = 1040, win = 7.5, s = t - P.go12;
      line(c, [[gx0, gy1 - 10], [gx0, gy0], [gx1, gy0]], rgba(T.muted, 0.8), 2);
      stage.text('흐름 빠르기', gx0, gy1 - 40, {size: 26, weight: 700, color: T.ink});
      stage.text('시간 →', gx1, gy0 + 28, {size: 24, weight: 500, color: T.muted, align: 'right'});
      LANES.forEach((ln, k) => {
        const pts = []; for (let u = 0; u <= clamp(s, 0, win); u += 0.05) pts.push([gx0 + (gx1 - gx0) * u / win, gy0 - (gy0 - gy1) * 0.85 * (k ? 1 : Math.exp(-u / LANE.tau))]);
        if (pts.length > 1) glowLine(c, pts, k ? T.accent : PAL.neutral, 3, 0.9);
        if (pts.length) circle(c, pts.at(-1)[0], pts.at(-1)[1], 6, '#FFFFFF');
      });
      withAlpha(c, fadeIn(t, P.lose, 0.4), () => stage.text('따로따로: 느려짐', gx1, gy0 - 40, {size: 24, weight: 700, color: PAL.neutral, align: 'right'}));
      withAlpha(c, fadeIn(t, P.fric, 0.4), () => stage.text('한 덩어리: 그대로', gx1, gy1 + 4, {size: 24, weight: 700, color: T.accent, align: 'right'}));
    });
  });
}

// ------------------------------------------------------------------ film: the 30 nm film climbs over the rim and drips; then the fountain
function filmFront(P, t, Ltot, L1) {
  const [a, b, d] = P.front;
  if (t <= a) return 0; if (t <= b) return L1 * easeInOut((t - a) / (b - a)) * 0.98 + 0.02 * L1 * clamp((t - a) / (b - a));
  if (t <= d) return L1 + (Ltot - L1) * easeIn(clamp((t - b) / (d - b))) ** 0.8; return Infinity;
}
function filmScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), g = FILMCUP;
  const pa = fadeOut(t, P.pan, 0.45), pb = fadeIn(t, P.pan + 0.42, 0.5);
  withAlpha(c, sf, () => {
    if (pa > 0) withAlpha(c, pa, () => {
      const lv = g.level0 + g.levelRate * Math.max(0, t - P.front[2]), G = cupGeom(g), half = G.film(lv), Lh = plen(half), L1 = lv - 6 - g.rim;
      const front = filmFront(P, t, Lh.at(-1), L1), done = front === Infinity;
      glow(c, g.cx, 700, 560, '#1D6F6A', 0.12);
      line(c, [[G.xL - g.wt / 2, g.rim - 6], [g.cx, -40]], rgba('#9FB7BC', 0.1), 2); line(c, [[G.xR + g.wt / 2, g.rim - 6], [g.cx, -40]], rgba('#9FB7BC', 0.1), 2);
      vapour(c, t, 160, 900, 760, g.bath + 30, 8, 0.8);
      const ripples = done ? drawDrips(stage, g, g.bath, t, FILM_DRIP.period, P.firstDrip, 1, {kMin: 0, grow0: clamp((t - P.front[2]) / (P.firstDrip - P.front[2]))}) : [];
      drawBath(stage, g.bath, t, ripples, 1);
      drawCup(stage, g, {level: lv, front, flowT: t, flow: done ? g.flow : 0, filmW: 4.5});
      // first level (dashed) once the level starts to fall
      withAlpha(c, fadeIn(t, P.front[2] + 0.6, 0.4), () => { line(c, [[G.xL + 16, g.level0], [G.xR - 16, g.level0]], rgba('#FFFFFF', 0.45), 2, {dash: [8, 8]}); stage.text('처음 수위', G.xL + 22, g.level0 - 22, {size: 24, weight: 700, color: T.muted}); });
      tag(stage, '시간 압축', g.cx, G.yb + 70, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.front[0], 0.4)});
      { const qu = fadeIn(t, P.front[1] - 0.6, 0.35), qd = fadeIn(t, P.front[1] + 0.3, 0.35), xi = G.xL + 28, xo = G.xL - g.wt - 30;
        if (qu > 0) withAlpha(c, qu, () => arrow(c, [xi, lv - 24], [xi, lerp(lv - 24, g.rim + 30, easeOut(clamp((t - P.front[1] + 0.6) / 0.6)))], rgba(T.ink, 0.85), 4));
        if (qd > 0) withAlpha(c, qd, () => arrow(c, [xo, g.rim + 30], [xo, lerp(g.rim + 30, G.yb - 30, easeOut(clamp((t - P.front[1] - 0.3) / 0.7)))], rgba(T.ink, 0.85), 4)); }
      // loupe on the right rim
      const ql = fadeIn(t, P.hair, 0.45);
      if (ql > 0) withAlpha(c, ql, () => {
        const LX = 775, LY = 500, LR = 108, ax = G.xR + g.wt / 2, ay = g.rim, k = 2.0;
        line(c, [[ax + 12, ay - 10], [LX - LR * 0.86, LY - LR * 0.5]], rgba('#FFFFFF', 0.5), 2);
        ring(c, ax, ay, 26, rgba('#FFFFFF', 0.5), 2);
        circle(c, LX, LY, LR, rgba('#041318', 0.92));
        clipEllipse(c, LX, LY, LR - 3, LR - 3, () => {
          c.save(); c.translate(LX, LY + 10); c.scale(k, k); c.translate(-ax, -ay - 20);
          drawCup(stage, g, {level: lv, front, flowT: t, flow: done ? g.flow * 0.5 : 0, filmW: 4.5, a: 1});
          c.restore();
          // thickness arrows across the inner film (in loupe space)
          const fx = LX + (G.xR - 3 - ax) * k, fy = LY + 10 + (g.rim + 35 - ay - 20) * k;
          if (front > L1 * 0.78 || done) { arrow(c, [fx - 34, fy], [fx - 8, fy], '#FFFFFF', 2.5, {head: 9}); arrow(c, [fx + 34, fy], [fx + 8, fy], '#FFFFFF', 2.5, {head: 9}); }
        });
        ring(c, LX, LY, LR, rgba('#E8FFFB', 0.85), 4);
        stage.text('막 두께 약 30 nm', LX, LY + LR + 34, {size: 28, weight: 700, color: T.accent, align: 'center'});
        withAlpha(c, fadeIn(t, P.thou, 0.4), () => { stage.text('머리카락 굵기의', LX, LY + LR + 70, {size: 24, weight: 700, color: T.ink, align: 'center'}); stage.text('수천분의 일', LX, LY + LR + 100, {size: 24, weight: 700, color: T.ink, align: 'center'}); });
        stage.text('확대 그림', LX, LY - LR - 20, {size: 24, weight: 700, color: T.muted, align: 'center'});
      });
    });
    if (pb > 0) withAlpha(c, pb, () => fountain(stage, t, P));
  });
}
const FT = {x: 540, top: 760, nozzle: 700, bot: 1300, w: 80, powder: [1110, 1300], bath: 1240};
function fountain(stage, t, P) {
  const c = stage.ctx, T = stage.theme, s = t - P.heatOn, H = fountH(s), on = s > 0 ? 1 : 0, dT = s > 0 ? 1 - Math.exp(-s / FOUNT.tau) : 0;
  glow(c, 540, 900, 600, '#1D6F6A', 0.12);
  vapour(c, t, 160, 920, 800, FT.bath + 30, 8, 0.8);
  // jet particles (ballistic; launch speed from the jet height at launch)
  const g = DRIP.g, jetPts = [];
  const RATE = 72, n0 = Math.floor(t * RATE);
  for (let k = 0; k < 100; k++) {
    const n = n0 - k, tl0 = n / RATE, H0 = fountH(tl0 - P.heatOn); if (H0 < 4) continue;
    const tau = t - tl0, v = Math.sqrt(2 * g * H0), sp = (rand(n) - 0.5) * 80, y = FT.nozzle - v * tau + 0.5 * g * tau * tau, x = FT.x + sp * (0.4 * tau + 1.2 * Math.max(0, tau - v / g));
    if (y > FT.bath) continue; jetPts.push([x, y, tau < v / g]);
  }
  for (const [x, y, up] of jetPts) { circle(c, x, y, up ? 4 : 3, rgba(up ? '#BFFFF3' : '#8FEADB', up ? 0.85 : 0.55)); }
  if (H > 8) { const top = FT.nozzle - H; glowLine(c, [[FT.x, FT.nozzle], [FT.x, top + 10]], PAL.sf, 5, 0.75); glow(c, FT.x, top + 20, 50, PAL.sf, 0.4); }
  const ripples = []; if (fountH(t - P.heatOn - 1.1) > 20) for (let k = 0; k < 4; k++) ripples.push({x: FT.x + (k % 2 ? 1 : -1) * (60 + 26 * k), age: frac(t / 1.1 + k / 4) * 1.1});
  drawBath(stage, FT.bath, t, ripples, 1);
  // the tube with its powder plug, standing in the bath
  const x0 = FT.x - FT.w / 2, x1 = FT.x + FT.w / 2;
  const fill = s > 0 ? lerp(FT.bath, FT.nozzle, smooth(s / 0.5)) : FT.bath;
  rect(c, x0 + 4, fill, FT.w - 8, FT.powder[0] - fill, 0, rgba(PAL.sf, 0.45));
  for (let k = 0; k < 120; k++) { const px = x0 + 6 + rand(k) * (FT.w - 12), py = FT.powder[0] + rand(k + 300) * (FT.powder[1] - FT.powder[0]); circle(c, px, py, 2.2 + 1.6 * rand(k + 77), rgba('#D9E2E5', 0.55)); }
  poly(c, [[x0, FT.bot], [x0, FT.top], [FT.x - 12, FT.nozzle], [FT.x + 12, FT.nozzle], [x1, FT.top], [x1, FT.bot]], null, rgba(PAL.glass, 0.7), 3);
  line(c, [[x0 + 10, FT.top + 20], [x0 + 10, FT.powder[0] - 20]], rgba('#FFFFFF', 0.2), 3);
  // heater coil around the powder
  const hcol = on ? mix('#6B4A3A', PAL.heat, smooth(s / 0.4)) : '#5A4B44';
  for (let k = 0; k < 6; k++) { const y = 1150 + k * 12; line(c, [[x0 - 8, y], [x1 + 8, y + 6]], hcol, 4); }
  if (on) glow(c, FT.x, 1180, 80, PAL.heat, 0.5 * smooth(s / 0.4));
  line(c, [[x1 + 8, 1180], [700, 1180]], rgba(hcol, 0.9), 3);
  tag(stage, '히터 · 살짝 데움', 712, 1180, {size: 26, color: on ? PAL.warm : T.muted, align: 'left', plateA: 0.75});
  // superfluid rushing in through the powder towards the warm side
  if (dT > 0.02) for (let k = 0; k < 9; k++) { const u = frac(k / 9 + t * 1.6), xx = FT.x + ((k % 3) - 1) * 22, y = lerp(FT.bot + 40, FT.powder[0] + 10, u); arrow(c, [xx, y + 18], [xx, y], rgba(PAL.sf, 0.9 * dT * Math.sin(Math.PI * u)), 3, {head: 10}); }
  withAlpha(c, fadeIn(t, P.that, 0.4), () => { stage.text('초유체가', 330, 1060, {size: 28, weight: 700, color: T.accent, align: 'center'}); stage.text('따뜻한 쪽으로', 330, 1096, {size: 28, weight: 700, color: T.accent, align: 'center'}); arrow(c, [420, 1110], [x0 - 14, 1170], rgba(T.accent, 0.85), 3); });
  tag(stage, '고운 가루로 막은 관', 300, 1196, {size: 24, color: T.muted, plate: false}); line(c, [[420, 1206], [x0 - 6, 1232]], rgba(T.muted, 0.7), 2);
  withAlpha(c, fadeIn(t, P.fount, 0.4), () => { const top = FT.nozzle - H; line(c, [[FT.x + 40, top], [FT.x + 150, top]], rgba('#FFFFFF', 0.5), 2, {dash: [6, 6]}); stage.text('분수처럼 솟구침', FT.x + 160, top, {size: 28, weight: 700, color: T.ink}); });
  tag(stage, '설명 그림', 800, 780, {size: 24, color: T.muted, plate: false});
}

// ------------------------------------------------------------------ solid: everything freezes … except helium; 25 atm locks the lattice
export const VIALS = [{n: '물', tm: 273.15, col: '#6FB6FF'}, {n: '질소', tm: 63.15, col: '#B8D4E8'}, {n: '수소', tm: 13.99, col: '#CFE0F0'}, {n: '헬륨', tm: null, col: PAL.sf}];
const VX = [300, 480, 660, 840];
function vial(stage, x, y0, y1, col, frozen, t, o = {}) {
  const c = stage.ctx, w = 104, lv = y0 + 70;
  rect(c, x - w / 2, y0, w, y1 - y0, 30, rgba(PAL.glass, 0.07), rgba(PAL.glass, 0.55), 2);
  clipRect(c, x - w / 2 + 3, y0 + 2, w - 6, y1 - y0 - 4, 36, () => {
    const lg = c.createLinearGradient(0, lv, 0, y1); lg.addColorStop(0, rgba(col, 0.6)); lg.addColorStop(1, rgba(mix(col, '#0A1A22', 0.6), 0.85));
    const wave = (1 - frozen) * 4;
    poly(c, [[x - w / 2, lv + wave * Math.sin(t * 3 + x)], [x + w / 2, lv - wave * Math.sin(t * 3 + x)], [x + w / 2, y1], [x - w / 2, y1]], lg);
    if (frozen > 0) withAlpha(c, frozen, () => {
      rect(c, x - w / 2, lv, w, y1 - lv, 0, rgba(PAL.frost, 0.55));
      const top = lerp(y1, lv, frozen);
      for (let yy = y1 - 14; yy > top; yy -= 22) for (let xx = x - w / 2 + 12 + ((yy / 22) % 2) * 11; xx < x + w / 2; xx += 22) { ring(c, xx, yy, 6, rgba('#FFFFFF', 0.6), 1.5); }
    });
    if (o.glow) glow(c, x, lv + 40, 90, col, 0.35 * o.glow);
  });
}
function solidScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), pa = fadeOut(t, P.box, 0.45), pb = fadeIn(t, P.box + 0.45, 0.5);
  withAlpha(c, sf, () => {
    if (pa > 0) withAlpha(c, pa, () => {
      // temperature track (log, no numbers): 실온 → 절대영도 가까이
      const x0 = 200, x1 = 900, y = 440, TS = P.TS(t), q = (Math.log(293) - Math.log(TS)) / (Math.log(293) - Math.log(0.6));
      const gr = c.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, PAL.warm); gr.addColorStop(1, PAL.sf);
      rect(c, x0, y - 6, x1 - x0, 12, 6, rgba(T.border, 0.9)); rect(c, x0, y - 6, (x1 - x0) * q, 12, 6, gr);
      circle(c, x0 + (x1 - x0) * q, y, 12, '#FFFFFF'); glow(c, x0 + (x1 - x0) * q, y, 34, PAL.sf, 0.5);
      stage.text('실온', x0, y + 40, {size: 26, weight: 700, color: PAL.warm, align: 'center'});
      stage.text('절대영도 가까이', x1 + 10, y + 40, {size: 26, weight: 700, color: T.accent, align: 'right'});
      stage.text('더 차갑게 →', 550, y - 32, {size: 24, weight: 700, color: T.muted, align: 'center'});
      VIALS.forEach((v, i) => {
        const ft = P.freezeT[i], fr = ft == null ? 0 : smooth((t - ft) / 0.45), x = VX[i];
        vial(stage, x, 560, 900, v.col, fr, t, {glow: i === 3 ? fadeIn(t, P.except, 0.4) : 0});
        stage.text(v.n, x, 944, {size: 32, weight: 700, color: i === 3 ? T.accent : T.ink, align: 'center'});
        if (ft != null) stage.text('고체', x, 984, {size: 26, weight: 700, color: PAL.frost, align: 'center', alpha: fr});
      });
      withAlpha(c, fadeIn(t, P.freezeQ, 0.35) * fadeOut(t, P.except, 0.3), () => stage.text('?', VX[3], 720, {role: 'display', weight: 700, size: 110, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.8)'}));
      withAlpha(c, fadeIn(t, P.except, 0.4), () => { stage.text('액체 그대로', VX[3], 984, {size: 26, weight: 700, color: T.accent, align: 'center'}); tag(stage, '1기압에서는 절대영도 가까이에서도 액체', 540, 1060, {size: 28, color: T.accent, plateA: 0.75}); });
    });
    if (pb > 0) withAlpha(c, pb, () => {
      // zero-point tremor comparison chips (설명 모형)
      const qc = fadeIn(t, P.light, 0.4);
      if (qc > 0) withAlpha(c, qc, () => {
        const jit = (k, A) => [A * Math.sin(t * 31 + k) * 0.6 + A * 0.4 * Math.sin(t * 47 + 2 * k), A * Math.cos(t * 37 + k * 3) * 0.6 + A * 0.4 * Math.sin(t * 29 + k)];
        const [ax, ay] = jit(1, 13); halo(c, 230, 420, 46, PAL.sf, 0.35); atomCore(c, 230 + ax, 420 + ay, 13, PAL.sf);
        stage.text('헬륨 · 가벼움', 280, 420, {size: 28, weight: 700, color: T.accent});
        const [bx, by] = jit(5, 4); halo(c, 600, 420, 26, '#E9BC78', 0.3); atomCore(c, 600 + bx, 420 + by, 17, '#E9BC78');
        stage.text('네온 · 5배 무거움', 640, 420, {size: 28, weight: 700, color: '#E9BC78'});
      });
      // the box with a piston
      const PS = P.PS(t), lockAll = rowLock(PS, SOLID.rows - 1), pistonY = lerp(540, 575, clamp((PS - 1) / 24.2));
      const bx0 = 240, bx1 = 840, by1 = 1010;
      rect(c, bx0, 500, bx1 - bx0, by1 - 500, 16, rgba('#04121A', 0.72), rgba(PAL.glass, 0.5), 2);
      rect(c, bx0 + 6, pistonY - 18, bx1 - bx0 - 12, 18, 4, '#56656C', rgba('#93A7AB', 0.8), 1.5); rect(c, 525, 470, 30, pistonY - 18 - 470, 0, '#56656C');
      if (PS > 1.5) for (const xx of [380, 540, 700]) arrow(c, [xx, pistonY - 70], [xx, pistonY - 26], rgba(T.ink, 0.6 + 0.3 * Math.sin(t * 6)), 3);
      const sp = 92, rows = SOLID.rows, cols = SOLID.cols;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const i = r * cols + k, lk = rowLock(PS, r);
        const lx = 540 + (k - (cols - 1) / 2 + (r % 2 ? 0.25 : -0.25)) * sp, ly = by1 - 56 - r * 82 * lerp(1, 0.93, lockAll);
        const dx = (rand(i * 3 + 1) - 0.5) * 70 + 22 * Math.sin(t * 0.7 + i * 1.9), dy = (rand(i * 5 + 2) - 0.5) * 46 + 16 * Math.cos(t * 0.6 + i * 1.3);
        const A = lerp(14, 9, lk), jx = A * (0.6 * Math.sin(t * 31 + i) + 0.4 * Math.sin(t * 47 + 2 * i)), jy = A * (0.6 * Math.cos(t * 37 + 3 * i) + 0.4 * Math.sin(t * 29 + i));
        const x = lx + dx * (1 - lk) + jx, y = Math.min(ly + dy * (1 - lk), by1 - 34) + jy;
        halo(c, x, y, 34, lk > 0.5 ? '#DFF4FF' : PAL.sf, 0.16); atomCore(c, x, y, 13, lk > 0.5 ? '#CFE8F5' : PAL.sf);
        const fl = clamp(1 - Math.abs(t - P.rowT[r]) / 0.18); if (fl > 0) ring(c, x, y, 22, rgba('#FFFFFF', 0.8 * fl), 2.5);
      }
      if (lockAll > 0) withAlpha(c, lockAll, () => { for (let r = 0; r < rows; r++) { const y = by1 - 56 - r * 82 * 0.93; line(c, [[bx0 + 20, y], [bx1 - 20, y]], rgba('#FFFFFF', 0.12), 1.5); } });
      withAlpha(c, fadeIn(t, P.shake, 0.4), () => tag(stage, '가장 낮은 상태에서도 크게 떨림', 540, 1048, {size: 26, color: T.accent, plate: false}));
      // pressure gauge and the state
      const pq = clamp(PS / 30);
      stage.text('압력', 330, 1102, {size: 26, weight: 700, color: T.ink, align: 'center'});
      dial(stage, 330, 1212, 92, pq, {grad: ['#5D7C86', '#E9BC78'], ticks: [[0, '0'], [25 / 30, '25', T.accent]], col: lockAll > 0.5 ? T.accent : '#FFFFFF'});
      stage.text(`${Math.round(PS)}기압`, 330, 1216, {role: 'display', weight: 700, size: 30, color: lockAll > 0.5 ? T.accent : T.ink, align: 'center'});
      stage.text('상태', 720, 1112, {size: 26, weight: 700, color: T.muted, align: 'center'});
      withAlpha(c, 1 - smooth((lockAll - 0.3) / 0.15), () => stage.text('액체', 720, 1180, {role: 'display', weight: 700, size: 64, color: T.accent, align: 'center'}));
      withAlpha(c, smooth((lockAll - 0.5) / 0.15), () => { stage.text('고체', 720, 1180, {role: 'display', weight: 700, size: 64, color: '#DFF4FF', align: 'center'}); stage.text('원자가 제자리에 자리 잡음', 720, 1246, {size: 26, weight: 700, color: T.ink, align: 'center'}); });
      tag(stage, '설명 모형', 840, 478, {size: 24, color: T.muted, plate: false, align: 'right'});
    });
  });
}

// ------------------------------------------------------------------ use: LHC · CERN, 27 km, magnets at 1.9 K; heat spreads at once
function useScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), pa = fadeOut(t, P.s18, 0.45), pb = fadeIn(t, P.s18 + 0.42, 0.5);
  withAlpha(c, sf, () => {
    if (pa > 0) withAlpha(c, pa, () => {
      const cx = 540, cy = 630, R = 236, dq = easeInOut((t - P.real) / 1.4);
      // faint terrain
      for (let gx = 180; gx <= 900; gx += 60) for (let gy = 380; gy <= 900; gy += 60) circle(c, gx, gy, 1.6, rgba('#5E7C84', 0.35));
      withAlpha(c, fadeIn(t, ctx.scene.start + 0.2, 0.4) * fadeOut(t, P.ring, 0.3), () => stage.text('실제로 쓰이는 곳', cx, cy, {role: 'display', weight: 700, size: 40, color: T.muted, align: 'center'}));
      if (dq > 0) { const a1 = -Math.PI / 2 + Math.min(TAU * dq, TAU - 1e-3);
        ring(c, cx, cy, R, rgba('#0A2A30', 0.95), 22, -Math.PI / 2, a1);
        ring(c, cx, cy, R, rgba(PAL.sf, 0.25), 14, -Math.PI / 2, a1);
        ring(c, cx, cy, R, rgba(PAL.sf, 0.9), 3, -Math.PI / 2, a1);
      }
      const qb = fadeIn(t, P.beams, 0.4);
      if (qb > 0) for (const [dir, col] of [[1, '#FFFFFF'], [-1, '#FFD27A']]) for (let k = 0; k < 7; k++) { const an = -Math.PI / 2 + dir * (TAU * (t - P.beams) / 2.2 - k * 0.05); circle(c, cx + (R + dir * 4) * Math.cos(an), cy + (R + dir * 4) * Math.sin(an), 6 - k * 0.7, rgba(col, qb * (1 - k / 7))); }
      withAlpha(c, fadeIn(t, P.ring + 0.3, 0.4), () => stage.text('LHC · CERN', cx, cy - 18, {role: 'display', weight: 700, size: 52, color: T.ink, align: 'center'}));
      withAlpha(c, fadeIn(t, P.km27, 0.4), () => stage.text('둘레 27 km', cx, cy + 46, {role: 'display', weight: 700, size: 36, color: T.accent, align: 'center'}));
      // a magnet section on the ring → cross-section inset
      const qm = fadeIn(t, P.magnet, 0.45);
      if (qm > 0) withAlpha(c, qm, () => {
        const an = 0.95, mx = cx + R * Math.cos(an), my = cy + R * Math.sin(an), ix = 540, iy = 1100, ir = 160;
        ring(c, mx, my, 18, '#FFFFFF', 3); line(c, [[mx, my + 18], [ix + ir * 0.55, iy - ir * 0.85]], rgba('#FFFFFF', 0.5), 2);
        circle(c, ix, iy, ir, '#0B171C'); ring(c, ix, iy, ir, rgba('#93A7AB', 0.9), 4);
        circle(c, ix, iy, ir * 0.8, rgba(PAL.sf, 0.5)); glow(c, ix, iy, ir * 0.95, PAL.sf, 0.25 * (1 + 0.3 * Math.sin(t * 2)));
        const yg = c.createRadialGradient(ix - 40, iy - 40, 10, ix, iy, ir * 0.72); yg.addColorStop(0, '#7C8A91'); yg.addColorStop(1, '#3E4A50'); circle(c, ix, iy, ir * 0.72, yg);
        for (const [hx, hy] of [[ix - 60, iy + 52], [ix + 60, iy + 52], [ix, iy - 80], [ix - 78, iy - 34], [ix + 78, iy - 34]]) circle(c, hx, hy, 7, rgba(PAL.sf, 0.85));
        for (const sx of [-1, 1]) { const ax = ix + sx * 46; for (let q = 0; q < 6; q++) ring(c, ax, iy, 30, rgba(PAL.coil, 0.95), 11, q * Math.PI / 3 + 0.12, q * Math.PI / 3 + Math.PI / 3 - 0.12); circle(c, ax, iy, 22, '#0A1013'); ring(c, ax, iy, 22, rgba('#93A7AB', 0.8), 2); circle(c, ax, iy, 4, '#FFFFFF'); glow(c, ax, iy, 16, '#FFFFFF', 0.5); }
        stage.text('초전도 자석 단면', ix, iy + ir + 34, {size: 26, weight: 700, color: T.ink, align: 'center'});
        stage.text('초유체 헬륨', 230, 990, {size: 28, weight: 700, color: T.accent, align: 'center'}); line(c, [[230, 1008], [ix - ir * 0.76, iy - 40]], rgba(T.accent, 0.7), 2); circle(c, ix - ir * 0.76, iy - 40, 5, T.accent);
        withAlpha(c, fadeIn(t, P.k19, 0.4), () => { stage.text('1.9 K', 830, 1090, {role: 'display', weight: 700, size: 60, color: T.accent, align: 'center'}); stage.text('영하 271 °C', 830, 1146, {size: 28, weight: 700, color: T.muted, align: 'center'}); });
      });
    });
    if (pb > 0) withAlpha(c, pb, () => {
      const x0 = 170, x1 = 910, y0 = 500, y1 = 620, tau = Math.max(0, t - P.heatP), on = t > P.heatP, sc = heatScale(P), jm = (HEAT.nx - 1) / 2;
      stage.text('자석 한 줄 · 초유체 헬륨 1.9 K', x0, 452, {size: 28, weight: 700, color: T.ink});
      rect(c, x0, y0, x1 - x0, y1 - y0, 20, rgba(PAL.sf, 0.35), rgba(PAL.glass, 0.6), 2);
      rect(c, x0 + 16, y0 + 36, x1 - x0 - 32, 48, 10, '#46545B', rgba('#93A7AB', 0.7), 1.5);
      // He II: the warmth spreads along the whole length (colour of the core follows the model profile)
      if (on) for (let j = 0; j < HEAT.nx - 1; j++) { const v = heatAt(HEAT.II, tau, j) * sc, xx = lerp(x0 + 16, x1 - 16, j / (HEAT.nx - 1)); rect(c, xx, y0 + 36, (x1 - x0 - 32) / (HEAT.nx - 1) + 1, 48, 0, rgba(PAL.heat, clamp(v * 2.2, 0, 0.6))); }
      if (on) { const fl = 1 - clamp(tau / 0.6); glow(c, 540, (y0 + y1) / 2, 90, PAL.heat, 0.25 + 0.5 * fl); }
      // heat arrows running out to both ends (repeating while the heat flows in)
      if (on) for (const dir of [-1, 1]) for (let k = 0; k < 3; k++) { const u = frac(tau / 0.9 + k / 3); if (tau < k * 0.3) continue; const xx = 540 + dir * 350 * easeOut(u); arrow(c, [xx - dir * 54, y1 + 36], [xx, y1 + 36], rgba(PAL.heat, 0.95 * (1 - u)), 6, {head: 20}); }
      withAlpha(c, fadeIn(t, P.heatP, 0.3) * fadeOut(t, P.fast - 0.3, 0.25), () => stage.text('한 곳에 열이 들어옴', 540, y1 + 82, {size: 28, weight: 700, color: PAL.heat, align: 'center'}));
      withAlpha(c, fadeIn(t, P.fast, 0.35), () => stage.text('열이 순식간에 자석 전체로 퍼짐', 540, y1 + 82, {size: 28, weight: 700, color: PAL.warm, align: 'center'}));
      withAlpha(c, fadeIn(t, P.whole, 0.4), () => tag(stage, '자석 전체가 고르게 차가움', 540, y1 + 128, {size: 28, color: T.accent, plateA: 0.75}));
      // temperature profile graph
      const gx0 = 200, gx1 = 900, gy0 = 1290, gy1 = 960, yv = v => gy0 - (gy0 - gy1) * clamp(v / 1.2, 0, 1.0);
      line(c, [[gx0, gy1 - 10], [gx0, gy0], [gx1, gy0]], rgba(T.muted, 0.8), 2);
      stage.text('온도 오름', gx0, gy1 - 34, {size: 26, weight: 700, color: T.ink});
      stage.text('자석을 따라 →', gx1, gy0 + 28, {size: 24, weight: 500, color: T.muted, align: 'right'});
      const qbl = fadeIn(t, P.boil18, 0.4);
      withAlpha(c, qbl, () => { line(c, [[gx0, yv(HEAT_BOIL)], [gx1, yv(HEAT_BOIL)]], rgba(PAL.bad, 0.7), 2, {dash: [10, 8]}); stage.text('끓기 시작', gx1, yv(HEAT_BOIL) - 20, {size: 24, weight: 700, color: PAL.bad, align: 'right'}); });
      if (on) {
        const pI = [], pII = []; for (let j = 0; j < HEAT.nx; j++) { const xx = lerp(gx0, gx1, j / (HEAT.nx - 1)); pI.push([xx, yv(heatAt(HEAT.I, tau, j) * sc)]); pII.push([xx, yv(heatAt(HEAT.II, tau, j) * sc)]); }
        withAlpha(c, qbl, () => line(c, pI, rgba(PAL.warm, 0.95), 3, {dash: [9, 7]}));
        glowLine(c, pII, T.accent, 3.5, 1);
        void jm;
      }
      withAlpha(c, fadeIn(t, P.fast, 0.4), () => stage.text('초유체: 고르게 퍼져 거의 그대로', gx1, gy0 - 26, {size: 24, weight: 700, color: T.accent, align: 'right'}));
      withAlpha(c, qbl, () => stage.text('보통 액체 헬륨이었다면', 410, yv(HEAT_BOIL) - 64, {size: 24, weight: 700, color: PAL.warm, align: 'right'}));
      tag(stage, '설명 모형', 540, gy1 - 34, {size: 24, color: T.muted, plate: false});
    });
  });
}

// ------------------------------------------------------------------ close: one by one → all together; then the poster returns and stays
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), fin = fadeIn(t, P.reason, 0.6), pre = fadeIn(t, ctx.scene.start, 0.3) * (1 - fin);
  if (pre > 0) withAlpha(c, pre, () => {
    const box = [150, 400, 780, 600], TC = P.TC(t), L = P.lockC(t);
    rect(c, ...box, 18, rgba('#04121A', 0.75), rgba(T.border, 1), 2);
    const sway = 24 * Math.sin(TAU * 0.42 * (t - P.move19)) * smooth((t - P.move19) / 0.8);
    drawField(stage, t, {box, cx: 540, cy: 700, T: TC, L, sway});
    const ta = fadeOut(t, P.reason - 0.4, 0.3);
    if (ta > 0) withAlpha(c, ta, () => {
    tag(stage, '하나하나', 170, 430, {size: 28, color: PAL.neutral, align: 'left', plateA: 0.75, a: fadeIn(t, P.one, 0.35) * (1 - smooth((L - 0.3) / 0.3))});
    tag(stage, '모두가 함께', 170, 430, {size: 28, color: T.accent, align: 'left', plateA: 0.75, a: smooth((L - 0.3) / 0.3)});
    tag(stage, '설명 모형', 910, 430, {size: 24, color: T.muted, align: 'right', plate: false});
    stage.text(`${TC.toFixed(2)} K`, 540, 1080, {role: 'display', weight: 700, size: 44, color: TC > T_LAMBDA ? T.ink : T.accent, align: 'center'});
    stage.text(TC > T_LAMBDA ? '람다점 위' : '람다점 아래 · 초유체', 540, 1136, {size: 28, weight: 700, color: TC > T_LAMBDA ? T.muted : T.accent, align: 'center'});
    });
  });
  if (fin > 0) {
    posterPicture(stage, P.posterM(t), {a: fin});
    captionShade(c, fin);
    posterTitle(stage, t, 0, fin);
  }
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Drop hits the bath → a low "똑" (tone 210 → 115 Hz glide, 0.16 s).
//  - Thermometer T → pitch 60 + 32·log10(T/K) Hz (liquid and lambda scenes; 293 K 139 Hz, 4.2 K 80 Hz, 1.5 K 66 Hz).
//  - Boiling: band-limited noise (60–300 Hz) whose amplitude follows the bubble rate of the model; cut to zero at the λ point.
//  - Five low tones 110·(1 + d·(1 − ρs/ρ)) Hz, d = 0, ±2.2 %, ±4.5 %: beats while the halos are out of step, one steady tone when locked.
//  - Pressure P → pitch 70 + 4·P Hz; liquid jostle → random low ticks; each row locking into the lattice → evenly spaced ticks.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export const thermoHz = T => 60 + 32 * Math.log10(T);
export const pressHz = P => 70 + 4 * P;
const DETUNE = [-0.045, -0.022, 0, 0.022, 0.045];
const thin = (times, gap = 0.12) => { const o = []; for (const x of times.slice().sort((a, b) => a - b)) if (!o.length || x - o.at(-1) >= gap) o.push(x); return o; };
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -33}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -30, f = 58) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur: 0.6, harmonics: [1, 0.35], attack: 0.006, decay: 0.2, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.3, low: 40, high: 220, release: 0.22, gain_db: -9}}]}, means});
  const envNoise = (id, t0, t1, amp, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += o.dt ?? 0.02) Q.push([r(tt - t0), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][1] = 0; ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {low: o.low ?? 60, high: o.high ?? 300, fade: o.fade ?? 0.04, gain_db: o.gain ?? -31, points: Q.filter((q, i) => i === 0 || i === Q.length - 1 || Math.abs(q[1] - Q[i - 1][1]) > 1e-4 || Math.abs(q[1] - Q[i + 1][1]) > 1e-4)}, means}); };
  const dripL = (off, f = 210) => ({kind: 'tone', offset: r(off, 4), params: {freq: f, glide_to: r(f * 0.55, 1), dur: 0.16, harmonics: [1, 0.25], attack: 0.002, decay: 0.045, sustain: 0, release: 0.06, gain_db: 0}});
  const drips = (id, times, means, gain = -33) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => dripL(tt - times[0], 205 + 12 * ((k * 7) % 3)))}, means}); };
  const tones = (id, t0, t1, lockAt, amp, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: DETUNE.map(d => ({kind: 'chirp', offset: 0, params: {gain_db: 0, harmonics: [1, 0.3], fade: 0.03, points: table(t0, t1, tt => 110 * (1 + d * (1 - lockAt(tt))), amp, 0.03, 0.5, 0.5)}}))}, means});

  // hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 벽을 타고 넘어 방울로 떨어지는 액체와 제목', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  const hd = dripImpacts(POSTER, POSTER.bath, DRIP.period, DRIP.phase, 0.05, tl.scene('hook').end - 0.3);
  drips('hook_drips', hd, `컵 바닥에서 떨어진 방울이 수조에 닿을 때마다 낮은 "똑" (${hd.length}번, ${DRIP.period}초 간격: 막 흐름이 일정함)`);
  tick('scale', P.zero + 0.05, 147, -33, '온도 눈금 "절대영도 0 K … 실온 293 K"', {decay: 0.12});
  tick('cup_mark', P.near + 0.05, 110, -32, '"컵 속 헬륨 약 2 K" 표시 (절대영도 바로 옆)', {decay: 0.14});
  chirp('climb_up', P.climb, P.climb + 0.8, tt => 110 + 70 * smooth((tt - P.climb) / 0.7), () => 0.32, -35, '"막이 벽을 타고 올라감" 화살표: 올라가는 음 110 → 180 Hz', {fi: 0.08, fo: 0.25});
  chirp('run_down', P.outside, P.outside + 0.8, tt => 180 - 70 * smooth((tt - P.outside) / 0.7), () => 0.32, -35, '"바깥으로 흘러내림" 화살표: 내려가는 음 180 → 110 Hz', {fi: 0.08, fo: 0.25});
  // origin
  tick('helium', P.he + 0.1, 131, -33, '"helium" 글자', {decay: 0.12});
  tick('helios', P.greek + 0.05, 147, -33, '"helios · 그리스어"', {decay: 0.12});
  swell('sun', P.sun, [98, 147], '"= 태양": 태양 원반이 밝아짐', {dur: 1.5, gain: -33});
  whoosh('moon', P.moon[0], P.moon[1] - P.moon[0], 140, 70, '달이 태양을 가림 (1868 개기 일식)', -35);
  swell('totality', P.total, [73, 110], '개기 일식: 코로나와 붉은 홍염이 드러남', {dur: 1.6, gain: -34});
  tick('spectrum', P.pattern + 0.1, 123, -33, '햇빛·홍염의 스펙트럼 띠가 나타남', {decay: 0.12});
  swell('d3', P.first, [131, 196], '홍염의 새 노란 선 D3 (나트륨 두 선 옆)', {dur: 1.4, gain: -33});
  tick('y1868', P.sunFirst - 0.55, 147, -34, '"1868 · 태양에서"', {decay: 0.1});
  tick('y1895', P.earth + 0.5, 110, -34, '"1895 · 지구에서"', {decay: 0.1});
  // liquid
  tick('onnes', P.onnes + 0.05, 131, -34, '"Kamerlingh Onnes"', {decay: 0.1});
  chirp('cool_liquid', P.cool0 - 0.2, P.k4 + 0.6, tt => thermoHz(P.TQ(tt)), () => 0.3, -36, `온도계 T → 음높이 60 + 32·log10(T/K) Hz: 293 K ${thermoHz(293).toFixed(0)} Hz → 4.2 K ${thermoHz(4.2).toFixed(0)} Hz`, {h: [1, 0.5, 0.3], fi: 0.2, fo: 0.4});
  tick('k4', P.k4, 98, -32, '4.2 K에 도달 (영하 269 °C)', {decay: 0.16});
  ticks('condense', P.condenseHit.filter(x => x < tl.scene('liquid').end - 0.2), 82, -35, `맺힌 방울 ${P.condenseHit.length}개가 차례로 흘러내려 고임 (첫 액체 헬륨)`, {decay: 0.06});
  envNoise('boil_gentle', P.pool[0] + 0.6, tl.scene('liquid').end + 0.1, tt => 0.35 * smooth((tt - P.pool[0] - 0.6) / 1.2), '4.2 K에서 끓는 액체 헬륨: 약한 거품 소리 (거품 생성률에 맞춘 50–200 Hz 잡음)', {gain: -32, low: 50, high: 200});
  // lambda
  whoosh('pump', P.pump, 1.0, 80, 160, '펌프로 증기를 빼기 시작', -34);
  chirp('cool_lambda', tl.scene('lambda').start + 0.1, P.lam + 3.0, tt => thermoHz(P.TL(tt)), () => 0.28, -37, `같은 온도계 대응: 4.2 K ${thermoHz(4.2).toFixed(0)} Hz → 2.17 K ${thermoHz(T_LAMBDA).toFixed(0)} Hz (람다점) → 계속 내려감`, {h: [1, 0.5, 0.3], fi: 0.2, fo: 1.2});
  const t0b = tl.scene('lambda').start;
  envNoise('boil', t0b, P.lam + 0.06, tt => (tt >= P.lam ? 0 : 0.25 + 0.75 * clamp(boilRate(P.TL(tt), tt < P.pump ? BOIL.gentle * 1.6 : BOIL.vigorous) / BOIL.vigorous)), `끓는 소리: 거품 생성률(모형)에 맞춘 50–200 Hz 잡음, 2.17 K(${P.lam.toFixed(2)} s)에서 뚝 끊김 → 고요`, {gain: -29, fade: 0.03, dt: 0.02, low: 50, high: 200});
  const pops = thin(P.bubbles.filter(b => b.ts < P.lam && b.ts > t0b + 0.2).map(b => b.ts), 0.09);
  ticks('pops', pops, pops.map((_, k) => 70 + 10 * ((k * 5) % 5)), -36, `거품이 수면에서 터질 때마다 낮은 틱 (${pops.length}번, 0.09초보다 가까운 것은 솎음), 람다점 뒤로는 없음`, {decay: 0.05});
  tick('mark217', P.mark217 + 0.05, 131, -34, '온도계에 "2.17 K" 표시', {decay: 0.1});
  swell('lambda_glyph', P.greekL, [110, 165], '"그리스 문자 λ": 곡선 옆에 λ', {dur: 1.4, gain: -33});
  tick('lpoint', P.lpoint + 0.05, 131, -33, '"λ점 · 2.17 K", 헬륨 I / 헬륨 II', {decay: 0.12});
  // flow
  tick('moscow', P.moscow + 0.05, 131, -34, '"Kapitza · 모스크바"', {decay: 0.1});
  tick('camb', P.camb + 0.05, 147, -34, '"Allen · Misener · 케임브리지"', {decay: 0.1});
  envNoise('pour', P.flow0, P.emptyII + 0.2, tt => (tt < P.flow0 || tt > P.emptyII ? 0 : 0.7), `헬륨 II가 틈으로 쏟아짐: 흐름이 일정한 동안(${(1 / FLOW.rateII).toFixed(2)}초) 낮은 물소리 잡음, 비면 멈춤`, {low: 55, high: 200, gain: -32, fade: 0.08});
  ticks('seep', P.dropsI, 90, -33, `헬륨 I은 아주 조금 스며 나와 가끔 한 방울 (${P.dropsI.length}번)`, {decay: 0.09});
  tick('narrow', P.narrow + 0.05, 123, -34, '"아주 좁은 틈"', {decay: 0.1});
  swell('name', P.name, [98, 147, 196], '"superfluid · 초유체"', {dur: 1.7, gain: -32});
  // wave
  swell('waves_on', P.waveOn, [73, 110], '원자마다 물결(흐린 원)이 나타남', {dur: 1.4, gain: -35});
  tones('wave_tones', P.waveOn + 0.2, P.lanes + 0.3, tt => P.lockW(tt), tt => 0.12 * smooth((tt - P.waveOn - 0.2) / 1.0), `원자 물결 5개를 조금씩 다른 낮은 음 110·(1 + d·(1 − ρs/ρ)) Hz로: 람다점 위에서는 맥놀이, ${P.lamW.toFixed(2)} s(2.17 K) 뒤 물결의 박자가 맞으며 한 음으로 모임 (맥놀이 사라짐)`);
  tick('touch', P.touch, 165, -33, `물결 크기 λ가 원자 간격 0.36 nm에 닿음 (${T_TOUCH.toFixed(1)} K)`, {decay: 0.12});
  tick('lam_wave', P.lamW, 131, -32, '온도 손잡이가 2.17 K(람다점)를 지남', {decay: 0.14});
  const sp = thin(P.sparks.map(s => s.t), 0.1);
  ticks('sparks', sp, 82, -33, `람다점 위(따로따로) 줄: 원자가 벽의 돌기에 부딪혀 에너지를 잃을 때마다 낮은 틱 (${sp.length}번), 느려질수록 드물어짐. 한 덩어리 줄은 소리 없음`, {decay: 0.06});
  swell('no_friction', P.fric, [110, 165], '"마찰 없음 · 그대로 흐름"', {dur: 1.5, gain: -33});
  // film
  { const g = FILMCUP, G = cupGeom(g), half = G.film(g.level0), Lh = plen(half), L1 = g.level0 - 6 - g.rim;
    chirp('film_front', P.front[0], P.front[2] + 0.1, tt => { const s = filmFront(P, tt, Lh.at(-1), L1); const p = pAt(half, Lh, s === Infinity ? Lh.at(-1) : s); return 80 + 0.22 * (G.yb + 40 - p[1]); }, () => 0.3, -36,
      '막 앞끝의 높이 → 음높이: 벽을 기어오르며 오르고(약 150 → 180 Hz), 가장자리를 넘어 바깥으로 내려가며 내려감', {h: [1, 0.4], fi: 0.3, fo: 0.2}); }
  tick('loupe', P.hair + 0.05, 147, -34, '확대 그림 "막 두께 약 30 nm"', {decay: 0.1});
  tick('thou', P.thou + 0.05, 123, -34, '"머리카락 굵기의 수천분의 일"', {decay: 0.1});
  drips('film_drips', P.filmImpacts, `막이 컵 바닥까지 이어진 뒤 방울이 수조에 닿을 때마다 낮은 "똑" (${P.filmImpacts.length}번, ${FILM_DRIP.period}초 간격)`);
  tick('heater', P.heatOn, 110, -33, '히터 켜짐 (한쪽을 살짝 데움)', {decay: 0.12});
  whoosh('jet', P.heatOn + FOUNT.lag, 1.1, 70, 200, '분수가 솟구치기 시작', -33);
  envNoise('jet_flow', P.heatOn + FOUNT.lag, tl.scene('film').end - 0.1, tt => 0.65 * fountH(tt - P.heatOn) / FOUNT.hMax, '분수 높이(모형) → 낮은 물줄기 잡음 크기 (60–220 Hz)', {low: 60, high: 220, gain: -33, fade: 0.1});
  tick('fountain_tag', P.fount + 0.05, 131, -34, '"분수처럼 솟구침"', {decay: 0.1});
  // solid
  ticks('freeze', P.freezeT.filter(x => x != null), [147, 123, 110], -32, '물 · 질소 · 수소가 차례로 고체가 됨 (헬륨은 소리 없음)', {decay: 0.14});
  tick('except', P.except + 0.05, 98, -32, '"액체 그대로": 헬륨은 예외', {decay: 0.16});
  swell('box', P.box + 0.3, [73, 110], '헬륨 원자 상자 (크게 떨리는 원자)', {dur: 1.4, gain: -35});
  ticks('jostle', P.jostle, P.jostle.map((_, k) => 78 + 8 * ((k * 3) % 4)), -36, `액체: 떨리며 뒤섞이는 원자들의 불규칙한 낮은 틱 (${P.jostle.length}번)`, {decay: 0.05});
  chirp('pressure', P.press[0], P.press[2] + 0.3, tt => pressHz(P.PS(tt)), () => 0.3, -36, `압력 P → 음높이 70 + 4·P Hz: 1기압 ${pressHz(1).toFixed(0)} Hz → 25기압 ${pressHz(25).toFixed(0)} Hz`, {h: [1, 0.5], fi: 0.2, fo: 0.3});
  ticks('lattice', P.rowT, [98, 98, 98, 98, 98], -32, `원자가 한 줄씩 격자 자리에 고정될 때마다 틱 (${P.rowT.length}줄, 고른 간격): 불규칙한 틱이 정렬된 박자로`, {decay: 0.1});
  swell('solid', P.solidT + 0.1, [110, 165], '"고체" (약 25기압)', {dur: 1.5, gain: -33});
  // use
  whoosh('ring', P.ring, 1.2, 80, 160, '둘레 27 km 고리가 그려짐', -35);
  tick('km27', P.km27 + 0.05, 131, -34, '"둘레 27 km"', {decay: 0.1});
  tick('magnet', P.magnet + 0.1, 110, -33, '자석 단면', {decay: 0.12});
  swell('k19', P.k19, [98, 147], '"1.9 K"', {dur: 1.5, gain: -33});
  thump('heat_in', P.heatP, '자석 한 곳에 열이 들어옴', -31, 62);
  whoosh('spread', P.fast, 0.8, 160, 80, '열이 순식간에 자석 전체로 퍼짐 (초유체)', -34);
  if (P.boilCross) tick('boil_line', P.boilCross, 98, -34, '점선(보통 액체였다면)이 "끓기 시작"을 넘음', {decay: 0.12});
  tick('whole', P.whole + 0.05, 147, -34, '"자석 전체가 고르게 차가움"', {decay: 0.1});
  // close
  tones('close_tones', tl.scene('close').start + 0.3, P.reason + 0.4, tt => P.lockC(tt), tt => 0.12, '같은 대응: 하나하나(맥놀이) → 모두가 함께(한 음)');
  swell('poster_back', P.reason, [73, 110, 147], '"초유체 헬륨은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  const pd = dripImpacts(POSTER, POSTER.bath, DRIP.period, DRIP.phase, P.posterM(P.reason + 0.4), P.posterM(tl.duration - 0.05)).map(m => m + tl.duration);
  drips('poster_drips', pd, `돌아온 포스터의 방울이 수조에 닿을 때마다 "똑" (${pd.length}번)`, -34);
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/superfluid-helium/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(온도 경로, 거품 생성률, 틈 흐름, 막 앞끝, 방울 주기, 분수 높이, 압력, 격자 고정, 열 퍼짐 표)에서 써 넣습니다. 대응: 방울이 수조에 닿음 → 낮은 "똑"(210 → 115 Hz), 온도계 T → 음높이 60 + 32·log10(T/K) Hz, 끓음 → 거품 생성률을 따르는 60–300 Hz 잡음(람다점에서 뚝 끊김), 원자 물결 → 조금씩 다른 다섯 음 110·(1 + d·(1 − ρs/ρ)) Hz(박자가 맞으면 맥놀이가 사라짐), 벽에 에너지를 잃음 → 82 Hz 틱, 압력 P → 70 + 4·P Hz, 격자 고정 → 고른 간격의 틱. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; λ(2.17 K) ${lambdaNm(T_LAMBDA).toFixed(3)} nm, λ = d at ${T_TOUCH.toFixed(2)} K; bubbles ${P.bubbles.length}, boiling stops ${P.lam.toFixed(2)} s`);
  console.log(`touch ${P.touch.toFixed(2)} s, λ point in wave ${P.lamW.toFixed(2)} s; sparks ${P.sparks.length}; film drips ${P.filmImpacts.length}; rows lock ${P.rowT.map(x => x.toFixed(2)).join(' ')}; boil line crossed ${P.boilCross?.toFixed(2)}`);
}
