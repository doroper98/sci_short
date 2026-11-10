// Episode scenes — "밀물과 썰물이 생기는 이유" (28)
// Shape: export {theme, scenes, overlays, background, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Visual direction (series diagram style; docs/ANIMATION_QUALITY.md, and the 07·05·11·12 benchmark): ONE moving stage —
// the Earth–Moon system seen from above the north pole, slightly oblique — with a FILLED, lit hero object: the ray-traced
// Earth (pipeline/render/globe.mjs drawEarthLit) wrapped in a glowing cyan water shell whose two bulges are the subject.
// Warm/cool pair: the Moon's pull and the Sun are amber, water is cyan. Thin lines only for arrows, orbits, graphs.
// Eight of nine scenes are this one world, moved by a camera; the coast scene is a filled cross-section (water mass over a
// warm mudflat). Nothing of the notes below is printed on screen as a footnote.
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
  moonPerDay: 13.18,                             // ° per sidereal day
  tideFilm: 6,                                   // coast scene: one tidal cycle = 6 s of film
  pxPerM: 26,
  korea: [37.5, 126.6],
  bump: 0.45,                                    // essence: ± pull difference (exaggerated)
};
M.sunK = M.massRatio / M.distRatio ** 3;         // ≈ 0.460
const S_TIDE = [-1, 0, 0];                       // Sun direction for the tide (in plane)
const S_LIGHT = unit([-0.86, -0.28, 0.42]);      // light on the Earth/Moon: the Sun from screen-left, a little above the plane
const PAL = {ink: '#EFE3D4', muted: '#8AA0A6', water: '#5CC8F5', waterHi: '#B9ECFF', deep: '#0B4A72', pull: '#FFB547', sun: '#FFD27A',
  moon: '#D8DBE1', mark: '#FFE2C4', mud: '#5B4936', mud2: '#8A6E4E', land: '#3A3326', grid: '#2B4A57'};

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
  const rot = S('rotate'), myth = S('myth');
  const rate = t => {
    let r = 10;
    if (t > P.seoul - 0.4 && t < S('hook').end) r = lerp(10, 30, smooth((t - P.seoul + 0.4) / 0.8)) * (1 - smooth((t - S('hook').end + 0.8) / 0.8)) + 10 * smooth((t - S('hook').end + 0.8) / 0.8);
    if (t >= rot.start && t < rot.end) r = lerp(10, 360 / M.dayFilm, smooth((t - rot.start - 0.2) / 0.9) * (1 - smooth((t - rot.end + 0.9) / 0.8)));
    if (t >= myth.start && t < myth.end) r = lerp(10, 110, smooth((t - P.spin21 + 0.3) / 0.7) * (1 - smooth((t - P.two22 - 0.4) / 0.9)));
    return r;
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
  const sunMoon = keyed([[sunS.start, mAfter], [P.mass15, 112, 'io'], [P.full16 - 0.2, 150, 'lin'], [P.new16 + 0.1, 180, 'o'], [P.half17 - 0.2, 180, 'lin'], [P.cross17 + 0.4, 270, 'io'], [sunS.end, 278, 'lin']]);
  const mythMoon = keyed([[myth.start, 90], [P.two22 - 0.1, 90, 'lin'], [P.follow22 + 1.2, 215, 'io']]);
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
  P.coastT0 = ws.start;
  P.eta = (x01, t) => {     // x01: 0 open sea … 1 shore; metres
    const a = 0.5 + 4.0 * smooth(clamp((x01 - 0.15) / 0.45)), ph = 1.3 * x01 ** 1.3;
    return a * Math.cos(TAU * (t - P.coastT0) / M.tideFilm - ph - 0.4);
  };
  P.coastHighs = []; { let prev = null; for (let t = ws.start + 0.5; t < ws.end - 0.3; t += 0.004) { const v = P.eta(0.9, t); if (prev !== null && prev.v1 > prev.v0 && v < prev.v1) P.coastHighs.push(t - 0.004); prev = {v0: prev ? prev.v1 : v, v1: v}; } }
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
/** water-shell radius at unit direction p */
function shellR(p, o) {
  const m = vdeg(o.moon);
  let h = o.k * (dot(p, m) ** 2 - 1 / 3) + (o.ks || 0) * M.sunK * (dot(p, S_TIDE) ** 2 - 1 / 3);
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
    glow(c, x, y, r * 2.4, '#DCE6F2', 0.10);
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#ECEEF1'); g.addColorStop(1, '#9CA2AA'); circle(c, x, y, r, g);
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.32, -0.32, 0.1], [-0.12, 0.42, 0.13], [0.05, -0.05, 0.08]]) circle(c, x + dx * r, y + dy * r, rr * r, rgba('#7F858E', 0.38));
    const sv = [dot(S_LIGHT, cam.r), dot(S_LIGHT, cam.u), -dot(S_LIGHT, cam.f)];
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); nightShade(c, {cx: x, cy: y, R: r}, sv, 0.86, '#03080C'); c.restore();
  });
  return [x, y, r];
}
function sunGlow(stage, x, y, R, a) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, rgba('#FFF4DA', 1)); g.addColorStop(0.16, rgba('#FFE09A', 0.95)); g.addColorStop(0.3, rgba(PAL.pull, 0.42)); g.addColorStop(0.6, rgba('#C8641E', 0.12)); g.addColorStop(1, rgba('#C8641E', 0));
    circle(c, x, y, R, g);
  });
}
/** the whole world. o: {cam, t, moon, k, ks, A, slosh, moonA, shellA, earthA, orbitA, sun: {a, x, y, R}, field, mark} */
function world(stage, o) {
  const c = stage.ctx, cam = o.cam, Rp = cam.Rpx, E = P2(cam, [0, 0, 0]);
  if (o.sun && o.sun.a > 0) sunGlow(stage, o.sun.x, o.sun.y, o.sun.R, o.sun.a);
  if (o.orbitA > 0) { const pts = []; for (let j = 0; j <= 160; j++) pts.push(P2(cam, mul(vdeg(j / 160 * 360), M.DM))); withAlpha(c, o.orbitA, () => line(c, pts, rgba('#9FB8C4', 0.45), 1.6, {dash: [4, 9]})); }
  const mpos = mul(vdeg(o.moon), M.DM);
  if (o.field > 0) {        // the Moon's pull: a warm glow that is strongest near the Moon (illustrative)
    const mp = P2(cam, mpos), d = Math.hypot(mp[0] - E[0], mp[1] - E[1]);
    withAlpha(c, o.field, () => {
      const g = c.createRadialGradient(mp[0], mp[1], 0, mp[0], mp[1], d * 1.9);
      g.addColorStop(0, rgba(PAL.pull, 0.6)); g.addColorStop(0.3, rgba(PAL.pull, 0.32)); g.addColorStop(0.55, rgba(PAL.pull, 0.17)); g.addColorStop(0.75, rgba(PAL.pull, 0.07)); g.addColorStop(1, rgba(PAL.pull, 0));
      circle(c, mp[0], mp[1], d * 1.9, g);
      for (let k = 1; k <= 6; k++) { const rr = d * (0.3 + 0.27 * k) + ((o.t * 40) % (d * 0.27)); ring(c, mp[0], mp[1], rr, rgba(PAL.pull, 0.3 * (1 - k / 7)), 2); }
    });
  }
  const so = {moon: o.moon, k: o.k ?? 1, ks: o.ks || 0, A: o.A, slosh: o.slosh};
  const hull = shellHull(cam, so), Rmax = Rp * (1 + M.W0 + (o.A ?? M.A) * 0.9);
  withAlpha(c, (o.shellA ?? 1) * (o.earthA ?? 1), () => {
    glow(c, E[0], E[1], Rmax * 1.25, PAL.water, 0.10);
    const g = c.createRadialGradient(E[0], E[1], Rp * 0.9, E[0], E[1], Rmax);
    g.addColorStop(0, rgba('#2C93D0', 0.85)); g.addColorStop(0.45, rgba(PAL.water, 0.6)); g.addColorStop(1, rgba(PAL.waterHi, 0.5));
    poly(c, hull, g);
  });
  withAlpha(c, o.earthA ?? 1, () => drawEarthLit(stage, cam, TEX, {axis: [0, 0, 1], spin: o.spin, sun: S_LIGHT, night: 0.13, cloudA: 0.55, cloudDrift: o.t * 1.5, atmo: 0.04, spec: 0.4}));
  withAlpha(c, (o.shellA ?? 1) * (o.earthA ?? 1), () => {
    // water over the visible hemisphere: a light veil, thicker where the shell bulges (equator band drawn over the disc)
    const ring = equatorRing(cam, so);
    c.save(); c.beginPath(); hull.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
    line(c, ring, rgba(PAL.waterHi, 0.35), 2.2);
    c.restore();
    poly(c, hull, null, rgba(PAL.waterHi, 0.85), 2.4);
    glowLine(c, hull, PAL.water, 0.25);
  });
  let moon = null;
  if ((o.moonA ?? 1) > 0) moon = moonBall(stage, cam, mpos, M.RM * (o.moonScale ?? 1), (o.moonA ?? 1) * (o.earthA ?? 1));
  let mark = null;
  if (o.mark > 0) {
    const la = M.korea[0] * D2R, a = (M.korea[1] + o.spin) * D2R, p = [Math.cos(la) * Math.cos(a), Math.cos(la) * Math.sin(a), Math.sin(la)], s = P2(cam, mul(p, 1.0));
    if (!cam.hidden(mul(p, 1.004))) {
      mark = s;
      withAlpha(c, o.mark, () => { glow(c, s[0], s[1], 26, PAL.mark, 0.5 + 0.4 * (o.markPulse || 0)); ring(c, s[0], s[1], 13 + 10 * (o.markPulse || 0), rgba(PAL.mark, 0.95), 2.6); circle(c, s[0], s[1], 4.5, PAL.mark); });
    }
  }
  return {E, moon, mark, hull, mpos};
}
function glowLine(c, pts, col, a) { line(c, pts, rgba(col, a * 0.5), 9); line(c, pts, rgba(col, a), 4.5); }
/** an arrow in world space */
function arrowW(stage, cam, p0, p1, col, w = 4, head) { const a = P2(cam, p0), b = P2(cam, p1); arrow(stage.ctx, a, b, col, w, {head: head ?? Math.max(14, w * 4)}); return [a, b]; }

