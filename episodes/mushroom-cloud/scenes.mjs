// Episode scenes — "버섯구름은 왜 버섯 모양일까" (22)
// Shape: export {theme, scenes, overlays, background, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Hero = an axisymmetric (r–z) stable-fluids simulation (fluid.mjs, MAC grid): buoyancy B·(θ' − θ_amb(z)),
//    θ_amb rising slowly in the troposphere and steeply above the tropopause row JT (≈ 9.6 km) → the cap spreads there.
//    Vorticity confinement, small viscosity and diffusion; MacCormack scalar advection. The same solver drives the
//    volcano (continuous vent source), the wildfire (wide ground heat) and the ink drop (heavy blob, gravity reversed).
//  - Rendering (v2): line-of-sight projection of the axisymmetric fields (Projector) → optical depth, Catmull-Rom
//    upsampled to near screen resolution. Outline = blurred presence mask crossing a threshold set by the billow height
//    (dome tops bulge out, creases cut in); billows = packed Worley domes anchored to the rising centroid that "boil"
//    (old domes sink, new rise). Light: dome-height normals, 6-step march toward a low sun on the right (self-shadow),
//    cool sky ambient from above, warm under-light from the stem/ground below; heat-weighted emission → incandescent
//    ramp, bloom. Billows are texture only, not physics.
//  - Scale: main cloud 192 × 384 cells, 1 cell ≈ 43 m (height 16.4 km); volcano/wildfire 128 × 256, 1 cell = 64 m.
//    Time: 1 step ≈ 1.5 s of real time (top passes ~10 km near step 180 ≈ 4.5 min; the hook shows it ≈ 22× faster).
//  - Shock wave (myth): an analytic hemispherical front, drawn ahead of the fireball; not part of the fluid model.
//  - Sound: node episodes/mushroom-cloud/scenes.mjs --emit-sound writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, glow, withAlpha, rect, poly, TAU, rand, rng, loadTimeline} from '../../pipeline/render/index.mjs';
import {Fluid, Projector} from './fluid.mjs';
import {DotBuf, smooth121, contourPath} from './diagram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
export const theme = {base: 'navy', accent: '#FFB070'};
export const captionLayout = {hook: {plate: true}, cases: {plate: true}, myth: {plate: true}};   // cases: pale water behind the ink → plate for contrast (2026-11-07 review)
export const events = [];

// =====================================================================================================
// Model
// =====================================================================================================
export const KM = 0.064;                 // km per cell of the 128 × 256 sims (volcano, wildfire)
export const KMM = 16.4 / 384;           // km per cell of the 192 × 384 main cloud (≈ 43 m)
export const JT = 150;                   // tropopause row, 128-grid (≈ 9.6 km)
export const JTM = 225;                  // tropopause row, main grid (≈ 9.6 km)
export const SC = 2 / 3;                 // main-grid cell size relative to the 128 grid (px-per-cell factors)
export const SEC_PER_STEP = 1.5;         // real seconds per simulation step (main cloud)
const NX = 128, NY = 256, NXM = 192, NYM = 384;
const NSM = 7000, NDU = 3000;   // main cloud tracers: fireball material, ground dust
/** continuous emitters (volcano vent, burning forest): tracer q is born at step q·L/nt, lives L steps, then is re-seeded */
const emitter = (L, seed) => ({
  initTracers(f) { for (let q = 0; q < f.nt; q++) { f.tage[q] = -Math.floor(q / f.nt * L); f.tx[q] = 1; f.ty[q] = -40; f.tk[q] = 0; } },
  respawn(f) { const st = f.stepNo; for (let q = 0; q < f.nt; q++) {
    if (f.tage[q] < 0) { f.tx[q] = 1; f.ty[q] = -40; continue; }
    if (f.ty[q] < -10 || f.tage[q] > L || f.ty[q] > f.ny - 3 || f.tx[q] > f.nx - 2) { const [r, y] = seed(rand(q * 3.17 + st * 0.371), rand(q * 5.31 + st * 1.713)); f.tx[q] = r; f.ty[q] = y; if (f.tage[q] > L) f.tage[q] = 0; } } },
});
const bubbleInit = (f, {r0, cy, dth, smoke = 1, dust = 0.25, dustR = 90, dustRows = 2}) => {
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
    const k = i + j * f.nx, r = Math.hypot(i + 0.5, j + 0.5 - cy) / r0;
    if (r < 1.25) { const q = r < 0.75 ? 1 : 1 - (r - 0.75) / 0.5; f.th[k] += dth * q; f.s[k] = Math.max(f.s[k], smoke * q); }
    if (j < dustRows && i < dustR) f.d[k] = dust;
  }
};
// The main cloud runs on a 1.5× finer grid than the first version: same physical domain (8.2 km × 16.4 km) and time step,
// so speeds in cells/step and the buoyancy coefficient scale by 1.5 and the stratification per cell by 1/1.5.
const CFG = {
  main: {axi: true, nx: NXM, ny: NYM, B: 0.003, eps: 0.06, visc: 0.1, kappa: 0.03, kappaD: 0.05, axisDamp: 0.25, g1: 0.02 / 1.5, g2: 0.4, jt: JTM, ground: 0.95, tracers: NSM + NDU, sor: 50,
    init: f => bubbleInit(f, {r0: 37.5, cy: 30, dth: 16, dust: 0.45, dustR: 150, dustRows: 3}),
    sources(f) { for (let i = 0; i < f.nx; i++) f.d[i] = Math.min(1.6, f.d[i] + 0.06 * Math.abs(f.u[i])); },
    initTracers(f) {
      const R = rng(1945);
      for (let q = 0; q < f.nt; q++) {
        if (q < NSM) {   // fireball material: uniform in the 3D ball (radius 34 cells around row 30), above the ground
          let x, y, z; do { x = 2 * R() - 1; y = 2 * R() - 1; z = 2 * R() - 1; } while (x * x + y * y + z * z > 1 || 30 + 34 * y < 0.5);
          f.tx[q] = 34 * Math.hypot(x, z); f.ty[q] = 30 + 34 * y; f.tk[q] = 0;
        } else { f.tx[q] = Math.sqrt(36 + R() * (162 * 162 - 36)); f.ty[q] = 0.45 + R() * 3.3; f.tk[q] = 1; }   // ground layer (afterwinds, dust), uniform over the disc
      }
    },
    respawn(f) {   // dust tracers that have risen high go back to the ground at a fresh radius (deterministic)
      for (let q = NSM; q < f.nt; q++) if (f.ty[q] > 180 || f.tx[q] > 180) { f.tx[q] = Math.sqrt(900 + (165 * 165 - 900) * rand(q * 7.13 + f.stepNo * 0.917)); f.ty[q] = 0.6 + 2.7 * rand(q * 3.7 + f.stepNo * 1.31); f.tage[q] = 0; }
    }},
  volc: {axi: true, nx: NX, ny: NY, B: 0.002, eps: 0.05, visc: 0.1, kappa: 0.04, g1: 0.02, g2: 0.6, jt: JT - 20, ground: 0.9, tracers: 6000,
    ...emitter(420, (a, b) => [14 * Math.sqrt(a), 0.5 + 3 * b]),
    sources(f) {   // continuous vent: hot ash-laden gas pushed up through the vent
      for (let j = 0; j < 4; j++) for (let i = 0; i < 15; i++) {
        const k = i + j * f.nx, q = 1 - (i / 15) ** 2; f.th[k] = Math.max(f.th[k], f.ambAt(j + 0.5) + 17 * q); f.s[k] = Math.max(f.s[k], q);
        f.v[i + (j + 1) * f.nx] = Math.max(f.v[i + (j + 1) * f.nx], 1.1 * q);
      }
    }},
  fire: {axi: true, nx: NX, ny: NY, B: 0.002, eps: 0.07, visc: 0.08, kappa: 0.035, g1: 0.02, g2: 0.6, jt: JT, ground: 0.95, tracers: 6000,
    ...emitter(380, (a, b) => [44 * a ** 0.75, 0.5 + 2 * b]),
    sources(f) {   // burning forest: flickering heat concentrated toward the middle (a uniform hot sheet would just sit in balance)
      const st = f.stepNo;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 46; i++) { const fl = 0.65 + 0.35 * Math.sin(i * 0.9 + st * 0.11) * Math.sin(i * 0.37 - st * 0.07), q = (1 - (i / 46) ** 2) * fl, k = i + j * f.nx;
        f.th[k] = Math.max(f.th[k], f.ambAt(j + 0.5) + 14 * q); f.s[k] = Math.max(f.s[k], 0.8 * q); }
    }},
  ink: {axi: true, nx: NXM, ny: NYM, B: 0, W: 0.045, eps: 0.1, visc: 0.05, kappa: 0.003, g1: 0, g2: 0, ground: 1, sor: 50, tracers: 7000,
    initTracers(f) { const R = rng(17); for (let q = 0; q < f.nt; q++) { let x, y, z; do { x = 2 * R() - 1; y = 2 * R() - 1; z = 2 * R() - 1; } while (x * x + y * y + z * z > 1); f.tx[q] = 24 * Math.hypot(x, z); f.ty[q] = 342 + 24 * y; f.tk[q] = 0; } },
    init: f => { for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const k = i + j * f.nx, r = Math.hypot(i + 0.5, j + 0.5 - 342) / 25.5;
      if (r < 1.2) f.s[k] = r < 0.8 ? 1 : 1 - (r - 0.8) / 0.4; } }},
};
const SIMS = {};
export const sim = name => (SIMS[name] ||= new Fluid(CFG[name]));
const PJS = {};
const projector = (nx, ny) => (PJS[nx + 'x' + ny] ||= new Projector(nx, ny));
const PROJ = {};
/** projected fields of a sim at its current step (cached per sim + step); rows without material are skipped,
 *  the heat projection is only made when asked for (glowing scenes) */
function projected(name, needHeat = false) {
  const f = sim(name), n2 = 2 * f.nx * f.ny;
  const c = (PROJ[name] ||= {step: -1, hstep: -1, S: new Float32Array(n2), D: new Float32Array(n2), H: new Float32Array(n2), tmp: new Float32Array(f.nx * f.ny), j0: 0, j1: 0});
  const PJ = projector(f.nx, f.ny);
  if (c.step !== f.stepNo) {
    let j0 = f.ny, j1 = -1;
    for (let j = 0; j < f.ny; j++) { const o = j * f.nx; for (let i = 0; i < f.nx; i++) if (f.s[o + i] > 1e-3 || f.d[o + i] > 1e-3) { if (j < j0) j0 = j; j1 = j; break; } }
    if (j1 < 0) { j0 = 0; j1 = 0; }
    c.j0 = j0; c.j1 = j1;
    PJ.run(f.s, c.S, j0, j1); PJ.run(f.d, c.D, j0, j1); c.step = f.stepNo;
  }
  if (needHeat && c.hstep !== f.stepNo) {
    for (let j = c.j0; j <= c.j1; j++) { const amb = f.ambAt(j + 0.5); for (let i = 0; i < f.nx; i++) { const k = i + j * f.nx; c.tmp[k] = f.s[k] * Math.max(0, f.th[k] - amb); } }
    PJ.run(c.tmp, c.H, c.j0, c.j1); c.hstep = f.stepNo;
  }
  return c;
}

