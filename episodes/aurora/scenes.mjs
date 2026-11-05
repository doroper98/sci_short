// Episode scenes — "오로라는 왜 극지방에서만 보일까"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Field: a dipole (axis = world Z in the space scenes) drawn with a radial compression that keeps every line's
//    footpoint latitude (Earth drawn far too large), a mild day-side compression and a night-side stretch (tail).
//    The readout uses the true dipole relation L = 1 / cos²λ (equatorial distance in Earth radii ↔ footpoint latitude).
//  - Oval: magnetic latitude band, quiet 65–70° on the night side (script), ~74–77° at noon; storm intensity S(t)
//    (0 … 1 = G5) moves the band equatorward (night edge 65° → 43°). Same S drives the globe, the G-meter and the sound.
//  - Emission by altitude EMIT(h): O 557.7 nm green 100–200 km, O 630.0 nm red above ~200 km, N₂⁺ 427.8 nm blue /
//    violet and a pink lower edge near 90–100 km. Every aurora drawn in this file (ground curtains, the cross-section,
//    the globe shell, the storm geometry) takes its colours from this one function.
//  - Low-latitude view: a point at altitude h and ground distance d is above the horizon if h > R(1/cos(d/R) − 1).
//    The storm-time aurora is put d = 1650 km north of Korea → only h > 220 km (red) is above the horizon.
//  - Sound: node episodes/aurora/scenes.mjs --emit-sound [--timeline outputs/aurora/narration/timeline.json]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, TAU, rand, loadTimeline,
} from '../../pipeline/render/index.mjs';
import {D2R, cross, unit, dot, add, sub, mul, loadLand, lookCam, earthTextures, drawEarthLit, makeStars} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = 'noturno';
export const captionLayout = {};
const LAND = loadLand(path.join(HERE, 'land.json'));   // Natural Earth 1:110m (public domain), copy of episodes/precession/land.json

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const RE_KM = 6371, VSW = 400;                                   // Earth radius km, mean solar wind km/s (brief)
export const MAGPOLE = {lat: 80.8, lon: -72.7};                        // geomagnetic (dipole) north pole — approximate
export const KOREA = {lat: 37.5, lon: 127.0}, HWACHEON = {lat: 38.1, lon: 127.7};
export const OVAL_Q = {night: [65, 70], noon: [74, 77]};               // quiet oval, magnetic latitude (deg)
export const LINE_NM = {green: 557.7, red: 630.0, blue: 427.8}, ISS_KM = 400, PLANE_KM = 10;
export const STORM_D = 1650;                                           // km: storm-time aurora north of Korea (model)
export const magLat = (lat, lon) => Math.asin(Math.sin(lat * D2R) * Math.sin(MAGPOLE.lat * D2R) + Math.cos(lat * D2R) * Math.cos(MAGPOLE.lat * D2R) * Math.cos((lon - MAGPOLE.lon) * D2R)) / D2R;
export const Lof = lat => 1 / Math.cos(lat * D2R) ** 2;               // dipole: equatorial distance (Earth radii) of the line with footpoint latitude lat
export const hMin = d => RE_KM * (1 / Math.cos(d / RE_KM) - 1);        // lowest altitude above the horizon at ground distance d (no refraction)
export const toneHz = nm => 299792458 / (nm * 1e-9) / 2 ** 40;         // light frequency lowered 40 octaves → a pitch (mapping, not a real sound)
/** volume emission by altitude (km), relative: {g: O 557.7, r: O 630.0, b: N₂⁺ 427.8, p: pink lower edge} */
export function EMIT(h) {
  const s = (a, b, x) => smooth((x - a) / (b - a));
  return {
    g: s(95, 108, h) * Math.exp(-Math.max(0, h - 116) / 36),
    r: 0.24 * s(170, 240, h) * Math.exp(-Math.max(0, h - 255) / 110),
    b: 0.30 * s(92, 100, h) * Math.exp(-Math.max(0, h - 104) / 18),
    p: 0.55 * s(88, 94, h) * (1 - s(97, 106, h)),
  };
}
const COL = {g: [92, 255, 132], r: [255, 52, 74], b: [120, 100, 255], p: [255, 84, 182]};
const HEX = {green: '#5CFF9E', red: '#FF4A5E', blue: '#8C7BFF', pink: '#FF66C4', sw: '#FFE3A6', mag: '#7FC8FF', e: '#CFE8FF', ion: '#FFB36B'};
// altitude → display colour lookup (80 … 520 km, 2 km steps), shared by every aurora renderer
const ALT0 = 80, ALT_STEP = 2, ALT_N = 221, ALT_LUT = new Float32Array(ALT_N * 3);
for (let i = 0; i < ALT_N; i++) { const e = EMIT(ALT0 + i * ALT_STEP); for (let k = 0; k < 3; k++) ALT_LUT[i * 3 + k] = (e.g * COL.g[k] + e.r * COL.r[k] + e.b * COL.b[k] + e.p * COL.p[k]) / 255; }
const altIdx = h => Math.max(0, Math.min(ALT_N - 1, ((h - ALT0) / ALT_STEP) | 0));

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  why: W('s01', '왜'), polar1: W('s01', '극지방'),
  but2: W('s02', '그런데'), y2024: W('s02', '이천이십사년'), hwacheon: W('s02', '화천의'), red2: W('s02', '붉은'), shot: W('s02', '찍혔습니다.'), reason: W('s02', '까닭까지'),
  roma: W('s03', '로마'), dawn: W('s03', '새벽'), aurora3: W('s03', '아우로라에서'), north3: W('s03', '북쪽'), boreasW: W('s03', '북풍의'), boreas: W('s03', '보레아스를'), attach: W('s03', '붙여'), korean: W('s03', '우리말로는'), geukgwang: W('s03', '극광입니다.'),
  y1900: W('s04', '천구백년'), birk: W('s04', '비르켈란은'), magnet: W('s04', '자석'), shoot: W('s04', '전자를'), fire: W('s04', '쏘아,'), twoPoles: W('s04', '두'), around: W('s04', '둘레에'), rings: W('s04', '고리가'), lab: W('s04', '실험실에서'),
  core: W('s05', '핵심은'), field5: W('s05', '자기장이'), led: W('s05', '이끈'), charged: W('s05', '전기'), high5: W('s05', '높은'), air5: W('s05', '공기와'), hit5: W('s05', '부딪혀'), light5: W('s05', '빛입니다.'),
  sun6: W('s06', '태양은'), wind6: W('s06', '바람,'), sw6: W('s06', '태양풍을'), speed6: W('s06', '초속'), v400: W('s06', '사백킬로미터로'),
  field7: W('s07', '자기장은'), most7: W('s07', '대부분'), deflect: W('s07', '비껴'), shield: W('s07', '방패가'), pushed: W('s07', '밀려'), night7: W('s07', '밤'), tail7: W('s07', '꼬리를'),
  wind8: W('s08', '감고'), helix: W('s08', '나선을'), along: W('s08', '따라서만'), easy: W('s08', '쉽게'),
  eq9: W('s09', '적도'), parallel: W('s09', '나란히'), polar9: W('s09', '극지방에서만'), dive: W('s09', '땅속으로'), so9: W('s09', '그래서'), door: W('s09', '문은'), doorPolar: W('s09', '극지방에만'),
  shake: W('s10', '흔들면,'), tail10: W('s10', '꼬리에'), stored: W('s10', '쌓였던'), faster: W('s10', '빨라지며'), ride: W('s10', '타고'), toPoles: W('s10', '극지방으로'), pour: W('s10', '쏟아집니다.'),
  above: W('s11', '바로'), notOn: W('s11', '아니라'), magPole: W('s11', '자기극을'), around11: W('s11', '둘러싼'), band11: W('s11', '띠입니다.'), ring11: W('s11', '오로라 고리는'), magLat11: W('s11', '자기 위도'), deg65: W('s11', '육십오에서'),
  hit12: W('s12', '부딪힌'), oxy: W('s12', '산소와'), nit: W('s12', '질소는'), energy: W('s12', '에너지를'), gave: W('s12', '받았다가,'), fixed: W('s12', '정해진'), emitW: W('s12', '내놓습니다.'), neon: W('s12', '네온사인과'),
  height: W('s13', '높이'), km100: W('s13', '백에서'), green13: W('s13', '초록,'), higher: W('s13', '그보다'), red13: W('s13', '빨강,'), nit13: W('s13', '질소는'), blue13: W('s13', '파랑과'), violet: W('s13', '보라를'),
  big: W('s14', '큰'), blast: W('s14', '폭발이'), ring14: W('s14', '고리가'), equator14: W('s14', '적도'), widen: W('s14', '넓어집니다.'),
  y2024b: W('s15', '이천이십사년'), y21: W('s15', '이십일년'), strongest: W('s15', '가장'), storm15: W('s15', '폭풍이었고,'), korea15: W('s15', '우리나라에서는'), horizon: W('s15', '지평선'), beyond: W('s15', '너머'), redOnly: W('s15', '붉은빛만'),
  sunlight: W('s16', '햇빛이'), reflect: W('s16', '반사된'), was: W('s16', '있었지만,'), air16: W('s16', '공기'), itself: W('s16', '자체가'),
  q1: W('s17', '태양풍이'), q2: W('s17', '자기장이'), q3: W('s17', '공기가'), picture: W('s17', '오로라는'), shape: W('s17', '모양을'),
};

// ---- schedules ----
function rampEase(q, r = 0.15) { q = clamp(q); const v = 1 / (1 - r); if (q < r) return v * q * q / (2 * r); if (q > 1 - r) return 1 - v * (1 - q) ** 2 / (2 * r); return v * (q - r / 2); }
const EASE = {io: easeInOut, o: easeOut, i: easeIn, lin: q => clamp(q), ramp: rampEase, s: smooth};
/** keyed schedule K = [[t, v, ease], …]: `ease` shapes the segment that ENDS at that key */
function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [t1, v1, e] = K[i]; if (t < t1) { const [t0, v0] = K[i - 1]; return v0 + (v1 - v0) * EASE[e || 's']((t - t0) / (t1 - t0)); } }
    return K[K.length - 1][1];
  };
}
const MODELS = new WeakMap();
/** everything time-dependent that picture, readouts and sound share */
export function model(tl) {
  let m = MODELS.get(tl); if (m) return m;
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // storm intensity S (0 quiet … 1 = G5)
  const SK = [[0, 0], [at(A.big) - 0.1, 0], [at(A.widen) + 0.6, 1, 'io'], [sc('storm').end, 1], [sc('myth').start + 0.5, 0, 'lin']];
  // solar-wind particle flux, relative (1 = the steady wind of s06–s07); rises with the storm
  const FK = [[0, 0], [sc('wind').start - 0.1, 0], [sc('wind').start + 1.2, 1], [sc('lines').start + 4, 1], [sc('lines').start + 7, 0.45], [at(A.shake) - 0.3, 0.45], [at(A.shake) + 0.6, 1.25, 'o'], [at(A.pour) + 0.8, 0.6],
    [sc('oval').end, 0.35], [sc('color').start, 0, 'lin'], [at(A.big) - 0.2, 0], [at(A.big) + 0.3, 0.8, 'o'], [at(A.widen) + 0.6, 2.2, 'io'], [at(A.korea15) + 0.2, 2.0], [sc('storm').end - 0.2, 0, 'lin']];
  // tail particle speed factor (1 = slow drift in the plasma sheet; accelerate on "빨라지며")
  const VK = [[0, 1], [at(A.faster) - 0.2, 1], [at(A.faster) + 1.3, 5, 'i'], [at(A.pour) + 1.5, 5], [sc('oval').start + 0.5, 1, 'lin']];
  const storm = keyed(SK), flux = keyed(FK), accel = keyed(VK);
  // the aurora brightness on the globe (oval) — lights when particles pour in (s10), stays for the oval scene
  const PK = [[0, 0], [at(A.toPoles) - 0.2, 0], [at(A.pour) + 0.4, 1, 'o']];
  const pour = keyed(PK);
  m = {storm, flux, accel, pour, keys: {SK, FK, VK, PK}};
  MODELS.set(tl, m);
  return m;
}
/** oval band (magnetic latitude, deg) at magnetic local time angle phi (0 = noon/sunward, 180 = midnight) for storm S */
export function ovalBand(phi, S = 0) {
  const w = (1 - Math.cos(phi * D2R)) / 2;                              // 0 noon … 1 midnight
  const lo = lerp(OVAL_Q.noon[0], OVAL_Q.night[0], w) - S * lerp(12, 22, w), hi = lerp(OVAL_Q.noon[1], OVAL_Q.night[1], w) - S * lerp(8, 15, w);
  return [lo, hi];
}
export const gLevel = S => Math.round(clamp(S) * 5);

// =====================================================================================================
// UI helpers (centred header, panels, tags)
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
const endFade = (t, ctx, d = 0.5) => fadeOut(t, ctx.scene.end - d - 0.05, d);
const M = ctx => model(ctx.tl);
const blackFade = (stage, a) => { if (a > 0.001) { stage.ctx.fillStyle = rgba('#000000', clamp(a)); stage.ctx.fillRect(0, 0, 1080, 1920); } };
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
/** keep a tag inside x 140–940 */
const tagX = (stage, s, x, size = 24, align = 'center') => { const w = stage.measure(s, {size, weight: 700}) + 16; const lo = 140 + (align === 'left' ? 0 : align === 'right' ? w : w / 2), hi = 940 - (align === 'left' ? w : align === 'right' ? 0 : w / 2); return clamp(x, lo, hi); };
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
  hook: ['오늘의 주제', '오로라'],
  origin: ['기원 · 이름', '새벽의 여신과 북풍'],
  essence: ['본질 · 제1원리', '오로라는 무엇인가'],
  wind: ['메커니즘 ① 태양풍', '자기장은 방패가 된다'],
  lines: ['메커니즘 ② 자기력선', '입자는 선을 따라간다'],
  oval: ['현상 · 오로라 고리', '자기극을 둘러싼 띠'],
  color: ['메커니즘 ④ 빛의 색', '원자가 내는 정해진 색'],
  storm: ['사례 · 자기 폭풍', '고리가 적도 쪽으로'],
  myth: ['오해 바로잡기', '햇빛이 반사된 빛일까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [at('s04') - 0.5, '기원 · 실험실의 오로라', '비르켈란의 테렐라']];
  if (id === 'lines') return [[-Infinity, ...titles.lines], [at('s09') - 0.45, '메커니즘 ② 자기력선', '문은 극지방에만'], [at('s10') - 0.45, '메커니즘 ③ 꼬리', '꼬리에서 쏟아지는 입자']];
  if (id === 'color') return [[-Infinity, ...titles.color], [at('s13') - 0.45, '메커니즘 ④ 빛의 색', '높이에 따라 다른 색']];
  if (id === 'storm') return [[-Infinity, ...titles.storm], [at(A.korea15) - 0.6, '사례 · 2024년 5월', '한국에서 본 붉은 오로라']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'wind_flux'), m = M(ctx);
  const ok = e?.model && e.model.fk === m.keys.FK.length && Math.abs(e.model.t_last - m.keys.FK[m.keys.FK.length - 1][0]) < 1e-3 && Math.abs(e.model.storm_peak - m.keys.SK[2][0]) < 1e-3;
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/aurora/scenes.mjs --emit-sound');
}
const fbm1 = (x, s = 0, o = 4) => { let a = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { a += amp * vn1(x * f, s + i * 13); n += amp; amp *= 0.5; f *= 2.07; } return a / n; };
function vn1(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(rand(i * 1.37 + s * 7.1), rand((i + 1) * 1.37 + s * 7.1), u); }

// =====================================================================================================
// Aurora raster: additive float buffer (half resolution) + tone map + bloom. One emission LUT (EMIT) for all.
// =====================================================================================================
class GlowBuf {
  constructor(w, h, scale, ox = 0, oy = 0) {
    Object.assign(this, {w, h, scale, ox, oy});
    this.R = new Float32Array(w * h); this.G = new Float32Array(w * h); this.B = new Float32Array(w * h);
    this.cv = createCanvas(w, h); this.cc = this.cv.getContext('2d'); this.img = this.cc.createImageData(w, h);
    this.sm = createCanvas(Math.ceil(w / 4), Math.ceil(h / 4)); this.smc = this.sm.getContext('2d');
  }
  clear() { this.R.fill(0); this.G.fill(0); this.B.fill(0); }
  /** a ray from base (x0, y0) to top (x1, y1) in SCREEN px; altitude hb → ht along it; I intensity; vis(alt) optional cut */
  ray(x0, y0, x1, y1, hb, ht, I, cut = null, LUT = ALT_LUT) {
    const s = this.scale, X0 = (x0 - this.ox) * s, Y0 = (y0 - this.oy) * s, X1 = (x1 - this.ox) * s, Y1 = (y1 - this.oy) * s;
    const n = Math.max(1, Math.ceil(Math.abs(Y0 - Y1))), {w, h, R, G, B} = this;
    for (let k = 0; k <= n; k++) {
      const u = k / n, y = Math.round(Y0 + (Y1 - Y0) * u); if (y < 0 || y >= h) continue;
      const x = X0 + (X1 - X0) * u, xi = Math.floor(x), fx = x - xi; if (xi < -1 || xi >= w) continue;
      const alt = hb + (ht - hb) * u; if (cut && alt < cut) continue;
      const li = altIdx(alt) * 3, a0 = I * (1 - fx), a1 = I * fx, row = y * w;
      if (xi >= 0) { R[row + xi] += LUT[li] * a0; G[row + xi] += LUT[li + 1] * a0; B[row + xi] += LUT[li + 2] * a0; }
      if (xi + 1 < w) { R[row + xi + 1] += LUT[li] * a1; G[row + xi + 1] += LUT[li + 1] * a1; B[row + xi + 1] += LUT[li + 2] * a1; }
    }
  }
  /** tone map → canvas; then composite additively onto the stage (with bloom) */
  draw(stage, {gain = 1, bloom = 0.7, alpha = 1, cross = 0.08} = {}) {
    if (alpha <= 0) return;
    const {w, h, R, G, B, img} = this, d = img.data;
    for (const A of [R, G, B]) for (let y = 0; y < h; y++) { let p = A[y * w]; for (let x = 1; x < w - 1; x++) { const i = y * w + x, c0 = A[i]; A[i] = 0.25 * p + 0.5 * c0 + 0.25 * A[i + 1]; p = c0; } }
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      const l = (R[i] + G[i] + B[i]) * cross;
      d[j] = 255 * (1 - Math.exp(-(R[i] + l) * gain)); d[j + 1] = 255 * (1 - Math.exp(-(G[i] + l) * gain)); d[j + 2] = 255 * (1 - Math.exp(-(B[i] + l) * gain)); d[j + 3] = 255;
    }
    this.cc.putImageData(img, 0, 0);
    const c = stage.ctx, W = w / this.scale, H = h / this.scale;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha; c.imageSmoothingEnabled = true;
    c.drawImage(this.cv, 0, 0, w, h, this.ox, this.oy, W, H);
    if (bloom > 0) {
      const sm = this.sm, sc = this.smc; sc.globalCompositeOperation = 'copy'; sc.filter = 'none'; sc.drawImage(this.cv, 0, 0, sm.width, sm.height);
      sc.globalCompositeOperation = 'copy'; sc.filter = 'blur(5px)'; sc.drawImage(sm, 0, 0); sc.filter = 'none';
      c.globalAlpha = alpha * bloom; c.drawImage(sm, 0, 0, sm.width, sm.height, this.ox, this.oy, W, H);
    }
    c.restore();
  }
}
const GB = {};
const gbuf = (key, x, y, w, h, scale = 0.5) => { const k = `${key}:${w}x${h}@${scale}`; if (!GB[k]) GB[k] = new GlowBuf(Math.ceil(w * scale), Math.ceil(h * scale), scale, x, y); const b = GB[k]; b.ox = x; b.oy = y; b.clear(); return b; };   // one buffer per size AND scale

/** ground camera (km; x east, y north, z up), heading az (deg from north, east positive), elevation el (deg) */
function groundCam({az = 0, el = 30, F = 1000, cx = 540, cy = 760}) {
  const a = az * D2R, e = el * D2R, dir = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
  return lookCam({pos: [0, 0, 0], dir, up: [0, 0, 1], F, cx, cy});
}
const dirAzEl = (az, el) => { const a = az * D2R, e = el * D2R; return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)]; };
/** a curtain sheet: its horizontal trace runs east–west about d0 km north of the observer and meanders north–south
 *  (where the trace turns toward the viewer the sheet is seen edge-on → a bright fold); vertical rays along the field
 *  (here: vertical). Each sample deposits I·(face-on pixel length) so the surface brightness is distance-independent
 *  and edge-on parts brighten as 1/|cos θ|, as a thin emitting sheet does. */
