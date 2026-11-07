// Episode scenes — "버섯구름은 왜 버섯 모양일까" (22)
// Shape: export {theme, scenes, overlays, background, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Hero = an axisymmetric (r–z) stable-fluids simulation (fluid.mjs, MAC grid): buoyancy B·(θ' − θ_amb(z)),
//    θ_amb rising slowly in the troposphere and steeply above the tropopause row JT (≈ 9.6 km) → the cap spreads there.
//    Vorticity confinement, small viscosity and diffusion; MacCormack scalar advection. The same solver drives the
//    volcano (continuous vent source), the wildfire (wide ground heat) and the ink drop (heavy blob, gravity reversed).
//  - Rendering: line-of-sight projection of the axisymmetric fields (Projector) → optical depth; light marched toward a
//    low sun on the right (self-shadowing), sky ambient from above, heat-weighted emission → incandescent ramp, bloom.
//    Fine "billow" detail is value-noise drifting with the cloud (texture only, not physics).
//  - Scale: 1 cell = 64 m (radius 128 cells = 8.2 km, height 256 rows = 16.4 km). Time: 1 step ≈ 0.6 s of real time
//    (the cloud reaches ~10 km in ~250 steps ≈ 2.5 min; screen shows it in ~13 s → "약 12배 빠르게").
//  - Shock wave (myth): an analytic hemispherical front, drawn ahead of the fireball; not part of the fluid model.
//  - Sound: node episodes/mushroom-cloud/scenes.mjs --emit-sound writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, glow, withAlpha, rect, poly, TAU, rand, rng, loadTimeline} from '../../pipeline/render/index.mjs';
import {Fluid, Projector} from './fluid.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
export const theme = {base: 'navy', accent: '#FFB070'};
export const captionLayout = {hook: {plate: true}, myth: {plate: true}};
export const events = [];

