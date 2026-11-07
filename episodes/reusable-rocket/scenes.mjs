// Episode scenes — "로켓은 어떻게 돌아올까 — 저궤도와 재사용 로켓" (31)
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Orbit / energy: v = √(GM/r), GM = 398,600 km³/s², R = 6,371 km. Per kg: rising to 400 km costs GM(1/R − 1/(R+h)) = 3.70 MJ,
//    moving at 7.8 km/s costs ½v² = 30.4 MJ → × 8.2 ("여덟 배쯤"). Seoul–Busan straight line 325 km ÷ 7.8 km/s = 42 s.
//  - Newton's cannon (s06): exact two-body arcs (RK4) from 400 km with horizontal 4.0 / 6.0 / 7.2 / 7.8 km/s. The first three hit
//    the ground 13° / 26° / 58° downrange, 7.8 km/s goes round (400 × 869 km ellipse, one turn 5,836 s). Altitudes drawn ×4.
//  - Rocket equation (s08–s09): Δv = vₑ·ln(m₀/m₁), vₑ = 3.0 km/s (kerosene engine); 9.4 km/s needed (7.8 + gravity, air, steering)
//    → fuel fraction 1 − e^(−9.4/3.0) = 95.6 % ("95퍼센트 가까이").
//  - Ascent (explanatory 2D model, round Earth, exponential air): stage 1 thrust 7.5 MN, 549 t, 2.6 t/s, 8 s vertical, small kick,
//    then gravity turn; cut-off at T+150 s ("2분 반쯤") at 70.1 km, 84.7 km downrange, 2.4 km/s. Stage 2 (vₑ 3.35 km/s, 120 → 21 t,
//    360 s, linear pitch steering) reaches 200 km, 7.73 km/s at 1,519 km downrange. Ideal Δv 3.57 + 5.84 = 9.41 km/s; 82 % ends up as
//    orbital (sideways) speed, the rest is lost to gravity and steering (drag small in this model).
//  - First-stage return (same integrator): flip 10 s, boostback 45 m/s² for D (solved so that the stage comes down on the pad,
//    D = 64.1 s), coast (apogee 132 km), entry burn 40 m/s² for 18 s from 60 km, air braking (CdA/m 4.5×10⁻⁴ m²/kg), landing burn
//    20 m/s² with ignition height solved (2.46 km) so that height and speed reach 0 together; touchdown T+488 s.
//    Ghosts (explanatory): ignition 1.35 × higher → stops 491 m up and starts to climb; 0.62 × → hits the pad at 118 m/s.
//  - Landing forces (representative): empty stage ≈ 30 t → weight ≈ 294 kN; one engine at its lowest setting ≈ 340 kN (≈ 40 %).
//  - Look: a generic two-stage liquid rocket (white body, grey interstage, grid fins, four legs). No company livery or logo;
//    product names only as small labels (Falcon 9, Super Heavy). Rocket sizes in the trajectory pictures are exaggerated.
//  - Time: ascent 150 s shown ≈ 27×, return ≈ 20×, the last 26 s of the landing ≈ 1.7×, cannon shots ≈ 2,000×.
//  - Sound: node episodes/reusable-rocket/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, clipEllipse, TAU, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = {base: 'graphite', accent: '#FF7A1A'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
// ---- orbit and energy (km, s; km²/s² = MJ/kg) ----
export const GM = 398600.4418, RE = 6371;
export const vCirc = h => Math.sqrt(GM / (RE + h));
export const PE = h => GM * (1 / RE - 1 / (RE + h));
export const V_ORB = 7.8, H_ISS = 400;
export const E_UP = PE(H_ISS), E_SIDE = 0.5 * V_ORB * V_ORB, E_RATIO = E_SIDE / E_UP;          // 3.70, 30.4, 8.2
export const SEOUL_BUSAN = 325, SB_SEC = SEOUL_BUSAN / V_ORB;                                    // km (straight line), 41.7 s
// ---- rocket equation (single stage, kerosene engine) ----
export const VE = 3.0, DV_NEED = 9.4;
export const dvOf = f => -VE * Math.log(1 - Math.min(f, 0.9999));
export const F_NEED = 1 - Math.exp(-DV_NEED / VE);                                             // 0.956
// ---- Newton's cannon at 400 km (s06): exact two-body arcs, RK4 ----
export const CANNON_V = [4.0, 6.0, 7.2, 7.8];
function cannonArc(v0, h0 = H_ISS) {
  let x = 0, y = RE + h0, vx = v0, vy = 0, t = 0, ang = 0, prevA = 0; const dt = 4, pts = [[0, h0, 0]];
  const acc = (px, py) => { const r3 = Math.hypot(px, py) ** 3; return [-GM * px / r3, -GM * py / r3]; };
  for (let n = 0; n < 20000; n++) {
    const k1 = acc(x, y), x2 = x + vx * dt / 2, y2 = y + vy * dt / 2, v2x = vx + k1[0] * dt / 2, v2y = vy + k1[1] * dt / 2, k2 = acc(x2, y2);
    const x3 = x + v2x * dt / 2, y3 = y + v2y * dt / 2, v3x = vx + k2[0] * dt / 2, v3y = vy + k2[1] * dt / 2, k3 = acc(x3, y3);
    const x4 = x + v3x * dt, y4 = y + v3y * dt, v4x = vx + k3[0] * dt, v4y = vy + k3[1] * dt, k4 = acc(x4, y4);
    x += dt / 6 * (vx + 2 * v2x + 2 * v3x + v4x); y += dt / 6 * (vy + 2 * v2y + 2 * v3y + v4y);
    vx += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); vy += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); t += dt;
    let a = Math.atan2(x, y); if (a < prevA - Math.PI) a += TAU; ang += a - prevA; prevA = a;
    const h = Math.hypot(x, y) - RE;
    if (h <= 0) { pts.push([ang, 0, t]); return {v0, pts, hit: true, T: t, angEnd: ang}; }
    pts.push([ang, h, t]);
    if (ang >= TAU * 1.03) return {v0, pts, hit: false, T: t, angEnd: ang};
  }
  return {v0, pts, hit: false, T: t};
}
export const CANNON = CANNON_V.map(v => cannonArc(v));
export const ORBIT_T = (() => { const p = CANNON[3].pts.find(q => q[0] >= TAU); return p ? p[2] : CANNON[3].T; })();
export function cannonAt(arc, tau) {                       // tau = real seconds since the shot → [angle, h]
  const P = arc.pts; if (tau <= 0) return [0, P[0][1]];
  if (tau >= P.at(-1)[2]) return [P.at(-1)[0], P.at(-1)[1]];
  const i = Math.min(P.length - 2, Math.floor(tau / 4)), q = (tau - P[i][2]) / (P[i + 1][2] - P[i][2]);
  return [P[i][0] + (P[i + 1][0] - P[i][0]) * q, P[i][1] + (P[i + 1][1] - P[i][1]) * q];
}
// ---- ascent and first-stage return (2D, round Earth, exponential air; explanatory model) ----
const G_SI = 398600.4418e9, R_SI = 6371e3, DT = 0.05, REC = 5;
const rhoAir = h => 1.225 * Math.exp(-Math.max(0, h) / 8500);
export const ASC = {T: 7.5e6, m0: 549e3, mdot: 2.6e3, kickT: 8, kick: 0.033, tMeco: 150, CdA: 5.25};
export const S2 = {coast: 3, tb: 360, m0: 120e3, mf: 21e3, ve: 3350, p0: 0.55, p1: 0.025};
export const RET = {flip: 10, abb: 45, hEntry: 60e3, aEn: 40, dEn: 18, CdA_m: 4.5e-4, aL: 20};
const frame = S => { const r = Math.hypot(S.px, S.py), up = [S.px / r, S.py / r]; return {r, up, east: [up[1], -up[0]], h: r - R_SI}; };
function step(S, th, CdA_m) {
  const f = frame(S), v = Math.hypot(S.vx, S.vy), k = -G_SI / f.r ** 3, d = 0.5 * rhoAir(f.h) * v * CdA_m;
  const ax = k * S.px + th[0] - d * S.vx, ay = k * S.py + th[1] - d * S.vy;
  S.vx += ax * DT; S.vy += ay * DT; S.px += S.vx * DT; S.py += S.vy * DT; S.t += DT;
  return {d: d * v, g: -k * f.r};
}
const snap = (S, ph) => { const f = frame(S); return {t: +S.t.toFixed(3), x: Math.atan2(S.px, S.py) * R_SI / 1e3, h: f.h / 1e3, vu: (S.vx * f.up[0] + S.vy * f.up[1]) / 1e3, ve: (S.vx * f.east[0] + S.vy * f.east[1]) / 1e3, ph}; };
function runAscent() {
  const S = {px: 0, py: R_SI, vx: 0, vy: 0, t: 0}, out = [snap(S, 'ascent')]; let m = ASC.m0, n = 0, dvIdeal = 0, dvGrav = 0, dvDrag = 0;
  while (S.t < ASC.tMeco - 1e-9) {
    const f = frame(S), v = Math.hypot(S.vx, S.vy); let dir;
    if (S.t < ASC.kickT) dir = f.up;
    else if (S.t < ASC.kickT + 4) { const a = ASC.kick * (S.t - ASC.kickT) / 4; dir = [f.up[0] * Math.cos(a) + f.east[0] * Math.sin(a), f.up[1] * Math.cos(a) + f.east[1] * Math.sin(a)]; }
    else dir = [S.vx / v, S.vy / v];
    const su = v ? (S.vx * f.up[0] + S.vy * f.up[1]) / v : 1;
    const r = step(S, [ASC.T / m * dir[0], ASC.T / m * dir[1]], ASC.CdA / m); dvIdeal += ASC.T / m * DT; dvGrav += r.g * su * DT; dvDrag += r.d * DT;
    m -= ASC.mdot * DT; if (++n % REC === 0) out.push(snap(S, 'ascent'));
  }
  return {S, out, dv: {ideal: dvIdeal, grav: dvGrav, drag: dvDrag}};
}
function runStage2(S0) {
  const S = {...S0}, out = []; const mdot = (S2.m0 - S2.mf) / S2.tb, t0 = S.t; let m = S2.m0, n = 0, dvIdeal = 0;
  while (S.t < t0 + S2.coast + S2.tb - 1e-9) {
    const f = frame(S), u = (S.t - t0 - S2.coast) / S2.tb; let th = [0, 0];
    if (u >= 0) { const p = S2.p0 + (S2.p1 - S2.p0) * u, a = mdot * S2.ve / m; th = [(f.east[0] * Math.cos(p) + f.up[0] * Math.sin(p)) * a, (f.east[1] * Math.cos(p) + f.up[1] * Math.sin(p)) * a]; m -= mdot * DT; dvIdeal += a * DT; }
    step(S, th, 0); if (++n % REC === 0) out.push(snap(S, u >= 0 ? 'stage2' : 'coast2'));
  }
  return {out, dv: {ideal: dvIdeal}};
}
function runReturn(S0, D, H) {
  const S = {...S0}, out = []; let ph = 'flip', tb = S.t, n = 0;
  for (let k = 0; k < 40000; k++) {
    const f = frame(S), v = Math.hypot(S.vx, S.vy), vu = S.vx * f.up[0] + S.vy * f.up[1];
    let th = [0, 0];
    if (ph === 'flip' && S.t - tb >= RET.flip - 1e-9) { ph = 'boostback'; tb = S.t; }
    if (ph === 'boostback') { if (S.t - tb >= D - 1e-9) { ph = 'coast'; tb = S.t; } else th = [-f.east[0] * RET.abb, -f.east[1] * RET.abb]; }
    if (ph === 'coast' && vu < 0 && f.h < RET.hEntry) { ph = 'entry'; tb = S.t; }
    if (ph === 'entry') { if (S.t - tb >= RET.dEn - 1e-9) { ph = 'aero'; tb = S.t; } else th = [-S.vx / v * RET.aEn, -S.vy / v * RET.aEn]; }
    if (ph === 'aero' && f.h <= H) { ph = 'landing'; tb = S.t; }
    if (ph === 'landing') { if (vu >= 0) { out.push(snap(S, 'stop')); return {out, end: 'stop', h: f.h, x: Math.atan2(S.px, S.py) * R_SI}; } th = [-S.vx / v * RET.aL, -S.vy / v * RET.aL]; }
    step(S, th, RET.CdA_m);
    if (++n % REC === 0 || ph === 'landing') out.push(snap(S, ph));
    if (frame(S).h < 0) { out.push(snap(S, 'crash')); return {out, end: 'crash', h: 0, x: Math.atan2(S.px, S.py) * R_SI, v: Math.hypot(S.vx, S.vy)}; }
  }
  return {out, end: 'none'};
}
function solveLanding(S0, D) { let lo = 200, hi = 15000; for (let i = 0; i < 30; i++) { const H = (lo + hi) / 2, r = runReturn(S0, D, H); if (r.end === 'crash') lo = H; else hi = H; } return hi; }
export const MODEL = (() => {
  const A = runAscent(), meco = A.out.at(-1), s2 = runStage2(A.S);
  let lo = 40, hi = 90;                                        // boostback length so that the stage comes down on the pad (x = 0)
  for (let i = 0; i < 22; i++) { const D = (lo + hi) / 2, H = solveLanding(A.S, D), r = runReturn(A.S, D, H); if (r.x > 0) lo = D; else hi = D; }
  const D = (lo + hi) / 2, H = solveLanding(A.S, D), R = runReturn(A.S, D, H);
  const ret = R.out, first = ph => ret.find(q => q.ph === ph);
  const T = {meco: meco.t, bb0: first('boostback').t, bb1: first('coast').t, en0: first('entry').t, en1: first('aero').t, ign: first('landing').t, touch: ret.at(-1).t};
  const apo = ret.reduce((a, q) => (q.h > a.h ? q : a), ret[0]);
  const early = runReturn(A.S, D, H * 1.35), late = runReturn(A.S, D, H * 0.62);
  const end2 = s2.out.at(-1), vFinal = Math.hypot(end2.ve, end2.vu), dvIdeal = A.dv.ideal + s2.dv.ideal;
  return {asc: A.out, meco, s2: s2.out, ret, D, H, T, apo, ign: first('landing'), early: early.out, late: late.out, lateV: late.v,
    earlyStop: early.out.at(-1).h, dvIdeal, vFinal, sideFrac: vFinal * 1000 / dvIdeal};
})();
/** state at mission time t (s) along a recorded path (linear interpolation, clamped) */
export function sampleAt(path, t) {
  if (t <= path[0].t) return path[0]; if (t >= path.at(-1).t) return path.at(-1);
  let lo = 0, hi = path.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].t <= t) lo = m; else hi = m; }
  const a = path[lo], b = path[hi], q = (t - a.t) / (b.t - a.t || 1);
  return {t, x: a.x + (b.x - a.x) * q, h: a.h + (b.h - a.h) * q, vu: a.vu + (b.vu - a.vu) * q, ve: a.ve + (b.ve - a.ve) * q, ph: a.ph};
}
export const FULL = [...MODEL.asc, ...MODEL.s2];                   // launch → orbit (stage 2 after cut-off)
export const BACK = [...MODEL.asc, ...MODEL.ret];                  // launch → stage 1 back on the pad
export const speedOf = s => Math.hypot(s.vu, s.ve);
/** height shown in the landing view: the model stops a few metres up (step size), close that gap linearly over the burn */
const HEND = MODEL.ret.at(-1).h;
export const hShow = q => Math.max(0, q.h - HEND * clamp((q.t - MODEL.T.ign) / (MODEL.T.touch - MODEL.T.ign)));
export const pitchDeg = s => Math.atan2(s.vu, s.ve) * 180 / Math.PI;
// ---- landing-burn force picture (representative values) ----
export const LAND = {massT: 30, minKN: 340, weightKN: 30 * 9.81};
export const MIN_TW = LAND.minKN / LAND.weightKN;                                                 // ≈ 1.16

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  lift: W('s01', '궤도와,'), reuse1: W('s01', '다시'),
  y2015: W('s02', '이천십오년'), dec: W('s02', '십이월,'), sat2: W('s02', '위성을'), stage2w: W('s02', '일단이'), pad2: W('s02', '발사장으로'), back2: W('s02', '되돌아와'), upright: W('s02', '똑바로'), stand2: W('s02', '서서'), land2: W('s02', '내려앉았습니다.'),
  y2026: W('s03', '이천이십육년'), aug: W('s03', '팔월에는,'), same3: W('s03', '같은'), one3: W('s03', '하나가'), n37: W('s03', '서른일곱'), flight3: W('s03', '비행을'),
  leo4: W('s04', '궤도는'), km2000: W('s04', '이천킬로미터'), iss4: W('s04', '우주정거장과'), comm4: W('s04', '통신위성'), many4: W('s04', '만여'),
  orbit5: W('s05', '궤도에'), high5: W('s05', '높이'), not5: W('s05', '아니라,'), side5: W('s05', '옆으로'), fast5: W('s05', '빠르게'),
  fall6: W('s06', '떨어지지'), around6: W('s06', '돌려면'), speed6: W('s06', '초속'), v78: W('s06', '칠'), seoul: W('s06', '서울에서'), busan: W('s06', '부산까지'), min1: W('s06', '일분이'),
  this7: W('s07', '빠르기를'), energy7: W('s07', '에너지는,'), high7: W('s07', '높이까지'), rise7: W('s07', '오르는'), eight7: W('s07', '여덟'),
  y1903: W('s08', '천구백삼년'), tsiol: W('s08', '치올콥스키는,'), rocket8: W('s08', '로켓이'), full8: W('s08', '연료를'), empty8: W('s08', '빈'), ratio8: W('s08', '비에'),
  orbit9: W('s09', '오르려면'), pct95: W('s09', '구십오퍼센트'), fuel9: W('s09', '연료여야'), used9: W('s09', '쓴'), drop9: W('s09', '떼어'), stages9: W('s09', '여러'),
  burn10: W('s10', '이분'), up10: W('s10', '칠십킬로미터쯤까지'), sep10: W('s10', '떨어져'),
  flip11: W('s11', '뒤집고'), engine11: W('s11', '엔진을'), pad11: W('s11', '발사장'),
  air12: W('s12', '공기'), again12: W('s12', '한'), slow12: W('s12', '속도를'), fins12: W('s12', '격자'), steer12: W('s12', '방향을'),
  last13: W('s13', '마지막에는'), one13: W('s13', '하나를'), weak13: W('s13', '가장'), on13: W('s13', '켜도'), weight13: W('s13', '무게보다'), hover13: W('s13', '공중에'), cannot13: W('s13', '없습니다.'),
  both14: W('s14', '높이와'), zero14: W('s14', '영이'), moment14: W('s14', '바로'), legs14: W('s14', '다리를'), off14: W('s14', '끕니다.'),
  check15: W('s15', '점검을'), again15: W('s15', '다시'), sat15: W('s15', '위성을'), cover15: W('s15', '덮개도'), sea15: W('s15', '바다에서'), pick15: W('s15', '건져'),
  y2024: W('s16', '이천이십사년에는'), big16: W('s16', '더'), tower16: W('s16', '발사탑의'), arms16: W('s16', '두'), air16: W('s16', '공중에서'), catch16: W('s16', '붙잡기도'),
  old17: W('s17', '버리던'), reuse17: W('s17', '쓰자'), cost17: W('s17', '발사'), down17: W('s17', '내려가,'), yearly17: W('s17', '해마다'), thousands17: W('s17', '수천'), leo17: W('s17', '낮은'),
  q18: W('s18', '로켓은'), straight18: W('s18', '곧장'),
  no19: W('s19', '아닙니다.'), thick19: W('s19', '짙은'), leave19: W('s19', '벗어나면'), tilt19: W('s19', '기울어져,'), fuel19: W('s19', '연료'), side19: W('s19', '옆으로'),
  close20: W('s20', '궤도에'),
};

