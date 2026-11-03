// Episode scenes — "지구 자전축의 느린 원 — 세차운동과 장동"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - ONE state variable for the sky and the axis: the year y(t) (keyed, eased schedule anchored to narration words,
//    yearKeys). The north celestial pole sits at ecliptic latitude 90° − ε and ecliptic longitude
//    λ = 90° − 360°·(y − 2000)/25 772 (J2000 star-fixed ecliptic; constant rate 50.29″/yr, ε = 23.44° held fixed).
//    The same λ is the azimuth of the axis lean in every 3D Earth view, so picture, dials, sky disc and sound agree.
//  - Nutation: only the 18.6-yr term, Δε = 9.2″ cos Ω, Δψ = −17.2″ sin Ω, Ω = 125.04° − 360°·(y − 2000)/18.6
//    (lunar ascending node; regresses = clockwise seen from the ecliptic north pole). Drawn exaggerated.
//  - Moon-orbit/equator angle θ: cos θ = cos ε cos i − sin ε sin i cos Ω (i = 5.14°) → 18.3° … 28.6°; the Moon's
//    twisting force is shown ∝ sin 2θ (relative bar, no numbers).
//  - Climate scene: the orbit (true eccentricity 0.0167) is held fixed with perihelion on the left; the axis lean turns
//    relative to it at the climatic-precession rate (360°/21 000 yr, which includes the slow turning of the orbit).
//    Today the December solstice is 12.9° before perihelion; 11 000 yr ago the June solstice was near perihelion.
//  - Sky disc: azimuthal-equidistant map centred on the north ecliptic pole, seen from the ground looking up
//    (ecliptic longitude increases clockwise on the disc). Seen from below, the pole therefore moves counter-clockwise
//    among the stars, while the axis cone seen from above the ecliptic north pole turns clockwise (both drawn).
//  - Globe: pipeline/render/globe.mjs (moved there from episodes/seasons for this third globe episode).
//  - Sound: node episodes/precession/scenes.mjs --emit-sound [--timeline outputs/precession/narration/timeline.json]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, TAU, rand, loadTimeline,
} from '../../pipeline/render/index.mjs';
import {D2R, cross, unit, dot, loadLand, axisView, drawGlobe, axisTip, squash, obliqueCam} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = 'noturno';
export const captionLayout = {};
const LAND = loadLand(path.join(HERE, 'land.json'));   // Natural Earth 1:110m (public domain), copy of episodes/seasons/land.json

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const EPS = 23.44, P_PREC = 25772, RATE = 360 / P_PREC;       // deg, yr, deg/yr (= 50.29″/yr)
export const NUT_EPS = 9.2, NUT_PSI = 17.2, P_NODE = 18.6, OMEGA_2000 = 125.04, I_MOON = 5.14;
export const P_CLIM = 21000, R_EQ = 6378, R_POL = 6357, MOON_DIAM = 1860;
export const NOD_RATE = 4.6;                                          // yr per second of film in the nod scene
export const meanLam = y => 90 - RATE * (y - 2000);                  // ecliptic longitude of the mean north celestial pole
export const nodeLon = y => OMEGA_2000 - 360 * (y - 2000) / P_NODE;
export const dEps = y => NUT_EPS * Math.cos(nodeLon(y) * D2R);       // ″
export const dPsi = y => -NUT_PSI * Math.sin(nodeLon(y) * D2R);      // ″
/** pole position (ecliptic λ, distance ρ from the ecliptic pole), nutation multiplied by kn (0 = mean pole) */
export const pole = (y, kn = 0) => ({lam: meanLam(y) - kn * dPsi(y) / 3600, rho: EPS + kn * dEps(y) / 3600});
export const leanAz = y => 90 + meanLam(y) - meanLam(2026);           // 3D views: lean toward screen right in 2026
export const moonEqAngle = y => Math.acos(Math.cos(EPS * D2R) * Math.cos(I_MOON * D2R) - Math.sin(EPS * D2R) * Math.sin(I_MOON * D2R) * Math.cos(nodeLon(y) * D2R)) / D2R;
export const TH_MIN = EPS - I_MOON, TH_MAX = EPS + I_MOON;
export const moonTorque = y => Math.sin(2 * moonEqAngle(y) * D2R) / Math.sin(2 * TH_MAX * D2R);
const TQ_MIN = Math.sin(2 * TH_MIN * D2R) / Math.sin(2 * TH_MAX * D2R);
export const torqueNorm = y => (moonTorque(y) - TQ_MIN) / (1 - TQ_MIN);   // 0 … 1 over the 18.6-yr cycle
/** climate scene: lean azimuth (deg, from +X counter-clockwise) with perihelion along −Y */
export const climLean = y => -90 - 12.94 + 360 * (2026 - y) / P_CLIM;
export const periDecl = y => Math.asin(Math.sin(EPS * D2R) * Math.cos((climLean(y) - 90) * D2R)) / D2R;
export const pitchOf = y => 220 * 2 ** ((y - 2026) / P_PREC);         // precession phase → pitch (one octave per turn)
const fmtYear = y => { const r = Math.round(y); return r < 0 ? `기원전 ${(-r).toLocaleString('en-US')}년` : `${r < 10000 ? r : r.toLocaleString('en-US')}년`; };

// ---- bright stars (J2000 RA h m s, Dec ° ′ ″, V mag) → ecliptic (ε2000 = 23.4393°) ----
const STARS_RAW = [
  ['polaris', 2, 31, 49.1, 89, 15, 51, 1.98], ['yildun', 17, 32, 12.9, 86, 35, 11, 4.35], ['epsUMi', 16, 45, 58.2, 82, 2, 14, 4.21],
  ['zetaUMi', 15, 44, 3.5, 77, 47, 40, 4.29], ['kochab', 14, 50, 42.3, 74, 9, 20, 2.08], ['pherkad', 15, 20, 43.7, 71, 50, 2, 3.05], ['etaUMi', 16, 17, 30.3, 75, 45, 19, 4.95],
  ['dubhe', 11, 3, 43.7, 61, 45, 3, 1.79], ['merak', 11, 1, 50.5, 56, 22, 57, 2.37], ['phecda', 11, 53, 49.8, 53, 41, 41, 2.44], ['megrez', 12, 15, 25.6, 57, 1, 57, 3.31],
  ['alioth', 12, 54, 1.7, 55, 57, 35, 1.77], ['mizar', 13, 23, 55.5, 54, 55, 31, 2.27], ['alkaid', 13, 47, 32.4, 49, 18, 48, 1.86],
  ['caph', 0, 9, 10.7, 59, 8, 59, 2.28], ['schedar', 0, 40, 30.4, 56, 32, 14, 2.24], ['gamCas', 0, 56, 42.5, 60, 43, 0, 2.15], ['ruchbah', 1, 25, 49.0, 60, 14, 7, 2.66], ['segin', 1, 54, 23.7, 63, 40, 12, 3.35],
  ['lamDra', 11, 31, 24.2, 69, 19, 52, 3.82], ['kapDra', 12, 33, 29.0, 69, 47, 17, 3.87], ['thuban', 14, 4, 23.3, 64, 22, 33, 3.65], ['iotaDra', 15, 24, 55.8, 58, 57, 58, 3.29],
  ['thetaDra', 16, 1, 53.3, 58, 33, 55, 4.01], ['etaDra', 16, 23, 59.5, 61, 30, 51, 2.73], ['zetaDra', 17, 8, 47.2, 65, 42, 53, 3.17], ['deltaDra', 19, 12, 33.3, 67, 39, 41, 3.07],
  ['xiDra', 17, 53, 31.7, 56, 52, 21, 3.75], ['nuDra', 17, 32, 16.0, 55, 10, 23, 4.88], ['betaDra', 17, 30, 25.9, 52, 18, 5, 2.79], ['gamDra', 17, 56, 36.4, 51, 29, 20, 2.23],
  ['vega', 18, 36, 56.3, 38, 47, 1, 0.03], ['zetaLyr', 18, 44, 46.3, 37, 36, 18, 4.36], ['deltaLyr', 18, 54, 30.3, 36, 53, 55, 4.30], ['gamLyr', 18, 58, 56.6, 32, 41, 22, 3.25], ['betaLyr', 18, 50, 4.8, 33, 21, 46, 3.52],
  ['deneb', 20, 41, 25.9, 45, 16, 49, 1.25], ['sadr', 20, 22, 13.7, 40, 15, 24, 2.23], ['deltaCyg', 19, 44, 58.5, 45, 7, 51, 2.87], ['gienah', 20, 46, 12.7, 33, 58, 13, 2.48], ['albireo', 19, 30, 43.3, 27, 57, 35, 3.08],
  ['alderamin', 21, 18, 34.8, 62, 35, 8, 2.45], ['alfirk', 21, 28, 39.6, 70, 33, 39, 3.23], ['errai', 23, 39, 20.8, 77, 37, 57, 3.21], ['iotaCep', 22, 49, 40.8, 66, 12, 2, 3.52], ['zetaCep', 22, 10, 51.3, 58, 12, 5, 3.35],
];
const E2000 = 23.4393 * D2R;
export const STARS = Object.fromEntries(STARS_RAW.map(([id, h, m, s, d, dm, ds, mag]) => {
  const a = (h + m / 60 + s / 3600) * 15 * D2R, de = (d + dm / 60 + ds / 3600) * D2R;
  const beta = Math.asin(Math.sin(de) * Math.cos(E2000) - Math.cos(de) * Math.sin(E2000) * Math.sin(a));
  const lam = Math.atan2(Math.sin(a) * Math.cos(E2000) + Math.tan(de) * Math.sin(E2000), Math.cos(a));
  return [id, {id, lam: ((lam / D2R) + 360) % 360, beta: beta / D2R, mag}];
}));
const CLINES = [['polaris', 'yildun'], ['yildun', 'epsUMi'], ['epsUMi', 'zetaUMi'], ['zetaUMi', 'kochab'], ['kochab', 'pherkad'], ['pherkad', 'etaUMi'], ['etaUMi', 'zetaUMi'],
  ['dubhe', 'merak'], ['merak', 'phecda'], ['phecda', 'megrez'], ['megrez', 'dubhe'], ['megrez', 'alioth'], ['alioth', 'mizar'], ['mizar', 'alkaid'],
  ['caph', 'schedar'], ['schedar', 'gamCas'], ['gamCas', 'ruchbah'], ['ruchbah', 'segin'],
  ['lamDra', 'kapDra'], ['kapDra', 'thuban'], ['thuban', 'iotaDra'], ['iotaDra', 'thetaDra'], ['thetaDra', 'etaDra'], ['etaDra', 'zetaDra'], ['zetaDra', 'deltaDra'], ['deltaDra', 'xiDra'],
  ['xiDra', 'gamDra'], ['gamDra', 'betaDra'], ['betaDra', 'nuDra'], ['nuDra', 'xiDra'],
  ['vega', 'zetaLyr'], ['zetaLyr', 'betaLyr'], ['betaLyr', 'gamLyr'], ['gamLyr', 'deltaLyr'], ['deltaLyr', 'zetaLyr'],
  ['deneb', 'sadr'], ['sadr', 'albireo'], ['deltaCyg', 'sadr'], ['sadr', 'gienah'],
  ['alderamin', 'alfirk'], ['alfirk', 'errai'], ['errai', 'iotaCep'], ['iotaCep', 'zetaCep'], ['zetaCep', 'alderamin'], ['alfirk', 'iotaCep']];
/** pole closest-approach years in this model (for labels/checks) */
export const POLE_YEARS = {polaris: 2000 + (90 - STARS.polaris.lam) / RATE, thuban: 2000 + (90 - STARS.thuban.lam) / RATE, vega: 2000 + (90 - (STARS.vega.lam - 360)) / RATE};

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  axisW: W('s01', '자전축이'), turnW: W('s01', '고개를'), prec: W('s01', '세차운동과,'), nodW: W('s01', '끄덕이는'), jangdong: W('s01', '장동에'),
  now: W('s02', '지금은'), polaris: W('s02', '북극성이'), base: W('s02', '기준이지만,'), yrs: W('s02', '약'), lyra: W('s02', '거문고자리의'), vega: W('s02', '베가가'), take: W('s02', '넘겨받습니다.'),
  sechaW: W('s03', '세차는'), yearly: W('s03', '해마다'), diff: W('s03', '차이라는'), meaning: W('s03', '뜻입니다.'), bc: W('s03', '기원전'), hipp: W('s03', '히파르코스가'),
  starPos: W('s03', '별의'), old: W('s03', '옛'), compare: W('s03', '견주다'), first: W('s03', '처음'),
  joseon: W('s04', '조선'), chart: W('s04', '천상열차분야지도를'), terms: W('s04', '절기마다'), south: W('s04', '남쪽'), starsW: W('s04', '별이'), goguryeo: W('s04', '고구려'), differ: W('s04', '달라져'), fix: W('s04', '바로잡았습니다.'),
  jd: W('s05', '장동의'), nut: W('s05', '뉴테이션은'), nodL: W('s05', '끄덕인다는'), latin: W('s05', '라틴어에서'), y1748: W('s05', '천칠백사십팔년'), bradley: W('s05', '브래들리가'),
  topW: W('s06', '팽이입니다.'), spinning: W('s06', '돌고'), pull: W('s06', '쓰러뜨리려고'), pulled: W('s06', '당기면,'), fall: W('s06', '쓰러지는'), instead: W('s06', '대신'), side: W('s06', '옆으로'), turns: W('s06', '돌아갑니다.'),
  notBall: W('s07', '공이'), notW: W('s07', '아닙니다.'), spin7: W('s07', '자전'), equator: W('s07', '적도가'), km21: W('s07', '이십일킬로미터'),
  tilt: W('s08', '축이'), deg: W('s08', '이십삼점사도'), band: W('s08', '불룩한'), plane: W('s08', '달과'), off: W('s08', '비켜나'),
  near: W('s09', '가까운'), harder: W('s09', '더'), pullW: W('s09', '당겨,'), upright: W('s09', '바로'), twist: W('s09', '비트는'), give: W('s09', '줍니다.'), moonShare: W('s09', '달의'), two: W('s09', '두'),
  but: W('s10', '하지만'), notFall: W('s10', '쓰러지지'), cone: W('s10', '원뿔을'), slowly: W('s10', '천천히'), turnOne: W('s10', '한'), yrs26: W('s10', '이만'), takes: W('s10', '걸립니다.'),
  skyPole: W('s11', '하늘의'), move: W('s11', '옮겨'), pyramid: W('s11', '피라미드를'), dra: W('s11', '용자리의'), thuban: W('s11', '투반이'),
  circleW: W('s12', '원'), nodS: W('s12', '끄덕입니다.'), moonOrbit: W('s12', '궤도가'), five: W('s12', '오도'), dir: W('s12', '방향이'), y186: W('s12', '십팔점육년마다'),
  torque13: W('s13', '비트는'), stronger: W('s13', '세졌다'), weaker: W('s13', '약해져서,'), fullMoon: W('s13', '보름달'), d200: W('s13', '이백분의'),
  seasonW: W('s14', '계절의'), nowS: W('s14', '지금은'), jan: W('s14', '일월에'), ago: W('s14', '약 만 천'), nh: W('s14', '북반구'), summer: W('s14', '여름에'),
  manyears: W('s15', '수만'), ice: W('s15', '빙하기의'), slowCircle: W('s15', '느린'),
  scope: W('s16', '망원경과'), sat: W('s16', '인공위성의'), calc: W('s16', '계산할'), precW: W('s16', '세차와'), nutW: W('s16', '장동을'), exact: W('s16', '정확합니다.'),
  mythTilt: W('s17', '기울기가'), notM: W('s17', '아닙니다.'), tiltSame: W('s17', '기울기는'), same: W('s17', '그대로'), dirM: W('s17', '방향이'),
  q1: W('s18', '달과'), pullC: W('s18', '당기고,'), spinC: W('s18', '돌고'), turnC: W('s18', '고개를'), slowC: W('s18', '느린'), poleC: W('s18', '북극을'),
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
/** the year schedule (one list for the whole episode). flags: 'turn' = shown time-lapse of the pole/axis (pitch sweep +
 *  2000-year ticks), 'ticks' = ticks only. 'jump' only where the pole/axis phase is unchanged or hidden. */
