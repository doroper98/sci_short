// Episode scenes — "제임스웹은 얼마나 높이 있을까 — 산에서 우주까지" (23)
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Circular orbits only: v = √(GM/r), T = 2π√(r³/GM), GM = 398,600.4 km³/s², R⊕ = 6,371 km.
//    ISS 400 km → 7.67 km/s, 92.4 min · Hubble 500 km → 7.61 km/s, 94.5 min · polar weather 820 km → 7.44 km/s,
//    101 min · GPS 20,200 km → 3.87 km/s, 11 h 58 min · GEO (T = 1 sidereal day 86,164 s) → 35,786 km, 3.07 km/s ·
//    Moon 384,400 km (centre distance; drawn as an altitude on the ladder, 27.3 d) · L1/L2 ≈ 1.5 million km.
//  - Log altitude ladder: screen y ∝ log10(altitude km). Mountains, airliner, the 100 km line and everything above share it.
//    Mountain silhouettes are stylised profiles whose heights are mapped through the same log scale.
//  - Air density readout: US Standard Atmosphere 1976 (log-interpolated); 100 km → 5.6×10⁻⁷ kg/m³ ≈ 1/2,200,000 of sea level.
//  - Newton's cannon: real gravity μ/r² integrated (RK4, 0.5 s steps) from a mountain exaggerated to 950 km;
//    shots at 6.5, 7.0 and 7.38 km/s (= circular speed there). Time ×1,100 (one ISS orbit 92 min → about 5 s).
//  - Orbit views: ortho 3D, Earth radius in px = scale, orbits at true radius in that scale, real inclinations
//    (ISS 51.6°, Hubble 28.5°, Starlink 53°, polar weather 98.7°, GEO 0°). Phases run on one model clock
//    τ(t) = ∫K dt (K = real seconds per screen second): ×1,100 in the essence/LEO dashboard, ramping to ×7,180
//    ("하루를 12초로") in the GEO scene. The Earth turns on the same clock (one sidereal day = 86,164 s).
//  - Geostationary view (s17): perspective camera at 6.62 Earth radii above 0°N 128.2°E (천리안 2A); the Sun direction
//    turns with the same day clock, so the terminator sweeps while the Earth stays fixed in the frame.
//  - Solar scene: L1/L2 distance (0.01 AU) exaggerated ×20 in the Sun-centred view; the lower strip is true scale
//    (Moon 384,400 km : L1/L2 1.5 million km = 1 : 3.9). One year = 8 s.
//  - Myth: g(h) = 9.81·(R/(R+h))²; at 400 km 8.68 m/s² = 88 % ("약 90퍼센트").
//  - Hubble altitude history (s14): about 600 km in 1990 → about 500 km in 2026 (representative values).
//  - Sound: node episodes/orbit-altitudes/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, TAU, rand, loadTimeline,
} from '../../pipeline/render/index.mjs';
import {D2R, cross, unit, dot, add, sub, mul, loadLand, lookCam, earthTextures, drawEarthLit, makeStars} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = {base: 'navy', accent: '#F2C14E'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const GM = 398600.4418, R_E = 6371, SID = 86164.1, YEAR_S = 365.256 * 86400, G0 = 9.81;
export const vCirc = h => Math.sqrt(GM / (R_E + h));                           // km/s
export const period = h => TAU * Math.sqrt((R_E + h) ** 3 / GM);               // s
export const H_GEO = 35786;                                                    // r = 42,164 km from the equatorial radius 6,378 km (T = 1 sidereal day)
export const gRatio = h => (R_E / (R_E + h)) ** 2;
export const LOG = Math.log10;
export const OBJ = {
  baekdu: {h: 2.744}, everest: {h: 8.849}, plane: {h: 11}, karman: {h: 100},
  iss: {h: 400, inc: 51.6, raan: 20, ph: 0.6, name: '국제우주정거장', short: '우주정거장', col: '#F2C14E'},
  hubble: {h: 500, inc: 28.5, raan: 120, ph: 2.4, name: '허블', short: '허블', col: '#9FD3FF'},
  starlink: {h: 500, inc: 53, raan: 250, ph: 0, name: '스타링크', col: '#DDE6F5'},
  weather: {h: 820, inc: 98.7, raan: 300, ph: 4.0, name: '극궤도 기상위성', short: '기상위성', col: '#8FE3BF'},
  leoTop: {h: 2000}, gps: {h: 20200}, geo: {h: H_GEO}, moon: {h: 384400}, l2: {h: 1.5e6},
};
for (const k of Object.keys(OBJ)) OBJ[k].T = period(OBJ[k].h);
export const K1 = 1100;                         // real s per screen s: cannon, s09, LEO (ISS 92 min ≈ 5 s)
export const K2 = SID / 12;                     // "하루를 12초로" (GEO scene)
export const K3 = YEAR_S / 8;                   // "1년을 8초로" (solar scene)
// US Standard Atmosphere 1976 density (km, kg/m³)
const RHO = [[0, 1.225], [5, 0.7364], [11, 0.3639], [20, 0.08891], [30, 0.01841], [40, 0.003996], [50, 0.001027], [60, 3.097e-4], [70, 8.283e-5],
  [80, 1.846e-5], [90, 3.416e-6], [100, 5.604e-7], [120, 2.222e-8], [150, 2.076e-9], [200, 2.541e-10], [300, 1.916e-11], [400, 2.803e-12], [500, 5.215e-13]];
export function rho(h) {
  if (h <= 0) return RHO[0][1]; let i = 0; while (i < RHO.length - 2 && h > RHO[i + 1][0]) i++;
  const [h0, r0] = RHO[i], [h1, r1] = RHO[i + 1], q = (h - h0) / (h1 - h0);
  return 10 ** lerp(LOG(r0), LOG(r1), q);
}
// Newton's cannon (μ in km³/s², positions km; ball starts at the mountain top moving clockwise on screen)
export const CANNON = {h0: 950, speeds: [6.5, 7.0, Math.sqrt(GM / (R_E + 950))]};
function cannonTrack(v0) {
  const r0 = R_E + CANNON.h0, dt = 0.5, out = [[0, 0, r0]];
  let x = 0, y = r0, vx = v0, vy = 0, t = 0;
  const acc = (x, y) => { const r = Math.hypot(x, y), k = -GM / (r * r * r); return [k * x, k * y]; };
  const Tc = period(CANNON.h0);
  while (t < Tc * 1.02) {
    const a1 = acc(x, y), x2 = x + vx * dt / 2, y2 = y + vy * dt / 2, v2x = vx + a1[0] * dt / 2, v2y = vy + a1[1] * dt / 2, a2 = acc(x2, y2);
    const x3 = x + v2x * dt / 2, y3 = y + v2y * dt / 2, v3x = vx + a2[0] * dt / 2, v3y = vy + a2[1] * dt / 2, a3 = acc(x3, y3);
    const x4 = x + v3x * dt, y4 = y + v3y * dt, v4x = vx + a3[0] * dt, v4y = vy + a3[1] * dt, a4 = acc(x4, y4);
    x += dt / 6 * (vx + 2 * v2x + 2 * v3x + v4x); y += dt / 6 * (vy + 2 * v2y + 2 * v3y + v4y);
    vx += dt / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]); vy += dt / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]); t += dt;
    out.push([t, x, y]);
    if (Math.hypot(x, y) <= R_E) break;
  }
  return {pts: out, end: t, hit: Math.hypot(x, y) <= R_E};
}
export const CANNON_TRACKS = CANNON.speeds.map(cannonTrack);

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  baekdu1: W('s01', '백두산에서'), jwst1: W('s01', '제임스웹'), sky1: W('s01', '하늘의'),
  baekdu2: W('s02', '백두산은'), m2744: W('s02', '이천칠백사십사미터'), himal: W('s02', '히말라야의'), everest: W('s02', '에베레스트는'), m8849: W('s02', '팔천팔백사십구미터로'), highest: W('s02', '가장'),
  then3: W('s03', '그런데'), jwst3: W('s03', '제임스웹은'), km150: W('s03', '백오십만'), out3: W('s03', '밖'), moon3: W('s03', '달보다도'), four3: W('s03', '네'), far3: W('s03', '먼'),
  screen4: W('s04', '화면에'), up4: W('s04', '위로'), climb4: W('s04', '오를'), ten4: W('s04', '열'), ruler4: W('s04', '눈금을'),
  air5: W('s05', '공기는'), thin5: W('s05', '옅어져'), km100: W('s05', '백킬로미터'), space5: W('s05', '우주가'), border5: W('s05', '경계로'),
  sat6: W('s06', '위성을'), satl6: W('s06', '새틀라이트는'), king6: W('s06', '왕을'), guard6: W('s06', '호위병이라는'), latin6: W('s06', '라틴어에서'), kepler6: W('s06', '케플러가'), jup6: W('s06', '목성의'),
  newton7: W('s07', '뉴턴은'), mount7: W('s07', '높은'), ball7: W('s07', '대포알을'), faster7: W('s07', '빠르게'), shoot7: W('s07', '쏘는'),
  enough8: W('s08', '충분히'), fall8: W('s08', '떨어지는'), round8: W('s08', '둥근'), away8: W('s08', '멀어져'), touch8: W('s08', '닿지'), around8: W('s08', '지구를'),
  high9: W('s09', '높을수록'), slow9: W('s09', '느리게'), lap9: W('s09', '바퀴에'), long9: W('s09', '길어집니다'),
  km2000: W('s10', '이천킬로미터'), low10: W('s10', '낮은'), leo10: W('s10', '저궤도라고'),
  iss11: W('s11', '국제우주정거장은'), km400: W('s11', '사백킬로미터'), min92: W('s11', '구십이분마다'),
  hubble12: W('s12', '허블'), star12: W('s12', '스타링크'), comm12: W('s12', '통신위성은'), km500: W('s12', '오백킬로미터'),
  pole13: W('s13', '남극과'), cloud13: W('s13', '구름을'), wx13: W('s13', '기상위성은'), km800: W('s13', '팔백킬로미터쯤에'),
  close14: W('s14', '자세히'), thin14: W('s14', '옅은'), drag14: W('s14', '끌려'), down14: W('s14', '내려옵니다'),
  geo15: W('s15', '삼만오천칠백팔십육킬로미터에'), lap15: W('s15', '바퀴'), spin15: W('s15', '자전과'), same15: W('s15', '같아집니다'),
  ground16: W('s16', '땅에서'), spot16: W('s16', '한자리에'), stop16: W('s16', '멈춰'), geo16: W('s16', '정지궤도라고'),
  korea17: W('s17', '우리나라'), chol17: W('s17', '천리안과'), mug17: W('s17', '무궁화도'), pen17: W('s17', '한반도를'),
  far18: W('s18', '더'), km150_18: W('s18', '백오십만'), earth18: W('s18', '지구와'), side18: W('s18', '나란히'), year18: W('s18', '일년에'), sun18: W('s18', '태양을'),
  sunside19: W('s19', '태양'), soho19: W('s19', '소호'), watch19: W('s19', '지켜보고'), opp19: W('s19', '반대쪽에서는'), jwst19: W('s19', '제임스웹이'), back19: W('s19', '등지고'), cold19: W('s19', '차갑게'), univ19: W('s19', '우주를'),
  iss20: W('s20', '우주정거장의'), float20: W('s20', '둥둥'), grav20: W('s20', '중력이'), not20: W('s20', '아닙니다'),
  grav21: W('s21', '중력은'), pct21: W('s21', '구십퍼센트이고'), both21: W('s21', '정거장과'), together21: W('s21', '함께'), fall21: W('s21', '떨어지며'), float21: W('s21', '뜹니다'),
  high22: W('s22', '높을수록'), slow22: W('s22', '느리게'), each22: W('s22', '위성마다'), job22: W('s22', '맡은'), height22: W('s22', '높이가'),
};

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];
export const FULL = [-1.2, 6.55];                // log10 km range of the full ladder (63 m … 3.5 million km)
export const LOW = [-1.25, 1.3];                 // s02 close-up (56 m … 20 km)
export const TOPV = [3.85, 6.5];                 // s03 arrival (7,000 km … 3.2 million km)
export const DECADES = [-1, 0, 1, 2, 3, 4, 5, 6];
export const rungHz = d => +(98 * 2 ** (3 * (d + 1) / 12)).toFixed(2);   // a minor third per ×10 (98 … 293 Hz)
const ease = (a, b, t0, t1, t) => lerp(a, b, easeInOut((t - t0) / (t1 - t0)));
/** sample times where f(t) crosses each level (f monotone on [t0, t1]) */
function crossTimes(f, levels, t0, t1, dt = 1 / 240) {
  const out = []; let prev = f(t0);
  for (let t = t0 + dt; t <= t1 + 1e-9; t += dt) { const v = f(t); for (const L of levels) if ((prev - L) * (v - L) < 0 || (v === L && prev !== L)) out.push({L, t: +(t - dt * (v - L) / (v - prev)).toFixed(4)}); prev = v; }
  return out;
}