// =====================================================================================================
// Titles, poster, overlays, background
// =====================================================================================================
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, '오늘의 주제', '반대쪽 바다는 왜 부풀까?']];
  if (id === 'origin') return [[-Infinity, '기원 · 이름', '潮汐 = 아침 밀물 + 저녁 밀물'], [at('s05'), '1632 · 갈릴레이', '지구가 움직여서 출렁인다?'], [at('s06'), '1687 · 뉴턴', '자리마다 다른 달의 당김']];
  if (id === 'essence') return [[-Infinity, '본질 · 달 거리 축소, 차이 과장', '멀수록 약한 당김'], [at('s08'), '본질', '가까운 쪽은 세게, 먼 쪽은 약하게']];
  if (id === 'stretch') return [[-Infinity, '메커니즘 ① · 부풂 크기 과장', '당김의 차이 = 기조력'], [at('s11'), '메커니즘 ① 기조력', '아주 작지만, 옆으로 민다']];
  if (id === 'rotate') return [[-Infinity, '메커니즘 ② · 하루를 5초로', '두 부풂 밑을 도는 지구']];
  if (id === 'sun') return [[-Infinity, '메커니즘 ③ 태양의 몫', '달의 절반이 안 되는 힘'], [P.full16 - 0.4, '메커니즘 ③ 태양의 몫', '사리와 조금']];
  if (id === 'westsea') return [[-Infinity, '현상 · 높이 크게 과장', '넓은 바다는 1 m'], [P.inch19 - 0.4, '현상 · 서해', '인천 앞바다는 9 m'], [at('s20'), '현상 · 서해', '얕은 바다가 물결을 키운다']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '자전 때문일까?'], [P.no22 - 0.2, '오해 바로잡기', '부풂은 달을 따라간다']];
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
const STARS = Array.from({length: 520}, (_, i) => ({x: rand(i * 3.1 + 1) * W, y: rand(i * 7.7 + 2) * H, m: rand(i * 1.9 + 5) ** 3, tw: rand(i * 5.3) * TAU, warm: rand(i * 2.2) < 0.18}));
export function background(stage, t, ctx) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 300, H); g.addColorStop(0, '#02202D'); g.addColorStop(1, '#000B12');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (ctx?.scene?.id !== 'westsea') for (const s of STARS) {
    const al = (0.12 + 0.6 * s.m) * (0.8 + 0.2 * Math.sin(t * 1.2 + s.tw)), r = 0.6 + 1.6 * s.m;
    c.fillStyle = s.warm ? rgba('#FFE2C4', al) : rgba('#E8F0F6', al);
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

export const scenes = {
  // ------------------------------------------------------------------ hook: poster world → spinning Earth, marker passes the two bulges
  hook(stage, t, p, ctx) {
    checkSoundTable(ctx);
    const P = plan(ctx.tl), c = stage.ctx;
    const camK = keyedCam([[0, {...HOME}], [P.MORPH[1], {...HOME}], [P.seoul - 0.2, {...HOME, R: 270, az: -32, e: 62}], [P.moon3, {...HOME, R: 262, az: -24}], [ctx.scene.end, {...HOME, R: 256, az: -20}]]);
    const cam = camOf(camK(t)), spin = P.spin(t);
    const lastHigh = P.hookHighs.filter(x => x <= t).pop(), pulse = lastHigh ? Math.exp(-(t - lastHigh) / 0.5) : 0;
    const w = world(stage, {cam, t, spin, moon: 90, mark: fadeIn(t, P.seoul - 0.2, 0.4), markPulse: pulse});
    // marker label
    if (w.mark) tag(stage, '서해', w.mark[0] + 26, w.mark[1] - 30, {size: 28, align: 'left', color: PAL.mark, a: fadeIn(t, P.seoul, 0.4) * fadeOut(t, P.moon3 - 0.3, 0.4)});
    const hiA = fadeIn(t, P.back2 - 0.2, 0.4) * fadeOut(t, P.moon3 - 0.3, 0.4);
    if (hiA > 0) tag(stage, `밀물 ${Math.min(2, P.hookHighs.filter(x => x <= t).length)}번 / 하루`, 230, 1290, {size: 30, color: PAL.waterHi, a: hiA});
    // s03: the Moon pulls the near side … and the far side bulges too
    const mA = fadeIn(t, P.moon3 - 0.2, 0.5), fA = fadeIn(t, P.far3 - 0.1, 0.4);
    if (mA > 0) withAlpha(c, mA, () => {
      const top = P2(cam, [0, 1 + M.W0 + M.A * 0.67, 0]), mp = w.moon, dx = top[0] - mp[0], dy = top[1] - mp[1], dl = Math.hypot(dx, dy);
      arrow(c, [mp[0] + dx / dl * (mp[2] + 14), mp[1] + dy / dl * (mp[2] + 14)], [top[0] - dx / dl * 16, top[1] - dy / dl * 16], PAL.pull, 5, {head: 22});
      tag(stage, '달의 당김', mp[0] + mp[2] + 20, mp[1] + 40, {size: 28, align: 'left', color: PAL.pull});
    });
    if (fA > 0) {
      const bot = P2(cam, [0, -(1 + M.W0 + M.A * 0.67), 0]), q = 0.5 + 0.5 * Math.sin((t - P.far3) * 5);
      withAlpha(c, fA, () => { glow(c, bot[0], bot[1], 90, PAL.waterHi, 0.35 + 0.2 * q); });
      tag(stage, '반대쪽도 부푼다', bot[0] - 70, bot[1] + 10, {size: 30, color: PAL.waterHi, a: fA, align: 'right'});
    }
  },

  // ------------------------------------------------------------------ origin: 潮汐 → Galileo's sloshing → Newton's uneven pull
  origin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start, at = r => ctx.tl.at(r);
    const camK = keyedCam([[s0, {...HOME, R: 256, az: -20}], [s0 + 1.6, {...HOME, cy: 1080, R: 236, az: -25}], [P.gal - 0.2, {...HOME, cy: 1080, R: 236, az: -25}],
      [P.gal + 1.6, {cx: 660, cy: 960, R: 170, e: 62, az: 0}], [at('s06') - 0.4, {cx: 660, cy: 960, R: 170, e: 62, az: 0}], [at('s06') + 1.4, {...HOME, R: 250}], [ctx.scene.end, {...HOME, cy: 1100, R: 220}]]);
    const cam = camOf(camK(t)), spin = P.spin(t);
    const galA = fadeIn(t, P.gal - 0.3, 0.8) * fadeOut(t, at('s06') - 0.5, 0.8);
    const slosh = galA > 0 ? [1, 0, 0.11 * galA * Math.sin((t - P.gal) * 2.6)] : null;
    const cardA0 = fadeIn(t, s0 + 0.2, 0.5) * fadeOut(t, at('s05') - 0.6, 0.5), moonA = 1 - 0.8 * Math.max(galA, cardA0), k = 1 - galA;
    const E0 = P2(cam, [0, 0, 0]);
    const sun = {a: galA, x: E0[0] - 760, y: E0[1] + 40, R: 520};
    const w = world(stage, {cam, t, spin, moon: 90, k, slosh, moonA, sun, field: fadeIn(t, P.grav - 0.2, 0.8) * fadeOut(t, ctx.scene.end - 0.6, 0.5)});
    // s04: glyph cards
    const cA = fadeIn(t, s0 + 0.2, 0.5) * fadeOut(t, at('s05') - 0.6, 0.5);
    if (cA > 0) {
      const card = (x, g, read, on, col) => withAlpha(c, cA * (0.35 + 0.65 * on), () => {
        rect(c, x - 120, 350, 240, 230, 16, rgba('#06222E', 0.88), rgba(col, 0.75), 2);
        stage.text(g, x, 445, {size: 120, weight: 700, color: PAL.ink, align: 'center'});
        stage.text(read, x, 545, {size: 30, weight: 700, color: col, align: 'center'});
      });
      card(380, '潮', '조 · 아침 밀물', fadeIn(t, P.jo - 0.1, 0.4), PAL.pull);
      card(700, '汐', '석 · 저녁 밀물', fadeIn(t, P.seok - 0.1, 0.4), PAL.waterHi);
    }
    // s05: Galileo — spin + orbit → sloshing; the Moon's pull dismissed
    if (galA > 0) withAlpha(c, galA, () => {
      const E = w.E, R = cam.Rpx * 1.5;
      // spin arrow around the Earth
      const sp = []; for (let i = 0; i <= 40; i++) { const q = (200 + i * 6 + (t * 40) % 360) * D2R; sp.push([E[0] + R * Math.cos(q), E[1] - R * 0.9 * Math.sin(q)]); }
      line(c, sp.slice(0, -2), rgba(PAL.ink, 0.8), 3); arrow(c, sp[sp.length - 4], sp[sp.length - 1], rgba(PAL.ink, 0.8), 3, {head: 16});
      // orbit arc around the Sun (direction of travel: up)
      const orb = []; for (let i = 0; i <= 50; i++) { const q = (-22 + i * 0.9) * D2R; orb.push([sun.x + 760 * Math.cos(q), sun.y - 40 + 760 * Math.sin(q) * -1]); }
      line(c, orb, rgba(PAL.sun, 0.55), 2.2, {dash: [6, 8]}); arrow(c, orb[orb.length - 3], orb[orb.length - 1], rgba(PAL.sun, 0.8), 2.4, {head: 16});
      tag(stage, '자전 + 공전 → 출렁임?', 540, 1360 - 60, {size: 32, color: PAL.ink});
      if (w.moon) { const x = w.moon[0] + w.moon[2] + 16, y = w.moon[1]; const ww = tag(stage, '달의 당김', x, y, {size: 28, align: 'left', color: PAL.pull, a: 0.9}); const q = smooth((t - P.reject) / 0.5); if (q > 0) line(c, [[x - 4, y + 2], [x - 4 + (ww + 8) * q, y + 2]], rgba('#FF8A5C', 0.95), 4); }
    });
    // s06: Newton — the pull differs from place to place
    const nA = fadeIn(t, P.place - 0.2, 0.5) * fadeOut(t, ctx.scene.end - 0.4, 0.4);
    if (nA > 0) {
      const near = P2(cam, [0, 1, 0]), far = P2(cam, [0, -1, 0]);
      tag(stage, '세게', near[0] + 70, near[1] + 6, {size: 28, color: PAL.pull, a: nA, align: 'left'});
      tag(stage, '약하게', far[0] + 70, far[1] - 6, {size: 28, color: rgba(PAL.pull, 0.8), a: nA, align: 'left'});
    }
    dip(c, t, s0, 0.01);
  },

  // ------------------------------------------------------------------ essence: three pulls of different strength
  essence(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start, at = r => ctx.tl.at(r);
    const camK = keyedCam([[s0, {...HOME, R: 254}], [P.near7, {...HOME, R: 258, e: 70}], [ctx.scene.end, {...HOME, R: 262, e: 68, az: -28}]]);
    const cam = camOf(camK(t)), spin = P.spin(t);
    const w = world(stage, {cam, t, spin, moon: 90, k: 1 - 0.65 * fadeIn(t, s0, 1.0), shellA: 1});
    const L = 0.62, b = M.bump;
    const pts = [[[0, 1, 0], 1 + b, P.near7, '가까운 쪽'], [[0, 0, 0], 1, P.ctr7, '지구 중심'], [[0, -1, 0], 1 - b, P.farP7, '먼 쪽']];
    for (const [pt, k, t0, name] of pts) {
      const a = fadeIn(t, t0 - 0.15, 0.35), grow = easeOut((t - t0 + 0.15) / 0.6);
      if (a <= 0) continue;
      withAlpha(c, a, () => {
        const p0 = P2(cam, pt);
        circle(c, p0[0], p0[1], 9, PAL.pull); glow(c, p0[0], p0[1], 30, PAL.pull, 0.5);
        arrowW(stage, cam, pt, add(pt, [0, L * k * grow, 0]), PAL.pull, 6, 24);
        tag(stage, name, p0[0] + 34, p0[1] + 20, {size: 28, align: 'left', color: PAL.ink});
      });
    }
    // 1/d² hint next to the Moon: "멀수록 약하다"
    const gA = fadeIn(t, P.far7 - 0.1, 0.4) * fadeOut(t, P.near7 - 0.2, 0.4);
    if (gA > 0 && w.moon) {
      const m = w.moon; withAlpha(c, gA, () => { for (let k = 1; k <= 5; k++) ring(c, m[0], m[1], m[2] + k * 70, rgba(PAL.pull, 0.5 / k), 2.2 + 1.2 / k); });
    }
    // s08: the proposition — the three arrows pulse together
    const kA = fadeIn(t, at('s08') - 0.1, 0.4);
    if (kA > 0) { const q = 0.5 + 0.5 * Math.sin((t - at('s08')) * 4); for (const [pt] of pts) { const p0 = P2(cam, add(pt, [0, 0.3, 0])); glow(c, p0[0], p0[1], 60, PAL.pull, 0.12 * kA * q); } }
  },

  // ------------------------------------------------------------------ stretch: subtract the common pull → tidal field → two bulges; sideways push
  stretch(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start, at = r => ctx.tl.at(r);
    const camK = keyedCam([[s0, {...HOME, R: 262, e: 68, az: -28}], [P.name11, {...HOME, R: 266, e: 66, az: -22}], [ctx.scene.end, {...HOME, R: 270, e: 64, az: -18}]]);
    const cam = camOf(camK(t)), spin = P.spin(t);
    const grow = 0.35 + 0.65 * easeInOut((t - P.far10) / 1.8);
    const w = world(stage, {cam, t, spin, moon: 90, k: grow});
    const L = 0.62, b = M.bump, sub_ = easeInOut((t - P.sub9 + 0.1) / 1.4), fieldA = fadeIn(t, P.two10 - 0.3, 0.6) * fadeOut(t, P.side12 - 0.3, 0.5);
    // the three arrows from the essence, the common (centre) pull subtracted
    const arrA = fadeOut(t, P.two10 - 0.2, 0.5);
    if (arrA > 0) withAlpha(c, arrA, () => {
      for (const [pt, k] of [[[0, 1, 0], 1 + b], [[0, 0, 0], 1], [[0, -1, 0], 1 - b]]) {
        const v = L * (k - sub_), p0 = P2(cam, pt);
        circle(c, p0[0], p0[1], 9, PAL.pull);
        if (Math.abs(v) > 0.02) arrowW(stage, cam, pt, add(pt, [0, v, 0]), PAL.pull, 6, 24);
        if (sub_ > 0 && sub_ < 1) withAlpha(c, 0.7 * Math.sin(sub_ * Math.PI), () => arrowW(stage, cam, add(pt, [0.18, 0, 0]), add(pt, [0.18, -L * sub_, 0]), rgba('#9FB8C4', 0.9), 3, 14));
      }
      const top = P2(cam, [0, 1 + L * b, 0]), bot = P2(cam, [0, -1 - L * b, 0]);
      tag(stage, '달 쪽으로', top[0] + 70, top[1], {size: 28, color: PAL.pull, align: 'left', a: fadeIn(t, P.out9 - 0.1, 0.4)});
      tag(stage, '뒤에 남음', bot[0] + 70, bot[1], {size: 28, color: PAL.pull, align: 'left', a: fadeIn(t, P.far10, 0.4)});
    });
    // the tidal-force pattern around the Earth (direction pattern; lengths relative)
    if (fieldA > 0) withAlpha(c, fieldA, () => {
      const m = vdeg(90);
      for (let j = 0; j < 16; j++) {
        const ph = j / 16 * 360 + 11.25, pv = vdeg(ph), F = sub(mul(m, 3 * dot(pv, m)), pv), base = mul(pv, 1 + M.W0 + M.A * 0.75);
        arrowW(stage, cam, base, add(base, mul(F, 0.24)), rgba(PAL.pull, 0.95), 4.4, 18);
      }
      tag(stage, '기조력', 820, 640, {size: 34, color: PAL.pull, a: fadeIn(t, P.name11 - 0.2, 0.4)});
    });
    // two bulges named
    const twoA = fadeIn(t, P.two10, 0.4) * fadeOut(t, P.name11 - 0.3, 0.4);
    if (twoA > 0) { const tp = P2(cam, [0, 1 + M.W0 + M.A * 0.67, 0]), bt = P2(cam, [0, -(1 + M.W0 + M.A * 0.67), 0]); glow(c, tp[0], tp[1], 80, PAL.waterHi, 0.35 * twoA); glow(c, bt[0], bt[1], 80, PAL.waterHi, 0.35 * twoA); tag(stage, '부풂 1', tp[0] - 40, tp[1] + 10, {size: 30, color: PAL.waterHi, a: twoA, align: 'right'}); tag(stage, '부풂 2', bt[0] + 40, bt[1] - 10, {size: 30, color: PAL.waterHi, a: twoA, align: 'left'}); }
    // big number: 1/10,000,000 of g
    const nA = fadeIn(t, P.num11 - 0.2, 0.4) * fadeOut(t, P.side12 - 0.2, 0.5);
    if (nA > 0) withAlpha(c, nA, () => {
      stage.text('1천만분의 1', 690, 410, {role: 'display', size: 84, weight: 700, color: PAL.pull, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 20});
      stage.text('지구 중력과 견준 크기', 690, 480, {size: 30, weight: 500, color: PAL.muted, align: 'center'});
    });
    // s12: sideways (tractive) push and flowing water dots
    const flA = fadeIn(t, P.side12 - 0.3, 0.5);
    if (flA > 0) withAlpha(c, flA, () => {
      const m = vdeg(90), rr = 1 + M.W0 + M.A * 0.3;
      for (let j = 0; j < 12; j++) {
        const ph = j / 12 * 360 + 15, d = ((ph - 90) % 180 + 180) % 180; if (d < 12 || d > 168 || Math.abs(d - 90) < 10) continue;
        const pv = vdeg(ph), F = sub(mul(m, 3 * dot(pv, m)), pv), tang = sub(F, mul(pv, dot(F, pv))), base = mul(pv, rr + 0.08);
        arrowW(stage, cam, base, add(base, mul(tang, 0.2)), rgba(PAL.pull, 0.95), 3.6, 16);
      }
      // water dots: dΔ/dt = −k sin 2Δ (Δ from the Moon direction), restarted every 3.2 s
      const age = (t - P.side12 + 0.3) % 3.2, kq = 0.55;
      for (let i = 0; i < 90; i++) {
        const d0 = (rand(i * 4.7) * 2 - 1) * 88, sgn = rand(i * 9.1) < 0.5 ? 0 : 180;
        const tn = Math.tan(d0 * D2R) * Math.exp(-2 * kq * age), dd = Math.atan(tn) / D2R, ph = 90 + sgn + dd;
        const pv = vdeg(ph), pos = mul(pv, 1 + M.W0 * 0.6 + 0.02 * rand(i)), s = P2(cam, pos);
        if (cam.hidden(pos)) continue;
        const al = Math.min(1, age / 0.4) * (1 - smooth((age - 2.7) / 0.5));
        circle(c, s[0], s[1], 5, rgba('#E6F8FF', 0.95 * al)); glow(c, s[0], s[1], 16, PAL.waterHi, 0.5 * al);
      }
    });
  },

  // ------------------------------------------------------------------ rotate: the Earth turns under the two bulges; a tide gauge at the marker
  rotate(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, {...HOME, R: 270, e: 64, az: -18}], [s0 + 1.6, {...HOME, cx: 590, cy: 830, R: 196, e: 66, az: -25}], [ctx.scene.end, {...HOME, cx: 590, cy: 835, R: 200, e: 68, az: -30}]]);
    const cam = camOf(camK(t)), spin = P.spin(t), moon = P.moon(t);
    const lastHigh = P.rotHighs.filter(x => x <= t).pop(), pulse = lastHigh ? Math.exp(-(t - lastHigh) / 0.45) : 0;
    const w = world(stage, {cam, t, spin, moon, mark: fadeIn(t, s0 + 0.6, 0.5), markPulse: pulse, orbitA: fadeIn(t, P.moon14 - 0.3, 0.5)});
    if (w.mark) tag(stage, '서해', w.mark[0] + 24, w.mark[1] - 28, {size: 28, align: 'left', color: PAL.mark, a: fadeIn(t, s0 + 0.8, 0.4)});
    // the Moon's path over the scene (arc behind it)
    const mvA = fadeIn(t, P.moon14 - 0.3, 0.5);
    if (mvA > 0) withAlpha(c, mvA, () => {
      const pts = []; const m0 = 90; for (let a = m0; a <= moon; a += 0.5) pts.push(P2(cam, mul(vdeg(a), M.DM)));
      if (pts.length > 1) { line(c, pts, rgba(PAL.moon, 0.7), 3); }
      if (w.moon) tag(stage, '달도 움직임', w.moon[0] + w.moon[2] + 18, w.moon[1] - 4, {size: 28, align: 'left', color: PAL.moon});
    });
    // tide gauge graph (equilibrium height at the marker vs simulated hours)
    const gA = fadeIn(t, s0 + 0.9, 0.5) * fadeOut(t, ctx.scene.end - 0.35, 0.3);
    if (gA > 0) withAlpha(c, gA, () => {
      const x0 = 150, x1 = 930, y0 = 1222, hh = 60, hours = 50, X = hr => x0 + (x1 - x0) * hr / hours;
      rect(c, x0 - 30, y0 - hh - 46, x1 - x0 + 60, 2 * hh + 92, 12, rgba('#03141C', 0.8), rgba(PAL.grid, 1), 1.4);
      line(c, [[x0, y0], [x1, y0]], rgba(PAL.muted, 0.5), 1.4);
      for (let h = 0; h <= hours; h += 12) { line(c, [[X(h), y0 + hh + 4], [X(h), y0 + hh + 14]], rgba(PAL.muted, 0.8), 1.6); }
      tag(stage, '서해의 물높이', x0 + 70, y0 - hh - 66, {size: 26, color: PAL.mark});
      const tStart = s0 + 0.9, pts = [];
      for (let tt = tStart; tt <= t; tt += 1 / 60) { const hr = P.rotHours(tt); if (hr > hours) break; pts.push([X(Math.max(0, hr)), y0 - P.markH(tt) / 0.62 * hh * 1.4]); }
      if (pts.length > 1) {
        const fill = [[pts[0][0], y0 + hh], ...pts, [pts[pts.length - 1][0], y0 + hh]];
        const g = c.createLinearGradient(0, y0 - hh, 0, y0 + hh); g.addColorStop(0, rgba(PAL.water, 0.55)); g.addColorStop(1, rgba(PAL.deep, 0.15)); poly(c, fill, g);
        line(c, pts, PAL.waterHi, 3); const lp = pts[pts.length - 1]; glow(c, lp[0], lp[1], 18, PAL.waterHi, 0.6); circle(c, lp[0], lp[1], 6, '#FFFFFF');
      }
      // high-tide labels on the curve
      P.rotHighs.forEach((th, i) => { if (th > t || i > 3) return; const hr = P.rotHours(th); if (hr > hours) return; tag(stage, '밀물', X(hr), y0 - hh - 16, {size: 24, color: PAL.waterHi, plate: false, a: fadeIn(t, th, 0.3)}); });
      // 12 h 25 min bracket between the first two highs
      const bA = fadeIn(t, P.num14 - 0.2, 0.4);
      if (bA > 0 && P.rotHighs.length >= 2) withAlpha(c, bA, () => {
        const a = X(P.rotHours(P.rotHighs[0])), b2 = X(P.rotHours(P.rotHighs[1])), y = y0 + hh + 34;
        line(c, [[a, y - 10], [a, y], [b2, y], [b2, y - 10]], PAL.pull, 2.6);
        stage.text('12시간 25분', (a + b2) / 2, y + 44, {role: 'display', size: 50, weight: 700, color: PAL.pull, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 14});
      });
    });
  },

  // ------------------------------------------------------------------ sun: the Sun's smaller stretch; spring and neap
  sun(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, {...HOME, cx: 590, cy: 835, R: 200, e: 68, az: -30}], [s0 + 1.8, {cx: 640, cy: 850, R: 150, e: 64, az: 0}], [ctx.scene.end, {cx: 650, cy: 845, R: 154, e: 62, az: 3}]]);
    const cam = camOf(camK(t)), spin = P.spin(t), moon = P.moon(t);
    const sunA = fadeIn(t, P.sun15 - 0.3, 0.9), ks = fadeIn(t, P.half15 - 0.2, 0.8);
    const E0 = P2(cam, [0, 0, 0]);
    const A2 = lerp(M.A, 0.32, smooth((t - s0) / 1.8));
    const w = world(stage, {cam, t, spin, moon, ks, A: A2, sun: {a: sunA, x: E0[0] - 700, y: E0[1] + 10, R: 620}, orbitA: fadeIn(t, s0 + 1, 0.6), moonScale: 1.3});
    // the two ingredients: the Moon's stretch (cyan dashed) and the Sun's (amber dashed)
    const insA = fadeIn(t, P.half15 - 0.3, 0.5) * fadeOut(t, ctx.scene.end - 0.4, 0.3);
    if (insA > 0) withAlpha(c, insA, () => {
      const mo = equatorRing(cam, {moon, k: 1, ks: 0, A: A2}), so = equatorRing(cam, {moon, k: 0, ks: 1, A: A2});
      line(c, so, rgba(PAL.pull, 0.95), 2.6, {dash: [7, 6]}); line(c, mo, rgba('#BDEBFF', 0.6), 2, {dash: [3, 6]});
    });
    // numbers: mass × 27 million, distance × 390 → 46 %
    const nA = fadeIn(t, P.mass15 - 0.2, 0.4) * fadeOut(t, P.full16 - 0.5, 0.4);
    if (nA > 0) withAlpha(c, nA, () => {
      stage.text('질량 2,700만 배', 300, 380, {role: 'display', size: 40, weight: 700, color: PAL.sun, align: 'center', alpha: fadeIn(t, P.mass15 - 0.1, 0.3)});
      stage.text('거리 390배', 780, 380, {role: 'display', size: 40, weight: 700, color: PAL.sun, align: 'center', alpha: fadeIn(t, P.dist15 - 0.1, 0.3)});
      const hA = fadeIn(t, P.half15 - 0.2, 0.4);
      stage.text('달의 46%', 540, 488, {role: 'display', size: 92, weight: 700, color: PAL.pull, align: 'center', alpha: hA, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 20});
    });
    // range meter
    const d = (moon - 180) * D2R, range = Math.hypot(1 + M.sunK * Math.cos(2 * d) * ks, M.sunK * Math.sin(2 * d) * ks);
    const mA = fadeIn(t, P.full16 - 0.2, 0.5);
    if (mA > 0) withAlpha(c, mA, () => {
      const x0 = 210, x1 = 870, y = 400, X = v => x0 + (x1 - x0) * v / 1.6;
      rect(c, 120, 320, 840, 150, 12, rgba('#03141C', 0.82), rgba(PAL.grid, 1), 1.4);
      stage.text('물높이 차', 150, 356, {size: 26, weight: 700, color: PAL.muted});
      rect(c, x0, y - 14, x1 - x0, 28, 14, rgba('#0D2C3A', 1));
      const g = c.createLinearGradient(x0, 0, X(range), 0); g.addColorStop(0, rgba(PAL.deep, 1)); g.addColorStop(1, PAL.waterHi); rect(c, x0, y - 14, Math.max(10, X(range) - x0), 28, 14, g);
      for (const [v, s] of [[1 + M.sunK, '사리'], [1 - M.sunK, '조금']]) { line(c, [[X(v), y - 24], [X(v), y + 24]], rgba(PAL.ink, 0.8), 2); stage.text(s, X(v), y + 46, {size: 28, weight: 700, color: PAL.ink, align: 'center'}); }
    });
    // phase names
    const springA = fadeIn(t, P.new16 - 0.1, 0.4) * fadeOut(t, P.half17 - 0.3, 0.4), neapA = fadeIn(t, P.half17, 0.4);
    if (springA > 0 && w.moon) {
      const mf = P2(cam, mul(vdeg(0), M.DM));
      withAlpha(c, springA, () => { moonBall(stage, cam, mul(vdeg(0), M.DM), M.RM * 1.3, 0.55); line(c, [[E0[0] - 700, E0[1]], [mf[0] + 60, mf[1]]], rgba(PAL.pull, 0.35), 2, {dash: [10, 8]}); });
      tag(stage, '그믐달', w.moon[0], w.moon[1] - w.moon[2] - 34, {size: 28, color: PAL.moon, a: springA});
      tag(stage, '보름달', mf[0], mf[1] - 60, {size: 28, color: PAL.moon, a: springA * fadeIn(t, P.full16, 0.3)});
      tag(stage, '사리', E0[0], E0[1] + 210, {size: 40, color: PAL.waterHi, a: fadeIn(t, P.spring16 - 0.1, 0.3) * springA});
    }
    if (neapA > 0 && w.moon) {
      tag(stage, '반달', w.moon[0] + w.moon[2] + 16, w.moon[1], {size: 28, color: PAL.moon, align: 'left', a: neapA});
      tag(stage, '조금', E0[0] - 230, E0[1] - 20, {size: 40, color: PAL.waterHi, a: fadeIn(t, P.neap17 - 0.1, 0.3)});
    }
  },

  // ------------------------------------------------------------------ westsea: zoom into the coast → cross-section of the mudflat
  westsea(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const zq = easeInOut((t - s0) / 1.1);
    if (zq < 1) {          // push into the marker on the Earth, then cut to the section
      const la = M.korea[0] * D2R, a = (M.korea[1] + P.spin(t)) * D2R, mk = [Math.cos(la) * Math.cos(a), Math.cos(la) * Math.sin(a), 0];
      const cam = camOf({cx: lerp(650, 540, zq), cy: lerp(870, 900, zq), R: lerp(122, 1400, zq * zq), e: 64, az: 3, tx: mk[0] * zq, ty: mk[1] * zq});
      withAlpha(c, 1 - smooth((zq - 0.6) / 0.4), () => world(stage, {cam, t, spin: P.spin(t), moon: P.moon(t), ks: 1, A: 0.32, mark: 1}));
    }
    withAlpha(c, smooth((t - s0 - 0.7) / 0.5), () => coast(stage, t, P, ctx));
  },

  // ------------------------------------------------------------------ myth: spin fast — bulges stay; move the Moon — bulges follow
  myth(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, {...HOME, R: 250, e: 68}], [ctx.scene.end, {...HOME, R: 262, e: 66, az: -20}]]);
    const cam = camOf(camK(t)), spin = P.spin(t), moon = P.moon(t);
    const w = world(stage, {cam, t, spin, moon, orbitA: fadeIn(t, P.two22 - 0.4, 0.5)});
    // spin arrow (fast)
    const spA = fadeIn(t, P.spin21 - 0.3, 0.4) * fadeOut(t, P.two22 + 0.2, 0.5);
    if (spA > 0) withAlpha(c, spA, () => {
      const E = w.E, R = cam.Rpx * 1.48, ph = (spin * 0.5) % 360, sp = [];
      for (let i = 0; i <= 50; i++) { const q = (ph + i * 4.8) * D2R; sp.push([E[0] + R * Math.cos(q), E[1] - R * 0.93 * Math.sin(q)]); }
      line(c, sp.slice(0, -2), rgba(PAL.ink, 0.85), 3.4); arrow(c, sp[sp.length - 4], sp[sp.length - 1], rgba(PAL.ink, 0.85), 3.4, {head: 18});
      tag(stage, '자전: 어느 방향이나 같다', 300, 1300, {size: 30, color: PAL.ink});
    });
    const fA = fadeIn(t, P.follow22 - 0.4, 0.4);
    if (fA > 0 && w.moon) {
      tag(stage, '부풂이 달을 따라감', 300, 1300, {size: 30, color: PAL.waterHi, a: fA});
      withAlpha(c, fA, () => { const pts = []; for (let a = 90; a <= moon; a += 1) pts.push(P2(cam, mul(vdeg(a), M.DM))); if (pts.length > 1) line(c, pts, rgba(PAL.moon, 0.75), 3); });
    }
    dip(c, t, s0, 0.4);
  },

  // ------------------------------------------------------------------ close: the poster world returns
  close(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camK = keyedCam([[s0, {...HOME, R: 250, az: -18}], [P.poster + 0.8, {...HOME}], [P.end, {...HOME}]]);
    const cam = camOf(camK(t));
    world(stage, {cam, t, spin: P.spin(t), moon: 90});
    // the proposition as three pulls, briefly
    const qA = fadeIn(t, s0 + 0.4, 0.5) * fadeOut(t, P.poster - 0.5, 0.4);
    if (qA > 0) withAlpha(c, qA, () => {
      const L = 0.62, b = M.bump;
      for (const [pt, k] of [[[0, 1, 0], 1 + b], [[0, 0, 0], 1], [[0, -1, 0], 1 - b]]) { const p0 = P2(cam, pt); circle(c, p0[0], p0[1], 9, PAL.pull); arrowW(stage, cam, pt, add(pt, [0, L * k, 0]), PAL.pull, 6, 24); }
      stage.text('“가까운 쪽은 더 세게, 먼 쪽은 더 약하게”', 540, 372, {role: 'display', size: 42, weight: 700, color: PAL.ink, align: 'center', maxWidth: 900, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16});
    });
    dip(c, t, s0, 0.4);
  },
};

