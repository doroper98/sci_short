// Episode scenes — "파장 — 전파에서 감마선까지, 다른 것은 길이 하나"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen):
//  - ONE state variable: the wavelength λ(t) (nm), a keyframed schedule tied to the narration (lamKeys). Between keys
//    log10 λ is eased (easeInOut). Everything else is derived from it:
//      f = c/λ (c = 299,792,458 m/s), E = hc/λ (hc = 1239.84 eV·nm), Wien peak temperature T = 2.898e6 nm·K / λ,
//      band (전파 > 1 m, 마이크로파 1 mm–1 m, 적외선 700 nm–1 mm, 가시광선 400–700 nm, 자외선 10–400 nm
//      (UVA 315–400 / UVB 280–315 / UVC 100–280), X선 0.01–10 nm, 감마선 < 0.01 nm),
//      "무엇과 맞는가" tag by E (< 1.6 eV 분자 진동·회전, 1.6–3.3 눈의 색소, 3.3–10 결합 끊김, > 10 이온화),
//      sound pitch 110 Hz · 2^(0.8·(6 − log10 λ_nm))  (1 mm → 110 Hz, 10 nm → 1760 Hz).
//  - Picture wavelength on screen is log-compressed: Λ_px = 40 · (λ/10 nm)^0.2 (1 mm → 400 px, 550 nm → 89 px);
//    the wave moves at a fixed 360 px/s, so the on-screen crest rate (ticks) = 360/Λ_px — a picture of "shorter = more
//    often", not the real rate (the real f is the readout).
//  - Visible colours: Bruton's wavelength → sRGB approximation (gamma 0.8, dimmed below 420 and above 700 nm).
//    Every band outside 400–700 nm (380–780 in the zoom) is drawn hatched grey, never coloured.
//  - Water absorption (infrared scene) is a smooth step in log λ from 0.75 to 3 μm (schematic: liquid water absorbs
//    weakly in the near IR and strongly beyond ~3 μm). CO₂ absorption: Gaussian bands in log λ at 15 μm and 4.26 μm.
//  - Body peak: T = 309 K (36 °C) → λ = 9.38 μm ("9.4 μm"). Thermal cameras 8–14 μm. Remote control LED 940 nm.
//  - Cone sensitivities (visible): schematic Gaussians, peaks S 420 / M 530 / L 560 nm (not CIE data).
//  - Scattering: Rayleigh τ(λ) = 0.0088 · λ_μm⁻⁴ (sea-level vertical optical depth, ≈ 0.215 at 450 nm, 0.037 at 700 nm),
//    direct-beam transmission exp(−τ·m), air mass m from Kasten & Young (1989). Ratio (700/450)⁴ = 5.85.
//  - Atmosphere/UV: UVC absorbed by O₂/O₃ high up, UVB mostly by stratospheric ozone, UVA mostly passes (qualitative).
//  - DNA: "one rung breaks" is a representative event; real UVB damage is mostly thymine-dimer formation.
//  - Animals: bee ~300–650 nm, human ~400–700 nm, pit viper pit organ ~5–30 μm (peak ~10 μm). The thermal view of the
//    mouse is a white-hot greyscale visualisation, the bee view a greyscale "UV photograph" look.
//
// Sound tables in sound.json (pitch = log λ(t), crest ticks, IR hum = vibration, UV snap, scatter tick densities,
// animal band tones, closing glide) are generated from this file:
//   node episodes/wavelength/scenes.mjs --emit-sound [--timeline outputs/wavelength/narration/timeline.json]
// Re-run it whenever the narration timeline changes (the scenes warn once if the tables are stale).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, endCard,
  rgba, mix, clamp, lerp, smooth, easeInOut, poly, line, circle, ring, glow, arrow, curve,
  withAlpha, clipRect, rect, rand, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const C_LIGHT = 299792458, HC_EVNM = 1239.84, WIEN_NMK = 2.898e6;
export const fHz = nm => C_LIGHT / (nm * 1e-9);
export const eV = nm => HC_EVNM / nm;
export const wienK = nm => WIEN_NMK / nm;
export const lg = nm => Math.log10(nm);
export const pitchHz = nm => 110 * 2 ** (0.8 * (6 - lg(nm)));
export const screenLam = nm => clamp(40 * (nm / 10) ** 0.2, 16, 640);
export const WAVE_V = 360;
export const NM_BODY = WIEN_NMK / 309, NM_REMOTE = 940, NM_CO2 = 15000;
export const BANDS = [
  {id: 'radio', name: '전파', lo: 1e9, hi: 1e13},
  {id: 'micro', name: '마이크로파', lo: 1e6, hi: 1e9},
  {id: 'ir', name: '적외선', lo: 700, hi: 1e6},
  {id: 'vis', name: '가시광선', lo: 400, hi: 700},
  {id: 'uv', name: '자외선', lo: 10, hi: 400},
  {id: 'xray', name: 'X선', lo: 0.01, hi: 10},
  {id: 'gamma', name: '감마선', lo: 1e-4, hi: 0.01},
];
export const UV_SUB = [{id: 'uva', name: 'UVA', lo: 315, hi: 400}, {id: 'uvb', name: 'UVB', lo: 280, hi: 315}, {id: 'uvc', name: 'UVC', lo: 100, hi: 280}];
export const bandOf = nm => { const n = Number(nm.toPrecision(6)); if (n >= 400 && n <= 700) return BANDS[3]; return BANDS.find(b => n >= b.lo && n < b.hi) || (n >= 1e13 ? BANDS[0] : BANDS[6]); };
export const uvSubOf = nm => UV_SUB.find(b => nm >= b.lo && nm < b.hi) || null;
export function colourName(nm) {
  return nm >= 620 ? '빨강' : nm >= 590 ? '주황' : nm >= 570 ? '노랑' : nm >= 495 ? '초록' : nm >= 450 ? '파랑' : '보라';
}
export const TAGS = [
  {max: 1.6, l1: '분자 진동·회전', l2: '→ 열', col: '#D9C7A8'},
  {max: 3.3, l1: '눈의 색소 전자 들뜸', l2: '→ 보임', col: '#B8E0C8'},
  {max: 10, l1: '분자 결합 끊김', l2: '→ 손상', col: '#FFB38A'},
  {max: Infinity, l1: '원자 이온화', l2: '→ 전자를 떼어 냄', col: '#FF8F70'},
];
export const tagOf = E => TAGS.find(g => E < g.max);
export const SIZES = [
  {name: '머리카락', nm: 70000, txt: '70 μm'}, {name: '적혈구', nm: 7000, txt: '7 μm'}, {name: '박테리아', nm: 2000, txt: '2 μm'},
  {name: '바이러스', nm: 100, txt: '100 nm'}, {name: '분자', nm: 1, txt: '1 nm'},
];
/** water absorption (schematic smooth step in log λ, 0.75 → 3 μm) */
export const waterAbs = nm => smooth((lg(nm) - lg(750)) / (lg(3000) - lg(750)));
export const co2Abs = nm => Math.max(...[15000, 4260].map(b => Math.exp(-((lg(nm / b) / 0.035) ** 2))));
/** cone sensitivities, schematic */
export const CONES = [{id: 'S', peak: 420, sl: 28, sr: 34}, {id: 'M', peak: 530, sl: 48, sr: 42}, {id: 'L', peak: 560, sl: 55, sr: 50}];
export const coneResp = (c, nm) => Math.exp(-0.5 * ((nm - c.peak) / (nm < c.peak ? c.sl : c.sr)) ** 2);
export const photopic = nm => Math.exp(-0.5 * ((nm - 555) / (nm < 555 ? 45 : 52)) ** 2);
/** Rayleigh */
export const tauR = nm => 0.0088 * (nm / 1000) ** -4;
export const airMass = elevDeg => { const z = 90 - elevDeg; return 1 / (Math.cos(z * Math.PI / 180) + 0.50572 * (96.07995 - z) ** -1.6364); };
export const RATIO_BR = (700 / 450) ** 4;

// ---- time anchors (words are from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  answer: W('s02', '오릅니다.'), herschel: W('s02', '천팔백년'), irWord: W('s02', '적외선을'), ritter: W('s02', '보라'), uvWord: W('s02', '자외선을'),
  crest1: W('s03', '마루에서'), crest2: W('s03', '마루까지의'), maxwell: W('s04', '천팔백육십오년'), narrow: W('s04', '좁은'),
  b1: W('s05', '전파,'), b2: W('s05', '적외선,'), b3: W('s05', '가시광선,'), b4: W('s05', '자외선,'), b5: W('s05', '엑스선은'), all: W('s05', '모두'),
  diff: W('s05', '다른'), speed: W('s06', '초속'), often: W('s06', '자주'), energy: W('s06', '에너지도'),
  hair: W('s07', '머리카락'), red: W('s07', '빨강,'), violet: W('s07', '보라입니다.'), cells: W('s08', '세포는'), match: W('s08', '맞았다는'),
  irRange: W('s09', '일'), shake: W('s09', '흔들어'), body: W('s10', '체온'), remote: W('s10', '리모컨과'), camera: W('s10', '열화상'), co2: W('s10', '이산화탄소가'),
  bond: W('s11', '결합을'), snap: W('s11', '끊을'), dna: W('s11', '디엔에이가'), strong: W('s12', '가장'), ozone: W('s12', '오존이'),
  rest: W('s12', '남은'), vitd: W('s12', '비타민'), burn: W('s12', '피부를'),
  blue: W('s13', '파란빛이'), sunset: W('s13', '해'), redLeft: W('s13', '붉은빛이'),
  human: W('s14', '눈마다'), bee: W('s14', '벌은'), pattern: W('s14', '무늬를'), viper: W('s14', '살무사는'), warmth: W('s14', '온기를'),
  myth: W('s15', '적외선은'), mythUV: W('s15', '자외선은'), notIt: W('s15', '아닙니다.'), noColour: W('s15', '눈에는'), names: W('s15', '이름은'),
  infra: W('s15', '아래,'), ultra: W('s15', '너머라는'),
  glide: W('s16', '전파에서'), meets: W('s16', '무엇과'),
};

