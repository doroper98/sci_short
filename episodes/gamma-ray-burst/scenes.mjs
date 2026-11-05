// Episode scenes — "감마선 폭발 — 우주에서 가장 밝은 섬광"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Energy: Sun 3.83×10²⁶ W × 100억 년 (3.156×10¹⁷ s) = 1.21×10⁴⁴ J. A bright long burst's beaming-corrected gamma energy is
//    taken as 1.2×10⁴⁴ J (≈10⁵¹ erg), released over the few seconds of the model light curve grbCurve().
//  - Beaming: two opposite cones of half-angle θ cover the sky fraction f(θ) = 1 − cos θ (θ = 90° → 1). θ = 5° → f = 0.0038,
//    brightness along the jet × 1/f ≈ 263, and only that fraction of directions sees it (myth: seen ≈ total × f).
//  - Vela: plane wave from direction s; satellites on a 1.18×10⁵ km orbit; the front reaches satellite i at Δt_i = −(r_i·s)/c
//    (spread ≤ 0.79 s). The screen replays the same front slowly; ticks and readouts use the computed order and values.
//  - Light curves (model shapes): bomb = one sharp rise and smooth decay; 1967-07-02 = two peaks.
//  - Photon energies: visible 2 eV, burst gamma 500 keV → × 250,000. Atmosphere: τ(h) = 90·e^(−h/7.5 km) for ~500 keV photons
//    (≈ 0.087 cm²/g × 1033 g/cm²) → absorbed mostly at 25–50 km.
//  - Sky map (model, not BATSE data): 2,704 isotropic seeded points on a Hammer projection vs a galactic-disk comparison
//    (gaussian latitude, σ = 7°). Afterglow of GRB 970508: z = 0.835, every line × 1.835; flat ΛCDM (H0 67.7, Ωm 0.31) look-back
//    time 7.2 Gyr → "약 70억 광년" (light-travel distance); the same function gives GRB 221009A (z = 0.151) ≈ 20억 광년.
//  - Internal shocks (explanatory model): five shells with screen speeds; faster catches slower (momentum conserved,
//    dissipated ½·m₁m₂/(m₁+m₂)·Δv² → the spike height on the gamma graph). External shock: the merged head sweeps up gas
//    (M₀v₀ = (M₀ + ρx)v). Afterglow: smoothly broken power laws on a log time axis, peaks X 5 min → optical 1 h → radio 4 days,
//    decline ∝ t^−1.2.
//  - Engines: duration distribution = two log-normals (0.3 s ×0.22, 30 s ×0.78), divider 2 s. Long: star R = 7×10⁵ km, jet head
//    0.4c → breakout 5.8 s. Short: leading-order chirp f_GW = 135 Hz·τ^−3/8 (GW170817 chirp mass), separation ∝ τ^1/4.
//    GW170817 → GRB 170817A after 1.74 s (drawn 1:1 in screen time).
//  - GRB 221009A: z = 0.151, detector gauge pegged (model count curve, peak 60× a typical bright burst, full scale 10×),
//    ionosphere (~500 km, drawn higher) shaken ~10 h; such a burst ≈ once per 10,000 years.
//  - Sound: node episodes/gamma-ray-burst/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';
import {lookCam, earthTextures, drawEarthLit} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const D2R = Math.PI / 180;
const fred = (x, p) => p.A * (x < p.t ? Math.exp(-(((x - p.t) / p.r) ** 2)) : Math.exp(-(x - p.t) / p.d));
// energy (hook)
export const L_SUN = 3.83e26, YEAR_S = 3.156e7, SUN_YEARS = 1e10;
export const E_SUN10 = L_SUN * YEAR_S * SUN_YEARS;                      // 1.21e44 J
export const E_GRB = 1.2e44;                                            // beaming-corrected gamma energy (≈ 10^51 erg)
/** model gamma-ray light curve of one long burst (seconds since the burst started; a few FRED pulses, ≈ 6.5 s) */
export const GRB_PULSES = [{t: 0.05, A: 0.8, r: 0.05, d: 0.3}, {t: 0.8, A: 1.0, r: 0.08, d: 0.42}, {t: 1.6, A: 0.6, r: 0.06, d: 0.32},
  {t: 2.45, A: 0.78, r: 0.1, d: 0.5}, {t: 3.55, A: 0.42, r: 0.12, d: 0.55}, {t: 4.6, A: 0.24, r: 0.15, d: 0.7}];
export const grbCurve = x => (x < -0.3 ? 0 : GRB_PULSES.reduce((s, p) => s + fred(x, p), 0));
export const GRB_SPAN = 6.5;
const GRB_CUM = (() => { const n = 651, c = new Float64Array(n); for (let i = 1; i < n; i++) c[i] = c[i - 1] + 0.5 * (grbCurve((i - 1) / 100) + grbCurve(i / 100)) / 100; for (let i = 0; i < n; i++) c[i] /= c[n - 1]; return c; })();
/** fraction of the burst's energy released by time x (s) */
export const grbFrac = x => { const u = clamp(x / GRB_SPAN) * 650, i = Math.min(649, Math.floor(u)); return lerp(GRB_CUM[i], GRB_CUM[i + 1], u - i); };
// Vela (origin)
export const C_KMS = 299792.458, VELA_R_KM = 1.18e5, SRC_ANG = 35;      // orbit radius; source direction (deg, up-right on screen)
export const VELA = [{n: 'A', ang: 20}, {n: 'B', ang: 110}, {n: 'C', ang: 200}, {n: 'D', ang: 290}];
/** arrival of a plane front from SRC_ANG at a satellite at angle ang, relative to the Earth's centre (s) */
export const velaDelay = ang => -VELA_R_KM * Math.cos((ang - SRC_ANG) * D2R) / C_KMS;
export const VELA_DT = (() => { const d = VELA.map(s => velaDelay(s.ang)), m = Math.min(...d); return d.map(x => x - m); })();
export const bombCurve = x => (x < 0 ? 0 : (1 - Math.exp(-x / 0.05)) * Math.exp(-x / 1.1));
export const VELA67 = [{t: 1.0, A: 1.0, r: 0.25, d: 0.5}, {t: 3.2, A: 0.74, r: 0.42, d: 0.95}];
export const vela67 = x => (x < 0 ? 0 : VELA67.reduce((s, p) => s + fred(x, p), 0));
// photons (gamma)
export const E_VIS = 2, E_GAMMA = 5e5, GAMMA_RATIO = E_GAMMA / E_VIS;   // eV
export const BANDS = [{n: '전파', lg: 0}, {n: '마이크로파', lg: -2}, {n: '적외선', lg: -4.7}, {n: '가시광선', lg: -6.26}, {n: '자외선', lg: -7.3},
  {n: 'X선', lg: -9.9}, {n: '감마선', lg: -11.6}];                       // log10 wavelength (m) of a typical member
