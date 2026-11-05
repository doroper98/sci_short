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

// =====================================================================================================
// 3D space scenes (added for episodes/precession, 2026-11-03 revision): a perspective camera, a per-pixel lit
// Earth (soft terminator, ocean glint, ice, clouds, atmosphere) and a star field on the celestial sphere.
// World frame is the caller's (precession uses X, Y = ecliptic plane, Z = ecliptic north). Everything above
// this section is unchanged and still used by the earlier API.
//
//   lookCam({pos, target | dir, up, F, cx, cy})   perspective camera: P(p) → [x, y, z (distance along view)],
//                     dirP(s) → screen point of a direction at infinity (null behind), hidden(p, c, R) → is p
//                     behind the sphere (c, R) seen from pos, ray(x, y). Right = f × up (right-handed world).
//   earthTextures(land, {W, H, seed})   equirectangular albedo + ocean mask + clouds from Natural Earth rings
//                     (built once, ~1 s). Land colours are a muted latitude/noise palette (NOT satellite data).
//   drawEarthLit(stage, cam, tex, {axis, spin, sun, flat, center, R, clouds, cloudA, night, spec, atmo,
//                     plane: {n, p, col, a}, scale, alpha})   ray-traced oblate Earth; spin (deg) turns it
//                     west → east about `axis` (counter-clockwise seen from above the north pole).
//   makeStars(n, seed, {band})  →  [{v, m}]   random faint stars on the sphere (v unit vector, m 0..1 bright)
// =====================================================================================================
import {createCanvas} from '@napi-rs/canvas';

export function lookCam({pos, target = null, dir = null, up = [0, 0, 1], F = 900, cx = 540, cy = 960, ortho = 0}) {
  const f = unit(dir || sub(target, pos));
  let r = cross(f, up); if (Math.hypot(r[0], r[1], r[2]) < 1e-6) r = cross(f, [1, 0, 0]); r = unit(r);
  const u = cross(r, f);
  const P = ortho ? p => { const d = sub(p, pos); return [cx + ortho * dot(d, r), cy - ortho * dot(d, u), dot(d, f)]; }
    : p => { const d = sub(p, pos), z = dot(d, f); return [cx + F * dot(d, r) / z, cy - F * dot(d, u) / z, z]; };
  const dirP = s => { const z = dot(s, f); return ortho ? null : z > 1e-4 ? [cx + F * dot(s, r) / z, cy - F * dot(s, u) / z, z] : null; };
  const ray = (x, y) => unit(add(f, add(mul(r, (x - cx) / F), mul(u, -(y - cy) / F))));
  /** is world point p hidden behind the sphere (centre c, radius R) as seen from the camera? */
  const hidden = (p, c = [0, 0, 0], R = 1) => {
    if (ortho) { const d = sub(p, c), a = dot(d, r), b = dot(d, u), w = dot(d, f); return a * a + b * b < R * R && w > -Math.sqrt(R * R - a * a - b * b) + 1e-4; }
    const d = sub(p, pos), L = Math.hypot(d[0], d[1], d[2]); if (L < 1e-9) return false;
    const dn = [d[0] / L, d[1] / L, d[2] / L], oc = sub(pos, c), b = dot(oc, dn), disc = b * b - (dot(oc, oc) - R * R);
    if (disc <= 0) return false; const t0 = -b - Math.sqrt(disc); return t0 > 1e-6 && t0 < L - 1e-4;
  };
  return {pos, f, r, u, F, cx, cy, ortho, P, dirP, ray, hidden};
}

// ---- value noise on the sphere (deterministic; for texture building only) ----
function hash3(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, q) => a + (b - a) * q;
  return L(L(L(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u), L(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u), v),
    L(L(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u), L(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u), v), w);
}
function fbm(x, y, z, s, oct = 5) { let a = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { a += amp * vnoise(x * f, y * f, z * f, s + i * 17); n += amp; amp *= 0.5; f *= 2.03; } return a / n; }

