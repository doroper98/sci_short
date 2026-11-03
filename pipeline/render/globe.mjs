// Orthographic globe engine for vertical science shorts.
// History: written for episodes/global-winds (2026-11-01), extended with a screen roll in episodes/seasons,
// moved here for episodes/precession (third reuse, repo rule). The two earlier episodes keep their own local
// copies so their delivered renders stay reproducible; new episodes import this file:
//   import {loadLand, axisView, globeWithAxis, …} from '../../pipeline/render/globe.mjs';
// It is deliberately NOT re-exported from index.mjs.
//
// Frames
//   Earth frame : E3(lat, lon) = [cos φ sin λ, sin φ, cos φ cos λ] — y = north pole, lon 0 toward +z.
//   View frame  : [a, b, c] — a = screen right, b = screen up, c = toward the viewer (all unit-sphere units).
//   Screen      : (cx + R·a, cy − R·b). Back-hemisphere points are mirrored outside the disc (radius 2R − r) so a
//                 path clipped to the disc is cut exactly at the limb (gmap + tracePts).
//   makeView(lay, lam, tilt, roll): longitude `lam` faces the viewer, `tilt` (deg) leans the north pole toward the
//                 viewer, `roll` (deg) turns the picture counter-clockwise in the screen plane. lay = {cx, cy, R}.
//   Spin          : the Earth turns west → east, i.e. the longitude facing a fixed viewer DEcreases with time.
//   Oblateness    : V.flat = f squashes the drawn globe along the projected axis by the exact silhouette factor of an
//                 oblate spheroid, k = sqrt(n_c² + (1 − f)²(1 − n_c²)) (n_c = axis component toward the viewer). Exact
//                 for the outline; the interior is the sphere picture squashed (good for f ≲ 0.15). Use squash(V, p)
//                 for anything drawn outside drawGlobe that must sit on the squashed globe.
//
// API (all angles in degrees)
//   loadLand(file)                         Natural Earth rings JSON {rings:[[[lon,lat],…],…]} → land (pass to drawGlobe)
//   makeView / toView / fromView / gmap / proj / tracePts      low-level projection
//   axisView(lay, n, {spin, sun, sunLon, flat})                 view whose north axis points along view vector n;
//                                                              with sun + sunLon the subsolar longitude is sunLon
//   drawGlobe(stage, V, {land, sun, night, grat, lats, equator, band, pal, inside, halo})
//   globeWithAxis(stage, V, {…drawGlobe opts, len, col, w, through})   globe + axis (far end hidden by the globe)
//   axisEnds(stage, V, 'back'|'front', o), axisTip(V, len, sign)   (len ≤ 1 squashed with the globe; len > 1 = direction)
//   surfacePoint(V, lat, lon) → [x, y, front]   latitudePts(V, lat, n) → [[x, y, front], …]   (both squashed)
//   latLine(c, V, lat, col, w, dash) / latBand(c, V, lat0, lat1, fill)   inside the clipped disc (drawGlobe `inside`)
//   nightShade(c, V, sun, a)   graticule(c, V, o)   squash(V, [x, y])
//   obliqueCam({cx, cy, k, alpha, yaw})    plane seen from above at elevation alpha: P(X, Y, Z) → [x, y, depth],
//                                          vec(v) → view vector (for axisView). +Y → right, +X → toward the viewer,
//                                          Z = plane normal (up). Counter-clockwise about +Z looks counter-clockwise.
//   v3: dot, cross, unit, add, sub, mul
import fs from 'node:fs';
import {rgba, clamp, lerp, poly, line, ring, glow, arrow, TAU} from './draw.mjs';

export const D2R = Math.PI / 180;

