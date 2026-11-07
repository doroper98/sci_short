// Episode scenes — "지구를 두른 바람의 띠 — 무역풍·무풍대·편서풍"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - ONE stage: an orthographic globe, sub-observer latitude TILT = +12°, spinning west → east (continents move left →
//    right on the visible face). The view-centre longitude λc(t) is a monotone (PCHIP) schedule through way-points so
//    that the Atlantic is on the face in the hook and the voyage, Sahara/Arabia in s12, the tracked parcel in coriolis,
//    and Korea in s19 — the globe never jumps (rates 1–12 °/s, screen-only).
//  - Back-hemisphere geometry is mapped *outside* the disc (radius 2R − r) and everything is clipped to the disc, so
//    land rings, graticule, trails and routes are cut exactly at the limb (no chords across the face). A land ring
//    that contains the antipode of the view centre is inverted with an extra outer circle (even-odd fill).
//  - Atmosphere cross-section on the left limb: an annulus, thickness 0.25·R (≈ 30× exaggerated: 15 km on 6371 km).
//    Shell angle for latitude φ = where the φ circle meets the limb: asin(sin φ / cos TILT) up to 60°, then linear to 90°.
//  - Surface wind field (display units, zonal): trades 0–30° from NE/SE (|v| toward the equator), westerlies 30–60°
//    from SW/NW (poleward), polar easterlies 60–90° from NE/SE (equatorward). Speed shape sin(π q)^0.7 inside each
//    belt, 0 at the belt edges: doldrums (< 4°) and horse latitudes (≈ 30°) are calm. VMAX = 7 °/s on screen.
//  - Ground eastward speed u(φ) = 1674·cos φ km/h (1670 / 1450 / 1330 Seoul / 840 / 0).
//    Hadley's (1735) linear-momentum picture: the parcel keeps 1450 km/h from 30°. The graph shows only the SIGN of the
//    gap (behind → easterly, ahead → westerly); the gap is never printed as a wind speed (real trades ≈ 20–30 km/h).
//  - Zoom strip: the 0–30° (or 30–60°) band unrolled, seen from a window that moves east with the parcel (1450 km/h):
//    the 30° ground is still in that window, other rows slide by (u(φ) − 1450)·k. The Earth-fixed start meridian shears.
//  - Parcel paths on the globe: lat eased 30 → 4° (coriolis) / 30 → 46° (belts); lon drift ∝ ∫(cos30/cos φ − 1) dt
//    scaled to −22° / +16° (display; the real descent takes days).
//  - Insolation Q(φ) = 340·(1 − 0.482·P₂(sin φ)) W/m² (annual mean, top of atmosphere): 422 at 0°, 176 at 90°.
//  - Sound: every table (wind noise amplitude = model surface wind at the tracked latitude, rising tone, sink sweep,
//    10° latitude ticks, rain hiss, voyage winds) is generated from this file:
//      node episodes/global-winds/scenes.mjs --emit-sound [--timeline outputs/global-winds/narration/timeline.json]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, rand, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
const D2R = Math.PI / 180;
export const TILT = 12;
export const U_EQ = 1674;
export const uGround = phi => U_EQ * Math.cos(phi * D2R);
export const U30 = uGround(30);                       // 1449.7 → "1450"
export const P2 = x => (3 * x * x - 1) / 2;
export const insol = phi => 340 * (1 - 0.482 * P2(Math.sin(phi * D2R)));
export const VMAX = 8;                                // °/s on screen at the belt core
export const BELTS = [
  {id: 'trade', lo: 0, hi: 30, a: 4, b: 29, col: '#E3A85E', dir: [-0.80, -0.56], seed: [6, 27]},
  {id: 'west', lo: 30, hi: 60, a: 31, b: 59, col: '#5EC4B2', dir: [0.86, 0.42], seed: [33, 57]},
  {id: 'polar', lo: 60, hi: 90, a: 61, b: 88, col: '#AFCBF2', dir: [-0.80, -0.48], seed: [63, 84]},
];
export const BELT = Object.fromEntries(BELTS.map(b => [b.id, b]));
export const beltOf = phi => { const a = Math.abs(phi); return a < 30 ? BELTS[0] : a < 60 ? BELTS[1] : BELTS[2]; };
/** 0..1 surface wind strength of the belt shape at latitude φ (0 in the doldrums and at the belt edges) */
export function windSpeed(phi) {
  const a = Math.abs(phi), B = beltOf(a), q = (a - B.a) / (B.b - B.a);
  return q <= 0 || q >= 1 ? 0 : Math.sin(Math.PI * q) ** 0.7;
}
/** [u east, v north] in units of VMAX; rot = false → a non-rotating Earth: one cell, straight toward the equator */
export function windUV(phi, rot = true) {
  if (!rot) { const a = Math.abs(phi), q = (a - 4) / 82, s = q <= 0 || q >= 1 ? 0 : Math.sin(Math.PI * q) ** 0.6; return [0, -Math.sign(phi) * s]; }
  const B = beltOf(phi), s = windSpeed(phi), hs = phi >= 0 ? 1 : -1;
  return [B.dir[0] * s, B.dir[1] * s * hs];
}
/** shell angle (deg) for latitude φ on the left limb of a TILT view */
const COS_T = Math.cos(TILT * D2R), ALPHA60 = Math.asin(Math.sin(60 * D2R) / COS_T) / D2R;
export function alphaOfLat(phi) {
  const a = Math.abs(phi), al = a <= 60 ? Math.asin(Math.sin(a * D2R) / COS_T) / D2R : ALPHA60 + (a - 60) / 30 * (90 - ALPHA60);
  return Math.sign(phi) * al;
}

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  sameSide: W('s02', '같은'), stops: W('s02', '멎는'),
  trade: W('s03', '트레이드는'), road: W('s03', '길이라는'), sameRoad: W('s03', '같은'),
  sea: W('s04', '뱃길'), commerce: W('s04', '무역으로'),
  doldrums: W('s05', '돌드럼스는'), slack: W('s05', '처진'), meant: W('s05', '뜻하던'),
  halley: W('s06', '핼리는'), hadleyO: W('s06', '해들리는'), reason: W('s06', '까닭을'),
  sun: W('s07', '태양이고,'), spin: W('s07', '자전입니다.'),
  vertical: W('s08', '수직으로'), sameArea: W('s08', '같은'), twice: W('s08', '두'),
  risesUp: W('s09', '위로'), lowP: W('s09', '기압이'),
  noWind: W('s10', '바람이'), shower: W('s10', '소나기'), doldrumsName: W('s10', '무풍대입니다.'),
  poleward: W('s11', '극'), sink: W('s11', '가라앉아'), highP: W('s11', '고기압을'),
  dry: W('s12', '메말라서,'), sahara: W('s12', '사하라'), deserts: W('s12', '사막이'),
  ret: W('s13', '땅'), hadleyName: W('s13', '해들리'),
  westEast: W('s14', '서쪽에서'), eqGround: W('s14', '적도의'), v1670: W('s14', '천육백칠십킬로미터로'),
  g30: W('s15', '삼십도의'), v1450: W('s15', '천사백오십킬로미터라서,'), depart: W('s15', '적도로'), lag: W('s15', '서쪽으로'),
  fromEast: W('s16', '동쪽에서'), ne: W('s16', '북동무역풍과'), se: W('s16', '남동무역풍입니다.'),
  bent: W('s17', '꺾여'), coriolisName: W('s17', '전향력이라고'),
  from30: W('s18', '삼십도에서'), ahead: W('s18', '앞서'), westerly: W('s18', '편서풍이'),
  korea: W('s19', '우리나라가'), weather: W('s19', '날씨가'), w2e: W('s19', '서쪽에서'),
  polarSink: W('s20', '극에서'), polarE: W('s20', '극동풍이'), three: W('s20', '반구마다'),
  year: W('s21', '천사백구십이년'), trades21: W('s21', '무역풍을'), back: W('s21', '돌아올'), west21: W('s21', '편서풍을'),
  myth: W('s22', '자전이'), only: W('s22', '자전은'), energy: W('s22', '에너지는'),
  quote: W('s23', '바람을'), pattern: W('s23', '바람의'),
};

/** monotone cubic (Fritsch–Carlson) through [[x, y], …] */
function pchip(keys) {
  const x = keys.map(k => k[0]), y = keys.map(k => k[1]), n = x.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = x[i] - x[i - 1], h1 = x[i + 1] - x[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return tt => {
    if (tt <= x[0]) return y[0] + m[0] * (tt - x[0]);
    if (tt >= x[n - 1]) return y[n - 1] + m[n - 1] * (tt - x[n - 1]);
    let i = 0; while (tt > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (tt - x[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}
/** view-centre longitude way-points (unwrapped, decreasing = west → east spin) */
export function spinKeys(tl) {
  const at = r => tl.at(r);
  return [
    [0, -8], [tl.scene('hook').end - 0.4, -58],
    [at(A.sahara) + 1, -330],                    // Sahara + Arabia on the face (s12)
    [at(A.depart) - 2.3, -500],                  // parcel start (30°N 150°W) just left of centre
    [tl.scene('coriolis').end, -556], [at('s18:end'), -566],
    [at('s19:end'), -610],                       // Korea crosses the face during s19
    [at('s21'), -712], [at(A.back), -742], [at('s21:end'), -760],   // Atlantic for the voyage
    [tl.duration, -840],
  ];
}
/** a tracked air parcel: lat eased φ0 → φ1 over [t0, t0+T], lon drift ∝ ∫(cos30/cos φ − 1) dt scaled to `drift` */
function trajectory(t0, T, phi0, phi1, lam0, drift) {
  const N = 600, ts = [], ph = [], la = []; let L = 0;
  for (let i = 0; i <= N; i++) {
    const q = i / N, phi = lerp(phi0, phi1, smooth(q));
    if (i) L += (Math.cos(30 * D2R) / Math.cos(phi * D2R) - 1) * T / N;
    ts.push(t0 + q * T); ph.push(phi); la.push(L);
  }
  const k = drift / la[N];
  const at = tt => { const u = clamp((tt - t0) / T) * N, i = Math.min(N - 1, Math.floor(u)), f = u - i; return [ph[i] + (ph[i + 1] - ph[i]) * f, lam0 + k * (la[i] + (la[i + 1] - la[i]) * f)]; };
  return {t0, T, phi0, phi1, lam0, at, path: tt => { const out = []; const u = clamp((tt - t0) / T) * N; for (let i = 0; i <= u; i += 6) out.push([ph[i], lam0 + k * la[i]]); out.push(at(tt)); return out; }};
}

const MODELS = new WeakMap();
/** everything time-dependent the picture and the sound share */
export function model(tl) {
  let m = MODELS.get(tl); if (m) return m;
  const at = r => tl.at(r), keys = spinKeys(tl), spin = pchip(keys);
  // shell tracker (rise / hadley): latitude φ and height h ∈ [0, 1] in the cross-section
  const tRise0 = at(A.risesUp) - 0.5, tRise1 = at('s09:end') - 0.6;
  const tPole0 = at(A.poleward) - 0.15, tPole1 = at(A.sink) - 0.25;
  const tSink0 = at(A.sink) - 0.1, tSink1 = at(A.sink) + 1.6;
  const tRet0 = at(A.ret) - 0.2, tRet1 = at(W('s13', '돌아가고,')) + 0.7;
  const H_LO = 0.1, H_HI = 0.86;
  const shellAt = tt => {
    if (tt < tRise0) return {phi: 0.5, h: H_LO};
    if (tt < tRise1) return {phi: 0.5, h: lerp(H_LO, H_HI, easeInOut((tt - tRise0) / (tRise1 - tRise0)))};
    if (tt < tPole0) return {phi: 0.5, h: H_HI};
    if (tt < tPole1) return {phi: lerp(0.5, 30, easeInOut((tt - tPole0) / (tPole1 - tPole0))), h: H_HI};
    if (tt < tSink0) return {phi: 30, h: H_HI};
    if (tt < tSink1) return {phi: 30, h: lerp(H_HI, H_LO, easeInOut((tt - tSink0) / (tSink1 - tSink0)))};
    if (tt < tRet0) return {phi: 30, h: H_LO};
    return {phi: lerp(30, 0.5, easeInOut((tt - tRet0) / (tRet1 - tRet0))), h: H_LO};
  };
  // tracked parcels on the face
  const p1 = trajectory(at(A.depart) - 0.1, 9.0, 30, 4, -150, -22);
  const p2 = trajectory(at(A.from30) + 0.45, 5.4, 30, 46, 160, 16);
  // voyage (Columbus 1492–93): outbound Palos → Canaries → San Salvador; return Hispaniola → Azores → Lisbon
  const OUT = [[37.2, -6.9], [28.1, -15.4], [28.0, -40], [26.0, -60], [24.0, -74.5]];
  const RET = [[19.8, -70.7], [26, -66], [32, -55], [35.5, -40], [37.0, -25.1], [38.7, -9.1]];
  const voy = {
    OUT: densify(OUT), RET: densify(RET),
    leg0: [at('s21') + 0.2, at(A.trades21) - 0.05], leg1: [at(A.trades21), at(W('s21', '건넜고,')) + 0.55],
    leg2: [at(A.back) - 0.1, at('s21:end') - 0.25],
  };
  // latitude crossings (every 10°) of the tracked air
  const crossings = [];
  const scan = (f, a, b) => { let prev = f(a); for (let tt = a + 0.01; tt <= b; tt += 0.01) { const cur = f(tt); for (let L = 10; L <= 50; L += 10) if ((prev - L) * (cur - L) < 0) crossings.push({t: tt, lat: L}); prev = cur; } };
  scan(tt => shellAt(tt).phi, tPole0, tPole1 + 0.2);
  scan(tt => shellAt(tt).phi, tRet0, tRet1 + 0.1);
  scan(tt => p1.at(tt)[0], p1.t0, p1.t0 + p1.T + 0.1);
  scan(tt => p2.at(tt)[0], p2.t0, p2.t0 + p2.T + 0.1);
  // surface wind under the shell tracker (0..1): rise = weak doldrums drift dying away, later = belt shape where the parcel is at the surface
  const tCalm = at(A.noWind), rs = tl.scene('rise');
  const surfWind = tt => {
    if (tt < tl.scene('hadley').start) return 0.32 * smooth((tt - rs.start - 0.4) / 0.8) * (1 - smooth((tt - tCalm - 0.1) / 1.4));
    const q = shellAt(tt); return q.h < 0.2 ? windSpeed(q.phi) : null;
  };
  m = {keys, spin, shellAt, surfWind, H_LO, H_HI, tRise0, tRise1, tPole0, tPole1, tSink0, tSink1, tRet0, tRet1, p1, p2, voy, crossings};
  MODELS.set(tl, m);
  return m;
}
/** great-circle-ish densified path through way-points (linear in lat/lon, fine for these short legs) */
function densify(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = [pts[i], pts[i + 1]]; const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 1.5); for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]); }
  out.push(pts[pts.length - 1]);
  const cum = [0]; for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], (out[i][1] - out[i - 1][1]) * Math.cos(out[i][0] * D2R)));
  return {pts: out, cum, len: cum[cum.length - 1], at(q) { const s = clamp(q) * this.len; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]); return [lerp(out[i - 1][0], out[i][0], f), lerp(out[i - 1][1], out[i][1], f), i]; }};
}
/** ship position on the voyage at time t → {lat, lon, leg, q} */
function shipAt(m, tt) {
  const {voy} = m, [a0, a1] = voy.leg0, [b0, b1] = voy.leg1, [c0, c1] = voy.leg2;
  if (tt < b0) { const q = easeInOut((tt - a0) / (a1 - a0)), d = Math.hypot(37.2 - 28.1, 15.4 - 6.9), f = d / voy.OUT.len; const [la, lo] = voy.OUT.at(q * f); return {lat: la, lon: lo, leg: 0, q: q * f}; }
  if (tt < (b1 + c0) / 2) { const f0 = Math.hypot(37.2 - 28.1, 15.4 - 6.9) / voy.OUT.len, q = lerp(f0, 1, easeInOut((tt - b0) / (b1 - b0))); const [la, lo] = voy.OUT.at(q); return {lat: la, lon: lo, leg: 1, q}; }
  const q = easeInOut((tt - c0) / (c1 - c0)); const [la, lo] = voy.RET.at(q); return {lat: la, lon: lo, leg: 2, q};
}

