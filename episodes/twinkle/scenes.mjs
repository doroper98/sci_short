// Episode scenes — "별은 왜 반짝일까 — 반짝임은 공기가 만든다"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - ONE frozen turbulence field drives picture, graphs and sound. A seeded complex white noise W(k) on a periodic
//    1024 × 1024 grid (256 cm × 256 cm, 0.25 cm cells) is shaped once by FFT into
//      φ  phase screen at H = 5 km: von Kármán spectrum |φ̂| ∝ (k² + k_out²)^(−11/12), outer scale 1 m, inner 0.6 cm;
//      χ  log-amplitude on the ground (thin-screen Rytov filter): χ̂ = sin(k² r_F²/2)·φ̂, r_F = √(λH/2π) ≈ 2.1 cm
//         (λ = 550 nm) → bright/dark pattern of a few cm. Unit variance.
//      POCK the same φ, high-passed (≈ 10–40 cm cells) → the warm (amber) / cold (blue) air pockets drawn in sections.
//    Ground intensity I = exp(s·χ − s²/2) (log-normal, mean 1). s grows with air mass X (Kasten–Young):
//    s = 1.15·tanh(0.30·X^1.5 / 1.15) → σ_I ≈ 0.33 at the zenith, ≈ 1.6 near the horizon.
//  - Frozen flow: the whole field moves with the wind, 2 m/s toward azimuth 4° (slightly off-axis so a fixed pupil
//    never retraces the periodic grid within the film). Everything on screen runs at SLOW = 1/10 of real time
//    (pattern drift 20 cm per film second); the s08 strip "1초" is the same signal at real speed.
//  - Eye pupil 7 mm: the star's brightness is the pattern averaged over the pupil (χ convolved with the 7 mm disc).
//  - Source size: each point of a disc source makes the same pattern shifted by H·θ, so a disc of angular diameter θ
//    sees I convolved with a disc of diameter H·θ (plus the pupil) — computed by FFT (Airy filter 2J1(kR)/(kR)):
//    star 0.005″ → 0.012 cm (nothing), Jupiter 40″ → 97 cm, Moon/Sun 1,900″ → 46 m (only the mean survives).
//  - Colour twinkle: atmospheric dispersion separates the red/green/blue paths at the layer by
//    1.2 cm·tan z / cos z (≤ 60 cm): high stars flicker white, low stars (Sirius at 9°) flicker in colour.
//  - Shadow bands: the thin eclipse crescent averages I along its length (600 cm footprint, 3 cm wide) → bands.
//  - Adaptive optics: PSF = |FFT(pupil · e^{iφ})|² of the same POCK screen; the mirror subtracts an 8×8-actuator fit.
//  - Sound: node episodes/twinkle/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same functions.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, TAU, rand, loadTimeline,
} from '../../pipeline/render/index.mjs';
import {D2R, unit, add, mul, sub, dot, cross, loadLand, lookCam, earthTextures, drawEarthLit} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, graphs and sound.json via --emit-sound)
// =====================================================================================================
export const N = 1024, DOM = 256, DXC = DOM / N;                     // grid cells, domain (cm), cell (cm)
export const H_T = 5e5, LAM = 5.5e-5, RF = Math.sqrt(LAM * H_T / TAU); // layer height 5 km, 550 nm, Fresnel radius (cm)
export const L_OUT = 100, L_IN = 1.0;                                  // outer / inner scale of the phase screen (cm)
export const V_WIND = 300, WIND_AZ = 4 * D2R, WX = Math.cos(WIND_AZ), WY = Math.sin(WIND_AZ);
export const SLOW = 0.05, SKY_RATE = 0.15, EYE_T = 0.03;               // instrument views 1/20 of real speed; sky views 0.15 + eye integration
export const PUPIL = 0.7;                                              // eye pupil diameter at night (cm)
export const S0 = 0.30, S_MAX = 1.15;
const ARCSEC = Math.PI / 648000;
export const SIZE = {star: 0.005, jupiter: 40, moon: 1900};            // apparent diameters (″)
export const footR = as => H_T * as * ARCSEC / 2;                      // footprint radius at the layer (cm)
export const airmass = alt => { const a = Math.max(0.5, alt); return 1 / (Math.sin(a * D2R) + 0.50572 * (a + 6.07995) ** -1.6364); };
export const sOf = alt => S_MAX * Math.tanh(S0 * airmass(alt) ** 1.5 / S_MAX);
export const sigmaI = s => Math.sqrt(Math.exp(s * s) - 1);
export const dispCm = alt => { const z = (90 - Math.max(1, alt)) * D2R; return Math.min(40, 0.6 * Math.tan(z) / Math.cos(z)); };
export const tauOf = t => SLOW * t;                                    // model (real) seconds shown at film time t

// ---- seeded noise, FFT, Bessel ----
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rnd) { let u = 0; while (u < 1e-12) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); }
const TW = new Map();
function twiddles(n) { let T = TW.get(n); if (!T) { T = {c: new Float64Array(n / 2), s: new Float64Array(n / 2)}; for (let k = 0; k < n / 2; k++) { T.c[k] = Math.cos(TAU * k / n); T.s[k] = Math.sin(TAU * k / n); } TW.set(n, T); } return T; }
/** in-place radix-2 FFT of (re, im) views of length n; inv → e^{+i…} (no 1/n) */
function fft1(re, im, inv) {
  const n = re.length, T = twiddles(n), sg = inv ? 1 : -1;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
  for (let len = 2; len <= n; len <<= 1) {
    const h = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) {
      const wr = T.c[k * step], wi = sg * T.s[k * step], a = i + k, b = a + h;
      const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
}
function fft2(re, im, n, inv) {
  for (let r = 0; r < n; r++) fft1(re.subarray(r * n, r * n + n), im.subarray(r * n, r * n + n), inv);
  const cr = new Float64Array(n), ci = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) { cr[r] = re[r * n + c]; ci[r] = im[r * n + c]; }
    fft1(cr, ci, inv);
    for (let r = 0; r < n; r++) { re[r * n + c] = cr[r]; im[r * n + c] = ci[r]; }
  }
  if (inv) { const k = 1 / (n * n); for (let i = 0; i < n * n; i++) { re[i] *= k; im[i] *= k; } }
}
function bessJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    return x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606)))))) /
      (144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y)))));
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
  return x < 0 ? -ans : ans;
}
const airy = x => (Math.abs(x) < 1e-6 ? 1 : 2 * bessJ1(x) / x);       // mean over a disc of radius R: 2J1(kR)/(kR)
const kOf = i => TAU * (i < N / 2 ? i : i - N) / DOM;

// ---- the field (built once, ~1 s) ----
const F = (() => {
  const rnd = mulberry(20261103), n2 = N * N;
  const wr = new Float64Array(n2), wi = new Float64Array(n2);
  for (let i = 0; i < n2; i++) { wr[i] = gauss(rnd); wi[i] = gauss(rnd); }
  const kO = TAU / L_OUT, kH = TAU / 45;
  const make = filt => {
    const re = new Float64Array(n2), im = new Float64Array(n2);
    for (let j = 0; j < N; j++) { const ky = kOf(j); for (let i = 0; i < N; i++) { const kx = kOf(i), k2 = kx * kx + ky * ky, idx = j * N + i, g = filt(k2, kx, ky); re[idx] = wr[idx] * g; im[idx] = wi[idx] * g; } }
    fft2(re, im, N, true);
    return re;
  };
  const amp = k2 => (k2 + kO * kO) ** (-11 / 12) * Math.exp(-k2 * L_IN * L_IN / 2);
  const stats = a => { let m = 0; for (let i = 0; i < a.length; i++) m += a[i]; m /= a.length; let v = 0; for (let i = 0; i < a.length; i++) v += (a[i] - m) ** 2; return [m, Math.sqrt(v / a.length)]; };
  const norm = (a, m, sd) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = (a[i] - m) / sd; return o; };
  const chiR = make(k2 => amp(k2) * Math.sin(k2 * RF * RF / 2));
  const [cm, csd] = stats(chiR), CHI = norm(chiR, cm, csd);
  const chiP = make(k2 => amp(k2) * Math.sin(k2 * RF * RF / 2) * airy(Math.sqrt(k2) * PUPIL / 2));
  const CHI_P = norm(chiP, cm, csd), VARP = stats(CHI_P)[1] ** 2;
  const pk = make(k2 => amp(k2) * (1 - Math.exp(-k2 / (kH * kH))) * Math.exp(-k2 * 1.2 * 1.2 / 2));
  const [pm, psd] = stats(pk), POCK = norm(pk, pm, psd);
  return {CHI, CHI_P, VARP, POCK};
})();
export const {CHI, CHI_P, VARP, POCK} = F;

/** bilinear sample of a periodic grid at (x, y) cm */
export function samp(G, x, y) {
  let u = x / DXC, v = y / DXC; u -= Math.floor(u / N) * N; v -= Math.floor(v / N) * N;
  const i0 = (u | 0) & (N - 1), j0 = (v | 0) & (N - 1), fu = u - Math.floor(u), fv = v - Math.floor(v), i1 = (i0 + 1) & (N - 1), j1 = (j0 + 1) & (N - 1), r0 = j0 * N, r1 = j1 * N;
  return (G[r0 + i0] * (1 - fu) + G[r0 + i1] * fu) * (1 - fv) + (G[r1 + i0] * (1 - fu) + G[r1 + i1] * fu) * fv;
}
/** filtered intensity grids: I_s = exp(sχ − s²/2) averaged over pupil ⊗ footprint (disc radius R or a line) — cached */
const FWD = new Map(), GRIDS = new Map();
function fwdI(s) {
  const key = s.toFixed(4); let f = FWD.get(key); if (f) return f;
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) re[i] = Math.exp(s * CHI[i] - s * s / 2);
  fft2(re, im, N, false);
  f = {re, im, mean: re[0] / (N * N)}; FWD.set(key, f); return f;
}
function filtered(s, key, filt) {
  const gk = s.toFixed(4) + key; let G = GRIDS.get(gk); if (G) return G;
  const f = fwdI(s), re = new Float64Array(N * N), im = new Float64Array(N * N);
  for (let j = 0; j < N; j++) { const ky = kOf(j); for (let i = 0; i < N; i++) { const kx = kOf(i), idx = j * N + i, g = filt(kx, ky) * airy(Math.hypot(kx, ky) * PUPIL / 2); re[idx] = f.re[idx] * g; im[idx] = f.im[idx] * g; } }
  fft2(re, im, N, true);
  G = new Float32Array(N * N); for (let i = 0; i < N * N; i++) G[i] = re[i] / f.mean;
  GRIDS.set(gk, G); return G;
}
export const discGrid = (s, R) => filtered(s, `d${R.toFixed(3)}`, (kx, ky) => airy(Math.hypot(kx, ky) * R));
/** thin crescent seen as a line footprint of length L (along azimuth a) and Gaussian width w */
export const lineGrid = (s, L, w, a) => filtered(s, `l${L}_${w}_${a}`, (kx, ky) => {
  const kp = kx * Math.cos(a) + ky * Math.sin(a), kq = -kx * Math.sin(a) + ky * Math.cos(a), x = kp * L / 2;
  return (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x) * Math.exp(-kq * kq * w * w / 2);
});

// ---- brightness functions (film time t at display rate `rate`; `real` = model seconds instead) ----
// Frozen flow: the pattern at model time τ is I₀(x − W·τ); a pupil fixed at (x0, y0) sees I₀(x0 − W·τ).
export const flow = tau => [V_WIND * WX * tau, V_WIND * WY * tau];
/** star (point source) seen through a 7 mm pupil; chan −1/0/+1 = red/green/blue path (dispersion) */
export function starB(t, {alt = 45, s = sOf(alt), x0 = 0, y0 = 0, chan = 0, rate = SLOW, real = null} = {}) {
  const tau = real ?? rate * t, fx = V_WIND * WX * tau, fy = V_WIND * WY * tau;
  return Math.exp(s * samp(CHI_P, x0 - fx, y0 + chan * dispCm(alt) - fy) - s * s * VARP / 2);
}
/** what the eye perceives in the sky views: SKY_RATE and a mean over the eye's integration time EYE_T (real s) */
export function starSeen(t, alt, s, x0, y0, chan = 0) {
  const tau = SKY_RATE * t, d = chan * dispCm(alt); let a = 0;
  for (let k = 0; k < 4; k++) { const tt = tau - EYE_T * k / 3; a += Math.exp(s * samp(CHI_P, x0 - V_WIND * WX * tt, y0 + d - V_WIND * WY * tt) - s * s * VARP / 2); }
  return a / 4;
}
/** disc source (planet, Moon, Sun) of apparent diameter `as` arcsec */
export function discB(t, {alt = 45, s = sOf(alt), as = SIZE.jupiter, x0 = 0, y0 = 0, rate = SLOW, real = null} = {}) {
  const [fx, fy] = flow(real ?? rate * t); return samp(discGrid(s, footR(as)), x0 - fx, y0 - fy);
}
/** ground pattern (no pupil) at ground point (x, y) cm */
export function groundI(t, x, y, s, rate = SLOW) { const [fx, fy] = flow(rate * t); return Math.exp(s * samp(CHI, x - fx, y - fy) - s * s / 2); }
export function pockAt(t, x, y, rate = SLOW) { const [fx, fy] = flow(rate * t); return samp(POCK, x - fx, y - fy); }

// ---- fixed places and strengths used across scenes (one list, shared with --emit-sound) ----
export const ALT = {cells: 45, hookStar: 30.5, jupiter: 27, moon: 35.5, high: 62, low: 9, sirius: 9, sun: 40};
export const PUP = {x: 37.0, y: 112.5};                                // where the drawn pupil stands on the field (cm)
export const S_REF = sOf(ALT.cells);                                   // the comparison star / planet / Moon (same air)
export const S_SUMMIT = 0.5;                                           // fraction of s left above a high summit (model value)

// ---- adaptive optics: PSF of an aperture looking through the same POCK screen (64² FFT per call) ----
const AO = {n: 64, P: 28, span: 50, k: 4, act: 10};                   // grid, pupil samples, cm of screen across the pupil, rad per POCK σ, actuators
function aoPhase(t, i, j, rate) { const c = (AO.P - 1) / 2, cm = AO.span / AO.P, [fx, fy] = flow(rate * t); return AO.k * samp(POCK, 300 + (i - c) * cm - fx, 40 + (j - c) * cm - fy); }
/** {img: Float32Array n², peak (Strehl-like, perfect = 1), row: phase along the middle row, fitRow} */
export function aoPSF(t, corr = 0, rate = SLOW) {
  const n = AO.n, P = AO.P, c = (P - 1) / 2, re = new Float64Array(n * n), im = new Float64Array(n * n), ph = new Float64Array(P * P), inP = new Uint8Array(P * P);
  for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) { const q = j * P + i; inP[q] = Math.hypot(i - c, j - c) <= P / 2 ? 1 : 0; ph[q] = aoPhase(t, i, j, rate); }
  // deformable mirror: one piston per actuator cell (mean phase in the cell), bilinear between actuator centres
  const A = AO.act, cs = P / A, av = new Float64Array(A * A), cnt = new Float64Array(A * A);
  for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) { const a = Math.min(A - 1, Math.floor(i / cs)) + A * Math.min(A - 1, Math.floor(j / cs)); av[a] += ph[j * P + i]; cnt[a]++; }
  for (let a = 0; a < A * A; a++) av[a] /= Math.max(1, cnt[a]);
  const fit = (i, j) => { const u = clamp((i + 0.5) / cs - 0.5, 0, A - 1), v = clamp((j + 0.5) / cs - 0.5, 0, A - 1), i0 = Math.min(A - 2, Math.floor(u)), j0 = Math.min(A - 2, Math.floor(v)), fu = u - i0, fv = v - j0;
    return (av[j0 * A + i0] * (1 - fu) + av[j0 * A + i0 + 1] * fu) * (1 - fv) + (av[(j0 + 1) * A + i0] * (1 - fu) + av[(j0 + 1) * A + i0 + 1] * fu) * fv; };
  let tot = 0;
  for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) { const q = j * P + i; if (!inP[q]) continue; const p = ph[q] - corr * fit(i, j); re[j * n + i] = Math.cos(p); im[j * n + i] = Math.sin(p); tot++; }
  fft2(re, im, n, false);
  const img = new Float32Array(n * n); let peak = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = (re[j * n + i] ** 2 + im[j * n + i] ** 2) / (tot * tot); img[((j + n / 2) % n) * n + ((i + n / 2) % n)] = v; if (v > peak) peak = v; }
  const jm = Math.round(c), row = [], fitRow = [];
  for (let i = 0; i < P; i++) { row.push(ph[jm * P + i]); fitRow.push(fit(i, jm)); }
  return {img, peak, row, fitRow};
}

// =====================================================================================================
// Night sky. Stars are directions (azimuth, altitude) on a patch of the celestial sphere; a pinhole camera
// {El, F, az0} projects them. Each star stores its air mass → extinction, reddening, twinkle strength s(alt).
// =====================================================================================================
export const HOOK_CAM = {El: 16, F: 1371, az0: 0, cx: 540, cy: 960};
export const HOR_CAM = {El: 27, F: 930, az0: -4, cx: 540, cy: 960};
export function skyProj(cam, az, alt) {
  const e = cam.El * D2R, a = (az - cam.az0) * D2R, al = alt * D2R, d0 = Math.cos(al) * Math.sin(a), d1 = Math.sin(al), d2 = Math.cos(al) * Math.cos(a);
  const z = d1 * Math.sin(e) + d2 * Math.cos(e); if (z <= 0.05) return null;
  return [cam.cx + cam.F * d0 / z, cam.cy - cam.F * (d1 * Math.cos(e) - d2 * Math.sin(e)) / z];
}
export function skyInv(cam, x, y) {
  const e = cam.El * D2R, a = (x - cam.cx) / cam.F, b = -(y - cam.cy) / cam.F, d0 = a, d1 = b * Math.cos(e) + Math.sin(e), d2 = -b * Math.sin(e) + Math.cos(e);
  return [Math.atan2(d0, d2) / D2R + cam.az0, Math.atan2(d1, Math.hypot(d0, d2)) / D2R];
}
const dirOf = (az, alt) => { const a = az * D2R, l = alt * D2R; return [Math.cos(l) * Math.sin(a), Math.sin(l), Math.cos(l) * Math.cos(a)]; };
// featured objects (screen positions in HOOK_CAM → directions; the altitudes feed the model)
const FEAT = {star: skyInv(HOOK_CAM, 646, 610), jup: skyInv(HOOK_CAM, 318, 712), moon: skyInv(HOOK_CAM, 804, 392),
  high: [6, 57], sirius: [-14, ALT.sirius]};
ALT.hookStar = FEAT.star[1]; ALT.jupiter = FEAT.jup[1]; ALT.moon = FEAT.moon[1]; ALT.high = FEAT.high[1];
export const OFF = {hookStar: [61.0, 23.0], high: [140.0, 199.0], sirius: [11.0, 87.0], space: [201, 17]};   // where each featured star's light crosses the layer (cm)

