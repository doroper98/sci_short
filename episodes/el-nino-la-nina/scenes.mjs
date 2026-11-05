// Episode scenes — "엘니뇨와 라니냐 — 바람이 물을 밀고, 물이 바람을 만든다"
// Shape: export {theme, scenes, overlays, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen):
//  - ONE state variable s ∈ [−1, +1] (−1 라니냐, 0 평상, +1 엘니뇨) drives every picture, readout and sound table.
//    This is an illustrative parametric model of the equatorial Pacific, NOT a simulation.
//      무역풍 세기       W  = 1 − 0.7·s                (relative, 1 = normal)
//      Niño 3.4 편차     T  = 2.4·s °C               (strong events ±2.4; thresholds ±0.5)
//      서−동 해수면 차   Δη = 50 cm · (1 − 0.8·s)
//      수온약층 깊이     D_w = 160 m · (1 − 0.45·s),  D_e = 50 m · (1 + 0.8·s)
//        (brief asked 1 + 1.2·s for the east; that gives 110 m east vs 88 m west at s = +1 — a reversed tilt — and
//         −10 m at s = −1, so the east coefficient is 0.8: flat at +1 (88 / 90 m), 10 m (almost at the surface) at −1)
//      비구름 경도       λ  = 140°E + 60°·max(0, s)   (200°E = 160°W at s = +1); La Niña: same place, bigger cloud
//      대류 세기         C  = 1 + 0.6·max(0, −s)
//      용승 세기         U  = max(0, 1 − 1.1·s)
//  - Sea-surface tilt and thermocline depths are drawn exaggerated (cm and m on one picture); the numbers are the model's.
//  - Map SST anomalies: a Gaussian tongue centred at 235°E (El Niño, + coastal warming) / 215°E (La Niña) with an
//    opposite-sign "horseshoe" in the west; amplitude T. Coastlines are hand-digitised, schematic.
//  - Niño 3.4 multi-year series (lanina, s11) is a schematic sum of Gaussian bumps approximating the NOAA ONI shape,
//    not the official data.
//  - Teleconnection / East-Asia panels (Philippine-Sea anticyclone, winter northerlies, summer moisture transport) are
//    schematic anomaly patterns (Wang et al. 2000); every impact label says "경향".
//
// Sound tables in sound.json (wind level = W(t), East-Pacific tone pitch = T(t), rain-tick density = C(t), threshold
// ticks, feedback tones, teleconnection pulses) are generated from this file:
//   node episodes/el-nino-la-nina/scenes.mjs --emit-sound [--timeline outputs/el-nino-la-nina/narration/timeline.json]
// Re-run it whenever the narration timeline changes (the normal scene warns once if the tables are stale).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  header, progressBar, endCard, leader,
  rgba, mix, clamp, lerp, smooth, easeInOut, poly, line, circle, ring, glow, arrow, curve,
  withAlpha, clipRect, rect, rand, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const W_of = s => 1 - 0.7 * s;
export const T_of = s => 2.4 * s;
export const DETA_of = s => 50 * (1 - 0.8 * s);
export const DW_of = s => 160 * (1 - 0.45 * s);
export const DE_of = s => 50 * (1 + 0.8 * s);
export const LAM_of = s => 140 + 60 * Math.max(0, s);
export const CONV_of = s => 1 + 0.6 * Math.max(0, -s);
export const U_of = s => Math.max(0, 1 - 1.1 * s);
export const THRESH = 0.5, T_PEAK = 2.4, SECTION_KM = 15000;
export const S_SUMMER = 0.3;

// ---- time anchors (shared with sound.json through --emit-sound) ----
export const A_NINO0 = ['s08', 0.2], A_NINO1 = {sentence: 's08', word: '이것이'};
export const A_NINA0 = {sentence: 's10', word: '무역풍이'}, NINA_RAMP = 3;
export const A_FB = [{sentence: 's09', word: '더워진'}, {sentence: 's09', word: '차이를'}, {sentence: 's09', word: '약하게'}, {sentence: 's09', word: '데웁니다'}];
export const A_FB_ALL = {sentence: 's09', word: '되먹임입니다'};
export const A_TC_SRC = {sentence: 's12', word: '대기의'}, TC_TRAVEL = 1.2;
export const A_TC_ARR = {...A_TC_SRC, offset: TC_TRAVEL};
export const A_RAIN_MOVE0 = {sentence: 's12', word: '자리를'}, A_RAIN_MOVE1 = {sentence: 's12', word: '옮기고'};
export const A_ESS = [{sentence: 's05', word: '밀어'}, {sentence: 's05', word: '만드는'}];
export const A_ANSWER = {sentence: 's02', word: '따뜻해지는'};
export const A_MYTH_X = {sentence: 's16', word: '않습니다'}, A_MYTH_OK = {sentence: 's16', word: '기우는'}, A_MYTH_DIALS = {sentence: 's16', word: '조건과'};
export const A_WARM = {sentence: 's13', word: '남풍이'}, A_COLD = {sentence: 's14', word: '찬'};
export const A_FRONT = {sentence: 's15', word: '장마'}, A_CLOSE = {sentence: 's17', word: '바람이'};

/** ramp times of the s(t) schedule */
export function schedule(tl) {
  const a = tl.at(A_NINO0), b = tl.at(A_NINO1), c = tl.at(A_NINA0);
  return {a, b, c, d: c + NINA_RAMP, t0: tl.scene('normal').start, t1: tl.scene('lanina').end};
}
/** state s at video time t for the hook → lanina stretch (0 before the El Niño ramp) */
export function sOf(t, S) {
  if (t < S.a) return 0;
  if (t < S.b) return easeInOut((t - S.a) / (S.b - S.a));
  if (t < S.c) return 1;
  if (t < S.d) return 1 - 2 * easeInOut((t - S.c) / (S.d - S.c));
  return -1;
}
/** first time T(s(t)) crosses ±0.5 in a direction (dir +1 upward through +0.5, −1 downward through −0.5) */
export function crossTime(S, dir) {
  const target = dir > 0 ? THRESH : -THRESH, [lo0, hi0] = dir > 0 ? [S.a, S.b] : [S.c, S.d];
  let lo = lo0, hi = hi0;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, v = T_of(sOf(m, S)); if (dir > 0 ? v < target : v > target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** ONI-like schematic series (°C), year as decimal; Gaussian bumps [centre, amplitude, width] */
export const ONI_BUMPS = [[1994.95, 1.1, 0.35], [1995.95, -1.0, 0.3], [1997.95, 2.4, 0.42], [1998.95, -1.5, 0.33], [1999.95, -1.7, 0.36],
  [2000.9, -0.7, 0.28], [2002.9, 1.3, 0.35], [2004.9, 0.7, 0.3], [2005.95, -0.9, 0.25], [2006.9, 0.9, 0.25], [2007.95, -1.6, 0.35],
  [2009.95, 1.6, 0.35], [2010.95, -1.6, 0.35], [2011.95, -1.0, 0.3], [2014.9, 0.6, 0.35], [2015.95, 2.6, 0.42], [2016.9, -0.7, 0.25],
  [2017.95, -0.9, 0.25], [2018.95, 0.8, 0.3], [2020.9, -1.3, 0.35], [2021.95, -1.0, 0.3], [2022.9, -1.0, 0.3], [2023.95, 2.0, 0.38],
  [2024.95, -0.5, 0.25]];
export const oni = y => ONI_BUMPS.reduce((a, [c, A, w]) => a + A * Math.exp(-(((y - c) / w) ** 2)), 0);
/** map SST anomaly (°C) at lon (°E), lat for state s */
export function anomAt(lon, lat, s) {
  if (Math.abs(s) < 1e-3) return 0;
  const T = T_of(s), c0 = s > 0 ? 235 : 215;
  let v = T * Math.exp(-(((lon - c0) / 40) ** 2)) * Math.exp(-((lat / 9) ** 2));
  if (s > 0) v += T * 0.8 * Math.exp(-(((lon - 276) / 12) ** 2)) * Math.exp(-(((lat + 4) / 10) ** 2));
  v -= 0.15 * T * Math.exp(-(((lon - 150) / 22) ** 2)) * Math.exp(-(((Math.abs(lat) - 16) / 9) ** 2));
  return v;
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
const WARM = '#F0883E', HOT = '#E0472F', COLD = '#4C9BD6', ICE = '#9CCFF0', WIND = '#D7E8EE', CLOUD = '#C9D6DC';
const LANDF = '#22312F', LANDS = '#5F7672', TRACK = '#FF4103', MOIST = '#7FD7C4';
const fmt = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sgn = (v, d = 1) => (v >= -0.05 * 10 ** -d ? '+' : '−') + fmt(Math.abs(v), d);
const lonLabel = l => (Math.round(l) === 180 ? '180°' : l < 180 ? `${Math.round(l)}°E` : `${Math.round(360 - l)}°W`);
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const sentOn = (ctx, t, id, rampIn = 0.3) => { const s = ctx.tl.sentence(id); return smooth((t - s.start + 0.2) / rampIn) * (1 - smooth((t - s.end - 0.6) / 0.5)); };
const evT = (ctx, id, fallback) => (ctx.events.has(id) ? ctx.events.get(id).time : ctx.tl.at(fallback));
const schOf = ctx => ctx._sch || (ctx._sch = schedule(ctx.tl));
function panel(c, T, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 10, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function stateWord(T) { return T >= THRESH ? '엘니뇨' : T <= -THRESH ? '라니냐' : '평상 (중립)'; }
function stateCol(Tv, th) { return Tv >= THRESH ? WARM : Tv <= -THRESH ? COLD : th.muted; }
/** water temperature (°C) → colour */
function tempColor(v) {
  const st = [[21, '#2F6FAE'], [23.5, '#5B9CC4'], [25.5, '#9DB8A8'], [27, '#E2A35A'], [28.5, '#E8773A'], [30.5, '#D9412E']];
  if (v <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) if (v <= st[i][0]) return mix(st[i - 1][1], st[i][1], (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0]));
  return st[st.length - 1][1];
}
function anomColor(v, a = 1) {
  const q = clamp(Math.abs(v) / T_PEAK);
  return v > 0 ? rgba(mix('#F2B06A', HOT, q), (0.18 + 0.62 * q) * a) : rgba(mix('#8EC3E8', '#2F6FB8', q), (0.18 + 0.62 * q) * a);
}
const checkMark = (c, x, y, s, col) => line(c, [[x - 14 * s, y], [x - 4 * s, y + 11 * s], [x + 16 * s, y - 13 * s]], col, 4.5 * s);
const crossMark = (c, x, y, s, col) => { line(c, [[x - 13 * s, y - 13 * s], [x + 13 * s, y + 13 * s]], col, 4.5 * s); line(c, [[x + 13 * s, y - 13 * s], [x - 13 * s, y + 13 * s]], col, 4.5 * s); };
function trackRing(c, x, y, r, a = 1) {
  withAlpha(c, a, () => {
    ring(c, x, y, r + 10, rgba(TRACK, 0.95), 2.5);
    for (let k = 0; k < 4; k++) { const th = k * Math.PI / 2 + Math.PI / 4; line(c, [[x + Math.cos(th) * (r + 14), y + Math.sin(th) * (r + 14)], [x + Math.cos(th) * (r + 22), y + Math.sin(th) * (r + 22)]], TRACK, 2.5); }
  });
}
/** cumulonimbus: tower + anvil, size r; rain streaks down to yBase */
function cloud(c, x, y, r, t, yBase, a = 1, dashed = false) {
  withAlpha(c, a, () => {
    if (dashed) {
      ring(c, x, y, r * 1.1, rgba(CLOUD, 0.6), 2);
      return;
    }
    glow(c, x, y, r * 2.2, '#DDE8EE', 0.12);
    const puffs = [[-0.9, 0.35, 0.55], [0.9, 0.35, 0.55], [-0.45, 0.1, 0.7], [0.45, 0.05, 0.7], [0, -0.35, 0.75], [0, 0.3, 0.7], [-1.25, -0.75, 0.35], [1.25, -0.75, 0.35], [0, -0.85, 0.5]];
    for (const [dx, dy, rr] of puffs) circle(c, x + dx * r, y + dy * r, rr * r, rgba(CLOUD, 0.95));
    poly(c, [[x - 1.7 * r, y - 0.82 * r], [x + 1.7 * r, y - 0.82 * r], [x + 0.9 * r, y - 0.55 * r], [x - 0.9 * r, y - 0.55 * r]], rgba(CLOUD, 0.95));
    poly(c, [[x - 1.3 * r, y + 0.55 * r], [x + 1.3 * r, y + 0.55 * r], [x + 1.2 * r, y + 0.85 * r], [x - 1.2 * r, y + 0.85 * r]], rgba('#8FA3AC', 0.95));
    if (yBase > y + r) {
      const n = Math.round(6 * r / 26);
      for (let i = 0; i < n; i++) {
        const xx = x + (i / (n - 1) - 0.5) * 2.2 * r, ph = (t * 1.6 + rand(i + 3)) % 1, y0 = y + 0.9 * r, len = yBase - y0;
        for (const q of [ph, (ph + 0.5) % 1]) { const yy = y0 + q * len; line(c, [[xx - 3, yy], [xx - 7, yy + 14]], rgba(ICE, 0.75), 2); }
      }
    }
  });
}
/** circulation arrows: dir +1 clockwise on screen (NH anticyclone), −1 counter-clockwise (NH cyclone) */
function gyre(c, x, y, rx, ry, dir, col, t, a = 1, w = 3, letter = null, stage = null) {
  withAlpha(c, a, () => {
    for (const k of [1, 0.62]) {
      for (let j = 0; j < 3; j++) {
        const a0 = j * TAU / 3 + dir * t * 0.5 + k, a1 = a0 + dir * TAU / 3 * 0.72, pts = [];
        for (let i = 0; i <= 24; i++) { const th = lerp(a0, a1, i / 24); pts.push([x + Math.cos(th) * rx * k, y + Math.sin(th) * ry * k]); }
        line(c, pts.slice(0, -3), col, w);
        arrow(c, pts[pts.length - 4], pts[pts.length - 1], col, w, {head: 10 + w * 2});
      }
    }
    if (letter && stage) { circle(c, x, y, 22, rgba('#06222E', 0.85)); stage.text(letter, x, y + 1, {role: 'display', weight: 700, size: 28, color: col, align: 'center'}); }
  });
}
function thermo(stage, x, y, h, level, col, a = 1) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    rect(c, x - 10, y - h, 20, h, 10, rgba(T.deep, 1), rgba(T.muted, 0.9), 2);
    circle(c, x, y + 10, 18, col); ring(c, x, y + 10, 18, rgba(T.muted, 0.9), 2);
    rect(c, x - 5, y - h * level, 10, h * level + 6, 5, col);
    line(c, [[x + 14, y - h * 0.5], [x + 26, y - h * 0.5]], rgba(T.ink, 0.8), 2);   // normal mark
  });
}
/** arrow along a polyline */
function pathArrow(c, pts, col, w, q = 1, head = 14) {
  if (q <= 0) return;
  const n = Math.max(2, Math.round(pts.length * clamp(q))), p = pts.slice(0, n);
  line(c, p.slice(0, -1), col, w);
  arrow(c, p[p.length - 2], p[p.length - 1], col, w, {head});
}

