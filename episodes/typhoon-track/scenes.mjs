// Episode scenes — "태풍은 왜 우리나라 앞에서 꺾일까" (25)
// Shape: export {theme, scenes, overlays, background, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Visual grammar (2026-11-10 user decision, docs/ANIMATION_QUALITY.md top section "움직임이 설명하고, 빛은 조금만"):
// ONE stage — a flat map of the western North Pacific (equirectangular, north up). The heroes are MATTE masses: the
// typhoon (a grey cloud disc with shaded spiral bands, never glowing), the North Pacific High (a pale blue-grey dome),
// the land. Warm = heat and the typhoon's journey (the warm sea above 26.5 °C — the storm's energy, the track, daily
// dots, speed numbers); cool = wind (trade winds, the flow round the high, the westerlies) drawn as instrument lines with
// moving dashes (the wind is the carrier, a link of the chain). Old states stay as dashed ghosts (old high outline, old
// track, old genesis point, the spiral at 15°N while the equator try runs). The camera moves only at scene starts (zoom
// into the genesis area for "spin", back out for "belts"); comparisons are watched from a still camera.
// The origin scene is a small plan-view landscape (two groves and a passing vortex) — Redfield's 1821 observation.
// Nothing of the notes below is printed on screen as a footnote.
//
// =====================================================================================================
// MODEL — read by the picture, the readouts and sound.json (node episodes/typhoon-track/scenes.mjs --emit-sound)
// =====================================================================================================
//  - Map: x = cx + (lon − lon0)·s, y = cy − (lat − lat0)·s (degrees; equirectangular, no cos(lat) squeeze).
//  - North Pacific High (설명 모형): an ellipse centred (HX, 27°N), half-axes 22° × 10°. Its west end moves with the season.
//  - Track (설명 모형, the climatological recurving path): the typhoon rides the flow just outside the high, on an ellipse
//    centred on the high with half-axes 26° × 13°, clockwise from 258° (genesis ≈ 14°N 144°E, near Guam) to 140°, then straight on to the NE.
//    With HX = 149 the path passes 35°N at ≈129°E (south coast of Korea). HX 146 → west end ≈ 120°E (China coast, Yellow
//    Sea); HX 158 → recurves near 139°E (Japan).
//  - Speed along the track: 20 km/h up to 24°N, rising linearly to 40 km/h at 34°N (summer values: 20–25 km/h before the
//    turn, 35–40 km/h after — Korean Wikipedia "태풍" 진로 절). Distances on a sphere (111 km per degree, cos lat).
//    Film time is one constant day length per scene (declared in the kicker); daily dots are every 24 h of travel.
//  - Spin (설명 모형): air parcels start on a ring and move inward; the rightward deflection ∝ sin(latitude) (Coriolis
//    parameter). At 15°N they curl counter-clockwise (centre on their left); at the equator they run straight in.
//  - Redfield (1821): a counter-clockwise vortex moving north (constant speed) between two groves; wind at a grove =
//    rotation (Rankine-like profile) + translation. Both groves fall downwind at the vortex's closest approach: the east
//    grove toward the north, the west grove toward the south (opposite ways).
//  - Typhoon radius on the map 4° (≈ 450 km): about true size, not exaggerated.
//  - Sound: node episodes/typhoon-track/scenes.mjs --emit-sound writes sound.json from this model and the time plan below.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, arrow, poly, rect, withAlpha, TAU, rand, loadTimeline} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920, D2R = Math.PI / 180;
export const theme = 'noturno';
export const captionLayout = {};

export const M = {
  HX: 149, HY: 27, hRx: 22, hRy: 10, tRx: 26, tRy: 13,     // high and track ellipses (degrees)
  HXwest: 146, HXeast: 158,                                  // season: expanded / retreated high
  genesisAng: 258, turnAng: 140, extDeg: 11,
  vSlow: 20, vFast: 40, latSlow: 24, latFast: 34,            // km/h
  R: 4,                                                      // typhoon radius on the map (degrees)
  korea: [127.8, 36.4],
  ninoGen: [165.5, 8.5],                                     // El Niño-year genesis (south-east of the usual)
  sstLat: 24,                                                // warm sea (> 26.5 °C) drawn south of ~24°N in summer (schematic)
};
const PAL = {ink: '#EFE3D4', muted: '#8AA0A6', warm: '#FFB547', warmHi: '#FFD9A0', wind: '#6FD3F7', windHi: '#BDEBFF',
  sea0: '#0B3346', sea1: '#062634', land: '#3E3D30', land2: '#2E2D24', coast: '#8A876C', grid: '#2F5566', ghost: '#C9D6DC',
  cloud0: '#EEF2F4', cloud1: '#B7C2C9', cloud2: '#7D8A93', eye: '#1B2C35', high0: '#5E7F92', high1: '#2E4A5A', mark: '#FFE2C4',
  tree: '#5C7A45', tree2: '#34492A', trunk: '#8A6E4E', ground0: '#2D3A26', ground1: '#1E281A'};

// =====================================================================================================
// helpers
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
const onAt = (t, t0, d = 0.12) => smooth((t - t0 + 0.034) / d);
const EASE = {io: easeInOut, o: easeOut, lin: q => clamp(q)};
function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [t1, v1, e] = K[i]; if (t < t1) { const [t0, v0] = K[i - 1]; return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / (t1 - t0)); } }
    return K[K.length - 1][1];
  };
}
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 28, weight = o.weight ?? 700, w = stage.measure(s, {size, weight}), pad = 9;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba('#03141C', o.plateA ?? 0.8), o.border ? rgba(o.border, 0.85) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink});
  });
  return w;
}
function bigNum(stage, label, num, unit, x, y, a, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18}, size = o.size || 112, us = Math.round(size * 0.42);
  withAlpha(c, a, () => {
    const uw = unit ? stage.measure(unit, {role: 'display', size: us, weight: 700}) + 12 : 0;
    stage.text(num, x - uw, y, {role: 'display', size, weight: 700, color: o.col || PAL.warm, align: 'right', ...so});
    if (unit) stage.text(unit, x, y, {role: 'display', size: us, weight: 700, color: o.ucol || PAL.ink, align: 'right', ...so});
    if (label) stage.text(label, x, y - size * 0.82, {size: 30, weight: 500, color: PAL.muted, align: 'right', ...so});
  });
}
function dashedLine(c, pts, col, w, dash, offset = 0) {
  if (pts.length < 2) return;
  c.save(); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.setLineDash(dash); c.lineDashOffset = offset; c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); c.restore();
}
function arrowHead(c, p, dir, col, s = 16) { const [ux, uy] = dir, L = Math.hypot(ux, uy) || 1, a = ux / L, b = uy / L; poly(c, [p, [p[0] - s * a + s * 0.55 * b, p[1] - s * b - s * 0.55 * a], [p[0] - s * a - s * 0.55 * b, p[1] - s * b + s * 0.55 * a]], col); }
/** a polyline with an arrow head at its end; q (0..1) draws a growing part */
function pathArrow(c, pts, col, w, q = 1, o = {}) {
  if (q <= 0 || pts.length < 2) return;
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1] * clamp(q), out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { if (L[i] <= tot) out.push(pts[i]); else { const f = (tot - L[i - 1]) / (L[i] - L[i - 1]); out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); break; } }
  if (out.length < 2) return;
  const e = out[out.length - 1], b = out[out.length - 2];
  if (o.dash) dashedLine(c, out, col, w, o.dash); else line(c, out, col, w);
  arrowHead(c, e, [e[0] - b[0], e[1] - b[1]], col, o.head || Math.max(14, w * 4));
}

// =====================================================================================================
// MAP
// =====================================================================================================
const VIEW = {lon0: 138, lat0: 22, s: 15, cx: 540, cy: 740};
let V = VIEW;
const X = (lon, lat) => [V.cx + (lon - V.lon0) * V.s, V.cy - (lat - V.lat0) * V.s];
const LAND = JSON.parse(fs.readFileSync(path.join(HERE, 'land.json'), 'utf8')).rings
  .map(r => r.map(([lo, la]) => [lo < -100 ? lo + 360 : lo, la]))
  .filter(r => { let lo0 = 999, lo1 = -999, la0 = 99, la1 = -99; for (const [lo, la] of r) { lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); la0 = Math.min(la0, la); la1 = Math.max(la1, la); } return lo1 > 60 && lo0 < 220 && la1 > -40 && la0 < 80 && lo1 - lo0 < 300; });