// ---- value noise for textures (deterministic) ----
function h2(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn2(x, y, s) { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return lerp(lerp(h2(i, j, s), h2(i + 1, j, s), u), lerp(h2(i, j + 1, s), h2(i + 1, j + 1, s), u), v); }
function fbm2(x, y, s, oct = 4) { let a = 0, amp = 0.5, f = 1, n = 0; for (let k = 0; k < oct; k++) { a += amp * vn2(x * f, y * f, s + k * 31); n += amp; amp *= 0.5; f *= 2.03; } return a / n; }
const fbm1 = (x, s, oct = 5) => fbm2(x, 0.37, s, oct);

// ---- stars: random directions (uniform on the sphere) + a Milky Way band; NOT a catalogue ----
const MW_P1 = dirOf(-28, -2), MW_P2 = dirOf(38, 66), MW_G = unit(cross(MW_P1, MW_P2)), MW_C = MW_P1, MW_D = cross(MW_G, MW_C);
const bandCoord = d => [Math.asin(clamp(dot(d, MW_G), -1, 1)) / D2R, Math.atan2(dot(d, MW_D), dot(d, MW_C)) / D2R];   // [latitude from band, angle from core]
const STARCOL = ['#FFC996', '#FFE6C4', '#F6F4EE', '#E4ECFF', '#C8DAFF'];
export const SKYSTARS = (() => {
  const rnd = mulberry(4242), out = [];
  const push = (az, alt, f) => {
    if (alt < 0.4) return; const X = airmass(alt), u = rnd();
    out.push({az, alt, f: f * 10 ** (-0.4 * 0.28 * (X - 1)), s: sOf(alt), col: mix(STARCOL[Math.min(4, Math.floor(u * 5))], '#FFB079', clamp((X - 1.6) / 7) * 0.7), ox: rnd() * DOM, oy: rnd() * DOM, bright: f > 0.9});
  };
  const sinLo = Math.sin(0.4 * D2R), sinHi = Math.sin(84 * D2R);
  let n = 0;
  while (n < 16000) {
    const az = -62 + 124 * rnd(), alt = Math.asin(lerp(sinLo, sinHi, rnd())) / D2R, [b, l] = bandCoord(dirOf(az, alt)); n++;
    const inBand = Math.exp(-((b / 11) ** 2)) * (0.45 + 0.55 * Math.exp(-((l / 70) ** 2)));
    if (rnd() < 0.42 + 0.58 * inBand) { const f = rnd() < 0.006 ? 1.0 + 2.6 * rnd() ** 2 : 0.05 + 0.75 * rnd() ** 3.4; push(az, alt, f); }
  }
  return out;
})();

// ---- silhouettes: far ridge and near treeline, defined by altitude vs azimuth so every camera agrees ----
const ridgeAlt = az => 2.4 + 2.6 * fbm1(az / 9 + 3.1, 11) + 2.2 * Math.exp(-(((az - 14) / 9) ** 2)) - 0.8 * Math.exp(-(((az + 9) / 6) ** 2));
const TREES = (() => { const rnd = mulberry(99), T = []; for (let az = -64; az < 64;) { const h = 0.35 + 1.6 * rnd() ** 1.6 + 1.5 * smooth((Math.abs(az) - 16) / 18); T.push({az, h, w: 0.18 + 0.22 * rnd()}); az += 0.22 + 0.42 * rnd(); } return T; })();
const treeBase = az => 0.25 + 0.5 * fbm1(az / 6 + 9.7, 17);

// ---- Milky Way texture per camera (half resolution, cached) ----
const MWTEX = new Map();
function mwTexture(stage, cam) {
  const key = `${cam.El}_${cam.F}_${cam.az0}`; let tex = MWTEX.get(key); if (tex) return tex;
  const S = 2, M = 64, W = (1080 + 2 * M) / S, H = 1500 / S, cv = new stage.canvas.constructor(W, H), c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
  const warm = [222, 206, 178], cool = [150, 170, 214];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [az, alt] = skyInv(cam, i * S + S / 2 - M, j * S + S / 2); if (alt < -1) continue;
    const [b, l] = bandCoord(dirOf(az, alt)), w = 9 + 4 * smooth(Math.abs(l) / 90);
    const n1 = fbm2(az / 7, alt / 7, 3, 5), n2 = fbm2(az / 2.2, alt / 2.2, 7, 4), n3 = vn2(i * 0.9, j * 0.9, 13);
    const g = Math.exp(-(((b + 4 * (n1 - 0.5)) / w) ** 2)), core = Math.exp(-((l / 38) ** 2)), along = 0.3 + 0.7 * Math.exp(-((l / 85) ** 2));
    let I = g * along * (0.35 + 0.95 * n1) * (0.65 + 0.6 * n2) + 0.5 * core * Math.exp(-((b / 7) ** 2)) * n1;
    const lane = Math.exp(-(((b - 1.2 + 3 * (n2 - 0.5)) / (1.6 + 1.6 * n1)) ** 2)) * smooth((60 - Math.abs(l)) / 40);
    I *= 1 - 0.8 * lane * smooth(n1 * 1.6 - 0.25);
    I += g * 0.35 * n3 ** 6;
    const q = clamp(Math.abs(b) / w), col = [lerp(warm[0], cool[0], q), lerp(warm[1], cool[1], q), lerp(warm[2], cool[2], q)];
    const k = (j * W + i) * 4, al = clamp(I * 0.36 * smooth((alt + 0.5) / 4));
    d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255 * al;
  }
  c.putImageData(img, 0, 0); tex = {cv, W, H, S, M}; MWTEX.set(key, tex); return tex;
}

/** the whole night sky: gradient, airglow, Milky Way, twinkling stars, silhouettes. o: {cam, a, par (dolly px),
 *  dAz, dEl (camera drift, deg), space (no air: no twinkle, no extinction), noSil, starGain} */
export function drawSky(stage, t, o = {}) {
  const {ctx: c} = stage, cam0 = o.cam || HOOK_CAM, cam = {...cam0, az0: cam0.az0 + (o.dAz || 0), El: cam0.El + (o.dEl || 0)}, a = o.a ?? 1;
  const hy = cam.cy + cam.F * Math.tan(cam.El * D2R);
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 0, 0, Math.max(hy, 1300));
    if (o.space) { g.addColorStop(0, '#010309'); g.addColorStop(1, '#040A14'); }
    else { g.addColorStop(0, '#01050C'); g.addColorStop(0.55, '#04101D'); g.addColorStop(0.86, '#0B1C2D'); g.addColorStop(1, '#16283A'); }
    c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    const tex = mwTexture(stage, cam0), sx = -(o.dAz || 0) * D2R * cam.F, sy = (o.dEl || 0) * D2R * cam.F;
    c.save(); c.globalAlpha *= o.mw ?? 1; c.imageSmoothingEnabled = true; c.drawImage(tex.cv, sx - tex.M, sy, tex.W * tex.S, tex.H * tex.S); c.restore();
    if (!o.space) { const hg = c.createLinearGradient(0, hy - 360, 0, hy); hg.addColorStop(0, 'rgba(40,58,78,0)'); hg.addColorStop(1, 'rgba(48,66,84,0.55)'); c.fillStyle = hg; c.fillRect(0, hy - 360, 1080, 360); }
    // stars
    const gain = o.starGain ?? 1;
    for (const st of SKYSTARS) {
      const p = skyProj(cam, st.az, st.alt); if (!p || p[0] < -4 || p[0] > 1084 || p[1] < -4 || p[1] > hy) continue;
      if (st.bright) {
        let bR = 1, bG = 1, bB = 1;
        if (!o.space) { bR = starSeen(t, st.alt, st.s, st.ox, st.oy, -1); bG = starSeen(t, st.alt, st.s, st.ox, st.oy, 0); bB = starSeen(t, st.alt, st.s, st.ox, st.oy, 1); }
        drawStar(c, p[0], p[1], (o.space ? 1.25 : 1) * st.f * gain, st.col, [bR, bG, bB]);
      } else {
        const B = o.space ? 1 : starSeen(t, st.alt, st.s, st.ox, st.oy), f = (o.space ? 1.25 : 1) * st.f * gain;
        const al = clamp(f * 1.25 * (0.3 + 0.7 * Math.min(B, 2.6))), r = 0.6 + 0.95 * Math.sqrt(f);
        c.fillStyle = rgba(st.col, al);
        c.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      }
    }
    if (!o.noSil) silhouettes(stage, cam, o.par || 0);
  });
}
/** a bright star: three colour channels (dispersion) → colour and size; B ≈ 1 on average */
export function drawStar(c, x, y, f, col, [bR, bG, bB], o = {}) {
  const base = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
  const Bm = (bR + bG + bB) / 3, k = Math.min(Bm, 3.2), sat = o.sat ?? 0.45, ch = v => 0.92 * (1 + sat * (v / Bm - 1));
  const cr = clamp(base[0] * ch(bR), 0, 255), cg = clamp(base[1] * ch(bG), 0, 255), cb = clamp(base[2] * ch(bB), 0, 255);
  const hex = '#' + [cr, cg, cb].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const r = (o.r ?? 1.15 + 0.85 * Math.sqrt(f)) * (0.55 + 0.45 * Math.sqrt(k));
  glow(c, x, y, r * (4.5 + 3.5 * Math.sqrt(k)) * (o.glow ?? 1), hex, clamp((0.05 + 0.16 * k) * Math.sqrt(f) * (o.glowA ?? 1), 0, 0.9));
  glow(c, x, y, r * 2.4, '#FFFFFF', clamp(0.25 * k, 0, 0.8));
  circle(c, x, y, r, rgba(mix(hex, '#FFFFFF', 0.5), clamp(0.45 + 0.3 * k)));
  return hex;
}
function silhouettes(stage, cam, par) {
  const {ctx: c} = stage, P = (az, alt) => skyProj(cam, az, alt);
  const ridge = [];
  for (let x = -40; x <= 1120; x += 6) { const az = skyInv(cam, x, 900)[0]; const p = P(az - par * 0.3 / cam.F / D2R, ridgeAlt(az)); if (p) ridge.push([x, p[1]]); }
  const g = c.createLinearGradient(0, 1100, 0, 1500); g.addColorStop(0, '#0C1824'); g.addColorStop(1, '#050B11');
  poly(c, [...ridge, [1120, 1960], [-40, 1960]], g);
  line(c, ridge, 'rgba(120,150,175,0.10)', 1.5);
  // treeline (parallax: shifts with the dolly)
  const pts = [];
  const azL = skyInv(cam, -80, 900)[0], azR = skyInv(cam, 1160, 900)[0], k = cam.F * D2R;
  for (const tr of TREES) {
    if (tr.az < azL - 2 || tr.az > azR + 2) continue;
    const b = treeBase(tr.az), p0 = P(tr.az, b); if (!p0) continue;
    const x = p0[0] + par, y0 = p0[1], hpx = tr.h * k, w = tr.w * k;
    pts.push([x - w, y0], [x - w * 0.35, y0 - hpx * 0.55], [x - w * 0.12, y0 - hpx * 0.8], [x, y0 - hpx], [x + w * 0.12, y0 - hpx * 0.8], [x + w * 0.35, y0 - hpx * 0.55], [x + w, y0]);
  }
  if (pts.length) poly(c, [[-40, pts[0][1]], ...pts, [1120, pts[pts.length - 1][1]], [1120, 1960], [-40, 1960]], '#020509');
}
/** crescent / gibbous Moon: k = illuminated fraction, rot = direction of the lit limb (rad, screen), earthshine */
function drawMoonDisc(c, x, y, r, k, rot, a = 1, o = {}) {
  withAlpha(c, a, () => {
    glow(c, x, y, r * (o.halo ?? 6), '#C9D4E4', 0.16 * (o.haloA ?? 1));
    glow(c, x, y, r * 2.2, '#E8EDF4', 0.22 * (o.haloA ?? 1));
    circle(c, x, y, r, '#2A313B');
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    const rx = r * Math.abs(1 - 2 * k); c.ellipse(0, 0, Math.max(0.01, rx), r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
    c.closePath();
    const g = c.createRadialGradient(r * 0.3, -r * 0.2, r * 0.1, 0, 0, r); g.addColorStop(0, '#FBF8F0'); g.addColorStop(1, '#C9C5BC');
    c.fillStyle = g; c.fill(); c.clip();
    for (const [dx, dy, rr] of [[0.35, -0.3, 0.22], [0.55, 0.15, 0.16], [0.2, 0.42, 0.13], [0.62, -0.5, 0.1]]) circle(c, dx * r, dy * r, rr * r, 'rgba(120,124,132,0.32)');
    c.restore();
  });
}

// =====================================================================================================
// UI helpers (centred header, panels, tags, traces)
// =====================================================================================================
const PAL = {warm: '#F2A65A', cold: '#6FB8F2', star: '#EAF2FF', planet: '#F2CF8E', moon: '#D3D6DC', light: '#FFE2C4', ray: '#FFF1D2',
  laser: '#FFB43A', ground: '#0A1820', good: '#9FD9C8', red: '#FF7A6A', green: '#8FE39A', blue: '#7FA8FF'};
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
const endFade = (t, ctx, d = 0.35) => fadeOut(t, ctx.scene.end - d - 0.03, d);
function panel(c, T, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 10, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
  return w;
}
function crossOut(c, x0, x1, y, q, col = '#FF8A5C') { if (q > 0) line(c, [[x0 - 6, y + 2], [lerp(x0 - 6, x1 + 6, easeOut(q)), y + 2]], rgba(col, 0.9), 4); }
function head(stage, kicker, title, aK, aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 940}));
}
/** scrolling trace (oscilloscope roll): newest value at the right edge; nothing before t0 */
function traceBox(stage, b, f, t, o = {}) {
  const {ctx: c} = stage, T = stage.theme, win = o.win ?? 5, yMax = o.yMax ?? 3, t0 = o.t0 ?? -Infinity, n = o.n ?? 220;
  if (o.frame !== false) rect(c, b.x, b.y, b.w, b.h, 8, rgba(T.plate, o.plateA ?? 0.82), rgba(T.border, 1), 1.2);
  // o.log = [vmin, vmax]: logarithmic brightness axis (like stellar magnitudes) — the low-star log-normal peaks are not clipped
  const L0 = o.log ? Math.log(o.log[0]) : 0, L1 = o.log ? Math.log(o.log[1]) : 1, q = v => (o.log ? (Math.log(Math.max(v, 1e-6)) - L0) / (L1 - L0) : v / yMax);
  const Y = v => b.y + b.h - 6 - (b.h - 12) * clamp(q(v)), X = tt => b.x + b.w - 14 - (b.w - 28) * (t - tt) / win;
  if (o.mean !== false) line(c, [[b.x + 10, Y(1)], [b.x + b.w - 10, Y(1)]], rgba(T.muted, 0.45), 1.2, {dash: [5, 6]});
  const pts = [];
  for (let k = 0; k <= n; k++) { const tt = t - win * (1 - k / n); if (tt < t0) continue; pts.push([X(tt), Y(f(tt))]); }
  if (pts.length > 1) {
    c.save(); c.beginPath(); c.rect(b.x + 4, b.y + 2, b.w - 8, b.h - 4); c.clip();
    line(c, pts, o.col || PAL.star, o.w ?? 2.5); c.restore();
    if (o.dot !== false) { const q = pts[pts.length - 1]; glow(c, q[0], q[1], 14, o.col || PAL.star, 0.5); circle(c, q[0], q[1], 4, o.col || PAL.star); }
  }
  return {X, Y};
}
/** small inline sparkline without a frame */
function spark(stage, x, y, w, h, f, t, o = {}) { return traceBox(stage, {x, y, w, h}, f, t, {log: SKYLOG, ...o, frame: false, mean: o.mean ?? false, n: o.n ?? 90, w: o.w ?? 2}); }
const SKYLOG = [0.12, 9];                                              // sky sparklines: log brightness 0.12 … 9 × mean
const tagX = (stage, s, x, size = 24, align = 'center') => { const w = stage.measure(s, {size, weight: 700}) + 16; const lo = 140 + (align === 'left' ? 0 : align === 'right' ? w : w / 2), hi = 940 - (align === 'left' ? w : align === 'right' ? 0 : w / 2); return clamp(x, lo, hi); };
/** offscreen canvas cache (per purpose) for per-pixel fields */
const OFFS = new Map();
function offscreen(stage, key, w, h) { let o = OFFS.get(key); if (!o || o.w !== w || o.h !== h) { const cv = new stage.canvas.constructor(w, h), c = cv.getContext('2d'); o = {cv, c, w, h, img: c.createImageData(w, h)}; OFFS.set(key, o); } return o; }

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  starW: W('s01', '별이'), twinkleW: W('s01', '반짝이는지'), moonW: W('s01', '달과'), sunW: W('s01', '태양은'), notW: W('s01', '않는지'), ask: W('s01', '알아볼까요'),
  light: W('s02', '별빛은'), space: W('s02', '우주를'), cross: W('s02', '건너오는'), allway: W('s02', '내내'), even: W('s02', '고르게'), shine: W('s02', '빛납니다'),
  twk: W('s02', '반짝임은'), last: W('s02', '마지막'), moment: W('s02', '순간'), our: W('s02', '우리'), air2: W('s02', '공기에서'), made: W('s02', '생깁니다'),
  eng: W('s03', '영어'), tw: W('s03', '트윙클은'), eye: W('s03', '눈을'), blink: W('s03', '깜빡인다는'), oldW: W('s03', '옛말에서'), astro: W('s03', '천문학에서는'),
  spark: W('s03', '불꽃을'), latin: W('s03', '라틴어에서'), scint: W('s03', '신틸레이션이라고'), call: W('s03', '부릅니다'),
  newton: W('s04', '뉴턴은'), shake: W('s04', '떨리는'), airN: W('s04', '공기'), blame: W('s04', '탓이라며'), scope: W('s04', '망원경을'), high: W('s04', '높은'),
  peak: W('s04', '산꼭대기의'), calm: W('s04', '고요한'), put: W('s04', '두자고'), wrote: W('s04', '썼습니다'),
  core: W('s05', '핵심은'), temp: W('s05', '온도가'), diffT: W('s05', '다른'), airE: W('s05', '공기는'), lightE: W('s05', '빛을'), bend: W('s05', '꺾어서'),
  mixW: W('s05', '뒤섞이는'), lump: W('s05', '덩어리가'), moving: W('s05', '움직이는'), lens: W('s05', '렌즈처럼'), starlight: W('s05', '별빛을'), curve: W('s05', '휘게'),
  warm: W('s06', '따뜻한'), cold: W('s06', '찬 공기'), dens: W('s06', '밀도가'), raysW: W('s06', '빛이'), pass: W('s06', '지날'), tiny: W('s06', '아주'), bends: W('s06', '꺾입니다'),
  wind: W('s07', '바람에'), palm: W('s07', '손바닥만'), lumps: W('s07', '덩어리들이'), gather: W('s07', '모았다'), scatter: W('s07', '흩었다'), ground: W('s07', '땅'),
  bright: W('s07', '밝고'), dark: W('s07', '어두운'), pattern: W('s07', '무늬가'), ripple: W('s07', '출렁입니다'),
  pupil: W('s08', '눈동자는'), smaller: W('s08', '무늬보다'), passes: W('s08', '무늬가'), each: W('s08', '때마다'), brighter: W('s08', '밝아졌다'), dimmer: W('s08', '어두워집니다'),
  persec: W('s08', '일초에도'), tens: W('s08', '수십'),
  starP: W('s09', '별은'), far: W('s09', '멀어서'), bigScope: W('s09', '망원경으로'), size: W('s09', '크기가'), point: W('s09', '점입니다'), beam: W('s09', '빛줄기'),
  whole: W('s09', '통째로'), shakes: W('s09', '흔들리니'), asis: W('s09', '그대로'),
  planet: W('s10', '행성은'), near: W('s10', '가까워서'), disc: W('s10', '원반으로'), discPts: W('s10', '원반의'), many: W('s10', '수많은'), each10: W('s10', '저마다'),
  fill: W('s10', '메워'), almost: W('s10', '거의'), evenP: W('s10', '고르게'),
  moonP: W('s11', '달과'), than: W('s11', '별보다'), wide: W('s11', '수십만'), avg: W('s11', '평균되어'), notTw: W('s11', '반짝이지'), limb: W('s11', '가장자리만'),
  haze: W('s11', '아지랑이처럼'), shimmer: W('s11', '일렁입니다'),
  starH: W('s12', '별이'), horizonW: W('s12', '지평선'), worse: W('s12', '심하게'), lightH: W('s12', '빛이'), thicker: W('s12', '두꺼운'), layer: W('s12', '공기층을'),
  low: W('s13', '낮게'), sirius: W('s13', '시리우스가'), colour: W('s13', '색을'), changing: W('s13', '바꾸며'), airC: W('s13', '공기가'), perColour: W('s13', '색마다'), bendC: W('s13', '꺾기'),
  eclipse: W('s14', '개기일식'), sunE: W('s14', '태양이'), thread: W('s14', '실처럼'), thin: W('s14', '가늘어지면'), groundE: W('s14', '땅'), shadow: W('s14', '그림자'),
  wave: W('s14', '일렁이는데'), same: W('s14', '같은'), likely: W('s14', '설명이'),
  obs: W('s15', '천문대는'), highM: W('s15', '높은'), build: W('s15', '짓고'), hubble: W('s15', '허블'), above: W('s15', '아예'), up: W('s15', '올라갔습니다'),
  bigT: W('s16', '큰'), laser: W('s16', '레이저로'), fake: W('s16', '가짜'), guide: W('s16', '별을'), hundreds: W('s16', '일초에'), mirror: W('s16', '거울'),
  change: W('s16', '바꿔'), erase: W('s16', '지웁니다'),
  myth: W('s17', '스스로'), no: W('s17', '아닙니다'), spaceM: W('s17', '우주에서'), calmM: W('s17', '고요합니다'),
  pt: W('s18', '점이라서'), moonC: W('s18', '달과'), wideC: W('s18', '넓어서'), avgC: W('s18', '평균됩니다'), notStar: W('s18', '아니라'), airC2: W('s18', '공기가'),
};