// =====================================================================================================
// Model
// =====================================================================================================
export const KM = 0.064;                 // km per cell
export const JT = 150;                   // tropopause row (≈ 9.6 km)
export const SEC_PER_STEP = 1.5;         // real seconds per simulation step (main cloud): top passes 10 km at ≈ step 165 ≈ 4 min
const NX = 128, NY = 256;
const bubbleInit = (f, {r0, cy, dth, smoke = 1, dust = 0.25, dustR = 90}) => {
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
    const k = i + j * f.nx, r = Math.hypot(i + 0.5, j + 0.5 - cy) / r0;
    if (r < 1.25) { const q = r < 0.75 ? 1 : 1 - (r - 0.75) / 0.5; f.th[k] += dth * q; f.s[k] = Math.max(f.s[k], smoke * q); }
    if (j < 2 && i < dustR) f.d[k] = dust;
  }
};
const CFG = {
  main: {axi: true, nx: NX, ny: NY, B: 0.002, eps: 0.05, visc: 0.1, kappa: 0.04, kappaD: 0.07, axisDamp: 0.25, g1: 0.02, g2: 0.6, jt: JT, ground: 0.95, tracers: 2400,
    init: f => bubbleInit(f, {r0: 25, cy: 20, dth: 16, dust: 0.45, dustR: 100}),
    sources(f) { for (let i = 0; i < f.nx; i++) f.d[i] = Math.min(1.6, f.d[i] + 0.09 * Math.abs(f.u[i])); },
    initTracers(f) {
      const R = rng(1945);
      for (let q = 0; q < f.nt; q++) {
        if (q < 1400) { f.tx[q] = R() * 48; f.ty[q] = R() * 46; f.tk[q] = 0; }       // around and inside the fireball
        else { f.tx[q] = 4 + R() * 104; f.ty[q] = 0.3 + R() * 2.2; f.tk[q] = 1; }   // ground layer (afterwinds, dust)
      }
    },
    respawn(f) {   // dust tracers that have risen high go back to the ground at a fresh radius (deterministic)
      for (let q = 1400; q < f.nt; q++) if (f.ty[q] > 120 || f.tx[q] > 120) { f.tx[q] = 20 + 90 * rand(q * 7.13 + f.stepNo * 0.917); f.ty[q] = 0.4 + 1.8 * rand(q * 3.7 + f.stepNo * 1.31); f.tage[q] = 0; }
    }},
  volc: {axi: true, nx: NX, ny: NY, B: 0.002, eps: 0.05, visc: 0.1, kappa: 0.04, g1: 0.02, g2: 0.6, jt: JT - 20, ground: 0.9,
    sources(f) {   // continuous vent: hot ash-laden gas pushed up through a narrow vent
      for (let j = 0; j < 4; j++) for (let i = 0; i < 15; i++) {
        const k = i + j * f.nx, q = 1 - (i / 15) ** 2; f.th[k] = Math.max(f.th[k], f.ambAt(j + 0.5) + 17 * q); f.s[k] = Math.max(f.s[k], q);
        f.v[i + (j + 1) * f.nx] = Math.max(f.v[i + (j + 1) * f.nx], 1.1 * q);
      }
    }},
  fire: {axi: true, nx: NX, ny: NY, B: 0.002, eps: 0.07, visc: 0.08, kappa: 0.035, g1: 0.02, g2: 0.6, jt: JT, ground: 0.95,
    sources(f) {   // wide burning ground: flickering heat and smoke along a ring of forest
      const st = f.stepNo;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 46; i++) { const fl = 0.65 + 0.35 * Math.sin(i * 0.9 + st * 0.11) * Math.sin(i * 0.37 - st * 0.07), q = (1 - (i / 46) ** 2) * fl, k = i + j * f.nx;
        f.th[k] = Math.max(f.th[k], f.ambAt(j + 0.5) + 14 * q); f.s[k] = Math.max(f.s[k], 0.8 * q); }
    }},
  ink: {axi: true, nx: NX, ny: NY, B: 0, W: 0.03, eps: 0.1, visc: 0.05, kappa: 0.005, g1: 0, g2: 0, ground: 1,
    init: f => { for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const k = i + j * f.nx, r = Math.hypot(i + 0.5, j + 0.5 - 228) / 17;
      if (r < 1.2) f.s[k] = r < 0.8 ? 1 : 1 - (r - 0.8) / 0.4; } }},
};
const SIMS = {};
export const sim = name => (SIMS[name] ||= new Fluid(CFG[name]));
const PJ = new Projector(NX, NY);
const PROJ = {};
/** projected fields of a sim at its current step (cached per sim + step) */
function projected(name) {
  const f = sim(name), c = (PROJ[name] ||= {step: -1, S: new Float32Array(2 * NX * NY), D: new Float32Array(2 * NX * NY), H: new Float32Array(2 * NX * NY), tmp: new Float32Array(NX * NY)});
  if (c.step === f.stepNo) return c;
  PJ.run(f.s, c.S); PJ.run(f.d, c.D);
  for (let j = 0; j < NY; j++) { const amb = f.ambAt(j + 0.5); for (let i = 0; i < NX; i++) { const k = i + j * NX; c.tmp[k] = f.s[k] * Math.max(0, f.th[k] - amb); } }
  PJ.run(c.tmp, c.H); c.step = f.stepNo;
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
  P.STEP10 = 165; P.HOOK_END_STEP = 300;
  P.hookStep = t => t < P.flash ? 0 : t < P.reach10 ? P.STEP10 * ((t - P.flash) / (P.reach10 - P.flash)) ** 0.9 : P.STEP10 + (P.HOOK_END_STEP - P.STEP10) * clamp((t - P.reach10) / (P.hookEnd - 0.3 - P.reach10));
  P.speedup = (P.HOOK_END_STEP * SEC_PER_STEP) / (P.hookEnd - 0.3 - P.flash);
  P.poster = W_(tl, 's20', '버섯구름은', -0.15);
  P.POSTER_STEP = 215;
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
/** incandescent ramp: q 0 → dark red, 1 → white-yellow */
function heatCol(q) {
  q = clamp(q);
  if (q < 0.35) { const a = q / 0.35; return [0.45 + 0.5 * a, 0.08 + 0.17 * a, 0.03 + 0.03 * a]; }
  if (q < 0.7) { const a = (q - 0.35) / 0.35; return [0.95 + 0.05 * a, 0.25 + 0.4 * a, 0.06 + 0.12 * a]; }
  const a = (q - 0.7) / 0.3; return [1, 0.65 + 0.3 * a, 0.18 + 0.62 * a];
}

// =====================================================================================================
// Volumetric cloud renderer
// =====================================================================================================
const UP = 3, RW = 2 * NX * UP, RH = NY * UP;
const CR = {tau: new Float32Array(RW * RH), dfr: new Float32Array(RW * RH), heat: new Float32Array(RW * RH),
  cv: createCanvas(RW, RH), em: createCanvas(RW, RH), bl: createCanvas(RW / 2, RH / 2)};
CR.cc = CR.cv.getContext('2d'); CR.ec = CR.em.getContext('2d'); CR.bc = CR.bl.getContext('2d');
CR.img = CR.cc.createImageData(RW, RH); CR.eimg = CR.ec.createImageData(RW, RH);
const STYLE0 = {kS: 0.22, kD: 0.26, albS: [0.86, 0.80, 0.74], albD: [0.66, 0.50, 0.37], amb: [0.36, 0.36, 0.55], sun: [1.75, 1.12, 0.74],
  L: [0.86, -0.5], lightK: 0.075, aoK: 0.06, warp: 1.6, emitRows: 1e9, glowAge: 60, emitFloor: 0, detail: 0.75, detailScale: 0.16, drift: 0, emit: 1, heatMax: 9, cond: null, flip: false, ink: false};
/** draw the sim `name` (at its current step) into the screen box: axis at x = cx, ground (row 0) at y = gy, ppc px per cell */
function drawCloud(stage, name, {cx, gy, ppc, alpha = 1, ...st} = {}) {
  const S = {...STYLE0, ...st}, P = projected(name), {tau, dfr, heat} = CR, W2 = 2 * NX;
  // bounding rows/cols with material
  let jmin = NY, jmax = -1, cmin = W2, cmax = -1;
  for (let j = 0; j < NY; j++) { const o = j * W2; for (let x = 0; x < W2; x++) if (P.S[o + x] + P.D[o + x] > 0.02) { if (j < jmin) jmin = j; if (j > jmax) jmax = j; if (x < cmin) cmin = x; if (x > cmax) cmax = x; } }
  if (jmax < 0) return;
  jmin = Math.max(0, jmin - 2); jmax = Math.min(NY - 1, jmax + 2); cmin = Math.max(0, cmin - 2); cmax = Math.min(W2 - 1, cmax + 2);
  const py0 = Math.max(0, (NY - 1 - jmax) * UP - 2), py1 = Math.min(RH, (NY - jmin) * UP + 2), px0 = Math.max(0, cmin * UP - 2), px1 = Math.min(RW, (cmax + 1) * UP + 2);
  const samp = (F, X, Y) => {   // projected grid sample at (column X, row Y) in cell units (centres at +0.5)
    let x = X - 0.5, y = Y - 0.5; x = x < 0 ? 0 : x > W2 - 1.001 ? W2 - 1.001 : x; y = y < 0 ? 0 : y > NY - 1.001 ? NY - 1.001 : y;
    const i = x | 0, j = y | 0, a = x - i, b = y - j, k = i + j * W2;
    return (F[k] * (1 - a) + F[k + 1] * a) * (1 - b) + (F[k + W2] * (1 - a) + F[k + W2 + 1] * a) * b;
  };
  tau.fill(0, py0 * RW, py1 * RW);
  const ds = S.detailScale, dr = S.drift, wp = S.warp;
  for (let py = py0; py < py1; py++) {
    const Y0 = (RH - 0.5 - py) / UP, o = py * RW;
    for (let px = px0; px < px1; px++) {
      const X0 = (px + 0.5) / UP;
      const s0 = samp(P.S, X0, Y0), d0 = samp(P.D, X0, Y0);
      if (S.kS * s0 + S.kD * d0 < 2e-3) { tau[o + px] = 0; continue; }
      // domain warp → billowy edges; fbm → cauliflower detail (texture only)
      const wx = (vnoise((X0 - NX) * 0.13 + 5.2, (Y0 - dr) * 0.13) - 0.5) * 2 * wp, wy = (vnoise((X0 - NX) * 0.13 - 7.7, (Y0 - dr) * 0.13 + 3.1) - 0.5) * 2 * wp;
      const X = X0 + wx, Y = Y0 + wy, s = samp(P.S, X, Y), d = samp(P.D, X, Y);
      let t = S.kS * s + S.kD * d;
      if (t < 1e-4) { tau[o + px] = 0; continue; }
      const n = fbm((X0 - NX) * ds + 31, (Y0 - dr) * ds);
      t *= Math.max(0, 1 - S.detail * 0.6 + S.detail * 1.2 * n);
      tau[o + px] = t; dfr[o + px] = d * S.kD / (S.kS * s + S.kD * d + 1e-6);
      heat[o + px] = s > 1e-3 ? samp(P.H, X, Y) / s : 0;
    }
  }
  const D = CR.img.data, E = CR.eimg.data, [lx, ly] = S.L, step = 3;
  D.fill(0); E.fill(0);
  let anyEm = false; const age = sim(name).stepNo, glowK = S.emit * (Math.exp(-age / S.glowAge) + S.emitFloor);
  for (let py = py0; py < py1; py++) {
    const o = py * RW;
    for (let px = px0; px < px1; px++) {
      const t = tau[o + px]; if (t <= 0) continue;
      const a = 1 - Math.exp(-1.6 * t * t / (0.35 + t));
      let sl = 0; for (let k = 1; k <= 8; k++) { const x = (px + lx * step * k) | 0, y = (py + ly * step * k) | 0; if (x < 0 || x >= RW || y < 0 || y >= RH) break; sl += tau[x + y * RW]; }
      let sa = 0; for (let k = 1; k <= 4; k++) { const y = py - 7 * k; if (y < 0) break; sa += tau[px + y * RW]; }
      const Tl = Math.exp(-S.lightK * sl), Ta = Math.exp(-S.aoK * sa);
      const df = dfr[o + px], Y = (RH - 0.5 - py) / UP;
      let ar = lerp(S.albS[0], S.albD[0], df), ag = lerp(S.albS[1], S.albD[1], df), ab = lerp(S.albS[2], S.albD[2], df);
      if (S.cond) { const c = S.cond(Y) * (1 - df); ar = lerp(ar, 1.12, c); ag = lerp(ag, 1.12, c); ab = lerp(ab, 1.2, c); }
      const amb = 0.3 + 0.7 * Ta;
      let r = ar * (S.amb[0] * amb + S.sun[0] * Tl), g = ag * (S.amb[1] * amb + S.sun[1] * Tl), b = ab * (S.amb[2] * amb + S.sun[2] * Tl);
      const q = (py * RW + px) * 4;
      D[q] = Math.min(255, r * 255 * a); D[q + 1] = Math.min(255, g * 255 * a); D[q + 2] = Math.min(255, b * 255 * a); D[q + 3] = a * 255;
      const h = heat[o + px];
      if (glowK > 0.01 && h > 0.25 && Y < S.emitRows) {
        const hq = clamp(h / S.heatMax), c = heatCol(hq * (0.55 + 0.45 * Math.exp(-age / S.glowAge))), I = glowK * a * hq ** 1.2 * 1.4 * (S.emitRows < 1e8 ? 1 - smooth(Y / S.emitRows) : 1);
        E[q] = Math.min(255, c[0] * I * 255); E[q + 1] = Math.min(255, c[1] * I * 255); E[q + 2] = Math.min(255, c[2] * I * 255); E[q + 3] = 255; anyEm = true;
      }
    }
  }
  CR.cc.putImageData(CR.img, 0, 0);
  const c = stage.ctx, w = W2 * ppc, h = NY * ppc, x0 = cx - NX * ppc, y0 = gy - h;
  c.save(); c.globalAlpha *= alpha; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  if (S.flip) { c.translate(0, 2 * gy - h); c.scale(1, -1); c.translate(0, -(gy - h)); }
  c.drawImage(CR.cv, x0, y0, w, h);
  if (anyEm) {
    CR.ec.putImageData(CR.eimg, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(CR.em, x0, y0, w, h);
    CR.bc.clearRect(0, 0, RW / 2, RH / 2); CR.bc.filter = 'blur(9px)'; CR.bc.drawImage(CR.em, 0, 0, RW / 2, RH / 2); CR.bc.filter = 'none';
    c.globalAlpha *= 0.9; c.drawImage(CR.bl, x0, y0, w, h);
    c.globalAlpha *= 0.6; c.filter = 'blur(28px)'; c.drawImage(CR.bl, x0, y0, w, h); c.filter = 'none';
  }
  c.restore();
}

// =====================================================================================================
// Sky, ground, stars
// =====================================================================================================
const STARS = (() => { const R = rng(716), s = []; for (let i = 0; i < 260; i++) s.push({x: R() * 1080, y: R(), r: 0.5 + 1.5 * R() ** 3, a: 0.2 + 0.6 * R() ** 2}); return s; })();
const RIDGE = (() => { const pts = []; for (let x = -40; x <= 1120; x += 12) pts.push([x, 0.5 * vnoise(x * 0.008, 3.1) + 0.35 * vnoise(x * 0.03, 9.7) + 0.15 * vnoise(x * 0.09, 1.3)]); return pts; })();
/** dusk desert: horizon at screen y = hy. o.glow = {x, I} fireball light on the ground/sky */
function duskSky(stage, hy, o = {}) {
  const {ctx: c, W, H} = stage;
  const g = c.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, '#060A20'); g.addColorStop(0.38, '#18205A'); g.addColorStop(0.64, '#46307A'); g.addColorStop(0.84, '#B85A68'); g.addColorStop(1, '#FFAA66');
  c.fillStyle = g; c.fillRect(0, 0, W, hy + 2);
  for (const s of STARS) { const y = s.y * hy * 0.75; const a = s.a * (1 - y / (hy * 0.8)); if (a > 0.03) { c.globalAlpha = a * (o.stars ?? 1); circle(c, s.x, y, s.r, '#E8EEFF'); } }
  c.globalAlpha = 1;
  // sun glow just below the horizon (right)
  glow(c, 900, hy + 20, 520, '#FF9A50', 0.32 * (o.sun ?? 1));
  // distant ridge
  const ridge = RIDGE.map(([x, n]) => [x, hy - 6 - 34 * n]);
  poly(c, [[-40, hy + 2], ...ridge, [1120, hy + 2]], '#241B38');
  // ground
  const gg = c.createLinearGradient(0, hy, 0, H);
  gg.addColorStop(0, '#5A3A3A'); gg.addColorStop(0.08, '#2C1D24'); gg.addColorStop(0.5, '#140F16'); gg.addColorStop(1, '#09070C');
  c.fillStyle = gg; c.fillRect(0, hy, W, H - hy);
  // faint ground streaks (perspective)
  c.globalAlpha = 0.18;
  for (let k = 0; k < 14; k++) { const y = hy + 8 + (H - hy) * (k / 14) ** 2.2; line(c, [[0, y], [W, y + 2]], k % 2 ? '#3A2A30' : '#2A1E26', 1 + k * 0.25); }
  c.globalAlpha = 1;
  if (o.glow && o.glow.I > 0) {
    glow(c, o.glow.x, hy, 700, '#FFB060', 0.5 * o.glow.I);
    glow(c, o.glow.x, hy + 40, 420, '#FFD8A0', 0.35 * o.glow.I);
  }
}
/** whole-frame flash */
function flash(stage, I) { if (I <= 0) return; const c = stage.ctx; c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,236,210,${clamp(I)})`; c.fillRect(0, 0, 1080, 1920); c.restore(); }

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
export function background(stage) { const c = stage.ctx; c.fillStyle = '#05081A'; c.fillRect(0, 0, 1080, 1920); }

// =====================================================================================================
// Scenes
// =====================================================================================================
const HY = 1500;   // default horizon
const POSTER_PPC = 6.4;
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
let POSTER_FIT = null;
function posterFrame(stage, P, push = 0) {
  const f = sim('main');
  if (!POSTER_FIT) { f.goto(P.POSTER_STEP); POSTER_FIT = fitPpc('main', HY, {yTop: 330, wFrac: 0.9, max: 9}); }
  f.goto(P.POSTER_STEP);
  duskSky(stage, HY, {glow: {x: 540, I: 0.16}});
  drawCloud(stage, 'main', {cx: 540, gy: HY + 6, ppc: POSTER_FIT * (1 + push), emit: 0, drift: P.POSTER_STEP * 0.35});
}

// ------------------------------------------------------------------ hook: poster → flash → the first test cloud grows
function hook(stage, t, p, ctx) {
  const P = plan(ctx.tl), c = stage.ctx;
  if (t < P.flash) { posterFrame(stage, P); return; }
  const step = P.hookStep(t);
  sim('main').goto(step);
  const g = smooth((t - P.flash) / (P.hookEnd - P.flash));
  const hy = lerp(1610, HY, easeInOut(g));
  const ppc = Math.min(12, smoothCam('hook', t, fitPpc('main', hy, {yTop: 430, max: 12})));
  const [sx, sy] = shake(t, P.flash, 7);
  c.save(); c.translate(sx, sy);
  const hot = Math.exp(-(t - P.flash) / 2.2);
  duskSky(stage, hy, {glow: {x: 540, I: hot * 1.2 + 0.12}});
  drawCloud(stage, 'main', {cx: 540, gy: hy + 6, ppc, emit: 1, drift: step * 0.35});
  c.restore();
  flash(stage, Math.exp(-(t - P.flash) / 0.16) * 1.1);
  const a = fadeIn(t, P.reach10 - 1.4, 0.5) * fadeOut(t, P.s03 + 1.4, 0.5), y = hy + 6 - (10 / KM) * ppc;
  if (a > 0 && y > 330) withAlpha(c, a, () => { c.setLineDash([16, 12]); line(c, [[60, y], [1020, y]], 'rgba(255,214,170,0.8)', 3); c.setLineDash([]); tag(stage, '10 km', 880, y - 36, {size: 38, color: '#FFD9A8'}); });
  const b = fadeIn(t, P.s03 - 0.2, 0.5) * fadeOut(t, P.hookEnd - 0.45, 0.35);
  if (b > 0) bigNum(stage, `+${(step * SEC_PER_STEP / 60).toFixed(1)}분`, 540, 470, {a: b, size: 110, sub: `폭발 뒤 흐른 시간 · 약 ${Math.round(P.speedup)}배 빠르게`});
}

// ------------------------------------------------------------------ origin: Vesuvius (79) → nuclear and volcano side by side
function daySky(stage, hy) {
  const {ctx: c, W, H} = stage;
  const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#1A2E58'); g.addColorStop(0.5, '#4E6A9C'); g.addColorStop(0.85, '#B9A58E'); g.addColorStop(1, '#E7C49A');
  c.fillStyle = g; c.fillRect(0, 0, W, hy + 2);
  glow(c, 160, 360, 420, '#FFF2D6', 0.35);
  const gg = c.createLinearGradient(0, hy, 0, H); gg.addColorStop(0, '#3A3F4A'); gg.addColorStop(0.3, '#1E2430'); gg.addColorStop(1, '#0B0E14');
  c.fillStyle = gg; c.fillRect(0, hy, W, H - hy);
  // sea strip with glints
  const sg = c.createLinearGradient(0, hy, 0, hy + 120); sg.addColorStop(0, '#5A7AA0'); sg.addColorStop(1, '#1D3350');
  c.fillStyle = sg; c.fillRect(0, hy, W, 120);
  c.globalAlpha = 0.35; for (let k = 0; k < 40; k++) { const x = (k * 97) % 1080, y = hy + 8 + (k * 37) % 100; line(c, [[x, y], [x + 30 + (k % 5) * 8, y]], '#DDE8F6', 1.5); } c.globalAlpha = 1;
}
const VESU = {base: 1680, vent: 1150, cx: 540};
function vesuvius(stage) {
  const c = stage.ctx, {base, vent, cx} = VESU;
  const pts = [[-40, base], [60, base - 120], [190, base - 260], [300, vent + 150], [370, vent + 60], [430, vent + 92], [cx - 46, vent + 4], [cx + 46, vent + 2], [cx + 140, vent + 70], [cx + 300, base - 250], [cx + 470, base - 110], [1120, base]];
  const g = c.createLinearGradient(0, vent, 0, base); g.addColorStop(0, '#4A3A36'); g.addColorStop(1, '#151417');
  poly(c, pts, g);
  const h = c.createLinearGradient(80, 0, 1000, 0); h.addColorStop(0, 'rgba(210,160,120,0.30)'); h.addColorStop(0.5, 'rgba(210,160,120,0.06)'); h.addColorStop(1, 'rgba(0,0,0,0.25)');
  poly(c, pts, h);
  c.fillStyle = '#0B0B0E'; c.fillRect(0, base, 1080, 1920 - base);
}
/** umbrella pine silhouette: trunk from (x, y) up h, flat crown width w */
function pine(stage, x, y, h, w, col = '#0E1410', a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(x - 10, y); c.quadraticCurveTo(x - 6, y - h * 0.5, x - 16, y - h * 0.86); c.lineTo(x + 12, y - h * 0.86); c.quadraticCurveTo(x + 6, y - h * 0.5, x + 12, y); c.closePath(); c.fill();
    for (let k = 0; k < 70; k++) { const u = rand(k * 1.9), v = rand(k * 3.7), px = x + (u - 0.5) * w, py = y - h * (0.84 + 0.13 * Math.sin(u * Math.PI)) - (v - 0.3) * h * 0.09 * Math.sin(u * Math.PI);
      c.beginPath(); c.ellipse(px, py, w * (0.05 + 0.04 * rand(k * 5.3)), h * (0.03 + 0.025 * rand(k * 7.7)), 0, 0, TAU); c.fill(); }
    for (let k = 0; k < 4; k++) line(c, [[x, y - h * 0.84], [x + (k - 1.5) * w * 0.22, y - h * 0.92]], col, 7);
  });
}
const VOLC_STYLE = {kS: 0.3, kD: 0.2, albS: [0.46, 0.43, 0.41], amb: [0.42, 0.46, 0.58], sun: [1.45, 1.3, 1.1], L: [-0.8, -0.6], glowAge: 1e9, emitFloor: 0, heatMax: 30, emitRows: 30};
function volcanoShot(stage, t, P, o = {}) {
  const steps = lerp(150, 430, clamp((t - P.tl.scene('origin').start) / (P.split + 7 - P.tl.scene('origin').start)));
  sim('volc').goto(steps);
  const c = stage.ctx;
  daySky(stage, VESU.base - 40);
  const ppc = o.ppc || smoothCam('volc', t, fitPpc('volc', VESU.vent, {yTop: 330, wFrac: 0.95, max: 6.5}));
  drawCloud(stage, 'volc', {cx: 540, gy: VESU.vent + 8, ppc, ...VOLC_STYLE, drift: steps * 0.4});
  vesuvius(stage);
  glow(c, 540, VESU.vent + 10, 120, '#FF6A2A', 0.5);
}
/** offscreen full frames for split screens: render a whole shot, then copy its centre strip into one half */
const OFF = {};
function offStage(ctx, key) { return (OFF[key] ||= ctx.kit.createStage({theme: ctx.theme})); }
function half(stage, off, side, a = 1) {
  const c = stage.ctx; withAlpha(c, a, () => c.drawImage(off.canvas, 270, 0, 540, 1920, side < 0 ? 0 : 540, 0, 540, 1920));
}
function seam(stage, a) {
  const c = stage.ctx; withAlpha(c, a, () => { const g = c.createLinearGradient(522, 0, 558, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(522, 0, 36, 1920); });
}
function origin(stage, t, p, ctx) {
  const P = plan(ctx.tl), c = stage.ctx;
  if (t < P.split - 0.3) {
    volcanoShot(stage, t, P);
    const a = fadeIn(t, P.pine, 0.6);
    if (a > 0) {
      pine(stage, 860, 1690, 560 * easeOut(a) + 1, 380, '#0A0F0C', a);
      // the same outline laid over the eruption column for a moment
      const b = fadeIn(t, P.pine + 0.5, 0.5) * fadeOut(t, P.pine + 3.2, 0.6), f = sim('volc'), ppc = fitPpc('volc', VESU.vent, {yTop: 330, wFrac: 0.95, max: 6.5});
      if (b > 0) withAlpha(c, b, () => {
        const top = VESU.vent - f.topRow(0.03) * ppc, w = f.spread(0.03, f.topRow(0.03) - 40) * ppc;
        c.setLineDash([12, 10]); c.strokeStyle = 'rgba(255,240,210,0.9)'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(510, VESU.vent); c.lineTo(510, top + 90); c.moveTo(570, VESU.vent); c.lineTo(570, top + 90); c.stroke();
        c.beginPath(); c.ellipse(540, top + 60, Math.max(80, w), 70, 0, Math.PI, TAU); c.stroke(); c.setLineDash([]);
      });
      tag(stage, '우산처럼 퍼진 소나무', 820, 1010, {a, size: 36});
    }
    return;
  }
  // split: nuclear (left) | volcano (right) — each shot rendered full-frame offscreen, centre strips side by side
  const q = smooth((t - P.split + 0.3) / 0.8);
  const A = offStage(ctx, 'L'), B = offStage(ctx, 'R');
  if (A._key !== 'split') { background(A); sim('main').goto(230); duskSky(A, HY, {glow: {x: 540, I: 0.15}}); drawCloud(A, 'main', {cx: 540, gy: HY + 6, ppc: 3.9, emit: 0, drift: 80}); A._key = 'split'; }
  background(B); volcanoShot(B, t, P, {ppc: 3.6});
  if (q < 1) { volcanoShot(stage, t, P); }
  half(stage, A, -1, q); half(stage, B, 1, q); seam(stage, q);
  tag(stage, '핵폭발', 270, 430, {a: q, size: 40});
  tag(stage, '화산', 810, 430, {a: q, size: 40});
  const h = fadeIn(t, W_(ctx.tl, 's05', '뜨거운', -0.1), 0.5);
  if (h > 0) tag(stage, '뜨거운 공기 덩어리', 540, 1300, {a: h, size: 42, color: '#FFC890'});
}

// ------------------------------------------------------------------ essence: hot air is lighter, rises like a balloon
const MOL = (() => { const R = rng(31), o = []; for (let i = 0; i < 520; i++) o.push({x: R(), y: R(), ph: R() * TAU, sp: 0.6 + R()}); return o; })();
function balloon(stage, x, y, s, a) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(x - 20 * s, y - 40 * s, 10 * s, x, y - 20 * s, 150 * s); g.addColorStop(0, '#FFD8A0'); g.addColorStop(0.5, '#E07A3A'); g.addColorStop(1, '#5A2A20');
    c.fillStyle = g; c.beginPath(); c.moveTo(x, y + 60 * s); c.bezierCurveTo(x - 150 * s, y - 20 * s, x - 120 * s, y - 230 * s, x, y - 230 * s); c.bezierCurveTo(x + 120 * s, y - 230 * s, x + 150 * s, y - 20 * s, x, y + 60 * s); c.fill();
    c.strokeStyle = 'rgba(40,16,10,0.5)'; c.lineWidth = 2; for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(x, y + 60 * s); c.quadraticCurveTo(x + k * 190 * s, y - 120 * s, x, y - 230 * s); c.stroke(); }
    rect(c, x - 18 * s, y + 78 * s, 36 * s, 26 * s, 3, '#3A2418');
    line(c, [[x - 16 * s, y + 78 * s], [x - 10 * s, y + 58 * s]], '#3A2418', 2); line(c, [[x + 16 * s, y + 78 * s], [x + 10 * s, y + 58 * s]], '#3A2418', 2);
    glow(c, x, y + 66 * s, 40 * s, '#FFB050', 0.8);
  });
}
function essence(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const step = lerp(2, 125, easeInOut(clamp((t - sc.start) / (sc.end - sc.start))) ** 0.9);
  sim('main').goto(step);
  const ppc = 12.5 - 3.5 * smooth((t - P.key) / 4), cr = centroidRow('main');
  const yc = 980, gy = yc + cr * ppc;
  duskSky(stage, Math.min(2400, gy), {glow: {x: 540, I: 0.25}});
  drawCloud(stage, 'main', {cx: 540, gy: gy + 6, ppc, emit: 0.85, glowAge: 220, drift: step * 0.35});
  // molecules: hot inside (sparse, fast), cold outside (dense, slow)
  const m = fadeIn(t, sc.start + 0.3, 0.6) * fadeOut(t, P.key + 0.6, 0.6);
  if (m > 0) {
    const R = (sim('main').spread(0.15) + 2) * ppc, cyB = gy - cr * ppc;
    withAlpha(c, m, () => {
      for (const [k, o] of MOL.entries()) {
        const jx = Math.sin(t * 3.1 * o.sp + o.ph), jy = Math.cos(t * 2.7 * o.sp + o.ph * 1.3);
        const x = 40 + o.x * 1000, y = 330 + o.y * 1150, d = Math.hypot(x - 540, y - cyB);
        if (d < R * 0.95) { if (k % 4) continue; circle(c, x + jx * 16, y + jy * 16, 5, 'rgba(255,214,150,0.95)'); }
        else if (d > R * 1.12) circle(c, x + jx * 3, y + jy * 3, 4, 'rgba(170,205,255,0.75)');
      }
    });
    tag(stage, '찬 공기 · 촘촘', 230, 420, {a: m, size: 36, color: '#BFD6FF'});
    tag(stage, '뜨거운 공기 · 듬성', 540, Math.min(1330, cyB + R + 70), {a: m, size: 38, color: '#FFE0B0'});
  }
  const b = fadeIn(t, P.balloon, 0.5) * fadeOut(t, P.key + 1.5, 0.6);
  if (b > 0) balloon(stage, 190, lerp(1500, 760, smooth((t - P.balloon) / 5)), 0.8, b);
}

// ------------------------------------------------------------------ ring: cross-section with tracers → 3D vortex ring
const SL = {cv: createCanvas(2 * NX, NY)}; SL.c = SL.cv.getContext('2d'); SL.img = SL.c.createImageData(2 * NX, NY);
function drawSlice(stage, name, {cx, gy, ppc, a = 1}) {
  const f = sim(name), D = SL.img.data; D.fill(0);
  for (let j = 0; j < NY; j++) { const amb = f.ambAt(j + 0.5); for (let i = 0; i < NX; i++) {
    const k = i + j * NX, s = f.s[k], h = Math.max(0, f.th[k] - amb) / 9, al = 1 - Math.exp(-s * 2.2);
    if (al < 0.01) continue;
    const hc = heatCol(clamp(h)), r = lerp(0.55, hc[0], clamp(h * 1.4)), g = lerp(0.62, hc[1], clamp(h * 1.4)), b = lerp(0.85, hc[2], clamp(h * 1.4));
    for (const x of [NX + i, NX - 1 - i]) { const q = (x + (NY - 1 - j) * 2 * NX) * 4; D[q] = r * 255 * al; D[q + 1] = g * 255 * al; D[q + 2] = b * 255 * al; D[q + 3] = al * 255; }
  } }
  SL.c.putImageData(SL.img, 0, 0);
  const c = stage.ctx; c.save(); c.globalAlpha *= a; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(SL.cv, cx - NX * ppc, gy - NY * ppc, 2 * NX * ppc, NY * ppc);
  c.globalCompositeOperation = 'lighter'; c.filter = 'blur(14px)'; c.globalAlpha *= 0.5; c.drawImage(SL.cv, cx - NX * ppc, gy - NY * ppc, 2 * NX * ppc, NY * ppc); c.filter = 'none';
  c.restore();
}
function drawTracers(stage, name, {cx, gy, ppc, a = 1, kind = 0, len = 7, col = null, depth = 0}) {
  const f = sim(name), c = stage.ctx;
  c.save(); c.globalAlpha *= a; c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let q = 0; q < f.nt; q++) {
    if (f.tk[q] !== kind) continue;
    const r = f.tx[q], y = f.ty[q], u = f.sampleU(r, y), v = f.sampleV(r, y), sp = Math.hypot(u, v);
    const side = (q & 1) ? 1 : -1, phi = rand(q * 1.37) * TAU;
    let X = depth ? r * Math.cos(phi) : side * r, Z = depth ? r * Math.sin(phi) : 0, UX = depth ? u * Math.cos(phi) : side * u;
    const x = cx + X * ppc, yy = gy - y * ppc + Z * ppc * depth, sc = depth ? 1 + Z / 260 : 1;
    if (x < -20 || x > 1100 || yy < -20 || yy > 1940) continue;
    const h = clamp((f.sampleC(f.th, r, y) - f.ambAt(y)) / 6);
    c.strokeStyle = col || `rgba(${Math.round(lerp(150, 255, h))},${Math.round(lerp(200, 190, h))},${Math.round(lerp(255, 120, h))},${clamp(0.25 + sp * 0.9)})`;
    c.lineWidth = 2.6 * sc;
    c.beginPath(); c.moveTo(x - UX * ppc * len, yy + v * ppc * len); c.lineTo(x, yy); c.stroke();
  }
  c.restore();
}
function arrowUp(stage, x, y0, y1, w, col, a = 1) {
  const c = stage.ctx; if (Math.abs(y1 - y0) < 8) return;
  withAlpha(c, a, () => { line(c, [[x, y0], [x, y1 + 18]], col, w, {cap: 'butt'}); poly(c, [[x - w * 1.6, y1 + 22], [x + w * 1.6, y1 + 22], [x, y1 - 6]], col); });
}
const TOR = (() => { const R = rng(9), o = []; for (let i = 0; i < 5200; i++) o.push({phi: R() * TAU, psi: R() * TAU, rr: 0.55 + 0.45 * Math.sqrt(R()), w: 0.8 + 0.4 * R(), c: R()}); return o; })();
const SPR = (() => { const cv = createCanvas(64, 64), c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); return cv; })();
const SPRC = {};
function tintSprite(col) { if (SPRC[col]) return SPRC[col]; const cv = createCanvas(64, 64), c = cv.getContext('2d'); c.drawImage(SPR, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, 64, 64); return (SPRC[col] = cv); }
function torusShot(stage, t, t0, a) {
  const c = stage.ctx, u = t - t0, yaw = 0.5 + u * 0.32, pitch = 0.66 - 0.12 * smooth(u / 5), Rr = 330, rt = 100, rise = u * 22;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch), F = 1500, Dz = 1700, cx = 540, cy = 860;
  // backdrop: dusk gradient + vignette
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(540, 860, 50, 540, 860, 1000); g.addColorStop(0, '#2A1E3E'); g.addColorStop(1, '#05060F'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    c.save(); c.globalCompositeOperation = 'lighter';
    const spH = tintSprite('#FFB070'), spC = tintSprite('#9FB8FF'), spW = tintSprite('#FFE6C8');
    for (const p of TOR) {
      const psi = p.psi - u * 1.35 * p.w, rho = Rr + rt * p.rr * Math.cos(psi), yy = rt * p.rr * Math.sin(psi) + rise;
      const X = rho * Math.cos(p.phi), Z = rho * Math.sin(p.phi), Y = yy;
      const x1 = X * cosY + Z * sinY, z1 = -X * sinY + Z * cosY, y2 = Y * cosP - z1 * sinP, z2 = Y * sinP + z1 * cosP;
      const k = F / (Dz + z2), sx = cx + x1 * k, sy = cy - y2 * k;
      if (sx < -40 || sx > 1120 || sy < -40 || sy > 1960) continue;
      const near = clamp((Dz - z2 - 1300) / 800), sz = (4 + 6 * p.rr) * k * 0.9;
      c.globalAlpha = (0.12 + 0.2 * near) * (0.6 + 0.4 * p.rr);
      c.drawImage(p.c < 0.5 ? spH : p.c < 0.8 ? spW : spC, sx - sz, sy - sz, 2 * sz, 2 * sz);
    }
    c.restore();
    // circulation arrows on the near side of the tube
    const ar = clamp((u - 0.8) / 0.6);
    if (ar > 0) withAlpha(c, ar, () => {
      for (const side of [-1, 1]) {
        const pts = []; for (let k = 0; k <= 22; k++) { const ps = (side > 0 ? 0.3 : Math.PI - 0.3) + side * (k / 22) * 4.6 - u * 1.35;
          const rho = Rr + rt * 1.05 * Math.cos(ps), Y = rt * 1.05 * Math.sin(ps) + rise, X = side * rho, Z = 0;
          const x1 = X * cosY + Z * sinY, z1 = -X * sinY + Z * cosY, y2 = Y * cosP - z1 * sinP, z2 = Y * sinP + z1 * cosP, kk = F / (Dz + z2); pts.push([cx + x1 * kk, cy - y2 * kk]); }
        line(c, pts, 'rgba(255,236,210,0.85)', 5); const [p1, p0] = [pts[pts.length - 1], pts[pts.length - 3]], ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        poly(c, [[p1[0] + 16 * Math.cos(ang), p1[1] + 16 * Math.sin(ang)], [p1[0] + 12 * Math.cos(ang + 2.4), p1[1] + 12 * Math.sin(ang + 2.4)], [p1[0] + 12 * Math.cos(ang - 2.4), p1[1] + 12 * Math.sin(ang - 2.4)]], 'rgba(255,236,210,0.9)');
      }
    });
  });
}
function ring(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const tTor = P.donut;
  if (t < tTor + 0.5) {
    const step = lerp(30, 175, clamp((t - sc.start) / (tTor - sc.start)) ** 0.95);
    sim('main').goto(step);
    const ppc = 8.6, cr = centroidRow('main'), gy = 980 + cr * ppc;
    const g = c.createRadialGradient(540, 900, 100, 540, 900, 1200); g.addColorStop(0, '#16153A'); g.addColorStop(1, '#04050E'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
    // faint section grid (this is a cut through the middle)
    c.globalAlpha = 0.12; for (let x = 0; x <= 1080; x += 60) line(c, [[x, 0], [x, 1920]], '#8FA6FF', 1); for (let y = 0; y <= 1920; y += 60) line(c, [[0, y], [1080, y]], '#8FA6FF', 1); c.globalAlpha = 1;
    drawSlice(stage, 'main', {cx: 540, gy, ppc});
    drawTracers(stage, 'main', {cx: 540, gy, ppc, kind: 0, len: 9});
    tag(stage, '단면 · 가운데를 자른 모습', 540, 410, {size: 34, color: '#C8D4FF'});
    // centre vs edge speed arrows, measured from the model
    const f = sim('main'), yb = cr, vC = f.sampleV(1, yb), R = f.spread(0.15), vE = f.sampleV(R * 0.92, yb);
    const ac = fadeIn(t, P.center, 0.4) * fadeOut(t, P.roll, 0.4), ae = fadeIn(t, P.edge, 0.4) * fadeOut(t, P.roll, 0.4);
    const ys = gy - yb * ppc + 60;
    if (ac > 0) arrowUp(stage, 540, ys, ys - vC * 260, 12, 'rgba(255,214,150,0.95)', ac);
    if (ae > 0) for (const sd of [-1, 1]) arrowUp(stage, 540 + sd * R * 0.92 * ppc, ys, ys - Math.max(0.05, vE) * 260, 9, 'rgba(170,205,255,0.95)', ae);
    if (ac > 0) tag(stage, '빠르게', 540, ys - vC * 260 - 60, {a: ac, size: 34, color: '#FFE0B0'});
    if (ae > 0) tag(stage, '느리게', 540 + R * 0.92 * ppc, ys + 54, {a: ae, size: 34, color: '#CFE0FF'});
    // roll-up arrows around the vortex cores
    const ar = fadeIn(t, P.roll, 0.4) * fadeOut(t, tTor + 0.2, 0.3);
    if (ar > 0) {
      let best = 0, bi = 0, bj = 0; for (let j = 2; j < NY - 2; j++) for (let i = 2; i < NX - 2; i++) { const w = Math.abs(f.w[i + j * NX]) * f.s[i + j * NX]; if (w > best) { best = w; bi = i; bj = j; } }
      for (const sd of [-1, 1]) {
        const x0 = 540 + sd * (bi + 0.5) * ppc, y0 = gy - (bj + 0.5) * ppc, rr = 70, ph = -t * 2.2 * sd;
        const pts = []; for (let k = 0; k <= 26; k++) { const an = ph + sd * (k / 26) * 4.8; pts.push([x0 + rr * Math.cos(an), y0 + rr * Math.sin(an)]); }
        withAlpha(c, ar, () => { line(c, pts, 'rgba(255,240,220,0.9)', 6); const p1 = pts[26], p0 = pts[24], an = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
          poly(c, [[p1[0] + 18 * Math.cos(an), p1[1] + 18 * Math.sin(an)], [p1[0] + 13 * Math.cos(an + 2.4), p1[1] + 13 * Math.sin(an + 2.4)], [p1[0] + 13 * Math.cos(an - 2.4), p1[1] + 13 * Math.sin(an - 2.4)]], 'rgba(255,240,220,0.95)'); });
      }
      tag(stage, '말려 내려감', 540, 1290, {a: ar, size: 38, color: '#FFE6C8'});
    }
  }
  if (t >= tTor - 0.1) {
    const a = smooth((t - tTor + 0.1) / 0.7);
    torusShot(stage, t, tTor - 0.1, a);
    tag(stage, '도넛 모양 소용돌이 고리', 540, 410, {a: a * fadeIn(t, tTor + 0.5, 0.5), size: 38, color: '#FFE0B0'});
  }
}

// ------------------------------------------------------------------ stem: dust sucked up the middle; winds rush in
function stem(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const step = lerp(150, 330, clamp((t - sc.start) / (sc.end - sc.start)));
  sim('main').goto(step);
  const hy = 1640, ppc = smoothCam('stem', t, fitPpc('main', hy, {yTop: 320, max: 7.5}) * (1 + 0.05 * smooth((t - sc.start) / 12)));
  duskSky(stage, hy, {glow: {x: 540, I: 0.15}});
  drawCloud(stage, 'main', {cx: 540, gy: hy + 6, ppc, emit: 0.6, drift: step * 0.35});
  // dust tracers in perspective on the ground plane (depth → lower and bigger)
  const da = fadeIn(t, sc.start + 0.2, 0.5);
  const f = sim('main');
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let q = 1400; q < f.nt; q++) {
    const r = f.tx[q], y = f.ty[q], phi = rand(q * 2.91) * TAU, X = r * Math.cos(phi), Z = r * Math.sin(phi);
    const x = 540 + X * ppc * (1 + Z / 300), yy = hy + 6 - y * ppc + Z * ppc * 0.16, sz = 2.2 + 2.2 * (1 + Z / 128);
    if (yy > 1930 || yy < 200) continue;
    c.globalAlpha = da * clamp(0.2 + 0.6 * (1 - y / 120)); c.fillStyle = '#E8B07A'; c.fillRect(x - sz / 2, yy - sz / 2, sz, sz);
  }
  c.restore();
  // inflow arrows on the ground (from all sides toward the stem)
  const wa = fadeIn(t, P.wind, 0.5);
  if (wa > 0) {
    const ph = (t * 0.9) % 1;
    for (let k = 0; k < 6; k++) {
      const an = k / 6 * TAU + 0.3, r0 = 420, r1 = 110;
      for (let m = 0; m < 3; m++) { const u = (m / 3 + ph) % 1, rr = lerp(r0, r1, u), x = 540 + rr * Math.cos(an), y = hy + 30 + rr * Math.sin(an) * 0.2, dir = Math.atan2(-Math.sin(an) * 0.2, -Math.cos(an));
        withAlpha(c, wa * bumpA(u), () => { const s = 22; poly(c, [[x + s * Math.cos(dir), y + s * Math.sin(dir)], [x + s * 0.8 * Math.cos(dir + 2.5), y + s * 0.8 * Math.sin(dir + 2.5)], [x + s * 0.8 * Math.cos(dir - 2.5), y + s * 0.8 * Math.sin(dir - 2.5)]], 'rgba(255,230,200,0.95)'); }); }
    }
    tag(stage, '주변 바람이 몰려 듦', 540, 1760, {a: wa, size: 36, color: '#FFE0C0'});
  }
  const dd = fadeIn(t, P.dust, 0.5) * fadeOut(t, P.wind - 0.3, 0.4);
  if (dd > 0) tag(stage, '흙먼지가 빨려 올라감', 540, 1760, {a: dd, size: 36, color: '#F0C090'});
}
const bumpA = u => Math.sin(clamp(u) * Math.PI);

// ------------------------------------------------------------------ cap: cools, stops under the tropopause, spreads, condenses
function cap(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const k = t < P.tropo ? lerp(150, 235, clamp((t - sc.start) / (P.tropo - sc.start))) : t < P.spread ? lerp(235, 300, clamp((t - P.tropo) / (P.spread - P.tropo))) : t < P.cond - 0.4 ? lerp(300, 470, clamp((t - P.spread) / (P.cond - 0.4 - P.spread))) : lerp(470, 560, clamp((t - P.cond + 0.4) / (sc.end - P.cond + 0.4)));
  sim('main').goto(k);
  const hy = HY, ppc = smoothCam('cap', t, fitPpc('main', hy, {yTop: 340, wFrac: 0.92, max: 7}));
  const cond = smooth((t - P.cond + 0.3) / 2.2);
  duskSky(stage, hy, {glow: {x: 540, I: 0.12}});
  drawCloud(stage, 'main', {cx: 540, gy: hy + 6, ppc, emit: 0.6, drift: k * 0.35, cond: cond > 0 ? Y => cond * smooth((Y - 125) / 35) : null});
  const yT = hy + 6 - JT * ppc;
  // tropopause band
  const ta = fadeIn(t, P.tropo, 0.6);
  if (ta > 0) withAlpha(c, ta, () => {
    const g = c.createLinearGradient(0, yT - 26, 0, yT + 26); g.addColorStop(0, 'rgba(140,200,255,0)'); g.addColorStop(0.5, 'rgba(140,200,255,0.28)'); g.addColorStop(1, 'rgba(140,200,255,0)');
    c.fillStyle = g; c.fillRect(0, yT - 26, 1080, 52); line(c, [[0, yT], [1080, yT]], 'rgba(190,225,255,0.85)', 2.5);
    tag(stage, '대류권의 끝 · 약 10 km', 300, yT + 56, {size: 34, color: '#CFE6FF'});
  });
  // temperature–height overlay (left): air temperature vs the rising parcel
  const ga = fadeIn(t, P.tropo + 0.6, 0.6) * fadeOut(t, P.capW + 0.8, 0.6);
  if (ga > 0) {
    const zMax = Math.min(13, (hy + 6 - 360) / ppc * KM), xT = T => 110 + (T + 60) / 160 * 400, yZ = z => hy + 6 - (z / KM) * ppc;
    const amb = z => z < 10 ? 30 - 6.5 * z : -35 + 1.0 * (z - 10), parcel = z => z < 10 ? amb(z) + 70 * (1 - z / 10) ** 1.6 : amb(z) - 6 * (z - 10);
    withAlpha(c, ga, () => {
      const g = c.createLinearGradient(60, 0, 520, 0); g.addColorStop(0, 'rgba(4,6,18,0.62)'); g.addColorStop(1, 'rgba(4,6,18,0)'); c.fillStyle = g; c.fillRect(60, yZ(zMax), 460, yZ(0) - yZ(zMax));
      const A = [], Pp = []; for (let z = 0; z <= zMax; z += 0.25) { A.push([xT(amb(z)), yZ(z)]); Pp.push([xT(parcel(z)), yZ(z)]); }
      line(c, A, 'rgba(160,205,255,0.95)', 5); line(c, Pp, 'rgba(255,170,90,0.95)', 5);
      circle(c, xT(amb(10)), yZ(10), 12, '#FFFFFF'); glow(c, xT(amb(10)), yZ(10), 50, '#FFFFFF', 0.4);
      stage.text('주변 기온', xT(amb(4)) + 22, yZ(4), {size: 32, weight: 700, color: '#BFD8FF', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
      stage.text('구름 덩어리', xT(parcel(6)) + 22, yZ(6) - 36, {size: 32, weight: 700, color: '#FFC090', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
    });
  }
  // spreading arrows
  const sa = fadeIn(t, P.spread, 0.4) * fadeOut(t, P.cond - 0.3, 0.4);
  if (sa > 0) { const f = sim('main'), R = f.spread(0.03, JT - 30) * ppc, yy = hy + 6 - (f.topRow(0.03) - 14) * ppc, ph = (t * 0.8) % 1;
    for (const sd of [-1, 1]) withAlpha(c, sa, () => { const x0 = 540 + sd * (R * 0.55 + ph * 120); line(c, [[x0, yy], [x0 + sd * 90, yy]], 'rgba(255,236,210,0.95)', 7, {cap: 'butt'}); poly(c, [[x0 + sd * 120, yy], [x0 + sd * 86, yy - 18], [x0 + sd * 86, yy + 18]], 'rgba(255,236,210,0.95)'); });
    tag(stage, '갓 · 옆으로 퍼짐', 540, yy - 70, {a: sa, size: 38, color: '#FFE6C8'}); }
  if (cond > 0) tag(stage, '수증기 → 물방울 · 하얀 갓', 540, 430, {a: cond * fadeOut(t, sc.end - 0.4, 0.3), size: 36, color: '#EAF4FF'});
}

// ------------------------------------------------------------------ cases: wildfire → ink drop in water → mirror
const FOREST = (() => { const o = []; for (let x = -20; x <= 1100; x += 9) o.push([x, 22 + 36 * vnoise(x * 0.05, 1) + 26 * (vnoise(x * 0.23, 4) > 0.55 ? 1 : 0)]); return o; })();
function fireShot(stage, t, P, sc) {
  const c = stage.ctx, step = lerp(260, 540, clamp((t - sc.start) / (P.ink - sc.start + 1.5)));
  sim('fire').goto(step);
  const hy = 1600;
  const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#05050E'); g.addColorStop(0.6, '#1C1026'); g.addColorStop(1, '#5A1E14'); c.fillStyle = g; c.fillRect(0, 0, 1080, hy);
  const ppc = smoothCam('fire', t, fitPpc('fire', hy, {yTop: 380, wFrac: 0.95, max: 11}));
  drawCloud(stage, 'fire', {cx: 540, gy: hy + 4, ppc, kS: 0.26, albS: [0.55, 0.5, 0.48], amb: [0.16, 0.15, 0.24], sun: [1.9, 0.75, 0.32], L: [0.12, 0.99], lightK: 0.06, emit: 0.6, glowAge: 1e9, heatMax: 14, emitRows: 70, drift: step * 0.4,
    cond: Y => smooth((Y - 120) / 40) * 0.6});
  // forest silhouette with flames
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 40; k++) { const x = (k + 0.5) * 27, fl = 0.6 + 0.4 * Math.sin(t * 7 + k * 1.7) * Math.sin(t * 3.1 + k); glow(c, x, hy - 10, 70 + 40 * fl, '#FF7A2A', 0.35 * fl); }
  c.restore();
  poly(c, [[-20, 1920], ...FOREST.map(([x, h]) => [x, hy + 20 - h]), [1100, 1920]], '#07060A');
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let q = 0; q < 120; q++) { const u = ((t * (0.15 + rand(q) * 0.2) + rand(q * 3)) % 1), x = rand(q * 5.1) * 1080 + Math.sin(t * 2 + q) * 20, y = hy - u * 700; c.globalAlpha = (1 - u) * 0.8; circle(c, x, y, 2.2, '#FFB060'); }
  c.restore();
  tag(stage, '큰 산불 · 불구름', 540, 420, {size: 38, color: '#FFD0A0', a: fadeIn(t, sc.start + 0.3, 0.4)});
}
const INK_STYLE = {kS: 0.16, kD: 0, albS: [0.62, 0.22, 0.78], amb: [0.30, 0.42, 0.75], sun: [1.2, 0.9, 1.3], L: [0.08, -0.99], lightK: 0.06, aoK: 0.03, emit: 0, warp: 1.2, detail: 0.6, detailScale: 0.14};
function inkShot(stage, t, t0, sc, o = {}) {
  const c = stage.ctx, step = lerp(10, 420, clamp((t - t0) / (sc.end - t0)) ** 0.85);
  sim('ink').goto(step);
  // a back-lit glass tank of water: pale, clean, so the dark ink reads
  const g = c.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#E6F6F8'); g.addColorStop(0.45, '#B8E0EA'); g.addColorStop(1, '#5E9DB4'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  const v = c.createRadialGradient(540, 820, 200, 540, 900, 1200); v.addColorStop(0, 'rgba(255,255,255,0.25)'); v.addColorStop(1, 'rgba(20,50,70,0.35)'); c.fillStyle = v; c.fillRect(0, 0, 1080, 1920);
  // faint caustics below the surface; a soft dark band keeps the header readable on the pale water
  c.save(); c.globalAlpha = 0.12; for (let k = 0; k < 14; k++) { const y = 340 + k * 24, ph = t * 0.8 + k; line(c, Array.from({length: 28}, (_, m) => [m * 40, y + 6 * Math.sin(m * 0.7 + ph)]), '#FFFFFF', 2); } c.restore();
  { const hb = c.createLinearGradient(0, 0, 0, 340); hb.addColorStop(0, 'rgba(6,20,34,0.78)'); hb.addColorStop(0.7, 'rgba(6,20,34,0.45)'); hb.addColorStop(1, 'rgba(6,20,34,0)'); c.fillStyle = hb; c.fillRect(0, 0, 1080, 340); }
  for (let q = 0; q < 40; q++) { const u = (t * (0.06 + rand(q) * 0.08) + rand(q * 9)) % 1, x = rand(q * 4.4) * 1080 + 8 * Math.sin(t * 3 + q), y = 1880 - u * 1600; withAlpha(c, 0.45 * (1 - u), () => { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 3 + 4 * rand(q * 2), 0, TAU); c.stroke(); }); }
  const ppc = o.ppc || 7.4, top = 236 - 10 * ppc;
  drawInk(stage, {cx: 540, gy: top + NY * ppc, ppc});
  return {ppc};
}
const IK = {cv: createCanvas(2 * NX, NY)}; IK.c = IK.cv.getContext('2d'); IK.img = IK.c.createImageData(2 * NX, NY);
/** the ink drop as a thin vertical slice through its axis (as in a thin tank): violet core, magenta rims, soft glow */
function drawInk(stage, {cx, gy, ppc}) {
  const f = sim('ink'), D = IK.img.data; D.fill(0);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const s = f.s[i + j * NX]; if (s < 0.003) continue;
    const a = 1 - Math.exp(-s * 7), q = clamp(s * 2.2), r = lerp(0.78, 0.16, q), g = lerp(0.22, 0.04, q), b = lerp(0.72, 0.42, q);
    for (const x of [NX + i, NX - 1 - i]) { const k = (x + (NY - 1 - j) * 2 * NX) * 4; D[k] = r * 255 * a; D[k + 1] = g * 255 * a; D[k + 2] = b * 255 * a; D[k + 3] = a * 245; }
  }
  IK.c.putImageData(IK.img, 0, 0);
  const c = stage.ctx, x0 = cx - NX * ppc, y0 = gy - NY * ppc, w = 2 * NX * ppc, h = NY * ppc;
  c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.globalAlpha = 0.35; c.filter = 'blur(12px)'; c.drawImage(IK.cv, x0, y0, w, h); c.filter = 'none';
  c.globalAlpha = 1; c.drawImage(IK.cv, x0, y0, w, h);
  c.restore();
}
function cases(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  if (t < P.ink - 0.25) { fireShot(stage, t, P, sc); return; }
  if (t < P.mirror - 0.3) {
    const a = smooth((t - P.ink + 0.25) / 0.5);
    inkShot(stage, t, P.ink - 0.25, {end: P.mirror + 6});
    tag(stage, '물에 떨어뜨린 잉크 한 방울', 540, 430, {size: 38, color: '#FFFFFF', a: fadeIn(t, P.ink + 0.2, 0.4)});
    if (a < 1) { withAlpha(c, 1 - a, () => fireShot(stage, t, P, sc)); }
    return;
  }
  // mirror: nuclear (left, rising) | ink (right, sinking)
  const q = smooth((t - P.mirror + 0.3) / 0.8);
  const A = offStage(ctx, 'L'), B = offStage(ctx, 'R');
  if (A._key !== 'mirror') { background(A); sim('main').goto(215); duskSky(A, HY, {glow: {x: 540, I: 0.15}}); drawCloud(A, 'main', {cx: 540, gy: HY + 6, ppc: 4.0, emit: 0, drift: 75}); A._key = 'mirror'; }
  background(B); inkShot(B, t, P.ink - 0.25, {end: P.mirror + 6}, {ppc: 5.2});
  if (q < 1) inkShot(stage, t, P.ink - 0.25, {end: P.mirror + 6});
  half(stage, A, -1, q); half(stage, B, 1, q); seam(stage, q);
  tag(stage, '가벼우면 위로', 270, 430, {a: fadeIn(t, P.mirror, 0.4), size: 40, color: '#FFD9A8'});
  tag(stage, '무거우면 아래로', 810, 430, {a: fadeIn(t, W_(ctx.tl, 's17', '무거운'), 0.4), size: 40, color: '#E0D0FF'});
  arrowUp(stage, 470, 1250, 1050, 10, 'rgba(255,214,150,0.9)', fadeIn(t, P.mirror + 0.2, 0.4));
  withAlpha(c, fadeIn(t, W_(ctx.tl, 's17', '무거운'), 0.4), () => { const x = 1000; line(c, [[x, 1050], [x, 1232]], 'rgba(224,208,255,0.9)', 10, {cap: 'butt'}); poly(c, [[x - 16, 1228], [x + 16, 1228], [x, 1256]], 'rgba(224,208,255,0.9)'); });
}

// ------------------------------------------------------------------ myth: the shock spreads every way; the mushroom comes later
function myth(stage, t, p, ctx) {
  const P = plan(ctx.tl), sc = ctx.scene, c = stage.ctx;
  const hy = 1420, X0 = 540;
  const tAfter = P.after - 0.4;
  const step = t < tAfter ? 0 : lerp(0, 200, clamp((t - tAfter) / (sc.end - tAfter)) ** 0.9);
  sim('main').goto(step);
  const ppc = 4.2;
  const [sx, sy] = shake(t, P.shock, 5);
  c.save(); c.translate(sx, sy);
  const hot = t < P.shock ? 0 : Math.exp(-(t - P.shock) / 3);
  duskSky(stage, hy, {glow: {x: X0, I: 0.12 + hot}});
  if (t >= P.shock) {
    // the hemispherical shock front (slow motion), drawn ahead of the fireball
    const u = t - P.shock, R = 1300 * (1 - Math.exp(-u / 2.6)) + 30 * u;
    if (R < 1500) {
      const g = c.createRadialGradient(X0, hy, Math.max(1, R * 0.82), X0, hy, R);
      g.addColorStop(0, 'rgba(255,240,220,0)'); g.addColorStop(0.85, 'rgba(255,236,210,0.12)'); g.addColorStop(1, 'rgba(255,246,232,0.55)');
      c.save(); c.beginPath(); c.rect(0, 0, 1080, hy); c.clip(); c.fillStyle = g; c.beginPath(); c.arc(X0, hy, R, Math.PI, TAU); c.fill();
      c.strokeStyle = 'rgba(255,248,236,0.85)'; c.lineWidth = 4; c.beginPath(); c.arc(X0, hy, R, Math.PI, TAU); c.stroke(); c.restore();
      // ground-hugging dust swept outward with the front
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let q = 0; q < 160; q++) { const sd = q & 1 ? 1 : -1, d = R * (0.86 + 0.14 * rand(q * 1.7)), x = X0 + sd * d, y = hy + 4 + rand(q * 3.1) * 30 * (d / 900) - rand(q * 9) * 26;
        c.globalAlpha = 0.25 * clamp(1 - u / 6); circle(c, x, y, 3 + rand(q) * 6, '#E8B888'); }
      c.restore();
      const aa = fadeIn(t, P.allway, 0.4) * fadeOut(t, tAfter + 0.6, 0.5);
      if (aa > 0) for (let k = 0; k < 9; k++) { const an = Math.PI + (k / 8) * Math.PI, r0 = Math.min(R, 900) * 0.55, r1 = Math.min(R, 900) * 0.8;
        withAlpha(c, aa, () => { const x0 = X0 + r0 * Math.cos(an), y0 = hy + r0 * Math.sin(an), x1 = X0 + r1 * Math.cos(an), y1 = hy + r1 * Math.sin(an);
          line(c, [[x0, y0], [x1, y1]], 'rgba(255,246,230,0.95)', 7, {cap: 'butt'}); poly(c, [[x1 + 22 * Math.cos(an), y1 + 22 * Math.sin(an)], [x1 + 16 * Math.cos(an + 2.4), y1 + 16 * Math.sin(an + 2.4)], [x1 + 16 * Math.cos(an - 2.4), y1 + 16 * Math.sin(an - 2.4)]], 'rgba(255,246,230,0.95)'); }); }
      if (aa > 0) tag(stage, '충격파 · 사방으로', 540, 420, {a: aa, size: 38, color: '#FFF0DC'});
    }
    // the fireball rises only afterwards
    drawCloud(stage, 'main', {cx: X0, gy: hy + 4, ppc, emit: 1.2, glowAge: 70, drift: step * 0.35, alpha: fadeIn(t, P.shock, 0.15)});
    const ma = fadeIn(t, tAfter + 0.6, 0.5);
    if (ma > 0) tag(stage, '버섯 모양 · 그 뒤에 떠오름', 540, 420, {a: ma, size: 38, color: '#FFD9A8'});
    if (t < P.allway + 0.2) tag(stage, '느린 화면', 540, 420, {a: fadeIn(t, P.shock + 0.3, 0.3) * fadeOut(t, P.allway - 0.2, 0.3), size: 34, color: '#E8DCCB'});
  }
  c.restore();
  if (t >= P.shock) flash(stage, Math.exp(-(t - P.shock) / 0.2) * 0.9);
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
