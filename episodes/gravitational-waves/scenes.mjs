// Episode scenes — "두 블랙홀의 마지막 춤, 중력파" (GW150914)
// Shape: export {theme, scenes, overlays, titles, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (simplifications, also listed in README.md):
//  - Inspiral = point-mass circular orbit, quadrupole radiation (Peters 1964). Chirp mass Mc = 28.3 M☉,
//    m1 = 36, m2 = 29, M = 65 M☉ (GW150914). f_gw(τ) = (1/π)(5/256 · 1/(−τ))^(3/8) · (G·Mc/c³)^(−5/8), τ < 0 before merger.
//    f_gw is clamped at 250 Hz (reached ≈ 1 ms before τ = 0). The visible inspiral starts at f0 = 24 Hz (τ0 ≈ −0.514 s).
//  - Orbital phase φ(τ) = π ∫ f_gw dτ is integrated numerically once (4000-sample table). Picture, waveform, wavefront
//    emission and the chirp sound all read this table.
//  - Separation from Kepler r³ = G·M/(π f_gw)², relative speed v = (π G M f_gw)^(1/3). Black-hole discs = Schwarzschild
//    radius 2Gm/c² at the SAME scale as the separation (1 world unit = 1000 km). The dim halo (~1.5 Rs) is decoration,
//    not a horizon. Near τ = 0 (−2.5 ms … +1 ms) the point-mass model breaks down; the picture interpolates the two
//    discs into the 62 M☉ disc (Rs ≈ 183 km).
//  - Waveform h ∝ f_gw^(2/3) cos 2φ, normalised to 1 at merger. Ringdown h = exp(−τ/4 ms) cos(2φ(0) + 2π·250 Hz·τ)
//    for 0 ≤ τ ≤ 25 ms (phase-continuous with the inspiral). Radiated power ∝ f_gw^(10/3) (relative).
//  - Wavefronts are drawn as one ring per GW cycle (= every half orbit) leaving the centre of mass at a constant
//    on-screen speed. Real wavefronts are a two-armed spiral with a quadrupole pattern, their real wavelength is
//    1,200–12,500 km, and they travel at c. Ring height and grid dimples are explanatory exaggerations.
//  - Time: ONE linear mapping τ(t) for mechanism + merger: τ = τ0 at the mechanism scene start, τ = 0 at the event
//    "merge" (= s13 start + 0.3 s, defined in sound.json). Slow-motion factor N = (t_merge − t_mech)/|τ0| ≈ 77 → "80×".
//  - Detector arms: displayed ΔL/L = 0.10 · h_model, i.e. ≈ 10²⁰ × the real peak strain (1.0×10⁻²¹).
//
// The chirp sound table in sound.json is generated from this file:
//   node episodes/gravitational-waves/scenes.mjs --emit-chirp [--timeline outputs/gravitational-waves/narration/timeline.json]
// Re-run it whenever the narration timeline changes (the mechanism scene warns once if the table is stale).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  header, progressBar, sourceLine, endCard, drawLabel, leader,
  project, DrawQueue, rgba, mix, clamp, lerp, smooth, easeOut, easeInOut, poly, line, circle, ring, glow, sphere, arrow,
  withAlpha, clipEllipse, clipRect, rect, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const events = [];
export const captionLayout = {};

export const titles = {
  hook: ['예측 질문', '마지막 0.2초,\n공간은 출렁일까?', ''],
  origin: ['기원 · 1915–2015', '무거운 것이 만드는 물결', ''],
  essence: ['본질 · 제1원리', '휘어짐의 변화가\n퍼져 나간다', ''],
  detect: ['관측 · GW150914', '2015년 9월 14일, 첫 검출', ''],
  myth: ['오해 바로잡기', '들은 것이 아니라, 잰 것', ''],
  close: ['', '', ''],
};

// =====================================================================================================
// Physics model (pure functions; shared by picture, readouts and the chirp sound table)
// =====================================================================================================
const G = 6.674e-11, C = 2.998e8, MSUN = 1.989e30;
export const M1 = 36, M2 = 29, MTOT = 65, MC = 28.3, MFIN = 62;
const TMC = MC * G * MSUN / C ** 3;                       // G·Mc/c³ ≈ 1.394e-4 s
export const F0 = 24, FPEAK = 250, RD_TAU = 0.004, RD_LEN = 0.025;
const F_MIN = 16;                                         // table start (hook/essence/detect run slightly earlier than τ0)

export const fgw = tau => (tau >= 0 ? FPEAK : Math.min(FPEAK, (1 / Math.PI) * Math.pow(5 / 256 / (-tau), 3 / 8) * Math.pow(TMC, -5 / 8)));
export const tauOfF = f => -(5 / 256) * Math.pow(TMC, -5 / 3) * Math.pow(Math.PI * f, -8 / 3);
export const TAU0 = tauOfF(F0);                           // ≈ −0.514 s
const TAU_MIN = tauOfF(F_MIN);
export const sepKm = f => Math.cbrt(G * MTOT * MSUN / (Math.PI * f) ** 2) / 1000;
export const rsKm = m => 2 * G * m * MSUN / C ** 2 / 1000;
export const vOverC = f => Math.cbrt(Math.PI * G * MTOT * MSUN * f) / C;
const RS1 = rsKm(M1), RS2 = rsKm(M2), RSF = rsKm(MFIN);   // 106, 86, 183 km

// orbital phase table φ(τ) = π ∫ f_gw dτ, samples denser towards τ = 0 (τ_i = τ_min · w², w: 1 → 0)
const NT = 4000, TT = new Float64Array(NT + 1), PH = new Float64Array(NT + 1);
for (let i = 0; i <= NT; i++) { const w = 1 - i / NT; TT[i] = TAU_MIN * w * w; }
for (let i = 1; i <= NT; i++) PH[i] = PH[i - 1] + Math.PI * 0.5 * (fgw(TT[i - 1]) + fgw(Math.min(TT[i], -1e-9))) * (TT[i] - TT[i - 1]);
const PH_END = PH[NT];
function bsearch(arr, v) { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; }
export function phiAt(tau) {
  if (tau >= 0) return PH_END + Math.PI * FPEAK * tau;
  if (tau <= TT[0]) return PH[0] + Math.PI * fgw(TT[0]) * (tau - TT[0]);
  const i = bsearch(TT, tau), u = (tau - TT[i]) / (TT[i + 1] - TT[i]);
  return PH[i] + u * (PH[i + 1] - PH[i]);
}
export function tauAtPhi(ph) {
  if (ph >= PH_END) return (ph - PH_END) / (Math.PI * FPEAK);
  if (ph <= PH[0]) return TT[0] + (ph - PH[0]) / (Math.PI * fgw(TT[0]));
  const i = bsearch(PH, ph), u = (ph - PH[i]) / (PH[i + 1] - PH[i]);
  return TT[i] + u * (TT[i + 1] - TT[i]);
}
/** amplitude envelope of h (1 at merger) */
export const envAt = tau => (tau < 0 ? Math.pow(fgw(tau) / FPEAK, 2 / 3) : tau <= RD_LEN ? Math.exp(-tau / RD_TAU) : 0);
/** strain waveform (model units, peak ≈ 1) */
export const hAt = tau => envAt(tau) * Math.cos(2 * phiAt(tau));
/** radiated power relative to the peak */
export const powerAt = tau => (tau < 0 ? Math.pow(fgw(tau) / FPEAK, 10 / 3) : tau <= RD_LEN ? Math.exp(-2 * tau / RD_TAU) : 0);