export const titles = {
  hook: ['오늘의 주제 · 별의 반짝임', '별은 왜 반짝일까'],
  origin: ['기원 · 이름', '깜빡임과 불꽃'],
  essence: ['본질 · 제1원리', '온도가 다른 공기 = 움직이는 렌즈'],
  cells: ['메커니즘 ① 공기 덩어리', '빛을 모았다 흩었다'],
  point: ['메커니즘 ③ 점과 원반', '별은 점, 행성은 작은 원반'],
  horizon: ['현상 · 지평선 근처', '낮은 별일수록 더 반짝인다'],
  use: ['사례 · 흔들림 피하기', '높은 산 위로, 공기 위로'],
  myth: ['오해 바로잡기', '별이 스스로 깜빡일까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s04') - 0.5, '기원 · 뉴턴의 처방', '고요한 공기를 찾아 산으로']];
  if (id === 'cells') return [[-Infinity, ...titles.cells], [at('s08') - 0.5, '메커니즘 ② 눈동자', '무늬보다 작은 눈동자']];
  if (id === 'point') return [[-Infinity, ...titles.point], [at('s11') - 0.5, '메커니즘 ③ 점과 원반', '달과 태양은 흔들림이 평균된다']];
  if (id === 'horizon') return [[-Infinity, ...titles.horizon], [at('s13') - 0.5, '현상 · 색의 반짝임', '색마다 조금씩 다르게 꺾인다'], [at('s14') - 0.6, '현상 · 개기일식', '땅 위의 그림자 띠']];
  if (id === 'use') return [[-Infinity, ...titles.use], [at('s16') - 0.5, '사례 · 적응광학', '거울로 흔들림을 지운다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
// ---- first frame = thumbnail (2026-11-03 rule, retrofitted 2026-11-05): the big two-line title in the central square
//      shrinks into the hook header between MORPH[0] and MORPH[1]; no progress bar, captions or small labels before that.
const MORPH = [0.9, 1.7], TITLE_Y = [1088, 1214];
function posterTitle(stage, t, main, sub, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const big = Math.min(168, 168 * 800 / stage.measure(main, {role: 'display', weight: 700, size: 168}));
  const y1 = lerp(TITLE_Y[0], 228, q), s1 = lerp(big, 54, q), y2 = lerp(TITLE_Y[1], 290, q), s2 = lerp(64, 30, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g = c.createLinearGradient(0, 960, 0, 1320); g.addColorStop(0, 'rgba(0,6,12,0)'); g.addColorStop(0.32, 'rgba(0,6,12,0.66)'); g.addColorStop(0.8, 'rgba(0,6,12,0.66)'); g.addColorStop(1, 'rgba(0,6,12,0)');
    c.fillStyle = g; c.fillRect(0, 960, 1080, 360);
  });
  withAlpha(c, a, () => {
    stage.text(main, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 20});
    // the subtitle fades during the shrink (the hook's sky labels sit just below the header here)
    withAlpha(c, 1 - smooth((q - 0.35) / 0.55), () => stage.text(sub, 540, y2, {role: 'display', weight: 500, size: s2, color: T.light, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 14}));
  });
}
function hookOverlay(stage, t, ctx, kicker, main, sub) {
  if (t < MORPH[1]) { posterTitle(stage, t, main, sub); return; }
  const c = stage.ctx, ho = fadeOut(t, ctx.scene.end - 0.3, 0.28), kA = fadeIn(t, MORPH[1] - 0.05, 0.4) * ho;
  head(stage, kicker, main, kA, ho);
  withAlpha(c, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration));
}
/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  if (ctx.scene.id === 'hook') { hookOverlay(stage, t, ctx, '오늘의 주제 · 별의 반짝임', '별은 왜 반짝일까', '반짝임은 공기가 만든다'); return; }
  const L = titleList(ctx.scene.id, ctx.tl), a = smooth(ctx.scene.p / 0.04);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  // sequential swap (old line fades out, then the new one fades in) so two titles never overlap
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}

// =====================================================================================================
// Shared brightness signals (picture, graphs and sound read the same functions)
// =====================================================================================================
const SIG = {
  hookStar: t => starSeen(t, ALT.hookStar, sOf(ALT.hookStar), OFF.hookStar[0], OFF.hookStar[1]),
  hookStarCh: (t, ch) => starSeen(t, ALT.hookStar, sOf(ALT.hookStar), OFF.hookStar[0], OFF.hookStar[1], ch),
  hookJup: t => discB(t, {alt: ALT.jupiter, as: SIZE.jupiter, rate: SKY_RATE, x0: 30, y0: 160}),
  hookMoon: t => discB(t, {alt: ALT.moon, as: SIZE.moon, rate: SKY_RATE, x0: 90, y0: 40}),
  cells: t => starB(t, {alt: ALT.cells, x0: PUP.x, y0: PUP.y}),
  cellsReal: tau => starB(0, {alt: ALT.cells, x0: PUP.x, y0: PUP.y, real: tau}),
  planet: t => discB(t, {s: S_REF, as: SIZE.jupiter, x0: PUP.x, y0: PUP.y}),
  moon: t => discB(t, {s: S_REF, as: SIZE.moon, x0: PUP.x, y0: PUP.y}),
  high: t => starSeen(t, ALT.high, sOf(ALT.high), OFF.high[0], OFF.high[1]),
  low: (t, ch = 0) => starSeen(t, ALT.sirius, sOf(ALT.sirius), OFF.sirius[0], OFF.sirius[1], ch),
  ground: t => starB(t, {alt: 40, x0: 150, y0: 60}),
  summit: t => starB(t, {s: S_SUMMIT * sOf(40), x0: 150, y0: 60}),
};
/** the hook's featured star as heard: twinkling in the sky view; steady while its light crosses space; twinkling again
 *  once the wavefronts reach the observer under the air (side view) */
function hookHeard(t, tl) {
  const j = journeyTimes(tl);
  if (t < j.dive1) return SIG.hookStar(t);
  return lerp(1, SIG.hookStar(t), smooth((t - j.hit) / 0.5));
}
function journeyTimes(tl) {
  const at = r => tl.at(r), dive0 = at(A.light) - 0.75, dive1 = dive0 + 1.2, p0 = at(A.light) - 0.2, p1 = at(A.last) - 0.1;
  // the first wavefront that reaches the ground after the pan: crosses the air during "마지막 순간"
  return {dive0, dive1, p0, p1, hit: p1 + (BJ.BH + 20) / BJ.v};
}

// =====================================================================================================
// hook: the night sky, then the light's journey (side view)
// =====================================================================================================
const BJ = {BT: 1650, BH: 230, R: 2600, v: 190, sp: 46, hw: 132, cmPx: 0.12};
const SPACE_STARS = Array.from({length: 260}, (_, i) => ({x: rand(i * 3.17 + 0.2) * 1080, y: rand(i * 5.71 + 1.3) * 2600, m: rand(i * 2.13 + 4.4) ** 2.5}));
function hookSky(stage, t, ctx, a, zq) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), j = journeyTimes(ctx.tl);
  const q = rampEase(t / j.dive1), dAz = lerp(-0.7, 0.5, q), dEl = lerp(-0.25, 0.1, q), par = -34 * q;
  const cam = {...HOOK_CAM, az0: HOOK_CAM.az0 + dAz, El: HOOK_CAM.El + dEl};
  const sp = skyProj(cam, ...FEAT.star), z = 1 + 2.4 * easeIn(zq);
  c.save();
  c.translate(lerp(sp[0], 540, easeInOut(zq)), lerp(sp[1], 520, easeInOut(zq))); c.scale(z, z); c.translate(-sp[0], -sp[1]);
  drawSky(stage, t, {cam: HOOK_CAM, dAz, dEl, par, a, noSil: true});
  withAlpha(c, a, () => {
    const mp = skyProj(cam, ...FEAT.moon), jp = skyProj(cam, ...FEAT.jup);
    drawMoonDisc(c, mp[0], mp[1], 17, 0.3, 2.45, 1);
    const bj = SIG.hookJup(t); glow(c, jp[0], jp[1], 46, '#F6E3BE', 0.34 * bj); glow(c, jp[0], jp[1], 12, '#FFF8E8', 0.6 * bj); circle(c, jp[0], jp[1], 4.2 * Math.sqrt(bj), '#FFF6E2');
    drawStar(c, sp[0], sp[1], 10, '#E9F0FF', [SIG.hookStarCh(t, -1), SIG.hookStarCh(t, 0), SIG.hookStarCh(t, 1)], {glow: 1.5});
    silhouettes(stage, cam, par);
  });
  c.restore();
  // labels on the sky view (gone before the dive)
  const la = a * (1 - smooth(zq / 0.25));
  if (la > 0) withAlpha(c, la, () => {
    const mp = skyProj(cam, ...FEAT.moon), sA = fadeIn(t, at(A.starW) - 0.1, 0.4), mA = fadeIn(t, at(A.moonW) - 0.1, 0.4);
    if (sA > 0) withAlpha(c, sA, () => {
      ring(c, sp[0], sp[1], 26, rgba(T.light, 0.75), 2);
      tag(stage, '별', sp[0] - 40, sp[1], {size: 28, align: 'right', color: T.light});
      const kA = fadeIn(t, at(A.twinkleW) - 0.1, 0.4);
      if (kA > 0) withAlpha(c, kA, () => { spark(stage, sp[0] + 30, sp[1] + 20, 230, 64, SIG.hookStar, t, {win: 3, yMax: 3.2, col: PAL.star, t0: at(A.twinkleW) - 0.1}); stage.text('밝기 · 출렁인다', sp[0] + 44, sp[1] + 106, {size: 24, weight: 500, color: T.muted}); });
    });
    if (mA > 0) withAlpha(c, mA, () => {
      ring(c, mp[0], mp[1], 30, rgba(PAL.moon, 0.75), 2);
      tag(stage, '달', mp[0] - 44, mp[1], {size: 28, align: 'right', color: PAL.moon});
      tag(stage, '태양도 마찬가지', mp[0] - 44, mp[1] - 50, {size: 24, align: 'right', color: PAL.planet, a: fadeIn(t, at(A.sunW) - 0.1, 0.4)});
      const kA = fadeIn(t, at(A.notW) - 0.5, 0.4);
      if (kA > 0) withAlpha(c, kA, () => { spark(stage, mp[0] - 250, mp[1] + 26, 230, 64, SIG.hookMoon, t, {win: 3, yMax: 3.2, col: PAL.moon, t0: at(A.notW) - 0.6}); stage.text('밝기 · 고르다', mp[0] - 236, mp[1] + 112, {size: 24, weight: 500, color: T.muted}); });
    });
  });
}
function beamJourney(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), j = journeyTimes(ctx.tl);
  const pan = easeInOut((t - j.p0) / (j.p1 - j.p0)), camY = lerp(-520, BJ.BT - 760, pan), Y = yw => yw - camY;
  const yTop = Y(BJ.BT), yG = Y(BJ.BT + BJ.BH), s = sOf(ALT.hookStar), cx = 540;
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#01040A'); g.addColorStop(1, '#030A14'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    for (const st of SPACE_STARS) { const y = ((st.y - camY * 0.35) % 2600 + 2600) % 2600 - 300; if (y < -4 || y > 1924) continue; c.fillStyle = rgba('#DCE6F6', 0.2 + 0.6 * st.m); const r = 0.6 + 1.1 * st.m; c.fillRect(st.x - r, y - r, 2 * r, 2 * r); }
    // Earth and its thin air shell (the shell is drawn far too thick: in reality tens of km against light years)
    const ec = [cx, yG + BJ.R], airA = smooth((1500 - yTop) / 500);
    if (yTop < 2100) {
      const ga = c.createRadialGradient(ec[0], ec[1], BJ.R, ec[0], ec[1], BJ.R + BJ.BH + 40);
      ga.addColorStop(0, 'rgba(92,150,205,0.55)'); ga.addColorStop(0.75, 'rgba(60,110,170,0.16)'); ga.addColorStop(1, 'rgba(40,80,140,0)');
      c.beginPath(); c.arc(ec[0], ec[1], BJ.R + BJ.BH + 40, 0, TAU); c.fillStyle = ga; c.fill();
      // warm / cold pockets inside the shell (same POCK field, drifting with the wind)
      withAlpha(c, airA, () => {
        c.save(); c.beginPath(); c.arc(ec[0], ec[1], BJ.R + BJ.BH, 0, TAU); c.arc(ec[0], ec[1], BJ.R, 0, TAU, true); c.clip('evenodd');
        pocketField(stage, 'bj', {x: 0, y: Math.round(yTop - 10), w: 1080, h: BJ.BH + 90}, (x, y) => [80 + (x - cx) * BJ.cmPx, 20 + (y - yTop) * BJ.cmPx], t, {a: 0.75, rate: SKY_RATE});
        c.restore();
      });
      const ge = c.createLinearGradient(0, yG, 0, yG + 400); ge.addColorStop(0, '#0E2231'); ge.addColorStop(1, '#040B12');
      c.beginPath(); c.arc(ec[0], ec[1], BJ.R, 0, TAU); c.fillStyle = ge; c.fill();
      ring(c, ec[0], ec[1], BJ.R, 'rgba(140,190,230,0.5)', 2);
    }
    // the star and its light: a cone that becomes a parallel beam (plane wavefronts), steady in space
    const sy = Y(0);
    glow(c, cx, sy, 120, '#DCE8FF', 0.32); glow(c, cx, sy, 40, '#FFFFFF', 0.6); circle(c, cx, sy, 5, '#FFFFFF');
    const half = yw => BJ.hw * clamp(yw / 260, 0.02, 1);
    const bg = c.createLinearGradient(cx - BJ.hw - 10, 0, cx + BJ.hw + 10, 0);
    bg.addColorStop(0, 'rgba(255,241,210,0)'); bg.addColorStop(0.3, 'rgba(255,241,210,0.06)'); bg.addColorStop(0.5, 'rgba(255,241,210,0.085)'); bg.addColorStop(0.7, 'rgba(255,241,210,0.06)'); bg.addColorStop(1, 'rgba(255,241,210,0)');
    poly(c, [[cx, sy], [cx + half(260), Y(260)], [cx + BJ.hw, yG], [cx - BJ.hw, yG], [cx - half(260), Y(260)]], bg);
    const off = (BJ.v * t) % BJ.sp, rowY = 20 + BJ.BH * 0.5 * BJ.cmPx;
    for (let yw = off; yw < BJ.BT + BJ.BH; yw += BJ.sp) {
      const y = Y(yw); if (y < 280 || y > 1340) continue;
      if (yw < 260) { const r = yw, an = Math.atan2(half(yw), yw); ring(c, cx, sy, r, rgba(PAL.ray, 0.55), 2, Math.PI / 2 - an, Math.PI / 2 + an); continue; }
      const q = clamp((yw - BJ.BT) / BJ.BH), pts = [];
      for (let x = cx - BJ.hw; x <= cx + BJ.hw + 0.1; x += 6) pts.push([x, y + 26 * q * pockAt(t, 80 + (x - cx) * BJ.cmPx, rowY, SKY_RATE)]);
      line(c, pts, rgba(PAL.ray, q > 0 ? 0.75 : 0.55), 2);
    }
    // the bright / dark pattern where the light meets the ground, and the observer
    if (yG < 1400) {
      for (let x = cx - BJ.hw; x < cx + BJ.hw; x += 3) { const I = groundI(t, OFF.hookStar[0] + (x - cx) * BJ.cmPx, OFF.hookStar[1], s, SKY_RATE); c.fillStyle = rgba('#FFF3D6', clamp(0.12 + 0.3 * I)); c.fillRect(x, yG - 3, 3, 8); }
      const hA = smooth((t - j.hit) / 0.5), B = hookHeard(t, ctx.tl);
      glow(c, cx, yG - 2, 26 + 18 * hA * Math.min(B, 3), '#FFF3D6', 0.35 + 0.2 * hA * Math.min(B, 2));
      circle(c, cx, yG + 1, 6, '#EFE3D4'); line(c, [[cx, yG + 1], [cx, yG + 30]], '#EFE3D4', 2);
      const oA = fadeIn(t, at(A.our) - 0.1, 0.5);
      if (oA > 0) withAlpha(c, oA, () => {
        tag(stage, '땅 위의 관측자', cx, yG + 62, {size: 24, color: T.ink});
        spark(stage, 600, yG + 110, 300, 70, t2 => hookHeard(t2, ctx.tl), t, {win: 3, yMax: 3.2, col: PAL.star, t0: j.hit - 1.2, mean: true});
        stage.text('관측자에게 오는 별빛 밝기', 750, yG + 202, {size: 24, weight: 500, color: T.muted, align: 'center'});
        line(c, [[180, yTop + 20], [180, yG - 6]], rgba(PAL.cold, 0.8), 3); line(c, [[170, yTop + 20], [190, yTop + 20]], rgba(PAL.cold, 0.8), 3); line(c, [[170, yG - 6], [190, yG - 6]], rgba(PAL.cold, 0.8), 3);
        tag(stage, '우리 머리 위의 공기', 210, yTop - 30, {size: 26, align: 'left', color: PAL.cold, border: PAL.cold});
      });
    }
    // world-anchored notes passed on the way down, then the screen-fixed ones
    for (const [yw, s0, ref, side] of [[700, '별빛이 오는 길', A.space, 1], [752, '수 광년 ~ 수천 광년', A.space, 1], [1240, '흔들림 없이', A.even, -1], [1292, '곧고 고르게', A.even, -1]]) {
      const y = Y(yw); if (y > 300 && y < 1330) tag(stage, s0, cx + side * (BJ.hw + 22), y, {size: 24, align: side > 0 ? 'left' : 'right', color: T.light, a: fadeIn(t, at(ref) - 0.3, 0.5) * smooth((y - 300) / 60) * smooth((1330 - y) / 60)});
    }
    const lA = fadeIn(t, at(A.last) - 0.1, 0.4) * fadeOut(t, at(A.our) - 0.3, 0.4);
    if (lA > 0) tag(stage, '마지막 순간 · 지구의 대기', cx, yTop - 34, {size: 26, color: PAL.light, border: PAL.light, a: lA});
    if (yTop < 1200) tag(stage, '대기 두께는 크게 과장', 940, yG - 18, {size: 24, align: 'right', color: T.muted, a: fadeIn(t, at(A.moment), 0.5), plateA: 0.6});
  });
}

// =====================================================================================================
// Per-pixel fields: warm / cold pockets (POCK) and the ground pattern (I)
// =====================================================================================================
/** POCK field in a screen box; map(x, y) → field cm; cold (POCK > 0: denser, higher n) blue, warm amber.
 *  o: {a, rate, res, mixFn(v, x, y) → value, env(x, y) → alpha factor} */
function pocketField(stage, key, b, map, t, o = {}) {
  const a = o.a ?? 1, res = o.res ?? 4, w = Math.ceil(b.w / res), h = Math.ceil(b.h / res), off = offscreen(stage, key, w, h), d = off.img.data, [fx, fy] = flow((o.rate ?? SLOW) * t);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = b.x + (i + 0.5) * res, y = b.y + (j + 0.5) * res, [X, Y] = map(x, y);
    let v = samp(POCK, X - fx, Y - fy); if (o.mixFn) v = o.mixFn(v, x, y);
    const k = (j * w + i) * 4, q = clamp(Math.abs(v) / 2.2), al = 255 * a * (0.06 + 0.5 * q ** 1.3) * (o.env ? o.env(x, y) : 1);
    if (v > 0) { d[k] = 111; d[k + 1] = 184; d[k + 2] = 242; } else { d[k] = 242; d[k + 1] = 166; d[k + 2] = 90; }
    d[k + 3] = al;
  }
  off.c.putImageData(off.img, 0, 0);
  const {ctx: c} = stage; c.save(); c.imageSmoothingEnabled = true; c.drawImage(off.cv, 0, 0, w, h, b.x, b.y, w * res, h * res); c.restore();
}