/** piecewise-linear map through knots [[x, y], …] (clamped) */
const pw = knots => x => { if (x <= knots[0][0]) return knots[0][1]; for (let i = 1; i < knots.length; i++) if (x <= knots[i][0]) { const [a, va] = knots[i - 1], [b, vb] = knots[i]; return va + (vb - va) * (x - a) / (b - a); } return knots.at(-1)[1]; };
const inv = (knots) => pw(knots.map(([a, b]) => [b, a]));

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export const CANNON_X = 2000;                                            // cannon shots: real seconds per screen second
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // ---- hook: liftoff of the full stack, the 2015 return, the 37-flight tally
  P.toStack = 1.75; P.lift = at(A.lift) + 0.05; P.liftOut = P.lift + 3.2;
  P.dateTag = at(A.y2015) - 0.1; P.satTag = at(A.sat2) - 0.05;
  P.desc0 = at(A.stage2w) - 0.15; P.ign2 = at(A.back2) - 0.05; P.legs2 = at(A.stand2) - 0.25; P.touch2 = at(A.land2) + 0.32;
  P.posterT = P.touch2 - 0.12;                                           // the poster state = just before this touchdown
  P.slide3 = at(A.y2026) - 0.2; P.tag3 = at(A.aug) - 0.1; P.tally0 = at(A.one3) - 0.25; P.tally1 = at(A.flight3) - 0.05;
  P.tallyT = [...Array(37)].map((_, k) => +(P.tally0 + (P.tally1 - P.tally0) * k / 36).toFixed(4));
  // ---- leo
  P.band = at(A.leo4) - 0.1; P.b2000 = at(A.km2000) - 0.05; P.iss = at(A.iss4) - 0.1; P.comm = at(A.comm4) - 0.1; P.many = at(A.many4) - 0.1;
  P.toss0 = at(A.high5) - 0.1; P.tossTop = P.toss0 + 0.85; P.tossLand = P.toss0 + 1.7; P.notTag = at(A.not5) - 0.05;
  P.sideArrow = at(A.side5) - 0.05; P.sideTag = at(A.fast5) - 0.05;
  P.zoom = [at('s05:end') + 0.15, at('s06') + 0.05];
  P.shot = [at(A.fall6) + 0.05, at(A.around6) + 0.15, at(A.speed6) - 0.05, at(A.v78) + 0.25];
  P.hit = CANNON.slice(0, 3).map((c, k) => +(P.shot[k] + c.T / CANNON_X).toFixed(4));
  P.orbitDone = +(P.shot[3] + ORBIT_T / CANNON_X).toFixed(4);
  P.sb0 = at(A.seoul) - 0.05; P.sb1 = at(A.min1) + 0.35; P.sbTag = at(A.min1) - 0.1;
  P.shrink = [at('s06:end') + 0.1, at('s07') + 0.2];
  P.barSide = at(A.this7) - 0.05; P.barUp = at(A.high7) - 0.1; P.x8 = at(A.eight7) - 0.1;
  P.x8T = [...Array(8)].map((_, k) => +(P.x8 + 0.09 * k).toFixed(4));
  // ---- rocket dashboard
  P.tag1903 = at(A.y1903) - 0.1; P.formula = at(A.rocket8) - 0.1; P.m0 = at(A.full8) - 0.05; P.m1 = at(A.empty8) - 0.05;
  P.f = t => (t < P.m0 ? 0 : t < at(A.orbit9) ? 0.8 * easeInOut((t - P.m0) / (at('s08:end') - P.m0)) : lerp(0.8, F_NEED, easeInOut((t - at(A.orbit9)) / (at(A.pct95) - at(A.orbit9) + 0.3))));
  P.need = at(A.orbit9) - 0.1; P.p95 = at(A.pct95) + 0.2; P.split = at(A.used9) - 0.1; P.drop = at(A.drop9) - 0.05; P.stagesTag = at(A.stages9) - 0.05;
  // ---- ascent (s10) and return (s11–s12): screen time ↔ mission time
  P.xs = at('s10') - 0.55; P.sep = at(A.sep10) - 0.05;
  P.ascM = pw([[at('s10') - 0.2, 0], [P.sep, 150]]);                     // ≈ 27 ×
  P.ascX = 150 / (P.sep - at('s10') + 0.2);
  P.flipS = at(A.flip11) - 0.2; P.bbS = at(A.engine11) - 0.05; P.bbE = at(A.pad11) + 0.85; P.enS = at(A.again12) + 0.2; P.enE = at(A.fins12) - 0.25; P.finS = at(A.fins12) - 0.05;
  P.retKnots = [[P.sep, 150], [P.flipS, 155], [P.bbS, MODEL.T.bb0], [P.bbE, MODEL.T.bb1], [P.enS, MODEL.T.en0], [P.enE, MODEL.T.en1], [sc('return').end, MODEL.T.ign - 6.5]];
  // ---- landing: the last 26 s
  P.ignS = at(A.on13) - 0.02; P.touchS = at(A.off14) + 0.08;
  P.landKnots = [[sc('return').end, MODEL.T.ign - 6.5], [P.ignS, MODEL.T.ign], [P.touchS, MODEL.T.touch]];
  P.landX = (MODEL.T.touch - MODEL.T.ign) / (P.touchS - P.ignS);
  P.mission = pw([...P.retKnots, ...P.landKnots.slice(1)]);
  P.forceIn = at(A.weak13) - 0.1; P.weightIn = at(A.weight13) - 0.1; P.verdict = at(A.hover13) - 0.1;
  P.target = at(A.zero14) - 0.05; P.ghosts = at(A.moment14) - 0.1; P.legs = at(A.legs14) - 0.05;
  // ---- reuse
  P.cycle0 = sc('reuse').start + 0.1; P.check = at(A.check15) - 0.05; P.fly15 = at(A.again15) - 0.05;
  P.fairSplit = at(A.sat15) - 0.05; P.chute = at(A.cover15); P.splash = at(A.sea15) + 0.1; P.pick = at(A.pick15) + 0.05;
  P.tower = at('s16') - 0.45; P.bigIn = at(A.big16) - 0.1; P.armsTag = at(A.arms16) - 0.1; P.catch = at(A.catch16) + 0.05;
  P.old = at(A.old17) - 0.1; P.newer = at(A.reuse17) - 0.1; P.cost = at(A.cost17) - 0.1; P.costDown = at(A.down17) - 0.1;
  P.leoBack = at(A.yearly17) - 0.45; P.flock = at(A.thousands17) - 0.1;
  P.launches = [...Array(7)].map((_, k) => +(P.flock - 0.4 + 0.42 * k).toFixed(4));
  // ---- myth
  P.ghost0 = at(A.straight18) - 0.3; P.ghostTop = P.ghost0 + 1.5; P.ghostFall = at('s18:end') + 0.45;
  P.no = at(A.no19) - 0.05; P.realKnots = [[at(A.no19) + 0.3, 0], [at(A.tilt19) + 0.15, 150], [at('s19:end') - 0.3, 513]];
  P.realM = pw(P.realKnots); P.thick = at(A.thick19) - 0.05; P.leave = at(A.leave19) - 0.05; P.tilt = at(A.tilt19) - 0.05;
  P.budget = at(A.fuel19) - 0.1; P.sideFill = at(A.side19) - 0.1;
  // ---- close
  P.poster = at(A.close20) - 0.15;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
