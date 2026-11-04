// Episode scenes — "에딩턴 한계 — 빛이 별을 밀어낸다"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Γ = L / L_Edd with L_Edd = 4πG M m_p c / σ_T ≈ 1.26×10³¹ W per M☉ ≈ 3.3×10⁴ L☉ per M☉ (Sun: Γ ≈ 3.0×10⁻⁵).
//  - On one electron–proton pair at distance r: light pushes the electron F_light = σ_T L/(4πr²c), gravity pulls the
//    proton F_grav = G M m_p / r². Both ∝ 1/r² → F_light/F_grav = Γ at every r (the balance scene moves the pair r → 2r).
//    σ_T ∝ 1/m² → a proton scatters (1/1836)² ≈ 3×10⁻⁷ as much light as an electron (the lens shows photons passing it).
//  - Net outward acceleration of a gas parcel/shell: a = g(r)(Γ − 1), g(r) = K/r² (display units: r in star radii,
//    K = SHELL_K per s²). shellTrack() integrates it (semi-implicit Euler, 1/240 s); a shell that is pulled inward
//    rests on the surface. Every flying shell and wind particle on screen comes from this integration.
//  - Main-sequence curve (explanatory model): Γ_MS(M) = 1/(1/Γmax + 1/(Γ☉ M^2.5)) → L ≈ M^3.5 near the Sun,
//    Γ(200 M☉) = 0.80 (cf. R136a1 ≈ 0.8, brief), never above 1.
//  - η Carinae: schematic light curve (peak 1843 at −0.8 mag, Sirius −1.46); Γ(year) 0.9 → about 5 during the
//    Great Eruption 1838–1858 → 0.9. Homunculus lobes grow ballistically (size ∝ years since 1843) up to 2026.
//  - Black hole: swallowed rate = supply capped smoothly at the Eddington rate, Ṁ = S/(1+S⁶)^(1/6); the rest is pushed
//    back. Eddington-limited growth M(t) = M0·e^((t−t0)/τ), τ = (ε/(1−ε))·σ_T c/(4πG m_p) = 50 Myr (ε = 0.1);
//    seed 100 M☉ at 100 Myr → 1.1×10⁷ M☉ at 680 Myr vs J0313−1806 (1.6×10⁹ M☉, z = 7.642).
//  - Super-Eddington disk (myth): inflow in the plane, light out of two funnels, winds; M82 X-2 > 10× its limit.
//  - Sound: node episodes/eddington-limit/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const LEDD_PER_MSUN = 3.3e4;                                    // L_Edd per M☉, in L☉ (1.26e31 W / 3.83e26 W)
export const MP_ME = 1836;                                             // proton / electron mass
export const SCATTER_P = 1 / MP_ME ** 2;                               // Thomson σ ∝ 1/m²: proton/electron ≈ 3.0e-7
export const lEdd = M => LEDD_PER_MSUN * M;
export const gammaOf = (L, M) => L / lEdd(M);
export const SUN_GAMMA = gammaOf(1, 1);                                // ≈ 3.0e-5
const G_MAX = 1 / (1 / 0.8 - 1 / (SUN_GAMMA * 200 ** 2.5));            // so that Γ_MS(200) = 0.80
export const gammaMS = M => 1 / (1 / G_MAX + 1 / (SUN_GAMMA * M ** 2.5));
export const lumMS = M => gammaMS(M) * lEdd(M);
/** forces on one e–p pair at distance r (r0 = 1, gravity at r0 = 1): both ∝ 1/r² */
export const fLight = (gam, r) => gam / (r * r);
export const fGrav = r => 1 / (r * r);
export const SHELL_K = 2.6;                                            // g at the surface (star radii / s²), display units
/** r(t), v(t) of a shell starting at r0 under a = K(Γ(t) − 1)/r²; rests on the surface (r = 1) while pulled inward */
export function shellTrack(gam, t0, t1, {r0 = 1, v0 = 0, K = SHELL_K, dt = 1 / 240} = {}) {
  const n = Math.ceil((t1 - t0) / dt), Rr = new Float64Array(n + 1), Vv = new Float64Array(n + 1);
  let r = r0, v = v0, lift = null;
  for (let i = 0; i <= n; i++) {
    Rr[i] = r; Vv[i] = v;
    const tt = t0 + i * dt, a = K * (gam(tt) - 1) / (r * r);
    v += a * dt; r += v * dt;
    if (r <= 1) { r = 1; v = Math.max(0, v); } else if (lift === null && r > 1.002) lift = tt;
  }
  const look = A => tt => { const u = (tt - t0) / dt; if (u <= 0) return A[0]; if (u >= n) return A[n]; const i = Math.floor(u); return lerp(A[i], A[i + 1], u - i); };
  return {r: look(Rr), v: look(Vv), lift, t0};
}
// η Carinae (schematic light curve; Γ during the Great Eruption 1838–1858, about ×5 at the 1843 peak)
export const ETA = {M: 100, peakYear: 1843, peakMag: -0.8, erupt: [1838, 1858]};
export const SIRIUS_MAG = -1.46;
const ETA_GAMMA = [[1800, 0.9], [1837.4, 0.9], [1838.4, 3.0], [1843, 5.0], [1847, 3.7], [1856, 2.7], [1858.6, 0.9], [1900, 0.9]];
const ETA_MAG = [[1820, 2.0], [1826, 1.6], [1827.5, 1.0], [1830, 1.7], [1837.0, 1.3], [1838.0, 0.1], [1839.5, 0.9], [1842.0, 0.4],
  [1843.2, -0.8], [1844.6, -0.2], [1850, 0.3], [1856.5, 0.2], [1858.5, 1.5], [1862, 3.8], [1866, 6.2], [1870, 7.4]];
/** piecewise interpolation with smoothstep inside each segment (flat at the nodes; no overshoot) */
const sTable = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const q = smooth((x - T[i - 1][0]) / (T[i][0] - T[i - 1][0])); return lerp(T[i - 1][1], T[i][1], q); } return T[T.length - 1][1]; };
export const etaGamma = y => sTable(ETA_GAMMA, y);
export const etaMag = y => sTable(ETA_MAG, y);
// black holes
export const BH = {seedM: 100, seedT: 100, tau: 50, eps: 0.1, J0313: {t: 680, M: 1.6e9, z: 7.642}};
export const bhGrow = tMyr => BH.seedM * Math.exp((tMyr - BH.seedT) / BH.tau);
export const swallow = S => S / (1 + S ** 6) ** (1 / 6);                // swallowed / Eddington rate for supply S
export const M82X2 = {gamma: 12};                                      // "more than 10×" (needle only, no number shown)
// display helpers tied to the model
export const starR = (M, Rref = 200) => Rref * (0.2 + 0.8 * (clamp(Math.log10(M) / 2, 0, 1.3)) ** 1.15);   // display radius
export const starTemp = M => clamp(Math.log10(M) / 1.6);              // 0 = Sun-like yellow … 1 = blue-white

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  today: W('s01', '오늘은'), whether: W('s01', '있는지를'), decide: W('s01', '정하는'), edd1: W('s01', '에딩턴'), ask: W('s01', '알아볼까요'),
  heavy: W('s02', '무거운'), much: W('s02', '훨씬'), burn: W('s02', '타오르지만'), tooBright: W('s02', '너무'), own: W('s02', '제'),
  pushed: W('s02', '밀려'), outer: W('s02', '바깥층을'), space: W('s02', '우주로'), blow: W('s02', '날려'),
  name: W('s03', '이름은'), y1916: W('s03', '천구백십육년부터'), inStar: W('s03', '별'), lightP: W('s03', '빛이'), calc: W('s03', '계산한'),
  uk: W('s03', '영국'), arthur: W('s03', '아서'), eddington: W('s03', '에딩턴에게서'),
  y1919: W('s04', '천구백십구년'), eclipse: W('s04', '일식'), sunE: W('s04', '태양'), beside: W('s04', '곁에서'), bend: W('s04', '휘는'),
  starlight: W('s04', '별빛을'), measure: W('s04', '재어'), relativity: W('s04', '상대성'), confirmed: W('s04', '확인한'), that: W('s04', '바로'),
  core: W('s05', '핵심은'), eLight: W('s05', '빛이'), out: W('s05', '밖으로'), eGrav: W('s05', '중력이'), inward: W('s05', '안으로'),
  equal: W('s05', '같아지는'), bright: W('s05', '밝기'), it: W('s05', '그것이'), limit: W('s05', '에딩턴'),
  pLight: W('s06', '빛은'), energy: W('s06', '에너지와'), momentum: W('s06', '운동량을'), carry: W('s06', '실어'), hit: W('s06', '부딪히는'),
  grain: W('s06', '알갱이를'), little: W('s06', '조금씩'), pushes: W('s06', '밀어냅니다'),
  hot: W('s07', '뜨거운'), gas: W('s07', '기체는'), electron: W('s07', '전자와'), proton: W('s07', '양성자로'), split: W('s07', '갈라져'),
  light7: W('s07', '빛은'), mainly: W('s07', '주로'), lightE: W('s07', '가벼운'), pushE: W('s07', '밀어냅니다'),
  grav8: W('s08', '중력은'), heavyP: W('s08', '무거운'), pullP: W('s08', '당기지만'), both: W('s08', '둘은'), elec: W('s08', '전기력으로'),
  bound: W('s08', '묶여'), together: W('s08', '함께'), lightGrav: W('s08', '빛과'), tug: W('s08', '줄다리기입니다'),
  both9: W('s09', '빛도'), gravToo: W('s09', '중력도'), dist: W('s09', '거리가'), double: W('s09', '두'), quarter: W('s09', '사분의'),
  weaken: W('s09', '약해집니다'), so: W('s09', '그래서'), contest: W('s09', '승부는'), notDist: W('s09', '거리가 아니라'),
  brightMass: W('s09', '밝기와'), mass9: W('s09', '질량이'), decides: W('s09', '정합니다'),
  calc10: W('s10', '계산하면'), perMass: W('s10', '하나마다'), sunBright: W('s10', '태양 밝기의'), n33k: W('s10', '삼만'), isLimit: W('s10', '한계입니다'),
  sunIs: W('s10', '태양은'), farBelow: W('s10', '한참'),
  but: W('s11', '그런데'), heavier: W('s11', '무거울수록'), steep: W('s11', '가파르게'), heaviest: W('s11', '가장'), close11: W('s11', '바짝'),
  approach: W('s11', '다가갑니다'),
  s200: W('s12', '태양보다'), n200: W('s12', '이백'), fierce: W('s12', '거센'), wind: W('s12', '별바람으로'), shave: W('s12', '깎아'), endure: W('s12', '버팁니다'),
  y1843: W('s13', '천팔백사십삼년'), carina: W('s13', '용골자리'), etaW: W('s13', '에타별은'), overLimit: W('s13', '한계를'),
  brightened: W('s13', '밝아져'), night: W('s13', '밤하늘에서'), second: W('s13', '두 번째로'), became: W('s13', '되었습니다'),
  then: W('s14', '그때'), ten: W('s14', '열 배가'), gasOut: W('s14', '뿜어져'), now: W('s14', '지금도'), dumbbell: W('s14', '아령'), spread: W('s14', '퍼지고'),
  bhToo: W('s15', '블랙홀도'), suck: W('s15', '빨려'), glows: W('s15', '빛나면'), thatLight: W('s15', '그 빛이'), follow: W('s15', '뒤따르는'),
  pushBack: W('s15', '밀어내'), swallowW: W('s15', '삼키는'), speedW: W('s15', '빠르기에'), capW: W('s15', '한계가'),
  bigbang: W('s16', '빅뱅'), m700: W('s16', '칠억'), n16: W('s16', '십육억'), grew: W('s16', '자란'), how: W('s16', '어떻게'), mystery: W('s16', '수수께끼입니다'),
  notWall: W('s17', '그렇다고'), no: W('s17', '아닙니다'), diskIn: W('s17', '기체는'), diskW: W('s17', '원반으로'), lightOut: W('s17', '빛은'),
  other: W('s17', '다른'), escape: W('s17', '빠져나가면'), over10: W('s17', '한계보다'), ten10: W('s17', '열'), shine: W('s17', '빛나기도'),
  cLight: W('s18', '빛이'), cGrav: W('s18', '중력과'), cEqual: W('s18', '같아지는'), cBeyond: W('s18', '너머에서는'), cStar: W('s18', '별이'),
  cFly: W('s18', '날아갑니다'), cThis: W('s18', '이것이'), cLimit: W('s18', '한계입니다'),
};

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
const R_REF = 200;                                                      // hook / close star radius at M = 100 (px)
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r);
  // hook: poster (M = 100, Γ = 1.6, shell already lifting) → knobs back to the Sun → s02: mass up, then brightness past the limit
  const rs0 = at(A.decide) - 0.45, rs1 = at(A.ask) + 0.35, g0 = at(A.heavy) - 0.1, g1 = at(A.burn) + 0.5, b0 = at(A.tooBright) - 0.1, b1 = b0 + 3.0;
  const Bp = 1.6 / gammaMS(100), Bm = 1.5 / gammaMS(100);
  P.hook = {rs0, rs1, g0, g1, b0, b1};
  P.hookLgM = t => (t < rs0 ? 2 : t < rs1 ? lerp(2, 0, easeInOut((t - rs0) / (rs1 - rs0))) : t < g0 ? 0 : lerp(0, 2, easeInOut((t - g0) / (g1 - g0))));
  P.hookBoost = t => (t < rs0 ? Bp : t < rs1 ? lerp(Bp, 1, easeInOut((t - rs0) / (rs1 - rs0))) : t < b0 ? 1 : lerp(1, Bm, smooth((t - b0) / (b1 - b0))));
  P.hookGamma = t => gammaMS(10 ** P.hookLgM(t)) * P.hookBoost(t);
  P.s1 = shellTrack(t => (t < 0 ? 1.6 : P.hookGamma(t)), -1.15, 20);
  let tc = g1; while (P.hookGamma(tc) < 1 && tc < 17.4) tc += 1 / 240;
  P.cross = tc;
  P.s2 = shellTrack(P.hookGamma, tc - 0.02, 20);
  P.wind = shellTrack(() => 1.5, 0, 12);                                // a parcel released from the surface at Γ = 1.5
  P.windStart = tc + 1.4;
  // essence: brightness knob 0.35 → 0.55 → exactly 1 at "같아지는 밝기"
  const e0 = at(A.eLight), e1 = at(A.equal) - 0.1, e2 = at(A.bright) + 0.2;
  P.essGamma = t => (t < e1 ? lerp(0.35, 0.55, smooth((t - e0) / 1.2)) : lerp(0.55, 1, easeInOut((t - e1) / (e2 - e1))));
  P.essEqual = e2;
  // close: 0.66 → 1 (balanced, nothing moves) → 1.5 past "너머" (the shell flies)
  const c0 = tl.scene('close').start + 0.2, c1 = at(A.cEqual) + 0.15, c2 = at(A.cBeyond) + 0.05, c3 = c2 + 1.3;
  P.closeGamma = t => (t < c2 ? (t < c1 ? lerp(gammaMS(100), 1, easeInOut((t - c0) / (c1 - c0))) : 1) : lerp(1, 1.5, smooth((t - c2) / (c3 - c2))));
  let tcc = c2; while (P.closeGamma(tcc) <= 1 && tcc < tl.duration) tcc += 1 / 240;
  P.closeCross = tcc; P.closeBal = c1;
  P.s3 = shellTrack(P.closeGamma, tcc - 0.02, tl.duration + 1);
  // pair lens: one photon schedule; hits push the target (atom → electron)
  const p0 = tl.scene('pair').start + 0.3, p1 = tl.scene('pair').end - 0.2, split = at(A.split);
  const ph = [], R = rng(1843); let tt = p0 - 0.4, k = 0;
  while (tt < p1) {
    const hitIt = k % 5 !== 2 && k % 7 !== 4;                          // most photons are aimed at the target; some pass by
    const lane = hitIt ? (R() - 0.5) * 10 : (R() < 0.5 ? -1 : 1) * (40 + 120 * R());
    ph.push({t0: tt, lane, hit: hitIt, ang: (R() < 0.5 ? -1 : 1) * (0.5 + 1.9 * R())});
    tt += 0.5 + 0.28 * R(); k++;
  }
  const LV = 330, LR = 245;                                              // photon speed in the lens (px/s), lens radius
  for (const q of ph) { const tx = q.t0 + 0.5 < split ? 0 : 92; q.th = q.hit ? q.t0 + (LR + tx - 14) / LV : null; q.tx = tx; }
  P.photons = ph; P.LV = LV; P.LR = LR; P.split = split;
  P.hits = ph.filter(q => q.hit && q.th > tl.scene('pair').start + 0.2 && q.th < p1).map(q => q.th);
  // balance: pair at r0 → 2r0
  P.dist = t => 1 + easeInOut((t - at(A.double) + 0.05) / 1.5);         // r / r0
  // black hole supply (Eddington units) rises; swallowed rate is capped
  const s0 = at(A.suck) - 0.1, s1 = at(A.speedW) - 0.6;
  P.supply = t => 0.4 + 2.4 * smooth((t - s0) / (s1 - s0));
  P.mdot = t => swallow(P.supply(t));
  // η Car year cursor: 1822 → 1838 at "한계를" → 1843 at "밝아져"; hold; → 1870
  const y0 = tl.scene('eta').start + 0.2, y1 = at(A.overLimit), y2 = at(A.brightened) + 0.1, y3 = at(A.became) + 0.1, y4 = at('s13:end') + 0.6;
  P.etaYear = t => (t < y1 ? lerp(1822, 1838, clamp((t - y0) / (y1 - y0))) : t < y2 ? lerp(1838, 1843, (t - y1) / (y2 - y1)) : t < y3 ? 1843 : lerp(1843, 1870, easeInOut((t - y3) / (y4 - y3))));
  const h0 = at(A.then) - 0.15, h1 = at(A.now) + 0.1;
  P.homYear = t => lerp(1843, 2026, clamp((t - h0) / (h1 - h0)) ** 1.0);
  // cosmic time cursor (Myr): Big Bang → seed (100) → 680
  const u0 = at(A.bigbang) - 0.15, u1 = at(A.bigbang) + 0.45, u2 = at(A.n16) - 0.15;
  P.univ = t => (t < u0 ? 0 : t < u1 ? lerp(0, 100, (t - u0) / (u1 - u0)) : lerp(100, 680, clamp((t - u1) / (u2 - u1))));
  // myth: Γ of the disk source 0.6 → 1 → >10 (log ramp)
  const m0 = at(A.lightOut) - 0.2, m1 = at(A.ten10) + 0.3;
  P.mythGamma = t => 10 ** lerp(Math.log10(0.6), Math.log10(M82X2.gamma), smooth((t - m0) / (m1 - m0)));
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Render infrastructure: additive float buffer (glow), noise texture, star field
// =====================================================================================================
const TEXN = 256;
const TEX = (() => {
  const n = TEXN, out = new Float32Array(n * n), R = rng(20261104);
  let amp = 1;
  for (let cells = 8; cells <= 128; cells *= 2, amp *= 0.55) {
    const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n * cells, v = y / n * cells, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
      out[y * n + x] += amp * lerp(lerp(g[j0 * cells + i0], g[j0 * cells + i1], su), lerp(g[j1 * cells + i0], g[j1 * cells + i1], su), sv);
    }
  }
  let lo = Infinity, hi = -Infinity; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
})();
function tex(u, v) {
  u -= Math.floor(u / TEXN) * TEXN; v -= Math.floor(v / TEXN) * TEXN;
  const i0 = u | 0, j0 = v | 0, fu = u - i0, fv = v - j0, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  return (TEX[j0 * TEXN + i0] * (1 - fu) + TEX[j0 * TEXN + i1] * fu) * (1 - fv) + (TEX[j1 * TEXN + i0] * (1 - fu) + TEX[j1 * TEXN + i1] * fu) * fv;
}