/** λ keyframes [[t, nm]] for the whole video; log λ eased between consecutive keys */
export function lamKeys(tl) {
  const at = r => tl.at(r), k = [];
  const push = (t, nm) => { if (k.length && t <= k[k.length - 1][0]) t = k[k.length - 1][0] + 0.05; k.push([t, nm]); };
  push(0, 550);
  push(at('s05:end') + 0.1, 550);
  push(at('s06') + 0.25, 1e6);
  push(at(A.speed), 1e6);
  push(at('s06:end') - 0.2, 300);
  push(at('visible') + 0.1, 300);
  push(at(W('s07', '칠백')) + 0.3, 700);
  push(at(A.red) + 0.2, 700);
  push(at(A.violet) + 0.25, 400);
  push(at('s08') + 0.2, 400);
  push(at(W('s08', '맞춰져')), 700);
  push(at(W('s08', '보인다는')) + 0.2, 550);
  push(at('infrared') + 0.1, 550);
  push(at(W('s09', '나노미터부터')) + 0.3, 700);
  push(at(W('s09', '쓰입니다.')) + 0.3, 1e4);
  push(at('s10') + 0.1, 1e4);
  push(at(W('s10', '몸도')) + 0.2, NM_BODY);
  push(at(A.remote), NM_BODY);
  push(at(A.remote) + 0.7, NM_REMOTE);
  push(at(A.camera) + 0.4, NM_REMOTE);
  push(at(W('s10', '카메라,')) + 0.6, 1e4);
  push(at(A.co2), 1e4);
  push(at(A.co2) + 0.8, NM_CO2);
  push(at('ultraviolet') + 0.1, NM_CO2);
  push(at(W('s11', '사백')) + 0.2, 400);
  push(at(W('s11', '짧고,')), 400);
  push(at(W('s11', '커서')) + 0.3, 300);
  push(at(W('s11', '이유입니다.')), 300);
  push(at(A.strong) + 0.1, 250);
  push(at(A.rest), 250);
  push(at(A.rest) + 0.8, 300);
  push(tl.duration, 300);
  return k;
}
export function lamAt(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, n1] = keys[i]; if (t > t1) continue;
    const [t0, n0] = keys[i - 1]; if (n0 === n1) return n0;
    return 10 ** lerp(lg(n0), lg(n1), easeInOut((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}

const MODELS = new WeakMap();
/** everything time-dependent the picture and the sound share */
export function model(tl) {
  let m = MODELS.get(tl); if (m) return m;
  const keys = lamKeys(tl), lam = t => lamAt(t, keys);
  // essence travelling wave: phase φ(t) = ∫ v/Λ dt (crest at the gate when φ is an integer)
  const s06 = tl.sentence('s06'), ess = tl.scene('essence'), P0 = s06.start - 0.8, P1 = ess.end, dt = 1 / 240;
  const ph = [0]; for (let tt = P0; tt < P1 + dt; tt += dt) ph.push(ph[ph.length - 1] + dt * WAVE_V / screenLam(lam(tt + dt / 2)));
  const phase = tt => { if (tt <= P0) return 0; const u = (tt - P0) / dt, i = Math.min(ph.length - 2, Math.floor(u)); return ph[i] + (ph[i + 1] - ph[i]) * (u - i); };
  const crests = []; const c0 = s06.start, c1 = ess.end - 0.4;
  for (let i = 1; i < ph.length; i++) if (Math.floor(ph[i]) > Math.floor(ph[i - 1])) { const tt = P0 + (i - 1) * dt + dt * (Math.floor(ph[i]) - ph[i - 1]) / (ph[i] - ph[i - 1]); if (tt >= c0 && tt <= c1) crests.push(tt); }
  // infrared: water vibration during s09, accumulated heat
  const ir = tl.scene('infrared'), s10 = tl.sentence('s10');
  const vibW = tt => waterAbs(lam(tt)) * smooth((tt - ir.start - 0.3) / 0.6) * (1 - smooth((tt - s10.start + 0.6) / 0.6));
  const heatT = []; let h = 0; for (let tt = ir.start; tt <= ir.end + 0.05; tt += 0.05) { heatT.push(h); h += 0.05 * vibW(tt); }
  const heat = tt => clamp(heatT[clamp(Math.floor((tt - ir.start) / 0.05), 0, heatT.length - 1)] / 5.5);
  const vibC = tt => co2Abs(lam(tt)) * smooth((tt - s10.start + 0.2) / 0.6) * (1 - smooth((tt - ir.end + 0.5) / 0.4));
  // scatter flashes: deterministic times for 450 nm (rate RB) and 700 nm (rate RB/5.85)
  const sc = tl.scene('scatter'), RB = 7.0;
  const flashes = (rate, seed) => { const out = []; let tt = sc.start + 0.6, i = 0; while (tt < sc.end - 0.2) { out.push({t: tt, y: rand(seed + i * 3), x: rand(seed + i * 3 + 1)}); tt += (0.45 + 1.1 * rand(seed + i * 3 + 2)) / rate; i++; } return out; };
  const fBlue = flashes(RB, 101), fRed = flashes(RB / RATIO_BR, 59);
  m = {keys, lam, phase, crests, P0, vibW, vibC, heat, fBlue, fRed};
  MODELS.set(tl, m);
  return m;
}
/** closing glide: log λ from 1 km to 1 pm */
export const CLOSE_GLIDE = 2.4;
export const closeLg = (t, t0) => lerp(12, -3, easeInOut((t - t0) / CLOSE_GLIDE));
export const closePitch = l => 110 * 2 ** (4 * (12 - l) / 15);
/** scatter sound windows (subsets of the flash lists) */
export function scatterWindows(tl) {
  const b0 = tl.at(A.blue), r0 = tl.at(A.redLeft) - 0.6;
  return {blue: [b0, b0 + 3.2], red: [r0, r0 + 3.6]};
}
/** sun elevation in the scatter scene */
export function sunElev(t, tl) {
  const a = tl.at(A.sunset) - 0.3;
  return lerp(70, 1, easeInOut((t - a) / 1.6));
}

// =====================================================================================================
// Number formats
// =====================================================================================================
const fmt = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sig = (v, n = 2) => { const s = Number(v.toPrecision(n)); return s >= 1000 ? fmt(s) : String(s); };
const SUP = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'};
const sci = v => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)} × 10${String(e).split('').map(ch => SUP[ch]).join('')}`; };
export function fmtLam(nm) {
  const u = nm >= 1e9 ? [nm / 1e9, 'm'] : nm >= 1e6 ? [nm / 1e6, 'mm'] : nm >= 1e3 ? [nm / 1e3, 'μm'] : nm >= 1 ? [nm, 'nm'] : [nm * 1e3, 'pm'];
  const v = u[0] >= 10 ? fmt(Math.round(u[0])) : u[0].toFixed(1);
  return `${v} ${u[1]}`;
}
const fmtF = hz => (hz >= 1e12 ? `${sig(hz / 1e12, 3)} THz` : `${sig(hz / 1e9, 3)} GHz`);
const fmtE = e => `${Number(e).toPrecision(2)} eV`;
const labCol = lam => (lam < 500 ? '#7FB8FF' : specCol(lam));
function lgLabel(l) {
  const units = [[9, 'm'], [6, 'mm'], [3, 'μm'], [0, 'nm'], [-3, 'pm']];
  if (l >= 12) return `${fmt(10 ** (l - 12))} km`;
  const [u, name] = units.find(([uu]) => l >= uu - 1e-9) || units[4];
  const v = 10 ** (l - u); return `${v >= 1 ? fmt(Math.round(v)) : sig(v, 1)} ${name}`;
}
function wienText(nm) {
  const T = wienK(nm), Ts = T >= 1000 ? fmt(Number(T.toPrecision(2))) : fmt(Math.round(T));
  let note = '';
  if (T < 10) note = '우주 배경 복사쯤';
  else if (T >= 250 && T < 400) note = `≈ ${fmt(Math.round(T) - 273.15)} °C · 체온·지표쯤`;
  else if (T >= 2000 && T < 3500) note = '전구 필라멘트쯤';
  else if (T >= 4500 && T < 7500) note = '태양 표면쯤';
  else if (T >= 9000 && T < 40000) note = '뜨거운 별';
  return [`${Ts} K`, note];
}

// =====================================================================================================
// Palette and drawing helpers
// =====================================================================================================
const MARK = '#FFE2C4', GREYW = '#B9C6CA', HATCH_BG = '#10222A', HATCH_LN = '#8FA2A8', WATER = '#7FC4D8';
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const evT = (ctx, id, fallback) => (ctx.events.has(id) ? ctx.events.get(id).time : ctx.tl.at(fallback));
const M = ctx => model(ctx.tl);
function panel(c, T, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 10, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
/** wavelength → sRGB (Bruton); edge = dim toward 380/780 */
export function specRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm >= 490 && nm < 510) { g = 1; b = -(nm - 510) / 20; } else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm >= 580 && nm < 645) { r = 1; g = -(nm - 645) / 65; } else if (nm >= 645 && nm <= 780) r = 1;
  const f = nm < 380 || nm > 780 ? 0 : nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
  return [r, g, b].map(v => Math.round(255 * (v * f) ** 0.8));
}
const specCol = (nm, a = 1) => { const [r, g, b] = specRGB(nm); return `rgba(${r},${g},${b},${a})`; };
const isVisible = nm => { const n = Number(nm.toPrecision(6)); return n >= 400 && n <= 700; };
/** diagonal hatch (world-anchored so neighbouring pieces line up) */
function hatch(c, x, y, w, h, o = {}) {
  if (w <= 0 || h <= 0) return;
  const sp = o.sp ?? 9;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = o.bg ?? HATCH_BG; c.fillRect(x, y, w, h);
  c.strokeStyle = o.col ?? rgba(HATCH_LN, 0.55); c.lineWidth = o.lw ?? 1.5; c.beginPath();
  for (let s = Math.floor((x + y) / sp) * sp; s <= x + w + y + h; s += sp) { c.moveTo(s - (y + h), y + h); c.lineTo(s - y, y); }
  c.stroke(); c.restore();
}
/** sine wave along x; colour by wavelength: visible → spectral colour, otherwise grey dashed */
function waveLine(c, x0, x1, yc, amp, L, ph, nm, o = {}) {
  const pts = []; for (let x = x0; x <= x1; x += 3) pts.push([x, yc - amp * Math.cos(TAU * ((x - (o.xg ?? x0)) / L - ph)) * (o.env ? o.env(x) : 1)]);
  const vis = o.forceCol ? true : nm >= 380 && nm <= 780;
  if (vis) { line(c, pts, rgba('#000', 0.4), (o.w ?? 4) + 3); line(c, pts, o.forceCol || specCol(nm), o.w ?? 4); } else line(c, pts, rgba(GREYW, o.a ?? 0.95), o.w ?? 3.5, {dash: [11, 8]});
  return pts;
}
/** 1-D label relaxation: items [{x, w}] → x positions with min gap, clamped to [xa, xb] */
function relax(items, gap, xa, xb) {
  const it = items.map((d, i) => ({...d, i, p: d.x})).sort((a, b) => a.x - b.x);
  for (let rep = 0; rep < 80; rep++) {
    for (let i = 1; i < it.length; i++) {
      const need = (it[i - 1].w + it[i].w) / 2 + gap, d = it[i].p - it[i - 1].p;
      if (d < need) { const s = (need - d) / 2; it[i - 1].p -= s; it[i].p += s; }
    }
    for (const d of it) d.p = clamp(d.p, xa + d.w / 2, xb - d.w / 2);
  }
  const out = []; for (const d of it) out[d.i] = d.p; return out;
}
const checkMark = (c, x, y, s, col) => line(c, [[x - 14 * s, y], [x - 4 * s, y + 11 * s], [x + 16 * s, y - 13 * s]], col, 4.5 * s);
const crossMark = (c, x, y, s, col) => { line(c, [[x - 13 * s, y - 13 * s], [x + 13 * s, y + 13 * s]], col, 4.5 * s); line(c, [[x + 13 * s, y - 13 * s], [x - 13 * s, y + 13 * s]], col, 4.5 * s); };
function thermo(stage, x, yTop, h, level, a = 1, hi = false) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    rect(c, x - 9, yTop, 18, h, 9, rgba(T.deep, 1), rgba(hi ? T.light : T.muted, 0.9), 2);
    for (let k = 1; k < 5; k++) line(c, [[x + 9, yTop + h * k / 5], [x + 16, yTop + h * k / 5]], rgba(T.muted, 0.7), 1.5);
    const col = '#E8E0D6';
    rect(c, x - 4, yTop + h * (1 - level), 8, h * level + 4, 4, col);
    circle(c, x, yTop + h + 12, 16, col); ring(c, x, yTop + h + 12, 16, rgba(hi ? T.light : T.muted, 0.9), 2);
  });
}
function markerAt(c, x, yTop, yBot, a = 1, col = MARK) {
  withAlpha(c, a, () => {
    line(c, [[x, yTop], [x, yBot]], rgba('#000', 0.5), 5); line(c, [[x, yTop], [x, yBot]], col, 2.5);
    poly(c, [[x - 11, yTop - 16], [x + 11, yTop - 16], [x, yTop - 1]], col, rgba('#000', 0.6), 1.5);
  });
}

// =====================================================================================================
// Spectrum bar (log axis) — the one ruler every scene shares
// =====================================================================================================
/** x of log10 λ(nm) for a bar {x0, x1, hi, lo} */
const BX = (Bar, l) => Bar.x0 + (Bar.hi - l) / (Bar.hi - Bar.lo) * (Bar.x1 - Bar.x0);
/**
 * Bands: visible in real colours, all others hatched grey. o: {lit: {id: 0..1}, sub: 0..1 (UV sub-bands),
 * visRange: [380, 780] to colour 380–780 (dimmed edges), dim: base hatch alpha}
 */
function specBar(c, Bar, y, h, o = {}) {
  const {x0, x1} = Bar, lit = o.lit || {};
  c.save(); c.beginPath(); c.rect(x0, y, x1 - x0, h); c.clip();
  for (const b of BANDS) {
    const xa = clamp(BX(Bar, lg(b.hi)), x0, x1), xb = clamp(BX(Bar, lg(b.lo)), x0, x1);
    if (xb - xa <= 0) continue;
    const L = lit[b.id] ?? o.dim ?? 0.55;
    if (b.id === 'vis') {
      const [va, vb] = o.visRange || [400, 700];
      // hatch the 380–400 / 700–780 margins when the colour range is the strict 400–700
      for (let x = Math.floor(xa); x < xb; x++) { const nm = 10 ** lerp(Bar.hi, Bar.lo, (x + 0.5 - x0) / (x1 - x0)); if (nm >= va && nm <= vb) { c.fillStyle = specCol(nm, 0.55 + 0.45 * L); c.fillRect(x, y, 1.6, h); } }
    } else hatch(c, xa, y, xb - xa, h, {col: rgba(HATCH_LN, 0.25 + 0.6 * L)});
  }
  if (o.visRange) { // colours spill into the IR / UV sides for the 380–780 zoom
    const [va, vb] = o.visRange;
    for (const [n0, n1] of [[700, vb], [va, 400]]) {
      const xa = clamp(BX(Bar, lg(n1)), x0, x1), xb = clamp(BX(Bar, lg(n0)), x0, x1);
      for (let x = Math.floor(xa); x < xb; x++) { const nm = 10 ** lerp(Bar.hi, Bar.lo, (x + 0.5 - x0) / (x1 - x0)); c.fillStyle = specCol(nm, 0.9); c.fillRect(x, y, 1.6, h); }
    }
  }
  // band dividers
  for (const b of BANDS) { const x = BX(Bar, lg(b.lo)); if (x > x0 + 1 && x < x1 - 1) line(c, [[x, y], [x, y + h]], rgba('#EFE3D4', 0.75), 1.5); }
  if (o.sub) withAlpha(c, o.sub, () => { for (const n of [315, 280, 100]) { const x = BX(Bar, lg(n)); line(c, [[x, y], [x, y + h]], rgba('#EFE3D4', 0.6), 1.2, {dash: [4, 4]}); } });
  c.restore();
  rect(c, x0, y, x1 - x0, h, 0, null, rgba('#EFE3D4', 0.5), 1.2);
}
/** ticks + labels under a bar (1-2-5 sub-ticks when the span is small) */
function barTicks(stage, Bar, y, o = {}) {
  const {ctx: c} = stage, T = stage.theme, span = Bar.hi - Bar.lo, pxDec = (Bar.x1 - Bar.x0) / span;
  const ticks = [];
  for (let d = Math.floor(Bar.lo) - 1; d <= Math.ceil(Bar.hi); d++) {
    for (let m = 1; m <= 9; m++) {
      const l = d + Math.log10(m); if (l < Bar.lo - 1e-6 || l > Bar.hi + 1e-6) continue;
      const major = m === 1;
      if (!major && pxDec < 260) continue;
      ticks.push({l, major, m});
    }
  }
  let lastR = -1e9;
  const every = o.every || (span > 9 ? 3 : 1);
  for (const tk of ticks.sort((a, b) => b.l - a.l)) {
    const x = BX(Bar, tk.l);
    line(c, [[x, y], [x, y + (tk.major ? 10 : 6)]], rgba(T.muted, 0.9), 1.5);
    const want = tk.major ? (Math.round(tk.l) % every === 0) : [2, 3, 5].includes(tk.m) || (pxDec > 700 && [4, 7].includes(tk.m));
    const lbl = lgLabel(tk.l), w = stage.measure(lbl, {size: 24, weight: 500});
    if (want && x - w / 2 > lastR + 14 && x > Bar.x0 + 20 && x < Bar.x1 - 20) {
      stage.text(lbl, x, y + 26, {size: 24, color: tk.major ? T.ink : T.muted, align: 'center', weight: tk.major ? 500 : 400});
      lastR = x + w / 2;
    }
  }
}
/** band names above a bar, relaxed with leaders */
function barNames(stage, Bar, yName, yBar, o = {}) {
  const {ctx: c} = stage, T = stage.theme, lit = o.lit || {}, items = [];
  const list = [...BANDS.filter(b => !(o.sub > 0.5 && b.id === 'uv')), ...(o.sub > 0.5 ? UV_SUB : [])];
  for (const b of list) {
    const xa = clamp(BX(Bar, lg(b.hi)), Bar.x0, Bar.x1), xb = clamp(BX(Bar, lg(b.lo)), Bar.x0, Bar.x1);
    const w = stage.measure(b.name, {size: 24, weight: 500}) + 6;
    if (xb - xa < Math.min(w * 0.45, 30) && b.id !== 'vis') continue;
    items.push({x: (xa + xb) / 2, w, b, xa, xb});
  }
  const xs = relax(items, 10, Bar.x0 - 30, Bar.x1 + 30);
  items.forEach((it, i) => {
    const L = lit[it.b.id] ?? o.dim ?? 0.6, x = xs[i];
    const col = it.b.id === 'vis' ? mix(T.muted, '#F4E6A0', L) : mix(T.muted, T.ink, L);
    if (Math.abs(x - it.x) > 8) line(c, [[x, yName + 14], [it.x, yBar - 2]], rgba(T.muted, 0.7), 1.2);
    stage.text(it.b.name, x, yName, {size: 24, weight: L > 0.7 ? 700 : 500, color: col, align: 'center', shadow: '#000'});
  });
}

/**
 * The dashboard strip: overview row (when zoomed), names, bar, ticks, size row / pins, marker.
 * B = {y0}; o: {range:[hi, lo], nm (marker), markerA, lit, sizes, pins:[{nm,label}], brackets:[{lo,hi,label,a}], sub}
 */
const STRIP_X0 = 90, STRIP_X1 = 990, FULL = [12, -3];
function strip(stage, t, B, o = {}) {
  const {ctx: c} = stage, T = stage.theme, y0 = B.y0;
  const [hi, lo] = o.range || FULL, Bar = {x0: STRIP_X0, x1: STRIP_X1, hi, lo};
  const zoomed = clamp(((FULL[0] - FULL[1]) - (hi - lo)) / 3);
  const yBar = y0 + 62, hBar = 40, brA = Math.max(0, ...(o.brackets || []).map(b => b.a || 0));
  panel(c, T, 60, y0, 960, B.h ?? 210, 0.85);
  withAlpha(c, 1 - brA, () => barNames(stage, Bar, y0 + 26, yBar, {lit: o.lit, sub: o.sub}));
  specBar(c, Bar, yBar, hBar, {lit: o.lit, sub: o.sub});
  // brackets: highlighted range on the bar, label in the names row
  for (const br of o.brackets || []) {
    if (!(br.a > 0)) continue;
    const xa = clamp(BX(Bar, lg(br.hi)), Bar.x0, Bar.x1), xb = clamp(BX(Bar, lg(br.lo)), Bar.x0, Bar.x1), col = br.col || T.light;
    withAlpha(c, br.a, () => {
      rect(c, xa, yBar - 4, xb - xa, hBar + 8, 3, rgba(col, 0.14), col, 2.5);
      const w = stage.measure(br.label, {size: 24, weight: 700}) + 16, xm = clamp((xa + xb) / 2, 64 + w / 2, 1016 - w / 2);
      stage.text(br.label, xm, y0 + 26, {size: 24, weight: 700, color: col, align: 'center', shadow: '#000'});
    });
  }
  barTicks(stage, Bar, yBar + hBar + 2, {every: hi - lo > 9 ? 3 : 1});
  // bottom row: size objects (full range) / pins / overview (zoomed)
  const yRow = y0 + 160;
  if ((o.sizes ?? 0) > 0) withAlpha(c, o.sizes * (1 - zoomed), () => sizeRow(stage, Bar, yRow));
  if (o.pins?.length) pinRow(stage, Bar, yRow, o.pins, yBar + hBar);
  if (zoomed > 0 && !o.noOverview) withAlpha(c, zoomed * (o.pins?.length ? 0 : 1), () => overview(stage, Bar, yRow + 12, yBar + hBar));
  if (o.nm) markerAt(c, BX(Bar, lg(o.nm)), yBar - 6, yBar + hBar + 6, o.markerA ?? 1);
  return {Bar, yBar, hBar};
}
function sizeRow(stage, Bar, y) {
  const {ctx: c} = stage, T = stage.theme;
  const items = SIZES.map(s => ({x: BX(Bar, lg(s.nm)), w: stage.measure(s.name, {size: 24}) + 4, s}));
  const xs = relax(items, 12, 80, 1000);
  stage.text('크기', 84, y + 26, {size: 24, color: T.muted});
  items.forEach((it, i) => {
    icon(stage, it.s.name, it.x, y - 2, 8);
    line(c, [[it.x, y + 8], [xs[i], y + 14]], rgba(T.muted, 0.6), 1.2);
    stage.text(it.s.name, xs[i], y + 28, {size: 24, color: T.ink, align: 'center'});
  });
}
function pinRow(stage, Bar, y, pins, yBarBot) {
  const {ctx: c} = stage, T = stage.theme;
  const items = pins.map(p => ({x: BX(Bar, lg(p.nm)), w: stage.measure(p.label, {size: 24, weight: 700}) + 6, p}));
  const xs = relax(items, 14, 70, 1010);
  items.forEach((it, i) => withAlpha(c, it.p.a ?? 1, () => {
    line(c, [[it.x, yBarBot - 4], [it.x, y - 2], [xs[i], y + 12]], rgba(it.p.on ? T.light : T.muted, 0.9), 2);
    circle(c, it.x, yBarBot - 4, 4, it.p.on ? T.light : T.muted);
    stage.text(it.p.label, xs[i], y + 28, {size: 24, weight: 700, color: it.p.on ? T.light : T.ink, align: 'center', shadow: '#000'});
  }));
}
function overview(stage, Bar, y, yBarBot) {
  const {ctx: c} = stage, T = stage.theme, O = {x0: 240, x1: 900, hi: FULL[0], lo: FULL[1]};
  stage.text('전체', 222, y + 7, {size: 24, color: T.muted, align: 'right'});
  specBar(c, O, y, 14, {dim: 0.45});
  const xa = BX(O, Bar.hi), xb = BX(O, Bar.lo);
  rect(c, xa - 2, y - 4, xb - xa + 4, 22, 3, null, MARK, 2);
  line(c, [[Bar.x0, yBarBot + 2], [xa, y - 4]], rgba(MARK, 0.35), 1.2, {dash: [4, 5]});
  line(c, [[Bar.x1, yBarBot + 2], [xb, y - 4]], rgba(MARK, 0.35), 1.2, {dash: [4, 5]});
}
/** tiny drawn icons for size objects */
function icon(stage, name, x, y, s) {
  const {ctx: c} = stage, col = '#D9E3E6';
  if (name === '머리카락') line(c, [[x - s, y + s], [x + s * 0.2, y - s * 0.3], [x + s, y - s]], col, 3);
  else if (name === '적혈구') { circle(c, x, y, s, rgba('#C98B8B', 0.9)); circle(c, x, y, s * 0.4, rgba('#7E4F55', 0.9)); }
  else if (name === '박테리아') { rect(c, x - s, y - s * 0.5, 2 * s, s, s * 0.5, rgba('#9FC79B', 0.9)); }
  else if (name === '바이러스') { for (let k = 0; k < 8; k++) { const a = k * TAU / 8; line(c, [[x, y], [x + Math.cos(a) * s * 1.1, y + Math.sin(a) * s * 1.1]], col, 1.5); } circle(c, x, y, s * 0.65, rgba('#B9A6D6', 0.95)); }
  else { for (const [dx, dy] of [[-0.6, 0.3], [0.6, 0.3], [0, -0.45]]) circle(c, x + dx * s, y + dy * s, s * 0.42, col); }
}

// =====================================================================================================
// Readouts (bottom of the dashboard)
// =====================================================================================================
const R_Y0 = 952, R_H = 384;
const E_LO = -3, E_HI = 2;   // log10 eV axis of the energy ladder
function readouts(stage, t, nm, a = 1, o = {}) {
  const {ctx: c} = stage, T = stage.theme, y0 = R_Y0;
  const E = eV(nm), b = bandOf(nm), tag = tagOf(E), sub = b.id === 'uv' ? uvSubOf(nm) : null;
  withAlpha(c, a, () => {
    panel(c, T, 60, y0, 960, R_H);
    const cx = [220, 540, 860];
    // row 1
    const lab1 = ['파장 λ', '진동수 f = c / λ', '알갱이 에너지 E = hc / λ'];
    lab1.forEach((s, i) => stage.text(s, cx[i], y0 + 32, {size: 24, color: T.muted, align: 'center'}));
    stage.text(fmtLam(nm), cx[0], y0 + 78, {role: 'display', size: 46, weight: 700, color: MARK, align: 'center'});
    stage.text(fmtF(fHz(nm)), cx[1], y0 + 78, {role: 'display', size: 44, weight: 500, color: T.ink, align: 'center'});
    stage.text(fmtE(E), cx[2], y0 + 78, {role: 'display', size: 44, weight: 700, color: tag.col, align: 'center'});
    for (const xx of [380, 700]) line(c, [[xx, y0 + 16], [xx, y0 + 212]], rgba(T.border, 1), 1.5);
    line(c, [[80, y0 + 110], [1000, y0 + 110]], rgba(T.border, 1), 1.5);
    // row 2
    ['구간', '무엇과 맞는가', '이 파장이 가장 센 물체'].forEach((s, i) => stage.text(s, cx[i], y0 + 136, {size: 24, color: T.muted, align: 'center'}));
    const bname = b.id === 'vis' ? `${b.name} · ${colourName(nm)}` : sub ? `${b.name} ${sub.name}` : b.name;
    const sw = 34, bw = stage.measure(bname, {size: 30, weight: 700}), sx = cx[0] - (bw + sw + 12) / 2;
    if (isVisible(nm)) rect(c, sx, y0 + 168, sw, 28, 4, specCol(nm)); else hatch(c, sx, y0 + 168, sw, 28, {col: rgba(HATCH_LN, 0.9)});
    rect(c, sx, y0 + 168, sw, 28, 4, null, rgba(T.ink, 0.6), 1.2);
    stage.text(bname, sx + sw + 12, y0 + 183, {size: 30, weight: 700, color: T.ink, maxWidth: 300 - sw});
    const tp = o.tagPulse || 0;
    if (tp > 0) rect(c, 396, y0 + 150, 288, 60, 8, rgba(tag.col, 0.18 * tp), rgba(tag.col, tp), 2);
    stage.text(tag.l1, cx[1], y0 + 168, {size: 26, weight: 700, color: tag.col, align: 'center', maxWidth: 300});
    stage.text(tag.l2, cx[1], y0 + 198, {size: 26, weight: 500, color: tag.col, align: 'center'});
    if (nm >= 10 && nm <= 1e6 + 1) {
      const [tt, note] = wienText(nm);
      stage.text(tt, cx[2], y0 + 170, {role: 'display', size: 32, weight: 500, color: T.ink, align: 'center'});
      if (note) stage.text(note, cx[2], y0 + 200, {size: 24, color: T.muted, align: 'center', maxWidth: 300});
    } else stage.text('—', cx[2], y0 + 176, {size: 30, color: T.muted, align: 'center'});
    line(c, [[80, y0 + 224], [1000, y0 + 224]], rgba(T.border, 1), 1.5);
    // row 3: energy ladder
    const lx0 = 110, lx1 = 970, X = e => lx0 + (lg(e) - E_LO) / (E_HI - E_LO) * (lx1 - lx0), yb = y0 + 290, hb = 22;
    let prev = 10 ** E_LO;
    TAGS.forEach((g, i) => {
      const e1 = Math.min(g.max, 10 ** E_HI), xa = X(prev), xb = X(e1), on = g === tag;
      rect(c, xa, yb, xb - xa, hb, 0, rgba(g.col, on ? 0.55 : 0.16));
      const two = xb - xa < 160, words = two ? (i === 1 ? ['눈 색소', '보임'] : i === 2 ? ['결합', '끊김'] : [g.l1, '']) : [i === 0 ? '분자 진동·회전 → 열' : i === 3 ? '원자 이온화' : g.l1, ''];
      const xm = (xa + xb) / 2;
      if (words[1]) { stage.text(words[0], xm, y0 + 246, {size: 24, weight: on ? 700 : 500, color: on ? g.col : T.muted, align: 'center'}); stage.text(words[1], xm, y0 + 272, {size: 24, weight: on ? 700 : 500, color: on ? g.col : T.muted, align: 'center'}); }
      else stage.text(words[0], xm, y0 + 262, {size: 24, weight: on ? 700 : 500, color: on ? g.col : T.muted, align: 'center'});
      if (i > 0) line(c, [[xa, yb - 4], [xa, yb + hb + 4]], rgba(T.ink, 0.8), 1.5);
      prev = e1;
    });
    rect(c, lx0, yb, lx1 - lx0, hb, 0, null, rgba(T.ink, 0.4), 1);
    for (let d = E_LO; d <= E_HI; d++) { const x = X(10 ** d); line(c, [[x, yb + hb], [x, yb + hb + 7]], T.muted, 1.5); stage.text(`${d < 0 ? (10 ** d).toFixed(-d) : fmt(10 ** d)}${d === E_HI ? ' eV' : ''}`, x, yb + hb + 24, {size: 24, color: T.muted, align: 'center'}); }
    const xe = clamp(X(E), lx0, lx1);
    rect(c, xe - 4, yb - 7, 8, hb + 14, 2, MARK, rgba('#000', 0.7), 1.5);
    if (X(E) < lx0) stage.text('◀', lx0 - 14, yb + hb / 2, {size: 24, color: MARK, align: 'center'});
  });
}

// =====================================================================================================
// Shared windows
// =====================================================================================================
const WIN = {x0: 60, y0: 318, w: 960, h: 400};
/** travelling wave + ruler + gate + crest counter (essence s06) */
function wavePanel(stage, t, ctx, a = 1) {
  const {ctx: c} = stage, T = stage.theme, m = M(ctx), nm = m.lam(t), L = screenLam(nm), ph = m.phase(t);
  const xg = 540, yc = 512, amp = 66;
  withAlpha(c, a, () => {
    // c line
    const ca = fadeIn(t, evT(ctx, 'ess_speed', A.speed) - 0.2, 0.5);
    withAlpha(c, 0.35 + 0.65 * ca, () => stage.text('모든 빛의 속도 c = 299,792,458 m/s', 540, WIN.y0 + 34, {role: 'display', size: 30, weight: 500, color: T.ink, align: 'center'}));
    clipRect(c, WIN.x0 + 4, WIN.y0 + 60, WIN.w - 8, WIN.h - 120, 6, () => {
      line(c, [[90, yc], [990, yc]], rgba(T.border, 1), 1.5);
      waveLine(c, 90, 990, yc, amp, L, ph, nm, {xg});
    });
    // gate
    const fr = ph - Math.floor(ph), flash = Math.exp(-fr * L / WAVE_V * 9) * (ph > 0.5 ? 1 : 0);
    line(c, [[xg, yc - amp - 34], [xg, yc + amp + 22]], rgba(MARK, 0.5 + 0.5 * flash), 2 + 2 * flash, {dash: [6, 6]});
    if (flash > 0.05) glow(c, xg, yc - amp, 40, MARK, 0.5 * flash);
    stage.text('관측점', xg, yc + amp + 42, {size: 24, color: T.muted, align: 'center'});
    // ruler between the two crests around the gate (crest k at x = xg + L·(k − φ))
    const k0 = Math.ceil(ph - (900 - xg) / L), xs = [];
    for (let k = k0; k < k0 + 40; k++) { const x = xg + L * (k - ph); if (x > 110 && x < 970) xs.push(x); }
    let best = null; for (let i = 0; i + 1 < xs.length; i++) { const mid = (xs[i] + xs[i + 1]) / 2; if (!best || Math.abs(mid - 380) < Math.abs(best[0] + L / 2 - 380)) best = [xs[i], xs[i + 1]]; }
    if (best && L > 20) {
      const [xa, xb] = best, yr = yc - amp - 18;
      line(c, [[xa, yr], [xb, yr]], MARK, 2); line(c, [[xa, yr - 8], [xa, yr + 8]], MARK, 2); line(c, [[xb, yr - 8], [xb, yr + 8]], MARK, 2);
      const lbl = `λ = ${fmtLam(nm)}`, w = stage.measure(lbl, {size: 26, weight: 700}) + 14, xm = clamp((xa + xb) / 2, 90 + w / 2, 990 - w / 2);
      rect(c, xm - w / 2, yr - 44, w, 32, 6, rgba(T.plate, 0.95));
      stage.text(lbl, xm, yr - 28, {size: 26, weight: 700, color: MARK, align: 'center'});
    }
    // direction
    arrow(c, [880, WIN.y0 + 74], [990, WIN.y0 + 74], rgba(T.muted, 0.9), 2.5, {head: 12});
    stage.text('진행', 866, WIN.y0 + 74, {size: 24, color: T.muted, align: 'right'});
    if (!(nm >= 380 && nm <= 780)) stage.text('안 보이는 빛 · 회색 점선', 1000, WIN.y0 + WIN.h - 32, {size: 24, color: GREYW, align: 'right'});
    else stage.text(`보이는 빛 · ${colourName(nm)}`, 1000, WIN.y0 + WIN.h - 32, {size: 24, weight: 700, color: specCol(nm), align: 'right'});
    // crest counter
    const oa = fadeIn(t, evT(ctx, 'ess_often', A.often) - 1.2, 0.5);
    withAlpha(c, 0.45 + 0.55 * oa, () => {
      stage.text('1초에 지나가는 마루', 320, WIN.y0 + WIN.h - 32, {size: 26, color: T.muted, align: 'right'});
      stage.text(`${sci(fHz(nm))} 개`, 336, WIN.y0 + WIN.h - 32, {role: 'display', size: 34, weight: 700, color: T.ink});
    });
  });
}
/** essence s05: seven mini waves (same shape, different length) */
const ROWS = [['radio', '전파', 560, '1 m 이상'], ['micro', '마이크로파', 300, '1 mm – 1 m'], ['ir', '적외선', 160, '700 nm – 1 mm'], ['vis', '가시광선', 92, '400 – 700 nm'],
  ['uv', '자외선', 52, '10 – 400 nm'], ['xray', 'X선', 30, '0.01 – 10 nm'], ['gamma', '감마선', 17, '0.01 nm 이하']];
function bandRows(stage, t, ctx, lit, a = 1) {
  const {ctx: c} = stage, T = stage.theme, y0 = WIN.y0 + 34, dy = 54;
  const dA = fadeIn(t, evT(ctx, 'ess_diff', A.diff) - 0.1, 0.5);
  withAlpha(c, a, () => ROWS.forEach(([id, name, L, rng], i) => {
    const y = y0 + i * dy, on = lit[id] ?? 0, al = 0.35 + 0.65 * on, ph = t * 1.1;
    withAlpha(c, al, () => {
      stage.text(name, 84, y, {size: 26, weight: on > 0.5 ? 700 : 500, color: T.ink});
      clipRect(c, 250, y - 26, 520, 52, 0, () => {
        if (id === 'vis') {
          const pts = []; for (let x = 250; x <= 770; x += 2) pts.push([x, y - 17 * Math.cos(TAU * ((x - 250) / L - ph))]);
          for (let j = 1; j < pts.length; j++) line(c, [pts[j - 1], pts[j]], specCol(700 - 300 * (j / pts.length)), 3.5);
        } else waveLine(c, 250, 770, y, 17, L, ph, 1e9, {w: 3, xg: 250});
      });
      stage.text(rng, 996, y, {size: 24, color: T.muted, align: 'right'});
      // λ brackets light with "다른 것은 파장 하나뿐"
      if (dA > 0 && L < 500) withAlpha(c, dA, () => {
        const xa = 250 + L * (Math.floor(260 / L - ph) + 1 + ph), xb = xa + L;
        if (xb < 770) { line(c, [[xa, y - 24], [xb, y - 24]], MARK, 2); line(c, [[xa, y - 29], [xa, y - 19]], MARK, 2); line(c, [[xb, y - 29], [xb, y - 19]], MARK, 2); }
      });
    });
  }));
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
  hook: ['예측 질문', '빨강 바깥, 온도가 오를까?'],
  origin: ['기원 · 이름과 발견', '波長 — 물결의 길이'],
  essence: ['본질 · 제1원리', '모두 같은 파동, 다른 것은 파장'],
  visible: ['메커니즘 ① 가시광선', '눈과 맞는 좁은 창'],
  infrared: ['메커니즘 ② 적외선', '분자를 흔드는 긴 파장'],
  ultraviolet: ['메커니즘 ③ 자외선', '결합을 끊는 짧은 파장'],
  scatter: ['메커니즘 ④ 흩어짐', '짧을수록 더 흩어진다'],
  animals: ['눈마다 다른 창', '살무사 · 사람 · 꿀벌'],
  myth: ['오해 바로잡기', '적외선은 빨간빛이 아니다'],
  close: ['', ''],
};

let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'lam_tone'), m = M(ctx);
  const ok = e?.model && Math.abs(e.model.n - m.keys.length) < 0.5 && Math.abs(e.model.t_last_key - m.keys[m.keys.length - 2][0]) < 1e-3 && e.model.crests === m.crests.length;
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/wavelength/scenes.mjs --emit-sound');
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  // ------------------------------------------------------------------ hook: Herschel's prism + thermometers
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    checkSoundTable(ctx);
    const tAns = evT(ctx, 'answer', A.answer), tRit = evT(ctx, 'ritter', A.ritter);
    const a0 = fadeIn(t, 0.2, 0.8), rise = easeInOut((t - tAns) / 3.2), dark = smooth((t - tRit + 0.3) / 3);
    const PIN = [671, 452], POUT = [563, 488], ySc = 800;
    const landing = nm => lerp(330, 640, (700 - nm) / 300);   // visible 700 → 400
    withAlpha(c, a0, () => {
      // white beam from the window slit (top right)
      rect(c, 940, 316, 70, 22, 3, rgba(T.deep, 1), rgba(T.muted, 0.9), 1.5);
      stage.text('햇빛', 975, 360, {size: 24, color: T.muted, align: 'center'});
      line(c, [[975, 338], PIN], rgba('#FFFFFF', 0.25), 16); line(c, [[975, 338], PIN], '#FFFDF6', 5);
      line(c, [PIN, POUT], rgba('#FFFDF6', 0.7), 4);
      // fan: visible rays + (after the answer) invisible dashed rays beyond red and violet
      for (let nm = 700; nm >= 400; nm -= 6) {
        const x = landing(nm);
        poly(c, [POUT, [x - 3.5, ySc], [x + 3.5, ySc]], specCol(nm, 0.5));
      }
      const ir = 230, uv = 735;
      withAlpha(c, 0.25 + 0.75 * rise, () => {
        line(c, [POUT, [ir, ySc]], rgba(GREYW, 0.8), 2.5, {dash: [9, 8]});
        line(c, [POUT, [uv, ySc]], rgba(GREYW, 0.8 * (0.3 + 0.7 * dark)), 2.5, {dash: [9, 8]});
      });
      // glass prism (apex up)
      const P = [[628, 380], [520, 560], [736, 560]];
      const g = c.createLinearGradient(520, 380, 736, 560); g.addColorStop(0, 'rgba(180,215,230,0.38)'); g.addColorStop(1, 'rgba(90,140,165,0.22)');
      poly(c, P, g, rgba('#D8EEF6', 0.9), 2.2);
      line(c, [[628, 384], [560, 500]], rgba('#FFFFFF', 0.45), 2);
      stage.text('프리즘', 760, 560, {size: 24, color: T.muted});
      // table / screen
      rect(c, 150, ySc, 780, 14, 3, rgba('#3B4E55', 1), rgba(T.muted, 0.8), 1.2);
      hatch(c, 160, ySc - 26, 160, 26, {col: rgba(HATCH_LN, 0.7)});
      hatch(c, 650, ySc - 26, 150, 26, {col: rgba(HATCH_LN, 0.7)});
      for (let x = 330; x < 640; x++) { c.fillStyle = specCol(700 - 300 * (x - 330) / 310, 0.95); c.fillRect(x, ySc - 26, 1.4, 26); }
      stage.text('무지개', 485, ySc - 50, {size: 24, weight: 700, color: T.ink, align: 'center', shadow: '#000'});
      withAlpha(c, 1 - fadeIn(t, evT(ctx, 'ir_word', A.irWord), 0.4), () => {
        stage.text('빨강 바깥', 240, ySc - 50, {size: 24, color: GREYW, align: 'center', shadow: '#000'});
        stage.text('보라 너머', 725, ySc - 50, {size: 24, color: GREYW, align: 'center', shadow: '#000'});
      });
      withAlpha(c, fadeIn(t, evT(ctx, 'ir_word', A.irWord), 0.4), () => stage.text('적외선 · 안 보임', 240, ySc - 50, {size: 24, weight: 700, color: T.light, align: 'center', shadow: '#000'}));
      withAlpha(c, fadeIn(t, evT(ctx, 'uv_word', A.uvWord), 0.4), () => stage.text('자외선 · 안 보임', 725, ySc - 50, {size: 24, weight: 700, color: T.light, align: 'center', shadow: '#000'}));
    });
    // thermometers: beyond red highest (Herschel 1800); qualitative heights
    const TH = [[230, 0.95, true], [355, 0.74], [440, 0.6], [520, 0.5], [600, 0.42]];
    TH.forEach(([x, lv, beyond], i) => {
      const la = fadeIn(t, tl.at({sentence: 's01', word: '온도계를'}) - 0.2 + i * 0.12, 0.4);
      thermo(stage, x, 846, 150, 0.22 + (lv - 0.22) * rise, la, beyond && rise > 0.6);
    });
    const hA = fadeIn(t, evT(ctx, 'herschel', A.herschel) - 0.1, 0.4);
    withAlpha(c, hA, () => {
      stage.text('빨강 바깥 · 가장 뜨거움', 230, 1060, {size: 26, weight: 700, color: T.light, align: 'center', shadow: '#000'});
      stage.text('1800 허셜', 230, 1096, {role: 'display', size: 28, weight: 500, color: T.accent, align: 'center'});
    });
    // silver chloride card beyond violet (Ritter 1801)
    withAlpha(c, a0, () => {
      rect(c, 690, 850, 80, 150, 4, mix('#E9E6DE', '#2A2622', 0.85 * dark), rgba(T.muted, 0.9), 1.5);
      rect(c, 690, 850, 80, 150, 4, null, rgba(T.muted, 0.9), 1.5);
      stage.text('염화은', 730, 836 - 14, {size: 24, color: T.muted, align: 'center', alpha: 1 - dark * 0.0});
    });
    const rA = fadeIn(t, tRit - 0.1, 0.4);
    withAlpha(c, rA, () => {
      stage.text('보라 너머', 730, 1036, {size: 26, weight: 700, color: T.light, align: 'center', shadow: '#000'});
      stage.text('염화은이 검게', 730, 1066, {size: 26, weight: 700, color: T.light, align: 'center', shadow: '#000'});
      stage.text('1801 리터', 730, 1100, {role: 'display', size: 28, weight: 500, color: T.accent, align: 'center'});
    });
    // prediction boxes
    const qa = fadeIn(t, tl.at({sentence: 's01', word: '오를까요,'}) - 0.3, 0.5), ans = fadeIn(t, tAns - 0.05, 0.3);
    withAlpha(c, qa, () => {
      const boxes = [[300, '오른다', true], [780, '그대로', false]];
      for (const [x, txt, right] of boxes) {
        const on = right && ans > 0.5, off = !right && ans > 0.5;
        withAlpha(c, off ? 0.4 : 1, () => {
          rect(c, x - 200, 1170, 400, 130, 10, rgba(T.plate, 0.92), on ? T.light : rgba(T.border, 1), on ? 3 : 1.5);
          stage.text(txt, x, 1218, {role: 'display', size: 40, weight: 700, color: on ? T.light : T.ink, align: 'center'});
          stage.text(on ? '보이지 않는 빛이 데움' : '?', x, 1266, {size: 26, weight: 500, color: on ? T.ink : T.muted, align: 'center'});
        });
        if (on) checkMark(c, x + 160, 1200, 1.1, T.light);
      }
      if (ctx.events.has('answer')) { const f = ctx.events.pulse('answer', t, 0.8); if (f > 0) ring(c, 300, 1235, 70 + 110 * (1 - f), rgba(T.light, f * 0.8), 3); }
    });
  },

  // ------------------------------------------------------------------ origin: 波長, crest-to-crest, timeline, E/B
  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const tMax = evT(ctx, 'maxwell', A.maxwell), sw = smooth((t - tMax + 0.6) / 0.8), tNar = evT(ctx, 'narrow', A.narrow);
    // A: glyph cards (s03) → E/B wave (s04)
    withAlpha(c, (1 - sw) * fadeIn(t, tl.scene('origin').start + 0.1, 0.5), () => {
      const cards = [[380, '波', '물결 파', W('s03', '물결')], [700, '長', '길 장', W('s03', '길')]];
      for (const [x, g, rd, wd] of cards) {
        const on = fadeIn(t, tl.at(wd) - 0.1, 0.4);
        rect(c, x - 130, 336, 260, 236, 12, rgba(T.plate, 0.95), on > 0.5 ? T.light : rgba(T.border, 1), on > 0.5 ? 2.5 : 1.5);
        stage.text(g, x, 436, {size: 128, weight: 700, color: mix(T.muted, T.ink, on), align: 'center'});
        stage.text(rd, x, 536, {size: 30, weight: 700, color: on > 0.5 ? T.light : T.muted, align: 'center'});
      }
      stage.text('+', 540, 446, {role: 'display', size: 50, weight: 700, color: T.muted, align: 'center'});
      stage.text('wavelength · 기호 λ (람다)', 540, 606, {size: 26, weight: 500, color: T.muted, align: 'center'});
    });
    withAlpha(c, sw, () => ebWave(stage, t, 336, 610));
    // B: timeline
    const yT = 690, nodes = [[160, '1666', '뉴턴', '프리즘'], [350, '1800', '허셜', '적외선'], [540, '1801', '리터', '자외선'], [730, '1865', '맥스웰', '전자기파'], [920, '1888', '헤르츠', '전파']];
    withAlpha(c, fadeIn(t, tl.scene('origin').start + 0.3, 0.5), () => {
      line(c, [[120, yT], [960, yT]], rgba(T.border, 1), 3);
      nodes.forEach(([x, yr, who, what], i) => {
        const on = i < 3 ? 1 : i === 3 ? fadeIn(t, tMax - 0.1, 0.4) : fadeIn(t, tMax + 2.8, 0.4);
        const col = i === 3 && on > 0.5 ? T.light : on > 0.5 ? T.ink : T.muted;
        circle(c, x, yT, i === 3 ? 9 : 7, on > 0.5 ? col : rgba(T.muted, 0.6));
        if (i === 3 && ctx.events.has('maxwell')) { const f = ctx.events.pulse('maxwell', t, 0.9); if (f > 0) ring(c, x, yT, 12 + 40 * (1 - f), rgba(T.light, f), 2.5); }
        stage.text(yr, x, yT - 34, {role: 'display', size: 28, weight: 700, color: col, align: 'center'});
        stage.text(who, x, yT + 36, {size: 24, weight: 700, color: col, align: 'center'});
        stage.text(what, x, yT + 66, {size: 24, color: on > 0.5 ? T.muted : rgba(T.muted, 0.6), align: 'center'});
      });
    });
    // C: crest-to-crest ruler (s03) → spectrum strip with the narrow visible window (s04)
    const cw = 1 - smooth((t - tNar + 1.4) / 0.7);
    withAlpha(c, cw * fadeIn(t, tl.scene('origin').start + 0.4, 0.5), () => {
      const yc = 1040, L = 300, amp = 70, ph = -0.5 + 0.06 * Math.sin(t * 1.3);
      panel(c, T, 60, 850, 960, 420, 0.6);
      clipRect(c, 64, 860, 952, 400, 8, () => {
        const pts = []; for (let x = 70; x <= 1010; x += 3) pts.push([x, yc - amp * Math.cos(TAU * ((x - 540) / L - ph))]);
        poly(c, [...pts, [1010, 1260], [70, 1260]], rgba(WATER, 0.18));
        line(c, pts, WATER, 4);
      });
      // crests nearest the centre
      const k0 = Math.ceil((300 - 540) / L - ph), xa = 540 + L * (k0 + ph), xb = xa + L;
      const c1 = fadeIn(t, evT(ctx, 'crest1', A.crest1) - 0.1, 0.3), c2 = fadeIn(t, evT(ctx, 'crest2', A.crest2) - 0.1, 0.3);
      for (const [x, q] of [[xa, c1], [xb, c2]]) withAlpha(c, q, () => { circle(c, x, yc - amp, 9, T.light); stage.text('마루', x, yc - amp - 34, {size: 26, weight: 700, color: T.light, align: 'center', shadow: '#000'}); });
      const xTr = xa + L / 2; stage.text('골', xTr, yc + amp + 30, {size: 24, color: T.muted, align: 'center'});
      withAlpha(c, c2, () => {
        const yr = yc + amp + 70;
        line(c, [[xa, yc - amp + 12], [xa, yr + 10]], rgba(T.light, 0.5), 1.5, {dash: [4, 5]});
        line(c, [[xb, yc - amp + 12], [xb, yr + 10]], rgba(T.light, 0.5), 1.5, {dash: [4, 5]});
        arrow(c, [(xa + xb) / 2, yr], [xa + 2, yr], T.light, 2.5, {head: 12}); arrow(c, [(xa + xb) / 2, yr], [xb - 2, yr], T.light, 2.5, {head: 12});
        rect(c, (xa + xb) / 2 - 92, yr + 20, 184, 40, 8, rgba(T.plate, 0.95));
        stage.text('λ = 파장', (xa + xb) / 2, yr + 40, {role: 'display', size: 30, weight: 700, color: T.light, align: 'center'});
      });
    });
    withAlpha(c, 1 - cw, () => {
      const S = strip(stage, t, {y0: 870, h: 180}, {lit: {vis: 1}, dim: 0.5, nm: null});
      const xv = BX(S.Bar, lg(550)), q = fadeIn(t, tNar - 0.1, 0.4);
      withAlpha(c, q, () => {
        ring(c, xv, S.yBar + S.hBar / 2, 34, T.light, 2.5);
        line(c, [[xv, S.yBar + S.hBar + 30], [xv, 1150]], rgba(T.light, 0.8), 2);
        stage.text('보이는 빛 = 좁은 한 구간', xv - 40, 1176, {size: 28, weight: 700, color: T.light, align: 'center'});
        stage.text('나머지는 모두 눈에 안 보임', 540, 1240, {size: 26, color: GREYW, align: 'center'});
      });
    });
  },

  // ------------------------------------------------------------------ essence: the 3-tier dashboard appears
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, m = M(ctx), nm = m.lam(t), tl = ctx.tl;
    const ids = ['radio', 'micro', 'ir', 'vis', 'uv', 'xray', 'gamma'];
    const evs = ['ess_b1', 'ess_b1', 'ess_b2', 'ess_b3', 'ess_b4', 'ess_b5', 'ess_all'], refs = [A.b1, A.b1, A.b2, A.b3, A.b4, A.b5, A.all];
    const tAll = evT(ctx, 'ess_all', A.all), all = fadeIn(t, tAll - 0.1, 0.4);
    const lit = {}; ids.forEach((id, i) => { lit[id] = Math.max(all, fadeIn(t, evT(ctx, evs[i], refs[i]) - 0.1 + (i === 1 ? 0.35 : 0), 0.3)); });
    const sw = smooth((t - tl.sentence('s06').start + 0.9) / 0.8);
    const a0 = fadeIn(t, tl.scene('essence').start, 0.5);
    withAlpha(c, a0, () => {
      panel(c, T, WIN.x0, WIN.y0, WIN.w, WIN.h, 0.85);
      withAlpha(c, 1 - sw, () => bandRows(stage, t, ctx, lit));
      withAlpha(c, sw, () => wavePanel(stage, t, ctx));
      strip(stage, t, {y0: 730}, {lit: sw > 0.5 ? {} : lit, dim: sw > 0.5 ? 0.6 : 0.3, nm, sizes: 1});
      readouts(stage, t, nm, fadeIn(t, tl.scene('essence').start + 0.4, 0.6));
    });
    // "모두 같은 파동" stamp on the rows
    withAlpha(c, all * (1 - sw), () => {
      line(c, [[1004, WIN.y0 + 14], [1012, WIN.y0 + 14], [1012, WIN.y0 + WIN.h - 14], [1004, WIN.y0 + WIN.h - 14]], rgba(T.light, 0.7), 2);
    });
  },

  // ------------------------------------------------------------------ visible: zoom 380–780 nm, hair, cones
  visible(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, m = M(ctx), nm = m.lam(t), tl = ctx.tl;
    const tC = evT(ctx, 'vis_cells', A.cells), cs = smooth((t - tC + 0.5) / 0.7);
    panel(c, T, WIN.x0, WIN.y0, WIN.w, WIN.h, 0.85);
    // zoom band: linear 780 (left) → 380 (right)
    const zx0 = 100, zx1 = 980, ZX = n => zx0 + (780 - n) / 400 * (zx1 - zx0), zy = WIN.y0 + 34, zh = 64;
    hatch(c, 64, zy, zx0 - 64, zh, {col: rgba(HATCH_LN, 0.8)}); hatch(c, zx1, zy, 1016 - zx1, zh, {col: rgba(HATCH_LN, 0.8)});
    for (let x = zx0; x < zx1; x++) { c.fillStyle = specCol(780 - 400 * (x - zx0) / (zx1 - zx0)); c.fillRect(x, zy, 1.4, zh); }
    rect(c, 64, zy, 952, zh, 0, null, rgba(T.ink, 0.5), 1.2);
    for (let n = 400; n <= 750; n += 50) { const x = ZX(n), maj = n % 100 === 0; line(c, [[x, zy + zh], [x, zy + zh + (maj ? 10 : 6)]], T.muted, 1.5); if (maj) stage.text(`${n} nm`, x, zy + zh + 28, {size: 24, color: T.ink, align: 'center'}); }
    for (const n of [700, 400]) line(c, [[ZX(n), zy - 6], [ZX(n), zy + zh + 6]], rgba('#FFFFFF', 0.85), 2, {dash: [5, 4]});
    const ra = fadeIn(t, evT(ctx, 'vis_red', A.red) - 0.1, 0.3), va = fadeIn(t, evT(ctx, 'vis_violet', A.violet) - 0.1, 0.3);
    stage.text('← 적외선 쪽 · 안 보임', 70, zy + zh + 58, {size: 24, color: GREYW});
    stage.text('자외선 쪽 · 안 보임 →', 1010, zy + zh + 58, {size: 24, color: GREYW, align: 'right'});
    withAlpha(c, ra, () => stage.text('긴 쪽 = 빨강', ZX(660), zy + zh / 2, {size: 26, weight: 700, color: '#160A08', align: 'center'}));
    withAlpha(c, va, () => stage.text('짧은 쪽 = 보라', ZX(430), zy + zh / 2, {size: 26, weight: 700, color: '#F6F0FF', align: 'center', shadow: '#000'}));
    markerAt(c, ZX(clamp(nm, 380, 780)), zy - 4, zy + zh + 4, 1);
    // lower window: hair comparison (s07) → cone curves (s08)
    withAlpha(c, (1 - cs) * fadeIn(t, evT(ctx, 'vis_hair', A.hair) - 0.2, 0.5), () => {
      const y = WIN.y0 + 228;
      rect(c, 190, y - 30, 700, 60, 30, rgba('#5A4A3E', 0.95), rgba('#A88E78', 1), 2);
      for (let k = 0; k < 6; k++) line(c, [[230 + k * 110, y - 26], [270 + k * 110, y + 26]], rgba('#8C735F', 0.6), 2);
      stage.text('머리카락 굵기 70 μm', 540, y, {size: 28, weight: 700, color: '#F2E6DA', align: 'center'});
      line(c, [[190, y + 46], [890, y + 46]], rgba(T.muted, 0.8), 1.5);
      const yw = y + 100;
      line(c, [[190, yw], [197, yw]], specCol(700), 4); line(c, [[190, yw - 10], [190, yw + 10]], T.light, 2); line(c, [[197, yw - 10], [197, yw + 10]], T.light, 2);
      ring(c, 194, yw, 22, rgba(T.light, 0.8), 2); line(c, [[210, yw + 16], [250, yw + 36]], rgba(T.light, 0.8), 2);
      // magnified single wavelength
      clipRect(c, 260, yw - 8, 200, 60, 0, () => waveLine(c, 262, 460, yw + 22, 16, 100, 0, 700, {w: 3, xg: 262}));
      stage.text('빛의 파장 700 nm = 머리카락의 100분의 1', 690, yw + 22, {size: 26, weight: 700, color: T.ink, align: 'center'});
    });
    withAlpha(c, cs, () => {
      const yb = WIN.y0 + WIN.h - 30, hh = 128;
      stage.text('눈의 세포가 반응하는 창', 540, WIN.y0 + 186, {size: 26, weight: 700, color: T.ink, align: 'center'});
      line(c, [[ZX(780), yb], [ZX(380), yb]], rgba(T.border, 1), 1.5);
      for (const cn of CONES) {
        const pts = []; for (let n = 380; n <= 780; n += 4) pts.push([ZX(n), yb - hh * coneResp(cn, n)]);
        poly(c, [...pts, [ZX(780), yb], [ZX(380), yb]], specCol(cn.peak, 0.12));
        line(c, pts, specCol(cn.peak), 3);
        stage.text(cn.id, ZX(cn.peak), yb - hh - 16, {size: 26, weight: 700, color: specCol(cn.peak), align: 'center', shadow: '#000'});
      }
      const xm = ZX(clamp(nm, 380, 780));
      line(c, [[xm, yb - hh - 4], [xm, yb]], rgba(MARK, 0.8), 2);
      for (const cn of CONES) { const r = coneResp(cn, nm); circle(c, xm, yb - hh * r, 6, MARK); }
      const txt = CONES.map(cn => `${cn.id} ${Math.round(100 * coneResp(cn, nm))}`).join(' · ');
      stage.text(txt, xm > 540 ? xm - 20 : xm + 20, yb - 20, {size: 24, weight: 500, color: MARK, align: xm > 540 ? 'right' : 'left', shadow: '#000'});
    });
    // strip with zoom connectors
    const S = strip(stage, t, {y0: 730}, {nm, lit: {vis: 1}, dim: 0.35, sizes: 1});
    ring(c, BX(S.Bar, lg(550)), S.yBar + S.hBar / 2, 30, rgba(T.light, 0.9), 2.5);
    readouts(stage, t, nm);
  },

  // ------------------------------------------------------------------ infrared: shaking molecules, heat, uses
  infrared(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, m = M(ctx), nm = m.lam(t), tl = ctx.tl;
    const s10 = tl.sentence('s10').start, cw = smooth((t - s10 + 0.5) / 0.7);
    panel(c, T, WIN.x0, WIN.y0, WIN.w, WIN.h, 0.85);
    withAlpha(c, 1 - cw, () => moleculeWindow(stage, t, ctx, nm));
    withAlpha(c, cw, () => irCards(stage, t, ctx, nm));
    const z = smooth((t - tl.scene('infrared').start) / 1.2), range = [lerp(12, 6.3, z), lerp(-3, 2.3, z)];
    const tR = tl.at(A.irRange);
    const brackets = [{lo: 700, hi: 1e6, label: '적외선 700 nm – 1 mm', a: fadeIn(t, tR - 0.2, 0.4) * (1 - cw)}];
    const on = (id, ref) => fadeIn(t, evT(ctx, id, ref) - 0.1, 0.3);
    const pins = cw > 0.05 ? [
      {nm: NM_CO2, label: 'CO₂ 15 μm', a: on('ir_co2', A.co2) * cw, on: Math.abs(lg(nm / NM_CO2)) < 0.02},
      {nm: NM_BODY, label: '몸 9.4 μm', a: on('ir_body', A.body) * cw, on: Math.abs(lg(nm / NM_BODY)) < 0.02},
      {nm: NM_REMOTE, label: '리모컨 940 nm', a: on('ir_remote', A.remote) * cw, on: Math.abs(lg(nm / NM_REMOTE)) < 0.02},
    ] : null;
    if (cw > 0.05) brackets.push({lo: 8000, hi: 14000, label: '열화상 8–14 μm', a: on('ir_camera', A.camera) * cw});
    strip(stage, t, {y0: 730}, {nm, range, lit: {ir: 1}, dim: 0.35, pins, brackets});
    readouts(stage, t, nm);
  },

  // ------------------------------------------------------------------ ultraviolet: DNA rung breaks; ozone shield
  ultraviolet(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, m = M(ctx), nm = m.lam(t), tl = ctx.tl;
    const s12 = tl.sentence('s12').start, cw = smooth((t - s12 + 0.5) / 0.7);
    panel(c, T, WIN.x0, WIN.y0, WIN.w, WIN.h, 0.85);
    withAlpha(c, 1 - cw, () => dnaWindow(stage, t, ctx, nm));
    withAlpha(c, cw, () => ozoneWindow(stage, t, ctx, nm));
    const z = smooth((t - tl.scene('ultraviolet').start) / 1.2), range = [lerp(6.3, 2.92, z), lerp(2.3, 1.95, z)];
    strip(stage, t, {y0: 730}, {nm, range, lit: {uv: 1}, dim: 0.35, sub: z});
    const tp = Math.exp(-(((t - tl.at(W('s11', '커서'))) / 0.6) ** 2));
    readouts(stage, t, nm, 1, {tagPulse: tp});
  },

  // ------------------------------------------------------------------ scatter: blue sky, red sunset (1/λ⁴)
  scatter(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, m = M(ctx), tl = ctx.tl;
    const el = sunElev(t, tl), low = smooth((70 - el) / 69);
    // sky cross-section
    const cx = 540, cy = 2380, R = 1660, H = 190, yObs = cy - R;
    panel(c, T, 60, 318, 960, 470, 0.85);
    clipRect(c, 62, 320, 956, 466, 9, () => {
      const g = c.createRadialGradient(cx, cy, R, cx, cy, R + H);
      const sky = mix('#5E95D6', '#3E5D8A', low);
      g.addColorStop(0, rgba(sky, 0.55)); g.addColorStop(1, rgba(sky, 0.08));
      c.beginPath(); c.arc(cx, cy, R + H, 0, TAU); c.fillStyle = g; c.fill();
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = '#1C2B24'; c.fill();
      ring(c, cx, cy, R, rgba('#6F8B78', 1), 2);
      ring(c, cx, cy, R + H, rgba(T.muted, 0.5), 1.5, 0, TAU);
      // air molecules
      for (let i = 0; i < 140; i++) {
        const a = -Math.PI / 2 + (rand(i * 2 + 1) - 0.5) * 0.75, r = R + 8 + rand(i * 2 + 2) * (H - 14);
        circle(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2, rgba('#DDE6EA', 0.5));
      }
      // sun and its direct beam to the observer
      const ang = el * Math.PI / 180, dir = [Math.cos(ang), -Math.sin(ang)], far = Math.min(lerp(330, 470, low), (975 - cx) / Math.max(dir[0], 1e-3));
      const sx = cx + dir[0] * far, sy = yObs + dir[1] * far;
      if (low > 0.3) withAlpha(c, low, () => glow(c, 1010, yObs - 20, 420, '#FF8A3D', 0.35));
      const n = 40, path = [];
      for (let i = 0; i <= n; i++) path.push([lerp(sx, cx, i / n), lerp(sy, yObs - 6, i / n)]);
      // colour along the path from the transmitted fraction at 450 / 550 / 700 nm
      const mAir = airMass(el);
      for (let i = 1; i <= n; i++) {
        const [x0, y0] = path[i - 1], [x1, y1] = path[i];
        const r0 = Math.hypot(x0 - cx, y0 - cy); if (r0 > R + H) continue;
        const q = i / n, tr = lam => Math.exp(-tauR(lam) * mAir * q), ch = [tr(700), 0.94 * tr(550), 0.88 * tr(450)], mx = Math.max(...ch);
        const col = `rgb(${ch.map(v => Math.round(255 * v / mx)).join(',')})`;
        line(c, [[x0, y0], [x1, y1]], col, 6);
      }
      line(c, [[sx, sy], path.find(pp => Math.hypot(pp[0] - cx, pp[1] - cy) <= R + H) || path[n]], rgba('#FFF6E0', 0.9), 5);
      glow(c, sx, sy, 70, '#FFE9B0', 0.45); circle(c, sx, sy, 24, '#FFF1C8');
      // blue scattered sideways along the in-air path
      const k = Math.floor(t * 6);
      for (let j = 0; j < 9; j++) {
        const q = 0.15 + 0.8 * rand(k * 13 + j), pt = path[Math.round(q * n)];
        if (Math.hypot(pt[0] - cx, pt[1] - cy) > R + H) continue;
        const a2 = rand(k * 7 + j * 3) * TAU, len = 30;
        arrow(c, pt, [pt[0] + Math.cos(a2) * len, pt[1] + Math.sin(a2) * len], specCol(470, 0.95), 3, {head: 9});
      }
      // observer
      circle(c, cx, yObs - 14, 7, T.ink); line(c, [[cx, yObs - 7], [cx, yObs]], T.ink, 3);
    });
    stage.text(low < 0.5 ? '해가 높을 때 · 짧은 경로' : '해 질 녘 · 긴 경로', 90, 352, {size: 26, weight: 700, color: T.ink, shadow: '#000'});
    stage.text(low < 0.5 ? '흩어진 파란빛이 하늘을 채움' : '파랑은 도중에 흩어져 빠지고 빨강이 남음', 90, 388, {size: 24, color: T.light, shadow: '#000'});
    stage.text('관측자', 540, 760, {size: 24, color: T.muted, align: 'center', shadow: '#000'});
    // comparison boxes
    const boxes = [[70, 450, '파랑 450 nm', m.fBlue], [550, 700, '빨강 700 nm', m.fRed]];
    for (const [x0, lam, name, fl] of boxes) {
      rect(c, x0, 806, 460, 250, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
      stage.text(name, x0 + 230, 834, {size: 26, weight: 700, color: labCol(lam), align: 'center'});
      const yb = 950; line(c, [[x0 + 20, yb], [x0 + 440, yb]], specCol(lam, 0.9), 5);
      arrow(c, [x0 + 400, yb], [x0 + 444, yb], specCol(lam), 5, {head: 14});
      for (let i = 0; i < 26; i++) circle(c, x0 + 30 + rand(i * 5 + lam) * 400, 870 + rand(i * 5 + 2 + lam) * 160, 3, rgba('#DDE6EA', 0.55));
      for (const f of fl) {
        const age = t - f.t; if (age < 0 || age > 0.7) continue;
        const px = x0 + 40 + f.x * 380, a = 1 - age / 0.7, ang = f.y * TAU, r = 18 + 60 * age;
        circle(c, px, yb, 6, specCol(lam, a));
        arrow(c, [px, yb], [px + Math.cos(ang) * r, yb + Math.sin(ang) * r * 0.9], specCol(lam, a), 2.5, {head: 8});
      }
    }
    const ra = fadeIn(t, tl.at(A.blue) - 0.2, 0.4);
    withAlpha(c, ra, () => stage.text('흩어짐 ∝ 1/λ⁴ · (700/450)⁴ ≈ 5.9배', 540, 1084, {role: 'display', size: 32, weight: 700, color: T.light, align: 'center'}));
    // readouts: scattering strength + direct-beam transmission
    panel(c, T, 60, 1112, 960, 224);
    stage.text('흩어지는 세기 (빨강 = 1)', 290, 1144, {size: 24, color: T.muted, align: 'center'});
    stage.text(`곧장 오는 빛이 남는 비율 · 해 높이 ${fmt(el)}°`, 770, 1144, {size: 24, color: T.muted, align: 'center'});
    line(c, [[520, 1128], [520, 1320]], rgba(T.border, 1), 1.5);
    const bars = [[450, RATIO_BR, 1196], [700, 1, 1270]];
    for (const [lam, v, y] of bars) {
      stage.text(`${lam} nm`, 90, y, {size: 24, weight: 700, color: labCol(lam)});
      rect(c, 180, y - 14, 280 * v / RATIO_BR, 28, 4, specCol(lam, 0.9));
      stage.text(v === 1 ? '1' : sig(v, 2), 180 + 280 * v / RATIO_BR + 10, y, {role: 'display', size: 30, weight: 700, color: T.ink});
      const tr = Math.exp(-tauR(lam) * airMass(el)), pct = tr * 100;
      stage.text(`${lam} nm`, 560, y, {size: 24, weight: 700, color: labCol(lam)});
      rect(c, 650, y - 14, 260, 28, 4, rgba(T.border, 1));
      rect(c, 650, y - 14, 260 * tr, 28, 4, specCol(lam, 0.9));
      stage.text(pct >= 10 ? `${fmt(pct)}%` : pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`, 1000, y, {role: 'display', size: 28, weight: 700, color: T.ink, align: 'right'});
    }
  },

  // ------------------------------------------------------------------ animals: different windows
  animals(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const Bar = {x0: 90, x1: 990, hi: 4.9, lo: 2.3};
    panel(c, T, 60, 318, 960, 254, 0.85);
    const yBar = 464;
    specBar(c, Bar, yBar, 40, {dim: 0.45});
    barTicks(stage, Bar, yBar + 42, {every: 1});
    const on = (id, ref) => fadeIn(t, evT(ctx, id, ref) - 0.1, 0.35);
    const aH = on('ani_human', A.human), aB = on('ani_bee', A.bee), aV = on('ani_viper', A.viper);
    const br = (lo, hi, y, label, col, a) => withAlpha(c, a, () => {
      const xa = BX(Bar, lg(hi)), xb = BX(Bar, lg(lo));
      rect(c, xa, y - 6, xb - xa, 12, 3, rgba(col, 0.35), col, 2);
      line(c, [[xa, y + 6], [xa, yBar - 2]], rgba(col, 0.5), 1.2, {dash: [3, 4]}); line(c, [[xb, y + 6], [xb, yBar - 2]], rgba(col, 0.5), 1.2, {dash: [3, 4]});
      stage.text(label, clamp((xa + xb) / 2, 230, 850), y - 28, {size: 24, weight: 700, color: col, align: 'center'});
    });
    br(5000, 30000, 420, '살무사 · 약 10 μm', '#9CCFF0', aV);
    br(400, 700, 420, '사람 400–700', T.ink, aH);
    br(300, 650, 372, '꿀벌 300–650 nm', '#F2C14E', aB);
    withAlpha(c, aV, () => markerAt(c, BX(Bar, 4), yBar - 4, yBar + 44, 0.9, '#9CCFF0'));
    // three cards (strip order: long ← → short)
    const cards = [[70, aV], [390, aH], [710, aB]];
    cards.forEach(([x, a], i) => {
      rect(c, x, 600, 300, 660, 12, rgba(T.plate, 0.9), a > 0.5 ? T.light : rgba(T.border, 1), a > 0.5 ? 2.5 : 1.5);
      withAlpha(c, 0.3 + 0.7 * a, () => {
        if (i === 0) viperCard(stage, t, ctx, x);
        else if (i === 1) flowerCard(stage, t, ctx, x, false);
        else flowerCard(stage, t, ctx, x, true);
      });
    });
  },

  // ------------------------------------------------------------------ myth: names are places, not colours
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const Bar = {x0: 90, x1: 990, hi: 3.7, lo: 2.0}, yBar = 404;
    const X = n => BX(Bar, lg(n));
    panel(c, T, 60, 318, 960, 400, 0.85);
    specBar(c, Bar, yBar, 52, {dim: 0.55});
    for (const [n0, n1, nm] of [[700, 3981, '적외선'], [400, 700, '가시광선'], [178, 400, '자외선']]) stage.text(nm, (X(n0) + X(n1)) / 2, yBar - 30, {size: 26, weight: 700, color: nm === '가시광선' ? '#F4E6A0' : GREYW, align: 'center'});
    const ia = fadeIn(t, evT(ctx, 'myth_infra', A.infra) - 0.2, 0.4), ua = fadeIn(t, evT(ctx, 'myth_ultra', A.ultra) - 0.2, 0.4);
    const xi = (Bar.x0 + X(700)) / 2, xu = (X(400) + Bar.x1) / 2;
    withAlpha(c, 0.25 + 0.75 * ia, () => { arrow(c, [X(700) - 4, yBar + 72], [X(700) - 150, yBar + 72], T.light, 3, {head: 13}); stage.text('빨강 아래 · infra-red', xi, yBar + 106, {size: 24, weight: 700, color: T.light, align: 'center'}); });
    withAlpha(c, 0.25 + 0.75 * ua, () => { arrow(c, [X(400) + 4, yBar + 72], [X(400) + 150, yBar + 72], T.light, 3, {head: 13}); stage.text('보라 너머 · ultra-violet', xu, yBar + 106, {size: 24, weight: 700, color: T.light, align: 'center', maxWidth: Bar.x1 - X(400) + 30}); });
    // eye response on the same axis
    const ea = fadeIn(t, evT(ctx, 'myth_eye', A.noColour) - 0.2, 0.4);
    const yb = 700, hh = 120, pts = [];
    for (let x = Bar.x0; x <= Bar.x1; x += 3) { const n = 10 ** lerp(Bar.hi, Bar.lo, (x - Bar.x0) / (Bar.x1 - Bar.x0)); pts.push([x, yb - hh * (n >= 380 && n <= 780 ? photopic(n) : 0)]); }
    line(c, [[Bar.x0, yb], [Bar.x1, yb]], rgba(T.border, 1), 1.5);
    line(c, pts, mix(T.muted, T.ink, ea), 3);
    stage.text('눈의 반응', 540, yb - hh - 26, {size: 24, weight: 700, color: T.ink, align: 'center'});
    withAlpha(c, ea, () => { stage.text('0 · 아무 색도 아님', (X(700) + Bar.x0) / 2, yb - 24, {size: 24, weight: 700, color: T.light, align: 'center'}); stage.text('0', (X(400) + Bar.x1) / 2, yb - 24, {size: 24, weight: 700, color: T.light, align: 'center'}); });
    // myth rows
    const xa = evT(ctx, 'myth_x', A.notIt), xq = fadeIn(t, xa - 0.05, 0.25);
    const rows = [[790, '적외선 = 빨간빛?', A.myth], [920, '자외선 = 보라빛?', A.mythUV]];
    rows.forEach(([y, q, ref]) => {
      const a = fadeIn(t, tl.at(ref) - 0.2, 0.4);
      withAlpha(c, a, () => {
        rect(c, 70, y - 50, 460, 100, 10, rgba(T.plate, 0.92), xq > 0.5 ? rgba(T.down, 0.9) : rgba(T.border, 1), xq > 0.5 ? 2.5 : 1.5);
        stage.text(q, 280, y, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
        if (xq > 0) withAlpha(c, xq, () => crossMark(c, 486, y, 1.3, T.down));
        rect(c, 550, y - 50, 460, 100, 10, rgba(T.plate, 0.92), rgba(T.border, 1), 1.5);
        hatch(c, 572, y - 30, 70, 60, {col: rgba(HATCH_LN, 0.9)}); rect(c, 572, y - 30, 70, 60, 4, null, rgba(T.ink, 0.6), 1.2);
        withAlpha(c, 0.3 + 0.7 * ea, () => { stage.text('눈에는', 820, y - 18, {size: 26, color: T.muted, align: 'center'}); stage.text('아무 색도 아님', 820, y + 16, {size: 28, weight: 700, color: T.light, align: 'center'}); });
      });
    });
    // name decomposition
    const na = fadeIn(t, evT(ctx, 'myth_names', A.names) - 0.2, 0.4);
    withAlpha(c, na, () => {
      panel(c, T, 60, 1000, 960, 336, 0.92);
      const parts = [[1066, 'infra', '아래', 'red', '빨강', '빨강 아래 자리', ia], [1166, 'ultra', '너머', 'violet', '보라', '보라 너머 자리', ua]];
      for (const [y, p1, k1, p2, k2, res, q] of parts) withAlpha(c, 0.35 + 0.65 * q, () => {
        stage.text(p1, 150, y - 14, {role: 'display', size: 32, weight: 700, color: T.light, align: 'center'}); stage.text(k1, 150, y + 20, {size: 24, color: T.muted, align: 'center'});
        stage.text('+', 240, y, {size: 32, weight: 700, color: T.muted, align: 'center'});
        stage.text(p2, 340, y - 14, {role: 'display', size: 32, weight: 700, color: T.ink, align: 'center'}); stage.text(k2, 340, y + 20, {size: 24, color: T.muted, align: 'center'});
        arrow(c, [440, y], [520, y], T.muted, 3, {head: 12});
        stage.text(res, 760, y, {role: 'display', size: 34, weight: 700, color: T.light, align: 'center'});
      });
      stage.text('자리 이름이지, 색 이름이 아님', 540, 1272, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'});
    });
  },

  // ------------------------------------------------------------------ close
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    stage.text('정리', 540, 400, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, alpha: smooth(p / 0.15)});
    endCard(stage, {takeaway: '“전파에서 감마선까지\n모두 같은 파동,\n다른 것은 파장 하나”', lines: [], p, y: 600});
    const tG = evT(ctx, 'close_glide', A.glide), l = closeLg(t, tG);
    withAlpha(c, smooth((p - 0.05) / 0.12), () => {
      const S = strip(stage, t, {y0: 860, h: 150}, {dim: 0.55, nm: 10 ** l, markerA: 1 - 0.6 * smooth((t - tG - CLOSE_GLIDE - 0.6) / 0.5)});
      // what each window meets
      const ma = fadeIn(t, evT(ctx, 'close_meets', A.meets) - 0.2, 0.5);
      withAlpha(c, ma, () => {
        const segs = [[1e13, 700, '분자 진동·회전 · 열', TAGS[0].col], [700, 400, '보임', TAGS[1].col], [400, 124, '결합 끊김', TAGS[2].col], [124, 1e-4, '원자 이온화', TAGS[3].col]];
        const items = segs.map(([hi, lo, s]) => ({x: (clamp(BX(S.Bar, lg(hi)), 90, 990) + clamp(BX(S.Bar, lg(lo)), 90, 990)) / 2, w: stage.measure(s, {size: 24, weight: 700}) + 8}));
        const xs = relax(items, 12, 70, 1010);
        segs.forEach(([hi, lo, s, col], i) => {
          const xa = clamp(BX(S.Bar, lg(hi)), S.Bar.x0, S.Bar.x1), xb = clamp(BX(S.Bar, lg(lo)), S.Bar.x0, S.Bar.x1), yb = 1050;
          line(c, [[xa + 2, yb], [xb - 2, yb]], col, 4);
          line(c, [[(xa + xb) / 2, yb], [xs[i], yb + 22]], rgba(col, 0.7), 1.5);
          stage.text(s, xs[i], yb + 44, {size: 24, weight: 700, color: col, align: 'center'});
        });
        stage.text('파장이 정하는 상대', 540, 1150, {size: 26, color: T.muted, align: 'center'});
      });
    });
  },
};