// =====================================================================================================
// Globe engine — orthographic view, exact limb clipping
// =====================================================================================================
const E3 = (lat, lon) => { const a = lat * D2R, b = lon * D2R, ca = Math.cos(a); return [ca * Math.sin(b), Math.sin(a), ca * Math.cos(b)]; };
function makeView(lay, lam, tilt = TILT) {
  return {...lay, lam, cl: Math.cos(lam * D2R), sl: Math.sin(lam * D2R), ct: Math.cos(tilt * D2R), st: Math.sin(tilt * D2R), tilt};
}
const toView = (V, x, y, z) => { const x1 = x * V.cl - z * V.sl, z1 = x * V.sl + z * V.cl; return [x1, y * V.ct - z1 * V.st, y * V.st + z1 * V.ct]; };
/** screen point; back-hemisphere points are mirrored outside the disc (radius 2R − r) so clipping cuts at the limb */
function gmap(V, v) {
  const [a, b, c] = toView(V, v[0], v[1], v[2]);
  if (c >= 0) return [V.cx + V.R * a, V.cy - V.R * b, c];
  const r = Math.hypot(a, b) || 1e-9, rho = 2 - r;
  return [V.cx + V.R * rho * a / r, V.cy - V.R * rho * b / r, c];
}
const proj = (V, lat, lon) => gmap(V, E3(lat, lon));
/** trace a polyline of mapped points into the current path, inserting arc steps where back points swing in angle */
function tracePts(c, V, P, close) {
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
function strokeLL(c, V, ll, col, w, o = {}) {
  const P = ll.map(([la, lo]) => proj(V, la, lo));
  c.beginPath(); tracePts(c, V, P, false);
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  if (o.dash) { c.setLineDash(o.dash); c.lineDashOffset = o.dashOffset || 0; }
  c.stroke(); if (o.dash) c.setLineDash([]);
}
function fillLL(c, V, rings, fill) { c.beginPath(); for (const ll of rings) tracePts(c, V, ll.map(([la, lo]) => proj(V, la, lo)), true); c.fillStyle = fill; c.fill('evenodd'); }

// ---- land (Natural Earth 1:110m, public domain) ----
const LAND = (() => {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'land.json'), 'utf8')).rings;
  return raw.map(r => {
    const ll = [];
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i]; let blon = r[i + 1][0]; const blat = r[i + 1][1];
      if (blon - a[0] > 180) blon -= 360; else if (blon - a[0] < -180) blon += 360;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(blon - a[0]), Math.abs(blat - a[1])) / 2));
      for (let k = 0; k < n; k++) ll.push([a[1] + (blat - a[1]) * k / n, a[0] + (blon - a[0]) * k / n]);
    }
    const v = ll.map(([la, lo]) => E3(la, lo));
    let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
    for (const [lo, la] of r) { lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); la0 = Math.min(la0, la); la1 = Math.max(la1, la); }
    return {raw: r, v, box: [lo0, lo1, la0, la1]};
  });
})();
/** planar ray cast in lon/lat (valid for the antipode latitude −TILT: no ring edge there crosses ±180°) */
function inRing(R, lon, lat) {
  const [lo0, lo1, la0, la1] = R.box; if (lat < la0 || lat > la1 || lon < lo0 || lon > lo1) return false;
  let ins = false; const r = R.raw;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && Math.abs(xi - xj) < 180 && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function landPath(c, V) {
  const alon = ((V.lam + 180) % 360 + 540) % 360 - 180, alat = -V.tilt;
  c.beginPath();
  for (const R of LAND) {
    const P = R.v.map(v => gmap(V, v));
    if (!P.some(p => p[2] > 0)) continue;
    tracePts(c, V, P, true);
    if (inRing(R, alon, alat)) { c.moveTo(V.cx + V.R * 2.2, V.cy); c.arc(V.cx, V.cy, V.R * 2.2, 0, TAU); c.closePath(); }
  }
}
// desert boxes [lat0, lat1, lon0, lon1] (sinking dry air of the subtropical highs), tinted where land
const DESERTS = [[15, 32, -17, 35], [14, 32, 35, 60], [24, 31, 68, 75], [25, 37, -118, -106], [-32, -18, 114, 146], [-28, -16, 11, 25], [-28, -17, -71.5, -68.5]];
/** land ∩ box in lon/lat (Sutherland–Hodgman against the box edges), precomputed once: no clip() at draw time */
function clipRingBox(ring, [a0, a1, b0, b1]) {   // ring: [[lon, lat], …] (Natural Earth order); box: lat a0..a1, lon b0..b1
  let P = ring;
  const edges = [[q => q[0] >= b0, (p, q) => [b0, p[1] + (q[1] - p[1]) * (b0 - p[0]) / (q[0] - p[0])]], [q => q[0] <= b1, (p, q) => [b1, p[1] + (q[1] - p[1]) * (b1 - p[0]) / (q[0] - p[0])]],
    [q => q[1] >= a0, (p, q) => [p[0] + (q[0] - p[0]) * (a0 - p[1]) / (q[1] - p[1]), a0]], [q => q[1] <= a1, (p, q) => [p[0] + (q[0] - p[0]) * (a1 - p[1]) / (q[1] - p[1]), a1]]];
  for (const [inside, cut] of edges) {
    const out = []; if (!P.length) break;
    for (let i = 0; i < P.length; i++) { const cur = P[i], prev = P[(i + P.length - 1) % P.length]; if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(cut(prev, cur)); }
    P = out;
  }
  return P.length > 2 ? P.map(([lo, la]) => [la, lo]) : null;   // → [lat, lon]
}
const boxRing = ([a0, a1, b0, b1]) => { const r = []; for (let lo = b0; lo <= b1; lo += 2) r.push([a0, lo]); for (let lo = b1; lo >= b0; lo -= 2) r.push([a1, lo]); return r; };
const DESERT_POLYS = [0, 1, 2, 3].map(k => {   // 4 nested (shrinking) layers → feathered edges
  const out = [];
  for (const [a0, a1, b0, b1] of DESERTS) { const box = [a0 + 1.6 * k, a1 - 1.6 * k, b0 + 2 * k, b1 - 2 * k];
    for (const R of LAND) { const [lo0, lo1, la0, la1] = R.box; if (lo1 < box[2] || lo0 > box[3] || la1 < box[0] || la0 > box[1]) continue;
      const q = clipRingBox(R.raw.slice(0, -1).filter(([lo]) => Math.abs(lo) < 180), box); if (q) out.push(q); } }
  return out;
});
// ITCZ cloud clusters (Earth-fixed) and doldrums specks
const CLOUDS = Array.from({length: 34}, (_, i) => ({lon: i * 360 / 34 + 6 * (rand(i * 3.3) - 0.5), lat: 5.5 * (rand(i * 5.1 + 1) - 0.5) + 1.5, s: 0.7 + 0.6 * rand(i * 7.7 + 2), k: i}));

const PAL = {ocean0: '#1A4A5E', ocean1: '#0C2F40', ocean2: '#06202C', land: '#5A6A55', landEdge: '#93A68C', desert: '#C3A46B', grat: '#9EC6D2', rim: '#BFE4F2',
  warm: '#F2A65A', cool: '#8EC5F0', sun: '#FFE7B0', mark: '#FFE2C4'};

/**
 * Draw the globe. o: {land:1, desert:0, grat:0.16, heat:0, clouds:0, rain:0, inside(c, V) callback drawn under the shading}
 */
function drawGlobe(stage, V, t, o = {}) {
  const {ctx: c} = stage, {cx, cy, R} = V;
  // faint atmosphere halo
  glow(c, cx, cy, R * 1.12, '#7FC8E6', 0.06);
  const sun = proj(V, 0, V.lam + 40);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  const g = c.createRadialGradient(sun[0], sun[1], R * 0.05, cx, cy, R * 1.05);
  g.addColorStop(0, PAL.ocean0); g.addColorStop(0.6, PAL.ocean1); g.addColorStop(1, PAL.ocean2);
  c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  if ((o.grat ?? 0.16) > 0) graticule(c, V, o.grat ?? 0.16, o.eqLine ?? 0);
  landPath(c, V);
  c.fillStyle = PAL.land; c.fill('evenodd');
  c.strokeStyle = rgba(PAL.landEdge, 0.55); c.lineWidth = 1.1; c.lineJoin = 'round'; c.stroke();
  if (o.desert > 0) withAlpha(c, o.desert, () => { for (const layer of DESERT_POLYS) fillLL(c, V, layer, rgba(PAL.desert, 0.2)); });   // land ∩ desert boxes, feathered
  if (o.heat > 0) withAlpha(c, o.heat, () => {   // warm equatorial band (sun heating)
    fillLL(c, V, [[...Array.from({length: 121}, (_, i) => [-9, i * 3]), ...Array.from({length: 121}, (_, i) => [9, 360 - i * 3])]], rgba('#FF9A4A', 0.16));
    fillLL(c, V, [[...Array.from({length: 121}, (_, i) => [-4, i * 3]), ...Array.from({length: 121}, (_, i) => [4, 360 - i * 3])]], rgba('#FFB070', 0.14));
  });
  o.inside?.(c, V);
  // gentle day shading: highlight near the subsolar point (equator, 40° right of centre), soft darkening at the far limb
  const sh = c.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], R * 2.0);
  sh.addColorStop(0, 'rgba(255,244,226,0.10)'); sh.addColorStop(0.35, 'rgba(255,244,226,0.0)'); sh.addColorStop(0.75, 'rgba(0,8,14,0.30)'); sh.addColorStop(1, 'rgba(0,8,14,0.5)');
  c.fillStyle = sh; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  if (o.clouds > 0) drawClouds(c, V, t, o.clouds, o.rain || 0);
  c.restore();
  ring(c, cx, cy, R, rgba(PAL.rim, 0.35), 1.6);
}
function graticule(c, V, a, eq = 0) {
  c.lineWidth = 1; c.strokeStyle = rgba(PAL.grat, a);
  for (const la of [-60, -30, 30, 60]) { c.beginPath(); tracePts(c, V, Array.from({length: 121}, (_, i) => proj(V, la, i * 3)), true); c.stroke(); }
  for (let lo = 0; lo < 360; lo += 30) { c.beginPath(); tracePts(c, V, Array.from({length: 61}, (_, i) => proj(V, -90 + i * 3, lo)), false); c.stroke(); }
  c.lineWidth = 1.3; c.strokeStyle = rgba(PAL.grat, a * 1.6 + eq * 0.4);
  c.beginPath(); tracePts(c, V, Array.from({length: 121}, (_, i) => proj(V, 0, i * 3)), true); c.stroke();
}
/** satellite-view cloud clusters along the equator (Earth-fixed); rain streaks under them */
function drawClouds(c, V, t, a, rain) {
  for (const cl of CLOUDS) {
    const p = proj(V, cl.lat, cl.lon); if (p[2] < 0.12) continue;
    const ang = Math.atan2(p[1] - V.cy, p[0] - V.cx), s = cl.s * V.R / 260 * (0.75 + 0.25 * Math.sin(t * 0.5 + cl.k));
    c.save(); c.translate(p[0], p[1]); c.rotate(ang); c.scale(Math.max(0.25, p[2]), 1); c.rotate(-ang);
    withAlpha(c, a * smooth((p[2] - 0.12) / 0.2), () => {
      for (const [dx, dy, r] of [[-9, 2, 10], [3, -3, 12], [12, 3, 9], [-2, 5, 9]]) {
        const gg = c.createRadialGradient(dx * s, dy * s, 0, dx * s, dy * s, r * s);
        gg.addColorStop(0, 'rgba(250,252,255,0.95)'); gg.addColorStop(0.6, 'rgba(232,240,246,0.75)'); gg.addColorStop(1, 'rgba(232,240,246,0)');
        c.fillStyle = gg; c.beginPath(); c.arc(dx * s, dy * s, r * s, 0, TAU); c.fill();
      }
    });
    c.restore();
    if (rain > 0) withAlpha(c, rain * smooth((p[2] - 0.2) / 0.2), () => {
      for (let k = 0; k < 4; k++) {
        const ph = ((t * 1.6 + k * 0.25 + cl.k * 0.37) % 1), x = p[0] + (k - 1.5) * 5 * s, y = p[1] + 10 * s + ph * 16 * s;
        line(c, [[x, y], [x - 1.5 * s, y + 6 * s]], rgba('#BFD9EA', 0.8 * (1 - ph)), 1.4);
      }
    });
  }
}

// ---- surface wind particles (Earth-fixed lat/lon, advected by windUV) ----
const PARTS = (() => {
  const list = []; let k = 0;
  for (const B of BELTS) for (const hs of [1, -1]) {
    const n = B.id === 'trade' ? 130 : B.id === 'west' ? 104 : 48;
    for (let i = 0; i < n; i++, k++) list.push({belt: B.id, hs, k, off: rand(k * 3.17 + 0.7)});
  }
  return list;
})();
const LIFE = 2.6, PSTEP = 0.13, NTRAIL = 6;
/** trail of one particle at time t (deterministic: born at a seeded point every LIFE seconds) */
function particleTrail(P, t, rot = true) {
  const B = BELT[P.belt], u = (t / LIFE + P.off), cyc = Math.floor(u), age = (u - cyc) * LIFE;
  const sd = P.k * 13.7 + cyc * 7.31;
  let lat = P.hs * lerp(B.seed[0], B.seed[1], rand(sd)), lon = 360 * rand(sd + 2.9);
  if (!rot) lat = P.hs * lerp(6, 82, rand(sd + 5.3));
  const pts = [[lat, lon]], n = Math.floor(age / PSTEP);
  const step = h => { const [uu, vv] = windUV(lat, rot); lat += vv * VMAX * h; lon += uu * VMAX * h / Math.max(0.15, Math.cos(lat * D2R)); };
  for (let i = 0; i < n; i++) { step(PSTEP); pts.push([lat, lon]); }
  step(age - n * PSTEP); pts.push([lat, lon]);
  return {pts: pts.slice(-NTRAIL - 1), env: Math.sin(Math.PI * age / LIFE), B};
}
/** draw wind particles. alphas: {trade, west, polar} (0..1, per belt); o.rot (false = non-rotating Earth), o.only (hemisphere 1/-1).
 *  Batched: trails and heads are collected per (colour, quantised alpha) bucket and stroked/filled once per bucket. */
function drawWinds(c, V, t, alphas, o = {}) {
  const sc = V.R / 270, NQ = 8, buckets = new Map();
  const bucket = (col, al) => { const q = Math.max(1, Math.round(al * NQ)), k = col + q; let b = buckets.get(k); if (!b) { b = {col, a: q / NQ, lines: [], heads: [], dots: []}; buckets.set(k, b); } return b; };
  for (const P of PARTS) {
    const a = alphas[P.belt] ?? 0; if (a <= 0.01) continue;
    if (o.only && P.hs !== o.only) continue;
    if (o.rot === false && P.belt !== 'trade' && P.belt !== 'west') continue;
    const tr = particleTrail(P, t, o.rot !== false);
    const S = tr.pts.map(([la, lo]) => proj(V, la, lo));
    let zMin = 1; for (const q of S) zMin = Math.min(zMin, q[2]); if (zMin < 0.06) continue;
    const head = S[S.length - 1], prev = S[S.length - 2];
    const col = o.rot === false ? '#D8C9A8' : tr.B.col, al = a * tr.env * (0.35 + 0.65 * smooth((zMin - 0.06) / 0.35));
    if (al < 0.04) continue;
    if (Math.hypot(head[0] - S[0][0], head[1] - S[0][1]) < 2.5) { bucket(col, 0.5 * al).dots.push(head); continue; }
    const B = bucket(col, al); B.lines.push(S);
    const ang = Math.atan2(head[1] - prev[1], head[0] - prev[0]), hl = 7.5 * sc;
    B.heads.push([[head[0] + Math.cos(ang) * hl * 0.6, head[1] + Math.sin(ang) * hl * 0.6], [head[0] + Math.cos(ang + 2.5) * hl, head[1] + Math.sin(ang + 2.5) * hl], [head[0] + Math.cos(ang - 2.5) * hl, head[1] + Math.sin(ang - 2.5) * hl]]);
  }
  c.save(); c.lineWidth = 2.4 * sc; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const B of buckets.values()) {
    if (B.lines.length) { c.beginPath(); for (const S of B.lines) S.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = rgba(B.col, 0.85 * B.a); c.stroke(); }
    if (B.heads.length) { c.beginPath(); for (const h of B.heads) { c.moveTo(...h[0]); c.lineTo(...h[1]); c.lineTo(...h[2]); c.closePath(); } c.fillStyle = rgba(B.col, B.a); c.fill(); }
    if (B.dots.length) { c.beginPath(); for (const [x, y] of B.dots) { c.moveTo(x + 1.6 * sc, y); c.arc(x, y, 1.6 * sc, 0, TAU); } c.fillStyle = rgba(B.col, B.a); c.fill(); }
  }
  c.restore();
}