export const PAL = {answer: '#FF8A2A', body: '#ECE8E1', bodyShade: '#8F8A81', band: '#5A5C61', soot: '#2B2723', bell: '#3A3C40', metal: '#9A9DA3',
  flameCore: '#FFF7E0', flame: '#FFB347', flameOut: '#FF6A1A', sky0: '#0A0D15', sky1: '#1C2433', ground: '#141517', pad: '#3B3C3F',
  sea: '#0E2A44', sea2: '#081A2C', land: '#3E5A46', ocean: '#16416B', atm: '#7FB8D8', speed: '#7FB8D8', alt: '#F1EDE6', burn: '#FF7A1A',
  sat: '#CFE3F2', iss: '#FFD08A', good: '#9CCB86', bad: '#F07F5E', ghost: '#A09A90', fuel: '#FF9A3C', struct: '#8D9096'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.82, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 2, maxWidth: 800, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1340, 0, 1620);
  g.addColorStop(0, 'rgba(4,4,6,0)'); g.addColorStop(0.35, `rgba(4,4,6,${0.62 * a})`); g.addColorStop(0.75, `rgba(4,4,6,${0.62 * a})`); g.addColorStop(1, 'rgba(4,4,6,0)');
  c.fillStyle = g; c.fillRect(0, 1340, 1080, 280);
}
const mmss = s => { const v = Math.max(0, Math.floor(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const STARS = (() => { const R = rng(31), s = []; for (let i = 0; i < 240; i++) s.push({x: R() * 1080, y: R() * 1920, r: 0.5 + 1.3 * R() ** 3, a: 0.12 + 0.5 * R() ** 2}); return s; })();
function stars(c, a = 1, yMax = 1920) { if (a <= 0) return; for (const s of STARS) if (s.y < yMax) { c.globalAlpha = s.a * a; circle(c, s.x, s.y, s.r, '#E6EAF2'); } c.globalAlpha = 1; }
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#111215'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H * 0.44, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Rocket drawing (generic two-stage liquid rocket; local frame: engine exit at (0, 0), nose toward −y)
// =====================================================================================================
/** plume from (0, 0) toward +y in the local frame. len, w in px; I 0..1 */
function plume(c, len, w, I = 1, o = {}) {
  if (I <= 0.01 || len <= 1) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const n = o.n || 1, sp = o.spread ?? 0;
  for (let k = 0; k < n; k++) {
    const ox = n > 1 ? (k - (n - 1) / 2) * w * 0.55 : 0;
    const g = c.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, rgba(PAL.flameCore, 0.95 * I)); g.addColorStop(0.18, rgba(PAL.flame, 0.85 * I)); g.addColorStop(0.6, rgba(PAL.flameOut, 0.45 * I)); g.addColorStop(1, rgba(PAL.flameOut, 0));
    c.beginPath(); c.moveTo(ox - w * 0.32, 0); c.quadraticCurveTo(ox - w * (0.7 + sp), len * 0.45, ox, len); c.quadraticCurveTo(ox + w * (0.7 + sp), len * 0.45, ox + w * 0.32, 0); c.closePath();
    c.fillStyle = g; c.fill();
    const g2 = c.createLinearGradient(0, 0, 0, len * 0.35);
    g2.addColorStop(0, rgba('#FFFFFF', 0.9 * I)); g2.addColorStop(1, rgba(PAL.flameCore, 0));
    c.beginPath(); c.moveTo(ox - w * 0.18, 0); c.quadraticCurveTo(ox - w * 0.26, len * 0.18, ox, len * 0.35); c.quadraticCurveTo(ox + w * 0.26, len * 0.18, ox + w * 0.18, 0); c.closePath(); c.fillStyle = g2; c.fill();
  }
  const gl = c.createRadialGradient(0, len * 0.05, 0, 0, len * 0.05, Math.max(w * 2.2, len * 0.45));
  gl.addColorStop(0, rgba(PAL.flame, 0.35 * I)); gl.addColorStop(1, rgba(PAL.flameOut, 0)); c.fillStyle = gl; c.fillRect(-len, -len * 0.5, 2 * len, 1.6 * len);
  c.restore();
}
/**
 * Booster (first stage) or full stack. (x, y) = engine-exit point on screen, ang = nose direction (radians, 0 = up, + clockwise).
 * o: {L (stage-1 length px), legs 0..1, fins 0..1, soot 0..1, burn 0..1, engines 1|3|9, stack (draw stage 2 + fairing), alpha, plumeLen, w}
 */
function rocket(c, x, y, ang, o = {}) {
  const L = o.L || 300, w = o.w || L * 0.105, legs = o.legs ?? 0, fins = o.fins ?? 0, soot = o.soot ?? 0, burn = o.burn ?? 0;
  c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha *= o.alpha ?? 1;
  if (burn > 0) plume(c, o.plumeLen ?? L * 0.9, w * (o.engines === 1 ? 0.75 : 1.05), burn, {n: 1, spread: o.spread ?? 0});
  const eb = L * 0.05;                                                   // engine bells below the body
  // engine bells (3 visible)
  const nb = o.engines === 1 ? 1 : 3;
  for (let k = 0; k < 3; k++) {
    const bx = (k - 1) * w * 0.3, on = nb === 3 || k === 1;
    poly(c, [[bx - w * 0.09, -eb], [bx + w * 0.09, -eb], [bx + w * 0.15, 0], [bx - w * 0.15, 0]], on && burn > 0 ? '#5B4A3A' : PAL.bell, rgba('#000000', 0.4), 1);
  }
  const top = -eb - L;
  // body with cylindrical shading
  const gb = c.createLinearGradient(-w / 2, 0, w / 2, 0);
  gb.addColorStop(0, PAL.bodyShade); gb.addColorStop(0.3, PAL.body); gb.addColorStop(0.55, '#FBF8F2'); gb.addColorStop(1, '#A7A29A');
  rect(c, -w / 2, top, w, L, 0, gb);
  rect(c, -w / 2, -eb - L * 0.035, w, L * 0.035, 0, '#4A4C50');           // engine section
  // soot (darker toward the bottom)
  if (soot > 0) { const gs = c.createLinearGradient(0, -eb, 0, -eb - L * 0.75); gs.addColorStop(0, rgba(PAL.soot, 0.85 * soot)); gs.addColorStop(0.5, rgba(PAL.soot, 0.45 * soot)); gs.addColorStop(1, rgba(PAL.soot, 0));
    rect(c, -w / 2, -eb - L * 0.75, w, L * 0.75, 0, gs); }
  rect(c, -w / 2, top, w, L * 0.11, 0, PAL.band);                          // interstage band (grey)
  line(c, [[-w / 2, top + L * 0.11], [w / 2, top + L * 0.11]], rgba('#000000', 0.35), 1.2);
  // grid fins at the top (folded = flat to the body)
  const fy = top + L * 0.06, fl = w * 0.55 * (0.25 + 0.75 * fins), fh = L * 0.035;
  for (const s of [-1, 1]) {
    const x0 = s * w / 2, x1 = x0 + s * fl;
    rect(c, Math.min(x0, x1), fy - fh / 2, Math.abs(x1 - x0), fh, 1, '#6E7177', rgba('#000', 0.5), 1);
    if (fins > 0.4) for (let k = 1; k < 3; k++) line(c, [[x0 + s * fl * k / 3, fy - fh / 2], [x0 + s * fl * k / 3, fy + fh / 2]], rgba('#2B2D30', 0.9), 1);
  }
  // landing legs: hinge at the body bottom; folded = along the body, deployed = down and out
  const hinge = -eb - L * 0.04, legL = L * 0.25, phi = lerp(0, 2.55, easeInOut(legs));
  for (const s of [-1, 1]) {
    const hx = s * w / 2, fx = hx + s * Math.sin(phi) * legL, fy2 = hinge - Math.cos(phi) * legL;
    line(c, [[hx, hinge], [fx, fy2]], '#3A3C41', Math.max(2, w * 0.16), {cap: 'butt'});
    if (legs > 0.05) line(c, [[hx * 0.9, hinge - L * 0.16 * (1 - legs * 0.5)], [lerp(hx, fx, 0.55), lerp(hinge, fy2, 0.55)]], '#2F3135', Math.max(1.5, w * 0.07));
    if (legs > 0.85) rect(c, fx - w * 0.12, fy2 - 1, w * 0.24, Math.max(2, w * 0.06), 1, '#26282B');
  }
  if (legs < 0.05) rect(c, -w * 0.08, hinge - legL, w * 0.16, legL, 0, '#3A3C41');   // the middle (front) folded leg
  if (o.stack) {
    const L2 = L * 0.3, Lf = L * 0.27, wf = w * 1.25, s2b = top;
    const g2 = c.createLinearGradient(-w / 2, 0, w / 2, 0); g2.addColorStop(0, PAL.bodyShade); g2.addColorStop(0.3, PAL.body); g2.addColorStop(0.55, '#FBF8F2'); g2.addColorStop(1, '#A7A29A');
    rect(c, -w / 2, s2b - L2, w, L2, 0, g2);
    const gf = c.createLinearGradient(-wf / 2, 0, wf / 2, 0); gf.addColorStop(0, PAL.bodyShade); gf.addColorStop(0.32, '#F4F1EA'); gf.addColorStop(1, '#A39E95');
    const fb = s2b - L2;
    c.beginPath(); c.moveTo(-wf / 2, fb); c.lineTo(-wf / 2, fb - Lf * 0.45); c.quadraticCurveTo(-wf / 2, fb - Lf * 0.95, 0, fb - Lf); c.quadraticCurveTo(wf / 2, fb - Lf * 0.95, wf / 2, fb - Lf * 0.45); c.lineTo(wf / 2, fb); c.closePath(); c.fillStyle = gf; c.fill();
    line(c, [[-wf / 2, fb], [wf / 2, fb]], rgba('#000', 0.3), 1.2);
  }
  c.restore();
}
/** length of a drawn full stack above the engine exit (for placing) */
const stackH = L => L * (0.05 + 1 + 0.3 + 0.27);
/** stage 2 alone (after separation): engine at (0, 0), nose toward −y */
function stage2(c, x, y, ang, o = {}) {
  const L = o.L || 100, w = o.w || L * 0.35, L2 = L, Lf = L * 0.9, wf = w * 1.25;
  c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha *= o.alpha ?? 1;
  if ((o.burn ?? 0) > 0) plume(c, o.plumeLen ?? L * 1.4, w * 0.6, o.burn);
  poly(c, [[-w * 0.18, -L * 0.18], [w * 0.18, -L * 0.18], [w * 0.28, 0], [-w * 0.28, 0]], PAL.bell);
  rect(c, -w / 2, -L * 0.18 - L2, w, L2, 0, PAL.body);
  const fb = -L * 0.18 - L2; c.beginPath(); c.moveTo(-wf / 2, fb); c.lineTo(-wf / 2, fb - Lf * 0.45); c.quadraticCurveTo(-wf / 2, fb - Lf * 0.95, 0, fb - Lf); c.quadraticCurveTo(wf / 2, fb - Lf * 0.95, wf / 2, fb - Lf * 0.45); c.lineTo(wf / 2, fb); c.closePath(); c.fillStyle = '#E9E5DD'; c.fill();
  c.restore();
}
/** soft smoke puffs along the ground, lit by the plume (I) */
const PUFFS = (() => { const R = rng(77), o = []; for (let i = 0; i < 26; i++) { const s = i % 2 ? 1 : -1; o.push({s, d: 0.15 + 0.85 * R(), r: 0.5 + 0.7 * R(), y: R(), ph: R() * TAU}); } return o; })();
function groundSmoke(c, x, y, spread, I, t, lit = 1) {
  if (spread <= 0.01) return;
  for (const p of PUFFS) {
    const dx = p.s * p.d * spread * 340, r = (24 + 46 * p.r) * (0.4 + 0.6 * spread), yy = y - 10 - p.y * 30 * spread - r * 0.35 + Math.sin(t * 0.8 + p.ph) * 2;
    const g = c.createRadialGradient(x + dx, yy, 0, x + dx, yy, r);
    const col = mix('#8A8681', '#FFB070', clamp(I * lit * (1 - p.d * 0.6)));
    g.addColorStop(0, rgba(col, 0.55 * spread)); g.addColorStop(1, rgba(col, 0)); circle(c, x + dx, yy, r, g);
  }
}
/** night landing zone: sky, distant horizon, pad (ellipse) at y = padY */
const PAD = {x: 540, y: 1215, rx: 250, ry: 36};
function landingZone(stage, t, o = {}) {
  const c = stage.ctx, padX = o.padX ?? PAD.x;
  const g = c.createLinearGradient(0, 0, 0, 1180); g.addColorStop(0, PAL.sky0); g.addColorStop(0.75, '#141A26'); g.addColorStop(1, '#2A2A30');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 1180);
  stars(c, 0.8, 1000);
  const hz = c.createLinearGradient(0, 1080, 0, 1185); hz.addColorStop(0, 'rgba(255,170,110,0)'); hz.addColorStop(1, 'rgba(255,150,90,0.10)'); c.fillStyle = hz; c.fillRect(0, 1080, 1080, 105);
  c.fillStyle = '#0F1012'; c.fillRect(0, 1178, 1080, 742);
  // distant low structures (silhouettes, no detail)
  c.fillStyle = '#18191C'; for (const [x0, w, h] of [[60, 70, 18], [150, 30, 34], [820, 90, 22], [930, 40, 40], [990, 60, 16]]) c.fillRect(x0, 1178 - h, w, h);
  for (const [x, h] of [[165, 34], [945, 40]]) { circle(c, x, 1178 - h - 3, 2.5, rgba('#FF5A4A', 0.6 + 0.4 * Math.sin(t * 3 + x))); }
  // pad
  c.save(); c.translate(padX, PAD.y); c.scale(1, PAD.ry / PAD.rx);
  const gp = c.createRadialGradient(0, 0, 0, 0, 0, PAD.rx); gp.addColorStop(0, '#45464A'); gp.addColorStop(1, '#2A2B2E'); circle(c, 0, 0, PAD.rx, gp);
  ring(c, 0, 0, PAD.rx * 0.8, rgba('#D9D3C8', 0.55), 6); ring(c, 0, 0, PAD.rx * 0.36, rgba('#D9D3C8', 0.45), 5);
  c.restore();
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '다 쓴 로켓, 버릴까'],
  leo: ['LEO · 낮은 지구 궤도', '고도 2,000 km 아래'],
  rocket: ['1903 · 치올콥스키', '로켓 방정식'],
  return: ['1단의 귀환', '뒤집고, 되돌아가고, 늦춘다'],
  landing: ['착륙 연소', '멈춰 떠 있을 수 없다'],
  reuse: ['다시 쓰기', '점검하고 다시 난다'],
  myth: ['오해 바로잡기', '곧장 위로 올라갈까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'hook') return [[-Infinity, ...titles.hook], [P.dateTag - 0.2, '2015년 12월 · 첫 착륙', '발사장으로 돌아온 1단'], [P.slide3, '2026년 8월', '같은 1단, 37번째 비행']];
  if (id === 'leo') return [[-Infinity, ...titles.leo], [tl.at('s05') - 0.2, '본질', '높이가 아니라 옆으로'], [P.zoom[0], '본질 · 높이 4배 과장 · 약 2,000× 빠르게', '옆으로 빠르면 땅을 비켜 돈다'], [P.shrink[0], '에너지 · 1 kg당', '옆으로 달리기 ≈ 8배']];
  if (id === 'rocket') return [[-Infinity, ...titles.rocket], [P.need - 0.2, '연료 95%', '다 쓴 통을 버리는 단'], [P.xs, `1단 · 실제 2분 30초를 약 ${Math.round(P.ascX)}× 빠르게`, '분리 · 높이 약 70 km']];
  if (id === 'return') { const x = (MODEL.T.ign - 6.5 - 150) / (tl.scene('return').end - P.sep); return [[-Infinity, `1단의 귀환 · 실제 약 ${Math.round((MODEL.T.ign - 6.5 - 150) / 60)}분을 약 ${Math.round(x)}× 빠르게`, titles.return[1]]]; }
  if (id === 'landing') return [[-Infinity, `착륙 연소 · 마지막 ${Math.round(MODEL.T.touch - MODEL.T.ign + 6.5)}초 · 약 ${f1(P.landX)}× 빠르게`, titles.landing[1]], [P.target - 0.3, '착륙 연소', '높이 0 = 속도 0']];
  if (id === 'reuse') return [[-Infinity, ...titles.reuse], [P.tower, '2024년 10월', '발사탑의 두 팔'], [P.old - 0.25, '그 결과', '해마다 수천 개의 위성']];
  if (id === 'myth') return [[-Infinity, ...titles.myth], [P.no - 0.1, '오해 바로잡기 · 높이 3배 과장', '곧 기울어 옆으로']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, t); return; }   // frame 0 = thumbnail: no progress bar yet
  if (id === 'close') {
    const a = smooth(ctx.scene.p / 0.04) * fadeOut(t, P.poster - 0.3, 0.3);
    if (a > 0) head(stage, ...titles.close, a, a);
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, ctx.tl), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  const sh = id === 'hook' ? 'rgba(0,0,0,0.95)' : null;
  if (id === 'hook' && k === 0) {
    const aK = fadeIn(t, MORPH[1] - 0.05, 0.4) * a; head(stage, cur[1], cur[2] + '?', aK, a, POSTER_Q.ans, a, sh);
  } else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2] + (id === 'hook' && k === 1 ? '?' : ''), a * (1 - out), a * (1 - out), id === 'hook' && k === 1 ? POSTER_Q.ans : '', a * (1 - out), sh);
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn, '', 0, sh);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
const POSTER_Q = {y: 560, y2: 700, q: '다 쓴 로켓, 버릴까', ans: '돌아와 다시 난다'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 760, 92); ASIZE ||= fit(POSTER_Q.ans, 820, 200);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 450, 0, 800); g2.addColorStop(0, 'rgba(6,7,10,0)'); g2.addColorStop(0.25, 'rgba(6,7,10,0.62)'); g2.addColorStop(0.78, 'rgba(6,7,10,0.62)'); g2.addColorStop(1, 'rgba(6,7,10,0)');
    c.fillStyle = g2; c.fillRect(0, 450, 1080, 350);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', tracking: tr * s2, shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 26});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/reusable-rocket/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  return `${MODEL.D.toFixed(3)}/${MODEL.H.toFixed(1)}/${MODEL.T.touch.toFixed(2)}/${ORBIT_T}@${tl.duration.toFixed(3)}/${P.touch2.toFixed(3)}/${P.touchS.toFixed(3)}/${P.catch.toFixed(3)}`;
}
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  leo(stage, t, p, ctx) { leoScene(stage, t, ctx); },
  rocket(stage, t, p, ctx) { rocketScene(stage, t, ctx); },
  return(stage, t, p, ctx) { returnScene(stage, t, ctx); },
  landing(stage, t, p, ctx) { landingScene(stage, t, ctx); },
  reuse(stage, t, p, ctx) { reuseScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → liftoff → 2015 return → 37 flights
const HOOK_L = 400;                                                      // stage-1 length on screen (px)
/** the hook booster state at time t (engine-exit y, legs, burn, plume, smoke) */
function hookBooster(t, P) {
  const yPad = PAD.y - 8, vFall = 640, T2 = P.touch2 - P.ign2, d2 = vFall * T2 / 2;
  if (t < P.desc0) return null;
  let y;
  if (t < P.ign2) y = yPad - d2 - vFall * (P.ign2 - t);
  else if (t < P.touch2) { const u = (P.touch2 - t); y = yPad - vFall * u * u / (2 * T2); }
  else y = yPad;
  const burn = t >= P.ign2 && t < P.touch2 ? smooth((t - P.ign2) / 0.15) : t >= P.touch2 ? Math.exp(-(t - P.touch2) / 0.12) * 0.6 : 0;
  const legs = smooth((t - P.legs2) / 0.45);
  const plen = t < P.touch2 ? clamp(yPad + 12 - y, 30, 260) + 40 : 30;
  return {y, burn, legs, plen};
}
function hookPicture(stage, t, P, poster = false) {
  const c = stage.ctx;
  landingZone(stage, t);
  const tt = poster ? P.posterT : t;
  // full stack before and during liftoff
  if (!poster && t < P.liftOut + 0.2) {
    const a = fadeIn(t, P.toStack - 0.35, 0.45), tau = Math.max(0, t - P.lift), rise = 230 * tau * tau;
    const burn = tau > 0 ? 1 : 0;
    if (a > 0) withAlpha(c, a, () => {
      groundSmoke(c, PAD.x, PAD.y + 6, burn * clamp(0.3 + tau * 0.6, 0, 1.2), burn * 0.9, t);
      if (burn) { const gl = c.createRadialGradient(PAD.x, PAD.y, 0, PAD.x, PAD.y, 420); gl.addColorStop(0, rgba('#FFB060', 0.45 * Math.exp(-tau / 1.4))); gl.addColorStop(1, rgba('#FF8040', 0)); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gl; c.fillRect(0, 700, 1080, 900); c.restore(); }
      rocket(c, PAD.x, PAD.y - 22 - rise, 0, {L: 300, stack: true, burn, plumeLen: 120 + Math.min(500, rise * 0.8), soot: 0.1});
    });
  }
  // the returning first stage (2015)
  const B = poster ? hookBooster(P.posterT, P) : hookBooster(t, P);
  const slide = poster ? 0 : smooth((t - P.slide3) / 0.8), bx = lerp(PAD.x, 330, slide);
  if (B) {
    const a = poster ? 1 : fadeIn(t, P.desc0, 0.25);
    withAlpha(c, a, () => {
      const touch = B.y >= PAD.y - 8.5;
      const smoke = poster ? 1 : clamp((t - P.ign2 + 0.6) / 1.2) * (t > P.touch2 ? Math.exp(-(t - P.touch2) / 1.6) : 1);
      groundSmoke(c, bx, PAD.y + 6, smoke * 1.05, B.burn, tt);
      if (B.burn > 0.02) { const gl = c.createRadialGradient(bx, PAD.y, 0, bx, PAD.y, 380); gl.addColorStop(0, rgba('#FFB060', 0.5 * B.burn)); gl.addColorStop(1, rgba('#FF8040', 0)); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gl; c.fillRect(0, 700, 1080, 900); c.restore(); }
      if (!touch || t > P.touch2) { c.save(); c.translate(bx, PAD.y); c.scale(1, 0.18); glow(c, 0, 0, 90, '#000000', 0.5); c.restore(); }
      const soot = poster ? 0.35 : lerp(0.35, 0.9, clamp((t - P.tally0) / (P.tally1 - P.tally0)));
      rocket(c, bx, B.y - HOOK_L * 0.0, 0, {L: HOOK_L, legs: B.legs, fins: 1, soot, burn: B.burn, engines: 1, plumeLen: B.plen, spread: 0.4 * B.burn});
    });
  }
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  withAlpha(c, ef, () => {
    if (t < P.toStack) { hookPicture(stage, t, P, true); }
    else hookPicture(stage, t, P, false);
    if (t >= P.toStack - 0.4 && t < P.toStack + 0.2) withAlpha(c, 1 - smooth((t - P.toStack + 0.4) / 0.5), () => hookPicture(stage, t, P, true));
    if (t >= MORPH[1]) captionShade(c, fadeIn(t, 0.95, 0.4));
    // s02 tags
    const ta = fadeIn(t, P.dateTag, 0.35) * fadeOut(t, P.slide3 - 0.3, 0.3);
    if (ta > 0) {
      tag(stage, '2015.12.21 · Falcon 9 1단', 540, 372, {size: 28, a: ta, color: stage.theme.ink});
      tag(stage, '위성 11개를 궤도로 보낸 뒤 → 발사장 착륙', 540, 420, {size: 24, a: ta * fadeIn(t, P.satTag, 0.35), color: stage.theme.muted, plate: false});
    }
    // s03 tally
    const ya = fadeIn(t, P.tag3, 0.4);
    if (ya > 0) withAlpha(c, ya, () => {
      panel(c, stage.theme, 560, 470, 370, 470, 0.86);
      stage.text('같은 1단 (B1067)', 745, 515, {size: 28, weight: 700, color: stage.theme.ink, align: 'center'});
      stage.text('비행 횟수', 745, 555, {size: 24, weight: 500, color: stage.theme.muted, align: 'center'});
      const n = P.tallyT.filter(x => t >= x).length;
      for (let k = 0; k < 37; k++) {
        const col = k % 8, row = Math.floor(k / 8), x = 600 + col * 37, y = 590 + row * 52, on = k < n;
        rect(c, x, y, 28, 40, 4, on ? rgba(stage.theme.accent, k === n - 1 ? 1 : 0.8) : rgba(stage.theme.border, 0.8));
      }
      stage.text(String(n), 745, 880, {role: 'display', size: 64, weight: 700, color: stage.theme.accent, align: 'center'});
      stage.text('2026년 8월', 745, 920, {size: 24, weight: 500, color: stage.theme.muted, align: 'center', alpha: fadeIn(t, P.tally1, 0.3)});
    });
  });
}

// ------------------------------------------------------------------ leo: Earth arc → Newton's cannon → energy bars
const VIEW = {arc: {cx: 540, cy: 2150, R: 1250, ex: 1}, full: {cx: 540, cy: 790, R: 280, ex: 4}, small: {cx: 540, cy: 610, R: 180, ex: 4}};
function lerpView(a, b, q) { return {cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy - a.R, b.cy - b.R, q) + Math.exp(lerp(Math.log(a.R), Math.log(b.R), q)), R: Math.exp(lerp(Math.log(a.R), Math.log(b.R), q)), ex: lerp(a.ex, b.ex, q)}; }
const vpt = (V, ang, h) => { const r = V.R + h * V.R / RE * V.ex; return [V.cx + r * Math.sin(ang), V.cy - r * Math.cos(ang)]; };
function earth(c, V, a = 1) {
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(V.cx - V.R * 0.3, V.cy - V.R * 0.4, V.R * 0.1, V.cx, V.cy, V.R);
    g.addColorStop(0, '#2A6496'); g.addColorStop(0.7, PAL.ocean); g.addColorStop(1, '#0B2440');
    circle(c, V.cx, V.cy, V.R, g);
    // a few faint land shapes (schematic)
    c.save(); c.beginPath(); c.arc(V.cx, V.cy, V.R, 0, TAU); c.clip();
    for (const [ax, ay, r] of [[-0.35, -0.55, 0.32], [0.25, -0.7, 0.22], [0.5, -0.2, 0.28], [-0.6, 0.1, 0.25], [0.1, 0.35, 0.3]]) { const gg = c.createRadialGradient(V.cx + ax * V.R, V.cy + ay * V.R, 0, V.cx + ax * V.R, V.cy + ay * V.R, r * V.R); gg.addColorStop(0, rgba(PAL.land, 0.55)); gg.addColorStop(1, rgba(PAL.land, 0)); c.fillStyle = gg; c.fillRect(0, 0, 1080, 1920); }
    c.restore();
    ring(c, V.cx, V.cy, V.R + 1.5, rgba(PAL.atm, 0.75), 3);
    const ga = c.createRadialGradient(V.cx, V.cy, V.R, V.cx, V.cy, V.R * 1.05 + 10); ga.addColorStop(0, rgba(PAL.atm, 0.25)); ga.addColorStop(1, rgba(PAL.atm, 0)); circle(c, V.cx, V.cy, V.R * 1.05 + 10, ga);
  });
}
const SATS = (() => { const R = rng(2026), o = []; for (let i = 0; i < 300; i++) { const u = R(); const h = u < 0.68 ? 480 + 90 * R() : u < 0.9 ? 300 + 900 * R() : 1200 + 800 * R(); o.push({h, a0: R() * TAU, r: 1.2 + 1.2 * R(), late: R()}); } return o; })();
const SAT_X = 120;                                                       // satellite motion: real s per screen s
function satellites(c, V, t, a = 1, frac = 1) {
  if (a <= 0) return;
  for (const s of SATS) {
    if (s.late > frac) continue;
    const w = Math.sqrt(GM / (RE + s.h) ** 3) * SAT_X, ang = ((s.a0 + w * t) % TAU) - Math.PI;
    const [x, y] = vpt(V, ang, s.h); if (x < 130 || x > 950 || y < 320) continue;
    c.globalAlpha = a * 0.85 * smooth((frac - s.late) * 8); circle(c, x, y, s.r, PAL.sat);
  }
  c.globalAlpha = 1;
}
function issAt(V, t, P) { const w = Math.sqrt(GM / (RE + H_ISS) ** 3) * SAT_X, ang = -0.27 + w * (t - P.iss); return vpt(V, ang, H_ISS); }
function leoScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, ef = fadeOut(t, ctx.scene.end - 0.3, 0.3), ein = fadeIn(t, ctx.scene.start, 0.3);
  withAlpha(c, ef * ein, () => {
    stars(c, 0.7);
    const qz = easeInOut((t - P.zoom[0]) / (P.zoom[1] - P.zoom[0])), qs = easeInOut((t - P.shrink[0]) / (P.shrink[1] - P.shrink[0]));
    const V = qs > 0 ? lerpView(VIEW.full, VIEW.small, qs) : lerpView(VIEW.arc, VIEW.full, qz);
    // LEO band (0–2,000 km)
    const bandA = fadeIn(t, P.band, 0.5) * (1 - 0.6 * qz);
    if (bandA > 0) withAlpha(c, bandA, () => {
      c.beginPath(); c.arc(V.cx, V.cy, V.R + 2000 * V.R / RE * V.ex, 0, TAU); c.arc(V.cx, V.cy, V.R, 0, TAU, true); c.fillStyle = rgba(PAL.speed, 0.10); c.fill('evenodd');
      ring(c, V.cx, V.cy, V.R + 2000 * V.R / RE * V.ex, rgba(PAL.speed, 0.7 * fadeIn(t, P.b2000, 0.4)), 2);
    });
    earth(c, V);
    satellites(c, V, t, fadeIn(t, P.band - 0.3, 0.6) * (1 - 0.6 * fadeIn(t, P.toss0 - 0.6, 0.5)) * (1 - qz * 0.85) * (1 - qs));
    const lab = (1 - smooth((t - P.toss0 + 0.6) / 0.5));
    if (lab > 0 && qz < 0.01) {
      tag(stage, 'LEO · 낮은 지구 궤도', 300, 560, {size: 30, a: lab * fadeIn(t, P.band, 0.4), color: PAL.speed, role: 'display'});
      tag(stage, '고도 2,000 km', 800, 505, {size: 26, a: lab * fadeIn(t, P.b2000, 0.4), color: PAL.speed});
      const [ix, iy] = issAt(V, t, P), ia = lab * fadeIn(t, P.iss, 0.4);
      if (ia > 0) withAlpha(c, ia, () => { ring(c, ix, iy, 14, PAL.iss, 2.5); circle(c, ix, iy, 4.5, PAL.iss); line(c, [[ix, iy - 14], [ix, iy - 70]], rgba(PAL.iss, 0.8), 1.5); });
      tag(stage, '국제우주정거장 · 약 400 km', ix, iy - 92, {size: 26, a: ia, color: PAL.iss});
      tag(stage, '통신위성 약 1만 개 (2026)', 540, 690, {size: 26, a: lab * fadeIn(t, P.comm, 0.4), color: PAL.sat});
    }
    // s05: toss straight up and fall back; then the sideways arrow (arc view, true scale)
    const s5 = fadeIn(t, P.toss0 - 0.3, 0.3) * (1 - qz);
    if (s5 > 0) withAlpha(c, s5, () => {
      const top = vpt(V, 0, H_ISS), base = vpt(V, 0, 0);
      const u = clamp((t - P.toss0) / (P.tossLand - P.toss0)), hh = u <= 0 ? 0 : H_ISS * (1 - (2 * u - 1) ** 2);
      line(c, [base, top], rgba(T.ink, 0.25), 2, {dash: [6, 8]});
      const b = vpt(V, 0, hh); if (u > 0 && u < 1) { glow(c, b[0], b[1], 16, T.ink, 0.25); circle(c, b[0], b[1], 7, T.ink); }
      arrow(c, [base[0] - 40, base[1] - 6], [top[0] - 40, top[1] + 6], rgba(T.ink, 0.8), 3);
      tag(stage, '높이만 오르면', base[0] - 54, top[1] - 62, {size: 28, align: 'right', a: fadeIn(t, P.toss0, 0.3), plate: false});
      tag(stage, '→ 다시 떨어짐', base[0] - 54, top[1] - 22, {size: 28, align: 'right', a: fadeIn(t, P.notTag, 0.3), color: PAL.bad, plate: false});
      const sa = fadeIn(t, P.sideArrow, 0.3);
      if (sa > 0) withAlpha(c, sa, () => { arrow(c, [top[0] + 10, top[1]], [top[0] + 10 + 220 * easeOut(clamp((t - P.sideArrow) / 0.5)), top[1]], T.accent, 5); });
      tag(stage, '옆으로 빠르게', top[0] + 130, top[1] - 40, {size: 30, role: 'display', color: T.accent, a: fadeIn(t, P.sideTag, 0.3), plate: false});
    });
    // s06: Newton's cannon from 400 km (altitudes ×4)
    const ca = qz * (1 - 0.25 * qs);
    if (ca > 0) withAlpha(c, ca, () => cannonShots(stage, t, P, V));
    if (qz > 0.5 && qs < 1) seoulBusan(stage, t, P, fadeIn(t, P.sb0, 0.35) * fadeOut(t, P.shrink[0] - 0.4, 0.4));
    // s07: energy bars
    if (qs > 0) energyBars(stage, t, P, qs);
  });
}
function cannonShots(stage, t, P, V) {
  const c = stage.ctx, T = stage.theme, top = vpt(V, 0, H_ISS);
  // launch point (a short mast) and the speed readout
  line(c, [vpt(V, 0, 0), top], rgba(T.ink, 0.6), 3); circle(c, top[0], top[1], 6, T.ink);
  const cur = P.shot.filter(s => t >= s).length - 1, v = cur >= 0 ? CANNON_V[cur] : 0;
  const cols = [PAL.bad, PAL.bad, PAL.bad, T.accent];
  for (let k = 0; k < 4; k++) {
    const tau = (t - P.shot[k]) * CANNON_X; if (tau <= 0) continue;
    const arc = CANNON[k], pts = []; for (const p of arc.pts) { if (p[2] > tau) break; pts.push(vpt(V, p[0], p[1])); }
    const [ang, h] = cannonAt(arc, tau); pts.push(vpt(V, ang, h));
    const old = k < cur ? 0.55 : 1;
    line(c, pts, rgba(cols[k], 0.85 * old), k === 3 ? 4 : 3);
    const b = pts.at(-1);
    if (!(arc.hit && tau >= arc.T)) { glow(c, b[0], b[1], 18, cols[k], 0.35); circle(c, b[0], b[1], 6, '#FFFFFF'); }
    else { ring(c, b[0], b[1], 9, rgba(cols[k], 0.9), 2.5); }
    // speed labels at the landing points / around the orbit
    const la = fadeIn(t, k < 3 ? P.hit[k] : P.orbitDone - 0.2, 0.3) * (k < 3 ? (k === cur || t < P.orbitDone ? 1 : 0.65) : 1);
    if (k < 3 && la > 0) { const [lx, ly] = vpt(V, arc.angEnd, 0), nx = Math.sin(arc.angEnd), ny = -Math.cos(arc.angEnd); tag(stage, `${CANNON_V[k].toFixed(1)}`, lx + nx * 44, ly + ny * 44, {size: 26, a: la, color: PAL.bad, plate: false}); }
  }
  // knob readout (left)
  const ra = fadeIn(t, P.shot[0] - 0.2, 0.3);
  if (ra > 0) withAlpha(c, ra, () => {
    panel(c, T, 160, 1238, 330, 100, 0.86);
    stage.text('옆으로 쏜 빠르기', 180, 1268, {size: 24, weight: 500, color: T.muted});
    stage.text(`초속 ${v.toFixed(1)} km`, 180, 1310, {role: 'display', size: 42, weight: 700, color: cur === 3 ? T.accent : T.ink});
  });
  const oa = fadeIn(t, P.orbitDone - 0.15, 0.35);
  if (oa > 0) tag(stage, '7.8 → 땅에 닿지 않고 돈다', 540, 380, {size: 30, a: oa, color: T.accent, role: 'display', plate: false});
}
function seoulBusan(stage, t, P, a) {
  if (a <= 0) return; const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    panel(c, T, 520, 1238, 410, 100, 0.86);
    const x0 = 560, x1 = 890, y = 1300, u = clamp((t - P.sb0 - 0.2) / (P.sb1 - P.sb0 - 0.2));
    line(c, [[x0, y], [x1, y]], rgba(T.ink, 0.5), 3); circle(c, x0, y, 7, T.ink); circle(c, x1, y, 7, T.ink);
    stage.text('서울', x0, y - 30, {size: 24, weight: 700, align: 'center'}); stage.text('부산', x1, y - 30, {size: 24, weight: 700, align: 'center'});
    const bx = lerp(x0, x1, u); glow(c, bx, y, 16, T.accent, 0.5); circle(c, bx, y, 6, T.accent);
    stage.text(`직선 325 km · ${Math.round(u * SB_SEC)}초`, (x0 + x1) / 2, y - 30, {size: 26, weight: 700, color: T.accent, align: 'center'});
  });
}
function energyBars(stage, t, P, qs) {
  const c = stage.ctx, T = stage.theme, x0 = 200, k = 620 / E_SIDE;
  withAlpha(c, qs, () => {
    // the orbiting 7.8 km/s ball continues above (drawn by cannonShots); here: two bars per kg
    stage.text('1 kg을', x0, 975, {size: 26, weight: 700, color: T.muted});
    const us = easeOut(clamp((t - P.barSide) / 0.9)), uu = easeOut(clamp((t - P.barUp) / 0.5));
    stage.text('초속 7.8 km로 달리게 하기', x0, 1030, {size: 28, weight: 700, color: T.accent, alpha: fadeIn(t, P.barSide, 0.3)});
    rect(c, x0, 1052, Math.max(2, E_SIDE * k * us), 46, 4, rgba(T.accent, 0.9));
    stage.text(`${E_SIDE.toFixed(0)} MJ`, x0 + E_SIDE * k * us + 12, 1076, {size: 26, weight: 700, color: T.ink, alpha: fadeIn(t, P.barSide + 0.6, 0.3)});
    stage.text('400 km 높이로 올리기', x0, 1150, {size: 28, weight: 700, color: T.ink, alpha: fadeIn(t, P.barUp, 0.3)});
    rect(c, x0, 1172, Math.max(2, E_UP * k * uu), 46, 4, rgba(T.ink, 0.85));
    stage.text(`${E_UP.toFixed(1)} MJ`, x0 + E_UP * k * uu + 12, 1196, {size: 26, weight: 700, color: T.ink, alpha: fadeIn(t, P.barUp + 0.3, 0.3)});
    // ×8: copies of the short bar tile along the long bar
    const n = P.x8T.filter(x => t >= x).length;
    for (let i = 0; i < n; i++) rect(c, x0 + i * E_UP * k + 1, 1052, E_UP * k - 2, 46, 3, null, rgba('#FFFFFF', 0.85), 2);
    if (n >= 8) stage.text(`× ${E_RATIO.toFixed(1)}`, 870, 1010, {role: 'display', size: 48, weight: 700, color: T.accent, align: 'right'});
  });
}

