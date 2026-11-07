// Episode scenes — "LIGO는 어떻게 잴까 — 어둠 속의 작은 밝아짐"
// Shape: export {theme, scenes, overlays, titles, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (all simplifications are also listed in README.md; nothing of this is printed on screen):
//  - Michelson interferometer, arms L = 4 km at 90°, Nd:YAG laser 1064 nm, beam splitter (BS) at the corner,
//    power-recycling mirror (PRM) between laser and BS, input test mass (ITM) + end test mass (ETM) per arm
//    (Fabry–Pérot arm cavity), photodetector (PD) on the antisymmetric (output) port. Vacuum tube diameter 1.2 m.
//  - The L is drawn rotated by 45° (a V opening upwards) so the stage is symmetric about x = 540: the laser sits in
//    line with the X arm (lower left), the output port in line with the Y arm (lower right), the BS surface is vertical.
//    The corner region (laser, PRM, BS, ITMs, PD) is NOT to scale; the arms are.
//  - Light passes ≈ 300 times between ITM and ETM (one pass = 4 km) → path ≈ 1,200 km (LIGO Caltech facts page:
//    "~280 trips … 1,120 km"). Real cavity gain is set by the finesse; "300 passes" is the narrated round figure.
//  - Interference (dark-fringe operation): returning fields E1 = cos(φ1), E2 = cos(φ2 + π);
//    PD power P = (1 − cos Δφ)/2, Δφ = 2π · N_PASS · ΔL / λ, ΔL = L_x − L_y. Real LIGO reads out with a small DC
//    offset and P changes by ~10⁻¹⁶ of the full fringe; the picture uses a DISPLAY ΔL (≈ 2×10⁸ × real) chosen so the
//    GW150914 peak gives Δφ = π/2 (P = 0.5). Readouts of ΔL itself use the real value (peak 4×10⁻¹⁸ m).
//  - Gravitational wave: GW150914 chirp, copied from episodes/gravitational-waves/scenes.mjs (Peters 1964 point-mass
//    inspiral, Mc 28.3 M☉, f_gw 24 → 250 Hz, h ∝ f^(2/3) cos 2φ, ringdown 250 Hz / 4 ms). Arm lengths
//    L_x = L(1 + h/2), L_y = L(1 − h/2), peak strain h = 1.0×10⁻²¹. Plus-polarisation, optimal orientation.
//  - Time: τ0 (24 Hz) at s11 "중력파가", τ = 0 (peak) at s11 "밝아집니다" + 0.25 s → slow-motion factor N ≈ 16.
//    The coincide scene replays the same model with the same N; Hanford lags Livingston by 6.9 ms × N.
//    (The two GW150914 signals had opposite sign; P ∝ (1 − cos Δφ) does not show the sign, so the brightness traces
//    have the same shape.)
//  - Seismic isolation: 4-stage pendulum, each stage above its resonance passes (f0/f)² of the motion; f0 ≈ 1 Hz
//    (illustrative), f = 10 Hz → 1/100 per stage, 1/10⁸ for four. The drawn sway is compressed (≈ ½ per stage),
//    the numbers are not. Active isolation platforms (HEPI/ISI) are not shown. Ground vs signal "≈ 10¹²" is the
//    narrated LIGO outreach figure.
//
// Sound tables in sound.json (brightness tone, bounce ticks, ground steps, site ticks, …) are generated from this file:
//   node episodes/ligo-how-it-works/scenes.mjs --emit-sound [--timeline outputs/ligo-how-it-works/narration/timeline.json]
// Re-run it whenever the narration timeline changes (the recombine scene warns once if the table is stale).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  header, progressBar, endCard, drawLabel, leader,
  rgba, mix, clamp, lerp, smooth, easeInOut, poly, line, circle, ring, glow, arrow,
  withAlpha, clipRect, rect, TAU, loadTimeline,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Physics / optics model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const L_ARM_M = 4000, L_KM = 4, LAMBDA_M = 1064e-9, N_PASS = 300, L_EFF_KM = N_PASS * L_KM;   // 1,200 km
export const TUBE_D_M = 1.2, SITE_KM = 3002, C_KMS = 299792.458;
export const LIGHT_MS = SITE_KM / C_KMS * 1000;                 // 10.0 ms
export const DT_HL_MS = 6.9, WINDOW_MS = 10;                     // Hanford after Livingston; coincidence window
export const H_PEAK = 1.0e-21, DL_PEAK_M = H_PEAK * L_ARM_M;     // 4×10⁻¹⁸ m
export const PROTON_D_M = 1.7e-15;
export const MIRROR_KG = 40, FIBRE_MM = 0.4, N_STAGE = 4, F_PEND = 1, F_SEIS = 10;
export const stageGain = f => Math.min(1, (F_PEND / f) ** 2);   // one pendulum stage above resonance
export const chainGain = (f, k) => stageGain(f) ** k;           // 10 Hz: k = 4 → 1e-8
export const GROUND_OVER_SIGNAL = 1e12;

/** phase difference of the two returning beams for an arm-length difference dL (m) */
export const dphiOfDL = dL => 2 * Math.PI * N_PASS * dL / LAMBDA_M;
/** photodetector power (0 … 1 of a fully bright fringe) for a phase difference, dark-fringe set-up E2 = cos(φ2 + π) */
export const powerOf = dphi => (1 - Math.cos(dphi)) / 2;
/** display exaggeration: peak strain → Δφ = π/2 */
export const DPHI_PEAK = Math.PI / 2;
export const DL_DISP_PEAK_M = DPHI_PEAK * LAMBDA_M / (2 * Math.PI * N_PASS);   // ≈ 0.89 nm
export const EXAGGERATION = DL_DISP_PEAK_M / DL_PEAK_M;                          // ≈ 2.2×10⁸
export const ARM_DRAW = 0.16;                                                    // drawn arm stretch at peak (±8 %)

// ---- GW150914 chirp (same model as episodes/gravitational-waves) ----
const G = 6.674e-11, C = 2.998e8, MSUN = 1.989e30;
export const MC = 28.3;
const TMC = MC * G * MSUN / C ** 3;
export const F0 = 24, FPEAK = 250, RD_TAU = 0.004, RD_LEN = 0.025;
export const fgw = tau => (tau >= 0 ? FPEAK : Math.min(FPEAK, (1 / Math.PI) * Math.pow(5 / 256 / (-tau), 3 / 8) * Math.pow(TMC, -5 / 8)));
export const tauOfF = f => -(5 / 256) * Math.pow(TMC, -5 / 3) * Math.pow(Math.PI * f, -8 / 3);
export const TAU0 = tauOfF(F0);                                  // ≈ −0.514 s
const NT = 4000, TT = new Float64Array(NT + 1), PH = new Float64Array(NT + 1);
for (let i = 0; i <= NT; i++) { const w = 1 - i / NT; TT[i] = TAU0 * w * w; }
for (let i = 1; i <= NT; i++) PH[i] = PH[i - 1] + Math.PI * 0.5 * (fgw(TT[i - 1]) + fgw(Math.min(TT[i], -1e-9))) * (TT[i] - TT[i - 1]);
const PH_END = PH[NT];
function bsearch(arr, v) { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; }
export function phiAt(tau) {
  if (tau >= 0) return PH_END + Math.PI * FPEAK * tau;
  if (tau <= TT[0]) return PH[0] + Math.PI * fgw(TT[0]) * (tau - TT[0]);
  const i = bsearch(TT, tau), u = (tau - TT[i]) / (TT[i + 1] - TT[i]);
  return PH[i] + u * (PH[i + 1] - PH[i]);
}
export const envAt = tau => (tau < 0 ? Math.pow(fgw(tau) / FPEAK, 2 / 3) : tau <= RD_LEN ? Math.exp(-tau / RD_TAU) : 0);
/** strain in model units (peak ≈ 1 = 1.0×10⁻²¹); zero outside the replayed 24 Hz … ringdown stretch, soft start */
export const hModel = tau => (tau < TAU0 || tau > RD_LEN ? 0 : envAt(tau) * Math.cos(2 * phiAt(tau)) * smooth((tau - TAU0) / 0.03));
/** real arm-length difference L_x − L_y (m) */
export const dLAt = tau => H_PEAK * hModel(tau) * L_ARM_M;
/** displayed brightness (exaggerated ΔL) */
export const brightAt = tau => powerOf(DPHI_PEAK * hModel(tau));

// ---- time anchors (shared with sound.json through --emit-sound) ----
export const A_GW_START = {sentence: 's11', word: '중력파가'};
export const A_GW_PEAK = {sentence: 's11', word: '밝아집니다', offset: 0.25};
export const A_SITES = {sentence: 's18', word: '칠 밀리초'};        // Livingston peak passes "now"
export const A_GLITCH = {sentence: 's16', word: '잡음을'};
export const A_BOUNCE = {sentence: 's09', word: '사이를'}, A_BOUNCE_END = {sentence: 's09', word: '킬로미터를'};
export const DT_PASS = 0.3, SLOW_PASSES = 8, GLITCH_PAUSE = 2.5;
export const A_GROUND = [{sentence: 's13', word: '땅입니다'}, {sentence: 's14', word: '빠른'}, {sentence: 's14', word: '않습니다'},
  {sentence: 's14', word: '거치면'}, {sentence: 's14', word: '거울에는'}];
export const A_ESS = {sentence: 's07', word: '마루가', offset: -0.6};   // anti-phase → in-phase starts
export const A_SPLIT = {sentence: 's08', word: '나눠'};
export const A_CLOSE = {sentence: 's20', word: '밝아짐이'};

/** one linear mapping τ(t): τ0 at A_GW_START, τ = 0 at A_GW_PEAK */
export function gwMap(tl) {
  const tA = tl.at(A_GW_START), tM = tl.at(A_GW_PEAK), N = (tM - tA) / (-TAU0);
  return {tA, tM, N, label: Math.round(N), tau: t => (t - tM) / N, t: tau => tM + tau * N};
}
/** pass coordinate q(t) in the arm cavity: 1 pass / DT_PASS for 8 passes, then exponential to N_PASS at A_BOUNCE_END */
export function passQ(t, tb, tEnd) {
  const t8 = tb + SLOW_PASSES * DT_PASS;
  if (t < tb) return 0;
  if (t < t8) return (t - tb) / DT_PASS;
  return Math.min(N_PASS, SLOW_PASSES * Math.pow(N_PASS / SLOW_PASSES, clamp((t - t8) / Math.max(0.2, tEnd - t8))));
}
export function passTime(k, tb, tEnd) {          // time at which pass k is completed (k ≥ 1)
  const t8 = tb + SLOW_PASSES * DT_PASS;
  if (k <= SLOW_PASSES) return tb + k * DT_PASS;
  return t8 + Math.log(k / SLOW_PASSES) / Math.log(N_PASS / SLOW_PASSES) * (tEnd - t8);
}
/** essence demo: phase difference δ of wave 2 relative to wave 1 (π = anti-phase, 0 = in-phase) */
export function essDelta(t, tE, tEnd) {
  const go = easeInOut((t - tE) / 0.8), back = easeInOut((t - tEnd - 0.1) / 0.55);
  return Math.PI * (1 - go + back);
}
/** isolate: which stage the listening point is on (0 = ground … 4 = mirror), continuous */
export const stageHearing = (t, times) => times.reduce((k, x, i) => (i > 0 && t >= x ? i : k), 0);
/** coincide: Livingston and Hanford brightness at video time t */
export function sitesBright(t, map, tL) {
  const tauL = (t - tL) / map.N, tauH = tauL - DT_HL_MS / 1000;
  return [brightAt(tauL), brightAt(tauH), tauL];
}
/** a single-site glitch (instrument noise): Gaussian burst in Hanford brightness, 3 ms wide (real) */
export const glitchAt = (t, tg, N) => 0.42 * Math.exp(-((((t - tg) / N) / 0.003) ** 2)) * (0.6 + 0.4 * Math.cos((t - tg) / N * TAU * 180));