export function yearKeys(tl) {
  const at = r => tl.at(r), sc = id => tl.scene(id), K = [], k = (t, v, e = 'io', f) => K.push([t, v, e, f]);
  k(0, 2026); k(at(A.yrs) - 0.05, 2026, 'lin'); k(at(A.vega) + 0.5, 14000, 'io', 'turn');                   // hook: now → Vega
  k(sc('origin').start, 2026, 'jump');                                                                         // sky gone
  k(at(A.give) + 0.2, 2026, 'lin'); k(sc('bulge').end, 2120, 'i');                                             // bulge: starts to move
  k(at(A.cone) - 0.3, 2340, 'lin'); k(at(A.takes) + 0.25, 2026 + P_PREC, 'ramp', 'turn');                       // cone: one full turn
  k(at('s11') - 0.4, 2026, 'jump');                                                                            // same phase
  k(at(A.move) - 0.1, 2026, 'lin'); k(at(A.thuban) - 0.45, -2700, 'io', 'turn');                              // back to Thuban
  const n0 = sc('nod').start; k(n0, 2026, 'jump'); k(n0 + 0.3, 2026, 'lin'); k(sc('nod').end, 2026 + NOD_RATE * (sc('nod').end - n0 - 0.3), 'lin');
  k(sc('climate').start, 2026, 'jump'); k(at(A.ago) - 0.3, 2026, 'lin'); k(at(A.summer) + 0.4, 2026 - 11000, 'io', 'ticks');
  k(sc('use').start, 2026, 'jump');
  k(sc('myth').start, 2026, 'jump'); k(at(A.tiltSame) - 0.2, 2026, 'lin'); k(sc('myth').end - 0.3, 2026 + 0.85 * P_PREC, 'ramp');
  k(sc('close').start, 2026, 'jump'); k(sc('close').start + 0.6, 2026, 'lin'); k(tl.duration, 2026 + 0.35 * P_PREC, 'ramp');
  return K;
}
const TICK_YR = 2000;                                                // one soft tick per 2000-year boundary
const MODELS = new WeakMap();
/** everything time-dependent that picture and sound share */
export function model(tl) {
  let m = MODELS.get(tl); if (m) return m;
  const keys = yearKeys(tl), year = keyed(keys), ticks = [], turns = [];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1], [t1, v1, e, flag] = keys[i];
    if (e === 'jump' || !flag) continue;
    if (flag === 'turn') turns.push([t0, t1]);
    let prev = Math.floor(v0 / TICK_YR);
    for (let tt = t0 + 0.004; tt <= t1 + 1e-9; tt += 0.004) { const k = Math.floor(year(tt) / TICK_YR); if (k !== prev) { ticks.push({t: tt, y: (v1 > v0 ? k : prev) * TICK_YR}); prev = k; } }
  }
  m = {keys, year, ticks, turns};
  MODELS.set(tl, m);
  return m;
}

// =====================================================================================================
// UI helpers (centred header, panels, tags)
// =====================================================================================================
const PAL = {axis: '#ECE4D6', pole: '#FFC46B', band: '#F2A65A', moon: '#C9CCD3', sun: '#FFD889', cool: '#8EC5F0', warm: '#F2A65A', mark: '#FFE2C4',
  sky0: '#0B2333', sky1: '#030E16', star: '#F4F1E8', line: '#8FB3C4', top0: '#1E3540', top1: '#9CC3CF', top2: '#E6F3F6', stripe: '#E08A55', nod: '#9FD9C8'};
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
function crossOut(c, x0, x1, y, q, col = '#FF8A5C') { if (q > 0) line(c, [[x0 - 6, y + 2], [lerp(x0 - 6, x1 + 6, easeOut(q)), y + 2]], rgba(col, 0.9), 4); }
function head(stage, kicker, title, aK, aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 940}));
}
export const titles = {
  hook: ['오늘의 주제 · 세차운동과 장동', '자전축의 느린 원'],
  origin: ['기원 · 이름과 발견', '歲差 — 해마다 생기는 차이'],
  essence: ['본질 · 제1원리', '돌고 있는 팽이는 옆으로 돈다'],
  bulge: ['메커니즘 ① 불룩한 적도', '달과 태양이 비트는 힘'],
  cone: ['메커니즘 ② 원뿔', '쓰러지는 대신 원을 그린다'],
  nod: ['메커니즘 ③ 장동', '18.6년마다 작은 끄덕임'],
  climate: ['현상 · 계절의 때', '근일점의 계절이 바뀐다'],
  use: ['사례 · 천체 좌표 계산', '세차와 장동을 넣어야 정확'],
  myth: ['오해 바로잡기', '기울기가 바뀌는 것일까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s04') - 0.5, '기원 · 조선의 하늘', '천상열차분야지도 · 1395'], [at('s05') - 0.5, '기원 · 끄덕임의 발견', '章動 — nutation']];
  if (id === 'cone') return [[-Infinity, ...titles.cone], [at('s11') - 0.5, '메커니즘 ② 하늘의 북극', '북극성은 바뀐다']];
  if (id === 'climate') return [[-Infinity, ...titles.climate], [at('s15') - 0.4, '현상 · 빙하기의 리듬', '느린 원이 한몫을 한다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'kyr_ticks'), m = M(ctx);
  const ok = e?.model && e.model.n === m.keys.length && e.model.ticks === m.ticks.length && Math.abs(e.model.t_last - m.keys[m.keys.length - 1][0]) < 1e-3 && Math.abs(e.model.t0 - m.ticks[0].t) < 1e-3;
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/precession/scenes.mjs --emit-sound');
}
/** small "seen from above" dial: lean direction needle (azimuth az; screen right = az 90°, clockwise = az decreasing) */
function dirDial(stage, x, y, r, az, len, o = {}) {
  const {ctx: c} = stage, T = stage.theme;
  ring(c, x, y, r, rgba(T.border, 1), 2); ring(c, x, y, r * 0.55, rgba(T.border, 0.6), 1);
  for (let k = 0; k < 12; k++) { const a = k * 30 * D2R; line(c, [[x + r * 0.88 * Math.cos(a), y + r * 0.88 * Math.sin(a)], [x + r * Math.cos(a), y + r * Math.sin(a)]], rgba(T.muted, 0.7), 1.2); }
  if (o.sun) { glow(c, x + r, y, 16, PAL.sun, 0.5); circle(c, x + r, y, 6, PAL.sun); }      // Moon/Sun side (right)
  if (o.trail) {                                                                  // arc swept so far (clockwise)
    const a0 = o.trail[0], a1 = o.trail[1], pts = [];
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3));
    for (let i = 0; i <= n; i++) { const az2 = lerp(a0, a1, i / n) * D2R; pts.push([x + r * 0.78 * Math.sin(az2), y + r * 0.78 * Math.cos(az2)]); }
    line(c, pts, rgba(PAL.pole, 0.55), 3);
  }
  circle(c, x, y, 4, T.ink);
  const a = az * D2R, tip = [x + r * 0.8 * len * Math.sin(a), y + r * 0.8 * len * Math.cos(a)];
  if (len > 0.05) arrow(c, [x, y], tip, PAL.axis, 3, {head: 11});
}

// =====================================================================================================
// Sky disc (north ecliptic pole at the centre, seen from the ground looking up)
// =====================================================================================================
const SKY = {degR: 48, top: 90};
const skyXY = (o, lam, beta) => { const rho = 90 - beta, ph = (lam - SKY.top) * D2R, k = o.R / SKY.degR; return [o.cx + k * rho * Math.sin(ph), o.cy - k * rho * Math.cos(ph)]; };
const starXY = (o, id) => skyXY(o, STARS[id].lam, STARS[id].beta);
const poleXY = (o, y, kn = 0) => { const p = pole(y, kn); return skyXY(o, p.lam, 90 - p.rho); };
const starR = mag => clamp(1.3 + (3.7 - mag) * 0.95, 1.1, 5.0);
/** o: {cx, cy, R, a, lines, circle (alpha of the dashed precession circle), ticks, arc: [y0, y1] traced path, nep (alpha)} */
function skyDisc(stage, t, o) {
  const {ctx: c} = stage, T = stage.theme, {cx, cy, R} = o, k = R / SKY.degR;
  withAlpha(c, o.a ?? 1, () => {
    glow(c, cx, cy, R * 1.25, '#3D6E8C', 0.08);
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU);
    const g = c.createRadialGradient(cx, cy - R * 0.15, R * 0.05, cx, cy, R); g.addColorStop(0, PAL.sky0); g.addColorStop(1, PAL.sky1);
    c.fillStyle = g; c.fill(); c.clip();
    for (let d = 10; d < SKY.degR; d += 10) ring(c, cx, cy, d * k, rgba(T.border, 0.45), 1);
    for (const [p, q] of CLINES) line(c, [starXY(o, p), starXY(o, q)], rgba(PAL.line, 0.26 * (o.lines ?? 1)), 1.3);
    if (o.circle > 0) {
      c.save(); c.setLineDash([3, 7]); ring(c, cx, cy, EPS * k, rgba(PAL.pole, 0.55 * o.circle), 1.8); c.restore();
      if (o.ticks) for (let yy = -11000; yy <= 14000; yy += 1000) {                 // 26 millennium ticks (< one turn)
        const ph = (meanLam(yy) - SKY.top) * D2R, r0 = (EPS - 0.7) * k, r1 = (EPS + 0.7) * k;
        line(c, [[cx + r0 * Math.sin(ph), cy - r0 * Math.cos(ph)], [cx + r1 * Math.sin(ph), cy - r1 * Math.cos(ph)]], rgba(PAL.pole, 0.4 * o.circle * o.ticks), 1.4);
      }
    }
    if (o.arc && Math.abs(o.arc[1] - o.arc[0]) > 1) {
      const pts = [], n = Math.ceil(Math.abs(o.arc[1] - o.arc[0]) / 60);
      for (let i = 0; i <= n; i++) pts.push(poleXY(o, lerp(o.arc[0], o.arc[1], i / n)));
      line(c, pts, rgba(PAL.pole, 0.9 * (o.arcA ?? 1)), 3);
    }
    if (o.nep > 0) withAlpha(c, o.nep, () => { line(c, [[cx - 8, cy], [cx + 8, cy]], rgba(T.muted, 0.9), 1.5); line(c, [[cx, cy - 8], [cx, cy + 8]], rgba(T.muted, 0.9), 1.5); });
    for (const s of Object.values(STARS)) {
      const [x, y] = skyXY(o, s.lam, s.beta), r = starR(s.mag), tw = 0.85 + 0.15 * Math.sin(t * 1.3 + rand(s.lam) * 6);
      if (s.mag < 3) glow(c, x, y, r * 5, '#DCE8FF', 0.16 * tw);
      circle(c, x, y, r, s.id === 'vega' ? '#E8F0FF' : PAL.star);
    }
    c.restore();
    ring(c, cx, cy, R, rgba(T.border, 1), 2); ring(c, cx, cy, R + 7, rgba(T.border, 0.45), 1);
  });
}
function poleMarker(c, x, y, a = 1, wob = 0) {
  withAlpha(c, a, () => {
    glow(c, x, y, 34, PAL.pole, 0.35);
    ring(c, x, y, 12, PAL.pole, 2.5);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) line(c, [[x + dx * 16, y + dy * 16], [x + dx * 24, y + dy * 24]], PAL.pole, 2.5);
  });
}
/** constellation names (hook only): [text, star ids to average, dx, dy] */
const CNAMES = [['작은곰자리', 60, -38], ['북두칠성', 250, -188], ['카시오페이아', -240, -288], ['용자리', 84, 50], ['거문고자리', -70, 282], ['백조자리', -225, 215], ['케페우스', -250, -90]];
function constellationNames(stage, o, a, hide = {}) {
  const k = o.R / 360;
  for (const [s, dx, dy] of CNAMES) stage.text(s, o.cx + dx * k, o.cy + dy * k, {size: 24, weight: 500, color: rgba('#9FB8C4', 0.85), align: 'center', alpha: a * (1 - (hide[s] || 0))});
}

// =====================================================================================================
// 3D Earth stage (ecliptic plane, oblate globe, axis, cone) — used by bulge / cone / myth / close
// World: X, Y = ecliptic plane, Z = ecliptic north. obliqueCam: +Y → screen right, +X → toward the viewer.
// =====================================================================================================
const axisWorld = (tau, az) => [Math.sin(tau * D2R) * Math.cos(az * D2R), Math.sin(tau * D2R) * Math.sin(az * D2R), Math.cos(tau * D2R)];
const spinLam = t => 30 - 9 * t;                                      // display spin: west → east (lam decreases)
function earthAt(cam, R, n, sunW, t, flat) {
  return axisView({cx: cam.cx, cy: cam.cy, R}, cam.vec(n), {spin: spinLam(t), sun: sunW ? cam.vec(sunW) : null, flat});
}
/** axis ends: from the (squashed) pole to an unsquashed tip at `len` radii; back end before the globe */
function axisPart(stage, V, which, len, o = {}) {
  const n = V.axis, northFront = n[2] >= 0, col = o.col ?? PAL.axis, w = o.w ?? Math.max(2.5, V.R / 40);
  for (const sg of [1, -1]) {
    if ((which === 'front') !== ((sg > 0) === northFront)) continue;
    const L = sg > 0 ? len : (o.lenS ?? len * 0.8), a = axisTip(V, 1, sg), b = axisTip(V, L, sg);
    if (sg > 0) arrow(stage.ctx, a, b, col, w, {head: Math.max(12, w * 4.5)}); else line(stage.ctx, [a, b], col, w);
  }
}
function earthWithAxis(stage, V, len, o = {}) {
  axisPart(stage, V, 'back', len, o);
  drawGlobe(stage, V, {land: LAND, grat: o.grat ?? 0.1, night: o.night ?? 0.45, band: o.band, equator: o.equator ?? 0.45});
  line(stage.ctx, [axisTip(V, 1, -1), axisTip(V, 1, 1)], rgba(PAL.axis, 0.3), Math.max(1.2, V.R / 70), {dash: [5, 5]});
  axisPart(stage, V, 'front', len, o);
}
/** the ecliptic plane as a ring (back half before the globe, front half after) */
function planeRing(stage, cam, rr, part, a, col = '#8AA0A6') {
  const pts = []; for (let i = 0; i <= 180; i++) { const u = i * 2 * D2R, p = cam.P(rr * Math.cos(u), rr * Math.sin(u), 0); pts.push(p); }
  const seg = pts.filter(p => (part === 'back') === (p[2] < 0)).map(p => [p[0], p[1]]);
  if (part === 'fill') { poly(stage.ctx, pts.map(p => [p[0], p[1]]), rgba(col, 0.07 * a)); return; }
  // split runs so the two halves do not get joined across
  let run = []; const flush = () => { if (run.length > 1) line(stage.ctx, run, rgba(col, 0.55 * a), 2); run = []; };
  for (const p of pts) { if ((part === 'back') === (p[2] < 0)) run.push([p[0], p[1]]); else flush(); }
  flush(); return seg;
}
/** points of the cone's tip circle (length L radii) from azimuth az0 to az1 */
function conePts(cam, L, tau, az0, az1) {
  const n = Math.max(2, Math.ceil(Math.abs(az1 - az0) / 3)), pts = [];
  for (let i = 0; i <= n; i++) { const w = axisWorld(tau, lerp(az0, az1, i / n)); pts.push(cam.P(w[0] * L, w[1] * L, w[2] * L)); }
  return pts;
}