export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  P.at = at;
  // ---- hook: ladder view (log10 range) over time
  P.zoomIn = [at('s02') - 0.55, at('s02') + 0.9];
  P.climb = [at(A.then3) - 0.05, at(A.out3) + 0.35];
  P.zoomOut = [sc('hook').end - 1.15, sc('hook').end - 0.05];
  P.hookView = t => {
    if (t < P.zoomIn[0]) return FULL;
    if (t < P.zoomIn[1]) return [ease(FULL[0], LOW[0], ...P.zoomIn, t), ease(FULL[1], LOW[1], ...P.zoomIn, t)];
    if (t < P.climb[0]) return LOW;
    if (t < P.climb[1]) return [ease(LOW[0], TOPV[0], ...P.climb, t), ease(LOW[1], TOPV[1], ...P.climb, t)];
    if (t < P.zoomOut[0]) return TOPV;
    return [ease(TOPV[0], FULL[0], ...P.zoomOut, t), ease(TOPV[1], FULL[1], ...P.zoomOut, t)];
  };
  // a rung tone each time the middle of the view passes a decade during the climb
  P.climbRungs = crossTimes(t => (P.hookView(t)[0] + P.hookView(t)[1]) / 2, [1, 2, 3, 4, 5], ...P.climb);
  P.bdLabel = Math.max(MORPH[1] + 0.1, at(A.baekdu1)); P.jwLabel = at(A.jwst1) - 0.05;
  P.bdRise = [at(A.baekdu2) - 0.1, at(A.m2744) + 0.6]; P.evRise = [at(A.everest) - 0.1, at(A.m8849) + 0.6];
  P.himal = at(A.himal) - 0.1; P.highest = at(A.highest) - 0.1;
  P.jwst3 = at(A.jwst3) - 0.1; P.arrive = P.climb[1]; P.moon3 = at(A.moon3) - 0.1; P.four3 = at(A.four3) - 0.1;
  // ---- scale
  P.cmp = sc('scale').start + 0.25; P.screen4 = at(A.screen4) - 0.1;
  { const a = at(A.up4) - 0.05, b = at(A.ruler4) + 0.2; P.rungSteps = DECADES.map((d, k) => +(a + (b - a) * k / (DECADES.length - 1)).toFixed(4)); }
  P.atmo = at('s05') - 0.45; P.probe = [at(A.air5) + 0.15, at(A.km100) + 0.25];
  P.probeH = t => 10 ** ease(LOG(0.05), LOG(100), ...P.probe, t);
  P.karman = at(A.km100) - 0.05; P.space5 = at(A.space5) - 0.1;
  // ---- essence
  P.card = at(A.sat6) - 0.15; P.satl = at(A.satl6) - 0.1; P.king = at(A.king6) - 0.1; P.latin = at(A.latin6) - 0.1; P.kepler = at(A.kepler6) - 0.1; P.jup = at(A.jup6) - 0.1;
  P.jupIn = sc('essence').start + 0.2;
  P.cannonIn = at('s07') - 0.6;
  P.shots = [at(A.ball7) + 0.05, at(A.faster7) + 0.15, at(A.enough8) + 0.1];
  P.shotEnd = P.shots.map((s, i) => s + CANNON_TRACKS[i].end / K1);
  P.fall8 = at(A.fall8) - 0.1; P.round8 = at(A.round8) - 0.1; P.around8 = at(A.around8) - 0.1;
  P.dashIn = at('s09') - 0.55;
  // ---- the model clock τ (real seconds) from the essence dashboard to the end of the GEO scene
  P.kRamp = [at(A.spin15) - 0.6, at(A.same15) + 0.6];
  P.K = t => (t < P.kRamp[0] ? K1 : t > P.kRamp[1] ? K2 : 10 ** lerp(LOG(K1), LOG(K2), smooth((t - P.kRamp[0]) / (P.kRamp[1] - P.kRamp[0]))));
  // knob satellite altitude: s09 (400 → 20,200 km) and the GEO climb (820 → 35,786 km)
  P.k9 = [at(A.high9) - 0.1, at(A.slow9) + 0.9];
  P.kGeo = [at(A.geo15) - 0.2, at(A.spin15) + 0.2];
  P.knobH = t => {
    if (t < sc('leo').start) return 10 ** ease(LOG(400), LOG(20200), ...P.k9, t);
    return 10 ** ease(LOG(OBJ.weather.h), LOG(H_GEO), ...P.kGeo, t);
  };
  {
    const t0 = P.dashIn - 0.5, t1 = sc('geo').end + 0.1, dt = 1 / 120, n = Math.ceil((t1 - t0) / dt) + 2;
    const TAUA = new Float64Array(n), PHK = new Float64Array(n);
    let tau = 0, ph = 0, phGeo = 0, geoStart = -1;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt; TAUA[i] = tau; PHK[i] = ph;
      if (geoStart < 0 && t >= sc('leo').end) { geoStart = i; ph = 0; PHK[i] = 0; }
      const k = P.K(t); tau += k * dt; ph += TAU * k / period(P.knobH(t)) * dt;
    }
    const idx = t => clamp((t - t0) / dt, 0, n - 1.001);
    const samp = (Arr, t) => { const u = idx(t), i = Math.floor(u); return lerp(Arr[i], Arr[i + 1], u - i); };
    P.tau = t => samp(TAUA, t);
    P.spin = t => 360 * P.tau(t) / SID + 95;                         // Earth spin (deg) on the same clock
    // knob phase; the GEO-scene knob is phased so that it ends above 128.2°E (천리안 2A)
    const tEnd = sc('geo').end, phEndRaw = samp(PHK, tEnd), want = (128.2 + P.spin(tEnd)) * D2R;
    P.knobPh = t => (t < sc('leo').end ? 0.9 + samp(PHK, t) : samp(PHK, t) + (want - phEndRaw));
    P.objPh = (o, t) => o.ph + TAU * P.tau(t) / o.T;
    // revolution ticks (phase crossing 2πk)
    const revs = (ph, a, b) => { const out = []; let prev = ph(a); for (let t = a + dt; t <= b; t += dt) { const v = ph(t); if (Math.floor(v / TAU) > Math.floor(prev / TAU)) out.push(+t.toFixed(4)); prev = v; } return out; };
    P.revs = revs;
  }
  P.ghostPh = t => 2.6 + TAU * P.tau(t) / OBJ.iss.T;
  P.s09revK = P.revs(P.knobPh, P.dashIn + 0.3, sc('essence').end - 0.2);
  P.s09revG = P.revs(P.ghostPh, P.dashIn + 0.3, sc('essence').end - 0.2);
  // ---- leo: which satellite the tracking ring follows
  P.leoIn = sc('leo').start; P.band = at(A.km2000) - 0.1; P.leoName = at(A.leo10) - 0.1;
  P.trackSeq = [[-Infinity, null], [at(A.iss11) - 0.15, 'iss'], [at(A.hubble12) - 0.15, 'hubble'], [at(A.star12) - 0.1, 'starlink'], [at(A.wx13) - 0.8, 'weather'], [at('s14') - 0.3, 'hubble']];
  P.tracked = t => { let k = null; for (const [t0, id] of P.trackSeq) if (t >= t0) k = id; return k; };
  P.km400 = at(A.km400) - 0.1; P.min92 = at(A.min92) - 0.1; P.km500 = at(A.km500) - 0.1; P.pole13 = at(A.pole13) - 0.1; P.cloud13 = at(A.cloud13) - 0.1; P.km800 = at(A.km800) - 0.1;
  P.drag = [at(A.thin14) - 0.1, at(A.down14) + 0.9]; P.close14 = at(A.close14) - 0.1;
  P.hubbleH = t => (t < P.drag[0] ? OBJ.hubble.h : lerp(615, OBJ.hubble.h, easeInOut((t - P.drag[0]) / (P.drag[1] - P.drag[0]))));
  // (2026-11-07) label shows only the two dated endpoints; intermediate heights are interpolation, not dated data.
  P.hubbleYear = t => Math.round(lerp(1990, 2026, easeInOut((t - P.drag[0]) / (P.drag[1] - P.drag[0]))));
  P.leoRevs = {};
  for (const id of ['iss', 'hubble', 'weather']) {
    const spans = []; for (let k = 1; k < P.trackSeq.length; k++) if (P.trackSeq[k][1] === id) spans.push([P.trackSeq[k][0] + 0.2, k + 1 < P.trackSeq.length ? P.trackSeq[k + 1][0] : sc('leo').end - 0.2]);
    P.leoRevs[id] = spans.flatMap(([a, b]) => P.revs(t => P.objPh(OBJ[id], t), a, b));
  }
  // ---- geo
  P.geoIn = sc('geo').start; P.dayLine = at(A.spin15) - 0.2; P.same15 = at(A.same15) - 0.1;
  P.topDown = [at('s16') - 0.6, at('s16') + 0.4]; P.stop16 = at(A.stop16) - 0.1; P.geo16 = at(A.geo16) - 0.1;
  P.view17 = [at('s17') - 0.5, at('s17') + 0.3]; P.chol = at(A.chol17) - 0.1; P.mug = at(A.mug17) - 0.1; P.pen = at(A.pen17) - 0.1;
  P.geoRevs = P.revs(t => TAU * P.tau(t) / SID, P.topDown[1], P.view17[0]);                 // Earth + GEO satellite together (12 s)
  P.leoGhostRevs = P.revs(t => 1.3 + TAU * P.tau(t) / OBJ.iss.T, P.topDown[1] + 0.5, P.view17[0] - 0.2);
  // ---- solar (one year = 8 s)
  P.solIn = sc('solar').start; P.yearPh = t => -0.35 + TAU * (t - P.solIn) / 8;
  P.l1l2 = at(A.km150_18) - 0.1; P.side18 = at(A.side18) - 0.1; P.year18 = at(A.year18) - 0.1;
  P.yearTicks = P.revs(t => P.yearPh(t) + 0.35 + TAU * 0.5, P.solIn + 0.3, sc('solar').end - 0.2);
  P.soho = at(A.soho19) - 0.1; P.watch = at(A.watch19) - 0.1; P.jwst19 = at(A.jwst19) - 0.1; P.back19 = at(A.back19) - 0.1; P.cold19 = at(A.cold19) - 0.1;
  // ---- myth
  P.mythIn = sc('myth').start; P.float20 = at(A.float20) - 0.1; P.not20 = at(A.not20) - 0.1;
  P.pct21 = at(A.pct21) - 0.1; P.together21 = at(A.together21) - 0.1; P.fall21 = at(A.fall21) - 0.1;
  P.boxPhase = t => (t - P.mythIn) / 9;                         // the orbiting box goes once around the drawn arc every 9 s
  // ---- close
  P.closeIn = sc('close').start;
  P.periodLabels = [at(A.high22) + 0.05, at(A.high22) + 0.55, at(A.slow22) + 0.1, at(A.slow22) + 0.6];
  P.posterBack = at(A.each22) - 0.35;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export const PAL = {gold: '#F2C14E', hot: '#FFE6A6', sky: '#7CC4FF', ice: '#CFE6FF', green: '#8FE3BF', red: '#FF8A6E', moon: '#C9CCD3',
  rail: '#5C6E99', earth: '#123A5C', earth2: '#081D33', atmo: '#5FB4FF', mount: '#2A3B5E', mount2: '#1A2742', snow: '#DCE6F5', sun: '#FFD27A'};
const STARS = (() => { const out = []; for (let i = 0; i < 260; i++) out.push([rand(i * 3.1) * 1080, rand(i * 7.7 + 1) * 1920, rand(i * 1.9 + 4), rand(i * 5.3 + 2)]); return out; })();
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#040A1A'); gr.addColorStop(0.6, '#071230'); gr.addColorStop(1, T.deep);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  for (const [x, y, s, ph] of STARS) { const a = (0.18 + 0.5 * s) * (0.85 + 0.15 * Math.sin(t * 0.9 + ph * 9)); c.fillStyle = rgba(s > 0.85 ? '#FFE9C4' : '#E9EEFF', a); const r = 0.6 + 1.3 * s * s; c.fillRect(x - r / 2, y - r / 2, r, r); }
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.3, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const fmt = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
export const kmLabel = h => (h >= 1e4 ? (h % 1e4 === 0 ? `${fmt(h / 1e4)}만 km` : `${fmt(h / 1e4, 1)}만 km`) : h >= 1 ? `${fmt(h)} km` : `${fmt(h * 1000)} m`);
export function periodStr(s) {
  if (s < 3 * 3600) return `${Math.round(s / 60)}분`;
  if (s < 48 * 3600) { const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60); return m ? `${h}시간 ${m}분` : `${h}시간`; }
  if (s < 60 * 86400) return `${fmt(s / 86400, 1)}일`;
  return `${fmt(s / YEAR_S, 1)}년`;
}
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 26, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, (o.minX ?? 64) + pad, (o.maxX ?? 936) - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba(stage.theme.plate, o.plateA ?? 0.86), o.border ? rgba(o.border, 0.9) : null, 1.5);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12, border = null) { rect(c, x, y, w, h, r, rgba(T.plate, a), border || rgba(T.border, 1), 1.5); }
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: titleSize(stage, title), color: T.ink, align: 'center', ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: T.accent, align: 'center', ...so}));
}
const TSIZE = new Map();
function titleSize(stage, s) { if (!TSIZE.has(s)) TSIZE.set(s, Math.min(54, 54 * 790 / stage.measure(s, {role: 'display', weight: 700, size: 54}))); return TSIZE.get(s); }
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1345, 0, 1610);
  g.addColorStop(0, 'rgba(2,6,16,0)'); g.addColorStop(0.35, `rgba(2,6,16,${0.6 * a})`); g.addColorStop(0.75, `rgba(2,6,16,${0.6 * a})`); g.addColorStop(1, 'rgba(2,6,16,0)');
  c.fillStyle = g; c.fillRect(0, 1345, 1080, 265);
}
const lastPulse = (ticks, t, d = 0.35) => { let k = -1; for (let i = 0; i < ticks.length && ticks[i] <= t; i++) k = i; return k < 0 ? 0 : clamp(1 - (t - ticks[k]) / d); };

