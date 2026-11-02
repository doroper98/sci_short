// Episode scenes — "계절은 왜 생길까 — 거리가 아니라 기울기"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - ONE state variable: the date d(t) (day of year, 0 = 1 Jan; unwrapped, may exceed 365). It is a keyed, eased
//    schedule anchored to narration words (dateKeys). Picture, readouts, graphs and sound.json all read d(t).
//  - Orbit: two-body Kepler ellipse fitted to the 2026 perihelion/aphelion distances 147.10 / 152.09 million km
//    (e = 0.01668), perihelion at d = 2.72, longitude of perihelion 102.94°. Solar declination from the Sun's
//    ecliptic longitude (ε = 23.44°). Solstices/equinoxes are solved from the same model (Jun 21 / Dec 22 / Sep 23).
//    The Kepler aphelion falls half a period after perihelion (5–6 Jul); the on-screen "7월 6일" is the ephemeris date.
//  - Seoul φ = 37.5°: noon altitude 90 − |φ − δ|, 1 m stick shadow 1/tan h, beam footprint 1/sin h,
//    day length 2·acos(−tan φ tan δ)/15 (sun centre, no refraction), daily mean top-of-atmosphere insolation
//    Q = (S0/π)(1/r²)[h0 sinφ sinδ + cosφ cosδ sin h0], S0 = 1361 W/m².
//  - Seoul temperature (lag scene): piecewise cosine (C¹) through −1.9 °C (min, 20 Jan) and 26.1 °C (max, 5 Aug);
//    only those two values are labelled. Heat bars: in = Q(d), out = Q(d) − C·dT/dd (C = 400, display only, no numbers).
//  - Globe: orthographic engine copied from episodes/global-winds (limb clipping of Natural Earth land), extended
//    with a screen roll so the axis can lean; the Earth's axis always points to (0, sin ε, cos ε) in ecliptic
//    coordinates, the Sun direction and Seoul's local solar time fix the spin phase. Spin is west → east.
//  - Sound: every model-driven event is written from this file:
//      node episodes/seasons/scenes.mjs --emit-sound [--timeline outputs/seasons/narration/timeline.json]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
const D2R = Math.PI / 180;
export const EPS = 23.44;
export const SEOUL = {lat: 37.5, lon: 127.0}, SYDNEY = {lat: -33.9, lon: 151.2};
export const S0 = 1361;
export const R_PERI = 147.10, R_APH = 152.09;                       // million km, 2026-01-03 / 2026-07-06
export const A_ORB = (R_PERI + R_APH) / 2, ECC = (R_APH - R_PERI) / (R_APH + R_PERI);
const AU = 149.598, YEAR = 365.256, D_PERI = 2.72, LON_PERI = 102.94;
const MONTH0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

/** Earth on its Kepler orbit at day d → r (million km), rau (AU), L (Earth heliocentric longitude), lsun, decl (deg) */
export function orbit(d) {
  const M = TAU * (d - D_PERI) / YEAR;
  let E = M; for (let i = 0; i < 6; i++) E -= (E - ECC * Math.sin(E) - M) / (1 - ECC * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + ECC) * Math.sin(E / 2), Math.sqrt(1 - ECC) * Math.cos(E / 2));
  const r = A_ORB * (1 - ECC * Math.cos(E)), L = nu / D2R + LON_PERI, lsun = L + 180;
  return {r, rau: r / AU, L, lsun, decl: Math.asin(Math.sin(EPS * D2R) * Math.sin(lsun * D2R)) / D2R};
}
export const decl = d => orbit(d).decl;
export const noonAlt = (d, lat = SEOUL.lat) => 90 - Math.abs(lat - decl(d));
export const shadowLen = h => 1 / Math.tan(h * D2R);
export const spreadOf = h => 1 / Math.sin(h * D2R);
export const halfDay = (d, lat = SEOUL.lat) => Math.acos(clamp(-Math.tan(lat * D2R) * Math.tan(decl(d) * D2R), -1, 1)) / D2R;
export const dayLen = (d, lat = SEOUL.lat) => 2 * halfDay(d, lat) / 15;
export function insol(d, lat = SEOUL.lat) {
  const o = orbit(d), p = lat * D2R, dl = o.decl * D2R, h0 = halfDay(d, lat) * D2R;
  return S0 / Math.PI / (o.rau * o.rau) * (h0 * Math.sin(p) * Math.sin(dl) + Math.cos(p) * Math.cos(dl) * Math.sin(h0));
}
function solveLsun(target, lo, hi) {
  const f = d => ((orbit(d).lsun - target) % 360 + 540) % 360 - 180;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export const D_MAR = solveLsun(0, 60, 100), D_JUN = solveLsun(90, 150, 200), D_SEP = solveLsun(180, 245, 285), D_DEC = solveLsun(270, 335, 375);
export const D_APH = D_PERI + YEAR / 2;
const D_EQ = D_MAR - 0.1;                                            // shown as 3월 20일 (2026 KST equinox: 20 Mar 23:46)
/** the 24 solar terms (절기): Sun's ecliptic longitude 15k → day of year */
export const TERMS = Array.from({length: 24}, (_, k) => {
  const lam = 15 * k, e = D_MAR + lam / 360 * YEAR; let d = solveLsun(lam, e - 12, e + 12); d = ((d % YEAR) + YEAR) % YEAR; return {lam, d};
}).sort((a, b) => a.d - b.d);
export const H_JUN = noonAlt(D_JUN), H_DEC = noonAlt(D_DEC), H_MAR = noonAlt(D_MAR);
export const Q_JUN = insol(D_JUN), Q_DEC = insol(D_DEC);
const STATS = (() => { let q = 0, k = 0, n = 0; for (let d = 0; d < 365; d += 0.5) { q += insol(d); const o = orbit(d); k += 1 / (o.rau * o.rau); n++; } return {qMean: q / n, invR2: k / n}; })();
export const Q_MEAN = STATS.qMean;
/** what Seoul would get if only the distance changed through the year (annual-mean insolation × 1/r² factor) */
export const qDist = d => { const o = orbit(d); return Q_MEAN / (o.rau * o.rau) / STATS.invR2; };
export const DIST_EFFECT = (R_APH / R_PERI) ** 2;                    // 1.069 → "약 7%"
// Seoul temperature model (KMA 1991–2020 normals: Jan −1.9 °C, Aug 26.1 °C)
export const T_MIN = -1.9, T_MAX = 26.1, D_TMIN = 19.5, D_TMAX = 216.5;
const T_UP = D_TMAX - D_TMIN, T_DN = YEAR - T_UP, T_MID = (T_MAX + T_MIN) / 2, T_AMP = (T_MAX - T_MIN) / 2;
const yT = d => (((d - D_TMIN) % YEAR) + YEAR) % YEAR;
export function temp(d) { const y = yT(d); return y < T_UP ? T_MID - T_AMP * Math.cos(Math.PI * y / T_UP) : T_MID + T_AMP * Math.cos(Math.PI * (y - T_UP) / T_DN); }
export function tempRate(d) { const y = yT(d); return y < T_UP ? T_AMP * Math.PI / T_UP * Math.sin(Math.PI * y / T_UP) : -T_AMP * Math.PI / T_DN * Math.sin(Math.PI * (y - T_UP) / T_DN); }
const C_STORE = 400;
export const heatIn = d => insol(d), heatOut = d => insol(d) - C_STORE * tempRate(d);
// sound mappings (one per quantity, kept for the whole episode)
export const altPitch = h => 220 * 2 ** ((h - H_DEC) / (H_JUN - H_DEC));            // 29° → 220 Hz, 76° → 440 Hz
export const tempPitch = T => 196 * 2 ** ((T - T_MIN) / (T_MAX - T_MIN));            // −1.9 °C → 196 Hz, 26.1 °C → 392 Hz
// calendar
const wrapDay = d => (((Math.floor(d) % 365) + 365) % 365);
const monthOf = x => { let m = 11; while (MONTH0[m] > x) m--; return m; };
export function dateLabel(d) { const x = wrapDay(d), m = monthOf(x); return `${m + 1}월 ${x - MONTH0[m] + 1}일`; }
const monthIndex = d => 12 * Math.floor(d / 365) + monthOf(wrapDay(d));
const fmtDist = r => `1억 ${Math.round(r * 100) - 10000}만 km`;
const fmtH = x => `${x.toFixed(1)}시간`;

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  near: W('s02', '태양에'), believe: W('s02', '생각하지만,'), nearest: W('s02', '가장'), winter: W('s02', '한겨울인'),
  setsu: W('s03', '절은'), bamboo: W('s03', '대나무'), node: W('s03', '마디를'), year: W('s03', '해를'), cut: W('s03', '끊어'), divide: W('s03', '나눈다는'),
  season: W('s04', '시즌은'), seed: W('s04', '씨'), latin: W('s04', '라틴어에서'), haji: W('s04', '하지를'), solstice: W('s04', '솔스티스는'),
  sunW: W('s04', '해가'), stopW: W('s04', '멈춰'), meaning: W('s04', '뜻입니다.'),
  stop: W('s05', '멈추고'), turn: W('s05', '되돌아서는'),
  angbu: W('s06', '앙부일구에는'), shadowW: W('s06', '그림자'), read: W('s06', '절기를'), lines13: W('s06', '열세'), drawn: W('s06', '그어져'),
  dist: W('s07', '거리가'), notW: W('s07', '아니라,'), tilted: W('s07', '기울어진'), axisW: W('s07', '자전축'),
  axisSame: W('s08', '축은'), sameDir: W('s08', '같은'), june: W('s08', '유월에는'), dec: W('s08', '십이월에는'),
  seoul: W('s09', '서울의'), deg76: W('s09', '칠십육도'), winterW: W('s09', '동지에는'), deg29: W('s09', '이십구도까지'),
  lowSun: W('s10', '해가'), same: W('s10', '같은'), slant: W('s10', '비스듬히'), twice: W('s10', '두 배'), less: W('s10', '덜'),
  shadowS: W('s11', '그림자는'), seven: W('s11', '일곱'),
  tiltN: W('s12', '북반구가'), lean: W('s12', '기울면,'), day: W('s12', '하루'), longer: W('s12', '길어집니다.'),
  solsJ: W('s13', '하지'), solsD: W('s13', '동지'), five: W('s13', '다섯'),
  overlap: W('s14', '겹쳐,'), hajiE: W('s14', '하지가'), dongE: W('s14', '동지의'), three: W('s14', '세 배'),
  distE: W('s15', '거리는'), pct3: W('s15', '삼퍼센트'), pct7: W('s15', '칠퍼센트'),
  sunPeak: W('s16', '하지는'), hot: W('s16', '더운'), aug: W('s16', '팔월입니다.'),
  store: W('s17', '머금었다가'), slowly: W('s17', '천천히'), follow: W('s17', '기온은'), lagW: W('s17', '달 반'),
  southW: W('s18', '남반구는'), seasonsOpp: W('s18', '계절도'), aus: W('s18', '호주에서는'), xmas: W('s18', '크리스마스가'), midsummer: W('s18', '한여름'),
  ifDist: W('s19', '거리가'), whole: W('s19', '지구'), nh: W('s19', '북반구와'), sh: W('s19', '남반구는'), opposite: W('s19', '반대'),
  quote: W('s20', '계절은'), alt: W('s20', '해의'), len: W('s20', '낮의'), together: W('s20', '함께'),
};

// ---- schedules ----
function rampEase(q, r = 0.15) { q = clamp(q); const v = 1 / (1 - r); if (q < r) return v * q * q / (2 * r); if (q > 1 - r) return 1 - v * (1 - q) ** 2 / (2 * r); return v * (q - r / 2); }
const EASE = {io: easeInOut, o: easeOut, i: easeIn, lin: q => clamp(q), ramp: rampEase};
/** keyed schedule K = [[t, v, ease, flag?], …]: `ease` shapes the segment that ENDS at that key; 'jump' = step at that key */
function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) {
      const [t1, v1, e] = K[i];
      if (t < t1) { const [t0, v0] = K[i - 1]; if (e === 'jump') return v0; return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / (t1 - t0)); }
    }
    return K[K.length - 1][1];
  };
}
/** the date schedule (one list for the whole episode; 'jump' keys only where nothing date-dependent is visible) */
export function dateKeys(tl) {
  const at = r => tl.at(r), sc = id => tl.scene(id), K = [], k = (t, d, e = 'io', f) => K.push([t, d, e, f]);
  // hook: spring → aphelion on "생각하지만," → perihelion (한겨울) on "한겨울인"
  k(0, 112); k(at(A.believe) - 0.25, D_APH); k(at(A.nearest) - 1.2, D_APH, 'lin'); k(at(A.winter) - 0.05, D_PERI + 365);
  // origin s05: rise, stand still on "멈추고", turn back on "되돌아서는"; s06: 하지선 → 동지선 (solar-term ticks)
  k(sc('origin').start, 110, 'jump'); k(at('s05') - 0.1, 110, 'lin'); k(at(A.stop) + 0.05, D_JUN, 'o'); k(at(A.turn) - 0.05, D_JUN, 'lin'); k(at('s05:end') - 0.05, 205, 'i');
  k(at('s05:end') + 0.55, D_JUN, 'jump');                     // the graph has faded out, the sundial is not visible yet
  k(at(A.shadowW) - 0.1, D_JUN, 'lin'); k(at(A.drawn) + 0.6, D_DEC, 'io', 'terms');
  // essence: one full orbit, back to June on "유월에는"
  k(sc('essence').start, D_JUN, 'jump'); k(at(A.axisSame), D_JUN, 'lin'); k(at(A.june) - 0.1, D_JUN + 365);
  // angle: equinox → 하지 on "칠십육도" → 동지 on "이십구도"
  k(sc('angle').start, D_EQ, 'jump'); k(at(A.seoul) - 0.05, D_EQ, 'lin'); k(at(A.deg76) + 0.05, D_JUN); k(at(A.winterW) - 0.1, D_JUN, 'lin'); k(at(A.deg29) + 0.15, D_DEC);
  // daylength: equinox → 하지 while "북반구가 해 쪽으로 기울면" → 동지 on "동지"
  k(sc('daylength').start, D_EQ, 'jump'); k(at(A.tiltN) - 0.3, D_EQ, 'lin'); k(at(A.lean) + 0.1, D_JUN); k(at('s13') - 0.1, D_JUN, 'lin'); k(at(A.solsD), D_DEC);
  // energy: cursor sweeps the year twice (insolation, then distance)
  k(sc('energy').start, 0, 'jump'); k(at('s14') - 0.1, 0, 'lin'); k(at(A.hajiE) - 0.2, 365); k(at('s15'), 365, 'lin'); k(at(A.pct3) + 1.6, 730);
  // lag: 하지 → 8월 5일 (max temperature) → late October
  k(sc('lag').start, D_JUN, 'jump'); k(at('s17'), D_JUN, 'lin'); k(at(A.slowly) + 0.4, D_TMAX); k(at(A.slowly) + 0.9, D_TMAX, 'lin'); k(at(A.lagW) + 0.9, 300);
  // south: 12월 22일 → 25일; myth: hold; close: one more year
  k(sc('south').start, D_DEC, 'jump'); k(at('s18'), D_DEC, 'lin'); k(at(A.xmas), D_DEC + 3);
  k(sc('close').start, D_EQ, 'jump'); k(at('s20') + 0.1, D_EQ, 'lin'); k(at('s20:end') + 0.3, D_EQ + 365);
  return K;
}
/** Seoul local solar time (h) for the daylength spins: one full day per spin, constant rate in the middle */
function tauKeys(tl) {
  const at = r => tl.at(r), s0 = tl.scene('daylength').start, j0 = at(A.day) - 0.1, d0 = at(A.solsD) + 0.1;
  return [[s0, 0], [j0, 0, 'lin'], [j0 + 3.0, 24, 'ramp'], [d0, 24, 'lin'], [d0 + 3.0, 48, 'ramp']];
}
const ABL_DECL = Array.from({length: 13}, (_, k) => Math.asin(Math.sin(EPS * D2R) * Math.sin((15 * k - 90) * D2R)) / D2R);   // 앙부일구 lines: 0 = 동지선 … 12 = 하지선