// =====================================================================================================
// Coastlines (lon °E 0–360, lat), hand-digitised and schematic
// =====================================================================================================
const LAND = [
  // Eurasia (Indochina, China, Korea, Russian Far East, Kamchatka), closed far outside every view
  [[98, 8.5], [100.3, 6.5], [100.4, 5.0], [101.3, 2.8], [103.5, 1.4], [104.2, 1.6], [103.4, 4.5], [102.3, 6.1], [101.0, 6.9], [100.2, 8.6],
    [99.3, 10.5], [100.0, 13.4], [101.0, 12.7], [102.5, 12.0], [103.5, 10.5], [104.8, 8.7], [106.5, 9.6], [107.5, 10.5], [109.2, 11.6],
    [109.3, 13.5], [108.8, 15.5], [107.0, 17.0], [106.0, 18.8], [106.6, 20.5], [108.0, 21.5], [109.7, 21.5], [110.2, 20.3], [110.5, 21.2],
    [112.0, 21.8], [113.6, 22.3], [115.0, 22.8], [116.7, 23.3], [118.0, 24.5], [119.5, 25.8], [120.0, 26.8], [121.3, 28.5], [122.0, 30.0],
    [121.6, 31.0], [120.8, 32.5], [120.3, 34.3], [119.2, 35.0], [120.3, 36.1], [122.5, 37.2], [121.0, 37.7], [119.0, 37.2], [118.7, 38.4],
    [117.6, 39.0], [119.0, 39.5], [121.3, 40.8], [121.2, 38.8], [122.3, 39.5], [124.2, 39.9],
    [125.1, 39.6], [125.4, 38.3], [126.2, 37.7], [126.6, 37.0], [126.3, 35.9], [126.4, 34.6], [127.4, 34.6], [128.6, 34.8], [129.3, 35.3],
    [129.5, 36.2], [129.4, 37.0], [128.6, 38.3], [127.5, 39.4], [128.4, 40.0], [129.7, 40.9], [129.8, 41.5], [130.7, 42.3],
    [132.3, 43.2], [135.2, 43.8], [136.9, 45.2], [138.4, 47.2], [140.4, 48.9], [140.5, 51.0], [141.3, 52.8], [139.5, 54.2], [137.0, 54.0],
    [135.2, 54.6], [137.7, 56.4], [142.0, 59.2], [146.0, 59.4], [151.0, 59.2], [155.0, 59.4], [156.0, 57.8], [156.7, 51.2], [158.5, 52.9],
    [160.0, 54.5], [162.0, 56.2], [163.3, 58.0], [164.0, 60.0], [175, 66], [175, 75], [60, 75], [60, 10]],
  [[142.0, 46.0], [143.5, 46.8], [143.2, 49.3], [144.5, 49.0], [143.0, 52.0], [142.8, 54.3], [142.2, 54.2], [141.7, 52.0], [142.0, 49.0], [141.9, 46.6]],
  [[140.0, 41.5], [141.2, 41.8], [143.2, 42.0], [145.6, 43.3], [145.2, 44.2], [142.0, 45.5], [141.6, 45.2], [141.3, 43.5], [140.3, 43.2], [139.9, 42.2]],
  [[141.4, 41.4], [142.0, 39.5], [141.0, 38.3], [140.9, 37.0], [140.6, 35.7], [139.8, 35.0], [138.8, 34.6], [137.0, 34.6], [136.8, 34.3], [135.8, 33.5],
    [135.1, 34.3], [133.0, 34.4], [131.0, 34.0], [131.4, 34.6], [132.6, 35.5], [135.8, 35.6], [136.8, 37.3], [137.3, 36.8], [138.6, 37.8],
    [139.8, 39.8], [140.0, 40.7], [140.9, 41.2]],
  [[132.4, 33.3], [133.0, 32.7], [134.7, 33.8], [134.4, 34.2], [133.0, 34.2]],
  [[129.7, 33.2], [130.2, 31.3], [131.1, 31.4], [131.8, 32.9], [131.0, 33.9], [130.0, 33.8]],
  [[120.1, 23.0], [120.9, 22.0], [121.6, 23.5], [122.0, 25.0], [121.5, 25.3], [120.2, 24.0]],
  [[108.6, 19.2], [109.5, 18.2], [110.6, 18.6], [111.0, 19.7], [110.0, 20.1]],
  [[120.6, 18.5], [122.3, 18.5], [122.2, 16.5], [121.6, 15.8], [121.7, 14.0], [124.0, 13.0], [123.0, 13.8], [121.0, 13.6], [120.6, 14.4], [120.0, 16.2]],
  [[122.5, 11.6], [124.8, 12.5], [125.7, 11.0], [125.2, 10.0], [123.3, 9.3], [122.0, 10.3]],
  [[122.0, 7.0], [125.4, 5.6], [126.6, 7.3], [126.0, 9.3], [124.0, 8.9], [123.0, 8.0]],
  [[117.2, 8.4], [119.6, 10.6], [119.2, 11.3], [117.8, 9.6]],
  [[109.0, 1.8], [110.3, 1.7], [111.5, 2.6], [113.0, 3.2], [115.4, 5.3], [116.8, 7.0], [119.2, 5.3], [118.2, 4.4], [117.6, 3.0], [118.9, 1.0],
    [117.5, 0.0], [116.6, -2.0], [116.0, -3.9], [114.5, -3.5], [113.0, -3.2], [111.0, -3.0], [110.0, -1.5], [109.0, 0.0]],
  [[95.3, 5.6], [97.5, 5.2], [100.3, 2.5], [103.7, -0.9], [104.6, -2.3], [106.0, -3.2], [105.8, -5.8], [104.5, -5.7], [102.3, -4.0], [100.3, -1.0], [98.6, 1.7], [95.2, 4.2]],
  [[105.2, -6.8], [106.1, -5.9], [108.2, -6.3], [110.4, -6.9], [112.5, -6.9], [114.5, -7.7], [114.4, -8.7], [110.5, -8.2], [108.0, -7.8], [106.4, -7.4]],
  [[118.8, -3.0], [119.4, -5.5], [120.4, -5.5], [120.6, -2.8], [121.5, -4.5], [122.5, -4.6], [121.3, -1.9], [123.3, -1.0], [121.5, -0.8],
    [122.0, 1.0], [125.0, 1.6], [124.2, 0.4], [120.4, 0.4], [119.7, -0.6]],
  [[131.0, -1.3], [132.5, -0.4], [135.0, -3.3], [137.5, -1.5], [141.0, -2.6], [145.8, -4.9], [147.5, -6.1], [150.9, -10.3], [148.0, -10.0],
    [146.0, -8.2], [144.0, -7.6], [142.5, -9.3], [141.0, -9.1], [139.0, -8.1], [137.8, -5.3], [135.0, -4.4], [133.5, -3.9], [132.1, -2.9]],
  [[113.5, -22.0], [114.1, -21.8], [116.7, -20.6], [121.0, -19.5], [122.2, -17.3], [124.0, -16.3], [125.7, -14.4], [127.8, -14.3], [129.7, -14.9],
    [130.3, -12.5], [132.5, -11.5], [136.6, -12.0], [136.0, -13.0], [135.5, -15.0], [137.7, -16.2], [140.6, -17.6], [141.6, -12.5], [142.5, -10.7],
    [143.5, -14.0], [145.4, -14.9], [146.3, -19.0], [149.0, -21.5], [150.8, -22.8], [153.0, -25.0], [153.6, -28.5], [153, -32], [151, -34],
    [150, -38], [140, -38], [130, -32], [115, -34]],
  [[204.0, 19.9], [204.9, 20.2], [205.2, 19.6], [204.6, 18.9], [204.1, 19.2]],
  [[197.0, 55.0], [200, 56.0], [206, 58.0], [210, 59.5], [214, 60.3], [220, 59.8], [224, 58.5], [227, 56.2], [229.5, 54.5], [231, 52], [232.5, 50.6],
    [235.5, 48.4], [236, 46], [235.8, 42], [236.3, 40.4], [237.5, 38], [239.4, 34.6], [242.9, 32.5], [243.5, 30], [244.8, 28], [245.9, 25.5],
    [247.6, 23.4], [250.1, 22.9], [249.5, 24.4], [247.8, 26.8], [246.0, 29.5], [245.2, 31.6], [247.0, 31.3], [248.8, 28.5], [250.8, 26.0],
    [253.6, 23.2], [254.8, 20.6], [255.6, 19.2], [257.8, 18.0], [260.1, 16.9], [264.0, 15.8], [267.6, 14.1], [269.2, 13.4], [272.7, 11.2],
    [274.3, 9.6], [276.0, 8.1], [279.3, 8.0], [280.5, 7.5], [282.6, 8.7], [282.8, 7.0], [282.7, 4.5], [282.3, 2.6], [280.9, 1.2], [279.7, 0.0],
    [279.1, -2.2], [278.8, -4.0], [278.7, -5.5], [280.1, -8.0], [282.0, -12.0], [283.8, -14.5], [285.7, -17.0], [289.7, -18.5], [289.8, -23.5],
    [288.5, -30], [288.4, -33], [310, -40], [310, 75], [190, 75]],
];
function makeMap(x0, y0, w, h, lon0, lon1, lat0, lat1) {
  const P = (lon, lat) => [x0 + (lon - lon0) / (lon1 - lon0) * w, y0 + (lat1 - lat) / (lat1 - lat0) * h];
  return {x0, y0, w, h, lon0, lon1, lat0, lat1, P, kx: w / (lon1 - lon0), ky: h / (lat1 - lat0)};
}
function mapBase(stage, M, s, o = {}) {
  const {ctx: c} = stage, T = stage.theme;
  rect(c, M.x0, M.y0, M.w, M.h, 8, rgba('#04202C', 1), rgba(T.border, 1), 1.5);
  clipRect(c, M.x0, M.y0, M.w, M.h, 8, () => {
    // graticule
    for (let lon = Math.ceil(M.lon0 / 20) * 20; lon <= M.lon1; lon += 20) line(c, [M.P(lon, M.lat0), M.P(lon, M.lat1)], rgba(T.border, 0.6), 1);
    for (let lat = Math.ceil(M.lat0 / 20) * 20; lat <= M.lat1; lat += 20) if (lat !== 0) line(c, [M.P(M.lon0, lat), M.P(M.lon1, lat)], rgba(T.border, 0.6), 1);
    // SST anomaly shading
    const sa = o.sst ?? s;
    if (Math.abs(sa) > 0.01) anomField(stage, M, (lon, lat) => anomAt(lon, lat, sa), o.cell || 1.25, o.sstAlpha ?? 1);
    line(c, [M.P(M.lon0, 0), M.P(M.lon1, 0)], rgba(T.muted, 0.55), 1.5, {dash: [6, 6]});
    for (const L of LAND) poly(c, L.map(([lo, la]) => M.P(lo, la)), LANDF, LANDS, 1.3);
  });
}
/** smooth anomaly shading: one pixel per cell on an offscreen canvas, scaled up with smoothing */
function anomField(stage, M, f, cell = 1.25, alpha = 1) {
  const nx = Math.ceil((M.lon1 - M.lon0) / cell), ny = Math.ceil((M.lat1 - M.lat0) / cell);
  const off = new stage.canvas.constructor(nx, ny), oc = off.getContext('2d'), img = oc.createImageData(nx, ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = f(M.lon0 + (i + 0.5) * cell, M.lat1 - (j + 0.5) * cell), [r, g, b, a] = anomRGBA(v), k = (j * nx + i) * 4;
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = Math.round(255 * a * alpha);
  }
  oc.putImageData(img, 0, 0);
  const c = stage.ctx; c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(off, M.x0, M.y0, M.w, M.h); c.restore();
}
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function anomRGBA(v) {
  const q = clamp(Math.abs(v) / T_PEAK), a = Math.abs(v) < 0.15 ? 0 : (0.18 + 0.62 * q) * smooth((Math.abs(v) - 0.15) / 0.25);
  return [...hexRGB(v > 0 ? mix('#F2B06A', HOT, q) : mix('#8EC3E8', '#2F6FB8', q)), a];
}
function koreaMark(stage, M, t, a = 1, label = true, size = 24) {
  const {ctx: c} = stage, T = stage.theme, [x, y] = M.P(127.6, 36.4);
  withAlpha(c, a, () => {
    ring(c, x, y, 13 + 3 * Math.sin(t * 3), rgba(T.accent, 0.95), 2.5); circle(c, x, y, 4, T.accent);
    if (label) stage.text('한국', x + 22, y - 2, {size, weight: 700, color: T.accent});
  });
}

