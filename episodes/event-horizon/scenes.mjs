// Episode scenes — "사건의 지평선 — 빛도 돌아올 수 없는 경계" (26)
// Shape: export {theme, scenes, overlays, background, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Visual direction (docs/ANIMATION_QUALITY.md "2026-11-07 후속 결정: 시리즈 화풍은 지킨다"): the series' diagram style —
// dark noturno background, thin precise lines (1.5–3 px), small glowing dots with additive blending, graphs with axes,
// one warm accent (amber: horizon, photon ring, answers) and one cool secondary (light: rays, photons). Red appears only
// as the physical redshift of the falling ship. Dynamics: frame-filling diagrams, camera moves, an event every 2–4 s
// (white flash + thin shock rings), big numbers. No glossy spheres, no textures, no screen-space bloom, no EHT photo.
//
// MODEL (one block below; picture, gauges and sound all read it — nothing on screen is a footnote):
//  - Units in the diagrams: r_s = c = 1 (Schwarzschild, non-rotating). r_s = 2GM/c²; escape speed √(2GM/r) = c·√(r_s/r)
//    (the Newtonian formula happens to give the same radius; the real meaning of the horizon is general relativity).
//  - Light rays (hook, photo): exact null geodesics in the equatorial plane, u'' = −u + 1.5u² (u = r_s/r), RK4.
//    Impact parameter b < √27/2 ≈ 2.598 r_s → captured. The face-on "ring" is an explanatory drawing (dot density;
//    brighter lower side like the 2019 image), NOT the EHT photograph. Shadow radius √27/2 r_s ≈ 2.6 r_s.
//  - Matter (hook, myth): exact timelike geodesics u'' = −u + 1/(2L²) + 1.5u² (E = 1, from rest at infinity).
//    Far orbits in the myth panels are drawn Newtonian and not to scale (identical for the star and the black hole).
//  - Michell's dark star (origin): Newtonian corpuscles launched at c, r'' = −GM/r²; the star is made "heavier" until
//    v_esc = 1.3 c (explanatory). Screen time 0.3 s per R/c.
//  - Light cones (s11) and wavefronts (s03, s05): river (Gullstrand–Painlevé) picture — space flows inward at
//    β = √(r_s/r); a flash's front points move with n̂ − β r̂ (c = 1, direction n̂ kept fixed: local approximation,
//    exact for radial light: dr/dt = ±1 − β). β = 1 at the horizon: outgoing light stands still; inside, all paths go in.
//  - Falling ship (s12–s13): free fall from rest at infinity, started at r0 = 6.5 r_s. Coordinate time
//    t(r) = T(r0) − T(r), T(r) = ⅔r^{3/2} + 2√r − ln((√r+1)/(√r−1)); proper time τ = ⅔(r0^{3/2} − r^{3/2}).
//    The ship's clock sends a light pulse every Δτ = 1.2 r_s/c; pulses climb out at dr/dt = 1 − 1/r and reach the far
//    observer (r = 7.2 r_s) ever later; received/emitted frequency = 1 − √(r_s/r) (gravity + motion) → colour, dimming,
//    tick spacing and pitch. Screen time 0.32 s per r_s/c (a big black hole would take hours: time compressed).
//    The radial axis of the lanes is logarithmic (schematic).
//  - Static clocks (s14): rate seen from far √(1 − r_s/r).
//  - Numbers: Earth v_esc 11.2 km/s; r_s(Sun) 2.95 km; r_s(Earth) 8.87 mm (10원 동전 지름 18.0 mm);
//    M87* 6.5×10⁹ M☉ → r_s ≈ 1.9×10¹³ m ≈ 128 AU vs Neptune 30.07 AU (≈ 4.3×); distance ≈ 5,500만 광년.
//    EHT 2017 sites that observed M87*: Hawaii, Arizona, Mexico, Chile, Spain (the South Pole cannot see M87).
//  - Sound: `node episodes/event-horizon/scenes.mjs --emit-sound` writes sound.json from the same plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, withAlpha, TAU, rng, loadTimeline} from '../../pipeline/render/index.mjs';
import {loadLand, makeView, landPath, graticule, surfacePoint} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
const LAND = loadLand(path.join(HERE, 'land.json'));
export const theme = {base: 'noturno', accent: '#FFB547'};
export const captionLayout = {};
const W = 1080, H = 1920;

// =====================================================================================================
// MODEL
// =====================================================================================================
const G = 6.674e-11, C = 2.998e8, MSUN = 1.989e30, MEARTH = 5.972e24, REARTH = 6.371e6, RSUN = 6.957e8, AU = 1.496e11;
export const rsOf = M => 2 * G * M / (C * C);                       // Schwarzschild radius
export const vEsc = (M, r) => Math.sqrt(2 * G * M / r);             // escape speed
export const NUM = {
  vEarth: vEsc(MEARTH, REARTH) / 1e3,                                // 11.19 km/s
  rsSunKm: rsOf(MSUN) / 1e3,                                         // 2.95 km
  rsEarthMm: rsOf(MEARTH) * 1e3,                                     // 8.87 mm
  rsEarthM: rsOf(MEARTH), rEarthM: REARTH, rSunKm: RSUN / 1e3, rEarthKm: REARTH / 1e3, cKm: C / 1e3,
  m87Msun: 6.5e9, rsM87AU: rsOf(6.5e9 * MSUN) / AU,                  // 128 AU
  neptuneAU: 30.07, m87Mly: 55, coinMm: 18.0,
  shadow: Math.sqrt(27) / 2,                                         // 2.598 r_s
};
export const B_CRIT = NUM.shadow;
export const clockRate = x => Math.sqrt(Math.max(0, 1 - 1 / x));   // static clock at r = x r_s, seen from far
export const betaOf = x => 1 / Math.sqrt(Math.max(x, 1e-6));        // v_esc/c = √(r_s/r) = inflow speed (river picture)
export const vEarthAt = Rm => vEsc(MEARTH, Rm) / 1e3;               // km/s when Earth's mass is squeezed to radius Rm

// ---- light: null geodesics (r_s = 1) — ray from x = −∞ at height b
const RAYC = new Map();
export function photonRay(b) {
  const key = b.toFixed(4); if (RAYC.has(key)) return RAYC.get(key);
  const sg = b < 0 ? -1 : 1, B = Math.max(1e-3, Math.abs(b)), R0 = 40, h = 0.0015, f = u => -u + 1.5 * u * u;
  let u = 1 / R0, psi = Math.asin(Math.min(1, B / R0)), w = Math.sqrt(Math.max(0, 1 / (B * B) - u * u + u * u * u)), captured = false;
  const pts = [], push = () => pts.push([-Math.cos(psi) / u, sg * Math.sin(psi) / u]);
  push();
  for (let i = 1; i < 80000; i++) {
    const k1u = w, k1w = f(u), k2u = w + h / 2 * k1w, k2w = f(u + h / 2 * k1u), k3u = w + h / 2 * k2w, k3w = f(u + h / 2 * k2u), k4u = w + h * k3w, k4w = f(u + h * k3u);
    const un = u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), wn = w + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
    if (un >= 1) { psi += h * (1 - u) / (un - u); u = 1; push(); captured = true; break; }
    u = un; w = wn; psi += h;
    if (u <= 1 / R0 && w < 0) { push(); break; }
    if (i % 3 === 0) push();
  }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let i0 = pts.findIndex(p => p[0] > -12); if (i0 < 0) i0 = 0;
  let ic = 0; for (let i = 0; i < pts.length; i++) if (Math.hypot(...pts[i]) < Math.hypot(...pts[ic])) ic = i;
  const rOut = Math.abs(Math.abs(b) - Math.sqrt(27) / 2) < 0.1 ? 3.2 : 12;     // near-critical rays: keep only the winding part
  let i1 = pts.length - 1; if (!captured) for (let i = ic; i < pts.length; i++) if (Math.hypot(...pts[i]) > rOut) { i1 = i; break; }
  const R = {b, pts, cum, L: cum[cum.length - 1], captured, i0, i1, s0: cum[i0], s1: cum[i1], ph: (Math.sin(b * 91.7) * 43758.5) % 1};
  RAYC.set(key, R); return R;
}
export function rayAt(R, s) {
  const cum = R.cum; if (s <= 0) return R.pts[0]; if (s >= R.L) return R.pts[R.pts.length - 1];
  let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
  const q = (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]); return [lerp(R.pts[lo][0], R.pts[hi][0], q), lerp(R.pts[lo][1], R.pts[hi][1], q)];
}
// ---- matter: timelike geodesics (r_s = 1, E = 1 by default); pts = [x, y, τ]
const ORBC = new Map();
export function matterOrbit(L, {E = 1, r0 = 10, sg = 1, rot = 0} = {}) {
  const key = `${L}/${E}/${r0}/${sg}/${rot}`; if (ORBC.has(key)) return ORBC.get(key);
  const h = 0.002, f = u => -u + 1 / (2 * L * L) + 1.5 * u * u;
  let u = 1 / r0, phi = 0, w = Math.sqrt(Math.max(0, (E * E - 1) / (L * L) + u / (L * L) - u * u + u * u * u)), tau = 0, captured = false;
  const pts = [], push = () => { const a = rot + sg * phi; pts.push([Math.cos(a) / u, Math.sin(a) / u, tau]); };
  push();
  for (let i = 1; i < 100000; i++) {
    const k1u = w, k1w = f(u), k2u = w + h / 2 * k1w, k2w = f(u + h / 2 * k1u), k3u = w + h / 2 * k2w, k3w = f(u + h / 2 * k2u), k4u = w + h * k3w, k4w = f(u + h * k3u);
    const un = u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), wn = w + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
    const dtau = h / (L * 0.5 * (u * u + un * un));
    if (un >= 1) { const q = (1 - u) / (un - u); phi += h * q; tau += dtau * q; u = 1; push(); captured = true; break; }
    u = un; w = wn; phi += h; tau += dtau;
    if (u < 1 / (r0 + 0.5) && w < 0) { push(); break; }
    if (phi > 12 * Math.PI) break;
    if (i % 4 === 0) push();
  }
  const O = {L, pts, T: tau, captured}; ORBC.set(key, O); return O;
}
export function orbitAt(O, tau) {
  const P = O.pts; if (tau <= 0) return P[0]; if (tau >= O.T) return P[P.length - 1];
  let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][2] < tau) lo = m; else hi = m; }
  const q = (tau - P[lo][2]) / Math.max(1e-9, P[hi][2] - P[lo][2]); return [lerp(P[lo][0], P[hi][0], q), lerp(P[lo][1], P[hi][1], q), tau];
}
// ---- wavefront of a flash in the river picture: dp/dh = n̂ − β(|p|) p̂
const FRONTC = new Map();
export function gpFront(ex, ey, hMax = 1.2, n = 40) {
  const key = `${ex.toFixed(4)},${ey.toFixed(4)},${hMax},${n}`; if (FRONTC.has(key)) return FRONTC.get(key);
  const dh = 0.004, dirs = Array.from({length: n}, (_, i) => [Math.cos(i / n * TAU), Math.sin(i / n * TAU)]), frames = [];
  let p = dirs.map(() => [ex, ey]); frames.push(p);
  for (let k = 1; k * dh <= hMax + 1e-9; k++) {
    p = p.map(([x, y], i) => { const r = Math.hypot(x, y); if (r < 0.04) return [x, y]; const b = betaOf(r); return [x + (dirs[i][0] - b * x / r) * dh, y + (dirs[i][1] - b * y / r) * dh]; });
    frames.push(p);
  }
  const F = {dh, frames, n}; FRONTC.set(key, F); return F;
}
export const frontAt = (F, h) => F.frames[clamp(Math.round(h / F.dh), 0, F.frames.length - 1)];
// ---- falling ship (free fall from rest at infinity), far observer, light pulses
export const FALL = {r0: 5, dTau: 1.0, rObs: 9, KT: 0.32};
const Tf = r => (2 / 3) * r ** 1.5 + 2 * Math.sqrt(r) - Math.log((Math.sqrt(r) + 1) / (Math.sqrt(r) - 1));
export const fallT = r => Tf(FALL.r0) - Tf(r);                      // coordinate time from r0 to r (→ ∞ at r_s)
export const fallTau = r => (2 / 3) * (FALL.r0 ** 1.5 - Math.max(0, r) ** 1.5);
export const rOfTau = (tau, r0 = FALL.r0) => Math.max(0, r0 ** 1.5 - 1.5 * tau) ** (2 / 3);
export const OWN_R0 = 8;                                              // the crew's replay starts a little further out (same free fall)
export function rOfT(t) { if (t <= 0) return FALL.r0; let lo = 1 + 1e-13, hi = FALL.r0; for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (fallT(m) > t) lo = m; else hi = m; } return (lo + hi) / 2; }
const tort = r => r + Math.log(r - 1);
export const redshift = r => Math.max(0, 1 - 1 / Math.sqrt(r));    // f_received / f_emitted
export const PULSES = (() => { const out = []; for (let k = 1; k < 200; k++) { const tau = k * FALL.dTau, r = rOfTau(tau); if (r <= 1.0005) break; const te = fallT(r); out.push({k, tau, r, te, ta: te + tort(FALL.rObs) - tort(r), f: redshift(r)}); } return out; })();
export function pulseR(p, t) {
  if (t < p.te) return null; const target = tort(p.r) + (t - p.te); if (target >= tort(FALL.rObs)) return null;
  let lo = p.r, hi = FALL.rObs; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (tort(m) < target) lo = m; else hi = m; } return (lo + hi) / 2;
}
const arriveTau = tau => { const r = rOfTau(tau); return r <= 1 + 1e-9 ? Infinity : fallT(r) + tort(FALL.rObs) - tort(r); };
export function seenTau(t) {
  const a0 = arriveTau(0); if (t <= a0) return 0;
  let lo = 0, hi = fallTau(1) - 1e-9; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (arriveTau(m) < t) lo = m; else hi = m; } return lo;
}
// ---- Newtonian radial flight r'' = −GM/r² from r = 1 at speed v0 (Earth launches, Michell's corpuscles)
const FLYC = new Map();
export function radialFlight(v0, GM, tMax = 80) {
  const key = `${v0.toFixed(3)}/${GM.toFixed(4)}`; if (FLYC.has(key)) return FLYC.get(key);
  let r = 1, v = v0, t = 0, landed = false; const dt = 0.002, out = [[0, 1]], a = x => -GM / (x * x);
  for (let i = 1; t < tMax; i++) {
    const k1r = v, k1v = a(r), k2r = v + dt / 2 * k1v, k2v = a(r + dt / 2 * k1r), k3r = v + dt / 2 * k2v, k3v = a(r + dt / 2 * k2r), k4r = v + dt * k3v, k4v = a(r + dt * k3r);
    r += dt / 6 * (k1r + 2 * k2r + 2 * k3r + k4r); v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); t += dt;
    if (r < 1) { out.push([t, 1]); landed = true; break; }
    if (i % 5 === 0) out.push([t, r]);
  }
  const F = {out, T: out[out.length - 1][0], landed}; FLYC.set(key, F); return F;
}
export function flightAt(F, t) {
  const o = F.out; if (t <= 0) return 1; if (t >= F.T) return F.landed ? null : o[o.length - 1][1];
  let lo = 0, hi = o.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (o[m][0] < t) lo = m; else hi = m; }
  return lerp(o[lo][1], o[hi][1], (t - o[lo][0]) / Math.max(1e-9, o[hi][0] - o[lo][0]));
}

// =====================================================================================================
// Palette and drawing helpers (series style)
// =====================================================================================================
export const PAL = {amber: '#FFB547', amberHot: '#FFE2B0', ray: '#7FD0FF', rayHot: '#E6F7FF', red: '#FF5A3C', ink: '#EFE3D4', muted: '#8AA0A6',
  grid: '#1C3A45', line: '#C9D6DA', matter: '#E3C9A0', hole: '#000306', star: '#FFC46A', land: '#9DB8B4', answer: '#FFB547'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, fi = 0.35, fo = 0.35) => fadeIn(t, a, fi) * fadeOut(t, b - fo, fo);
