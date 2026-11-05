// Episode scenes — "퀘이사 — 별처럼 보인 블랙홀"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Redshift of 3C 273: z = 0.158. λ_obs = λ_lab(1 + z) for every line → the whole hydrogen pattern stretches ×1.158
//    (Hδ 410.2 → 475.0, Hγ 434.0 → 502.6, Hβ 486.1 → 562.9, Hα 656.3 → 760.0 nm); spacings widen by the same factor.
//  - Distance (luminosity distance) ≈ 24억 광년; apparent magnitude 12.9; luminosity ≈ 4×10¹² L☉ = 100 × the Milky Way
//    (Milky Way light taken as 4×10¹⁰ L☉ so the two figures agree). Inverse square: flux ∝ L/d².
//  - Size from flicker: a thin shell of radius R that flashes all at once is seen with delays τ = (R/c)(1 − cos θ),
//    uniformly spread over [0, 2R/c] (dA/dτ = 2πRc is constant). Observed light = flash ⊗ box(2R/c). shellResponse().
//    Big ball R = 1 light-year (box 2 years), small ball R = 2 light-days (box 4 days). 1 light-day ≈ 173 AU.
//  - Engine: black hole 3×10⁸ M☉ (3C 273). Disk: angular speed ∝ r^−1.5, temperature ∝ r^−3/4, potential Φ ∝ −1/r.
//    Efficiency: accretion ≈ 10 % of the infalling rest mass → light; hydrogen fusion 0.7 % (ratio ≈ 14).
//  - Eddington: L_Edd = 3.3×10⁴ L☉ per M☉ (previous episode). 3C 273: Γ = 4e12 / (3.3e4 × 3e8) = 0.40.
//    J0529−4351: L ≈ 5×10¹⁴ L☉, M ≈ 1.7×10¹⁰ M☉ → Γ = 0.89; ≈ 370 M☉ per year ≈ 1 Sun per day.
//  - Quasar number density over cosmic time: explanatory model curve (log-normal in age, peak at age 3.6 Gyr ≈ 10.2 Gyr
//    ago, z ≈ 2; ≈ 3 % of the peak today). Tagged "모형" on screen.
//  - Myth: a gas blob plunging from r = 6 to the horizon (r in horizon radii). Light it gives off (local) rises to the
//    innermost stable orbit (r = 3), the light that reaches us is dimmed and reddened by g = √(1 − 1/r) (g⁴ in
//    brightness) → brightest just outside, fading to nothing at the shadow edge; the hole itself stays black.
//  - Zoom "world": one log scale (log10 of the frame half-height in light-years) drives disk (outer radius 0.035 ly),
//    jets (opening angle constant, 1.2×10⁵ ly long), host galaxy (radius 5×10⁴ ly), a log-uniform sprinkle of galaxy
//    stars, and the telescope eyepiece at the far end. Hook zooms out, engine and close zoom in on the same world.
//  - Sound: node episodes/quasar/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
// spectrum
export const Z = 0.158;
export const BALMER = [{n: 'Hδ', lab: 410.2}, {n: 'Hγ', lab: 434.0}, {n: 'Hβ', lab: 486.1}, {n: 'Hα', lab: 656.3}];
export const stretch = (lab, z = Z) => lab * (1 + z);
export const LAM = [380, 780];                                          // drawn wavelength range (nm)
// distance and brightness
export const D_3C273 = 2.4e9, MAG_3C273 = 12.9, L_3C273 = 4e12, L_MW = L_3C273 / 100;
export const LADDER = [
  {name: '태양', ly: 8 / (60 * 24 * 365.25), dist: '8광분'},
  {name: '가장 가까운 별', ly: 4.2, dist: '4.2광년'},
  {name: '우리 은하 지름', ly: 1e5, dist: '약 10만 광년'},
  {name: '안드로메다 은하', ly: 2.5e6, dist: '약 250만 광년'},
  {name: '3C 273', ly: 2.4e9, dist: '약 24억 광년'},
];
export const flux = (L, d) => L / (d * d);                              // inverse square (relative units)
// size from light-travel time
export const LD_AU = 173.1, NEPTUNE_AU = 30.1, HELIOPAUSE_AU = 120;
export const BIG_R_LY = 1, SMALL_R_LD = 2, YEAR_D = 365.25;
export const boxDays = rLd => 2 * rLd;                                  // 2R/c in days (R in light-days)
const erf = x => { const s = Math.sign(x), a = Math.abs(x), k = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-a * a)); };
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
/** light arriving at day d from a gaussian flash (area A, width σ days) at day d0 of a thin shell whose delays fill [0, W] */
export const shellResponse = (d, d0, A, sig, W) => (W < 1e-6 ? A * Math.exp(-0.5 * ((d - d0) / sig) ** 2) / (sig * Math.sqrt(TAU)) : A * (Phi((d - d0) / sig) - Phi((d - d0 - W) / sig)) / W);
export const FLARES = [{d: 2.0, A: 3.0}, {d: 6.4, A: 5.0}, {d: 9.3, A: 2.4}, {d: 13.4, A: 4.4}, {d: 17.3, A: 3.2}];
/** the observed quasar light curve (s10): flares of a source R = 2 light-days (box 4 days) on a steady base */
export const flickerObs = d => 1 + FLARES.reduce((s, f) => s + shellResponse(d, f.d, f.A, 0.45, boxDays(SMALL_R_LD)), 0);
// engine
export const M_3C273 = 3e8, LEDD_PER_MSUN = 3.3e4;
export const lEdd = M => LEDD_PER_MSUN * M;
export const gammaOf = (L, M) => L / lEdd(M);
export const ETA_ACC = 0.10, ETA_FUS = 0.007;
export const J0529 = {L: 5e14, M: 1.7e10, perYear: 370};
export const omegaK = r => r ** -1.5;                                   // r in units of the disk's outer radius
export const tempK = r => r ** -0.75;
export const DISK_IN = 0.17;                                            // inner edge / outer radius (display)
export const wellPhi = r => -DISK_IN / r;                               // Φ ∝ −1/r, = −1 at the inner edge
// cosmic time
export const T_NOW = 13.8, QSO_PEAK_AGE = 3.6;
export const qsoDensity = age => { const x = Math.log(Math.max(age, 0.05) / QSO_PEAK_AGE), s = x < 0 ? 0.62 : 0.5; return Math.exp(-0.5 * (x / s) ** 2); };
export const COSMIC_MARKS = [{id: 'J0313', name: 'J0313−1806', age: 0.68}, {id: 'J0529', name: 'J0529−4351', age: 1.6}, {id: 'C273', name: '3C 273', age: T_NOW - 2.0}];
// myth: r in horizon radii
export const gRed = r => Math.sqrt(Math.max(0, 1 - 1 / r));
export const blobLocal = r => (r >= 3 ? (3 / r) ** 2.2 : 1);
export const blobSeen = r => blobLocal(r) * gRed(r) ** 4;
// zoom world (log10 of the frame half-height in light-years)
export const WORLD = {disk: 0.035, jet: 1.2e5, gal: 5e4};
export const L_POSTER = Math.log10(WORLD.disk * 960 / 340), L_ENG = Math.log10(WORLD.disk * 960 / 300), L_EYE = 7.0;
export const pxPerLy = L => 960 / 10 ** L;
// radio sky (origin): catalogue entries in sweep order; q = quasar
export const SOURCES = [
  {name: '3C 31', x: 212, y: 470, S: 0.55}, {name: '3C 48', x: 300, y: 610, S: 0.75, q: true}, {name: '3C 84', x: 382, y: 430, S: 0.9},
  {name: '3C 147', x: 462, y: 560, S: 0.7, q: true}, {name: '3C 196', x: 552, y: 410, S: 0.6, q: true}, {name: '3C 273', x: 648, y: 590, S: 1.0, q: true},
  {name: '3C 286', x: 748, y: 455, S: 0.65, q: true}, {name: '3C 405', x: 852, y: 600, S: 0.95},
];
export const BEAM_W = 34;
export const radioSignal = xb => SOURCES.reduce((s, k) => s + k.S * Math.exp(-(((xb - k.x) / BEAM_W) ** 2)), 0);

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  today: W('s01', '오늘은'), starLike: W('s01', '별처럼'), notStar: W('s01', '별이'), quasar1: W('s01', '퀘이사에'), ask: W('s01', '알아볼까요'),
  scope: W('s02', '망원경'), faint: W('s02', '흐린'), oneStar: W('s02', '별 하나'), dot: W('s02', '점은'), actually: W('s02', '사실'),
  billions: W('s02', '수십억광년'), away: W('s02', '밖에서'), galaxy2: W('s02', '은하'), whole: W('s02', '전체보다'), bright2: W('s02', '밝게'), shine2: W('s02', '빛나고'),
  y1950: W('s03', '천구백오십년대'), radio3: W('s03', '전파'), scope3: W('s03', '망원경은'), sky: W('s03', '하늘에서'), radioOut: W('s03', '전파가'),
  places: W('s03', '곳들을'), find: W('s03', '찾아'), list: W('s03', '목록을'), made: W('s03', '만들었습니다'),
  but4: W('s04', '그런데'), some: W('s04', '몇몇'), radioSrc: W('s04', '전파원에는'), galaxy4: W('s04', '은하'), instead: W('s04', '대신'),
  star4: W('s04', '별 같은'), point4: W('s04', '점 하나만'), seen: W('s04', '보였고'), itsLight: W('s04', '빛을'), spread: W('s04', '펼친'),
  band: W('s04', '띠에는'), unknown: W('s04', '정체'), lines4: W('s04', '선들이'),
  y1963: W('s05', '천구백육십삼년'), maarten: W('s05', '마르턴'), schmidt: W('s05', '슈미트는'), thoseLines: W('s05', '선들이'), hydrogen: W('s05', '수소의'),
  lineAre: W('s05', '선인데'), red: W('s05', '붉은'), pct16: W('s05', '십육퍼센트나'), shifted: W('s05', '밀려'), noticed: W('s05', '알아챘습니다'),
  looks: W('s06', '별처럼'), radioSrc6: W('s06', '전파원이라는'), meaning: W('s06', '뜻의'), english: W('s06', '영어를'), shorten: W('s06', '줄여'),
  thisObj: W('s06', '천체를'), quasarName: W('s06', '퀘이사라고'), call: W('s06', '부릅니다'),
  universe: W('s07', '우주는'), expand: W('s07', '팽창하고'), light7: W('s07', '빛이'), red7: W('s07', '붉은'), much: W('s07', '많이'),
  shifted7: W('s07', '밀린'), objects: W('s07', '천체일수록'), farther: W('s07', '더 멀리'),
  schmidt8: W('s08', '슈미트가'), quasar8: W('s08', '퀘이사는'), d24: W('s08', '이십사억광년'), away8: W('s08', '밖에'), despite: W('s08', '있는데도'),
  small8: W('s08', '작은'), scope8: W('s08', '망원경으로'), visible: W('s08', '보일'), bright8: W('s08', '밝습니다'),
  dist9: W('s09', '거리를'), retrace: W('s09', '되짚어'), compute: W('s09', '계산하면'), sun9: W('s09', '태양의'), x4t: W('s09', '사조배'),
  our: W('s09', '우리'), mw: W('s09', '은하'), wholeMW: W('s09', '전체보다'), x100: W('s09', '백배쯤'), brightL: W('s09', '밝은'),
  but10: W('s10', '그런데'), days: W('s10', '며칠'), within: W('s10', '사이에도'), brighten: W('s10', '밝아졌다'), dim: W('s10', '어두워졌다'),
  big: W('s11', '큰'), atOnce: W('s11', '한꺼번에'), brighten11: W('s11', '밝아져도'), far: W('s11', '먼 쪽'), late: W('s11', '늦게'),
  flick: W('s11', '깜빡임이'), smeared: W('s11', '뭉개지므로'), glowing: W('s11', '빛나는'), place: W('s11', '곳은'), solar: W('s11', '태양계만큼'), mustSmall: W('s11', '작아야'),
  thisSmall: W('s12', '작은'), identity: W('s12', '정체는'), galaxy12: W('s12', '은하'), center: W('s12', '한가운데'), thanSun: W('s12', '태양보다'),
  hundredsM: W('s12', '수억'), heavy: W('s12', '무거운'), bh: W('s12', '블랙홀입니다'),
  sucked: W('s13', '빨려'), gas13: W('s13', '기체는'), disk13: W('s13', '원반을'), orbit: W('s13', '돌며'), each: W('s13', '서로'), rub: W('s13', '비벼'),
  hot: W('s13', '뜨겁게'), heat: W('s13', '달아오르고'), fallen: W('s13', '떨어진'), height: W('s13', '높이만큼'), energy: W('s13', '에너지를'),
  asLight: W('s13', '빛으로'), emit: W('s13', '내놓습니다'),
  falling: W('s14', '떨어지는'), mass14: W('s14', '질량의'), p10: W('s14', '십퍼센트가'), becomeLight: W('s14', '빛이'), stars14: W('s14', '별의'),
  fusion: W('s14', '핵융합이'), p07: W('s14', '영점칠퍼센트보다'), x10: W('s14', '열배'), over14: W('s14', '넘게'), big14: W('s14', '큽니다'),
  last: W('s15', '지난'), eddington: W('s15', '에딩턴'), limitLike: W('s15', '한계처럼'), light15: W('s15', '빛은'), gas15: W('s15', '기체를'),
  pushOut: W('s15', '밀어내서'), bh15: W('s15', '블랙홀이'), heavier: W('s15', '무거울수록'), quasar15: W('s15', '퀘이사도'), brighter: W('s15', '밝게'), canShine: W('s15', '빛날'),
  y2024: W('s16', '이천이십사년'), announced: W('s16', '발표된'), most: W('s16', '가장'), brightest: W('s16', '밝다고'), quasar16: W('s16', '퀘이사는'),
  sun16: W('s16', '태양의'), x500t: W('s16', '오백조배로'), shining: W('s16', '빛나며'), perDay: W('s16', '하루에'), oneSun: W('s16', '태양 하나만큼'),
  gas16: W('s16', '기체를'), swallow: W('s16', '삼킵니다'),
  but17: W('s17', '그런데'), thisQ: W('s17', '퀘이사도'), y1980: W('s17', '천구백팔십년'), photo: W('s17', '사진에'), taken: W('s17', '찍힌'),
  y40: W('s17', '사십년'), over17: W('s17', '넘게'), ordinary: W('s17', '평범한'), asStar: W('s17', '별로'), considered: W('s17', '여겨졌습니다'),
  farLook: W('s18', '멀리'), past: W('s18', '과거를'), see: W('s18', '보는데'), quasars18: W('s18', '퀘이사는'), g10: W('s18', '백억년'),
  cosmos: W('s18', '우주에'), mostQ: W('s18', '가장'), many: W('s18', '많았고'), now: W('s18', '지금은'), rare: W('s18', '드뭅니다'),
  bhItself: W('s19', '블랙홀'), itself: W('s19', '자체가'), shines19: W('s19', '빛나는'), no: W('s19', '아닙니다'), light19: W('s19', '빛은'),
  fallIn: W('s19', '빠지기'), justBefore: W('s19', '직전'), outside: W('s19', '바깥을'), orbiting: W('s19', '도는'), gasFrom: W('s19', '기체에서'), comes: W('s19', '나옵니다'),
  cStar: W('s20', '별처럼'), cDot: W('s20', '점 하나'), cInside: W('s20', '그 속에서는'), cHuge: W('s20', '거대한'), cBH: W('s20', '블랙홀로'),
  cFall: W('s20', '떨어지는'), cGas: W('s20', '기체가'), cGalaxy: W('s20', '은하보다'), cBright: W('s20', '밝게'), cShine: W('s20', '빛납니다'),
  cThis: W('s20', '이것이'), cQuasar: W('s20', '퀘이사입니다'),
};

/** piecewise interpolation with an ease inside each segment (flat at the nodes; no overshoot) */
const sTable = (T, x, ease = easeInOut) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const q = ease((x - T[i - 1][0]) / (T[i][0] - T[i - 1][0])); return lerp(T[i - 1][1], T[i][1], q); } return T[T.length - 1][1]; };

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const SIZE = {ballX: 300, ballY: 520, R: 140, detX: 470, v: 120};   // light speed on screen (px/s) in the size scene
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook: poster → slow drift → fast zoom-out to the eyepiece (L_EYE) by "흐린"; inset (galaxy) at "은하"
  const z0 = 6.25, z1 = at(A.faint) + 0.3;
  P.hookZoom = [z0, z1];
  P.hookL = t => (t < z0 ? L_POSTER + 0.12 * smooth((t - 1.4) / (z0 - 1.4)) : lerp(L_POSTER + 0.12, L_EYE, easeInOut((t - z0) / (z1 - z0))));
  P.eyeClose = (() => { let tt = z0; while (P.hookL(tt) < 6.55 && tt < z1) tt += 1 / 240; return tt; })();   // eyepiece circle visibly closes
  P.inset = at(A.galaxy2) - 0.35;
  // origin: dish sweep across the sky (linear in screen x) and the detection times of the catalogue sources
  const sw0 = at(A.radio3) - 0.3, sw1 = at(A.made) + 0.45;
  P.sweep = [sw0, sw1];
  P.beamX = t => lerp(170, 910, clamp((t - sw0) / (sw1 - sw0)));
  P.detect = SOURCES.map(s => sw0 + (s.x - 170) / 740 * (sw1 - sw0));
  // spectrum: lab pattern appears, then stretches ×(1+z) at "밀려"
  P.slide = [at(A.shifted) - 0.3, at(A.shifted) + 1.25];
  P.stretchQ = t => easeInOut((t - P.slide[0]) / (P.slide[1] - P.slide[0]));
  P.lock = P.slide[1];
  P.collapse = [at(A.shorten) - 0.1, at(A.shorten) + 1.2];
  // distance: scale factor of space during s07; ladder climb in log distance
  const e0 = at(A.expand) - 0.3;
  P.scaleA = t => Math.exp(0.055 * Math.max(0, t - e0));
  P.expand0 = e0;
  const l0 = at(A.schmidt8) - 0.1, l1 = at(A.d24) + 0.75, lo = Math.log10(LADDER[0].ly), hi = Math.log10(LADDER[4].ly);
  P.ladder = [l0, l1];
  P.ladderLog = t => lerp(lo, hi, clamp((t - l0) / (l1 - l0)));
  P.rungT = LADDER.map(r => l0 + (Math.log10(r.ly) - lo) / (hi - lo) * (l1 - l0));
  // brightness bars (s09)
  P.barSun = at(A.sun9) - 0.1;
  P.bar3C = [at(A.x4t) - 0.35, at(A.x4t) + 0.85];
  P.barMW = at(A.mw) - 0.25;
  P.grid100 = [at(A.x100) - 0.2, at(A.x100) + 1.3];
  // size: s10 light curve 0..20 days; s11 one ball, big then small
  P.days = [sc('size').start + 0.3, at(A.dim) + 1.2];
  P.dayOf = t => lerp(0, 20, clamp((t - P.days[0]) / (P.days[1] - P.days[0])));
  P.flashBig = at(A.brighten11) - 0.05;
  const S = SIZE, yr = S.R / S.v;                                       // seconds of screen time per light-year
  P.yrSec = yr;
  P.arriveBig = [P.flashBig + (S.detX - (S.ballX + S.R)) / S.v, P.flashBig + (S.detX - (S.ballX - S.R)) / S.v];
  P.shrink = [at(A.glowing) - 0.25, at(A.glowing) + 0.35];
  P.flashSmall = P.shrink[1] + 0.05;
  P.arriveSmall = P.flashSmall + (S.detX - (S.ballX + S.R)) / S.v;   // the small ball sits where the big ball's near side was
  // engine: zoom in from the host galaxy to the disk; tracked blob; grids; mass knob
  P.engL = t => sTable([[sc('engine').start, 6.4], [at(A.galaxy12) - 0.05, 4.8], [at(A.center) + 0.05, 4.72], [at(A.thanSun) + 0.7, L_ENG]], t);
  P.engZoom = [at(A.center) + 0.05, at(A.thanSun) + 0.7];
  const b0 = at(A.sucked) - 0.25, b1 = at(A.energy) + 0.35;
  P.blob = [b0, b1];
  P.blobR = t => lerp(0.93, DISK_IN * 1.04, clamp((t - b0) / (b1 - b0)) ** 1.55);
  { // angle by integrating ω ∝ r^−1.5 (one turn in 7 s at the outer edge)
    const dt = 1 / 120, n = Math.ceil((b1 + 0.8 - b0) / dt) + 1, Ph = new Float64Array(n); let ph = 2.2;
    for (let i = 0; i < n; i++) { Ph[i] = ph; ph += (TAU / 7) * omegaK(P.blobR(b0 + i * dt)) * dt; }
    P.blobPhi = t => { const u = (t - b0) / dt; if (u <= 0) return Ph[0] + (TAU / 7) * omegaK(0.93) * u * dt; if (u >= n - 1) return Ph[n - 1]; const i = Math.floor(u); return lerp(Ph[i], Ph[i + 1], u - i); };
  }
  P.rub = at(A.each) - 0.15;
  P.wellSwap = at(A.fallen) - 0.45;
  P.drop = [at(A.falling) - 0.25, at(A.falling) + 0.75];
  P.lit10 = [at(A.p10) - 0.1, at(A.p10) + 0.9];
  P.fus = at(A.fusion) - 0.3; P.lit07 = at(A.p07) + 0.35; P.ratio = at(A.x10) - 0.1;
  P.push = at(A.pushOut) - 0.35;
  const m0 = at(A.heavier) - 0.2, m1 = at(A.heavier) + 1.3, q0 = at(A.quasar15) - 0.2, q1 = at(A.brighter) + 0.6;
  P.mass = [m0, m1]; P.qBright = [q0, q1];
  P.knobM = t => M_3C273 * 10 ** smooth((t - m0) / (m1 - m0));
  P.knobL = t => L_3C273 * 10 ** smooth((t - q0) / (q1 - q0));
  // brightest: brightness counter (3C 273 → J0529), days swallowing suns, the 1980 plate
  const j0 = at(A.sun16) - 0.3, j1 = at(A.x500t) + 0.5;
  P.jL = [j0, j1];
  P.jBright = t => 10 ** lerp(Math.log10(L_3C273), Math.log10(J0529.L), easeInOut((t - j0) / (j1 - j0)));
  P.daySwap = at(A.perDay) - 0.45;
  P.dayT = [0, 1, 2, 3, 4].map(k => at(A.perDay) + 0.15 + k * 0.58);
  P.plate = at('s17') - 0.75;
  P.years = [at(A.y40) - 0.1, at(A.considered) + 0.25];
  P.relabel = P.years[1] + 0.15;
  // cosmic time: look-back cursor, then the density curve drawn from the Big Bang to now
  P.look = [at(A.farLook) - 0.1, at(A.see) + 0.2];
  P.drawAge = t => sTable([[at(A.quasars18) - 0.25, 0.15], [at(A.many) + 0.05, QSO_PEAK_AGE], [at(A.rare) + 0.15, T_NOW]], t, x => x);
  P.peakT = at(A.many) + 0.05;
  // myth: blob r(t) 6 → 3 (ISCO) → hold → plunge to the horizon
  const y0 = at(A.light19) - 0.45, y1 = at(A.justBefore) + 0.25, y2 = at(A.outside) + 0.5, y3 = at(A.comes) + 0.45;
  P.myth = [y0, y1, y2, y3];
  P.mythR = t => (t < y1 ? lerp(6, 3.05, smooth((t - y0) / (y1 - y0))) : t < y2 ? 3.05 - 0.05 * (t - y1) / (y2 - y1) : lerp(3.0, 1.0, easeIn((t - y2) / (y3 - y2)) ** 0.8));
  { const dt = 1 / 120, n = Math.ceil((y3 + 1 - y0) / dt) + 1, Ph = new Float64Array(n); let ph = -0.6;
    for (let i = 0; i < n; i++) { Ph[i] = ph; ph += 1.6 * (P.mythR(y0 + i * dt) / 3) ** -1.5 * dt; }
    P.mythPhi = t => { const u = (t - y0) / dt; if (u <= 0) return Ph[0]; if (u >= n - 1) return Ph[n - 1]; const i = Math.floor(u); return lerp(Ph[i], Ph[i + 1], u - i); };
  }
  P.mythPeak = (() => { let best = y0, bv = -1; for (let tt = y0; tt < y3; tt += 1 / 120) { const v = blobSeen(P.mythR(tt)); if (v > bv) { bv = v; best = tt; } } return best; })();
  // close: eyepiece → zoom in to the poster scale
  const c0 = at(A.cInside) - 0.3, c1 = at(A.cFall) + 0.25;
  P.closeZoom = [c0, c1];
  P.closeL = t => lerp(L_EYE, L_POSTER, easeInOut((t - c0) / (c1 - c0)));
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
const occlude = (c, x, y, r, a = 1) => withAlpha(c, a, () => circle(c, x, y, r * 0.995, '#000507'));