// =====================================================================================================
// Spinning top (essence): body of revolution drawn as depth-ordered shaded slices
// =====================================================================================================
const TOP_PROF = (() => {
  const P = [[0, 0], [0.07, 0.05], [0.93, 0.84], [1.0, 0.93], [0.99, 1.03], [0.84, 1.11], [0.5, 1.165], [0.14, 1.19], [0.135, 1.74], [0.11, 1.82], [0, 1.84]];
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const out = [], N = 170;
  for (let j = 0; j <= N; j++) {
    const s = L.at(-1) * j / N; let i = 1; while (i < P.length - 1 && L[i] < s) i++;
    const q = (s - L[i - 1]) / (L[i] - L[i - 1]), dr = P[i][0] - P[i - 1][0], dh = P[i][1] - P[i - 1][1], l = Math.hypot(dr, dh);
    out.push({r: lerp(P[i - 1][0], P[i][0], q), h: lerp(P[i - 1][1], P[i][1], q), nr: dh / l, nh: -dr / l});
  }
  return out;
})();
function drawTop(stage, cam, theta, psi, spin, o = {}) {
  const {ctx: c} = stage, a = axisWorld(theta, psi), ps = psi * D2R;
  const b1 = [Math.cos(theta * D2R) * Math.cos(ps), Math.cos(theta * D2R) * Math.sin(ps), -Math.sin(theta * D2R)], b2 = cross(a, b1);
  const dview = [cam.ca * Math.cos(cam.yaw * D2R), -cam.ca * Math.sin(cam.yaw * D2R), cam.sa], Lw = unit([-0.35, 0.45, 0.85]);
  const La = dot(Lw, a), L1 = dot(Lw, b1), L2 = dot(Lw, b2), Lp = Math.hypot(L1, L2), aB = Math.atan2(L2, L1);
  const order = dot(a, dview) >= 0 ? TOP_PROF : [...TOP_PROF].reverse();
  const A0 = cam.P(0, 0, 0), A1 = cam.P(a[0], a[1], a[2]), al = Math.hypot(A1[0] - A0[0], A1[1] - A0[1]) || 1, perp = [-(A1[1] - A0[1]) / al, (A1[0] - A0[0]) / al];
  const at = (r, h, al) => { const ca = Math.cos(al), sa = Math.sin(al); return cam.P(h * a[0] + r * (ca * b1[0] + sa * b2[0]), h * a[1] + r * (ca * b1[1] + sa * b2[1]), h * a[2] + r * (ca * b1[2] + sa * b2[2])); };
  let prev = null;
  for (const s of order) {
    if (s.r < 0.004) { prev = null; continue; }
    const pts = []; for (let i = 0; i < 40; i++) pts.push(at(s.r, s.h, i / 40 * TAU));
    // shade across the silhouette (perpendicular to the projected axis) so neighbouring slices share colours
    const pb = at(s.r, s.h, aB), C0 = at(0, s.h, 0), rs = s.r * cam.k, sg = Math.sign((pb[0] - C0[0]) * perp[0] + (pb[1] - C0[1]) * perp[1]) || 1;
    const bri = clamp(s.nr * Lp + s.nh * La), dk = clamp(-s.nr * Lp + s.nh * La);
    const g = c.createLinearGradient(C0[0] + sg * perp[0] * rs, C0[1] + sg * perp[1] * rs, C0[0] - sg * perp[0] * rs, C0[1] - sg * perp[1] * rs);
    g.addColorStop(0, mix(PAL.top0, PAL.top2, 0.15 + 0.85 * bri)); g.addColorStop(0.55, mix(PAL.top0, PAL.top1, 0.25 + 0.6 * (bri + dk) / 2)); g.addColorStop(1, mix(PAL.top0, PAL.top1, 0.12 + 0.5 * dk));
    // the side band between this slice and the previous one (exact silhouette of the frustum; no gaps when seen side-on)
    if (prev) poly(c, [[prev.C[0] + perp[0] * prev.rs, prev.C[1] + perp[1] * prev.rs], [C0[0] + perp[0] * rs, C0[1] + perp[1] * rs], [C0[0] - perp[0] * rs, C0[1] - perp[1] * rs], [prev.C[0] - perp[0] * prev.rs, prev.C[1] - perp[1] * prev.rs]], g);
    poly(c, pts, g);
    prev = {C: C0, rs};
  }
  // spinning stripes on the rim's side surface (front-facing quads only)
  const H0 = 0.84, H1 = 1.0, rOf = h => { let i = 1; while (i < TOP_PROF.length - 1 && TOP_PROF[i].h < h) i++; return TOP_PROF[i].r; };
  for (let k = 0; k < 12; k += 2) for (let j = 0; j < 4; j++) {
    const a0 = spin * D2R + (k + j / 4) * TAU / 12, a1 = spin * D2R + (k + (j + 1) / 4) * TAU / 12, am = (a0 + a1) / 2;
    const nrm = [Math.cos(am) * b1[0] + Math.sin(am) * b2[0], Math.cos(am) * b1[1] + Math.sin(am) * b2[1], Math.cos(am) * b1[2] + Math.sin(am) * b2[2]];
    if (dot(nrm, dview) <= 0.02) continue;
    const lit = clamp(dot(nrm, Lw));
    poly(c, [at(rOf(H0), H0, a0), at(rOf(H0), H0, a1), at(rOf(H1), H1, a1), at(rOf(H1), H1, a0)], rgba(mix(PAL.stripe, '#FFD2B0', 0.4 * lit), 0.55 + 0.35 * lit));
  }
  // rim highlight (outline of the widest slice)
  const rim = []; for (let i = 0; i <= 48; i++) rim.push(at(1.0, 0.93, i / 48 * TAU)); line(c, rim, rgba('#EAF6F8', 0.35), 1.2);
  return {a, tipAt: L => cam.P(a[0] * L, a[1] * L, a[2] * L)};
}

// =====================================================================================================
// Scene parts
// =====================================================================================================
// ---- origin s03: 歲 / 差 cards + the equinox strip (equinox moves west among the stars) ----
function glyphCard(stage, x, y, glyph, reading, on, a) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    rect(c, x - 105, y, 210, 200, 12, rgba(T.plate, 0.95), on > 0.5 ? T.light : rgba(T.border, 1), on > 0.5 ? 2.5 : 1.5);
    stage.text(glyph, x, y + 88, {size: 108, weight: 700, color: mix(T.muted, T.ink, 0.35 + 0.65 * on), align: 'center'});
    stage.text(reading, x, y + 170, {size: 28, weight: 700, color: on > 0.5 ? T.light : T.muted, align: 'center'});
  });
}
const STRIP = {x0: 160, x1: 920, y: 830, pxDeg: 120};
const STRIP_STARS = Array.from({length: 26}, (_, i) => ({x: lerp(STRIP.x0 + 12, STRIP.x1 - 12, rand(i * 3.1 + 0.4)), dy: (rand(i * 7.7 + 1.3) - 0.5) * 120, m: rand(i * 5.3 + 2.2)}));
function equinoxStrip(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const yrsQ = easeInOut((t - at(A.old) - 0.05) / 1.5);                   // 150 years of time-lapse
  const shift = 150 * 50.3 / 3600 * STRIP.pxDeg;                             // ≈ 2.1° → px
  const xOld = 420, xNow = xOld + shift * yrsQ, starX = 760;
  const starA = fadeIn(t, at(A.starPos) - 0.1, 0.4), cmpA = fadeIn(t, at(A.compare) - 0.1, 0.5);
  withAlpha(c, a, () => {
    panel(c, T, 140, 650, 800, 360, 0.92);
    stage.text('춘분점: 해마다 약 50″씩 서쪽으로', 540, 690, {size: 28, weight: 700, color: T.ink, align: 'center'});
    c.save(); c.beginPath(); c.rect(142, 712, 796, 236); c.clip();
    line(c, [[STRIP.x0, STRIP.y], [STRIP.x1, STRIP.y]], rgba(PAL.sun, 0.35), 2);               // the ecliptic (Sun's path)
    for (const s of STRIP_STARS) { const r = 1.2 + 2.2 * s.m; glow(c, s.x, STRIP.y + s.dy, r * 4, '#DCE8FF', 0.1); circle(c, s.x, STRIP.y + s.dy, r, rgba(PAL.star, 0.55 + 0.4 * s.m)); }
    // the reference star
    withAlpha(c, starA, () => { glow(c, starX, STRIP.y - 30, 30, '#DCE8FF', 0.4); circle(c, starX, STRIP.y - 30, 5, '#FFFFFF'); ring(c, starX, STRIP.y - 30, 14, rgba(T.light, 0.8), 2); });
    // the equinox: old record (ghost) and the moving marker
    if (yrsQ > 0) { line(c, [[xOld, STRIP.y - 70], [xOld, STRIP.y + 70]], rgba(T.muted, 0.8), 2, {dash: [5, 5]}); }
    line(c, [[xNow, STRIP.y - 78], [xNow, STRIP.y + 78]], PAL.pole, 3); circle(c, xNow, STRIP.y, 7, PAL.pole);
    c.restore();
    stage.text('동', 176, 930, {size: 24, weight: 700, color: T.muted, align: 'left'});
    stage.text('서', 904, 930, {size: 24, weight: 700, color: T.muted, align: 'right'});
    stage.text('춘분점', xNow, 737, {size: 24, weight: 700, color: PAL.pole, align: 'center'});
    if (starA > 0) stage.text('별', starX, 737, {size: 24, weight: 700, color: T.light, align: 'center', alpha: starA});
    // the measured distance star ↔ equinox (old record vs new)
    if (yrsQ > 0) withAlpha(c, fadeIn(t, at(A.old) - 0.1, 0.3), () => {
      stage.text('옛 기록', xOld, 930, {size: 24, color: T.muted, align: 'center'});
      line(c, [[xOld, 958], [starX, 958]], rgba(T.muted, 0.7), 1.5, {dash: [4, 4]});
      line(c, [[xNow, 980], [starX, 980]], PAL.pole, 2.5);
      for (const x of [xNow, starX]) line(c, [[x, 972], [x, 988]], PAL.pole, 2.5);
    });
    if (cmpA > 0) tag(stage, `약 150년 → 약 ${(150 * 50.3 / 3600).toFixed(0)}° 어긋남`, 540, 1050, {size: 28, color: PAL.pole, border: PAL.pole, a: cmpA});
  });
}
// ---- origin s04: an elegant circular star map (schematic, not the real artwork) ----
const MAP_STARS = (() => {
  const out = [];
  for (let g = 0; g < 120; g++) {
    const ra = rand(g * 2.17 + 0.3) * 360, dec = lerp(-52, 86, Math.sqrt(rand(g * 4.91 + 1.7))), n = 2 + Math.floor(rand(g * 9.3) * 4), grp = [];
    for (let i = 0; i < n; i++) grp.push([ra + (rand(g * 13 + i * 1.9) - 0.5) * 9, clamp(dec + (rand(g * 17 + i * 2.3) - 0.5) * 7, -54, 88), 0.8 + rand(g * 5 + i) * 1.6]);
    out.push(grp);
  }
  return out;
})();
const MANSIONS = (() => { const a = []; let x = 0; for (let i = 0; i < 28; i++) { x += 360 / 28 * (0.55 + 0.9 * rand(i * 6.1 + 2)); a.push(x); } const s = 360 / x; return a.map(v => v * s); })();
function starMap(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), cx = 540, cy = 668, R = 288, k = R / 145;
  const P = (ra, dec, rot = 0) => { const rho = 90 - dec, ph = (ra + rot) * D2R; return [cx + k * rho * Math.sin(ph), cy - k * rho * Math.cos(ph)]; };
  const oldA = fadeIn(t, at(A.terms) - 0.1, 0.5), merA = fadeIn(t, at(A.south) - 0.1, 0.5), ringA = fadeIn(t, at(A.differ) - 0.1, 0.5);
  const fixQ = easeInOut((t - at(A.fix) + 0.1) / 1.3), OLD = 14, rot = OLD * (1 - fixQ), difA = ringA, gA = fadeIn(t, at(A.goguryeo) - 0.1, 0.4);
  withAlpha(c, a, () => {
    glow(c, cx, cy, R * 1.2, '#3D6E8C', 0.07);
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU);
    const g = c.createRadialGradient(cx, cy, 10, cx, cy, R); g.addColorStop(0, '#0E2836'); g.addColorStop(1, '#06161F'); c.fillStyle = g; c.fill(); c.clip();
    ring(c, cx, cy, k * 37.5, rgba(PAL.mark, 0.45), 1.5);                                       // always-visible circle (Seoul)
    ring(c, cx, cy, k * 90, rgba(PAL.warm, 0.4), 1.5);                                          // celestial equator
    const ecl = []; for (let l = 0; l <= 360; l += 4) { const lr = l * D2R, de = Math.asin(Math.sin(EPS * D2R) * Math.sin(lr)) / D2R, ra = Math.atan2(Math.sin(lr) * Math.cos(EPS * D2R), Math.cos(lr)) / D2R; ecl.push(P(ra, de)); }
    line(c, ecl, rgba(PAL.sun, 0.4), 1.5);                                                      // ecliptic
    for (const ra of MANSIONS) line(c, [P(ra, 52.5), P(ra, -55)], rgba(T.border, 0.9), 1);       // 28 mansion boundaries
    for (const grp of MAP_STARS) {
      const pts = grp.map(([ra, de]) => P(ra, de));
      if (pts.length > 1) line(c, pts, rgba(PAL.line, 0.35), 1);
      grp.forEach(([, , r], i) => circle(c, pts[i][0], pts[i][1], r, rgba(PAL.star, 0.8)));
    }
    c.restore();
    ring(c, cx, cy, R, rgba(PAL.mark, 0.55), 2.5); ring(c, cx, cy, R + 8, rgba(PAL.mark, 0.25), 1);
    // the solar-term ring (24 marks outside the map); old (Goguryeo) ghost and the corrected ring
    const termRing = (rr, r0, r1, col) => {
      for (let i = 0; i < 24; i++) {
        const lr = i * 15 * D2R, ra = Math.atan2(Math.sin(lr) * Math.cos(EPS * D2R), Math.cos(lr)) / D2R + rr, ph = ra * D2R, big = i % 6 === 0;
        line(c, [[cx + (R + r0) * Math.sin(ph), cy - (R + r0) * Math.cos(ph)], [cx + (R + r1 + (big ? 8 : 0)) * Math.sin(ph), cy - (R + r1 + (big ? 8 : 0)) * Math.cos(ph)]], col, big ? 3 : 2);
      }
    };
    if (oldA > 0) withAlpha(c, oldA * (1 - 0.45 * fixQ), () => termRing(OLD, 40, 54, rgba(T.muted, 0.85)));      // Goguryeo marks (outer)
    if (ringA > 0) withAlpha(c, ringA, () => termRing(0, 12, 26, PAL.pole));                                  // 1395 marks (inner)
    // the meridian through the spring-equinox mark: which stars culminate (swings from the old to the corrected mark)
    if (merA > 0) withAlpha(c, merA * fadeOut(t, at(A.fix) + 1.8, 0.6), () => {
      const ph = rot * D2R; line(c, [[cx, cy], [cx + (R + 60) * Math.sin(ph), cy - (R + 60) * Math.cos(ph)]], rgba(T.light, 0.7), 2, {dash: [6, 6]});
    });
    if (difA > 0) withAlpha(c, difA * fadeOut(t, at(A.fix) + 1.8, 0.6), () => ring(c, cx, cy, R + 33, rgba(PAL.warm, 0.95), 4, -Math.PI / 2, -Math.PI / 2 + OLD * D2R));
    // labels (below the map)
    stage.text('天象列次分野之圖', 540, 1072, {size: 30, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, at(A.chart) - 0.1, 0.5)});
    stage.text('하늘을 분야에 따라 차례로 벌여 그린 그림 · 돌에 새김', 540, 1112, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.chart) + 0.3, 0.5)});
    withAlpha(c, oldA, () => {
      line(c, [[250, 1150], [290, 1150]], rgba(T.muted, 0.9), 3); stage.text('바깥 눈금: 옛 천문도의 절기', 302, 1150, {size: 24, weight: 500, color: T.muted});
      stage.text('(고구려 천문도)', 302, 1182, {size: 24, weight: 500, color: T.muted, alpha: gA});
    });
    withAlpha(c, ringA, () => { line(c, [[250, 1222], [290, 1222]], PAL.pole, 3); stage.text('안쪽 눈금: 1395년 하늘의 절기', 302, 1222, {size: 24, weight: 500, color: PAL.pole}); });
    if (difA > 0) {
      const fA = fadeIn(t, at(A.fix) + 0.25, 0.4);
      tag(stage, '쌓인 세차만큼 어긋남', 540, 1280, {size: 26, color: PAL.warm, border: PAL.warm, a: difA * fadeOut(t, at(A.fix) - 0.1, 0.3)});
      tag(stage, '『중성기』로 바로잡음', 540, 1280, {size: 26, color: PAL.pole, border: PAL.pole, a: fA});
    }
  });
}
// ---- origin s05: 章動 / nutation / Bradley ----
function nutationCards(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const nA = fadeIn(t, at(A.nut) - 0.2, 0.5), lA = fadeIn(t, at(A.latin) - 0.1, 0.4), bA = fadeIn(t, at(A.y1748) - 0.2, 0.5), dA = fadeIn(t, at(A.nodL) - 0.1, 0.4);
  withAlpha(c, a, () => {
    stage.text('章動', 540, 380, {size: 120, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, at(A.jd) - 0.2, 0.5)});
    stage.text('장동', 540, 480, {role: 'display', size: 36, weight: 700, color: T.light, align: 'center', alpha: fadeIn(t, at(A.jd), 0.5)});
    withAlpha(c, nA, () => {
      rect(c, 140, 540, 800, 300, 12, rgba(T.plate, 0.92), dA > 0.5 ? rgba(T.light, 0.8) : rgba(T.border, 1), 2);
      stage.text('nutation', 380, 600, {role: 'display', size: 50, weight: 700, color: T.ink, align: 'center'});
      stage.text('← 라틴어 nutare', 380, 680, {size: 30, weight: 700, color: T.light, align: 'center', alpha: lA});
      stage.text('= 끄덕이다', 380, 730, {size: 30, weight: 700, color: T.ink, align: 'center', alpha: dA});
      // a small axis that nods (the motion the word names; size exaggerated)
      const x = 760, y = 700, nodA = 7 * Math.sin((t - at(A.nodL)) * 4.4) * dA, an = nodA * D2R;
      ring(c, x, y, 70, rgba(PAL.grat ?? '#9EC6D2', 0.4), 1.5);
      const g = c.createRadialGradient(x - 22, y - 26, 6, x, y, 70); g.addColorStop(0, '#2B6A80'); g.addColorStop(1, '#06202C'); circle(c, x, y, 70, g);
      ring(c, x, y, 70, rgba('#BFE4F2', 0.35), 1.4);
      const dx = Math.sin(an), dy = -Math.cos(an);
      line(c, [[x - dx * 100, y - dy * 100], [x + dx * 92, y + dy * 92]], PAL.axis, 3); arrow(c, [x + dx * 70, y + dy * 70], [x + dx * 112, y + dy * 112], PAL.axis, 3, {head: 13});
      ring(c, x, y, 122, rgba(PAL.nod, 0.85 * dA), 2.5, -Math.PI / 2 - 0.16, -Math.PI / 2 + 0.16);
    });
    withAlpha(c, bA, () => {
      rect(c, 220, 880, 640, 210, 12, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
      stage.text('1748 · 브래들리', 540, 940, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center'});
      stage.text('1727 ~ 1747 별 관측', 540, 1004, {size: 28, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.bradley) - 0.1, 0.4)});
      stage.text('→ 장동 발표', 540, 1048, {size: 28, weight: 700, color: T.light, align: 'center', alpha: fadeIn(t, at(A.bradley) + 0.6, 0.4)});
    });
  });
}