// =====================================================================================================
// Drawing helpers
// =====================================================================================================
const LASER = '#FF5A36', XCOL = '#FFB36B', YCOL = '#8CCBE6', SUMC = '#FFE2C4', MIRROR = '#CFE6EE', TRACK = '#FF4103';
const GOOD = '#8AC0A0', GW = '#B9F0D2';
const fmt = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sentOn = (ctx, t, id, rampIn = 0.3) => { const s = ctx.tl.sentence(id); return smooth((t - s.start + 0.2) / rampIn) * (1 - smooth((t - s.end - 0.6) / 0.5)); };
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);

/** text with a manually raised exponent (the fallback font's superscript digits look wrong) */
function textSup(stage, parts, x, y, o = {}) {
  const size = o.size || 24, sub = p => (p[1] ? Math.round(size * 0.66) : size);
  let total = 0; for (const p of parts) total += stage.measure(p[0], {...o, size: sub(p)});
  let xx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  for (const [str, sup] of parts) xx += stage.text(str, xx, sup ? y - size * 0.36 : y, {...o, size: sup ? Math.round(size * 0.66) : size, align: 'left'});
  return total;
}
/** "2.7×10⁻¹⁸ m" as textSup parts */
function sciParts(v, unit, d = 1) {
  if (Math.abs(v) < 1e-30) return [[`0 ${unit}`, false]];
  const e = Math.floor(Math.log10(Math.abs(v))), m = v / 10 ** e;
  return [[`${v < 0 ? '−' : '+'}${fmt(Math.abs(m), d)}×10`, false], [`−${-e}`.replace('−-', ''), true], [` ${unit}`, false]];
}

function panel(c, T, x, y, w, h) { rect(c, x, y, w, h, 10, rgba(T.plate, 0.9), rgba(T.border, 1), 1.5); }

/** projections of the observatory ground plane: u along the X arm, w along the Y arm (km), h up (km-ish) */
const planP = (cx, cy, k) => (u, w, h = 0) => [cx + (u - w) * k * Math.SQRT1_2, cy - (u + w) * k * Math.SQRT1_2 - h * k, 1];
const obliqueP = ({cx, cy, kx, ky, kz, persp}) => (u, w, h = 0) => { const s = 1 / (1 + (u + w) * persp); return [cx + (u - w) * kx * s, cy - (u + w) * ky * s - h * kz * s, s]; };

function unit(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
/** a mirror/optic drawn as a short thick bar across direction `dir` */
function optic(c, p, dir, len, wid, fill, stroke) {
  const n = [-dir[1], dir[0]];
  const q = (s, u) => [p[0] + n[0] * s + dir[0] * u, p[1] + n[1] * s + dir[1] * u];
  poly(c, [q(-len / 2, -wid / 2), q(len / 2, -wid / 2), q(len / 2, wid / 2), q(-len / 2, wid / 2)], fill, stroke, 1.5);
}
function beam(c, a, b, q = 1, w = 3, al = 0.95, col = LASER) {
  if (q <= 0) return;
  const e = [lerp(a[0], b[0], q), lerp(a[1], b[1], q)];
  line(c, [a, e], rgba(col, 0.22 * al), w * 3.2); line(c, [a, e], rgba(col, al), w);
}
function trackRing(c, x, y, r, a = 1) {
  withAlpha(c, a, () => {
    ring(c, x, y, r + 10, rgba(TRACK, 0.95), 2.5);
    for (let k = 0; k < 4; k++) { const th = k * Math.PI / 2 + Math.PI / 4; line(c, [[x + Math.cos(th) * (r + 14), y + Math.sin(th) * (r + 14)], [x + Math.cos(th) * (r + 22), y + Math.sin(th) * (r + 22)]], TRACK, 2.5); }
  });
}
/** box building on the ground plane */
function building(c, P, u0, u1, w0, w1, h, T) {
  const top = [P(u0, w0, h), P(u1, w0, h), P(u1, w1, h), P(u0, w1, h)];
  poly(c, [P(u0, w0), P(u1, w0), P(u1, w0, h), P(u0, w0, h)], mix(T.plate, '#5a6a70', 0.35), rgba(T.muted, 0.7), 1.2);   // face towards −w
  poly(c, [P(u0, w0), P(u0, w1), P(u0, w1, h), P(u0, w0, h)], mix(T.plate, '#5a6a70', 0.55), rgba(T.muted, 0.7), 1.2);   // face towards −u
  poly(c, top, mix(T.plate, '#9fb0b5', 0.55), rgba(T.ink, 0.7), 1.2);
}
function tube(c, a, b, w, T, alpha = 1) {
  withAlpha(c, alpha, () => { line(c, [a, b], rgba(T.muted, 0.55), w + 4, {cap: 'butt'}); line(c, [a, b], rgba(T.deep, 1), w, {cap: 'butt'}); });
}

/**
 * The interferometer on the observatory plane. P: projection (u, w, h) → [x, y, s].
 * o: {sx, sy (fractional arm stretch), g:{in, arm, out} growth 0..1, bright 0..1, mirrors, tubes, buildings, k (px/km for sizes)}
 * Returns screen positions of the parts.
 */
function drawIFO(stage, P, o = {}) {
  const {ctx: c} = stage, T = stage.theme, g = {in: 1, arm: 1, out: 1, ...(o.g || {})};
  const ex = L_KM * (1 + (o.sx || 0)), ey = L_KM * (1 + (o.sy || 0)), cs = o.corner ?? 1;
  const pos = {bs: P(0, 0), laser: P(-1.7 * cs, 0), prm: P(-0.85 * cs, 0), pd: P(0, -1.7 * cs), itmX: P(0.75 * cs, 0), itmY: P(0, 0.75 * cs),
    etmX: P(ex, 0), etmY: P(0, ey), tipX: P(L_KM, 0), tipY: P(0, L_KM)};
  const dX = unit(pos.bs, P(1, 0)), dY = unit(pos.bs, P(0, 1)), dIn = dX, dOut = unit(pos.bs, pos.pd);
  const tw = o.tubeW ?? 16;
  if (o.tubes !== false) { tube(c, P(0.35 * cs, 0), P(L_KM + 0.12, 0), tw, T, o.tubeAlpha ?? 1); tube(c, P(0, 0.35 * cs), P(0, L_KM + 0.12), tw, T, o.tubeAlpha ?? 1); }
  if (o.buildings) {
    building(c, P, -0.38, 0.38, -0.38, 0.38, 0.16, T);
    building(c, P, L_KM - 0.05, L_KM + 0.3, -0.16, 0.16, 0.12, T);
    building(c, P, -0.16, 0.16, L_KM - 0.05, L_KM + 0.3, 0.12, T);
  }
  const bw = o.beamW ?? 3, br = clamp(o.bright ?? 0);
  // input: laser → PRM → BS
  beam(c, pos.laser, pos.bs, g.in, bw, 0.95);
  // arms: BS → ITM → ETM (the cavity part ITM–ETM is brighter: light builds up there)
  const armQ = clamp(g.arm);
  if (armQ > 0) {
    const qa = clamp(armQ / 0.15), qb = clamp((armQ - 0.15) / 0.85);
    beam(c, pos.bs, pos.itmX, qa, bw, 0.9); beam(c, pos.bs, pos.itmY, qa, bw, 0.9);
    beam(c, pos.itmX, pos.etmX, qb, bw * (o.cavityW ?? 1.25), 1); beam(c, pos.itmY, pos.etmY, qb, bw * (o.cavityW ?? 1.25), 1);
  }
  // output port: dark unless the arms differ
  if (g.out > 0) beam(c, pos.bs, pos.pd, g.out, bw, 0.12 + 0.88 * br, mix(LASER, SUMC, br));
  if (o.mirrors !== false) {
    const m = o.mirrorLen ?? 22;
    optic(c, pos.etmX, dX, m, 7, MIRROR, rgba(T.ink, 0.9)); optic(c, pos.etmY, dY, m, 7, MIRROR, rgba(T.ink, 0.9));
    if (!o.simple) {
      optic(c, pos.itmX, dX, m, 6, rgba(MIRROR, 0.85), rgba(T.ink, 0.8)); optic(c, pos.itmY, dY, m, 6, rgba(MIRROR, 0.85), rgba(T.ink, 0.8));
      optic(c, pos.prm, dIn, m, 6, rgba(MIRROR, 0.6), rgba(T.ink, 0.7));
    }
    optic(c, pos.bs, [1, 0], m * 1.2, 5, rgba('#CFE6EE', 0.95), rgba(T.ink, 0.9));                     // BS surface vertical on screen
    // laser head and photodetector
    const lp = pos.laser; optic(c, [lp[0] - dIn[0] * 10, lp[1] - dIn[1] * 10], [-dIn[1], dIn[0]], 34, 22, '#3a2a28', LASER);
    const pd = pos.pd;
    glow(c, pd[0], pd[1], 46, SUMC, 0.7 * br * g.out);
    optic(c, [pd[0] + dOut[0] * 6, pd[1] + dOut[1] * 6], [-dOut[1], dOut[0]], 26, 18, mix('#22343b', '#ffd2b8', br), rgba(T.ink, 0.9));
  }
  return {pos, dX, dY, dOut};
}

/** horizontal brightness meter: label, bar, state word */
function meter(stage, x, y, w, P, o = {}) {
  const {ctx: c} = stage, T = stage.theme;
  rect(c, x, y - 12, w, 24, 6, rgba(T.border, 1));
  if (P > 0.002) rect(c, x, y - 12, Math.max(6, w * clamp(P)), 24, 6, mix('#7a4a3a', SUMC, clamp(P * 1.6)));
  if (o.label) stage.text(o.label, x, y - 36, {size: o.size || 26, weight: 500, color: T.ink});
  if (o.state !== false) {
    const dark = (o.stateP ?? P) < (o.darkBelow ?? 0.03);
    stage.text(dark ? (o.darkText || '어두움') : (o.brightText || '밝아짐'), x + w, y - 36, {size: 24, color: dark ? T.muted : T.light, align: 'right', weight: dark ? 400 : 500});
  }
}
/** detector box with glow (used as a small "meter" object) */
function detector(c, x, y, s, P, T) {
  glow(c, x, y, 60 * s, SUMC, 0.85 * clamp(P));
  rect(c, x - 26 * s, y - 18 * s, 52 * s, 36 * s, 5, mix('#1d2e34', '#ffd8bf', clamp(P)), rgba(T.ink, 0.9), 2);
  circle(c, x, y, 8 * s, mix('#0b1418', '#fff3e6', clamp(P)));
}
/** drawn check / cross marks (no glyph dependence) */
const checkMark = (c, x, y, s, col) => line(c, [[x - 14 * s, y], [x - 4 * s, y + 11 * s], [x + 16 * s, y - 13 * s]], col, 4.5 * s);
const crossMark = (c, x, y, s, col) => { line(c, [[x - 13 * s, y - 13 * s], [x + 13 * s, y + 13 * s]], col, 4.5 * s); line(c, [[x + 13 * s, y - 13 * s], [x - 13 * s, y + 13 * s]], col, 4.5 * s); };

/** a sine row for the wave-addition pictures. amp px, phase rad, k rad/px */
function waveRow(c, x0, x1, y, amp, phase, col, w = 2.6, kx = TAU / 150) {
  const pts = []; for (let x = x0; x <= x1; x += 3) pts.push([x, y - amp * Math.cos(kx * (x - x0) + phase)]); line(c, pts, col, w);
}

// rough contiguous-US outline (lon, lat) — schematic
const US = [[-124.7, 48.4], [-123.9, 46], [-124.2, 42], [-120.5, 34.5], [-117.1, 32.5], [-114.7, 32.7], [-111, 31.3], [-108.2, 31.3], [-106.5, 31.8],
  [-103, 29], [-101.4, 29.8], [-99.5, 27.5], [-97.2, 25.9], [-97.4, 27.8], [-94.7, 29.4], [-89.6, 29.9], [-89.2, 30.3], [-85.4, 29.7], [-83, 29],
  [-82.7, 27.5], [-81.8, 26], [-80.4, 25.2], [-80, 26.9], [-81.2, 29.9], [-81.4, 31], [-79.2, 33.2], [-75.6, 35.2], [-76.3, 37], [-75.2, 38.5],
  [-74, 40.5], [-70, 41.5], [-70.6, 43], [-67, 44.8], [-67.8, 47.1], [-69.2, 47.4], [-71.5, 45], [-75, 45], [-76.8, 43.6], [-79.2, 43.4],
  [-79, 42.8], [-83, 41.8], [-82.4, 43], [-83.9, 46], [-88, 48.3], [-89.6, 48], [-95.2, 49], [-123, 49]];
const SITE_H = [-119.41, 46.45], SITE_L = [-90.77, 30.56];

let staleWarned = false;
function checkSoundTable(ctx, map) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.id === 'brightness'), s = ctx.events.find(x => x.id === 'sites');
  const ok = e?.model && Math.abs(e.model.N - map.N) < 0.01 && Math.abs(e.time - map.tA) < 1e-3 &&
    s && Math.abs((s.params?.interval ?? 0) - DT_HL_MS / 1000 * map.N) < 1e-3;
  if (!ok) console.warn('warning: sound tables in sound.json are stale — run node episodes/ligo-how-it-works/scenes.mjs --emit-sound');
}
const mapOf = ctx => ctx._map || (ctx._map = gwMap(ctx.tl));
const evT = (ctx, id, fallback) => (ctx.events.has(id) ? ctx.events.get(id).time : ctx.tl.at(fallback));