// background star field (fixed screen stars; faded during the zooms, where the world's own stars take over)
const FIELD = (() => { const R = rng(77), s = []; for (let i = 0; i < 300; i++) s.push({x: R() * 1080, y: R() * 1920, r: 0.5 + 1.5 * R() ** 3, a: 0.12 + 0.5 * R() ** 2, c: R()}); return s; })();
function fieldAlpha(t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook') return 1 - smooth((P.hookL(t) - L_POSTER - 0.2) / 0.6);
  if (id === 'close') return 1 - smooth((P.closeL(t) - L_POSTER - 0.2) / 0.6);
  if (id === 'engine') return 0.55 * (1 - smooth((P.engL(t) - L_ENG - 0.3) / 0.6));
  if (['origin', 'spectrum', 'cosmic'].includes(id)) return 0.35;
  return 0.55;
}
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#00121C'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const k = fieldAlpha(t, ctx);
  if (k > 0.01) { for (const s of FIELD) { c.globalAlpha = s.a * k; circle(c, s.x, s.y, s.r, s.c > 0.8 ? '#FFE9C8' : s.c > 0.6 ? '#CFE0FF' : '#EAF0F6'); } c.globalAlpha = 1; }
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
const PAL = {light: '#FFD36E', hot: '#CFE3FF', warm: '#FFB36A', jet: '#A9BEFF', radio: '#7FE3C8', red: '#FF7A5C', blue: '#8FB8FF',
  limit: '#FF5A2A', gas: '#9FC8FF', good: '#9FD9C8', muted: '#8AA0A6', star: '#EAF0F6', sun: '#FFD58A', lab: '#BFE6FF', qso: '#FFC48A', grav: '#A18CFF'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
/** Korean number with ~2 significant digits: 4e12 → "4조", 5e14 → "500조", 3e8 → "3억", 33000 → "3만 3천" */
export function ko(n) {
  if (!(n > 0)) return '0';
  const p = 10 ** (Math.floor(Math.log10(n)) - 1), v = Math.round(n / p) * p;
  if (v >= 1e12) { const e = v / 1e12; return (e >= 10 ? Math.round(e).toLocaleString('en-US') : +e.toFixed(1)) + '조'; }
  if (v >= 1e8) { const e = v / 1e8; return (e >= 10 ? Math.round(e).toLocaleString('en-US') : +e.toFixed(1)) + '억'; }
  if (v >= 1e4) { const m = v / 1e4; if (m >= 10) return Math.round(m).toLocaleString('en-US') + '만'; const a = Math.floor(m), b = Math.round((m - a) * 10); return b ? `${a}만 ${b}천` : `${a}만`; }
  return v >= 10 ? Math.round(v).toLocaleString('en-US') : String(+v.toFixed(v < 1 ? 2 : 1));
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const {ctx: c} = stage, T = stage.theme;
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 900}));
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
  const L = o.len ?? 44, lam = o.lam ?? 17.6, A = o.amp ?? 6, n = 30, px = -dy, py = dx, pts = [];
  for (let k = 0; k <= n; k++) { const u = k / n, s = -L * (1 - u), wv = Math.sin(s / lam * TAU) * A * Math.sin(Math.PI * u) ** 0.5; pts.push([x + dx * s + px * wv, y + dy * s + py * wv]); }
  withAlpha(c, a, () => {
    c.save(); c.globalCompositeOperation = 'lighter';
    line(c, pts, rgba(o.col || PAL.light, 0.95), o.w ?? 3);
    glow(c, x, y, 16, o.col || PAL.light, 0.4);
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
/** disk colour for a temperature fraction Tq (1 = inner edge): deep orange → white → blue-white */
const lerp3 = (a, b, q) => [lerp(a[0], b[0], q), lerp(a[1], b[1], q), lerp(a[2], b[2], q)];
const DC = [[0.9, 0.22, 0.05], [1, 0.5, 0.16], [1, 0.8, 0.52], [0.5, 0.68, 1]];
const diskCol = Tq => (Tq >= 0.72 ? lerp3(DC[2], DC[3], clamp((Tq - 0.72) / 0.28)) : Tq >= 0.46 ? lerp3(DC[1], DC[2], (Tq - 0.46) / 0.26) : lerp3(DC[0], DC[1], clamp(Tq / 0.46)));
const hex3 = c => '#' + c.map(v => Math.round(255 * clamp(v)).toString(16).padStart(2, '0')).join('');

// =====================================================================================================
// Renderers
// =====================================================================================================
/** inclined accretion disk (outer radius R px): T ∝ ρ^−3/4 colour, differential rotation ∝ ρ^−1.5, Doppler asymmetry,
 *  far side hidden by the shadow, lensed far side over the top of the shadow, photon ring. Returns the shadow radius. */
export const DISK_W0 = 3.0, DISK_TP = 2.6;                              // texture: inner-edge angular speed (rad/s), reset period (s)
/** differentially rotating disk texture without wind-up: two layers, each reset every DISK_TP s, crossfaded (variance kept) */
function diskTex(t, ang, lr, om) {
  const TP = DISK_TP, p0 = t % TP, p1 = (t + TP / 2) % TP, c0 = Math.floor(t / TP), c1 = Math.floor((t + TP / 2) / TP);
  const w0 = 1 - Math.abs(p0 / TP * 2 - 1), w1 = 1 - w0;
  const f = (a, c) => 0.6 * tex(a / TAU * 512 + lr * 90 + c * 61, lr * 26 + c * 37) + 0.4 * tex(a / TAU * 1024 + lr * 230 + c * 23, lr * 60 + 31 + c * 11);
  const b = w0 * f(ang - p0 * om, c0) + w1 * f(ang - p1 * om, c1);
  return 0.5 + (b - 0.5) / Math.sqrt(w0 * w0 + w1 * w1);
}
function diskGlow(gb, t, cx, cy, R, o = {}) {
  const cosI = o.cosI ?? 0.27, lum = o.lum ?? 1, rs = R * (o.rsF ?? 0.11), rIn = R * (o.rInF ?? DISK_IN), hot = o.hot ?? 0, spin = o.spin ?? 1;
  const {R: BR, G: BG, B: BB} = gb, yExt = Math.max(R * cosI, rs * 2.4) + 24, W0 = DISK_W0 * spin;
  gb.each(cx - R - 16, cy - yExt, cx + R + 16, cy + yExt, (x, y, i) => {
    const dx = x - cx, dy = y - cy, X = dx, Y = dy / cosI, rho = Math.hypot(X, Y), d = Math.hypot(dx, dy);
    let r = 0, g = 0, b = 0;
    if (rho >= rIn * 0.9 && rho <= R && !(d < rs && dy < 0)) {
      const q = Math.min(1, rIn / rho), lr = Math.log(rho / R);
      const sp = clamp(diskTex(t, Math.atan2(Y, X), lr, W0 * q ** 1.5));
      const dop = 1 + 0.55 * (X / rho) * Math.sqrt(q);
      const edge = smooth((R - rho) / (R * 0.28)) * smooth((rho - rIn * 0.9) / (rIn * 0.16));
      const e = lum * q ** 1.75 * (1 - 0.62 * Math.sqrt(q)) * 5.6 * (0.3 + 1.35 * sp * sp) * dop * edge;
      const col = diskCol(clamp(q ** 0.75 * (1 + 0.12 * (X / rho) * Math.sqrt(q)) + hot));
      r += e * col[0]; g += e * col[1]; b += e * col[2];
    }
    if (d > rs && d < rs * 2.4) {                                      // lensed far side (schematic)
      const u = (d - rs * 1.05) / (rs * 1.15);
      if (u > 0 && u < 1) {
        const w = (Math.max(0, -dy / d) ** 0.55 + 0.22 * Math.max(0, dy / d) ** 3) * smooth(u / 0.1) * smooth((1 - u) / 0.55);
        if (w > 0.002) {
          const rho2 = rIn * (1 + u * 2.4), q2 = rIn / rho2;
          const sp2 = 0.5 * clamp(diskTex(t, Math.atan2(dy, dx), Math.log(rho2 / R), W0 * q2 ** 1.5)) + 0.5;
          const e2 = 0.85 * lum * q2 ** 1.75 * (1 - 0.55 * Math.sqrt(q2)) * 5.4 * w * (0.4 + sp2) * (1 + 0.35 * dx / d);
          const col = diskCol(clamp(q2 ** 0.75 + hot));
          r += e2 * col[0]; g += e2 * col[1]; b += e2 * col[2];
        }
      }
    }
    const pr = Math.exp(-(((d - rs * 1.03) / Math.max(1.3, rs * 0.04)) ** 2)) * 0.95 * lum;
    if (pr > 0.002) { r += pr; g += pr * 0.88; b += pr * 0.78; }
    BR[i] += r; BG[i] += g; BB[i] += b;
  });
  return rs;
}
/** two jets along the disk axis (vertical on screen); constant opening angle, knots moving outward in log distance */
function jetGlow(gb, t, cx, cy, k, lenPx, I, Rd, cosI, rs) {
  const {R, G, B} = gb, base = 0.0009 * k, tanA = 0.03, lgMin = -2.6, sp = 0.42, inv = 1 / k;
  for (const sg of [-1, 1]) {
    const yEnd = clamp(cy + sg * lenPx, -20, 1940), wEnd = base + lenPx * tanA + 2;
    const boost = sg < 0 ? 1.45 : 0.9;
    const y0 = Math.min(cy, yEnd), y1 = Math.max(cy, yEnd);
    gb.each(cx - Math.min(wEnd, 260) * 3, y0, cx + Math.min(wEnd, 260) * 3, y1, (x, y, i) => {
      const s = Math.abs(y - cy); if (s < rs * 0.7) return;
      const w = 1.6 + base + s * tanA, dx = x - cx, across = Math.exp(-((dx / w) ** 2));
      if (across < 0.004) return;
      const sl = Math.max(s * inv, 1e-4), lg = Math.log10(sl);
      const ph = (lg - lgMin - t * 0.3) / sp, f = ph - Math.floor(ph), kn = Math.floor(ph);
      const knot = (0.5 + 0.8 * rand(kn * 3.7 + sg)) * Math.exp(-(((Math.min(f, 1 - f) * sp) / 0.09) ** 2));
      const turb = 0.55 + 0.45 * tex(lg * 260 - t * 16, dx / w * 2.2 + sg * 50) + 0.25 * tex(lg * 70 - t * 5, dx / w * 4 + 9);
      let e = I * boost * (1 + s / 40) ** -0.5 * (0.8 + 0.55 * knot) * turb * across * smooth((lenPx - s) / (lenPx * 0.35)) * smooth((s - rs * 0.7) / (rs * 0.8 + 2));
      if (sg > 0 && (dx / Rd) ** 2 + ((y - cy) / (Rd * cosI)) ** 2 < 1) e *= 0.22;   // the far jet's base behind the disk
      const core = across ** 3;
      R[i] += e * (0.5 + 0.35 * core); G[i] += e * (0.6 + 0.3 * core); B[i] += e * 1.0;
    });
  }
}
const GAL = {cosG: 0.42, pa: -0.5};
/** host galaxy at world scale k (px per ly): bulge + two-armed disk (schematic) */
function galaxyGlow(gb, t, cx, cy, k, I, rsHole = 0) {
  const RG = WORLD.gal * k; if (RG < 1.5 || I <= 0) return;
  if (RG < 9) { gb.splat(cx, cy, RG * 1.8 + 2, [1, 0.86, 0.68], 0.3 * I); return; }
  const cp = Math.cos(GAL.pa), sp = Math.sin(GAL.pa), ext = RG * 1.02, inv = 1 / k, {R, G, B} = gb, h2 = rsHole * rsHole;
  gb.each(cx - ext, cy - ext, cx + ext, cy + ext, (x, y, i) => {
    const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < h2) return;
    const u = dx * cp + dy * sp, v = (-dx * sp + dy * cp) / GAL.cosG, r = Math.hypot(u, v) * inv;
    if (r > WORLD.gal) return;
    const bul = 1.15 * Math.exp(-3.4 * (r / 3800) ** 0.6);
    const ph = Math.atan2(v, u), lr = Math.log(Math.max(r, 300) / 2500);
    const arm = (0.5 + 0.5 * Math.cos(2 * ph - lr * 3.4 + 0.4)) ** 3;
    const n = tex(u * inv / 600 + 13, v * inv / 600 + 7);
    const dsk = Math.exp(-r / 13000) * (0.18 + 1.25 * arm * (0.4 + n)) * smooth((WORLD.gal - r) / 12000) * smooth((r - 800) / 2500);
    const e = I * 0.5;
    R[i] += e * (bul + dsk * 0.66); G[i] += e * (bul * 0.8 + dsk * 0.76); B[i] += e * (bul * 0.56 + dsk * 1.0);
  });
}
const GSTARS = (() => { const R = rng(273), s = []; for (let i = 0; i < 1100; i++) s.push({r: 10 ** lerp(0.8, 4.72, R()), ph: R() * TAU, b: 0.3 + 0.7 * R() ** 2, c: R()}); return s; })();
const EYESTARS = (() => { const R = rng(4351), s = []; while (s.length < 46) { const x = R() * 2 - 1, y = R() * 2 - 1, d = Math.hypot(x, y); if (d > 0.95 || d < 0.16) continue; s.push({x, y, m: R() ** 2.2, c: R()}); } return s; })();
/** the zoomable world: disk + jets + host galaxy + galaxy stars + eyepiece. o: {L, cx, cy, a, jets, lum, hot, eyeR, eye, haze, blobs} */
function world(stage, t, o) {
  const c = stage.ctx, {L, cx, cy} = o, a = o.a ?? 1, k = pxPerLy(L), Rd = WORLD.disk * k, rs = Rd * 0.11;
  const eye = o.eye ?? smooth((L - 6.05) / 0.8);
  if (a <= 0) return;
  // nuclear haze around the disk at small scales (host-galaxy light seen from inside); fades as the galaxy itself appears
  const hz = (o.haze ?? 1) * (1 - smooth((L - 1.2) / 1.6));
  if (hz > 0) withAlpha(c, a * hz, () => { const g = c.createRadialGradient(cx, cy, 30, cx, cy, 820); g.addColorStop(0, 'rgba(255,190,130,0.09)'); g.addColorStop(0.35, 'rgba(200,150,120,0.04)'); g.addColorStop(1, 'rgba(120,100,120,0)'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920); });
  if (Rd > 6) occlude(c, cx, cy, rs, a);
  const gb = glowBuf();
  const gI = (o.gal ?? 1) * smooth((L - 3.0) / 1.2) * (1 - 0.35 * eye);
  if (gI > 0) galaxyGlow(gb, t, cx, cy, k, gI, Rd > 6 ? rs : 0);
  if (Rd > 5) diskGlow(gb, t, cx, cy, Rd, {lum: o.lum ?? 1, cosI: o.cosI ?? 0.27, hot: o.hot ?? 0, spin: o.spin ?? 1});
  const coreQ = 1 - smooth((Rd - 5) / 40);                             // unresolved disk: a point of the same total light
  if (coreQ > 0) {
    gb.splat(cx, cy, lerp(10, 4.5, eye), [1, 0.97, 0.93], 2.4 * coreQ * (1 - 0.5 * eye) * (o.lum ?? 1));
    gb.splat(cx, cy, lerp(52, 13, eye), [0.95, 0.9, 1], 0.32 * coreQ * (1 - 0.72 * eye) * (o.lum ?? 1));
  }
  const jA = (o.jets ?? 1) * (1 - smooth((L - 5.3) / 0.7));
  if (jA > 0.005) jetGlow(gb, t, cx, cy, k, WORLD.jet * k, 0.75 * jA, Math.max(Rd, 1), o.cosI ?? 0.27, Math.max(rs, 0.5));
  gb.flush(stage, {gain: 1.35, bloom: o.bloom ?? 0.22, alpha: a, cross: 0.02});
  if (Rd > 12) shadowDark(c, cx, cy, rs, WORLD.disk * k * DISK_IN * (o.cosI ?? 0.27), a);
  // galaxy stars (log-uniform in radius → a similar number on screen at every zoom level)
  const sA = a * smooth((L - 0.7) / 0.9) * (1 - eye) * (o.stars ?? 1);
  if (sA > 0.01) {
    const cp = Math.cos(GAL.pa), sp = Math.sin(GAL.pa);
    for (const s of GSTARS) {
      const rp = s.r * k; if (rp < 16 || rp > 1700) continue;
      const u = Math.cos(s.ph) * rp, v = Math.sin(s.ph) * rp * GAL.cosG, x = cx + u * cp - v * sp, y = cy + u * sp + v * cp;
      if (x < -4 || x > 1084 || y < -4 || y > 1924) continue;
      const al = sA * s.b * smooth((rp - 16) / 40) * (1 - 0.6 * smooth((L - 4.2) / 0.8));
      circle(c, x, y, 0.7 + 1.1 * s.b, rgba(s.c > 0.7 ? '#FFE2C0' : s.c > 0.45 ? '#DCE6FF' : '#F2F0EA', al));
    }
  }
  if (o.blobs) diskBlobs(c, t, cx, cy, Rd, o.cosI ?? 0.27, rs, o.blobs * a * smooth((Rd - 60) / 80));
  if (eye > 0) eyepiece(stage, t, cx, cy, o.eyeR ?? lerp(1300, 400, eye), eye * a);
}
/** keep the shadow black after the bloom pass (only above the near side of the disk, which passes in front of it) */
function shadowDark(c, cx, cy, rs, yNear, a = 1) {
  c.save(); c.beginPath(); c.rect(cx - rs, cy - rs, 2 * rs, rs + yNear * 0.92); c.clip();
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, rs * 0.97); g.addColorStop(0, `rgba(0,3,5,${0.95 * a})`); g.addColorStop(0.8, `rgba(0,3,5,${0.85 * a})`); g.addColorStop(1, 'rgba(0,3,5,0)');
  circle(c, cx, cy, rs * 0.97, g); c.restore();
}
function eyepiece(stage, t, ex, ey, rE, e) {
  const c = stage.ctx;
  c.save(); c.beginPath(); c.rect(0, 0, 1080, 1920); c.arc(ex, ey, rE, 0, TAU, true); c.fillStyle = rgba('#010203', e); c.fill('evenodd'); c.restore();
  withAlpha(c, e, () => {
    const g = c.createRadialGradient(ex, ey, rE * 0.8, ex, ey, rE); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    circle(c, ex, ey, rE, g);
    ring(c, ex, ey, rE + 5, '#1E2E36', 10); ring(c, ex, ey, rE + 11, rgba('#3A4E58', 0.7), 2);
    for (const s of EYESTARS) {
      const x = ex + s.x * rE, y = ey + s.y * rE, col = s.c > 0.75 ? '#FFE4C4' : s.c > 0.5 ? '#D8E4FF' : '#F4F2EC';
      glow(c, x, y, 5 + 13 * s.m, col, 0.28 + 0.4 * s.m); circle(c, x, y, 0.9 + 2.2 * s.m, rgba(col, 0.55 + 0.45 * s.m));
    }
  });
}
/** gas blobs spiralling inward on the disk plane (ω ∝ r^−1.5, closed form) with short trails; colour = local temperature */
const BLOB_T = 5.2, BLOB_DT = 0.17;
function blobAt(k, tau) {
  const r0 = 0.97 - 0.05 * rand(k * 1.7), x = 1 - tau / BLOB_T, r = r0 * Math.max(x, 1e-6) ** (2 / 3);
  const ph = rand(k * 0.73) * TAU - (TAU / 7) * BLOB_T * r0 ** -1.5 * Math.log(Math.max(x, 1e-6));
  return [r, ph];
}
function diskBlobs(c, t, cx, cy, R, cosI, rs, a) {
  if (a <= 0.01) return;
  const k1 = Math.floor(t / BLOB_DT), tEnd = BLOB_T * (1 - (DISK_IN / 0.95) ** 1.5);
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let k = k1 - Math.ceil(BLOB_T / BLOB_DT); k <= k1; k++) {
    const tau = t - k * BLOB_DT; if (tau < 0 || tau > tEnd) continue;
    const pts = [];
    for (let j = 0; j < 7; j++) { const tt = Math.max(0, tau - j * 0.05); const [r, ph] = blobAt(k, tt); pts.push([cx + Math.cos(ph) * r * R, cy + Math.sin(ph) * r * R * cosI, r, ph]); }
    const [x, y, r, ph] = pts[0];
    if (Math.sin(ph) < 0 && Math.hypot(x - cx, y - cy) < rs * 1.1) continue;   // behind the shadow
    const col = hex3(diskCol(clamp(tempK(r) * DISK_IN ** 0.75)));     // T ∝ r^−3/4, 1 at the inner edge
    const al = a * smooth(tau / 0.4) * smooth((tEnd - tau) / 0.25) * (0.35 + 0.65 * clamp((DISK_IN / r) ** 0.75 * 1.4));
    for (let j = 0; j < 6; j++) { c.strokeStyle = rgba(col, al * 0.3 * (1 - j / 6)); c.lineWidth = 3.2 - j * 0.35; c.beginPath(); c.moveTo(pts[j][0], pts[j][1]); c.lineTo(pts[j + 1][0], pts[j + 1][1]); c.stroke(); }
    circle(c, x, y, 2.4, rgba(col, al * 0.8));
  }
  c.restore();
}