// ---- cross-section: parallel starlight through a slab of warm / cold air (cold = denser = higher n) ----
// Paraxial rays: dθ/dy = K·∂v/∂x (bend toward higher n), then straight to the ground. Ground brightness = ray density
// from 520 rays (only 27 drawn). Bending is hugely exaggerated (real angles are arcseconds).
const SEC_E = {yIn: 318, ys0: 372, ys1: 752, yG: 968, cm: 0.12, ox: 118, oy: 64};
const SEC_C = {yIn: 300, ys0: 334, ys1: 556, yG: 686, cm: 0.12, ox: 118, oy: 64};
const lerpSec = (A0, B0, q) => Object.fromEntries(Object.keys(A0).map(k => [k, lerp(A0[k], B0[k], q)]));
function secValue(G, t, blobA, m) {
  const [fx, fy] = flow(SLOW * t), yc = (G.ys0 + G.ys1) / 2, sg = 0.25 * (G.ys1 - G.ys0);
  const blob = (x, y) => blobA * 2.3 * (Math.exp(-((x - 380) ** 2 + (y - yc) ** 2) / (2 * sg * sg)) - Math.exp(-((x - 700) ** 2 + (y - yc) ** 2) / (2 * sg * sg)));
  const v = (x, y) => (m < 1 ? (1 - m) * blob(x, y) : 0) + (m > 0 ? m * samp(POCK, G.ox + (x - 540) * G.cm - fx, G.oy + (y - G.ys0) * G.cm - fy) : 0);
  return {v, blob};
}
const secK = m => lerp(0.085, 0.05, m);
function traceSection(G, v, K = 0.085, nDraw = 27, nDense = 520) {
  if (G.K) K = G.K;
  const s0 = 60, s1 = 1020, rays = [], dy = 4, bins = new Float64Array(200), bw = 4;
  const one = (x0, keep) => {
    let x = x0, th = 0; const pts = keep ? [[x, G.yIn], [x, G.ys0]] : null;
    for (let y = G.ys0, k = 0; y < G.ys1; y += dy, k++) { const gr = (v(x + 2, y) - v(x - 2, y)) / 4; th += K * gr * dy; x += th * dy; if (keep && k % 3 === 2) pts.push([x, y]); }
    const xg = x + th * (G.yG - G.ys1); if (keep) { pts.push([x, G.ys1], [xg, G.yG]); rays.push(pts); } return xg;
  };
  for (let i = 0; i < nDraw; i++) one(lerp(160, 920, i / (nDraw - 1)), true);
  for (let i = 0; i < nDense; i++) { const xg = one(lerp(s0, s1, (i + 0.5) / nDense), false), bi = Math.floor((xg - 140) / bw); if (bi >= 0 && bi < 200) bins[bi]++; }
  const dens = nDense / (s1 - s0) * bw, I = new Float64Array(200);
  for (let i = 0; i < 200; i++) { let a = 0, wsum = 0; for (let k = -4; k <= 4; k++) { const j = i + k; if (j < 0 || j >= 200) continue; const w = Math.exp(-k * k / 6); a += w * bins[j]; wsum += w; } I[i] = a / wsum / dens; }
  return {rays, I, Iat: x => I[clamp(Math.floor((x - 140) / bw), 0, 199)]};
}
function drawSection(stage, t, G, sv, o = {}) {
  const {ctx: c} = stage, T = stage.theme, a = o.a ?? 1;
  const tr = traceSection(G, sv.v);
  withAlpha(c, a, () => {
    // sky above, ground below
    const env = (x, y) => smooth((y - G.ys0) / 50) * smooth((G.ys1 - y) / 70) * smooth((x - 140) / 30) * smooth((940 - x) / 30);
    pocketField(stage, o.key || 'sec', {x: 140, y: Math.floor(G.ys0), w: 800, h: Math.ceil(G.ys1 - G.ys0)}, (x, y) => [G.ox + (x - 540) * G.cm, G.oy + (y - G.ys0) * G.cm], t,
      {a: 0.95, mixFn: o.m < 1 ? (vv, x, y) => (1 - o.m) * sv.blob(x, y) + o.m * vv : null, env});
    c.save(); c.beginPath(); c.rect(140, G.yIn - 6, 800, G.yG - G.yIn + 8); c.clip();
    for (const pts of tr.rays) line(c, pts, rgba(PAL.ray, 0.5), 1.6);
    c.restore();
    for (let x = 160; x <= 920; x += 76) arrow(c, [x, G.yIn - 26], [x, G.yIn - 2], rgba(PAL.ray, 0.75), 2, {head: 9});
    // the ground line and the bright / dark pattern on it
    rect(c, 140, G.yG, 800, 18, 3, '#0A161D');
    for (let i = 0; i < 200; i++) { const I = tr.I[i]; c.fillStyle = rgba(mix('#2A3B44', '#FFF2D2', clamp(I / 2.4)), clamp(0.25 + 0.5 * I)); c.fillRect(140 + i * 4, G.yG, 4.2, 10); }
    line(c, [[140, G.yG], [940, G.yG]], rgba(T.border, 1), 1.5);
  });
  return tr;
}

// ---- the ground seen from above (perspective plane) with the bright / dark pattern I = exp(sχ − s²/2) ----
const GP = {yF: 742, yN: 1004, hwN: 400, zN: 1, zF: 1.5, D: 30, gxHalf: 34, near0: -9};
function groundMap(x, y) {   // screen → ground cm (relative to the pupil), or null
  if (y < GP.yF || y > GP.yN) return null;
  const s = (y - GP.yF) / (GP.yN - GP.yF), z = 1 / lerp(1 / GP.zF, 1 / GP.zN, s), hw = GP.hwN * GP.zN / z;
  if (Math.abs(x - 540) > hw) return null;
  return [(x - 540) / GP.hwN * GP.gxHalf * z, GP.near0 + (z - GP.zN) / (GP.zF - GP.zN) * GP.D];
}
function groundToScreen(gx, gy) { const z = GP.zN + (gy - GP.near0) / GP.D * (GP.zF - GP.zN), s = (1 / z - 1 / GP.zF) / (1 / GP.zN - 1 / GP.zF); return [540 + gx / GP.gxHalf * GP.hwN / z, GP.yF + s * (GP.yN - GP.yF), z]; }
function groundPlane(stage, t, s, a, o = {}) {
  const {ctx: c} = stage, res = 2, w = 820 / res, h = Math.ceil((GP.yN - GP.yF) / res), off = offscreen(stage, 'gp', w, h), d = off.img.data;
  const [fx, fy] = flow((o.rate ?? SLOW) * t), dark = [10, 24, 32], lite = [255, 243, 214];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = 130 + (i + 0.5) * res, y = GP.yF + (j + 0.5) * res, g = groundMap(x, y), k = (j * w + i) * 4;
    if (!g) { d[k + 3] = 0; continue; }
    const I = Math.exp(s * samp(CHI, PUP.x + g[0] - fx, PUP.y + g[1] - fy) - s * s / 2), q = clamp(I / 2.6) ** 0.8, fade = smooth((y - GP.yF) / 40);
    d[k] = lerp(dark[0], lite[0], q); d[k + 1] = lerp(dark[1], lite[1], q); d[k + 2] = lerp(dark[2], lite[2], q); d[k + 3] = 255 * a * (0.35 + 0.65 * fade);
  }
  off.c.putImageData(off.img, 0, 0);
  c.save(); c.imageSmoothingEnabled = true; c.drawImage(off.cv, 0, 0, w, h, 130, GP.yF, w * res, h * res); c.restore();
  withAlpha(c, a, () => {
    const hwF = GP.hwN * GP.zN / GP.zF;
    line(c, [[540 - hwF, GP.yF], [540 + hwF, GP.yF], [540 + GP.hwN, GP.yN], [540 - GP.hwN, GP.yN], [540 - hwF, GP.yF]], rgba(stage.theme.border, 1), 1.5);
  });
}

// =====================================================================================================
// origin: twinkle / scintillation; Newton's prescription
// =====================================================================================================
function bookIcon(c, x, y, a) {
  withAlpha(c, a, () => {
    poly(c, [[x - 70, y - 50], [x, y - 36], [x, y + 60], [x - 70, y + 46]], '#C9B48A', '#6D5A3A', 2);
    poly(c, [[x + 70, y - 50], [x, y - 36], [x, y + 60], [x + 70, y + 46]], '#E0CDA4', '#6D5A3A', 2);
    for (let k = 0; k < 5; k++) { line(c, [[x - 58, y - 28 + k * 15], [x - 12, y - 18 + k * 15]], 'rgba(80,64,40,0.55)', 1.5); line(c, [[x + 12, y - 18 + k * 15], [x + 58, y - 28 + k * 15]], 'rgba(80,64,40,0.55)', 1.5); }
    line(c, [[x + 30, y + 40], [x + 86, y - 40]], '#EFE3D4', 2.5); poly(c, [[x + 86, y - 40], [x + 98, y - 28], [x + 66, y + 4]], 'rgba(239,227,212,0.8)');
  });
}
function summitArt(stage, t, ctx, b, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const apex = [b.x + b.w * 0.6, b.y + b.h * 0.42], cloudY = b.y + b.h * 0.66, [fx] = flow(SLOW * t);
  const sv = [b.x + 74, b.y + 60], ss = [b.x + b.w - 66, b.y + 56], s50 = sOf(40);
  const bvF = tt => starSeen(tt, 40, s50, 33, 140), bsF = tt => starSeen(tt, 40, S_SUMMIT * s50, 33, 140);
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 12); c.clip();
    const g = c.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, '#020812'); g.addColorStop(0.6, '#081625'); g.addColorStop(1, '#0E2030'); c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h);
    for (let i = 0; i < 90; i++) { const x = b.x + rand(i * 2.7) * b.w, y = b.y + rand(i * 4.3 + 1) * b.h * 0.55; c.fillStyle = rgba('#E6EEFA', 0.2 + 0.5 * rand(i * 1.9)); c.fillRect(x, y, 1.5, 1.5); }
    // mountain (far ridge + the peak), a soft moonlit edge on the right slope
    poly(c, [[b.x - 10, b.y + b.h * 0.78], [b.x + b.w * 0.15, b.y + b.h * 0.7], [b.x + b.w * 0.3, b.y + b.h * 0.74], [b.x + b.w * 0.36, b.y + b.h], [b.x - 10, b.y + b.h]], '#0F1B26');
    const mt = [[b.x + b.w * 0.18, b.y + b.h], [b.x + b.w * 0.38, b.y + b.h * 0.62], [b.x + b.w * 0.5, b.y + b.h * 0.5], apex, [b.x + b.w * 0.68, b.y + b.h * 0.47], [b.x + b.w * 0.86, b.y + b.h * 0.66], [b.x + b.w + 10, b.y + b.h * 0.82], [b.x + b.w + 10, b.y + b.h]];
    const mg = c.createLinearGradient(apex[0] - 200, 0, apex[0] + 200, 0); mg.addColorStop(0, '#1B2733'); mg.addColorStop(1, '#2F3D4A'); poly(c, mt, mg);
    line(c, [[apex[0] - 46, apex[1] + 30], apex, [apex[0] + 34, apex[1] + 14], [apex[0] + 60, apex[1] + 26]], 'rgba(225,235,245,0.55)', 2.5);
    // shimmering air below the cloud sea (warm / cold pockets over the valley), calm air above
    pocketField(stage, 'newtonAir', {x: b.x, y: cloudY + 10, w: b.w, h: b.y + b.h - cloudY - 10}, (x, y) => [x * 0.1, y * 0.1], t, {a: 0.55, rate: SLOW * 2});
    // the cloud sea: drifting lobes, lit from above
    for (let k = 0; k < 30; k++) { const x = b.x + ((k * 41 + fx * 0.6) % (b.w + 160)) - 80, y = cloudY + 8 * Math.sin(k * 1.7); glow(c, x, y, 64 + 18 * rand(k), '#C6D2DD', 0.22); }
    const cg = c.createLinearGradient(0, cloudY - 10, 0, cloudY + 70); cg.addColorStop(0, 'rgba(190,205,218,0.0)'); cg.addColorStop(0.35, 'rgba(190,205,218,0.30)'); cg.addColorStop(1, 'rgba(120,140,160,0.06)'); c.fillStyle = cg; c.fillRect(b.x, cloudY - 10, b.w, 80);
    // a long telescope of the period on the summit, aimed at the right star (appears on "망원경을")
    const tA = fadeIn(t, at(A.scope) - 0.1, 0.5), ang = Math.atan2(ss[1] - apex[1], ss[0] - apex[0]);
    withAlpha(c, tA, () => {
      const p = [apex[0], apex[1] - 26];
      line(c, [[p[0] - 18, apex[1] + 2], p, [p[0] + 18, apex[1] + 2]], '#9AA7B2', 2.5);
      c.save(); c.translate(p[0], p[1]); c.rotate(ang); rect(c, -34, -5, 140, 10, 3, '#C9D2D8'); rect(c, 100, -7, 12, 14, 2, '#E8EEF1'); c.restore();
    });
    // the valley observer (under the clouds)
    const vo = [b.x + b.w * 0.12, b.y + b.h - 34]; circle(c, vo[0], vo[1], 5, '#EFE3D4'); line(c, [[vo[0], vo[1]], [vo[0], vo[1] + 22]], '#EFE3D4', 2);
    // the same star seen from the valley and from the summit (twinkle strength from the model: less air above the summit)
    const bv = bvF(t), bs = bsF(t);
    drawStar(c, sv[0], sv[1], 3.4, '#EAF0FF', [bv, bv, bv]); drawStar(c, ss[0], ss[1], 3.4, '#EAF0FF', [bs, bs, bs]);
    c.restore();
    const vA = fadeIn(t, at(A.shake) - 0.1, 0.5), cA = fadeIn(t, at(A.calm) - 0.1, 0.5);
    withAlpha(c, vA, () => { tag(stage, '골짜기에서 본 별', sv[0] + 34, sv[1], {size: 24, color: T.ink, align: 'left', plateA: 0.6}); spark(stage, sv[0] + 24, sv[1] + 22, 230, 60, bvF, t, {win: 3, yMax: 3.2, col: PAL.star, mean: true}); });
    withAlpha(c, cA, () => { tag(stage, '산꼭대기에서 본 별', ss[0] - 34, ss[1], {size: 24, color: T.ink, align: 'right', plateA: 0.6}); spark(stage, ss[0] - 254, ss[1] + 22, 230, 60, bsF, t, {win: 3, yMax: 3.2, col: PAL.star, mean: true}); });
    tag(stage, '구름 아래 · 떨리는 공기', b.x + b.w * 0.56, b.y + b.h - 40, {size: 24, color: PAL.warm, a: vA});
    tag(stage, '구름 위 · 고요한 공기', b.x + b.w * 0.3, apex[1] + 40, {size: 24, color: PAL.cold, a: cA});
    rect(c, b.x, b.y, b.w, b.h, 12, null, rgba(T.border, 1), 1.5);
  });
}

// stubs filled below
function rampEase(q, r = 0.15) { q = clamp(q); const v = 1 / (1 - r); if (q < r) return v * q * q / (2 * r); if (q > 1 - r) return 1 - v * (1 - q) ** 2 / (2 * r); return v * (q - r / 2); }
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model), sig = modelSignature(ctx.tl);
  if (!e?.model || e.model.sig !== sig) console.warn('warning: sound tables in sound.json are stale — run node episodes/twinkle/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  let h = 0; for (const t of [1.3, 7.7, 30.1, 72.2, 95.5, 121.9]) h += SIG.cells(t) * 1000 + SIG.hookStar(t) * 100 + SIG.low(t, 1) * 10;
  return `${h.toFixed(3)}@${tl.duration.toFixed(3)}/${tl.at(A.persec).toFixed(3)}`;
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  hook(stage, t, p, ctx) {
    checkSoundTable(ctx);
    const j = journeyTimes(ctx.tl), ef = endFade(t, ctx), zq = clamp((t - j.dive0) / (j.dive1 - j.dive0));
    const skyA = 1 - smooth((zq - 0.45) / 0.55);                        // full sky at t = 0 (first frame = thumbnail)
    if (skyA > 0) hookSky(stage, t, ctx, skyA, zq);
    const bA = smooth((zq - 0.4) / 0.6) * ef;
    if (bA > 0) beamJourney(stage, t, ctx, bA);
  },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  cells(stage, t, p, ctx) { cellsScene(stage, t, ctx); },
  point(stage, t, p, ctx) { pointScene(stage, t, ctx); },
  horizon(stage, t, p, ctx) { horizonScene(stage, t, ctx); },
  use(stage, t, p, ctx) { useScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

function originScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('origin'), ef = endFade(t, ctx);
  drawSky(stage, t, {cam: HOOK_CAM, a: 0.45 * fadeIn(t, sc.start, 0.4) * ef, dAz: 0.5, dEl: 0.1, par: -34});
  const aA = fadeIn(t, sc.start + 0.03, 0.4) * fadeOut(t, at('s03:end') + 0.35, 0.45);
  if (aA > 0) withAlpha(c, aA, () => {
    // card 1: twinkle
    const on1 = fadeIn(t, at(A.eye) - 0.1, 0.4);
    rect(c, 140, 318, 800, 270, 14, rgba(T.plate, 0.9), on1 > 0.5 ? rgba(T.light, 0.7) : rgba(T.border, 1), 2);
    stage.text('twinkle', 180, 382, {role: 'display', size: 64, weight: 700, color: T.ink});
    stage.text('트윙클 · 영어', 180, 440, {size: 26, weight: 500, color: T.muted, alpha: fadeIn(t, at(A.tw) - 0.1, 0.4)});
    stage.text('← 옛 영어 twinclian', 180, 494, {size: 30, weight: 700, color: T.light, alpha: fadeIn(t, at(A.oldW) - 0.3, 0.4)});
    stage.text('= 눈을 깜빡이다', 180, 546, {size: 32, weight: 700, color: T.ink, alpha: on1});
    const b = SIG.hookStar(t), bc = [SIG.hookStarCh(t, -1), b, SIG.hookStarCh(t, 1)];
    drawStar(c, 820, 420, 3.4, '#EAF2FF', bc, {glow: 1.3});
    spark(stage, 700, 470, 230, 80, SIG.hookStar, t, {win: 3, yMax: 3.2, col: PAL.star, mean: true});
    // card 2: scintillation
    const c2 = fadeIn(t, at(A.astro) - 0.2, 0.5), on2 = fadeIn(t, at(A.spark) - 0.1, 0.4);
    withAlpha(c, c2, () => {
      rect(c, 140, 616, 800, 270, 14, rgba(T.plate, 0.9), on2 > 0.5 ? rgba(PAL.warm, 0.7) : rgba(T.border, 1), 2);
      stage.text('천문학 용어', 180, 664, {size: 26, weight: 500, color: T.muted});
      stage.text('scintillation', 180, 724, {role: 'display', size: 58, weight: 700, color: T.ink, alpha: fadeIn(t, at(A.scint) - 0.2, 0.4) * 0.75 + 0.25});
      stage.text('← 라틴어 scintilla', 180, 790, {size: 30, weight: 700, color: PAL.warm, alpha: fadeIn(t, at(A.latin) - 0.1, 0.4)});
      stage.text('= 불꽃 · 튀는 불티', 180, 842, {size: 32, weight: 700, color: T.ink, alpha: on2});
      // sparks: tiny points flickering with the same model (independent patches of air)
      for (let k = 0; k < 9; k++) { const x = 800 + 80 * Math.cos(k * 2.4) * rand(k + 0.3), y = 760 + 70 * Math.sin(k * 2.4) * rand(k + 1.7), bb = starSeen(t, 25, sOf(25), 20 + k * 23, 40 + k * 17);
        glow(c, x, y, 10 + 6 * Math.min(bb, 3), '#FFC27A', 0.25 * Math.min(bb, 3) * on2); circle(c, x, y, 1.6, rgba('#FFE7C2', clamp(0.3 + 0.35 * bb) * on2)); }
    });
    // what the word means in astronomy: the star's brightness flickering quickly
    const dA = fadeIn(t, at(A.scint) - 0.2, 0.5);
    withAlpha(c, dA, () => {
      rect(c, 140, 930, 800, 330, 14, rgba(T.plate, 0.88), rgba(T.border, 1), 1.5);
      stage.text('신틸레이션 = 별빛 밝기가 빠르게 출렁이는 현상', 540, 976, {size: 28, weight: 700, color: T.ink, align: 'center'});
      traceBox(stage, {x: 180, y: 1010, w: 720, h: 200}, SIG.hookStar, t, {win: 4, log: SKYLOG, col: PAL.star, frame: false, t0: at(A.scint) - 1.2});
      stage.text('밝기', 196, 1032, {size: 24, color: T.muted});
      stage.text('시간 →', 884, 1232, {size: 24, color: T.muted, align: 'right'});
    });
  });
  const bA = fadeIn(t, at('s04') - 0.55, 0.6) * ef;
  if (bA > 0) withAlpha(c, bA, () => {
    rect(c, 140, 300, 800, 220, 14, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
    bookIcon(c, 270, 418, 1);
    stage.text('아이작 뉴턴', 400, 370, {role: 'display', size: 40, weight: 700, color: T.ink});
    stage.text('『광학 (Opticks)』', 400, 428, {size: 32, weight: 700, color: T.light});
    stage.text('빛과 색을 다룬 책', 400, 476, {size: 24, weight: 500, color: T.muted});
    const q1 = fadeIn(t, at(A.shake) - 0.2, 0.5), q2 = fadeIn(t, at(A.peak) - 0.2, 0.5);
    rect(c, 140, 540, 800, 170, 14, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
    stage.text('별빛이 지나는 공기는 끊임없이 떨린다', 540, 592, {size: 30, weight: 700, color: PAL.warm, align: 'center', alpha: q1});
    stage.text('처방: 가장 높은 산꼭대기,', 540, 640, {size: 30, weight: 700, color: PAL.cold, align: 'center', alpha: q2});
    stage.text('구름 위의 고요한 공기', 540, 684, {size: 30, weight: 700, color: PAL.cold, align: 'center', alpha: fadeIn(t, at(A.calm) - 0.2, 0.5)});
    summitArt(stage, t, ctx, {x: 140, y: 730, w: 800, h: 580}, fadeIn(t, at(A.scope) - 0.4, 0.6));
  });
}

// =====================================================================================================
// essence: a cold pocket gathers light, a warm one spreads it; mixed pockets = moving lenses
// =====================================================================================================
function essenceScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('essence');
  const a0 = fadeIn(t, sc.start + 0.03, 0.4), G = SEC_E;
  const blobA = easeInOut((t - at(A.temp) + 0.2) / 1.0), m = easeInOut((t - at(A.mixW) + 0.1) / 1.6);
  const sv = secValue(G, t, blobA, m);
  withAlpha(c, a0, () => {
    rect(c, 132, 292, 816, 708, 14, rgba('#020A12', 0.72), rgba(T.border, 1), 1.5);
    const tr = drawSection(stage, t, {...G, K: secK(m)}, sv, {m, key: 'secE'});
    const yc = (G.ys0 + G.ys1) / 2, lA = fadeIn(t, at(A.diffT) - 0.1, 0.4) * (1 - smooth((m - 0.1) / 0.4));
    if (lA > 0) withAlpha(c, lA, () => {
      tag(stage, '찬 공기', 380, yc, {size: 28, color: PAL.cold, plateA: 0.55});
      tag(stage, '따뜻한 공기', 700, yc, {size: 28, color: PAL.warm, plateA: 0.55});
      const gA = fadeIn(t, at(A.bend) - 0.1, 0.4);
      // where the rays from each pocket land: gathered (bright) below the cold one, spread (dim) below the warm one
      withAlpha(c, gA, () => { tag(stage, '모임 → 밝음', 380, G.yG - 30, {size: 26, color: PAL.light, border: PAL.light}); tag(stage, '퍼짐 → 어두움', 700, G.yG - 30, {size: 26, color: T.muted}); });
    });
    // moving lenses: follow one focus on the ground as the pockets drift
    const mvA = fadeIn(t, at(A.moving) - 0.1, 0.5);
    if (mvA > 0) withAlpha(c, mvA, () => {
      arrow(c, [760, 342], [900, 342], rgba(T.ink, 0.85), 3, {head: 12}); stage.text('바람', 750, 342, {size: 24, weight: 700, color: T.ink, align: 'right'});
      let bx = 540, bI = 0; for (let x = 200; x <= 880; x += 4) { const I = tr.Iat(x); if (I > bI) { bI = I; bx = x; } }
      ring(c, bx, G.yG + 4, 22, rgba(PAL.light, 0.85), 2.5);
      tag(stage, '밝은 곳이 옮겨 다닌다', tagX(stage, '밝은 곳이 옮겨 다닌다', bx, 24), G.yG - 40, {size: 24, color: PAL.light, a: fadeIn(t, at(A.starlight) - 0.1, 0.4)});
    });
    tag(stage, '꺾이는 정도는 크게 과장', 160, G.ys0 - 20, {size: 24, align: 'left', color: T.muted, plateA: 0.6, a: fadeIn(t, at(A.lightE) - 0.1, 0.5)});
  });
  // the first principle, in words (the card stays into the cells scene, where its last line changes)
  const r1 = fadeIn(t, at(A.airE) - 0.1, 0.5), r2 = fadeIn(t, at(A.bend) - 0.2, 0.5), r3 = fadeIn(t, at(A.lens) - 0.2, 0.5);
  principleCard(stage, a0 * Math.max(r1, 0.001), r2, [[r3, '덩어리가 섞이며 흘러간다 = 움직이는 렌즈']]);
}
function principleCard(stage, a, r2, last) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    panel(c, T, 140, 1030, 800, 290, 0.92);
    rect(c, 172, 1070, 26, 26, 5, PAL.cold); stage.text('찬 공기 · 더 빽빽 · 굴절률 조금 큼', 214, 1084, {size: 28, weight: 700, color: T.ink});
    stage.text('→ 빛을 모은다 (볼록렌즈처럼)', 214, 1128, {size: 26, weight: 700, color: PAL.cold, alpha: r2});
    rect(c, 172, 1166, 26, 26, 5, PAL.warm); stage.text('따뜻한 공기 · 덜 빽빽 · 굴절률 조금 작음', 214, 1180, {size: 28, weight: 700, color: T.ink});
    stage.text('→ 빛을 흩는다 (오목렌즈처럼)', 214, 1224, {size: 26, weight: 700, color: PAL.warm, alpha: r2});
    for (const [al, txt] of last) if (al > 0) stage.text(txt, 540, 1284, {size: 28, weight: 700, color: T.light, align: 'center', alpha: al});
  });
}