class Glow {
  constructor(W = 1080, H = 1920, s = 0.5) {
    Object.assign(this, {s, w: Math.ceil(W * s), h: Math.ceil(H * s)});
    const n = this.w * this.h; this.R = new Float32Array(n); this.G = new Float32Array(n); this.B = new Float32Array(n);
    this.cv = createCanvas(this.w, this.h); this.cc = this.cv.getContext('2d'); this.img = this.cc.createImageData(this.w, this.h);
    this.sm = createCanvas(Math.ceil(this.w / 4), Math.ceil(this.h / 4)); this.smc = this.sm.getContext('2d');
    this.d = [this.w, this.h, 0, 0]; this.prev = [0, 0, 0, 0];
  }
  begin() {
    const [x0, y0, x1, y1] = this.prev;
    for (let y = y0; y < y1; y++) { const o = y * this.w; this.R.fill(0, o + x0, o + x1); this.G.fill(0, o + x0, o + x1); this.B.fill(0, o + x0, o + x1); }
    if (x1 > x0 && y1 > y0) this.cc.clearRect(Math.max(0, x0 - 2), Math.max(0, y0 - 2), x1 - x0 + 4, y1 - y0 + 4);   // no stale pixels bleed in at the rect edge
    this.d = [this.w, this.h, 0, 0]; return this;
  }
  region(X0, Y0, X1, Y1) {
    const s = this.s, a = Math.max(0, Math.floor(X0 * s)), b = Math.max(0, Math.floor(Y0 * s)), c = Math.min(this.w, Math.ceil(X1 * s)), d = Math.min(this.h, Math.ceil(Y1 * s));
    if (c <= a || d <= b) return null;
    const D = this.d; D[0] = Math.min(D[0], a); D[1] = Math.min(D[1], b); D[2] = Math.max(D[2], c); D[3] = Math.max(D[3], d);
    return [a, b, c, d];
  }
  /** fn(screenX, screenY, index) for every buffer pixel inside the screen box */
  each(X0, Y0, X1, Y1, fn) {
    const r = this.region(X0, Y0, X1, Y1); if (!r) return; const inv = 1 / this.s, w = this.w;
    for (let by = r[1]; by < r[3]; by++) { const sy = (by + 0.5) * inv, o = by * w; for (let bx = r[0]; bx < r[2]; bx++) fn((bx + 0.5) * inv, sy, o + bx); }
  }
  /** gaussian splat (screen px radius = 2σ) */
  splat(x, y, rad, col, I) {
    const s2 = 2 * (rad / 2) ** 2, {R, G, B} = this;
    this.each(x - rad * 1.6, y - rad * 1.6, x + rad * 1.6, y + rad * 1.6, (sx, sy, i) => { const k = I * Math.exp(-((sx - x) ** 2 + (sy - y) ** 2) / s2); R[i] += k * col[0]; G[i] += k * col[1]; B[i] += k * col[2]; });
  }
  flush(stage, {gain = 1.3, bloom = 0.55, alpha = 1, cross = 0.1} = {}) {
    const [x0, y0, x1, y1] = this.d; this.prev = [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
    if (x1 <= x0 || y1 <= y0 || alpha <= 0) return;
    const {w, R, G, B, img} = this, dd = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, j = i * 4, l = (R[i] + G[i] + B[i]) * cross;
      dd[j] = 255 * (1 - Math.exp(-(R[i] + l) * gain)); dd[j + 1] = 255 * (1 - Math.exp(-(G[i] + l) * gain)); dd[j + 2] = 255 * (1 - Math.exp(-(B[i] + l) * gain)); dd[j + 3] = 255;
    }
    this.cc.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    const c = stage.ctx, inv = 1 / this.s;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha; c.imageSmoothingEnabled = true;
    c.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * inv, y0 * inv, (x1 - x0) * inv, (y1 - y0) * inv);
    if (bloom > 0) {
      const sm = this.sm, sc = this.smc, q = 0.25;
      sc.globalCompositeOperation = 'copy'; sc.filter = 'none';
      sc.clearRect(0, 0, sm.width, sm.height);
      sc.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
      sc.filter = 'blur(5px)'; sc.drawImage(sm, 0, 0); sc.filter = 'none';
      c.globalAlpha = alpha * bloom; c.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, sm.width / q * inv, sm.height / q * inv);
    }
    c.restore();
  }
}
let GB = null;
const glowBuf = () => (GB ||= new Glow()).begin();
/** hide the background star field behind an opaque body (the glow buffer is additive) */
const occlude = (c, x, y, r, a = 1) => withAlpha(c, a, () => circle(c, x, y, r * 0.995, '#000A10'));

// background star field (fixed; space scenes)
const FIELD = (() => { const R = rng(77), s = []; for (let i = 0; i < 260; i++) s.push({x: R() * 1080, y: R() * 1920, r: 0.5 + 1.5 * R() ** 3, a: 0.12 + 0.5 * R() ** 2, c: R()}); return s; })();
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#001826'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const id = ctx.scene.id, k = ['origin', 'balance', 'stars'].includes(id) ? 0.45 : 1;
  for (const s of FIELD) { c.globalAlpha = s.a * k; circle(c, s.x, s.y, s.r, s.c > 0.8 ? '#FFE9C8' : s.c > 0.6 ? '#CFE0FF' : '#EAF0F6'); }
  c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H * 0.45, H * 0.28, W / 2, H * 0.45, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
const PAL = {light: '#FFD36E', lightDeep: '#FFB23F', grav: '#A18CFF', e: '#7FE3FF', p: '#FF8A5C', elec: '#9FE6B8', limit: '#FF5A2A',
  star: '#DCE8FF', sun: '#FFD9A0', gas: '#9FC8FF', dust: '#E8A970', good: '#9FD9C8', muted: '#8AA0A6'};
const SUNC = [1.0, 0.74, 0.42], BLUEC = [0.6, 0.76, 1.0];
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
/** Korean number with ~2 significant digits: 33000 → "3만 3천", 330000 → "33만", 1.6e9 → "16억" */
export function ko(n) {
  if (!(n > 0)) return '0';
  const p = 10 ** (Math.floor(Math.log10(n)) - 1), v = Math.round(n / p) * p;
  if (v >= 1e8) { const e = v / 1e8; return (e >= 10 ? Math.round(e).toLocaleString('en-US') : +e.toFixed(1)) + '억'; }
  if (v >= 1e4) { const m = v / 1e4; if (m >= 10) return Math.round(m).toLocaleString('en-US') + '만'; const a = Math.floor(m), b = Math.round((m - a) * 10); return b ? `${a}만 ${b}천` : `${a}만`; }
  return v >= 10 ? Math.round(v).toLocaleString('en-US') : String(+v.toFixed(v < 1 ? 2 : 1));
}
const fmtG = g => (g >= 10 ? g.toFixed(0) : g >= 0.995 ? g.toFixed(2) : g >= 0.01 ? g.toFixed(2) : g < 1e-4 ? '0.00003' : g.toFixed(4));
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 900}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 500, size: 30, color: PAL.light, align: 'center'}));
}
function hArrow(c, x, y, len, col, w = 6, a = 1) { if (Math.abs(len) < 2 || a <= 0) return; withAlpha(c, a, () => arrow(c, [x, y], [x + len, y], col, w, {head: 10 + w * 2.2})); }
function strike(c, x0, x1, y, q, col = PAL.limit, w = 4) { if (q > 0) line(c, [[x0 - 4, y], [lerp(x0 - 4, x1 + 4, easeOut(q)), y]], rgba(col, 0.95), w); }

// =====================================================================================================
// Renderers
// =====================================================================================================
/** limb-darkened, granulated, rotating star + corona into the glow buffer */
function starGlow(gb, t, cx, cy, R, {temp = 1, I = 1, halo = 1, spin = 0.06, seed = 0} = {}) {
  const col = [0, 1, 2].map(k => lerp(SUNC[k], BLUEC[k], temp)), limbC = [col[0] * 1.08, col[1] * 0.82, col[2] * 0.7];
  const ext = R * (1 + 0.9 * halo + 0.15), {R: BR, G: BG, B: BB} = gb, invR = 1 / R, ph = seed * 91, dmax = ext * invR;
  const aa = 1.6 * invR, e2 = (1 + aa) * (1 + aa);                     // antialiased limb (≈ 1.6 px)
  gb.each(cx - ext, cy - ext, cx + ext, cy + ext, (x, y, i) => {
    const dx = (x - cx) * invR, dy = (y - cy) * invR, d2 = dx * dx + dy * dy;
    let r = 0, g = 0, b = 0, cov = 0;
    if (d2 < e2) {
      const d = Math.sqrt(d2); cov = clamp((1 + aa - d) / (2 * aa));
      const mu = Math.sqrt(Math.max(0, 1 - Math.min(1, d2))), lon = Math.atan2(dx, Math.max(mu, 0.02)) + spin * t, lat = Math.asin(clamp(dy, -1, 1));
      const u = lon / TAU * 2048 + ph, v = (lat / Math.PI + 0.5) * 1024;
      const gr = 0.5 * tex(u + t * 2.2, v + t * 1.3) + 0.3 * tex(u * 2.1 - t * 3.1 + 40, v * 2.1 + t * 1.7) + 0.2 * tex(u * 0.35 + 17, v * 0.35 - t * 0.4);
      const k = I * 1.08 * (0.3 + 0.7 * mu) * (1 + 0.75 * (gr - 0.5) * (0.3 + 0.7 * mu)) * cov, m = mu ** 0.6;
      r = k * lerp(limbC[0], col[0], m); g = k * lerp(limbC[1], col[1], m); b = k * lerp(limbC[2], col[2], m);
    }
    if (cov < 1) {
      const d = Math.sqrt(d2), e = Math.max(0, d - 1), h = (1 - cov) * I * halo * (0.32 * Math.exp(-e / 0.05) + 0.14 * Math.exp(-e / 0.3) + 0.035 / Math.max(1, d2)) * smooth((dmax - d) / (0.45 * (dmax - 1)));
      r += h * col[0]; g += h * col[1]; b += h * col[2];
    }
    BR[i] += r; BG[i] += g; BB[i] += b;
  });
}
/** thin, clumpy, limb-brightened spherical shell (radius rs px) into the glow buffer */
function shellGlow(gb, t, cx, cy, rs, I, {w = 0.14, col = [0.62, 0.74, 1.0], seed = 1, clump = 1} = {}) {
  if (I <= 0.002 || rs <= 2) return;
  const th = Math.max(6, rs * w), ro = rs + th / 2, ri = Math.max(0, rs - th / 2), ro2 = ro * ro, ri2 = ri * ri, norm = 1 / (2 * Math.sqrt(ro2 - ri2));
  const {R, G, B} = gb, sd = seed * 53.7;
  gb.each(cx - ro, cy - ro, cx + ro, cy + ro, (x, y, i) => {
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy; if (d2 >= ro2) return;
    const pth = 2 * (Math.sqrt(ro2 - d2) - (d2 < ri2 ? Math.sqrt(ri2 - d2) : 0));
    const a = Math.atan2(dy, dx), d = Math.sqrt(d2);
    const cl = tex(a / TAU * 512 + sd, d * 0.035 + sd * 0.7) * 0.7 + 0.3 * tex(a / TAU * 1536 + sd * 2, d * 0.09);
    const q = I * pth * norm * (1 - clump + clump * (0.15 + 2.2 * cl * cl * cl));
    R[i] += q * col[0]; G[i] += q * col[1]; B[i] += q * col[2];
  });
}
/** radial light streaks leaving a star (drawn additively on the canvas) */
function photonStreaks(c, t, cx, cy, R, n, {reach = 2.6, speed = 420, a = 0.5, col = '#FFF2D0', len = 34, seed = 3, w = 2.2} = {}) {
  if (n <= 0 || a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  const L = R * (reach - 1);
  for (let k = 0; k < n; k++) {
    const ang = rand(k * 3.1 + seed) * TAU, off = rand(k * 7.7 + seed) * L, s = R + ((t * speed + off) % L), f = (s - R) / L;
    const al = a * Math.sin(Math.PI * clamp(f)) ** 0.7;
    const x0 = cx + Math.cos(ang) * s, y0 = cy + Math.sin(ang) * s, x1 = cx + Math.cos(ang) * (s + len), y1 = cy + Math.sin(ang) * (s + len);
    c.strokeStyle = rgba(col, al); c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  c.restore();
}
/** Γ gauge: linear 0..2, the limit at 1 (top) */
function gauge(stage, cx, cy, r, gam, o = {}) {
  const c = stage.ctx, T = stage.theme, a = o.a ?? 1; if (a <= 0) return;
  const th = v => Math.PI + clamp(v / 2) * Math.PI;
  withAlpha(c, a, () => {
    if (o.plate !== false) rect(c, cx - r - 34, cy - r - 62, 2 * r + 68, r + 156, 14, rgba(T.plate, 0.8), rgba(T.border, 1), 1.5);
    ring(c, cx, cy, r, rgba(T.muted, 0.45), 12, Math.PI, 1.5 * Math.PI);
    ring(c, cx, cy, r, rgba(PAL.limit, 0.7), 12, 1.5 * Math.PI, 2 * Math.PI);
    for (const v of [0, 0.5, 1, 1.5, 2]) { const q = th(v), l0 = r + 9, l1 = r + (v === 1 ? 26 : 17); line(c, [[cx + Math.cos(q) * l0, cy + Math.sin(q) * l0], [cx + Math.cos(q) * l1, cy + Math.sin(q) * l1]], v === 1 ? PAL.limit : rgba(T.muted, 0.9), v === 1 ? 4 : 2.5); }
    stage.text('한계 1', cx, cy - r - 40, {size: 24, weight: 700, color: PAL.limit, align: 'center'});
    stage.text('0', cx - r, cy + 26, {size: 24, weight: 500, color: T.muted, align: 'center'});
    stage.text('2', cx + r, cy + 26, {size: 24, weight: 500, color: T.muted, align: 'center'});
    const q = th(gam), over = gam >= 1, nc = over ? PAL.limit : PAL.light;
    if (over) glow(c, cx + Math.cos(q) * r * 0.7, cy + Math.sin(q) * r * 0.7, 60, PAL.limit, 0.25);
    line(c, [[cx, cy], [cx + Math.cos(q) * r * 0.86, cy + Math.sin(q) * r * 0.86]], nc, 6);
    circle(c, cx, cy, 11, nc); circle(c, cx, cy, 5, T.plate);
    stage.text(fmtG(gam), cx, cy + 34, {role: 'display', size: 36, weight: 700, color: over ? PAL.limit : T.ink, align: 'center'});
    stage.text(o.label || '빛이 미는 힘 ÷ 중력', cx, cy + 72, {size: 24, weight: 500, color: T.muted, align: 'center'});
  });
}
/** e–p pair icon with the rope (small) */
function pairIcon(c, x, y, s = 1, a = 1, o = {}) {
  withAlpha(c, a, () => {
    const xe = x + 26 * s, xp = x - 26 * s;
    line(c, zig(xp + 11 * s, xe - 5 * s, y, 4 * s, 6), rgba(PAL.elec, 0.9), 2 * s);
    sphere3(c, xp, y, 12 * s, PAL.p); sphere3(c, xe, y, 6 * s, PAL.e);
  });
}
function zig(x0, x1, y, amp, n) { const pts = []; for (let k = 0; k <= 2 * n; k++) pts.push([lerp(x0, x1, k / (2 * n)), y + (k === 0 || k === 2 * n ? 0 : (k % 2 ? -amp : amp))]); return pts; }
function sphere3(c, x, y, r, col) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.28, col); g.addColorStop(1, mix(col, '#000000', 0.55));
  circle(c, x, y, r, g);
}
/** a photon drawn as a short wave packet travelling along (dx, dy) with its head at (x, y) */
function photon(c, x, y, dx, dy, a = 1, o = {}) {
  if (a <= 0) return;
  const L = o.len ?? 44, A = o.amp ?? 6, n = 26, px = -dy, py = dx, pts = [];
  for (let k = 0; k <= n; k++) { const u = k / n, s = -L * (1 - u), wv = Math.sin(u * TAU * 2.5) * A * Math.sin(Math.PI * u) ** 0.5; pts.push([x + dx * s + px * wv, y + dy * s + py * wv]); }
  withAlpha(c, a, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    line(c, pts, rgba(o.col || PAL.light, 0.95), o.w ?? 3);
    glow(c, x, y, 16, o.col || PAL.light, 0.4);
    c.restore();
    if (o.head !== false) arrow(c, [x - dx * 4, y - dy * 4], [x + dx * 12, y + dy * 12], o.col || PAL.light, 3, {head: 11});
  });
}