// =====================================================================================================
// Header titles (sequential swaps)
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '퀘이사'],
  origin: ['기원 · 1950년대 전파 천문학', '전파가 나오는 곳의 목록'],
  spectrum: ['발견 · 1963년', '수소의 선이 밀려 있다'],
  distance: ['본질 · 우주 팽창', '많이 밀릴수록 멀다'],
  size: ['크기 · 깜빡임', '며칠 사이에 변하는 빛'],
  engine: ['메커니즘 · 엔진', '작은 곳의 정체'],
  brightest: ['사례 · J0529−4351', '가장 밝다고 알려진 퀘이사'],
  cosmic: ['우주의 시간', '퀘이사가 가장 많던 때'],
  myth: ['오해 바로잡기', '블랙홀이 빛날까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s04') - 0.55, '기원 · 3C 273', '별 같은 점, 낯선 선']];
  if (id === 'spectrum') return [[-Infinity, ...titles.spectrum], [at('s06') - 0.6, '이름 · 1964년', '별처럼 보이는 전파원']];
  if (id === 'distance') return [[-Infinity, ...titles.distance], [at('s08') - 0.6, '거리 · 3C 273', '약 24억 광년 밖'], [at('s09') - 0.6, '밝기 · 거리를 되짚어', '태양의 약 4조 배']];
  if (id === 'size') return [[-Infinity, ...titles.size], [at('s11') - 0.6, '크기 · 빛이 오는 시간', '깜빡임이 크기를 알려 준다']];
  if (id === 'engine') return [[-Infinity, ...titles.engine], [at('s13') - 0.6, '메커니즘 · 강착 원반', '떨어지며 달아오르는 기체'], [at('s14') - 0.6, '메커니즘 · 효율', '질량의 10%가 빛으로'], [at('s15') - 0.6, '메커니즘 · 에딩턴 한계', '무거울수록 더 밝게']];
  if (id === 'brightest') return [[-Infinity, ...titles.brightest], [at('s17') - 0.75, '사례 · 1980년 사진', '40년 넘게 별이었다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
const MORPH = [0.9, 1.7];                                               // first-frame title → header
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id;
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', '퀘이사', fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, '별처럼 보인 블랙홀', ho);
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
/** t = 0 poster title (two lines in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const y1 = lerp(TITLE_Y[0], 228, q), s1 = lerp(168, 54, q), y2 = lerp(TITLE_Y[1], 290, q), s2 = lerp(64, 30, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g = c.createLinearGradient(0, 960, 0, 1320); g.addColorStop(0, 'rgba(0,8,13,0)'); g.addColorStop(0.32, 'rgba(0,8,13,0.66)'); g.addColorStop(0.8, 'rgba(0,8,13,0.66)'); g.addColorStop(1, 'rgba(0,8,13,0)');
    c.fillStyle = g; c.fillRect(0, 960, 1080, 360);
  });
  withAlpha(c, a, () => {
    stage.text('퀘이사', 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 20});
    stage.text('별처럼 보인 블랙홀', 540, y2, {role: 'display', weight: 500, size: s2, color: PAL.light, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 14});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/quasar/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [3, 7.2, 99.5, 103.2, 150.5, 159.4]) h += (t < 10 ? P.hookL(t) : t < 110 ? P.blobR(t) * 10 + P.blobPhi(t) : t < 155 ? P.drawAge(t) : P.mythR(t));
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${P.detect[5].toFixed(3)}/${P.arriveBig[1].toFixed(3)}/${P.mythPeak.toFixed(3)}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  spectrum(stage, t, p, ctx) { spectrumScene(stage, t, ctx); },
  distance(stage, t, p, ctx) { distanceScene(stage, t, ctx); },
  size(stage, t, p, ctx) { sizeScene(stage, t, ctx); },
  engine(stage, t, p, ctx) { engineScene(stage, t, ctx); },
  brightest(stage, t, p, ctx) { brightestScene(stage, t, ctx); },
  cosmic(stage, t, p, ctx) { cosmicScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: the poster disk and jets → zoom out to one faint dot
const INSET = {x: 712, y: 1012, r: 196, L: 5.3};
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), L = P.hookL(t), ef = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const ins = easeInOut((t - P.inset) / 0.75), eye = smooth((L - 6.05) / 0.8);
  const ex = lerp(540, 352, ins), ey = lerp(700, 606, ins), eR = lerp(lerp(1300, 370, eye), 222, ins);
  world(stage, t, {L, cx: ex, cy: ey, a: ef, blobs: 1, eye, eyeR: eR});
  if (eye < 0.98) return;
  // the dot among stars: ring marker (the tracked object of this episode), distance tag
  const mA = fadeIn(t, at(A.dot) - 0.25, 0.35) * ef, rr = lerp(30, 22, ins);
  withAlpha(c, mA, () => { ring(c, ex, ey, rr + 2 * Math.sin(t * 3.2), rgba('#FFFFFF', 0.85), 2.5); ring(c, ex, ey, rr + 9, rgba('#FFFFFF', 0.25), 1.5); });
  const dA = fadeIn(t, at(A.billions) - 0.15, 0.35) * ef;
  if (ins < 0.5) {
    tag(stage, '이 점 하나', ex, ey - 64, {size: 28, color: T.ink, a: mA * (1 - ins * 2)});
    tag(stage, '수십억 광년 밖', ex, ey + 70, {size: 28, color: PAL.light, a: dA * (1 - ins * 2)});
  } else {
    tag(stage, '수십억 광년 밖', ex, ey - eR - 34, {size: 26, color: PAL.light, a: dA * smooth((ins - 0.5) / 0.5)});
  }
  tag(stage, '망원경으로 본 하늘', 540, 1262, {size: 24, color: T.muted, a: fadeIn(t, P.hookZoom[1] - 0.1, 0.4) * (1 - ins) * ef, plate: false});
  // the inset: the same dot, magnified → its galaxy, and the point at the centre outshining it
  if (ins > 0) {
    const {x, y, r} = INSET, aI = ins * ef;
    withAlpha(c, aI, () => {
      const dx = x - ex, dy = y - ey, d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d;
      line(c, [[ex + nx * rr, ey + ny * rr], [x + nx * r, y + ny * r]], rgba(T.ink, 0.35), 1.5);
      line(c, [[ex - nx * rr, ey - ny * rr], [x - nx * r, y - ny * r]], rgba(T.ink, 0.35), 1.5);
    });
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    withAlpha(c, aI, () => circle(c, x, y, r, '#02070B'));
    world(stage, t, {L: INSET.L, cx: x, cy: y, a: aI, eye: 0, gal: 1.0, jets: 0.45, stars: 0.6, lum: 1.6, bloom: 0.55});
    c.restore();
    withAlpha(c, aI, () => { ring(c, x, y, r, rgba('#FFFFFF', 0.55), 3); });
    const gA = fadeIn(t, at(A.galaxy2) + 0.1, 0.35) * ef, cA = fadeIn(t, at(A.whole) + 0.15, 0.35) * ef, bA = fadeIn(t, at(A.bright2) - 0.05, 0.4) * ef;
    if (gA > 0) { withAlpha(c, gA, () => line(c, [[x - 100, y + 52], [x - 160, y + 140]], rgba(T.ink, 0.7), 1.5)); tag(stage, '은하 전체', x - 170, y + 160, {size: 26, color: PAL.gas, a: gA}); }
    if (cA > 0) { withAlpha(c, cA, () => line(c, [[x + 14, y - 14], [x + 96, y - 176]], rgba(T.ink, 0.7), 1.5)); tag(stage, '가운데 한 점', x + 96, y - 200, {size: 26, color: T.ink, a: cA}); }
    tag(stage, '가운데 한 점이 은하 전체보다 밝다', 540, 1272, {size: 28, color: PAL.light, a: bA});
  }
}

// ------------------------------------------------------------------ origin: radio dish sweep → catalogue → a star-like point → its spectrum
const SKY = {x: 140, y: 330, w: 800, h: 400};
const SKYSTARS = (() => { const R = rng(1959), s = []; for (let i = 0; i < 70; i++) s.push({x: SKY.x + 14 + R() * (SKY.w - 28), y: SKY.y + 14 + R() * (SKY.h - 28), m: R() ** 2.4}); return s; })();
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), sw = at('s04') - 0.55;
  const a3 = fadeOut(t, sw, 0.3) * sf, a4 = fadeIn(t, sw + 0.3, 0.4) * sf;
  if (a3 > 0) withAlpha(c, a3, () => radioSweep(stage, t, ctx));
  if (a4 > 0) withAlpha(c, a4, () => starLikePoint(stage, t, ctx));
  catalogue(stage, t, ctx, sf);
}
function skyPanel(stage, fn) {
  const c = stage.ctx, T = stage.theme;
  clipRect(c, SKY.x, SKY.y, SKY.w, SKY.h, 14, () => {
    const g = c.createLinearGradient(0, SKY.y, 0, SKY.y + SKY.h); g.addColorStop(0, '#04121F'); g.addColorStop(1, '#0A2233');
    c.fillStyle = g; c.fillRect(SKY.x, SKY.y, SKY.w, SKY.h);
    fn();
  });
  rect(c, SKY.x, SKY.y, SKY.w, SKY.h, 14, null, rgba(T.border, 1), 1.5);
}
function radioSweep(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), xb = P.beamX(t), yb = SKY.y + SKY.h * 0.52, on = fadeIn(t, P.sweep[0] - 0.2, 0.3) * (t < P.sweep[1] + 0.3 ? 1 : fadeOut(t, P.sweep[1] + 0.3, 0.5));
  skyPanel(stage, () => {
    for (const s of SKYSTARS) circle(c, s.x, s.y, 0.7 + 1.4 * s.m, rgba('#EAF0F6', 0.25 + 0.5 * s.m));
    // detected radio sources: contours that stay
    SOURCES.forEach((s, k) => {
      const q = fadeIn(t, P.detect[k] - 0.05, 0.3); if (q <= 0) return;
      const fl = Math.exp(-Math.max(0, t - P.detect[k]) / 0.5);
      for (let j = 3; j >= 1; j--) withAlpha(c, q * (0.25 + 0.2 * (3 - j)) * (1 + fl), () => c.ellipse && (c.beginPath(), c.ellipse(s.x, s.y, 8 * j * (0.6 + 0.6 * s.S), 6 * j * (0.6 + 0.6 * s.S), 0.4, 0, TAU), c.strokeStyle = PAL.radio, c.lineWidth = 2, c.stroke()));
      glow(c, s.x, s.y, 30, PAL.radio, 0.35 * q * (0.4 + fl));
    });
    // beam footprint
    withAlpha(c, on, () => { glow(c, xb, yb, BEAM_W * 2.2, PAL.radio, 0.22); ring(c, xb, yb, BEAM_W, rgba(PAL.radio, 0.7), 2); });
    stage.text('하늘 (전파로 본 모습)', SKY.x + 20, SKY.y + 28, {size: 24, weight: 700, color: T.muted});
  });
  // the dish (silhouette) pointing at the beam position
  const px = 540, py = 905, ang = Math.atan2(xb - px, py - yb);
  withAlpha(c, on, () => {
    const g = c.createLinearGradient(px, py, xb, yb); g.addColorStop(0, rgba(PAL.radio, 0.18)); g.addColorStop(1, rgba(PAL.radio, 0.02));
    poly(c, [[px - 30 * Math.cos(ang), py - 30 * Math.sin(ang)], [xb - BEAM_W, SKY.y + SKY.h], [xb + BEAM_W, SKY.y + SKY.h], [px + 30 * Math.cos(ang), py + 30 * Math.sin(ang)]], g);
  });
  dish(c, T, px, py, ang);
  stage.text('전파 망원경', 540, 1006, {size: 24, weight: 700, color: T.muted, align: 'center'});
  // strip chart: the received radio power as the beam sweeps (same signal model as the sound)
  const B = {x0: 170, x1: 910, y0: 1146, y1: 1050};
  panel(c, T, 140, 1030, 800, 136, 0.82);
  stage.text('받은 전파의 세기', 160, 1052, {size: 24, weight: 700, color: PAL.radio});
  line(c, [[B.x0, B.y0], [B.x1, B.y0]], rgba(T.muted, 0.6), 1.5);
  const pts = [], xe = xb;
  for (let x = B.x0; x <= xe; x += 3) { const n = 0.05 * (tex(x * 0.9, 17) - 0.5) + 0.03 * Math.sin(x * 1.7); pts.push([x, B.y0 - 8 - 70 * (radioSignal(x) + n + 0.06)]); }
  if (pts.length > 1) line(c, pts, PAL.radio, 2.5);
  if (t > P.sweep[0]) circle(c, xe, B.y0 - 8 - 70 * (radioSignal(xe) + 0.06), 5, '#FFFFFF');
}
function dish(c, T, px, py, ang) {
  const dark = '#0C1D26', rim = rgba(T.muted, 0.9);
  // mount
  poly(c, [[px - 70, py + 80], [px - 14, py], [px + 14, py], [px + 70, py + 80]], dark, rim, 2);
  rect(c, px - 110, py + 78, 220, 14, 3, dark, rim, 2);
  c.save(); c.translate(px, py); c.rotate(ang);
  const bowl = []; for (let k = 0; k <= 30; k++) { const u = k / 30 * 2 - 1; bowl.push([u * 118, -12 - 46 * (1 - u * u)]); }
  const back = bowl.map(([x, y]) => [x * 0.92, y + 12]);
  poly(c, [...bowl, ...back.reverse()], dark, rim, 2.2);
  line(c, [[-104, -20], [0, -128]], rim, 2); line(c, [[104, -20], [0, -128]], rim, 2);
  circle(c, 0, -130, 7, '#1A2E38'); ring(c, 0, -130, 7, rim, 2);
  c.restore();
  circle(c, px, py, 9, '#1A2E38'); ring(c, px, py, 9, rim, 2);
}
/** catalogue chips (two rows of four); quasars highlighted from "몇몇" on */
function catalogue(stage, t, ctx, sf) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), hq = fadeIn(t, at(A.some) - 0.1, 0.4), focus = fadeIn(t, at(A.radioSrc) + 0.2, 0.4);
  const lA = fadeIn(t, P.detect[0] - 0.3, 0.4) * sf;
  withAlpha(c, lA, () => stage.text('3C 목록 · 케임브리지 · 1959', 150, 1196, {size: 24, weight: 700, color: T.muted}));
  SOURCES.forEach((s, k) => {
    const q = fadeIn(t, P.detect[k] - 0.05, 0.3) * sf; if (q <= 0) return;
    const x = 150 + (k % 4) * 198, y = 1240 + Math.floor(k / 4) * 58, w = 182, fl = Math.exp(-Math.max(0, t - P.detect[k]) / 0.45);
    const dim = s.q ? 1 : 1 - 0.6 * hq, hl = s.q ? hq : 0, me = s.name === '3C 273' ? focus : 0;
    withAlpha(c, q * dim, () => {
      rect(c, x, y - 22, w, 44, 8, rgba(T.plate, 0.9), hl > 0 ? rgba(mix(T.border, PAL.light, hl), 1) : rgba(T.border, 1), 1.5 + 1.5 * me);
      if (fl > 0.02) rect(c, x, y - 22, w, 44, 8, rgba(PAL.radio, 0.35 * fl));
      stage.text(s.name, x + w / 2, y, {role: 'display', size: 28, weight: 700, color: me > 0 ? mix(T.ink, PAL.light, me) : T.ink, align: 'center'});
    });
  });
}
function starLikePoint(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), cx = 540, cy = SKY.y + 200;
  const gA = fadeIn(t, at(A.galaxy4) - 0.15, 0.35), gOut = fadeIn(t, at(A.star4) - 0.1, 0.5), pA = fadeIn(t, at(A.star4) - 0.1, 0.35);
  const lA = fadeIn(t, at(A.itsLight) - 0.15, 0.4), spr = smooth((t - at(A.spread) + 0.15) / 0.7), qA = at(A.lines4);
  skyPanel(stage, () => {
    for (const s of SKYSTARS) circle(c, s.x, s.y, 0.7 + 1.4 * s.m, rgba('#EAF0F6', 0.25 + 0.5 * s.m));
    // what a radio source usually looks like in the photo: a galaxy (dashed), then the real thing: a point
    if (gA > 0) withAlpha(c, gA * (1 - 0.75 * gOut), () => {
      c.save(); c.translate(cx, cy); c.rotate(-0.4); c.scale(1, 0.5);
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 44); g.addColorStop(0, 'rgba(255,230,200,0.75)'); g.addColorStop(0.4, 'rgba(230,200,170,0.3)'); g.addColorStop(1, 'rgba(200,180,160,0)');
      circle(c, 0, 0, 44, g); c.restore();
    });
    if (pA > 0) withAlpha(c, pA, () => {
      glow(c, cx, cy, 34, '#EAF2FF', 0.7); circle(c, cx, cy, 4.2, '#FFFFFF');
      line(c, [[cx - 22, cy], [cx + 22, cy]], rgba('#FFFFFF', 0.55), 1.2); line(c, [[cx, cy - 22], [cx, cy + 22]], rgba('#FFFFFF', 0.55), 1.2);
    });
    // the radio position (dashed circle)
    withAlpha(c, fadeIn(t, ctx.tl.at('s04') - 0.3, 0.4), () => { c.setLineDash([8, 7]); ring(c, cx, cy, 70, rgba(PAL.radio, 0.9), 2.5); c.setLineDash([]); });
    stage.text('하늘 사진 (빛으로 본 모습)', SKY.x + 20, SKY.y + 28, {size: 24, weight: 700, color: T.muted});
  });
  tag(stage, '전파가 나오는 자리', cx + 92, cy - 64, {size: 24, color: PAL.radio, a: fadeIn(t, ctx.tl.at('s04') - 0.2, 0.4), align: 'left'});
  if (gA > 0) tag(stage, '보통은 은하', cx - 92, cy + 70, {size: 24, color: '#E8D2B8', a: gA * (1 - fadeIn(t, at(A.star4) - 0.45, 0.3)), align: 'right'});
  if (pA > 0) tag(stage, '별 같은 점 하나', cx - 92, cy + 70, {size: 26, color: T.ink, a: pA, align: 'right'});
  // spread the point's light: a prism and the spectrum band with lines nobody could name
  if (lA > 0) withAlpha(c, lA, () => {
    const pr = [540, 820];
    line(c, [[cx, SKY.y + SKY.h], [pr[0], pr[1] - 30]], rgba('#FFFFFF', 0.75), 3);
    poly(c, [[pr[0] - 42, pr[1] + 26], [pr[0] + 42, pr[1] + 26], [pr[0], pr[1] - 40]], rgba('#BFD8E8', 0.18), rgba('#DDEAF2', 0.9), 2);
    if (spr > 0) {
      const y0 = 900, y1 = 990, xL = lerp(540, 160, spr), xR = lerp(540, 920, spr);
      const g = c.createLinearGradient(160, 0, 920, 0); for (let k = 0; k <= 16; k++) { const nm = lerp(LAM[0], LAM[1], k / 16); g.addColorStop(k / 16, rgba(specHex(nm), 0.4)); }
      poly(c, [[pr[0] - 10, pr[1] + 24], [pr[0] + 10, pr[1] + 24], [xR, y0], [xL, y0]], rgba('#FFFFFF', 0.05));
      c.save(); c.beginPath(); c.rect(xL, y0, xR - xL, y1 - y0); c.clip();
      c.fillStyle = '#05090C'; c.fillRect(160, y0, 760, y1 - y0); c.fillStyle = g; c.fillRect(160, y0, 760, y1 - y0);
      BALMER.forEach((b, k) => { const nm = stretch(b.lab), x = lerp(160, 920, (nm - LAM[0]) / (LAM[1] - LAM[0])); glow(c, x, (y0 + y1) / 2, 30, specHex(nm), 0.5); rect(c, x - 3, y0, 6, y1 - y0, 0, mix(specHex(nm), '#FFFFFF', 0.35)); });
      c.restore();
      rect(c, 160, y0, 760, y1 - y0, 4, null, rgba(T.border, 1), 1.5);
      stage.text('빛을 펼친 띠 (스펙트럼)', 160, 1024, {size: 24, weight: 700, color: T.muted});
      stage.text('파장 →', 920, 1024, {size: 24, weight: 500, color: T.muted, align: 'right'});
    }
  });
  BALMER.forEach((b, k) => {
    const nm = stretch(b.lab), x = lerp(160, 920, (nm - LAM[0]) / (LAM[1] - LAM[0])), q = fadeIn(t, qA - 0.2 + k * 0.16, 0.3);
    if (q > 0) stage.text('?', x, 866, {role: 'display', size: 40, weight: 700, color: PAL.limit, align: 'center', alpha: q});
  });
}