// ------------------------------------------------------------------ rocket: 3-stage dashboard (cut-away · Δv curve · mass bar), then the ascent picture
const RK = {x: 250, y: 1290, L: 560};
const GR = {x0: 450, x1: 910, y0: 820, y1: 420, dvMax: 12};               // Δv graph
const gx = f => GR.x0 + f * (GR.x1 - GR.x0), gy = dv => GR.y0 - Math.min(dv, GR.dvMax) / GR.dvMax * (GR.y0 - GR.y1);
function rocketScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, ein = fadeIn(t, ctx.scene.start, 0.3), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  const dashA = 1 - smooth((t - P.xs) / 0.45);
  withAlpha(c, ein * ef, () => {
    stars(c, 0.4);
    if (dashA > 0) withAlpha(c, dashA, () => dashboard(stage, t, P));
    const xa = smooth((t - P.xs - 0.1) / 0.45);
    if (xa > 0) withAlpha(c, xa, () => crossSection(stage, t, P));
  });
}
function dashboard(stage, t, P) {
  const c = stage.ctx, T = stage.theme, f = P.f(t);
  // ① cut-away rocket
  const sepU = clamp((t - P.drop) / 1.6), drop = easeIn(sepU);
  const L = RK.L, w = L * 0.105, eb = L * 0.05, top1 = RK.y - eb - L;
  const s1 = 1 - drop;
  // stage-1 fuel and stage-2 fuel levels follow the burned fraction (both drawn with the same overall f: explanatory)
  withAlpha(c, s1 > 0 ? 1 : 0, () => {
    c.save(); c.translate(0, 900 * drop); c.globalAlpha *= 1 - smooth(sepU * 1.4);
    rocket(c, RK.x, RK.y, 0, {L, legs: 0, fins: 0.1, soot: 0, burn: t >= P.m0 && t < P.drop ? 0.8 : 0, plumeLen: 160});
    // stage-1 tank window
    const ty0 = top1 + L * 0.14, ty1 = RK.y - eb - L * 0.06, lvl = ty0 + (ty1 - ty0) * clamp(f / F_NEED);
    rect(c, RK.x - w * 0.32, ty0, w * 0.64, ty1 - ty0, 3, rgba('#000000', 0.55));
    rect(c, RK.x - w * 0.32, lvl, w * 0.64, ty1 - lvl, 3, rgba(PAL.fuel, 0.9));
    c.restore();
  });
  // stage 2 + fairing (stays; climbs a little after separation)
  const up2 = -60 * easeOut(clamp((t - P.drop - 0.3) / 1.2));
  c.save(); c.translate(0, up2);
  const L2 = L * 0.3, s2y = top1, w2 = w;
  rect(c, RK.x - w2 / 2, s2y - L2, w2, L2, 0, PAL.body); rect(c, RK.x - w2 * 0.32, s2y - L2 * 0.85, w2 * 0.64, L2 * 0.7, 3, rgba('#000000', 0.55));
  const l2 = s2y - L2 * 0.85 + L2 * 0.7 * clamp((f - F_NEED * 0.8) / (F_NEED * 0.2)); rect(c, RK.x - w2 * 0.32, l2, w2 * 0.64, s2y - L2 * 0.15 - l2, 3, rgba(PAL.fuel, 0.9));
  const Lf = L * 0.27, wf = w * 1.25, fb = s2y - L2;
  c.beginPath(); c.moveTo(RK.x - wf / 2, fb); c.lineTo(RK.x - wf / 2, fb - Lf * 0.45); c.quadraticCurveTo(RK.x - wf / 2, fb - Lf * 0.95, RK.x, fb - Lf); c.quadraticCurveTo(RK.x + wf / 2, fb - Lf * 0.95, RK.x + wf / 2, fb - Lf * 0.45); c.lineTo(RK.x + wf / 2, fb); c.closePath(); c.fillStyle = '#E9E5DD'; c.fill();
  rect(c, RK.x - w * 0.3, fb - Lf * 0.5, w * 0.6, Lf * 0.38, 3, rgba('#C9B27A', 0.95));                      // satellite inside
  if (t > P.drop + 0.3) { c.save(); c.translate(RK.x, s2y); plume(c, 90, w * 0.5, smooth((t - P.drop - 0.3) / 0.3)); c.restore(); }
  c.restore();
  // labels on the rocket
  const la = fadeIn(t, P.m0, 0.3) * (1 - smooth((t - P.drop) / 0.4));
  if (la > 0) { tag(stage, '연료', RK.x + 60, top1 + L * 0.5, {size: 26, align: 'left', a: la, color: PAL.fuel, plate: false}); tag(stage, '위성', RK.x + 60, s2y - L2 - Lf * 0.35, {size: 26, align: 'left', a: la, color: '#E3CB8E', plate: false}); }
  tag(stage, '1단', RK.x - 60, RK.y - L * 0.3, {size: 26, align: 'right', a: fadeIn(t, P.split, 0.3) * (1 - sepU), plate: false});
  tag(stage, '2단', RK.x - 60, s2y - L2 / 2 + up2, {size: 26, align: 'right', a: fadeIn(t, P.split, 0.3), plate: false});
  tag(stage, '다 쓴 1단을 떼어 냄', RK.x + 40, 1240, {size: 26, align: 'left', a: fadeIn(t, P.drop + 0.2, 0.3), color: T.muted, plate: false});
  // ② Δv curve
  const ga = fadeIn(t, P.formula - 0.4, 0.4);
  if (ga > 0) withAlpha(c, ga, () => {
    panel(c, T, GR.x0 - 70, GR.y1 - 110, GR.x1 - GR.x0 + 100, GR.y0 - GR.y1 + 200, 0.86);
    stage.text('Δv = vₑ · ln(m₀ / m₁)', (GR.x0 + GR.x1) / 2 - 20, GR.y1 - 64, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'});
    stage.text('m₀ 연료를 채운 무게', GR.x0 - 40, GR.y1 - 18, {size: 24, weight: 700, color: PAL.fuel, alpha: fadeIn(t, P.m0, 0.3)});
    stage.text('m₁ 빈 무게', GR.x0 + 250, GR.y1 - 18, {size: 24, weight: 700, color: PAL.struct, alpha: fadeIn(t, P.m1, 0.3)});
    line(c, [[GR.x0, GR.y1 + 10], [GR.x0, GR.y0], [GR.x1, GR.y0]], rgba(T.ink, 0.6), 2);
    for (const v of [0, 3, 6, 9, 12]) { line(c, [[GR.x0 - 6, gy(v)], [GR.x0, gy(v)]], rgba(T.ink, 0.6), 2); stage.text(String(v), GR.x0 - 12, gy(v), {size: 24, color: T.muted, align: 'right'}); }
    for (const p of [0, 50, 100]) stage.text(`${p}%`, gx(p / 100), GR.y0 + 28, {size: 24, color: T.muted, align: 'center'});
    stage.text('빠르기 km/s', GR.x0 + 12, GR.y1 + 18, {size: 24, weight: 500, color: T.muted});
    stage.text('연료가 차지하는 무게', (GR.x0 + GR.x1) / 2, GR.y0 + 62, {size: 24, weight: 500, color: T.muted, align: 'center'});
    const pts = []; for (let i = 0; i <= 200; i++) { const ff = i / 200 * 0.985; pts.push([gx(ff), gy(dvOf(ff))]); }
    line(c, pts, rgba(T.ink, 0.85), 3);
    const na = fadeIn(t, P.need, 0.35);
    if (na > 0) withAlpha(c, na, () => { line(c, [[GR.x0, gy(DV_NEED)], [GR.x1, gy(DV_NEED)]], rgba(T.accent, 0.9), 2.5, {dash: [10, 8]}); stage.text('궤도에 필요 ≈ 9.4', GR.x0 + 16, gy(DV_NEED) - 22, {size: 26, weight: 700, color: T.accent}); });
    if (t >= P.m0) { const px = gx(f), py = gy(dvOf(f)); ring(c, px, py, 16, PAL.fuel, 3); circle(c, px, py, 7, PAL.fuel);
      const pa = fadeIn(t, P.p95 - 0.3, 0.3); if (pa > 0) { line(c, [[px, py], [px, GR.y0]], rgba(T.accent, 0.7 * pa), 2, {dash: [5, 6]}); stage.text('95%', px - 8, GR.y0 - 22, {size: 28, weight: 700, color: T.accent, align: 'right', alpha: pa}); } }
    stage.text('vₑ ≈ 3 km/s (등유 엔진)', GR.x1, GR.y1 + 18, {size: 24, weight: 500, color: T.muted, align: 'right'});
  });
  // ③ mass bar
  const ma = fadeIn(t, P.m0, 0.4);
  if (ma > 0) withAlpha(c, ma, () => {
    const x0 = GR.x0 - 40, x1 = GR.x1 + 20, y = 1040, h = 56, wF = (x1 - x0) * f;
    stage.text('로켓 무게', x0, y - 30, {size: 26, weight: 700, color: T.ink});
    const split = clamp((t - P.split) / 0.5), dU = easeIn(clamp((t - P.drop) / 1.2));
    const s1w = (x1 - x0) * 0.8;
    rect(c, x0, y, x1 - x0, h, 4, rgba(PAL.struct, 0.75));
    rect(c, x0, y, wF, h, 4, rgba(PAL.fuel, 0.95));
    ring(c, x0 + wF, y + h / 2, 14, PAL.fuel, 3);
    stage.text(`연료 ${Math.round(f * 100)}%`, x0 + 14, y + h / 2, {size: 28, weight: 700, color: '#1A1208'});
    stage.text(`나머지 ${Math.round((1 - f) * 100)}%: 통 · 엔진 · 위성`, x1, y + h + 30, {size: 24, weight: 500, color: T.muted, align: 'right', alpha: fadeIn(t, P.p95, 0.3) * (1 - split)});
    if (split > 0) withAlpha(c, split, () => {
      line(c, [[x0 + s1w, y - 8 + dU * 120], [x0 + s1w, y + h + 8 + dU * 120]], '#FFFFFF', 3);
      c.save(); c.globalAlpha *= 1 - dU; stage.text('1단', x0 + s1w / 2, y + h + 34 + dU * 120, {size: 26, weight: 700, color: T.ink, align: 'center'}); c.restore();
      stage.text('2단 + 위성', x0 + s1w + (x1 - x0 - s1w) / 2, y - 30, {size: 24, weight: 700, color: T.ink, align: 'center'});
    });
  });
}
// ---- cross-section (true scale, downrange × height), shared by s10–s12
const XS = {x0: 150, km0: -15, k: 780 / 180, yG: 1000};
const xsx = km => XS.x0 + (km - XS.km0) * XS.k, xsy = h => XS.yG - h * XS.k;
function xsBackdrop(stage, t, a = 1) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, xsy(100), 0, XS.yG); g.addColorStop(0, 'rgba(60,110,170,0)'); g.addColorStop(0.75, 'rgba(60,110,170,0.10)'); g.addColorStop(1, 'rgba(90,150,210,0.28)');
    c.fillStyle = g; c.fillRect(140, xsy(100), 800, XS.yG - xsy(100));
    rect(c, 140, XS.yG, 800, 6, 0, '#3B3D41'); rect(c, 140, XS.yG + 6, 800, 26, 0, '#1C1D20');
    for (const h of [50, 100]) { line(c, [[140, xsy(h)], [930, xsy(h)]], rgba(T.ink, 0.12), 1.5, {dash: [4, 8]}); stage.text(`${h} km`, 925, xsy(h) - 16, {size: 24, color: T.muted, align: 'right'}); }
    line(c, [[xsx(0), XS.yG - 2], [xsx(0), XS.yG + 8]], T.ink, 3); stage.text('발사장', xsx(0), XS.yG + 44, {size: 24, weight: 700, align: 'center'});
    stage.text('가로 · 세로 같은 축척 (km) · 로켓 크기 과장', 540, 330, {size: 24, color: T.muted, align: 'center'});
  });
}
const pathPts = (path, t0, t1, cut = 165) => { const o = []; for (const q of path) { if (q.t < t0) continue; if (q.t > t1) break; if (q.x > cut) break; o.push([xsx(q.x), xsy(q.h)]); } return o; };
function crossSection(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  xsBackdrop(stage, t);
  const m = t < P.sep ? P.ascM(t) : P.mission(t), mA = Math.min(m, 150);
  line(c, pathPts(MODEL.asc, 0, mA), rgba(T.ink, 0.85), 3);
  const s = sampleAt(MODEL.asc, mA);
  if (t < P.sep) rocket(c, xsx(s.x), xsy(s.h), Math.atan2(s.ve, s.vu), {L: 34, stack: true, burn: m > 0 ? 1 : 0, plumeLen: 40 + 30 * smooth(m / 30)});
  else {
    // stage 2 keeps the ascent time scale and leaves the frame; stage 1 starts its flip
    const m2 = 150 + (t - P.sep) * P.ascX, p2 = pathPts(MODEL.s2, 150, m2);
    if (p2.length > 1) line(c, p2, rgba(T.ink, 0.5), 2.5, {dash: [8, 7]});
    const q = sampleAt(MODEL.s2, m2);
    if (q.x < 162) stage2(c, xsx(q.x), xsy(q.h), Math.atan2(q.ve, q.vu), {L: 22, burn: m2 > 153 ? 1 : 0, plumeLen: 40});
    tag(stage, '2단 → 궤도 (고도 200 km)', 910, xsy(112), {size: 24, align: 'right', color: T.muted, plate: false, a: fadeIn(t, P.sep + 0.5, 0.4)});
    const r = sampleAt(BACK, m); rocket(c, xsx(r.x), xsy(r.h), boosterAngle(m), {L: 30, burn: 0});
  }
  // readouts
  const ra = fadeIn(t, P.xs + 0.3, 0.4);
  if (ra > 0) withAlpha(c, ra, () => {
    panel(c, T, 160, 1140, 760, 120, 0.86);
    const cells = [['시간', `T+${mmss(mA)}`], ['높이', `${Math.round(s.h)} km`], ['빠르기', `초속 ${f1(speedOf(s))} km`]];
    cells.forEach(([k, v], i) => { const x = 230 + i * 250; stage.text(k, x, 1175, {size: 24, weight: 500, color: T.muted}); stage.text(v, x, 1222, {role: 'display', size: 36, weight: 700, color: i === 1 ? T.accent : T.ink}); });
  });
  const sa = fadeIn(t, P.sep, 0.3);
  if (sa > 0) { const q = MODEL.meco; tag(stage, '분리 · 약 70 km · 2분 30초', xsx(q.x) + 20, xsy(q.h) + 46, {size: 26, align: 'left', a: sa, color: T.accent}); }
}