// =====================================================================================================
// Scenes
// =====================================================================================================
export const titles = {
  hook: ['예측 질문', '다시 겹친 빛은\n밝을까, 어두울까?'],
  origin: ['기원 · 1887 – 2017', '간섭계 — 빛의 물결로 잰다'],
  essence: ['본질 · 제1원리', '길이 차이를 밝기로 읽는다'],
  split: ['메커니즘 ① 나누고 왕복하기', '한 줄기 빛을 두 팔로'],
  recombine: ['메커니즘 ② 다시 겹치기', '평소에는 어둡게'],
  isolate: ['잡음 ① 땅의 흔들림', '네 겹 진자에 매단 거울'],
  coincide: ['잡음 ② 두 관측소', '같은 신호가 두 곳에'],
  myth: ['오해 바로잡기', '시계가 아니라, 빛의 겹침'],
  close: ['', ''],
};

export const scenes = {
  // ------------------------------------------------------------------ hook: the observatory, output dark
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const P = obliqueP({cx: 540, cy: 1190, kx: 112, ky: 140, kz: 160, persp: 0.055});
    // ground: faint survey grid
    for (let i = 0; i <= 4; i++) {
      line(c, [P(i, -0.35), P(i, 4.6)], rgba(T.border, 0.55), 1.2);
      line(c, [P(-0.35, i), P(4.6, i)], rgba(T.border, 0.55), 1.2);
    }
    const g = smooth((t - 0.8) / 1.4);
    drawIFO(stage, P, {tubeW: 15, beamW: 2.6, g: {in: 0, arm: g, out: 0}, bright: 0, mirrors: false, cavityW: 1, corner: 0.15});
    // buildings drawn again on top of beams (beams run inside the buildings)
    building(c, P, -0.2, 0.2, -0.2, 0.2, 0.1, T);
    building(c, P, L_KM - 0.05, L_KM + 0.22, -0.12, 0.12, 0.08, T);
    building(c, P, -0.12, 0.12, L_KM - 0.05, L_KM + 0.22, 0.08, T);
    const la = fadeIn(t, 1.6, 0.6);
    // scale bar along the X arm, offset outwards (towards −w)
    withAlpha(c, la, () => {
      const a = P(0, -0.42), b = P(L_KM, -0.42), d = unit(a, b), n = [d[1], -d[0]];
      line(c, [a, b], rgba(T.muted, 0.95), 2.5);
      for (const q of [a, b]) line(c, [[q[0] - n[0] * 9, q[1] - n[1] * 9], [q[0] + n[0] * 9, q[1] + n[1] * 9]], rgba(T.muted, 0.95), 2.5);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      c.save(); c.translate(m[0] + 26, m[1] + 22); c.rotate(ang); stage.text('4 km', 0, 0, {role: 'display', weight: 500, size: 32, color: T.ink, align: 'center'}); c.restore();
    });
    leader(stage, '모서리 건물', P(-0.1, 0.05, 0.1), [250, 1080], {alpha: la, size: 26, sub: '레이저 · 빔 분할기'});
    leader(stage, '끝 건물', P(0, L_KM + 0.12, 0.12), [190, 660], {alpha: la, size: 26, sub: '거울'});
    leader(stage, '끝 건물', P(L_KM + 0.12, 0, 0.12), [890, 660], {alpha: la, size: 26, sub: '거울'});
    stage.text('LIGO 관측소', 540, 520, {role: 'display', weight: 700, size: 40, color: T.ink, align: 'center', alpha: la});
    stage.text('두 팔이 직각인 L자', 540, 566, {size: 26, color: T.muted, align: 'center', alpha: la});
    // photodetector meter at the output port
    const ans = fadeIn(t, tl.at({sentence: 's02', word: '어두움입니다'}) - 0.1, 0.4);
    const mx = 790, my = 1250;
    withAlpha(c, la, () => {
      line(c, [P(0.12, -0.12, 0.05), [mx - 60, my]], rgba(T.muted, 0.7), 1.5, {dash: [5, 6]});
      detector(c, mx - 30, my, 0.9, 0, T);
      stage.text('광검출기', mx + 6, my - 14, {size: 26, weight: 500, color: T.ink});
      stage.text(ans > 0.5 ? '어두움' : '?', mx + 6, my + 20, {size: 26, weight: 700, color: ans > 0.5 ? T.light : T.muted});
    });
    if (ans > 0) ring(c, mx - 30, my, 34 + 24 * (1 - ans), rgba(T.accent, 0.8 * (1 - ans * 0.6)), 2.5);
  },

  // ------------------------------------------------------------------ origin: 干涉計, timeline, Michelson 1887 vs LIGO
  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const s3 = sentOn(ctx, t, 's03');
    const glyphs = [['干', '범할 간', '끼어들다'], ['涉', '건널 섭', '건너다'], ['計', '잴 계', '재다']];
    glyphs.forEach(([g, r, m], i) => {
      const x = 220 + i * 320, y = 400, a = fadeIn(t, tl.at('s03') + i * 0.45);
      const on = (i < 2 && t >= tl.at({sentence: 's03', word: '간섭한다는'}) - 0.1 && t < tl.at({sentence: 's03', word: '잴'}) - 0.1) ||
        (i === 2 && t >= tl.at({sentence: 's03', word: '잴'}) - 0.1 && t < tl.at('s03:end') + 0.4);
      withAlpha(c, a, () => {
        rect(c, x - 130, y - 92, 260, 200, 8, rgba(T.plate, 0.88), on ? T.accent : rgba(T.border, 1), on ? 2.5 : 1.5);
        stage.text(g, x - 54, y - 6, {size: 96, weight: 700, color: T.ink, align: 'center'});
        stage.text(r, x + 22, y - 26, {size: 28, weight: 500, color: on ? T.light : T.ink});
        stage.text(m, x + 22, y + 14, {size: 24, color: T.muted});
        stage.text(i < 2 ? '간섭' : '계', x, y + 80, {size: 26, weight: 500, color: i < 2 ? GW : XCOL, align: 'center'});
      });
    });
    withAlpha(c, fadeIn(t, tl.at({sentence: 's03', word: '빛의'}) - 0.2, 0.5) * (0.55 + 0.45 * s3), () => {
      stage.text('물결이 서로 끼어들어 겹치는 현상 + 재는 기계', 540, 548, {size: 26, weight: 500, color: T.ink, align: 'center'});
      stage.text('영어 interferometer = inter(서로) + ferire(치다) + meter(재다)', 540, 588, {size: 24, color: T.muted, align: 'center', maxWidth: 940});
    });
    // timeline strip
    const nodes = [[1887, '마이컬슨·몰리', '간섭계 실험', {sentence: 's05', word: '천팔백팔십칠년'}],
      [1972, '라이너 바이스', '레이저 간섭계 제안', {sentence: 's05', word: '천구백칠십이년'}],
      [2015, 'LIGO', '첫 검출', {sentence: 's05', word: '사십삼년'}],
      [2017, '노벨', '물리학상', {sentence: 's05', word: '잡았습니다'}]];
    const ly = 700, xs = [180, 420, 660, 900];
    const tOn = nodes.map(n => tl.at(n[3]) - 0.15), cur = tOn.reduce((k, x, i) => (t >= x ? i : k), -1);
    withAlpha(c, fadeIn(t, tl.at('s05') - 0.6), () => {
      line(c, [[110, ly], [970, ly]], rgba(T.border, 1), 3);
      nodes.forEach(([yr, l1, l2], i) => {
        const x = xs[i], on = i === cur, past = i < cur, a = i <= cur ? 1 : 0.35, col = on ? T.accent : past ? T.ink : T.muted;
        withAlpha(c, a, () => {
          circle(c, x, ly, on ? 11 : 8, col); if (on) ring(c, x, ly, 18, rgba(T.accent, 0.6), 2);
          stage.text(String(yr), x, ly - 40, {role: 'display', weight: 700, size: 34, color: col, align: 'center'});
          stage.text(l1, x, ly + 40, {size: 24, color: on ? T.ink : T.muted, align: 'center', weight: on ? 500 : 400});
          stage.text(l2, x, ly + 70, {size: 24, color: on ? T.ink : T.muted, align: 'center', weight: on ? 500 : 400});
        });
      });
      const b = fadeIn(t, tl.at({sentence: 's05', word: '사십삼년'}) - 0.1, 0.5);
      withAlpha(c, b, () => {
        line(c, [[xs[1] + 14, ly], [xs[2] - 14, ly]], T.accent, 5, {cap: 'butt'});
        stage.text('43년', (xs[1] + xs[2]) / 2, ly - 40, {role: 'display', weight: 500, size: 30, color: T.accent, align: 'center'});
      });
    });
    // same principle: Michelson 1887 (left) and LIGO (right), both drawn as a V like the rest of the film
    const aM = fadeIn(t, tl.at({sentence: 's05', word: '마이컬슨의'}) - 0.2, 0.6), aL = fadeIn(t, tl.at({sentence: 's05', word: '중력파'}) - 0.2, 0.6);
    const aEq = fadeIn(t, tl.at({sentence: 's05', word: '같은'}) - 0.1, 0.5);
    const yy = 1150;
    withAlpha(c, aM, () => {
      const P = planP(290, yy + 50, 38);
      poly(c, [P(-2.1, -2.1), P(4.5, -2.1), P(4.5, 4.5), P(-2.1, 4.5)], rgba('#8a7f6a', 0.18), rgba('#b8a994', 0.6), 1.5);   // stone slab
      drawIFO(stage, P, {tubes: false, simple: true, beamW: 2.2, mirrorLen: 18, cavityW: 1, corner: 1.2});
      stage.text('1887 마이컬슨 간섭계', 290, 856, {role: 'display', weight: 500, size: 30, color: T.ink, align: 'center'});
      stage.text('돌판 위 · 빛길 약 11 m', 290, 896, {size: 24, color: T.muted, align: 'center'});
    });
    withAlpha(c, aEq, () => {
      stage.text('=', 540, yy - 70, {role: 'display', weight: 700, size: 64, color: T.accent, align: 'center'});
      stage.text('같은 원리', 540, yy - 18, {size: 26, weight: 500, color: T.accent, align: 'center'});
    });
    withAlpha(c, aL, () => {
      const P = planP(790, yy + 50, 38);
      drawIFO(stage, P, {tubeW: 9, beamW: 2.2, mirrorLen: 18, cavityW: 1.3, corner: 1.2});
      stage.text('LIGO 간섭계', 790, 856, {role: 'display', weight: 500, size: 30, color: T.ink, align: 'center'});
      stage.text('팔 4 km · 빛길 약 1,200 km', 790, 896, {size: 24, color: T.muted, align: 'center'});
    });
  },

  // ------------------------------------------------------------------ essence: ΔL → Δφ → brightness; waves add
  essence(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    // chain of the core sentence
    const steps = [['두 팔의', '길이 차이', {sentence: 's06', word: '길이'}], ['두 빛의', '어긋남', {sentence: 's06', word: '겹쳐서'}], ['광검출기', '밝기', {sentence: 's06', word: '밝기로'}]];
    const s6 = sentOn(ctx, t, 's06');
    steps.forEach(([a, b, at], i) => {
      const x = 210 + i * 330, y = 380, ap = fadeIn(t, tl.at(at) - 0.2), on = s6 > 0.5 && t >= tl.at(at) - 0.2;
      withAlpha(c, ap * (on ? 1 : 0.75), () => {
        rect(c, x - 140, y - 58, 280, 116, 8, rgba(T.plate, 0.9), on ? T.accent : rgba(T.border, 1), on ? 2.5 : 1.5);
        stage.text(a, x, y - 20, {size: 26, color: T.muted, align: 'center'});
        stage.text(b, x, y + 20, {role: 'display', weight: 700, size: 36, color: on ? T.light : T.ink, align: 'center'});
        if (i < 2) arrow(c, [x + 148, y], [x + 182, y], rgba(T.ink, 0.8), 3, {head: 11});
      });
    });
    // "자로 재지 않고": a ruler, crossed
    const ra = fadeIn(t, tl.at({sentence: 's06', word: '자로'}) - 0.1, 0.4) * (0.4 + 0.6 * s6);
    withAlpha(c, ra, () => {
      const x0 = 120, y0 = 486;
      rect(c, x0, y0, 180, 30, 3, rgba('#b8a994', 0.25), rgba('#b8a994', 0.9), 1.5);
      for (let k = 0; k <= 12; k++) line(c, [[x0 + 8 + k * 13.7, y0], [x0 + 8 + k * 13.7, y0 + (k % 4 === 0 ? 16 : 9)]], rgba('#b8a994', 0.9), 1.5);
      crossMark(c, x0 + 90, y0 + 15, 1.6, T.accent);
      stage.text('자로 직접 재지 않음', x0 + 200, y0 + 15, {size: 24, color: T.muted});
    });
    // waves
    const tB = tl.at({sentence: 's07', word: '골이 만나면'}) - 0.45, tE = evT(ctx, 'essglow', A_ESS), tEnd = tl.at('s07:end');
    const d = essDelta(t, tE, tEnd), aW = fadeIn(t, tl.at('s07') - 0.3, 0.5), aB = fadeIn(t, tB, 0.5);
    const x0 = 270, x1 = 1000, yA = 650, yB = 780, yS = 952, A = 38, ph0 = -Math.PI / 2 + TAU * 0.3;
    withAlpha(c, aW, () => {
      panel(c, T, 60, 570, 960, 530);
      stage.text('빛 1', 84, yA, {size: 28, weight: 500, color: XCOL});
      line(c, [[x0, yA], [x1, yA]], rgba(T.border, 1), 1);
      waveRow(c, x0, x1, yA, A, ph0, XCOL);
      // crest / trough markers on wave 1 (static waves; marker x from the formula)
      const kx = TAU / 150, xc = x0 + ((TAU - ph0) % TAU) / kx, xt = xc + 75;
      const aMaru = fadeIn(t, tl.at({sentence: 's07', word: '마루와'}) - 0.1), aGol = fadeIn(t, tl.at({sentence: 's07', word: '골이'}) - 0.1);
      withAlpha(c, aMaru, () => { circle(c, xc, yA - A, 6, T.light); stage.text('마루', xc, yA - A - 26, {size: 24, weight: 500, color: T.light, align: 'center'}); });
      withAlpha(c, aGol, () => { circle(c, xt, yA + A, 6, T.light); stage.text('골', xt, yA + A + 26, {size: 24, weight: 500, color: T.light, align: 'center'}); });
      withAlpha(c, aB, () => {
        stage.text('빛 2', 84, yB, {size: 28, weight: 500, color: YCOL});
        line(c, [[x0, yB], [x1, yB]], rgba(T.border, 1), 1);
        waveRow(c, x0, x1, yB, A, ph0 + d, YCOL);
        // the sum
        stage.text('겹친 빛', 84, yS, {size: 28, weight: 500, color: SUMC});
        line(c, [[x0, yS], [x1, yS]], rgba(T.border, 1), 1);
        const pts = []; for (let x = x0; x <= x1; x += 3) pts.push([x, yS - A * (Math.cos(kx * (x - x0) + ph0) + Math.cos(kx * (x - x0) + ph0 + d))]);
        line(c, pts, SUMC, 3.2);
        // alignment guide through the first crest of wave 1
        line(c, [[xc, yA - A - 6], [xc, yS + 2 * A + 6]], rgba(T.ink, 0.35), 1.5, {dash: [5, 6]});
        const anti = Math.cos(d) < -0.5, inph = Math.cos(d) > 0.5;
        const lab = anti ? '마루 + 골 → 평평 = 어두움' : inph ? '마루 + 마루 → 두 배 = 밝음' : '어긋남이 줄어드는 중';
        stage.text(lab, x1, 1074, {size: 26, weight: 500, color: anti ? T.muted : inph ? T.light : T.ink, align: 'right'});
        const Pd = (1 + Math.cos(d)) / 2;
        meter(stage, 210, 1220, 660, Pd, {label: '광검출기 밝기', darkBelow: 0.05, brightText: '밝음'});
        detector(c, 140, 1206, 0.9, Pd, T);
      });
    });
  },

  // ------------------------------------------------------------------ split: 3-tier dashboard begins
  split(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const tS = evT(ctx, 'splitbeam', A_SPLIT);
    const gIn = smooth((t - tl.at('s08') - 0.1) / (tS - tl.at('s08') - 0.1));
    const gArm = smooth((t - tS) / 1.6), gOut = 0;
    const P = planP(540, 640, 88);
    const st = drawIFO(stage, P, {g: {in: gIn, arm: gArm, out: gOut}, bright: 0, tubeW: 16});
    const {pos} = st;
    // split flash at the beam splitter
    if (ctx.events.has('splitbeam')) { const f = ctx.events.pulse('splitbeam', t, 0.7); if (f > 0) ring(c, pos.bs[0], pos.bs[1], 12 + 30 * (1 - f), rgba(SUMC, f), 2.5); }
    // labels, appearing as the narration reaches them
    const L = (txt, to, at, when, o = {}) => leader(stage, txt, to, at, {size: 24, alpha: fadeIn(t, when, 0.4), ...o});
    const w = word => tl.at({sentence: 's08', word}) - 0.15;
    L('레이저 1064 nm', pos.laser, [300, 770], w('레이저'), {sub: '적외선'});
    L('파워 재순환 거울', pos.prm, [330, 690], w('줄기를'));
    L('빔 분할기', [pos.bs[0], pos.bs[1] + 14], [540, 790], w('분할기가'), {align: 'center'});
    L('광검출기', pos.pd, [780, 770], w('나눠,'));
    L('입력 시험질량', pos.itmY, [250, 560], tl.at({sentence: 's09', word: '거울'}) - 0.15);
    L('끝 시험질량 거울', pos.etmY, [330, 340], tl.at({sentence: 's09', word: '거울'}) - 0.15, {align: 'left'});
    L('끝 시험질량 거울', pos.etmX, [750, 340], tl.at({sentence: 's09', word: '거울'}) - 0.15, {align: 'right'});
    L('진공관', P(2.6, 0), [880, 560], w('직각으로'), {align: 'left', sub: `지름 ${TUBE_D_M} m`});
    // arm length labels inside the V
    const aArm = fadeIn(t, w('사'), 0.4);
    withAlpha(c, aArm, () => {
      for (const [a, b, s] of [[P(1.6, 0), P(2.6, 0), 1], [P(0, 2.6), P(0, 1.6), -1]]) {
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        c.save(); c.translate(m[0] - 30 * s, m[1] - 30); c.rotate(ang); stage.text('4 km', 0, 0, {role: 'display', weight: 500, size: 30, color: T.ink, align: 'center'}); c.restore();
      }
      // right angle mark
      const r = 26, q1 = P(0.3, 0), q2 = P(0.3, 0.3), q3 = P(0, 0.3);
      line(c, [q1, q2, q3], rgba(T.ink, 0.7), 2);
      void r;
    });
    // ---- middle: one arm cavity, light passing between the two test masses
    const tb = evT(ctx, 'bounce', A_BOUNCE), tEnd = tl.at(A_BOUNCE_END);
    const q = passQ(t, tb, tEnd), n = Math.floor(q);
    const y0 = 818, h = 230, xm0 = 180, xm1 = 900, yc = y0 + 134;
    const aMid = fadeIn(t, tl.at('s08') + 0.3, 0.6);
    withAlpha(c, aMid, () => {
      panel(c, T, 60, y0, 960, h);
      // zoom lines from the X arm in the top view
      stage.text('팔 하나 확대 — 두 거울 사이', 84, y0 + 30, {size: 24, color: T.muted});
      // mirrors
      rect(c, xm0 - 16, yc - 36, 16, 72, 3, rgba(MIRROR, 0.9), rgba(T.ink, 0.8), 1.5);
      rect(c, xm1, yc - 36, 16, 72, 3, MIRROR, rgba(T.ink, 0.9), 1.5);
      stage.text('입력 시험질량', xm0 - 8, yc + 66, {size: 24, color: T.muted, align: 'center'});
      stage.text('끝 시험질량', xm1 + 8, yc + 66, {size: 24, color: T.muted, align: 'center'});
      // incoming beam and the stored light (brighter as passes add up)
      const gin = smooth((t - tS - 0.6) / 0.8);
      beam(c, [70, yc], [xm0 - 16, yc], gin, 3, 0.9);
      const build = clamp(Math.log(1 + q) / Math.log(1 + N_PASS));
      if (gin > 0) beam(c, [xm0, yc], [xm1, yc], 1, 2 + 3 * build, 0.25 + 0.6 * build);
      if (q > 0 && q < N_PASS) {
        const fr = q - n, dir = n % 2 === 0 ? 1 : -1, x = dir > 0 ? lerp(xm0, xm1, fr) : lerp(xm1, xm0, fr);
        if (q < SLOW_PASSES + 1) { glow(c, x, yc, 34, SUMC, 0.9); circle(c, x, yc, 7, '#FFF4E8'); }
        else { // fast: a streak
          const sAl = 1 - clamp((q - 30) / 60);
          if (sAl > 0) withAlpha(c, sAl, () => line(c, [[lerp(xm0, xm1, 0.1), yc], [lerp(xm0, xm1, 0.9), yc]], rgba('#FFF4E8', 0.7), 5));
        }
      }
      // counters
      const shown = Math.min(N_PASS, Math.floor(q + 1e-9));   // completed passes: steps at each mirror tick
      const aC = fadeIn(t, tb - 0.3, 0.4);
      withAlpha(c, aC, () => {
        stage.text('오간 횟수', 600, y0 + 30, {size: 24, color: T.muted, align: 'right'});
        stage.text(`${fmt(shown)} / 약 ${N_PASS}`, 600, y0 + 66, {role: 'display', weight: 700, size: 36, color: shown >= N_PASS ? T.light : T.ink, align: 'right'});
        stage.text('달린 거리', 990, y0 + 30, {size: 24, color: T.muted, align: 'right'});
        stage.text(`${fmt(shown * L_KM)} km`, 990, y0 + 66, {role: 'display', weight: 700, size: 36, color: shown >= N_PASS ? T.light : T.ink, align: 'right'});
        stage.text(`거울 사이 한 번 = ${L_KM} km`, 540, y0 + h - 30, {size: 24, color: T.muted, align: 'center'});
      });
    });
    // ---- bottom: readouts
    readoutsSplit(stage, t, ctx, Math.min(N_PASS, Math.floor(q + 1e-9)), aMid);
  },

  // ------------------------------------------------------------------ recombine: dark fringe, then the chirp
  recombine(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, map = mapOf(ctx);
    checkSoundTable(ctx, map);
    const tau = map.tau(t), h = hModel(tau), Pb = brightAt(tau), dphi = DPHI_PEAK * h;
    const Penv = tau >= TAU0 && tau <= RD_LEN ? powerOf(DPHI_PEAK * envAt(tau) * smooth((tau - TAU0) / 0.03)) : 0;   // envelope (no flicker) for words
    const P = planP(540, 640, 88);
    const sx = ARM_DRAW * h / 2, sy = -ARM_DRAW * h / 2;
    // passing wave: faint fronts sweeping across the top view while the chirp plays
    const wv = smooth((t - map.tA) / 0.8) * (1 - smooth((tau - RD_LEN) / 0.02));
    if (wv > 0) clipRect(c, 60, 290, 960, 510, 0, () => {
      for (let k = 0; k < 5; k++) {
        const u = ((t - map.tA) * 0.18 + k / 5) % 1, yy = lerp(260, 840, u);
        withAlpha(c, wv * Math.sin(Math.PI * u) * 0.16, () => line(c, [[60, yy], [1020, yy]], GW, 2.5));
      }
    });
    const st = drawIFO(stage, P, {sx, sy, bright: Pb, tubeW: 16});
    const {pos} = st;
    if (wv > 0) stage.text('중력파가 지나감', 540, 318, {size: 26, weight: 500, color: GW, align: 'center', alpha: wv});
    // tracked end mirror
    trackRing(c, pos.etmX[0], pos.etmX[1], 16, fadeIn(t, tl.at('s10') - 0.2));
    // equal-length ticks at the rest positions, and stretch words
    const tick = (u, w) => { const a = P(u, w), d = u ? st.dX : st.dY, n = [-d[1], d[0]]; line(c, [[a[0] - n[0] * 22, a[1] - n[1] * 22], [a[0] + n[0] * 22, a[1] + n[1] * 22]], rgba(T.muted, 0.7), 1.5, {dash: [4, 4]}); };
    tick(L_KM, 0); tick(0, L_KM);
    const ia = clamp(Math.abs(h) / 0.25) * wv;
    stage.text(h > 0 ? '늘어남' : '줄어듦', 900, 330, {size: 26, weight: 500, color: h > 0 ? T.up : T.down, alpha: ia, align: 'center'});
    stage.text(h > 0 ? '줄어듦' : '늘어남', 180, 330, {size: 26, weight: 500, color: h > 0 ? T.down : T.up, alpha: ia, align: 'center'});
    stage.text('X 팔', pos.etmX[0] + 60, pos.etmX[1] + 40, {size: 24, color: T.muted, align: 'center'});
    stage.text('Y 팔', pos.etmY[0] - 60, pos.etmY[1] + 40, {size: 24, color: T.muted, align: 'center'});
    stage.text('광검출기', pos.pd[0] + 40, pos.pd[1] + 10, {size: 24, color: Penv > 0.03 ? T.light : T.muted});
    stage.text('빔 분할기', pos.bs[0], pos.bs[1] + 120, {size: 24, color: T.muted, align: 'center'});
    // ---- middle: the beam-splitter zoom: two returning waves and their sum   |   s12: number card
    const y0 = 818, hh = 230, s12 = smooth((t - tl.at('s12') + 0.2) / 0.5);
    panel(c, T, 60, y0, 960, hh);
    line(c, [pos.bs, [540, y0]], rgba(T.muted, 0.35), 1.2, {dash: [4, 6]});
    if (s12 < 1) withAlpha(c, 1 - s12, () => {
      const x0 = 300, x1 = 760, A = 20, ph = -t * 2.2, rows = [[y0 + 44, 'X 팔에서 온 빛', XCOL, dphi / 2], [y0 + 108, 'Y 팔에서 온 빛', YCOL, -dphi / 2 + Math.PI]];
      for (const [y, lab, col, phi] of rows) {
        stage.text(lab, 84, y, {size: 24, color: col});
        waveRow(c, x0, x1, y, A, ph + phi, col, 2.4, TAU / 120);
      }
      const yS = y0 + 180;
      stage.text('겹친 빛', 84, yS, {size: 24, weight: 500, color: SUMC});
      const pts = []; for (let x = x0; x <= x1; x += 3) { const a = TAU / 120 * (x - x0) + ph; pts.push([x, yS - A * (Math.cos(a + dphi / 2) + Math.cos(a - dphi / 2 + Math.PI))]); }
      line(c, [[x0, yS], [x1, yS]], rgba(T.border, 1), 1);
      line(c, pts, SUMC, 3);
      stage.text('→ 광검출기', 84, yS + 30, {size: 24, color: T.muted});
      const anti = Penv < 0.03;
      const [l1, l2] = anti ? ['마루 + 골', '= 어두움'] : ['조금 어긋남', '→ 밝아짐'];
      const tagA = fadeIn(t, tl.at({sentence: 's10', word: '마루와'}) - 0.15, 0.4);
      withAlpha(c, tagA, () => {
        rect(c, 784, y0 + 60, 214, 112, 8, rgba(T.deep, 0.85), anti ? rgba(T.border, 1) : T.accent, 1.5);
        stage.text(l1, 891, y0 + 96, {size: 28, weight: 500, color: anti ? T.ink : T.light, align: 'center'});
        stage.text(l2, 891, y0 + 136, {size: 28, weight: 700, color: anti ? T.muted : T.light, align: 'center'});
      });
    });
    if (s12 > 0) withAlpha(c, s12, () => {
      stage.text('팔 길이 차이 (GW150914 최대)', 540, y0 + 36, {size: 24, color: T.muted, align: 'center'});
      textSup(stage, [['ΔL ≈ 4×10', false], ['−18', true], [' m', false]], 540, y0 + 88, {role: 'display', weight: 700, size: 52, color: T.light, align: 'center'});
      const a2 = fadeIn(t, tl.at({sentence: 's12', word: '양성자'}) - 0.1);
      stage.text('양성자 지름의 수백분의 1', 540, y0 + 142, {size: 30, weight: 500, color: T.ink, align: 'center', alpha: a2});
      const a3 = fadeIn(t, tl.at({sentence: 's12', word: '시계로는'}) - 0.1);
      withAlpha(c, a3, () => textSup(stage, [['빛이 그만큼 더 가는 시간 ≈ 10', false], ['−26', true], [' 초', false]], 540, y0 + 194, {size: 26, color: T.muted, align: 'center'}));
    });
    // ---- bottom: readouts + traces
    readoutsRecombine(stage, t, ctx, map, tau);
  },

  // ------------------------------------------------------------------ isolate: 4-stage pendulum
  isolate(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const gt = A_GROUND.map((a, i) => evT(ctx, i ? `ground${i}` : 'ground', a));
    const hear = stageHearing(t, gt), started = t >= gt[0] - 0.2;
    const cx = 540, yTop = 340, yG = 1010, ys = [440, 545, 650, 790];
    const disp = k => 11 * Math.pow(0.45, k);              // drawn sway (compressed); numbers below are the model
    const sway = (k, ph = 0) => disp(k) * Math.sin(t * TAU * 1.3 - k * 0.5 + ph) * (started ? 1 : 0.15);
    // ground
    const gx = sway(0);
    rect(c, 90 + gx, yG, 680, 40, 4, rgba('#5a4a3a', 0.55), rgba('#b8a994', 0.6), 1.5);
    for (let i = 0; i < 17; i++) line(c, [[110 + gx + i * 40, yG + 40], [130 + gx + i * 40, yG + 6]], rgba('#b8a994', 0.35), 1.5);
    stage.text('지면', 120 + gx, yG + 66, {size: 26, weight: 500, color: T.ink});
    // support frame (moves with the ground)
    const fx = sway(0);
    for (const x of [330, 750]) rect(c, x - 9 + fx, yTop, 18, yG - yTop, 3, rgba(T.muted, 0.35), rgba(T.muted, 0.7), 1.2);
    rect(c, 310 + fx, yTop - 22, 460, 24, 4, rgba(T.muted, 0.45), rgba(T.ink, 0.6), 1.5);
    // vacuum tube entering at mirror height, with the laser beam
    const ym = ys[3];
    line(c, [[60, ym - 30], [318, ym - 30]], rgba(T.muted, 0.7), 2.5); line(c, [[60, ym + 30], [318, ym + 30]], rgba(T.muted, 0.7), 2.5);
    rect(c, 60, ym - 28, 258, 56, 0, rgba(T.deep, 0.8));
    // chain
    let prev = [cx + fx, yTop];
    const masses = [];
    ys.forEach((y, i) => {
      const x = cx + sway(i + 1), mirror = i === 3, w = mirror ? 64 : 150, hgt = mirror ? 110 : 40;
      const fib = mirror ? [[-20, -20], [20, 20]] : [[-50, -50], [50, 50]];
      for (const [a, b] of fib) line(c, [[prev[0] + a * 0.6, prev[1]], [x + b * (mirror ? 1 : 0.9), y - hgt / 2]], mirror ? rgba('#E8F6FF', 0.9) : rgba(T.ink, 0.7), mirror ? 1.6 : 1.5);
      if (mirror) {
        beam(c, [60, y], [x - w / 2, y], 1, 3, 0.85);
        rect(c, x - w / 2, y - hgt / 2, w, hgt, 6, rgba(MIRROR, 0.85), rgba(T.ink, 0.95), 2);
        rect(c, x - w / 2, y - hgt / 2, 6, hgt, 2, rgba('#ffffff', 0.7));
      } else {
        rect(c, x - w / 2, y - hgt / 2, w, hgt, 5, mix(T.plate, '#8aa0a6', 0.35), rgba(T.ink, 0.7), 1.5);
        stage.text(`${i + 1}단`, x, y, {size: 24, weight: 500, color: T.ink, align: 'center'});
      }
      masses.push([x, y, Math.max(w, hgt) / 2]);
      prev = [x, y + hgt / 2];
    });
    // tracking ring on the listening point
    const ringOf = k => (k === 0 ? [cx + fx, yTop - 10, 40] : masses[k - 1]);
    if (started) { const [rx, ry, rr] = ringOf(hear); trackRing(c, rx, ry, rr * 0.75, 1); }
    // left labels
    const la = fadeIn(t, tl.at({sentence: 's13', word: '사십'}) - 0.2, 0.5);
    withAlpha(c, la, () => { const bx = cx - 100; line(c, [[bx + 8, ys[0] - 22], [bx, ys[0] - 22], [bx, ys[3] + 56], [bx + 8, ys[3] + 56]], rgba(T.ink, 0.8), 2); });
    leader(stage, '4단 진자', [cx - 100, ys[1] + 40], [250, ys[1] + 40], {alpha: la, size: 28, dot: false});
    leader(stage, '실리카 섬유', [cx - 16, ys[3] - 76], [250, 680], {alpha: la, size: 24, sub: `지름 ${FIBRE_MM} mm`});
    leader(stage, `${MIRROR_KG} kg 용융 실리카 거울`, [cx - 34, ys[3] + 40], [300, 880], {alpha: la, size: 26});
    stage.text('초고진공 관', 84, ym - 52, {size: 24, color: T.muted, alpha: fadeIn(t, tl.at('isolate') + 0.6)});
    stage.text('지지대', 284, yTop - 10, {size: 24, color: T.muted, align: 'right', alpha: fadeIn(t, tl.at('isolate') + 0.6)});
    // right column: motion at each level (10 Hz shaking), model numbers + log bars
    const rows = [[yG + 20, '지면', 0], [ys[0], '1단', 1], [ys[1], '2단', 2], [ys[2], '3단', 3], [ys[3], '거울', 4]];
    const words = ['1', '1/100', '1/1만', '1/100만', '1/1억'];
    const ra = fadeIn(t, gt[0] - 0.3, 0.5);
    withAlpha(c, ra, () => {
      stage.text(`${F_SEIS} Hz 흔들림`, 1000, 316, {size: 24, weight: 500, color: T.ink, align: 'right'});
      stage.text('지면 = 1', 1000, 348, {size: 24, color: T.muted, align: 'right'});
      rows.forEach(([y, lab, k], i) => {
        const vis = i === 0 ? 1 : fadeIn(t, gt[k] - 0.15, 0.4) * 0.65 + (t >= gt[k] - 0.15 ? 0.35 : 0.35 * fadeIn(t, gt[0], 0.5));
        const on = started && ((k === 0 && hear === 0) || (k > 0 && hear === k));
        withAlpha(c, vis, () => {
          const xb = 800, wb = 200, frac = (8 - 2 * k) / 8;    // log scale: 8 decades
          stage.text(words[k], 1000, y - 16, {role: 'display', weight: on ? 700 : 500, size: 26, color: on ? T.light : T.ink, align: 'right'});
          rect(c, xb, y + 8, wb, 12, 3, rgba(T.border, 1));
          rect(c, xb, y + 8, Math.max(3, wb * frac), 12, 3, on ? T.accent : rgba(T.muted, 0.9));
          // mini trace of the motion (display amplitude compressed like the drawing)
          const pts = []; for (let j = 0; j <= 40; j++) { const xx = 640 + j * 2.4; pts.push([xx, y - 22 + 10 * Math.pow(0.45, k) * Math.sin(j * 0.75 - t * 8)]); }
          if (k > 0) line(c, pts, on ? T.accent : rgba(T.ink, 0.6), 1.8);
          void lab;
        });
      });
      stage.text('로그 눈금', 800, yG + 64, {size: 24, color: T.muted});
    });
    // bottom: ground vs signal, and the per-stage rule
    const yb = 1150, a1 = fadeIn(t, tl.at({sentence: 's13', word: '일조'}) - 0.2, 0.5);
    withAlpha(c, a1 * (1 - smooth((t - tl.at({sentence: 's14', word: '박자보다'})) / 0.5)), () => {
      stage.text('지면 흔들림', 90, yb, {size: 26, weight: 500, color: T.ink});
      stage.text('중력파 신호', 90, yb + 56, {size: 26, weight: 500, color: T.ink});
      const x0 = 300, cw = 55;
      for (let k = 0; k < 12; k++) rect(c, x0 + k * cw + 2, yb - 13, cw - 4, 26, 3, rgba(T.down, 0.25 + 0.6 * clamp((t - tl.at({sentence: 's13', word: '일조'}) - k * 0.08) / 0.3)));
      rect(c, x0 + 2, yb + 43, 8, 26, 2, GW);
      stage.text('한 칸 = 10배', x0 + 2, yb + 102, {size: 24, color: T.muted});
      textSup(stage, [['약 1조 배 = 10', false], ['12', true]], 960, yb + 102, {role: 'display', weight: 700, size: 34, color: T.light, align: 'right'});
    });
    const a2 = fadeIn(t, tl.at({sentence: 's14', word: '박자보다'}) - 0.1, 0.5);
    withAlpha(c, a2, () => {
      stage.text(`진자의 박자 약 ${F_PEND} Hz · 흔들림 ${F_SEIS} Hz`, 540, yb - 6, {size: 28, weight: 500, color: T.ink, align: 'center'});
      textSup(stage, [['한 단마다 (1/10)', false], ['2', true], [' = 1/100', false]], 540, yb + 44, {size: 28, color: T.ink, align: 'center'});
      const a3 = fadeIn(t, gt[4] - 0.2, 0.5);
      stage.text(`${F_SEIS} Hz에서 1억분의 1`, 540, yb + 110, {role: 'display', weight: 700, size: 44, color: T.light, align: 'center', alpha: 0.35 + 0.65 * a3});
    });
  },

  // ------------------------------------------------------------------ coincide: two observatories
  coincide(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, map = mapOf(ctx), N = map.N;
    const tL = evT(ctx, 'sites', A_SITES), tg = evT(ctx, 'glitch', A_GLITCH);
    // ---- map
    const X0 = 220, Y0 = 300, W = 640, H = 330;
    const PM = (lon, lat) => [X0 + (lon + 125) / 58 * W, Y0 + (49.5 - lat) / 25 * H];
    const aMap = fadeIn(t, tl.at('coincide') + 0.1, 0.5);
    const H1 = PM(...SITE_H), L1 = PM(...SITE_L);
    withAlpha(c, aMap, () => {
      poly(c, US.map(([lo, la]) => PM(lo, la)), rgba(T.muted, 0.1), rgba(T.muted, 0.65), 1.5);
      // flashes when each site's peak passes
      const fl = [tL, tL + DT_HL_MS / 1000 * N].map(x => (t >= x && t < x + 0.8 ? 1 - (t - x) / 0.8 : 0));
      for (const [pt, f, name, sub, dx, dy, al] of [[H1, fl[1], '핸퍼드', '워싱턴주', -18, 0, 'right'], [L1, fl[0], '리빙스턴', '루이지애나주', 20, 6, 'left']]) {
        if (f > 0) ring(c, pt[0], pt[1], 10 + 30 * (1 - f), rgba(SUMC, f), 3);
        circle(c, pt[0], pt[1], 8, T.accent);
        stage.text(name, pt[0] + dx, pt[1] + dy - 14, {size: 26, weight: 500, color: T.ink, align: al});
        stage.text(sub, pt[0] + dx, pt[1] + dy + 16, {size: 24, color: T.muted, align: al});
      }
      // s17: direction — a plane wavefront reaching Livingston first, Hanford 6.9 ms later
      const s17b = tl.at({sentence: 's17', word: '그'}), wa = smooth((t - s17b + 0.2) / 0.5) * (1 - smooth((t - tl.at('s17:end') - 0.6) / 0.6));
      if (wa > 0) {
        const bx = H1[0] - L1[0], by = H1[1] - L1[1], bl = Math.hypot(bx, by), ub = [bx / bl, by / bl];
        const cosT = DT_HL_MS / LIGHT_MS, sinT = Math.sqrt(1 - cosT * cosT);
        const k = [ub[0] * cosT - ub[1] * sinT, ub[1] * cosT + ub[0] * sinT];   // propagation direction
        const sPos = ((t - s17b) * 0.22) % 1.4 - 0.2;                          // front position along k (in baseline units)
        const o = [L1[0] + k[0] * bl * sPos, L1[1] + k[1] * bl * sPos], nrm = [-k[1], k[0]];
        clipRect(c, X0 - 20, Y0 - 10, W + 40, H + 30, 0, () => withAlpha(c, wa, () => {
          line(c, [[o[0] - nrm[0] * 500, o[1] - nrm[1] * 500], [o[0] + nrm[0] * 500, o[1] + nrm[1] * 500]], rgba(GW, 0.8), 3);
          arrow(c, [o[0] - k[0] * 10, o[1] - k[1] * 10], [o[0] + k[0] * 50, o[1] + k[1] * 50], GW, 3, {head: 12});
        }));
        stage.text('도착 순서와 차이 → 온 방향', 540, Y0 + H + 22, {size: 24, weight: 500, color: GW, align: 'center', alpha: wa});
      }
      const aD = fadeIn(t, tl.at({sentence: 's16', word: '삼천'}) - 0.2, 0.5);
      withAlpha(c, aD, () => {
        line(c, [H1, L1], rgba(T.ink, 0.85), 2, {dash: [8, 6]});
        const m = [(H1[0] + L1[0]) / 2, (H1[1] + L1[1]) / 2];
        rect(c, m[0] + 22, m[1] - 60, 168, 82, 6, rgba(T.bg, 0.85));
        stage.text(`${fmt(SITE_KM)} km`, m[0] + 34, m[1] - 34, {role: 'display', weight: 700, size: 32, color: T.ink});
        stage.text(`빛으로 ${fmt(LIGHT_MS, 0)} ms`, m[0] + 34, m[1] + 4, {size: 24, color: T.muted});
      });
    });
    // ---- date card (s18)
    const aDate = fadeIn(t, tl.at('s18') - 0.1, 0.5);
    withAlpha(c, aDate, () => {
      rect(c, 230, 664, 620, 62, 8, rgba(T.plate, 0.95), T.accent, 2);
      stage.text('2015년 9월 14일 · GW150914', 540, 695, {role: 'display', weight: 700, size: 34, color: T.light, align: 'center'});
    });
    // ---- traces: brightness at the two sites, scrolling window of 100 ms (real), frozen after the event
    const y0 = 748, x0 = 250, x1 = 990, Wms = 100, Wv = Wms / 1000 * N;
    panel(c, T, 60, y0, 960, 590);
    // chart clock: runs with video time, pauses for GLITCH_PAUSE s just after the glitch (so it can be read), then
    // continues; the Livingston peak reaches "now" exactly at the 'sites' event (sound tick)
    const tcOf = tv => (tv < tg + 0.5 ? tv : tv < tg + 0.5 + GLITCH_PAUSE ? tg + 0.5 : tv - GLITCH_PAUSE);
    const tLc = tL - GLITCH_PAUSE, tc = tcOf(t);
    const tFreeze = tLc + 0.5 * Wv, tn = Math.min(tc, tFreeze), frozen = tc >= tFreeze || (t > tg + 0.5 && t < tg + 0.5 + GLITCH_PAUSE);
    const X = tv => x1 - (tn - tv) / Wv * (x1 - x0);
    const rowsY = [[y0 + 210, '리빙스턴', 0], [y0 + 440, '핸퍼드', 1]], amp = 260;
    stage.text('광검출기 밝기', 84, y0 + 34, {size: 24, color: T.muted});
    stage.text('시간 →', x1, y0 + 34, {size: 24, color: T.muted, align: 'right'});
    const gl = t >= tg - 0.05 ? 1 : 0, rej = smooth((t - tg - 0.9) / 0.5);
    for (const [yb, name, k] of rowsY) {
      stage.text(name, 84, yb - 40, {size: 28, weight: 500, color: T.ink});
      line(c, [[x0, yb], [x1, yb]], rgba(T.border, 1), 1.5);
      const pts = [], gpts = [];
      for (let i = 0; i <= 370; i++) {
        const tv = tn - Wv + Wv * i / 370, b = sitesBright(tv, map, tLc)[k];
        const noise = 0.012 * Math.sin(tv * 97.3 + k * 3) * Math.sin(tv * 41.1 + k);
        const gv = k === 1 && gl ? glitchAt(tv, tg, N) * (tv <= tc ? 1 : 0) : 0;
        pts.push([X(tv), yb - amp * 0.75 * (b + Math.abs(noise))]);
        gpts.push([X(tv), yb - amp * 0.75 * (gv)]);
      }
      line(c, pts, SUMC, 2.2);
      if (k === 1 && gl) {
        // glitch overlay: same colour first, then greyed and crossed out
        const xg = X(tg);
        if (xg > x0 + 10) {
          line(c, gpts.filter(q => q[0] > x0), rej > 0.5 ? rgba(T.muted, 0.55) : SUMC, 2.2);
          withAlpha(c, rej, () => {
            crossMark(c, xg, yb - 140, 1.1, T.accent);
            stage.text('한 곳에만 → 잡음', xg + (xg > 700 ? -24 : 24), yb - 140, {size: 24, weight: 500, color: T.accent, align: xg > 700 ? 'right' : 'left'});
          });
          withAlpha(c, 1 - rej, () => line(c, [[xg, yb - 186], [xg, rowsY[0][0] + 10]], rgba(T.ink, 0.25), 1.5, {dash: [4, 5]}));
        }
      }
    }
    // "now" cursor
    if (tc < tFreeze) { line(c, [[x1, y0 + 60], [x1, y0 + 560]], TRACK, 2.5); stage.text(frozen ? '멈춰 보기' : '지금', x1 - 8, y0 + 576, {size: 24, color: TRACK, align: 'right'}); }
    // coincidence window: during s17 a 10 ms band at "now"; in s18 anchored at the Livingston peak
    const pxPerMs = (x1 - x0) / Wms;
    const aWin = fadeIn(t, tl.at({sentence: 's17', word: '십'}) - 0.2, 0.5);
    withAlpha(c, aWin, () => {
      const xa = t >= tL ? X(tLc) : x1 - WINDOW_MS * pxPerMs, xb = xa + WINDOW_MS * pxPerMs;
      rect(c, xa, y0 + 70, xb - xa, 480, 0, rgba(GW, 0.10));
      line(c, [[xa, y0 + 70], [xa, y0 + 550]], rgba(GW, 0.7), 1.5, {dash: [5, 5]}); line(c, [[xb, y0 + 70], [xb, y0 + 550]], rgba(GW, 0.7), 1.5, {dash: [5, 5]});
      const yl = y0 + 304;
      stage.text(`일치 창 ${WINDOW_MS} ms`, xa - 10, yl, {size: 24, weight: 500, color: GW, align: 'right'});
    });
    // 6.9 ms bracket between the two peaks (after the event)
    const aD = smooth((t - tL - DT_HL_MS / 1000 * N - 0.3) / 0.5);
    if (aD > 0) withAlpha(c, aD, () => {
      const xa = X(tLc), xb = X(tLc + DT_HL_MS / 1000 * N), yb = rowsY[1][0] + 46;
      line(c, [[xa, rowsY[0][0] + 4], [xa, yb]], rgba(T.ink, 0.5), 1.5, {dash: [4, 4]});
      line(c, [[xa, yb], [xb, yb]], T.light, 2.5); line(c, [[xa, yb - 8], [xa, yb + 8]], T.light, 2.5); line(c, [[xb, yb - 8], [xb, yb + 8]], T.light, 2.5);
      stage.text(`${DT_HL_MS} ms`, xb + 14, yb + 2, {role: 'display', weight: 700, size: 30, color: T.light});
      checkMark(c, xb + 150, yb, 1.1, GOOD);
      stage.text('같은 모양', xb + 176, yb + 2, {size: 26, weight: 500, color: GOOD});
    });
  },

  // ------------------------------------------------------------------ myth: not a stopwatch
  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, tl = ctx.tl;
    const w = word => tl.at({sentence: 's19', word});
    const aL = fadeIn(t, w('라이고는') - 0.2, 0.5), xL = fadeIn(t, w('재지') - 0.1, 0.4);
    const aR = fadeIn(t, w('두') - 0.2, 0.5), xR = fadeIn(t, w('비교하므로') - 0.1, 0.4);
    const yc = 670, cl = 290, cr = 790;
    line(c, [[540, 400], [540, 1080]], rgba(T.border, 1), 2);
    withAlpha(c, aL * (1 - 0.45 * xL), () => {
      // stopwatch
      const r = 130;
      rect(c, cl - 18, yc - r - 40, 36, 26, 4, rgba(T.muted, 0.6), rgba(T.ink, 0.7), 1.5);
      ring(c, cl, yc, r, rgba(T.ink, 0.85), 5);
      for (let k = 0; k < 60; k++) { const a = k / 60 * TAU, l = k % 5 === 0 ? 16 : 7; line(c, [[cl + Math.sin(a) * (r - 8), yc - Math.cos(a) * (r - 8)], [cl + Math.sin(a) * (r - 8 - l), yc - Math.cos(a) * (r - 8 - l)]], rgba(T.ink, 0.6), k % 5 === 0 ? 2.5 : 1.2); }
      const ah = t * 1.6; line(c, [[cl, yc], [cl + Math.sin(ah) * (r - 30), yc - Math.cos(ah) * (r - 30)]], T.accent, 3.5); circle(c, cl, yc, 7, T.ink);
    });
    withAlpha(c, aL, () => {
      stage.text('도착 시간을 시계로?', cl, yc + 220, {role: 'display', weight: 700, size: 34, color: T.ink, align: 'center'});
      withAlpha(c, xL, () => textSup(stage, [['필요한 차이 ≈ 10', false], ['−26', true], [' 초', false]], cl, yc + 270, {size: 26, color: T.muted, align: 'center'}));
    });
    if (xL > 0) withAlpha(c, xL, () => crossMark(c, cl, yc, 5.5, T.accent));
    withAlpha(c, aR, () => {
      const x0 = cr - 160, x1 = cr + 170, A = 26, d = Math.PI * (1 - 0.35 * smooth((t - w('비교하므로')) / 1.2) * (1 - smooth((t - w('예민합니다.') - 0.6) / 0.6)));
      stage.text('빛 1', x0 - 8, yc - 130, {size: 24, color: XCOL, align: 'right'}); waveRow(c, x0, x1, yc - 130, A, -t * 2, XCOL, 2.4, TAU / 110);
      stage.text('빛 2', x0 - 8, yc - 50, {size: 24, color: YCOL, align: 'right'}); waveRow(c, x0, x1, yc - 50, A, -t * 2 + d, YCOL, 2.4, TAU / 110);
      const pts = []; for (let x = x0; x <= x1; x += 3) { const a = TAU / 110 * (x - x0) - t * 2; pts.push([x, yc + 40 - A * (Math.cos(a) + Math.cos(a + d))]); }
      line(c, [[x0, yc + 40], [x1, yc + 40]], rgba(T.border, 1), 1); line(c, pts, SUMC, 3);
      const Pd = (1 + Math.cos(d)) / 2;
      detector(c, cr, yc + 130, 1, Pd * 1.6, T);
      stage.text('두 빛을 직접 겹침', cr, yc + 220, {role: 'display', weight: 700, size: 34, color: T.ink, align: 'center'});
      stage.text('어긋남이 곧 밝기', cr, yc + 270, {size: 26, color: T.muted, align: 'center'});
    });
    if (xR > 0) withAlpha(c, xR, () => checkMark(c, cr + 120, yc + 128, 2.2, GOOD));
  },

  // ------------------------------------------------------------------ close
  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme;
    stage.text('정리', 540, 430, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, alpha: smooth(p / 0.15)});
    endCard(stage, {takeaway: '“두 팔의 길이 차이를\n자로 재지 않고,\n겹친 빛의 밝기로 읽는다”', lines: [], p, y: 640});
    const tC = evT(ctx, 'closeglow', A_CLOSE), b = 0.55 * Math.exp(-(((t - tC - 0.35) / 0.45) ** 2));
    const a = smooth((p - 0.1) / 0.15);
    withAlpha(c, a, () => {
      const P = planP(540, 1090, 34);
      drawIFO(stage, P, {tubeW: 6, beamW: 1.8, mirrorLen: 12, cavityW: 1.2, bright: b * 1.6});
      meter(stage, 390, 1250, 300, b, {label: '광검출기 밝기', size: 24, darkBelow: 0.05});
    });
  },
};

