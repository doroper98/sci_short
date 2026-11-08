// Episode scenes — "핵분열과 핵융합 — 쪼개도 합쳐도 에너지가 나오는 까닭" (29)
// Shape: export {theme, scenes, overlays, background, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Visual direction (2026-11-07 remake, docs/ANIMATION_QUALITY.md "시리즈 화풍은 지킨다"): the series' diagram style —
// dark graphite background, thin precise lines, small glowing dots, flat matte nucleon balls (no specular, no bloom),
// graphs with axes; one warm accent (fusion) and one cool secondary (fission). Dynamics come from frame-filling
// diagrams, camera moves, an event every 2–4 s (white flash + thin shock rings) and big numbers.
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Nuclei: nucleons are shaded spheres packed in a ball of radius (A/0.6)^(1/3) nucleon radii (random close packing,
//    relaxed with a short repulsion pass; seeded). Colours: proton warm orange, neutron grey (matte). Explanatory drawing —
//    nucleons are not marbles.
//  - Fission (설명 모형, liquid drop): U-236* wobbles (quadrupole), stretches into a peanut, the neck snaps; fragments
//    Ba-141 (56 p) + Kr-92 (36 p) + 3 neutrons fly apart. Real time scale ≲ 10⁻¹⁴ s; shown in declared slow motion.
//  - Valley: binding energy per nucleon B/A (measured, MeV): H-1 0, H-2 1.112, H-3 2.827, He-4 7.074, C-12 7.680,
//    O-16 7.976, Ne-20 8.032, Mg-24 8.261, Si-28 8.448, S-32 8.493, Ca-40 8.551, Ti-48 8.723, Fe-56 8.790, Ni-62 8.795,
//    Kr-84 8.717, Mo-98 8.635, Sn-120 8.505, Ba-138 8.393, Gd-158 8.202, W-184 8.005, Pb-208 7.868, U-235 7.591,
//    U-238 7.570 (upper envelope of stable nuclei on the light side). Drawn as a 2D line graph upside down (iron at the
//    bottom): y = B/A downward, x = log₁₀A; measured points shown as dots. Fusion D+T: 17.6 MeV / 5 = 3.5 MeV per nucleon; fission U-235: ≈ 200 MeV / 236 ≈ 0.85 → ×4 per mass.
//  - Reactor (설명 모형): neutron population with multiplication factor k set by control-rod depth; k = 1 keeps the
//    number of streaks steady. Cherenkov glow: real (water, electrons faster than light in water ≈ 0.75 c).
//  - Fusion: Coulomb repulsion sketched as a hill graph (U ∝ 1/r, capped at contact); a cold pair turns back, at 1억 °C a D–T pair fuses → He-4 + n (17.6 MeV).
//  - Tokamak (설명 모형): torus R0 = 1, plasma minor radius 0.32, elongation 1.35; helical field lines drawn at the plasma
//    edge with q = 3; plasma particles stream along the field, dθ/dφ = 1/q(r), q(r) = 1 + 2(r/a)². Not KSTAR's or ITER's real geometry.
//  - Numbers on screen: 31.7 % (2024 Korea, 산업통상자원부), 400만 톤/초 (solar luminosity / c² ≈ 4.26 Mt/s), 1938, 1939,
//    1920, −0.7 % (He-4 vs 4 H), ×4, 1억 °C · 48초 (KSTAR, announced 2024), 2034 / 2039 (ITER 2024 baseline), 1 g 미만.
//  - Sound: node episodes/fission-fusion/scenes.mjs --emit-sound writes sound.json from the same plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, glow, withAlpha, rect, TAU, rng, loadTimeline} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
export const theme = {base: 'graphite', accent: '#FFB547'};
export const captionLayout = {};
const W = 1080, H = 1920;

// =====================================================================================================
// Palette and helpers
// =====================================================================================================
export const PAL = {p: '#C98A55', pL: '#F6DABA', pS: '#3A2414', n: '#8E979E', nL: '#E6EBEE', nS: '#1D2226', fus: '#FFB547', fusHot: '#FFD9A0',
  fis: '#86D0FF', fisHot: '#E8F6FF', cher: '#6FC0FF', plasma: '#FFC46A', iron: '#FFD27A', ink: '#F1EDE6', muted: '#A09A90', grid: '#3A3B3F',
  line: '#D8D2C8', answer: '#FFB547', cell: '#A9CDBB', land: '#7E7A73', city: '#FFD9A0'};
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

// ---- sprites: matte nucleon balls (series style: soft shading like episode 20, thin outline, no specular) ----
const SPR = {};
function ballSprite(col, lightC, shade, r = 30) {
  const cv = createCanvas(2 * r + 6, 2 * r + 6), c = cv.getContext('2d'), x = r + 3;
  const g = c.createRadialGradient(x - r * 0.35, x - r * 0.4, r * 0.04, x, x, r);
  g.addColorStop(0, lightC); g.addColorStop(0.3, col); g.addColorStop(0.75, col); g.addColorStop(1, shade);
  c.fillStyle = g; c.beginPath(); c.arc(x, x, r, 0, TAU); c.fill();
  return cv;
}
function glowSprite(col, size = 128) {
  const cv = createCanvas(size, size), c = cv.getContext('2d'), r = size / 2, g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.18, rgba(col, 0.55)); g.addColorStop(0.45, rgba(col, 0.16)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
}
const G = col => (SPR['g' + col] ||= glowSprite(col));
const ball = proton => (proton ? (SPR.p ||= ballSprite(PAL.p, PAL.pL, PAL.pS)) : (SPR.n ||= ballSprite(PAL.n, PAL.nL, PAL.nS)));
function gl(c, x, y, r, col, a = 1) { if (a <= 0 || r <= 0) return; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, a); c.drawImage(G(col), x - r, y - r, 2 * r, 2 * r); c.restore(); }
/** thin glowing ring (shock ring) */
function ringFx(c, x, y, r, col, a, w = 2.5) {
  if (a <= 0.01 || r <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(x, y, r, 0, TAU);
  c.strokeStyle = rgba(col, a * 0.22); c.lineWidth = w * 4; c.stroke(); c.strokeStyle = rgba(col, a); c.lineWidth = w; c.stroke(); c.restore();
}
/** an event: white flash + two expanding thin shock rings (age in screen seconds) */
function burst(c, x, y, age, R, col = PAL.fusHot, k = 1) {
  if (age < 0 || age > 2.6) return;
  gl(c, x, y, R * 0.5 * (0.6 + age), '#FFFFFF', 0.8 * k * Math.exp(-age / 0.12)); gl(c, x, y, R * (0.45 + age * 0.8), col, 0.35 * k * Math.exp(-age / 0.35));
  ringFx(c, x, y, R * (0.2 + 1.6 * easeOut(age / 1.3)), col, 0.8 * k * Math.exp(-age / 0.6));
  if (age > 0.18) ringFx(c, x, y, R * (0.15 + 1.1 * easeOut((age - 0.18) / 1.3)), '#FFFFFF', 0.45 * k * Math.exp(-(age - 0.18) / 0.5), 1.5);
}
function finish() {}                                                         // series style: no screen-space bloom
// ---- text helpers ----
function big(stage, s, x, y, size, col, a = 1, o = {}) {
  if (a <= 0) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: 'display', weight: 700, size, color: col, align: o.align || 'center', tracking: -0.02 * size, shadow: 'rgba(0,0,0,0.8)', shadowBlur: 18, ...o}));
}
function label(stage, s, x, y, a = 1, o = {}) {
  if (a <= 0) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: o.role || 'body', weight: o.weight ?? 700, size: Math.max(30, o.size || 32), color: o.color || PAL.ink, align: o.align || 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 12}));
}
// ---- series background ----
function seriesBg(c, tint = '#3A3026', a = 0.12, cx = 540, cy = 760) {
  const g = c.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, '#121315'); g.addColorStop(1, '#060607'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (a > 0) glow(c, cx, cy, 950, tint, a);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.42, H * 0.8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const DUST = (() => { const R = rng(17), d = []; for (let i = 0; i < 90; i++) d.push([R() * W, R() * H, 0.6 + 1.4 * R() ** 2, 0.06 + 0.18 * R() ** 2, R() * TAU]); return d; })();
function dust(c, t, col = '#D8D2C8', k = 1) { for (const [x, y, r, a, ph] of DUST) circle(c, (x + t * 4 * Math.sin(ph)) % W, (y - t * 6 * (0.3 + r * 0.3) + H) % H, r, rgba(col, a * k)); }
function grid(c, x0, y0, x1, y1, step, a = 0.35) {
  c.save(); c.strokeStyle = rgba(PAL.grid, a); c.lineWidth = 1;
  for (let x = x0; x <= x1; x += step) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
  for (let y = y0; y <= y1; y += step) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
  c.restore();
}
const rand2 = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

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
/** draw nucleons (array of {p:[x,y,z] (screen-aligned after transforms), proton}) at cx, cy with px per unit; depth by size/brightness only */
function drawNucleons(c, list, cx, cy, s, o = {}) {
  const arr = list.map(q => ({...q, z: q.p[2]})).sort((a, b) => a.z - b.z), a0 = o.alpha ?? 1;
  if (a0 <= 0) return;
  if (o.under !== false) gl(c, cx, cy, s * (o.R || 6) * 1.6, o.glowCol || PAL.fus, 0.12 * a0 * (o.glow ?? 1));
  let zmin = Infinity, zmax = -Infinity; for (const q of arr) { zmin = Math.min(zmin, q.z); zmax = Math.max(zmax, q.z); }
  c.save();
  for (const q of arr) {
    const k = 1 + q.z * 0.012, r = s * k, x = cx + q.p[0] * s * k, y = cy + q.p[1] * s * k, d = zmax > zmin ? (q.z - zmin) / (zmax - zmin) : 1;
    c.globalAlpha = a0 * (0.78 + 0.22 * d);
    c.drawImage(ball(q.proton), x - r * 1.1, y - r * 1.1, 2.2 * r, 2.2 * r);
  }
  c.restore();
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
/** draw the fission event (series style); o.age = screen seconds since scission for the flash/rings */
function fissionDraw(c, cx, cy, s, e, u, t, o = {}) {
  const yaw = o.yaw ?? 0.3, pitch = o.pitch ?? 0.25;
  const list = fissionNucleons(e, u, yaw, pitch, o.wob || 0, o.wph || 0);
  drawNucleons(c, list, cx, cy, s, {R: FIS.n.Rb * (1 + e * 0.6), glow: o.glow ?? 1, glowCol: o.glowCol || PAL.fus, alpha: o.alpha});
  if (u > 0) {
    burst(c, cx, cy, o.age ?? u * 3, s * (o.ringR ?? 12), PAL.fusHot, o.flashK ?? 1);
    const at = d => FIS.dirs.map(v => { const p = rotX(rotY(V.mul(v, d), yaw), pitch); return [cx + p[0] * s, cy + p[1] * s]; });
    const hd = 1.5 + 60 * u, pos = at(hd), tail = at(Math.max(1.2, hd - (o.trail ?? 4)));
    pos.forEach((p, k) => { trail(c, tail[k], p, o.alpha ?? 1, Math.max(2, s * 0.09)); neutronDot(c, p[0], p[1], Math.max(4, s * 0.24), o.alpha ?? 1); });
    return pos;
  }
  return [];
}
/** a free neutron: small cool light (as in episode 20) */
function neutronDot(c, x, y, r = 5, a = 1) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  glow(c, x, y, r * 4.2, PAL.fis, 0.5 * a); circle(c, x, y, r, rgba(PAL.fis, 0.9 * a)); circle(c, x, y, r * 0.5, rgba(PAL.fisHot, a));
  c.restore();
}
/** light trail from a to b (head at b): faint wide stroke + thin bright stroke, brighter toward the head */
function trail(c, a, b, alpha = 1, w = 2, col = PAL.fis) {
  if (alpha <= 0.003) return; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  const grad = k => { const g = c.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, k * alpha)); return g; };
  for (const [ww, k] of [[w * 4, 0.1], [w * 2, 0.25], [w, 0.95]]) { c.strokeStyle = grad(k); c.lineWidth = ww; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  c.restore();
}
/** moving particle = short trail + dot */
function streak(c, a, b, r, col = PAL.fis, alpha = 1) { trail(c, a, b, alpha, Math.max(1.5, r * 0.22), col); if (col === PAL.fis || col === PAL.fisHot) neutronDot(c, b[0], b[1], Math.max(3, r * 0.4), alpha); else { gl(c, b[0], b[1], r * 1.4, col, 0.6 * alpha); circle(c, b[0], b[1], Math.max(2.5, r * 0.35), rgba('#FFFFFF', 0.9 * alpha)); } }
/** small light nucleus (D, T, He-4) drawn from explicit nucleon offsets */
const LIGHT = {
  H: [{p: [0, 0, 0], proton: true}],
  D: [{p: [-0.9, 0, 0], proton: true}, {p: [0.9, 0.1, 0.2], proton: false}],
  T: [{p: [-0.9, 0.4, 0], proton: true}, {p: [0.9, 0.4, 0.2], proton: false}, {p: [0, -0.9, -0.3], proton: false}],
  He: [{p: [-0.85, 0.5, 0.3], proton: true}, {p: [0.85, 0.5, -0.3], proton: false}, {p: [0.85, -0.6, 0.35], proton: true}, {p: [-0.85, -0.6, -0.35], proton: false}],
};
function light(c, kind, x, y, s, t, o = {}) {
  const yaw = (o.yaw ?? 0) + t * (o.spin ?? 1.2);
  drawNucleons(c, LIGHT[kind].map(q => ({p: rotX(rotY(q.p, yaw), 0.4), proton: q.proton})), x, y, s, {R: 1.6, glow: o.glow ?? 1.2, glowCol: o.glowCol || PAL.fus, alpha: o.alpha});
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
// ---- binding-energy valley as a 2D line graph (x = log₁₀A, y = B/A downward: iron at the bottom) ----
const GX = A => 150 + Math.log10(A) / Math.log10(240) * 800;            // base layout (px, before the camera)
const GY = b => 360 + b * 98;                                            // 0 MeV → 360, 8.8 MeV → 1222
const BA_PTS = [[2, 1.112, '수소', PAL.fus], [3, 2.827], [4, 7.074], [12, 7.680], [16, 7.976], [28, 8.448], [40, 8.551], [56, 8.790, '철', PAL.iron], [62, 8.795], [92, 8.51], [141, 8.33], [208, 7.868], [235, 7.591, '우라늄', PAL.fis]];
const vCam = (cam, x, y) => [540 + (x - cam.fx) * cam.z, 860 + (y - cam.fy) * cam.z];
function valleyCam(t, P, o) {
  const u = t - o.from;
  const key = o.glide ? [[o.from, 560, 800, 1], [P.fe9 - 0.6, 560, 800, 1], [P.fe9 + 0.6, GX(56), GY(7.2), 1.45], [P.u9 - 0.3, GX(56), GY(7.3), 1.5], [P.u9 + 0.9, GX(150), GY(8.0), 2.0], [P.h9 - 0.4, GX(150), GY(8.0), 2.0], [P.h9 + 0.8, GX(7), GY(5.4), 1.15], [o.from + 30, GX(7.5), GY(5.5), 1.18]]
    : [[o.from, 560, 790, 1.04], [o.from + 30, 540, 820, 0.98]];
  let k = 0; while (k + 2 < key.length && t > key[k + 1][0]) k++;
  const q = easeInOut((t - key[k][0]) / Math.max(1e-3, key[k + 1][0] - key[k][0]));
  return {fx: lerp(key[k][1], key[k + 1][1], q) + 6 * Math.sin(u * 0.4), fy: lerp(key[k][2], key[k + 1][2], q) + 5 * Math.cos(u * 0.33), z: lerp(key[k][3], key[k + 1][3], q)};
}
/** curve point at mass number A (screen) */
const vAt = (cam, A, lift = 0) => { const p = vCam(cam, GX(A), GY(baCurve(Math.log10(A)))); return [p[0], p[1] - lift * cam.z]; };
function valleyGraph(stage, t, P, o) {
  const c = stage.ctx, cam = valleyCam(t, P, o), z = cam.z, la = o.labels ?? 1;
  seriesBg(c, '#2A2A30', 0.1); dust(c, t, '#D8D2C8', 0.6);
  c.save(); c.beginPath(); c.rect(0, 318, W, 1000); c.clip();                  // the graph stays between the header and the captions
  // grid and axes
  c.save(); c.lineWidth = 1;
  for (const b of [0, 2, 4, 6, 8]) { const [x0, y] = vCam(cam, GX(1) - 30, GY(b)), [x1] = vCam(cam, GX(240) + 20, GY(b)); c.strokeStyle = rgba(PAL.grid, 0.7); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
  for (const A of [1, 10, 100]) { const [x, y0] = vCam(cam, GX(A), GY(-0.2)), [, y1] = vCam(cam, GX(A), GY(9.2)); c.strokeStyle = rgba(PAL.grid, 0.5); c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
  const [ax, ay0] = vCam(cam, GX(1) - 30, GY(-0.3)), [, ay1] = vCam(cam, GX(1) - 30, GY(9.3)), [bx1] = vCam(cam, GX(240) + 30, GY(9.3));
  c.strokeStyle = rgba(PAL.line, 0.7); c.lineWidth = 2; c.beginPath(); c.moveTo(ax, ay0); c.lineTo(ax, ay1); c.lineTo(bx1, ay1); c.stroke();
  c.restore();
  // the measured curve: warm on the light side, cool on the heavy side
  const seg = (A0, A1, col) => { c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i <= 120; i++) { const A = 10 ** lerp(Math.log10(A0), Math.log10(A1), i / 120), p = vCam(cam, GX(A), GY(baCurve(Math.log10(A)))); i ? c.lineTo(...p) : c.moveTo(...p); }
    c.strokeStyle = rgba(col, 0.16); c.lineWidth = 10; c.stroke(); c.strokeStyle = rgba(col, 0.95); c.lineWidth = 3; c.stroke(); c.restore(); };
  seg(1, 56, PAL.fus); seg(56, 240, PAL.fis);
  for (const [A, b, nm, col] of BA_PTS) { const [x, y] = vCam(cam, GX(A), GY(b)); circle(c, x, y, nm ? 7 : 5, rgba(nm ? col : PAL.line, nm ? 1 : 0.75)); if (nm) gl(c, x, y, 26, col, 0.5); }
  const fe = vCam(cam, GX(56), GY(8.79)), pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  gl(c, fe[0], fe[1], 70 * Math.sqrt(z), PAL.iron, 0.55 + 0.2 * pulse); ringFx(c, fe[0], fe[1], (24 + 10 * pulse) * Math.sqrt(z), PAL.iron, 0.5);
  // runs: fusion (D + T → He-4 down the left slope), fission (U → Kr + Ba down the right slope)
  const runs = o.runs || [[P.vFuse8, 'fus'], [P.vSplit8, 'fis'], [P.vFuse, 'fus'], [P.vSplit, 'fis'], [P.vF21, 'fus'], [P.vS21, 'fis']];
  const s = 17 * Math.sqrt(z);
  for (const [t0, kind] of runs) {
    const a = t - t0; if (a < -0.8 || a > 3.4) continue;
    if (kind === 'fus') {
      const q = easeIn(clamp(a / 0.9));
      if (a < 0.9) { const pD = vAt(cam, lerp(2, 3.85, q), 26), pT = vAt(cam, lerp(3, 4.15, q), 26);
        light(c, 'D', pD[0] - 14, pD[1], s, t, {glow: 1}); light(c, 'T', pT[0] + 14, pT[1], s, t + 1, {glow: 1});
        const top = vCam(cam, GX(2.5), GY(2.14)), bot = vCam(cam, GX(2.5), GY(5.66)); dashedDrop(c, top, bot, smooth(a / 0.4) * 0.8, PAL.fus); }
      else { const f = a - 0.9, he = vAt(cam, 4, 26); light(c, 'He', he[0], he[1], s * 1.05, t, {glow: 1.4}); burst(c, he[0], he[1], f, 95 * Math.sqrt(z) * 1.0, PAL.fusHot);
        const top = vCam(cam, GX(2.5), GY(2.14)), bot = vCam(cam, GX(2.5), GY(5.66)); dashedDrop(c, top, bot, 0.8 * (1 - smooth((f - 1.2) / 0.6)), PAL.fus);
        streak(c, [he[0] - 40 + f * 300, he[1] - 30 - f * 160], [he[0] + f * 380, he[1] - f * 210], 12, PAL.fis, Math.exp(-f / 1.2)); }
    } else {
      const pu = vAt(cam, 235, 40);
      if (a < 0.7) { nucleus(c, pack(235, 92, 7), pu[0], pu[1], 5.2 * Math.sqrt(z), t, {wob: 0.08 * smooth(a / 0.5), wph: t * 12, glow: 0.7}); }
      else { const q = smooth((a - 0.7) / 1.3), pk = vAt(cam, lerp(235, 92, q), 34), pb = vAt(cam, lerp(235, 141, q), 38);
        nucleus(c, pack(92, 36, 92), pk[0], pk[1], 4.8 * Math.sqrt(z), t, {glow: 0.6}); nucleus(c, pack(141, 56, 141), pb[0], pb[1], 4.9 * Math.sqrt(z), t, {glow: 0.6});
        burst(c, pu[0], pu[1], a - 0.7, 34 * Math.sqrt(z), PAL.fisHot);
        const top = vCam(cam, GX(200), GY(7.59)), bot = vCam(cam, GX(200), GY(8.42)); dashedDrop(c, top, bot, 0.8 * smooth((a - 0.7) / 0.4) * (1 - smooth((a - 2.6) / 0.6)), PAL.fis); }
    }
  }
  c.restore();
  // labels (≤ 4): axis + named points that are on screen
  if (la > 0) {
    const yl = vCam(cam, GX(240) + 20, GY(0.5)); label(stage, '↓ 더 단단히 묶임', clamp(yl[0], 420, 1040), clamp(yl[1], 340, 1250), la * 0.95, {size: 30, align: 'right', color: PAL.muted});
    for (const [A, b, nm, col] of BA_PTS) { if (!nm) continue; const [x, y] = vCam(cam, GX(A), GY(b)); if (x < 120 || x > 960 || y < 320 || y > 1300) continue; label(stage, nm, clamp(nm === '수소' ? x + 70 : x, 170, 930), nm === '수소' ? y + 12 : nm === '철' ? y - 52 : y + 54, la, {size: nm === '철' ? 40 : 34, color: col}); }
  }
}
function dashedDrop(c, a, b, alpha, col) {
  if (alpha <= 0.01) return; c.save(); c.strokeStyle = rgba(col, alpha); c.lineWidth = 2.5; c.setLineDash([10, 8]); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]);
  c.fillStyle = rgba(col, alpha); c.beginPath(); c.moveTo(b[0], b[1] + 4); c.lineTo(b[0] - 10, b[1] - 14); c.lineTo(b[0] + 10, b[1] - 14); c.closePath(); c.fill(); c.restore();
}
// ---- night map of Korea (Natural Earth 1:110m coastline, thin line) ----
const COAST = [[130.94, 42.55], [130.78, 42.22], [130.4, 42.28], [129.97, 41.94], [129.67, 41.6], [129.7, 40.88], [129.19, 40.66], [129.01, 40.48], [128.63, 40.19], [127.97, 40.03], [127.53, 39.76], [127.5, 39.32], [127.39, 39.21], [127.79, 39.05], [128.35, 38.61], [129.21, 37.43], [129.46, 36.78], [129.47, 35.63], [129.09, 35.08], [128.18, 34.89], [127.39, 34.48], [126.49, 34.39], [126.37, 34.93], [126.56, 35.68], [126.12, 36.73], [126.86, 36.89], [126.18, 37.75], [125.69, 37.94], [125.57, 37.75], [125.28, 37.67], [125.24, 37.86], [124.98, 37.95], [124.71, 38.11], [124.99, 38.55], [125.22, 38.67], [125.13, 38.85], [125.39, 39.39], [125.32, 39.55], [124.74, 39.66], [124.26, 39.93]];
const CITIES = [[37.57, 126.98, 1.0], [37.46, 126.70, 0.45], [37.26, 127.03, 0.4], [36.35, 127.38, 0.35], [35.87, 128.60, 0.5], [35.18, 129.08, 0.65], [35.54, 129.31, 0.3], [35.16, 126.85, 0.35], [35.23, 128.68, 0.25], [36.64, 127.49, 0.2], [35.82, 127.15, 0.2], [36.02, 129.34, 0.18], [37.75, 128.88, 0.12], [37.34, 127.92, 0.12], [33.5, 126.53, 0.15]];
const PLANTS = [[35.32, 129.29], [35.71, 129.48], [37.09, 129.38], [35.41, 126.42]];
const CITYDOTS = (() => { const R = rng(77), d = []; for (const [la, lo, w] of CITIES) { const n = Math.round(30 + 260 * w); for (let i = 0; i < n; i++) { const r = Math.sqrt(-2 * Math.log(R() + 1e-6)) * 0.07 * Math.sqrt(w) * 1.4, a = R() * TAU; d.push([la + r * Math.sin(a), lo + r * Math.cos(a) / 0.8, R()]); } } return d; })();

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
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g2 = c.createLinearGradient(0, 960, 0, 1300); g2.addColorStop(0, 'rgba(6,6,7,0)'); g2.addColorStop(0.3, 'rgba(6,6,7,0.6)'); g2.addColorStop(0.75, 'rgba(6,6,7,0.6)'); g2.addColorStop(1, 'rgba(6,6,7,0)'); c.fillStyle = g2; c.fillRect(0, 960, 1080, 340); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)', wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 22, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 22, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', tracking: tr * s2, shadow: sh, shadowBlur: 28});
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1290, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = g; c.fillRect(0, 1290, W, 630); }
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
function posterPicture(stage, t, P, u, age = 0.16) {                        // the thumbnail composition (also the close bookend)
  const c = stage.ctx;
  seriesBg(c, '#3A2A1E', 0.16, 540, 700); dust(c, t);
  const fa = P && t < P.end - 3 ? t - P.fuseHook : -1;                        // fusion pair, upper right
  gl(c, 810, 340, 170, PAL.fus, 0.22);
  if (fa < 0) { const k = t > MORPH[0] ? smooth((t - MORPH[0]) / Math.max(0.3, P.fuseHook - MORPH[0])) : 0; light(c, 'D', 755 + 28 * k, 350 - 6 * k, 30, t, {glow: 1}); light(c, 'T', 865 - 28 * k, 330 + 6 * k, 30, t + 1, {glow: 1}); }
  else { light(c, 'He', 810 + fa * 50, 338 - fa * 40, 30, t, {glow: 1.2, alpha: 1 - smooth((fa - 0.8) / 1.0)}); burst(c, 810, 340, fa, 190, PAL.fusHot); streak(c, [810 + Math.max(0, fa - 0.25) * 520, 340 + Math.max(0, fa - 0.25) * 180], [810 + fa * 520, 340 + fa * 180], 14, PAL.fis, Math.exp(-fa / 1.5)); }
  fissionDraw(c, 520, 690, 34, 1, u, t, {yaw: 0.35, pitch: 0.22, age, ringR: 13});
  if (age < 0.6) gl(c, 520, 690, 120, '#FFFFFF', 0.45 * (1 - age / 0.6));
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.toNight + 0.6) {
    const u = t < MORPH[0] ? 0.12 : 0.12 + (t - MORPH[0]) * 0.1, age = t < MORPH[0] ? 0.16 : 0.16 + (t - MORPH[0]);
    c.save(); zoomAbout(c, 540, 700, 1 + 0.05 * smooth((t - 1) / 6) + (t > P.toNight ? 0.6 * easeIn((t - P.toNight) / 0.6) : 0));
    posterPicture(stage, t, P, u, age);
    const act2 = P.fuseHook + 0.1;
    if (t > act2) {
      const na = smooth((t - act2) / 0.6), gp = lerp(150, 46, smooth((t - act2 - 0.5) / 3.2));
      nucleus(c, pack(235, 92, 7), 390, 900, 24 * (0.85 + 0.15 * na), t, {pitch: 0.3, jit: 0.05, alpha: na, wob: 0.05, wph: t * 8});
      withAlpha(c, na, () => { light(c, 'D', 760 - gp, 560, 42, t); light(c, 'T', 760 + gp, 560, 42, t + 1); });
      label(stage, '쪼개기', 390, 1140, na * fadeOut(t, P.toNight, 0.3), {size: 40, color: PAL.fis});
      label(stage, '합치기', 760, 740, na * fadeOut(t, P.toNight, 0.3), {size: 40, color: PAL.fus});
    }
    c.restore();
    const wa = t > P.toNight ? smooth((t - P.toNight - 0.3) / 0.3) : 0;
    if (wa > 0) { c.fillStyle = rgba('#060607', wa); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < P.toSun + 0.8) { nightScene(stage, t, P); return; }
  sunScene(stage, t, P);
}
function nightScene(stage, t, P) {
  const c = stage.ctx, u = t - P.nightCut, z = 1 + 0.07 * smooth(u / 6), tilt = t > P.toSun ? easeIn((t - P.toSun) / 0.8) : 0;
  seriesBg(c, '#1E2A3A', 0.12, 540, 900); dust(c, t, '#C8D4E8', 0.5);
  const pr = (la, lo) => [540 + (lo - 127.9) * 0.8 * 290 * z, 1000 - (la - 36.0) * 290 * z + tilt * 1100];
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  for (let i = 1; i < COAST.length; i++) { const a = pr(COAST[i - 1][1], COAST[i - 1][0]), b = pr(COAST[i][1], COAST[i][0]), f = smooth(((a[1] + b[1]) / 2 - 330) / 260);
    if (f <= 0) continue; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.strokeStyle = rgba(PAL.land, 0.25 * f); c.lineWidth = 7; c.stroke(); c.strokeStyle = rgba('#B8B2A8', 0.85 * f); c.lineWidth = 2; c.stroke(); }
  c.restore();
  for (const [la, lo, w] of CITIES) { const [x, y] = pr(la, lo); gl(c, x, y, 40 + 90 * w, PAL.city, 0.18 + 0.2 * w); }
  for (const [la, lo, b] of CITYDOTS) { const [x, y] = pr(la, lo); if (y < -20 || y > H + 20) continue; circle(c, x, y, 1.3 + 1.5 * b, rgba(b > 0.7 ? '#FFF1D6' : PAL.city, 0.45 + 0.45 * b)); }
  // plants and power lines (pulses of light travel to the cities)
  const hubs = [[37.57, 126.98], [35.18, 129.08], [35.87, 128.60], [36.35, 127.38], [35.16, 126.85]];
  PLANTS.forEach(([la, lo], k) => {
    const p = pr(la, lo), pulse = 0.5 + 0.5 * Math.sin(t * 3 + k);
    for (const [hla, hlo] of hubs) { const h = pr(hla, hlo), mx = (p[0] + h[0]) / 2, my = (p[1] + h[1]) / 2 - 40;
      c.strokeStyle = rgba(PAL.fis, 0.22); c.lineWidth = 1.5; c.beginPath(); c.moveTo(...p); c.quadraticCurveTo(mx, my, ...h); c.stroke();
      const q = ((t * 0.45 + k * 0.17 + hla * 0.03) % 1), x = (1 - q) ** 2 * p[0] + 2 * (1 - q) * q * mx + q * q * h[0], y = (1 - q) ** 2 * p[1] + 2 * (1 - q) * q * my + q * q * h[1]; neutronDot(c, x, y, 3.2, 0.8); }
    gl(c, p[0], p[1], 46, PAL.fis, 0.6); circle(c, p[0], p[1], 7, PAL.fisHot); ringFx(c, p[0], p[1], 16 + 10 * pulse, PAL.fis, 0.6, 2);
  });
  if (tilt > 0) gl(c, 540, 200 + 300 * (1 - tilt), 900, PAL.fus, 0.22 * tilt);
  const n = fadeIn(t, P.pct2 - 0.1, 0.4) * fadeOut(t, P.toSun, 0.4);
  big(stage, '31.7%', 540, 430, 200, '#DDF0FF', n); label(stage, '2024 · 전기 중 원자력', 540, 545, n, {size: 36});
  label(stage, '원자력 발전소', 880, 1130 + tilt * 1100, fadeIn(t, P.plant2 - 0.2) * (1 - tilt), {size: 32, color: PAL.fis});
  const fi = smooth((t - P.nightCut) / 0.5); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
}
const SUNDOTS = (() => { const R = rng(23), d = []; for (let y = -1; y <= 1; y += 0.04) for (let x = -1; x <= 1; x += 0.04) { const xx = x + (R() - 0.5) * 0.034, yy = y + (R() - 0.5) * 0.034; if (xx * xx + yy * yy < 0.985) d.push([xx, yy, R()]); } return d; })();
function sunDisk(c, t, cx, cy, R, a = 1) {
  gl(c, cx, cy, R * 2.0, PAL.fus, 0.22 * a); gl(c, cx, cy, R * 1.25, '#FF9A3A', 0.18 * a);
  c.save(); c.globalAlpha = a; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = rgba('#3A2210', 0.9); c.fill(); c.restore();
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [x, y, ph] of SUNDOTS) { const d = Math.hypot(x, y), boil = 0.5 + 0.5 * Math.sin(t * (1.1 + ph) + ph * 20), b = (1 - 0.65 * d * d) * (0.35 + 0.65 * boil);
    c.globalAlpha = a * b * 0.8; c.fillStyle = b > 0.75 ? PAL.fusHot : PAL.fus; c.beginPath(); c.arc(cx + x * R, cy + y * R, 1.4 + 2.8 * b * (0.6 + 0.4 * ph), 0, TAU); c.fill(); }
  c.restore();
  ringFx(c, cx, cy, R, PAL.fus, 0.8 * a, 3); ringFx(c, cx, cy, R * 1.06, PAL.fus, 0.25 * a, 1.5);
  c.save(); c.globalAlpha = 0.6 * a; c.strokeStyle = PAL.fus; c.lineWidth = 2;
  for (let k = 0; k < 5; k++) { const ang = -2.4 + k * 1.2 + 0.05 * Math.sin(t * 0.5 + k), h = R * (0.1 + 0.05 * Math.sin(t * 0.8 + k * 2)), w = 0.16;
    c.beginPath(); for (let i = 0; i <= 24; i++) { const q = i / 24, aa = ang - w / 2 + w * q, rr = R + h * Math.sin(q * Math.PI); const x = cx + rr * Math.cos(aa), y = cy + rr * Math.sin(aa); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  c.restore();
}
function sunScene(stage, t, P) {
  const c = stage.ctx, u = t - P.toSun;
  seriesBg(c, '#3A2A1E', 0.1); dust(c, t);
  const R = lerp(380, 420, smooth(u / 6)), cy = lerp(1500, 880, easeOut(u / 1.4));
  sunDisk(c, t, 540, cy, R);
  for (let k = 0; k < 20; k++) { const ang = k / 20 * TAU + 0.1, q = ((t * 0.45 + k * 0.37) % 1), r0 = R * 1.08 + q * 520, r1 = r0 + 60;
    trail(c, [540 + r0 * Math.cos(ang), cy + r0 * Math.sin(ang)], [540 + r1 * Math.cos(ang), cy + r1 * Math.sin(ang)], 0.8 * (1 - q), 2, PAL.fusHot); }
  const n = fadeIn(t, P.mt3 - 0.15, 0.4);
  big(stage, '400만 톤', 540, cy - 30, 160, '#FFFFFF', n); label(stage, '1초마다 · 질량 → 빛', 540, cy + 90, n, {size: 38, color: PAL.fusHot});
  const fi = smooth(u / 0.5); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ origin (1938 / 1939 / 1920)
function cellDivide(c, cx, cy, R, q, t) {                                    // line drawing of a cell pinching in two
  const d = R * 0.95 * smooth(q), pinch = smooth(q);
  for (const s of [-1, 1]) {
    const x = cx + s * d * 0.55, r = R * (1 - 0.18 * pinch);
    c.beginPath(); c.ellipse(x, cy, r * (1 + 0.15 * (1 - pinch)), r, 0, 0, TAU); c.fillStyle = rgba(PAL.cell, 0.06); c.fill(); c.strokeStyle = rgba(PAL.cell, 0.9); c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.arc(x + s * 4, cy - 6, r * 0.28, 0, TAU); c.strokeStyle = rgba(PAL.cell, 0.7); c.lineWidth = 2; c.stroke();
    const R2 = rng(s > 0 ? 8 : 9); for (let i = 0; i < 10; i++) circle(c, x + (R2() - 0.5) * r * 1.2, cy + (R2() - 0.5) * r * 1.2, 2.5 + R2() * 3, rgba(PAL.cell, 0.6));
  }
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl); P._tl = ctx.tl;
  const s5 = ctx.tl.at('s05') - 0.6, s6 = ctx.tl.at('s06') - 0.6;
  if (t < s5) {
    seriesBg(c, '#2A3240', 0.12, 540, 760); dust(c, t);
    big(stage, '1938', 540, 760, 400, '#FFFFFF', 0.06, {shadow: null});
    const z = 1 + 0.08 * smooth((t - ctx.scene.start) / 8); c.save(); zoomAbout(c, 540, 760, z); shake(c, t, P.snap4, 5);
    const u = (t - P.snap4) * 0.12, yaw = 0.2 + 0.03 * (t - ctx.scene.start);
    if (u <= 0) {
      const wob = t > P.n4hit ? 0.06 + 0.1 * smooth((t - P.n4hit) / 1.2) : 0;
      fissionDraw(c, 540, 760, 22, t > P.n4hit ? 0.25 * smooth((t - P.n4hit) / 1.5) : 0, -1, t, {yaw, pitch: 0.25, wob, wph: t * 10});
      if (t > P.n4 - 0.2 && t < P.n4hit) { const q = (t - (P.n4 - 0.2)) / (P.n4hit - P.n4 + 0.2), hx = lerp(-60, 330, q), hy = lerp(620, 735, q); streak(c, [hx - 110, hy - 32], [hx, hy], 18); }
    } else fissionDraw(c, 540, 760, 22, 1, u, t, {yaw, pitch: 0.25, age: t - P.snap4});
    c.restore();
    const la = fadeIn(t, P.snap4 + 0.6, 0.4) * fadeOut(t, s5, 0.3), su = Math.max(0, (t - P.snap4) * 0.12), sep = (2.2 + 26 * su + 4.5) * 22 * (1 + 0.08 * smooth((t - ctx.scene.start) / 8));
    label(stage, '바륨 Ba', clamp(540 - sep, 170, 900), 960, la, {size: 40, color: '#F6DABA'}); label(stage, '크립톤 Kr', clamp(540 + sep, 170, 900), 560, la, {size: 40, color: '#E6EBEE'});
    label(stage, '우라늄 U', 540, 1050, fadeIn(t, P.u4 - 0.2) * fadeOut(t, P.snap4, 0.3), {size: 40});
    const fi = smooth((t - ctx.scene.start) / 0.4); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < s6) {
    seriesBg(c, '#24302C', 0.12, 540, 800); dust(c, t);
    const q = smooth((t - (P.div5 - 0.8)) / 2.2);
    c.save(); zoomAbout(c, 540, 800, 1 + 0.05 * smooth((t - s5) / 6));
    cellDivide(c, 540, 520, 180, q, t);
    fissionDraw(c, 540, 1070, 14, Math.min(1, q * 1.4), q > 0.72 ? (q - 0.72) * 0.5 : -1, t, {yaw: 0.2, pitch: 0.2, age: q > 0.72 ? (t - (P.div5 - 0.8 + 2.2 * 0.72)) : 0, ringR: 9});
    c.restore();
    label(stage, '세포 분열', 540, 755, fadeIn(t, P.cell5 - 0.2), {size: 38, color: PAL.cell});
    big(stage, 'fission', 540, 845, 96, '#FFFFFF', fadeIn(t, P.name5 - 0.3, 0.4));
    label(stage, '핵분열', 540, 1290, fadeIn(t, P.name5), {size: 38, color: PAL.fis});
    const fi = smooth((t - s5) / 0.35); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  // 1920 Eddington: 4 protons fuse inside the Sun (dot field of the hot core)
  seriesBg(c, '#4A2A14', 0.2, 540, 820);
  const R = rng(19); c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 220; i++) { const a0 = R() * TAU, r0 = 80 + R() * 620, sp = 0.15 + 0.3 * R(), x = 540 + r0 * Math.cos(a0 + t * sp * (R() > 0.5 ? 1 : -1)), y = 820 + r0 * 0.9 * Math.sin(a0 + t * sp); circle(c, x, y, 1.6 + 1.6 * R(), rgba(PAL.fus, 0.25 + 0.3 * R())); }
  c.restore();
  const z = 1 + 0.1 * smooth((t - s6) / 8); c.save(); zoomAbout(c, 540, 820, z);
  const q = smooth((t - (P.h6 - 0.3)) / Math.max(0.4, P.fuse6 - P.h6 + 0.3)), fu = t - P.fuse6;
  if (fu < 0) for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + t * 0.6, r = lerp(360, 60, q); light(c, 'H', 540 + r * Math.cos(a), 820 + r * Math.sin(a) * 0.8, 46, t + k, {glow: 1}); }
  else { light(c, 'He', 540, 820, 50, t, {glow: 1.3}); burst(c, 540, 820, fu, 260, PAL.fusHot);
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, r0 = 130 + fu * 420; trail(c, [540 + (r0 - 70) * Math.cos(a), 820 + (r0 - 70) * Math.sin(a)], [540 + r0 * Math.cos(a), 820 + r0 * Math.sin(a)], 0.9 * Math.exp(-fu / 1.4), 2.5, PAL.fusHot); } }
  c.restore();
  big(stage, '1920', 540, 470, 150, '#FFFFFF', fadeIn(t, P.y20 - 0.2) * 0.9);
  big(stage, '−0.7%', 540, 1160, 120, PAL.fusHot, fadeIn(t, P.fuse6 + 0.4));
  label(stage, '수소 4개 → 헬륨 1개, 그만큼 가벼워짐', 540, 1265, fadeIn(t, P.fuse6 + 0.6), {size: 34});
  const fi = smooth((t - s6) / 0.35); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ essence: binding + the valley
