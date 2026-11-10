// Episode scenes — "밀물과 썰물이 생기는 이유" (28)
// Shape: export {theme, scenes, overlays, background, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Visual grammar (2026-11-10 user decision, docs/ANIMATION_QUALITY.md top section "움직임이 설명하고, 빛은 조금만";
// remade 2026-11-10 from the first night-build cut): ONE stage — the Earth–Moon system seen from above the north pole,
// slightly oblique. Heroes are MATTE masses with faces and shading: the ray-traced Earth (globe.mjs drawEarthLit, no
// specular) inside a matte cyan water shell (light-side gradient + white rim, never glowing) whose two bulges are the
// subject. Only the Sun glows (light); the Moon's pull is drawn as instrument lines (arrows, static field rings).
// Warm = the pull (cause: Moon/Sun gravity, force numbers), cool = the water (result: bulges, water height).
// Every moving thing is one link of a chain; condition changes leave dashed ghosts (old shell, old Moon, old arrows);
// the Earth spins only where the kicker declares a time scale (hook 1 day = 8 s, rotate 1 day = 5 s, myth "자전을 빠르게")
// and is still while forces are compared. Camera moves only at scene starts (structure), never during a comparison.
// The coast scene is a matte cross-section (water mass over a mudflat) with metre scales inside the world.
// Nothing of the notes below is printed on screen as a footnote.
//
// =====================================================================================================
// MODEL — one block read by the picture, the readouts and sound.json (node episodes/tides/scenes.mjs --emit-sound)
// =====================================================================================================
//  - Frame: X, Y = the Moon's orbital plane (drawn as the equator plane; the 5° and 23.4° tilts are ignored), Z = north.
//    Earth radius 1 at the origin. The Sun's tide acts along −X (Sun far to screen-left). Earth spins counter-clockwise
//    seen from the north (west → east), the Moon orbits the same way.
//  - Equilibrium tide (설명 모형): height ∝ (p·m)² − 1/3 for a unit surface vector p and Moon direction m; the Sun adds
//    K_sun·((p·s)² − 1/3). K_sun = (M_sun/M_moon)·(d_moon/d_sun)³ = 2.709e7 / 389.2³ ≈ 0.46.
//    Drawn shell radius r(p) = 1 + W0 + A·h(p) (thickness and bulge hugely exaggerated, declared in a kicker).
//  - Tidal force on a unit mass at p (direction pattern only): F ∝ 3(p·m)m − p; its sideways (tractive) part along the
//    surface drives water toward the sub-lunar point and its antipode. Water dots follow dΔ/dt = −k·sin 2Δ.
//  - Gravity arrows (essence): near / centre / far pull = (1 ± 0.45)·L, a linearised, exaggerated version of 1/d²
//    (real Earth–Moon: ±3.4 %); the residual after subtracting the centre pull is symmetric ±0.45·L.
//  - Display Earth–Moon distance 2.6 Earth radii (real ≈ 60.3); Moon radius true (0.273), drawn ×1.3 in the zoomed-out
//    sun scene.
//  - Daily rhythm: the marker (서해, 37.5°N 126.6°E) feels a high tide when its longitude faces the Moon or the opposite
//    side. Lunar day 24 h 50 min → high tide every 12 h 25 min. Rotate scene: one sidereal day = 5 s of film, the Moon
//    advances 13.2°/day (so one lunar day ≈ 5.19 s).
//  - Spring / neap: the combined range ∝ |1 + K_sun·e^{2iΔ}| with Δ = Moon–Sun angle → 1.46 (spring) … 0.54 (neap).
//  - Coast cross-section: η(x, t) = a(x)·cos(ω(t − t0) − φ(x)), a(x) from 0.5 m (open sea, range ≈ 1 m) to 4.5 m
//    (Incheon spring range ≈ 9 m), phase lag growing shoreward (a wave travelling in). 16 px per metre; horizontal
//    distance not to scale. Period 6 s of film per tidal cycle.
//  - Sound: node episodes/tides/scenes.mjs --emit-sound writes sound.json from this model and the time plan below.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, glow, arrow, poly, rect, withAlpha, TAU, rand, loadTimeline} from '../../pipeline/render/index.mjs';
import {D2R, unit, dot, add, sub, mul, loadLand, lookCam, earthTextures, drawEarthLit, nightShade} from '../../pipeline/render/globe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920;
export const theme = 'noturno';
export const captionLayout = {};

export const M = {
  massRatio: 2.709e7, distRatio: 389.2,          // Sun ÷ Moon
  DM: 2.45, RM: 0.273,                            // display Earth–Moon distance, Moon radius (Earth radii)
  W0: 0.14, A: 0.36,                             // display shell thickness and bulge amplitude (Earth radii)
  dayFilm: 5,                                    // rotate scene: one sidereal day = 5 s of film
  hookDay: 45,                                   // hook: 45°/s = one day in 8 s (declared in the kicker)
  moonPerDay: 13.18,                             // ° per sidereal day
  tideFilm: 6,                                   // coast scene: one tidal cycle = 6 s of film
  pxPerM: 26,
  korea: [37.5, 126.6],
  bump: 0.45,                                    // essence: ± pull difference (exaggerated)
};
M.sunK = M.massRatio / M.distRatio ** 3;         // ≈ 0.460
const GAUGE_X01 = (600 - 60) / (1020 - 60);      // Incheon gauge position in the coast section (x 600 of 60…1020)
const S_TIDE = [-1, 0, 0];                       // Sun direction for the tide (in plane)
const S_LIGHT = unit([-0.86, -0.28, 0.42]);      // light on the Earth/Moon: the Sun from screen-left, a little above the plane
const PAL = {ink: '#EFE3D4', muted: '#8AA0A6', water: '#5CC8F5', waterHi: '#B9ECFF', deep: '#0B4A72', pull: '#FFB547', sun: '#FFD27A',
  moon: '#D8DBE1', mark: '#FFE2C4', mud: '#5B4936', mud2: '#8A6E4E', land: '#3A3326', grid: '#2B4A57',
  // matte water mass (lit side → shadow side) and its rim; ghosts (old states) are dashed light grey
  wLit: '#8CD6EC', wMid: '#3F9CC2', wDark: '#0E3B55', rim: '#E6F7FF', ghost: '#C9D6DC'};

// =====================================================================================================
// small helpers
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
function rampEase(q, r = 0.2) { q = clamp(q); const v = 1 / (1 - r); if (q < r) return v * q * q / (2 * r); if (q > 1 - r) return 1 - v * (1 - q) ** 2 / (2 * r); return v * (q - r / 2); }
const EASE = {io: easeInOut, o: easeOut, lin: q => clamp(q), ramp: rampEase};
/** keyed schedule [[t, v, ease], …]; ease shapes the segment ending at that key; 'jump' = step */
function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [t1, v1, e] = K[i]; if (t < t1) { const [t0, v0] = K[i - 1]; if (e === 'jump') return v0; return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / (t1 - t0)); } }
    return K[K.length - 1][1];
  };
}
/** keyed camera: each key = [t, {cx, cy, R, e, az, tx, ty}] */
function keyedCam(K, ease = 'io') {
  K = K.map(([t, o]) => [t, {...HOME, ...o}]);
  const keys = Object.keys(K[0][1]), f = {};
  for (const k of keys) f[k] = keyed(K.map(([t, o], i) => [t, o[k], i ? ease : undefined]));
  return t => Object.fromEntries(keys.map(k => [k, f[k](t)]));
}
function convexHull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const vdeg = a => [Math.cos(a * D2R), Math.sin(a * D2R), 0];
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 28, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba('#03141C', o.plateA ?? 0.78), o.border ? rgba(o.border, 0.85) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink, role: o.role});
  });
  return w;
}
const clampX = (stage, s, x, size = 28) => { const w = stage.measure(s, {size, weight: 700}) / 2 + 12; return clamp(x, 70 + w, 930 - w); };