// ------------------------------------------------------------------ spectrum: lab hydrogen vs 3C 273; the pattern stretches ×1.158; the name
const SPX = nm => lerp(160, 920, (nm - LAM[0]) / (LAM[1] - LAM[0]));
function specBand(stage, y0, y1, lines, o = {}) {
  const c = stage.ctx, T = stage.theme;
  c.save(); c.beginPath(); c.rect(160, y0, 760, y1 - y0); c.clip();
  c.fillStyle = '#05090C'; c.fillRect(160, y0, 760, y1 - y0);
  const g = c.createLinearGradient(160, 0, 920, 0); for (let k = 0; k <= 16; k++) { const nm = lerp(LAM[0], LAM[1], k / 16); g.addColorStop(k / 16, rgba(specHex(nm), o.cont ?? 0.22)); }
  c.fillStyle = g; c.fillRect(160, y0, 760, y1 - y0);
  for (const L of lines) { if (L.a <= 0) continue; const x = SPX(L.nm); withAlpha(c, L.a, () => { glow(c, x, (y0 + y1) / 2, 34 + 20 * (L.fl || 0), specHex(L.nm), 0.55 + 0.4 * (L.fl || 0)); rect(c, x - 3, y0, 6, y1 - y0, 0, mix(specHex(L.nm), '#FFFFFF', 0.35 + 0.4 * (L.fl || 0))); }); }
  c.restore();
  rect(c, 160, y0, 760, y1 - y0, 4, null, rgba(T.border, 1), 1.5);
}
function spectrumScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), sw = at('s06') - 0.6;
  const a5 = fadeOut(t, sw, 0.3) * sf, a6 = fadeIn(t, sw + 0.3, 0.4) * sf;
  if (a5 > 0) withAlpha(c, a5, () => linesSlide(stage, t, ctx));
  if (a6 > 0) withAlpha(c, a6, () => nameCard(stage, t, ctx));
}
function linesSlide(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), q = P.stretchQ(t), zq = Z * q;
  const nA = fadeIn(t, at(A.y1963) - 0.2, 0.4), lock = fadeIn(t, P.lock - 0.05, 0.3), lockFl = Math.exp(-Math.max(0, t - P.lock) / 0.6) * (t > P.lock - 0.05 ? 1 : 0);
  withAlpha(c, nA, () => {
    panel(c, T, 140, 318, 800, 124);
    stage.text('Maarten Schmidt', 176, 362, {role: 'display', size: 44, weight: 700, color: T.ink});
    stage.text('마르턴 슈미트 · 팔로마 5 m 망원경', 176, 412, {size: 26, weight: 500, color: T.muted});
    tag(stage, '1963', 904, 362, {size: 30, color: T.accent, role: 'display', align: 'right', plate: false});
  });
  // bands
  const yT = [560, 630], yB = [770, 840];
  const lab = BALMER.map((b, k) => ({nm: b.lab * (1 + zq), a: fadeIn(t, at(A.hydrogen) - 0.15 + k * 0.13, 0.3), fl: lockFl}));
  const qso = BALMER.map(b => ({nm: stretch(b.lab), a: 1, fl: Math.max(lockFl, Math.exp(-Math.abs(t - at(A.thoseLines) - 0.2) / 0.25) * 0.8)}));
  stage.text('실험실의 수소', 160, yT[0] - 52, {size: 26, weight: 700, color: PAL.lab, alpha: fadeIn(t, at(A.hydrogen) - 0.25, 0.3)});
  specBand(stage, yT[0], yT[1], lab);
  stage.text('3C 273의 빛', 160, yB[0] - 30, {size: 26, weight: 700, color: PAL.qso});
  specBand(stage, yB[0], yB[1], qso);
  // line names ride with the lab lines; ghosts and shift arrows show Δλ = z·λ (longer for redder lines)
  BALMER.forEach((b, k) => {
    const a = lab[k].a, x0 = SPX(b.lab), x = SPX(b.lab * (1 + zq));
    if (a <= 0) return;
    stage.text(b.n, x, yT[0] - 18, {size: 24, weight: 700, color: T.ink, align: 'center', alpha: a});
    if (q > 0.02) withAlpha(c, a, () => {
      line(c, [[x0, yT[1] + 4], [x0, yT[1] + 16]], rgba(PAL.lab, 0.8), 2);
      arrow(c, [x0, yT[1] + 12], [Math.max(x0 + 2, x), yT[1] + 12], rgba(PAL.red, 0.9), 2.5, {head: 9});
    });
    if (lock > 0) withAlpha(c, lock, () => line(c, [[x, yT[1] + 22], [x, yB[0] - 6]], rgba('#FFFFFF', 0.55 + 0.4 * lockFl), 2, {dash: [5, 6]}));
  });
  // axis + "붉은 쪽" arrow
  const yAx = yB[1] + 30;
  for (const nm of [400, 500, 600, 700]) { line(c, [[SPX(nm), yB[1] + 2], [SPX(nm), yB[1] + 10]], T.muted, 2); stage.text(String(nm), SPX(nm), yAx, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  stage.text('파장 (nm) →', 920, yAx + 32, {size: 24, weight: 500, color: T.muted, align: 'right'});
  const rA = fadeIn(t, at(A.red) - 0.15, 0.4);
  withAlpha(c, rA, () => { arrow(c, [600, 700], [900, 700], PAL.red, 4, {head: 16}); stage.text('붉은 쪽으로', 590, 700, {size: 26, weight: 700, color: PAL.red, align: 'right'}); });
  // the stretch readout and the spacing insight
  const sA = fadeIn(t, P.slide[0] + 0.2, 0.4);
  withAlpha(c, sA, () => {
    panel(c, T, 140, 940, 800, 214);
    const pct = Math.round(zq * 1000) / 10;
    stage.text(`모든 선의 파장 × ${(1 + zq).toFixed(3)}`, 540, 990, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
    stage.text(`+${pct.toFixed(1)}%`, 540, 1050, {role: 'display', size: 44, weight: 700, color: q > 0.99 ? PAL.limit : PAL.red, align: 'center'});
    const gl = 486.1 - 434.0;
    stage.text(`선 사이 간격도 같은 비율로: Hγ–Hβ ${gl.toFixed(0)} → ${(gl * (1 + zq)).toFixed(0)} nm`, 540, 1112, {size: 26, weight: 500, color: T.muted, align: 'center'});
  });
  tag(stage, '모든 선이 수소와 맞물림', 540, 1210, {size: 28, color: PAL.good, a: lock});
  tag(stage, '적색이동 z = 0.158', 540, 1272, {size: 26, color: T.ink, a: fadeIn(t, at(A.noticed) - 0.1, 0.4)});
}
const QSRC = 'quasi-stellar radio source';
function nameCard(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r);
  const f = {role: 'display', size: 50, weight: 700}, total = stage.measure(QSRC, f), x0 = 540 - total / 2, y0 = 470;
  const xs = [...QSRC].map((ch, i) => x0 + stage.measure(QSRC.slice(0, i), f));
  const ws = [...QSRC].map(ch => stage.measure(ch, f));
  const keep = [0, 1, 2, 3, 11, 12], col = smooth((t - P.collapse[0]) / (P.collapse[1] - P.collapse[0]));
  const big = {role: 'display', size: 120, weight: 700}, qw = stage.measure('quasar', big), qx0 = 540 - qw / 2, qy = 720;
  const qxs = [...'quasar'].map((ch, i) => qx0 + stage.measure('quasar'.slice(0, i), big));
  const appear = i => fadeIn(t, at(A.looks) - 0.3 + (i < 6 ? 0 : i < 14 ? 0.5 : 1.0), 0.35);
  // the six letters of "quasar" leave the phrase (a faint highlighted ghost stays in place) and close up into the word
  [...QSRC].forEach((ch, i) => {
    const kk = keep.indexOf(i);
    if (kk < 0) { stage.text(ch, xs[i], y0, {...f, color: T.ink, alpha: appear(i) * (1 - 0.45 * col)}); return; }
    const ex = easeInOut((col - 0.12) / 0.88), x = lerp(xs[i], qxs[kk], ex), y = lerp(y0, qy, easeOut(col / 0.7)), s = lerp(50, 120, ex);   // drop first, then close up and grow together
    if (col > 0) stage.text(ch, xs[i], y0, {...f, color: PAL.light, alpha: 0.22 * appear(i) * smooth(col * 6)});
    stage.text(ch, x, y, {role: 'display', size: s, weight: 700, color: mix(T.ink, PAL.light, smooth(col * 4)), alpha: appear(i)});
  });
  // glosses under the words
  const gA = 1 - smooth((t - P.collapse[0] + 0.35) / 0.3) + 0.8 * smooth((col - 0.6) / 0.2);   // step aside while the letters pass
  const wx = (a, b) => (xs[a] + xs[b] + ws[b]) / 2;
  stage.text('거의 · ~처럼', wx(0, 4), y0 + 62, {size: 26, weight: 700, color: PAL.gas, align: 'center', alpha: appear(0) * gA});
  stage.text('별의', wx(6, 12), y0 + 62, {size: 26, weight: 700, color: PAL.gas, align: 'center', alpha: appear(8) * gA});
  stage.text('전파원', wx(14, QSRC.length - 1), y0 + 62, {size: 26, weight: 700, color: PAL.gas, align: 'center', alpha: appear(20) * gA});
  if (col > 0) withAlpha(c, col, () => { for (const i of [0, 1, 2, 3, 11, 12]) { const x = xs[i] + ws[i] / 2; line(c, [[x, y0 + 30], [x, y0 + 36]], rgba(PAL.light, 0.8), 3); } });
  const kA = fadeIn(t, at(A.quasarName) - 0.15, 0.4);
  withAlpha(c, kA, () => stage.text('= 퀘이사', 540, 860, {role: 'display', size: 84, weight: 700, color: T.ink, align: 'center'}));
  const eA = fadeIn(t, P.collapse[1] - 0.2, 0.4);
  withAlpha(c, eA, () => {
    panel(c, T, 160, 950, 760, 200, 0.8);
    stage.text('quasi ← 라틴어 "거의, 마치 ~처럼"', 540, 996, {size: 26, weight: 500, color: T.ink, align: 'center'});
    stage.text('stellar ← 라틴어 stella "별"', 540, 1044, {size: 26, weight: 500, color: T.ink, align: 'center'});
    stage.text('준항성체 (準恒星體) · 별에 준하는 천체', 540, 1104, {size: 26, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.call) - 0.1, 0.4)});
  });
  tag(stage, '1964년 처음 인쇄된 이름', 540, 1206, {size: 24, color: T.muted, a: fadeIn(t, at(A.call) + 0.3, 0.4), plate: false});
}

// ------------------------------------------------------------------ distance: expanding space → log ladder → inverse square and brightness
const EXO = [540, 960];
const EXGAL = [{x: -170, y: -120, name: '가까운 은하', lab: true}, {x: 175, y: -265, name: '더 먼 은하', lab: true}, {x: -95, y: -380, name: '가장 먼 은하', lab: true},
  {x: 290, y: -90}, {x: -300, y: -300}, {x: 60, y: -150}, {x: 320, y: -420}, {x: -330, y: -60}, {x: 200, y: -500}];