// ---- small icons (all drawn, not pictures) ----
/** space station: truss with four solar-array pairs */
function issIcon(c, x, y, s = 1, a = 1, rot = 0) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    rect(c, -26, -2, 52, 4, 1, '#C9D2E3');
    for (const dx of [-22, -12, 12, 22]) { rect(c, dx - 3.5, -15, 7, 11, 1, '#C7A24A'); rect(c, dx - 3.5, 4, 7, 11, 1, '#C7A24A'); }
    rect(c, -6, -5, 12, 10, 2, '#E8EDF6'); c.restore(); });
}
function satIcon(c, x, y, s = 1, col = '#DDE6F5', a = 1, rot = 0) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    rect(c, -18, -4, 12, 8, 1, '#3C64A8'); rect(c, 6, -4, 12, 8, 1, '#3C64A8'); line(c, [[-6, 0], [6, 0]], '#9AA8C0', 2);
    rect(c, -5, -6, 10, 12, 2, col); c.restore(); });
}
function hubbleIcon(c, x, y, s = 1, a = 1, rot = 0) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    rect(c, -14, -6, 28, 12, 5, '#D5DCE8'); rect(c, 8, -6, 6, 12, 2, '#8B97AE');
    rect(c, -8, -18, 6, 11, 1, '#3C64A8'); rect(c, -8, 7, 6, 11, 1, '#3C64A8'); c.restore(); });
}
/** James Webb: gold hexagonal mirror over a silver sunshield (side-on view, mirror facing +x unless flip) */
function jwstIcon(c, x, y, s = 1, a = 1, o = {}) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.scale(s * (o.flip ? -1 : 1), s);
    poly(c, [[-34, 18], [26, 14], [34, 22], [-26, 26]], '#C9CED8', rgba('#FFFFFF', 0.5), 1);          // sunshield layers
    poly(c, [[-30, 22], [30, 18], [36, 26], [-22, 30]], '#9EA6B5');
    line(c, [[0, 14], [0, 2]], '#8B93A3', 3);
    const hx = (cx, cy, r) => poly(c, Array.from({length: 6}, (_, k) => [cx + r * Math.cos(k * Math.PI / 3 + Math.PI / 6), cy + r * Math.sin(k * Math.PI / 3 + Math.PI / 6)]), '#E9B949', rgba('#7A5A10', 0.6), 1);
    for (const [dx, dy] of [[0, -8], [-9, -3], [9, -3], [-9, -13], [9, -13], [0, -18], [0, 2]]) hx(dx, dy, 5.4);
    if (o.glow) glow(c, 0, -8, 46, PAL.gold, o.glow);
    c.restore(); });
}
function sohoIcon(c, x, y, s = 1, a = 1) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.scale(s, s);
    rect(c, -10, -10, 20, 20, 2, '#D8C690'); rect(c, -34, -5, 22, 10, 1, '#3C64A8'); rect(c, 12, -5, 22, 10, 1, '#3C64A8'); circle(c, -10, 0, 4, '#5A6370'); c.restore(); });
}
function planeIcon(c, x, y, s = 1, a = 1) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.scale(s, s);
    poly(c, [[-20, 0], [16, -2], [22, 0], [16, 2]], '#D8DEEA'); poly(c, [[-2, -1], [6, -14], [9, -14], [5, -1]], '#B9C2D4'); poly(c, [[-2, 1], [6, 14], [9, 14], [5, 1]], '#B9C2D4');
    poly(c, [[-18, -1], [-14, -8], [-12, -8], [-14, -1]], '#B9C2D4'); c.restore(); });
}
function moonBall(c, x, y, r, a = 1) { withAlpha(c, a, () => { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#EEF0F4'); g.addColorStop(0.6, '#AEB2BC'); g.addColorStop(1, '#4C5160'); circle(c, x, y, r, g); circle(c, x + r * 0.25, y + r * 0.1, r * 0.18, rgba('#7C808C', 0.6)); circle(c, x - r * 0.3, y + r * 0.35, r * 0.12, rgba('#7C808C', 0.5)); }); }

// =====================================================================================================
// The log altitude ladder (hook, scale, close, poster)
// =====================================================================================================
/** L = {x, y0 (bottom px), y1 (top px), lo, hi (log10 km)} */
export const ly = (L, h) => L.y0 + (LOG(h) - L.lo) / (L.hi - L.lo) * (L.y1 - L.y0);
const BD_PROF = [[-175, 0.06], [-135, 0.4], [-100, 1.0], [-66, 1.8], [-36, 2.55], [-24, 2.744], [-12, 2.52], [0, 2.36], [12, 2.5], [26, 2.7], [52, 2.2], [88, 1.4], [128, 0.6], [175, 0.06]];
const EV_PROF = [[-185, 0.06], [-155, 0.6], [-125, 1.8], [-100, 3.0], [-80, 4.6], [-64, 5.6], [-50, 5.2], [-36, 6.6], [-20, 7.8], [-8, 8.5], [0, 8.849], [10, 8.6], [22, 8.2], [34, 8.4], [50, 7.4], [68, 6.0], [82, 6.4], [100, 5.0], [122, 3.2], [148, 1.6], [168, 0.5], [185, 0.06]];
function mountain(c, L, x0, prof, rise, yG, col, snow) {
  if (rise <= 0) return;
  const wx = clamp(((L.y0 - L.y1) / (L.hi - L.lo) / 150) ** 0.6, 1, 2.2);   // widen in close-ups (log heights stretch)
  const pts = prof.map(([dx, h]) => [x0 + dx * wx, Math.min(yG, ly(L, Math.max(1e-3, h * rise)))]);
  const g = c.createLinearGradient(0, ly(L, 9), 0, yG); g.addColorStop(0, col); g.addColorStop(1, PAL.mount2);
  poly(c, [[pts[0][0], yG], ...pts, [pts[pts.length - 1][0], yG]], g, rgba('#9CB3D9', 0.35), 1.5);
  // snow cap: the top band of the silhouette
  if (snow) { c.save(); c.beginPath(); c.moveTo(pts[0][0], yG); pts.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(pts[pts.length - 1][0], yG); c.closePath(); c.clip();
    const top = Math.min(...pts.map(p => p[1])); c.fillStyle = rgba(PAL.snow, 0.55); c.fillRect(x0 - 400, top - 4, 800, (ly(L, snow * rise) - top) + 4); c.restore(); }
}
/** Earth limb + atmosphere below the ladder: ground line at the 50 m level of the scale */
function ground(c, L, a = 1) {
  const yG = ly(L, 0.05) + 6; if (yG > 2100) return yG;
  withAlpha(c, a, () => {
    const yA = ly(L, 100);                                    // air glow fades out by the 100 km line
    const g = c.createLinearGradient(0, yG, 0, Math.min(yG - 10, yA)); g.addColorStop(0, rgba(PAL.atmo, 0.34)); g.addColorStop(0.5, rgba(PAL.atmo, 0.1)); g.addColorStop(1, rgba(PAL.atmo, 0));
    c.fillStyle = g; c.fillRect(0, Math.min(yG, yA), 1080, yG - Math.min(yG, yA));
    const R0 = 3200, cy = yG + R0, eg = c.createRadialGradient(540, cy, R0 - 500, 540, cy, R0); eg.addColorStop(0, PAL.earth2); eg.addColorStop(1, PAL.earth);
    circle(c, 540, cy, R0, eg);
    for (const [w, al] of [[26, 0.06], [12, 0.14], [5, 0.35], [2, 0.8]]) ring(c, 540, cy, R0 + 1, rgba('#8FD0FF', al), w);
    const cg = c.createLinearGradient(0, yG, 0, yG + 300); cg.addColorStop(0, rgba('#2C6FB0', 0.35)); cg.addColorStop(1, rgba('#2C6FB0', 0));
    c.save(); c.beginPath(); c.arc(540, cy, R0, 0, TAU); c.clip(); c.fillStyle = cg; c.fillRect(0, yG - 10, 1080, 320);
    for (let i = 0; i < 60; i++) { const x = rand(i * 3.7) * 1080, y = yG + 30 + rand(i * 8.3) * 260; c.fillStyle = rgba('#DCE8F5', 0.05 + 0.06 * rand(i)); c.beginPath(); c.ellipse(x, y, 40 + 80 * rand(i * 2.2), 6 + 6 * rand(i * 4.4), 0, 0, TAU); c.fill(); }
    c.restore();
  });
  return yG;
}
/** the ladder itself. o: {a, labels (alpha of rung labels), objA, hl:{key:alpha}, rise:{bd, ev}, highlight decade idx, step} */
function bigLadder(stage, t, L, o = {}) {
  const c = stage.ctx, T = stage.theme, a = o.a ?? 1, xr = L.x;
  const yG = ground(c, L, a);
  c.save(); if (o.clipTop) { c.beginPath(); c.rect(0, o.clipTop, 1080, 1920); c.clip(); }
  withAlpha(c, a, () => {
    // mountains
    const rbd = o.rise?.bd ?? 1, rev = o.rise?.ev ?? 1;
    mountain(c, L, xr - 250, BD_PROF, rbd, yG, '#34496F', 2.5);
    mountain(c, L, xr + 245, EV_PROF, rev, yG, '#2E4166', 7.0);
    // rails and rungs
    const top = Math.max(-200, L.y1 - 400), bot = Math.min(yG, 2100);
    const rg = c.createLinearGradient(0, bot, 0, top); rg.addColorStop(0, rgba(PAL.rail, 0.9)); rg.addColorStop(1, rgba(PAL.gold, 0.85));
    line(c, [[xr - 28, bot], [xr - 28, top]], rg, 3); line(c, [[xr + 28, bot], [xr + 28, top]], rg, 3);
    for (let d = Math.ceil(L.lo) - 1; d <= Math.floor(L.hi) + 1; d++) {
      const y = ly(L, 10 ** d); if (y > bot - 2 || y < -50) continue;
      const hl = o.step != null ? clamp(1 - Math.abs(o.step - d) * 1.2) : 0;
      line(c, [[xr - 28, y], [xr + 28, y]], rgba(mix(PAL.rail, PAL.gold, 0.5 + 0.5 * hl), 0.95), 3 + 3 * hl);
      if (hl > 0) glow(c, xr, y, 70, PAL.gold, 0.35 * hl);
      for (let m = 2; m <= 9; m++) { const ym = ly(L, m * 10 ** d); if (ym < bot && ym > -50) line(c, [[xr - 28, ym], [xr - 18, ym]], rgba(PAL.rail, 0.6), 1.5); }
      if ((o.labels ?? 1) > 0 && y < (o.labelMaxY ?? 1330)) withAlpha(c, o.labels ?? 1, () => stage.text(kmLabel(10 ** d), xr - 46, y, {size: 26, weight: 500, color: hl > 0.2 ? PAL.gold : T.muted, align: 'right'}));
    }
    // objects (the ladder is a ruler: each object sits at its altitude, right of the rails)
    const objA = o.objA ?? 1, hl = o.hl || {}, lab = o.objLabels ?? 1, xo = xr + 58;
    const vis = y => y > (o.minY ?? -40) && y < bot - 4;
    const label = (key, s, y, col = T.ink, dx = 0) => { const q = (hl[key] ?? 0); if (lab * (0.0 + (o.allLabels ? 1 : 0) + q) <= 0) return; withAlpha(c, clamp(lab * ((o.allLabels ? 0.8 : 0) + q)), () => stage.text(s, xo + 46 + dx, y, {size: 26, weight: 700, color: q > 0.5 ? PAL.gold : col})); };
    withAlpha(c, objA, () => {
      let y = ly(L, OBJ.plane.h); if (vis(y) && o.showPlane !== false) { planeIcon(c, xo + 18, y, 1, 0.9); label('plane', '여객기 약 11 km', y, T.muted); }
      y = ly(L, 100); if (vis(y)) { line(c, [[150, y], [930, y]], rgba(PAL.atmo, 0.55 + 0.3 * (hl.karman ?? 0)), 2, {dash: [10, 8]}); label('karman', '우주의 경계 100 km', y - 22, PAL.ice); }
      const yLo = ly(L, 160), yHi = ly(L, 2000);
      if ((hl.leo ?? 0) > 0 && vis((yLo + yHi) / 2)) withAlpha(c, hl.leo, () => { rect(c, xr - 28, yHi, 56, yLo - yHi, 0, rgba(PAL.gold, 0.18)); label('leo', '저궤도 (LEO)', (yLo + yHi) / 2); });
      y = ly(L, OBJ.iss.h); if (vis(y)) { issIcon(c, xo + 16, y, 0.8, 1); label('iss', '국제우주정거장', y); }
      y = ly(L, H_GEO); if (vis(y)) { satIcon(c, xo + 16, y, 1, '#E8EDF6'); label('geo', '정지궤도 3만 5,786 km', y); }
      y = ly(L, OBJ.moon.h); if (vis(y)) { moonBall(c, xo + 16 * (o.big ?? 1), y, 15 * (o.big ?? 1)); label('moon', '달 38만 km', y); }
      const big = o.big ?? 1;
      y = ly(L, OBJ.l2.h); if (vis(y)) { jwstIcon(c, xo + 18 * big, y, 0.9 * big, 1, {glow: 0.25 + 0.35 * (hl.jwst ?? 0)}); label('jwst', '제임스웹 150만 km', y, T.ink, 10); }
    });
  });
  c.restore();
}

// =====================================================================================================
// Header titles, poster
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '제임스웹은 얼마나 높이?'],
  scale: ['눈금 · 한 칸에 열 배', '산에서 우주까지 한 화면에'],
  essence: ['기원 · 이름', '위성 = 곁을 지키는 호위병'],
  leo: ['메커니즘 · 저궤도 LEO', '2,000 km 아래의 궤도'],
  geo: ['메커니즘 · 정지궤도', '한 바퀴 = 지구의 자전 한 번'],
  solar: ['태양 궤도 · 150만 km', '지구와 나란히 1년에 한 바퀴'],
  myth: ['오해 바로잡기', '우주정거장엔 중력이 없다?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'scale') return [[-Infinity, ...titles.scale], [P.atmo, '배경 · 우주의 경계', '공기가 옅어지는 100 km']];
  if (id === 'essence') return [[-Infinity, ...titles.essence], [P.cannonIn, '본질 · 뉴턴의 대포', '떨어지면서 땅을 비켜 간다'], [P.dashIn, '본질 · 높이와 빠르기', '높을수록 느리게, 오래 돈다']];
  if (id === 'leo') return [[-Infinity, ...titles.leo], [P.trackSeq[1][0], '저궤도 · 약 400 km', '국제우주정거장'], [P.trackSeq[2][0], '저궤도 · 약 500 km', '허블과 스타링크'], [P.trackSeq[4][0], '저궤도 · 약 800 km', '남북으로 도는 기상위성'], [P.trackSeq[5][0], '저궤도의 대가', '옅은 공기에 끌려 내려온다']];
  if (id === 'geo') return [[-Infinity, ...titles.geo], [P.topDown[0], '정지궤도 · 하루를 12초로', '땅에서 보면 멈춰 있다'], [P.view17[0], '정지궤도 · 동경 128.2°', '천리안이 보는 지구']];
  if (id === 'solar') return [[-Infinity, ...titles.solar], [P.soho - 0.3, 'L1 · L2 · 150만 km', '태양을 보는 소호, 우주를 보는 제임스웹']];
  if (id === 'myth') return [[-Infinity, ...titles.myth], [P.pct21 - 0.4, '오해 바로잡기', '함께 떨어지며 돌기 때문']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id;
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', POSTER_Q.q + '?', fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, POSTER_Q.ans, ho, 'rgba(0,0,0,0.95)');
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  if (id === 'close') { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
const POSTER_Q = {y: 860, y2: 1030, q: '제임스웹은 얼마나 높이', ans: '150만 km'};
let QSIZE = 0, ASIZE = 0;
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 800, 96); ASIZE ||= fit(POSTER_Q.ans, 800, 210);
  const HS = titleSize(stage, POSTER_Q.q + '?');
  const y1 = lerp(POSTER_Q.y, 228, q), s1_ = lerp(QSIZE, HS, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 740, 0, 1170); g2.addColorStop(0, 'rgba(3,7,20,0)'); g2.addColorStop(0.24, 'rgba(3,7,20,0.8)'); g2.addColorStop(0.78, 'rgba(3,7,20,0.8)'); g2.addColorStop(1, 'rgba(3,7,20,0)');
    c.fillStyle = g2; c.fillRect(0, 740, 1080, 430);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null, s = POSTER_Q.q + '?';
    const w_ = stage.measure(s, {role: 'display', weight: 700, size: s1_, tracking: tr * s1_}), s1 = Math.min(s1_, s1_ * 800 / w_);
    stage.text(s, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: sh, shadowBlur: 20, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: T.accent, align: 'center', tracking: tr * s2, shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 26});
  });
}
export const POSTER_L = {x: 540, y0: 1450, y1: 330, lo: FULL[0], hi: FULL[1]};
/** the poster picture: full ladder from the mountains to the James Webb telescope */
function posterPicture(stage, t, a = 1, o = {}) {
  bigLadder(stage, t, POSTER_L, {a, labels: o.labels ?? 0, objLabels: o.objLabels ?? 0, hl: o.hl || {jwst: 1}, allLabels: o.allLabels, clipTop: o.clipTop ?? 0, big: o.big ?? 1.6});
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/orbit-altitudes/scenes.mjs --emit-sound');
}
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [63, 66, 80, 104, 110, 120]) h += P.tau(t) / 1e6 + P.knobPh(t) / 100;
  return `${h.toFixed(5)}@${tl.duration.toFixed(3)}/${P.s09revK.length}:${P.s09revG.length}/${Object.values(P.leoRevs).map(x => x.length).join(':')}/${P.geoRevs.length}:${P.leoGhostRevs.length}/${P.climbRungs.length}`;
}
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  scale(stage, t, p, ctx) { scaleScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  leo(stage, t, p, ctx) { dashScene(stage, t, ctx); },
  geo(stage, t, p, ctx) { geoScene(stage, t, ctx); },
  solar(stage, t, p, ctx) { solarScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → mountains → climb to James Webb
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme;
  const [lo, hi] = P.hookView(t), L = {x: 540, y0: 1450, y1: 330, lo, hi};
  const after = fadeIn(t, MORPH[1], 0.4);
  const rise = {bd: t < P.zoomIn[0] ? 1 : t < P.bdRise[0] ? 0.0 : easeOut((t - P.bdRise[0]) / (P.bdRise[1] - P.bdRise[0])), ev: t < P.zoomIn[0] ? 1 : t < P.evRise[0] ? 0.0 : easeOut((t - P.evRise[0]) / (P.evRise[1] - P.evRise[0]))};
  // during the zoom-in the mountains sink into the ground and grow back as they are named
  if (t >= P.zoomIn[0] && t < P.bdRise[0]) { const q = 1 - smooth((t - P.zoomIn[0]) / 0.5); rise.bd = q; rise.ev = q; }
  else if (t >= P.bdRise[0] && t < P.evRise[0]) { rise.ev = Math.max(0, 1 - smooth((t - P.zoomIn[0]) / 0.5)); }
  const hl = {jwst: Math.max(t < MORPH[1] ? 1 : 0, fadeIn(t, P.jwLabel, 0.3) * fadeOut(t, P.zoomIn[0], 0.3), fadeIn(t, P.jwst3, 0.3)),
    plane: 0, karman: fadeIn(t, P.climb[0] + 0.6, 0.3) * fadeOut(t, P.climb[1] - 0.6, 0.4) * 0.8,
    iss: fadeIn(t, P.climb[0] + 1.0, 0.3) * fadeOut(t, P.climb[1] - 0.3, 0.4) * 0.8, geo: fadeIn(t, P.climb[1] - 0.9, 0.3) * fadeOut(t, P.zoomOut[0], 0.3) * 0.8,
    moon: fadeIn(t, P.climb[1] - 0.4, 0.3) * fadeOut(t, P.zoomOut[0], 0.3) + fadeIn(t, P.moon3, 0.3) * fadeOut(t, P.zoomOut[0], 0.3) * 0.2};
  bigLadder(stage, t, L, {labels: after, hl, objLabels: after, step: null, clipTop: 318 * after, big: 1 + 0.6 * (1 - after), showPlane: t < P.zoomIn[0] || t > P.climb[0]});
  // mountain labels (s02)
  const yG = ly(L, 0.05) + 6;
  if (t > P.zoomIn[0]) {
    const bdA = fadeIn(t, P.bdRise[0] + 0.3, 0.3) * fadeOut(t, P.climb[0] + 0.3, 0.4), evA = fadeIn(t, P.evRise[0] + 0.3, 0.3) * fadeOut(t, P.climb[0] + 0.3, 0.4);
    const yb = ly(L, 2.744 * rise.bd), ye = ly(L, 8.849 * rise.ev);
    if (bdA > 0) { line(c, [[270, yb], [270, yb - 70]], rgba(PAL.ice, 0.6 * bdA), 2); tag(stage, '백두산', 270, yb - 122, {a: bdA, size: 34}); tag(stage, `${fmt(Math.round(2744 * rise.bd))} m`, 270, yb - 82, {a: bdA, size: 30, color: PAL.gold}); }
    if (evA > 0) { line(c, [[785, ye], [785, ye - 70]], rgba(PAL.ice, 0.6 * evA), 2); tag(stage, '에베레스트', 785, ye - 122, {a: evA, size: 34}); tag(stage, `${fmt(Math.round(8849 * rise.ev))} m`, 785, ye - 82, {a: evA, size: 30, color: PAL.gold}); }
    const hmA = fadeIn(t, P.himal, 0.3) * fadeOut(t, P.climb[0] + 0.3, 0.4);
    if (hmA > 0) tag(stage, '히말라야', 820, ly(L, 0.9), {a: hmA, size: 28, color: T.ink, plateA: 0.6});
    const hA = fadeIn(t, P.highest, 0.4) * fadeOut(t, P.climb[0] + 0.2, 0.3);
    if (hA > 0) tag(stage, '땅 위에서 가장 높은 곳', 540, ly(L, 0.35), {a: hA, size: 28, color: PAL.ice});
  }
  // arrival: Moon ×4 bracket
  const bA = fadeIn(t, P.four3 - 0.2, 0.35) * fadeOut(t, P.zoomOut[0], 0.3);
  if (bA > 0) withAlpha(c, bA, () => {
    const ym = ly(L, OBJ.moon.h), yj = ly(L, OBJ.l2.h), x = 470;
    line(c, [[x + 14, ym], [x, ym], [x, yj], [x + 14, yj]], PAL.gold, 3);
    tag(stage, '달까지의 약 4배', x - 16, (ym + yj) / 2, {a: 1, size: 28, color: PAL.gold, align: 'right'});
  });
  // a soft "camera climbing" streak during the climb
  const cl = clamp((t - P.climb[0]) / (P.climb[1] - P.climb[0])), sp = Math.sin(Math.PI * cl);
  if (sp > 0.01 && cl < 1) withAlpha(c, 0.35 * sp, () => { for (let i = 0; i < 14; i++) { const x = 120 + rand(i * 2.3) * 840, y0 = (rand(i * 5.1) * 1400 + t * 2600) % 1400 + 300; line(c, [[x, y0], [x, y0 - 90 * sp]], rgba('#BFD3FF', 0.5), 1.5); } });
  if (t < MORPH[1] + 0.4) return;
}

// ------------------------------------------------------------------ scale: ordinary ruler vs ×10 ruler; air and the 100 km line
function scaleScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, sc = ctx.scene;
  const A1 = fadeIn(t, sc.start, 0.35) * fadeOut(t, P.atmo, 0.4), A2 = fadeIn(t, P.atmo + 0.15, 0.45) * fadeOut(t, sc.end - 0.25, 0.25);
  if (A1 > 0) withAlpha(c, A1, () => {
    // left: ordinary (linear) ruler 0 … 160만 km
    const x = 250, yB = 1290, yT = 420, H = 1.6e6, yl = h => yB - (yB - yT) * h / H;
    panel(c, T, 90, 360, 380, 960, 0.55);
    stage.text('보통 눈금', 280, 395, {size: 30, weight: 700, color: T.ink, align: 'center'});
    line(c, [[x, yB], [x, yT]], rgba(PAL.rail, 0.9), 3);
    for (let k = 0; k <= 16; k += 2) { const y = yl(k * 1e5); line(c, [[x - 10, y], [x, y]], rgba(PAL.rail, 0.9), 2); if (k % 4 === 0) stage.text(k === 0 ? '0' : `${k * 10}만`, x - 18, y, {size: 24, color: T.muted, align: 'right'}); }
    const pts = [[OBJ.l2.h, '제임스웹', PAL.gold], [OBJ.moon.h, '달', PAL.moon], [H_GEO, '정지궤도', T.ink]];
    const sq = easeInOut((t - P.cmp) / 1.4);
    for (const [h, n, col] of pts) { const y = yl(h); circle(c, x, y, 7, col); stage.text(n, x + 20, y, {size: 26, weight: 700, color: col}); }
    // everything else squashed onto the floor
    const yF = yl(0) - 2; circle(c, x, yF, 7, PAL.green);
    withAlpha(c, sq, () => { line(c, [[x + 14, yF - 6], [x + 46, yF - 52]], rgba(PAL.green, 0.8), 2); stage.text('산·우주정거장·위성', x + 50, yF - 92, {size: 24, weight: 700, color: PAL.green}); stage.text('모두 바닥에 붙음', x + 50, yF - 60, {size: 24, weight: 700, color: PAL.green}); });
    // right: ×10 ladder
    const L = {x: 700, y0: 1290, y1: 430, lo: -1, hi: 6.4};
    panel(c, T, 510, 360, 420, 960, 0.55);
    stage.text('한 칸에 ×10', 720, 395, {size: 30, weight: 700, color: PAL.gold, align: 'center'});
    const stepF = t < P.rungSteps[0] ? -9 : (() => { let k = 0; while (k + 1 < P.rungSteps.length && t >= P.rungSteps[k + 1]) k++; return DECADES[k] + clamp((t - P.rungSteps[k]) / 0.3) - 1 + 1; })();
    const step = t < P.rungSteps[0] ? null : DECADES[Math.max(0, P.rungSteps.filter(x => x <= t).length - 1)];
    c.save(); c.beginPath(); c.rect(510, 410, 420, 900); c.clip();
    for (let d = -1; d <= 6; d++) {
      const y = ly(L, 10 ** d), on = step != null && d <= step, cur = step === d ? lastPulse([P.rungSteps[d + 1]], t, 0.6) : 0;
      line(c, [[L.x - 26, y], [L.x + 26, y]], on ? PAL.gold : rgba(PAL.rail, 0.9), on ? 4 : 3);
      if (cur > 0) glow(c, L.x, y, 70, PAL.gold, 0.4 * cur);
      stage.text(kmLabel(10 ** d), L.x - 40, y, {size: 24, weight: 500, color: on ? PAL.gold : T.muted, align: 'right'});
      if (d < 6 && on && step > d) withAlpha(c, 0.9, () => stage.text('×10', L.x + 40, (y + ly(L, 10 ** (d + 1))) / 2, {size: 24, weight: 700, color: PAL.gold}));
    }
    line(c, [[L.x - 26, 1300], [L.x - 26, 420]], rgba(PAL.rail, 0.8), 2); line(c, [[L.x + 26, 1300], [L.x + 26, 420]], rgba(PAL.rail, 0.8), 2);
    c.restore();
    void stepF;
  });
  if (A2 > 0) withAlpha(c, A2, () => {
    // the bottom of the ladder: air thinning out, airliner, the 100 km line
    const L = {x: 300, y0: 1300, y1: 420, lo: -1.3, hi: 3.0};
    const yG = ground(c, L, 1);
    // air particles: count per band ∝ density^0.18 (visible), drifting sideways
    c.save(); c.beginPath(); c.rect(60, 380, 880, yG - 380); c.clip();
    for (let i = 0; i < 520; i++) {
      const lh = lerp(-1.3, 2.6, rand(i * 1.37)), h = 10 ** lh, keep = (rho(h) / 1.225) ** 0.18;
      if (rand(i * 9.1 + 3) > keep) continue;
      const y = ly(L, h), x = 70 + ((rand(i * 4.7) * 900 + t * (14 + 10 * rand(i))) % 870);
      circle(c, x, y, 2.2, rgba('#CFE8FF', 0.55 * keep + 0.08));
    }
    c.restore();
    for (let d = -1; d <= 3; d++) { const y = ly(L, 10 ** d); if (y < yG - 4) { line(c, [[L.x - 22, y], [L.x + 22, y]], rgba(PAL.rail, 0.9), 3); stage.text(kmLabel(10 ** d), L.x - 36, y, {size: 26, weight: 500, color: T.muted, align: 'right'}); } }
    line(c, [[L.x - 22, yG], [L.x - 22, 420]], rgba(PAL.rail, 0.8), 2); line(c, [[L.x + 22, yG], [L.x + 22, 420]], rgba(PAL.rail, 0.8), 2);
    const yP = ly(L, 11); planeIcon(c, 470, yP, 1.4); stage.text('여객기 약 11 km', 520, yP, {size: 26, weight: 700, color: T.muted});
    const yK = ly(L, 100), kA = fadeIn(t, P.karman, 0.35);
    withAlpha(c, kA, () => { line(c, [[120, yK], [930, yK]], rgba(PAL.ice, 0.85), 3, {dash: [14, 9]}); tag(stage, '우주의 경계 100 km', 700, yK - 34, {size: 30, color: PAL.ice}); tag(stage, '카르만 선', 700, yK + 32, {size: 26, color: T.muted, plate: false}); });
    withAlpha(c, fadeIn(t, P.space5, 0.4), () => { stage.text('우주', 820, yK - 120, {role: 'display', size: 44, weight: 700, color: PAL.gold, align: 'center'}); stage.text('대기', 820, ly(L, 3), {role: 'display', size: 44, weight: 700, color: PAL.atmo, align: 'center'}); });
    // the rising probe with its air-density readout
    const h = P.probeH(t), y = ly(L, h), pa = fadeIn(t, P.probe[0] - 0.2, 0.3);
    withAlpha(c, pa, () => {
      glow(c, L.x, y, 40, PAL.gold, 0.5); circle(c, L.x, y, 9, PAL.gold); ring(c, L.x, y, 18, rgba(PAL.gold, 0.8), 2.5);
      const r = rho(h) / 1.225, s = r > 0.2 ? `땅의 ${fmt(r * 100)}%` : `땅의 ${fmt(Math.round(1 / r / (1 / r > 1e4 ? 1e4 : 1)) * (1 / r > 1e4 ? 1 : 1))}${1 / r > 1e4 ? '만' : ''}분의 1`;
      panel(c, T, 380, 1150, 520, 120, 0.9);
      stage.text('공기의 밀도', 400, 1182, {size: 26, weight: 500, color: T.muted});
      stage.text(`높이 ${kmLabel(h >= 1 ? +h.toPrecision(3) : Math.round(h * 1000) / 1000)}`, 880, 1182, {size: 26, weight: 500, color: T.muted, align: 'right'});
      stage.text(s, 640, 1232, {role: 'display', size: 40, weight: 700, color: PAL.gold, align: 'center'});
    });
  });
}