// =====================================================================================================
// Header titles (sequential swaps)
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '에딩턴 한계'],
  origin: ['기원 · 이름', '별 속의 빛을 계산한 사람'],
  essence: ['본질 · 제1원리', '빛이 미는 힘 = 중력'],
  pair: ['메커니즘 · 빛의 운동량', '빛은 부딪히며 민다'],
  balance: ['메커니즘 · 거리', '둘 다 거리²에 반비례'],
  stars: ['현상 · 무거운 별', '무거울수록 한계에 가깝다'],
  eta: ['사례 · 용골자리 에타 1843년', '한계를 넘은 별'],
  blackhole: ['사례 · 블랙홀', '삼키는 빠르기의 한계'],
  myth: ['오해 바로잡기', '넘을 수 없는 벽일까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s04') - 0.5, '기원 · 1919년 일식', '휘는 별빛을 잰 사람']];
  if (id === 'pair') return [[-Infinity, ...titles.pair], [at('s07') - 0.5, '메커니즘 · 전자와 양성자', '빛은 가벼운 전자를 민다'], [at('s08') - 0.5, '메커니즘 · 줄다리기', '중력은 무거운 양성자를 당긴다']];
  if (id === 'balance') return [[-Infinity, ...titles.balance], [at('s10') - 0.6, '메커니즘 · 한계의 크기', '질량에 비례하는 한계']];
  if (id === 'stars') return [[-Infinity, ...titles.stars], [at('s12') - 0.5, '현상 · 가장 무거운 별', '별바람으로 버틴다']];
  if (id === 'eta') return [[-Infinity, ...titles.eta], [at('s14') - 0.6, '사례 · 호문쿨루스 성운', '지금도 퍼지는 기체']];
  if (id === 'blackhole') return [[-Infinity, ...titles.blackhole], [at('s16') - 0.6, '사례 · 초기 우주의 블랙홀', '너무 빨리 자란 블랙홀']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
const MORPH = [0.92, 1.72];                                             // first-frame title → header
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id;
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', '에딩턴 한계', fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, '빛이 별을 밀어낸다', ho);
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28) * (id === 'close' ? 0 : 1);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
/** t = 0 poster title (two lines in the central square) shrinking into the hook header */
function posterTitle(stage, t) {
  const c = stage.ctx, T = stage.theme, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0]));
  const y1 = lerp(1085, 228, q), s1 = lerp(132, 54, q), y2 = lerp(1212, 290, q), s2 = lerp(62, 30, q);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, 960, 0, 1310); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.35, 'rgba(0,10,16,0.62)'); g.addColorStop(0.8, 'rgba(0,10,16,0.62)'); g.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g; c.fillRect(0, 960, 1080, 350);
  });
  stage.text('에딩턴 한계', 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 18});
  stage.text('빛이 별을 밀어낸다', 540, y2, {role: 'display', weight: 500, size: s2, color: PAL.light, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 14});
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/eddington-limit/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [0.5, 9.1, 13.4, 15.2, 164.0, 166.8]) h += (t < 20 ? P.hookGamma(t) : P.closeGamma(t)) * 7 + (t < 20 ? P.s2.r(t) : P.s3.r(t));
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${P.cross.toFixed(3)}/${P.closeCross.toFixed(3)}/${P.hits.length}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  pair(stage, t, p, ctx) { pairScene(stage, t, ctx); },
  balance(stage, t, p, ctx) { balanceScene(stage, t, ctx); },
  stars(stage, t, p, ctx) { starsScene(stage, t, ctx); },
  eta(stage, t, p, ctx) { etaScene(stage, t, ctx); },
  blackhole(stage, t, p, ctx) { blackholeScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: the big star, its outer layer flying off
/** star + shells + wind for the hook and close scenes (shared look) */
function bigStar(stage, t, {cx, cy, M, gam, shells = [], wind = null, a = 1}) {
  const c = stage.ctx, R = starR(M, R_REF), temp = starTemp(M), L = gam * lEdd(M), lumK = clamp(Math.log10(Math.max(L, 1)) / 6.6);
  const gb = glowBuf(); occlude(c, cx, cy, R, a);
  starGlow(gb, t, cx, cy, R, {temp, I: 0.85 + 0.35 * lumK, halo: 0.6 + 1.2 * lumK, seed: 2});
  for (const s of shells) shellGlow(gb, t, cx, cy, s.r, s.I, {seed: s.seed, w: 0.16});
  if (wind) for (const q of wind) gb.splat(q.x, q.y, q.s, [0.6, 0.72, 1.0], q.I);
  gb.flush(stage, {gain: 1.3, bloom: 0.35, alpha: a, cross: 0.05});
  photonStreaks(c, t, cx, cy, R, Math.round(18 + 56 * lumK), {reach: 1 + 520 / R, a: 0.34 * a, speed: 380, len: 30 + 20 * lumK, w: 2});
  return R;
}
function hookShells(P, t) {
  const out = [];
  const r1 = P.s1.r(t) * R_REF; if (r1 > R_REF * 1.004) out.push({r: r1, I: 1.25 * (R_REF / r1) ** 1.6 * smooth((r1 - R_REF) / 12), seed: 1});
  const r2 = P.s2.r(t) * R_REF; if (r2 > R_REF * 1.004) out.push({r: r2, I: 1.25 * (R_REF / r2) ** 1.6 * smooth((r2 - R_REF) / 12), seed: 2});
  return out;
}
/** wind parcels released every 0.16 s once Γ > 1 (same integration as the shells) */
function windParcels(P, t, t0, cx, cy, R, track, n0 = 0) {
  const out = []; if (t < t0) return out;
  const dt = 0.16, k1 = Math.floor((t - t0) / dt);
  for (let k = Math.max(0, k1 - 60); k <= k1; k++) {
    const age = t - t0 - k * dt; if (age < 0) continue;
    const r = track.r(age) * R; if (r > 1400) continue;
    const ang = rand(k * 1.37 + n0) * TAU, x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    out.push({x, y, s: 10 + 0.02 * r, I: 0.5 * (R / r) ** 1.4 * smooth(age / 0.3)});
  }
  return out;
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), cx = 540, cy = 700;
  const M = 10 ** P.hookLgM(t), gam = P.hookGamma(t), ef = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const wind = gam > 1 && t > P.windStart ? windParcels(P, t, P.windStart, cx, cy, R_REF, P.wind, 5) : null;
  const R = bigStar(stage, t, {cx, cy, M, gam, shells: hookShells(P, t), wind, a: ef});
  // instrument: knobs and the Γ gauge (after the poster title has moved to the header)
  const gA = fadeIn(t, MORPH[1] + 0.05, 0.6) * ef;
  if (gA > 0) {
    gauge(stage, 540, 1222, 124, gam, {a: gA});
    withAlpha(c, gA, () => {
      stage.text('질량', 150, 1150, {size: 24, weight: 500, color: T.muted});
      stage.text(`태양의 ${ko(M)}배`, 150, 1190, {role: 'display', size: 32, weight: 700, color: T.ink});
      stage.text('밝기', 930, 1150, {size: 24, weight: 500, color: T.muted, align: 'right'});
      stage.text(`태양의 ${ko(gam * lEdd(M))}배`, 930, 1190, {role: 'display', size: 32, weight: 700, color: gam >= 1 ? PAL.limit : PAL.light, align: 'right'});
      const kq = [at(A.heavy) - 0.1, at(A.tooBright) - 0.1];
      if (t > kq[0] - 0.2 && t < kq[0] + 3.2) tag(stage, '질량 ↑', 150, 1240, {size: 24, color: PAL.good, a: fadeIn(t, kq[0], 0.3) * fadeOut(t, kq[0] + 2.8, 0.3), align: 'left'});
      if (t > kq[1] - 0.2) tag(stage, '밝기 ↑', 930, 1240, {size: 24, color: PAL.light, a: fadeIn(t, kq[1], 0.3) * fadeOut(t, kq[1] + 3.0, 0.3), align: 'right'});
    });
  }
  // label the lifting outer layer and the leaving shell
  const r2 = P.s2.r(t) * R_REF, lA = fadeIn(t, at(A.outer) - 0.2, 0.35) * fadeOut(t, at(A.blow) - 0.4, 0.25) * ef;
  if (lA > 0 && r2 > R_REF * 1.03) {
    const yy = Math.max(372, cy - r2 - 26);
    tag(stage, '바깥층', 540, yy, {size: 26, color: PAL.gas, a: lA * (cy - r2 - 26 > 330 ? 1 : 0.0 + smooth((cy - r2 + 20) / 40))});
  }
  if (t > at(A.blow) - 0.2) tag(stage, '우주로 날아감', 540, 380, {size: 26, color: PAL.gas, a: fadeIn(t, at(A.blow) - 0.12, 0.3) * ef});
  void R;
}

// ------------------------------------------------------------------ origin: Eddington's name, radiation pressure, the 1919 eclipse
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.scene, sf = sceneFade(t, ctx);
  const sw = at('s04') - 0.55;                                          // s03 → s04 swap (sequential)
  const a3 = fadeIn(t, sc.start + 0.05, 0.4) * fadeOut(t, sw, 0.3) * sf, a4 = fadeIn(t, sw + 0.3, 0.4) * sf;
  if (a3 > 0) withAlpha(c, a3, () => {
    // name card (no portrait)
    panel(c, T, 140, 318, 800, 196);
    stage.text('Arthur Eddington', 176, 372, {role: 'display', size: 54, weight: 700, color: T.ink});
    stage.text('아서 에딩턴 · 영국 천문학자', 176, 430, {size: 30, weight: 500, color: T.ink, alpha: fadeIn(t, at(A.uk) - 0.6, 0.4) * 0.4 + 0.6});
    stage.text('1882~1944', 176, 478, {size: 28, weight: 500, color: T.muted});
    // star cross-section with light pushing outward (radiation pressure)
    const cx = 540, cy = 790, R = 150, gb = glowBuf(), q16 = fadeIn(t, at(A.y1916) - 0.2, 0.5), qP = fadeIn(t, at(A.lightP) - 0.15, 0.6);
    starGlow(gb, t, cx, cy, R, {temp: 0.75, I: 0.9, halo: 0.7, seed: 5});
    gb.flush(stage, {gain: 1.15, bloom: 0.5});
    // photons random-walking out from the centre (drawn above the disc, inside it)
    c.save(); c.beginPath(); c.arc(cx, cy, R * 1.6, 0, TAU); c.clip();
    for (let k = 0; k < 26; k++) {
      const ang = rand(k * 2.3) * TAU, life = 2.4, ph = ((t + rand(k * 5.1) * life) % life) / life, s = R * (0.1 + 1.45 * ph);
      const wob = 10 * Math.sin(t * 7 + k), x = cx + Math.cos(ang) * s + Math.cos(ang + 1.57) * wob * (1 - ph), y = cy + Math.sin(ang) * s + Math.sin(ang + 1.57) * wob * (1 - ph);
      photon(c, x, y, Math.cos(ang), Math.sin(ang), 0.75 * Math.sin(Math.PI * ph) * (0.35 + 0.65 * qP), {len: 26, amp: 4, w: 2, head: false});
    }
    c.restore();
    // outward arrows = light pushing (radiation pressure)
    for (let k = 0; k < 8; k++) {
      const ang = k / 8 * TAU + 0.2, r0 = R + 14, r1 = R + 14 + 70 * qP * (0.9 + 0.1 * Math.sin(t * 3 + k));
      withAlpha(c, qP, () => arrow(c, [cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0], [cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1], PAL.light, 5, {head: 16}));
    }
    tag(stage, '1916~ 별 속 계산', 540, 574, {size: 28, color: PAL.light, a: q16});
    tag(stage, '빛이 미는 힘 = 복사압', 540, 1012, {size: 30, color: PAL.light, a: qP});
    // terms (the narration no longer says them)
    const qT = fadeIn(t, at(A.eddington) - 0.3, 0.45);
    withAlpha(c, qT, () => {
      panel(c, T, 140, 1080, 800, 210);
      stage.text('에딩턴 광도 = 에딩턴 한계', 540, 1140, {role: 'display', size: 40, weight: 700, color: T.accent, align: 'center'});
      stage.text('광도: 별이 1초에 내놓는', 540, 1202, {size: 30, weight: 500, color: T.ink, align: 'center'});
      stage.text('빛 에너지 전부', 540, 1250, {size: 30, weight: 500, color: T.ink, align: 'center'});
    });
  });
  if (a4 > 0) withAlpha(c, a4, () => eclipse1919(stage, t, ctx));
}
/** 1919: the Moon covers the Sun; a star next to the Sun appears shifted outward because its light bends */
function eclipse1919(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r);
  const cov = smooth((t - at(A.y1919) + 0.1) / (at(A.sunE) + 0.2 - at(A.y1919) + 0.1));      // Moon slides over the Sun
  const bendQ = easeInOut((t - at(A.bend) + 0.1) / 1.2), meas = fadeIn(t, at(A.measure) - 0.1, 0.4), conf = fadeIn(t, at(A.relativity) - 0.1, 0.4);
  const dark = smooth((cov - 0.15) / 0.85), corona = smooth((cov - 0.9) / 0.1);
  // sky view
  const box = {x: 140, y: 314, w: 800, h: 440}, sx = 540, sy = 530, rS = 58;
  clipRect(c, box.x, box.y, box.w, box.h, 14, () => {
    c.fillStyle = mix('#4d84b8', '#030c14', dark); c.fillRect(box.x, box.y, box.w, box.h);
    glow(c, sx, sy, 330 * (1 - 0.85 * dark), '#FFF4D8', 0.5 * (1 - dark));
    // corona at totality
    if (corona > 0) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 40; k++) { const a = rand(k * 3.3) * TAU, l = rS * (1.3 + 1.6 * rand(k * 1.9)); c.strokeStyle = rgba('#EAF2FF', 0.18 * corona); c.lineWidth = 2 + 4 * rand(k); c.beginPath(); c.moveTo(sx + Math.cos(a) * rS, sy + Math.sin(a) * rS); c.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); c.stroke(); }
      glow(c, sx, sy, rS * 2.6, '#DDE8FF', 0.55 * corona); c.restore();
    }
    circle(c, sx, sy, rS, '#FFF2CF');
    const mx = lerp(sx - 300, sx, cov), my = lerp(sy - 40, sy, cov);
    circle(c, mx, my, rS * 1.03, '#05090D');
    // background stars appear in the dark sky
    for (const [x, y, r] of [[230, 380, 2.5], [860, 420, 2.2], [300, 690, 2.0], [800, 700, 2.6], [420, 410, 1.8], [700, 640, 1.8]]) circle(c, x, y, r, rgba('#EAF2FF', 0.9 * dark));
    const tx = sx + 150, ty = sy - 74, ux = (tx - sx) / Math.hypot(tx - sx, ty - sy), uy = (ty - sy) / Math.hypot(tx - sx, ty - sy), sh = 46 * bendQ;
    const ax = tx + ux * sh, ay = ty + uy * sh;
    if (bendQ > 0) { ring(c, tx, ty, 13, rgba(T.muted, 0.9 * dark), 2); line(c, [[tx, ty], [ax, ay]], rgba(PAL.light, 0.8 * dark), 2, {dash: [5, 5]}); }
    glow(c, ax, ay, 24, '#EAF2FF', 0.6 * dark); circle(c, ax, ay, 4, rgba('#FFFFFF', dark));
    if (bendQ > 0.6) {
      tag(stage, '원래 위치', tx - 20, ty + 40, {size: 24, color: T.muted, a: smooth((bendQ - 0.6) / 0.3) * dark, align: 'right'});
      tag(stage, '보이는 위치', ax + 22, ay - 20, {size: 24, color: '#EAF2FF', a: smooth((bendQ - 0.6) / 0.3) * dark, align: 'left'});
    }
    if (meas > 0) { const mx0 = tx + uy * 22, my0 = ty - ux * 22, mx1 = ax + uy * 22, my1 = ay - ux * 22; withAlpha(c, meas, () => { line(c, [[mx0, my0], [mx1, my1]], PAL.light, 3); line(c, [[mx0 - uy * 8, my0 + ux * 8], [mx0 + uy * 8, my0 - ux * 8]], PAL.light, 3); line(c, [[mx1 - uy * 8, my1 + ux * 8], [mx1 + uy * 8, my1 - ux * 8]], PAL.light, 3); }); }
    stage.text('개기일식 · 하늘에서 본 모습', 164, 346, {size: 24, weight: 700, color: dark > 0.5 ? T.muted : '#EAF2FF'});
    tag(stage, '휨 크게 과장', 916, 726, {size: 24, color: T.muted, align: 'right', a: smooth((bendQ - 0.2) / 0.3)});
  });
  rect(c, box.x, box.y, box.w, box.h, 14, null, rgba(T.border, 1), 1.5);
  // side view: starlight bends past the Sun on its way to Earth
  const sv = {x: 140, y: 790, w: 800, h: 470};
  panel(c, T, sv.x, sv.y, sv.w, sv.h, 0.8);
  stage.text('옆에서 본 빛의 길', 164, 822, {size: 24, weight: 700, color: T.muted});
  const S = [575, 1080], rs = 46, E = [880, 1130], star = [200, 990], Pb = [575, 1022];
  glow(c, S[0], S[1], 120, '#FFE9B8', 0.35); circle(c, S[0], S[1], rs, '#FFE9B0');
  stage.text('태양', S[0], S[1] + rs + 30, {size: 24, weight: 700, color: T.ink, align: 'center'});
  sphere3(c, E[0], E[1], 18, '#5BA3E0'); stage.text('지구', E[0], E[1] + 42, {size: 24, weight: 700, color: T.ink, align: 'center'});
  const moon = [800, 1116]; circle(c, moon[0], moon[1], 7, '#9AA3AA');
  stage.text('달', moon[0] - 4, moon[1] + 30, {size: 24, weight: 500, color: T.muted, align: 'center'});
  glow(c, star[0], star[1], 26, '#EAF2FF', 0.7); circle(c, star[0], star[1], 6, '#FFFFFF');
  stage.text('별', star[0], star[1] - 34, {size: 24, weight: 700, color: T.ink, align: 'center'});
  // the bent ray: star → near the limb → Earth (bending grows with bendQ)
  const mid = [lerp(lerp(star[0], E[0], 0.5), Pb[0], bendQ), lerp(lerp(star[1], E[1], (Pb[0] - star[0]) / (E[0] - star[0])), Pb[1], bendQ)];
  const path = [], kA = 0.78, kB = 0.18;                                // straight → short bend near the Sun → straight
  const pa = [lerp(star[0], mid[0], kA), lerp(star[1], mid[1], kA)], pb = [lerp(mid[0], E[0], kB), lerp(mid[1], E[1], kB)];
  for (let k = 0; k <= 40; k++) { const u = k / 40; if (u < 0.4) path.push([lerp(star[0], pa[0], u / 0.4), lerp(star[1], pa[1], u / 0.4)]); else if (u < 0.6) { const w = (u - 0.4) / 0.2; path.push([(1 - w) ** 2 * pa[0] + 2 * (1 - w) * w * mid[0] + w * w * pb[0], (1 - w) ** 2 * pa[1] + 2 * (1 - w) * w * mid[1] + w * w * pb[1]]); } else path.push([lerp(pb[0], E[0], (u - 0.6) / 0.4), lerp(pb[1], E[1], (u - 0.6) / 0.4)]); }
  // round the kink a little
  const rayA = fadeIn(t, at(A.beside) - 0.2, 0.4);
  if (rayA > 0) {
    withAlpha(c, rayA, () => {
      line(c, [star, E], rgba(T.muted, 0.6), 2, {dash: [6, 7]});
      line(c, path, rgba(PAL.light, 0.95), 3.5);
      // a photon riding the ray
      const ph = ((t - at(A.beside)) / 1.6) % 1, k = Math.floor(clamp(ph) * 40), q = path[Math.min(40, k)], q2 = path[Math.min(40, k + 1)];
      if (ph >= 0) { const d = Math.hypot(q2[0] - q[0], q2[1] - q[1]) || 1; photon(c, q[0], q[1], (q2[0] - q[0]) / d, (q2[1] - q[1]) / d, 0.9, {len: 30, amp: 4, head: false}); }
    });
    // apparent direction (extend the arriving ray backwards)
    const dx = E[0] - mid[0], dy = E[1] - mid[1], ext = (E[0] - star[0]) / dx, app = [E[0] - dx * ext, E[1] - dy * ext], aq = smooth((bendQ - 0.4) / 0.4);
    if (aq > 0) withAlpha(c, aq, () => {
      line(c, [E, app], rgba('#EAF2FF', 0.75), 2, {dash: [4, 6]});
      glow(c, app[0], app[1], 22, '#EAF2FF', 0.5); ring(c, app[0], app[1], 9, '#EAF2FF', 2);
      tag(stage, '보이는 방향', app[0] + 18, app[1] - 30, {size: 24, color: '#EAF2FF', align: 'left'});
    });
  }
  if (conf > 0) withAlpha(c, conf, () => {
    const x = 540, y = 1210; rect(c, x - 230, y - 30, 460, 60, 8, rgba(T.plate, 0.9), rgba(T.accent, 0.9), 2);
    stage.text('일반 상대성 이론 확인', x, y, {role: 'display', size: 32, weight: 700, color: T.accent, align: 'center'});
  });
  const who = fadeIn(t, at(A.that) - 0.2, 0.4);
  tag(stage, 'Eddington · 1919', 916, 822, {size: 26, color: T.ink, align: 'right', a: who, role: 'display'});
}