export const ATM_H = 7.5, ATM_TAU = 90, ATM_TOP = 120;                  // km, optical depth of the whole column (~500 keV)
/** absorption altitude (km) for a photon whose random draw is u ∈ (0, 1): τ(h) = ATM_TAU·e^(−h/H) reaches −ln u */
export const absorbAlt = u => Math.min(ATM_TOP, ATM_H * Math.log(ATM_TAU / Math.max(1e-9, -Math.log(Math.min(u, 1 - 1e-9)))));
// sky (model points, not BATSE data)
export const N_BATSE = 2704, BAND_SIG = 7, BAND_CUT = 10;
const gauss = R => Math.sqrt(-2 * Math.log(Math.max(1e-12, R()))) * Math.cos(TAU * R());
export const SKYPTS = (() => {
  const R = rng(2704), iso = [], disk = [];
  for (let i = 0; i < N_BATSE; i++) iso.push({l: (R() * 2 - 1) * Math.PI, b: Math.asin(R() * 2 - 1)});
  for (let i = 0; i < N_BATSE; i++) { let b; do b = gauss(R) * BAND_SIG * D2R; while (Math.abs(b) > Math.PI / 2); disk.push({l: (R() * 2 - 1) * Math.PI, b}); }
  return {iso, disk};
})();
/** Hammer projection, x ∈ [−1, 1], y ∈ [−0.5, 0.5] (north up) */
export const hammer = (l, b) => { const z = Math.sqrt(1 + Math.cos(b) * Math.cos(l / 2)); return [Math.cos(b) * Math.sin(l / 2) / z, -0.5 * Math.sin(b) / z]; };
export const nearBand = list => list.filter(p => Math.abs(p.b) < BAND_CUT * D2R).length / Math.max(1, list.length);
// redshift and distance
export const Z_970508 = 0.835, Z_221009 = 0.151;
export const LINES_970508 = [{n: 'Fe II', lab: 238.3}, {n: 'Fe II', lab: 260.0}, {n: 'Mg II', lab: 279.6}, {n: 'Mg I', lab: 285.2}];
export const H0 = 67.7, OMEGA_M = 0.31;
/** look-back time (Gyr) in flat ΛCDM = light-travel distance in billions of light-years */
export const lookbackGyr = z => { const n = 2000; let s = 0; for (let i = 0; i < n; i++) { const q = (i + 0.5) / n * z; s += 1 / ((1 + q) * Math.sqrt(OMEGA_M * (1 + q) ** 3 + 1 - OMEGA_M)) * z / n; } return 977.8 / H0 * s; };
export const D_GW170817 = '약 1억 3천만 광년';                         // NGC 4993, ≈ 40 Mpc
// beaming (jet, myth)
export const fSky = thDeg => 1 - Math.cos(thDeg * D2R);
export const TH_JET = 5, BOOST = 1 / fSky(TH_JET);                       // ≈ 263
// internal shocks (screen units: px from the engine, s since the first shell)
export const SHELLS = {e: [0, 0.6, 1.41, 2.07, 2.83], v: [70, 104, 100, 176, 173]};
export function shellSim({e, v}) {
  let S = e.map((ei, i) => ({born: ei, e: ei, v: v[i], m: 1, x0: -v[i] * ei, id: String(i)}));
  const segs = [], col = []; let t = 0;
  for (;;) {
    let best = null;
    for (const a of S) for (const b of S) { if (a === b || a.v <= b.v) continue; const tc = (b.x0 - a.x0) / (a.v - b.v); if (tc <= t + 1e-9 || tc < Math.max(a.e, b.e)) continue; if (!best || tc < best.tc) best = {a, b, tc}; }
    if (!best) break;
    const {a, b, tc} = best, M = a.m + b.m, V = (a.m * a.v + b.m * b.v) / M, x = a.x0 + a.v * tc;
    col.push({tc, x, dKE: 0.5 * a.m * b.m / M * (a.v - b.v) ** 2, ids: [a.id, b.id], m: M});
    segs.push({...a, died: tc}, {...b, died: tc});
    S = S.filter(s => s !== a && s !== b); S.push({born: tc, e: tc, v: V, m: M, x0: x - V * tc, id: a.id + '+' + b.id}); t = tc;
  }
  for (const s of S) segs.push({...s, died: Infinity});
  const kMax = Math.max(...col.map(c => c.dKE));
  col.forEach(c => { c.k = c.dKE / kMax; });
  return {col, segs, final: S};
}
export const SHOCK = shellSim(SHELLS);
export const RHO_GAS = 0.03;                                             // swept-up mass per px (shell mass 1)
/** jet head after it meets the gas at s = 0 with speed v0 and mass M0: (M0 + ρ x) v = M0 v0 */
export const headX = (tau, v0, M0) => (tau <= 0 ? v0 * tau : (-M0 + Math.sqrt(M0 * M0 + 2 * RHO_GAS * M0 * v0 * tau)) / RHO_GAS);
export const headV = (tau, v0, M0) => (tau <= 0 ? v0 : M0 * v0 / Math.sqrt(M0 * M0 + 2 * RHO_GAS * M0 * v0 * tau));
// afterglow (minutes since the burst; peaks X → optical → radio; decline ∝ t^−1.2)
export const AG_RISE = 2, AG_DECAY = 1.2, AG_TMAX = 43200;               // 30 days
const agRaw = x => x ** AG_RISE / (1 + x ** (AG_RISE + AG_DECAY));
const AG_NORM = agRaw((AG_RISE / AG_DECAY) ** (1 / (AG_RISE + AG_DECAY)));
export const AG = [{id: 'x', n: 'X선', tp: 5, col: '#9FC8FF'}, {id: 'opt', n: '가시광선', tp: 60, col: '#FFE08A'}, {id: 'radio', n: '전파', tp: 5760, col: '#FF9A6A'}];
export const agFlux = (tMin, tp) => agRaw(tMin / tp) / AG_NORM;
// durations (model curve)
export const DUR = {short: {mu: Math.log10(0.3), s: 0.42, w: 0.22}, long: {mu: Math.log10(30), s: 0.48, w: 0.78}, split: 2};
const gpdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(TAU));
export const durPdf = lg => DUR.short.w * gpdf(lg, DUR.short.mu, DUR.short.s) + DUR.long.w * gpdf(lg, DUR.long.mu, DUR.long.s);
// engines
export const STAR_R_KM = 7e5, HEAD_BETA = 0.4, T_BREAKOUT = STAR_R_KM / (HEAD_BETA * C_KMS);   // ≈ 5.8 s
export const fGW = tauReal => 135 * Math.max(tauReal, 2e-3) ** (-3 / 8);   // Hz, leading order (chirp mass ≈ 1.19 M☉)
export const GW_DELAY = 1.74, INSP_REAL = 100;                          // s; real seconds shown by the inspiral
// GRB 221009A
export const BOAT = {peak: 60, full: 10, typical: 1, ionoKm: 500, hours: 10, perYears: 1e4, obs: [1967, 2022]};
export const BOAT_PULSES = [{t: 0.35, A: 0.08, r: 0.15, d: 0.3}, {t: 1.15, A: 1.0, r: 0.35, d: 1.6}, {t: 2.4, A: 0.55, r: 0.25, d: 1.2}];
export const boatCurve = x => BOAT.peak * BOAT_PULSES.reduce((s, p) => s + fred(x, p), 0);
// myth: random sky positions and jet axes; seen when the jet (either cone) contains the Earth
export const MYTH = {N: 790, seed: 234, days: 3, th: TH_JET};
export const MYTH_SET = (() => {
  const R = rng(MYTH.seed), cosT = Math.cos(MYTH.th * D2R), u = () => { const z = 2 * R() - 1, p = R() * TAU, s = Math.sqrt(1 - z * z); return [s * Math.cos(p), s * Math.sin(p), z]; };
  const B = []; for (let i = 0; i < MYTH.N; i++) { const pos = u(), ax = u(), day = R() * MYTH.days; B.push({pos, ax, day, seen: Math.abs(pos[0] * ax[0] + pos[1] * ax[1] + pos[2] * ax[2]) > cosT}); }
  return B.sort((a, b) => a.day - b.day);
})();

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  today: W('s01', '오늘은'), univ: W('s01', '우주에서'), bright1: W('s01', '밝은'), gamma1: W('s01', '감마선'), ask: W('s01', '알아볼까요'),
  this2: W('s02', '폭발은'), dan: W('s02', '단'), few: W('s02', '몇 초'), sun2: W('s02', '태양이'), g10: W('s02', '백억년'), allLong: W('s02', '내내'),
  energy2: W('s02', '에너지를'), atOnce: W('s02', '한꺼번에'), asLight: W('s02', '빛으로'), pour: W('s02', '쏟아'),
  y1963: W('s03', '천구백육십삼년'), air: W('s03', '대기와'), space3: W('s03', '우주에서의'), test: W('s03', '핵실험이'), banned: W('s03', '금지되자'),
  usa: W('s03', '미국은'), nuke: W('s03', '핵폭발의'), gamma3: W('s03', '감마선을'), watch: W('s03', '감시할'), sats: W('s03', '위성을'), launched: W('s03', '띄웠습니다'),
  y1967: W('s04', '천구백육십칠년'), these: W('s04', '위성들은'), bomb: W('s04', '폭탄과는'), quite: W('s04', '전혀'), diff: W('s04', '다른'), shape: W('s04', '모양의'),
  flash4: W('s04', '섬광을'), caught: W('s04', '잡았습니다'),
  each5: W('s05', '위성마다'), arrived: W('s05', '도착한'), time5: W('s05', '시각의'), diff5: W('s05', '차이로'), dir5: W('s05', '방향을'), calc: W('s05', '계산하자'),
  flash5: W('s05', '섬광은'), earth5: W('s05', '지구도'), sun5: W('s05', '태양도'), not5: W('s05', '아닌'), space5: W('s05', '우주에서'), came: W('s05', '왔습니다'),
  gamma6: W('s06', '감마선은'), light6: W('s06', '빛의'), kind: W('s06', '종류지만'), grain: W('s06', '알갱이'), energy6: W('s06', '에너지가'), eye: W('s06', '눈에'),
  visible: W('s06', '보이는'), thanLight: W('s06', '빛보다'), x100k: W('s06', '수십만'), big6: W('s06', '큽니다'),
  gamma7: W('s07', '감마선은'), atm: W('s07', '대기를'), pierce: W('s07', '뚫지'), cant: W('s07', '못해서'), grb7: W('s07', '감마선 폭발은'), mostly: W('s07', '주로'),
  scope7: W('s07', '우주 망원경으로'), see7: W('s07', '봅니다'),
  y1990: W('s08', '천구백구십년대에'), thousands: W('s08', '수천'), bursts8: W('s08', '폭발은'), milky: W('s08', '은하수'), band: W('s08', '띠를'), notF: W('s08', '않고'),
  sky8: W('s08', '하늘'), whole8: W('s08', '전체에'), evenly: W('s08', '고르게'), scattered: W('s08', '흩어져'),
  y1997: W('s09', '천구백구십칠년'), after9: W('s09', '폭발 뒤'), faint9: W('s09', '희미한'), afterglow9: W('s09', '잔광에서'), redshift: W('s09', '적색이동을'),
  measure: W('s09', '재자'), gly: W('s09', '수십억광년'), revealed: W('s09', '밝혀졌습니다'),
  far10: W('s10', '먼 곳에서'), soBright: W('s10', '이만큼'), reason: W('s10', '까닭은'), energy10: W('s10', '에너지를'), allDir: W('s10', '사방이'), narrow: W('s10', '좁은'),
  two10: W('s10', '두 줄기'), jets10: W('s10', '제트로'), focus: W('s10', '몰아'), shoot: W('s10', '쏘기'),
  jet11: W('s11', '제트는'), light11: W('s11', '빛의'), close11: W('s11', '가깝게'), run11: W('s11', '달리고'), we: W('s11', '우리는'), stream: W('s11', '줄기가'),
  earth11: W('s11', '지구를'), headOn: W('s11', '정면으로'), only: W('s11', '폭발만'), see11: W('s11', '봅니다'),
  jet12: W('s12', '제트 속'), fast: W('s12', '빠른'), slow: W('s12', '느린'), catchUp: W('s12', '따라잡아'), hit: W('s12', '부딪치면'), accel: W('s12', '가속된'),
  electrons: W('s12', '전자가'), gamma12: W('s12', '감마선을'), emit: W('s12', '낸다고'),
  then13: W('s13', '그 뒤'), around: W('s13', '주변'), gas13: W('s13', '기체를'), ram: W('s13', '들이받아'), slowDown: W('s13', '느려지면'), xray: W('s13', '엑스선과'),
  optical: W('s13', '가시광선'), radio: W('s13', '전파의'), afterglow13: W('s13', '잔광이'), days: W('s13', '며칠에'), over13: W('s13', '걸쳐'), fade13: W('s13', '사그라듭니다'),
  two14: W('s14', '이초보다'), long: W('s14', '긴'), heavy: W('s14', '무거운'), core: W('s14', '중심이'), collapse: W('s14', '무너져'), bh: W('s14', '블랙홀이'),
  jet14: W('s14', '제트가'), starB: W('s14', '별을'), drill: W('s14', '뚫고'), out14: W('s14', '나오며'),
  two15: W('s15', '이초보다'), short: W('s15', '짧은'), ns: W('s15', '중성자별'), twoNS: W('s15', '두 개가'), each15: W('s15', '서로'), orbit: W('s15', '돌다'),
  hit15: W('s15', '부딪쳐'), merge: W('s15', '합쳐질'),
  y2017: W('s16', '이천십칠년에는'), gw: W('s16', '중력파가'), first: W('s16', '먼저'), arrive: W('s16', '도착하고'), s17sec: W('s16', '일점칠초'), after16: W('s16', '뒤'),
  same: W('s16', '같은'), dir16: W('s16', '방향에서'), gamma16: W('s16', '감마선이'), confirm: W('s16', '확인했습니다'),
  y2022: W('s17', '이천이십이년'), autumn: W('s17', '가을'), gly2: W('s17', '이십억광년'), ever: W('s17', '역대'), most17: W('s17', '가장'), bright17: W('s17', '밝은'),
  grb17: W('s17', '감마선'), earth17: W('s17', '지구'), atm17: W('s17', '대기의'), upper: W('s17', '윗부분까지'), shook: W('s17', '흔들었습니다'),
  soBright18: W('s18', '이만큼'), reach: W('s18', '닿는'), tenK: W('s18', '만년에'), once: W('s18', '한 번쯤'), est: W('s18', '추정됩니다'),
  weSee: W('s19', '우리가'), perDay: W('s19', '하루에'), once19: W('s19', '한 번꼴'), jet19: W('s19', '제트가'), missed: W('s19', '비껴간'), count19: W('s19', '치면'),
  tens: W('s19', '수십에서'), hundreds: W('s19', '수백배'), many19: W('s19', '많이'), burst19: W('s19', '터집니다'),
  cHeavy: W('s20', '무거운'), cCollapse: W('s20', '무너지거나'), cNS: W('s20', '중성자별이'), cHit: W('s20', '부딪치는'), cMoment: W('s20', '순간'),
  cNarrow: W('s20', '좁은'), cJet: W('s20', '제트에'), cLight: W('s20', '빛이'), cFew: W('s20', '몇'), cUniverse: W('s20', '우주를'), cBright: W('s20', '밝게'),
  cShine: W('s20', '비춥니다'), cThis: W('s20', '이것이'), cGRB: W('s20', '감마선 폭발입니다'),
};

/** piecewise interpolation with an ease inside each segment (flat at the nodes; no overshoot) */
const sTable = (T, x, ease = easeInOut) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const q = ease((x - T[i - 1][0]) / (T[i][0] - T[i - 1][0])); return lerp(T[i - 1][1], T[i][1], q); } return T[T.length - 1][1]; };
const firstCross = (f, t0, t1, dt = 1 / 240) => { for (let t = t0; t <= t1; t += dt) if (f(t)) return t; return t1; };

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const ORB = {cx: 540, cy: 750, R: 230, Re: 78};                  // origin: Earth and the Vela orbit (screen)
export const FRONT_V = 170;                                             // px/s: the slowed front in s05
export const CH = {x0: 196, y: 470, x1: 920};                           // jet interior channel (s12–s13)
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook: poster → zoom out to a point; light curve; energy bars
  P.zoom = [2.2, 4.7];
  P.hookQ = t => (t < P.zoom[0] ? 1 : 10 ** lerp(0, -3.9, easeInOut((t - P.zoom[0]) / (P.zoom[1] - P.zoom[0]))));
  P.curve = [3.4, at(A.this2) - 0.3];
  P.replay0 = at(A.dan) - 0.1;                                         // the burst's energy replayed at 2× in s02
  P.grbE = t => grbFrac(2 * (t - P.replay0));
  P.sunClock = [at(A.sun2) - 0.05, at(A.energy2) + 0.35];
  P.sunE = t => clamp((t - P.sunClock[0]) / (P.sunClock[1] - P.sunClock[0]));
  P.same = at(A.atOnce) - 0.1;
  P.pour = at(A.asLight) - 0.1;
  // origin: treaty card, launch, 1967 flash, slowed front in s05
  P.card = at(A.y1963) - 0.2;
  P.ban = [at(A.air) - 0.1, at(A.space3) - 0.1, at(A.banned) - 0.05];
  P.earthIn = at(A.usa) - 0.25;
  P.launch = VELA.map((s, k) => at(A.sats) - 0.35 + k * 0.16);
  P.station = P.launch.map(t0 => t0 + 0.95);
  P.bombDraw = [at(A.y1967) + 0.35, at(A.y1967) + 1.35];
  P.flash67 = at(A.these) - 0.05;                                       // the 1967 front reaches the Earth's centre (fast pass)
  const fastV = 900;
  P.hit67 = VELA.map(s => P.flash67 - ORB.R * Math.cos((s.ang - SRC_ANG) * D2R) / fastV);
  P.draw67 = [P.flash67 + 0.15, P.flash67 + 3.65];                       // 7-s model curve drawn at 2×
  P.front0 = at(A.each5) - 0.15;
  P.frontD0 = ORB.R + 60;                                               // front's distance along s from the Earth's centre at front0
  P.frontD = t => P.frontD0 - FRONT_V * (t - P.front0);
  P.hit = VELA.map(s => P.front0 + (P.frontD0 - ORB.R * Math.cos((s.ang - SRC_ANG) * D2R)) / FRONT_V);
  P.slow = (Math.max(...P.hit) - Math.min(...P.hit)) / Math.max(...VELA_DT);
  P.solve = [at(A.dir5) - 0.1, at(A.calc) + 0.6];
  P.notEarth = at(A.earth5) - 0.1; P.notSun = at(A.sun5) - 0.1; P.space = at(A.space5) - 0.1;
  // gamma: spectrum sweep, photon energy bars, atmosphere rain
  P.spec = [at(A.gamma6) - 0.1, at(A.kind) + 0.5];
  P.visBar = at(A.energy6) - 0.1;
  P.gBar = [at(A.x100k) - 0.3, at(A.big6) + 0.2];
  P.gBarLg = t => lerp(Math.log10(E_VIS), Math.log10(E_GAMMA), easeInOut((t - P.gBar[0]) / (P.gBar[1] - P.gBar[0])));
  P.rain0 = sc('gamma').start + 0.2;
  P.atmIn = at('s07') - 0.6;
  // sky: dots appear over s08; GRB 970508 and the line shift in s09
  P.dots = [at(A.y1990) + 0.1, at(A.scattered) + 0.2];
  P.nDots = t => Math.floor(N_BATSE * smooth(clamp((t - P.dots[0]) / (P.dots[1] - P.dots[0]))) ** 1);
  P.inset = at(A.milky) - 0.25;
  P.s09 = at('s09') - 0.55;
  P.shift = [at(A.redshift) - 0.2, at(A.measure) + 0.5];
  P.zNow = t => Z_970508 * easeInOut((t - P.shift[0]) / (P.shift[1] - P.shift[0]));
  P.dist = at(A.gly) - 0.1;
  // jet: cone knob, race, axis turn; shells; external shock and afterglow
  P.knob = [at(A.narrow) - 0.25, at(A.focus) + 0.2];
  P.theta = t => 10 ** lerp(Math.log10(90), Math.log10(TH_JET), easeInOut((t - P.knob[0]) / (P.knob[1] - P.knob[0])));
  P.race = at(A.jet11) - 0.1;
  P.turn = [at(A.we) - 0.2, at(A.headOn) + 0.3];
  P.phi = t => 90 * (1 - easeInOut((t - P.turn[0]) / (P.turn[1] - P.turn[0])));
  P.seenT = firstCross(t => P.phi(t) < TH_JET, P.turn[0], P.turn[1] + 1);
  P.ph2 = at('s12') - 0.55;                                             // phase 2: inside the jet
  P.shell0 = at(A.jet12) + 0.25;
  P.coll = SHOCK.col.map(c => P.shell0 + c.tc);
  P.emitT = SHELLS.e.map(e => P.shell0 + e);
  const fin = SHOCK.final[0], M0 = fin.m, v0 = fin.v;
  P.gas0 = at(A.around) - 0.2;                                          // the head meets the surrounding gas
  P.headW = t => (t < P.gas0 ? fin.x0 + fin.v * (t - P.shell0) : fin.x0 + fin.v * (P.gas0 - P.shell0) + headX(t - P.gas0, v0, M0));
  P.headV = t => headV(t - P.gas0, v0, M0);
  P.headM0 = M0; P.headV0 = v0;
  P.ag = [at(A.xray) - 0.35, at(A.over13) + 0.45];
  P.agLog = t => lerp(0, Math.log10(AG_TMAX), clamp((t - P.ag[0]) / (P.ag[1] - P.ag[0])));
  P.agPeakT = AG.map(b => P.ag[0] + Math.log10(b.tp * 1.173) / Math.log10(AG_TMAX) * (P.ag[1] - P.ag[0]));
  // engine
  P.longLit = at(A.long) - 0.15; P.starIn = at(A.heavy) - 0.25; P.coreHi = at(A.core) - 0.1;
  P.coll14 = [at(A.collapse) - 0.05, at(A.collapse) + 0.55];
  P.bhT = at(A.bh) - 0.05;
  P.drill = [at(A.jet14) - 0.05, at(A.out14) + 0.15];
  P.shortLit = at(A.short) - 0.15; P.nsIn = at(A.ns) - 0.3;
  P.tc = at(A.merge) + 0.05;
  P.insp0 = at(A.ns) - 0.15;
  P.tauReal = t => Math.max(0, P.tc - t) * INSP_REAL / (P.tc - P.insp0);   // screen → real seconds before merger
  P.s16 = at('s16') - 0.6;
  P.tm = at(A.arrive) + 0.05;                                           // GW170817 merger signal ends (screen = real time)
  P.tg = P.tm + GW_DELAY;                                               // GRB 170817A
  // boat
  P.boatCard = at(A.y2022) - 0.2; P.boatDist = at(A.gly2) - 0.1;
  P.g0 = at(A.ever) - 0.25;
  P.boatX = t => t - P.g0;
  P.pegT = firstCross(t => boatCurve(t - P.g0) >= BOAT.full, P.g0, P.g0 + 6);
  P.unpegT = firstCross(t => t > P.pegT + 0.2 && boatCurve(t - P.g0) < BOAT.full, P.pegT, P.g0 + 12);
  P.iono0 = at(A.atm17) - 0.15;
  P.ionoA = t => (t < P.iono0 ? 0 : smooth((t - P.iono0) / 0.35) * Math.exp(-Math.max(0, t - P.iono0 - 0.35) / 2.6));
  P.s18 = at('s18') - 0.6;
  P.hours = t => clamp((t - P.iono0) / (P.s18 - 0.3 - P.iono0)) * BOAT.hours;
  P.ruler = [at(A.soBright18) + 0.3, at(A.once) + 0.15];
  P.rulerY = t => BOAT.perYears * easeInOut((t - P.ruler[0]) / (P.ruler[1] - P.ruler[0]));
  P.obsZoom = at(A.est) - 0.15;
  // myth
  P.myth = [at(A.weSee) - 0.1, at(A.burst19) + 0.5];
  P.mythDay = t => MYTH.days * clamp((t - P.myth[0]) / (P.myth[1] - P.myth[0]));
  P.mythT = MYTH_SET.map(b => P.myth[0] + b.day / MYTH.days * (P.myth[1] - P.myth[0]));
  P.reveal = at(A.missed) - 0.1;
  P.strike = at(A.tens) - 0.15;
  // close
  P.cl = [at(A.cHeavy) - 0.15, at(A.cNS) - 0.15, at(A.cNarrow) - 0.15, at(A.cFew) - 0.15];
  P.cMerge = at(A.cHit) + 0.25;
  P.cTitle = at(A.cThis) - 0.15;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Render infrastructure: noise texture, additive float buffer (glow), background star field