/** One linear mapping for mechanism + merger: τ0 at mechanism start, τ = 0 at the 'merge' event (s13 + 0.3 s). */
export function chirpMap(tl, events) {
  const tA = tl.at('mechanism');
  const tM = events && events.find?.(e => e.id === 'merge') ? events.find(e => e.id === 'merge').time : tl.at('s13', 0.3);
  const N = (tM - tA) / (-TAU0);
  return {tA, tM, N, label: Math.round(N / 10) * 10, tau: t => (t - tM) / N, t: tau => tM + tau * N};
}
/** Same slow-motion factor, anchored elsewhere (hook, essence, detect replay) */
const shiftedMap = (base, tRef, tauRef) => ({...base, tau: t => tauRef + (t - tRef) / base.N, t: tau => tRef + (tau - tauRef) * base.N});

/** Binary state at model time τ (world units: 1 = 1000 km, orbital plane = x–z). */
export function binaryAt(tau) {
  const k = smooth((tau + 0.0025) / 0.0035);              // 0 → 1 merge interpolation (−2.5 … +1 ms)
  const f = fgw(tau), rKm = sepKm(f), ph = phiAt(tau), r = rKm / 1000 * (1 - k);
  const a1 = r * M2 / MTOT, a2 = r * M1 / MTOT, c = Math.cos(ph), s = Math.sin(ph);
  const wob = tau > 0 ? 0.06 * Math.exp(-tau / RD_TAU) * Math.cos(TAU * FPEAK * tau) : 0;
  return {tau, f, rKm, ph, k, v: vOverC(f), p1: [-a1 * c, -a1 * s], p2: [a2 * c, a2 * s], wob,
    rs1: RS1 / 1000, rs2: RS2 / 1000, rsF: RSF / 1000};
}

// wavefronts: one ring per GW cycle (φ = kπ), constant on-screen speed V_RING (world units / video second)
const V_RING = 0.30, AGE_MAX = 5.6, RING_H = 0.30;
function ringsAt(t, map, {tauStop = RD_LEN} = {}) {
  const out = [], tn = Math.min(map.tau(t), tauStop), to = map.tau(t - AGE_MAX);
  if (to > tn) return out;
  const k0 = Math.ceil(phiAt(to) / Math.PI), k1 = Math.floor(phiAt(tn) / Math.PI);
  for (let k = k0; k <= k1; k++) {
    const tauK = tauAtPhi(k * Math.PI), age = t - map.t(tauK);
    if (age < 0 || age > AGE_MAX) continue;
    const spacing = V_RING * map.N / fgw(tauK);
    out.push({k, tauK, age, R: V_RING * age, A: RING_H * envAt(tauK) * (1 - smooth((age - AGE_MAX + 1.4) / 1.4)) * smooth(age / 0.25),
      w: clamp(0.3 * spacing, 0.022, 0.10)});
  }
  return out;
}

// =====================================================================================================
// Drawing: spacetime sheet, black holes, readouts
// =====================================================================================================
const GRID = '#6F98A5', CREST = '#B9F0D2', WAVE = '#8AC0A0', LIGHT = '#FFE2C4', TRACK = '#FF4103';
const WELL_D = 0.0085, wellSigma = m => 0.11 + 0.0021 * m;
const camM = {angle: 0, tilt: 55 * Math.PI / 180, scale: 287, cx: 500, cy: 560, distance: 9};

function sheetHeight(x, z, S) {
  let h = 0;
  for (const w of S.wells) { const dx = x - w.x, dz = z - w.z; h -= w.D * Math.exp(-(dx * dx + dz * dz) / (2 * w.s * w.s)); }
  let rh = 0;
  if (S.rings && S.rings.length) {
    const d = Math.hypot(x, z);
    for (const r of S.rings) { const u = (d - r.R) / r.w; if (u * u < 9) rh += r.A * Math.exp(-u * u); }
    rh /= 1 + d / 0.7;
  }
  return [h + rh, rh];
}

/** Depth-sorted grid lines + bodies. o: {n, ext, fadeX, fadeZ, samples, alpha, cull:{x,y,r}, width} */
function drawSheet(stage, cam, S, o = {}) {
  const {ctx} = stage, n = o.n ?? 22, ext = o.ext ?? 1.65, M = o.samples ?? 60, ax = o.fadeX ?? 1.55, az = o.fadeZ ?? 1.1;
  const q = new DrawQueue(), A = o.alpha ?? 0.75, lw = o.width ?? 1.7, cull = o.cull;
  // depth cue: a soft shadow at the bottom of each well
  for (const w of S.wells) { if (w.D < 0.02) continue; const P = project([w.x, -w.D, w.z], cam); glow(ctx, P[0], P[1], w.s * 2.2 * cam.scale * P[3], '#000000', clamp(w.D * 2.2, 0, 0.75)); }
  for (let dir = 0; dir < 2; dir++) for (let i = 0; i < n; i++) {
    const c = -ext + 2 * ext * i / (n - 1), pts = [];
    for (let j = 0; j <= M; j++) {
      const s = -ext + 2 * ext * j / M, x = dir ? c : s, z = dir ? s : c;
      const [h, rh] = sheetHeight(x, z, S), e = (x / ax) ** 2 + (z / az) ** 2;
      pts.push({p: project([x, h, z], cam), a: clamp((1 - e) / 0.45), rh});
    }
    for (let j = 0; j < M; j += 3) {
      const seg = pts.slice(j, j + 4); let a = 0, rh = 0, dz = 0;
      for (const s of seg) { a += s.a; rh = Math.max(rh, s.rh); dz += s.p[2]; }
      a /= seg.length; dz /= seg.length;
      if (a < 0.02) continue;
      if (cull) { const m = seg[1].p; if (Math.hypot(m[0] - cull.x, m[1] - cull.y) > cull.r) continue; }
      const cr = 0.6 * clamp(rh / 0.07);
      q.push(dz, () => line(ctx, seg.map(s => s.p), rgba(mix(GRID, CREST, cr), A * a * (0.75 + 0.4 * cr)), lw * seg[1].p[3]));
    }
  }
  // wavefront crest lines (one closed curve per ring, at the crest height), depth-sorted in chunks
  for (const r of (S.rings || [])) {
    if (r.R < 0.2 || r.A < 0.004) continue;              // inside ~Rs of the merged hole: hidden behind the disc
    const K = 96, pts = [];
    for (let j = 0; j <= K; j++) {
      const th = TAU * j / K, x = r.R * Math.cos(th), z = r.R * Math.sin(th);
      const [h] = sheetHeight(x, z, S), e = (x / ax) ** 2 + (z / az) ** 2;
      pts.push({p: project([x, h, z], cam), a: clamp((1 - e) / 0.35)});
    }
    const ca = (clamp(r.A / (RING_H * 0.35)) * 0.55 + 0.25) * smooth((r.R - 0.2) / 0.12);
    for (let j = 0; j < K; j += 4) {
      const seg = pts.slice(j, j + 5), a = seg.reduce((u, v) => u + v.a, 0) / seg.length;
      if (a < 0.02) continue;
      if (cull) { const m = seg[2].p; if (Math.hypot(m[0] - cull.x, m[1] - cull.y) > cull.r) continue; }
      q.push(seg.reduce((u, v) => u + v.p[2], 0) / seg.length + 0.005, () => line(ctx, seg.map(v => v.p), rgba(CREST, ca * a * Math.min(1, r.A / 0.01)), (1.6 + 1.4 * ca) * seg[2].p[3]));
    }
  }
  for (const b of (o.bodies || [])) q.push(b.depth, b.draw);
  q.flush();
}