// ---- bulge / cone: the shared Earth stage ----
const BULGE_C = [450, 640], CONE_C = [540, 690];
function bulgeCam(t, ctx) {
  // bulge: side view (alpha 0); cone: the camera rises to 24° and the Earth moves to the centre
  const tl = ctx.tl, c0 = tl.scene('cone').start, q = ctx.scene.id === 'cone' ? easeInOut((t - c0 - 0.1) / 1.8) : 0;
  return {cam: obliqueCam({cx: lerp(BULGE_C[0], CONE_C[0], q), cy: lerp(BULGE_C[1], CONE_C[1], q), k: lerp(200, 150, q), alpha: lerp(0, 24, q)}), q};
}

// ---- nod: the zoomed pole path strip + the Moon's orbit ----
const NS = {x0: 320, x1: 912, y: 488, amp: 56};
function nodStrip(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, m = M(ctx), y = m.year(t), y0 = 2026, y1 = 2026 + NOD_RATE * (ctx.tl.scene('nod').end - ctx.tl.scene('nod').start);
  const X = yy => lerp(NS.x0, NS.x1, (yy - y0) / (y1 - y0)), Y = yy => NS.y - NS.amp * dEps(yy) / NUT_EPS;
  withAlpha(c, a, () => {
    panel(c, T, 140, 296, 800, 330, 0.92);
    stage.text('하늘의 북극이 지나는 길', 160, 326, {size: 26, weight: 700, color: T.ink});
    stage.text(fmtYear(y), 920, 326, {role: 'display', size: 30, weight: 700, color: PAL.pole, align: 'right'});
    // where on the big circle (icon) + zoom lines
    const ix = 214, iy = 470, ir = 52;
    c.save(); c.setLineDash([3, 5]); ring(c, ix, iy, ir, rgba(PAL.pole, 0.6), 1.6); c.restore();
    ring(c, ix, iy, ir, PAL.pole, 3.5, Math.PI * 0.42, Math.PI * 0.58);
    line(c, [[ix + ir * Math.cos(Math.PI * 0.42) + 6, iy + ir * Math.sin(Math.PI * 0.42)], [NS.x0 - 10, NS.y + 80]], rgba(T.muted, 0.45), 1.2);
    line(c, [[ix + ir * Math.cos(Math.PI * 0.58) + 6, iy + ir * Math.sin(Math.PI * 0.58) - 4], [NS.x0 - 10, NS.y - 80]], rgba(T.muted, 0.45), 1.2);
    stage.text('세차의 원', ix, iy + 92, {size: 24, color: T.muted, align: 'center'});
    stage.text('확대 · 흔들림 크게 과장', NS.x0, 600, {size: 24, weight: 500, color: T.muted});
    // mean path (precession only) and the real path (+ nutation, exaggerated vertically)
    line(c, [[NS.x0, NS.y], [NS.x1, NS.y]], rgba(T.muted, 0.6), 1.5, {dash: [6, 6]});
    const all = [], tr = []; for (let yy = y0; yy <= y1 + 1e-9; yy += 0.25) { all.push([X(yy), Y(yy)]); if (yy <= y) tr.push([X(yy), Y(yy)]); }
    line(c, all, rgba(PAL.nod, 0.18), 2); tr.push([X(y), Y(y)]); if (tr.length > 1) line(c, tr, PAL.nod, 3.5);
    // crest-to-crest bracket after the first full cycle
    const crests = []; for (let yy = y0; yy <= y1; yy += 0.05) { if (dEps(yy) > dEps(yy - 0.05) && dEps(yy) >= dEps(yy + 0.05)) crests.push(yy); }
    if (crests.length > 1 && y > crests[1]) withAlpha(c, fadeIn(y, crests[1], 2), () => {
      const xa = X(crests[0]), xb = X(crests[1]), yb = NS.y - NS.amp - 22;
      line(c, [[xa, yb + 8], [xa, yb], [xb, yb], [xb, yb + 8]], rgba(T.light, 0.85), 2); tag(stage, '18.6년', (xa + xb) / 2, yb - 22, {size: 26, color: T.light});
    });
    poleMarker(c, X(y), Y(y));
    line(c, [[NS.x1 - 196, 600], [NS.x1 - 156, 600]], rgba(T.muted, 0.7), 1.5, {dash: [6, 6]}); stage.text('세차만 있다면', NS.x1, 600, {size: 24, color: T.muted, align: 'right'});
  });
}
function moonOrbit(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), y = m.year(t);
  const cam = obliqueCam({cx: 540, cy: 812, k: 260, alpha: 24}), Om = nodeLon(y) * D2R, inc = I_MOON * D2R;
  const N = [Math.cos(Om), Math.sin(Om), 0], Mv = [-Math.sin(Om) * Math.cos(inc), Math.cos(Om) * Math.cos(inc), Math.sin(inc)];
  const iA = fadeIn(t, at(A.five) - 0.1, 0.4), dA = fadeIn(t, at(A.dir) - 0.1, 0.4);
  const ringPts = (f, rr) => { const P = []; for (let i = 0; i <= 120; i++) { const u = i * 3 * D2R; P.push(f(u, rr)); } return P; };
  const ecl = ringPts((u, rr) => cam.P(rr * Math.cos(u), rr * Math.sin(u), 0), 1.0), ref = ringPts((u, rr) => cam.P(rr * Math.cos(u), rr * Math.sin(u), 0), 0.86), moon = ringPts((u, rr) => cam.P(rr * (Math.cos(u) * N[0] + Math.sin(u) * Mv[0]), rr * (Math.cos(u) * N[1] + Math.sin(u) * Mv[1]), rr * Math.sin(u) * Mv[2]), 0.86);
  const draw = (P, col, w, back) => { let run = []; const fl = () => { if (run.length > 1) line(c, run, col, w); run = []; }; for (const p of P) { if ((p[2] < 0) === back) run.push([p[0], p[1]]); else fl(); } fl(); };
  withAlpha(c, a, () => {
    poly(c, ecl.map(p => [p[0], p[1]]), rgba('#8AA0A6', 0.06));
    c.save(); c.setLineDash([5, 6]); draw(ref, rgba('#8AA0A6', 0.4), 1.5, true); c.restore();
    draw(ecl, rgba('#8AA0A6', 0.45), 2, true); draw(moon, rgba(PAL.moon, 0.45), 2.5, true);
    // node line (through the Earth)
    const n1 = cam.P(1.08 * N[0], 1.08 * N[1], 0), n2 = cam.P(-1.08 * N[0], -1.08 * N[1], 0);
    withAlpha(c, 0.4 + 0.6 * dA, () => line(c, [[n2[0], n2[1]], [n1[0], n1[1]]], rgba(T.light, 0.75), 2, {dash: [7, 6]}));
    const V = axisView({cx: 540, cy: 812, R: 44}, cam.vec(axisWorld(EPS, leanAz(2026))), {spin: spinLam(t), sun: cam.vec(unit([0.3, 1, 0.4]))});
    drawGlobe(stage, V, {land: LAND, night: 0.45, equator: 0});
    c.save(); c.setLineDash([5, 6]); draw(ref, rgba('#8AA0A6', 0.55), 1.5, false); c.restore();
    draw(ecl, rgba('#8AA0A6', 0.6), 2, false); draw(moon, rgba(PAL.moon, 0.9), 3, false);
    for (const [p, s] of [[cam.P(0.86 * N[0], 0.86 * N[1], 0), 1], [cam.P(-0.86 * N[0], -0.86 * N[1], 0), 0]]) { circle(c, p[0], p[1], 6, T.light); ring(c, p[0], p[1], 11, rgba(T.light, 0.6), 1.5); }
    // the Moon itself, parked at its highest point above the ecliptic (keeps the tilt readable)
    const mp = cam.P(0.86 * Mv[0], 0.86 * Mv[1], 0.86 * Mv[2]); circle(c, mp[0], mp[1], 13, '#BFC3CA'); ring(c, mp[0], mp[1], 13, rgba('#FFFFFF', 0.4), 1.2);
    const mpe = cam.P(0.86 * Mv[0] / Math.hypot(Mv[0], Mv[1]), 0.86 * Mv[1] / Math.hypot(Mv[0], Mv[1]), 0);
    withAlpha(c, iA, () => line(c, [[mpe[0], mpe[1]], [mp[0], mp[1]]], rgba(T.light, 0.9), 2));
    // regression arrow on the ecliptic ring (clockwise seen from above)
    withAlpha(c, dA, () => {
      const az0 = Om / D2R + 25, pts = []; for (let i = 0; i <= 20; i++) { const u = (az0 - i * 2.2) * D2R; pts.push(cam.P(1.13 * Math.cos(u), 1.13 * Math.sin(u), 0)); }
      line(c, pts.slice(0, -2).map(p => [p[0], p[1]]), rgba(T.light, 0.9), 2.5); arrow(c, pts[pts.length - 4], pts[pts.length - 1], T.light, 2.5, {head: 12});
    });
    stage.text('황도면', 270, 812, {size: 24, color: T.muted, align: 'right'});
    tag(stage, '달의 궤도 · 약 5° 기울어짐', 540, 670, {size: 26, color: PAL.moon, a: iA});
    tag(stage, '교점선 · 18.6년에 한 바퀴 (시계 방향)', 540, 960, {size: 26, color: T.light, border: T.light, a: dA});
  });
}

// ---- climate: orbit with perihelion; schematic insolation rhythm ----
const ECC = 0.0167;
function climateOrbit(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), y = m.year(t);
  const cam = obliqueCam({cx: 600, cy: 600, k: 290, alpha: 22}), rP = 1 - ECC;
  const nowA = fadeIn(t, at(A.nowS) - 0.1, 0.4), agoA = fadeIn(t, at(A.ago) - 0.2, 0.4);
  withAlpha(c, a, () => {
    // perihelion along −Y: position at true anomaly nu → (X, Y) = (r sin nu, −r cos nu) (counter-clockwise from above)
    const op = []; for (let i = 0; i <= 180; i++) { const nu = i * 2 * D2R, r = (1 - ECC * ECC) / (1 + ECC * Math.cos(nu)); const p = cam.P(-r * Math.sin(nu), -r * Math.cos(nu), 0); op.push([p[0], p[1]]); }
    line(c, op, rgba('#8AA0A6', 0.5), 2);
    const S = cam.P(0, 0, 0); glow(c, S[0], S[1], 120, PAL.sun, 0.22); glow(c, S[0], S[1], 50, PAL.sun, 0.4);
    const g = c.createRadialGradient(S[0] - 6, S[1] - 6, 3, S[0], S[1], 26); g.addColorStop(0, '#FFF8E6'); g.addColorStop(0.7, '#FFD88A'); g.addColorStop(1, '#F7B955'); circle(c, S[0], S[1], 26, g);
    stage.text('태양', S[0], S[1] + 50, {size: 24, color: T.muted, align: 'center'});
    const E = cam.P(0, -rP, 0);
    line(c, [[S[0], S[1]], [E[0], E[1]]], rgba(PAL.mark, 0.6), 2, {dash: [7, 6]});
    const V = axisView({cx: E[0], cy: E[1], R: 92}, cam.vec(axisWorld(EPS, climLean(y))), {spin: spinLam(t), sun: cam.vec([0, 1, 0])});
    c.save(); c.setLineDash([5, 5]); line(c, [[E[0], E[1] - 92], [E[0], E[1] - 170]], rgba(T.muted, 0.7), 1.8); c.restore();
    earthWithAxis(stage, V, 1.8, {night: 0.72, grat: 0.12});
    stage.text('근일점 · 태양과 가장 가까움', E[0] + 10, E[1] + 132, {size: 24, weight: 700, color: PAL.mark, align: 'center'});
    // season at perihelion
    const d = periDecl(y), season = d < -12 ? '겨울' : d > 12 ? '여름' : '가을', col = d < -12 ? PAL.cool : d > 12 ? PAL.warm : T.light;
    const back = 2026 - y;
    withAlpha(c, nowA, () => {
      panel(c, T, 140, 900, 800, 150, 0.92);
      stage.text(back < 50 ? '지금' : (Math.round(back / 100) * 100 >= 10950 ? '약 1만 1천 년 전' : `약 ${(Math.round(back / 100) * 100).toLocaleString('en-US')}년 전`), 540, 936, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text(back < 50 ? '근일점 1월 3일 = 북반구 겨울' : `근일점 = 북반구 ${season}`, 540, 1002, {size: 32, weight: 700, color: col, align: 'center'});
    });
    if (agoA > 0 && back > 50) tag(stage, '시간 되감기 · 자전축 방향이 거꾸로 돈다', 540, 340, {size: 24, color: T.muted, a: agoA * fadeOut(t, at(A.summer) + 1.2, 0.5)});
  });
}
function iceRhythm(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const x0 = 200, x1 = 900, yc = 1238, amp = 54, Y0 = 200000;
  const f = ya => { const e = 0.6 + 0.4 * Math.cos(TAU * ya / 100000 + 0.9); return 0.62 * e * Math.sin(TAU * ya / 21000 + 0.6) + 0.3 * Math.sin(TAU * ya / 41000 + 1.3); };
  const X = ya => lerp(x0, x1, 1 - ya / Y0), draw = easeInOut((t - at(A.manyears) + 0.2) / 1.6);
  withAlpha(c, a, () => {
    panel(c, T, 140, 1100, 800, 236, 0.92);
    stage.text('빙하기 리듬 · 수만 년 (모식도)', 160, 1128, {size: 24, weight: 700, color: T.ink});
    stage.text('북반구 여름 햇빛', 920, 1128, {size: 24, color: PAL.sun, align: 'right'});
    line(c, [[x0, yc], [x1, yc]], rgba(T.border, 1), 1);
    const pts = []; for (let ya = Y0; ya >= Y0 * (1 - draw); ya -= 400) pts.push([X(ya), yc - amp * f(ya)]);
    if (pts.length > 1) line(c, pts, PAL.sun, 2.5);
    for (const [ya, s] of [[200000, '20만 년 전'], [100000, '10만 년 전'], [0, '지금']]) stage.text(s, X(ya), 1316, {size: 24, color: T.muted, align: ya === 200000 ? 'left' : ya === 0 ? 'right' : 'center'});
    // one precession beat between two neighbouring maxima of the drawn curve (spacing 20–22 kyr)
    const mx = []; for (let ya = 80000; ya > 2000; ya -= 50) if (f(ya) > f(ya + 50) && f(ya) >= f(ya - 50) && f(ya) > 0.2) mx.push(ya);
    let pair = null; for (let i = 0; i + 1 < mx.length; i++) { const d = mx[i] - mx[i + 1]; if (d > 19500 && d < 22500) { pair = [mx[i], mx[i + 1]]; break; } }
    if (pair) withAlpha(c, fadeIn(t, at(A.slowCircle) - 0.2, 0.5), () => {
      const xa = X(pair[0]), xb = X(pair[1]), yb = yc - amp * Math.max(f(pair[0]), f(pair[1])) - 16;
      line(c, [[xa, yb + 8], [xa, yb], [xb, yb], [xb, yb + 8]], rgba(T.light, 0.9), 2);
      tag(stage, '세차의 박자 · 약 2만 1천 년', (xa + xb) / 2, yb - 24, {size: 24, color: T.light});
    });
  });
}