// =====================================================================================================
// TIME PLAN (word anchors; shared with --emit-sound)
// =====================================================================================================
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  const at = r => tl.at(r), wd = (s, w, o = 0) => tl.wordStart(s, w) + o, sc = id => tl.scene(id);
  P = {tl, end: tl.duration};
  P.MORPH = [0.9, 1.7];
  P.seoul = wd('s02', '서해'); P.back2 = wd('s02', '물러났다가'); P.moon3 = wd('s03', '달인데'); P.far3 = wd('s03', '반대쪽');
  P.jo = wd('s04', '아침'); P.seok = wd('s04', '저녁'); P.josuk = wd('s04', '조석이라');
  P.gal = wd('s05', '갈릴레이는'); P.slosh = wd('s05', '출렁이게'); P.reject = wd('s05', '물리쳤습니다');
  P.newton = wd('s06', '뉴턴은'); P.grav = wd('s06', '만유인력으로'); P.place = wd('s06', '자리마다');
  P.far7 = wd('s07', '멀수록'); P.near7 = wd('s07', '가까운'); P.ctr7 = wd('s07', '중심보다'); P.farP7 = wd('s07', '먼');
  P.near8 = wd('s08', '가까운'); P.far8 = wd('s08', '먼');
  P.sub9 = wd('s09', '빼고'); P.out9 = wd('s09', '끌려');
  P.far10 = wd('s10', '먼'); P.two10 = wd('s10', '두');
  P.name11 = wd('s11', '기조력이라고'); P.num11 = wd('s11', '천만분의');
  P.side12 = wd('s12', '옆으로'); P.gather12 = wd('s12', '모읍니다');
  P.day13 = wd('s13', '지구가'); P.coast13 = wd('s13', '바닷가는'); P.two13 = wd('s13', '두');
  P.moon14 = wd('s14', '달도'); P.num14 = wd('s14', '열두시간');
  P.sun15 = wd('s15', '태양은'); P.mass15 = wd('s15', '이천칠백만배'); P.dist15 = wd('s15', '삼백구십배'); P.half15 = wd('s15', '절반이');
  P.full16 = wd('s16', '보름달과'); P.new16 = wd('s16', '그믐달'); P.line16 = wd('s16', '겹쳐'); P.spring16 = wd('s16', '사리가');
  P.half17 = wd('s17', '반달'); P.cross17 = wd('s17', '엇갈려'); P.neap17 = wd('s17', '조금이');
  P.ocean18 = wd('s18', '넓은'); P.one18 = wd('s18', '일미터쯤입니다');
  P.inch19 = wd('s19', '인천'); P.nine19 = wd('s19', '구미터에');
  P.shallow20 = wd('s20', '넓고'); P.high20 = wd('s20', '높아지고'); P.bay20 = wd('s20', '좁은');
  P.q21 = wd('s21', '반대쪽'); P.spin21 = wd('s21', '돌아서');
  P.no22 = wd('s22', '아닙니다'); P.rot22 = wd('s22', '자전은'); P.two22 = wd('s22', '두'); P.follow22 = wd('s22', '따라');
  P.poster = at('s23:end') - 1.6;
  const S = id => sc(id);
  P.sc = Object.fromEntries(tl.scenes.map(s => [s.id, s]));

  // ---- spin rate (deg/s of film) → integrated spin; Moon angle
  const rot = S('rotate'), myth = S('myth'), hook = S('hook'), org = S('origin');
  // Spin only where a time scale is declared (grammar 7). Elsewhere the Earth waits while forces are compared.
  const rate = t => {
    if (t < hook.end) return M.hookDay * smooth((t - P.seoul + 0.6) / 0.6) * (1 - smooth((t - P.moon3 + 0.1) / 0.7));
    if (t >= org.start && t < org.end) return 40 * smooth((t - P.gal + 0.2) / 0.6) * (1 - smooth((t - P.newton + 0.7) / 0.6));
    if (t >= rot.start && t < rot.end) return (360 / M.dayFilm) * smooth((t - rot.start - 0.2) / 0.9) * (1 - smooth((t - rot.end + 0.9) / 0.8));
    if (t >= myth.start && t < myth.end) return 110 * smooth((t - P.spin21 + 0.3) / 0.7) * (1 - smooth((t - P.two22 - 0.4) / 0.9));
    return 0;
  };
  const dt = 1 / 120, N = Math.ceil(P.end / dt) + 2, spinA = new Float64Array(N), moonA = new Float64Array(N);
  let sp = 0, mo = 0;
  for (let i = 0; i < N; i++) {
    const t = i * dt; spinA[i] = sp; moonA[i] = mo;
    const r = rate(t); sp += r * dt;
    if (t >= rot.start && t < rot.end) mo += r * (M.moonPerDay / 360) * dt;
  }
  const look = (A, t) => { const x = clamp(t / dt, 0, N - 1.001), i = Math.floor(x), q = x - i; return A[i] + (A[i + 1] - A[i]) * q; };
  P.spin = t => look(spinA, t) + 105;                      // marker starts a little before facing the Moon
  P.rate = rate;
  const rotMoon = t => 90 + look(moonA, t);
  const sunS = S('sun'), mAfter = rotMoon(rot.end);
  const sunMoon = keyed([[sunS.start, mAfter], [P.full16 - 0.2, mAfter, 'lin'], [P.new16 + 0.1, 180, 'io'], [P.half17 - 0.2, 180, 'lin'], [P.cross17 + 0.4, 270, 'io'], [sunS.end, 270, 'lin']]);   // the Moon's place is the one condition changed
  const mythMoon = keyed([[myth.start, 90], [P.two22 - 0.1, 90, 'lin'], [P.follow22 + 1.2, 170, 'io']]);
  P.moon = t => {
    if (t < rot.start) return 90;
    if (t < rot.end) return rotMoon(t);
    if (t < sunS.end) return sunMoon(t);
    if (t < myth.start) return 90;
    if (t < myth.end) return mythMoon(t);
    return 90;
  };
  // ---- marker longitude (world angle) and its tide
  P.markAng = t => M.korea[1] + P.spin(t);
  P.markH = (t, sunK = 0) => {          // equilibrium height at the marker (relative units)
    const la = M.korea[0] * D2R, a = P.markAng(t) * D2R, p = [Math.cos(la) * Math.cos(a), Math.cos(la) * Math.sin(a), Math.sin(la)], m = vdeg(P.moon(t));
    return dot(p, m) ** 2 - 1 / 3 + sunK * (dot(p, S_TIDE) ** 2 - 1 / 3);
  };
  // high tides at the marker: Δ = marker − Moon ≡ 0 (mod 180)
  P.highs = (t0, t1) => { const out = []; let prev = null; for (let t = t0; t <= t1; t += 0.004) { const d = ((P.markAng(t) - P.moon(t)) % 180 + 180) % 180; if (prev !== null && d < prev - 90) out.push(t); prev = d; } return out; };
  P.lows = (t0, t1) => { const out = []; let prev = null; for (let t = t0; t <= t1; t += 0.004) { const d = ((P.markAng(t) - P.moon(t) + 90) % 180 + 180) % 180; if (prev !== null && d < prev - 90) out.push(t); prev = d; } return out; };
  P.hookHighs = P.highs(P.seoul + 0.2, S('hook').end - 0.3);
  P.rotHighs = P.highs(rot.start + 0.6, rot.end - 0.4);
  P.rotLows = P.lows(rot.start + 0.6, rot.end - 0.4);
  // rotate scene: simulated hours since the scene start (graph x axis)
  P.rotHours = t => (P.spin(t) - P.spin(rot.start + 0.2)) / 360 * 23.934;
  // coast scene clock
  const ws = S('westsea');
  // phase the coast clock so Incheon's high water touches the top of its 9 m band on the word "구미터에" (same frame as the number)
  { const lag = (1.3 * GAUGE_X01 ** 1.3 + 0.4) / TAU * M.tideFilm; let t0 = P.nine19 - lag; while (t0 > ws.start) t0 -= M.tideFilm; P.coastT0 = t0; }
  P.eta = (x01, t) => {     // x01: 0 open sea … 1 shore; metres
    const a = 0.5 + 4.0 * smooth(clamp((x01 - 0.15) / 0.45)), ph = 1.3 * x01 ** 1.3;
    return a * Math.cos(TAU * (t - P.coastT0) / M.tideFilm - ph - 0.4);
  };
  P.coastHighs = []; { let prev = null; for (let t = ws.start + 0.5; t < ws.end - 0.3; t += 0.004) { const v = P.eta(GAUGE_X01, t); if (prev !== null && prev.v1 > prev.v0 && v < prev.v1) P.coastHighs.push(t - 0.004); prev = {v0: prev ? prev.v1 : v, v1: v}; } }
  PLANS.set(tl, P);
  return P;
}

// =====================================================================================================
// WORLD: camera, shell, Earth, Moon, Sun
// =====================================================================================================
const LAND = loadLand(path.join(HERE, 'land.json'));
const TEX = earthTextures(LAND, {seed: 5});
/** oblique camera above the plane looking at target (tx, ty, 0): elevation e, azimuth az (0 = from −Y, screen-up ≈ +Y) */
function camOf({cx = 540, cy = 1080, R = 230, e = 68, az = 0, tx = 0, ty = 0, D = 12}) {
  const a = (az - 90) * D2R, h = [Math.cos(a), Math.sin(a), 0], ee = e * D2R, T = [tx, ty, 0];
  const pos = add(T, mul(add(mul(h, Math.cos(ee)), [0, 0, Math.sin(ee)]), D));
  const c = lookCam({pos, target: T, up: [0, 0, 1], F: R * Math.sqrt(D * D - 1), cx, cy});
  c.Rpx = R; return c;
}
const P2 = (cam, p) => { const q = cam.P(p); return [q[0], q[1]]; };
const HOME = {cx: 580, cy: 1010, R: 262, e: 66, az: -25, tx: 0, ty: 0};
/** water-shell radius at unit direction p. o.k = Moon tide; o.kNear/o.kFar (optional) grow the Moon-side and far-side
 *  halves separately (stretch scene: the near water is pulled out first, the far water is left behind next). */
function shellR(p, o) {
  const m = vdeg(o.moon), pm = dot(p, m), k = o.kNear !== undefined ? (pm >= 0 ? o.kNear : o.kFar) : o.k;
  let h = k * (pm ** 2 - 1 / 3) + (o.ks || 0) * M.sunK * (dot(p, S_TIDE) ** 2 - 1 / 3);
  if (o.slosh) h += o.slosh[2] * dot(p, [o.slosh[0], o.slosh[1], 0]);
  return 1 + M.W0 + (o.A ?? M.A) * h;
}
function shellHull(cam, o) {
  const pts = [];
  for (let i = 0; i <= 18; i++) { const th = i / 18 * Math.PI, z = Math.cos(th), rr = Math.sin(th);
    for (let j = 0; j < (i === 0 || i === 18 ? 1 : 64); j++) { const ph = j / 64 * TAU, p = [rr * Math.cos(ph), rr * Math.sin(ph), z]; pts.push(P2(cam, mul(p, shellR(p, o)))); } }
  return convexHull(pts);
}
function equatorRing(cam, o, n = 180) { const pts = []; for (let j = 0; j <= n; j++) { const p = vdeg(j / n * 360); pts.push(P2(cam, mul(p, shellR(p, o)))); } return pts; }
function moonBall(stage, cam, pos, rW, a = 1) {
  const c = stage.ctx, s = cam.P(pos); if (s[2] < 0.05) return null;
  const r = rW * cam.F / s[2], [x, y] = s;
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#ECEEF1'); g.addColorStop(1, '#9CA2AA'); circle(c, x, y, r, g);
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.32, -0.32, 0.1], [-0.12, 0.42, 0.13], [0.05, -0.05, 0.08]]) circle(c, x + dx * r, y + dy * r, rr * r, rgba('#7F858E', 0.38));
    const sv = [dot(S_LIGHT, cam.r), dot(S_LIGHT, cam.u), -dot(S_LIGHT, cam.f)];
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); nightShade(c, {cx: x, cy: y, R: r}, sv, 0.86, '#03080C'); c.restore();
  });
  return [x, y, r];
}
function sunGlow(stage, x, y, R, a) {          // the Sun is the one thing that shines (light); kept local at the screen edge
  const c = stage.ctx;
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, rgba('#FFF4DA', 1)); g.addColorStop(0.22, rgba('#FFE09A', 0.95)); g.addColorStop(0.36, rgba(PAL.pull, 0.36)); g.addColorStop(0.62, rgba('#C8641E', 0.08)); g.addColorStop(1, rgba('#C8641E', 0));
    circle(c, x, y, R, g);
  });
}
/** a dashed ghost of an old shell state (grammar 3: keep the old value on screen) */
function ghostShell(stage, cam, so, a) {
  if (a <= 0) return;
  const c = stage.ctx, hull = shellHull(cam, so);
  withAlpha(c, a, () => { poly(c, hull, rgba(PAL.ghost, 0.05)); line(c, [...hull, hull[0]], rgba(PAL.ghost, 0.5), 2, {dash: [7, 7]}); });
}
/** a dashed ghost of the Moon at an old place */
function ghostMoon(stage, cam, ang, a, scale = 1) {
  const s = cam.P(mul(vdeg(ang), M.DM)); if (s[2] < 0.05 || a <= 0) return null;
  const r = M.RM * scale * cam.F / s[2];
  withAlpha(stage.ctx, a, () => { circle(stage.ctx, s[0], s[1], r, rgba(PAL.ghost, 0.06)); dashRing(stage.ctx, s[0], s[1], r, rgba(PAL.ghost, 0.55), 2, [5, 6]); });
  return [s[0], s[1], r];
}
/** the Moon's pull as instrument lines: static rings that open outward once (q 0→1), fainter with distance */
function pullRings(stage, mp, d, q, a) {
  if (a <= 0 || q <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => { for (let k = 1; k <= 6; k++) { const on = smooth((q * 6.4 - k + 1) / 0.8); if (on <= 0) break; dashRing(c, mp[0], mp[1], d * (0.22 + 0.3 * k), rgba(PAL.pull, (0.62 - 0.08 * k) * on), 2.6 - 0.25 * k, [3, 7]); } });
}
function dashRing(c, x, y, r, col, w, dash) { const pts = []; for (let i = 0; i <= 96; i++) { const q = i / 96 * TAU; pts.push([x + r * Math.cos(q), y + r * Math.sin(q)]); } line(c, pts, col, w, {dash}); }
/** the whole world. o: {cam, t, spin, moon, k | kNear+kFar, ks, A, slosh, moonA, shellA, earthA, orbitA, sun: {a, x, y, R},
 *  field: {a, q} (the Moon's pull as static rings), mark, markPulse, ghost: [{so, a}], hiFar (0…1 rim highlight of the far bulge)} */