/** Black hole: soft dim halo (not a horizon), black disc of radius Rs, thin bright photon-ring edge. */
function drawBH(ctx, x, y, r, {alpha = 1, wob = 0, rot = 0, halo = 1, edge = 1} = {}) {
  if (r <= 0.5 || alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  glow(ctx, x, y, r * 1.9, LIGHT, 0.16 * halo);
  ctx.beginPath(); ctx.ellipse(x, y, r * (1 + wob), r * (1 - wob), rot, 0, TAU); ctx.fillStyle = '#000000'; ctx.fill();
  if (edge > 0.01) {
    ctx.strokeStyle = rgba(LIGHT, 0.95 * edge); ctx.lineWidth = Math.max(1.4, r * 0.07); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, r * (1 + wob) + 2.5, r * (1 - wob) + 2.5, rot, 0, TAU); ctx.strokeStyle = rgba(LIGHT, 0.25 * edge); ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.restore();
}
function trackRing(ctx, x, y, r, a = 1) {
  withAlpha(ctx, a, () => {
    ring(ctx, x, y, r + 10, rgba(TRACK, 0.95), 2.5);
    for (let k = 0; k < 4; k++) { const th = k * Math.PI / 2 + Math.PI / 4; line(ctx, [[x + Math.cos(th) * (r + 14), y + Math.sin(th) * (r + 14)], [x + Math.cos(th) * (r + 22), y + Math.sin(th) * (r + 22)]], TRACK, 2.5); }
  });
}

/** The binary on the sheet at model time τ (rings from `map`). Returns screen data for labels/zoom. */
function binaryStage(stage, t, map, cam, o = {}) {
  const {ctx} = stage, tau = map.tau(t), B = binaryAt(tau), k = B.k;
  const wells = [];
  if (k < 1) {
    wells.push({x: B.p1[0], z: B.p1[1], D: WELL_D * M1 * (1 - k), s: wellSigma(M1)});
    wells.push({x: B.p2[0], z: B.p2[1], D: WELL_D * M2 * (1 - k), s: wellSigma(M2)});
  }
  if (k > 0) wells.push({x: 0, z: 0, D: WELL_D * MFIN * 1.15 * k, s: wellSigma(MFIN) * (1 + 0.5 * B.wob)});
  const S = {wells, rings: o.rings === false ? [] : ringsAt(t, map, o)};
  const place = (p, rs) => { const [h] = sheetHeight(p[0], p[1], S); return project([p[0], h + rs * 0.7, p[1]], cam); };
  const P1 = place(B.p1, B.rs1), P2 = place(B.p2, B.rs2), PF = place([0, 0], B.rsF);
  const scr = {P1, P2, PF, r1: B.rs1 * cam.scale * P1[3], r2: B.rs2 * cam.scale * P2[3], rF: B.rsF * cam.scale * PF[3]};
  const track = o.track !== false;
  const bodies = [
    {depth: P1[2], draw: () => drawBH(ctx, P1[0], P1[1], scr.r1, {alpha: 1 - k * k, edge: (1 - k) ** 3, halo: 1 - k})},
    {depth: P2[2], draw: () => { drawBH(ctx, P2[0], P2[1], scr.r2, {alpha: 1 - k * k, edge: (1 - k) ** 3, halo: 1 - k}); }},
  ];
  if (k > 0) bodies.push({depth: Math.max(PF[2], P1[2], P2[2]) + 0.01, draw: () => drawBH(ctx, PF[0], PF[1], scr.rF * Math.sqrt(k), {alpha: smooth(k * 1.5), wob: B.wob, rot: B.ph, edge: k * k})});
  drawSheet(stage, cam, S, {bodies, ...(o.sheet || {})});
  if (k > 0.6) bodies[bodies.length - 1].draw();   // merged horizon stays opaque: no sheet lines across it
  // tracking ring on top of everything (follows the smaller hole, then the merged one)
  const tx = lerp(P2[0], PF[0], k), ty = lerp(P2[1], PF[1], k), tr = lerp(scr.r2, scr.rF, k);
  if (track) trackRing(ctx, tx, ty, tr, o.trackAlpha ?? 1);
  return {B, S, scr, track: [tx, ty, tr], tau};
}

const fmt = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});