// ---- atmosphere cross-section on the left limb ----
const GAP = 4, SHK = 0.25;
function shellXY(V, phi, h) {
  const r = V.R + GAP + h * SHK * V.R, a = alphaOfLat(phi) * D2R;
  return [V.cx - r * Math.cos(a), V.cy - r * Math.sin(a)];
}
function chaikin(P, n = 3) {
  let p = P;
  for (let k = 0; k < n; k++) { const q = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } p = q; }
  return p;
}
/** closed loop for a cell: rise at φr, sink at φs (signed latitudes) → points in (φ, h) */
function cellLoop(phiR, phiS) {
  const d = Math.sign(phiS - phiR), m = 3.2, a = phiR + d * m, b = phiS - d * m, h1 = 0.2, h2 = 0.8, P = [];
  const seg = (p0, p1, n) => { for (let i = 0; i < n; i++) P.push([lerp(p0[0], p1[0], i / n), lerp(p0[1], p1[1], i / n)]); };
  seg([a, h1], [a, h2], 4); seg([a, h2], [b, h2], 10); seg([b, h2], [b, h1], 4); seg([b, h1], [a, h1], 10);
  return chaikin(P, 3);
}
const CELLS = [
  {id: 'hadley', rise: 0, sink: 30, col: BELT.trade.col}, {id: 'ferrel', rise: 60, sink: 30, col: BELT.west.col}, {id: 'polar', rise: 60, sink: 90, col: BELT.polar.col},
];
function strokeMoving(c, pts, col, w, t, speed, dash = [9, 9]) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.setLineDash(dash); c.lineDashOffset = -t * speed; c.stroke(); c.setLineDash([]);
}
function arrowsAlong(c, pts, col, t, speed, n, size) {
  const cum = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[cum.length - 1];
  for (let k = 0; k < n; k++) {
    const s = ((t * speed + k * L / n) % L + L) % L; let i = 1; while (cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i % pts.length], f = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    const x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    poly(c, [[x + Math.cos(ang) * size, y + Math.sin(ang) * size], [x + Math.cos(ang + 2.45) * size, y + Math.sin(ang + 2.45) * size], [x + Math.cos(ang - 2.45) * size, y + Math.sin(ang - 2.45) * size]], col);
  }
}
/**
 * The cross-section. o: {a, cells: {hadley, ferrel, polar} (0..1 both hemispheres), single (0..1: one pole-to-equator cell,
 * non-rotating case), rise (0..1 rising arrows at the equator), cb (0..1 cumulonimbus), rain, sinkArr (0..1 down arrows at ±30),
 * trail: [[φ,h], …], tracker: {phi, h, col, a}}
 */
function drawShell(stage, V, t, o) {
  const {ctx: c} = stage, T = stage.theme, a = o.a ?? 1; if (a <= 0) return;
  const r0 = V.R + GAP, r1 = r0 + SHK * V.R, sc = V.R / 262;
  withAlpha(c, a, () => {
    c.beginPath(); c.arc(V.cx, V.cy, r1, Math.PI / 2, Math.PI * 1.5); c.arc(V.cx, V.cy, r0, Math.PI * 1.5, Math.PI / 2, true); c.closePath();
    const g = c.createRadialGradient(V.cx, V.cy, r0, V.cx, V.cy, r1); g.addColorStop(0, rgba('#2A5A6E', 0.55)); g.addColorStop(1, rgba('#0B2733', 0.35));
    c.fillStyle = g; c.fill(); c.strokeStyle = rgba(T.border, 1); c.lineWidth = 1.2; c.stroke();
    // latitude ticks on the outer edge
    for (const la of [-60, -30, 0, 30, 60]) { const p = shellXY(V, la, 1), q = shellXY(V, la, 1.12); line(c, [p, q], rgba(T.muted, 0.7), 1.2); }
    // cumulonimbus at the equator (side view: grows away from the surface = left)
    if (o.cb > 0) withAlpha(c, o.cb, () => {
      const g = 0.35 + 0.65 * o.cb, rr = V.R / 262;
      const puffs = [[0, 0.18, 15], [-2.6, 0.26, 13], [2.6, 0.27, 13], [0, 0.38, 16], [-2.2, 0.5, 14], [2.2, 0.5, 14], [0, 0.62, 15], [-1.5, 0.72, 13], [1.5, 0.72, 13],
        [-5.5, 0.84, 12], [5.5, 0.84, 12], [-8.5, 0.86, 10], [8.5, 0.86, 10], [-2.5, 0.85, 13], [2.5, 0.85, 13]];
      for (const [la, h, r] of puffs) {
        if (h > g + 0.02) continue; const [x, y] = shellXY(V, la, h);
        const gg = c.createRadialGradient(x, y, 0, x, y, r * rr); gg.addColorStop(0, 'rgba(246,249,252,0.95)'); gg.addColorStop(0.55, 'rgba(226,234,240,0.85)'); gg.addColorStop(1, 'rgba(210,222,230,0)');
        c.fillStyle = gg; c.beginPath(); c.arc(x, y, r * rr, 0, TAU); c.fill();
      }
      if (o.rain > 0) for (let k = 0; k < 6; k++) {
        const la = -3.5 + k * 1.4, ph = (t * 1.8 + k * 0.31) % 1, p = shellXY(V, la, 0.12 - 0.1 * ph), q = shellXY(V, la + 0.4, 0.06 - 0.1 * ph);
        line(c, [p, q], rgba('#BFD9EA', o.rain * (1 - ph)), 1.6);
      }
    });
    // rising arrows at the equator
    if (o.rise > 0) withAlpha(c, o.rise, () => {
      for (const la of [-1.6, 1.6]) {
        const pts = Array.from({length: 12}, (_, i) => shellXY(V, la, 0.08 + 0.8 * i / 11));
        c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.strokeStyle = rgba(PAL.warm, 0.9); c.lineWidth = 2.4 * sc; c.setLineDash([7, 7]); c.lineDashOffset = -t * 28; c.stroke(); c.setLineDash([]);
        arrow(c, pts[9], pts[11], PAL.warm, 2.4 * sc, {head: 10 * sc});
      }
    });
    if (o.sinkArr > 0) withAlpha(c, o.sinkArr, () => {
      for (const la of [30, -30]) { const p = shellXY(V, la, 0.85), q = shellXY(V, la, 0.15); arrow(c, p, q, rgba(PAL.cool, 0.9), 2.2 * sc, {head: 10 * sc, dash: [6, 6]}); }
    });
    // circulation cells (both hemispheres)
    for (const C of CELLS) {
      const ca = o.cells?.[C.id] ?? 0; if (ca <= 0) continue;
      for (const hs of [1, -1]) {
        const pts = cellLoop(hs * C.rise, hs * C.sink).map(([la, h]) => shellXY(V, la, h));
        withAlpha(c, ca, () => { strokeMoving(c, pts, rgba(C.col, 0.95), 2.4 * sc, t, 26 * sc); arrowsAlong(c, pts, C.col, t, 26 * sc, 3, 7 * sc); });
      }
    }
    if (o.single > 0) for (const hs of [1, -1]) {
      const pts = cellLoop(0, hs * 90).map(([la, h]) => shellXY(V, la, h));
      withAlpha(c, o.single, () => { strokeMoving(c, pts, rgba('#D8C9A8', 0.95), 2.2 * sc, t, 26 * sc); arrowsAlong(c, pts, '#D8C9A8', t, 26 * sc, 4, 7 * sc); });
    }
    // tracker path + tracker
    if (o.trail?.length > 1) line(c, o.trail.map(([la, h]) => shellXY(V, la, h)), rgba(PAL.mark, 0.55 * (o.trailA ?? 1)), 2.2, {dash: [5, 6]});
    if (o.tracker?.a > 0) withAlpha(c, o.tracker.a, () => tracker(c, ...shellXY(V, o.tracker.phi, o.tracker.h), o.tracker.col, sc));
  });
}
function tracker(c, x, y, col, sc = 1) {
  glow(c, x, y, 26 * sc, col, 0.35); circle(c, x, y, 9 * sc, rgba('#06222E', 0.7)); ring(c, x, y, 9 * sc, col, 3 * sc); circle(c, x, y, 3 * sc, col);
}
/** pressure letters inside the disc near the left limb */
function pressureLetter(stage, V, phi, ch, a, col) {
  if (a <= 0) return;
  const al = alphaOfLat(phi) * D2R, r = V.R - 20 * V.R / 262, x = V.cx - r * Math.cos(al), y = V.cy - r * Math.sin(al);
  withAlpha(stage.ctx, a, () => {
    circle(stage.ctx, x, y, 17 * V.R / 262, rgba('#06222E', 0.72));
    stage.text(ch, x, y + 1, {role: 'display', size: Math.max(24, Math.round(26 * V.R / 262)), weight: 700, color: col, align: 'center'});
  });
}

// ---- small glyphs ----
function ship(c, x, y, s, face, sail, a = 1, col = '#EDE3D2') {
  // local frame: bow toward +x; face = +1 sails right (east), −1 left (west). Wind from astern → the sail bellies toward the bow.
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(face * s, s);
    poly(c, [[-13, 0], [18, 0], [10, 7], [-11, 7]], rgba('#3B2E24', 1), col, 1.6 / s);
    line(c, [[1, 0], [1, -27]], col, 1.8 / s);
    if (sail === 'full') {
      line(c, [[1, -24], [3, -24]], col, 1.4 / s);
      c.beginPath(); c.moveTo(1, -24); c.quadraticCurveTo(17, -14, 1, -4); c.closePath(); c.fillStyle = col; c.fill();
      c.beginPath(); c.moveTo(4, -20); c.quadraticCurveTo(11, -14, 4, -8); c.strokeStyle = rgba('#000', 0.22); c.lineWidth = 1 / s; c.stroke();
    } else {
      line(c, [[-8, -24], [10, -24]], col, 1.6 / s);                       // yard
      c.beginPath(); c.moveTo(-7, -24); c.lineTo(9, -24); c.lineTo(6, -9); c.quadraticCurveTo(1, -6, -4, -9); c.closePath();
      c.fillStyle = rgba(col, 0.78); c.fill();
      for (const xx of [-2, 2.5]) line(c, [[xx, -23], [xx * 0.8, -9]], rgba('#000', 0.25), 1 / s);   // limp folds
    }
    c.restore();
  });
}
function cloudGlyph(c, x, y, s, a) {
  withAlpha(c, a, () => {
    for (const [dx, dy, r] of [[-10, 3, 8], [0, -3, 11], [11, 2, 8], [3, 5, 8]]) circle(c, x + dx * s, y + dy * s, r * s, rgba('#E9EFF3', 0.93));
    line(c, [[x - 15 * s, y + 10 * s], [x + 17 * s, y + 10 * s]], rgba('#9FB4C0', 0.9), 1.5);
  });
}

// =====================================================================================================
// Palette helpers, labels
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
/** scene-specific panels fade out just before the scene cut (nothing vanishes in one frame) */
const endFade = (t, ctx, d = 0.5) => fadeOut(t, ctx.scene.end - d - 0.05, d);
const evT = (ctx, id, fallback) => (ctx.events.has(id) ? ctx.events.get(id).time : ctx.tl.at(fallback));
const M = ctx => model(ctx.tl);
const fmt = x => String(Math.round(x));
const fmt10 = x => String(Math.round(x / 10) * 10);   // ground speeds as narrated (1670, 1450, 1330, 840)
function panel(c, T, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 10, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
/** label with a dark plate; align left/center/right */
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.82), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
  return w;
}
/** labels to the left of the shell: right-aligned column, vertically relaxed, leaders to the anchor */
function shellLabels(stage, V, items) {
  const {ctx: c} = stage, T = stage.theme, list = items.filter(it => it.a > 0.01).map(it => {
    const p = shellXY(V, it.phi, it.h ?? 1.0), w = stage.measure(it.text, {size: 24, weight: 700});
    return {...it, ax: p[0], ay: p[1], w, y: p[1]};
  }).sort((u, v) => u.ay - v.ay);
  for (let rep = 0; rep < 40; rep++) for (let i = 1; i < list.length; i++) { const d = list[i].y - list[i - 1].y; if (d < 31) { list[i - 1].y -= (31 - d) / 2; list[i].y += (31 - d) / 2; } }
  for (const it of list) {
    it.y = clamp(it.y, 300, 1330);
    const xr = Math.max(64 + it.w, Math.min(it.ax - 22, it.xMax ?? 1e9));
    withAlpha(c, it.a, () => {
      if (Math.abs(it.y - it.ay) > 3 || it.ax - xr > 22) line(c, [[xr + 5, it.y], [it.ax - 3, it.ay]], rgba(it.col || T.muted, 0.6), 1.2);
      stage.text(it.text, xr, it.y, {size: 24, weight: 700, color: it.col || T.ink, align: 'right', shadow: '#000', shadowBlur: 6});
    });
  }
}
/** latitude labels just outside the right limb */
function latLabels(stage, V, a) {
  if (a <= 0) return;
  for (const la of [60, 30, 0, -30, -60]) {
    const al = alphaOfLat(la) * D2R, r = V.R + 12, x = V.cx + r * Math.cos(al), y = V.cy - r * Math.sin(al);
    stage.text(la === 0 ? '0°' : `${Math.abs(la)}°${la > 0 ? 'N' : 'S'}`, x, y, {size: 24, color: stage.theme.muted, alpha: a});
  }
}
/** spin direction: arc arrow along a latitude band in front of the globe (screen overlay) */
function spinArrow(stage, V, a, label = true) {
  if (a <= 0) return;
  const {ctx: c} = stage, rx = V.R * 1.1, ry = V.R * 0.26, yc = V.cy + V.R * 0.62, pts = [];
  for (let i = 0; i <= 40; i++) { const u = lerp(-0.62, 0.62, i / 40) * Math.PI / 2; pts.push([V.cx + rx * Math.sin(u), yc + ry * Math.cos(u)]); }
  withAlpha(c, a, () => {
    line(c, pts, rgba(PAL.mark, 0.85), 3);
    arrow(c, pts[37], pts[40], PAL.mark, 3, {head: 14});
    if (label) tag(stage, '자전: 서 → 동', V.cx, yc + ry + 30, {size: 26, color: PAL.mark});
  });
}

// =====================================================================================================
// Header (centred)
// =====================================================================================================
function head(stage, kicker, title, p) {
  const {ctx: c} = stage, T = stage.theme, a = smooth(p / 0.04);
  withAlpha(c, a, () => {
    if (kicker) {
      stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
      line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
    }
    if (title) stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 940});
  });
}
export const titles = {
  hook: ['오늘의 주제 · 바람의 띠', '지구를 두른 바람의 띠'],
  origin: ['기원 · 이름과 발견', '무역풍과 무풍대, 이름의 뿌리'],
  essence: ['본질 · 제1원리', '태양이 일으키고, 자전이 꺾는다'],
  rise: ['메커니즘 ① 가열과 상승', '적도에서 솟는 공기'],
  hadley: ['메커니즘 ② 해들리 순환', '30°에서 가라앉는 공기'],
  coriolis: ['메커니즘 ③ 자전', '느린 공기는 서쪽으로 처진다'],
  belts: ['메커니즘 ④ 세 개의 띠', '편서풍과 극동풍'],
  voyage: ['사례 · 1492년 콜럼버스', '바람을 갈아탄 항해'],
  myth: ['오해 바로잡기', '자전이 바람을 만든다?'],
  close: ['', ''],
};