// =====================================================================================================
const TEXN = 256;
const TEX = (() => {
  const n = TEXN, out = new Float32Array(n * n), R = rng(20261105);
  let amp = 1;
  for (let cells = 8; cells <= 128; cells *= 2, amp *= 0.55) {
    const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n * cells, v = y / n * cells, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
      out[y * n + x] += amp * lerp(lerp(g[j0 * cells + i0], g[j0 * cells + i1], su), lerp(g[j1 * cells + i0], g[j1 * cells + i1], su), sv);
    }
  }
  let lo = Infinity, hi = -Infinity; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
})();
function tex(u, v) {
  u -= Math.floor(u / TEXN) * TEXN; v -= Math.floor(v / TEXN) * TEXN;
  const i0 = u | 0, j0 = v | 0, fu = u - i0, fv = v - j0, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  return (TEX[j0 * TEXN + i0] * (1 - fu) + TEX[j0 * TEXN + i1] * fu) * (1 - fv) + (TEX[j1 * TEXN + i0] * (1 - fu) + TEX[j1 * TEXN + i1] * fu) * fv;
}

class Glow {
  constructor(W = 1080, H = 1920, s = 0.5) {
    Object.assign(this, {s, w: Math.ceil(W * s), h: Math.ceil(H * s)});
    const n = this.w * this.h; this.R = new Float32Array(n); this.G = new Float32Array(n); this.B = new Float32Array(n);
    this.cv = createCanvas(this.w, this.h); this.cc = this.cv.getContext('2d'); this.img = this.cc.createImageData(this.w, this.h);
    this.sm = createCanvas(Math.ceil(this.w / 4), Math.ceil(this.h / 4)); this.smc = this.sm.getContext('2d');
    this.d = [this.w, this.h, 0, 0]; this.prev = [0, 0, 0, 0];
  }
  begin() {
    const [x0, y0, x1, y1] = this.prev;
    for (let y = y0; y < y1; y++) { const o = y * this.w; this.R.fill(0, o + x0, o + x1); this.G.fill(0, o + x0, o + x1); this.B.fill(0, o + x0, o + x1); }
    if (x1 > x0 && y1 > y0) this.cc.clearRect(Math.max(0, x0 - 2), Math.max(0, y0 - 2), x1 - x0 + 4, y1 - y0 + 4);
    this.d = [this.w, this.h, 0, 0]; this.prev = [0, 0, 0, 0]; return this;
  }
  region(X0, Y0, X1, Y1) {
    const s = this.s, a = Math.max(0, Math.floor(X0 * s)), b = Math.max(0, Math.floor(Y0 * s)), c = Math.min(this.w, Math.ceil(X1 * s)), d = Math.min(this.h, Math.ceil(Y1 * s));
    if (c <= a || d <= b) return null;
    const D = this.d; D[0] = Math.min(D[0], a); D[1] = Math.min(D[1], b); D[2] = Math.max(D[2], c); D[3] = Math.max(D[3], d);
    return [a, b, c, d];
  }
  /** fn(screenX, screenY, index) for every buffer pixel inside the screen box */
  each(X0, Y0, X1, Y1, fn) {
    const r = this.region(X0, Y0, X1, Y1); if (!r) return; const inv = 1 / this.s, w = this.w;
    for (let by = r[1]; by < r[3]; by++) { const sy = (by + 0.5) * inv, o = by * w; for (let bx = r[0]; bx < r[2]; bx++) fn((bx + 0.5) * inv, sy, o + bx); }
  }
  /** gaussian splat (screen px radius = 2σ) */
  splat(x, y, rad, col, I) {
    if (I <= 0) return;
    rad = Math.max(rad, 1.2);
    const s2 = 2 * (rad / 2) ** 2, {R, G, B} = this;
    this.each(x - rad * 1.6, y - rad * 1.6, x + rad * 1.6, y + rad * 1.6, (sx, sy, i) => { const k = I * Math.exp(-((sx - x) ** 2 + (sy - y) ** 2) / s2); R[i] += k * col[0]; G[i] += k * col[1]; B[i] += k * col[2]; });
  }
  flush(stage, {gain = 1.3, bloom = 0.55, alpha = 1, cross = 0.1} = {}) {
    const [x0, y0, x1, y1] = this.d; this.prev = [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
    if (x1 <= x0 || y1 <= y0 || alpha <= 0) return;
    const {w, R, G, B, img} = this, dd = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, j = i * 4, l = (R[i] + G[i] + B[i]) * cross;
      dd[j] = 255 * (1 - Math.exp(-(R[i] + l) * gain)); dd[j + 1] = 255 * (1 - Math.exp(-(G[i] + l) * gain)); dd[j + 2] = 255 * (1 - Math.exp(-(B[i] + l) * gain)); dd[j + 3] = 255;
    }
    this.cc.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    const c = stage.ctx, inv = 1 / this.s;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha; c.imageSmoothingEnabled = true;
    c.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * inv, y0 * inv, (x1 - x0) * inv, (y1 - y0) * inv);
    if (bloom > 0) {
      const sm = this.sm, sc = this.smc, q = 0.25;
      sc.globalCompositeOperation = 'copy'; sc.filter = 'none';
      sc.clearRect(0, 0, sm.width, sm.height);
      sc.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
      sc.filter = 'blur(5px)'; sc.drawImage(sm, 0, 0); sc.filter = 'none';
      c.globalAlpha = alpha * bloom; c.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, sm.width / q * inv, sm.height / q * inv);
    }
    c.restore();
  }
}
let GB = null;
const glowBuf = () => (GB ||= new Glow()).begin();

// background star field and faint galaxies (fixed on screen)
const FIELD = (() => { const R = rng(77), s = []; for (let i = 0; i < 320; i++) s.push({x: R() * 1080, y: R() * 1920, r: 0.5 + 1.5 * R() ** 3, a: 0.12 + 0.5 * R() ** 2, c: R()}); return s; })();
const GALS = [{x: 170, y: 300, s: 34, r: 0.5, rot: 0.6, k: 0.9}, {x: 905, y: 470, s: 26, r: 0.38, rot: -0.4, k: 0.75}, {x: 860, y: 1010, s: 40, r: 0.32, rot: 0.25, k: 0.8},
  {x: 215, y: 1240, s: 30, r: 0.55, rot: -0.9, k: 0.7}, {x: 300, y: 610, s: 18, r: 0.6, rot: 1.1, k: 0.55}, {x: 760, y: 1640, s: 36, r: 0.45, rot: 0.9, k: 0.7},
  {x: 140, y: 1780, s: 22, r: 0.5, rot: -0.2, k: 0.55}, {x: 950, y: 1860, s: 28, r: 0.4, rot: 0.4, k: 0.5}, {x: 700, y: 180, s: 20, r: 0.5, rot: -1.0, k: 0.5}];
function faintGalaxies(c, a) {
  if (a <= 0.01) return;
  for (const g of GALS) withAlpha(c, a * g.k, () => {
    c.save(); c.translate(g.x, g.y); c.rotate(g.rot); c.scale(1, g.r);
    const gr = c.createRadialGradient(0, 0, 0.5, 0, 0, g.s); gr.addColorStop(0, 'rgba(255,236,214,0.55)'); gr.addColorStop(0.18, 'rgba(226,214,236,0.22)'); gr.addColorStop(1, 'rgba(160,170,230,0)');
    circle(c, 0, 0, g.s, gr); c.restore();
  });
}
function fieldAlpha(t, ctx) {
  const id = ctx.scene.id;
  if (id === 'hook' || id === 'close') return 1;
  if (id === 'myth') return 0.7;
  if (['origin', 'boat', 'jet'].includes(id)) return 0.45;
  return 0.35;
}
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#00121C'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const k = fieldAlpha(t, ctx);
  if (k > 0.01) { for (const s of FIELD) { c.globalAlpha = s.a * k; circle(c, s.x, s.y, s.r, s.c > 0.8 ? '#FFE9C8' : s.c > 0.6 ? '#CFE0FF' : '#EAF0F6'); } c.globalAlpha = 1; }
  if (ctx.scene.id === 'hook' || ctx.scene.id === 'close') faintGalaxies(c, 1);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
