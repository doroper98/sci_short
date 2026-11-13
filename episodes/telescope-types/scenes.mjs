// Episode scenes — "망원경의 종류 — 빛을 모으는 방법" (finals 34)
// Shape: export {theme, scenes, overlays, background, titles, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - One optics block below drives the picture, the gauges and sound.json (--emit-sound).
//  - Refractor: thin-lens ray geometry with the lensmaker focal length f(λ) ∝ 1/(n(λ) − 1); n(λ) is the Cauchy fit of a
//    crown glass (BK7: A = 1.5046, B = 0.00420 μm²). Real colour spread at f = 560 px is −4 / +5 px; on screen the
//    dispersion (n − n_green) is multiplied by CHROMA_X = 8 (declared "색 차이 과장"). Rays are drawn straight to the
//    colour's focus (ideal lens, no spherical aberration).
//  - Mirrors: parabolic, y = vy − (x − cx)²/(4f); every incoming vertical ray reflects through the focus for every colour
//    (law of reflection does not depend on wavelength). Newtonian: the flat 45° diagonal reflects the cone sideways; the
//    side focus F' is F mirrored across the diagonal.
//  - Radio dish: plane wavefronts → converging circular wavefronts. Path (top plane → dish → focus) is the same for every
//    ray (parabola = equal distance to focus and directrix), so a wavefront is a horizontal line before the dish and an arc
//    around the focus after it. Wavelength on screen is schematic.
//  - Aperture: collected light ∝ D², diffraction image = Airy pattern [2J₁(v)/v]², v = π·(D/D₀)·u, u = angle in λ/D₀.
//    Two stars 0.8 × Rayleigh (1.22 λ/D₀) apart: one blur at D₀, two points at 2D₀. Display intensity ∝ (D/D₀)⁴/m².
//  - Eye (dark adapted) 7 mm vs Keck 10 m: area ratio (10000/7)² ≈ 2.04 million ("백만 배 넘게").
//  - Same sharpness as the eye (1′ = 2.9×10⁻⁴ rad): D = 1.22 λ/θ → 0.5 μm: 2.1 mm, 21 cm: 880 m.
//  - Sizes: largest refractor 1.02 m (Yerkes 1897), Keck 10 m (36 segments, 1993), Hubble 2.4 m (1990),
//    JWST 6.5 m (18 gold-coated hexagons, 1.32 m flat-to-flat, launched 2021).
//  - Galilean moons (s02): circular orbits a = 5.9 / 9.4 / 15.0 / 26.4 Jupiter radii, P = 1.769 / 3.551 / 7.155 / 16.69 d;
//    starting phases are illustrative ("위치는 모형").
//  - Atmosphere (s16): stopping heights are rough representative values (γ 35, X 70, UV 30, IR mostly by 8 km, visible and
//    radio reach the ground). Turbulent wiggle of the star ray is schematic.
//  - EHT 2017 sites (published 2019): Hawaii, Arizona, Mexico, Chile, Spain, South Pole. The black-hole "shadow" is an
//    explanatory ring drawing, not the EHT image.
//  - Sound: node episodes/telescope-types/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';
import {loadLand, makeView, drawGlobe, surfacePoint} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
const LAND = loadLand(path.join(HERE, 'land.json'));
export const theme = {base: 'slate', accent: '#F2A65A'};
export const captionLayout = {};
export const events = [];

// =====================================================================================================
// Optics model (pure; shared by picture, gauges and sound.json via --emit-sound)
// =====================================================================================================
export const CAUCHY = {A: 1.5046, B: 0.00420};
export const nGlass = lam => CAUCHY.A + CAUCHY.B / (lam * lam);            // λ in μm
export const COLORS = [{id: 'r', lam: 0.656, col: '#FF6B5B'}, {id: 'g', lam: 0.546, col: '#8BE08F'}, {id: 'b', lam: 0.486, col: '#79A8FF'}];
export const CHROMA_X = 8;
/** focal length of a lens whose green focal length is fG; X multiplies the dispersion (1 = real glass) */
export const focalAt = (fG, lam, X = 1) => { const nG = nGlass(0.546), n = nG + X * (nGlass(lam) - nG); return fG * (nG - 1) / (n - 1); };
// Airy pattern
function bessj1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606))))));
    const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a1 / a2;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const r = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
  return x < 0 ? -r : r;
}
const AIRY_DV = 0.005, AIRY_N = 8000;
const AIRY = (() => { const a = new Float32Array(AIRY_N + 1); a[0] = 1; for (let i = 1; i <= AIRY_N; i++) { const v = i * AIRY_DV, q = 2 * bessj1(v) / v; a[i] = q * q; } return a; })();
export const airy = v => { const k = v / AIRY_DV; if (k >= AIRY_N) return 0; const i = k | 0; return AIRY[i] + (AIRY[i + 1] - AIRY[i]) * (k - i); };
export const RAYLEIGH = 1.2197;                                             // first zero in units of λ/D
export const STAR_SEP = 0.8 * RAYLEIGH;                                     // two stars: unresolved at D₀, resolved at 2D₀
// sizes and ratios
export const EYE_MM = 7, KECK_M = 10, YERKES_M = 1.02, HUBBLE_M = 2.4, JWST_M = 6.5;
export const EYE_TO_KECK_AREA = (KECK_M * 1000 / EYE_MM) ** 2;               // ≈ 2.04 million
export const EYE_RES = 2.9e-4;                                              // 1′ in rad
export const needD = lamM => 1.22 * lamM / EYE_RES;                          // m
export const LAM_VIS = 0.5e-6, LAM_RADIO = 0.21;
// Galilean moons
export const MOONS = [{n: '이오', a: 5.9, P: 1.769, ph: 5.42}, {n: '유로파', a: 9.4, P: 3.551, ph: 2.27}, {n: '가니메데', a: 15.0, P: 7.155, ph: 3.61}, {n: '칼리스토', a: 26.4, P: 16.69, ph: 0.37}];
// atmosphere: band, stopping height (km), colour
export const BANDS = [{n: '감마선', h: 35, col: '#C9A0FF'}, {n: '엑스선', h: 70, col: '#9FB6FF'}, {n: '자외선', h: 30, col: '#B98CFF'},
  {n: '가시광선', h: 0, col: '#FFE7A6'}, {n: '적외선', h: 8, col: '#FF8F6B'}, {n: '전파', h: 0, col: '#7FD6C8'}];
export const EHT_SITES = [{n: '하와이', lat: 19.8, lon: -155.5}, {n: '애리조나', lat: 32.7, lon: -109.9}, {n: '멕시코', lat: 19.0, lon: -97.3},
  {n: '칠레', lat: -23.0, lon: -67.8}, {n: '스페인', lat: 37.1, lon: -3.4}, {n: '남극', lat: -89.99, lon: -45}];

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  lens1: W('s01', '렌즈와'), mirror1: W('s01', '거울'), dish1: W('s01', '전파'),
  y1610: W('s02', '천육백십년'), gal: W('s02', '갈릴레이는'), jup: W('s02', '목성'), moons: W('s02', '위성'), four: W('s02', '네 개를'), saw: W('s02', '보았습니다'),
  today: W('s03', '오늘날'), big3: W('s03', '가장'), pupil: W('s03', '눈동자보다'), mil: W('s03', '백만'), much: W('s03', '많은'), gather3: W('s03', '모읍니다'),
  greek: W('s04', '그리스어로'), tele: W('s04', '텔레와'), skop: W('s04', '스코페인을'), merge: W('s04', '합친'), han: W('s04', '한자로는'), look: W('s04', '바라보는'), gyeong: W('s04', '거울입니다'),
  y1608: W('s05', '천육백팔년'), lip: W('s05', '리퍼세이가'), two: W('s05', '렌즈 두'), tube: W('s05', '원통을'), patent: W('s05', '특허로'),
  core6: W('s06', '핵심은'), zoom6: W('s06', '확대가'), wide6: W('s06', '넓은'), light6: W('s06', '빛을 모아'), point6: W('s06', '한 점에'),
  diam7: W('s07', '지름이'), dbl7: W('s07', '두 배가'), coll7: W('s07', '모이는'), x4: W('s07', '네 배가'), small7: W('s07', '작은'), sharp7: W('s07', '또렷하게'),
  refr8: W('s08', '굴절망원경은'), convex8: W('s08', '볼록렌즈로'), bend8: W('s08', '꺾어'), point8: W('s08', '한 점에'),
  color9: W('s09', '색마다'), star9: W('s09', '별 둘레에'), rainbow9: W('s09', '무지갯빛'), big9: W('s09', '큰 렌즈는'), edge9: W('s09', '가장자리만'), weight9: W('s09', '무게에'),
  big10: W('s10', '가장 큰'), meter10: W('s10', '일미터'),
  y1668: W('s11', '천육백육십팔년'), concave11: W('s11', '오목거울로'), bounce11: W('s11', '되비쳐'), refl11: W('s11', '반사망원경을'),
  all12: W('s12', '모든 색을'), same12: W('s12', '같은 곳에'), back12: W('s12', '뒤에서'), whole12: W('s12', '통째로'), seg12: W('s12', '조각을'), ten12: W('s12', '십미터가'),
  space13: W('s13', '우주에서는'), invis13: W('s13', '보이지'), radio13: W('s13', '전파도'), dish13: W('s13', '금속 접시로'), name13: W('s13', '전파망원경을'),
  wave14: W('s14', '파장이'), long14: W('s14', '아주'), sharp14: W('s14', '또렷하게'), dish14: W('s14', '접시가'), big14: W('s14', '커야'),
  far15: W('s15', '멀리'), many15: W('s15', '여러 접시를'), one15: W('s15', '하나처럼'), y2019: W('s15', '이천십구년에는'), earth15: W('s15', '지구만'), bh15: W('s15', '블랙홀의'), shadow15: W('s15', '그림자를'),
  air16: W('s16', '공기는'), shake16: W('s16', '흔들고'), ir16: W('s16', '적외선과'), xr16: W('s16', '엑스선을'), block16: W('s16', '막기'), hub16: W('s16', '허블과'), jw16: W('s16', '제임스웹은'), up16: W('s16', '올라갔습니다'),
  gold17: W('s17', '금을'), n18: W('s17', '열여덟'), unfold17: W('s17', '펼친'), d65: W('s17', '육 점 오'), ir17: W('s17', '적외선'),
  mag18: W('s18', '배율이'), good18: W('s18', '좋은'),
  no19: W('s19', '아닙니다'), mag19: W('s19', '배율은'), eye19: W('s19', '눈에 대는'), swap19: W('s19', '바꿔도'), up19: W('s19', '올라가지만'), ap19: W('s19', '입구가'), blur19: W('s19', '흐린'), grow19: W('s19', '커질'),
  core20: W('s20', '핵심은'), wide20: W('s20', '넓은'), point20: W('s20', '한 점에'),
};