// ------------------------------------------------------------------ essence: one parcel, two arrows, the knob that makes them equal
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), gam = P.essGamma(t);
  // star limb on the left (centre off screen), light flowing to the right
  const SC = [-700, 800], SR = 960, gb = glowBuf();
  starGlow(gb, t, SC[0], SC[1], SR, {temp: 0.95, I: 0.85 + 0.35 * gam, halo: 0.35, spin: 0.01, seed: 7});
  gb.flush(stage, {gain: 1.2, bloom: 0.45, alpha: sf});
  const px = 640, py = 800;
  // light leaving the surface radially (number of streaks ∝ brightness, the same streaks as the hook's star)
  const n = Math.round(14 + 40 * gam);
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const th = (rand(k * 4.1) - 0.5) * 0.66, life = 1.5, ph = ((t + rand(k * 2.7) * life) % life) / life, dx = Math.cos(th), dy = Math.sin(th);
    const s0 = SR + 6 + ph * 800, x = SC[0] + dx * s0, y = SC[1] + dy * s0, al = 0.5 * sf * Math.sin(Math.PI * ph) ** 0.6;
    if (y < 520 || y > 1060) continue;                                   // keep the card and the gauge clear
    c.strokeStyle = rgba('#FFF2D0', al); c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * 46, y + dy * 46); c.stroke();
  }
  c.restore();
  // the parcel (an e–p pair) and the two arrows
  const L0 = 200, lenG = L0, lenL = L0 * gam, eq = fadeIn(t, P.essEqual - 0.1, 0.3);
  withAlpha(c, sf, () => {
    glow(c, px, py, 70, '#CFE3FF', 0.25);
    pairIcon(c, px, py, 1.5);
    const aL = fadeIn(t, at(A.eLight) - 0.15, 0.4), aG = fadeIn(t, at(A.eGrav) - 0.15, 0.4);
    hArrow(c, px + 44, py, lenL, PAL.light, 9, aL);
    hArrow(c, px - 44, py, -lenG, PAL.grav, 9, aG);
    if (aL > 0) stage.text('빛이 밖으로 미는 힘', clamp(px + 44 + lenL / 2, 300, 790), py - 52, {size: 28, weight: 700, color: PAL.light, align: 'center', alpha: aL});
    if (aG > 0) stage.text('중력이 안으로 당기는 힘', clamp(px - 44 - lenG / 2, 470, 790), py + 56, {size: 28, weight: 700, color: PAL.grav, align: 'center', alpha: aG});
    if (eq > 0) { tag(stage, '= 같다', px, py - 120, {size: 30, color: PAL.limit, a: eq}); }
    stage.text('기체 한 덩이', px, py + 104, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, ctx.scene.start + 0.3, 0.4)});
    tag(stage, '별의 표면', 262, 600, {size: 24, color: T.muted, a: fadeIn(t, ctx.scene.start + 0.3, 0.4), align: 'left'});
  });
  // key card, word by word
  const k1 = fadeIn(t, at(A.eLight) - 0.1, 0.35), k2 = fadeIn(t, at(A.eGrav) - 0.1, 0.35), k3 = fadeIn(t, at(A.equal) - 0.1, 0.35), k4 = fadeIn(t, at(A.limit) - 0.15, 0.4);
  withAlpha(c, sf, () => {
    withAlpha(c, k1, () => panel(c, T, 140, 318, 800, 190, 0.86));
    const y1 = 384, gap = 18, w1 = stage.measure('빛이 미는 힘', {role: 'display', size: 40, weight: 700}), w2 = stage.measure('=', {role: 'display', size: 40, weight: 700}), w3 = stage.measure('중력이 당기는 힘', {role: 'display', size: 40, weight: 700});
    const x0 = 540 - (w1 + w2 + w3 + 2 * gap) / 2;
    stage.text('빛이 미는 힘', x0, y1, {role: 'display', size: 40, weight: 700, color: PAL.light, alpha: k1});
    stage.text('=', x0 + w1 + gap, y1, {role: 'display', size: 40, weight: 700, color: PAL.limit, alpha: k3});
    stage.text('중력이 당기는 힘', x0 + w1 + w2 + 2 * gap, y1, {role: 'display', size: 40, weight: 700, color: PAL.grav, alpha: k2});
    stage.text('그 밝기 = 에딩턴 한계', 540, 456, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center', alpha: k4});
  });
  gauge(stage, 640, 1196, 120, gam, {a: sf * fadeIn(t, ctx.scene.start + 0.2, 0.4)});
}

// ------------------------------------------------------------------ pair: 3-tier instrument (star section → lens → force bars)
function pairScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), GAM = 0.6;
  // ① star section with photons streaming out and the tracked parcel
  const S = [300, 470], SR = 140, gb = glowBuf();
  starGlow(gb, t, S[0], S[1], SR, {temp: 0.9, I: 0.95, halo: 0.6, seed: 9});
  gb.flush(stage, {gain: 1.2, bloom: 0.5, alpha: sf});
  withAlpha(c, sf, () => photonStreaks(c, t, S[0], S[1], SR, 40, {reach: 1.9, a: 0.45, speed: 200, len: 22}));
  const par = [S[0] + SR * 0.82, S[1]], LC = [540, 915], LR = P.LR;
  withAlpha(c, sf, () => {
    // leader lines from the parcel to the lens
    const tq = fadeIn(t, ctx.scene.start + 0.2, 0.5);
    withAlpha(c, tq, () => {
      line(c, [[par[0] + 12, par[1] - 12], [LC[0] - LR * 0.42, LC[1] - LR * 0.91]], rgba(T.ink, 0.35), 1.5);
      line(c, [[par[0] + 14, par[1] + 10], [LC[0] + LR * 0.62, LC[1] - LR * 0.78]], rgba(T.ink, 0.35), 1.5);
      ring(c, par[0], par[1], 16, '#FFFFFF', 3); ring(c, par[0], par[1], 22 + 3 * Math.sin(t * 4), rgba('#FFFFFF', 0.4), 2);
    });
    stage.text('① 별 속 기체', 530, 370, {size: 26, weight: 700, color: T.ink});
    stage.text('별의 중심 → 바깥', 530, 410, {size: 24, weight: 500, color: T.muted});
    arrow(c, [530, 446], [700, 446], rgba(PAL.light, 0.8), 3, {head: 12});
    // ② lens
    lens(stage, t, ctx, P, LC, LR, GAM);
    // ③ force bars
    const b3 = fadeIn(t, at(A.light7) - 0.2, 0.4);
    const bL = fadeIn(t, at(A.pushE) - 0.2, 0.5), bG = fadeIn(t, at(A.grav8) - 0.1, 0.5);
    withAlpha(c, b3, () => {
      panel(c, T, 140, 1188, 800, 140);
      stage.text('③ 두 힘', 160, 1216, {size: 24, weight: 700, color: T.ink});
      const x0 = 380, wmax = 380;
      stage.text('빛 → 전자', 160, 1258, {size: 24, weight: 500, color: PAL.light});
      rect(c, x0, 1246, wmax * GAM * bL, 24, 5, PAL.light);
      stage.text('중력 → 양성자', 160, 1302, {size: 24, weight: 500, color: PAL.grav});
      rect(c, x0, 1290, wmax * bG, 24, 5, PAL.grav);
      const rq = bL * bG;
      stage.text('빛 ÷ 중력', 920, 1216, {size: 24, weight: 500, color: T.muted, align: 'right', alpha: rq});
      stage.text(GAM.toFixed(2), 920, 1278, {role: 'display', size: 50, weight: 700, color: T.ink, align: 'right', alpha: rq});
    });
  });
}
/** ② zoom lens: photons with momentum, an atom that splits into e⁻ and p⁺, the electric rope, gravity on the proton */
function lens(stage, t, ctx, P, LC, LR, GAM) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r);
  const split = easeInOut((t - P.split + 0.1) / 0.9), ropeA = fadeIn(t, at(A.elec) - 0.1, 0.5), gA = fadeIn(t, at(A.grav8) - 0.1, 0.4), lA = fadeIn(t, at(A.pushE) - 0.2, 0.4);
  // kicks: each hit moves the electron (fast) and the proton (pulled by the rope, slower)
  let ke = 0, kp = 0;
  for (const q of P.photons) {
    if (!q.hit || q.th > t) continue; const a = t - q.th; if (a > 3) continue;
    const imp = 7 * (1 - Math.exp(-a / 0.05)) * Math.exp(-a / 0.8);
    ke += imp; kp += (a > 0.1 ? 7 * (1 - Math.exp(-(a - 0.1) / 0.12)) * Math.exp(-(a - 0.1) / 0.8) : 0);
  }
  const jit = (k, f) => 3 * Math.sin(t * f + k);
  const xe = LC[0] + lerp(0, 92, split) + ke + jit(1, 9.3), ye = LC[1] + jit(2, 8.1) * 0.8;
  const xp = LC[0] + lerp(0, -92, split) + lerp(ke, kp, split) + jit(3, 3.1) * 0.5, yp = LC[1] + jit(4, 2.7) * 0.4;
  // lens body
  circle(c, LC[0], LC[1], LR, rgba('#020A10', 0.92));
  c.save(); c.beginPath(); c.arc(LC[0], LC[1], LR - 2, 0, TAU); c.clip();
  // faint field grid moving (thermal background)
  for (let k = -5; k <= 5; k++) line(c, [[LC[0] - LR, LC[1] + k * 48], [LC[0] + LR, LC[1] + k * 48]], rgba(T.border, 0.35), 1);
  // the rope (electric force) between proton and electron
  if (split > 0.05 && ropeA > 0) {
    const n = 9, amp = 9 * (1 + 0.3 * Math.sin(t * 6)), pts = [];
    for (let k = 0; k <= 2 * n; k++) { const u = k / (2 * n); pts.push([lerp(xp + 30, xe - 12, u), lerp(yp, ye, u) + (k === 0 || k === 2 * n ? 0 : (k % 2 ? -amp : amp))]); }
    line(c, pts, rgba(PAL.elec, 0.9 * ropeA), 3);
  }
  // photons: travel from the left; pass the proton; scatter off the target
  for (const q of P.photons) {
    const age = t - q.t0; if (age < 0 || age > 3.2) continue;
    const x = LC[0] - LR + P.LV * age, y = LC[1] + q.lane;
    if (q.hit && t > q.th) {
      const b = t - q.th, hx = LC[0] + q.tx - 14, hy = LC[1] + q.lane, dx = Math.cos(q.ang), dy = Math.sin(q.ang);
      photon(c, hx + dx * P.LV * b, hy + dy * P.LV * b, dx, dy, 0.85, {len: 34, amp: 5, head: false});
      if (b < 0.25) glow(c, hx + 14, hy, 50, '#FFFFFF', 0.5 * (1 - b / 0.25));
    } else photon(c, x, y, 1, 0, 0.95, {len: 40, amp: 6});
  }
  // particles
  if (split < 1) withAlpha(c, 1 - split, () => { glow(c, (xe + xp) / 2, (ye + yp) / 2, 46, '#BFD0E0', 0.3); sphere3(c, (xe + xp) / 2, (ye + yp) / 2, 26, '#9FB1C2'); });
  if (split > 0) withAlpha(c, split, () => { sphere3(c, xp, yp, 30, PAL.p); glow(c, xe, ye, 26, PAL.e, 0.5); sphere3(c, xe, ye, 11, PAL.e); });
  // forces on the pair
  if (split > 0.9) {
    hArrow(c, xe + 18, ye, 100 * GAM, PAL.light, 7, lA);
    hArrow(c, xp - 34, yp, -100, PAL.grav, 7, gA);
  }
  c.restore();
  ring(c, LC[0], LC[1], LR, rgba('#FFFFFF', 0.5), 3);
  stage.text('② 확대 · 크기 과장', LC[0], LC[1] - LR + 30, {size: 24, weight: 700, color: T.muted, align: 'center'});
  // labels (outside particles, inside the lens area)
  const s6 = fadeIn(t, at(A.momentum) - 0.2, 0.4) * fadeOut(t, at('s07') - 0.6, 0.3);
  if (s6 > 0) {
    tag(stage, '빛 알갱이(광자) · 운동량을 실어 나름', LC[0], LC[1] + LR - 44, {size: 24, color: PAL.light, a: s6});
    tag(stage, '기체 알갱이', LC[0], LC[1] - 70, {size: 24, color: T.ink, a: fadeIn(t, at(A.grain) - 0.2, 0.3) * s6});
  }
  const s7 = fadeIn(t, P.split + 0.5, 0.4);
  if (s7 > 0) {
    tag(stage, '전자 e⁻', xe + 4, ye - 58, {size: 26, color: PAL.e, a: s7});
    tag(stage, '양성자 p⁺', xp, yp - 74, {size: 26, color: PAL.p, a: s7});
    const mA = fadeIn(t, at(A.lightE) - 0.2, 0.4) * fadeOut(t, at(A.grav8) - 0.4, 0.3);
    tag(stage, '양성자: 전자의 1836배 무게 · 빛을 거의 안 받음', LC[0], LC[1] + LR - 44, {size: 24, color: PAL.p, a: mA});
  }
  const s8 = fadeIn(t, at(A.grav8) - 0.1, 0.4);
  if (s8 > 0) {
    tag(stage, '중력', xp - 86, yp + 44, {size: 26, color: PAL.grav, a: gA});
    tag(stage, '빛', xe + 56, ye + 44, {size: 26, color: PAL.light, a: lA});
    tag(stage, '전기력', (xe + xp) / 2 + 10, ye + 46, {size: 24, color: PAL.elec, a: ropeA});
    const tg = fadeIn(t, at(A.together) - 0.1, 0.4);
    if (tg > 0) { withAlpha(c, tg, () => { rect(c, xp - 46, yp - 46, xe - xp + 70, 92, 46, null, rgba('#FFFFFF', 0.55), 2); }); tag(stage, '한 쌍으로 함께 움직임', LC[0], LC[1] + LR - 44, {size: 24, color: T.ink, a: tg * fadeOut(t, at(A.lightGrav) - 0.3, 0.3)}); }
    const tug = fadeIn(t, at(A.tug) - 0.2, 0.4);
    if (tug > 0) tag(stage, '빛과 중력의 줄다리기', LC[0], LC[1] + LR - 44, {size: 28, color: T.accent, a: tug});
  }
}