// ---- use: telescope + satellite pointing ----
function telescope(stage, x, y, ang, a) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    for (const dx of [-70, 0, 70]) line(c, [[x, y], [x + dx, y + 150]], '#5C6E74', 6);
    line(c, [[x - 70, y + 150], [x + 70, y + 150]], rgba('#5C6E74', 0.6), 2);
    circle(c, x, y, 14, '#8FA3A8');
    c.save(); c.translate(x, y); c.rotate(ang);
    const g = c.createLinearGradient(0, -26, 0, 26); g.addColorStop(0, '#DDE6E8'); g.addColorStop(0.5, '#9FB2B7'); g.addColorStop(1, '#4F6166');
    rect(c, -80, -24, 250, 48, 6, g); rect(c, 160, -30, 30, 60, 4, '#C9D5D8'); rect(c, -96, -16, 18, 32, 3, '#6E8086');
    rect(c, 10, -44, 90, 14, 4, '#B9C7CA');
    c.restore();
    circle(c, x, y, 7, T.ink);
  });
}
function satellite(stage, x, y, ang, a) {
  const {ctx: c} = stage;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.rotate(ang);
    for (const s of [-1, 1]) {
      rect(c, -16, s * 26 - (s > 0 ? 0 : 52), 32, 52, 2, '#22466A', rgba('#8EC5F0', 0.6), 1.2);
      line(c, [[-16, s * 52], [16, s * 52]], rgba('#8EC5F0', 0.3), 1);
      line(c, [[0, s * 14], [0, s * 26]], '#9AAAB0', 2);
    }
    rect(c, -26, -16, 52, 32, 4, '#C8B98E'); rect(c, 26, -12, 16, 24, 3, '#E6E0D2');
    c.restore();
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
const SKY_HOOK = {cx: 540, cy: 740, R: 360};
export const scenes = {
  // ------------------------------------------------------------------ hook: the northern sky, the pole slides to Vega
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), y = m.year(t);
    checkSoundTable(ctx);
    const o = SKY_HOOK, ef = endFade(t, ctx), a0 = fadeIn(t, 0.1, 0.9) * ef;
    const drawQ = easeInOut((t - at(A.turnW) + 0.1) / 1.6), nodA = fadeIn(t, at(A.nodW) - 0.1, 0.3) * fadeOut(t, at('s01:end') + 0.2, 0.4);
    const slideA = fadeIn(t, at(A.yrs) - 0.2, 0.3);
    skyDisc(stage, t, {...o, a: a0, circle: drawQ > 0 ? 1 : 0, ticks: 0.6 * slideA, arc: slideA > 0 ? [2026, y] : null, nep: 0});
    withAlpha(c, a0, () => {
      // the precession circle being drawn (direction of motion: counter-clockwise on this looking-up map)
      if (drawQ > 0 && drawQ < 1) {
        const pts = []; for (let i = 0; i <= 90; i++) pts.push(poleXY(o, 2026 + P_PREC * drawQ * i / 90));
        line(c, pts, rgba(PAL.pole, 0.8), 2.5);
      }
      // stars named in the story
      const pa = fadeIn(t, at(A.polaris) - 0.1, 0.4), va = fadeIn(t, at(A.lyra) - 0.1, 0.4);
      constellationNames(stage, o, fadeIn(t, 0.6, 0.8) * (1 - 0.6 * slideA), {'거문고자리': va});
      const P = starXY(o, 'polaris'), Vg = starXY(o, 'vega');
      withAlpha(c, pa, () => { ring(c, P[0], P[1], 20, rgba(T.light, 0.8), 2); tag(stage, '북극성', P[0] + 30, P[1] - 30, {size: 26, align: 'left', color: T.light}); });
      withAlpha(c, va, () => { ring(c, Vg[0], Vg[1], 22, rgba(T.light, 0.8), 2); tag(stage, '베가 (거문고자리)', Vg[0] - 30, Vg[1] + 40, {size: 26, align: 'right', color: T.light}); });
      // the pole marker (wobbles a little on "끄덕이는" — a nod, size exaggerated)
      const pp = poleXY(o, y), poleA = fadeIn(t, at(A.axisW) - 0.1, 0.5);
      const wob = nodA * 7 * Math.sin((t - at(A.nodW)) * 7.5), ux = (pp[0] - o.cx) / Math.hypot(pp[0] - o.cx, pp[1] - o.cy), uy = (pp[1] - o.cy) / Math.hypot(pp[0] - o.cx, pp[1] - o.cy);
      poleMarker(c, pp[0] + ux * wob, pp[1] + uy * wob, poleA);
      const lab = fadeIn(t, at(A.axisW) + 0.3, 0.4) * fadeOut(t, at(A.polaris) - 0.3, 0.3);
      if (lab > 0) tag(stage, '자전축이 가리키는 곳 = 하늘의 북극', 540, 340, {size: 26, color: PAL.pole, a: lab});
    });
    // under the disc: what the circle and the nod are; then the year counter
    const l1 = fadeIn(t, at(A.prec) - 0.1, 0.4) * fadeOut(t, at('s02') - 0.4, 0.4), l2 = fadeIn(t, at(A.jangdong) - 0.1, 0.4) * fadeOut(t, at('s02') - 0.4, 0.4);
    stage.text('세차운동 · 하늘의 북극이 그리는 큰 원', 540, 1176, {size: 30, weight: 700, color: PAL.pole, align: 'center', alpha: l1 * ef});
    stage.text('장동 · 그 위의 작은 끄덕임', 540, 1230, {size: 30, weight: 700, color: PAL.nod, align: 'center', alpha: l2 * ef});
    const yA = fadeIn(t, at(A.now) - 0.1, 0.4) * ef;
    withAlpha(c, yA, () => {
      panel(c, T, 300, 1150, 480, 150, 0.92);
      stage.text('하늘의 북극이 가리키는 해', 540, 1184, {size: 24, color: T.muted, align: 'center'});
      stage.text(y > 13990 ? '약 14000년' : y < 2026.5 ? '지금 · 2026년' : fmtYear(Math.round(y / 100) * 100), 540, 1244, {role: 'display', size: 46, weight: 700, color: PAL.pole, align: 'center'});
    });
    stage.text('북쪽 하늘을 올려다본 모습', 540, 1124, {size: 24, color: T.muted, align: 'center', alpha: fadeIn(t, 1.2, 0.6) * fadeOut(t, at(A.now) - 0.4, 0.4) * ef});
  },

  // ------------------------------------------------------------------ origin: 歲差, Hipparchus, 천상열차분야지도, nutation
  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('origin');
    const aA = fadeIn(t, sc.start + 0.1, 0.5) * fadeOut(t, at('s03:end') + 0.25, 0.45);
    if (aA > 0) {
      const on1 = fadeIn(t, at(A.yearly) - 0.1, 0.4), on2 = fadeIn(t, at(A.diff) - 0.1, 0.4);
      glyphCard(stage, 420, 300, '歲', '해 세', on1, aA);
      glyphCard(stage, 660, 300, '差', '다를 차', on2, aA);
      stage.text('歲差 = 해마다 생기는 차이', 540, 572, {size: 32, weight: 700, color: T.ink, align: 'center', alpha: aA * fadeIn(t, at(A.meaning) - 0.2, 0.4)});
      withAlpha(c, aA * fadeIn(t, at(A.bc) - 0.3, 0.5), () => equinoxStrip(stage, t, ctx, 1));
      withAlpha(c, aA * fadeIn(t, at(A.hipp) - 0.1, 0.5), () => {
        rect(c, 300, 1110, 480, 130, 12, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
        stage.text('기원전 2세기 · 히파르코스', 540, 1150, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
        stage.text('옛 기록과 자기 관측을 견줌', 540, 1204, {size: 26, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.old) - 0.1, 0.4)});
      });
    }
    const bA = fadeIn(t, at('s04') - 0.5, 0.6) * fadeOut(t, at('s04:end') + 0.25, 0.45);
    if (bA > 0) starMap(stage, t, ctx, bA);
    const cA = fadeIn(t, at('s05') - 0.45, 0.5) * endFade(t, ctx);
    if (cA > 0) nutationCards(stage, t, ctx, cA);
  },

  // ------------------------------------------------------------------ essence: the spinning top
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('essence'), ef = endFade(t, ctx);
    const a0 = fadeIn(t, sc.start + 0.1, 0.5) * ef;
    const theta = 7 + 17 * easeInOut((t - at(A.pull) + 0.1) / 1.1);
    const s = t - at(A.fall) + 0.2, RATE_TOP = 75, psi = 60 + (s <= 0 ? 0 : s < 1.2 ? RATE_TOP * s * s / 2.4 : RATE_TOP * (s - 0.6));
    const spin = (t - sc.start) * 330;
    const cam = obliqueCam({cx: 540, cy: 1060, k: 185, alpha: 20});
    const gA = fadeIn(t, at(A.pull) - 0.1, 0.4), fallA = fadeIn(t, at(A.pulled) - 0.1, 0.4) * fadeOut(t, at(A.instead) + 0.5, 0.5), xA = fadeIn(t, at(A.instead) - 0.1, 0.4);
    const sideA = fadeIn(t, at(A.side) - 0.3, 0.4), tqA = fadeIn(t, at(A.fall) - 0.1, 0.4), L = 2.45;
    withAlpha(c, a0, () => {
      // floor
      const fl = []; for (let i = 0; i <= 72; i++) { const u = i * 5 * D2R; const q = cam.P(1.85 * Math.cos(u), 1.85 * Math.sin(u), 0); fl.push([q[0], q[1]]); }
      poly(c, fl, rgba('#0F2A36', 0.85), rgba(T.border, 1), 1.5);
      c.save(); c.translate(540, 1060); c.scale(1, 0.32); glow(c, 0, 0, 160, '#000000', 0.55); c.restore();
      // the cone traced by the axis tip (full circle faint, traced part bright)
      const coneAll = conePts(cam, L, theta, 0, 360), traced = conePts(cam, L, theta, 60, psi);
      if (tqA > 0) withAlpha(c, tqA, () => { c.save(); c.setLineDash([4, 7]); line(c, coneAll.map(q => [q[0], q[1]]), rgba(PAL.pole, 0.45), 2); c.restore(); });
      // the torque arrow at the pivot: horizontal, perpendicular to the tilt plane (= where the tip goes)
      const td = [-Math.sin(psi * D2R), Math.cos(psi * D2R), 0], p0 = cam.P(0, 0, 0), p1 = cam.P(td[0] * 1.25, td[1] * 1.25, 0);
      withAlpha(c, tqA, () => arrow(c, [p0[0], p0[1]], [p1[0], p1[1]], PAL.warm, 4, {head: 16}));
      const axisBack = drawTop(stage, cam, theta, psi, spin);
      const tip = axisBack.tipAt(L), top = axisBack.tipAt(1.84);
      line(c, [[top[0], top[1]], [tip[0], tip[1]]], rgba(PAL.axis, 0.8), 2.5, {dash: [6, 5]});
      circle(c, tip[0], tip[1], 6, PAL.axis);
      if (traced.length > 1 && psi > 60.5) line(c, traced.map(q => [q[0], q[1]]), PAL.pole, 3.5);
      // gravity
      const cm = axisBack.tipAt(0.8);
      withAlpha(c, gA, () => { arrow(c, [cm[0], cm[1]], [cm[0], cm[1] + 140], PAL.cool, 4, {head: 16}); tag(stage, '중력 (쓰러뜨리려 당김)', cm[0] - 40, cm[1] + 168, {size: 24, color: PAL.cool, align: 'right', a: fadeOut(t, at(A.side) + 0.2, 0.4)}); });
      // the expected fall (dashed) — crossed out
      if (fallA > 0) withAlpha(c, fallA, () => {
        const pts = []; for (let k = 0; k <= 16; k++) { const w = axisWorld(theta + k * 2.6, psi); const q = cam.P(w[0] * L, w[1] * L, w[2] * L); pts.push([q[0], q[1]]); }
        line(c, pts.slice(0, -1), rgba(PAL.cool, 0.85), 2.5, {dash: [6, 6]}); arrow(c, pts[pts.length - 3], pts[pts.length - 1], rgba(PAL.cool, 0.85), 2.5, {head: 12});
        const lw = stage.measure('쓰러질 것 같은 쪽', {size: 24, weight: 700}), lx = Math.min(pts[0][0] + 24, 930 - lw), ly = pts[0][1] - 30;
        stage.text('쓰러질 것 같은 쪽', lx, ly, {size: 24, weight: 700, color: PAL.cool});
        crossOut(c, lx, lx + lw, ly, xA);
      });
      // actual motion of the tip: sideways (along the torque)
      if (sideA > 0) withAlpha(c, sideA, () => {
        const q0 = axisBack.tipAt(L), w2 = axisWorld(theta, psi + 16), q1 = cam.P(w2[0] * L, w2[1] * L, w2[2] * L);
        arrow(c, [q0[0], q0[1]], [q0[0] + (q1[0] - q0[0]) * 1.6, q0[1] + (q1[1] - q0[1]) * 1.6], PAL.pole, 4, {head: 16});
        tag(stage, '축이 옆으로 돈다', 540, 556, {size: 30, color: PAL.pole, border: PAL.pole});
      });
      withAlpha(c, tqA, () => tag(stage, '비트는 힘 (토크)', p1[0] + 20, p1[1] - 24, {size: 24, align: 'left', color: PAL.warm}));
      tag(stage, '회전', 540 + 190, 930, {size: 24, color: PAL.stripe, a: fadeIn(t, at(A.spinning) - 0.1, 0.4) * fadeOut(t, at(A.pull) - 0.2, 0.4)});
    });
    withAlpha(c, fadeIn(t, at(A.turns) - 0.1, 0.5) * ef, () => {
      panel(c, T, 140, 1196, 800, 120, 0.92);
      stage.text('돌고 있는 물체 + 비트는 힘', 540, 1232, {size: 30, weight: 700, color: T.ink, align: 'center'});
      stage.text('→ 쓰러지는 대신 축이 옆으로 돈다', 540, 1280, {size: 30, weight: 700, color: PAL.pole, align: 'center'});
    });
  },

  // ------------------------------------------------------------------ bulge: oblate Earth, tilt, the twisting pull
  bulge(stage, t, p, ctx) { earthScene(stage, t, p, ctx); },
  cone(stage, t, p, ctx) {
    const at = r => ctx.tl.at(r), skyA = fadeIn(t, at('s11') - 0.4, 0.6) * endFade(t, ctx);
    const coneA = fadeOut(t, at('s11') - 0.9, 0.5);
    if (coneA > 0) withAlpha(stage.ctx, coneA, () => earthScene(stage, t, p, ctx));
    if (skyA > 0) skyScene(stage, t, ctx, skyA);
  },

  // ------------------------------------------------------------------ nod: nutation
  nod(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), sc = ctx.tl.scene('nod'), ef = endFade(t, ctx), y = m.year(t);
    nodStrip(stage, t, ctx, fadeIn(t, sc.start + 0.1, 0.5) * ef);
    moonOrbit(stage, t, ctx, fadeIn(t, at(A.moonOrbit) - 0.4, 0.6) * ef);
    // the Moon's twisting force over the 18.6-yr cycle (relative), then 9.2″ vs the full Moon
    const tA = fadeIn(t, at(A.torque13) - 0.3, 0.5) * ef, cmpA = fadeIn(t, at(A.fullMoon) - 0.2, 0.5) * ef;
    withAlpha(c, tA, () => {
      panel(c, T, 140, 1000, 800, 84, 0.92);
      stage.text('달이 비트는 힘', 160, 1042, {size: 26, weight: 700, color: T.ink});
      const q = torqueNorm(y), x0 = 360, w = 400;
      rect(c, x0, 1028, w, 28, 6, rgba(T.border, 0.9)); rect(c, x0, 1028, w * (0.25 + 0.75 * q), 28, 6, PAL.nod);
      stage.text(q > 0.6 ? '세짐' : q < 0.4 ? '약해짐' : '', 920, 1042, {size: 26, weight: 700, color: PAL.nod, align: 'right'});
    });
    withAlpha(c, cmpA, () => {
      panel(c, T, 140, 1100, 800, 236, 0.92);
      const mx = 300, my = 1218, R = 96;
      const g = c.createRadialGradient(mx - 30, my - 30, 10, mx, my, R); g.addColorStop(0, '#E9EBEF'); g.addColorStop(0.75, '#B7BCC4'); g.addColorStop(1, '#8D939C'); circle(c, mx, my, R, g);
      for (const [dx, dy, r] of [[-28, -18, 20], [22, 26, 14], [30, -30, 10], [-14, 38, 12]]) circle(c, mx + dx, my + dy, r, rgba('#8D939C', 0.45));
      // 9.2″ on the same scale: 2R × 9.2 / 1860 ≈ 1 px
      const w92 = 2 * R * NUT_EPS / MOON_DIAM;
      rect(c, mx + R + 4, my - 6, Math.max(1, w92), 12, 0, PAL.warm); ring(c, mx + R + 4.5, my, 13, rgba(PAL.warm, 0.8), 1.5);
      line(c, [[mx - R, my + R + 10], [mx + R, my + R + 10]], rgba(T.muted, 0.8), 1.5);
      stage.text('보름달 지름 약 1,860″', 470, 1160, {size: 26, weight: 700, color: T.ink});
      stage.text('장동의 흔들림 9.2″', 470, 1214, {size: 26, weight: 700, color: PAL.warm});
      stage.text('≈ 보름달 지름의 약 1/200', 470, 1266, {size: 28, weight: 700, color: PAL.warm, alpha: fadeIn(t, at(A.d200) - 0.1, 0.4)});
      line(c, [[mx + R + 17, my - 2], [458, 1214]], rgba(PAL.warm, 0.6), 1.2);
    });
  },

  // ------------------------------------------------------------------ climate: perihelion season; ice-age rhythm
  climate(stage, t, p, ctx) {
    const at = r => ctx.tl.at(r), sc = ctx.tl.scene('climate'), ef = endFade(t, ctx);
    climateOrbit(stage, t, ctx, fadeIn(t, sc.start + 0.1, 0.6) * ef);
    iceRhythm(stage, t, ctx, fadeIn(t, at('s15') - 0.5, 0.6) * ef);
  },

  // ------------------------------------------------------------------ use: pointing telescopes and satellites
  use(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('use'), ef = endFade(t, ctx), a0 = fadeIn(t, sc.start + 0.1, 0.5) * ef;
    const star = [740, 470], q1 = easeInOut((t - at(A.precW) + 0.05) / 0.8), q2 = easeInOut((t - at(A.nutW) + 0.05) / 0.6);
    const off0 = [-120, 92], off1 = [-14, 11], off = [lerp(lerp(off0[0], off1[0], q1), 0, q2), lerp(lerp(off0[1], off1[1], q1), 0, q2)];
    const aim = [star[0] + off[0], star[1] + off[1]], hit = fadeIn(t, at(A.exact) - 0.2, 0.4);
    withAlpha(c, a0, () => {
      // star field
      for (let i = 0; i < 40; i++) { const x = lerp(160, 920, rand(i * 3.3 + 0.2)), y = lerp(310, 700, rand(i * 5.9 + 1.1)), r = 0.8 + 1.4 * rand(i * 2.2); circle(c, x, y, r, rgba(PAL.star, 0.5)); }
      glow(c, star[0], star[1], 40, '#DCE8FF', 0.5); circle(c, star[0], star[1], 6, '#FFFFFF');
      tag(stage, '목표 별', star[0] + 24, star[1] - 26, {size: 24, align: 'left', color: T.light});
      // ground and the Earth's limb
      const lim = []; for (let x = 100; x <= 980; x += 10) lim.push([x, 1110 + ((x - 540) / 900) ** 2 * 120]);
      poly(c, [...lim, [980, 1340], [100, 1340]], rgba('#0F2A36', 0.9)); line(c, lim, rgba('#9EC6D2', 0.4), 2);
      // instruments and their pointing lines
      const tp = [330, 940], sp = [260, 560];
      for (const [o, lab] of [[tp, '망원경'], [sp, '인공위성']]) {
        const ang = Math.atan2(aim[1] - o[1], aim[0] - o[0]), far = [o[0] + Math.cos(ang) * 1400, o[1] + Math.sin(ang) * 1400];
        c.save(); c.beginPath(); c.rect(140, 290, 800, 1050); c.clip();
        line(c, [o, far], rgba(hit > 0.5 ? PAL.pole : T.muted, 0.75), 2, {dash: [8, 7]}); c.restore();
        if (o === tp) telescope(stage, o[0], o[1], ang, 1); else satellite(stage, o[0], o[1], ang + Math.PI / 2, 1);
        tag(stage, lab, o === tp ? o[0] + 170 : o[0], o === tp ? o[1] + 140 : o[1] + 82, {size: 26, color: T.ink, align: 'center'});
      }
      ring(c, aim[0], aim[1], 22, rgba(hit > 0.5 ? PAL.pole : PAL.warm, 0.9), 2.5);
      if (hit > 0) ring(c, star[0], star[1], 22 + 30 * (1 - hit), rgba(PAL.pole, hit), 3);
      tag(stage, '어긋남 크게 과장', 540, 330, {size: 24, color: T.muted, a: fadeIn(t, at(A.calc) - 0.2, 0.4) * (1 - hit)});
    });
    // the formula
    const fA = fadeIn(t, at(A.calc) - 0.2, 0.5) * ef, pA = fadeIn(t, at(A.precW) - 0.1, 0.3), nA = fadeIn(t, at(A.nutW) - 0.1, 0.3);
    withAlpha(c, fA, () => {
      panel(c, T, 140, 1200, 800, 116, 0.92);
      const parts = [['기준 좌표', T.ink, 1], [' + ', T.muted, 1], ['세차', PAL.pole, pA], [' + ', T.muted, 1], ['장동', PAL.nod, nA], [' = 오늘 가리킬 곳', T.ink, hit]];
      const sz = 32, ws = parts.map(([s]) => stage.measure(s, {size: sz, weight: 700})), tot = ws.reduce((x, y) => x + y, 0);
      let x = 540 - tot / 2; parts.forEach(([s, col, al], i) => { stage.text(s, x, 1258, {size: sz, weight: 700, color: col, alpha: 0.25 + 0.75 * al}); x += ws[i]; });
    });
  },

  // ------------------------------------------------------------------ myth: the tilt stays, its direction turns
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), sc = ctx.tl.scene('myth'), ef = endFade(t, ctx), y = m.year(t);
    const a0 = fadeIn(t, sc.start + 0.05, 0.5) * ef, noA = fadeIn(t, evT(ctx, 'myth_no', A.notM) - 0.1, 0.5) * ef;
    const rA = fadeIn(t, at(A.tiltSame) - 0.3, 0.5) * ef, dA = fadeIn(t, at(A.dirM) - 0.1, 0.4) * ef;
    withAlpha(c, a0, () => {
      rect(c, 140, 292, 800, 150, 12, rgba(T.plate, 0.92), noA > 0.5 ? rgba(T.accent, 0.8) : rgba(T.border, 1), 2);
      stage.text('세차 = 기울기가 바뀌는 것?', 540, 340, {role: 'display', size: 40, weight: 700, color: mix(T.ink, T.muted, noA), align: 'center'});
      const w = stage.measure('세차 = 기울기가 바뀌는 것?', {role: 'display', size: 40, weight: 700}); crossOut(c, 540 - w / 2, 540 + w / 2, 340, noA);
      stage.text('아니다', 540, 404, {role: 'display', size: 44, weight: 700, color: T.accent, align: 'center', alpha: noA});
    });
    // left: the wrong picture (tilt angle changes) — crossed out
    withAlpha(c, a0, () => {
      const cx = 300, cy = 690, cam = obliqueCam({cx, cy, k: 92, alpha: 0}), wrong = 23.4 + 14 * Math.sin((t - sc.start) * 1.6);
      const V = axisView({cx, cy, R: 92}, cam.vec(axisWorld(wrong, 90)), {spin: spinLam(t), sun: cam.vec(unit([0.5, 0.8, 0.4]))});
      line(c, [[cx, cy - 92], [cx, cy - 190]], rgba(T.muted, 0.7), 2, {dash: [5, 5]});
      earthWithAxis(stage, V, 1.9, {night: 0.4});
      ring(c, cx, cy, 150, rgba(PAL.cool, 0.9), 3, -Math.PI / 2, -Math.PI / 2 + wrong * D2R);
      stage.text(`${wrong.toFixed(0)}°?`, cx + 70, cy - 206, {role: 'display', size: 30, weight: 700, color: PAL.cool, align: 'center'});
      stage.text('기울기가 커졌다 작아졌다?', cx, 880, {size: 26, weight: 700, color: mix(T.ink, T.muted, noA), align: 'center'});
      const ww = stage.measure('기울기가 커졌다 작아졌다?', {size: 26, weight: 700}); crossOut(c, cx - ww / 2, cx + ww / 2, 880, noA);
    });
    // right: the real one — the same angle, the lean direction turns (seen from slightly above)
    withAlpha(c, a0 * (0.35 + 0.65 * rA), () => {
      const cx = 780, cy = 700, cam = obliqueCam({cx, cy, k: 92, alpha: 22}), az = leanAz(y), nW = axisWorld(EPS, az);
      const V = axisView({cx, cy, R: 92}, cam.vec(nW), {spin: spinLam(t), sun: cam.vec(unit([0.5, 0.8, 0.4]))});
      const L = 1.9, coneAll = conePts(cam, L, EPS, 0, 360);
      c.save(); c.setLineDash([4, 7]); line(c, coneAll.map(q => [q[0], q[1]]), rgba(PAL.pole, 0.5), 2); c.restore();
      const zt = cam.P(0, 0, 2.05); line(c, [[cx, cy], [zt[0], zt[1]]], rgba(T.muted, 0.7), 2, {dash: [5, 5]});
      earthWithAxis(stage, V, L, {night: 0.4});
      // angle arc between the vertical and the axis, in their common plane (3D, projected)
      const arc = []; for (let k = 0; k <= 16; k++) { const w = axisWorld(EPS * k / 16, az); const q = cam.P(w[0] * 1.45, w[1] * 1.45, w[2] * 1.45); arc.push([q[0], q[1]]); }
      line(c, arc, PAL.pole, 3);
      const mid = arc[8]; tag(stage, '23.4°', mid[0] + 10, mid[1] - 40, {size: 28, role: 'display', color: PAL.pole, align: 'left'});
      withAlpha(c, dA, () => { const tr = conePts(cam, L, EPS, leanAz(2026), az); if (tr.length > 1) line(c, tr.map(q => [q[0], q[1]]), PAL.pole, 3.5); });
      stage.text('기울기는 그대로, 방향이 돈다', cx - 40, 880, {size: 26, weight: 700, color: PAL.pole, align: 'center'});
    });
    // readouts
    withAlpha(c, fadeIn(t, at(A.tiltSame) - 0.2, 0.5) * ef, () => {
      panel(c, T, 140, 940, 800, 380, 0.92);
      line(c, [[540, 960], [540, 1300]], rgba(T.border, 1), 1.2);
      stage.text('기울기', 340, 990, {size: 26, color: T.muted, align: 'center'});
      stage.text('23.4°', 340, 1110, {role: 'display', size: 72, weight: 700, color: PAL.pole, align: 'center'});
      stage.text('거의 그대로', 340, 1220, {size: 28, weight: 700, color: T.ink, align: 'center'});
      stage.text('기울어진 방향 (위에서 봄)', 740, 990, {size: 24, color: T.muted, align: 'center'});
      dirDial(stage, 740, 1150, 110, leanAz(y), 1, {trail: dA > 0 ? [leanAz(2026), leanAz(y)] : null});
      stage.text('돈다', 740, 1296, {size: 28, weight: 700, color: T.ink, align: 'center', alpha: dA});
    });
  },

  // ------------------------------------------------------------------ close
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), sc = ctx.tl.scene('close'), y = m.year(t);
    const q = fadeIn(t, sc.start + 0.2, 0.6), l2 = fadeIn(t, at(A.spinC) - 0.2, 0.5);
    withAlpha(c, q, () => {
      stage.text('정리', 540, 296, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
      stage.text('달과 태양이 불룩한 띠를 당기고,', 540, 362, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
      stage.text('돌고 있는 지구는 고개를 돌린다', 540, 424, {role: 'display', size: 40, weight: 700, color: PAL.pole, align: 'center', alpha: l2});
      line(c, [[480, 470], [600, 470]], T.accent, 4, {cap: 'butt'});
    });
    // Earth with its slow cone (tip trace: symbolic small nod, exaggerated)
    withAlpha(c, fadeIn(t, sc.start + 0.4, 0.6), () => {
      const cam = obliqueCam({cx: 300, cy: 770, k: 100, alpha: 24}), az = leanAz(y), L = 1.9;
      const V = axisView({cx: 300, cy: 770, R: 100}, cam.vec(axisWorld(EPS, az)), {spin: spinLam(t), sun: cam.vec(unit([0.4, 0.8, 0.5])), flat: 0.1});
      const nodPts = (a0, a1) => { const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 1.2)), P = []; for (let i = 0; i <= n; i++) { const azz = lerp(a0, a1, i / n), w = axisWorld(EPS + 0.9 * Math.sin(azz * D2R * 24), azz); const pp = cam.P(w[0] * L, w[1] * L, w[2] * L); P.push([pp[0], pp[1]]); } return P; };
      line(c, nodPts(0, 360), rgba(PAL.pole, 0.3), 1.5);
      const tr = nodPts(leanAz(2026), az); if (tr.length > 1) line(c, tr, PAL.pole, 3);
      planeRing(stage, cam, 1.7, 'back', 0.8);
      earthWithAxis(stage, V, L, {night: 0.4, band: {lat: 14, col: PAL.band, a: 0.22 + 0.25 * fadeIn(t, at(A.q1), 0.5)}});
      planeRing(stage, cam, 1.7, 'front', 0.8);
      stage.text('작은 물결: 끄덕임 (크게 과장)', 300, 548, {size: 24, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.turnC) - 0.2, 0.5)});
    });
    // the sky: the pole moving among the stars
    const o = {cx: 752, cy: 790, R: 170};
    withAlpha(c, fadeIn(t, sc.start + 0.7, 0.6), () => {
      skyDisc(stage, t, {...o, circle: 1, ticks: 0, arc: [2026, y], lines: 0.8});
      const pp = poleXY(o, y); poleMarker(c, pp[0], pp[1], 1);
      for (const [id, s, dx, dy, al] of [['polaris', '북극성', 0, -28, 'center'], ['vega', '베가', 0, 30, 'center'], ['thuban', '투반', 26, 0, 'left']]) {
        const P = starXY(o, id); stage.text(s, P[0] + dx, P[1] + dy, {size: 24, weight: 700, color: T.light, align: al});
      }
      stage.text('하늘의 북극이 옮겨 간다', 752, 1000, {size: 24, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.poleC) - 0.2, 0.5)});
    });
    // readout row
    withAlpha(c, fadeIn(t, sc.start + 0.9, 0.6), () => {
      panel(c, T, 140, 1060, 800, 250, 0.92);
      line(c, [[407, 1080], [407, 1290]], rgba(T.border, 1), 1.2); line(c, [[673, 1080], [673, 1290]], rgba(T.border, 1), 1.2);
      stage.text('기울기', 274, 1104, {size: 24, color: T.muted, align: 'center'});
      stage.text('23.4°', 274, 1180, {role: 'display', size: 50, weight: 700, color: PAL.pole, align: 'center'});
      stage.text('그대로', 274, 1250, {size: 26, weight: 700, color: T.ink, align: 'center'});
      stage.text('한 바퀴', 540, 1104, {size: 24, color: T.muted, align: 'center'});
      stage.text('약 25,770년', 540, 1180, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
      stage.text('끄덕임 18.6년', 540, 1250, {size: 26, weight: 700, color: PAL.nod, align: 'center'});
      stage.text('기울어진 방향', 806, 1104, {size: 24, color: T.muted, align: 'center'});
      dirDial(stage, 806, 1200, 74, leanAz(y), 1, {trail: [leanAz(2026), leanAz(y)]});
    });
  },
};