const SPR = {};
function glowSprite(col, size = 128) {
  const cv = createCanvas(size, size), c = cv.getContext('2d'), r = size / 2, g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.18, rgba(col, 0.55)); g.addColorStop(0.45, rgba(col, 0.16)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
}
const GS = col => (SPR['g' + col] ||= glowSprite(col));
function gl(c, x, y, r, col, a = 1) { if (a <= 0.003 || r <= 0) return; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, a); c.drawImage(GS(col), x - r, y - r, 2 * r, 2 * r); c.restore(); }
function ringFx(c, x, y, r, col, a, w = 2.5) {
  if (a <= 0.01 || r <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(x, y, r, 0, TAU);
  c.strokeStyle = rgba(col, a * 0.22); c.lineWidth = w * 4; c.stroke(); c.strokeStyle = rgba(col, a); c.lineWidth = w; c.stroke(); c.restore();
}
/** event: white flash + two expanding thin shock rings (age in screen seconds) */
function burst(c, x, y, age, R, col = PAL.amberHot, k = 1) {
  if (age < 0 || age > 2.4) return;
  gl(c, x, y, R * 0.45 * (0.6 + age), '#FFFFFF', 0.75 * k * Math.exp(-age / 0.12)); gl(c, x, y, R * (0.4 + age * 0.7), col, 0.3 * k * Math.exp(-age / 0.35));
  ringFx(c, x, y, R * (0.2 + 1.5 * easeOut(age / 1.2)), col, 0.8 * k * Math.exp(-age / 0.55));
  if (age > 0.16) ringFx(c, x, y, R * (0.15 + 1.05 * easeOut((age - 0.16) / 1.2)), '#FFFFFF', 0.42 * k * Math.exp(-(age - 0.16) / 0.45), 1.5);
}
function horizonFlash(c, x, y, r, age, k = 1) {
  if (age < 0 || age > 2) return;
  ringFx(c, x, y, r, PAL.amberHot, 0.9 * k * Math.exp(-age / 0.5), 3.5);
  ringFx(c, x, y, r * (1 + 0.55 * easeOut(age / 1.2)), PAL.amber, 0.7 * k * Math.exp(-age / 0.5), 2);
  if (age > 0.15) ringFx(c, x, y, r * (1 + 0.35 * easeOut((age - 0.15) / 1.2)), '#FFFFFF', 0.35 * k * Math.exp(-(age - 0.15) / 0.4), 1.5);
}
function trail(c, a, b, alpha = 1, w = 2, col = PAL.ray) {
  if (alpha <= 0.003) return; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (const [ww, k] of [[w * 4, 0.1], [w * 2, 0.25], [w, 0.95]]) { const g = c.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, k * alpha)); c.strokeStyle = g; c.lineWidth = ww; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  c.restore();
}
function photonDot(c, x, y, a = 1, r = 2.6, col = PAL.ray) { if (a <= 0.01) return; gl(c, x, y, r * 5, col, 0.55 * a); c.save(); c.globalCompositeOperation = 'lighter'; circle(c, x, y, r, rgba(col === PAL.ray ? PAL.rayHot : '#FFFFFF', 0.95 * a)); c.restore(); }
function poly(c, pts, col, w = 1.6, a = 1, dash = null) {
  if (a <= 0.01 || pts.length < 2) return; c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; if (dash) c.setLineDash(dash);
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.strokeStyle = rgba(col, a); c.lineWidth = w; c.stroke(); c.restore();
}
function strokeCircle(c, x, y, r, col, w = 2, a = 1, dash = null) { if (a <= 0.01 || r <= 0) return; c.save(); if (dash) c.setLineDash(dash); c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = rgba(col, a); c.lineWidth = w; c.stroke(); c.restore(); }
/** the black hole as a diagram: black disk + thin amber horizon line (+ faint halo) */
function hole(c, x, y, r, a = 1, o = {}) {
  if (a <= 0.01) return;
  withAlpha(c, a, () => { if (o.halo !== false) gl(c, x, y, r * 1.8, PAL.amber, 0.07); circle(c, x, y, r, PAL.hole); strokeCircle(c, x, y, r, PAL.amber, o.w ?? 2.5, o.lineA ?? 0.95, o.dash); });
}
function big(stage, s, x, y, size, col, a = 1, o = {}) {
  if (a <= 0.01) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: 'display', weight: 700, size, color: col, align: o.align || 'center', tracking: -0.02 * size, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 18, ...o}));
}
function label(stage, s, x, y, a = 1, o = {}) {
  if (a <= 0.01) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: o.role || 'body', weight: o.weight ?? 700, size: Math.max(30, o.size || 32), color: o.color || PAL.ink, align: o.align || 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12}));
}
function leaderLine(c, a, b, col = PAL.muted, alpha = 1) { if (alpha <= 0.01) return; poly(c, [a, b], col, 1.5, 0.8 * alpha); circle(c, b[0], b[1], 3, rgba(col, alpha)); }
const STARS = (() => { const R = rng(11), d = []; for (let i = 0; i < 170; i++) d.push([R() * W, R() * H, 0.5 + 1.3 * R() ** 2, 0.08 + 0.32 * R() ** 2, R() * TAU]); return d; })();
/** noturno background: gradient + very faint tint + vignette + sparse stars (stars skip an optional hole region) */
function seriesBg(c, t, o = {}) {
  const g = c.createLinearGradient(0, 0, W * 0.35, H); g.addColorStop(0, '#001A27'); g.addColorStop(1, '#000A10'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (o.tint) gl(c, o.x ?? 540, o.y ?? 800, o.r ?? 900, o.tint, o.a ?? 0.06);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.42, H * 0.8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
  const k = o.stars ?? 1, hz = o.hole;
  if (k > 0) for (const [x, y, r, a, ph] of STARS) { if (hz && Math.hypot(x - hz[0], y - hz[1]) < hz[2]) continue; circle(c, x, y, r, rgba('#DDEBF2', a * k * (0.75 + 0.25 * Math.sin(t * 1.3 + ph * 5)))); }
}
function captionBand(c) { const g = c.createLinearGradient(0, 1290, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = g; c.fillRect(0, 1290, W, 630); }
const fadeFromBlack = (c, t, t0, d = 0.35) => { const fi = smooth((t - t0) / d); if (fi < 1) { c.fillStyle = rgba('#000A10', 1 - fi); c.fillRect(0, 0, W, H); } };
const hash = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
/** clock dial: thin ring, 12 ticks, one hand at angle = turns·2π (0 = up) */
function dial(c, x, y, r, turns, o = {}) {
  const col = o.col || PAL.ink, a = o.a ?? 1; if (a <= 0.01) return;
  withAlpha(c, a, () => {
    circle(c, x, y, r, rgba('#000A10', 0.8)); strokeCircle(c, x, y, r, col, 2.5, 0.95);
    for (let k = 0; k < 12; k++) { const an = k / 12 * TAU, r0 = k % 3 ? r * 0.82 : r * 0.72; poly(c, [[x + Math.sin(an) * r0, y - Math.cos(an) * r0], [x + Math.sin(an) * r * 0.92, y - Math.cos(an) * r * 0.92]], col, k % 3 ? 1.5 : 2.5, 0.85); }
    const an = turns * TAU; poly(c, [[x, y], [x + Math.sin(an) * r * 0.78, y - Math.cos(an) * r * 0.78]], o.hand || col, 3, 1); circle(c, x, y, 4, col);
    if (o.flash > 0) ringFx(c, x, y, r + 6, col, 0.6 * o.flash, 2);
  });
}
/** square-root formula drawn with lines: √(1 − r_s/r) */
function rootFormula(stage, x, y, size, col, a = 1) {
  if (a <= 0.01) return; const c = stage.ctx, inner = '1 − rₛ/r', wI = stage.measure(inner, {role: 'display', weight: 700, size});
  withAlpha(c, a, () => {
    const h = size * 0.62, x0 = x - (wI + size * 0.75) / 2, xs = x0 + size * 0.6;
    poly(c, [[x0, y + h * 0.05], [x0 + size * 0.14, y - h * 0.08], [x0 + size * 0.32, y + h * 0.62], [xs - size * 0.05, y - h * 0.95], [xs + wI + size * 0.12, y - h * 0.95]], col, Math.max(2.5, size * 0.06), 1);
    stage.text(inner, xs + size * 0.06, y + size * 0.03, {role: 'display', weight: 700, size, color: col, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 14});
  });
}
const zoomAbout = (c, x, y, s) => { c.translate(x, y); c.scale(s, s); c.translate(-x, -y); };

// =====================================================================================================
// The black hole view used by the poster, hook, photo and close: side view of exact light rays ↔ face-on ring.
// World: x along the line of sight (+x away from the observer at the left), y up, z across. Camera yaw `alpha`:
// π/2 = side view (rays in the x–y plane), 0 = face-on (image plane z–y). Orthographic; screen X = z·cos α + x·sin α.
// =====================================================================================================
const B_SIDE = [0.7, 1.4, 2.0, 2.4, 2.58, 2.62, 2.75, 3.05, 3.5, 4.1, 4.9, 5.9, 7.0];
const SIDE_RAYS = B_SIDE.flatMap(b => [photonRay(b), photonRay(-b)]);
const RINGDOTS = (() => {
  const R = rng(41), d = [];
  for (let i = 0; i < 1700; i++) { const g = Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(TAU * R()); d.push([R() * TAU, 2.66 + Math.abs(g) * 0.3 + 0.03 * R(), 0.45 + 0.55 * R(), R() * TAU]); }
  for (let i = 0; i < 340; i++) d.push([R() * TAU, B_CRIT + 0.015 + 0.02 * R(), 1.1, R() * TAU]);
  return d;
})();
const ringBright = th => { const q = (1 + Math.cos(th + Math.PI / 2 - 0.35)) / 2; return 0.28 + 0.72 * q * q; };
function bhView(c, t, o) {
  const {cx, cy, s} = o, al = o.alpha ?? Math.PI / 2, sa = Math.sin(al), ca = Math.cos(al), flow = o.flow ?? 1;
  const X = x => cx + x * sa * s, Y = y => cy - y * s;
  const rayA = (o.rays ?? 1) * smooth(sa * 1.5 - 0.35), ringA = (o.ring ?? 1) * smooth(ca * 1.4 - 0.25);
  if (ringA > 0) { c.save(); c.beginPath(); c.ellipse(cx, cy, Math.max(0.5, B_CRIT * s * ca), B_CRIT * s, 0, 0, TAU); c.fillStyle = rgba('#000204', 0.92 * ringA); c.fill(); c.restore(); }
  if (rayA > 0) {
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    for (const R of SIDE_RAYS) {
      const crit = Math.abs(Math.abs(R.b) - B_CRIT) < 0.1, dim = o.dimRay ? o.dimRay(R) : 1; if (dim <= 0.01) continue;
      c.beginPath(); for (let i = R.i0; i <= R.i1; i++) { const p = R.pts[i]; i === R.i0 ? c.moveTo(X(p[0]), Y(p[1])) : c.lineTo(X(p[0]), Y(p[1])); }
      if (crit) { const k = o.crit ?? 1; c.strokeStyle = rgba(PAL.amber, 0.13 * rayA * dim * k); c.lineWidth = 9; c.stroke(); c.strokeStyle = rgba(PAL.amber, 0.85 * rayA * dim * k); c.lineWidth = 2; c.stroke(); }
      else { c.strokeStyle = rgba(PAL.ray, (R.captured ? 0.3 : 0.42) * rayA * dim); c.lineWidth = 1.6; c.stroke(); }
    }
    c.restore();
    strokeCircle(c, cx, cy, 1.5 * s, PAL.amber, 1.5, 0.28 * rayA * (o.sphere ?? 1), [6, 8]);
  }
  hole(c, cx, cy, s, 1, {lineA: Math.max(0.15, sa) * 0.95, halo: false});
  if (o.hzn > 0) strokeCircle(c, cx, cy, s, PAL.amber, 2.5, o.hzn, [9, 7]);
  if (ringA > 0) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 36; k++) { const th = k / 36 * TAU, br = ringBright(th); gl(c, cx + 2.8 * Math.cos(th) * s * ca, cy - 2.8 * Math.sin(th) * s, s * 0.55, PAL.amber, 0.09 * br * ringA); }
    for (const [th0, b, w, ph] of RINGDOTS) {
      const th = th0 + t * 0.06, br = ringBright(th) * w * (0.85 + 0.15 * Math.sin(t * 3 + ph * 7)), x = cx + b * Math.cos(th) * s * ca, y = cy - b * Math.sin(th) * s;
      c.globalAlpha = Math.min(1, ringA * br * 0.9); c.fillStyle = br > 0.7 ? PAL.amberHot : PAL.amber; c.beginPath(); c.arc(x, y, 1.2 + 1.4 * w * Math.min(1.2, s / 110), 0, TAU); c.fill();
    }
    c.restore();
  }
  // photons flowing along the rays (side view)
  const pa = (o.photons ?? 1) * rayA;
  if (pa > 0.01) {
    const v = o.v ?? 2.6;
    for (const R of SIDE_RAYS) {
      if (Math.abs(Math.abs(R.b) - B_CRIT) < 0.1) continue; if (flow < 0 && R.captured) continue;
      const dim = o.dimRay ? o.dimRay(R) : 1; if (dim <= 0.01) continue;
      const span = R.s1 - R.s0, cyc = span + 7;
      for (let k = 0; k < 2; k++) {
        const u = ((t * v + R.ph * cyc + k * cyc / 2) % cyc + cyc) % cyc;
        if (u < span) {
          const q = flow > 0 ? R.s0 + u : R.s1 - u, p = rayAt(R, q), b = rayAt(R, q - flow * 0.55);
          trail(c, [X(b[0]), Y(b[1])], [X(p[0]), Y(p[1])], pa * dim, 1.8); photonDot(c, X(p[0]), Y(p[1]), pa * dim);
        } else if (flow > 0 && R.captured && o.blips !== false) {
          const age = (u - span) / v; if (age < 0.5) { const p = R.pts[R.pts.length - 1]; gl(c, X(p[0]), Y(p[1]), 18, PAL.amberHot, 0.6 * pa * Math.exp(-age / 0.12)); }
        }
      }
    }
  }
}