// =====================================================================================================
// Timing plan (from the real narration)
// =====================================================================================================
const W_ = (tl, id, w, o = 0) => tl.at({sentence: id, word: w, offset: o});
let PLAN = null;
export function plan(tl) {
  if (PLAN && PLAN.tl === tl) return PLAN;
  const P = {tl}, S = id => tl.at(id), E = id => tl.at(id + ':end');
  P.flash = 1.85;                       // the poster cuts to the detonation flash
  P.reach10 = W_(tl, 's02', '십킬로미터', 0.3);
  P.s03 = S('s03'); P.hookEnd = tl.scene('hook').end;
  // hook: sim step as a function of time (fast at first, slow growth)
  P.STEP10 = 180; P.HOOK_END_STEP = 320;
  P.hookStep = t => t < P.flash ? 0 : t < P.reach10 ? P.STEP10 * ((t - P.flash) / (P.reach10 - P.flash)) ** 0.9 : P.STEP10 + (P.HOOK_END_STEP - P.STEP10) * clamp((t - P.reach10) / (P.hookEnd - 0.3 - P.reach10));
  P.speedup = (P.HOOK_END_STEP * SEC_PER_STEP) / (P.hookEnd - 0.3 - P.flash);
  P.poster = W_(tl, 's20', '버섯구름은', -0.15);
  P.POSTER_STEP = 235;
  P.pine = W_(tl, 's04', '소나무에', -0.2);
  P.split = S('s05');
  P.balloon = W_(tl, 's06', '열기구처럼', -0.1);
  P.key = S('s07');
  P.center = W_(tl, 's08', '가운데는'); P.edge = W_(tl, 's08', '가장자리는');
  P.roll = W_(tl, 's09', '말려'); P.donut = W_(tl, 's09', '도넛', -0.3);
  P.dust = W_(tl, 's10', '흙먼지를'); P.stemW = W_(tl, 's10', '줄기가');
  P.wind = W_(tl, 's11', '바람도');
  P.cool = W_(tl, 's12', '식고,'); P.mix = W_(tl, 's12', '섞입니다.');
  P.tropo = W_(tl, 's13', '대류권의', -0.2); P.notCold = W_(tl, 's13', '내려가지');
  P.spread = W_(tl, 's14', '옆으로'); P.capW = W_(tl, 's14', '갓이');
  P.cond = W_(tl, 's15', '물방울로');
  P.fire = S('s16'); P.ink = W_(tl, 's16', '물에', -0.25); P.mirror = S('s17');
  P.shock = W_(tl, 's18', '폭발이', -0.1); P.allway = W_(tl, 's19', '사방으로'); P.after = W_(tl, 's19', '버섯', -0.1);
  return (PLAN = P);
}

// =====================================================================================================
// Noise, colour helpers
// =====================================================================================================
const NT = 256, NOISE = (() => { const R = rng(77), a = new Float32Array(NT * NT); for (let i = 0; i < a.length; i++) a[i] = R(); return a; })();
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const i0 = xi & (NT - 1), i1 = (xi + 1) & (NT - 1), j0 = (yi & (NT - 1)) * NT, j1 = ((yi + 1) & (NT - 1)) * NT;
  const a = NOISE[i0 + j0], b = NOISE[i1 + j0], c = NOISE[i0 + j1], d = NOISE[i1 + j1];
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.07 + 13.1, y * 2.07 - 7.3) + 0.15 * vnoise(x * 4.3 - 21, y * 4.3 + 5);
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// =====================================================================================================
// Diagram drawing (series look): tracer dots carried by the model flow, density contours, atmosphere cross-section
// =====================================================================================================
const DB = new DotBuf();
const C3 = {hot: [1, 0.9, 0.72], amber: [1, 0.64, 0.32], warm: [0.62, 0.56, 0.52], pale: [0.86, 0.92, 1], dust: [0.7, 0.56, 0.42],
  cool: [0.6, 0.72, 0.96], ash: [0.64, 0.64, 0.68], ink: [0.74, 0.5, 1], inkDeep: [0.46, 0.38, 1]};
const mixc = (a, b, q) => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
const ACC = '#FFB070', PALE = '#CFE0FF', AXIS = 'rgba(160,174,206,0.6)';
const CT_OUT = 'rgba(214,226,255,0.78)', CT_MID = 'rgba(255,176,112,0.55)', CT_IN = 'rgba(255,214,170,0.35)';
/** parcel colour by excess temperature (θ' / heatK): muted warm grey → amber → white-hot */
const heatC3 = (hq, cold = C3.warm) => (hq < 0.5 ? mixc(cold, C3.amber, hq / 0.5) : mixc(C3.amber, C3.hot, (hq - 0.5) / 0.5));

/** a sim's tracers as small glowing dots. Axisymmetric model → each tracer is drawn at `copies` fixed azimuths (3D view);
 *  slice: true draws the cut through the axis instead (x = ± r). Brightness follows the local smoke (diluted → fades). */
function cloudDots(name, {cx, gy, ppc, a = 1, heatK = 9, cond = null, copies = 3, rad = null, I = 0.85, dustI = 0.7, smokeRef = 0.1, tilt = 0.05,
  warmFloor = 0, kinds = 3, slice = false, palette = null, jitter = 0, cold = C3.warm}) {
  const f = sim(name), {tx, ty, tk, tage} = f, r0 = rad ?? clamp(0.36 * ppc, 1.1, 2.3);
  for (let q = 0; q < f.nt; q++) {
    if (tage[q] < 0 || ty[q] < 0) continue;
    const r = tx[q], z = ty[q], kind = tk[q];
    if (!(kinds & (kind ? 2 : 1))) continue;
    let col, w;
    if (kind === 0) {
      const sv = f.sampleC(f.s, r, z); w = clamp(sv / smokeRef); if (w < 0.03) continue;
      if (palette) col = palette(sv, q); else { const hq = clamp((f.sampleC(f.th, r, z) - f.ambAt(z)) / heatK); col = heatC3(Math.max(hq, warmFloor), cold); }
      if (cond) { const cq = cond(z); if (cq > 0) col = mixc(col, C3.pale, cq); }
      w *= I;
    } else { w = clamp(f.sampleC(f.d, r, z) / 0.05) * dustI; if (w < 0.02) continue; col = C3.dust; }
    if (slice) { const sd = q & 1 ? 1 : -1, jx = jitter ? (rand(q * 3.3) - 0.5) * jitter : 0; DB.dot(cx + (sd * r + jx) * ppc, gy - z * ppc, col, w * a, r0); continue; }
    for (let k = 0; k < copies; k++) {
      const ph = rand(q * 1.37 + k * 7.71) * TAU, X = r * Math.cos(ph), Z = r * Math.sin(ph), depth = 0.8 + 0.2 * Math.sin(ph);
      DB.dot(cx + X * ppc, gy - z * ppc + Z * ppc * tilt, col, w * a * depth, r0);
    }
  }
}
const CTB = {};
/** isolines of the line-of-sight column density (smoke + low dust) — the silhouette and the rolled ring as thin lines */
function cloudContours(stage, name, {cx, gy, ppc, a = 1, levels = null, dustK = 0.5}) {
  const f = sim(name), P = projected(name), W2 = 2 * f.nx, H = f.ny;
  const G = (CTB[name] ||= {F: new Float32Array(W2 * H), tmp: new Float32Array(W2 * H), step: -1, j0: 0, j1: 0});
  if (G.step !== f.stepNo) {
    const j0 = Math.max(0, P.j0 - 3), j1 = Math.min(H - 1, P.j1 + 3); G.F.fill(0);
    for (let j = j0; j <= j1; j++) { const dHi = dustK * (1 - smooth((j - 0.25 * H) / (0.15 * H))), o = j * W2; for (let i = 0; i < W2; i++) G.F[o + i] = P.S[o + i] + dHi * P.D[o + i]; }
    smooth121(G.F, W2, H, j0, j1, G.tmp, 2); Object.assign(G, {j0, j1, step: f.stepNo});
  }
  strokeContours(stage, G.F, W2, H, G.j0, G.j1, {cx, gy, ppc, nx: f.nx, a, levels: levels || [[0.4, CT_OUT, 2], [1.5, CT_MID, 1.4]]});
}
function strokeContours(stage, F, W2, H, j0, j1, {cx, gy, ppc, nx, a = 1, levels}) {
  const c = stage.ctx, X = i => cx + (i + 0.5 - nx) * ppc, Y = j => gy - (j + 0.5) * ppc;
  c.save(); c.globalAlpha *= a; c.lineJoin = 'round'; c.lineCap = 'round';
  for (const [lev, col, w] of levels) { c.beginPath(); contourPath(c, F, W2, H, lev, j0, j1, X, Y); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
  c.restore();
}
const SLC = {};
/** isolines of the cut through the axis (mirrored r–z field) */
function sliceContours(stage, name, {cx, gy, ppc, a = 1, levels, field = 's'}) {
  const f = sim(name), nx = f.nx, H = f.ny, W2 = 2 * nx, src = f[field];
  const G = (SLC[name + field] ||= {F: new Float32Array(W2 * H), tmp: new Float32Array(W2 * H), step: -1, j0: 0, j1: 0});
  if (G.step !== f.stepNo) {
    let j0 = H, j1 = -1;
    for (let j = 0; j < H; j++) for (let i = 0; i < nx; i++) { const v = src[i + j * nx]; G.F[nx + i + j * W2] = v; G.F[nx - 1 - i + j * W2] = v; if (v > 1e-3) { if (j < j0) j0 = j; j1 = j; } }
    j0 = Math.max(0, j0 - 3); j1 = Math.min(H - 1, j1 + 3); if (j1 < j0) { j0 = 0; j1 = 0; }
    smooth121(G.F, W2, H, j0, j1, G.tmp, 1); Object.assign(G, {j0, j1, step: f.stepNo});
  }
  strokeContours(stage, G.F, W2, H, G.j0, G.j1, {cx, gy, ppc, nx, a, levels});
}
/** the dot cloud with its contours (one call per shot) */
function dotCloud(stage, name, o) {
  DB.begin(); cloudDots(name, o); DB.flush(stage, {gain: o.gain ?? 1.2, halo: o.halo ?? 0.5, alpha: o.alpha ?? 1});
  if ((o.contours ?? 1) > 0) cloudContours(stage, name, {cx: o.cx, gy: o.gy, ppc: o.ppc, a: (o.contours ?? 1) * (o.alpha ?? 1), levels: o.levels, dustK: o.dustK});
}

// ------------------------------------------------------------------ the atmosphere as a cross-section
/** flat field + ground line + dotted ground in perspective + altitude axis (km) + optional dashed tropopause */
function atmo(stage, {gy, ppc, km = KMM, a = 1, axis = 1, tropo = 0, tropoLabel = 0, layers = 0, axisX = 150, topY = 320, haze = 1}) {
  const c = stage.ctx, yK = k => gy - (k / km) * ppc;
  if (haze > 0 && gy > 0) { const y0 = Math.max(0, gy - 700), g = c.createLinearGradient(0, y0, 0, gy); g.addColorStop(0, 'rgba(60,86,150,0)'); g.addColorStop(1, `rgba(60,86,150,${0.13 * haze})`); c.fillStyle = g; c.fillRect(0, y0, 1080, gy - y0); }
  if (gy < 1920) {
    c.fillStyle = 'rgba(2,4,12,0.5)'; c.fillRect(0, gy, 1080, 1920 - gy);
    for (let k = 1; k <= 16; k++) {
      const v = (k / 16) ** 1.7, y = gy + 8 + (1920 - gy) * v * 1.05; if (y > 1925) break;
      const sp = 22 + 110 * v, rr = 0.8 + 1.7 * v; c.fillStyle = `rgba(150,170,220,${(0.1 + 0.2 * v) * a})`;
      for (let x = 540 - Math.ceil(600 / sp) * sp; x < 1095; x += sp) { c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); }
    }
    line(c, [[0, gy], [1080, gy]], `rgba(150,170,220,${0.6 * a})`, 1.5);
  }
  if (axis > 0) withAlpha(c, a * axis, () => {
    const kTop = Math.min(16, Math.floor((Math.min(gy, 1920) - topY) / ppc * km));
    if (kTop < 1) return;
    line(c, [[axisX, Math.min(gy, 1925)], [axisX, yK(kTop + 0.4)]], AXIS, 1.5);
    for (let k = 1; k <= kTop; k++) { const y = yK(k); if (y > 1920) continue; const big = k % 5 === 0; line(c, [[axisX, y], [axisX - (big ? 18 : 9), y]], AXIS, 1.5);
      if (big) stage.text(`${k} km`, axisX - 26, y, {size: 30, weight: 700, color: 'rgba(176,190,222,0.92)', align: 'right'}); }
  });
  if (tropo > 0) {
    const y = gy - (JTM + 0.5) * ppc;   // main-grid tropopause row
    withAlpha(c, a * tropo, () => { line(c, [[0, y], [1080, y]], 'rgba(176,206,255,0.7)', 2, {dash: [14, 10]}); });
    if (tropoLabel > 0) withAlpha(c, a * tropoLabel, () => stage.text('대류권계면 · 약 10 km', 1010, y - 28, {size: 30, weight: 700, color: PALE, align: 'right', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10}));
    if (layers > 0) withAlpha(c, a * layers, () => {
      stage.text('대류권', 1010, y + 46, {size: 30, weight: 700, color: 'rgba(176,190,222,0.75)', align: 'right'});
      stage.text('성층권', 1010, y - 76, {size: 30, weight: 700, color: 'rgba(176,190,222,0.75)', align: 'right'});
    });
  }
}
/** an event flash: a radial burst of light around (x, y) and its additive core (not a full-frame wash) */
function flashAt(stage, x, y, I, R = 900) {
  if (I <= 0.003) return;
  const c = stage.ctx; c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, `rgba(255,244,226,${clamp(I)})`); g.addColorStop(0.18, `rgba(255,214,160,${clamp(I * 0.55)})`); g.addColorStop(1, 'rgba(255,190,120,0)');
  c.fillStyle = g; c.fillRect(x - R, y - R, 2 * R, 2 * R); c.restore();
}
/** shock ring: a thin bright hemispherical front over the ground plus its ground ellipse */
function shockRing(stage, x, gy, R, a, {w = 3, flat = 0.18} = {}) {
  if (a <= 0 || R <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); c.rect(0, 0, 1080, gy); c.clip();
    c.strokeStyle = 'rgba(255,240,222,0.95)'; c.lineWidth = w; c.beginPath(); c.arc(x, gy, R, Math.PI, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,200,150,0.35)'; c.lineWidth = w * 4; c.beginPath(); c.arc(x, gy, R - w * 2, Math.PI, TAU); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255,224,190,0.7)'; c.lineWidth = w * 0.8; c.beginPath(); c.ellipse(x, gy + 2, R, R * flat, 0, 0, TAU); c.stroke();
  });
}