const zOfD = d => 0.00075 * d;                                          // toy Hubble law for the picture (redshift ∝ distance)
function distanceScene(stage, t, ctx) {
  const c = stage.ctx, at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), s8 = at('s08') - 0.6, s9 = at('s09') - 0.6;
  const a7 = fadeOut(t, s8, 0.3) * sf, a8 = fadeIn(t, s8 + 0.3, 0.4) * fadeOut(t, s9, 0.3) * sf, a9 = fadeIn(t, s9 + 0.3, 0.4) * sf;
  if (a7 > 0) withAlpha(c, a7, () => expansion(stage, t, ctx));
  if (a8 > 0) withAlpha(c, a8, () => ladder(stage, t, ctx));
  if (a9 > 0) withAlpha(c, a9, () => brightness(stage, t, ctx));
}
function galaxyIcon(c, x, y, s, a = 1, rot = 0.5) {
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, 0.45);
    const g = c.createRadialGradient(0, 0, 0.5, 0, 0, s); g.addColorStop(0, 'rgba(255,240,220,1)'); g.addColorStop(0.25, 'rgba(230,215,255,0.55)'); g.addColorStop(1, 'rgba(150,170,255,0)');
    circle(c, 0, 0, s, g); c.restore();
  });
}
function expansion(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), a = P.scaleA(t), [ox, oy] = EXO;
  const gA = fadeIn(t, P.expand0 - 0.2, 0.5), sA = fadeIn(t, at(A.red7) - 0.2, 0.4), hA = fadeIn(t, at(A.farther) - 0.25, 0.4);
  clipRect(c, 140, 318, 800, 690, 14, () => {
    c.fillStyle = 'rgba(2,10,16,0.6)'; c.fillRect(140, 318, 800, 690);
    // comoving grid stretched by the scale factor
    withAlpha(c, 0.55, () => {
      for (let i = -9; i <= 9; i++) { const x = ox + i * 64 * a; line(c, [[x, 318], [x, 1008]], rgba(T.border, 0.9), 1); }
      for (let j = -12; j <= 1; j++) { const y = oy + j * 64 * a; line(c, [[140, y], [940, y]], rgba(T.border, 0.9), 1); }
    });
    for (const g of EXGAL) { const x = ox + g.x * a, y = oy + g.y * a; galaxyIcon(c, x, y, g.lab ? 30 : 20, g.lab ? 1 : 0.7, 0.4 + g.x * 0.003); }
    galaxyIcon(c, ox, oy, 34, 1, -0.3);
    // light from each labelled galaxy: wave packets whose wavelength stretches with the space they cross
    for (const g of EXGAL.filter(q => q.lab)) {
      const gx = ox + g.x * a, gy = oy + g.y * a, d = Math.hypot(g.x, g.y), z = zOfD(d), L = Math.hypot(gx - ox, gy - oy), dx = (ox - gx) / L, dy = (oy - gy) / L;
      for (let k = 0; k < 3; k++) {
        const ph = ((t - P.expand0 + k * 1.0 + d * 0.003) / 2.8) % 1; if (ph < 0) continue;
        const x = gx + dx * (L - 40) * ph + dx * 20, y = gy + dy * (L - 40) * ph + dy * 20, nm = 440 * (1 + z * ph * 1.6);
        photon(c, x, y, dx, dy, gA * Math.sin(Math.PI * ph) ** 0.6 * 0.9, {len: 46, lam: 14 * (1 + z * ph * 1.6), amp: 6, col: specHex(Math.min(nm, 700)), w: 2.5});
      }
    }
  });
  rect(c, 140, 318, 800, 690, 14, null, rgba(T.border, 1), 1.5);
  tag(stage, '우리 은하', ox, oy + 52, {size: 24, color: T.ink});
  tag(stage, '개념도 · 공간이 늘어남', 920, 350, {size: 24, color: T.muted, align: 'right', a: gA});
  // per-galaxy redshift strips (one hydrogen line: lab position vs received)
  EXGAL.filter(q => q.lab).forEach((g, k) => {
    const gx = ox + g.x * a, gy = oy + g.y * a, z = zOfD(Math.hypot(g.x, g.y)), qa = sA * fadeIn(t, at(A.red7) - 0.2 + k * 0.35, 0.35);
    const bx = clamp(gx + (g.x < 0 ? 40 : -150), 160, 800), by = gy - 14, w = 110;
    tag(stage, g.name, gx, gy - 44, {size: 24, color: T.ink, a: gA});
    if (qa > 0) withAlpha(c, qa, () => {
      rect(c, bx, by, w, 24, 3, '#05090C', rgba(T.border, 1), 1.2);
      const g2 = c.createLinearGradient(bx, 0, bx + w, 0); g2.addColorStop(0, rgba('#7F7FFF', 0.35)); g2.addColorStop(0.5, rgba('#7FFF9F', 0.3)); g2.addColorStop(1, rgba('#FF6F5F', 0.4));
      rect(c, bx, by, w, 24, 3, g2);
      const x0 = bx + 22, x1 = x0 + z * 230;
      line(c, [[x0, by - 4], [x0, by + 28]], rgba('#FFFFFF', 0.6), 1.5, {dash: [3, 3]});
      rect(c, x1 - 2.5, by, 5, 24, 0, '#FFFFFF');
      if (x1 - x0 > 6) arrow(c, [x0 + 2, by + 34], [x1, by + 34], PAL.red, 2.5, {head: 8});
    });
  });
  // the rule: shift ∝ distance (points from the same toy law)
  const B = {x0: 230, x1: 900, y0: 1270, y1: 1080};
  withAlpha(c, fadeIn(t, at(A.red7) - 0.3, 0.4), () => {
    panel(c, T, 140, 1040, 800, 276, 0.84);
    line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
    stage.text('거리 →', B.x1, B.y0 + 28, {size: 24, weight: 700, color: T.muted, align: 'right'});
    stage.text('붉은 쪽으로 밀린 정도', B.x0 + 14, B.y1 - 8, {size: 24, weight: 700, color: PAL.red});
    const X = d => lerp(B.x0, B.x1, d / 480), Y = z => lerp(B.y0, B.y1 + 20, z / 0.38);
    if (hA > 0) withAlpha(c, hA, () => line(c, [[X(0), Y(0)], [X(480), Y(zOfD(480))]], rgba(PAL.red, 0.8), 3, {dash: [9, 7]}));
    EXGAL.filter(q => q.lab).forEach((g, k) => { const d = Math.hypot(g.x, g.y), q = sA * fadeIn(t, at(A.red7) - 0.2 + k * 0.35, 0.35); if (q > 0) withAlpha(c, q, () => { glow(c, X(d), Y(zOfD(d)), 22, PAL.red, 0.4); circle(c, X(d), Y(zOfD(d)), 8, '#FFFFFF'); }); });
    tag(stage, '많이 밀릴수록 더 멀다', 640, 1180, {size: 28, color: T.ink, a: hA});
  });
}
const LAD = {x: 250, y0: 1000, y1: 384, lo: -5, hi: 10};
const ladY = lg => lerp(LAD.y0, LAD.y1, (lg - LAD.lo) / (LAD.hi - LAD.lo));
function ladder(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), lg = P.ladderLog(t);
  panel(c, T, 140, 318, 800, 720, 0.6);
  line(c, [[LAD.x, LAD.y0 + 10], [LAD.x, LAD.y1 - 16]], rgba(T.muted, 0.9), 3);
  for (let d = LAD.lo; d <= LAD.hi; d++) line(c, [[LAD.x - (d % 5 ? 6 : 12), ladY(d)], [LAD.x, ladY(d)]], rgba(T.muted, 0.9), 2);
  stage.text('눈금 한 칸 = 10배', LAD.x - 80, LAD.y0 + 26, {size: 24, weight: 500, color: T.muted});
  stage.text('광년 (로그 눈금)', LAD.x - 80, LAD.y1 - 40, {size: 24, weight: 700, color: T.muted});
  // the climbing light pulse and its trail
  const yC = ladY(lg), started = t > P.ladder[0];
  if (started) {
    const g = c.createLinearGradient(0, LAD.y0, 0, yC); g.addColorStop(0, rgba(PAL.light, 0.05)); g.addColorStop(1, rgba(PAL.light, 0.9));
    line(c, [[LAD.x, LAD.y0], [LAD.x, yC]], g, 6);
    glow(c, LAD.x, yC, 34, PAL.light, 0.7); circle(c, LAD.x, yC, 7, '#FFFFFF');
  }
  LADDER.forEach((r, k) => {
    const y = ladY(Math.log10(r.ly)), on = fadeIn(t, P.rungT[k] - 0.05, 0.25), fl = Math.exp(-Math.max(0, t - P.rungT[k]) / 0.4) * (t >= P.rungT[k] - 0.05 ? 1 : 0), last = k === LADDER.length - 1;
    line(c, [[LAD.x, y], [LAD.x + 46, y]], rgba(last ? T.accent : T.ink, 0.25 + 0.75 * on), 3);
    circle(c, LAD.x, y, 6 + 6 * fl, rgba(last ? T.accent : T.ink, 0.3 + 0.7 * on));
    const f = {role: 'display', size: last ? 36 : 28, weight: 700};
    stage.text(r.name, LAD.x + 60, y, {...f, color: last ? T.accent : T.ink, alpha: 0.3 + 0.7 * on});
    stage.text(r.dist, LAD.x + 72 + stage.measure(r.name, f), y + (last ? 2 : 1), {size: last ? 30 : 26, weight: 500, color: last ? PAL.light : T.muted, alpha: 0.3 + 0.7 * on});
  });
  // brightness on the sky: magnitude scale
  const mA = fadeIn(t, at(A.small8) - 0.2, 0.4), mx = m => lerp(210, 890, m / 15);
  withAlpha(c, mA, () => {
    panel(c, T, 140, 1066, 800, 250);
    stage.text('하늘에서의 밝기 (등급, 클수록 어두움)', 160, 1100, {size: 24, weight: 700, color: T.muted});
    const g = c.createLinearGradient(mx(0), 0, mx(15), 0); g.addColorStop(0, rgba('#FFF4DA', 0.9)); g.addColorStop(1, rgba('#FFF4DA', 0.05));
    rect(c, mx(0), 1150, mx(15) - mx(0), 14, 7, g);
    for (const m of [0, 5, 10, 15]) stage.text(String(m), mx(m), 1186, {size: 24, weight: 500, color: T.muted, align: 'center'});
    line(c, [[mx(6), 1140], [mx(6), 1174]], T.ink, 3);
    stage.text('맨눈 한계', mx(6), 1222, {size: 24, weight: 700, color: T.ink, align: 'center'});
    rect(c, mx(6), 1240, mx(13.5) - mx(6), 8, 4, rgba(PAL.good, 0.8));
    stage.text('작은 망원경', (mx(6) + mx(13.5)) / 2, 1278, {size: 24, weight: 700, color: PAL.good, align: 'center'});
    glow(c, mx(MAG_3C273), 1157, 30, PAL.light, 0.6); circle(c, mx(MAG_3C273), 1157, 8, '#FFFFFF');
    stage.text('3C 273 · 12.9', mx(MAG_3C273), 1222, {size: 24, weight: 700, color: PAL.light, align: 'center'});
  });
}
function brightness(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r);
  // ① inverse square: the same light through 1 cell at d and 4 cells at 2d
  const O = [214, 520], dA = 210, k = 0.27, proj = (d, y, z) => [O[0] + d + z * 0.42, O[1] - y + z * 0.3];
  const sq = d => { const h = k * d; return [proj(d, h, -h), proj(d, h, h), proj(d, -h, h), proj(d, -h, -h)]; };
  const A1 = sq(dA), B1 = sq(2 * dA);
  glow(c, O[0], O[1], 60, PAL.light, 0.6); circle(c, O[0], O[1], 9, '#FFFFFF');
  for (let i = 0; i < 4; i++) line(c, [O, B1[i]], rgba(PAL.light, 0.28), 1.5);
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 60; i++) { const u = rand(i * 1.3) * 2 - 1, v = rand(i * 2.9) * 2 - 1, ph = ((t + rand(i * 4.7) * 1.6) % 1.6) / 1.6, d = 30 + ph * 2.1 * dA, p = proj(d, v * k * d, u * k * d); circle(c, p[0], p[1], 2.4, rgba(PAL.light, 0.7 * Math.sin(Math.PI * ph))); }
  c.restore();
  poly(c, A1, rgba(PAL.light, 0.16), rgba(PAL.light, 0.9), 2.5);
  poly(c, B1, rgba(PAL.light, 0.08), rgba(PAL.light, 0.9), 2.5);
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  line(c, [mid(B1[0], B1[1]), mid(B1[3], B1[2])], rgba(PAL.light, 0.7), 1.5); line(c, [mid(B1[0], B1[3]), mid(B1[1], B1[2])], rgba(PAL.light, 0.7), 1.5);
  tag(stage, '거리 1 · 1칸', proj(dA, k * dA, 0)[0], proj(dA, k * dA, 0)[1] - 30, {size: 24, color: PAL.light});
  tag(stage, '거리 2 · 4칸, 칸마다 ¼', proj(2 * dA, k * 2 * dA, 0)[0] - 20, proj(2 * dA, k * 2 * dA, 0)[1] - 30, {size: 24, color: PAL.light});
  const rq = fadeIn(t, at(A.retrace) - 0.15, 0.4), rx = easeInOut((t - at(A.retrace) + 0.15) / 1.0);
  withAlpha(c, rq, () => {
    const yA = 735, xa = 880, xb = lerp(880, O[0] + 20, rx);
    arrow(c, [xa, yA], [xb, yA], PAL.good, 4, {head: 14});
    stage.text('우리', 880, yA + 30, {size: 24, weight: 700, color: T.ink, align: 'center'});
    stage.text('거리를 되짚어', (xa + O[0]) / 2, yA - 30, {size: 26, weight: 700, color: PAL.good, align: 'center'});
  });
  tag(stage, '받은 빛 × 거리² = 원래 밝기', 540, 790, {size: 28, color: T.ink, a: fadeIn(t, at(A.compute) - 0.1, 0.4)});
  // ② brightness bars (log): Sun, Milky Way, 3C 273
  const X = L => lerp(372, 900, Math.log10(Math.max(L, 1)) / 13), y0 = 870;
  panel(c, T, 140, 836, 800, 210, 0.8);
  for (const [L, s] of [[1, '1'], [1e4, '1만'], [1e8, '1억'], [1e12, '1조']]) { line(c, [[X(L), y0 - 16], [X(L), y0 + 136]], rgba(T.border, 0.9), 1); stage.text(s, X(L), y0 + 152, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  const rows = [
    {name: '태양', L: 1, y: y0 + 4, q: fadeIn(t, P.barSun, 0.4), col: PAL.sun},
    {name: '우리 은하 전체', L: L_MW, y: y0 + 54, q: easeOut((t - P.barMW) / 0.9), col: PAL.gas},
    {name: '3C 273', L: L_3C273, y: y0 + 104, q: clamp((t - P.bar3C[0]) / (P.bar3C[1] - P.bar3C[0])), col: PAL.light},
  ];
  for (const r of rows) {
    const Lq = r.name === '3C 273' ? 10 ** (13 * 0 + Math.log10(r.L) * easeInOut(r.q)) : 10 ** (Math.log10(r.L) * r.q);
    stage.text(r.name, 160, r.y, {size: 26, weight: 700, color: r.col, alpha: r.q > 0 ? 1 : 0.35});
    if (r.q > 0) { rect(c, X(1), r.y - 13, Math.max(6, X(Lq) - X(1)), 26, 5, rgba(r.col, 0.9)); }
  }
  const v3 = fadeIn(t, P.bar3C[1] - 0.15, 0.3);
  tag(stage, '태양의 약 4조 배', X(L_3C273) - 8, y0 + 104, {size: 26, color: '#1A1408', a: v3, plate: false, align: 'right'});
  // ③ the Milky Way × 100
  const gq = clamp((t - P.grid100[0]) / (P.grid100[1] - P.grid100[0])), n = Math.floor(gq * 100 + 1e-6), gA = fadeIn(t, P.grid100[0] - 0.2, 0.3);
  withAlpha(c, gA, () => {
    panel(c, T, 140, 1066, 800, 248, 0.84);
    stage.text('우리 은하 전체 × 100', 160, 1100, {role: 'display', size: 30, weight: 700, color: PAL.gas});
    for (let i = 0; i < 100; i++) { const cx = 246 + (i % 20) * 31, cy = 1148 + Math.floor(i / 20) * 33; if (i < n) { glow(c, cx, cy, 14, '#DCE4FF', 0.35); galaxyIcon(c, cx, cy, 15, 1, 0.5 + (i % 3) * 0.3); } else circle(c, cx, cy, 2, rgba(T.muted, 0.4)); }
    tag(stage, '= 3C 273 하나의 빛', 920, 1100, {size: 26, color: PAL.light, align: 'right', a: fadeIn(t, P.grid100[1] - 0.1, 0.4)});
  });
}

// ------------------------------------------------------------------ size: the light flickers within days → a flash of a big ball is smeared → small
function sizeScene(stage, t, ctx) {
  const c = stage.ctx, at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), sw = at('s11') - 0.55;
  const a10 = fadeOut(t, sw, 0.3) * sf, a11 = fadeIn(t, sw + 0.3, 0.4) * sf;
  if (a10 > 0) withAlpha(c, a10, () => flicker(stage, t, ctx));
  if (a11 > 0) withAlpha(c, a11, () => balls(stage, t, ctx));
}
function flicker(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), d = P.dayOf(t), b = flickerObs(d);
  const cx = 540, cy = 560, gb = glowBuf();
  gb.splat(cx, cy, 9 + 3 * b, [1, 0.97, 0.94], 0.9 * b); gb.splat(cx, cy, 40 + 26 * b, [0.9, 0.9, 1], 0.12 * b);
  gb.flush(stage, {gain: 1.3, bloom: 0.6});
  tag(stage, '3C 273', cx, cy - 110, {size: 26, color: T.ink});
  tag(stage, b > 1.6 ? '밝아짐' : '어두워짐', cx, cy + 110, {size: 26, color: b > 1.6 ? PAL.light : T.muted, a: fadeIn(t, at(A.brighten) - 0.2, 0.3)});
  // light curve over days, drawn live (same model as the dot and the sound)
  const B = {x0: 210, x1: 900, y0: 1150, y1: 850}, X = dd => lerp(B.x0, B.x1, dd / 20), Y = v => lerp(B.y0, B.y1, (v - 0.6) / 2.2);
  panel(c, T, 140, 790, 800, 450, 0.84);
  stage.text('밝기', 160, 820, {size: 24, weight: 700, color: T.muted});
  line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
  for (const dd of [0, 5, 10, 15, 20]) { line(c, [[X(dd), B.y0], [X(dd), B.y0 + 8]], T.muted, 2); stage.text(`${dd}일`, X(dd), B.y0 + 30, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  stage.text('날짜 →', B.x1, B.y0 + 64, {size: 24, weight: 700, color: T.muted, align: 'right'});
  const pts = []; for (let dd = 0; dd <= d + 1e-6; dd += 0.1) pts.push([X(dd), Y(flickerObs(dd))]);
  if (pts.length > 1) line(c, pts, PAL.light, 3.5);
  glow(c, X(d), Y(b), 26, PAL.light, 0.6); circle(c, X(d), Y(b), 6, '#FFFFFF');
  const wA = fadeIn(t, at(A.days) - 0.1, 0.4);
  if (wA > 0) withAlpha(c, wA, () => { const xa = X(7.4), xb = X(13.4), y = B.y1 - 6; line(c, [[xa, y], [xb, y]], T.ink, 2.5); line(c, [[xa, y - 8], [xa, y + 8]], T.ink, 2.5); line(c, [[xb, y - 8], [xb, y + 8]], T.ink, 2.5); stage.text('며칠', (xa + xb) / 2, y - 24, {size: 26, weight: 700, color: T.ink, align: 'center'}); });
}
function balls(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), S = SIZE;
  const shr = easeInOut((t - P.shrink[0]) / (P.shrink[1] - P.shrink[0])), small = t >= P.shrink[0];
  const R = lerp(S.R, S.R / (BIG_R_LY * YEAR_D / SMALL_R_LD), shr), bx = lerp(S.ballX, S.ballX + S.R, shr), by = S.ballY;
  const tf = small ? P.flashSmall : P.flashBig, age = t - tf;
  // stage
  panel(c, T, 140, 318, 800, 432, 0.6);
  line(c, [[S.detX, 352], [S.detX, 716]], rgba(T.ink, 0.6), 2, {dash: [6, 6]});
  stage.text('우리 쪽', S.detX + 16, 360, {size: 24, weight: 700, color: T.ink});
  arrow(c, [S.detX + 18, 392], [S.detX + 108, 392], rgba(T.ink, 0.8), 3, {head: 12});
  tag(stage, '개념도', 920, 352, {size: 24, color: T.muted, align: 'right', plate: false});
  // the ball (flashes all at once)
  const fl = age >= 0 ? Math.exp(-age / 0.35) : 0, gb = glowBuf();
  if (R > 3) {
    const g = c.createRadialGradient(bx - R * 0.3, by - R * 0.3, R * 0.1, bx, by, R);
    g.addColorStop(0, '#3B5566'); g.addColorStop(1, '#122633');
    circle(c, bx, by, R, g); ring(c, bx, by, R, rgba('#9FC8E0', 0.8), 2);
    if (fl > 0.01) { ring(c, bx, by, R, rgba('#FFFFFF', fl), 6); gb.splat(bx, by, R * 1.2, [1, 0.95, 0.85], 0.8 * fl); }
  } else {
    gb.splat(bx, by, 6, [1, 0.97, 0.92], 0.6 + 1.6 * fl); gb.splat(bx, by, 26, [0.9, 0.9, 1], 0.1 + 0.4 * fl);
  }
  // the light leaving every point of the surface toward us: the shell's image moves right at the speed of light
  if (age > 0) {
    const sh = S.v * age;
    if (R > 3) {
      for (let k = 0; k < 90; k++) {
        const th = k / 90 * TAU, x = bx + Math.cos(th) * R + sh, y = by + Math.sin(th) * R, passed = x > S.detX;
        if (x > 940) continue;
        gb.splat(x, y, 5, passed ? [0.55, 0.6, 0.7] : [1, 0.92, 0.7], passed ? 0.25 : 0.7);
      }
    } else if (bx + sh < 940) gb.splat(bx + sh, by, 7, [1, 0.92, 0.7], 0.9);
  }
  gb.flush(stage, {gain: 1.4, bloom: 0.5});
  if (age > 0 && R > 3) {
    const sh = S.v * age, nx = bx + R + sh, fx = bx - R + sh;
    if (nx < 930) { circle(c, nx, by, 7, '#FFFFFF'); }
    if (fx < 930) { circle(c, fx, by, 7, PAL.red); }
    const nA = fadeIn(t, P.flashBig + 0.3, 0.3) * (1 - shr), fA = fadeIn(t, at(A.far) - 0.1, 0.3) * (1 - shr);
    tag(stage, '가까운 쪽 빛 · 먼저', clamp(nx, 300, 820), by + 96, {size: 24, color: T.ink, a: nA * (nx < 930 ? 1 : 0.0)});
    tag(stage, '먼 쪽 빛 · 늦게', clamp(fx, 260, 820), by - 96, {size: 24, color: PAL.red, a: fA * (fx < 930 ? 1 : 0)});
  }
  tag(stage, small ? '작은 공 · 반지름 2광일' : '큰 공 · 반지름 1광년', small ? bx : bx, 690, {size: 26, color: T.ink, a: fadeIn(t, ctx.tl.at('s11') - 0.3, 0.3)});
  if (age > -0.1 && age < 1.2) tag(stage, '한꺼번에 밝아짐', bx, 400, {size: 24, color: PAL.light, a: smooth((age + 0.1) / 0.2) * (1 - smooth((age - 0.9) / 0.3))});
  // light curves: arrival time since the first light, in years (same screen time scale as the moving light)
  const B = {x0: 220, x1: 900, y0: 1000, y1: 820}, yrs = 3, X = y => lerp(B.x0, B.x1, y / yrs), hBig = 46;
  panel(c, T, 140, 776, 800, 290, 0.84);
  stage.text('우리가 받는 밝기', 920, 800, {size: 24, weight: 700, color: T.muted, align: 'right'});
  line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
  for (const y of [0, 1, 2, 3]) { line(c, [[X(y), B.y0], [X(y), B.y0 + 8]], T.muted, 2); stage.text(`${y}년`, X(y), B.y0 + 28, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  // big ball: box of 2R/c = 2 years (height = same energy spread out)
  const tb = (t - P.arriveBig[0]) / P.yrSec, bigA = 1 - 0.6 * shr;
  if (tb > -0.2) withAlpha(c, bigA, () => {
    line(c, [[X(0), B.y0], [X(0), B.y1 + 4]], rgba(T.ink, 0.6), 2, {dash: [5, 5]});
    const e = clamp(tb, 0, yrs), pts = [[X(0), B.y0]];
    if (tb > 0) { pts.push([X(0), B.y0 - hBig]); pts.push([X(Math.min(e, 2)), B.y0 - hBig]); if (e > 2) { pts.push([X(2), B.y0]); pts.push([X(e), B.y0]); } }
    line(c, pts, PAL.light, 3.5);
    if (tb > 0 && tb < yrs) circle(c, X(e), e < 2 ? B.y0 - hBig : B.y0, 6, '#FFFFFF');
  });
  tag(stage, '실제로는 한순간', X(0) + 16, B.y1 + 14, {size: 24, color: T.ink, align: 'left', a: fadeIn(t, P.arriveBig[0] + 0.1, 0.3) * (1 - shr)});
  const smA = fadeIn(t, at(A.smeared) - 0.15, 0.4) * (1 - 0.7 * shr);
  if (smA > 0) withAlpha(c, smA, () => { const y = B.y0 - hBig - 26; line(c, [[X(0), y], [X(2), y]], PAL.light, 2.5); line(c, [[X(0), y - 8], [X(0), y + 8]], PAL.light, 2.5); line(c, [[X(2), y - 8], [X(2), y + 8]], PAL.light, 2.5); stage.text('2년에 걸쳐 뭉개짐', X(1), y - 22, {size: 26, weight: 700, color: PAL.light, align: 'center'}); });
  // small ball: box of 4 days → a sharp spike, far taller (the same energy in 1/180 of the time) → off the chart
  const ts = t - P.arriveSmall;
  if (ts > 0) {
    const w = Math.max(6, X(boxDays(SMALL_R_LD) / YEAR_D) - X(0)), xs0 = X(0) + 3;   // 4 days ≈ 2.5 px on this axis: drawn 6 px wide to be seen
    glow(c, xs0 + w / 2, (B.y0 + B.y1) / 2, 60, PAL.hot, 0.35 * smooth(ts / 0.2));
    rect(c, xs0, B.y1 - 6, w, B.y0 - B.y1 + 6, 0, PAL.hot);
    arrow(c, [xs0 + w / 2, B.y1 + 20], [xs0 + w / 2, B.y1 - 18], PAL.hot, 3, {head: 12});
    tag(stage, '며칠 만에 끝 · 날카롭다', X(0) + 30, B.y1 + 20, {size: 26, color: PAL.hot, align: 'left', a: smooth(ts / 0.3)});
  }
  // conclusion: light-days compared with the Solar System
  const cA = fadeIn(t, at(A.solar) - 0.15, 0.4);
  withAlpha(c, cA, () => {
    panel(c, T, 140, 1090, 800, 226);
    stage.text('빛나는 곳 = 빛으로 며칠 거리', 540, 1128, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
    const ox = 290, oy = 1222, s = 82 / LD_AU;
    ring(c, ox, oy, LD_AU * s, rgba(PAL.hot, 0.9), 3);
    ring(c, ox, oy, HELIOPAUSE_AU * s, rgba(PAL.muted, 0.8), 2, 0, TAU);
    ring(c, ox, oy, NEPTUNE_AU * s, rgba(PAL.gas, 0.9), 2);
    circle(c, ox, oy, 4, PAL.sun);
    const rows = [['빛으로 하루 · 173', PAL.hot], ['태양권 끝 · 약 120', PAL.muted], ['해왕성 궤도 · 30', PAL.gas]];
    rows.forEach(([s2, col], k) => stage.text(s2, 420, 1186 + k * 36, {size: 26, weight: 700, color: col}));
    stage.text('(지구–태양 거리 = 1)', 420, 1294, {size: 24, weight: 500, color: T.muted});
  });
}

// ------------------------------------------------------------------ engine: zoom into the galaxy centre → disk, tracked blob, well, efficiency, Eddington
const ENG = {cx: 540, cy: 590, R: 300, cosI: 0.27};
const fmtWidth = ly => (ly >= 1e4 ? `약 ${ko(ly)} 광년` : ly >= 10 ? `약 ${Math.round(ly / 10 ** Math.floor(Math.log10(ly) - 1)) * 10 ** Math.floor(Math.log10(ly) - 1)} 광년` : ly >= 1 ? `약 ${ly.toFixed(1)} 광년` : `약 ${Math.round(ly * YEAR_D)}광일`);
function engineScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), L = P.engL(t);
  const s13 = at('s13') - 0.6, s14 = at('s14') - 0.6, s15 = at('s15') - 0.6;
  const jets = 1 - fadeIn(t, s13 - 0.2, 1.2), push = fadeIn(t, P.push, 0.5);
  world(stage, t, {L, cx: ENG.cx, cy: ENG.cy, a: sf, jets, blobs: 1, eye: 0, cosI: ENG.cosI, lum: 0.95});
  if (push > 0) pushBack(stage, t, push * sf);
  if (t < s13 + 0.6) withAlpha(c, fadeOut(t, s13, 0.3) * sf, () => engineZoomLabels(stage, t, ctx, L));
  if (t > s13 - 0.2 && t < s14 + 0.6) withAlpha(c, fadeIn(t, s13 + 0.3, 0.4) * fadeOut(t, s14, 0.3) * sf, () => accretion(stage, t, ctx));
  if (t > s14 && t < s15 + 0.6) withAlpha(c, fadeIn(t, s14 + 0.3, 0.4) * fadeOut(t, s15, 0.3) * sf, () => efficiency(stage, t, ctx));
  if (t > s15) withAlpha(c, fadeIn(t, s15 + 0.3, 0.4) * sf, () => {
    eddChart(stage, t, ctx, {M: P.knobM(t), L: P.knobL(t), name: '3C 273'});
    tag(stage, '빛이 기체를 밀어냄', 540, 760, {size: 26, color: PAL.light, a: push});
  });
}
function engineZoomLabels(stage, t, ctx, L) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r);
  const gA = fadeIn(t, at(A.galaxy12) - 0.15, 0.3) * fadeOut(t, P.engZoom[0] + 0.3, 0.3), cA = fadeIn(t, at(A.center) - 0.1, 0.25) * fadeOut(t, P.engZoom[0] + 0.6, 0.3);
  tag(stage, '은하', 300, 400, {size: 28, color: PAL.gas, a: gA});
  if (cA > 0) withAlpha(c, cA, () => { ring(c, ENG.cx, ENG.cy, 40, '#FFFFFF', 3); line(c, [[ENG.cx - 64, ENG.cy], [ENG.cx - 46, ENG.cy]], '#FFFFFF', 3); line(c, [[ENG.cx + 46, ENG.cy], [ENG.cx + 64, ENG.cy]], '#FFFFFF', 3); });
  tag(stage, '한가운데', ENG.cx, ENG.cy + 78, {size: 26, color: T.ink, a: cA});
  // scale readout during the zoom, then the black hole's mass
  const wA = fadeIn(t, ctx.scene.start + 0.2, 0.4);
  withAlpha(c, wA, () => {
    panel(c, T, 140, 1040, 800, 270, 0.84);
    stage.text('화면 가로 폭', 170, 1084, {size: 24, weight: 700, color: T.muted});
    stage.text(fmtWidth(1.125 * 10 ** L), 170, 1130, {role: 'display', size: 38, weight: 700, color: T.ink});
    const mA = fadeIn(t, at(A.hundredsM) - 0.2, 0.4);
    withAlpha(c, mA, () => {
      line(c, [[160, 1170], [920, 1170]], rgba(T.border, 1), 1.5);
      stage.text('블랙홀 질량 (3C 273)', 170, 1210, {size: 24, weight: 700, color: T.muted});
      stage.text(`태양의 약 ${ko(M_3C273)} 배`, 170, 1262, {role: 'display', size: 44, weight: 700, color: PAL.light});
    });
  });
  tag(stage, '블랙홀', ENG.cx, ENG.cy + ENG.R * ENG.cosI + 46, {size: 26, color: T.ink, a: fadeIn(t, at(A.bh) - 0.15, 0.35)});
}
/** s13: the tracked blob spirals in (ω ∝ r^−1.5, T ∝ r^−3/4); friction between rings; then the potential well */
function accretion(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), {cx, cy, R, cosI} = ENG;
  const r = P.blobR(t), ph = P.blobPhi(t), live = t < P.blob[1] + 0.05, gone = smooth((t - P.blob[1]) / 0.3);
  const tq = clamp(tempK(r) * DISK_IN ** 0.75), col = hex3(diskCol(tq)), pos = (rr, pp) => [cx + Math.cos(pp) * rr * R, cy + Math.sin(pp) * rr * R * cosI];
  // tracked blob with its trail
  if (t > P.blob[0]) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const pts = []; for (let j = 0; j <= 40; j++) { const tt = Math.max(P.blob[0], t - j * 0.03); pts.push(pos(P.blobR(tt), P.blobPhi(tt))); }
    for (let j = 0; j < 40; j++) { c.strokeStyle = rgba(col, 0.6 * (1 - j / 40) * (1 - gone)); c.lineWidth = 5 - j * 0.1; c.beginPath(); c.moveTo(...pts[j]); c.lineTo(...pts[j + 1]); c.stroke(); }
    c.restore();
    const [x, y] = pos(r, ph);
    withAlpha(c, 1 - gone, () => { glow(c, x, y, 26 + 20 * tq, col, 0.75); circle(c, x, y, 6, '#FFFFFF'); ring(c, x, y, 20 + 2 * Math.sin(t * 6), '#FFFFFF', 2.5); });
    tag(stage, '추적하는 기체 덩어리', clamp(x, 260, 820), y > cy ? y + 44 : y - 44, {size: 24, color: T.ink, a: fadeIn(t, at(A.gas13) - 0.2, 0.3) * fadeOut(t, at(A.rub) - 0.3, 0.3)});
  }
  tag(stage, '강착 원반', cx + R * 0.78, cy + R * cosI + 40, {size: 26, color: PAL.warm, a: fadeIn(t, at(A.disk13) - 0.15, 0.35)});
  // friction: inner ring faster than outer (arc arrows ∝ angular speed)
  const fA = fadeIn(t, P.rub, 0.4) * fadeOut(t, P.wellSwap, 0.3);
  if (fA > 0) withAlpha(c, fA, () => {
    for (const [rr, cl] of [[0.42, PAL.hot], [0.66, PAL.warm]]) {
      const a0 = 0.35, a1 = a0 + 0.42 * omegaK(rr) / omegaK(0.42) + 0.08 * Math.sin(t * 3), pts = [];
      for (let k = 0; k <= 24; k++) { const aa = lerp(a0, a1, k / 24); pts.push(pos(rr, aa)); }
      line(c, pts.slice(0, -1), cl, 4); arrow(c, pts[pts.length - 3], pts[pts.length - 1], cl, 4, {head: 14});
    }
    for (let k = 0; k < 6; k++) { const aa = 0.5 + k * 0.07, [x, y] = pos(0.54, aa + 0.03 * Math.sin(t * 9 + k)); glow(c, x, y, 14, '#FFE8C0', 0.5 + 0.3 * Math.sin(t * 11 + k * 2)); }
    tag(stage, '안쪽이 더 빨리 돌며 비빔 → 열', 540, 790, {size: 26, color: T.ink});
  });
  // bottom: ① graph of the model along the radius, then ② the potential well
  const gA = fadeOut(t, P.wellSwap, 0.3), wA = fadeIn(t, P.wellSwap + 0.3, 0.4);
  if (gA > 0) withAlpha(c, gA, () => radiusGraph(stage, t, ctx, r, live));
  if (wA > 0) withAlpha(c, wA, () => well(stage, t, ctx, r, col, gone));
}
function radiusGraph(stage, t, ctx, r, live) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r2 => ctx.tl.at(r2), B = {x0: 220, x1: 900, y0: 1110, y1: 880};
  const X = rr => lerp(B.x0, B.x1, (rr - DISK_IN) / (1 - DISK_IN)), Y = v => lerp(B.y0, B.y1, v);
  panel(c, T, 140, 830, 800, 486, 0.84);
  line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2); line(c, [[B.x0, B.y0], [B.x0, B.y1]], T.muted, 2);
  stage.text('안쪽 끝', B.x0, B.y0 + 28, {size: 24, weight: 500, color: T.muted, align: 'center'});
  stage.text('중심에서 거리 →', B.x1, B.y0 + 28, {size: 24, weight: 700, color: T.muted, align: 'right'});
  const om = [], te = []; for (let k = 0; k <= 60; k++) { const rr = lerp(DISK_IN, 1, k / 60); om.push([X(rr), Y(omegaK(rr) / omegaK(DISK_IN))]); te.push([X(rr), Y(tempK(rr) / tempK(DISK_IN))]); }
  const oA = fadeIn(t, at(A.orbit) - 0.2, 0.4), hA = fadeIn(t, at(A.hot) - 0.2, 0.4);
  withAlpha(c, oA, () => { line(c, om, PAL.gas, 3.5); stage.text('도는 빠르기', X(0.3) + 10, Y(omegaK(0.3) / omegaK(DISK_IN)) - 22, {size: 26, weight: 700, color: PAL.gas}); });
  withAlpha(c, hA, () => {
    for (let k = 0; k < te.length - 1; k++) line(c, [te[k], te[k + 1]], hex3(diskCol(clamp(tempK(lerp(DISK_IN, 1, k / 60)) * DISK_IN ** 0.75))), 4);
    stage.text('온도', X(0.62) + 10, Y(tempK(0.62) / tempK(DISK_IN)) - 22, {size: 26, weight: 700, color: PAL.warm});
  });
  tag(stage, '모형 곡선', 920, 862, {size: 24, color: T.muted, align: 'right', plate: false});
  if (t > P.blob[0]) {
    const x = X(r);
    line(c, [[x, B.y0], [x, B.y1 - 6]], rgba('#FFFFFF', 0.5), 2, {dash: [5, 5]});
    if (oA > 0) circle(c, x, Y(omegaK(r) / omegaK(DISK_IN)), 7, '#FFFFFF');
    if (hA > 0) circle(c, x, Y(tempK(r) / tempK(DISK_IN)), 7, '#FFFFFF');
    const r0 = P.blobR(P.blob[0]);
    stage.text('추적하는 덩어리', 170, 1196, {size: 24, weight: 700, color: T.muted});
    stage.text(`도는 빠르기 × ${(omegaK(r) / omegaK(r0)).toFixed(1)}`, 170, 1250, {role: 'display', size: 34, weight: 700, color: PAL.gas, alpha: oA});
    stage.text(`온도 × ${(tempK(r) / tempK(r0)).toFixed(1)}`, 600, 1250, {role: 'display', size: 34, weight: 700, color: PAL.warm, alpha: hA});
  }
}
function well(stage, t, ctx, r, col, gone) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r2 => ctx.tl.at(r2), x0 = 540, ytop = 900, D = 300, sx = 300;
  const Y = rr => ytop + D * (-wellPhi(rr)) - D * DISK_IN;              // rim (r = 1) at ytop
  panel(c, T, 140, 830, 800, 486, 0.84);
  stage.text('중력의 우물 (깊이 ∝ −1/거리)', 160, 862, {size: 24, weight: 700, color: T.muted});
  tag(stage, '개념도', 920, 1296, {size: 24, color: T.muted, align: 'right', plate: false});
  for (const sg of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 60; k++) { const rr = lerp(1, DISK_IN, k / 60); pts.push([x0 + sg * rr * sx, Y(rr)]); }
    line(c, pts, rgba(T.ink, 0.75), 3);
    for (let k = 1; k <= 4; k++) { const rr = 1 - k * 0.18; line(c, [[x0 + sg * rr * sx, Y(rr)], [x0 + sg * rr * sx, Y(rr) + 6]], rgba(T.muted, 0.6), 1.5); }
  }
  line(c, [[x0 - DISK_IN * sx, Y(DISK_IN)], [x0 + DISK_IN * sx, Y(DISK_IN)]], rgba(T.ink, 0.75), 3);
  circle(c, x0, Y(DISK_IN) + 18, 20, '#000000'); ring(c, x0, Y(DISK_IN) + 18, 20, rgba(PAL.warm, 0.8), 2);
  // the blob on the well (same r as on the disk); drop so far; light given off ∝ the drop
  const r0 = P.blobR(P.blob[0]), x = x0 + r * sx, y = Y(r) - 10, drop = Y(r) - Y(r0);
  const hA = fadeIn(t, at(A.height) - 0.15, 0.35);
  withAlpha(c, hA * (1 - gone * 0.6), () => {
    line(c, [[x0 + r0 * sx + 30, Y(r0)], [x0 + r0 * sx + 30, Y(r0) + drop]], PAL.light, 3);
    arrow(c, [x0 + r0 * sx + 30, Y(r0)], [x0 + r0 * sx + 30, Y(r0) + Math.max(drop, 14)], PAL.light, 3, {head: 12});
    line(c, [[x, Y(r)], [x0 + r0 * sx + 30, Y(r)]], rgba(PAL.light, 0.5), 1.5, {dash: [4, 4]});
    stage.text('떨어진 높이', x0 + r0 * sx + 30, Y(r0) - 28, {size: 24, weight: 700, color: PAL.light, align: 'center'});
  });
  withAlpha(c, 1 - gone, () => { glow(c, x, y, 26, col, 0.7); circle(c, x, y, 9, col); circle(c, x, y, 4, '#FFFFFF'); });
  const eA = fadeIn(t, at(A.energy) - 0.2, 0.4), frac = clamp(drop / (D * (1 - DISK_IN)));
  withAlpha(c, eA, () => {
    for (let k = 0; k < 10; k++) { const life = 0.9, pp = ((t + rand(k * 3.1) * life) % life) / life, ang = -Math.PI / 2 + (rand(k * 7.7) - 0.5) * 2.2, s = 16 + pp * 90; if (frac < 0.05) break; photon(c, x + Math.cos(ang) * s, y + Math.sin(ang) * s, Math.cos(ang), Math.sin(ang), Math.sin(Math.PI * pp) * (0.3 + 0.7 * frac), {len: 24, amp: 4, w: 2}); }
    stage.text('빛으로 나간 에너지', 170, 1262, {size: 24, weight: 700, color: PAL.light});
    rect(c, 400, 1250, 500, 24, 5, null, rgba(PAL.light, 0.5), 1.5);
    rect(c, 400, 1250, 500 * frac, 24, 5, PAL.light);
  });
}
/** s14: 100 cells of infalling mass; 10 become light (disk) vs 0.7 for hydrogen fusion */
function efficiency(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r);
  panel(c, T, 140, 830, 800, 486, 0.86);
  const cell = 25, gp = 2;
  const grid = (gx, gy, lit, aAll, title, pct, pctA, col) => {
    stage.text(title, gx + 5 * (cell + gp), gy - 34, {size: 26, weight: 700, color: T.ink, align: 'center', alpha: aAll});
    for (let i = 0; i < 100; i++) {
      const cx = gx + (i % 10) * (cell + gp), cy = gy + Math.floor(i / 10) * (cell + gp), dq = smooth((t - P.drop[0] - (i % 10) * 0.03 - Math.floor(i / 10) * 0.05) / 0.35);
      if (dq <= 0 || aAll <= 0) continue;
      const yy = cy - (1 - dq) * 60, L = clamp(lit - i);
      withAlpha(c, aAll * dq, () => {
        rect(c, cx, yy, cell, cell, 3, rgba('#4A6272', 0.9), rgba('#7D97A6', 0.6), 1);
        if (L > 0) { glow(c, cx + cell / 2, yy + cell / 2, 26, col, 0.5 * Math.min(1, L)); rect(c, cx, yy + cell * (1 - L), cell, cell * L, 3, col); }
      });
    }
    stage.text(pct, gx + 5 * (cell + gp), gy + 10 * (cell + gp) + 34, {role: 'display', size: 40, weight: 700, color: col, align: 'center', alpha: pctA});
  };
  const lit10 = 10 * clamp((t - P.lit10[0]) / (P.lit10[1] - P.lit10[0])), fA = fadeIn(t, P.fus, 0.4), lit07 = 0.7 * smooth((t - P.lit07) / 0.5);
  stage.text('떨어지는 질량 100칸 중 빛이 되는 몫', 540, 862, {size: 24, weight: 700, color: T.muted, align: 'center'});
  grid(172, 940, lit10, 1, '블랙홀 원반', '약 10%', fadeIn(t, P.lit10[0] + 0.3, 0.4), PAL.light);
  grid(640, 940, lit07, fA, '별의 핵융합', '0.7%', fadeIn(t, P.lit07, 0.4), PAL.sun);
  const rA = fadeIn(t, P.ratio, 0.4);
  withAlpha(c, rA, () => {
    stage.text(`약 ${Math.round(ETA_ACC / ETA_FUS)}배`, 540, 1080, {role: 'display', size: 38, weight: 700, color: T.accent, align: 'center'});
    stage.text('열 배 넘게', 540, 1124, {size: 24, weight: 700, color: T.ink, align: 'center'});
    arrow(c, [500, 1170], [452, 1170], T.accent, 3, {head: 12});
  });
}
/** s15/s16: log mass – log brightness chart with the Eddington line (L_Edd = 3.3×10⁴ L☉ per M☉) */
const EC = {x0: 250, x1: 900, y0: 1222, y1: 905, mLo: 7, mHi: 11, lLo: 11, lHi: 16};
const ecX = M => lerp(EC.x0, EC.x1, (Math.log10(M) - EC.mLo) / (EC.mHi - EC.mLo)), ecY = L => lerp(EC.y0, EC.y1, (Math.log10(L) - EC.lLo) / (EC.lHi - EC.lLo));
function eddChart(stage, t, ctx, o) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, 140, 830, 800, 486, 0.86);
  c.save(); c.beginPath(); c.rect(EC.x0, EC.y1, EC.x1 - EC.x0, EC.y0 - EC.y1); c.clip();
  for (const L of [1e12, 1e13, 1e14, 1e15]) line(c, [[EC.x0, ecY(L)], [EC.x1, ecY(L)]], rgba(T.border, 0.7), 1);
  for (const M of [1e8, 1e9, 1e10]) line(c, [[ecX(M), EC.y0], [ecX(M), EC.y1]], rgba(T.border, 0.7), 1);
  const ed = [[ecX(10 ** EC.mLo), ecY(lEdd(10 ** EC.mLo))], [ecX(10 ** EC.mHi), ecY(lEdd(10 ** EC.mHi))]];
  poly(c, [...ed, [EC.x1, EC.y1 - 10], [EC.x0, EC.y1 - 10]], rgba(PAL.limit, 0.12));
  line(c, ed, PAL.limit, 4);
  c.restore();
  line(c, [[EC.x0, EC.y0], [EC.x1, EC.y0]], T.muted, 2); line(c, [[EC.x0, EC.y0], [EC.x0, EC.y1]], T.muted, 2);
  for (const [L, s] of [[1e12, '1조'], [1e13, '10조'], [1e14, '100조'], [1e15, '1000조']]) stage.text(s, EC.x0 - 10, ecY(L), {size: 24, weight: 500, color: T.muted, align: 'right'});
  for (const [M, s] of [[1e8, '1억'], [1e9, '10억'], [1e10, '100억']]) stage.text(s, ecX(M), EC.y0 + 26, {size: 24, weight: 500, color: T.muted, align: 'center'});
  stage.text('밝기 (태양 = 1)', 160, 862, {size: 24, weight: 700, color: T.muted});
  stage.text('블랙홀 질량 (태양 = 1)', EC.x1, EC.y0 + 62, {size: 24, weight: 700, color: T.muted, align: 'right'});
  stage.text('에딩턴 한계', ecX(2.2e7) + 4, ecY(lEdd(2.2e7)) - 34, {size: 24, weight: 700, color: PAL.limit});
  // the knob: mass → limit; the quasar under it
  const {M, L} = o, x = ecX(M), yl = ecY(lEdd(M)), yq = ecY(L), a = o.a ?? 1;
  withAlpha(c, a, () => {
    line(c, [[x, EC.y0], [x, yl]], rgba(T.ink, 0.5), 2, {dash: [5, 5]});
    glow(c, x, yl, 26, PAL.limit, 0.5); circle(c, x, yl, 8, PAL.limit);
    glow(c, x, yq, 30, PAL.light, 0.6); circle(c, x, yq, 9, '#FFFFFF');
    tag(stage, o.name, x + 18, yq + 30, {size: 24, color: T.ink, align: 'left'});
    stage.text(`질량 · 태양의 ${ko(M)} 배`, 920, 862, {size: 24, weight: 700, color: T.ink, align: 'right'});
    const le = lEdd(M), p1 = 10 ** Math.floor(Math.log10(le));
    stage.text(`한계 · 태양의 약 ${ko(Math.round(le / p1) * p1)} 배`, 920, 896, {size: 24, weight: 700, color: PAL.limit, align: 'right'});
  });
}
function pushBack(stage, t, a) {
  const c = stage.ctx, {cx, cy, R, cosI} = ENG;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 14; k++) {
    const ang = k / 14 * TAU + 0.2, life = 1.4, ph = ((t + rand(k * 2.3) * life) % life) / life, rr = 1.04 + 0.32 * ph;
    const x = cx + Math.cos(ang) * rr * R, y = cy + Math.sin(ang) * rr * R * cosI, dx = Math.cos(ang), dy = Math.sin(ang) * cosI, dn = Math.hypot(dx, dy);
    withAlpha(c, a * Math.sin(Math.PI * ph), () => arrow(c, [x, y], [x + dx / dn * 34, y + dy / dn * 34], PAL.light, 3, {head: 11}));
    // gas being pushed back outward (orange)
    const xg = cx + Math.cos(ang + 0.15) * (rr + 0.08) * R, yg = cy + Math.sin(ang + 0.15) * (rr + 0.08) * R * cosI;
    circle(c, xg, yg, 3.4, rgba('#FF9E4A', a * 0.9 * Math.sin(Math.PI * ph)));
  }
  c.restore();
}