// =====================================================================================================
// cells: ① section (pockets, rays, ground pattern) ② ground from above + pupil ③ brightness through the pupil
// =====================================================================================================
const GRAPH = {x: 140, y: 1034, w: 800, h: 286};
let PEAKS = null;
function realStrip(tl) {
  if (PEAKS && PEAKS.tl === tl) return PEAKS;
  const ts = tl.at(A.persec) - 0.05, tau0 = SLOW * ts, f = tau => SIG.cellsReal(tau), pk = [];
  let a = f(tau0), b = f(tau0 + 0.001);
  for (let k = 2; k <= 1000; k++) { const cc = f(tau0 + k * 0.001); if (b > a && b >= cc && b > 1) pk.push((k - 1) * 0.001); a = b; b = cc; }
  PEAKS = {tl, ts, tau0, pk};
  return PEAKS;
}
function cellsScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('cells'), ef = endFade(t, ctx), tl = ctx.tl;
  const mq = easeInOut((t - sc.start) / 1.3), G = lerpSec(SEC_E, SEC_C, mq), sv = secValue(G, t, 0, 1);
  // tier 1: the section (continues from the essence picture)
  rect(c, 132, lerp(292, 282, mq), 816, lerp(708, 426, mq), 14, rgba('#020A12', 0.72), rgba(T.border, 1), 1.5);
  const tr = drawSection(stage, t, {...G, K: secK(1)}, sv, {m: 1, key: 'secC', a: ef});
  withAlpha(c, ef, () => {
    const lA = fadeIn(t, at(A.warm) - 0.1, 0.4), cA = fadeIn(t, at(A.cold) - 0.1, 0.4), dA = fadeIn(t, at(A.dens) - 0.1, 0.4);
    const legend = fadeOut(t, at(A.wind) - 0.3, 0.4);
    withAlpha(c, legend, () => {
      tag(stage, '따뜻한 공기 · 덜 빽빽', 160, G.ys0 + 18, {size: 24, align: 'left', color: PAL.warm, a: lA, plateA: 0.75});
      tag(stage, '찬 공기 · 더 빽빽', 920, G.ys0 + 18, {size: 24, align: 'right', color: PAL.cold, a: cA, plateA: 0.75});
      tag(stage, '그림의 꺾임은 크게 과장', 540, G.ys1 + 34, {size: 24, color: T.muted, a: fadeIn(t, at(A.tiny) - 0.1, 0.4), plateA: 0.75});
    });
    // wind; one pocket tracked as it drifts (frozen flow: everything moves together)
    const wA = fadeIn(t, at(A.wind) - 0.1, 0.4);
    if (wA > 0) withAlpha(c, wA, () => { arrow(c, [770, G.ys0 - 18], [910, G.ys0 - 18], rgba(T.ink, 0.9), 3, {head: 12}); stage.text('바람', 760, G.ys0 - 18, {size: 24, weight: 700, color: T.ink, align: 'right'}); });
    const pT = at(A.palm) - 0.15, pA = fadeIn(t, pT, 0.4) * fadeOut(t, at(A.gather) - 0.3, 0.4);
    if (pA > 0) withAlpha(c, pA, () => {
      const px = 330 + V_WIND * WX * SLOW * (t - pT) / G.cm, py = G.ys0 + 0.52 * (G.ys1 - G.ys0);
      ring(c, px, py, 52, rgba(T.ink, 0.85), 2.5);
      tag(stage, '손바닥만 한 덩어리 · 약 10 cm', tagX(stage, '손바닥만 한 덩어리 · 약 10 cm', px, 24), py - 78, {size: 24, color: T.ink});
    });
    // where the rays are gathered (bright) / spread (dark) right now
    const gA = fadeIn(t, at(A.gather) - 0.1, 0.4) * fadeOut(t, at(A.pupil) - 0.4, 0.4), sA = fadeIn(t, at(A.scatter) - 0.1, 0.4) * fadeOut(t, at(A.pupil) - 0.4, 0.4);
    if (gA > 0 || sA > 0) {
      let bx = 540, bI = 0, dx = 540, dI = 9; for (let x = 200; x <= 880; x += 4) { const I = tr.Iat(x); if (I > bI) { bI = I; bx = x; } if (I < dI) { dI = I; dx = x; } }
      withAlpha(c, gA, () => { ring(c, bx, G.yG + 5, 18, rgba(PAL.light, 0.9), 2.5); tag(stage, '모음 → 밝음', tagX(stage, '모음 → 밝음', bx, 24), G.yG - 30, {size: 24, color: PAL.light}); });
      withAlpha(c, sA, () => { ring(c, dx, G.yG + 5, 18, rgba(T.muted, 0.9), 2.5); tag(stage, '흩음 → 어두움', tagX(stage, '흩음 → 어두움', dx, 24), G.yG - (Math.abs(dx - bx) < 230 ? 72 : 30), {size: 24, color: T.ink}); });
    }
  });
  // the first-principle card from the essence scene stays until the graph takes its place; its last line now quantifies
  { const dA = fadeIn(t, at(A.dens) - 0.1, 0.4), cardA = ef * fadeOut(t, at(A.passes) - 0.9, 0.5);
    if (cardA > 0) principleCard(stage, cardA, 1, [[1 - dA, '덩어리가 섞이며 흘러간다 = 움직이는 렌즈'], [dA, '온도 1 °C 차이 → 굴절률 약 100만분의 1 차이']]); }
  // tier 2: the ground seen from above (the same pattern, now in two dimensions)
  const gpA = fadeIn(t, at(A.ground) - 0.2, 0.7) * ef;
  if (gpA > 0) {
    groundPlane(stage, t, S_REF, gpA);
    withAlpha(c, gpA, () => {
      tag(stage, '땅 위의 빛 무늬 · 위에서 본 모습', 400, GP.yF - 22, {size: 24, color: T.ink, plateA: 0.7});
      const wA = fadeIn(t, at(A.pattern) - 0.1, 0.4);
      withAlpha(c, wA, () => { const p0 = groundToScreen(12, 19.5), p1 = groundToScreen(27, 20.5); arrow(c, [p0[0], p0[1]], [p1[0], p1[1]], rgba(T.ink, 0.9), 3, {head: 12}); stage.text('바람', p0[0] - 10, p0[1], {size: 24, weight: 700, color: T.ink, align: 'right'}); });
      // the pupil (to scale: 7 mm) and the pattern scale
      const pu = groundToScreen(0, 0), rx = PUPIL / 2 / GP.gxHalf * GP.hwN / pu[2], B = SIG.cells(t), puA = fadeIn(t, at(A.pupil) - 0.15, 0.4);
      if (puA > 0) withAlpha(c, puA, () => {
        glow(c, pu[0], pu[1], 30 + 10 * Math.min(B, 3), '#FFF3D6', 0.18 + 0.12 * Math.min(B, 3));
        c.save(); c.translate(pu[0], pu[1]); c.scale(1, 0.55); ring(c, 0, 0, Math.max(rx, 3), '#FFFFFF', 2.5); ring(c, 0, 0, 26, rgba(PAL.cold, 0.95), 2.5); c.restore();
        line(c, [[pu[0] + 24, pu[1] - 10], [pu[0] + 90, pu[1] - 64]], rgba(PAL.cold, 0.9), 2);
        tag(stage, '눈동자 약 7 mm', pu[0] + 96, pu[1] - 72, {size: 26, align: 'left', color: PAL.cold, border: PAL.cold});
      });
      const scA = fadeIn(t, at(A.smaller) - 0.1, 0.4);
      if (scA > 0) withAlpha(c, scA, () => {
        const q0 = groundToScreen(-30, -8.2), q1 = groundToScreen(-25, -8.2);
        line(c, [[q0[0], q0[1] - 8], [q0[0], q0[1]], [q1[0], q1[1]], [q1[0], q1[1] - 8]], PAL.light, 2.5);
        tag(stage, '5 cm · 무늬는 수 cm', q0[0] - 4, q0[1] - 30, {size: 24, align: 'left', color: PAL.light, plateA: 0.75});
      });
    });
  }
  // tier 3: the brightness through the pupil (rolling graph), then one real second
  const g0 = at(A.passes) - 0.25, gA = fadeIn(t, g0, 0.5) * ef, rs = realStrip(tl), stripA = fadeIn(t, rs.ts - 0.25, 0.3);
  if (gA > 0) withAlpha(c, gA, () => {
    rect(c, GRAPH.x, GRAPH.y, GRAPH.w, GRAPH.h, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
    stage.text('눈에 들어오는 별빛 밝기', GRAPH.x + 20, GRAPH.y + 30, {size: 26, weight: 700, color: T.ink});
    withAlpha(c, 1 - stripA, () => {
      stage.text('느린 화면 · 실제의 1/20 속도', GRAPH.x + GRAPH.w - 20, GRAPH.y + 30, {size: 24, color: T.muted, align: 'right'});
      traceBox(stage, {x: GRAPH.x + 10, y: GRAPH.y + 50, w: GRAPH.w - 20, h: GRAPH.h - 90}, SIG.cells, t, {win: 6, yMax: 4.2, col: PAL.star, frame: false, t0: g0});
      stage.text('밝음', GRAPH.x + 24, GRAPH.y + 70, {size: 24, color: T.muted}); stage.text('어두움', GRAPH.x + 24, GRAPH.y + GRAPH.h - 56, {size: 24, color: T.muted});
      stage.text('시간 →', GRAPH.x + GRAPH.w - 20, GRAPH.y + GRAPH.h - 22, {size: 24, color: T.muted, align: 'right'});
    });
    if (stripA > 0) withAlpha(c, stripA, () => {
      const q = clamp((t - rs.ts) / 1.0), x0 = GRAPH.x + 40, w = GRAPH.w - 80, y0 = GRAPH.y + 60, h = GRAPH.h - 120, Y = v => y0 + h - h * clamp(v / 4.2);
      stage.text('실제 속도 · 1초', GRAPH.x + GRAPH.w - 20, GRAPH.y + 30, {size: 24, color: PAL.light, align: 'right'});
      line(c, [[x0, Y(1)], [x0 + w, Y(1)]], rgba(T.muted, 0.45), 1.2, {dash: [5, 6]});
      const pts = []; for (let k = 0; k <= 1000 * q; k += 2) pts.push([x0 + w * k / 1000, Y(SIG.cellsReal(rs.tau0 + k / 1000))]);
      if (pts.length > 1) line(c, pts, PAL.star, 1.8);
      let n = 0; for (const p of rs.pk) { if (p > q) break; n++; const x = x0 + w * p; line(c, [[x, y0 - 6], [x, y0 + 4]], PAL.light, 2); }
      for (const [k, s0] of [[0, '0'], [0.5, '0.5초'], [1, '1초']]) stage.text(s0, x0 + w * k, GRAPH.y + GRAPH.h - 26, {size: 24, color: T.muted, align: k === 0 ? 'left' : k === 1 ? 'right' : 'center'});
      tag(stage, `밝아진 횟수 ${n}번`, 540, GRAPH.y + GRAPH.h - 28, {size: 26, color: PAL.light, border: PAL.light});
    });
  });
}

// =====================================================================================================
// point: the same pupil and pattern for a star (point), a planet (small disc) and the Moon (wide disc)
// =====================================================================================================
const hexDisc = n => { const P = [[0, 0]]; for (let r = 1; r <= n; r++) for (let k = 0; k < 6 * r; k++) { const a = k / (6 * r) * TAU + r * 0.3; P.push([r / n * 0.92 * Math.cos(a), r / n * 0.92 * Math.sin(a)]); } return P; };
const SUBJ = hexDisc(2), SUBM = hexDisc(3);                            // 19 / 37 sample points of the discs (shown; the averages use the full disc)
const subB = (t, R, p) => starB(t, {s: S_REF, x0: PUP.x + p[0] * R, y0: PUP.y + p[1] * R});
const COLS = [{x: 270, id: 'star'}, {x: 540, id: 'planet'}, {x: 810, id: 'moon'}];
const PT = {tileY: 300, tileH: 252, bandY0: 694, bandY1: 772, pupY: 866, lane0: 904, laneH: 122, laneGap: 12};
let MOONTEX = null;
function moonTexture(stage) {
  if (MOONTEX) return MOONTEX;
  const S = 512, cv = new stage.canvas.constructor(S, S), c = cv.getContext('2d'), img = c.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = (i + 0.5) / S * 2 - 1, y = (j + 0.5) / S * 2 - 1, r2 = x * x + y * y, k = (j * S + i) * 4; if (r2 > 1) { d[k + 3] = 0; continue; }
    const z = Math.sqrt(1 - r2), mu = clamp(0.25 * x - 0.15 * y + 0.95 * z), lon = Math.atan2(x, z), lat = Math.asin(-y);
    const mare = smooth((fbm2(lon * 2.2 + 3, lat * 2.2 + 1, 5, 5) - 0.5) / 0.12), crat = fbm2(lon * 9, lat * 9, 8, 3), ray = Math.exp(-(((lon - 0.15) ** 2 + (lat + 0.75) ** 2) / 0.004));
    let v = lerp(0.86, 0.55, mare * 0.85) * (0.88 + 0.24 * crat) + 0.25 * ray;
    v *= 0.55 + 0.45 * mu ** 0.6;
    d[k] = 236 * v; d[k + 1] = 233 * v; d[k + 2] = 226 * v; d[k + 3] = 255 * clamp((1 - Math.sqrt(r2)) * S / 2);
  }
  c.putImageData(img, 0, 0); MOONTEX = cv; return cv;
}
function jupiterDisc(c, x, y, r) {
  c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  const bands = ['#E9D9BC', '#C9A27A', '#EFE3CB', '#B98D66', '#F1E6D0', '#CDA983', '#E7D7BB', '#BE966F', '#E9DCC3'];
  for (let k = 0; k < bands.length; k++) { c.fillStyle = bands[k]; c.fillRect(x - r, y - r + k * 2 * r / bands.length, 2 * r, 2 * r / bands.length + 1); }
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.2, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,8,6,0.55)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  circle(c, x + r * 0.25, y + r * 0.22, r * 0.12, 'rgba(190,110,80,0.6)');
  c.restore();
}
/** limb displacement (px per unit gain) of the Moon at limb angle φ: angle of arrival from the POCK slope where that
 *  limb point's light crosses the layer (2.3 m apart for neighbouring degrees → independent), lightly smoothed */