const MODELS = new WeakMap();
/** everything time-dependent that picture and sound share */
export function model(tl) {
  let m = MODELS.get(tl); if (m) return m;
  const keys = dateKeys(tl), date = keyed(keys), tk = tauKeys(tl), tau = keyed(tk);
  const ticks = [], terms = [];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1], [t1, v1, e, flag] = keys[i];
    if (e === 'jump' || v0 === v1) continue;
    if (flag === 'terms') {                                     // solar-term lines crossed by the shadow tip
      const done = new Set(); let prev = decl(date(t0));
      for (let tt = t0; tt <= t1 + 0.02; tt += 0.004) {
        const cur = decl(date(tt));
        ABL_DECL.forEach((dk, k) => { if (!done.has(k) && (prev - dk) * (cur - dk) <= 1e-6) { done.add(k); terms.push({t: tt, k, d: date(tt)}); } });
        prev = cur;
      }
      continue;
    }
    let prev = monthIndex(v0);
    for (let tt = t0 + 0.004; tt <= t1 + 1e-9; tt += 0.004) { const dv = date(tt), mi = monthIndex(dv); if (mi !== prev) { ticks.push({t: tt, d: dv}); prev = mi; } }
  }
  terms.sort((a, b) => a.t - b.t);
  const spins = [[tk[1][0], tk[2][0], D_JUN], [tk[3][0], tk[4][0], D_DEC]];
  m = {keys, date, tau, ticks, terms, spins};
  MODELS.set(tl, m);
  return m;
}

// =====================================================================================================
// Globe engine — orthographic view, exact limb clipping (copied from episodes/global-winds, + screen roll)
// =====================================================================================================
const E3 = (lat, lon) => { const a = lat * D2R, b = lon * D2R, ca = Math.cos(a); return [ca * Math.sin(b), Math.sin(a), ca * Math.cos(b)]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function makeView(lay, lam, tilt = 0, roll = 0) {
  return {...lay, lam, cl: Math.cos(lam * D2R), sl: Math.sin(lam * D2R), ct: Math.cos(tilt * D2R), st: Math.sin(tilt * D2R), cr: Math.cos(roll * D2R), sr: Math.sin(roll * D2R), tilt, roll};
}
const toView = (V, x, y, z) => {
  const x1 = x * V.cl - z * V.sl, z1 = x * V.sl + z * V.cl, b = y * V.ct - z1 * V.st, c = y * V.st + z1 * V.ct;
  return [x1 * V.cr - b * V.sr, x1 * V.sr + b * V.cr, c];
};
/** inverse of toView without the spin (view coords → pre-spin Earth frame) */
const fromView = (V, [a, b, c]) => { const a1 = a * V.cr + b * V.sr, b1 = -a * V.sr + b * V.cr; return [a1, b1 * V.ct + c * V.st, -b1 * V.st + c * V.ct]; };
/** screen point; back-hemisphere points are mirrored outside the disc (radius 2R − r) so clipping cuts at the limb */
function gmap(V, v) {
  const [a, b, c] = toView(V, v[0], v[1], v[2]);
  if (c >= 0) return [V.cx + V.R * a, V.cy - V.R * b, c];
  const r = Math.hypot(a, b) || 1e-9, rho = 2 - r;
  return [V.cx + V.R * rho * a / r, V.cy - V.R * rho * b / r, c];
}
const proj = (V, lat, lon) => gmap(V, E3(lat, lon));
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
// ---- land (Natural Earth 1:110m, public domain; copy of episodes/global-winds/land.json) ----
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
    let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
    for (const [lo, la] of r) { lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); la0 = Math.min(la0, la); la1 = Math.max(la1, la); }
    return {raw: r, v: ll.map(([la, lo]) => E3(la, lo)), box: [lo0, lo1, la0, la1]};
  });
})();
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
const PAL = {ocean0: '#2B6A80', ocean1: '#0C2F40', ocean2: '#06202C', land: '#5A6A55', landEdge: '#93A68C', grat: '#9EC6D2', rim: '#BFE4F2',
  sun: '#FFD889', day: '#F5C66B', night: '#7F9FD6', mark: '#FFE2C4', warm: '#F2A65A', cool: '#8EC5F0', axis: '#ECE4D6', orbit: '#8AA0A6',
  q: '#F5C66B', temp: '#FF8A5C', dist: '#8EC5F0', ground: '#33402F', groundTop: '#7A8A68', stick: '#E8D9BC'};
function graticule(c, V, a) {
  c.lineWidth = 1; c.strokeStyle = rgba(PAL.grat, a);
  for (const la of [-60, -30, 30, 60]) { c.beginPath(); tracePts(c, V, Array.from({length: 121}, (_, i) => proj(V, la, i * 3)), true); c.stroke(); }
  for (let lo = 0; lo < 360; lo += 30) { c.beginPath(); tracePts(c, V, Array.from({length: 61}, (_, i) => proj(V, -90 + i * 3, lo)), false); c.stroke(); }
}
/** a view whose axis points along n and whose sun is along s (both unit vectors in view coords); tau = Seoul local solar time */
function earthView(lay, n, s, tau) {
  const tilt = Math.asin(clamp(n[2], -1, 1)) / D2R, roll = Math.atan2(-n[0], n[1]) / D2R;
  const pre = fromView(makeView(lay, 0, tilt, roll), s), ls = Math.atan2(pre[0], pre[2]) / D2R;
  const V = makeView(lay, SEOUL.lon - 15 * (tau - 12) - ls, tilt, roll);
  V.sun = s; V.axis = n; return V;
}
/** the night hemisphere on the visible disc (true terminator) */
function nightShade(c, V, a = 0.6) {
  const s = V.sun, {cx, cy, R} = V, rho = Math.hypot(s[0], s[1]), col = '#000A12';
  if (rho < 1e-4) { if (s[2] < 0) { c.fillStyle = rgba(col, a); c.fillRect(cx - R, cy - R, 2 * R, 2 * R); } return; }
  const th = Math.atan2(s[1], s[0]), u = [-Math.sin(th), Math.cos(th)], w = [-s[2] * Math.cos(th), -s[2] * Math.sin(th)], pts = [];
  for (let i = 0; i <= 64; i++) { const q = Math.PI * i / 64; pts.push([cx + R * (Math.cos(q) * u[0] + Math.sin(q) * w[0]), cy - R * (Math.cos(q) * u[1] + Math.sin(q) * w[1])]); }
  const term = pts.slice();
  for (let i = 0; i <= 64; i++) { const ph = th + 1.5 * Math.PI - Math.PI * i / 64; pts.push([cx + R * Math.cos(ph), cy - R * Math.sin(ph)]); }
  poly(c, pts, rgba(col, a));
  line(c, term, rgba(col, a * 0.3), Math.max(2, R * 0.07));
}
/** o: {land, grat, lats: [lat…] faint circles, night, a} */
function drawEarth(stage, V, o = {}) {
  const {ctx: c} = stage, {cx, cy, R} = V, s = V.sun;
  glow(c, cx, cy, R * 1.16, '#7FC8E6', 0.05);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  const sp = [cx + R * s[0], cy - R * s[1]], g = c.createRadialGradient(sp[0], sp[1], R * 0.05, cx, cy, R * 1.1);
  g.addColorStop(0, PAL.ocean0); g.addColorStop(0.55, PAL.ocean1); g.addColorStop(1, PAL.ocean2);
  c.fillStyle = g; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  if (o.grat) graticule(c, V, o.grat);
  if (o.land !== false && R >= 16) {
    landPath(c, V); c.fillStyle = PAL.land; c.fill('evenodd');
    if (R >= 40) { c.strokeStyle = rgba(PAL.landEdge, 0.5); c.lineWidth = 1; c.lineJoin = 'round'; c.stroke(); }
  }
  c.lineWidth = R > 120 ? 1.5 : 1; c.strokeStyle = rgba(PAL.grat, R > 120 ? 0.45 : 0.35);
  c.beginPath(); tracePts(c, V, Array.from({length: 121}, (_, i) => proj(V, 0, i * 3)), true); c.stroke();
  for (const la of o.lats || []) { c.strokeStyle = rgba(PAL.grat, 0.3); c.beginPath(); tracePts(c, V, Array.from({length: 121}, (_, i) => proj(V, la, i * 3)), true); c.stroke(); }
  nightShade(c, V, o.night ?? 0.78);
  c.restore();
  ring(c, cx, cy, R, rgba(PAL.rim, 0.35), R > 100 ? 1.6 : 1.2);
}
/** axis ends beyond the poles: the end pointing away from the camera is drawn before the globe (the globe hides it) */
function axisEnds(stage, V, which, o = {}) {
  const n = V.axis, northFront = n[2] >= 0, len = o.len ?? 1.4, col = o.col ?? PAL.axis, w = o.w ?? Math.max(2, V.R / 45);
  for (const sg of [1, -1]) {
    if ((which === 'front') !== ((sg > 0) === northFront)) continue;
    const a = [V.cx + V.R * sg * n[0], V.cy - V.R * sg * n[1]], b = [V.cx + V.R * len * sg * n[0], V.cy - V.R * len * sg * n[1]];
    if (sg > 0) arrow(stage.ctx, a, b, col, w, {head: Math.max(10, w * 4.5)}); else line(stage.ctx, [a, b], col, w);
  }
}
function earthWithAxis(stage, V, o = {}) {
  axisEnds(stage, V, 'back', o);
  drawEarth(stage, V, o);
  if (o.through !== false) line(stage.ctx, [[V.cx - V.R * V.axis[0], V.cy + V.R * V.axis[1]], [V.cx + V.R * V.axis[0], V.cy - V.R * V.axis[1]]], rgba(PAL.axis, 0.32), Math.max(1.2, V.R / 70), {dash: [5, 5]});
  axisEnds(stage, V, 'front', o);
}
const axisTip = (V, len = 1.4, sg = 1) => [V.cx + V.R * len * sg * V.axis[0], V.cy - V.R * len * sg * V.axis[1]];
/** latitude circle split into day (warm) and night (blue); hidden (far side) parts dashed and faint */
function latDayNight(c, V, lat, o = {}) {
  const s = V.sun, N = 240, pts = [], w = o.w ?? 4, a = o.a ?? 1;
  for (let i = 0; i <= N; i++) { const v = toView(V, ...E3(lat, i * 360 / N)); pts.push([V.cx + V.R * v[0], V.cy - V.R * v[1], v[2] >= 0, dot(v, s) >= 0]); }
  for (const pass of [false, true]) {
    let run = [pts[0]];
    const flush = () => {
      if (run.length < 2 || run[0][2] !== pass) return;
      const day = run[0][3], col = day ? PAL.day : PAL.night, xy = run.map(p => [p[0], p[1]]);
      if (pass) { line(c, xy, rgba('#000', 0.45 * a), w + 3); line(c, xy, rgba(col, a), day ? w : w - 1); }
      else line(c, xy, rgba(col, (day ? 0.45 : 0.35) * a), 2, {dash: [6, 6]});
    };
    for (let i = 1; i <= N; i++) { const p = pts[i], q = run[run.length - 1]; run.push(p); if (p[2] !== q[2] || p[3] !== q[3]) { run.pop(); run.push(p); flush(); run = [p]; } }
    flush();
  }
}
function placeDot(stage, V, lat, lon, col, a = 1, r = 7) {
  const v = toView(V, ...E3(lat, lon)), x = V.cx + V.R * v[0], y = V.cy - V.R * v[1], front = v[2] >= 0;
  withAlpha(stage.ctx, a * (front ? 1 : 0.35), () => { circle(stage.ctx, x, y, r + 3, rgba('#06222E', 0.8)); circle(stage.ctx, x, y, r, col); ring(stage.ctx, x, y, r + 6, rgba(col, 0.6), 2); });
  return [x, y, front];
}

// =====================================================================================================
// Orbit view (heliocentric ecliptic frame: X → vernal equinox, Z → ecliptic north; screen right = +Y,
// the near side (+X, September) is drawn lower; seen from the north the Earth goes round counter-clockwise)
// =====================================================================================================
function orbitCam(o) {
  const sa = Math.sin(o.alpha * D2R), ca = Math.cos(o.alpha * D2R), k = o.a / A_ORB;
  const P = (X, Y, Z = 0) => [o.cx + k * Y, o.cy + k * (sa * X - ca * Z), ca * X + sa * Z];
  const vec = v => [v[1], -sa * v[0] + ca * v[2], ca * v[0] + sa * v[2]];
  const at = d => { const e = orbit(d), L = e.L * D2R; return P(e.r * Math.cos(L), e.r * Math.sin(L)); };
  return {...o, sa, ca, k, P, vec, at};
}
function drawOrbit(stage, cam, o = {}) {
  const pts = [];
  for (let i = 0; i <= 180; i++) { const L = i * 2, nu = (L - LON_PERI) * D2R, r = A_ORB * (1 - ECC * ECC) / (1 + ECC * Math.cos(nu)); const q = cam.P(r * Math.cos(L * D2R), r * Math.sin(L * D2R)); pts.push([q[0], q[1]]); }
  line(stage.ctx, pts, rgba(PAL.orbit, o.a ?? 0.5), o.w ?? 2);
}
function drawSun(stage, x, y, r, a = 1) {
  const {ctx: c} = stage;
  withAlpha(c, a, () => {
    glow(c, x, y, r * 4.2, PAL.sun, 0.22); glow(c, x, y, r * 2.0, PAL.sun, 0.35);
    const g = c.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
    g.addColorStop(0, '#FFF8E6'); g.addColorStop(0.7, '#FFD88A'); g.addColorStop(1, '#F7B955');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  });
}
/** the Earth at day d in an orbit view: its globe view (axis, sun direction, Seoul at local time tau) */
function orbitEarth(cam, d, R, tau) {
  const e = orbit(d), L = e.L * D2R, p = cam.P(e.r * Math.cos(L), e.r * Math.sin(L));
  const n = cam.vec([0, Math.sin(EPS * D2R), Math.cos(EPS * D2R)]), s = cam.vec([-Math.cos(L), -Math.sin(L), 0]);
  return {V: earthView({cx: p[0], cy: p[1], R}, n, s, tau), e, p};
}
/** camera beside the Earth: psi rotates from "perpendicular to the Sun line" toward the Sun, beta = height above the ecliptic */
function sideCam(d, psi = 0, beta = 14) {
  const ls = orbit(d).lsun * D2R, s = [Math.cos(ls), Math.sin(ls), 0], v = [Math.sin(ls), -Math.cos(ls), 0], Z = [0, 0, 1];
  const cp = Math.cos(psi * D2R), sp = Math.sin(psi * D2R), cb = Math.cos(beta * D2R), sb = Math.sin(beta * D2R);
  const z = [cb * (-cp * v[0] + sp * s[0]), cb * (-cp * v[1] + sp * s[1]), sb], x = unit(cross(Z, z)), y = cross(z, x);
  const V3 = w => [dot(w, x), dot(w, y), dot(w, z)];
  return {n: V3([0, Math.sin(EPS * D2R), Math.cos(EPS * D2R)]), s: V3(s)};
}

// =====================================================================================================
// UI helpers
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
const endFade = (t, ctx, d = 0.5) => fadeOut(t, ctx.scene.end - d - 0.05, d);
const evT = (ctx, id, fallback) => (ctx.events.has(id) ? ctx.events.get(id).time : ctx.tl.at(fallback));
const M = ctx => model(ctx.tl);
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
/** label/value cell; o: {key, val, col, hi (0..1 highlight), valSize} */
function cell(stage, x, y, w, h, o) {
  const {ctx: c} = stage, T = stage.theme;
  if (o.hi > 0) rect(c, x + 3, y + 3, w - 6, h - 6, 8, rgba(T.light, 0.08 * o.hi), rgba(T.light, 0.7 * o.hi), 2);
  stage.text(o.key, x + w / 2, y + 22, {size: 24, color: T.muted, align: 'center'});
  stage.text(o.val, x + w / 2, y + h - 26, {role: 'display', size: o.valSize ?? 32, weight: 700, color: o.col || T.ink, align: 'center'});
}
function readoutRow(stage, y, h, cells, a = 1) {
  const {ctx: c} = stage, T = stage.theme, w = 800 / cells.length;
  withAlpha(c, a, () => {
    panel(c, T, 140, y, 800, h, 0.92);
    cells.forEach((o, i) => { if (i) line(c, [[140 + i * w, y + 12], [140 + i * w, y + h - 12]], rgba(T.border, 1), 1.2); cell(stage, 140 + i * w, y, w, h, o); });
  });
}
function propRow(stage, y, lead, key, col, a, keyA = 1) {
  const w1 = stage.measure(lead, {size: 30, weight: 500}), w2 = stage.measure(key, {role: 'display', size: 44, weight: 700}), gap = 16, x0 = 540 - (w1 + gap + w2) / 2;
  stage.text(lead, x0, y, {size: 30, weight: 500, color: stage.theme.ink, alpha: a});
  stage.text(key, x0 + w1 + gap, y, {role: 'display', size: 44, weight: 700, color: col, alpha: a * keyA});
  return [x0, x0 + w1];
}
function crossOut(c, x0, x1, y, q, col = '#FF8A5C') { if (q > 0) line(c, [[x0 - 6, y + 2], [lerp(x0 - 6, x1 + 6, easeOut(q)), y + 2]], rgba(col, 0.9), 4); }
function sunIcon(stage, x, y, r, a = 1) { drawSun(stage, x, y, r, a); }