// =====================================================================================================
// Scene parts
// =====================================================================================================
/** E (vertical, in plane) and B (depth, oblique) — travelling together */
function ebWave(stage, t, yTop, yBot) {
  const {ctx: c} = stage, T = stage.theme, yc = (yTop + yBot) / 2 + 34, A0 = 70, L = 260, ph = t * 0.9;
  const P = (x, y, z) => [x + z * 0.42, yc - y - z * 0.48];
  line(c, [P(100, 0, 0), P(950, 0, 0)], rgba(T.ink, 0.6), 2);
  arrow(c, P(900, 0, 0), P(990, 0, 0), T.ink, 2.5, {head: 14});
  const eP = [], bP = [];
  for (let x = 110; x <= 900; x += 4) { const v = Math.sin(TAU * (x / L - ph)); eP.push([x, v]); bP.push([x, v]); }
  // stems
  for (let i = 0; i < eP.length; i += 5) {
    const [x, v] = eP[i];
    line(c, [P(x, 0, 0), P(x, A0 * v, 0)], rgba('#FFE2C4', 0.35), 1.5);
    line(c, [P(x, 0, 0), P(x, 0, A0 * 0.9 * v)], rgba('#8AC0A0', 0.35), 1.5);
  }
  line(c, bP.map(([x, v]) => P(x, 0, A0 * 0.9 * v)), '#8AC0A0', 3.5);
  line(c, eP.map(([x, v]) => P(x, A0 * v, 0)), '#FFE2C4', 3.5);
  stage.text('전기의 떨림 E', 90, yTop + 14, {size: 26, weight: 700, color: '#FFE2C4'});
  stage.text('자기의 떨림 B', 90, yTop + 48, {size: 26, weight: 700, color: '#8AC0A0'});
  stage.text('서로 직각으로 함께 떨며', 990, yTop + 14, {size: 24, color: T.muted, align: 'right'});
  stage.text('빛의 속도 c로 나아감 →', 990, yTop + 48, {size: 24, color: T.ink, align: 'right'});
}