// =====================================================================================================
// Header, poster title, labels
// =====================================================================================================
export const titles = {
  hook: ['1945 · 미국 뉴멕시코', '첫 핵실험의 구름'],
  origin: ['서기 79년 · 베수비오', '화산도 같은 모양을'],
  essence: ['본질 · 부력', '뜨거운 공기는 가볍다'],
  ring: ['메커니즘 ① · 소용돌이 고리', '가장자리가 말려 내려간다'],
  stem: ['메커니즘 ② · 줄기', '아래 공기를 빨아올린다'],
  cap: ['메커니즘 ③ · 갓', '더 오르지 못해 옆으로'],
  cases: ['같은 원리', '산불, 그리고 잉크 한 방울'],
  myth: ['오해 바로잡기', '폭발이 위로만 터진 모양?'],
  close: ['', ''],
};
const POSTER = {q: '버섯구름은 왜 버섯 모양?', a: '떠오르는 뜨거운 공기', y: 1150, y2: 1286};
const MORPH = [0.9, 1.7];
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, T = stage.theme;
  const fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max}));
  QS ||= fit(POSTER.q, 800, 88); AS ||= fit(POSTER.a, 860, 140);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 54, q), y2 = lerp(POSTER.y2, 292, q), s2 = lerp(AS, 34, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g = c.createLinearGradient(0, 1040, 0, 1400); g.addColorStop(0, 'rgba(4,4,12,0)'); g.addColorStop(0.3, 'rgba(4,4,12,0.6)'); g.addColorStop(0.75, 'rgba(4,4,12,0.6)'); g.addColorStop(1, 'rgba(4,4,12,0)');
    c.fillStyle = g; c.fillRect(0, 1040, 1080, 360);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.7)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: sh, shadowBlur: 22});
    stage.text(POSTER.a, 540, y2, {role: 'display', weight: 700, size: s2, color: '#FFB070', align: 'center', shadow: sh, shadowBlur: 26});
  });
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: '#FFB070', align: 'center', tracking: 2, ...so}); line(c, [[505, 174], [575, 174]], '#FFB070', 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: '#F4EDE4', align: 'center', maxWidth: 820, ...so}));
}
/** a short label with a soft dark backing (≥ 30 px) */
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 34, c = stage.ctx, w = stage.measure(s, {size, weight: 700, role: o.role || 'body'});
  let x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2; x0 = clamp(x0, 70, 930 - w);
  withAlpha(c, o.a ?? 1, () => {
    const g = c.createLinearGradient(0, y - size, 0, y + size); g.addColorStop(0, 'rgba(6,6,16,0)'); g.addColorStop(0.5, 'rgba(6,6,16,0.55)'); g.addColorStop(1, 'rgba(6,6,16,0)');
    c.fillStyle = g; c.fillRect(x0 - 24, y - size, w + 48, size * 2);
    stage.text(s, x0, y, {size, weight: 700, role: o.role || 'body', color: o.color || '#F4EDE4', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
  });
}
/** big number with a small unit line */
function bigNum(stage, s, x, y, o = {}) {
  withAlpha(stage.ctx, o.a ?? 1, () => {
    stage.text(s, x, y, {role: 'display', weight: 700, size: o.size || 120, color: o.color || '#FFE2B8', align: o.align || 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 24});
    if (o.sub) stage.text(o.sub, x, y + (o.size || 120) * 0.62, {size: o.subSize || 34, weight: 500, color: '#E8DCCB', align: o.align || 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
  });
}

// =====================================================================================================
// Overlays (header + progress)
// =====================================================================================================
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1] + 0.4) {
    const q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0]));
    posterTitle(stage, q, t < MORPH[1] ? 1 : fadeOut(t, MORPH[1], 0.4));
    if (t < MORPH[1]) return;
  }
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const [k, ti] = titles[id] || ['', ''];
  const a = (id === 'hook' ? fadeIn(t, MORPH[1], 0.5) : smooth(ctx.scene.p / 0.05)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  head(stage, k, ti, a, a);
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
const FIELD = (() => { const R = rng(1945), s = []; for (let i = 0; i < 170; i++) s.push({x: R() * 1080, y: 300 + R() * 1100, r: 0.5 + 1.2 * R() ** 3, a: 0.08 + 0.3 * R() ** 2}); return s; })();
/** series background: dark navy field, faint stars, a very light vignette */
export function background(stage) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 380, 1920); g.addColorStop(0, '#0A142E'); g.addColorStop(1, '#050B1C');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  for (const s of FIELD) circle(c, s.x, s.y, s.r, `rgba(220,230,255,${s.a})`);
  const v = c.createRadialGradient(540, 860, 520, 540, 860, 1500); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = v; c.fillRect(0, 0, 1080, 1920);
}

// =====================================================================================================
// Scenes
// =====================================================================================================
const HY = 1340;   // ground line: the caption block sits below it, over the dotted ground
/** camera shake (very subtle) */
const shake = (t, t0, A = 6) => { const q = t - t0; if (q < 0 || q > 0.8) return [0, 0]; const e = A * Math.exp(-q / 0.18); return [e * Math.sin(q * 71), e * Math.cos(q * 53)]; };