const EDGE = 3.5;
function curtain(b, cam, t, o) {
  const span = o.span ?? 1.6 * o.d0, d0 = o.d0, seed = o.seed ?? 1, I0 = o.I ?? 1, x0 = o.x0 ?? 0;
  const N = Math.min(4000, Math.ceil(span * (cam.F / d0) * b.scale / 0.5)), ds = span / N;
  const drift = o.drift ?? 1, fA = o.fold ?? 1, cut = o.cut ?? null, R2 = 2 * RE_KM, ext = o.extinct ?? 0, kpx = cam.F * b.scale;
  const L1 = o.L1 ?? 900, L2 = o.L2 ?? 190, L3 = o.L3 ?? 90;
  let prevX = null;
  for (let i = 0; i <= N; i++) {
    const s = i / N, u = x0 + (s - 0.5) * span;
    const p1 = u / L1 * TAU + seed * 1.7 + t * 0.07 * drift, p2 = u / L2 * TAU + seed * 0.6 - t * 0.21 * drift, p3 = u / L3 * TAU + seed * 2.9 + t * 0.33 * drift;
    const xw = u + fA * (o.curl ?? 44) * Math.sin(p2 + 1.3) * (0.6 + 0.4 * Math.sin(p1 * 0.7 + 2));
    const yw = d0 + fA * ((o.A1 ?? 60) * Math.sin(p1) + (o.A2 ?? 16) * Math.sin(p2) + (o.A3 ?? 6) * Math.sin(p3));
    const env = smooth(s / 0.1) * smooth((1 - s) / 0.1) * (o.env ? o.env(s, u) : 1);
    const bundles = 0.35 + 0.65 * fbm1(u / 70 + seed + t * 0.05 * drift, seed, 3);
    const rc = o.rayC ?? 0.78, rays = (1 - rc) + rc * fbm1(u / 2.6 + seed * 3 - t * 0.5 * drift, seed + 5, 4) ** 2.2;
    const pulse = 0.88 + 0.12 * Math.sin(t * 0.7 + seed + u / 90);
    let I = I0 * env * bundles * rays * pulse; if (I < 0.003) { prevX = null; continue; }
    const hb = (o.hb ?? 100) + 6 * fbm1(u / 20 + seed, seed + 9, 2) - 5 * rays, ht = (o.ht ?? 250) + (o.htVar ?? 80) * (fbm1(u / 12 + seed * 2 - t * 0.25 * drift, seed + 3, 3) - 0.35) + 45 * (rays - 0.5);
    const dist = Math.hypot(xw, yw), drop = dist * dist / R2, P0 = cam.P([xw, yw, hb - drop]), P1 = cam.P([xw, yw, ht - drop]);
    if (P0[2] <= 1 || P1[2] <= 1) { prevX = null; continue; }
    const cutH = o.horizon ? Math.max(cut ?? 0, hMin(dist)) : cut;   // the Earth hides everything below hMin(d)
    if (ext > 0) { const el = Math.atan2(hb - drop, dist) / D2R; I *= smooth((el + 1.5) / ext); }
    // edge-on brightening 1/|cos θ| capped at EDGE (a real sheet is ~1 km thick, so it never becomes a 1-px laser line)
    const dxf = ds * kpx / dist, dxa = prevX === null ? dxf : Math.abs(P0[0] - prevX) * b.scale; prevX = P0[0];
    b.ray(P0[0], P0[1], P1[0], P1[1], hb, ht, I * Math.min(dxf, EDGE * dxa), cutH);
  }
}

// ---- sky + landscape ----
const SKYSTARS = Array.from({length: 900}, (_, i) => ({az: (rand(i * 3.1 + 0.3) - 0.5) * 120, el: Math.asin(rand(i * 7.7 + 1.9)) / D2R * 0.98, m: rand(i * 5.3 + 2.2) ** 3, tw: rand(i * 2.9) * TAU, hue: rand(i * 9.1)}));
function skyStars(stage, cam, t, a = 1, minEl = -2) {
  const c = stage.ctx;
  for (const s of SKYSTARS) {
    if (s.el < minEl) continue;
    const p = cam.dirP(dirAzEl(s.az, s.el)); if (!p || p[0] < -2 || p[0] > 1082 || p[1] < -2 || p[1] > 1922) continue;
    const al = a * (0.18 + 0.75 * s.m) * (0.82 + 0.18 * Math.sin(t * 1.7 + s.tw)), r = 0.6 + 1.6 * s.m;
    c.fillStyle = s.hue < 0.15 ? rgba('#FFE2C4', al) : s.hue > 0.85 ? rgba('#CFE0FF', al) : rgba('#F4F1E8', al);
    if (r < 1.1) c.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r); else { c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fill(); }
  }
}
/** ridge silhouette: elevation angle (deg) as a function of azimuth (deg), fractal; returns screen polyline */
function ridgePts(cam, elf, az0 = -70, az1 = 70, step = 0.25) {
  const P = []; for (let az = az0; az <= az1; az += step) { const p = cam.dirP(dirAzEl(az, elf(az))); if (p) P.push([p[0], p[1]]); }
  return P;
}
function polarLandscape(stage, cam, t, glowI) {
  const c = stage.ctx;
  // far snowy range (elevation angle, deg, vs azimuth) and a nearer forested ridge
  const far = az => 1.6 + 6.5 * fbm1(az * 0.07 + 4, 2, 5) ** 1.5 + 9 * Math.max(0, fbm1(az * 0.03 + 1.6, 7, 3) - 0.42);
  const near = az => 0.25 + 1.4 * fbm1(az * 0.045 + 9, 4, 4) ** 1.2;
  const P1 = ridgePts(cam, far), P2 = ridgePts(cam, near), bot = 1920;
  const top1 = P1.reduce((m, p) => Math.min(m, p[1]), 2000), base1 = P2.reduce((m, p) => Math.max(m, p[1]), 0);
  const snow = mix('#9FB4C4', '#86FFC0', 0.35);
  c.save(); c.beginPath(); c.moveTo(P1[0][0], bot); P1.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(P1[P1.length - 1][0], bot); c.closePath(); c.clip();
  const g = c.createLinearGradient(0, top1, 0, base1); g.addColorStop(0, rgba(mix('#1E2C36', snow, 0.42 * glowI), 1)); g.addColorStop(0.45, '#0F1C25'); g.addColorStop(1, '#08121A');
  c.fillStyle = g; c.fillRect(0, top1 - 2, 1080, bot - top1);
  // gullies and lit snow faces: streaks falling from the crest (direction alternates with the slope)
  for (let i = 1; i < P1.length - 1; i += 2) {
    const [x, y] = P1[i], sl = P1[i + 1][1] - P1[i - 1][1], n = fbm1(i * 0.17, 11, 3), len = 40 + 140 * n;
    const lit = sl > 0 ? 0.55 : 0.18;
    line(c, [[x, y + 1], [x + sl * 2.2, y + len]], rgba(sl > 0 ? snow : '#05090C', (sl > 0 ? 0.16 : 0.25) * (0.4 + n) * (0.5 + glowI * lit)), 2.6);
  }
  c.restore();
  line(c, P1, rgba(mix('#C9D8E2', '#A6FFD6', 0.5), 0.25 + 0.3 * glowI), 1.4);
  // near ridge with spruce silhouettes
  poly(c, [...P2, [P2[P2.length - 1][0], bot], [P2[0][0], bot]], '#050C11');
  for (let i = 0; i < P2.length; i += 2) {
    const [x, y] = P2[i]; if (rand(i * 1.31) > 0.5) continue;
    const hgt = 22 + 62 * rand(i * 2.7) ** 1.3, w = hgt * 0.3;
    c.beginPath(); c.moveTo(x, y - hgt);
    for (let k = 1; k <= 6; k++) { const yy = y - hgt + hgt * k / 6, ww = w * (0.3 + 0.7 * k / 6); c.lineTo(x + ww, yy); c.lineTo(x + ww * 0.3, yy - 2); }
    for (let k = 6; k >= 1; k--) { const yy = y - hgt + hgt * k / 6, ww = w * (0.3 + 0.7 * k / 6); c.lineTo(x - ww * 0.3, yy - 2); c.lineTo(x - ww, yy); }
    c.closePath(); c.fillStyle = '#02070A'; c.fill();
  }
  // frozen lake below the far shore: a dim, darkened mirror of everything above the shore line (ice ripples)
  const shore = base1 + 4, H = Math.min(1920 - shore, shore - 200);
  if (!REFL) { REFL = createCanvas(1080, 1000); REFLC = REFL.getContext('2d'); }
  REFLC.globalCompositeOperation = 'copy'; REFLC.drawImage(stage.canvas, 0, shore - H, 1080, H, 0, 0, 1080, H);
  c.save(); c.beginPath(); c.moveTo(0, 1920); P2.forEach(p => c.lineTo(p[0], Math.max(p[1] + 3, shore))); c.lineTo(1080, 1920); c.closePath(); c.clip();
  c.fillStyle = '#03080B'; c.fillRect(0, shore - 40, 1080, 1920 - shore + 40);
  c.globalAlpha = 0.55; c.translate(0, 2 * shore); c.scale(1, -1); c.drawImage(REFL, 0, 0, 1080, H, 0, shore - H, 1080, H); c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  const g2 = c.createLinearGradient(0, shore, 0, 1920); g2.addColorStop(0, 'rgba(3,8,11,0.15)'); g2.addColorStop(0.35, 'rgba(3,8,11,0.55)'); g2.addColorStop(1, 'rgba(3,7,10,0.92)');
  c.fillStyle = g2; c.fillRect(0, shore, 1080, 1920 - shore);
  for (let k = 0; k < 40; k++) { const y = shore + 4 + (k * k) * 0.5 + 2 * Math.sin(k * 2.1 + t * 0.4), x0 = 1080 * rand(k * 3.3), w = 200 + 700 * rand(k * 5.1); line(c, [[x0 - w / 2, y], [x0 + w / 2, y]], rgba('#010407', 0.22 + 0.25 * rand(k * 7.7)), 1 + k * 0.06); }
  c.restore();
  line(c, [[0, shore], [1080, shore]], rgba('#9FB4C4', 0.08), 1);
}
let REFL = null, REFLC = null;
function polarSky(stage, cam, t, a = 1) {
  const c = stage.ctx, hz = cam.dirP(dirAzEl(0, 0)), hy = hz ? hz[1] : 1300;
  const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#02060D'); g.addColorStop(0.55, '#041320'); g.addColorStop(1, '#0B2A33');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  skyStars(stage, cam, t, a);
}

// =====================================================================================================
// Space stage: Earth radius 1 at the origin, the Sun toward −X, the magnetic (dipole) axis = +Z.
// The geographic axis is tilted DIP from Z; the texture spin is fixed so the geomagnetic pole sits on +Z (frozen UT).
// =====================================================================================================
const TEX = earthTextures(LAND);
const SUNV = [-1, 0, 0], ZUP = [0, 0, 1];
const DIP = 90 - MAGPOLE.lat, SPIN_M = 90 - MAGPOLE.lon;
function frameAt(aDeg) { const a = aDeg * D2R, d = DIP * D2R, n = [Math.sin(d) * Math.cos(a), Math.sin(d) * Math.sin(a), Math.cos(d)], e1 = unit(cross(ZUP, n)); return {n, e1, e2: cross(n, e1), spin: SPIN_M}; }
const geo2w = (F, lat, lon) => { const cl = Math.cos(lat * D2R), q = (lon + F.spin) * D2R; return add(add(mul(F.e1, cl * Math.cos(q)), mul(F.e2, cl * Math.sin(q))), mul(F.n, Math.sin(lat * D2R))); };
/** frame whose local midnight (+X) is at geographic longitude midLon */
function geoFrame(midLon) { let best = null; for (let a = 0; a < 360; a += 0.5) { const F = frameAt(a), v = geo2w(F, 0, midLon)[0]; if (!best || v > best.v) best = {v, F}; } return best.F; }
const GEO = {wind: geoFrame(-100), oval: geoFrame(-95), storm: geoFrame(140), close: geoFrame(15), myth: geoFrame(-60)};
const earth = (stage, cam, F, o = {}) => drawEarthLit(stage, cam, TEX, {axis: F.n, spin: F.spin, sun: SUNV, cloudDrift: o.cloud ?? 0, night: o.night ?? 0.05, alpha: o.alpha ?? 1, cloudA: o.cloudA ?? 0.8});

const FIELD = makeStars(2600, 5, {pole: unit([0.25, -0.45, 0.86]), w: 0.2, k: 0.55});
const MWB = (() => { const pole = unit([0.25, -0.45, 0.86]), a = unit(cross(pole, ZUP)), b = cross(pole, a); return Array.from({length: 48}, (_, i) => { const q = i / 48 * TAU; return {v: unit(add(add(mul(a, Math.cos(q)), mul(b, Math.sin(q))), mul(pole, 0.06 * Math.sin(i * 2.3)))), s: 0.6 + 0.5 * rand(i * 3.7)}; }); })();
function starP(cam, v) { const z = dot(v, cam.f); if (z <= 1e-3) return null; const F = Math.min(cam.F, 1100); return [cam.cx + F * dot(v, cam.r) / z, cam.cy - F * dot(v, cam.u) / z]; }
function spaceBg(stage, cam, t, a = 1) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#01060B'); g.addColorStop(1, '#030C14'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  withAlpha(c, a, () => {
    for (const m of MWB) { const p = starP(cam, m.v); if (p && p[0] > -300 && p[0] < 1380 && p[1] > -300 && p[1] < 2220) glow(c, p[0], p[1], 240 * m.s, '#9DB4D6', 0.04); }
    for (const s of FIELD) {
      const p = starP(cam, s.v); if (!p || p[0] < -2 || p[0] > 1082 || p[1] < -2 || p[1] > 1922) continue;
      const al = (0.16 + 0.7 * s.m) * (0.85 + 0.15 * Math.sin(t * 1.1 + s.tw)), r = 0.55 + 1.5 * s.m;
      c.fillStyle = s.hue < 0.2 ? rgba('#FFE2C4', al) : s.hue > 0.85 ? rgba('#CFE0FF', al) : rgba('#F4F1E8', al);
      if (r < 1.1) c.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r); else { c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fill(); }
    }
  });
}
/** orbit camera about the Earth: azimuth A (deg, from +X toward +Y), elevation E, distance D, apparent Earth radius R px */
function orbitCam({A, E, D, R, cx = 540, cy = 900, roll = 0}) {
  const a = A * D2R, e = E * D2R, pos = mul([Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)], D);
  const f = unit(mul(pos, -1)); let r0 = cross(f, ZUP); r0 = Math.hypot(r0[0], r0[1], r0[2]) < 1e-6 ? [1, 0, 0] : unit(r0); const u0 = cross(r0, f);
  const up = add(mul(u0, Math.cos(roll * D2R)), mul(r0, Math.sin(roll * D2R)));
  const cam = lookCam({pos, dir: f, up, F: R * Math.sqrt(D * D - 1), cx, cy}); cam.D = D; cam.R = R; return cam;
}
/** 3D polyline split by occlusion behind the Earth (unit sphere) and the near plane; draws on context c */
function path3(c, cam, P3, col, w, o = {}) {
  const out = []; let cur = null, kind = -1;
  for (const p of P3) {
    const s = cam.P(p); if (s[2] < 0.05) { if (cur && cur.length > 1) out.push([kind, cur]); cur = null; kind = -1; continue; }
    const k = (o.noOcc ? false : o.occ ? o.occ(p) : cam.hidden(p)) ? 1 : 0;
    if (k !== kind) { if (cur && cur.length > 1) out.push([kind, cur]); cur = cur && cur.length ? [cur[cur.length - 1]] : []; kind = k; }
    cur.push([s[0], s[1]]);
  }
  if (cur && cur.length > 1) out.push([kind, cur]);
  for (const [k, pts] of out) { if (k === 1 && !(o.ghost > 0)) continue; withAlpha(c, k === 1 ? o.ghost : 1, () => line(c, pts, col, w, {dash: o.dash || null})); }
}
/** offscreen layer (full frame) faded out toward the caption band, composited onto the stage */
let LAY = null, LAYC = null;
function layer(stage, fn, {y0 = 1215, y1 = 1300, comp = 'source-over', alpha = 1} = {}) {
  if (alpha <= 0) return;
  if (!LAY) { LAY = createCanvas(1080, 1920); LAYC = LAY.getContext('2d'); }
  const L = LAYC; L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1; L.clearRect(0, 0, 1080, 1920);
  fn(L);
  L.globalCompositeOperation = 'destination-out'; L.globalAlpha = 1;
  const g = L.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); L.fillStyle = g; L.fillRect(0, y0, 1080, 1920 - y0);
  const g2 = L.createLinearGradient(0, 240, 0, 315); g2.addColorStop(0, 'rgba(0,0,0,0.85)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); L.fillStyle = g2; L.fillRect(0, 0, 1080, 315);   // keep the title band clear
  L.globalCompositeOperation = 'source-over';
  const c = stage.ctx; c.save(); c.globalCompositeOperation = comp; c.globalAlpha *= alpha; c.drawImage(LAY, 0, 0); c.restore();
}

// ---- field-line model (drawing) ----
const RC = 2.6, gR = r => 1 + RC * (1 - Math.exp(-(r - 1) / RC));   // drawn radius: compressed, footpoint latitude kept
const hDir = phi => [-Math.cos(phi * D2R), Math.sin(phi * D2R), 0];  // meridian direction; phi 0 = sunward, 180 = midnight
const lfOpen = phi => 76 + 2 * Math.cos(phi * D2R);                  // lines with feet above this latitude are open (tail lobes)
function catmull(P, n = 10) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const u = k / n, u2 = u * u, u3 = u2 * u; out.push([0, 1, 2].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3))); }
  }
  out.push(P[P.length - 1]); return out;
}
const FLC = new Map();
/** the field line whose northern foot is at magnetic latitude lf in meridian phi. closed: north foot → south foot.
 *  open: north foot → tail (sg = −1 mirrors to the south). stretch scales the night-side tail stretch. */
function fieldLine(lf, phi, stretch = 1, sg = 1) {
  const key = `${lf}|${phi}|${stretch.toFixed(3)}|${sg}`; if (FLC.has(key)) return FLC.get(key);
  const hd = hDir(phi), cp = Math.cos(phi * D2R), wD = Math.max(0, cp) ** 2, wN = ((1 - cp) / 2) ** 2;
  const st = stretch * 2.3 * smooth((lf - 55) / 17) * wN, L = Lof(lf);
  let res;
  if (lf < lfOpen(phi)) {
    const P = [];
    for (let i = 0, n = 110; i <= n; i++) {
      const lam = lf * Math.cos(Math.PI * i / n), r = L * Math.cos(lam * D2R) ** 2, rd = gR(r), k = smooth((rd - 1.1) / 1.3);
      let rho = rd * Math.cos(lam * D2R), z = rd * Math.sin(lam * D2R);
      rho *= (1 - 0.2 * wD * smooth((rd - 1.3) / 2)) * (1 + st * k);
      z *= 1 - 0.3 * (st / (1 + st)) * k;
      P.push([rho * hd[0], rho * hd[1], z]);
    }
    res = {closed: true, P, L};
  } else {
    const A0 = [];
    for (let i = 0; i <= 40; i++) { const lam = lf - i * 0.9, rd = gR(L * Math.cos(lam * D2R) ** 2); A0.push([rd * Math.cos(lam * D2R) * hd[0], rd * Math.cos(lam * D2R) * hd[1], sg * rd * Math.sin(lam * D2R)]); if (rd > 1.32) break; }
    const zl = 1.0 + 2.1 * smooth((lf - lfOpen(phi)) / (89.5 - lfOpen(phi))), yl = Math.sin(phi * D2R) * 1.4, a = A0[A0.length - 1];
    const ctrl = [A0[A0.length - 2], a];
    if (cp > 0.25) ctrl.push([0.25, yl * 0.5, sg * (zl + 0.75)]); else ctrl.push([1.0 + 0.4 * (1 + cp), yl * 0.8, sg * (zl * 0.92)]);
    ctrl.push([3.2, yl, sg * zl], [7, yl * 1.15, sg * zl * 1.1], [16, yl * 1.3, sg * zl * 1.25]);
    res = {closed: false, P: [...A0.slice(0, -2), ...catmull(ctrl, 14)]};
  }
  if (FLC.size > 4000) FLC.clear();
  FLC.set(key, res); return res;
}
/** a set of field lines for the 3D shells: closed lines in 12 meridians, open lobes near midnight and over the cusps */
function shellLines(stretch = 1) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const phi = k * 45;
    for (const lf of [54, 63, 68, 72]) if (lf < lfOpen(phi)) out.push({lf, phi, ...fieldLine(lf, phi, stretch)});
    if (Math.cos(phi * D2R) < -0.6 || Math.cos(phi * D2R) > 0.9) for (const lf of [80, 85]) for (const sg of [1, -1]) out.push({lf, phi, sg, ...fieldLine(lf, phi, stretch, sg)});
  }
  return out;
}
/** curve-length table of a polyline */
function polyLen(P) { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2])); return L; }
function polyAt(P, L, s) {
  s = clamp(s, 0, L[L.length - 1]); let i = 1; while (i < L.length - 1 && L[i] < s) i++;
  const q = (s - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]), p = add(P[i - 1], mul(sub(P[i], P[i - 1]), q)), T = unit(sub(P[i], P[i - 1]));
  return {p, T};
}
/** points of a helix around the polyline between arc lengths s0 → s1 (gyration radius rg, pitch per world unit k) */
function helix3(P, L, s0, s1, rg, k, ph = 0, ref = [0, 1, 0]) {
  const out = [], n = Math.max(2, Math.ceil(Math.abs(s1 - s0) * k * 16));
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, i / n), {p, T} = polyAt(P, L, s);
    let n1 = cross(T, ref); n1 = Math.hypot(...n1) < 1e-6 ? unit(cross(T, [0, 0, 1])) : unit(n1); const n2 = cross(T, n1), a = s * k * TAU + ph;
    out.push(add(p, add(mul(n1, rg * Math.cos(a)), mul(n2, rg * Math.sin(a)))));
  }
  return out;
}