let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'wind_trade'), m = M(ctx);
  const ok = e?.model && e.model.n === m.keys.length && Math.abs(e.model.t0 - m.p1.t0) < 1e-3 && Math.abs(e.model.t2 - m.p2.t0) < 1e-3 && e.model.crossings === m.crossings.length;
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/global-winds/scenes.mjs --emit-sound');
}

// =====================================================================================================
// The world state (one globe for the whole video): layout, spin, belts, loops, labels
// =====================================================================================================
function layoutKeys(tl) {
  return [
    [0, {cx: 540, cy: 790, R: 345, sh: 0}],
    [tl.scene('origin').start, {cx: 540, cy: 1122, R: 180, sh: 0}],
    [tl.scene('essence').start, {cx: 540, cy: 815, R: 250, sh: 0}],
    [tl.scene('rise').start, {cx: 540, cy: 680, R: 262, sh: 1}],
    [tl.scene('coriolis').start, {cx: 540, cy: 540, R: 212, sh: 1}],
    [tl.at('s19') - 0.5, {cx: 540, cy: 638, R: 258, sh: 1}],
    [tl.scene('voyage').start, {cx: 540, cy: 660, R: 320, sh: 0}],
    [tl.scene('myth').start, {cx: 750, cy: 640, R: 160, sh: 1}],
    [tl.scene('close').start, {cx: 540, cy: 905, R: 262, sh: 1}],
  ];
}
const LAYS = new WeakMap();
function layoutAt(t, tl) {
  let K = LAYS.get(tl); if (!K) { K = layoutKeys(tl); LAYS.set(tl, K); }
  let cur = K[0][1];
  for (let i = 1; i < K.length; i++) {
    const [ti, v] = K[i]; if (t < ti - 0.2) break;
    const q = easeInOut((t - (ti - 0.2)) / 1.4);
    cur = Object.fromEntries(Object.keys(v).map(k => [k, lerp(cur[k], v[k], q)]));
  }
  return cur;
}
function beltAlphas(t, tl) {
  const at = r => tl.at(r);
  return {trade: fadeIn(t, at(A.fromEast) - 0.2, 1.2), west: fadeIn(t, at(A.westerly) - 0.2, 1.2), polar: fadeIn(t, at(A.polarE) - 0.2, 1.2)};
}
function cellAlphas(t, tl) {
  const at = r => tl.at(r);
  return {hadley: fadeIn(t, at(A.hadleyName) - 0.3, 0.8), ferrel: fadeIn(t, at('s18') - 0.1, 0.8), polar: fadeIn(t, at(A.polarSink) - 0.1, 0.8)};
}
const L_TXT = {eqLow: '적도 저압대', subHigh: '아열대 고압대', subLow: '저압대', poleHigh: '극 고압대'};

/** the main globe with everything that has been explained by time t */
function world(stage, t, ctx, o = {}) {
  const {ctx: c} = stage, tl = ctx.tl, m = M(ctx), T = stage.theme, at = r => tl.at(r);
  const lay = o.lay || layoutAt(t, tl), V = makeView(lay, m.spin(t));
  const riseS = tl.scene('rise'), hadS = tl.scene('hadley');
  const heat = fadeIn(t, riseS.start + 0.2, 0.8) * fadeOut(t, at(A.poleward), 1.5) * 0.9;
  const clouds = Math.max(fadeIn(t, at(A.risesUp), 2.5) * 0.95, 0) * (o.cloudA ?? 1);
  const cloudA = clouds * (t > hadS.start ? lerp(0.95, 0.55, smooth((t - hadS.start) / 2)) : 1);
  const rain = fadeIn(t, at(A.shower) - 0.2, 0.6) * fadeOut(t, hadS.start + 1, 1.2);
  const desert = fadeIn(t, at(A.sahara) - 0.3, 0.9) * lerp(1, 0.45, smooth((t - at('s13')) / 1.5));
  drawGlobe(stage, V, t, {heat, clouds: cloudA, rain, desert: o.desert ?? desert, grat: 0.16, eqLine: heat,
    inside: o.inside});
  return V;
}