/** camera fit: px per cell so that the cloud (top row, radius) fits between yTop and the ground and within the width */
function fitPpc(name, hy, {yTop = 380, wFrac = 0.86, max = 10, min = 3} = {}) {
  const f = sim(name), top = Math.max(26, f.topRow(0.02) + 6), r = Math.max(14, f.spread(0.02) + 4);
  return clamp(Math.min((hy - yTop) / top, 1080 * wFrac / (2 * r)), min, max);
}
const CAMS = {};
/** smoothed camera value per key (video frames come in order; stills jump and take the target directly) */
function smoothCam(key, t, target, rate = 2.2) {
  const c = CAMS[key];
  if (!c || t < c.t || t - c.t > 0.5) { CAMS[key] = {t, v: target}; return target; }
  const k = 1 - Math.exp(-(t - c.t) * rate); c.v += (target - c.v) * k; c.t = t; return c.v;
}
/** smoke-weighted centroid row of a sim */
function centroidRow(name) {
  const f = sim(name); let a = 0, b = 0;
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const w = f.s[i + j * f.nx] * (i + 0.5); a += w * (j + 0.5); b += w; }
  return b > 1e-6 ? a / b : 0;
}
const POSTER_FIT = {};
/** the thumbnail composition: big dot-and-contour mushroom on the atmosphere cross-section (no header on the 0 s frame,
 *  so the cloud may rise higher and stand on a lower ground line; the closing poster keeps the caption zone clear) */
function posterFrame(stage, P, push = 0, {gy = HY, yTop = 330} = {}) {
  const f = sim('main'), key = gy + '/' + yTop;
  f.goto(P.POSTER_STEP);
  const fit = (POSTER_FIT[key] ||= fitPpc('main', gy, {yTop, wFrac: 0.94, max: 10}));
  const ppc = fit * (1 + push);
  atmo(stage, {gy, ppc, tropo: 0.75});
  dotCloud(stage, 'main', {cx: 540, gy, ppc, warmFloor: 0.2, I: 1});
}

// ------------------------------------------------------------------ hook: poster → flash → the first test cloud grows
function hook(stage, t, p, ctx) {
  const P = plan(ctx.tl), c = stage.ctx;
  if (t < P.flash) { posterFrame(stage, P, 0, {gy: 1480, yTop: 250}); return; }
  const step = P.hookStep(t), u = t - P.flash;
  sim('main').goto(step);
  const g = smooth((t - P.flash) / (P.hookEnd - P.flash));
  const hy = lerp(1560, HY, easeInOut(g));
  const ppc = Math.min(8, smoothCam('hook', t, fitPpc('main', hy, {yTop: 430, max: 8})));
  const [sx, sy] = shake(t, P.flash, 7);
  c.save(); c.translate(sx, sy);
  atmo(stage, {gy: hy, ppc, axis: fadeIn(t, P.flash + 1.2, 0.8), tropo: 0.6 * fadeIn(t, P.reach10 + 1.5, 1)});
  // shock rings run out over the ground right after the flash
  for (const [d, sp] of [[0, 1100], [0.22, 760]]) { const uu = u - d; if (uu > 0) shockRing(stage, 540, hy, 30 + sp * uu, clamp(1 - uu / 1.2) * (d ? 0.6 : 1), {w: 2.5}); }
  const yc = hy - centroidRow('main') * ppc, hot = Math.exp(-u / 2.4);
  flashAt(stage, 540, yc, 0.45 * hot, 120 + 260 * (1 - hot));      // the incandescent core fades as the fireball cools
  dotCloud(stage, 'main', {cx: 540, gy: hy, ppc, I: 0.85 + 0.3 * hot, halo: 0.5 + 0.3 * hot});
  c.restore();
  flashAt(stage, 540, hy - 80, Math.exp(-u / 0.18) * 1.25, 1500);
  const a = fadeIn(t, P.reach10 - 1.4, 0.5) * fadeOut(t, P.s03 + 1.4, 0.5), y = hy - (10 / KMM) * ppc;
  if (a > 0 && y > 330) withAlpha(c, a, () => { line(c, [[60, y], [1020, y]], 'rgba(255,190,130,0.9)', 2.5, {dash: [16, 12]}); tag(stage, '10 km', 880, y - 36, {size: 38, color: '#FFD9A8'}); });
  const b = fadeIn(t, P.s03 - 0.2, 0.5) * fadeOut(t, P.hookEnd - 0.45, 0.35);
  if (b > 0) bigNum(stage, `+${(step * SEC_PER_STEP / 60).toFixed(1)}분`, 540, 470, {a: b, size: 110, sub: `폭발 뒤 흐른 시간 · 약 ${Math.round(P.speedup)}배 빠르게`});
}

// ------------------------------------------------------------------ origin: Vesuvius (79) → nuclear and volcano side by side
const VESU = {base: HY, vent: 1050, cx: 540};
const CONE = (() => { const {base, vent, cx} = VESU, h = base - vent;
  return [[-40, base], [60, base - 0.22 * h], [190, base - 0.48 * h], [300, vent + 0.28 * h], [370, vent + 0.11 * h], [430, vent + 0.17 * h], [cx - 46, vent + 4], [cx + 46, vent + 2], [cx + 140, vent + 0.13 * h], [cx + 300, base - 0.47 * h], [cx + 470, base - 0.2 * h], [1120, base]]; })();
/** the volcano as a line outline (dark inside, so the ground dots stop at its flanks) */
function vesuvius(stage) {
  const c = stage.ctx;
  poly(c, [...CONE, [1120, 1925], [-40, 1925]], 'rgba(4,8,20,0.97)');
  line(c, CONE.slice(1, -1), 'rgba(206,194,180,0.85)', 2.5);
  withAlpha(c, 0.35, () => { for (const f of [0.35, 0.62]) line(c, CONE.slice(2, -2).map(([x, y]) => [lerp(VESU.cx, x, 1 + f * 0.25), y + f * (VESU.base - y) * 0.9]), 'rgba(206,194,180,0.6)', 1.5, {dash: [6, 10]}); });
}
/** umbrella pine as a thin line silhouette: trunk, a few limbs, a flat lumpy crown */
function pine(stage, x, y, h, w, a = 1) {
  const c = stage.ctx, col = 'rgba(214,226,255,0.9)';
  withAlpha(c, a, () => {
    line(c, [[x - 8, y], [x - 5, y - h * 0.5], [x - 12, y - h * 0.82]], col, 2.5);
    line(c, [[x + 8, y], [x + 5, y - h * 0.5], [x + 10, y - h * 0.82]], col, 2.5);
    for (const k of [-1.6, -0.6, 0.5, 1.5]) line(c, [[x + k * 4, y - h * 0.8], [x + k * w * 0.2, y - h * 0.9]], col, 2);
    const top = [], bot = [];
    for (let k = 0; k <= 48; k++) { const u = k / 48, px = x + (u - 0.5) * w, s = Math.sin(u * Math.PI);
      top.push([px, y - h * (0.9 + 0.1 * s) - h * 0.025 * s * Math.abs(Math.sin(u * 23))]); bot.push([px, y - h * (0.86 + 0.02 * s) + h * 0.018 * s * Math.abs(Math.sin(u * 17 + 1))]); }
    poly(c, [...top, ...bot.reverse()], 'rgba(8,14,30,0.9)', col, 2);
  });
}
function volcanoShot(stage, t, P, o = {}) {
  const steps = lerp(150, 430, clamp((t - P.tl.scene('origin').start) / (P.split + 7 - P.tl.scene('origin').start)));
  sim('volc').goto(steps);
  atmo(stage, {gy: VESU.base, ppc: 1, axis: 0, haze: 0.7});
  const ppc = o.ppc || smoothCam('volc', t, fitPpc('volc', VESU.vent, {yTop: 330, wFrac: 0.95, max: 6.5}));
  vesuvius(stage);
  flashAt(stage, 540, VESU.vent, 0.32, 110);
  dotCloud(stage, 'volc', {cx: 540, gy: VESU.vent, ppc, heatK: 17, I: 0.8, cold: C3.ash, smokeRef: 0.3, levels: [[0.6, CT_OUT, 2], [4, 'rgba(206,206,220,0.4)', 1.4]], dustK: 0});
}
/** offscreen full frames for split screens: render a whole shot, then copy its centre strip into one half */
const OFF = {};
function offStage(ctx, key) { return (OFF[key] ||= ctx.kit.createStage({theme: ctx.theme})); }
function half(stage, off, side, a = 1) {
  const c = stage.ctx; withAlpha(c, a, () => c.drawImage(off.canvas, 270, 0, 540, 1920, side < 0 ? 0 : 540, 0, 540, 1920));
}
function seam(stage, a) { withAlpha(stage.ctx, a, () => line(stage.ctx, [[540, 300], [540, 1920]], 'rgba(160,174,206,0.45)', 1.5)); }
function nuclearHalf(A, P, ppc) {
  background(A); sim('main').goto(P.POSTER_STEP + 10);
  atmo(A, {gy: HY, ppc, axis: 0, tropo: 0.6}); dotCloud(A, 'main', {cx: 540, gy: HY, ppc, warmFloor: 0.2, I: 1});
}
function origin(stage, t, p, ctx) {
  const P = plan(ctx.tl), c = stage.ctx;
  if (t < P.split - 0.3) {
    volcanoShot(stage, t, P);
    const a = fadeIn(t, P.pine, 0.6);
    if (a > 0) {
      pine(stage, 860, VESU.base + 2, 520 * easeOut(a) + 1, 360, a);
      // the same outline laid over the eruption column for a moment
      const b = fadeIn(t, P.pine + 0.5, 0.5) * fadeOut(t, P.pine + 3.2, 0.6), f = sim('volc'), ppc = fitPpc('volc', VESU.vent, {yTop: 330, wFrac: 0.95, max: 6.5});
      if (b > 0) withAlpha(c, b, () => {
        const top = VESU.vent - f.topRow(0.03) * ppc, w = f.spread(0.03, f.topRow(0.03) - 40) * ppc;
        c.setLineDash([12, 10]); c.strokeStyle = 'rgba(255,214,170,0.95)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(510, VESU.vent); c.lineTo(510, top + 90); c.moveTo(570, VESU.vent); c.lineTo(570, top + 90); c.stroke();
        c.beginPath(); c.ellipse(540, top + 60, Math.max(80, w), 70, 0, Math.PI, TAU); c.stroke(); c.setLineDash([]);
      });
      tag(stage, '우산처럼 퍼진 소나무', 820, 760, {a, size: 36});
    }
    return;
  }
  // split: nuclear (left) | volcano (right) — each shot rendered full-frame offscreen, centre strips side by side
  const q = smooth((t - P.split + 0.3) / 0.8);
  const A = offStage(ctx, 'L'), B = offStage(ctx, 'R');
  if (A._key !== 'split') { nuclearHalf(A, P, 3.9 * SC); A._key = 'split'; }
  background(B); volcanoShot(B, t, P, {ppc: 3.6});
  if (q < 1) volcanoShot(stage, t, P);
  half(stage, A, -1, q); half(stage, B, 1, q); seam(stage, q);
  tag(stage, '핵폭발', 270, 430, {a: q, size: 40});
  tag(stage, '화산', 810, 430, {a: q, size: 40});
  const h = fadeIn(t, W_(ctx.tl, 's05', '뜨거운', -0.1), 0.5);
  if (h > 0) tag(stage, '뜨거운 공기 덩어리', 540, 1270, {a: h, size: 42, color: '#FFC890'});
}

