// Episode scenes — "라그랑주 점 — 우주의 주차 자리"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Circular restricted three-body problem in units G(M₁+M₂) = 1, a = 1, ω = 1 (one Earth year = 2π time units).
//    Rotating frame, barycentre at the origin, Sun at (−μ, 0), Earth at (1 − μ, 0).
//    Ω(x, y) = ½(x² + y²) + (1 − μ)/r₁ + μ/r₂, effective potential Φ = −Ω (drawn as shading + contour lines).
//    Equations of motion in the rotating frame (Coriolis included): ẍ − 2ẏ = ∂Ω/∂x, ÿ + 2ẋ = ∂Ω/∂y (RK4, dt 0.002).
//  - Display mass ratio μ = 0.01 (Earth drawn ≈ 3,300× heavier than its real share μ = 3.0×10⁻⁶) so that L1/L2 sit
//    visibly away from Earth: L1 0.848, L2 1.147, L3 −1.004, L4/L5 (0.49, ±0.866). The collinear points come from the
//    quintic ∂Ω/∂x = 0 on y = 0 by Newton iteration from the Hill-radius guess. With the real μ the same code gives
//    L1/L2 at 1.49 / 1.50 million km from Earth (≈ 3.9 × the Moon's 384,400 km) → "약 150만 킬로미터, 네 배쯤".
//  - Time: inertial views run 1 year = 6 s (YEAR_S). The L1/L2 drift-away uses the same rate; the L4 tadpole is shown
//    faster (1 year ≈ 1.45 s, one libration ≈ 24 time units ≈ 3.8 years) and says so on screen.
//  - Kepler comparison (essence): Sun-only circular speed ω = r^(−3/2) for the inner (0.848) and outer (1.147) satellites
//    → periods 0.78 and 1.23 years; with Earth's pull added the same radii are L1/L2 and the period becomes 1 year.
//  - Forces on the Sun–Earth line (toward the Sun, per unit mass): F(x) = (1 − μ)/(x + μ)² + μ(x − 1 + μ)/|x − 1 + μ|³,
//    needed for a 1-year circle N(x) = ω²x = x. L1, L2: F = N. At L1 (μ = 0.01): Sun 1.345, Earth −0.496 (outward),
//    sum 0.849 = needed 0.848. At L2: Sun 0.740, Earth +0.406, sum 1.146 = needed 1.147.
//  - JWST halo loop around L2 (s14): schematic ellipse, 1 loop = "반년" shown in 4 s; station-keeping burns every quarter
//    loop (≈ 6 weeks; NASA plans one every 21 days, ~42 days nominal → "몇 주마다"); the drift between burns grows
//    e^(λτ) and is exaggerated for the eye (설명 모형).
//  - Jupiter trojans (s16–17): 1 dot ≈ 10 asteroids, L4 : L5 = 9,738 : 5,931 (Wikipedia / MPC, Feb 2026); positions are a
//    tadpole-shaped spread around ±60° (model), real μ_J = 9.54×10⁻⁴. Names: 588 Achilles (1906, L4), 1143 Odysseus (L4),
//    1172 Äneas (L5), 884 Priamus (L5).
//  - Sound: node episodes/lagrange-points/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, poly, line, circle, ring, glow, arrow, sphere,
  withAlpha, rect, clipRect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