// =====================================================================================================
// Header (centred)
// =====================================================================================================
function head(stage, kicker, title, aK, aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 940}));
}
export const titles = {
  hook: ['오늘의 주제 · 계절', '계절은 왜 생길까'],
  origin: ['기원 · 이름의 뿌리', '季節 — 한 해의 마디'],
  essence: ['본질 · 제1원리', '기울어진 자전축'],
  angle: ['메커니즘 ① 해의 높이', '기울기가 해의 높이를 바꾼다'],
  daylength: ['메커니즘 ② 낮의 길이', '기울기가 낮의 길이를 바꾼다'],
  energy: ['메커니즘 ③ 합친 햇빛', '높은 해 × 긴 낮'],
  lag: ['현상 · 계절의 지연', '가장 더운 달은 8월'],
  south: ['사례 · 남반구', '크리스마스는 한여름'],
  myth: ['오해 바로잡기', '가까워서 여름일까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s05') - 0.6, '기원 · 이름의 뿌리', '해가 멈춰 서는 날'], [at('s05:end') + 0.4, '기원 · 조선의 해시계', '그림자로 읽는 절기']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}

let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'month_ticks'), m = M(ctx);
  const ok = e?.model && e.model.n === m.keys.length && e.model.ticks === m.ticks.length && e.model.terms === m.terms.length && Math.abs(e.model.t_last - m.keys[m.keys.length - 1][0]) < 1e-3;
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/seasons/scenes.mjs --emit-sound');
}

// =====================================================================================================
// Scene parts
// =====================================================================================================
// ---- origin: bamboo + year bar ----
const BX = d => lerp(160, 920, d / 365);
function bambooYear(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), y = 700, h = 30;
  const grow = easeInOut((t - at(A.bamboo) + 0.15) / 1.3), yearA = fadeIn(t, at(A.year) - 0.2, 0.5), cutT = at(A.cut) - 0.1, namesA = fadeIn(t, at(A.divide) - 0.1, 0.5);
  withAlpha(c, a, () => {
    if (grow > 0) {
      const xe = lerp(160, 920, grow);
      const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, '#A9BC86'); g.addColorStop(0.4, '#7C9658'); g.addColorStop(1, '#3E5230');
      rect(c, 160, y - h / 2, xe - 160, h, 6, g);
      line(c, [[164, y - h / 2 + 5], [xe - 4, y - h / 2 + 5]], rgba('#E4EDCF', 0.35), 2);
      TERMS.forEach((tm, i) => {
        const x = BX(tm.d); if (x > xe - 2) return;
        const fl = Math.max(0, 1 - Math.abs(t - (cutT + i * 0.045)) / 0.25) * (t > cutT - 0.3 ? 1 : 0);
        rect(c, x - 3.5, y - h / 2 - 3, 7, h + 6, 3, mix('#C8D5A0', '#FFF4D0', fl));
        if (fl > 0) glow(c, x, y, 26, '#FFF0C0', 0.5 * fl);
      });
    }
    withAlpha(c, yearA, () => {
      const yb = y + 46;
      line(c, [[160, yb], [920, yb]], rgba(T.muted, 0.8), 1.5);
      for (let mth = 0; mth <= 12; mth++) line(c, [[BX(MONTH0[mth]), yb - 6], [BX(MONTH0[mth]), yb + 6]], rgba(T.muted, 0.8), 1.4);
      for (let mth = 0; mth < 12; mth++) stage.text(`${mth + 1}월`, BX((MONTH0[mth] + MONTH0[mth + 1]) / 2), yb + 26, {size: 24, color: T.muted, align: 'center'});
    });
    withAlpha(c, namesA, () => {
      for (const [lam, name] of [[0, '춘분'], [90, '하지'], [180, '추분'], [270, '동지']]) {
        const x = BX(TERMS.find(q => q.lam === lam).d);
        line(c, [[x, y - h / 2 - 8], [x, y - h / 2 - 22]], rgba(T.light, 0.8), 1.5);
        stage.text(name, x, y - h / 2 - 40, {size: 24, weight: 700, color: T.light, align: 'center'});
      }
      stage.text('24절기 — 한 해를 24 마디로 나눔', 540, y + 122, {size: 28, weight: 700, color: T.ink, align: 'center'});
    });
  });
}
function glyphCard(stage, x, y, glyph, reading, on, a) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    rect(c, x - 115, y, 230, 220, 12, rgba(T.plate, 0.95), on > 0.5 ? T.light : rgba(T.border, 1), on > 0.5 ? 2.5 : 1.5);
    stage.text(glyph, x, y + 96, {size: 116, weight: 700, color: mix(T.muted, T.ink, 0.35 + 0.65 * on), align: 'center'});
    stage.text(reading, x, y + 188, {size: 28, weight: 700, color: on > 0.5 ? T.light : T.muted, align: 'center'});
  });
}
function wordCard(stage, t, x, head, rows, headT, a) {
  const {ctx: c} = stage, T = stage.theme, on = fadeIn(t, headT - 0.1, 0.4);
  withAlpha(c, a * fadeIn(t, headT - 0.6, 0.5), () => {
    rect(c, x - 185, 870, 370, 290, 12, rgba(T.plate, 0.92), on > 0.5 ? rgba(T.light, 0.8) : rgba(T.border, 1), on > 0.5 ? 2 : 1.5);
    stage.text(head, x, 916, {role: 'display', size: 44, weight: 700, color: mix(T.muted, T.ink, on), align: 'center'});
    rows.forEach(([tt, s, col, size], i) => stage.text(s, x, 976 + i * 44, {size, weight: size > 24 ? 700 : 500, color: col, align: 'center', alpha: fadeIn(t, tt - 0.1, 0.4)}));
  });
}
// ---- origin s05: noon altitude over the year ----
const AG = {x0: 240, x1: 900, y0: 940, y1: 420};
const AX = d => lerp(AG.x0, AG.x1, (((d % 365) + 365) % 365) / 365), AY = h => lerp(AG.y0, AG.y1, h / 90);
function altGraph(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), d = m.date(t), h = noonAlt(d);
  const stopA = fadeIn(t, evT(ctx, 'lab_stop', A.stop) - 0.1, 0.4), turnA = fadeIn(t, evT(ctx, 'lab_turn', A.turn) - 0.1, 0.4);
  withAlpha(c, a, () => {
    panel(c, T, 140, 320, 800, 690, 0.92);
    stage.text('서울의 한낮 해 높이 · 1년', 158, 348, {size: 26, weight: 700, color: T.ink});
    stage.text(`${dateLabel(d)} · ${Math.round(h)}°`, 922, 348, {role: 'display', size: 30, weight: 700, color: PAL.sun, align: 'right'});
    for (const v of [0, 30, 60, 90]) { line(c, [[AG.x0, AY(v)], [AG.x1, AY(v)]], rgba(T.border, v ? 0.9 : 1.4), 1); stage.text(`${v}°`, AG.x0 - 12, AY(v), {size: 24, color: T.muted, align: 'right'}); }
    for (let mth = 0; mth < 12; mth += 1) { if (mth % 2) continue; stage.text(`${mth + 1}월`, AX((MONTH0[mth] + MONTH0[mth + 1]) / 2), AG.y0 + 30, {size: 24, color: T.muted, align: 'center'}); }
    const all = []; for (let x = 0; x <= 365; x += 2) all.push([AX(x === 365 ? 364.999 : x), AY(noonAlt(x))]);
    line(c, all, rgba(PAL.sun, 0.28), 2.5);
    // the traced part (from the start of the sweep to now)
    const d0 = 110, tr = []; for (let x = d0; x <= d; x += 1.5) tr.push([AX(x), AY(noonAlt(x))]); tr.push([AX(d), AY(h)]);
    if (tr.length > 1 && t > at('s05') - 0.2) line(c, tr, PAL.sun, 4);
    // the stand-still bracket at the solstice
    withAlpha(c, stopA, () => {
      const xa = AX(D_JUN - 20), xb = AX(D_JUN + 20), yb = AY(H_JUN) - 34;
      line(c, [[xa, yb + 8], [xa, yb], [xb, yb], [xb, yb + 8]], rgba(T.light, 0.9), 2);
      stage.text('하지 — 해가 멈춰 선 날', AX(D_JUN), yb - 26, {size: 26, weight: 700, color: T.light, align: 'center'});
    });
    withAlpha(c, turnA, () => {
      const pts = []; for (let x = D_JUN + 8; x <= D_JUN + 58; x += 2) pts.push([AX(x) + 18, AY(noonAlt(x)) + 30]);
      line(c, pts.slice(0, -2), rgba(T.light, 0.85), 2.4); arrow(c, pts[pts.length - 4], pts[pts.length - 1], T.light, 2.4, {head: 12});
      stage.text('되돌아섬', AX(D_JUN + 46) + 40, AY(noonAlt(D_JUN + 46)) + 66, {size: 26, weight: 700, color: T.light, align: 'left'});
    });
    // marker + vertical motion arrow (length ∝ rate of change of the altitude)
    const x = AX(d), y = AY(h), rate = (noonAlt(m.date(t + 0.05)) - h) / 0.05;
    line(c, [[AG.x0, y], [x, y]], rgba(PAL.sun, 0.55), 1.5, {dash: [5, 5]});
    glow(c, x, y, 34, PAL.sun, 0.4); sunIcon(stage, x, y, 12);
    const L = clamp(Math.abs(rate) * 5, 0, 46);
    if (L > 6) arrow(c, [x + 30, y], [x + 30, y - Math.sign(rate) * L], rgba(T.light, 0.9), 3, {head: 11});
    // the same noon Sun in the southern sky (altitude h)
    panel(c, T, 140, 1030, 800, 300, 0.92);
    stage.text('남쪽 하늘의 한낮 해', 158, 1058, {size: 24, weight: 700, color: T.ink});
    const gx = 600, gy = 1292, R = 200, sx = gx - R * Math.cos(h * D2R), sy = gy - R * Math.sin(h * D2R);
    rect(c, 170, gy, 740, 8, 2, PAL.groundTop); rect(c, 170, gy + 8, 740, 20, 2, PAL.ground);
    const arcP = []; for (let a = 0; a <= 90; a += 3) arcP.push([gx - R * Math.cos(a * D2R), gy - R * Math.sin(a * D2R)]); line(c, arcP, rgba(PAL.sun, 0.25), 1.5, {dash: [4, 6]});
    line(c, [[gx, gy], [sx, sy]], rgba(PAL.sun, 0.6), 1.8, {dash: [6, 5]});
    ring(c, gx, gy, 54, PAL.sun, 2.5, Math.PI, Math.PI + h * D2R);
    stage.text(`${Math.round(h)}°`, gx - 92, gy - 30, {role: 'display', size: 28, weight: 700, color: PAL.sun, align: 'center'});
    circle(c, gx, gy, 5, T.ink);
    glow(c, sx, sy, 50, PAL.sun, 0.35); sunIcon(stage, sx, sy, 16);
    if (L > 6) arrow(c, [sx + 34, sy], [sx + 34, sy - Math.sign(rate) * L], rgba(T.light, 0.9), 3, {head: 11});
    stage.text('남', 190, gy - 22, {size: 24, color: T.muted, align: 'center'});
  });
}
// ---- origin s06: 앙부일구 (schematic). Sphere centre = gnomon tip; lines are where the tip's shadow falls ----
const AB = {cx: 540, cy: 690, R: 270, el: 56 * D2R, az: -15 * D2R};
const ABPHI = SEOUL.lat * D2R, AB_P = [0, Math.cos(ABPHI), Math.sin(ABPHI)], AB_M = [0, -Math.sin(ABPHI), Math.cos(ABPHI)];
function abP([X, Y, Z]) {
  const X1 = X * Math.cos(AB.az) - Y * Math.sin(AB.az), Y1 = X * Math.sin(AB.az) + Y * Math.cos(AB.az);
  return [AB.cx + AB.R * X1, AB.cy - AB.R * (Y1 * Math.sin(AB.el) + Z * Math.cos(AB.el))];
}
/** direction to the Sun (east, north, up) for declination dl (deg) and hour angle H (deg, + = afternoon) */
function sunENU(dl, H) { const cd = Math.cos(dl * D2R), sd = Math.sin(dl * D2R), cH = Math.cos(H * D2R), sH = Math.sin(H * D2R); return [-cd * sH, cd * cH * AB_M[1] + sd * AB_P[1], cd * cH * AB_M[2] + sd * AB_P[2]]; }
const antisolar = (dl, H) => sunENU(dl, H).map(x => -x);
function rimEllipse(c) { c.beginPath(); c.ellipse(AB.cx, AB.cy, AB.R, AB.R * Math.sin(AB.el), 0, 0, TAU); }
function angbu(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), d = m.date(t), dl = decl(d);
  const ry = AB.R * Math.sin(AB.el), BRZ = '#6B5638', BRZ2 = '#3A2D1C', SILV = '#E6E0D2';
  const lines13A = fadeIn(t, evT(ctx, 'lab_lines', A.lines13) - 0.1, 0.5), tipA = fadeIn(t, at(A.shadowW) - 0.4, 0.5);
  withAlpha(c, a, () => {
    // stand: cross base and four legs (schematic)
    const sh0 = abP([0, 0, -1.22]); c.save(); c.translate(sh0[0], sh0[1]); c.scale(1, Math.sin(AB.el)); glow(c, 0, 0, AB.R * 0.95, '#000000', 0.55); c.restore();
    const legs = [45, 135, 225, 315].map(az => { const u = Math.cos(az * D2R), v = Math.sin(az * D2R); return [abP([0.66 * u, 0.66 * v, -0.75]), abP([0.80 * u, 0.80 * v, -1.06]), abP([0.86 * u, 0.86 * v, -1.2])]; });
    for (const [p0, p1, p2] of legs) { line(c, [p0, p1, p2], BRZ2, 10); line(c, [p0, p1, p2], rgba('#9A835C', 0.45), 2.2); poly(c, [[p2[0] - 12, p2[1] + 3], [p2[0] + 12, p2[1] + 3], [p2[0] + 8, p2[1] - 4], [p2[0] - 8, p2[1] - 4]], BRZ2); }
    // outer body (front part, below the rim) and inner surface
    c.save(); c.beginPath(); c.arc(AB.cx, AB.cy, AB.R, 0, Math.PI); c.ellipse(AB.cx, AB.cy, AB.R, ry, 0, Math.PI, 0, true); c.closePath();
    const go = c.createLinearGradient(AB.cx - AB.R, 0, AB.cx + AB.R, 0); go.addColorStop(0, '#2A2015'); go.addColorStop(0.45, '#6A5434'); go.addColorStop(1, '#241B12');
    c.fillStyle = go; c.fill(); c.restore();
    c.save(); rimEllipse(c); c.clip();
    const gi = c.createLinearGradient(0, AB.cy - ry, 0, AB.cy + ry); gi.addColorStop(0, '#9C8456'); gi.addColorStop(0.55, BRZ); gi.addColorStop(1, '#4A3B26');
    c.fillStyle = gi; c.fillRect(AB.cx - AB.R, AB.cy - ry, 2 * AB.R, 2 * ry);
    // hour lines (6–18 h) and the 13 solar-term lines, silver inlay
    for (let H = -90; H <= 90; H += 15) {
      const pts = []; for (let k = 0; k <= 24; k++) { const q = antisolar(-EPS + 2 * EPS * k / 24, H); if (q[2] < -0.005) pts.push(abP(q)); }
      if (pts.length > 1) line(c, pts, rgba(SILV, H === 0 ? 0.75 : 0.32), H === 0 ? 2 : 1.2);
    }
    ABL_DECL.forEach((dk, k) => {
      const cr = m.terms.find(x => x.k === k), lit = cr ? fadeIn(t, cr.t - 0.05, 0.25) : 0, key = k === 0 || k === 6 || k === 12;
      const pts = []; for (let H = -112; H <= 112; H += 2) { const q = antisolar(dk, H); if (q[2] < -0.005 && Math.abs(H) <= 92) pts.push(abP(q)); }
      if (pts.length > 1) line(c, pts, rgba(lerp(0, 1, lit) > 0.5 ? '#FFF4DC' : SILV, (key ? 0.62 : 0.4) + 0.38 * Math.max(lit, lines13A * 0.6)), key ? 2.2 : 1.5);
    });
    // gnomon shadow on the bowl and its tip
    if (tipA > 0) withAlpha(c, tipA, () => {
      const s = sunENU(dl, 0), ps = dot(AB_P, s), sh = [];
      for (let k = 0; k <= 40; k++) { const u = 1.26 * k / 40, tt = u * ps + Math.sqrt(Math.max(0, u * u * ps * ps - u * u + 1)), q = [u * AB_P[0] - tt * s[0], u * AB_P[1] - tt * s[1], u * AB_P[2] - tt * s[2]]; if (q[2] < 0) sh.push(abP(q)); }
      if (sh.length > 1) line(c, sh, rgba('#1A140C', 0.75), 4);
    });
    c.restore();
    // rim
    c.beginPath(); c.ellipse(AB.cx, AB.cy, AB.R, ry, 0, 0, TAU); c.strokeStyle = '#B79E6E'; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.ellipse(AB.cx, AB.cy, AB.R + 5, ry + 4, 0, 0, TAU); c.strokeStyle = rgba('#2A2015', 0.9); c.lineWidth = 2; c.stroke();
    // gnomon (영침): polar rod from the sphere centre to a post on the north rim
    const g0 = abP([0, 0, 0]), g1 = abP([0, 1.26 * AB_P[1], 1.26 * AB_P[2]]), post = abP([0, 1, 0]);
    line(c, [post, g1], '#2A2015', 7); line(c, [post, g1], rgba('#C9B07E', 0.8), 2.5);
    line(c, [g0, g1], '#2A2015', 6); line(c, [g0, g1], rgba('#E8D7AE', 0.95), 2.5);
    circle(c, g0[0], g0[1], 4, '#E8D7AE');
    tag(stage, '영침 (해시계 바늘)', g1[0] + 16, g1[1] - 4, {size: 24, align: 'left', color: T.ink});
    // shadow tip marker + date
    if (tipA > 0) withAlpha(c, tipA, () => {
      const q = abP(antisolar(dl, 0));
      ring(c, q[0], q[1], 11, T.accent, 3); circle(c, q[0], q[1], 4, T.accent);
      tag(stage, `그림자 끝 · ${dateLabel(d)}`, q[0] - 22, q[1] + 2, {size: 24, align: 'right', color: T.light, border: T.accent});
    });
    // labels for the top / middle / bottom lines (right of the bowl)
    const labs = [[0, '동지선 (맨 위)'], [6, '춘·추분선'], [12, '하지선 (맨 아래)']];
    for (const [k, s] of labs) {
      const pts = []; for (let H = 0; H <= 92; H += 2) { const q = antisolar(ABL_DECL[k], H); if (q[2] < -0.005) pts.push(abP(q)); }
      const p = pts[pts.length - 1], ly = k === 0 ? p[1] - 30 : k === 6 ? p[1] + 4 : p[1] + 34;
      line(c, [p, [818, ly]], rgba(T.light, 0.55), 1.3);
      tag(stage, s, 936, ly, {size: 24, align: 'right', color: k === 0 ? PAL.cool : k === 12 ? PAL.warm : T.ink});
    }
    withAlpha(c, lines13A, () => tag(stage, '절기선 13줄 + 시각선', 150, 420, {size: 26, align: 'left', color: T.light, border: T.light}));
    // name
    stage.text('앙부일구 · 조선 세종 때', 540, 1100, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, at(A.angbu) - 0.1, 0.5)});
    stage.text('仰釜日晷 — 하늘을 우러르는 솥 모양 해시계', 540, 1152, {size: 26, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.angbu) + 0.3, 0.5)});
    withAlpha(c, fadeIn(t, at(A.read) - 0.1, 0.5), () => {
      panel(c, T, 160, 1196, 760, 112, 0.9);
      stage.text('여름: 해가 높아 그림자 끝이 아래 줄 (하지선)', 540, 1232, {size: 26, weight: 700, color: PAL.warm, align: 'center'});
      stage.text('겨울: 해가 낮아 그림자 끝이 위 줄 (동지선)', 540, 1274, {size: 26, weight: 700, color: PAL.cool, align: 'center'});
    });
  });
}