const PAL = {light: '#FFD36E', gamma: '#A9C8FF', jet: '#CFE0FF', hot: '#E6F0FF', warm: '#FFB36A', red: '#FF7A5C', blue: '#8FB8FF',
  limit: '#FF5A2A', good: '#9FD9C8', muted: '#8AA0A6', sun: '#FFD58A', vis: '#FFE08A', star: '#FF9A55', ns: '#BFD6FF', gw: '#B9A6FF'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
/** Korean number with ~2 significant digits: 4e12 → "4조", 3e8 → "3억", 33000 → "3만 3천" */
export function ko(n) {
  if (!(n > 0)) return '0';
  const p = 10 ** (Math.floor(Math.log10(n)) - 1), v = Math.round(n / p) * p;
  if (v >= 1e12) { const e = v / 1e12; return (e >= 10 ? Math.round(e).toLocaleString('en-US') : +e.toFixed(1)) + '조'; }
  if (v >= 1e8) { const e = v / 1e8; return (e >= 10 ? Math.round(e).toLocaleString('en-US') : +e.toFixed(1)) + '억'; }
  if (v >= 1e4) { const m = v / 1e4; if (m >= 10) return Math.round(m).toLocaleString('en-US') + '만'; const a = Math.floor(m), b = Math.round((m - a) * 10); return b ? `${a}만 ${b}천` : `${a}만`; }
  return v >= 10 ? Math.round(v).toLocaleString('en-US') : String(+v.toFixed(v < 1 ? 2 : 1));
}
const fmtInt = n => Math.round(n).toLocaleString('en-US');
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 500, size: 30, color: PAL.light, align: 'center'}));
}
function strike(c, x0, x1, y, q, col = PAL.limit, w = 4) { if (q > 0) line(c, [[x0 - 4, y], [lerp(x0 - 4, x1 + 4, easeOut(q)), y]], rgba(col, 0.95), w); }
function sphere3(c, x, y, r, col) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.28, col); g.addColorStop(1, mix(col, '#000000', 0.55));
  circle(c, x, y, r, g);
}
/** a short wave packet travelling along (dx, dy) with its head at (x, y); o.lam = wavelength in px */
function photon(c, x, y, dx, dy, a = 1, o = {}) {
  if (a <= 0) return;
  const L = o.len ?? 44, lam = o.lam ?? 17.6, Am = o.amp ?? 6, n = Math.max(30, Math.ceil(L / Math.max(2, lam) * 8)), px = -dy, py = dx, pts = [];
  for (let k = 0; k <= n; k++) { const u = k / n, s = -L * (1 - u), wv = Math.sin(s / lam * TAU) * Am * Math.sin(Math.PI * u) ** 0.5; pts.push([x + dx * s + px * wv, y + dy * s + py * wv]); }
  withAlpha(c, a, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    line(c, pts, rgba(o.col || PAL.light, 0.95), o.w ?? 3);
    if (o.glow !== false) glow(c, x, y, 16, o.col || PAL.light, 0.4);
    c.restore();
  });
}
/** visible wavelength (nm) → hex colour (approximation; dim toward the ends of the eye's range) */
export function specHex(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else r = 1;
  const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
  const h = v => Math.round(255 * clamp(v * clamp(f, 0.15, 1)) ** 0.8).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
/** axes frame with ticks: B = {x0, x1, y0 (bottom), y1 (top)} */
function axes(stage, B, o = {}) {
  const c = stage.ctx, T = stage.theme;
  line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
  for (const [x, s] of o.xt || []) { line(c, [[x, B.y0], [x, B.y0 + 8]], T.muted, 2); if (s) stage.text(s, x, B.y0 + 28, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
}

// =====================================================================================================
// Renderers
// =====================================================================================================
/** limb-darkened, granulated star envelope into the glow buffer (red-orange); hot = cocoon patch strength at the top pole */
const ENV_C = [1.0, 0.42, 0.14], ENV_L = [0.75, 0.16, 0.05];
function starGlow(gb, t, cx, cy, R, {I = 1, halo = 1, seed = 0, pole = 0, poleY = 0.9, tint = 0} = {}) {
  const ext = R * (1 + 0.9 * halo + 0.15), {R: BR, G: BG, B: BB} = gb, invR = 1 / R, ph = seed * 91, dmax = ext * invR;
  const aa = 1.6 * invR, e2 = (1 + aa) * (1 + aa), col = [lerp(ENV_C[0], 1, tint), lerp(ENV_C[1], 0.8, tint), lerp(ENV_C[2], 0.55, tint)];
  gb.each(cx - ext, cy - ext, cx + ext, cy + ext, (x, y, i) => {
    const dx = (x - cx) * invR, dy = (y - cy) * invR, d2 = dx * dx + dy * dy;
    let r = 0, g = 0, b = 0, cov = 0;
    if (d2 < e2) {
      const d = Math.sqrt(d2); cov = clamp((1 + aa - d) / (2 * aa));
      const mu = Math.sqrt(Math.max(0, 1 - Math.min(1, d2))), lon = Math.atan2(dx, Math.max(mu, 0.02)) + 0.05 * t, lat = Math.asin(clamp(dy, -1, 1));
      const u = lon / TAU * 2048 + ph, v = (lat / Math.PI + 0.5) * 1024;
      const gr = 0.5 * tex(u + t * 3.2, v + t * 2.3) + 0.3 * tex(u * 2.1 - t * 4.1 + 40, v * 2.1 + t * 2.7) + 0.2 * tex(u * 0.35 + 17, v * 0.35 - t * 0.6);
      const k = I * 1.0 * (0.28 + 0.72 * mu) * (1 + 0.9 * (gr - 0.5) * (0.3 + 0.7 * mu)) * cov, m = mu ** 0.6;
      r = k * lerp(ENV_L[0], col[0], m); g = k * lerp(ENV_L[1], col[1], m); b = k * lerp(ENV_L[2], col[2], m);
      if (pole > 0) {                                                   // hot cocoon where the jet breaks out (front-top)
        const pd = Math.hypot(dx, dy + poleY), h = pole * Math.exp(-((pd / 0.3) ** 2)) * cov;
        r += h * 1.1; g += h * 0.85; b += h * 0.6;
      }
    }
    if (cov < 1) {
      const d = Math.sqrt(d2), e = Math.max(0, d - 1), h = (1 - cov) * I * halo * (0.3 * Math.exp(-e / 0.05) + 0.12 * Math.exp(-e / 0.3) + 0.03 / Math.max(1, d2)) * smooth((dmax - d) / (0.45 * (dmax - 1)));
      r += h * col[0]; g += h * col[1]; b += h * col[2];
    }
    BR[i] += r; BG[i] += g; BB[i] += b;
  });
}
/** two opposite jets from (cx, cy) along the screen-vertical axis. Upper jet comes toward the viewer: brighter, wider, its base
 *  visible on the star's face from y = cy − Rs·cos i; the lower (receding) jet appears only outside the star's disc.
 *  o: {len, Rs, w0, tanUp, tanDown, I, up, down, flow, cosI} */
function jetGlow(gb, t, cx, cy, o) {
  const {R, G, B} = gb, len = o.len, Rs = o.Rs || 0, w0 = o.w0 ?? 3, I = o.I ?? 1, flow = o.flow ?? 520, lam = o.lam ?? 170, sinI = o.sinI ?? 0.9;
  for (const sg of [1, -1]) {
    const tanB = sg > 0 ? (o.tanUp ?? 0.05) : (o.tanDown ?? 0.036), boost = sg > 0 ? (o.up ?? 1) : (o.down ?? 0.5);
    const sMin = sg > 0 ? Rs * sinI * 0.98 : 0, wEnd = w0 + len * tanB, ext = Math.min(wEnd * 3.2 + 6, 420);
    const yEnd = cy - sg * len, Y0 = Math.max(-4, Math.min(cy - sg * sMin, yEnd)), Y1 = Math.min(1924, Math.max(cy - sg * sMin, yEnd));
    gb.each(cx - ext, Y0, cx + ext, Y1, (x, y, i) => {
      const s = sg * (cy - y); if (s < sMin) return;
      const d = x - cx, w = w0 + (s - sMin) * tanB, u = d / w, u2 = u * u;
      if (u2 > 10) return;
      let vis = 1;
      if (Rs > 0) {
        const r = Math.hypot(d, y - cy);
        if (sg < 0) { if (r < Rs) return; vis = smooth((r - Rs) / (Rs * 0.06 + 1.5)); }
        else vis = smooth((s - sMin) / (Rs * 0.08 + 1.5));
      }
      const core = Math.exp(-u2 * 7), sheath = Math.exp(-u2 * 1.1);
      const ph = (s - flow * t) / lam, kn = 0.8 + 0.2 * Math.sin(ph * TAU) + 0.3 * (tex(s * 0.035 - t * flow * 0.035, u * 1.6 + sg * 40) - 0.5);
      const fall = (1 + (s - sMin) / (o.s0 ?? 90)) ** -0.32 * smooth((len - s) / (len * 0.3));
      const e = I * boost * fall * kn * vis;
      R[i] += e * (0.62 * core + 0.16 * sheath); G[i] += e * (0.76 * core + 0.27 * sheath); B[i] += e * (0.92 * core + 0.62 * sheath);
    });
  }
}
/** the burst at screen scale q (1 = poster: star radius 150 px). Star + jets; tiny → one point of the same light. */
export const POSTER = {cx: 540, cy: 700, Rs: 150};
function burst(stage, t, {cx, cy, q = 1, a = 1, I = 1, point = 1, bloom = 0.6}) {
  const Rs = POSTER.Rs * q, gb = glowBuf();
  if (Rs > 1.6) {
    const big = smooth((Rs - 1.6) / 6);
    starGlow(gb, t, cx, cy, Rs, {I: 1.05 * big, halo: 0.9, pole: 1.25 * big, poleY: 0.9});
  }
  const len = 70 * Rs, w0 = Math.max(1.4, 0.03 * Rs);
  if (len > 6) jetGlow(gb, t, cx, cy, {len: Math.min(len, 2600), Rs: Rs > 4 ? Rs : 0, w0, I: 2.2 * I * smooth((len - 6) / 40), flow: 520 * Math.min(1, q * 3), lam: 170 * Math.max(q, 0.05)});
  const pq = 1 - smooth((Rs - 1) / 12);
  if (pq > 0 && point > 0) { gb.splat(cx, cy, 7, [0.95, 0.97, 1], 2.4 * pq * point); gb.splat(cx, cy, 38, [0.7, 0.8, 1], 0.32 * pq * point); }
  gb.flush(stage, {gain: 1.3, bloom, alpha: a, cross: 0.05});
}

// ---- Earth: generated colours over a coarse hand-drawn coastline (lon, lat); not a satellite image ----
const LAND_RINGS = [
  [[-168, 66], [-162, 70], [-156, 71], [-140, 70], [-128, 70], [-115, 68], [-95, 72], [-82, 70], [-80, 63], [-94, 59], [-90, 56], [-82, 52], [-79, 55], [-77, 60], [-70, 59], [-64, 60], [-56, 53], [-60, 47], [-66, 45], [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 26], [-82, 26], [-84, 30], [-90, 29], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-84, 11], [-80, 8], [-77, 8.5], [-83, 8], [-86, 12], [-91, 14], [-95, 16], [-105, 20], [-110, 23], [-112, 27], [-115, 30], [-117, 32], [-120, 34], [-124, 40], [-124, 46], [-124, 49], [-130, 54], [-134, 58], [-140, 60], [-147, 61], [-152, 58], [-158, 57], [-164, 55], [-158, 58], [-162, 60], [-165, 62], [-168, 66]],
  [[-77, 8], [-72, 12], [-63, 10], [-60, 8], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -14], [-40, -21], [-45, -23], [-48, -26], [-53, -34], [-58, -35], [-57, -38], [-62, -39], [-65, -42], [-66, -47], [-68, -50], [-69, -54], [-72, -53], [-74, -48], [-74, -42], [-73, -37], [-71, -30], [-70, -20], [-75, -15], [-77, -12], [-81, -6], [-80, -2], [-80, 1], [-78, 4], [-77, 8]],
  [[-17, 21], [-16, 27], [-10, 30], [-6, 36], [0, 36], [10, 37], [11, 34], [20, 32], [30, 31], [33, 30], [35, 28], [39, 20], [43, 12], [51, 12], [48, 5], [42, -1], [39, -6], [40, -11], [40, -16], [35, -24], [33, -29], [28, -33], [20, -35], [18, -32], [15, -26], [12, -18], [13, -12], [12, -6], [9, -1], [9, 4], [5, 6], [-2, 5], [-8, 4], [-13, 8], [-17, 13], [-17, 21]],
  [[-10, 36], [-9, 43], [-2, 44], [-1, 46], [-5, 48], [2, 51], [8, 54], [9, 57], [12, 56], [20, 55], [24, 58], [22, 60], [24, 65], [20, 69], [28, 71], [40, 67], [44, 68], [55, 69], [68, 69], [70, 73], [80, 73], [90, 76], [105, 78], [113, 74], [130, 71], [140, 72], [160, 70], [170, 70], [180, 68], [180, 65], [175, 62], [163, 60], [160, 54], [156, 51], [156, 57], [162, 61], [150, 59], [140, 54], [137, 48], [132, 43], [129, 41], [129, 35], [126, 35], [126, 38], [122, 40], [121, 37], [119, 35], [121, 31], [122, 28], [119, 25], [114, 22], [109, 21], [107, 17], [109, 12], [105, 9], [103, 11], [100, 13], [101, 7], [103, 2], [100, 4], [98, 8], [98, 14], [94, 17], [92, 22], [87, 21], [80, 15], [80, 10], [77, 8], [73, 17], [72, 21], [67, 25], [57, 25], [56, 27], [52, 28], [48, 30], [51, 25], [56, 26], [59, 22], [56, 17], [52, 16], [45, 13], [43, 13], [39, 21], [35, 28], [34, 31], [36, 36], [30, 37], [27, 37], [26, 40], [24, 40], [23, 37], [21, 39], [19, 42], [13, 45], [16, 41], [18, 40], [15, 38], [12, 41], [10, 44], [7, 44], [3, 43], [0, 39], [-1, 37], [-5, 36], [-10, 36]],
  [[114, -22], [114, -26], [115, -34], [118, -35], [123, -34], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [144, -38], [147, -39], [150, -37], [153, -31], [153, -25], [150, -22], [146, -19], [145, -15], [142, -11], [141, -17], [136, -15], [137, -12], [132, -11], [129, -15], [125, -14], [122, -17], [118, -20], [114, -22]],
  [[-73, 78], [-60, 82], [-40, 83], [-25, 82], [-20, 75], [-22, 70], [-32, 68], [-40, 65], [-43, 60], [-48, 61], [-52, 65], [-54, 69], [-58, 75], [-68, 77], [-73, 78]],
  [[-180, -78], [-150, -77], [-120, -73], [-90, -72], [-60, -64], [-58, -63], [-60, -70], [-40, -78], [0, -70], [30, -69], [60, -67], [90, -66], [120, -66], [150, -68], [170, -72], [180, -78]],
  [[-5, 50], [1, 51], [2, 53], [-1, 55], [-2, 57], [-4, 59], [-6, 58], [-5, 55], [-3, 54], [-5, 52], [-5, 50]],
  [[130, 31], [131, 34], [135, 34], [140, 35], [141, 38], [142, 42], [141, 45], [144, 44], [145, 43], [141, 41], [140, 38], [139, 35], [136, 33], [132, 33], [130, 31]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -16], [44, -25]],
  [[109, 1], [110, -3], [116, -4], [118, 1], [117, 7], [115, 5], [109, 1]],
  [[95, 5], [98, 3], [104, -2], [106, -6], [102, -4], [95, 5]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [137, -5], [131, -1]],
  [[172, -34], [175, -37], [178, -38], [175, -41], [171, -44], [167, -46], [170, -43], [172, -40], [173, -36], [172, -34]],
];
let ETEX = null;
const earthTex = () => (ETEX ||= earthTextures(LAND_RINGS, {W: 1024, H: 512, CW: 512, CH: 256}));
/** lit Earth (ortho camera). o: {spin (deg), sun (world vector toward the Sun; x right, z up, −y toward the viewer), axis, a} */
function earth(stage, cx, cy, R, o = {}) {
  const cam = lookCam({pos: [0, -50, 0], dir: [0, 1, 0], up: [0, 0, 1], ortho: R, cx, cy});
  drawEarthLit(stage, cam, earthTex(), {axis: o.axis || [0.12, -0.3, 0.95], spin: o.spin ?? 60, sun: o.sun || [-0.75, -0.55, 0.35], cloudDrift: o.cloud ?? 0, alpha: o.a ?? 1, night: 0.08});
}
/** Vela-like satellite (faceted body, solar cells, antenna rods); lit = detector glow */
function satellite(c, x, y, s = 1, rot = 0, lit = 0, a = 1) {
  if (a <= 0) return;
  withAlpha(c, a, () => {
    if (lit > 0.01) glow(c, x, y, 46 * s, PAL.gamma, 0.75 * lit);
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    for (const ang of [0.35, 1.92, 3.5, 5.07]) line(c, [[Math.cos(ang) * 12, Math.sin(ang) * 12], [Math.cos(ang) * 25, Math.sin(ang) * 25]], rgba('#C8D6DE', 0.9), 1.6);
    const pts = []; for (let k = 0; k < 8; k++) pts.push([Math.cos(k * TAU / 8 + TAU / 16) * 13, Math.sin(k * TAU / 8 + TAU / 16) * 13]);
    poly(c, pts, '#24404E', '#A8BECA', 1.6);
    for (let k = 0; k < 8; k += 2) line(c, [[0, 0], pts[k]], rgba('#6E8C9C', 0.9), 1);
    circle(c, 0, 0, 4.2, lit > 0.01 ? mix('#5B7A8C', '#FFFFFF', clamp(lit)) : '#5B7A8C');
    c.restore();
  });
}
/** protractor dial for a cone half-angle θ (deg): wedge ±θ around the vertical */
function coneDial(stage, cx, cy, r, th, o = {}) {
  const c = stage.ctx, T = stage.theme;
  ring(c, cx, cy, r, rgba(T.muted, 0.5), 3, Math.PI, TAU);
  for (const d of [0, 30, 60, 90, 120, 150, 180]) { const q = Math.PI + d * D2R; line(c, [[cx + Math.cos(q) * (r - 8), cy + Math.sin(q) * (r - 8)], [cx + Math.cos(q) * (r + 4), cy + Math.sin(q) * (r + 4)]], rgba(T.muted, 0.9), 2); }
  const a0 = -Math.PI / 2 - th * D2R, a1 = -Math.PI / 2 + th * D2R;
  c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r - 10, a0, a1); c.closePath(); c.fillStyle = rgba(PAL.gamma, 0.35); c.fill();
  line(c, [[cx, cy], [cx + Math.cos(a0) * (r - 6), cy + Math.sin(a0) * (r - 6)]], PAL.hot, 3);
  line(c, [[cx, cy], [cx + Math.cos(a1) * (r - 6), cy + Math.sin(a1) * (r - 6)]], PAL.hot, 3);
  line(c, [[cx, cy], [cx, cy - r]], rgba(T.ink, 0.35), 1.5, {dash: [4, 5]});
  circle(c, cx, cy, 6, PAL.hot);
}
/** semicircular log gauge 0.1 … full·1 (value relative to a typical bright burst); pegged above full scale */
function countGauge(stage, t, cx, cy, r, v, o = {}) {
  const c = stage.ctx, T = stage.theme, lo = -1, hi = Math.log10(BOAT.full), q = lg => Math.PI + clamp((lg - lo) / (hi - lo)) * Math.PI;
  ring(c, cx, cy, r, rgba(T.muted, 0.45), 14, Math.PI, q(0));
  ring(c, cx, cy, r, rgba(PAL.warm, 0.6), 14, q(0), q(hi - 0.15));
  ring(c, cx, cy, r, rgba(PAL.limit, 0.85), 14, q(hi - 0.15), TAU);
  for (const [lg, s] of [[-1, '0.1'], [0, '1'], [1, '10']]) { const a = q(lg); line(c, [[cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10)], [cx + Math.cos(a) * (r + 24), cy + Math.sin(a) * (r + 24)]], T.muted, 2.5); stage.text(s, cx + Math.cos(a) * (r + 48), cy + Math.sin(a) * (r + 44), {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  const pegged = v >= BOAT.full, lg = Math.log10(Math.max(v, 0.1)), jit = pegged ? 0.025 * Math.sin(t * 47) + 0.015 * Math.sin(t * 83) : 0, a = Math.min(q(lg), TAU + 0.02) + jit;
  if (pegged) glow(c, cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, 90, PAL.limit, 0.35);
  line(c, [[cx, cy], [cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9]], pegged ? PAL.limit : PAL.light, 7);
  circle(c, cx, cy, 13, pegged ? PAL.limit : PAL.light); circle(c, cx, cy, 6, T.plate);
  return pegged;
}

// =====================================================================================================
// Header titles (sequential swaps)
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '감마선 폭발'],
  origin: ['기원 · 1963년', '핵실험을 감시하는 위성'],
  gamma: ['본질 · 감마선', '에너지가 가장 큰 빛'],
  sky: ['관측 · 1990년대', '하늘 전체에 고르게'],
  jet: ['메커니즘 · 제트', '빛을 좁게 모으면'],
  engine: ['엔진 · 지속 시간', '긴 폭발과 짧은 폭발'],
  boat: ['사례 · GRB 221009A', '역대 가장 밝은 폭발'],
  myth: ['오해 바로잡기', '감마선 폭발은 드물까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r), P = plan(tl);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s04') - 0.55, '기원 · 1967년 7월 2일', '폭탄과 다른 섬광'], [at('s05') - 0.55, '기원 · 방향 찾기', '도착 시각의 차이']];
  if (id === 'gamma') return [[-Infinity, ...titles.gamma], [at('s07') - 0.6, '본질 · 대기', '땅까지 오지 못하는 빛']];
  if (id === 'sky') return [[-Infinity, ...titles.sky], [P.s09, '관측 · 1997년', '잔광의 적색이동']];
  if (id === 'jet') return [[-Infinity, ...titles.jet], [at('s11') - 0.55, '메커니즘 · 방향', '정면으로 향한 것만 보인다'], [P.ph2, '메커니즘 · 제트 속', '따라잡아 부딪치는 덩어리'], [at('s13') - 0.55, '메커니즘 · 잔광', '주변 기체에 부딪쳐 느려짐']];
  if (id === 'engine') return [[-Infinity, '엔진 · 긴 폭발', '무거운 별이 무너질 때'], [at('s15') - 0.55, '엔진 · 짧은 폭발', '중성자별이 부딪칠 때'], [P.s16, '확인 · GW170817', '중력파 뒤 1.7초']];
  if (id === 'boat') return [[-Infinity, ...titles.boat], [P.s18, '사례 · 얼마나 드문가', '약 1만 년에 한 번']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
const MORPH = [0.9, 1.7];                                               // first-frame title → header
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id;
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', '감마선 폭발', fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, '우주에서 가장 밝은 섬광', ho);
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
const TITLE_Y = [1088, 1214];
let TITLE_SIZE = 0;
/** t = 0 poster title (two lines in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  TITLE_SIZE ||= Math.min(168, 168 * 800 / stage.measure('감마선 폭발', {role: 'display', weight: 700, size: 168}));
  const y1 = lerp(TITLE_Y[0], 228, q), s1 = lerp(TITLE_SIZE, 54, q), y2 = lerp(TITLE_Y[1], 290, q), s2 = lerp(64, 30, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g = c.createLinearGradient(0, 960, 0, 1320); g.addColorStop(0, 'rgba(0,8,13,0)'); g.addColorStop(0.32, 'rgba(0,8,13,0.62)'); g.addColorStop(0.8, 'rgba(0,8,13,0.62)'); g.addColorStop(1, 'rgba(0,8,13,0)');
    c.fillStyle = g; c.fillRect(0, 960, 1080, 360);
  });
  withAlpha(c, a, () => {
    stage.text('감마선 폭발', 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 22});
    stage.text('우주에서 가장 밝은 섬광', 540, y2, {role: 'display', weight: 500, size: s2, color: PAL.light, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 14});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/gamma-ray-burst/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [3, 9.5, 33.7, 81.2, 89.1, 105.3, 123.9, 141.7, 158.4]) h += (t < 20 ? grbCurve(t) + P.grbE(t) : t < 50 ? P.frontD(t) / 100 : t < 95 ? P.theta(t) / 10 + P.phi(t) / 10 : t < 120 ? P.headW(t) / 100 + P.agLog(t) : t < 130 ? P.tauReal(t) : t < 150 ? boatCurve(P.boatX(t)) / 10 : P.mythDay(t));
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${P.hit.map(x => x.toFixed(3)).join(',')}/${P.coll.map(x => x.toFixed(3)).join(',')}/${P.tm.toFixed(3)}/${P.pegT.toFixed(3)}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  gamma(stage, t, p, ctx) { gammaScene(stage, t, ctx); },
  sky(stage, t, p, ctx) { skyScene(stage, t, ctx); },
  jet(stage, t, p, ctx) { jetScene(stage, t, ctx); },
  engine(stage, t, p, ctx) { engineScene(stage, t, ctx); },
  boat(stage, t, p, ctx) { boatScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: the poster → zoom out to a flashing point; light curve; energy
export const HOOK_PT = {x: 540, y: 560};
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), ef = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const q = P.hookQ(t), zq = easeInOut((t - P.zoom[0]) / (P.zoom[1] - P.zoom[0])), cx = POSTER.cx, cy = lerp(POSTER.cy, HOOK_PT.y, zq);
  // the point's brightness follows the model light curve (s01) and its 2× replay (s02)
  const tau = t < P.replay0 ? t : 2 * (t - P.replay0), G = grbCurve(tau), far = smooth((zq - 0.6) / 0.4);
  burst(stage, t, {cx, cy, q, a: ef, I: lerp(1, 0.35 + 0.9 * G, far), point: lerp(1, 0.25 + 1.6 * G, far)});
  // s02 ending: the light pours out (a light front leaving the point)
  if (t > P.pour) {
    const age = t - P.pour, rr = 60 + 420 * age;
    withAlpha(c, ef * Math.exp(-age / 1.1), () => { ring(c, cx, cy, rr, rgba(PAL.hot, 0.6), 4); ring(c, cx, cy, rr * 0.86, rgba(PAL.gamma, 0.3), 10); });
  }
  if (zq > 0.8) tag(stage, '먼 우주의 한 점', cx, cy + 92, {size: 26, color: T.ink, a: fadeIn(t, P.zoom[1] - 0.2, 0.4) * fadeOut(t, P.curve[1], 0.3) * ef, plate: false, shadow: 'rgba(0,0,0,0.9)'});
  const aC = fadeIn(t, P.curve[0], 0.4) * fadeOut(t, P.curve[1], 0.3) * ef, aE = fadeIn(t, P.curve[1] + 0.3, 0.4) * ef;
  if (aC > 0) withAlpha(c, aC, () => hookCurve(stage, t));
  if (aE > 0) withAlpha(c, aE, () => energyBars(stage, t, ctx));
}
function hookCurve(stage, t) {
  const c = stage.ctx, T = stage.theme, B = {x0: 210, x1: 900, y0: 1220, y1: 960}, X = s => lerp(B.x0, B.x1, s / 7), Y = v => lerp(B.y0, B.y1, v / 1.15);
  panel(c, T, 140, 880, 800, 410, 0.84);
  stage.text('감마선 세기 (모형)', 160, 914, {size: 24, weight: 700, color: PAL.gamma});
  axes(stage, B, {xt: [0, 1, 2, 3, 4, 5, 6, 7].map(s => [X(s), `${s}`])});
  stage.text('초', B.x1, B.y0 + 58, {size: 24, weight: 500, color: T.muted, align: 'right'});
  const pts = []; for (let s = 0; s <= Math.min(t, 7) + 1e-6; s += 0.02) pts.push([X(s), Y(grbCurve(s))]);
  if (pts.length > 1) { poly(c, [[X(0), B.y0], ...pts, [pts[pts.length - 1][0], B.y0]], rgba(PAL.gamma, 0.16)); line(c, pts, PAL.hot, 3.5); }
  if (t <= 7) { const x = X(t), y = Y(grbCurve(t)); glow(c, x, y, 26, PAL.gamma, 0.6); circle(c, x, y, 6, '#FFFFFF'); }
}
function energyBars(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), y0 = 1180, H = 250, bw = 150, xs = [340, 740];
  panel(c, T, 140, 840, 800, 470, 0.86);
  const eG = t > P.replay0 ? P.grbE(t) * E_GRB / E_SUN10 : 0, eS = P.sunE(t), same = fadeIn(t, P.same, 0.4);
  // the shared top line = the Sun's 100억 years of light
  withAlpha(c, 0.35 + 0.65 * same, () => { line(c, [[200, y0 - H], [880, y0 - H]], rgba(PAL.light, 0.9), 2.5, {dash: [8, 7]}); });
  tag(stage, `같은 에너지 · 약 ${(E_SUN10 / 1e44).toFixed(1)} × 10⁴⁴ J`, 540, y0 - H - 34, {size: 26, color: PAL.light, a: same});
  const bars = [{x: xs[0], e: eG, col: PAL.hot, name: '감마선 폭발'}, {x: xs[1], e: eS, col: PAL.sun, name: '태양'}];
  for (const b of bars) {
    rect(c, b.x - bw / 2, y0 - H, bw, H, 6, rgba(T.deep, 0.6), rgba(T.border, 1), 1.5);
    if (b.e > 0) { const h = H * clamp(b.e, 0, 1.05); glow(c, b.x, y0 - h, 70, b.col, 0.25); rect(c, b.x - bw / 2, y0 - h, bw, h, 6, rgba(b.col, 0.88)); }
    stage.text(b.name, b.x, y0 + 30, {role: 'display', size: 30, weight: 700, color: b.col, align: 'center'});
  }
  // clocks: the burst's few seconds (replayed at 2×) and the Sun's 100억 years
  const sec = clamp(2 * (t - P.replay0), 0, GRB_SPAN), yrs = SUN_YEARS * eS;
  stage.text(t > P.replay0 ? `${sec.toFixed(1)}초` : '0.0초', xs[0], y0 + 80, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'});
  stage.text(yrs < 1e8 ? `${fmtInt(yrs / 1e4)}만 년` : `${fmtInt(yrs / 1e8)}억 년`, xs[1], y0 + 80, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'});
}

// ------------------------------------------------------------------ origin: treaty → Vela satellites → the 1967 flash → arrival times → direction
const sPos = (ang, R = ORB.R) => [ORB.cx + Math.cos(ang * D2R) * R, ORB.cy - Math.sin(ang * D2R) * R];
const SRC = [Math.cos(SRC_ANG * D2R), -Math.sin(SRC_ANG * D2R)];        // screen unit vector toward the source
const SUN_XY = [176, 750];
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), s04 = at('s04') - 0.55, s05 = at('s05') - 0.55;
  const cA = fadeIn(t, P.card, 0.4) * fadeOut(t, s04, 0.3) * sf;
  if (cA > 0) withAlpha(c, cA, () => treatyCard(stage, t, P));
  const eA = fadeIn(t, P.earthIn, 0.5) * sf;
  if (eA > 0) withAlpha(c, eA, () => orbitStage(stage, t, ctx));
  const a4 = fadeIn(t, s04 + 0.3, 0.4) * fadeOut(t, s05, 0.3) * sf, a5 = fadeIn(t, s05 + 0.3, 0.4) * sf;
  if (a4 > 0) withAlpha(c, a4, () => flashPanels(stage, t, ctx));
  if (a5 > 0) withAlpha(c, a5, () => arrivalStrip(stage, t, ctx));
}
function treatyCard(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, 140, 330, 800, 150);
  stage.text('1963', 172, 372, {role: 'display', size: 40, weight: 700, color: T.accent});
  stage.text('부분적 핵실험 금지 조약', 290, 372, {role: 'display', size: 34, weight: 700, color: T.ink});
  ['대기', '우주', '물속'].forEach((s, k) => {
    const x = 300 + k * 240, y = 440, q = fadeIn(t, P.ban[k], 0.3), all = fadeIn(t, P.ban[2], 0.3);
    rect(c, x - 90, y - 24, 180, 48, 8, rgba(T.deep, 0.7), rgba(q > 0 ? mix(T.border, PAL.limit, q) : T.border, 1), 1.5 + q);
    stage.text(`${s}에서`, x - 14, y, {size: 28, weight: 700, color: T.ink, align: 'center', alpha: 0.6 + 0.4 * Math.max(q, all)});
    stage.text('금지', x + 52, y, {size: 24, weight: 700, color: PAL.limit, align: 'center', alpha: Math.max(q, all)});
  });
}
function orbitStage(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), s04 = at('s04') - 0.55, s05 = at('s05') - 0.55;
  const inS5 = t > s05;
  // the Sun's direction (left): a small sun at the edge, the Earth lit from that side
  const sunA = fadeIn(t, P.earthIn, 0.5);
  withAlpha(c, sunA, () => { glow(c, SUN_XY[0], SUN_XY[1], 60, PAL.sun, 0.5); circle(c, SUN_XY[0], SUN_XY[1], 16, PAL.sun); });
  tag(stage, '태양 쪽', SUN_XY[0] + 4, SUN_XY[1] + 46, {size: 24, color: PAL.sun, a: fadeIn(t, s05 + 0.3, 0.4), plate: false, align: 'left'});
  earth(stage, ORB.cx, ORB.cy, ORB.Re, {sun: [-0.85, -0.45, 0.25], spin: 60 + 4 * (t - 15), cloud: 0.6 * (t - 15)});
  // orbit (satellites stay put on these seconds: the real orbit takes about 4.6 days)
  withAlpha(c, fadeIn(t, P.launch[0], 0.5), () => ring(c, ORB.cx, ORB.cy, ORB.R, rgba(T.muted, 0.45), 1.5));
  c.setLineDash([]);
  const fast = VELA.map((s, k) => Math.exp(-Math.max(0, t - P.hit67[k]) / 0.25) * (t >= P.hit67[k] ? 1 : 0));
  const rec = t > P.draw67[0] && t < P.draw67[1] + 0.6 ? 0.85 * vela67(2 * (t - P.draw67[0])) : 0;
  VELA.forEach((s, k) => {
    const t0 = P.launch[k], t1 = P.station[k]; if (t < t0) return;
    const u = easeInOut((t - t0) / (t1 - t0)), rr = lerp(ORB.Re, ORB.R, u), ang = s.ang - 50 * (1 - u), [x, y] = sPos(ang, rr);
    if (u < 1) { const pts = []; for (let j = 0; j <= 16; j++) { const uu = u * j / 16; pts.push(sPos(s.ang - 50 * (1 - uu), lerp(ORB.Re, ORB.R, uu))); } line(c, pts, rgba(PAL.gamma, 0.35), 2); }
    const s5 = inS5 ? Math.exp(-Math.max(0, t - P.hit[k]) / 0.6) * (t >= P.hit[k] ? 1 : 0) + (t >= P.hit[k] ? 0.25 : 0) : 0;
    satellite(c, x, y, 1, ang * D2R * 0.5, Math.max(fast[k], rec, s5));
    if (inS5) {
      const ox = Math.cos(s.ang * D2R), oy = -Math.sin(s.ang * D2R);
      stage.text(s.n, x + ox * 40, y + oy * 40, {role: 'display', size: 28, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, s05 + 0.3, 0.4)});
      const dA = fadeIn(t, P.hit[k] - 0.02, 0.2);
      if (dA > 0) tag(stage, `+${VELA_DT[k].toFixed(2)}초`, x + ox * 96, y + oy * 82, {size: 26, color: PAL.gamma, a: dA});
    }
  });
  const stA = fadeIn(t, P.station[0], 0.4) * fadeOut(t, s04, 0.3);
  if (stA > 0) {
    const [ax, ay] = sPos(VELA[0].ang), [dx, dy] = sPos(VELA[3].ang);
    tag(stage, 'Vela 위성', ax + 30, ay - 52, {size: 28, color: T.ink, a: stA, align: 'left'});
    const lA = fadeIn(t, P.station[3] + 0.1, 0.4) * fadeOut(t, s04, 0.3);
    withAlpha(c, lA, () => line(c, [[dx + 14, dy + 10], [dx + 90, dy + 52]], rgba(T.ink, 0.7), 1.5));
    tag(stage, '감마선 검출기', dx + 96, dy + 62, {size: 26, color: PAL.gamma, a: lA, align: 'left'});
    tag(stage, '궤도 반지름 약 12만 km', ORB.cx - ORB.R * 0.62, ORB.cy - ORB.R * 0.98, {size: 24, color: T.muted, a: lA, plate: false});
  }
  // s04: the 1967 front passes quickly; s05: the same front replayed slowly
  const fD = 900 * (P.flash67 - t);
  if (Math.abs(fD) < ORB.R + 260) front(c, fD, 1 - smooth((Math.abs(fD) - ORB.R - 120) / 140));
  if (inS5) {
    const d = P.frontD(t), a = fadeIn(t, P.front0 - 0.25, 0.3) * (1 - smooth((-d - ORB.R - 30) / 80));
    if (a > 0) front(c, d, a);
    tag(stage, `모형 · 약 ${Math.round(P.slow)}배 느리게`, 920, 470, {size: 24, color: T.muted, align: 'right', plate: false, a: fadeIn(t, P.front0, 0.4) * fadeOut(t, P.solve[0], 0.4)});
    // the solved direction: from the Earth toward the source, out past the orbit
    const sq = easeOut((t - P.solve[0]) / (P.solve[1] - P.solve[0]));
    if (sq > 0) {
      const L = 70 + 330 * sq, ex = ORB.cx + SRC[0] * L, ey = ORB.cy + SRC[1] * L;
      glow(c, ex, ey, 40, PAL.gamma, 0.4 * sq);
      arrow(c, [ORB.cx + SRC[0] * (ORB.Re + 6), ORB.cy + SRC[1] * (ORB.Re + 6)], [ex, ey], PAL.hot, 5, {head: 20});
      tag(stage, '섬광이 온 방향', ORB.cx + SRC[0] * 250 - 20, ORB.cy + SRC[1] * 250 - 54, {size: 26, color: PAL.hot, a: fadeIn(t, P.solve[0] + 0.4, 0.4), align: 'right'});
    }
    const nE = fadeIn(t, P.notEarth, 0.3), nS = fadeIn(t, P.notSun, 0.3), sp = fadeIn(t, P.space, 0.35);
    if (nS > 0) withAlpha(c, nS, () => line(c, [[ORB.cx - ORB.Re - 8, ORB.cy], [SUN_XY[0] + 26, SUN_XY[1]]], rgba(PAL.sun, 0.6), 2, {dash: [6, 6]}));
    tag(stage, '지구에서 온 것 아님', ORB.cx, ORB.cy + ORB.Re + 34, {size: 24, color: T.ink, a: nE, border: PAL.limit});
    tag(stage, '태양에서 온 것 아님', SUN_XY[0] - 20, SUN_XY[1] - 64, {size: 24, color: T.ink, a: nS, border: PAL.limit, align: 'left'});
    tag(stage, '우주에서 옴', ORB.cx + SRC[0] * 400, ORB.cy + SRC[1] * 400 - 40, {size: 28, color: PAL.hot, a: sp, border: PAL.gamma});
    tag(stage, '1973년 논문으로 공개', 540, 420, {size: 24, color: T.muted, a: fadeIn(t, P.space + 0.7, 0.4), plate: false});
  }
}
/** a plane gamma-ray front at distance d (px) from the Earth's centre along SRC, moving toward −SRC */
function front(c, d, a) {
  if (a <= 0) return;
  const px = -SRC[1], py = SRC[0], cx = ORB.cx + SRC[0] * d, cy = ORB.cy + SRC[1] * d, L = 560;
  c.save(); c.beginPath(); c.rect(140, 300, 800, 735); c.clip();
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(cx + SRC[0] * 70, cy + SRC[1] * 70, cx, cy); g.addColorStop(0, rgba(PAL.gamma, 0)); g.addColorStop(1, rgba(PAL.gamma, 0.22));
    poly(c, [[cx - px * L, cy - py * L], [cx + px * L, cy + py * L], [cx + px * L + SRC[0] * 70, cy + py * L + SRC[1] * 70], [cx - px * L + SRC[0] * 70, cy - py * L + SRC[1] * 70]], g);
    line(c, [[cx - px * L, cy - py * L], [cx + px * L, cy + py * L]], rgba(PAL.hot, 0.9), 3);
    for (let k = -3; k <= 3; k++) arrow(c, [cx + px * k * 120 + SRC[0] * 40, cy + py * k * 120 + SRC[1] * 40], [cx + px * k * 120 - SRC[0] * 6, cy + py * k * 120 - SRC[1] * 6], rgba(PAL.hot, 0.7), 2.5, {head: 10});
  });
  c.restore();
}
function flashPanels(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r);
  const rows = [
    {x: 140, title: '핵폭발이라면 (모형)', f: bombCurve, q: clamp((t - P.bombDraw[0]) / (P.bombDraw[1] - P.bombDraw[0])) * 7, col: PAL.warm, tagT: at(A.bomb) - 0.1, tag: '한 번 솟고 서서히'},
    {x: 550, title: '1967년 7월 2일 (모형 곡선)', f: vela67, q: clamp(2 * (t - P.draw67[0]), 0, 7), col: PAL.hot, tagT: at(A.diff) - 0.1, tag: '봉우리 두 개'},
  ];
  for (const r of rows) {
    const hi = r.x === 550 ? fadeIn(t, at(A.diff) - 0.1, 0.3) : fadeIn(t, at(A.bomb) - 0.1, 0.3) * fadeOut(t, at(A.diff) - 0.2, 0.4);
    rect(c, r.x, 1040, 390, 276, 12, rgba(T.plate, 0.86), rgba(hi > 0 ? mix(T.border, r.col, hi) : T.border, 1), 1.5 + hi);
    stage.text(r.title, r.x + 195, 1072, {size: 24, weight: 700, color: r.col, align: 'center'});
    const B = {x0: r.x + 30, x1: r.x + 360, y0: 1270, y1: 1120}, X = s => lerp(B.x0, B.x1, s / 7), Y = v => lerp(B.y0, B.y1, v / 1.1);
    axes(stage, B, {});
    stage.text('시간 →', B.x1, B.y0 + 26, {size: 24, weight: 500, color: T.muted, align: 'right'});
    const pts = []; for (let s = 0; s <= r.q + 1e-6; s += 0.03) pts.push([X(s), Y(r.f(s))]);
    if (pts.length > 1) { poly(c, [[X(0), B.y0], ...pts, [pts[pts.length - 1][0], B.y0]], rgba(r.col, 0.15)); line(c, pts, r.col, 3.5); }
    if (r.q > 0 && r.q < 7) { const [x, y] = pts[pts.length - 1] || [X(0), B.y0]; circle(c, x, y, 5, '#FFFFFF'); }
    tag(stage, r.tag, r.x + 250, 1130, {size: 24, color: r.col, a: fadeIn(t, r.tagT, 0.3) * (r.q >= 7 ? 1 : 0.0) + (r.x === 140 ? fadeIn(t, r.tagT, 0.3) : 0) * 0});
  }
}
function arrivalStrip(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), B = {x0: 210, x1: 890, y: 1220}, X = s => lerp(B.x0, B.x1, s / 0.8);
  panel(c, T, 140, 1060, 800, 250, 0.86);
  stage.text('도착 시각 (가장 먼저 받은 위성 = 0)', 160, 1094, {size: 24, weight: 700, color: T.muted});
  line(c, [[B.x0, B.y], [B.x1, B.y]], T.muted, 2);
  for (const s of [0, 0.2, 0.4, 0.6, 0.8]) { line(c, [[X(s), B.y], [X(s), B.y + 8]], T.muted, 2); stage.text(s === 0 ? '0' : s.toFixed(1), X(s), B.y + 30, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  stage.text('초', B.x1 + 26, B.y + 30, {size: 24, weight: 500, color: T.muted, align: 'center'});
  VELA.forEach((s, k) => {
    const q = fadeIn(t, P.hit[k] - 0.02, 0.2); if (q <= 0) return;
    const x = X(VELA_DT[k]), fl = Math.exp(-Math.max(0, t - P.hit[k]) / 0.4);
    withAlpha(c, q, () => { glow(c, x, B.y - 40, 30, PAL.gamma, 0.5 * fl); line(c, [[x, B.y], [x, B.y - 70]], PAL.hot, 4); stage.text(s.n, x, B.y - 92, {role: 'display', size: 28, weight: 700, color: T.ink, align: 'center'}); });
  });
}

// ------------------------------------------------------------------ gamma: the spectrum, energy per photon, the atmosphere
const lgX = lg => 160 + (0.6 - lg) / 13 * 760;
function gammaScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx), sw = P.atmIn;
  const a6 = fadeOut(t, sw, 0.3) * sf, a7 = fadeIn(t, sw + 0.3, 0.4) * sf;
  if (a6 > 0) withAlpha(c, a6, () => { spectrumStrip(stage, t, ctx); photonEnergy(stage, t, ctx); });
  if (a7 > 0) withAlpha(c, a7, () => atmosphere(stage, t, ctx));
}
function spectrumStrip(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), y0 = 420, y1 = 486;
  const cur = lerp(150, 930, clamp((t - P.spec[0]) / (P.spec[1] - P.spec[0])));
  panel(c, T, 140, 330, 800, 280, 0.84);
  stage.text('빛의 종류 (파장, 로그 눈금)', 160, 362, {size: 24, weight: 700, color: T.muted});
  c.save(); c.beginPath(); c.rect(160, y0, 760, y1 - y0); c.clip();
  c.fillStyle = '#05090C'; c.fillRect(160, y0, 760, y1 - y0);
  const g = c.createLinearGradient(160, 0, 920, 0);
  g.addColorStop(0, rgba('#6A3020', 0.5)); g.addColorStop((lgX(-6.1) - 160) / 760, rgba('#7A2018', 0.45));
  for (let k = 0; k <= 6; k++) { const nm = lerp(780, 380, k / 6), x = lgX(Math.log10(nm * 1e-9)); g.addColorStop((x - 160) / 760, rgba(specHex(nm), 0.95)); }
  g.addColorStop((lgX(-6.5) - 160) / 760, rgba('#4A2A8A', 0.5)); g.addColorStop(1, rgba('#2A4A9A', 0.55));
  c.fillStyle = g; c.fillRect(160, y0, 760, y1 - y0);
  // the wave: wavelength on screen shrinks with the real (log) wavelength; revealed by the cursor
  const pts = []; let ph = 0;
  for (let x = 160; x <= Math.min(cur, 920); x += 0.5) { const lg = 0.6 - (x - 160) / 760 * 13, lam = 120 * 10 ** (0.12 * lg); ph += 0.5 / lam; pts.push([x, (y0 + y1) / 2 + Math.sin(ph * TAU - t * 3) * 22]); }
  if (pts.length > 1) line(c, pts, rgba('#FFFFFF', 0.9), 2);
  c.restore();
  rect(c, 160, y0, 760, y1 - y0, 4, null, rgba(T.border, 1), 1.5);
  if (t > P.spec[0] && t < P.spec[1] + 0.2) { line(c, [[cur, y0 - 8], [cur, y1 + 8]], rgba('#FFFFFF', 0.9), 2); }
  BANDS.forEach((b, k) => {
    const x = lgX(b.lg), up = k % 2 === 0, lit = fadeIn(t, P.spec[0] + (x - 150) / 780 * (P.spec[1] - P.spec[0]) - 0.1, 0.25), isG = b.n === '감마선', isV = b.n === '가시광선';
    const col = isG ? PAL.gamma : isV ? PAL.vis : T.ink, y = up ? y0 - 22 : y1 + 24;
    if (isV) withAlpha(c, lit, () => line(c, [[x, y1 + 2], [x, y1 + 8]], PAL.vis, 2));
    stage.text(b.n, x, y, {size: isG ? 28 : 24, weight: 700, color: col, align: 'center', alpha: 0.25 + 0.75 * lit});
  });
  const eA = fadeIn(t, at(A.kind) - 0.2, 0.4);
  stage.text('← 파장이 길다', 160, 560, {size: 24, weight: 500, color: T.muted, alpha: eA});
  stage.text('파장이 짧다 →', 920, 560, {size: 24, weight: 500, color: T.muted, align: 'right', alpha: eA});
  tag(stage, '눈에 보이는 빛은 아주 좁은 띠', 540, 560, {size: 24, color: PAL.vis, a: eA * 0.95, plate: false});
}
const EX = lg => lerp(300, 900, (lg + 1) / 7);                          // photon-energy axis: 0.1 eV … 1 MeV (log)
function photonEnergy(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), y0 = 640;
  const pA = fadeIn(t, at(A.grain) - 0.2, 0.4); if (pA <= 0) return;
  withAlpha(c, pA, () => {
    panel(c, T, 140, y0, 800, 670, 0.86);
    stage.text('빛 알갱이(광자) 하나의 에너지', 160, y0 + 34, {size: 26, weight: 700, color: T.ink});
    const yAx = y0 + 330;
    line(c, [[EX(-1), yAx], [EX(6), yAx]], T.muted, 2);
    for (let lg = -1; lg <= 6; lg++) line(c, [[EX(lg), yAx], [EX(lg), yAx + (lg % 3 === 0 ? 12 : 6)]], T.muted, 2);
    for (const [lg, s] of [[0, '1 eV'], [3, '1천 eV'], [6, '100만 eV']]) stage.text(s, EX(lg), yAx + 34, {size: 24, weight: 500, color: T.muted, align: 'center'});
    stage.text('로그 눈금 · 한 칸 10배', 920, yAx + 74, {size: 24, weight: 500, color: T.muted, align: 'right'});
    // rows: visible photon (2 eV), gamma photon (grows to 500 keV)
    const vq = fadeIn(t, P.visBar, 0.5), lgG = t < P.gBar[0] ? Math.log10(E_VIS) : P.gBarLg(t), gq = fadeIn(t, P.gBar[0] - 0.3, 0.3);
    const rows = [{y: y0 + 140, name: '가시광선', lg: Math.log10(E_VIS), q: vq, col: PAL.vis, lam: 40}, {y: y0 + 240, name: '감마선', lg: lgG, q: gq, col: PAL.gamma, lam: 6}];
    for (const r of rows) {
      stage.text(r.name, 160, r.y, {size: 26, weight: 700, color: r.col});
      if (r.q <= 0) continue;
      withAlpha(c, r.q, () => {
        const xe = EX(lerp(-1, r.lg, easeOut(r.q)));
        rect(c, EX(-1), r.y - 16, Math.max(4, xe - EX(-1)), 32, 6, rgba(r.col, 0.85));
        // a travelling wave packet above the bar (its wavelength ∝ 1/energy, schematic)
        const ph = ((t * 0.5) % 1), x = lerp(EX(-1) + 60, 900, ph);
        photon(c, x, r.y - 42, 1, 0, 0.8 * Math.sin(Math.PI * ph), {len: 90, lam: r.lam, amp: 7, col: r.col, w: 2.5, glow: false});
      });
    }
    stage.text('약 2 eV', EX(Math.log10(E_VIS)) + 16, y0 + 140, {size: 24, weight: 700, color: T.ink, alpha: vq});
    const ratio = 10 ** (lgG - Math.log10(E_VIS));
    if (gq > 0 && t > P.gBar[0]) {
      const xe = EX(lgG);
      stage.text(lgG > 5.6 ? '약 50만 eV' : '', Math.min(xe, 900) - 10, y0 + 196, {size: 24, weight: 700, color: T.ink, align: 'right'});
      withAlpha(c, fadeIn(t, P.gBar[0], 0.3), () => {
        stage.text(`× ${fmtInt(ratio)}`, 540, y0 + 480, {role: 'display', size: 64, weight: 700, color: ratio > 2e5 ? PAL.light : T.ink, align: 'center'});
        stage.text('감마선 알갱이 하나 ÷ 가시광선 알갱이 하나', 540, y0 + 548, {size: 24, weight: 500, color: T.muted, align: 'center'});
      });
      tag(stage, '수십만 배', 540, y0 + 612, {size: 30, color: PAL.light, a: fadeIn(t, P.gBar[1] - 0.1, 0.4)});
    }
  });
}
// atmosphere cross-section (s07): altitude axis compressed (log of 1 + h/4 km)
const yH = h => 1236 - 812 * Math.log10(1 + h / 4) / Math.log10(1 + 500 / 4);
const ATM_SAT = {x: 540, h: 500, w: 26}, DOME = {x: 790, w: 34};
const RAIN = (() => { const L = []; for (let k = 0; k < 220; k++) L.push({ts: 48.6 + k * 0.075, x: 210 + 700 * rand(k * 1.37 + 0.3), h: absorbAlt(rand(k * 2.91 + 5.1))}); return L; })();
export const RAIN_V = 620;
export const rainCatches = () => RAIN.filter(p => Math.abs(p.x - ATM_SAT.x) < ATM_SAT.w).map(p => p.ts + (yH(ATM_SAT.h) - 340) / RAIN_V);
function atmosphere(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r);
  panel(c, T, 140, 330, 800, 980, 0.5);
  clipRect(c, 141, 331, 798, 978, 12, () => {
    const g = c.createLinearGradient(0, yH(120), 0, 1236); g.addColorStop(0, 'rgba(40,90,160,0)'); g.addColorStop(0.45, 'rgba(50,110,190,0.25)'); g.addColorStop(1, 'rgba(90,160,230,0.55)');
    c.fillStyle = g; c.fillRect(141, yH(120), 798, 1236 - yH(120));
    rect(c, 141, 1236, 798, 80, 0, '#14231A');
  });
  // absorption band 25–50 km
  const bA = fadeIn(t, at(A.cant) - 0.2, 0.4);
  withAlpha(c, bA, () => { rect(c, 230, yH(50), 690, yH(25) - yH(50), 0, rgba(PAL.limit, 0.1)); line(c, [[230, yH(50)], [920, yH(50)]], rgba(PAL.limit, 0.5), 1.5, {dash: [6, 6]}); line(c, [[230, yH(25)], [920, yH(25)]], rgba(PAL.limit, 0.5), 1.5, {dash: [6, 6]}); });
  tag(stage, '감마선이 막히는 높이', 920, (yH(25) + yH(50)) / 2, {size: 24, color: PAL.limit, a: bA, align: 'right'});
  // altitude axis
  for (const h of [0, 10, 30, 50, 100, 500]) { const y = yH(h); line(c, [[200, y], [214, y]], T.muted, 2); stage.text(h === 0 ? '땅' : `${h} km`, 192, y, {size: 24, weight: 500, color: T.muted, align: 'right'}); }
  line(c, [[214, yH(500) - 20], [214, 1236]], rgba(T.muted, 0.7), 2);
  // gamma photons from above: absorbed at their model altitude, or caught by the satellite
  const ySat = yH(ATM_SAT.h);
  let caught = 0;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const p of RAIN) {
    const age = t - p.ts; if (age < 0) continue;
    const y = 340 + RAIN_V * age, hit = Math.abs(p.x - ATM_SAT.x) < ATM_SAT.w, yEnd = hit ? ySat : yH(p.h);
    if (y < yEnd) { line(c, [[p.x, Math.max(336, y - 34)], [p.x, y]], rgba(PAL.gamma, 0.85), 2.5); circle(c, p.x, y, 3, '#FFFFFF'); }
    else {
      if (hit) { caught++; continue; }
      const d = (y - yEnd) / RAIN_V; if (d < 0.5) { glow(c, p.x, yEnd, 16 + 20 * d, PAL.limit, 0.5 * (1 - d / 0.5)); }
    }
  }
  // visible light (sparse) reaches the ground
  for (let k = 0; k < 40; k++) { const ts = 48.9 + k * 0.42, age = t - ts; if (age < 0) continue; const x = 240 + 660 * rand(k * 7.7 + 2), y = 340 + 700 * age; if (y < 1236) photon(c, x, y, 0, 1, 0.75, {len: 40, lam: 13, amp: 4, col: PAL.vis, w: 2, glow: false}); }
  c.restore();
  // satellite above, telescope on the ground
  satellite(c, ATM_SAT.x, ySat, 1.1, 0.3, 0.3 + 0.7 * Math.exp(-(t - Math.max(...rainCatches().filter(x => x <= t), -9)) / 0.3));
  tag(stage, '우주 망원경', ATM_SAT.x + 44, ySat - 20, {size: 26, color: T.ink, align: 'left', a: fadeIn(t, at(A.scope7) - 0.2, 0.4) + 0.5 * (1 - fadeIn(t, at(A.scope7) - 0.2, 0.4))});
  tag(stage, `받은 감마선 ${caught}`, ATM_SAT.x + 44, ySat + 26, {size: 24, color: PAL.gamma, align: 'left'});
  withAlpha(c, 1, () => { c.beginPath(); c.arc(DOME.x, 1236, DOME.w, Math.PI, TAU); c.fillStyle = '#6C7A80'; c.fill(); rect(c, DOME.x - 6, 1236 - DOME.w - 10, 12, 14, 2, '#24323A'); });
  tag(stage, '땅의 망원경 · 감마선 0', DOME.x, 1180, {size: 24, color: T.ink, a: fadeIn(t, at(A.pierce) - 0.2, 0.4)});
  tag(stage, '가시광선은 땅까지', 400, 1180, {size: 24, color: PAL.vis, a: fadeIn(t, at(A.cant), 0.4), plate: false});
}