function limbWobble(t, phi) {
  const [fx, fy] = flow(SLOW * t), R = footR(SIZE.moon); let a = 0;
  for (let k = -3; k <= 3; k++) {
    const p = phi + k * 2 * D2R, cx = Math.cos(p), sy = Math.sin(p), X = PUP.x + R * cx - fx, Y = PUP.y + R * sy - fy;
    a += ((samp(POCK, X + 1.5 * cx, Y + 1.5 * sy) - samp(POCK, X - 1.5 * cx, Y - 1.5 * sy)) / 3) * (1 - Math.abs(k) / 4);
  }
  return a / 4;
}
function pointScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('point'), ef = endFade(t, ctx);
  const colA = [fadeIn(t, sc.start + 0.03, 0.45), fadeIn(t, at(A.planet) - 0.3, 0.6), fadeIn(t, at(A.moonP) - 0.3, 0.6)];
  const zoom = easeInOut((t - at(A.limb) + 0.35) / 1.3), others = 1 - smooth(zoom / 0.5);
  const sig = [SIG.cells, SIG.planet, SIG.moon];
  // the star column starts centred and slides left when the planet arrives (centred composition throughout)
  const X = [lerp(540, 270, easeInOut((t - at(A.planet) + 0.9) / 0.9)), 540, 810];
  const RJ = footR(SIZE.jupiter), RM = footR(SIZE.moon), subA = fadeIn(t, at(A.discPts) - 0.1, 0.5), subMA = fadeIn(t, at(A.avg) - 0.3, 0.5);
  // ---- tiles: the three sources as seen in the sky ----
  for (let i = 0; i < 3; i++) {
    const col = COLS[i], a = colA[i] * ef * (i === 2 ? 1 : others); if (a <= 0) continue;
    withAlpha(c, a, () => {
      const x0 = X[i] - 120, y0 = PT.tileY, cy = y0 + PT.tileH / 2 - 8;
      if (i < 2 || zoom < 0.02) {
        rect(c, x0, y0, 240, PT.tileH, 12, '#030A12', rgba(T.border, 1), 1.5);
        for (let k = 0; k < 22; k++) { c.fillStyle = rgba('#DDE6F4', 0.2 + 0.4 * rand(k * 3.3 + i)); c.fillRect(x0 + 8 + rand(k * 1.7 + i * 5) * 224, y0 + 8 + rand(k * 2.9 + i * 7) * (PT.tileH - 16), 1.4, 1.4); }
      }
      if (i === 0) { const b = sig[0](t); drawStar(c, X[i], cy - 14, 7, '#EAF2FF', [b, b, b], {glow: 1.5}); }
      if (i === 1) {
        const b = sig[1](t); glow(c, X[i], cy - 14, 90, '#F2DDB4', 0.12 * b); jupiterDisc(c, X[i], cy - 14, 46);
        if (subA > 0) withAlpha(c, subA, () => { for (const p of SUBJ) { const bb = subB(t, RJ, p); glow(c, X[i] + p[0] * 44, cy - 14 + p[1] * 44, 3 + 3 * Math.min(bb, 3), '#FFFFFF', clamp(0.12 + 0.28 * bb, 0, 0.9)); } });
      }
    });
  }
  // the Moon (tile → close-up of the limb)
  if (colA[2] > 0) withAlpha(c, colA[2] * ef, () => {
    const cx = lerp(810, 540, zoom), cy = lerp(PT.tileY + PT.tileH / 2 - 22, 600, zoom), r = lerp(76, 255, zoom), tex = moonTexture(stage);
    glow(c, cx, cy, r * 1.6, '#DCE3EC', 0.16);
    if (zoom > 0.02) {
      // the limb drawn with its shimmer (exaggerated), the disc brightness unchanged
      const gain = 16 * smooth((zoom - 0.3) / 0.7) * r / 255, pts = [];
      for (let k = 0; k <= 180; k++) { const ph = k / 180 * TAU, rr = r + gain * limbWobble(t, ph); pts.push([cx + rr * Math.cos(ph), cy + rr * Math.sin(ph)]); }
      c.save(); c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.clip();
      c.drawImage(tex, cx - r - 12, cy - r - 12, 2 * r + 24, 2 * r + 24); c.restore();
      line(c, pts, 'rgba(255,250,236,0.35)', 1.5);
    } else c.drawImage(tex, cx - r, cy - r, 2 * r, 2 * r);
    if (subMA > 0 && zoom < 0.5) withAlpha(c, subMA * (1 - zoom * 2), () => { for (const p of SUBM) { const bb = subB(t, RM, p); glow(c, cx + p[0] * r, cy + p[1] * r, 3 + 3 * Math.min(bb, 3), '#FFFFFF', clamp(0.1 + 0.22 * bb, 0, 0.8)); } });
    if (zoom > 0.6) {
      const zA = smooth((zoom - 0.6) / 0.4);
      tag(stage, '가장자리만 일렁임 (크게 과장)', 540, 600 - 255 - 34, {size: 26, color: PAL.light, border: PAL.light, a: zA * fadeIn(t, at(A.haze) - 0.2, 0.5)});
      tag(stage, '원반 전체 밝기는 그대로', 540, 600 + 255 + 18, {size: 26, color: PAL.moon, a: zA});
    }
  });
  // ---- labels under the tiles ----
  const L = [['별 · 점', '약 0.005″', A.size], ['목성 · 작은 원반', '30~50″', A.disc], ['달 · 넓은 원반', '약 1,900″', A.wide]];
  for (let i = 0; i < 3; i++) {
    const a = colA[i] * ef * others; if (a <= 0) continue;
    withAlpha(c, a, () => {
      stage.text(L[i][0], X[i], PT.tileY + PT.tileH - 46, {size: 26, weight: 700, color: [T.light, PAL.planet, PAL.moon][i], align: 'center'});
      stage.text(L[i][1], X[i], PT.tileY + PT.tileH - 16, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(L[i][2]) - 0.1, 0.4)});
    });
  }
  const xA = fadeIn(t, at(A.wide) - 0.1, 0.4) * others * ef;
  if (xA > 0) tag(stage, '달 · 태양 = 별의 수십만 배', tagX(stage, '달 · 태양 = 별의 수십만 배', 810, 24), PT.tileY - 22, {size: 24, color: PAL.moon, a: xA, plateA: 0.9});
  // ---- beams: each source point's light crosses the moving air at its own place, then reaches the same pupil ----
  const bandA = colA[0] * ef * others;
  if (bandA > 0) withAlpha(c, bandA, () => {
    pocketField(stage, 'ptBand', {x: 140, y: PT.bandY0 - 16, w: 800, h: PT.bandY1 - PT.bandY0 + 32}, (x, y) => [x * 0.12, (y - PT.bandY0) * 0.12 + 40], t,
      {a: 0.85, env: (x, y) => smooth((y - PT.bandY0 + 16) / 24) * smooth((PT.bandY1 + 16 - y) / 24)});
    stage.text('움직이는 공기', 405, PT.bandY0 - 30, {size: 24, weight: 700, color: T.muted, align: 'center'});
    tag(stage, '각도 크게 과장', 928, PT.bandY0 - 30, {size: 24, align: 'right', color: T.muted, plateA: 0.6});
  });
  const spread = [0, 62, 112];
  for (let i = 0; i < 3; i++) {
    const a = colA[i] * ef * others; if (a <= 0) continue;
    const col = COLS[i], subs = i === 0 ? [[0, 0]] : i === 1 ? SUBJ.filter((_, k) => k === 0 || k > 6).slice(0, 9) : SUBM.filter((_, k) => k > 18).slice(0, 15);
    const R = [0, RJ, RM][i], xs = q => X[i] + q * spread[i], wob = i === 0 ? 34 * fadeIn(t, at(A.whole) - 0.2, 0.5) * (samp(POCK, PUP.x + 2 - flow(SLOW * t)[0], PUP.y - flow(SLOW * t)[1]) - samp(POCK, PUP.x - 2 - flow(SLOW * t)[0], PUP.y - flow(SLOW * t)[1])) / 4 : 0;
    const beamHi = i === 0 ? fadeIn(t, at(A.beam) - 0.1, 0.4) : 0;
    withAlpha(c, a, () => {
      for (const p of subs) {
        const bb = i === 0 ? sig[0](t) : subB(t, R, p), xb = xs(i === 0 ? 0 : p[0]);
        line(c, [[xb, PT.tileY + PT.tileH + 4], [xb, PT.bandY0]], rgba(PAL.ray, 0.45), i === 0 ? 2 + 2 * beamHi : 1.4);
        line(c, [[xb, PT.bandY0], [xb + wob * 0.5, PT.bandY1], [X[i] + wob, PT.pupY - 8]], rgba(PAL.ray, clamp(0.12 + 0.3 * bb)), i === 0 ? 2 + 2 * beamHi : 1.4);
      }
      const B = sig[i](t);
      glow(c, X[i], PT.pupY, 26 + 8 * Math.min(B, 3), '#FFF3D6', 0.16 + 0.12 * Math.min(B, 3));
      c.save(); c.translate(X[i], PT.pupY); c.scale(1, 0.5); ring(c, 0, 0, 14, rgba(PAL.cold, 0.95), 2.5); c.restore();
    });
  }
  withAlpha(c, colA[1] * ef * others, () => { stage.text('같은 눈동자', 405, PT.pupY, {size: 24, weight: 700, color: PAL.cold, align: 'center'}); });
  if (fadeIn(t, at(A.whole) - 0.2, 0.5) > 0) tag(stage, '빛줄기 하나가 통째로', X[0], PT.pupY - 50, {size: 24, color: T.light, a: fadeIn(t, at(A.whole) - 0.2, 0.5) * fadeOut(t, at(A.planet) - 0.5, 0.4) * ef});
  tag(stage, '점마다 다른 공기를 지남', X[1], PT.pupY - 50, {size: 24, color: PAL.planet, a: fadeIn(t, at(A.each10) - 0.2, 0.5) * fadeOut(t, at(A.moonP) - 0.5, 0.4) * ef});
  // ---- lanes: brightness entering the pupil (same scale) ----
  const names = ['별', '행성', '달 · 태양'], cols = [PAL.star, PAL.planet, PAL.moon], t0s = [sc.start + 0.2, at(A.planet) - 0.3, at(A.moonP) - 0.3];
  for (let i = 0; i < 3; i++) {
    const a = colA[i] * ef; if (a <= 0) continue;
    const b = {x: 140, y: PT.lane0 + i * (PT.laneH + PT.laneGap), w: 800, h: PT.laneH};
    withAlpha(c, a, () => {
      rect(c, b.x, b.y, b.w, b.h, 10, rgba(T.plate, 0.88), rgba(T.border, 1), 1.2);
      if (i === 1) { const fA = fadeIn(t, at(A.each10) - 0.2, 0.6) * 0.55; if (fA > 0) withAlpha(c, fA, () => { for (const p of [SUBJ[3], SUBJ[9], SUBJ[14]]) traceBox(stage, {x: b.x + 120, y: b.y, w: b.w - 120, h: b.h}, tt => subB(tt, RJ, p), t, {win: 5, yMax: 4.2, col: '#A7B7C2', w: 1.4, frame: false, mean: false, dot: false, t0: at(A.each10) - 0.4}); }); }
      traceBox(stage, {x: b.x + 120, y: b.y, w: b.w - 120, h: b.h}, sig[i], t, {win: 5, yMax: 4.2, col: cols[i], w: 2.6, frame: false, t0: t0s[i]});
      stage.text(names[i], b.x + 20, b.y + b.h / 2, {size: 28, weight: 700, color: cols[i]});
    });
  }
  const lab = [[A.asis, '그대로 출렁', 0], [A.almost, '점들의 흔들림 → 서로 메움 · 거의 고르다', 1], [A.avg, '평균 → 고르다', 2]];
  for (const [ref, s0, i] of lab) tag(stage, s0, 920, PT.lane0 + i * (PT.laneH + PT.laneGap) + 22, {size: 24, align: 'right', color: cols[i], a: fadeIn(t, at(ref) - 0.2, 0.5) * ef, plateA: 0.85});
}

// =====================================================================================================
// horizon: high vs low star (air mass), Sirius' colour flicker (dispersion), eclipse shadow bands
// =====================================================================================================
const SIRIUS_COL = '#DCE6FF';
function airPathPanel(stage, t, ctx, a, mode) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  // a flat-looking Earth (R = 9000 px) with an air shell drawn 110 px thick
  const b = mode === 'paths' ? {x: 140, y: 548, w: 800, h: 512} : {x: 140, y: 690, w: 800, h: 400}, R = 9000, hS = 110, O = [720, b.y + b.h - 44], C = [O[0], O[1] + R];
  withAlpha(c, a, () => {
    rect(c, b.x, b.y, b.w, b.h, 14, rgba('#020A12', 0.86), rgba(T.border, 1), 1.5);
    c.save(); c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 14); c.clip();
    const g = c.createRadialGradient(C[0], C[1], R, C[0], C[1], R + hS + 30); g.addColorStop(0, 'rgba(92,150,205,0.42)'); g.addColorStop(0.8, 'rgba(60,110,170,0.12)'); g.addColorStop(1, 'rgba(40,80,140,0)');
    c.beginPath(); c.arc(C[0], C[1], R + hS + 30, 0, TAU); c.fillStyle = g; c.fill();
    c.save(); c.beginPath(); c.arc(C[0], C[1], R + hS, 0, TAU); c.arc(C[0], C[1], R, 0, TAU, true); c.clip('evenodd');
    pocketField(stage, 'hzAir', {x: b.x, y: O[1] - hS - 20, w: b.w, h: hS + 60}, (x, y) => [x * 0.1, y * 0.1 + 30], t, {a: 0.5, rate: SKY_RATE});
    c.restore();
    c.beginPath(); c.arc(C[0], C[1], R, 0, TAU); c.fillStyle = '#0A1A24'; c.fill(); ring(c, C[0], C[1], R, 'rgba(140,190,230,0.5)', 2);
    // sight lines: length inside the shell from the exact geometry
    const ray = alt => { const u = [-Math.cos(alt * D2R), -Math.sin(alt * D2R)], L = Math.sqrt((R + hS) ** 2 - (R * Math.cos(alt * D2R)) ** 2) - R * Math.sin(alt * D2R); return {u, L}; };
    const hiR = ray(ALT.high), loR = ray(ALT.sirius);
    const seg = (r, col, w, fr) => { line(c, [O, [O[0] + r.u[0] * r.L, O[1] + r.u[1] * r.L]], col, w); line(c, [[O[0] + r.u[0] * r.L, O[1] + r.u[1] * r.L], [O[0] + r.u[0] * (r.L + 300), O[1] + r.u[1] * (r.L + 300)]], rgba(PAL.ray, 0.35), 1.5, {dash: [5, 6]}); };
    if (mode === 'paths') {
      seg(hiR, PAL.light, 5); seg(loR, PAL.light, 5);
    } else {
      // dispersion: red / green / blue paths toward the low star separate a little (hugely exaggerated) and cross different pockets
      const q = fadeIn(t, at(A.perColour) - 0.2, 0.8);
      for (const [k, col] of [[-1, PAL.red], [0, PAL.green], [1, PAL.blue]]) { const al = ALT.sirius + k * 3.2 * q; const r = ray(al); seg(r, col, 3.5); }
    }
    c.restore();
    circle(c, O[0], O[1] - 6, 7, '#EFE3D4');
    stage.text('관측자', O[0] + 16, O[1] + 18, {size: 24, weight: 700, color: T.ink});
    if (mode === 'paths') {
      const hA = fadeIn(t, at(A.lightH) - 0.2, 0.5), lA = fadeIn(t, at(A.thicker) - 0.2, 0.5);
      const ph = [O[0] + hiR.u[0] * hiR.L, O[1] + hiR.u[1] * hiR.L], pl = [O[0] + loR.u[0] * loR.L * 0.55, O[1] + loR.u[1] * loR.L * 0.55];
      tag(stage, `높은 별 · 공기 ${airmass(ALT.high).toFixed(1)}배`, ph[0] + 20, ph[1] - 26, {size: 24, align: 'left', color: PAL.light, a: hA});
      tag(stage, `낮은 별 · 공기 약 ${Math.round(airmass(ALT.sirius))}배`, pl[0] - 10, pl[1] - 44, {size: 26, color: PAL.light, border: PAL.light, a: lA});
      stage.text('대기 두께는 과장, 길이 비율은 실제 공기량', 540, b.y + 36, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: hA});
    } else {
      tag(stage, '색마다 다른 공기 덩어리를 지난다 (크게 과장)', 540, b.y + 36, {size: 24, color: T.ink, a: fadeIn(t, at(A.perColour) - 0.1, 0.5)});
    }
  });
}
const LENS = {x: 540, y: 480, r: 160};
function lensLeaders(stage, a, sp) { const L = LENS; withAlpha(stage.ctx, a, () => { for (const k of [-1, 1]) line(stage.ctx, [[sp[0] + k * 12, sp[1] - 12], [L.x + k * L.r * 0.7, L.y + L.r * 0.71]], rgba(stage.theme.light, 0.28), 1.2); }); }
function siriusLens(stage, t, ctx, a, sp) {
  const {ctx: c} = stage, T = stage.theme, L = LENS;
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); c.arc(L.x, L.y, L.r, 0, TAU); c.fillStyle = 'rgba(2,8,14,0.96)'; c.fill(); c.clip();
    const ch = [-1, 0, 1].map(k => SIG.low(t, k)), m = (ch[0] + ch[1] + ch[2]) / 3, k = Math.min(m, 3.5), sat = v => clamp((v / m) ** 1.5, 0, 2.2);
    const hex = '#' + [0.72 * sat(ch[0]), 0.8 * sat(ch[1]), 0.95 * sat(ch[2])].map(v => Math.round(255 * clamp(v)).toString(16).padStart(2, '0')).join('');
    glow(c, L.x, L.y, 80 + 50 * Math.sqrt(k), hex, clamp(0.12 + 0.3 * Math.sqrt(k), 0, 0.85)); glow(c, L.x, L.y, 30 + 14 * Math.sqrt(k), mix(hex, '#FFFFFF', 0.3), clamp(0.2 + 0.45 * Math.sqrt(k), 0, 0.9));
    circle(c, L.x, L.y, 6 + 4 * Math.sqrt(k), mix(hex, '#FFFFFF', 0.6));
    c.restore();
    ring(c, L.x, L.y, L.r, rgba(T.light, 0.6), 2);
    stage.text('확대', L.x - L.r - 16, L.y, {size: 24, weight: 700, color: T.muted, align: 'right'});
  });
}
function eclipseScene(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const thin = easeInOut((t - at(A.eclipse) + 0.2) / (at(A.thin) - at(A.eclipse) + 0.8)), bandA = fadeIn(t, at(A.groundE) - 0.5, 1.0);
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 0, 0, 760); g.addColorStop(0, '#040A18'); g.addColorStop(1, lerp(0, 1, thin) > 0.5 ? '#1A2B45' : '#22385A'); c.fillStyle = g; c.fillRect(0, 0, 1080, 760);
    // the Sun and the Moon: the crescent thins to a thread
    const S = [540, 470], rs = 108, rm = rs * 1.03, d = lerp(rs * 0.95, rm - rs + 3.2, thin), ang = -0.6, M = [S[0] + d * Math.cos(ang), S[1] + d * Math.sin(ang)], vis = sunVisible(d / rs);
    glow(c, S[0], S[1], rs * 3.2, '#BFD3EA', 0.12 + 0.18 * thin); glow(c, S[0], S[1], rs * 1.7, '#F3F1E8', 0.1 + 0.25 * thin);
    c.save(); c.beginPath(); c.rect(0, 0, 1080, 760); c.arc(M[0], M[1], rm, 0, TAU); c.clip('evenodd');
    glow(c, S[0], S[1], rs * 2.6, '#FFF4D6', 0.6 * Math.sqrt(vis)); circle(c, S[0], S[1], rs, '#FFF6DF');
    c.restore();
    circle(c, M[0], M[1], rm, '#03070D');
    tag(stage, '태양이 실처럼 가늘어짐', S[0], S[1] + rs + 40, {size: 24, color: PAL.light, a: fadeIn(t, at(A.thread) - 0.1, 0.4) * fadeOut(t, at(A.shadow) + 1.5, 0.5)});
    // the ground (a pale surface in perspective) with the computed shadow bands
    const yF = 770, yN = 1560, res = 3, w = Math.ceil(1080 / res), h = Math.ceil((yN - yF) / res), off = offscreen(stage, 'bands', w, h), dd = off.img.data;
    const G = lineGrid(sOf(ALT.sun), 600, 1, 94 * D2R), [fx, fy] = flow(SLOW * t), gain = 4 * bandA, lit = 0.62 + 0.55 * Math.sqrt(vis);
    for (let j = 0; j < h; j++) {
      const y = yF + (j + 0.5) * res, sN = (y - yF) / (yN - yF), z = 1 / lerp(1 / 3.2, 1 / 1, sN), gy = (z - 1) * 32, sc = 0.09 * z;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * res, gx = (x - 540) * sc, v = samp(G, gy - fx, gx - fy), q = clamp(0.55 + gain * (v - 1)), k = (j * w + i) * 4, fog = smooth(sN / 0.35);
        const L = (0.55 + 0.45 * fog) * lit * (1 - 0.85 * smooth((y - 1280) / 200));
        dd[k] = lerp(70, 196, q) * L; dd[k + 1] = lerp(78, 202, q) * L; dd[k + 2] = lerp(92, 206, q) * L; dd[k + 3] = 255;
      }
    }
    off.c.putImageData(off.img, 0, 0); c.save(); c.imageSmoothingEnabled = true; c.drawImage(off.cv, 0, 0, w, h, 0, yF, w * res, h * res); c.restore();
    const hz = c.createLinearGradient(0, yF - 30, 0, yF + 60); hz.addColorStop(0, 'rgba(20,32,52,0)'); hz.addColorStop(0.5, 'rgba(30,44,66,0.8)'); hz.addColorStop(1, 'rgba(30,44,66,0)'); c.fillStyle = hz; c.fillRect(0, yF - 30, 1080, 90);
    const sA = fadeIn(t, at(A.shadow) - 0.1, 0.5);
    tag(stage, '그림자 띠 · 바람 따라 일렁임', 540, 860, {size: 28, color: T.ink, border: T.ink, a: sA});
    tag(stage, '명암 크게 과장', 920, 1300, {size: 24, align: 'right', color: T.muted, a: sA, plateA: 0.7});
    tag(stage, '가는 빛줄기 → 한 방향으로만 평균 → 줄무늬', 540, 1030, {size: 24, color: T.light, a: fadeIn(t, at(A.same) - 0.1, 0.5)});
    tag(stage, '유력한 설명: 대기 섬광 (별의 반짝임과 같은 원리)', 540, 1100, {size: 26, color: PAL.cold, border: PAL.cold, a: fadeIn(t, at(A.likely) - 0.1, 0.5)});
  });
}
function horizonScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('horizon'), ef = endFade(t, ctx);
  const tB = at('s13') - 0.6, tC = at('s14') - 0.75, aSky = fadeIn(t, sc.start + 0.03, 0.4) * fadeOut(t, tC, 0.6), aC = fadeIn(t, tC + 0.2, 0.6) * ef;
  if (aSky > 0) {
    const q = (t - sc.start) / (tC - sc.start), dAz = lerp(-0.3, 0.3, q);
    drawSky(stage, t, {cam: HOR_CAM, a: aSky, dAz, par: -10 * q});
    const cam = {...HOR_CAM, az0: HOR_CAM.az0 + dAz}, hp = skyProj(cam, ...FEAT.high), sp = skyProj(cam, ...FEAT.sirius);
    withAlpha(c, aSky, () => {
      // the two featured stars (twinkle from the model at their altitudes; colour from three dispersed paths)
      const hb = [-1, 0, 1].map(k => starSeen(t, ALT.high, sOf(ALT.high), OFF.high[0], OFF.high[1], k)), lb = [-1, 0, 1].map(k => SIG.low(t, k));
      drawStar(c, hp[0], hp[1], 5, '#EEF2FF', hb, {glow: 1.3}); drawStar(c, sp[0], sp[1], 7, SIRIUS_COL, lb, {glow: 1.4, sat: 1});
      const aA = fadeIn(t, at(A.starH) - 0.1, 0.5) * fadeOut(t, tB, 0.5), sA = fadeIn(t, at(A.horizonW) - 0.1, 0.5);
      withAlpha(c, aA, () => {
        ring(c, hp[0], hp[1], 24, rgba(T.light, 0.75), 2); tag(stage, `높이 뜬 별 · ${Math.round(ALT.high)}°`, hp[0] + 36, hp[1] - 18, {size: 24, align: 'left', color: T.light});
        spark(stage, hp[0] + 30, hp[1] + 8, 250, 64, SIG.high, t, {win: 3, yMax: 5.5, col: PAL.star, mean: true, t0: at(A.starH) - 0.6});
      });
      withAlpha(c, sA, () => {
        ring(c, sp[0], sp[1], 26, rgba(T.light, 0.75), 2);
        const nm = fadeIn(t, at(A.sirius) - 0.1, 0.4);
        tag(stage, `지평선 가까운 별 · ${Math.round(ALT.sirius)}°`, sp[0] - 10, sp[1] - 46, {size: 24, align: 'left', color: T.light, a: 1 - nm});
        tag(stage, `시리우스 · ${Math.round(ALT.sirius)}°`, sp[0] - 10, sp[1] - 46, {size: 26, align: 'left', color: SIRIUS_COL, border: SIRIUS_COL, a: nm});
        spark(stage, sp[0] + 40, sp[1] - 26, 280, 64, t2 => SIG.low(t2), t, {win: 3, yMax: 5.5, col: PAL.star, mean: true, t0: at(A.horizonW) - 0.6});
      });
    });
    const pA = fadeIn(t, at(A.lightH) - 0.4, 0.5) * fadeOut(t, tB, 0.5), dA = fadeIn(t, at(A.airC) - 0.5, 0.5) * fadeOut(t, tC - 0.3, 0.5);
    const lA0 = fadeIn(t, at(A.low) - 0.2, 0.6) * fadeOut(t, tC - 0.3, 0.5); if (lA0 > 0) lensLeaders(stage, lA0 * aSky, sp);
    if (pA > 0) airPathPanel(stage, t, ctx, pA * aSky, 'paths');
    if (dA > 0) airPathPanel(stage, t, ctx, dA * aSky, 'colours');
    const lA = fadeIn(t, at(A.low) - 0.2, 0.6) * fadeOut(t, tC - 0.3, 0.5);
    if (lA > 0) {
      siriusLens(stage, t, ctx, lA * aSky, sp);
      // the three colour channels of Sirius (same model; the paths are 24 cm apart at the layer → independent)
      const chA = fadeIn(t, at(A.colour) - 0.2, 0.5) * fadeOut(t, at(A.airC) - 0.6, 0.4);
      if (chA > 0) withAlpha(c, chA * aSky, () => {
        const b = {x: 140, y: 660, w: 800, h: 300};
        rect(c, b.x, b.y, b.w, b.h, 12, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
        stage.text('시리우스의 색별 밝기', b.x + 20, b.y + 30, {size: 26, weight: 700, color: T.ink});
        [[-1, PAL.red, '빨강'], [0, PAL.green, '초록'], [1, PAL.blue, '파랑']].forEach(([k, col, nm], i) => {
          traceBox(stage, {x: b.x + 110, y: b.y + 50 + i * 82, w: b.w - 120, h: 80}, tt => SIG.low(tt, k), t, {win: 4, log: SKYLOG, col, w: 2.2, frame: false, t0: at(A.colour) - 1.2});
          stage.text(nm, b.x + 24, b.y + 90 + i * 82, {size: 26, weight: 700, color: col});
        });
      });
    }
  }
  if (aC > 0) eclipseScene(stage, t, ctx, aC);
}