// ---- bulge + cone (s10): one continuous Earth stage ----
const RD_Y = 990;                                                     // readout panel top (tier 3)
function earthScene(stage, t, p, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), tl = ctx.tl, y = m.year(t), isCone = ctx.scene.id === 'cone';
  const bs = tl.scene('bulge'), a0 = isCone ? 1 : fadeIn(t, bs.start + 0.1, 0.6);
  const {cam, q} = bulgeCam(t, ctx), R = cam.k;
  const flat = 0.12 * easeInOut((t - at(A.notBall) + 0.1) / 1.2);
  const tau = EPS * easeInOut((t - at(A.tilt) + 0.1) / 1.6), az = leanAz(y), nW = axisWorld(tau, az);
  const sunW = unit([0.45, 0.85, 0.28]);
  const V = axisView({cx: cam.cx, cy: cam.cy, R}, cam.vec(nW), {spin: spinLam(t), sun: cam.vec(sunW), flat});
  const bandA = Math.max(0.35 * fadeIn(t, at(A.equator) - 0.1, 0.5), fadeIn(t, at(A.band) - 0.1, 0.5));
  const planeA = Math.max(0.45 * fadeIn(t, bs.start + 0.3, 0.6), fadeIn(t, at(A.plane) - 0.2, 0.5)), moonA = fadeIn(t, at(A.plane) - 0.2, 0.5) * (isCone ? fadeOut(t, bs.end + 0.2, 0.5) : 1);
  const s09 = fadeOut(t, at(A.near) - 0.4, 0.4);                                                     // s08 labels give way in s09
  const L = lerp(1.45, 1.95, q);
  const u = V.u, eDir = [-u[1], u[0]], E = eDir[0] >= 0 ? eDir : [-eDir[0], -eDir[1]];                 // screen equator direction (right end)
  const moon = [800, BULGE_C[1]];
  withAlpha(c, a0, () => {
    // the orbit plane: edge-on line in the bulge scene, an ellipse once the camera rises
    const qL = 1 - smooth(q / 0.35), qR = smooth(q / 0.35);                                // edge-on line ↔ ellipse
    if (qL > 0) withAlpha(c, planeA * qL, () => {
      line(c, [[140, cam.cy], [940, cam.cy]], rgba('#8AA0A6', 0.6), 2);
      stage.text('공전면', 150, cam.cy - 22, {size: 24, weight: 700, color: T.muted});
    });
    if (qR > 0) { planeRing(stage, cam, 2.3, 'fill', qR); planeRing(stage, cam, 2.3, 'back', qR); }
    // Moon and Sun (directions along the plane, to the right)
    withAlpha(c, moonA, () => {
      glow(c, 1010, BULGE_C[1], 140, PAL.sun, 0.35); glow(c, 1010, BULGE_C[1], 60, PAL.sun, 0.6);
      stage.text('태양 쪽 →', 936, BULGE_C[1] - 60, {size: 24, weight: 700, color: PAL.sun, align: 'right'});
      const g = c.createRadialGradient(moon[0] - 8, moon[1] - 8, 3, moon[0], moon[1], 26); g.addColorStop(0, '#EDEFF2'); g.addColorStop(1, '#8D939C'); circle(c, moon[0], moon[1], 26, g);
      stage.text('달', moon[0], moon[1] - 46, {size: 26, weight: 700, color: PAL.moon, align: 'center'});
    });
    // the cone (cone scene)
    const coneA = isCone ? fadeIn(t, at(A.cone) - 0.4, 0.5) : 0;
    if (coneA > 0) withAlpha(c, coneA, () => {
      c.save(); c.setLineDash([4, 7]); line(c, conePts(cam, L, EPS, 0, 360).map(r => [r[0], r[1]]), rgba(PAL.pole, 0.5), 2); c.restore();
      for (const azz of [0, 90, 180, 270]) { const w = axisWorld(EPS, azz), r = cam.P(w[0] * L, w[1] * L, w[2] * L); line(c, [[cam.cx, cam.cy], [r[0], r[1]]], rgba(PAL.pole, 0.16), 1.5); }
      const ec = cam.P(0, 0, L * Math.cos(EPS * D2R)); stage.text('황도 북극', ec[0] + 10, ec[1] + 2, {size: 24, color: T.muted});
    });
    // the ecliptic north (vertical) once the camera rises
    if (qR > 0) withAlpha(c, qR, () => { const zt = cam.P(0, 0, L * Math.cos(EPS * D2R)); line(c, [[cam.cx, cam.cy], [zt[0], zt[1]]], rgba(T.muted, 0.7), 2, {dash: [5, 5]}); });
    const ballA = fadeIn(t, at(A.notBall) - 0.2, 0.4) * fadeOut(t, at(A.tilt) - 0.4, 0.4);
    earthWithAxis(stage, V, L, {night: 0.5, grat: 0.1, band: {lat: 14, col: PAL.band, a: 0.32 * bandA}, equator: 0.45});
    if (qR > 0) planeRing(stage, cam, 2.3, 'front', qR);
    if (qL > 0) withAlpha(c, planeA * 0.5 * qL, () => line(c, [[cam.cx - R, cam.cy], [cam.cx + R, cam.cy]], rgba('#8AA0A6', 0.6), 1.5, {dash: [6, 6]}));
    if (ballA > 0) withAlpha(c, ballA, () => { c.save(); c.setLineDash([6, 6]); ring(c, cam.cx, cam.cy, R * (1 - flat), rgba(T.ink, 0.75), 2); c.restore(); tag(stage, '완전한 공이라면', cam.cx - R * 0.72, cam.cy + R * 0.86, {size: 24, color: T.ink, align: 'right'}); });
    // s07: the two radii
    const rA = fadeIn(t, at(A.equator) - 0.1, 0.5) * fadeOut(t, at(A.tilt) - 0.5, 0.4);
    if (rA > 0 && !isCone) withAlpha(c, rA, () => {
      const Pn = axisTip(V, 1, 1), Ee = [cam.cx + R * E[0], cam.cy + R * E[1]];
      line(c, [[cam.cx, cam.cy], Pn], PAL.cool, 3); line(c, [[cam.cx, cam.cy], Ee], PAL.warm, 3); circle(c, cam.cx, cam.cy, 5, T.ink);
      tag(stage, `극 반지름 ${R_POL.toLocaleString('en-US')} km`, cam.cx - 16, cam.cy - R * 0.55, {size: 24, color: PAL.cool, align: 'right'});
      tag(stage, `적도 반지름 ${R_EQ.toLocaleString('en-US')} km`, cam.cx + R * 0.5, cam.cy + 34, {size: 24, color: PAL.warm});
      const kmA = fadeIn(t, at(A.km21) - 0.1, 0.4), xb = cam.cx + R * (1 - flat), xe = cam.cx + R;
      withAlpha(c, kmA, () => { line(c, [[xb, cam.cy - 46], [xb, cam.cy - 36], [xe, cam.cy - 36], [xe, cam.cy - 46]], PAL.band, 2.5); tag(stage, '약 21 km', xe + 12, cam.cy - 64, {size: 28, role: 'display', color: PAL.band, align: 'left'}); });
    });
    tag(stage, '불룩함 크게 과장', cam.cx, cam.cy + R + 46, {size: 24, color: T.muted, a: fadeIn(t, at(A.notW) - 0.1, 0.5) * (1 - q)});
    // s08: tilt angles
    const degA = fadeIn(t, at(A.deg) - 0.1, 0.4) * s09, offA = fadeIn(t, at(A.off) - 0.1, 0.4) * s09;
    if (degA > 0 && q < 0.5) withAlpha(c, degA, () => {
      line(c, [[cam.cx, cam.cy - R], [cam.cx, cam.cy - R * 1.5]], rgba(T.ink, 0.6), 2, {dash: [5, 5]});
      const an = Math.atan2(u[1], u[0]); ring(c, cam.cx, cam.cy, R * 1.3, PAL.pole, 3, -Math.PI / 2, an);
      tag(stage, `${tau.toFixed(1)}°`, cam.cx + 16, cam.cy - R * 1.43, {size: 30, role: 'display', color: PAL.pole, align: 'left'});
    });
    if (offA > 0 && q < 0.5) withAlpha(c, offA, () => {
      const an = Math.atan2(E[1], E[0]); ring(c, cam.cx, cam.cy, R * 1.18, PAL.band, 3, 0, an);
      line(c, [[cam.cx + R * 1.0 * E[0], cam.cy + R * E[1]], [cam.cx + R * 1.3 * E[0], cam.cy + R * 1.3 * E[1]]], rgba(PAL.band, 0.8), 2, {dash: [5, 4]});
      tag(stage, '23.4°', cam.cx + R * 1.24, cam.cy + 52, {size: 26, role: 'display', color: PAL.band, align: 'left'});
      tag(stage, '불룩한 띠 (적도면)', cam.cx - R * 0.82, cam.cy - R * 0.66, {size: 24, color: PAL.band, align: 'center'});
    });
    // s09: near / far pulls and the twist
    if (!isCone || t < at(A.notFall) + 0.4) {
      const out = isCone ? fadeOut(t, bs.end - 0.1, 0.4) : 1, nA = fadeIn(t, at(A.near) - 0.1, 0.4) * out, fA = fadeIn(t, at(A.harder) - 0.1, 0.4) * out;
      const twA = fadeIn(t, at(A.upright) - 0.1, 0.5) * (isCone ? fadeOut(t, at(A.notFall) - 0.2, 0.5) : 1);
      const rk = R * V.k, rot = Math.atan2(E[1], E[0]);
      const crescent = (side, col) => {
        const hx = cam.cx, hy = cam.cy, nx = E[0], ny = E[1];
        c.save(); c.beginPath();                                                           // keep one side of the axis line
        c.moveTo(hx - ny * 1000, hy + nx * 1000); c.lineTo(hx + ny * 1000, hy - nx * 1000);
        c.lineTo(hx + ny * 1000 + side * nx * 2000, hy - nx * 1000 + side * ny * 2000); c.lineTo(hx - ny * 1000 + side * nx * 2000, hy + nx * 1000 + side * ny * 2000); c.closePath(); c.clip();
        c.beginPath(); c.ellipse(hx, hy, R, rk, rot, 0, TAU); c.moveTo(hx + rk, hy); c.arc(hx, hy, rk, 0, TAU, true); c.fillStyle = col; c.fill('evenodd');
        c.restore();
      };
      if (nA > 0) withAlpha(c, nA, () => {
        crescent(1, rgba(PAL.band, 0.75));
        const N = [cam.cx + R * (1 - flat / 2) * E[0], cam.cy + R * (1 - flat / 2) * E[1]], d = unit([moon[0] - N[0], moon[1] - N[1], 0]);
        arrow(c, N, [N[0] + d[0] * 150, N[1] + d[1] * 150], PAL.warm, 5, {head: 18});
        tag(stage, '가까운 쪽 · 더 세게', N[0] + 40, N[1] + 64, {size: 24, color: PAL.warm, align: 'left'});
      });
      if (fA > 0) withAlpha(c, fA, () => {
        crescent(-1, rgba(PAL.band, 0.55));
        const F = [cam.cx - R * (1 - flat / 2) * E[0], cam.cy - R * (1 - flat / 2) * E[1]], d = unit([moon[0] - F[0], moon[1] - F[1], 0]);
        arrow(c, F, [F[0] + d[0] * 62, F[1] + d[1] * 62], rgba(PAL.warm, 0.8), 4, {head: 14});
        tag(stage, '먼 쪽 · 약하게', F[0] + 20, F[1] - 52, {size: 24, color: PAL.warm, align: 'center'});
      });
      if (twA > 0) withAlpha(c, twA, () => {
        const an = Math.atan2(u[1], u[0]), rr = R * 1.25, a1 = -Math.PI / 2 + 0.05, pts = [];
        for (let i = 0; i <= 20; i++) { const aa = lerp(an, a1, i / 20); pts.push([cam.cx + rr * Math.cos(aa), cam.cy + rr * Math.sin(aa)]); }
        c.save(); c.setLineDash([6, 6]); line(c, [[cam.cx, cam.cy - R], [cam.cx, cam.cy - R * 1.45]], rgba(PAL.cool, 0.8), 2.5); c.restore();
        line(c, pts.slice(0, -2), PAL.cool, 4); arrow(c, pts[pts.length - 4], pts[pts.length - 1], PAL.cool, 4, {head: 16});
        tag(stage, '축을 바로 세우려는 비트는 힘', cam.cx - 150, cam.cy - R * 1.38, {size: 24, color: PAL.cool, border: PAL.cool, align: 'center'});
      });
    }
    // cone scene: precession (clockwise from above) and spin (west → east) arrows, the traced tip
    if (isCone) {
      const trA = fadeIn(t, at(A.cone) - 0.4, 0.5), az0 = leanAz(2026);
      const tr = conePts(cam, L, EPS, az0, az); if (tr.length > 1) withAlpha(c, trA, () => line(c, tr.map(r => [r[0], r[1]]), PAL.pole, 3.5));
      const sA = fadeIn(t, at(A.notFall) - 0.2, 0.5), pA = fadeIn(t, at(A.slowly) - 0.2, 0.5);
      withAlpha(c, sA, () => {                                                            // spin arrow around the axis above the pole
        const n = nW, b1 = unit(cross(n, [0, 0, 1])), b2 = cross(n, b1), pts = [];
        for (let i = 0; i <= 36; i++) { const uu = (i * 8) * D2R, w = [1.3 * n[0] + 0.32 * (Math.cos(uu) * b1[0] + Math.sin(uu) * b2[0]), 1.3 * n[1] + 0.32 * (Math.cos(uu) * b1[1] + Math.sin(uu) * b2[1]), 1.3 * n[2] + 0.32 * (Math.cos(uu) * b1[2] + Math.sin(uu) * b2[2])]; const r = cam.P(...w); pts.push([r[0], r[1]]); }
        line(c, pts.slice(0, -2), rgba(PAL.cool, 0.95), 3); arrow(c, pts[pts.length - 4], pts[pts.length - 1], PAL.cool, 3, {head: 13});
        const lp = cam.P(1.3 * n[0], 1.3 * n[1], 1.3 * n[2]), sd = lp[0] >= cam.cx ? 1 : -1;
        tag(stage, '자전 · 서 → 동', lp[0] + sd * 66, lp[1] + 8, {size: 24, color: PAL.cool, align: sd > 0 ? 'left' : 'right'});
      });
      withAlpha(c, pA, () => {
        const ah = az - 34, pts = conePts(cam, L + 0.14, EPS, ah + 26, ah - 2).map(r => [r[0], r[1]]);
        line(c, pts.slice(0, -2), PAL.pole, 4); arrow(c, pts[pts.length - 4], pts[pts.length - 1], PAL.pole, 4, {head: 16});
        tag(stage, '세차 · 시계 방향 (황도 북극 쪽에서 볼 때)', 540, 312, {size: 24, color: PAL.pole, border: PAL.pole});
      });
    }
  });
  // readouts (tier 3): tilt, lean direction (dial), the 2 : 1 share / elapsed years
  const rdA = fadeIn(t, bs.start + 0.4, 0.6) * (isCone ? fadeOut(t, at('s11') - 0.9, 0.5) : 1), Y0 = RD_Y;
  withAlpha(c, rdA, () => {
    panel(c, T, 140, Y0, 800, 300, 0.92);
    line(c, [[407, Y0 + 20], [407, Y0 + 280]], rgba(T.border, 1), 1.2); line(c, [[673, Y0 + 20], [673, Y0 + 280]], rgba(T.border, 1), 1.2);
    stage.text('기울기', 274, Y0 + 44, {size: 24, color: T.muted, align: 'center'});
    stage.text(`${tau.toFixed(1)}°`, 274, Y0 + 140, {role: 'display', size: 56, weight: 700, color: PAL.pole, align: 'center'});
    stage.text(isCone ? '그대로' : '공전면 수직 기준', 274, Y0 + 230, {size: 24, weight: 700, color: T.ink, align: 'center'});
    stage.text('기울어진 방향', 540, Y0 + 44, {size: 24, color: T.muted, align: 'center'});
    dirDial(stage, 540, Y0 + 168, 86, az, tau / EPS, {sun: !isCone || t < bs.end + 0.6, trail: Math.abs(az - leanAz(2026)) > 0.3 ? [leanAz(2026), az] : null});
    if (!isCone) {
      const sA = fadeIn(t, at(A.moonShare) - 0.2, 0.5), tA = fadeIn(t, at(A.two) - 0.1, 0.4);
      stage.text('비트는 힘의 몫', 806, Y0 + 44, {size: 24, color: T.muted, align: 'center'});
      withAlpha(c, sA, () => {
        rect(c, 706, Y0 + 84, 200 * 2 / 3, 40, 4, PAL.moon); rect(c, 706 + 200 * 2 / 3 + 3, Y0 + 84, 200 / 3 - 3, 40, 4, PAL.sun);
        stage.text('달', 706 + 200 / 3, Y0 + 105, {size: 24, weight: 700, color: '#1A2228', align: 'center'});
        stage.text('해', 706 + 200 * 5 / 6 + 1, Y0 + 105, {size: 24, weight: 700, color: '#2A1D08', align: 'center'});
        stage.text('달 : 태양', 806, Y0 + 176, {size: 26, weight: 700, color: T.ink, align: 'center'});
        stage.text('≈ 2 : 1', 806, Y0 + 232, {role: 'display', size: 40, weight: 700, color: T.light, align: 'center', alpha: tA});
      });
    } else {
      const el = Math.min(25770, Math.round(Math.max(0, y - 2026) / 10) * 10);
      stage.text('흐른 시간', 806, Y0 + 44, {size: 24, color: T.muted, align: 'center'});
      stage.text(`${el.toLocaleString('en-US')}년`, 806, Y0 + 140, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
      stage.text('한 바퀴 약 25,770년', 806, Y0 + 230, {size: 24, weight: 700, color: PAL.pole, align: 'center', alpha: fadeIn(t, at(A.yrs26) - 0.2, 0.5)});
    }
  });
}