export const theme = {base: 'noturno', accent: '#FFC24A'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const MU = 0.01, MU_REAL = 3.003e-6, MU_J = 9.537e-4;
export const AU_KM = 1.496e8, MOON_KM = 384400;
export const YEAR_S = 6, OMEGA_S = TAU / YEAR_S;                       // inertial views: 1 year = 6 s
export const Omega = (x, y, mu = MU) => { const r1 = Math.hypot(x + mu, y), r2 = Math.hypot(x - 1 + mu, y); return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2; };
export const Phi = (x, y, mu = MU) => -Omega(x, y, mu);
export function gradOmega(x, y, mu = MU) {
  const r1 = Math.hypot(x + mu, y), r2 = Math.hypot(x - 1 + mu, y), a = (1 - mu) / r1 ** 3, b = mu / r2 ** 3;
  return [x - a * (x + mu) - b * (x - 1 + mu), y - a * y - b * y];
}
/** five Lagrange points for mass ratio mu (collinear ones: Newton iteration on the quintic ∂Ω/∂x = 0, y = 0) */
export function lagrangePoints(mu) {
  const f = x => gradOmega(x, 0, mu)[0], df = x => (f(x + 1e-7) - f(x - 1e-7)) / 2e-7, rh = Math.cbrt(mu / 3);
  const newton = x => { for (let i = 0; i < 80; i++) { const d = f(x) / df(x); x -= d; if (Math.abs(d) < 1e-14) break; } return x; };
  return {L1: [newton(1 - mu - rh), 0], L2: [newton(1 - mu + rh), 0], L3: [newton(-1 - 5 * mu / 12), 0], L4: [0.5 - mu, Math.sqrt(3) / 2], L5: [0.5 - mu, -Math.sqrt(3) / 2]};
}
export const LP = lagrangePoints(MU);
export const LP_REAL = lagrangePoints(MU_REAL);
export const L12_KM = [(1 - MU_REAL - LP_REAL.L1[0]) * AU_KM, (LP_REAL.L2[0] - 1 + MU_REAL) * AU_KM];   // ≈ 1.49e6, 1.50e6
export const SUN = [-MU, 0], EARTH = [1 - MU, 0];
/** force toward the Sun along the line (per unit mass) and the force needed for a 1-year circle */
export const sunPull = x => (1 - MU) / (x + MU) ** 2;
export const earthPull = x => MU * (x - 1 + MU) / Math.abs(x - 1 + MU) ** 3;   // >0: toward the Sun (x beyond Earth)
export const forceIn = x => sunPull(x) + earthPull(x);
export const forceNeed = x => x;
export const keplerOmega = r => r ** -1.5;                                // Sun only, circular
function rk4(s, dt, mu = MU) {
  const f = ([x, y, vx, vy]) => { const [gx, gy] = gradOmega(x, y, mu); return [vx, vy, 2 * vy + gx, -2 * vx + gy]; };
  const k1 = f(s), k2 = f(s.map((v, i) => v + dt / 2 * k1[i])), k3 = f(s.map((v, i) => v + dt / 2 * k2[i])), k4 = f(s.map((v, i) => v + dt * k3[i]));
  return s.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
/** integrate from s0 for T time units → samples every 0.01 */
function integrate(s0, T) { const out = [s0]; let s = s0; for (let k = 0; k < Math.round(T / 0.01); k++) { for (let i = 0; i < 5; i++) s = rk4(s, 0.002); out.push(s); } return out; }
const sampleAt = (S, tau) => { const u = clamp(tau / 0.01, 0, S.length - 1.001), i = Math.floor(u), q = u - i; return S[i].map((v, k) => lerp(v, S[i + 1][k], q)); };
export const DRIFT = {d: 1.2e-3, rate: OMEGA_S};                         // nudge size, time units per screen second (= 1 yr / 6 s)
export const SIM_L2 = integrate([LP.L2[0] + DRIFT.d, 0, 0, 0], 8);
export const SIM_L1 = integrate([LP.L1[0] - DRIFT.d, 0, 0, 0], 8);
export const TAD = {deg: 10, rate: 4.3};                                 // L4 start rotated 10° ahead; 4.3 units/s (1 yr ≈ 1.46 s)
export const SIM_L4 = (() => { const d = TAD.deg * Math.PI / 180, [x, y] = LP.L4, c = Math.cos(d), s = Math.sin(d); return integrate([x * c - y * s, x * s + y * c, 0, 0], 40); })();
export const angFromSun = (x, y) => Math.atan2(y, x + MU) * 180 / Math.PI;
/** first time (units) the drift exceeds dist */
const firstBeyond = (S, p, dist) => { for (let i = 0; i < S.length; i++) if (Math.hypot(S[i][0] - p[0], S[i][1] - p[1]) > dist) return i * 0.01; return S.length * 0.01; };
export const TADPOLE_PERIOD = (() => { const a = SIM_L4.map(s => angFromSun(s[0], s[1])), m = (Math.max(...a) + Math.min(...a)) / 2; const cr = []; for (let i = 1; i < a.length; i++) if (a[i - 1] < m && a[i] >= m) cr.push(i * 0.01); return cr.length > 1 ? cr[1] - cr[0] : 24; })();
// ---- Jupiter trojans (model distribution) ----
export const TROJ = {L4: 9738, L5: 5931, per: 10, jupYr: 11.86};
export const TROJ_DOTS = (() => {
  const R = rng(1906), out = [];
  const n4 = Math.round(TROJ.L4 / TROJ.per), n5 = Math.round(TROJ.L5 / TROJ.per);
  for (let k = 0; k < n4 + n5; k++) {
    const side = k < n4 ? 1 : -1, A = 4 + 26 * Math.sqrt(R()), ph = R() * TAU, u = R() * 2 - 1;
    out.push({side, A, ph, dr: 0.06 * (R() - 0.5) + 0.035 * u * (A / 30), order: R(), sz: 1.1 + 1.2 * R() ** 3, a: 0.45 + 0.5 * R(), ep: R() * TAU});
  }
  return out;
})();
export const TROJ_NAMED = [{n: '아킬레우스', side: 1, A: 11, ph: 0.6, dr: 0.012, y: '1906'}, {n: '오디세우스', side: 1, A: 22, ph: 2.6, dr: -0.02},
  {n: '아이네이아스', side: -1, A: 16, ph: 4.2, dr: 0.018}, {n: '프리아모스', side: -1, A: 24, ph: 1.4, dr: -0.016}];

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  lagr1: W('s01', '라그랑주'),
  jwst2: W('s02', '제임스웹'), km2: W('s02', '백오십만'), near2: W('s02', '근처에서'), along2: W('s02', '나란히'), sun2: W('s02', '태양을'),
  y1767: W('s03', '천칠백육십칠년'), euler: W('s03', '오일러가'), line3: W('s03', '직선'), three3: W('s03', '세'),
  y1772: W('s04', '천칠백칠십이년'), lag4: W('s04', '라그랑주가'), two4: W('s04', '점을'), five4: W('s04', '다섯'), name4: W('s04', '이름이'),
  near5: W('s05', '가까울수록'), fast5: W('s05', '빨리'), far5: W('s05', '멀수록'), slow5: W('s05', '느리게'),
  inner6: W('s06', '안쪽에'), ahead6: W('s06', '앞지르고'), outer6: W('s06', '바깥쪽에'), behind6: W('s06', '뒤처집니다'),
  grav7: W('s07', '중력까지'), add7: W('s07', '더하면'), same7: W('s07', '똑같이'), five7: W('s07', '다섯'),
  two8: W('s08', '천체의'), grav8: W('s08', '중력을'), sum8: W('s08', '합친'), need8: W('s08', '필요한'), exact8: W('s08', '꼭'), fit8: W('s08', '맞는'),
  l1: W('s09', '엘원은'), between9: W('s09', '사이에'), opp9: W('s09', '반대쪽으로'), less9: W('s09', '줄어'), slow9: W('s09', '천천히'),
  l2: W('s10', '엘투는'), outside10: W('s10', '바깥쪽에'), same10: W('s10', '같은'), pull10: W('s10', '당기므로'), fast10: W('s10', '빨리'),
  both11: W('s11', '모두'), km11: W('s11', '백오십만'), moon11: W('s11', '달까지'), four11: W('s11', '네'),
  l3: W('s12', '엘쓰리는'), far12: W('s12', '건너편에'), l45: W('s12', '엘포와'), tri12: W('s12', '정삼각형을'), apex12: W('s12', '꼭짓점에'),
  s13: W('s13', '엘원'), pass13: W('s13', '고갯마루처럼'), nudge13: W('s13', '조금만'), away13: W('s13', '멀어지는'),
  jw14: W('s14', '제임스웹은'), around14: W('s14', '둘레를'), half14: W('s14', '반년에'), weeks14: W('s14', '주마다'), engine14: W('s14', '엔진을'), keep14: W('s14', '지킵니다'),
  rev15: W('s15', '반대로'), l45_15: W('s15', '엘포와'), nudge15: W('s15', '비켜나도'), circ15: W('s15', '맴돌며'), long15: W('s15', '오래'),
  jup16: W('s16', '목성의'), l45_16: W('s16', '엘포와'), sofar16: W('s16', '지금까지'), n16: W('s16', '만오천'), found16: W('s16', '발견되었습니다'),
  y1906: W('s17', '천구백육년'), achil17: W('s17', '아킬레우스처럼'), heroes17: W('s17', '영웅들의'), names17: W('s17', '이름을'), troy17: W('s17', '소행성이라고'),
  grav18: W('s18', '중력이'), cancel18: W('s18', '지워져'), zero18: W('s18', '영인'),
  no19: W('s19', '아닙니다'), remain19: W('s19', '남아'), exact19: W('s19', '꼭'), year19: W('s19', '일년에'), together19: W('s19', '함께'),
  lag20: W('s20', '라그랑주'),
};

const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
const rampUnits = (t, t0, t1, x0, x1) => lerp(x0, x1, easeInOut((t - t0) / (t1 - t0)));
/** ∫ (1 − smooth((s − ta)/(tb − ta))) ds from t to tb (for the co-rotating camera) */
function remaining(t, ta, tb) { if (t >= tb) return 0; let acc = 0; const n = 200, a = Math.max(t, ta); if (t < ta) acc += ta - t; for (let i = 0; i < n; i++) { const s = a + (tb - a) * (i + 0.5) / n; acc += (1 - smooth((s - ta) / (tb - ta))) * (tb - a) / n; } return acc; }
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // ---- hook: poster (rotating frame, still) → the whole picture turns as one (inertial view)
  P.turn0 = MORPH[1];
  P.jwst = at(A.jwst2) - 0.1; P.km = at(A.km2) - 0.05; P.along = at(A.along2) - 0.1;
  // ---- origin
  P.tl1767 = at(A.y1767) - 0.1; P.euler = at(A.euler) - 0.05; P.lineIn = at(A.line3) - 0.1; P.three = [0, 1, 2].map(k => at(A.three3) - 0.05 + 0.22 * k);
  P.tl1772 = at(A.y1772) - 0.1; P.lag = at(A.lag4) - 0.05; P.two = [0, 1].map(k => at(A.two4) - 0.1 + 0.25 * k); P.labels = [0, 1, 2, 3, 4].map(k => at(A.five4) - 0.05 + 0.16 * k); P.name = at(A.name4) - 0.1;
  // ---- essence
  P.fast = at(A.fast5) - 0.1; P.e0 = P.fast;                               // inner, Earth, outer line up when "빨리" is said
  P.s05 = at('s05') - 0.6; P.arcsOut = at('s07') - 0.25; P.slow = at(A.slow5) - 0.1; P.ahead = at(A.ahead6) - 0.05; P.behind = at(A.behind6) - 0.05;
  P.gravOn = at(A.grav7) - 0.05; P.lock = at(A.add7) + 0.15; P.five = [0, 1, 2].map(k => at(A.five7) - 0.05 + 0.18 * k);
  P.probe8 = at(A.two8) - 0.15; P.slide8 = [at(A.sum8) - 0.2, at(A.exact8) - 0.05]; P.bars8 = [at(A.two8) - 0.05, at(A.grav8) - 0.05, at(A.sum8) + 0.05, at(A.need8) - 0.05]; P.fit8 = at(A.fit8) - 0.1;
  P.lockAngle = null;
  // quarter-revolution ticks (inner / Earth / outer, Sun only) until the lock; then Earth + L1 + L2 together
  const quarters = (w, tRef, t0, t1) => { const out = [], q = (TAU / 4) / (w * OMEGA_S); for (let k = Math.ceil((t0 - tRef) / q); ; k++) { const tt = tRef + k * q; if (tt >= t1) break; if (tt > t0) out.push(+tt.toFixed(4)); } return out; };
  P.tickE = quarters(1, P.e0, P.s05, P.lock); P.tickIn = quarters(keplerOmega(LP.L1[0]), P.e0, P.s05, P.lock); P.tickOut = quarters(keplerOmega(LP.L2[0]), P.e0, P.s05, P.lock);
  P.tickLock = quarters(1, P.e0, P.lock, at('s07:end') + 0.4);
  // ---- l1l2
  P.l1 = at(A.l1) - 0.1; P.slideL1 = [at(A.l1) + 0.2, at(A.less9) + 0.1]; P.oppL1 = at(A.opp9) - 0.05; P.slowL1 = at(A.slow9) - 0.1;
  P.l2 = at(A.l2) - 0.15; P.slideL2 = [at(A.outside10) - 0.1, at(A.pull10) + 0.3]; P.sameL2 = at(A.same10) - 0.05; P.fastL2 = at(A.fast10) - 0.1;
  P.real = at('s11') - 0.45; P.km11 = at(A.km11) - 0.05; P.moonSeg = [0, 1, 2, 3].map(k => at(A.four11) - 0.35 + 0.2 * k);
  P.probeX = t => (t < P.l2 - 0.2 ? rampUnits(t, P.slideL1[0], P.slideL1[1], 0.72, LP.L1[0]) : rampUnits(t, P.slideL2[0], P.slideL2[1], 1.28, LP.L2[0]));
  // ---- five: inertial → co-rotating camera
  P.f0 = sc('five').start;
  P.camA = P.f0 + 0.15; P.camB = at(A.far12) + 0.3;
  P.l3 = at(A.l3) - 0.1; P.tri = at(A.tri12) - 0.1; P.apex = at(A.apex12) - 0.1;
  // ---- stability
  P.nudge = at(A.nudge13) - 0.05; P.saddle = at(A.pass13) - 0.1;
  P.driftT = t => Math.max(0, t - P.nudge) * DRIFT.rate;
  P.offMap = P.nudge + firstBeyond(SIM_L2, LP.L2, 0.45) / DRIFT.rate;
  P.halo0 = at(A.jw14) - 0.3; P.HALO_S = 4.0;
  P.burns = []; for (let k = 1; ; k++) { const tt = P.halo0 + 0.5 + k * P.HALO_S / 4; if (tt > sc('stability').end - 0.2 || tt > at('s15') - 0.4) break; P.burns.push(+tt.toFixed(4)); }
  P.tad0 = at(A.rev15) - 0.05;
  P.tadT = t => Math.max(0, t - P.tad0) * TAD.rate;
  P.tadTurns = []; { let prev = null; for (let tt = P.tad0; tt < sc('stability').end; tt += 1 / 120) { const s = sampleAt(SIM_L4, P.tadT(tt)), a = angFromSun(s[0], s[1]); if (prev != null && Math.sign(a - prev.a) !== Math.sign(prev.d) && prev.d !== 0) P.tadTurns.push(+tt.toFixed(4)); prev = {a, d: prev ? a - prev.a : 0}; } }
  // ---- trojans
  P.j0 = sc('trojans').start; P.count = [at(A.n16) - 0.6, at(A.found16) + 0.2];
  P.y1906 = at(A.y1906) - 0.1; P.achil = at(A.achil17) - 0.05; P.names = [at(A.heroes17) - 0.05, at(A.names17) - 0.05, at(A.names17) + 0.35]; P.camps = at(A.troy17) - 0.15;
  // ---- myth
  P.m0 = sc('myth').start; P.armSun = at(A.grav18) - 0.05; P.armEarth = at(A.grav18) + 0.4; P.qZero = at(A.zero18) - 0.15;
  P.no = at(A.no19) - 0.05; P.net = at(A.remain19) - 0.1; P.need = at(A.year19) - 0.1; P.ghost = at(A.no19) + 0.2;
  // ---- close
  P.poster = at(A.lag20) - 0.1;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Precomputed pictures: potential shading + contour segments (rotating frame, μ = MU)
// =====================================================================================================
export const LEVELS = (() => {
  const p1 = Phi(...LP.L1), p2 = Phi(...LP.L2), p3 = Phi(...LP.L3), p4 = Phi(...LP.L4);
  return [{v: -2.6, w: 1}, {v: -2.0, w: 1}, {v: -1.75, w: 1}, {v: -1.66, w: 1}, {v: p1, w: 1.6, key: 'L1'}, {v: p2, w: 1.6, key: 'L2'}, {v: (p2 + p3) / 2, w: 1},
    {v: p3, w: 1.6, key: 'L3'}, {v: p3 + (p4 - p3) * 0.45, w: 1}, {v: p3 + (p4 - p3) * 0.8, w: 1}, {v: p4 - 0.0012, w: 1}];
})();
const SPAN = 1.62;
export const CONTOURS = (() => {
  const N = 300, h = 2 * SPAN / N, G = new Float64Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) G[j * (N + 1) + i] = Phi(-SPAN + i * h, -SPAN + j * h);
  return LEVELS.map(L => {
    const segs = [], v = L.v, xy = (i, j) => [-SPAN + i * h, -SPAN + j * h];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = G[j * (N + 1) + i], b = G[j * (N + 1) + i + 1], c = G[(j + 1) * (N + 1) + i + 1], d = G[(j + 1) * (N + 1) + i];
      const [x0, y0] = xy(i, j); if (Math.hypot(x0 + MU, y0) < 0.02 || Math.hypot(x0 - 1 + MU, y0) < 0.01) continue;
      const pts = [];
      const e = (p, q, f0, f1) => { if ((f0 < v) !== (f1 < v)) { const u = (v - f0) / (f1 - f0); pts.push([lerp(p[0], q[0], u), lerp(p[1], q[1], u)]); } };
      const P0 = [x0, y0], P1 = [x0 + h, y0], P2 = [x0 + h, y0 + h], P3 = [x0, y0 + h];
      e(P0, P1, a, b); e(P1, P2, b, c); e(P2, P3, c, d); e(P3, P0, d, a);
      if (pts.length >= 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      if (pts.length === 4) segs.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
    }
    return {...L, segs: Float32Array.from(segs)};
  });
})();
const SHADE = (() => {
  const S = 560, cv = createCanvas(S, S), c = cv.getContext('2d'), img = c.createImageData(S, S), p4 = Phi(...LP.L4);
  const lo = [0, 22, 33], mid = [8, 58, 74], hi = [44, 120, 128];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = -SPAN + (i + 0.5) / S * 2 * SPAN, y = SPAN - (j + 0.5) / S * 2 * SPAN, r = Math.hypot(x, y), f = Phi(x, y);
    const q = clamp((f + 2.1) / (p4 + 2.1)) ** 2.2, col = q < 0.6 ? lo.map((v, k) => lerp(v, mid[k], q / 0.6)) : mid.map((v, k) => lerp(v, hi[k], (q - 0.6) / 0.4));
    const o = (j * S + i) * 4, a = clamp((SPAN - r) / 0.18) * 0.95;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(a * 255);
  }
  c.putImageData(img, 0, 0); return cv;
})();

// =====================================================================================================
// Background, palette, helpers
// =====================================================================================================
const STARS = (() => { const R = rng(1772), s = []; for (let i = 0; i < 260; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 1250; s.push({a, d, r: 0.5 + 1.3 * R() ** 3, al: 0.12 + 0.5 * R() ** 2, c: R()}); } return s; })();
let STAR_ROT = 0, STAR_C = [540, 900];
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, '#02202C'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const id = ctx.scene.id; STAR_ROT = 0; STAR_C = [540, 900];
  if (id === 'five') { const P = plan(ctx.tl), V = fiveView(t, P); STAR_ROT = V.rot - earthAngle(t, P.f0); STAR_C = [V.cx, V.cy]; }
  for (const s of STARS) { const a = s.a + STAR_ROT, x = STAR_C[0] + s.d * Math.cos(a), y = STAR_C[1] - s.d * Math.sin(a); if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue; c.globalAlpha = s.al * 0.6; circle(c, x, y, s.r, s.c > 0.82 ? '#FFE9C8' : '#DCEBFF'); }
  c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H * 0.44, H * 0.3, W / 2, H * 0.44, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
export const PAL = {sun: '#FFD27A', sunCore: '#FFF6DE', earth: '#5AAEFF', earthDark: '#123E73', inner: '#6FE3D2', outer: '#C9A2FF', need: '#FFC24A',
  sum: '#F4EEE2', orbit: '#2C5A68', jup: '#D9AE7E', jupDark: '#5C3A1E', burn: '#FF9C5A', bad: '#FF8A7A', good: '#9EE6A8', moon: '#C9CDD6', cont: '#3E8C99'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.25, b = 0.25) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 26, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 64 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.82), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.8, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 820, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 34, color: T.accent, align: 'center', ...so}));
}
const fmt = (n, d = 2) => n.toFixed(d);
const comma = n => Math.round(n).toLocaleString('en-US');

// ---- a view: model (x, y) → screen; rot = angle of the co-rotating frame (CCW, radians)
const view = (cx, cy, R, rot = 0) => ({cx, cy, R, rot,
  P(x, y) { const c = Math.cos(this.rot), s = Math.sin(this.rot); return [this.cx + this.R * (x * c - y * s), this.cy - this.R * (x * s + y * c)]; },
  dir(x, y) { const c = Math.cos(this.rot), s = Math.sin(this.rot); return [x * c - y * s, -(x * s + y * c)]; }});