// ------------------------------------------------------------------ essence: satelles → Newton's cannon → higher is slower (dashboard)
const JUP = {cx: 540, cy: 870, R: 44, k: 14, tilt: 0.3, moons: [['이오', 5.9, 1.769], ['유로파', 9.4, 3.551], ['가니메데', 15.0, 7.155], ['칼리스토', 26.4, 16.69]]};
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, sc = ctx.scene;
  const aJ = fadeIn(t, sc.start, 0.35) * fadeOut(t, P.cannonIn, 0.45), aC = fadeIn(t, P.cannonIn + 0.1, 0.45) * fadeOut(t, P.dashIn, 0.45), aD = fadeIn(t, P.dashIn + 0.1, 0.45) * fadeOut(t, sc.end - 0.25, 0.25);
  if (aJ > 0) withAlpha(c, aJ, () => {
    // the word and its origin
    const wA = fadeIn(t, P.satl, 0.35);
    withAlpha(c, wA, () => {
      stage.text('satellite', 540, 410, {role: 'display', size: 72, weight: 700, color: T.ink, align: 'center'});
      stage.text('← satelles (라틴어)', 540, 482, {size: 32, weight: 500, color: T.muted, align: 'center'});
    });
    withAlpha(c, fadeIn(t, P.king, 0.35), () => tag(stage, '왕을 곁에서 지키는 호위병', 540, 545, {size: 32, color: PAL.gold}));
    withAlpha(c, fadeIn(t, P.card, 0.35), () => stage.text('衛星 · 지킬 위, 별 성', 540, 610, {size: 28, weight: 500, color: T.muted, align: 'center'}));
    // Jupiter and its four moons (seen nearly edge-on, as through a telescope)
    const {cx, cy, R, k, tilt} = JUP, Kj = 1.769 * 86400 / 3.2;   // Io = 3.2 s
    const pos = JUP.moons.map(([n, d, per], i) => { const ph = 0.8 + i * 1.7 + TAU * (t - sc.start) * Kj / (per * 86400); return {n, x: cx + d * k * Math.cos(ph), y: cy + d * k * tilt * Math.sin(ph), back: Math.sin(ph) < 0, d}; });
    c.save(); c.translate(cx, cy); c.scale(1, tilt); for (const m of JUP.moons) ring(c, 0, 0, m[1] * k, rgba(PAL.rail, 0.5), 1.5 / tilt); c.restore();
    const drawMoon = m => { if (m.back && Math.abs(m.x - cx) < R) return; circle(c, m.x, m.y, 7, '#E7DCC6'); if (Math.abs(m.x - cx) > R + 40) stage.text(m.n, m.x, m.y + (m.back ? -30 : 32), {size: 24, weight: 500, color: T.muted, align: 'center'}); };
    pos.filter(m => m.back).forEach(drawMoon);
    const g = c.createLinearGradient(cx, cy - R, cx, cy + R); ['#C9A27A', '#E8D3B4', '#B9875E', '#E9D8BE', '#A97C58', '#DCC3A0', '#B48A63'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
    circle(c, cx, cy, R, g); glow(c, cx, cy, R * 2.2, '#E8D3B4', 0.12);
    pos.filter(m => !m.back).forEach(drawMoon);
    stage.text('목성', cx, cy + R + 36, {size: 28, weight: 700, color: T.ink, align: 'center'});
    const yA = fadeIn(t, P.kepler, 0.35);
    withAlpha(c, yA, () => { tag(stage, '1610 갈릴레이가 발견', 540, 1110, {size: 28}); tag(stage, '1611 케플러가 satellites라 부름', 540, 1170, {size: 28, color: PAL.gold}); });
  });
  if (aC > 0) withAlpha(c, aC, () => cannonPart(stage, t, P));
  if (aD > 0) withAlpha(c, aD, () => dashboard(stage, t, P, dashLayout(t, P, ctx)));
}
const EC = {cx: 540, cy: 900, R: 280};
let TEX = null; const getTex = () => (TEX ||= earthTextures(loadLand(path.join(HERE, 'land.json'))));
/** ortho camera looking at the Earth (unit sphere) from elevation E (deg) and azimuth A, scale px per Earth radius */
function orthoCam(cx, cy, scale, E = 30, A = -90) {
  const e = E * D2R, a = A * D2R, w = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
  return lookCam({pos: mul(w, 60), dir: mul(w, -1), up: [0, 0, 1], ortho: scale, cx, cy});
}
function cannonPart(stage, t, P) {
  const c = stage.ctx, T = stage.theme, {cx, cy, R} = EC, kpx = R / R_E;
  // the Earth, seen side-on, lit from the left
  const cam = orthoCam(cx, cy, R, 8, -90);
  drawEarthLit(stage, cam, getTex(), {axis: unit([0.2, 0.1, 1]), spin: 140 + t * 2, sun: unit([-1, -0.6, 0.5]), cloudDrift: t * 0.5, night: 0.12});
  // the exaggerated mountain on top
  const top = cy - R - CANNON.h0 * kpx;
  poly(c, [[cx - 95, cy - R + 14], [cx - 30, top + 18], [cx - 8, top], [cx + 10, top + 6], [cx + 80, cy - R + 14]], '#33476F', rgba('#9CB3D9', 0.5), 2);
  rect(c, cx - 16, top - 12, 26, 12, 3, '#C9D2E3'); line(c, [[cx + 4, top - 6], [cx + 30, top - 6]], '#C9D2E3', 6);
  tag(stage, '산 높이 과장', cx - 175, top + 40, {size: 24, color: T.muted, plate: false});
  // trajectories
  const toS = (x, y) => [cx + x * kpx, cy - y * kpx];
  CANNON_TRACKS.forEach((tr, i) => {
    const t0 = P.shots[i]; if (t < t0) return;
    const tau = (t - t0) * K1, pts = []; let last = null;
    for (const [tt, x, y] of tr.pts) { if (tt > tau) break; pts.push(toS(x, y)); last = [x, y]; }
    if (!pts.length) return;
    const col = [PAL.red, PAL.sky, PAL.gold][i];
    if (pts.length > 1) line(c, pts, rgba(col, 0.9), 3);
    const done = tau >= tr.end;
    if (!done) { const p = pts[pts.length - 1]; glow(c, p[0], p[1], 26, col, 0.6); circle(c, p[0], p[1], 7, '#FFF4DC'); }
    else if (tr.hit) { const p = pts[pts.length - 1], q = lastPulse([t0 + tr.end / K1], t, 0.8); ring(c, p[0], p[1], 10 + 20 * (1 - q), rgba(col, 0.8 * q + 0.2), 2.5); circle(c, p[0], p[1], 6, col); }
    const v = CANNON.speeds[i];
    withAlpha(c, fadeIn(t, t0, 0.3), () => tag(stage, `초속 ${fmt(v, 1)} km`, [380, 540, 700][i] + (i === 2 ? 0 : 0), 1290 + 0 * i, {size: 28, color: col, a: 1}));
    void last;
  });
  // "떨어지는 만큼 둥근 땅이 멀어져": straight path vs the curved one
  const fa = fadeIn(t, P.fall8, 0.4) * fadeOut(t, P.dashIn - 0.2, 0.3);
  if (fa > 0) withAlpha(c, fa, () => {
    const p0 = toS(0, R_E + CANNON.h0); line(c, [p0, [p0[0] + 470, p0[1]]], rgba(T.ink, 0.6), 2.5, {dash: [12, 9]});
    stage.text('중력이 없다면', p0[0] + 300, p0[1] - 30, {size: 26, weight: 700, color: T.ink});
    const tr = CANNON_TRACKS[2].pts;
    for (const s of [0.035, 0.07, 0.105]) {
      const idx = Math.floor(s * tr.length), q = toS(tr[idx][1], tr[idx][2]);
      arrow(c, [q[0], p0[1] + 4], [q[0], q[1] - 6], rgba(PAL.gold, 0.95), 3, {head: 14});
    }
    withAlpha(c, fadeIn(t, P.round8, 0.4), () => tag(stage, '떨어지는 만큼 땅이 둥글게 멀어짐', 540, 1190, {size: 28, color: PAL.gold}));
  });
  withAlpha(c, fadeIn(t, P.cannonIn + 0.3, 0.4), () => tag(stage, '시간 1,100배 빠르게', 860, 400, {size: 24, color: T.muted, align: 'right', plate: false}));
}