// ---- per-timeline plan (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook
  P.trio = at(A.lens1) - 0.45; P.lens1 = at(A.lens1) - 0.05; P.mirror1 = at(A.mirror1) - 0.05; P.dish1 = at(A.dish1) - 0.05;
  P.gal = at('s02') - 0.45; P.day0 = at(A.y1610); P.day1 = at('s02:end') + 0.4; P.days = 6;
  P.day = t => clamp((t - P.day0) / (P.day1 - P.day0)) * P.days;
  P.nights = [...Array(P.days)].map((_, k) => +(P.day0 + (k + 1) / P.days * (P.day1 - P.day0)).toFixed(4));
  P.galName = at(A.gal) - 0.1; P.jup = at(A.jup) - 0.1; P.moonLbl = at(A.moons) - 0.1;
  P.eye = at('s03') - 0.45; P.z0 = at(A.big3) - 0.1; P.z1 = Math.max(P.z0 + 2.6, at(A.mil) + 0.3);
  P.zoom = t => easeInOut((t - P.z0) / (P.z1 - P.z0));
  P.areaSteps = []; for (let k = 1; k <= 6; k++) P.areaSteps.push(+(P.z0 + (P.z1 - P.z0) * invEase(k / Math.log10(EYE_TO_KECK_AREA))).toFixed(4));
  P.x200 = P.z1 + 0.05;
  // origin
  P.card = sc('origin').start + 0.1; P.tele = at(A.tele) - 0.1; P.skop = at(A.skop) - 0.1; P.merge = at(A.merge) - 0.05; P.han = at(A.han) - 0.1; P.look = at(A.look) - 0.1; P.gyeong = at(A.gyeong) - 0.1;
  P.lipIn = at('s05') - 0.45; P.lip = at(A.lip) - 0.1; P.two = at(A.two) - 0.1; P.tube = at(A.tube) - 0.1; P.patent = at(A.patent) - 0.1;
  // essence
  P.ess = sc('essence').start; P.zoom6 = at(A.zoom6) - 0.1; P.wide6 = at(A.wide6) - 0.1; P.light6 = at(A.light6) - 0.05; P.point6 = at(A.point6);
  P.d0 = at(A.dbl7) - 0.15; P.d1 = P.d0 + 1.3; P.D = t => 1 + smooth((t - P.d0) / (P.d1 - P.d0));
  P.x4 = at(A.x4) - 0.05; P.small7 = at(A.small7) - 0.15; P.split = at(A.sharp7) + 0.1;
  // refractor
  P.ref = sc('refractor').start; P.convex = at(A.convex8) - 0.1; P.bend = at(A.bend8) - 0.05; P.point8 = at(A.point8);
  P.c0 = at(A.color9) - 0.1; P.c1 = P.c0 + 1.1; P.chroma = t => smooth((t - P.c0) / (P.c1 - P.c0));
  P.rainbow = at(A.rainbow9) - 0.1; P.bigLens = at(A.big9) - 0.15; P.edge = at(A.edge9) - 0.1; P.s0 = at(A.weight9) - 0.1; P.s1 = P.s0 + 1.2;
  P.sag = t => smooth((t - P.s0) / (P.s1 - P.s0));
  P.ruler = at('s10') - 0.3; P.yerkes = at(A.meter10) - 0.1;
  // reflector
  P.newton = at(A.y1668) - 0.1; P.concave = at(A.concave11) - 0.1; P.bounce = at(A.bounce11) - 0.05; P.reflName = at(A.refl11) - 0.1;
  P.all = at(A.all12) - 0.1; P.same = at(A.same12) - 0.05; P.back = at(A.back12) - 0.1; P.whole = at(A.whole12) - 0.1;
  P.seg0 = at(A.seg12) - 0.15; P.segDT = 0.045; P.segT = [...Array(36)].map((_, k) => +(P.seg0 + k * P.segDT).toFixed(4));
  P.ringT = [P.segT[0], P.segT[6], P.segT[18]]; P.ten = at(A.ten12) - 0.1;
  // radio
  P.rad = sc('radio').start; P.invis = at(A.invis13) - 0.1; P.waves = at(A.radio13) - 0.15; P.dish = at(A.dish13) - 0.1; P.rname = at(A.name13) - 0.1;
  P.chart = at('s14') - 0.35; P.l0 = at(A.wave14) - 0.05; P.l1 = Math.max(P.l0 + 1.8, at(A.sharp14) - 0.1);
  P.lamLog = t => lerp(Math.log10(LAM_VIS), Math.log10(LAM_RADIO), easeInOut((t - P.l0) / (P.l1 - P.l0)));
  P.need = at(A.dish14) - 0.1; P.big14 = at(A.big14) - 0.1;
  P.globe = at('s15') - 0.4; P.siteT = EHT_SITES.map((_, k) => +(at(A.many15) - 0.1 + 0.26 * k).toFixed(4));
  P.linkT = EHT_SITES.slice(1).map((_, k) => +(at(A.one15) - 0.15 + 0.16 * k).toFixed(4));
  P.virtual = at(A.y2019) - 0.1; P.earth = at(A.earth15) - 0.1; P.bh = at(A.bh15) - 0.25; P.shadow = at(A.shadow15) - 0.05;
  // space
  P.air = sc('space').start; P.shake = at(A.shake16) - 0.1;
  P.bandT = BANDS.map((b, k) => +(at(A.ir16) - 0.5 + 0.18 * k).toFixed(4));
  P.bandStop = BANDS.map((b, k) => +(P.bandT[k] + bandFall(b.h)).toFixed(4));
  P.irHi = at(A.ir16) - 0.05; P.xrHi = at(A.xr16) - 0.05; P.block = at(A.block16) - 0.05;
  P.hub = at(A.hub16) - 0.15; P.jw = at(A.jw16) - 0.15; P.rise = 1.4;
  P.jwst = at('s17') - 0.2; P.gold = at(A.gold17) - 0.1; P.hexT = [...Array(18)].map((_, k) => +(at(A.n18) - 0.05 + 0.075 * k).toFixed(4));
  P.u0 = at(A.unfold17) - 0.1; P.u1 = P.u0 + 1.3; P.unfold = t => smooth((t - P.u0) / (P.u1 - P.u0));
  P.d65 = at(A.d65) - 0.1; P.irLbl = at(A.ir17) - 0.1;
  // myth
  P.myth = sc('myth').start; P.q = at(A.mag18) - 0.1;
  P.m0 = at(A.swap19) - 0.25; P.m1 = P.m0 + 1.0; P.mag = t => 1 + smooth((t - P.m0) / (P.m1 - P.m0));
  P.swap = at(A.eye19) - 0.1; P.small19 = at(A.ap19) - 0.1; P.blur = at(A.blur19) - 0.05; P.grow = at(A.grow19) - 0.1;
  P.a0 = at('s19:end') + 0.15; P.a1 = P.a0 + 0.9; P.apR = t => 1 + smooth((t - P.a0) / (P.a1 - P.a0));
  P.splitR = P.a0 + 0.9 * solveUp(q => smooth(q), (1.25 - 1), 0, 1);
  // close
  P.trio2 = sc('close').start; P.core20 = at(A.core20) - 0.1; P.poster = at(A.wide20) - 0.2;
  PLANS.set(tl, P); return P;
}
const solveUp = (f, v, a, b) => { let lo = a, hi = b; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
const invEase = v => solveUp(easeInOut, v, 0, 1);
/** fall time of a band arrow from the top of the atmosphere (100 km) to its stopping height */
export const bandFall = h => 0.25 + 0.9 * (100 - h) / 100;

// =====================================================================================================
// Background, palette, helpers
// =====================================================================================================
export const PAL = {answer: '#F2A65A', ray: '#FFF1D2', rayDim: '#FFE7B8', metal: '#C9D6DA', metalDk: '#55666C', glass: '#9FD9E6',
  gold: '#E9B84E', radio: '#7FD6C8', grid: '#284148', focus: '#FFF6DE', bad: '#F08A6B', tube: '#1A2E35'};
const FIELD = (() => { const R = rng(1610), s = []; for (let i = 0; i < 240; i++) s.push({x: R() * 1080, y: R() * 1920, r: 0.5 + 1.4 * R() ** 3, a: 0.1 + 0.5 * R() ** 2, c: R(), ph: R() * TAU}); return s; })();
export function background(stage, t) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, '#0B1A20'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  glow(c, 540, 820, 900, '#1E4450', 0.08);
  for (const s of FIELD) { c.globalAlpha = s.a * (0.42 + 0.12 * Math.sin(t * 1.3 + s.ph)); circle(c, s.x, s.y, s.r, s.c > 0.82 ? '#FFE6C4' : '#DDEBF0'); }
  c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H * 0.44, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 26, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 70 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 6, rgba(stage.theme.plate, o.plateA ?? 0.88), o.border ? rgba(o.border, 0.9) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role});
  });
  return [x0, w];
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 820, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1345, 0, 1625);
  g.addColorStop(0, 'rgba(3,9,12,0)'); g.addColorStop(0.35, `rgba(3,9,12,${0.62 * a})`); g.addColorStop(0.75, `rgba(3,9,12,${0.62 * a})`); g.addColorStop(1, 'rgba(3,9,12,0)');
  c.fillStyle = g; c.fillRect(0, 1345, 1080, 280);
}
/** light travelling along a polyline: faint guide + moving bright dashes */
function beam(c, pts, col, w, a, t, o = {}) {
  if (a <= 0 || pts.length < 2) return;
  const speed = o.speed ?? 260, dash = o.dash ?? [20, 58];
  c.save(); c.globalAlpha *= a;
  line(c, pts, rgba(col, o.base ?? 0.4), w);
  if (o.flow !== false) {
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.setLineDash(dash); c.lineDashOffset = -t * speed + (o.phase || 0); c.lineWidth = w * 1.6; c.lineCap = 'round'; c.strokeStyle = rgba(col, 0.95); c.stroke(); c.setLineDash([]);
  }
  c.restore();
}
function focusStar(c, x, y, r, a = 1, col = PAL.focus) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= a;
  glow(c, x, y, r * 4.5, col, 0.35); glow(c, x, y, r * 1.6, '#FFFFFF', 0.8);
  line(c, [[x - r * 3.2, y], [x + r * 3.2, y]], rgba(col, 0.6), 2); line(c, [[x, y - r * 3.2], [x, y + r * 3.2]], rgba(col, 0.6), 2);
  c.restore(); circle(c, x, y, Math.max(2, r * 0.32), '#FFFFFF');
}
function hexPath(c, x, y, r, rot = 0) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + k * Math.PI / 3; const px = x + r * Math.cos(a), py = y + r * Math.sin(a); k ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); }
/** flat-top hex grid rings 1..n (no centre) → [{q, r, ring, x, y}] with unit corner radius */
function hexRings(n) {
  const out = [];
  for (let q = -n; q <= n; q++) for (let r = -n; r <= n; r++) { const s = -q - r, ringN = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)); if (ringN < 1 || ringN > n) continue;
    out.push({q, r, ring: ringN, x: 1.5 * q, y: Math.sqrt(3) * (r + q / 2)}); }
  return out.sort((a, b) => a.ring - b.ring || Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
}
const KECK_HEX = hexRings(3), JWST_HEX = hexRings(2);
/** Korean number display: 2040000 → "204만" */
const koNum = n => (n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('en-US')}만` : Math.round(n).toLocaleString('en-US'));

// ---- parabolic mirror (vertex vy, focus above) ----
const parab = (cx, vy, f) => x => vy - (x - cx) ** 2 / (4 * f);
function mirrorShape(c, cx, vy, f, a, o = {}) {
  const y = parab(cx, vy, f), pts = [], back = [];
  for (let i = 0; i <= 48; i++) { const x = cx - a + 2 * a * i / 48; pts.push([x, y(x)]); back.push([x, y(x) + (o.thick ?? 16) + 6 * (1 - ((x - cx) / a) ** 2)]); }
  const g = c.createLinearGradient(cx - a, vy - 40, cx + a, vy + 30); g.addColorStop(0, o.col1 || '#8EA3A9'); g.addColorStop(0.45, o.col0 || '#E3EEF0'); g.addColorStop(1, o.col2 || '#5D7076');
  poly(c, [...pts, ...back.reverse()], g, rgba('#0A1418', 0.8), 1.2);
  line(c, pts, rgba('#FFFFFF', o.shine ?? 0.75), 2.2);
}

// =====================================================================================================
// Poster (frame 0 = thumbnail) and the three mini telescopes
// =====================================================================================================
const PM = {cx: 540, vy: 1310, f: 430, a: 330, top: 330};
const POSTER_RAYS = [-300, -250, -195, -140, -85, 85, 140, 195, 250, 300];
function posterPicture(stage, t, a = 1) {
  const c = stage.ctx, y = parab(PM.cx, PM.vy, PM.f), F = [PM.cx, PM.vy - PM.f];
  withAlpha(c, a, () => {
    // telescope tube hint and mount
    for (const dx of [-250, -150, -50, 50, 150, 250]) { const x = PM.cx + dx; line(c, [[x, y(x) + 24], [PM.cx + dx * 0.55, 1392]], rgba('#5D7076', 0.75), 3); }
    rect(c, PM.cx - 200, 1388, 400, 16, 4, '#2A3E44', rgba('#0A1418', 0.8), 1);
    for (const dx of POSTER_RAYS) {
      const x = PM.cx + dx, ym = y(x);
      beam(c, [[x, PM.top], [x, ym]], PAL.ray, 3, 0.9, t, {speed: 240, phase: dx * 1.7, base: 0.45});
      beam(c, [[x, ym], F], PAL.ray, 3, 0.9, t, {speed: 240, phase: dx * 1.7 - (ym - PM.top), base: 0.5});
    }
    mirrorShape(c, PM.cx, PM.vy, PM.f, PM.a, {thick: 22});
    focusStar(c, F[0], F[1], 26, 1);
  });
}
// 2026-11-13 (owner: "주제어가 딱 보여야 해"): white question on top, the topic keyword (k) below as the biggest text, no answer.
// The question shrinks into the header title; the keyword shrinks a little in place and fades, and the header kicker shows it.
const POSTER_Q = {y: 492, y2: 664, q: '핵심은 확대일까?', k: '망원경'};
let QSIZE = 0, KSIZE = 0;
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q, 800, 92); KSIZE ||= fit(POSTER_Q.k, 800, 200);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), s2 = KSIZE * lerp(1, 0.7, q), tr = lerp(TR, -0.011, q), ak = 1 - smooth(q / 0.6);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 380, 0, 800); g2.addColorStop(0, 'rgba(3,9,12,0)'); g2.addColorStop(0.22, 'rgba(3,9,12,0.72)'); g2.addColorStop(0.8, 'rgba(3,9,12,0.72)'); g2.addColorStop(1, 'rgba(3,9,12,0)');
    c.fillStyle = g2; c.fillRect(0, 380, 1080, 420);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    stage.text(POSTER_Q.q, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (ak > 0) stage.text(POSTER_Q.k, 540, POSTER_Q.y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', alpha: ak, tracking: TR * s2, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 26});
  });
}
/** three small cross-sections: lens (refraction), mirror (reflection), dish (radio). k = [aLens, aMirror, aDish] */
const TRIO = [{x: 250, name: '렌즈', sub: '굴절'}, {x: 530, name: '거울', sub: '반사'}, {x: 810, name: '전파 접시', sub: '전파'}];
function trio(stage, t, k, o = {}) {
  const c = stage.ctx, T = stage.theme, y0 = o.y0 ?? 560, hi = o.hi ?? [0, 0, 0];
  TRIO.forEach((m, i) => {
    const a = k[i]; if (a <= 0) return;
    withAlpha(c, a, () => {
      rect(c, m.x - 125, y0, 250, 470, 16, rgba(T.plate, 0.55), rgba(hi[i] > 0 ? mix(T.border, PAL.answer, hi[i]) : T.border, 1), 1.6);
      if (i === 0) {                                                     // lens at the top, rays converge downward
        const ly = y0 + 110, f = 230, F = [m.x, ly + f];
        for (const dx of [-80, -50, -20, 20, 50, 80]) { beam(c, [[m.x + dx, y0 + 20], [m.x + dx, ly]], PAL.ray, 2.2, 1, t, {speed: 150, phase: dx * 2}); beam(c, [[m.x + dx, ly], F, [m.x - dx * 0.35, F[1] + 70]], PAL.ray, 2.2, 1, t, {speed: 150, phase: dx * 2 - 90}); }
        lensShape(c, m.x, ly, 95, 16, 0);
        focusStar(c, F[0], F[1], 9, 1);
      } else if (i === 1) {                                              // mirror at the bottom, focus above it
        const vy = y0 + 420, f = 200, yy = parab(m.x, vy, f), F = [m.x, vy - f];
        for (const dx of [-95, -65, -35, 35, 65, 95]) { beam(c, [[m.x + dx, y0 + 20], [m.x + dx, yy(m.x + dx)]], PAL.ray, 2.2, 1, t, {speed: 150, phase: dx * 2}); beam(c, [[m.x + dx, yy(m.x + dx)], F], PAL.ray, 2.2, 1, t, {speed: 150, phase: dx * 2 - 300}); }
        mirrorShape(c, m.x, vy, f, 108, {thick: 12});
        focusStar(c, F[0], F[1], 9, 1);
      } else {                                                           // dish with long wavefronts
        const vy = y0 + 400, f = 120, F = [m.x, vy - f];
        dishWaves(c, t, m.x, vy, f, 105, y0 + 20, 46, 1, {w: 2});
        dishShape(c, m.x, vy, f, 105, 1);
        focusStar(c, F[0], F[1], 8, 0.9, PAL.radio);
      }
      stage.text(m.name, m.x, y0 + 520, {role: 'display', size: 32, weight: 700, color: hi[i] > 0 ? mix(T.ink, PAL.answer, hi[i]) : T.ink, align: 'center'});
      stage.text(m.sub, m.x, y0 + 560, {size: 26, weight: 500, color: T.muted, align: 'center'});
    });
  });
}
function lensShape(c, x, y, h, th, sag = 0, o = {}) {
  // biconvex lens across x ∈ [x−h, x+h] (horizontal lens, light travelling downward); sag bends the whole lens downward
  const pts = [], n = 40;
  for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n, xx = x + u * h, d = sag * (1 - u * u); pts.push([xx, y - (2 + th * (1 - u * u)) / 2 + d]); }
  for (let i = n; i >= 0; i--) { const u = -1 + 2 * i / n, xx = x + u * h, d = sag * (1 - u * u); pts.push([xx, y + (2 + th * (1 - u * u)) / 2 + d]); }
  const g = c.createLinearGradient(x - h, y - th, x + h, y + th); g.addColorStop(0, rgba(PAL.glass, 0.5)); g.addColorStop(0.5, rgba('#E8FBFF', 0.75)); g.addColorStop(1, rgba(PAL.glass, 0.45));
  poly(c, pts, g, rgba('#E8FBFF', o.edge ?? 0.9), 1.6);
}
function dishShape(c, cx, vy, f, a, al = 1) {
  const y = parab(cx, vy, f), pts = [], back = [];
  for (let i = 0; i <= 40; i++) { const x = cx - a + 2 * a * i / 40; pts.push([x, y(x)]); back.push([x, y(x) + 10]); }
  withAlpha(c, al, () => {
    // feed legs and receiver
    const F = [cx, vy - f];
    line(c, [[cx - a * 0.78, y(cx - a * 0.78)], [F[0] - 6, F[1] + 6]], rgba(PAL.metal, 0.7), 2); line(c, [[cx + a * 0.78, y(cx + a * 0.78)], [F[0] + 6, F[1] + 6]], rgba(PAL.metal, 0.7), 2);
    rect(c, F[0] - 9, F[1] - 4, 18, 22, 3, '#B9C8CC', '#0A1418', 1);
    poly(c, [[cx - 14, vy + 8], [cx + 14, vy + 8], [cx + 26, vy + a * 0.55], [cx - 26, vy + a * 0.55]], '#2A3E44', rgba('#0A1418', 0.8), 1);
    const g = c.createLinearGradient(cx - a, vy, cx + a, vy); g.addColorStop(0, '#7E9298'); g.addColorStop(0.5, '#DCE6E8'); g.addColorStop(1, '#55686E');
    poly(c, [...pts, ...back.reverse()], g, rgba('#0A1418', 0.8), 1);
    line(c, pts, rgba('#FFFFFF', 0.6), 1.6);
  });
}
/** plane wavefronts falling onto a dish and converging arcs after reflection (equal path, see model notes) */
function dishWaves(c, t, cx, vy, f, a, top, lam, al, o = {}) {
  const y = parab(cx, vy, f), F = [cx, vy - f], L0 = vy + f - top, speed = o.speed ?? 70, col = o.col || PAL.radio;
  const thMax = Math.atan2(a, y(cx + a) - F[1]);                       // rim direction seen from the focus (0 = toward the vertex)
  withAlpha(c, al, () => {
    const s0 = ((t * speed) % lam + lam) % lam;
    for (let s = s0; s < L0; s += lam) {
      const yy = top + s;
      // incoming part: where the dish surface is still below this height
      const half = yy < y(cx + a) ? a : Math.min(a, Math.sqrt(Math.max(0, 4 * f * (vy - yy))));
      if (yy < vy && half > 1) line(c, [[cx - half, yy], [cx + half, yy]], rgba(col, 0.75), o.w ?? 2.6);
      // reflected part: arc of radius L0 − s around F, only between the focus and the dish
      const R = L0 - s; if (R <= 2) continue;
      let pts = [];
      const flush = () => { if (pts.length > 1) line(c, pts, rgba(col, 0.75), o.w ?? 2.6); pts = []; };
      for (let i = 0; i <= 48; i++) {
        const th = -thMax + 2 * thMax * i / 48;
        if (R > dishDist(th, f)) { flush(); continue; }
        pts.push([F[0] + R * Math.sin(th), F[1] + R * Math.cos(th)]);
      }
      flush();
    }
  });
}
/** distance from the focus to the parabola along direction th (0 = toward the vertex): r = 2f / (1 + cos th) */
const dishDist = (th, f) => 2 * f / (1 + Math.cos(th));

// =====================================================================================================
// Airy images (two stars) — half-resolution buffers
// =====================================================================================================
const AIRY_BUF = {};
function airyBuf(key, n) { return (AIRY_BUF[key] ||= (() => { const cv = createCanvas(n, n); const cc = cv.getContext('2d'); return {cv, cc, img: cc.createImageData(n, n), n}; })()); }
/** draw a round image of two stars: D = aperture (×D₀), m = magnification, kpx = px per λ/D₀ at m = 1, R = panel radius */
function starImage(stage, key, cx, cy, R, {D = 1, m = 1, kpx = 50, sep = STAR_SEP, gain = 1.1, a = 1} = {}) {
  if (a <= 0) return;
  const n = Math.ceil(R), B = airyBuf(key, n), d = B.img.data, scale = 2 * R / n, k = kpx * m, I0 = (D ** 4 / (m * m)) ** 0.6;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * scale - R, y = (j + 0.5) * scale - R, o = (j * n + i) * 4;
    if (x * x + y * y > R * R) { d[o + 3] = 0; continue; }
    const u1 = Math.hypot(x / k - sep / 2, y / k), u2 = Math.hypot(x / k + sep / 2, y / k);
    const I = I0 * (airy(Math.PI * D * u1) + airy(Math.PI * D * u2)) * gain;
    const v = 1 - Math.exp(-I);
    d[o] = 255 * Math.min(1, v * 1.05 + 0.02); d[o + 1] = 255 * Math.min(1, v * 0.97 + 0.03); d[o + 2] = 255 * Math.min(1, v * 0.82 + 0.05); d[o + 3] = 255;
  }
  B.cc.putImageData(B.img, 0, 0);
  const c = stage.ctx;
  withAlpha(c, a, () => {
    circle(c, cx, cy, R + 4, '#02070A');
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip(); c.imageSmoothingEnabled = true; c.drawImage(B.cv, cx - R, cy - R, 2 * R, 2 * R); c.restore();
    ring(c, cx, cy, R + 3, rgba(stage.theme.border, 1), 2.5);
  });
}

// =====================================================================================================
// Titles and overlays
// =====================================================================================================
export const titles = {
  hook: [POSTER_Q.k, POSTER_Q.q],   // kicker = the poster keyword (2026-11-13)
  origin: ['기원 · 이름', '멀리 바라보는 거울'],
  essence: ['본질 · 빛을 모으는 깔때기', '넓은 입구로 모아 한 점에'],
  refractor: ['굴절망원경 · 렌즈', '빛을 꺾어 모은다'],
  reflector: ['반사망원경 · 거울', '빛을 되비쳐 모은다'],
  radio: ['전파망원경 · 접시', '보이지 않는 빛을 모은다'],
  space: ['우주 망원경', '공기 위로 올라간 눈'],
  myth: ['오해 바로잡기', '배율이 높을수록 좋을까?'],
  close: ['정리', '렌즈 · 거울 · 접시'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'hook') return [[-Infinity, ...titles.hook], [P.gal + 0.1, '1610 · 갈릴레이', '목성 곁의 네 위성'], [P.eye + 0.1, '모으는 빛', '눈동자와 10 m 거울']];
  if (id === 'origin') return [[-Infinity, ...titles.origin], [P.lipIn + 0.1, '1608 · 네덜란드', '렌즈 두 개를 끼운 원통']];
  if (id === 'radio') return [[-Infinity, ...titles.radio], [P.globe + 0.1, '여러 접시를 하나로', '지구만 한 망원경']];
  if (id === 'space') return [[-Infinity, ...titles.space], [P.jwst + 0.1, '제임스웹 · 2021', '금빛 거울 18조각']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, t); return; }
  if (id === 'close' && t >= P.poster) {
    const a = fadeOut(t, P.poster, 0.3); if (a > 0) head(stage, ...titles.close, a, a);
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, ctx.tl), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook' && k === 0) {
    const aK = fadeIn(t, MORPH[1] - 0.05, 0.4) * a; head(stage, cur[1], cur[2], aK, a);
  } else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/telescope-types/scenes.mjs --emit-sound');
}
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const c of COLORS) h += focalAt(560, c.lam, CHROMA_X) / 1000; h += airy(1.3) + needD(LAM_RADIO) / 1000;
  return `${h.toFixed(5)}@${tl.duration.toFixed(3)}/${P.nights.at(-1).toFixed(3)}/${P.segT[0].toFixed(3)}/${P.hexT[0].toFixed(3)}/${P.bandStop.at(-1).toFixed(3)}/${P.a0.toFixed(3)}`;
}
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  refractor(stage, t, p, ctx) { refractorScene(stage, t, ctx); },
  reflector(stage, t, p, ctx) { reflectorScene(stage, t, ctx); },
  radio(stage, t, p, ctx) { radioScene(stage, t, ctx); },
  space(stage, t, p, ctx) { spaceScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → trio → Galileo → eye vs 10 m
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  withAlpha(c, ef, () => {
    const pa = fadeOut(t, P.trio, 0.5);
    if (pa > 0) posterPicture(stage, t, pa);
    const ta = fadeIn(t, P.trio, 0.45) * fadeOut(t, P.gal, 0.45);
    if (ta > 0) withAlpha(c, ta, () => trio(stage, t, [fadeIn(t, P.lens1, 0.35), fadeIn(t, P.mirror1, 0.35), fadeIn(t, P.dish1, 0.35)], {y0: 600}));
    const ga = fadeIn(t, P.gal, 0.45) * fadeOut(t, P.eye, 0.45);
    if (ga > 0) galileo(stage, t, P, ga);
    const ea = fadeIn(t, P.eye, 0.45);
    if (ea > 0) eyeVsMirror(stage, t, P, ea);
    if (t >= MORPH[1]) captionShade(c, fadeIn(t, 0.95, 0.4));
  });
}
function galileo(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    // the small refractor (side view), pointing at the sky window
    const b = [200, 1180], e = [470, 930], ang = Math.atan2(e[1] - b[1], e[0] - b[0]);
    c.save(); c.translate(b[0], b[1]); c.rotate(ang);
    const L = Math.hypot(e[0] - b[0], e[1] - b[1]);
    const g = c.createLinearGradient(0, -16, 0, 16); g.addColorStop(0, '#8A5A3A'); g.addColorStop(0.5, '#C08A5A'); g.addColorStop(1, '#5A3A26');
    rect(c, 0, -15, L, 30, 6, g, rgba('#0A1418', 0.8), 1.2);
    rect(c, -26, -10, 30, 20, 4, '#6A4630', rgba('#0A1418', 0.8), 1);
    lensShape(c, 0, 0, 0, 0); c.restore();
    c.save(); c.translate(e[0], e[1]); c.rotate(ang + Math.PI / 2); lensShape(c, 0, 0, 17, 7, 0); c.restore();
    line(c, [[b[0] + 40, b[1] + 6], [b[0] + 20, b[1] + 120]], rgba('#9A7A5A', 0.8), 4); line(c, [[b[0] + 60, b[1] - 6], [b[0] + 110, b[1] + 120]], rgba('#9A7A5A', 0.8), 4);
    line(c, [e, [604, 860]], rgba(PAL.ray, 0.25), 2, {dash: [8, 10]});
    stage.text('1610 · 갈릴레이', 150, 1246, {role: 'display', size: 34, weight: 700, color: T.ink});
    stage.text('손수 만든 굴절망원경', 150, 1290, {size: 26, weight: 500, color: T.muted});
    // the view through it: Jupiter and the four moons, night by night
    const vx = 655, vy = 720, R = 230, d = P.day(t);
    c.save(); c.beginPath(); c.arc(vx, vy, R, 0, TAU); c.clip();
    c.fillStyle = '#03080B'; c.fillRect(vx - R, vy - R, 2 * R, 2 * R);
    for (let i = 0; i < 26; i++) circle(c, vx - R + rand(i * 3.1) * 2 * R, vy - R + rand(i * 7.7) * 2 * R, 0.6 + rand(i * 1.9) * 1.1, rgba('#DDEBF0', 0.35));
    const kx = 7.6, Rj = 15;
    const jupA = fadeIn(t, P.jup, 0.4) * 0.6 + 0.4;
    glow(c, vx, vy, 60, '#FFE2B0', 0.18 * jupA);
    circle(c, vx, vy, Rj, mix('#E8D2AE', '#FFFFFF', 0.2)); line(c, [[vx - Rj * 0.9, vy - 3], [vx + Rj * 0.9, vy - 3]], rgba('#B8936A', 0.8), 2); line(c, [[vx - Rj * 0.9, vy + 3], [vx + Rj * 0.9, vy + 3]], rgba('#B8936A', 0.6), 1.5);
    const ma = fadeIn(t, P.moonLbl, 0.4);
    MOONS.forEach((m, i) => {
      const ph = m.ph + TAU * d / m.P, x = vx + kx * m.a * Math.sin(ph), behind = Math.cos(ph) < 0 && Math.abs(x - vx) < Rj;
      if (behind) return;
      glow(c, x, vy, 18, '#FFF1D2', 0.35 + 0.25 * ma); circle(c, x, vy, 5, '#FFF6E6');
    });
    c.restore();
    ring(c, vx, vy, R, rgba(PAL.metal, 0.75), 4); ring(c, vx, vy, R + 10, rgba(PAL.metal, 0.25), 10);
    const day = Math.min(P.days, Math.floor(d));
    stage.text(`1월 ${7 + day}일 밤`, vx, vy + R + 50, {role: 'display', size: 34, weight: 700, color: PAL.answer, align: 'center'});
    tag(stage, '위치는 모형', vx, vy - R - 30, {size: 24, color: T.muted, plate: false});
    if (ma > 0) withAlpha(c, ma, () => { tag(stage, '목성', vx, vy + 46, {size: 26, color: T.ink, plateA: 0.6}); tag(stage, '위성 4개', vx, vy - 46, {size: 26, color: PAL.answer, plateA: 0.6}); });
  });
}
function eyeVsMirror(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, z = P.zoom(t), cx = 540, cy = 740;
  const pxPerMm = 43 * 794 ** (-z), rp = 3.5 * pxPerMm, rm = 5000 * pxPerMm;
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); c.rect(120, 330, 840, 790); c.clip();
    // photon rain (uniform), brighter where it lands on a collector
    for (let i = 0; i < 160; i++) {
      const x = 150 + rand(i * 1.37) * 780, sp = 260 + 120 * rand(i * 2.9), y = 360 + ((rand(i * 5.3) * 1000 + t * sp) % 960);
      const inM = Math.hypot(x - cx, y - cy) < rm, inP = Math.hypot(x - cx, y - cy) < Math.max(rp, 4);
      circle(c, x, y, inM || inP ? 2.6 : 1.8, rgba(inM || inP ? PAL.focus : PAL.rayDim, inM || inP ? 0.85 : 0.35));
    }
    // the 10 m segmented mirror (when it fits on screen)
    if (rm < 3000) {
      const hr = 0.9 * 1000 * pxPerMm, sp = 1.56 / Math.sqrt(3) * 1000 * pxPerMm;
      c.save(); c.globalAlpha *= smooth((3000 - rm) / 1500) * lerp(0.55, 1, smooth((900 - rm) / 500));
      for (const h of KECK_HEX) { const x = cx + h.x * sp, y = cy + h.y * sp; hexPath(c, x, y, hr * 0.97, 0);
        c.fillStyle = rgba(mix('#2F4A52', '#B9CCD0', 0.35 + 0.25 * rand(h.q * 7 + h.r * 13)), 0.92); c.fill(); c.strokeStyle = rgba('#DDEBEF', 0.7); c.lineWidth = 1.4; c.stroke(); }
      c.restore();
      if (rm < 600) {
        const la = smooth((600 - rm) / 250);
        withAlpha(c, la, () => tag(stage, '켁 망원경 · 지름 10 m · 조각 36개', cx, cy - rm - 42, {size: 30, color: T.ink}));
      }
    }
    // the pupil
    const pr = Math.max(4, rp);
    if (rp > 6) { const g = c.createRadialGradient(cx, cy, 0, cx, cy, pr); g.addColorStop(0, '#05090B'); g.addColorStop(0.78, '#0B1418'); g.addColorStop(1, '#3A5A64');
      circle(c, cx, cy, pr * 1.9, rgba('#5C7F6E', 0.55 * smooth((rp - 6) / 30))); circle(c, cx, cy, pr, g); }
    else { circle(c, cx, cy, 5, PAL.answer); ring(c, cx, cy, 14, rgba(PAL.answer, 0.9), 2.5); }
    const lp = [cx + Math.max(pr, 14) * 0.75 + 10, cy - Math.max(pr, 14) * 0.75 - 10];
    line(c, [lp, [lp[0] + 70, lp[1] - 60]], rgba(PAL.answer, 0.9), 2);
    tag(stage, '눈동자 7 mm', lp[0] + 76, lp[1] - 64, {size: 28, color: PAL.answer, align: 'left'});
    c.restore();
    // readouts
    const Dmm = 7 * 10 ** (z * Math.log10(10000 / 7)), area = (Dmm / 7) ** 2;
    panelBox(c, T, 150, 1150, 780, 160);
    stage.text('입구 지름', 190, 1195, {size: 26, weight: 500, color: T.muted});
    stage.text(Dmm < 1000 ? `${Dmm < 100 ? Dmm.toFixed(0) : Math.round(Dmm)} mm` : `${(Dmm / 1000).toFixed(1)} m`, 190, 1255, {role: 'display', size: 50, weight: 700, color: T.ink});
    stage.text('모으는 빛', 560, 1195, {size: 26, weight: 500, color: T.muted});
    const xa = fadeIn(t, P.x200, 0.3);
    stage.text(`× ${koNum(area)}`, 560, 1255, {role: 'display', size: 50, weight: 700, color: mix(T.ink, PAL.answer, xa)});
  });
}
function panelBox(c, T, x, y, w, h, a = 0.82) { rect(c, x, y, w, h, 14, rgba(T.plate, a), rgba(T.border, 1), 1.5); }

// ------------------------------------------------------------------ origin: tele + skopein, 望遠鏡, Lipperhey 1608
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, sf = fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3);
  withAlpha(c, sf, () => {
    const wa = fadeOut(t, P.lipIn, 0.45);
    if (wa > 0) withAlpha(c, wa, () => {
      const card = (x, y, big, small, q, col) => { if (q <= 0) return; withAlpha(c, q, () => {
        const dy = (1 - q) * 30; rect(c, x - 130, y - 70 + dy, 260, 150, 14, rgba(T.plate, 0.85), rgba(col, 0.9), 1.8);
        stage.text(big, x, y - 14 + dy, {role: 'display', size: 50, weight: 700, color: T.ink, align: 'center'}); stage.text(small, x, y + 44 + dy, {size: 28, weight: 500, color: col, align: 'center'}); }); };
      stage.text('그리스어', 160, 400, {size: 26, weight: 700, color: T.muted});
      card(300, 500, 'tele', '멀리', fadeIn(t, P.tele, 0.35), PAL.answer);
      withAlpha(c, fadeIn(t, P.skop, 0.3), () => stage.text('+', 465, 500, {role: 'display', size: 54, weight: 700, color: T.muted, align: 'center'}));
      card(640, 500, 'skopein', '보다', fadeIn(t, P.skop, 0.35), PAL.answer);
      const ma = fadeIn(t, P.merge, 0.4);
      if (ma > 0) withAlpha(c, ma, () => { arrow(c, [470, 600], [470, 650], T.muted, 3); stage.text('telescope', 470, 712, {role: 'display', size: 64, weight: 700, color: PAL.answer, align: 'center'}); });
      const ha = fadeIn(t, P.han, 0.4);
      if (ha > 0) withAlpha(c, ha, () => {
        stage.text('한자', 160, 830, {size: 26, weight: 700, color: T.muted});
        const H = [['望', '바랄 망', P.look], ['遠', '멀 원', P.look + 0.2], ['鏡', '거울 경', P.gyeong]];
        H.forEach(([ch, rd, t0], i) => { const x = 300 + 170 * i, hl = fadeIn(t, t0, 0.3);
          rect(c, x - 70, 880, 140, 150, 12, rgba(T.plate, 0.85), rgba(mix(T.border, PAL.answer, hl), 1), 1.8);
          stage.text(ch, x, 955, {role: 'body', size: 92, weight: 700, color: mix(T.ink, PAL.answer, hl), align: 'center'});
          stage.text(rd, x, 1075, {size: 28, weight: 500, color: T.muted, align: 'center'}); });
        const la = fadeIn(t, P.gyeong + 0.2, 0.4);
        if (la > 0) withAlpha(c, la, () => stage.text('멀리 바라보는 거울', 470, 1150, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'}));
      });
      // a faint far star whose light travels toward the words (something moving)
      const sx = 840, sy = 380; focusStar(c, sx, sy, 8, 0.8);
      beam(c, [[sx, sy], [700, 470]], PAL.ray, 2, 0.6 * fadeIn(t, P.tele, 0.4), t, {speed: 120});
    });
    const la = fadeIn(t, P.lipIn, 0.45);
    if (la > 0) lipperhey(stage, t, P, la);
    captionShade(c, 1);
  });
}
function lipperhey(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, y0 = 820, xo = 240, xe = 760, fo = 600, fe = 70, hs = [-95, -60, -25, 25, 60, 95];
  withAlpha(c, a, () => {
    // tube (two lens holders)
    const g = c.createLinearGradient(0, y0 - 130, 0, y0 + 130); g.addColorStop(0, rgba('#3C2C20', 0.9)); g.addColorStop(0.5, rgba('#1A1410', 0.35)); g.addColorStop(1, rgba('#3C2C20', 0.9));
    rect(c, xo - 10, y0 - 125, xe - xo + 30, 250, 10, g, rgba('#A07850', 0.8), 2);
    rect(c, xe - 20, y0 - 55, 120, 110, 8, rgba('#2A2018', 0.7), rgba('#A07850', 0.8), 2);
    // rays: parallel → objective → converging toward xo+fo → concave eyepiece makes them parallel (narrow)
    for (const h of hs) {
      const ye = y0 + h * (1 - (xe - xo) / fo), yOut = ye;
      beam(c, [[100, y0 + h], [xo, y0 + h]], PAL.ray, 2.4, 1, t, {speed: 220, phase: h * 3});
      beam(c, [[xo, y0 + h], [xe, ye]], PAL.ray, 2.4, 1, t, {speed: 220, phase: h * 3 - 140});
      beam(c, [[xe, ye], [920, yOut]], PAL.ray, 2.4, 1, t, {speed: 220, phase: h * 3 - 660});
    }
    // objective: convex (vertical), eyepiece: concave
    c.save(); c.translate(xo, y0); c.rotate(Math.PI / 2); lensShape(c, 0, 0, 118, 26, 0); c.restore();
    const ce = [], n = 24; for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n; ce.push([xe - 7 - 6 * u * u, y0 + u * 46]); } for (let i = n; i >= 0; i--) { const u = -1 + 2 * i / n; ce.push([xe + 7 + 6 * u * u, y0 + u * 46]); }
    poly(c, ce, rgba(PAL.glass, 0.6), rgba('#E8FBFF', 0.9), 1.6);
    const l2 = fadeIn(t, P.two, 0.35);
    if (l2 > 0) withAlpha(c, l2, () => { tag(stage, '볼록렌즈', xo, y0 - 175, {size: 28, color: T.ink}); tag(stage, '오목렌즈', xe, y0 - 105, {size: 28, color: T.ink}); });
    const ta = fadeIn(t, P.tube, 0.35);
    if (ta > 0) withAlpha(c, ta, () => { line(c, [[xo - 10, y0 + 150], [xe + 100, y0 + 150]], rgba(PAL.answer, 0.8), 2); stage.text('원통 · 약 3배로 크게 보임', 500, y0 + 192, {size: 28, weight: 500, color: T.muted, align: 'center'}); });
    stage.text('1608 · 리퍼세이', 160, 1110, {role: 'display', size: 38, weight: 700, color: mix(T.ink, PAL.answer, fadeIn(t, P.lip, 0.3))});
    stage.text('네덜란드의 안경 장인', 160, 1158, {size: 28, weight: 500, color: T.muted});
    const pa = fadeIn(t, P.patent, 0.35);
    if (pa > 0) tag(stage, '처음으로 특허 신청', 720, 1130, {size: 30, color: PAL.answer, a: pa, border: PAL.answer});
  });
}

// ------------------------------------------------------------------ essence: aperture knob D, light ∝ D², two-star images
const EM = {cx: 540, vy: 960, f: 380, a0: 130, top: 350};
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, D = P.D(t), a = EM.a0 * D, y = parab(EM.cx, EM.vy, EM.f), F = [EM.cx, EM.vy - EM.f];
  withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3), () => {
    // rays: fixed spacing → number of rays in the cross-section grows with D (area grows with D²)
    const lit = fadeIn(t, P.light6, 0.5);
    for (let x = 160; x <= 920; x += 46) {
      const dx = x - EM.cx; if (Math.abs(dx) < 10) continue;
      if (Math.abs(dx) <= a) {
        const ym = y(x);
        beam(c, [[x, EM.top], [x, ym]], PAL.ray, 2.6, 1, t, {speed: 230, phase: dx * 2.3, base: 0.4});
        beam(c, [[x, ym], F], PAL.ray, 2.6, 0.35 + 0.65 * lit, t, {speed: 230, phase: dx * 2.3 - (ym - EM.top), base: 0.45});
      } else {
        line(c, [[x, EM.top], [x, 1060]], rgba(PAL.rayDim, 0.12), 2);
      }
    }
    mirrorShape(c, EM.cx, EM.vy, EM.f, a, {thick: 16});
    const wa = fadeIn(t, P.wide6, 0.35);
    if (wa > 0) withAlpha(c, wa, () => {
      const yy = EM.vy + 50; line(c, [[EM.cx - a, yy], [EM.cx + a, yy]], PAL.answer, 3); line(c, [[EM.cx - a, yy - 12], [EM.cx - a, yy + 12]], PAL.answer, 3); line(c, [[EM.cx + a, yy - 12], [EM.cx + a, yy + 12]], PAL.answer, 3);
      tag(stage, '입구 지름 D', EM.cx, yy + 40, {size: 28, color: PAL.answer, plate: false});
    });
    const pulse = Math.exp(-Math.max(0, t - P.point6) / 0.6) * (t >= P.point6 ? 1 : 0);
    focusStar(c, F[0], F[1], 16 + 7 * (D * D - 1) + 12 * pulse, 0.55 + 0.45 * lit);
    if (t > P.point6 - 0.2) tag(stage, '한 점 · 초점', F[0] + 120, F[1] - 40, {size: 26, color: T.ink, a: fadeIn(t, P.point6 - 0.2, 0.3), plateA: 0.7});
    const za = fadeIn(t, P.zoom6, 0.3) * fadeOut(t, P.wide6 + 0.6, 0.4);
    if (za > 0) tag(stage, '확대보다 모으기', 540, 400, {size: 30, color: T.muted, a: za});
    // gauges
    const ga = fadeIn(t, P.d0 - 0.6, 0.4);
    if (ga > 0) withAlpha(c, ga, () => {
      panelBox(c, T, 150, 1090, 780, 245);
      stage.text('입구 지름', 180, 1128, {size: 26, weight: 500, color: T.muted});
      stage.text(`× ${D.toFixed(1)}`, 180, 1178, {role: 'display', size: 46, weight: 700, color: T.ink});
      stage.text('모으는 빛 (넓이)', 180, 1236, {size: 26, weight: 500, color: T.muted});
      const bw = 70 * D * D; rect(c, 180, 1266, 280, 30, 6, rgba(T.border, 0.6)); rect(c, 180, 1266, bw, 30, 6, mix(PAL.rayDim, PAL.answer, fadeIn(t, P.x4, 0.3)));
      stage.text(`× ${(D * D).toFixed(1)}`, 476, 1281, {role: 'display', size: 34, weight: 700, color: mix(T.ink, PAL.answer, fadeIn(t, P.x4, 0.3))});
      const ia = fadeIn(t, P.small7, 0.4);
      if (ia > 0) withAlpha(c, ia, () => {
        stage.text('초점에 맺힌 두 별', 742, 1124, {size: 26, weight: 500, color: T.muted, align: 'center'});
        starImage(stage, 'ess1', 660, 1218, 66, {D: 1, kpx: 34, gain: 1.4});
        starImage(stage, 'ess2', 832, 1218, 66, {D: 2, kpx: 34, gain: 1.4, a: fadeIn(t, P.split - 0.2, 0.35)});
        stage.text('지름 ×1', 660, 1312, {size: 24, weight: 700, color: T.muted, align: 'center'});
        stage.text('지름 ×2', 832, 1312, {size: 24, weight: 700, color: mix(T.muted, PAL.answer, fadeIn(t, P.split, 0.3)), align: 'center'});
      });
    });
  });
}

// ------------------------------------------------------------------ refractor: lens, chromatic aberration, sag, 1.02 m
const RF = {cx: 330, ly: 470, h: 130, fG: 560, wall: 150, top: 350, bottom: 1150};
function refractorRays(c, t, P, chroma, sag, a = 1, M = null) {
  const mp = M ? pts => pts.map(M) : pts => pts, sp = M ? 3.4 : 1;
  const X = chroma * CHROMA_X, fs = COLORS.map(cl => focalAt(RF.fG, cl.lam, X));
  for (const dx of [-112, -80, -48, -16, 16, 48, 80, 112]) {
    const x = RF.cx + dx, yl = RF.ly + sag * (1 - (dx / RF.h) ** 2);
    if (!M) beam(c, [[x, RF.top], [x, yl]], PAL.ray, 2.4, a, t, {speed: 220, phase: dx * 2.1, base: 0.45});
    if (chroma < 0.02) {
      const F = [RF.cx, RF.ly + RF.fG], end = [RF.cx - dx * (RF.bottom - F[1]) / RF.fG * 0.9, RF.bottom];
      beam(c, mp([[x, yl], F, end]), PAL.ray, 2.4, a, t, {speed: 220 * sp, phase: (dx * 2.1 - (yl - RF.top)) * sp, base: 0.45});
    } else {
      COLORS.forEach((cl, k) => {
        const F = [RF.cx, RF.ly + fs[k]], end = [RF.cx - dx * (RF.bottom - F[1]) / fs[k], RF.bottom];
        beam(c, mp([[x, yl], F, end]), mix(PAL.ray, cl.col, chroma), M ? 2.6 : 2.0, a * (0.75 + 0.25 * chroma), t, {speed: 220 * sp, phase: (dx * 2.1 - (yl - RF.top)) * sp, base: 0.4, dash: M ? [40, 90] : undefined});
      });
    }
  }
  return fs;
}
function diameterRuler(stage, t, list, a) {
  // list: [{name, m, col, q}] — horizontal bars on a 10 m scale
  const c = stage.ctx, T = stage.theme, x0 = 180, k = 70;
  withAlpha(c, a, () => {
    panelBox(c, T, 150, 1172, 780, 170);
    stage.text('렌즈 · 거울 지름', 180, 1200, {size: 24, weight: 700, color: T.muted});
    for (let m = 0; m <= 10; m += 2) { line(c, [[x0 + m * k, 1300], [x0 + m * k, 1310]], rgba(T.muted, 0.8), 2); stage.text(`${m} m`, x0 + m * k, 1326, {size: 24, color: T.muted, align: 'center'}); }
    line(c, [[x0, 1300], [x0 + 10 * k, 1300]], rgba(T.muted, 0.6), 1.5);
    list.forEach((b, i) => { if (b.q <= 0) return; const y = 1238 + 40 * i, w = b.m * k * b.q;
      withAlpha(c, smooth(b.q / 0.2), () => { rect(c, x0, y - 15, Math.max(4, w), 30, 5, b.col);
        const tw = stage.measure(b.name, {size: 26, weight: 700});
        if (w > tw + 40) stage.text(b.name, x0 + 14, y, {size: 26, weight: 700, color: '#0B1418'});
        else stage.text(b.name, x0 + w + 14, y, {size: 26, weight: 700, color: T.ink}); }); });
  });
}
function refractorScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, chroma = P.chroma(t), sag = 22 * P.sag(t);
  withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3), () => {
    // tube
    rect(c, RF.cx - RF.wall, RF.ly - 40, 2 * RF.wall, RF.bottom - RF.ly + 40, 10, rgba(PAL.tube, 0.55), rgba(PAL.metal, 0.35), 2);
    const fs = refractorRays(c, t, P, chroma, sag, 1);
    lensShape(c, RF.cx, RF.ly, RF.h, 26, sag);
    // edge supports
    const ea = fadeIn(t, P.edge, 0.3);
    for (const s of [-1, 1]) { const x = RF.cx + s * (RF.h + 8); poly(c, [[x, RF.ly - 16], [x + s * 22, RF.ly - 26], [x + s * 22, RF.ly + 26], [x, RF.ly + 16]], mix('#506268', PAL.answer, ea), rgba('#0A1418', 0.8), 1); }
    if (ea > 0) tag(stage, '가장자리만 받침', RF.cx, RF.ly - 72, {size: 26, color: PAL.answer, a: ea});
    if (sag > 0.5) withAlpha(c, P.sag(t), () => { arrow(c, [RF.cx, RF.ly + 30], [RF.cx, RF.ly + 92], PAL.bad, 4); tag(stage, '무게 · 처짐 과장', RF.cx + 70, RF.ly + 120, {size: 24, color: PAL.bad, align: 'left'}); });
    const la = fadeIn(t, P.convex, 0.35);
    if (la > 0) tag(stage, '볼록렌즈', RF.cx - 60, RF.ly - 120, {size: 28, color: T.ink, a: la * fadeOut(t, P.edge - 0.3, 0.3)});
    // focus tracker (①) → inset (②)
    const Fg = [RF.cx, RF.ly + fs[1]], fa = fadeIn(t, P.point8, 0.35);
    if (fa > 0) withAlpha(c, fa, () => { ring(c, Fg[0], Fg[1], 46, PAL.answer, 3); });
    if (chroma < 0.5) focusStar(c, Fg[0], Fg[1], 10, fadeIn(t, P.point8 - 0.3, 0.4) * (1 - chroma * 2));
    const ia = fadeIn(t, P.c0 - 0.3, 0.4);
    if (ia > 0) withAlpha(c, ia, () => {
      const ix = 735, iy = 700, R = 165, m = 3.4;
      line(c, [[Fg[0] + 44, Fg[1] - 14], [ix - R * 0.8, iy + R * 0.6]], rgba(PAL.answer, 0.7), 2, {dash: [6, 6]});
      circle(c, ix, iy, R + 4, '#02070A');
      c.save(); c.beginPath(); c.arc(ix, iy, R, 0, TAU); c.clip();
      refractorRays(c, t, P, chroma, sag, 1, ([x, y]) => [ix + (x - Fg[0]) * m, iy + (y - Fg[1]) * m]);
      c.restore();
      ring(c, ix, iy, R + 3, PAL.answer, 3);
      stage.text('② 초점 확대', ix, iy - R - 30, {size: 26, weight: 700, color: T.muted, align: 'center'});
      if (chroma > 0.3) withAlpha(c, smooth((chroma - 0.3) / 0.4), () => {
        COLORS.forEach((cl, k) => { const yy = iy + (fs[k] - fs[1]) * m; if (Math.abs(yy - iy) > R - 10) return; line(c, [[ix + R - 70, yy], [ix + R - 18, yy]], cl.col, 3); glow(c, ix, yy, 16, cl.col, 0.6); circle(c, ix, yy, 5.5, cl.col); ring(c, ix, yy, 8, '#02070A', 2); });
        tag(stage, '색 차이 과장', ix, iy + R + 32, {size: 24, color: T.muted, plate: false});
      });
      // star image with the rainbow halo
      const ra = fadeIn(t, P.rainbow, 0.4) * fadeOut(t, P.ruler, 0.4);
      if (ra > 0) withAlpha(c, ra, () => {
        const sx = 735, sy = 1005;
        circle(c, sx, sy, 78, '#02070A'); ring(c, sx, sy, 80, rgba(T.border, 1), 2.5);
        c.save(); c.globalCompositeOperation = 'lighter';
        for (const [rr, col, al] of [[52, '#FF5A6E', 0.55], [40, '#B07CFF', 0.5], [26, '#79A8FF', 0.35]]) { const g = c.createRadialGradient(sx, sy, rr * 0.55, sx, sy, rr); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.6, rgba(col, al)); g.addColorStop(1, rgba(col, 0)); circle(c, sx, sy, rr, g); }
        glow(c, sx, sy, 22, '#E6FFE0', 0.9); c.restore();
        stage.text('별 둘레의 무지갯빛 테', sx, sy + 112, {size: 26, weight: 700, color: T.ink, align: 'center'});
      });
    });
    const ra = fadeIn(t, P.ruler, 0.4);
    if (ra > 0) diameterRuler(stage, t, [{name: '가장 큰 굴절망원경 1.02 m · 1897', m: YERKES_M, col: PAL.glass, q: smooth((t - P.yerkes) / 0.5)}], ra);
  });
}

// ------------------------------------------------------------------ reflector: Newtonian, all colours to one focus, segments
const NW = {cx: 330, vy: 1050, f: 520, a: 130, wall: 150, top: 350, yd: 720};
function newtonRays(c, t, a) {
  const y = parab(NW.cx, NW.vy, NW.f), Fy = NW.vy - NW.f, Fp = [NW.cx + (NW.yd - Fy), NW.yd];
  const cols = [COLORS[0].col, COLORS[1].col, COLORS[2].col];
  [-122, -98, -74, -50, 50, 74, 98, 122].forEach((dx, i) => {
    const x = NW.cx + dx, ym = y(x), M = [x, ym];
    // where the converging ray M→F meets the diagonal (line through (cx, yd) with direction (1, −1))
    const F = [NW.cx, Fy], dir = [F[0] - M[0], F[1] - M[1]];
    const s = ((NW.cx - M[0]) + (NW.yd - M[1])) / (dir[0] + dir[1]), Q = [M[0] + s * dir[0], M[1] + s * dir[1]];
    const col = mix(PAL.ray, cols[i % 3], a.col);
    beam(c, [[x, NW.top], M], PAL.ray, 2.4, a.al, t, {speed: 220, phase: dx * 2.1, base: 0.45});
    beam(c, [M, Q, Fp], col, 2.4, a.al, t, {speed: 220, phase: dx * 2.1 - (ym - NW.top), base: 0.5});
  });
  return Fp;
}
function reflectorScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme;
  withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3), () => {
    rect(c, NW.cx - NW.wall, 400, 2 * NW.wall, NW.vy - 400 + 40, 10, rgba(PAL.tube, 0.55), rgba(PAL.metal, 0.35), 2);
    rect(c, NW.cx + NW.wall - 2, NW.yd - 30, 60, 60, 6, rgba(PAL.tube, 0.8), rgba(PAL.metal, 0.5), 2);
    const colQ = fadeIn(t, P.all, 0.5);
    const Fp = newtonRays(c, t, {al: 1, col: colQ});
    mirrorShape(c, NW.cx, NW.vy, NW.f, NW.a, {thick: 18});
    // diagonal flat
    const L = 50; line(c, [[NW.cx - L * 0.7071, NW.yd + L * 0.7071], [NW.cx + L * 0.7071, NW.yd - L * 0.7071]], '#DDE8EA', 7);
    line(c, [[NW.cx, 400], [NW.cx, NW.yd - 30]], rgba(PAL.metal, 0.5), 2);
    focusStar(c, Fp[0], Fp[1], 10, 0.6 + 0.4 * fadeIn(t, P.bounce, 0.4));
    const ma = fadeIn(t, P.concave, 0.35);
    if (ma > 0) withAlpha(c, ma * fadeOut(t, P.back - 0.3, 0.3), () => { tag(stage, '오목거울', NW.cx, NW.vy + 62, {size: 28, color: T.ink}); tag(stage, '평면거울', NW.cx - 120, NW.yd - 40, {size: 26, color: T.muted, plate: false}); });
    stage.text('1668 · 뉴턴', 600, 470, {role: 'display', size: 38, weight: 700, color: mix(T.ink, PAL.answer, fadeIn(t, P.newton, 0.3)), align: 'left'});
    stage.text('반사망원경', 600, 516, {size: 28, weight: 500, color: T.muted, align: 'left'});
    const sa = fadeIn(t, P.same, 0.4);
    if (sa > 0) withAlpha(c, sa, () => { ring(c, Fp[0], Fp[1], 30, PAL.answer, 3); line(c, [[Fp[0] + 30, Fp[1] - 8], [610, 640]], rgba(PAL.answer, 0.8), 2); tag(stage, '모든 색이 한 점에', 610, 620, {size: 28, color: PAL.answer, align: 'left'}); });
    // ② face-on mirror: support points behind → segmented 10 m
    const fa = fadeIn(t, P.back, 0.4);
    if (fa > 0) withAlpha(c, fa, () => {
      const fx = 745, fy = 870, R = 160, segQ = fadeIn(t, P.seg0 - 0.2, 0.3);
      if (segQ < 1) withAlpha(c, 1 - segQ, () => {
        const g = c.createRadialGradient(fx - 40, fy - 50, 10, fx, fy, R); g.addColorStop(0, '#E6EFF1'); g.addColorStop(1, '#5F7379'); circle(c, fx, fy, R * 0.62, g); ring(c, fx, fy, R * 0.62, rgba('#0A1418', 0.8), 1.5);
        const wa = fadeIn(t, P.whole, 0.4);
        for (let k = 0; k < 18; k++) { const r = k < 6 ? 0.25 : 0.5, an = k < 6 ? k * TAU / 6 : (k - 6) * TAU / 12 + 0.26; circle(c, fx + r * R * Math.cos(an), fy + r * R * Math.sin(an), 5, rgba(PAL.answer, 0.5 + 0.5 * wa)); }
        tag(stage, '뒤에서 여러 점으로 받침', fx, fy + R * 0.62 + 40, {size: 26, color: PAL.answer, a: wa});
      });
      if (segQ > 0) {
        const hr = R / 5.58 * 0.9, sp = R / 5.58 * 1.56 / Math.sqrt(3);
        KECK_HEX.forEach((h, k) => { const q = fadeIn(t, P.segT[k], 0.12); if (q <= 0) return;
          const x = fx + h.x * sp, y = fy + h.y * sp; hexPath(c, x, y, hr * 0.96 * (0.6 + 0.4 * q), 0);
          c.fillStyle = rgba(mix('#3A5560', '#C9D9DC', 0.4 + 0.25 * rand(k * 3.3)), q); c.fill(); c.strokeStyle = rgba('#E8F2F4', 0.7 * q); c.lineWidth = 1.2; c.stroke(); });
        tag(stage, '조각 36개 · 켁 망원경', fx, fy + R + 30, {size: 26, color: T.ink, a: fadeIn(t, P.segT[35], 0.3)});
      }
      stage.text('② 거울 정면', fx, fy - R - 26, {size: 26, weight: 700, color: T.muted, align: 'center'});
    });
    diameterRuler(stage, t, [{name: '굴절 최대 1.02 m', m: YERKES_M, col: PAL.glass, q: 1}, {name: '켁 10 m · 1993', m: KECK_M, col: PAL.metal, q: smooth((t - P.ten) / 0.9)}], 1);
  });
}

// ------------------------------------------------------------------ radio: dish, wavelength vs required diameter, Earth-sized array
const RD = {cx: 540, vy: 1110, f: 260, a: 320, top: 680};
function radioScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme;
  withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3), () => {
    const da = fadeOut(t, P.globe, 0.45);
    if (da > 0) withAlpha(c, da, () => {
      const lamPx = 70 + 40 * smooth((t - P.l0) / (P.l1 - P.l0));
      dishWaves(c, t, RD.cx, RD.vy, RD.f, RD.a, RD.top, lamPx, fadeIn(t, P.waves, 0.5) * 0.9 + 0.1);
      dishShape(c, RD.cx, RD.vy, RD.f, RD.a, 1);
      const F = [RD.cx, RD.vy - RD.f];
      focusStar(c, F[0], F[1], 12, 0.7, PAL.radio);
      const la = fadeIn(t, P.dish, 0.35);
      if (la > 0) withAlpha(c, la, () => { tag(stage, '금속 접시', RD.cx + 200, RD.vy + 10, {size: 28, color: T.ink}); tag(stage, '수신기', F[0] + 90, F[1] - 6, {size: 26, color: PAL.radio, align: 'left', plateA: 0.7}); });
      const ia = fadeIn(t, P.invis, 0.35) * fadeOut(t, P.chart - 0.2, 0.3);
      if (ia > 0) tag(stage, '전파 · 눈에 보이지 않는 빛', 540, 420, {size: 28, color: PAL.radio, a: ia});
      // required-diameter chart
      const ca = fadeIn(t, P.chart, 0.4);
      if (ca > 0) withAlpha(c, ca, () => {
        panelBox(c, T, 150, 350, 780, 290);
        stage.text('사람 눈만큼 또렷하려면 필요한 지름', 180, 388, {size: 26, weight: 700, color: T.muted});
        const lgMin = -3, lgMax = 3.2, xL = 200, xR = 900, xp = lg => lerp(xL, xR, (lg - lgMin) / (lgMax - lgMin));
        for (let lg = -3; lg <= 3; lg++) { line(c, [[xp(lg), 600], [xp(lg), 612]], rgba(T.muted, 0.8), 2); stage.text(['1 mm', '1 cm', '10 cm', '1 m', '10 m', '100 m', '1 km'][lg + 3], xp(lg), 624, {size: 24, color: T.muted, align: 'center'}); }
        line(c, [[xL, 600], [xR, 600]], rgba(T.muted, 0.5), 1.5);
        const lamLog = P.lamLog(t), lamM = 10 ** lamLog, Dm = needD(lamM);
        const fmtL = lamM < 1e-3 ? `${(lamM * 1e6).toFixed(lamM < 1e-5 ? 1 : 0)} μm` : lamM < 1e-2 ? `${(lamM * 1e3).toFixed(0)} mm` : `${(lamM * 100).toFixed(0)} cm`;
        const fmtD = Dm < 1 ? (Dm < 0.01 ? `${(Dm * 1000).toFixed(1)} mm` : `${(Dm * 100).toFixed(0)} cm`) : `${(Dm >= 100 ? Math.round(Dm / 10) * 10 : Math.round(Dm)).toLocaleString('en-US')} m`;
        stage.text('파장', 180, 450, {size: 26, weight: 500, color: T.muted});
        stage.text(fmtL, 270, 450, {role: 'display', size: 38, weight: 700, color: mix(PAL.rayDim, PAL.radio, smooth((lamLog + 6) / 4))});
        const yb = 540, w = xp(Math.log10(Dm)) - xL;
        rect(c, xL, yb - 22, Math.max(6, w), 44, 6, mix(PAL.rayDim, PAL.radio, smooth((lamLog + 6) / 4)));
        const lw = stage.measure(`지름 ${fmtD}`, {role: 'display', size: 34, weight: 700});
        if (w > lw + 40) stage.text(`지름 ${fmtD}`, xL + w - 14, yb, {role: 'display', size: 34, weight: 700, color: '#0B1418', align: 'right'});
        else stage.text(`지름 ${fmtD}`, xL + Math.max(6, w) + 14, yb, {role: 'display', size: 34, weight: 700, color: T.ink});
        // ghost of the visible-light result
        const g0 = xp(Math.log10(needD(LAM_VIS))) - xL;
        if (lamLog > -5) { line(c, [[xL + g0, yb - 30], [xL + g0, yb + 30]], rgba(PAL.rayDim, 0.8), 2, {dash: [5, 5]}); stage.text('빛 2 mm', xL + g0 + 6, yb - 44, {size: 24, color: PAL.rayDim}); }
        if (t > P.big14) tag(stage, '× 약 40만', 760, 450, {size: 30, color: PAL.answer, a: fadeIn(t, P.big14, 0.3), border: PAL.answer});
      });
    });
    const ga = fadeIn(t, P.globe, 0.45);
    if (ga > 0) withAlpha(c, ga, () => ehtGlobe(stage, t, P));
    captionShade(c, 1);
  });
}
function ehtGlobe(stage, t, P) {
  const c = stage.ctx, T = stage.theme, cx = 540, cy = 800, R = 270;
  const ba = fadeIn(t, P.bh + 0.3, 0.45), gq = fadeOut(t, P.bh, 0.35);
  if (gq > 0) withAlpha(c, gq, () => {
    const V = makeView({cx, cy, R}, -78 + (t - P.globe) * 1.2, -8, 0);
    drawGlobe(stage, V, {land: LAND, grat: 0.12});
    const pts = EHT_SITES.map(s => surfacePoint(V, s.lat, s.lon));
    // baselines
    pts.forEach((p, i) => { if (i === 0) return; const q = fadeIn(t, P.linkT[i - 1], 0.25); if (q <= 0) return;
      for (let j = 0; j < i; j++) line(c, [pts[j], [lerp(pts[j][0], p[0], q), lerp(pts[j][1], p[1], q)]], rgba(PAL.radio, 0.45), 2); });
    pts.forEach((p, i) => { const q = fadeIn(t, P.siteT[i], 0.25); if (q <= 0) return;
      withAlpha(c, q * (p[2] ? 1 : 0.5), () => { glow(c, p[0], p[1], 22, PAL.radio, 0.5); circle(c, p[0], p[1], 6, '#E8FFFB'); }); });
    const va = fadeIn(t, P.virtual, 0.45);
    if (va > 0) withAlpha(c, va, () => { ring(c, cx, cy, R + 26, rgba(PAL.answer, 0.85), 3); stage.text('하나로 묶은 가상의 접시 · 지름 ≈ 지구', cx, cy + R + 70, {size: 28, weight: 700, color: PAL.answer, align: 'center'}); });
    const ya = fadeIn(t, P.virtual, 0.4);
    if (ya > 0) tag(stage, '2019 · 사건 지평선 망원경', cx, cy - R - 54, {size: 28, color: T.ink, a: ya});
  });
  if (ba > 0) withAlpha(c, ba, () => {
    const r0 = 150;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) { const an = i / 90 * TAU, br = 0.45 + 0.55 * Math.max(0, Math.sin(an + 0.4 + 0.15 * Math.sin(t * 0.7))) ** 1.5;
      const x = cx + r0 * Math.cos(an), y = cy + r0 * Math.sin(an); glow(c, x, y, 64, '#FF9A3C', 0.11 * br); glow(c, x, y, 26, '#FFD08A', 0.16 * br); }
    c.restore();
    circle(c, cx, cy, r0 * 0.68, '#020405');
    stage.text('블랙홀의 그림자', cx, cy + r0 + 96, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'});
    stage.text('M87 · 2019 발표 · 설명 그림', cx, cy + r0 + 140, {size: 26, weight: 500, color: T.muted, align: 'center'});
  });
}

// ------------------------------------------------------------------ space: atmosphere bands, twinkle, Hubble & JWST
const SP = {g: 1250, k: 5.5, xs: [380, 470, 560, 650, 740, 830], star: 220, tel: 430};
const hY = h => SP.g - h * SP.k;
function spaceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme;
  withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3), () => {
    const aa = fadeOut(t, P.jwst, 0.45);
    if (aa > 0) withAlpha(c, aa, () => {
      // atmosphere
      const g = c.createLinearGradient(0, hY(100), 0, SP.g); g.addColorStop(0, 'rgba(70,150,190,0)'); g.addColorStop(0.6, 'rgba(70,150,190,0.12)'); g.addColorStop(1, 'rgba(90,170,210,0.32)');
      c.fillStyle = g; c.fillRect(140, hY(100), 800, SP.g - hY(100));
      rect(c, 140, SP.g, 800, 40, 0, '#1C2A22');
      line(c, [[140, hY(100)], [940, hY(100)]], rgba(T.muted, 0.35), 1.5, {dash: [8, 8]});
      stage.text('우주', 160, hY(100) - 30, {size: 26, weight: 700, color: T.muted});
      stage.text('대기', 160, hY(50), {size: 26, weight: 700, color: T.muted});
      // a star's light: straight in space, wiggling in the air
      const sx = SP.star, sa = fadeIn(t, P.shake, 0.4);
      focusStar(c, sx, 380, 8, 0.9);
      const pts = []; for (let y = 390; y <= SP.g; y += 8) { const dep = y > hY(100) ? smooth((y - hY(100)) / (SP.g - hY(100))) : 0;
        pts.push([sx + sa * 16 * dep * (Math.sin(y * 0.045 + t * 7) * 0.6 + Math.sin(y * 0.11 - t * 11) * 0.4), y]); }
      beam(c, pts, PAL.ray, 2.6, 1, t, {speed: 260});
      // ground telescope seeing a twinkling star
      rect(c, sx - 16, SP.g - 50, 32, 50, 4, '#5A6E74'); const tw = 1 + sa * 0.6 * Math.sin(t * 13) * Math.sin(t * 5.3);
      focusStar(c, sx, SP.g - 64, 6 * tw, 0.8);
      if (sa > 0) tag(stage, '흔들리는 별빛', sx + 10, hY(28), {size: 24, color: T.ink, a: sa, align: 'left', plateA: 0.7});
      // bands
      BANDS.forEach((b, k) => {
        const x = SP.xs[k], q = fadeIn(t, P.bandT[k], 0.2); if (q <= 0) return;
        const hNow = lerp(100, b.h, clamp((t - P.bandT[k]) / bandFall(b.h))), y1 = hY(hNow);
        const hl = (b.n === '적외선' ? fadeIn(t, P.irHi, 0.3) : b.n === '엑스선' ? fadeIn(t, P.xrHi, 0.3) : 0);
        withAlpha(c, q, () => {
          stage.text(b.n, x, hY(100) - 60 - (k % 2) * 34, {size: 26, weight: 700, color: mix(T.ink, b.col, 0.5 + 0.5 * hl), align: 'center'});
          line(c, [[x, hY(100) - 30], [x, y1]], rgba(b.col, 0.85), 5 + 2 * hl);
          if (b.h > 0 && t > P.bandStop[k]) { line(c, [[x - 16, y1], [x + 16, y1]], b.col, 5); if (b.n === '적외선') line(c, [[x, y1], [x, SP.g]], rgba(b.col, 0.4), 2, {dash: [4, 7]}); }
          else poly(c, [[x - 10, y1 - 14], [x + 10, y1 - 14], [x, y1 + 2]], b.col);
        });
      });
      const ba = fadeIn(t, P.block, 0.35);
      if (ba > 0) tag(stage, '막힘: 감마선 · 엑스선 · 자외선 · 적외선 대부분', 470, SP.g + 72, {size: 24, color: T.ink, a: ba, plateA: 0.8});
      // telescopes rising above the air
      const rise = (t0, x, name, sz, isJ) => { const q = easeOut((t - t0) / P.rise); if (t < t0) return;
        const y = lerp(SP.g - 30, SP.tel, q); withAlpha(c, fadeIn(t, t0, 0.3), () => { scope(c, x, y, sz, isJ); stage.text(name, x, y + 56, {size: 26, weight: 700, color: T.ink, align: 'center'}); }); };
      rise(P.hub, 420, '허블', 1, false); rise(P.jw, 700, '제임스웹', 1, true);
      stage.text('높이는 대략', 930, SP.g + 72, {size: 24, color: T.muted, align: 'right'});
    });
    const ja = fadeIn(t, P.jwst, 0.45);
    if (ja > 0) withAlpha(c, ja, () => jwstMirror(stage, t, P));
    captionShade(c, 1);
  });
}
function scope(c, x, y, s, isJ) {
  if (isJ) { poly(c, [[x - 46, y + 18], [x + 46, y + 18], [x + 30, y + 30], [x - 30, y + 30]], '#B7A6D8'); for (let k = -1; k <= 1; k++) { hexPath(c, x + k * 15, y - 6, 9, 0); c.fillStyle = PAL.gold; c.fill(); } hexPath(c, x, y - 21, 9, 0); c.fill(); hexPath(c, x, y + 9, 9, 0); c.fill(); }
  else { rect(c, x - 14, y - 34, 28, 64, 5, '#C9D2D6', rgba('#0A1418', 0.8), 1); rect(c, x - 40, y - 8, 22, 12, 2, '#3A6A9A'); rect(c, x + 18, y - 8, 22, 12, 2, '#3A6A9A'); }
}
function jwstMirror(stage, t, P) {
  const c = stage.ctx, T = stage.theme, k = 58, cx = 620, cy = 820, hr = 0.762 * k, u = P.unfold(t), ext = (2 * Math.sqrt(3) + Math.sqrt(3) / 2) * hr;
  // Hubble 2.4 m, same scale
  const hx = 230, hy = 820;
  const g = c.createRadialGradient(hx - 20, hy - 25, 5, hx, hy, 1.2 * k); g.addColorStop(0, '#EEF4F6'); g.addColorStop(1, '#6E8288');
  circle(c, hx, hy, 1.2 * k, g); circle(c, hx, hy, 0.15 * k, '#1A2A30'); ring(c, hx, hy, 1.2 * k, rgba('#0A1418', 0.8), 1.5);
  stage.text('허블 · 1990', hx, hy + 1.2 * k + 44, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
  stage.text('지름 2.4 m', hx, hy + 1.2 * k + 82, {size: 26, weight: 500, color: T.muted, align: 'center'});
  // JWST 18 segments; wing columns |q| = 2 unfold about hinges at x = ±2.25 hr
  const hinge = 1.5 * hr * 1.5, items = [];
  JWST_HEX.forEach((h, i) => {
    let x = h.x * hr, y = h.y * hr, sx = 1, back = false;
    if (Math.abs(h.q) === 2) { const s = Math.sign(h.q), phi = Math.PI * (1 - u), cs = Math.cos(phi); x = s * hinge + (x - s * hinge) * cs; sx = Math.abs(cs); back = cs < 0; }
    items.push({h, i, x: cx + x, y: cy + y, sx, back});
  });
  const draw = it => { const q = fadeIn(t, P.hexT[it.i], 0.15), lit = 0.35 + 0.65 * q;
    c.save(); c.translate(it.x, it.y); c.scale(Math.max(0.05, it.sx), 1); hexPath(c, 0, 0, hr * 0.95, 0);
    const gg = c.createLinearGradient(-hr, -hr, hr, hr); gg.addColorStop(0, mix('#6A5A30', '#FFE2A0', lit)); gg.addColorStop(1, mix('#4A3E20', PAL.gold, lit));
    c.fillStyle = it.back ? rgba('#3A3220', 0.8) : gg; c.fill(); c.strokeStyle = rgba('#FFF2C8', 0.5 * lit); c.lineWidth = 1.2; c.stroke(); c.restore(); };
  items.filter(it => it.back).forEach(draw); items.filter(it => !it.back).forEach(draw);
  stage.text('제임스웹 · 2021', cx, cy + ext + 48, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
  const da = fadeIn(t, P.d65, 0.3);
  stage.text('지름 6.5 m · 금 입힌 육각 18조각', cx, cy + ext + 88, {size: 26, weight: 500, color: mix(T.muted, PAL.answer, da), align: 'center'});
  if (da > 0) withAlpha(c, da, () => { const yy = cy - ext - 28; line(c, [[cx - 3.25 * k, yy], [cx + 3.25 * k, yy]], PAL.answer, 3); line(c, [[cx - 3.25 * k, yy - 10], [cx - 3.25 * k, yy + 10]], PAL.answer, 3); line(c, [[cx + 3.25 * k, yy - 10], [cx + 3.25 * k, yy + 10]], PAL.answer, 3); stage.text('6.5 m', cx, yy - 28, {role: 'display', size: 30, weight: 700, color: PAL.answer, align: 'center'}); });
  const ia = fadeIn(t, P.irLbl, 0.35);
  if (ia > 0) tag(stage, '적외선을 본다', cx, 470, {size: 30, color: '#FF9A7A', a: ia, border: '#FF9A7A'});
  tag(stage, '같은 축척', hx, 470, {size: 24, color: T.muted, plate: false});
}

// ------------------------------------------------------------------ myth: magnification vs aperture
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, m = P.mag(t), apR = P.apR(t);
  withAlpha(c, fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, ctx.scene.end - 0.3, 0.3), () => {
    // small refractor with the eyepiece being swapped
    const y = 470, x0 = 230, x1 = 720;
    rect(c, x0, y - 26, x1 - x0, 52, 8, rgba(PAL.tube, 0.9), rgba(PAL.metal, 0.5), 2);
    c.save(); c.translate(x0, y); c.rotate(Math.PI / 2); lensShape(c, 0, 0, 30, 10, 0); c.restore();
    const sw = fadeIn(t, P.swap, 0.5), eL = lerp(70, 40, sw);
    rect(c, x1, y - 16, eL, 32, 5, mix('#5A6E74', PAL.answer, sw), rgba('#0A1418', 0.8), 1.5);
    stage.text(`배율 ×${m.toFixed(1)}`, x1 + 90, y, {role: 'display', size: 34, weight: 700, color: mix(T.ink, PAL.answer, sw)});
    stage.text('배율 = 대물렌즈 초점 거리 ÷ 접안렌즈 초점 거리', 540, 560, {size: 26, weight: 500, color: T.muted, align: 'center'});
    // two panels
    const L = [325, 860], Rr = [755, 860], R = 165;
    starImage(stage, 'mythL', L[0], L[1], R, {D: 1, m, kpx: 40, gain: 1.25});
    starImage(stage, 'mythR', Rr[0], Rr[1], R, {D: apR, m, kpx: 40, gain: 1.25});
    stage.text('배율만 높임', L[0], L[1] - R - 34, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
    stage.text(apR > 1.01 ? '입구를 넓힘' : '같은 망원경', Rr[0], Rr[1] - R - 34, {role: 'display', size: 30, weight: 700, color: apR > 1.01 ? PAL.answer : T.ink, align: 'center'});
    const ba = fadeIn(t, P.blur, 0.35);
    if (ba > 0) tag(stage, '흐린 얼룩만 커짐', L[0], L[1] + R + 44, {size: 28, color: PAL.bad, a: ba});
    const ra = fadeIn(t, P.splitR, 0.35);
    if (ra > 0) tag(stage, '두 별로 갈라짐', Rr[0], Rr[1] + R + 44, {size: 28, color: PAL.answer, a: ra});
    stage.text(`입구 ×${apR.toFixed(1)}`, Rr[0], Rr[1] + R + 96, {size: 26, weight: 500, color: T.muted, align: 'center'});
    stage.text('입구 ×1.0', L[0], L[1] + R + 96, {size: 26, weight: 500, color: T.muted, align: 'center'});
    captionShade(c, 1);
  });
}

// ------------------------------------------------------------------ close: trio → poster
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), fin = fadeIn(t, P.poster, 0.6), out = 1 - fin;
  if (out > 0) withAlpha(c, out * fadeIn(t, ctx.scene.start, 0.25), () => {
    const hi = fadeIn(t, P.core20, 0.4);
    trio(stage, t, [1, 1, 1], {y0: 600, hi: [hi, hi, hi]});
    captionShade(c, 1);
  });
  if (fin > 0) withAlpha(c, fin, () => {
    posterPicture(stage, t, 1);
    captionShade(c, 1);
    posterTitle(stage, t, 0, 1);
  });
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings:
//  - Focus brightness → loudness of a low tone (110 Hz); the aperture knob ×1 → ×2 raises it by the log of the D² gain (capped).
//  - Two stars resolving → one tone (131 Hz) splitting into two (117 / 147 Hz). Same mapping in the essence and myth scenes.
//  - Chromatic aberration → three slightly detuned tones (R 98, G 104, B 110 Hz: audible beating); the mirror brings them to
//    one tone (104 Hz) at "같은 곳에".
//  - Radio → a low hum (55 Hz) while wavefronts reach the receiver; each EHT site / baseline → a low tick.
//  - Log readouts (eye → 10 m area, required diameter) → a short tone per decade, one minor third higher per decade.
//  - JWST → 18 soft ticks as the gold segments light up; Keck → one tick per ring of segments (6 / 12 / 18).
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe). Synthetic explanatory sounds, not recordings.
// =====================================================================================================
const stepHz = k => 98 * 2 ** (3 * k / 12);
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; if (times.some((x, i) => i && x < times[i - 1])) throw new Error(`${id}: times not sorted`); ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const steps = (id, times, gain, means, k0 = 0) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tone', offset: r(tt - times[0], 4), params: {freq: r(stepHz(k0 + k + 1), 2), dur: 0.16, harmonics: [1, 0.25], attack: 0.004, decay: 0.06, sustain: 0.2, release: 0.07, gain_db: 0}}))}, means}); };
  const thud = (id, times, means, gain = -32) => { const T0 = [].concat(times).sort((x, y) => x - y); ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => [{kind: 'tone', offset: r(tt - T0[0], 4), params: {freq: 70, dur: 0.2, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}, {kind: 'noise', offset: r(tt - T0[0], 4), params: {dur: 0.09, low: 40, high: 200, attack: 0.002, release: 0.07, gain_db: -8}}])}, means}); };
  /** one tone that splits into two at ts (resolving two stars) */
  const split = (id, t0, ts, t1, means, gain = -35) => {
    chirp(id + '_one', t0, ts + 0.12, () => 131, () => 0.32, gain, means + ' — 하나의 음', {fi: 0.15, fo: 0.12});
    chirp(id + '_lo', ts, t1, tt => 131 - 14 * smooth((tt - ts) / 0.5), () => 0.3, gain, '갈라진 두 별 중 하나 → 낮아지는 음', {fi: 0.1, fo: 0.4});
    chirp(id + '_hi', ts, t1, tt => 131 + 16 * smooth((tt - ts) / 0.5), () => 0.3, gain, '갈라진 두 별 중 다른 하나 → 높아지는 음', {fi: 0.1, fo: 0.4});
  };

  // ---- hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 오목거울이 별빛을 한 점에 모음', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  ticks('trio', [P.lens1, P.mirror1, P.dish1], [131, 110, 82], -33, '렌즈 · 거울 · 전파 접시 단면이 차례로 (굴절 · 반사 · 전파)', {decay: 0.14});
  tick('galileo', P.galName, 123, -34, '"1610 · 갈릴레이"', {decay: 0.12});
  ticks('nights', P.nights, 98, -36, `밤이 바뀔 때마다 (${P.nights.length}번): 목성 곁 네 위성의 자리가 바뀜`, {decay: 0.12});
  swell('moons', P.moonLbl, [98, 147], '"위성 4개"', {dur: 1.3, gain: -34});
  steps('area', P.areaSteps, -34, `눈동자 7 mm → 10 m 거울: 모으는 빛이 열 배 늘 때마다 단3도씩 오르는 음 (${P.areaSteps.length}번)`);
  swell('x200', P.x200, [110, 165], `"× ${koNum(EYE_TO_KECK_AREA)}" (백만 배 넘게)`, {dur: 1.4, gain: -33});
  // ---- origin
  ticks('words', [P.tele, P.skop, P.merge], [131, 147, 165], -34, 'tele(멀리) · skopein(보다) · = telescope', {decay: 0.12});
  ticks('hanja', [P.look, P.look + 0.2, P.gyeong], [131, 147, 165], -34, '望 · 遠 · 鏡', {decay: 0.12});
  whoosh('lip_rays', P.lipIn + 0.2, 1.2, 90, 170, '1608 리퍼세이의 원통: 빛이 렌즈 두 개를 지남', -36);
  tick('patent', P.patent, 147, -34, '"처음으로 특허 신청"', {decay: 0.12});
  // ---- essence
  chirp('focus_tone', P.light6, P.split + 1.4, () => 110, tt => 0.18 + 0.14 * Math.log2(P.D(tt) ** 2) / 2, -34, '초점의 밝기 → 낮은 음의 크기: 입구 지름 ×1 → ×2(모으는 빛 ×4)에 따라 커짐 (로그로 제한)', {fi: 0.4, fo: 0.5});
  tick('point', P.point6, 165, -34, '"한 점 · 초점"', {decay: 0.12});
  tick('x4', P.x4, 147, -33, '"모으는 빛 × 4"', {decay: 0.14});
  split('ess_split', P.small7, P.split, P.split + 1.3, '초점에 맺힌 두 별: 지름 ×1에서는 한 얼룩, ×2에서는 두 점');
  // ---- refractor
  whoosh('refract', P.convex, 0.9, 90, 150, '빛이 볼록렌즈에서 꺾여 모임', -36);
  tick('focus8', P.point8, 131, -34, '초점 (추적 표식)', {decay: 0.12});
  const chromaEnd = P.ruler + 0.2;
  COLORS.forEach((cl, k) => chirp('chroma_' + cl.id, P.c0, chromaEnd, () => [98, 104, 110][k], tt => 0.24 * P.chroma(tt), -36, `색수차: ${['빨강', '초록', '파랑'][k]} 초점 → ${[98, 104, 110][k]} Hz (세 음이 어긋나 맥놀이)`, {fi: 0.3, fo: 0.4}));
  tick('rainbow', P.rainbow, 123, -35, '"별 둘레의 무지갯빛 테"', {decay: 0.12});
  chirp('sag', P.s0, P.s1 + 0.3, tt => 98 - 22 * P.sag(tt), () => 0.3, -35, '큰 렌즈가 무게에 처짐 → 내려가는 음 (처짐 과장)', {fi: 0.1, fo: 0.3});
  tick('yerkes', P.yerkes, 110, -33, '"가장 큰 굴절망원경 1.02 m · 1897"', {decay: 0.14});
  // ---- reflector
  tick('newton', P.newton, 123, -34, '"1668 · 뉴턴"', {decay: 0.12});
  whoosh('reflect', P.bounce, 0.9, 150, 90, '빛이 오목거울에서 되비쳐 모임', -36);
  COLORS.forEach((cl, k) => chirp('mirror_' + cl.id, P.all, P.same + 1.6, tt => lerp([98, 104, 110][k], 104, smooth((tt - P.same) / 0.6)), () => 0.24, -36, `거울: ${['빨강', '초록', '파랑'][k]} 음이 ${'같은 곳에'}서 한 음(104 Hz)으로 모임`, {fi: 0.3, fo: 0.5}));
  ticks('supports', [P.whole], 98, -35, '"뒤에서 여러 점으로 받침"', {decay: 0.14});
  ticks('keck_rings', P.ringT, [110, 131, 147], -34, '켁 거울 조각이 고리마다 채워짐 (6 · 12 · 18개)', {decay: 0.12});
  swell('ten_m', P.ten, [98, 147], '"켁 10 m" 막대 (굴절 최대 1.02 m의 열 배)', {dur: 1.4, gain: -33});
  // ---- radio
  chirp('radio_hum', P.waves, P.globe + 0.3, () => 55, tt => 0.3 + 0.08 * Math.sin((tt - P.waves) * TAU * 70 / 100), -35, '전파 접시: 긴 파장의 전파가 수신기에 모임 → 낮은 웅웅 (55 Hz)', {fi: 0.5, fo: 0.5, h: [1, 0.4]});
  tick('receiver', P.dish, 82, -34, '"금속 접시" · "수신기"', {decay: 0.14});
  chirp('lambda', P.l0, P.l1 + 0.2, tt => 330 * 10 ** (-(P.lamLog(tt) - Math.log10(LAM_VIS)) / (Math.log10(LAM_RADIO) - Math.log10(LAM_VIS)) * Math.log10(6)), () => 0.28, -36, '파장 0.5 μm → 21 cm: 긴 파장 → 낮은 음 (330 → 55 Hz), 필요한 지름 막대가 함께 자람', {fi: 0.15, fo: 0.3});
  tick('need', P.big14, 147, -33, '"× 약 40만" (빛 2 mm → 전파 880 m)', {decay: 0.14});
  ticks('sites', P.siteT, [82, 92, 98, 110, 123, 131], -35, '전파망원경 자리 여섯 곳(하와이 · 애리조나 · 멕시코 · 칠레 · 스페인 · 남극)', {decay: 0.12});
  ticks('links', P.linkT, 73, -36, '접시들을 잇는 선 (하나처럼 묶음)', {decay: 0.1});
  swell('virtual', P.virtual, [82, 123], '"가상의 접시 · 지름 ≈ 지구"', {dur: 1.4, gain: -33});
  swell('shadow', P.bh, [55, 82, 110], '블랙홀의 그림자 (설명 그림)', {dur: 2.0, gain: -32});
  // ---- space
  ev.push({id: 'air_wind', at: r(P.shake, 4), kind: 'env_noise', params: {gain_db: -40, low: 40, high: 200, fade: 0.05, points: (D => [[0, 0], [0.4, 0.6], [r(D - 0.5), 0.6], [r(D), 0]])(Math.max(1.5, P.hub - P.shake))}, means: '별빛이 공기에서 흔들림 → 아주 작은 바람 소리'});
  thud('band_stop', BANDS.map((b, k) => b.h > 0 ? P.bandStop[k] : null).filter(x => x != null), '공기에 막힌 빛 (감마선 · 엑스선 · 자외선 · 적외선): 멈출 때마다 둔한 툭', -33);
  ticks('band_ground', BANDS.map((b, k) => b.h === 0 ? P.bandStop[k] : null).filter(x => x != null).sort((x, y) => x - y), 131, -34, '땅까지 오는 빛 (가시광선 · 전파)', {decay: 0.14});
  whoosh('hubble_up', P.hub, P.rise, 80, 160, '허블이 공기 위로', -35);
  whoosh('jwst_up', P.jw, P.rise, 90, 180, '제임스웹이 공기 위로', -35);
  ticks('jwst_segments', P.hexT, P.hexT.map((_, k) => [110, 123, 131][k % 3]), -36, '제임스웹 금빛 거울 18조각이 하나씩 켜짐', {decay: 0.08});
  chirp('unfold', P.u0, P.u1 + 0.2, tt => 82 + 41 * P.unfold(tt), () => 0.28, -36, '양쪽 날개 거울(3조각씩)이 펼쳐짐', {fi: 0.1, fo: 0.3});
  tick('six5', P.d65, 147, -33, '"6.5 m"', {decay: 0.14});
  // ---- myth
  tick('swap', P.swap, 123, -34, '접안렌즈를 바꿈', {decay: 0.12});
  chirp('blob_grow', P.m0, P.m1 + 0.2, tt => 104 - 20 * (P.mag(tt) - 1), () => 0.26, -36, '배율만 ×2: 얼룩이 커지며 어두워짐 → 내려가는 음', {fi: 0.1, fo: 0.3});
  split('myth_split', P.a0 - 0.6, P.splitR, P.splitR + 1.2, '입구를 넓히면 두 별이 갈라짐');
  // ---- close
  ticks('close_trio', [P.core20, P.core20 + 0.15, P.core20 + 0.3], [131, 110, 82], -35, '렌즈 · 거울 · 접시가 모두 한 점에 모음', {decay: 0.14});
  swell('poster_back', P.poster, [73, 110, 147], '"넓은 입구로" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/telescope-types/scenes.mjs --emit-sound`가 scenes.mjs의 같은 광학 모형과 시간 계획에서 써 넣습니다. 대응: 초점 밝기 → 낮은 음(110 Hz)의 크기(입구 ×2 = 빛 ×4, 로그로 제한), 두 별이 갈라짐 → 한 음(131 Hz)이 두 음(117/147 Hz)으로, 색수차 → 어긋난 세 음(98/104/110 Hz)의 맥놀이 → 거울에서 한 음(104 Hz)으로, 전파 → 낮은 웅웅(55 Hz), 긴 파장 → 낮은 음, 로그 읽음값 → 한 자릿수마다 단3도씩 오르는 음, 제임스웹 거울 18조각 → 틱 18개. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  console.log(`events: ${sound.events.length}`);
}