export const earthAngle = (t, t0, phase = 0) => phase + OMEGA_S * (t - t0);
function drawShade(c, V, a) {
  if (a <= 0) return; const S = SPAN * V.R;
  withAlpha(c, a, () => { c.save(); c.translate(V.cx, V.cy); c.rotate(-V.rot); c.imageSmoothingEnabled = true; c.drawImage(SHADE, -S, -S, 2 * S, 2 * S); c.restore(); });
}
function drawContours(c, V, a, o = {}) {
  if (a <= 0) return;
  for (const L of CONTOURS) {
    const hi = o.hi && L.key && o.hi.includes(L.key), col = hi ? o.hiCol || PAL.need : PAL.cont, al = a * (L.key ? 0.75 : 0.5) * (hi ? 1.3 : 1);
    c.beginPath(); const s = L.segs;
    for (let k = 0; k < s.length; k += 4) { const p = V.P(s[k], s[k + 1]), q = V.P(s[k + 2], s[k + 3]); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
    c.strokeStyle = rgba(col, clamp(al)); c.lineWidth = L.w * (hi ? 1.6 : 1); c.stroke();
  }
}
function sunBody(c, x, y, r, a = 1) {
  withAlpha(c, a, () => { glow(c, x, y, r * 4.2, '#FFB04A', 0.22); glow(c, x, y, r * 2.1, '#FFD27A', 0.45); sphere(c, x, y, r, PAL.sunCore, {shade: '#E8A23A', light: '#FFFFFF'}); });
}
function earthBody(c, x, y, r, a = 1) {
  withAlpha(c, a, () => { glow(c, x, y, r * 2.6, PAL.earth, 0.25); sphere(c, x, y, r, PAL.earth, {shade: PAL.earthDark, light: '#E8F4FF'}); });
}
function satDot(c, x, y, col, a = 1, r = 7) { withAlpha(c, a, () => { glow(c, x, y, r * 2.6, col, 0.3); circle(c, x, y, r, col); ring(c, x, y, r + 2, rgba('#FFFFFF', 0.6), 1.2); }); }
function lMark(stage, x, y, name, a = 1, o = {}) {
  if (a <= 0) return; const c = stage.ctx, col = o.col || PAL.need, pulse = o.pulse || 0;
  withAlpha(c, a, () => {
    glow(c, x, y, 26 + 30 * pulse, col, 0.32 + 0.4 * pulse);
    ring(c, x, y, 11 + 6 * pulse, col, 2.6); circle(c, x, y, 4.2, '#FFF4D8');
  });
  if (name && (o.labelA ?? 1) > 0) {
    const [dx, dy] = o.lab || [0, -34];
    withAlpha(c, a * (o.labelA ?? 1), () => stage.text(name, x + dx, y + dy, {role: 'display', weight: 700, size: o.size || 28, color: col, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 8}));
  }
}
function jwstIcon(c, x, y, s, ang, a = 1) {
  // ang: direction (screen radians) pointing away from the Sun; sunshield faces the Sun, gold mirror faces away
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.rotate(ang);
    for (let k = 4; k >= 0; k--) poly(c, [[-0.25 * s - k * 0.6, -1.25 * s], [-0.25 * s - k * 0.6 - 0.32 * s, 0], [-0.25 * s - k * 0.6, 1.25 * s], [-0.25 * s - k * 0.6 + 0.32 * s, 0]], rgba(k ? '#8E8FB8' : '#D9D6F2', k ? 0.55 : 0.95), rgba('#F2F0FF', 0.6), 1);
    const hx = (cx, cy, r) => poly(c, [...Array(6)].map((_, i) => [cx + r * Math.cos(i * Math.PI / 3), cy + r * Math.sin(i * Math.PI / 3)]), '#F2B544', '#7A4E12', 0.8);
    const r = 0.2 * s; hx(0.45 * s, 0, r); for (let i = 0; i < 6; i++) hx(0.45 * s + 1.75 * r * Math.cos(i * Math.PI / 3 + Math.PI / 6), 1.75 * r * Math.sin(i * Math.PI / 3 + Math.PI / 6), r);
    c.restore();
  });
}
/** force arrows panel: rows of arrows from a common zero; left = toward the Sun */
function forceRows(stage, x0, y0, vals, a, o = {}) {
  if (a <= 0) return; const c = stage.ctx, T = stage.theme, k = o.k || 200, dy = o.dy || 58;
  const rows = [['태양의 당김', vals.sun, PAL.sun, vals.aSun ?? 1], ['지구의 당김', vals.earth, PAL.earth, vals.aEarth ?? 1], ['합친 힘', vals.sum, PAL.sum, vals.aSum ?? 1], ['함께 돌기에 필요한 힘', vals.need, PAL.need, vals.aNeed ?? 1]];
  withAlpha(c, a, () => {
    panel(c, T, 92, y0 - 34, 856, dy * 4 + 22, 0.72);
    line(c, [[x0, y0 - 18], [x0, y0 + dy * 4 - 22]], rgba(T.muted, 0.6), 1.5, {dash: [5, 5]});
    stage.text('← 태양 쪽', x0 - 10, y0 - 14, {size: 24, weight: 500, color: T.muted, align: 'right'});
    rows.forEach(([nm, v, col, al], i) => {
      const y = y0 + i * dy; if (al <= 0) return;
      withAlpha(c, al, () => {
        stage.text(nm, 120, y + 12, {size: 24, weight: 700, color: col});
        const x1 = x0 - v * k, yy = y + 12;
        if (i === 3) { line(c, [[x0, yy], [x1, yy]], rgba(col, 0.95), 5, {dash: [10, 7], cap: 'butt'}); arrow(c, [lerp(x0, x1, 0.8), yy], [x1, yy], col, 5, {head: 14}); }
        else if (Math.abs(v) > 1e-3) arrow(c, [x0, yy], [x1, yy], col, i === 2 ? 7 : 5, {head: 15});
      });
    });
    if ((o.match ?? 0) > 0) withAlpha(c, o.match, () => {
      const y = y0 + 2.5 * dy + 12, x1 = x0 - vals.sum * k;
      line(c, [[x1, y - dy * 0.5 - 6], [x1, y + dy * 0.5 + 6]], PAL.good, 3);
      stage.text('꼭 맞음', x1 - 14, y, {size: 26, weight: 700, color: PAL.good, align: 'right'});
    });
  });
}