// ---- angle: tier 1 (Earth section + mini orbit), tier 2 (Seoul's noon horizon), tier 3 (readouts + year graph) ----
function sectionPanel(stage, t, d, a) {
  const {ctx: c} = stage, T = stage.theme, dl = decl(d), C = [430, 418], R = 74;
  const P = L => { const th = (180 - (L - dl)) * D2R; return [C[0] + R * Math.cos(th), C[1] - R * Math.sin(th)]; };
  withAlpha(c, a, () => {
    panel(c, T, 140, 292, 800, 228, 0.92);
    // sunlight from the left (parallel)
    for (let k = -3; k <= 3; k++) { const y = C[1] + k * 22, xs = C[0] - Math.sqrt(Math.max(0, R * R - (y - C[1]) ** 2)); arrow(c, [168, y], [xs - 3, y], rgba(PAL.sun, 0.5), 1.5, {head: 8}); }
    stage.text('햇빛', 168, 318, {size: 24, weight: 700, color: PAL.sun});
    // Earth: lit half toward the Sun
    const g = c.createLinearGradient(C[0] - R, 0, C[0] + R, 0); g.addColorStop(0, '#2E6E84'); g.addColorStop(0.5, '#174458'); g.addColorStop(0.5, '#071A24'); g.addColorStop(1, '#04121A');
    c.fillStyle = g; c.beginPath(); c.arc(C[0], C[1], R, 0, TAU); c.fill(); ring(c, C[0], C[1], R, rgba(PAL.rim, 0.4), 1.4);
    // equator and axis (its lean toward the Sun in this plane = declination)
    const eq0 = P(0), eq1 = [2 * C[0] - eq0[0], 2 * C[1] - eq0[1]]; line(c, [eq0, eq1], rgba(PAL.grat, 0.55), 1.5, {dash: [5, 4]});
    const np = P(90), sp = [2 * C[0] - np[0], 2 * C[1] - np[1]], ux = (np[0] - C[0]) / R, uy = (np[1] - C[1]) / R;
    line(c, [sp, [sp[0] - ux * 18, sp[1] - uy * 18]], PAL.axis, 2.5); line(c, [sp, np], rgba(PAL.axis, 0.35), 1.5, {dash: [4, 4]});
    const tip = [np[0] + ux * 26, np[1] + uy * 26]; arrow(c, np, tip, PAL.axis, 2.5, {head: 10});
    stage.text('자전축', tip[0] + 12, tip[1] + 2, {size: 24, color: PAL.axis});
    // Seoul, its horizon, the angle of the noon sunlight
    const S = P(SEOUL.lat), th = (180 - (SEOUL.lat - dl)) * D2R, tx = Math.sin(th), ty = Math.cos(th);   // tangent toward the equator (canvas)
    line(c, [[S[0] - tx * 40, S[1] - ty * 40], [S[0] + tx * 40, S[1] + ty * 40]], PAL.mark, 2.5);
    line(c, [[S[0] - 54, S[1]], S], PAL.sun, 2.5);
    const a0 = Math.atan2(ty, tx); ring(c, S[0], S[1], 22, PAL.sun, 2, Math.min(a0, Math.PI), Math.max(a0, Math.PI));
    circle(c, S[0], S[1], 5, PAL.mark);
    tag(stage, '서울', S[0] - 34, S[1] - 26, {size: 24, color: PAL.mark, align: 'right'});
    stage.text('지구 단면', C[0] + R + 16, 500, {size: 24, color: T.muted});
    // mini orbit (seen from above): where the Earth is; the axis always leans the same way
    const oc = [790, 414], orr = 62, e = orbit(d), L = e.L * D2R, ex = oc[0] + orr * Math.sin(L), ey = oc[1] + orr * Math.cos(L);
    stage.text('공전 위치 (위에서 봄)', oc[0], 320, {size: 24, color: T.muted, align: 'center'});
    ring(c, oc[0], oc[1], orr, rgba(PAL.orbit, 0.6), 1.5); sunIcon(stage, oc[0], oc[1], 9);
    stage.text('6월', oc[0] - orr - 14, oc[1], {size: 24, color: T.muted, align: 'right'});
    stage.text('12월', oc[0] + orr + 26, oc[1], {size: 24, color: T.muted});
    circle(c, ex, ey, 8, '#3C8DA8'); ring(c, ex, ey, 8, PAL.rim, 1.4);
    arrow(c, [ex - 2, ey], [ex + 20, ey], PAL.axis, 2.2, {head: 9});
  });
}
const HZ = {x0: 160, x1: 920, yg: 960, xs: 610, H: 140, Rs: 236, xf: 420, wb: 66};
function horizonPanel(stage, t, ctx, d, a) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), h = noonAlt(d), {x0, x1, yg, xs, H, Rs, xf, wb} = HZ;
  const beamA = fadeIn(t, evT(ctx, 'lab_beam', A.same) - 0.2, 0.6), ghostA = fadeIn(t, evT(ctx, 'lab_twice', A.twice) - 0.1, 0.5);
  const lessA = fadeIn(t, evT(ctx, 'lab_less', A.less) - 0.1, 0.5), cmpA = fadeIn(t, evT(ctx, 'shadow_cmp', A.shadowS) - 0.1, 0.5), sevenA = fadeIn(t, evT(ctx, 'seven', A.seven) - 0.1, 0.4);
  withAlpha(c, a, () => {
    panel(c, T, 140, 540, 800, 488, 0.92);
    stage.text('서울의 한낮 · 남북 단면', 156, 566, {size: 24, weight: 700, color: T.ink});
    c.save(); c.beginPath(); c.rect(142, 542, 796, 484); c.clip();
    // ground
    rect(c, x0 - 18, yg, x1 - x0 + 36, 62, 0, PAL.ground); rect(c, x0 - 18, yg, x1 - x0 + 36, 7, 0, PAL.groundTop);
    // the beam: same width w, footprint w / sin h
    if (beamA > 0) withAlpha(c, beamA, () => {
      const ux = -Math.cos(h * D2R), uy = -Math.sin(h * D2R), Lf = wb / Math.sin(h * D2R), xa = xf - Lf / 2, xb = xf + Lf / 2, S = 900;
      poly(c, [[xa, yg], [xb, yg], [xb + ux * S, yg + uy * S], [xa + ux * S, yg + uy * S]], rgba(PAL.sun, 0.17));
      for (const f of [0.0, 1.0]) { const x = lerp(xa, xb, f); line(c, [[x, yg], [x + ux * S, yg + uy * S]], rgba(PAL.sun, 0.7), 1.6); }
      c.save(); c.setLineDash([10, 12]); c.lineDashOffset = t * 60;
      for (const f of [0.25, 0.5, 0.75]) { const x = lerp(xa, xb, f); c.beginPath(); c.moveTo(x + ux * S, yg + uy * S); c.lineTo(x, yg); c.strokeStyle = rgba(PAL.sun, 0.6); c.lineWidth = 2; c.stroke(); }
      c.restore();
      rect(c, xa, yg - 3, Lf, 8, 2, PAL.sun);
      // equal-width marker across the beam
      const mx = xf + ux * 190, my = yg + uy * 190, nx = Math.sin(h * D2R), ny = -Math.cos(h * D2R);
      line(c, [[mx - nx * wb / 2, my - ny * wb / 2], [mx + nx * wb / 2, my + ny * wb / 2]], rgba('#FFF4DC', 0.9), 2.2);
      for (const sg of [-1, 1]) circle(c, mx + sg * nx * wb / 2, my + sg * ny * wb / 2, 3.5, '#FFF4DC');
      tag(stage, '같은 폭의 햇빛', mx + nx * wb / 2 + 14, my + ny * wb / 2 - 6, {size: 24, align: 'left', color: PAL.sun});
    });
    c.restore();
    // footprint brackets below the ground: 하지 (dashed ghost) and now
    const brk = (L, y, col, dash, label) => { const xa = xf - L / 2, xb = xf + L / 2; line(c, [[xa, y - 6], [xa, y], [xb, y], [xb, y - 6]], col, 2, dash ? {dash: [5, 4]} : {}); stage.text(label, xb + 10, y - 2, {size: 24, weight: 700, color: col}); };
    if (ghostA > 0) withAlpha(c, ghostA, () => brk(wb / Math.sin(H_JUN * D2R), yg + 22, rgba(T.ink, 0.85), true, '하지 ×1'));
    if (beamA > 0) withAlpha(c, beamA, () => brk(wb / Math.sin(h * D2R), yg + 48, PAL.sun, false, `×${(spreadOf(h) / spreadOf(H_JUN)).toFixed(1)}`));
    stage.text('남', 172, yg + 34, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text('북', 908, yg + 34, {size: 24, weight: 700, color: T.muted, align: 'center'});
    // the Sun on its noon-altitude arc around the stick top; ray through the stick top to the shadow tip
    const top = [xs, yg - H], sunAt = hh => [top[0] - Rs * Math.cos(hh * D2R), top[1] - Rs * Math.sin(hh * D2R)];
    const arcP = []; for (let hh = 12; hh <= 88; hh += 2) arcP.push(sunAt(hh)); line(c, arcP, rgba(PAL.sun, 0.25), 1.5, {dash: [4, 6]});
    if (cmpA > 0) withAlpha(c, cmpA * 0.55, () => { const sj = sunAt(H_JUN), tipJ = xs + H / Math.tan(H_JUN * D2R); line(c, [sj, [tipJ, yg]], rgba(PAL.sun, 0.6), 1.6, {dash: [6, 6]}); sunIcon(stage, sj[0], sj[1], 14, 0.8); });
    const sp = sunAt(h), tip = xs + H / Math.tan(h * D2R);
    line(c, [sp, [tip, yg]], rgba(PAL.sun, 0.8), 2, {dash: [8, 6]});
    sunIcon(stage, sp[0], sp[1], 20);
    // shadow, stick
    rect(c, xs, yg - 1, tip - xs, 8, 2, '#0D140C');
    rect(c, xs - 4, yg - H, 8, H, 2, PAL.stick);
    stage.text('1 m', xs - 14, yg - H / 2, {size: 24, weight: 700, color: PAL.stick, align: 'right'});
    // the altitude angle at the stick top
    line(c, [top, [top[0] - 92, top[1]]], rgba(T.ink, 0.5), 1.5, {dash: [5, 5]});
    ring(c, top[0], top[1], 54, PAL.sun, 2.5, Math.PI, Math.PI + h * D2R);
    const bis = (180 + h / 2) * D2R; stage.text(`${Math.round(h)}°`, top[0] + 84 * Math.cos(bis) - 6, top[1] + 84 * Math.sin(bis) + 4, {role: 'display', size: 30, weight: 700, color: PAL.sun, align: 'center'});
    // energy per area (s10)
    if (lessA > 0) tag(stage, '땅 한 곳에 닿는 햇빛 약 절반 → 덜 데워짐', 540, 600, {size: 26, color: PAL.sun, border: PAL.sun, a: lessA * fadeOut(t, evT(ctx, 'shadow_cmp', A.shadowS) - 0.5, 0.4)});
    // shadow comparison (s11)
    if (cmpA > 0) withAlpha(c, cmpA, () => {
      const lj = H / Math.tan(H_JUN * D2R), ld = H / Math.tan(H_DEC * D2R);
      line(c, [[xs, yg - 18], [xs + lj, yg - 18]], PAL.warm, 3); line(c, [[xs + lj, yg - 26], [xs + lj, yg - 10]], PAL.warm, 2);
      stage.text(`여름 ${shadowLen(H_JUN).toFixed(2)} m`, xs + lj + 12, yg - 20, {size: 24, weight: 700, color: PAL.warm});
      stage.text(`겨울 ${shadowLen(H_DEC).toFixed(2)} m`, xs + ld / 2, yg + 34, {size: 26, weight: 700, color: PAL.cool, align: 'center'});
      withAlpha(c, sevenA, () => tag(stage, `약 ${Math.round(shadowLen(H_DEC) / shadowLen(H_JUN))}배`, xs + ld - 26, yg - 88, {size: 30, role: 'display', color: PAL.cool, border: PAL.cool}));
    });
  });
}
function angleReadouts(stage, t, ctx, d, a) {
  const {ctx: c} = stage, T = stage.theme, h = noonAlt(d), y = 1046;
  const rows = [[['날짜', dateLabel(d)], ['한낮 해 높이', `${Math.round(h)}°`]], [['막대 그림자 (1 m)', `${shadowLen(h).toFixed(2)} m`], ['퍼지는 넓이 (하지 = 1)', `×${(spreadOf(h) / spreadOf(H_JUN)).toFixed(1)}`]]];
  withAlpha(c, a, () => {
    panel(c, T, 140, y, 800, 140, 0.92);
    line(c, [[540, y + 12], [540, y + 128]], rgba(T.border, 1), 1.2); line(c, [[156, y + 70], [924, y + 70]], rgba(T.border, 1), 1.2);
    rows.forEach((row, j) => row.forEach(([k, v], i) => {
      const x = 140 + i * 400, yy = y + 35 + j * 70;
      stage.text(k, x + 20, yy, {size: 24, color: T.muted});
      stage.text(v, x + 382, yy, {role: 'display', size: 30, weight: 700, color: i === 1 && j === 0 ? PAL.sun : T.ink, align: 'right'});
    }));
    // year graph of the noon altitude with the date cursor
    const g = {x0: 312, x1: 920, y0: 1318, y1: 1232}, X = dd => lerp(g.x0, g.x1, (((dd % 365) + 365) % 365) / 365), Y = hh => lerp(g.y0, g.y1, (hh - 25) / 55);
    panel(c, T, 140, 1198, 800, 138, 0.92);
    stage.text('한낮 해 높이', 156, 1236, {size: 24, weight: 700, color: T.ink});
    stage.text('1년', 156, 1268, {size: 24, color: T.muted});
    const pts = []; for (let x = 0; x <= 364; x += 2) pts.push([X(x), Y(noonAlt(x))]); line(c, pts, rgba(PAL.sun, 0.8), 2.5);
    stage.text('하지', X(D_JUN), Y(H_JUN) - 20, {size: 24, color: T.muted, align: 'center'});
    stage.text('동지', X(D_DEC) - 22, Y(H_DEC) - 26, {size: 24, color: T.muted, align: 'right'});
    const x = X(d), yy = Y(h); line(c, [[x, g.y1 - 6], [x, g.y0 + 6]], rgba(T.light, 0.5), 1.5); circle(c, x, yy, 7, PAL.sun); ring(c, x, yy, 12, rgba(PAL.sun, 0.6), 2);
  });
}

