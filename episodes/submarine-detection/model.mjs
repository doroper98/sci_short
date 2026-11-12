// 38 잠수함은 어떻게 찾을까 — physical model (no drawing). Read by the picture, the instruments and --emit-sound.
// PLAN.md §4. All values are an explanatory model (brief.md "단순화 메모"), not a real ocean or real equipment.

// ---------------------------------------------------------------------------------------------
// 4.1 sound speed profile and ray tracing
// ---------------------------------------------------------------------------------------------
export const SSP = {Z1: 60, Z2: 140, C0: 1520, G: 0.017, C2: 1497};      // m, m/s, 1/s
const C1 = SSP.C0 + SSP.G * SSP.Z1;                                         // 1521.02 m/s at the bottom of the mixed layer
/** sound speed (m/s) at depth z (m, + down) */
export function c(z) {
  const {Z1, Z2, C0, G, C2} = SSP;
  if (z < Z1) return C0 + G * z;
  if (z < Z2) return C1 + (C2 - C1) * (z - Z1) / (Z2 - Z1);
  return C2 + G * (z - Z2);
}
/** dc/dz (1/s) */
export function dcdz(z) {
  const {Z1, Z2, G, C2} = SSP;
  if (z < Z1) return G;
  if (z < Z2) return (C2 - C1) / (Z2 - Z1);
  return G;
}
const D2R = Math.PI / 180;
/**
 * Ray from (xs, zs) at angle thDeg (below horizontal = +). dθ/ds = −(c′/c)·cosθ (bends toward slower water).
 * Midpoint step ds. Surface z < 0 reflects (z → −z, θ → −θ). Stops past xmax or zmax.
 * → [{x, z, t}] (t = travel time in s, real)
 */
export function traceRay(xs, zs, thDeg, {xmax = 9000, zmax = 460, ds = 4} = {}) {
  let x = xs, z = zs, th = thDeg * D2R, t = 0;
  const pts = [{x, z, t}];
  for (let i = 0; i < 100000; i++) {
    const k1 = -dcdz(z) / c(z) * Math.cos(th);
    const zm = z + 0.5 * ds * Math.sin(th), thm = th + 0.5 * ds * k1;
    const km = -dcdz(zm) / c(zm) * Math.cos(thm);
    const nx = x + ds * Math.cos(thm), nz = z + ds * Math.sin(thm);
    t += ds / c(zm); th += ds * km; x = nx; z = nz;
    if (z < 0) { z = -z; th = -th; }
    pts.push({x, z, t});
    if (x > xmax || z > zmax || x < xs - 50) break;
  }
  return pts;
}
/** first point where the ray crosses depth zc going down: {x, t} or null */
export function crossDepth(pts, zc) {
  for (let i = 1; i < pts.length; i++) if (pts[i - 1].z < zc && pts[i].z >= zc) {
    const q = (zc - pts[i - 1].z) / (pts[i].z - pts[i - 1].z);
    return {x: pts[i - 1].x + q * (pts[i].x - pts[i - 1].x), t: pts[i - 1].t + q * (pts[i].t - pts[i - 1].t)};
  }
  return null;
}
/** closest approach of a ray to (xt, zt) under a metric (kx, kz): {d, x, z, t, i} (d in metric units) */
export function closest(pts, xt, zt, {kx = 1, kz = 1} = {}) {
  let best = {d: Infinity};
  for (let i = 0; i < pts.length; i++) { const p = pts[i], d = Math.hypot((p.x - xt) * kx, (p.z - zt) * kz); if (d < best.d) best = {d, x: p.x, z: p.z, t: p.t, i}; }
  return best;
}
/**
 * launch angle whose ray passes closest to (xt, zt). → {th (deg), miss (m, plain metric), t (s, real, at closest approach), pts}
 */
export function aimRay(xs, zs, xt, zt, {from = -12, to = 12, step = 0.05, xmax, zmax = 460, kx = 1, kz = 1} = {}) {
  let best = null;
  const xm = xmax ?? xt + 400;
  for (let th = from; th <= to + 1e-9; th += step) {
    const pts = traceRay(xs, zs, th, {xmax: xm, zmax});
    const cl = closest(pts, xt, zt, {kx, kz});
    if (!best || cl.d < best.miss) best = {th: +th.toFixed(4), miss: cl.d, t: cl.t, i: cl.i, pts};
  }
  return best;
}
/** position along a ray at travel time tau (s, real): {x, z, i, done} (linear between points) */
export function rayAt(pts, tau) {
  if (tau <= 0) return {...pts[0], i: 0, done: false};
  for (let i = 1; i < pts.length; i++) if (pts[i].t >= tau) {
    const a = pts[i - 1], b = pts[i], q = (tau - a.t) / Math.max(1e-9, b.t - a.t);
    return {x: a.x + q * (b.x - a.x), z: a.z + q * (b.z - a.z), i, done: false};
  }
  const e = pts[pts.length - 1]; return {x: e.x, z: e.z, i: pts.length - 1, done: true};
}