// =====================================================================================================
// Header titles and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '우주의 주차 자리는?'],
  origin: ['기원 · 1767년과 1772년', '오일러와 라그랑주'],
  essence: ['본질 · 1년을 6초로', '가까우면 빨리, 멀면 느리게'],
  l1l2: ['메커니즘 · L1 · 지구 질량 과장', '지구가 반대쪽으로 당긴다'],
  five: ['다섯 점', '지구와 함께 도는 눈으로 보면'],
  stability: ['안정성 · L1 · L2 · L3', '고갯마루: 비켜나면 멀어진다'],
  trojans: ['사례 · 태양과 목성', '트로이 소행성'],
  myth: ['오해 바로잡기', '힘이 0인 곳일까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'hook') return [[-Infinity, ...titles.hook], [P.jwst - 0.2, '제임스웹 · 크기와 거리 과장', '지구와 나란히 태양을 돈다']];
  if (id === 'essence') return [[-Infinity, ...titles.essence], [P.gravOn - 0.2, '본질 · 지구 질량 과장', '1년에 한 바퀴 도는 다섯 자리'], [P.probe8 - 0.25, '본질 · 힘의 균형', '합친 힘 = 필요한 힘']];
  if (id === 'l1l2') return [[-Infinity, ...titles.l1l2], [P.l2 - 0.1, '메커니즘 · L2', '둘이 같은 쪽으로 당긴다'], [P.real - 0.1, '실제 축척', '지구에서 약 150만 km']];
  if (id === 'five') return [[-Infinity, ...titles.five], [P.tri - 0.2, '다섯 점 · L4 · L5', '태양, 지구와 정삼각형']];
  if (id === 'stability') return [[-Infinity, ...titles.stability], [P.halo0 - 0.1, '제임스웹 · L2 둘레', '반년에 한 바퀴, 몇 주마다 분사'], [P.tad0 - 0.15, '안정성 · L4 · L5 · 1년을 1.5초로', '비켜나도 둘레를 맴돈다']];
  if (id === 'myth') return [[-Infinity, ...titles.myth], [P.no - 0.1, '오해 바로잡기', '힘은 남아 있다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, t); return; }
  if (id === 'close') {
    const a = smooth(ctx.scene.p / 0.05) * fadeOut(t, P.poster - 0.3, 0.3);
    if (a > 0) head(stage, '마지막 한 줄', '두 중력의 합 = 함께 도는 힘', a, a);
    progressBar(stage, t, ctx.tl.duration);
    if (t >= P.poster - 0.3) posterTitle(stage, t, 1 - easeInOut((t - P.poster) / 0.9), fadeIn(t, P.poster - 0.3, 0.5));
    return;
  }
  const L = titleList(id, ctx.tl), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook' && k === 0) {
    const aK = fadeIn(t, MORPH[1] - 0.05, 0.4) * a; head(stage, cur[1], cur[2], aK, a, '라그랑주 점 5곳', a);
  } else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out), id === 'hook' && k === 1 ? '라그랑주 점 5곳' : '', a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
const POSTER_Q = {y: 1170, y2: 1308, q: '우주의 주차 자리는', ans: '라그랑주 점 5곳'};
let QSIZE = 0, ASIZE = 0;
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 760, 92); ASIZE ||= fit(POSTER_Q.ans, 820, 170);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 34, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 1080, 0, 1420); g2.addColorStop(0, 'rgba(0,10,16,0)'); g2.addColorStop(0.28, 'rgba(0,10,16,0.62)'); g2.addColorStop(0.78, 'rgba(0,10,16,0.62)'); g2.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g2; c.fillRect(0, 1080, 1080, 340);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1});
    const x0 = 540 - (wb + wq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
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
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/lagrange-points/scenes.mjs --emit-sound');
}
export function modelSignature(tl) {
  const P = plan(tl);
  return `${LP.L1[0].toFixed(5)}/${LP.L2[0].toFixed(5)}/${TADPOLE_PERIOD.toFixed(2)}@${tl.duration.toFixed(3)}/${P.tickE.length}:${P.tickIn.length}:${P.tickOut.length}:${P.tickLock.length}/${P.burns.length}/${P.tadTurns.length}/${P.offMap.toFixed(3)}`;
}
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  l1l2(stage, t, p, ctx) { l1l2Scene(stage, t, ctx); },
  five(stage, t, p, ctx) { fiveScene(stage, t, ctx); },
  stability(stage, t, p, ctx) { stabilityScene(stage, t, ctx); },
  trojans(stage, t, p, ctx) { trojanScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ the poster system (rotating frame) used by hook / close
const POSTER_V = () => view(520, 740, 310, 0);
function systemPicture(stage, t, V, o = {}) {
  const c = stage.ctx, a = o.a ?? 1;
  drawShade(c, V, a * (o.shade ?? 0.9));
  drawContours(c, V, a * (o.cont ?? 1), {hi: o.hi});
  withAlpha(c, a * (o.orbit ?? 0.7), () => { const [x, y] = V.P(0, 0); ring(c, x, y, V.R * (1 - MU), rgba(PAL.orbit, 0.9), 1.6); });
  const [sx, sy] = V.P(...SUN), [ex, ey] = V.P(...EARTH);
  sunBody(c, sx, sy, o.sunR || 30, a);
  earthBody(c, ex, ey, o.earthR || 12, a);
  const names = ['L1', 'L2', 'L3', 'L4', 'L5'];
  for (const n of names) {
    const la = a * (o.L?.[n] ?? o.Lall ?? 1); if (la <= 0) continue;
    const [x, y] = V.P(...LP[n]);
    let lab = n === 'L1' ? [-4, -36] : n === 'L2' ? [6, -36] : n === 'L3' ? [0, -36] : n === 'L4' ? [0, -38] : [0, 40];
    if (Math.abs(V.rot) > 1e-6) { const [cx0, cy0] = V.P(0, 0), dx = x - cx0, dy = y - cy0, d = Math.hypot(dx, dy) || 1, sgn = n === 'L1' ? -1 : 1; lab = [sgn * dx / d * 36, sgn * dy / d * 36 + 2]; }
    lMark(stage, x, y, n, la, {lab, pulse: o.pulse?.[n] || 0, labelA: o.labels ?? 1, size: o.lsize || 30});
  }
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme;
  const rot = t < P.turn0 ? 0 : OMEGA_S * (t - P.turn0) * smooth((t - P.turn0) / 1.2) ** 0.5;
  const V = POSTER_V(); V.rot = rot;
  const dim = smooth((t - 3.2) / 1.5);                                   // after the opening, the map recedes
  const a2 = fadeIn(t, P.jwst, 0.5) * fadeOut(t, ctx.scene.end - 0.3, 0.3);
  const pg = 0.35 * (1 - dim);
  systemPicture(stage, t, V, {shade: lerp(0.95, 0.45, dim), cont: lerp(1, 0.4, dim), Lall: lerp(1, 0.35, dim), L: {L2: lerp(1, 0.35, dim) + 0.65 * a2}, labels: lerp(1, 0.6, dim), a: fadeOut(t, ctx.scene.end - 0.25, 0.25), pulse: {L1: pg, L2: pg, L3: pg, L4: pg, L5: pg}});
  if (a2 <= 0) return;
  // JWST at L2: aligned Sun–Earth–JWST line, motion trails
  const [sx, sy] = V.P(...SUN), [ex, ey] = V.P(...EARTH), [jx, jy] = V.P(...LP.L2);
  withAlpha(c, a2 * fadeIn(t, P.along, 0.5), () => {
    line(c, [[sx, sy], [jx + (jx - sx) * 0.08, jy + (jy - sy) * 0.08]], rgba(T.ink, 0.5), 1.6, {dash: [8, 7]});
    for (const [r, col] of [[1 - MU, PAL.earth], [LP.L2[0], PAL.need]]) { c.beginPath(); const [cx, cy] = V.P(0, 0); c.arc(cx, cy, V.R * r, -rot, -rot + 0.55); c.strokeStyle = rgba(col, 0.55); c.lineWidth = 3; c.stroke(); }
  });
  const away = Math.atan2(jy - sy, jx - sx);
  jwstIcon(c, jx + 24 * Math.cos(away - 1.57), jy + 24 * Math.sin(away - 1.57), 10, away, a2);   // just behind L2 along the orbit (label stays clear)
  // zoom inset near Earth (same picture, Sun–Earth line held still): JWST at L2, bracket 150만 km
  const ia = a2 * fadeIn(t, P.jwst + 0.3, 0.5);
  if (ia > 0) withAlpha(c, ia, () => {
    const y = 1205, X = u => 470 + (u - (1 - MU)) * 1500;
    line(c, [[ex, ey + 14], [X(1 - MU), 1088]], rgba(T.ink, 0.3), 1.4, {dash: [5, 6]});
    panel(c, T, 92, 1088, 896, 240, 0.82);
    line(c, [[120, y], [935, y]], rgba(T.ink, 0.4), 1.6, {dash: [8, 8]});
    stage.text('← 태양', 130, 1122, {size: 24, weight: 700, color: PAL.sun});
    earthBody(c, X(1 - MU), y, 14, 1); stage.text('지구', X(1 - MU), y + 40, {size: 24, weight: 700, color: PAL.earth, align: 'center'});
    lMark(stage, X(LP.L1[0]), y, 'L1', 0.6, {lab: [0, 40], size: 24});
    lMark(stage, X(LP.L2[0]), y, 'L2', 1, {lab: [0, 40], size: 24});
    jwstIcon(c, X(LP.L2[0]) + 40, y - 34, 24, 0, 1);
    stage.text('제임스웹', X(LP.L2[0]) + 100, y - 34, {size: 26, weight: 700, color: PAL.need});
    const ak = fadeIn(t, P.km, 0.4);
    if (ak > 0) withAlpha(c, ak, () => {
      const x0 = X(1 - MU), x1 = X(LP.L2[0]), yb = y - 66;
      line(c, [[x0, yb], [x1, yb]], PAL.need, 2.4); line(c, [[x0, yb - 9], [x0, yb + 9]], PAL.need, 2.4); line(c, [[x1, yb - 9], [x1, yb + 9]], PAL.need, 2.4);
      stage.text('150만 km', (x0 + x1) / 2, yb - 24, {role: 'display', size: 30, weight: 700, color: PAL.need, align: 'center'});
    });
    stage.text('지구 곁 확대', 920, 1122, {size: 24, weight: 500, color: T.muted, align: 'right'});
  });
  // year counter (the picture turns once per 6 s)
  const yrs = Math.max(0, (t - P.turn0) / YEAR_S);
  tag(stage, `지구 공전 ${yrs.toFixed(1)}년 · 1년 = 6초`, 540, 352, {a: a2 * 0.95, size: 24, weight: 500, color: T.muted, plate: false});
}

// ------------------------------------------------------------------ origin: Euler 1767 (three points on a line), Lagrange 1772 (two more)
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx);
  // timeline
  withAlpha(c, a, () => {
    const y = 420, x0 = 170, x1 = 910, X = yr => lerp(x0, x1, (yr - 1765) / 10);
    line(c, [[x0, y], [x1, y]], rgba(T.muted, 0.7), 2);
    for (let yr = 1765; yr <= 1775; yr += 5) { line(c, [[X(yr), y - 8], [X(yr), y + 8]], rgba(T.muted, 0.7), 2); stage.text(String(yr), X(yr), y + 30, {size: 24, color: T.muted, align: 'center'}); }
    const cur = t < P.tl1767 ? 1765 : t < P.tl1772 ? lerp(1765, 1767, easeOut((t - P.tl1767) / 0.8)) : lerp(1767, 1772, easeOut((t - P.tl1772) / 0.8));
    circle(c, X(cur), y, 7, T.accent);
    for (const [yr, t0, nm, sub] of [[1767, P.tl1767, '1767 · 오일러', '스위스 · 직선 위 세 점'], [1772, P.tl1772, '1772 · 라그랑주', '토리노 출신 · 두 점 더']]) {
      const q = fadeIn(t, t0 + 0.5, 0.4); if (q <= 0) continue;
      withAlpha(c, q, () => { circle(c, X(yr), y, 10, T.accent); ring(c, X(yr), y, 16, rgba(T.accent, 0.6), 2);
        stage.text(nm, X(yr), y - 44, {role: 'display', weight: 700, size: 32, color: T.ink, align: yr === 1767 ? 'center' : 'center'});
        stage.text(sub, X(yr), y + 66, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
    }
  });
  // diagram: two bodies and their points turn together (one rigid rotation = "함께 돈다")
  const V = view(540, 900, 270, 0.35 + TAU * (t - ctx.scene.start) / 26);
  const lineA = a * fadeIn(t, P.lineIn, 0.6), triA = a * fadeIn(t, P.two[0], 0.6);
  withAlpha(c, a * 0.8, () => { const [x, y] = V.P(0, 0); ring(c, x, y, V.R * (1 - MU), rgba(PAL.orbit, 0.8), 1.5, 0, TAU); });
  if (lineA > 0) withAlpha(c, lineA, () => {
    const g = easeOut((t - P.lineIn) / 0.9), p0 = V.P(lerp(0.5, -1.25, g), 0), p1 = V.P(lerp(0.5, 1.32, g), 0);
    line(c, [p0, p1], rgba(T.ink, 0.6), 2, {dash: [10, 8]});
  });
  if (triA > 0) withAlpha(c, triA, () => {
    for (const n of ['L4', 'L5']) { const q = easeOut((t - P.two[n === 'L4' ? 0 : 1]) / 0.6); const s = V.P(...SUN), e = V.P(...EARTH), l = V.P(...LP[n]);
      line(c, [s, [lerp(s[0], l[0], q), lerp(s[1], l[1], q)]], rgba(PAL.need, 0.55), 2); line(c, [e, [lerp(e[0], l[0], q), lerp(e[1], l[1], q)]], rgba(PAL.need, 0.55), 2); }
  });
  const [sx, sy] = V.P(...SUN), [ex, ey] = V.P(...EARTH);
  sunBody(c, sx, sy, 30, a); earthBody(c, ex, ey, 12, a);
  tag(stage, '큰 천체', sx, sy + 62, {a: a * (1 - fadeIn(t, P.three[0], 0.4)), size: 24, weight: 500, color: T.muted});
  tag(stage, '작은 천체', ex, ey + 40, {a: a * (1 - fadeIn(t, P.three[0], 0.4)), size: 24, weight: 500, color: T.muted});
  const pts = [['L1', P.three[0]], ['L2', P.three[1]], ['L3', P.three[2]], ['L4', P.two[0] + 0.45], ['L5', P.two[1] + 0.45]];
  pts.forEach(([n, t0], i) => {
    const q = a * fadeIn(t, t0, 0.3), [x, y] = V.P(...LP[n]); if (q <= 0) return;
    const pulse = Math.max(0, 1 - (t - t0) / 0.7) * (t >= t0 ? 1 : 0);
    const [cx0, cy0] = V.P(0, 0), dx = x - cx0, dy = y - cy0, d = Math.hypot(dx, dy) || 1, sgn = n === 'L1' ? -1 : 1;
    lMark(stage, x, y, n, q, {pulse, labelA: fadeIn(t, P.labels[i], 0.3), lab: [sgn * dx / d * 38, sgn * dy / d * 38 + 2]});
  });
  const an = a * fadeIn(t, P.name, 0.5);
  if (an > 0) tag(stage, '라그랑주 점 · Lagrange points', 540, 1290, {a: an, size: 34, color: PAL.need});
}

// ------------------------------------------------------------------ essence: Kepler speeds → Earth's pull → five places → force balance
const ESS_V = (t, P) => view(540, 718, 268, 0);
export function essenceState(t, P) {
  // angles (math radians) of inner / Earth / outer; before the lock Sun-only Kepler rates, after it all at ω = 1
  const th0 = Math.PI * 0.62, dt = t - P.e0;
  const e = th0 + OMEGA_S * dt;
  if (t < P.lock) return {earth: e, inner: th0 + OMEGA_S * keplerOmega(LP.L1[0]) * dt, outer: th0 + OMEGA_S * keplerOmega(LP.L2[0]) * dt, locked: false};
  return {earth: e, inner: e, outer: e, locked: true};
}
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx), V = ESS_V(t, P), S = essenceState(t, P);
  const [cx, cy] = V.P(0, 0), on = fadeIn(t, P.gravOn, 0.5);
  // rings
  withAlpha(c, a, () => {
    ring(c, cx, cy, V.R * (1 - MU), rgba(PAL.orbit, 0.95), 1.8);
    const ra = 1 - fadeIn(t, P.lock - 0.2, 0.5) * 0.6;
    ring(c, cx, cy, V.R * LP.L1[0], rgba(PAL.inner, 0.35 * ra), 1.4); ring(c, cx, cy, V.R * LP.L2[0], rgba(PAL.outer, 0.35 * ra), 1.4);
  });
  // the five-point map appears faintly after the lock (rotating with Earth)
  const Vr = view(V.cx, V.cy, V.R, S.earth); const mapA = a * fadeIn(t, P.five[0] - 0.3, 0.8) * 0.55;
  drawContours(c, Vr, mapA * 0.8);
  sunBody(c, cx, cy, 30, a);
  const pos = th => [cx + V.R * Math.cos(th), cy - V.R * Math.sin(th)];
  const posR = (r, th) => [cx + V.R * r * Math.cos(th), cy - V.R * r * Math.sin(th)];
  const [ex, ey] = posR(1 - MU, S.earth);
  // Earth's gravity switched on
  if (on > 0) withAlpha(c, a * on, () => { const pu = Math.max(0, 1 - (t - P.gravOn) / 1.2); ring(c, ex, ey, 30 + 40 * (1 - pu), rgba(PAL.earth, 0.6 * pu + 0.25), 2); glow(c, ex, ey, 60, PAL.earth, 0.18); });
  earthBody(c, ex, ey, 13, a);
  { const u = [(ex - cx) / Math.hypot(ex - cx, ey - cy), (ey - cy) / Math.hypot(ex - cx, ey - cy)]; tag(stage, '지구', ex - u[1] * 40, ey + u[0] * 40, {a: a * (1 - fadeIn(t, P.lock - 0.3, 0.3)), size: 26, color: PAL.earth, plate: false}); }
  // the two satellites: fade out at the drift positions, reappear at L1 / L2 aligned with Earth
  const swap = clamp((t - (P.lock - 0.35)) / 0.35), aOld = 1 - smooth(swap), aNew = fadeIn(t, P.lock, 0.35);
  const preLock = essenceState(Math.min(t, P.lock - 0.001), P);
  if (aOld > 0) {
    const [ix, iy] = posR(LP.L1[0], preLock.inner), [ox, oy] = posR(LP.L2[0], preLock.outer);
    satDot(c, ix, iy, PAL.inner, a * aOld); satDot(c, ox, oy, PAL.outer, a * aOld);
    const la = a * aOld * fadeIn(t, ctx.scene.start + 0.3, 0.4);
    tag(stage, '안쪽 위성', ix + 0, iy + 34, {a: la, size: 24, color: PAL.inner, plateA: 0.7});
    tag(stage, '바깥쪽 위성', ox + 0, oy - 34, {a: la, size: 24, color: PAL.outer, plateA: 0.7});
    // "빨리 / 느리게" period readouts
    const pa = a * aOld * fadeIn(t, P.fast, 0.4);
    if (pa > 0) withAlpha(c, pa, () => {
      panel(c, T, 150, 1140, 780, 150, 0.75);
      const cols = [['안쪽', `${fmt(1 / keplerOmega(LP.L1[0]))}년`, PAL.inner, P.fast], ['지구', '1년', PAL.earth, P.fast], ['바깥쪽', `${fmt(1 / keplerOmega(LP.L2[0]))}년`, PAL.outer, P.slow]];
      stage.text('한 바퀴에 걸리는 시간 (태양만 있을 때)', 540, 1172, {size: 24, weight: 500, color: T.muted, align: 'center'});
      cols.forEach(([n, v, col, t0], i) => { const q = fadeIn(t, t0, 0.4); const x = 280 + i * 260;
        withAlpha(c, q, () => { stage.text(n, x, 1218, {size: 26, weight: 700, color: col, align: 'center'}); stage.text(v, x, 1260, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'}); }); });
    });
    // lead / lag arcs
    for (const [t0, th1, col, txt, r] of [[P.ahead, preLock.inner, PAL.inner, '앞지름', LP.L1[0] - 0.09], [P.behind, preLock.outer, PAL.outer, '뒤처짐', LP.L2[0] + 0.1]]) {
      const q = a * aOld * fadeIn(t, t0, 0.4) * fadeOut(t, P.arcsOut, 0.3); if (q <= 0) continue;
      withAlpha(c, q, () => { let d = th1 - S.earth; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        c.beginPath(); c.arc(cx, cy, V.R * r, -S.earth, -(S.earth + d), d > 0); c.strokeStyle = col; c.lineWidth = 4; c.stroke();
        const [tx, ty] = posR(r + (r < 1 ? -0.16 : 0.13), S.earth + d / 2); stage.text(txt, tx, ty, {role: 'display', size: 30, weight: 700, color: col, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 8}); });
    }
  }
  if (aNew > 0) {
    const L1p = posR(LP.L1[0], S.earth), L2p = posR(LP.L2[0], S.earth);
    satDot(c, ...L1p, PAL.inner, a * aNew); satDot(c, ...L2p, PAL.outer, a * aNew);
    withAlpha(c, a * aNew * 0.6, () => line(c, [[cx, cy], L2p], rgba(T.ink, 0.45), 1.4, {dash: [7, 7]}));
    // three more points
    ['L3', 'L4', 'L5'].forEach((n, i) => { const q = a * fadeIn(t, P.five[i], 0.3); if (q <= 0) return; const [x, y] = Vr.P(...LP[n]); lMark(stage, x, y, n, q, {pulse: Math.max(0, 1 - (t - P.five[i]) / 0.7), size: 28, lab: n === 'L5' ? [0, 38] : [0, -36]}); });
    const lq = a * fadeIn(t, P.five[0], 0.3);
    if (lq > 0) { lMark(stage, L1p[0], L1p[1], '', lq * 0.9); lMark(stage, L2p[0], L2p[1], '', lq * 0.9);
      const lab = (p, n, s) => { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy); stage.text(n, p[0] + dx / d * 34 * s + (-dy / d) * 0, p[1] + dy / d * 34 * s - 6, {role: 'display', weight: 700, size: 28, color: PAL.need, align: 'center', alpha: lq, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 8}); };
      lab(L1p, 'L1', -1); lab(L2p, 'L2', 1); }
    const yrA = a * fadeIn(t, P.lock, 0.4) * fadeOut(t, P.probe8 - 0.3, 0.3);
    if (yrA > 0) withAlpha(c, yrA, () => {
      panel(c, T, 150, 1140, 780, 150, 0.75);
      stage.text('지구의 중력까지 더하면', 540, 1172, {size: 24, weight: 500, color: T.muted, align: 'center'});
      [['L1', PAL.inner], ['지구', PAL.earth], ['L2', PAL.outer]].forEach(([n, col], i) => { const x = 280 + i * 260; stage.text(n, x, 1218, {size: 26, weight: 700, color: col, align: 'center'}); stage.text('1년', x, 1260, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'}); });
    });
  }
  // force balance with a probe sliding along the Sun–Earth line to L1
  const fa = a * fadeIn(t, P.probe8, 0.4);
  if (fa > 0) {
    const x = rampUnits(t, P.slide8[0], P.slide8[1], 0.70, LP.L1[0]), pp = posR(x, S.earth);
    withAlpha(c, fa, () => { ring(c, pp[0], pp[1], 20, rgba(T.ink, 0.95), 2.4); circle(c, pp[0], pp[1], 5, T.ink); });
    const vals = {sun: sunPull(x), earth: earthPull(x), sum: forceIn(x), need: forceNeed(x), aSun: fadeIn(t, P.bars8[0], 0.3), aEarth: fadeIn(t, P.bars8[1], 0.3), aSum: fadeIn(t, P.bars8[2], 0.3), aNeed: fadeIn(t, P.bars8[3], 0.3)};
    forceRows(stage, 760, 1112, vals, fa, {match: fadeIn(t, P.fit8, 0.3), dy: 56});
  }
}

// ------------------------------------------------------------------ l1l2: line diagram ① + force rows ② + force graph ③ (tracked probe), then real scale
const LX = x => 540 + (x - (1 - MU)) * 1300;
const GR = {x0: 0.70, x1: 1.28, y0: 1300, yTop: 985, fMin: -0.5, fMax: 2.0};
const GY = f => lerp(GR.y0, GR.yTop, (clamp(f, GR.fMin, GR.fMax) - GR.fMin) / (GR.fMax - GR.fMin));
function l1l2Scene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx);
  const dash = a * fadeOut(t, P.real, 0.45), realA = a * fadeIn(t, P.real + 0.3, 0.5);
  const x = P.probeX(t), onL2 = t >= P.l2 - 0.2, isL1 = !onL2;
  if (dash > 0) {
    // ① line diagram
    withAlpha(c, dash, () => {
      const y = 500;
      glow(c, -40, y, 260, '#FFB04A', 0.35); sunBody(c, -10, y, 70, 1);
      line(c, [[60, y], [935, y]], rgba(T.ink, 0.45), 2, {dash: [10, 8]});
      stage.text('← 태양', 140, y - 52, {size: 26, weight: 700, color: PAL.sun});
      for (const [r, col] of [[LP.L1[0], PAL.inner], [1 - MU, PAL.earth], [LP.L2[0], PAL.outer]]) {   // short arcs of each 1-year circle
        const R = r * 1300, cx = LX(-MU); c.beginPath(); c.arc(cx, y, R, -0.06, 0.06); c.strokeStyle = rgba(col, 0.45); c.lineWidth = 2; c.stroke();
      }
      earthBody(c, LX(1 - MU), y, 16, 1);
      stage.text('지구', LX(1 - MU), y + 50, {size: 26, weight: 700, color: PAL.earth, align: 'center'});
      lMark(stage, LX(LP.L1[0]), y, 'L1', isL1 ? 1 : 0.55, {lab: [0, 48]});
      lMark(stage, LX(LP.L2[0]), y, 'L2', onL2 ? 1 : 0.55, {lab: [0, 48]});
      // probe (tracked object) + its 1-year speed vs Sun-only speed
      const px = LX(x); ring(c, px, y, 24, T.ink, 2.6); satDot(c, px, y, isL1 ? PAL.inner : PAL.outer, 1, 7);
      const vq = isL1 ? fadeIn(t, P.slowL1, 0.4) : fadeIn(t, P.fastL2, 0.4);
      if (vq > 0) withAlpha(c, vq, () => {
        const vk = Math.sqrt((1 - MU) / (x + MU)), v1 = x, k = 95;
        arrow(c, [px - 14, y], [px - 14, y - vk * k], rgba(T.muted, 0.9), 3, {head: 11}); stage.text('태양만', px - 22, y - vk * k - 16, {size: 24, weight: 500, color: T.muted, align: 'right'});
        arrow(c, [px + 14, y], [px + 14, y - v1 * k], PAL.need, 4, {head: 12}); stage.text(isL1 ? '실제: 더 천천히' : '실제: 더 빨리', px + 24, y - v1 * k - 16, {size: 24, weight: 700, color: PAL.need});
      });
      // tracking connector to the graph
      line(c, [[px, y + 70], [px, GY(GR.fMax) - 10]], rgba(T.ink, 0.25), 1.2, {dash: [4, 6]});
    });
    // ② force rows
    const vals = {sun: sunPull(x), earth: earthPull(x), sum: forceIn(x), need: forceNeed(x)};
    const settled = isL1 ? fadeIn(t, P.slideL1[1], 0.3) : fadeIn(t, P.slideL2[1], 0.3);
    forceRows(stage, 760, 652, vals, dash * fadeIn(t, ctx.scene.start + 0.2, 0.4), {match: settled, dy: 54});
    // ③ graph
    withAlpha(c, dash, () => {
      const X0 = LX(GR.x0), X1 = LX(GR.x1);
      line(c, [[X0, GY(0)], [X1, GY(0)]], rgba(T.muted, 0.7), 1.5); line(c, [[X0, GR.y0 + 6], [X0, GR.yTop - 6]], rgba(T.muted, 0.7), 1.5);
      stage.text('태양 쪽으로 당기는 힘', X0 + 10, GR.yTop - 18, {size: 24, weight: 500, color: T.muted});
      stage.text('0', X0 - 12, GY(0), {size: 24, color: T.muted, align: 'right'});
      // needed line
      line(c, [[X0, GY(GR.x0)], [X1, GY(GR.x1)]], PAL.need, 3, {dash: [10, 7], cap: 'butt'});
      // gravity sum curve (skip near Earth)
      for (const [u0, u1] of [[GR.x0, 1 - MU - 0.03], [1 - MU + 0.03, GR.x1]]) {
        const pts = []; for (let k = 0; k <= 120; k++) { const u = lerp(u0, u1, k / 120), f = forceIn(u); if (f < GR.fMin - 0.05 || f > GR.fMax + 0.05) continue; pts.push([LX(u), GY(f)]); }
        if (pts.length > 1) line(c, pts, PAL.sum, 3);
      }
      stage.text('합친 힘', LX(0.75), GY(forceIn(0.75)) - 22, {size: 24, weight: 700, color: PAL.sum, align: 'center'});
      stage.text('필요한 힘', LX(1.25), GY(1.25) - 26, {size: 24, weight: 700, color: PAL.need, align: 'center'});
      for (const n of ['L1', 'L2']) { const u = LP[n][0], gx = LX(u), gy = GY(u); circle(c, gx, gy, 7, PAL.need); stage.text(n, gx + (n === 'L1' ? -16 : 16), gy + 26, {role: 'display', size: 24, weight: 700, color: PAL.need, align: n === 'L1' ? 'right' : 'left'}); }
      // probe on the graph
      const gx = LX(x); line(c, [[gx, GY(GR.fMax)], [gx, GR.y0]], rgba(T.ink, 0.35), 1.2);
      ring(c, gx, GY(forceIn(x)), 9, T.ink, 2.4); ring(c, gx, GY(x), 9, PAL.need, 2.4);
      stage.text('태양–지구 선 위의 자리 →', X1, GR.y0 + 26, {size: 24, weight: 500, color: T.muted, align: 'right'});
    });
  }
  if (realA > 0) realScale(stage, t, P, realA);
}
function realScale(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, cx = 540, cy = 800, k = 370 / 1.5e6;
  const xL1 = cx - L12_KM[0] * k, xL2 = cx + L12_KM[1] * k, rm = MOON_KM * k;
  withAlpha(c, a, () => {
    line(c, [[70, cy], [935, cy]], rgba(T.ink, 0.35), 1.6, {dash: [8, 8]});
    ring(c, cx, cy, rm, rgba(PAL.moon, 0.55), 1.6);
    const ma = TAU * (t - P.real) / 4.0, mx = cx + rm * Math.cos(ma), my = cy - rm * Math.sin(ma); circle(c, mx, my, 5, PAL.moon);
    stage.text('달', mx + 14, my - 14, {size: 24, weight: 700, color: PAL.moon});
    earthBody(c, cx, cy, 9, 1); stage.text('지구', cx, cy + 40, {size: 26, weight: 700, color: PAL.earth, align: 'center'});
    lMark(stage, xL1, cy, 'L1', 1, {lab: [0, -40]}); lMark(stage, xL2, cy, 'L2', 1, {lab: [0, -40]});
    stage.text('← 태양까지 1억 5천만 km', 120, cy - 120, {size: 26, weight: 700, color: PAL.sun});
    const qa = fadeIn(t, P.km11, 0.4);
    withAlpha(c, qa, () => { for (const [x0, x1] of [[xL1, cx], [cx, xL2]]) { line(c, [[x0, cy + 90], [x1, cy + 90]], PAL.need, 2.4); line(c, [[x0, cy + 80], [x0, cy + 100]], PAL.need, 2.4); line(c, [[x1, cy + 80], [x1, cy + 100]], PAL.need, 2.4); }
      stage.text('약 150만 km', (xL1 + cx) / 2, cy + 124, {size: 26, weight: 700, color: PAL.need, align: 'center'});
      stage.text('약 150만 km', (xL2 + cx) / 2, cy + 124, {size: 26, weight: 700, color: PAL.need, align: 'center'}); });
    P.moonSeg.forEach((t0, i) => { const q = fadeIn(t, t0, 0.18); if (q <= 0) return;
      withAlpha(c, q, () => { const x0 = cx + i * rm, x1 = x0 + rm; rect(c, x0 + 2, cy - 60, rm - 4, 16, 3, rgba(PAL.moon, 0.75)); stage.text(String(i + 1), (x0 + x1) / 2, cy - 78, {size: 24, weight: 700, color: PAL.moon, align: 'center'}); }); });
    const fq = fadeIn(t, P.moonSeg[3] + 0.2, 0.3);
    if (fq > 0) tag(stage, '달까지 거리의 약 4배', cx + 2 * rm, cy - 124, {a: fq, size: 28, color: PAL.moon});
    tag(stage, '실제 축척 (지구·달 크기만 과장)', 540, 1060, {size: 24, weight: 500, color: T.muted, a: 0.95});
  });
}

// ------------------------------------------------------------------ five: inertial → co-rotating camera; L3, triangles to L4 / L5
export function fiveView(t, P) {
  // before camA the picture turns with Earth (inertial view); the camera then co-rotates; from camB Earth sits still on the right
  const V = view(540, 820, 300, 0);
  V.rot = -OMEGA_S * remaining(t, P.camA, P.camB);
  return V;
}
function fiveScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx), V = fiveView(t, P);
  const still = smooth((t - P.camA) / (P.camB - P.camA));
  systemPicture(stage, t, V, {a, shade: 0.35 + 0.35 * still, cont: 0.5 + 0.4 * still, L: {L1: 0.8, L2: 0.8, L3: fadeIn(t, P.l3 - 0.4, 0.4) * 0.6 + 0.4, L4: 0.75, L5: 0.75}, pulse: {L3: Math.max(0, 1 - Math.abs(t - P.l3 - 0.4) / 0.8), L4: Math.max(0, 1 - Math.abs(t - P.apex - 0.3) / 0.8), L5: Math.max(0, 1 - Math.abs(t - P.apex - 0.3) / 0.8)}});
  // camera indicator
  const camLabel = still < 0.5 ? '멈춘 눈: 모두가 돈다' : '함께 도는 눈: 다섯 점이 멈춘다';
  tag(stage, camLabel, 540, 1260, {a: a, size: 28, color: still < 0.5 ? T.muted : PAL.need});
  const tri = a * fadeIn(t, P.tri, 0.5);
  if (tri > 0) {
    const s = V.P(...SUN), e = V.P(...EARTH);
    for (const n of ['L4', 'L5']) {
      const l = V.P(...LP[n]), q = easeOut((t - P.tri) / 0.9);
      withAlpha(c, tri, () => {
        line(c, [s, [lerp(s[0], l[0], q), lerp(s[1], l[1], q)]], rgba(PAL.need, 0.85), 2.4);
        line(c, [e, [lerp(e[0], l[0], q), lerp(e[1], l[1], q)]], rgba(PAL.need, 0.85), 2.4);
        line(c, [s, e], rgba(PAL.need, 0.85), 2.4);
        // equal-side ticks
        for (const [p, r] of [[s, l], [e, l], [s, e]]) { const mx = (p[0] + r[0]) / 2, my = (p[1] + r[1]) / 2, dx = r[0] - p[0], dy = r[1] - p[1], d = Math.hypot(dx, dy), nx = -dy / d * 9, ny = dx / d * 9; line(c, [[mx - nx, my - ny], [mx + nx, my + ny]], PAL.need, 2.4); }
      });
    }
    withAlpha(c, tri * fadeIn(t, P.tri + 0.8, 0.4), () => { const [x4, y4] = V.P(...LP.L4); stage.text('60°', s[0] + 58, s[1] - 40, {size: 24, weight: 700, color: PAL.need}); stage.text('60°', s[0] + 58, s[1] + 40, {size: 24, weight: 700, color: PAL.need}); });
  }
}

// ------------------------------------------------------------------ stability: saddle (L1/L2 drift away), JWST halo with burns, L4 tadpole
const STAB_V = () => view(540, 640, 265, 0);
function mapFrame(stage, t, V, a, o = {}) {
  const c = stage.ctx;
  clipRect(c, 60, 340, 960, 640, 18, () => {
    drawShade(c, V, a * 0.95); drawContours(c, V, a, {hi: o.hi});
    withAlpha(c, a * 0.5, () => ring(c, V.cx, V.cy, V.R * (1 - MU), rgba(PAL.orbit, 0.9), 1.4));
    const [sx, sy] = V.P(...SUN), [ex, ey] = V.P(...EARTH); sunBody(c, sx, sy, 24, a); earthBody(c, ex, ey, 10, a);
    for (const n of ['L1', 'L2', 'L3', 'L4', 'L5']) { const [x, y] = V.P(...LP[n]); lMark(stage, x, y, n, a * (o.L?.[n] ?? 0.8), {size: 26, lab: n === 'L5' ? [0, 36] : n === 'L1' ? [-6, -32] : [0, -32], pulse: o.pulse?.[n] || 0}); }
  });
}
function stabilityScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx), V = STAB_V();
  const seg = t < P.halo0 ? 0 : t < P.tad0 ? 1 : 2;
  mapFrame(stage, t, V, a, {hi: seg === 0 ? ['L1', 'L2', 'L3'] : [], L: seg === 2 ? {L4: 1, L5: 1, L1: 0.5, L2: 0.5, L3: 0.5} : seg === 1 ? {L2: 1, L1: 0.5, L3: 0.5, L4: 0.5, L5: 0.5} : {}});
  // ① drift-away particles from L1 and L2 (same RK4 model)
  const d0 = a * fadeIn(t, P.nudge - 0.3, 0.3) * fadeOut(t, P.halo0, 0.4);
  if (d0 > 0) clipRect(c, 60, 340, 960, 640, 18, () => {
    for (const [S, col] of [[SIM_L1, PAL.inner], [SIM_L2, PAL.outer]]) {
      const tau = P.driftT(t), n = Math.min(S.length - 1, Math.floor(tau / 0.01)), pts = [];
      for (let i = 0; i <= n; i += 2) pts.push(V.P(S[i][0], S[i][1]));
      const s = sampleAt(S, tau);
      withAlpha(c, d0, () => { if (pts.length > 1) line(c, pts, rgba(col, 0.8), 2.6); satDot(c, ...V.P(s[0], s[1]), col, 1, 6); });
    }
  });
  // bottom panel ①: cross-section along the Sun–Earth line, ball on the L2 pass rolls off
  const pa = a * fadeOut(t, P.halo0 - 0.1, 0.35);
  if (pa > 0) withAlpha(c, pa, () => {
    panel(c, T, 92, 1010, 896, 320, 0.78);
    stage.text('태양–지구 선을 따라 자른 모양 (높을수록 비탈 위)', 540, 1042, {size: 24, weight: 500, color: T.muted, align: 'center'});
    const X = u => lerp(130, 950, (u + 1.35) / 2.75), f0 = Phi(...LP.L4), Y = f => lerp(1290, 1085, clamp((f + 1.95) / (f0 + 1.95 + 0.02), 0, 1.2));
    const pts = []; for (let k = 0; k <= 400; k++) { const u = lerp(-1.35, 1.38, k / 400); if (Math.abs(u + MU) < 0.06 || Math.abs(u - 1 + MU) < 0.025) { if (pts.length > 1) line(c, pts, PAL.cont, 3); pts.length = 0; continue; } pts.push([X(u), Y(Phi(u, 0))]); }
    if (pts.length > 1) line(c, pts, PAL.cont, 3);
    stage.text('태양 쪽 우물', X(-MU), 1268, {size: 24, weight: 700, color: PAL.sun, align: 'center'}); stage.text('지구', X(1 - MU) + 4, 1312, {size: 24, weight: 700, color: PAL.earth, align: 'center'});
    for (const n of ['L3', 'L1', 'L2']) { const u = LP[n][0]; circle(c, X(u), Y(Phi(u, 0)), 5, PAL.need); stage.text(n, X(u), Y(Phi(u, 0)) - 26, {role: 'display', size: 24, weight: 700, color: PAL.need, align: 'center'}); }
    const s = sampleAt(SIM_L2, P.driftT(t)), u = clamp(s[0], -1.3, 1.37), bx = X(u), by = Y(Phi(u, 0)) - 10;
    circle(c, bx, by, 9, PAL.outer); ring(c, bx, by, 9, '#FFFFFF', 1.5);
    const g = fadeIn(t, P.saddle, 0.4); if (g > 0) withAlpha(c, g, () => stage.text('고갯마루', X(LP.L1[0]) - 60, 1130, {role: 'display', size: 28, weight: 700, color: PAL.need, align: 'right'}));
  });
  // bottom panel ②: JWST halo around L2 with station-keeping burns
  const ha = a * fadeIn(t, P.halo0, 0.4) * fadeOut(t, P.tad0 - 0.2, 0.3);
  if (ha > 0) haloPanel(stage, t, P, ha, V);
  // ③ L4 tadpole (map) + angle graph (panel)
  const ta = a * fadeIn(t, P.tad0 + 0.15, 0.35);
  if (ta > 0) tadpole(stage, t, P, ta, V);
}
/** schematic drift away from the nominal loop: grows e^(1.6 s) between burns, removed smoothly (0.3 s) by each burn */
function haloDev(t, P) {
  const grow = s => 0.05 * (Math.exp(1.6 * Math.max(0, s)) - 1);
  let prev = P.halo0, carry = 0;
  for (const b of P.burns) { if (b > t) break; carry = grow(b - prev) + carry * (1 - smooth((b - prev) / 0.3)); prev = b; }
  return Math.min(0.4, grow(t - prev) + carry * (1 - smooth((t - prev) / 0.3)));
}
function haloPanel(stage, t, P, a, V) {
  const c = stage.ctx, T = stage.theme, cx = 600, cy = 1170, Ax = 230, Ay = 95;
  const [lx, ly] = V.P(...LP.L2);
  withAlpha(c, a, () => {
    panel(c, T, 92, 1010, 896, 320, 0.78);
    // zoom connector from the map's L2
    line(c, [[lx, ly + 16], [cx, 1010]], rgba(PAL.need, 0.45), 1.5, {dash: [5, 6]});
    earthBody(c, 170, cy, 14, 1); stage.text('지구', 170, cy + 42, {size: 24, weight: 700, color: PAL.earth, align: 'center'});
    stage.text('← 태양', 150, 1046, {size: 24, weight: 700, color: PAL.sun});
    lMark(stage, cx, cy, 'L2', 0.9, {lab: [0, -36], size: 24});
    c.beginPath(); c.ellipse(cx, cy, Ax, Ay, 0, 0, TAU); c.strokeStyle = rgba(PAL.need, 0.35); c.lineWidth = 2; c.setLineDash([6, 7]); c.stroke(); c.setLineDash([]);
    const ph = TAU * (t - P.halo0) / P.HALO_S, r = 1 + haloDev(t, P);
    const jx = cx + Ax * r * Math.cos(ph), jy = cy - Ay * r * Math.sin(ph);
    // trail
    const tr = []; for (let k = 0; k <= 40; k++) { const tt = t - k * 0.04; if (tt < P.halo0) break; const rr = 1 + haloDev(tt, P), p2 = TAU * (tt - P.halo0) / P.HALO_S; tr.push([cx + Ax * rr * Math.cos(p2), cy - Ay * rr * Math.sin(p2)]); }
    if (tr.length > 1) line(c, tr, rgba(PAL.need, 0.75), 3);
    jwstIcon(c, jx, jy, 13, 0, 1);
    for (const b of P.burns) { const q = (t - b) / 0.45; if (q < 0 || q > 1) continue; const p2 = TAU * (b - P.halo0) / P.HALO_S, bx = cx + Ax * Math.cos(p2), by = cy - Ay * Math.sin(p2);
      c.save(); c.globalCompositeOperation = 'lighter'; glow(c, bx, by, 26 + 30 * q, PAL.burn, 0.7 * (1 - q)); c.restore(); }
    const nb = P.burns.filter(b => b <= t).length;
    stage.text('반년에 한 바퀴 (4초로)', 930, 1046, {size: 24, weight: 500, color: T.muted, align: 'right'});
    stage.text(`짧은 분사 ${nb}번`, 930, 1300, {size: 26, weight: 700, color: PAL.burn, align: 'right'});
    stage.text('궤도 크기·어긋남은 모식', 140, 1300, {size: 24, weight: 500, color: T.muted});
  });
}
function tadpole(stage, t, P, a, V) {
  const c = stage.ctx, T = stage.theme, tau = P.tadT(t), n = Math.min(SIM_L4.length - 1, Math.floor(tau / 0.01));
  clipRect(c, 60, 340, 960, 640, 18, () => withAlpha(c, a, () => {
    const pts = []; for (let i = 0; i <= n; i += 2) pts.push(V.P(SIM_L4[i][0], SIM_L4[i][1]));
    if (pts.length > 1) line(c, pts, rgba(PAL.inner, 0.95), 3.2);
    const s = sampleAt(SIM_L4, tau); satDot(c, ...V.P(s[0], s[1]), PAL.inner, 1, 7);
  }));
  withAlpha(c, a, () => {
    panel(c, T, 92, 1010, 896, 320, 0.78);
    stage.text('태양에서 본, 지구와 이 물체 사이의 각도', 540, 1042, {size: 24, weight: 500, color: T.muted, align: 'center'});
    const X0 = 200, X1 = 920, Tm = 26, X = u => lerp(X0, X1, u / Tm), Y = d => lerp(1280, 1080, (d - 45) / 30);
    line(c, [[X0, 1280], [X1, 1280]], rgba(T.muted, 0.6), 1.5); line(c, [[X0, 1080], [X0, 1280]], rgba(T.muted, 0.6), 1.5);
    for (const d of [50, 60, 70]) { stage.text(`${d}°`, X0 - 14, Y(d), {size: 24, color: T.muted, align: 'right'}); line(c, [[X0, Y(d)], [X1, Y(d)]], rgba(T.border, d === 60 ? 1 : 0.5), 1, {dash: d === 60 ? null : [4, 6]}); }
    stage.text('L4 (60°)', X1, Y(60) - 18, {size: 24, weight: 700, color: PAL.need, align: 'right'});
    const pts = []; for (let i = 0; i <= Math.min(n, Tm / 0.01); i += 4) pts.push([X(i * 0.01), Y(angFromSun(SIM_L4[i][0], SIM_L4[i][1]))]);
    if (pts.length > 1) line(c, pts, PAL.inner, 3);
    if (pts.length) circle(c, ...pts.at(-1), 6, PAL.inner);
    stage.text('시간 → (약 4년)', X1, 1304, {size: 24, weight: 500, color: T.muted, align: 'right'});
  });
  const la = a * fadeIn(t, P.tad0 + 2.2, 0.5);
  tag(stage, '언덕 꼭대기지만 도는 계의 휘는 힘(코리올리)이 둘레를 돌게 함', 540, 952, {a: la, size: 24, weight: 500, color: T.ink});
}

// ------------------------------------------------------------------ trojans: Sun–Jupiter, swarms at ±60°
const TRO_V = () => view(540, 760, 330, 0);
export const jupAngle = (t, P) => -0.3 + OMEGA_S * (t - P.j0) / TROJ.jupYr;
const trojanPos = (d, th, t) => { const lib = d.A * Math.sin(d.ph + 0.08 * t) * Math.PI / 180, ang = th + d.side * Math.PI / 3 + lib, r = 1 + d.dr + 0.006 * Math.sin((d.ep || 0) + t * 0.5); return [r * Math.cos(ang), r * Math.sin(ang)]; };
function trojanScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx), V = TRO_V(), th = jupAngle(t, P);
  const [cx, cy] = V.P(0, 0);
  withAlpha(c, a, () => {
    ring(c, cx, cy, V.R, rgba(PAL.orbit, 0.95), 1.6); ring(c, cx, cy, V.R / 5.2, rgba(PAL.orbit, 0.8), 1.2);
    const ea = 0.4 + OMEGA_S * (t - P.j0); circle(c, cx + V.R / 5.2 * Math.cos(ea), cy - V.R / 5.2 * Math.sin(ea), 4.5, PAL.earth);
  });
  // dots (appear while the count rises)
  const shown = clamp((t - P.count[0]) / (P.count[1] - P.count[0]));
  const nShow = Math.floor(easeInOut(shown) * TROJ_DOTS.length);
  withAlpha(c, a, () => {
    for (let i = 0; i < TROJ_DOTS.length; i++) {
      const d = TROJ_DOTS[i]; if (d.order * TROJ_DOTS.length >= nShow) continue;
      const [x, y] = trojanPos(d, th, t), p = [cx + V.R * x, cy - V.R * y];
      c.globalAlpha = a * d.a * 0.9; circle(c, p[0], p[1], d.sz * 1.25, d.side > 0 ? '#E9D3A6' : '#C9D7E8');
    }
    c.globalAlpha = 1;
  });
  sunBody(c, cx, cy, 28, a);
  const jx = cx + V.R * Math.cos(th), jy = cy - V.R * Math.sin(th);
  withAlpha(c, a, () => { glow(c, jx, jy, 40, PAL.jup, 0.25); sphere(c, jx, jy, 16, PAL.jup, {shade: PAL.jupDark, light: '#FFF2DC'}); });
  tag(stage, '목성', jx + 52, jy, {a, size: 26, color: PAL.jup, plate: false});
  tag(stage, '지구 궤도', cx, cy + V.R / 5.2 + 26, {a: a * 0.9, size: 24, weight: 500, color: T.muted, plate: false});
  for (const side of [1, -1]) { const ang = th + side * Math.PI / 3, x = cx + V.R * Math.cos(ang), y = cy - V.R * Math.sin(ang); lMark(stage, x, y, side > 0 ? 'L4' : 'L5', a * 0.85, {lab: [Math.cos(ang) * 62, -Math.sin(ang) * 62 + 2], size: 30}); }
  // counter
  const ca = a * fadeIn(t, P.count[0] - 0.2, 0.3);
  if (ca > 0) {
    const N = Math.round(easeInOut(shown) * (TROJ.L4 + TROJ.L5));
    withAlpha(c, ca, () => { panel(c, T, 150, 1150, 780, 180, 0.8);
      stage.text('알려진 수 (2026년 2월)', 540, 1180, {size: 24, weight: 500, color: T.muted, align: 'center'});
      stage.text(`${comma(N)}개`, 540, 1234, {role: 'display', size: 58, weight: 700, color: T.ink, align: 'center'}); });
    const sa = ca * fadeIn(t, P.count[1], 0.4), cq = fadeIn(t, P.camps, 0.4);
    if (sa > 0) withAlpha(c, sa, () => {
      stage.text(`L4${cq > 0.5 ? ' · 그리스 진영' : ''}  ${comma(TROJ.L4)}`, 345, 1298, {size: 24, weight: 700, color: '#E9D3A6', align: 'center'});
      stage.text(`L5${cq > 0.5 ? ' · 트로이 진영' : ''}  ${comma(TROJ.L5)}`, 735, 1298, {size: 24, weight: 700, color: '#C9D7E8', align: 'center'}); });
  }
  // named ones
  TROJ_NAMED.forEach((d, i) => {
    const t0 = i === 0 ? P.achil : P.names[Math.min(2, i - 1)], q = a * fadeIn(t, t0, 0.35); if (q <= 0) return;
    const [x, y] = trojanPos(d, th, t), px = cx + V.R * x, py = cy - V.R * y;
    withAlpha(c, q, () => { ring(c, px, py, 12, i === 0 ? PAL.need : T.ink, 2.4); circle(c, px, py, 3.5, i === 0 ? PAL.need : T.ink); });
    const ux = (px - cx) / Math.hypot(px - cx, py - cy), uy = (py - cy) / Math.hypot(px - cx, py - cy), dd = i === 0 ? 92 : 78;
    line(c, [[px - ux * 14, py - uy * 14], [px - ux * (dd - 22), py - uy * (dd - 22)]], rgba(i === 0 ? PAL.need : T.ink, 0.6 * q), 1.4);
    tag(stage, i === 0 ? '아킬레우스 · 1906' : d.n, px - ux * dd, py - uy * dd + (i === 2 ? -14 : i === 3 ? 14 : 0), {a: q, size: i === 0 ? 28 : 24, color: i === 0 ? PAL.need : T.ink});
  });
  tag(stage, '점 하나 = 소행성 약 10개 · 1년 = 6초', 540, 1118, {a: a * fadeIn(t, P.count[0], 0.4), size: 24, weight: 500, color: T.muted, plate: false});
}