// ------------------------------------------------------------------ balance: 1/r² for both → only L and M matter; L_Edd ∝ M
function balanceScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), sw = at('s10') - 0.75;
  const a9 = fadeOut(t, sw, 0.3) * sf, a10 = fadeIn(t, sw + 0.3, 0.45) * sf;
  if (a9 > 0) withAlpha(c, a9, () => inverseSquare(stage, t, ctx));
  if (a10 > 0) withAlpha(c, a10, () => limitBars(stage, t, ctx));
}
function inverseSquare(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), GAM = 0.6;
  const O = [200, 600], dA = 230, k = 0.26;                              // source, distance r, half-size per unit distance
  const proj = (d, y, z) => [O[0] + d + z * 0.42, O[1] - y + z * 0.3];
  const sq = d => { const h = k * d; return [proj(d, h, -h), proj(d, h, h), proj(d, -h, h), proj(d, -h, -h)]; };
  const gb = glowBuf(); starGlow(gb, t, O[0], O[1], 40, {temp: 0.9, I: 1, halo: 1.2, seed: 4}); gb.flush(stage, {gain: 1.2, bloom: 0.5});
  const A1 = sq(dA), B1 = sq(2 * dA);
  // frustum edges
  for (let i = 0; i < 4; i++) line(c, [O, B1[i]], rgba(PAL.light, 0.28), 1.5);
  // light grains flowing through the frustum (same grains through 1 cell then 4 cells)
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const u = rand(i * 1.3) * 2 - 1, v = rand(i * 2.9) * 2 - 1, life = 1.6, ph = ((t + rand(i * 4.7) * life) % life) / life, d = 50 + ph * 2.1 * dA;
    const p = proj(d, v * k * d, u * k * d); circle(c, p[0], p[1], 2.6, rgba(PAL.light, 0.75 * Math.sin(Math.PI * ph)));
  }
  c.restore();
  poly(c, A1, rgba(PAL.light, 0.16), rgba(PAL.light, 0.9), 2.5);
  poly(c, B1, rgba(PAL.light, 0.08), rgba(PAL.light, 0.9), 2.5);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  line(c, [mid(B1[0], B1[1]), mid(B1[3], B1[2])], rgba(PAL.light, 0.7), 1.5); line(c, [mid(B1[0], B1[3]), mid(B1[1], B1[2])], rgba(PAL.light, 0.7), 1.5);
  const sa = fadeIn(t, at(A.both9) - 0.2, 0.4);
  tag(stage, '1칸', proj(dA, k * dA, 0)[0], proj(dA, k * dA, 0)[1] - 34, {size: 26, color: PAL.light, a: sa});
  tag(stage, '4칸 · 칸마다 ¼', proj(2 * dA, k * 2 * dA, 0)[0], proj(2 * dA, k * 2 * dA, 0)[1] - 34, {size: 26, color: PAL.light, a: fadeIn(t, at(A.quarter) - 0.3, 0.4)});
  // axis with r and 2r
  const yAx = O[1] + k * 2 * dA + 60;
  line(c, [[O[0], yAx], [O[0] + 2 * dA, yAx]], rgba(T.muted, 0.8), 2);
  for (const [d, s] of [[dA, '거리 r'], [2 * dA, '거리 2r']]) { line(c, [[O[0] + d, yAx - 8], [O[0] + d, yAx + 8]], T.muted, 2); stage.text(s, O[0] + d, yAx + 30, {size: 26, weight: 700, color: T.ink, align: 'center'}); }
  // the pair moved from r to 2r; both arrows ∝ 1/r²
  const rr = P.dist(t), d = dA * rr, pp = proj(d, 0, 0), fl = fLight(GAM, rr), fg = fGrav(rr), L0 = 170;
  pairIcon(c, pp[0], pp[1], 1.15);
  hArrow(c, pp[0] + 30, pp[1] - 26, L0 * fl, PAL.light, 7);
  hArrow(c, pp[0] - 30, pp[1] + 26, -L0 * fg, PAL.grav, 7);
  // readout: both shrink, the ratio stays
  const ry = 980, q4 = fadeIn(t, at(A.double) - 0.2, 0.4);
  panel(c, T, 140, ry - 46, 800, 196);
  stage.text('빛', 164, ry, {size: 26, weight: 700, color: PAL.light});
  rect(c, 260, ry - 13, 420 * fl, 26, 5, PAL.light);
  stage.text(rr < 1.02 ? '1' : rr > 1.98 ? '¼' : (1 / rr ** 2).toFixed(2), 700, ry, {role: 'display', size: 30, weight: 700, color: PAL.light, alpha: q4});
  stage.text('중력', 164, ry + 50, {size: 26, weight: 700, color: PAL.grav});
  rect(c, 260, ry + 37, 420 * fg * GAM / GAM * 1, 26, 5, PAL.grav);
  stage.text(rr < 1.02 ? '1' : rr > 1.98 ? '¼' : (1 / rr ** 2).toFixed(2), 700, ry + 50, {role: 'display', size: 30, weight: 700, color: PAL.grav, alpha: q4});
  stage.text('빛 ÷ 중력', 164, ry + 104, {size: 26, weight: 700, color: T.muted});
  stage.text((fl / fg).toFixed(2), 920, ry + 104, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'right'});
  tag(stage, '그대로', 780, ry + 104, {size: 24, color: PAL.good, a: fadeIn(t, at(A.weaken) - 0.1, 0.4)});
  rect(c, 260, ry - 13, 420, 26, 5, null, rgba(PAL.light, 0.4), 1.2); rect(c, 260, ry + 37, 420, 26, 5, null, rgba(PAL.grav, 0.4), 1.2);
  // card: the distance cancels
  const cA = fadeIn(t, at(A.so) - 0.2, 0.4), x2 = fadeIn(t, at(A.notDist) - 0.1, 0.5), cB = fadeIn(t, at(A.brightMass) - 0.25, 0.4);
  withAlpha(c, cA, () => {
    panel(c, T, 140, 1170, 800, 160);
    const f = {role: 'display', size: 34, weight: 700};
    const l1 = ['빛 ∝ 밝기 ÷ ', '거리²'], l2 = ['중력 ∝ 질량 ÷ ', '거리²'];
    for (const [ln, y, col] of [[l1, 1210, PAL.light], [l2, 1258, PAL.grav]]) {
      const w0 = stage.measure(ln[0], f), w1 = stage.measure(ln[1], f), x0 = 330 - (w0 + w1) / 2 + 20;
      stage.text(ln[0], x0, y, {...f, color: col}); stage.text(ln[1], x0 + w0, y, {...f, color: col, alpha: 1 - 0.55 * x2});
      strike(c, x0 + w0, x0 + w0 + w1, y, x2);
    }
    withAlpha(c, cB, () => {
      arrow(c, [580, 1234], [632, 1234], T.ink, 3, {head: 12});
      stage.text('승부는', 780, 1206, {size: 26, weight: 700, color: T.muted, align: 'center'});
      stage.text('밝기 ÷ 질량', 780, 1256, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
    });
  });
}
const LOGY = (L, y0 = 1170, per = 110) => y0 - Math.log10(L) * per;   // limit bars: 1 → y0, 10⁷ → y0 − 770
function limitBars(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), xAx = 250;
  const y = L => LOGY(L);
  // axis
  line(c, [[xAx, y(1) + 4], [xAx, y(1e7) - 10]], rgba(T.muted, 0.8), 2);
  for (const [L, s] of [[1, '1'], [100, '100'], [1e4, '1만'], [1e6, '100만']]) { line(c, [[xAx - 8, y(L)], [xAx, y(L)]], T.muted, 2); stage.text(s, xAx - 16, y(L), {size: 24, weight: 500, color: T.muted, align: 'right'}); line(c, [[xAx, y(L)], [920, y(L)]], rgba(T.border, 0.5), 1); }
  stage.text('밝기 · 태양 = 1 (눈금마다 100배)', 150, 336, {size: 24, weight: 700, color: T.muted});
  const cols = [[1, 400, at(A.perMass) - 0.1, at(A.n33k) - 0.2], [10, 590, at(A.isLimit) - 0.1, at(A.isLimit) + 0.2], [100, 780, at(A.isLimit) + 0.25, at(A.isLimit) + 0.55]];
  const sA = fadeIn(t, at(A.sunIs) - 0.15, 0.4), gA = fadeIn(t, at(A.farBelow) - 0.2, 0.5);
  for (const [M, x, tg, tv] of cols) {
    const q = easeOut((t - tg) / 1.0), L = lEdd(M), top = lerp(y(1), y(L), q), w = 120, dim = M === 1 ? 1 : 1 - 0.6 * sA;
    if (q > 0) withAlpha(c, dim, () => {
      const g = c.createLinearGradient(0, y(1), 0, y(L)); g.addColorStop(0, rgba(PAL.limit, 0.25)); g.addColorStop(1, rgba(PAL.limit, 0.75));
      rect(c, x - w / 2, top, w, y(1) - top, 4, g);
      line(c, [[x - w / 2 - 6, top], [x + w / 2 + 6, top]], PAL.limit, 4);
      stage.text(ko(L), x, top - 30, {role: 'display', size: 34, weight: 700, color: PAL.limit, align: 'center', alpha: fadeIn(t, tv, 0.35)});
    });
    stage.text(`태양 ${M}개`, x, y(1) + 36, {size: 26, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, tg - 0.2, 0.3)});
  }
  stage.text('질량 (태양 질량)', 590, y(1) + 76, {size: 24, weight: 500, color: T.muted, align: 'center'});
  tag(stage, '한계 ∝ 질량', 600, y(3e6) - 70, {size: 26, color: PAL.limit, a: fadeIn(t, at(A.isLimit) + 0.7, 0.4) * (1 - 0.6 * sA)});
  // the Sun: real brightness 1 (the base of its bar) vs its limit 33,000 (the top)
  if (sA > 0) withAlpha(c, sA, () => {
    const sx = 400, sy = y(1) - 16;
    glow(c, sx, sy, 50, '#FFD9A0', 0.6); sphere3(c, sx, sy, 15, '#FFD58A');
    tag(stage, '태양의 실제 밝기 = 1', 478, y(1) - 36, {size: 24, color: PAL.sun, align: 'left'});
  });
  if (gA > 0) withAlpha(c, gA, () => {
    const x = 400, y0 = y(1) - 40, y1 = lerp(y0, y(3.3e4) + 6, easeOut((t - at(A.farBelow) + 0.2) / 0.8));
    arrow(c, [x, y0], [x, y1], '#FFF1D8', 4, {head: 14}); arrow(c, [x, y1], [x, y0], '#FFF1D8', 4, {head: 14});
    tag(stage, '한계의 3만 3천분의 1', 478, (y0 + y(3.3e4)) / 2, {size: 26, color: PAL.sun, align: 'left'});
  });
}

// ------------------------------------------------------------------ stars: log L – log M with the Eddington line
const CH = {x0: 230, x1: 910, y0: 950, y1: 330, mMin: 0.7, mMax: 320, lMin: 0.1, lMax: 3e7};
function chartMap(B) {
  const lx = Math.log10(CH.mMin), hx = Math.log10(CH.mMax), ly = Math.log10(CH.lMin), hy = Math.log10(CH.lMax);
  return {X: M => lerp(B.x0, B.x1, (Math.log10(M) - lx) / (hx - lx)), Y: L => lerp(B.y0, B.y1, (Math.log10(L) - ly) / (hy - ly))};
}
const POP = (() => { const R = rng(31), s = []; for (let i = 0; i < 46; i++) { const lm = Math.log10(0.8) + R() ** 0.9 * (Math.log10(240) - Math.log10(0.8)); s.push({M: 10 ** lm, dl: (R() - 0.5) * 0.3, s: 4 + 4 * R()}); } return s; })();
function lmChart(stage, t, B, o = {}) {
  const c = stage.ctx, T = stage.theme, {X, Y} = chartMap(B), a = o.a ?? 1;
  withAlpha(c, a, () => {
    panel(c, T, B.x0 - 90, B.y1 - 40, B.x1 - B.x0 + 120, B.y0 - B.y1 + 120, 0.75);
    c.save(); c.beginPath(); c.rect(B.x0, B.y1, B.x1 - B.x0, B.y0 - B.y1); c.clip();
    for (const L of [1, 100, 1e4, 1e6]) line(c, [[B.x0, Y(L)], [B.x1, Y(L)]], rgba(T.border, 0.6), 1);
    for (const M of [1, 10, 100]) line(c, [[X(M), B.y0], [X(M), B.y1]], rgba(T.border, 0.6), 1);
    // forbidden zone above the line
    const ed = []; for (let k = 0; k <= 20; k++) { const M = 10 ** lerp(Math.log10(CH.mMin), Math.log10(CH.mMax), k / 20); ed.push([X(M), Y(lEdd(M))]); }
    poly(c, [...ed, [B.x1, B.y1], [B.x0, B.y1]], rgba(PAL.limit, 0.1));
    line(c, ed, PAL.limit, 4);
    // model curve
    const cv = []; for (let k = 0; k <= 60; k++) { const M = 10 ** lerp(Math.log10(0.8), Math.log10(260), k / 60); cv.push([X(M), Y(lumMS(M))]); }
    if (o.curve !== false) line(c, cv.slice(0, Math.max(2, Math.round(61 * (o.curveQ ?? 1)))), rgba('#CFE0FF', 0.75), 3, {dash: [10, 7]});
    c.restore();
    line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
    for (const [L, s] of [[1, '1'], [100, '100'], [1e4, '1만'], [1e6, '100만']]) stage.text(s, B.x0 - 12, Y(L), {size: 24, weight: 500, color: T.muted, align: 'right'});
    for (const M of [1, 10, 100]) stage.text(String(M), X(M), B.y0 + 28, {size: 24, weight: 500, color: T.muted, align: 'center'});
    stage.text('질량 (태양 = 1)', B.x1, B.y0 + 62, {size: 24, weight: 700, color: T.muted, align: 'right'});
    stage.text('밝기 (태양 = 1)', B.x0 - 76, B.y1 - 16, {size: 24, weight: 700, color: T.muted});
    if (o.lineLabel !== false) { const lx = X(3.2), ly = Y(lEdd(3.2)); stage.text('에딩턴 한계', lx, ly - 30, {size: 26, weight: 700, color: PAL.limit, align: 'center'}); }
  });
  return {X, Y};
}
function starsScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), sf = fadeIn(t, ctx.scene.start, 0.25);
  const B = {x0: CH.x0, x1: CH.x1, y0: CH.y0, y1: CH.y1};
  const q0 = at(A.but), q1 = at(A.approach) + 0.3;
  const lgM = lerp(0, Math.log10(200), easeInOut((t - q0) / (q1 - q0))), M = 10 ** lgM, gam = gammaMS(M), L = lumMS(M);
  const {X, Y} = lmChart(stage, t, B, {a: sf, curveQ: clamp((lgM + 0.12) / 2.45)});
  withAlpha(c, sf, () => {
    // population appearing along the model curve as the tracker passes
    for (let i = 0; i < POP.length; i++) { const s = POP[i], q = smooth((lgM - Math.log10(s.M) + 0.1) / 0.15); if (q <= 0) continue; const x = X(s.M), y = Y(lumMS(s.M) * 10 ** s.dl); const col = mix('#FFD9A0', '#BFD6FF', starTemp(s.M)); glow(c, x, y, s.s * 3, col, 0.35 * q); circle(c, x, y, s.s * 0.7, rgba(col, q)); }
    // the tracker: gap to the limit
    const x = X(M), y = Y(L), yl = Y(lEdd(M));
    if (t > q0 - 0.3) {
      const ga = fadeIn(t, q0 - 0.2, 0.3);
      withAlpha(c, ga, () => {
        line(c, [[x, y - 14], [x, yl + 6]], rgba(T.ink, 0.8), 2, {dash: [5, 5]});
        glow(c, x, y, 34, '#FFFFFF', 0.5); ring(c, x, y, 13, '#FFFFFF', 3);
        const lab = `한계까지 ${ko(1 / gam)}배`, ty = (y + yl) / 2;
        tag(stage, gam > 0.5 ? `한계의 ${Math.round(gam * 100)}%` : lab, x + (x > 700 ? -18 : 18), clamp(ty, B.y1 + 30, B.y0 - 30), {size: 26, color: T.ink, align: x > 700 ? 'right' : 'left'});
      });
    }
    tag(stage, '모형 곡선', X(1.6), Y(lumMS(1.6)) + 36, {size: 24, color: '#CFE0FF', a: fadeIn(t, q0, 0.4), align: 'left'});
  });
  // the star itself, growing, and its wind (s12)
  const cx = 360, cy = 1196, R = 24 + 60 * clamp(lgM / Math.log10(200)) ** 1.1, temp = starTemp(M);
  const wq = fadeIn(t, at(A.fierce) - 0.3, 0.6);
  const gb = glowBuf();
  starGlow(gb, t, cx, cy, R, {temp, I: 0.95, halo: 0.6 + 0.8 * clamp(gam), seed: 11});
  if (wq > 0) {
    // strong wind: parcels leaving continuously (shellTrack at Γ = 0.8 cannot lift them — the wind is driven by
    // absorption in spectral lines, not by electron scattering; drawn as a steady outflow, not from the a = g(Γ−1) model)
    const n = 110;
    for (let k = 0; k < n; k++) {
      const ang = rand(k * 2.13) * TAU, life = 1.6, ph = ((t + rand(k * 3.7) * life) % life) / life, r = R * (1.02 + 1.5 * ph ** 1.2);
      gb.splat(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 5 + 4 * ph, [0.6, 0.72, 1.0], 0.75 * wq * (1 - ph) ** 1.3);
    }
  }
  gb.flush(stage, {gain: 1.2, bloom: 0.55, alpha: sf});
  withAlpha(c, sf, () => {
    const rx = 600;
    stage.text('질량', rx, 1050, {size: 24, weight: 500, color: T.muted});
    stage.text(`태양의 ${ko(M)}배`, rx, 1088, {role: 'display', size: 34, weight: 700, color: T.ink});
    stage.text('밝기', rx, 1140, {size: 24, weight: 500, color: T.muted});
    stage.text(`태양의 ${ko(L)}배`, rx, 1178, {role: 'display', size: 34, weight: 700, color: PAL.light});
    stage.text('한계에 대한 비율', rx, 1230, {size: 24, weight: 500, color: T.muted});
    stage.text(gam < 0.01 ? `${(gam * 100).toFixed(3)}%` : `${Math.round(gam * 100)}%`, rx, 1272, {role: 'display', size: 34, weight: 700, color: gam > 0.5 ? PAL.limit : T.ink});
    if (wq > 0) tag(stage, '거센 별바람', cx, 1062, {size: 26, color: PAL.gas, a: wq});
  });
}