// =====================================================================================================
// Instrument panels: zoom strip, graph, readouts (coriolis, belts)
// =====================================================================================================
const INS = {x0: 140, x1: 940, sy: 782, sh: 194, ry: 986, rh: 66, gy: 1062, gh: 274};
/** zoom strip; band: 'low' (0–30°N) or 'mid' (30–60°N); P = parcel trajectory */
function strip(stage, t, ctx, band, P, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, {x0, x1, sy, sh} = INS;
  const lo = band === 'low' ? 0 : 30, hi = lo + 30, yTop = sy + 62, yBot = sy + sh - 20;
  const Y = phi => lerp(yBot, yTop, (phi - lo) / 30);
  const k = band === 'low' ? 0.12 : 0.11, xp = band === 'low' ? 400 : 690;
  const clock = clamp(t - P.t0, 0, P.T + 0.3);
  const shift = phi => k * (uGround(phi) - U30) * clock;
  const [phiNow] = P.at(t), col = band === 'low' ? BELT.trade.col : BELT.west.col;
  withAlpha(c, a, () => {
    panel(c, T, x0, sy, x1 - x0, sh, 0.92);
    stage.text(band === 'low' ? '확대 · 0~30°N 띠 (공기를 따라가는 창)' : '확대 · 30~60°N 띠 (공기를 따라가는 창)', x0 + 16, sy + 24, {size: 24, weight: 700, color: T.ink});
    line(c, [[x1 - 262, sy + 24], [x1 - 228, sy + 24]], rgba(T.light, 0.9), 2.2, {dash: [6, 5]});
    stage.text('출발한 곳의 경선', x1 - 16, sy + 24, {size: 24, color: T.light, align: 'right'});
    c.save(); c.beginPath(); c.rect(x0 + 2, yTop - 14, x1 - x0 - 4, yBot - yTop + 28); c.clip();
    // ground rows: texture ticks sliding at (u(φ) − 1450)·k
    for (let phi = lo; phi <= hi + 0.01; phi += 2.5) {
      const y = Y(phi), s = shift(phi), sp = 44;
      for (let x = ((s % sp) + sp) % sp + x0 - sp; x < x1 + sp; x += sp) line(c, [[x, y - 3], [x, y + 3]], rgba('#9FB79A', 0.34), 1.5);
    }
    // the Earth-fixed start meridian (shears as the rows slide)
    const mer = []; for (let phi = lo; phi <= hi + 0.01; phi += 1) mer.push([xp + shift(phi), Y(phi)]);
    line(c, mer, rgba(T.light, 0.9), 2.2, {dash: [7, 6]});
    c.restore();
    const rows = band === 'low' ? [30, 20, 10, 0] : [60, 50, 40, 30];
    for (const phi of rows) {
      const y = Y(phi); line(c, [[x0 + 2, y], [x0 + 12, y]], rgba(T.muted, 0.8), 1.2);
      stage.text(`${phi}° · 땅 ${fmt10(uGround(phi))}`, x0 + 18, y, {size: 24, color: phi === 30 ? T.ink : T.muted, shadow: '#000', shadowBlur: 6});
    }
    if (t >= P.t0 - 1.2) {
      const yp = Y(phiNow), xm = xp + shift(phiNow);
      line(c, [[xp, Y(30)], [xp, yp]], rgba(col, 0.7), 2, {dash: [4, 5]});
      const gapA = smooth(Math.abs(xm - xp) / 30);
      if (gapA > 0) withAlpha(c, gapA, () => {
        arrow(c, [xm, yp], [xp + Math.sign(xm - xp) * 14, yp], col, 3, {head: 12});
        const s = band === 'low' ? '땅보다 느림 → 서쪽으로 처짐' : '땅보다 빠름 → 동쪽으로 앞섬';
        const ly = band === 'low' ? (yp - 26 < yTop ? yp + 26 : yp - 26) : yp - 26;
        tag(stage, s, clamp((xm + xp) / 2, x0 + 330, x1 - 170), ly, {size: 24, color: col, a: smooth(Math.abs(xm - xp) / 90)});
      });
      tracker(c, xp, yp, col, 0.9);
    }
  });
}
const G = {x0: 232, x1: 900, y0: INS.gy + INS.gh - 36, y1: INS.gy + 62, umin: 800, umax: 1800};
const GX = phi => lerp(G.x0, G.x1, phi / 90), GY = u => lerp(G.y0, G.y1, (u - G.umin) / (G.umax - G.umin));
const PHI_MIN = Math.acos(G.umin / U_EQ) / D2R;   // the curve leaves the (broken) axis here (≈ 61°)
/** ground eastward speed vs latitude; o: {pts: [[φ, alpha, text]], P, band, parcelA, meaningA, noteA, seoulA} */
function graph(stage, t, ctx, a, o = {}) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    panel(c, T, INS.x0, INS.gy, INS.x1 - INS.x0, INS.gh, 0.92);
    stage.text('땅의 동쪽 속도 (시속 km) · 위도별', INS.x0 + 16, INS.gy + 24, {size: 24, weight: 700, color: T.ink});
    stage.text('극(90°)에서는 0', INS.x1 - 16, INS.gy + 24, {size: 24, color: T.muted, align: 'right'});
    line(c, [[G.x0, G.y1 - 6], [G.x0, G.y0], [G.x1 + 6, G.y0]], rgba(T.muted, 0.8), 1.5);
    for (const u of [1000, 1200, 1400, 1600]) line(c, [[G.x0, GY(u)], [G.x1, GY(u)]], rgba(T.border, 0.8), 1);
    for (const u of [800, 1000, 1200, 1400]) { const y = GY(u); line(c, [[G.x0 - 5, y], [G.x0, y]], rgba(T.muted, 0.8), 1.2); stage.text(String(u), G.x0 - 10, y, {size: 24, color: T.muted, align: 'right'}); }
    // axis break (the axis starts at 800, not 0)
    rect(c, G.x0 - 7, G.y0 - 20, 14, 10, 0, rgba(T.plate, 1));
    line(c, [[G.x0 - 7, G.y0 - 12], [G.x0 + 7, G.y0 - 18]], rgba(T.muted, 0.9), 1.4); line(c, [[G.x0 - 7, G.y0 - 7], [G.x0 + 7, G.y0 - 13]], rgba(T.muted, 0.9), 1.4);
    for (const phi of [0, 30, 60, 90]) { const x = GX(phi); line(c, [[x, G.y0], [x, G.y0 + 5]], rgba(T.muted, 0.8), 1.2); stage.text(`${phi}°`, x, G.y0 + 20, {size: 24, color: T.muted, align: 'center'}); }
    const pts = []; for (let phi = 0; phi <= PHI_MIN; phi += 1) pts.push([GX(phi), GY(uGround(phi))]); pts.push([GX(PHI_MIN), GY(G.umin)]);
    const col = o.band === 'low' ? BELT.trade.col : BELT.west.col;
    if (o.P && o.parcelA > 0) {
      const [phiNow] = o.P.at(t), p0 = 30;
      withAlpha(c, o.parcelA, () => {
        const lo = Math.min(p0, phiNow), hi = Math.max(p0, phiNow), sh = [];
        for (let phi = lo; phi <= hi + 0.01; phi += 0.5) sh.push([GX(phi), GY(uGround(phi))]);
        if (hi - lo > 0.3) poly(c, [...sh, [GX(hi), GY(U30)], [GX(lo), GY(U30)]], rgba(col, 0.42));
        line(c, [[GX(p0), GY(U30)], [GX(phiNow), GY(U30)]], col, 3.2);
        tracker(c, GX(phiNow), GY(U30), col, 0.7);
        if ((o.meaningA ?? 1) > 0 && hi - lo > 3) withAlpha(c, (o.meaningA ?? 1) * smooth((hi - lo - 3) / 6), () => {
          const l1 = o.band === 'low' ? '공기가 땅보다 느림 → 뒤처짐' : '공기가 땅보다 빠름 → 앞섬', l2 = o.band === 'low' ? '→ 동쪽에서 부는 바람 (동풍)' : '→ 서쪽에서 부는 바람 (서풍)';
          const wc = [GX((lo + hi) / 2), (GY(uGround((lo + hi) / 2)) + GY(U30)) / 2];
          line(c, [wc, [612, 1152]], rgba(col, 0.7), 1.4);
          stage.text(l1, 896, 1138, {size: 24, weight: 700, color: col, align: 'right'});
          stage.text(l2, 896, 1166, {size: 24, weight: 700, color: col, align: 'right'});
        });
      });
    }
    line(c, pts, T.ink, 2.6);
    for (const [phi, pa, txt] of o.pts || []) if (pa > 0) withAlpha(c, pa, () => {
      const x = GX(phi), y = GY(uGround(phi)); circle(c, x, y, 6, PAL.mark); ring(c, x, y, 11, rgba(PAL.mark, 0.6), 1.5);
      if (phi === 0) stage.text(txt, x - 14, y, {size: 24, weight: 700, color: PAL.mark, align: 'right'});
      else if (phi >= 55) stage.text(txt, x + 14, y - 4, {size: 24, weight: 700, color: PAL.mark, shadow: '#000', shadowBlur: 6});
      else if (phi === 30) stage.text(txt, x - 12, y + 24, {size: 24, weight: 700, color: PAL.mark, align: 'right', shadow: '#000', shadowBlur: 6});
      else stage.text(txt, x + 12, y - 20, {size: 24, weight: 700, color: PAL.mark, shadow: '#000', shadowBlur: 6});
    });
    if (o.noteA > 0) withAlpha(c, o.noteA, () => {
      stage.text('실제 무역풍 세기', 896, 1212, {size: 24, color: T.muted, align: 'right'});
      stage.text('시속 20~30 km 안팎', 896, 1240, {size: 24, weight: 700, color: T.ink, align: 'right'});
      stage.text('(지표 마찰)', 896, 1268, {size: 24, color: T.muted, align: 'right'});
    });
  });
}
/** one row of readouts under the strip: latitude, ground speed, air speed, wind name */
function readouts(stage, t, ctx, a, o) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, y0 = INS.ry;
  const cells = [[140, 150, o.place ? `위도 (${o.place})` : '위도', o.phi == null ? '—' : Math.abs(o.phi) < 0.5 ? '0°' : `${Math.abs(o.phi).toFixed(o.dec ?? 0)}°${o.phi >= 0 ? 'N' : 'S'}`, T.ink],
    [290, 190, '땅의 동쪽 속도', o.phi == null ? '—' : `${fmt10(uGround(o.phi))} km/h`, T.ink],
    [480, 190, '공기의 동쪽 속도', o.air == null ? '—' : `${fmt10(o.air)} km/h`, o.airCol || T.ink],
    [670, 270, o.ruleA > 0.5 ? '바람 이름 = 불어오는 쪽' : '바람', o.wind || '—', o.windCol || T.ink]];
  withAlpha(c, a, () => {
    panel(c, T, INS.x0, y0, INS.x1 - INS.x0, INS.rh, 0.92);
    cells.forEach(([x, w, k, v, col], i) => {
      if (i) line(c, [[x, y0 + 10], [x, y0 + INS.rh - 10]], rgba(T.border, 1), 1.2);
      stage.text(k, x + w / 2, y0 + 20, {size: 24, color: i === 3 && o.ruleA > 0.5 ? PAL.mark : T.muted, align: 'center', maxWidth: w - 12});
      stage.text(v, x + w / 2, y0 + 48, {role: 'display', size: 26, weight: 700, color: col, align: 'center', maxWidth: w - 12});
    });
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
const HOOK_SHIPS = [{lat: 15, lon: -40, sail: 'full'}, {lat: 2, lon: -25, sail: 'slack'}];
export const scenes = {
  // ------------------------------------------------------------------ hook: the globe and two ships
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    checkSoundTable(ctx);
    const a0 = fadeIn(t, 0.05, 1.0);
    withAlpha(c, a0, () => {
      const V = world(stage, t, ctx);
      hookShips(stage, V, t, ctx, 1);
    });
  },

  // ------------------------------------------------------------------ origin: names and discovery
  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), sc = tl.scene('origin');
    const V = world(stage, t, ctx);
    hookShips(stage, V, t, ctx, fadeOut(t, sc.start + 1.0, 1.0));
    const tl6 = fadeIn(t, at('s06') - 0.4, 0.6), cardsA = 1;
    // two etymology columns
    const cols = [
      {x: 335, head: 'trade wind', rows: [[A.trade, '트레이드 = 길 · 발자국', T.light, 26], [A.trade, 'tread(밟다)와 같은 뿌리', T.muted, 24], [A.sameRoad, 'to blow trade', T.ink, 26], [A.sameRoad, '= 한 방향으로 꾸준히 불다', T.muted, 24],
        [A.sea, '18세기 · 무역(commerce)과', T.muted, 24], [A.sea, '이어 읽힘', T.muted, 24]], han: '貿易風', hanR: '무역풍', hanAt: A.commerce, headAt: 'origin'},
      {x: 745, head: 'doldrums', rows: [[A.doldrums, '← dull (처진)', T.light, 26], [A.slack, '기운 없는 상태', T.muted, 24], [A.meant, '멈춘 배의 처지', T.ink, 26], [A.meant, '→ 그 바다의 이름', T.muted, 24]],
        han: '無風帶', hanR: '무풍대', hanAt: W('s05', '왔습니다.'), headAt: A.doldrums},
    ];
    const ef = endFade(t, ctx);
    withAlpha(c, cardsA * fadeIn(t, sc.start + 0.2, 0.6) * ef, () => {
      for (const col of cols) {
        const on = fadeIn(t, (typeof col.headAt === 'string' ? at(col.headAt) + 0.3 : at(col.headAt) - 0.2), 0.5);
        rect(c, col.x - 195, 296, 390, 452, 12, rgba(T.plate, 0.92), on > 0.5 ? rgba(T.light, 0.8) : rgba(T.border, 1), on > 0.5 ? 2 : 1.5);
        stage.text(col.head, col.x, 340, {role: 'display', size: 44, weight: 700, color: mix(T.muted, T.ink, on), align: 'center'});
        col.rows.forEach(([ref, s, color, size], i) => {
          const y = 396 + i * 38 + (i >= 4 ? 10 : 0) + (i >= 2 ? 8 : 0);
          stage.text(s, col.x, y, {size, weight: size > 24 ? 700 : 500, color, align: 'center', alpha: fadeIn(t, at(ref) - 0.1, 0.4), maxWidth: 370});
        });
        const hq = fadeIn(t, at(col.hanAt) - 0.1, 0.5);
        withAlpha(c, hq, () => {
          line(c, [[col.x - 60, 638], [col.x + 60, 638]], rgba(T.border, 1), 1.5);
          stage.text(col.han, col.x, 676, {size: 54, weight: 700, color: T.light, align: 'center'});
          stage.text(col.hanR, col.x, 728, {size: 24, weight: 700, color: T.muted, align: 'center'});
        });
      }
    });
    // discovery timeline (s06)
    withAlpha(c, tl6 * ef, () => {
      const y = 812, nodes = [[240, '1686', '핼리', '적도의 열', A.halley], [440, '1735', '해들리', '지구의 자전', A.hadleyO], [640, '1835', '코리올리', '회전의 겉보기 힘', A.reason], [840, '1856', '페렐', '중위도 순환', A.reason]];
      line(c, [[180, y], [900, y]], rgba(T.border, 1), 3);
      nodes.forEach(([x, yr, who, what, ref], i) => {
        const on = fadeIn(t, at(ref) - 0.1, 0.4), lit = i < 2 ? on : on * 0.55;
        const colr = i < 2 && on > 0.5 ? T.light : mix(T.muted, T.ink, lit);
        circle(c, x, y, i < 2 ? 8 : 6, on > 0.3 ? colr : rgba(T.muted, 0.6));
        stage.text(yr, x, y - 30, {role: 'display', size: 28, weight: 700, color: colr, align: 'center', alpha: 0.4 + 0.6 * on});
        stage.text(who, x, y + 32, {size: 26, weight: 700, color: colr, align: 'center', alpha: 0.4 + 0.6 * on});
        stage.text(what, x, y + 62, {size: 24, color: i < 2 ? T.ink : T.muted, align: 'center', alpha: on, maxWidth: 190});
      });
    });
  },

  // ------------------------------------------------------------------ essence: the sun drives, the spin steers
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), sc = tl.scene('essence');
    const V = world(stage, t, ctx);
    // proposition card
    const ef = endFade(t, ctx);
    withAlpha(c, fadeIn(t, sc.start + 0.1, 0.5) * ef, () => {
      rect(c, 140, 292, 800, 150, 12, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
      propRow(stage, 336, '바람을 일으키는 것은', '태양', PAL.sun, fadeIn(t, at(A.sun) - 0.1, 0.4));
      propRow(stage, 400, '방향을 꺾는 것은', '자전', PAL.mark, fadeIn(t, at(A.spin) - 0.1, 0.4));
    });
    spinArrow(stage, V, fadeIn(t, at(A.spin) - 0.1, 0.5) * fadeOut(t, at('s08') - 0.2, 0.5));
    // sun rays from the right: equal beams at the equator and at 60°N (where the 60° circle meets the limb)
    const b1 = fadeIn(t, at(A.vertical) - 0.6, 0.8), b2 = fadeIn(t, at(A.sameArea) - 0.3, 0.8), qA = fadeIn(t, at(A.twice) - 0.2, 0.6) * ef;
    const w = V.R * 0.065, sunA = Math.max(fadeIn(t, at(A.sun) - 0.1, 0.5) * fadeOut(t, at('s08') - 0.4, 0.4), b1);
    withAlpha(c, sunA * ef, () => { glow(c, 1080, V.cy - V.R * 0.4, 260, PAL.sun, 0.22); stage.text('햇빛', 936, V.cy - V.R * 0.42, {size: 28, weight: 700, color: PAL.sun, align: 'right', shadow: '#000'}); });
    const beam = (alphaDeg, a, label, sub) => {
      if (a <= 0) return;
      const yc = V.cy - V.R * Math.sin(alphaDeg * D2R), ya = yc - w, yb = yc + w;
      const hx = y => V.cx + Math.sqrt(Math.max(0, V.R * V.R - (y - V.cy) ** 2));
      const arcPts = []; for (let i = 0; i <= 24; i++) { const y = lerp(ya, yb, i / 24); arcPts.push([hx(y), y]); }
      const reach = lerp(1080, 0, easeOut(a));   // the beam front travels in from the right
      withAlpha(c, a, () => {
        c.save(); c.beginPath(); c.rect(Math.max(reach, 0), 0, 1080, 1920); c.clip();
        poly(c, [[1080, ya], ...arcPts, [1080, yb]], rgba(PAL.sun, 0.22));
        line(c, [[1080, ya], arcPts[0]], rgba(PAL.sun, 0.75), 1.6); line(c, [[1080, yb], arcPts[24]], rgba(PAL.sun, 0.75), 1.6);
        for (let k = 1; k < 4; k++) { const y = lerp(ya, yb, k / 4); arrow(c, [1060, y], [hx(y) + 14, y], rgba(PAL.sun, 0.5), 1.4, {head: 9}); }
        c.restore();
        withAlpha(c, smooth((a - 0.7) / 0.3), () => { line(c, arcPts, PAL.sun, 6); });
      });
      return {arcPts, len: arcPts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - arcPts[i][0], q[1] - arcPts[i][1]), 0)};
    };
    const f1 = beam(0, b1 * ef), f2 = beam(60, b2 * ef);
    if (f1 && f2) {
      const ratio = f2.len / f1.len;
      withAlpha(c, smooth((b2 - 0.6) / 0.4) * ef, () => {
        const m2 = f2.arcPts[12];
        tag(stage, `같은 햇빛이 약 ${Math.round(ratio)}배 넓게 퍼짐`, m2[0] - 22, m2[1] + 4, {size: 24, color: PAL.sun, align: 'right'});
        const m1 = f1.arcPts[12];
        tag(stage, '적도: 좁은 땅에 모임', m1[0] - 22, m1[1], {size: 24, color: PAL.sun, align: 'right'});
      });
    }
    // insolation vs latitude
    withAlpha(c, qA, () => insolGraph(stage, t, qA));
  },

  // ------------------------------------------------------------------ rise: heating, rising air, doldrums
  rise(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('rise');
    const calm = smooth((t - at(A.noWind) - 0.1) / 1.4);
    const V = world(stage, t, ctx, {inside: (cc, VV) => doldrumSpecks(cc, VV, t, fadeIn(t, sc.start + 0.4, 0.8) * (1 - 0.85 * calm), 1 - calm)});
    shellLayer(stage, V, t, ctx);
    latLabels(stage, V, fadeIn(t, sc.start + 0.5, 0.6));
    parcelPanel(stage, t, ctx, fadeIn(t, sc.start + 0.4, 0.6));
    const dq = fadeIn(t, evT(ctx, 'lab_doldrums', A.doldrumsName) - 0.1, 0.5) * endFade(t, ctx);
    withAlpha(c, dq, () => {
      const p0 = proj(V, -9, V.lam + 8);
      tag(stage, '적도 무풍대 (doldrums)', p0[0], p0[1] + 6, {size: 26, color: PAL.mark, border: PAL.mark});
    });
  },

  // ------------------------------------------------------------------ hadley: poleward aloft, sinking at 30°, deserts
  hadley(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r);
    const V = world(stage, t, ctx);
    shellLayer(stage, V, t, ctx);
    latLabels(stage, V, 1);
    parcelPanel(stage, t, ctx, endFade(t, ctx));
    const dA = fadeIn(t, evT(ctx, 'lab_desert', A.deserts) - 0.1, 0.6) * fadeOut(t, at('s13') + 0.4, 0.8);
    withAlpha(c, dA, () => {
      const qb = proj(V, 31, V.lam + 52);
      if (qb[2] > 0.2) tag(stage, '사막 띠', qb[0], qb[1], {size: 26, color: '#F2DDB0', border: '#C3A46B'});
      for (const [la, lo, s] of [[23, 12, '사하라'], [23, 47, '아라비아']]) {
        const q = proj(V, la, lo); if (q[2] > 0.25) tag(stage, s, q[0], q[1], {size: 24, color: '#F2DDB0', a: smooth((q[2] - 0.25) / 0.2)});
      }
    });
  },

  // ------------------------------------------------------------------ coriolis: the 3-tier instrument
  coriolis(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), P = m.p1;
    const ba = beltAlphas(t, tl);
    const V = world(stage, t, ctx);
    drawWinds(c, V, t, {trade: ba.trade});
    shellLayer(stage, V, t, ctx);
    latLabels(stage, V, 1);
    spinArrow(stage, V, fadeIn(t, at(A.westEast) - 0.2, 0.5) * fadeOut(t, at(A.eqGround) + 0.4, 0.6));
    // ground speed arrows on the face (screen length ∝ cos φ: the same angular rate, less distance)
    const gOut = fadeOut(t, P.t0 + 1.0, 0.8);
    groundArrow(stage, V, 0, fadeIn(t, at(A.eqGround) - 0.1, 0.5) * gOut, '땅: 시속 1670 km', 'below');
    groundArrow(stage, V, 30, fadeIn(t, at(A.g30) - 0.1, 0.5) * gOut, '땅: 시속 1450 km', 'above');
    parcelOnGlobe(stage, V, t, P, fadeIn(t, at(A.g30) + 0.2, 0.5), BELT.trade.col);
    const sA = fadeIn(t, at(A.g30) + 0.3, 0.7) * fadeOut(t, at(A.bent) - 0.6, 0.6);
    bracket(stage, V, P, 'low', sA);
    strip(stage, t, ctx, 'low', P, sA);
    coriolisPanel(stage, t, ctx, fadeIn(t, at(A.bent) - 0.4, 0.6) * endFade(t, ctx));
    const gA = fadeIn(t, at(A.eqGround) - 0.6, 0.6);
    const [phiNow] = P.at(t), live = t >= P.t0 - 0.2;
    graph(stage, t, ctx, gA, {pts: [[0, fadeIn(t, evT(ctx, 'g1670', A.v1670) - 0.1, 0.4), '1670'], [30, fadeIn(t, evT(ctx, 'g1450', A.v1450) - 0.1, 0.4), '1450']],
      P, band: 'low', parcelA: fadeIn(t, P.t0 - 0.3, 0.4), noteA: fadeIn(t, evT(ctx, 'lab_ne', A.ne) - 0.1, 0.5) * endFade(t, ctx)});
    const windName = !live || phiNow > 29 ? null : t > at(A.ne) - 0.1 ? '동풍 · 북동무역풍' : '동풍';
    readouts(stage, t, ctx, gA, {phi: t > at(A.g30) - 0.1 ? phiNow : t > at(A.eqGround) - 0.1 ? 0 : null, air: live ? U30 : null, airCol: BELT.trade.col,
      wind: windName, windCol: BELT.trade.col, ruleA: fadeIn(t, at(A.fromEast) - 0.1, 0.5)});
    tradeLabels(stage, V, t, ctx, 1);
  },

  // ------------------------------------------------------------------ belts: westerlies, Korea, polar easterlies, six belts
  belts(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), P = m.p2;
    const ba = beltAlphas(t, tl);
    const V = world(stage, t, ctx);
    drawWinds(c, V, t, ba);
    koreaLayer(stage, V, t, ctx);
    shellLayer(stage, V, t, ctx);
    latLabels(stage, V, fadeOut(t, at('s20') + 2.5, 0.6));
    const sA = fadeIn(t, tl.scene('belts').start + 0.1, 0.6) * fadeOut(t, at('s19') - 0.8, 0.5);
    const gA = fadeOut(t, at('s20') + 0.2, 0.6);
    parcelOnGlobe(stage, V, t, P, fadeIn(t, at(A.from30) - 0.2, 0.5) * fadeOut(t, at('s19') - 0.3, 0.6), BELT.west.col);
    bracket(stage, V, P, 'mid', sA);
    strip(stage, t, ctx, 'mid', P, sA);
    const [phiNow] = P.at(t), live = t >= P.t0 - 0.2, kq = fadeIn(t, at('s19') - 0.3, 0.8), kA = smooth(kq * 2 - 1), kOut = 1 - smooth(kq * 2);   // old out, then Seoul in
    graph(stage, t, ctx, gA, {pts: [[30, kOut, '1450'], [60, fadeIn(t, P.t0 + 2, 0.5) * kOut, '840'], [37.5, kA, '서울 37.5° · 1330']], P, band: 'mid',
      parcelA: fadeIn(t, P.t0 - 0.3, 0.4) * kOut, meaningA: kOut});
    if (kOut > 0) withAlpha(c, kOut, () => readouts(stage, t, ctx, gA, {phi: live ? phiNow : 30, air: U30, airCol: BELT.west.col,
      wind: live && phiNow > 31 ? (t > at(A.westerly) - 0.1 ? '서풍 · 편서풍' : '서풍') : null, windCol: BELT.west.col, ruleA: 1}));
    if (kA > 0) withAlpha(c, kA, () => readouts(stage, t, ctx, gA, {phi: 37.5, dec: 1, place: '서울', air: null, wind: '편서풍', windCol: BELT.west.col, ruleA: 1}));
    tradeLabels(stage, V, t, ctx, fadeOut(t, at(A.polarE) - 0.3, 0.6));
    westLabels(stage, V, t, ctx);
    legend(stage, t, ctx, fadeIn(t, evT(ctx, 'lab_polar', A.polarE) - 0.1, 0.6) * endFade(t, ctx), fadeIn(t, evT(ctx, 'legend', A.three) - 0.1, 0.8));
  },

  // ------------------------------------------------------------------ voyage: Columbus 1492–93
  voyage(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx);
    const ba = beltAlphas(t, tl); ba.polar *= 0.35; ba.trade *= 0.75; ba.west *= 0.75;
    const V = world(stage, t, ctx);
    drawWinds(c, V, t, ba);
    shellLayer(stage, V, t, ctx);
    withAlpha(c, endFade(t, ctx), () => voyageLayer(stage, V, t, ctx));
    voyageGauge(stage, t, ctx, fadeIn(t, tl.scene('voyage').start + 0.4, 0.6) * endFade(t, ctx));
  },

  // ------------------------------------------------------------------ myth: without rotation vs with rotation
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('myth');
    const ba = beltAlphas(t, tl), cells = cellAlphas(t, tl);
    // right: the main globe (rotating) moves into place
    const lay = layoutAt(t, tl), V = makeView(lay, m.spin(t));
    drawGlobe(stage, V, t, {clouds: 0.5, desert: 0.4, grat: 0.14});
    drawWinds(c, V, t, {trade: ba.trade, west: ba.west * 0.45, polar: ba.polar * 0.45});
    drawShell(stage, V, t, {a: 1, cells});
    // left: a non-rotating Earth (fixed view)
    const aL = fadeIn(t, sc.start + 1.0, 0.6) * fadeOut(t, sc.end - 0.5, 0.45);
    const VL = makeView({cx: 330, cy: 640, R: 160}, m.spin(sc.start + 0.6));
    withAlpha(c, aL, () => {
      drawGlobe(stage, VL, t, {clouds: 0.5, desert: 0.4, grat: 0.14});
      drawWinds(c, VL, t, {trade: 1, west: 1}, {rot: false});
      drawShell(stage, VL, t, {a: 1, single: 1});
    });
    const ef = endFade(t, ctx), hdA = fadeIn(t, sc.start + 1.0, 0.6) * ef;
    withAlpha(c, hdA, () => {
      stage.text('자전이 없다면', 330, 404, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('자전하면', 750, 404, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('공기는 곧장 적도로 · 북풍', 330, 868, {size: 24, weight: 700, color: '#D8C9A8', align: 'center'});
      stage.text('같은 흐름이 꺾임 · 북동무역풍', 750, 868, {size: 24, weight: 700, color: BELT.trade.col, align: 'center'});
      stage.text('순환은 둘 다 돈다 (태양 에너지)', 540, 910, {size: 24, color: T.muted, align: 'center'});
    });
    const v1 = fadeIn(t, evT(ctx, 'myth_no', A.only) - 0.1, 0.5), v2 = fadeIn(t, evT(ctx, 'myth_energy', A.energy) - 0.1, 0.5);
    withAlpha(c, v1 * ef, () => {
      rect(c, 140, 956, 800, 240, 12, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
      stage.text('자전이 바람을 만든다?', 540, 1004, {role: 'display', size: 36, weight: 700, color: T.muted, align: 'center'});
      crossOut(c, 540, 1004, stage.measure('자전이 바람을 만든다?', {role: 'display', size: 36, weight: 700}), v1);
      stage.text('아니다', 540, 1066, {role: 'display', size: 40, weight: 700, color: T.accent, align: 'center'});
      withAlpha(c, v2, () => propRow(stage, 1142, '에너지는 태양,', '자전은 방향', PAL.mark, 1));
    });
  },

  // ------------------------------------------------------------------ close
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('close');
    const ba = beltAlphas(t, tl);
    const V = world(stage, t, ctx);
    drawWinds(c, V, t, ba);
    shellLayer(stage, V, t, ctx);
    const q = fadeIn(t, sc.start + 0.3, 0.6);
    withAlpha(c, q, () => {
      stage.text('정리', 540, 300, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
      stage.text('바람을 일으키는 것은 태양,', 540, 372, {role: 'display', size: 52, weight: 700, color: T.ink, align: 'center'});
      stage.text('방향을 꺾는 것은 자전', 540, 446, {role: 'display', size: 52, weight: 700, color: T.ink, align: 'center'});
      line(c, [[480, 500], [600, 500]], T.accent, 4, {cap: 'butt'});
      withAlpha(c, fadeIn(t, evT(ctx, 'close_swell', A.pattern) - 0.1, 0.6), () => stage.text('바람의 띠 = 태양 × 자전이 그린 무늬', 540, 552, {size: 30, weight: 500, color: T.muted, align: 'center'}));
    });
  },
};

// =====================================================================================================
// Scene parts
// =====================================================================================================
function propRow(stage, y, lead, key, col, a) {
  const w1 = stage.measure(lead, {size: 30, weight: 500}), w2 = stage.measure(key, {role: 'display', size: 44, weight: 700}), gap = 16, x0 = 540 - (w1 + gap + w2) / 2;
  stage.text(lead, x0, y, {size: 30, weight: 500, color: stage.theme.ink});
  stage.text(key, x0 + w1 + gap, y, {role: 'display', size: 44, weight: 700, color: col, alpha: 0.25 + 0.75 * a});
}
function crossOut(c, x, y, w, a) { const q = easeOut(a); line(c, [[x - w / 2 - 6, y + 2], [x - w / 2 - 6 + (w + 12) * q, y + 2]], rgba('#FF8A5C', 0.9), 3.5); }
function hookShips(stage, V, t, ctx, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r);
  const s1 = fadeIn(t, at(A.sameSide) - 0.4, 0.5), s2 = fadeIn(t, at(A.stops) - 0.3, 0.5), sc = V.R / 320;
  HOOK_SHIPS.forEach((S, i) => {
    const q = proj(V, S.lat, S.lon); if (q[2] < 0.1) return;
    const vis = a * smooth((q[2] - 0.1) / 0.25);
    // steady wind streaks at the trade ship (from the NE, moving toward the SW)
    if (S.sail === 'full') withAlpha(c, vis * (0.45 + 0.55 * s1), () => {
      for (let k = 0; k < 5; k++) {
        const ph = ((t * 0.55 + k * 0.2) % 1), la0 = S.lat + 7 - 2.2 * k + 5 * ph * 0.56, lo0 = S.lon + 9 + 1.8 * k - 5 * ph * 0.8;
        const pts = Array.from({length: 7}, (_, j) => proj(V, la0 - j * 0.56 * 1.1, lo0 - j * 0.8 * 1.1));
        if (pts.some(pp => pp[2] < 0.05)) continue;
        line(c, pts, rgba(BELT.trade.col, 0.9 * Math.sin(Math.PI * ph)), 3.2 * sc);
        const hd = pts[6], pv = pts[5], ang = Math.atan2(hd[1] - pv[1], hd[0] - pv[0]);
        poly(c, [[hd[0] + Math.cos(ang) * 6, hd[1] + Math.sin(ang) * 6], [hd[0] + Math.cos(ang + 2.5) * 8, hd[1] + Math.sin(ang + 2.5) * 8], [hd[0] + Math.cos(ang - 2.5) * 8, hd[1] + Math.sin(ang - 2.5) * 8]], rgba(BELT.trade.col, 0.9 * Math.sin(Math.PI * ph)));
      }
    });
    ship(c, q[0], q[1] + 6 * sc, 1.7 * sc, -1, S.sail, vis);
    const lab = i === 0 ? ['늘 같은 쪽에서 부는 바람', s1, -70, BELT.trade.col] : ['바람이 멎는 바다', s2, 64, PAL.mark];
    if (lab[1] > 0) {
      const lx = clamp(q[0], 290, 790), ly = q[1] + lab[2] * sc;
      withAlpha(c, vis * lab[1], () => { line(c, [[q[0], q[1] + Math.sign(lab[2]) * 14], [lx, ly - Math.sign(lab[2]) * 16]], rgba(lab[3], 0.6), 1.4); tag(stage, lab[0], lx, ly, {size: 26, color: lab[3]}); });
    }
  });
}
function doldrumSpecks(c, V, t, a, speed) {
  if (a <= 0) return;
  for (let i = 0; i < 90; i++) {
    const lat = 7 * (rand(i * 1.3) * 2 - 1), lon = 360 * rand(i * 2.7 + 1), dir = TAU * rand(i * 4.1 + 2);
    const u = (t * 0.4 + rand(i * 9.1)) % 1, d = 3.2 * speed;
    const la1 = lat + Math.sin(dir) * d * u, lo1 = lon + Math.cos(dir) * d * u;
    const q0 = proj(V, la1 - Math.sin(dir) * d * 0.3, lo1 - Math.cos(dir) * d * 0.3), q1 = proj(V, la1, lo1);
    if (q1[2] < 0.1) continue;
    const al = a * Math.sin(Math.PI * u) * smooth((q1[2] - 0.1) / 0.3);
    if (speed > 0.05) line(c, [q0, q1], rgba('#D9E6EC', 0.75 * al), 2.2); else circle(c, q1[0], q1[1], 1.8, rgba('#D9E6EC', 0.55 * al));
  }
}
/** shell content for the current time (cells, tracker, labels, pressure letters) */
function shellLayer(stage, V, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx);
  const lay = V, sh = layoutAt(t, tl).sh; if (sh <= 0.01) return;
  const riseS = tl.scene('rise'), hadS = tl.scene('hadley'), cells = cellAlphas(t, tl);
  const trA = fadeIn(t, at('s09') - 0.2, 0.5) * fadeOut(t, at(A.hadleyName) + 0.6, 0.6);
  const s = m.shellAt(t), wq = clamp((s.phi - 0.5) / 29.5), col = s.h > 0.5 ? mix(PAL.warm, PAL.cool, wq) : mix(PAL.cool, PAL.warm, 1 - wq);
  const trail = [];
  if (t > m.tRise0) { for (let tt = m.tRise0; tt < t; tt += 0.08) { const q = m.shellAt(tt); trail.push([q.phi, q.h]); } trail.push([s.phi, s.h]); }
  const tbuild = fadeOut(t, at(A.hadleyName) - 0.2, 0.6);
  drawShell(stage, V, t, {a: sh, cells, rise: fadeIn(t, at(A.risesUp) - 0.4, 0.6) * fadeOut(t, hadS.start + 0.5, 1.0),
    cb: fadeIn(t, at(A.risesUp), 2.0) * fadeOut(t, at(A.hadleyName), 1.0) * 0.95 + 0.0, rain: fadeIn(t, at(A.shower) - 0.2, 0.6) * fadeOut(t, hadS.start + 1, 1.2),
    sinkArr: fadeIn(t, at(A.sink) - 0.1, 0.5) * fadeOut(t, at('s13') + 0.2, 0.8),
    trail: t < at(A.hadleyName) + 0.4 ? trail : [], trailA: tbuild, tracker: {phi: s.phi, h: s.h, col, a: trA}});
  // pressure letters + names, cell names
  const lowA = fadeIn(t, evT(ctx, 'lab_low', A.lowP) - 0.1, 0.5), hiA = fadeIn(t, evT(ctx, 'lab_high', A.highP) - 0.1, 0.5);
  const poleA = fadeIn(t, evT(ctx, 'lab_pole', A.polarSink) - 0.1, 0.5), lowA60 = fadeIn(t, evT(ctx, 'lab_pole', A.polarSink) + 0.6, 0.5);
  const hdA = fadeIn(t, evT(ctx, 'lab_hadley', A.hadleyName) - 0.1, 0.5), fA = cells.ferrel, pA = cells.polar;
  withAlpha(c, sh, () => {
    pressureLetter(stage, V, 0, 'L', lowA, '#FFB38A');
    for (const hs of [1, -1]) { pressureLetter(stage, V, 30 * hs, 'H', hiA, '#BFE0FF'); pressureLetter(stage, V, 60 * hs, 'L', lowA60, '#FFB38A'); }
    const busy = t > tl.scene('voyage').start - 1 || V.R < 200;
    const nameA = busy ? 0 : 1;
    shellLabels(stage, V, [
      {text: '대기 (두께 과장)', phi: 84, h: 1.1, a: fadeIn(t, riseS.start + 0.6, 0.6) * fadeOut(t, at(A.polarSink) - 0.6, 0.5) * nameA, col: T.muted},
      {text: L_TXT.eqLow, phi: 0, a: lowA * nameA, col: '#FFB38A'},
      {text: L_TXT.subHigh, phi: 30, a: hiA * nameA, col: '#BFE0FF'},
      {text: L_TXT.subHigh, phi: -30, a: hiA * nameA, col: '#BFE0FF'},
      {text: '해들리 순환', phi: 15, a: hdA * nameA, col: BELT.trade.col},
      {text: '페렐 순환', phi: 45, a: fA * nameA, col: BELT.west.col},
      {text: L_TXT.subLow, phi: 60, a: lowA60 * nameA, col: '#FFB38A'},
      {text: '극 순환', phi: 75, a: pA * nameA * 0, col: BELT.polar.col},
    ]);
    // polar high at the top of the shell (right of the pole, outside the disc)
    if (poleA * nameA > 0) withAlpha(c, poleA * nameA, () => {
      const p0 = shellXY(V, 90, 1.0);
      line(c, [[p0[0] + 4, p0[1]], [p0[0] + 40, p0[1] - 10]], rgba('#BFE0FF', 0.6), 1.2);
      stage.text('극 고압대 H', p0[0] + 46, p0[1] - 12, {size: 24, weight: 700, color: '#BFE0FF', shadow: '#000', shadowBlur: 6});
    });
  });
}
/** rise / hadley: readout for the tracked air parcel in the cross-section */
function parcelPanel(stage, t, ctx, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), q = m.shellAt(t), q2 = m.shellAt(t + 0.1);
  const states = [[tl.scene('rise').start, '따뜻하고 습함', PAL.warm], [at(A.risesUp) - 0.2, '가벼워져 위로', PAL.warm], [at(A.shower) - 0.1, '수증기 → 소나기', '#BFD9EA'],
    [at(A.poleward) - 0.1, '극 쪽으로 · 식는 중', PAL.cool], [at(A.sink) - 0.1, '가라앉음 → 고기압', PAL.cool], [at(A.dry) - 0.1, '메마름 → 사막 띠', '#E8CF9A'],
    [at(A.ret) - 0.2, '땅 위를 따라 적도로', PAL.warm], [at(A.hadleyName) - 0.1, '한 바퀴 = 해들리 순환', BELT.trade.col]];
  let k = 0; while (k + 1 < states.length && t >= states[k + 1][0]) k++;
  const sw = m.surfWind(t), y0 = 1090, h = 200, wq = clamp((q.phi - 0.5) / 29.5), col = q.h > 0.5 ? mix(PAL.warm, PAL.cool, wq) : mix(PAL.cool, PAL.warm, 1 - wq);
  withAlpha(c, a, () => {
    panel(c, T, 140, y0, 800, h, 0.92);
    tracker(c, 168, y0 + 26, col, 0.6);
    stage.text('추적하는 공기 덩어리', 188, y0 + 26, {size: 24, weight: 700, color: T.ink});
    const cells = [[140, 150, '위도'], [290, 210, '높이'], [500, 160, '지표 바람'], [660, 280, '상태']];
    cells.forEach(([x, w, s], i) => { if (i) line(c, [[x, y0 + 56], [x, y0 + h - 14]], rgba(T.border, 1), 1.2); stage.text(s, x + w / 2, y0 + 72, {size: 24, color: T.muted, align: 'center'}); });
    stage.text(q.phi < 1.5 ? '0°' : `${Math.round(q.phi)}°N`, 215, y0 + 130, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
    // height gauge
    const gx = 318, gy0 = y0 + 166, gy1 = y0 + 96, hy = lerp(gy0, gy1, (q.h - m.H_LO) / (m.H_HI - m.H_LO));
    line(c, [[gx, gy0], [gx, gy1]], rgba(T.muted, 0.8), 2); line(c, [[gx - 8, gy0], [gx + 8, gy0]], rgba('#9FB79A', 0.9), 3);
    circle(c, gx, hy, 6, col);
    const dh = q2.h - q.h, htxt = q.h < 0.16 ? '지표' : q.h > 0.8 ? '상공 약 15 km' : dh > 0 ? '↑ 오르는 중' : '↓ 내려가는 중';
    stage.text(htxt, gx + 20, y0 + 130, {size: 26, weight: 700, color: T.ink, maxWidth: 164});
    // surface wind meter (same value as the wind sound)
    const mx0 = 516, mx1 = 644, my = y0 + 118;
    rect(c, mx0, my, mx1 - mx0, 12, 6, rgba(T.border, 1));
    if (sw != null) rect(c, mx0, my, (mx1 - mx0) * clamp(sw), 12, 6, BELT.trade.col);
    stage.text(sw == null ? '— (상공)' : sw < 0.08 ? '거의 없음' : sw < 0.45 ? '약함' : '셈', 580, y0 + 158, {size: 24, weight: 700, color: sw != null && sw < 0.08 ? PAL.mark : T.ink, align: 'center'});
    // state (cross-fade)
    const age = t - states[k][0], fo = 1 - smooth(age / 0.18), fa = smooth((age - 0.16) / 0.22);   // old out, then new in (no overlap)
    if (k > 0 && fo > 0) stage.text(states[k - 1][1], 800, y0 + 130, {size: 28, weight: 700, color: states[k - 1][2], align: 'center', alpha: fo, maxWidth: 266});
    stage.text(states[k][1], 800, y0 + 130, {size: 28, weight: 700, color: states[k][2], align: 'center', alpha: k === 0 ? 1 : fa, maxWidth: 266});
  });
}
function groundArrow(stage, V, lat, a, label, where) {
  if (a <= 0) return;
  const {ctx: c} = stage, span = 26, pts = [];
  for (let i = 0; i <= 30; i++) pts.push(proj(V, lat, V.lam - span + 2 * span * i / 30));
  withAlpha(c, a, () => {
    line(c, pts, rgba('#000', 0.45), 7); line(c, pts.slice(0, -1), PAL.mark, 3.5);
    arrow(c, pts[27], pts[30], PAL.mark, 3.5, {head: 16});
    const mid = pts[15];
    tag(stage, label, mid[0], mid[1] + (where === 'below' ? 30 : -28), {size: 26, color: PAL.mark});
  });
}
function parcelOnGlobe(stage, V, t, P, a, col) {
  if (a <= 0) return;
  const {ctx: c} = stage, path = P.path(Math.max(t, P.t0));
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); c.arc(V.cx, V.cy, V.R, 0, TAU); c.clip();
    if (path.length > 1) { strokeLL(c, V, path, rgba('#000', 0.5), 6); strokeLL(c, V, path, col, 3.2); }
    // start meridian marker (where it left the 30° circle)
    c.restore();
    const [la, lo] = P.at(t), q = proj(V, la, lo);
    if (q[2] > 0.05) tracker(c, q[0], q[1], col, V.R / 262);
  });
}
function bracket(stage, V, P, band, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, lo = band === 'low' ? 0 : 30, hi = lo + 30, l0 = P.lam0 - (band === 'low' ? 26 : 10), l1 = P.lam0 + (band === 'low' ? 12 : 28);
  const box = [...Array.from({length: 20}, (_, i) => [lo, lerp(l0, l1, i / 19)]), ...Array.from({length: 12}, (_, i) => [lerp(lo, hi, i / 11), l1]), ...Array.from({length: 20}, (_, i) => [hi, lerp(l1, l0, i / 19)]), ...Array.from({length: 12}, (_, i) => [lerp(hi, lo, i / 11), l0])];
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); c.arc(V.cx, V.cy, V.R, 0, TAU); c.clip();
    strokeLL(c, V, box, rgba(PAL.mark, 0.85), 2, {dash: [6, 5]});
    c.restore();
    const pL = proj(V, lo, l0), pR = proj(V, lo, l1);
    if (pL[2] > 0 && pR[2] > 0) {
      line(c, [[pL[0], pL[1]], [INS.x0 + 6, INS.sy]], rgba(PAL.mark, 0.35), 1.3, {dash: [4, 5]});
      line(c, [[pR[0], pR[1]], [INS.x1 - 6, INS.sy]], rgba(PAL.mark, 0.35), 1.3, {dash: [4, 5]});
    }
  });
}
function coriolisPanel(stage, t, ctx, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, {x0, x1, sy, sh} = INS, tl = ctx.tl;
  const cn = fadeIn(t, evT(ctx, 'lab_coriolis', A.coriolisName) - 0.1, 0.5);
  const grow = easeInOut((t - (evT(ctx, 'bend', A.bent) - 0.2)) / 1.6);
  withAlpha(c, a, () => {
    panel(c, T, x0, sy, x1 - x0, sh, 0.92);
    stage.text('움직이는 공기가 꺾여 보이는 방향', 540, sy + 24, {size: 24, color: T.muted, align: 'center', alpha: 1 - cn});
    withAlpha(c, cn, () => stage.text('전향력 (코리올리 효과)', 540, sy + 26, {role: 'display', size: 30, weight: 700, color: PAL.mark, align: 'center'}));
    const items = [[270, '북반구 · 오른쪽으로', 1, BELT.trade.col], [540, '적도 · 꺾이지 않음', 0, T.ink], [810, '남반구 · 왼쪽으로', -1, BELT.trade.col]];
    for (const [x, s, bend, col] of items) {
      const yb = sy + sh - 54, yt = sy + 62, L = (yb - yt) * grow;
      line(c, [[x, yb], [x, yt]], rgba(T.muted, 0.7), 1.6, {dash: [5, 5]});
      const pts = []; for (let i = 0; i <= 20; i++) { const u = i / 20 * grow; pts.push([x + bend * 52 * u * u, yb - (yb - yt) * u]); }
      if (grow > 0.05) { line(c, pts.slice(0, -1), col, 3.2); arrow(c, pts[pts.length - 3], pts[pts.length - 1], col, 3.2, {head: 13}); }
      circle(c, x, yb, 5, col);
      stage.text(s, x, sy + sh - 22, {size: 24, weight: 700, color: col, align: 'center'});
    }
  });
}
function tradeLabels(stage, V, t, ctx, a) {
  if (a <= 0) return;
  const tl = ctx.tl, n = fadeIn(t, evT(ctx, 'lab_ne', A.ne) - 0.1, 0.5) * a, s = fadeIn(t, evT(ctx, 'lab_se', A.se) - 0.1, 0.5) * a;
  const p = proj(V, 14, V.lam - 24), q = proj(V, -14, V.lam - 24);
  tag(stage, '북동무역풍', p[0], p[1], {size: 26, color: BELT.trade.col, border: BELT.trade.col, a: n});
  tag(stage, '남동무역풍', q[0], q[1], {size: 26, color: BELT.trade.col, border: BELT.trade.col, a: s});
}
function westLabels(stage, V, t, ctx) {
  const tl = ctx.tl, at = r => tl.at(r);
  const w = fadeIn(t, evT(ctx, 'lab_west', A.westerly) - 0.1, 0.5) * fadeOut(t, at(A.three) - 0.3, 0.6);
  const pz = fadeIn(t, evT(ctx, 'lab_polar', A.polarE) - 0.1, 0.5) * fadeOut(t, at(A.three) - 0.3, 0.6);
  for (const hs of [1, -1]) {
    const p = proj(V, 47 * hs, V.lam + 38), q = proj(V, 72 * hs, V.lam + 14);
    const wk = hs > 0 ? fadeOut(t, at('s19') - 0.5, 0.4) : 1;   // the NH label gives way to the Korea label in s19
    if (p[2] > 0.2) tag(stage, '편서풍', p[0], p[1], {size: 26, color: BELT.west.col, border: BELT.west.col, a: w * wk});
    if (q[2] > 0.2) tag(stage, '극동풍', q[0], q[1], {size: 26, color: BELT.polar.col, border: BELT.polar.col, a: pz});
  }
}
function legend(stage, t, ctx, a, a3) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme;
  const rows = [['60~90°N', '극동풍', 'polar', 1], ['30~60°N', '편서풍', 'west', 1], ['0~30°N', '북동무역풍', 'trade', 1], ['적도', '무풍대', null, 0], ['0~30°S', '남동무역풍', 'trade', -1], ['30~60°S', '편서풍', 'west', -1], ['60~90°S', '극동풍', 'polar', -1]];
  const y0 = 990;
  withAlpha(c, a, () => {
    panel(c, T, 200, y0, 680, 326, 0.92);
    rows.forEach(([lat, name, id, hs], i) => {
      const y = y0 + 34 + i * 43, col = id ? BELT[id].col : T.muted, q = smooth((a * 7 - i) / 1.5);
      withAlpha(c, q, () => {
        stage.text(lat, 462, y, {size: 24, color: T.muted, align: 'right'});
        if (id) { const [u, v] = windUV(hs * (id === 'trade' ? 15 : id === 'west' ? 45 : 74)); const L = 26, nx = u / Math.hypot(u, v), ny = -v / Math.hypot(u, v); arrow(c, [505 - nx * L / 2, y - ny * L / 2], [505 + nx * L / 2, y + ny * L / 2], col, 3, {head: 11}); }
        else line(c, [[490, y], [520, y]], rgba(T.muted, 0.8), 2, {dash: [3, 4]});
        stage.text(name, 548, y, {size: 26, weight: 700, color: col});
      });
    });
    // "three belts per hemisphere" braces
    if (a3 > 0) withAlpha(c, a3, () => {
      for (const [i0, i1, s] of [[0, 2, '북반구 · 셋'], [4, 6, '남반구 · 셋']]) {
        const ya = y0 + 34 + i0 * 43 - 14, yb = y0 + 34 + i1 * 43 + 14, x = 316;
        line(c, [[x + 12, ya], [x, ya], [x, yb], [x + 12, yb]], rgba(T.light, 0.85), 2);
        const [h1, h2] = s.split(' · ');
        stage.text(h1, x - 12, (ya + yb) / 2 - 14, {size: 24, weight: 700, color: T.light, align: 'right'});
        stage.text(`띠 ${h2}`, x - 12, (ya + yb) / 2 + 14, {size: 24, weight: 700, color: T.light, align: 'right'});
      }
    });
  });
}
function koreaLayer(stage, V, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r);
  const kA = fadeIn(t, evT(ctx, 'lab_korea', A.korea) - 0.1, 0.5) * fadeOut(t, at(A.polarSink) - 0.2, 0.6);
  if (kA <= 0) return;
  const q = proj(V, 37.5, 127.5); if (q[2] < 0.05) return;
  const wA = fadeIn(t, evT(ctx, 'weather', A.weather) - 0.2, 0.6);
  withAlpha(c, kA, () => {
    // weather systems (cloud glyphs) carried west → east by the westerlies (faster than the ground)
    for (let k = 0; k < 4; k++) {
      const u = ((t - at(A.weather)) * 0.11 + k / 4) % 1, lo = 100 + 50 * ((u + 1) % 1), la = 37 + 3 * Math.sin(k * 1.7);
      const p = proj(V, la, lo); if (p[2] < 0.15) continue;
      cloudGlyph(c, p[0], p[1], V.R / 300, wA * Math.sin(Math.PI * ((u + 1) % 1)) * smooth((p[2] - 0.15) / 0.2));
    }
    ring(c, q[0], q[1], 13, PAL.mark, 3); circle(c, q[0], q[1], 4, PAL.mark);
    const lx = clamp(q[0], 360, 720);
    line(c, [[q[0], q[1] - 14], [lx, q[1] - 40]], rgba(PAL.mark, 0.7), 1.5);
    tag(stage, '한반도 · 편서풍 띠', lx, q[1] - 58, {size: 26, color: PAL.mark, border: PAL.mark});
    const arrA = fadeIn(t, evT(ctx, 'w2e', A.w2e) - 0.2, 0.5);
    if (arrA > 0) withAlpha(c, arrA, () => {
      const pts = Array.from({length: 21}, (_, i) => proj(V, 33, 105 + i * 2.2));
      if (pts.every(pp => pp[2] > 0.05)) { line(c, pts.slice(0, -1), BELT.west.col, 3.5); arrow(c, pts[17], pts[20], BELT.west.col, 3.5, {head: 15}); }
      const mid = pts[10]; tag(stage, '날씨: 서 → 동', mid[0], mid[1] + 30, {size: 24, color: BELT.west.col});
    });
  });
}
function voyageLayer(stage, V, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), {voy} = m;
  const S = shipAt(m, t);
  c.save(); c.beginPath(); c.arc(V.cx, V.cy, V.R, 0, TAU); c.clip();
  const outQ = S.leg < 2 ? S.q : 1, outPts = voy.OUT.pts.filter((_, i) => voy.OUT.cum[i] <= outQ * voy.OUT.len);
  const head = voy.OUT.at(outQ);
  if (t > voy.leg0[0]) { const pts = [...outPts, [head[0], head[1]]]; if (pts.length > 1) { strokeLL(c, V, pts, rgba('#000', 0.5), 6); strokeLL(c, V, pts, BELT.trade.col, 3.4); } }
  if (S.leg === 2) {
    strokeLL(c, V, [[24.0, -74.5], [19.8, -70.7]], rgba(T.muted, 0.7), 2, {dash: [3, 5]});
    const pts = [...voy.RET.pts.filter((_, i) => voy.RET.cum[i] <= S.q * voy.RET.len), voy.RET.at(S.q).slice(0, 2)];
    if (pts.length > 1) { strokeLL(c, V, pts, rgba('#000', 0.5), 6); strokeLL(c, V, pts, BELT.west.col, 3.4); }
  }
  c.restore();
  const pin = (la, lo, s, dx, dy, a, align = 'left') => {
    if (a <= 0) return; const q = proj(V, la, lo); if (q[2] < 0.1) return;
    withAlpha(c, a * smooth((q[2] - 0.1) / 0.2), () => { circle(c, q[0], q[1], 5, PAL.mark); tag(stage, s, q[0] + dx, q[1] + dy, {size: 24, color: T.ink, align}); });
  };
  const s0 = fadeIn(t, at('s21') + 0.1, 0.5);
  pin(37.2, -6.9, '팔로스 (출발)', 16, 22, s0);
  pin(28.1, -15.4, '카나리아 제도', 14, 26, fadeIn(t, voy.leg0[1] - 0.3, 0.5));
  pin(24.0, -74.5, '바하마 (1492.10)', -12, -26, fadeIn(t, voy.leg1[1] - 0.3, 0.5), 'right');
  pin(37.0, -25.1, '아조레스', 0, 28, fadeIn(t, lerp(voy.leg2[0], voy.leg2[1], 0.62), 0.4), 'center');
  pin(38.7, -9.1, '리스본 (1493.3)', -12, -26, fadeIn(t, voy.leg2[1] - 0.3, 0.5), 'right');
  // leg captions
  const oA = fadeIn(t, evT(ctx, 'voy_trade', A.trades21) - 0.1, 0.5), rA = fadeIn(t, evT(ctx, 'voy_west', A.west21) - 0.6, 0.5);
  const qo = proj(V, 21.5, -45), qr = proj(V, 45, -52);
  if (qo[2] > 0.1) tag(stage, '갈 때: 북동무역풍', qo[0], qo[1] + 8, {size: 26, color: BELT.trade.col, border: BELT.trade.col, a: oA});
  if (qr[2] > 0.1) tag(stage, '올 때: 편서풍', qr[0], qr[1] - 8, {size: 26, color: BELT.west.col, border: BELT.west.col, a: rA});
  // the ship
  const q = proj(V, S.lat, S.lon);
  if (q[2] > 0.05) {
    const q2 = S.leg < 2 ? proj(V, ...voy.OUT.at(Math.min(1, S.q + 0.01)).slice(0, 2)) : proj(V, ...voy.RET.at(Math.min(1, S.q + 0.01)).slice(0, 2));
    const face = q2[0] >= q[0] ? 1 : -1;
    ship(c, q[0], q[1] - 2, 1.15 * V.R / 330, face, 'full', fadeIn(t, at('s21'), 0.4));
  }
}
/** voyage: the ship's latitude on a belt ruler (0–50°N) and the wind it sails in */
function voyageGauge(stage, t, ctx, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, m = M(ctx), S = shipAt(m, t), y0 = 1016;
  const X = la => lerp(230, 890, la / 50), yb = y0 + 66, hb = 30;
  withAlpha(c, a, () => {
    panel(c, T, 140, y0, 800, 190, 0.92);
    stage.text('배가 있는 위도와 그곳의 바람', 156, y0 + 24, {size: 24, weight: 700, color: T.ink});
    rect(c, X(0), yb, X(4) - X(0), hb, 0, rgba(T.muted, 0.35));
    rect(c, X(4), yb, X(30) - X(4), hb, 0, rgba(BELT.trade.col, 0.55));
    rect(c, X(30), yb, X(50) - X(30), hb, 0, rgba(BELT.west.col, 0.55));
    stage.text('북동무역풍', X(17), yb + hb / 2, {size: 24, weight: 700, color: '#1A1208', align: 'center'});
    stage.text('편서풍', X(45), yb + hb / 2, {size: 24, weight: 700, color: '#06221E', align: 'center'});
    for (const la of [0, 10, 20, 30, 40, 50]) { line(c, [[X(la), yb + hb], [X(la), yb + hb + 6]], rgba(T.muted, 0.9), 1.4); stage.text(`${la}°N`, X(la), yb + hb + 22, {size: 24, color: la === 30 ? T.ink : T.muted, align: 'center'}); }
    // ship marker
    const x = X(clamp(S.lat, 0, 50)), inTr = S.lat < 30;
    line(c, [[x, yb - 4], [x, yb + hb + 4]], PAL.mark, 3);
    ship(c, x, yb - 8, 0.85, S.leg < 2 ? -1 : 1, 'full', 1);
    const s = S.leg === 0 ? '출발 · 남쪽으로 내려가 무역풍 띠로' : inTr ? '지금 받는 바람: 북동무역풍 (서쪽으로)' : '지금 받는 바람: 편서풍 (동쪽으로)';
    stage.text(s, 540, y0 + 166, {size: 26, weight: 700, color: S.leg === 0 ? T.ink : inTr ? BELT.trade.col : BELT.west.col, align: 'center'});
  });
}
function insolGraph(stage, t, a) {
  const {ctx: c} = stage, T = stage.theme, x0 = 140, y0 = 1100, w = 800, h = 232;
  const X = phi => lerp(x0 + 80, x0 + w - 40, phi / 90), Y = q => lerp(y0 + h - 44, y0 + 56, q / 450);
  panel(c, T, x0, y0, w, h, 0.92);
  stage.text('1년 평균 햇빛 에너지 (대기 위, W/m²)', x0 + 16, y0 + 24, {size: 24, weight: 700, color: T.ink});
  line(c, [[X(0), Y(0)], [X(90) + 8, Y(0)]], rgba(T.muted, 0.8), 1.5); line(c, [[X(0), Y(0)], [X(0), Y(450)]], rgba(T.muted, 0.8), 1.5);
  for (const phi of [0, 30, 60, 90]) stage.text(phi === 0 ? '적도 0°' : phi === 90 ? '극 90°' : `${phi}°`, X(phi), Y(0) + 22, {size: 24, color: T.muted, align: 'center'});
  for (const q of [200, 400]) { stage.text(String(q), X(0) - 10, Y(q), {size: 24, color: T.muted, align: 'right'}); line(c, [[X(0), Y(q)], [X(90), Y(q)]], rgba(T.border, 0.8), 1); }
  const pts = []; const g = easeOut(a); for (let phi = 0; phi <= 90 * g; phi += 1.5) pts.push([X(phi), Y(insol(phi))]);
  if (pts.length > 1) line(c, pts, PAL.sun, 3.2);
  withAlpha(c, smooth((a - 0.6) / 0.4), () => {
    circle(c, X(0), Y(insol(0)), 6, PAL.sun); circle(c, X(90), Y(insol(90)), 6, PAL.sun);
    stage.text(`약 ${fmt(insol(0))}`, X(0) + 16, Y(insol(0)) + 22, {size: 24, weight: 700, color: PAL.sun});
    stage.text(`약 ${fmt(insol(90))}`, X(90) - 4, Y(insol(90)) - 24, {size: 24, weight: 700, color: PAL.sun, align: 'right'});
    tag(stage, `적도가 극의 약 ${(insol(0) / insol(90)).toFixed(1)}배`, X(55), Y(390), {size: 26, color: PAL.sun, border: PAL.sun});
  });
}