// ------------------------------------------------------------------ myth: "force = 0?" → the net force remains and equals the needed one
const MYTH_V = () => view(540, 700, 318, 0);
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, a = sceneFade(t, ctx), V = MYTH_V();
  const th = 1.2 + OMEGA_S * (t - P.m0), Vr = view(V.cx, V.cy, V.R, th);
  const [cx, cy] = V.P(0, 0);
  withAlpha(c, a, () => { ring(c, cx, cy, V.R * (1 - MU), rgba(PAL.orbit, 0.9), 1.6); ring(c, cx, cy, V.R * LP.L1[0], rgba(PAL.inner, 0.35), 1.3); });
  sunBody(c, ...Vr.P(...SUN), 30, a); const [ex, ey] = Vr.P(...EARTH); earthBody(c, ex, ey, 13, a);
  const [lx, ly] = Vr.P(...LP.L1); satDot(c, lx, ly, PAL.inner, a, 8); lMark(stage, lx, ly, '', a * 0.6);
  { const [tx, ty] = Vr.dir(0, 1); stage.text('L1', lx - tx * 40, ly - ty * 40, {role: 'display', size: 28, weight: 700, color: PAL.need, align: 'center', alpha: a, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 8}); }
  const k = 125, [ux, uy] = Vr.dir(-1, 0);                               // screen direction toward the Sun
  const as = a * fadeIn(t, P.armSun, 0.3), ae = a * fadeIn(t, P.armEarth, 0.3), an = a * fadeIn(t, P.net, 0.4), ad = a * fadeIn(t, P.need, 0.4);
  const off = (s) => [-uy * s, ux * s];                                    // perpendicular offsets so arrows do not overlap
  if (as > 0) withAlpha(c, as * (1 - 0.5 * fadeIn(t, P.net, 0.4)), () => { const [ox, oy] = off(-16); arrow(c, [lx + ox, ly + oy], [lx + ox + ux * k * sunPull(LP.L1[0]), ly + oy + uy * k * sunPull(LP.L1[0])], PAL.sun, 5, {head: 15}); });
  if (ae > 0) withAlpha(c, ae * (1 - 0.5 * fadeIn(t, P.net, 0.4)), () => { const [ox, oy] = off(16); arrow(c, [lx + ox, ly + oy], [lx + ox - ux * k * Math.abs(earthPull(LP.L1[0])), ly + oy - uy * k * Math.abs(earthPull(LP.L1[0]))], PAL.earth, 5, {head: 15}); });
  const qa = a * fadeIn(t, P.qZero, 0.3) * fadeOut(t, P.no, 0.3);
  if (qa > 0) tag(stage, '두 힘이 지워져 0 ?', 540, 362, {a: qa, size: 32, color: PAL.bad});
  if (an > 0) withAlpha(c, an, () => { arrow(c, [lx, ly], [lx + ux * k * forceIn(LP.L1[0]), ly + uy * k * forceIn(LP.L1[0])], PAL.sum, 8, {head: 18}); });
  if (ad > 0) withAlpha(c, ad, () => { const [ox, oy] = off(-30); line(c, [[lx + ox, ly + oy], [lx + ox + ux * k * forceNeed(LP.L1[0]), ly + oy + uy * k * forceNeed(LP.L1[0])]], PAL.need, 5, {dash: [10, 7], cap: 'butt'}); });
  // ghost: if the force were zero → straight line
  const ga = a * fadeIn(t, P.ghost, 0.3);
  if (ga > 0) {
    const thG = 1.2 + OMEGA_S * (P.ghost - P.m0), Vg = view(V.cx, V.cy, V.R, thG), [gx0, gy0] = Vg.P(...LP.L1), [vx, vy] = Vg.dir(0, 1), v = LP.L1[0] * V.R * OMEGA_S, d = (t - P.ghost) * v;
    clipRect(c, 60, 330, 900, 720, 0, () => withAlpha(c, ga, () => { line(c, [[gx0, gy0], [gx0 + vx * 700, gy0 + vy * 700]], rgba(PAL.bad, 0.45), 2, {dash: [8, 8]}); circle(c, gx0 + vx * d, gy0 + vy * d, 7, rgba(PAL.bad, 0.85)); }));
    tag(stage, '힘이 0이라면 → 곧게 날아감', clamp(gx0 + vx * 170 + 30, 200, 860), clamp(gy0 + vy * 170 - 30, 360, 1040), {a: ga * fadeOut(t, ctx.scene.end - 0.6, 0.4), size: 24, color: PAL.bad});
  }
  const vals = {sun: sunPull(LP.L1[0]), earth: earthPull(LP.L1[0]), sum: forceIn(LP.L1[0]), need: forceNeed(LP.L1[0]), aSun: fadeIn(t, P.armSun, 0.3), aEarth: fadeIn(t, P.armEarth, 0.3), aSum: fadeIn(t, P.net, 0.3), aNeed: fadeIn(t, P.need, 0.3)};
  forceRows(stage, 760, 1112, vals, a * fadeIn(t, P.armSun - 0.2, 0.4), {match: fadeIn(t, P.need + 0.4, 0.3), dy: 56});
}