// ------------------------------------------------------------------ essence: hot air is lighter, rises like a balloon
const MOL = (() => { const R = rng(31), o = []; for (let i = 0; i < 520; i++) o.push({x: R(), y: R(), ph: R() * TAU, sp: 0.6 + R()}); return o; })();
/** hot-air balloon as a line drawing */
function balloon(stage, x, y, s, a) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    const env = () => { c.beginPath(); c.moveTo(x, y + 60 * s); c.bezierCurveTo(x - 150 * s, y - 20 * s, x - 120 * s, y - 230 * s, x, y - 230 * s); c.bezierCurveTo(x + 120 * s, y - 230 * s, x + 150 * s, y - 20 * s, x, y + 60 * s); };
    env(); c.fillStyle = 'rgba(8,14,30,0.85)'; c.fill(); c.strokeStyle = ACC; c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = 'rgba(255,176,112,0.55)'; c.lineWidth = 1.5; for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(x, y + 60 * s); c.quadraticCurveTo(x + k * 190 * s, y - 120 * s, x, y - 230 * s); c.stroke(); }
    rect(c, x - 18 * s, y + 78 * s, 36 * s, 26 * s, 3, null, 'rgba(214,226,255,0.85)', 2);
    line(c, [[x - 16 * s, y + 78 * s], [x - 10 * s, y + 58 * s]], 'rgba(214,226,255,0.85)', 1.5); line(c, [[x + 16 * s, y + 78 * s], [x + 10 * s, y + 58 * s]], 'rgba(214,226,255,0.85)', 1.5);
    flashAt(stage, x, y + 64 * s, 0.6, 26 * s);
  });
}
function essence(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const step = lerp(2, 125, easeInOut(clamp((t - sc.start) / (sc.end - sc.start))) ** 0.9);
  sim('main').goto(step);
  const ppc = (12.5 - 3.5 * smooth((t - P.key) / 4)) * SC, cr = centroidRow('main');
  const yc = 980, gy = yc + cr * ppc;
  atmo(stage, {gy: Math.min(2400, gy), ppc, axis: 0});
  flashAt(stage, 540, yc, 0.22, 340);
  dotCloud(stage, 'main', {cx: 540, gy, ppc, warmFloor: 0.35});
  // molecules: hot inside (sparse, fast), cold outside (dense, slow)
  const m = fadeIn(t, sc.start + 0.3, 0.6) * fadeOut(t, P.key + 0.6, 0.6);
  if (m > 0) {
    const R = (sim('main').spread(0.15) + 2) * ppc, cyB = gy - cr * ppc;
    withAlpha(c, m, () => {
      for (const [k, o] of MOL.entries()) {
        const jx = Math.sin(t * 3.1 * o.sp + o.ph), jy = Math.cos(t * 2.7 * o.sp + o.ph * 1.3);
        const x = 40 + o.x * 1000, y = 330 + o.y * 1150, d = Math.hypot(x - 540, y - cyB);
        if (d < R * 0.95) { if (k % 4) continue; circle(c, x + jx * 16, y + jy * 16, 4.5, 'rgba(255,214,150,0.95)'); }
        else if (d > R * 1.12) circle(c, x + jx * 3, y + jy * 3, 3.2, 'rgba(170,205,255,0.7)');
      }
    });
    tag(stage, '찬 공기 · 촘촘', 230, 420, {a: m, size: 36, color: '#BFD6FF'});
    tag(stage, '뜨거운 공기 · 듬성', 540, Math.min(1270, cyB + R + 70), {a: m, size: 38, color: '#FFE0B0'});
  }
  const b = fadeIn(t, P.balloon, 0.5) * fadeOut(t, P.key + 1.5, 0.6);
  if (b > 0) balloon(stage, 190, lerp(1300, 700, smooth((t - P.balloon) / 5)), 0.8, b);
}

// ------------------------------------------------------------------ ring: cross-section with flow lines → 3D vortex ring
function drawTracers(stage, name, {cx, gy, ppc, a = 1, kind = 0, len = 7}) {
  const f = sim(name), c = stage.ctx;
  c.save(); c.globalAlpha *= a; c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineWidth = 1.5;
  for (let q = 0; q < f.nt; q += 4) {
    if (f.tk[q] !== kind) continue;
    const r = f.tx[q], y = f.ty[q], sv = f.sampleC(f.s, r, y); if (sv < 0.05) continue;
    const u = f.sampleU(r, y), v = f.sampleV(r, y), sp = Math.hypot(u, v), side = rand(q * 0.731) < 0.5 ? 1 : -1;
    const x = cx + side * r * ppc, yy = gy - y * ppc;
    if (x < -20 || x > 1100 || yy < -20 || yy > 1940) continue;
    const h = clamp((f.sampleC(f.th, r, y) - f.ambAt(y)) / 6);
    c.strokeStyle = `rgba(${Math.round(lerp(160, 255, h))},${Math.round(lerp(196, 186, h))},${Math.round(lerp(255, 128, h))},${(0.12 + 0.33 * clamp(sp * 1.2)) * clamp(sv / 0.3)})`;
    c.beginPath(); c.moveTo(x - side * u * ppc * len, yy + v * ppc * len); c.lineTo(x, yy); c.stroke();
  }
  c.restore();
}
function arrowUp(stage, x, y0, y1, w, col, a = 1) {
  const c = stage.ctx; if (Math.abs(y1 - y0) < 8) return;
  withAlpha(c, a, () => { line(c, [[x, y0], [x, y1 + 16]], col, w, {cap: 'butt'}); poly(c, [[x - 4 - w * 1.3, y1 + 20], [x + 4 + w * 1.3, y1 + 20], [x, y1 - 6]], col); });
}
const TOR = (() => { const R = rng(9), o = []; for (let i = 0; i < 5200; i++) o.push({phi: R() * TAU, psi: R() * TAU, rr: 0.55 + 0.45 * Math.sqrt(R()), w: 0.8 + 0.4 * R(), c: R()}); return o; })();
function torusShot(stage, t, t0, a) {
  const c = stage.ctx, u = t - t0, yaw = 0.5 + u * 0.32, pitch = 0.66 - 0.12 * smooth(u / 5), Rr = 330, rt = 100, rise = u * 22;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch), F = 1500, Dz = 1700, cx = 540, cy = 860;
  const P3 = (X, Y, Z) => { const x1 = X * cosY + Z * sinY, z1 = -X * sinY + Z * cosY, y2 = Y * cosP - z1 * sinP, z2 = Y * sinP + z1 * cosP, k = F / (Dz + z2); return [cx + x1 * k, cy - y2 * k, z2, k]; };
  withAlpha(c, a, () => {
    background(stage);
    // faint guide: the ring's centre circle and the axis
    const circ = []; for (let k = 0; k <= 72; k++) { const ph = k / 72 * TAU; const [x, y] = P3(Rr * Math.cos(ph), rise, Rr * Math.sin(ph)); circ.push([x, y]); }
    line(c, circ, 'rgba(160,174,206,0.35)', 1.5, {dash: [8, 10]});
    { const [x0, y0] = P3(0, rise - 260, 0), [x1, y1] = P3(0, rise + 300, 0); line(c, [[x0, y0], [x1, y1]], 'rgba(160,174,206,0.35)', 1.5, {dash: [8, 10]}); }
  });
  DB.begin();
  for (const p of TOR) {
    const psi = p.psi - u * 1.35 * p.w, rho = Rr + rt * p.rr * Math.cos(psi), yy = rt * p.rr * Math.sin(psi) + rise;
    const [sx, sy, z2, k] = P3(rho * Math.cos(p.phi), yy, rho * Math.sin(p.phi));
    if (sx < -40 || sx > 1120 || sy < -40 || sy > 1960) continue;
    const near = clamp((Dz - z2 - 1300) / 800), col = p.c < 0.55 ? C3.amber : p.c < 0.82 ? C3.hot : C3.cool;
    DB.dot(sx, sy, col, a * (0.22 + 0.3 * near) * (0.6 + 0.4 * p.rr), clamp(1.3 * k, 1, 2.2));
  }
  DB.flush(stage, {gain: 1.2, halo: 0.35});
  // circulation arrows on the near side of the tube
  const ar = clamp((u - 0.8) / 0.6) * a;
  if (ar > 0) withAlpha(c, ar, () => {
    for (const side of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 22; k++) { const ps = (side > 0 ? 0.3 : Math.PI - 0.3) + side * (k / 22) * 4.6 - u * 1.35;
        const [x, y] = P3(side * (Rr + rt * 1.05 * Math.cos(ps)), rt * 1.05 * Math.sin(ps) + rise, 0); pts.push([x, y]); }
      line(c, pts, 'rgba(255,236,210,0.9)', 3); const [p1, p0] = [pts[pts.length - 1], pts[pts.length - 3]], ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      poly(c, [[p1[0] + 15 * Math.cos(ang), p1[1] + 15 * Math.sin(ang)], [p1[0] + 11 * Math.cos(ang + 2.4), p1[1] + 11 * Math.sin(ang + 2.4)], [p1[0] + 11 * Math.cos(ang - 2.4), p1[1] + 11 * Math.sin(ang - 2.4)]], 'rgba(255,236,210,0.95)');
    }
  });
}
const SLICE_LEVELS = [[0.06, CT_OUT, 2], [0.25, CT_MID, 1.7], [0.55, CT_IN, 1.5]];
function ring(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const tTor = P.donut;
  if (t < tTor + 0.6) {
    if (t > tTor - 0.1) { c.save(); c.globalAlpha = 1 - smooth((t - tTor + 0.1) / 0.3); c.translate(540, 900); c.scale(1 + 0.25 * smooth((t - tTor + 0.1) / 0.5), 1 + 0.25 * smooth((t - tTor + 0.1) / 0.5)); c.translate(-540, -900); }
    const step = lerp(30, 175, clamp((t - sc.start) / (tTor - sc.start)) ** 0.95);
    sim('main').goto(step);
    const ppc = 8.6 * SC, cr = centroidRow('main'), gy = 980 + cr * ppc;
    // faint section grid (this is a cut through the middle)
    withAlpha(c, 0.1, () => { for (let x = 0; x <= 1080; x += 60) line(c, [[x, 0], [x, 1920]], '#8FA6FF', 1); for (let y = 0; y <= 1920; y += 60) line(c, [[0, y], [1080, y]], '#8FA6FF', 1); });
    if (gy < 1920) line(c, [[0, gy], [1080, gy]], 'rgba(150,170,220,0.6)', 1.5);
    sliceContours(stage, 'main', {cx: 540, gy, ppc, levels: SLICE_LEVELS});
    drawTracers(stage, 'main', {cx: 540, gy, ppc, kind: 0, len: 9});
    tag(stage, '단면 · 가운데를 자른 모습', 540, 410, {size: 34, color: '#C8D4FF'});
    // centre vs edge speed arrows, measured from the model
    const f = sim('main'), yb = cr, vC = f.sampleV(1, yb), R = f.spread(0.15), vE = f.sampleV(R * 0.92, yb);
    const ac = fadeIn(t, P.center, 0.4) * fadeOut(t, P.roll, 0.4), ae = fadeIn(t, P.edge, 0.4) * fadeOut(t, P.roll, 0.4);
    const ys = gy - yb * ppc + 60;
    if (ac > 0) arrowUp(stage, 540, ys, ys - vC * 175, 6, 'rgba(255,200,140,0.95)', ac);
    if (ae > 0) for (const sd of [-1, 1]) arrowUp(stage, 540 + sd * R * 0.92 * ppc, ys, ys - Math.max(0.05, vE) * 175, 5, 'rgba(170,205,255,0.95)', ae);
    if (ac > 0) tag(stage, '빠르게', 540, ys - vC * 175 - 60, {a: ac, size: 34, color: '#FFE0B0'});
    if (ae > 0) tag(stage, '느리게', 540 + R * 0.92 * ppc, ys + 54, {a: ae, size: 34, color: '#CFE0FF'});
    // roll-up arrows around the vortex cores
    const ar = fadeIn(t, P.roll, 0.4) * fadeOut(t, tTor + 0.2, 0.3);
    if (ar > 0) {
      // vortex core = where smoke-laden air turns fastest (vorticity from the model velocities, away from the axis)
      let best = 0, bi = 0, bj = 0; for (let j = 3; j < f.ny - 3; j++) for (let i = 4; i < f.nx - 3; i++) { const sv = f.s[i + j * f.nx]; if (sv < 0.05) continue;
        const w = Math.abs((f.sampleV(i + 1.5, j + 0.5) - f.sampleV(i - 0.5, j + 0.5)) - (f.sampleU(i + 0.5, j + 1.5) - f.sampleU(i + 0.5, j - 0.5))) * sv; if (w > best) { best = w; bi = i; bj = j; } }
      for (const sd of [-1, 1]) {
        const x0 = 540 + sd * (bi + 0.5) * ppc, y0 = gy - (bj + 0.5) * ppc, rr = 70, ph = -t * 2.2 * sd;
        const pts = []; for (let k = 0; k <= 26; k++) { const an = ph + sd * (k / 26) * 4.8; pts.push([x0 + rr * Math.cos(an), y0 + rr * Math.sin(an)]); }
        withAlpha(c, ar, () => { line(c, pts, 'rgba(255,240,220,0.9)', 3.5); const p1 = pts[26], p0 = pts[24], an = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
          poly(c, [[p1[0] + 16 * Math.cos(an), p1[1] + 16 * Math.sin(an)], [p1[0] + 12 * Math.cos(an + 2.4), p1[1] + 12 * Math.sin(an + 2.4)], [p1[0] + 12 * Math.cos(an - 2.4), p1[1] + 12 * Math.sin(an - 2.4)]], 'rgba(255,240,220,0.95)'); });
      }
      tag(stage, '말려 내려감', 540, 1270, {a: ar, size: 38, color: '#FFE6C8'});
    }
    if (t > tTor - 0.1) c.restore();
  }
  if (t >= tTor + 0.15) {
    const a = smooth((t - tTor - 0.15) / 0.45);
    torusShot(stage, t, tTor - 0.1, a);
    tag(stage, '도넛 모양 소용돌이 고리', 540, 410, {a: a * fadeIn(t, tTor + 0.5, 0.5), size: 38, color: '#FFE0B0'});
  }
}