function world(stage, o) {
  const c = stage.ctx, cam = o.cam, Rp = cam.Rpx, E = P2(cam, [0, 0, 0]);
  if (o.sun && o.sun.a > 0) sunGlow(stage, o.sun.x, o.sun.y, o.sun.R, o.sun.a);
  if (o.orbitA > 0) { const pts = []; for (let j = 0; j <= 160; j++) pts.push(P2(cam, mul(vdeg(j / 160 * 360), M.DM))); withAlpha(c, o.orbitA, () => line(c, pts, rgba('#9FB8C4', 0.4), 1.5, {dash: [4, 9]})); }
  const mpos = mul(vdeg(o.moon), M.DM), mp0 = P2(cam, mpos);
  if (o.field && o.field.a > 0) pullRings(stage, mp0, Math.hypot(mp0[0] - E[0], mp0[1] - E[1]), o.field.q ?? 1, o.field.a * (o.earthA ?? 1));
  for (const g of o.ghost || []) ghostShell(stage, cam, g.so, g.a * (o.earthA ?? 1));
  const so = {moon: o.moon, k: o.k ?? 1, kNear: o.kNear, kFar: o.kFar, ks: o.ks || 0, A: o.A, slosh: o.slosh};
  const hull = shellHull(cam, so), Rmax = Rp * (1 + M.W0 + (o.A ?? M.A) * 0.9);
  // matte water mass: shaded from the lit side (toward the Sun, upper-left) to the shadow side; no glow
  const lp = P2(cam, mul(S_LIGHT, 1)), ld = Math.hypot(lp[0] - E[0], lp[1] - E[1]) || 1, ux = (lp[0] - E[0]) / ld, uy = (lp[1] - E[1]) / ld;
  withAlpha(c, (o.shellA ?? 1) * (o.earthA ?? 1), () => {
    const g = c.createLinearGradient(E[0] + ux * Rmax, E[1] + uy * Rmax, E[0] - ux * Rmax, E[1] - uy * Rmax);
    g.addColorStop(0, PAL.wLit); g.addColorStop(0.45, PAL.wMid); g.addColorStop(1, PAL.wDark);
    poly(c, hull, g);
  });
  withAlpha(c, o.earthA ?? 1, () => drawEarthLit(stage, cam, TEX, {axis: [0, 0, 1], spin: o.spin, sun: S_LIGHT, night: 0.13, cloudA: 0.42, cloudDrift: 0, atmo: 0.03, spec: 0}));
  withAlpha(c, (o.shellA ?? 1) * (o.earthA ?? 1), () => {
    // the water level at the equator drawn over the disc (where the shell rises above the land), then the white rim
    const ring_ = equatorRing(cam, so);
    c.save(); c.beginPath(); hull.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
    line(c, ring_, rgba(PAL.rim, 0.28), 1.8);
    c.restore();
    poly(c, hull, null, rgba(PAL.rim, 0.72), 2.2);
    if (o.hiFar > 0) {      // point at the far bulge: its rim brightens (a line, not a glow)
      const m = P2(cam, mpos), ml = Math.hypot(m[0] - E[0], m[1] - E[1]), proj = ([x, y]) => ((x - E[0]) * (m[0] - E[0]) + (y - E[1]) * (m[1] - E[1])) / ml;
      const n = hull.length; let i0 = 0; for (let i = 1; i < n; i++) if (proj(hull[i]) < proj(hull[i0])) i0 = i;
      // contiguous arc around the far tip (walk both ways from the farthest hull point)
      const seg = [hull[i0]]; for (let d = 1; d < n; d++) { const q = hull[(i0 + d) % n]; if (proj(q) >= -0.62 * Rp) break; seg.push(q); }
      const segL = []; for (let d = 1; d < n; d++) { const q = hull[((i0 - d) % n + n) % n]; if (proj(q) >= -0.62 * Rp) break; segL.unshift(q); }
      const farArc = [...segL, ...seg];
      if (farArc.length > 1) withAlpha(c, o.hiFar, () => { line(c, farArc, rgba('#FFFFFF', 0.95), 5); });
    }
  });
  let moon = null;
  if ((o.moonA ?? 1) > 0) moon = moonBall(stage, cam, mpos, M.RM * (o.moonScale ?? 1), (o.moonA ?? 1) * (o.earthA ?? 1));
  let mark = null;
  if (o.mark > 0) {
    const la = M.korea[0] * D2R, a = (M.korea[1] + o.spin) * D2R, p = [Math.cos(la) * Math.cos(a), Math.cos(la) * Math.sin(a), Math.sin(la)], s = P2(cam, mul(p, 1.0));
    if (!cam.hidden(mul(p, 1.004))) {
      mark = s;
      const q = o.markPulse || 0;      // the marker lights only at its own event (high water)
      withAlpha(c, o.mark, () => { if (q > 0.02) glow(c, s[0], s[1], 30, PAL.mark, 0.65 * q); ring(c, s[0], s[1], 12 + 9 * q, rgba(PAL.mark, 0.95), 2.6); circle(c, s[0], s[1], 4.5, PAL.mark); });
    }
  }
  return {E, moon, mark, hull, mpos};
}
/** poster accent: the Earth–Moon axis (thin warm dashed line) so the two bulges read as "along the Moon" — no glow, no text */
function posterAccent(stage, cam, a) {
  if (a <= 0) return;
  const c = stage.ctx, R = 1 + M.W0 + M.A * 0.67, p0 = P2(cam, [0, -R - 0.25, 0]), p1 = P2(cam, [0, M.DM - M.RM - 0.12, 0]);
  withAlpha(c, a, () => line(c, [p0, p1], rgba(PAL.pull, 0.55), 2, {dash: [6, 9]}));
}
function glowLine(c, pts, col, a) { line(c, pts, rgba(col, a * 0.5), 9); line(c, pts, rgba(col, a), 4.5); }
/** an arrow in world space */
function arrowW(stage, cam, p0, p1, col, w = 4, head) { const a = P2(cam, p0), b = P2(cam, p1); arrow(stage.ctx, a, b, col, w, {head: head ?? Math.max(14, w * 4)}); return [a, b]; }