// ------------------------------------------------------------------ return: 3-stage dashboard with the tracked first stage
const RT_PH = [{id: 'flip', n: '①', name: '뒤집기', t: () => MODEL.T.meco}, {id: 'bb', n: '②', name: '역추진 연소', t: () => MODEL.T.bb0},
  {id: 'en', n: '③', name: '재진입 연소', t: () => MODEL.T.en0}, {id: 'fin', n: '④', name: '격자 날개로 방향', t: () => MODEL.T.en1}];
/** nose direction (screen radians, 0 = up, + clockwise) of the returning first stage at mission time m */
function boosterAngle(m) {
  const T = MODEL.T, s = sampleAt(BACK, m), vel = Math.atan2(s.ve, s.vu);           // pointing along the velocity
  const against = Math.atan2(-s.ve, -s.vu);                                        // nose opposite the velocity (engines first)
  const west = -Math.PI / 2;                                                       // nose toward the pad (engines push toward −x... nose −x)
  const lerpAng = (a, b, q) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * q; };
  if (m <= T.meco) return vel;
  const mecoVel = Math.atan2(MODEL.meco.ve, MODEL.meco.vu);
  if (m < T.bb0) return lerpAng(mecoVel, west, easeInOut((m - T.meco) / (T.bb0 - T.meco)));
  if (m < T.bb1) return west;
  // coast: rotate to engines-first (nose opposite the velocity) before the entry burn
  if (m < T.en0) return lerpAng(west, against, easeInOut((m - T.bb1) / Math.min(60, T.en0 - T.bb1)));
  return against;
}
const boosterState = m => {
  const T = MODEL.T;
  const burn = (m >= T.bb0 && m < T.bb1) || (m >= T.en0 && m < T.en1) || (m >= T.ign && m < T.touch) ? 1 : 0;
  const engines = m >= T.ign ? 1 : 3, fins = smooth((m - T.en0 + 4) / 6), legs = smooth((m - (T.touch - 3.2)) / 2.0);
  return {burn, engines, fins, legs};
};
const INSET = {x: 300, y: 545, r: 104};
function returnScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  const m = P.mission(t);
  withAlpha(c, ef, () => {
    stars(c, 0.4);
    xsBackdrop(stage, t);
    // ascent (dim) and stage 2 leaving
    line(c, pathPts(MODEL.asc, 0, 150), rgba(T.ink, 0.3), 2.5);
    const p2 = pathPts(MODEL.s2, 150, 400); if (p2.length > 1) line(c, p2, rgba(T.ink, 0.25), 2, {dash: [8, 7]});
    tag(stage, '2단 → 궤도', 910, xsy(112), {size: 24, align: 'right', color: T.muted, plate: false});
    // stage-1 return path so far (burns highlighted)
    const done = MODEL.ret.filter(q => q.t <= m);
    for (let i = 1; i < done.length; i++) {
      const a = done[i - 1], b = done[i], burn = boosterState((a.t + b.t) / 2).burn;
      line(c, [[xsx(a.x), xsy(a.h)], [xsx(b.x), xsy(b.h)]], burn ? T.accent : rgba(PAL.speed, 0.9), burn ? 4 : 3);
    }
    // phase markers
    RT_PH.forEach((ph, k) => {
      const tm = ph.t(); if (m < tm) return; const s = sampleAt(BACK, tm), a = fadeIn(m, tm, 4);
      withAlpha(c, a, () => { circle(c, xsx(s.x), xsy(s.h), 15, T.plate); ring(c, xsx(s.x), xsy(s.h), 15, T.accent, 2.5); stage.text(ph.n, xsx(s.x), xsy(s.h) + 1, {size: 24, weight: 700, color: T.accent, align: 'center'}); });
    });
    // the booster (tracked)
    const s = sampleAt(BACK, m), ang = boosterAngle(m), st = boosterState(m), bx = xsx(s.x), by = xsy(s.h);
    rocket(c, bx, by, ang, {L: 30, fins: st.fins, burn: st.burn, engines: st.engines, plumeLen: 34});
    ring(c, bx + Math.sin(ang) * 16, by - Math.cos(ang) * 16, 30, rgba(T.accent, 0.95), 3);
    // leader to the inset
    line(c, [[bx - 22, by - 22], [INSET.x + INSET.r * 0.72, INSET.y + INSET.r * 0.72]], rgba(T.accent, 0.55), 2, {dash: [5, 6]});
    inset(stage, t, m, ang, st, s);
    graph(stage, t, m);
  });
}
function inset(stage, t, m, ang, st, s) {
  const c = stage.ctx, T = stage.theme, {x, y, r} = INSET;
  const skyK = clamp(s.h / 80);
  clipEllipse(c, x, y, r, r, () => {
    const g = c.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, mix('#3E78B5', '#05070C', skyK)); g.addColorStop(1, mix('#9CC3E6', '#0B0F18', skyK));
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    const L = 130, ex = x - Math.sin(ang) * L * 0.5, ey = y + Math.cos(ang) * L * 0.5;     // centre the stage in the inset
    rocket(c, ex, ey, ang, {L, fins: st.fins, burn: st.burn, engines: st.engines, plumeLen: 110, soot: 0.3});
  });
  ring(c, x, y, r, T.accent, 3);
  const ph = m < MODEL.T.bb0 ? RT_PH[0] : m < MODEL.T.bb1 ? RT_PH[1] : m < MODEL.T.en0 ? null : m < MODEL.T.en1 ? RT_PH[2] : RT_PH[3];
  const label = ph ? `${ph.n} ${ph.name}` : '날아 내려옴 (엔진 끔)';
  tag(stage, label, x, y + r + 34, {size: 26, color: ph ? T.accent : T.muted});
  if (st.burn) tag(stage, `엔진 ${st.engines}개`, x, y - r - 26, {size: 24, color: T.ink, plate: false});
}
const GP = {x0: 210, x1: 910, y0: 1325, y1: 1110, t0: 150, t1: 490};
function graph(stage, t, m) {
  const c = stage.ctx, T = stage.theme, tx = tt => GP.x0 + (tt - GP.t0) / (GP.t1 - GP.t0) * (GP.x1 - GP.x0);
  const hy = h => GP.y0 - h / 140 * (GP.y0 - GP.y1), vy = v => GP.y0 - v / 2.6 * (GP.y0 - GP.y1);
  panel(c, T, GP.x0 - 60, GP.y1 - 62, GP.x1 - GP.x0 + 80, GP.y0 - GP.y1 + 76, 0.86);
  for (const [a, b] of [[MODEL.T.bb0, MODEL.T.bb1], [MODEL.T.en0, MODEL.T.en1], [MODEL.T.ign, MODEL.T.touch]]) rect(c, tx(a), GP.y1, tx(b) - tx(a), GP.y0 - GP.y1, 0, rgba(T.accent, 0.18));
  line(c, [[GP.x0, GP.y1], [GP.x0, GP.y0], [GP.x1, GP.y0]], rgba(T.ink, 0.5), 2);
  const hp = [], vp = []; for (const q of MODEL.ret) { if (q.t > m) break; hp.push([tx(q.t), hy(q.h)]); vp.push([tx(q.t), vy(speedOf(q))]); }
  if (hp.length > 1) { line(c, hp, rgba(PAL.alt, 0.9), 3); line(c, vp, rgba(PAL.speed, 0.95), 3); }
  const s = sampleAt(BACK, m), cx = tx(Math.min(m, GP.t1));
  line(c, [[cx, GP.y1], [cx, GP.y0]], rgba(T.accent, 0.8), 2);
  stage.text(`T+${mmss(m)}`, GP.x0 - 40, GP.y1 - 32, {size: 26, weight: 700, color: T.ink});
  stage.text(`높이 ${Math.round(s.h)} km`, GP.x0 + 170, GP.y1 - 32, {size: 26, weight: 700, color: PAL.alt});
  stage.text(`빠르기 초속 ${f1(speedOf(s))} km`, GP.x0 + 400, GP.y1 - 32, {size: 26, weight: 700, color: PAL.speed});
}