/** middle strip: magnifier on the tracked hole + radial cross-section of wavefront heights */
function zoomStrip(stage, t, map, cam, st, y0 = 872, h = 178) {
  const {ctx} = stage, T = stage.theme, x0 = 60, x1 = 940;
  rect(ctx, x0, y0, x1 - x0, h, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
  // magnifier
  const mx = 158, my = y0 + h / 2 - 6, mr = 74, Z = 1.7, [tx, ty] = st.track;
  line(ctx, [[tx, ty + st.track[2] + 24], [mx, my - mr - 2]], rgba(TRACK, 0.55), 1.5, {dash: [5, 6]});
  clipEllipse(ctx, mx, my, mr, mr, () => {
    ctx.fillStyle = T.deep; ctx.fillRect(mx - mr, my - mr, 2 * mr, 2 * mr);
    ctx.save(); ctx.translate(mx, my); ctx.scale(Z, Z); ctx.translate(-tx, -ty);
    const B = st.B, k = B.k, s = st.scr, ctx2 = ctx;
    const bodies = [
      {depth: s.P1[2], draw: () => drawBH(ctx2, s.P1[0], s.P1[1], s.r1, {alpha: 1 - k * k, edge: (1 - k) ** 3, halo: 1 - k})},
      {depth: s.P2[2], draw: () => drawBH(ctx2, s.P2[0], s.P2[1], s.r2, {alpha: 1 - k * k, edge: (1 - k) ** 3, halo: 1 - k})},
    ];
    if (k > 0) bodies.push({depth: Math.max(s.PF[2], s.P1[2], s.P2[2]) + 0.01, draw: () => drawBH(ctx2, s.PF[0], s.PF[1], s.rF * Math.sqrt(k), {alpha: smooth(k * 1.5), wob: B.wob, rot: B.ph, edge: k * k})});
    drawSheet(stage, cam, st.S, {bodies, cull: {x: tx, y: ty, r: mr / Z + 40}, width: 1.1, alpha: 0.75});
    for (const b of bodies) b.draw();   // discs on top inside the magnifier: no sheet lines across a horizon
    ctx.restore();
  });
  ring(ctx, mx, my, mr, rgba(TRACK, 0.95), 2.5);
  stage.text('확대 ×1.7', mx, y0 + h - 9, {size: 24, color: T.muted, align: 'center'});
  // cross-section of ring heights along the ray through the tracked hole
  const px0 = 262, px1 = 925, base = y0 + 96, dMax = 1.55, toX = d => px0 + (px1 - px0) * d / dMax;
  stage.text('단면: 추적한 블랙홀 쪽 파면 높이', px0, y0 + 22, {size: 24, color: T.muted});
  line(ctx, [[px0, base], [px1, base]], rgba(T.border, 1), 1.5);
  const pts = [];
  for (let i = 0; i <= 220; i++) {
    const d = dMax * i / 220; let rh = 0;
    for (const r of st.S.rings) { const u = (d - r.R) / r.w; if (u * u < 9) rh += r.A * Math.exp(-u * u); }
    rh /= 1 + d / 0.7;
    pts.push([toX(d), base - clamp(rh / RING_H * 95, -60, 62)]);
  }
  line(ctx, pts, rgba(CREST, 0.95), 2.5);
  // tracked hole position on the ray
  const dT = Math.hypot(...(st.B.k < 1 ? st.B.p2 : [0, 0])) * (1 - st.B.k);
  line(ctx, [[toX(dT), base - 10], [toX(dT), base + 10]], TRACK, 3);
  // bracket between the two newest crests that are clear of the orbit
  const rs = st.S.rings.filter(r => r.R > dT + 0.05 && r.R < dMax - 0.05).sort((a, b) => a.R - b.R);
  const T2ms = 1000 / st.B.f;
  if (rs.length >= 2 && st.tau < 0) {
    const a = toX(rs[0].R), b = toX(rs[1].R), yb = y0 + 46;
    line(ctx, [[a, yb + 8], [a, yb], [b, yb], [b, yb + 8]], rgba(T.ink, 0.85), 2);
  }
  const lbl = st.tau < 0 ? `파면 간격 = 공전 주기의 절반 = 1/f_gw = ${fmt(T2ms, 1)} ms (실제)` : '링다운 파면: 약 250 Hz · 4 ms (실제)';
  stage.text(lbl, px0, y0 + h - 20, {size: 24, color: T.ink, maxWidth: px1 - px0});
}

/** bottom readouts: r, f_gw, v/c + scrolling waveform + power bar (all from the model at τ) */
function readouts(stage, t, map, st, o = {}) {
  const {ctx} = stage, T = stage.theme, y0 = o.y0 ?? 1060, h = 206, B = st.B, tau = st.tau, hi = o.hi || {};
  rect(ctx, 60, y0, 880, h, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5);
  const merged = tau > 0;
  const rows = [
    ['r', '궤도 거리 r', merged ? '병합' : `${fmt(B.rKm)} km`],
    ['f', '중력파 f_gw', `${fmt(B.f, 0)} Hz`, merged ? '링다운 진동수' : `공전 ${fmt(B.f / 2, 0)}바퀴/초`],
    merged ? ['v', '최종 질량', `${MFIN} M☉`] : ['v', '상대 속도 v/c', fmt(B.v, 2)],
  ];
  rows.forEach(([key, lab, val, sub], i) => {
    const y = y0 + 32 + i * 56, on = hi[key] ?? 0;
    if (on > 0) rect(ctx, 66, y - 26, 300, 54, 6, rgba(T.accent, 0.16 * on));
    stage.text(lab, 78, sub ? y - 14 : y, {size: 24, color: on > 0.5 ? T.ink : T.muted});
    stage.text(val, 356, y, {role: 'display', weight: 500, size: 36, color: on > 0.5 ? T.light : T.ink, align: 'right'});
    if (sub) stage.text(sub, 78, y + 15, {size: 24, color: T.muted, alpha: 0.9});
  });
  // waveform
  const wx0 = 384, wx1 = 924, wy = y0 + 76, wa = 36, win = 0.12;
  const tauNow = Math.min(tau, RD_LEN + 0.035), frozen = tau > RD_LEN + 0.035;
  stage.text('h(t) · 최근 0.12초 (실제 시간)', wx0, y0 + 20, {size: 24, color: T.muted});
  line(ctx, [[wx0, wy], [wx1, wy]], rgba(T.border, 1), 1);
  const pts = [];
  for (let i = 0; i <= 360; i++) { const tt = tauNow - win + win * i / 360; pts.push([wx0 + (wx1 - wx0) * i / 360, wy - wa * hAt(tt)]); }
  line(ctx, pts, rgba(WAVE, 1), 2.2);
  if (tauNow - win < 0 && tauNow > 0) { const x = wx0 + (wx1 - wx0) * (0 - (tauNow - win)) / win; line(ctx, [[x, wy - wa - 8], [x, wy + wa + 4]], rgba(T.ink, 0.6), 1.5, {dash: [4, 4]}); stage.text('병합 τ = 0', x - 8, y0 + 20, {size: 24, color: T.ink, align: 'right'}); }
  if (!frozen) { line(ctx, [[wx1, wy - wa - 6], [wx1, wy + wa + 6]], TRACK, 2.5); stage.text('지금', wx1 - 6, wy + wa + 2, {size: 24, color: TRACK, align: 'right'}); }
  // power bar
  const pw = powerAt(tau), py = y0 + 140, on = hi.p ?? 0;
  stage.text('방출 출력(상대값)', wx0, py, {size: 24, color: on > 0.5 ? T.ink : T.muted});
  const bx0 = 590, bw = wx1 - bx0;
  rect(ctx, bx0, py - 8, bw, 16, 4, rgba(T.border, 1));
  rect(ctx, bx0, py - 8, Math.max(3, bw * clamp(pw)), 16, 4, on > 0.5 ? T.accent : T.light);
  const ratio = pw / powerAt(TAU0);
  if (tau < 0) stage.text(`처음의 ${ratio < 10 ? fmt(ratio, 1) : fmt(ratio)}배`, wx1, y0 + h - 22, {size: 24, color: T.muted, align: 'right'});
  stage.text('소리 = 모형의 중력파 진동수(설명용) · 우주의 소리 아님', 78, y0 + h - 22, {size: 24, color: T.accent2});
}

const footExag = '격자·파면 높이는 설명용 과장';
/** text with a manually raised exponent (the fallback font's superscript zero looks like 'º') */
function textSup(stage, parts, x, y, o = {}) {
  let xx = x; const size = o.size || 24;
  for (const [str, sup] of parts) xx += stage.text(str, xx, sup ? y - size * 0.35 : y, {...o, size: sup ? Math.round(size * 0.68) : size, align: 'left'});
}
function foot2(stage, a, b) { sourceLine(stage, a, {y: stage.safe.captionTop - 64, size: 24}); sourceLine(stage, b, {size: 24}); }

let staleWarned = false;
function checkChirpTable(ctx, map) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'chirp');
  const pts = e?.params?.points;
  if (!pts) { console.warn('warning: sound.json has no chirp points — run scenes.mjs --emit-chirp'); return; }
  const expect = map.t(RD_LEN) - map.tA, last = pts.findLast(p => p[2] > 0.5) || pts[pts.length - 1];
  const tMerge = map.tM - map.tA, ok = Math.abs(e.time - map.tA) < 1e-3 && pts.some(p => Math.abs(p[0] - tMerge) < 0.05);
  if (!ok || pts[pts.length - 1][0] < expect - 0.05) console.warn('warning: chirp table in sound.json is stale — run node episodes/gravitational-waves/scenes.mjs --emit-chirp');
  void last;
}

// =====================================================================================================
// Scenes
// =====================================================================================================
function mapOf(ctx) { return ctx._map || (ctx._map = chirpMap(ctx.tl, ctx.events)); }
const sentOn = (ctx, t, id, rampIn = 0.3) => { const s = ctx.tl.sentence(id); return smooth((t - s.start + 0.2) / rampIn) * (1 - smooth((t - s.end - 0.6) / 0.5)); };