// ------------------------------------------------------------------ the coast cross-section (westsea)
const CX0 = 60, CX1 = 1020, MSL = 860;
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
  for (let x = edge; x < CX0 + 0.95 * (CX1 - CX0); x += 6) { const y = floorY(x); line(c, [[x, y + 1], [x + 4, y + 1]], rgba('#E9D2A8', 0.35 + 0.25 * Math.sin(x * 0.3 + t)), 2); }
  // surface line with glow and small wave texture
  line(c, top.map(([x, y]) => [x, y + 1.5 * Math.sin(x * 0.05 + t * 3)]), rgba(PAL.waterHi, 0.95), 2.6); line(c, top, rgba(PAL.water, 0.3), 9);
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
      circle(c, x, Math.min(ys, yf), 7, '#FFFFFF'); glow(c, x, Math.min(ys, yf), 22, col, 0.6);
      tag(stage, label, x, yTop - 64, {size: 30, color: PAL.ink});
      tag(stage, rangeLabel, x, yTop - 22, {size: 30, color: col});
    });
  };
  const leftOn = fadeIn(t, P.ocean18 - 0.2, 0.5), rightOn = fadeIn(t, P.inch19 - 0.2, 0.5);
  gauge(220, 0.5, '넓은 바다', '약 1 m', leftOn, PAL.waterHi);
  gauge(600, 4.5, '인천 앞바다', '사리 때 약 9 m', rightOn, PAL.pull);
  // big number
  const nA = fadeIn(t, P.nine19 - 0.1, 0.35) * fadeOut(t, ctx.tl.at('s20') - 0.3, 0.4);
  if (nA > 0) stage.text('9 m', 790, 470, {role: 'display', size: 150, weight: 700, color: PAL.pull, align: 'center', alpha: nA, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 22});
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
    if (best) { const ys = surf(best[0]); glow(c, best[0], ys, 34, PAL.waterHi, 0.55); circle(c, best[0], ys, 6, '#FFFFFF'); }
    void cyc;
    line(c, [[160, 640], [520, 640]], rgba(PAL.waterHi, 0.9), 3); arrow(c, [460, 640], [560, 640], PAL.waterHi, 3, {head: 18});
    tag(stage, '조석의 물결', 340, 600, {size: 30, color: PAL.waterHi});
    tag(stage, '얕아질수록 높아짐', 420, 1090, {size: 28, color: PAL.ink, a: fadeIn(t, P.high20 - 0.2, 0.4)});
    tag(stage, '좁은 만에 쌓임', 790, 560, {size: 28, color: PAL.pull, a: fadeIn(t, P.bay20 - 0.2, 0.4)});
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
  swell('field', P.grav - 0.1, [98, 131], '달의 당김 영역이 퍼짐(가까울수록 셈)', {dur: 1.8, gain: -36});
  // ---- essence: pull strength → pitch (stronger = higher)
  tick('pull_near', P.near7, 196, -33, '가까운 쪽 당김(가장 셈)', {decay: 0.18});
  tick('pull_ctr', P.ctr7, 147, -33, '지구 중심 당김', {decay: 0.18});
  tick('pull_far', P.farP7, 110, -33, '먼 쪽 당김(가장 약함)', {decay: 0.18});
  // ---- stretch
  whoosh('subtract', P.sub9 - 0.1, 1.4, 200, 90, '지구 전체가 받는 당김을 뺌', -36);
  swell('bulges', P.far10 + 0.1, [110, 165, 220], '두 부풂이 자람', {dur: 2.0, gain: -34});
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