// ------------------------------------------------------------------ landing: close view + forces + height–speed plot
const LV = {cx: 330, yE: 900, L: 400, padY: 1215};
const PX_M = LV.L / 41;                                                  // the stage is about 41 m long
function landingScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, ein = fadeIn(t, ctx.scene.start, 0.3), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  const m = P.mission(t), s = sampleAt(BACK, m), hm = hShow(s) * 1000, st = boosterState(m);
  withAlpha(c, ein * ef, () => {
    // dusk sky with the ground arriving at the end
    const g = c.createLinearGradient(0, 300, 0, 1340); g.addColorStop(0, '#0C1018'); g.addColorStop(1, '#2A2C33'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1340);
    stars(c, 0.5, 900);
    const yE = Math.max(LV.yE, LV.padY - 8 - hm * PX_M), groundY = yE + 8 + hm * PX_M;
    // altitude tape (left edge)
    tape(stage, hm);
    if (groundY < 1400) {
      c.fillStyle = '#0F1012'; c.fillRect(0, groundY - 30, 1080, 1400 - groundY + 30);
      c.save(); c.translate(LV.cx, groundY); c.scale(1, PAD.ry / PAD.rx); const gp = c.createRadialGradient(0, 0, 0, 0, 0, 200); gp.addColorStop(0, '#45464A'); gp.addColorStop(1, '#2A2B2E'); circle(c, 0, 0, 200, gp); ring(c, 0, 0, 160, rgba('#D9D3C8', 0.5), 5); c.restore();
      groundSmoke(c, LV.cx, groundY + 6, clamp((400 - hm) / 300) * (t < P.touchS ? 1 : Math.exp(-(t - P.touchS) / 1.5)), st.burn, t);
    }
    if (st.burn) { c.save(); c.globalCompositeOperation = 'lighter'; const gl = c.createRadialGradient(LV.cx, yE + 120, 0, LV.cx, yE + 120, 360); gl.addColorStop(0, rgba('#FFB060', 0.35)); gl.addColorStop(1, rgba('#FF8040', 0)); c.fillStyle = gl; c.fillRect(0, 400, 700, 1000); c.restore(); }
    const burnI = st.burn ? 1 : t >= P.touchS ? Math.exp(-(t - P.touchS) / 0.1) * 0.5 : 0;
    rocket(c, LV.cx, yE, 0, {L: LV.L, legs: st.legs, fins: 1, soot: 0.45, burn: burnI, engines: 1, plumeLen: clamp(groundY - yE, 60, 420), spread: 0.3});
    // readout box
    panel(c, T, 160, 330, 340, 110, 0.86);
    stage.text('높이', 180, 362, {size: 24, weight: 500, color: T.muted}); stage.text('빠르기 (아래로)', 330, 362, {size: 24, weight: 500, color: T.muted});
    stage.text(hm >= 1000 ? `${(hm / 1000).toFixed(2)} km` : `${Math.round(hm)} m`, 180, 408, {role: 'display', size: 36, weight: 700, color: PAL.alt});
    stage.text(`${Math.round(speedOf(s) * 1000)} m/s`, 330, 408, {role: 'display', size: 36, weight: 700, color: PAL.speed});
    if (st.burn) tag(stage, '착륙 연소 · 엔진 1개', 330, 462, {size: 26, color: T.accent});
    forces(stage, t, P);
    phasePlot(stage, t, P, m);
  });
}
function tape(stage, hm) {
  const c = stage.ctx, T = stage.theme, x = 150, yC = 860, k = 0.12;           // 0.12 px per m on the tape
  clipRect(c, 140, 470, 60, 840, 0, () => {
    line(c, [[x + 30, 470], [x + 30, 1310]], rgba(T.ink, 0.35), 2);
    for (let a = Math.floor((hm - 3600) / 500) * 500; a <= hm + 3600; a += 500) { if (a < 0) continue; const y = yC + (hm - a) * k; line(c, [[x + 18, y], [x + 30, y]], rgba(T.ink, 0.6), 2); }
  });
  circle(c, x + 30, yC, 6, T.accent);
}
function forces(stage, t, P) {
  const c = stage.ctx, T = stage.theme, a = fadeIn(t, P.forceIn, 0.35);
  if (a <= 0) return;
  withAlpha(c, a, () => {
    panel(c, T, 560, 330, 370, 330, 0.88);
    stage.text('엔진 하나를 가장 약하게', 580, 370, {size: 26, weight: 700, color: T.accent});
    const k = 280 / 400, yb = 420;
    rect(c, 580, yb, LAND.minKN * k, 40, 4, rgba(T.accent, 0.9)); stage.text(`약 ${LAND.minKN} kN`, 590, yb + 20, {size: 26, weight: 700, color: '#1A1208'});
    const wa = fadeIn(t, P.weightIn, 0.35);
    withAlpha(c, wa, () => {
      stage.text('1단의 무게 (약 30 t)', 580, 500, {size: 26, weight: 700, color: T.ink});
      rect(c, 580, 528, LAND.weightKN * k, 40, 4, rgba(T.ink, 0.85)); stage.text(`약 ${Math.round(LAND.weightKN / 10) * 10} kN`, 590, 548, {size: 26, weight: 700, color: '#141414'});
      line(c, [[580 + LAND.weightKN * k, 418], [580 + LAND.weightKN * k, 572]], rgba('#FFFFFF', 0.7), 2, {dash: [4, 5]});
    });
    const va = fadeIn(t, P.verdict, 0.35);
    if (va > 0) stage.text('→ 멈춰 떠 있을 수 없다', 580, 620, {role: 'display', size: 32, weight: 700, color: T.accent, alpha: va});
  });
}
const PP = {x0: 620, x1: 900, y0: 1295, y1: 880, vMax: 360, hMax: 4.6};
function phasePlot(stage, t, P, m) {
  const c = stage.ctx, T = stage.theme;
  const px = v => PP.x0 + v / PP.vMax * (PP.x1 - PP.x0), py = h => PP.y0 - h / PP.hMax * (PP.y0 - PP.y1);
  panel(c, T, 560, 700, 370, 640, 0.86);
  stage.text('높이 – 빠르기', 580, 736, {size: 26, weight: 700, color: T.ink});
  line(c, [[PP.x0, PP.y1], [PP.x0, PP.y0], [PP.x1, PP.y0]], rgba(T.ink, 0.6), 2);
  for (const h of [1, 2, 3, 4]) stage.text(`${h} km`, PP.x0 - 8, py(h), {size: 24, color: T.muted, align: 'right'});
  for (const v of [100, 300]) stage.text(`${v}`, px(v), PP.y0 + 26, {size: 24, color: T.muted, align: 'center'});
  stage.text('m/s', PP.x1, PP.y0 + 26, {size: 24, color: T.muted, align: 'right'});
  // ghosts (explanatory model): too early / too late
  const ga = fadeIn(t, P.ghosts, 0.4);
  if (ga > 0) withAlpha(c, ga, () => {
    const seg = (path, t0) => path.filter(q => q.t >= t0).map(q => [px(speedOf(q) * 1000 * (q.vu < 0 ? 1 : -1)), py(Math.max(0, q.h))]);
    const e = seg(MODEL.early, MODEL.T.ign - 6.5); line(c, e, rgba(PAL.ghost, 0.9), 2.5, {dash: [7, 6]});
    const eEnd = e.at(-1); arrow(c, eEnd, [eEnd[0], eEnd[1] - 46], rgba(PAL.ghost, 0.9), 2.5);
    const l = seg(MODEL.late, MODEL.T.ign - 6.5); line(c, l, rgba(PAL.bad, 0.9), 2.5, {dash: [7, 6]});
    const lEnd = l.at(-1); ring(c, lEnd[0], lEnd[1], 9, PAL.bad, 2.5);
    line(c, [[580, 784], [615, 784]], rgba(PAL.ghost, 0.9), 2.5, {dash: [7, 6]}); stage.text('일찍 켜면: 다시 솟음', 625, 784, {size: 24, weight: 700, color: PAL.ghost});
    line(c, [[580, 822], [615, 822]], rgba(PAL.bad, 0.9), 2.5, {dash: [7, 6]}); stage.text(`늦게 켜면: ${Math.round(MODEL.lateV)} m/s 충돌`, 625, 822, {size: 24, weight: 700, color: PAL.bad});
  });
  // target (0, 0)
  const ta = fadeIn(t, P.target, 0.35);
  if (ta > 0) { ring(c, px(0), py(0), 16 + 6 * Math.sin(t * 5) * (t < P.touchS ? 1 : 0), rgba(PAL.good, ta), 3); stage.text('0 · 0', px(0) + 22, py(0) - 22, {size: 26, weight: 700, color: PAL.good, alpha: ta}); }
  // actual path so far
  const pts = MODEL.ret.filter(q => q.t >= MODEL.T.ign - 6.5 && q.t <= m).map(q => [px(speedOf(q) * 1000), py(hShow(q))]);
  if (pts.length > 1) line(c, pts, T.accent, 3.5);
  const s = sampleAt(BACK, m); const cp = [px(speedOf(s) * 1000), py(hShow(s))];
  ring(c, cp[0], cp[1], 13, T.accent, 3); circle(c, cp[0], cp[1], 5, T.accent);
  const ig = MODEL.ign; if (m >= MODEL.T.ign) stage.text('점화', px(speedOf(ig) * 1000) - 14, py(ig.h) - 28, {size: 24, weight: 700, color: T.accent, align: 'right'});
}

