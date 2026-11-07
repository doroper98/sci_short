// Episode scenes — "핵분열과 핵융합 — 쪼개도 합쳐도 에너지가 나오는 까닭" (29)
// Shape: export {theme, scenes, overlays, background, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Visual direction (2026-11-07 user feedback: "다이내믹함과 비주얼함을 높여야 해"): full-bleed cinematic frames, heroes lit in
// 3D with bloom, the camera always moving, few large labels and big numbers instead of dashboards.
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Nuclei: nucleons are shaded spheres packed in a ball of radius (A/0.6)^(1/3) nucleon radii (random close packing,
//    relaxed with a short repulsion pass; seeded). Colours: proton warm red, neutron cool silver. Explanatory drawing —
//    nucleons are not marbles.
//  - Fission (설명 모형, liquid drop): U-236* wobbles (quadrupole), stretches into a peanut, the neck snaps; fragments
//    Ba-141 (56 p) + Kr-92 (36 p) + 3 neutrons fly apart. Real time scale ≲ 10⁻¹⁴ s; shown in declared slow motion.
//  - Valley: binding energy per nucleon B/A (measured, MeV): H-1 0, H-2 1.112, H-3 2.827, He-4 7.074, C-12 7.680,
//    O-16 7.976, Ne-20 8.032, Mg-24 8.261, Si-28 8.448, S-32 8.493, Ca-40 8.551, Ti-48 8.723, Fe-56 8.790, Ni-62 8.795,
//    Kr-84 8.717, Mo-98 8.635, Sn-120 8.505, Ba-138 8.393, Gd-158 8.202, W-184 8.005, Pb-208 7.868, U-235 7.591,
//    U-238 7.570 (upper envelope of stable nuclei on the light side). Drawn upside-down as a valley: height = 8.8 − B/A,
//    x = log₁₀A. Fusion D+T: 17.6 MeV / 5 = 3.5 MeV per nucleon; fission U-235: ≈ 200 MeV / 236 ≈ 0.85 → ×4 per mass.
//  - Reactor (설명 모형): neutron population with multiplication factor k set by control-rod depth; k = 1 keeps the
//    number of streaks steady. Cherenkov glow: real (water, electrons faster than light in water ≈ 0.75 c).
//  - Fusion: Coulomb repulsion sketched as deceleration and bounce; at 1억 °C a D–T pair fuses → He-4 + n (17.6 MeV).
//  - Tokamak (설명 모형): torus R0 = 1, plasma minor radius 0.32, elongation 1.35; helical field lines with safety factor
//    q(r) = 1 + 2(r/a)²; plasma particles stream along the field. Not KSTAR's or ITER's real geometry.
//  - Numbers on screen: 31.7 % (2024 Korea, 산업통상자원부), 400만 톤/초 (solar luminosity / c² ≈ 4.26 Mt/s), 1938, 1939,
//    1920, −0.7 % (He-4 vs 4 H), ×4, 1억 °C · 48초 (KSTAR, announced 2024), 2034 / 2039 (ITER 2024 baseline), 1 g 미만.
//  - Sound: node episodes/fission-fusion/scenes.mjs --emit-sound writes sound.json from the same plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, glow, withAlpha, rect, TAU, rng, loadTimeline} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
export const theme = {base: 'graphite', accent: '#FFB04A', ink: '#F5F1EA', muted: '#B8B2A8'};
export const captionLayout = {};
const W = 1080, H = 1920;

// =====================================================================================================
// Palette and helpers
// =====================================================================================================
export const PAL = {p: '#E4532F', n: '#8C9FBA', fus: '#FFB04A', fusHot: '#FFE6B0', fis: '#58B4FF', fisHot: '#D6F0FF', cher: '#3D9BFF',
  plasma: '#FF6FB8', plasma2: '#9D7BFF', iron: '#FFD27A', ink: '#F5F1EA', muted: '#B8B2A8', answer: '#FFB04A', cell: '#4FD1A5'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, fi = 0.35, fo = 0.35) => fadeIn(t, a, fi) * fadeOut(t, b - fo, fo);
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
/** perspective camera: P(p) → [sx, sy, depth, scale] */
function cam3(pos, tgt, {fov = 0.85, cx = 540, cy = 900} = {}) {
  const f = V.norm(V.sub(tgt, pos)), r = V.norm(V.cross([0, 1, 0], f)), u = V.cross(f, r), F = (H / 2) / Math.tan(fov / 2);
  return {pos, f, F, P(p) { const d = V.sub(p, pos), z = V.dot(d, f), s = F / Math.max(0.05, z); return [cx + V.dot(d, r) * s, cy - V.dot(d, u) * s, z, s]; }};
}
const orbit = (yaw, pitch, dist, tgt = [0, 0, 0]) => V.add(tgt, [dist * Math.sin(yaw) * Math.cos(pitch), dist * Math.sin(pitch), -dist * Math.cos(yaw) * Math.cos(pitch)]);

// ---- sprites (pre-rendered, drawn with drawImage) ----
const SPR = {};
function sphereSprite(base, size = 112) {
  const cv = createCanvas(size, size), c = cv.getContext('2d'), r = size / 2;
  const g = c.createRadialGradient(r * 0.68, r * 0.6, r * 0.04, r, r, r * 0.98);
  g.addColorStop(0, mix('#FFFFFF', base, 0.55)); g.addColorStop(0.28, mix('#FFFFFF', base, 0.92)); g.addColorStop(0.62, base);
  g.addColorStop(0.9, mix(base, '#000000', 0.62)); g.addColorStop(1, mix(base, '#000000', 0.8));
  circle(c, r, r, r * 0.98, g);
  c.globalCompositeOperation = 'lighter';                                  // rim light (lower right, cool)
  const g2 = c.createRadialGradient(r * 1.55, r * 1.62, r * 0.2, r * 1.2, r * 1.25, r * 1.05);
  g2.addColorStop(0, 'rgba(160,200,255,0.0)'); g2.addColorStop(0.75, 'rgba(160,200,255,0.0)'); g2.addColorStop(0.93, 'rgba(170,210,255,0.28)'); g2.addColorStop(1, 'rgba(170,210,255,0)');
  c.save(); c.beginPath(); c.arc(r, r, r * 0.98, 0, TAU); c.clip(); c.fillStyle = g2; c.fillRect(0, 0, size, size); c.restore();
  const g3 = c.createRadialGradient(r * 0.62, r * 0.52, 0, r * 0.62, r * 0.52, r * 0.26);   // specular
  g3.addColorStop(0, 'rgba(255,255,255,0.75)'); g3.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g3; c.fillRect(0, 0, size, size);
  return cv;
}
function glowSprite(col, size = 128) {
  const cv = createCanvas(size, size), c = cv.getContext('2d'), r = size / 2, g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.18, rgba(col, 0.55)); g.addColorStop(0.45, rgba(col, 0.16)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
}
const G = col => (SPR['g' + col] ||= glowSprite(col));
const SP = col => (SPR['s' + col] ||= sphereSprite(col));
function gl(c, x, y, r, col, a = 1) { if (a <= 0 || r <= 0) return; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, a); c.drawImage(G(col), x - r, y - r, 2 * r, 2 * r); c.restore(); }

// ---- textures ----
function valueNoise(N, seed, octaves = 5) {
  const R = rng(seed), out = new Float32Array(N * N);
  for (let o = 0; o < octaves; o++) {
    const g = 4 << o, lat = new Float32Array(g * g).map(() => R()), amp = 0.5 ** o;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * g, fy = y / N * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
      const v = (i, j) => lat[((j % g) * g) + (i % g)];
      out[y * N + x] += amp * lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
    }
  }
  let mn = Infinity, mx = -Infinity; for (const v of out) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
  return out;
}
function texFrom(N, f) { const cv = createCanvas(N, N), c = cv.getContext('2d'), img = c.createImageData(N, N); for (let i = 0; i < N * N; i++) { const [r, g, b, a] = f(i); img.data.set([r, g, b, a], i * 4); } c.putImageData(img, 0, 0); return cv; }
const TEX = {};
function tex(name) {
  if (TEX[name]) return TEX[name];
  const N = 256;
  if (name === 'gran') { const n = valueNoise(N, 11, 6); TEX[name] = texFrom(N, i => { const v = n[i] ** 1.6; return [255, 150 + 105 * v, 40 + 150 * v ** 2, 255 * (0.25 + 0.75 * v)]; }); }
  if (name === 'haze') { const n = valueNoise(N, 23, 5); TEX[name] = texFrom(N, i => [255, 255, 255, 255 * n[i] ** 2]); }
  if (name === 'caustic') TEX[name] = texFrom(N, i => {
    const x = (i % N) / N * TAU, y = Math.floor(i / N) / N * TAU;
    let s = 0; for (const [a, b, ph] of [[3, 2, 0.4], [-2, 3, 1.7], [4, -1, 2.9], [1, 4, 0.9]]) s += Math.sin(a * x + b * y + ph + 0.8 * Math.sin(2 * x - y));
    const v = Math.max(0, 1 - Math.abs(s) / 1.1) ** 5; return [200, 235, 255, 255 * v];
  });
  if (name === 'grain') { const R = rng(5); TEX[name] = texFrom(N, () => { const v = 100 + 55 * R(); return [v, v, v, 255]; }); }
  return TEX[name];
}
function tiled(c, img, x0, y0, scale, a, op = 'source-over', rot = 0, cx = 540, cy = 960) {
  if (a <= 0) return; c.save(); c.globalAlpha = a; c.globalCompositeOperation = op;
  c.translate(cx, cy); c.rotate(rot); c.translate(-cx, -cy);
  const s = img.width * scale, ox = ((x0 % s) + s) % s, oy = ((y0 % s) + s) % s;
  for (let y = -oy - s; y < H + s; y += s) for (let x = -ox - s; x < W + s; x += s) c.drawImage(img, x, y, s, s);
  c.restore();
}