// =====================================================================================================
// use: mountaintop observatory, Hubble above the air; adaptive optics
// =====================================================================================================
function hubble(c, x, y, ang, k = 1) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(k, k);
  for (const sg of [-1, 1]) {                                               // two solar arrays on booms
    line(c, [[-10, 0], [-10, sg * 46]], '#9AA6AE', 2);
    rect(c, -36, sg * 46 - (sg > 0 ? 0 : 22), 52, 22, 2, '#2B4F78', 'rgba(150,190,230,0.7)', 1.2);
    for (let q = 1; q < 4; q++) line(c, [[-36 + q * 13, sg * 46 - (sg > 0 ? 0 : 22)], [-36 + q * 13, sg * 46 + (sg > 0 ? 22 : 0)]], 'rgba(150,190,230,0.45)', 1);
  }
  const g = c.createLinearGradient(0, -17, 0, 17); g.addColorStop(0, '#F0F2F2'); g.addColorStop(0.5, '#B9C1C6'); g.addColorStop(1, '#6E787F');
  rect(c, -62, -16, 96, 32, 4, g);                                          // tube (silver foil)
  rect(c, 30, -18, 30, 36, 3, '#D6DBDE');                                   // aft shroud
  poly(c, [[-62, -16], [-82, -26], [-82, -20], [-62, -10]], '#C9CFD3');      // open aperture door
  line(c, [[-62, -16], [-62, 16]], '#4A545B', 2);
  circle(c, 8, 22, 4, '#9AA6AE'); line(c, [[8, 16], [8, 22]], '#9AA6AE', 1.5);   // antenna
  c.restore();
}
function dome(c, x, y, s = 1, slit = 1) {
  rect(c, x - 34 * s, y - 18 * s, 68 * s, 22 * s, 2, '#C8CED3');
  c.beginPath(); c.arc(x, y - 18 * s, 34 * s, Math.PI, 0); c.fillStyle = '#E3E7EA'; c.fill();
  if (slit > 0) { c.save(); c.beginPath(); c.arc(x, y - 18 * s, 34 * s, Math.PI, 0); c.clip(); rect(c, x - 6 * s, y - 54 * s, 12 * s, 38 * s, 0, rgba('#0A121A', slit)); c.restore(); }
  const g = c.createLinearGradient(x - 34 * s, 0, x + 34 * s, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.beginPath(); c.arc(x, y - 18 * s, 34 * s, Math.PI, 0); c.fillStyle = g; c.fill();
}
function observatoryScene(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), [fx] = flow(SLOW * t);
  const S = [540, 330], H = [770, 498], D = [318, 880], O = [742, 1226];
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 280, 0, 1340); g.addColorStop(0, '#01050C'); g.addColorStop(0.32, '#030B16'); g.addColorStop(0.62, '#0B1E31'); g.addColorStop(1, '#152C42'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    for (let i = 0; i < 140; i++) { const x = rand(i * 2.3) * 1080, y = 280 + rand(i * 5.1 + 2) * 420; c.fillStyle = rgba('#E6EEFA', 0.2 + 0.5 * rand(i * 1.3)); c.fillRect(x, y, 1.5, 1.5); }
    // the top of the air (faint glow), a thin high layer of turbulence, the thick low one (below the summit)
    const ag = c.createLinearGradient(0, 600, 0, 680); ag.addColorStop(0, 'rgba(90,140,190,0)'); ag.addColorStop(1, 'rgba(90,140,190,0.10)'); c.fillStyle = ag; c.fillRect(0, 600, 1080, 740);
    stage.text('대기의 위쪽 끝', 160, 628, {size: 24, weight: 500, color: rgba('#9FC3E0', 0.9)});
    pocketField(stage, 'useHi', {x: 0, y: 700, w: 1080, h: 56}, (x, y) => [x * 0.1, y * 0.1 + 60], t, {a: 0.45, env: (x, y) => smooth((y - 700) / 20) * smooth((756 - y) / 20)});
    pocketField(stage, 'useLo', {x: 0, y: 960, w: 1080, h: 280}, (x, y) => [x * 0.1, y * 0.1 + 20], t, {a: 0.7, env: (x, y) => smooth((y - 960) / 40)});
    // beams from the star: to Hubble (no air), to the summit (thin layer only), to the lowland (both layers)
    const bO = SIG.ground(t), bD = SIG.summit(t);
    line(c, [S, H], rgba(PAL.ray, 0.65), 2.5);
    line(c, [S, [lerp(S[0], D[0], 0.45), lerp(S[1], D[1], 0.45)]], rgba(PAL.ray, 0.6), 2.5); line(c, [[lerp(S[0], D[0], 0.45), lerp(S[1], D[1], 0.45)], [D[0], D[1] - 40]], rgba(PAL.ray, clamp(0.2 + 0.25 * bD)), 2.5);
    line(c, [S, [lerp(S[0], O[0], 0.42), lerp(S[1], O[1], 0.42)]], rgba(PAL.ray, 0.6), 2.5); line(c, [[lerp(S[0], O[0], 0.42), lerp(S[1], O[1], 0.42)], O], rgba(PAL.ray, clamp(0.15 + 0.25 * bO)), 2.5);
    glow(c, S[0], S[1], 80, '#DCE8FF', 0.3); circle(c, S[0], S[1], 5, '#FFFFFF');
    // mountain with the observatory, cloud sea, lowland
    const mt = [[-20, 1340], [80, 1080], [200, 960], [262, 902], D.map((v, i) => v + [0, 4][i]), [370, 908], [470, 990], [600, 1100], [700, 1180], [800, 1230], [1100, 1240], [1100, 1340]];
    const mg = c.createLinearGradient(0, 880, 0, 1340); mg.addColorStop(0, '#2C3A47'); mg.addColorStop(1, '#0B141C'); poly(c, mt, mg);
    line(c, [[262, 902], [D[0], D[1] + 4], [370, 908]], 'rgba(220,232,242,0.5)', 2);
    for (let k = 0; k < 26; k++) { const x = ((k * 47 + fx * 0.4) % 1240) - 80, y = 1000 + 9 * Math.sin(k * 1.9); glow(c, x, y, 70 + 20 * rand(k), '#C3CFDA', 0.2); }
    rect(c, 0, 1236, 1080, 700, 0, '#081118');
    dome(c, D[0], D[1], 1, 1);
    circle(c, O[0], O[1] - 6, 6, '#EFE3D4'); line(c, [[O[0], O[1]], [O[0], O[1] + 18]], '#EFE3D4', 2);
    hubble(c, H[0], H[1], -0.62, 1);
    // labels and the three brightness traces (same star, same pupil model, different air above)
    const oA = fadeIn(t, at('s15') - 0.3, 0.5), dA = fadeIn(t, at(A.obs) - 0.2, 0.5), hA = fadeIn(t, at(A.hubble) - 0.2, 0.5);
    withAlpha(c, oA, () => { tag(stage, '산 아래', O[0], O[1] - 40, {size: 24, color: T.ink}); traceBox(stage, {x: 150, y: 1150, w: 360, h: 80}, SIG.ground, t, {win: 4, log: SKYLOG, col: PAL.star, w: 2, plateA: 0.8, t0: at('s15') - 1}); stage.text('산 아래', 164, 1170, {size: 24, weight: 700, color: T.muted}); });
    withAlpha(c, dA, () => { tag(stage, '높은 산 위 천문대', D[0] + 6, D[1] - 92, {size: 24, color: T.ink}); traceBox(stage, {x: 560, y: 830, w: 360, h: 80}, SIG.summit, t, {win: 4, log: SKYLOG, col: PAL.star, w: 2, plateA: 0.8, t0: at(A.obs) - 1}); stage.text('산 위', 574, 850, {size: 24, weight: 700, color: T.muted}); });
    withAlpha(c, hA, () => {
      tag(stage, '허블 우주 망원경 · 1990', H[0] - 40, H[1] - 78, {size: 24, color: T.light, border: T.light});
      traceBox(stage, {x: 150, y: 470, w: 360, h: 80}, () => 1, t, {win: 4, log: SKYLOG, col: PAL.star, w: 2, plateA: 0.8, t0: at(A.hubble) - 1}); stage.text('허블', 164, 490, {size: 24, weight: 700, color: T.muted});
      tag(stage, '공기 위 · 흔들림 없음', 330, 584, {size: 24, color: PAL.good, a: fadeIn(t, at(A.above) - 0.1, 0.5)});
    });
  });
}
function aoScene(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const lzA = fadeIn(t, at(A.laser) - 0.1, 0.4), gsA = fadeIn(t, at(A.guide) - 0.25, 0.4), dmA = fadeIn(t, at(A.hundreds) - 0.3, 0.5), corr = easeInOut((t - at(A.change) + 0.4) / 0.7);
  const P0 = aoPSF(t, 0), P1 = corr > 0 ? aoPSF(t, 1) : P0;
  const GS = [452, 352], SC = [640, 318], TEL = [540, 780];
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 280, 0, 820); g.addColorStop(0, '#01050C'); g.addColorStop(1, '#0D2134'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    for (let i = 0; i < 120; i++) { const x = rand(i * 3.1) * 1080, y = 280 + rand(i * 4.7 + 1) * 380; c.fillStyle = rgba('#E6EEFA', 0.2 + 0.45 * rand(i * 1.7)); c.fillRect(x, y, 1.5, 1.5); }
    // sodium layer (~90 km) and the laser guide star
    const na = c.createLinearGradient(0, 330, 0, 374); na.addColorStop(0, 'rgba(255,180,60,0)'); na.addColorStop(0.5, 'rgba(255,180,60,0.16)'); na.addColorStop(1, 'rgba(255,180,60,0)'); c.fillStyle = na; c.fillRect(0, 330, 1080, 44);
    stage.text('나트륨층 · 약 90 km', 160, 312, {size: 24, weight: 500, color: rgba(PAL.laser, 0.9), alpha: lzA});
    pocketField(stage, 'aoAir', {x: 0, y: 520, w: 1080, h: 120}, (x, y) => [x * 0.1, y * 0.1 + 90], t, {a: 0.6, env: (x, y) => smooth((y - 520) / 30) * smooth((640 - y) / 30)});
    stage.text('흔들리는 공기', 160, 500, {size: 24, weight: 500, color: T.muted});
    // the target star's light, and the laser
    line(c, [SC, [TEL[0] + 30, TEL[1] - 60]], rgba(PAL.ray, 0.55), 2);
    glow(c, SC[0], SC[1], 60, '#DCE8FF', 0.3); circle(c, SC[0], SC[1], 4.5, '#FFFFFF'); tag(stage, '관측할 별', SC[0] + 22, SC[1] - 4, {size: 24, align: 'left', color: T.light});
    if (lzA > 0) withAlpha(c, lzA, () => {
      const top = [lerp(TEL[0] - 30, GS[0], easeOut(lzA)), lerp(TEL[1] - 70, GS[1], easeOut(lzA))];
      line(c, [[TEL[0] - 30, TEL[1] - 70], top], rgba(PAL.laser, 0.35), 9); line(c, [[TEL[0] - 30, TEL[1] - 70], top], rgba('#FFD28A', 0.9), 2.5);
      tag(stage, '레이저', TEL[0] - 120, TEL[1] - 150, {size: 24, color: PAL.laser});
    });
    if (gsA > 0) withAlpha(c, gsA, () => { glow(c, GS[0], GS[1], 46, PAL.laser, 0.55); circle(c, GS[0], GS[1], 5, '#FFE7B8'); tag(stage, '가짜 별 (레이저 인공 별)', GS[0] - 22, GS[1] + 2, {size: 24, align: 'right', color: PAL.laser, border: PAL.laser}); });
    // the big telescope's dome
    dome(c, TEL[0], TEL[1] + 20, 2.4, 1);
    tag(stage, '땅 위의 큰 망원경', TEL[0] + 110, TEL[1] - 8, {size: 24, align: 'left', color: T.ink});
  });
  // the optics: incoming wavefront → deformable mirror (actuators) → corrected wavefront
  withAlpha(c, a * dmA, () => {
    const b = {x: 140, y: 870, w: 800, h: 150}; panel(c, T, b.x, b.y, b.w, b.h, 0.9);
    const n = P0.row.length, X = (x0, w, i) => x0 + w * i / (n - 1), amp = 6;
    const wf = [], dm = [], out = [];
    for (let i = 0; i < n; i++) { wf.push([X(170, 200, i), b.y + 82 + amp * P0.row[i]]); dm.push([X(440, 200, i), b.y + 80 - 0.5 * amp * corr * P0.fitRow[i]]); out.push([X(710, 200, i), b.y + 82 + amp * (P0.row[i] - corr * P0.fitRow[i])]); }
    line(c, wf, PAL.ray, 2.5); line(c, out, PAL.ray, 2.5);
    for (let i = 0; i < n; i += 3) line(c, [[dm[i][0], dm[i][1] + 4], [dm[i][0], b.y + 128]], 'rgba(160,175,185,0.8)', 2);
    line(c, dm, '#E3E9EE', 4);
    arrow(c, [380, b.y + 82], [425, b.y + 82], rgba(T.ink, 0.8), 2.5, {head: 10}); arrow(c, [655, b.y + 82], [700, b.y + 82], rgba(T.ink, 0.8), 2.5, {head: 10});
    stage.text('흔들린 빛의 면', 270, b.y + 26, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text('변형 거울', 540, b.y + 26, {size: 24, weight: 700, color: T.ink, align: 'center'});
    stage.text('고르게 펴진 면', 810, b.y + 26, {size: 24, weight: 700, color: corr > 0.5 ? PAL.good : T.muted, align: 'center'});
  });
  tag(stage, '1초에 수백 번 거울 모양을 바꿈 · 화면은 느리게', 540, 846, {size: 24, color: T.light, border: T.light, a: a * fadeIn(t, at(A.hundreds) - 0.1, 0.5)});
  // the star images before / after (computed point-spread functions, log brightness)
  const imA = a * fadeIn(t, at(A.bigT) - 0.2, 0.5);
  if (imA > 0) withAlpha(c, imA, () => {
    psfBox(stage, P0, {x: 150, y: 1046, w: 370, h: 270}, '보정 전 · 번지고 흔들림', T.muted);
    psfBox(stage, corr > 0 ? P1 : P0, {x: 560, y: 1046, w: 370, h: 270}, corr > 0.5 ? '보정 후 · 선명한 점' : '보정 후', corr > 0.5 ? PAL.good : T.muted);
  });
}
function psfBox(stage, P, b, label, col) {
  const {ctx: c} = stage, T = stage.theme, n = 64, cut = 36, o = offscreen(stage, 'psf' + b.x, cut, cut), d = o.img.data;
  for (let j = 0; j < cut; j++) for (let i = 0; i < cut; i++) {
    const v = P.img[(j + (n - cut) / 2) * n + (i + (n - cut) / 2)], q = clamp(Math.log10(1 + v * 300) / Math.log10(1 + 0.4 * 300)), k = (j * cut + i) * 4;
    d[k] = 255 * clamp(q * 1.1); d[k + 1] = 255 * clamp(q * 1.05); d[k + 2] = 255 * clamp(0.15 + q); d[k + 3] = 255;
  }
  o.c.putImageData(o.img, 0, 0);
  rect(c, b.x, b.y, b.w, b.h, 10, '#02070C', rgba(T.border, 1), 1.5);
  const sz = b.h - 60; c.save(); c.imageSmoothingEnabled = true; c.drawImage(o.cv, 0, 0, cut, cut, b.x + (b.w - sz) / 2, b.y + 10, sz, sz); c.restore();
  stage.text(label, b.x + b.w / 2, b.y + b.h - 26, {size: 24, weight: 700, color: col, align: 'center'});
}
function useScene(stage, t, ctx) {
  const at = r => ctx.tl.at(r), sc = ctx.tl.scene('use'), ef = endFade(t, ctx), tB = at('s16') - 0.6;
  const aA = fadeIn(t, sc.start + 0.03, 0.4) * fadeOut(t, tB, 0.5), aB = fadeIn(t, tB + 0.25, 0.6) * ef;
  if (aA > 0) observatoryScene(stage, t, ctx, aA);
  if (aB > 0) aoScene(stage, t, ctx, aB);
}