const O16 = pack(16, 8, 16);
function essenceScene(stage, t, ctx) {
  const P = plan(ctx.tl), s0 = ctx.scene.start, vIn = P.split8 - 0.9;
  if (t < vIn) { bindScene(stage, t, P, s0); return; }
  valleyGraph(stage, t, P, {from: vIn, glide: true});
  const fi = smooth((t - vIn) / 0.45); if (fi < 1) { stage.ctx.fillStyle = rgba('#060607', 1 - fi); stage.ctx.fillRect(0, 0, W, H); }
}
const FAR16 = (() => { const R = rng(4); return O16.pts.map(() => [(R() - 0.5) * 11, (R() - 0.5) * 17, (R() - 0.5) * 3]); })();
function bindScene(stage, t, P, s0) {
  const c = stage.ctx;
  seriesBg(c, '#3A2A1E', 0.14, 540, 720); dust(c, t);
  const q = smooth((t - (P.pn7 - 0.6)) / Math.max(1.2, P.strong7 - P.pn7 + 1.4)), bal = easeInOut((t - (P.tight7 - 0.4)) / 1.3);
  const tilt = -0.13 * smooth((t - (P.tight7 + 0.7)) / 1.2), zoom = 1 + 0.05 * smooth((t - s0) / 4) + 0.12 * smooth((t - (P.less7 - 0.3)) / 2);
  c.save(); zoomAbout(c, 540, lerp(720, 860, bal), zoom);
  const fx = 540, fy = 760, Lb = 300, ex = Lb * Math.cos(tilt), ey = Lb * Math.sin(tilt), pans = [[fx - ex, fy - ey], [fx + ex, fy + ey]];
  if (bal > 0.01) withAlpha(c, bal, () => {                                  // line-drawn balance
    c.strokeStyle = rgba(PAL.line, 0.85); c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(fx, fy + 12); c.lineTo(fx - 80, 1300); c.moveTo(fx, fy + 12); c.lineTo(fx + 80, 1300); c.moveTo(fx - 220, 1300); c.lineTo(fx + 220, 1300); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(fx - ex - 14 * Math.cos(tilt), fy - ey - 14 * Math.sin(tilt)); c.lineTo(fx + ex + 14 * Math.cos(tilt), fy + ey + 14 * Math.sin(tilt)); c.stroke();
    circle(c, fx, fy, 10, PAL.line); ringFx(c, fx, fy, 18, PAL.fus, 0.5, 2);
    for (const [px, py] of pans) { c.strokeStyle = rgba(PAL.line, 0.7); c.lineWidth = 2; c.beginPath(); c.moveTo(px, py); c.lineTo(px - 135, py + 260); c.moveTo(px, py); c.lineTo(px + 135, py + 260); c.stroke();
      c.strokeStyle = rgba(PAL.line, 0.9); c.lineWidth = 3; c.beginPath(); c.ellipse(px, py + 262, 150, 22, 0, 0, Math.PI); c.stroke(); c.beginPath(); c.moveTo(px - 150, py + 262); c.lineTo(px + 150, py + 262); c.stroke(); }
    const R = rng(12), [lx, ly] = pans[0];
    drawNucleons(c, O16.pts.map((n, i) => ({p: [((i % 6) - 2.5) * 1.9 + (R() - 0.5) * 0.6, -1.0 - Math.floor(i / 6) * 1.8 + (R() - 0.5) * 0.3, R()], proton: n.proton})), lx, ly + 236, 24, {R: 3, under: false});
  });
  const [rx, ry] = pans[1], cx = lerp(540, rx, bal), cy = lerp(720, ry + 168, bal), s = lerp(52, 31, bal);
  const list = O16.pts.map((n, i) => ({p: rotX(rotY(V.add(V.mul(FAR16[i], 1 - q), V.mul(n.p, q)), t * 0.35), 0.3), proton: n.proton}));
  if (q > 0.35) { c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const d = Math.hypot(...V.sub(list[i].p, list[j].p)); if (d < 2.4) {
      const a = clamp((q - 0.35) / 0.4) * (0.45 + 0.55 * Math.sin(t * 9 + i * 1.7 + j * 2.3) ** 2) * (1 - 0.6 * bal);
      c.strokeStyle = rgba(PAL.fus, 0.9 * a); c.lineWidth = Math.max(1.5, s * 0.05); c.beginPath(); c.moveTo(cx + list[i].p[0] * s, cy + list[i].p[1] * s); c.lineTo(cx + list[j].p[0] * s, cy + list[j].p[1] * s); c.stroke(); } }
    c.restore(); }
  drawNucleons(c, list, cx, cy, s, {R: O16.Rb, glow: 0.6 + 0.6 * q});
  for (const tb of P.bind7) burst(c, cx, cy, t - tb, 300 * (1 - 0.7 * bal), PAL.fusHot, 0.8);
  c.restore();
  label(stage, '강한 힘', 540, 1210, fadeIn(t, P.strong7 - 0.1) * fadeOut(t, P.tight7 - 0.3, 0.3), {size: 44, color: PAL.fusHot});
  const la = bal * fadeIn(t, P.tight7 + 0.3);
  label(stage, '흩어진 16개', clamp(pans[0][0], 200, 880), 1110 + (pans[0][1] - fy) * zoom, la, {size: 36});
  label(stage, '묶인 산소 16', clamp(pans[1][0], 200, 880), 1110 + (pans[1][1] - fy) * zoom, la, {size: 36, color: PAL.fusHot});
  const n = fadeIn(t, P.less7 - 0.35, 0.4), nz = 1 + 0.15 * smooth((t - P.less7 + 0.35) / 2);
  c.save(); zoomAbout(c, 540, 420, nz); big(stage, '−0.85%', 540, 420, 180, PAL.fusHot, n); c.restore();
  label(stage, '묶일수록 가볍다', 540, 545, n * fadeIn(t, P.less7), {size: 40});
  const fi = smooth((t - s0) / 0.35); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ fission: snap → reactor core → turbine → Cherenkov pool