// ---------------------------------------------------------------- vectors
export const E3 = (lat, lon) => { const a = lat * D2R, b = lon * D2R, ca = Math.cos(a); return [ca * Math.sin(b), Math.sin(a), ca * Math.cos(b)]; };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ---------------------------------------------------------------- projection
export function makeView(lay, lam, tilt = 0, roll = 0) {
  return {...lay, lam, tilt, roll, cl: Math.cos(lam * D2R), sl: Math.sin(lam * D2R), ct: Math.cos(tilt * D2R), st: Math.sin(tilt * D2R),
    cr: Math.cos(roll * D2R), sr: Math.sin(roll * D2R)};
}
export const toView = (V, x, y, z) => {
  const x1 = x * V.cl - z * V.sl, z1 = x * V.sl + z * V.cl, b = y * V.ct - z1 * V.st, c = y * V.st + z1 * V.ct;
  return [x1 * V.cr - b * V.sr, x1 * V.sr + b * V.cr, c];
};
/** inverse of toView without the spin (view coords → pre-spin Earth frame) */
export const fromView = (V, [a, b, c]) => { const a1 = a * V.cr + b * V.sr, b1 = -a * V.sr + b * V.cr; return [a1, b1 * V.ct + c * V.st, -b1 * V.st + c * V.ct]; };
/** screen point (unsquashed); back-hemisphere points are mirrored outside the disc so clipping cuts at the limb */
export function gmap(V, v) {
  const [a, b, c] = toView(V, v[0], v[1], v[2]);
  if (c >= 0) return [V.cx + V.R * a, V.cy - V.R * b, c];
  const r = Math.hypot(a, b) || 1e-9, rho = 2 - r;
  return [V.cx + V.R * rho * a / r, V.cy - V.R * rho * b / r, c];
}
export const proj = (V, lat, lon) => gmap(V, E3(lat, lon));
/** path through gmap points; consecutive back-side points follow the limb so clipped fills close correctly */
export function tracePts(c, V, P, close) {
  let pa = null;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (!pa) { c.moveTo(p[0], p[1]); pa = p; continue; }
    if (p[2] < 0 && pa[2] < 0) {
      const a0 = Math.atan2(pa[1] - V.cy, pa[0] - V.cx); let da = Math.atan2(p[1] - V.cy, p[0] - V.cx) - a0;
      da = ((da + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (Math.abs(da) > 0.08) {
        const r0 = Math.hypot(pa[0] - V.cx, pa[1] - V.cy), r1 = Math.hypot(p[0] - V.cx, p[1] - V.cy), n = Math.ceil(Math.abs(da) / 0.06);
        for (let k = 1; k < n; k++) { const a = a0 + da * k / n, r = lerp(r0, r1, k / n); c.lineTo(V.cx + r * Math.cos(a), V.cy + r * Math.sin(a)); }
      }
    }
    c.lineTo(p[0], p[1]); pa = p;
  }
  if (close) c.closePath();
}

// ---------------------------------------------------------------- oblate squash (screen space, about the disc centre)
function setSquash(V) {
  V.k = 1; V.u = [0, -1];
  if (!V.flat || !V.axis) return V;
  const n = V.axis, nc = clamp(n[2], -1, 1), h = Math.hypot(n[0], n[1]);
  V.k = Math.sqrt(nc * nc + (1 - V.flat) ** 2 * (1 - nc * nc));
  if (h > 1e-6) V.u = [n[0] / h, -n[1] / h];
  return V;
}
/** a point of the round-globe picture → the squashed (oblate) picture */
export function squash(V, p) {
  if (!V.k || V.k === 1) return p;
  const dx = p[0] - V.cx, dy = p[1] - V.cy, t = dx * V.u[0] + dy * V.u[1], m = (V.k - 1) * t;
  return [p[0] + m * V.u[0], p[1] + m * V.u[1], p[2]];
}
function applySquash(c, V) {
  if (!V.k || V.k === 1) return;
  const [ux, uy] = V.u, m = V.k - 1, a = 1 + m * ux * ux, b = m * ux * uy, d = 1 + m * uy * uy;
  c.transform(a, b, b, d, V.cx - a * V.cx - b * V.cy, V.cy - b * V.cx - d * V.cy);
}

// ---------------------------------------------------------------- land (Natural Earth rings)
/** file: JSON {rings: [[[lon, lat], …], …]} (e.g. episodes/<slug>/land.json, Natural Earth 1:110m) */
export function loadLand(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')).rings;
  return raw.map(r => {
    const ll = [];
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i]; let blon = r[i + 1][0]; const blat = r[i + 1][1];
      if (blon - a[0] > 180) blon -= 360; else if (blon - a[0] < -180) blon += 360;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(blon - a[0]), Math.abs(blat - a[1])) / 2));
      for (let k = 0; k < n; k++) ll.push([a[1] + (blat - a[1]) * k / n, a[0] + (blon - a[0]) * k / n]);
    }
    let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
    for (const [lo, la] of r) { lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); la0 = Math.min(la0, la); la1 = Math.max(la1, la); }
    return {raw: r, v: ll.map(([la, lo]) => E3(la, lo)), box: [lo0, lo1, la0, la1]};
  });
}
function inRing(R, lon, lat) {
  const [lo0, lo1, la0, la1] = R.box; if (lat < la0 || lat > la1 || lon < lo0 || lon > lo1) return false;
  let ins = false; const r = R.raw;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && Math.abs(xi - xj) < 180 && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
/** the point straight behind the globe (lat, lon) — rings containing it need an outer circle for even-odd fills */
function antiPoint(V) { const b = fromView(V, [0, 0, -1]); return [Math.asin(clamp(b[1], -1, 1)) / D2R, (((Math.atan2(b[0], b[2]) / D2R + V.lam) % 360 + 540) % 360) - 180]; }
export function landPath(c, V, land) {
  const [alat, alon] = antiPoint(V);
  c.beginPath();
  for (const R of land) {
    const P = R.v.map(v => gmap(V, v));
    if (!P.some(p => p[2] > 0)) continue;
    tracePts(c, V, P, true);
    if (inRing(R, alon, alat)) { c.moveTo(V.cx + V.R * 2.2, V.cy); c.arc(V.cx, V.cy, V.R * 2.2, 0, TAU); c.closePath(); }
  }
}

// ---------------------------------------------------------------- drawing
export const GLOBE_PAL = {ocean0: '#2B6A80', ocean1: '#0C2F40', ocean2: '#06202C', land: '#5A6A55', landEdge: '#93A68C', grat: '#9EC6D2',
  rim: '#BFE4F2', halo: '#7FC8E6', axis: '#ECE4D6', night: '#000A12'};
const latPts = (V, lat, n = 120) => Array.from({length: n + 1}, (_, i) => proj(V, lat, i * 360 / n));
/** latitude circle, limb-clipped (call inside the disc clip, e.g. from drawGlobe's `inside`) */
export function latLine(c, V, lat, col, w = 1, dash = null) {
  c.save(); if (dash) c.setLineDash(dash);
  c.beginPath(); tracePts(c, V, latPts(V, lat), true); c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.restore();
}
/** filled band between two latitudes (call inside the disc clip) */
export function latBand(c, V, lat0, lat1, fill) {
  const [alat] = antiPoint(V);
  c.beginPath();
  tracePts(c, V, latPts(V, lat0), true); tracePts(c, V, latPts(V, lat1), true);
  if (alat > lat0 && alat < lat1) { c.moveTo(V.cx + V.R * 2.2, V.cy); c.arc(V.cx, V.cy, V.R * 2.2, 0, TAU); c.closePath(); }
  c.fillStyle = fill; c.fill('evenodd');
}
export function graticule(c, V, {a = 0.2, col = GLOBE_PAL.grat, lats = [-60, -30, 30, 60], lonStep = 30, w = 1} = {}) {
  c.lineWidth = w; c.strokeStyle = rgba(col, a);
  for (const la of lats) { c.beginPath(); tracePts(c, V, latPts(V, la), true); c.stroke(); }
  for (let lo = 0; lo < 360; lo += lonStep) { c.beginPath(); tracePts(c, V, Array.from({length: 61}, (_, i) => proj(V, -90 + i * 3, lo)), false); c.stroke(); }
}
/** a view whose north axis points along the view vector n. Spin: `spin` = longitude facing the viewer, or give
 *  `sun` (view vector) + `sunLon` to put the subsolar point at that longitude. flat = drawn flattening (0 = sphere). */
export function axisView(lay, n, {spin = 0, sun = null, sunLon = null, flat = 0} = {}) {
  n = unit(n);
  const tilt = Math.asin(clamp(n[2], -1, 1)) / D2R, roll = Math.atan2(-n[0], n[1]) / D2R;
  let lam = spin;
  if (sun && sunLon != null) { const pre = fromView(makeView(lay, 0, tilt, roll), sun); lam = sunLon - Math.atan2(pre[0], pre[2]) / D2R; }
  const V = makeView(lay, lam, tilt, roll);
  V.axis = n; V.sun = sun ? unit(sun) : null; V.flat = flat;
  return setSquash(V);
}
/** the night hemisphere on the visible disc (true terminator for sun = view vector toward the Sun) */
export function nightShade(c, V, s, a = 0.6, col = GLOBE_PAL.night) {
  const {cx, cy, R} = V, rho = Math.hypot(s[0], s[1]);
  if (rho < 1e-4) { if (s[2] < 0) { c.fillStyle = rgba(col, a); c.fillRect(cx - R, cy - R, 2 * R, 2 * R); } return; }
  const th = Math.atan2(s[1], s[0]), u = [-Math.sin(th), Math.cos(th)], w = [-s[2] * Math.cos(th), -s[2] * Math.sin(th)], pts = [];
  for (let i = 0; i <= 64; i++) { const q = Math.PI * i / 64; pts.push([cx + R * (Math.cos(q) * u[0] + Math.sin(q) * w[0]), cy - R * (Math.cos(q) * u[1] + Math.sin(q) * w[1])]); }
  const term = pts.slice();
  for (let i = 0; i <= 64; i++) { const ph = th + 1.5 * Math.PI - Math.PI * i / 64; pts.push([cx + R * Math.cos(ph), cy - R * Math.sin(ph)]); }
  poly(c, pts, rgba(col, a));
  line(c, term, rgba(col, a * 0.3), Math.max(2, R * 0.07));
}
const LIGHT = unit([-0.45, 0.55, 0.7]);
/**
 * o: {land (from loadLand), sun (view vector; default V.sun, else a soft upper-left light), night (alpha of the night
 *  side, 0 = none; default 0.78 with a sun, 0 without), grat (alpha), lats [lat…], equator (alpha, default 0.4),
 *  band: {lat: 15, col, a} highlighted band ±lat, pal, inside(c, V) extra drawing inside the clipped disc, halo}
 */
export function drawGlobe(stage, V, o = {}) {
  const {ctx: c} = stage, {cx, cy, R} = V, pal = {...GLOBE_PAL, ...(o.pal || {})}, sun = o.sun ?? V.sun, s = sun || LIGHT;
  c.save(); applySquash(c, V);
  if (o.halo !== false) glow(c, cx, cy, R * 1.16, pal.halo, 0.05);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  const sp = [cx + R * s[0] * 0.8, cy - R * s[1] * 0.8], g = c.createRadialGradient(sp[0], sp[1], R * 0.05, cx, cy, R * 1.1);
  g.addColorStop(0, pal.ocean0); g.addColorStop(0.55, pal.ocean1); g.addColorStop(1, pal.ocean2);
  c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  if (o.grat) graticule(c, V, {a: o.grat, col: pal.grat});
  if (o.land && R >= 16) {
    landPath(c, V, o.land); c.fillStyle = pal.land; c.fill('evenodd');
    if (R >= 40) { c.strokeStyle = rgba(pal.landEdge, 0.5); c.lineWidth = 1; c.lineJoin = 'round'; c.stroke(); }
  }
  if (o.band) latBand(c, V, -o.band.lat, o.band.lat, rgba(o.band.col, o.band.a ?? 0.25));
  const eqA = o.equator ?? 0.4;
  if (eqA > 0) latLine(c, V, 0, rgba(o.band ? o.band.col : pal.grat, o.band ? Math.min(1, eqA * 1.6) : eqA), R > 120 ? 1.6 : 1.1);
  for (const la of o.lats || []) latLine(c, V, la, rgba(pal.grat, 0.3), 1);
  o.inside?.(c, V);
  const night = o.night ?? (sun ? 0.78 : 0);
  if (night > 0 && sun) nightShade(c, V, sun, night, pal.night);
  if (!sun) {                                                    // soft limb darkening for the light-less look
    const v = c.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.4, cx, cy, R * 1.02);
    v.addColorStop(0, 'rgba(0,10,18,0)'); v.addColorStop(1, 'rgba(0,10,18,0.55)'); c.fillStyle = v; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  }
  c.restore();
  ring(c, cx, cy, R, rgba(pal.rim, 0.35), R > 100 ? 1.6 : 1.2);
  c.restore();
}
/** screen point of the axis at `len` globe radii (sg = +1 north, −1 south). len ≤ 1 lies on/inside the globe and is
 *  squashed with it (the pole of an oblate globe); len > 1 marks a direction and is NOT squashed, so a tip traced
 *  with obliqueCam.P(len·R·n) stays on the same circle while the axis turns. */