// =====================================================================================================
// Time anchors (words from the tts text) and the shared plan
// =====================================================================================================
const Wd = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  light1: Wd('s01', '빛조차'), bound1: Wd('s01', '경계'), eh1: Wd('s01', '사건의'),
  y19: Wd('s02', '이천십구년'), bh2: Wd('s02', '블랙홀의'), shadow2: Wd('s02', '그림자를'), mid2: Wd('s02', '한가운데에'), eh2: Wd('s02', '지평선이'),
  cross3: Wd('s03', '넘으면'), light3: Wd('s03', '빛도'), matter3: Wd('s03', '물질도'), out3: Wd('s03', '나오지'),
  y1783: Wd('s04', '천칠백팔십삼년'), michell: Wd('s04', '미첼은'), light4: Wd('s04', '빛도'), heavy4: Wd('s04', '무거운'), dark4: Wd('s04', '어두운'),
  greek5: Wd('s05', '그리스어로'), circle5: Wd('s05', '원이라는'), eh5: Wd('s05', '사건의'), beyond5: Wd('s05', '너머의'), never5: Wd('s05', '결코'),
  earth6: Wd('s06', '지구를'), speed6: Wd('s06', '초속'), fly6: Wd('s06', '날아야'), esc6: Wd('s06', '탈출'),
  squeeze7: Wd('s07', '뭉칠수록'), up7: Wd('s07', '커지고'), light7: Wd('s07', '빛의'), equal7: Wd('s07', '같아지는'),
  need8: Wd('s08', '필요한'), light8: Wd('s08', '빛의'), bound8: Wd('s08', '경계입니다'),
  y1916: Wd('s09', '천구백십육년'), sch9: Wd('s09', '슈바르츠실트는'), eq9: Wd('s09', '방정식을'), size9: Wd('s09', '크기를'),
  sun10: Wd('s10', '태양을'), squeeze10: Wd('s10', '뭉치면'), km10: Wd('s10', '삼킬로미터'), earth10: Wd('s10', '지구라면'), mm10: Wd('s10', '구밀리미터가'),
  inside11: Wd('s11', '안쪽에서는'), any11: Wd('s11', '나아가든'), all11: Wd('s11', '모든'), center11: Wd('s11', '중심을'),
  far12: Wd('s12', '멀리서'), ship12: Wd('s12', '우주선은'), slow12: Wd('s12', '느려지고'), red12: Wd('s12', '붉어지다가'), stop12: Wd('s12', '멈춘'), dim12: Wd('s12', '희미해집니다'),
  but13: Wd('s13', '하지만'), big13: Wd('s13', '크다면'), crew13: Wd('s13', '우주선'), pass13: Wd('s13', '지나는'), notice13: Wd('s13', '알아차리지'),
  grav14: Wd('s14', '중력이'), slow14: Wd('s14', '느리게'), who14: Wd('s14', '보는'), diff14: Wd('s14', '다르게'),
  y15: Wd('s15', '이천십구년의'), all15: Wd('s15', '곳곳의'), tele15: Wd('s15', '전파망원경을'), tie15: Wd('s15', '묶어'), far15: Wd('s15', '멀리'), m87: Wd('s15', '엠팔칠'), core15: Wd('s15', '중심의'),
  mass16: Wd('s16', '육십오억'), eh16: Wd('s16', '지평선만'), nep16: Wd('s16', '해왕성'), times16: Wd('s16', '몇'),
  shadow17: Wd('s17', '그림자는'), eh17: Wd('s17', '지평선보다'), x26: Wd('s17', '이 점 육'), bend17: Wd('s17', '둘레에서'), bendW17: Wd('s17', '휘기'),
  around18: Wd('s18', '주변의'), vac18: Wd('s18', '진공청소기처럼'), suck18: Wd('s18', '빨아들일까요'),
  no19: Wd('s19', '아닙니다'), far19: Wd('s19', '멀리서는'), star19: Wd('s19', '별과'), same19: Wd('s19', '똑같이'), near19: Wd('s19', '가까이'), back19: Wd('s19', '돌아올'),
  esc20: Wd('s20', '빠져나가는'), light20: Wd('s20', '빛의'), bound20: Wd('s20', '경계입니다'),
};
export const MORPH = [0.9, 1.7];
// hook: highlighted crossings (exact geodesics, chosen so they land on the horizon at the planned times)
const HL = {ray0: photonRay(-1.7), ray1: photonRay(1.4), ray2: photonRay(-2.2), mat: matterOrbit(1.75, {r0: 8, sg: -1, rot: -0.25}), inPt: [0.62 * Math.cos(0.75), 0.62 * Math.sin(0.75)]};
// origin: Michell's star (v_esc in units of c)
const MICH = {vLight: 0.45, vDark: 1.3, TS: 0.3};
// s05: eye and two events (r_s units; centre of the hole at 0)
const S05 = {s: 180, cx: 540, cy: 860, eye: [2.0, 0], e1: [1.32 * Math.cos(-0.5), 1.32 * Math.sin(-0.5)], e2: [0.62 * Math.cos(2.5), 0.62 * Math.sin(2.5)], TS: 0.45};
// essence: Earth launches (GM = 1, R = 1 → v_esc = √2); f = v0 / v_esc
const LAUNCH = [{f: 0.5, th: -0.5}, {f: 0.7, th: 0.48}, {f: 0.85, th: -0.12}, {f: 1.0, th: 0.24}];
const ETS = 0.25;                                                    // screen s per √(R³/GM)
// s11 light cones: emission radii (r_s), cone height in r_s/c
const CONES = [[2.8, 0], [1.95, 0.25], [1.4, -0.3], [1.0, 0.45], [0.58, -0.6]].map(([r, f]) => [r * Math.cos(f), r * Math.sin(f), r]), CONE_H = 0.42;
// photo: EHT sites that observed M87* in 2017
export const SITES = [{n: '하와이', lat: 19.8, lon: -155.5}, {n: '애리조나', lat: 32.7, lon: -109.9}, {n: '멕시코', lat: 19.0, lon: -97.3}, {n: '칠레', lat: -23.0, lon: -67.8}, {n: '스페인', lat: 37.1, lon: -3.4}];
// myth: test particles near the hole (E = 1): swing-by and capture
const MYTH = {swing: matterOrbit(2.25, {r0: 9, sg: 1, rot: -0.35}), plunge: matterOrbit(1.85, {r0: 9, sg: 1, rot: 0.35}), TS: 0.11};

const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {_tl: tl};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  for (const [k, r] of Object.entries(A)) P[k] = at(r);
  P.end = tl.duration;
  // ---- hook
  P.x0 = P.bound1 + 0.25; P.eh1f = P.eh1 + 0.05;
  P.rotA = [P.y19 + 0.05, P.y19 + 2.3]; P.hzn2 = P.mid2 - 0.05; P.rotB = [at('s03') - 0.95, at('s03') + 0.45];
  P.x1 = P.cross3 + 0.35; P.x2 = P.light3 + 0.25; P.x3 = P.matter3 + 0.3; P.in3 = P.out3 - 0.15;
  // ---- origin
  P.s04 = sc('origin').start; P.heavy = P.heavy4 - 0.3; P.dark = P.dark4 - 0.05; P.s05 = at('s05') - 0.55;
  P.vesc = tt => lerp(MICH.vLight, MICH.vDark, smooth((tt - P.heavy) / 0.8));
  P.launchM = []; for (let k = 0, tt = P.michell - 0.35; tt < P.s05 - 0.9; k++, tt += 0.3) P.launchM.push({t0: tt, th: -Math.PI / 2 + ((k * 2.39996) % TAU) * 0.62 - 1.95, v: P.vesc(tt)});
  P.returnsM = P.launchM.filter(L => L.v > 1.0).map(L => { const F = radialFlight(1, L.v * L.v / 2); return F.landed ? L.t0 + F.T * MICH.TS : null; }).filter(x => x != null && x < P.s05);
  P.morph5 = [P.circle5 - 0.45, P.circle5 + 0.9]; P.ehOn5 = P.eh5 - 0.15; P.e1 = P.beyond5 - 0.15; P.e2 = P.never5 - 0.2;
  { const F = gpFront(S05.e1[0], S05.e1[1], 3), [ex, ey] = S05.eye; let hit = null;
    for (let k = 0; k < F.frames.length && hit == null; k++) for (const [x, y] of F.frames[k]) if (Math.hypot(x - ex, y - ey) < 0.07) { hit = k * F.dh; break; }
    P.e1h = hit ?? 1.2; P.e1arr = P.e1 + P.e1h * S05.TS; }
  // ---- essence
  P.s06 = sc('essence').start; P.s07 = at('s07') - 0.55; P.s08 = at('s08') - 0.55;
  P.launchE = LAUNCH.map((L, k) => ({...L, t0: k < 3 ? P.earth6 - 0.2 + 0.55 * k : P.speed6 + 0.6}));
  P.landE = P.launchE.map(L => { const F = radialFlight(L.f * Math.SQRT2, 1, 60); return F.landed ? L.t0 + F.T * ETS : null; });
  P.shrink = [P.squeeze7 - 0.2, P.equal7 + 0.05]; P.hitC = P.shrink[1];
  P.slide8 = [P.need8 - 0.35, P.light8 + 0.45]; P.hit8 = P.slide8[1];
  // ---- radius
  P.s09 = sc('radius').start; P.s10 = at('s10') - 0.5; P.s11 = at('s11') - 0.55;
  P.sunC = [P.squeeze10 - 0.25, P.km10 + 0.05]; P.earC = [P.earth10 + 0.2, P.mm10 + 0.1];
  P.flash11 = P.s11 + 0.35; P.tilt11 = [P.any11 - 0.1, P.all11 + 0.2]; P.flash11b = P.all11 + 0.05;
  // ---- time
  // fall0: the ship's first light reaches the far observer on "멀리서"
  P.s12 = sc('time').start; P.fall0 = P.far12 - 0.1 - (tort(FALL.rObs) - tort(FALL.r0)) * FALL.KT;   P.s13 = at('s13') - 0.5; P.s14 = at('s14') - 0.6;
  P.tc = tt => (tt - P.fall0) / FALL.KT;                              // screen → coordinate time (r_s/c)
  P.arrivals = PULSES.map(p => ({...p, ts: P.fall0 + p.ta * FALL.KT})).filter(p => p.ts < P.s14 + 0.2);
  P.crossTau = (2 / 3) * (OWN_R0 ** 1.5 - 1); P.own0 = P.notice13 + 0.1 - P.crossTau * FALL.KT; P.pass = P.own0 + P.crossTau * FALL.KT;   // the crew's replay crosses the horizon on "알아차리지"
  P.ownTicks = []; for (let k = 1; ; k++) { const ts = P.own0 + k * FALL.dTau * FALL.KT, r = rOfTau(k * FALL.dTau, OWN_R0); if (ts > P.s14 - 0.1 || r < 0.2) break; if (ts > P.s13 + 0.3) P.ownTicks.push({ts, r}); }
  P.dialPer = 3.0; P.clk14 = [1.15, 1.8, 3.5, 8.0];
  P.farTicks = []; for (let tt = P.s14 + 0.6; tt < sc('time').end - 0.3; tt += P.dialPer / 4) P.farTicks.push(+tt.toFixed(4));
  P.nearTicks = []; for (let tt = P.s14 + 0.6; tt < sc('time').end - 0.3; tt += P.dialPer / 4 / clockRate(P.clk14[0])) P.nearTicks.push(+tt.toFixed(4));
  // ---- photo
  P.s15 = sc('photo').start; P.siteT = SITES.map((_, k) => P.all15 - 0.1 + 0.22 * k); P.linkT = [0, 1, 2, 3].map(k => P.tie15 - 0.1 + 0.18 * k);
  P.pan15 = [P.far15 + 0.05, P.m87 + 0.7]; P.zoomG = [P.core15 - 0.2, at('s15:end') + 0.7];
  P.s16 = at('s16') - 0.4; P.dive16 = [P.s16, P.eh16 + 0.2]; P.s17 = at('s17') - 0.5; P.rot17 = [P.x26 + 1.3, P.bend17 + 0.35];
  // ---- myth
  P.s18 = sc('myth').start; P.no = P.no19 - 0.1; P.zoom19 = [P.near19 - 0.5, P.near19 + 0.6];
  P.capT = P.back19 + 0.15; P.mythT0 = P.capT - MYTH.plunge.T * MYTH.TS;      // plunging particle reaches the horizon on "돌아올"
  // ---- close
  P.s20 = sc('close').start; P.slide20 = [P.s20 + 0.3, P.light20 - 0.25]; P.hit20 = P.slide20[1]; P.poster = P.hit20 + 0.45;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Header titles and poster