// ---- bloom (screen-space, quarter resolution) ----
const BL = {a: createCanvas(270, 480), b: createCanvas(270, 480), c: createCanvas(135, 240)};
function bloom(stage, k = 0.6, wide = 0.35, thr = 2.4) {
  const c = stage.ctx, ca = BL.a.getContext('2d'), cb = BL.b.getContext('2d'), cc = BL.c.getContext('2d');
  ca.globalCompositeOperation = 'copy'; ca.filter = `contrast(${thr}) brightness(0.85)`; ca.drawImage(stage.canvas, 0, 0, 270, 480); ca.filter = 'none';
  cb.globalCompositeOperation = 'copy'; cb.filter = 'blur(5px)'; cb.drawImage(BL.a, 0, 0); cb.filter = 'none';
  cc.globalCompositeOperation = 'copy'; cc.filter = 'blur(9px)'; cc.drawImage(BL.a, 0, 0, 135, 240); cc.filter = 'none';
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = k; c.drawImage(BL.b, 0, 0, W, H);
  c.globalAlpha = wide; c.drawImage(BL.c, 0, 0, W, H); c.restore();
}
function finish(stage, t, o = {}) {                                         // bloom + vignette + grain on every scene
  const c = stage.ctx;
  bloom(stage, o.bloom ?? 0.6, o.wide ?? 0.35, o.thr ?? 2.4);
  const v = c.createRadialGradient(540, 900, 520, 540, 900, 1260); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${o.vig ?? 0.55})`);
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// ---- text helpers ----
function big(stage, s, x, y, size, col, a = 1, o = {}) {
  if (a <= 0) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: 'display', weight: 700, size, color: col, align: o.align || 'center', tracking: -0.02 * size, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 24, ...o}));
}
function label(stage, s, x, y, a = 1, o = {}) {
  if (a <= 0) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: 'display', weight: o.weight ?? 500, size: o.size || 34, color: o.color || PAL.ink, align: o.align || 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16}));
}

// =====================================================================================================
// Nuclei
// =====================================================================================================
const NUC = {};
/** packed ball of A nucleons (Z protons), radius unit = nucleon radius; seeded and relaxed */
function pack(A, Z, seed) {
  const key = `${A}:${Z}:${seed}`; if (NUC[key]) return NUC[key];
  const R = rng(seed), Rb = Math.cbrt(A / 0.6) * (A < 5 ? 0.82 : 1), pts = [];
  for (let i = 0; i < A; i++) { let p; do p = [2 * R() - 1, 2 * R() - 1, 2 * R() - 1]; while (V.dot(p, p) > 1); pts.push(V.mul(p, Math.max(0.3, Rb - 0.8))); }
  if (A === 2) { pts[0] = [-0.85, 0, 0]; pts[1] = [0.85, 0.05, 0]; }
  for (let it = 0; it < (A > 4 ? 70 : 30); it++) {
    for (let i = 0; i < A; i++) for (let j = i + 1; j < A; j++) {
      const d = V.sub(pts[i], pts[j]), l = Math.hypot(...d) || 1e-3;
      if (l < 1.78) { const k = (1.78 - l) * 0.5 / l; pts[i] = V.add(pts[i], V.mul(d, k)); pts[j] = V.sub(pts[j], V.mul(d, k)); }
    }
    for (let i = 0; i < A; i++) { const l = Math.hypot(...pts[i]); if (l > Rb - 0.9 && A > 4) pts[i] = V.mul(pts[i], (Rb - 0.9) / l * 0.6 + 0.4); }
  }
  const idx = [...Array(A).keys()].sort(() => R() - 0.5), isP = new Set(idx.slice(0, Z));
  return (NUC[key] = {A, Z, Rb, pts: pts.map((p, i) => ({p, proton: isP.has(i), ph: R() * TAU}))});
}
const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
/** draw nucleons (array of {p:[x,y,z] (screen-aligned after transforms), proton}) at cx, cy with px per unit */
function drawNucleons(c, list, cx, cy, s, o = {}) {
  const arr = list.map(q => ({...q, z: q.p[2]})).sort((a, b) => a.z - b.z), a0 = o.alpha ?? 1;
  if (o.under !== false) gl(c, cx, cy, s * (o.R || 6) * 2.2, o.glowCol || '#FF9A6A', 0.25 * a0 * (o.glow ?? 1));
  c.save(); c.globalAlpha = a0;
  for (const q of arr) {
    const k = 1 + q.z * 0.012, r = s * 1.02 * k, x = cx + q.p[0] * s * k, y = cy + q.p[1] * s * k;
    c.drawImage(SP(q.proton ? PAL.p : PAL.n), x - r, y - r, 2 * r, 2 * r);
  }
  c.restore();
  if (o.hot) gl(c, cx, cy, s * (o.R || 6) * 1.4, o.hotCol || '#FFE6B0', o.hot);
}
/** a whole nucleus with gentle rotation and optional quadrupole wobble */
function nucleus(c, n, cx, cy, s, t, o = {}) {
  const yaw = (o.yaw ?? 0) + t * (o.spin ?? 0.25), pitch = o.pitch ?? 0.35, wob = o.wob || 0, wph = o.wph ?? t * 9;
  const list = n.pts.map(q => {
    let p = q.p.slice();
    if (wob) { const e = wob * Math.sin(wph); p = [p[0] * (1 + e), p[1] * (1 - e / 2), p[2] * (1 - e / 2)]; }
    p = rotX(rotY(p, yaw), pitch);
    const jit = o.jit ?? 0.04; p = [p[0] + jit * Math.sin(t * 7 + q.ph), p[1] + jit * Math.cos(t * 6 + q.ph * 1.7), p[2]];
    return {p, proton: q.proton};
  });
  drawNucleons(c, list, cx, cy, s, {...o, R: n.Rb});
}
// ---- fission of U-236* (설명 모형) ----
const FIS = (() => {
  const n = pack(236, 92, 235), sorted = n.pts.map((q, i) => ({...q, i})).sort((a, b) => a.p[0] - b.p[0]);
  const freeN = [], L = [], Rr = [];
  // 3 neutrons from the middle become free; left group = 141 (Ba), right = 92 (Kr)
  const mid = sorted.slice(130, 145).filter(q => !q.proton).slice(0, 3);
  const midSet = new Set(mid.map(q => q.i));
  const rest = sorted.filter(q => !midSet.has(q.i));
  rest.forEach((q, k) => (k < 141 ? L : Rr).push(q));
  const cL = V.mul(L.reduce((a, q) => V.add(a, q.p), [0, 0, 0]), 1 / L.length), cR = V.mul(Rr.reduce((a, q) => V.add(a, q.p), [0, 0, 0]), 1 / Rr.length);
  return {n, L, R: Rr, free: mid, cL, cR, dirs: [[-0.2, -1, 0.3], [0.35, 0.95, -0.2], [0.95, -0.55, 0.4]].map(V.norm)};
})();
/** e: stretch 0..1 before scission, u: seconds (scaled) after scission (<0: not yet) */
function fissionNucleons(e, u, yaw, pitch, wob = 0, wph = 0) {
  const out = [], st = 1 + 1.1 * e, sq = 1 / Math.sqrt(st), sep = u > 0 ? 2.2 + 26 * u : 0;
  const relax = u > 0 ? smooth(u / 0.35) : 0;
  const tr = (p, grp) => {
    let q = p.slice();
    if (wob) { const w = wob * Math.sin(wph); q = [q[0] * (1 + w), q[1] * (1 - w / 2), q[2] * (1 - w / 2)]; }
    const c = grp === 'L' ? FIS.cL : FIS.cR, dir = grp === 'L' ? -1 : 1;
    // stretch + neck pinch
    let x = q[0] * st, y = q[1] * sq, z = q[2] * sq;
    const pinch = 1 - 0.55 * e * Math.exp(-(q[0] ** 2) / 10);
    y *= pinch; z *= pinch; x += dir * 1.2 * e;
    if (u > 0) {                                                         // fragment relaxes to its own ball and flies
      const rel = V.sub(q, c), cx = c[0] * 1.15 + dir * sep;
      x = lerp(x, cx + rel[0], relax); y = lerp(y, c[1] + rel[1], relax); z = lerp(z, c[2] + rel[2], relax);
    }
    return rotX(rotY([x, y, z], yaw), pitch);
  };
  for (const q of FIS.L) out.push({p: tr(q.p, 'L'), proton: q.proton, g: 'L'});
  for (const q of FIS.R) out.push({p: tr(q.p, 'R'), proton: q.proton, g: 'R'});
  if (u <= 0) for (const q of FIS.free) out.push({p: tr(q.p, 'L'), proton: false, g: 'F'});
  return out;
}
/** draw the fission event; returns screen positions of the 3 free neutrons (for streaks) */
function fissionDraw(c, cx, cy, s, e, u, t, o = {}) {
  const yaw = o.yaw ?? 0.3, pitch = o.pitch ?? 0.25;
  const list = fissionNucleons(e, u, yaw, pitch, o.wob || 0, o.wph || 0);
  drawNucleons(c, list, cx, cy, s, {R: FIS.n.Rb * (1 + e * 0.6), glow: o.glow ?? 1, glowCol: o.glowCol});
  if (u > 0) {                                                             // neck flash + free neutrons
    const fl = Math.exp(-u / 0.06) + 0.25 * Math.exp(-u / 0.5);
    gl(c, cx, cy, s * 7 * (0.6 + u * 2), '#FFFFFF', fl * 0.7); gl(c, cx, cy, s * 20 * (0.6 + u), PAL.fis, fl * 0.5);
    const at = d => FIS.dirs.map(v => { const p = rotX(rotY(V.mul(v, d), yaw), pitch); return [cx + p[0] * s, cy + p[1] * s]; });
    const hd = 1.5 + 60 * u, pos = at(hd), tail = at(Math.max(1.5, hd - 7));
    pos.forEach((p, k) => streak(c, tail[k], p, s * 0.9, PAL.fisHot, 1));
    return pos;
  }
  return [];
}
/** bright moving particle with a fading trail from a → b (b = head) */
function streak(c, a, b, r, col, alpha = 1) {
  if (alpha <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, 0.85 * alpha));
  c.strokeStyle = g; c.lineCap = 'round'; c.lineWidth = r * 0.9; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  c.lineWidth = r * 0.35; c.strokeStyle = rgba('#FFFFFF', 0.8 * alpha); c.beginPath(); c.moveTo(lerp(a[0], b[0], 0.6), lerp(a[1], b[1], 0.6)); c.lineTo(b[0], b[1]); c.stroke();
  c.restore();
  gl(c, b[0], b[1], r * 3.2, col, alpha); gl(c, b[0], b[1], r * 1.1, '#FFFFFF', alpha);
}
/** small light nucleus (D, T, He-4) drawn from explicit nucleon offsets */
const LIGHT = {
  H: [{p: [0, 0, 0], proton: true}],
  D: [{p: [-0.9, 0, 0], proton: true}, {p: [0.9, 0.1, 0.2], proton: false}],
  T: [{p: [-0.9, 0.4, 0], proton: true}, {p: [0.9, 0.4, 0.2], proton: false}, {p: [0, -0.9, -0.3], proton: false}],
  He: [{p: [-0.85, 0.5, 0.3], proton: true}, {p: [0.85, 0.5, -0.3], proton: false}, {p: [0.85, -0.6, 0.35], proton: true}, {p: [-0.85, -0.6, -0.35], proton: false}],
};
function light(c, kind, x, y, s, t, o = {}) {
  const yaw = (o.yaw ?? 0) + t * (o.spin ?? 1.2);
  drawNucleons(c, LIGHT[kind].map(q => ({p: rotX(rotY(q.p, yaw), 0.4), proton: q.proton})), x, y, s, {R: 1.6, glow: o.glow ?? 1.2, glowCol: o.glowCol || '#FFB070', hot: o.hot, alpha: o.alpha});
}

// =====================================================================================================
// Binding-energy valley (measured B/A, upside down)
// =====================================================================================================
const BA = [[1, 0], [2, 1.112], [3, 2.827], [4, 7.074], [12, 7.680], [16, 7.976], [20, 8.032], [24, 8.261], [28, 8.448], [32, 8.493], [40, 8.551],
  [48, 8.723], [56, 8.790], [62, 8.795], [84, 8.717], [98, 8.635], [120, 8.505], [138, 8.393], [158, 8.202], [184, 8.005], [208, 7.868], [235, 7.591], [238, 7.570]];
function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) { if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; } const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  return x => { if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1]; let i = 0; while (x > xs[i + 1]) i++;
    const u = (x - xs[i]) / h[i], u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h[i] * m[i + 1]; };
}
export const baCurve = pchip(BA.map(q => Math.log10(q[0])), BA.map(q => q[1]));
const VX = A => Math.log10(A) / Math.log10(240) * 12 - 6;             // world x ∈ [-6, 6]
const VY = A => (8.8 - baCurve(Math.log10(A))) * 0.95;                  // height above the iron floor (world units)
const VYx = x => VY(10 ** ((x + 6) / 12 * Math.log10(240)));
function valley(stage, cam, t, o = {}) {
  const c = stage.ctx, N = 150, Zw = 2.2, base = -1.6, pts = [];
  for (let i = 0; i <= N; i++) { const x = -6 + 12 * i / N; pts.push([x, VYx(x)]); }
  const shade = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy); return clamp(0.45 + 0.55 * (dx / l) * 0.6 - (dy / l) * 0.5, 0.15, 1); };
  const colAt = x => (x < VX(56) ? mix(PAL.fus, '#8A4A2A', clamp((x - VX(4)) / (VX(56) - VX(4)))) : mix('#3A5E8A', PAL.fis, clamp((x - VX(56)) / (6 - VX(56)))));
  // top surface strips, back half first then front wall
  const order = [...Array(N).keys()].sort((i, j) => Math.abs(pts[j][0] - cam.pos[0]) - Math.abs(pts[i][0] - cam.pos[0]));
  for (const i of order) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const q = [cam.P([x0, y0, Zw]), cam.P([x1, y1, Zw]), cam.P([x1, y1, -Zw]), cam.P([x0, y0, -Zw])];
    if (q.some(p => p[2] < 0.1)) continue;
    const sh = shade(x0, y0, x1, y1), col = mix('#05070C', colAt((x0 + x1) / 2), 0.16 + 0.44 * sh);
    c.beginPath(); c.moveTo(q[0][0], q[0][1]); for (const p of q.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fillStyle = col; c.fill();
    if (i % 5 === 0) { c.strokeStyle = rgba('#FFFFFF', 0.07); c.lineWidth = 1.2; c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[3][0], q[3][1]); c.stroke(); }
  }
  for (const zz of [-1.6, -0.8, 0, 0.8, 1.6]) {                                   // contour lines along the valley
    c.beginPath(); pts.forEach(([x, y], i) => { const p = cam.P([x, y + 0.01, zz]); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.strokeStyle = rgba('#FFFFFF', 0.12); c.lineWidth = 1.4; c.stroke();
  }
  // front wall
  c.beginPath(); pts.forEach(([x, y], i) => { const p = cam.P([x, y, -Zw]); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); });
  for (let i = N; i >= 0; i--) { const p = cam.P([pts[i][0], base, -Zw]); c.lineTo(p[0], p[1]); } c.closePath();
  const pb = cam.P([0, base, -Zw]), pt = cam.P([0, 3, -Zw]), wg = c.createLinearGradient(0, pt[1], 0, pb[1]);
  wg.addColorStop(0, '#1B1E26'); wg.addColorStop(1, '#07080B'); c.fillStyle = wg; c.fill();
  // glowing rim on the front edge, warm on the fusion side, blue on the fission side
  for (let i = 0; i < N; i++) {
    const a = cam.P([pts[i][0], pts[i][1], -Zw]), b = cam.P([pts[i + 1][0], pts[i + 1][1], -Zw]);
    c.strokeStyle = rgba(colAt(pts[i][0]), 0.95); c.lineWidth = 4; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  // iron glow at the floor
  const fe = cam.P([VX(56), VY(56), 0]);
  gl(c, fe[0], fe[1], 260 * (fe[3] / 120), PAL.iron, 0.55 * (o.iron ?? 1)); gl(c, fe[0], fe[1], 90 * (fe[3] / 120), '#FFFFFF', 0.5 * (o.iron ?? 1));
  return {fe, P: (A, z = 0, lift = 0.55) => cam.P([VX(A), VY(A) + lift, z])};
}

// =====================================================================================================
// Backgrounds
// =====================================================================================================
function bgFill(c, top, bot) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, W, H); }
function bgDual(c, t) {                                                     // warm (fusion) above, blue (fission) below
  bgFill(c, '#1A0B06', '#030A16');
  gl(c, 540, -120, 1300, '#FF7A2A', 0.55); gl(c, 980, 260, 700, '#FFB04A', 0.25);
  gl(c, 540, 2050, 1300, '#1E78FF', 0.5); gl(c, 120, 1500, 700, '#3D9BFF', 0.2);
  tiled(c, tex('haze'), t * 14, t * 6, 4, 0.08, 'lighter');
}
function bgSunPlasma(c, t, a = 1) {
  bgFill(c, '#1E0602', '#0A0200');
  gl(c, 540, 820, 1400, '#C8400A', 0.5 * a);
  tiled(c, tex('gran'), t * 10, -t * 7, 3.6, 0.22 * a, 'lighter', t * 0.01);
  tiled(c, tex('gran'), -t * 13, t * 5, 2.4, 0.14 * a, 'lighter', -t * 0.015);
  const v = c.createRadialGradient(540, 820, 200, 540, 820, 1100); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function bgLab(c, t) {
  bgFill(c, '#0E1218', '#040507');
  c.save(); c.globalCompositeOperation = 'lighter';                         // volumetric light cone from above
  const g = c.createLinearGradient(540, 0, 540, 1500); g.addColorStop(0, 'rgba(160,190,230,0.22)'); g.addColorStop(1, 'rgba(160,190,230,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(430, 0); c.lineTo(650, 0); c.lineTo(980, 1500); c.lineTo(100, 1500); c.closePath(); c.fill(); c.restore();
  tiled(c, tex('haze'), t * 20, t * 9, 3, 0.07, 'lighter');
  const R = rng(3); for (let i = 0; i < 70; i++) { const x = (R() * W + t * (6 + 10 * R())) % W, y = (R() * 1500 + Math.sin(t * 0.5 + i) * 20); circle(c, x, y, 1 + 1.6 * R(), rgba('#DDE8FF', 0.08 + 0.18 * R())); }
}
function bgPool(c, t, a = 1, cx = 540, cy = 1100) {
  bgFill(c, '#021226', '#00050C');
  gl(c, cx, cy, 1500, '#1C6DFF', 0.55 * a); gl(c, cx, cy, 700, '#4FB0FF', 0.55 * a); gl(c, cx, cy, 280, '#CFEFFF', 0.45 * a);
  tiled(c, tex('caustic'), t * 22, t * 11, 2.6, 0.22 * a, 'lighter', 0.3);
  tiled(c, tex('caustic'), -t * 15, t * 18, 3.4, 0.16 * a, 'lighter', -0.5);
}
function bgPlasma(c, t, a = 1) {
  bgFill(c, '#12041A', '#05020A');
  gl(c, 540, 820, 1300, '#B03A9A', 0.35 * a); gl(c, 300, 1300, 900, '#5A3AD0', 0.25 * a);
  tiled(c, tex('haze'), t * 25, -t * 12, 3.5, 0.12 * a, 'lighter', t * 0.02);
}
function bgSpace(c, t) {
  bgFill(c, '#06070C', '#020204');
  const R = rng(9); for (let i = 0; i < 260; i++) { const x = R() * W, y = R() * H, r = 0.6 + 1.6 * R() ** 3, tw = 0.6 + 0.4 * Math.sin(t * (1 + R() * 2) + i); circle(c, x, y, r, rgba(R() > 0.85 ? '#FFE3C8' : '#DDE6FF', (0.15 + 0.5 * R() ** 2) * tw)); }
}

// =====================================================================================================
// Time anchors (words from the tts text) and plan
// =====================================================================================================
const Wd = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  split1: Wd('s01', '쪼개는'), fuse1: Wd('s01', '합치는'),
  pct2: Wd('s02', '삼십퍼센트는'), plant2: Wd('s02', '발전소에서'),
  sun3: Wd('s03', '태양은'), mt3: Wd('s03', '사백만'), light3: Wd('s03', '빛으로'),
  y38: Wd('s04', '천구백삼십팔년'), u4: Wd('s04', '우라늄에'), n4: Wd('s04', '중성자를'), shoot4: Wd('s04', '쏘자'), ba4: Wd('s04', '바륨이'), found4: Wd('s04', '발견했습니다'),
  cell5: Wd('s05', '세포가'), div5: Wd('s05', '나뉘는'), name5: Wd('s05', '분열이라고'),
  y20: Wd('s06', '천구백이십년'), h6: Wd('s06', '수소를'), he6: Wd('s06', '헬륨으로'), shine6: Wd('s06', '빛난다고'),
  pn7: Wd('s07', '양성자와'), strong7: Wd('s07', '강한'), tight7: Wd('s07', '단단히'), less7: Wd('s07', '줄어듭니다'),
  split8: Wd('s08', '쪼개든'), fuse8: Wd('s08', '합치든'), tight8: Wd('s08', '단단히'), energy8: Wd('s08', '에너지가'),
  fe9: Wd('s09', '철'), u9: Wd('s09', '우라늄은'), split9: Wd('s09', '쪼개질'), h9: Wd('s09', '수소는'), fuse9: Wd('s09', '합쳐질'),
  u10: Wd('s10', '우라늄'), n10: Wd('s10', '중성자'), eat10: Wd('s10', '삼키면'), wob10: Wd('s10', '출렁이다'), snap10: Wd('s10', '갈라지고'), new10: Wd('s10', '두세'),
  rod11: Wd('s11', '제어봉으로'), up11: Wd('s11', '늘지도'), down11: Wd('s11', '줄지도'), one11: Wd('s11', '한 개씩만'),
  water12: Wd('s12', '물을'), turb12: Wd('s12', '터빈을'), pool12: Wd('s12', '물에'), blue12: Wd('s12', '푸른'),
  push13: Wd('s13', '밀어내는'), hot13: Wd('s13', '일억'), hit13: Wd('s13', '부딪혀'), stick13: Wd('s13', '붙게'),
  donut14: Wd('s14', '도넛'), mag14: Wd('s14', '자기장'), wall14: Wd('s14', '벽에'), plasma14: Wd('s14', '플라스마를'),
  kstar15: Wd('s15', '케이스타는'), deg15: Wd('s15', '일억'), sec15: Wd('s15', '사십팔초'),
  same16: Wd('s16', '같은'), fus16: Wd('s16', '핵융합이'), x4: Wd('s16', '네 배'),
  fis17: Wd('s17', '핵분열은'), long17: Wd('s17', '오래'), fus17: Wd('s17', '핵융합은'), he17: Wd('s17', '헬륨이'),
  res18: Wd('s18', '연구'), fr18: Wd('s18', '프랑스의'), iter18: Wd('s18', '이터는'), y2030: Wd('s18', '이천삼십년대에'),
  boom19: Wd('s19', '수소폭탄처럼'),
  no20: Wd('s20', '아닙니다'), gram20: Wd('s20', '몇 그램도'), mess20: Wd('s20', '흐트러져도'), cool20: Wd('s20', '식어'), stop20: Wd('s20', '멈춥니다'),
  split21: Wd('s21', '쪼개든'), fuse21: Wd('s21', '합치든'), less21: Wd('s21', '줄어든'),
};
export const MORPH = [0.9, 1.7];
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  for (const [k, r] of Object.entries(A)) P[k] = at(r);
  P.end = tl.duration;
  // hook: the poster moment is a fission frozen 0.12 s (scaled) after scission
  P.fis0 = MORPH[0] - 0.12 * 3;                                          // scission (screen) such that u(0) = 0.12
  P.fuseHook = P.fuse1 - 0.1;
  P.toNight = at('s02') - 0.75; P.nightIn = at('s02') - 0.6; P.nightCut = P.toNight + 0.6; P.toSun = at('s03') - 0.8;
  // origin
  P.n4hit = P.shoot4 + 0.55; P.snap4 = P.ba4 - 0.05;
  P.snap5 = P.div5 + 0.25;
  P.fuse6 = P.he6 - 0.05;
  // essence
  P.bind7 = [P.pn7 + 0.3, P.strong7 + 0.2, P.tight7 + 0.1];
  P.vFuse = P.h9 + 0.1; P.vSplit = P.split9 - 0.05; P.vFuse8 = P.fuse8 + 0.1; P.vSplit8 = P.split8 + 0.1;
  // fission
  P.nIn = P.n10 - 0.3; P.absorb = P.eat10 + 0.05; P.snap = P.snap10 + 0.12; P.slowK = 0.35;
  P.rodsDown = P.rod11 - 0.2; P.kEven = P.one11 - 0.3;
  P.turbine = P.turb12 - 0.2; P.dive = P.pool12 - 0.35;
  // fusion
  P.bounce13 = P.push13 + 0.5; P.heat = [P.push13 + 0.9, P.hot13 + 0.6]; P.fuse13 = P.hit13 + 0.2;
  P.tok = sc('fusion').start; P.timer = [P.sec15 - 0.2, P.sec15 + 3.0];
  // compare
  P.cols = sc('compare').start + 0.25; P.x4in = P.x4 - 0.1; P.waste = P.long17 - 0.1; P.heUp = P.he17 - 0.1; P.iterIn = P.iter18 - 0.3; P.yrs = P.y2030;
  // myth
  P.wobble = P.mess20 - 0.1; P.cool = P.cool20 - 0.2; P.dead = P.cool20 + 1.6;
  // close
  P.vF21 = P.fuse21 - 0.2; P.vS21 = P.split21 + 0.1; P.poster = P.less21 - 0.2;
  // reactor: neutron population (설명 모형) — k by rod depth; streak events are scheduled per generation
  const s11 = sc('fission'), r0 = at('s11') - 0.8, r1 = at('s12') - 0.4;
  P.core = [r0, r1];
  P.rod = tt => tt < P.rodsDown ? 0.15 : tt < P.kEven ? lerp(0.15, 0.75, smooth((tt - P.rodsDown) / 1.3)) : lerp(0.75, 0.55, smooth((tt - P.kEven) / 0.8));
  P.k = tt => 1.15 - 0.375 * (P.rod(tt) - 0.15);                    // rods out 1.15 · deep 0.925 · settled 1.00
  P.gens = []; { let N = 3, tt = r0; const gen = 0.42;
    while (tt < r1) { const n = Math.max(2, Math.round(N)); P.gens.push({t: tt, n}); N = Math.min(16, N * P.k(tt)); tt += gen; } }
  P.splitT = P.gens.map(g => g.t + 0.42 - 0.02).filter(x => x < r1);
  // tokamak plasma level (1 = burning, fades on cooling)
  P.plasmaA = tt => tt < P.cool ? 1 : Math.exp(-(tt - P.cool) / 0.45);
  void s11;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Header titles and poster
// =====================================================================================================
function titleList(id, P) {
  if (id === 'hook') return [[-Infinity, '오늘의 주제', '쪼개도 합쳐도 에너지?'], [P.nightIn, '2024 · 우리나라 전기', '원자핵을 쪼개는 원자력'], [P.toSun + 0.4, '태양', '원자핵을 합치는 별']];
  if (id === 'origin') return [[-Infinity, '1938 · 독일', '한 · 슈트라스만'], [at0(P, 's05'), '1939 · 이름 짓기', '분열 · fission'], [at0(P, 's06'), '1920 · 에딩턴', '태양은 수소를 합친다']];
  if (id === 'essence') return [[-Infinity, '본질 · 결합', '단단히 묶일수록 가볍다'], [P.split8 - 0.6, '본질 · 원자핵의 골짜기', '철을 향해 내려간다']];
  if (id === 'fission') return [[-Infinity, '핵분열 · 우라늄 235', '출렁이다 둘로'], [P.core[0] + 0.3, '원자로 · 제어봉', '한 번에 하나씩'], [P.turbine - 0.3, '원자로 · 물', '터빈과 푸른 빛']];
  if (id === 'fusion') return [[-Infinity, '핵융합 · 1억 °C', '밀어내는 벽을 넘다'], [P.donut14 - 0.6, '토카막', '자기장 그릇'], [P.kstar15 - 0.4, 'KSTAR · 2024 발표', '오래 붙잡아 두기']];
  if (id === 'compare') return [[-Infinity, '비교 · 같은 무게', '핵융합 ≈ 핵분열 × 4'], [P.fis17 - 0.5, '비교 · 남는 것', '폐기물과 헬륨'], [P.res18 - 0.5, 'ITER · 프랑스', '2030년대 본격 실험']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '수소폭탄처럼 터질까?'], [P.no20 - 0.2, '오해 바로잡기', '식으면 바로 멈춘다']];
  return [[-Infinity, '', '']];
}
const at0 = (P, sid) => P._tl.at(sid) - 0.6;
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const c = stage.ctx, T = stage.theme, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 28, color: T.accent, align: 'center', tracking: 2, ...so}); line(c, [[510, 174], [570, 174]], T.accent, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: T.ink, align: 'center', maxWidth: 820, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 292, {role: 'display', weight: 700, size: 34, color: PAL.answer, align: 'center', ...so}));
}
const POSTER_Q = {y: 1060, y2: 1196, q: '쪼개도 합쳐도 에너지', ans: '철을 향하기 때문'};
let QSIZE = 0, ASIZE = 0;
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme, TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 820, 100); ASIZE ||= fit(POSTER_Q.ans, 860, 150);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 56, q), y2 = lerp(POSTER_Q.y2, 292, q), s2 = lerp(ASIZE, 34, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g2 = c.createLinearGradient(0, 960, 0, 1300); g2.addColorStop(0, 'rgba(2,4,10,0)'); g2.addColorStop(0.3, 'rgba(2,4,10,0.6)'); g2.addColorStop(0.75, 'rgba(2,4,10,0.6)'); g2.addColorStop(1, 'rgba(2,4,10,0)'); c.fillStyle = g2; c.fillRect(0, 960, 1080, 340); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)', wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 22, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 22, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', tracking: tr * s2, shadow: sh, shadowBlur: 28});
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1290, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0.62)'); c.fillStyle = g; c.fillRect(0, 1290, W, 630); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl); P._tl = ctx.tl;
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, t); return; }
  if (!(id === 'close' && t >= P.poster)) captionBand(stage.ctx);
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, t, 1 - easeInOut((t - P.poster) / 0.9), 1); return; }
    const a = smooth(ctx.scene.p / 0.04) * fadeOut(t, P.poster - 0.4, 0.4); if (a > 0) head(stage, '정리', '철을 향해 내려가는 두 길', a, a);
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
export function background(stage) { stage.ctx.fillStyle = '#000'; stage.ctx.fillRect(0, 0, W, H); }

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/fission-fusion/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.gens.length}/${P.snap.toFixed(3)}/${P.fuse13.toFixed(3)}/${baCurve(1.5).toFixed(4)}`; }
const shake = (c, t, t0, amp = 7) => { const k = Math.exp(-(t - t0) / 0.18) * (t > t0 ? 1 : 0); if (k > 0.01) c.translate(amp * k * Math.sin(t * 91), amp * k * Math.cos(t * 77)); };
function zoomAbout(c, x, y, s) { c.translate(x, y); c.scale(s, s); c.translate(-x, -y); }
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  fission(stage, t, p, ctx) { fissionScene(stage, t, ctx); },
  fusion(stage, t, p, ctx) { fusionScene(stage, t, ctx); },
  compare(stage, t, p, ctx) { compareScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook
function posterPicture(stage, t, P, u) {                                  // the thumbnail composition (also the close bookend)
  const c = stage.ctx;
  bgDual(c, t);
  // fusion pair (upper right): D and T touching with a warm burst
  const fz = 0.5 + 0.5 * Math.sin(t * 2), fa = P && t < P.end - 3 ? t - P.fuseHook : -1;
  gl(c, 820, 360, 260, PAL.fus, 0.55); gl(c, 820, 360, 90, '#FFFFFF', 0.4 + 0.1 * fz);
  if (fa < 0) { const k = t > MORPH[0] ? smooth((t - MORPH[0]) / Math.max(0.3, P.fuseHook - MORPH[0])) : 0; light(c, 'D', 770 + 30 * k, 372 - 8 * k, 30, t, {glow: 1.4}); light(c, 'T', 872 - 30 * k, 344 + 8 * k, 30, t + 1, {glow: 1.4}); }
  else { light(c, 'He', 820 + fa * 60, 358 - fa * 50, 32, t, {glow: 1.6, hot: 0.5 * Math.exp(-fa / 0.5)}); streak(c, [820 + Math.max(0, fa - 0.2) * 520, 360 + Math.max(0, fa - 0.2) * 180], [820 + fa * 520, 360 + fa * 180], 12, PAL.fisHot, Math.exp(-fa / 1.5)); }
  // fission (centre): just after scission
  fissionDraw(c, 520, 680, 35, 1, u, t, {yaw: 0.35, pitch: 0.22, glowCol: '#7FC0FF'});
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.toNight + 0.6) {
    const u = t < MORPH[0] ? 0.12 : 0.12 + (t - MORPH[0]) * 0.1;             // slow motion after the poster
    c.save();
    const zs = 1 + 0.06 * smooth((t - 1) / 6) + (t > P.toNight ? 0.9 * easeIn((t - P.toNight) / 0.6) : 0);
    zoomAbout(c, 540, 700, zs);
    posterPicture(stage, t, P, u);
    const act2 = P.fuseHook + 0.1;
    if (t > act2) {
      const na = smooth((t - act2) / 0.6), gp = lerp(150, 46, smooth((t - act2 - 0.5) / 3.2));
      nucleus(c, pack(235, 92, 7), 400, 880, 25 * (0.85 + 0.15 * na), t, {pitch: 0.3, glowCol: '#7FC0FF', jit: 0.05, alpha: na, wob: 0.05, wph: t * 8});
      withAlpha(c, na, () => { light(c, 'D', 760 - gp, 560, 34, t, {glow: 1.4}); light(c, 'T', 760 + gp, 560, 34, t + 1, {glow: 1.4}); gl(c, 760, 560, 200, PAL.fus, 0.25 * na * (1 - gp / 150)); });
      label(stage, '쪼개기', 400, 1130, na * fadeOut(t, P.toNight, 0.3), {size: 40, weight: 700, color: '#CFE6FF'});
      label(stage, '합치기', 760, 720, na * fadeOut(t, P.toNight, 0.3), {size: 40, weight: 700, color: '#FFE0B0'});
    }
    // fusion burst at "합치는"
    const fa = t - P.fuseHook;
    if (fa > 0) { gl(c, 820, 360, 420 * (0.4 + fa), '#FFE6B0', Math.exp(-fa / 0.35)); gl(c, 820, 360, 160, '#FFFFFF', Math.exp(-fa / 0.15)); }
    c.restore();
    finish(stage, t, {bloom: 0.7, wide: 0.45});
    const wa = t > P.toNight ? smooth((t - P.toNight - 0.3) / 0.3) : 0;
    if (wa > 0) { c.fillStyle = rgba('#04060A', wa); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < P.toSun + 0.8) { nightScene(stage, t, P); return; }
  sunScene(stage, t, P);
}
// night landscape of power and cities (s02)
const CITY = (() => {
  const R = rng(77), pts = [], centers = [[-3, 14, 1.8, 700], [2.5, 22, 1.4, 500], [-1, 30, 2.2, 650], [4, 34, 1.2, 300], [-5, 24, 1.0, 260], [1, 9, 0.8, 200], [-4.5, 38, 1.6, 350]];
  for (const [cx, cz, s, n] of centers) for (let i = 0; i < n; i++) { const r = s * Math.sqrt(-2 * Math.log(R() + 1e-6)) * 0.7, a = R() * TAU; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a), R()]); }
  for (let i = 0; i < 900; i++) { const k = Math.floor(R() * centers.length), j = Math.floor(R() * centers.length), q = R(); const a = centers[k], b = centers[j]; pts.push([lerp(a[0], b[0], q) + (R() - 0.5) * 0.2, lerp(a[1], b[1], q) + (R() - 0.5) * 0.2, R() * 0.6]); }
  return {pts, centers, plant: [6.5, 18]};
})();
function nightScene(stage, t, P) {
  const c = stage.ctx, u = t - P.nightIn;
  bgFill(c, '#03060E', '#0A0D14');
  gl(c, 540, 380, 1200, '#16233F', 0.6);
  const camZ = -6 + u * 1.6, tilt = t > P.toSun ? easeIn((t - P.toSun) / 0.8) : 0;
  const cam = cam3([0.6 - u * 0.12, 7 + tilt * 2, camZ], [1.5, tilt * 16, camZ + 16], {fov: 0.95, cy: 980});
  // sea on the right (east), coastline
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [x, z, b] of CITY.pts) { const p = cam.P([x, 0, z]); if (p[2] < 0.5 || p[0] < -40 || p[0] > W + 40 || p[1] > H) continue; const r = clamp(p[3] * 0.035, 1, 6); c.drawImage(G(b > 0.85 ? '#FFFFFF' : b > 0.4 ? '#FFD08A' : '#FFAA55'), p[0] - r * 3, p[1] - r * 3, r * 6, r * 6); }
  c.restore();
  // plant: two domes with blue glow, power lines pulsing to cities
  const pl = cam.P([CITY.plant[0], 0, CITY.plant[1]]), ps = pl[3] * 0.018;
  if (pl[2] > 0.5) {
    gl(c, pl[0], pl[1], 520 * ps, PAL.cher, 0.75); gl(c, pl[0], pl[1], 160 * ps, '#DFF3FF', 0.7);
    for (const dx of [-0.5, 0.5]) { const d = cam.P([CITY.plant[0] + dx, 0, CITY.plant[1]]); c.fillStyle = '#C8D6E8'; c.beginPath(); c.ellipse(d[0], d[1], 46 * ps, 36 * ps, 0, Math.PI, TAU); c.fill(); }
    for (const [k, cc] of CITY.centers.slice(0, 5).entries()) {
      const a = [CITY.plant[0], 0.3, CITY.plant[1]], b = [cc[0], 0.3, cc[1]], seg = 40;
      c.beginPath(); for (let i = 0; i <= seg; i++) { const q = i / seg, p = cam.P([lerp(a[0], b[0], q), 0.3 + 0.6 * Math.sin(q * Math.PI), lerp(a[2], b[2], q)]); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
      c.strokeStyle = rgba('#8FC8FF', 0.25); c.lineWidth = 2; c.stroke();
      const q = ((t * 0.7 + k * 0.23) % 1), pp = cam.P([lerp(a[0], b[0], q), 0.3 + 0.6 * Math.sin(q * Math.PI), lerp(a[2], b[2], q)]);
      gl(c, pp[0], pp[1], 40, '#BFE6FF', 0.8);
    }
  }
  // dawn as the camera tilts up
  if (tilt > 0) gl(c, 540, 300 + 600 * (1 - tilt), 1300, '#FF8A3A', 0.6 * tilt);
  finish(stage, t, {bloom: 0.55});
  const n = fadeIn(t, P.pct2 - 0.1, 0.4) * fadeOut(t, P.toSun, 0.4);
  big(stage, '31.7%', 540, 560, 210, '#BFE6FF', n);
  label(stage, '2024 · 전기 중 원자력', 540, 690, n, {size: 36, color: PAL.ink});
  const fi = smooth((t - P.nightCut) / 0.5); if (fi < 1) { c.fillStyle = rgba('#04060A', 1 - fi); c.fillRect(0, 0, W, H); }
}
function sunDisk(c, t, cx, cy, R, a = 1) {
  gl(c, cx, cy, R * 3.2, '#FF7A1A', 0.45 * a); gl(c, cx, cy, R * 1.8, '#FFB040', 0.55 * a);
  c.save(); c.globalAlpha = a; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, '#FFD98A'); g.addColorStop(0.55, '#FFA733'); g.addColorStop(0.9, '#E8600E'); g.addColorStop(1, '#A8300A');
  c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  tiled(c, tex('gran'), t * 8, t * 3, R / 300, 0.9, 'multiply', t * 0.01, cx, cy);
  tiled(c, tex('gran'), -t * 6, t * 9, R / 420, 0.5, 'overlay', -t * 0.012, cx, cy);
  const lg = c.createRadialGradient(cx, cy, R * 0.55, cx, cy, R); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(90,20,0,0.55)'); c.fillStyle = lg; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  c.restore();
  // prominences
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * a;
  for (let k = 0; k < 5; k++) { const ang = -2.4 + k * 1.2 + 0.05 * Math.sin(t * 0.5 + k), h = R * (0.12 + 0.06 * Math.sin(t * 0.8 + k * 2)), w = 0.18;
    c.beginPath(); for (let i = 0; i <= 20; i++) { const q = i / 20, aa = ang - w / 2 + w * q, rr = R + h * Math.sin(q * Math.PI); const x = cx + rr * Math.cos(aa), y = cy + rr * Math.sin(aa); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.strokeStyle = 'rgba(255,110,40,0.25)'; c.lineWidth = 26; c.stroke(); c.strokeStyle = 'rgba(255,150,80,0.45)'; c.lineWidth = 9; c.stroke(); }
  c.restore();
}
function sunScene(stage, t, P) {
  const c = stage.ctx, u = t - P.toSun;
  bgSpace(c, t);
  const R = lerp(420, 500, smooth(u / 6)), cy = lerp(1500, 860, easeOut(u / 1.6));
  sunDisk(c, t, 540, cy, R);
  // light leaving: mass → light ribbons
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 14; k++) { const ang = k / 14 * TAU + t * 0.05, q = ((t * 0.5 + k * 0.37) % 1); const r0 = R * 1.05 + q * 600; gl(c, 540 + r0 * Math.cos(ang), cy + r0 * Math.sin(ang), 40, '#FFE6B0', 0.6 * (1 - q)); }
  c.restore();
  finish(stage, t, {bloom: 0.4, wide: 0.35, thr: 3.2});
  const n = fadeIn(t, P.mt3 - 0.15, 0.4) * fadeOut(t, P.end, 0.1);
  big(stage, '400만 톤', 540, cy - 40, 170, '#FFFFFF', n, {shadow: 'rgba(80,20,0,0.95)'});
  label(stage, '1초마다 · 질량 → 빛', 540, cy + 80, n, {size: 40, color: '#FFF1D6', weight: 700});
  const fi = smooth(u / 0.5); if (fi < 1) { c.fillStyle = rgba('#FFF2DC', (1 - fi) * 0.8); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ origin (1938 / 1939 / 1920)
function cellDivide(c, cx, cy, R, q, t) {                                    // translucent cell pinching in two
  const d = R * 0.95 * smooth(q), pinch = smooth(q);
  c.save();
  for (const s of [-1, 1]) {
    const x = cx + s * d * 0.55, r = R * (1 - 0.18 * pinch);
    const g = c.createRadialGradient(x - r * 0.3, cy - r * 0.3, r * 0.1, x, cy, r); g.addColorStop(0, rgba('#9FF3D6', 0.32)); g.addColorStop(0.8, rgba(PAL.cell, 0.16)); g.addColorStop(1, rgba(PAL.cell, 0.55));
    c.beginPath(); c.ellipse(x, cy, r * (1 + 0.15 * (1 - pinch)), r, 0, 0, TAU); c.fillStyle = g; c.fill(); c.strokeStyle = rgba('#B8FFE8', 0.6); c.lineWidth = 3; c.stroke();
    const R2 = rng(s > 0 ? 8 : 9); for (let i = 0; i < 9; i++) circle(c, x + (R2() - 0.5) * r * 1.2, cy + (R2() - 0.5) * r * 1.2, 4 + R2() * 7, rgba('#CFFFF0', 0.35));
    circle(c, x + s * 4, cy - 6, r * 0.28, rgba('#3FA7FF', 0.45)); gl(c, x, cy, r * 0.5, '#7FFFD0', 0.12);
  }
  c.restore();
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl); P._tl = ctx.tl;
  const s5 = ctx.tl.at('s05') - 0.6, s6 = ctx.tl.at('s06') - 0.6;
  if (t < s5) {
    bgLab(c, t);
    big(stage, '1938', 540, 760, 420, '#FFFFFF', 0.07, {shadow: null});
    const z = 1 + 0.08 * smooth((t - ctx.scene.start) / 8); c.save(); zoomAbout(c, 540, 760, z); shake(c, t, P.snap4);
    const u = (t - P.snap4) * 0.12;
    if (u <= 0) {
      const wob = t > P.n4hit ? 0.06 + 0.1 * smooth((t - P.n4hit) / 1.2) : 0;
      fissionDraw(c, 540, 760, 22, t > P.n4hit ? 0.25 * smooth((t - P.n4hit) / 1.5) : 0, -1, t, {yaw: 0.2 + 0.03 * (t - ctx.scene.start), pitch: 0.25, wob, wph: t * 10, glowCol: '#9AB8FF'});
      if (t > P.n4 - 0.2 && t < P.n4hit) { const q = (t - (P.n4 - 0.2)) / (P.n4hit - P.n4 + 0.2); streak(c, [lerp(-80, 330, q) - 120, 760 - 80 + 60 * q], [lerp(-80, 330, q), 760 - 80 + 80 * q], 18, PAL.fisHot, 1); }
    } else {
      fissionDraw(c, 540, 760, 22, 1, u, t, {yaw: 0.2 + 0.03 * (t - ctx.scene.start), pitch: 0.25, glowCol: '#9AB8FF'});
    }
    c.restore();
    finish(stage, t, {bloom: 0.65});
    const la = fadeIn(t, P.snap4 + 0.6, 0.4) * fadeOut(t, s5, 0.3), su = Math.max(0, (t - P.snap4) * 0.12), sep = (2.2 + 26 * su + 4.5) * 22 * (1 + 0.08 * smooth((t - ctx.scene.start) / 8));
    label(stage, '바륨 Ba', clamp(540 - sep, 170, 900), 960, la, {size: 40, weight: 700, color: '#FFD9C8'}); label(stage, '크립톤 Kr', clamp(540 + sep, 170, 900), 560, la, {size: 40, weight: 700, color: '#D6E8FF'});
    label(stage, '우라늄 U', 540, 1050, fadeIn(t, P.u4 - 0.2) * fadeOut(t, P.snap4, 0.3), {size: 40, weight: 700});
    const fi = smooth((t - ctx.scene.start) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < s6) {
    bgLab(c, t);
    gl(c, 540, 520, 600, PAL.cell, 0.12); gl(c, 540, 1080, 600, PAL.fis, 0.15);
    const q = smooth((t - (P.div5 - 0.8)) / 2.2);
    cellDivide(c, 540, 520, 170, q, t);
    fissionDraw(c, 540, 1060, 13, Math.min(1, q * 1.4), q > 0.72 ? (q - 0.72) * 0.5 : -1, t, {yaw: 0.2, pitch: 0.2, glowCol: '#9AB8FF'});
    finish(stage, t, {bloom: 0.55});
    label(stage, '세포 분열', 540, 760, fadeIn(t, P.cell5 - 0.2), {size: 38, color: '#B8FFE8', weight: 700});
    big(stage, 'fission', 540, 840, 92, '#FFFFFF', fadeIn(t, P.name5 - 0.3, 0.4), {role: 'display'});
    label(stage, '핵분열', 540, 1280, fadeIn(t, P.name5), {size: 38, color: '#D6E8FF', weight: 700});
    const fi = smooth((t - s5) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  // 1920 Eddington: 4 protons fuse inside the Sun
  bgSunPlasma(c, t);
  const z = 1 + 0.12 * smooth((t - s6) / 8); c.save(); zoomAbout(c, 540, 820, z);
  const q = smooth((t - (P.h6 - 0.3)) / Math.max(0.4, P.fuse6 - P.h6 + 0.3)), fu = t - P.fuse6;
  if (fu < 0) for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + t * 0.6, r = lerp(360, 60, q); light(c, 'H', 540 + r * Math.cos(a), 820 + r * Math.sin(a) * 0.8, 62, t + k, {glow: 1.4, glowCol: '#FFB070'}); }
  else { light(c, 'He', 540, 820, 62, t, {glow: 1.4, hot: 0.4 * Math.exp(-fu / 0.6)}); gl(c, 540, 820, 700 * (0.4 + fu * 0.6), '#FFE6B0', Math.exp(-fu / 0.5)); gl(c, 540, 820, 200, '#FFFFFF', Math.exp(-fu / 0.2));
    c.save(); c.globalCompositeOperation = 'lighter'; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, r = 120 + fu * 520; gl(c, 540 + r * Math.cos(a), 820 + r * Math.sin(a), 50, '#FFE6B0', 0.7 * Math.exp(-fu / 1.2)); } c.restore(); }
  c.restore();
  finish(stage, t, {bloom: 0.6});
  big(stage, '1920', 540, 470, 150, '#FFFFFF', fadeIn(t, P.y20 - 0.2) * 0.9);
  big(stage, '−0.7%', 540, 1160, 120, PAL.fusHot, fadeIn(t, P.fuse6 + 0.4));
  label(stage, '수소 4개 → 헬륨 1개, 그만큼 가벼워짐', 540, 1260, fadeIn(t, P.fuse6 + 0.6), {size: 34});
  const fi = smooth((t - s6) / 0.4); if (fi < 1) { c.fillStyle = rgba('#FFE6C8', (1 - fi) * 0.7); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ essence: binding + the valley
const O16 = pack(16, 8, 16);
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, vIn = P.split8 - 0.9;
  if (t < vIn) {
    bgFill(c, '#0A0C12', '#030305'); gl(c, 540, 760, 900, '#3A2A50', 0.4); tiled(c, tex('haze'), t * 18, t * 7, 3, 0.07, 'lighter');
    const q = smooth((t - (P.pn7 - 0.3)) / Math.max(1, P.tight7 - P.pn7 + 0.6)), R = rng(4);
    const list = O16.pts.map((n, i) => { const far = [(R() - 0.5) * 30, (R() - 0.5) * 40, (R() - 0.5) * 8]; const p = V.add(V.mul(far, 1 - q), V.mul(n.p, q)); return {p: rotX(rotY(p, t * 0.3), 0.3), proton: n.proton}; });
    const s = 44, cx = 540, cy = 770;
    // bonds (strong force) flicker when close
    if (q > 0.6) { c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const d = Math.hypot(...V.sub(list[i].p, list[j].p)); if (d < 2.3) { const a = (q - 0.6) / 0.4 * 0.5 * (0.6 + 0.4 * Math.sin(t * 13 + i * 3 + j)); c.strokeStyle = rgba('#FFE08A', a); c.lineWidth = 6; c.beginPath(); c.moveTo(cx + list[i].p[0] * s, cy + list[i].p[1] * s); c.lineTo(cx + list[j].p[0] * s, cy + list[j].p[1] * s); c.stroke(); } } c.restore(); }
    drawNucleons(c, list, cx, cy, s, {R: O16.Rb, glow: 0.6 + q, glowCol: '#FFC07A'});
    for (const tb of P.bind7) { const a = t - tb; if (a > 0) gl(c, cx, cy, 500 * (0.5 + a), '#FFE6B0', 0.6 * Math.exp(-a / 0.35)); }
    finish(stage, t, {bloom: 0.6});
    const n = fadeIn(t, P.less7 - 0.2);
    big(stage, '질량 −0.8%', 540, 1180, 110, PAL.fusHot, n);
    label(stage, '산소 16 · 떨어진 핵자 16개보다 가볍다', 540, 1280, n, {size: 34});
    const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  valleyShot(stage, t, P, {from: vIn, glide: true});
}
/** the valley with fusion (left) and fission (right) runs; shared by essence and close */
function valleyShot(stage, t, P, o) {
  const c = stage.ctx, u = t - o.from;
  bgFill(c, '#07080D', '#020203'); gl(c, 200, 300, 900, '#5A3010', 0.35); gl(c, 900, 500, 900, '#10305A', 0.35);
  tiled(c, tex('haze'), t * 12, t * 4, 3.5, 0.06, 'lighter');
  const key = o.glide ? [[o.from, 0, 23, 0], [P.fe9 - 0.6, 0, 23, 0], [P.fe9 + 0.6, 2.8, 16, 0], [P.u9 - 0.3, 2.8, 16, 0], [P.u9 + 0.9, 4.6, 15, 1.5], [P.h9 - 0.4, 4.6, 15, 1.5], [P.h9 + 0.8, -3.4, 15, 5], [o.from + 30, -3.4, 15, 5]] : [[o.from, -0.3, 23.5, 0], [o.from + 30, 0.3, 22.5, 0]];
  let k = 0; while (k + 2 < key.length && t > key[k + 1][0]) k++;
  const q = easeInOut((t - key[k][0]) / Math.max(1e-3, key[k + 1][0] - key[k][0])), tx = lerp(key[k][1], key[k + 1][1], q), dist = lerp(key[k][2], key[k + 1][2], q), side = lerp(key[k][3], key[k + 1][3], q);
  const ty = lerp(VYx(clamp(tx, -5.6, 5.9)) + 1.3, 2.6, smooth((dist - 16) / 6));
  const cam = cam3([tx - 0.6 + side + 0.6 * Math.sin(u * 0.2), ty + 0.6 + dist * 0.3, -dist], [tx, ty, 0.4], {fov: 0.8, cy: 900});
  const vv = valley(stage, cam, t, {iron: 0.8 + 0.2 * Math.sin(t * 2)});
  // fusion runs on the left slope: D + T at the top → He-4 down near A = 4 (repeat)
  const runs = o.runs || [[P.vFuse8, 'fus'], [P.vSplit8, 'fis'], [P.vFuse, 'fus'], [P.vSplit, 'fis'], [P.vF21, 'fus'], [P.vS21, 'fis']];
  for (const [t0, kind] of runs) {
    const a = t - t0; if (a < -0.6 || a > 3.2) continue;
    if (kind === 'fus') {
      const q = clamp(a / 0.9), pD = vv.P(lerp(2, 3.6, q), -0.5), pT = vv.P(lerp(3, 3.7, q), 0.5), sc = clamp(pD[3] / 120, 0.4, 1.6);
      if (a < 0.9) { light(c, 'D', pD[0], pD[1], 24 * sc, t, {glow: 1.3}); light(c, 'T', pT[0], pT[1], 24 * sc, t + 1, {glow: 1.3}); }
      else { const he = vv.P(4, 0, 0.6), drop = clamp((a - 0.9) / 0.5), f = a - 0.9; light(c, 'He', he[0], he[1] - (1 - drop) * 30, 26 * sc, t, {glow: 1.5}); gl(c, he[0], he[1], 600 * sc * (0.4 + f), '#FFE6B0', 0.9 * Math.exp(-f / 0.5)); gl(c, he[0], he[1], 150 * sc, '#FFFFFF', Math.exp(-f / 0.2));
        streak(c, [he[0] + Math.max(0, f - 0.15) * 700, he[1] - Math.max(0, f - 0.15) * 420], [he[0] + f * 700, he[1] - f * 420], 10, PAL.fisHot, Math.exp(-f / 0.9)); }
    } else {
      const pu = vv.P(235, 0), sc = clamp(pu[3] / 120, 0.5, 1.8);
      if (a < 0.6) { c.save(); fissionDraw(c, pu[0], pu[1] - 20, 7 * sc, smooth(a / 0.6), -1, t, {yaw: t * 0.3, pitch: 0.2, wob: 0.05, wph: t * 12}); c.restore(); }
      else { const q = smooth((a - 0.6) / 1.2), pk = vv.P(lerp(235, 92, q), 0.6), pb = vv.P(lerp(235, 141, q), -0.6), fl = a - 0.6;
        nucleus(c, pack(92, 36, 92), pk[0], pk[1], 6 * sc, t, {glowCol: '#7FC0FF'}); nucleus(c, pack(141, 56, 141), pb[0], pb[1], 6.5 * sc, t, {glowCol: '#7FC0FF'});
        gl(c, pu[0], pu[1], 380 * sc * (0.4 + fl), '#BFE6FF', 0.8 * Math.exp(-fl / 0.4)); gl(c, pu[0], pu[1], 100 * sc, '#FFFFFF', Math.exp(-fl / 0.15)); }
    }
  }
  finish(stage, t, {bloom: 0.6, wide: 0.4});
  const la = o.labels ?? 1;
  const ph = vv.P(2, 0, 1.6), pf = vv.fe, pu = vv.P(235, 0, 1.4);
  label(stage, '수소 H', clamp(ph[0], 170, 900), Math.max(360, ph[1] - 40), la * (ph[0] > -50 && ph[0] < W + 50 ? 1 : 0), {size: 38, weight: 700, color: '#FFE0B0'});
  label(stage, '철 Fe', clamp(pf[0], 170, 900), pf[1] + 90, la * fadeIn(t, (P.fe9 ?? 0) - 0.3) * (o.glide ? 1 : 1), {size: 46, weight: 700, color: PAL.iron});
  label(stage, '우라늄 U', clamp(pu[0], 170, 900), Math.max(360, pu[1] - 70), la * (pu[0] > -50 && pu[0] < W + 50 ? 1 : 0), {size: 38, weight: 700, color: '#CFE6FF'});
  if (o.glide) { const fi = smooth(u / 0.5); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); } }
}