// ------------------------------------------------------------------ η Carinae: the light curve, the jump above the line, the Homunculus
function etaScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sw = at('s14') - 0.6, ef = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const aA = fadeOut(t, sw, 0.3), aB = fadeIn(t, sw + 0.3, 0.4) * ef;
  if (aA > 0) withAlpha(c, aA, () => {
    // the stars chart slides down and shrinks; the light curve appears above
    const mv = easeInOut((t - ctx.scene.start) / 0.8);
    const B = {x0: CH.x0, x1: CH.x1, y0: lerp(CH.y0, 1250, mv), y1: lerp(CH.y1, 860, mv)};
    const {X, Y} = lmChart(stage, t, B, {lineLabel: mv < 0.5});
    if (mv > 0.5) stage.text('에딩턴 한계', X(6), Y(lEdd(6)) - 26, {size: 24, weight: 700, color: PAL.limit, align: 'center', alpha: smooth((mv - 0.5) / 0.4)});
    const yr = P.etaYear(t), g = etaGamma(yr), L = g * lEdd(ETA.M), x = X(ETA.M), y = Y(L), over = g > 1, pa = fadeIn(t, ctx.scene.start + 0.4, 0.4);
    withAlpha(c, pa, () => {
      line(c, [[x, Y(lEdd(ETA.M))], [x, y]], rgba(over ? PAL.limit : T.ink, 0.8), 2, {dash: [4, 4]});
      glow(c, x, y, 40 + 30 * smooth(g - 1), over ? '#FFB27A' : '#FFFFFF', 0.6); circle(c, x, y, 9, over ? '#FFD2B0' : '#FFFFFF');
      tag(stage, over ? `용골자리 에타 · 한계의 ${g.toFixed(1)}배` : '용골자리 에타', x - 24, y - 6, {size: 24, color: over ? PAL.limit : T.ink, align: 'right'});
    });
    withAlpha(c, fadeIn(t, ctx.scene.start + 0.75, 0.4), () => lightCurve(stage, t, {x0: 240, x1: 910, y0: 720, y1: 360}, yr, ctx));
  });
  if (aB > 0) withAlpha(c, aB, () => homunculus(stage, t, ctx));
}
function lightCurve(stage, t, B, yr, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r);
  const X = y => lerp(B.x0, B.x1, (y - 1820) / 50), Y = m => lerp(B.y1, B.y0, (m + 2) / 10);   // −2 (top) … 8 (bottom)
  panel(c, T, B.x0 - 90, B.y1 - 42, B.x1 - B.x0 + 120, B.y0 - B.y1 + 108, 0.8);
  rect(c, X(1838), B.y1, X(1858) - X(1838), B.y0 - B.y1, 0, rgba(PAL.limit, 0.1));
  stage.text('대분출 1838~1858', (X(1838) + X(1858)) / 2, B.y0 - 22, {size: 24, weight: 700, color: PAL.limit, align: 'center'});
  for (const m of [0, 4, 8]) { line(c, [[B.x0, Y(m)], [B.x1, Y(m)]], rgba(T.border, 0.6), 1); stage.text(`${m}등급`, B.x0 - 12, Y(m), {size: 24, weight: 500, color: T.muted, align: 'right'}); }
  line(c, [[B.x0, Y(SIRIUS_MAG)], [B.x1, Y(SIRIUS_MAG)]], rgba('#CFE0FF', 0.7), 2, {dash: [8, 6]});
  stage.text('시리우스', B.x1 - 6, Y(SIRIUS_MAG) - 22, {size: 24, weight: 700, color: '#CFE0FF', align: 'right'});
  for (const y of [1820, 1840, 1860]) stage.text(String(y), X(y), B.y0 + 28, {size: 24, weight: 500, color: T.muted, align: 'center'});
  stage.text('밝기 (위가 밝음) · 모식', B.x0 - 76, B.y1 - 18, {size: 24, weight: 700, color: T.muted});
  const pts = []; for (let y = 1820; y <= yr + 1e-6; y += 0.25) pts.push([X(y), Y(etaMag(y))]);
  if (pts.length > 1) line(c, pts, '#FFE2B0', 3.5);
  const cx = X(yr), cy = Y(etaMag(yr)); glow(c, cx, cy, 30, '#FFE2B0', 0.6); circle(c, cx, cy, 6, '#FFFFFF');
  line(c, [[cx, cy + 14], [cx, B.y0]], rgba(T.ink, 0.25), 1.5);
  tag(stage, String(Math.floor(yr)), cx, Math.min(cy + 44, B.y0 - 60), {size: 28, color: T.ink, role: 'display'});
  const pk = fadeIn(t, at(A.second) - 0.2, 0.4) * fadeOut(t, at(A.became) + 0.3, 0.3);
  if (pk > 0) tag(stage, '밤하늘에서 두 번째로 밝음', X(1843) + 26, Y(-0.8) + 4, {size: 24, color: '#FFE2B0', a: pk, align: 'left'});
}
function homunculus(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), yr = P.homYear(t);
  const cx = 540, cy = 760, s = (yr - 1843) / 183, Ls = 365 * s, tilt = -0.6;                     // lobe length ∝ years since 1843 (ballistic)
  const ux = Math.sin(tilt), uy = -Math.cos(tilt), gb = glowBuf();
  const fl = Math.exp(-Math.max(0, t - at(A.then) + 0.1) / 0.6) * smooth((t - at(A.then) + 0.3) / 0.2);   // the 1843 burst
  occlude(c, cx, cy, 14);
  starGlow(gb, t, cx, cy, 14, {temp: 1, I: 1.2 + 1.4 * fl, halo: 3, seed: 13});
  if (Ls > 6) {
    const Aa = 0.5 * Ls, Bb = 0.4 * Ls, rin2 = 0.55 * 0.55;
    for (const sg of [1, -1]) {
      const lx = cx + ux * Aa * sg, ly = cy + uy * Aa * sg, near = sg < 0 ? 1.25 : 0.9;
      gb.each(lx - Ls * 0.55, ly - Ls * 0.55, lx + Ls * 0.55, ly + Ls * 0.55, (x, y, i) => {
        const dx = x - lx, dy = y - ly, u = (dx * ux + dy * uy) / Aa * sg, v = (dx * -uy + dy * ux) / Bb, rho2 = u * u + v * v;
        if (rho2 >= 1) return;
        const pth = (Math.sqrt(1 - rho2) - (rho2 < rin2 ? Math.sqrt(rin2 - rho2) : 0)) / Math.sqrt(1 - rin2);   // thick shell: brighter rim
        const m = 0.5 * tex(u * 60 + sg * 40 + 31, v * 60 - s * 6) + 0.3 * tex(u * 150 + 7, v * 150 + sg * 90) + 0.2 * tex(u * 320 + 3, v * 320);
        const lit = 1.3 - 0.5 * (u + 1) / 2;                                                         // lit by the star from its base
        const k = 0.95 * pth * (0.15 + 2.1 * m * m * m) * lit * near * smooth((1 - rho2) / 0.09);
        gb.R[i] += k * 1.0; gb.G[i] += k * 0.56; gb.B[i] += k * 0.3;
      });
    }
    // thin equatorial skirt
    gb.each(cx - Ls * 0.5, cy - Ls * 0.5, cx + Ls * 0.5, cy + Ls * 0.5, (x, y, i) => {
      const dx = x - cx, dy = y - cy, along = dx * -uy + dy * ux, across = dx * ux + dy * uy, r = Math.abs(along) / (Ls * 0.42);
      if (r > 1) return; const k = 0.22 * Math.exp(-((across / (Ls * 0.025 + 3)) ** 2)) * (1 - r) * (0.4 + tex(along * 0.25 + 50, 9 + s * 3));
      gb.R[i] += k * 0.95; gb.G[i] += k * 0.72; gb.B[i] += k * 0.55;
    });
  }
  gb.flush(stage, {gain: 1.35, bloom: 0.45, cross: 0.04});
  // year counter and labels
  panel(c, T, 380, 1152, 320, 80, 0.85);
  stage.text(yr >= 2025.5 ? '2026 · 지금' : String(Math.floor(yr)), 540, 1192, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center'});
  const mA = fadeIn(t, at(A.ten) - 0.2, 0.4);
  if (mA > 0 && Ls > 40) { const p = [cx + ux * Ls * 0.72 + uy * 20, cy + uy * Ls * 0.72 - ux * 20]; withAlpha(c, mA, () => line(c, [p, [600, 384]], rgba(T.ink, 0.5), 1.5)); tag(stage, '뿜어진 기체 · 태양 질량 10배 넘게', 600, 362, {size: 26, color: PAL.dust, a: mA}); }
  const dA = fadeIn(t, at(A.dumbbell) - 0.2, 0.4);
  if (dA > 0) tag(stage, '아령 모양 · 호문쿨루스 성운', 540, 1282, {size: 26, color: T.ink, a: dA});
  const nA = fadeIn(t, at(A.now) - 0.1, 0.4);
  if (nA > 0) for (const sg of [1, -1]) { const tip = [cx + ux * Ls * 1.03 * sg, cy + uy * Ls * 1.03 * sg], wob = 6 * Math.sin(t * 3); withAlpha(c, nA, () => arrow(c, [tip[0] + ux * sg * wob, tip[1] + uy * sg * wob], [tip[0] + ux * sg * (50 + wob), tip[1] + uy * sg * (50 + wob)], PAL.dust, 5, {head: 16})); }
  tag(stage, '중심의 별', cx + 60, cy + 4, {size: 24, color: T.muted, align: 'left', a: fadeIn(t, at(A.then), 0.4) * fadeOut(t, at(A.ten) - 0.3, 0.3)});
}