// =====================================================================================================
// The equatorial cross-section (one stage, used by hook / normal / elnino / lanina)
// =====================================================================================================
function section(stage, t, s, B, o = {}) {
  const {ctx: c} = stage, T = stage.theme, L = o.lab || {};
  const {x0, y0, w, h} = B, x1 = x0 + w, y1 = y0 + h;
  const xW = x0 + 78, xE = x1 - 66, X = lon => xW + (lon - 125) / 155 * (xE - xW), Ux = u => xW + u * (xE - xW);
  const ySea = y0 + h * 0.46, kd = (y1 - 40 - ySea) / 240;
  const deta = DETA_of(s), etaPx = deta / 50 * 12;
  const yS0 = u => ySea - etaPx * (1 - 2 * u), yS = u => yS0(u) + 1.4 * Math.sin(u * 46 - t * 2.2);
  const Dw = DW_of(s), De = DE_of(s), bump = o.bump || (() => 0);
  const D = u => lerp(Dw, De, Math.pow(u, 1.5)) + bump(u);
  const yTh = u => yS0(u) + D(u) * kd;
  const W = W_of(s), Tv = T_of(s), lam = LAM_of(s), C = CONV_of(s), Up = U_of(s), fl = o.flow || 0;
  const sst = u => 29.5 - 6 * u * u + 1.2 * Tv * (-0.15 + 1.05 * smooth((u - 0.3) / 0.6));
  panel(c, T, x0, y0, w, h);
  clipRect(c, x0, y0, w, h, 10, () => {
    // deep water
    const g = c.createLinearGradient(0, ySea, 0, y1); g.addColorStop(0, '#1E4F6E'); g.addColorStop(1, '#071C2A');
    poly(c, [[xW, yS0(0)], [xE, yS0(1)], [xE, y1], [xW, y1]], g);
    // warm upper layer, coloured by local surface temperature
    const N = 96;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, um = (u0 + u1) / 2;
      poly(c, [[Ux(u0), yS(u0)], [Ux(u1) + 0.6, yS(u1)], [Ux(u1) + 0.6, yTh(u1)], [Ux(u0), yTh(u0)]], rgba(tempColor(sst(um)), 0.9));
    }
    // mean sea level (dashed) and surface
    line(c, [[xW, ySea], [xE, ySea]], rgba(T.ink, 0.25), 1, {dash: [5, 7]});
    const sp = []; for (let i = 0; i <= 120; i++) sp.push([Ux(i / 120), yS(i / 120)]); line(c, sp, '#CDEBF5', 2.2);
    // thermocline
    const tp = []; for (let i = 0; i <= 120; i++) tp.push([Ux(i / 120), yTh(i / 120)]);
    line(c, tp, rgba('#06141C', 0.6), 5); line(c, tp, '#FFE2C4', 2.2);
    // flow of the warm layer (El Niño ramp: east; La Niña ramp: west)
    if (Math.abs(fl) > 0.02) {
      for (const u of [0.22, 0.6, 0.76]) {
        const yy = (yS0(u) + yTh(u)) / 2 + (u < 0.5 ? 0 : 0), len = 70 * clamp(Math.abs(fl)), ph = ((t * 0.9) % 1) * 30 * Math.sign(fl), xm = Ux(u) + ph;
        withAlpha(c, clamp(Math.abs(fl) * 1.5), () => arrow(c, [xm - Math.sign(fl) * len / 2, yy], [xm + Math.sign(fl) * len / 2, yy], '#FFF1DF', 4, {head: 16}));
      }
    }
    // upwelling at the east coast
    if (Up > 0.02) withAlpha(c, clamp(Up), () => {
      for (let k = 0; k < 3; k++) {
        const u = 0.875 + k * 0.04, xb = Ux(u), yb = yTh(u) + 46 + 10 * k, yt = yS0(u) + 8;
        const pts = curve([xb + 22, yb], [xb - 4, yt], -16, 20);
        line(c, pts.slice(0, -2), rgba(ICE, 0.9), 2.5 + Up); arrow(c, pts[pts.length - 3], pts[pts.length - 1], rgba(ICE, 0.95), 2.5 + Up, {head: 13});
        const q = (t * 0.7 * (0.5 + Up) + k / 3) % 1, pp = pts[Math.floor(q * (pts.length - 1))];
        circle(c, pp[0], pp[1], 3.5, '#EAF6FF');
      }
    });
    // land: Indonesia (west), South America with the Andes (east)
    poly(c, [[x0, y0 + h * 0.3], [x0 + 28, ySea - 34], [xW - 18, ySea - 16], [xW, yS0(0) - 2], [xW, y1], [x0, y1]], LANDF, LANDS, 1.5);
    poly(c, [[xE, yS0(1) - 2], [xE + 10, ySea - 28], [xE + 26, y0 + h * 0.2], [xE + 40, ySea - 66], [x1, ySea - 54], [x1, y1], [xE, y1]], LANDF, LANDS, 1.5);
    // atmosphere: Walker circulation (dashed loop), drawn under the cloud
    const yTop = y0 + 60, yLow = ySea - 52, xr = X(lam), xd = X(262), wa = clamp(0.35 + 0.45 * W) * (L.walker ?? 1);
    const loopDash = (pts, col, wd) => line(c, pts, col, wd, {dash: [12, 9]});
    if (wa > 0) withAlpha(c, wa, () => {
      const col = rgba(o.walkerHi ? T.light : '#B9CDD4', 0.95), wd = 2 + 1.5 * clamp(W / 1.7);
      const shift = (t * 18 * W) % 21; c.save(); c.lineDashOffset = -shift;
      loopDash([[xr, yLow], [xr, yTop + 18], [xr + 18, yTop], [xd - 18, yTop], [xd, yTop + 18], [xd, yLow]], col, wd);
      c.restore();
      arrow(c, [xr, yLow - 10], [xr, yLow - 42], col, wd, {head: 14});
      arrow(c, [(xr + xd) / 2 - 20, yTop], [(xr + xd) / 2 + 22, yTop], col, wd, {head: 14});
      arrow(c, [xd, yTop + 46], [xd, yTop + 80], col, wd, {head: 14});
    });
    // El Niño: a second, reversed cell sinking over Indonesia
    const sw = clamp((s - 0.35) / 0.4) * (L.walker ?? 1);
    if (sw > 0) withAlpha(c, sw * 0.9, () => {
      const xw = X(128), col = rgba('#B9CDD4', 0.9);
      loopDash([[xr, yTop + 26], [xw + 14, yTop + 26], [xw, yTop + 40], [xw, yLow]], col, 2.5);
      arrow(c, [xw, yTop + 60], [xw, yTop + 92], col, 2.5, {head: 13});
    });
    // cloud and rain over the rising branch
    cloud(c, xr, y0 + 100, 30 * C, t, yS0((lam - 125) / 155) - 4, 1);
    // trade winds (east → west) along the surface: length and drift speed ∝ W
    const ya = ySea - 26 - etaPx * 0.2, xa = X(150), xb = X(270);
    for (let k = 0; k < 5; k++) {
      const q = (k / 5 + t * 0.06 * W) % 1, x = lerp(xb, xa, q), len = 22 + 62 * W / 1.7, al = Math.sin(Math.PI * q);
      withAlpha(c, al * (L.windA ?? 1), () => arrow(c, [x + len / 2, ya], [x - len / 2, ya], WIND, 2 + 2.2 * W / 1.7, {head: 10 + 6 * W / 1.7}));
    }
  });
  // ---- labels (outside the clip so leaders can reach the panel edges)
  const la = (k, d = 0) => (L[k] ?? d);
  const fs = o.fs || 24;
  const xr = X(lam), xd = X(262), cr = 30 * C;
  withAlpha(c, la('wind'), () => stage.text(`무역풍 ×${fmt(W, 2)}`, X(238), ySea - 56 - etaPx * 0.2, {size: fs, weight: 500, color: WIND, align: 'center', shadow: '#000'}));
  withAlpha(c, la('eta'), () => {
    const xx = xW + 26, ya2 = yS0(0), yb2 = ySea;
    line(c, [[xx, ya2], [xx, yb2]], T.light, 2); line(c, [[xx - 7, ya2], [xx + 7, ya2]], T.light, 2); line(c, [[xx - 7, yb2], [xx + 7, yb2]], T.light, 2);
    stage.text(`해수면 서쪽 +${fmt(deta)} cm`, xx + 16, yS0(0.02) + 22, {size: fs, weight: 700, color: '#FFF1DF', shadow: '#000'});
  });
  withAlpha(c, la('depth'), () => {
    const xa = Ux(0.035), ya2 = yS0(0.035), yb2 = yTh(0.035);
    line(c, [[xa, ya2 + 2], [xa, yb2]], rgba(T.ink, 0.9), 1.8); line(c, [[xa - 6, yb2], [xa + 6, yb2]], rgba(T.ink, 0.9), 1.8);
    stage.text(`${fmt(Dw)} m`, xa + 12, Math.min(yb2 + 22, y1 - 54), {role: 'display', size: fs + 4, weight: 500, color: T.ink, shadow: '#000'});
    const xe = Ux(0.985), ye0 = yS0(0.985), ye1 = yTh(0.985);
    line(c, [[xe, ye0 + 2], [xe, ye1]], rgba(T.ink, 0.9), 1.8); line(c, [[xe - 6, ye1], [xe + 6, ye1]], rgba(T.ink, 0.9), 1.8);
    line(c, [[xe - 4, ye1], [Ux(0.86) + 2, ye1 + 26]], rgba(T.ink, 0.6), 1.2);
    stage.text(`${fmt(De)} m`, Ux(0.86) - 4, ye1 + 26, {role: 'display', size: fs + 4, weight: 500, color: T.ink, align: 'right', shadow: '#000'});
    stage.text('수온약층', Ux(0.5), yTh(0.5) + 24, {size: fs, weight: 500, color: '#FFE2C4', align: 'center', shadow: '#000'});
  });
  withAlpha(c, la('warm'), () => stage.text(fl > 0.25 ? '따뜻한 물이 동쪽으로' : fl < -0.25 ? '따뜻한 물이 서쪽으로' : '따뜻한 표층', Ux(0.42), (yS0(0.42) + yTh(0.42)) / 2 + 2, {size: fs, weight: 700, color: '#FFF1DF', align: 'center', shadow: '#000'}));
  withAlpha(c, la('up') * clamp(Up * 2), () => stage.text('용승 · 찬 물', Ux(0.85) - 18, yTh(0.85) + 80, {size: fs, weight: 500, color: ICE, align: 'right', shadow: '#000'}));
  withAlpha(c, la('upOff') * clamp(1 - Up * 3), () => stage.text('용승 멈춤', Ux(0.85) - 18, yTh(0.85) + 66, {size: fs, weight: 500, color: WARM, align: 'right', shadow: '#000'}));
  withAlpha(c, la('rise'), () => {
    const [l1, l2] = lam > 170 ? ['비구름', '동쪽으로'] : s < -0.3 ? ['상승 · 비', '더 강하게'] : ['상승', '비'];
    const lx = lam > 170 ? xr - 1.75 * cr - 6 : xr + 1.75 * cr + 6, al = lam > 170 ? 'right' : 'left';
    stage.text(l1, lx, y0 + 86, {size: fs, weight: 700, color: CLOUD, align: al, shadow: '#000'});
    stage.text(l2, lx, y0 + 116, {size: fs, weight: 500, color: CLOUD, align: al, shadow: '#000'});
  });
  withAlpha(c, la('sink'), () => { stage.text('하강', xd + 12, y0 + 104, {size: fs, weight: 500, color: '#B9CDD4'}); stage.text('건조', xd + 12, y0 + 134, {size: fs, weight: 500, color: '#B9CDD4'}); });
  withAlpha(c, la('walker'), () => stage.text('워커 순환', (xr + xd) / 2 + 20, y0 + 34, {size: fs, weight: 500, color: o.walkerHi ? T.light : '#B9CDD4', align: 'center'}));
  withAlpha(c, la('dry') * clamp((s - 0.4) / 0.3), () => stage.text('건조', X(128) + 12, y0 + 104, {size: fs, weight: 700, color: WARM}));
  withAlpha(c, la('places', 1), () => {
    stage.text('서 · 인도네시아', xW + 10, y1 - 20, {size: fs, color: T.muted});
    stage.text('동 · 페루', xE - 10, y1 - 20, {size: fs, color: T.muted, align: 'right'});
    const a0 = X(132), a1 = X(267), yb = y1 - 20, mid = (a0 + a1) / 2;
    line(c, [[mid - 150, yb], [mid - 92, yb]], rgba(T.muted, 0.8), 1.5); line(c, [[mid + 92, yb], [mid + 150, yb]], rgba(T.muted, 0.8), 1.5);
    stage.text('약 15,000 km', mid, yb, {size: fs, color: T.muted, align: 'center'});
  });
  return {X, Ux, ySea, yS0, yTh, xr: X(lam), y0, y1};
}

// =====================================================================================================
// Dashboard pieces: plan-view basin map (middle) and readouts (bottom)
// =====================================================================================================
const B_SEC = {x0: 60, y0: 282, w: 960, h: 420}, B_MAP = {x0: 60, y0: 714, w: 960, h: 336}, R_Y0 = 1062, R_H = 274;
function basinMap(stage, t, s, o = {}) {
  const {ctx: c} = stage, T = stage.theme;
  const M = makeMap(B_MAP.x0, B_MAP.y0, B_MAP.w, B_MAP.h, 100, 290, -24, 50);
  mapBase(stage, M, s);
  clipRect(c, M.x0, M.y0, M.w, M.h, 8, () => {
    // trade winds on the map (east → west along the equator), length ∝ W
    const W = W_of(s);
    for (let k = 0; k < 6; k++) {
      const lon = 160 + k * 20 + ((t * 4 * W) % 20), [x, y] = M.P(lon, k % 2 ? 9 : -9), len = 12 + 26 * W / 1.7;
      arrow(c, [x + len / 2, y], [x - len / 2, y], rgba(WIND, 0.75), 2, {head: 9});
    }
    // convection marker on the equator
    const [cx, cy] = M.P(LAM_of(s), 0);
    cloud(c, cx, cy - 6, 9 * CONV_of(s), t, cy - 6, 1);
  });
  // Niño 3.4 box + tracking ring
  const [bx0, by0] = M.P(190, 5), [bx1, by1] = M.P(240, -5);
  rect(c, bx0, by0, bx1 - bx0, by1 - by0, 2, null, T.ink, 2);
  trackRing(c, bx1 + 2, (by0 + by1) / 2, 8, 0.9);
  stage.text('Niño 3.4', (bx0 + bx1) / 2, by1 + 22, {size: 24, weight: 700, color: T.ink, align: 'center', shadow: '#000'});
  // place labels
  const lab = (txt, lon, lat, al = 'center', col = T.muted) => { const [x, y] = M.P(lon, lat); stage.text(txt, x, y, {size: 24, color: col, align: al, shadow: '#000'}); };
  koreaMark(stage, M, t);
  lab('일본', 146, 40, 'left'); lab('중국', 110, 31); lab('호주', 133, -20); lab('페루', 270, -12, 'right'); lab('적도', 288, 3, 'right');
  lab('필리핀', 131, 12, 'left');
  // legend
  const lx = M.x0 + M.w - 250, ly = M.y0 + 28;
  for (let i = 0; i < 40; i++) { const v = (i / 39 - 0.5) * 2 * T_PEAK; c.fillStyle = anomColor(v); c.fillRect(lx + 50 + i * 4, ly - 7, 4.2, 14); }
  stage.text('수온 편차', lx + 40, ly, {size: 24, color: T.muted, align: 'right'});
  stage.text('−', lx + 50, ly + 24, {size: 24, color: COLD, align: 'center'}); stage.text('+', lx + 210, ly + 24, {size: 24, color: WARM, align: 'center'});
  void o;
  return M;
}