// ---- s11: the sky again — the pole among the stars, back to Thuban ----
function skyScene(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), y = m.year(t), o = SKY_HOOK;
  const sA = fadeIn(t, at(A.skyPole) - 0.2, 0.5), thA = fadeIn(t, evT(ctx, 'chime_thuban', A.thuban) - 0.1, 0.4), pyrA = fadeIn(t, at(A.pyramid) - 0.1, 0.5);
  withAlpha(c, a, () => {
    skyDisc(stage, t, {...o, circle: 1, ticks: 1, arc: y < 2025 ? [2026, y] : null, nep: 0.8});
    // the three stations
    const st = [['polaris', '지금 · 북극성', 1, 'left', 30, -34], ['vega', '약 14000년 · 베가', 1, 'right', -30, 44], ['thuban', '기원전 2700년경 · 투반 (용자리)', thA, 'right', 228, 52]];
    for (const [id, s, al, align, dx, dy] of st) {
      const P = starXY(o, id); if (al <= 0) continue;
      withAlpha(c, al * sA, () => { ring(c, P[0], P[1], 20, rgba(T.light, 0.8), 2); tag(stage, s, P[0] + dx, P[1] + dy, {size: 24, align, color: id === 'thuban' ? PAL.pole : T.light, border: id === 'thuban' ? PAL.pole : null}); });
    }
    // pyramid glyph near Thuban
    withAlpha(c, pyrA * thA, () => {
      const P = starXY(o, 'thuban'), x = P[0] + 2, yb = P[1] + 124;
      poly(c, [[x - 30, yb], [x + 30, yb], [x, yb - 34]], rgba(PAL.sun, 0.18), rgba(PAL.sun, 0.9), 2); line(c, [[x, yb - 34], [x + 8, yb]], rgba(PAL.sun, 0.5), 1.2);
      stage.text('피라미드 시대', x + 42, yb - 14, {size: 24, weight: 700, color: PAL.sun});
    });
    stage.text('황도 북극', o.cx, o.cy + 26, {size: 24, color: T.muted, align: 'center', alpha: sA * 0.9});
    const pp = poleXY(o, y); poleMarker(c, pp[0], pp[1], 1);
    panel(c, T, 300, 1150, 480, 150, 0.92);
    stage.text('하늘의 북극이 가리키는 해', 540, 1184, {size: 24, color: T.muted, align: 'center'});
    stage.text(y < -2690 ? '기원전 2700년경' : y > 2025.5 ? '지금 · 2026년' : fmtYear(Math.round(y / 100) * 100), 540, 1244, {role: 'display', size: 46, weight: 700, color: PAL.pole, align: 'center'});
  });
}

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
  // millennium ticks while a year counter runs (hook, cone, s11, climate)
  const T0 = m.ticks[0].t;
  ev.push({id: 'kyr_ticks', at: r(T0, 4), kind: 'custom', params: {gain_db: -30, layers: m.ticks.map(x => ({kind: 'tick', offset: r(x.t - T0, 4), params: {freq: 1320, decay: 0.035, click: 0.15}}))},
    model: {n: m.keys.length, ticks: m.ticks.length, t0: r(T0, 4), t_last: r(m.keys[m.keys.length - 1][0], 4), map: 'one soft tick per 2000-year boundary crossed by a shown time-lapse'},
    means: `연도 표시가 흐르는 동안 2천 년 경계를 지날 때마다 작은 틱 — ${m.ticks.length}번 (훅·원뿔·투반·근일점 되감기)`});
  // precession phase → pitch while the pole/axis turns on screen (one octave per full turn; back in time = lower)
  for (const [i, [t0, t1]] of m.turns.entries()) {
    const s0 = t0 - 0.15, s1 = t1 + 0.35;
    ev.push({id: ['sweep_vega', 'sweep_cone', 'sweep_thuban'][i] || `sweep_${i}`, at: r(s0, 4), kind: 'chirp',
      params: {gain_db: -29, harmonics: [1, 0.35, 0.12], fade: 0.05, points: chirpTable(s0, s1, tt => pitchOf(m.year(tt)), tt => 0.8 * env(tt, s0, s1, 0.3, 0.45))},
      means: '자전축 방향이 돈 각도 → 음높이 (2026년 = 220 Hz, 한 바퀴 = 한 옥타브 위, 과거로 가면 내려감)'});
  }
  // hook
  ev.push({id: 'lab_axis', at: A.axisW, kind: 'silent', means: '하늘의 북극 표식'});
  ev.push({id: 'lab_circle', at: A.turnW, kind: 'silent', means: '세차의 원이 그려짐'});
  ev.push({id: 'lab_nod', at: A.nodW, kind: 'silent', means: '북극 표식이 살짝 끄덕임'});
  ev.push({id: 'lab_polaris', at: A.polaris, kind: 'silent', means: '북극성 표시'});
  ev.push({id: 'chime_vega', at: {...A.vega, offset: 0.5}, kind: 'tone', params: {freq: 880, dur: 1.6, harmonics: [1, 0.45, 0.2], attack: 0.006, decay: 0.55, sustain: 0.0, release: 0.6, gain_db: -27},
    means: '하늘의 북극이 베가 곁에 닿음 (이름 붙은 별에 닿을 때의 종소리)'});
  // origin
  ev.push({id: 'lab_old', at: A.old, kind: 'silent', means: '춘분점 150년 되감기·옛 기록'});
  ev.push({id: 'lab_fix', at: A.fix, kind: 'tick', params: {freq: 990, decay: 0.07, gain_db: -27, click: 0.2}, means: '절기 눈금을 바로잡음'});
  ev.push({id: 'lab_1748', at: A.y1748, kind: 'silent', means: '1748 · 브래들리 카드'});
  // essence: constant hum of the spinning top
  const e0 = tl.scene('essence').start + 0.1, e1 = tl.scene('essence').end - 0.05;
  ev.push({id: 'hum_top', at: r(e0, 4), kind: 'chirp', params: {gain_db: -31, harmonics: [1, 0.5, 0.25], fade: 0.05, points: chirpTable(e0, e1, () => 147, tt => 0.7 * env(tt, e0, e1, 0.6, 0.6), 0.1)},
    means: '돌고 있는 팽이의 일정한 회전음 (회전 = 같은 높이로 계속)'});
  ev.push({id: 'lab_gravity', at: A.pull, kind: 'silent', means: '중력 화살표'});
  ev.push({id: 'turn_side', at: A.side, kind: 'swell', params: {freqs: [294, 440], dur: 1.4, gain_db: -28}, means: '축이 옆으로 돌기 시작'});
  // bulge
  ev.push({id: 'lab_flat', at: A.notBall, kind: 'silent', means: '공 → 불룩한 지구'});
  ev.push({id: 'lab_21', at: A.km21, kind: 'tick', params: {freq: 880, decay: 0.07, gain_db: -27, click: 0.2}, means: '"약 21 km" 표시'});
  ev.push({id: 'lab_tilt', at: A.deg, kind: 'silent', means: '축이 23.4° 기울어짐'});
  ev.push({id: 'lab_off', at: A.off, kind: 'silent', means: '띠와 공전면 사이 23.4°'});
  ev.push({id: 'pull_near', at: A.near, kind: 'noise', params: {dur: 0.35, low: 300, high: 1400, attack: 0.04, release: 0.25, gain_db: -27}, means: '가까운 쪽 불룩한 부분을 당기는 화살표 (당김 펄스)'});
  ev.push({id: 'pull_far', at: A.harder, kind: 'noise', params: {dur: 0.25, low: 300, high: 1400, attack: 0.04, release: 0.18, gain_db: -33}, means: '먼 쪽은 더 약하게 당김 (같은 소리, 더 작게)'});
  ev.push({id: 'twist', at: A.upright, kind: 'whoosh', params: {dur: 0.9, f_start: 500, f_end: 1600, q: 2.0, gain_db: -29}, means: '축을 바로 세우려는 비트는 힘 (휘는 화살표)'});
  ev.push({id: 'ratio', at: A.two, kind: 'custom', params: {gain_db: -27, layers: [{kind: 'tick', offset: 0, params: {freq: 740, decay: 0.07, click: 0.2}}, {kind: 'tick', offset: 0.16, params: {freq: 740, decay: 0.07, click: 0.2}}, {kind: 'tick', offset: 0.5, params: {freq: 990, decay: 0.07, click: 0.2}}]},
    means: '달 : 태양 ≈ 2 : 1 — 달 쪽 두 번(낮은 틱), 태양 쪽 한 번(높은 틱)'});
  // cone
  const c0 = at(A.but) - 0.1, c1 = at('s10:end') + 0.2;
  ev.push({id: 'hum_earth', at: r(c0, 4), kind: 'chirp', params: {gain_db: -33, harmonics: [1, 0.5, 0.25], fade: 0.05, points: chirpTable(c0, c1, () => 147, tt => 0.7 * env(tt, c0, c1, 0.6, 0.6), 0.1)},
    means: '돌고 있는 지구 — 팽이와 같은 회전음 (같은 대응)'});
  ev.push({id: 'lab_cone', at: A.cone, kind: 'silent', means: '원뿔 자국'});
  ev.push({id: 'lab_sky', at: A.skyPole, kind: 'silent', means: '하늘 원반 다시'});
  ev.push({id: 'chime_thuban', at: A.thuban, kind: 'tone', params: {freq: 784, dur: 1.6, harmonics: [1, 0.45, 0.2], attack: 0.006, decay: 0.55, sustain: 0.0, release: 0.6, gain_db: -27},
    means: '하늘의 북극이 투반에 닿음 (같은 종소리, 과거라 조금 낮게)'});
  // nod: Moon's twisting force over the 18.6-yr cycle → loudness of a steady tone
  const n0 = at(A.moonOrbit) - 0.3, n1 = tl.scene('nod').end - 0.3;
  ev.push({id: 'nod_beat', at: r(n0, 4), kind: 'chirp', params: {gain_db: -29, harmonics: [1, 0.3], fade: 0.05, points: chirpTable(n0, n1, () => 330, tt => (0.2 + 0.6 * torqueNorm(m.year(tt))) * env(tt, n0, n1, 0.5, 0.6), 0.05)},
    means: '달이 비트는 힘(달 궤도–적도 각) → 크기: 18.6년마다 한 번 커졌다 작아지는 박자'});
  ev.push({id: 'lab_five', at: A.five, kind: 'silent', means: '달 궤도 약 5°'});
  ev.push({id: 'lab_node', at: A.y186, kind: 'silent', means: '교점선 18.6년'});
  ev.push({id: 'lab_moon', at: A.fullMoon, kind: 'silent', means: '보름달과 9.2″ 비교'});
  ev.push({id: 'lab_200', at: A.d200, kind: 'tick', params: {freq: 1760, decay: 0.03, gain_db: -30, click: 0.1}, means: '"약 1/200" — 아주 작은 틱'});
  // climate
  ev.push({id: 'lab_now', at: A.nowS, kind: 'silent', means: '지금: 근일점 = 북반구 겨울'});
  ev.push({id: 'lab_summer', at: A.summer, kind: 'tick', params: {freq: 990, decay: 0.07, gain_db: -27, repeat: 2, interval: 0.14, click: 0.2}, means: '약 1만 1천 년 전: 근일점 = 북반구 여름'});
  ev.push({id: 'lab_beat', at: A.slowCircle, kind: 'silent', means: '세차의 박자 약 2만 1천 년'});
  // use
  ev.push({id: 'fix_prec', at: A.precW, kind: 'tick', params: {freq: 660, decay: 0.08, gain_db: -27, click: 0.2}, means: '세차 보정: 겨냥이 크게 옮겨짐'});
  ev.push({id: 'fix_nut', at: A.nutW, kind: 'tick', params: {freq: 1320, decay: 0.04, gain_db: -30, click: 0.1}, means: '장동 보정: 작게 한 번 더'});
  ev.push({id: 'on_target', at: A.exact, kind: 'tone', params: {freq: 880, dur: 1.2, harmonics: [1, 0.45, 0.2], attack: 0.006, decay: 0.45, sustain: 0.0, release: 0.5, gain_db: -28}, means: '목표 별에 정확히 맞음'});
  // myth / close
  ev.push({id: 'myth_no', at: A.notM, kind: 'tick', params: {freq: 520, decay: 0.1, gain_db: -26, repeat: 2, interval: 0.12}, means: '오해에 줄을 그음 → "아니다"'});
  ev.push({id: 'lab_dir', at: A.dirM, kind: 'silent', means: '기울어진 방향이 돎'});
  ev.push({id: 'close_swell', at: A.turnC, kind: 'swell', params: {freqs: [220, 330, 440], dur: 1.8, gain_db: -28}, means: '정리: 쓰러지는 대신 고개를 돌린다'});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음(사용자 결정). 모든 사건은 `node episodes/precession/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형(연도 y(t), 세차 위상, 18.6년 교점, 달의 비트는 힘)에서 써 넣습니다. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const m = model(tl);
  console.log(`events: ${sound.events.length}; year keys ${m.keys.length}; millennium ticks ${m.ticks.length}; turns ${m.turns.length}`);
  console.log(`pole closest: Polaris ${POLE_YEARS.polaris.toFixed(0)}, Thuban ${POLE_YEARS.thuban.toFixed(0)}, Vega ${POLE_YEARS.vega.toFixed(0)}; Vega off the circle ${(90 - STARS.vega.beta - EPS).toFixed(2)}°, Thuban ${(90 - STARS.thuban.beta - EPS).toFixed(2)}°, Polaris ${(90 - STARS.polaris.beta - EPS).toFixed(2)}°`);
  console.log(`moon/equator angle ${TH_MIN.toFixed(2)}…${TH_MAX.toFixed(2)}°, torque ratio min/max ${TQ_MIN.toFixed(3)}; 9.2″/moon = 1/${(MOON_DIAM / NUT_EPS).toFixed(0)}; perihelion decl now ${periDecl(2026).toFixed(1)}°, 11 kyr ago ${periDecl(2026 - 11000).toFixed(1)}°`);
}