export const axisTip = (V, len = 1.4, sg = 1) => {
  const p = [V.cx + V.R * len * sg * V.axis[0], V.cy - V.R * len * sg * V.axis[1]];
  return len <= 1 ? squash(V, p) : p;
};
/** axis ends beyond the poles: the end pointing away from the camera is drawn before the globe (the globe hides it) */
export function axisEnds(stage, V, which, o = {}) {
  const n = V.axis, northFront = n[2] >= 0, len = o.len ?? 1.4, col = o.col ?? GLOBE_PAL.axis, w = o.w ?? Math.max(2, V.R / 45);
  for (const sg of [1, -1]) {
    if ((which === 'front') !== ((sg > 0) === northFront)) continue;
    const a = axisTip(V, 1, sg), b = axisTip(V, len, sg);
    if (sg > 0 && o.head !== false) arrow(stage.ctx, a, b, col, w, {head: Math.max(10, w * 4.5)}); else line(stage.ctx, [a, b], col, w);
  }
}
export function globeWithAxis(stage, V, o = {}) {
  axisEnds(stage, V, 'back', o);
  drawGlobe(stage, V, o);
  if (o.through !== false) line(stage.ctx, [axisTip(V, 1, -1), axisTip(V, 1, 1)], rgba(o.col ?? GLOBE_PAL.axis, 0.32), Math.max(1.2, V.R / 70), {dash: [5, 5]});
  axisEnds(stage, V, 'front', o);
}
/** [x, y, front] of a surface point (squashed) */
export function surfacePoint(V, lat, lon) {
  const v = toView(V, ...E3(lat, lon));
  return [...squash(V, [V.cx + V.R * v[0], V.cy - V.R * v[1]]).slice(0, 2), v[2] >= 0];
}
/** points of a latitude circle with front flags (squashed), for custom strokes outside drawGlobe */
export function latitudePts(V, lat, n = 240) { return Array.from({length: n + 1}, (_, i) => surfacePoint(V, lat, i * 360 / n)); }

// ---------------------------------------------------------------- oblique plane camera (orbits, ecliptic)
/** k = px per world unit, alpha = elevation of the line of sight above the plane (90 = straight down), yaw turns the
 *  plane about its normal first. P(X, Y, Z) → [x, y, depth (larger = nearer)], vec(v) → view vector for axisView. */
export function obliqueCam({cx, cy, k = 1, alpha = 30, yaw = 0}) {
  const sa = Math.sin(alpha * D2R), ca = Math.cos(alpha * D2R), cy0 = Math.cos(yaw * D2R), sy0 = Math.sin(yaw * D2R);
  const rot = (X, Y) => [X * cy0 - Y * sy0, X * sy0 + Y * cy0];
  const P = (X, Y, Z = 0) => { const [x, y] = rot(X, Y); return [cx + k * y, cy + k * (sa * x - ca * Z), ca * x + sa * Z]; };
  const vec = v => { const [x, y] = rot(v[0], v[1]); return [y, -sa * x + ca * v[2], ca * x + sa * v[2]]; };
  return {cx, cy, k, alpha, yaw, sa, ca, P, vec};
}