// ---- magnetopause (Shue-type) and bow shock (conic) in drawn units; axial coordinate x = anti-sunward ----
const MP_R0 = 3.0, MP_A = 0.45, BS_R0 = 4.0, BS_E = 0.55;
const rMP = th => MP_R0 * (2 / (1 + Math.cos(th))) ** MP_A, rBS = th => BS_R0 * (1 + BS_E) / (1 + BS_E * Math.cos(th));
const MPT = (() => { const T = []; for (let th = 0; th < 172 * D2R; th += 0.5 * D2R) { const r = rMP(th); T.push([-r * Math.cos(th), r * Math.sin(th)]); } return T; })();
function mpRad(x) { if (x <= MPT[0][0]) return 0; for (let i = 1; i < MPT.length; i++) if (x < MPT[i][0]) { const [x0, r0] = MPT[i - 1], [x1, r1] = MPT[i]; return lerp(r0, r1, (x - x0) / (x1 - x0)); } return MPT[MPT.length - 1][1]; }
const SUN_X = -11.5, SUN_R = 1.9;
/** solar-wind streamline: impact parameter b, azimuth psi about the Sun–Earth line; leaves the Sun radially, flows past the magnetopause */
function swPoint(x, b, psi) { const rho = Math.sqrt((b * lerp(0.22, 1, smooth((x - SUN_X) / 4.5))) ** 2 + (1.07 * mpRad(x + 0.5)) ** 2); return [x, rho * Math.cos(psi), rho * Math.sin(psi)]; }
const SW = Array.from({length: 190}, (_, i) => {
  const b = 6.4 * Math.sqrt(rand(i * 3.13 + 0.7)), psi = (rand(i * 7.31 + 2.1) - 0.5) * 1.1 + (i % 2 ? Math.PI : 0), P = [];
  for (let x = SUN_X + SUN_R * 0.9; x <= 15; x += 0.12) P.push(swPoint(x, b, psi));
  return {b, psi, P, L: polyLen(P), ph: rand(i * 1.77), k: rand(i * 5.5)};
});
/** a surface of revolution about the Sun–Earth axis drawn by its outline: the meridian curves in the plane perpendicular to the
 *  line of sight (upper and lower edge), as a soft glowing band; returns the two screen polylines */
function revOutline(c, cam, rf, thMax, col, a, o = {}) {
  const ps = Math.atan2(-cam.f[1], cam.f[2]), out = [];   // in-plane direction ⟂ the line of sight → the outline
  for (const psi of [ps, ps + Math.PI]) {
    const P = []; for (let th = 0; th <= thMax; th += 1.5) { const r = rf(th * D2R), x = -r * Math.cos(th * D2R), rr = r * Math.sin(th * D2R); P.push([x, rr * Math.cos(psi), rr * Math.sin(psi)]); }
    const S = P.map(p => cam.P(p)).filter(q => q[2] > 0.05).map(q => [q[0], q[1]]); out.push(S);
    if (a > 0) for (const [w, al] of [[14, 0.05], [6, 0.16], [2.2, 0.75]]) line(c, S, rgba(col, al * a), w);
  }
  return out;
}
function drawSun(stage, cam, flare = 0) {
  const c = stage.ctx, s = cam.P([SUN_X, 0, 0]); if (s[2] < 0.1) return null;
  const r = SUN_R * cam.F / s[2], [x, y] = s;
  glow(c, x, y, r * 4.2, '#FFB45A', 0.22 + 0.15 * flare); glow(c, x, y, r * 2.0, '#FFD58A', 0.45 + 0.2 * flare);
  const g = c.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.1, x, y, r); g.addColorStop(0, '#FFFBEA'); g.addColorStop(0.65, '#FFE29A'); g.addColorStop(1, '#F59E3A');
  circle(c, x, y, r, g);
  for (let i = 0; i < 14; i++) { const a = rand(i * 2.1) * TAU, rr = r * (0.3 + 0.6 * rand(i * 4.4)); glow(c, x + rr * Math.cos(a), y + rr * Math.sin(a), r * 0.22, '#FFF6D0', 0.25); }
  return [x, y, r];
}
/** solar-wind particles: streaks along the streamlines; `flux` sets how many are lit; positions are a pure function of t */
function solarWind(c, cam, t, flux, o = {}) {
  if (flux <= 0.01) return;
  const v = o.v ?? 2.6, n = SW.length;
  for (let i = 0; i < n; i++) {
    const sw = SW[i], vis = clamp((flux * 0.62 - sw.k) * 6); if (vis <= 0) continue;
    const Lt = sw.L[sw.L.length - 1], s = ((sw.ph * Lt + v * t) % Lt + Lt) % Lt;
    const a = polyAt(sw.P, sw.L, s).p, b0 = polyAt(sw.P, sw.L, Math.max(0, s - 0.5)).p;
    if (cam.hidden(a)) continue;
    const A = cam.P(a), B = cam.P(b0); if (A[2] < 0.1 || B[2] < 0.1) continue;
    const fade = smooth(s / 1.2) * smooth((Lt - s) / 1.5) * vis * (o.a ?? 1);
    line(c, [[B[0], B[1]], [A[0], A[1]]], rgba(HEX.sw, 0.35 * fade), 2);
    glow(c, A[0], A[1], 7, HEX.sw, 0.45 * fade); circle(c, A[0], A[1], 1.6, rgba('#FFF6DD', 0.95 * fade));
  }
}

// ---- aurora on the globe: a thin emitting shell (90–470 km, altitude ×SHELL_EX), ray-marched at low resolution ----
const SHELL_EX = 1.7;
/** o: {S storm, I brightness, t, hemis [1, -1], scale, alpha, sunSuppress} — colours from EMIT through ALT_LUT */
function auroraShell(stage, cam, o = {}) {
  const ex = o.ex ?? SHELL_EX, Rs = 1 + 470 / RE_KM * ex, R1 = 1 + 88 / RE_KM * ex, sc = o.scale ?? 0.4, S = o.S ?? 0, I0 = o.I ?? 1, t = o.t ?? 0;
  if (I0 <= 0.002) return;
  const C = cam.P([0, 0, 0]), D = Math.hypot(cam.pos[0], cam.pos[1], cam.pos[2]), rr = cam.F * Rs / Math.sqrt(Math.max(1e-6, D * D - Rs * Rs)) * 1.03;
  const b = gbuf('shell', 0, 0, 1080, 1920, sc), {w, R, G, B} = b;
  const i0 = Math.max(0, Math.floor((C[0] - rr) * sc)), i1 = Math.min(w, Math.ceil((C[0] + rr) * sc)), j0 = Math.max(0, Math.floor((C[1] - rr) * sc)), j1 = Math.min(b.h, Math.ceil((C[1] + rr) * sc));
  const O = cam.pos, OO = dot(O, O), f = cam.f, r = cam.r, u = cam.u, F = cam.F, hem = o.hemis || [1, -1];
  const latMin = Math.min(ovalBand(180, S)[0], ovalBand(0, S)[0]) - 3, s2min = Math.sin(latMin * D2R) ** 2, K = 48 * I0;
  for (let j = j0; j < j1; j++) {
    const by = -((j + 0.5) / sc - cam.cy) / F;
    for (let i = i0; i < i1; i++) {
      const ax = ((i + 0.5) / sc - cam.cx) / F;
      let dx = f[0] + r[0] * ax + u[0] * by, dy = f[1] + r[1] * ax + u[1] * by, dz = f[2] + r[2] * ax + u[2] * by; const dl = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz); dx *= dl; dy *= dl; dz *= dl;
      const Bq = O[0] * dx + O[1] * dy + O[2] * dz, disc = Bq * Bq - (OO - Rs * Rs); if (disc <= 0) continue;
      const sq = Math.sqrt(disc); let t1 = -Bq - sq, t2 = -Bq + sq; if (t2 <= 0) continue; if (t1 < 0) t1 = 0;
      const dE = Bq * Bq - (OO - R1 * R1); if (dE > 0) { const tE = -Bq - Math.sqrt(dE); if (tE > 0 && tE < t2) t2 = tE; }
      const len = t2 - t1; if (len <= 0) continue;
      const n = Math.max(3, Math.min(26, Math.ceil(len / (0.006 * ex)))), ds = len / n;
      let ar = 0, ag = 0, ab = 0;
      for (let k = 0; k < n; k++) {
        const tt = t1 + (k + 0.5) * ds, px = O[0] + dx * tt, py = O[1] + dy * tt, pz = O[2] + dz * tt, r2 = px * px + py * py + pz * pz;
        if (pz * pz < s2min * r2) continue;
        const hs = pz > 0 ? 1 : -1; if (hem.indexOf(hs) < 0) continue;
        const rad = Math.sqrt(r2), alt = (rad - 1) * RE_KM / ex; if (alt < 86 || alt > 468) continue;
        const lat = Math.asin(Math.abs(pz) / rad) / D2R, phi = Math.atan2(py, -px) / D2R, cph = -px / Math.sqrt(px * px + py * py + 1e-9);
        const wN = (1 - cph) / 2, lo = lerp(OVAL_Q.noon[0], OVAL_Q.night[0], wN) - S * lerp(12, 22, wN), hi = lerp(OVAL_Q.noon[1], OVAL_Q.night[1], wN) - S * lerp(8, 15, wN);
        const m = smooth((lat - lo + 1.0) / 2.0) * (1 - smooth((lat - hi + 0.4) / 2.2)) * (1.15 - 0.5 * clamp((lat - lo) / (hi - lo + 1e-6)));   // brightest at the equatorward edge
        if (m <= 0.001) continue;
        const st = 0.3 + 0.7 * fbm1(phi / 6 + t * 0.18 + (hs < 0 ? 40 : 0), 3, 3) ** 1.6 * (0.6 + 0.4 * Math.sin(phi / 23 - t * 0.3 + lat * 0.4));
        const sunlit = smooth((-px / rad + 0.12) / 0.35), em = m * st * (0.35 + 0.65 * wN) * (1 - (o.sunSuppress ?? 0.85) * sunlit) * ds * K;
        const li = altIdx(alt) * 3; ar += ALT_LUT[li] * em; ag += ALT_LUT[li + 1] * em; ab += ALT_LUT[li + 2] * em;
      }
      if (ag + ar + ab > 0) { const q = j * w + i; R[q] += ar; G[q] += ag; B[q] += ab; }
    }
  }
  b.draw(stage, {gain: 1.0, bloom: o.bloom ?? 0.9, alpha: o.alpha ?? 1});
}
/** coastlines on the visible hemisphere (night side readable); alpha follows darkness */
function coastlines(c, cam, F, a = 0.5, col = '#8FB4C8') {
  if (a <= 0) return;
  for (const R of LAND) {
    const raw = R.raw; let run = [];
    const flush = () => { if (run.length > 1) line(c, run, rgba(col, a), 1.1); run = []; };
    for (let i = 0; i < raw.length; i++) {
      const p = geo2w(F, raw[i][1], raw[i][0]);
      if (dot(p, cam.pos) <= 1.02 || p[0] < -0.25) { flush(); continue; }   // back side, or the sunlit side (the texture shows it)
      const s = cam.P(p); run.push([s[0], s[1]]);
    }
    flush();
  }
}
/** a small marker on the globe at (lat, lon) */
function geoMark(stage, cam, F, lat, lon, label, o = {}) {
  const p = geo2w(F, lat, lon); if (dot(p, cam.pos) <= 1.0) return null;
  const s = cam.P(mul(p, 1.004)), c = stage.ctx;
  withAlpha(c, o.a ?? 1, () => { glow(c, s[0], s[1], 16, o.col || '#FFE2C4', 0.6); circle(c, s[0], s[1], 4.5, o.col || '#FFE2C4'); ring(c, s[0], s[1], 10, rgba(o.col || '#FFE2C4', 0.8), 1.6); });
  if (label) tag(stage, label, tagX(stage, label, s[0] + (o.dx ?? 18), o.size || 24, o.align || 'left'), s[1] + (o.dy ?? 0), {size: o.size || 24, color: o.col || '#FFE2C4', align: o.align || 'left', a: o.a ?? 1, plateA: 0.6});
  return s;
}
/** latitude circle (magnetic, about +Z) on the globe, front part only */
function magCircle(c, cam, lat, col, w, o = {}) { const P = []; for (let k = 0; k <= 180; k++) { const q = k / 180 * TAU, cl = Math.cos(lat * D2R) * (o.r ?? 1.003), sl = Math.sin(lat * D2R) * (o.r ?? 1.003); P.push([cl * Math.cos(q), cl * Math.sin(q), (o.sg ?? 1) * sl]); } path3(c, cam, P, col, w, {dash: o.dash, ghost: o.ghost}); }

// =====================================================================================================
// Scenes
// =====================================================================================================
const hookCam = t => groundCam({az: lerp(-5, 3, smooth(t / 7.5)), el: lerp(23, 25, smooth(t / 7.5)), F: 900, cy: 760});
const koreaCam = t => groundCam({az: lerp(-1.2, 1.0, smooth((t - 6) / 11)), el: 4.8, F: lerp(2050, 2180, smooth((t - 6) / 11)), cy: 760});
function hookPolar(stage, t, a) {
  const c = stage.ctx, cam = hookCam(t);
  polarSky(stage, cam, t);
  const b = gbuf('hook', 0, 0, 1080, 1240, 0.5);
  curtain(b, cam, t, {d0: 540, seed: 3, I: 1.0, ht: 240, A1: 50});
  curtain(b, cam, t, {d0: 300, seed: 1, I: 1.5, ht: 265});
  curtain(b, cam, t, {d0: 175, seed: 7, I: 0.7, ht: 225, A1: 28, env: s => smooth((s - 0.15) / 0.25) * smooth((0.8 - s) / 0.2)});
  b.draw(stage, {gain: 0.95, bloom: 0.9, alpha: a});
  polarLandscape(stage, cam, t, 0.85);
}

/** a low-latitude night (Hwacheon, looking north, telephoto): layered mountains, a few valley lights, and the top of a
 *  distant aurora (d = STORM_D) — the curtain is cut at hMin(d), so only its red upper part (> 220 km) is drawn */
const KR_RIDGES = [[0.8, 908, 34, '#16243A', 0.9], [1.3, 968, 70, '#101B2B', 1.6], [2.0, 1050, 95, '#0A1320', 2.4], [3.1, 1170, 130, '#050B13', 3.6]];
function koreaNight(stage, t, redI, ctx) {
  const c = stage.ctx, cam = koreaCam(t), hz = cam.dirP(dirAzEl(0, 0)), hy = hz ? hz[1] : 930;
  const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#02050C'); g.addColorStop(0.7, '#06101E'); g.addColorStop(1, '#0E1A2A');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  skyStars(stage, cam, t, 0.95, 0.5);
  const b = gbuf('korea', 0, 300, 1080, 760, 0.5);
  curtain(b, cam, t, {d0: STORM_D, seed: 11, I: 2.6 * redI, hb: 100, ht: 430, htVar: 60, span: 1300, A1: 120, A2: 30, curl: 20, drift: 0.6, horizon: true, rayC: 0.45});
  b.draw(stage, {gain: 0.85, bloom: 1.0, cross: 0.02});
  // mountain layers (atmospheric perspective), valley lights between the 3rd and 4th ridge
  KR_RIDGES.forEach(([f, y0, amp, col, sh], k) => {
    const P = []; for (let x = -10; x <= 1090; x += 6) { const az = (x - 540) / cam.F / D2R + 0; P.push([x, y0 - amp * fbm1((x + t * 2 * sh) * 0.004 * f + k * 3.1, 20 + k, 5) - (k === 3 ? 8 * fbm1(x * 0.08, 41, 2) : 0)]); }
    poly(c, [...P, [1090, 1920], [-10, 1920]], col);
    line(c, P, rgba('#3A4F66', 0.18 - 0.03 * k), 1.2);
    if (k === 2) for (let i = 0; i < 9; i++) { const x = 200 + 640 * rand(i * 4.7 + 1), y = 1062 + 22 * rand(i * 2.3), fl = 0.75 + 0.25 * Math.sin(t * 2.3 + i * 1.7); glow(c, x, y, 14, '#FFB66B', 0.28 * fl); circle(c, x, y, 1.6, rgba('#FFE0B0', 0.9 * fl)); }
  });
  const fg = c.createLinearGradient(0, 1150, 0, 1920); fg.addColorStop(0, 'rgba(3,6,10,0)'); fg.addColorStop(0.25, 'rgba(3,6,10,0.85)'); fg.addColorStop(1, '#02050A');
  c.fillStyle = fg; c.fillRect(0, 1150, 1080, 770);
  return cam;
}
// ---- 2D night background for the diagram scenes ----
const NSTARS = Array.from({length: 280}, (_, i) => [1080 * rand(i * 3.7 + 0.1), 1700 * rand(i * 5.3 + 0.9), rand(i * 2.2) ** 3]);
function nightBg(stage, t, o = {}) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#020910'); g.addColorStop(0.6, '#04121C'); g.addColorStop(1, '#020A10');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  for (const [x, y, m] of NSTARS) { c.fillStyle = rgba('#F4F1E8', (0.1 + 0.45 * m) * (o.stars ?? 1) * (0.85 + 0.15 * Math.sin(t * 1.3 + x))); c.fillRect(x, y, 1 + 1.4 * m, 1 + 1.4 * m); }
}
const spline = K => {   // Hermite through [[t, v], …] (interior slope = neighbour secant, zero at the ends)
  const m = K.map((k, i) => (i === 0 || i === K.length - 1) ? 0 : (K[i + 1][1] - K[i - 1][1]) / (K[i + 1][0] - K[i - 1][0]));
  return t => { if (t <= K[0][0]) return K[0][1]; if (t >= K[K.length - 1][0]) return K[K.length - 1][1]; let i = 0; while (t > K[i + 1][0]) i++;
    const [t0, v0] = K[i], [t1, v1] = K[i + 1], h = t1 - t0, q = (t - t0) / h, q2 = q * q, q3 = q2 * q; return (2 * q3 - 3 * q2 + 1) * v0 + (q3 - 2 * q2 + q) * h * m[i] + (-2 * q3 + 3 * q2) * v1 + (q3 - q2) * h * m[i + 1]; };
};