function moleculeWindow(stage, t, ctx, nm) {
  const {ctx: c} = stage, T = stage.theme, m = M(ctx), A0 = m.vibW(t), heat = m.heat(t);
  const yc = 520, L = screenLam(nm);
  stage.text(isVisible(nm) ? `보이는 빛 · ${colourName(nm)}` : '적외선 · 눈에 안 보임', 270, WIN.y0 + 36, {size: 26, weight: 700, color: isVisible(nm) ? specCol(nm) : GREYW, align: 'center'});
  clipRect(c, 80, yc - 80, 400, 160, 0, () => waveLine(c, 80, 470, yc, 46, L, t * WAVE_V / L, nm, {xg: 80, env: x => smooth((470 - x) / 30)}));
  arrow(c, [420, yc + 70], [480, yc + 70], rgba(T.muted, 0.9), 2.5, {head: 11});
  // H2O: bend + stretch
  const ox = 610, oy = yc, w1 = Math.sin(t * 13), w2 = Math.sin(t * 17 + 1);
  const ang = (104.5 + 16 * A0 * w1) * Math.PI / 180, bl = 86 + 12 * A0 * w2;
  if (A0 > 0.05) for (let k = 1; k <= 3; k++) ring(c, ox, oy, 90 + k * 22 + 6 * Math.sin(t * 5 + k), rgba(TAGS[0].col, 0.25 * A0 / k), 2);
  const hs = [-1, 1].map(s => [ox + s * Math.sin(ang / 2) * bl, oy + Math.cos(ang / 2) * bl]);
  for (const [hx, hy] of hs) { line(c, [[ox, oy], [hx, hy]], rgba('#DDE6EA', 0.9), 7); }
  circle(c, ox, oy, 36, '#8EA9B8'); ring(c, ox, oy, 36, '#DDE6EA', 2); stage.text('O', ox, oy + 1, {size: 30, weight: 700, color: '#0B1A20', align: 'center'});
  for (const [hx, hy] of hs) { circle(c, hx, hy, 21, '#E9EEF0'); stage.text('H', hx, hy + 1, {size: 24, weight: 700, color: '#0B1A20', align: 'center'}); }
  stage.text('물 분자 H₂O', ox, WIN.y0 + 36, {size: 26, weight: 700, color: T.ink, align: 'center'});
  stage.text(A0 > 0.35 ? '흔들림 커짐 → 열' : '거의 흔들리지 않음', ox, WIN.y0 + WIN.h - 34, {size: 26, weight: 700, color: A0 > 0.35 ? TAGS[0].col : T.muted, align: 'center'});
  // thermometer
  thermo(stage, 880, WIN.y0 + 70, 230, 0.15 + 0.8 * heat, 1, heat > 0.5);
  stage.text('온도', 880, WIN.y0 + 40, {size: 26, weight: 700, color: T.ink, align: 'center'});
}
function irCards(stage, t, ctx, nm) {
  const {ctx: c} = stage, T = stage.theme, m = M(ctx);
  const on = (id, ref) => fadeIn(t, evT(ctx, id, ref) - 0.1, 0.35);
  const cards = [
    {x: 70, a: on('ir_co2', A.co2), sel: Math.abs(lg(nm / NM_CO2)) < 0.03, t1: '이산화탄소', t2: '15 μm 흡수', t3: '지구의 열을 붙잡음'},
    {x: 390, a: on('ir_body', A.body), sel: Math.abs(lg(nm / NM_BODY)) < 0.03 || Math.abs(lg(nm / 1e4)) < 0.03, t1: '체온 36 °C의 몸', t2: '봉우리 약 9.4 μm', t3: ''},
    {x: 710, a: on('ir_remote', A.remote), sel: Math.abs(lg(nm / NM_REMOTE)) < 0.03, t1: '리모컨', t2: '940 nm', t3: '눈에 안 보이는 신호'},
  ];
  const camA = on('ir_camera', A.camera);
  cards.forEach((cd, i) => {
    const {x} = cd, cx = x + 150;
    rect(c, x, WIN.y0 + 12, 300, WIN.h - 24, 10, rgba(T.deep, 0.7), cd.sel ? T.light : rgba(T.border, 1), cd.sel ? 2.5 : 1.5);
    withAlpha(c, 0.3 + 0.7 * cd.a, () => {
      stage.text(cd.t1, cx, WIN.y0 + 44, {size: 26, weight: 700, color: T.ink, align: 'center'});
      const yI = WIN.y0 + 180;
      if (i === 0) co2Icon(stage, cx, yI, m.vibC(t), t);
      else if (i === 1) bodyIcon(stage, cx, yI, t, camA);
      else remoteIcon(stage, cx, yI, t, cd.sel ? 1 : 0.4);
      stage.text(cd.t2, cx, WIN.y0 + 318, {role: 'display', size: 30, weight: 700, color: cd.sel ? T.light : T.ink, align: 'center'});
      const t3 = i === 1 ? (camA > 0.5 ? '열화상 카메라가 봄' : '') : cd.t3;
      if (t3) stage.text(t3, cx, WIN.y0 + 356, {size: 24, color: T.muted, align: 'center'});
    });
  });
}
function co2Icon(stage, x, y, amp, t) {
  const {ctx: c} = stage, b = Math.sin(t * 12) * 18 * amp;
  const atoms = [[x - 78, y + b * 0.6, 26, 'O'], [x, y - b, 22, 'C'], [x + 78, y + b * 0.6, 26, 'O']];
  if (amp > 0.05) for (let k = 1; k <= 3; k++) ring(c, x, y, 70 + k * 16, rgba(TAGS[0].col, 0.25 * amp / k), 2);
  for (const dy of [-6, 6]) { line(c, [[atoms[0][0], atoms[0][1] + dy], [atoms[1][0], atoms[1][1] + dy]], '#DDE6EA', 3.5); line(c, [[atoms[1][0], atoms[1][1] + dy], [atoms[2][0], atoms[2][1] + dy]], '#DDE6EA', 3.5); }
  for (const [ax, ay, r, s] of atoms) { circle(c, ax, ay, r, s === 'O' ? '#8EA9B8' : '#5E6E74'); ring(c, ax, ay, r, '#DDE6EA', 2); stage.text(s, ax, ay + 1, {size: 24, weight: 700, color: s === 'O' ? '#0B1A20' : '#F2F2F2', align: 'center'}); }
  stage.text(amp > 0.4 ? '흔들림 · 흡수' : '', x, y + 88, {size: 24, weight: 700, color: TAGS[0].col, align: 'center'});
}
function bodyIcon(stage, x, y, t, cam) {
  const {ctx: c} = stage;
  // white-hot greyscale thermal look
  c.save(); c.beginPath(); c.rect(x - 110, y - 100, 220, 200); c.clip();
  c.fillStyle = '#0B0F10'; c.fillRect(x - 110, y - 100, 220, 200);
  glow(c, x, y + 10, 120, '#FFFFFF', 0.28);
  circle(c, x, y - 34, 34, '#E6E6E6'); circle(c, x, y - 34, 22, '#FFFFFF');
  poly(c, [[x - 80, y + 100], [x - 66, y + 20], [x - 30, y + 4], [x + 30, y + 4], [x + 66, y + 20], [x + 80, y + 100]], '#C8C8C8');
  poly(c, [[x - 40, y + 100], [x - 30, y + 30], [x + 30, y + 30], [x + 40, y + 100]], '#EDEDED');
  c.restore();
  withAlpha(c, cam, () => {
    const s = 22, x0 = x - 118, x1 = x + 118, y0 = y - 108, y1 = y + 108, col = '#FFE2C4';
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) line(c, [[cx + dx * s, cy], [cx, cy], [cx, cy + dy * s]], col, 3);
    circle(c, x1 - 14, y0 + 14, 5, '#FF5A3A');
  });
}
function remoteIcon(stage, x, y, t, emit) {
  const {ctx: c} = stage, T = stage.theme;
  rect(c, x - 34, y - 60, 68, 160, 16, '#2B3438', rgba('#9AA9AE', 1), 2);
  circle(c, x, y - 70, 8, '#4A5458'); ring(c, x, y - 70, 8, '#9AA9AE', 1.5);
  for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) circle(c, x + k * 18, y - 20 + r * 26, 7, '#55636A');
  withAlpha(c, emit, () => { for (let k = 0; k < 3; k++) { const q = (t * 1.2 + k / 3) % 1; ring(c, x, y - 70, 14 + q * 40, rgba(GREYW, 0.8 * (1 - q)), 2, -Math.PI * 0.8, -Math.PI * 0.2); } });
  void T;
}