function readouts(stage, t, ctx, s, a = 1) {
  const {ctx: c} = stage, T = stage.theme, y0 = R_Y0, h = R_H, S = schOf(ctx);
  const W = W_of(s), Tv = T_of(s);
  withAlpha(c, a, () => {
    panel(c, T, 60, y0, 960, h);
    // left: wind bar, thermocline, cloud longitude
    stage.text('무역풍 세기', 84, y0 + 34, {size: 24, color: T.muted});
    stage.text(`평년 ×${fmt(W, 2)}`, 470, y0 + 34, {role: 'display', size: 28, weight: 500, color: T.ink, align: 'right'});
    const bx = 84, bw = 386, by = y0 + 66;
    rect(c, bx, by - 9, bw, 18, 5, rgba(T.border, 1));
    rect(c, bx, by - 9, bw * clamp(W / 1.8), 18, 5, mix('#7FA6B4', WIND, clamp(W / 1.7)));
    line(c, [[bx + bw / 1.8, by - 15], [bx + bw / 1.8, by + 15]], T.ink, 2);
    stage.text('수온약층 깊이 (서 · 동)', 84, y0 + 112, {size: 24, color: T.muted});
    stage.text(`${fmt(DW_of(s))} m · ${fmt(DE_of(s))} m`, 84, y0 + 150, {role: 'display', size: 34, weight: 500, color: T.ink});
    // slope glyph
    const gx = 360, gy = y0 + 132, dw = DW_of(s) / 240 * 56, de = DE_of(s) / 240 * 56;
    line(c, [[gx, gy], [gx + 110, gy]], rgba('#CDEBF5', 0.8), 1.5);
    poly(c, [[gx, gy], [gx + 110, gy], [gx + 110, gy + de], [gx, gy + dw]], rgba(WARM, 0.55));
    line(c, [[gx, gy + dw], [gx + 110, gy + de]], '#FFE2C4', 2);
    stage.text('비구름 중심', 84, y0 + 200, {size: 24, color: T.muted});
    stage.text(lonLabel(LAM_of(s)), 84, y0 + 238, {role: 'display', size: 34, weight: 500, color: T.ink});
    stage.text(s < -0.3 ? '더 강함' : LAM_of(s) > 170 ? '동쪽으로 이동' : '서태평양', 470, y0 + 238, {size: 24, weight: 500, color: s < -0.3 ? ICE : LAM_of(s) > 170 ? WARM : T.muted, align: 'right'});
    line(c, [[500, y0 + 16], [500, y0 + h - 16]], rgba(T.border, 1), 1.5);
    // right: Niño 3.4 index and trace
    stage.text('Niño 3.4 수온 편차', 524, y0 + 34, {size: 24, color: T.muted});
    const col = stateCol(Tv, T);
    for (const id of ['nino_cross', 'nina_cross']) if (ctx.events.has(id)) { const f = ctx.events.pulse(id, t, 0.9); if (f > 0) rect(c, 514, y0 + 50, 200, 60, 8, rgba(id === 'nino_cross' ? WARM : COLD, 0.35 * f), rgba(id === 'nino_cross' ? WARM : COLD, f), 2); }
    stage.text(`${sgn(Tv)} °C`, 524, y0 + 80, {role: 'display', size: 46, weight: 700, color: Tv >= THRESH || Tv <= -THRESH ? col : T.ink});
    stage.text(stateWord(Tv), 996, y0 + 80, {size: 28, weight: 700, color: col, align: 'right'});
    const gx0 = 524, gx1 = 996, gyc = y0 + 196, ky = 26, X = tt => gx0 + (gx1 - gx0) * (tt - S.t0) / (S.t1 - S.t0);
    line(c, [[gx0, gyc], [gx1, gyc]], rgba(T.border, 1), 1);
    for (const v of [THRESH, -THRESH]) line(c, [[gx0, gyc - v * ky], [gx1, gyc - v * ky]], rgba(v > 0 ? WARM : COLD, 0.8), 1.5, {dash: [6, 6]});
    stage.text('+0.5', gx1, gyc - THRESH * ky - 16, {size: 24, color: WARM, align: 'right'});
    stage.text('−0.5', gx1, gyc + THRESH * ky + 18, {size: 24, color: COLD, align: 'right'});
    const pts = [], now = clamp(t, S.t0, S.t1);
    for (let tt = S.t0; tt <= now; tt += 0.25) pts.push([X(tt), gyc - T_of(sOf(tt, S)) * ky]);
    pts.push([X(now), gyc - Tv * ky]);
    if (pts.length > 1) line(c, pts, T.light, 2.4);
    const xn = X(now); circle(c, xn, gyc - Tv * ky, 5, TRACK);
    for (const id of ['nino_cross', 'nina_cross']) if (ctx.events.has(id)) { const f = ctx.events.pulse(id, t, 0.9); if (f > 0) ring(c, xn, gyc - Tv * ky, 10 + 30 * (1 - f), rgba(id === 'nino_cross' ? WARM : COLD, f), 2.5); }
    line(c, [[xn, gyc - 2.6 * ky], [xn, gyc + 2.6 * ky]], rgba(TRACK, 0.7), 1.5);
  });
}

/** Bjerknes loop, 4 nodes; lit[k] 0..1 */
function feedbackLoop(stage, t, ctx, box, a = 1) {
  const {ctx: c} = stage, T = stage.theme;
  const {x0, y0, w, h} = box, cx = x0 + w / 2, cy = y0 + h / 2 + 2, rx = 330, ry = h * 0.36;
  const nodes = [['동쪽 바다 더워짐', 0], ['동서 온도 차 줄어듦', 1], ['무역풍 더 약해짐', 2], ['따뜻한 물 더 동쪽으로', 3]];
  const pos = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
  const lit = A_FB.map((r, k) => { const id = `fb${k + 1}`; return ctx.events.has(id) ? ctx.events.after(id, t, 0.3) : fadeIn(t, ctx.tl.at(r), 0.3); });
  const fl = A_FB.map((r, k) => { const id = `fb${k + 1}`; return ctx.events.has(id) ? ctx.events.pulse(id, t, 0.8) : 0; });
  const all = ctx.events.has('fb_all') ? ctx.events.after('fb_all', t, 0.4) : fadeIn(t, ctx.tl.at(A_FB_ALL), 0.4);
  withAlpha(c, a, () => {
    panel(c, T, x0, y0, w, h, 0.96);
    // arcs on the ellipse through the four nodes (clockwise); arc k → k+1 lights with node k+1 (last arc with the whole loop)
    const segs = [[-62, -18], [18, 62], [118, 162], [198, 242]];
    segs.forEach(([d0, d1], k) => {
      const q = k < 3 ? lit[k + 1] : all, pts = [];
      for (let i = 0; i <= 30; i++) { const th = (d0 + (d1 - d0) * i / 30) * Math.PI / 180; pts.push([cx + rx * Math.cos(th), cy + ry * Math.sin(th)]); }
      const col = q > 0.5 ? T.accent : rgba(T.muted, 0.6), wd = q > 0.5 ? 4.5 : 2.5;
      line(c, pts.slice(0, -2), col, wd); arrow(c, pts[pts.length - 3], pts[pts.length - 1], col, wd, {head: 16});
    });
    nodes.forEach(([txt], k) => {
      const [x, y] = pos[k], on = lit[k] > 0.5, wd = 270, hd = 56;
      if (fl[k] > 0) glow(c, x, y, 120, T.accent, 0.35 * fl[k]);
      rect(c, x - wd / 2, y - hd / 2, wd, hd, 8, rgba(T.deep, 0.95), on ? T.accent : rgba(T.border, 1), on ? 2.5 : 1.5);
      stage.text(txt, x, y + 1, {size: 26, weight: on ? 700 : 500, color: on ? T.light : T.muted, align: 'center'});
    });
    withAlpha(c, 0.4 + 0.6 * all, () => {
      stage.text('비에르크네스', cx, cy - 18, {size: 26, weight: 500, color: all > 0.5 ? T.light : T.muted, align: 'center'});
      stage.text('되먹임', cx, cy + 20, {role: 'display', size: 34, weight: 700, color: all > 0.5 ? T.accent : T.muted, align: 'center'});
    });
  });
}

/** schematic multi-year Niño 3.4 series (lanina, s11) */
function indexChart(stage, t, ctx, a) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, x0 = 60, y0 = 714, w = 960, h = 622;
  const tS = tl.at('s11'), grow = smooth((t - tS - 0.2) / 2.4);
  withAlpha(c, a, () => {
    panel(c, T, x0, y0, w, h, 0.97);
    stage.text('Niño 3.4 수온 편차 (°C)', 84, y0 + 34, {size: 26, weight: 700, color: T.ink});
    stage.text('3개월 평균 · 모양을 옮긴 그림', 996, y0 + 34, {size: 24, color: T.muted, align: 'right'});
    const gx0 = 150, gx1 = 990, gyc = y0 + 300, ky = 80, Y0 = 1995, Y1 = 2025.5, X = y => gx0 + (gx1 - gx0) * (y - Y0) / (Y1 - Y0);
    for (const v of [-2, -1, 0, 1, 2]) {
      line(c, [[gx0, gyc - v * ky], [gx1, gyc - v * ky]], rgba(T.border, v === 0 ? 1 : 0.6), v === 0 ? 1.5 : 1);
      stage.text(v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v), gx0 - 14, gyc - v * ky, {size: 24, color: T.muted, align: 'right'});
    }
    const yAx = gyc + 2.55 * ky;
    for (let y = 1995; y <= 2025; y += 5) { line(c, [[X(y), yAx], [X(y), yAx + 8]], rgba(T.muted, 0.8), 1.5); stage.text(String(y), X(y), yAx + 28, {size: 24, color: T.muted, align: 'center'}); }
    const thA = fadeIn(t, tl.at({sentence: 's11', word: '영점오도'}) - 0.2, 0.4);
    const yEnd = Y0 + (Y1 - Y0) * grow, pts = [];
    for (let y = Y0; y <= yEnd; y += 0.04) pts.push([X(y), gyc - oni(y) * ky, oni(y)]);
    if (pts.length > 1) {
      for (let i = 1; i < pts.length; i++) {
        const v = pts[i][2];
        if (Math.abs(v) >= THRESH) poly(c, [[pts[i - 1][0], gyc - Math.sign(v) * THRESH * ky], [pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]], [pts[i][0], gyc - Math.sign(v) * THRESH * ky]], rgba(v > 0 ? WARM : COLD, 0.5 + 0.35 * thA));
      }
      line(c, pts.map(p => [p[0], p[1]]), T.light, 2.4);
    }
    withAlpha(c, 0.35 + 0.65 * thA, () => { for (const v of [THRESH, -THRESH]) line(c, [[gx0, gyc - v * ky], [gx1, gyc - v * ky]], v > 0 ? WARM : COLD, 2, {dash: [8, 6]}); });
    // legend row + axis name
    const ly = y0 + h - 34;
    withAlpha(c, 0.4 + 0.6 * thA, () => {
      line(c, [[84, ly], [124, ly]], WARM, 2.5, {dash: [8, 5]}); stage.text('+0.5 이상 = 엘니뇨', 134, ly, {size: 24, weight: 700, color: WARM});
      line(c, [[400, ly], [440, ly]], COLD, 2.5, {dash: [8, 5]}); stage.text('−0.5 이하 = 라니냐', 450, ly, {size: 24, weight: 700, color: COLD});
    });
    stage.text('가로: 연도', 996, ly, {size: 24, color: T.muted, align: 'right'});
    // events
    const evs = [[1997.95, '1997–98', 1, 0], [2010.95, '2010–11', -1, 0], [2015.95, '2015–16', 1, 0], [2021.8, '2020–23', -1, -10], [2023.95, '2023–24', 1, 0]];
    for (const [y, lab, sg, dx] of evs) {
      const va = fadeIn(t, tS + 0.2 + 2.4 * (y - Y0) / (Y1 - Y0), 0.3); if (va <= 0) continue;
      const v = sg > 0 ? oni(y) : Math.min(oni(y), -1.3), yy = gyc - v * ky - sg * 24;
      withAlpha(c, va, () => stage.text(lab, X(y) + dx, yy, {size: 24, weight: 700, color: sg > 0 ? '#FFC79A' : ICE, align: 'center', shadow: '#000'}));
    }
    // irregular interval bracket over two El Niño peaks
    const ia = fadeIn(t, tl.at({sentence: 's11', word: '이년에서'}) - 0.2, 0.4);
    withAlpha(c, ia, () => {
      const xa = X(2002.9), xb = X(2006.9), yb = gyc - 1.75 * ky;
      line(c, [[xa, yb + 12], [xa, yb], [xb, yb], [xb, yb + 12]], T.accent, 2.5);
      stage.text('2~7년 · 불규칙', (xa + xb) / 2, yb - 24, {size: 26, weight: 700, color: T.accent, align: 'center', shadow: '#000'});
    });
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const titles = {
  hook: ['예측 질문', '바람이 약해지면\n한국의 겨울은?'],
  origin: ['기원 · 이름과 발견', '남자아이와 여자아이'],
  essence: ['본질 · 제1원리', '바람과 물의 되먹임'],
  normal: ['메커니즘 ① 평상시', '무역풍이 물을 서쪽으로'],
  elnino: ['메커니즘 ② 엘니뇨', '바람이 약해지면'],
  lanina: ['메커니즘 ④ 라니냐', '바람이 세지면'],
  teleconnect: ['원격 영향', '비 자리가 옮겨 가면'],
  winter: ['동아시아 겨울 · 경향', '포근한 쪽, 추운 쪽'],
  summer: ['동아시아 여름 · 경향', '엘니뇨 다음 해의 장마'],
  myth: ['오해 바로잡기', '정해진 날씨가 아닌 확률'],
  close: ['', ''],
};