// ---- origin: name cards, Birkeland's terrella ----
function glyphBox(stage, x, y, kind, t) {
  const c = stage.ctx, T = stage.theme;
  c.save(); c.beginPath(); c.roundRect(x, y - 70, 150, 140, 10); c.clip();
  if (kind === 'dawn') {
    const g = c.createLinearGradient(0, y - 70, 0, y + 70); g.addColorStop(0, '#0B1E33'); g.addColorStop(0.62, '#7A3E4A'); g.addColorStop(0.8, '#F2A65A'); g.addColorStop(1, '#2A1A14'); c.fillStyle = g; c.fillRect(x, y - 70, 150, 140);
    glow(c, x + 75, y + 32, 70, '#FFD08A', 0.55); circle(c, x + 75, y + 32, 24, '#FFE7B8'); c.fillStyle = '#1A120E'; c.fillRect(x, y + 34, 150, 40);
  } else if (kind === 'wind') {
    c.fillStyle = '#0A1B2A'; c.fillRect(x, y - 70, 150, 140);
    stage.text('N', x + 75, y - 46, {role: 'display', size: 26, weight: 700, color: '#9CCBFF', align: 'center'});
    for (let k = 0; k < 4; k++) { const x0 = x + 30 + k * 30, ph = t * 1.4 + k; const P = []; for (let yy = y - 26; yy <= y + 56; yy += 4) P.push([x0 + 6 * Math.sin((yy - y) / 14 + ph), yy]); line(c, P, rgba('#9CCBFF', 0.75), 2.2); arrow(c, P[P.length - 3], P[P.length - 1], rgba('#9CCBFF', 0.9), 2.2, {head: 9}); }
  } else {
    c.fillStyle = '#071722'; c.fillRect(x, y - 70, 150, 140);
    const cx = x + 75, cy = y + 18; const g = c.createRadialGradient(cx - 14, cy - 18, 4, cx, cy, 48); g.addColorStop(0, '#2C5A70'); g.addColorStop(1, '#081A24'); circle(c, cx, cy, 48, g);
    c.save(); c.globalCompositeOperation = 'lighter'; c.beginPath(); c.ellipse(cx, cy - 30, 26, 8, 0, 0, TAU); c.strokeStyle = rgba(HEX.green, 0.9); c.lineWidth = 4; c.stroke(); glow(c, cx, cy - 32, 34, HEX.green, 0.35); c.restore();
  }
  c.restore();
  rect(c, x, y - 70, 150, 140, 10, null, rgba(T.border, 1), 1.2);
}
function nameCards(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const cards = [
    {y: 395, on: fadeIn(t, at(A.roma) - 0.25, 0.7), big: 'Aurora', sub: '로마 신화 · 새벽의 여신', col: '#FFC79E', g: 'dawn'},
    {y: 615, on: fadeIn(t, at(A.boreasW) - 0.3, 0.6), big: 'Boreas', sub: '그리스·로마 신화 · 북풍의 신', col: '#9CCBFF', g: 'wind'},
    {y: 905, on: fadeIn(t, at(A.korean) - 0.25, 0.6), big: '極光 · 극광', sub: '극지방의 빛', col: HEX.green, g: 'pole'},
  ];
  for (const k of cards) {
    if (k.on <= 0) continue;
    withAlpha(c, a * k.on, () => {
      const y = k.y + 18 * (1 - easeOut(k.on));
      rect(c, 150, y - 88, 780, 176, 14, rgba(T.plate, 0.86), rgba(T.border, 1), 1.5);
      glyphBox(stage, 172, y, k.g, t);
      stage.text(k.big, 352, y - 20, {role: 'display', size: 56, weight: 700, color: k.col});
      stage.text(k.sub, 354, y + 42, {size: 28, weight: 500, color: T.ink});
    });
  }
  const cA = fadeIn(t, at(A.attach) - 0.35, 0.6) * a;
  if (cA > 0) tag(stage, 'Aurora Borealis = 북쪽의 오로라', 540, 762, {size: 30, color: T.light, a: cA, border: T.border});
}
const TER = {a: 0.5, X: 1.6, Y: 1.15, Z: 1.05, gun: [-1.38, 0, 0.0], ring: 58};
function terCam(t, ctx) { const s0 = ctx.tl.at('s04') - 0.5, q = smooth((t - s0) / (ctx.scene.end - s0)), A = lerp(-64, -46, q) * D2R, E = lerp(17, 12, q) * D2R, D = 7.2;
  return lookCam({pos: [D * Math.cos(E) * Math.cos(A), D * Math.cos(E) * Math.sin(A), D * Math.sin(E)], target: [0, 0, -0.05], up: ZUP, F: 1320, cx: 540, cy: 730}); }
/** terrella dipole line (true dipole, sphere radius a) */
const terLine = (L, phi, n = 60) => Array.from({length: n + 1}, (_, i) => { const lf = Math.acos(Math.sqrt(1 / L)) / D2R, lam = lf * Math.cos(Math.PI * i / n), r = TER.a * L * Math.cos(lam * D2R) ** 2; return [r * Math.cos(lam * D2R) * -Math.cos(phi * D2R), r * Math.cos(lam * D2R) * Math.sin(phi * D2R), r * Math.sin(lam * D2R)]; });
/** electron k in the terrella: leaves the gun, joins a field line near its apex, spirals to the north or south foot */
function terPath(k) {
  const L = 2.4 + 0.3 * rand(k * 2.3), phi = (rand(k * 5.1) - 0.5) * 70, sg = k % 2 ? -1 : 1, Pl = terLine(L, phi, 80), mid = 40;
  const half = sg > 0 ? Pl.slice(0, mid + 1).reverse() : Pl.slice(mid);
  const g = add(TER.gun, [0.08, (rand(k * 3.3) - 0.5) * 0.06, (rand(k * 4.4) - 0.5) * 0.06]), P = [g, ...half];
  return {P, L: polyLen(P), sg};
}
const TER_E = Array.from({length: 16}, (_, k) => ({...terPath(k), ph: rand(k * 9.1)}));
function terrella(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), cam = terCam(t, ctx);
  const fA = fadeIn(t, at(A.magnet) + 0.2, 0.8), bA = fadeIn(t, at(A.shoot) + 0.05, 0.5), rA = fadeIn(t, at(A.twoPoles) - 0.1, 0.9) * (0.7 + 0.3 * fadeIn(t, at(A.rings) - 0.1, 0.6));
  const {X, Y, Z} = TER, V = [[-X, -Y, -Z], [X, -Y, -Z], [X, Y, -Z], [-X, Y, -Z], [-X, -Y, Z], [X, -Y, Z], [X, Y, Z], [-X, Y, Z]];
  const FACES = [[[0, 1, 2, 3], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]], [[3, 2, 6, 7], [0, 1, 0]], [[0, 3, 7, 4], [-1, 0, 0]], [[1, 2, 6, 5], [1, 0, 0]]];
  const PV = V.map(v => cam.P(v)), front = ([ids, nrm]) => { const cc = mul(ids.reduce((m, i) => add(m, V[i]), [0, 0, 0]), 0.25); return dot(nrm, sub(cam.pos, cc)) > 0; };
  withAlpha(c, a, () => {
    // back walls (darker glass), the base plate
    for (const F of FACES) if (!front(F)) poly(c, F[0].map(i => [PV[i][0], PV[i][1]]), rgba('#7FA6C0', 0.05), rgba('#8FB0C4', 0.25), 1.2);
    // field lines of the magnet (faint), the beam glow and the electrons
    const LL = []; for (const phi of [0, 45, 90, 135, 180, 225, 270, 315]) for (const L of [1.7, 2.3]) LL.push(terLine(L, phi));
    const occ = p => cam.hidden(p, [0, 0, 0], TER.a);
    withAlpha(c, fA * 0.8, () => { for (const P of LL) path3(c, cam, P, rgba(HEX.mag, 0.38), 1.4, {dash: [4, 6], occ}); });
    c.save(); c.globalCompositeOperation = 'lighter';
    if (bA > 0) for (const e of TER_E) {
      const P2 = e.P.filter(p => !occ(p)).map(p => cam.P(p)); if (P2.length > 1) line(c, P2.map(q => [q[0], q[1]]), rgba('#A88CFF', 0.05 * bA), 5);
      const Lt = e.L[e.L.length - 1], s = ((t - at(A.shoot)) * 0.9 + e.ph * Lt) % Lt; if (t < at(A.shoot) + e.ph * 0.8) continue;
      const H = helix3(e.P, e.L, Math.max(0, s - 0.25), s, 0.022, 6, e.ph * 6, [0, 0, 1]).filter(p => !occ(p)).map(p => cam.P(p));
      if (H.length > 1) for (let i = 1; i < H.length; i++) line(c, [[H[i - 1][0], H[i - 1][1]], [H[i][0], H[i][1]]], rgba(HEX.e, 0.7 * bA * i / H.length), 1.4);
      const hp = polyAt(e.P, e.L, s).p; if (!occ(hp)) { const q = cam.P(hp); glow(c, q[0], q[1], 9, HEX.e, 0.7 * bA); circle(c, q[0], q[1], 2.2, rgba('#FFFFFF', bA)); }
    }
    c.restore();
    // the terrella (shaded sphere) and its polar glow rings
    const C0 = cam.P([0, 0, 0]), rp = TER.a * cam.F / C0[2];
    const g = c.createRadialGradient(C0[0] - rp * 0.35, C0[1] - rp * 0.4, rp * 0.08, C0[0], C0[1], rp); g.addColorStop(0, '#F1D6A8'); g.addColorStop(0.35, '#B88F58'); g.addColorStop(0.8, '#5E4527'); g.addColorStop(1, '#2A1E12'); circle(c, C0[0], C0[1], rp, g);
    if (rA > 0) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const sg of [1, -1]) for (const [w, al] of [[26, 0.08], [12, 0.2], [5, 0.45], [2, 0.9]]) {
        const P = []; for (let k = 0; k <= 96; k++) { const q = k / 96 * TAU, la = TER.ring * D2R, r = TER.a * 1.01; P.push([r * Math.cos(la) * Math.cos(q), r * Math.cos(la) * Math.sin(q), sg * r * Math.sin(la)]); }
        path3(c, cam, P, rgba('#D7A6FF', al * rA), w, {occ});
      }
      c.restore();
    }
    // electron gun on the left wall
    const G0 = cam.P(add(TER.gun, [-0.2, 0, 0])), G1 = cam.P(TER.gun);
    line(c, [[G0[0], G0[1]], [G1[0], G1[1]]], '#5E6D78', 16); line(c, [[G0[0], G0[1]], [G1[0], G1[1]]], '#9AA9B4', 6); if (bA > 0) glow(c, G1[0], G1[1], 26, '#B8A4FF', 0.6 * bA);
    // front glass (with a soft reflection) and the frame
    for (const F of FACES) if (front(F)) {
      const pts = F[0].map(i => [PV[i][0], PV[i][1]]); poly(c, pts, rgba('#9CC4DC', 0.045));
      if (F[1][1] === -1 || F[1][0] === -1) { c.save(); c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.clip(); const xs = pts.map(q => q[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), gg = c.createLinearGradient(x0, 0, x1, 0); gg.addColorStop(0.15, 'rgba(255,255,255,0)'); gg.addColorStop(0.24, 'rgba(255,255,255,0.07)'); gg.addColorStop(0.3, 'rgba(255,255,255,0)'); c.fillStyle = gg; c.fillRect(x0, 0, x1 - x0, 1920); c.restore(); }
    }
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) line(c, [[PV[i][0], PV[i][1]], [PV[j][0], PV[j][1]]], rgba('#A9B8C2', 0.75), 3);
    // labels
    const l1 = fadeIn(t, at(A.birk) - 0.1, 0.5), l2 = fadeIn(t, at(A.magnet) - 0.1, 0.5), l3 = fadeIn(t, at(A.shoot) - 0.05, 0.5), l4 = fadeIn(t, at(A.around) - 0.1, 0.5);
    tag(stage, '1900년 무렵 · 비르켈란 · 테렐라', 540, 1190, {size: 30, color: T.light, a: l1, border: T.border});
    { const q = PV[4][1] < PV[7][1] ? PV[4] : PV[7]; tag(stage, '진공 상자', tagX(stage, '진공 상자', q[0] + 20, 24, 'left'), q[1] - 30, {size: 24, color: T.muted, align: 'left', a: l1 * 0.9, plateA: 0.6}); }
    if (l2 > 0) { const q = [C0[0] + rp * 0.7, C0[1] + rp * 0.75]; withAlpha(c, l2, () => line(c, [q, [720, 1075]], rgba(T.muted, 0.8), 1.5)); tag(stage, '자석 공 (테렐라)', 700, 1095, {size: 26, color: '#E9C894', a: l2, align: 'left'}); }
    if (l3 > 0) { withAlpha(c, l3, () => line(c, [[G1[0], G1[1] + 14], [Math.max(200, G1[0]), 1075]], rgba(T.muted, 0.8), 1.5)); tag(stage, '전자 빔', Math.max(200, G1[0]), 1095, {size: 26, color: HEX.e, a: l3}); }
    if (l4 > 0) { const q = cam.P([0, -TER.a * 0.45, TER.a * 0.92]); withAlpha(c, l4, () => line(c, [[q[0], q[1] - 6], [q[0] + 150, 380]], rgba('#D7A6FF', 0.8), 1.5)); tag(stage, '두 극 둘레의 빛 고리', tagX(stage, '두 극 둘레의 빛 고리', q[0] + 150, 26), 360, {size: 26, color: '#E2C2FF', a: l4}); }
  });
}

// ---- essence: field lines into the high air; electrons spiral down and make the air glow ----
const ESS = {x: [330, 435, 540, 645, 750], y0: 330, y1: 905, P: 0.85, tau: 2.3};
const essX = (k, y) => { const x0 = ESS.x[k]; return x0 + (540 - x0) * 0.22 * ((y - ESS.y0) / (ESS.y1 - ESS.y0)) ** 2; };
/** electron releases in the essence scene (index, line, release time, impact time) — shared with sound */
export function essElectrons(tl) {
  const s0 = tl.scene('essence').start, s1 = tl.scene('essence').end, out = [];
  for (let k = 0; ; k++) { const tr = s0 - 1.2 + k * ESS.P; if (tr > s1) break; out.push({k, line: (k * 3) % 5, tr, ti: tr + ESS.tau}); }
  return out;
}
function essence(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('essence'), ef = endFade(t, ctx), a0 = fadeIn(t, sc.start + 0.05, 0.6) * ef;
  nightBg(stage, t, {stars: 0.7});
  withAlpha(c, a0, () => {
    // the high air: a glowing layer (100–200 km), atoms
    const g = c.createLinearGradient(0, 820, 0, 1060); g.addColorStop(0, 'rgba(40,90,110,0)'); g.addColorStop(0.45, 'rgba(40,90,110,0.22)'); g.addColorStop(1, 'rgba(20,50,70,0.4)'); c.fillStyle = g; c.fillRect(0, 820, 1080, 240);
    const hor = []; for (let x = 0; x <= 1080; x += 10) hor.push([x, 1075 + ((x - 540) / 540) ** 2 * 40]); poly(c, [...hor, [1080, 1920], [0, 1920]], '#04101A'); line(c, hor, rgba('#5FA8C8', 0.35), 2);
    for (let i = 0; i < 46; i++) { const x = 60 + 960 * rand(i * 1.9), y = 880 + 170 * rand(i * 3.7) + 4 * Math.sin(t * 0.8 + i), n2 = rand(i * 5.9) > 0.45; if (y > 1060) continue;
      if (n2) { circle(c, x - 2.6, y, 2.6, rgba('#9DB8FF', 0.4)); circle(c, x + 2.6, y, 2.6, rgba('#9DB8FF', 0.4)); } else circle(c, x, y, 3, rgba('#FF9B7A', 0.4)); }
    // field lines
    for (let k = 0; k < 5; k++) { const P = []; for (let y = ESS.y0 - 20; y <= 1070; y += 10) P.push([essX(k, y), y]); line(c, P, rgba(HEX.mag, 0.28), 2); arrow(c, P[20], P[23], rgba(HEX.mag, 0.6), 2, {head: 10}); }
    // electrons: helix down the line (front half bright, back half dim), then a flash in the air
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const e of essElectrons(ctx.tl)) {
      const q = (t - e.tr) / ESS.tau; if (q < 0 || t > e.ti + 1.6) continue;
      if (q < 1) {
        const yH = lerp(ESS.y0 - 40, ESS.y1, q), pts = [];
        for (let yy = Math.max(ESS.y0 - 40, yH - 150); yy <= yH; yy += 2) { const th = yy / 58 * TAU + e.k; pts.push([essX(e.line, yy) + 16 * Math.cos(th), yy, Math.sin(th)]); }
        for (let i = 1; i < pts.length; i++) { const al = (i / pts.length) * (pts[i][2] > 0 ? 0.9 : 0.3); line(c, [pts[i - 1], pts[i]], rgba(HEX.e, al), 2); }
        const hp = pts[pts.length - 1]; glow(c, hp[0], hp[1], 12, HEX.e, 0.8); circle(c, hp[0], hp[1], 3, '#FFFFFF');
      } else {
        const age = t - e.ti, x = essX(e.line, ESS.y1), y = ESS.y1 + 30, f = Math.exp(-age / 0.55);
        glow(c, x, y, 50 + 30 * age, '#FFFFFF', 0.35 * f); ring(c, x, y, 18 + 90 * age, rgba(HEX.green, 0.5 * f), 2);
      }
    }
    c.restore();
    // the air glows where they hit: short rays coloured by altitude (the same EMIT as everywhere; 1000 px ≈ 100 km, 820 ≈ 260 km)
    const gb = gbuf('ess', 0, 700, 1080, 420, 0.5);
    for (const e of essElectrons(ctx.tl)) {
      const age = t - e.ti; if (age < 0 || age > 2.2) continue;
      const f = Math.exp(-age / 0.7) * smooth(age / 0.08), x0 = essX(e.line, ESS.y1);
      for (let dx = -26; dx <= 26; dx += 0.7) { const w = Math.exp(-((dx / 12) ** 2)) * (0.5 + 0.5 * fbm1(dx / 2.5 + e.k * 7, 4, 2)); gb.ray(x0 + dx, 1000, x0 + dx * 0.95, 790, 100, 270, 2.0 * f * w); }
    }
    gb.draw(stage, {gain: 1.2, bloom: 1.0});
    // labels
    const l1 = fadeIn(t, at(A.field5) - 0.1, 0.5), l2 = fadeIn(t, at(A.charged) - 0.1, 0.5), l3 = fadeIn(t, at(A.air5) - 0.1, 0.5), l4 = fadeIn(t, at(A.light5) - 0.2, 0.5);
    tag(stage, '자기력선', 860, 360, {size: 26, color: HEX.mag, a: l1, plateA: 0.6});
    tag(stage, '전기 띤 입자 (전자)', 260, 520, {size: 26, color: HEX.e, a: l2, plateA: 0.6});
    tag(stage, '높은 하늘의 공기 · 산소 · 질소', 540, 840, {size: 26, color: '#9FC9D8', a: l3, plateA: 0.6});
    { const last = essElectrons(ctx.tl).filter(e => e.ti <= at(A.light5) + 0.2).pop(), lx = last ? essX(last.line, ESS.y1) : 860; tag(stage, '빛', tagX(stage, '빛', lx + 70, 30, 'left'), 960, {size: 30, color: HEX.green, align: 'left', a: l4, plateA: 0.6}); }
  });
  // the core card
  const p1 = fadeIn(t, at(A.field5) - 0.15, 0.5), p2 = fadeIn(t, at(A.high5) - 0.15, 0.5), p3 = fadeIn(t, at(A.light5) - 0.3, 0.5);
  withAlpha(c, fadeIn(t, at(A.core) - 0.1, 0.5) * ef, () => {
    panel(c, T, 140, 1130, 800, 186, 0.92);
    stage.text('핵심', 540, 1162, {size: 24, color: T.accent, align: 'center', weight: 700});
    const parts = [['자기장이 이끈 입자', HEX.mag, p1], [' + ', T.muted, p2], ['높은 하늘의 공기', '#9FC9D8', p2]];
    const sz = 34, ws = parts.map(([s]) => stage.measure(s, {size: sz, weight: 700})), tot = ws.reduce((x, y) => x + y, 0);
    let x = 540 - tot / 2; parts.forEach(([s, col, al], i) => { stage.text(s, x, 1214, {size: sz, weight: 700, color: col, alpha: 0.18 + 0.82 * al}); x += ws[i]; });
    if (p3 > 0) { glow(c, 540, 1272, 90, HEX.green, 0.25 * p3); stage.text('= 빛', 540, 1272, {role: 'display', size: 46, weight: 700, color: HEX.green, align: 'center', alpha: p3}); }
  });
}