// ------------------------------------------------------------------ fission: snap → reactor core → turbine → Cherenkov pool
const RODS = (() => { const r = []; for (let i = -3; i <= 3; i++) for (let j = 0; j <= 3; j++) r.push([i * 0.9, j * 0.9]); return r; })();
const CTRL = [[-2.25, 0.45], [-0.45, 0.45], [1.35, 0.45], [-1.35, 2.25], [0.45, 2.25], [2.25, 2.25]];
function coreView(stage, t, P, u, a = 1) {
  const c = stage.ctx, cam = cam3(orbit(-0.35 + u * 0.04, 0.42, 9.5, [0, 1.6, 1.35]), [0, 1.5, 1.35], {fov: 0.9, cy: 880});
  bgPool(c, t, 0.35 + 0.25 * a, 540, 900);
  const items = [];
  for (const [x, z] of RODS) items.push({z: cam.P([x, 2, z])[2], draw: () => cyl(c, cam, x, z, 0.14, 0, 3.4, '#8EA2B8', 0.85, PAL.cher)});
  const ins = P.rod(t);
  for (const [x, z] of CTRL) items.push({z: cam.P([x, 2, z])[2] - 0.01, draw: () => cyl(c, cam, x, z, 0.12, 3.4 - ins * 3.4, 4.6, '#2A2E36', 1, null)});
  items.sort((p, q) => q.z - p.z).forEach(i => i.draw());
  // neutron generations: each streak lives one generation and ends in a flash (one fission)
  const R = rng(9);
  for (const [gi, g] of P.gens.entries()) {
    const age = t - g.t; if (age < 0 || age > 0.62) continue;
    for (let k = 0; k < g.n; k++) {
      const r1 = RODS[Math.floor(rand2(gi * 31 + k * 7) * RODS.length)], r2 = RODS[Math.floor(rand2(gi * 17 + k * 13 + 5) * RODS.length)];
      const y1 = 0.4 + 2.6 * rand2(gi * 3 + k), y2 = 0.4 + 2.6 * rand2(gi * 5 + k * 11 + 1), q = clamp(age / 0.42);
      const pa = cam.P([r1[0], y1, r1[1]]), pb = cam.P([lerp(r1[0], r2[0], q), lerp(y1, y2, q), lerp(r1[1], r2[1], q)]), pt = cam.P([lerp(r1[0], r2[0], Math.max(0, q - 0.35)), lerp(y1, y2, Math.max(0, q - 0.35)), lerp(r1[1], r2[1], Math.max(0, q - 0.35))]);
      if (age < 0.42) streak(c, [pt[0], pt[1]], [pb[0], pb[1]], 9, PAL.fisHot, 0.95 * a);
      else { const f = age - 0.42; gl(c, pb[0], pb[1], 120 * (0.4 + f * 3), '#FFFFFF', 0.8 * Math.exp(-f / 0.08) * a); gl(c, pb[0], pb[1], 60, PAL.fis, 0.7 * a); }
      void pa; void R;
    }
  }
  return cam;
}
const rand2 = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function cyl(c, cam, x, z, r, y0, y1, col, a = 1, glowCol = null) {
  const b0 = cam.P([x, y0, z]), b1 = cam.P([x, y1, z]); if (b0[2] < 0.2) return;
  const w0 = r * b0[3], w1 = r * b1[3];
  const g = c.createLinearGradient(b0[0] - w0, 0, b0[0] + w0, 0); g.addColorStop(0, mix(col, '#000000', 0.6)); g.addColorStop(0.35, mix(col, '#FFFFFF', 0.25)); g.addColorStop(0.6, col); g.addColorStop(1, mix(col, '#000000', 0.7));
  c.save(); c.globalAlpha = a; c.beginPath(); c.moveTo(b0[0] - w0, b0[1]); c.lineTo(b1[0] - w1, b1[1]); c.lineTo(b1[0] + w1, b1[1]); c.lineTo(b0[0] + w0, b0[1]); c.closePath(); c.fillStyle = g; c.fill();
  c.beginPath(); c.ellipse(b1[0], b1[1], w1, w1 * 0.35, 0, 0, TAU); c.fillStyle = mix(col, '#FFFFFF', 0.2); c.fill(); c.restore();
  if (glowCol) { gl(c, (b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, Math.abs(b0[1] - b1[1]) * 0.45, glowCol, 0.12); }
}
function turbine(c, cx, cy, R, t, a) {
  const ang = t * 9, base = c.globalAlpha * a;
  c.save(); c.globalAlpha = base;
  gl(c, cx, cy, R * 1.8, '#FF9A4A', 0.25 * base);
  for (let m = 0; m < 4; m++) {                                              // motion blur: a few rotated copies
    c.save(); c.globalAlpha = base * (m === 0 ? 0.9 : 0.18); c.translate(cx, cy); c.rotate(ang - m * 0.05);
    for (let k = 0; k < 26; k++) { c.rotate(TAU / 26); const g = c.createLinearGradient(0, R * 0.22, 0, R); g.addColorStop(0, '#5E6672'); g.addColorStop(0.5, '#C9D2DC'); g.addColorStop(1, '#7A8492');
      c.beginPath(); c.moveTo(-R * 0.03, R * 0.22); c.quadraticCurveTo(R * 0.09, R * 0.6, R * 0.05, R); c.lineTo(R * 0.13, R); c.quadraticCurveTo(R * 0.15, R * 0.6, R * 0.05, R * 0.22); c.closePath(); c.fillStyle = g; c.fill(); }
    c.restore();
  }
  const hg = c.createRadialGradient(cx - R * 0.08, cy - R * 0.08, 2, cx, cy, R * 0.24); hg.addColorStop(0, '#E8EEF4'); hg.addColorStop(1, '#4A525C'); circle(c, cx, cy, R * 0.23, hg);
  c.restore();
}
function fissionScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start;
  if (t < P.core[0]) {                                                        // the snap, in declared slow motion
    bgLab(c, t); gl(c, 540, 820, 1100, '#1E4A8A', 0.35);
    const zz = 1 + 0.18 * smooth((t - s0) / (P.core[0] - s0)); c.save(); zoomAbout(c, 540, 800, zz); shake(c, t, P.snap, 9);
    const u = (t - P.snap) * P.slowK;
    if (u <= 0) {
      const ab = t > P.absorb, e = ab ? 0.85 * smooth((t - (P.wob10 - 0.2)) / (P.snap - P.wob10 + 0.2)) : 0, wob = ab ? 0.05 + 0.1 * smooth((t - P.absorb) / 1.2) : 0;
      fissionDraw(c, 540, 800, 27, e, -1, t, {yaw: 0.25 + 0.03 * (t - s0), pitch: 0.25, wob, wph: t * 11, glowCol: '#86B8FF'});
      if (t > P.nIn && t < P.absorb) { const q = (t - P.nIn) / (P.absorb - P.nIn); streak(c, [lerp(-200, 330, q), lerp(300, 650, q)], [lerp(-60, 380, q), lerp(380, 690, q)], 22, PAL.fisHot, 1); }
      if (ab) gl(c, 540, 800, 380, '#9FD0FF', 0.25 * Math.exp(-(t - P.absorb) / 0.4));
    } else fissionDraw(c, 540, 800, 27, 1, u, t, {yaw: 0.25 + 0.03 * (t - s0), pitch: 0.25, glowCol: '#86B8FF'});
    c.restore();
    finish(stage, t, {bloom: 0.7, wide: 0.45});
    big(stage, '235', 760, 520, 110, '#CFE6FF', fadeIn(t, P.u10 - 0.2) * fadeOut(t, P.absorb, 0.4));
    label(stage, '우라늄', 760, 610, fadeIn(t, P.u10 - 0.2) * fadeOut(t, P.absorb, 0.4), {size: 36, weight: 700});
    label(stage, '느린 화면 · 실제로는 아주 짧은 순간', 540, 1270, fadeIn(t, P.wob10 - 0.2) * fadeOut(t, P.core[0] - 0.4), {size: 30, color: PAL.muted});
    const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < P.turbine) {                                                         // reactor core, control rods, k = 1
    const u = t - P.core[0];
    coreView(stage, t, P, u);
    finish(stage, t, {bloom: 0.7, wide: 0.45});
    const k = P.k(t), ka = fadeIn(t, P.core[0] + 0.5);
    big(stage, `k = ${k.toFixed(2)}`, 540, 1180, 120, Math.abs(k - 1) < 0.02 ? '#BFE6FF' : k > 1 ? '#FFB07A' : '#9FB8D8', ka);
    label(stage, Math.abs(k - 1) < 0.02 ? '분열 하나 → 다음 분열 하나' : k > 1 ? '늘어난다' : '줄어든다', 540, 1275, ka, {size: 36, weight: 700});
    label(stage, '제어봉', 860, 430, fadeIn(t, P.rod11 - 0.3) * fadeOut(t, P.turbine - 0.3), {size: 34, color: '#C8CED8', weight: 700});
    const fi = smooth(u / 0.5); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  // turbine → dive into the pool (Cherenkov)
  const d = smooth((t - P.dive) / 1.0);
  bgPool(c, t, 0.3 + 0.9 * d, 540, lerp(1500, 1050, d));
  if (d < 1) {
    c.save(); c.globalAlpha = 1 - d;
    bgFill(c, '#140E0A', '#06080C'); gl(c, 540, 700, 900, '#FF8A3A', 0.25);
    const R = rng(12); c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) { const q = ((t * 0.6 + R()) % 1), y = 700 + (R() - 0.5) * 380, x = lerp(-80, 420, q); gl(c, x, y + Math.sin(q * 6 + i) * 30, 50 + 60 * R(), '#E8EEF4', 0.10 * (1 - q)); }
    c.restore();
    turbine(c, 600, 720, 300, t, 1);
    c.restore();
  }
  if (d > 0) {                                                                 // looking down into the pool
    const cy = lerp(1500, 1050, d), s = lerp(0.6, 1, d);
    c.save(); c.globalAlpha = d;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { if (Math.abs(i) + Math.abs(j) > 4) continue; const x = 540 + i * 62 * s, y = cy + j * 62 * s * 0.6; rect(c, x - 22 * s, y - 14 * s, 44 * s, 28 * s, 4, '#0A2A4A', rgba('#8FD4FF', 0.6), 2); gl(c, x, y, 70 * s, '#BFE6FF', 0.35 + 0.1 * Math.sin(t * 3 + i + j)); }
    c.save(); c.globalCompositeOperation = 'lighter';                        // god rays
    for (let k = 0; k < 18; k++) { const a = -Math.PI / 2 + (k - 9) * 0.12 + 0.03 * Math.sin(t + k); const g = c.createLinearGradient(540, cy, 540 + Math.cos(a) * 1400, cy + Math.sin(a) * 1400); g.addColorStop(0, 'rgba(120,190,255,0.22)'); g.addColorStop(1, 'rgba(120,190,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(540, cy); c.lineTo(540 + Math.cos(a - 0.03) * 1500, cy + Math.sin(a - 0.03) * 1500); c.lineTo(540 + Math.cos(a + 0.03) * 1500, cy + Math.sin(a + 0.03) * 1500); c.closePath(); c.fill(); }
    c.restore();
    const R = rng(21); for (let i = 0; i < 90; i++) { const sp = 0.3 + 0.7 * R(), q = ((t * 0.25 * sp + R()) % 1), x = 540 + (R() - 0.5) * 520 * (0.4 + q), y = cy - q * 1100, r = 3 + 7 * R();
      c.strokeStyle = rgba('#CFEFFF', 0.45 * (1 - q)); c.lineWidth = 2; c.beginPath(); c.arc(x + Math.sin(t * 3 + i) * 8, y, r, 0, TAU); c.stroke(); circle(c, x - r * 0.3 + Math.sin(t * 3 + i) * 8, y - r * 0.3, r * 0.3, rgba('#FFFFFF', 0.5 * (1 - q))); }
    c.restore();
  }
  finish(stage, t, {bloom: 0.75, wide: 0.5, thr: 2.0});
  label(stage, '증기 → 터빈', 540, 1150, fadeIn(t, P.turb12 - 0.2) * (1 - d), {size: 38, weight: 700});
  big(stage, '체렌코프 빛', 540, 520, 96, '#DFF3FF', fadeIn(t, P.blue12 - 0.2, 0.5) * fadeOut(t, ctx.scene.end - 0.4));
  label(stage, '물속 빛보다 빠른 전자가 내는 푸른 빛', 540, 620, fadeIn(t, P.blue12 + 0.3, 0.5) * fadeOut(t, ctx.scene.end - 0.4), {size: 32});
}

// ------------------------------------------------------------------ fusion: Coulomb wall → tokamak → KSTAR
function tokamak(stage, t, cam, o = {}) {
  const c = stage.ctx, R0 = 1, a = 0.32, kap = 1.35, A = o.plasma ?? 1, wob = o.wob || 0;
  const pt = (phi, th, r) => [(R0 + r * Math.cos(th)) * Math.cos(phi), r * Math.sin(th) * kap, (R0 + r * Math.cos(th)) * Math.sin(phi)];
  const coil = (phi, front) => { const pts = []; for (let i = 0; i <= 48; i++) { const th = i / 48 * TAU; const p = [(R0 + 0.5 * Math.cos(th)) * Math.cos(phi), 0.72 * Math.sin(th), (R0 + 0.5 * Math.cos(th)) * Math.sin(phi)]; pts.push(cam.P(p)); }
    const zc = cam.P(pt(phi, 0, 0))[2], isFront = zc < cam.P([0, 0, 0])[2]; if (isFront !== front) return;
    const w = clamp(0.032 * pts[0][3], 3, 22);
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineJoin = 'round';
    c.strokeStyle = front ? 'rgba(92,64,46,0.62)' : 'rgba(70,50,38,0.9)'; c.lineWidth = w; c.stroke();
    c.strokeStyle = front ? 'rgba(230,170,120,0.28)' : 'rgba(200,140,100,0.22)'; c.lineWidth = w * 0.28; c.stroke(); };
  const vessel = front => { for (let k = 0; k < 24; k++) { const phi = k / 24 * TAU, zc = cam.P(pt(phi, 0, 0))[2], isFront = zc < cam.P([0, 0, 0])[2]; if (isFront !== front) continue;
      c.beginPath(); for (let i = 0; i <= 36; i++) { const p = cam.P(pt(phi, i / 36 * TAU, 0.42)); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.strokeStyle = rgba('#9FB0C4', front ? 0.22 : 0.12); c.lineWidth = 2; c.stroke(); }
    for (const th of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { c.beginPath(); let first = true; for (let i = 0; i <= 96; i++) { const phi = i / 96 * TAU, p = cam.P(pt(phi, th, 0.42)), fr = cam.P(pt(phi, 0, 0))[2] < cam.P([0, 0, 0])[2]; if (fr !== front) { first = true; continue; } first ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); first = false; } c.strokeStyle = rgba('#9FB0C4', front ? 0.3 : 0.15); c.lineWidth = 2.5; c.stroke(); } };
  for (let k = 0; k < 12; k++) coil(k / 12 * TAU + 0.13, false);
  vessel(false);
  // plasma: particles streaming along helical field lines
  if (A > 0.003) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 160; k++) { const phi = k / 160 * TAU, p = cam.P(pt(phi, 0, 0)); if (p[2] > 0.1) { gl(c, p[0], p[1], 0.3 * p[3], PAL.plasma, 0.07 * A); gl(c, p[0], p[1], 0.12 * p[3], '#FFE0F0', 0.06 * A); } }
    const R = rng(33), N = o.n ?? 900;
    for (let i = 0; i < N; i++) {
      const r = a * Math.sqrt(R()) * (1 + wob * 0.6 * Math.sin(t * 9 + i)), phi0 = R() * TAU, th0 = R() * TAU, q = 1 + 2 * (r / a) ** 2, v = 0.9 + 0.3 * R();
      const phi = phi0 + t * v * (o.speed ?? 0.55), th = th0 + t * v / q * 2.2 + wob * Math.sin(phi * 3 + t * 6), p = cam.P(pt(phi, th, r));
      if (p[2] < 0.1) continue;
      const hot = 1 - r / a, sz = clamp(p[3] * (0.028 + 0.034 * hot), 4, 34), col = hot > 0.6 ? '#FFE0F0' : hot > 0.3 ? PAL.plasma : PAL.plasma2;
      c.globalAlpha = clamp(A * (0.3 + 0.38 * hot)); c.drawImage(G(col), p[0] - sz, p[1] - sz, 2 * sz, 2 * sz);
    }
    c.restore();
    const cc = cam.P([0, 0, 0]); gl(c, cc[0], cc[1], 480, PAL.plasma, 0.12 * A);
  }
  // helical field lines (a few)
  for (let L = 0; L < 5; L++) { c.beginPath(); let first = true; for (let i = 0; i <= 600; i++) { const phi = i / 600 * TAU * 3 + L * 0.4 + t * 0.3, th = phi / 3 * 1 + L * 1.25, p = cam.P(pt(phi, th, 0.36)); if (p[2] < 0.1) { first = true; continue; } first ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); first = false; }
    c.strokeStyle = rgba('#7FE8FF', 0.22 * (o.field ?? 1)); c.lineWidth = 2; c.stroke(); }
  vessel(true);
  for (let k = 0; k < 12; k++) coil(k / 12 * TAU + 0.13, true);
}
function fusionScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, tokIn = P.donut14 - 0.6;
  if (t < tokIn) {
    bgPlasma(c, t);
    const T = lerp(1e7, 1.05e8, smooth((t - P.heat[0]) / (P.heat[1] - P.heat[0])));
    // attempt 1 (cold): approach, slow down, bounce; attempt 2 (hot): collide and fuse
    const z = 1 + 0.1 * smooth((t - s0) / 6); c.save(); zoomAbout(c, 540, 800, z); shake(c, t, P.fuse13, 6);
    const tb = P.bounce13, a1 = t - (tb - 1.0);
    const arcs = g => { if (g > 260) return; const k = (260 - g) / 260; c.save(); c.globalCompositeOperation = 'lighter';
      for (let j = -3; j <= 3; j++) { c.beginPath(); c.moveTo(540 - g + 40, 800 + j * 22); c.quadraticCurveTo(540, 800 + j * 22 + j * 60 * (0.6 + k), 540 + g - 40, 800 + j * 22); c.strokeStyle = rgba('#FF9AD0', 0.22 * k); c.lineWidth = 3; c.stroke(); }
      gl(c, 540, 800, 160 + 120 * k, '#FF7FC0', 0.25 * k); c.restore(); };
    if (t < P.fuse13 - 1.1) {
      const g = a1 < 1.0 ? lerp(330, 120, easeOut(a1 / 1.0)) : lerp(120, 300, easeIn(clamp((a1 - 1.0) / 1.2)));
      arcs(g); light(c, 'D', 540 - g, 800, 58, t, {glow: 1.3}); light(c, 'T', 540 + g, 800, 58, t + 1, {glow: 1.3});
    } else {
      const a2 = t - (P.fuse13 - 1.1);
      if (a2 < 1.1) { const g = lerp(300, 55, easeIn(a2 / 1.1)); arcs(g); light(c, 'D', 540 - g, 800, 58, t, {glow: 1.6}); light(c, 'T', 540 + g, 800, 58, t + 1, {glow: 1.6}); for (let k = 1; k < 6; k++) { gl(c, 540 - g - k * 46, 800, 40, '#FFC0E0', 0.3 / k); gl(c, 540 + g + k * 46, 800, 40, '#FFC0E0', 0.3 / k); } }
      else { const f = a2 - 1.1; light(c, 'He', 540 - f * 90, 800 - f * 40, 60, t, {glow: 1.8, hot: 0.6 * Math.exp(-f / 0.6)}); gl(c, 540, 800, 900 * (0.3 + f), '#FFE6B0', Math.exp(-f / 0.45)); gl(c, 540, 800, 240, '#FFFFFF', Math.exp(-f / 0.15));
        streak(c, [540 + Math.max(0, f - 0.12) * 1100, 800 + Math.max(0, f - 0.12) * 430], [540 + f * 1100, 800 + f * 430], 18, PAL.fisHot, Math.exp(-f / 2)); }
    }
    c.restore();
    finish(stage, t, {bloom: 0.7, wide: 0.45});
    const ta = fadeIn(t, P.heat[0] - 0.2, 0.3);
    big(stage, T >= 1e8 ? '1억 °C' : `${(Math.round(T / 1e6) * 100).toLocaleString('en-US')}만 °C`, 540, 470, 150, T >= 1e8 ? '#FFFFFF' : '#FFC6E2', ta);
    label(stage, '같은 전기끼리 밀어냄', 540, 1080, fadeIn(t, P.push13 - 0.1) * fadeOut(t, P.heat[0] + 0.6), {size: 36, weight: 700});
    label(stage, '중수소 + 삼중수소 → 헬륨 + 중성자', 540, 1080, fadeIn(t, P.fuse13 + 0.3) * fadeOut(t, tokIn - 0.2), {size: 34, weight: 700});
    const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  const u = t - tokIn;
  bgFill(c, '#07050C', '#020104'); gl(c, 540, 860, 1300, '#3A1A50', 0.45); tiled(c, tex('haze'), t * 10, t * 5, 3.5, 0.06, 'lighter');
  const cam = cam3(orbit(0.3 + u * 0.09, lerp(0.8, 0.5, smooth(u / 5)), lerp(6.0, 4.7, smooth(u / 8))), [0, -0.05, 0], {fov: 0.95, cy: 800});
  tokamak(stage, t, cam, {plasma: smooth(u / 0.8), field: fadeIn(t, P.mag14 - 0.2)});
  finish(stage, t, {bloom: 0.8, wide: 0.5, thr: 2.0});
  label(stage, '플라스마 · 벽에 닿지 않게', 540, 1250, fadeIn(t, P.wall14 - 0.2) * fadeOut(t, P.kstar15 - 0.6), {size: 36, weight: 700});
  const ka = fadeIn(t, P.deg15 - 0.2, 0.4);
  big(stage, '1억 °C', 330, 1250, 108, '#FFE6F2', ka);
  const sec = clamp((t - P.timer[0]) / (P.timer[1] - P.timer[0])) * 48;
  if (t > P.timer[0] - 0.3) {
    const tx = 800, ty = 1250, r = 88, a2 = fadeIn(t, P.timer[0] - 0.3);
    withAlpha(c, a2, () => { c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 10; c.beginPath(); c.arc(tx, ty, r, 0, TAU); c.stroke(); c.strokeStyle = PAL.plasma; c.lineCap = 'round'; c.beginPath(); c.arc(tx, ty, r, -Math.PI / 2, -Math.PI / 2 + TAU * sec / 48); c.stroke(); });
    big(stage, `${Math.floor(sec)}초`, tx, ty, 64, '#FFFFFF', a2);
  }
}
const bumpQ = q => Math.sin(clamp(q) * Math.PI);