// ------------------------------------------------------------------ the 3-stage dashboard: orbit view · altitude ladder · altitude–period graph
const GRAPH = {lx0: 2, lx1: 5.75, ly0: 0, ly1: 2.95};      // log10 km (100 km … 560,000 km) · log10 hours (1 h … 900 h)
/** layout over time (essence s09 → leo → geo) */
function dashLayout(t, P, ctx) {
  const sc = n => ctx.tl.scene(n), q = smooth((t - sc('leo').start + 0.2) / 1.2), g = smooth((t - P.kGeo[0] + 0.3) / 2.0);
  const base = {ocx: lerp(540, 690, q), ocy: lerp(600, 590, q), oR: lerp(80, 168, q), E: lerp(28, 24, q), ladA: q, gx0: 70, gx1: 930, gy0: 1300, gy1: 985, ry0: 880,
    lad: {x: 190, y0: 850, y1: 400, lo: 2.4, hi: 3.4}};
  if (ctx.scene.id === 'geo') {
    base.oR = lerp(168, 36, g); base.ocx = lerp(690, 700, g); base.ocy = lerp(590, 620, g); base.E = lerp(24, 26, g);
    base.lad.hi = lerp(3.4, 4.75, g);
  }
  return base;
}
const GEO_SAT_LON = 128.2;
/** orbit point (Earth radii) for inclination/raan (deg) and phase φ (rad) */
function orbP(r, inc, raan, ph) {
  const i = inc * D2R, O = raan * D2R, a = [Math.cos(O), Math.sin(O), 0], b = [-Math.sin(O) * Math.cos(i), Math.cos(O) * Math.cos(i), Math.sin(i)];
  return add(mul(a, r * Math.cos(ph)), mul(b, r * Math.sin(ph)));
}
function orbitRing(c, cam, r, inc, raan, col, w = 2, dash = null) {
  const N = 160; let seg = [];
  const flush = () => { if (seg.length > 1) line(c, seg, col, w, {dash}); seg = []; };
  for (let k = 0; k <= N; k++) { const p = orbP(r, inc, raan, k / N * TAU); if (cam.hidden(p)) { flush(); continue; } const s = cam.P(p); seg.push([s[0], s[1]]); }
  flush();
}
function dashboard(stage, t, P, Lo, o = {}) {
  const c = stage.ctx, T = stage.theme, id = o.scene || 'essence';
  const cam = orthoCam(Lo.ocx, Lo.ocy, Lo.oR, Lo.E, -75), sun = unit([-0.55, -0.9, 0.45]), spin = P.spin(t);
  // ---- ① orbit view
  glow(c, Lo.ocx, Lo.ocy, Lo.oR * 2.2, '#3F7FD0', 0.08);
  drawEarthLit(stage, cam, getTex(), {axis: [0, 0, 1], spin, sun, cloudDrift: spin * 0.02, night: 0.1});
  const rr = h => (R_E + h) / R_E;
  const items = [];
  if (id === 'essence') {
    const hK = P.knobH(t);
    orbitRing(c, cam, rr(400), 0, 0, rgba(PAL.sky, 0.45), 2);
    orbitRing(c, cam, rr(hK), 0, 0, rgba(PAL.gold, 0.85), 2.5);
    items.push({p: orbP(rr(400), 0, 0, P.ghostPh(t)), kind: 'sat', col: PAL.sky, s: 0.8, pulse: lastPulse(P.s09revG, t)});
    items.push({p: orbP(rr(hK), 0, 0, P.knobPh(t)), kind: 'sat', col: PAL.gold, s: 1, track: true, pulse: lastPulse(P.s09revK, t)});
    stage.text('파랑: 400 km 그대로', Lo.ocx - 20, Lo.ocy + 200, {size: 26, weight: 700, color: PAL.sky, align: 'right'});
    stage.text('금빛: 높이를 올림', Lo.ocx + 20, Lo.ocy + 200, {size: 26, weight: 700, color: PAL.gold});
  }
  if (id === 'leo') {
    const tr = P.tracked(t), bandA = fadeIn(t, P.band, 0.4);
    if (bandA > 0) withAlpha(c, bandA * 0.9, () => { // LEO shell (160–2,000 km) as a translucent equatorial ring
      const pts = (r) => Array.from({length: 121}, (_, k) => { const s = cam.P(orbP(r, 0, 0, k / 120 * TAU)); return [s[0], s[1]]; });
      const A_ = pts(rr(2000)), B_ = pts(rr(160)); c.beginPath(); A_.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); B_.reverse().forEach(p => c.lineTo(...p)); c.closePath(); c.fillStyle = rgba(PAL.gold, 0.08); c.fill('evenodd');
      line(c, pts(rr(2000)), rgba(PAL.gold, 0.55), 2, {dash: [8, 7]});
    });
    for (const k of ['iss', 'hubble', 'weather']) {
      const ob = OBJ[k], on = tr === k ? 1 : 0, aa = 0.25 + 0.6 * on;
      const h = k === 'hubble' ? P.hubbleH(t) : ob.h;
      orbitRing(c, cam, rr(h), ob.inc, ob.raan, rgba(ob.col, aa), on ? 2.6 : 1.5);
      items.push({p: orbP(rr(h), ob.inc, ob.raan, P.objPh(ob, t)), kind: k, col: ob.col, s: on ? 1 : 0.75, track: !!on, a: 0.55 + 0.45 * on, pulse: on ? lastPulse(P.leoRevs[k], t) : 0});
    }
    const sA = tr === 'starlink' ? 1 : 0.45;
    for (let j = 0; j < 6; j++) for (let k = 0; k < 7; k++) { const p = orbP(rr(OBJ.starlink.h - 20 + j * 12), OBJ.starlink.inc, OBJ.starlink.raan + j * 30, P.objPh(OBJ.starlink, t) + k * TAU / 7 + j * 0.4); if (!cam.hidden(p)) { const s = cam.P(p); circle(c, s[0], s[1], 2.4, rgba(OBJ.starlink.col, 0.85 * sA)); } }
    if (tr === 'starlink') withAlpha(c, fadeIn(t, P.trackSeq[3][0], 0.3), () => { const s = cam.P(orbP(rr(OBJ.starlink.h), OBJ.starlink.inc, OBJ.starlink.raan, P.objPh(OBJ.starlink, t) + 0.9)); ring(c, s[0], s[1], 22, PAL.gold, 3); });
    // polar orbit: a camera cone from the weather satellite to the ground
    if (tr === 'weather') {
      const ob = OBJ.weather, p = orbP(rr(ob.h), ob.inc, ob.raan, P.objPh(ob, t));
      if (!cam.hidden(p)) { const s = cam.P(p), g = cam.P(mul(unit(p), 1)); withAlpha(c, 0.5 * fadeIn(t, P.cloud13, 0.4), () => poly(c, [[s[0], s[1]], [g[0] - 18, g[1]], [g[0] + 18, g[1]]], rgba(PAL.green, 0.35))); }
      for (const [lat, n] of [[90, '북극'], [-90, '남극']]) { const q = cam.P([0, 0, lat > 0 ? 1.0 : -1.0]); withAlpha(c, fadeIn(t, P.pole13, 0.4), () => stage.text(n, q[0] + 26, q[1] + (lat > 0 ? -16 : 22), {size: 24, weight: 700, color: PAL.green})); }
    }
    // drag (s14): small backward arrows on Hubble
    const dA = clamp((t - P.drag[0]) / 0.4) * fadeOut(t, P.drag[1] + 0.6, 0.3);
    if (dA > 0) { const ob = OBJ.hubble, ph = P.objPh(ob, t), p = orbP(rr(P.hubbleH(t)), ob.inc, ob.raan, ph), p2 = orbP(rr(P.hubbleH(t)), ob.inc, ob.raan, ph - 0.25);
      if (!cam.hidden(p)) { const s = cam.P(p), s2 = cam.P(p2); withAlpha(c, dA, () => arrow(c, [s[0], s[1]], [lerp(s[0], s2[0], 1), lerp(s[1], s2[1], 1)], rgba(PAL.red, 0.95), 3, {head: 12})); } }
  }
  if (id === 'geo') {
    const hK = P.knobH(t);
    orbitRing(c, cam, rr(OBJ.weather.h), 0, 0, rgba(PAL.green, 0.3), 1.5);
    orbitRing(c, cam, rr(hK), 0, 0, rgba(PAL.gold, 0.85), 2.5);
    items.push({p: orbP(rr(hK), 0, 0, P.knobPh(t)), kind: 'sat', col: PAL.gold, s: 1, track: true});
  }
  for (const it of items) {
    if (cam.hidden(it.p)) continue; const s = cam.P(it.p);
    withAlpha(c, it.a ?? 1, () => {
      if (it.kind === 'iss') issIcon(c, s[0], s[1], 0.8 * it.s); else if (it.kind === 'hubble') hubbleIcon(c, s[0], s[1], 0.85 * it.s); else satIcon(c, s[0], s[1], 0.9 * it.s, it.col);
      if (it.track) { ring(c, s[0], s[1], 24, PAL.gold, 3); if (it.pulse > 0) ring(c, s[0], s[1], 24 + 18 * (1 - it.pulse), rgba(PAL.gold, it.pulse), 2); }
    });
  }
  // ---- ② ladder strip (LEO / GEO scenes)
  if (Lo.ladA > 0) withAlpha(c, Lo.ladA, () => ladderStrip(stage, t, P, Lo.lad, id));
  // ---- ③ altitude → period graph and readouts
  const hNow = id === 'essence' ? P.knobH(t) : id === 'geo' ? P.knobH(t) : (P.tracked(t) ? (P.tracked(t) === 'hubble' ? P.hubbleH(t) : OBJ[P.tracked(t)].h) : null);
  periodGraph(stage, t, P, Lo, hNow, id);
}
function ladderStrip(stage, t, P, L, id) {
  const c = stage.ctx, T = stage.theme, x = L.x;
  c.save(); c.beginPath(); c.rect(60, 370, 420, 500); c.clip();
  line(c, [[x, L.y0 + 10], [x, L.y1 - 30]], rgba(PAL.rail, 0.9), 3);
  for (let d = 2; d <= 5; d++) for (let m = 1; m <= 9; m++) {
    const h = m * 10 ** d, y = ly(L, h); if (y > L.y0 + 2 || y < L.y1 - 20) continue;
    line(c, [[x - (m === 1 ? 14 : 7), y], [x, y]], rgba(PAL.rail, m === 1 ? 1 : 0.6), m === 1 ? 2.5 : 1.5);
    if (m === 1 || (L.hi - L.lo < 1.5 && (m === 3 || m === 5))) stage.text(kmLabel(h), x - 22, y, {size: 24, weight: 500, color: T.muted, align: 'right'});
  }
  const yLo = ly(L, 160), yHi = ly(L, 2000), lA = id === 'leo' ? fadeIn(t, P.band, 0.4) : 1;
  withAlpha(c, lA, () => { rect(c, x - 6, yHi, 12, yLo - yHi, 3, rgba(PAL.gold, 0.35)); });
  const rows = [];
  if (id === 'leo') {
    const tr = P.tracked(t);
    rows.push([OBJ.iss.h, '우주정거장', OBJ.iss.col, tr === 'iss' ? 1 : 0.55]);
    rows.push([P.hubbleH(t), tr === 'hubble' && t > P.drag[0] ? '허블 · 1990 → 2026' : '허블 · 스타링크', OBJ.hubble.col, tr === 'hubble' || tr === 'starlink' ? 1 : 0.55]);
    rows.push([OBJ.weather.h, '극궤도 기상위성', OBJ.weather.col, tr === 'weather' ? 1 : 0.55]);
    rows.push([2000, '저궤도의 끝', PAL.gold, 0.9 * lA]);
  } else {
    rows.push([OBJ.iss.h, '저궤도', PAL.gold, 0.7]);
    rows.push([20200, 'GPS', T.muted, 0.6]);
    rows.push([H_GEO, '정지궤도', PAL.gold, fadeIn(t, P.dayLine, 0.4)]);
  }
  for (const [h, n, col, a] of rows) { const y = ly(L, h); if (y > L.y0 + 4 || y < L.y1 - 20) continue; withAlpha(c, a, () => { circle(c, x, y, 6, col); const w = stage.measure(n, {size: 24, weight: 700}); stage.text(n, x + 20, y, {size: 24, weight: 700, color: col}); stage.text(kmLabel(Math.round(h)), x + 28 + w, y, {size: 24, weight: 500, color: T.muted}); }); }
  c.restore();
  // tracking ring on the ladder
  const tr = id === 'leo' ? P.tracked(t) : 'knob';
  if (tr && tr !== 'starlink') { const h = id === 'leo' ? (tr === 'hubble' ? P.hubbleH(t) : OBJ[tr].h) : P.knobH(t), y = ly(L, h); if (y < L.y0 + 4 && y > L.y1 - 30) ring(c, x, y, 16, PAL.gold, 3); }
}
function periodGraph(stage, t, P, Lo, hNow, id) {
  const c = stage.ctx, T = stage.theme, {gx0: x0, gx1: x1, gy0: yb, gy1: yt} = Lo;
  const gx = lh => lerp(x0 + 86, x1 - 24, (lh - GRAPH.lx0) / (GRAPH.lx1 - GRAPH.lx0)), gy = lt => lerp(yb - 50, yt + 30, (lt - GRAPH.ly0) / (GRAPH.ly1 - GRAPH.ly0));
  panel(c, T, x0, yt, x1 - x0, yb - yt, 0.88);
  // readouts row (its own panel just above the graph)
  if (hNow != null) {
    const v = vCirc(hNow), Tn = period(hNow), w = x1 - x0, cols = [x0 + w * 0.17, x0 + w * 0.5, x0 + w * 0.83], ry = Lo.ry0;
    panel(c, T, x0, ry, x1 - x0, yt - ry - 10, 0.88);
    const big = w > 600 ? 34 : 29;
    stage.text('높이', cols[0], ry + 24, {size: 24, color: T.muted, align: 'center'}); stage.text(kmLabel(hNow >= 1000 ? Math.round(hNow / 10) * 10 : Math.round(hNow)), cols[0], ry + 62, {role: 'display', size: big, weight: 700, color: T.ink, align: 'center'});
    stage.text('속도', cols[1], ry + 24, {size: 24, color: T.muted, align: 'center'}); stage.text(`초속 ${fmt(v, 2)} km`, cols[1], ry + 62, {role: 'display', size: big, weight: 700, color: T.ink, align: 'center'});
    stage.text('한 바퀴', cols[2], ry + 24, {size: 24, color: T.muted, align: 'center'}); stage.text(periodStr(Tn), cols[2], ry + 62, {role: 'display', size: big, weight: 700, color: PAL.gold, align: 'center'});
  }
  // axes
  line(c, [[gx(GRAPH.lx0), gy(GRAPH.ly0)], [gx(GRAPH.lx1), gy(GRAPH.ly0)]], rgba(T.muted, 0.7), 2);
  line(c, [[gx(GRAPH.lx0), gy(GRAPH.ly0)], [gx(GRAPH.lx0), gy(GRAPH.ly1)]], rgba(T.muted, 0.7), 2);
  for (const [lh, s] of [[2, '100 km'], [3, '1,000'], [4, '1만'], [5, '10만']]) { stage.text(s, gx(lh), gy(0) + 24, {size: 24, color: T.muted, align: 'center'}); line(c, [[gx(lh), gy(0)], [gx(lh), gy(0) - 8]], rgba(T.muted, 0.7), 2); }
  for (const [lt, s] of [[0, '1시간'], [LOG(24), '하루'], [LOG(720), '한 달']]) { stage.text(s, gx(GRAPH.lx0) - 10, gy(lt), {size: 24, color: T.muted, align: 'right'}); line(c, [[gx(GRAPH.lx0), gy(lt)], [gx(GRAPH.lx0) + 8, gy(lt)]], rgba(T.muted, 0.7), 2); }
  // the curve T(h)
  const pts = []; for (let lh = GRAPH.lx0; lh <= GRAPH.lx1 + 1e-9; lh += 0.02) pts.push([gx(lh), gy(LOG(period(10 ** lh) / 3600))]);
  line(c, pts, rgba(PAL.sky, 0.8), 2.5);
  // "one day" line (GEO scene)
  if (id === 'geo') { const a = fadeIn(t, P.dayLine, 0.4); withAlpha(c, a, () => { const y = gy(LOG(SID / 3600)); line(c, [[gx(GRAPH.lx0), y], [gx(GRAPH.lx1), y]], rgba(PAL.green, 0.9), 2, {dash: [10, 7]}); stage.text('지구 자전 23시간 56분', gx(GRAPH.lx0) + 12, y - 22, {size: 24, weight: 700, color: PAL.green}); }); }
  // reference dots
  const ref = [[OBJ.iss.h, null], [OBJ.weather.h, null], [20200, null], [H_GEO, null], [OBJ.moon.h, '달']];
  for (const [h, n] of ref) { const x = gx(LOG(h)), y = gy(LOG(period(h) / 3600)); circle(c, x, y, 4.5, rgba(T.ink, 0.6)); if (n) stage.text(n, x + 12, y + 18, {size: 24, color: T.muted}); }
  if (hNow != null) { const x = gx(LOG(hNow)), y = gy(LOG(period(hNow) / 3600)); glow(c, x, y, 30, PAL.gold, 0.5); circle(c, x, y, 8, PAL.gold); ring(c, x, y, 16, PAL.gold, 3); }
}
function dashScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sc = ctx.scene, a = fadeIn(t, sc.start - 0.05, 0.2) * fadeOut(t, sc.end - 0.25, 0.25);
  withAlpha(c, a, () => dashboard(stage, t, P, dashLayout(t, P, ctx), {scene: 'leo'}));
  withAlpha(c, fadeIn(t, sc.start, 0.4) * a, () => stage.text('시간 1,100배 빠르게 · 92분 → 5초', 690, 360, {size: 24, color: stage.theme.muted, align: 'center'}));
}