export const scenes = {
  hook(stage, t, p, ctx) {
    const base = mapOf(ctx), map = shiftedMap(base, ctx.tl.at('hook:end'), TAU0 - 0.02);
    const cam = {...camM, scale: 330, cy: 860};
    const st = binaryStage(stage, t, map, cam, {track: false, sheet: {fadeX: 1.5, fadeZ: 1.15}});
    const a = smooth((p - 0.08) / 0.1), mid = [(st.scr.P1[0] + st.scr.P2[0]) / 2, (st.scr.P1[1] + st.scr.P2[1]) / 2];
    leader(stage, '두 블랙홀', [st.scr.P1[0], st.scr.P1[1] - st.scr.r1 - 6], [720, 520], {alpha: a, sub: `태양의 ${M1}배 · ${M2}배`});
    void mid;
    sourceLine(stage, `${footExag} · 실제 시간의 약 ${base.label}배 느리게`, {size: 24});
  },

  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const cur = tl.lastSentence(t)?.id || 's03';
    // 1) 重力波 — glyph split
    const ety = cur === 's03' ? 1 : 0.55, glyphs = [['重', '무거울 중'], ['力', '힘 력'], ['波', '물결 파']];
    glyphs.forEach(([g, r], i) => {
      const x = 200 + i * 300, y = 360, a = smooth((t - tl.at('s03') - i * 0.5) / 0.4);
      withAlpha(c, a, () => {
        rect(c, x - 110, y - 82, 220, 200, 8, rgba(T.plate, 0.85), rgba(i === 2 && cur === 's03' ? WAVE : T.border, 1), 1.5);
        stage.text(g, x, y - 6, {size: 104, weight: 700, color: rgba(T.ink, ety + 0.2), align: 'center'});
        stage.text(r, x, y + 84, {size: 30, weight: 500, color: i === 2 ? WAVE : T.muted, align: 'center'});
      });
    });
    stage.text('영어 gravitational wave · 수면의 중력파(gravity wave)와 다른 말', 500, 552, {size: 24, color: T.muted, align: 'center', alpha: smooth((t - tl.at('s03') - 2) / 0.6)});
    // 2) timeline strip
    const nodes = [[1915, '일반상대성', '이론', 's04'], [1916, '중력파', '예측', 's04'], [1936, '아인슈타인의', '의심', 's04'],
      [1974, '헐스·테일러', '쌍성 펄서', 's05'], [1993, '노벨', '물리학상', 's06'], [2015, 'LIGO', '첫 검출', 's06']];
    const order = ['s03', 's04', 's05', 's06'], ci = order.indexOf(cur), ly = 690;
    line(c, [[80, ly], [920, ly]], rgba(T.border, 1), 3);
    nodes.forEach(([yr, l1, l2, sid], i) => {
      const x = 120 + i * 152, si = order.indexOf(sid), on = si === ci ? 1 : 0, past = si < ci;
      const a = si <= ci ? 1 : 0.35, col = on ? T.accent : past ? T.ink : T.muted;
      withAlpha(c, a, () => {
        circle(c, x, ly, on ? 11 : 8, col); if (on) ring(c, x, ly, 18, rgba(T.accent, 0.6), 2);
        stage.text(String(yr), x, ly - 40, {role: 'display', weight: 700, size: 32, color: col, align: 'center'});
        stage.text(l1, x, ly + 40, {size: 24, color: on ? T.ink : T.muted, align: 'center', weight: on ? 500 : 400});
        stage.text(l2, x, ly + 70, {size: 24, color: on ? T.ink : T.muted, align: 'center', weight: on ? 500 : 400});
      });
    });
    // 41-year bracket (s06)
    const b41 = smooth((t - tl.at('s06') - 3.5) / 0.6);
    withAlpha(c, b41, () => {
      const xa = 120 + 3 * 152, xb = 120 + 5 * 152, yb = ly + 108;
      line(c, [[xa, yb - 8], [xa, yb], [xb, yb], [xb, yb - 8]], rgba(T.accent, 0.9), 2);
      stage.text('간접 증거 → 직접 검출 41년', (xa + xb) / 2, yb + 26, {size: 24, color: T.accent, align: 'center'});
    });
    // 3) binary-pulsar plot (shape only)
    const pa = smooth((t - tl.at('s05') - 0.5) / 0.8) * 0.85 + 0.15;
    withAlpha(c, pa, () => {
      const X0 = 190, X1 = 900, Y0 = 960, Y1 = 1250;
      stage.text('쌍성 펄서 공전 주기 변화 — 예측 곡선 위의 관측점', 80, 900, {size: 28, weight: 500, color: T.ink});
      line(c, [[X0, Y0 - 10], [X0, Y1], [X1, Y1]], rgba(T.muted, 0.9), 2);
      stage.text('누적 변화', X0 - 14, Y0 + 10, {size: 24, color: T.muted, align: 'right'});
      stage.text('연도 →', X1, Y1 + 26, {size: 24, color: T.muted, align: 'right'});
      const fx = u => [X0 + (X1 - X0) * u, Y0 + 20 + (Y1 - Y0 - 40) * u * u];
      const curve = []; for (let i = 0; i <= 60; i++) curve.push(fx(i / 60));
      line(c, curve, rgba(T.accent2, 0.9), 3);
      stage.text('일반상대성이론 예측', X1 - 10, fx(0.78)[1] - 70, {size: 24, color: T.accent2, align: 'right'});
      const ns = 16, show = clamp((t - tl.at('s05') - 1.5) / 5);
      for (let i = 0; i < ns; i++) {
        if (i / ns > show) break;
        const u = 0.04 + 0.9 * i / (ns - 1), [x, y] = fx(u), dy = Math.sin(i * 12.9898) * 6;
        circle(c, x, y + dy, 7, T.ink); ring(c, x, y + dy, 7, rgba(T.bg, 1), 1.5);
      }
      // the pulsar pair (two neutron stars), inset
      const ix = 330, iy = 1110, ph = t * 1.4;
      ring(c, ix, iy, 46, rgba(T.border, 1), 1.5);
      circle(c, ix + 46 * Math.cos(ph), iy + 18 * Math.sin(ph), 7, LIGHT); circle(c, ix - 46 * Math.cos(ph), iy - 18 * Math.sin(ph), 7, LIGHT);
      stage.text('PSR B1913+16 · 중성자별 둘', ix, iy + 52, {size: 24, color: T.muted, align: 'center'});
      stage.text('주기 감소 ≈ 연 76 μs', ix, iy + 82, {size: 24, color: T.muted, align: 'center'});
    });
    sourceLine(stage, '아래 그래프: 모양만 보여주는 그림 · 축 값 생략 (Weisberg & Huang 2016)', {size: 24});
  },

  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, base = mapOf(ctx);
    const map = shiftedMap(base, tl.at('essence'), TAU0 - 0.25);
    const sp = easeInOut((t - tl.at('s08') + 0.2) / 1.2);           // 0: one big stage, 1: split comparison
    const camR = {...camM, scale: lerp(300, 165, sp), cx: lerp(500, 728, sp), cy: lerp(760, 790, sp)};
    // left: symmetric spinning sphere — static well, no ripples
    if (sp > 0) withAlpha(c, sp, () => {
      const camL = {...camR, cx: 272};
      const R = 0.30, Sx = {wells: [{x: 0, z: 0, D: WELL_D * MTOT, s: wellSigma(MTOT)}], rings: []};
      const [h0] = sheetHeight(0, 0, Sx), P = project([0, h0 + R * 0.7, 0], camL), rp = R * camL.scale * P[3];
      drawSheet(stage, camL, Sx, {fadeX: 1.35, fadeZ: 1.0, ext: 1.5, n: 18, bodies: [{depth: P[2], draw: () => {
        sphere(c, P[0], P[1], rp, '#B8A994', {shade: '#2a2620'});
        for (let k = 0; k < 6; k++) {   // meridians rotating: spin is visible, shape does not change
          const a = (k / 6) * Math.PI + t * 1.6, w = Math.cos(a);
          if (Math.sin(a) < 0) continue;
          c.beginPath(); c.ellipse(P[0], P[1], Math.abs(w) * rp, rp, 0, 0, TAU); c.strokeStyle = rgba('#2a2620', 0.45); c.lineWidth = 1.5; c.stroke();
        }
      }}]});
      drawLabel(stage, '대칭 회전 — 파동 없음', 272, 1110, {size: 30, align: 'center'});
      stage.text('모양이 그대로인 공', 272, 1150, {size: 24, color: T.muted, align: 'center'});
    });
    const st = binaryStage(stage, t, map, camR, {track: false, sheet: sp > 0 ? {fadeX: lerp(1.55, 1.35, sp), fadeZ: lerp(1.15, 1.0, sp), ext: 1.5, n: 22} : {fadeX: 1.55, fadeZ: 1.15}});
    if (sp > 0) withAlpha(c, sp, () => {
      drawLabel(stage, '모양이 바뀌는 질량 — 파동', 728, 1110, {size: 30, align: 'center', key: WAVE});
      stage.text('서로 도는 두 덩어리', 728, 1150, {size: 24, color: T.muted, align: 'center'});
      line(c, [[500, 560], [500, 1170]], rgba(T.border, 1), 2);
    });
    // s07: one wavefront, followed by a marker "빛의 속도 c"
    const mk = 1 - sp;
    if (mk > 0 && st.S.rings.length) {
      const tSel = tl.at('s07') + 1.0;
      const r = st.S.rings.filter(x => map.t(x.tauK) <= tSel).sort((a, b) => b.tauK - a.tauK)[0] || st.S.rings[0];
      const th = 0.75, x = r.R * Math.cos(th), z = r.R * Math.sin(th);
      const [h] = sheetHeight(x, z, st.S), P = project([x, h, z], camR), Q = project([x + 0.25 * Math.cos(th), h, z + 0.25 * Math.sin(th)], camR);
      const a = mk * smooth((t - tl.at('s07') - 1.5) / 0.6) * (1 - smooth((r.R - 1.25) / 0.2));
      withAlpha(c, a, () => {
        arrow(c, P, Q, T.accent, 3.5);
        const lx = Math.min(Q[0] - 20, 620), ly = Q[1] + 40;
        stage.text('빛의 속도 c', lx, ly, {role: 'display', weight: 700, size: 34, color: T.accent});
        stage.text('휘어짐의 변화가 퍼져 나감', lx, ly + 38, {size: 24, color: T.ink});
      });
    }
    sourceLine(stage, `${footExag} · 파면 속도는 화면용 · 실제는 빛의 속도`, {size: 24});
  },

  mechanism(stage, t, p, ctx) {
    const map = mapOf(ctx); checkChirpTable(ctx, map);
    const st = binaryStage(stage, t, map, camM);
    const T = stage.theme, tl = ctx.tl, {ctx: c} = stage;
    // stage labels
    const n2 = Math.floor((phiAt(st.tau) - phiAt(TAU0)) / Math.PI), nOrb = Math.floor(n2 / 2);
    const s9 = sentOn(ctx, t, 's09');
    drawLabel(stage, '파면: 한 바퀴에 두 번', 932, 300, {size: 28, align: 'right', key: WAVE, color: s9 > 0.5 ? T.light : T.ink});
    stage.text(`공전 ${nOrb}바퀴 · 파면 ${n2}개`, 932, 340, {size: 24, color: s9 > 0.5 ? T.ink : T.muted, align: 'right'});
    const la = smooth((t - map.tA - 0.8) / 0.5) * (1 - smooth((t - tl.at('s09:end')) / 0.6));
    const [tx, ty, tr] = st.track;
    leader(stage, '추적 표식', [tx - tr - 12, ty - 6], [150, 300], {alpha: la, color: TRACK, size: 28, sub: `작은 블랙홀 ${M2} M☉`});
    const sa = 1 - smooth((st.B.rKm - 500) / -150);
    withAlpha(c, sa * (1 - la), () => {
      stage.text(`${M1} M☉`, st.scr.P1[0], st.scr.P1[1] - st.scr.r1 - 26, {size: 24, color: T.muted, align: 'center'});
    });
    zoomStrip(stage, t, map, camM, st);
    readouts(stage, t, map, st, {hi: {f: s9, r: sentOn(ctx, t, 's10'), p: sentOn(ctx, t, 's11'), v: sentOn(ctx, t, 's12')}});
    foot2(stage, `${footExag} · 파면 간격·속도는 화면용(실제 파장 1,200~12,500 km)`, `모형: Peters(1964) 점질량 원궤도 · Mc ${MC} M☉ · 블랙홀 크기 = 슈바르츠실트 반지름(같은 축척)`);
  },

  merger(stage, t, p, ctx) {
    const map = mapOf(ctx), T = stage.theme, {ctx: c} = stage;
    const st = binaryStage(stage, t, map, camM);
    const ar = smooth((st.tau - 0.0005) / 0.004);
    // hard switch (no simultaneous cross-fade at the same position → no ghosted double text)
    if (ar < 0.5) {
      withAlpha(c, 1 - 2 * ar, () => drawLabel(stage, '처프 — 진동수와 세기가 함께 상승', 500, 300, {size: 30, align: 'center', key: WAVE}));
    } else {
      withAlpha(c, 2 * ar - 1, () => {
        drawLabel(stage, '링다운 — 약 250 Hz, 수 ms 만에 감쇠', 500, 300, {size: 30, align: 'center', key: WAVE});
        stage.text(`하나가 된 블랙홀 ${MFIN} M☉ · 반지름 ${fmt(RSF)} km`, 500, 340, {size: 24, color: T.muted, align: 'center'});
      });
    }
    zoomStrip(stage, t, map, camM, st);
    readouts(stage, t, map, st, {hi: {f: 1 - ar, p: 1 - ar}});
    foot2(stage, `${footExag} · 병합 순간(±수 ms)은 점질량 모형 밖 — 그림은 보간`, `링다운: h = e^(−τ/4 ms) · cos(2π·250 Hz·τ) · 모형: Peters(1964), Mc ${MC} M☉`);
  },

  detect(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, base = mapOf(ctx);
    // replay of the same model chirp, same slow-motion factor; peak lands on "흔들었고" in s17
    let tPeak; try { tPeak = tl.at({sentence: 's17', word: '흔들었고'}); } catch { tPeak = tl.at('s17:mid'); }
    const map = shiftedMap(base, tPeak, 0), tau = map.tau(t), hd = 0.10 * hAt(Math.max(tau, TAU_MIN));
    const cx = 200, cy = 820, L = 500;
    const Lx = L * (1 + hd), Ly = L * (1 - hd);
    const tube = (x0, y0, x1, y1) => { line(c, [[x0, y0], [x1, y1]], rgba(T.border, 1), 26, {cap: 'butt'}); line(c, [[x0, y0], [x1, y1]], rgba(T.plate, 1), 20, {cap: 'butt'}); };
    tube(cx, cy, cx + L * 1.12, cy); tube(cx, cy, cx, cy - L * 1.12);
    // nominal end positions
    line(c, [[cx + L, cy - 30], [cx + L, cy + 30]], rgba(T.muted, 0.7), 1.5, {dash: [4, 4]});
    line(c, [[cx - 30, cy - L], [cx + 30, cy - L]], rgba(T.muted, 0.7), 1.5, {dash: [4, 4]});
    // laser beams
    const beam = rgba('#FF6B4A', 0.9);
    line(c, [[70, cy], [cx, cy]], beam, 3); line(c, [[cx, cy], [cx + Lx, cy]], beam, 3); line(c, [[cx, cy], [cx, cy - Ly]], beam, 3);
    line(c, [[cx, cy], [cx, cy + 120]], rgba('#FF6B4A', 0.5 + 2 * Math.abs(hd)), 3, {dash: [6, 5]});
    // mirrors (test masses)
    rect(c, cx + Lx - 4, cy - 26, 14, 52, 3, LIGHT); rect(c, cx - 26, cy - Ly - 10, 52, 14, 3, LIGHT);
    // beam splitter
    c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 4); rect(c, -24, -4, 48, 8, 2, rgba('#CFE6EE', 0.95)); c.restore();
    rect(c, 40, cy - 16, 30, 32, 4, '#3a2a28', rgba('#FF6B4A', 1), 2);
    rect(c, cx - 18, cy + 120, 36, 26, 4, '#22343b', rgba(T.ink, 0.9), 2);
    stage.text('레이저', 55, cy + 42, {size: 24, color: T.muted, align: 'center'});
    stage.text('빔 분할기', cx + 30, cy + 44, {size: 24, color: T.muted});
    stage.text('광검출기', cx + 30, cy + 134, {size: 24, color: T.muted});
    stage.text('거울', cx + Lx + 14, cy - 40, {size: 24, color: T.muted, align: 'center'});
    stage.text('거울', cx + 44, cy - Ly - 4, {size: 24, color: T.muted});
    stage.text('팔 4 km', cx + L / 2, cy + 40, {size: 26, weight: 500, color: T.ink, align: 'center'});
    c.save(); c.translate(cx - 40, cy - L / 2); c.rotate(-Math.PI / 2); stage.text('팔 4 km', 0, 0, {size: 26, weight: 500, color: T.ink, align: 'center'}); c.restore();
    // stretch indicators
    const sx = hd > 0 ? '늘어남' : '줄어듦', sy = hd > 0 ? '줄어듦' : '늘어남', ia = clamp(Math.abs(hd) / 0.02);
    stage.text(sx, cx + L + 4, cy + 44, {size: 24, color: hd > 0 ? T.up : T.down, alpha: ia, align: 'center'});
    stage.text(sy, cx - 30, cy - L + 24, {size: 24, color: hd > 0 ? T.down : T.up, alpha: ia, align: 'right'});
    // detector output inside the L
    const gx0 = 290, gx1 = 900, gy = 540, ga = 52, win = 0.14, tauN = Math.min(tau, RD_LEN + 0.04);
    rect(c, gx0 - 16, gy - 108, gx1 - gx0 + 32, 196, 10, rgba(T.plate, 0.85), rgba(T.border, 1), 1.5);
    stage.text('광검출기 출력 ∝ h(t) · 같은 모형 재생', gx0, gy - 84, {size: 24, color: T.muted});
    line(c, [[gx0, gy], [gx1, gy]], rgba(T.border, 1), 1);
    const pts = []; for (let i = 0; i <= 300; i++) { const tt = tauN - win + win * i / 300; pts.push([gx0 + (gx1 - gx0) * i / 300, gy - ga * (tt < TAU_MIN ? 0 : hAt(tt))]); }
    line(c, pts, WAVE, 2.2);
    if (tau < RD_LEN + 0.04) line(c, [[gx1, gy - ga - 4], [gx1, gy + ga + 4]], TRACK, 2.5);
    stage.text('h 최대 ≈ 1.0×10⁻²¹', gx1, gy + 72, {size: 24, color: T.ink, align: 'right'});
    // fact cards (appear by sentence)
    const cards = [
      ['s15', '13억 광년', '약 410 Mpc · 신호가 온 거리'],
      ['s15b', '36 + 29 → 62 M☉', '합쳐진 블랙홀 (태양 질량 기준)'],
      ['s16', '3 M☉ → 중력파', '0.2초 동안 · 최대 출력 3.6×10⁴⁹ W'],
      ['s17', '≈ 4×10⁻¹⁸ m', '4 km 팔 길이 변화 · 양성자 지름의 약 1/400'],
    ];
    cards.forEach(([sid, big, small], i) => {
      const x = 60 + (i % 2) * 446, y = 1010 + Math.floor(i / 2) * 124, s = tl.sentence(sid);
      const a = smooth((t - s.start + 0.1) / 0.4), on = t >= s.start - 0.1 && t < s.end + 0.8;
      withAlpha(c, a, () => {
        rect(c, x, y, 434, 112, 8, rgba(T.plate, 0.92), on ? T.accent : rgba(T.border, 1), on ? 2.5 : 1.5);
        stage.text(big, x + 20, y + 40, {role: 'display', weight: 700, size: 38, color: on ? T.light : T.ink, maxWidth: 400});
        stage.text(small, x + 20, y + 82, {size: 24, color: T.muted, maxWidth: 400});
      });
    });
    textSup(stage, [['팔 늘고 줄기는 약 10', false], ['20', true], ['배 과장 · 신호는 같은 모형을 같은 배율로 다시 재생', false]], stage.safe.left + 6, stage.safe.captionTop - 64, {size: 24, color: T.muted, alpha: 0.9});
    sourceLine(stage, '자료: LIGO Scientific Collaboration, PRL 116, 061102 (2016)', {size: 24});
  },

  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, base = mapOf(ctx), tl = ctx.tl;
    const s = tl.sentence('s18'), q = clamp((t - s.start) / (s.end - s.start));
    // 1) space: binary + rings, a speaker crossed out
    rect(c, 60, 300, 880, 270, 10, rgba(T.deep, 0.9), rgba(T.border, 1), 1.5);
    stage.text('우주 공간 (진공)', 84, 330, {size: 26, weight: 500, color: T.muted});
    const map = shiftedMap(base, s.end + 2, TAU0 * 0.3);
    const camS = {...camM, scale: 120, cx: 330, cy: 450};
    clipRect(c, 61, 301, 878, 268, 10, () => binaryStage(stage, t, map, camS, {track: false, sheet: {n: 18, fadeX: 1.6, fadeZ: 1.2, ext: 1.7, width: 1.2}}));
    const spk = (x, y, sc, col) => {
      rect(c, x - 24 * sc, y - 13 * sc, 16 * sc, 26 * sc, 2, rgba(col, 0.25), col, 3);
      poly(c, [[x - 8 * sc, y - 13 * sc], [x + 16 * sc, y - 32 * sc], [x + 16 * sc, y + 32 * sc], [x - 8 * sc, y + 13 * sc]], rgba(col, 0.25), col, 3);
    };
    const sx = 720, sy = 440;
    spk(sx, sy, 1.3, T.muted);
    line(c, [[sx - 50, sy - 50], [sx + 50, sy + 50]], T.accent, 4); line(c, [[sx + 50, sy - 50], [sx - 50, sy + 50]], T.accent, 4);
    stage.text('진공에서는 소리가 전달되지 않습니다', 720, 528, {size: 24, color: T.ink, align: 'center'});
    // 2) flow: space stretches → measured with light → numbers → converted to sound
    const step = (i, x, y, title, sub) => {
      const a = smooth((q - 0.12 - i * 0.14) / 0.06);
      withAlpha(c, a, () => {
        stage.text(title, x, y, {role: 'display', weight: 700, size: 34, color: T.ink});
        if (sub) stage.text(sub, x, y + 38, {size: 24, color: T.muted});
      });
      return a;
    };
    const a1 = step(0, 120, 640, '① 공간이 늘고 줄어듦', '중력파가 빛의 속도로 지구에 도착');
    withAlpha(c, a1, () => arrow(c, [90, 600], [90, 700], T.muted, 3));
    const a2 = step(1, 120, 760, '② 레이저 간섭계가 빛으로 잼', '팔 길이 차이 → 빛의 간섭 무늬 변화');
    withAlpha(c, a2, () => arrow(c, [90, 720], [90, 820], T.muted, 3));
    const a3 = step(2, 120, 880, '③ 빛으로 잰 숫자 h(t)', '');
    withAlpha(c, a3, () => {
      const y = 940, x0 = 120, x1 = 900, pts = [];
      rect(c, x0 - 10, y - 30, x1 - x0 + 20, 60, 6, rgba(T.plate, 0.9), rgba(T.border, 1), 1);
      for (let i = 0; i <= 260; i++) { const tt = -0.12 + 0.13 * i / 260; pts.push([x0 + (x1 - x0) * i / 260, y - 22 * hAt(tt)]); }
      line(c, pts, WAVE, 2);
      stage.text('…, 0.21, −0.48, 0.93, −0.71, … (×10⁻²¹)', x0, y + 56, {size: 24, color: T.muted});
    });
    const a4 = step(3, 120, 1070, '④ 사람이 듣기 좋게 소리로 변환', '');
    withAlpha(c, a4, () => {
      arrow(c, [90, 980], [90, 1050], T.muted, 3);
      drawLabel(stage, '소리로 변환', 640, 1070, {size: 28, key: T.accent});
      spk(700, 1160, 1.0, T.ink);
      for (let k = 0; k < 3; k++) ring(c, 700, 1160, 40 + 18 * k + 6 * Math.sin(t * 4 - k), rgba(T.ink, 0.5 - 0.12 * k), 2, -0.7, 0.7);
      stage.text('지구 위 스피커', 700, 1230, {size: 24, color: T.muted, align: 'center'});
      stage.text('빛으로 잰 숫자를 소리로 바꾼 것', 120, 1150, {size: 28, weight: 500, color: T.light});
    });
    sourceLine(stage, '진공에서는 소리가 전달되지 않습니다 · 들은 것은 빛으로 잰 숫자를 바꾼 소리', {size: 24});
  },

  close(stage, t, p, ctx) {
    const T = stage.theme, {ctx: c} = stage;
    stage.text('정리', 500, 400, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, alpha: smooth(p / 0.15)});
    endCard(stage, {kicker: '', takeaway: '“질량이 흔들리면 공간이 출렁이고, 그 출렁임은 빛의 속도로 퍼져 나간다”', lines: [], p, y: 560});
    const a = smooth((p - 0.15) / 0.15);
    withAlpha(c, a, () => {
      stage.text('자료: LIGO/Virgo, GW150914 · Phys. Rev. Lett. 116, 061102 (2016)', 500, 900, {size: 26, color: T.muted, align: 'center', maxWidth: 860});
      stage.text('모형: Peters(1964) 점질량 원궤도 근사 · 격자·파면은 설명용 과장', 500, 945, {size: 24, color: T.muted, align: 'center', maxWidth: 860});
      const lines = stage.wrap('음악: ' + MUSIC_CREDIT, {size: 24, maxWidth: 840});
      lines.forEach((l, i) => stage.text(l, 500, 1180 + i * 34, {size: 24, color: rgba(T.muted, 1), align: 'center', alpha: 0.85}));
    });
    // the merged black hole, quiet
    const camC = {...camM, scale: 150, cy: 1060};
    const map = shiftedMap(mapOf(ctx), ctx.tl.at('close'), RD_LEN + 2);
    withAlpha(c, 0.7 * a, () => binaryStage(stage, t, map, camC, {track: false, rings: false, sheet: {n: 18, fadeX: 1.4, fadeZ: 0.55, ext: 1.5, width: 1.1, alpha: 0.4}}));
  },
};