// =====================================================================================================
// Titles, poster, overlays, background
// =====================================================================================================
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, '오늘의 주제 · 하루를 8초로', '반대쪽 바다는 왜 부풀까?']];
  if (id === 'origin') return [[-Infinity, '기원 · 이름', '潮汐 = 아침 밀물 + 저녁 밀물'], [at('s05'), '1632 · 갈릴레이', '지구가 움직여서 출렁인다?'], [at('s06'), '1687 · 뉴턴', '자리마다 다른 달의 당김']];
  if (id === 'essence') return [[-Infinity, '본질 · 달 거리 축소, 차이 과장', '멀수록 약한 당김'], [at('s08'), '본질 · 달 거리 축소, 차이 과장', '가까운 쪽은 세게, 먼 쪽은 약하게']];
  if (id === 'stretch') return [[-Infinity, '메커니즘 ① · 부풂 크기 과장', '당김의 차이 = 기조력'], [at('s11'), '메커니즘 ① · 부풂 크기 과장', '아주 작지만, 옆으로 민다']];
  if (id === 'rotate') return [[-Infinity, '메커니즘 ② · 하루를 5초로', '두 부풂 밑을 도는 지구']];
  if (id === 'sun') return [[-Infinity, '메커니즘 ③ · 태양 거리 축소', '달의 절반이 안 되는 힘'], [P.full16 - 0.4, '메커니즘 ③ · 달의 자리만 바꿈', '사리와 조금']];
  if (id === 'westsea') return [[-Infinity, '현상 · 높이 크게 과장', '넓은 바다는 1 m'], [P.inch19 - 0.4, '현상 · 서해', '인천 앞바다는 9 m'], [at('s20'), '현상 · 서해', '얕은 바다가 물결을 키운다']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기 · 자전을 빠르게', '자전 때문일까?'], [P.two22 - 0.3, '오해 바로잡기 · 달을 옮김', '부풂은 달을 따라간다']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.pull, align: 'center', tracking: 1.5, maxWidth: 860, ...so}); line(c, [[505, 174], [575, 174]], PAL.pull, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 880, ...so}));
}
const POSTER = {q: '반대쪽 바다는 왜 부풀까?', a: '덜 당겨져서', y: 960, y2: 1098};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 860, 100); AS ||= fit(POSTER.a, 860, 156);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 56, q), tr = lerp(-0.03, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, 840, 0, 1210); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.3, 'rgba(0,10,16,0.62)'); g.addColorStop(0.75, 'rgba(0,10,16,0.62)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, 840, W, 370); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    withAlpha(c, 1 - q, () => stage.text(POSTER.a, 540, lerp(POSTER.y2, 292, q), {role: 'display', weight: 700, size: lerp(AS, 34, q), color: PAL.pull, align: 'center', tracking: tr * AS, shadow: sh, shadowBlur: 28}));
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1320, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,8,12,0.38)'); g.addColorStop(1, 'rgba(0,8,12,0.6)'); c.fillStyle = g; c.fillRect(0, 1320, W, 600); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < P.MORPH[1]) { posterTitle(stage, easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    captionBand(stage.ctx); progressBar(stage, t, ctx.tl.duration); return;
  }
  captionBand(stage.ctx);
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
const STARS = Array.from({length: 220}, (_, i) => ({x: rand(i * 3.1 + 1) * W, y: rand(i * 7.7 + 2) * H, m: rand(i * 1.9 + 5) ** 3}));   // still: no twinkle (no decorative motion)
export function background(stage, t, ctx) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 300, H); g.addColorStop(0, '#02202D'); g.addColorStop(1, '#000B12');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (ctx?.scene?.id !== 'westsea') for (const s of STARS) {
    const al = 0.1 + 0.45 * s.m, r = 0.6 + 1.5 * s.m;
    c.fillStyle = rgba('#E8F0F6', al);
    c.fillRect(s.x - r / 2, s.y - r / 2, r, r);
  }
  const v = c.createRadialGradient(540, 900, 560, 540, 900, 1500); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/tides/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.rotHighs.length}/${(P.rotHighs[0] || 0).toFixed(3)}/${P.coastHighs.length}/${M.sunK.toFixed(4)}`; }
const dip = (c, t, t0, d = 0.45) => { const q = (t - t0) / d; if (q >= 0 && q < 1) { c.fillStyle = `rgba(0,10,16,${1 - smooth(q)})`; c.fillRect(0, 0, W, H); } };

// camera presets (structure moves happen only at scene starts; a comparison is watched from a still camera)
const CAM = {
  home: {...HOME},
  gal: {cx: 660, cy: 960, R: 170, e: 62, az: 0},
  rot: {cx: 590, cy: 830, R: 196, e: 66, az: -25},
  sun: {cx: 640, cy: 850, R: 150, e: 64, az: 0},
  myth: {cx: 650, cy: 960, R: 178, e: 64, az: -25},
};
/** a number that appears ON its event frame (one frame early, up within 0.1 s) */
const onAt = (t, t0, d = 0.1) => smooth((t - t0 + 0.034) / d);
/** the one big number of a scene: right-aligned in the number zone (y ≈ 300…520) */
function bigNum(stage, label, num, unit, x, y, a, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18}, size = o.size || 120, us = Math.round(size * 0.47);
  withAlpha(c, a, () => {
    const uw = unit ? stage.measure(unit, {role: 'display', size: us, weight: 700}) + 12 : 0;
    stage.text(num, x - uw, y, {role: 'display', size, weight: 700, color: o.col || PAL.ink, align: 'right', ...so});
    if (unit) stage.text(unit, x, y + size * 0.12, {role: 'display', size: us, weight: 700, color: o.ucol || PAL.waterHi, align: 'right', ...so});
    if (label) stage.text(label, x, y - size * 0.78, {size: 30, weight: 500, color: PAL.muted, align: 'right', ...so});
  });
}
/** pull arrow at a world point: a dot + an arrow toward the Moon (+Y) of length v (Earth radii; negative = away) */
function pullArrow(stage, cam, pt, v, a, col = PAL.pull) {
  if (a <= 0) return;
  const c = stage.ctx, p0 = P2(cam, pt);
  withAlpha(c, a, () => { circle(c, p0[0], p0[1], 8, col); if (Math.abs(v) > 0.02) arrowW(stage, cam, pt, add(pt, [0, v, 0]), col, 6, 24); });
}
/** dashed ghost of an old arrow */
function ghostArrow(stage, cam, pt, v, a) {
  if (a <= 0 || Math.abs(v) < 0.02) return;
  const c = stage.ctx, p0 = P2(cam, pt), p1 = P2(cam, add(pt, [0, v, 0])), dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  withAlpha(c, a, () => { line(c, [p0, p1], rgba(PAL.ghost, 0.6), 2.4, {dash: [6, 6]}); line(c, [[p1[0] - 16 * ux + 9 * uy, p1[1] - 16 * uy - 9 * ux], p1, [p1[0] - 16 * ux - 9 * uy, p1[1] - 16 * uy + 9 * ux]], rgba(PAL.ghost, 0.6), 2.4); });
}
const NEAR = [0, 1, 0], CTR = [0, 0, 0], FAR = [0, -1, 0], LPULL = 0.62;

export const scenes = {
  // ------------------------------------------------------------------ hook: poster → the Earth turns (1 day = 8 s) under two bulges; count the high waters
  // chain: Earth turns → 서해 marker slides under a bulge → marker lights + count steps up + tone → (s03) the Moon's pull → near bulge → far bulge rim
  hook(stage, t, p, ctx) {
    checkSoundTable(ctx);
    const P = plan(ctx.tl), c = stage.ctx;
    const cam = camOf(CAM.home), spin = P.spin(t);
    const lastHigh = P.hookHighs.filter(x => x <= t).pop(), pulse = lastHigh ? Math.exp(-(t - lastHigh) / 0.5) : 0;
    const pA = 1 - smooth((t - P.MORPH[0]) / 1.2);
    const w = world(stage, {cam, t, spin, moon: 90, mark: fadeIn(t, P.seoul - 0.5, 0.4), markPulse: pulse,
      hiFar: fadeIn(t, P.far3 - 0.05, 0.25) * fadeOut(t, ctx.scene.end - 0.4, 0.3)});
    posterAccent(stage, cam, pA);
    if (w.mark) tag(stage, '서해', w.mark[0] + 26, w.mark[1] - 30, {size: 28, align: 'left', color: PAL.mark, a: fadeIn(t, P.seoul - 0.3, 0.4) * fadeOut(t, P.moon3 - 0.3, 0.4)});
    // the count of high waters in one day — the scene's one number, stepping up on each high-water frame
    const n = Math.min(2, P.hookHighs.filter(x => x <= t + 0.034).length);
    bigNum(stage, '하루에 밀물', `${n}`, '번', 960, 450, fadeIn(t, P.seoul, 0.3) * fadeOut(t, P.moon3 - 0.3, 0.4));
    // s03: the Moon's pull reaches the near side … and the far side bulges too
    const mA = fadeIn(t, P.moon3 - 0.2, 0.4);
    if (mA > 0 && w.moon) withAlpha(c, mA, () => {
      const top = P2(cam, [0, 1 + M.W0 + M.A * 0.67, 0]), mp = w.moon, dx = top[0] - mp[0], dy = top[1] - mp[1], dl = Math.hypot(dx, dy), g = easeOut((t - P.moon3 + 0.1) / 0.5);
      const a0 = [mp[0] + dx / dl * (mp[2] + 14), mp[1] + dy / dl * (mp[2] + 14)], a1 = [top[0] - dx / dl * 16, top[1] - dy / dl * 16];
      arrow(c, a0, [lerp(a0[0], a1[0], g), lerp(a0[1], a1[1], g)], PAL.pull, 5, {head: 22});
      tag(stage, '달의 당김', mp[0] + mp[2] + 20, mp[1] + 40, {size: 28, align: 'left', color: PAL.pull});
    });
    const fA = fadeIn(t, P.far3 - 0.05, 0.3) * fadeOut(t, ctx.scene.end - 0.4, 0.3);
    if (fA > 0) { const bot = P2(cam, [0, -(1 + M.W0 + M.A * 0.67), 0]); tag(stage, '반대쪽', bot[0] - 60, bot[1] + 24, {size: 30, color: PAL.waterHi, a: fA, align: 'right'}); }
  },

  // ------------------------------------------------------------------ origin: 潮汐 → Galileo's sloshing → Newton's uneven pull
  origin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start, at = r => ctx.tl.at(r);
    const camK = keyedCam([[s0, CAM.home], [P.gal - 0.2, CAM.home], [P.gal + 1.4, CAM.gal], [at('s06') - 0.4, CAM.gal], [at('s06') + 1.2, CAM.home], [ctx.scene.end, CAM.home]]);
    const cam = camOf(camK(t)), spin = P.spin(t);
    const galA = fadeIn(t, P.gal - 0.3, 0.8) * fadeOut(t, at('s06') - 0.5, 0.8);
    const slosh = galA > 0 ? [1, 0, 0.11 * galA * Math.sin((t - P.gal) * 2.6)] : null;
    const cardA = fadeIn(t, s0 + 0.2, 0.5) * fadeOut(t, at('s05') - 0.6, 0.5), moonA = 1 - Math.max(0.8 * galA, 0.97 * cardA), k = 1 - galA;
    const E0 = P2(cam, [0, 0, 0]);
    const sun = {a: galA, x: E0[0] - 560, y: E0[1] + 40, R: 380};
    const fieldA = fadeIn(t, P.grav - 0.2, 0.4) * fadeOut(t, ctx.scene.end - 0.5, 0.4);
    const w = world(stage, {cam, t, spin, moon: 90, k, slosh, moonA, sun, field: {a: fieldA, q: smooth((t - P.grav) / 1.6)}});
    // s04: the two glyphs — 潮 (morning high water) and 汐 (evening high water); each lights on its word
    if (cardA > 0) {
      const card = (x, g, read, on, col) => withAlpha(c, cardA * (0.35 + 0.65 * on), () => {
        rect(c, x - 120, 350, 240, 230, 16, rgba('#06222E', 0.88), rgba(col, 0.75), 2);
        stage.text(g, x, 445, {size: 120, weight: 700, color: PAL.ink, align: 'center'});
        stage.text(read, x, 545, {size: 30, weight: 700, color: col, align: 'center'});
      });
      card(380, '潮', '조 · 아침 밀물', onAt(t, P.jo, 0.3), PAL.waterHi);
      card(700, '汐', '석 · 저녁 밀물', onAt(t, P.seok, 0.3), PAL.waterHi);
    }
    // s05: Galileo — spin + orbit → sloshing; the Moon's pull struck out on "물리쳤습니다"
    if (galA > 0) withAlpha(c, galA, () => {
      const E = w.E, R = cam.Rpx * 1.5, ph = (spin * 0.6) % 360;
      const sp = []; for (let i = 0; i <= 40; i++) { const q = (ph + 200 + i * 6) * D2R; sp.push([E[0] + R * Math.cos(q), E[1] - R * 0.9 * Math.sin(q)]); }
      line(c, sp.slice(0, -2), rgba(PAL.ink, 0.8), 3); arrow(c, sp[sp.length - 4], sp[sp.length - 1], rgba(PAL.ink, 0.8), 3, {head: 16});
      const orb = []; for (let i = 0; i <= 50; i++) { const q = (-22 + i * 0.9) * D2R; orb.push([sun.x + 700 * Math.cos(q), sun.y - 40 - 700 * Math.sin(q)]); }
      line(c, orb, rgba(PAL.sun, 0.55), 2.2, {dash: [6, 8]}); arrow(c, orb[orb.length - 3], orb[orb.length - 1], rgba(PAL.sun, 0.8), 2.4, {head: 16});
      if (w.moon) { const x = w.moon[0] + w.moon[2] + 16, y = w.moon[1]; const ww = tag(stage, '달의 당김', x, y, {size: 28, align: 'left', color: PAL.pull, a: 0.9}); const q = smooth((t - P.reject + 0.034) / 0.4); if (q > 0) line(c, [[x - 4, y + 2], [x - 4 + (ww + 8) * q, y + 2]], rgba('#FF8A5C', 0.95), 4); }
    });
    // s06: Newton — the rings of the Moon's pull open outward (weaker with distance); near and far get different pulls
    const nA = fadeIn(t, P.place - 0.2, 0.3) * fadeOut(t, ctx.scene.end - 0.4, 0.4);
    if (nA > 0) {
      const g1 = easeOut((t - P.place + 0.1) / 0.45), g2 = easeOut((t - P.place - 0.35) / 0.45);
      pullArrow(stage, cam, NEAR, LPULL * (1 + M.bump) * g1, nA); pullArrow(stage, cam, FAR, LPULL * (1 - M.bump) * g2, nA);
      const near = P2(cam, NEAR), far = P2(cam, FAR);
      tag(stage, '세게', near[0] + 60, near[1] + 26, {size: 28, color: PAL.pull, a: nA * g1, align: 'left'});
      tag(stage, '약하게', far[0] + 60, far[1] + 26, {size: 28, color: PAL.pull, a: nA * g2, align: 'left'});
    }
  },

  // ------------------------------------------------------------------ essence: three pulls of different strength (Earth still; the tide set aside)
  // chain: the bulges relax (look at forces only) → rings of the pull open from the Moon → near arrow → centre arrow → far arrow; (s08) the chain runs again
  essence(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start, at = r => ctx.tl.at(r);
    const cam = camOf(CAM.home), spin = P.spin(t);
    const kk = 1 - smooth((t - s0 - 0.1) / 1.0);
    const w = world(stage, {cam, t, spin, moon: 90, k: kk, field: {a: fadeIn(t, P.far7 - 0.2, 0.3), q: smooth((t - P.far7 + 0.1) / 1.4)}});
    const s8 = at('s08');
    const grow = (t1, t2) => t < s8 - 0.05 ? easeOut((t - t1 + 0.034) / 0.4) : (t < t2 - 0.05 ? 1 - smooth((t - s8 + 0.05) / 0.25) : easeOut((t - t2 + 0.034) / 0.4));
    const pts = [[NEAR, 1 + M.bump, P.near7, P.near8, '가까운 쪽'], [CTR, 1, P.ctr7, P.near8 + 0.45, '지구 중심'], [FAR, 1 - M.bump, P.farP7, P.far8, '먼 쪽']];
    for (const [pt, kf, t1, t2, name] of pts) {
      const a = fadeIn(t, t1 - 0.1, 0.25); if (a <= 0) continue;
      pullArrow(stage, cam, pt, LPULL * kf * clamp(grow(t1, t2)), a);
      const p0 = P2(cam, pt); tag(stage, name, p0[0] + 34, p0[1] + 22, {size: 28, align: 'left', color: PAL.ink, a: a * fadeOut(t, s8 - 0.3, 0.3)});
    }
    void w;
  },

  // ------------------------------------------------------------------ stretch: subtract the common pull → near water out, far water left → two bulges; sideways push
  // chain: centre pull subtracted (ghosts of the old arrows stay) → near arrow toward the Moon, near water out → far arrow away, far water left → two bulges
  //        (ghost: the even shell "if the pull were the same everywhere") → 16 tidal arrows → 1/10,000,000 → sideways arrows → water dots gather
  stretch(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const cam = camOf(CAM.home), spin = P.spin(t);
    const kNear = easeInOut((t - P.out9 + 0.1) / 1.0), kFar = easeInOut((t - P.far10 + 0.1) / 1.2);
    const evenA = fadeIn(t, P.out9 - 0.2, 0.3) * fadeOut(t, P.name11 - 0.3, 0.4);
    const w = world(stage, {cam, t, spin, moon: 90, kNear, kFar, ghost: [{so: {moon: 90, k: 0}, a: evenA}]});
    const b = M.bump, sub_ = easeInOut((t - P.sub9 + 0.1) / 1.2), arrA = fadeOut(t, P.two10 + 0.4, 0.5);
    if (arrA > 0) {
      for (const [pt, kf] of [[NEAR, 1 + b], [CTR, 1], [FAR, 1 - b]]) {
        ghostArrow(stage, cam, add(pt, [0.16, 0, 0]), LPULL * kf, arrA * smooth((t - P.sub9) / 0.4));
        pullArrow(stage, cam, pt, LPULL * (kf - sub_), arrA);
        if (sub_ > 0 && sub_ < 1) withAlpha(c, 0.75 * Math.sin(sub_ * Math.PI) * arrA, () => arrowW(stage, cam, add(pt, [-0.16, 0, 0]), add(pt, [-0.16, -LPULL * sub_, 0]), rgba(PAL.ghost, 0.9), 3, 14));
      }
      const top = P2(cam, [0, 1 + LPULL * b, 0]), bot = P2(cam, [0, -1 - LPULL * b, 0]);
      tag(stage, '달 쪽으로', top[0] + 60, top[1], {size: 28, color: PAL.pull, align: 'left', a: arrA * onAt(t, P.out9, 0.3)});
      tag(stage, '뒤에 남음', bot[0] + 60, bot[1], {size: 28, color: PAL.pull, align: 'left', a: arrA * onAt(t, P.far10, 0.3)});
    }
    // the tidal-force pattern (s11): 16 arrows appear around from the near side to both flanks
    const fieldA = fadeIn(t, P.name11 - 0.2, 0.3) * fadeOut(t, P.side12 - 0.3, 0.5);
    if (fieldA > 0) withAlpha(c, fieldA, () => {
      const m = vdeg(90);
      for (let j = 0; j < 16; j++) {
        const ph = j / 16 * 360 + 11.25, dd = Math.min(Math.abs(((ph - 90) % 360 + 540) % 360 - 180), Math.abs(((ph - 270) % 360 + 540) % 360 - 180));
        const on = smooth((t - P.name11 - dd / 90 * 0.6 + 0.1) / 0.25); if (on <= 0) continue;
        const pv = vdeg(ph), F = sub(mul(m, 3 * dot(pv, m)), pv), base = mul(pv, 1 + M.W0 + M.A * 0.75);
        withAlpha(c, on, () => arrowW(stage, cam, base, add(base, mul(F, 0.24)), rgba(PAL.pull, 0.95), 4.2, 18));
      }
    });
    bigNum(stage, '지구 중력과 견주면', '1천만분의 1', '', 980, 450, onAt(t, P.num11) * fadeOut(t, P.side12 - 0.2, 0.4), {size: 92, col: PAL.pull});
    // s12: sideways (tractive) push and the water gathering (dΔ/dt = −k sin 2Δ), the chain repeated every 3.2 s
    const flA = fadeIn(t, P.side12 - 0.3, 0.4);
    if (flA > 0) withAlpha(c, flA, () => {
      const m = vdeg(90), rr = 1 + M.W0 + M.A * 0.3;
      for (let j = 0; j < 12; j++) {
        const ph = j / 12 * 360 + 15, d = ((ph - 90) % 180 + 180) % 180; if (d < 12 || d > 168 || Math.abs(d - 90) < 10) continue;
        const pv = vdeg(ph), F = sub(mul(m, 3 * dot(pv, m)), pv), tang = sub(F, mul(pv, dot(F, pv))), base = mul(pv, rr + 0.08);
        arrowW(stage, cam, base, add(base, mul(tang, 0.2)), rgba(PAL.pull, 0.95), 3.6, 16);
      }
      const age = (t - P.side12 + 0.3) % 3.2, kq = 0.55;
      for (let i = 0; i < 90; i++) {
        const d0 = (rand(i * 4.7) * 2 - 1) * 88, sgn = rand(i * 9.1) < 0.5 ? 0 : 180;
        const tn = Math.tan(d0 * D2R) * Math.exp(-2 * kq * age), dd = Math.atan(tn) / D2R, ph = 90 + sgn + dd;
        const pos = mul(vdeg(ph), 1 + M.W0 * 0.6 + 0.02 * rand(i)), s = P2(cam, pos);
        if (cam.hidden(pos)) continue;
        const al = Math.min(1, age / 0.4) * (1 - smooth((age - 2.7) / 0.5));
        circle(c, s[0], s[1], 5, rgba('#0A2A3C', 0.6 * al)); circle(c, s[0], s[1], 3.8, rgba('#E2F6FD', 0.95 * al));   // matte water dot with a dark edge
      }
    });
    void w; void s0;
  },

  // ------------------------------------------------------------------ rotate: the Earth turns under the two bulges (1 day = 5 s); one clock for marker, graph, tone
  // chain: Earth turns → marker slides under bulge 1 → marker lights, graph peak, tone (same frame) → trough → bulge 2 → …; (s14) the Moon moves on → ghost of its old place → 12 h 25 min
  rotate(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, CAM.home], [s0 + 1.4, CAM.rot], [ctx.scene.end, CAM.rot]]);
    const cam = camOf(camK(t)), spin = P.spin(t), moon = P.moon(t);
    const lastHigh = P.rotHighs.filter(x => x <= t).pop(), pulse = lastHigh ? Math.exp(-(t - lastHigh) / 0.45) : 0;
    const w = world(stage, {cam, t, spin, moon, mark: fadeIn(t, s0 + 0.6, 0.5), markPulse: pulse, orbitA: fadeIn(t, P.moon14 - 0.3, 0.5)});
    if (w.mark) tag(stage, '서해', w.mark[0] + 24, w.mark[1] - 28, {size: 28, align: 'left', color: PAL.mark, a: fadeIn(t, s0 + 0.8, 0.4) * fadeOut(t, s0 + 4.5, 0.5)});
    // s14: the Moon has moved on — its old place stays as a ghost, the path between is drawn
    const mvA = fadeIn(t, P.moon14 - 0.3, 0.4);
    if (mvA > 0) {
      const m0 = P.moon(P.rotHighs[0] ?? s0);
      ghostMoon(stage, cam, m0, mvA);
      withAlpha(c, mvA, () => { const pts = []; for (let a = m0; a <= moon; a += 0.5) pts.push(P2(cam, mul(vdeg(a), M.DM))); if (pts.length > 1) line(c, pts, rgba(PAL.moon, 0.75), 3); });
    }
    // tide gauge (equilibrium height at the marker vs simulated hours), on the same clock as the marker; a dashed tie marker → cursor
    const gA = fadeIn(t, s0 + 0.9, 0.5) * fadeOut(t, ctx.scene.end - 0.35, 0.3);
    if (gA > 0) withAlpha(c, gA, () => {
      const x0 = 150, x1 = 930, y0 = 1222, hh = 60, hours = 50, X = hr => x0 + (x1 - x0) * hr / hours;
      rect(c, x0 - 30, y0 - hh - 46, x1 - x0 + 60, 2 * hh + 92, 12, rgba('#03141C', 0.62));
      line(c, [[x0, y0], [x1, y0]], rgba(PAL.muted, 0.5), 1.4);
      for (let h = 0; h <= hours; h += 12) line(c, [[X(h), y0 + hh + 4], [X(h), y0 + hh + 14]], rgba(PAL.muted, 0.8), 1.6);
      tag(stage, '서해의 물높이', x0 + 70, y0 - hh - 66, {size: 26, color: PAL.mark});
      const tStart = s0 + 0.9, pts = [];
      for (let tt = tStart; tt <= t; tt += 1 / 60) { const hr = P.rotHours(tt); if (hr > hours) break; pts.push([X(Math.max(0, hr)), y0 - P.markH(tt) / 0.62 * hh * 1.4]); }
      if (pts.length > 1) {
        const fill = [[pts[0][0], y0 + hh], ...pts, [pts[pts.length - 1][0], y0 + hh]];
        const g = c.createLinearGradient(0, y0 - hh, 0, y0 + hh); g.addColorStop(0, rgba(PAL.wMid, 0.85)); g.addColorStop(1, rgba(PAL.wDark, 0.5)); poly(c, fill, g);
        line(c, pts, PAL.rim, 2.6);
        const lp = pts[pts.length - 1]; circle(c, lp[0], lp[1], 6, '#FFFFFF');
        if (w.mark && P.rotHours(t) <= hours) line(c, [w.mark, lp], rgba(PAL.mark, 0.38), 1.6, {dash: [3, 7]});
      }
      P.rotHighs.forEach((th, i) => { if (th > t || i > 3) return; const hr = P.rotHours(th); if (hr > hours) return; tag(stage, '밀물', X(hr), y0 - hh - 16, {size: 24, color: PAL.waterHi, plate: false, a: onAt(t, th, 0.2)}); });
      const bA = onAt(t, P.num14, 0.3);
      if (bA > 0 && P.rotHighs.length >= 2) withAlpha(c, bA, () => {
        const a = X(P.rotHours(P.rotHighs[0])), b2 = X(P.rotHours(P.rotHighs[1])), y = y0 + hh + 30;
        line(c, [[a, y - 10], [a, y], [b2, y], [b2, y - 10]], PAL.ink, 2.4);
      });
    });
    bigNum(stage, '밀물에서 다음 밀물까지', '12시간 25분', '', 980, 450, onAt(t, P.num14) * fadeOut(t, ctx.scene.end - 0.35, 0.3), {size: 88});
  },

  // ------------------------------------------------------------------ sun: the Sun's smaller stretch; spring and neap — the one condition changed is the Moon's place
  // chain: Sun appears → 2,700만 배 → 390배 → 46 % → its own (smaller) stretch joins → Moon to the Sun line: bulges add, bar grows (사리)
  //        → "약 7일 뒤" Moon to the side: bulges cross, bar shrinks (조금), the spring shell stays as a ghost
  sun(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, CAM.rot], [s0 + 1.6, CAM.sun], [ctx.scene.end, CAM.sun]]);
    const cam = camOf(camK(t)), spin = P.spin(t), moon = P.moon(t);
    const sunA = fadeIn(t, P.sun15 - 0.3, 0.9), ks = fadeIn(t, P.half15 - 0.1, 0.8);
    const E0 = P2(cam, [0, 0, 0]);
    const A2 = lerp(M.A, 0.32, smooth((t - s0) / 1.6));
    const springA = fadeIn(t, P.half17 - 0.1, 0.3);
    const w = world(stage, {cam, t, spin, moon, ks, A: A2, sun: {a: sunA, x: E0[0] - 640, y: E0[1] + 10, R: 360}, orbitA: fadeIn(t, s0 + 1, 0.6), moonScale: 1.3,
      ghost: [{so: {moon: 180, k: 1, ks: 1, A: A2}, a: springA}]});
    // the Sun's own stretch (amber dashed) — introduced with the 46 %
    const insA = fadeIn(t, P.half15 - 0.1, 0.4) * fadeOut(t, P.full16 - 0.3, 0.4);
    if (insA > 0) withAlpha(c, insA, () => line(c, equatorRing(cam, {moon, k: 0, ks: 1, A: A2}), rgba(PAL.pull, 0.95), 2.6, {dash: [7, 6]}));
    // the two ingredients by the Sun, then the one number
    const tA = fadeOut(t, P.full16 - 0.5, 0.4);
    tag(stage, '질량 2,700만 배', 40, E0[1] - 230, {size: 28, color: PAL.sun, align: 'left', a: tA * onAt(t, P.mass15, 0.25)});
    tag(stage, '거리 390배', 40, E0[1] - 180, {size: 28, color: PAL.sun, align: 'left', a: tA * onAt(t, P.dist15, 0.25)});
    bigNum(stage, '태양의 당김은 달의', '46', '%', 980, 450, onAt(t, P.half15) * fadeOut(t, P.full16 - 0.5, 0.4), {col: PAL.pull, ucol: PAL.pull});
    // range bar (물높이 차) on the same clock as the Moon's angle; the spring value stays as a ghost tick
    const d = (moon - 180) * D2R, range = Math.hypot(1 + M.sunK * Math.cos(2 * d) * ks, M.sunK * Math.sin(2 * d) * ks);
    const mA = fadeIn(t, P.full16 - 0.2, 0.4);
    if (mA > 0) withAlpha(c, mA, () => {
      const x0 = 210, x1 = 870, y = 420, X = v => x0 + (x1 - x0) * v / 1.6;
      rect(c, 120, 340, 840, 150, 12, rgba('#03141C', 0.7));
      stage.text('물높이 차', 150, 376, {size: 26, weight: 700, color: PAL.muted});
      rect(c, x0, y - 14, x1 - x0, 28, 14, rgba('#0D2C3A', 1));
      const g = c.createLinearGradient(x0, 0, X(range), 0); g.addColorStop(0, PAL.wDark); g.addColorStop(1, PAL.wLit); rect(c, x0, y - 14, Math.max(10, X(range) - x0), 28, 14, g);
      for (const [v, s] of [[1 + M.sunK, '사리'], [1 - M.sunK, '조금']]) { line(c, [[X(v), y - 24], [X(v), y + 24]], rgba(PAL.ink, 0.8), 2); stage.text(s, X(v), y + 46, {size: 28, weight: 700, color: PAL.ink, align: 'center'}); }
      if (springA > 0) withAlpha(c, springA, () => rect(c, x0, y - 14, X(1 + M.sunK) - x0, 28, 14, null, rgba(PAL.ghost, 0.6), 2));
    });
    // the Moon's places: full Moon (ghost, opposite the Sun) and new Moon on the Sun line; then a quarter Moon "약 7일 뒤"
    const lineA = fadeIn(t, P.full16 - 0.1, 0.3) * fadeOut(t, P.half17 - 0.3, 0.4);
    if (lineA > 0) {
      const mf = ghostMoon(stage, cam, 0, lineA, 1.3);
      if (mf) { tag(stage, '보름달', mf[0], mf[1] - mf[2] - 30, {size: 28, color: PAL.moon, a: lineA * onAt(t, P.full16, 0.3)}); withAlpha(c, lineA, () => line(c, [[E0[0] - 640, E0[1]], [mf[0] + 60, mf[1]]], rgba(PAL.pull, 0.32), 2, {dash: [10, 8]})); }
      if (w.moon) tag(stage, '그믐달', w.moon[0], w.moon[1] - w.moon[2] - 34, {size: 28, color: PAL.moon, a: lineA * onAt(t, P.new16, 0.3)});
    }
    const wkA = fadeIn(t, P.half17 - 0.2, 0.25) * fadeOut(t, P.cross17 + 0.5, 0.3);
    if (wkA > 0 && w.moon) tag(stage, '약 7일 뒤', w.moon[0] + w.moon[2] + 20, w.moon[1] - 10, {size: 28, color: PAL.ink, align: 'left', a: wkA});
    const qA = fadeIn(t, P.cross17 + 0.5, 0.3);
    if (qA > 0 && w.moon) tag(stage, '반달', w.moon[0] + w.moon[2] + 16, w.moon[1], {size: 28, color: PAL.moon, align: 'left', a: qA});
  },

  // ------------------------------------------------------------------ westsea: zoom into the marker (structure) → the coast cross-section with metre scales
  westsea(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const zq = easeInOut((t - s0) / 1.1);
    if (zq < 1) {
      const la = M.korea[0] * D2R, a = (M.korea[1] + P.spin(t)) * D2R, mk = [Math.cos(la) * Math.cos(a), Math.cos(la) * Math.sin(a), 0];
      const azT = ((P.markAng(s0) + 90) % 360 + 540) % 360 - 180;          // face the marker
      const cam = camOf({cx: lerp(CAM.sun.cx, 540, zq), cy: lerp(CAM.sun.cy, 900, zq), R: lerp(CAM.sun.R, 1400, zq * zq), e: CAM.sun.e, az: lerp(CAM.sun.az, azT, smooth(zq / 0.6)), tx: mk[0] * zq, ty: mk[1] * zq});
      withAlpha(c, 1 - smooth((zq - 0.6) / 0.4), () => world(stage, {cam, t, spin: P.spin(t), moon: P.moon(t), ks: 1, A: 0.32, mark: 1}));
    }
    withAlpha(c, smooth((t - s0 - 0.7) / 0.5), () => coast(stage, t, P, ctx));
  },

  // ------------------------------------------------------------------ myth: one condition at a time — spin fast (bulges stay on their ghost), then move the Moon (bulges follow)
  myth(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, CAM.home], [P.two22 - 0.6, CAM.home], [P.two22 + 0.4, CAM.myth], [ctx.scene.end, CAM.myth]]);
    const cam = camOf(camK(t)), spin = P.spin(t), moon = P.moon(t);
    const gA = fadeIn(t, P.spin21 - 0.3, 0.3);
    const w = world(stage, {cam, t, spin, moon, orbitA: fadeIn(t, P.two22 - 0.4, 0.5), ghost: [{so: {moon: 90, k: 1}, a: gA}]});
    const spA = fadeIn(t, P.spin21 - 0.3, 0.3) * fadeOut(t, P.two22 + 0.2, 0.5);
    if (spA > 0) withAlpha(c, spA, () => {
      const E = w.E, R = cam.Rpx * 1.48, ph = (spin * 0.5) % 360, sp = [];
      for (let i = 0; i <= 50; i++) { const q = (ph + i * 4.8) * D2R; sp.push([E[0] + R * Math.cos(q), E[1] - R * 0.93 * Math.sin(q)]); }
      line(c, sp.slice(0, -2), rgba(PAL.ink, 0.85), 3.4); arrow(c, sp[sp.length - 4], sp[sp.length - 1], rgba(PAL.ink, 0.85), 3.4, {head: 18});
    });
    const fA = fadeIn(t, P.two22 - 0.2, 0.3);
    if (fA > 0) {
      ghostMoon(stage, cam, 90, fA);
      withAlpha(c, fA, () => { const pts = []; for (let a = 90; a <= moon; a += 1) pts.push(P2(cam, mul(vdeg(a), M.DM))); if (pts.length > 1) line(c, pts, rgba(PAL.moon, 0.75), 3); });
    }
    dip(c, t, s0, 0.4);
  },

  // ------------------------------------------------------------------ close: the three pulls once more, then the poster world returns
  close(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, CAM.home], [P.end, CAM.home]]);
    const cam = camOf(camK(t));
    const pA = smooth((t - P.poster) / 0.9);
    world(stage, {cam, t, spin: P.spin(t), moon: 90});
    posterAccent(stage, cam, pA);
    const qA = fadeIn(t, s0 + 0.4, 0.5) * fadeOut(t, P.poster - 0.5, 0.4);
    if (qA > 0) {
      const g = k => easeOut((t - s0 - 0.5 - k * 0.35) / 0.4);
      [[NEAR, 1 + M.bump], [CTR, 1], [FAR, 1 - M.bump]].forEach(([pt, kf], k) => pullArrow(stage, cam, pt, LPULL * kf * clamp(g(k)), qA));
      withAlpha(c, qA, () => stage.text('“가까운 쪽은 더 세게, 먼 쪽은 더 약하게”', 540, 372, {role: 'display', size: 42, weight: 700, color: PAL.ink, align: 'center', maxWidth: 900, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16}));
    }
    dip(c, t, s0, 0.4);
  },
};

// ------------------------------------------------------------------ the coast cross-section (westsea)
const CX0 = 60, CX1 = 1020, MSL = 860, GAUGE_X = 600;
const floorY = x => {          // seafloor (display): deep sea → shelf → mudflat → embankment
  const u = (x - CX0) / (CX1 - CX0);
  if (u < 0.5) return 1300 - 325 * smooth(u / 0.5) - 14 * Math.sin(u * 23) * (1 - u / 0.5);
  if (u < 0.97) return 975 - 215 * ((u - 0.5) / 0.47) ** 1.1 + 3 * Math.sin(u * 140);
  return 760 - 60 * smooth((u - 0.97) / 0.03);
};
function coast(stage, t, P, ctx) {
  const c = stage.ctx, X01 = x => (x - CX0) / (CX1 - CX0), k = M.pxPerM;
  // sky band (dark) is the background; land/seafloor body (warm)
  const surf = x => MSL - P.eta(X01(x), t) * k;
  // water body: from the surface down to the floor wherever the surface is above the floor
  const top = [], xs = []; let edge = CX1;
  for (let x = CX0 - 20; x <= CX1; x += 4) { const ys = surf(x), yf = floorY(x); if (ys >= yf - 1) { edge = x; break; } top.push([x, ys]); xs.push(x); }
  const bottom = []; for (let i = xs.length - 1; i >= 0; i--) bottom.push([xs[i], floorY(xs[i]) + 2]);
  const wg = c.createLinearGradient(0, 760, 0, 1300); wg.addColorStop(0, rgba('#3FB2EA', 0.95)); wg.addColorStop(0.35, rgba('#1A6FA6', 0.95)); wg.addColorStop(1, rgba('#06243A', 0.98));
  poly(c, [...top, [edge, floorY(edge)], ...bottom], wg);
  // floor body
  const fl = []; for (let x = CX0 - 20; x <= CX1 + 40; x += 4) fl.push([x, floorY(Math.min(x, CX1))]);
  const lg = c.createLinearGradient(0, 820, 0, 1330); lg.addColorStop(0, PAL.mud2); lg.addColorStop(0.25, PAL.mud); lg.addColorStop(1, rgba('#1A140E', 1));
  poly(c, [...fl, [CX1 + 40, 1340], [CX0 - 20, 1340]], lg);
  // wet sheen on the exposed mudflat (where water left recently)
  for (let x = edge; x < CX0 + 0.95 * (CX1 - CX0); x += 6) { const y = floorY(x); line(c, [[x, y + 1], [x + 4, y + 1]], rgba('#E9D2A8', 0.35 + 0.25 * Math.sin(x * 0.3)), 2); }   // still sheen (no decorative motion)
  // surface line with glow and small wave texture
  line(c, top, rgba(PAL.rim, 0.85), 2.4);          // the water surface: a rim on a matte mass, no glow, no ripple
  // mean sea level (dashed)
  line(c, [[CX0, MSL], [CX1 - 30, MSL]], rgba(PAL.muted, 0.45), 1.4, {dash: [6, 8]});
  stage.text('평균 해수면', CX0 + 6, MSL - 18, {size: 24, weight: 500, color: PAL.muted});
  // gauges
  const gauge = (x, ref, label, rangeLabel, on, col) => {
    const yf = floorY(x), ys = surf(x), yTop = MSL - 5 * k - 10, yBot = Math.min(yf, MSL + 5 * k + 10);
    withAlpha(c, on, () => {
      line(c, [[x, yTop], [x, yBot]], rgba(PAL.ink, 0.85), 3);
      for (let m = -4; m <= 4; m++) { const y = MSL - m * k; if (y < yBot) line(c, [[x - (m % 2 ? 6 : 12), y], [x + (m % 2 ? 6 : 12), y]], rgba(PAL.ink, 0.75), 2); }
      // the range band swept by the water this cycle
      const a = ref * k; rect(c, x + 16, MSL - a, 14, 2 * a, 4, rgba(col, 0.45)); line(c, [[x + 14, MSL - a], [x + 32, MSL - a]], col, 2.4); line(c, [[x + 14, MSL + a], [x + 32, MSL + a]], col, 2.4);
      circle(c, x, Math.min(ys, yf), 8, rgba('#03141C', 0.8)); circle(c, x, Math.min(ys, yf), 6, '#FFFFFF');
      tag(stage, label, x, yTop - 64, {size: 30, color: PAL.ink});
      tag(stage, rangeLabel, x, yTop - 22, {size: 30, color: col});
    });
  };
  const leftOn = fadeIn(t, P.ocean18 - 0.2, 0.5), rightOn = fadeIn(t, P.inch19 - 0.2, 0.5);
  gauge(220, 0.5, '넓은 바다', '약 1 m', leftOn, PAL.waterHi);
  gauge(GAUGE_X, 4.5, '인천 앞바다', '사리 때 약 9 m', rightOn, PAL.waterHi);
  // ghost: the open sea's 1 m band copied beside the Incheon scale — old value and new value on one ruler
  const gh = fadeIn(t, P.inch19 + 0.2, 0.4);
  if (gh > 0) withAlpha(c, gh, () => { const a = 0.5 * k, xg = GAUGE_X - 34; rect(c, xg, MSL - a, 14, 2 * a, 4, rgba(PAL.ghost, 0.08)); line(c, [[xg, MSL - a], [xg + 14, MSL - a], [xg + 14, MSL + a], [xg, MSL + a], [xg, MSL - a]], rgba(PAL.ghost, 0.7), 2, {dash: [4, 4]}); });
  // big number
  bigNum(stage, '', '9', 'm', 960, 470, onAt(t, P.nine19) * fadeOut(t, ctx.tl.at('s20') - 0.3, 0.4), {size: 150});
  // mudflat label when exposed
  if (edge < 820 && rightOn > 0) tag(stage, '갯벌', (Math.max(edge, 640) + 990) / 2, floorY((Math.max(edge, 640) + 990) / 2) + 50, {size: 28, color: '#F1D9AE', a: rightOn * smooth((800 - edge) / 60)});
  // s20: the tidal wave runs in from the open sea, its crest growing over the shallow shelf
  const wA = fadeIn(t, P.shallow20 - 0.2, 0.5);
  if (wA > 0) withAlpha(c, wA, () => {
    // crest: the x where the phase hits 0 (moving right)
    const per = M.tideFilm, cyc = ((t - P.coastT0) / per) % 1;
    let best = null;
    for (let x = CX0; x < edge - 4; x += 3) {
      const u = X01(x), ph = TAU * (t - P.coastT0) / per - 1.3 * u ** 1.3 - 0.4, near = Math.cos(ph);
      if (near > 0.97 && (!best || near > best[1])) best = [x, near];
    }
    if (best) { const ys = surf(best[0]); glow(c, best[0], ys, 24, PAL.waterHi, 0.45); circle(c, best[0], ys, 6, '#FFFFFF'); }   // the crest carries the tide's energy: a small light
    void cyc;
    line(c, [[160, 556], [520, 556]], rgba(PAL.waterHi, 0.9), 3); arrow(c, [460, 556], [560, 556], PAL.waterHi, 3, {head: 18});
    tag(stage, '조석의 물결', 340, 516, {size: 30, color: PAL.waterHi});
    withAlpha(c, fadeIn(t, P.bay20 - 0.2, 0.4), () => arrow(c, [820, 600], [940, floorY(940) - 30], rgba(PAL.rim, 0.85), 3, {head: 16}));
  });
  // distance note
  tag(stage, '바다 쪽', 120, 1300, {size: 24, color: PAL.muted, plate: false, align: 'left'});
  tag(stage, '육지 쪽', 960, 1300, {size: 24, color: PAL.muted, plate: false, align: 'right'});
}

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const tones = (id, times, f, gain, means, o = {}) => { if (!times.length) return; const T = [...times].sort((a, b) => a - b); ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((tt, k) => ({kind: 'tone', offset: r(tt - T[0], 4), params: {freq: Array.isArray(f) ? f[k] : f, dur: o.dur ?? 0.5, harmonics: [1, 0.25], attack: 0.03, decay: 0.15, sustain: 0.4, release: 0.3, gain_db: Array.isArray(o.g) ? o.g[k] : 0}}))}, means}); };
  const hum = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * smooth((tt - t0) / 0.4) * (1 - smooth((tt - (t1 - 0.5)) / 0.5))), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 35, high: o.high ?? 140, fade: 0.05, points: Q}, means}); };
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const sc = id => tl.scene(id);
  // ---- hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 두 부풂이 있는 지구와 달', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  tones('hook_high', P.hookHighs, 147, -36, '서해 표시점이 부풂을 지날 때(밀물) 낮은 음 (같은 자전 모형)');
  tick('moon_pull', P.moon3, 131, -34, '"달인데": 달의 당김 화살표', {decay: 0.14});
  swell('far_bulge', P.far3, [110, 165], '"반대쪽": 반대쪽 부풂이 빛남', {dur: 1.4, gain: -35});
  // ---- origin
  tick('jo', P.jo, 147, -35, '潮 카드', {decay: 0.12}); tick('seok', P.seok, 131, -35, '汐 카드', {decay: 0.12});
  hum('slosh', P.gal - 0.2, tl.at('s06') - 0.4, tt => 0.35 + 0.35 * Math.abs(Math.sin((tt - P.gal) * 2.6)), -38, '갈릴레이의 생각: 출렁이는 물(설명용 낮은 잡음, 출렁임과 같은 박자)', {low: 50, high: 180});
  tick('reject', P.reject, 98, -34, '"물리쳤습니다": 달의 당김에 줄', {decay: 0.16});
  tick('newton', P.newton, 165, -35, '1687 뉴턴', {decay: 0.12});
  swell('field', P.grav - 0.1, [98, 131], '달의 당김 고리가 바깥으로 열림(멀수록 약함)', {dur: 1.8, gain: -36});
  // ---- essence: pull strength → pitch (stronger = higher)
  tick('pull_near', P.near7, 196, -33, '가까운 쪽 당김(가장 셈)', {decay: 0.18});
  tick('pull_ctr', P.ctr7, 147, -33, '지구 중심 당김', {decay: 0.18});
  tick('pull_far', P.farP7, 110, -33, '먼 쪽 당김(가장 약함)', {decay: 0.18});
  tick('pull_near2', P.near8, 196, -35, '사슬을 한 번 더: 가까운 쪽 당김', {decay: 0.16});
  tick('pull_ctr2', P.near8 + 0.45, 147, -35, '사슬을 한 번 더: 지구 중심 당김', {decay: 0.16});
  tick('pull_far2', P.far8, 110, -35, '사슬을 한 번 더: 먼 쪽 당김', {decay: 0.16});
  // ---- stretch
  whoosh('subtract', P.sub9 - 0.1, 1.4, 200, 90, '지구 전체가 받는 당김을 뺌', -36);
  tick('near_out', P.out9, 165, -35, '가까운 쪽 물이 달 쪽으로 끌려 나옴(가까운 부풂이 자람)', {decay: 0.16});
  swell('bulges', P.far10 + 0.1, [110, 165, 220], '먼 쪽 물이 뒤에 남아 둘째 부풂이 자람', {dur: 2.0, gain: -34});
  tick('tidal_name', P.name11, 131, -35, '"기조력"', {decay: 0.12});
  tick('tiny', P.num11, 196, -34, '1천만분의 1', {decay: 0.16});
  hum('flow', P.side12 - 0.2, sc('stretch').end - 0.2, () => 0.55, -38, '옆으로 미는 힘에 물이 두 곳으로 모임(낮은 흐름 잡음)', {low: 60, high: 220});
  // ---- rotate: one tone per high tide at the marker; a softer, lower one per low tide
  tones('rot_high', P.rotHighs, 165, -33, '서해 표시점의 밀물(부풂 아래를 지남): 그래프 봉우리와 같은 시각');
  tones('rot_low', P.rotLows, 98, -40, '썰물(두 부풂 사이): 낮고 작은 음', {dur: 0.4});
  tick('period', P.num14, 131, -34, '"12시간 25분"', {decay: 0.14});
  // ---- sun
  swell('sun_in', P.sun15 - 0.2, [82, 123], '태양이 나타남', {dur: 2.0, gain: -35});
  tick('mass', P.mass15, 110, -35, '질량 2,700만 배', {decay: 0.12}); tick('dist', P.dist15, 131, -35, '거리 390배', {decay: 0.12}); tick('pct46', P.half15, 165, -34, '달의 46%', {decay: 0.14});
  { const s = sc('sun'); chirp('range', P.full16 - 0.4, s.end - 0.3, tt => { const d = (P.moon(tt) - 180) * D2R; return 110 + 60 * (Math.hypot(1 + M.sunK * Math.cos(2 * d), M.sunK * Math.sin(2 * d)) - 0.54) / 0.92; }, tt => { const d = (P.moon(tt) - 180) * D2R; return 0.12 + 0.3 * (Math.hypot(1 + M.sunK * Math.cos(2 * d), M.sunK * Math.sin(2 * d)) - 0.54) / 0.92; }, -36, '물높이 차(막대)를 음높이·크기로: 사리에서 높고 크게, 조금에서 낮고 작게'); }
  swell('spring', P.spring16 - 0.05, [110, 165, 220], '사리: 두 힘이 한 줄', {dur: 1.6, gain: -33});
  whoosh('week', P.half17 - 0.2, 1.0, 140, 80, '"약 7일 뒤": 달이 옆자리로 옮겨 감', -38);
  tick('neap', P.neap17, 98, -34, '조금: 두 힘이 엇갈림', {decay: 0.2});
  // ---- westsea
  whoosh('dive', sc('westsea').start, 1.1, 200, 80, '서해로 확대해 들어감', -36);
  { const ws = sc('westsea'); hum('water', ws.start + 0.7, ws.end - 0.1, tt => 0.15 + 0.75 * Math.abs(Math.sin(TAU * (tt - P.coastT0) / M.tideFilm - 1.3 * 0.9 ** 1.3 - 0.4)), -37, '갯벌의 물 흐름: 물높이가 빨리 바뀔 때 커지는 낮은 잡음(같은 조석 모형)', {low: 50, high: 200}); }
  tick('one_m', P.one18, 131, -35, '"1미터"', {decay: 0.14});
  tick('nine_m', P.nine19, 196, -33, '"9미터"', {decay: 0.2});
  tones('coast_high', P.coastHighs, 131, -38, '인천 쪽 만조(물이 가장 높을 때)', {dur: 0.6});
  // ---- myth
  whoosh('spin_fast', P.spin21 - 0.2, 1.2, 90, 220, '지구를 빠르게 돌림: 부풂은 그대로', -36);
  chirp('moon_move', P.two22 - 0.1, P.follow22 + 1.2, tt => 110 + 0.4 * (P.moon(tt) - 90), () => 0.3, -37, '달이 옮겨 가며 부풂이 따라감(달의 각도 → 음높이)');
  // ---- close
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
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
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
    notes: '설명용 합성음입니다(녹음 아님). 기조력·조석은 소리를 내지 않으므로 모든 소리는 화면 사건의 표시음입니다. 배경음악·배경음 없음. 모든 사건은 `node episodes/tides/scenes.mjs --emit-sound`가 scenes.mjs 머리의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 서해 표시점이 부풂 아래를 지남(밀물) → 낮은 음, 두 부풂 사이(썰물) → 더 낮고 작은 음, 당김의 세기 → 음높이(셀수록 높게), 물높이 차(사리↔조금) → 음높이·크기, 갯벌의 물 흐름 → 물높이가 빨리 바뀔 때 커지는 낮은 잡음. 모든 기본음 700 Hz 아래. 패닝 없음(모노 안전). 타임라인이 바뀌면 다시 실행하세요.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; poster ${P.poster.toFixed(2)} s; hook highs ${P.hookHighs.map(x => x.toFixed(2)).join(', ')}; rot highs ${P.rotHighs.map(x => x.toFixed(2)).join(', ')}; coast highs ${P.coastHighs.length}; K_sun ${M.sunK.toFixed(3)}`);
}