// ------------------------------------------------------------------ reuse: cycle + fairing recovery → tower catch → satellites
function reuseScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, ein = fadeIn(t, ctx.scene.start, 0.3), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  withAlpha(c, ein * ef, () => {
    stars(c, 0.4);
    const a1 = 1 - smooth((t - P.tower) / 0.4), a2 = smooth((t - P.tower) / 0.4) * (1 - smooth((t - P.old + 0.3) / 0.4)), a3 = smooth((t - P.old + 0.3) / 0.4);
    if (a1 > 0) withAlpha(c, a1, () => { cycle(stage, t, P); fairing(stage, t, P); });
    if (a2 > 0) withAlpha(c, a2, () => towerCatch(stage, t, P));
    if (a3 > 0) withAlpha(c, a3, () => manySats(stage, t, P));
  });
}
const CY = {x: 540, y: 600, r: 165};
const CY_ST = [{a: -Math.PI / 2, n: '발사'}, {a: 0, n: '분리 · 귀환'}, {a: Math.PI / 2, n: '착륙'}, {a: Math.PI, n: '점검'}];
function cycle(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  ring(c, CY.x, CY.y, CY.r, rgba(T.ink, 0.35), 3);
  const ang = Math.PI / 2 + Math.max(0, t - P.cycle0) * (Math.PI / 2) / (P.check - P.cycle0);
  // travelled arc
  ring(c, CY.x, CY.y, CY.r, rgba(T.accent, 0.9), 5, Math.PI / 2, ang);
  for (const s of CY_ST) {
    const x = CY.x + CY.r * Math.cos(s.a), y = CY.y + CY.r * Math.sin(s.a), lit = ((ang - s.a) % TAU + TAU) % TAU < 0.5 && ang > s.a - 0.01;
    circle(c, x, y, 13, lit ? T.accent : T.plate); ring(c, x, y, 13, T.accent, 2.5);
    const ox = Math.cos(s.a) * 70, oy = Math.sin(s.a) * 42;
    stage.text(s.n, x + ox, y + oy, {size: 26, weight: 700, color: lit ? T.accent : T.ink, align: 'center'});
  }
  const bx = CY.x + CY.r * Math.cos(ang), by = CY.y + CY.r * Math.sin(ang);
  rocket(c, bx, by + 24, 0, {L: 46, legs: 1, fins: 1, soot: 0.6});
  stage.text('같은 1단', CY.x, CY.y - 18, {size: 28, weight: 700, color: T.ink, align: 'center'});
  stage.text('다시 날기', CY.x, CY.y + 22, {size: 28, weight: 700, color: T.accent, align: 'center', alpha: fadeIn(t, P.fly15, 0.3)});
}
function fairing(stage, t, P) {
  const c = stage.ctx, T = stage.theme, a = fadeIn(t, P.fairSplit - 0.3, 0.35);
  if (a <= 0) return;
  withAlpha(c, a, () => {
    const seaY = 1250, x = 540, topY = 960;
    // sea
    const gs = c.createLinearGradient(0, seaY, 0, 1340); gs.addColorStop(0, PAL.sea); gs.addColorStop(1, PAL.sea2); c.fillStyle = gs; c.fillRect(140, seaY, 800, 90);
    line(c, [[140, seaY], [940, seaY]], rgba(PAL.atm, 0.5), 2);
    const u = clamp((t - P.fairSplit) / (P.splash - P.fairSplit)), sep = easeOut(clamp((t - P.fairSplit) / 0.6));
    const fall = easeIn(u) * (seaY - topY - 40);
    const pick = clamp((t - P.pick) / 0.8);
    for (const s of [-1, 1]) {
      const fx = x + s * (14 + 150 * sep) + (pick > 0 ? 0 : 0), fy = topY + fall + (pick > 0 ? 0 : 0);
      const boatX = lerp(980, 540, easeOut(clamp((t - P.splash + 0.2) / 0.9)));
      const hx = pick > 0 ? lerp(fx, boatX + s * 40, easeInOut(pick)) : fx, hy = pick > 0 ? lerp(fy, seaY - 34, easeInOut(pick)) : fy;
      // parachute (parafoil) above each half while falling
      if (u > 0.15 && u < 1) withAlpha(c, smooth((u - 0.15) / 0.2), () => { c.beginPath(); c.ellipse(hx, hy - 120, 64, 22, 0, Math.PI, TAU); c.fillStyle = rgba('#D8D2C4', 0.9); c.fill(); line(c, [[hx - 60, hy - 120], [hx, hy - 30]], rgba('#D8D2C4', 0.6), 1.5); line(c, [[hx + 60, hy - 120], [hx, hy - 30]], rgba('#D8D2C4', 0.6), 1.5); });
      // half shell
      c.save(); c.translate(hx, hy); c.scale(s, 1);
      c.beginPath(); c.moveTo(0, 40); c.lineTo(0, -60); c.quadraticCurveTo(28, -58, 34, -10); c.lineTo(34, 40); c.closePath(); c.fillStyle = '#E9E5DD'; c.fill(); c.restore();
    }
    if (u <= 0) { rect(c, x - 28, topY - 20, 56, 50, 4, rgba('#C9B27A', 0.95)); }
    else if (u < 0.6) withAlpha(c, 1 - u / 0.6, () => rect(c, x - 28, topY - 20 - 200 * u, 56, 50, 4, rgba('#C9B27A', 0.95)));
    // the recovery ship
    const boatX = lerp(980, 540, easeOut(clamp((t - P.splash + 0.2) / 0.9)));
    if (t > P.splash - 0.3) { poly(c, [[boatX - 120, seaY - 10], [boatX + 120, seaY - 10], [boatX + 95, seaY + 22], [boatX - 95, seaY + 22]], '#3B3E44'); rect(c, boatX + 40, seaY - 44, 50, 34, 3, '#4A4D54'); }
    if (u >= 1 && pick <= 0) for (const s of [-1, 1]) { const fx = x + s * 164; c.save(); c.globalCompositeOperation = 'lighter'; glow(c, fx, seaY, 50, '#BFE3FF', 0.25 * Math.exp(-(t - P.splash) / 0.5)); c.restore(); }
    tag(stage, '위성 덮개 두 쪽 · 낙하산 → 바다 → 배', 540, 875, {size: 26, color: T.ink});
  });
}
function towerCatch(stage, t, P) {
  const c = stage.ctx, T = stage.theme, tx = 690, top = 400, base = 1240;
  // ground
  c.fillStyle = '#121315'; c.fillRect(140, base, 800, 100);
  // lattice tower
  rect(c, tx - 34, top, 68, base - top, 0, '#2E3034'); for (let y = top; y < base; y += 34) { line(c, [[tx - 34, y], [tx + 34, y + 34]], rgba('#5B5E64', 0.8), 2); line(c, [[tx + 34, y], [tx - 34, y + 34]], rgba('#5B5E64', 0.8), 2); }
  // booster: descends to the catch point
  const L = 640, catchY = 1150, u = clamp((t - P.bigIn) / (P.catch - P.bigIn)), yE = lerp(catchY - 900, catchY, 1 - (1 - u) ** 2);
  const burn = t < P.catch ? fadeIn(t, P.bigIn, 0.3) : Math.exp(-(t - P.catch) / 0.25);
  rocket(c, 510, yE, 0, {L, w: 84, fins: 1, soot: 0.25, burn, engines: 3, plumeLen: 200});
  // arms: pivot on the tower at the catch height; close at the catch
  const armY = catchY - L * 0.86, close = easeInOut(clamp((t - P.catch + 0.5) / 0.5));
  for (const s of [-1, 1]) {
    const ang = s * lerp(0.42, 0.06, close);
    const ex = tx - 34 - 210 * Math.cos(ang), ey = armY + 210 * Math.sin(ang) * 0.35 + s * 8;
    line(c, [[tx - 34, armY + s * 8], [ex, ey]], '#55585F', 14, {cap: 'butt'});
  }
  rect(c, tx - 50, armY - 30, 100, 60, 4, '#3A3D43');
  tag(stage, '2024.10.13 · Super Heavy (길이 약 71 m)', 540, 360, {size: 26, color: T.ink, a: fadeIn(t, P.bigIn, 0.35)});
  tag(stage, '발사탑의 두 팔', tx + 60, armY - 70, {size: 28, color: T.accent, a: fadeIn(t, P.armsTag, 0.35), align: 'left', plate: false});
  if (t > P.catch) tag(stage, '공중에서 붙잡음', tx + 60, armY + 70, {size: 28, color: T.accent, a: fadeIn(t, P.catch, 0.3), align: 'left', plate: false, role: 'display'});
}
function manySats(stage, t, P) {
  const c = stage.ctx, T = stage.theme, V = VIEW.arc;
  // old vs new (top)
  const oa = fadeIn(t, P.old, 0.35) * fadeOut(t, P.leoBack, 0.4);
  if (oa > 0) withAlpha(c, oa, () => {
    panel(c, T, 160, 340, 360, 520, 0.86); panel(c, T, 560, 340, 370, 520, 0.86);
    stage.text('예전', 340, 380, {size: 28, weight: 700, color: T.muted, align: 'center'}); stage.text('지금', 745, 380, {size: 28, weight: 700, color: T.accent, align: 'center'});
    const u = clamp((t - P.old) / 1.6);
    const gs = c.createLinearGradient(0, 780, 0, 840); gs.addColorStop(0, PAL.sea); gs.addColorStop(1, PAL.sea2); c.fillStyle = gs; c.fillRect(170, 780, 340, 70);
    rocket(c, 340 + 40 * u, 500 + 270 * easeIn(u), 0.5 + 1.6 * u, {L: 120, soot: 0.2, alpha: 1 - smooth((u - 0.85) / 0.15)});
    stage.text('1단은 바다로 → 한 번 쓰고 버림', 340, 820, {size: 24, weight: 700, color: T.muted, align: 'center'});
    const v = clamp((t - P.newer) / 1.2);
    c.fillStyle = '#1C1D20'; c.fillRect(570, 780, 350, 70);
    rocket(c, 745, lerp(440, 772, 1 - (1 - v) ** 2), 0, {L: 120, legs: smooth((v - 0.6) / 0.3), fins: 1, soot: 0.6, burn: v > 0.4 && v < 1 ? 1 : 0, engines: 1, plumeLen: 60});
    stage.text('돌아와 다시 씀', 745, 820, {size: 24, weight: 700, color: T.accent, align: 'center'});
    const ca = fadeIn(t, P.cost, 0.35);
    if (ca > 0) { panel(c, T, 300, 900, 480, 90, 0.9); stage.text('발사 비용', 470, 945, {size: 30, weight: 700, color: T.ink, align: 'center', alpha: ca}); arrow(c, [640, 915], [640, 975 * 1 + 0 * fadeIn(t, P.costDown, 0.3)], rgba(PAL.good, ca * fadeIn(t, P.costDown, 0.3)), 6); stage.text('크게 내려감', 760, 945, {size: 28, weight: 700, color: PAL.good, align: 'center', alpha: fadeIn(t, P.costDown, 0.3)}); }
  });
  const la = fadeIn(t, P.leoBack, 0.45);
  if (la > 0) withAlpha(c, la, () => {
    c.beginPath(); c.arc(V.cx, V.cy, V.R + 2000 * V.R / RE, 0, TAU); c.arc(V.cx, V.cy, V.R, 0, TAU, true); c.fillStyle = rgba(PAL.speed, 0.08); c.fill('evenodd');
    earth(c, V);
    const frac = 0.25 + 0.75 * clamp((t - P.flock) / 2.8);
    satellites(c, V, t, 1, frac);
    // launches: arcs from the ground into the band
    P.launches.forEach((t0, k) => {
      const u = clamp((t - t0) / 1.1); if (u <= 0 || u >= 1) return;
      const a0 = -0.28 + 0.09 * k, p0 = vpt(V, a0, 0), p1 = vpt(V, a0 + 0.12, 520), q = easeOut(u);
      const x = lerp(p0[0], p1[0], q), y = lerp(p0[1], p1[1], q) - Math.sin(q * Math.PI) * 30;
      glow(c, x, y, 14, T.accent, 0.5 * (1 - u)); circle(c, x, y, 3.5, '#FFFFFF');
    });
    tag(stage, '해마다 수천 개 → 낮은 궤도', 540, 600, {size: 32, role: 'display', color: T.accent, a: fadeIn(t, P.flock, 0.35)});
    tag(stage, 'LEO', 820, 520, {size: 28, color: PAL.speed, plate: false});
  });
}

// ------------------------------------------------------------------ myth: straight up? → the real ascent (pitch, Δv budget)
const MY = {cx: 540, top: 1190, k: 0.5, ex: 3, phi0: 0};
MY.R = RE * MY.k; MY.cy = MY.top + MY.R; MY.phi0 = (MODEL.s2.at(-1).x / 2) / RE;
const mpt = (xkm, h) => { const phi = xkm / RE - MY.phi0, r = MY.R + h * MY.k * MY.ex; return [MY.cx + r * Math.sin(phi), MY.cy - r * Math.cos(phi)]; };
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), T = stage.theme, ein = fadeIn(t, ctx.scene.start, 0.3), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  withAlpha(c, ein * ef, () => {
    stars(c, 0.6);
    // Earth limb and the dense air (×3 height)
    c.save(); c.beginPath(); c.arc(MY.cx, MY.cy, MY.R, 0, TAU); c.fillStyle = '#16314F'; c.fill(); c.restore();
    const ta = 0.6 + 0.4 * fadeIn(t, P.thick, 0.4) * fadeOut(t, P.tilt + 0.6, 0.6);
    const ga = c.createRadialGradient(MY.cx, MY.cy, MY.R, MY.cx, MY.cy, MY.R + 30 * MY.k * MY.ex); ga.addColorStop(0, rgba(PAL.atm, 0.55 * ta)); ga.addColorStop(1, rgba(PAL.atm, 0));
    c.beginPath(); c.arc(MY.cx, MY.cy, MY.R + 30 * MY.k * MY.ex, 0, TAU); c.fillStyle = ga; c.fill();
    const pad = mpt(0, 0); circle(c, pad[0], pad[1], 6, T.ink); stage.text('발사장', pad[0] + 4, pad[1] + 30, {size: 24, weight: 700, color: T.ink});
    tag(stage, '짙은 공기 (약 30 km 아래)', 700, mpt(700, 0)[1] - 64, {size: 24, color: PAL.atm, plate: false, a: fadeIn(t, P.thick, 0.4)});
    // orbit line at 200 km (dashed)
    const op = []; for (let x = -100; x <= MODEL.s2.at(-1).x + 150; x += 20) op.push(mpt(x, 200)); line(c, op, rgba(PAL.speed, 0.35), 2, {dash: [6, 8]});
    stage.text('궤도 고도 200 km', 905, mpt(1600, 200)[1] - 26, {size: 24, color: PAL.speed, align: 'right'});
    // ghost: straight up and back down
    const gA = fadeIn(t, P.ghost0, 0.3) * fadeOut(t, P.no + 0.4, 0.4);
    if (gA > 0) withAlpha(c, gA, () => {
      const u = clamp((t - P.ghost0) / (P.ghostFall - P.ghost0)), hh = 200 * (1 - (2 * u - 1) ** 2), up = mpt(0, 200);
      line(c, [pad, up], rgba(PAL.ghost, 0.8), 2.5, {dash: [8, 8]});
      const b = mpt(0, hh); rocket(c, b[0], b[1], u < 0.5 ? 0 : Math.PI, {L: 26, stack: true, burn: u < 0.35 ? 1 : 0, plumeLen: 30, alpha: 0.9});
      tag(stage, '곧장 위로만 → 다시 떨어짐', up[0] + 30, up[1] - 20, {size: 26, align: 'left', color: PAL.ghost, plate: false});
    });
    // the real ascent (model)
    const ra = fadeIn(t, P.no + 0.1, 0.35);
    if (ra > 0) withAlpha(c, ra, () => {
      const m = P.realM(t), pts = FULL.filter(q => q.t <= m).map(q => mpt(q.x, q.h));
      if (pts.length > 1) line(c, pts, T.accent, 4);
      const s = sampleAt(FULL, m), b = mpt(s.x, s.h), nb = mpt(sampleAt(FULL, m + 2).x, sampleAt(FULL, m + 2).h);
      const ang = Math.atan2(nb[0] - b[0], -(nb[1] - b[1]));
      if (m < 150) rocket(c, b[0], b[1], ang, {L: 26, stack: true, burn: 1, plumeLen: 30}); else stage2(c, b[0], b[1], ang, {L: 18, burn: m < 513 ? 1 : 0, plumeLen: 26});
      gauge(stage, t, P, s);
      budget(stage, t, P);
    });
  });
}
function gauge(stage, t, P, s) {
  const c = stage.ctx, T = stage.theme, x = 320, y = 760, r = 150, a = fadeIn(t, P.leave, 0.35);
  if (a <= 0) return;
  withAlpha(c, a, () => {
    panel(c, T, 160, 470, 330, 340, 0.86);
    stage.text('실제 기울기', 180, 508, {size: 26, weight: 700, color: T.ink});
    ring(c, x - 130, y, r, rgba(T.ink, 0.4), 3, -Math.PI / 2, 0);
    for (const d of [0, 30, 60, 90]) { const th = -d * Math.PI / 180; line(c, [[x - 130 + (r - 10) * Math.cos(th), y + (r - 10) * Math.sin(th)], [x - 130 + r * Math.cos(th), y + r * Math.sin(th)]], rgba(T.ink, 0.6), 2); stage.text(`${d}°`, x - 130 + (r + 26) * Math.cos(th), y + (r + 18) * Math.sin(th), {size: 24, color: T.muted, align: 'center'}); }
    const d = clamp(pitchDeg(s), 0, 90), th = -d * Math.PI / 180;
    arrow(c, [x - 130, y], [x - 130 + (r - 18) * Math.cos(th), y + (r - 18) * Math.sin(th)], T.accent, 4);
    stage.text(`${Math.round(d)}°`, x + 30, y - 40, {role: 'display', size: 44, weight: 700, color: T.accent});
    stage.text('90° = 똑바로 위', 180, y + 34, {size: 24, color: T.muted}); stage.text('0° = 옆으로', 345, y + 34, {size: 24, color: T.muted});
  });
}
function budget(stage, t, P) {
  const c = stage.ctx, T = stage.theme, a = fadeIn(t, P.budget, 0.35);
  if (a <= 0) return;
  withAlpha(c, a, () => {
    panel(c, T, 520, 470, 410, 340, 0.86);
    stage.text('로켓이 낸 빠르기', 540, 508, {size: 26, weight: 700, color: T.ink});
    stage.text(`합계 초속 ${f1(MODEL.dvIdeal / 1000)} km`, 540, 548, {size: 24, weight: 500, color: T.muted});
    const x0 = 545, w = 360, y = 590, h = 64, fs = MODEL.sideFrac, u = easeOut(clamp((t - P.sideFill) / 0.8));
    rect(c, x0, y, w, h, 4, rgba(PAL.struct, 0.6));
    rect(c, x0, y, w * fs * u, h, 4, rgba(T.accent, 0.95));
    stage.text(`옆으로 ${Math.round(fs * 100)}%`, x0 + 14, y + h / 2, {size: 28, weight: 700, color: '#1A1208', alpha: smooth((u - 0.4) / 0.3)});
    stage.text(`궤도 속도 초속 ${f1(MODEL.vFinal)} km`, x0, y + h + 34, {size: 24, weight: 700, color: T.accent, alpha: u});
    stage.text(`나머지 ${Math.round((1 - fs) * 100)}%: 중력을 이기는 데 등`, x0, y + h + 70, {size: 24, weight: 500, color: T.muted, alpha: u});
  });
}