// ------------------------------------------------------------------ black hole: infall, glow, push-back, the cap; then growth vs time
const BHC = [540, 720], DISK = {rIn: 46, rOut: 300, cosI: 0.3, rs: 34};
function diskGlow(gb, t, cx, cy, {rIn, rOut, cosI, rs}, lum, {sinI = Math.sqrt(1 - cosI * cosI), roll = 0} = {}) {
  const {R, G, B} = gb, cr = Math.cos(roll), sr = Math.sin(roll);
  gb.each(cx - rOut, cy - rOut * Math.max(cosI, 0.35) - 40, cx + rOut, cy + rOut * Math.max(cosI, 0.35) + 40, (x, y, i) => {
    const dx0 = x - cx, dy0 = y - cy, dx = dx0 * cr + dy0 * sr, dy = -dx0 * sr + dy0 * cr;
    const X = dx, Y = dy / cosI, rho = Math.hypot(X, Y), d2 = dx * dx + dy * dy;
    let e = 0;
    if (rho >= rIn && rho <= rOut && !(d2 < rs * rs && dy < 0)) {
      const q = rIn / rho, prof = q ** 2.1 * (1 - Math.sqrt(q * 0.98)) * 9, ang = Math.atan2(Y, X) - t * 2.4 * q ** 1.5;
      const sp = 0.6 * tex(ang / TAU * 512 + Math.log(rho) * 120, Math.log(rho) * 22) + 0.4 * tex(ang / TAU * 1280 + Math.log(rho) * 300, Math.log(rho) * 50);
      const dop = 1 + 0.6 * (X / rho) * Math.sqrt(q);
      e = 0.85 * lum * prof * (0.4 + 1.2 * sp * sp) * dop * smooth((rOut - rho) / 70);
      const Tq = q ** 0.75;                                            // disk temperature ∝ ρ^(−3/4): orange outside, white-blue inside
      const cr = Tq > 0.55 ? [1, 0.95, 0.92] : Tq > 0.35 ? [1, lerp(0.55, 0.95, (Tq - 0.35) / 0.2), lerp(0.2, 0.92, (Tq - 0.35) / 0.2)] : [1, lerp(0.28, 0.55, Tq / 0.35), lerp(0.06, 0.2, Tq / 0.35)];
      R[i] += e * cr[0]; G[i] += e * cr[1]; B[i] += e * cr[2];
    }
    // photon ring + the far side of the disk bent over the top of the shadow (light bending, schematic)
    const d = Math.sqrt(d2), pr = Math.exp(-(((d - rs * 1.07) / 2.2) ** 2)) * 0.6 * lum + Math.exp(-(((d - rs * 1.3) / (rs * 0.16)) ** 2)) * 0.32 * lum * Math.max(0, -dy / Math.max(d, 1)) ** 0.7;
    if (pr > 0.001) { R[i] += pr; G[i] += pr * 0.82; B[i] += pr * 0.6; }
  });
}
function blackholeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = fadeIn(t, ctx.scene.start, 0.25), sw = at('s16') - 0.7;
  const aA = fadeOut(t, sw, 0.35) * sf, aB = fadeIn(t, sw + 0.25, 0.45);
  if (aA > 0) withAlpha(c, aA, () => bhFeeding(stage, t, ctx, aA));
  if (aB > 0) withAlpha(c, aB, () => bhGrowth(stage, t, ctx));
}
function bhFeeding(stage, t, ctx, alpha) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), S = P.supply(t), md = P.mdot(t), [cx, cy] = BHC;
  const lum = 0.35 + 0.9 * md;
  circle(c, cx, cy, DISK.rs, '#000000');
  const gb = glowBuf(); diskGlow(gb, t, cx, cy, DISK, lum); gb.flush(stage, {gain: 1.5, bloom: 0.4, alpha, cross: 0.02});
  // photons leaving (∝ swallowed rate = brightness)
  withAlpha(c, alpha * fadeIn(t, at(A.glows) - 0.6, 0.6), () => photonStreaks(c, t, cx, cy, 70, Math.round(6 + 26 * md), {reach: 7, a: 0.5, speed: 330, len: 46, col: '#FFF4DC', w: 1.8}));
  // gas parcels in 8 streams: they spiral in; while the light is at its cap, the excess is pushed back out
  const dtS = 0.11, Tin = 2.6, R0 = 560, tTurnF = 0.55, k1 = Math.floor(t / dtS);
  const pos = (k, tau, push) => {
    const phs = (k % 8) / 8 * TAU + 0.35 * rand(k * 0.7);
    let r, ang;
    if (!push || tau < tTurnF * Tin) { r = R0 * Math.max(0, 1 - tau / Tin) ** 0.66; ang = phs + 1.5 * clamp(1 - r / R0) ** 1.5; }
    else { const r1 = R0 * (1 - tTurnF) ** 0.66, b = tau - tTurnF * Tin; r = r1 + 150 * b * b + 30 * b; ang = phs + 1.5 * clamp(1 - r1 / R0) ** 1.5 + 0.25 * clamp(b); }
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.74, r];
  };
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let k = k1 - Math.ceil(3.6 / dtS); k <= k1; k++) {
    const ts = k * dtS, tau = t - ts; if (tau < 0) continue;
    if (rand(k * 5.3) > clamp(P.supply(ts) / 2.8)) continue;                      // how many parcels come ∝ supply
    const tT = ts + tTurnF * Tin, push = rand(k * 9.1 + 0.4) < 1 - P.mdot(tT) / Math.max(1e-6, P.supply(tT));
    if (!push && tau > Tin * 0.97) continue;
    const [x, y, r] = pos(k, tau, push), [x0, y0] = pos(k, Math.max(0, tau - 0.16), push); if (r > 680) continue;
    const pushedNow = push && tau >= tTurnF * Tin, col = pushedNow ? '#FF9E4A' : PAL.gas;
    const a = 0.9 * smooth(tau / 0.3) * (pushedNow ? 1 : smooth((r - 70) / 120));
    c.strokeStyle = rgba(col, 0.55 * a); c.lineWidth = 3.4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x, y); c.stroke();
    circle(c, x, y, 4, rgba(col, a));
  }
  c.restore();
  // labels
  tag(stage, '블랙홀', cx, cy + DISK.rOut * DISK.cosI + 40, {size: 24, color: T.ink, a: fadeIn(t, ctx.scene.start + 0.3, 0.4) * fadeOut(t, at(A.suck) - 0.3, 0.3)});
  tag(stage, '빨려 드는 기체', 230, 470, {size: 24, color: PAL.gas, a: fadeIn(t, at(A.suck) - 0.1, 0.4), align: 'left'});
  tag(stage, '빛에 밀려나는 기체', 850, 1010, {size: 24, color: '#FF9E4A', a: fadeIn(t, at(A.pushBack) - 0.4, 0.4), align: 'right'});
  // meters
  const mA = fadeIn(t, at(A.suck) - 0.3, 0.4);
  withAlpha(c, mA, () => {
    panel(c, T, 140, 1136, 800, 194);
    const x0 = 410, w = 480, sc = w / 3;
    stage.text('들어오는 기체', 164, 1180, {size: 26, weight: 700, color: PAL.gas});
    rect(c, x0, 1166, sc * Math.min(S, 3), 28, 5, rgba(PAL.gas, 0.85));
    stage.text('삼키는 빠르기', 164, 1246, {size: 26, weight: 700, color: T.ink});
    rect(c, x0, 1232, sc * md, 28, 5, md > 0.97 ? PAL.limit : PAL.light);
    const capX = x0 + sc, ca = fadeIn(t, at(A.capW) - 0.6, 0.4) * 0.6 + 0.4;
    line(c, [[capX, 1154], [capX, 1272]], rgba(PAL.limit, ca), 4);
    stage.text('한계', capX, 1300, {size: 24, weight: 700, color: PAL.limit, align: 'center', alpha: ca});
    if (S > 1.15) stage.text('남는 기체는 밀려남', 916, 1300, {size: 24, weight: 700, color: PAL.light, align: 'right', alpha: smooth((S - 1.15) / 0.3)});
  });
}
function bhGrowth(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), tu = P.univ(t);
  const B = {x0: 240, x1: 900, y0: 1110, y1: 380}, X = m => lerp(B.x0, B.x1, m / 800), Y = M => lerp(B.y0, B.y1, (Math.log10(M) - 1) / 9.3);
  panel(c, T, B.x0 - 100, B.y1 - 50, B.x1 - B.x0 + 140, B.y0 - B.y1 + 150, 0.8);
  for (const [M, s] of [[100, '100'], [1e4, '1만'], [1e6, '100만'], [1e8, '1억']]) { line(c, [[B.x0, Y(M)], [B.x1, Y(M)]], rgba(T.border, 0.6), 1); stage.text(s, B.x0 - 12, Y(M), {size: 24, weight: 500, color: T.muted, align: 'right'}); }
  line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
  for (const [m, s] of [[0, '빅뱅'], [200, '2억 년'], [400, '4억 년'], [600, '6억 년']]) stage.text(s, X(m), B.y0 + 28, {size: 24, weight: 500, color: m === 0 ? T.ink : T.muted, align: 'center'});
  stage.text('블랙홀 질량 (태양 = 1)', B.x0 - 86, B.y1 - 24, {size: 24, weight: 700, color: T.muted});
  // time cursor
  const cxu = X(tu); line(c, [[cxu, B.y0], [cxu, B.y1]], rgba(T.ink, 0.25), 2);
  // model growth at the limit
  if (tu > BH.seedT) {
    const pts = []; for (let m = BH.seedT; m <= tu + 1e-6; m += 4) pts.push([X(m), Y(bhGrow(m))]); pts.push([X(tu), Y(bhGrow(tu))]);
    line(c, pts, PAL.light, 4);
    const hx = X(tu), hy = Y(bhGrow(tu)); glow(c, hx, hy, 34, PAL.light, 0.5); circle(c, hx, hy, 9, '#000'); ring(c, hx, hy, 11, PAL.light, 3);
  }
  const sd = fadeIn(t, at(A.bigbang) + 0.3, 0.3);
  if (sd > 0) tag(stage, '씨앗 · 태양의 100배', X(BH.seedT) + 14, Y(100) + 34, {size: 24, color: T.ink, a: sd, align: 'left'});
  // target J0313−1806
  const tg = fadeIn(t, at(A.n16) - 0.15, 0.35), gx = X(BH.J0313.t), gy = Y(BH.J0313.M);
  if (tg > 0) withAlpha(c, tg, () => {
    glow(c, gx, gy, 50, '#FFFFFF', 0.5 + 0.3 * Math.sin(t * 5)); circle(c, gx, gy, 11, '#FFFFFF');
    tag(stage, 'J0313−1806 · 태양의 16억 배', gx - 20, gy - 44, {size: 26, color: T.ink, align: 'right'});
    tag(stage, '빅뱅 뒤 약 6.8억 년', gx - 20, gy - 6, {size: 24, color: T.muted, align: 'right', plate: false});
  });
  const gp = fadeIn(t, at(A.how) - 0.2, 0.5);
  if (gp > 0 && tu >= 679) withAlpha(c, gp, () => {
    const y0 = Y(bhGrow(680)) - 16, y1 = gy + 20;
    line(c, [[gx, y0], [gx, y1]], rgba(PAL.limit, 0.9), 3, {dash: [7, 6]});
    tag(stage, `약 ${Math.round(BH.J0313.M / bhGrow(680) / 10) * 10}배 모자람`, gx - 20, (y0 + y1) / 2, {size: 26, color: PAL.limit, align: 'right'});
  });
  const qm = fadeIn(t, at(A.mystery) - 0.3, 0.4);
  if (qm > 0) stage.text('?', gx + 58, (Y(bhGrow(680)) + gy) / 2 + 4, {role: 'display', size: 96 + 8 * Math.sin(t * 4), weight: 700, color: PAL.limit, align: 'center', alpha: qm});
  tag(stage, '모형: 씨앗 태양 100배 · 한계 속도로 성장', 540, B.y0 + 76, {size: 24, color: T.muted, a: fadeIn(t, at(A.bigbang) + 0.6, 0.4)});
}

// ------------------------------------------------------------------ myth: not a wall — disk geometry
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), gam = P.mythGamma(t);
  // verdict card
  const st = fadeIn(t, at(A.no) - 0.1, 0.5);
  withAlpha(c, sf, () => {
    panel(c, T, 140, 316, 800, 136);
    const w = stage.measure('넘을 수 없는 벽?', {role: 'display', size: 44, weight: 700});
    stage.text('넘을 수 없는 벽?', 540, 360, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center', alpha: 1 - 0.5 * st});
    strike(c, 540 - w / 2, 540 + w / 2, 362, st);
    stage.text('아니다 · 원반이면 넘을 수 있다', 540, 420, {role: 'display', size: 34, weight: 700, color: PAL.good, align: 'center', alpha: st});
  });
  // edge-on disk with funnels
  const cx = 540, cy = 790, rOut = 340, inA = fadeIn(t, at(A.diskIn) - 0.2, 0.5), outA = fadeIn(t, at(A.lightOut) - 0.2, 0.5), wA = fadeIn(t, at(A.over10) - 0.3, 0.5);
  const gb = glowBuf();
  gb.each(cx - rOut, cy - 140, cx + rOut, cy + 140, (x, y, i) => {
    const X = Math.abs(x - cx), Y = y - cy, h = 10 + 0.2 * X, r = Math.max(14, X);
    if (Math.abs(Y) > h * 1.6) return;
    const v = Math.exp(-((Y / h) ** 2) * 1.6), q = 20 / r, e = (0.25 + 1.6 * q) * v * smooth((rOut - X) / 70) * (0.6 + 0.8 * tex(x * 0.25 - t * 30 * Math.sign(x - cx), y * 0.8));
    gb.R[i] += e * 1.0; gb.G[i] += e * lerp(0.55, 0.9, q); gb.B[i] += e * lerp(0.35, 1.0, q);
  });
  gb.splat(cx, cy, 30, [1, 1, 1], 1.6);
  gb.flush(stage, {gain: 1.2, bloom: 0.6, alpha: sf});
  withAlpha(c, sf, () => {
    // funnels (light escapes up and down)
    for (const sg of [-1, 1]) {
      const h = 300, wv = Math.tan(0.36) * h;
      withAlpha(c, outA, () => poly(c, [[cx, cy + sg * 20], [cx - wv, cy + sg * h], [cx + wv, cy + sg * h]], rgba(PAL.light, 0.08), rgba(PAL.light, 0.35), 1.5));
      for (let k = 0; k < 16; k++) {
        const life = 1.0, ph = ((t + rand(k * 3.3 + sg) * life) % life) / life, ang = (rand(k * 7.1 + sg * 2) - 0.5) * 0.62, s = 30 + ph * 300;
        photon(c, cx + Math.sin(ang) * s, cy + sg * Math.cos(ang) * s, Math.sin(ang), sg * Math.cos(ang), outA * Math.sin(Math.PI * ph) * 0.9, {len: 28, amp: 4, w: 2, head: false});
      }
    }
    // inflow along the plane
    for (let k = 0; k < 26; k++) {
      const sg = k % 2 ? 1 : -1, life = 2.4, ph = ((t * 0.8 + rand(k * 2.9) * life) % life) / life, x = cx + sg * (rOut + 60) * (1 - ph) ** 0.8, y = cy + (rand(k * 5.1) - 0.5) * 18 * (1 - ph);
      glow(c, x, y, 12, PAL.gas, 0.5 * inA); circle(c, x, y, 3.2, rgba(PAL.gas, 0.9 * inA * smooth((1 - ph) / 0.15)));
    }
    // winds from the disk surface (the price: gas blown away)
    c.save(); c.lineCap = 'round';
    for (let k = 0; k < 30; k++) {
      const sg = k % 2 ? 1 : -1, sx = k % 4 < 2 ? 1 : -1, life = 1.8, ph = ((t + rand(k * 4.3) * life) % life) / life, r0 = 90 + 170 * rand(k * 6.1);
      const P1 = q => [cx + sx * (r0 + 170 * q), cy + sg * (14 + 0.2 * r0 + 190 * q)], [x, y] = P1(ph), [x0, y0] = P1(Math.max(0, ph - 0.08)), a = wA * Math.sin(Math.PI * ph) ** 0.5;
      c.strokeStyle = rgba('#DCE6EE', 0.5 * a); c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x, y); c.stroke();
      circle(c, x, y, 3.2, rgba('#EEF3F7', 0.9 * a));
    }
    c.restore();
    tag(stage, '기체는 원반으로', cx - rOut + 60, cy + 64, {size: 24, color: PAL.gas, a: inA, align: 'left'});
    tag(stage, '빛은 위아래로', cx + 130, cy - 250, {size: 24, color: PAL.light, a: outA, align: 'left'});
    tag(stage, '바람으로 날아가는 기체', cx + 150, cy + 250, {size: 24, color: '#E0E8EF', a: wA, align: 'left'});
  });
  // log meter (needle past the limit) + the example
  const mA = fadeIn(t, at(A.diskIn) - 0.2, 0.4) * sf;
  withAlpha(c, mA, () => {
    panel(c, T, 140, 1176, 800, 152);
    const x0 = 230, x1 = 870, lx = g => lerp(x0, x1, (Math.log10(g) + 1) / 3);
    line(c, [[x0, 1262], [x1, 1262]], rgba(T.muted, 0.8), 3);
    rect(c, lx(1), 1250, x1 - lx(1), 24, 0, rgba(PAL.limit, 0.15));
    for (const [g, s] of [[0.1, '0.1'], [1, '한계 1'], [10, '10'], [100, '100']]) { line(c, [[lx(g), 1250], [lx(g), 1274]], g === 1 ? PAL.limit : T.muted, g === 1 ? 4 : 2); stage.text(s, lx(g), 1300, {size: 24, weight: 700, color: g === 1 ? PAL.limit : T.muted, align: 'center'}); }
    const nx = lx(gam); glow(c, nx, 1262, 30, gam > 1 ? PAL.limit : PAL.light, 0.5); line(c, [[nx, 1238], [nx, 1286]], gam > 1 ? PAL.limit : PAL.light, 6);
    stage.text('빛이 미는 힘 ÷ 중력 (눈금마다 10배)', 160, 1210, {size: 24, weight: 700, color: T.muted});
    const ex = fadeIn(t, at(A.over10) - 0.1, 0.4);
    stage.text('M82 X-2 · 중성자별 · 10배 넘게', 920, 1210, {size: 24, weight: 700, color: PAL.limit, align: 'right', alpha: ex});
  });
}