// ---- one continuous space camera: wind (wide, dolly) → lines (side view) → s10 zoom out → oval (rise over the night pole) ----
function spaceCam(t, ctx) {
  const at = r => ctx.tl.at(r), sc = id => ctx.tl.scene(id), w0 = sc('wind').start, l0 = sc('lines').start, T10 = at('s10') - 0.6, o0 = sc('oval').start, o1 = sc('oval').end;
  const K = [
    [w0, {A: -106, E: 15, D: 26, R: 56, cx: 655, cy: 800}],
    [l0, {A: -95, E: 9, D: 17, R: 70, cx: 600, cy: 770}],
    [l0 + 2.8, {A: -90, E: 6, D: 7, R: 150, cx: 540, cy: 640}],
    [T10, {A: -90, E: 6, D: 7.2, R: 155, cx: 540, cy: 640}],
    [T10 + 2.4, {A: -90, E: 4, D: 14, R: 70, cx: 335, cy: 650}],
    [o0 + 0.15, {A: -90, E: 4, D: 14, R: 70, cx: 335, cy: 650}],
    [o0 + 3.6, {A: -16, E: 72, D: 3.4, R: 335, cx: 540, cy: 900}],
    [o1, {A: -4, E: 73, D: 3.35, R: 342, cx: 540, cy: 900}],
  ];
  const keys = ['A', 'E', 'D', 'R', 'cx', 'cy'], v = {};
  if (t <= K[2][0]) {                                         // wind → side view: one smooth spline (no stop at the scene cut)
    for (const k of keys) { const lg = k === 'D' || k === 'R'; const f = spline(K.slice(0, 3).map(([tt, o]) => [tt, lg ? Math.log(o[k]) : o[k]])); v[k] = lg ? Math.exp(f(t)) : f(t); }
  } else {
    let i = 3; while (i < K.length - 1 && t > K[i][0]) i++;
    const [t0, a] = K[i - 1], [t1, b] = K[i], q = i === K.length - 1 ? rampEase((t - t0) / (t1 - t0), 0.3) : easeInOut((t - t0) / (t1 - t0));
    for (const k of keys) v[k] = (k === 'D' || k === 'R') ? Math.exp(lerp(Math.log(a[k]), Math.log(b[k]), q)) : lerp(a[k], b[k], q);
  }
  return orbitCam(v);
}
const tailStretch = (t, ctx) => { const at = r => ctx.tl.at(r); return 1 + 0.34 * smooth((t - at(A.shake) + 0.3) / 1.1) - 0.46 * smooth((t - at(A.faster) + 0.25) / 0.8); };
function drawShells(L, cam, a, stretch = 1, o = {}) {
  for (const f of shellLines(stretch)) path3(L, cam, f.P, rgba(o.col || HEX.mag, a * (f.closed ? 0.3 : 0.22)), o.w ?? 1.6);
}

// ---- wind ----
function windScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('wind'), m = M(ctx), cam = spaceCam(t, ctx);
  const a0 = fadeIn(t, sc.start + 0.02, 0.7), flux = m.flux(t), shA = fadeIn(t, at(A.field7) - 0.3, 1.0), tailA = fadeIn(t, at(A.pushed) - 0.2, 1.2);
  spaceBg(stage, cam, t, a0);
  withAlpha(c, a0, () => {
    const sun = drawSun(stage, cam);
    earth(stage, cam, GEO.wind, {cloud: t * 0.3});
    layer(stage, L => {
      solarWind(L, cam, t, flux);
      if (shA > 0) {
        const bs = revOutline(L, cam, rBS, 112, '#D6E6FF', 0.9 * shA), mp = revOutline(L, cam, rMP, 150, HEX.mag, 0.9 * shA);
        withAlpha(L, 0.07 * shA, () => { for (let k = 0; k < 2; k++) poly(L, [...bs[k], ...mp[k].slice().reverse()], '#CFE2FF'); });
      }
      drawShells(L, cam, 0.35 + 0.65 * shA, 0.55 + 0.45 * tailA);
    }, {comp: 'lighter'});
    // labels
    if (sun) tag(stage, '태양', Math.max(170, sun[0] + sun[2] * 0.4), sun[1] - sun[2] - 34, {size: 28, color: '#FFD58A', a: fadeIn(t, at(A.sun6) - 0.1, 0.5)});
    tag(stage, '태양풍 · 전기를 띤 알갱이', 380, 470, {size: 26, color: HEX.sw, a: fadeIn(t, at(A.sw6) - 0.1, 0.5) * fadeOut(t, at(A.shield) - 0.3, 0.5)});
    const nose = cam.P([-rMP(0.5) * Math.cos(0.5), 0, rMP(0.5) * Math.sin(0.5)]), sh = fadeIn(t, at(A.shield) - 0.1, 0.5);
    if (sh > 0) { withAlpha(c, sh, () => line(c, [[nose[0], nose[1]], [nose[0] + 30, 470]], rgba(HEX.mag, 0.8), 1.5)); tag(stage, '지구 자기장 = 방패', tagX(stage, '지구 자기장 = 방패', nose[0] + 30, 26), 452, {size: 26, color: HEX.mag, a: sh, border: HEX.mag}); }
    const tp = cam.P([7.5, 0, 2.6]), ta = fadeIn(t, at(A.tail7) - 0.1, 0.5);
    if (ta > 0) tag(stage, '밤 쪽으로 긴 꼬리', tagX(stage, '밤 쪽으로 긴 꼬리', tp[0], 26), Math.max(560, tp[1]), {size: 26, color: HEX.mag, a: ta});
    const nA = fadeIn(t, at(A.night7) - 0.2, 0.5), E0 = cam.P([0, 0, 0]);
    tag(stage, '낮', E0[0] - cam.R - 40, E0[1] + cam.R + 26, {size: 24, color: T.muted, a: nA, plateA: 0.5}); tag(stage, '밤', E0[0] + cam.R + 36, E0[1] + cam.R + 26, {size: 24, color: T.muted, a: nA, plateA: 0.5});
  });
  // readouts
  const rA = fadeIn(t, at(A.speed6) - 0.2, 0.5) * fadeOut(t, sc.end - 0.1, 0.6);
  withAlpha(c, rA, () => {
    panel(c, T, 140, 1190, 800, 128, 0.9); line(c, [[407, 1204], [407, 1304]], rgba(T.border, 1), 1.2); line(c, [[673, 1204], [673, 1304]], rgba(T.border, 1), 1.2);
    stage.text('태양풍 속도', 274, 1222, {size: 24, color: T.muted, align: 'center'});
    stage.text('초속 약 400 km', 274, 1272, {role: 'display', size: 32, weight: 700, color: HEX.sw, align: 'center', alpha: 0.25 + 0.75 * fadeIn(t, at(A.v400) - 0.1, 0.4)});
    stage.text('지구까지', 540, 1222, {size: 24, color: T.muted, align: 'center'});
    stage.text('약 4일', 540, 1272, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
    stage.text('흘러드는 입자 (상대)', 806, 1222, {size: 24, color: T.muted, align: 'center'});
    rect(c, 700, 1262, 212, 18, 9, rgba(T.border, 0.9)); rect(c, 700, 1262, 212 * clamp(m.flux(t) / 2.2), 18, 9, HEX.sw);
  });
}

// ---- lines: helix, equator vs pole, the tail ----
const SIDE_LF = [25, 35, 45, 55, 62, 67, 71];
const SHEET = Array.from({length: 46}, (_, i) => ({lf: 64.5 + 6 * rand(i * 3.1), phi: 180 + (rand(i * 5.7) - 0.5) * 50, sg: i % 2 ? -1 : 1, ph: rand(i * 7.3), v: 0.75 + 0.5 * rand(i * 2.9), t0: rand(i * 1.3)}));
const lineHalf = (lf, phi, st, sg) => { const P = fieldLine(lf, phi, st).P, mid = P.length >> 1; return sg > 0 ? P.slice(0, mid + 1).reverse() : P.slice(mid); };
function scanLf(t, ctx) { const at = r => ctx.tl.at(r); if (t < at('s09') - 0.3) return 62; return lerp(62, 25, smooth((t - at('s09') + 0.3) / 0.6)) + 47 * smooth((t - at(A.eq9) - 0.4) / (at(A.dive) + 0.7 - at(A.eq9) - 0.4)); }
function linesScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('lines'), m = M(ctx), cam = spaceCam(t, ctx), l0 = sc.start;
  const shellA = fadeOut(t, l0 + 0.5, 1.6), sideA = fadeIn(t, l0 + 0.4, 1.2), st = tailStretch(t, ctx);
  const s08A = fadeIn(t, at('s08') - 0.2, 0.5) * fadeOut(t, at('s09') - 0.6, 0.5), s09A = fadeIn(t, at('s09') - 0.2, 0.5) * fadeOut(t, at('s10') - 0.6, 0.5);
  const s10A = fadeIn(t, at('s10') - 0.4, 0.6), lf = scanLf(t, ctx), hiA = fadeIn(t, at('s08') - 0.2, 0.6) * fadeOut(t, at('s10') - 0.6, 0.5);
  const doorA = fadeIn(t, at(A.door) - 0.15, 0.5) * fadeOut(t, at('s10') + 0.4, 0.8);
  spaceBg(stage, cam, t);
  earth(stage, cam, GEO.wind, {cloud: t * 0.3});
  // aurora on the globe once the particles pour in (same renderer as the oval scene)
  auroraShell(stage, cam, {S: 0, I: m.pour(t), t, scale: 0.5});
  const lef0 = endFade(t, ctx, 0.7);
  layer(stage, L => {
    solarWind(L, cam, t, m.flux(t) * fadeOut(t, at('s10') + 3, 1.5), {a: 0.8});
    if (shellA > 0) drawShells(L, cam, shellA);
    for (const phi of [0, 180]) {
      for (const f of SIDE_LF) path3(L, cam, fieldLine(f, phi, st).P, rgba(HEX.mag, 0.5 * sideA), 2);
      for (const f of (phi ? [76, 80, 85] : [80, 85])) for (const sg of [1, -1]) path3(L, cam, fieldLine(f, phi, st, sg).P, rgba(HEX.mag, 0.32 * sideA), 1.8);
    }
    // highlighted day-side line (s08) and the scan (s09): one line, its foot latitude = the readout
    if (hiA > 0) { const H = fieldLine(Math.round(lf * 4) / 4, 0, st).P; path3(L, cam, H, rgba('#FFFFFF', 0.25 * hiA), 7); path3(L, cam, H, rgba('#DDF2FF', 0.9 * hiA), 2.6); }
    // s08: an electron spiralling along the highlighted line (apex → north foot, repeating)
    if (s08A > 0) { const e = electronS08(t, ctx); for (let i = 1; i < e.H.length; i++) { const a = cam.P(e.H[i - 1]), b = cam.P(e.H[i]); line(L, [[a[0], a[1]], [b[0], b[1]]], rgba(HEX.e, 0.9 * s08A * i / e.H.length), 2); } const q = cam.P(e.p); glow(L, q[0], q[1], 14, HEX.e, 0.9 * s08A); circle(L, q[0], q[1], 3, rgba('#FFFFFF', s08A)); }
    // doors: both polar zones
    if (doorA > 0) for (const sg of [1, -1]) for (const [w, al] of [[16, 0.12], [6, 0.35], [2.5, 0.9]]) { magCircle(L, cam, 67, rgba(HEX.green, al * doorA), w, {sg, r: 1.02}); }
    // s10: the plasma sheet — particles sit in the tail, then accelerate along the lines to both polar ovals
    if (s10A > 0) for (const p of SHEET) {
      const H = lineHalf(p.lf, p.phi, st, p.sg), Lh = polyLen(H), Lt = Lh[Lh.length - 1], u = sheetU(p, t, ctx);
      const s = u * Lt, Hx = helix3(H, Lh, Math.max(0, s - 0.6), s, 0.05, 4.5, p.ph * 6, [0, 1, 0]);
      const al = s10A * (u < 0.98 ? 1 : 0);
      for (let i = 1; i < Hx.length; i++) { if (cam.hidden(Hx[i])) continue; const a = cam.P(Hx[i - 1]), b = cam.P(Hx[i]); line(L, [[a[0], a[1]], [b[0], b[1]]], rgba(HEX.ion, 0.75 * al * i / Hx.length), 1.8); }
      const hp = polyAt(H, Lh, s).p; if (!cam.hidden(hp)) { const q = cam.P(hp); glow(L, q[0], q[1], 10, HEX.ion, 0.7 * al); circle(L, q[0], q[1], 2.4, rgba('#FFF1DC', al)); }
    }
  }, {comp: 'lighter', alpha: lef0});
  // equator / pole markers on the main stage (s09)
  const eqA = fadeIn(t, at(A.eq9) - 0.1, 0.4) * s09A, poA = fadeIn(t, at(A.polar9) - 0.1, 0.4) * s09A;
  if (eqA > 0) { const p = cam.P([-1.0, 0, 0]); withAlpha(c, eqA, () => { line(c, [[p[0] - 4, p[1] - 70], [p[0] - 4, p[1] + 70]], rgba('#FFE2C4', 0.95), 3); for (const sgn of [-1, 1]) arrow(c, [p[0] - 18, p[1]], [p[0] - 18, p[1] + sgn * 64], rgba('#FFE2C4', 0.9), 2.5, {head: 10}); }); }
  if (poA > 0) { withAlpha(c, poA, () => { for (const f of [67, 71]) { const H = fieldLine(f, 180, st).P, a = cam.P(H[6]), b = cam.P(H[1]); arrow(c, [a[0], a[1]], [b[0], b[1]], rgba('#FFE2C4', 0.95), 3, {head: 12}); } }); }
  if (doorA > 0) tag(stage, '입자가 내려올 문 · 극지방', 540, 330, {size: 28, color: HEX.green, a: doorA, border: HEX.green});
  // s10 labels
  const lef = endFade(t, ctx, 0.6), tA = fadeIn(t, at(A.tail10) - 0.1, 0.5) * lef, stA = fadeIn(t, at(A.stored) - 0.1, 0.5) * fadeOut(t, at(A.faster) + 0.6, 0.4), fA = fadeIn(t, at(A.faster) - 0.1, 0.4) * fadeOut(t, at(A.toPoles) + 0.2, 0.5), pA = fadeIn(t, at(A.toPoles) - 0.1, 0.5) * lef;
  if (tA > 0) { const q = cam.P([6.5, 0, 1.6]); tag(stage, '꼬리', tagX(stage, '꼬리', q[0], 26), Math.max(360, q[1]), {size: 26, color: HEX.mag, a: tA}); }
  if (stA > 0) { const q = cam.P([5.2, 0, 0]); tag(stage, '쌓였던 입자', tagX(stage, '쌓였던 입자', q[0], 26), q[1] + 70, {size: 26, color: HEX.ion, a: stA}); }
  if (fA > 0) { const q = cam.P([3.5, 0, 0]); tag(stage, '빨라진다', tagX(stage, '빨라진다', q[0], 26), q[1] + 70, {size: 26, color: HEX.ion, a: fA}); }
  if (pA > 0) { const q = cam.P([0.4, 0, 1.2]); tag(stage, '극지방으로', tagX(stage, '극지방으로', q[0] + 60, 26, 'left'), q[1] - 40, {size: 26, color: HEX.green, align: 'left', a: pA}); }
  // tier 2: lenses
  if (s08A > 0) lensHelix(stage, t, ctx, s08A, cam);
  if (s09A > 0) lensPair(stage, t, ctx, s09A, cam, eqA, poA);
  // tier 3: readout
  linesReadout(stage, t, ctx, lf, fadeIn(t, at('s08') - 0.3, 0.5) * lef);
  if (fadeIn(t, l0 + 0.6, 0.5) * fadeOut(t, at('s10') - 0.5, 0.5) > 0) tag(stage, '← 태양 쪽', 200, 420, {size: 24, color: T.muted, a: fadeIn(t, l0 + 0.6, 0.5) * fadeOut(t, at('s10') - 0.5, 0.5), plateA: 0.5});
}
/** plasma-sheet particle progress u (0 = tail apex … 1 = foot): slow drift, then accelerated by m.accel, pouring repeatedly */
function sheetU(p, t, ctx) {
  const at = r => ctx.tl.at(r), t1 = at(A.faster) - 0.2 + 0.9 * p.t0;
  if (t < t1) return 0.04 + 0.03 * Math.sin(t * 0.9 + p.ph * TAU);
  const travel = 1.7 / p.v, k = (t - t1) / travel;
  return k - Math.floor(k) < 1 ? Math.min(1, 0.04 + (k - Math.floor(k)) * 0.96) : 1;
}
function electronS08(t, ctx) {
  const at = r => ctx.tl.at(r), H = lineHalf(62, 0, 1, 1), Lh = polyLen(H), Lt = Lh[Lh.length - 1], per = 3.4, k = ((t - at('s08') + 0.2) / per) % 1, s = Math.max(0, k) * Lt;
  return {H: helix3(H, Lh, Math.max(0, s - 0.9), s, 0.09, 3.2, 0, [0, 1, 0]), p: helix3(H, Lh, s, s, 0.09, 3.2, 0, [0, 1, 0])[0]};
}
/** lens frame helper */
function lens(stage, x, y, r, a, fn, title, link) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    if (link) line(c, [[x, y - r], link], rgba('#CFE2FF', 0.45), 1.5, {dash: [5, 6]});
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); c.fillStyle = '#030D16'; c.fillRect(x - r, y - r, 2 * r, 2 * r); fn(c); c.restore();
    ring(c, x, y, r, rgba('#9FC1D6', 0.9), 2.5);
    if (title) tag(stage, title, x, y - r - 26, {size: 26, color: T.ink, plateA: 0.8});
  });
}
/** 2.5D helix along a screen segment: back half dim (drawn first), the line, front half bright */
function helix2(c, x0, y0, ang, len, s, rg, pitch, col, o = {}) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, back = [], front = [];
  let prev = null;
  for (let d = Math.max(0, s - (o.trail ?? 240)); d <= s; d += 1) {   // consecutive samples → segments, sorted into the back / front half
    const th = d / pitch * TAU + (o.ph ?? 0), p = [x0 + dx * d + nx * rg * Math.cos(th), y0 + dy * d + ny * rg * Math.cos(th)], f = Math.sin(th) > 0, k = (d - s + (o.trail ?? 240)) / (o.trail ?? 240);
    if (prev) (f ? front : back).push([prev, p, k]); prev = p;
  }
  const seg = (arr, al) => { for (const [a, b, k] of arr) line(c, [a, b], rgba(col, al * k), 2.4); };
  seg(back, 0.45); if (o.line !== false) line(c, [[x0 - dx * 400, y0 - dy * 400], [x0 + dx * (len + 400), y0 + dy * (len + 400)]], rgba(HEX.mag, 0.85), 3); seg(front, 1);
  const th = s / pitch * TAU + (o.ph ?? 0), hp = [x0 + dx * s + nx * rg * Math.cos(th), y0 + dy * s + ny * rg * Math.cos(th)];
  glow(c, hp[0], hp[1], 14, col, 0.8); circle(c, hp[0], hp[1], 4, '#FFFFFF');
  return hp;
}
function lensHelix(stage, t, ctx, a, cam) {
  const at = r => ctx.tl.at(r), T = stage.theme, e = electronS08(t, ctx), q = cam.P(e.p), x = 540, y = 1045, r = 150, ac = fadeIn(t, at(A.along) - 0.2, 0.6);
  lens(stage, x, y, r, a, c => {
    const s = ((t - at('s08')) * 75) % 280 + 40;
    helix2(c, x - 200, y - 30, -0.06, 400, s, 34, 62, HEX.e);
    if (ac > 0) withAlpha(c, ac, () => {        // a particle pushed across the line only circles around it
      const cx = x + 40, cy = y + 62, th = (t - at(A.along)) * 4.2; line(c, [[x - 200, cy + 12], [x + 200, cy - 12]], rgba(HEX.mag, 0.55), 2);
      c.save(); c.beginPath(); c.ellipse(cx, cy, 8, 26, 0, 0, TAU); c.strokeStyle = rgba(HEX.ion, 0.6); c.lineWidth = 2; c.stroke(); c.restore();
      const px = cx + 8 * Math.sin(th), py = cy + 26 * Math.cos(th); glow(c, px, py, 12, HEX.ion, 0.8); circle(c, px, py, 3.5, '#FFFFFF');
    });
  }, null, [q[0], q[1]]);
  tag(stage, '자기력선을 감고 나선 (크기 과장)', 540, 868, {size: 26, color: HEX.e, a: a * fadeIn(t, at(A.helix) - 0.2, 0.5), plateA: 0.85});
  withAlpha(stage.ctx, a, () => {
    stage.text('선을 따라', 265, 1012, {size: 26, weight: 700, color: HEX.e, align: 'center', alpha: ac}); stage.text('쉽게 나아감', 265, 1048, {size: 26, weight: 700, color: HEX.e, align: 'center', alpha: ac});
    stage.text('가로질러서는', 815, 1080, {size: 26, weight: 700, color: HEX.ion, align: 'center', alpha: ac}); stage.text('제자리 맴돌기', 815, 1116, {size: 26, weight: 700, color: HEX.ion, align: 'center', alpha: ac});
  });
}
function lensPair(stage, t, ctx, a, cam, eqA, poA) {
  const at = r => ctx.tl.at(r), T = stage.theme, r = 128, yA = 1050;
  const pe = cam.P([-1.0, 0, 0]), pn = cam.P(geoZ(67, 180));
  lens(stage, 300, yA, r, a * eqA, c => {
    const gx = 300, gy = yA + 70 + 900; c.fillStyle = '#0B2530'; c.beginPath(); c.arc(gx, gy, 900, 0, TAU); c.fill(); ring(c, gx, gy, 900, rgba('#5FA8C8', 0.6), 2);
    for (const h of [26, 56, 86]) ring(c, gx, gy, 900 + h, rgba(HEX.mag, 0.6), 2, -Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2);
    const s = ((t - at(A.eq9)) * 80) % 300, th = -Math.PI / 2 - 0.17 + s / 900 / 1.0;
    const R0 = 956, X = gx + R0 * Math.cos(th), Y = gy + R0 * Math.sin(th);
    for (let k = 0; k < 40; k++) { const tt = th - k * 0.004, w = (k * 9 + t * 260) / 60 * TAU, rr = R0 + 16 * Math.cos(w); circle(c, gx + rr * Math.cos(tt), gy + rr * Math.sin(tt), 1.6, rgba(HEX.e, 0.9 * (1 - k / 40) * (Math.sin(w) > 0 ? 1 : 0.4))); }
    glow(c, X, Y, 12, HEX.e, 0.8); circle(c, X, Y, 3.5, '#FFFFFF');
    stage.text('땅과 나란히', 300, yA + 100, {size: 24, weight: 700, color: '#FFE2C4', align: 'center'});
  }, '적도 위', [pe[0] - 18, pe[1] + 70]);
  lens(stage, 780, yA, r, a * poA, c => {
    const gy = yA + 78; const g = c.createLinearGradient(0, gy - 70, 0, gy); g.addColorStop(0, 'rgba(60,160,120,0)'); g.addColorStop(1, 'rgba(60,160,120,0.25)'); c.fillStyle = g; c.fillRect(780 - r, gy - 70, 2 * r, 70);
    c.fillStyle = '#0B2530'; c.fillRect(780 - r, gy, 2 * r, 200); line(c, [[780 - r, gy], [780 + r, gy]], rgba('#5FA8C8', 0.6), 2);
    for (const dx of [-70, 0, 70]) line(c, [[780 + dx * 1.25, yA - r], [780 + dx * 0.85, gy + 40]], rgba(HEX.mag, 0.6), 2);
    const k = ((t - at(A.polar9)) / 1.6) % 1, yy = lerp(yA - r - 10, gy - 4, Math.max(0, k)), xs = yy0 => 780 + 0 * yy0;
    for (let i = 0; i < 46; i++) { const y2 = yy - i * 3, w = y2 / 40 * TAU; if (y2 < yA - r) break; circle(c, xs(y2) + 16 * Math.cos(w), y2, 1.6, rgba(HEX.e, 0.9 * (1 - i / 46) * (Math.sin(w) > 0 ? 1 : 0.4))); }
    glow(c, 780 + 16 * Math.cos(yy / 40 * TAU), yy, 12, HEX.e, 0.8); circle(c, 780 + 16 * Math.cos(yy / 40 * TAU), yy, 3.5, '#FFFFFF');
    if (k > 0.85) glow(c, 780, gy - 20, 60, HEX.green, 0.6 * (1 - (k - 0.85) / 0.15) + 0.2);
    stage.text('땅속으로', 780, yA + 100, {size: 24, weight: 700, color: '#FFE2C4', align: 'center'});
  }, '극지방', [pn[0], pn[1]]);
}
const geoZ = (lat, phi) => { const h = hDir(phi); return [Math.cos(lat * D2R) * h[0], Math.cos(lat * D2R) * h[1], Math.sin(lat * D2R)]; };
function linesReadout(stage, t, ctx, lf, a) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), m = M(ctx), t0 = at(A.toPoles) - 0.1, s10o = smooth((t - t0) / 0.25), s10 = smooth((t - t0 - 0.25) / 0.3);
  withAlpha(c, a, () => {
    panel(c, T, 140, 1206, 800, 114, 0.92); line(c, [[407, 1218], [407, 1308]], rgba(T.border, 1), 1.2); line(c, [[673, 1218], [673, 1308]], rgba(T.border, 1), 1.2);
    stage.text('땅에 닿는 곳 · 자기 위도', 274, 1234, {size: 24, color: T.muted, align: 'center'});
    stage.text('적도에서 가장 먼 곳', 540, 1234, {size: 24, color: T.muted, align: 'center'});
    if (s10o < 1) withAlpha(c, 1 - s10o, () => {
      stage.text(`${Math.round(lf)}°`, 274, 1282, {role: 'display', size: 38, weight: 700, color: '#DDF2FF', align: 'center'});
      stage.text(`지구 반지름 × ${Lof(lf).toFixed(1)}`, 540, 1282, {size: 28, weight: 700, color: '#DDF2FF', align: 'center'});
    });
    if (s10 > 0) withAlpha(c, s10, () => {
      stage.text('약 65~70°', 274, 1282, {role: 'display', size: 34, weight: 700, color: HEX.green, align: 'center'});
      stage.text(`지구 반지름 × ${Lof(65).toFixed(1)}~${Lof(70).toFixed(1)}`, 540, 1282, {size: 28, weight: 700, color: HEX.green, align: 'center'});
    });
    stage.text('입자 속도 (상대)', 806, 1234, {size: 24, color: T.muted, align: 'center'});
    const v = clamp(m.accel(t) / 5); rect(c, 700, 1268, 212, 18, 9, rgba(T.border, 0.9)); rect(c, 700, 1268, 212 * (0.12 + 0.88 * v), 18, 9, v > 0.4 ? HEX.ion : '#CFE2FF');
  });
}