// ------------------------------------------------------------------ close: back to the poster
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), fin = fadeIn(t, P.poster, 0.6);
  if (fin < 1) withAlpha(c, (1 - fin) * fadeIn(t, ctx.scene.start, 0.25), () => { landingZone(stage, t); rocket(c, PAD.x, PAD.y - 8, 0, {L: HOOK_L, legs: 1, fins: 1, soot: 0.9}); });
  if (fin > 0) withAlpha(c, fin, () => { hookPicture(stage, t, P, true); posterTitle(stage, t, 0, 1); });
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings: engine burn → low-band noise whose level follows the model thrust (stage 1 / three-engine burns / one engine);
// separation, touchdown, catch → low thuds; orbit closing, tally, labels → low ticks; log/energy bars → stepped tones.
// Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe). Synthetic explanatory sounds, not recordings.
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const envNoise = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.15, o.fo ?? 0.3)), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 30, high: o.high ?? 160, fade: 0.05, points: Q.filter((q, i) => i === 0 || i === Q.length - 1 || Math.abs(q[1] - Q[i - 1][1]) > 1e-4 || Math.abs(q[1] - Q[i + 1][1]) > 1e-4)}, means}); };
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1_, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1_, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58, dur = 0.6) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur, harmonics: [1, 0.35], attack: 0.006, decay: dur * 0.33, release: dur * 0.33, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: dur * 0.5, low: 30, high: 200, release: dur * 0.35, gain_db: -9}}]}, means});
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, 0.08, 0.25)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const steps = (id, t0, n, dt, f0, gain, means) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [...Array(n)].map((_, k) => ({kind: 'tone', offset: r(k * dt, 4), params: {freq: r(f0 * 2 ** (3 * k / 12), 2), dur: 0.15, harmonics: [1, 0.25], attack: 0.004, decay: 0.06, sustain: 0.2, release: 0.07, gain_db: 0}}))}, means});
  const T = MODEL.T, inv2 = (knots) => pw(knots.map(([a, b]) => [b, a]));
  const retScreen = inv2(P.retKnots), landScreen = inv2(P.landKnots);
  // ---- hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 착륙장 위로 불꽃을 뿜으며 내려앉는 1단', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  envNoise('liftoff', P.lift, P.liftOut + 0.4, tt => 0.9, -30, '로켓 전체가 발사대를 떠남: 1단 엔진 9개의 낮은 우르릉 (설명용 합성음)', {low: 28, high: 150, fi: 0.08, fo: 1.0});
  thump('liftoff_thud', P.lift, '발사 순간', -31, 46, 0.9);
  tick('date', P.dateTag, 131, -35, '"2015.12.21 · Falcon 9 1단"', {decay: 0.12});
  whoosh('descent', P.desc0, P.ign2 - P.desc0, 110, 70, '1단이 위에서 꼬리부터 내려옴', -36);
  envNoise('landing_2015', P.ign2, P.touch2, tt => 0.75, -31, '착륙 연소: 엔진 하나 (낮은 잡음)', {low: 30, high: 140, fi: 0.08, fo: 0.08});
  ticks('legs_2015', [P.legs2, P.legs2 + 0.12], [98, 110], -35, '착륙 다리 펴짐', {decay: 0.08});
  thump('touchdown_2015', P.touch2, '접지 · 엔진 끔', -28, 52, 0.7);
  ticks('tally', P.tallyT, P.tallyT.map((_, k) => r(98 * 2 ** (k / 36), 2)), -38, '같은 1단의 비행 횟수 1 → 37 (한 칸마다 작은 틱, 점점 조금씩 높아짐)', {decay: 0.05});
  swell('n37', P.tally1 + 0.05, [110, 165], '"37" (2026년 8월)', {dur: 1.3, gain: -34});
  // ---- leo
  swell('band', P.band, [82, 123], 'LEO 띠(고도 2,000 km 아래)가 나타남', {dur: 1.6, gain: -35});
  tick('iss', P.iss, 147, -35, '"국제우주정거장 · 약 400 km"', {decay: 0.12});
  tick('comm', P.comm, 131, -36, '"통신위성 약 1만 개"', {decay: 0.12});
  whoosh('toss_up', P.toss0, P.tossTop - P.toss0, 90, 160, '높이만 올라감 (400 km)', -36);
  thump('toss_fall', P.tossLand, '다시 떨어짐', -33, 60, 0.4);
  tick('side', P.sideArrow, 165, -34, '"옆으로 빠르게" 화살표', {decay: 0.12});
  whoosh('zoom_out', P.zoom[0], P.zoom[1] - P.zoom[0], 140, 80, '지구 전체로 물러남', -37);
  P.shot.forEach((s, k) => thump(`shot${k}`, s, `400 km에서 옆으로 쏨: 초속 ${CANNON_V[k].toFixed(1)} km`, -33, 70 + 6 * k, 0.35));
  P.hit.forEach((h, k) => thump(`hit${k}`, h, `초속 ${CANNON_V[k].toFixed(1)} km: 땅에 떨어짐 (${Math.round(CANNON[k].angEnd * 180 / Math.PI)}° 앞)`, -34, 55, 0.3));
  tick('orbit_closed', P.orbitDone, 196, -32, '초속 7.8 km: 한 바퀴 돌아 제자리 (땅에 닿지 않음)', {decay: 0.2});
  chirp('seoul_busan', P.sb0 + 0.2, P.sb1, tt => 110 + 40 * clamp((tt - P.sb0 - 0.2) / (P.sb1 - P.sb0 - 0.2)), () => 0.28, -37, '서울 → 부산 325 km를 초속 7.8 km로: 42초 (낮은 음이 조금씩 오름)');
  steps('bar_side', P.barSide, 8, 0.11, 98, -35, '"초속 7.8 km로 달리게 하기" 막대 (30 MJ)');
  steps('bar_up', P.barUp, 1, 0.11, 98, -35, '"400 km 높이로 올리기" 막대 (3.7 MJ)');
  ticks('x8', P.x8T, P.x8T.map((_, k) => r(110 * 2 ** (2 * k / 12), 2)), -35, '짧은 막대 여덟 개가 긴 막대를 채움 (× 8.2)', {decay: 0.08});
  // ---- rocket dashboard
  tick('y1903', P.tag1903, 123, -35, '"1903 · 치올콥스키"', {decay: 0.12});
  tick('formula', P.formula, 131, -35, '로켓 방정식', {decay: 0.12});
  chirp('dv_point', P.m0, tl.at(A.pct95) + 0.5, tt => 82 + 18 * dvOf(P.f(tt)), () => 0.26, -37, '연료 비율이 오를수록 얻는 빠르기가 커짐: 빠르기 → 음높이 (82 + 18·Δv Hz)');
  tick('need', P.need, 147, -34, '"궤도에 필요 ≈ 9.4 km/s"', {decay: 0.12});
  swell('p95', P.p95, [98, 147], '"95%"', {dur: 1.3, gain: -34});
  thump('drop_stage', P.drop, '다 쓴 1단을 떼어 냄', -31, 55, 0.5);
  envNoise('ascent', tl.at('s10') - 0.2, P.sep, tt => 0.6 + 0.3 * smooth((tt - tl.at('s10')) / 2), -33, '1단 연소 2분 30초 (약 27× 빠르게): 낮은 우르릉', {low: 28, high: 150, fi: 0.3, fo: 0.05});
  thump('separation', P.sep, '단 분리 (약 70 km)', -29, 50, 0.6);
  envNoise('stage2', P.sep + 0.15, P.sep + 2.6, tt => 0.35, -38, '2단 점화 → 궤도로', {low: 40, high: 180, fi: 0.1, fo: 0.8});
  // ---- return (screen times from the same mission-time map)
  whoosh('flip', retScreen(MODEL.T.meco + 1), retScreen(T.bb0) - retScreen(MODEL.T.meco + 1), 100, 70, '① 1단이 몸을 뒤집음', -36);
  envNoise('boostback', retScreen(T.bb0), retScreen(T.bb1), tt => 0.8, -31, `② 역추진 연소: 엔진 3개 ${Math.round(T.bb1 - T.bb0)}초 (발사장 쪽으로)`, {low: 30, high: 160, fi: 0.06, fo: 0.08});
  envNoise('entry', retScreen(T.en0), retScreen(T.en1), tt => 0.8, -31, `③ 재진입 연소: 엔진 3개 ${Math.round(T.en1 - T.en0)}초 (속도를 줄임)`, {low: 30, high: 160, fi: 0.06, fo: 0.08});
  ticks('fins', [0, 1, 2, 3].map(k => P.finS + 0.1 * k), [98, 98, 110, 110], -36, '④ 격자 날개 4장', {decay: 0.07});
  // ---- landing
  envNoise('air', landScreen(T.ign - 6.5) + 0.05, P.ignS, tt => 0.35, -40, '엔진을 끄고 공기 속을 떨어짐 (바람 소리, 아주 작게)', {low: 60, high: 300, fi: 0.3, fo: 0.1});
  envNoise('landing_burn', P.ignS, P.touchS, tt => 0.85, -30, `착륙 연소: 엔진 1개 ${Math.round(T.touch - T.ign)}초 (약 ${f1(P.landX)}× 빠르게)`, {low: 30, high: 140, fi: 0.05, fo: 0.04});
  tick('force_min', P.forceIn, 131, -35, '"엔진 하나를 가장 약하게 ≈ 340 kN"', {decay: 0.12});
  tick('force_w', P.weightIn, 110, -35, '"1단의 무게 ≈ 290 kN"', {decay: 0.12});
  tick('verdict', P.verdict, 147, -34, '"멈춰 떠 있을 수 없다"', {decay: 0.14});
  tick('target', P.target, 165, -35, '목표: 높이 0 · 속도 0', {decay: 0.14});
  ticks('ghosts', [P.ghosts, P.ghosts + 0.3], [82, 73], -37, '비교: 너무 일찍 · 너무 늦게 (설명 모형)', {decay: 0.1});
  ticks('legs', [P.legs, P.legs + 0.15], [98, 110], -34, '착륙 다리 펴짐', {decay: 0.08});
  thump('touchdown', P.touchS, '접지 · 엔진 끔 — 그 뒤 약 2초는 조용히', -27, 52, 0.8);
  // ---- reuse
  ticks('cycle', [P.check, P.fly15], [131, 165], -35, '점검 → 다시 날기', {decay: 0.12});
  tick('fairing_split', P.fairSplit, 110, -35, '위성 덮개가 두 쪽으로 갈라짐', {decay: 0.14});
  whoosh('chutes', P.chute, P.splash - P.chute, 120, 70, '낙하산으로 내려옴', -37);
  envNoise('splash', P.splash, P.splash + 0.8, tt => 0.6, -36, '바다에 닿음 (물소리 대신 낮은 잡음)', {low: 60, high: 300, fi: 0.03, fo: 0.5});
  tick('pickup', P.pick, 123, -35, '배가 건져 올림', {decay: 0.14});
  envNoise('big_burn', P.bigIn, P.catch, tt => 0.7, -32, '큰 1단의 엔진 3개 (내려오며 속도를 줄임)', {low: 25, high: 130, fi: 0.2, fo: 0.08});
  thump('catch', P.catch, '발사탑의 두 팔이 붙잡음 (낮은 쿵)', -27, 46, 0.9);
  whoosh('old_drop', P.old, 1.4, 120, 60, '예전: 1단이 바다로 떨어짐', -37);
  envNoise('new_land', P.newer + 0.45, P.newer + 1.2, tt => 0.5, -38, '지금: 돌아와 내려앉음', {low: 30, high: 140, fi: 0.05, fo: 0.1});
  tick('cost_down', P.costDown, 98, -34, '"발사 비용 크게 내려감"', {decay: 0.14});
  ticks('launches', P.launches, P.launches.map((_, k) => r(110 + 6 * k, 2)), -37, '잦아진 발사가 위성을 낮은 궤도로 (발사마다 틱)', {decay: 0.1});
  // ---- myth
  whoosh('ghost_up', P.ghost0, P.ghostTop - P.ghost0, 90, 150, '오해: 곧장 위로만 올라감', -36);
  thump('ghost_fall', P.ghostFall, '곧장 위로만 가면 다시 떨어짐', -33, 58, 0.45);
  thump('no', P.no, '"아닙니다"', -34, 70, 0.3);
  chirp('pitch', P.realKnots[0][0], P.realKnots[2][0], tt => 80 + 1.2 * clamp(pitchDeg(sampleAt(FULL, P.realM(tt))), 0, 90), () => 0.25, -37, '실제 기울기 90° → 0°: 각도 → 음높이 (80 + 1.2·각도 Hz)');
  steps('budget', P.sideFill, 6, 0.12, 98, -35, `"옆으로 ${Math.round(MODEL.sideFrac * 100)}%" 막대`);
  // ---- close
  swell('poster_back', P.poster, [73, 110, 147], '"궤도에 오른다는 것은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands end ≤ NOISE_TOP; whoosh band tops
 * stay ≤ 520 Hz; swell overtones (2f) stay below HIGH_CUT. Events that would break this throw.
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
  return ev.sort((a, b) => a.at - b.at);
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/reusable-rocket/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(상승·귀환 궤적 적분, 착륙 연소, 뉴턴의 대포 궤도, 로켓 방정식)에서 써 넣습니다. 대응: 엔진 연소 → 낮은 대역 잡음(길이 = 모형의 연소 시간, 화면 시간 배율 적용), 분리·접지·붙잡기 → 낮은 쿵, 궤도가 닫힘·이름표 → 낮은 틱, 막대 → 계단 음, 기울기·빠르기 → 음높이. 모든 음은 700 Hz 아래. 착륙 뒤 약 2초는 조용히. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; boostback ${MODEL.D.toFixed(1)} s, ignition ${(MODEL.H / 1000).toFixed(2)} km, touchdown T+${MODEL.T.touch.toFixed(1)} s; landing ×${P.landX.toFixed(2)}, ascent ×${P.ascX.toFixed(1)}; orbit turn ${ORBIT_T} s → screen ${P.orbitDone.toFixed(2)}`);
}