// ------------------------------------------------------------------ brightest: J0529−4351, near the limit, one Sun a day; the 1980 plate
const J = {cx: 540, cy: 600};
function brightestScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx);
  const aA = fadeOut(t, P.plate, 0.35) * sf, aB = fadeIn(t, P.plate + 0.3, 0.45) * sf;
  if (aA > 0) withAlpha(c, aA, () => brightestDisk(stage, t, ctx, aA));
  if (aB > 0) withAlpha(c, aB, () => plate1980(stage, t, ctx));
}
function brightestDisk(stage, t, ctx, alpha) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), Lj = P.jBright(t), lk = clamp(Math.log10(Lj / L_3C273) / 2.1);
  const eat = P.dayT.reduce((s, td) => s + Math.exp(-Math.max(0, t - td) / 0.3) * (t >= td ? 1 : 0), 0);
  world(stage, t, {L: L_POSTER + 0.03, cx: J.cx, cy: J.cy, a: alpha, jets: 0.25, blobs: 1, eye: 0, lum: 0.95 + 0.45 * lk + 0.35 * eat, hot: 0.12 * lk, haze: 0.6, bloom: 0.5 + 0.2 * lk});
  const nA = fadeIn(t, at(A.y2024) - 0.2, 0.4);
  withAlpha(c, nA, () => {
    stage.text('J0529−4351', 540, 352, {role: 'display', size: 46, weight: 700, color: T.ink, align: 'center'});
    stage.text('2024년 발표 · 남쪽 하늘', 540, 404, {size: 26, weight: 500, color: T.muted, align: 'center'});
  });
  // brightness counter
  const bA = fadeIn(t, P.jL[0] - 0.1, 0.4) * fadeOut(t, P.daySwap, 0.3);
  withAlpha(c, bA, () => {
    stage.text('밝기', 540, 744, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text(`태양의 약 ${ko(Lj)} 배`, 540, 792, {role: 'display', size: 48, weight: 700, color: PAL.light, align: 'center'});
  });
  const swap = P.daySwap, cA = fadeIn(t, ctx.scene.start + 0.2, 0.4) * fadeOut(t, swap, 0.3);
  if (cA > 0) withAlpha(c, cA, () => {
    eddChart(stage, t, ctx, {M: J0529.M, L: Lj, name: 'J0529−4351', a: fadeIn(t, P.jL[0], 0.4)});
    withAlpha(c, 0.55, () => { circle(c, ecX(M_3C273), ecY(L_3C273), 7, '#FFFFFF'); stage.text('3C 273', ecX(M_3C273) + 14, ecY(L_3C273) + 22, {size: 24, weight: 500, color: T.muted}); });
    const g = gammaOf(J0529.L, J0529.M);
    tag(stage, `한계의 약 ${Math.round(g * 10) * 10}%`, ecX(J0529.M) - 20, ecY(J0529.L) - 38, {size: 24, color: PAL.limit, align: 'right', a: fadeIn(t, P.jL[1] + 0.1, 0.4)});
  });
  // one Sun a day
  const dA = fadeIn(t, swap + 0.3, 0.4);
  if (dA > 0) withAlpha(c, dA, () => {
    panel(c, T, 140, 830, 800, 486, 0.86);
    const n = P.dayT.filter(td => t >= td).length;
    stage.text('하루에 태양 1개만큼', 540, 880, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'});
    stage.text(`${Math.max(n, 0)}일`, 540, 990, {role: 'display', size: 96, weight: 700, color: PAL.light, align: 'center'});
    for (let k = 0; k < 5; k++) { const x = 360 + k * 90, y = 1120, on = k < n; if (on) { circle(c, x, y, 18, rgba('#FFFFFF', 0.12)); ring(c, x, y, 18, rgba(PAL.sun, 0.4), 2); } else { glow(c, x, y, 40, PAL.sun, 0.35); sphere3(c, x, y, 18, PAL.sun); } }
    stage.text('삼킨 태양', 540, 1176, {size: 24, weight: 700, color: T.muted, align: 'center'});
    tag(stage, '1년이면 약 370개', 540, 1250, {size: 28, color: PAL.sun, a: fadeIn(t, at(A.swallow) - 0.1, 0.4)});
  });
  // suns flying into the disk (each lands at its day tick)
  P.dayT.forEach((td, k) => {
    const q = (t - (td - 0.55)) / 0.55; if (q < 0 || q > 1) return;
    const sx = 360 + k * 90, sy = 1120, e = easeIn(q), x = lerp(sx, J.cx + 40, e), y = lerp(sy, J.cy, e), r = lerp(18, 6, e);
    glow(c, x, y, 40 * (1 - 0.5 * e), PAL.sun, 0.45); sphere3(c, x, y, r, PAL.sun);
  });
  tag(stage, '비유 · 태양 1개만큼의 기체', 540, 466, {size: 24, color: T.muted, plate: false, a: dA});
}
const PLATE = {x: 160, y: 330, w: 760, h: 740};
let PLATE_CV = null;
function plateCanvas() {
  if (PLATE_CV) return PLATE_CV;
  const w = PLATE.w / 2, h = PLATE.h / 2, cv = createCanvas(w, h), cc = cv.getContext('2d'), img = cc.createImageData(w, h), R = rng(1980);
  const stars = []; for (let i = 0; i < 90; i++) stars.push({x: R() * w, y: R() * h, m: R() ** 2.6});
  stars.push({x: (560 - PLATE.x) / 2, y: (700 - PLATE.y) / 2, m: 0.42});    // the quasar: one more faint "star"
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 38 + 26 * (R() - 0.5) + 14 * (tex(x * 3.1, y * 3.1) - 0.5) + 10 * tex(x * 0.4, y * 0.4);
    for (const s of stars) { const d2 = (x - s.x) ** 2 + (y - s.y) ** 2, rr = 0.8 + 3.2 * s.m; if (d2 < 64) v += 200 * s.m * Math.exp(-d2 / (rr * rr)) + 30 * Math.exp(-d2 / 2); }
    const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = clamp(v, 0, 255); img.data[i + 2] = clamp(v * 0.94, 0, 255); img.data[i + 3] = 255;
  }
  cc.putImageData(img, 0, 0);
  return (PLATE_CV = cv);
}
function plate1980(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), qx = 560, qy = 700;
  c.save(); c.imageSmoothingEnabled = true; c.drawImage(plateCanvas(), PLATE.x, PLATE.y, PLATE.w, PLATE.h);
  // a slow drift of grain so the still photo is not frozen
  c.globalAlpha = 0.08; c.drawImage(plateCanvas(), 0, 0, PLATE.w / 2, PLATE.h / 2, PLATE.x + 2 * Math.sin(t * 7), PLATE.y + 2 * Math.cos(t * 5), PLATE.w, PLATE.h); c.restore();
  rect(c, PLATE.x, PLATE.y, PLATE.w, PLATE.h, 4, null, rgba('#C8C2B4', 0.8), 3);
  tag(stage, '1980', PLATE.x + 20, PLATE.y + 36, {size: 34, role: 'display', color: '#F0E8D8', align: 'left', a: fadeIn(t, at(A.y1980) - 0.15, 0.35)});
  tag(stage, '하늘 사진 탐사 건판', PLATE.x + PLATE.w - 20, PLATE.y + 36, {size: 24, color: '#D8D0C0', align: 'right', a: fadeIn(t, at(A.photo) - 0.15, 0.35)});
  const rA = fadeIn(t, at(A.taken) - 0.1, 0.35), rl = smooth((t - P.relabel) / 0.4), st = smooth((t - P.relabel + 0.05) / 0.3);
  withAlpha(c, rA, () => { ring(c, qx, qy, 24, rgba(rl > 0.5 ? PAL.light : '#FFFFFF', 0.9), 3); line(c, [[qx + 18, qy - 18], [qx + 70, qy - 70]], rgba('#FFFFFF', 0.7), 2); });
  if (rA > 0) {
    const [x0, w] = tag(stage, '별', qx + 76, qy - 84, {size: 30, color: '#FFFFFF', align: 'left', a: rA * (1 - 0.5 * rl)});
    strike(c, x0, x0 + w, qy - 84, st);
    tag(stage, '퀘이사 · 2023', qx + 120, qy - 84, {size: 30, color: PAL.light, align: 'left', a: rl});
  }
  // years under the "star" label
  const yA = fadeIn(t, P.years[0] - 0.2, 0.35), yr = Math.round(lerp(1980, 2023, clamp((t - P.years[0]) / (P.years[1] - P.years[0]))));
  withAlpha(c, yA, () => {
    panel(c, T, 300, 1110, 480, 170, 0.88);
    stage.text(String(t < P.years[0] ? 1980 : yr), 540, 1170, {role: 'display', size: 60, weight: 700, color: yr >= 2023 ? PAL.light : T.ink, align: 'center'});
    stage.text(yr >= 2023 ? '퀘이사로 확인' : '별로 분류된 채', 540, 1236, {size: 26, weight: 700, color: yr >= 2023 ? PAL.light : T.muted, align: 'center'});
  });
}