let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const S = schOf(ctx), e = ctx.events.find(x => x.id === 'wind');
  const ok = e?.model && ['a', 'b', 'c', 'd', 't0', 't1'].every(k => Math.abs(e.model[k] - S[k]) < 1e-3);
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/el-nino-la-nina/scenes.mjs --emit-sound');
}

export const scenes = {
  // ------------------------------------------------------------------ hook: the stage at normal, Korea marked
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const a0 = fadeIn(t, 0.3, 0.8), la = fadeIn(t, 2.0, 0.6);
    withAlpha(c, a0, () => section(stage, t, 0, {x0: 60, y0: 420, w: 960, h: 500},
      {fs: 24, lab: {wind: la, warm: la, rise: la, sink: la, walker: la, up: la, eta: 0, depth: 0}}));
    // mini map, top right
    withAlpha(c, a0, () => {
      const M = makeMap(620, 150, 400, 220, 100, 290, -25, 55);
      mapBase(stage, M, 0, {cell: 4});
      const [ax, ay] = M.P(125, 0), [bx, by] = M.P(280, 0);
      rect(c, ax, ay - 6, bx - ax, 12, 3, rgba(T.light, 0.25), T.light, 1.5);
      stage.text('적도 단면', (ax + bx) / 2 + 40, ay + 28, {size: 24, weight: 500, color: T.light, align: 'center', shadow: '#000'});
      koreaMark(stage, M, t, 1, true, 24);
      line(c, [[(ax + bx) / 2, ay + 6], [(ax + bx) / 2, 420]], rgba(T.light, 0.4), 1.5, {dash: [4, 6]});
    });
    // the question
    const tA = evT(ctx, 'answer', A_ANSWER), ans = fadeIn(t, tA - 0.1, 0.4), qa = fadeIn(t, tl.at({sentence: 's01', word: '한국의'}) - 0.2, 0.5);
    withAlpha(c, qa, () => {
      stage.text('무역풍이 약해지면 → 한국의 겨울은?', 540, 976, {size: 30, weight: 700, color: T.ink, align: 'center'});
      const boxes = [[300, '더 추워질까', COLD, false], [780, '더 따뜻해질까', WARM, true]];
      for (const [x, txt, col, right] of boxes) {
        const on = right && ans > 0.5, off = !right && ans > 0.5;
        withAlpha(c, off ? 0.4 : 1, () => {
          rect(c, x - 210, 1020, 420, 120, 10, rgba(T.plate, 0.92), on ? col : rgba(T.border, 1), on ? 3 : 1.5);
          stage.text(txt, x, 1062, {role: 'display', size: 36, weight: 700, color: on ? col : T.ink, align: 'center'});
          stage.text(right ? (on ? '포근한 경향 · 엘니뇨 겨울' : '?') : '?', x, 1108, {size: 26, weight: 500, color: on ? T.light : T.muted, align: 'center'});
        });
        if (on) checkMark(c, x + 180, 1046, 1.1, col);
      }
      if (ctx.events.has('answer')) { const f = ctx.events.pulse('answer', t, 0.8); if (f > 0) ring(c, 780, 1080, 60 + 110 * (1 - f), rgba(WARM, f * 0.8), 3); }
    });
    const ka = fadeIn(t, tl.at({sentence: 's02', word: '그'}) - 0.1, 0.5);
    withAlpha(c, ka, () => {
      rect(c, 160, 1196, 760, 110, 10, rgba(T.plate, 0.85), rgba(T.border, 1), 1.5);
      stage.text('갈림길 = 무역풍의 세기', 540, 1228, {size: 28, weight: 700, color: T.ink, align: 'center'});
      const xs = [[300, '라니냐', COLD], [540, '평상', T.muted], [780, '엘니뇨', WARM]];
      line(c, [[220, 1272], [860, 1272]], rgba(T.border, 1), 3);
      for (const [x, lab, col] of xs) { circle(c, x, 1272, 6, col); stage.text(lab, x, 1272 + 0, {size: 24, weight: 700, color: col, align: 'center', shadow: '#000'}); }
      stage.text('바람 강', 196, 1272, {size: 24, color: T.muted, align: 'right'}); stage.text('바람 약', 884, 1272, {size: 24, color: T.muted});
    });
  },

  // ------------------------------------------------------------------ origin: names + timeline (Walker seesaw)
  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    // card 1: El Niño + Peru coast with Christmas warm current
    const a1 = fadeIn(t, tl.at('s03') - 0.3, 0.5), s3 = sentOn(ctx, t, 's03');
    withAlpha(c, a1, () => {
      rect(c, 60, 290, 960, 380, 10, rgba(T.plate, 0.9), s3 > 0.5 ? WARM : rgba(T.border, 1), s3 > 0.5 ? 2.5 : 1.5);
      stage.text('El Niño', 300, 370, {role: 'display', size: 72, weight: 700, color: WARM, align: 'center'});
      stage.text('엘니뇨 · 스페인어', 300, 432, {size: 26, color: T.muted, align: 'center'});
      const w1 = fadeIn(t, tl.at({sentence: 's03', word: '남자아이'}) - 0.1), w2 = fadeIn(t, tl.at({sentence: 's03', word: '아기'}) - 0.1);
      withAlpha(c, w1, () => stage.text('남자아이', 300, 500, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'}));
      withAlpha(c, w2, () => stage.text('= 아기 예수', 300, 556, {role: 'display', size: 34, weight: 500, color: T.light, align: 'center'}));
      const w3 = fadeIn(t, tl.at({sentence: 's03', word: '크리스마스'}) - 0.1);
      withAlpha(c, w3, () => stage.text('12월 · 크리스마스 무렵', 300, 616, {size: 26, weight: 500, color: WARM, align: 'center'}));
      // map
      const M = makeMap(560, 310, 430, 340, 262, 296, -22, 6);
      mapBase(stage, M, 0, {cell: 1});
      const wa = fadeIn(t, tl.at({sentence: 's03', word: '페루'}) - 0.2, 0.6);
      clipRect(c, M.x0, M.y0, M.w, M.h, 8, () => {
        withAlpha(c, wa, () => {
          // warm coastal water (smooth field) and the southward warm current
          const grow = 0.5 + 0.5 * smooth((t - tl.at({sentence: 's03', word: '크리스마스'})) / 1.5);
          anomField(stage, M, (lon, lat) => { const xc = 279.2 - 0.12 * Math.max(0, -lat - 4) * -1; const d = (lon - xc) / 3.2; return 1.8 * grow * Math.exp(-d * d) * smooth((lat + 16) / 6) * smooth((6 - lat) / 4); }, 0.4);
          for (const LL of LAND) poly(c, LL.map(([lo, la]) => M.P(lo, la)), LANDF, LANDS, 1.3);
          const pts = [M.P(276.5, 3), M.P(277.0, -1), M.P(277.5, -5), M.P(278.6, -9)];
          const cp = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 8; k++) cp.push([lerp(pts[i][0], pts[i + 1][0], k / 8), lerp(pts[i][1], pts[i + 1][1], k / 8)]);
          cp.push(pts[pts.length - 1]);
          pathArrow(c, cp, HOT, 6, smooth((t - tl.at({sentence: 's03', word: '따뜻한'}) + 0.3) / 1.0), 20);
        });
      });
      withAlpha(c, wa, () => {
        const [qx, qy] = M.P(265, 0); stage.text('적도', qx, qy - 16, {size: 24, color: T.muted});
        const [px, py] = M.P(283, -10);
        stage.text('페루', px + 10, py, {size: 26, weight: 700, color: T.ink});
        const [ex, ey] = M.P(281.5, -2);
        stage.text('에콰도르', ex + 8, ey, {size: 24, color: T.muted});
        const [wx, wy] = M.P(267, -15);
        stage.text('태평양', wx, wy, {size: 24, color: T.muted});
        const [fx, fy] = M.P(270.5, -6);
        stage.text('따뜻한 바닷물', fx, fy, {size: 24, weight: 700, color: '#FFC79A', shadow: '#000'});
      });
    });
    // card 2: La Niña
    const a2 = fadeIn(t, tl.at('s04') - 0.3, 0.5), s4 = sentOn(ctx, t, 's04');
    withAlpha(c, a2, () => {
      rect(c, 60, 690, 960, 190, 10, rgba(T.plate, 0.9), s4 > 0.5 ? COLD : rgba(T.border, 1), s4 > 0.5 ? 2.5 : 1.5);
      stage.text('La Niña', 300, 760, {role: 'display', size: 64, weight: 700, color: COLD, align: 'center'});
      stage.text('라니냐 · 스페인어', 300, 822, {size: 26, color: T.muted, align: 'center'});
      stage.text('여자아이', 760, 748, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
      withAlpha(c, fadeIn(t, tl.at({sentence: 's04', word: '반대'}) - 0.1), () => stage.text('반대 상태 · 1980년대에 정착', 760, 806, {size: 26, weight: 500, color: ICE, align: 'center'}));
    });
    // timeline: Walker 1924 → Bjerknes 1969 → ENSO (on screen only)
    const tT = tl.at({sentence: 's03', word: '붙인'}) - 0.3, ly = 950;
    const nodes = [[220, '1924', '워커', '남방진동 발견'], [540, '1969', '비에르크네스', '바다 ↔ 바람 연결'], [860, 'ENSO', '엘니뇨 + 남방진동', '하나의 현상']];
    withAlpha(c, fadeIn(t, tT, 0.5), () => {
      line(c, [[100, ly], [980, ly]], rgba(T.border, 1), 3);
      nodes.forEach(([x, top, l1, l2], i) => {
        const a = fadeIn(t, tT + 0.2 + i * 1.6, 0.5);
        withAlpha(c, 0.3 + 0.7 * a, () => {
          circle(c, x, ly, 9, i === 2 ? T.accent : T.ink);
          stage.text(top, x, ly - 38, {role: 'display', size: 34, weight: 700, color: i === 2 ? T.accent : T.ink, align: 'center'});
          stage.text(l1, x, ly + 38, {size: 26, weight: 700, color: T.ink, align: 'center'});
          stage.text(l2, x, ly + 72, {size: 24, color: T.muted, align: 'center'});
        });
      });
      // seesaw: Tahiti ↔ Darwin sea-level pressure
      const sa = fadeIn(t, tT + 0.4, 0.5), ang = 0.16 * Math.sin(t * 1.3), cx = 220, cy = 1180, Lh = 150;
      withAlpha(c, sa, () => {
        poly(c, [[cx, cy], [cx - 22, cy + 40], [cx + 22, cy + 40]], rgba(T.muted, 0.9));
        const e1 = [cx - Lh * Math.cos(ang), cy - Lh * Math.sin(ang)], e2 = [cx + Lh * Math.cos(ang), cy + Lh * Math.sin(ang)];
        line(c, [e1, e2], T.ink, 6);
        circle(c, e1[0], e1[1] - 14, 12, WARM); circle(c, e2[0], e2[1] - 14, 12, COLD);
        stage.text('다윈', e1[0], e1[1] - 46, {size: 24, weight: 700, color: T.ink, align: 'center'});
        stage.text('타히티', e2[0], e2[1] - 46, {size: 24, weight: 700, color: T.ink, align: 'center'});
        stage.text('해면기압 시소', cx, cy + 74, {size: 24, color: T.muted, align: 'center'});
      });
      // Bjerknes: a tiny wind ↔ water loop
      withAlpha(c, fadeIn(t, tT + 2.0, 0.5), () => miniLoop(stage, t, 540, 1190, 60, 1));
      withAlpha(c, fadeIn(t, tT + 3.6, 0.5), () => {
        stage.text('El Niño', 860, 1150, {role: 'display', size: 30, weight: 700, color: WARM, align: 'center'});
        stage.text('+ Southern Oscillation', 860, 1192, {size: 24, color: T.ink, align: 'center'});
        stage.text('바다 + 대기', 860, 1236, {size: 24, color: T.muted, align: 'center'});
      });
    });
  },

  // ------------------------------------------------------------------ essence: the loop, large
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const cx = 540, top = [540, 440], bot = [540, 1000], R = 112;
    const tP = evT(ctx, 'ess_push', A_ESS[0]), tM = evT(ctx, 'ess_make', A_ESS[1]);
    const qP = smooth((t - tP + 0.1) / 0.8), qM = smooth((t - tM + 0.1) / 0.8), a = fadeIn(t, tl.at('s05') - 0.3, 0.5);
    withAlpha(c, a, () => {
      // nodes
      for (const [P, name, sub, col] of [[top, '바람', '무역풍 · 동 → 서', WIND], [bot, '물', '따뜻한 바닷물', WARM]]) {
        circle(c, P[0], P[1], R, rgba(T.plate, 0.95)); ring(c, P[0], P[1], R, col, 3);
        stage.text(name, P[0], P[1] - 12, {role: 'display', size: 56, weight: 700, color: col, align: 'center'});
        stage.text(sub, P[0], P[1] + 40, {size: 24, color: T.muted, align: 'center'});
      }
      // wind streaks in the top node, water layer in the bottom node
      clipRect(c, top[0] - R, top[1] - R, 2 * R, 2 * R, R, () => {
        for (let k = 0; k < 3; k++) { const x = top[0] + 60 - ((t * 60 + k * 50) % 150); arrow(c, [x + 24, top[1] + 74 + k * 0], [x - 24, top[1] + 74], rgba(WIND, 0.6), 2, {head: 9}); }
      });
      clipRect(c, bot[0] - R, bot[1] - R, 2 * R, 2 * R, R, () => {
        poly(c, [[bot[0] - R, bot[1] + 62], [bot[0] + R, bot[1] + 76], [bot[0] + R, bot[1] + R], [bot[0] - R, bot[1] + R]], rgba(WARM, 0.45));
      });
      // right arc: wind pushes the warm water west (top → bottom)
      const right = curve([top[0] + R + 8, top[1] + 40], [bot[0] + R + 8, bot[1] - 40], -110, 40);
      const left = curve([bot[0] - R - 8, bot[1] - 40], [top[0] - R - 8, top[1] + 40], -110, 40);
      line(c, right, rgba(T.border, 1), 3); line(c, left, rgba(T.border, 1), 3);
      pathArrow(c, right, T.accent, 6, qP, 22);
      pathArrow(c, left, T.accent, 6, qM, 22);
      const fP = ctx.events.has('ess_push') ? ctx.events.pulse('ess_push', t, 0.8) : 0, fM = ctx.events.has('ess_make') ? ctx.events.pulse('ess_make', t, 0.8) : 0;
      if (fP > 0) glow(c, right[20][0], right[20][1], 90, T.accent, 0.4 * fP);
      if (fM > 0) glow(c, left[20][0], left[20][1], 90, T.accent, 0.4 * fM);
      withAlpha(c, 0.35 + 0.65 * qP, () => {
        stage.text('① 밀어 둔다', 860, 690, {role: 'display', size: 34, weight: 700, color: qP > 0.5 ? T.light : T.muted, align: 'center'});
        stage.text('따뜻한 물을', 860, 738, {size: 24, color: T.muted, align: 'center'});
        stage.text('서쪽에 쌓음', 860, 770, {size: 24, color: T.muted, align: 'center'});
      });
      withAlpha(c, 0.35 + 0.65 * qM, () => {
        stage.text('② 다시 만든다', 220, 690, {role: 'display', size: 34, weight: 700, color: qM > 0.5 ? T.light : T.muted, align: 'center'});
        stage.text('서쪽 상승 기류가', 220, 738, {size: 24, color: T.muted, align: 'center'});
        stage.text('무역풍을 유지', 220, 770, {size: 24, color: T.muted, align: 'center'});
      });
      withAlpha(c, qM, () => {
        stage.text('되먹임', cx, 724, {role: 'display', size: 44, weight: 700, color: T.accent, align: 'center'});
      });
      withAlpha(c, fadeIn(t, tM + 0.8, 0.6), () => {
        rect(c, 120, 1180, 840, 130, 10, rgba(T.plate, 0.85), rgba(T.border, 1), 1.5);
        stage.text('변수 둘: 무역풍 세기 ↔ 동태평양 수온', 540, 1222, {size: 28, weight: 700, color: T.ink, align: 'center'});
        stage.text('한쪽이 바뀌면 다른 쪽이 그 변화를 키운다 (양의 되먹임)', 540, 1270, {size: 24, color: T.muted, align: 'center'});
      });
    });
  },

  // ------------------------------------------------------------------ normal: 3-tier dashboard at s = 0
  normal(stage, t, p, ctx) {
    const {ctx: c} = stage, tl = ctx.tl;
    checkSoundTable(ctx);
    const w6 = word => fadeIn(t, tl.at({sentence: 's06', word}) - 0.15, 0.4), w7 = word => fadeIn(t, tl.at({sentence: 's07', word}) - 0.15, 0.4);
    const s7 = sentOn(ctx, t, 's07'), walkerHi = t >= tl.at({sentence: 's07', word: '순환이'}) - 0.15;
    section(stage, t, 0, B_SEC, {walkerHi, lab: {wind: w6('무역풍은'), warm: w6('쌓여'), eta: w6('오십'), depth: w6('쌓여'), up: w6('솟습니다'),
      rise: w7('올라가'), sink: w7('내려와'), walker: Math.max(0.25, w7('올라가')) * (0.6 + 0.4 * s7 + (walkerHi ? 0.4 : 0)), windA: 1}});
    basinMap(stage, t, 0);
    readouts(stage, t, ctx, 0);
    void c;
  },

  // ------------------------------------------------------------------ elnino: s 0 → +1, then the feedback loop
  elnino(stage, t, p, ctx) {
    const {ctx: c} = stage, tl = ctx.tl, S = schOf(ctx), s = sOf(t, S);
    const dsdt = (sOf(t + 0.05, S) - sOf(t - 0.05, S)) / 0.1, rampQ = clamp((t - S.a) / (S.b - S.a));
    const flow = clamp(dsdt * (S.b - S.a) / 2.2, -1, 1);
    const bump = u => 35 * Math.sin(Math.PI * rampQ) * Math.exp(-(((u - (0.1 + 0.85 * rampQ)) / 0.1) ** 2));
    const w8 = word => fadeIn(t, tl.at({sentence: 's08', word}) - 0.15, 0.4);
    section(stage, t, s, B_SEC, {flow, bump, lab: {wind: 1, warm: 1, eta: 1, depth: 1, up: 1, upOff: w8('멈춰'), rise: w8('흘러가고'), sink: 0.6, walker: 0.8, dry: 1, windA: 1}});
    const fa = fadeIn(t, tl.at('s09') - 0.4, 0.5);
    withAlpha(c, 1 - fa * 0.85, () => basinMap(stage, t, s));
    if (fa > 0) feedbackLoop(stage, t, ctx, B_MAP, fa);
    readouts(stage, t, ctx, s);
  },

  // ------------------------------------------------------------------ lanina: s → −1, then the index chart
  lanina(stage, t, p, ctx) {
    const {ctx: c} = stage, tl = ctx.tl, S = schOf(ctx), s = sOf(t, S);
    const dsdt = (sOf(t + 0.05, S) - sOf(t - 0.05, S)) / 0.1, flow = clamp(dsdt * NINA_RAMP / 3, -1, 1);
    const w10 = word => fadeIn(t, tl.at({sentence: 's10', word}) - 0.15, 0.4);
    section(stage, t, s, B_SEC, {flow, lab: {wind: 1, warm: 0.5, eta: 1, depth: 1, up: w10('솟고'), rise: w10('무역풍이'), sink: 0.6, walker: 0.8, windA: 1}});
    const ca = fadeIn(t, tl.at('s11') - 0.5, 0.6);
    withAlpha(c, 1 - ca, () => { basinMap(stage, t, s); readouts(stage, t, ctx, s); });
    if (ca > 0) indexChart(stage, t, ctx, ca);
  },

  // ------------------------------------------------------------------ teleconnect: rain moves, a wave reaches East Asia
  teleconnect(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const M = makeMap(60, 290, 960, 620, 100, 215, -15, 55);
    mapBase(stage, M, 1, {cell: 2});
    const mv = smooth((t - tl.at(A_RAIN_MOVE0) + 0.2) / Math.max(0.6, tl.at(A_RAIN_MOVE1) - tl.at(A_RAIN_MOVE0) + 0.6));
    const lam = lerp(140, LAM_of(1), mv), [ox, oy] = M.P(140, 2), [nx, ny] = M.P(lam, 2);
    const tSrc = evT(ctx, 'tc_src', A_TC_SRC), tArr = evT(ctx, 'tc_arrive', A_TC_ARR);
    const anti = smooth((t - tArr + 0.1) / 0.8);
    clipRect(c, M.x0, M.y0, M.w, M.h, 8, () => {
      // old rain place (dashed), new rain place
      withAlpha(c, mv, () => cloud(c, ox, oy - 20, 30, t, oy, 0.9, true));
      cloud(c, nx, ny - 26, 26, t, ny + 8, 1);
      // wave train: fronts travelling from the central Pacific to East Asia, then a standing pattern
      const path = curve(M.P(196, 8), M.P(143, 19), 90, 60);
      line(c, path, rgba(T.light, 0.25 + 0.25 * fadeIn(t, tSrc - 0.3)), 2, {dash: [6, 8]});
      const q = clamp((t - tSrc) / (tArr - tSrc));
      if (t >= tSrc - 0.05) {
        for (let k = 0; k < 4; k++) {
          const u = q - k * 0.1; if (u < 0 || (q >= 1 && k === 0 && t > tArr + 0.6)) continue;
          const i = Math.min(path.length - 2, Math.floor(u * (path.length - 1))), A = path[i], B = path[i + 1], th = Math.atan2(B[1] - A[1], B[0] - A[0]);
          const al = (1 - k * 0.25) * (t < tArr + 1.2 ? 1 : 0.5);
          ring(c, A[0], A[1], 34 - k * 4, rgba(T.light, 0.85 * al), 3, th - 0.9, th + 0.9);
        }
        const f1 = ctx.events.has('tc_src') ? ctx.events.pulse('tc_src', t, 0.8) : 0;
        if (f1 > 0) ring(c, nx, ny, 30 + 70 * (1 - f1), rgba(T.light, f1), 3);
      }
      // anomalous anticyclone east of the Philippines + southerly towards Korea
      const [hx, hy] = M.P(136, 17);
      gyre(c, hx, hy, 92, 70, +1, WARM, t, anti, 3, '고', stage);
      const f2 = ctx.events.has('tc_arrive') ? ctx.events.pulse('tc_arrive', t, 1.0) : 0;
      if (f2 > 0) ring(c, hx, hy, 60 + 90 * (1 - f2), rgba(WARM, f2), 3);
      const sp = curve(M.P(123, 16), M.P(127, 33), -30, 24);
      pathArrow(c, sp, HOT, 7, smooth((t - tArr - 0.6) / 0.8), 22);
    });
    // labels
    withAlpha(c, mv, () => {
      const y = oy + 60;
      line(c, [[ox, y], [nx, y]], T.light, 2.5); line(c, [[ox, y - 10], [ox, y + 10]], T.light, 2.5); line(c, [[nx, y - 10], [nx, y + 10]], T.light, 2.5);
      stage.text('수천 km', (ox + nx) / 2, y + 26, {size: 28, weight: 700, color: T.light, align: 'center', shadow: '#000'});
      stage.text('평소 비 자리 · 비 줄어듦', ox, oy + 104, {size: 24, color: CLOUD, align: 'center', shadow: '#000'});
    });
    stage.text('엘니뇨의 비 자리', nx - 6, ny - 84, {size: 24, weight: 700, color: T.ink, align: 'center', shadow: '#000'});
    withAlpha(c, fadeIn(t, tSrc - 0.2), () => { const [x, y] = M.P(172, 25); stage.text('대기의 물결', x, y, {size: 26, weight: 700, color: T.light, align: 'center', shadow: '#000'}); });
    withAlpha(c, anti, () => {
      const [x, y] = M.P(136, 17);
      stage.text('필리핀해 고기압 (편차)', x + 34, y - 96, {size: 26, weight: 700, color: WARM, align: 'center', shadow: '#000'});
    });
    withAlpha(c, smooth((t - tArr - 0.8) / 0.6), () => { const [x, y] = M.P(110.5, 20); stage.text('남풍 편차 (경향)', x, y, {size: 24, weight: 700, color: '#FFC79A', align: 'center', shadow: '#000'}); });
    koreaMark(stage, M, t);
    // bottom: route strip and readouts
    const y0 = 940, h = 396;
    panel(c, T, 60, y0, 960, h);
    stage.text('비구름 중심', 84, y0 + 40, {size: 24, color: T.muted});
    stage.text(`${lonLabel(140)} → ${lonLabel(lam)}`, 84, y0 + 82, {role: 'display', size: 36, weight: 500, color: T.ink});
    stage.text('Niño 3.4', 600, y0 + 40, {size: 24, color: T.muted});
    stage.text(`${sgn(T_of(1))} °C · 엘니뇨`, 600, y0 + 82, {role: 'display', size: 36, weight: 500, color: WARM});
    // pulse route: central Pacific → Philippine Sea → Korea
    const rx0 = 200, rx1 = 900, ry = y0 + 210;
    line(c, [[rx0, ry], [rx1, ry]], rgba(T.border, 1), 3);
    const stops = [[rx1, '중앙 태평양', '비 늘어남'], [(rx0 + rx1) / 2, '필리핀해', '고기압 편차'], [rx0, '한국', '남풍 · 포근한 경향']];
    for (const [x, l1, l2] of stops) { circle(c, x, ry, 8, T.ink); stage.text(l1, x, ry - 36, {size: 26, weight: 700, color: T.ink, align: 'center'}); stage.text(l2, x, ry + 38, {size: 24, color: T.muted, align: 'center'}); }
    if (t >= tSrc) {
      const u = t < tArr ? 0.5 * clamp((t - tSrc) / (tArr - tSrc)) : 0.5 + 0.5 * smooth((t - tArr - 0.6) / 0.8), x = lerp(rx1, rx0, u);
      line(c, [[rx1, ry], [x, ry]], T.light, 4); glow(c, x, ry, 30, T.light, 0.6); circle(c, x, ry, 7, T.light);
    }
    stage.text('비 자리 이동 → 대기의 물결 → 고기압 편차 → 바람 방향', 540, y0 + 330, {size: 24, color: T.muted, align: 'center'});
  },

  // ------------------------------------------------------------------ winter: split comparison
  winter(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const tR = tl.at('s14') - 0.3, sw = smooth((t - tR) / 0.6);
    const sides = [
      {x0: 60, title: '엘니뇨 겨울 (경향)', col: WARM, s: 1, a: 1 - 0.55 * sw},
      {x0: 550, title: '라니냐 겨울 (경향)', col: COLD, s: -1, a: sw},
    ];
    withAlpha(c, 0.4 * (1 - sw), () => {
      rect(c, 550, 286, 470, 1050, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
      stage.text('라니냐 겨울 (경향)', 785, 326, {role: 'display', size: 30, weight: 700, color: COLD, align: 'center'});
    });
    for (const [k, S] of sides.entries()) {
      withAlpha(c, S.a, () => {
        const on = k === 0 ? sw < 0.5 : sw > 0.5;
        rect(c, S.x0, 286, 470, 1050, 10, rgba(T.plate, 0.9), on ? S.col : rgba(T.border, 1), on ? 2.5 : 1.5);
        stage.text(S.title, S.x0 + 235, 326, {role: 'display', size: 30, weight: 700, color: S.col, align: 'center'});
        const M = makeMap(S.x0 + 14, 356, 442, 500, 100, 160, 5, 60);
        mapBase(stage, M, S.s, {sst: 0});
        const [hx, hy] = M.P(134, 17);
        clipRect(c, M.x0, M.y0, M.w, M.h, 8, () => {
          if (k === 0) {
            gyre(c, hx, hy, 64, 50, +1, WARM, t, 1, 3, '고', stage);
            const wq = smooth((t - evT(ctx, 'winter_warm', A_WARM) + 0.3) / 0.9);
            for (const [a, b, bend] of [[[121, 17], [126.5, 34.5], -20], [[127, 20], [131, 34], -16]]) pathArrow(c, curve(M.P(...a), M.P(...b), bend, 20), HOT, 6, wq, 20);
            // southern Korea / Japan rain marks
            const ra = fadeIn(t, tl.at({sentence: 's13', word: '포근한'}) - 0.2, 0.5);
            withAlpha(c, ra, () => { for (let i = 0; i < 8; i++) { const [x, y] = M.P(124 + i * 2.2, 31 + (i % 2) * 1.5); line(c, [[x, y], [x - 5, y + 14]], ICE, 2.5); } });
          } else {
            gyre(c, hx, hy, 64, 50, -1, COLD, t, 1, 3, '저', stage);
            const cq = smooth((t - evT(ctx, 'winter_cold', A_COLD) + 0.3) / 0.9);
            for (const [a, b, bend] of [[[108, 54], [125.5, 38.5], 30], [[116, 55], [128.5, 38], 24], [[124, 55.5], [132, 39], 18]]) pathArrow(c, curve(M.P(...a), M.P(...b), bend, 20), ICE, 6, cq, 20);
            const [sx, sy] = M.P(117, 57.6);
            stage.text('시베리아 찬 공기', sx, sy, {size: 24, weight: 700, color: ICE, align: 'center', shadow: '#000'});
          }
        });
        koreaMark(stage, M, t, 1, true, 24);
        stage.text(k === 0 ? '필리핀해 고기압 편차' : '필리핀해 저기압 편차', hx, hy + 76, {size: 24, weight: 500, color: S.col, align: 'center', shadow: '#000'});
        // thermometer + impact labels
        const lvl = k === 0 ? 0.62 : 0.3;
        thermo(stage, S.x0 + 80, 1060, 150, lvl, k === 0 ? HOT : COLD);
        stage.text('한국 기온', S.x0 + 130, 930, {size: 24, color: T.muted});
        stage.text(k === 0 ? '평년보다 높은 경향' : '평년보다 낮은 경향', S.x0 + 130, 970, {size: 26, weight: 700, color: S.col});
        const lines = k === 0 ? ['포근한 경향', '남부 강수 증가 경향'] : ['한파 잦은 경향', '예: 2010~11 · 2022~23 겨울'];
        lines.forEach((L, i) => stage.text(L, S.x0 + 130, 1024 + i * 40, {size: i ? 24 : 28, weight: i ? 500 : 700, color: i ? T.ink : T.light}));
        // state bar
        const bx0 = S.x0 + 50, bx1 = S.x0 + 420, by = 1240, xs = v => lerp(bx0, bx1, (v + 1) / 2);
        line(c, [[bx0, by], [bx1, by]], rgba(T.border, 1), 4);
        stage.text('라니냐', bx0, by + 32, {size: 24, color: COLD, align: 'center'}); stage.text('엘니뇨', bx1, by + 32, {size: 24, color: WARM, align: 'center'});
        stage.text('평상', (bx0 + bx1) / 2, by + 32, {size: 24, color: T.muted, align: 'center'});
        circle(c, xs(S.s), by, 11, S.col); ring(c, xs(S.s), by, 17, rgba(S.col, 0.6), 2);
        stage.text('Niño 3.4', (bx0 + bx1) / 2, by - 66, {size: 24, color: T.muted, align: 'center'});
        stage.text(`${sgn(T_of(S.s))} °C`, (bx0 + bx1) / 2, by - 32, {role: 'display', size: 30, weight: 500, color: S.col, align: 'center'});
      });
    }
  },

  // ------------------------------------------------------------------ summer: decaying El Niño, 장마 front
  summer(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const M = makeMap(60, 286, 960, 700, 100, 160, 6, 50);
    mapBase(stage, M, S_SUMMER, {sst: 0});
    const fq = smooth((t - evT(ctx, 'front', A_FRONT) + 0.4) / 1.0), mq = fadeIn(t, tl.at({sentence: 's15', word: '수증기를'}) - 0.3, 0.6);
    const rq = fadeIn(t, tl.at({sentence: 's15', word: '큰비가'}) - 0.3, 0.6);
    const FRONT = [[104, 26.5], [110, 28.0], [116, 29.6], [122, 31.4], [127, 33.6], [132, 34.6], [138, 35.6], [146, 37.6], [156, 39.5]];
    clipRect(c, M.x0, M.y0, M.w, M.h, 8, () => {
      const [hx, hy] = M.P(140, 21);
      gyre(c, hx, hy, 170, 120, +1, WARM, t, 1, 3.5, '고', stage);
      // moisture transport along the western flank
      withAlpha(c, mq, () => {
        for (const [i, pts] of [[[112, 10], [116, 18], [117, 25], [118.5, 28.4], [121, 29.4]], [[118, 9], [121, 17], [123, 25], [124.5, 30.0], [127, 31.6]], [[124, 9], [127, 16], [129, 25], [131, 31.4], [134, 33.0]]].entries()) {
          const P = pts.map(q => M.P(...q)), cp = [];
          for (let j = 0; j < P.length - 1; j++) for (let k = 0; k < 10; k++) { const u = k / 10; cp.push([lerp(P[j][0], P[j + 1][0], u), lerp(P[j][1], P[j + 1][1], u)]); }
          cp.push(P[P.length - 1]);
          line(c, cp.slice(0, -2), rgba(MOIST, 0.85), 6 - i * 0.5); arrow(c, cp[cp.length - 3], cp[cp.length - 1], MOIST, 6, {head: 20});
          for (let d = 0; d < 3; d++) { const q = ((t * 0.35 + d / 3 + i * 0.13) % 1), pp = cp[Math.floor(q * (cp.length - 1))]; circle(c, pp[0], pp[1], 4.5, '#DFFCF4'); }
        }
      });
      // stationary front: red semicircles (north side) and blue triangles (south side), alternating
      const FP = FRONT.map(q => M.P(...q)), dense = [];
      for (let j = 0; j < FP.length - 1; j++) for (let k = 0; k < 20; k++) { const u = k / 20; dense.push([lerp(FP[j][0], FP[j + 1][0], u), lerp(FP[j][1], FP[j + 1][1], u)]); }
      const nShow = Math.floor(dense.length * fq);
      if (nShow > 2) {
        const dp = dense.slice(0, nShow);
        line(c, dp, '#E8EEF0', 3.5);
        for (let i = 6; i < nShow - 6; i += 14) {
          const A = dense[i - 3], B = dense[i + 3], th = Math.atan2(B[1] - A[1], B[0] - A[0]), m = dense[i], nx = Math.sin(th), ny = -Math.cos(th);
          if ((i / 14 | 0) % 2 === 0) {
            c.beginPath(); c.arc(m[0], m[1], 10, th + Math.PI, th + TAU); c.fillStyle = '#E2574A'; c.fill();
          } else poly(c, [[m[0] - Math.cos(th) * 11, m[1] - Math.sin(th) * 11], [m[0] + Math.cos(th) * 11, m[1] + Math.sin(th) * 11], [m[0] - nx * 15, m[1] - ny * 15]], '#4C8FD6');
        }
      }
      // heavier rain markers along the front (south China, Korea, Japan)
      withAlpha(c, rq, () => {
        for (let i = 0; i < 46; i++) {
          const u = rand(i * 3 + 1), lon = 105 + u * 40, lat = 27 + (lon - 105) * 0.21 - 1.5 + rand(i * 7) * 3.5;
          const heavy = (lon > 109 && lon < 120) || (lon > 125 && lon < 130);
          if (!heavy && rand(i * 5) > 0.45) continue;
          const [x, y] = M.P(lon, lat), ph = (t * 2.2 + rand(i)) % 1;
          line(c, [[x + 4, y - 10 + ph * 22], [x - 2, y + 6 + ph * 22]], rgba(ICE, 0.9), heavy ? 3 : 2);
        }
      });
    });
    koreaMark(stage, M, t);
    // labels
    withAlpha(c, fq, () => { const [x, y] = M.P(146, 41.5); stage.text('장마 전선', x, y, {role: 'display', size: 30, weight: 700, color: '#E8EEF0', align: 'center', shadow: '#000'}); });
    withAlpha(c, mq, () => { const [x, y] = M.P(108.5, 15); stage.text('수증기 수송', x, y, {size: 26, weight: 700, color: MOIST, align: 'center', shadow: '#000'}); stage.text('(경향)', x, y + 32, {size: 24, weight: 500, color: MOIST, align: 'center', shadow: '#000'}); });
    { const [x, y] = M.P(146, 11); stage.text('필리핀해 고기압 (편차)', x, y, {size: 26, weight: 700, color: WARM, align: 'center', shadow: '#000'}); stage.text('여름까지 남는 경향', x, y + 34, {size: 24, color: T.ink, align: 'center', shadow: '#000'}); }
    withAlpha(c, rq, () => { const [x, y] = M.P(112, 35.5); stage.text('큰비 잦은 경향', x, y, {size: 26, weight: 700, color: ICE, align: 'center', shadow: '#000'}); });
    withAlpha(c, fadeIn(t, tl.at({sentence: 's15', word: '천구백구십팔년'}) - 0.3, 0.5), () => {
      const [x, y] = M.P(110, 22.5);
      rect(c, x - 150, y - 24, 300, 48, 6, rgba(T.deep, 0.85), T.accent, 2);
      stage.text('1998 · 2016 중국 남부 홍수', x, y, {size: 24, weight: 700, color: T.light, align: 'center'});
    });
    // bottom: ENSO state strip winter → summer
    const y0 = 1002, h = 334;
    panel(c, T, 60, y0, 960, h);
    stage.text('엘니뇨가 약해지는 해', 84, y0 + 36, {size: 26, weight: 700, color: T.ink});
    stage.text(`여름 Niño 3.4 ${sgn(T_of(S_SUMMER))} °C`, 996, y0 + 36, {size: 26, weight: 500, color: WARM, align: 'right'});
    const gx0 = 150, gx1 = 930, gyc = y0 + 200, ky = 50, mon = ['겨울', '봄', '여름'];
    line(c, [[gx0, gyc], [gx1, gyc]], rgba(T.border, 1), 1.5);
    line(c, [[gx0, gyc - THRESH * ky], [gx1, gyc - THRESH * ky]], rgba(WARM, 0.8), 1.5, {dash: [6, 6]});
    const sCurve = u => lerp(1, S_SUMMER, smooth(u * 1.15)), pts = [];
    for (let u = 0; u <= 1.001; u += 0.02) pts.push([lerp(gx0, gx1, u), gyc - T_of(sCurve(u)) * ky]);
    line(c, pts, T.light, 3);
    mon.forEach((m, i) => { const x = lerp(gx0, gx1, i / 2); line(c, [[x, gyc + 4], [x, gyc + 14]], rgba(T.muted, 0.8), 1.5); stage.text(m, x, gyc + 40, {size: 24, color: T.muted, align: 'center'}); });
    const xn = gx1, yn = gyc - T_of(S_SUMMER) * ky; circle(c, xn, yn, 7, TRACK); ring(c, xn, yn, 14, rgba(TRACK, 0.6), 2);
    stage.text('+0.5', gx0 - 12, gyc - THRESH * ky, {size: 24, color: WARM, align: 'right'});
    stage.text('수온은 내려가도 고기압은 남는 경향', 540, y0 + 300, {size: 24, color: T.muted, align: 'center'});
  },

  // ------------------------------------------------------------------ myth: tilted probabilities, not certainty
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const tX = evT(ctx, 'myth_x', A_MYTH_X), tOK = evT(ctx, 'myth_ok', A_MYTH_OK), tD = tl.at(A_MYTH_DIALS);
    const ax = fadeIn(t, tl.at('s16') + 0.6, 0.5), xq = fadeIn(t, tX - 0.1, 0.3), oq = fadeIn(t, tOK - 0.1, 0.3);
    withAlpha(c, ax, () => {
      rect(c, 90, 290, 900, 96, 10, rgba(T.plate, 0.9), xq > 0.5 ? T.accent : rgba(T.border, 1), 2);
      stage.text('엘니뇨 겨울 = 반드시 포근?', 500, 338, {role: 'display', size: 36, weight: 700, color: xq > 0.5 ? T.muted : T.ink, align: 'center'});
      if (xq > 0) withAlpha(c, xq, () => { crossMark(c, 910, 338, 1.4, T.accent); line(c, [[200, 338], [800, 338]], rgba(T.accent, 0.8), 3); });
    });
    withAlpha(c, oq, () => {
      rect(c, 90, 404, 900, 96, 10, rgba(T.plate, 0.9), T.accent2, 2);
      stage.text('확률이 기우는 경향', 500, 452, {role: 'display', size: 36, weight: 700, color: T.light, align: 'center'});
      checkMark(c, 910, 452, 1.4, T.accent2);
    });
    // probability bars
    const tilt = smooth((t - tOK + 0.1) / 1.0), ba = fadeIn(t, tX + 0.3, 0.5);
    withAlpha(c, ba, () => {
      const bx0 = 260, bx1 = 960, rows = [['평년', [1 / 3, 1 / 3, 1 / 3]], ['엘니뇨 겨울', [lerp(1 / 3, 0.2, tilt), 1 / 3, lerp(1 / 3, 0.467, tilt)]]];
      stage.text('한국 겨울 기온이 어느 쪽일 확률 (그림 예시)', 540, 560, {size: 24, color: T.muted, align: 'center'});
      rows.forEach(([lab, f], i) => {
        const y = 630 + i * 110;
        stage.text(lab, bx0 - 20, y - (i ? 14 : 0), {size: 26, weight: 700, color: i ? WARM : T.ink, align: 'right'});
        if (i) stage.text('(경향)', bx0 - 20, y + 18, {size: 24, weight: 500, color: WARM, align: 'right'});
        let x = bx0; const cols = [COLD, '#5E7178', WARM], names = ['추움', '보통', '포근'];
        f.forEach((q, j) => { const w = (bx1 - bx0) * q; rect(c, x + 2, y - 30, w - 4, 60, 6, rgba(cols[j], 0.85)); stage.text(names[j], x + w / 2, y, {size: 24, weight: 700, color: '#06141C', align: 'center'}); x += w; });
      });
      withAlpha(c, tilt, () => stage.text('결과가 정해지지 않고, 포근한 쪽이 조금 더 나올 뿐', 540, 820, {size: 24, color: T.ink, align: 'center'}));
    });
    // die (rolling) — outcome varies year to year
    withAlpha(c, ba, () => {
      const face = 1 + (Math.floor(t * 3.2) % 6), x = 540, y = 960, s = 54, rot = 0.25 * Math.sin(t * 3.2 * Math.PI);
      c.save(); c.translate(x, y); c.rotate(rot);
      rect(c, -s, -s, 2 * s, 2 * s, 16, rgba(T.ink, 0.95), rgba(T.muted, 1), 2);
      const pip = {1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]}[face];
      for (const [px, py] of pip) circle(c, px * s * 0.5, py * s * 0.5, 8, '#06141C');
      c.restore();
      stage.text('해마다 다시 던지는 주사위', 540, 1046, {size: 24, color: T.muted, align: 'center'});
    });
    // other dials
    const da = fadeIn(t, tD - 0.3, 0.5);
    withAlpha(c, 0.25 + 0.75 * da, () => {
      const dials = [['ENSO', 0.7], ['북극진동', -0.4], ['인도양', 0.2], ['그해의 조건', -0.1]];
      dials.forEach(([lab, v], i) => {
        const x = 180 + i * 240, y = 1200, r = 46, on = i > 0 && da > 0.5;
        ring(c, x, y, r, on ? T.accent : rgba(T.muted, 0.8), 2.5, Math.PI, TAU);
        for (let k = 0; k <= 6; k++) { const th = Math.PI + k * Math.PI / 6; line(c, [[x + Math.cos(th) * (r - 8), y + Math.sin(th) * (r - 8)], [x + Math.cos(th) * r, y + Math.sin(th) * r]], rgba(T.muted, 0.8), 1.5); }
        const th = -Math.PI / 2 + (v + 0.25 * Math.sin(t * (1.1 + i * 0.37) + i) * (i ? 1 : 0.2)) * 1.2;
        line(c, [[x, y], [x + Math.cos(th) * (r - 6), y + Math.sin(th) * (r - 6)]], i === 0 ? WARM : T.ink, 3);
        circle(c, x, y, 5, T.ink);
        stage.text(lab, x, y + 36, {size: 24, weight: on || i === 0 ? 700 : 500, color: i === 0 ? WARM : on ? T.light : T.muted, align: 'center'});
      });
      stage.text('다른 조건이 겹쳐 결과가 달라짐', 540, 1290, {size: 24, color: T.muted, align: 'center'});
    });
  },

  // ------------------------------------------------------------------ close
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme;
    stage.text('정리', 540, 430, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, alpha: smooth(p / 0.15)});
    endCard(stage, {takeaway: '“바람이 따뜻한 물을\n서쪽으로 밀어 두고,\n그 물이 다시 바람을 만든다”', lines: [], p, y: 640});
    const tC = evT(ctx, 'close', A_CLOSE), glowQ = 0.6 * Math.exp(-(((t - tC - 0.4) / 0.5) ** 2));
    withAlpha(c, smooth((p - 0.1) / 0.15), () => {
      miniLoop(stage, t, 540, 1050, 110, 1, glowQ);
      stage.text('적도의 되먹임 → 동아시아 계절의 기울기 (경향)', 540, 1250, {size: 26, weight: 500, color: T.muted, align: 'center'});
    });
  },
};