// =====================================================================================================
// myth: the stars do not blink by themselves — from orbit they are steady
// =====================================================================================================
let TEX = null;
const earthTex = () => (TEX ||= earthTextures(loadLand(path.join(HERE, 'land.json'))));
function mythScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('myth'), ef = endFade(t, ctx);
  const noA = fadeIn(t, at(A.no) - 0.1, 0.5), spA = fadeIn(t, at(A.spaceM) - 0.4, 0.9), a0 = fadeIn(t, sc.start + 0.03, 0.4);
  // ground sky (twinkling) → view from orbit (steady stars above the limb of the lit Earth)
  if (spA < 1) drawSky(stage, t, {cam: HOOK_CAM, a: a0 * (1 - spA) * ef, dAz: 0.6, par: -34});
  if (spA > 0) withAlpha(c, spA * ef, () => {
    drawSky(stage, t, {cam: HOOK_CAM, space: true, noSil: true, dAz: 0.6 + 0.8 * (t - sc.start) / 8, mw: 1.15});
    const q = (t - at(A.spaceM)) / 5, cam = lookCam({pos: [0, 0, 1.085], dir: unit([Math.sin(lerp(-0.04, 0.04, q)), 1, -0.29]), up: [0, 0, 1], F: 1000, cx: 540, cy: 690});
    drawEarthLit(stage, cam, earthTex(), {axis: [0, 0, 1], spin: 40 + 2 * q, sun: unit([-0.9, 0.55, -0.12]), cloudDrift: 0.4, night: 0.08});
    const sp = [646, 610], b = 1;
    drawStar(c, sp[0], sp[1], 10, '#E9F0FF', [b, b, b], {glow: 1.5});
    ring(c, sp[0], sp[1], 26, rgba(T.light, 0.7 * fadeIn(t, at(A.calmM) - 0.8, 0.5)), 2);
    tag(stage, '대기 밖에서 본 별 · 흔들림 없음', 540, 1010, {size: 26, color: PAL.good, border: PAL.good, a: fadeIn(t, at(A.calmM) - 0.2, 0.5)});
  });
  // verdict card
  withAlpha(c, a0 * ef, () => {
    rect(c, 140, 292, 800, 150, 12, rgba(T.plate, 0.9), noA > 0.5 ? rgba(T.accent, 0.8) : rgba(T.border, 1), 2);
    const s0 = '별이 스스로 깜빡인다?', w = stage.measure(s0, {role: 'display', size: 40, weight: 700});
    stage.text(s0, 540, 340, {role: 'display', size: 40, weight: 700, color: mix(T.ink, T.muted, noA), align: 'center'});
    crossOut(c, 540 - w / 2, 540 + w / 2, 340, noA);
    stage.text('아니다 · 반짝임은 공기가 만든다', 540, 404, {role: 'display', size: 34, weight: 700, color: T.accent, align: 'center', alpha: noA});
  });
  // the same star's brightness: seen through the air vs from orbit
  const gA = fadeIn(t, at(A.spaceM) + 0.6, 0.5) * ef;
  if (gA > 0) withAlpha(c, gA, () => {
    const b = {x: 140, y: 1100, w: 800, h: 220};
    rect(c, b.x, b.y, b.w, b.h, 10, rgba(T.plate, 0.88), rgba(T.border, 1), 1.5);
    traceBox(stage, {x: b.x + 150, y: b.y + 8, w: b.w - 160, h: 100}, SIG.hookStar, t, {win: 4, log: SKYLOG, col: '#8C99A3', w: 2, frame: false, t0: at(A.spaceM) - 3});
    traceBox(stage, {x: b.x + 150, y: b.y + 112, w: b.w - 160, h: 100}, () => 1, t, {win: 4, log: SKYLOG, col: PAL.good, w: 2.6, frame: false, t0: at(A.spaceM) - 3});
    stage.text('땅에서', b.x + 24, b.y + 58, {size: 26, weight: 700, color: '#A9B5BE'});
    stage.text('우주에서', b.x + 24, b.y + 162, {size: 26, weight: 700, color: PAL.good});
  });
}

// =====================================================================================================
// close: the opening sky again — the star twinkles, Jupiter and the Moon shine steadily
// =====================================================================================================
function closeScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('close');
  const a0 = fadeIn(t, sc.start + 0.03, 0.5), q = (t - sc.start) / (sc.end - sc.start), dAz = lerp(0.5, -0.4, q), dEl = 0.1, par = lerp(-34, -10, q);
  const cam = {...HOOK_CAM, az0: HOOK_CAM.az0 + dAz, El: HOOK_CAM.El + dEl}, endA = fadeOut(t, sc.end - 0.45, 0.4);
  withAlpha(c, endA, () => {
    drawSky(stage, t, {cam: HOOK_CAM, dAz, dEl, par, a: a0, noSil: true});
    withAlpha(c, a0, () => {
      const sp = skyProj(cam, ...FEAT.star), mp = skyProj(cam, ...FEAT.moon), jp = skyProj(cam, ...FEAT.jup);
      drawMoonDisc(c, mp[0], mp[1], 17, 0.3, 2.45, 1);
      const bj = SIG.hookJup(t); glow(c, jp[0], jp[1], 46, '#F6E3BE', 0.34 * bj); glow(c, jp[0], jp[1], 12, '#FFF8E8', 0.6 * bj); circle(c, jp[0], jp[1], 4.2 * Math.sqrt(bj), '#FFF6E2');
      drawStar(c, sp[0], sp[1], 10, '#E9F0FF', [SIG.hookStarCh(t, -1), SIG.hookStarCh(t, 0), SIG.hookStarCh(t, 1)], {glow: 1.5});
      silhouettes(stage, cam, par);
      const sA = fadeIn(t, at(A.pt) - 0.2, 0.5), mA = fadeIn(t, at(A.wideC) - 0.2, 0.5);
      withAlpha(c, sA, () => { ring(c, sp[0], sp[1], 26, rgba(T.light, 0.7), 2); tag(stage, '별 · 점 → 흔들린다', sp[0] + 36, sp[1] + 2, {size: 24, align: 'left', color: T.light}); });
      withAlpha(c, mA, () => {
        ring(c, mp[0], mp[1], 30, rgba(PAL.moon, 0.7), 2); tag(stage, '달 · 넓다 → 평균', mp[0] - 40, mp[1], {size: 24, align: 'right', color: PAL.moon});
        ring(c, jp[0], jp[1], 20, rgba(PAL.planet, 0.6), 2); tag(stage, '목성 · 거의 고르다', jp[0] + 30, jp[1], {size: 24, align: 'left', color: PAL.planet});
      });
      // the three brightness traces once more (same functions as the sky)
      const lA = fadeIn(t, at(A.pt) - 0.3, 0.6);
      withAlpha(c, lA, () => {
        rect(c, 140, 1150, 800, 160, 10, rgba(T.plate, 0.82), rgba(T.border, 1), 1.2);
        [[SIG.hookStar, PAL.star, '별'], [SIG.hookJup, PAL.planet, '목성'], [SIG.hookMoon, PAL.moon, '달']].forEach(([f, col, nm], i) => {
          const x = 160 + i * 262; stage.text(nm, x + 8, 1180, {size: 24, weight: 700, color: col});
          spark(stage, x, 1196, 240, 100, f, t, {win: 3, yMax: 3.2, col, mean: true, t0: sc.start - 3});
        });
      });
    });
    // the closing statement
    const l1 = fadeIn(t, sc.start + 0.3, 0.6), l2 = fadeIn(t, at(A.notStar) - 0.3, 0.6);
    withAlpha(c, a0, () => {
      stage.text('정리', 540, 150, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, alpha: l1});
      stage.text('반짝임은 별이 아니라', 540, 222, {role: 'display', size: 46, weight: 700, color: T.ink, align: 'center', alpha: l1});
      stage.text('우리 머리 위의 공기가 만든다', 540, 290, {role: 'display', size: 46, weight: 700, color: PAL.light, align: 'center', alpha: l2});
      line(c, [[480, 336], [600, 336]], T.accent, 4, {cap: 'butt'});
    });
  });
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mapping (kept in every comparison): brightness entering the pupil B (mean 1) → loudness of a soft tone,
// amp = 0.85·(B/2.6)^0.85 (B = 1 → 0.38). Pitch names the object only: star 1175 Hz, planet 587 Hz, Moon/Sun 294 Hz;
// Sirius' colour channels red 880 / green 1175 / blue 1568 Hz. Wind noise only while the pockets drift on screen.
// =====================================================================================================
const AMP = B => 0.85 * clamp(B / 2.6) ** 0.85;
const LIFT = 5;                                                        // dB added to every continuous tone (measured: effects were ~25 dB under speech)
const F_STAR = 1175, F_PLANET = 587, F_MOON = 294;
/** fraction of the Sun's disc still visible (Moon radius 1.03 R☉, centre distance d in R☉) */
function sunVisible(d, rm = 1.03) {
  if (d >= 1 + rm) return 1; if (d <= rm - 1) return 0;
  const a = Math.acos((d * d + 1 - rm * rm) / (2 * d)), b = Math.acos((d * d + rm * rm - 1) / (2 * d * rm));
  const overlap = a + rm * rm * b - 0.5 * Math.sqrt(Math.max(0, (-d + 1 + rm) * (d + 1 - rm) * (d - 1 + rm) * (d + 1 + rm)));
  return 1 - overlap / Math.PI;
}
export function soundEvents(tl) {
  const at = ref => tl.at(ref), r = (x, dd = 3) => +x.toFixed(dd), ev = [];
  const squeeze = P => P.filter((q, i) => i === 0 || i === P.length - 1 || q.slice(1).some((v, k) => Math.abs(v - P[i - 1][k + 1]) > 1e-4 || Math.abs(v - P[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi = 0.3, fo = 0.4) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.04, fi, fo) => { const P = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) P.push([r(tt - t0), r(f(tt), 1), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); P[P.length - 1][2] = 0; return squeeze(P); };
  const tone = (id, t0, t1, freq, B, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain + LIFT, harmonics: o.h || [1, 0.18], fade: 0.03, points: table(t0, t1, () => freq, tt => AMP(B(tt)), o.dt || 0.04, o.fi, o.fo)}, ...(o.model ? {model: o.model} : {}), means});
  const silent = (id, ref, means) => ev.push({id, at: ref, kind: 'silent', means});
  const j = journeyTimes(tl);
  // hook: the star twinkles, the Moon is steady; while the light crosses space the tone is steady; under the air it flickers again
  tone('tone_hook_star', 0.6, at('hook:end') - 0.5, F_STAR, tt => hookHeard(tt, tl), -27,
    '훅의 별 밝기 → 높은 음의 크기: 하늘에서는 출렁, 우주를 건너는 동안 일정, 대기를 지나 관측자에게 닿으면 다시 출렁', {model: {sig: modelSignature(tl)}});
  tone('tone_hook_moon', at(A.moonW) - 0.1, j.dive0 + 0.4, F_MOON, SIG.hookMoon, -30, '달의 밝기 → 낮은 음의 크기: 고르다 (같은 대응, 넓은 원반)');
  ev.push({id: 'cam_dive', at: r(j.dive0, 4), kind: 'whoosh', params: {dur: 1.3, f_start: 260, f_end: 900, q: 0.9, gain_db: -35}, means: '카메라 큐: 하늘의 별로 다가가 옆에서 본 빛의 길로 (물리 소리 아님)'});
  silent('lab_air', A.our, '우리 머리 위의 공기 표시');
  // origin
  tone('tone_twinkle_card', at(A.blink) - 0.1, at(A.astro) - 0.4, F_STAR, SIG.hookStar, -30, '"눈을 깜빡이다" 카드의 별 — 같은 별의 밝기 → 음의 크기');
  tone('tone_scint_trace', at(A.scint) - 0.3, at('s03:end') + 0.3, F_STAR, SIG.hookStar, -30, '신틸레이션 그래프 — 그려지는 밝기와 같은 값');
  const s40 = sOf(40);
  tone('tone_valley', at(A.shake), at(A.peak) - 0.3, F_STAR, tt => starSeen(tt, 40, s40, 33, 140), -30, '구름 아래 골짜기에서 본 별 (크게 출렁)');
  tone('tone_summit', at(A.calm) - 0.2, at('s04:end') + 0.3, F_STAR, tt => starSeen(tt, 40, S_SUMMIT * s40, 33, 140), -30, '구름 위 산꼭대기에서 본 같은 별 (덜 출렁) — 같은 대응');
  // essence + cells: wind while the pockets drift
  ev.push({id: 'wind_essence', at: r(at(A.mixW), 4), kind: 'env_noise', params: {low: 200, high: 1100, gain_db: -28, fade: 0.05, points: [[0, 0], [0.8, 0.7], [r(tl.scene('essence').end - at(A.mixW) - 0.6), 0.7], [r(tl.scene('essence').end - at(A.mixW)), 0]]}, means: '바람에 실려 흐르는 공기 덩어리 (화면의 덩어리가 움직이는 동안만)'});
  const w0 = at(A.wind) - 0.2, w1 = tl.scene('cells').end - 0.2;
  ev.push({id: 'wind_cells', at: r(w0, 4), kind: 'env_noise', params: {low: 200, high: 1100, gain_db: -29, fade: 0.05, points: [[0, 0], [0.8, 0.6], [r(w1 - w0 - 0.8), 0.6], [r(w1 - w0), 0]]}, means: '"바람에 실려" — 덩어리와 땅 위 무늬가 흘러가는 동안'});
  const rs = realStrip(tl), g0 = at(A.passes) - 0.25;
  tone('tone_cells', g0, rs.ts - 0.15, F_STAR, SIG.cells, -27, '눈동자로 들어오는 별빛 밝기 (느린 화면, 그래프와 같은 값) → 음의 크기');
  ev.push({id: 'tone_realtime', at: r(rs.ts, 4), kind: 'chirp', params: {gain_db: -27 + LIFT, harmonics: [1, 0.18], fade: 0.01,
    points: (() => { const P = []; for (let k = 0; k <= 500; k++) { const tt = k * 0.002; P.push([r(tt, 4), F_STAR, r(AMP(SIG.cellsReal(rs.tau0 + tt)) * smooth(tt / 0.02) * smooth((1 - tt) / 0.02), 4)]); } P[P.length - 1][2] = 0; return P; })()},
    means: `실제 속도 1초: 같은 신호를 실제 빠르기로 — 1초에 ${rs.pk.length}번 밝아짐 (빠른 떨림으로 들림)`});
  silent('lab_pupil', A.pupil, '눈동자 약 7 mm 표시');
  // point: star / planet / Moon through the same pupil (same mapping, different pitch)
  tone('tone_point_star', at(A.starP) - 0.4, at('s09:end') + 0.4, F_STAR, SIG.cells, -28, '별(점): 한 빛줄기가 통째로 흔들림 → 크게 출렁');
  tone('tone_point_planet', at(A.planet) - 0.2, at('s10:end') + 0.4, F_PLANET, SIG.planet, -27, '행성(작은 원반): 원반 전체를 평균한 밝기 → 거의 일정');
  tone('tone_point_moon', at(A.moonP) - 0.2, at('s11:end') + 0.3, F_MOON, SIG.moon, -28, '달·태양(넓은 원반): 평균된 밝기 → 일정');
  // horizon
  tone('tone_high', at(A.starH) - 0.2, at(A.worse) - 0.3, F_STAR, SIG.high, -28, `높이 뜬 별 (${Math.round(ALT.high)}°) — 작게 출렁`);
  tone('tone_low', at(A.worse) - 0.2, at('s12:end') + 0.4, F_STAR, tt => SIG.low(tt), -28, `지평선 가까운 별 (${Math.round(ALT.sirius)}°) — 크게 출렁 (같은 대응)`);
  for (const [k, f, nm] of [[-1, 880, 'red'], [0, F_STAR, 'green'], [1, 1568, 'blue']]) tone(`tone_sirius_${nm}`, at(A.colour) - 0.3, at('s13:end') + 0.3, f, tt => SIG.low(tt, k), -31, `시리우스의 ${nm === 'red' ? '빨강(낮은 음)' : nm === 'green' ? '초록(가운데 음)' : '파랑(높은 음)'} 밝기 → 크기: 세 색이 따로 출렁`);
  const e0 = at(A.eclipse) - 0.2, e1 = at(A.thin) + 0.9, thinQ = tt => easeInOut((tt - at(A.eclipse) + 0.2) / (at(A.thin) - at(A.eclipse) + 0.8));
  ev.push({id: 'tone_sunlight', at: r(e0, 4), kind: 'chirp', params: {gain_db: -30 + LIFT, harmonics: [1, 0.3], fade: 0.05, points: table(e0, e1, () => 220, tt => 0.75 * sunVisible(lerp(0.95, 0.03 + 3.2 / 108, thinQ(tt)) * 1.0 + 0) ** 0.5, 0.05)}, means: '남은 햇빛의 양(초승달 면적) → 낮은 음의 크기: 실처럼 가늘어지며 작아짐'});
  const G = () => lineGrid(sOf(ALT.sun), 600, 1, 94 * D2R), b0 = at(A.shadow) - 0.2, b1 = tl.scene('horizon').end - 0.6;
  tone('tone_bands', b0, b1, 440, tt => { const [fx, fy] = flow(SLOW * tt); return 1 + 4 * (samp(G(), 6 - fx, 0 - fy) - 1); }, -31, '그림자 띠가 지나가는 땅 한 점의 밝기 (화면과 같은 과장) → 음의 크기');
  // use
  tone('tone_use_ground', at('s15') - 0.1, at(A.highM) + 0.1, F_STAR, SIG.ground, -28, '산 아래에서 본 별 — 크게 출렁');
  tone('tone_use_summit', at(A.highM) + 0.1, at(A.hubble) - 0.1, F_STAR, SIG.summit, -28, '높은 산 위 천문대 — 덜 출렁 (위에 남은 공기가 적음)');
  tone('tone_use_hubble', at(A.hubble), at('s15:end') + 0.4, F_STAR, () => 1, -28, '허블 — 공기 위: 일정');
  ev.push({id: 'guide_star', at: {...A.guide, offset: -0.1}, kind: 'tick', params: {freq: 1320, decay: 0.08, gain_db: -27, click: 0.15}, means: '레이저 인공 별이 켜짐'});
  const ao0 = at('s16') - 0.2, ao1 = tl.scene('use').end - 0.3, corrQ = tt => easeInOut((tt - at(A.change) + 0.4) / 0.7);
  ev.push({id: 'tone_ao_sharp', at: r(ao0, 4), kind: 'chirp', params: {gain_db: -29 + LIFT, harmonics: [1, 0.25], fade: 0.05,
    points: table(ao0, ao1, () => 784, tt => { const q = corrQ(tt), p = (q > 0 ? lerp(aoPSF(tt, 0).peak, aoPSF(tt, 1).peak, q) : aoPSF(tt, 0).peak); return 0.12 + 1.6 * p; }, 0.05)},
    means: '별 상의 가운데 밝기(선명함) → 음의 크기: 보정 전 작고 흔들림, 거울이 모양을 바꾸면 커지고 일정'});
  // myth
  ev.push({id: 'myth_no', at: A.no, kind: 'tick', params: {freq: 330, decay: 0.1, gain_db: -23, repeat: 2, interval: 0.12}, means: '오해에 줄을 그음 → "아니다"'});
  tone('tone_space', at(A.spaceM) + 0.3, tl.scene('myth').end - 0.3, F_STAR, () => 1, -28, '우주에서 본 별 — 공기가 없어 일정 (같은 대응)');
  // close
  tone('tone_close_star', at('s18') - 0.1, at(A.moonC) - 0.1, F_STAR, SIG.hookStar, -29, '정리: 별(점) — 출렁');
  tone('tone_close_moon', at(A.moonC) - 0.1, at(A.avgC) + 0.8, F_MOON, SIG.hookMoon, -30, '정리: 달(넓은 원반) — 일정');
  ev.push({id: 'close_swell', at: {...A.airC2, offset: -0.1}, kind: 'swell', params: {freqs: [294, 440, 587], dur: 2.0, gain_db: -26}, means: '정리: "공기가 만듭니다"'});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tone whose pitch is at or above HIGH_CUT is
 * dropped (the star at 1175 Hz, Sirius 880/1175/1568 Hz, the adaptive-optics 784 Hz tone, the 1320 Hz laser tick);
 * what remains keeps its partials, noise bands and filters below HIGH_CUT. The stale-table signature moves to the
 * first remaining event.
 */
const HIGH_CUT = 700;
function lowBandOnly(ev, sig) {
  const out = [];
  for (const e of ev) {
    const p = e.params || {};
    if (e.kind === 'chirp') {
      const f = Math.max(...p.points.map(q => q[1]));
      if (f >= HIGH_CUT) continue;
      p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT);
    } else if (e.kind === 'tick') {
      if (p.freq * 2.01 >= HIGH_CUT) continue;          // v_tick always adds a 2.01× partial
      p.click = 0;                                       // the click is a 0.8–4× noise burst
    } else if (e.kind === 'whoosh') { p.f_start = Math.min(p.f_start, HIGH_CUT * 0.6); p.f_end = Math.min(p.f_end, HIGH_CUT * 0.85); }
    else if (e.kind === 'env_noise') p.high = Math.min(p.high, HIGH_CUT);
    else if (e.kind === 'swell') p.cutoff = HIGH_CUT;    // v_swell adds 2f overtones; low-pass them away
    delete e.model;
    out.push(e);
  }
  const first = out.find(e => e.kind !== 'silent');
  if (first) first.model = {sig};
  return out;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/twinkle/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형(얼어붙은 흐름의 위상 화면 → 눈동자 밝기, 원반 평균, 분산, 그림자 띠, 적응광학 PSF)에서 써 넣습니다. 대응: 밝기 → 음의 크기, 음높이는 대상 이름(별 1175 Hz · 행성 587 Hz · 달 294 Hz). 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const rs = realStrip(tl), st = f => { const a = []; for (let tt = 0; tt < 160; tt += 0.05) a.push(f(tt)); const m = a.reduce((x, y) => x + y) / a.length; return [m, Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)]; };
  console.log(`events: ${sound.events.length}; real-speed second: ${rs.pk.length} brightenings (V ${V_WIND / 100} m/s, r_F ${RF.toFixed(2)} cm)`);
  console.log(`σ_I star(45°) ${st(SIG.cells)[1].toFixed(3)}, Jupiter ${st(SIG.planet)[1].toFixed(4)}, Moon ${st(SIG.moon)[1].toFixed(5)}; high(${ALT.high.toFixed(1)}°) ${st(SIG.high)[1].toFixed(3)}, low(${ALT.sirius}°) ${st(t => SIG.low(t))[1].toFixed(3)}; ground ${st(SIG.ground)[1].toFixed(3)} summit ${st(SIG.summit)[1].toFixed(3)}`);
  console.log(`footprints: Jupiter ${footR(SIZE.jupiter).toFixed(1)} cm, Moon ${footR(SIZE.moon).toFixed(0)} cm radius; dispersion at 9° ${dispCm(9).toFixed(1)} cm; air mass 9° ${airmass(9).toFixed(2)}`);
}