// reactor core as a front elevation (line drawing, as in the series): fuel rods, control rods from above, neutron dots
const FUEL = [...Array(8)].map((_, i) => 200 + i * 97), CTRLX = [0, 2, 4, 6].map(i => 200 + i * 97 + 48.5);
const CORE = {x0: 130, x1: 950, y0: 470, y1: 1130, f0: 600, f1: 1090};
function coreView(stage, t, P, u) {
  const c = stage.ctx, ins = P.rod(t), z = 1 + 0.07 * smooth(u / 9);
  seriesBg(c, '#1E3A5A', 0.14, 540, 820); dust(c, t, '#C8D4E8', 0.4);
  c.save(); zoomAbout(c, 540, 800, z); c.translate(10 * Math.sin(u * 0.35), 0);
  const {x0, x1, y0, y1, f0, f1} = CORE;
  c.fillStyle = rgba(PAL.cher, 0.05); c.fillRect(x0, y0 + 60, x1 - x0, y1 - y0 - 60);
  c.beginPath(); for (let x = x0; x <= x1; x += 10) { const y = y0 + 60 + 5 * Math.sin(x * 0.04 + t * 2); x === x0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.strokeStyle = rgba(PAL.cher, 0.55); c.lineWidth = 1.5; c.stroke();
  c.strokeStyle = rgba(PAL.line, 0.7); c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.lineTo(x1, y1); c.lineTo(x1, y0); c.stroke();
  // fission flashes light the rod they happen in
  const heat = FUEL.map(() => 0), hits = [];
  for (const [gi, g] of P.gens.entries()) {
    const age = t - g.t; if (age < -0.01 || age > 1.6) continue;
    for (let k = 0; k < g.n; k++) {
      const i1 = Math.floor(rand2(gi * 31 + k * 7) * 8), i2 = (i1 + 1 + Math.floor(rand2(gi * 17 + k * 13 + 5) * 7)) % 8;
      const y1 = f0 + 30 + (f1 - f0 - 60) * rand2(gi * 3 + k), y2 = f0 + 30 + (f1 - f0 - 60) * rand2(gi * 5 + k * 11 + 1);
      hits.push({age, a: [FUEL[i1], y1], b: [FUEL[i2], y2]}); if (age > 0.42) heat[i2] = Math.max(heat[i2], Math.exp(-(age - 0.42) / 0.4));
    }
  }
  FUEL.forEach((x, i) => { const w = 30;
    c.fillStyle = rgba(PAL.p, 0.14 + 0.25 * heat[i]); c.fillRect(x - w / 2, f0, w, f1 - f0); c.strokeStyle = rgba(PAL.p, 0.9); c.lineWidth = 2; c.strokeRect(x - w / 2, f0, w, f1 - f0);
    c.strokeStyle = rgba(PAL.p, 0.3); c.lineWidth = 1; for (let y = f0 + 35; y < f1; y += 35) { c.beginPath(); c.moveTo(x - w / 2 + 4, y); c.lineTo(x + w / 2 - 4, y); c.stroke(); } });
  const yb = f0 - 20 + ins * (f1 - f0);
  for (const x of CTRLX) { const w = 24; c.strokeStyle = rgba(PAL.line, 0.5); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 330); c.lineTo(x, yb - 300); c.stroke();
    c.fillStyle = 'rgba(40,42,48,0.95)'; c.fillRect(x - w / 2, yb - 300, w, 300); c.strokeStyle = rgba(PAL.line, 0.9); c.lineWidth = 2; c.strokeRect(x - w / 2, yb - 300, w, 300); }
  for (const h of hits) {
    if (h.age < 0.42) { const q = clamp(h.age / 0.42), qt = Math.max(0, q - 0.3), at = qq => [lerp(h.a[0], h.b[0], qq), lerp(h.a[1], h.b[1], qq)]; trail(c, at(qt), at(q), 0.9, 2); neutronDot(c, ...at(q), 5); }
    else burst(c, h.b[0], h.b[1], h.age - 0.42, 34, PAL.fusHot, 0.7);
  }
  c.restore();
  return z;
}
function turbine(c, cx, cy, R, t, a) {
  const ang = t * 7;
  c.save(); c.globalAlpha *= a; c.translate(cx, cy);
  c.strokeStyle = rgba(PAL.line, 0.5); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R * 1.04, 0, TAU); c.stroke();
  for (let m = 0; m < 3; m++) { c.save(); c.rotate(ang - m * 0.06); c.strokeStyle = rgba(PAL.line, m === 0 ? 0.9 : 0.2); c.lineWidth = m === 0 ? 2.5 : 2;
    for (let k = 0; k < 24; k++) { c.rotate(TAU / 24); c.beginPath(); c.moveTo(0, R * 0.24); c.quadraticCurveTo(R * 0.12, R * 0.62, R * 0.06, R); c.stroke(); } c.restore(); }
  c.beginPath(); c.arc(0, 0, R * 0.22, 0, TAU); c.fillStyle = '#111214'; c.fill(); c.strokeStyle = rgba(PAL.fus, 0.9); c.lineWidth = 3; c.stroke();
  c.restore();
}
const CAUSTIC = [...Array(7)].map((_, k) => ({y: 420 + k * 150, ph: k * 1.3, amp: 26 + 10 * (k % 3), f: 0.008 + 0.002 * (k % 4)}));
function poolView(c, t, d) {
  const cy = lerp(1500, 1000, d), s = lerp(0.6, 1, d);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#071420'); g.addColorStop(1, '#020509'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  gl(c, 540, cy, 760, PAL.cher, 0.32); gl(c, 540, cy, 330, '#9FD8FF', 0.28);
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineWidth = 1.5;               // a few thin caustic lines
  for (const L of CAUSTIC) { c.beginPath(); for (let x = -20; x <= W + 20; x += 18) { const y = L.y + L.amp * Math.sin(x * L.f + t * 0.9 + L.ph) + 12 * Math.sin(x * 0.021 - t * 0.6); x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.strokeStyle = rgba(PAL.cher, 0.16); c.stroke(); }
  for (let k = 0; k < 14; k++) { const a = -Math.PI / 2 + (k - 6.5) * 0.11; c.strokeStyle = rgba(PAL.cher, 0.14); c.lineWidth = 2; c.beginPath(); c.moveTo(540 + Math.cos(a) * 200 * s, cy + Math.sin(a) * 200 * s); c.lineTo(540 + Math.cos(a) * 1100, cy + Math.sin(a) * 1100); c.stroke(); }
  c.restore();
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { if (Math.abs(i) + Math.abs(j) > 4) continue; const x = 540 + i * 62 * s, y = cy + j * 62 * s * 0.6;
    c.strokeStyle = rgba('#9FD8FF', 0.8); c.lineWidth = 2; c.strokeRect(x - 22 * s, y - 14 * s, 44 * s, 28 * s); gl(c, x, y, 40 * s, PAL.cher, 0.25 + 0.08 * Math.sin(t * 3 + i + j)); }
  const R = rng(21); for (let i = 0; i < 50; i++) { const sp = 0.3 + 0.7 * R(), q = ((t * 0.22 * sp + R()) % 1), x = 540 + (R() - 0.5) * 520 * (0.4 + q) + Math.sin(t * 2 + i) * 6, y = cy - q * 1050, r = 3 + 6 * R();
    c.strokeStyle = rgba('#CFEFFF', 0.4 * (1 - q)); c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
}
function fissionScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start;
  if (t < P.core[0]) {
    seriesBg(c, '#2A3240', 0.14, 540, 800); dust(c, t);
    c.save(); zoomAbout(c, 540, 800, 1 + 0.18 * smooth((t - s0) / (P.core[0] - s0))); shake(c, t, P.snap, 6);
    const u = (t - P.snap) * P.slowK, yaw = 0.25 + 0.03 * (t - s0);
    if (u <= 0) {
      const ab = t > P.absorb, e = ab ? 0.85 * smooth((t - (P.wob10 - 0.2)) / (P.snap - P.wob10 + 0.2)) : 0, wob = ab ? 0.05 + 0.1 * smooth((t - P.absorb) / 1.2) : 0;
      fissionDraw(c, 540, 800, 27, e, -1, t, {yaw, pitch: 0.25, wob, wph: t * 11});
      if (t > P.nIn && t < P.absorb) { const q = (t - P.nIn) / (P.absorb - P.nIn), hx = lerp(-60, 380, q), hy = lerp(380, 690, q); streak(c, [hx - 130, hy - 92], [hx, hy], 22); }
      if (ab) ringFx(c, 540, 800, 240 + 160 * (t - P.absorb), PAL.fis, 0.5 * Math.exp(-(t - P.absorb) / 0.5));
    } else fissionDraw(c, 540, 800, 27, 1, u, t, {yaw, pitch: 0.25, age: t - P.snap, ringR: 13});
    c.restore();
    big(stage, '235', 770, 520, 110, '#E6EBEE', fadeIn(t, P.u10 - 0.2) * fadeOut(t, P.absorb, 0.4));
    label(stage, '우라늄', 770, 610, fadeIn(t, P.u10 - 0.2) * fadeOut(t, P.absorb, 0.4), {size: 36});
    label(stage, '느린 화면 · 실제로는 아주 짧은 순간', 540, 1270, fadeIn(t, P.wob10 - 0.2) * fadeOut(t, P.core[0] - 0.4), {size: 30, color: PAL.muted, weight: 500});
    const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  if (t < P.turbine) {
    const u = t - P.core[0];
    coreView(stage, t, P, u);
    const k = P.k(t), ka = fadeIn(t, P.core[0] + 0.5), one = Math.abs(k - 1) < 0.02;
    big(stage, `k = ${k.toFixed(2)}`, 540, 1255, 112, one ? PAL.fisHot : k > 1 ? PAL.fus : '#9FB8D8', ka);
    label(stage, one ? '분열 하나 → 다음 분열 하나' : k > 1 ? '늘어난다' : '줄어든다', 540, 1345, ka, {size: 34});
    label(stage, '제어봉', 540, 340, fadeIn(t, P.rod11 - 0.4) * fadeOut(t, P.turbine - 0.3), {size: 34, color: PAL.line});
    label(stage, '연료봉', 540, 1165, ka * fadeOut(t, P.turbine - 0.3), {size: 32, color: PAL.p});
    const fi = smooth(u / 0.5); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  const d = smooth((t - P.dive) / 1.0);
  if (d < 1) {
    seriesBg(c, '#3A2A1E', 0.14, 600, 720); dust(c, t);
    c.save(); c.globalCompositeOperation = 'lighter'; const R = rng(12);
    for (let i = 0; i < 90; i++) { const q = ((t * 0.6 + R()) % 1), y = 720 + (R() - 0.5) * 360, x = lerp(-60, 420, q); circle(c, x, y + Math.sin(q * 6 + i) * 24, 2 + 3 * R(), rgba('#D8D2C8', 0.35 * (1 - q))); }
    c.restore();
    turbine(c, 620, 720, 290, t, 1);
  }
  if (d > 0) { c.save(); c.globalAlpha = d; poolView(c, t, d); c.restore(); }
  label(stage, '증기 → 터빈', 540, 1150, fadeIn(t, P.turb12 - 0.2) * (1 - d), {size: 38});
  big(stage, '체렌코프 빛', 540, 520, 92, '#DDF0FF', fadeIn(t, P.blue12 - 0.2, 0.5) * fadeOut(t, ctx.scene.end - 0.4));
  label(stage, '물속 빛보다 빠른 전자가 내는 푸른 빛', 540, 620, fadeIn(t, P.blue12 + 0.3, 0.5) * fadeOut(t, ctx.scene.end - 0.4), {size: 32, weight: 500});
}

// ------------------------------------------------------------------ fusion: Coulomb hill (graph) → tokamak (wireframe) → KSTAR
function tokamak(stage, t, cam, o = {}) {
  const c = stage.ctx, R0 = 1, a = 0.32, kap = 1.35, A = o.plasma ?? 1, wob = o.wob || 0, cz = cam.P([0, 0, 0])[2];
  const pt = (phi, th, r) => [(R0 + r * Math.cos(th)) * Math.cos(phi), r * Math.sin(th) * kap, (R0 + r * Math.cos(th)) * Math.sin(phi)];
  const front = phi => cam.P(pt(phi, 0, 0))[2] < cz;
  const coil = (phi, fr) => { if (front(phi) !== fr) return; c.beginPath(); for (let i = 0; i <= 48; i++) { const th = i / 48 * TAU, p = cam.P([(R0 + 0.52 * Math.cos(th)) * Math.cos(phi), 0.74 * Math.sin(th), (R0 + 0.52 * Math.cos(th)) * Math.sin(phi)]); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }
    c.strokeStyle = rgba('#B08A66', 0.4); c.lineWidth = 2; c.stroke(); };
  const vessel = fr => { c.lineWidth = 1.5;
    for (let k = 0; k < 16; k++) { const phi = k / 16 * TAU + 0.2; if (front(phi) !== fr) continue; c.beginPath(); for (let i = 0; i <= 36; i++) { const p = cam.P(pt(phi, i / 36 * TAU, 0.42)); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.strokeStyle = rgba('#A09A90', fr ? 0.2 : 0.1); c.stroke(); }
    for (const th of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { c.beginPath(); let first = true; for (let i = 0; i <= 120; i++) { const phi = i / 120 * TAU; if (front(phi) !== fr) { first = true; continue; } const p = cam.P(pt(phi, th, 0.42)); first ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); first = false; } c.strokeStyle = rgba('#A09A90', fr ? 0.4 : 0.16); c.stroke(); } };
    vessel(false);
  if (A > 0.003) {                                                            // plasma: short streams of dots along the field
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const R = rng(33), N = o.n ?? 1300, dt = 0.16;
    for (let i = 0; i < N; i++) {
      const rr = a * Math.sqrt(R()), phi0 = R() * TAU, th0 = R() * TAU, q = 1 + 2 * (rr / a) ** 2, v = 0.9 + 0.3 * R(), jit = R();
      const at = tt => { const r = rr * (1 + wob * 0.6 * Math.sin(tt * 9 + i)), phi = phi0 + tt * v * 0.55, th = th0 + (phi - phi0) / q + wob * Math.sin(phi * 3 + tt * 6); return cam.P(pt(phi, th, r)); };
      const p = at(t), p0 = at(t - dt); if (p[2] < 0.1) continue; const back = p[2] > cz ? 0.45 : 1;
      const hot = 1 - rr / a, col = hot > 0.6 ? PAL.fusHot : PAL.plasma, al = clamp(A * back * (0.45 + 0.5 * hot) * (0.6 + 0.4 * jit)), sz = clamp(p[3] * (0.005 + 0.004 * hot), 1.4, 4);
      c.strokeStyle = rgba(col, al * 0.55); c.lineWidth = sz; c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p[0], p[1]); c.stroke();
      c.fillStyle = rgba(col, al); c.beginPath(); c.arc(p[0], p[1], sz * 0.9, 0, TAU); c.fill();
    }
    c.restore();
    const cc = cam.P([0, 0, 0]); gl(c, cc[0], cc[1], 420, PAL.plasma, 0.1 * A);
  }
  for (let L = 0; L < 10; L++) {                                              // helical field lines on the plasma edge (q = 3: a third of a turn per lap)
    let prev = null; c.lineWidth = 1.5;
    for (let i = 0; i <= 160; i++) { const phi = i / 160 * TAU, th = L / 10 * TAU + phi / 3 + t * 0.25, p = cam.P(pt(phi, th, 0.37)), fr = p[2] < cz;
      if (prev) { c.strokeStyle = rgba(PAL.fis, (fr ? 0.38 : 0.1) * (o.field ?? 1)); c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(p[0], p[1]); c.stroke(); } prev = p; } }
  vessel(true);
  for (let k = 0; k < 8; k++) coil(k / 8 * TAU + 0.13, true);
}
const HILL = {x0: 150, x1: 930, yb: 1240, top: 900, r0: 0.08};
const hillX = r => HILL.x0 + r * (HILL.x1 - HILL.x0), hillU = r => Math.min(1, HILL.r0 / Math.max(r, 1e-3)), hillY = U => HILL.yb - U * (HILL.yb - HILL.top);
function fusionScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, tokIn = P.donut14 - 0.6;
  if (t < tokIn) {
    seriesBg(c, '#1E2A40', 0.14, 540, 760); dust(c, t);
    const T = lerp(1e7, 1.05e8, smooth((t - P.heat[0]) / (P.heat[1] - P.heat[0])));
    // separation r(t): attempt 1 (cold, E = 0.3) turns back; attempt 2 (hot, E = 0.92) reaches r0 and fuses
    const a1 = t - (P.bounce13 - 1.0), a2 = t - (P.fuse13 - 1.1), E1 = 0.3, E2 = 0.92, rT = HILL.r0 / E1;
    let r, E, phase;
    if (a2 < 0) { r = a1 < 1.0 ? lerp(1, rT, easeOut(clamp(a1 / 1.0))) : lerp(rT, 0.9, easeIn(clamp((a1 - 1.0) / 1.2))); E = E1; phase = 1; }
    else if (a2 < 1.1) { r = lerp(0.9, HILL.r0, easeIn(a2 / 1.1)); E = E2; phase = 2; } else { r = HILL.r0; E = E2; phase = 3; }
    c.save(); zoomAbout(c, 540, 800, 1 + 0.08 * smooth((t - s0) / 6)); shake(c, t, P.fuse13, 4);
    // nuclei
    const g = 60 + r * 300;
    if (phase < 3) { light(c, 'D', 540 - g, 640, 40, t, {glow: 1}); light(c, 'T', 540 + g, 640, 40, t + 1, {glow: 1}); if (r < 0.5) { c.save(); c.globalCompositeOperation = 'lighter'; for (let j = -2; j <= 2; j++) { c.beginPath(); c.moveTo(540 - g + 60, 640 + j * 20); c.quadraticCurveTo(540, 640 + j * 20 + j * 46, 540 + g - 60, 640 + j * 20); c.strokeStyle = rgba(PAL.fis, 0.3 * (1 - r / 0.5)); c.lineWidth = 1.5; c.stroke(); } c.restore(); } }
    else { const f = a2 - 1.1; light(c, 'He', 540 - f * 80, 640 - f * 30, 42, t, {glow: 1.3}); burst(c, 540, 640, f, 330, PAL.fusHot); streak(c, [540 + Math.max(0, f - 0.15) * 900, 640 + Math.max(0, f - 0.15) * 300], [540 + f * 900, 640 + f * 300], 18); }
    // the hill graph
    c.strokeStyle = rgba(PAL.line, 0.7); c.lineWidth = 2; c.beginPath(); c.moveTo(HILL.x0, HILL.top - 60); c.lineTo(HILL.x0, HILL.yb + 70); c.lineTo(HILL.x1 + 10, HILL.yb + 70); c.stroke();
    c.save(); c.beginPath(); c.moveTo(hillX(0), hillY(-0.18)); c.lineTo(hillX(HILL.r0), hillY(-0.18)); c.lineTo(hillX(HILL.r0), hillY(1)); for (let i = 1; i <= 120; i++) { const rr = HILL.r0 + (1 - HILL.r0) * (i / 120) ** 1.6; c.lineTo(hillX(rr), hillY(hillU(rr))); }
    c.strokeStyle = rgba(PAL.fus, 0.16); c.lineWidth = 10; c.stroke(); c.strokeStyle = rgba(PAL.fus, 0.95); c.lineWidth = 3; c.stroke(); c.restore();
    const xr = hillX(Math.max(r, HILL.r0)), yE = hillY(E), turn = phase === 1 ? hillX(rT) : hillX(HILL.r0);
    c.save(); c.setLineDash([10, 8]); c.strokeStyle = rgba(phase === 1 ? PAL.fis : PAL.fusHot, 0.8); c.lineWidth = 2; c.beginPath(); c.moveTo(turn, yE); c.lineTo(HILL.x1, yE); c.stroke(); c.restore();
    if (phase < 3) { gl(c, xr, yE, 30, phase === 1 ? PAL.fis : PAL.fusHot, 0.8); circle(c, xr, yE, 8, '#FFFFFF'); }
    if (phase === 1 && Math.abs(r - rT) < 0.03) ringFx(c, xr, yE, 26, PAL.fis, 0.7);
    c.restore();
    big(stage, T >= 1e8 ? '1억 °C' : `${(Math.round(T / 1e6) * 100).toLocaleString('en-US')}만 °C`, 540, 410, 140, T >= 1e8 ? '#FFFFFF' : '#C8D8F0', fadeIn(t, P.heat[0] - 0.2, 0.3));
    label(stage, '밀어내는 힘의 언덕', 300, HILL.top - 30, fadeIn(t, s0 + 0.3), {size: 32, align: 'left', color: PAL.fus});
    label(stage, '중수소 + 삼중수소 → 헬륨 + 중성자', 540, 800, fadeIn(t, P.fuse13 + 0.3) * fadeOut(t, tokIn - 0.2), {size: 34});
    const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
    return;
  }
  const u = t - tokIn;
  seriesBg(c, '#2A2238', 0.14, 540, 800); dust(c, t);
  const cam = cam3(orbit(0.3 + u * 0.09, lerp(0.85, 0.5, smooth(u / 5)), lerp(7.6, 6.2, smooth(u / 8))), [0, -0.05, 0], {fov: 0.95, cy: 790});
  tokamak(stage, t, cam, {plasma: smooth(u / 0.8), field: fadeIn(t, P.mag14 - 0.2)});
  label(stage, '플라스마 · 벽에 닿지 않게', 540, 1250, fadeIn(t, P.wall14 - 0.2) * fadeOut(t, P.kstar15 - 0.6), {size: 36});
  const ka = fadeIn(t, P.deg15 - 0.2, 0.4);
  big(stage, '1억 °C', 330, 1250, 108, '#FFFFFF', ka);
  const sec = clamp((t - P.timer[0]) / (P.timer[1] - P.timer[0])) * 48;
  if (t > P.timer[0] - 0.3) { const tx = 800, ty = 1250, r = 86, a2 = fadeIn(t, P.timer[0] - 0.3);
    withAlpha(c, a2, () => { c.strokeStyle = rgba(PAL.grid, 1); c.lineWidth = 6; c.beginPath(); c.arc(tx, ty, r, 0, TAU); c.stroke(); c.strokeStyle = PAL.fus; c.lineCap = 'round'; c.beginPath(); c.arc(tx, ty, r, -Math.PI / 2, -Math.PI / 2 + TAU * sec / 48); c.stroke(); });
    big(stage, `${Math.floor(sec)}초`, tx, ty, 60, '#FFFFFF', a2); }
}

// ------------------------------------------------------------------ compare: ×4 bars, what remains, ITER (camera-move transitions)
function barsShot(stage, t, P, s0) {
  const c = stage.ctx, H1 = 210, g1 = smooth((t - P.cols) / 1.8), g4 = smooth((t - P.cols) / 3.2), yb = 1240;
  seriesBg(c, '#2A2A30', 0.12); dust(c, t);
  grid(c, 120, 300, 960, yb, 105, 0.25);
  c.strokeStyle = rgba(PAL.line, 0.8); c.lineWidth = 2.5; c.beginPath(); c.moveTo(120, yb); c.lineTo(960, yb); c.stroke();
  const bar = (x, h, col, w = 200) => { if (h <= 1) return; c.fillStyle = rgba(col, 0.18); c.fillRect(x - w / 2, yb - h, w, h); c.strokeStyle = rgba(col, 0.95); c.lineWidth = 2.5; c.strokeRect(x - w / 2, yb - h, w, h);
    gl(c, x, yb - h, 120, col, 0.5); c.strokeStyle = '#FFFFFF'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - w / 2, yb - h); c.lineTo(x + w / 2, yb - h); c.stroke();
    const R = rng(x); c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 26; i++) { const ph = (t * 0.5 + R()) % 1, y = yb - ph * h, xx = x + (R() - 0.5) * w * 0.8; circle(c, xx, y, 2 + 2 * R(), rgba(col, 0.6 * (1 - ph * 0.6))); } c.restore(); };
  bar(330, H1 * g1, PAL.fis); bar(750, 4 * H1 * g4, PAL.fus);
  for (let k = 1; k <= 3; k++) if (4 * H1 * g4 > H1 * k + 6) { const y = yb - H1 * k; c.save(); c.setLineDash([10, 8]); c.strokeStyle = rgba(PAL.fusHot, 0.55); c.lineWidth = 2; c.beginPath(); c.moveTo(640, y); c.lineTo(860, y); c.stroke(); c.restore(); }
  for (const [x, col] of [[330, PAL.fis], [750, PAL.fus]]) { c.strokeStyle = rgba(col, 0.9); c.lineWidth = 2; c.strokeRect(x - 26, yb + 14, 52, 30); }
  return {yb};
}
const ASM = (() => { const r = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) r.push([i, j, 1.6 + 2.6 * rand2(i * 13 + j * 7), rand2(i * 3 + j * 17) * TAU]); return r; })();
function wasteShot(stage, t, P) {
  const c = stage.ctx;
  seriesBg(c, '#2A3240', 0.12); dust(c, t);
  // left: spent fuel assembly in a pool (line icon) with slow decay glints
  const ox = 270, oy = 820;
  c.strokeStyle = rgba(PAL.line, 0.6); c.lineWidth = 2; c.strokeRect(70, 520, 400, 620);
  c.beginPath(); for (let x = 70; x <= 470; x += 10) { const y = 560 + 6 * Math.sin(x * 0.05 + t * 2); x === 70 ? c.moveTo(x, y) : c.lineTo(x, y); } c.strokeStyle = rgba(PAL.cher, 0.7); c.stroke();
  gl(c, ox, oy, 260, PAL.cher, 0.14);
  for (const [i, j, per, ph] of ASM) { const x = ox - 140 + i * 40, y = oy - 140 + j * 40, a = 0.5 + 0.5 * Math.sin(t * TAU / per + ph);
    c.strokeStyle = rgba('#9FD8FF', 0.7); c.lineWidth = 1.5; c.strokeRect(x - 13, y - 13, 26, 26); if (a > 0.8) { gl(c, x, y, 26, '#C8FFE0', (a - 0.8) * 3); circle(c, x, y, 3, rgba('#E8FFF0', (a - 0.8) * 4)); } }
  // right: plasma ring icon and helium nuclei rising away
  c.save(); c.translate(810, 1140); c.scale(1, 0.32); c.strokeStyle = rgba(PAL.plasma, 0.8); c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 150, 0, TAU); c.stroke(); c.restore();
  const R = rng(3); for (let i = 0; i < 70; i++) { const a = R() * TAU + t * 0.8, x = 810 + 150 * Math.cos(a), y = 1140 + 48 * Math.sin(a); circle(c, x, y, 2 + R() * 1.5, rgba(PAL.plasma, 0.6)); }
  for (let i = 0; i < 8; i++) { const ph = (t * 0.16 + i / 8) % 1, x = 810 + Math.sin(i * 2.3 + t * 0.8) * 110, y = 1100 - ph * 760; light(c, 'He', x, y, 26, t + i, {glow: 0.8, alpha: smooth(ph / 0.1) * (1 - smooth((ph - 0.78) / 0.22))}); }
  c.strokeStyle = rgba(PAL.line, 0.3); c.lineWidth = 1.5; c.beginPath(); c.moveTo(540, 420); c.lineTo(540, 1300); c.stroke();
}
function iterShot(stage, t, P, u) {
  const c = stage.ctx;
  seriesBg(c, '#2A3240', 0.14, 540, 760); dust(c, t);
  const fy = 1150; grid(c, 60, fy, 1020, fy + 1, 60, 0); c.strokeStyle = rgba(PAL.line, 0.5); c.lineWidth = 2; c.beginPath(); c.moveTo(60, fy); c.lineTo(1020, fy); c.stroke();
  for (let k = -8; k <= 8; k++) { c.strokeStyle = rgba(PAL.grid, 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(540 + k * 40, fy); c.lineTo(540 + k * 120, fy + 300); c.stroke(); }
  const cam = cam3(orbit(-0.5 + u * 0.05, 0.42, lerp(8.6, 7.8, smooth(u / 8))), [0, 0.1, 0], {fov: 0.95, cy: 720});
  // cryostat outline (thin cylinder) around the torus
  const cr = 1.62, cyl = (y, fr) => { c.beginPath(); let first = true; for (let i = 0; i <= 96; i++) { const ph = i / 96 * TAU, p = cam.P([cr * Math.cos(ph), y, cr * Math.sin(ph)]), isF = cam.P([cr * Math.cos(ph), 0, cr * Math.sin(ph)])[2] < cam.P([0, 0, 0])[2]; if (isF !== fr) { first = true; continue; } first ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); first = false; } c.strokeStyle = rgba(PAL.line, fr ? 0.45 : 0.2); c.lineWidth = 1.8; c.stroke(); };
  cyl(-0.95, false); cyl(0.95, false);
  tokamak(stage, t, cam, {plasma: 0.3 + 0.1 * Math.sin(t * 1.3), field: 0.6, n: 800});
  cyl(-0.95, true); cyl(0.95, true);
  for (const s of [-1, 1]) { const a = cam.P([s * cr, -0.95, 0]), b = cam.P([s * cr, 0.95, 0]); c.strokeStyle = rgba(PAL.line, 0.45); c.lineWidth = 1.8; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  const top = cam.P([0, 0.95, 0])[1] - 20, bot = Math.min(fy, cam.P([0, -0.95, 0])[1] + 20), hpx = bot - top, ph = hpx * 1.8 / 30;
  for (const x of [262, 300]) { c.strokeStyle = rgba(PAL.line, 0.9); c.lineWidth = 2; c.beginPath(); c.arc(x, bot - ph * 0.86, ph * 0.12, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(x, bot - ph * 0.74); c.lineTo(x, bot - ph * 0.3); c.lineTo(x - ph * 0.12, bot); c.moveTo(x, bot - ph * 0.3); c.lineTo(x + ph * 0.12, bot); c.stroke(); }
  c.strokeStyle = rgba(PAL.fusHot, 0.85); c.lineWidth = 2.5; c.beginPath(); c.moveTo(110, bot); c.lineTo(110, top); c.moveTo(96, bot); c.lineTo(124, bot); c.moveTo(96, top); c.lineTo(124, top); c.stroke();
  return {top};
}
function compareScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, T1 = ctx.tl.at('s17') - 0.6, T2 = ctx.tl.at('s18') - 0.6;
  const w1 = [T1 - 0.3, T1 + 0.35], w2 = [T2 - 0.35, T2 + 0.5];
  if (t < w1[1]) {
    const k = t > w1[0] ? easeInOut((t - w1[0]) / (w1[1] - w1[0])) : 0, dx = k * W;
    c.save(); c.translate(-dx, 0); zoomAbout(c, 540, 900, 1.06 - 0.06 * smooth((t - s0) / 1.6)); const B = barsShot(stage, t, P, s0); c.restore();
    if (k > 0) { c.save(); c.translate(W - dx, 0); wasteShot(stage, t, P); c.restore(); }
    const la = 1 - k;
    label(stage, '핵분열', 330 - dx, B.yb + 90, fadeIn(t, s0 + 0.4) * la, {size: 38, color: PAL.fis});
    label(stage, '핵융합', 750 - dx, B.yb + 90, fadeIn(t, s0 + 0.4) * la, {size: 38, color: PAL.fus});
    big(stage, '× 4', 330 - dx, 600, 170, PAL.fusHot, fadeIn(t, P.x4in, 0.4) * la);
    if (k > 0) label(stage, '오래 남는 방사성 폐기물', 270 + W - dx, 1220, fadeIn(t, P.long17 - 0.2), {size: 32, color: '#D6EEFF'});
    return;
  }
  if (t < w2[1]) {
    const k = t > w2[0] ? easeInOut((t - w2[0]) / (w2[1] - w2[0])) : 0;
    if (k > 0) iterShot(stage, t, P, t - (T2 - 0.35));
    c.save(); c.globalAlpha = 1 - k; zoomAbout(c, 810, 900, 1 + 0.035 * smooth((t - T1) / 6) + 1.4 * easeIn(k)); wasteShot(stage, t, P); c.restore();
    const la = 1 - k;
    label(stage, '오래 남는 방사성 폐기물', 270, 1220, fadeIn(t, P.long17 - 0.2) * la, {size: 32, color: '#D6EEFF'});
    label(stage, '사용후 연료 · 물속 저장', 270, 1272, fadeIn(t, P.long17) * la, {size: 30, color: PAL.muted, weight: 500});
    big(stage, '헬륨', 810, 1250, 72, PAL.fusHot, fadeIn(t, P.he17 - 0.2) * la);
    return;
  }
  const I = iterShot(stage, t, P, t - (T2 - 0.35));
  label(stage, '높이 약 30 m', 132, I.top - 34, fadeIn(t, T2 + 0.4), {size: 30, align: 'left', color: PAL.fusHot});
  big(stage, '2034', 300, 1250, 116, '#FFFFFF', fadeIn(t, P.yrs - 0.3)); label(stage, '연구 운전 시작', 300, 1335, fadeIn(t, P.yrs - 0.1), {size: 34});
  big(stage, '2039', 780, 1250, 116, PAL.fusHot, fadeIn(t, P.yrs + 0.5)); label(stage, '중수소·삼중수소', 780, 1335, fadeIn(t, P.yrs + 0.7), {size: 34});
}

// ------------------------------------------------------------------ myth: confinement lost → plasma dots dim out
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), u = t - ctx.scene.start;
  seriesBg(c, '#2A2238', 0.14 * (0.4 + 0.6 * P.plasmaA(t)), 540, 800); dust(c, t);
  const cam = cam3(orbit(0.9 + u * 0.06, 0.55, lerp(6.6, 5.8, smooth(u / 12))), [0, -0.05, 0], {fov: 0.95, cy: 790});
  const wob = t > P.wobble ? smooth((t - P.wobble) / 0.6) : 0;
  tokamak(stage, t, cam, {plasma: P.plasmaA(t), wob, field: 1});
  if (t > P.wobble && t < P.dead) { const R = rng(Math.floor(t * 20)); for (let i = 0; i < 5; i++) { const ang = R() * TAU, p = cam.P([1.35 * Math.cos(ang), (R() - 0.5) * 0.4, 1.35 * Math.sin(ang)]); gl(c, p[0], p[1], 24, PAL.fusHot, 0.6 * P.plasmaA(t)); circle(c, p[0], p[1], 3, rgba('#FFFFFF', 0.8 * P.plasmaA(t))); } }
  big(stage, '연료 1 g 미만', 540, 1250, 100, '#FFFFFF', fadeIn(t, P.gram20 - 0.2));
  label(stage, '식으면 반응이 바로 멈춘다', 540, 1340, fadeIn(t, P.cool20), {size: 36, color: PAL.fusHot});
  const fi = smooth(u / 0.4); if (fi < 1) { c.fillStyle = rgba('#060607', 1 - fi); c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ close: valley, then the poster returns
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.poster + 0.5) valleyGraph(stage, t, P, {from: ctx.scene.start, runs: [[P.vF21, 'fus'], [P.vS21, 'fis']], labels: fadeOut(t, P.poster - 0.3, 0.3)});
  if (t >= P.poster) { const a = smooth((t - P.poster) / 0.6); c.save(); c.globalAlpha = a; posterPicture(stage, t, P, 0.12 + 0.02 * Math.sin(t), 0.16 + 0.05 * Math.sin(t * 2)); c.restore(); }
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
  swell('balance', P.tight7 + 0.7, [73, 110], '저울: 흩어진 16개 쪽이 내려감 (기울기 과장)', {dur: 1.4, gain: -34});
  tick('mass', P.less7, 82, -34, '"−0.85%" (산소 16)', {decay: 0.18});
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
  swell('cols', P.cols, [98, 147], '같은 무게의 두 연료에서 나오는 에너지: 막대 두 개가 솟음', {dur: 2.2, gain: -33});
  tick('x4', P.x4in, 131, -32, '"× 4"', {decay: 0.18});
  whoosh('whip17', tl.at('s17') - 0.9, 0.65, 90, 260, '카메라가 옆으로 빠르게 넘어감: 물속 사용후 연료 | 플라스마 속 헬륨', -35);
  tick('waste', P.waste, 82, -35, '오래 남는 폐기물 (느린 깜빡임)', {decay: 0.25});
  tick('helium', P.heUp, 196, -35, '헬륨이 떠오름', {decay: 0.1});
  whoosh('push18', tl.at('s18') - 0.95, 0.85, 80, 200, '헬륨 쪽으로 밀고 들어가 ITER 선화로', -35);
  swell('iter', P.iterIn, [82, 123], 'ITER: 사람 키와 비교한 거대한 토카막 선화', {dur: 1.6, gain: -34});
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