function dnaWindow(stage, t, ctx, nm) {
  const {ctx: c} = stage, T = stage.theme, E = eV(nm);
  const tSnap = evT(ctx, 'uv_snap', A.snap), sn = smooth((t - tSnap) / 0.35), tD = evT(ctx, 'uv_dna', A.dna);
  const yc = 548, amp = 70, P = 380, x0 = 170, x1 = 910, target = 13;
  // threshold comparison line
  const ok = E >= 3.3;
  stage.text(`알갱이 에너지 ${fmtE(E)}  ${ok ? '>' : '<'}  분자 결합 에너지 약 3~5 eV`, 540, WIN.y0 + 34, {size: 26, weight: 700, color: ok ? TAGS[2].col : T.ink, align: 'center'});
  // rungs, back strand, front strand (depth by cos)
  const y1 = x => yc - amp * Math.sin(TAU * (x - x0) / P), y2 = x => yc + amp * Math.sin(TAU * (x - x0) / P);
  const nR = 22;
  for (let i = 0; i < nR; i++) {
    const x = x0 + 18 + i * (x1 - x0 - 36) / (nR - 1), ya = y1(x), yb = y2(x), mid = (ya + yb) / 2;
    if (Math.abs(ya - yb) < 6) continue;
    const isT = i === target, col = isT ? '#E8D8B8' : rgba('#9DB1B8', 0.85);
    if (isT && sn > 0) {
      const g = 10 * sn;
      line(c, [[x, ya], [x, mid - g]], TAGS[2].col, 5); line(c, [[x, mid + g], [x, yb]], TAGS[2].col, 5);
      const f = ctx.events.has('uv_snap') ? ctx.events.pulse('uv_snap', t, 0.8) : 0;
      if (f > 0) { glow(c, x, mid, 60, '#FFFFFF', 0.6 * f); for (let k = 0; k < 8; k++) { const a = k * TAU / 8; line(c, [[x + Math.cos(a) * 14, mid + Math.sin(a) * 14], [x + Math.cos(a) * (24 + 30 * (1 - f)), mid + Math.sin(a) * (24 + 30 * (1 - f))]], rgba('#FFFFFF', f), 2.5); } }
    } else { line(c, [[x, ya], [x, mid]], col, 5); line(c, [[x, mid], [x, yb]], isT ? '#C9B98F' : rgba('#7F959C', 0.85), 5); }
  }
  for (const [f, col] of [[y1, '#C9D6DC'], [y2, '#8FA7B0']]) { const pts = []; for (let x = x0; x <= x1; x += 4) pts.push([x, f(x)]); line(c, pts, rgba('#000', 0.4), 11); line(c, pts, col, 7); }
  const xt = x0 + 18 + target * (x1 - x0 - 36) / (nR - 1), yt = (y1(xt) + y2(xt)) / 2;
  // incoming UV (grey dashed): from upper left to the target rung
  const tOn = evT(ctx, 'uv_bond', A.bond) - 2.4, wa = fadeIn(t, tOn, 0.5) * (1 - smooth((t - tSnap - 0.6) / 0.6));
  withAlpha(c, wa, () => {
    const sx = 140, sy = WIN.y0 + 92, ang = Math.atan2(yt - sy, xt - sx), len = Math.hypot(xt - sx, yt - sy) - 30;
    const front = clamp((t - tOn) / (tSnap - tOn)) * len;
    c.save(); c.translate(sx, sy); c.rotate(ang);
    const Lp = screenLam(nm) * 0.5, pts = [];
    for (let s = Math.max(0, front - 300); s <= front; s += 3) pts.push([s, -14 * Math.cos(TAU * (s / Lp - t * 3))]);
    if (pts.length > 1) line(c, pts, rgba(GREYW, 0.95), 3, {dash: [9, 6]});
    c.restore();
    stage.text('자외선 · 안 보임', sx + 10, sy - 30, {size: 24, weight: 700, color: GREYW});
  });
  withAlpha(c, sn, () => {
    stage.text('결합 끊김', xt + 150, yt - 116, {size: 28, weight: 700, color: TAGS[2].col, align: 'center', shadow: '#000'});
    line(c, [[xt + 120, yt - 98], [xt + 8, yt - 12]], rgba(TAGS[2].col, 0.9), 2);
  });
  withAlpha(c, fadeIn(t, tD - 0.1, 0.4), () => stage.text('DNA 손상 → 피부가 탐', 540, WIN.y0 + WIN.h - 30, {size: 26, weight: 700, color: T.ink, align: 'center'}));
  stage.text('DNA (개략)', 230, WIN.y0 + WIN.h - 30, {size: 24, color: T.muted, align: 'center', alpha: 1 - fadeIn(t, tD - 0.1, 0.4)});
}
function ozoneWindow(stage, t, ctx, nm) {
  const {ctx: c} = stage, T = stage.theme;
  const x0 = 290, x1 = 990, yTop = WIN.y0 + 92, yO0 = WIN.y0 + 150, yO1 = WIN.y0 + 216, yG = WIN.y0 + 300, ySk = WIN.y0 + 384;
  const sub = uvSubOf(nm), oz = ctx.events.has('uv_ozone') ? ctx.events.pulse('uv_ozone', t, 1.2) : 0;
  // layers
  rect(c, x0, yTop, x1 - x0, yG - yTop, 0, rgba('#1A3346', 0.6));
  rect(c, x0, yO0, x1 - x0, yO1 - yO0, 0, rgba('#5E8FA8', 0.32 + 0.3 * oz), rgba('#9CCFF0', 0.7), 1.2);
  stage.text('성층권 오존층', x0 - 14, (yO0 + yO1) / 2 - 14, {size: 24, weight: 700, color: '#9CCFF0', align: 'right'});
  stage.text('약 15–35 km', x0 - 14, (yO0 + yO1) / 2 + 14, {size: 24, color: T.muted, align: 'right'});
  // skin cross-section
  rect(c, x0, yG, x1 - x0, 30, 0, '#C9A68E'); rect(c, x0, yG + 30, x1 - x0, ySk - yG - 34, 0, '#8E6556');
  stage.text('표피', x0 - 14, yG + 15, {size: 24, color: T.muted, align: 'right'}); stage.text('진피', x0 - 14, yG + 56, {size: 24, color: T.muted, align: 'right'});
  // three arrows (hatched = invisible)
  const cols = [['UVC', '100–280 nm', 420, yO0 - 22, '산소·오존이 흡수'], ['UVB', '280–315 nm', 640, yG + 22, '대부분 흡수'], ['UVA', '315–400 nm', 860, yG + 62, '대부분 통과']];
  const grow = q => q;
  cols.forEach(([nmName, rngTxt, x, yEnd, res], i) => {
    const sel = sub && sub.name === nmName, w0 = 30;
    const yS = yTop - 34;
    const wAt = y => (i === 0 ? w0 : i === 1 ? (y < yO0 ? w0 : y < yO1 ? lerp(w0, 8, (y - yO0) / (yO1 - yO0)) : 8) : y < yO0 ? w0 : y < yO1 ? lerp(w0, 24, (y - yO0) / (yO1 - yO0)) : 24);
    const yE = yEnd;
    for (let y = yS; y < yE; y += 4) hatch(c, x - wAt(y) / 2, y, wAt(y), 4.5, {col: rgba(HATCH_LN, sel ? 1 : 0.7), bg: sel ? '#2A3E46' : HATCH_BG});
    poly(c, [[x - wAt(yE) / 2 - 8, yE - 2], [x + wAt(yE) / 2 + 8, yE - 2], [x, yE + 16]], sel ? T.light : rgba(HATCH_LN, 0.9));
    if (i === 0) { const f = 0.5 + 0.5 * Math.sin(t * 6); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; line(c, [[x + Math.cos(a) * 22, yE + 6 + Math.sin(a) * 12], [x + Math.cos(a) * (30 + 6 * f), yE + 6 + Math.sin(a) * (16 + 3 * f)]], rgba('#9CCFF0', 0.9), 2); } }
    stage.text(nmName, x, yS - 44, {role: 'display', size: 28, weight: 700, color: sel ? T.light : T.ink, align: 'center'});
    stage.text(rngTxt, x, yS - 16, {size: 24, color: T.muted, align: 'center'});
    stage.text(res, i === 0 ? x - 40 : x, i === 0 ? yE - 2 : (yO1 + yG) / 2, {size: 24, weight: 700, color: sel ? T.light : T.ink, align: i === 0 ? 'right' : 'center', shadow: '#000'});
    if (sel) ring(c, x, yS - 44, 34, rgba(T.light, 0.0), 1);
  });
  void grow;
  const va = fadeIn(t, evT(ctx, 'uv_vitd', A.vitd) - 0.1, 0.4), ba = fadeIn(t, evT(ctx, 'uv_burn', A.burn) - 0.1, 0.4);
  withAlpha(c, va, () => { stage.text('비타민 D', 540, yG + 15, {size: 24, weight: 700, color: '#1A1410', align: 'center'}); });
  withAlpha(c, ba, () => { stage.text('일광화상', 740, yG + 56, {size: 24, weight: 700, color: '#FFE9DA', align: 'center'}); });
}