// ------------------------------------------------------------------ geo: climb to 35,786 km → stays over one place → the view from 128.2°E
function geoScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, sc = ctx.scene;
  const a1 = fadeIn(t, sc.start - 0.05, 0.2) * fadeOut(t, P.topDown[0], 0.5), a2 = fadeIn(t, P.topDown[0] + 0.2, 0.5) * fadeOut(t, P.view17[0], 0.5), a3 = fadeIn(t, P.view17[0] + 0.2, 0.5) * fadeOut(t, sc.end - 0.25, 0.25);
  if (a1 > 0) withAlpha(c, a1, () => dashboard(stage, t, P, dashLayout(t, P, ctx), {scene: 'geo'}));
  if (a2 > 0) withAlpha(c, a2, () => geoTopDown(stage, t, P));
  if (a3 > 0) withAlpha(c, a3, () => geoView(stage, t, P));
}
function geoTopDown(stage, t, P) {
  const c = stage.ctx, T = stage.theme, cx = 540, cy = 740, Rpx = 58, cam = orthoCam(cx, cy, Rpx, 62, -90), sun = unit([-0.7, -0.5, 0.5]), spin = P.spin(t);
  glow(c, cx, cy, 300, '#3F7FD0', 0.07);
  drawEarthLit(stage, cam, getTex(), {axis: [0, 0, 1], spin, sun, cloudDrift: spin * 0.02, night: 0.12});
  const rG = (R_E + H_GEO) / R_E, rL = (R_E + OBJ.iss.h) / R_E;
  orbitRing(c, cam, rG, 0, 0, rgba(PAL.gold, 0.8), 2.5);
  orbitRing(c, cam, rL, 0, 0, rgba(PAL.sky, 0.6), 1.8);
  // Korea on the turning Earth and the geostationary satellite above 128.2°E
  const kor = (() => { const la = 37.5 * D2R, lo = (127.5 + spin) * D2R; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; })();
  const satP = orbP(rG, 0, 0, P.knobPh(t)), sg = cam.P(satP), kp = cam.P(kor), sub_ = cam.P(orbP(1, 0, 0, P.knobPh(t)));
  const la = fadeIn(t, P.stop16, 0.4);
  withAlpha(c, 0.4 + 0.6 * la, () => { line(c, [[kp[0], kp[1]], [sg[0], sg[1]]], rgba(PAL.gold, 0.75), 2, {dash: [8, 6]}); });
  if (!cam.hidden(kor)) { glow(c, kp[0], kp[1], 18, '#FF8A6E', 0.6); circle(c, kp[0], kp[1], 5, '#FFB59E'); }
  void sub_;
  satIcon(c, sg[0], sg[1], 1.1, PAL.gold); ring(c, sg[0], sg[1], 28, PAL.gold, 3); const pulse = lastPulse(P.geoRevs, t, 0.6); if (pulse > 0) ring(c, sg[0], sg[1], 28 + 22 * (1 - pulse), rgba(PAL.gold, pulse), 2);
  withAlpha(c, la, () => tag(stage, '늘 한반도 위에', sg[0], sg[1] - 52, {size: 28, color: PAL.gold}));
  const lp = cam.P(orbP(rL, 0, 0, 1.3 + TAU * P.tau(t) / OBJ.iss.T)); if (!cam.hidden(orbP(rL, 0, 0, 1.3 + TAU * P.tau(t) / OBJ.iss.T))) { glow(c, lp[0], lp[1], 16, PAL.sky, 0.6); circle(c, lp[0], lp[1], 5, '#DDF0FF'); }
  withAlpha(c, fadeIn(t, P.topDown[1] + 0.6, 0.4), () => tag(stage, '저궤도 위성: 하루에 15바퀴 넘게', 540, 1215, {size: 28, color: PAL.sky}));
  withAlpha(c, fadeIn(t, P.geo16, 0.4), () => tag(stage, '정지궤도 위성: 하루에 1바퀴 = 자전과 같이', 540, 1280, {size: 28, color: PAL.gold}));
  // day counter
  const days = (P.tau(t) - P.tau(P.topDown[0])) / SID;
  panel(c, T, 700, 360, 230, 64, 0.85); stage.text(`${fmt(Math.max(0, days), 1)}일 지남`, 815, 392, {role: 'display', size: 32, weight: 700, color: T.ink, align: 'center'});
}
function geoView(stage, t, P) {
  const c = stage.ctx, T = stage.theme, D = (R_E + H_GEO) / R_E, Rpx = 290, cx = 540, cy = 760;
  const lon = 128.2 * D2R, w = [Math.cos(lon), Math.sin(lon), 0];
  const cam = lookCam({pos: mul(w, D), dir: mul(w, -1), up: [0, 0, 1], F: Rpx * Math.sqrt(D * D - 1), cx, cy});
  const day = (P.tau(t) - P.tau(P.view17[0])) / SID, sAng = lon + 1.35 - TAU * day * 0.6;   // the sub-solar point moves west (drawn at 0.6 × the day clock: morning → afternoon)
  const sun = unit([Math.cos(sAng), Math.sin(sAng), 0.12]);
  // viewfinder frame
  const fr = 340; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) line(c, [[cx + sx * fr, cy + sy * fr + sy * -40 * -1 * 0 - sy * 0], [cx + sx * fr, cy + sy * (fr - 46)]], rgba(T.ink, 0.6), 3), line(c, [[cx + sx * fr, cy + sy * fr], [cx + sx * (fr - 46), cy + sy * fr]], rgba(T.ink, 0.6), 3);
  drawEarthLit(stage, cam, getTex(), {axis: [0, 0, 1], spin: 0, sun, cloudDrift: day * 30, night: 0.1});
  const kor = (() => { const la = 37.5 * D2R, lo = 127.5 * D2R; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; })(), kp = cam.P(kor);
  const ka = fadeIn(t, P.chol, 0.4), kb = lastPulse([P.pen], t, 0.8);
  glow(c, kp[0], kp[1], 40, '#FF8A6E', 0.35 + 0.3 * kb); ring(c, kp[0], kp[1], 30 + 10 * kb, rgba('#FF8A6E', 0.95), 3.5);
  withAlpha(c, ka, () => tag(stage, '한반도', kp[0] + 104, kp[1] - 34, {size: 28, color: '#FFB59E'}));
  stage.text('천리안 2A가 보는 지구 (동경 128.2° 위 3만 5,786 km)', 540, cy - fr - 30, {size: 24, weight: 500, color: T.muted, align: 'center'});
  withAlpha(c, fadeIn(t, P.chol, 0.4), () => { satIcon(c, 200, 1210, 1.2, PAL.gold); stage.text('천리안 2A', 240, 1195, {size: 28, weight: 700, color: PAL.gold}); stage.text('기상 · 동경 128.2°', 240, 1230, {size: 24, color: T.muted}); });
  withAlpha(c, fadeIn(t, P.mug, 0.4), () => { satIcon(c, 600, 1210, 1.2, '#DDE6F5'); stage.text('무궁화', 640, 1195, {size: 28, weight: 700, color: T.ink}); stage.text('통신 · 동경 116°', 640, 1230, {size: 24, color: T.muted}); });
  withAlpha(c, fadeIn(t, P.view17[0] + 0.8, 0.4), () => tag(stage, '지구는 제자리, 낮과 밤만 지나감', 540, cy + fr - 30, {size: 26, color: PAL.ice, plateA: 0.75}));
}