// =====================================================================================================
const POSTER_Q = {y: 1085, y2: 1222, q: '빛도 못 나오는 경계?', ans: '사건의 지평선'};
function titleList(id, P) {
  if (id === 'hook') return [[-Infinity, '오늘의 주제', POSTER_Q.q], [P.rotA[0] - 0.25, '2019 · 첫 블랙홀 사진', '블랙홀의 그림자'], [P._tl.at('s03') - 0.6, '사건의 지평선', '넘으면 돌아올 수 없다']];
  if (id === 'origin') return [[-Infinity, '1783 · 영국', '미첼의 어두운 별'], [P.s05, '이름 · horizon', '경계를 긋는 원']];
  if (id === 'essence') return [[-Infinity, '본질 · 탈출 속도', '지구는 초속 11.2 km'], [P.s07, '본질 · 같은 질량', '작게 뭉칠수록 빨라야'], [P.s08, '본질 · 사건의 지평선', '탈출 속도 = 빛의 속도']];
  if (id === 'radius') return [[-Infinity, '1916 · 슈바르츠실트', '경계의 크기'], [P.s10, '같은 질량을 뭉치면', '태양 3 km · 지구 9 mm'], [P.s11, '지평선 안쪽', '모든 길이 중심으로']];
  if (id === 'time') return [[-Infinity, '멀리서 본 모습', '느려지고 붉어진다'], [P.s13, '우주선 안의 시계', '그대로 흐른다'], [P.s14, '중력과 시간', '보는 사람마다 다르다']];
  if (id === 'photo') return [[-Infinity, '2019 · EHT', '지구만 한 망원경'], [P.s16, 'M87* · 태양 65억 개', '해왕성 궤도보다 크다'], [P.s17, '그림자 · 휘는 빛', '지평선의 약 2.6배']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '진공청소기일까?'], [P.no - 0.1, '오해 바로잡기', '멀리서는 별과 같다']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const c = stage.ctx, T = stage.theme, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: T.accent, align: 'center', tracking: 2, ...so}); line(c, [[510, 176], [570, 176]], T.accent, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 230, {role: 'display', weight: 700, size: 56, color: T.ink, align: 'center', maxWidth: 840, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 294, {role: 'display', weight: 700, size: 36, color: PAL.answer, align: 'center', ...so}));
}
let QSIZE = 0, ASIZE = 0;
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme, TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q, 840, 104); ASIZE ||= fit(POSTER_Q.ans, 880, 156);
  const y1 = lerp(POSTER_Q.y, 230, q), s1 = lerp(QSIZE, 56, q), y2 = lerp(POSTER_Q.y2, 294, q), s2 = lerp(ASIZE, 36, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g2 = c.createLinearGradient(0, 950, 0, 1330); g2.addColorStop(0, 'rgba(0,8,13,0)'); g2.addColorStop(0.28, 'rgba(0,8,13,0.72)'); g2.addColorStop(0.75, 'rgba(0,8,13,0.72)'); g2.addColorStop(1, 'rgba(0,8,13,0)'); c.fillStyle = g2; c.fillRect(0, 950, 1080, 380); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER_Q.q, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', tracking: tr * s2, shadow: sh, shadowBlur: 28});
  });
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, t); return; }
  if (!(id === 'close' && t >= P.poster)) captionBand(stage.ctx);
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, t, 1 - easeInOut((t - P.poster) / 0.9), 1); return; }
    const a = smooth(ctx.scene.p / 0.05) * fadeOut(t, P.poster - 0.4, 0.4); if (a > 0) head(stage, '정리', '탈출 속도가 빛의 속도인 곳', a, a);
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, P), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook' && k === 0) head(stage, cur[1], cur[2], fadeIn(t, MORPH[1] - 0.05, 0.4) * a, a, POSTER_Q.ans, a);
  else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out), id === 'hook' && k === 1 ? POSTER_Q.ans : '', a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage) { stage.ctx.fillStyle = '#000A10'; stage.ctx.fillRect(0, 0, W, H); }

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/event-horizon/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.arrivals.length}/${P.e1arr.toFixed(3)}/${P.capT.toFixed(3)}/${PULSES.length}`; }
const shake = (c, t, t0, amp = 6) => { const k = Math.exp(-(t - t0) / 0.18) * (t > t0 ? 1 : 0); if (k > 0.01) c.translate(amp * k * Math.sin(t * 91), amp * k * Math.cos(t * 77)); };
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  radius(stage, t, p, ctx) { radiusScene(stage, t, ctx); },
  time(stage, t, p, ctx) { timeScene(stage, t, ctx); },
  photo(stage, t, p, ctx) { photoScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → face-on ring → crossing the horizon
const POSTER_VIEW = {cx: 540, cy: 610, s: 62};
function posterPicture(stage, t, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => { seriesBg(c, t, {hole: [POSTER_VIEW.cx, POSTER_VIEW.cy, POSTER_VIEW.s * 2.7]}); bhView(c, t + 2.0, {...POSTER_VIEW, alpha: Math.PI / 2}); });
}
function hookCam(t, P) {
  let s = POSTER_VIEW.s, cy = POSTER_VIEW.cy, cx = 540, alpha = Math.PI / 2;
  const g = smooth((t - MORPH[1]) / 4.2); s = lerp(s, 76, g); cy = lerp(cy, 790, smooth((t - MORPH[1] + 0.3) / 1.6));
  const r = easeInOut((t - P.rotA[0]) / (P.rotA[1] - P.rotA[0])); alpha = lerp(alpha, 0, r); s = lerp(s, 112, r);
  const b = easeInOut((t - P.rotB[0]) / (P.rotB[1] - P.rotB[0])); alpha = lerp(alpha, Math.PI / 2, b); s = lerp(s, 178, b); cy = lerp(cy, 830, b); cx = lerp(cx, 560, b);
  return {cx, cy, s, alpha};
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < MORPH[0]) { posterPicture(stage, t); return; }
  const cam = hookCam(t, P), ringOn = t > P.rotA[0] && t < P.rotB[1];
  seriesBg(c, t, {hole: [cam.cx, cam.cy, cam.s * 2.7]});
  c.save(); if (t > MORPH[1]) { c.beginPath(); c.rect(0, 318, W, 1020); c.clip(); }
  shake(c, t, P.x3, 5);
  const hz = fadeIn(t, P.hzn2, 0.3) * fadeOut(t, P.rotB[0] + 0.3, 0.4);
  const zin = smooth((t - P.rotB[0]) / (P.rotB[1] - P.rotB[0]));
  bhView(c, t + 2.0, {...cam, hzn: hz, blips: t < P.rotB[0], crit: 1 - 0.6 * zin, dimRay: R => (R.captured ? 1 : 1 - 0.55 * zin)});
  horizonFlash(c, cam.cx, cam.cy, cam.s, t - P.hzn2); horizonFlash(c, cam.cx, cam.cy, cam.s, t - P.eh1f, 0.8);
  { const R = HL.ray0, v = 2.6, sq = R.L - v * (P.x0 - t), X = x => cam.cx + x * cam.s * Math.sin(cam.alpha), Y = y => cam.cy - y * cam.s;
    if (t < P.x0 && sq > R.L - 8) { const p = rayAt(R, sq), b = rayAt(R, sq - 0.8); trail(c, [X(b[0]), Y(b[1])], [X(p[0]), Y(p[1])], 1, 2.4, PAL.rayHot); photonDot(c, X(p[0]), Y(p[1]), 1, 3.6); }
    const e = R.pts[R.pts.length - 1]; burst(c, X(e[0]), Y(e[1]), t - P.x0, 90, PAL.ray, 0.9); }
  // s03: highlighted crossings (light, light, matter) and a flash inside the horizon
  if (t > P.rotB[0]) {
    const X = x => cam.cx + x * cam.s * Math.sin(cam.alpha), Y = y => cam.cy - y * cam.s, v = 2.6;
    for (const [R, tx] of [[HL.ray1, P.x1], [HL.ray2, P.x2]]) {
      const sq = R.L - v * (tx - t);
      if (t < tx && sq > R.L - 9) { const p = rayAt(R, sq), b = rayAt(R, sq - 0.8); trail(c, [X(b[0]), Y(b[1])], [X(p[0]), Y(p[1])], 1, 2.4, PAL.rayHot); photonDot(c, X(p[0]), Y(p[1]), 1, 3.6); }
      const e = R.pts[R.pts.length - 1]; burst(c, X(e[0]), Y(e[1]), t - tx, 110, PAL.ray, 0.9);
    }
    { const O = HL.mat, tau = O.T - (P.x3 - t) / 0.42; if (t < P.x3 && tau > O.T - 7) { const p = orbitAt(O, tau), b = orbitAt(O, tau - 0.5); trail(c, [X(b[0]), Y(b[1])], [X(p[0]), Y(p[1])], 1, 3, PAL.matter); gl(c, X(p[0]), Y(p[1]), 22, PAL.matter, 0.6); circle(c, X(p[0]), Y(p[1]), 5, '#FFF4E0'); }
      const e = O.pts[O.pts.length - 1]; burst(c, X(e[0]), Y(e[1]), t - P.x3, 130, PAL.amberHot, 1); }
    const fa = t - P.in3;
    if (fa > -0.05 && fa < 2.2) {
      const F = gpFront(HL.inPt[0], HL.inPt[1], 1.0), pts = frontAt(F, Math.max(0.005, fa * 0.5)).map(([x, y]) => [X(x), Y(y)]);
      const al = fadeOut(fa, 1.5, 0.6); gl(c, X(HL.inPt[0]), Y(HL.inPt[1]), 40, PAL.rayHot, 0.8 * Math.exp(-fa / 0.15));
      poly(c, [...pts, pts[0]], PAL.ray, 2, 0.9 * al); for (let i = 0; i < pts.length; i += 5) photonDot(c, pts[i][0], pts[i][1], 0.8 * al, 2.2);
    }
  }
  c.restore();
  // labels
  const T2 = fadeIn(t, P.shadow2 + 0.1) * fadeOut(t, P.rotB[0], 0.3), T3 = fadeIn(t, P.hzn2 + 0.15) * fadeOut(t, P.rotB[0], 0.3);
  if (T2 > 0) { const r = B_CRIT * cam.s; leaderLine(c, [cam.cx + 300, cam.cy + r + 70], [cam.cx + r * 0.62, cam.cy + r * 0.62], PAL.amber, T2); label(stage, '그림자', cam.cx + 300, cam.cy + r + 108, T2, {size: 36, color: PAL.amberHot}); }
  if (T3 > 0) { leaderLine(c, [cam.cx - 250, cam.cy - cam.s - 230], [cam.cx - cam.s * 0.7, cam.cy - cam.s * 0.7], PAL.amber, T3); label(stage, '사건의 지평선', cam.cx - 250, cam.cy - cam.s - 265, T3, {size: 36, color: PAL.amber}); }
  big(stage, '2019', 540, 1270, 120, '#FFFFFF', fadeIn(t, P.y19 - 0.1, 0.4) * fadeOut(t, P.rotB[0] + 0.2, 0.4));
  const L3 = fadeIn(t, P.cross3) * fadeOut(t, ctx.scene.end - 0.4, 0.3);
  if (L3 > 0) label(stage, '사건의 지평선', cam.cx, cam.cy + cam.s + 70, L3, {size: 36, color: PAL.amber});
}

// ------------------------------------------------------------------ origin: Michell's dark star; horizon → circle → events
const STARDOTS = (() => { const R = rng(23), d = []; for (let i = 0; i < 750; i++) { const r = Math.sqrt(R()) * 0.985, a = R() * TAU; d.push([r * Math.cos(a), r * Math.sin(a), R()]); } return d; })();
function starDisk(c, t, cx, cy, R, dark = 0, a = 1) {
  if (a <= 0.01) return;
  withAlpha(c, a, () => {
    gl(c, cx, cy, R * 2.2, PAL.star, 0.18 * (1 - dark)); circle(c, cx, cy, R, mix('#2A1A08', PAL.hole, dark));
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, ph] of STARDOTS) { const d = Math.hypot(x, y), b = (1 - 0.6 * d * d) * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (1 + ph) + ph * 20))) * (1 - 0.88 * dark);
      c.globalAlpha = b * 0.8; c.fillStyle = b > 0.7 ? PAL.amberHot : PAL.star; c.beginPath(); c.arc(cx + x * R, cy + y * R, 1.3 + 2.2 * b, 0, TAU); c.fill(); }
    c.restore();
    strokeCircle(c, cx, cy, R, mix(PAL.star, PAL.muted, dark), 2, 0.8);
  });
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.s05) { michellShot(stage, t, P); fadeFromBlack(c, t, P.s04); return; }
  horizonWordShot(stage, t, P); fadeFromBlack(c, t, P.s05, 0.3);
}
function michellShot(stage, t, P) {
  const c = stage.ctx, cx = 540, cy = 760, z = 1 + 0.06 * smooth((t - P.s04) / 7), R = 158 * z, dark = smooth((t - P.dark) / 0.9);
  seriesBg(c, t);
  // corpuscles of light (Newtonian), each launched at c with the star's v_esc at that moment
  for (const L of P.launchM) {
    const u = (t - L.t0) / MICH.TS; if (u < 0) continue;
    const F = radialFlight(1, L.v * L.v / 2, 40), r = flightAt(F, u); if (r == null) { const age = t - (L.t0 + F.T * MICH.TS); if (age < 0.4) gl(c, cx + Math.cos(L.th) * R, cy + Math.sin(L.th) * R, 14, PAL.ray, 0.6 * (1 - age / 0.4)); continue; }
    if (r * R > 1400) continue;
    const r0 = flightAt(F, Math.max(0, u - 1.4)) ?? 1, p = [cx + Math.cos(L.th) * r * R, cy + Math.sin(L.th) * r * R];
    poly(c, [[cx + Math.cos(L.th) * R, cy + Math.sin(L.th) * R], [cx + Math.cos(L.th) * Math.max(r, r0) * R, cy + Math.sin(L.th) * Math.max(r, r0) * R]], PAL.ray, 1.5, 0.22);
    trail(c, [cx + Math.cos(L.th) * r0 * R, cy + Math.sin(L.th) * r0 * R], p, 0.9, 2); photonDot(c, p[0], p[1], 1, 3);
  }
  starDisk(c, t, cx, cy, R, dark);
  const ha = fadeIn(t, P.heavy, 0.5); if (ha > 0) burst(c, cx, cy, t - P.heavy, R * 1.2, PAL.star, 0.5);
  big(stage, '1783', 540, 1215, 150, '#FFFFFF', fadeIn(t, P.y1783 - 0.15, 0.4));
  label(stage, '빛', cx + 250, cy - 250, fadeIn(t, P.light4 - 0.1) * fadeOut(t, P.dark, 0.3), {size: 38, color: PAL.ray});
  label(stage, '어두운 별', cx, cy + R + 70, fadeIn(t, P.dark + 0.4), {size: 40, color: PAL.amber});
}
function horizonWordShot(stage, t, P) {
  const c = stage.ctx, {s, cx, cy} = S05, m = smooth((t - P.morph5[0]) / (P.morph5[1] - P.morph5[0])), eh = smooth((t - P.ehOn5) / 0.5);
  seriesBg(c, t, {stars: 1 - 0.4 * eh});
  // the ground horizon (huge circle) bends into a closed circle of radius s
  const Rr = Math.exp(lerp(Math.log(3200), Math.log(s), m)), ccy = lerp(860 + 3200, cy, m) - (m < 1 ? (1 - m) * 0 : 0), top = ccy - Rr;
  const phi = Math.min(Math.PI, Math.max(Math.asin(Math.min(1, 620 / Rr)), m * Math.PI));
  if (eh > 0) withAlpha(c, eh, () => circle(c, cx, cy, s, PAL.hole));
  if (m < 0.98) withAlpha(c, (1 - m) * 0.55, () => { c.save(); c.beginPath(); c.arc(cx, ccy, Rr, 0, TAU); c.fillStyle = 'rgba(0,10,16,0.9)'; c.fill(); c.restore(); });
  c.save(); c.beginPath(); c.arc(cx, ccy, Rr, -Math.PI / 2 - phi, -Math.PI / 2 + phi); const lc = mix(PAL.line, PAL.amber, Math.max(m, eh)); c.strokeStyle = rgba(lc, 0.16); c.lineWidth = 10; c.stroke(); c.strokeStyle = rgba(lc, 1); c.lineWidth = 3; c.stroke(); c.restore();
  if (m < 0.6) { const a = 1 - smooth(m / 0.6); gl(c, cx, top, 260, PAL.amber, 0.08 * a); }
  if (eh > 0) { gl(c, cx, cy, s * 1.7, PAL.amber, 0.07 * eh); horizonFlash(c, cx, cy, s, t - P.ehOn5); }
  void top;
  // eye (observer) and two events
  const X = x => cx + x * s, Y = y => cy + y * s, ea = fadeIn(t, P.ehOn5 + 0.2, 0.4) * fadeOut(t, P._tl.scene('origin').end - 0.35, 0.3);
  if (ea > 0) withAlpha(c, ea, () => { const ex = X(S05.eye[0]), ey = Y(S05.eye[1]); c.save(); c.beginPath(); c.ellipse(ex, ey, 26, 15, 0, 0, TAU); c.strokeStyle = rgba(PAL.ink, 0.95); c.lineWidth = 2.5; c.stroke(); c.restore(); circle(c, ex, ey, 7, PAL.ink);
    if (t > P.e1arr) ringFx(c, ex, ey, 30 + 30 * (t - P.e1arr), PAL.ray, 0.9 * Math.exp(-(t - P.e1arr) / 0.5)); });
  for (const [e, t0, inside] of [[S05.e1, P.e1, false], [S05.e2, P.e2, true]]) {
    const age = t - t0; if (age < 0) continue;
    const F = gpFront(e[0], e[1], 3), h = age / S05.TS, al = inside ? fadeOut(h, 1.0, 0.5) : fadeOut(age, P.e1arr - P.e1 + 0.6, 0.5);
    burst(c, X(e[0]), Y(e[1]), age, 70, inside ? PAL.ray : PAL.rayHot, 0.8);
    if (al > 0.01) { const pts = frontAt(F, Math.min(h, 3)).map(([x, y]) => [X(x), Y(y)]); poly(c, [...pts, pts[0]], PAL.ray, 2, 0.9 * al); for (let i = 0; i < pts.length; i += 4) photonDot(c, pts[i][0], pts[i][1], 0.75 * al, 2.2); }
  }
  // words
  big(stage, 'horizōn', 540, 470, 112, '#FFFFFF', fadeIn(t, P.greek5 - 0.2) * fadeOut(t, P.ehOn5, 0.4), {role: 'body'});
  label(stage, '경계를 긋는 원', 540, 560, fadeIn(t, P.circle5 - 0.2) * fadeOut(t, P.ehOn5, 0.4), {size: 40, color: PAL.amber});
  label(stage, '사건의 지평선', cx, cy - s - 60, fadeIn(t, P.ehOn5 + 0.3), {size: 38, color: PAL.amber});
  label(stage, '관측자', X(S05.eye[0]), Y(S05.eye[1]) + 62, ea, {size: 32, color: PAL.ink});
  label(stage, '볼 수 없음', X(S05.e2[0]) - 40, Y(S05.e2[1]) + s * 1.05 + 90, fadeIn(t, P.e2 + 0.9), {size: 36, color: PAL.ray});
}

// ------------------------------------------------------------------ essence: launches from Earth → squeeze → v_esc = c
function thinGlobe(c, cx, cy, R, lam, a = 1, o = {}) {
  if (a <= 0.01 || R < 2) return;
  withAlpha(c, a, () => {
    circle(c, cx, cy, R, o.fill || '#02202D');
    if (R > 30) { const V = makeView({cx, cy, R}, lam, o.tilt ?? 18, 0); c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
      graticule(c, V, {a: 0.16, col: '#7FB8C8', w: 1}); landPath(c, V, LAND); c.strokeStyle = rgba(PAL.land, 0.75); c.lineWidth = R > 120 ? 1.6 : 1.1; c.lineJoin = 'round'; c.stroke(); c.restore(); }
    strokeCircle(c, cx, cy, R, '#BFE4F2', 2, 0.7);
  });
}
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.s07) { launchShot(stage, t, P); fadeFromBlack(c, t, P.s06); return; }
  if (t < P.s08) { squeezeShot(stage, t, P); return; }
  horizonGraph(stage, t, P, {slide: P.slide8, hit: P.hit8, labels: true, fromT: P.s08});
}
// camera radius in Earth radii: follows the highest dot with a 0.7 s lag and never zooms back in (table per frame)
function launchCamTable(P) {
  if (P._lc) return P._lc;
  const t0 = P.s06, t1 = P.s07 + 1.5, dt = 1 / 30, n = Math.ceil((t1 - t0) / dt) + 1, out = new Float64Array(n);
  let m = 1.9;
  for (let i = 0; i < n; i++) {
    const tt = t0 + i * dt; let tgt = 1.9;
    for (const L of P.launchE) { const u = (tt - L.t0) / ETS; if (u < 0) continue; const r = flightAt(radialFlight(L.f * Math.SQRT2, 1, 60), u); if (r) tgt = Math.max(tgt, Math.min(L.f >= 1 ? 9 : 99, r * 1.25)); }
    m = Math.max(m, m + (tgt - m) * Math.min(1, dt / 0.7)); out[i] = m;
  }
  return (P._lc = {t0, dt, out});
}
const launchCam = (t, P) => { const T = launchCamTable(P), i = clamp(Math.round((t - T.t0) / T.dt), 0, T.out.length - 1); return T.out[i]; };
function launchShot(stage, t, P) {
  const c = stage.ctx, Rc = launchCam(t, P), k = 640 / Rc, cx = 540, cy = 1160;
  seriesBg(c, t);
  thinGlobe(c, cx, cy, k, -60 + t * 3, 1);
  P.launchE.forEach((L, i) => {
    const u = (t - L.t0) / ETS; if (u < 0) return;
    const F = radialFlight(L.f * Math.SQRT2, 1, 60), r = flightAt(F, u), dir = [Math.sin(L.th), -Math.cos(L.th)], esc = L.f >= 1;
    const col = esc ? PAL.amber : PAL.ray, base = [cx + dir[0] * k, cy + dir[1] * k];
    let top = 1; for (const [, rr] of F.out) { if (rr > top) top = rr; if (F.out[0] && rr < top) break; }
    if (r == null) { const age = t - (L.t0 + F.T * ETS); poly(c, [base, [cx + dir[0] * top * k, cy + dir[1] * top * k]], col, 1.5, 0.3 * fadeOut(age, 1.5, 0.6)); burst(c, base[0], base[1], age, 46, PAL.ray, 0.7); return; }
    const p = [cx + dir[0] * r * k, cy + dir[1] * r * k], r0 = flightAt(F, Math.max(0, u - 1.0)) ?? 1, hi = Math.max(...F.out.filter(q => q[0] <= u).map(q => q[1]));
    poly(c, [base, [cx + dir[0] * hi * k, cy + dir[1] * hi * k]], col, 1.5, 0.3);
    trail(c, [cx + dir[0] * r0 * k, cy + dir[1] * r0 * k], p, 1, esc ? 2.6 : 2, col); photonDot(c, p[0], p[1], 1, esc ? 4.2 : 3.2, col);
    if (esc) label(stage, '탈출 속도', clamp(p[0] + 140, 260, 860), clamp(p[1] + 10, 640, 1240), fadeIn(t, P.esc6 - 0.1), {size: 38, color: PAL.amber});
    burst(c, base[0], base[1], t - L.t0, esc ? 70 : 40, col, esc ? 0.9 : 0.5);
  });
  big(stage, '11.2 km/s', 320, 450, 104, '#FFFFFF', fadeIn(t, P.speed6 - 0.1, 0.4));
  label(stage, '지구 표면 · 초속', 320, 535, fadeIn(t, P.speed6 + 0.2, 0.4), {size: 34, color: PAL.muted});
}
const fmtR = m => (m >= 1000 ? `${Math.round(m / 1000).toLocaleString('en-US')} km` : m >= 1 ? `${m >= 10 ? Math.round(m) : m.toFixed(1)} m` : `${m * 1000 >= 10 ? Math.round(m * 1000) : (m * 1000).toFixed(1)} mm`);
const fmtV = v => (v < 1000 ? `${v.toFixed(1)} km/s` : `${(Math.round(Math.min(v, NUM.cKm) / 1000) * 1000).toLocaleString('en-US')} km/s`);
function squeezeShot(stage, t, P) {
  const c = stage.ctx, q = smooth((t - P.shrink[0]) / (P.shrink[1] - P.shrink[0])), lR0 = Math.log10(NUM.rEarthM), lR1 = Math.log10(NUM.rsEarthM), lR = lerp(lR0, lR1, q);
  const Rm = 10 ** lR, v = vEarthAt(Rm), hit = t >= P.hitC, intro = smooth((t - P.s07) / 0.8);
  seriesBg(c, t);
  const gx = lerp(540, 300, intro), gy = lerp(1100, 560, intro), Rv0 = lerp(48, 200, intro), Rv = lerp(36, Rv0, (lR - lR1) / (lR0 - lR1));
  if (!hit) { thinGlobe(c, gx, gy, Rv, -60 + t * 3, 1, {fill: mix('#02202D', '#0A0604', q)}); if (q > 0) gl(c, gx, gy, Rv * 1.6, PAL.amber, 0.15 * q * q); }
  else { hole(c, gx, gy, 36); burst(c, gx, gy, t - P.hitC, 120, PAL.amberHot, 1); }
  // readouts
  const ra = fadeIn(t, P.s07 + 0.4, 0.4);
  label(stage, '반지름', 760, 445, ra, {size: 32, color: PAL.muted}); big(stage, hit ? '8.9 mm' : fmtR(Rm), 760, 505, 72, '#FFFFFF', ra);
  label(stage, '탈출 속도', 760, 600, ra, {size: 32, color: PAL.muted}); big(stage, hit ? '300,000 km/s' : fmtV(v), 760, 660, hit ? 62 : 72, hit ? PAL.amber : '#FFFFFF', ra);
  // the graph: log v vs log R (axis reversed: smaller to the right); v ∝ R^(−1/2) is a straight line
  const ga = fadeIn(t, P.s07 + 0.2, 0.5), gxL = 150, gxR = 930, gyB = 1290, perDec = 82, X = lr => lerp(gxL, gxR, (7 - lr) / 10), Y = lv => gyB - (lv - 1) * perDec;
  if (ga > 0) withAlpha(c, ga, () => {
    c.save(); c.strokeStyle = rgba(PAL.grid, 0.9); c.lineWidth = 1;
    for (let lv = 1; lv <= 6; lv++) { c.beginPath(); c.moveTo(gxL, Y(lv)); c.lineTo(gxR, Y(lv)); c.stroke(); }
    for (let lr = 7; lr >= -3; lr -= 2) { c.beginPath(); c.moveTo(X(lr), Y(1)); c.lineTo(X(lr), Y(6)); c.stroke(); }
    c.restore();
    poly(c, [[gxL, Y(6.1)], [gxL, gyB], [gxR + 10, gyB]], PAL.line, 2, 0.8);
    const yc = Y(Math.log10(NUM.cKm)); poly(c, [[gxL, yc], [gxR, yc]], PAL.amber, 2.5, 0.9, [12, 8]);
    if (hit) ringFx(c, X(lR1), yc, 10 + 140 * easeOut((t - P.hitC) / 1.0), PAL.amber, Math.exp(-(t - P.hitC) / 0.6));
    const pts = []; for (let i = 0; i <= 60; i++) { const l = lerp(lR0, lR, i / 60); pts.push([X(l), Y(Math.log10(vEarthAt(10 ** l)))]); }
    poly(c, pts, PAL.ray, 6, 0.15); poly(c, pts, PAL.ray, 2.5, 0.95);
    const hp = pts[pts.length - 1]; gl(c, hp[0], hp[1], 30, hit ? PAL.amber : PAL.ray, 0.7); circle(c, hp[0], hp[1], 6, '#FFFFFF');
    label(stage, '빛의 속도', gxR - 10, yc - 34, 1, {size: 32, color: PAL.amber, align: 'right'});
    label(stage, '작게 뭉칠수록 →', gxR - 10, gyB + 34 > 1325 ? gyB - 30 : gyB + 34, 1, {size: 30, color: PAL.muted, align: 'right'});
  });
}
/** symmetric escape-speed graph around the hole: v_esc/c = √(r_s/|r|), markers slide in and hit c at the horizon */
function horizonGraph(stage, t, P, o) {
  const c = stage.ctx, cx = 540, y0 = 1150, k = 128, Ky = 420, yc = y0 - Ky, q = easeInOut((t - o.slide[0]) / (o.slide[1] - o.slide[0])), rr = lerp(3.6, 1, q), hit = t >= o.hit;
  const intro = smooth((t - o.fromT) / 0.6);
  seriesBg(c, t);
  withAlpha(c, intro, () => {
    c.save(); c.strokeStyle = rgba(PAL.grid, 0.9); c.lineWidth = 1; for (const f of [0.25, 0.5, 0.75]) { c.beginPath(); c.moveTo(80, y0 - f * Ky); c.lineTo(1000, y0 - f * Ky); c.stroke(); } c.restore();
    poly(c, [[60, y0], [1020, y0]], PAL.line, 2, 0.7);
    poly(c, [[60, yc], [1020, yc]], PAL.amber, 2.5, 0.9, [12, 8]);
    for (const sg of [-1, 1]) { const pts = []; for (let i = 0; i <= 80; i++) { const r = lerp(1, 3.9, i / 80); pts.push([cx + sg * r * k, y0 - Ky * betaOf(r)]); } poly(c, pts, PAL.ray, 7, 0.14); poly(c, pts, PAL.ray, 2.5, 0.95); }
  });
  hole(c, cx, y0, k, intro);
  for (const sg of [-1, 1]) {
    const x = cx + sg * rr * k, y = y0 - Ky * betaOf(rr);
    if (!hit) { poly(c, [[x, y0], [x, y]], PAL.ray, 1.5, 0.5 * intro, [5, 6]); gl(c, x, y, 30, PAL.ray, 0.7 * intro); circle(c, x, y, 6, rgba('#FFFFFF', intro)); }
    else burst(c, cx + sg * k, yc, t - o.hit, 150, PAL.amberHot, 1);
  }
  if (hit) { ringFx(c, cx, y0, k + 4, PAL.amber, 0.9 * Math.exp(-(t - o.hit) / 1.2), 3); gl(c, cx, y0, k * 1.4, PAL.amber, 0.12); }
  const va = fadeIn(t, o.slide[0] - 0.2, 0.4) * intro;
  big(stage, hit ? '1.00 c' : `${betaOf(rr).toFixed(2)} c`, 540, 470, 140, hit ? PAL.amber : '#FFFFFF', va);
  label(stage, '빠져나가는 데 필요한 속도', 540, 575, va, {size: 34, color: PAL.muted});
  if (o.labels) {
    label(stage, '빛의 속도', 950, yc - 36, intro, {size: 32, color: PAL.amber, align: 'right'});
    label(stage, '사건의 지평선', cx, y0 - k - 52, fadeIn(t, o.hit + 0.3), {size: 36, color: PAL.amber});
  }
}

// ------------------------------------------------------------------ radius: 1916 funnel + formula; Sun & Earth squeezed; light cones
const V3 = {sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }};
function cam3(pos, tgt, {fov = 0.8, cx = 540, cy = 860} = {}) {
  const f = V3.norm(V3.sub(tgt, pos)), r = V3.norm(V3.cross([0, 1, 0], f)), u = V3.cross(f, r), F = (H / 2) / Math.tan(fov / 2);
  return {P(p) { const d = V3.sub(p, pos), z = V3.dot(d, f), s = F / Math.max(0.05, z); return [cx + V3.dot(d, r) * s, cy - V3.dot(d, u) * s, z]; }};
}
const orbitPos = (yaw, pitch, dist, tgt = [0, 0, 0]) => [tgt[0] + dist * Math.sin(yaw) * Math.cos(pitch), tgt[1] + dist * Math.sin(pitch), tgt[2] - dist * Math.cos(yaw) * Math.cos(pitch)];
function radiusScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.s10) { funnelShot(stage, t, P); fadeFromBlack(c, t, P.s09); return; }
  if (t < P.s11) { squashShot(stage, t, P); fadeFromBlack(c, t, P.s10, 0.3); return; }
  coneShot(stage, t, P); fadeFromBlack(c, t, P.s11, 0.3);
}
function funnelShot(stage, t, P) {
  const c = stage.ctx, u = t - P.s09, tg = [0, -0.9, 0], cam = cam3(orbitPos(0.3 + u * 0.08, lerp(0.78, 0.6, smooth(u / 7)), lerp(15.5, 13.5, smooth(u / 7)), tg), tg, {cy: 820});
  seriesBg(c, t);
  const Z = r => 1.5 * Math.sqrt(Math.max(0, r - 1)) - 2, P3 = (r, a) => cam.P([r * Math.cos(a), Z(r), r * Math.sin(a)]);
  const da = smooth(u / 1.2);
  withAlpha(c, da, () => {
    for (let k = 0; k < 36; k++) { const a = k / 36 * TAU, pts = []; for (let i = 0; i <= 30; i++) pts.push(P3(1 + 3.6 * (i / 30) ** 1.6, a)); poly(c, pts, PAL.ray, 1.3, 0.32); }
    for (const r of [1.12, 1.35, 1.7, 2.15, 2.75, 3.6, 4.6]) { const pts = []; for (let i = 0; i <= 96; i++) pts.push(P3(r, i / 96 * TAU)); poly(c, pts, PAL.ray, 1.4, 0.42); }
    const hz = []; for (let i = 0; i <= 120; i++) hz.push(P3(1, i / 120 * TAU));
    poly(c, hz, PAL.amber, 9, 0.14); poly(c, hz, PAL.amber, 2.8, 0.95);
    const pk = fadeIn(t, P.size9 - 0.1, 0.3); if (pk > 0) { const ce = cam.P([0, Z(1), 0]); burst(c, ce[0], ce[1], t - P.size9 + 0.1, 180, PAL.amberHot, 0.9); }
  });
  big(stage, '1916', 540, 455, 150, '#FFFFFF', fadeIn(t, P.y1916 - 0.15, 0.4));
  big(stage, 'rₛ = 2GM/c²', 540, 1170, 110, PAL.amber, fadeIn(t, P.eq9 - 0.1, 0.4));
  label(stage, 'M 질량 · c 빛의 속도', 540, 1268, fadeIn(t, P.eq9 + 0.6, 0.4), {size: 32, color: PAL.muted});
  const ha = fadeIn(t, P.size9 + 0.2); if (ha > 0) { const p = cam.P([0.95, Z(1), -0.3]); leaderLine(c, [p[0] + 200, p[1] - 160], [p[0], p[1]], PAL.amber, ha); label(stage, '사건의 지평선', p[0] + 200, p[1] - 195, ha, {size: 36, color: PAL.amber}); }
}
const SUNDOTS = (() => { const R = rng(29), d = []; for (let y = -1; y <= 1; y += 0.05) for (let x = -1; x <= 1; x += 0.05) { const xx = x + (R() - 0.5) * 0.04, yy = y + (R() - 0.5) * 0.04; if (xx * xx + yy * yy < 0.985) d.push([xx, yy, R()]); } return d; })();
function sunDots(c, t, cx, cy, R, a = 1) {
  if (a <= 0.01) return;
  gl(c, cx, cy, R * 1.9, PAL.star, 0.2 * a); circle(c, cx, cy, R, rgba('#2A1A08', 0.9 * a));
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [x, y, ph] of SUNDOTS) { const d = Math.hypot(x, y), b = (1 - 0.6 * d * d) * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (1.1 + ph) + ph * 20)));
    c.globalAlpha = a * b * 0.8; c.fillStyle = b > 0.7 ? PAL.amberHot : PAL.star; c.beginPath(); c.arc(cx + x * R, cy + y * R, Math.max(0.6, (1.2 + 2.4 * b) * Math.min(1, R / 150)), 0, TAU); c.fill(); }
  c.restore(); strokeCircle(c, cx, cy, R, PAL.star, 2, 0.8 * a);
}
function squashShot(stage, t, P) {
  const c = stage.ctx;
  seriesBg(c, t);
  poly(c, [[110, 815], [970, 815]], PAL.grid, 1.5, fadeIn(t, P.s10, 0.4));
  // Sun row
  { const q = smooth((t - P.sunC[0]) / (P.sunC[1] - P.sunC[0])), cx = 330, cy = 590, l0 = Math.log10(NUM.rSunKm), l1 = Math.log10(NUM.rsSunKm), lr = lerp(l0, l1, q), Rv = lerp(38, 205, (lr - l1) / (l0 - l1)), done = t >= P.sunC[1];
    if (!done) sunDots(c, t, cx, cy, Rv); else { hole(c, cx, cy, 38); burst(c, cx, cy, t - P.sunC[1], 120, PAL.amberHot, 1); }
    label(stage, '태양', cx, cy - 240, fadeIn(t, P.sun10 - 0.2), {size: 36, color: PAL.star});
    const val = done ? '약 3 km' : `${Math.round(10 ** lr).toLocaleString('en-US')} km`;
    big(stage, val, 735, cy - 10, done ? 96 : 70, done ? PAL.amber : '#FFFFFF', fadeIn(t, P.s10 + 0.2, 0.3));
    label(stage, '반지름', 735, cy - 85, fadeIn(t, P.s10 + 0.2, 0.3), {size: 30, color: PAL.muted});
  }
  // Earth row
  { const q = smooth((t - P.earC[0]) / (P.earC[1] - P.earC[0])), cx = 330, cy = 1060, l0 = Math.log10(NUM.rEarthKm * 1e6), l1 = Math.log10(NUM.rsEarthMm), lr = lerp(l0, l1, q), Rv = lerp(36, 185, (lr - l1) / (l0 - l1)), done = t >= P.earC[1], ea = fadeIn(t, P.s10 + 0.3, 0.4);
    if (!done) thinGlobe(c, cx, cy, Rv, -40 + t * 4, ea); else { hole(c, cx, cy, 36); burst(c, cx, cy, t - P.earC[1], 110, PAL.amberHot, 1);
      const ca = fadeIn(t, P.earC[1] + 0.35, 0.4); strokeCircle(c, cx + 110, cy, 36 * NUM.coinMm / 2 / NUM.rsEarthMm, '#C9A27A', 2.5, ca); withAlpha(c, ca, () => stage.text('10', cx + 110, cy + 2, {role: 'display', size: 26, color: '#C9A27A', align: 'center'}));
      label(stage, '10원 동전', cx + 110, cy + 82, ca, {size: 30, color: '#C9A27A'}); }
    label(stage, '지구', cx, cy - 222, ea, {size: 36, color: '#BFE4F2'});
    const mm = 10 ** lr, val = done ? '약 9 mm' : mm >= 1e6 ? `${Math.round(mm / 1e6).toLocaleString('en-US')} km` : mm >= 1e3 ? `${Math.round(mm / 1e3)} m` : `${Math.round(mm)} mm`;
    big(stage, val, 735, cy - 10, done ? 96 : 70, done ? PAL.amber : '#FFFFFF', ea);
    label(stage, '반지름', 735, cy - 85, ea, {size: 30, color: PAL.muted});
  }
}
function coneCam(t, P) {
  const q = easeInOut((t - P.tilt11[0]) / (P.tilt11[1] - P.tilt11[0])), u = t - P.s11, tg = [lerp(1.2, 1.1, q), lerp(0, 0.6, q), lerp(0, -0.2, q)];
  return cam3(orbitPos(0.04 * Math.sin(u * 0.4) + lerp(0, -0.12, q), lerp(1.42, 0.38, q), lerp(11, 10.5, q), tg), tg, {cy: lerp(830, 905, q), fov: 0.78});
}
function coneShot(stage, t, P) {
  const c = stage.ctx, cam = coneCam(t, P), KY = 3.3, q = easeInOut((t - P.tilt11[0]) / (P.tilt11[1] - P.tilt11[0]));
  seriesBg(c, t);
  const Pp = (x, z, h = 0) => cam.P([x, h * KY, z]);
  // plane: horizon disk, guide circles, the time axis once tilted
  const hz = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU; hz.push(Pp(Math.cos(a), Math.sin(a))); }
  c.save(); c.beginPath(); hz.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.fillStyle = PAL.hole; c.fill(); c.restore();
  for (const r of [2, 3, 4]) { const pts = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU; pts.push(Pp(r * Math.cos(a), r * Math.sin(a))); } poly(c, pts, PAL.grid, 1.5, 0.9); }
  poly(c, hz, PAL.amber, 9, 0.12); poly(c, hz, PAL.amber, 2.6, 0.95);
  const o = Pp(0, 0); gl(c, o[0], o[1], 14, PAL.amberHot, 0.5);
  if (q > 0.05) { const b0 = Pp(-1.2, -0.6, 0), b1 = Pp(-1.2, -0.6, 0.42), xa = Math.max(100, b0[0]), a0 = [xa, b0[1]], a1 = [xa, b1[1]]; poly(c, [a0, a1], PAL.muted, 2, q); poly(c, [[a1[0] - 9, a1[1] + 14], a1, [a1[0] + 9, a1[1] + 14]], PAL.muted, 2, q); label(stage, '시간', a1[0] + 8, a1[1] - 32, q, {size: 30, color: PAL.muted}); }
  // cones: stacked wavefronts (river picture) — rims at three heights + generators along the light paths
  for (const [w, t0] of [[0, P.flash11], [1, P.flash11b]]) {
    const age = t - t0; if (age < 0) continue;
    const a = Math.min(CONE_H, age * 0.36), fade = w === 0 ? fadeOut(t, P.flash11b + 0.1, 0.35) : 1;
    if (fade <= 0.01) continue;
    for (const [ex, ez] of CONES) {
      const F = gpFront(ex, ez, CONE_H + 0.01, 32), ap = Pp(ex, ez); burst(c, ap[0], ap[1], age, 26, PAL.rayHot, 0.45 * fade);
      [a / 3, 2 * a / 3, a].forEach((hh, j) => { if (hh < 0.01) return; const pts = frontAt(F, hh).map(([x, z]) => Pp(x, z, hh)); poly(c, [...pts, pts[0]], PAL.ray, j === 2 ? 2.2 : 1.3, (j === 2 ? 0.95 : 0.4) * fade); });
      for (let i = 0; i < 32; i += 4) { const pts = []; for (let hh = 0; hh <= a + 1e-6; hh += a / 8) { const p = frontAt(F, hh)[i]; pts.push(Pp(p[0], p[1], hh)); } poly(c, pts, PAL.ray, 1.2, 0.5 * fade);
        const tip = pts[pts.length - 1]; photonDot(c, tip[0], tip[1], 0.85 * fade, 2.4); }
    }
  }
  const hl = Pp(0, -1.0); label(stage, '사건의 지평선', hl[0], hl[1] + lerp(-40, 48, q), fadeIn(t, P.s11 + 0.3), {size: 34, color: PAL.amber});
  const ca = fadeIn(t, P.center11 - 0.1); if (ca > 0) { leaderLine(c, [o[0] - 60, o[1] - 260], [o[0], o[1]], PAL.amberHot, ca); label(stage, '중심', o[0] - 60, o[1] - 294, ca, {size: 34, color: PAL.amberHot}); }
  const ta = fadeIn(t, P.s11 + 0.6) * (1 - q), tb = smooth((q - 0.6) / 0.4);
  const lp = Pp(CONES[0][0], CONES[0][1]); label(stage, '퍼지는 빛', clamp(lp[0], 160, 860), lp[1] + 120, ta, {size: 32, color: PAL.ray}); label(stage, '빛원뿔', clamp(lp[0], 160, 860), lp[1] + 60, tb, {size: 32, color: PAL.ray});
}

// ------------------------------------------------------------------ time: the falling ship seen from far / from inside; clocks
const LX = {xh: 260, K: 293};
const lxOf = r => LX.xh + LX.K * Math.log(Math.max(r, 0.05));
/** rocket pointing left (toward the hole); (x, y) = nose tip */
function shipIcon(c, x, y, col, a = 1, s = 1) {
  if (a <= 0.01) return;
  withAlpha(c, a, () => {
    const Q = (px, py) => [x + (px + 34) * s, y + py * s];
    gl(c, x + 30 * s, y, 50 * s, col, 0.28);
    c.save(); c.lineJoin = 'round'; c.strokeStyle = col; c.lineWidth = 2.5;
    c.beginPath(); [Q(-34, 0), Q(-18, -11), Q(24, -11), Q(24, 11), Q(-18, 11)].forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.fillStyle = rgba('#000A10', 0.9); c.fill(); c.stroke();
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(...Q(10, sg * 11)); c.lineTo(...Q(30, sg * 24)); c.lineTo(...Q(30, sg * 11)); c.stroke(); }
    c.beginPath(); c.moveTo(...Q(24, -7)); c.lineTo(...Q(31, -9)); c.lineTo(...Q(31, 9)); c.lineTo(...Q(24, 7)); c.stroke();
    c.restore(); const w = Q(-8, 0); strokeCircle(c, w[0], w[1], 4.5 * s, col, 2, 1);
  });
}
function laneHole(c, y, Rd, a = 1, clip = [300, 1330]) { withAlpha(c, a, () => { c.save(); c.beginPath(); c.rect(0, clip[0], W, clip[1] - clip[0]); c.clip(); hole(c, LX.xh - Rd, y, Rd); c.restore(); }); }
function eyeIcon(c, x, y, a = 1) { withAlpha(c, a, () => { c.save(); c.beginPath(); c.ellipse(x, y, 24, 14, 0, 0, TAU); c.strokeStyle = rgba(PAL.ink, 0.95); c.lineWidth = 2.5; c.stroke(); c.restore(); circle(c, x, y, 6.5, PAL.ink); }); }
function timeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  seriesBg(c, t);
  if (t < P.s14) { lanes(stage, t, P); fadeFromBlack(c, t, P.s12); return; }
  clocksShot(stage, t, P); fadeFromBlack(c, t, P.s14, 0.3);
}
function lanes(stage, t, P) {
  const c = stage.ctx, split = easeInOut((t - P.s13) / 0.8), yF = lerp(760, 545, split), RdF = lerp(330, 215, split), yS = 1015, tc = P.tc(t), sz = lerp(1.9, 1.2, split);
  // ---- far lane: the far observer's description (coordinate time)
  laneHole(c, yF, RdF, 1, [300, lerp(1330, 778, split)]);
  poly(c, [[LX.xh, yF], [lxOf(FALL.rObs) - 34, yF]], PAL.muted, 1.5, 0.45, [6, 7]);
  // what the far observer SEES: the ship's image where the light now arriving left it (r_seen), with that light's redshift
  const f0 = redshift(FALL.r0), seen = seenTau(tc), rs = rOfTau(seen), fs = redshift(rs) / f0, scol = mix(PAL.red, PAL.rayHot, Math.min(1, fs * 1.15)), ex = lxOf(FALL.rObs);
  const tail = lxOf(rs) + 66 * sz; if (ex - 30 > tail) { poly(c, [[tail, yF], [ex - 30, yF]], scol, 7, 0.1 * fs); poly(c, [[tail, yF], [ex - 30, yF]], scol, 2, 0.75 * fs); }
  shipIcon(c, lxOf(rs), yF, scol, 0.12 + 0.88 * fs, sz);
  eyeIcon(c, ex, yF);
  const last = P.arrivals.findLast(p => p.ts <= t), fl = last ? Math.max(0, 1 - (t - last.ts) / 0.35) : 0;
  if (fl > 0) ringFx(c, ex, yF, 24 + 20 * (1 - fl), mix(PAL.red, PAL.rayHot, last.f / f0), fl);
  dial(c, lerp(800, 880, split), lerp(500, 400, split), lerp(72, 50, split), seen / (FALL.dTau * 4), {col: scol, hand: scol, flash: fl});
  label(stage, '멀리서 본 우주선 시계', 900, 388, fadeIn(t, P.far12 + 0.2) * (1 - split), {size: 32, color: PAL.ink, align: 'right'});
  label(stage, '사건의 지평선', LX.xh + 14, yF - 0.62 * RdF, fadeIn(t, P.s12 + 0.3) * (1 - split), {size: 34, color: PAL.amber, align: 'left'});
  const sa = fadeIn(t, P.stop12 - 0.1) * (1 - split); if (sa > 0) label(stage, '멈춘 듯', lxOf(rs) + 60, yF + 75, sa, {size: 38, color: PAL.red});
  // gauge: the light the far observer receives (frequency ratio → colour and length)
  const ga = fadeIn(t, P.far12, 0.4) * (1 - split);
  if (ga > 0) withAlpha(c, ga, () => {
    const x0 = 150, x1 = 930, y = 1200; c.save(); c.fillStyle = rgba('#000A10', 0.8); c.fillRect(x0, y - 10, x1 - x0, 20); c.restore();
    poly(c, [[x0, y - 10], [x1, y - 10], [x1, y + 10], [x0, y + 10], [x0, y - 10]], PAL.grid, 1.5, 1);
    c.save(); c.fillStyle = scol; c.globalAlpha = 0.9; c.fillRect(x0 + 2, y - 8, Math.max(0, (x1 - x0 - 4) * fs), 16); c.restore();
    label(stage, '멀리서 받는 빛', x0, y - 46, 1, {size: 32, color: PAL.muted, align: 'left'});
    label(stage, `× ${fs.toFixed(2)}`, x1, y - 46, 1, {size: 34, color: scol, align: 'right', role: 'display'});
  });
  label(stage, '멀리서', 80, yF - RdF - 30 > 330 ? yF - RdF - 30 : 345, split, {size: 32, color: PAL.muted, align: 'left'});
  // ---- ship lane: the crew's own clock (proper time replay)
  if (split > 0) {
    withAlpha(c, split, () => {
      poly(c, [[60, 790], [1020, 790]], PAL.grid, 1.5, 0.9);
      laneHole(c, yS, 215, 1, [800, 1330]);
      poly(c, [[60, yS], [lxOf(OWN_R0) + 40, yS]], PAL.muted, 1.5, 0.45, [6, 7]);
      const tau = Math.max(0, (t - P.own0) / FALL.KT), r = rOfTau(tau, OWN_R0), x = lxOf(r), sa2 = smooth((r - 0.12) / 0.4);
      const lk = P.ownTicks.findLast(q => q.ts <= t);
      shipIcon(c, x, yS, PAL.rayHot, sa2, 1.15); dial(c, x + 40, yS - 118, 46, tau / (FALL.dTau * 4), {col: PAL.rayHot, a: sa2, flash: lk ? Math.max(0, 1 - (t - lk.ts) / 0.3) : 0});
      const pa = t - P.pass; if (pa > -0.2 && pa < 1.2) strokeCircle(c, LX.xh - 215, yS, 215, PAL.amberHot, 3, 0.5 * (1 - Math.abs(pa) / 1.2));
    });
    label(stage, '우주선 안', 80, 830, split, {size: 32, color: PAL.rayHot, align: 'left'});
    label(stage, '지평선을 지나도 그대로', 700, yS + 110, fadeIn(t, P.pass + 0.2), {size: 34, color: PAL.rayHot});
  }
}
function clocksShot(stage, t, P) {
  const c = stage.ctx, y0 = 1120, Ky = 470, u = t - P.s14, draw = smooth(u / 1.4), rmax = 9;
  laneHole(c, y0, 300, 1, [300, 1330]);
  poly(c, [[LX.xh, y0], [lxOf(rmax), y0]], PAL.line, 2, 0.7);
  c.save(); c.strokeStyle = rgba(PAL.grid, 0.9); c.lineWidth = 1; for (const f of [0.5, 1]) { c.beginPath(); c.moveTo(LX.xh, y0 - f * Ky); c.lineTo(lxOf(rmax), y0 - f * Ky); c.stroke(); } c.restore();
  poly(c, [[LX.xh, y0 - Ky], [lxOf(rmax), y0 - Ky]], PAL.muted, 1.5, 0.6, [6, 7]);
  const pts = []; for (let i = 0; i <= 120; i++) { const r = Math.exp(lerp(0, Math.log(rmax), i / 120 * draw)); pts.push([lxOf(r), y0 - Ky * clockRate(r)]); }
  poly(c, pts, PAL.amber, 7, 0.14); poly(c, pts, PAL.amber, 2.8, 0.95);
  P.clk14.forEach((r, i) => {
    const a = fadeIn(t, P.s14 + 0.5 + 0.25 * i, 0.4), x = lxOf(r), y = y0 - Ky * clockRate(r), rate = clockRate(r);
    poly(c, [[x, y], [x, y - 70]], PAL.muted, 1.5, 0.6 * a); circle(c, x, y, 5, rgba('#FFFFFF', a));
    const ticks = i === 0 ? P.nearTicks : i === 3 ? P.farTicks : [], lk = ticks.findLast(q => q <= t);
    dial(c, x, y - 118, 46, Math.max(0, t - P.s14 - 0.6) * rate / P.dialPer, {a, col: mix(PAL.red, PAL.ink, rate), flash: lk ? Math.max(0, 1 - (t - lk) / 0.3) : 0});
  });
  rootFormula(stage, 720, 1225, 56, PAL.amber, fadeIn(t, P.slow14, 0.4));
  label(stage, '멀리서 본 시계의 빠르기', 720, 1292, fadeIn(t, P.slow14 + 0.3, 0.4), {size: 30, color: PAL.muted});
  label(stage, '지평선', LX.xh + 8, y0 + 40, fadeIn(t, P.s14 + 0.3), {size: 32, color: PAL.amber, align: 'left'});
}

// ------------------------------------------------------------------ photo: EHT globe → M87 → horizon vs Neptune → shadow 2.6 r_s
const GALDOTS = (() => { const R = rng(87), d = []; for (let i = 0; i < 1600; i++) { const g1 = Math.sqrt(-2 * Math.log(R() + 1e-9)), a = R() * TAU, r = g1 ** 1.7 * 0.32; d.push([r * Math.cos(a) * 1.0, r * Math.sin(a) * 0.82, R()]); } return d; })();
function photoScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.zoomG[1]) { ehtShot(stage, t, P); fadeFromBlack(c, t, P.s15); return; }
  if (t < P.s17) { m87Shot(stage, t, P); return; }
  shadowShot(stage, t, P);
}
function ehtShot(stage, t, P) {
  const c = stage.ctx, pan = easeInOut((t - P.pan15[0]) / (P.pan15[1] - P.pan15[0])), zg = easeIn((t - P.zoomG[0]) / (P.zoomG[1] - P.zoomG[0]));
  seriesBg(c, t, {stars: 1 - zg});
  const gcx = 540, gcy = lerp(800, 1180, pan), GR = lerp(300, 120, pan), ga = 1 - smooth((pan - 0.15) / 0.75);
  const V = makeView({cx: gcx, cy: gcy, R: GR}, -80 + (t - P.s15) * 1.5, -6, 0);
  thinGlobe(c, gcx, gcy, GR, -80 + (t - P.s15) * 1.5, (1 - zg) * ga, {tilt: -6});
  const pts = SITES.map(s => surfacePoint(V, s.lat, s.lon));
  withAlpha(c, (1 - zg) * ga, () => {
    pts.forEach((p, i) => { for (let j = 0; j < i; j++) { const q = fadeIn(t, P.linkT[Math.min(3, i - 1)], 0.3); if (q > 0) poly(c, [pts[j], [lerp(pts[j][0], p[0], q), lerp(pts[j][1], p[1], q)]], PAL.ray, 1.8, 0.55); } });
    pts.forEach((p, i) => { const q = fadeIn(t, P.siteT[i], 0.25); if (q > 0) { burst(c, p[0], p[1], t - P.siteT[i], 40, PAL.ray, 0.6); photonDot(c, p[0], p[1], q * (p[2] ? 1 : 0.5), 4.5); } });
    const va = fadeIn(t, P.tie15 + 0.35, 0.4) * (1 - pan); if (va > 0) strokeCircle(c, gcx, gcy, GR + 24, PAL.amber, 2.5, 0.85 * va, [10, 8]);
    label(stage, '지구만 한 접시 하나처럼', 540, gcy + GR + 80, va, {size: 34, color: PAL.amber});
  });
  // the line toward M87 and the galaxy
  if (pan > 0) {
    const gy = lerp(-420, 560, pan), sc = 1 + 40 * zg ** 1.2, gs = 330 * sc;
    withAlpha(c, 1 - zg, () => { poly(c, [[gcx, gcy - GR - 10], [gcx, gy + 60]], PAL.ray, 1.8, 0.6, [10, 10]); });
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y, ph] of GALDOTS) { const px = 540 + x * gs, py = gy + y * gs; if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue; const d = Math.hypot(x, y); c.globalAlpha = Math.min(1, (0.25 + 0.6 * Math.exp(-d / 0.18)) * (0.7 + 0.3 * ph)) * (1 - 0.7 * zg); c.fillStyle = d < 0.12 ? PAL.amberHot : '#E8D9C0'; c.beginPath(); c.arc(px, py, 1.1 + 1.4 * ph, 0, TAU); c.fill(); }
    c.restore();
    gl(c, 540, gy, Math.min(200, 60 * sc), PAL.amberHot, 0.45 * (1 - zg));
    withAlpha(c, (1 - zg) * fadeIn(t, P.pan15[1] - 0.6), () => poly(c, [[540, gy], [540 + 0.42 * gs, gy - 0.22 * gs]], PAL.ray, 2, 0.5));   // the M87 jet (thin line)
    label(stage, 'M87 은하', 540, gy + 0.42 * gs * 0.9 + 20, fadeIn(t, P.m87) * (1 - zg), {size: 34, color: PAL.ink});
    big(stage, '5,500만 광년', 540, 1180, 104, '#FFFFFF', fadeIn(t, P.m87 + 0.1, 0.4) * fadeOut(t, P.zoomG[0] + 0.5, 0.4));
    const ra = smooth((zg - 0.6) / 0.4); if (ra > 0) withAlpha(c, ra, () => bhView(c, t, {cx: 540, cy: 800, s: lerp(40, 110, ra), alpha: 0, rays: 0}));
  }
}
function m87Shot(stage, t, P) {
  const c = stage.ctx, d = easeInOut((t - P.dive16[0]) / (P.dive16[1] - P.dive16[0])), s = lerp(110, 300, d), cx = 540, cy = 800;
  seriesBg(c, t, {hole: [cx, cy, s * 2.6]});
  bhView(c, t, {cx, cy, s, alpha: 0, rays: 0, ring: 1 - 0.85 * d});
  const ha = fadeIn(t, P.eh16 - 0.15, 0.35); if (ha > 0) { strokeCircle(c, cx, cy, s, PAL.amber, 3, ha); burst(c, cx, cy, t - P.eh16 + 0.15, s * 0.8, PAL.amberHot, 0.6 * ha); }
  // the Solar System to scale with the horizon (128 AU): Neptune 30 AU
  const na = fadeIn(t, P.nep16 - 0.2, 0.4), rn = s * NUM.neptuneAU / NUM.rsM87AU;
  if (na > 0) withAlpha(c, na, () => { strokeCircle(c, cx, cy, rn, PAL.ray, 2, 0.9); gl(c, cx, cy, 16, PAL.star, 0.8); circle(c, cx, cy, 3.5, PAL.amberHot); const a = (t - P.nep16) * 1.4; photonDot(c, cx + rn * Math.cos(a), cy + rn * Math.sin(a), 1, 3.2); });
  label(stage, '해왕성 궤도', cx, cy + rn + 46, na, {size: 32, color: PAL.ray});
  label(stage, '사건의 지평선', cx, cy - s - 40, ha, {size: 36, color: PAL.amber});
  big(stage, '태양 65억 개', 540, 1215, 104, '#FFFFFF', fadeIn(t, P.mass16 - 0.1, 0.4) * fadeOut(t, P.times16 - 0.2, 0.3));
  big(stage, '약 4배', 540, 1215, 120, PAL.amber, fadeIn(t, P.times16, 0.35));
  const ma = fadeIn(t, P.times16 + 0.3, 0.4); if (ma > 0) withAlpha(c, ma, () => { poly(c, [[cx, cy], [cx + s, cy]], PAL.amber, 2, 0.8); poly(c, [[cx, cy + 4], [cx + rn, cy + 4]], PAL.ray, 3, 0.9); });
}
function shadowShot(stage, t, P) {
  const c = stage.ctx, u = t - P.s17, z = easeInOut(u / 1.0), r = easeInOut((t - P.rot17[0]) / (P.rot17[1] - P.rot17[0]));
  const s = lerp(lerp(300, 112, z), 78, r), cx = lerp(540, 600, r), cy = 800, al = lerp(0, Math.PI / 2, r);
  seriesBg(c, t, {hole: [cx, cy, s * 2.6]});
  bhView(c, t, {cx, cy, s, alpha: al, flow: -1, ring: 1, hzn: 1 - r, v: 2.4, dimRay: R => (Math.abs(R.b) > 4.5 ? 0.5 : 1)});
  // dimensions: horizon radius and shadow radius (face-on)
  const da = fadeIn(t, P.eh17 - 0.2, 0.4) * (1 - r);
  if (da > 0) withAlpha(c, da, () => { const rs = B_CRIT * s; poly(c, [[cx, cy], [cx + s, cy]], PAL.amber, 3, 1); poly(c, [[cx, cy + 10], [cx - rs, cy + 10]], PAL.amberHot, 2, 0.9, [8, 6]); circle(c, cx - rs, cy + 10, 5, PAL.amberHot); });
  big(stage, '× 2.6', 540, 1225, 130, PAL.amber, fadeIn(t, P.x26 - 0.1, 0.35) * (1 - r));
  label(stage, '그림자', cx - B_CRIT * s * 0.55, cy + B_CRIT * s + 50, fadeIn(t, P.shadow17 - 0.1) * (1 - r), {size: 34, color: PAL.amberHot});
  label(stage, '사건의 지평선', cx + s * 0.5, cy - s - 30, fadeIn(t, P.eh17 - 0.1) * (1 - r), {size: 32, color: PAL.amber});
  // side view: the observer at the left; sight lines with b < 2.6 r_s end on the horizon
  const sv = smooth((r - 0.6) / 0.4);
  if (sv > 0) {
    const ex = 100; c.save(); c.globalAlpha = sv; c.beginPath(); c.ellipse(ex, cy, 22, 13, 0, 0, TAU); c.strokeStyle = PAL.ink; c.lineWidth = 2.5; c.stroke(); circle(c, ex, cy, 6, PAL.ink); c.restore();
    const yb = cy - B_CRIT * s; poly(c, [[ex + 40, yb], [cx - 60, yb]], PAL.amberHot, 1.5, 0.8 * sv, [6, 6]); poly(c, [[ex + 40, cy + B_CRIT * s], [cx - 60, cy + B_CRIT * s]], PAL.amberHot, 1.5, 0.8 * sv, [6, 6]);
    withAlpha(c, sv * 0.35, () => { c.fillStyle = rgba('#000000', 0.6); c.fillRect(ex + 40, yb, cx - ex - 100, 2 * B_CRIT * s); });
    label(stage, '빛이 오지 않는 폭', 300, yb - 34, sv, {size: 32, color: PAL.amberHot});
    label(stage, '관측자', ex + 10, cy + 60, sv, {size: 30, color: PAL.ink});
    label(stage, '휘는 빛', 860, cy - 4.4 * s, sv * fadeIn(t, P.bendW17, 0.3), {size: 34, color: PAL.ray});
  }
}

// ------------------------------------------------------------------ myth: vacuum? → same orbit → only near the horizon
const DUST = (() => { const R = rng(55), d = []; for (let i = 0; i < 420; i++) d.push([R() * TAU, 0.25 + 0.75 * R(), R()]); return d; })();
const KEP = {a: 225, e: 0.42, T: 3.4};
function kepler(tt) { const M = TAU * tt / KEP.T; let E = M; for (let i = 0; i < 8; i++) E -= (E - KEP.e * Math.sin(E) - M) / (1 - KEP.e * Math.cos(E)); return [KEP.a * (Math.cos(E) - KEP.e), KEP.a * Math.sqrt(1 - KEP.e ** 2) * Math.sin(E)]; }
function orbitPath(cx, cy) { const pts = []; for (let i = 0; i <= 120; i++) { const E = i / 120 * TAU; pts.push([cx + KEP.a * (Math.cos(E) - KEP.e), cy + KEP.a * Math.sqrt(1 - KEP.e ** 2) * Math.sin(E)]); } return pts; }
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), u = t - P.s18;
  seriesBg(c, t);
  // s18: the misconception picture — everything streams straight in
  const va = fadeIn(t, P.s18 + 0.2, 0.5) * fadeOut(t, P.no, 0.35);
  if (va > 0) {
    const cx = 540, cy = 820, Rmax = 760;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [a, r0, ph] of DUST) { const q = ((r0 - u * (0.12 + 0.18 * ph)) % 1 + 1) % 1, r = 60 + q * Rmax, r2 = r + 30 + 30 * (1 - q); const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a) * 0.95;
      c.globalAlpha = va * 0.55 * (0.4 + 0.6 * ph); c.strokeStyle = '#B7A48C'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a) * 0.95); c.stroke(); }
    c.restore();
    hole(c, cx, cy, 60, va); big(stage, '?', 540, 1215, 150, '#FFFFFF', va * fadeIn(t, P.suck18 - 0.2, 0.4));
  }
  if (t < P.no - 0.2) { fadeFromBlack(c, t, P.s18); return; }
  // s19: same mass → same orbit (top: star, bottom: black hole); then zoom in on the hole
  const ta = fadeIn(t, P.no, 0.45), z = easeInOut((t - P.zoom19[0]) / (P.zoom19[1] - P.zoom19[0])), tt = t - P.no;
  withAlpha(c, ta * (1 - z), () => {
    const cy1 = 600, cx = 560; poly(c, orbitPath(cx, cy1), PAL.muted, 1.5, 0.8, [6, 6]); sunDots(c, t, cx, cy1, 34); const k = kepler(tt); photonDot(c, cx + k[0], cy1 + k[1], 1, 5, PAL.ray);
    poly(c, [[80, 845], [1000, 845]], PAL.grid, 1.5, 0.9);
  });
  label(stage, '별', 140, 400, ta * (1 - z), {size: 36, color: PAL.star, align: 'left'});
  const zc = {x: lerp(560, 540, z), y: lerp(1085, 800, z)}, sBH = lerp(9, 92, z);
  withAlpha(c, ta, () => {
    if (z < 1) withAlpha(c, 1 - z, () => { const pts = orbitPath(zc.x, zc.y).map(([x, y]) => [zc.x + (x - zc.x) * sBH / 9, zc.y + (y - zc.y) * sBH / 9]); poly(c, pts, PAL.muted, 1.5, 0.8, [6, 6]); const k = kepler(tt); photonDot(c, zc.x + k[0] * sBH / 9, zc.y + k[1] * sBH / 9, 1, 5, PAL.ray); });
    hole(c, zc.x, zc.y, sBH);
  });
  label(stage, '블랙홀', 140, 900, ta * (1 - z), {size: 36, color: PAL.amber, align: 'left'});
  label(stage, '같은 질량 · 같은 궤도', 540, 845, fadeIn(t, P.same19 - 0.3) * (1 - z), {size: 32, color: PAL.ink});
  // near the hole: a swing-by escapes, a closer pass is captured (exact geodesics)
  if (z > 0) {
    const X = x => zc.x + x * sBH, Y = y => zc.y - y * sBH, T0 = P.mythT0;
    for (const [O, col] of [[MYTH.swing, PAL.ray], [MYTH.plunge, PAL.matter]]) {
      const tau = (t - T0) / MYTH.TS; if (tau < 0) continue;
      const pts = []; for (let k = 0; k < O.pts.length && O.pts[k][2] <= tau; k += 2) pts.push([X(O.pts[k][0]), Y(O.pts[k][1])]);
      if (tau <= O.T) { const p = orbitAt(O, tau); pts.push([X(p[0]), Y(p[1])]); poly(c, pts, col, 1.6, 0.55 * z); photonDot(c, X(p[0]), Y(p[1]), z, 4.5, col); }
      else if (!O.captured) poly(c, pts, col, 1.6, 0.55 * z * fadeOut(t, T0 + O.T * MYTH.TS + 0.5, 0.6));
      if (O.captured) { const e = O.pts[O.pts.length - 1]; burst(c, X(e[0]), Y(e[1]), t - P.capT, 140, PAL.amberHot, 1); if (tau > O.T) poly(c, pts, col, 1.6, 0.55 * z * fadeOut(t, P.capT + 0.8, 0.5)); }
    }
    label(stage, '돌아올 수 없음', 540, Y(-1) + 80, fadeIn(t, P.capT + 0.15) * z, {size: 36, color: PAL.amberHot});
  }
}

// ------------------------------------------------------------------ close: the escape-speed graph once more, then the poster
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  const pa = smooth((t - P.poster) / 0.6);
  if (pa < 1) withAlpha(c, 1 - pa, () => horizonGraph(stage, t, P, {slide: P.slide20, hit: P.hit20, labels: true, fromT: P.s20}));
  if (pa > 0) posterPicture(stage, t, pa);
  else fadeFromBlack(c, t, P.s20, 0.3);
}

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58, dur = 0.6) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur, harmonics: [1, 0.35], attack: 0.006, decay: dur * 0.33, release: dur * 0.33, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: dur * 0.5, low: 30, high: 200, release: dur * 0.35, gain_db: -9}}]}, means});
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const hum = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * smooth((tt - t0) / 0.4) * (1 - smooth((tt - (t1 - 0.5)) / 0.5))), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 35, high: o.high ?? 140, fade: 0.05, points: Q}, means}); };
  // ---- hook
  swell('poster', 0.05, [55, 82], '첫 화면(썸네일): 블랙홀 둘레를 휘어 도는 빛 줄기', {dur: 2.0, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  hum('rays', MORPH[1], P.rotA[0], () => 0.4, -42, '빛 점들이 블랙홀 둘레를 흐름 (아주 낮은 웅웅)', {low: 30, high: 90});
  thump('cross0', P.x0, '"경계": 빛 점 하나가 지평선을 넘어 사라짐 (낮은 툭)', -31, 60, 0.5);
  tick('eh1', P.eh1f, 82, -33, '"사건의 지평선": 경계의 선이 반짝임', {decay: 0.22});
  tick('y2019', P.y19, 123, -34, '"2019"', {decay: 0.14});
  whoosh('rotA', P.rotA[0], P.rotA[1] - P.rotA[0], 80, 220, '옆모습 → 정면: 빛 줄기가 접히고 고리와 그림자가 펼쳐짐', -35);
  swell('ring', P.shadow2, [98, 147], '빛나는 고리와 검은 그림자', {dur: 1.8, gain: -33});
  tick('hzn2', P.hzn2, 82, -32, '그림자 한가운데의 사건의 지평선(점선)', {decay: 0.25});
  whoosh('rotB', P.rotB[0], P.rotB[1] - P.rotB[0], 70, 180, '정면 → 옆모습으로 돌며 지평선 가까이 다가감', -35);
  thump('cross1', P.x1, '빛 점이 지평선을 넘어 사라짐 (낮은 툭)', -30, 62, 0.5);
  thump('cross2', P.x2, '빛 점이 지평선을 넘어 사라짐 (낮은 툭)', -30, 58, 0.5);
  thump('cross3', P.x3, '물질 덩어리가 지평선을 넘음 (조금 더 큰 툭, 화면 살짝 흔들림)', -28, 52, 0.7);
  chirp('inside3', P.in3, P.in3 + 1.6, tt => lerp(147, 65, smooth((tt - P.in3) / 1.6)), tt => 0.32 * (1 - smooth((tt - P.in3 - 1.0) / 0.6)), -35, '지평선 안에서 낸 빛도 모두 중심 쪽으로 쓸려 감 (음이 내려감)');
  // ---- origin
  tick('y1783', P.y1783, 123, -34, '"1783" (미첼)', {decay: 0.14});
  whoosh('launch', P.launchM[0].t0, 1.2, 120, 320, '빛 알갱이가 별에서 날아감', -36);
  chirp('heavy', P.heavy, P.heavy + 0.9, tt => lerp(110, 65, smooth((tt - P.heavy) / 0.9)), () => 0.35, -34, '별이 무거워짐: 탈출 속도가 빛의 속도를 넘음 (음이 내려감)');
  ticks('fallback', P.returnsM.slice(0, 5), 98, -36, '빛 알갱이가 되떨어짐 (낮은 틱)', {decay: 0.12});
  swell('dark', P.dark, [55, 73], '어두운 별', {dur: 1.8, gain: -33});
  tick('greek', P.greek5, 131, -34, '"horizōn"', {decay: 0.14});
  whoosh('close5', P.morph5[0], P.morph5[1] - P.morph5[0], 90, 240, '땅의 지평선이 휘어 원으로 닫힘', -35);
  swell('eh5', P.ehOn5, [65, 98], '원이 사건의 지평선이 됨', {dur: 1.6, gain: -33});
  tick('event1', P.e1, 165, -34, '지평선 바깥의 사건 (섬광)', {decay: 0.1});
  tick('seen1', P.e1arr, 196, -33, '바깥 사건의 빛이 관측자에 도착', {decay: 0.14});
  tick('event2', P.e2, 110, -34, '지평선 안쪽의 사건 (섬광)', {decay: 0.1});
  chirp('lost2', P.e2 + 0.05, P.e2 + 1.4, tt => lerp(110, 55, smooth((tt - P.e2) / 1.3)), tt => 0.3 * (1 - smooth((tt - P.e2 - 0.9) / 0.5)), -36, '안쪽 사건의 빛은 중심으로 쓸려 가 도착하지 않음');
  // ---- essence
  P.launchE.forEach((L, k) => whoosh(`launch${k}`, L.t0, 0.7, 110, L.f >= 1 ? 300 : 230, L.f >= 1 ? '탈출 속도로 쏘아 올림' : `탈출 속도의 ${Math.round(L.f * 100)}%로 쏘아 올림`, -36));
  ticks('land', P.landE.filter(x => x != null && x < P.s07), 82, -35, '탈출 속도보다 느린 점은 되돌아와 떨어짐', {decay: 0.14});
  tick('v11', P.speed6, 131, -33, '"11.2 km/s"', {decay: 0.16});
  { const L = P.launchE[3]; chirp('escape', L.t0 + 0.3, P.s07 - 0.1, tt => 98 + 98 * smooth((tt - L.t0) / 4), tt => 0.28 * (1 - smooth((tt - (P.s07 - 0.9)) / 0.8)), -37, '탈출 속도로 쏜 점은 돌아오지 않고 멀어짐'); }
  { const [a, b] = P.shrink, l0 = Math.log10(NUM.rEarthM), l1 = Math.log10(NUM.rsEarthM), lv0 = Math.log10(NUM.vEarth), lv1 = Math.log10(NUM.cKm);
    chirp('squeeze', a, b, tt => { const lr = lerp(l0, l1, smooth((tt - a) / (b - a))), lv = Math.log10(vEarthAt(10 ** lr)); return r(82 * 4 ** ((lv - lv0) / (lv1 - lv0)), 1); }, () => 0.3, -35, '지구를 뭉칠수록 탈출 속도가 커짐 → 음이 올라감 (로그 눈금, 82 → 328 Hz)'); }
  thump('hitC', P.hitC, '탈출 속도 = 빛의 속도: 사건의 지평선이 생김 (섬광)', -28, 55, 0.8);
  { const [a, b] = P.slide8; chirp('slide8', a, b, tt => r(165 * 2 ** ((betaOf(lerp(3.6, 1, easeInOut((tt - a) / (b - a)))) - 0.527) / 0.473), 1), () => 0.3, -36, '지평선에 다가갈수록 필요한 속도가 커짐 → 음이 올라감 (0.53 c → 1 c)'); }
  thump('hit8', P.hit8, '필요한 속도가 빛의 속도가 되는 곳 = 사건의 지평선', -28, 55, 0.8);
  // ---- radius
  tick('y1916', P.y1916, 123, -34, '"1916" (슈바르츠실트)', {decay: 0.14});
  swell('funnel', P.s09 + 0.1, [73, 110], '지평선 둘레 공간의 모양(깔때기 선 그림)', {dur: 1.8, gain: -35});
  tick('formula', P.eq9, 147, -33, '"rₛ = 2GM/c²"', {decay: 0.16});
  tick('size9', P.size9 - 0.1, 98, -33, '사건의 지평선(목 부분 고리)이 반짝임', {decay: 0.2});
  chirp('sunC', P.sunC[0], P.sunC[1], tt => lerp(196, 82, smooth((tt - P.sunC[0]) / (P.sunC[1] - P.sunC[0]))), () => 0.3, -36, '태양이 뭉쳐짐 (반지름 로그 → 음이 내려감)');
  thump('sunHole', P.sunC[1], '태양 질량의 블랙홀: 반지름 약 3 km', -29, 58, 0.6);
  chirp('earthC', P.earC[0], P.earC[1], tt => lerp(196, 82, smooth((tt - P.earC[0]) / (P.earC[1] - P.earC[0]))), () => 0.3, -36, '지구가 뭉쳐짐 (음이 내려감)');
  thump('earthHole', P.earC[1], '지구 질량의 블랙홀: 반지름 약 9 mm', -29, 62, 0.5);
  swell('cones1', P.flash11, [98, 147], '빛의 섬광 다섯 개: 퍼지는 빛이 안쪽으로 쓸림', {dur: 1.6, gain: -34});
  whoosh('tilt11', P.tilt11[0], P.tilt11[1] - P.tilt11[0], 70, 200, '카메라가 기울어 시간 축이 드러남: 빛원뿔', -36);
  swell('cones2', P.flash11b, [65, 98], '지평선 안쪽의 빛원뿔은 모두 중심을 향함', {dur: 1.8, gain: -33});
  // ---- time
  { const f0 = redshift(FALL.r0); ticks('far_clock', P.arrivals.map(p => p.ts), P.arrivals.map(p => r(Math.max(55, 220 * p.f / f0), 1)), -34,
      `떨어지는 우주선의 시계 신호가 멀리 있는 관측자에 도착 (${P.arrivals.length}번): 간격이 늘고(√ 없이 1 − √(r_s/r)) 음이 낮아지다 끊김`, {decay: 0.12, gains: P.arrivals.map(p => r(20 * Math.log10(Math.max(0.2, p.f / f0)), 1))}); }
  ticks('own_clock', P.ownTicks.map(q => q.ts), 165, -36, `우주선 안의 시계: 일정한 박자 (${P.ownTicks.length}번), 지평선을 지날 때도 그대로`, {decay: 0.08});
  ticks('clock_far', P.farTicks, 196, -38, '멀리 있는 시계(r = 8 r_s)의 박자', {decay: 0.08});
  ticks('clock_near', P.nearTicks, 98, -36, `지평선 가까운 시계(r = 1.15 r_s): 멀리서 보면 ${(1 / clockRate(P.clk14[0])).toFixed(1)}배 느림`, {decay: 0.12});
  // ---- photo
  swell('globe', P.s15 + 0.1, [82, 123], '지구본', {dur: 1.4, gain: -36});
  ticks('sites', P.siteT, [110, 123, 131, 147, 165], -35, '전파망원경 다섯 곳 (하와이 · 애리조나 · 멕시코 · 칠레 · 스페인)', {decay: 0.1});
  ticks('links', P.linkT, [98, 110, 123, 131], -35, '망원경들을 하나로 묶음', {decay: 0.1});
  whoosh('pan', P.pan15[0], P.pan15[1] - P.pan15[0], 70, 200, 'M87 은하 쪽으로 멀리 올라감', -35);
  tick('m87', P.m87 + 0.1, 110, -33, '"5,500만 광년"', {decay: 0.16});
  whoosh('dive', P.zoomG[0], P.zoomG[1] - P.zoomG[0], 90, 260, '은하 중심으로 밀고 들어감', -35);
  swell('ring15', P.zoomG[1] - 0.3, [98, 147], '중심의 빛나는 고리와 그림자', {dur: 1.6, gain: -34});
  tick('mass16', P.mass16, 123, -33, '"태양 65억 개"', {decay: 0.16});
  swell('eh16', P.eh16 - 0.15, [65, 98], '사건의 지평선 (반지름 128 AU)', {dur: 1.6, gain: -33});
  tick('nep16', P.nep16 - 0.2, 165, -34, '해왕성 궤도 (30 AU)', {decay: 0.12});
  tick('times16', P.times16, 131, -33, '"약 4배"', {decay: 0.16});
  tick('x26', P.x26 - 0.1, 131, -33, '"× 2.6": 그림자 반지름 = 지평선의 약 2.6배', {decay: 0.16});
  whoosh('rot17', P.rot17[0], P.rot17[1] - P.rot17[0], 80, 220, '정면 → 옆모습: 휘는 빛줄기와 관측자', -35);
  // ---- myth
  hum('vacuum', P.s18 + 0.2, P.no + 0.1, tt => 0.25 + 0.25 * smooth((tt - P.s18) / 3), -40, '오해의 그림: 모든 것이 곧장 빨려 듦 (낮은 바람 소리)', {low: 60, high: 220});
  tick('no19', P.no, 98, -32, '"아닙니다": 빨려 드는 그림이 사라짐', {decay: 0.2});
  { const kt = []; for (let k = 1; P.no + k * KEP.T < P.zoom19[0]; k++) kt.push(P.no + k * KEP.T); ticks('orbit', kt.length ? kt : [P.no + KEP.T], 147, -37, '두 행성이 같은 궤도를 한 바퀴 돎 (같은 박자)', {decay: 0.1}); }
  whoosh('zoom19', P.zoom19[0], P.zoom19[1] - P.zoom19[0], 80, 220, '블랙홀 가까이로 확대', -35);
  thump('capture', P.capT, '가까이 지나간 점이 지평선을 넘음 (낮은 툭)', -28, 55, 0.7);
  // ---- close
  { const [a, b] = P.slide20; chirp('slide20', a, b, tt => r(165 * 2 ** ((betaOf(lerp(3.6, 1, easeInOut((tt - a) / (b - a)))) - 0.527) / 0.473), 1), () => 0.3, -36, '필요한 속도가 빛의 속도로 (정리)'); }
  thump('hit20', P.hit20, '탈출 속도 = 빛의 속도: 사건의 지평선', -29, 55, 0.7);
  swell('poster_back', P.poster, [55, 82, 110], '첫 화면의 포스터가 돌아옴', {dur: 1.8, gain: -33});
  return lowBandOnly(ev, modelSignature(tl));
}
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
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev.sort((a, b) => a.at - b.at);
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const sound = {version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/event-horizon/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 지평선을 넘음 → 낮은 툭(52~62 Hz), 지평선이 생김(탈출 속도 = 빛의 속도) → 낮은 쿵, 탈출 속도 → 음높이(로그), 뭉쳐짐 → 내려가는 음, 떨어지는 우주선의 시계 신호 → 도착할 때마다 틱(간격이 늘고 음높이 220·(1 − √(r_s/r))/(1 − √(r_s/r₀)) Hz로 내려감), 우주선 안의 시계 → 일정한 틱, 정지 시계 → √(1 − r_s/r) 박자, 카메라 전환 → 낮은 바람 소리, 등장 → 낮은 화음. 모든 음은 700 Hz 아래. 패닝 없음(모노 안전). 타임라인이 바뀌면 다시 실행하세요.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; arrivals ${P.arrivals.length}, own ticks ${P.ownTicks.length}, e1arr ${P.e1arr.toFixed(2)} s, capT ${P.capT.toFixed(2)} s, poster ${P.poster.toFixed(2)} s`);
}