function inRing(r, lon, lat) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
const isLand = (lon, lat) => LAND.some(r => inRing(r, lon, lat));
const KOREA_RING = LAND.find(r => inRing(r, 127.8, 36.4));
function drawMap(stage, o = {}) {
  const c = stage.ctx;
  // sea: matte, a little lighter toward the warm south (no glow)
  const g = c.createLinearGradient(0, X(0, 50)[1], 0, X(0, -5)[1]); g.addColorStop(0, PAL.sea1); g.addColorStop(1, PAL.sea0);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (o.warm > 0) warmSea(stage, o.warm, o.sstLine);
  // latitude lines (the world ruler)
  for (const la of [0, 15, 30, 45]) {
    const y = X(0, la)[1]; if (y < -10 || y > H + 10) continue;
    dashedLine(c, [[0, y], [W, y]], rgba(la === 0 ? '#5E8797' : PAL.grid, la === 0 ? 0.95 : 0.8), la === 0 ? 2 : 1.4, [8, 10]);
    if (o.gridLabels !== false && la !== 45) stage.text(la === 0 ? '적도' : `${la}°N`, W - 70, y - 10, {size: 24, weight: 500, color: rgba(PAL.muted, 0.95), align: 'right'});
  }
  // land: matte, lit from the upper left
  c.save();
  for (const r of LAND) {
    c.beginPath(); r.forEach(([lo, la], i) => { const [x, y] = X(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
    const lg = c.createLinearGradient(0, 0, W * 0.6, H * 0.6); lg.addColorStop(0, PAL.land); lg.addColorStop(1, PAL.land2);
    c.fillStyle = lg; c.fill(); c.strokeStyle = rgba(PAL.coast, 0.55); c.lineWidth = 1.4; c.stroke();
  }
  c.restore();
  if (o.korea > 0 && KOREA_RING) withAlpha(c, o.korea, () => {
    c.beginPath(); KOREA_RING.forEach(([lo, la], i) => { const [x, y] = X(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
    const [x0, y0] = X(124.5, 38.6), [x1, y1] = X(131, 33.5);
    c.save(); c.clip(); c.fillStyle = rgba('#7D7A60', 0.95); c.fillRect(x0, y0, x1 - x0, y1 - y0); c.restore();
  });
  if (o.fade !== false) { const f = c.createLinearGradient(0, 1150, 0, 1420); f.addColorStop(0, 'rgba(2,14,20,0)'); f.addColorStop(1, 'rgba(2,14,20,0.82)'); c.fillStyle = f; c.fillRect(0, 1150, W, H - 1150); }
}
/** the warm sea (> 26.5 °C): the storm's energy source — a faint warm tint with its 26.5 °C line (schematic boundary) */
function sstLat(lon) { return M.sstLat + 3 * Math.sin((lon - 110) / 70 * Math.PI) - 2 * (lon > 160 ? (lon - 160) / 15 : 0); }
function warmSea(stage, a, withLine) {
  const c = stage.ctx, top = [], N = 60;
  for (let i = 0; i <= N; i++) { const lo = 95 + i / N * 95; top.push(X(lo, sstLat(lo))); }
  const pts = [...top, X(190, -60), X(95, -60)];
  withAlpha(c, a, () => {
    const y0 = X(0, M.sstLat + 3)[1], y1 = X(0, -6)[1], g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(PAL.warm, 0.05)); g.addColorStop(1, rgba(PAL.warm, 0.17));
    poly(c, pts, g);
    if (withLine) dashedLine(c, top, rgba(PAL.warm, 0.7), 2.2, [3, 7]);
  });
}

// =====================================================================================================
// HIGH, TRACK, SPEED
// =====================================================================================================
const ell = (hx, ang, rx, ry) => [hx + rx * Math.cos(ang * D2R), M.HY + ry * Math.sin(ang * D2R)];
function highOutline(hx, n = 90) { const pts = []; for (let i = 0; i <= n; i++) pts.push(ell(hx, i / n * 360, M.hRx, M.hRy)); return pts; }
function drawHigh(stage, hx, a, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, P = highOutline(hx).map(([lo, la]) => X(lo, la)), ctr = X(hx, M.HY), rx = M.hRx * V.s, ry = M.hRy * V.s;
  withAlpha(c, a, () => {
    // matte dome: light from the upper left, darker rim; no glow
    c.save(); c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
    const g = c.createRadialGradient(ctr[0] - rx * 0.3, ctr[1] - ry * 0.35, ry * 0.2, ctr[0], ctr[1], rx * 1.05);
    g.addColorStop(0, rgba(PAL.high0, 0.62)); g.addColorStop(1, rgba(PAL.high1, 0.5));
    c.fillStyle = g; c.fillRect(ctr[0] - rx - 10, ctr[1] - ry - 10, 2 * rx + 20, 2 * ry + 20); c.restore();
    line(c, [...P, P[0]], rgba('#A9C4D2', 0.6), 2);
    if (o.letter !== false) stage.text('H', ctr[0], ctr[1] + 26, {role: 'display', size: 76, weight: 700, color: rgba('#DCE8EE', 0.85), align: 'center'});
  });
}
function ghostHigh(stage, hx, a) { if (a <= 0) return; withAlpha(stage.ctx, a, () => dashedLine(stage.ctx, highOutline(hx).map(([lo, la]) => X(lo, la)), rgba(PAL.ghost, 0.65), 2, [7, 7])); }
/** clockwise flow round the high (cool instrument line with moving dashes) */
function highFlow(stage, hx, a, t) {
  if (a <= 0) return;
  const c = stage.ctx, pts = []; for (let i = 0; i <= 120; i++) pts.push(X(...ell(hx, 360 - i / 120 * 360, M.hRx + 2, M.hRy + 2)));
  withAlpha(c, a, () => {
    dashedLine(c, pts, rgba(PAL.wind, 0.85), 3, [22, 16], -t * 40);
    for (const ang of [270, 180, 90, 0]) { const p = X(...ell(hx, ang, M.hRx + 2, M.hRy + 2)), q = X(...ell(hx, ang - 3, M.hRx + 2, M.hRy + 2)); arrowHead(c, q, [q[0] - p[0], q[1] - p[1]], PAL.wind, 18); }
  });
}
const TRACKS = new Map();
/** track for a high centred at hx: [{lon, lat, km, h}] (cumulative distance and hours) */
function track(hx, gen) {
  const key = hx + '/' + (gen ? gen.join(',') : ''); if (TRACKS.has(key)) return TRACKS.get(key);
  const P = [];
  for (let a = M.genesisAng; a >= M.turnAng; a -= 1) P.push(ell(hx, a, M.tRx, M.tRy));
  { const [l0, b0] = P[P.length - 1], [l1, b1] = P[P.length - 2]; let dx = l0 - l1, dy = b0 - b1; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    for (let k = 1; k <= M.extDeg * 2; k++) { const q = Math.min(1, k / 10), ux = lerp(dx, 0.72, q), uy = lerp(dy, 0.69, q), U = Math.hypot(ux, uy), [lp, bp] = P[P.length - 1]; P.push([lp + 0.5 * ux / U, bp + 0.5 * uy / U]); } }
  if (gen) {     // a different birthplace: a short lead-in that joins the usual path (El Niño case)
    const j = 14, [lj, bj] = P[j], lead = []; for (let k = 0; k < 20; k++) { const q = k / 20; lead.push([lerp(gen[0], lj, q), lerp(gen[1], bj, q) + 1.2 * Math.sin(q * Math.PI)]); }
    P.splice(0, j, ...lead);
  }
  const out = []; let km = 0, h = 0;
  for (let i = 0; i < P.length; i++) {
    if (i) { const [l0, b0] = P[i - 1], [l1, b1] = P[i], d = 111 * Math.hypot((l1 - l0) * Math.cos((b0 + b1) / 2 * D2R), b1 - b0); km += d; h += d / speed((b0 + b1) / 2); }
    out.push({lon: P[i][0], lat: P[i][1], km, h});
  }
  TRACKS.set(key, out); return out;
}
const speed = lat => lerp(M.vSlow, M.vFast, clamp((lat - M.latSlow) / (M.latFast - M.latSlow)));
/** state at travel time h (hours): position, heading (canvas vector), speed */
function along(T, h) {
  h = clamp(h, 0, T[T.length - 1].h);
  let i = 1; while (i < T.length - 1 && T[i].h < h) i++;
  const a = T[i - 1], b = T[i], q = (h - a.h) / Math.max(1e-9, b.h - a.h), lon = lerp(a.lon, b.lon, q), lat = lerp(a.lat, b.lat, q);
  return {lon, lat, dir: [b.lon - a.lon, -(b.lat - a.lat)], v: speed(lat), i};
}
const hAtLat = (T, lat) => { for (let i = 1; i < T.length; i++) if (T[i].lat >= lat && T[i - 1].lat < lat && T[i].lon < T[0].lon) return lerp(T[i - 1].h, T[i].h, (lat - T[i - 1].lat) / (T[i].lat - T[i - 1].lat)); return T[T.length - 1].h; };
const hWestEnd = T => { let best = 0; for (let i = 1; i < T.length; i++) if (T[i].lon < T[best].lon) best = i; return T[best].h; };
/** the path travelled so far (warm), the rest dashed when o.ahead; daily dots every 24 h */
function drawTrack(stage, T, h, o = {}) {
  const c = stage.ctx, a = o.a ?? 1; if (a <= 0) return;
  const done = T.filter(p => p.h <= h).map(p => X(p.lon, p.lat)), cur = along(T, h); done.push(X(cur.lon, cur.lat));
  withAlpha(c, a, () => {
    if (o.ahead > 0) withAlpha(c, o.ahead, () => dashedLine(c, T.map(p => X(p.lon, p.lat)), rgba(o.col || PAL.warm, 0.55), 2.4, [6, 9]));
    if (done.length > 1) line(c, done, rgba(o.col || PAL.warm, 0.95), o.w || 4);
    if (o.dots !== false) for (let d = 24; d <= h + 1e-6; d += 24) { const s = along(T, d), [x, y] = X(s.lon, s.lat); circle(c, x, y, 6.5, rgba('#03141C', 0.9)); circle(c, x, y, 4.6, o.col || PAL.warm); }
  });
}
function ghostTrack(stage, T, a) { if (a <= 0) return; withAlpha(stage.ctx, a, () => dashedLine(stage.ctx, T.map(p => X(p.lon, p.lat)), rgba(PAL.ghost, 0.6), 2.4, [7, 8])); }

// =====================================================================================================
// TYPHOON (matte cloud disc) and WINDS
// =====================================================================================================
/** rot: angle (rad, canvas); counter-clockwise on screen = decreasing. form 0..1 grows the bands. */
function typhoon(stage, x, y, R, rot, a = 1, form = 1) {
  if (a <= 0 || R <= 1) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    // matte cloud mass: grey, darker toward the rim (no bright halo)
    const g = c.createRadialGradient(x, y, R * 0.05, x, y, R);
    g.addColorStop(0, rgba('#C9D1D6', 0.96 * form)); g.addColorStop(0.62, rgba('#A1ACB3', 0.93 * form)); g.addColorStop(0.86, rgba('#7F8B93', 0.8 * form)); g.addColorStop(1, rgba('#6E7A82', 0));
    circle(c, x, y, R, g);
    // spiral bands: five lighter cloud bands that trail clockwise outward (a counter-clockwise storm), tails past the rim
    for (let k = 0; k < 5; k++) {
      const th0 = rot + k * TAU / 5, A = [], B = [];
      for (let i = 0; i <= 30; i++) {
        const q = i / 30, r = R * (0.16 + 1.08 * q), th = th0 + 2.6 * q, wdt = R * 0.1 * Math.sin(Math.PI * Math.min(1, q * 1.1 + 0.05));
        A.push([x + (r + wdt) * Math.cos(th), y + (r + wdt) * Math.sin(th)]); B.unshift([x + (r - wdt) * Math.cos(th + 0.1), y + (r - wdt) * Math.sin(th + 0.1)]);
      }
      poly(c, [...A, ...B], rgba('#DCE2E6', 0.42 * form));
      line(c, B.slice(0, 22), rgba('#4F5B63', 0.28 * form), 1.6);
    }
    // light from the upper left, shadow to the lower right (matte)
    c.save(); c.beginPath(); c.arc(x, y, R * 0.98, 0, TAU); c.clip();
    const sh = c.createLinearGradient(x - R, y - R, x + R, y + R); sh.addColorStop(0.4, 'rgba(6,16,22,0)'); sh.addColorStop(1, 'rgba(6,16,22,0.42)');
    c.fillStyle = sh; c.fillRect(x - R, y - R, 2 * R, 2 * R); c.restore();
    circle(c, x, y, Math.max(3, R * 0.09), rgba(PAL.eye, 0.95 * form));
  });
}
/** a curved arrow round a typhoon showing its counter-clockwise spin */
function spinArrow(stage, x, y, r, a, col = PAL.warm) {
  if (a <= 0) return;
  const c = stage.ctx, pts = []; for (let i = 0; i <= 30; i++) { const th = -0.4 - i / 30 * 2.2; pts.push([x + r * Math.cos(th), y + r * Math.sin(th)]); }
  withAlpha(c, a, () => pathArrow(c, pts, col, 4, 1, {head: 18}));
}
/** trade winds (westward rows) and westerlies (eastward rows): moving dashes = the air that carries the storm */
function windRows(stage, kind, a, t, q = 1) {
  if (a <= 0) return;
  const c = stage.ctx, rows = kind === 'trade' ? [7, 11, 15, 19] : [38, 42, 46], dir = kind === 'trade' ? -1 : 1;
  withAlpha(c, a, () => rows.forEach((la, k) => {
    const pts = []; for (let i = 0; i <= 48; i++) { const lo = 104 + i / 48 * 70; pts.push(X(lo, la + (kind === 'west' ? 1.3 * Math.sin((lo - 104) / 22 + k) : 0.5 * Math.sin((lo - 100) / 18 + k)))); }
    if (dir < 0) pts.reverse();
    const n = Math.max(2, Math.round(pts.length * clamp(q))), P = pts.slice(0, n);
    dashedLine(c, P, rgba(PAL.wind, 0.62), 2.6, [24, 18], -t * 46 - k * 9);
    const e = P[P.length - 1], b = P[P.length - 2]; arrowHead(c, e, [e[0] - b[0], e[1] - b[1]], rgba(PAL.wind, 0.8), 15);
  }));
}
/** heading dial: the needle points along the typhoon's motion (instrument, same clock as the map) */
function headingDial(stage, x, y, dir, a) {
  if (a <= 0) return;
  const c = stage.ctx, r = 62;
  withAlpha(c, a, () => {
    circle(c, x, y, r + 14, rgba('#03141C', 0.82)); ring(c, x, y, r, rgba(PAL.muted, 0.8), 2);
    for (const [s, dx, dy] of [['북', 0, -1], ['동', 1, 0], ['남', 0, 1], ['서', -1, 0]]) stage.text(s, x + dx * (r - 18), y + dy * (r - 18) + 9, {size: 24, weight: 700, color: PAL.muted, align: 'center'});
    if (dir) { const L = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / L, uy = dir[1] / L; arrow(c, [x - ux * 26, y - uy * 26], [x + ux * 44, y + uy * 44], PAL.warm, 5, {head: 18}); }
    stage.text('진행 방향', x, y + r + 46, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
  });
}

// =====================================================================================================
// TIME PLAN (word anchors; shared with --emit-sound)
// =====================================================================================================
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  const wd = (s, w, o = 0) => tl.wordStart(s, w) + o, sc = id => tl.scene(id), at = r => tl.at(r);
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s]))};
  P.MORPH = [0.9, 1.7];
  P.T0 = track(M.HX); P.Tw = track(M.HXwest); P.Te = track(M.HXeast); P.Tn = track(M.HX, M.ninoGen);
  const days = P.T0[P.T0.length - 1].h / 24;
  P.days = days;
  // ---- hook: replay the whole journey during s02 (declared "N일을 S초로")
  P.gen2 = wd('s02', '생겨'); P.west2 = wd('s02', '서쪽으로'); P.kor2 = wd('s02', '우리나라'); P.ne2 = wd('s02', '북동쪽으로');
  P.in3 = wd('s03', '안이'); P.out3 = wd('s03', '바깥에');
  {  // choose the constant rate so the turn to the north-east (35°N) lands on "북동쪽으로"
    const hTurn = hAtLat(P.T0, 33); P.hookRate = hTurn / (P.ne2 + 0.2 - P.gen2);       // hours per second of film
    P.hookStart = P.gen2;
    P.hookSecPerDay = 24 / P.hookRate;
  }
  P.hookH = t => clamp((t - P.hookStart) * P.hookRate, 0, P.T0[P.T0.length - 1].h);
  // ---- origin
  P.storm4 = wd('s04', '폭풍'); P.fell4 = wd('s04', '쓰러진'); P.other4 = wd('s04', '서로'); P.opp4 = wd('s04', '반대쪽으로');
  P.whole5 = wd('s05', '폭풍 전체가'); P.spin5 = wd('s05', '돌면서'); P.wind5 = wd('s05', '둘레의'); P.move5 = wd('s05', '옮겨');
  // ---- essence
  P.river6 = wd('s06', '강물'); P.drift6 = wd('s06', '떠밀려');
  P.self7 = wd('s07', '스스로'); P.path7 = wd('s07', '가는'); P.wind7 = wd('s07', '둘레의');
  // ---- spin
  P.sst8 = wd('s08', '섭씨'); P.moist8 = wd('s08', '습한'); P.rise8 = wd('s08', '솟아'); P.low8 = wd('s08', '낮은');
  P.gather9 = wd('s09', '모여드는데'); P.nh9 = wd('s09', '북반구에서는'); P.right9 = wd('s09', '오른쪽으로');
  P.name10 = wd('s10', '전향력이라고');
  P.right11 = wd('s11', '오른쪽으로'); P.left11 = wd('s11', '왼쪽에'); P.ccw11 = wd('s11', '시계');
  P.eq12 = wd('s12', '적도'); P.none12 = wd('s12', '거의 없어'); P.no12 = wd('s12', '생기지');
  // ---- belts
  P.eq13 = wd('s13', '적도에서'); P.rise13 = wd('s13', '솟은'); P.lat13 = wd('s13', '삼십도'); P.sink13 = wd('s13', '가라앉아'); P.npac13 = wd('s13', '북태평양');
  P.south14 = wd('s14', '남쪽으로'); P.west14 = wd('s14', '서쪽으로'); P.trade14 = wd('s14', '무역풍이');
  P.north15 = wd('s15', '북쪽으로'); P.east15 = wd('s15', '동쪽으로'); P.wly15 = wd('s15', '편서풍이');
  P.cw16 = wd('s16', '시계'); P.belt16 = wd('s16', '편서풍'); P.kor16 = wd('s16', '우리나라가');
  // ---- track: one constant rate chosen so the west end is reached on "북쪽으로" (s18) and the NE turn on "북동쪽으로" (s19)
  P.first17 = wd('s17', '먼저'); P.trade17 = wd('s17', '무역풍에'); P.v17 = wd('s17', '이십킬로미터쯤');
  P.end18 = wd('s18', '서쪽 끝에'); P.north18 = wd('s18', '북쪽으로');
  P.lat19 = wd('s19', '삼십도'); P.wly19 = wd('s19', '편서풍을'); P.ne19 = wd('s19', '북동쪽으로');
  P.after20 = wd('s20', '꺾인'); P.v20 = wd('s20', '사십킬로미터'); P.fast20 = wd('s20', '빨라지며'); P.kor20 = wd('s20', '우리나라와');
  {
    const hB = hAtLat(P.T0, 32);
    P.trackStart = P.first17 - 0.3;
    P.trackRate = hB / ((P.ne19 + 0.1) - P.trackStart);
    P.trackSecPerDay = 24 / P.trackRate;
  }
  P.trackH = t => clamp((t - P.trackStart) * P.trackRate, 0, P.T0[P.T0.length - 1].h);
  P.trackDays = []; for (let d = 24; d <= P.T0[P.T0.length - 1].h; d += 24) P.trackDays.push(P.trackStart + d / P.trackRate);
  P.trackTurn = P.trackStart + hAtLat(P.T0, 30) / P.trackRate;
  // ---- season
  P.wext21 = wd('s21', '서쪽으로'); P.china21 = wd('s21', '중국'); P.autumn21 = wd('s21', '가을에'); P.retreat21 = wd('s21', '동쪽으로'); P.japan21 = wd('s21', '일본');
  P.nino22 = wd('s22', '엘니뇨가'); P.se22 = wd('s22', '남동쪽');
  {
    const run = 0.35 * P.Tw[P.Tw.length - 1].h / 24;     // one day = 0.35 s of film for both comparison runs
    P.seasonRate = P.Tw[P.Tw.length - 1].h / run;
    P.runW = [P.wext21 + 0.9, P.wext21 + 0.9 + run]; P.runE = [P.retreat21 + 1.0, P.retreat21 + 1.0 + run];
    P.seasonSecPerDay = 24 / P.seasonRate;
  }
  P.hx = keyed([[sc('season').start, M.HX], [P.wext21 - 0.2, M.HX], [P.wext21 + 1.0, M.HXwest, 'io'], [P.retreat21 - 0.1, M.HXwest], [P.retreat21 + 0.9, M.HXeast, 'io'], [P.nino22 - 0.3, M.HXeast], [P.nino22 + 0.6, M.HX, 'io']]);
  // ---- close: one more run with the three winds named as they carry it
  P.trade23 = wd('s23', '무역풍에'); P.high23 = wd('s23', '고기압을'); P.wly23 = wd('s23', '편서풍을');
  P.self24 = wd('s24', '스스로'); P.path24 = wd('s24', '가는');
  {
    const hA = hWestEnd(P.T0) * 0.55, hB = hAtLat(P.T0, 33);
    P.closeRate = (hB - hA) / (P.wly23 + 0.4 - (P.high23 + 0.2));
    P.closeStart = P.high23 + 0.2 - hA / P.closeRate;
  }
  P.poster = at('s24:end') - 1.4;
  // ---- origin model: vortex moving north through x = 540; groves at x = 540 ± 250, y = 760
  P.orgStart = sc('origin').start;
  {
    // constant northward motion (30 px/s); the vortex passes the grove line on "쓰러진"; both groves fall at closest approach
    P.vortexV = 18; P.tPass = P.fell4 + 0.3;
    P.vortexY = t => GROVE_Y - P.vortexV * (t - P.tPass);
    const at = gx => ({t: P.tPass, dir: vortexWind(gx, GROVE_Y, 540, GROVE_Y, P.vortexV)});
    P.fallA = at(540 + GROVE_DX); P.fallB = at(540 - GROVE_DX);
  }
  PLANS.set(tl, P);
  return P;
}
const GROVE_Y = 780, GROVE_DX = 260;
/** wind at (x, y) for a counter-clockwise vortex centred (cx, cy) moving north at v px/s (screen units, y down) */
function vortexWind(x, y, cx, cy, v) {
  const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1, Rm = 200, vt = r < Rm ? r / Rm : (Rm / r) ** 0.7;
  // counter-clockwise on screen: tangent = (dy, −dx)/r ; plus translation toward north (0, −1)
  return [vt * dy / r, vt * -dx / r - 0.25 * Math.min(1, v / 60)];
}