// ---- oval: the camera rises over the night-side pole ----
function ovalScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('oval'), m = M(ctx), cam = spaceCam(t, ctx), rise = smooth((t - sc.start - 0.2) / 3.4), ef = endFade(t, ctx);
  spaceBg(stage, cam, t);
  earth(stage, cam, GEO.wind, {cloud: t * 0.3});
  withAlpha(c, rise, () => coastlines(c, cam, GEO.wind, 0.28));
  const boost = 1 + 0.25 * fadeIn(t, at(A.around11) - 0.1, 0.6);
  auroraShell(stage, cam, {S: 0, I: m.pour(t) * boost, t, scale: 0.42});
  layer(stage, L => {
    const st = 0.88;
    void st;
    const ll = fadeIn(t, at(A.magLat11) - 0.1, 0.6);
    if (ll > 0) for (const lat of [65, 70]) magCircle(L, cam, lat, rgba('#FFE2C4', 0.75 * ll), 2, {dash: [6, 7], r: 1.004});
  }, {comp: 'lighter'});
  // pole marks
  const qA = fadeIn(t, at(A.above) - 0.15, 0.4) * fadeOut(t, at(A.magPole) - 0.45, 0.3), xA = fadeIn(t, at(A.notOn) - 0.05, 0.35);
  const P = cam.P([0, 0, 1.004]);
  if (qA > 0) { withAlpha(c, qA, () => ring(c, P[0], P[1], 30, rgba('#FFE2C4', 0.8), 2)); const w = tag(stage, '극 바로 위?', P[0], P[1] - 60, {size: 26, color: '#FFE2C4', a: qA}); withAlpha(c, qA, () => crossOut(c, P[0] - w / 2, P[0] + w / 2, P[1] - 60, xA)); }
  const mA = fadeIn(t, at(A.magPole) - 0.1, 0.5) * ef;
  if (mA > 0) {
    withAlpha(c, mA, () => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) line(c, [[P[0] + dx * 5, P[1] + dy * 5], [P[0] + dx * 14, P[1] + dy * 14]], '#FFE2C4', 2.5); });
    tag(stage, '자기극 (대략)', P[0] + 22, P[1] + 32, {size: 24, color: '#FFE2C4', align: 'left', a: mA, plateA: 0.6});
    const G = geo2w(GEO.wind, 90, 0), Q = cam.P(mul(G, 1.004));
    if (dot(G, cam.pos) > 1) { withAlpha(c, mA, () => { circle(c, Q[0], Q[1], 4.5, '#CFE2FF'); ring(c, Q[0], Q[1], 9, rgba('#CFE2FF', 0.8), 1.5); }); tag(stage, '북극 (자전축)', Q[0] - 18, Q[1] - 26, {size: 24, color: '#CFE2FF', align: 'right', a: mA, plateA: 0.6}); }
  }
  const bA = fadeIn(t, at(A.band11) - 0.15, 0.5) * ef;
  if (bA > 0) { const q = cam.P(geoZ(64, 180)); withAlpha(c, bA, () => line(c, [[q[0], q[1] + 8], [q[0] + 60, 1120]], rgba(HEX.green, 0.8), 1.5)); tag(stage, '둥근 띠 · 오로라 고리', tagX(stage, '둥근 띠 · 오로라 고리', q[0] + 60, 26), 1140, {size: 26, color: HEX.green, a: bA, border: HEX.green}); }
  const cA = fadeIn(t, at(A.deg65) + 0.4, 0.6) * ef;
  if (cA > 0) { withAlpha(c, cA, () => line(c, [[P[0], P[1] - 12], [540, 352]], rgba(T.muted, 0.7), 1.5, {dash: [4, 6]})); tag(stage, '가운데(극관)는 오히려 어둡다', 540, 334, {size: 24, color: T.muted, a: cA, plateA: 0.7}); }
  latBar(stage, t, ctx, fadeIn(t, at(A.magLat11) - 0.2, 0.5) * ef, 0, null);
  blackFade(stage, 1 - ef);
}
/** instrument: magnetic latitude 0° (equator) → 90° (pole) with the oval band (night side) for storm S; optional Korea mark */
function latBar(stage, t, ctx, a, S, korea) {
  if (a <= 0) return;
  const {ctx: c} = stage, T = stage.theme, x0 = korea ? 462 : 180, x1 = 912, y = 1262, X = d => lerp(x0, x1, d / 90), [lo, hi] = ovalBand(180, S);
  withAlpha(c, a, () => {
    panel(c, T, korea ? 440 : 140, 1196, korea ? 500 : 800, 124, 0.92);
    stage.text(korea ? '오로라 고리 (밤 쪽)' : '오로라 고리 · 자기 위도 (밤 쪽)', x0, 1222, {size: 24, color: T.muted});
    rect(c, x0, y - 6, x1 - x0, 12, 6, rgba(T.border, 0.9));
    glow(c, X((lo + hi) / 2), y, 40, HEX.green, 0.35); rect(c, X(lo), y - 9, X(hi) - X(lo), 18, 8, HEX.green);
    for (const d of (korea ? [0, 60, 90] : [0, 30, 60, 90])) { line(c, [[X(d), y + 10], [X(d), y + 18]], rgba(T.muted, 0.9), 1.5); stage.text(`${d}°`, X(d), y + 36, {size: 24, color: T.muted, align: 'center'}); }
    const qo = smooth(S / 0.05), qv = smooth((S - 0.06) / 0.08);   // numbers only for the quiet oval (65~70°, script); the storm band is a model drawing, not a measurement
    if (qo < 1) stage.text(`${Math.round(ovalBand(180, 0)[0])}~${Math.round(ovalBand(180, 0)[1])}°`, x1, 1222, {size: 26, weight: 700, color: HEX.green, align: 'right', alpha: 1 - qo});
    if (qv > 0) stage.text('적도 쪽으로 넓어짐', x1, 1222, {size: 24, weight: 700, color: HEX.green, align: 'right', alpha: qv});
    if (korea) { const k = X(korea); line(c, [[k, y - 14], [k, y + 10]], '#FFE2C4', 3); circle(c, k, y - 16, 4, '#FFE2C4'); stage.text(`한국 ${Math.round(korea)}°`, k, y + 36, {size: 24, weight: 700, color: '#FFE2C4', align: 'center'}); }
  });
}

// ---- color: an electron excites an atom, the atom gives the energy back as light of a fixed colour; colours by altitude ----
const SPLUT = (() => { const L = {g: new Float32Array(ALT_N * 3), r: new Float32Array(ALT_N * 3), b: new Float32Array(ALT_N * 3), n: new Float32Array(ALT_N * 3)};
  for (let i = 0; i < ALT_N; i++) { const e = EMIT(ALT0 + i * ALT_STEP), tot = e.g + e.r * 1.4 + e.b + e.p; for (let k = 0; k < 3; k++) { L.g[i * 3 + k] = e.g * COL.g[k] / 255; L.r[i * 3 + k] = e.r * COL.r[k] / 255; L.b[i * 3 + k] = (e.b * COL.b[k] + e.p * COL.p[k]) / 255; L.n[i * 3 + k] = tot * 0.55; } }
  return L; })();
const MIXLUT = new Float32Array(ALT_N * 3);
function atomGlyph(c, x, y, kind, ex, t, col) {
  // nucleus (O: one; N₂: two), inner shell, the outer (excited) shell dashed; the outer electron sits on ring r0 → r1 when excited
  const r0 = 46, r1 = 82;
  c.save(); c.setLineDash([4, 7]); ring(c, x, y, r1, rgba('#9FB8C4', 0.35 + 0.4 * ex), 1.5); c.restore();
  ring(c, x, y, r0, rgba('#9FB8C4', 0.55), 1.5); ring(c, x, y, 22, rgba('#9FB8C4', 0.3), 1);
  if (kind === 'O') { glow(c, x, y, 26, '#FF9B7A', 0.35); circle(c, x, y, 10, '#FF9B7A'); } else { for (const d of [-9, 9]) { glow(c, x + d, y, 20, '#9DB8FF', 0.3); circle(c, x + d, y, 8.5, '#9DB8FF'); } }
  const th = t * 1.6 + (kind === 'O' ? 0 : 2), rr = lerp(r0, r1, ex), ex2 = [x + rr * Math.cos(th), y + rr * Math.sin(th)];
  if (ex > 0.02) glow(c, ex2[0], ex2[1], 22, col, 0.5 * ex);
  circle(c, ex2[0], ex2[1], 5, '#E8F4FF');
}
function photon(c, x, y, ang, d, col, a) {  // a wave packet travelling outward from (x, y)
  if (a <= 0) return;
  const P = [], dx = Math.cos(ang), dy = Math.sin(ang);
  for (let s = Math.max(0, d - 90); s <= d; s += 2) { const w = Math.sin(s / 9 * TAU) * 9 * Math.sin(Math.PI * (s - d + 90) / 90); P.push([x + dx * s - dy * w, y + dy * s + dx * w]); }
  withAlpha(c, a, () => { line(c, P, rgba(col, 0.35), 7); line(c, P, col, 2.6); if (P.length) glow(c, P[P.length - 1][0], P[P.length - 1][1], 18, col, 0.6); });
}
function colorScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('color'), ef = endFade(t, ctx);
  nightBg(stage, t, {stars: 0.6});
  const aA = fadeIn(t, sc.start + 0.05, 0.6) * fadeOut(t, at('s13') - 0.7, 0.5), bA = fadeIn(t, at('s13') - 0.45, 0.7) * ef;
  if (aA > 0) withAlpha(c, aA, () => {
    const st = [{x: 330, kind: 'O', name: '산소 원자 O', on: sc.start + 0.2, hit: at(A.hit12) + 0.35, em: at(A.fixed) - 0.05, col: HEX.green, nm: '557.7 nm'},
      {x: 750, kind: 'N', name: '질소 N₂⁺', on: sc.start + 0.6, hit: at(A.nit) + 0.5, em: at(A.emitW) - 0.2, col: HEX.blue, nm: '427.8 nm'}];
    for (const s of st) {
      const a = fadeIn(t, s.on, 0.5); if (a <= 0) continue;
      withAlpha(c, a, () => {
        const y = 640, ex = smooth((t - s.hit) / 0.25) * (1 - smooth((t - s.em) / 0.3));
        // the incoming electron along a vertical field line
        line(c, [[s.x, 330], [s.x, 560]], rgba(HEX.mag, 0.35), 2);
        const q = (t - (s.hit - 1.6)) / 1.6;
        if (q > 0 && q < 1) { const yy = lerp(320, y - 40, q); for (let i = 0; i < 40; i++) { const y2 = yy - i * 3, w = y2 / 36 * TAU; if (y2 < 320) break; circle(c, s.x + 14 * Math.cos(w), y2, 1.7, rgba(HEX.e, (1 - i / 40) * (Math.sin(w) > 0 ? 1 : 0.4))); } glow(c, s.x + 14 * Math.cos(yy / 36 * TAU), yy, 12, HEX.e, 0.8); circle(c, s.x + 14 * Math.cos(yy / 36 * TAU), yy, 3.5, '#FFFFFF'); }
        if (q >= 1 && q < 1.8) { const d = (q - 1) * 220; glow(c, s.x + d * 0.55, y + 40 + d, 10, HEX.e, 0.7 * (1 - (q - 1) / 0.8)); }
        if (q >= 1 && q < 1.25) glow(c, s.x, y, 90, '#FFFFFF', 0.35 * (1 - (q - 1) / 0.25));
        atomGlyph(c, s.x, y, s.kind, ex, t, s.col);
        // the photon(s): emitted on the drop, outward in a few directions
        const pe = t - s.em; if (pe > 0) for (const ang of [-0.65, 2.5]) photon(c, s.x, y, ang, 70 + Math.min(150, pe * 200), s.col, fadeOut(t, s.em + 1.6, 0.6));
        if (pe > 0) glow(c, s.x, y, 110, s.col, 0.18 * fadeIn(t, s.em, 0.2));
        stage.text(s.name, s.x, 512, {size: 28, weight: 700, color: s.kind === 'O' ? '#FFB49A' : '#B8CCFF', align: 'center'});
        // energy levels
        const ly0 = 900, ly1 = 810, lx = s.x - 90, lw = 180;
        line(c, [[lx, ly0], [lx + lw, ly0]], rgba('#9FB8C4', 0.8), 2.5); line(c, [[lx, ly1], [lx + lw, ly1]], rgba('#9FB8C4', 0.5 + 0.5 * ex), 2.5, {dash: [6, 6]});
        const ey = lerp(ly0, ly1, ex); glow(c, s.x - 30, ey, 14, '#E8F4FF', 0.6); circle(c, s.x - 30, ey, 5.5, '#E8F4FF');
        if (t > s.hit) withAlpha(c, fadeIn(t, s.hit, 0.3) * fadeOut(t, s.em + 1.5, 0.5), () => arrow(c, [s.x - 54, ly0 - 6], [s.x - 54, ly1 + 8], rgba('#FFE2C4', 0.9), 2.5, {head: 10}));
        if (pe > 0) { withAlpha(c, fadeOut(t, s.em + 2.6, 0.5), () => { arrow(c, [s.x + 10, ly1 + 6], [s.x + 10, ly0 - 8], rgba(s.col, 0.95), 2.5, {head: 10}); photon(c, s.x + 22, (ly0 + ly1) / 2, 0, 18 + Math.min(70, pe * 160), s.col, 1); }); }
        stage.text(s.nm, s.x, 950, {size: 26, weight: 700, color: s.col, align: 'center', alpha: fadeIn(t, s.em, 0.4)});
      });
    }
    stage.text('바닥 상태', 540, 900, {size: 24, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.energy) - 0.3, 0.5)});
    stage.text('들뜬 상태', 540, 810, {size: 24, color: T.muted, align: 'center', alpha: fadeIn(t, at(A.energy) - 0.3, 0.5)});
    tag(stage, '에너지를 받았다가 → 정해진 색의 빛으로', 540, 1010, {size: 28, color: T.ink, a: fadeIn(t, at(A.fixed) - 0.2, 0.5), border: T.border});
    // the neon sign: the same principle (a gas gives its own fixed colours)
    const nA = fadeIn(t, at(A.neon) - 0.2, 0.6);
    if (nA > 0) withAlpha(c, nA, () => {
      const P = []; for (let x = 330; x <= 750; x += 4) P.push([x, 1150 + 34 * Math.sin((x - 330) / 420 * 2.5 * TAU)]);
      const fl = 0.92 + 0.08 * Math.sin(t * 9);
      c.save(); c.globalCompositeOperation = 'lighter'; line(c, P, rgba('#FF5A2E', 0.18 * fl), 26); line(c, P, rgba('#FF6A3D', 0.5 * fl), 10); line(c, P, rgba('#FFD2B8', 0.95 * fl), 3.5); c.restore();
      stage.text('네온사인 · 네온 기체의 정해진 색', 540, 1256, {size: 26, weight: 700, color: '#FFB08F', align: 'center'});
    });
  });
  if (bA > 0) withAlpha(c, bA, () => colorColumn(stage, t, ctx));
}
const COLY = h => 1280 - h * 2.0;
function colorColumn(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  const wg = fadeIn(t, at(A.km100) - 0.2, 1.2), wr = fadeIn(t, at(A.higher) - 0.1, 1.2), wb = fadeIn(t, at(A.nit13) - 0.1, 1.0), wn = 0.35 * (1 - Math.max(wg, wr, wb) * 0.8);
  for (let i = 0; i < ALT_N * 3; i++) MIXLUT[i] = wg * SPLUT.g[i] + wr * SPLUT.r[i] * 1.3 + wb * SPLUT.b[i] * 1.25 + wn * SPLUT.n[i];
  // spectrum bar
  const sx = nm => lerp(190, 890, (nm - 400) / 300);
  const g = c.createLinearGradient(sx(400), 0, sx(700), 0); [[400, '#5B2BB0'], [440, '#3B4BFF'], [480, '#21A7E8'], [520, '#2BD86A'], [570, '#C8E83A'], [600, '#FFB22E'], [650, '#FF3B2E'], [700, '#8E1010']].forEach(([nm, cc]) => g.addColorStop((nm - 400) / 300, cc));
  rect(c, sx(400), 336, sx(700) - sx(400), 16, 8, g); c.fillStyle = 'rgba(2,9,16,0.55)'; c.fillRect(sx(400), 336, sx(700) - sx(400), 16);
  for (const [nm, col, w] of [[LINE_NM.blue, HEX.blue, wb], [LINE_NM.green, HEX.green, wg], [LINE_NM.red, HEX.red, wr]]) {
    withAlpha(c, 0.25 + 0.75 * w, () => { line(c, [[sx(nm), 326], [sx(nm), 362]], col, 4); if (w > 0.05) glow(c, sx(nm), 344, 26, col, 0.5 * w); });
    stage.text(`${nm.toFixed(1)} nm`, sx(nm), 392, {size: 24, weight: 700, color: col, align: 'center', alpha: w});
  }
  // altitude axis
  line(c, [[235, COLY(0)], [235, COLY(420)]], rgba(T.muted, 0.8), 2);
  for (const h of [0, 100, 200, 300, 400]) { line(c, [[227, COLY(h)], [243, COLY(h)]], rgba(T.muted, 0.9), 2); stage.text(`${h} km`, 222, COLY(h), {size: 24, color: T.muted, align: 'right'}); }
  line(c, [[235, COLY(0)], [930, COLY(0)]], rgba('#5FA8C8', 0.6), 2);
  // the curtain cross-section
  const b = gbuf('col', 260, 400, 520, 900, 0.5);
  for (let x = 300; x <= 640; x += 0.8) {
    const u = x / 6, rays = 0.3 + 0.7 * fbm1(u - t * 0.4, 21, 4) ** 1.8, env = smooth((x - 300) / 40) * smooth((640 - x) / 40), hb = 96 + 4 * fbm1(x / 30, 3, 2), ht = 380 + 50 * fbm1(x / 20 - t * 0.2, 5, 3);
    b.ray(x, COLY(hb - 8), x, COLY(ht), hb - 8, ht, 0.72 * env * rays, null, MIXLUT);
  }
  b.draw(stage, {gain: 1.1, bloom: 0.9});
  // brackets + labels
  const br = (h0, h1, col, a, l1, l2, ly) => { if (a <= 0) return; withAlpha(c, a, () => { const x = 668; line(c, [[x, COLY(h0)], [x + 12, COLY(h0)], [x + 12, COLY(h1)], [x, COLY(h1)]], col, 2.5); line(c, [[x + 12, (COLY(h0) + COLY(h1)) / 2], [x + 30, ly]], col, 1.5); stage.text(l1, x + 36, ly - 18, {size: 26, weight: 700, color: col}); stage.text(l2, x + 36, ly + 18, {size: 24, weight: 500, color: T.ink}); }); };
  br(100, 200, HEX.green, wg, '산소 · 초록', '100~200 km', COLY(150));
  br(200, 400, HEX.red, wr, '산소 · 빨강', '200 km 위', COLY(300));
  br(88, 108, HEX.blue, wb, '질소 · 파랑·보라', '아래 가장자리', COLY(62));
  // reference heights
  const r0 = fadeIn(t, at(A.height) - 0.2, 0.5);
  withAlpha(c, r0, () => {
    const py = COLY(PLANE_KM); c.save(); c.translate(292, py); c.fillStyle = '#DDE6EC'; c.beginPath(); c.moveTo(-18, 0); c.lineTo(16, -2); c.lineTo(20, 0); c.lineTo(16, 2); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-2, 0); c.lineTo(-10, -11); c.lineTo(-6, -11); c.lineTo(6, 0); c.closePath(); c.fill(); c.restore();
    stage.text('여객기 약 10 km', 322, py - 4, {size: 24, weight: 700, color: '#DDE6EC'});
    const iy = COLY(ISS_KM); c.save(); c.translate(292, iy); c.fillStyle = '#C9D4DC'; c.fillRect(-20, -2, 40, 4); for (const s of [-1, 1]) { c.fillStyle = '#5E86B4'; c.fillRect(s * 22 - 6, -12, 12, 24); } c.fillStyle = '#E8EEF2'; c.fillRect(-6, -5, 12, 10); c.restore();
    stage.text('국제우주정거장 약 400 km', 322, iy - 4, {size: 24, weight: 700, color: '#DDE6EC'});
  });
}