// =====================================================================================================
// Bottom readout panels (y 1062 … 1336)
// =====================================================================================================
function readoutsSplit(stage, t, ctx, passes, alpha = 1) {
  const {ctx: c} = stage, T = stage.theme, y0 = 1062, h = 274;
  withAlpha(c, alpha, () => {
    panel(c, T, 60, y0, 960, h);
    const rows = [['팔 X 길이', `${fmt(L_ARM_M, 3)} m`], ['팔 Y 길이', `${fmt(L_ARM_M, 3)} m`], ['두 팔 길이 차이', '0 m']];
    rows.forEach(([lab, val], i) => {
      const y = y0 + 50 + i * 86;
      stage.text(lab, 84, y, {size: 26, color: T.muted});
      stage.text(val, 490, y, {role: 'display', weight: 500, size: 38, color: i === 2 ? T.light : T.ink, align: 'right'});
    });
    line(c, [[514, y0 + 16], [514, y0 + h - 16]], rgba(T.border, 1), 1.5);
    stage.text('레이저 파장', 540, y0 + 50, {size: 26, color: T.muted});
    stage.text('1064 nm', 996, y0 + 50, {role: 'display', weight: 500, size: 38, color: T.ink, align: 'right'});
    stage.text('빛이 달린 거리', 540, y0 + 136, {size: 26, color: T.muted});
    stage.text(`${fmt(passes * L_KM)} km`, 996, y0 + 136, {role: 'display', weight: 500, size: 38, color: passes >= N_PASS ? T.light : T.ink, align: 'right'});
    meter(stage, 540, y0 + 236, 456, 0, {label: '광검출기 밝기', size: 26});
  });
}