// ------------------------------------------------------------------ stem: dust sucked up the middle; winds rush in
function stem(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const step = lerp(150, 330, clamp((t - sc.start) / (sc.end - sc.start)));
  sim('main').goto(step);
  const hy = HY, ppc = smoothCam('stem', t, fitPpc('main', hy, {yTop: 330, max: 5}) * (1 + 0.05 * smooth((t - sc.start) / 12)));
  atmo(stage, {gy: hy, ppc, tropo: 0.5});
  const f = sim('main'), da = fadeIn(t, sc.start + 0.2, 0.5);
  DB.begin();
  cloudDots('main', {cx: 540, gy: hy, ppc, kinds: 1, warmFloor: 0.15});
  // dust tracers in perspective on the ground plane (depth → lower and bigger), rising up the stem
  for (let q = NSM; q < f.nt; q++) {
    const r = f.tx[q], y = f.ty[q], phi = rand(q * 2.91) * TAU, X = r * Math.cos(phi), Z = r * Math.sin(phi);
    const x = 540 + X * ppc * (1 + Z / 450), yy = hy - y * ppc + Z * ppc * 0.16;
    if (yy > 1930 || yy < 200) continue;
    DB.dot(x, yy, C3.dust, da * clamp(0.25 + 0.55 * (1 - y / 180)) * 0.7, 1.1 + 0.9 * (1 + Z / 192));
  }
  DB.flush(stage, {gain: 1.15, halo: 0.3});
  cloudContours(stage, 'main', {cx: 540, gy: hy, ppc});
  // inflow chevrons on the ground (from all sides toward the stem)
  const wa = fadeIn(t, P.wind, 0.5);
  if (wa > 0) {
    const ph = (t * 0.9) % 1;
    for (let k = 0; k < 6; k++) {
      const an = k / 6 * TAU + 0.3, r0 = 440, r1 = 110;
      for (let m = 0; m < 3; m++) { const u = (m / 3 + ph) % 1, rr = lerp(r0, r1, u), x = 540 + rr * Math.cos(an), y = hy + 24 + rr * Math.sin(an) * 0.2, dir = Math.atan2(-Math.sin(an) * 0.2, -Math.cos(an)), s = 20;
        withAlpha(c, wa * bumpA(u), () => line(c, [[x + s * 0.8 * Math.cos(dir + 2.4), y + s * 0.8 * Math.sin(dir + 2.4)], [x + s * Math.cos(dir), y + s * Math.sin(dir)], [x + s * 0.8 * Math.cos(dir - 2.4), y + s * 0.8 * Math.sin(dir - 2.4)]], 'rgba(255,230,200,0.95)', 3)); }
    }
    tag(stage, '주변 바람이 몰려 듦', 290, 1150, {a: wa, size: 36, color: '#FFE0C0'});
  }
  const dd = fadeIn(t, P.dust, 0.5) * fadeOut(t, P.wind - 0.3, 0.4);
  if (dd > 0) tag(stage, '흙먼지가 빨려 올라감', 290, 1150, {a: dd, size: 36, color: '#F0C090'});
}
const bumpA = u => Math.sin(clamp(u) * Math.PI);