const MUSIC_CREDIT = (() => {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const reg = JSON.parse(fs.readFileSync(path.join(process.env.SCISHORT_ROOT || root, 'assets/music/registry.json'), 'utf8'));
    return reg.tracks.zabriskie_patriarch.attribution;
  } catch { return '"The Life and Death of a Certain K. Zabriskie, Patriarch" by Chris Zabriskie (CC BY 4.0)'; }
})();

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id;
  if (id === 'mechanism' || id === 'merger') {
    const N = mapOf(ctx).label;
    header(stage, {kicker: id === 'mechanism' ? `메커니즘 · 실제 0.5초를 ${N}× 느리게` : `병합 · 같은 배율 ${N}× 느리게`,
      title: id === 'mechanism' ? '에너지를 잃으며 조여드는 궤도' : '처프, 그리고 링다운', size: 50, p: ctx.scene.p});
  } else {
    const [kicker, title, subtitle] = titles[id] || ['', '', ''];
    if (title || kicker) header(stage, {kicker, title, subtitle, p: ctx.scene.p, size: title.includes('\n') ? 64 : 58});
  }
  progressBar(stage, t, ctx.tl.duration);
}

// =====================================================================================================
// --emit-chirp: write the chirp tone table (real f_gw, amplitude ∝ f_gw^(2/3), slow-motion timing) into sound.json
// =====================================================================================================
export function chirpPoints(map) {
  const pts = [], tr = tau => +(map.t(tau) - map.tA).toFixed(4);
  pts.push([0, F0, 0]);
  let tau = TAU0 + 0.012 / map.N * 60;                    // short fade-in
  while (tau < -0.0012) { pts.push([tr(tau), +fgw(tau).toFixed(2), +envAt(tau).toFixed(4)]); tau += Math.max(0.0133 * (-tau), 0.0002); }
  for (let k = 0; k <= 50; k++) { const tt = -0.0012 + (RD_LEN + 0.0012) * k / 50; pts.push([tr(tt), +fgw(tt).toFixed(2), +envAt(tt).toFixed(4)]); }
  pts.push([tr(RD_LEN + 0.002), FPEAK, 0]);
  return pts;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-chirp')) {
  const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(here), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(here, 'sound.json')), sound = JSON.parse(fs.readFileSync(soundFile, 'utf8'));
  const evs = (sound.events || []).map(e => ({...e, time: tl.at(e.at)}));
  const map = chirpMap(tl, evs), ev = sound.events.find(e => e.id === 'chirp');
  if (!ev) throw new Error('sound.json has no event with id "chirp"');
  ev.at = 'mechanism'; ev.params = {...ev.params, points: chirpPoints(map)};
  ev.model = {N: +map.N.toFixed(3), t_mech: +map.tA.toFixed(3), t_merge: +map.tM.toFixed(3), tau0: +TAU0.toFixed(5), f0: F0, f_peak: FPEAK, ringdown_ms: RD_TAU * 1000};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]') + '\n');
  console.log(`chirp: ${ev.params.points.length} points, N = ${map.N.toFixed(2)} (label ${map.label}×), merge at ${map.tM.toFixed(3)} s, ends ${(map.t(RD_LEN)).toFixed(3)} s`);
}