// ---------------------------------------------------------------------------------------------
// 4.2 active sonar
// ---------------------------------------------------------------------------------------------
export const V_SOUND = 1500;                                   // m/s used for ranging
export const rangeOf = tRound => V_SOUND * tRound / 2;          // m

// ---------------------------------------------------------------------------------------------
// 4.3 received level at a buoy
// ---------------------------------------------------------------------------------------------
/** dB relative to 600 m (spherical spreading, 1/r² in power); 0 dB at r ≤ 600 m */
export const levelDb = r => -20 * Math.log10(Math.max(r, 600) / 600);
/** bar height in px */
export const barH = db => 150 * Math.min(1, Math.max(0.12, 1 + db / 26));
export const BUOY = {X: [2000, 4500, 7000, 9500], Zmic: 200, sub: {X: 7600, Z: 260}};   // sub Z 220 → 260 (2026-11-12 검수: 3번 마이크가 선체에 닿지 않게)
/** per buoy: {X, r, db, h, dt (s, arrival after emission)} */
export function buoyLevels(B = BUOY) {
  return B.X.map(X => { const r = Math.hypot(X - B.sub.X, B.Zmic - B.sub.Z), db = levelDb(r); return {X, r, db, h: barH(db), dt: r / V_SOUND}; });
}

// ---------------------------------------------------------------------------------------------
// 4.4 magnetic anomaly (one dipole magnetised along the section's vertical)
// ---------------------------------------------------------------------------------------------
/** normalised record: S(0, d0) = 1, S(0, 2 d0) = 1/8, zeros at x = ±√2·d */
export function S(x, d, d0 = d) {
  const r2 = x * x + d * d, r = Math.sqrt(r2);
  return ((3 * d * d / r2) - 1) / 2 * (d0 / r) ** 3;
}
/**
 * dipole field in screen px, ẑ = screen down. B = B0·ẑ + (M/r³)(3(ẑ·r̂)r̂ − ẑ); r < rmin is held at rmin.
 * → {bx, by, k} (k = |B_dip| / B0)
 */
export function bField(x, y, cx, cy, {B0 = 1, M = 0.6 * 110 ** 3, rmin = 70} = {}) {
  let dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
  if (r < 1e-6) { dx = 0; dy = 1; r = 1; }
  const ux = dx / r, uy = dy / r, rr = Math.max(r, rmin), m = M / rr ** 3, zr = uy;
  const dbx = m * (3 * zr * ux), dby = m * (3 * zr * uy - 1);
  return {bx: dbx, by: B0 + dby, k: Math.hypot(dbx, dby) / B0};
}
/**
 * stream lines of B from the top (y0) to the bottom (y1), started at xs (default 60, 140, …, 1020), step 4 px.
 * → [[{x, y, k}], …]
 */
export function fieldLines(cx, cy, {xs, y0 = 0, y1 = 1920, step = 4, B0 = 1, M = 0.6 * 110 ** 3, rmin = 70} = {}) {
  const X0 = xs || Array.from({length: 13}, (_, i) => 60 + 80 * i);
  const o = {B0, M, rmin};
  return X0.map(x0 => {
    let x = x0, y = y0; const L = [];
    for (let n = 0; n < 4000 && y <= y1; n++) {
      const f = bField(x, y, cx, cy, o); L.push({x, y, k: f.k});
      const n1 = Math.hypot(f.bx, f.by) || 1, hx = x + 0.5 * step * f.bx / n1, hy = y + 0.5 * step * f.by / n1;
      const g = bField(hx, hy, cx, cy, o), n2 = Math.hypot(g.bx, g.by) || 1;
      let sx = g.bx / n2, sy = g.by / n2; if (sy < -0.2 && n > 0) { /* keep going downward overall */ }
      x += step * sx; y += step * sy;
    }
    return L;
  });
}