function flowerCard(stage, t, ctx, x, bee) {
  const {ctx: c} = stage, T = stage.theme, cx = x + 150, cy = 820;
  const reveal = bee ? fadeIn(t, evT(ctx, 'ani_pattern', A.pattern) - 0.2, 0.8) : 0;
  stage.text(bee ? '꿀벌의 눈' : '사람의 눈', cx, 636, {size: 28, weight: 700, color: T.ink, align: 'center'});
  stage.text(bee ? '자외선까지 봄' : '가시광선만 봄', cx, 670, {size: 24, color: T.muted, align: 'center'});
  // flower: bee view = greyscale "UV photo" with a dark nectar guide
  const petal = bee ? mix('#E8D46A', '#D8D8D8', reveal) : '#E8D46A', centre = bee ? mix('#B8962E', '#3A3A3A', reveal) : '#B8962E';
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8 + 0.2, px = cx + Math.cos(a) * 66, py = cy + Math.sin(a) * 66;
    c.save(); c.translate(px, py); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 58, 30, 0, 0, TAU); c.fillStyle = petal; c.fill(); c.strokeStyle = rgba('#000', 0.35); c.lineWidth = 1.5; c.stroke(); c.restore();
  }
  if (bee && reveal > 0) withAlpha(c, reveal, () => {
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + 0.2; c.save(); c.translate(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); c.rotate(a); c.beginPath(); c.ellipse(0, 0, 32, 15, 0, 0, TAU); c.fillStyle = '#4A4A4A'; c.fill(); c.restore(); }
  });
  circle(c, cx, cy, 30, centre);
  if (bee) withAlpha(c, reveal, () => {
    stage.text('숨은 꿀 안내 무늬', cx, 960, {size: 26, weight: 700, color: T.light, align: 'center'});
    stage.text('(자외선 사진처럼 흑백)', cx, 994, {size: 24, color: T.muted, align: 'center'});
  });
  else stage.text('무늬 없는 노란 꽃', cx, 960, {size: 26, weight: 700, color: T.ink, align: 'center'});
  // eye window bars
  const yb = 1080, bx0 = x + 30, bx1 = x + 270, lo = 280, hi = 720, X = n => bx0 + (hi - n) / (hi - lo) * (bx1 - bx0);
  hatch(c, bx0, yb, bx1 - bx0, 26, {col: rgba(HATCH_LN, 0.7)});
  for (let xx = X(700); xx < X(400); xx++) { c.fillStyle = specCol(700 - 300 * (xx - X(700)) / (X(400) - X(700))); c.fillRect(xx, yb, 1.4, 26); }
  rect(c, bx0, yb, bx1 - bx0, 26, 0, null, rgba(T.ink, 0.5), 1.2);
  const [w0, w1] = bee ? [650, 300] : [700, 400];
  rect(c, X(w0), yb - 6, X(w1) - X(w0), 38, 4, null, bee ? '#F2C14E' : T.ink, 3);
  stage.text('700', X(700), yb + 50, {size: 24, color: T.muted, align: 'center'}); stage.text('400', X(400), yb + 50, {size: 24, color: T.muted, align: 'center'});
  stage.text(bee ? '300–650 nm' : '400–700 nm', cx, 1170, {role: 'display', size: 30, weight: 700, color: bee ? '#F2C14E' : T.ink, align: 'center'});
  stage.text(bee ? '빨강은 잘 못 봄' : '자외선·적외선은 못 봄', cx, 1210, {size: 24, color: T.muted, align: 'center'});
}
function viperCard(stage, t, ctx, x) {
  const {ctx: c} = stage, T = stage.theme, cx = x + 150, wa = fadeIn(t, evT(ctx, 'ani_warmth', A.warmth) - 0.3, 0.6);
  stage.text('살무사의 피트 기관', cx, 636, {size: 28, weight: 700, color: T.ink, align: 'center'});
  stage.text('적외선을 열로 느낌', cx, 670, {size: 24, color: T.muted, align: 'center'});
  // dark field with a warm mouse (white-hot greyscale)
  c.save(); c.beginPath(); c.rect(x + 20, 700, 260, 240); c.clip();
  c.fillStyle = '#070A0B'; c.fillRect(x + 20, 700, 260, 240);
  const mx = cx + 10 * Math.sin(t * 0.8), my = 846;
  glow(c, mx, my, 110, '#FFFFFF', 0.25 * wa + 0.05);
  withAlpha(c, 0.25 + 0.75 * wa, () => {
    c.beginPath(); c.ellipse(mx, my, 50, 30, 0, 0, TAU); c.fillStyle = '#E8E8E8'; c.fill();
    circle(c, mx + 48, my - 12, 20, '#F4F4F4'); circle(c, mx + 46, my - 32, 9, '#D0D0D0');
    line(c, [[mx - 48, my + 6], [mx - 80, my + 22], [mx - 100, my + 12]], '#9A9A9A', 3);
  });
  c.restore();
  stage.text('어둠 속 온기', cx, 960, {size: 26, weight: 700, color: T.light, align: 'center', alpha: 0.4 + 0.6 * wa});
  stage.text('(열 그림 · 흑백)', cx, 994, {size: 24, color: T.muted, align: 'center'});
  // snake head with the pit marked
  const hy = 1104;
  poly(c, [[cx - 110, hy + 10], [cx - 40, hy - 34], [cx + 60, hy - 26], [cx + 112, hy + 2], [cx + 60, hy + 30], [cx - 40, hy + 36]], '#3C4A42', '#7F9488', 2);
  circle(c, cx + 34, hy - 10, 7, '#0B0F0C'); circle(c, cx + 80, hy + 4, 5, '#0B0F0C');
  ring(c, cx + 80, hy + 4, 14, '#9CCFF0', 2.5);
  line(c, [[cx + 80, hy - 10], [cx + 80, hy - 38]], rgba('#9CCFF0', 0.9), 1.5);
  stage.text('피트 기관', cx + 70, hy - 54, {size: 24, weight: 700, color: '#9CCFF0', align: 'center'});
  stage.text('약 10 μm', cx, 1170, {role: 'display', size: 30, weight: 700, color: '#9CCFF0', align: 'center'});
  stage.text('눈이 아닌 열 감각', cx, 1210, {size: 24, color: T.muted, align: 'center'});
}

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, tl = ctx.tl;
  let [kicker, title] = titles[id] || ['', ''];
  if (id === 'essence' && t >= tl.at('s06') - 0.3) [kicker, title] = ['본질 · c = λ × f, E = hc / λ', '짧을수록 더 자주, 더 세게'];
  if (id === 'infrared' && t >= tl.at('s10') - 0.3) [kicker, title] = ['적외선이 일하는 곳', '체온 · 리모컨 · 이산화탄소'];
  if (id === 'ultraviolet' && t >= tl.at('s12') - 0.3) [kicker, title] = ['대기의 방패', '오존이 막는 자외선'];
  if (title || kicker) head(stage, kicker, title, ctx.scene.p);
  progressBar(stage, t, tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// =====================================================================================================
export function soundEvents(tl) {
  const m = model(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const at = ref => tl.at(ref);
  // wavelength → pitch, essence start → ultraviolet end; amplitude = marker speed (log λ per second)
  const t0 = tl.scene('essence').start, t1 = tl.scene('ultraviolet').end, dt = 0.05, raw = [];
  for (let tt = t0; tt <= t1 + 1e-6; tt += dt) raw.push([tt, m.lam(tt), Math.abs(lg(m.lam(tt + 0.025)) - lg(m.lam(tt - 0.025))) / 0.05]);
  let env = 0; const pts = [];
  raw.forEach(([tt, nm, sp], i) => {
    const target = Math.min(1, (sp / 0.12) ** 0.6), k = target > env ? 0.45 : 0.22;
    env += (target - env) * k;
    const edge = smooth((tt - t0) / 0.3) * smooth((t1 - tt) / 0.3);
    if (i % 2 === 0 || i === raw.length - 1) pts.push([r(tt - t0), r(pitchHz(nm), 2), r(env * edge, 4)]);
  });
  ev.push({id: 'lam_tone', at: 'essence', kind: 'chirp', params: {gain_db: -30, harmonics: [1, 0.25], fade: 0.05, points: pts},
    model: {n: m.keys.length, t_last_key: r(m.keys[m.keys.length - 2][0], 4), crests: m.crests.length, map: 'f = 110·2^(0.8·(6 − log10 λ_nm)) Hz; amp = marker speed'},
    means: '파장 → 음높이(로그 대응, 1 mm = 110 Hz, 10 nm = 1760 Hz). 표식이 움직일 때만 들림. 빛의 소리가 아닌 대응'});
  // crest ticks in essence: one tick per crest passing the gate
  const c0 = m.crests[0];
  ev.push({id: 'ess_crests', at: r(c0, 4), kind: 'custom', params: {gain_db: -27, layers: m.crests.map(tt => ({kind: 'tick', offset: r(tt - c0, 4), params: {freq: 1500, decay: 0.03, click: 0.4}}))},
    means: '마루가 관측점을 지날 때마다 틱 — 파장이 짧아질수록 촘촘해짐(그림 속 마루 수와 같음)'});
  // hook / origin / essence moments
  ev.push({id: 'answer', at: A.answer, kind: 'tone', params: {freq: 330, glide_to: 495, dur: 0.9, harmonics: [1, 0.3], gain_db: -28}, means: '훅의 답: 빨강 바깥 온도계가 오르기 시작'});
  ev.push({id: 'herschel', at: A.herschel, kind: 'silent', means: '1800 허셜 라벨'});
  ev.push({id: 'ir_word', at: A.irWord, kind: 'silent', means: '“적외선” 이름표'});
  ev.push({id: 'ritter', at: A.ritter, kind: 'noise', params: {dur: 0.6, low: 300, high: 1400, attack: 0.05, release: 0.4, gain_db: -34}, means: '염화은 종이가 검어지기 시작'});
  ev.push({id: 'uv_word', at: A.uvWord, kind: 'silent', means: '“자외선” 이름표'});
  ev.push({id: 'crest1', at: A.crest1, kind: 'tick', params: {freq: 1200, decay: 0.08, gain_db: -24}, means: '첫 번째 마루 표시'});
  ev.push({id: 'crest2', at: A.crest2, kind: 'tick', params: {freq: 1200, decay: 0.08, gain_db: -24}, means: '다음 마루 표시 → 그 사이가 파장'});
  ev.push({id: 'maxwell', at: A.maxwell, kind: 'tone', params: {freq: 392, dur: 0.5, harmonics: [1, 0.3], gain_db: -28}, means: '1865 맥스웰: 전기·자기 떨림 그림이 나타남'});
  ev.push({id: 'narrow', at: A.narrow, kind: 'tick', params: {freq: 880, decay: 0.1, gain_db: -26}, means: '스펙트럼 띠의 좁은 가시광선 구간 표시'});
  [['ess_b1', A.b1, pitchHz(1e9)], ['ess_b2', A.b2, pitchHz(1e4)], ['ess_b3', A.b3, pitchHz(550)], ['ess_b4', A.b4, pitchHz(100)], ['ess_b5', A.b5, pitchHz(10)]].forEach(([id, ref, f]) =>
    ev.push({id, at: ref, kind: 'tone', params: {freq: r(clamp(f, 80, 2400), 1), dur: 0.32, harmonics: [1, 0.25], gain_db: -30}, means: '띠의 한 구간이 켜짐 — 음높이 = 그 구간의 파장(짧을수록 높음)'}));
  ev.push({id: 'ess_all', at: A.all, kind: 'swell', params: {freqs: [220, 330, 440], dur: 1.4, gain_db: -32}, means: '모든 구간이 함께 켜짐 (모두 같은 파동)'});
  ev.push({id: 'ess_diff', at: A.diff, kind: 'silent', means: '각 줄에 마루 간격(λ) 표시'});
  ev.push({id: 'ess_speed', at: A.speed, kind: 'silent', means: 'c 표시가 밝아짐'});
  ev.push({id: 'ess_often', at: A.often, kind: 'silent', means: '마루 계수기 강조'});
  // visible
  for (const [id, ref] of [['vis_hair', A.hair], ['vis_red', A.red], ['vis_violet', A.violet], ['vis_cells', A.cells]]) ev.push({id, at: ref, kind: 'silent', means: '가시광선 장면의 라벨 전환'});
  // infrared: hum = molecule vibration (water in s09, CO₂ in s10)
  const ir = tl.scene('infrared'), hp = [];
  for (let tt = ir.start; tt <= ir.end + 1e-6; tt += 0.05) hp.push([r(tt - ir.start), 78, r(Math.max(m.vibW(tt), 0.8 * m.vibC(tt)), 4)]);
  ev.push({id: 'ir_hum', at: 'infrared', kind: 'chirp', params: {gain_db: -27, harmonics: [1, 0.7, 0.45, 0.25], fade: 0.05, points: hp},
    means: '분자가 흔들리는 세기 = 낮은 웅웅 소리 세기 (물 분자 s09, 이산화탄소 s10)'});
  [['ir_body', A.body, pitchHz(NM_BODY)], ['ir_remote', A.remote, pitchHz(NM_REMOTE)], ['ir_camera', A.camera, null], ['ir_co2', A.co2, pitchHz(NM_CO2)]].forEach(([id, ref, f]) =>
    ev.push(f ? {id, at: ref, kind: 'tick', params: {freq: r(f, 1), decay: 0.12, gain_db: -26}, means: '적외선 사용처 카드가 켜짐 (음높이 = 그 파장)'} : {id, at: ref, kind: 'silent', means: '열화상 카메라 틀'}));
  // ultraviolet
  ev.push({id: 'ir_shake', at: A.shake, kind: 'silent', means: '물 분자가 크게 흔들림(스틸 확인용 표식)'});
  ev.push({id: 'uv_bond', at: A.bond, kind: 'silent', means: '자외선 알갱이가 DNA로 다가감'});
  ev.push({id: 'uv_snap', at: A.snap, kind: 'custom', params: {gain_db: -18, layers: [{kind: 'tick', params: {freq: 2600, decay: 0.03, click: 0.8}}, {kind: 'noise', offset: 0.004, params: {dur: 0.09, low: 2000, high: 7000, attack: 0.001, release: 0.08, gain_db: -6}}]},
    means: 'DNA의 결합 하나가 끊어지는 순간 (짧은 끊김 소리)'});
  ev.push({id: 'uv_dna', at: A.dna, kind: 'silent', means: 'DNA 손상 라벨'});
  ev.push({id: 'uv_ozone', at: A.ozone, kind: 'noise', params: {dur: 1.0, low: 200, high: 900, attack: 0.2, release: 0.6, gain_db: -32}, means: '오존층이 자외선을 흡수(층이 밝아짐)'});
  ev.push({id: 'uv_vitd', at: A.vitd, kind: 'silent', means: '비타민 D 라벨'});
  ev.push({id: 'uv_burn', at: A.burn, kind: 'silent', means: '일광화상 라벨'});
  // scatter: dense soft ticks (450 nm) then sparse (700 nm), the same flash times as the picture
  const Wd = scatterWindows(tl), sub = (list, [a, b]) => list.filter(f => f.t >= a && f.t <= b).map(f => f.t);
  const bl = sub(m.fBlue, Wd.blue), rd = sub(m.fRed, Wd.red);
  ev.push({id: 'scat_blue', at: r(bl[0], 4), kind: 'custom', params: {gain_db: -25, layers: bl.map(tt => ({kind: 'tick', offset: r(tt - bl[0], 4), params: {freq: 2400, decay: 0.025, click: 0.2}}))},
    means: `450 nm가 흩어지는 순간(화면의 파란 번쩍임과 같은 시각) — ${bl.length}번`});
  ev.push({id: 'scat_red', at: r(rd[0], 4), kind: 'custom', params: {gain_db: -23, layers: rd.map(tt => ({kind: 'tick', offset: r(tt - rd[0], 4), params: {freq: 900, decay: 0.05, click: 0.2}}))},
    means: `700 nm가 흩어지는 순간 — ${rd.length}번 (같은 시간 동안 약 1/5.9)`});
  ev.push({id: 'scat_sunset', at: {...A.sunset, offset: 1.6}, kind: 'silent', means: '해가 지평선 가까이 내려옴'});
  // animals
  [['ani_human', A.human, pitchHz(Math.sqrt(400 * 700))], ['ani_bee', A.bee, pitchHz(Math.sqrt(300 * 650))], ['ani_viper', A.viper, pitchHz(1e4)]].forEach(([id, ref, f]) =>
    ev.push({id, at: ref, kind: 'tone', params: {freq: r(f, 1), dur: 0.7, harmonics: [1, 0.3], gain_db: -26}, means: '보는 구간의 가운데 파장을 음높이로 (사람 529 nm · 꿀벌 442 nm · 살무사 10 μm)'}));
  ev.push({id: 'ani_pattern', at: A.pattern, kind: 'silent', means: '꽃의 자외선 무늬가 드러남'});
  ev.push({id: 'ani_warmth', at: A.warmth, kind: 'silent', means: '쥐의 온기가 밝아짐'});
  // myth
  ev.push({id: 'myth_x', at: A.notIt, kind: 'tick', params: {freq: 520, decay: 0.1, gain_db: -22, repeat: 2, interval: 0.12}, means: '두 오해에 ✗'});
  for (const [id, ref] of [['myth_eye', A.noColour], ['myth_names', A.names], ['myth_infra', A.infra], ['myth_ultra', A.ultra]]) ev.push({id, at: ref, kind: 'silent', means: '오해 장면 라벨'});
  // close glide: 1 km → 1 pm (own compressed map 110 → 1760 Hz)
  const tg = at(A.glide), gp = [];
  for (let u = 0; u <= CLOSE_GLIDE + 0.4001; u += 0.05) gp.push([r(u), r(closePitch(closeLg(tg + u, tg)), 2), r(smooth(u / 0.15) * (1 - smooth((u - CLOSE_GLIDE) / 0.35)), 4)]);
  ev.push({id: 'close_glide', at: A.glide, kind: 'chirp', params: {gain_db: -27, harmonics: [1, 0.25], fade: 0.05, points: gp},
    means: '정리: 표식이 띠 끝에서 끝까지(1 km → 1 pm) 미끄러짐 — 음높이도 함께 오름(110 → 1760 Hz, 띠 전체를 압축한 대응)'});
  ev.push({id: 'close_meets', at: A.meets, kind: 'silent', means: '구간별 상대 라벨'});
  return ev;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(here), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(here, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님, 빛의 소리 아님). 배경음악 없음(사용자 결정). 모든 사건과 표(파장 → 음높이, 마루 틱, 분자 진동 웅웅, DNA 끊김, 산란 틱 밀도, 동물 구간 음, 마지막 미끄럼)는 `node episodes/wavelength/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형에서 써 넣습니다. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const m = model(tl);
  console.log(`events: ${sound.events.length}; λ keys ${m.keys.length}; crest ticks ${m.crests.length} (${m.crests[0].toFixed(2)}–${m.crests[m.crests.length - 1].toFixed(2)} s); scatter blue ${sound.events.find(e => e.id === 'scat_blue').params.layers.length}, red ${sound.events.find(e => e.id === 'scat_red').params.layers.length}`);
}