const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const EARTH_COL = {deep: '#0A2638', shallow: '#1A5470', forest: '#2E4A2B', savanna: '#6A6743', desert: '#A08A60', temperate: '#4B5F36',
  boreal: '#36472F', tundra: '#6A6858', ice: '#E6ECEF', seaice: '#CBD8DE'};
/** equirectangular textures (x: lon −180 → 180, y: lat 90 → −90) from Natural Earth rings (loadLand output or raw rings) */
export function earthTextures(land, {W = 2048, H = 1024, seed = 3, CW = 1024, CH = 512} = {}) {
  const rings = land.map(R => R.raw || R);
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.beginPath();
  const X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * H;
  for (const r of rings) {
    const un = [[r[0][0], r[0][1]]];
    for (let i = 1; i < r.length; i++) { let lo = r[i][0]; const pl = un[i - 1][0]; while (lo - pl > 180) lo -= 360; while (lo - pl < -180) lo += 360; un.push([lo, r[i][1]]); }
    const net = un[un.length - 1][0] - un[0][0];
    if (Math.abs(net) > 300) { const lat0 = un.reduce((m, p) => m + p[1], 0) < 0 ? -90 : 90; un.push([un[un.length - 1][0], lat0], [un[0][0], lat0]); }
    for (const sh of [-360, 0, 360]) un.forEach(([lo, la], i) => (i ? c.lineTo(X(lo + sh), Y(la)) : c.moveTo(X(lo + sh), Y(la))));
    c.closePath();
  }
  c.fillStyle = '#fff'; c.fill('evenodd');
  const img = c.getImageData(0, 0, W, H).data, mask = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = img[i * 4] / 255;
  // coastal shallows: separable box blur of the land mask (wraps in longitude)
  const blur = (src, rad) => {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) { let s = 0; for (let k = -rad; k <= rad; k++) s += src[y * W + ((k + W) % W)]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * rad + 1); s += src[y * W + ((x + rad + 1) % W)] - src[y * W + ((x - rad + W) % W)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let k = -rad; k <= rad; k++) s += tmp[Math.min(H - 1, Math.max(0, k)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / (2 * rad + 1); s += tmp[Math.min(H - 1, y + rad + 1) * W + x] - tmp[Math.max(0, y - rad) * W + x]; } }
    return out;
  };
  const near = blur(blur(mask, 5), 5);
  const C = Object.fromEntries(Object.entries(EARTH_COL).map(([k, v]) => [k, hexRGB(v)]));
  const albedo = new Uint8Array(W * H * 3), ocean = new Uint8Array(W * H);
  const mixc = (a, b, q) => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
  const sm = (a, b, x) => { const q = Math.min(1, Math.max(0, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * 180 / H, cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R), al = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const i = y * W + x, lon = -180 + (x + 0.5) * 360 / W, px = cl * Math.cos(lon * D2R), py = cl * Math.sin(lon * D2R), pz = sl;
      const m = mask[i]; let col;
      // ocean: deep → shallow near coasts, sea ice near the poles
      let oc = mixc(C.deep, C.shallow, sm(0.02, 0.5, near[i]) * 0.8);
      const nIce = fbm(px * 6, py * 6, pz * 6, seed + 40, 3);
      const seaIce = lat > 0 ? sm(74, 80, lat + (nIce - 0.5) * 9) : sm(64, 70, -lat + (nIce - 0.5) * 7);
      oc = mixc(oc, C.seaice, seaIce * 0.92);
      if (m > 0) {
        const n1 = fbm(px * 3.2, py * 3.2, pz * 3.2, seed, 4), n2 = fbm(px * 9, py * 9, pz * 9, seed + 9, 3);
        const dry = Math.exp(-(((al - 24) / 10) ** 2)) * sm(0.38, 0.62, n1 + 0.12) + 0.25 * sm(0.6, 0.8, n1) * sm(30, 45, al) * (1 - sm(50, 55, al));
        let base = al < 14 ? mixc(C.forest, C.savanna, sm(8, 14, al) * 0.6) : al < 32 ? mixc(C.savanna, C.temperate, sm(26, 34, al)) : al < 52 ? C.temperate : al < 64 ? mixc(C.temperate, C.boreal, sm(52, 60, al)) : mixc(C.boreal, C.tundra, sm(64, 70, al));
        base = mixc(base, C.desert, Math.min(1, dry));
        const ice = lat < -60 ? 1 : (lat > 59 && lon > -74 && lon < -11) ? sm(0.15, 0.5, mask[i] - near[i] * 0.4 + 0.35) * sm(59, 62, lat) : sm(74, 80, lat);
        base = mixc(base, C.ice, Math.min(1, ice));
        const k = 0.86 + 0.28 * n2; base = [base[0] * k, base[1] * k, base[2] * k];
        col = mixc(oc, base, m);
      } else col = oc;
      albedo[i * 3] = Math.min(255, col[0]); albedo[i * 3 + 1] = Math.min(255, col[1]); albedo[i * 3 + 2] = Math.min(255, col[2]);
      ocean[i] = Math.round(255 * (1 - m) * (1 - seaIce));
    }
  }
  // clouds: fbm with a latitude profile (ITCZ, storm tracks; clear subtropics), stretched along longitude
  const cloud = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++) {
    const lat = 90 - (y + 0.5) * 180 / CH, cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R), al = Math.abs(lat);
    const prof = 0.55 * Math.exp(-(((al - 4) / 8) ** 2)) + 0.75 * Math.exp(-(((al - 55) / 14) ** 2)) + 0.18;
    for (let x = 0; x < CW; x++) {
      const lon = (-180 + (x + 0.5) * 360 / CW) * D2R, px = cl * Math.cos(lon), py = cl * Math.sin(lon), pz = sl;
      const n = fbm(px * 4.5, py * 4.5, pz * 9, seed + 77, 5), d = fbm(px * 14, py * 14, pz * 22, seed + 91, 3);
      const v = sm(0.62 - 0.22 * prof, 0.86 - 0.18 * prof, n + 0.12 * (d - 0.5));
      cloud[y * CW + x] = Math.round(255 * v);
    }
  }
  return {W, H, albedo, ocean, CW, CH, cloud};
}