/** small two-node loop icon: 바람 (top) ⇄ 물 (bottom) */
function miniLoop(stage, t, cx, cy, R, a = 1, hi = 0) {
  const {ctx: c} = stage, T = stage.theme;
  withAlpha(c, a, () => {
    if (hi > 0) glow(c, cx, cy, R * 1.8, T.accent, hi);
    const r = Math.max(26, R * 0.36), top = [cx, cy - R * 0.62], bot = [cx, cy + R * 0.62];
    const rt = curve([top[0] + r, top[1] + r * 0.4], [bot[0] + r, bot[1] - r * 0.4], -R * 0.7, 24), lt = curve([bot[0] - r, bot[1] - r * 0.4], [top[0] - r, top[1] + r * 0.4], -R * 0.7, 24);
    pathArrow(c, rt, T.accent, 3.5, 1, 13); pathArrow(c, lt, T.accent, 3.5, 1, 13);
    circle(c, top[0], top[1], r, rgba(T.plate, 1)); ring(c, top[0], top[1], r, WIND, 2.5);
    circle(c, bot[0], bot[1], r, rgba(T.plate, 1)); ring(c, bot[0], bot[1], r, WARM, 2.5);
    const fs = Math.max(24, Math.round(r * 0.75));
    stage.text('바람', top[0], top[1] + 1, {size: fs, weight: 700, color: WIND, align: 'center'});
    stage.text('물', bot[0], bot[1] + 1, {size: fs, weight: 700, color: WARM, align: 'center'});
    void t;
  });
}

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, tl = ctx.tl;
  let [kicker, title] = titles[id] || ['', ''];
  if (id === 'elnino' && t >= tl.at('s09') - 0.3) [kicker, title] = ['메커니즘 ③ 되먹임', '약한 바람이 바다를 더 데운다'];
  if (id === 'lanina' && t >= tl.at('s11') - 0.3) [kicker, title] = ['판정 기준', '동태평양 한가운데의 수온'];
  if (title || kicker) header(stage, {kicker, title, p: ctx.scene.p, size: title.includes('\n') ? 64 : 58});
  progressBar(stage, t, tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// =====================================================================================================
export function soundEvents(tl) {
  const S = schedule(tl), r = (x, d = 3) => +x.toFixed(d);
  const ev = [];
  // wind level = W(t) (normalised by the La Niña maximum 1.7), hook (W = 1) and the whole dashboard stretch
  const hk = tl.scene('hook');
  ev.push({id: 'wind_hook', at: ['hook', 0.3], kind: 'env_noise',
    params: {low: 180, high: 1300, gain_db: -26, fade: 0.05, points: [[0, 0], [1.5, r(W_of(0) / 1.7)], [r(hk.end - 1.2), r(W_of(0) / 1.7)], [r(hk.end - 0.4), 0]]},
    means: '훅 화면의 무역풍(평상, W = 1) — 바람 소리 세기 = 무역풍 세기'});
  const wp = [], tp = [], dur = S.t1 - S.t0;
  for (let u = 0; u <= dur + 1e-6; u += 0.1) {
    const tt = S.t0 + u, s = sOf(tt, S), env = smooth(u / 1.2) * smooth((dur - u) / 0.8);
    wp.push([r(u), r(env * W_of(s) / 1.7, 4)]);
    tp.push([r(u), r(160 + 40 * s, 2), r(0.6 * env, 4)]);
  }
  ev.push({id: 'wind', at: 'normal', kind: 'env_noise', params: {low: 180, high: 1300, gain_db: -24, fade: 0.05, points: wp},
    model: {...Object.fromEntries(Object.entries(S).map(([k, v]) => [k, r(v, 4)])), map: 'amp = W/1.7, W = 1 − 0.7·s'},
    means: '무역풍 세기 W(t) = 바람 소리(대역 잡음) 세기. 엘니뇨에서 작아지고 라니냐에서 커짐'});
  ev.push({id: 'sst', at: 'normal', kind: 'chirp', params: {gain_db: -32, harmonics: [1, 0.35, 0.12], fade: 0.05, points: tp},
    means: '동태평양(Niño 3.4) 수온 편차 T(t) = 지속음 높이 160 Hz + 40 Hz·s'});
  // rain ticks: density ∝ convection C(t), brightness ∝ cloud longitude
  const layers = []; let tt = S.t0 + 0.6, i = 0;
  while (tt < S.t1 - 0.5) {
    const s = sOf(tt, S), C = CONV_of(s), lam = LAM_of(s);
    layers.push({kind: 'tick', offset: r(tt - S.t0), params: {freq: Math.round(1900 + 1500 * (lam - 140) / 60 + 300 * rand(i * 7)), decay: 0.018, click: 0.5, gain_db: r(-4 * rand(i * 3 + 1), 1)}});
    tt += (0.5 + rand(i * 11 + 5)) / (2.2 * C); i++;
  }
  ev.push({id: 'rain', at: 'normal', kind: 'custom', params: {gain_db: -34, layers},
    means: '비구름: 틱 밀도 = 대류 세기 C(t)(라니냐에서 촘촘), 음 높이 = 비구름 경도(동쪽으로 갈수록 밝게). 모노 안전'});
  ev.push({id: 'nino_cross', at: r(crossTime(S, +1), 4), kind: 'tick', params: {freq: 1320, decay: 0.12, gain_db: -20, repeat: 2, interval: 0.11},
    means: 'Niño 3.4 편차가 +0.5 °C를 넘는 순간 — 계기판 숫자의 고리와 같은 시각'});
  ev.push({id: 'nina_cross', at: r(crossTime(S, -1), 4), kind: 'tick', params: {freq: 660, decay: 0.12, gain_db: -20, repeat: 2, interval: 0.11},
    means: 'Niño 3.4 편차가 −0.5 °C 아래로 내려가는 순간'});
  [330, 392, 494, 587].forEach((f, k) => ev.push({id: `fb${k + 1}`, at: A_FB[k], kind: 'tone', params: {freq: f, dur: 0.38, harmonics: [1, 0.3], gain_db: -24},
    means: `되먹임 고리의 ${k + 1}번째 화살표가 켜지는 순간 — 네 음이 차례로 올라감`}));
  ev.push({id: 'fb_all', at: A_FB_ALL, kind: 'swell', params: {freqs: [294, 440, 587], dur: 1.4, gain_db: -28}, means: '고리 전체가 켜짐 (되먹임)'});
  ev.push({id: 'ess_push', at: A_ESS[0], kind: 'tone', params: {freq: 392, dur: 0.4, harmonics: [1, 0.3], gain_db: -26}, means: '본질: ① 바람이 물을 밀어 둠'});
  ev.push({id: 'ess_make', at: A_ESS[1], kind: 'tone', params: {freq: 523, dur: 0.4, harmonics: [1, 0.3], gain_db: -26}, means: '본질: ② 물이 다시 바람을 만듦'});
  ev.push({id: 'answer', at: A_ANSWER, kind: 'tone', params: {freq: 440, dur: 0.5, harmonics: [1, 0.3], gain_db: -28}, means: '훅의 답: 따뜻해지는 쪽 상자가 켜짐'});
  ev.push({id: 'tc_src', at: A_TC_SRC, kind: 'tone', params: {freq: 98, dur: 0.7, harmonics: [1, 0.5, 0.25], decay: 0.25, gain_db: -18},
    means: '중앙 태평양의 비구름에서 대기의 물결이 출발'});
  ev.push({id: 'tc_arrive', at: A_TC_ARR, kind: 'tone', params: {freq: 73, dur: 0.9, harmonics: [1, 0.5, 0.25], decay: 0.35, gain_db: -17},
    means: `물결이 ${TC_TRAVEL} s 뒤 필리핀해에 도착 → 고기압 편차가 생김 (실제 전파 시간이 아닌 상징적 지연)`});
  ev.push({id: 'winter_warm', at: A_WARM, kind: 'whoosh', params: {dur: 1.0, f_start: 300, f_end: 1200, gain_db: -28}, means: '엘니뇨 겨울: 따뜻한 남풍 화살표'});
  ev.push({id: 'winter_cold', at: A_COLD, kind: 'whoosh', params: {dur: 1.0, f_start: 2400, f_end: 500, gain_db: -26}, means: '라니냐 겨울: 북쪽의 찬 공기 화살표'});
  ev.push({id: 'front', at: A_FRONT, kind: 'noise', params: {dur: 1.6, low: 1800, high: 7000, attack: 0.5, release: 0.8, gain_db: -32}, means: '장마 전선이 그려짐 — 빗소리 질감의 잡음'});
  ev.push({id: 'myth_x', at: A_MYTH_X, kind: 'tick', params: {freq: 520, decay: 0.1, gain_db: -22}, means: '오해: “반드시 포근”에 ✗'});
  ev.push({id: 'myth_ok', at: A_MYTH_OK, kind: 'tone', params: {freq: 660, dur: 0.45, harmonics: [1, 0.3], gain_db: -26}, means: '확률이 기우는 경향 ✓, 막대가 기움'});
  ev.push({id: 'close', at: A_CLOSE, kind: 'swell', params: {freqs: [220, 330, 440], dur: 1.6, gain_db: -26}, means: '정리: 고리 아이콘이 빛남'});
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악 없음(사용자 결정). 모든 사건과 표(바람 세기 = W(t), 수온 음높이 = T(t), 빗소리 밀도 = C(t), 임계값 통과 시각)는 `node episodes/el-nino-la-nina/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형에서 써 넣습니다. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: old.ambient || {enabled: false, kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음(사용자 결정).'},
  };
  if (sound.ambient) sound.ambient.enabled = false;
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const S = schedule(tl);
  console.log(`events: ${sound.events.length}; El Niño ramp ${S.a.toFixed(2)}–${S.b.toFixed(2)} s, La Niña ramp ${S.c.toFixed(2)}–${S.d.toFixed(2)} s; +0.5 at ${crossTime(S, 1).toFixed(2)} s, −0.5 at ${crossTime(S, -1).toFixed(2)} s; rain ticks ${sound.events.find(e => e.id === 'rain').params.layers.length}`);
}