// =====================================================================================================
// Titles, poster, overlays, background
// =====================================================================================================
const fmt = (x, d = 1) => (+x.toFixed(d)).toString();
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, `태풍의 길 · 하루를 ${fmt(P.hookSecPerDay)}초로`, '왜 우리나라 앞에서 꺾일까?']];
  if (id === 'origin') return [[-Infinity, '기원 · 1821년 미국', '쓰러진 나무가 가리킨 것'], [at('s05'), '기원 · 1821년 미국', '도는 소용돌이가 옮겨 간다']];
  if (id === 'essence') return [[-Infinity, '본질', '두 가지 움직임'], [at('s07'), '본질', '도는 것은 스스로, 길은 바람이']];
  if (id === 'spin') return [[-Infinity, '메커니즘 ① · 확대', '따뜻한 바다에서 시작'], [at('s09'), '메커니즘 ① · 확대', '오른쪽으로 휘는 공기'], [at('s11'), '메커니즘 ① · 확대', '시계 반대 방향 소용돌이'], [at('s12'), '메커니즘 ① · 위도만 바꿈', '적도 곁에서는']];
  if (id === 'belts') return [[-Infinity, '메커니즘 ② · 바람의 띠', '가라앉는 공기, 고기압'], [at('s14'), '메커니즘 ② · 바람의 띠', '남쪽으로 가면 무역풍'], [at('s15'), '메커니즘 ② · 바람의 띠', '북쪽으로 가면 편서풍'], [at('s16'), '메커니즘 ② · 바람의 띠', '고기압 둘레의 바람']];
  if (id === 'track') return [[-Infinity, `메커니즘 ③ · 하루를 ${fmt(P.trackSecPerDay)}초로`, '바람을 따라가는 길']];
  if (id === 'season') return [[-Infinity, `현상 · 고기압만 바꿈, 하루를 ${fmt(P.seasonSecPerDay, 2)}초로`, '고기압이 길을 바꾼다'], [P.nino22 - 0.5, '현상 · 경향', '엘니뇨가 나타난 해']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 900, ...so}));
}
// 2026-11-13 첫 프레임 = 흰 물음(두 줄) 위, 주제어 크게(사용자 지시). The question lines slide onto one header line at 228;
// the keyword shrinks toward 292 and fades (it stays below the question and never crosses it).
const POSTER = {q: ['왜 우리나라 앞에서', '꺾일까?'], a: '태풍의 길', y: 930, y2: 1215, AS: 200};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, Q = POSTER.q, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= Math.min(...Q.map(s => fit(s, 860, 104))); AS ||= fit(POSTER.a, 880, POSTER.AS);
  const LH = QS * 1.14, s1 = lerp(QS, 56, q), tr = lerp(-0.03, -0.011, q);
  const wf = Q.map(s => stage.measure(s, {role: 'display', weight: 700, size: 56, tracking: -0.011 * 56})), sp = 56 * 0.28;
  let xh = 540 - (wf.reduce((x, y) => x + y, 0) + sp * (Q.length - 1)) / 2;
  const hx = wf.map(w => { const x = xh + w / 2; xh += w + sp; return x; });
  const yTop = POSTER.y - QS * 0.75 - 60, yBot = POSTER.y2 + AS * 0.55 + 60;
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, yTop, 0, yBot); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.25, 'rgba(0,10,16,0.66)'); g.addColorStop(0.8, 'rgba(0,10,16,0.66)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    const qx = smooth(q / 0.45), qy = smooth((q - 0.4) / 0.6), yc = lerp(POSTER.y + (Q.length - 1) * LH / 2, 228, q), k = s1 / 56;
    Q.forEach((s, i) => stage.text(s, 540 + (hx[i] - 540) * k * qx, yc + (i - (Q.length - 1) / 2) * LH * (s1 / QS) * (1 - qy), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1}));
    const sa = lerp(AS, 34, q);
    withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.y2, 292, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', tracking: tr * sa, shadow: sh, shadowBlur: 28}));
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1340, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,8,12,0.42)'); g.addColorStop(1, 'rgba(0,8,12,0.62)'); c.fillStyle = g; c.fillRect(0, 1340, W, 580); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 330); g.addColorStop(0, 'rgba(0,8,12,0.72)'); g.addColorStop(0.7, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 330); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < P.MORPH[1]) { posterTitle(stage, easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    captionBand(stage.ctx); progressBar(stage, t, ctx.tl.duration); return;
  }
  captionBand(stage.ctx); topBand(stage.ctx);
  const L = titleList(id, P), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook') head(stage, cur[1], cur[2], fadeIn(t, P.MORPH[1] - 0.05, 0.4) * a, a);
  else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, P.MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage) { const c = stage.ctx; c.fillStyle = PAL.sea1; c.fillRect(0, 0, W, H); }

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/typhoon-track/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.trackDays.length}/${P.trackStart.toFixed(3)}/${P.fallA.t.toFixed(3)}/${P.T0.length}`; }
const dip = (c, t, t0, d = 0.45) => { const q = (t - t0) / d; if (q >= 0 && q < 1) { c.fillStyle = `rgba(0,10,16,${1 - smooth(q)})`; c.fillRect(0, 0, W, H); } };
const rotAt = t => -t * 1.1;                       // the storm's spin (counter-clockwise on screen); illustrative rate
const posterH = T => hAtLat(T, 34.6);

export const scenes = {
  // ------------------------------------------------------------------ hook: poster → the journey replayed (west → north → north-east)
  // chain: typhoon born in the warm sea → carried west → turns north → turns north-east near Korea → its path stays as a line; dial follows
  hook(stage, t, p, ctx) {
    checkSoundTable(ctx);
    const P = plan(ctx.tl), c = stage.ctx; V = VIEW;
    drawMap(stage, {warm: 0.8, korea: 1});
    const T = P.T0, pA = 1 - smooth((t - P.MORPH[0]) / 0.8);
    // poster: the whole path (dashed) and the storm off the south coast
    if (pA > 0) { withAlpha(c, pA, () => dashedLine(c, T.map(q => X(q.lon, q.lat)), rgba(PAL.warm, 0.85), 4, [10, 9])); const s = along(T, posterH(T)), [x, y] = X(s.lon, s.lat); typhoon(stage, x, y, M.R * V.s, rotAt(t), pA); }
    const run = t >= P.hookStart - 0.4;
    if (run) {
      const h = P.hookH(t), s = along(T, h), [x, y] = X(s.lon, s.lat), a = fadeIn(t, P.hookStart - 0.4, 0.4);
      drawTrack(stage, T, h, {a, dots: false});
      typhoon(stage, x, y, M.R * V.s * lerp(0.55, 1, smooth(h / 30)), rotAt(t), a, lerp(0.5, 1, smooth(h / 30)));
      headingDial(stage, 150, 1240, s.dir, a);
    }
    // s03: "바깥에" — the air around it starts to move (winds fade in round the storm)
    const wA = fadeIn(t, P.out3 - 0.1, 0.6) * 0.8;
    windRows(stage, 'trade', wA, t); windRows(stage, 'west', wA, t);
    const kA = fadeIn(t, P.kor2 - 0.2, 0.3) * fadeOut(t, P.in3, 0.4); if (kA > 0) { const [x, y] = X(...M.korea); tag(stage, '우리나라', x - 50, y - 42, {size: 28, color: PAL.mark, a: kA, align: 'right'}); }
  },

  // ------------------------------------------------------------------ origin: Redfield's two groves and the passing vortex
  // chain: vortex comes up from the south → wind at the east grove (rotation + motion) → its trees fall → wind at the west grove
  //        → its trees fall the other way → (s05) spin arrow + motion arrow on the vortex
  origin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    // ground (plan view): matte fields
    const g = c.createLinearGradient(0, 300, 0, 1400); g.addColorStop(0, PAL.ground0); g.addColorStop(1, PAL.ground1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) { const y = 330 + i * 120; line(c, [[0, y + 14 * Math.sin(i)], [W, y - 10 * Math.cos(i)]], rgba('#41543A', 0.35), 1.4); }
    // north arrow (instrument of direction)
    withAlpha(c, 0.9, () => { arrow(c, [110, 470], [110, 380], rgba(PAL.muted, 0.9), 3, {head: 16}); stage.text('북', 110, 360, {size: 26, weight: 700, color: PAL.muted, align: 'center'}); });
    const vy = P.vortexY(t), vA = fadeIn(t, s0 + 0.2, 0.5);
    // the vortex (matte) under the groves (the trees are drawn on top so their fall stays visible)
    typhoon(stage, 540, vy, 175, rotAt(t) * 1.4, 0.85 * vA * fadeOut(t, ctx.scene.end - 0.3, 0.3));
    // two groves
    for (const [side, gx, F] of [[1, 540 + GROVE_DX, P.fallA], [-1, 540 - GROVE_DX, P.fallB]]) {
      const fq = easeOut((t - F.t) / 0.45), L = Math.hypot(F.dir[0], F.dir[1]) || 1, ux = F.dir[0] / L, uy = F.dir[1] / L;
      for (let k = 0; k < 13; k++) {
        const bx = gx + (rand(k * 3.3 + side) - 0.5) * 150, by = GROVE_Y + (rand(k * 7.1 + side * 2) - 0.5) * 170, len = 46 + 10 * rand(k + 9);
        const dl = fq * len, tx = bx + ux * dl, ty = by + uy * dl;
        if (fq > 0) line(c, [[bx, by], [tx, ty]], PAL.trunk, 6);
        const cr = 15 + 4 * rand(k + 2), gg = c.createRadialGradient(tx - cr * 0.4, ty - cr * 0.4, 1, tx, ty, cr);
        gg.addColorStop(0, PAL.tree); gg.addColorStop(1, PAL.tree2); circle(c, tx, ty, cr, gg);
      }
      // wind arrow at the grove (instrument: direction and strength now)
      const w = vortexWind(gx, GROVE_Y, 540, vy, P.vortexV), sp = Math.hypot(w[0], w[1]), wA = vA * smooth((sp - 0.25) / 0.3) * fadeOut(t, P.whole5, 0.5);
      if (wA > 0) withAlpha(c, wA, () => arrow(c, [gx - w[0] * 60, GROVE_Y - 120 - w[1] * 60], [gx + w[0] * 60, GROVE_Y - 120 + w[1] * 60], PAL.wind, 5, {head: 20}));
      const fA = onAt(t, F.t, 0.3); if (fA > 0) tag(stage, '쓰러진 쪽', gx + ux * 120, GROVE_Y + uy * 150 + (uy > 0 ? 40 : -20), {size: 28, color: PAL.warm, a: fA});
    }
    // from s05: its two motions
    const aS = fadeIn(t, P.spin5 - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.4, 0.3), aM = fadeIn(t, P.move5 - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.4, 0.3);
    spinArrow(stage, 540, vy, 205, aS);
    if (aM > 0) withAlpha(c, aM, () => { const q = easeOut((t - P.move5) / 0.6); arrow(c, [540, vy + 360], [540, vy + 360 - 140 * q], PAL.wind, 7, {head: 26}); tag(stage, '바람을 따라 옮겨 감', 540, vy + 410, {size: 28, color: PAL.wind}); });
    if (aS > 0) tag(stage, '돈다', 540 - 215, vy - 150, {size: 28, color: PAL.warm, a: aS, align: 'right'});
    bigNum(stage, '레드필드가 본 폭풍', '1821', '년', 1010, 470, onAt(t, s0 + 0.5, 0.3) * fadeOut(t, P.fell4, 0.5));
    dip(c, t, s0);
  },

  // ------------------------------------------------------------------ essence: spin in place → carried by the wind
  // chain: storm spins with no wind (ghost of its place) → trade-wind rows switch on → it drifts west; the displacement arrow grows
  essence(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    V = {lon0: 146, lat0: 15, s: 26, cx: 540, cy: 760};       // closer look at one storm (camera set at the scene start)
    drawMap(stage, {warm: 0.8, fade: false});
    const home = [156, 14], driftKmh = 20, dHours = t2 => Math.max(0, t2 - P.drift6) * 10;      // 10 h of travel per second (illustrative)
    const dLon = -dHours(t) * driftKmh / (111 * Math.cos(14 * D2R)), lon = home[0] + dLon;
    const windA = fadeIn(t, P.drift6 - 0.3, 0.5);
    windRows(stage, 'trade', windA, t);
    if (t > P.drift6) withAlpha(c, 0.9, () => { const [x, y] = X(...home); ring(c, x, y, M.R * V.s, rgba(PAL.ghost, 0.6), 2); dashedLine(c, [[x, y], X(lon, 14)], rgba(PAL.ghost, 0.7), 2.4, [7, 7]); });
    const [x, y] = X(lon, 14);
    typhoon(stage, x, y, M.R * V.s, rotAt(t), fadeIn(t, s0, 0.4));
    spinArrow(stage, x, y, M.R * V.s + 20, fadeIn(t, P.river6 + 0.4, 0.4));
    if (t > P.drift6 + 0.3) withAlpha(c, fadeIn(t, P.drift6 + 0.3, 0.4), () => arrow(c, [x + 10, y + M.R * V.s + 36], [x - 110, y + M.R * V.s + 36], PAL.wind, 6, {head: 22}));
    // s07: name the two motions
    tag(stage, '스스로 돎', x + 60, y - M.R * V.s - 62, {size: 30, color: PAL.warm, a: onAt(t, P.self7, 0.3), align: 'left'});
    tag(stage, '바람이 실어 감', x - 20, y + M.R * V.s + 84, {size: 30, color: PAL.wind, a: onAt(t, P.wind7, 0.3), align: 'right'});
    dip(c, t, s0);
  },

  // ------------------------------------------------------------------ spin: zoom into the warm sea; air drawn in, bent right, curls counter-clockwise; at the equator it runs straight
  spin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const z = easeInOut((t - s0) / 1.4), C15 = [146, 15], C0 = [146, 1.5];
    V = {lon0: lerp(VIEW.lon0, 146, z), lat0: lerp(VIEW.lat0, 11, z), s: lerp(VIEW.s, 40, z), cx: 540, cy: lerp(VIEW.cy, 760, z)};
    drawMap(stage, {warm: Math.max(0.3, fadeIn(t, P.sst8 - 0.2, 0.4)), sstLine: t > P.sst8 - 0.2, fade: false});
    bigNum(stage, '바닷물 온도', '26.5', '°C', 1010, 470, onAt(t, P.sst8) * fadeOut(t, P.gather9, 0.5));
    // ---- the 15°N try
    const cen = X(...C15), Rr = 4.2 * V.s;
    // rising moist air: cloud cells gather at the centre; isobars (low) appear
    const riseA = fadeIn(t, P.moist8 - 0.2, 0.4);
    if (riseA > 0) withAlpha(c, riseA, () => { for (let k = 0; k < 7; k++) { const ang = k / 7 * TAU, rr = Rr * 0.32 * (1 - 0.6 * smooth((t - P.rise8) / 1.2)); circle(c, cen[0] + rr * Math.cos(ang), cen[1] + rr * Math.sin(ang), 13 + 5 * rand(k), rgba(PAL.cloud1, 0.7)); } });
    const lowA = fadeIn(t, P.low8 - 0.1, 0.4) * fadeOut(t, P.ccw11, 0.6);
    if (lowA > 0) withAlpha(c, lowA, () => { for (const r of [0.45, 0.75, 1.05]) ring(c, cen[0], cen[1], Rr * r, rgba(PAL.muted, 0.7), 1.8); stage.text('저', cen[0], cen[1] + 14, {role: 'display', size: 42, weight: 700, color: PAL.ink, align: 'center'}); });
    // parcels: start on a ring, move inward; deflection to the right ∝ sin(lat) switches on at "북반구에서는"
    const bendOn = smooth((t - P.nh9) / 0.8), pathQ = tt => ((tt - P.gather9) / 3.0) % 1, cyc = t >= P.gather9;
    const S15 = 2.6 * bendOn;
    const parcel = (cx, cy, k, q, S) => { q = clamp(q); const th0 = k / 8 * TAU + 0.2, r = Rr * (1.25 - 1.05 * q), th = th0 - S * q ** 1.4; return [cx + r * Math.cos(th), cy + r * Math.sin(th)]; };
    const spiralA = fadeOut(t, P.eq12 + 0.2, 0.6) * 0.75 + 0.25;       // stays as a ghost at 15°N during the equator try
    if (cyc) withAlpha(c, fadeIn(t, P.gather9, 0.3) * spiralA, () => {
      for (let k = 0; k < 8; k++) {
        const tr = []; for (let i = 0; i <= 24; i++) tr.push(parcel(cen[0], cen[1], k, i / 24, S15));
        dashedLine(c, tr, rgba(PAL.wind, 0.45), 2, [5, 7]);
        const q = (pathQ(t) + k * 0.06) % 1; const [x, y] = parcel(cen[0], cen[1], k, q, S15); circle(c, x, y, 8, PAL.windHi);
      }
    });
    // one parcel highlighted: dashed "where it was heading" vs the bent path (right of its motion)
    const hiA = fadeIn(t, P.right9 - 0.2, 0.3) * fadeOut(t, P.left11 - 0.2, 0.4);
    if (hiA > 0) withAlpha(c, hiA, () => {
      const k = 0, st = parcel(cen[0], cen[1], k, 0, 0), straight = [st, [lerp(st[0], cen[0], 0.75), lerp(st[1], cen[1], 0.75)]];
      pathArrow(c, straight, rgba(PAL.ghost, 0.85), 3, 1, {dash: [8, 8], head: 16});
      const bent = []; for (let i = 0; i <= 18; i++) bent.push(parcel(cen[0], cen[1], k, i / 18 * 0.78, 2.6));
      pathArrow(c, bent, PAL.windHi, 5, easeOut((t - P.right9) / 0.8), {head: 20});
      tag(stage, '가던 방향', straight[1][0] + 10, straight[1][1] + 46, {size: 26, color: PAL.ghost, align: 'left'});
      tag(stage, '오른쪽으로 휨', bent[bent.length - 1][0] + 30, bent[bent.length - 1][1] - 34, {size: 28, color: PAL.windHi, align: 'left', a: onAt(t, P.right9 + 0.3, 0.3)});
      tag(stage, '전향력', st[0] + 24, st[1] + 62, {size: 30, color: PAL.wind, align: 'left', a: onAt(t, P.name10, 0.3), border: PAL.wind});
    });
    // s11: the storm forms and turns counter-clockwise (centre on the parcels' left)
    const formA = smooth((t - P.left11) / 1.6);
    typhoon(stage, cen[0], cen[1], Rr * 0.95, rotAt(t) * 1.3, formA * spiralA, formA);
    spinArrow(stage, cen[0], cen[1], Rr * 1.05, onAt(t, P.ccw11, 0.4) * spiralA);
    tag(stage, '15°N', cen[0] - Rr * 1.3, cen[1] - Rr * 0.9, {size: 28, color: PAL.ink, a: fadeIn(t, P.gather9, 0.3)});
    // ---- the equator try (s12): same parcels, deflection ∝ sin(1.5°) ≈ 0 → straight in, no spin
    const eA = fadeIn(t, P.eq12 - 0.2, 0.4);
    if (eA > 0) {
      const ce = X(...C0), q0 = (((t - P.eq12) / 2.4) % 1 + 1) % 1, S0 = 2.6 * Math.sin(1.5 * D2R) / Math.sin(15 * D2R);
      withAlpha(c, eA, () => {
        for (let k = 0; k < 8; k++) { const tr = []; for (let i = 0; i <= 12; i++) tr.push(parcel(ce[0], ce[1], k, i / 12, S0)); dashedLine(c, tr, rgba(PAL.wind, 0.45), 2, [5, 7]); const [x, y] = parcel(ce[0], ce[1], k, (q0 + k * 0.06) % 1, S0); circle(c, x, y, 8, PAL.windHi); }
        for (let k = 0; k < 5; k++) circle(c, ce[0] + 18 * Math.cos(k * 1.3), ce[1] + 18 * Math.sin(k * 1.3), 12, rgba(PAL.cloud1, 0.6));     // a heap of cloud that does not turn
        tag(stage, '적도 곁', ce[0] - Rr * 1.3, ce[1] - Rr * 0.9, {size: 28, color: PAL.ink});
      });
    }
    // instrument: the Coriolis bar ∝ sin(lat) — 15°N vs 1.5°N (same clock as the parcels)
    const latNow = t < P.eq12 ? 15 : lerp(15, 1.5, smooth((t - P.eq12) / 0.8)), barA = fadeIn(t, P.name10 - 0.1, 0.4);
    if (barA > 0) withAlpha(c, barA, () => {
      const x0 = 120, y0 = 880, wMax = 420, f = Math.sin(latNow * D2R) / Math.sin(15 * D2R);
      rect(c, x0 - 30, y0 - 70, wMax + 300, 120, 12, rgba('#03141C', 0.82));
      stage.text('전향력', x0, y0 - 24, {size: 28, weight: 700, color: PAL.wind});
      rect(c, x0, y0 - 2, wMax, 22, 6, rgba(PAL.grid, 0.9)); rect(c, x0, y0 - 2, Math.max(2, wMax * f), 22, 6, PAL.wind);
      if (t > P.eq12) withAlpha(c, 0.8, () => dashedLine(c, [[x0 + wMax, y0 - 8], [x0 + wMax, y0 + 26]], PAL.ghost, 2, [4, 4]));
      stage.text(`위도 ${latNow.toFixed(latNow < 10 ? 1 : 0)}°`, x0 + wMax + 30, y0 + 18, {size: 30, weight: 700, color: PAL.ink});
    });
    dip(c, t, s0);
  },

  // ------------------------------------------------------------------ belts: rise at the equator → sink near 30° → the high → bent outflows → trade winds and westerlies → the clockwise ring
  belts(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const z = 1 - easeInOut((t - s0) / 1.4);
    V = {lon0: lerp(VIEW.lon0, 146, z), lat0: lerp(VIEW.lat0, 11, z), s: lerp(VIEW.s, 40, z), cx: 540, cy: lerp(VIEW.cy, 760, z)};
    drawMap(stage, {warm: 0.35, korea: fadeIn(t, P.kor16 - 0.1, 0.3)});
    // Hadley loop as a side section on the left, on the SAME latitude ruler (height runs to the right)
    const loopA = fadeIn(t, P.eq13 - 0.3, 0.5) * fadeOut(t, P.south14 + 1.5, 0.8);
    if (loopA > 0) withAlpha(c, loopA, () => {
      const yE = X(0, 0)[1], y30 = X(0, 30)[1], xs = 70, xt = 290;
      rect(c, 40, y30 - 80, 290, yE - y30 + 140, 14, rgba('#03141C', 0.86));
      line(c, [[xs - 8, y30 - 60], [xs - 8, yE + 40]], rgba(PAL.muted, 0.8), 2);                       // the ground (sea surface)
      stage.text('높이 →', 190, yE + 46, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      const q1 = easeOut((t - P.rise13 + 0.1) / 0.8), q2 = easeOut((t - P.rise13 - 0.6) / 1.0), q3 = easeOut((t - P.sink13 + 0.1) / 0.8), q4 = easeOut((t - P.sink13 - 0.6) / 0.9);
      pathArrow(c, [[xs + 10, yE - 10], [xt - 20, yE - 10]], PAL.warm, 5, q1, {head: 18});                // rises at the equator
      pathArrow(c, [[xt - 10, yE - 30], [xt - 10, y30 + 20]], rgba(PAL.ink, 0.85), 4, q2, {head: 16});   // poleward aloft
      pathArrow(c, [[xt - 30, y30 + 6], [xs + 18, y30 + 6]], PAL.wind, 5, q3, {head: 18});               // sinks near 30°
      pathArrow(c, [[xs + 8, y30 + 30], [xs + 8, yE - 34]], rgba(PAL.wind, 0.8), 4, q4, {head: 16});     // back toward the equator
      tag(stage, '솟음', 180, yE - 46, {size: 26, color: PAL.warm, a: q1});
      tag(stage, '가라앉음', 180, y30 - 26, {size: 26, color: PAL.wind, a: q3});
      withAlpha(c, q3, () => dashedLine(c, [[330, y30], [W, y30]], rgba(PAL.wind, 0.5), 2, [4, 8]));      // same ruler: the sinking latitude carried across
    });
    // the high: a matte dome that fills in as the air sinks
    const hA = smooth((t - P.sink13) / 1.4);
    drawHigh(stage, M.HX, hA);
    tag(stage, '북태평양 고기압', X(M.HX + 4, M.HY)[0], X(M.HX, M.HY - 6.6)[1], {size: 30, color: PAL.ink, a: onAt(t, P.npac13, 0.3)});
    // s14: air going south from the high bends right (west) → trade winds
    const bendS = (q) => { const pts = []; for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(X(M.HX - 2 - 16 * u ** 2.2 * smooth(q), M.HY - M.hRy - 1 - 9 * Math.sin(u * Math.PI / 2))); } return pts; };
    const sA = fadeIn(t, P.south14 - 0.2, 0.3);
    if (sA > 0) withAlpha(c, sA, () => {
      const st = X(M.HX - 2, M.HY - M.hRy - 1); pathArrow(c, [st, X(M.HX - 2, M.HY - M.hRy - 11)], rgba(PAL.ghost, 0.8), 3, 1, {dash: [8, 8], head: 16});
      pathArrow(c, bendS(smooth((t - P.west14 + 0.2) / 0.8)), PAL.windHi, 6, easeOut((t - P.south14) / 0.9), {head: 22});
    });
    windRows(stage, 'trade', fadeIn(t, P.trade14 - 0.2, 0.5) * 0.9, t, easeOut((t - P.trade14 + 0.2) / 1.2));
    tag(stage, '무역풍', X(118, 13)[0], X(118, 13)[1], {size: 32, color: PAL.wind, a: onAt(t, P.trade14, 0.3), border: PAL.wind});
    // s15: air going north bends right (east) → westerlies
    const bendN = (q) => { const pts = []; for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(X(M.HX - 8 + 16 * u ** 2.2 * smooth(q), M.HY + M.hRy - 1 + 9 * Math.sin(u * Math.PI / 2))); } return pts; };
    const nA = fadeIn(t, P.north15 - 0.2, 0.3);
    if (nA > 0) withAlpha(c, nA, () => {
      const st = X(M.HX - 8, M.HY + M.hRy - 1); pathArrow(c, [st, X(M.HX - 8, M.HY + M.hRy + 9)], rgba(PAL.ghost, 0.8), 3, 1, {dash: [8, 8], head: 16});
      pathArrow(c, bendN(smooth((t - P.east15 + 0.2) / 0.8)), PAL.windHi, 6, easeOut((t - P.north15) / 0.9), {head: 22});
    });
    windRows(stage, 'west', fadeIn(t, P.wly15 - 0.2, 0.5) * 0.9, t, easeOut((t - P.wly15 + 0.2) / 1.2));
    tag(stage, '편서풍', X(112, 44)[0], X(112, 44)[1], {size: 32, color: PAL.wind, a: onAt(t, P.wly15, 0.3), border: PAL.wind});
    // s16: the clockwise ring round the high; Korea lights in the westerly belt
    highFlow(stage, M.HX, fadeIn(t, P.cw16 - 0.2, 0.5), t);
    const kA = onAt(t, P.kor16, 0.3); if (kA > 0) { const [x, y] = X(...M.korea); withAlpha(c, kA, () => ring(c, x, y, 28, PAL.mark, 3)); tag(stage, '우리나라', x - 36, y + 8, {size: 28, color: PAL.mark, a: kA, align: 'right'}); }
    dip(c, t, s0);
  },

  // ------------------------------------------------------------------ track: carried west (20 km/h) → north at the west end → north-east in the westerlies (40 km/h)
  track(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start; V = VIEW;
    drawMap(stage, {warm: 0.5, korea: 1});
    drawHigh(stage, M.HX, 1);
    windRows(stage, 'trade', 0.5, t); windRows(stage, 'west', 0.5, t); highFlow(stage, M.HX, 0.55, t);
    const T = P.T0, h = P.trackH(t), s = along(T, h), [x, y] = X(s.lon, s.lat);
    drawTrack(stage, T, h, {ahead: 0});
    typhoon(stage, x, y, M.R * V.s, rotAt(t), fadeIn(t, s0, 0.4));
    // the 30°N crossing: a small ring on the path at the turn (no word on screen)
    const turnA = onAt(t, P.trackTurn, 0.3); if (turnA > 0) { const st = along(T, hAtLat(T, 30)), [tx, ty] = X(st.lon, st.lat); withAlpha(c, turnA, () => ring(c, tx, ty, 16, PAL.warmHi, 3)); }
    headingDial(stage, 150, 1240, s.dir, 1);
    // speed: the one big number, read from the same model as the dot spacing
    const v = Math.round(s.v / 5) * 5;
    bigNum(stage, '이동 속도', `${v}`, 'km/h', 640, 1300, fadeIn(t, P.v17 - 0.2, 0.3), {size: 96});
    // s18: the west end of the high and the clockwise wind along it (the wind it is about to follow)
    const wA = fadeIn(t, P.end18 - 0.1, 0.3) * fadeOut(t, P.ne19 + 0.5, 0.5);
    if (wA > 0) withAlpha(c, wA, () => {
      const [ex, ey] = X(M.HX - M.hRx - 2, M.HY); ring(c, ex, ey, 20, PAL.windHi, 3);
      const arc = []; for (let i = 0; i <= 30; i++) arc.push(X(...ell(M.HX, 235 - i / 30 * 95, M.hRx + 2, M.hRy + 2)));
      pathArrow(c, arc, PAL.windHi, 5, easeOut((t - P.north18 + 0.3) / 0.9), {head: 20});
    });
    // s20: read the daily dots — one day's gap before the turn (≈ 20 km/h) and after it (≈ 40 km/h)
    const gA = fadeIn(t, P.v20 - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.4, 0.3);
    if (gA > 0) withAlpha(c, gA, () => {
      const gap = (d0, col, txt, dx, dy) => { const a0 = along(T, d0), a1 = along(T, d0 + 24), p0 = X(a0.lon, a0.lat), p1 = X(a1.lon, a1.lat);
        line(c, [p0, p1], col, 7); circle(c, p0[0], p0[1], 7, col); circle(c, p1[0], p1[1], 7, col);
        tag(stage, txt, (p0[0] + p1[0]) / 2 + dx, (p0[1] + p1[1]) / 2 + dy, {size: 28, color: col}); };
      gap(48, PAL.warmHi, `하루 ${Math.round(speed(along(T, 60).lat) * 24)} km`, 0, 52);
      const dAfter = Math.ceil(hAtLat(T, 35) / 24) * 24; gap(dAfter, PAL.warmHi, `하루 ${Math.round(speed(along(T, dAfter + 12).lat) * 24)} km`, 120, 10);
    });
    const kA = fadeIn(t, P.kor20 - 0.1, 0.3); if (kA > 0) { const [kx, ky] = X(...M.korea); withAlpha(c, kA, () => ring(c, kx, ky, 28, PAL.mark, 3)); tag(stage, '우리나라', kx - 40, ky - 30, {size: 28, color: PAL.mark, a: kA, align: 'right'}); }
    tag(stage, '일본', X(138.5, 37.5)[0] + 20, X(138.5, 37.5)[1] - 30, {size: 28, color: PAL.mark, a: fadeIn(t, P.tl.wordStart('s20', '일본') - 0.1, 0.3), align: 'left'});
    tag(stage, '하루에 점 하나', 880, 1258, {size: 26, color: PAL.warm, a: fadeIn(t, P.trackDays[0] - 0.1, 0.3), plateA: 0.85});
  },

  // ------------------------------------------------------------------ season: the high stretches west → the path runs by China; the high draws back east → the path turns by Japan; El Niño: born farther south-east
  season(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx; V = VIEW;
    drawMap(stage, {warm: 0.4, korea: 1});
    const hx = P.hx(t);
    ghostHigh(stage, M.HX, fadeIn(t, P.wext21, 0.3) * fadeOut(t, P.retreat21, 0.4));
    if (t > P.retreat21 - 0.2) ghostHigh(stage, M.HXwest, fadeIn(t, P.retreat21, 0.3) * fadeOut(t, P.nino22 - 0.3, 0.4));
    drawHigh(stage, hx, 1);
    highFlow(stage, hx, 0.5, t);
    // west-end gauge on the map's own longitude ruler (top edge of the high)
    const we = hx - M.hRx, [gx, gy] = X(we, M.HY);
    withAlpha(c, 0.95, () => { dashedLine(c, [[gx, gy], [gx, X(0, 47)[1]]], rgba(PAL.wind, 0.7), 2, [5, 6]); tag(stage, `서쪽 끝 ${Math.round(we)}°E`, gx, X(0, 48)[1], {size: 26, color: PAL.wind}); });
    ghostTrack(stage, P.T0, fadeIn(t, P.wext21, 0.3) * fadeOut(t, P.retreat21, 0.4));
    // run 1 (stretched west): via the China coast and the Yellow Sea
    const run = (T, r, a) => { if (t < r[0] - 0.3) return; const h = clamp((t - r[0]) * P.seasonRate, 0, T[T.length - 1].h), s = along(T, h), [x, y] = X(s.lon, s.lat); drawTrack(stage, T, h, {a, dots: false}); if (t < r[1] + 0.6) typhoon(stage, x, y, M.R * V.s * 0.8, rotAt(t), a * fadeOut(t, r[1] + 0.2, 0.4)); };
    if (t < P.retreat21 + 0.2) run(P.Tw, P.runW, fadeIn(t, P.runW[0] - 0.3, 0.3));
    else ghostTrack(stage, P.Tw, fadeOut(t, P.nino22 - 0.3, 0.4));
    run(P.Te, P.runE, fadeIn(t, P.runE[0] - 0.3, 0.3) * fadeOut(t, P.nino22 - 0.3, 0.4));
    tag(stage, '중국', X(116, 30)[0], X(116, 30)[1], {size: 28, color: PAL.ink, a: onAt(t, P.china21, 0.3) * fadeOut(t, P.nino22 - 0.3, 0.4)});
    tag(stage, '일본', X(141, 40)[0], X(141, 40)[1], {size: 28, color: PAL.ink, a: onAt(t, P.japan21, 0.3) * fadeOut(t, P.nino22 - 0.3, 0.4)});
    // s22: El Niño — the birthplace moves south-east (old place stays as a dashed ring)
    const nA = fadeIn(t, P.nino22 - 0.2, 0.4);
    if (nA > 0) withAlpha(c, nA, () => {
      const g0 = X(P.T0[0].lon, P.T0[0].lat), g1 = X(...M.ninoGen), q = easeInOut((t - P.se22) / 1.0);
      ring(c, g0[0], g0[1], 22, rgba(PAL.ghost, 0.75), 2.4); circle(c, g0[0], g0[1], 5, PAL.ghost);
      tag(stage, '보통', g0[0] - 30, g0[1] - 40, {size: 26, color: PAL.ghost, align: 'right'});
      if (q > 0) { pathArrow(c, [g0, [lerp(g0[0], g1[0], q), lerp(g0[1], g1[1], q)]], PAL.warmHi, 4, 1, {head: 16}); }
      const p1 = [lerp(g0[0], g1[0], q), lerp(g0[1], g1[1], q)];
      typhoon(stage, p1[0], p1[1], M.R * V.s * 0.7, rotAt(t), 1, 1);
      tag(stage, '엘니뇨 해', g1[0] - 10, g1[1] + 92, {size: 28, color: PAL.warm, a: onAt(t, P.se22 + 0.6, 0.3)});
    });
  },

  // ------------------------------------------------------------------ close: one more run, the three winds named as they carry it → the statement → the poster
  close(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start; V = VIEW;
    drawMap(stage, {warm: 0.6, korea: 1});
    drawHigh(stage, M.HX, 0.8);
    const wT = fadeIn(t, P.trade23 - 0.2, 0.4), wH = fadeIn(t, P.high23 - 0.2, 0.4), wW = fadeIn(t, P.wly23 - 0.2, 0.4);
    windRows(stage, 'trade', 0.35 + 0.5 * wT, t); highFlow(stage, M.HX, 0.3 + 0.5 * wH, t); windRows(stage, 'west', 0.35 + 0.5 * wW, t);
    const T = P.T0, toPoster = smooth((t - P.poster + 0.6) / 0.6);
    const h = lerp(clamp((t - P.closeStart) * P.closeRate, 0, posterH(T)), posterH(T), toPoster), s = along(T, Math.min(h, posterH(T))), [x, y] = X(s.lon, s.lat);
    drawTrack(stage, T, h, {dots: false, ahead: toPoster});
    typhoon(stage, x, y, M.R * V.s, rotAt(t), 1);
    tag(stage, '무역풍', X(140, 10)[0], X(140, 10)[1], {size: 30, color: PAL.wind, a: onAt(t, P.trade23, 0.3) * (1 - toPoster), border: PAL.wind});
    tag(stage, '고기압 가장자리', X(132, 22)[0], X(132, 22)[1], {size: 30, color: PAL.wind, a: onAt(t, P.high23, 0.3) * (1 - toPoster), border: PAL.wind});
    tag(stage, '편서풍', X(150, 42)[0], X(150, 42)[1], {size: 30, color: PAL.wind, a: onAt(t, P.wly23, 0.3) * (1 - toPoster), border: PAL.wind});
    void s0;
  },
};

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const tones = (id, times, f, gain, means, o = {}) => { if (!times.length) return; const T = [...times].sort((a, b) => a - b); ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((tt, k) => ({kind: 'tone', offset: r(tt - T[0], 4), params: {freq: Array.isArray(f) ? f[k] : f, dur: o.dur ?? 0.35, harmonics: [1, 0.25], attack: 0.02, decay: 0.12, sustain: 0.3, release: 0.2, gain_db: 0}}))}, means}); };
  const hum = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * smooth((tt - t0) / 0.4) * (1 - smooth((tt - (t1 - 0.5)) / 0.5))), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 40, high: o.high ?? 160, fade: 0.05, points: Q}, means}); };
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const sc = id => tl.scene(id), T = P.T0;
  // ---- hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 휘어진 태풍의 길', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  hum('hook_move', P.hookStart - 0.2, sc('hook').end - 0.3, tt => 0.25 + 0.5 * along(T, P.hookH(tt)).v / 40, -38, '태풍이 실려 감: 이동 속도에 따라 커지는 낮은 바람 잡음(같은 진로 모형)');
  tick('hook_turn', P.hookStart + hAtLat(T, 30) / P.hookRate, 131, -33, '위도 30°를 지나 북동쪽으로 꺾임(진행 방향 바늘이 돎)', {decay: 0.16});
  whoosh('hook_winds', P.out3 - 0.1, 1.4, 90, 200, '"바깥에": 둘레의 바람이 움직이기 시작', -36);
  // ---- origin
  hum('vortex', sc('origin').start + 0.3, P.whole5, tt => { const vy = P.vortexY(tt), w = vortexWind(540 + GROVE_DX, GROVE_Y, 540, vy, P.vortexV); return 0.15 + 0.6 * clamp(Math.hypot(w[0], w[1]) / 1.1); }, -36, '소용돌이가 다가오며 숲의 바람이 세짐(같은 소용돌이 모형)', {low: 50, high: 220});
  tick('fall', P.fallA.t, 98, -31, '두 숲의 나무가 서로 반대쪽으로 쓰러짐(소용돌이가 가장 가까울 때)', {decay: 0.22});
  tick('spin5', P.spin5, 147, -35, '"돌면서": 회전 화살표', {decay: 0.12});
  whoosh('move5', P.move5 - 0.1, 1.0, 120, 200, '"옮겨 간다": 이동 화살표', -36);
  // ---- essence
  tick('ess_spin', P.river6 + 0.4, 131, -36, '제자리에서 도는 소용돌이', {decay: 0.12});
  whoosh('ess_drift', P.drift6 - 0.2, 1.6, 180, 90, '"떠밀려": 무역풍이 켜지고 서쪽으로 실려 감', -35);
  tick('ess_self', P.self7, 147, -35, '"스스로": 회전', {decay: 0.12}); tick('ess_wind', P.wind7, 110, -35, '"둘레의": 실어 가는 바람', {decay: 0.12});
  // ---- spin
  whoosh('zoom_in', sc('spin').start, 1.2, 200, 80, '따뜻한 바다로 확대', -37);
  tick('sst', P.sst8, 165, -34, '26.5 °C', {decay: 0.14});
  swell('low', P.low8, [82, 123], '기압이 낮은 곳(등압선)', {dur: 1.4, gain: -36});
  hum('inflow', P.gather9, P.eq12 - 0.2, () => 0.45, -39, '공기가 중심으로 모여듦(낮은 흐름 잡음)', {low: 50, high: 200});
  chirp('bend', P.right9, P.right9 + 0.9, tt => 110 + 60 * smooth((tt - P.right9) / 0.9), () => 0.4, -36, '"오른쪽으로": 가던 방향에서 휘어짐(휜 각도 → 음높이)');
  tick('coriolis', P.name10, 131, -34, '"전향력"', {decay: 0.14});
  swell('ccw', P.ccw11, [110, 165], '소용돌이가 시계 반대 방향으로 돎', {dur: 1.6, gain: -34});
  chirp('equator', P.eq12, P.eq12 + 1.2, tt => 170 - 80 * smooth((tt - P.eq12) / 0.8), tt => 0.4 * (1 - smooth((tt - P.eq12 - 0.6) / 0.6)), -36, '위도를 15°에서 적도 곁으로: 전향력 막대와 같이 내려가는 음');
  // ---- belts
  whoosh('zoom_out', sc('belts').start, 1.2, 80, 200, '전체 지도로 돌아감', -37);
  swell('rise', P.rise13, [98, 147], '적도에서 솟음', {dur: 1.2, gain: -36});
  swell('sink', P.sink13, [147, 98], '30° 근처에서 가라앉아 고기압', {dur: 1.4, gain: -35});
  chirp('bend_s', P.west14 - 0.2, P.west14 + 0.8, tt => 130 - 30 * smooth((tt - P.west14 + 0.2) / 0.8), () => 0.35, -37, '남쪽으로 가던 바람이 서쪽으로 휨');
  whoosh('trade', P.trade14 - 0.1, 1.4, 160, 90, '무역풍(서쪽으로 흐름)', -35);
  chirp('bend_n', P.east15 - 0.2, P.east15 + 0.8, tt => 130 + 30 * smooth((tt - P.east15 + 0.2) / 0.8), () => 0.35, -37, '북쪽으로 가던 바람이 동쪽으로 휨');
  whoosh('westerly', P.wly15 - 0.1, 1.4, 90, 160, '편서풍(동쪽으로 흐름)', -35);
  tick('korea', P.kor16, 165, -34, '"우리나라가": 편서풍 띠 안의 우리나라', {decay: 0.14});
  // ---- track: one tick per day of travel (spacing = speed), the 30°N turn
  tones('days', P.trackDays.filter(x => x > sc('track').start && x < sc('track').end), 123, -36, '하루마다 점 하나: 점 사이 간격이 이동 속도(같은 진로 모형)');
  tick('turn', P.trackTurn, 98, -32, '위도 30°: 북동쪽으로 꺾이는 곳', {decay: 0.22});
  hum('track_move', sc('track').start + 0.2, sc('track').end - 0.2, tt => 0.2 + 0.55 * along(T, P.trackH(tt)).v / 40, -38, '이동 속도에 따라 커지는 낮은 바람 잡음');
  // ---- season
  swell('high_west', P.wext21 - 0.1, [82, 110], '고기압이 서쪽으로 뻗음', {dur: 1.4, gain: -35});
  whoosh('run_w', P.runW[0], P.runW[1] - P.runW[0], 150, 90, '중국 쪽으로 도는 길', -37);
  swell('high_east', P.retreat21 - 0.1, [110, 82], '고기압이 동쪽으로 물러남', {dur: 1.4, gain: -35});
  whoosh('run_e', P.runE[0], P.runE[1] - P.runE[0], 150, 90, '일본 쪽에서 꺾이는 길', -37);
  tick('nino', P.se22, 98, -34, '엘니뇨 해: 태어나는 곳이 남동쪽으로', {decay: 0.2});
  // ---- close
  tick('c_trade', P.trade23, 110, -35, '"무역풍에"', {decay: 0.12}); tick('c_high', P.high23, 131, -35, '"고기압을"', {decay: 0.12}); tick('c_west', P.wly23, 147, -35, '"편서풍을"', {decay: 0.12});
  swell('poster_back', P.poster, [98, 147, 196], '첫 화면의 포스터가 돌아옴', {dur: 1.8, gain: -32});
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
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (!Number.isFinite(e.at)) throw new Error(`${e.id}: bad time`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev.sort((a, b) => a.at - b.at);
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const sound = {version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 모든 사건은 `node episodes/typhoon-track/scenes.mjs --emit-sound`가 scenes.mjs 머리의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 태풍의 이동 속도 → 낮은 바람 잡음의 크기, 하루 이동 → 짧은 음(간격 = 속도), 위도 30°를 지나 꺾임 → 낮은 틱, 나무가 쓰러지는 순간 → 둔탁한 틱, 공기가 휘는 각도 → 음높이, 전향력의 크기(위도) → 음높이. 모든 기본음 700 Hz 아래. 패닝 없음(모노 안전). 배경음악·배경음 없음. 타임라인이 바뀌면 다시 실행하세요.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; days ${P.days.toFixed(2)}; hook ${P.hookSecPerDay.toFixed(2)} s/day; track ${P.trackSecPerDay.toFixed(2)} s/day start ${P.trackStart.toFixed(2)}; season ${P.seasonSecPerDay.toFixed(2)} s/day; fall A ${P.fallA.t.toFixed(2)} B ${P.fallB.t.toFixed(2)}; poster ${P.poster.toFixed(2)}`);
}