// ------------------------------------------------------------------ solar: L1 and L2 go round the Sun with the Earth
function solarScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, sc = ctx.scene, a = fadeIn(t, sc.start, 0.35) * fadeOut(t, sc.end - 0.25, 0.25);
  withAlpha(c, a, () => {
    // ---- top: Sun-centred view (L-point distance exaggerated ×20)
    const sx = 540, sy = 620, Rorb = 230, ex = 20 * 0.01 * Rorb, ph = P.yearPh(t);
    glow(c, sx, sy, 150, PAL.sun, 0.55); circle(c, sx, sy, 40, '#FFE3A0'); glow(c, sx, sy, 60, '#FFFFFF', 0.4);
    ring(c, sx, sy, Rorb, rgba(PAL.sky, 0.45), 2);
    const u = [Math.cos(ph), Math.sin(ph)], ePt = [sx + Rorb * u[0], sy + Rorb * u[1]], l1 = [sx + (Rorb - ex) * u[0], sy + (Rorb - ex) * u[1]], l2 = [sx + (Rorb + ex) * u[0], sy + (Rorb + ex) * u[1]];
    const la = fadeIn(t, P.l1l2, 0.4);
    withAlpha(c, la, () => { ring(c, sx, sy, Rorb - ex, rgba(PAL.gold, 0.25), 1.5, 0, TAU); ring(c, sx, sy, Rorb + ex, rgba(PAL.gold, 0.25), 1.5, 0, TAU); line(c, [[sx, sy], l2], rgba(PAL.gold, 0.4), 1.5, {dash: [6, 6]}); });
    sphereEarth(c, ePt[0], ePt[1], 13, u);
    withAlpha(c, la, () => { circle(c, l1[0], l1[1], 6, PAL.gold); circle(c, l2[0], l2[1], 6, PAL.gold); stage.text('L1', l1[0] - 18 * u[0], l1[1] - 18 * u[1] - 20, {size: 24, weight: 700, color: PAL.gold, align: 'center'}); stage.text('L2', l2[0] + 22 * u[0], l2[1] + 22 * u[1] - 20, {size: 24, weight: 700, color: PAL.gold, align: 'center'}); });
    stage.text('태양', sx, sy + 74, {size: 26, weight: 700, color: PAL.sun, align: 'center'});
    const pl = lastPulse(P.yearTicks, t, 0.7); if (pl > 0) ring(c, ePt[0], ePt[1], 20 + 24 * (1 - pl), rgba(PAL.sky, pl), 2);
    withAlpha(c, fadeIn(t, P.side18, 0.4), () => { tag(stage, '지구 · L1 · L2가 함께 1년에 한 바퀴', 540, 905, {size: 28, color: PAL.gold}); });
    stage.text('1년을 8초로 · L 점 거리 과장', 540, 360, {size: 24, color: T.muted, align: 'center'});
    // ---- bottom: true scale strip around the Earth (Sun to the left)
    const y = 1140, ex0 = 540, k = 300 / 1.5e6, mR = 384400 * k;
    line(c, [[90, y], [930, y]], rgba(T.muted, 0.35), 1.5);
    stage.text('← 태양 쪽', 80, y + 40, {size: 26, weight: 700, color: PAL.sun});
    ring(c, ex0, y, mR, rgba(PAL.moon, 0.6), 1.5, 0, TAU); moonBall(c, ex0 + mR * Math.cos(1.1), y - mR * Math.sin(1.1), 5);
    sphereEarth(c, ex0, y, 12, [-1, 0]);
    const xL1 = ex0 - 300, xL2 = ex0 + 300;
    withAlpha(c, la, () => {
      for (const [x0, x1] of [[xL1, ex0], [ex0, xL2]]) { line(c, [[x0, y + 62], [x1, y + 62]], rgba(PAL.gold, 0.8), 2); line(c, [[x0, y + 52], [x0, y + 72]], rgba(PAL.gold, 0.8), 2); line(c, [[x1, y + 52], [x1, y + 72]], rgba(PAL.gold, 0.8), 2); stage.text('150만 km', (x0 + x1) / 2, y + 94, {size: 26, weight: 700, color: PAL.gold, align: 'center'}); }
      stage.text('달 38만 km', ex0, y - mR - 22, {size: 24, color: T.muted, align: 'center'});
    });
    // SOHO at L1 looking at the Sun, Webb at L2 with its back to the Sun and the Earth
    const sA = fadeIn(t, P.soho, 0.4), jA = fadeIn(t, P.jwst19, 0.4);
    withAlpha(c, la, () => { circle(c, xL1, y, 5, PAL.gold); circle(c, xL2, y, 5, PAL.gold); stage.text('L1', xL1, y + 26, {size: 24, weight: 700, color: PAL.gold, align: 'center'}); stage.text('L2', xL2, y + 26, {size: 24, weight: 700, color: PAL.gold, align: 'center'}); });
    withAlpha(c, sA, () => {
      const pul = 0.5 + 0.5 * Math.sin(t * 3);
      for (const dy of [-96, -70, -44]) line(c, [[66, y + dy], [xL1 - 44, y + dy]], rgba(PAL.sun, 0.35 + 0.25 * pul), 2, {dash: [16, 10]});
      sohoIcon(c, xL1, y - 70, 1.0); tag(stage, '소호 · 태양 관측', xL1, y - 120, {size: 26, color: PAL.sun});
    });
    withAlpha(c, jA, () => {
      poly(c, [[xL2 + 40, y - 76], [925, y - 160], [925, y + 20], [xL2 + 40, y - 64]], rgba('#9FB8FF', 0.1));
      for (let i = 0; i < 16; i++) { const xx = xL2 + 80 + rand(i * 3.3) * 170, yy = y - 150 + rand(i * 7.1) * 180; if (yy < y - 74 - (xx - xL2 - 34) * 0.48 || yy > y - 62 + (xx - xL2 - 34) * 0.46) continue; circle(c, xx, yy, 1.6 + rand(i) * 1.4, rgba('#E9EEFF', 0.5 + 0.5 * Math.sin(t * 2 + i))); }
      jwstIcon(c, xL2, y - 70, 1.15, 1, {glow: 0.25});
      tag(stage, '제임스웹', xL2, y - 132, {size: 28, color: PAL.gold});
      withAlpha(c, fadeIn(t, P.back19, 0.4), () => { for (const dy of [-82, -58]) arrow(c, [xL2 - 90, y + dy], [xL2 - 40, y + dy], rgba(PAL.sun, 0.75), 2.5, {head: 11}); });
      withAlpha(c, fadeIn(t, P.cold19, 0.4), () => tag(stage, '그늘 속 거울은 영하 220 °C 아래', 640, 1290, {size: 28, color: PAL.ice}));
    });
  });
}
function sphereEarth(c, x, y, r, toward) {
  const g = c.createRadialGradient(x - toward[0] * r * 0.5, y - toward[1] * r * 0.5, r * 0.1, x, y, r); g.addColorStop(0, '#9FD3FF'); g.addColorStop(0.5, '#2F78C4'); g.addColorStop(1, '#0B2547');
  glow(c, x, y, r * 2.4, '#5FB4FF', 0.25); circle(c, x, y, r, g);
}

// ------------------------------------------------------------------ myth: a box on the ground vs a box in orbit (falling together)
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, sc = ctx.scene, a = fadeIn(t, sc.start, 0.35) * fadeOut(t, sc.end - 0.25, 0.25);
  withAlpha(c, a, () => {
    // left: on the ground
    const lx = 250, ly0 = 1000;
    panel(c, T, 80, 400, 340, 760, 0.5);
    stage.text('땅 위', lx, 440, {size: 30, weight: 700, color: T.ink, align: 'center'});
    rect(c, 90, ly0 + 92, 320, 60, 0, '#1B2C47'); line(c, [[90, ly0 + 92], [410, ly0 + 92]], rgba('#9CB3D9', 0.6), 2);
    rect(c, lx - 90, ly0 - 90, 180, 180, 10, rgba('#9CB3D9', 0.08), rgba('#C9D2E3', 0.85), 3);
    circle(c, lx, ly0 + 90 - 26, 24, '#F2C14E'); glow(c, lx, ly0 + 64, 40, PAL.gold, 0.25);
    arrow(c, [lx, ly0 - 160], [lx, ly0 - 160 + 110], rgba(PAL.red, 0.95), 5, {head: 18});
    stage.text('중력 100%', lx, ly0 - 190, {size: 28, weight: 700, color: PAL.red, align: 'center'});
    stage.text('공은 바닥에 눌림', lx, ly0 + 190 - 10, {size: 26, weight: 500, color: T.muted, align: 'center'});
    // right: in orbit (box and ball fall together along a curved path)
    const rx0 = 500, rx1 = 930;
    panel(c, T, rx0, 400, rx1 - rx0, 760, 0.5);
    stage.text('약 400 km 궤도', (rx0 + rx1) / 2, 440, {size: 30, weight: 700, color: T.ink, align: 'center'});
    const ECX = 715, ECY = 2300, ER = 1180, OR = 1500;            // a curved Earth below and the orbit arc (schematic)
    c.save(); c.beginPath(); c.rect(rx0, 470, rx1 - rx0, 690); c.clip();
    const eg = c.createRadialGradient(ECX, ECY, ER - 200, ECX, ECY, ER); eg.addColorStop(0, PAL.earth2); eg.addColorStop(1, '#1E5A8A'); circle(c, ECX, ECY, ER, eg); ring(c, ECX, ECY, ER + 3, rgba('#8FD0FF', 0.6), 4);
    ring(c, ECX, ECY, OR, rgba(PAL.gold, 0.5), 2, -Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3);
    stage.text('궤도', ECX + OR * Math.cos(-Math.PI / 2 + 0.135) + 6, ECY + OR * Math.sin(-Math.PI / 2 + 0.135) - 26, {size: 24, weight: 700, color: PAL.gold});
    const q = P.boxPhase(t) % 1, ang = -Math.PI / 2 - 0.08 + 0.16 * q, bx = ECX + OR * Math.cos(ang), by = ECY + OR * Math.sin(ang);
    // tangent (no gravity) from the box position
    const ta = fadeIn(t, P.together21, 0.4) + fadeIn(t, P.not20, 0.4) * 0.6;
    withAlpha(c, clamp(ta), () => { const tx = -Math.sin(ang), ty = Math.cos(ang), d = -1; line(c, [[bx, by], [bx + d * tx * -260, by + d * ty * -260]], rgba(T.ink, 0.6), 2.5, {dash: [10, 8]}); });
    c.save(); c.translate(bx, by); c.rotate(ang + Math.PI / 2);
    rect(c, -70, -70, 140, 140, 10, rgba('#9CB3D9', 0.08), rgba('#C9D2E3', 0.85), 3);
    const wob = Math.sin(t * 1.3) * 6; circle(c, wob * 0.6, wob, 22, '#F2C14E'); glow(c, wob * 0.6, wob, 36, PAL.gold, 0.25);
    c.restore();
    // gravity arrows toward the Earth's centre on both box and ball
    const gx = ECX - bx, gy = ECY - by, gl = Math.hypot(gx, gy), ux = gx / gl, uy = gy / gl, L88 = 110 * gRatio(OBJ.iss.h);
    arrow(c, [bx + ux * 90, by + uy * 90], [bx + ux * (90 + L88), by + uy * (90 + L88)], rgba(PAL.red, 0.95), 5, {head: 18});
    c.restore();
    const pa = fadeIn(t, P.pct21, 0.4);
    withAlpha(c, pa, () => { stage.text(`중력 ${Math.round(gRatio(OBJ.iss.h) * 100)}%`, (rx0 + rx1) / 2, 1110, {role: 'display', size: 40, weight: 700, color: PAL.red, align: 'center'}); stage.text('(약 90%)', (rx0 + rx1) / 2, 1150, {size: 26, color: T.muted, align: 'center'}); });
    withAlpha(c, fadeIn(t, P.together21, 0.4), () => tag(stage, '상자와 공이 함께 떨어지며 돈다', 540, 1250, {size: 30, color: PAL.gold}));
    withAlpha(c, fadeIn(t, P.float20, 0.4) * fadeOut(t, P.pct21, 0.4), () => tag(stage, '공이 떠 있다 → 중력이 없어서?', 540, 1250, {size: 30, color: T.ink}));
    // bars: gravity strength
    withAlpha(c, pa, () => { const bx0 = 140, bw = 230; rect(c, bx0, 1210 - 1000, 0, 0); void bx0; void bw; });
  });
}