// ---- 24-hour day/night bar ----
const BAR = {x0: 300, x1: 860, h: 30};
function dayBar(stage, y, d, label, a, cursor = null, o = {}) {
  const {ctx: c} = stage, T = stage.theme, D = dayLen(d), X = hh => lerp(BAR.x0, BAR.x1, hh / 24), r = X(12 - D / 2), s = X(12 + D / 2);
  withAlpha(c, a, () => {
    rect(c, BAR.x0, y - BAR.h / 2, BAR.x1 - BAR.x0, BAR.h, 6, rgba('#1B2C4A', 1), rgba(T.border, 1), 1.2);
    rect(c, r, y - BAR.h / 2, s - r, BAR.h, 4, PAL.day);
    stage.text(`낮 ${fmtH(D)}`, (r + s) / 2, y + 1, {size: 24, weight: 700, color: '#2A1D08', align: 'center'});
    stage.text(label, BAR.x0 - 14, y, {size: 26, weight: 700, color: T.ink, align: 'right'});
    for (const hh of [0, 6, 12, 18, 24]) line(c, [[X(hh), y + BAR.h / 2], [X(hh), y + BAR.h / 2 + 6]], rgba(T.muted, 0.8), 1.2);
    if (o.hours) for (const hh of [0, 6, 12, 18, 24]) stage.text(`${hh}시`, X(hh), y + BAR.h / 2 + 24, {size: 24, color: T.muted, align: 'center'});
    if (cursor != null) { const x = X(((cursor % 24) + 24) % 24); line(c, [[x, y - BAR.h / 2 - 8], [x, y + BAR.h / 2 + 8]], PAL.mark, 3); circle(c, x, y - BAR.h / 2 - 10, 5, PAL.mark); }
  });
  return {r, s};
}
const clock = tau => { const h = ((tau % 24) + 24) % 24, hr = Math.floor(h + 1e-6); return hr === 0 ? '자정' : hr === 12 ? '정오' : hr < 12 ? `오전 ${hr}시` : `오후 ${hr - 12}시`; };

// ---- energy / lag: year graphs ----
const QG = {x0: 230, x1: 900, yq0: 836, yq1: 476};
const QX = d => lerp(QG.x0, QG.x1, clamp(d / 365, 0, 1)), QY = q => lerp(QG.yq0, QG.yq1, q / 500), TY = T => lerp(QG.yq0, QG.yq1, (T + 5) / 35);
function yearFrame(stage, title, unit, a) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    panel(c, T, 140, 392, 800, 480, 0.92);
    stage.text(title, 156, 418, {size: 24, weight: 700, color: T.ink});
    if (unit) stage.text(unit, 924, 418, {size: 24, color: T.muted, align: 'right'});
    for (let mth = 0; mth <= 12; mth++) line(c, [[QX(MONTH0[mth]), QG.yq0], [QX(MONTH0[mth]), QG.yq0 + 6]], rgba(T.muted, 0.8), 1.2);
    for (let mth = 0; mth < 12; mth++) stage.text(`${mth + 1}월`, QX((MONTH0[mth] + MONTH0[mth + 1]) / 2), QG.yq0 + 22, {size: 24, color: T.muted, align: 'center'});
    line(c, [[QG.x0, QG.yq0], [QG.x1, QG.yq0]], rgba(T.muted, 0.8), 1.5);
  });
}
function qAxis(stage, a) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => { for (const q of [0, 200, 400]) { if (q) line(c, [[QG.x0, QY(q)], [QG.x1, QY(q)]], rgba(T.border, 0.9), 1); stage.text(String(q), QG.x0 - 10, QY(q), {size: 24, color: T.muted, align: 'right'}); } });
}
function curve(stage, f, d0, d1, col, w, o = {}) {
  if (d1 <= d0) return; const pts = []; for (let d = d0; d < d1; d += 1.5) pts.push([QX(d), f(d)]); pts.push([QX(d1), f(d1)]);
  line(stage.ctx, pts, col, w, o.dash ? {dash: o.dash} : {});
}
function peakMark(stage, x, y, col, a) { withAlpha(stage.ctx, a, () => { circle(stage.ctx, x, y, 7, col); ring(stage.ctx, x, y, 13, rgba(col, 0.6), 2); }); }

// ---- heat in / out bars (lag) ----
function heatPanel(stage, t, d, a) {
  const {ctx: c} = stage, T = stage.theme, inQ = heatIn(d), outQ = heatOut(d), REF = 520, x0 = 420, wmax = 480;
  const rate = tempRate(d), wUp = smooth((rate - 0.004) / 0.02), wDn = smooth((-rate - 0.004) / 0.02), wEq = clamp(1 - wUp - wDn);
  const vis = w => smooth((w - 0.5) / 0.5);              // one verdict at a time (no overlapping cross-fade)
  withAlpha(c, a, () => {
    panel(c, T, 140, 892, 800, 268, 0.92);
    stage.text('지금 들어오는 열과 나가는 열', 156, 918, {size: 24, weight: 700, color: T.ink});
    stage.text(dateLabel(d), 924, 918, {role: 'display', size: 28, weight: 700, color: T.light, align: 'right'});
    for (const [y, k, v, col] of [[972, '들어오는 열 (햇빛)', inQ, PAL.q], [1024, '나가는 열', outQ, PAL.cool]]) {
      stage.text(k, x0 - 16, y, {size: 24, weight: 700, color: col, align: 'right'});
      rect(c, x0, y - 13, wmax, 26, 6, rgba(T.border, 0.6));
      rect(c, x0, y - 13, wmax * clamp(v / REF), 26, 6, col);
    }
    stage.text('들어오는 열 > 나가는 열 → 기온 상승', 540, 1092, {size: 28, weight: 700, color: PAL.temp, align: 'center', alpha: vis(wUp)});
    stage.text('들어오는 열 = 나가는 열 → 기온 최고', 540, 1092, {size: 28, weight: 700, color: T.light, align: 'center', alpha: vis(wEq)});
    stage.text('들어오는 열 < 나가는 열 → 기온 하강', 540, 1092, {size: 28, weight: 700, color: PAL.cool, align: 'center', alpha: vis(wDn)});
    stage.text('바다와 땅이 열을 머금었다가 천천히 내놓음', 540, 1134, {size: 24, color: T.muted, align: 'center'});
  });
}