// ------------------------------------------------------------------ compare: ×4 columns, what remains, ITER
function compareScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, s17 = ctx.tl.at('s17') - 0.6, s18 = ctx.tl.at('s18') - 0.6;
  if (t < s17) {
    bgFill(c, '#08090D', '#020203'); gl(c, 300, 1250, 700, '#1E4A8A', 0.35); gl(c, 780, 1250, 700, '#8A4A10', 0.35);
    const g = smooth((t - P.cols) / 2.2), fb = 1300, h1 = 230 * g, h4 = 920 * smooth((t - P.cols) / 2.6);
    // pellets
    for (const [x, col] of [[300, PAL.fis], [780, PAL.fus]]) { rect(c, x - 60, fb - 20, 120, 50, 8, '#2A2E36', rgba(col, 0.8), 2); gl(c, x, fb, 160, col, 0.4); }
    const col = (x, h, cA, cB) => { if (h <= 0) return; c.save(); c.globalCompositeOperation = 'lighter'; const gr = c.createLinearGradient(0, fb, 0, fb - h); gr.addColorStop(0, rgba(cA, 0.9)); gr.addColorStop(1, rgba(cB, 0.15)); c.fillStyle = gr; c.fillRect(x - 70, fb - h, 140, h);
      const gr2 = c.createLinearGradient(x - 120, 0, x + 120, 0); gr2.addColorStop(0, 'rgba(0,0,0,0)'); gr2.addColorStop(0.5, rgba(cB, 0.25)); gr2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr2; c.fillRect(x - 120, fb - h, 240, h); c.restore(); gl(c, x, fb - h, 160, '#FFFFFF', 0.6); };
    col(300, h1, '#8FD4FF', PAL.fis); col(780, h4, '#FFE6B0', PAL.fus);
    for (let k = 1; k <= 3; k++) if (h4 > 230 * k) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.setLineDash([10, 10]); c.beginPath(); c.moveTo(690, fb - 230 * k); c.lineTo(870, fb - 230 * k); c.stroke(); c.setLineDash([]); }
    finish(stage, t, {bloom: 0.65});
    label(stage, '핵분열', 300, fb + 70, fadeIn(t, s0), {size: 38, weight: 700, color: '#CFE6FF'}); label(stage, '핵융합', 780, fb + 70, fadeIn(t, s0), {size: 38, weight: 700, color: '#FFE0B0'});
    big(stage, '× 4', 300, 620, 160, PAL.fusHot, fadeIn(t, P.x4in, 0.4));
    const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < s18) {
    bgFill(c, '#08090D', '#020203'); gl(c, 280, 900, 650, '#2A5A3A', 0.3); gl(c, 800, 700, 650, '#7A5A20', 0.25);
    // left: long-lived fission waste glowing on and off in a canister
    const cx = 290, cy = 880; rect(c, cx - 190, cy - 300, 380, 600, 30, '#1A1E24', rgba('#8FA0B0', 0.5), 3);
    const R = rng(55); for (let i = 0; i < 26; i++) { const x = cx + (R() - 0.5) * 290, y = cy + (R() - 0.5) * 500, n = R() > 0.5 ? pack(92, 36, 92) : pack(141, 56, 141), on = 0.5 + 0.5 * Math.sin(t * (0.6 + R()) + i * 2);
      nucleus(c, n, x, y, 2.4, t + i, {glow: 0.3}); gl(c, x, y, 80, '#C8FF8A', 0.3 * on); }
    // right: helium nuclei rising away
    for (let i = 0; i < 9; i++) { const ph = (t * 0.18 + i / 9) % 1, x = 790 + Math.sin(i * 2.3 + t) * 110, y = 1250 - ph * 950; light(c, 'He', x, y, 32, t + i, {glow: 1.2, alpha: 1 - smooth((ph - 0.75) / 0.25)}); }
    finish(stage, t, {bloom: 0.6});
    label(stage, '오래 남는 방사성 폐기물', 280, 1290, fadeIn(t, P.long17 - 0.2), {size: 32, weight: 700, color: '#D8FFB8'});
    label(stage, '헬륨', 800, 1290, fadeIn(t, P.he17 - 0.2), {size: 40, weight: 700, color: '#FFE0B0'});
    const fi = smooth((t - s17) / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  // ITER: a big tokamak (dim, not yet burning) and the schedule
  const u = t - s18;
  bgFill(c, '#06080C', '#020203'); gl(c, 540, 820, 1200, '#2A3A5A', 0.4);
  const cam = cam3(orbit(-0.5 + u * 0.05, 0.62, 5.6), [0, -0.05, 0], {fov: 0.95, cy: 760});
  tokamak(stage, t, cam, {plasma: 0.25 + 0.15 * Math.sin(t * 1.3), field: 0.7, n: 600});
  finish(stage, t, {bloom: 0.6});
  big(stage, '2034', 300, 1210, 116, '#FFFFFF', fadeIn(t, P.yrs - 0.3)); label(stage, '연구 운전 시작', 300, 1300, fadeIn(t, P.yrs - 0.1), {size: 34, weight: 700});
  big(stage, '2039', 780, 1210, 116, PAL.fusHot, fadeIn(t, P.yrs + 0.5)); label(stage, '중수소·삼중수소', 780, 1300, fadeIn(t, P.yrs + 0.7), {size: 34, weight: 700});
  const fi = smooth(u / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ myth: confinement lost → plasma cools and stops
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), u = t - ctx.scene.start;
  bgFill(c, '#07050C', '#020104'); gl(c, 540, 860, 1200, '#3A1A50', 0.4 * P.plasmaA(t) + 0.1);
  const cam = cam3(orbit(0.9 + u * 0.06, 0.55, lerp(5.2, 4.4, smooth(u / 12))), [0, -0.05, 0], {fov: 0.95, cy: 800});
  const wob = t > P.wobble ? smooth((t - P.wobble) / 0.6) : 0;
  tokamak(stage, t, cam, {plasma: P.plasmaA(t), wob, field: 1});
  if (t > P.wobble && t < P.dead) { const R = rng(Math.floor(t * 20)); for (let i = 0; i < 6; i++) { const ang = R() * TAU, p = cam.P([1.35 * Math.cos(ang), (R() - 0.5) * 0.4, 1.35 * Math.sin(ang)]); gl(c, p[0], p[1], 40, '#FFD0A0', 0.6 * P.plasmaA(t)); } }
  finish(stage, t, {bloom: 0.75, wide: 0.45});
  big(stage, '연료 1 g 미만', 540, 1210, 100, '#FFFFFF', fadeIn(t, P.gram20 - 0.2));
  label(stage, '식으면 반응이 바로 멈춘다', 540, 1300, fadeIn(t, P.cool20), {size: 36, weight: 700, color: '#FFD8EE'});
  const fi = smooth(u / 0.4); if (fi < 1) { c.fillStyle = rgba('#000', 1 - fi); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ close: valley, then the poster returns
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.poster + 0.5) valleyShot(stage, t, P, {from: ctx.scene.start, wide: true, runs: [[P.vF21, 'fus'], [P.vS21, 'fis']], labels: fadeOut(t, P.poster - 0.3, 0.3)});
  if (t >= P.poster) { const a = smooth((t - P.poster) / 0.6); c.save(); c.globalAlpha = a; posterPicture(stage, t, P, 0.12 + 0.02 * Math.sin(t)); c.restore(); if (a >= 1) finish(stage, t, {bloom: 0.7, wide: 0.45}); }
}

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58, dur = 0.6) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur, harmonics: [1, 0.35], attack: 0.006, decay: dur * 0.33, release: dur * 0.33, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: dur * 0.5, low: 30, high: 200, release: dur * 0.35, gain_db: -9}}]}, means});
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const hum = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * smooth((tt - t0) / 0.4) * (1 - smooth((tt - (t1 - 0.5)) / 0.5))), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 35, high: o.high ?? 140, fade: 0.05, points: Q}, means}); };
  // hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 막 갈라진 우라늄 원자핵과 합쳐지는 중수소·삼중수소', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  thump('split_hook', MORPH[0], '포스터의 분열이 이어짐: 조각이 날아감 (분열: 낮은 쿵)', -31, 62, 0.6);
  swell('fuse_hook', P.fuseHook, [131, 196], '위쪽에서 중수소와 삼중수소가 합쳐지는 섬광 (융합: 따뜻한 화음)', {dur: 1.2, gain: -32});
  whoosh('to_night', P.toNight, 0.8, 90, 220, '밤의 땅으로 빠르게 넘어감', -34);
  hum('grid', P.nightIn, P.toSun + 0.6, () => 0.5, -40, '밤의 도시와 발전소: 송전선을 따라 흐르는 빛 (아주 낮은 웅웅)', {low: 40, high: 120});
  tick('pct', P.pct2, 131, -33, '"31.7%" (2024 · 전기 중 원자력)', {decay: 0.14});
  swell('sunrise', P.toSun, [98, 147], '하늘로 고개를 들어 태양으로', {dur: 1.8, gain: -32});
  tick('mt', P.mt3, 110, -33, '"400만 톤 · 1초마다 질량 → 빛"', {decay: 0.16});
  // origin
  tick('y1938', P.y38, 123, -34, '"1938" (한 · 슈트라스만)', {decay: 0.14});
  whoosh('n_in4', P.n4 - 0.2, P.n4hit - P.n4 + 0.2, 120, 300, '중성자가 날아와 우라늄에 부딪힘', -34);
  thump('snap4', P.snap4, '우라늄이 둘로 갈라짐 → 바륨 · 크립톤 (분열: 낮은 쿵)', -30, 62, 0.6);
  tick('cell', P.cell5, 165, -35, '세포가 둘로 나뉨', {decay: 0.12});
  tick('fission_word', P.name5, 131, -34, '"fission" (분열)', {decay: 0.14});
  tick('y1920', P.y20, 147, -34, '"1920" (에딩턴)', {decay: 0.14});
  swell('he6', P.fuse6, [131, 196, 262], '수소 원자핵 넷이 헬륨 하나로 합쳐지며 빛 (융합: 따뜻한 화음)', {dur: 1.6, gain: -31});
  // essence
  ticks('bind', P.bind7, [98, 110, 131], -33, '핵자들이 강한 힘으로 묶일 때의 섬광 (세 번)', {decay: 0.14});
  tick('mass', P.less7, 82, -34, '"질량 −0.8%"', {decay: 0.18});
  const vr = [[P.vFuse8, 'fus'], [P.vSplit8, 'fis'], [P.vFuse, 'fus'], [P.vSplit, 'fis'], [P.vF21, 'fus'], [P.vS21, 'fis']];
  for (const [k, [t0, kind]] of vr.entries()) {
    if (kind === 'fus') chirp(`valley_fus${k}`, t0 + 0.6, t0 + 1.6, tt => lerp(330, 110, smooth((tt - t0 - 0.6) / 0.9)), () => 0.35, -34, '골짜기 왼쪽: 중수소 + 삼중수소가 합쳐져 헬륨으로 크게 내려감 → 높이만큼 크게 내려가는 음 (330 → 110 Hz)');
    else chirp(`valley_fis${k}`, t0 + 0.55, t0 + 1.5, tt => lerp(196, 147, smooth((tt - t0 - 0.55) / 0.9)), () => 0.35, -34, '골짜기 오른쪽: 우라늄이 쪼개져 조금 내려감 → 조금만 내려가는 음 (196 → 147 Hz, 약 4분의 1)');
  }
  tick('iron', P.fe9, 98, -33, '"철 Fe" — 골짜기 바닥', {decay: 0.2});
  // fission
  whoosh('n_in10', P.nIn, P.absorb - P.nIn, 120, 320, '중성자가 날아옴', -34);
  tick('absorb', P.absorb, 147, -33, '우라늄 235가 중성자를 삼킴', {decay: 0.1});
  chirp('wobble', P.absorb + 0.05, P.snap - 0.05, tt => 70 + 10 * Math.sin((tt - P.absorb) * 11), tt => 0.3 * smooth((tt - P.absorb) / 1.0), -34, '원자핵이 출렁임 (낮은 떨림)');
  thump('snap', P.snap, '둘로 갈라짐 (분열: 낮은 쿵, 화면이 살짝 흔들림)', -28, 55, 0.8);
  whoosh('neutrons_out', P.snap + 0.1, 1.2, 300, 120, '새 중성자 셋이 튀어나감', -35);
  hum('reactor', P.core[0], P.dive + 0.5, () => 0.55, -38, '원자로 노심: 낮은 웅웅', {low: 40, high: 130});
  ticks('chain', P.splitT, P.splitT.map(() => 110), -38, `중성자 한 세대마다 분열의 틱 (${P.splitT.length}번): 제어봉이 내려와 k = 1이 되면 일정한 박자`, {decay: 0.07});
  tick('rods', P.rodsDown, 82, -33, '제어봉이 내려옴', {decay: 0.2});
  whoosh('steam', P.turbine, 2.0, 100, 260, '증기가 터빈을 돌림', -36);
  swell('cherenkov', P.blue12 - 0.1, [73, 110, 147], '물속 노심의 푸른 체렌코프 빛', {dur: 2.2, gain: -32});
  // fusion
  ev.push({id: 'bounce', at: r(P.bounce13 + 0.0, 4), kind: 'custom', params: {gain_db: -30, layers: [{kind: 'tone', offset: 0, params: {freq: 70, dur: 0.22, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}]}, means: '차가울 때: 밀어내는 힘에 튕겨 나감 (둔한 툭)'});
  chirp('temp', P.heat[0], P.heat[1] + 0.3, tt => 70 + 26 * Math.log10(lerp(1e7, 1.05e8, smooth((tt - P.heat[0]) / (P.heat[1] - P.heat[0]))) / 1e6), () => 0.3, -36, '온도가 1천만 → 1억 °C: 로그 온도 → 음높이');
  swell('fuse13', P.fuse13, [65, 98, 131], '중수소 + 삼중수소 → 헬륨 + 중성자 (융합: 낮고 큰 부풂)', {dur: 1.8, attack: 0.05, gain: -29});
  swell('tokamak', P.donut14 - 0.6, [82, 123], '토카막이 나타남', {dur: 1.6, gain: -34});
  chirp('plasma', P.donut14, P.timer[1] + 0.5, () => 98, tt => 0.25 + 0.05 * Math.sin((tt - P.donut14) * 2.4), -38, '플라스마가 고리 속을 돎 → 낮고 고른 맥동');
  ticks('timer', [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => P.timer[0] + k * (P.timer[1] - P.timer[0]) / 8), 131, -38, '48초 시계가 돎 (6초마다 틱)', {decay: 0.06});
  // compare
  swell('cols', P.cols, [98, 147], '같은 무게의 두 연료에서 빛 기둥이 솟음', {dur: 2.2, gain: -33});
  tick('x4', P.x4in, 131, -32, '"× 4"', {decay: 0.18});
  tick('waste', P.waste, 82, -35, '오래 남는 폐기물 (느린 깜빡임)', {decay: 0.25});
  tick('helium', P.heUp, 196, -35, '헬륨이 떠오름', {decay: 0.1});
  swell('iter', P.iterIn, [82, 123], 'ITER', {dur: 1.6, gain: -34});
  ticks('years', [P.yrs - 0.3, P.yrs + 0.5], [131, 165], -34, '"2034" · "2039"', {decay: 0.14});
  // myth
  chirp('myth_plasma', tl.scene('myth').start, P.dead, () => 98, tt => 0.3 * P.plasmaA(tt), -36, '고리 속 플라스마의 낮은 맥동 → 식으면서 사라짐');
  chirp('cooling', P.cool, P.cool + 1.4, tt => lerp(98, 49, smooth((tt - P.cool) / 1.4)), tt => 0.35 * (1 - smooth((tt - P.cool) / 1.4)), -34, '가둠이 흐트러져 플라스마가 식음 → 음이 내려가며 꺼짐 (폭발 없음)');
  tick('gram', P.gram20, 131, -34, '"연료 1 g 미만"', {decay: 0.14});
  // close
  swell('poster_back', P.poster, [73, 110, 147], '첫 화면의 포스터가 돌아옴', {dur: 1.8, gain: -32});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/fission-fusion/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 분열 → 낮은 쿵(55~62 Hz), 융합 → 따뜻한 화음 부풂, 중성자 → 지나가는 바람 소리, 원자로 연쇄 → 세대마다 틱(k = 1이면 일정한 박자), 골짜기 → 내려간 높이만큼 내려가는 음(융합 크게, 분열 조금), 온도 → 음높이(로그), 토카막 → 낮은 맥동, 식음 → 음이 내려가며 꺼짐. 모든 음은 700 Hz 아래. 패닝 없음(모노 안전). 타임라인이 바뀌면 다시 실행하세요.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; snap ${P.snap.toFixed(2)} s, fuse13 ${P.fuse13.toFixed(2)} s, gens ${P.gens.length}, poster ${P.poster.toFixed(2)} s`);
}