// ------------------------------------------------------------------ cosmic time: looking farther = earlier; the density curve (model)
const CT = {x0: 200, x1: 880, y0: 990, y1: 540};
const ctX = age => lerp(CT.x0, CT.x1, age / T_NOW), ctY = n => lerp(CT.y0, CT.y1, n);
const QDOTS = (() => { const R = rng(1963), s = []; for (let i = 0; i < 420; i++) s.push({age: 0.1 + R() * (T_NOW - 0.1), v: R(), tw: R()}); return s; })();
function cosmicScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), ag = P.drawAge(t);
  withAlpha(c, sf, () => {
    panel(c, T, 140, 330, 800, 990, 0.7);
    // look-back: farther = earlier
    const lq = easeInOut((t - P.look[0]) / (P.look[1] - P.look[0])), lA = fadeIn(t, P.look[0] - 0.1, 0.3);
    withAlpha(c, lA, () => {
      const xa = ctX(T_NOW), xb = lerp(xa, ctX(0.6), lq);
      arrow(c, [xa, 410], [xb, 410], PAL.gas, 4, {head: 16});
      stage.text('멀리 볼수록 더 옛날', (ctX(0.6) + xa) / 2, 376, {size: 26, weight: 700, color: PAL.gas, align: 'center'});
      glow(c, xb, 410, 26, PAL.gas, 0.5);
    });
    // axes
    line(c, [[CT.x0, CT.y0], [CT.x1, CT.y0]], T.muted, 2.5); line(c, [[CT.x0, CT.y0], [CT.x0, CT.y1 - 20]], T.muted, 2);
    for (const [age, s] of [[0, '빅뱅'], [T_NOW - 10, '100억 년 전'], [T_NOW - 5, '50억 년 전'], [T_NOW, '지금']]) { line(c, [[ctX(age), CT.y0], [ctX(age), CT.y0 + 10]], T.muted, 2); stage.text(s, ctX(age), CT.y0 + 32, {size: 24, weight: age === T_NOW || age === 0 ? 700 : 500, color: age === T_NOW || age === 0 ? T.ink : T.muted, align: 'center'}); }
    stage.text('퀘이사의 수 ↑', CT.x0 - 30, CT.y1 - 74, {size: 24, weight: 700, color: T.muted});
    // dots under the curve (number ∝ density), then the curve itself
    for (const d of QDOTS) {
      if (d.age > ag) continue; const n = qsoDensity(d.age); if (d.v > n) continue;
      const x = ctX(d.age), y = ctY(d.v * 0.98), a = 0.5 + 0.4 * Math.sin(t * 3 + d.tw * 20);
      glow(c, x, y, 7, PAL.light, 0.25 * a); circle(c, x, y, 1.8, rgba('#FFF2D6', a));
    }
    const pts = []; for (let age = 0.15; age <= ag + 1e-6; age += 0.05) pts.push([ctX(age), ctY(qsoDensity(age))]);
    if (pts.length > 1) line(c, pts, PAL.light, 4);
    if (ag > 0.2 && ag < T_NOW) { const x = ctX(ag), y = ctY(qsoDensity(ag)); line(c, [[x, CT.y0], [x, y]], rgba('#FFFFFF', 0.35), 2); glow(c, x, y, 26, PAL.light, 0.6); circle(c, x, y, 6, '#FFFFFF'); }
    tag(stage, '모형 곡선', ctX(6.6) + 12, ctY(qsoDensity(6.6)) - 30, {size: 24, color: T.muted, align: 'left', a: smooth((ag - 6.6) / 0.6)});
    // peak and "now"
    const pk = fadeIn(t, P.peakT - 0.15, 0.4);
    withAlpha(c, pk, () => { line(c, [[ctX(QSO_PEAK_AGE), CT.y0], [ctX(QSO_PEAK_AGE), ctY(1)]], rgba(PAL.light, 0.7), 2, {dash: [6, 6]}); });
    tag(stage, '약 100억 년 전 · 가장 많음', ctX(QSO_PEAK_AGE), ctY(1) - 34, {size: 26, color: PAL.light, a: pk});
    tag(stage, '지금은 드묾', ctX(T_NOW) - 6, ctY(qsoDensity(T_NOW)) - 40, {size: 26, color: T.ink, align: 'right', a: fadeIn(t, at(A.now) - 0.1, 0.4)});
    // markers below the axis
    COSMIC_MARKS.forEach((m, k) => {
      const q = smooth((ag - m.age) / 0.4);
      if (q <= 0) return;
      const x = ctX(m.age), ly = 1094 + (k === 1 ? 44 : 0) + (k === 2 ? 0 : 0);
      withAlpha(c, q, () => { line(c, [[x, CT.y0 + 44], [x, ly - 18]], rgba(T.ink, 0.5), 1.5); circle(c, x, CT.y0, 6, '#FFFFFF'); });
      const lab = m.id === 'J0313' ? 'J0313−1806 · 빅뱅 뒤 약 6.8억 년' : m.id === 'J0529' ? 'J0529−4351 · 가장 밝은' : '3C 273';
      tag(stage, lab, x - (m.id === 'C273' ? 0 : 8), ly, {size: 24, color: T.ink, align: m.id === 'C273' ? 'center' : 'left', a: q});
    });
    tag(stage, '흰 점: 그 퀘이사의 빛이 출발한 때', 540, 1240, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.peakT, 0.4)});
  });
}

// ------------------------------------------------------------------ myth: the hole is dark; light comes from the gas just outside
const MY = {cx: 540, cy: 790, rs: 56};
const mythApp = r => MY.rs * (2.6 + (r - 1) * 0.85);                    // apparent radius on screen (image hugs the shadow edge)
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), sf = sceneFade(t, ctx), {cx, cy, rs} = MY;
  const st = fadeIn(t, at(A.no) - 0.1, 0.5), ok = fadeIn(t, at(A.light19) - 0.15, 0.45);
  // the black hole: shadow, photon ring and a faint disk of hot gas (rIn at the innermost stable orbit, r = 3)
  const Rout = mythApp(6.3), cosI = 0.5;
  occlude(c, cx, cy, rs * 2.6, sf);
  const gb = glowBuf();
  diskGlow(gb, t, cx, cy, Rout, {cosI, lum: 0.2, rsF: rs * 2.6 / Rout, spin: 0.6, rInF: mythApp(3) / Rout});
  // the tracked blob (on the gas side); brightness = local light × g⁴, colour reddened by g
  const r = P.mythR(t), ph = P.mythPhi(t), inP = t > P.myth[0] - 0.3, seen = blobSeen(r) / blobSeen(P.mythR(P.mythPeak)), g = gRed(r);
  const bpos = (rr, pp) => { const ra = mythApp(rr), cI = lerp(cosI, 1, smooth((3 - rr) / 1.8)); return [cx + Math.cos(pp) * ra, cy + Math.sin(pp) * ra * cI]; };
  const bcol = [lerp(1, 0.95, g), lerp(0.3, 0.92, g ** 1.5), lerp(0.08, 1, g ** 2.2)];
  if (inP && r > 1.02) {
    for (let j = 8; j >= 0; j--) { const tt = t - j * 0.04, rr = P.mythR(tt), [x, y] = bpos(rr, P.mythPhi(tt)); gb.splat(x, y, 16 - j, bcol, 1.6 * seen * (1 - j / 9) * fadeIn(t, P.myth[0] - 0.3, 0.4)); }
  }
  gb.flush(stage, {gain: 1.35, bloom: 0.5, alpha: sf, cross: 0.03});
  withAlpha(c, sf, () => {
    // card
    panel(c, T, 140, 318, 800, 140);
    const w = stage.measure('블랙홀이 빛난다?', {role: 'display', size: 44, weight: 700});
    stage.text('블랙홀이 빛난다?', 540, 364, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center', alpha: 1 - 0.5 * st});
    strike(c, 540 - w / 2, 540 + w / 2, 366, st);
    stage.text('아니다 · 빛은 바깥을 도는 기체에서', 540, 424, {role: 'display', size: 32, weight: 700, color: PAL.good, align: 'center', alpha: ok});
    stage.text('그림자', cx, cy - 16, {size: 26, weight: 700, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.bhItself) - 0.1, 0.4)});
    stage.text('빛이 나오지 않음', cx, cy + 20, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.itself) - 0.1, 0.4)});
    tag(stage, '개념도', 920, 500, {size: 24, color: T.muted, align: 'right', plate: false});
    if (inP && r > 1.02) {
      const [x, y] = bpos(r, ph), near = fadeIn(t, P.mythPeak - 0.4, 0.3) * fadeOut(t, P.myth[2] + 0.2, 0.3), fade = fadeIn(t, P.myth[2] + 0.5, 0.3);
      withAlpha(c, near, () => line(c, [[x, y], [x + (x > cx ? 60 : -60), y + (y > cy ? 70 : -70)]], rgba(T.ink, 0.6), 1.5));
      tag(stage, '빠지기 직전 · 가장 밝음', clamp(x + (x > cx ? 60 : -60), 260, 820), y + (y > cy ? 92 : -92), {size: 24, color: '#FFF0D8', a: near});
      tag(stage, '빛이 약해지고 붉어짐', 540, cy + rs * 2.6 + 140, {size: 26, color: PAL.red, a: fade * (r > 1.05 ? 1 : 0.6)});
    }
    tag(stage, '빛나는 기체 원반', cx - mythApp(5.2), cy + mythApp(5.2) * cosI + 46, {size: 24, color: PAL.warm, a: fadeIn(t, at(A.orbiting) - 0.2, 0.4)});
    // meter: the light that reaches us from the blob (model), drawn over time
    const B = {x0: 220, x1: 900, y0: 1290, y1: 1180}, X = tt => lerp(B.x0, B.x1, (tt - P.myth[0]) / (P.myth[3] + 0.4 - P.myth[0])), Y = v => lerp(B.y0, B.y1, v);
    const mA = fadeIn(t, P.myth[0], 0.4);
    withAlpha(c, mA, () => {
      panel(c, T, 140, 1124, 800, 196, 0.86);
      stage.text('덩어리에서 우리에게 오는 빛', 160, 1152, {size: 24, weight: 700, color: T.muted});
      line(c, [[B.x0, B.y0], [B.x1, B.y0]], T.muted, 2);
      const pts = []; for (let tt = P.myth[0]; tt <= Math.min(t, P.myth[3] + 0.4); tt += 1 / 30) { const rr = P.mythR(tt); pts.push([X(tt), Y(rr > 1.01 ? blobSeen(rr) / blobSeen(P.mythR(P.mythPeak)) : 0)]); }
      for (let k = 0; k < pts.length - 1; k++) { const rr = P.mythR(P.myth[0] + k / 30), gg = gRed(rr); line(c, [pts[k], pts[k + 1]], hex3([1, lerp(0.3, 0.92, gg ** 1.5), lerp(0.08, 1, gg ** 2.2)]), 3.5); }
    });
  });
}

// ------------------------------------------------------------------ close: the dot in the eyepiece → zoom in → the poster; the statement
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), at = r => ctx.tl.at(r), L = P.closeL(t), sf = fadeIn(t, ctx.scene.start, 0.25), eye = smooth((L - 6.05) / 0.8);
  world(stage, t, {L, cx: 540, cy: 700, a: sf, blobs: 1, eye, eyeR: lerp(1300, 330, eye)});
  if (eye > 0.5) withAlpha(c, smooth((eye - 0.5) / 0.4) * sf, () => { ring(c, 540, 700, 26 + 2 * Math.sin(t * 3.2), rgba('#FFFFFF', 0.85), 2.5); });
  const fin = fadeIn(t, at(A.cThis) - 0.15, 0.5), out = 1 - fin;
  const l1 = fadeIn(t, at(A.cStar) - 0.15, 0.4), l2 = fadeIn(t, at(A.cInside) - 0.15, 0.4), l3 = fadeIn(t, at(A.cHuge) - 0.15, 0.4), l4 = fadeIn(t, at(A.cGalaxy) - 0.15, 0.4);
  withAlpha(c, sf * out, () => {
    const sh = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 14};
    stage.text('별처럼 보이는 점 하나', 540, 220, {role: 'display', size: 46, weight: 700, color: T.ink, align: 'center', alpha: l1, ...sh});
    stage.text('그 속에서는', 540, 290, {role: 'display', size: 38, weight: 500, color: T.ink, align: 'center', alpha: l2, ...sh});
    stage.text('거대한 블랙홀로 떨어지는 기체가', 540, 350, {role: 'display', size: 38, weight: 500, color: T.ink, align: 'center', alpha: l3, ...sh});
    stage.text('은하보다 밝게 빛난다', 540, 420, {role: 'display', size: 46, weight: 700, color: PAL.light, align: 'center', alpha: l4, ...sh});
  });
  if (fin > 0) posterTitle(stage, t, 0, fin * sf);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Disk gas: orbital angular speed ω ∝ r^−1.5 → pitch, outer edge 80 Hz … inner edge 400 Hz (log map); one swell per orbit.