// ---- mini horizon (south cards) ----
function miniHorizon(stage, x, y, h, sunSide, a, R = 92) {
  const {ctx: c} = stage, T = stage.theme, w = 150;
  withAlpha(c, a, () => {
    rect(c, x - w, y, 2 * w, 8, 2, PAL.groundTop); rect(c, x - w, y + 8, 2 * w, 18, 2, PAL.ground);
    rect(c, x - 3, y - 60, 6, 60, 2, PAL.stick);
    const sx = x + sunSide * R * Math.cos(h * D2R), sy = y - R * Math.sin(h * D2R);
    line(c, [[x, y], [sx, sy]], rgba(PAL.sun, 0.6), 1.6, {dash: [5, 5]});
    ring(c, x, y, 34, PAL.sun, 2, sunSide < 0 ? Math.PI : -h * D2R, sunSide < 0 ? Math.PI + h * D2R : 0);
    sunIcon(stage, sx, sy, 13);
    stage.text(sunSide < 0 ? '남' : '북', x + sunSide * (w - 14), y + 46, {size: 24, color: T.muted, align: 'center'});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  // ------------------------------------------------------------------ hook: the (almost circular) orbit
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx);
    checkSoundTable(ctx);
    const cam = orbitCam({cx: 540, cy: 800, a: 290, alpha: 60}), d = m.date(t), a0 = fadeIn(t, 0.1, 0.9);
    const mk = fadeIn(t, evT(ctx, 'markers', A.nearest) - 0.1, 0.6), sea = fadeIn(t, evT(ctx, 'lab_winter', A.winter) - 0.1, 0.5);
    const peri = cam.at(D_PERI), aph = cam.at(D_APH);
    withAlpha(c, a0, () => {
      drawOrbit(stage, cam, {a: 0.55});
      if (mk > 0) withAlpha(c, mk, () => {
        for (const q of [peri, aph]) { line(c, [[540, 800], [q[0], q[1]]], rgba(PAL.mark, 0.75), 2, {dash: [7, 6]}); circle(c, q[0], q[1], 6, PAL.mark); }
      });
      drawSun(stage, 540, 800, 30);
      stage.text('태양', 540, 852, {size: 24, color: T.muted, align: 'center'});
      const E = orbitEarth(cam, d, 30, 12 + t);
      earthWithAxis(stage, E.V, {len: 1.6, through: false});
      const eA = fadeIn(t, 0.8, 0.5) * fadeOut(t, 5.6, 0.6);
      if (eA > 0) tag(stage, '지구', E.V.cx, E.V.cy - 56, {size: 24, a: eA});
      stage.text('궤도: 실제 모양 그대로 — 거의 원', 540, 1104, {size: 26, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, 2.2, 0.6)});
    });
    // perihelion / aphelion labels (inside the orbit, above the distance lines)
    withAlpha(c, mk, () => {
      for (const [x, y, s1, s2] of [[704, 806, '1월 3일 · 가장 가까움', fmtDist(R_PERI)], [430, 884, '7월 6일 · 가장 멂', fmtDist(R_APH)]]) {
        stage.text(s1, x, y, {size: 24, weight: 700, color: PAL.mark, align: 'center'});
        stage.text(s2, x, y + 38, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
      }
    });
    withAlpha(c, sea, () => {
      tag(stage, '한겨울', 886, peri[1] + 52, {size: 28, color: PAL.cool, border: PAL.cool});
      tag(stage, '한여름', 240, aph[1] + 56, {size: 28, color: PAL.warm, border: PAL.warm});
    });
    // the common belief
    const bA = fadeIn(t, evT(ctx, 'belief', A.believe) - 0.1, 0.5);
    withAlpha(c, bA, () => {
      rect(c, 250, 298, 580, 90, 12, rgba(T.plate, 0.92), rgba(T.accent, 0.8), 2);
      stage.text('여름 = 태양에 가까워서?', 540, 344, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
    });
    // live distance readout
    const rA = fadeIn(t, at(A.near) - 0.2, 0.5);
    withAlpha(c, rA, () => {
      panel(c, T, 300, 1150, 480, 112, 0.92);
      stage.text('지구 – 태양 거리', 540, 1180, {size: 24, color: T.muted, align: 'center'});
      stage.text(fmtDist(orbit(d).r), 540, 1228, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
    });
  },

  // ------------------------------------------------------------------ origin: 季節, season / solstice, the stand-still, 앙부일구
  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), sc = tl.scene('origin');
    const aA = fadeIn(t, sc.start + 0.1, 0.5) * fadeOut(t, at('s04:end') + 0.15, 0.45);
    if (aA > 0) {
      const on = fadeIn(t, at(A.setsu) - 0.1, 0.4);
      glyphCard(stage, 400, 300, '季', '철 계', 0.25, aA);
      glyphCard(stage, 680, 300, '節', '마디 절', on, aA);
      withAlpha(c, aA * fadeIn(t, at(A.node) - 0.1, 0.4), () => stage.text('節 = 대나무 마디 → 끊어 나눈 한 토막', 540, 574, {size: 26, weight: 500, color: T.ink, align: 'center'}));
      bambooYear(stage, t, ctx, aA);
      wordCard(stage, t, 345, 'season', [[at(A.seed), '씨 뿌리는 때', T.light, 28], [at(A.latin), '← 라틴어 satio', T.ink, 26], [at(A.latin), '(씨 뿌리기)', T.muted, 24], [at(A.latin) + 0.5, '→ 한 해의 철', T.muted, 24]], at(A.season), aA);
      wordCard(stage, t, 735, 'solstice', [[at(A.haji), '= 하지 (夏至)', T.ink, 26], [at(A.sunW), 'sōl = 해', T.light, 28], [at(A.stopW), 'sistere = 멈춰 세우다', T.light, 26], [at(A.meaning), '→ 해가 멈춰 선 날', T.ink, 26]], at(A.solstice), aA);
    }
    const bA = fadeIn(t, at('s05') - 0.6, 0.5) * fadeOut(t, at('s05:end') + 0.1, 0.4);
    if (bA > 0) altGraph(stage, t, ctx, bA);
    const cA = fadeIn(t, at('s05:end') + 0.6, 0.6) * endFade(t, ctx);
    if (cA > 0) angbu(stage, t, ctx, cA);
  },

  // ------------------------------------------------------------------ essence: the tilted axis keeps its direction
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('essence'), d = m.date(t);
    const cam = orbitCam({cx: 540, cy: 720, a: 290, alpha: 22}), tau = 12 + 1.2 * (t - sc.start), ef = endFade(t, ctx);
    // proposition card
    withAlpha(c, fadeIn(t, sc.start + 0.1, 0.5), () => {
      rect(c, 140, 292, 800, 130, 12, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
      stage.text('계절을 만드는 것은', 540, 326, {size: 30, weight: 500, color: T.ink, align: 'center'});
      const dA = fadeIn(t, at(A.dist) - 0.1, 0.4), kA = fadeIn(t, at(A.tilted) - 0.1, 0.4);
      const [x0, x1] = propRow(stage, 384, '거리가 아니라', '기울기 23.4°', PAL.mark, dA, kA);
      crossOut(c, x0, x0 + stage.measure('거리가', {size: 30, weight: 500}), 384, fadeIn(t, at(A.notW) - 0.1, 0.5));
    });
    drawOrbit(stage, cam, {a: 0.5});
    drawSun(stage, 540, 720, 30);
    // distance line (s07 "거리가")
    const live = orbitEarth(cam, d, 58, tau);
    withAlpha(c, fadeIn(t, at(A.dist) - 0.1, 0.4) * fadeOut(t, at(A.tilted) - 0.3, 0.5), () => {
      line(c, [[540, 720], [live.p[0], live.p[1]]], rgba(PAL.mark, 0.8), 2, {dash: [7, 6]});
      tag(stage, '거리', (540 + live.p[0]) / 2, 694, {size: 26, color: PAL.mark});
    });
    // copies at the four seasons (left behind as the live Earth passes)
    const SEAS = [[D_JUN, '6월 · 하지', 'below'], [D_SEP, '9월 · 추분', 'right'], [D_DEC, '12월 · 동지', 'below'], [D_MAR, '3월 · 춘분', 'right']];
    const tStart = at(A.axisSame), tEnd = at(A.june) - 0.1;
    const passT = dd => { for (let tt = tStart; tt <= tEnd; tt += 0.02) if (m.date(tt) >= dd + (dd < D_JUN ? YEAR : 0)) return tt; return tEnd; };
    const hiJ = fadeIn(t, evT(ctx, 'june_hi', A.june) - 0.1, 0.5), hiD = fadeIn(t, evT(ctx, 'dec_hi', A.dec) - 0.1, 0.5);
    for (const [dd, lab, where] of SEAS) {
      const tp = dd === D_JUN ? tStart : passT(dd), ca = fadeIn(t, tp - 0.05, 0.3);
      if (ca <= 0) continue;
      const E = orbitEarth(cam, dd, 58, tau), hi = dd === D_JUN ? hiJ : dd === D_DEC ? hiD : 0;
      withAlpha(c, ca * (dd === D_JUN && t < tEnd + 0.1 && t > tStart ? 0.75 : 1), () => {
        if (hi > 0) { ring(c, E.p[0], E.p[1], 74, rgba(T.light, 0.85 * hi), 3); }
        earthWithAxis(stage, E.V, {len: 1.4});
        const [lx, ly, al] = where === 'below' ? [E.p[0], E.p[1] + 92, 'center'] : [E.p[0] + 74, E.p[1], 'left'];
        stage.text(lab, lx, ly, {size: 26, weight: 700, color: hi > 0.5 ? T.light : T.ink, align: al});
      });
    }
    // the live Earth (moves through the year in s08)
    if (t > tStart - 0.01 && t < tEnd + 0.05) earthWithAxis(stage, live.V, {len: 1.4});
    else if (t <= tStart) earthWithAxis(stage, live.V, {len: 1.4});
    // the live Earth enlarged (s07–s08): the axis keeps its direction while the sunlight comes from changing sides
    const bigA = fadeIn(t, sc.start + 0.3, 0.6) * fadeOut(t, at(A.june) - 0.6, 0.5);
    if (bigA > 0) withAlpha(c, bigA, () => {
      const B = earthView({cx: 540, cy: 1096, R: 150}, live.V.axis, live.V.sun, tau), s2 = live.V.sun, rho = Math.hypot(s2[0], s2[1]);
      const sa = smooth((rho - 0.4) / 0.25);
      if (sa > 0) withAlpha(c, sa, () => {
        const ux = s2[0] / rho, uy = -s2[1] / rho, px = -uy, py = ux;
        for (let k = -2; k <= 2; k++) { const o = k * 52; arrow(c, [540 + ux * 300 + px * o, 1096 + uy * 300 + py * o], [540 + ux * 176 + px * o, 1096 + uy * 176 + py * o], rgba(PAL.sun, 0.5), 2, {head: 10}); }
        tag(stage, '햇빛', 540 + ux * 330, 1096 + uy * 330 - 30, {size: 24, color: PAL.sun, plate: false});
      });
      earthWithAxis(stage, B, {len: 1.4});
      const tp = axisTip(B, 1.4);
      tag(stage, '자전축 · 북극성 쪽', tp[0] + 14, tp[1] + 12, {size: 24, color: PAL.axis, align: 'left', a: fadeIn(t, at(A.axisW) - 0.1, 0.5)});
      const tiltA = fadeIn(t, at(A.tilted) - 0.1, 0.5) * fadeOut(t, tStart - 0.3, 0.5);
      if (tiltA > 0) withAlpha(c, tiltA, () => {
        line(c, [[540, 1096 - 150], [540, 1096 - 150 * 1.55]], rgba(T.ink, 0.7), 2, {dash: [5, 5]});
        const an = Math.atan2(-B.axis[1], B.axis[0]); ring(c, 540, 1096, 150 * 1.22, PAL.mark, 3, -Math.PI / 2, an);
        tag(stage, '23.4°', 540 + 20, 1096 - 150 * 1.62, {size: 30, role: 'display', color: PAL.mark, align: 'left'});
        tag(stage, '공전면에 수직', 540 - 16, 1096 - 150 * 1.62, {size: 24, color: T.muted, align: 'right'});
      });
      withAlpha(c, fadeIn(t, tStart - 0.2, 0.4), () => tag(stage, dateLabel(d), 540, 1296, {size: 26, role: 'display', color: T.light}));
    });
    // "북극성 쪽" on the June Earth's axis
    const nA = fadeIn(t, at(A.sameDir) - 0.1, 0.5) * ef;
    if (nA > 0) { const E = orbitEarth(cam, D_JUN, 58, tau), tp = axisTip(E.V, 1.4); tag(stage, '북극성 쪽', tp[0] + 14, tp[1] - 8, {size: 24, color: PAL.axis, align: 'left', a: nA}); }
    // zoom strip: June (left of the Sun) and December (right of the Sun)
    const zA = Math.max(hiJ, hiD) * ef;
    if (zA > 0) withAlpha(c, zA, () => {
      drawSun(stage, 540, 1130, 24);
      for (const [dd, x, hi, l1, l2] of [[D_JUN, 290, hiJ, '6월', '북반구가 해 쪽으로'], [D_DEC, 790, hiD, '12월', '북반구가 해 반대쪽으로']]) {
        if (hi <= 0) continue;
        withAlpha(c, hi, () => {
          const E = orbitEarth(cam, dd, 58, tau), Z = earthView({cx: x, cy: 1130, R: 92}, E.V.axis, E.V.sun, tau);
          line(c, [[E.p[0], E.p[1] + 64], [x, 1130 - 128]], rgba(T.light, 0.25), 1.2, {dash: [4, 6]});
          for (let k = -1; k <= 1; k++) { const y = 1130 + k * 34, sx = x < 540 ? 510 : 570, ex = x < 540 ? x + 98 : x - 98; arrow(c, [sx, y], [ex, y], rgba(PAL.sun, 0.55), 1.6, {head: 8}); }
          earthWithAxis(stage, Z, {len: 1.35});
          stage.text(l1, x, 1262, {role: 'display', size: 30, weight: 700, color: T.light, align: 'center'});
          stage.text(l2, x, 1300, {size: 26, weight: 700, color: T.ink, align: 'center'});
        });
      }
    });
  },

  // ------------------------------------------------------------------ angle: the 3-tier instrument (height of the Sun)
  angle(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, m = M(ctx), sc = tl.scene('angle'), d = m.date(t), ef = endFade(t, ctx);
    const a1 = fadeIn(t, sc.start + 0.1, 0.5) * ef, a2 = fadeIn(t, sc.start + 0.3, 0.5) * ef, a3 = fadeIn(t, sc.start + 0.5, 0.5) * ef;
    sectionPanel(stage, t, d, a1);
    horizonPanel(stage, t, ctx, d, a2);
    angleReadouts(stage, t, ctx, d, a3);
  },

  // ------------------------------------------------------------------ daylength: the globe, Seoul's latitude circle, 24 h bars
  daylength(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('daylength'), d = m.date(t), tau = m.tau(t), ef = endFade(t, ctx);
    const a0 = fadeIn(t, sc.start + 0.1, 0.6) * ef, cam = sideCam(d, 0, 14);
    const V = earthView({cx: 540, cy: 742, R: 270}, cam.n, cam.s, tau);
    withAlpha(c, a0, () => {
      glow(c, 0, 742, 300, PAL.sun, 0.28);
      for (let k = -3; k <= 3; k++) arrow(c, [70, 742 + k * 70], [246 - Math.abs(k) * 6, 742 + k * 70], rgba(PAL.sun, 0.5), 2, {head: 11});
      stage.text('햇빛', 78, 494, {size: 26, weight: 700, color: PAL.sun});
      earthWithAxis(stage, V, {len: 1.3, grat: 0.12});
      latDayNight(c, V, SEOUL.lat, {w: 5});
      const sp = placeDot(stage, V, SEOUL.lat, SEOUL.lon, PAL.mark, 1, 7);
      if (sp[2]) tag(stage, '서울', sp[0], sp[1] + 30, {size: 24, color: PAL.mark});
      const tp = axisTip(V, 1.3); stage.text('자전축', tp[0] + (tp[0] < 540 ? -14 : 14), tp[1] + 6, {size: 24, color: PAL.axis, align: tp[0] < 540 ? 'right' : 'left'});
      tag(stage, '낮', 400, 880, {size: 26, color: PAL.day, a: 0.9}); tag(stage, '밤', 690, 880, {size: 26, color: PAL.night, a: 0.9});
      stage.text('노란 길 = 서울의 낮 · 파란 길 = 밤 (위도 37.5°)', 540, 1102, {size: 24, weight: 500, color: T.muted, align: 'center'});
    });
    readoutRow(stage, 292, 84, [{key: '날짜', val: dateLabel(d)}, {key: '서울 시각', val: clock(tau), col: T.light}, {key: '낮의 길이', val: fmtH(dayLen(d)), col: PAL.day}], a0);
    // 24 h bars
    const jA = fadeIn(t, evT(ctx, 'lab_bar', A.day) - 0.2, 0.5) * ef, dA = fadeIn(t, evT(ctx, 'lab_dec', A.solsD) - 0.1, 0.5) * ef, fA = fadeIn(t, evT(ctx, 'five', A.five) - 0.1, 0.5) * ef;
    const sj = m.spins[0], sd = m.spins[1];
    const J = dayBar(stage, 1166, D_JUN, '6월 21일', jA, t > sj[0] - 0.05 && t < sj[1] + 0.4 ? tau : null);
    const Dd = dayBar(stage, 1262, D_DEC, '12월 22일', dA, t > sd[0] - 0.05 ? tau : null, {hours: true});
    if (fA > 0) withAlpha(c, fA, () => {
      for (const [x0, x1] of [[J.r, Dd.r], [Dd.s, J.s]]) { rect(c, x0, 1203, x1 - x0, 10, 3, rgba(T.light, 0.85)); }
      tag(stage, `약 ${Math.round(dayLen(D_JUN) - dayLen(D_DEC))}시간 차이`, 540, 1214, {size: 26, color: T.light, border: T.light});
    });
  },

  // ------------------------------------------------------------------ energy: insolation vs distance over the year
  energy(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('energy'), d = m.date(t), ef = endFade(t, ctx);
    const a0 = fadeIn(t, sc.start + 0.1, 0.5), dq = Math.min(d, 365), dr = clamp(d - 365, 0, 365), inS15 = t >= at('s15') - 0.2;
    const cd = inS15 ? dr : dq, h = noonAlt(cd);
    readoutRow(stage, 292, 84, [{key: '날짜', val: dateLabel(Math.min(cd, 364.9))}, {key: '한낮 해 높이', val: `${Math.round(h)}°`, col: PAL.sun},
      {key: '낮의 길이', val: fmtH(dayLen(cd))}, inS15 ? {key: '태양까지', val: fmtDist(orbit(cd).r), col: PAL.dist, valSize: 26} : {key: '하루 햇빛', val: `${Math.round(insol(cd))} W/m²`, col: PAL.q}], a0 * ef);
    yearFrame(stage, '서울 땅이 받는 햇빛 · 하루 평균', 'W/m² · 대기 위', a0 * ef);
    qAxis(stage, a0 * ef);
    const pkA = fadeIn(t, evT(ctx, 'lab_peak', A.hajiE) - 0.1, 0.4) * ef, trA = fadeIn(t, evT(ctx, 'lab_trough', A.dongE) - 0.1, 0.4) * ef, x3A = fadeIn(t, evT(ctx, 'ratio', A.three) - 0.1, 0.5) * ef;
    const p3A = fadeIn(t, evT(ctx, 'lab_pct3', A.pct3) - 0.1, 0.5) * ef, p7A = fadeIn(t, evT(ctx, 'pct7', A.pct7) - 0.1, 0.5) * ef;
    withAlpha(c, a0 * ef, () => {
      curve(stage, x => QY(insol(x)), 0, dq, PAL.q, 3.5);
      if (p7A > 0) withAlpha(c, p7A, () => { curve(stage, x => QY(qDist(x)), 0, 365, PAL.dist, 3, {dash: [9, 7]}); tag(stage, '거리만 바뀐다면: 차이 약 7%', 548, QY(qDist(172)) + 46, {size: 24, color: PAL.dist, border: PAL.dist}); });
      peakMark(stage, QX(D_JUN), QY(Q_JUN), PAL.q, pkA);
      withAlpha(c, pkA, () => stage.text(`하지 ${Math.round(Q_JUN)}`, QX(D_JUN), QY(Q_JUN) - 26, {role: 'display', size: 28, weight: 700, color: PAL.q, align: 'center'}));
      peakMark(stage, QX(D_DEC), QY(Q_DEC), PAL.q, trA);
      withAlpha(c, trA, () => stage.text(`동지 ${Math.round(Q_DEC)}`, QX(D_DEC) - 10, QY(Q_DEC) + 32, {role: 'display', size: 28, weight: 700, color: PAL.q, align: 'center'}));
      if (x3A > 0) withAlpha(c, x3A, () => {
        const xb = 914, y1 = QY(Q_JUN), y2 = QY(Q_DEC);
        line(c, [[QX(D_JUN) + 14, y1], [xb, y1]], rgba(PAL.q, 0.5), 1.4, {dash: [4, 5]}); line(c, [[QX(D_DEC) + 14, y2], [xb, y2]], rgba(PAL.q, 0.5), 1.4, {dash: [4, 5]});
        arrow(c, [xb, (y1 + y2) / 2], [xb, y1 + 2], PAL.q, 2.5, {head: 10}); arrow(c, [xb, (y1 + y2) / 2], [xb, y2 - 2], PAL.q, 2.5, {head: 10});
        tag(stage, `약 ${(Q_JUN / Q_DEC).toFixed(1)}배`, xb - 14, (y1 + y2) / 2 - 20, {size: 30, role: 'display', color: PAL.q, border: PAL.q, align: 'right'});
      });
      if (!inS15 && t > at('s14') - 0.3 && t < at(A.hajiE) + 0.3) { const x = QX(dq), y = QY(insol(dq)); line(c, [[x, QG.yq1 - 8], [x, QG.yq0]], rgba(T.light, 0.6), 1.5); circle(c, x, y, 7, PAL.q); }
    });
    // distance panel (honest zero baseline: the curve barely moves)
    const rA = fadeIn(t, at(A.distE) - 0.6, 0.5) * ef, RY = r => lerp(1132, 962, r / 200);
    withAlpha(c, rA, () => {
      panel(c, T, 140, 892, 800, 268, 0.92);
      stage.text('태양까지의 거리', 156, 918, {size: 24, weight: 700, color: T.ink});
      stage.text('0에서 시작하는 축', 924, 918, {size: 24, color: T.muted, align: 'right'});
      for (const [r, s] of [[0, '0'], [100, '1억 km']]) { line(c, [[QG.x0, RY(r)], [QG.x1, RY(r)]], rgba(T.border, r ? 0.9 : 1.4), 1); stage.text(s, QG.x0 - 10, RY(r), {size: 24, color: T.muted, align: 'right'}); }
      const pts = []; for (let x = 0; x <= dr; x += 2) pts.push([QX(x), RY(orbit(x).r)]); if (dr > 0) { pts.push([QX(dr), RY(orbit(dr).r)]); line(c, pts, PAL.dist, 3.5); }
      if (inS15 && t < at(A.pct3) + 1.9) { const x = QX(dr); line(c, [[x, 960], [x, 1132]], rgba(T.light, 0.6), 1.5); circle(c, x, RY(orbit(dr).r), 7, PAL.dist); }
      const mA = smooth((dr - 10) / 20), xA = smooth((dr - 190) / 20);
      withAlpha(c, mA, () => { circle(c, QX(D_PERI), RY(R_PERI), 6, PAL.mark); stage.text(`${fmtDist(R_PERI)} · 1월 3일`, QX(D_PERI) + 4, RY(R_PERI) - 30, {size: 24, weight: 700, color: PAL.mark}); });
      withAlpha(c, xA, () => { circle(c, QX(D_APH), RY(R_APH), 6, PAL.mark); stage.text(`${fmtDist(R_APH)} · 7월 6일`, QX(D_APH) + 40, RY(R_APH) + 34, {size: 24, weight: 700, color: PAL.mark, align: 'center'}); });
      withAlpha(c, p3A, () => tag(stage, `가장 멀 때가 약 ${((R_APH / R_PERI - 1) * 100).toFixed(1)}% 더 멂`, 540, 1092, {size: 26, color: PAL.dist, border: PAL.dist}));
    });
    // summary
    const s1 = x3A, s2 = p7A;
    if (s1 > 0) withAlpha(c, s1 * ef, () => {
      panel(c, T, 140, 1180, 800, 150, 0.92); line(c, [[540, 1192], [540, 1318]], rgba(T.border, 1), 1.2);
      stage.text('기울기 (해 높이 × 낮 길이)', 340, 1214, {size: 24, color: T.muted, align: 'center'});
      stage.text(`약 ${(Q_JUN / Q_DEC).toFixed(1)}배`, 340, 1276, {role: 'display', size: 48, weight: 700, color: PAL.q, align: 'center'});
      withAlpha(c, s2, () => {
        stage.text('거리 (가까울 때 ÷ 멀 때)', 740, 1214, {size: 24, color: T.muted, align: 'center'});
        stage.text(`약 ${Math.round((DIST_EFFECT - 1) * 100)}%`, 740, 1276, {role: 'display', size: 48, weight: 700, color: PAL.dist, align: 'center'});
      });
    });
  },

  // ------------------------------------------------------------------ lag: sunlight peaks in June, temperature in August
  lag(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('lag'), d = m.date(t), ef = endFade(t, ctx);
    const a0 = fadeIn(t, sc.start + 0.05, 0.4) * ef;
    // legend row
    withAlpha(c, a0, () => {
      panel(c, T, 140, 292, 800, 84, 0.92);
      line(c, [[230, 334], [280, 334]], PAL.q, 4); stage.text('햇빛 (하루 평균, W/m²)', 292, 334, {size: 24, weight: 700, color: T.ink});
      line(c, [[600, 334], [650, 334]], PAL.temp, 4); stage.text('서울 기온 (°C)', 662, 334, {size: 24, weight: 700, color: T.ink});
    });
    yearFrame(stage, '같은 한 해 · 서울', '', a0);
    qAxis(stage, a0 * 0.8);
    const sunA = fadeIn(t, evT(ctx, 'sun_peak', A.sunPeak) - 0.1, 0.4) * ef, tT0 = at(A.hot) - 0.4, tDraw = easeInOut((t - tT0) / 1.8);
    const hotA = fadeIn(t, evT(ctx, 'temp_peak', A.aug) - 0.1, 0.4) * ef, gapA = fadeIn(t, evT(ctx, 'temp_peak', A.aug) + 0.4, 0.5) * ef;
    const gapPulse = ctx.events.has('lab_lag') ? ctx.events.pulse('lab_lag', t, 1.0) : 0, curA = fadeIn(t, at('s17') - 0.2, 0.4) * ef;
    withAlpha(c, a0, () => {
      curve(stage, x => QY(insol(x)), 0, 365, PAL.q, 3.5);
      if (tDraw > 0) curve(stage, x => TY(temp(x)), 0, 365 * tDraw, PAL.temp, 3.5);
      peakMark(stage, QX(D_JUN), QY(Q_JUN), PAL.q, sunA);
      withAlpha(c, sunA, () => { line(c, [[QX(D_JUN), QY(Q_JUN) - 14], [QX(D_JUN) - 30, 456]], rgba(PAL.q, 0.7), 1.3); stage.text('햇빛 최고 · 6월 21일', QX(D_JUN) - 34, 452, {size: 24, weight: 700, color: PAL.q, align: 'right'}); });
      peakMark(stage, QX(D_TMAX), TY(T_MAX), PAL.temp, hotA);
      withAlpha(c, hotA, () => {
        line(c, [[QX(D_TMAX), TY(T_MAX) - 14], [QX(D_TMAX) + 30, 456]], rgba(PAL.temp, 0.7), 1.3);
        stage.text(`기온 최고 · 8월 · ${T_MAX.toFixed(1)} °C`, QX(D_TMAX) + 34, 452, {size: 24, weight: 700, color: PAL.temp});
        peakMark(stage, QX(D_TMIN), TY(T_MIN), PAL.temp, 1);
        stage.text(`1월 · ${T_MIN.toFixed(1)} °C`.replace('-', '−'), QX(D_TMIN) + 20, TY(T_MIN) + 16, {size: 24, weight: 700, color: PAL.temp});
      });
      if (gapA > 0) withAlpha(c, gapA, () => {
        const xa = QX(D_JUN), xb = QX(D_TMAX), y = 572;
        line(c, [[xa, QY(Q_JUN) + 12], [xa, y + 14]], rgba(T.light, 0.4), 1.2, {dash: [4, 4]}); line(c, [[xb, TY(T_MAX) + 12], [xb, y + 14]], rgba(T.light, 0.4), 1.2, {dash: [4, 4]});
        arrow(c, [xa + 2, y], [xb - 2, y], T.light, 2.5, {head: 11});
        if (gapPulse > 0) glow(c, (xa + xb) / 2, y + 36, 90, T.light, 0.25 * gapPulse);
        tag(stage, '약 한 달 반', (xa + xb) / 2, y + 36, {size: 28, color: T.light, border: T.light});
      });
      if (curA > 0) withAlpha(c, curA, () => { const x = QX(((d % 365) + 365) % 365); line(c, [[x, QG.yq1 - 8], [x, QG.yq0]], rgba(T.light, 0.6), 1.5); circle(c, x, QY(insol(d)), 6, PAL.q); circle(c, x, TY(temp(d)), 6, PAL.temp); });
    });
    heatPanel(stage, t, d, curA);
    const nA = fadeIn(t, at(A.follow) - 0.1, 0.5) * ef;
    if (nA > 0) withAlpha(c, nA, () => {
      panel(c, T, 140, 1180, 800, 150, 0.92);
      stage.text('하지가 지나도 들어오는 열이 더 많아서', 540, 1222, {size: 28, weight: 700, color: T.ink, align: 'center'});
      stage.text('기온은 8월 초까지 계속 오른다', 540, 1272, {size: 28, weight: 700, color: PAL.temp, align: 'center'});
    });
  },

  // ------------------------------------------------------------------ south: Seoul in winter, Sydney in midsummer
  south(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('south'), d = m.date(t), ef = endFade(t, ctx);
    const a0 = fadeIn(t, sc.start + 0.05, 0.5) * ef, cam = sideCam(d, 18, 14), tau = 14.2 + 0.25 * (t - sc.start);
    const V = earthView({cx: 540, cy: 690, R: 290}, cam.n, cam.s, tau);
    const hemA = fadeIn(t, evT(ctx, 'lab_hemi', A.seasonsOpp) - 0.1, 0.5) * ef, sydA = fadeIn(t, evT(ctx, 'sydney_sun', A.aus) - 0.1, 0.5) * ef;
    withAlpha(c, a0, () => {
      glow(c, 0, 600, 320, PAL.sun, 0.3);
      for (let k = -2; k <= 2; k++) arrow(c, [64, 640 + k * 70], [180, 640 + k * 70 + 10], rgba(PAL.sun, 0.45), 2, {head: 11});
      stage.text('햇빛', 70, 452, {size: 26, weight: 700, color: PAL.sun});
      earthWithAxis(stage, V, {len: 1.22, grat: 0.12});
      latDayNight(c, V, SEOUL.lat, {w: 4});
      latDayNight(c, V, SYDNEY.lat, {w: 4, a: sydA});
      const s1 = placeDot(stage, V, SEOUL.lat, SEOUL.lon, PAL.cool, 1, 7);
      tag(stage, '서울 · 12월 · 겨울', s1[0] + 18, s1[1] - 34, {size: 26, color: PAL.cool, border: PAL.cool, align: 'left'});
      withAlpha(c, sydA, () => {
        const s2 = placeDot(stage, V, SYDNEY.lat, SYDNEY.lon, PAL.warm, 1, 7);
        tag(stage, `시드니 · ${dateLabel(d)} · 한여름`, s2[0] + 18, s2[1] + 38, {size: 26, color: PAL.warm, border: PAL.warm, align: 'left'});
      });
      withAlpha(c, hemA, () => { tag(stage, '북반구 · 겨울', 230, 470, {size: 26, color: PAL.cool}); tag(stage, '남반구 · 여름', 250, 930, {size: 26, color: PAL.warm}); });
    });
    // cards: noon sun and day length (model values)
    const card = (x0, name, lat, side, col, a) => withAlpha(c, a, () => {
      panel(c, T, x0, 1054, 390, 276, 0.92);
      stage.text(name, x0 + 195, 1084, {size: 26, weight: 700, color: col, align: 'center'});
      miniHorizon(stage, x0 + 195, 1240, noonAlt(d, lat), side, 1, 76);
      stage.text(`한낮 해 ${Math.round(noonAlt(d, lat))}°`, x0 + 195, 1120, {role: 'display', size: 30, weight: 700, color: PAL.sun, align: 'center'});
      stage.text(`낮 ${fmtH(dayLen(d, lat))}`, x0 + 195, 1306, {size: 26, weight: 700, color: T.ink, align: 'center'});
    });
    card(140, '서울 (37.5°N)', SEOUL.lat, -1, PAL.cool, fadeIn(t, sc.start + 0.4, 0.5) * ef);
    card(550, '시드니 (33.9°S)', SYDNEY.lat, 1, PAL.warm, sydA);
  },

  // ------------------------------------------------------------------ myth: "closer → summer?" — no
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('myth'), ef = endFade(t, ctx);
    const a0 = fadeIn(t, sc.start + 0.05, 0.5) * ef, noA = fadeIn(t, evT(ctx, 'myth_no', A.sh) - 0.1, 0.5) * ef;
    const hypA = fadeIn(t, evT(ctx, 'lab_if', A.ifDist) - 0.1, 0.5) * ef, e2A = fadeIn(t, evT(ctx, 'lab_nh', A.nh) - 0.2, 0.5) * ef, shA = fadeIn(t, evT(ctx, 'lab_sh', A.sh) - 0.1, 0.5) * ef;
    // verdict card
    withAlpha(c, a0, () => {
      rect(c, 140, 292, 800, 150, 12, rgba(T.plate, 0.92), noA > 0.5 ? rgba(T.accent, 0.8) : rgba(T.border, 1), 2);
      stage.text('가까워서 여름?', 540, 340, {role: 'display', size: 40, weight: 700, color: mix(T.ink, T.muted, noA), align: 'center'});
      const w = stage.measure('가까워서 여름?', {role: 'display', size: 40, weight: 700}); crossOut(c, 540 - w / 2, 540 + w / 2, 340, noA);
      stage.text('아니다', 540, 404, {role: 'display', size: 44, weight: 700, color: T.accent, align: 'center', alpha: noA});
    });
    // evidence 1: closest in January (northern midwinter)
    withAlpha(c, a0, () => {
      stage.text('① 지구는 1월에 가장 가깝다', 540, 482, {size: 28, weight: 700, color: T.ink, align: 'center'});
      const cam = orbitCam({cx: 540, cy: 676, a: 180, alpha: 50});
      drawOrbit(stage, cam, {a: 0.5}); drawSun(stage, 540, 676, 22);
      const E = orbitEarth(cam, D_PERI + 365, 24, 12 + t);
      line(c, [[540, 676], [E.p[0], E.p[1]]], rgba(PAL.mark, 0.7), 2, {dash: [6, 5]});
      earthWithAxis(stage, E.V, {len: 1.6, through: false});
      stage.text(fmtDist(R_PERI), 596, (676 + E.p[1]) / 2 - 30, {size: 24, weight: 700, color: PAL.mark, align: 'center'});
      tag(stage, '1월 3일 · 북반구 한겨울', E.p[0] + 50, E.p[1] + 60, {size: 24, color: PAL.cool, border: PAL.cool, align: 'center'});
    });
    // the hypothetical
    withAlpha(c, hypA, () => {
      stage.text('거리가 원인이라면 → 지구 전체가 같은 계절이어야', 540, 862, {size: 26, weight: 500, color: T.muted, align: 'center'});
    });
    // evidence 2: the two hemispheres always have opposite seasons
    withAlpha(c, e2A, () => {
      stage.text('② 두 반구는 늘 반대 계절', 540, 914, {size: 28, weight: 700, color: T.ink, align: 'center'});
      const cam = sideCam(D_DEC + 3, 18, 14), V = earthView({cx: 540, cy: 1130, R: 168}, cam.n, cam.s, 14.5 + 0.3 * (t - sc.start));
      glow(c, 220, 1130, 120, PAL.sun, 0.18);
      for (let k = -2; k <= 2; k++) arrow(c, [214, 1130 + k * 46], [346, 1130 + k * 46], rgba(PAL.sun, 0.45), 1.8, {head: 10});
      stage.text('햇빛', 220, 1010, {size: 24, weight: 700, color: PAL.sun, align: 'center'});
      earthWithAxis(stage, V, {len: 1.25, grat: 0.1});
      const pn = proj(V, 45, 140), ps = proj(V, -35, 140);
      line(c, [[pn[0] + 10, pn[1]], [722, 1000]], rgba(PAL.cool, 0.6), 1.3); tag(stage, '북반구 · 12월 겨울', 730, 1000, {size: 26, color: PAL.cool, border: PAL.cool, align: 'left'});
      withAlpha(c, shA, () => { line(c, [[ps[0] + 10, ps[1]], [722, 1262]], rgba(PAL.warm, 0.6), 1.3); tag(stage, '남반구 · 12월 여름', 730, 1262, {size: 26, color: PAL.warm, border: PAL.warm, align: 'left'}); });
    });
  },

  // ------------------------------------------------------------------ close: the proposition + the tilted Earth through a year
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, at = r => tl.at(r), m = M(ctx), sc = tl.scene('close'), d = m.date(t);
    const q = fadeIn(t, sc.start + 0.2, 0.6), hA = fadeIn(t, evT(ctx, 'lab_alt', A.alt) - 0.1, 0.4), lA = fadeIn(t, evT(ctx, 'lab_len', A.len) - 0.1, 0.4);
    withAlpha(c, q, () => {
      stage.text('정리', 540, 296, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
      stage.text('계절은 거리가 아니라', 540, 368, {role: 'display', size: 52, weight: 700, color: T.ink, align: 'center'});
      stage.text('기울기가 만든다', 540, 440, {role: 'display', size: 52, weight: 700, color: PAL.mark, align: 'center'});
      line(c, [[480, 494], [600, 494]], T.accent, 4, {cap: 'butt'});
    });
    const cam = orbitCam({cx: 540, cy: 732, a: 282, alpha: 20});
    withAlpha(c, fadeIn(t, sc.start + 0.4, 0.6), () => {
      drawOrbit(stage, cam, {a: 0.5}); drawSun(stage, 540, 732, 28);
      const E = orbitEarth(cam, d, 56, 12 + 1.5 * (t - sc.start));
      earthWithAxis(stage, E.V, {len: 1.4});
      const tp = axisTip(E.V, 1.4), rt = tp[0] > 720; stage.text('북극성 쪽', tp[0] + (rt ? -14 : 12), tp[1] - (rt ? 14 : 6), {size: 24, color: PAL.axis, align: rt ? 'right' : 'left'});
    });
    readoutRow(stage, 904, 96, [{key: '날짜', val: dateLabel(d)}, {key: '서울 한낮 해 높이', val: `${Math.round(noonAlt(d))}°`, col: PAL.sun, hi: hA}, {key: '서울 낮의 길이', val: fmtH(dayLen(d)), col: PAL.day, hi: lA}], fadeIn(t, sc.start + 0.6, 0.6));
    // both follow the same tilt: one year graph, two curves (normalised to their own ranges)
    const g = {x0: 230, x1: 900, y0: 1300, y1: 1060}, X = dd => lerp(g.x0, g.x1, (((dd % 365) + 365) % 365) / 365);
    const Yh = hh => lerp(g.y0, g.y1, (hh - H_DEC) / (H_JUN - H_DEC) * 0.8 + 0.1), DJ = dayLen(D_JUN), DD = dayLen(D_DEC), Yd = D => lerp(g.y0, g.y1, (D - DD) / (DJ - DD) * 0.8 + 0.05);
    withAlpha(c, fadeIn(t, sc.start + 0.8, 0.6), () => {
      panel(c, T, 140, 1014, 800, 318, 0.92);
      stage.text('한 해 동안 함께 오르내림', 156, 1040, {size: 24, weight: 700, color: T.ink});
      for (let mth = 0; mth < 12; mth += 3) stage.text(`${mth + 1}월`, X(MONTH0[mth] + 15), 1314, {size: 24, color: T.muted, align: 'center'});
      const pa = [], pb = []; for (let x = 0; x <= 364; x += 2) { pa.push([X(x), Yh(noonAlt(x))]); pb.push([X(x), Yd(dayLen(x))]); }
      line(c, pa, rgba(PAL.sun, 0.45 + 0.55 * hA), 3); line(c, pb, rgba(PAL.day, 0.35 + 0.65 * lA), 3, {dash: [8, 6]});
      stage.text('해 높이', 924, 1040, {size: 24, weight: 700, color: PAL.sun, align: 'right', alpha: 0.5 + 0.5 * hA});
      stage.text('낮 길이 (점선)', 924, 1070, {size: 24, weight: 700, color: PAL.day, align: 'right', alpha: 0.5 + 0.5 * lA});
      const x = X(d); line(c, [[x, g.y1 - 4], [x, g.y0 - 10]], rgba(T.light, 0.5), 1.5); circle(c, x, Yh(noonAlt(d)), 6, PAL.sun); circle(c, x, Yd(dayLen(d)), 6, PAL.day);
    });
  },
};

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  const L = titleList(ctx.scene.id, ctx.tl), a = smooth(ctx.scene.p / 0.04);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const q = k > 0 ? smooth((t - L[k][0]) / 0.5) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && q < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - q), a * (1 - q));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * q : a, a * q);
  progressBar(stage, t, ctx.tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// =====================================================================================================
export function soundEvents(tl) {
  const m = model(tl), r = (x, dd = 3) => +x.toFixed(dd), ev = [], at = ref => tl.at(ref);
  const squeeze = P => P.filter((q, i) => i === 0 || i === P.length - 1 || q.slice(1).some((v, k) => v !== P[i - 1][k + 1] || v !== P[i + 1][k + 1]));
  const env = (tt, t0, t1, fi = 0.25, fo = 0.4) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const chirpTable = (t0, t1, f, amp, dt = 0.05) => { const P = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) P.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); P[P.length - 1][2] = 0; return squeeze(P); };
  const noiseTable = (t0, t1, amp, dt = 0.05) => { const P = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) P.push([r(tt - t0), r(clamp(amp(tt)), 4)]); P[P.length - 1][1] = 0; return squeeze(P); };
  // calendar: one soft tick per month boundary crossed by any date sweep; pitch = noon altitude of that date (×2 register)
  const T0 = m.ticks[0].t;
  ev.push({id: 'month_ticks', at: r(T0, 4), kind: 'custom', params: {gain_db: -29, layers: m.ticks.map(x => ({kind: 'tick', offset: r(x.t - T0, 4), params: {freq: r(2 * altPitch(noonAlt(x.d)), 1), decay: 0.045, click: 0.2}}))},
    model: {n: m.keys.length, ticks: m.ticks.length, terms: m.terms.length, t_last: r(m.keys[m.keys.length - 1][0], 4), map: 'tick at each month boundary; freq = 2 × altPitch(noon altitude)'},
    means: `날짜가 움직이는 동안 달이 바뀔 때마다 작은 틱 — ${m.ticks.length}번. 음높이 = 그날 서울 한낮 해 높이 (해가 높을수록 높은 음)`});
  // hook
  ev.push({id: 'belief', at: A.believe, kind: 'silent', means: '흔한 생각 카드가 나타나는 시각'});
  ev.push({id: 'markers', at: A.nearest, kind: 'tick', params: {freq: 990, decay: 0.08, gain_db: -25, repeat: 2, interval: 0.16, click: 0.2}, means: '근일점·원일점 표시가 나타남 (두 점)'});
  ev.push({id: 'lab_winter', at: A.winter, kind: 'silent', means: '"한겨울"·"한여름" 표시'});
  // origin s05: the noon altitude as pitch — rises, holds on "멈추고", falls after "되돌아서는"
  const o0 = at('s05') - 0.2, o1 = at('s05:end') + 0.15;
  ev.push({id: 'alt_s05', at: r(o0, 4), kind: 'chirp', params: {gain_db: -27, harmonics: [1, 0.3], fade: 0.05, points: chirpTable(o0, o1, tt => altPitch(noonAlt(m.date(tt))), tt => 0.8 * env(tt, o0, o1, 0.3, 0.45))},
    means: '서울 한낮 해 높이 → 음높이 (29° = 220 Hz, 76° = 440 Hz): 오르다가 "멈추고"에서 같은 음에 머물고 "되돌아서는"에서 내려감'});
  ev.push({id: 'lab_stop', at: A.stop, kind: 'silent', means: '"하지 — 해가 멈춰 선 날" 표시'});
  ev.push({id: 'lab_turn', at: A.turn, kind: 'silent', means: '"되돌아섬" 표시'});
  // origin s06: the shadow tip crosses the 13 solar-term lines (하지선 → 동지선)
  const TT0 = m.terms[0].t;
  ev.push({id: 'angbu_lines', at: r(TT0, 4), kind: 'custom', params: {gain_db: -26, layers: m.terms.map(x => ({kind: 'tick', offset: r(x.t - TT0, 4), params: {freq: r(2 * altPitch(noonAlt(x.d)), 1), decay: 0.06, click: 0.3}}))},
    means: `앙부일구 그림자 끝이 절기선을 지날 때마다 틱 — ${m.terms.length}번 (하지선 → 동지선), 음높이 = 그날 한낮 해 높이`});
  ev.push({id: 'lab_lines', at: A.lines13, kind: 'silent', means: '"절기선 13줄" 표시'});
  // essence: the two solstice Earths (pitch = Seoul noon altitude on that day)
  ev.push({id: 'june_hi', at: A.june, kind: 'tone', params: {freq: r(altPitch(H_JUN), 1), dur: 1.1, harmonics: [1, 0.3], attack: 0.12, gain_db: -27}, means: '6월 지구 강조: 북반구가 해 쪽 — 그날 서울 한낮 해 높이 76°의 음 (440 Hz)'});
  ev.push({id: 'dec_hi', at: A.dec, kind: 'tone', params: {freq: r(altPitch(H_DEC), 1), dur: 1.1, harmonics: [1, 0.3], attack: 0.12, gain_db: -27}, means: '12월 지구 강조: 북반구가 해 반대쪽 — 29°의 음 (220 Hz)'});
  // angle: the noon altitude as pitch while the Sun moves on its arc
  const g0 = at(A.seoul) - 0.4, g1 = at(A.deg29) + 1.3;
  ev.push({id: 'alt_tone', at: r(g0, 4), kind: 'chirp', params: {gain_db: -27, harmonics: [1, 0.3], fade: 0.05, points: chirpTable(g0, g1, tt => altPitch(noonAlt(m.date(tt))), tt => 0.8 * env(tt, g0, g1, 0.3, 0.6))},
    means: '한낮 해 높이 → 음높이 (같은 대응): 하지 76° 높은 음, 동지 29° 한 옥타브 낮은 음'});
  ev.push({id: 'lab_beam', at: A.same, kind: 'silent', means: '같은 폭의 햇빛 다발이 나타남'});
  ev.push({id: 'lab_twice', at: A.twice, kind: 'tick', params: {freq: 660, decay: 0.08, gain_db: -26, repeat: 2, interval: 0.2, click: 0.15}, means: '발자국 비교 ×1 → ×2 (두 번)'});
  ev.push({id: 'lab_less', at: A.less, kind: 'silent', means: '"땅 한 곳에 닿는 햇빛 약 절반" 표시'});
  ev.push({id: 'shadow_cmp', at: A.shadowS, kind: 'tick', params: {freq: 1200, decay: 0.05, gain_db: -26, click: 0.3}, means: '여름·겨울 그림자 비교가 나타남 (딸깍)'});
  ev.push({id: 'seven', at: A.seven, kind: 'tick', params: {freq: 880, decay: 0.07, gain_db: -25, repeat: 2, interval: 0.14, click: 0.2}, means: '"약 7배" 표시'});
  // daylength: a 'daylight' tone that sounds only while Seoul is on the day side during each spun day
  for (const [i, [s0, s1, dd]] of m.spins.entries()) {
    const D = dayLen(dd), isDay = tt => Math.abs(((m.tau(tt) % 24) + 24) % 24 - 12) < D / 2, dt = 0.02, P = [];
    for (let tt = s0; tt <= s1 + 1e-6; tt += dt) {
      let amp = 0; for (let k = -3; k <= 3; k++) amp += isDay(tt + k * dt) ? 1 : 0;
      P.push([r(tt - s0), 330, r(0.75 * amp / 7, 4)]);
    }
    P[0][2] = 0; P[P.length - 1][2] = 0;
    ev.push({id: i ? 'day_dec' : 'day_jun', at: r(s0, 4), kind: 'chirp', params: {gain_db: -27, harmonics: [1, 0.25], fade: 0.02, points: squeeze(P)},
      means: `서울이 낮인 동안만 울리는 같은 높이의 '낮' 음 — 지구가 한 바퀴 도는 3초 중 ${dateLabel(dd)}은 ${fmtH(D)}만큼 (길이로 비교)`});
  }
  ev.push({id: 'lab_bar', at: A.day, kind: 'silent', means: '6월 21일 24시간 막대'});
  ev.push({id: 'lab_dec', at: A.solsD, kind: 'silent', means: '12월 22일 24시간 막대'});
  ev.push({id: 'five', at: A.five, kind: 'tick', params: {freq: 880, decay: 0.07, gain_db: -26, click: 0.2}, means: '"약 5시간 차이" 표시'});
  // energy: insolation → loudness of the same noise band; then the distance-only effect through the same mapping
  const QB = {low: 700, high: 3200};
  const e0 = at('s14') - 0.15, e1 = at(A.hajiE) + 0.1;
  ev.push({id: 'insol_noise', at: r(e0, 4), kind: 'env_noise', params: {...QB, gain_db: -21, fade: 0.05, points: noiseTable(e0, e1, tt => 0.9 * insol(Math.min(m.date(tt), 365)) / Q_JUN * env(tt, e0, e1, 0.2, 0.25))},
    means: '커서 날짜의 서울 하루 햇빛 → 잡음 크기 (482 W/m² = 기준, 174 W/m² ≈ −9 dB)'});
  const f0 = at('s15') - 0.1, f1 = at(A.pct3) + 1.7;
  ev.push({id: 'dist_noise', at: r(f0, 4), kind: 'env_noise', params: {...QB, gain_db: -21, fade: 0.05, points: noiseTable(f0, f1, tt => 0.9 * qDist(m.date(tt)) / Q_JUN * env(tt, f0, f1, 0.2, 0.25))},
    means: '같은 대응으로 거리만의 효과 (연평균 × 1/r²): 한 해 내내 거의 같은 크기 (±0.3 dB)'});
  ev.push({id: 'lab_peak', at: A.hajiE, kind: 'silent', means: '하지 482 표시'});
  ev.push({id: 'lab_trough', at: A.dongE, kind: 'silent', means: '동지 174 표시'});
  ev.push({id: 'ratio', at: A.three, kind: 'tick', params: {freq: 880, decay: 0.08, gain_db: -25, repeat: 2, interval: 0.15, click: 0.2}, means: '"약 2.8배" 표시'});
  ev.push({id: 'lab_pct3', at: A.pct3, kind: 'silent', means: '"약 3.4% 더 멂" 표시'});
  ev.push({id: 'pct7', at: A.pct7, kind: 'tick', params: {freq: 660, decay: 0.08, gain_db: -26, click: 0.2}, means: '"거리 효과 약 7%" 표시'});
  // lag: temperature → pitch while the cursor goes 하지 → 8월 5일 → 10월
  ev.push({id: 'sun_peak', at: A.sunPeak, kind: 'tick', params: {freq: 990, decay: 0.07, gain_db: -26, click: 0.2}, means: '햇빛 최고(하지) 표시'});
  ev.push({id: 'temp_peak', at: A.aug, kind: 'tick', params: {freq: 740, decay: 0.08, gain_db: -26, click: 0.2}, means: '기온 최고(8월) 표시'});
  const l0 = at('s17') - 0.1, l1 = at(A.lagW) + 1.2;
  ev.push({id: 'temp_tone', at: r(l0, 4), kind: 'chirp', params: {gain_db: -27, harmonics: [1, 0.35, 0.12], fade: 0.05, points: chirpTable(l0, l1, tt => tempPitch(temp(m.date(tt))), tt => 0.75 * env(tt, l0, l1, 0.3, 0.5))},
    means: '커서 날짜의 서울 기온 모형 → 음높이 (−1.9 °C = 196 Hz, 26.1 °C = 392 Hz): 하지가 지나도 8월 5일까지 계속 오르다가 내려감'});
  ev.push({id: 'lab_lag', at: A.lagW, kind: 'silent', means: '"약 한 달 반" 강조'});
  // south: noon altitude → pitch (same mapping as the angle scene)
  ev.push({id: 'seoul_sun', at: ['south', 0.4], kind: 'tone', params: {freq: r(altPitch(noonAlt(D_DEC, SEOUL.lat)), 1), dur: 1.0, harmonics: [1, 0.3], attack: 0.1, gain_db: -27}, means: '서울 12월 한낮 해 29° → 220 Hz'});
  ev.push({id: 'lab_hemi', at: A.seasonsOpp, kind: 'silent', means: '"북반구 · 겨울 / 남반구 · 여름" 표시'});
  ev.push({id: 'sydney_sun', at: A.aus, kind: 'tone', params: {freq: r(altPitch(noonAlt(D_DEC + 3, SYDNEY.lat)), 1), dur: 1.0, harmonics: [1, 0.3], attack: 0.1, gain_db: -27}, means: `시드니 12월 한낮 해 ${Math.round(noonAlt(D_DEC + 3, SYDNEY.lat))}° → 같은 대응의 높은 음`});
  // myth / close
  ev.push({id: 'lab_if', at: A.ifDist, kind: 'silent', means: '"거리가 원인이라면" 가정 줄'});
  ev.push({id: 'lab_nh', at: A.nh, kind: 'silent', means: '두 반구 지구본'});
  ev.push({id: 'lab_sh', at: A.sh, kind: 'silent', means: '"남반구 · 여름" 표시'});
  ev.push({id: 'myth_no', at: A.sh, kind: 'tick', params: {freq: 520, decay: 0.1, gain_db: -24, repeat: 2, interval: 0.12}, means: '오해에 줄을 그음 → "아니다"'});
  ev.push({id: 'lab_alt', at: A.alt, kind: 'silent', means: '해 높이 계기 강조'});
  ev.push({id: 'lab_len', at: A.len, kind: 'silent', means: '낮 길이 계기 강조'});
  ev.push({id: 'close_swell', at: A.together, kind: 'swell', params: {freqs: [220, 330, 440], dur: 1.8, gain_db: -26}, means: '정리: 기울기가 해 높이와 낮 길이를 함께 바꿈'});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음(사용자 결정). 모든 사건은 `node episodes/seasons/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형(날짜 d(t), 해 높이, 낮 길이, 일사량, 기온 모형)에서 써 넣습니다. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const m = model(tl);
  console.log(`events: ${sound.events.length}; date keys ${m.keys.length}; month ticks ${m.ticks.length}; solar-term crossings ${m.terms.length}`);
  console.log(`D_MAR ${D_MAR.toFixed(2)} (${dateLabel(D_MAR)}) D_JUN ${D_JUN.toFixed(2)} (${dateLabel(D_JUN)}) D_SEP ${D_SEP.toFixed(2)} (${dateLabel(D_SEP)}) D_DEC ${D_DEC.toFixed(2)} (${dateLabel(D_DEC)}) aphelion ${D_APH.toFixed(2)}`);
  console.log(`noon alt ${H_JUN.toFixed(2)} / ${H_DEC.toFixed(2)} / ${H_MAR.toFixed(2)}; shadow ${shadowLen(H_JUN).toFixed(3)} / ${shadowLen(H_DEC).toFixed(3)} (×${(shadowLen(H_DEC) / shadowLen(H_JUN)).toFixed(2)}); spread ×${(spreadOf(H_DEC) / spreadOf(H_JUN)).toFixed(3)}`);
  console.log(`day ${dayLen(D_JUN).toFixed(2)} / ${dayLen(D_DEC).toFixed(2)} h; Q ${Q_JUN.toFixed(1)} / ${Q_DEC.toFixed(1)} (×${(Q_JUN / Q_DEC).toFixed(2)}); Qmean ${Q_MEAN.toFixed(1)}; dist effect ${DIST_EFFECT.toFixed(4)}; Sydney noon ${noonAlt(D_DEC + 3, SYDNEY.lat).toFixed(1)}° day ${dayLen(D_DEC + 3, SYDNEY.lat).toFixed(2)} h`);
}