// ---- storm: the oval swells equatorward; from Korea only the high red part is above the horizon ----
const KOREA_MLAT = magLat(HWACHEON.lat, HWACHEON.lon);
function stormCam(t, ctx) { const sc = ctx.tl.scene('storm'), q = rampEase((t - sc.start) / (sc.duration || (sc.end - sc.start)), 0.3); return orbitCam({A: lerp(22, 34, q), E: lerp(43, 39, q), D: 3.5, R: lerp(300, 318, q), cx: 540, cy: 900}); }
function stormScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('storm'), m = M(ctx), S = m.storm(t), ef = endFade(t, ctx);
  const gA = fadeIn(t, at(A.korea15) - 0.45, 0.8);
  if (gA < 1) {
    const cam = stormCam(t, ctx);
    spaceBg(stage, cam, t);
    earth(stage, cam, GEO.storm, {night: 0.07});
    coastlines(c, cam, GEO.storm, 0.32);
    auroraShell(stage, cam, {S, I: 0.85 + 0.25 * S, t, scale: 0.42});
    geoMark(stage, cam, GEO.storm, HWACHEON.lat, HWACHEON.lon, '한국', {col: '#FFE2C4', dx: 18, dy: 28});
    // the solar blast (stylised) in the corner
    const bq = t - at(A.big) + 0.2;
    if (bq > 0) withAlpha(c, fadeOut(t, at(A.korea15) - 1.2, 0.6), () => {
      glow(c, 150, 360, 120, '#FFB45A', 0.5); circle(c, 150, 360, 34, '#FFE7B8');
      for (let k = 0; k < 3; k++) { const r = 40 + ((bq * 260 + k * 120) % 420); ring(c, 150, 360, r, rgba('#FFD58A', 0.55 * (1 - r / 460)), 3, -0.2, 1.4); }
      tag(stage, '태양 폭발', 300, 330, {size: 26, color: '#FFD58A', align: 'left', a: fadeIn(t, at(A.blast) - 0.2, 0.4) * fadeOut(t, at(A.y21) - 0.6, 0.35), plateA: 0.6});
    });
    // readouts: G-meter, magnetic latitude with Korea
    const rA = fadeIn(t, at(A.big) - 0.3, 0.5);
    withAlpha(c, rA, () => {
      panel(c, T, 140, 1196, 286, 124, 0.92);
      stage.text('폭풍 세기', 283, 1222, {size: 24, color: T.muted, align: 'center'});
      const g = gLevel(S); for (let k = 0; k < 5; k++) rect(c, 168 + k * 48, 1248, 40, 26, 5, k < g ? mix('#FFC46B', '#FF5A4A', k / 4) : rgba(T.border, 0.9));
      stage.text(g ? `G${g}` : '조용함', 283, 1300, {size: 24, weight: 700, color: g >= 5 ? '#FF7A5A' : T.ink, align: 'center'});
    });
    latBar(stage, t, ctx, rA, S, KOREA_MLAT);
    const yA = fadeIn(t, at(A.y21) - 0.2, 0.5) * fadeOut(t, at(A.korea15) - 0.6, 0.5);
    if (yA > 0) tag(stage, '2024년 5월 · 21년 만의 가장 센 폭풍 · G5', 540, 330, {size: 28, color: '#FFC46B', a: yA, border: '#FFC46B'});
  }
  if (gA > 0) withAlpha(c, gA, () => horizonGeometry(stage, t, ctx, ef));
  blackFade(stage, Math.max(1 - fadeIn(t, sc.start + 0.02, 0.6), 1 - ef));
}
/** cross-section: Earth curvature exaggerated so that the drawn horizon still cuts the curtain at the true hMin(d) */
const lgA0 = (t, at) => fadeIn(t, at(A.beyond) - 0.2, 0.5);
function horizonGeometry(stage, t, ctx, ef) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
  nightBg(stage, t, {stars: 0.8});
  const s = 1.2, Rd = 760, hm = hMin(STORM_D), th = Math.acos(1 / (1 + s * hm / Rd)), C = [540, 1010 + Rd];
  const P = (ang, h) => [C[0] + (Rd + h * s) * Math.sin(ang), C[1] - (Rd + h * s) * Math.cos(ang)];
  const a0 = -th / 2, a1 = th / 2;
  // Earth
  const g = c.createRadialGradient(C[0], C[1], Rd * 0.6, C[0], C[1], Rd); g.addColorStop(0, '#05121A'); g.addColorStop(1, '#0E2A36'); circle(c, C[0], C[1], Rd, g);
  ring(c, C[0], C[1], Rd + 4, rgba('#6FB6D6', 0.35), 6); ring(c, C[0], C[1], Rd, rgba('#8FD0EA', 0.7), 2);
  // the curtain at the aurora location: visible part (above the horizon line) and the hidden part (dim)
  const b = gbuf('geo', 0, 300, 1080, 1000, 0.5);
  for (let k = -110; k <= 110; k++) {
    const ang = a1 + k * 0.0007, ray = 0.35 + 0.65 * fbm1(k / 6 - t * 0.5, 31, 3) ** 1.6, env = smooth((110 - Math.abs(k)) / 45), hb = 98, ht = 420 + 40 * fbm1(k / 9 + t * 0.1, 7, 2);
    const A0 = P(ang, hb), Am = P(ang, hm), A1 = P(ang, ht);
    b.ray(A0[0], A0[1], Am[0], Am[1], hb, hm, 0.75 * ray * env * 0.17);
    b.ray(Am[0], Am[1], A1[0], A1[1], hm, ht, 0.75 * ray * env);
  }
  b.draw(stage, {gain: 1.2, bloom: 1});
  // horizon (tangent at the observer) and the line of sight
  const O = P(a0, 0), tdir = [Math.cos(a0), Math.sin(a0)], H1 = [O[0] + tdir[0] * 760, O[1] + tdir[1] * 760];
  const hA = fadeIn(t, at(A.horizon) - 0.15, 0.5), vA = fadeIn(t, at(A.redOnly) - 0.25, 0.5);
  withAlpha(c, hA, () => { line(c, [O, H1], rgba('#FFE2C4', 0.85), 2.5, {dash: [9, 7]}); const q = [O[0] + tdir[0] * 300, O[1] + tdir[1] * 300]; tag(stage, '지평선', q[0], q[1] + 34, {size: 24, color: '#FFE2C4', plateA: 0.6}); });
  // the hidden part, outlined
  withAlpha(c, lgA0(t, at) * 0.8, () => { const L0 = [P(a1 - 0.075, 98), P(a1 + 0.075, 98), P(a1 + 0.075, hm), P(a1 - 0.075, hm)]; c.save(); c.setLineDash([5, 6]); poly(c, L0, null, rgba(HEX.green, 0.55), 1.5); c.restore(); });
  const Vt = P(a1, (hm + 380) / 2);
  withAlpha(c, vA, () => { arrow(c, [O[0] + 14, O[1] - 8], [Vt[0] - 26, Vt[1] + 6], rgba(HEX.red, 0.95), 3, {head: 14}); });
  // observer
  withAlpha(c, 1, () => { const [x, y] = O; line(c, [[x, y], [x - 9, y - 26]], '#CFE2FF', 2); line(c, [[x, y], [x + 9, y - 26]], '#CFE2FF', 2); rect(c, x - 10, y - 38, 20, 14, 3, '#CFE2FF'); });
  tag(stage, `한국 · 자기 위도 약 ${Math.round(KOREA_MLAT)}°`, O[0] + 6, O[1] + 46, {size: 24, color: '#CFE2FF'});
  // labels on the curtain
  const Pg = P(a1, 150), Pr = P(a1, 330);
  const lgA = fadeIn(t, at(A.beyond) - 0.2, 0.5);
  // legend under the main tag, with leaders to the two parts of the curtain
  const lr = '빨강 · 200 km 위 → 지평선 위, 보임', lg = '초록 · 100~200 km → 지평선 아래, 안 보임';
  if (vA > 0) { const w = tag(stage, lr, 540, 412, {size: 26, color: HEX.red, a: vA, plateA: 0.7}); withAlpha(c, vA, () => line(c, [[540 + w / 2 + 10, 412], [Pr[0] - 40, Pr[1] - 10]], rgba(HEX.red, 0.7), 1.5)); }
  if (lgA > 0) { const w = tag(stage, lg, 540, 466, {size: 26, color: HEX.green, a: lgA, plateA: 0.7}); withAlpha(c, lgA, () => line(c, [[540 + w / 2 + 10, 466], [Pg[0] - 46, Pg[1]]], rgba(HEX.green, 0.7), 1.5, {dash: [5, 5]})); }
  tag(stage, '지평선 너머 높은 곳의 붉은빛만 보임', 540, 340, {size: 30, color: HEX.red, a: vA * ef, border: HEX.red});
  tag(stage, '모식도 · 지구 곡률 과장', 540, 1180, {size: 24, color: T.muted, a: 0.9, plateA: 0.5});
  const nA = 0.9; withAlpha(c, nA, () => { const q0 = P(-0.08, -45), q1 = P(0.1, -45); arrow(c, [q0[0], q0[1]], [q1[0], q1[1]], rgba(T.muted, 0.8), 2, {head: 10}); stage.text('북쪽', (q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2 + 30, {size: 24, color: T.muted, align: 'center'}); });
}

// ---- myth: reflected sunlight? No — the air itself glows ----
function mythScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('myth'), ef = endFade(t, ctx), a0 = fadeIn(t, sc.start + 0.05, 0.5) * ef;
  const noA = fadeIn(t, at(A.was) - 0.1, 0.5) * ef, yesA = fadeIn(t, at(A.air16) - 0.2, 0.5) * ef;
  nightBg(stage, t, {stars: 0.6});
  withAlpha(c, a0, () => {
    rect(c, 140, 292, 800, 150, 12, rgba(T.plate, 0.92), noA > 0.5 ? rgba(T.accent, 0.8) : rgba(T.border, 1), 2);
    stage.text('햇빛이 반사된 빛?', 540, 340, {role: 'display', size: 40, weight: 700, color: mix(T.ink, T.muted, noA), align: 'center'});
    const w = stage.measure('햇빛이 반사된 빛?', {role: 'display', size: 40, weight: 700}); crossOut(c, 540 - w / 2, 540 + w / 2, 340, noA);
    stage.text('아니다 · 공기 자체가 내는 빛', 540, 404, {role: 'display', size: 36, weight: 700, color: HEX.green, align: 'center', alpha: yesA});
    // left: the wrong picture
    rect(c, 150, 480, 370, 470, 12, rgba('#06161F', 0.9), rgba(T.border, 1), 1.5);
    glow(c, 200, 540, 90, '#FFD58A', 0.5); circle(c, 200, 540, 22, '#FFE7B8');
    for (let i = 0; i < 4; i++) { const y0 = 560 + i * 18; line(c, [[220, y0], [380, 700 + i * 6]], rgba('#FFD58A', 0.55), 2); line(c, [[380, 700 + i * 6], [440, 860 + i * 10]], rgba('#FFD58A', 0.4), 2, {dash: [6, 6]}); }
    for (let i = 0; i < 9; i++) { const x = 300 + i * 22, y = 700 + 8 * Math.sin(i); poly(c, [[x, y - 7], [x + 6, y - 3], [x + 6, y + 4], [x, y + 8], [x - 6, y + 4], [x - 6, y - 3]], rgba('#CFE2FF', 0.5)); }
    line(c, [[160, 900], [510, 900]], rgba('#5FA8C8', 0.5), 2);
    stage.text('햇빛 반사?', 335, 1000, {size: 30, weight: 700, color: mix(T.ink, T.muted, noA), align: 'center'});
    const w2 = stage.measure('햇빛 반사?', {size: 30, weight: 700}); crossOut(c, 335 - w2 / 2, 335 + w2 / 2, 1000, noA);
    if (noA > 0) withAlpha(c, noA * 0.8, () => { line(c, [[175, 505], [495, 925]], rgba('#FF8A5C', 0.75), 4); line(c, [[495, 505], [175, 925]], rgba('#FF8A5C', 0.75), 4); });
    // right: the air glows by itself (no sunlight needed)
    withAlpha(c, 0.35 + 0.65 * yesA, () => {
      rect(c, 560, 480, 370, 470, 12, rgba('#06161F', 0.9), rgba(yesA > 0.5 ? HEX.green : T.border, 0.9), 1.5);
      line(c, [[745, 500], [745, 640]], rgba(HEX.mag, 0.4), 2);
      const q = ((t - sc.start) / 1.8) % 1, yy = lerp(500, 660, q); glow(c, 745 + 12 * Math.cos(yy / 30 * TAU), yy, 10, HEX.e, 0.8); circle(c, 745 + 12 * Math.cos(yy / 30 * TAU), yy, 3, '#FFFFFF');
      atomGlyph(c, 745, 730, 'O', 0.3 + 0.3 * Math.sin(t * 3), t, HEX.green);
      for (const [k, ang] of [[0, -0.5], [1, 3.6]]) { const d = (t * 120 + k * 50) % 100; photon(c, 745, 730, ang, 60 + d, HEX.green, 0.9 * Math.sin(Math.PI * d / 100)); }
      stage.text('산소·질소가', 745, 880, {size: 28, weight: 700, color: HEX.green, align: 'center'});
      stage.text('스스로 내는 빛', 745, 918, {size: 28, weight: 700, color: HEX.green, align: 'center'});
      stage.text('공기 자체의 빛', 745, 1000, {size: 30, weight: 700, color: HEX.green, align: 'center'});
    });
  });
  // evidence: the oval shines on the night side, where no sunlight falls
  const eA = fadeIn(t, at(A.itself) - 0.1, 0.6) * ef;
  if (eA > 0) withAlpha(c, eA, () => {
    const cam = orbitCam({A: -62 + 6 * (t - sc.start) / 8, E: 30, D: 3.6, R: 118, cx: 540, cy: 1160});
    earth(stage, cam, GEO.myth, {cloud: t * 0.3});
    auroraShell(stage, cam, {S: 0, I: 1.2, t, scale: 0.5, hemis: [1]});
    tag(stage, '해가 비치지 않는 밤 쪽에서도 빛난다', 540, 1314, {size: 24, color: T.ink, plateA: 0.7});
  });
}