/** Drawn after the scene, before captions. */
function baseOverlays(stage, t, ctx) {
  const id = ctx.scene.id, tl = ctx.tl;
  let [kicker, title] = titles[id] || ['', ''];
  if (id === 'belts' && t >= tl.at('s19') - 0.3) [kicker, title] = ['메커니즘 ④ 세 개의 띠', t >= tl.at('s20') - 0.3 ? '반구마다 세 개의 띠' : '우리나라는 편서풍 띠'];
  if (title || kicker) head(stage, kicker, title, ctx.scene.p);
  progressBar(stage, t, tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// =====================================================================================================
const BAND_TRADE = {low: 300, high: 1500}, BAND_WEST = {low: 110, high: 620}, BAND_POLAR = {low: 1100, high: 3200};
export function soundEvents(tl) {
  const m = model(tl), r = (x, d = 3) => +x.toFixed(d), ev = [], at = ref => tl.at(ref);
  // amplitude tables sampled every 0.1 s; interior points of constant runs are dropped (piecewise-linear → same sound)
  const squeeze = P => P.filter((q, i) => i === 0 || i === P.length - 1 || q.slice(1).some((v, k) => v !== P[i - 1][k + 1] || v !== P[i + 1][k + 1]));
  const table = (t0, t1, f, dt = 0.1) => { const pts = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) pts.push([r(tt - t0), r(clamp(f(tt)), 4)]); return squeeze(pts); };
  // hook: the trade-wind ship gets a steady wind, the doldrums ship none
  const hk = tl.scene('hook'), tS = at(A.sameSide), tX = at(A.stops);
  ev.push({id: 'wind_hook', at: 'hook', kind: 'env_noise', params: {...BAND_TRADE, gain_db: -20, fade: 0.05,
    points: table(hk.start, hk.end - 0.05, tt => 0.8 * smooth((tt - tS + 0.4) / 0.8) * (1 - 0.95 * smooth((tt - tX + 0.2) / 1.0)))},
    means: '훅: 무역풍 속 배에는 일정한 바람 소리, "멎는"에서 무풍대 배로 넘어가며 거의 0'});
  // essence: same beam, 2× wider footprint → half the energy per area → −6 dB
  ev.push({id: 'beam_eq', at: {...A.vertical, offset: 0.2}, kind: 'tone', params: {freq: 330, dur: 1.0, harmonics: [1, 0.3], attack: 0.15, gain_db: -24}, means: '적도 햇빛 다발이 닿음 (기준 세기)'});
  ev.push({id: 'beam_60', at: {...A.sameArea, offset: 0.5}, kind: 'tone', params: {freq: 330, dur: 1.0, harmonics: [1, 0.3], attack: 0.15, gain_db: -30}, means: '60° 햇빛 다발: 같은 빛이 약 2배 넓게 퍼짐 → 넓이당 절반 = 같은 음 −6 dB'});
  // rise: rising parcel = low tone gliding up; the doldrums: the specks' drift dies away; showers
  const rp = []; for (let tt = m.tRise0 - 0.2; tt <= m.tRise1 + 0.4; tt += 0.05) { const h = m.shellAt(tt).h, h2 = m.shellAt(tt + 0.05).h; rp.push([r(tt - m.tRise0 + 0.2), r(85 + 95 * (h - m.H_LO) / (m.H_HI - m.H_LO), 2), r(clamp(Math.abs(h2 - h) / 0.05 * 2.2), 4)]); }
  rp[rp.length - 1][2] = 0; const rpS = squeeze(rp);
  ev.push({id: 'rise_tone', at: r(m.tRise0 - 0.2, 4), kind: 'chirp', params: {gain_db: -22, harmonics: [1, 0.5, 0.25], fade: 0.08, points: rpS}, means: '데워진 공기가 솟음: 공기 덩어리 높이 → 음높이 85 → 180 Hz, 오르는 동안만 들림'});
  const rs = tl.scene('rise'), tCalm = at(A.noWind);
  ev.push({id: 'wind_doldrums', at: 'rise', kind: 'env_noise', params: {...BAND_TRADE, gain_db: -16, fade: 0.05, points: table(rs.start, at(A.shower), tt => m.surfWind(tt))},
    means: '적도의 약한 바람(화면의 작은 흐름) — "바람이 거의 없고"에서 0으로'});
  const hs = tl.scene('hadley');
  ev.push({id: 'rain', at: {...A.shower, offset: -0.2}, kind: 'env_noise', params: {low: 2600, high: 7500, gain_db: -22, fade: 0.1, points: table(at(A.shower) - 0.2, hs.start + 2.2, tt => smooth((tt - at(A.shower) + 0.2) / 0.6) * (1 - smooth((tt - hs.start - 1) / 1.2)))},
    means: '적도 소나기 구름 아래 빗소리 (화면의 빗줄기와 같은 구간)'});
  // hadley: sinking at 30° = soft high → low sweep; surface return = wind noise ∝ model wind at the parcel latitude
  ev.push({id: 'sink', at: r(m.tSink0, 4), kind: 'whoosh', params: {dur: r(m.tSink1 - m.tSink0, 3), f_start: 2400, f_end: 380, q: 1.6, gain_db: -21}, means: '30°에서 공기가 가라앉음 (높은 쉬익 → 낮게)'});
  ev.push({id: 'wind_return', at: r(m.tRet0, 4), kind: 'env_noise', params: {...BAND_TRADE, gain_db: -17, fade: 0.05, points: table(m.tRet0, m.tRet1 + 0.6, tt => 0.9 * (m.surfWind(tt) ?? 0) * (1 - smooth((tt - m.tRet1) / 0.6)))},
    means: '지표를 따라 적도로 돌아가는 공기: 바람 소리 세기 = 그 위도의 모형 지표 풍속 (30° 0 → 가운데 최대 → 적도 0)'});
  // latitude ticks (every 10°) for every tracked air parcel
  const cr = m.crossings;
  ev.push({id: 'lat_ticks', at: r(cr[0].t, 4), kind: 'custom', params: {gain_db: -21, layers: cr.map(x => ({kind: 'tick', offset: r(x.t - cr[0].t, 4), params: {freq: 900 + 18 * x.lat, decay: 0.05, click: 0.3}}))},
    means: `추적 공기 덩어리가 위도선(10° 간격)을 지날 때마다 틱 — ${cr.length}번, 음높이 = 위도`});
  // coriolis: ground speed → pitch; the tracked parcel's wind
  ev.push({id: 'g1670', at: A.v1670, kind: 'tone', params: {freq: r(uGround(0) / 4, 1), dur: 0.8, harmonics: [1, 0.25], gain_db: -24}, means: '적도 땅의 동쪽 속도 1670 km/h → 음높이 (속도 ÷ 4 Hz)'});
  ev.push({id: 'g1450', at: A.v1450, kind: 'tone', params: {freq: r(U30 / 4, 1), dur: 0.8, harmonics: [1, 0.25], gain_db: -24}, means: '30° 땅의 동쪽 속도 1450 km/h → 음높이 (더 낮음)'});
  const P1 = m.p1, P2 = m.p2;
  ev.push({id: 'wind_trade', at: r(P1.t0, 4), kind: 'env_noise', params: {...BAND_TRADE, gain_db: -19, fade: 0.05, points: table(P1.t0, P1.t0 + P1.T + 0.8, tt => 0.95 * windSpeed(P1.at(tt)[0]) * (1 - smooth((tt - P1.t0 - P1.T) / 0.8)))},
    model: {n: m.keys.length, t0: r(P1.t0, 4), t2: r(P2.t0, 4), crossings: cr.length, map: 'amp = windSpeed(φ_parcel)'},
    means: '무역풍 띠를 따라 적도로 오는 공기: 바람 소리 세기 = 그 위도의 모형 지표 풍속 (무풍대에서 0)'});
  ev.push({id: 'trades_on', at: {...A.fromEast, offset: -0.1}, kind: 'env_noise', params: {...BAND_TRADE, gain_db: -23, fade: 0.1, points: [[0, 0], [0.8, 0.6], [2.4, 0.6], [3.4, 0]]}, means: '지구본 전체에 무역풍 띠가 나타남 (같은 무역풍 음색)'});
  ev.push({id: 'bend', at: A.bent, kind: 'tick', params: {freq: 700, decay: 0.09, gain_db: -26, repeat: 3, interval: 0.16}, means: '전향력 그림: 북반구·적도·남반구 화살표가 그려짐'});
  // belts: the westerly parcel (lower noise band), polar easterlies (thin high band), the three belts
  ev.push({id: 'wind_west', at: r(P2.t0, 4), kind: 'env_noise', params: {...BAND_WEST, gain_db: -17, fade: 0.05, points: table(P2.t0, P2.t0 + P2.T + 0.8, tt => 0.95 * windSpeed(P2.at(tt)[0]) * (1 - smooth((tt - P2.t0 - P2.T) / 0.8)))},
    means: '30°에서 극 쪽으로 가는 공기(편서풍): 낮은 대역 잡음, 세기 = 그 위도의 모형 지표 풍속'});
  ev.push({id: 'sink_polar', at: {...A.polarSink, offset: 0.2}, kind: 'whoosh', params: {dur: 1.3, f_start: 2600, f_end: 500, q: 1.6, gain_db: -22}, means: '극에서 찬 공기가 가라앉음'});
  ev.push({id: 'wind_polar', at: {...A.polarE, offset: -0.1}, kind: 'env_noise', params: {...BAND_POLAR, gain_db: -20, fade: 0.1, points: [[0, 0], [0.8, 0.7], [2.2, 0.7], [3.2, 0]]}, means: '극동풍 띠가 나타남 (가늘고 높은 대역 잡음)'});
  ev.push({id: 'legend', at: A.three, kind: 'custom', params: {gain_db: -25, layers: [880, 587, 440].map((f, i) => ({kind: 'tick', offset: i * 0.22, params: {freq: f, decay: 0.1, click: 0.2}}))}, means: '반구마다 세 띠: 극동풍 · 편서풍 · 무역풍 (높은 위도일수록 높은 음)'});
  // voyage: wind at the ship (trades outbound, westerlies on the way back)
  const v = m.voy, sh = tt => shipAt(m, tt);
  ev.push({id: 'voy_trade', at: r(v.leg1[0], 4), kind: 'env_noise', params: {...BAND_TRADE, gain_db: -16, fade: 0.08, points: table(v.leg1[0], v.leg1[1] + 0.3, tt => 0.85 * windSpeed(sh(tt).lat) * smooth((tt - v.leg1[0]) / 0.4) * (1 - smooth((tt - v.leg1[1]) / 0.3)))},
    means: '갈 때: 배가 있는 위도의 무역풍 세기 = 무역풍 대역 잡음'});
  ev.push({id: 'voy_west', at: r(v.leg2[0], 4), kind: 'env_noise', params: {...BAND_WEST, gain_db: -16, fade: 0.08, points: table(v.leg2[0], v.leg2[1] + 0.3, tt => { const la = sh(tt).lat; return 0.95 * (la >= 30 ? windSpeed(la) : 0) * (1 - smooth((tt - v.leg2[1]) / 0.3)); })},
    means: '올 때: 배가 30°N를 넘어 편서풍 띠에 들면 편서풍 대역 잡음 (세기 = 그 위도의 모형 풍속)'});
  // myth / close
  ev.push({id: 'myth_no', at: A.only, kind: 'tick', params: {freq: 520, decay: 0.1, gain_db: -23, repeat: 2, interval: 0.12}, means: '오해에 줄을 그음'});
  ev.push({id: 'close_swell', at: A.pattern, kind: 'swell', params: {freqs: [220, 330, 440], dur: 1.8, gain_db: -24}, means: '정리: 바람의 띠 = 태양 × 자전'});
  // visual-only label anchors (kept in the shared list so stills land on them)
  for (const [id, ref] of [['lab_low', A.lowP], ['lab_doldrums', A.doldrumsName], ['lab_high', A.highP], ['lab_desert', A.deserts], ['lab_hadley', A.hadleyName],
    ['lab_ne', A.ne], ['lab_se', A.se], ['lab_coriolis', A.coriolisName], ['lab_west', A.westerly], ['lab_korea', A.korea], ['weather', A.weather], ['w2e', A.w2e],
    ['lab_pole', A.polarSink], ['lab_polar', A.polarE], ['myth_energy', A.energy]]) ev.push({id, at: ref, kind: 'silent', means: '화면 라벨이 나타나는 시각'});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음(사용자 결정). 바람 소리(대역 잡음)의 세기 = 추적하는 공기 덩어리 위도의 모형 지표 풍속, 상승음·하강 쉬익·위도선 틱·빗소리·항해 바람 모두 `node episodes/global-winds/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형에서 써 넣습니다. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const m = model(tl);
  console.log(`events: ${sound.events.length}; spin keys ${m.keys.length}; parcel t0 ${m.p1.t0.toFixed(2)} / ${m.p2.t0.toFixed(2)} s; latitude ticks ${m.crossings.length}`);
}

// First frame = thumbnail (2026-11-07 retrofit, user request): poster 0–0.9 s, morph away 0.9–1.7 s, back at the last
// sentence. Config and key picture: episodes/global-winds/poster.json, poster-key.jpg (pipeline/render/posterintro.mjs).
import {posterIntro} from '../../pipeline/render/posterintro.mjs';
export const overlays = await posterIntro(baseOverlays, {slug: 'global-winds'});