let OFF = null, OFFC = null;
const ATM = [0.45, 0.70, 0.98];
/** Ray-traced Earth (perspective, oblate) drawn into the stage through an offscreen buffer (respects globalAlpha). */
export function drawEarthLit(stage, cam, tex, o = {}) {
  const {ctx} = stage, Wf = stage.W, Hf = stage.H;
  const n = unit(o.axis || [0, 0, 1]), C0 = o.center || [0, 0, 0], Rr = o.R ?? 1, flat = o.flat || 0, sz = 1 / (1 - flat), sz2 = sz * sz;
  let e1 = cross([0, 0, 1], n); if (Math.hypot(e1[0], e1[1], e1[2]) < 1e-6) e1 = [1, 0, 0]; e1 = unit(e1); const e2 = cross(n, e1);
  const toB = v => [dot(v, e1), dot(v, e2), dot(v, n)];
  const ortho = cam.ortho ? cam.ortho * Rr : 0;
  const ow = mul(sub(cam.pos, C0), 1 / Rr), ob = toB(ow), obz = ob[2] * sz, O2c = ob[0] * ob[0] + ob[1] * ob[1] + obz * obz;
  if (!ortho && O2c <= 1.0005) return;
  const fB = toB(cam.f), rB = toB(cam.r), uB = toB(cam.u), sB = unit(toB(o.sun || [1, 0, 0]));
  const F = cam.F, aW = o.atmo ?? 0.055, spin = (o.spin || 0) * D2R, cDrift = (o.cloudDrift || 0) * D2R;
  const night = o.night ?? 0.05, cloudA = o.cloudA ?? 0.85, specA = o.spec ?? 0.55;
  const plane = o.plane, pn = plane ? toB(plane.n) : null, pp = plane ? dot(sub(mul(plane.p || [0, 0, 0], 1), C0), plane.n) / Rr : 0;
  const camSide = plane ? (ortho ? (dot(cam.f, plane.n) <= 0 ? 1 : -1) : (dot(ow, plane.n) - pp >= 0 ? 1 : -1)) : 0, pCol = plane ? hexRGB(plane.col) : null, pA = plane?.a ?? 0;
  const band = o.band, bLat = band ? band.lat * D2R : 0, bCol = band ? hexRGB(band.col) : null, bA = band?.a ?? 0, eqA = o.eqLine ?? 0, eqCol = band ? bCol : [158, 198, 210];
  // screen bbox of the (atmosphere-padded) sphere
  const Ra = 1 + aW;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
  if (ortho) { const c0 = cam.P(C0), rr = Ra * ortho; x0 = c0[0] - rr; x1 = c0[0] + rr; y0 = c0[1] - rr; y1 = c0[1] + rr; }
  else {
    // frustum cull: the padded sphere entirely outside one of the five planes → nothing to draw
    const rel = sub(C0, cam.pos), Rw = Ra * Rr;
    if (dot(rel, cam.f) < -Rw) return;
    const cn = [[0, 0], [Wf, 0], [Wf, Hf], [0, Hf]].map(([x, y]) => cam.ray(x, y));
    for (let k = 0; k < 4; k++) if (dot(unit(cross(cn[k], cn[(k + 1) % 4])), rel) < -Rw) return;   // (r, u, f) is left-handed in world
    const cc = mul(ow, Ra * Ra / O2c), rho = Ra * Math.sqrt(Math.max(0, 1 - Ra * Ra / O2c));
    const w0 = unit(ow), a0 = unit(cross(w0, Math.abs(w0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), b0 = cross(w0, a0);
    for (let k = 0; k < 48; k++) {
      const q = k / 48 * TAU, p = add(C0, mul(add(cc, add(mul(a0, rho * Math.cos(q)), mul(b0, rho * Math.sin(q)))), Rr)), s = cam.P(p);
      if (s[2] <= 0.01) { behind = true; break; }
      x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
    }
  }
  if (behind) { x0 = 0; y0 = 0; x1 = Wf; y1 = Hf; }
  x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(Wf, Math.ceil(x1) + 2); y1 = Math.min(Hf, Math.ceil(y1) + 2);
  if (x1 <= x0 || y1 <= y0) return;
  const sc = o.scale ?? 1, bw = Math.ceil((x1 - x0) * sc), bh = Math.ceil((y1 - y0) * sc);
  if (!OFF || OFF.width < bw || OFF.height < bh) { OFF = createCanvas(Math.max(bw, OFF?.width || 0), Math.max(bh, OFF?.height || 0)); OFFC = OFF.getContext('2d'); }
  const id = OFFC.createImageData(bw, bh), px = new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.length);
  const {W: TW, H: TH, albedo, ocean, CW, CH, cloud} = tex;
  const pw = ortho ? 1 / (ortho * sc) : Math.sqrt(Math.max(1e-6, O2c - 1)) / (F * sc);       // pixel footprint at the limb
  const kx = ortho ? 1 / ortho : 1 / F, eqW = 1.3 * pw;
  const shx = sB[0], shy = sB[1], shz = sB[2], cs = Math.cos(spin), ss = Math.sin(spin);
  const INV_TAU = 1 / TAU, INV_PI = 1 / Math.PI;
  // perspective: origin fixed, direction = f + a r + b u;  ortho: direction f, origin = pos + a r + b u
  const pfx = ortho ? 0 : 1, pox = ortho ? 1 : 0;
  for (let j = 0; j < bh; j++) {
    const b = -((y0 + (j + 0.5) / sc) - cam.cy) * kx;
    const dyx = fB[0] + pfx * b * uB[0], dyy = fB[1] + pfx * b * uB[1], dyz = fB[2] + pfx * b * uB[2];
    const oyx = ob[0] + pox * b * uB[0], oyy = ob[1] + pox * b * uB[1], oyz = ob[2] + pox * b * uB[2];
    let k4 = j * bw * 4;
    for (let i = 0; i < bw; i++, k4 += 4) {
      const a = ((x0 + (i + 0.5) / sc) - cam.cx) * kx;
      const dx = dyx + pfx * a * rB[0], dy = dyy + pfx * a * rB[1], dzr = dyz + pfx * a * rB[2], dz = dzr * sz;
      const Ox = oyx + pox * a * rB[0], Oy = oyy + pox * a * rB[1], Oz = (oyz + pox * a * rB[2]) * sz, O2 = Ox * Ox + Oy * Oy + Oz * Oz;
      const A = dx * dx + dy * dy + dz * dz, B = Ox * dx + Oy * dy + Oz * dz;
      if (B >= 0 && !ortho) continue;
      const h2 = O2 - B * B / A; if (h2 > Ra * Ra * 1.0) continue;
      const h = Math.sqrt(Math.max(0, h2)), cov = Math.min(1, Math.max(0, 0.5 + (1 - h) / pw));
      let hr = 0, hg = 0, hb = 0, ha = 0;
      if (h > 1 - pw) {                                                                          // atmosphere halo
        const tc = -B / A, lx = Ox + tc * dx, ly = Oy + tc * dy, lz = (Oz + tc * dz) / sz, ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
        const lit = Math.min(1, Math.max(0, (lx * shx + ly * shy + lz * shz) / ll * 0.95 + 0.3));
        const alt = Math.max(0, h - 1) / aW, I = alt >= 1 ? 0 : (1 - alt) * (1 - alt) * (1 - alt) * (0.25 + 0.75 * lit);
        hr = ATM[0] * 255; hg = ATM[1] * 255; hb = ATM[2] * 255; ha = Math.min(1, I * 0.85);
      }
      let r = 0, g = 0, bl = 0;
      if (cov > 0) {
        const t = (-B - Math.sqrt(Math.max(0, B * B - A * (O2 - 1)))) / A;
        let qx = Ox + t * dx, qy = Oy + t * dy, qz = Oz + t * dz; if (h > 1) { qx /= h; qy /= h; qz /= h; }
        let nx = qx, ny = qy, nz = qz * sz; const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= nl; ny *= nl; nz *= nl;
        const lat = Math.asin(qz > 1 ? 1 : qz < -1 ? -1 : qz);
        // body longitude: subtract the spin (west → east: the surface turns counter-clockwise about +axis)
        const bx = qx * cs + qy * ss, by = -qx * ss + qy * cs, lon = Math.atan2(by, bx);
        let u = lon * INV_TAU + 0.5; u -= Math.floor(u); const tx = (u * TW) | 0; let ty = ((0.5 - lat * INV_PI) * TH) | 0; if (ty >= TH) ty = TH - 1;
        const ti = ty * TW + tx, ar = albedo[ti * 3], ag = albedo[ti * 3 + 1], ab = albedo[ti * 3 + 2], ocf = ocean[ti] / 255;
        const mu = nx * shx + ny * shy + nz * shz;
        const tq = Math.min(1, Math.max(0, (mu + 0.10) / 0.26)), sunL = tq * tq * (3 - 2 * tq) * (0.22 + 0.9 * (mu > 0 ? mu : 0));
        const dl = 1 / Math.sqrt(dx * dx + dy * dy + dzr * dzr), vx = -dx * dl, vy = -dy * dl, vz = -dzr * dl;
        const nv = Math.max(0, nx * vx + ny * vy + nz * vz);
        const warm = Math.exp(-(mu / 0.13) * (mu / 0.13)) * tq;
        r = ar * (sunL + 0.10 * warm) + 4 * night * 10; g = ag * (sunL - 0.02 * warm) + 9 * night * 10; bl = ab * (sunL - 0.06 * warm) + 16 * night * 10;
        // ocean glint (Blinn) + broad sheen
        if (ocf > 0.02 && mu > -0.05) {
          let hx = shx + vx, hy = shy + vy, hz = shz + vz; const hl = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz); const nh = (nx * hx + ny * hy + nz * hz) * hl;
          if (nh > 0.82) { const lg = Math.log(nh), sp = ocf * specA * (Math.exp(90 * lg) * 1.1 + 0.12 * Math.exp(12 * lg)) * tq; r += 235 * sp; g += 228 * sp; bl += 205 * sp; }
        }
        // clouds (drift slowly east relative to the ground)
        if (cloudA > 0) {
          let cu = (lon - cDrift) * INV_TAU + 0.5; cu -= Math.floor(cu); const ci = (((0.5 - lat * INV_PI) * CH) | 0) * CW + ((cu * CW) | 0), cv = cloud[ci < CW * CH ? ci : CW * CH - 1] / 255 * cloudA;
          if (cv > 0.004) { const cl = 236 * (night * 0.6 + sunL * 1.02); r += (cl - r) * cv; g += (cl - g) * cv; bl += (cl * 1.02 - bl) * cv; }
        }
        // atmosphere: limb brightening on the lit side
        const fr = (1 - nv) * (1 - nv) * (1 - nv), al = Math.min(1, Math.max(0, mu + 0.3));
        r += ATM[0] * 150 * fr * al; g += ATM[1] * 150 * fr * al; bl += ATM[2] * 170 * fr * al;
        if (bA > 0 && (lat < bLat && lat > -bLat)) { r += (bCol[0] - r) * bA; g += (bCol[1] - g) * bA; bl += (bCol[2] - bl) * bA; }
        if (eqA > 0 && lat < eqW && lat > -eqW) { const e = eqA * (1 - Math.abs(lat) / eqW); r += (eqCol[0] - r) * e; g += (eqCol[1] - g) * e; bl += (eqCol[2] - bl) * e; }
        if (plane) {                                                                           // translucent plane in front of this point
          const sd = (qx * pn[0] + qy * pn[1] + (qz / sz) * pn[2]) - pp;
          if (sd * camSide < 0) { r += (pCol[0] - r) * pA; g += (pCol[1] - g) * pA; bl += (pCol[2] - bl) * pA; }
        }
      }
      const al = cov + ha * (1 - cov);
      if (al <= 0.003) continue;
      const kk = cov / al, kh = 1 - kk;
      const o0 = r * kk + hr * kh, o1 = g * kk + hg * kh, o2 = bl * kk + hb * kh;
      px[k4] = o0 > 255 ? 255 : o0 < 0 ? 0 : o0; px[k4 + 1] = o1 > 255 ? 255 : o1 < 0 ? 0 : o1; px[k4 + 2] = o2 > 255 ? 255 : o2 < 0 ? 0 : o2; px[k4 + 3] = 255 * al;
    }
  }
  OFFC.putImageData(id, 0, 0);
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(OFF, 0, 0, bw, bh, x0, y0, bw / sc, bh / sc);
  ctx.restore();
}

/** random faint stars on the celestial sphere; band = {pole: unit vector, w (rad), k} concentrates some into a band (Milky Way) */
export function makeStars(n, seed = 1, band = null) {
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  while (out.length < n) {
    const z = 2 * rnd() - 1, ph = rnd() * TAU, r = Math.sqrt(1 - z * z), v = [r * Math.cos(ph), r * Math.sin(ph), z];
    if (band) { const d = Math.abs(dot(v, band.pole)); if (rnd() > (1 - band.k) + band.k * Math.exp(-((d / band.w) ** 2))) continue; }
    const m = rnd() ** 3.2;                                                                     // mostly faint
    out.push({v, m, tw: rnd() * TAU, hue: rnd()});
  }
  return out;
}