// ---- close: the summary and the globe with both ovals ----
function closeScene(stage, t, ctx) {
  const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r), sc = ctx.tl.scene('close'), m = M(ctx), q = rampEase((t - sc.start) / (sc.end - sc.start), 0.3);
  const cam = orbitCam({A: lerp(48, 70, q), E: lerp(16, 22, q), D: 3.7, R: 250, cx: 540, cy: 880}), a0 = fadeIn(t, sc.start + 0.05, 0.7);
  const q1 = fadeIn(t, at(A.q1) - 0.15, 0.5), q2 = fadeIn(t, at(A.q2) - 0.15, 0.5), q3 = fadeIn(t, at(A.q3) - 0.15, 0.5), q4 = fadeIn(t, at(A.picture) - 0.2, 0.6);
  spaceBg(stage, cam, t, a0);
  withAlpha(c, a0, () => {
    earth(stage, cam, GEO.close, {cloud: t * 0.3});
    layer(stage, L => {
      solarWind(L, cam, t, 1.3 * q1, {a: 0.8});
      drawShells(L, cam, 0.2 + 0.4 * q2, 1);
    }, {comp: 'lighter'});
    auroraShell(stage, cam, {S: 0, I: 0.5 + 0.9 * q3, t, scale: 0.45});
  });
  withAlpha(c, fadeIn(t, sc.start + 0.2, 0.6), () => {
    stage.text('정리', 540, 300, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3});
    const parts = [['태양풍이 오고, ', HEX.sw, q1], ['자기장이 길을 열고,', HEX.mag, q2]], sz = 40;
    const ws = parts.map(([s]) => stage.measure(s, {role: 'display', size: sz, weight: 700})), tot = ws.reduce((x, y) => x + y, 0);
    let x = 540 - tot / 2; parts.forEach(([s, col, al], i) => { stage.text(s, x, 364, {role: 'display', size: sz, weight: 700, color: col, alpha: 0.2 + 0.8 * al}); x += ws[i]; });
    stage.text('공기가 빛난다', 540, 430, {role: 'display', size: 46, weight: 700, color: HEX.green, align: 'center', alpha: 0.2 + 0.8 * q3});
    line(c, [[480, 478], [600, 478]], T.accent, 4, {cap: 'butt'});
  });
  if (q4 > 0) tag(stage, '오로라 = 지구 자기장의 모양을 하늘에 그린 그림', 540, 1290, {size: 28, color: T.ink, a: q4, border: HEX.green});
}

export const scenes = {
  // ------------------------------------------------------------------ hook: polar sky with curtains → Korea, a faint red glow in the north
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, at = r => ctx.tl.at(r);
    checkSoundTable(ctx);
    const kA = smooth((t - at(A.but2) + 0.25) / 1.3), ef = endFade(t, ctx, 0.6);
    if (kA < 1) hookPolar(stage, t, 1);
    if (kA > 0) withAlpha(c, kA, () => koreaNight(stage, t, 0.55 + 0.45 * fadeIn(t, at(A.red2) - 0.3, 1.2), ctx));
    // labels (Korea)
    const lA = fadeIn(t, at(A.y2024) - 0.1, 0.5) * ef, rA = fadeIn(t, at(A.red2) - 0.1, 0.5) * ef;
    if (lA > 0) tag(stage, '2024년 5월 · 강원 화천', 540, 372, {size: 30, color: T.ink, a: lA, plateA: 0.6});
    if (rA > 0) { tag(stage, '북쪽 지평선 위의 붉은빛', 540, 600, {size: 26, color: HEX.red, a: rA, plateA: 0.5}); withAlpha(c, rA * 0.8, () => line(c, [[540, 622], [540, 690]], rgba(HEX.red, 0.7), 2, {dash: [4, 6]})); }
    if (kA > 0) withAlpha(c, kA * ef, () => tag(stage, '북 ↑', 540, 1004, {size: 24, color: T.muted, plateA: 0.4}));
    blackFade(stage, 1 - ef);                                            // no fade-in: frame 0 is the thumbnail
  },
  // ------------------------------------------------------------------ origin: the names; Birkeland's terrella
  origin(stage, t, p, ctx) {
    const at = r => ctx.tl.at(r), sc = ctx.tl.scene('origin'), ef = endFade(t, ctx);
    nightBg(stage, t, {stars: 0.8});
    const aA = fadeIn(t, sc.start + 0.05, 0.6) * fadeOut(t, at('s03:end') + 0.3, 0.45), bA = fadeIn(t, at('s03:end') + 0.8, 0.6) * ef;
    if (aA > 0) nameCards(stage, t, ctx, aA);
    if (bA > 0) terrella(stage, t, ctx, bA);
  },
  essence(stage, t, p, ctx) { essence(stage, t, ctx); },
  wind(stage, t, p, ctx) { windScene(stage, t, ctx); },
  lines(stage, t, p, ctx) { linesScene(stage, t, ctx); },
  oval(stage, t, p, ctx) { ovalScene(stage, t, ctx); },
  color(stage, t, p, ctx) { colorScene(stage, t, ctx); },
  storm(stage, t, p, ctx) { stormScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ---- first frame = thumbnail (2026-11-03 rule, retrofitted 2026-11-05): the big two-line title in the central square
//      shrinks into the hook header between MORPH[0] and MORPH[1]; no progress bar, captions or small labels before that.
const MORPH = [0.9, 1.7], TITLE_Y = [1088, 1214];
function posterTitle(stage, t, main, sub, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const big = Math.min(168, 168 * 800 / stage.measure(main, {role: 'display', weight: 700, size: 168}));
  const y1 = lerp(TITLE_Y[0], 228, q), s1 = lerp(big, 54, q), y2 = lerp(TITLE_Y[1], 290, q), s2 = lerp(64, 30, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g = c.createLinearGradient(0, 960, 0, 1320); g.addColorStop(0, 'rgba(0,6,12,0)'); g.addColorStop(0.32, 'rgba(0,6,12,0.66)'); g.addColorStop(0.8, 'rgba(0,6,12,0.66)'); g.addColorStop(1, 'rgba(0,6,12,0)');
    c.fillStyle = g; c.fillRect(0, 960, 1080, 360);
  });
  withAlpha(c, a, () => {
    stage.text(main, 540, y1, {role: 'display', weight: 700, size: s1, color: T.ink, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 20});
    stage.text(sub, 540, y2, {role: 'display', weight: 500, size: s2, color: T.light, align: 'center', shadow: q < 0.5 ? 'rgba(0,0,0,0.85)' : null, shadowBlur: 14});
  });
}
function hookOverlay(stage, t, ctx, kicker, main, sub) {
  if (t < MORPH[1]) { posterTitle(stage, t, main, sub); return; }
  const c = stage.ctx, ho = fadeOut(t, ctx.scene.end - 0.3, 0.28), kA = fadeIn(t, MORPH[1] - 0.05, 0.4) * ho;
  head(stage, kicker, main, kA, ho);
  withAlpha(c, ho, () => stage.text(sub, 540, 290, {role: 'display', weight: 500, size: 30, color: stage.theme.light, align: 'center'}));
  withAlpha(c, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration));
}
/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  if (ctx.scene.id === 'hook') { hookOverlay(stage, t, ctx, '오늘의 주제', '오로라', '왜 극지방에서만 보일까'); return; }
  const L = titleList(ctx.scene.id, ctx.tl), a = smooth(ctx.scene.p / 0.04);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  // sequential swap (old line fades out, then the new one fades in) so two titles never overlap
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json (same model, same anchors as the picture)
// Colour → pitch mapping (stated, not a real sound): the light frequency of each emission line lowered 40 octaves,
//   O 557.7 nm → 489 Hz, O 630.0 nm → 433 Hz, N₂⁺ 427.8 nm → 637 Hz, Ne 640.2 nm → 426 Hz.
// =====================================================================================================
export function soundEvents(tl) {
  const m = model(tl), r = (x, dd = 3) => +x.toFixed(dd), at = ref => tl.at(ref), ev = [], sc = id => tl.scene(id);
  const HZ = {g: r(toneHz(LINE_NM.green), 1), red: r(toneHz(LINE_NM.red), 1), b: r(toneHz(LINE_NM.blue), 1), ne: r(toneHz(640.2), 1)};
  const squeeze = P => P.filter((q, i) => i === 0 || i === P.length - 1 || q.slice(1).some((v, k) => v !== P[i - 1][k + 1] || v !== P[i + 1][k + 1]));
  const soft = (freq, dur, gain, extra = {}) => ({freq, dur, harmonics: [1, 0.25, 0.08], attack: 0.18, decay: dur * 0.5, sustain: 0.35, release: Math.min(0.8, dur * 0.4), gain_db: gain, ...extra});
  const tone = (id, ref, key, dur, gain, means) => ev.push({id, at: ref, kind: 'tone', params: soft(HZ[key], dur, gain), means});
  // hook
  ev.push({id: 'hook_curtain', at: 0.25, kind: 'custom', params: {gain_db: -32, layers: [{kind: 'tone', offset: 0, params: soft(HZ.g, 3.2, 0)}, {kind: 'tone', offset: 0.5, params: soft(HZ.red, 2.8, -4)}]},
    means: `극지방 커튼의 두 빛 → 초록 ${HZ.g} Hz · 빨강 ${HZ.red} Hz (빛의 진동수를 40옥타브 낮춘 대응, 실제 소리 아님)`});
  tone('korea_red', {...A.red2, offset: -0.1}, 'red', 2.6, -30, `화천 하늘의 붉은빛 — 빨강(630.0 nm) 음만, 초록 음 없음`);
  // origin
  for (const [id, ref, nm] of [['card_aurora', {...A.roma, offset: -0.25}, 'Aurora'], ['card_boreas', {...A.boreasW, offset: -0.3}, 'Boreas'], ['card_geuk', {...A.korean, offset: -0.25}, '極光']])
    ev.push({id, at: ref, kind: 'tick', params: {freq: 990, decay: 0.06, click: 0.15, gain_db: -31}, means: `이름 카드 "${nm}"가 놓임`});
  const b0 = at(A.shoot) + 0.05, b1 = sc('origin').end - 0.1;
  ev.push({id: 'ter_beam', at: r(b0, 4), kind: 'env_noise', params: {gain_db: -33, low: 2200, high: 6500, fade: 0.1, points: [[0, 0], [0.5, 0.55], [r(b1 - b0 - 0.6), 0.55], [r(b1 - b0), 0]]},
    means: '테렐라의 전자 빔이 켜져 있는 동안의 쉿 소리 (빔 = 잡음, 상징)'});
  ev.push({id: 'ter_rings', at: {...A.twoPoles, offset: -0.1}, kind: 'swell', params: {freqs: [330, 495], dur: 1.8, gain_db: -31}, means: '테렐라 두 극 둘레의 빛 고리가 켜짐'});
  // essence: every electron that reaches the air after "부딪혀" → a green note (same release schedule as the picture)
  const hits = essElectrons(tl).filter(e => e.ti >= at(A.hit5) - 0.6 && e.ti < sc('essence').end - 0.3), h0 = hits[0].ti;
  ev.push({id: 'ess_hits', at: r(h0, 4), kind: 'custom', params: {gain_db: -32, layers: hits.map(e => ({kind: 'tone', offset: r(e.ti - h0, 4), params: {freq: HZ.g, dur: 0.7, harmonics: [1, 0.2], attack: 0.01, decay: 0.25, sustain: 0, release: 0.3}}))},
    model: {n: hits.length}, means: `전자가 공기에 부딪혀 빛날 때마다 초록 음 ${HZ.g} Hz — ${hits.length}번 (화면의 번쩍임과 같은 시각)`});
  // solar-wind flux (wind → lines → storm): one noise whose level is the modelled flux (the picture lights the same number of particles)
  const f0 = sc('wind').start - 0.05, f1 = sc('storm').end;
  const FP = []; for (let tt = f0; tt <= f1 + 1e-6; tt += 0.1) FP.push([r(tt - f0), r(clamp(m.flux(tt) / 2.2) * 0.9, 3)]); FP[FP.length - 1][1] = 0;
  ev.push({id: 'wind_flux', at: r(f0, 4), kind: 'env_noise', params: {gain_db: -29, low: 260, high: 1400, fade: 0.2, points: squeeze(FP)},
    model: {fk: m.keys.FK.length, t_last: r(m.keys.FK[m.keys.FK.length - 1][0], 4), storm_peak: r(m.keys.SK[2][0], 4), map: 'flux(t)/2.2 → amplitude'},
    means: '태양풍 입자 흐름의 세기(화면의 입자 수·계기 막대와 같은 값) → 잡음 크기. 폭풍 때 커짐'});
  ev.push({id: 'shield', at: A.shield, kind: 'whoosh', params: {dur: 1.0, f_start: 900, f_end: 280, q: 1.4, gain_db: -32}, means: '방패 — 바람이 자기권을 비껴 감'});
  // lines: gyration in the lens (one swell per turn), the doors, the tail snap, acceleration → pitch, the pour
  const g0 = at('s08') + 0.1, g1 = at('s09') - 0.6, GP = [];
  for (let tt = g0; tt <= g1 + 1e-6; tt += 0.04) { const s = ((tt - at('s08')) * 75) % 280 + 40, th = s / 62 * TAU; GP.push([r(tt - g0), 330, r((0.25 + 0.45 * (0.5 + 0.5 * Math.sin(th))) * smooth((tt - g0) / 0.4) * smooth((g1 - tt) / 0.4), 3)]); }
  ev.push({id: 'gyro', at: r(g0, 4), kind: 'chirp', params: {gain_db: -32, harmonics: [1, 0.3], fade: 0.05, points: GP}, means: '렌즈 속 전자가 자기력선을 한 바퀴 돌 때마다 소리가 한 번 부풂 (앞쪽을 지날 때 큼, 회전 속도는 화면용)'});
  ev.push({id: 'door', at: A.door, kind: 'tick', params: {freq: 660, decay: 0.08, click: 0.2, repeat: 2, interval: 0.18, gain_db: -30}, means: '두 극지방의 "문"이 켜짐'});
  ev.push({id: 'tail_snap', at: {...A.shake, offset: -0.3}, kind: 'whoosh', params: {dur: 1.4, f_start: 260, f_end: 1300, q: 1.6, gain_db: -32}, means: '꼬리가 더 늘어났다가 되돌아감'});
  const a0 = at(A.faster) - 0.3, a1 = at(A.pour) + 1.4, AP = [];
  for (let tt = a0; tt <= a1 + 1e-6; tt += 0.05) AP.push([r(tt - a0), r(196 * Math.sqrt(m.accel(tt)), 1), r(0.6 * smooth((tt - a0) / 0.3) * smooth((a1 - tt) / 0.5), 3)]);
  ev.push({id: 'accel', at: r(a0, 4), kind: 'chirp', params: {gain_db: -31, harmonics: [1, 0.3, 0.1], fade: 0.05, points: squeeze(AP)}, means: '입자 속도(계기 막대와 같은 값) → 음높이: 196 Hz × √(속도 배수)'});
  ev.push({id: 'pour', at: A.pour, kind: 'custom', params: {gain_db: -32, layers: [{kind: 'tone', offset: 0, params: soft(HZ.g, 2.0, 0)}, {kind: 'tone', offset: 0.25, params: soft(HZ.red, 1.8, -5)}]}, means: '입자가 쏟아져 두 극의 오로라 고리가 켜짐 — 초록·빨강 음'});
  // oval
  tone('oval_ring', {...A.around11, offset: -0.1}, 'g', 1.8, -30, '자기극을 둘러싼 둥근 띠가 밝아짐 (초록 음)');
  ev.push({id: 'oval_lat', at: A.magLat11, kind: 'tick', params: {freq: 880, decay: 0.06, click: 0.15, gain_db: -31}, means: '자기 위도 65~70° 표시'});
  // color: collisions, the emitted lines, the neon, the column bands
  ev.push({id: 'hit_o', at: {...A.hit12, offset: 0.35}, kind: 'tick', params: {freq: 1760, decay: 0.03, click: 0.3, gain_db: -32}, means: '전자가 산소 원자에 부딪힘'});
  ev.push({id: 'hit_n', at: {...A.nit, offset: 0.5}, kind: 'tick', params: {freq: 1760, decay: 0.03, click: 0.3, gain_db: -32}, means: '전자가 질소에 부딪힘'});
  tone('emit_o', {...A.fixed, offset: -0.05}, 'g', 1.3, -29, '산소가 557.7 nm를 냄 → 초록 음');
  tone('emit_n', {...A.emitW, offset: -0.2}, 'b', 1.3, -29, '질소 이온이 427.8 nm를 냄 → 파랑 음');
  tone('neon', {...A.neon, offset: -0.2}, 'ne', 1.5, -31, '네온의 주된 선 640.2 nm → 같은 대응의 음');
  tone('band_g', {...A.km100, offset: -0.2}, 'g', 1.8, -29, '100~200 km 산소 초록 띠가 켜짐');
  tone('band_r', {...A.higher, offset: -0.1}, 'red', 1.8, -29, '200 km 위 산소 빨강 띠가 켜짐');
  tone('band_b', {...A.nit13, offset: -0.1}, 'b', 1.6, -30, '아래 가장자리 질소 파랑·보라가 켜짐');
  // storm: the blast, G1 → G5 as the meter fills (same storm(t)), red only from Korea
  ev.push({id: 'blast', at: {...A.big, offset: -0.1}, kind: 'noise', params: {dur: 1.2, low: 180, high: 900, attack: 0.08, release: 0.8, gain_db: -29}, means: '태양 폭발 (상징)'});
  const gT = []; let gPrev = 0; for (let tt = at(A.big) - 0.2; tt <= sc('storm').end; tt += 0.01) { const g = gLevel(m.storm(tt)); if (g > gPrev) { gT.push([tt, g]); gPrev = g; } }
  ev.push({id: 'g_steps', at: r(gT[0][0], 4), kind: 'custom', params: {gain_db: -30, layers: gT.map(([tt, g]) => ({kind: 'tick', offset: r(tt - gT[0][0], 4), params: {freq: [0, 660, 740, 830, 880, 990][g], decay: 0.06, click: 0.15}}))},
    model: {steps: gT.length}, means: '폭풍 단계 칸이 켜질 때마다(G1 → G5) 한 번씩, 점점 높게'});
  tone('red_only', {...A.redOnly, offset: -0.25}, 'red', 2.2, -29, '지평선 위로 보이는 빨강(630.0 nm) — 빨강 음만 (훅의 화천 장면과 같은 음)');
  // myth / close
  ev.push({id: 'myth_no', at: A.was, kind: 'tick', params: {freq: 520, decay: 0.1, gain_db: -28, repeat: 2, interval: 0.12}, means: '오해에 줄을 그음 → "아니다"'});
  tone('myth_air', {...A.air16, offset: -0.2}, 'g', 1.6, -30, '공기 자체의 빛 (초록 음)');
  ev.push({id: 'close_wind', at: {...A.q1, offset: -0.1}, kind: 'whoosh', params: {dur: 0.9, f_start: 400, f_end: 1200, q: 1.4, gain_db: -33}, means: '정리 ① 태양풍이 온다'});
  ev.push({id: 'close_field', at: {...A.q2, offset: -0.1}, kind: 'swell', params: {freqs: [196, 294], dur: 1.4, gain_db: -32}, means: '정리 ② 자기장이 길을 연다'});
  ev.push({id: 'close_light', at: {...A.q3, offset: -0.1}, kind: 'custom', params: {gain_db: -32, layers: [{kind: 'tone', offset: 0, params: soft(HZ.red, 2.4, -3)}, {kind: 'tone', offset: 0.08, params: soft(HZ.g, 2.3, 0)}, {kind: 'tone', offset: 0.16, params: soft(HZ.b, 2.2, -5)}]},
    means: '정리 ③ 공기가 빛난다 — 세 빛의 음(빨강·초록·파랑)을 함께'});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/aurora/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형(태양풍 세기 flux(t), 폭풍 세기 S(t), 꼬리 입자 속도, 방출선 파장)에서 써 넣습니다. 색 → 음 대응: 방출선 빛의 진동수를 40옥타브 낮춘 값(초록 557.7 nm = 489 Hz, 빨강 630.0 nm = 433 Hz, 파랑 427.8 nm = 637 Hz). 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const m = model(tl);
  console.log(`events: ${sound.events.length}; flux keys ${m.keys.FK.length}; storm peak at ${m.keys.SK[2][0].toFixed(2)} s`);
  console.log(`Korea (Hwacheon) magnetic latitude ${magLat(HWACHEON.lat, HWACHEON.lon).toFixed(1)}°; hMin(${STORM_D} km) = ${hMin(STORM_D).toFixed(0)} km; L(65°) = ${Lof(65).toFixed(2)}, L(70°) = ${Lof(70).toFixed(2)}`);
  console.log(`tones: green ${toneHz(LINE_NM.green).toFixed(1)} Hz, red ${toneHz(LINE_NM.red).toFixed(1)} Hz, blue ${toneHz(LINE_NM.blue).toFixed(1)} Hz; storm oval night edge ${ovalBand(180, 1).map(v => v.toFixed(0)).join('–')}°`);
}