function readoutsRecombine(stage, t, ctx, map, tau) {
  const {ctx: c} = stage, T = stage.theme, tl = ctx.tl, y0 = 1062, h = 274;
  panel(c, T, 60, y0, 960, h);
  const passing = tau >= TAU0 && tau <= RD_LEN;
  const dL = dLAt(tau), Pb = brightAt(tau);
  // left column
  stage.text('두 팔 길이 차이', 84, y0 + 34, {size: 24, color: T.muted});
  textSup(stage, sciParts(dL, 'm'), 84, y0 + 76, {role: 'display', weight: 500, size: 36, color: passing ? T.light : T.ink});
  stage.text('중력파 진동수', 84, y0 + 128, {size: 24, color: T.muted});
  stage.text(passing ? `${fmt(fgw(tau))} Hz` : '—', 84, y0 + 168, {role: 'display', weight: 500, size: 36, color: passing ? T.ink : T.muted});
  const Penv = passing ? powerOf(DPHI_PEAK * envAt(tau) * smooth((tau - TAU0) / 0.03)) : 0;
  meter(stage, 84, y0 + 246, 340, Pb, {label: '밝기', size: 24, stateP: Penv});
  line(c, [[454, y0 + 16], [454, y0 + h - 16]], rgba(T.border, 1), 1.5);
  // traces on a fixed real-time axis; "지금" marker walks with the slow-motion clock
  const gx0 = 478, gx1 = 996, ta = TAU0 - 0.04, tb = RD_LEN + 0.06, X = s => gx0 + (gx1 - gx0) * (s - ta) / (tb - ta);
  const now = clamp(tau, ta, tb), xn = X(now);
  const yD = y0 + 86, yP = y0 + 222, aD = 44, aP = 70;
  stage.text('두 팔 길이 차이', gx0, y0 + 26, {size: 24, color: T.muted});
  stage.text('밝기', gx0, yP - aP - 14, {size: 24, color: T.muted});
  line(c, [[gx0, yD], [gx1, yD]], rgba(T.border, 1), 1); line(c, [[gx0, yP], [gx1, yP]], rgba(T.border, 1), 1);
  const dp = [], pp = [];
  for (let i = 0; i <= 520; i++) {
    const s = ta + (tb - ta) * i / 520; if (s > now) break;
    dp.push([X(s), yD - aD * hModel(s)]); pp.push([X(s), yP - aP * 2 * brightAt(s)]);
  }
  if (dp.length > 1) { line(c, dp, XCOL, 1.8); line(c, pp, SUMC, 1.8); }
  // scale: peak ΔL tick, time marks (real)
  textSup(stage, [['4×10', false], ['−18', true], [' m', false]], gx1, y0 + 26, {size: 24, color: T.muted, align: 'right'});
  const live = t < map.t(tb) + 0.3;
  for (const [s, lab] of [[-0.5, '−0.5초'], [0, '0']]) { const x = X(s); line(c, [[x, yP + 4], [x, yP + 12]], rgba(T.muted, 0.8), 1.5); if (!live || Math.abs(x - xn) > 60) stage.text(lab, x, yP + 30, {size: 24, color: T.muted, align: 'center'}); }
  if (live) { line(c, [[xn, y0 + 44], [xn, yP + 6]], TRACK, 2.5); stage.text('지금', Math.min(xn + 8, gx1 - 50), yP + 30, {size: 24, color: TRACK}); }
  void tl;
}