//  - Spectral lines: tone ∝ 1/λ (Hβ = 260 Hz); redshift lowers every tone by exactly 1/(1+z) (= 1/1.158 for 3C 273).
//  - Distance (log) → pitch, farther = lower; brightness (log L) → pitch, 131·2^((log L − 13)/2) Hz; Eddington limit the same.
//  - Light curves → loudness (flicker, the two balls with equal energy, the plunging blob × g⁴; its pitch × g).
//  - Quasar number density (model) → pitch and loudness. Everything stays below 700 Hz (lowBandOnly).
// =====================================================================================================
export const orbHz = r => 80 * 5 ** (Math.log(omegaK(r)) / Math.log(omegaK(DISK_IN)));
export const lineHz = nm => 260 * 486.1 / nm;
export const lumHz = L => 131 * 2 ** ((Math.log10(L) - 13) / 2);
export const distHz = lg => 392 * 2 ** (-(lg + 5) / 6);
export function soundEvents(tl) {
  const P = plan(tl), at = ref => tl.at(ref), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, ref, freq, gain, means, o = {}) => ev.push({id, at: typeof ref === 'number' ? r(ref, 4) : ref, kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0, ...(o.repeat ? {repeat: o.repeat, interval: o.interval} : {})}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -31}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -32) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const tone = (id, t0, freq, dur, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tone', params: {freq: r(freq, 1), dur, harmonics: o.h || [1, 0.3], attack: o.attack ?? 0.04, decay: o.decay ?? dur * 0.5, sustain: o.sustain ?? 0.4, release: o.release ?? 0.35, gain_db: o.gain ?? -31}, means});
  const thump = (id, t0, means) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: -28, layers: [{kind: 'tone', offset: 0, params: {freq: 55, dur: 0.7, harmonics: [1, 0.35], attack: 0.006, decay: 0.22, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.35, low: 40, high: 220, release: 0.25, gain_db: -8}}]}, means});

  // hook: the poster disk's swirl (inner gas, one swell per turn of the inner disk), fading as the camera pulls back
  const [z0, z1] = P.hookZoom, turn = DISK_W0 / TAU;
  chirp('disk_swirl', 0, z1 + 0.4, () => orbHz(0.45), tt => 0.5 * (0.78 + 0.22 * Math.cos(TAU * turn * tt)) * (1 - smooth((P.hookL(tt) - L_POSTER - 0.3) / 2.6)), -30, `포스터의 원반: 안쪽 기체의 공전 → 낮은 소용돌이 음 ${orbHz(0.45).toFixed(0)} Hz, 안쪽 원반이 한 바퀴 돌 때마다 한 번 출렁임; 카메라가 물러나며 작아짐`, {fi: 0.02});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  whoosh('zoom_out', z0, z1 - z0, 260, 70, '카메라가 원반 → 은하 → 하늘의 점으로 물러남 (10의 8제곱 배)', -31);
  tick('eyepiece', P.eyeClose, 147, -30, '망원경 시야가 닫히며 점 하나만 남음', {decay: 0.18});
  tick('dot_mark', {...A.dot, offset: -0.25}, 196, -31, '"이 점" — 점에 고리 표식');
  swell('inset_open', P.inset, [110, 165], '확대 원: 점 속의 은하', {dur: 1.4});
  swell('galaxy_bright', at(A.bright2) - 0.05, [131, 196, 262], '"은하 전체보다 밝게" — 가운데 한 점이 은하 전체보다 밝음');
  // origin: the dish's received power (same signal model as the strip chart), catalogue entries at the beam's passes
  const s0 = P.sweep[0] - 0.2, s1 = P.sweep[1] + 0.8, smax = Math.max(...SOURCES.map(s => radioSignal(s.x)));
  ev.push({id: 'radio_noise', at: r(s0, 4), kind: 'env_noise', params: {low: 50, high: 240, gain_db: -27, fade: 0.05, points: (() => { const Q = []; for (let tt = s0; tt <= s1 + 1e-6; tt += 0.04) Q.push([r(tt - s0), r(clamp((0.22 + 0.78 * radioSignal(P.beamX(tt)) / smax) * env(tt, s0, s1, 0.3, 0.6)), 4)]); Q[Q.length - 1][1] = 0; return squeeze(Q); })()}, means: '전파 망원경이 받는 세기 = 기록 곡선 (빔이 전파원을 지날 때 커지는 낮은 잡음)'});
  ticks('catalog', P.detect, SOURCES.map(s => (s.q ? 196 : 165)), -30, `목록에 전파원이 하나씩 추가됨 (${SOURCES.length}개, 빔이 지나간 계산 시각; 나중에 퀘이사로 밝혀진 것은 조금 높은 음)`, {decay: 0.12});
  tick('quasar_chips', {...A.some, offset: -0.1}, 220, -31, '"몇몇 전파원" — 퀘이사 칸이 밝아짐', {repeat: 2, interval: 0.12});
  tick('point_star', {...A.star4, offset: -0.1}, 247, -30, '전파원 자리에 별 같은 점 하나', {decay: 0.22});
  whoosh('spread', at(A.spread) - 0.15, 0.9, 120, 300, '점의 빛을 프리즘으로 펼쳐 띠로');
  ticks('unknown_lines', BALMER.map((b, k) => at(A.lines4) - 0.2 + k * 0.16), BALMER.map(b => r(lineHz(stretch(b.lab)), 1)), -31, '정체 모를 선 넷에 "?" (선의 음: 진동수 ∝ 1/파장)');
  // spectrum: the lab lines as tones; the stretch lowers them by exactly 1/(1+z)
  tick('schmidt', {...A.y1963, offset: -0.2}, 147, -31, '이름 카드 "Maarten Schmidt"', {decay: 0.14});
  ticks('lab_lines', BALMER.map((b, k) => at(A.hydrogen) - 0.15 + k * 0.13), BALMER.map(b => r(lineHz(b.lab), 1)), -31, '실험실 수소선 넷이 나타남 (Hδ Hγ Hβ Hα의 음, 진동수 ∝ 1/파장)');
  for (const k of [2, 3]) {
    const b = BALMER[k], ta = at(A.hydrogen) - 0.1 + k * 0.13, tb = P.lock + 1.0;
    chirp(`slide_${b.n === 'Hβ' ? 'hbeta' : 'halpha'}`, ta, tb, tt => lineHz(b.lab * (1 + Z * P.stretchQ(tt))), () => 0.42, -31, `${b.n} 선: 실험실 ${lineHz(b.lab).toFixed(0)} Hz → "밀려"에서 정확히 1/1.158배 ${(lineHz(b.lab) / (1 + Z)).toFixed(0)} Hz로 내려감 (파장 × 1.158 = 진동수 ÷ 1.158)`, {h: [1, 0.25], fi: 0.2, fo: 0.5});
  }
  swell('lock', P.lock - 0.05, [131, 196], '모든 선이 3C 273의 선과 맞물림 (+16%)', {dur: 1.5});
  whoosh('collapse', P.collapse[0], P.collapse[1] - P.collapse[0], 300, 140, 'quasi-stellar radio source의 글자가 모여 quasar');
  swell('name', at(A.quasarName) - 0.15, [110, 165, 220], '"= 퀘이사"');
  // distance: each galaxy's light as a tone lowered by its redshift (farther = lower); ladder: distance (log) → pitch
  EXGAL.filter(g => g.lab).forEach((g, k) => { const z = zOfD(Math.hypot(g.x, g.y)); tone(`galaxy_${k + 1}`, at(A.red7) - 0.2 + k * 0.35, 330 / (1 + z), 1.6, `${g.name}의 빛: 330 Hz ÷ (1 + z), z = ${z.toFixed(2)} (그림의 장난감 허블 법칙) → 멀수록 낮은 음`, {h: [1], gain: -35}); });
  tick('rule', {...A.farther, offset: -0.25}, 165, -31, '"많이 밀릴수록 더 멀다" 직선', {decay: 0.18});
  chirp('ladder_climb', P.ladder[0], P.ladder[1] + 0.25, tt => distHz(P.ladderLog(tt)), () => 0.32, -32, '거리 사다리를 오르는 빛: 거리(로그) → 음높이, 멀수록 낮게 (8광분 392 Hz → 24억 광년 74 Hz)', {h: [1, 0.4, 0.2], fi: 0.1, fo: 0.3});
  ticks('rungs', P.rungT, LADDER.map(q => r(Math.min(330, Math.max(110, distHz(Math.log10(q.ly)) * 1.5)), 1)), -30, `사다리 칸 다섯 (${LADDER.map(q => q.name).join(' · ')}) 을 지나는 시각`, {decay: 0.14});
  tick('mag', {...A.small8, offset: -0.2}, 196, -31, '등급 눈금: 작은 망원경으로 보이는 범위에 3C 273(12.9)', {decay: 0.16});
  whoosh('retrace', at(A.retrace) - 0.15, 1.0, 220, 90, '"거리를 되짚어" — 화살표가 광원으로 되돌아감');
  tone('bar_sun', P.barSun, lumHz(1) * 4, 0.7, '태양 막대 (밝기 1)', {h: [1, 0.3], gain: -32});
  chirp('bar_3c273', P.bar3C[0], P.bar3C[1] + 0.6, tt => lumHz(10 ** (Math.log10(L_3C273) * easeInOut(clamp((tt - P.bar3C[0]) / (P.bar3C[1] - P.bar3C[0]))))) * 4, () => 0.42, -31, '3C 273 막대가 태양의 약 4조 배까지: 밝기(로그) → 음높이 (같은 대응의 4배 음역)', {h: [1, 0.3], fi: 0.1, fo: 0.4});
  tone('bar_mw', P.barMW + 0.2, lumHz(L_MW) * 4, 0.9, '우리 은하 전체 막대: 3C 273보다 두 칸(100배) 아래 → 반 옥타브 낮은 음', {h: [1], gain: -32});
  ticks('grid100', Array.from({length: 10}, (_, k) => P.grid100[0] + (k + 1) / 10 * (P.grid100[1] - P.grid100[0])), 196, -32, '우리 은하 × 100: 열 개씩 채워질 때마다', {decay: 0.06});
  // size: the observed flicker (loudness = light curve); the two balls with equal energy
  chirp('flicker', P.days[0], P.days[1] + 0.3, () => 147, tt => 0.1 + 0.42 * (flickerObs(P.dayOf(tt)) - 1) / 1.6, -29, '3C 273의 밝기 곡선(모형) → 147 Hz 음의 크기: 며칠 사이 커졌다 작아짐', {h: [1, 0.3], fi: 0.2, fo: 0.3, dt: 0.02});
  tick('flash_big', P.flashBig, 220, -30, '큰 공 전체가 한꺼번에 밝아짐', {decay: 0.2});
  const Wb = P.arriveBig[1] - P.arriveBig[0], Ws = 0.12, Ab = 0.6 * Math.sqrt(Ws / Wb);
  chirp('arrive_big', P.arriveBig[0] - 0.02, P.arriveBig[1] + 0.25, () => 110, tt => (tt >= P.arriveBig[0] && tt <= P.arriveBig[1] ? Ab : 0), -26, `큰 공의 빛이 도착: 2R/c = 2년(화면 ${Wb.toFixed(2)} s) 동안 고르게 → 같은 에너지를 길고 약하게 (진폭 ${Ab.toFixed(2)})`, {h: [1, 0.4, 0.2], fi: 0.02, fo: 0.06, dt: 0.02});
  tick('flash_small', P.flashSmall, 220, -30, '작은 공(반지름 2광일)이 한꺼번에 밝아짐', {decay: 0.2});
  chirp('arrive_small', P.arriveSmall - 0.02, P.arriveSmall + Ws + 0.08, () => 110, tt => (tt >= P.arriveSmall && tt <= P.arriveSmall + Ws ? 0.6 : 0), -26, `작은 공의 빛: 며칠 만에 도착 → 같은 에너지가 짧고 또렷한 맥동 (${Ws} s)`, {h: [1, 0.4, 0.2], fi: 0.01, fo: 0.02, dt: 0.01});
  swell('solar', at(A.solar) - 0.15, [131, 196], '"태양계만큼" — 빛으로 며칠 거리 카드', {dur: 1.4});
  // engine
  whoosh('zoom_in', P.engZoom[0], P.engZoom[1] - P.engZoom[0], 80, 260, '은하 한가운데로 다가감 (화면 폭 약 7만 광년 → 약 46광일)', -31);
  tone('bh_mass', at(A.hundredsM) - 0.2, 73, 1.6, '블랙홀 질량 "태양의 약 3억 배" (낮은 음)', {h: [1, 0.5, 0.25], gain: -31});
  chirp('swirl', P.blob[0], P.blob[1] + 0.1, tt => orbHz(P.blobR(tt)), tt => 0.48 * (0.72 + 0.28 * Math.cos(P.blobPhi(tt) - Math.PI / 2)), -30, `추적하는 기체 덩어리: 공전 빠르기(∝ r^−1.5) → 음높이 ${orbHz(P.blobR(P.blob[0])).toFixed(0)} → ${orbHz(P.blobR(P.blob[1])).toFixed(0)} Hz, 한 바퀴마다 한 번 출렁임`, {h: [1, 0.3], fi: 0.2, fo: 0.15, dt: 0.02});
  ev.push({id: 'rub', at: r(P.rub, 4), kind: 'env_noise', params: {low: 80, high: 300, gain_db: -29, fade: 0.05, points: [[0, 0], [0.4, 0.55], [r(P.wellSwap - P.rub - 0.2), 0.55], [r(P.wellSwap - P.rub + 0.2), 0]]}, means: '"서로 비벼" — 안쪽과 바깥 고리가 비비며 데워짐'});
  swell('as_light', at(A.asLight) - 0.1, [165, 247], '"빛으로 내놓습니다" — 떨어진 높이만큼의 빛', {dur: 1.3});
  thump('swallowed', P.blob[1], '추적하던 덩어리가 원반 안쪽 끝에 닿아 사라짐');
  ticks('lit10', Array.from({length: 10}, (_, k) => P.lit10[0] + (k + 0.5) / 10 * (P.lit10[1] - P.lit10[0])), 247, -31, '100칸 중 10칸이 빛이 됨 (10%)', {decay: 0.08});
  tick('lit07', P.lit07, 247, -37, '핵융합: 한 칸의 0.7만 빛이 됨 (0.7%) — 같은 음, 훨씬 작게', {decay: 0.08});
  ev.push({id: 'efficiency', at: r(P.ratio, 4), kind: 'custom', params: {gain_db: -29, layers: [
    {kind: 'tone', offset: 0, params: {freq: 196, dur: 0.6, harmonics: [1, 0.3], attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.25, gain_db: r(10 * Math.log10(ETA_FUS / ETA_ACC), 1)}},
    {kind: 'tone', offset: 0.7, params: {freq: 147, dur: 1.2, harmonics: [1, 0.3, 0.15], attack: 0.04, decay: 0.6, sustain: 0.4, release: 0.4, gain_db: 0}}]},
    means: `0.7% 대 10%: 같은 길이의 두 음, 에너지 비 ${Math.round(ETA_ACC / ETA_FUS)}배 (${(10 * Math.log10(ETA_FUS / ETA_ACC)).toFixed(1)} dB) — 핵융합 다음 원반`});
  whoosh('push', P.push, 1.4, 110, 300, '빛이 기체를 바깥으로 밀어냄', -32);
  chirp('limit_tone', P.mass[0] - 0.3, tl.scene('engine').end - 0.3, tt => lumHz(lEdd(P.knobM(tt))), () => 0.4, -31, '에딩턴 한계(∝ 질량) → 음높이: 질량 손잡이와 함께 올라감', {h: [1, 0.3]});
  chirp('quasar_tone', P.mass[0] - 0.3, tl.scene('engine').end - 0.3, tt => lumHz(P.knobL(tt)), () => 0.4, -31, '3C 273의 밝기 → 음높이: 한계 아래에서 함께 올라감 (한계의 40%: 0.2옥타브 아래)', {h: [1, 0.3]});
  // brightest
  chirp('j_bright', P.jL[0], P.daySwap + 0.2, tt => lumHz(P.jBright(tt)), () => 0.42, -31, 'J0529−4351의 밝기(로그) → 음높이: 4조 → 500조', {h: [1, 0.3], fi: 0.3});
  chirp('j_limit', P.jL[1] - 0.6, P.daySwap + 0.2, () => lumHz(lEdd(J0529.M)), () => 0.42, -31, `J0529−4351의 에딩턴 한계 음 ${lumHz(lEdd(J0529.M)).toFixed(0)} Hz: 밝기 음 ${lumHz(J0529.L).toFixed(0)} Hz와 거의 같아 느린 맥놀이 (한계의 약 90%)`, {h: [1, 0.3], fi: 0.4});
  ticks('days', P.dayT, 131, -29, '하루마다 태양 하나만큼의 기체가 원반으로 (5일)', {decay: 0.2});
  tick('plate', {...A.taken, offset: -0.1}, 196, -31, '1980년 건판에 찍힌 점 "별"', {decay: 0.16});
  const yt = [1990, 2000, 2010, 2020].map(y => P.years[0] + (y - 1980) / 43 * (P.years[1] - P.years[0]));
  ticks('decades', yt, 147, -32, '연도 계수기가 10년을 넘을 때마다 (1990 · 2000 · 2010 · 2020)', {decay: 0.07});
  tick('relabel', P.relabel, 247, -30, '"별" → "퀘이사 · 2023"', {repeat: 2, interval: 0.12, decay: 0.12});
  // cosmic time
  whoosh('lookback', P.look[0], P.look[1] - P.look[0], 220, 90, '"멀리 볼수록 과거" — 화살표가 빅뱅 쪽으로');
  const d0 = at(A.quasars18) - 0.25, d1 = at(A.rare) + 0.5;
  chirp('density', d0, d1, tt => 90 + 230 * qsoDensity(P.drawAge(tt)), tt => 0.15 + 0.4 * qsoDensity(P.drawAge(tt)), -30, '퀘이사 수(모형 곡선) → 음높이·크기: 약 100억 년 전 봉우리 320 Hz, 지금은 낮고 작게', {h: [1, 0.3], fi: 0.2, fo: 0.4, dt: 0.02});
  tick('peak', P.peakT - 0.15, 196, -31, '"가장 많았고" — 봉우리 표시', {decay: 0.16});
  // myth
  tick('myth_no', {...A.no, offset: -0.1}, 165, -29, '오해에 줄 → "아니다"', {repeat: 2, interval: 0.13});
  const m0 = P.myth[0] - 0.3, pk = blobSeen(P.mythR(P.mythPeak));
  chirp('blob_fall', m0, P.myth[3] + 0.15, tt => Math.max(40, 330 * gRed(P.mythR(tt))), tt => 0.55 * Math.sqrt(clamp(blobSeen(P.mythR(tt)) / pk)), -28, '빠져드는 덩어리의 빛: 음높이 = 330 Hz × g (중력 적색이동), 세기 ∝ √(우리에게 오는 밝기 ∝ g⁴) → 빠지기 직전 가장 크고, 낮아지며 꺼짐', {h: [1, 0.3], fi: 0.3, fo: 0.1, dt: 0.02});
  // close
  whoosh('close_zoom', P.closeZoom[0], P.closeZoom[1] - P.closeZoom[0], 70, 260, '하늘의 점 → 은하 → 원반으로 다가감 (훅의 반대)', -31);
  const cz = P.closeZoom[1] - 0.8;
  chirp('close_swirl', cz, tl.duration - 0.05, () => orbHz(0.45), tt => 0.45 * (0.78 + 0.22 * Math.cos(TAU * turn * tt)) * smooth((L_POSTER + 1.6 - P.closeL(tt)) / 1.6), -31, '원반이 다시 보이며 소용돌이 음이 돌아옴 (훅과 같은 음)', {fi: 0.3, fo: 0.8});
  swell('close_swell', at(A.cQuasar) - 0.1, [110, 165, 220], '"이것이 퀘이사입니다" — 제목', {dur: 1.8});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz, because the band-pass skirts fall only 12 dB/octave); swell overtones (2f)
 * are kept below it by construction (frequencies < HIGH_CUT/2). Events that would break this throw.
 */
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/quasar/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형(전파 빔의 수신 세기, 수소선 × (1+z), 거리 사다리, 깜빡임의 빛 곡선과 두 공의 도착 시각, 원반의 공전 ω ∝ r^−1.5, 에딩턴 한계, 퀘이사 수 모형, 중력 적색이동 g)에서 써 넣습니다. 대응: 원반 기체의 공전 빠르기 → 음높이(80~400 Hz), 선의 진동수 ∝ 1/파장(적색이동 = 1/1.158배), 밝기(로그) → 음높이, 빛 곡선 → 소리 크기. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  delete sound.music.enabled_note;
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; eyepiece ${P.eyeClose.toFixed(2)} s; detections ${P.detect.map(x => x.toFixed(2)).join(' ')}; big ball light ${P.arriveBig.map(x => x.toFixed(2)).join('–')} s, small ${P.arriveSmall.toFixed(2)} s`);
  console.log(`3C 273 Γ = ${gammaOf(L_3C273, M_3C273).toFixed(2)}, L_Edd = ${lEdd(M_3C273).toExponential(2)}; J0529 Γ = ${gammaOf(J0529.L, J0529.M).toFixed(2)}, per day ${(J0529.perYear / YEAR_D).toFixed(2)} M☉; ratio η ${(ETA_ACC / ETA_FUS).toFixed(1)}`);
  console.log(`lines: ${BALMER.map(b => `${b.n} ${b.lab}→${stretch(b.lab).toFixed(1)}`).join(', ')}; myth peak ${P.mythPeak.toFixed(2)} s (r = ${P.mythR(P.mythPeak).toFixed(2)}); density today ${qsoDensity(T_NOW).toFixed(3)} of peak`);
}