// ------------------------------------------------------------------ cap: cools, stops under the tropopause, spreads, condenses
function cap(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const k = t < P.tropo ? lerp(150, 235, clamp((t - sc.start) / (P.tropo - sc.start))) : t < P.spread ? lerp(235, 300, clamp((t - P.tropo) / (P.spread - P.tropo))) : t < P.cond - 0.4 ? lerp(300, 470, clamp((t - P.spread) / (P.cond - 0.4 - P.spread))) : lerp(470, 560, clamp((t - P.cond + 0.4) / (sc.end - P.cond + 0.4)));
  sim('main').goto(k);
  const ga = fadeIn(t, P.tropo + 0.6, 0.6) * fadeOut(t, P.capW + 0.8, 0.6), side = smooth((t - P.tropo) / 0.8) * (1 - smooth((t - P.capW - 0.8) / 1.2));
  const hy = HY, ppc = smoothCam('cap', t, fitPpc('main', hy, {yTop: 340, wFrac: lerp(0.92, 0.6, side), max: 5})), cx = smoothCam('capx', t, 540 + 170 * side);
  const cond = smooth((t - P.cond + 0.3) / 2.2), ta = fadeIn(t, P.tropo, 0.6);
  atmo(stage, {gy: hy, ppc, tropo: 0.35 + 0.65 * ta});
  const la = ta * fadeOut(t, P.spread - 0.25, 0.3);
  if (la > 0) { const yT = hy - (JTM + 0.5) * ppc, yL = Math.min(yT - 30, hy - (sim('main').topRow(0.02) + 4) * ppc - 34);
    withAlpha(c, la, () => { line(c, [[1046, yL + 20], [1046, yT]], 'rgba(176,206,255,0.7)', 1.5, {dash: [4, 6]}); circle(c, 1046, yT, 4, PALE);
      stage.text('대류권계면 · 약 10 km', 1030, yL, {size: 30, weight: 700, color: PALE, align: 'right', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10}); }); }
  if (ta > 0) { const yT = hy - (JTM + 0.5) * ppc; withAlpha(c, ta * (0.6 + 0.4 * Math.sin(t * 3)), () => line(c, [[0, yT], [1080, yT]], 'rgba(176,206,255,0.25)', 8)); }
  dotCloud(stage, 'main', {cx, gy: hy, ppc, warmFloor: 0.15, cond: cond > 0 ? z => cond * smooth((z - 188) / 52) : null});
  // temperature–height graph (left), on the same altitude axis: air temperature vs the rising parcel
  if (ga > 0) {
    const zMax = Math.min(13, (hy - 360) / ppc * KMM), xT = T => 236 + (T + 60) / 160 * 280, yZ = z => hy - (z / KMM) * ppc;
    const amb = z => z < 10 ? 30 - 6.5 * z : -35 + 1.0 * (z - 10), parcel = z => z < 10 ? amb(z) + 70 * (1 - z / 10) ** 1.6 : amb(z) - 6 * (z - 10);
    withAlpha(c, ga, () => {
      line(c, [[xT(-60), yZ(0)], [xT(100), yZ(0)]], AXIS, 1.5);
      for (const T of [-40, 0, 40, 80]) line(c, [[xT(T), yZ(0)], [xT(T), yZ(0) + 10]], AXIS, 1.5);
      const A = [], Pp = []; for (let z = 0; z <= zMax; z += 0.25) { A.push([xT(amb(z)), yZ(z)]); Pp.push([xT(parcel(z)), yZ(z)]); }
      line(c, A, 'rgba(160,205,255,0.95)', 3); line(c, Pp, 'rgba(255,170,90,0.95)', 3);
      circle(c, xT(amb(10)), yZ(10), 7, '#FFFFFF'); flashAt(stage, xT(amb(10)), yZ(10), 0.5, 34);
      stage.text('주변 기온', xT(amb(4)) + 18, yZ(4), {size: 32, weight: 700, color: '#BFD8FF', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
      stage.text('구름 덩어리', xT(parcel(6)) + 18, yZ(6) - 36, {size: 32, weight: 700, color: '#FFC090', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
    });
  }
  // spreading arrows
  const sa = fadeIn(t, P.spread, 0.4) * fadeOut(t, P.cond - 0.3, 0.4);
  if (sa > 0) { const f = sim('main'), R = f.spread(0.03, JTM - 45) * ppc, yy = hy - (f.topRow(0.03) - 21) * ppc, ph = (t * 0.8) % 1;
    for (const sd of [-1, 1]) withAlpha(c, sa, () => { const x0 = cx + sd * (R * 0.55 + ph * 120); line(c, [[x0, yy], [x0 + sd * 90, yy]], 'rgba(255,236,210,0.95)', 4, {cap: 'butt'}); poly(c, [[x0 + sd * 116, yy], [x0 + sd * 88, yy - 14], [x0 + sd * 88, yy + 14]], 'rgba(255,236,210,0.95)'); });
    tag(stage, '갓 · 옆으로 퍼짐', cx, yy - 70, {a: sa, size: 38, color: '#FFE6C8'}); }
  if (cond > 0) tag(stage, '수증기 → 물방울 · 하얀 갓', 540, 430, {a: cond * fadeOut(t, sc.end - 0.4, 0.3), size: 36, color: '#EAF4FF'});
}

// ------------------------------------------------------------------ cases: wildfire → ink drop in water → mirror
const FOREST = (() => { const o = []; for (let x = -10, k = 0; x <= 1100; k++) { const h = 30 + 34 * vnoise(x * 0.05, 1) + 22 * rand(k * 3.3), w = 16 + 10 * rand(k * 1.7); o.push({x, h, w}); x += w * (0.9 + 0.6 * rand(k * 5.1)); } return o; })();
function fireShot(stage, t, P, sc) {
  const c = stage.ctx, step = lerp(260, 470, clamp((t - sc.start) / (P.ink - sc.start + 1.5)));
  sim('fire').goto(step);
  const hy = HY;
  atmo(stage, {gy: hy, ppc: 1, axis: 0, haze: 0.6});
  const ppc = smoothCam('fire', t, fitPpc('fire', hy, {yTop: 380, wFrac: 0.95, max: 11}));
  // burning line along the ground
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 28; k++) { const x = (k + 0.5) * 1080 / 28, fl = 0.6 + 0.4 * Math.sin(t * 7 + k * 1.7) * Math.sin(t * 3.1 + k); flashAt(stage, x, hy - 8, 0.22 * fl, 46 + 20 * fl); }
  c.restore();
  dotCloud(stage, 'fire', {cx: 540, gy: hy, ppc, heatK: 10, I: 0.8, cold: C3.ash, smokeRef: 0.25, dustK: 0, levels: [[0.5, CT_OUT, 2], [3, CT_MID, 1.5]]});
  // the forest: thin conifer outlines along the ground
  for (const tr of FOREST) {
    const pts = [[tr.x - tr.w / 2, hy], [tr.x - tr.w * 0.18, hy - tr.h * 0.45], [tr.x - tr.w * 0.36, hy - tr.h * 0.42], [tr.x, hy - tr.h], [tr.x + tr.w * 0.36, hy - tr.h * 0.42], [tr.x + tr.w * 0.18, hy - tr.h * 0.45], [tr.x + tr.w / 2, hy]];
    poly(c, pts, 'rgba(4,8,20,0.95)', 'rgba(180,196,232,0.6)', 1.5);
  }
  // embers rising
  DB.begin();
  for (let q = 0; q < 140; q++) { const u = ((t * (0.15 + rand(q) * 0.2) + rand(q * 3)) % 1), x = rand(q * 5.1) * 1080 + Math.sin(t * 2 + q) * 20, y = hy - u * 700; DB.dot(x, y, C3.amber, (1 - u) * 0.9, 1.6); }
  DB.flush(stage, {gain: 1.3, halo: 0.4});
  tag(stage, '큰 산불 · 불구름', 540, 420, {size: 38, color: '#FFD0A0', a: fadeIn(t, sc.start + 0.3, 0.4)});
}
const INK_LEVELS = [[0.04, 'rgba(196,168,255,0.8)', 2], [0.16, 'rgba(160,124,255,0.6)', 1.6], [0.42, 'rgba(226,210,255,0.45)', 1.4]];
const inkCol = sv => mixc(C3.inkDeep, C3.ink, clamp(sv * 2.2));
function inkShot(stage, t, t0, sc, o = {}) {
  const c = stage.ctx, step = lerp(10, 420, clamp((t - t0) / (sc.end - t0)) ** 0.85), f = sim('ink');
  f.goto(step);
  const ppc = (o.ppc || 9.6) * SC, gy0 = 320 + 372 * ppc, cr = centroidRow('ink');
  // the camera follows the sinking ink once it passes mid-screen; depth marks on the right scroll by
  const dy = smoothCam('ink' + (o.ppc || 0), t, Math.max(0, gy0 - cr * ppc - 860), 3), gy = gy0 - dy, ys = 300 - dy;
  // dark water below a thin surface line
  const g = c.createLinearGradient(0, Math.max(0, ys), 0, 1920); g.addColorStop(0, '#0C1D38'); g.addColorStop(1, '#060E22'); c.fillStyle = g; c.fillRect(0, Math.max(0, ys), 1080, 1920 - Math.max(0, ys));
  if (ys > -10) line(c, Array.from({length: 55}, (_, m) => [m * 20, ys + 3 * Math.sin(m * 0.6 + t * 2)]), 'rgba(176,206,255,0.8)', 2);
  for (let d = 1; d <= 30; d++) { const y = ys + d * 120; if (y < 300 || y > 1920) continue; line(c, [[1040, y], [1060, y]], 'rgba(160,174,206,0.5)', 1.5); }
  for (let q = 0; q < 34; q++) { const u = (t * (0.06 + rand(q) * 0.08) + rand(q * 9)) % 1, x = rand(q * 4.4) * 1080 + 8 * Math.sin(t * 3 + q), y = 1880 - u * 1500; withAlpha(c, 0.28 * (1 - u), () => { c.strokeStyle = 'rgba(176,206,255,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 3 + 4 * rand(q * 2), 0, TAU); c.stroke(); }); }
  sliceContours(stage, 'ink', {cx: 540, gy, ppc, levels: INK_LEVELS});
  DB.begin(); cloudDots('ink', {cx: 540, gy, ppc, slice: true, palette: inkCol, I: 0.55, smokeRef: 0.06, rad: 1.5}); DB.flush(stage, {gain: 1.2, halo: 0.4});
  return {ppc};
}
function cases(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  if (t < P.ink - 0.25) { fireShot(stage, t, P, sc); return; }
  if (t < P.mirror - 0.3) {
    const a = smooth((t - P.ink + 0.25) / 0.5);
    inkShot(stage, t, P.ink - 0.25, {end: P.mirror + 6});
    tag(stage, '물에 떨어뜨린 잉크 한 방울', 790, 430, {size: 38, color: '#FFFFFF', a: fadeIn(t, P.ink + 0.2, 0.4)});
    if (a < 1) { withAlpha(c, 1 - a, () => { background(stage); fireShot(stage, t, P, sc); }); }
    return;
  }
  // mirror: nuclear (left, rising) | ink (right, sinking)
  const q = smooth((t - P.mirror + 0.3) / 0.8);
  const A = offStage(ctx, 'L'), B = offStage(ctx, 'R');
  if (A._key !== 'mirror') { nuclearHalf(A, P, 4.0 * SC); A._key = 'mirror'; }
  background(B); inkShot(B, t, P.ink - 0.25, {end: P.mirror + 6}, {ppc: 6.4});
  if (q < 1) inkShot(stage, t, P.ink - 0.25, {end: P.mirror + 6});
  half(stage, A, -1, q); half(stage, B, 1, q); seam(stage, q);
  tag(stage, '가벼우면 위로', 270, 430, {a: fadeIn(t, P.mirror, 0.4), size: 40, color: '#FFD9A8'});
  tag(stage, '무거우면 아래로', 810, 430, {a: fadeIn(t, W_(ctx.tl, 's17', '무거운'), 0.4), size: 40, color: '#E0D0FF'});
  arrowUp(stage, 470, 1250, 1050, 5, 'rgba(255,214,150,0.9)', fadeIn(t, P.mirror + 0.2, 0.4));
  withAlpha(c, fadeIn(t, W_(ctx.tl, 's17', '무거운'), 0.4), () => { const x = 1000; line(c, [[x, 1050], [x, 1232]], 'rgba(224,208,255,0.9)', 5, {cap: 'butt'}); poly(c, [[x - 12, 1228], [x + 12, 1228], [x, 1256]], 'rgba(224,208,255,0.9)'); });
}

// ------------------------------------------------------------------ myth: the shock spreads every way; the mushroom comes later
function myth(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const hy = HY, X0 = 540;
  const tAfter = P.after - 0.4;
  const step = t < tAfter ? 0 : lerp(0, 200, clamp((t - tAfter) / (sc.end - tAfter)) ** 0.9);
  sim('main').goto(step);
  const ppc = 4.2 * SC;
  const [sx, sy] = shake(t, P.shock, 5);
  c.save(); c.translate(sx, sy);
  atmo(stage, {gy: hy, ppc, axis: 0.7});
  if (t >= P.shock) {
    // the hemispherical shock front (slow motion), drawn ahead of the fireball
    const u = t - P.shock, R = 1300 * (1 - Math.exp(-u / 2.6)) + 30 * u;
    if (R < 1500) {
      shockRing(stage, X0, hy, R, clamp(1.5 - R / 1200), {w: 3});
      shockRing(stage, X0, hy, R * 0.82, 0.35 * clamp(1.5 - R / 1200), {w: 1.5});
      // ground-hugging dust swept outward with the front
      DB.begin();
      for (let q = 0; q < 220; q++) { const sd = q & 1 ? 1 : -1, d = R * (0.84 + 0.16 * rand(q * 1.7)), x = X0 + sd * d, y = hy + 3 + rand(q * 3.1) * 30 * (d / 900) - rand(q * 9) * 22;
        DB.dot(x, y, C3.dust, 0.7 * clamp(1 - u / 6), 1.4 + rand(q) * 1.4); }
      DB.flush(stage, {gain: 1.2, halo: 0.3});
      const aa = fadeIn(t, P.allway, 0.4) * fadeOut(t, tAfter + 0.6, 0.5);
      if (aa > 0) for (let k = 0; k < 9; k++) { const an = Math.PI + (k / 8) * Math.PI, r0 = Math.min(R, 900) * 0.55, r1 = Math.min(R, 900) * 0.8;
        withAlpha(c, aa, () => { const x0 = X0 + r0 * Math.cos(an), y0 = hy + r0 * Math.sin(an), x1 = X0 + r1 * Math.cos(an), y1 = hy + r1 * Math.sin(an);
          line(c, [[x0, y0], [x1, y1]], 'rgba(255,246,230,0.95)', 3.5, {cap: 'butt'}); poly(c, [[x1 + 18 * Math.cos(an), y1 + 18 * Math.sin(an)], [x1 + 13 * Math.cos(an + 2.4), y1 + 13 * Math.sin(an + 2.4)], [x1 + 13 * Math.cos(an - 2.4), y1 + 13 * Math.sin(an - 2.4)]], 'rgba(255,246,230,0.95)'); }); }
      if (aa > 0) tag(stage, '충격파 · 사방으로', 540, 420, {a: aa, size: 38, color: '#FFF0DC'});
    }
    // the fireball rises only afterwards
    const hot = Math.exp(-u / 3), al = fadeIn(t, P.shock, 0.15);
    flashAt(stage, X0, hy - centroidRow('main') * ppc, 0.4 * hot * al, 90 + 120 * (1 - hot));
    dotCloud(stage, 'main', {cx: X0, gy: hy, ppc, alpha: al, I: 0.85 + 0.3 * hot});
    const ma = fadeIn(t, tAfter + 0.6, 0.5);
    if (ma > 0) tag(stage, '버섯 모양 · 그 뒤에 떠오름', 540, 420, {a: ma, size: 38, color: '#FFD9A8'});
    if (t < P.allway + 0.2) tag(stage, '느린 화면', 540, 420, {a: fadeIn(t, P.shock + 0.3, 0.3) * fadeOut(t, P.allway - 0.2, 0.3), size: 34, color: '#E8DCCB'});
  }
  c.restore();
  if (t >= P.shock) flashAt(stage, X0, hy - 40, Math.exp(-(t - P.shock) / 0.2) * 1.1, 1500);
}

// ------------------------------------------------------------------ close: the poster comes back
function close(stage, t, p, ctx) {
  const P = plan(ctx.tl);
  posterFrame(stage, P, 0.03 * (1 - smooth((t - ctx.scene.start) / 2.5)));
}
export const scenes = {hook, origin, essence, ring, stem, cap, cases, myth, close};

// =====================================================================================================
// Sound (sound.json is written from this model: node episodes/mushroom-cloud/scenes.mjs --emit-sound)
//  - Flash → the rumble arrives later: observer ≈ 16 km away (Trinity base camp ≈ 10 miles); 16 km / 343 m/s ≈ 47 s,
//    divided by the on-screen speed-up of the hook. Rumble level follows the cloud's mean rise speed (model).
//  - Vortex ring → a slow low pulse at the drawn circulation rate. Ink → a muffled low tone. Shock → a deep thud.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe). Synthetic explanatory sounds, not recordings.
// =====================================================================================================
export const OBS_KM = 16;
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += o.dt || 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.25, o.fo ?? 0.35)), 4)]); Q[Q.length - 1][2] = 0;
    ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: squeeze(Q)}, means}); };
  const envNoise = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.3, o.fo ?? 0.5)), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 30, high: o.high ?? 160, fade: 0.05, points: Q.filter((q, i) => i === 0 || i === Q.length - 1 || Math.abs(q[1] - Q[i - 1][1]) > 1e-4 || Math.abs(q[1] - Q[i + 1][1]) > 1e-4)}, means}); };
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.12, gain_db: gain, click: 0}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58, dur = 0.6) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur, harmonics: [1, 0.35], attack: 0.006, decay: dur * 0.33, release: dur * 0.33, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: dur * 0.5, low: 30, high: 200, release: dur * 0.35, gain_db: -9}}]}, means});
  const f = sim('main'), rise = tt => { f.goto(P.hookStep(tt)); return f.riseSpeed(); };

  // ---- hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 해 질 녘 사막의 버섯구름', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  thump('flash', P.flash, '섬광 — 폭발의 순간(빛은 바로 도착)', -31, 46, 0.9);
  const delay = OBS_KM * 1000 / 343 / P.speedup;
  envNoise('rumble', P.flash + delay, P.hookEnd - 0.1, tt => clamp(0.35 + 1.1 * rise(tt)), -31, `소리는 늦게 도착: 약 ${OBS_KM} km 떨어진 관측자에게 약 ${Math.round(OBS_KM * 1000 / 343)}초 뒤(화면 ${P.speedup.toFixed(0)}배 압축 → ${delay.toFixed(1)}초). 세기 = 구름의 평균 상승 속도(모형)`, {low: 26, high: 150, fi: 0.5, fo: 1.0});
  tick('mark10', P.reach10 - 1.0, 110, -34, '구름 꼭대기가 10 km 표시를 지남');
  tick('clock', P.s03 + 0.2, 131, -35, '"폭발 뒤 흐른 시간" 큰 숫자가 나타남');
  // ---- origin
  const o0 = tl.scene('origin').start;
  envNoise('volcano', o0 + 0.1, P.split - 0.2, tt => 0.6 + 0.25 * Math.sin(tt * 2.1) * Math.sin(tt * 0.7), -33, '분화구에서 쉬지 않고 뿜어 오르는 화산재 기둥(낮은 우르릉, 모식)', {low: 28, high: 130, fi: 0.6, fo: 0.4});
  tick('pine', P.pine + 0.1, 98, -34, '우산처럼 퍼진 소나무 실루엣');
  swell('split', P.split, [73, 98], '핵폭발과 화산이 나란히 — 같은 모양', {dur: 1.6, gain: -33});
  // ---- essence
  whoosh('balloon', P.balloon, 1.2, 140, 90, '열기구의 버너(낮은 바람 소리) — 뜨거운 공기가 떠오름', -36);
  swell('key', P.key, [82, 123], '"버섯구름은 폭발의 모양이 아니라 …" 핵심 명제', {dur: 1.8, gain: -33});
  // ---- ring
  tick('center', P.center, 147, -34, '가운데 빠른 상승 화살표(모형 속도)');
  tick('edge', P.edge, 98, -34, '가장자리 느린 화살표(모형 속도)');
  chirp('ring_pulse', P.donut, tl.scene('ring').end - 0.1, () => 82, tt => 0.5 + 0.5 * Math.sin((tt - P.donut) * 1.35 * 2), -34, '3D 소용돌이 고리의 회전 박자(화면 순환 속도 1.35 rad/s의 두 배 맥동)', {fi: 0.5, fo: 0.5});
  // ---- stem
  envNoise('afterwinds', tl.scene('stem').start + 0.2, tl.scene('stem').end - 0.1, tt => 0.45 + 0.4 * smooth((tt - P.wind) / 1.5), -34, '줄기 쪽으로 몰려 드는 바람(빨려 드는 흙먼지와 함께, 모식)', {low: 60, high: 300, fi: 0.6, fo: 0.6});
  tick('wind', P.wind, 110, -35, '"주변 바람이 몰려 듦" 화살표');
  // ---- cap
  tick('tropo', P.tropo, 123, -33, '대류권의 끝(약 10 km) 띠가 나타남');
  whoosh('spread', P.spread, 1.6, 120, 70, '갓이 옆으로 퍼짐', -35);
  swell('cond', P.cond, [196, 262], '수증기가 물방울로 → 하얀 갓(부드러운 화음)', {dur: 2.0, gain: -35});
  // ---- cases
  envNoise('fire', tl.scene('cases').start + 0.1, P.ink + 0.1, tt => 0.55 + 0.3 * Math.sin(tt * 9) * Math.sin(tt * 3.3), -33, '산불의 열기(낮은 대역 잡음, 깜빡이는 세기)', {low: 40, high: 300, fi: 0.4, fo: 0.4});
  chirp('ink', P.ink, P.mirror - 0.1, tt => 104 - 8 * smooth((tt - P.ink) / 4), () => 0.8, -33, '물속의 잉크 방울: 먹먹한 낮은 음이 천천히 내려감(가라앉음)', {fi: 0.4, fo: 0.4, h: [1, 0.2]});
  chirp('up', P.mirror + 0.2, P.mirror + 1.6, tt => lerp(98, 147, smooth((tt - P.mirror - 0.2) / 1.4)), () => 0.8, -34, '"가벼우면 위로": 올라가는 음');
  chirp('down', W_(tl, 's17', '무거운'), W_(tl, 's17', '무거운') + 1.4, tt => lerp(147, 98, smooth((tt - W_(tl, 's17', '무거운')) / 1.4)), () => 0.8, -34, '"무거우면 아래로": 내려가는 음');
  // ---- myth
  thump('shock', P.shock, '충격파(느린 화면): 깊고 둔한 쿵 — 사방으로 퍼짐', -29, 40, 1.4);
  tick('allway', P.allway, 98, -34, '"충격파 · 사방으로" 화살표');
  swell('after', P.after, [73, 110], '그 뒤 불덩이가 떠오르며 버섯 모양이 생김', {dur: 1.8, gain: -34});
  // ---- close
  swell('poster_back', P.poster, [73, 110, 147], '"버섯구름은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  return lowBandOnly(ev.sort((a, b) => a.at - b.at), modelSignature(tl));
}
export function modelSignature(tl) {
  const P = plan(tl);
  return `${P.flash.toFixed(2)}/${P.reach10.toFixed(3)}/${P.speedup.toFixed(3)}/${P.donut.toFixed(3)}/${P.shock.toFixed(3)}@${tl.duration.toFixed(3)}`;
}
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') { const fr = Math.max(...p.points.map(q => q[1])); if (fr >= HIGH_CUT) throw new Error(`${e.id}: chirp ${fr} Hz`); p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || fr * (k + 1) < HIGH_CUT); }
    else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/mushroom-cloud/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 섬광 → 낮은 쿵(빛은 바로), 우르릉 → 약 16 km 떨어진 관측자에게 늦게 도착(화면 압축 반영), 세기 = 모형 구름의 평균 상승 속도; 소용돌이 고리 → 회전 박자의 낮은 맥동; 잉크 → 먹먹하게 내려가는 낮은 음; 충격파 → 깊은 쿵. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  console.log(`events: ${sound.events.length}; flash ${plan(tl).flash.toFixed(2)} s, rumble delay ${(OBS_KM * 1000 / 343 / plan(tl).speedup).toFixed(2)} s, speed-up ×${plan(tl).speedup.toFixed(1)}`);
}