/** Drawn after the scene, before captions. */
function baseOverlays(stage, t, ctx) {
  const id = ctx.scene.id;
  let [kicker, title] = titles[id] || ['', ''];
  if (id === 'recombine' && t >= ctx.tl.at(A_GW_START) - 0.3) [kicker, title] = [`중력파 통과 · 실제 0.5초를 ${mapOf(ctx).label}× 느리게`, '한 팔은 늘고, 한 팔은 줄고'];
  if (id === 'recombine' && t >= ctx.tl.at('s12') - 0.3) [kicker, title] = ['얼마나 작은 차이일까', '밝기가 드러낸 길이 차이'];
  if (title || kicker) header(stage, {kicker, title, p: ctx.scene.p, size: title.includes('\n') ? 64 : 58});
  progressBar(stage, t, ctx.tl.duration);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound parameters into sound.json
// =====================================================================================================
export function brightnessPoints(map) {
  const pts = [[0, 220, 0]], tr = tau => +(map.t(tau) - map.tA).toFixed(4);
  let tau = TAU0;
  while (tau < RD_LEN + 0.004) { pts.push([tr(tau), 220, +brightAt(tau).toFixed(4)]); tau += 1 / (fgw(tau) * 24); }
  pts.push([tr(RD_LEN + 0.012), 220, 0]);
  return pts.filter((p, i) => i === 0 || p[0] > pts[i - 1][0]);
}
export function essPoints(tE, tEnd) {
  const pts = [];
  for (let s = 0; s <= tEnd + 0.8 - tE; s += 0.05) { const d = essDelta(tE + s, tE, tEnd); pts.push([+s.toFixed(3), 220, +((1 + Math.cos(d)) / 2).toFixed(4)]); }
  pts[pts.length - 1][2] = 0;
  return pts;
}
export function bounceLayers(tb, tEnd) {
  const out = [];
  for (let k = 1; k <= 24; k++) {
    const g = k <= SLOW_PASSES ? -28 : -28 - 18 * (k - SLOW_PASSES) / 16;
    out.push({kind: 'tick', offset: +(passTime(k, tb, tEnd) - tb).toFixed(4), params: {freq: 2400, decay: 0.03, click: 0.2, gain_db: +g.toFixed(1)}});
  }
  return out;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(here), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(here, 'sound.json')), sound = JSON.parse(fs.readFileSync(soundFile, 'utf8'));
  const map = gwMap(tl), ev = id => { const e = sound.events.find(x => x.id === id); if (!e) throw new Error(`sound.json has no event "${id}"`); return e; };
  const b = ev('brightness'); b.at = A_GW_START; b.params = {...b.params, points: brightnessPoints(map)};
  b.model = {N: +map.N.toFixed(3), t_start: +map.tA.toFixed(3), t_peak: +map.tM.toFixed(3), tau0: +TAU0.toFixed(5), dphi_peak: 'pi/2', p_peak: 0.5};
  const tE = tl.at(A_ESS), tEnd = tl.at('s07:end'), e = ev('essglow'); e.at = A_ESS; e.params = {...e.params, points: essPoints(tE, tEnd)};
  const tb = tl.at(A_BOUNCE), tbe = tl.at(A_BOUNCE_END), bo = ev('bounce'); bo.at = A_BOUNCE; bo.params = {...bo.params, gain_db: 0, layers: bounceLayers(tb, tbe)};
  const gt = A_GROUND.map(a => tl.at(a)), gEnd = tl.at('isolate:end');
  gt.forEach((x, i) => { const g = ev(i ? `ground${i}` : 'ground'); g.at = A_GROUND[i]; g.params = {...g.params, dur: +((i < 4 ? gt[i + 1] : gEnd) - x + 0.15).toFixed(3), gain_db: -22 - 8 * i}; });
  const si = ev('sites'); si.at = A_SITES; si.params = {...si.params, repeat: 2, interval: +(DT_HL_MS / 1000 * map.N).toFixed(4)};
  ev('glitch').at = A_GLITCH; ev('splitbeam').at = A_SPLIT; ev('closeglow').at = A_CLOSE;
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]') + '\n');
  console.log(`brightness: ${b.params.points.length} points, N = ${map.N.toFixed(2)} (label ${map.label}×), peak at ${map.tM.toFixed(3)} s; sites interval ${si.params.interval} s`);
}

// First frame = thumbnail (2026-11-07 retrofit, user request): poster 0–0.9 s, morph away 0.9–1.7 s, back at the last
// sentence. Config and key picture: episodes/ligo-how-it-works/poster.json, poster-key.jpg (pipeline/render/posterintro.mjs).
import {posterIntro} from '../../pipeline/render/posterintro.mjs';
export const overlays = await posterIntro(baseOverlays, {slug: 'ligo-how-it-works'});