// ------------------------------------------------------------------ sky: the all-sky map fills evenly; the comparison; GRB 970508's lines
const MAP = {cx: 540, cy: 560, a: 390, b: 195}, INS = {cx: 540, cy: 1005, a: 250, b: 125};
const mapXY = (M, l, b) => { const [x, y] = hammer(l, b); return [M.cx - x * M.a, M.cy + y * 2 * M.b]; };
export const GRB970508 = {l: 2.1, b: 0.46};
function skyMap(stage, t, M, list, n, o = {}) {
  const c = stage.ctx, T = stage.theme;
  c.save(); c.beginPath(); c.ellipse(M.cx, M.cy, M.a, M.b, 0, 0, TAU); c.clip();
  c.fillStyle = '#020A10'; c.fillRect(M.cx - M.a, M.cy - M.b, 2 * M.a, 2 * M.b);
  // the Milky Way band (b = 0) with its bulge at the centre
  const bw = M.b * 0.2, g = c.createLinearGradient(0, M.cy - bw * 2.2, 0, M.cy + bw * 2.2);
  g.addColorStop(0, 'rgba(180,190,230,0)'); g.addColorStop(0.5, `rgba(200,205,235,${0.3 * (o.band ?? 1)})`); g.addColorStop(1, 'rgba(180,190,230,0)');
  c.fillStyle = g; c.fillRect(M.cx - M.a, M.cy - bw * 2.2, 2 * M.a, bw * 4.4);
  const bg = c.createRadialGradient(M.cx, M.cy, 2, M.cx, M.cy, M.a * 0.3); bg.addColorStop(0, `rgba(255,230,200,${0.35 * (o.band ?? 1)})`); bg.addColorStop(1, 'rgba(255,230,200,0)');
  c.save(); c.translate(M.cx, M.cy); c.scale(1, 0.4); circle(c, 0, 0, M.a * 0.3, bg); c.restore();
  for (const bd of [-60, -30, 30, 60]) { const pts = []; for (let k = 0; k <= 60; k++) pts.push(mapXY(M, lerp(-Math.PI, Math.PI, k / 60), bd * D2R)); line(c, pts, rgba(T.muted, 0.18), 1); }
  for (const ld of [-120, -60, 0, 60, 120]) { const pts = []; for (let k = 0; k <= 40; k++) pts.push(mapXY(M, ld * D2R, lerp(-Math.PI / 2, Math.PI / 2, k / 40))); line(c, pts, rgba(T.muted, 0.18), 1); }
  // points
  const r = o.r ?? 2.2, dim = o.dim ?? 1;
  for (let i = 0; i < n; i++) { const p = list[i], [x, y] = mapXY(M, p.l, p.b); circle(c, x, y, r, rgba(o.col || '#FFE7B0', 0.85 * dim)); }
  for (let i = Math.max(0, n - 30); i < n; i++) { const p = list[i], [x, y] = mapXY(M, p.l, p.b); ring(c, x, y, r + 3, rgba('#FFFFFF', 0.5 * (i - n + 30) / 30 * dim), 1.2); }
  c.restore();
  c.beginPath(); c.ellipse(M.cx, M.cy, M.a, M.b, 0, 0, TAU); c.strokeStyle = rgba(T.border, 1); c.lineWidth = 2; c.stroke();
}
function skyScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), n = P.nDots(t);
  const s9 = fadeIn(t, P.s09 + 0.3, 0.5), a8 = fadeOut(t, P.s09, 0.3);
  withAlpha(c, sf, () => {
    skyMap(stage, t, MAP, SKYPTS.iso, n, {dim: 1 - 0.55 * s9, band: 1 - 0.4 * s9});
    stage.text('하늘 전체 지도', MAP.cx - MAP.a + 10, MAP.cy - MAP.b + 4, {size: 24, weight: 700, color: T.muted});
    tag(stage, '모형 · 무작위 점', MAP.cx + MAP.a - 4, MAP.cy - MAP.b + 4, {size: 24, color: T.muted, align: 'right', plate: false});
    const bA = fadeIn(t, at(A.milky) - 0.2, 0.4) * a8;
    tag(stage, '은하수 띠', MAP.cx + MAP.a * 0.62, MAP.cy + 38, {size: 24, color: '#D8DCF2', a: bA});
    withAlpha(c, a8, () => {
      stage.text(`폭발 ${fmtInt(n)}개`, 160, 800, {role: 'display', size: 36, weight: 700, color: PAL.light, alpha: fadeIn(t, P.dots[0] - 0.2, 0.3)});
      stage.text('1991–2000 · BATSE', 920, 800, {size: 26, weight: 700, color: T.ink, align: 'right', alpha: fadeIn(t, P.dots[0] - 0.2, 0.3)});
    });
    // the comparison: if the bursts were in our galaxy's disk
    const iA = fadeIn(t, P.inset, 0.4) * a8;
    if (iA > 0) withAlpha(c, iA, () => {
      stage.text('우리 은하 안에서 터졌다면 (비교 모형)', 540, 856, {size: 26, weight: 700, color: PAL.warm, align: 'center'});
      skyMap(stage, t, INS, SKYPTS.disk, n, {r: 1.5, col: '#FFC89A'});
      panel(c, T, 140, 1152, 800, 158, 0.86);
      stage.text(`띠 근처(위도 ±${BAND_CUT}°)에 있는 비율`, 160, 1186, {size: 24, weight: 700, color: T.muted});
      const fi = nearBand(SKYPTS.iso.slice(0, n)), fd = nearBand(SKYPTS.disk.slice(0, n)), ev = fadeIn(t, at(A.evenly) - 0.2, 0.4);
      stage.text('관측 (모형)', 160, 1240, {size: 26, weight: 700, color: PAL.light});
      stage.text(`${Math.round(fi * 100)}%`, 420, 1240, {role: 'display', size: 36, weight: 700, color: PAL.light, align: 'right'});
      stage.text('은하 안이라면', 520, 1240, {size: 26, weight: 700, color: PAL.warm});
      stage.text(`${Math.round(fd * 100)}%`, 900, 1240, {role: 'display', size: 36, weight: 700, color: PAL.warm, align: 'right'});
      stage.text(`고르게 흩어지면 약 ${Math.round(Math.sin(BAND_CUT * D2R) * 100)}%`, 160, 1286, {size: 24, weight: 500, color: T.muted, alpha: ev});
    });
    if (s9 > 0) withAlpha(c, s9, () => afterglowLines(stage, t, ctx));
  });
}
function afterglowLines(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), [gx, gy] = mapXY(MAP, GRB970508.l, GRB970508.b);
  // the burst on the map and its fading afterglow (brightness ∝ (days)^−1.2, replayed)
  const d = Math.max(0.02, (t - (P.s09 + 0.4)) * 1.5), ag = clamp(0.15 * d ** -1.2, 0, 1.4);
  glow(c, gx, gy, 30 + 30 * ag, PAL.light, 0.25 + 0.4 * clamp(ag)); circle(c, gx, gy, 4 + 2 * clamp(ag), '#FFFFFF');
  ring(c, gx, gy, 22, rgba('#FFFFFF', 0.85), 2.5);
  tag(stage, 'GRB 970508', gx - 30, gy - 44, {size: 26, color: T.ink, align: 'right'});
  tag(stage, '희미한 잔광', gx - 30, gy + 44, {size: 24, color: PAL.light, a: fadeIn(t, at(A.faint9) - 0.1, 0.3), align: 'right'});
  // the spectrum: lab lines × (1 + z) slide onto the lines measured in the afterglow
  const y0 = 840, z = P.zNow(t), SX = nm => lerp(170, 910, (nm - 200) / 400), lA = fadeIn(t, at(A.afterglow9) - 0.2, 0.4);
  withAlpha(c, lA, () => {
    panel(c, T, 140, y0, 800, 470, 0.88);
    stage.text('잔광의 흡수선', 160, y0 + 32, {size: 26, weight: 700, color: T.ink});
    const rowL = [y0 + 82, y0 + 122], rowO = [y0 + 190, y0 + 230];
    const band = (y, ya) => {
      c.save(); c.beginPath(); c.rect(170, y, 740, ya - y); c.clip(); c.fillStyle = '#05090C'; c.fillRect(170, y, 740, ya - y);
      const g = c.createLinearGradient(170, 0, 910, 0); for (let k = 0; k <= 20; k++) { const nm = lerp(200, 600, k / 20); g.addColorStop(k / 20, nm < 380 ? rgba('#5A3A9A', 0.35) : rgba(specHex(nm), 0.55)); }
      c.fillStyle = g; c.fillRect(170, y, 740, ya - y); c.restore(); rect(c, 170, y, 740, ya - y, 3, null, rgba(T.border, 1), 1.2);
    };
    stage.text('실험실에서의 파장', 170, rowL[0] - 18, {size: 24, weight: 700, color: PAL.blue});
    band(rowL[0], rowL[1]);
    stage.text('잔광에서 잰 파장', 170, rowO[0] - 18, {size: 24, weight: 700, color: PAL.light});
    band(rowO[0], rowO[1]);
    for (const L of LINES_970508) {
      const xo = SX(L.lab * (1 + Z_970508)), xl = SX(L.lab * (1 + z)), x0 = SX(L.lab);
      rect(c, xo - 2.5, rowO[0], 5, rowO[1] - rowO[0], 0, '#020406');
      rect(c, xl - 2.5, rowL[0], 5, rowL[1] - rowL[0], 0, '#E8F0FF');
      if (z > 0.01) withAlpha(c, 0.8, () => arrow(c, [x0, rowL[1] + 14], [Math.max(x0 + 2, xl), rowL[1] + 14], rgba(PAL.red, 0.9), 2.2, {head: 8}));
      if (z > Z_970508 * 0.98) line(c, [[xl, rowL[1] + 24], [xo, rowO[0] - 4]], rgba('#FFFFFF', 0.55), 1.5, {dash: [4, 5]});
    }
    const yA = rowO[1] + 26;
    for (const nm of [200, 300, 400, 500, 600]) { line(c, [[SX(nm), rowO[1]], [SX(nm), rowO[1] + 8]], T.muted, 2); stage.text(String(nm), SX(nm), yA, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
    stage.text('nm', 910, yA + 30, {size: 24, weight: 500, color: T.muted, align: 'right'});
    stage.text('자외선 | 가시광선', SX(380), rowL[0] - 18, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: 0.8});
    const mg = LINES_970508[2];
    stage.text(`Mg II  ${mg.lab.toFixed(1)} → ${(mg.lab * (1 + z)).toFixed(1)} nm`, 170, y0 + 318, {size: 26, weight: 700, color: T.ink, alpha: fadeIn(t, P.shift[0], 0.3)});
    stage.text(`모든 선의 파장 × ${(1 + z).toFixed(3)}`, 910, y0 + 318, {size: 26, weight: 700, color: z > Z_970508 * 0.99 ? PAL.light : T.ink, align: 'right', alpha: fadeIn(t, P.shift[0], 0.3)});
    const dA = fadeIn(t, P.dist, 0.4);
    stage.text(`적색이동 z = ${z.toFixed(3)}`, 170, y0 + 378, {role: 'display', size: 34, weight: 700, color: PAL.red, alpha: fadeIn(t, P.shift[0], 0.3)});
    stage.text(`빛이 온 거리 약 ${Math.round(lookbackGyr(Z_970508) * 10)}억 광년`, 170, y0 + 432, {role: 'display', size: 34, weight: 700, color: PAL.light, alpha: dA});
    tag(stage, '수십억 광년', 910, y0 + 432, {size: 26, color: T.ink, align: 'right', a: dA, border: PAL.light});
  });
}