// ------------------------------------------------------------------ close: higher = slower, each job its height → poster
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, back = fadeIn(t, P.posterBack, 0.7), fin = fadeIn(t, ctx.scene.start - 0.05, 0.4);
  const lab = (1 - back);
  posterPicture(stage, t, fin, {labels: lab * 0.9, objLabels: 0, hl: {jwst: 1}, clipTop: 318 * lab, big: 1 + 0.6 * back});
  // one-lap time beside each rung (bottom → top)
  const rows = [[OBJ.iss.h, '저궤도 · 92분'], [H_GEO, '정지궤도 · 하루'], [OBJ.moon.h, '달 · 27일'], [OBJ.l2.h, 'L2 · 태양 둘레 1년']];
  rows.forEach(([h, s], i) => { const a = fadeIn(t, P.periodLabels[i], 0.35) * lab * fin; if (a > 0) tag(stage, s, 652, ly(POSTER_L, h), {a, size: 30, align: 'left', color: i === 3 ? PAL.gold : T.ink}); });
  withAlpha(c, lab * fin * fadeIn(t, P.periodLabels[0] - 0.3, 0.3), () => { arrow(c, [100, 1180], [100, 470], rgba(PAL.gold, 0.7), 4, {head: 18}); stage.text('높을수록', 122, 790, {size: 30, weight: 700, color: PAL.gold}); stage.text('느리게', 122, 832, {size: 30, weight: 700, color: PAL.gold}); });
  if (back > 0) { captionShade(c, back); posterTitle(stage, t, 0, back); }
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings:
//  - ×10 rungs of the ladder → a tone a minor third higher per decade (98 Hz at 0.1 km … 293 Hz at 1 million km).
//  - A satellite completing one revolution → a low tick (tracked satellite 147 Hz, comparison satellite 196 Hz, quieter);
//    higher orbits tick less often — the slowing is heard.
//  - Cannon: launch thump 58 Hz, ground impact thump 70 Hz, the third ball returning to the mountain → tick + swell.
//  - GEO climb: the satellite's lap rate → pitch 110·(Ω_sat/Ω⊕)^0.4 Hz against a steady 110 Hz Earth tone; the beating
//    disappears when the two rates are equal (35,786 km).
//  - Air probe (scale): pitch follows log altitude on the rung scale.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [], sc = id => tl.scene(id);
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.08, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -33}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, times, means, gain = -31, f = 58) => { const T0 = [].concat(times); ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => [{kind: 'tone', offset: r(tt - T0[0], 4), params: {freq: f, dur: 0.45, harmonics: [1, 0.35], attack: 0.004, decay: 0.15, release: 0.15, gain_db: 0}}, {kind: 'noise', offset: r(tt - T0[0], 4), params: {dur: 0.2, low: 40, high: 220, release: 0.15, gain_db: -10}}])}, means}); };
  const tone = (id, t0, freq, dur, gain, means) => ev.push({id, at: r(t0, 4), kind: 'tone', params: {freq, dur, harmonics: [1, 0.25], attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.25, gain_db: gain}, means});

  // ---- hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 산에서 제임스웹까지 이어진 높이 사다리와 제목', {dur: 1.8, gain: -35});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  tick('label_baekdu', P.bdLabel, 110, -36, '"백두산" 이름 (사다리 맨 아래)');
  tick('label_jwst', P.jwLabel, 220, -36, '"제임스웹 150만 km"가 밝아짐 (사다리 맨 위)');
  chirp('rise_baekdu', P.bdRise[0], P.bdRise[1], tt => rungHz(LOG(Math.max(0.05, 2.744 * easeOut((tt - P.bdRise[0]) / (P.bdRise[1] - P.bdRise[0]))))), () => 0.3, -37, '백두산 윤곽이 솟음: 꼭대기 높이(로그) → 음높이(눈금 음과 같은 대응)', {fi: 0.1, fo: 0.25});
  chirp('rise_everest', P.evRise[0], P.evRise[1], tt => rungHz(LOG(Math.max(0.05, 8.849 * easeOut((tt - P.evRise[0]) / (P.evRise[1] - P.evRise[0]))))), () => 0.3, -37, '에베레스트 윤곽이 솟음: 8,849 m까지, 같은 대응으로 백두산보다 조금 높은 음', {fi: 0.1, fo: 0.25});
  tick('highest', P.highest, 131, -36, '"땅 위에서 가장 높은 곳"');
  for (const {L, t} of P.climbRungs) tone(`climb_${L}`, t, rungHz(L), 0.35, -36, `카메라가 사다리를 오르며 ${kmLabel(10 ** L)} 눈금을 지남 (한 칸 = ×10, 음 하나 = 단3도 위)`);
  swell('arrive_jwst', P.arrive, [rungHz(6) / 2, rungHz(6)], '제임스웹(150만 km)에 도착', {dur: 1.6, gain: -34});
  tick('moon', P.moon3, 165, -35, '"달 38만 km"');
  tick('times4', P.four3 + 0.15, 196, -34, '"달까지의 약 4배" 괄호', {decay: 0.12});
  whoosh('zoom_out', P.zoomOut[0], P.zoomOut[1] - P.zoomOut[0], 160, 90, '사다리 전체로 줄여 봄', -37);
  // ---- scale
  tick('compare', P.cmp + 0.1, 110, -35, '보통 눈금: 산·정거장·위성이 모두 바닥에 붙음');
  P.rungSteps.forEach((tt, k) => tone(`rung_${k}`, tt, rungHz(DECADES[k]), 0.3, -35, `×10 눈금이 한 칸씩 켜짐: ${kmLabel(10 ** DECADES[k])} (한 칸 = 단3도 위)`));
  chirp('probe', P.probe[0], P.probe[1] + 0.3, tt => rungHz(LOG(P.probeH(tt))), () => 0.28, -37, '공기 밀도 측정점이 오름: 높이(로그) → 음높이, 100 km에서 멈춤', {fi: 0.2, fo: 0.3});
  tick('karman', P.karman + 0.05, 196, -33, '"우주의 경계 100 km" 점선', {decay: 0.14});
  swell('space', P.space5, [rungHz(2) / 2, rungHz(2)], '"우주" / "대기"', {dur: 1.4, gain: -35});
  // ---- essence
  tick('word', P.satl, 147, -34, '"satellite ← satelles"', {decay: 0.12});
  tick('guard', P.king, 131, -35, '"왕을 곁에서 지키는 호위병"');
  tick('kepler', P.kepler, 165, -35, '"1611 케플러가 satellites라 부름"');
  thump('cannon_fire', P.shots, '대포 발사 세 번 (초속 6.5 · 7.0 · 7.4 km)', -32, 58);
  thump('cannon_hit', P.shotEnd.slice(0, 2), `대포알이 땅에 닿음 (첫째 ${fmt(CANNON_TRACKS[0].end / 60, 0)}분, 둘째 ${fmt(CANNON_TRACKS[1].end / 60, 0)}분 뒤 · 시간 1,100배 빠르게)`, -33, 70);
  tick('cannon_round', P.shotEnd[2], 147, -33, `셋째 대포알이 지구를 한 바퀴 돌아 산으로 돌아옴 (${fmt(CANNON_TRACKS[2].end / 60, 0)}분)`, {decay: 0.14});
  swell('fall', P.fall8, [110, 165], '"떨어지는 만큼 땅이 둥글게 멀어짐" — 직선과 휘는 길', {dur: 1.4});
  ticks('lap_knob9', P.s09revK, 147, -36, `금빛 위성이 한 바퀴 돌 때마다 틱 147 Hz (${P.s09revK.length}번): 400 km에서 2만 km로 오르며 간격이 길어짐`, {decay: 0.07});
  ticks('lap_ghost9', P.s09revG, 196, -40, `비교 위성(400 km)의 한 바퀴 틱 196 Hz (${P.s09revG.length}번, 약 4초 간격)`, {decay: 0.05});
  // ---- leo
  swell('leo_band', P.band, [rungHz(3) / 2, rungHz(3)], '저궤도(2,000 km 아래) 띠가 켜짐', {dur: 1.4, gain: -35});
  for (const [k, n] of [['iss', '국제우주정거장'], ['hubble', '허블'], ['weather', '극궤도 기상위성']]) ticks(`lap_${k}`, P.leoRevs[k], 147, -37, `${n}이(가) 한 바퀴 돌 때마다 틱 (${period(OBJ[k].h) / 60 | 0}분 → 시간 1,100배로 ${fmt(period(OBJ[k].h) / K1, 1)}초)`, {decay: 0.07});
  for (const [i, [t0, id]] of P.trackSeq.entries()) if (i > 0) tick(`track_${i}`, t0 + 0.15, id === 'iss' ? 131 : id === 'weather' ? 175 : 147, -35, `추적 표식이 ${id === 'iss' ? '우주정거장' : id === 'hubble' ? '허블' : id === 'starlink' ? '스타링크' : '기상위성'}으로 옮겨 감`);
  whoosh('drag', P.drag[0], P.drag[1] - P.drag[0], 150, 85, '허블의 높이가 약 600 km(1990) → 약 500 km(2026)로 내려옴 (옅은 공기의 끌림)', -35);
  // ---- geo
  const fSat = tt => 110 * (SID / period(P.knobH(tt))) ** 0.4;
  chirp('geo_sat', P.kGeo[0] - 0.3, P.same15 + 1.2, fSat, () => 0.26, -38, `오르는 위성의 한 바퀴 빠르기 → 음높이 110·(위성/자전)^0.4 Hz: ${fSat(P.kGeo[0]).toFixed(0)} Hz → 110 Hz`, {fi: 0.3, fo: 0.4});
  chirp('geo_earth', P.kGeo[0] - 0.3, P.same15 + 1.2, () => 110, () => 0.26, -38, '지구 자전의 빠르기 = 고정 110 Hz. 두 음이 같아지면 맥놀이가 사라짐 (3만 5,786 km)', {fi: 0.3, fo: 0.4});
  tick('day_line', P.dayLine, 131, -35, '그래프에 "지구 자전 23시간 56분" 선');
  ticks('geo_lap', P.geoRevs, 110, -35, `정지궤도 위성과 지구가 함께 한 바퀴 (하루 = 12초) — 같은 순간 한 번의 틱`, {decay: 0.12});
  ticks('leo_lap', P.leoGhostRevs, 220, -42, `비교: 저궤도 위성(400 km)의 한 바퀴 틱 (하루 15바퀴 넘게)`, {decay: 0.04});
  tick('stay', P.stop16, 147, -34, '"늘 한반도 위에"');
  swell('chollian', P.view17[0] + 0.2, [110, 165], '천리안 2A가 보는 지구 (동경 128.2°)', {dur: 1.6, gain: -35});
  tick('chol', P.chol, 165, -35, '"천리안 2A · 기상"'); tick('mug', P.mug, 131, -35, '"무궁화 · 통신"'); tick('korea', P.pen, 196, -34, '"한반도" 표시');
  // ---- solar
  swell('sun', sc('solar').start + 0.1, [82, 123], '태양을 도는 지구 (1년 = 8초)', {dur: 1.8, gain: -35});
  tick('l1l2', P.l1l2, 196, -34, 'L1 · L2 (지구에서 150만 km)');
  ticks('year', P.yearTicks, 110, -36, '지구와 L1·L2가 함께 태양을 한 바퀴 (1년) — 같은 순간 한 번의 틱', {decay: 0.12});
  tick('soho', P.soho, 165, -35, '"소호 · 태양 관측"'); tick('jwst', P.jwst19, 147, -35, '"제임스웹"');
  swell('cold', P.cold19, [98, 147], '햇빛 차단막 뒤의 차가운 그늘', {dur: 1.4, gain: -36});
  // ---- myth
  thump('ball_rest', sc('myth').start + 0.3, '땅 위 상자: 공이 바닥에 눌려 있음', -36, 70);
  swell('no', P.not20, [110, 165], '"중력이 없어서가 아닙니다"', {dur: 1.3});
  tick('pct', P.pct21, 196, -34, `"중력 ${Math.round(gRatio(OBJ.iss.h) * 100)}%" (약 90%)`, {decay: 0.12});
  swell('together', P.together21, [98, 147, 196], '"상자와 공이 함께 떨어지며 돈다"', {dur: 1.6, gain: -34});
  // ---- close
  P.periodLabels.forEach((tt, i) => tick(`period_${i}`, tt, [196, 165, 131, 110][i], -35, `한 바퀴 시간 표시: ${['저궤도 92분', '정지궤도 하루', '달 27일', 'L2 1년'][i]} (높을수록 낮은 음)`, {decay: 0.12}));
  swell('poster_back', P.posterBack, [110, 165, 220], '"위성마다" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -33});
  return lowBandOnly(ev, modelSignature(tl));
}
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') {
      const f = Math.max(...p.points.map(q => q[1])); if (f >= HIGH_CUT) throw new Error(`${e.id}: chirp ${f} Hz`);
      p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT);
    } else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/orbit-altitudes/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(로그 높이 사다리, 뉴턴의 대포 궤적, 위성의 한 바퀴, 정지궤도로 오르는 위성, 태양 둘레 1년)에서 써 넣습니다. 대응: ×10 눈금 → 단3도씩 오르는 음(98~293 Hz), 위성 한 바퀴 → 낮은 틱(추적 147 Hz, 비교 196·220 Hz; 높을수록 드물게), 대포 발사·착지 → 쿵, 정지궤도: 위성의 빠르기 음이 고정된 지구 자전 음(110 Hz)과 같아지며 맥놀이가 사라짐. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; climb rungs ${P.climbRungs.length}; s09 laps ${P.s09revK.length}/${P.s09revG.length}; leo laps ${Object.entries(P.leoRevs).map(([k, v]) => k + ' ' + v.length).join(', ')}; geo laps ${P.geoRevs.length}/${P.leoGhostRevs.length}; year ${P.yearTicks.length}`);
  console.log(`H_GEO ${H_GEO.toFixed(1)} km; ISS ${fmt(period(400) / 60, 1)} min ${vCirc(400).toFixed(2)} km/s; cannon ends ${CANNON_TRACKS.map(x => (x.end / 60).toFixed(1) + (x.hit ? ' hit' : ' orbit')).join(', ')}; g(400) ${gRatio(400).toFixed(3)}`);
}