// ------------------------------------------------------------------ close: the balance, then past it; the statement
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = fadeIn(t, ctx.scene.start, 0.25), gam = P.closeGamma(t), cx = 540, cy = 800, R = R_REF * 0.85;
  const r3 = P.s3.r(t) * R, shells = r3 > R * 1.004 ? [{r: r3, I: 1.25 * (R / r3) ** 1.6 * smooth((r3 - R) / 12), seed: 3}] : [];
  const wind = gam > 1 && t > P.closeCross + 1.4 ? windParcels(P, t, P.closeCross + 1.4, cx, cy, R, P.wind, 9) : null;
  const gb = glowBuf(); occlude(c, cx, cy, R, sf);
  starGlow(gb, t, cx, cy, R, {temp: 1, I: 0.85 + 0.35 * clamp(gam), halo: 1.4, seed: 2});
  for (const s3 of shells) shellGlow(gb, t, cx, cy, s3.r, s3.I, {seed: s3.seed, w: 0.16});
  if (wind) for (const q of wind) gb.splat(q.x, q.y, q.s, [0.6, 0.72, 1.0], q.I);
  gb.flush(stage, {gain: 1.3, bloom: 0.35, alpha: sf, cross: 0.05});
  withAlpha(c, sf, () => photonStreaks(c, t, cx, cy, R, Math.round(36 + 30 * clamp(gam)), {reach: 3.2, a: 0.36, speed: 380, len: 40}));
  // one parcel on the right: the two arrows (both ∝ 1/r², ratio = Γ); it rides the shell when Γ > 1
  const rp = Math.max(1, P.s3.r(t)), px = cx + R * rp + 30, fl = fLight(gam, rp), fg = fGrav(rp), L0 = 110, pa = fadeIn(t, ctx.scene.start + 0.3, 0.4) * fadeOut(t, at(A.cThis) - 0.4, 0.4);
  if (px < 980) withAlpha(c, sf * pa, () => {
    pairIcon(c, px, cy, 1.0);
    hArrow(c, px + 28, cy - 20, L0 * fl, PAL.light, 6);
    hArrow(c, px - 28, cy + 20, -L0 * fg, PAL.grav, 6);
  });
  const fin = fadeIn(t, at(A.cThis) - 0.1, 0.5);
  gauge(stage, 540, 1196, 110, gam, {a: sf * fadeIn(t, ctx.scene.start + 0.2, 0.4) * fadeOut(t, at(A.cThis) - 0.5, 0.4)});
  // statement, phrase by phrase (the same words as the essence card), then the title as a bookend
  const l1 = fadeIn(t, at(A.cLight) - 0.15, 0.4), l1b = fadeIn(t, at(A.cEqual) - 0.15, 0.4), l2 = fadeIn(t, at(A.cBeyond) - 0.15, 0.4), l2b = fadeIn(t, at(A.cStar) - 0.1, 0.4);
  withAlpha(c, sf, () => {
    stage.text('정리', 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, alpha: l1});
    line(c, [[510, 172], [570, 172]], rgba(T.accent, l1), 3, {cap: 'butt'});
    stage.text('빛이 미는 힘 = 중력', 540, 232, {role: 'display', size: 50, weight: 700, color: T.ink, align: 'center', alpha: l1});
    stage.text('같아지는 밝기', 540, 296, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center', alpha: l1b});
    stage.text('그 너머에서는', 540, 380, {role: 'display', size: 40, weight: 700, color: PAL.light, align: 'center', alpha: l2});
    stage.text('별이 제 빛에 날아간다', 540, 440, {role: 'display', size: 40, weight: 700, color: PAL.light, align: 'center', alpha: l2b});
    stage.text('에딩턴 한계', 540, 1178, {role: 'display', size: 96, weight: 700, color: T.ink, align: 'center', alpha: fin, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16});
    stage.text('빛이 별을 밀어낸다', 540, 1268, {role: 'display', size: 44, weight: 500, color: PAL.light, align: 'center', alpha: fadeIn(t, at(A.cLimit) - 0.1, 0.5), shadow: 'rgba(0,0,0,0.85)', shadowBlur: 12});
  });
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mapping (kept in every scene): the two forces are two low tones. Gravity = a steady 110 Hz tone; light = a tone at
// 110·(1 + 0.08·log2 Γ) Hz (Γ clamped to 1/8 … 4). Below the limit light is lower → they beat; as Γ → 1 the beat slows
// and stops (unison = balance); past the limit light is higher → they beat again. Loudness ∝ √force (balance: both
// fall to ¼ → amplitude ½, the beat rate stays). Shell leaving: low thump + low whoosh at the integrated times.
// Photon hits in the lens: soft 180 Hz ticks at the scheduled hit times. Accretion: low rumble ∝ swallowed rate.
// Everything stays below 700 Hz (user decision 2026-11-03, lowBandOnly).
// =====================================================================================================
const F0 = 110;
export const lightHz = g => F0 * (1 + 0.08 * Math.log2(clamp(g, 1 / 8, 4)));
export function soundEvents(tl) {
  const P = plan(tl), at = ref => tl.at(ref), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3, 0.12], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  /** the two-force pair: gravity tone + light tone for Γ(t); amplitudes ∝ √force (fg, fl relative) */
  const pairTones = (key, t0, t1, G, gain, means, o = {}) => {
    const fg = o.fg || (() => 1), fl = o.fl || (tt => G(tt));
    chirp(`grav_${key}`, t0, t1, () => F0, tt => 0.5 * Math.sqrt(clamp(fg(tt), 0, 2)) * (o.gA ? o.gA(tt) : 1), gain, `${means} — 중력: 110 Hz 고정음 (세기 ∝ √힘)`);
    chirp(`light_${key}`, t0, t1, tt => lightHz(G(tt)), tt => 0.5 * Math.sqrt(clamp(fl(tt), 0, 2)) * (o.lA ? o.lA(tt) : 1), gain, `${means} — 빛: 110·(1+0.08·log₂Γ) Hz → 한계 아래면 낮아 맥놀이, 한계(Γ=1)에서 같은 음(맥놀이 멈춤), 넘으면 높아져 다시 맥놀이`);
  };
  const tick = (id, ref, freq, gain, means, o = {}) => ev.push({id, at: typeof ref === 'number' ? r(ref, 4) : ref, kind: 'tick', params: {freq, decay: o.decay ?? 0.09, gain_db: gain, click: 0, ...(o.repeat ? {repeat: o.repeat, interval: o.interval} : {})}, means});
  const thump = (id, t0, means) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: -27, layers: [{kind: 'tone', offset: 0, params: {freq: 55, dur: 0.7, harmonics: [1, 0.35], attack: 0.006, decay: 0.22, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.35, low: 40, high: 220, release: 0.25, gain_db: -8}}]}, means});
  const whoosh = (id, t0, dur, means, gain = -32) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: 100, f_end: 300, q: 1.6, gain_db: gain}, means});
  const silent = (id, ref, means) => ev.push({id, at: ref, kind: 'silent', means});
  const timeAtR = (track, t0, t1, rr) => { for (let tt = t0; tt < t1; tt += 1 / 120) if (track.r(tt) >= rr) return tt; return t1; };

  // hook: the poster's shell is already flying (Γ = 1.6) → knobs back to the Sun → s02 knobs up past the limit
  const hk = P.hook;
  pairTones('hook', 0.0, at('hook:end') - 0.2, P.hookGamma, -30, '훅의 별: Γ = 빛이 미는 힘 ÷ 중력', {fl: tt => Math.min(2, P.hookGamma(tt)), lA: tt => 0.35 + 0.65 * smooth(Math.log10(Math.max(P.hookGamma(tt), 1e-5)) / 5 + 1)});
  ev[ev.length - 2].model = {sig: modelSignature(tl)};
  whoosh('shell1_out', Math.max(0.2, timeAtR(P.s1, 0, 8, 3.0) - 0.6), 1.6, '포스터의 바깥층이 모형 가속(a = g(Γ−1))으로 화면 밖으로 나감 (r = 3R 통과 시각 중심)');
  thump('limit_cross_hook', P.cross, '훅: Γ가 1을 넘는 순간 (계산된 교차 시각) — 바깥층이 떠오르기 시작');
  whoosh('shell2_out', timeAtR(P.s2, P.cross, 18, 2.0) - 0.6, 1.8, '훅: 바깥층이 우주로 날아감 (r = 2R 통과 시각 중심)', -31);
  silent('hook_reset', r(hk.rs0, 4), '손잡이를 태양으로 되돌림 (소리 없음)');
  // origin: name card, radiation pressure, eclipse, confirmation
  tick('name_card', A.arthur, 220, -32, '이름 카드 "아서 에딩턴"', {decay: 0.12});
  chirp('radiation_push', at(A.lightP) - 0.15, at('s03:end') - 0.2, () => lightHz(1), () => 0.32, -32, '별 속에서 밖으로 미는 빛의 화살표 (빛의 음 하나)', {fi: 0.4, fo: 0.6});
  ev.push({id: 'totality', at: {...A.eclipse, offset: 0.3}, kind: 'swell', params: {freqs: [98, 147], dur: 2.0, attack: 0.5, gain_db: -30}, means: '달이 태양을 가리고 하늘이 어두워짐 (개기일식)'});
  chirp('bend', at(A.bend) - 0.1, at(A.bend) + 1.2, tt => lerp(262, 233, easeInOut((tt - at(A.bend) + 0.1) / 1.2)), () => 0.42, -32, '별빛이 휘며 보이는 위치가 바깥으로 밀림 (음이 반음 정도 내려감)', {h: [1, 0.2], fi: 0.15, fo: 0.3});
  tick('measure', A.measure, 196, -30, '"재어" — 어긋난 거리를 잼', {repeat: 2, interval: 0.16});
  ev.push({id: 'confirmed', at: {...A.relativity, offset: -0.05}, kind: 'swell', params: {freqs: [131, 196, 262], dur: 1.6, attack: 0.4, gain_db: -30}, means: '"상대성 이론 확인" 도장'});
  // essence: the two forces approach unison as the knob brings Γ to 1
  pairTones('essence', at(A.eLight) - 0.1, tl.scene('essence').end - 0.3, P.essGamma, -28, '본질: 기체 한 덩이의 두 힘', {lA: tt => smooth((tt - at(A.eLight) + 0.1) / 0.4), gA: tt => smooth((tt - at(A.eGrav) + 0.1) / 0.4)});
  tick('equal', P.essEqual - 0.05, 147, -30, '"같아지는 밝기" — 두 화살표가 같아짐 (Γ = 1)', {decay: 0.2});
  // pair: photon hits (ticks at the scheduled times), then the two forces as tones
  ev.push({id: 'photon_hits', at: r(P.hits[0], 4), kind: 'custom', params: {gain_db: -27, layers: P.hits.map(h => ({kind: 'tick', offset: r(h - P.hits[0], 4), params: {freq: 180, decay: 0.07, click: 0, gain_db: 0}}))}, means: `렌즈 속 광자가 기체 알갱이·전자에 부딪힌 시각 ${P.hits.length}번 (화면의 충돌과 같은 시각표)`});
  tick('split', A.split, 165, -30, '"갈라져" — 원자가 전자와 양성자로 나뉨', {repeat: 2, interval: 0.11});
  pairTones('pair', at(A.pushE) - 0.2, tl.scene('pair').end - 0.3, () => 0.6, -29, '렌즈: 전자를 미는 빛(0.6)과 양성자를 당기는 중력(1)', {lA: tt => smooth((tt - at(A.pushE) + 0.2) / 0.5), gA: tt => smooth((tt - at(A.grav8) + 0.1) / 0.5)});
  ev.push({id: 'rope', at: {...A.elec, offset: -0.05}, kind: 'swell', params: {freqs: [147, 220], dur: 1.2, attack: 0.35, gain_db: -32}, means: '전기력의 끈이 나타남 (둘이 묶임)'});
  // balance: r → 2r: both weaker (amplitude ½), the beat unchanged
  pairTones('balance', at(A.both9) - 0.2, at('s09:end') + 0.6, () => 0.6, -28, '거리 r → 2r: 두 힘 모두 ¼ (소리 크기 ½), 비율(맥놀이 빠르기)은 그대로', {fl: tt => fLight(0.6, P.dist(tt)) / 0.6 * 0.6, fg: tt => fGrav(P.dist(tt))});
  tick('strike_dist', A.notDist, 147, -31, '"거리가 아니라" — 거리²에 줄', {decay: 0.1});
  for (const [k, ref, f] of [[1, {...A.n33k, offset: -0.2}, 131], [10, {...A.isLimit, offset: 0.2}, 165], [100, {...A.isLimit, offset: 0.55}, 196]]) tick(`bar_${k}`, ref, f, -30, `태양 질량 ${k}의 한계 막대 (${ko(lEdd(k))}배)`, {decay: 0.18});
  tick('sun_far', {...A.farBelow, offset: -0.1}, 98, -30, '태양의 실제 밝기: 한계의 3만 3천분의 1', {decay: 0.25});
  // stars: tracker star climbs toward the line — beats slow as Γ → 0.8; then the wind
  const q0 = at(A.but), q1 = at(A.approach) + 0.3, Gs = tt => gammaMS(10 ** lerp(0, Math.log10(200), easeInOut((tt - q0) / (q1 - q0))));
  pairTones('stars', q0 - 0.1, at('s12:end') + 0.5, Gs, -29, '별의 질량이 커지며 Γ가 0.8까지 오름 → 맥놀이가 느려짐');
  ev.push({id: 'wind_200', at: {...A.fierce, offset: -0.3}, kind: 'env_noise', params: {low: 70, high: 300, gain_db: -27, fade: 0.05, points: [[0, 0], [0.7, 0.8], [r(tl.scene('stars').end - at(A.fierce) - 0.3), 0.8], [r(tl.scene('stars').end - at(A.fierce) + 0.05), 0]]}, means: '태양 200배 별의 거센 별바람 (화면의 흘러나가는 기체)'});
  // η Car: Γ(year) above 1 during the eruption; brightness swell at the peak
  pairTones('eta', tl.scene('eta').start + 0.3, at('s13:end') + 0.6, tt => etaGamma(P.etaYear(tt)), -30, '용골자리 에타: 연도 커서의 Γ (대분출 동안 한계 위 → 맥놀이)');
  ev.push({id: 'eta_peak', at: {...A.brightened, offset: 0.1}, kind: 'swell', params: {freqs: [110, 165, 220], dur: 2.4, attack: 0.35, gain_db: -29}, means: '1843년 최대 밝기 (시리우스 다음)'});
  ev.push({id: 'eruption', at: {...A.then, offset: -0.1}, kind: 'custom', params: {gain_db: -25, layers: [{kind: 'tone', offset: 0, params: {freq: 49, dur: 0.9, harmonics: [1, 0.4], attack: 0.01, decay: 0.3, release: 0.3, gain_db: 0}}, {kind: 'whoosh', offset: 0.05, params: {dur: 1.6, f_start: 80, f_end: 260, q: 1.4, gain_db: -4}}]}, means: '대분출: 기체가 뿜어져 나옴 (호문쿨루스 시작)'});
  ev.push({id: 'lobes', at: {...A.gasOut, offset: 0.2}, kind: 'env_noise', params: {low: 60, high: 300, gain_db: -28, fade: 0.05, points: [[0, 0], [0.8, 0.6], [r(tl.scene('eta').end - at(A.gasOut) - 0.8), 0.45], [r(tl.scene('eta').end - at(A.gasOut) - 0.25), 0]]}, means: '아령 모양 구름이 퍼지는 동안'});
  // black hole: rumble ∝ swallowed rate (capped); growth curve pitch ∝ log mass, the target higher
  const b0 = tl.scene('blackhole').start + 0.2, b1 = at('s16') - 0.6;
  ev.push({id: 'accretion', at: r(b0, 4), kind: 'env_noise', params: {low: 40, high: 240, gain_db: -26, fade: 0.05, points: (() => { const Q = []; for (let tt = b0; tt <= b1 + 1e-6; tt += 0.1) Q.push([r(tt - b0), r(clamp(0.3 + 0.7 * P.mdot(tt)) * env(tt, b0, b1, 0.4, 0.5), 4)]); Q[Q.length - 1][1] = 0; return squeeze(Q); })()}, means: '삼키는 빠르기 → 낮은 우르릉의 크기 (한계에서 더 커지지 않음)'});
  ev.push({id: 'pushback', at: {...A.pushBack, offset: -0.3}, kind: 'whoosh', params: {dur: 1.4, f_start: 260, f_end: 110, q: 1.5, gain_db: -32}, means: '빛에 밀려 되돌아가는 기체'});
  tick('cap', {...A.capW, offset: -0.05}, 110, -29, '"한계가 생깁니다" — 막대가 한계선에 닿음', {decay: 0.25});
  const mHz = M => 55 * 2 ** ((Math.log10(M) - 2) / 2);                // 100 M☉ → 55 Hz, 10⁷ → 311 Hz, 1.6×10⁹ → 667 Hz
  const u1 = at(A.bigbang) + 0.45, u2 = at(A.n16) - 0.15;
  chirp('growth', u1, u2 + 0.5, tt => mHz(bhGrow(P.univ(tt))), () => 0.55, -29, '블랙홀 질량(로그) → 음높이: 한계 속도로 자라는 모형 곡선', {h: [1], dt: 0.02, fi: 0.05, fo: 0.3});
  ev.push({id: 'target', at: {...A.n16, offset: -0.1}, kind: 'tone', params: {freq: r(mHz(BH.J0313.M), 1), dur: 1.4, harmonics: [1], attack: 0.05, decay: 0.6, sustain: 0.3, release: 0.4, gain_db: -31}, means: 'J0313−1806 (16억 배) → 같은 대응의 더 높은 음: 모형 곡선의 끝 음과 벌어진 간격'});
  tick('mystery', {...A.mystery, offset: -0.2}, 98, -31, '"?" — 아직 수수께끼', {decay: 0.3});
  // myth
  tick('myth_no', A.no, 165, -28, '오해에 줄을 그음 → "아니다"', {repeat: 2, interval: 0.13});
  ev.push({id: 'disk_in', at: {...A.diskIn, offset: -0.2}, kind: 'env_noise', params: {low: 50, high: 260, gain_db: -32, fade: 0.05, points: [[0, 0], [0.6, 0.6], [r(tl.scene('myth').end - at(A.diskIn) - 0.3), 0.6], [r(tl.scene('myth').end - at(A.diskIn)), 0]]}, means: '원반 평면으로 들어오는 기체'});
  pairTones('myth', at(A.lightOut) - 0.2, tl.scene('myth').end - 0.3, P.mythGamma, -29, '원반: Γ가 한계를 넘어 10배 넘게 (맥놀이 빨라짐)');
  ev.push({id: 'over10', at: {...A.ten10, offset: 0}, kind: 'swell', params: {freqs: [131, 196, 262], dur: 1.8, attack: 0.4, gain_db: -30}, means: '"열 배 넘게" — 바늘이 10을 넘음'});
  // close: unison at the limit, then past it: thump + whoosh as the shell flies
  pairTones('close', tl.scene('close').start + 0.15, tl.duration - 0.1, P.closeGamma, -30, '정리: 한계에서 같은 음(균형), 넘으면 맥놀이', {fo: 0.8});
  thump('limit_cross_close', P.closeCross, '정리: Γ가 1을 넘는 순간 — 바깥층이 떠오름');
  whoosh('shell3_out', timeAtR(P.s3, P.closeCross, tl.duration, 2.0) - 0.6, 1.8, '정리: 바깥층이 날아감', -31);
  ev.push({id: 'close_swell', at: {...A.cLimit, offset: -0.1}, kind: 'swell', params: {freqs: [110, 165, 220], dur: 1.6, attack: 0.4, gain_db: -30}, means: '"에딩턴 한계입니다"'});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz, because the band-pass skirts fall only 12 dB/octave); swell overtones (2f)
 * are kept below it by construction (frequencies < HIGH_CUT/2). Events that would break this
 * throw, so a later edit cannot silently bring the high band back. The stale-table signature sits on the first tone.
 */
const HIGH_CUT = 700, NOISE_TOP = 360;                                // sfx.py band-passes are 2nd order (12 dB/oct): keep noise tops ≈ 1 octave under 700 Hz
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
  for (const e of ev) { if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/eddington-limit/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형(Γ = L/L_Edd, 껍질의 가속 a = g(Γ−1) 적분, 광자 충돌 시각표, 삼키는 빠르기의 상한, 한계 속도 성장)에서 써 넣습니다. 대응: 두 힘 = 두 낮은 음(중력 110 Hz 고정, 빛 110·(1+0.08·log₂Γ) Hz) → 한계에서 같은 음, 벗어나면 맥놀이. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; hook crossing ${P.cross.toFixed(2)} s, close crossing ${P.closeCross.toFixed(2)} s, photon hits ${P.hits.length}`);
  console.log(`Γ_MS: 1 → ${gammaMS(1).toExponential(2)}, 10 → ${gammaMS(10).toFixed(3)}, 60 → ${gammaMS(60).toFixed(2)}, 100 → ${gammaMS(100).toFixed(2)}, 200 → ${gammaMS(200).toFixed(2)}; L(200) = ${lumMS(200).toExponential(2)}`);
  console.log(`BH: seed 100 M☉ @100 Myr → ${bhGrow(680).toExponential(2)} M☉ @680 Myr (J0313 ${BH.J0313.M.toExponential(1)}, ×${(BH.J0313.M / bhGrow(680)).toFixed(0)} short)`);
}