// ------------------------------------------------------------------ close: back to the poster composition
function closeScene(stage, t, ctx) {
  const P = plan(ctx.tl), a = fadeIn(t, ctx.scene.start, 0.4);
  const pl = n => { const t0 = P.poster + 0.8 + 0.45 * ['L1', 'L2', 'L3', 'L4', 'L5'].indexOf(n), q = (t - t0) / 1.0; return 0.35 + 0.65 * (q > 0 && q < 1 ? Math.sin(Math.PI * q) : 0); };
  systemPicture(stage, t, POSTER_V(), {a, pulse: {L1: pl('L1'), L2: pl('L2'), L3: pl('L3'), L4: pl('L4'), L5: pl('L5')}, Lall: 1});
}

// =====================================================================================================
// Sound (written into sound.json by --emit-sound; the same plan drives the picture)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const burst = (id, times, means, gain = -30) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map(tt => ({kind: 'noise', offset: r(tt - times[0], 4), params: {dur: 0.3, low: 60, high: 300, attack: 0.01, release: 0.2, gain_db: 0}}))}, means}); };
  const envNoise = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.3, o.fo ?? 0.5)), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 40, high: o.high ?? 220, fade: 0.05, points: Q.filter((q, i) => i === 0 || i === Q.length - 1 || Math.abs(q[1] - Q[i - 1][1]) > 1e-4 || Math.abs(q[1] - Q[i + 1][1]) > 1e-4)}, means}); };
  const beat = (id, t0, t1, ratio, means, gain = -34) => {             // two low tones: f_need fixed, f_sum = f_need + beat(ratio); unison when the forces match
    const f0 = 110, bHz = tt => 6 * clamp((ratio(tt) - 1) / 0.6, -1, 1);
    ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [
      {kind: 'chirp', offset: 0, params: {gain_db: 0, harmonics: [1, 0.25], fade: 0.03, points: table(t0, t1, () => f0, () => 0.5, 0.05, 0.3, 0.6)}},
      {kind: 'chirp', offset: 0, params: {gain_db: 0, harmonics: [1, 0.25], fade: 0.03, points: table(t0, t1, tt => f0 + bHz(tt), () => 0.5, 0.05, 0.3, 0.6)}}]}, means});
  };
  // ---- hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 태양·지구와 다섯 라그랑주 점, 함께 도는 계의 등고선', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  whoosh('turn', P.turn0, 1.4, 70, 140, '그림 전체가 한 덩어리로 돌기 시작 (지구와 다섯 점이 함께 돎)', -38);
  tick('jwst', P.jwst + 0.1, 147, -33, '제임스웹이 L2 근처에 나타남', {decay: 0.12});
  tick('km150', P.km, 131, -34, '"150만 km" 표시', {decay: 0.12});
  swell('along', P.along, [110, 165], '태양–지구–제임스웹이 한 줄로 나란히 돎', {dur: 1.5, gain: -34});
  // ---- origin
  tick('y1767', P.tl1767 + 0.5, 110, -34, '연표 1767 · 오일러', {decay: 0.12});
  whoosh('line', P.lineIn, 0.9, 80, 160, '두 천체를 잇는 직선', -37);
  ticks('three', P.three, [131, 147, 165], -33, '직선 위의 세 점(L1·L2·L3)이 하나씩 켜짐', {decay: 0.12});
  tick('y1772', P.tl1772 + 0.5, 110, -34, '연표 1772 · 라그랑주', {decay: 0.12});
  ticks('two', P.two.map(x => x + 0.45), [196, 220], -33, '정삼각형 꼭짓점 두 점(L4·L5)', {decay: 0.12});
  ticks('names', P.labels, [131, 147, 165, 196, 220], -36, 'L1~L5 이름표가 차례로', {decay: 0.08});
  // ---- essence: quarter-revolution ticks (inner 165 / Earth 131 / outer 98 Hz), then all together
  ticks('tick_inner', P.tickIn, 165, -36, `안쪽 위성(태양만): 궤도 1/4마다 틱 ${P.tickIn.length}번 — 더 빠름`, {decay: 0.08});
  ticks('tick_earth', P.tickE, 131, -35, `지구: 궤도 1/4마다 틱 ${P.tickE.length}번 (1년 = 6초)`, {decay: 0.08});
  ticks('tick_outer', P.tickOut, 98, -35, `바깥쪽 위성(태양만): 궤도 1/4마다 틱 ${P.tickOut.length}번 — 더 느림`, {decay: 0.08});
  swell('gravity_on', P.gravOn, [82, 123], '지구의 중력을 더함 (지구 둘레 고리)', {dur: 1.4, gain: -34});
  ev.push({id: 'lock', at: r(P.lock, 4), kind: 'custom', params: {gain_db: -34, layers: P.tickLock.flatMap(tt => [98, 131, 165].map(f => ({kind: 'tick', offset: r(tt - P.lock, 4), params: {freq: f, decay: 0.09, click: 0, gain_db: 0}})))}, means: `L1·지구·L2가 같은 박자: 세 음이 함께 1/4 바퀴마다 (${P.tickLock.length}번)`});
  ticks('five', P.five, [196, 220, 247], -34, 'L3·L4·L5가 나타남 → 다섯 곳', {decay: 0.12});
  beat('match8', P.probe8, tl.at('s08:end') + 0.4, tt => forceIn(rampUnits(tt, P.slide8[0], P.slide8[1], 0.70, LP.L1[0])) / forceNeed(rampUnits(tt, P.slide8[0], P.slide8[1], 0.70, LP.L1[0])), '합친 힘과 필요한 힘 = 두 낮은 음(110 Hz와 110 + 어긋남): 탐사점이 L1에 다가가면 맥놀이가 사라져 한 음');
  swell('fit8', P.fit8, [110, 165], '"꼭 맞음"', {dur: 1.3, gain: -33});
  // ---- l1l2
  beat('match_l1', P.slideL1[0], P.l2 - 0.3, tt => forceIn(P.probeX(tt)) / forceNeed(P.probeX(tt)), 'L1 쪽으로: 맥놀이 → 한 음 (힘이 맞음)', -35);
  tick('slow_l1', P.slowL1, 110, -34, '"실제: 더 천천히" 빠르기 화살표', {decay: 0.12});
  beat('match_l2', P.slideL2[0], P.real - 0.2, tt => forceIn(P.probeX(tt)) / forceNeed(P.probeX(tt)), 'L2 쪽으로: 맥놀이 → 한 음 (힘이 맞음)', -35);
  tick('fast_l2', P.fastL2, 165, -34, '"실제: 더 빨리" 빠르기 화살표', {decay: 0.12});
  tick('real', P.real + 0.3, 98, -34, '실제 축척으로 바뀜', {decay: 0.14});
  tick('km11', P.km11, 131, -34, '"약 150만 km" 괄호', {decay: 0.12});
  ticks('moon4', P.moonSeg, [131, 147, 165, 196], -33, '달까지 거리가 네 칸 쌓임 → L2', {decay: 0.1});
  // ---- five
  whoosh('camera', P.camA, P.camB - P.camA, 140, 70, '보는 눈이 지구와 함께 돌기 시작 → 다섯 점이 멈춤 (배경 별이 반대로 돎)', -36);
  tick('l3', P.l3 + 0.4, 131, -34, 'L3 (태양 건너편)', {decay: 0.12});
  ticks('triangle', [P.tri, P.tri + 0.3, P.tri + 0.6], [147, 165, 196], -34, '정삼각형 변이 그려짐', {decay: 0.1});
  swell('apex', P.apex + 0.2, [131, 196], 'L4·L5 꼭짓점', {dur: 1.3, gain: -34});
  // ---- stability
  tick('saddle', P.saddle, 110, -34, '"고갯마루" 표시', {decay: 0.12});
  chirp('roll_off', P.nudge, Math.min(P.offMap + 0.4, P.halo0 - 0.1), tt => { const s = sampleAt(SIM_L2, P.driftT(tt)); return 165 - 70 * clamp(Math.hypot(s[0] - LP.L2[0], s[1]) / 0.45); }, tt => 0.25 + 0.6 * clamp(Math.hypot(sampleAt(SIM_L2, P.driftT(tt))[0] - LP.L2[0], sampleAt(SIM_L2, P.driftT(tt))[1]) / 0.2), -35, 'L1·L2에서 조금 비켜난 점이 점점 멀어짐 → 내려가는 음 (거리 → 음높이, 같은 RK4 모형)', {fi: 0.2, fo: 0.3});
  tick('halo', P.halo0 + 0.3, 131, -34, '제임스웹이 L2 둘레를 돎 (반년 한 바퀴를 4초로)', {decay: 0.12});
  burst('burns', P.burns, `궤도 유지 분사 ${P.burns.length}번 (짧은 낮은 잡음)`, -31);
  chirp('libration', P.tad0, tl.scene('stability').end - 0.1, tt => { const s = sampleAt(SIM_L4, P.tadT(tt)); return 110 + 2.2 * (angFromSun(s[0], s[1]) - 60); }, () => 0.35, -37, 'L4 둘레 맴돌기: 각도(49°~72°) → 음높이가 천천히 오르내림', {fi: 0.4, fo: 0.4});
  // ---- trojans
  envNoise('discover', P.count[0], P.count[1] + 0.3, tt => 0.3 + 0.7 * easeInOut(clamp((tt - P.count[0]) / (P.count[1] - P.count[0]))), -38, '소행성이 늘어남 (낮은 잡음의 세기 = 늘어나는 수)', {low: 40, high: 200, fi: 0.3, fo: 0.4});
  swell('count', P.count[1], [110, 165], '"15,669개"', {dur: 1.4, gain: -34});
  tick('achilles', P.achil, 147, -33, '아킬레우스 (1906)', {decay: 0.12});
  ticks('heroes', P.names, [131, 165, 196], -35, '오디세우스 · 아이네이아스 · 프리아모스', {decay: 0.1});
  swell('camps', P.camps, [98, 147], '그리스 진영(L4) · 트로이 진영(L5)', {dur: 1.5, gain: -34});
  // ---- myth
  tick('arm_sun', P.armSun, 110, -34, '태양의 당김 화살표', {decay: 0.12});
  tick('arm_earth', P.armEarth, 147, -34, '지구의 당김 화살표 (반대쪽)', {decay: 0.12});
  tick('q_zero', P.qZero, 196, -36, '"두 힘이 지워져 0 ?"', {decay: 0.1});
  ev.push({id: 'no', at: r(P.no, 4), kind: 'custom', params: {gain_db: -31, layers: [{kind: 'tone', offset: 0, params: {freq: 70, dur: 0.2, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.09, low: 40, high: 200, attack: 0.002, release: 0.07, gain_db: -8}}]}, means: '"아닙니다" (둔한 툭)'});
  whoosh('ghost', P.ghost, 1.4, 160, 90, '힘이 0이라면: 곧게 날아가는 유령 점', -37);
  swell('net', P.net, [98, 147], '남은 힘(합친 힘) 화살표 → 태양 쪽', {dur: 1.4, gain: -33});
  swell('need', P.need, [110, 165], '필요한 힘과 꼭 같음', {dur: 1.5, gain: -33});
  // ---- close
  swell('poster_back', P.poster, [98, 147, 196], '"라그랑주 점은" — 첫 화면이 돌아옴', {dur: 1.8, gain: -32});
  return lowBandOnly(ev, modelSignature(tl));
}
/** User decision (2026-11-03): no effects in the high band (see hydrogen-bomb/scenes.mjs for the rule). */
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') { const f = Math.max(...p.points.map(q => q[1])); if (f >= HIGH_CUT) throw new Error(`${e.id}: chirp ${f} Hz`); p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT); }
    else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/lagrange-points/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(제한 삼체 문제: 라그랑주 점 위치, 회전 좌표계 RK4 적분, 1년 = 6초)에서 써 넣습니다. 대응: 궤도 1/4 바퀴마다 틱(안쪽 165 · 지구 131 · 바깥쪽 98 Hz, 지구의 중력을 더하면 세 음이 같은 박자), 합친 힘 대 필요한 힘 = 두 낮은 음의 맥놀이(맞으면 한 음), 고갯마루에서 멀어짐 = 내려가는 음, 궤도 유지 분사 = 짧은 낮은 잡음, L4 맴돌기 = 각도에 따라 오르내리는 음. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; L1 ${LP.L1[0].toFixed(4)} L2 ${LP.L2[0].toFixed(4)} L3 ${LP.L3[0].toFixed(4)}; real L1/L2 ${(L12_KM[0] / 1e6).toFixed(3)}/${(L12_KM[1] / 1e6).toFixed(3)} million km; tadpole period ${TADPOLE_PERIOD.toFixed(1)} units; burns ${P.burns.length}; offMap ${P.offMap.toFixed(2)} s`);
}
