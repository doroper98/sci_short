// Episode scenes — "레이더 — 전파의 메아리로 보고, 메아리를 줄여 숨는다" (32)
// Shape: export {theme, scenes, overlays, background, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Visual direction (docs/ANIMATION_QUALITY.md "2026-11-07 후속 결정: 시리즈 화풍은 지킨다"): the series' diagram style —
// a dark noturno field, thin precise lines, small additive glowing dots, wavefronts as thin arcs, graphs/axes/labels,
// one warm colour for the transmitted wave and one accent (radar-scope green) for the returned echo. Aircraft, the dish,
// the 1930s bomber, the van, the car and the speed gun are generic line icons (glyphs.mjs). Dynamics: camera moves,
// an event every 2–4 s (pulse leaves, hits, echo returns), big numbers. Nothing of the notes below is printed on screen.
//
// =====================================================================================================
// MODEL — the one block that the picture, the graphs, the labels and sound.json (--emit-sound) all read.
// =====================================================================================================
//  - Range: R = c·t / 2 with c ≈ 300,000 km/s → 1/1,000 s = 300 km of path = 150 km away. The range scene shows the
//    real 1 ms round trip over SLOW = 4,000× slower (declared once in the kicker).
//  - Elsewhere waves move at declared display speeds (world px per screen second); every hit / echo time below is
//    distance ÷ display speed, and sound.json uses the same times.
//  - Doppler: an echo from a target moving at v is compressed by (c − v)/(c + v) (approaching) or stretched by the
//    inverse (receding). On screen c = 300, v = 60 px/s → ×0.67 / ×1.5 (hugely exaggerated, declared). The sound uses the
//    same ratio for its pitch. Real example (label only): f_d = 2·v·f/c, 24 GHz at 100 km/h → ≈ 4,400 Hz.
//  - Beam vs wavelength: circular-aperture pattern I(φ) = [2·J1(x)/x]², x = π·(D/λ)·sin φ. Same dish, D/λ = 2.2 (long)
//    vs 12 (short). Two targets 6.9° apart: the radar "screen" strip shows Σ I(ψ − θ_k) while the beam is steered.
//  - Rain: beam strength e^(−α·L_rain); α_short ≫ α_long (explanatory values, not real attenuation).
//  - Flat plate: law of reflection; tilt θ → reflected fronts leave at 2θ. Echo "size" bars are relative (log-ish).
//  - Horizon: straight rays from the antenna tangent to an exaggerated Earth; the wedge below the tangent is shadow.
//    Label numbers: D ≈ √(2·H·(4/3)·R_E), H = 25 m → ≈ 21 km.
//  - Myth: P ∝ σ / R⁴ (radar equation) → detection range ∝ σ^(1/4): σ ÷ 10,000 → range ÷ 10. Log–log graph.
//  - Sound: node episodes/radar/scenes.mjs --emit-sound writes sound.json from this model and the plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, line, circle, withAlpha, TAU, rng, loadTimeline} from '../../pipeline/render/index.mjs';
import {PAL, gl, ringFx, lobeArc, glowLine, burst, backing, xf, dish, jet, biplane, mast, van, car, speedGun} from './glyphs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920, D2R = Math.PI / 180;

export const M = {
  cKm: 300000,                 // km/s
  SLOW: 4000,                  // range scene: real 1 ms → 4 s on screen
  dopC: 300, dopV: 60, dopL: 70,   // doppler display: wave speed, target speed, transmitted wavelength (px)
  dl: [2.2, 14],               // dish diameter ÷ wavelength: long, short
  sep: 9 * D2R,              // angular separation of the two small targets
  tilt: 30 * D2R,              // plate tilt
  sigmaK: 1e-4,                // myth: σ ratio
};
M.dopIn = (M.dopC - M.dopV) / (M.dopC + M.dopV);       // echo wavelength ratio, approaching (0.667)
M.dopOut = 1 / M.dopIn;                                 // receding (1.5)
M.fd = 2 * (100 / 3.6) * 24e9 / 2.998e8;                // 24 GHz, 100 km/h → Hz (≈ 4,448)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Bessel J1 (Numerical Recipes rational approximation) */
function J1(x) {
  const ax = Math.abs(x);
  if (ax < 8) { const y = x * x;
    const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * (-30.16036606))))));
    const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y)))); return a / b; }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  const b = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b); return x < 0 ? -ans : ans;
}
/** circular-aperture beam power (0..1) at off-axis angle d for D/λ = q */
export function airy(d, q) { const x = Math.PI * q * Math.sin(d); if (Math.abs(x) < 1e-6) return 1; const v = 2 * J1(x) / x; return v * v; }
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const gauss = (d, w) => Math.exp(-(d / w) * (d / w));

/** a set of wave packets (crests) leaving `src` at times ts (or t0 + k·rep), drawn as arcs weighted by k(φ) */
class Waves {
  constructor(o) { Object.assign(this, {crests: 3, gap: 22, n: 1, rep: 2, col: PAL.tx, w: 2.2, rmax: 1600, a: 1, dir: 0, half: 0.2, pow: 0.7, near: 0}, o); }
  times() { if (this.ts) return this.ts; const T = []; for (let k = 0; k < this.n; k++) T.push(this.t0 + k * this.rep); return T; }
  /** leading-crest arrival times at point p */
  arrivals(p, from = -1e9, to = 1e9) { const d = dist(p, this.src) / this.v; return this.times().map(te => te + d).filter(x => x >= from && x <= to); }
  kf(phi) { return this.k ? this.k(phi) : gauss(wrapA(phi - this.dir), this.half); }
  draw(c, cm, t, o = {}) {
    const a0 = (o.alpha ?? 1) * this.a; if (a0 <= 0.01) return;
    const [sx, sy] = cm.S(...this.src), A0 = this.a0 ?? this.dir - 2.4 * this.half, A1 = this.a1 ?? this.dir + 2.4 * this.half;
    c.save(); if (o.clip) { c.beginPath(); o.clip(c); c.clip(); }
    for (const te of this.times()) {
      const r0 = this.v * (t - te); if (r0 <= 0) continue; if (r0 - (this.crests - 1) * this.gap > this.rmax) continue;
      const ka = o.ka ? o.ka(te) : 1; if (ka <= 0.01) continue;
      for (let j = 0; j < this.crests; j++) {
        const r = r0 - j * this.gap; if (r <= 2 || r > this.rmax) continue;
        const fade = a0 * ka * [1, 0.6, 0.34, 0.2, 0.12][Math.min(4, j)] * Math.pow(1 - r / this.rmax, this.pow) * (this.near ? Math.min(1, Math.sqrt(this.near / r)) : 1);
        lobeArc(c, sx, sy, r * cm.z, this.col, fade, this.w, phi => this.kf(phi), A0, A1, this.step || 0.06);
      }
    }
    c.restore();
  }
}

// =====================================================================================================
// Palette, cameras, text
// =====================================================================================================
export const theme = {base: 'noturno', accent: PAL.echo};
export const captionLayout = {};
export const events = [];
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, fi = 0.35, fo = 0.35) => fadeIn(t, a, fi) * fadeOut(t, b - fo, fo);
const cam = (fx, fy, z, cx = 540, cy = 860) => ({fx, fy, z, cx, cy, S: (x, y) => [cx + (x - fx) * z, cy + (y - fy) * z]});
const ID = cam(540, 860, 1);
/** keyframed camera: keys [[t, fx, fy, z], …] (eased, log-zoom) */
function keyCam(t, keys, cx = 540, cy = 860) {
  if (t <= keys[0][0]) return cam(keys[0][1], keys[0][2], keys[0][3], cx, cy);
  let k = 0; while (k + 1 < keys.length && t > keys[k + 1][0]) k++;
  const a = keys[k], b = keys[Math.min(k + 1, keys.length - 1)], q = b === a ? 0 : easeInOut((t - a[0]) / Math.max(1e-3, b[0] - a[0]));
  return cam(lerp(a[1], b[1], q), lerp(a[2], b[2], q), Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), q)), cx, cy);
}
function big(stage, s, x, y, size, col = '#FFFFFF', a = 1, o = {}) {
  if (a <= 0) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: 'display', weight: 700, size, color: col, align: o.align || 'center', tracking: -0.02 * size, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 20, ...o}));
}
function label(stage, s, x, y, a = 1, o = {}) {
  if (a <= 0) return; const size = Math.max(30, o.size || 32), w = stage.measure(s, {role: 'body', weight: 700, size}), al = o.align || 'center';
  let x0 = al === 'left' ? x : al === 'right' ? x - w : x - w / 2; x0 = clamp(x0, 64, 936 - w);
  withAlpha(stage.ctx, a, () => { if (o.back !== false) backing(stage.ctx, x0, y, w, size, 1); stage.text(s, x0, y, {role: 'body', weight: o.weight ?? 700, size, color: o.color || PAL.ink, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12}); });
}
const DUST = (() => { const R = rng(32), s = []; for (let i = 0; i < 120; i++) s.push([R() * 1200, R() * 2000, 0.5 + 1.2 * R() ** 2.5, 0.05 + 0.2 * R() ** 2, R() * TAU]); return s; })();
/** faint drifting dust with parallax (depth cue) */
function dust(c, cm, t, a = 1) {
  for (const [x0, y0, r, al, ph] of DUST) {
    const x = ((x0 - cm.fx * 0.3 * cm.z + t * 4 * Math.sin(ph)) % 1200 + 1200) % 1200 - 60, y = ((y0 - cm.fy * 0.3 * cm.z - t * 2) % 2000 + 2000) % 2000 - 40;
    circle(c, x, y, r, rgba('#CFE6EA', al * a));
  }
}
/** a ground line (flat or curved) with a faint fill and contour dots below */
function ground(c, cm, yf, a = 1, x0 = -400, x1 = 1500) {
  c.save(); c.beginPath();
  for (let x = x0; x <= x1; x += 20) { const p = cm.S(x, yf(x)); x === x0 ? c.moveTo(...p) : c.lineTo(...p); }
  const e = cm.S(x1, 3000), b = cm.S(x0, 3000); c.lineTo(e[0], e[1]); c.lineTo(b[0], b[1]); c.closePath();
  const g = c.createLinearGradient(0, cm.S(0, yf(540))[1], 0, cm.S(0, yf(540) + 500)[1]); g.addColorStop(0, `rgba(0,8,12,${0.75 * a})`); g.addColorStop(1, `rgba(0,4,8,${0.9 * a})`);
  c.fillStyle = g; c.fill(); c.restore();
  c.save(); c.beginPath(); for (let x = x0; x <= x1; x += 20) { const p = cm.S(x, yf(x)); x === x0 ? c.moveTo(...p) : c.lineTo(...p); }
  c.strokeStyle = rgba(PAL.line, 0.14 * a); c.lineWidth = 7; c.stroke(); c.strokeStyle = rgba(PAL.line, 0.7 * a); c.lineWidth = 1.8; c.stroke(); c.restore();
  const R = rng(9); for (let i = 0; i < 90; i++) { const x = lerp(x0, x1, R()), dy = 10 + R() ** 2 * 160, p = cm.S(x, yf(x) + dy); if (p[1] > H || p[0] < -10 || p[0] > W + 10) continue; circle(c, p[0], p[1], 0.9 + R(), rgba(PAL.line, (0.08 + 0.12 * R()) * a)); }
}

// =====================================================================================================
// Time anchors (words of the tts text) and the plan
// =====================================================================================================
const Wd = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  echo1: Wd('s01', '메아리로'), radar1: Wd('s01', '레이더와'), avoid1: Wd('s01', '피하는'),
  y34: Wd('s02', '천구백'), raf2: Wd('s02', '공군부는'), radio2: Wd('s02', '전파로'), drop2: Wd('s02', '떨어뜨리는'), death2: Wd('s02', '죽음의'), ww2: Wd('s02', '왓슨와트에게'),
  wilk3: Wd('s03', '윌킨스는'), calc3: Wd('s03', '계산'), imp3: Wd('s03', '불가능하지만'), echo3: Wd('s03', '메아리로'), find3: Wd('s03', '찾을'),
  y35: Wd('s04', '천구백'), feb4: Wd('s04', '이월'), bbc4: Wd('s04', '방송국'), rx4: Wd('s04', '수신기를'), bomb4: Wd('s04', '폭격기'),
  back5: Wd('s05', '돌아온'), scr5: Wd('s05', '화면의'), shake5: Wd('s05', '흔들어'), km5: Wd('s05', '십삼킬로미터'), first5: Wd('s05', '처음'),
  name6: Wd('s06', '레이더라는'), y40: Wd('s06', '천구백사십년'), navy6: Wd('s06', '해군이'), abbr6: Wd('s06', '줄임말로'), ra6: Wd('s06', '전파로'), d6: Wd('s06', '찾고'), r6: Wd('s06', '거리를'),
  short7: Wd('s07', '짧게'), shoot7: Wd('s07', '쏘고'), hit7: Wd('s07', '부딪혀'), faint7: Wd('s07', '희미한'), wait7: Wd('s07', '기다립니다'),
  core8: Wd('s08', '핵심은'), echo8: Wd('s08', '메아리에서'), dist8: Wd('s08', '거리와'), speed8: Wd('s08', '속도를'),
  ms9: Wd('s09', '천분의'), km300: Wd('s09', '삼백킬로미터를'), back9: Wd('s09', '돌아왔다면'), half9: Wd('s09', '절반인'), km150: Wd('s09', '백오십킬로미터'),
  turn10: Wd('s10', '돌리며'), dir10: Wd('s10', '방향과'), rng10: Wd('s10', '거리가'), round10: Wd('s10', '둥근'), dot10: Wd('s10', '점으로'),
  near11: Wd('s11', '다가오는'), dense11: Wd('s11', '촘촘해져'), up11: Wd('s11', '높아지고'), away11: Wd('s11', '멀어지면'), down11: Wd('s11', '낮아집니다'),
  dop12: Wd('s12', '도플러'), gun12: Wd('s12', '스피드건과'), wx12: Wd('s12', '기상'), spd12: Wd('s12', '속도를'),
  short13: Wd('s13', '짧을수록'), same13: Wd('s13', '같은'), narrow13: Wd('s13', '좁아져'), small13: Wd('s13', '작은'), clear13: Wd('s13', '또렷하게'),
  shortw14: Wd('s14', '짧은'), rain14: Wd('s14', '비에'), weak14: Wd('s14', '약해져서'), far14: Wd('s14', '멀리'), cm14: Wd('s14', '십센티미터'),
  avoid15: Wd('s15', '피하려면'), seen15: Wd('s15', '비친'), rcs15: Wd('s15', '반사'), echo15: Wd('s15', '메아리를'), less15: Wd('s15', '줄여야'),
  face16: Wd('s16', '정면을'), flat16: Wd('s16', '평평한'), same16: Wd('s16', '그대로'), tilt16: Wd('s16', '기울이면'), other16: Wd('s16', '다른 쪽으로'),
  abs17: Wd('s17', '흡수하는'), coat17: Wd('s17', '바르면'), energy17: Wd('s17', '에너지가'), heat17: Wd('s17', '열로'), less17: Wd('s17', '줄어듭니다'),
  straight18: Wd('s18', '곧게'), round18: Wd('s18', '둥근'), hor18: Wd('s18', '지평선'), low18: Wd('s18', '낮은'), not18: Wd('s18', '닿지'),
  stealth19: Wd('s19', '스텔스'), unseen19: Wd('s19', '보이지'),
  no20: Wd('s20', '아닙니다'), small20: Wd('s20', '작아질'), tenk20: Wd('s20', '만분의'), caught20: Wd('s20', '잡히는'), ten20: Wd('s20', '십분의'),
  core21: Wd('s21', '핵심은'),
};
export const MORPH = [0.9, 1.7];
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {tl};
  for (const [k, r] of Object.entries(A)) P[k] = tl.at(r);
  P.end = tl.duration; const sc = id => tl.scene(id); P.sc = sc;
  // ---------------- poster world (hook, close): dish lower left, jet upper right
  P.gy = x => 1418 + (x - 540) ** 2 / 5200;
  P.dishV = [200, 1252]; P.dishS = 1.7; P.target = [780, 470];
  P.aim = Math.atan2(P.target[1] - P.dishV[1], P.target[0] - P.dishV[0]);
  { const f = 62 * 62 / 88 * P.dishS; P.feed = [P.dishV[0] + f * Math.cos(P.aim), P.dishV[1] + f * Math.sin(P.aim)]; }
  P.vP = 470; P.Rt = dist(P.feed, P.target); P.tt = P.Rt / P.vP;                   // one-way time
  P.tx = new Waves({src: P.feed, v: P.vP, t0: -P.tt - 0.4 - 3 * 1.35, rep: 1.35, n: 130, crests: 4, gap: 26, dir: P.aim, half: 0.22, rmax: 1700, col: PAL.tx, w: 2.8, pow: 0.55});
  P.hits = P.tx.arrivals(P.target);                                                   // pulse reaches the jet
  P.tilt = [P.avoid1 - 0.1, P.avoid1 + 0.9];                                          // the jet tilts (echo swings away)
  P.jetRot = t => (t >= P.sc('close').start ? 1 : smooth((t - P.tilt[0]) / (P.tilt[1] - P.tilt[0]))) * -20 * D2R;
  P.back = wrapA(P.aim + Math.PI);
  P.lobeK = (rot, phi) => 0.12 + 0.88 * gauss(wrapA(phi - (P.back - 2 * rot)), 0.42);
  P.echo = new Waves({src: P.target, v: P.vP, ts: P.hits, crests: 4, gap: 26, rmax: 1300, col: PAL.echo, w: 2.6, a: 1, a0: -Math.PI, a1: Math.PI, step: 0.08, pow: 0.9, near: 260});
  P.echo.k = phi => P.lobeK(0, phi);
  P.echoBack = P.hits.map(h => h + P.Rt / P.vP);                                       // echo reaches the dish
  P.poster = tl.at('s21') + 0.1;
  // ---------------- deathray: mast left, bomber flying right → left
  P.dr = {gy: 1240, mast: [210, 1240, 470], tip: [210, 776], rx: [400, 1240]};
  P.dr.bx = t => 1010 - 26 * (t - sc('deathray').start); P.dr.by = 600;
  P.beam = [P.death2 - 0.2, P.calc3 + 0.2];
  P.spread = new Waves({src: P.dr.tip, v: 300, t0: P.calc3 - 0.1, rep: 1.0, n: 8, crests: 2, gap: 30, a0: -Math.PI, a1: 0, k: () => 1, rmax: 1500, col: PAL.tx, w: 2, pow: 0.4, near: 120, step: 0.1});
  P.drPulse = new Waves({src: P.dr.tip, v: 420, ts: [P.echo3 - 1.5], crests: 3, gap: 22, dir: Math.atan2(P.dr.by - P.dr.tip[1], P.dr.bx(P.echo3 - 0.3) - P.dr.tip[0]), half: 0.22, rmax: 1400, col: PAL.tx, w: 2.4});
  { const tb = P.drPulse.ts[0], p = [P.dr.bx(P.echo3 - 0.3), P.dr.by]; P.drHit = tb + dist(p, P.dr.tip) / 420; P.drHitP = p;
    P.drEcho = new Waves({src: p, v: 420, ts: [P.drHit], crests: 3, gap: 22, a0: -Math.PI, a1: Math.PI, k: phi => 0.25 + 0.75 * gauss(wrapA(phi - Math.atan2(P.dr.rx[1] - p[1], P.dr.rx[0] - p[0])), 0.5), rmax: 1200, col: PAL.echo, w: 2, a: 0.8, step: 0.08});
    P.drRx = P.drHit + dist(p, P.dr.rx) / 420; }
  // ---------------- daventry: BBC masts left, van in the field, biplane from the right
  P.dv = {gy: 1230, src: [205, 862], van: [705, 1230], poles: [598, 822], wireY: 1086};
  P.dv.bx = t => 1180 - 18 * (t - sc('daventry').start); P.dv.by = 640;
  P.bcast = new Waves({src: P.dv.src, v: 110, t0: sc('daventry').start - 14, rep: 120 / 110, n: 60, crests: 1, gap: 0, a0: -Math.PI, a1: 0.02, k: () => 1, rmax: 1250, col: PAL.tx, w: 1.8, a: 0.42, pow: 0.5, step: 0.1});
  P.dvEchoOn = P.back5 - 0.4;
  P.rxSeen = P.dvEchoOn + 1.6;                                         // first echo crest reaches the wire (approx.)
  P.radar6 = tl.at('s06') - 0.5;                                       // RADAR letters take over
  // ---------------- essence: dish left, jet upper right, A-scope below
  P.es = {V: [170, 800], s: 1.5, T0: [820, 540], v: 360};
  P.es.aim = Math.atan2(P.es.T0[1] - P.es.V[1], P.es.T0[0] - P.es.V[0]);
  { const f = 62 * 62 / 88 * P.es.s; P.es.F = [P.es.V[0] + f * Math.cos(P.es.aim), P.es.V[1] + f * Math.sin(P.es.aim)]; }
  P.es.jx = t => P.es.T0[0] - 8 * (t - sc('essence').start);
  P.es.ts = [P.shoot7 - 0.15, P.shoot7 + 4.3, P.shoot7 + 8.6];
  P.es.R = dist(P.es.F, P.es.T0); P.es.trip = 2 * P.es.R / P.es.v; P.es.scope = P.es.trip * 1.18;
  P.es.tx = new Waves({src: P.es.F, v: P.es.v, ts: P.es.ts, crests: 4, gap: 18, dir: P.es.aim, half: 0.2, rmax: 1300, col: PAL.tx, w: 2.8});
  P.es.hits = P.es.ts.map(te => te + P.es.R / P.es.v);
  P.es.echo = new Waves({src: P.es.T0, v: P.es.v, ts: P.es.hits, crests: 4, gap: 18, a0: -Math.PI, a1: Math.PI, k: phi => 0.15 + 0.85 * gauss(wrapA(phi - (P.es.aim + Math.PI)), 0.45), rmax: 1100, col: PAL.echo, w: 2, a: 0.6, step: 0.08, near: 220});
  P.es.back = P.es.hits.map(h => h + P.es.R / P.es.v);
  // ---------------- range: axis 0..150 km, then the PPI
  P.rg = {y: 800, x0: 150, x1: 900, te: P.ms9 - 0.05, T: 1e-3 * M.SLOW};             // real 1 ms → 4 s
  P.rg.hit = P.rg.te + P.rg.T / 2; P.rg.ret = P.rg.te + P.rg.T;
  P.fold = [P.turn10 - 0.9, P.turn10 + 0.6];
  P.ppi = {c: [540, 830], R: 400, w: TAU / 2.6, a0: 0};
  P.sweep = t => P.ppi.a0 + P.ppi.w * Math.max(0, t - P.fold[1]);
  P.blips = [[150, 0], [96, 128 * D2R], [62, 222 * D2R], [124, 296 * D2R], [108, 62 * D2R]].map(([km, b], i) => ({km, b, i}));
  P.blipTimes = b => { const T = [], d0 = ((b.b - P.ppi.a0) % TAU + TAU) % TAU; for (let k = 0; k < 12; k++) { const tt = P.fold[1] + (d0 + k * TAU) / P.ppi.w; if (tt < sc('range').end) T.push(tt); } return T; };
  // ---------------- doppler
  P.dp = {xf: 150, laneA: 560, laneB: 1000, onA: sc('doppler').start - 0.2, onB: sc('doppler').start + 1.0, off: tl.at('s12') - 0.45};
  P.dp.XA = t => 880 - M.dopV * (t - P.dp.onA);            // approaching jet
  P.dp.XB = t => 330 + M.dopV * (t - P.dp.onB);            // receding jet
  P.dp.hitA = solveHit(t => P.dp.XA(t), P.dp.xf, P.dp.onA);
  P.dp.hitB = solveHit(t => P.dp.XB(t), P.dp.xf, P.dp.onB);
  P.dp.backA = P.dp.hitA + (P.dp.XA(P.dp.hitA) - P.dp.xf) / M.dopC; P.dp.backB = P.dp.hitB + (P.dp.XB(P.dp.hitB) - P.dp.xf) / M.dopC;
  P.gun = {on: P.gun12 - 0.35, wx: P.wx12 - 0.3};
  // ---------------- wavelength
  P.wl = {yA: 560, yB: 1010, V: 130, s: 0.95, tx: 700, sweepT: 3.4, on: sc('wavelength').start, rain: P.shortw14 - 0.6};
  P.wl.psi = t => 14 * D2R * Math.sin(TAU * (t - P.wl.on) / P.wl.sweepT);
  // ---------------- shape
  P.sh = {V: [140, 760], P: [720, 760], L: 300, band: [640, 880], c: 260, rep: 0.2, swap: [P.face16 - 0.75, P.face16 + 0.05]};
  P.sh.rot = t => (t < P.tilt16 ? 0 : t < P.coat17 - 1.6 ? M.tilt * smooth((t - P.tilt16) / 1.0) : M.tilt * (1 - smooth((t - (P.coat17 - 1.6)) / 0.9)));
  P.sh.coat = t => smooth((t - P.coat17 + 0.3) / 0.7);
  P.sh.t0 = P.sh.swap[0];
  P.sh.bars = [P.same16 + 0.2, P.other16 + 0.3, P.less17 - 0.4];
  // ---------------- horizon
  P.hz = horizonGeom();
  P.hz.tx = new Waves({src: P.hz.A, v: 330, t0: sc('horizon').start + 0.2, rep: 1.6, n: 6, crests: 4, gap: 20, a0: -42 * D2R, a1: P.hz.tanA, k: () => 1, rmax: 1100, col: PAL.tx, w: 2.6, step: 0.05});
  P.hz.hits = P.hz.tx.arrivals(P.hz.Hi);
  P.hz.echo = new Waves({src: P.hz.Hi, v: 330, ts: P.hz.hits, crests: 3, gap: 20, a0: -Math.PI, a1: Math.PI, k: phi => 0.15 + 0.85 * gauss(wrapA(phi - Math.atan2(P.hz.A[1] - P.hz.Hi[1], P.hz.A[0] - P.hz.Hi[0])), 0.45), rmax: 900, col: PAL.echo, w: 2, a: 0.8, step: 0.08, near: 160});
  P.hz.back = P.hz.hits.map(h => h + dist(P.hz.Hi, P.hz.A) / 330);
  // ---------------- myth: log–log graph; both targets approach together
  P.my = {g: [150, 870, 900, 1270], lx: [-1.3, 0.6], ly: [-7, 5.5], run: [P.no20 + 0.1, P.ten20 + 1.5]};
  P.my.ld = t => lerp(P.my.lx[1], P.my.lx[0] + 0.02, clamp((t - P.my.run[0]) / (P.my.run[1] - P.my.run[0])));
  P.my.cross = [P.my.run[0] + (P.my.lx[1] - 0) / (P.my.lx[1] - P.my.lx[0] - 0.02) * (P.my.run[1] - P.my.run[0]), P.my.run[0] + (P.my.lx[1] + 1) / (P.my.lx[1] - P.my.lx[0] - 0.02) * (P.my.run[1] - P.my.run[0])];
  PLANS.set(tl, P); return P;
}
/** first time the outgoing front from xf (leaving at t0, speed c) meets the target X(t) */
function solveHit(X, xf, t0) { let a = t0, b = t0 + 20; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (xf + M.dopC * (m - t0) >= X(m)) b = m; else a = m; } return b; }
function horizonGeom() {
  const C = [330, 1900], R = 900, Ab = [200, 1900 - Math.sqrt(R * R - 130 * 130)], A = [200, 930];
  const ac = [C[0] - A[0], C[1] - A[1]], L = Math.hypot(...ac), tl = Math.sqrt(L * L - R * R), base = Math.atan2(ac[1], ac[0]), off = Math.asin(R / L);
  const tanA = base - off, Tp = [A[0] + tl * Math.cos(tanA), A[1] + tl * Math.sin(tanA)];
  const surf = x => C[1] - Math.sqrt(Math.max(0, R * R - (x - C[0]) ** 2));
  const lineY = x => A[1] + (x - A[0]) * Math.tan(tanA);
  const Lo = [900, (lineY(900) + surf(900)) / 2 + 6], Hi = [846, 700];
  return {C, R, A, Ab, tanA, Tp, surf, lineY, Lo, Hi};
}

// =====================================================================================================
// Titles, poster, overlays, background
// =====================================================================================================
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, '오늘의 주제', '레이더를 피하려면?']];
  if (id === 'deathray') return [[-Infinity, '1934 · 영국', '죽음의 광선?'], [at('s03'), '윌킨스의 계산', '떨어뜨리진 못해도, 찾을 수는']];
  if (id === 'daventry') return [[-Infinity, '1935년 2월 · 데번트리 실험', '방송 전파 속의 폭격기'], [at('s05'), '데번트리 실험', '되돌아온 전파가 화면을 흔들다'], [P.radar6, '줄임말', 'RADAR라는 이름']];
  if (id === 'essence') return [[-Infinity, '본질', '짧게 쏘고, 메아리를 기다린다'], [at('s08'), '본질', '메아리 → 거리와 속도']];
  if (id === 'range') return [[-Infinity, '메커니즘 ① 거리 · 실제 0.001초를 4,000배 느리게', '왕복 시간의 절반'], [P.fold[0], '메커니즘 ① 방향', '돌리며 쏘면 지도가 된다']];
  if (id === 'doppler') return [[-Infinity, '메커니즘 ② 속도 · 차이를 크게 과장', '도플러 효과'], [P.dp.off, '도플러 효과', '스피드건 · 기상 레이더']];
  if (id === 'wavelength') return [[-Infinity, '메커니즘 ③ 파장', '같은 안테나, 다른 빔'], [P.wl.rain - 0.1, '파장과 비', '멀리 보려면 긴 파장']];
  if (id === 'shape') return [[-Infinity, '레이더를 피하려면', '반사 단면적 σ를 줄인다'], [P.sh.swap[0], '피하는 법 ① 모양', '면을 기울여 메아리를 딴 데로'], [at('s17'), '피하는 법 ② 재료', '전파를 열로 바꾼다']];
  if (id === 'horizon') return [[-Infinity, '피하는 법 ③ 지평선 · 지구 곡률 과장', '곧게 가는 전파의 그늘']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '스텔스는 안 보일까?'], [P.no20 - 0.2, '오해 바로잡기', '작아질 뿐, 가까이 오면 잡힌다']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.echo, align: 'center', tracking: 1.5, maxWidth: 860, ...so}); line(c, [[505, 174], [575, 174]], PAL.echo, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 860, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 292, {role: 'display', weight: 700, size: 34, color: PAL.echo, align: 'center', ...so}));
}
const POSTER = {q: '레이더를 피하려면?', a: '메아리를 줄인다', y: 880, y2: 1012};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 840, 104); AS ||= fit(POSTER.a, 880, 150);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 56, q), y2 = lerp(POSTER.y2, 292, q), s2 = lerp(AS, 34, q), tr = lerp(-0.03, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, 760, 0, 1130); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.3, 'rgba(0,10,16,0.6)'); g.addColorStop(0.75, 'rgba(0,10,16,0.6)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, 760, W, 370); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    stage.text(POSTER.a, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.echo, align: 'center', tracking: tr * s2, shadow: sh, shadowBlur: 28});
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1300, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,8,12,0.35)'); g.addColorStop(1, 'rgba(0,8,12,0.55)'); c.fillStyle = g; c.fillRect(0, 1300, W, 620); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0]))); return; }
  if (!(id === 'close' && t >= P.poster)) captionBand(stage.ctx);
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, P), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook') head(stage, cur[1], cur[2], fadeIn(t, MORPH[1] - 0.05, 0.4) * a, a, POSTER.a, a);
  else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage, t) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 380, H); g.addColorStop(0, '#022331'); g.addColorStop(1, '#000D14');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(540, 860, 520, 540, 860, 1500); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.32)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/radar/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.Rt.toFixed(2)}/${P.rg.te.toFixed(3)}/${P.dp.hitA.toFixed(3)}/${P.my.cross[1].toFixed(3)}/${M.dopIn.toFixed(4)}`; }
const shake = (c, t, t0, amp = 6) => { const k = t > t0 ? Math.exp(-(t - t0) / 0.18) : 0; if (k > 0.01) c.translate(amp * k * Math.sin(t * 91), amp * k * Math.cos(t * 77)); };
const lastAge = (ts, t) => { let a = 9; for (const x of ts) if (x <= t) a = t - x; return a; };
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  deathray(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); deathrayScene(stage, t, ctx); },
  daventry(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); daventryScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); essenceScene(stage, t, ctx); },
  range(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); rangeScene(stage, t, ctx); },
  doppler(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); dopplerScene(stage, t, ctx); },
  wavelength(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); wavelengthScene(stage, t, ctx); },
  shape(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); shapeScene(stage, t, ctx); },
  horizon(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); horizonScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { enter(stage.ctx, t, ctx.scene.start); closeScene(stage, t, ctx); },
};
const fadeFromBlack = (c, t, s0, d = 0.4) => { const fi = smooth((t - s0) / d); if (fi < 1) { c.fillStyle = `rgba(0,10,16,${1 - fi})`; c.fillRect(0, 0, W, H); } };
/** scene entrance: a short push-in (1.07 → 1) around the stage centre, so cuts read as a move rather than a cross-fade */
const enter = (c, t, s0, d = 0.8) => { const k = 1 + 0.07 * (1 - easeOut((t - s0) / d)); if (k > 1.0005) { c.translate(540, 860); c.scale(k, k); c.translate(-540, -860); } };

// ------------------------------------------------------------------ the poster world (hook start, close)
function posterWorld(stage, t, P, cm, o = {}) {
  const c = stage.ctx, rot = P.jetRot(t);
  dust(c, cm, t, 0.8);
  // faint range rings around the dish
  const F = cm.S(...P.feed);
  withAlpha(c, 0.9, () => { c.save(); c.setLineDash([3, 9]); for (const r of [330, 660, 990, 1320]) { c.beginPath(); c.arc(F[0], F[1], r * cm.z, -100 * D2R, -8 * D2R); c.strokeStyle = 'rgba(140,190,200,0.16)'; c.lineWidth = 1.3; c.stroke(); } c.restore(); });
  // the beam: a faint wedge along the aim
  { const g = c.createRadialGradient(F[0], F[1], 20, F[0], F[1], 1500 * cm.z); g.addColorStop(0, rgba(PAL.tx, 0.16)); g.addColorStop(1, rgba(PAL.tx, 0));
    c.save(); c.beginPath(); c.moveTo(...F); c.arc(F[0], F[1], 1500 * cm.z, P.aim - 0.2, P.aim + 0.2); c.closePath(); c.fillStyle = g; c.fill(); c.restore(); }
  ground(c, cm, P.gy, 1);
  P.tx.draw(c, cm, t);
  P.echo.k = phi => P.lobeK(rot, phi);                 // echo lobe follows the jet's tilt (specular: 2 × tilt)
  P.echo.draw(c, cm, t, {});
  const Tg = cm.S(...P.target), bob = 3 * Math.sin(t * 1.3);
  jet(c, xf(cm.S, P.target[0], P.target[1] + bob, 1.5 * cm.z, -1, rot));
  for (const h of P.hits) burst(c, Tg[0], Tg[1], t - h, 90, PAL.txHot, 0.9);
  dish(c, ...cm.S(...P.dishV), P.dishS * cm.z, P.aim, {ground: cm.S(0, P.gy(P.dishV[0]))[1]});
  const ea = lastAge(P.echoBack, t), kBack = P.lobeK(rot, P.back);
  if (ea < 1.6) { gl(c, F[0], F[1], 60 * (0.6 + ea), PAL.echo, 0.75 * kBack * Math.exp(-ea / 0.35)); ringFx(c, F[0], F[1], (20 + 90 * easeOut(ea / 0.9)) * cm.z, PAL.echo, 0.8 * kBack * Math.exp(-ea / 0.4), 1.8); }
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s1 = ctx.scene.end;
  const cm = keyCam(t, [[0, 540, 860, 1], [MORPH[1], 540, 860, 1], [P.avoid1, 560, 920, 1.0], [s1, 580, 930, 1.04]]);
  posterWorld(stage, t, P, cm);
  const la = win(t, P.radar1 - 0.1, P.avoid1 + 0.2);
  if (la > 0) { const F = cm.S(...P.dishV); label(stage, '레이더', F[0] + 40, F[1] - 120, la, {size: 38, align: 'left'}); }
  const ra = fadeIn(t, P.echo1 - 0.1, 0.3) * fadeOut(t, s1 - 0.6);
  if (ra > 0) { const T = cm.S(...P.target); label(stage, '메아리', T[0] - 210, T[1] + 150, ra, {size: 38, color: PAL.echo}); }
  const va = fadeIn(t, P.tilt[1] - 0.2, 0.3) * fadeOut(t, s1 - 0.4);
  if (va > 0) { const T = cm.S(...P.target), d = P.back - 2 * P.jetRot(t), q = [T[0] + 260 * Math.cos(d), T[1] + 260 * Math.sin(d)]; label(stage, '딴 데로', q[0], q[1] - 30, va, {size: 36, color: PAL.echo}); }
}

// ------------------------------------------------------------------ deathray (1934): the question and Wilkins's answer
function deathrayScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, D = P.dr;
  const bx = D.bx(t);
  const cm = keyCam(t, [[s0, 600, 860, 0.98], [P.death2, 560, 830, 1.04], [P.calc3, 520, 860, 0.96], [P.echo3, 500, 870, 1.0], [ctx.scene.end, 480, 860, 1.02]]);
  dust(c, cm, t);
  big(stage, '1934', 540, 470, 170, rgba(PAL.ink, 0.9), win(t, s0 + 0.1, P.drop2, 0.4, 0.6));
  ground(c, cm, () => D.gy, 1);
  // the "death ray": a bright cone from the mast to the bomber, flickering
  const ba = win(t, P.beam[0], P.beam[1], 0.4, 0.6), tip = cm.S(...D.tip), Bp = cm.S(bx, D.by);
  if (ba > 0) {
    const ang = Math.atan2(Bp[1] - tip[1], Bp[0] - tip[0]), L = Math.hypot(Bp[0] - tip[0], Bp[1] - tip[1]) + 60, fl = 0.8 + 0.2 * Math.sin(t * 37) * Math.sin(t * 13);
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createLinearGradient(...tip, tip[0] + L * Math.cos(ang), tip[1] + L * Math.sin(ang)); g.addColorStop(0, rgba(PAL.tx, 0.55 * ba * fl)); g.addColorStop(1, rgba(PAL.tx, 0.08 * ba));
    c.beginPath(); c.moveTo(...tip); c.lineTo(tip[0] + L * Math.cos(ang - 0.08), tip[1] + L * Math.sin(ang - 0.08)); c.lineTo(tip[0] + L * Math.cos(ang + 0.08), tip[1] + L * Math.sin(ang + 0.08)); c.closePath(); c.fillStyle = g; c.fill();
    c.restore();
    glowLine(c, [tip, [tip[0] + L * Math.cos(ang), tip[1] + L * Math.sin(ang)]], PAL.txHot, 0.7 * ba * fl, 2.2);
    gl(c, Bp[0], Bp[1], 90, PAL.tx, 0.25 * ba * fl);
    const m = [(tip[0] + Bp[0]) / 2, (tip[1] + Bp[1]) / 2];
    label(stage, '죽음의 광선?', m[0] + 30, m[1] + 70, fadeIn(t, P.death2, 0.3) * ba, {size: 42, color: PAL.txHot, align: 'left'});
  }
  // Wilkins: the wave spreads, its strength falls as 1 / distance²
  P.spread.draw(c, cm, t, {alpha: fadeIn(t, P.calc3 - 0.2, 0.4) * fadeOut(t, ctx.scene.end - 0.6)});
  big(stage, '세기 ∝ 1 ÷ 거리²', 540, 430, 58, '#FFFFFF', win(t, P.calc3 + 0.3, P.echo3 - 0.3, 0.4, 0.4));
  const ia = fadeIn(t, P.imp3 - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.4);
  if (ia > 0) {
    label(stage, '떨어뜨리기: 불가능', 540, 910, ia, {size: 42, color: PAL.muted});
    withAlpha(c, ia * fadeIn(t, P.imp3 + 0.3, 0.3), () => { const w = stage.measure('떨어뜨리기: 불가능', {role: 'body', weight: 700, size: 42}); line(c, [[540 - w / 2 - 6, 912], [540 + w / 2 + 6, 912]], rgba(PAL.muted, 0.9), 3); });
  }
  // the pulse that finds the bomber, and its faint echo to a receiver
  P.drPulse.draw(c, cm, t, {alpha: fadeIn(t, P.drPulse.ts[0] - 0.1, 0.2)});
  P.drEcho.draw(c, cm, t);
  const fa = fadeIn(t, P.find3 - 0.2, 0.3) * fadeOut(t, ctx.scene.end - 0.4);
  label(stage, '찾기: 가능', 540, 990, fa, {size: 48, color: PAL.echo});
  mast(c, tip[0], cm.S(0, D.gy)[1], (D.gy - D.tip[1]) * cm.z, {w0: 30 * cm.z, w1: 5 * cm.z});
  gl(c, tip[0], tip[1], 26, PAL.tx, 0.5 + 0.4 * ba);
  // receiver: a small dipole on a pole
  const rx = cm.S(...D.rx), ry = rx[1] - 92 * cm.z;
  line(c, [[rx[0], rx[1]], [rx[0], ry]], rgba(PAL.line, 0.85), 1.8); line(c, [[rx[0] - 30 * cm.z, ry], [rx[0] + 30 * cm.z, ry]], rgba(PAL.line, 0.95), 2.4);
  const ra = t - P.drRx; if (ra > 0 && ra < 2) { gl(c, rx[0], ry, 70 * (0.6 + ra), PAL.echo, 0.8 * Math.exp(-ra / 0.4)); ringFx(c, rx[0], ry, 20 + 100 * easeOut(ra / 1), PAL.echo, 0.8 * Math.exp(-ra / 0.5), 1.8); }
  label(stage, '수신 안테나', rx[0] + 50, ry + 6, win(t, P.drRx - 0.2, ctx.scene.end, 0.3, 0.4), {size: 32, align: 'left', color: PAL.echo});
  biplane(c, xf(cm.S, bx, D.by + 4 * Math.sin(t * 1.1), 1.65 * cm.z, -1));
  { const hp = cm.S(...P.drHitP); burst(c, hp[0], hp[1], t - P.drHit, 70, PAL.txHot, 0.9); }
  label(stage, '폭격기', Bp[0], Bp[1] - 130, win(t, P.radio2, P.death2 + 0.3), {size: 34});
  fadeFromBlack(c, t, s0);
}

// ------------------------------------------------------------------ daventry (1935): broadcast field, van, CRT; RADAR letters
function crt(stage, x, y, R, t, amp, a = 1) {
  const c = stage.ctx; if (a <= 0) return;
  withAlpha(c, a, () => {
    circle(c, x, y, R + 10, 'rgba(0,10,14,0.92)');
    c.beginPath(); c.arc(x, y, R + 10, 0, TAU); c.strokeStyle = rgba(PAL.line, 0.8); c.lineWidth = 2.4; c.stroke();
    c.save(); c.beginPath(); c.arc(x, y, R, 0, TAU); c.clip();
    const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(30,80,60,0.35)'); g.addColorStop(1, 'rgba(0,20,14,0.2)'); c.fillStyle = g; c.fillRect(x - R, y - R, 2 * R, 2 * R);
    c.strokeStyle = 'rgba(108,242,180,0.12)'; c.lineWidth = 1; for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(x + k * R / 3.5, y - R); c.lineTo(x + k * R / 3.5, y + R); c.moveTo(x - R, y + k * R / 3.5); c.lineTo(x + R, y + k * R / 3.5); c.stroke(); }
    // the trace: a horizontal line; the received echo makes it swing up and down (afterglow copies)
    for (let j = 4; j >= 0; j--) {
      const tt = t - j * 0.05, A = amp(tt), off = A * R * 0.55 * Math.sin(TAU * 1.3 * tt), pts = [];
      for (let u = -1; u <= 1.001; u += 0.04) pts.push([x + u * R * 0.92, y + off * (1 - 0.15 * u * u) + 1.5 * Math.sin(u * 47 + tt * 31)]);
      glowLine(c, pts, PAL.echo, (j ? 0.18 / j : 0.95), j ? 1.4 : 2.2);
    }
    c.restore();
    gl(c, x, y, R * 1.3, PAL.echo, 0.06 + 0.25 * amp(t));
  });
}
function daventryScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, D = P.dv, bx = D.bx(t), by = D.by + 4 * Math.sin(t * 1.2);
  const ra = smooth((t - P.radar6) / 0.8);                      // RADAR letters take over
  const cm = keyCam(t, [[s0, 560, 900, 0.86], [P.rx4, 600, 900, 0.92], [P.back5, 700, 860, 0.98], [P.km5, 680, 880, 0.94], [P.radar6, 640, 900, 0.9], [ctx.scene.end, 600, 900, 0.82]]);
  const wa = 1 - 0.78 * ra;
  big(stage, '1935. 2. 26', 540, 470, 120, rgba(PAL.ink, 0.92), win(t, s0 + 0.1, P.bomb4 - 0.2, 0.4, 0.5));
  withAlpha(c, wa, () => {
    dust(c, cm, t);
    P.bcast.draw(c, cm, t, {clip: cc => { const gy = cm.S(0, D.gy)[1]; cc.rect(0, 0, W, gy); }});
    ground(c, cm, () => D.gy, 1);
    // BBC short-wave station: two masts and a curtain antenna between them
    const g0 = cm.S(0, D.gy)[1];
    for (const mx of [110, 300]) { const m = cm.S(mx, D.gy); mast(c, m[0], g0, 440 * cm.z, {w0: 22 * cm.z, w1: 4 * cm.z}); }
    { const a0 = cm.S(110, 800), a1 = cm.S(300, 800), b0 = cm.S(110, 930), b1 = cm.S(300, 930); c.save(); c.strokeStyle = rgba(PAL.line, 0.55); c.lineWidth = 1.2;
      for (let k = 0; k <= 4; k++) { const u = k / 4; c.beginPath(); c.moveTo(lerp(a0[0], a1[0], u), a0[1]); c.lineTo(lerp(b0[0], b1[0], u), b0[1]); c.stroke(); }
      c.beginPath(); c.moveTo(...a0); c.lineTo(...a1); c.moveTo(...b0); c.lineTo(...b1); c.stroke(); c.restore(); gl(c, ...cm.S(...D.src), 40, PAL.tx, 0.35); }
    label(stage, '방송국 전파', cm.S(205, 0)[0] + 10, cm.S(0, 740)[1], win(t, P.bbc4 - 0.1, P.back5), {size: 36, color: PAL.txHot});
    label(stage, '파장 약 50 m', cm.S(205, 0)[0] + 10, cm.S(0, 740)[1] + 48, win(t, P.bbc4 + 0.4, P.back5), {size: 30, color: PAL.muted});
    // the field receiver: van + two poles + a wire
    const v = cm.S(...D.van); van(c, v[0], v[1], 1.1 * cm.z, {});
    const p0 = cm.S(D.poles[0], D.gy), p1 = cm.S(D.poles[1], D.gy), top = cm.S(0, D.wireY)[1];
    line(c, [[p0[0], p0[1]], [p0[0], top]], rgba(PAL.line, 0.85), 2); line(c, [[p1[0], p1[1]], [p1[0], top]], rgba(PAL.line, 0.85), 2);
    c.beginPath(); c.moveTo(p0[0], top); c.quadraticCurveTo((p0[0] + p1[0]) / 2, top + 22 * cm.z, p1[0], top); c.strokeStyle = rgba(PAL.line, 0.9); c.lineWidth = 1.6; c.stroke();
    const wireMid = [(p0[0] + p1[0]) / 2, top + 11 * cm.z];
    label(stage, '수신기', v[0], v[1] + 50, win(t, P.rx4 - 0.1, P.km5), {size: 34});
    // echo from the bomber (continuous wave → a steady train of thin rings), and the wire lighting up
    const ea = fadeIn(t, P.dvEchoOn, 0.6) * (1 - ra);
    if (ea > 0) {
      const Bp = cm.S(bx, by), lam = 120, r0 = ((t - P.dvEchoOn) * 110) % lam;
      for (let j = 0; j < 9; j++) { const r = r0 + j * lam, rr = r * cm.z; const age = t - P.dvEchoOn - r / 110; if (age < 0) continue;
        lobeArc(c, Bp[0], Bp[1], rr, PAL.echo, 0.55 * ea * Math.pow(1 - r / 1150, 1.2) * Math.min(1, 150 / (r + 40)), 1.8, phi => 0.25 + 0.75 * gauss(wrapA(phi - Math.atan2(wireMid[1] - Bp[1], wireMid[0] - Bp[0])), 0.6), -Math.PI, Math.PI, 0.09); }
      const wa2 = fadeIn(t, P.rxSeen, 0.5) * ea; gl(c, wireMid[0], wireMid[1], 120, PAL.echo, 0.25 * wa2 * (0.7 + 0.3 * Math.sin(TAU * 1.3 * t)));
      line(c, [[p0[0], top], [wireMid[0], wireMid[1]], [p1[0], top]], rgba(PAL.echo, 0.6 * wa2), 1.6);
    }
    biplane(c, xf(cm.S, bx, by, 1.4 * cm.z, -1));
    label(stage, '폭격기', cm.S(bx, 0)[0], cm.S(0, by)[1] - 110, win(t, P.bomb4 - 0.1, P.back5 + 0.4), {size: 34});
    // "about 13 km" between the receiver and the bomber when it is first seen
    const ka = win(t, P.km5 - 0.1, P.radar6 + 0.2, 0.3, 0.4);
    if (ka > 0) { const Bp = cm.S(bx, by + 40); withAlpha(c, ka, () => { c.save(); c.setLineDash([8, 8]); line(c, [wireMid, Bp], rgba(PAL.echo, 0.9), 2); c.restore(); });
      big(stage, '약 13 km', clamp((wireMid[0] + Bp[0]) / 2 - 170, 200, 760), (wireMid[1] + Bp[1]) / 2, 70, PAL.echo, ka); }
    // the CRT screen inset (top left) and a leader to the van
    const ia = fadeIn(t, P.back5 - 0.6, 0.5) * (1 - ra), cx = 300, cy = 520, Rr = 132 * (1 + 0.12 * win(t, P.scr5 - 0.2, P.km5, 0.4, 0.5));
    if (ia > 0) {
      withAlpha(c, ia * 0.6, () => { c.save(); c.setLineDash([4, 8]); line(c, [[cx + Rr * 0.7, cy + Rr * 0.7], [v[0] - 20, v[1] - 80 * cm.z]], rgba(PAL.line, 0.6), 1.4); c.restore(); });
      const amp = tt => fadeIn(tt, P.rxSeen, 0.8) * (0.25 + 0.75 * smooth((tt - P.scr5) / 0.6)) * (0.75 + 0.25 * Math.sin(tt * 2.1));
      crt(stage, cx, cy, Rr, t, amp, ia);
      label(stage, '수신기 화면', cx, cy + Rr + 42, ia, {size: 32});
      label(stage, '빛점이 흔들림', cx, cy - Rr - 34, fadeIn(t, P.shake5 - 0.1, 0.3) * ia, {size: 34, color: PAL.echo});
      if (t > P.first5 && t < P.first5 + 2) burst(c, cx, cy, t - P.first5, 110, PAL.echoHot, 0.7 * ia);
    }
  });
  // RADAR = RAdio Detection And Ranging (1940, US Navy)
  if (ra > 0) {
    const k = smooth((t - P.radar6) / 0.6), cxs = [216, 378, 540, 702, 864], y = 640, glow = [P.ra6, P.ra6, P.d6, P.d6 + 0.35, P.r6];
    // a slow sweep behind the letters
    const sw = (t - P.radar6) * TAU / 3.2, O = [540, 900];
    withAlpha(c, 0.5 * ra, () => { for (let j = 0; j < 28; j++) { const a0 = sw - j * 0.035; c.beginPath(); c.moveTo(...O); c.arc(O[0], O[1], 620, a0 - 0.035, a0); c.closePath(); c.fillStyle = rgba(PAL.echo, 0.1 * (1 - j / 28)); c.fill(); }
      c.save(); c.setLineDash([3, 9]); for (const r of [200, 400, 600]) { c.beginPath(); c.arc(O[0], O[1], r, 0, TAU); c.strokeStyle = 'rgba(108,242,180,0.12)'; c.lineWidth = 1.2; c.stroke(); } c.restore(); });
    'RADAR'.split('').forEach((ch, i) => {
      const on = fadeIn(t, glow[i] - 0.05, 0.25), x = cxs[i];
      gl(c, x, y, 110, PAL.echo, 0.45 * on * k);
      big(stage, ch, x, y + (1 - k) * 40, 180, on > 0.5 ? PAL.echo : PAL.ink, k);
    });
    const rows = [['RA', 'dio', '전파로', P.ra6], ['D', 'etection', '찾고', P.d6], ['A', 'nd', '', P.d6 + 0.35], ['R', 'anging', '거리를 잰다', P.r6]];
    rows.forEach(([h, rest, ko, at], i) => {
      const a = fadeIn(t, at - 0.1, 0.3) * k, yy = 840 + i * 92, x0 = 230;
      if (a <= 0) return;
      withAlpha(c, a, () => {
        const wh = stage.measure(h, {role: 'display', weight: 700, size: 60});
        stage.text(h, x0, yy, {role: 'display', weight: 700, size: 60, color: PAL.echo, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 14});
        stage.text(rest, x0 + wh + 2, yy, {role: 'display', weight: 500, size: 60, color: PAL.ink, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 14});
        if (ko) stage.text(ko, 900, yy, {role: 'body', weight: 700, size: 40, color: PAL.ink, align: 'right', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
      });
    });
    big(stage, '1940 · 미국 해군', 540, 1240, 52, PAL.ink, fadeIn(t, P.y40 - 0.1, 0.4) * k);
  }
}

// ------------------------------------------------------------------ essence: a short pulse out, a faint echo back, the A-scope
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, E = P.es;
  const cm = keyCam(t, [[s0, 540, 860, 1], [P.core8, 560, 860, 1.04], [ctx.scene.end, 570, 860, 1.07]]);
  dust(c, cm, t);
  const V = cm.S(...E.V), F = cm.S(...E.F);
  { const g0 = cm.S(-40, 925), g1 = cm.S(420, 925); glowLine(c, [g0, g1], PAL.line, 0.5, 1.6); const R = rng(5); for (let i = 0; i < 40; i++) { const p = cm.S(lerp(-40, 420, R()), 932 + 50 * R() ** 2); circle(c, p[0], p[1], 1, rgba(PAL.line, 0.15 * (1 - (p[0] - g0[0]) / (g1[0] - g0[0])))); } }
  E.tx.draw(c, cm, t);
  E.echo.draw(c, cm, t);
  const jx = E.jx(t), J = cm.S(jx, E.T0[1]);
  jet(c, xf(cm.S, jx, E.T0[1] + 3 * Math.sin(t * 1.2), 1.35 * cm.z, -1));
  for (const h of E.hits) burst(c, J[0], J[1], t - h, 80, PAL.txHot, 0.9);
  dish(c, V[0], V[1], E.s * cm.z, E.aim, {ground: cm.S(0, 925)[1]});
  for (const b of E.back) { const a = t - b; if (a > 0 && a < 1.5) { gl(c, F[0], F[1], 60 * (0.6 + a), PAL.echo, 0.75 * Math.exp(-a / 0.35)); ringFx(c, F[0], F[1], 20 + 80 * easeOut(a / 0.9), PAL.echo, 0.7 * Math.exp(-a / 0.4), 1.6); } }
  for (const te of E.ts) { const a = t - te; if (a > 0 && a < 1) gl(c, F[0], F[1], 50, PAL.txHot, 0.8 * Math.exp(-a / 0.2)); }
  label(stage, '짧은 펄스', F[0] + 130, F[1] - 110, win(t, P.short7 - 0.1, P.hit7 + 1.0), {size: 34, color: PAL.txHot, align: 'left'});
  label(stage, '희미한 메아리', J[0] - 60, J[1] + 130, win(t, P.faint7 - 0.1, ctx.scene.end), {size: 34, color: PAL.echo});
  // A-scope: received signal vs time since each pulse
  const x0 = 110, x1 = 930, y0 = 1010, y1 = 1250, base = 1210, X = dt => lerp(x0 + 20, x1 - 10, dt / E.scope);
  const ga = fadeIn(t, P.shoot7 - 0.6, 0.5);
  if (ga > 0) withAlpha(c, ga, () => {
    c.fillStyle = 'rgba(0,14,20,0.55)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.strokeStyle = rgba(PAL.line, 0.35); c.lineWidth = 1.2; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    for (let k = 1; k < 8; k++) line(c, [[lerp(x0, x1, k / 8), y0 + 6], [lerp(x0, x1, k / 8), y1 - 6]], 'rgba(140,190,200,0.08)', 1);
    let cur = null; for (const te of E.ts) if (t >= te) cur = te;
    const sweeps = cur == null ? [] : E.ts.filter(te => te <= t).slice(-2);
    sweeps.forEach((te, si) => {
      const live = te === cur, el = Math.min(t - te, E.scope), aa = live ? 1 : 0.25 * Math.max(0, 1 - (t - cur) / 1.2), xe = X(E.trip);
      if (aa <= 0.01) return;
      const pts = []; for (let dt = 0; dt <= el; dt += E.scope / 320) { let yv = 1.2 * Math.sin(dt * 91 + te * 7) + 1.2 * Math.sin(dt * 53);
        yv -= 150 * Math.exp(-(((dt - 0.02) / 0.05) ** 2)); yv -= 46 * Math.exp(-(((dt - E.trip) / 0.06) ** 2)); pts.push([X(dt), base + yv]); }
      glowLine(c, pts, PAL.echo, 0.85 * aa, 2);
      if (live) { const xc = X(el); gl(c, xc, base, 26, PAL.echoHot, 0.9); }
      if (live && t - te > 0) gl(c, X(0.02), base - 150, 40, PAL.tx, 0.4 * Math.exp(-(t - te) / 0.8));
      if (live && el >= E.trip) gl(c, xe, base - 46, 34, PAL.echo, 0.6 * Math.exp(-(t - te - E.trip) / 0.9) + 0.15);
    });
    stage.text('받은 신호', x1 - 14, y0 + 28, {role: 'body', weight: 500, size: 30, color: PAL.muted, align: 'right'});
    stage.text('시간 →', x1 - 14, y1 + 30, {role: 'body', weight: 500, size: 30, color: PAL.muted, align: 'right'});
  });
  const xe = X(E.trip);
  label(stage, '보낸 펄스', X(0) + 18, base - 176, win(t, P.shoot7 + 0.1, ctx.scene.end) * ga, {size: 30, color: PAL.txHot, align: 'left'});
  label(stage, '메아리', xe, base - 86, win(t, E.back[0] - 0.1, ctx.scene.end) * ga, {size: 30, color: PAL.echo});
  // s08: the two readings
  const da = fadeIn(t, P.dist8 - 0.1, 0.3);
  if (da > 0) { withAlpha(c, da, () => { const yb = 1010 - 26; line(c, [[X(0.02), yb], [xe, yb]], rgba(PAL.echo, 0.9), 2.4); line(c, [[X(0.02), yb - 12], [X(0.02), yb + 12]], PAL.echo, 2.4); line(c, [[xe, yb - 12], [xe, yb + 12]], PAL.echo, 2.4); });
    label(stage, '왕복 시간 → 거리', (X(0.02) + xe) / 2, 1010 - 68, da, {size: 40, color: PAL.echo}); }
  label(stage, '진동수 변화 → 속도', 540, 420, fadeIn(t, P.speed8 - 0.1, 0.3), {size: 42, color: PAL.echo});
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ range: 1/1,000 s → 300 km → 150 km; then the PPI
function rangeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, G = P.rg;
  dust(c, ID, t);
  const q = easeInOut((t - P.fold[0]) / (P.fold[1] - P.fold[0]));            // 0: axis view, 1: PPI
  const O = [lerp(G.x0, P.ppi.c[0], q), lerp(G.y, P.ppi.c[1], q)], Lpx = lerp(G.x1 - G.x0, P.ppi.R, q), kpx = Lpx / 150;
  const ang = q < 1 ? lerp(0, 0, q) : P.sweep(t);
  const dirv = [Math.cos(ang), Math.sin(ang)];
  // PPI furniture
  if (q > 0) withAlpha(c, q, () => {
    const [cx, cy] = O, R = P.ppi.R;
    circle(c, cx, cy, R + 14, 'rgba(0,16,14,0.55)');
    c.beginPath(); c.arc(cx, cy, R + 14, 0, TAU); c.strokeStyle = rgba(PAL.line, 0.6); c.lineWidth = 2; c.stroke();
    for (const km of [50, 100, 150]) { c.beginPath(); c.arc(cx, cy, km * kpx, 0, TAU); c.strokeStyle = 'rgba(108,242,180,0.22)'; c.lineWidth = 1.2; c.stroke(); }
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; line(c, [[cx + 20 * Math.cos(a), cy + 20 * Math.sin(a)], [cx + R * Math.cos(a), cy + R * Math.sin(a)]], 'rgba(108,242,180,0.07)', 1); }
    if (t > P.fold[1]) for (let j = 0; j < 40; j++) { const a0 = ang - j * 0.03; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0 - 0.031, a0); c.closePath(); c.fillStyle = rgba(PAL.echo, 0.16 * (1 - j / 40) ** 1.5); c.fill(); }
    for (const [km, s] of [[50, '50'], [100, '100'], [150, '150 km']]) stage.text(s, cx + 8, cy - km * kpx - 14, {role: 'body', weight: 500, size: 30, color: 'rgba(108,242,180,0.75)'});
    // blips: the sweep paints them; they fade until the next pass
    const R2 = rng(4);
    for (const b of P.blips) {
      const drift = b.i ? 0.7 * (t - P.fold[1]) : 0, bb = b.b + (b.i % 2 ? 0.004 : -0.003) * (t - P.fold[1]), km = b.km - drift * 0.4;
      const p = [cx + km * kpx * Math.cos(bb), cy + km * kpx * Math.sin(bb)], age = lastAge(P.blipTimes(b), t), on = t > P.fold[1] ? Math.exp(-age / 1.1) : 0;
      gl(c, p[0], p[1], 34, PAL.echo, 0.15 + 0.75 * on); circle(c, p[0], p[1], 4.5, rgba(PAL.echoHot, 0.35 + 0.65 * on));
    }
    for (let i = 0; i < 70; i++) { const km = 70 + 30 * R2(), b = (40 + 34 * R2()) * D2R, p = [cx + km * kpx * Math.cos(b), cy + km * kpx * Math.sin(b)], age = t > P.fold[1] ? lastAge([...Array(8)].map((_, k) => P.fold[1] + (b + k * TAU) / P.ppi.w), t) : 9;
      circle(c, p[0], p[1], 1.6 + R2() * 1.8, rgba(PAL.echo, 0.06 + 0.45 * Math.exp(-age / 1.2))); }
  });
  // axis (becomes the sweep line)
  const tip = [O[0] + Lpx * dirv[0], O[1] + Lpx * dirv[1]];
  glowLine(c, [O, tip], q < 1 ? PAL.line : PAL.echo, q < 1 ? 0.55 : 0.9, q < 1 ? 1.8 : 2.4);
  if (q < 1) withAlpha(c, 1 - q, () => {
    for (const km of [0, 50, 100, 150]) { const x = G.x0 + km * kpx; line(c, [[x, G.y - 10], [x, G.y + 10]], rgba(PAL.line, 0.8), 2); stage.text(km ? `${km} km` : '0', x, G.y + 72, {role: 'body', weight: 500, size: 30, color: PAL.muted, align: 'center'}); }
    dish(c, G.x0 - 40, G.y, 0.85, 0, {});
    jet(c, xf(ID.S, G.x1 + 10, G.y - 70, 0.7, -1));
    // pulse out (warm, above the axis) and the echo back (green, below)
    const el = t - G.te, X = km => G.x0 + km * kpx;
    if (el > 0) {
      const out = Math.min(150, 150 * el / (G.T / 2)), back = el > G.T / 2 ? Math.min(150, 150 * (el - G.T / 2) / (G.T / 2)) : 0;
      glowLine(c, [[X(0), G.y - 30], [X(out), G.y - 30]], PAL.tx, 0.8, 3); if (out < 150) { gl(c, X(out), G.y - 30, 40, PAL.txHot, 0.9); circle(c, X(out), G.y - 30, 5, '#FFFFFF'); }
      if (back > 0) { glowLine(c, [[X(150), G.y + 30], [X(150 - back), G.y + 30]], PAL.echo, 0.85, 3); if (back < 150) { gl(c, X(150 - back), G.y + 30, 40, PAL.echoHot, 0.9); circle(c, X(150 - back), G.y + 30, 5, '#FFFFFF'); }
        line(c, [[X(150), G.y - 30], [X(150), G.y + 30]], rgba(PAL.echo, 0.7), 2); }
      burst(c, X(150), G.y, t - G.hit, 70, PAL.txHot, 0.9);
      burst(c, X(0), G.y, t - G.ret, 70, PAL.echoHot, 0.9);
      // the clock and the path length
      const real = Math.min(el, G.T) / M.SLOW, path = real * M.cKm;
      big(stage, `${real.toFixed(4)}초`, 540, 470, 110, '#FFFFFF', fadeIn(t, G.te - 0.3, 0.3));
      big(stage, `전파가 간 길 ${Math.round(path)} km`, 540, 580, 46, PAL.txHot, fadeIn(t, G.te, 0.3) * fadeOut(t, P.half9 - 0.2, 0.4));
    }
    label(stage, '보냄', X(30), G.y - 74, win(t, G.te, G.hit + 0.6), {size: 32, color: PAL.txHot});
    label(stage, '메아리', X(110), G.y + 124, win(t, G.hit + 0.2, P.fold[0]), {size: 32, color: PAL.echo});
    const ha = fadeIn(t, P.half9 - 0.15, 0.3);
    big(stage, '300 km ÷ 2 = 150 km', 540, 1080, 66, PAL.echo, ha);
    label(stage, '150 km 밖', X(150) - 40, G.y - 150, fadeIn(t, P.km150 - 0.1, 0.3), {size: 40, color: PAL.echo});
  });
  if (q >= 1) {
    const T1 = [O[0] + 150 * kpx, O[1]];
    label(stage, '방향', O[0] + 190, O[1] - 150, win(t, P.dir10 - 0.1, ctx.scene.end), {size: 38, color: PAL.ink});
    const da = win(t, P.dir10 - 0.1, ctx.scene.end); if (da > 0) withAlpha(c, da, () => { c.beginPath(); c.arc(O[0], O[1], 150, -0.9, -0.05); c.strokeStyle = rgba(PAL.ink, 0.8); c.lineWidth = 2; c.stroke(); });
    const ra = win(t, P.rng10 - 0.1, ctx.scene.end); if (ra > 0) withAlpha(c, ra, () => { const yb = O[1] + 46; line(c, [[O[0], yb], [T1[0], yb]], rgba(PAL.echo, 0.9), 2.4); line(c, [[O[0], yb - 10], [O[0], yb + 10]], PAL.echo, 2.4); line(c, [[T1[0], yb - 10], [T1[0], yb + 10]], PAL.echo, 2.4); });
    label(stage, '거리', (O[0] + T1[0]) / 2, O[1] + 88, ra, {size: 38, color: PAL.echo});
    label(stage, '레이더 화면', 540, 1290, fadeIn(t, P.round10 - 0.1, 0.4), {size: 34, color: PAL.muted});
  }
  gl(c, O[0], O[1], 24, PAL.echo, 0.5 * q);
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ doppler: compressed / stretched echoes; speed gun; weather radar
function waveLane(c, t, y, X, on, hit, sgn, aL, kicker) {
  // outgoing: y_out = sin(2π (x − c t)/λ); echo phase from the reflection time t_r (moving target X(τ) = X(t_on) − sgn·v·(τ − t_on))
  const xf = 150, C = M.dopC, lam = M.dopL, xT = X(t), outPts = [], echoPts = [];
  const front = xf + C * (t - on);
  for (let x = xf; x <= Math.min(xT, front); x += 3) outPts.push([x, y - 28 + 20 * Math.sin(TAU * (x - C * t) / lam)]);
  if (t > hit) {
    const efront = X(hit) - C * (t - hit);
    for (let x = Math.max(xf, efront); x <= xT; x += 2) {
      // solve x = X(t_r) − C (t − t_r) for t_r (X linear)
      const v = (X(t + 1) - X(t)), a = X(t) - v * t, tr = (x - a + C * t) / (C + v);
      const ph = TAU * (X(tr) - C * tr) / lam; echoPts.push([x, y + 30 + 18 * Math.sin(ph)]);
    }
  }
  glowLine(c, outPts, PAL.tx, 0.9 * aL, 2.6);
  glowLine(c, echoPts, PAL.echo, 0.95 * aL, 2.6);
  return {xT, echoPts};
}
function dopplerScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, D = P.dp;
  dust(c, ID, t);
  const la = fadeOut(t, D.off, 0.45);
  if (la > 0) withAlpha(c, la, () => {
    // lane A: approaching
    const aA = 1;
    dish(c, 110, D.laneA, 0.75, 0, {});
    const A = waveLane(c, t, D.laneA, D.XA, D.onA, D.hitA, 1, aA);
    jet(c, xf(ID.S, A.xT + 128, D.laneA - 4, 1.1, -1));
    burst(c, A.xT, D.laneA, t - D.hitA, 50, PAL.txHot, 0.8);
    label(stage, '다가옴', 820, D.laneA - 110, fadeIn(t, P.near11 - 0.1, 0.3), {size: 38});
    // wavelength brackets
    const brk = (x, y, w, col, s) => { line(c, [[x, y], [x + w, y]], rgba(col, 0.9), 2); line(c, [[x, y - 8], [x, y + 8]], col, 2); line(c, [[x + w, y - 8], [x + w, y + 8]], col, 2); };
    const ba = fadeIn(t, P.dense11 - 0.1, 0.3);
    if (ba > 0) withAlpha(c, ba, () => { brk(240, D.laneA - 72, M.dopL, PAL.tx); brk(240, D.laneA + 74, M.dopL * M.dopIn, PAL.echo); });
    label(stage, '촘촘 → 진동수 높아짐', 540, D.laneA + 140, fadeIn(t, P.up11 - 0.3, 0.3), {size: 38, color: PAL.echo});
    // lane B: receding
    const bA = fadeIn(t, D.onB, 0.4);
    if (bA > 0) withAlpha(c, bA, () => {
      dish(c, 110, D.laneB, 0.75, 0, {});
      const B = waveLane(c, t, D.laneB, D.XB, D.onB, D.hitB, -1, 1);
      jet(c, xf(ID.S, B.xT + 136, D.laneB - 4, 1.1, 1));
      burst(c, B.xT, D.laneB, t - D.hitB, 50, PAL.txHot, 0.8);
      label(stage, '멀어짐', 820, D.laneB - 110, fadeIn(t, P.away11 - 0.1, 0.3), {size: 38});
      const bb = fadeIn(t, P.away11 + 0.4, 0.3); if (bb > 0) withAlpha(c, bb, () => { brk(240, D.laneB - 72, M.dopL, PAL.tx); brk(240, D.laneB + 74, M.dopL * M.dopOut, PAL.echo); });
      label(stage, '성김 → 진동수 낮아짐', 540, D.laneB + 140, fadeIn(t, P.down11 - 0.3, 0.3), {size: 38, color: PAL.echo});
    });
    label(stage, '보낸 전파', 250, D.laneA - 150, win(t, D.onA + 0.6, P.dense11 + 0.4), {size: 32, color: PAL.txHot, align: 'left'});
    label(stage, '메아리', 250, D.laneA + 100, win(t, D.backA - 0.3, P.up11), {size: 32, color: PAL.echo, align: 'left'});
  });
  // s12: speed gun and car (top), weather radar velocity disc (bottom)
  const ga = fadeIn(t, D.off + 0.15, 0.4);
  if (ga > 0) withAlpha(c, ga, () => {
    const gy = 690, cx = 780 - 26 * (t - D.off), gunP = [200, 600];
    line(c, [[60, gy], [1020, gy]], rgba(PAL.line, 0.5), 1.6);
    speedGun(c, xf(ID.S, gunP[0], gunP[1], 1.0, 1));
    car(c, xf(ID.S, cx, gy, 0.95, -1));
    // short waves between them (outgoing warm, echo compressed green)
    const xs = gunP[0] + 12, xe = cx - 98, out = [], ech = [];
    for (let x = xs; x <= xe; x += 2) { out.push([x, gunP[1] - 8 + 7 * Math.sin(TAU * (x - 320 * t) / 26)]); ech.push([x, gunP[1] + 14 + 6 * Math.sin(TAU * (x + 320 * t) / (26 * 0.67))]); }
    glowLine(c, out, PAL.tx, 0.7, 1.8); glowLine(c, ech, PAL.echo, 0.7, 1.8);
    big(stage, '시속 100 km', cx + 20, gy - 170, 52, '#FFFFFF', fadeIn(t, P.gun12, 0.3));
    label(stage, '24 GHz 전파 → 약 4,400 Hz 높아짐', 540, gy + 50, fadeIn(t, P.gun12 + 0.6, 0.4), {size: 32, color: PAL.echo});
    // weather radar: uniform wind → one side approaching, the other receding
    const wa = fadeIn(t, P.wx12 - 0.1, 0.4), O = [540, 1060], R = 210;
    if (wa > 0) withAlpha(c, wa, () => {
      circle(c, O[0], O[1], R + 10, 'rgba(0,14,20,0.6)'); c.beginPath(); c.arc(O[0], O[1], R + 10, 0, TAU); c.strokeStyle = rgba(PAL.line, 0.55); c.lineWidth = 1.8; c.stroke();
      const RR = rng(12);
      for (let i = 0; i < 260; i++) { let x = RR() * 2 - 1, y = RR() * 2 - 1; const sp = 0.06 + 0.04 * RR(); x = ((x + 1 + sp * (t - D.off)) % 2) - 1; if (x * x + y * y > 1) continue;
        const r = Math.hypot(x, y) + 1e-6, vr = x / r;            // wind +x: radial velocity = cos φ
        const col = vr < 0 ? PAL.echo : PAL.tx; circle(c, O[0] + x * R, O[1] + y * R, 1.6 + 1.6 * RR(), rgba(col, 0.15 + 0.7 * Math.abs(vr))); }
      circle(c, O[0], O[1], 5, PAL.ink);
      label(stage, '다가옴', O[0] - R - 20, O[1] - R + 10, 1, {size: 32, color: PAL.echo, align: 'right'});
      label(stage, '멀어짐', O[0] + R + 20, O[1] - R + 10, 1, {size: 32, color: PAL.txHot, align: 'left'});
      label(stage, '바람 →', O[0], O[1] + R + 40, 1, {size: 30, color: PAL.muted});
      label(stage, '기상 레이더', O[0], O[1] - R - 40, 1, {size: 34});
    });
  });
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ wavelength: same dish, wide vs narrow beam; rain
function beamPanel(stage, t, P, yc, q, lamPx, a, labelTxt, sub) {
  const c = stage.ctx, V = [P.wl.V, yc], D = P.wl.s * 124, psi = P.wl.psi(t), F = [V[0] + 43 * P.wl.s, yc];
  const tgs = [-M.sep / 2, M.sep / 2].map(th => ({th, p: [F[0] + 560 * Math.cos(th), yc + 560 * Math.tan(th)]}));
  withAlpha(c, a, () => {
    // beam lobe (polar), filled with a soft glow, and moving wavefronts inside it
    const pts = []; for (let d = -60; d <= 60; d += 1) { const phi = psi + d * D2R, I = airy(d * D2R, q); pts.push([F[0] + 640 * Math.sqrt(I) * Math.cos(phi), F[1] + 640 * Math.sqrt(I) * Math.sin(phi)]); }
    c.save(); c.beginPath(); c.moveTo(...F); pts.forEach(p => c.lineTo(...p)); c.closePath();
    const g = c.createRadialGradient(F[0], F[1], 10, F[0], F[1], 660); g.addColorStop(0, rgba(PAL.tx, 0.32)); g.addColorStop(1, rgba(PAL.tx, 0.02)); c.fillStyle = g; c.fill();
    c.clip();
    const stepL = lamPx < 20 ? lamPx * 2 : lamPx, r0 = ((t * 240) % stepL);
    for (let r = r0; r < 660; r += stepL) ringFx(c, F[0], F[1], r, PAL.tx, 0.32 * (1 - r / 700), 1.4, psi - 1.1, psi + 1.1);
    c.restore();
    c.beginPath(); c.moveTo(...F); pts.forEach(p => c.lineTo(...p)); c.closePath(); c.strokeStyle = rgba(PAL.txHot, 0.5); c.lineWidth = 1.4; c.stroke();
    dish(c, V[0], V[1], P.wl.s, psi, {});
    for (const g2 of tgs) { const I = airy(psi - g2.th, q); gl(c, g2.p[0], g2.p[1], 26, PAL.echo, 0.25 + 0.7 * I); circle(c, g2.p[0], g2.p[1], 5, rgba(PAL.echoHot, 0.9)); }
    // the "screen" strip: echo strength vs steering angle (revealed as the beam sweeps)
    const sx = 870, half = 150;
    c.fillStyle = 'rgba(0,14,20,0.7)'; c.fillRect(sx - 22, yc - half, 44, 2 * half); c.strokeStyle = rgba(PAL.line, 0.45); c.lineWidth = 1.2; c.strokeRect(sx - 22, yc - half, 44, 2 * half);
    const seen = Math.min(1, (t - P.wl.on) / (P.wl.sweepT * 0.75));
    for (let yy = -half + 3; yy <= half - 3; yy += 3) {
      const ang = Math.atan(yy / 560); if (Math.abs(ang) > 14 * D2R * seen + 0.001) continue;
      const resp = tgs.reduce((s, g2) => s + airy(ang - g2.th, q), 0) / 1.0;
      if (resp < 0.08) continue; gl(c, sx, yc + yy, 7, PAL.echo, Math.min(1, 0.6 * resp));
    }
    const yPsi = yc + 560 * Math.tan(psi); line(c, [[sx - 30, yPsi], [sx - 22, yPsi]], rgba(PAL.txHot, 0.9), 2);
  });
  label(stage, labelTxt, 240, yc - 150, a, {size: 38, align: 'left'});
  label(stage, sub, 240, yc + 160, a, {size: 34, align: 'left', color: PAL.echo});
}
function wavelengthScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, L = P.wl;
  dust(c, ID, t);
  const pa = fadeOut(t, L.rain, 0.5);
  if (pa > 0) {
    beamPanel(stage, t, P, L.yA, M.dl[0], 51, pa * fadeIn(t, s0, 0.4), '긴 파장', '넓은 빔 → 하나로 보임');
    beamPanel(stage, t, P, L.yB, M.dl[1], 8.4, pa * fadeIn(t, P.short13 - 0.2, 0.4), '짧은 파장', '좁은 빔 → 둘로 보임');
    label(stage, '레이더 화면', 870, 340, pa * fadeIn(t, P.small13 - 0.3, 0.4), {size: 30, color: PAL.muted});
    big(stage, '빔 폭 ≈ 파장 ÷ 안테나 지름', 540, 1270, 44, '#FFFFFF', pa * fadeIn(t, P.narrow13 - 0.1, 0.4));
  }
  // rain: short waves fade inside the rain band, long waves pass to the far storm
  const ra = fadeIn(t, L.rain + 0.2, 0.5);
  if (ra > 0) withAlpha(c, ra, () => {
    const lanes = [[640, 40, 1 / 1600, '10 cm', PAL.echo], [960, 12, 1 / 95, '3 cm', PAL.txHot]], x0r = 400, x1r = 650, xs = 860;
    // rain band: a dotted cloud and falling streaks
    c.save(); c.globalCompositeOperation = 'lighter';
    const R = rng(21); for (let i = 0; i < 220; i++) { const x = x0r + (x1r - x0r) * R(), y = ((480 + 700 * R() + 240 * (t - L.rain)) % 700) + 470; line(c, [[x, y], [x - 3, y + 14]], rgba(PAL.rain, 0.25 + 0.3 * R()), 1.3); }
    c.restore();
    for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, rr = 34 + 10 * Math.sin(i * 2.7); circle(c, (x0r + x1r) / 2 + 130 * Math.cos(a) * 1.05, 450 + 44 * Math.sin(a), 2.2, rgba(PAL.rain, 0.5)); }
    label(stage, '비', (x0r + x1r) / 2, 400, 1, {size: 36, color: PAL.rain});
    for (const [y, lam, alpha, nm, col] of lanes) {
      dish(c, 130, y, 0.85, 0, {});
      const Fx = 170, I = x => Math.exp(-alpha * Math.max(0, Math.min(x, x1r) - x0r));
      for (let x = Fx + ((t * 260) % lam); x < 1000; x += lam) { const k = I(x); if (k < 0.02) continue; ringFx(c, x - 400, y, 400, PAL.tx, 0.55 * k, 1.8, -0.17, 0.17); }
      // strength line along the lane
      const pts = []; for (let x = Fx; x <= 980; x += 6) pts.push([x, y + 120 - 90 * I(x)]);
      glowLine(c, pts, col, 0.8, 2);
      label(stage, nm, 80, y - 100, 1, {size: 40, color: col, align: 'left'});
      // the far storm cell: echo if the wave gets there
      const k = I(xs), ages = [0, 1.2, 2.4].map(o => ((t - L.rain - o) % 3.6 + 3.6) % 3.6);
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; circle(c, xs + 40 * Math.cos(a), y + 30 * Math.sin(a), 2, rgba(PAL.rain, 0.5)); }
      if (k > 0.1) for (const ag of ages) burst(c, xs, y, ag, 60, PAL.echoHot, 0.6 * k);
    }
    label(stage, '세기', 980, 760, 1, {size: 30, color: PAL.muted, align: 'right'});
    label(stage, '비에 약해짐', 540, 1110, fadeIn(t, P.weak14 - 0.2, 0.3), {size: 38, color: PAL.txHot});
    label(stage, '멀리까지', 860, 540, fadeIn(t, P.far14 - 0.1, 0.3), {size: 38, color: PAL.echo});
    big(stage, '10 cm', 540, 1240, 90, PAL.echo, fadeIn(t, P.cm14 - 0.1, 0.3));
  });
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ shape: σ; a flat plate facing vs tilted; absorber
function shapeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, S = P.sh;
  dust(c, ID, t);
  const V = S.V, F = [V[0] + 46, V[1]];
  dish(c, V[0], V[1], 1.0, 0, {});
  // ---- s15: the jet and its "radar size" disc
  const ja = fadeOut(t, S.swap[0], 0.6);
  if (ja > 0) withAlpha(c, ja, () => {
    const J = [720, 720], rho = lerp(130, 34, smooth((t - P.less15) / 0.9));
    const tx = new Waves({src: F, v: 360, t0: s0 + 0.2, rep: 1.6, n: 6, crests: 3, gap: 20, dir: Math.atan2(J[1] - F[1], J[0] - F[0]), half: 0.2, rmax: 1100});
    tx.draw(c, ID, t);
    const hits = tx.arrivals(J), echo = new Waves({src: J, v: 360, ts: hits, crests: 3, gap: 20, a0: -Math.PI, a1: Math.PI, k: phi => gauss(wrapA(phi - Math.PI), 0.6), rmax: 800, col: PAL.echo, w: 2, a: 0.25 + 0.75 * (rho / 130) ** 2, step: 0.08});
    echo.draw(c, ID, t);
    gl(c, J[0], J[1], rho * 1.8, PAL.echo, 0.35 * fadeIn(t, P.seen15 - 0.1, 0.4));
    withAlpha(c, fadeIn(t, P.seen15 - 0.1, 0.4), () => { c.beginPath(); c.arc(J[0], J[1], rho, 0, TAU); c.strokeStyle = rgba(PAL.echo, 0.9); c.lineWidth = 2.4; c.setLineDash([6, 6]); c.stroke(); c.setLineDash([]); });
    jet(c, xf(ID.S, J[0], J[1], 1.1, -1));
    for (const h of hits) burst(c, J[0], J[1], t - h, 50, PAL.txHot, 0.7);
    label(stage, '레이더에 비친 크기', J[0], J[1] - 190, fadeIn(t, P.seen15 - 0.1, 0.3), {size: 38, color: PAL.echo});
    label(stage, '반사 단면적 σ', J[0], J[1] + 190, fadeIn(t, P.rcs15 - 0.1, 0.3), {size: 40});
    label(stage, '줄이기', J[0] - 210, J[1], fadeIn(t, P.less15 - 0.1, 0.3), {size: 38, color: PAL.echo});
  });
  // ---- s16–s17: plane waves on a flat plate
  const pa = fadeIn(t, S.swap[0] + 0.2, 0.6);
  if (pa > 0) withAlpha(c, pa, () => {
    const rot = S.rot(t), u = [-Math.sin(rot), Math.cos(rot)], n = [-Math.cos(rot), -Math.sin(rot)];   // plate direction (down) and normal (towards the radar); tilt sends the echo up-left
    const Pc = S.P, hl = S.L / 2, coat = S.coat(t);
    const dr = [1 - 2 * n[0] * n[0], -2 * n[0] * n[1]];          // reflected direction for incident (1,0)
    const absorbK = 1 - 0.72 * coat;
    // fronts: one every rep seconds from t0
    const first = Math.ceil((t - 6 - S.t0) / S.rep);
    for (let k = Math.max(0, first); ; k++) {
      const te = S.t0 + k * S.rep; if (te > t) break;
      const xF = F[0] + S.c * (t - te);
      // incident front: vertical segment in the beam band, only where it is still in front of the plate
      const seg = []; let cur = [];
      for (let y = S.band[0]; y <= S.band[1]; y += 6) { const xi = Pc[0] - (y - Pc[1]) * n[1] / n[0], onPlate = Math.abs((xi - Pc[0]) * u[0] + (y - Pc[1]) * u[1]) <= hl, front = xF < xi || !onPlate; if (front && xF < 1000) cur.push([xF, y]); else { if (cur.length > 1) seg.push(cur); cur = []; } }
      if (cur.length > 1) seg.push(cur);
      const ea = Math.min(1, 1.2 * (1 - (xF - F[0]) / 1000));
      for (const s of seg) glowLine(c, s, PAL.tx, 0.55 * ea, 2);
      // reflected front: points R(s) = Q(s) + c (t − t_hit(s)) dr for the part of the plate inside the band
      const pts = [];
      for (let sv = -hl; sv <= hl; sv += 10) {
        const Q = [Pc[0] + sv * u[0], Pc[1] + sv * u[1]]; if (Q[1] < S.band[0] || Q[1] > S.band[1]) continue;
        const th = te + (Q[0] - F[0]) / S.c; if (t < th) continue;
        const d = S.c * (t - th); pts.push([Q[0] + d * dr[0], Q[1] + d * dr[1]]);
      }
      if (pts.length > 1) { const d0 = Math.hypot(pts[0][0] - Pc[0], pts[0][1] - Pc[1]); glowLine(c, pts, PAL.echo, 0.7 * absorbK * Math.max(0, 1 - d0 / 900), 2); }
      // edge diffraction (weak): thin rings from the two plate ends once the plate is tilted
      if (rot > 0.05) for (const e of [-1, 1]) { const Q = [Pc[0] + e * hl * u[0], Pc[1] + e * hl * u[1]]; if (Q[1] < S.band[0] - 30 || Q[1] > S.band[1] + 30) continue; const th = te + (Q[0] - F[0]) / S.c; if (t > th) { const r = S.c * (t - th); if (r < 700) ringFx(c, Q[0], Q[1], r, PAL.echo, 0.05 * (rot / M.tilt) * (1 - r / 700), 1.2); } }
    }
    // the absorber layer (s17): a hatched coat on the face; heat dots
    if (coat > 0) withAlpha(c, coat, () => {
      const th = 26, A0 = [Pc[0] - hl * u[0], Pc[1] - hl * u[1]], A1 = [Pc[0] + hl * u[0], Pc[1] + hl * u[1]], o = [n[0] * th, n[1] * th];
      c.beginPath(); c.moveTo(...A0); c.lineTo(...A1); c.lineTo(A1[0] + o[0], A1[1] + o[1]); c.lineTo(A0[0] + o[0], A0[1] + o[1]); c.closePath(); c.fillStyle = 'rgba(40,24,18,0.85)'; c.fill(); c.strokeStyle = rgba(PAL.heat, 0.6); c.lineWidth = 1.4; c.stroke();
      const R = rng(3), hk = 0.35 + 0.65 * smooth((t - P.heat17 + 0.2) / 0.5);
      for (let i = 0; i < 40; i++) { const sv = -hl + 2 * hl * R(), dd = th * R(), x = Pc[0] + sv * u[0] + dd * n[0], y = Pc[1] + sv * u[1] + dd * n[1]; gl(c, x, y, 8 + 6 * R(), PAL.heat, hk * (0.25 + 0.35 * Math.sin(t * (3 + 5 * R()) + i) ** 2)); }
    });
    // the plate
    const E0 = [Pc[0] - hl * u[0], Pc[1] - hl * u[1]], E1 = [Pc[0] + hl * u[0], Pc[1] + hl * u[1]];
    line(c, [E0, E1], rgba(PAL.line, 0.95), 6); line(c, [E0, E1], rgba('#FFFFFF', 0.5), 1.5);
    // angle marks when tilted
    const am = fadeIn(t, P.other16 - 0.2, 0.3) * fadeOut(t, P.coat17 - 1.7, 0.4);
    if (am > 0 && rot > 0.02) withAlpha(c, am, () => {
      c.save(); c.setLineDash([6, 7]); line(c, [Pc, [Pc[0] + 200 * n[0], Pc[1] + 200 * n[1]]], rgba(PAL.ink, 0.6), 1.6); c.restore();
      const aN = Math.atan2(n[1], n[0]), aI = -Math.PI, aR = Math.atan2(dr[1], dr[0]);
      c.beginPath(); c.arc(Pc[0], Pc[1], 90, Math.min(aN, aI), Math.max(aN, aI)); c.strokeStyle = rgba(PAL.txHot, 0.9); c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(Pc[0], Pc[1], 110, Math.min(aN, aR), Math.max(aN, aR)); c.strokeStyle = rgba(PAL.echo, 0.9); c.lineWidth = 2; c.stroke();
      stage.text('θ', Pc[0] + 120 * Math.cos((aN + aI) / 2), Pc[1] + 120 * Math.sin((aN + aI) / 2), {role: 'body', weight: 700, size: 34, color: PAL.txHot, align: 'center'});
      stage.text('θ', Pc[0] + 140 * Math.cos((aN + aR) / 2), Pc[1] + 140 * Math.sin((aN + aR) / 2), {role: 'body', weight: 700, size: 34, color: PAL.echo, align: 'center'});
    });
    label(stage, '평평한 면', Pc[0] + 60, Pc[1] - hl - 40, win(t, P.flat16 - 0.1, P.tilt16 + 0.5), {size: 36});
    label(stage, '그대로 돌아옴', 420, S.band[1] + 60, win(t, P.same16 - 0.1, P.tilt16 + 0.6), {size: 36, color: PAL.echo});
    label(stage, '다른 쪽으로', 470, 400, win(t, P.other16 - 0.1, P.coat17 - 1.6), {size: 38, color: PAL.echo});
    label(stage, '흡수 재료', Pc[0] - 90, Pc[1] - hl - 40, fadeIn(t, P.coat17 - 0.1, 0.3), {size: 36, color: PAL.heat});
    label(stage, '에너지 → 열', Pc[0] - 90, Pc[1] + hl + 44, fadeIn(t, P.heat17 - 0.1, 0.3), {size: 36, color: PAL.heat});
    // the echo reaching the dish (strength follows the case)
    const kBack = rot > 0.1 ? 0.05 : absorbK, age = ((t - S.t0 - 2 * (Pc[0] - F[0]) / S.c) % 1.2 + 1.2) % 1.2;
    if (t > S.t0 + 2 * (Pc[0] - F[0]) / S.c) gl(c, F[0], F[1], 60, PAL.echo, 0.55 * kBack * (0.7 + 0.3 * Math.cos(age * TAU)));
    // bars: echo size for each case (relative)
    const bx = 120, by = 1270, bw = 110, gap = 170, hmax = 210, vals = [[1, '정면'], [0.07, '기울임'], [0.28, '흡수 재료']];
    stage.text('돌아온 메아리', bx, by - hmax - 40, {role: 'body', weight: 500, size: 30, color: PAL.muted});
    line(c, [[bx - 10, by], [bx + 3 * gap - 40, by]], rgba(PAL.line, 0.6), 1.6);
    vals.forEach(([v, nm], i) => { const g = smooth((t - S.bars[i]) / 0.6); if (g <= 0) return; const x = bx + i * gap, h = hmax * v * g;
      c.fillStyle = rgba(PAL.echo, 0.25); c.fillRect(x, by - h, bw, h); c.strokeStyle = rgba(PAL.echo, 0.9); c.lineWidth = 2; c.strokeRect(x, by - h, bw, h); gl(c, x + bw / 2, by - h, 30, PAL.echo, 0.4 * g);
      stage.text(nm, x + bw / 2, by + 32, {role: 'body', weight: 700, size: 30, color: PAL.ink, align: 'center'}); });
  });
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ horizon: straight rays, curved Earth, the shadow
function horizonScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, Z = P.hz;
  const cm = keyCam(t, [[s0, 540, 860, 0.97], [P.round18, 560, 880, 1.0], [ctx.scene.end, 600, 900, 1.05]]);
  dust(c, cm, t);
  const Ap = cm.S(...Z.A);
  // straight rays (faint) and the grazing ray
  withAlpha(c, fadeIn(t, s0, 0.4), () => {
    for (let a = -40; a <= Z.tanA / D2R - 2; a += 6) { const r = a * D2R; line(c, [Ap, [Ap[0] + 1400 * Math.cos(r), Ap[1] + 1400 * Math.sin(r)]], rgba(PAL.tx, 0.1), 1.2); }
  });
  const ga = fadeIn(t, P.straight18 - 0.1, 0.4);
  if (ga > 0) withAlpha(c, ga, () => { c.save(); c.setLineDash([12, 8]); line(c, [Ap, cm.S(Z.A[0] + 1400 * Math.cos(Z.tanA), Z.A[1] + 1400 * Math.sin(Z.tanA))], rgba(PAL.txHot, 0.9), 2.4); c.restore(); });
  // the shadow wedge beyond the tangent point (below the ray, above the Earth)
  const sa = fadeIn(t, P.low18 - 0.4, 0.5);
  if (sa > 0) withAlpha(c, sa, () => {
    c.save(); c.beginPath(); const p0 = cm.S(...Z.Tp); c.moveTo(...p0);
    for (let x = Z.Tp[0]; x <= 1300; x += 10) c.lineTo(...cm.S(x, Z.lineY(x)));
    for (let x = 1300; x >= Z.Tp[0]; x -= 10) c.lineTo(...cm.S(x, Z.surf(x)));
    c.closePath(); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill(); c.clip();
    c.strokeStyle = 'rgba(140,170,180,0.22)'; c.lineWidth = 1.2; for (let k = -40; k < 60; k++) { c.beginPath(); c.moveTo(k * 22, 900); c.lineTo(k * 22 + 300, 1300); c.stroke(); }
    c.restore();
  });
  // the Earth (exaggerated curvature)
  ground(c, cm, x => Z.surf(clamp(x, Z.C[0] - Z.R + 1, Z.C[0] + Z.R - 1)), 1, -300, 1300);
  Z.tx.draw(c, cm, t, {clip: cc => { cc.beginPath(); const p0 = cm.S(...Z.A); cc.moveTo(...p0); for (let a = -42; a <= Z.tanA / D2R; a += 2) cc.lineTo(p0[0] + 2000 * Math.cos(a * D2R), p0[1] + 2000 * Math.sin(a * D2R)); cc.closePath(); }});
  Z.echo.draw(c, cm, t);
  // the two aircraft
  const Hi = cm.S(...Z.Hi), Lo = cm.S(...Z.Lo);
  jet(c, xf(cm.S, Z.Hi[0], Z.Hi[1], 0.95 * cm.z, -1));
  jet(c, xf(cm.S, Z.Lo[0], Z.Lo[1], 0.45 * cm.z, -1));
  for (const h of Z.hits) burst(c, Hi[0], Hi[1], t - h, 70, PAL.txHot, 0.9);
  // the mast and dish
  const Ab = cm.S(...Z.Ab); line(c, [Ab, [Ap[0], Ap[1] + 10]], rgba(PAL.line, 0.9), 2.2);
  dish(c, Ap[0] - 26 * Math.cos(Z.tanA), Ap[1] - 26 * Math.sin(Z.tanA), 0.85, Z.tanA - 0.25, {});
  for (const b of Z.back) { const a = t - b; if (a > 0 && a < 1.4) gl(c, Ap[0], Ap[1], 50 * (0.6 + a), PAL.echo, 0.7 * Math.exp(-a / 0.35)); }
  const T = cm.S(...Z.Tp);
  withAlpha(c, fadeIn(t, P.hor18 - 0.1, 0.3), () => { gl(c, T[0], T[1], 30, PAL.txHot, 0.7); circle(c, T[0], T[1], 5, '#FFFFFF'); });
  label(stage, '지평선', T[0] - 10, T[1] + 70, fadeIn(t, P.hor18 - 0.1, 0.3), {size: 36});
  label(stage, '곧게 나아가는 전파', 640, 860, win(t, P.straight18, P.low18 + 0.6), {size: 34, color: PAL.txHot});
  label(stage, '보이지 않는 곳', 760, 1250, fadeIn(t, P.low18 - 0.1, 0.3), {size: 40, color: PAL.ink});
  label(stage, '전파가 닿지 않음', 760, 1305, fadeIn(t, P.not18 - 0.1, 0.3), {size: 32, color: PAL.muted});
  label(stage, '메아리', Hi[0], Hi[1] - 80, win(t, Z.hits[0] - 0.1, ctx.scene.end), {size: 34, color: PAL.echo});
  label(stage, '안테나 높이 25 m → 지평선 약 21 km', 540, 420, fadeIn(t, P.hor18 + 0.2, 0.4), {size: 34, color: PAL.muted});
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ myth: σ ÷ 10,000 → range ÷ 10 (log–log)
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start, Y = P.my;
  dust(c, ID, t);
  // top: two aircraft approaching the radar on two lanes
  const ld = t < Y.run[0] ? Y.lx[1] + 0.25 * (1 - smooth((t - s0) / (Y.run[0] - s0))) : Y.ld(t), ax = lerp(250, 860, (ld - Y.lx[0]) / (Y.lx[1] + 0.25 - Y.lx[0]));
  dish(c, 110, 600, 0.8, 0, {});
  const lanes = [[520, 1, '보통 비행기', 0], [700, M.sigmaK, '스텔스 (σ ÷ 10,000)', 1]];
  for (const [y, sg, nm, i] of lanes) {
    line(c, [[170, y], [960, y]], 'rgba(140,190,200,0.12)', 1.2);
    { const rho = i ? 7 : 64, da = fadeIn(t, i ? P.stealth19 : s0 + 0.2, 0.4); gl(c, ax + 60, y, rho * 1.9, PAL.echo, 0.3 * da); withAlpha(c, da, () => { c.save(); c.setLineDash([6, 6]); c.beginPath(); c.arc(ax + 60, y, rho, 0, TAU); c.strokeStyle = rgba(PAL.echo, 0.9); c.lineWidth = 2.2; c.stroke(); c.restore(); }); }
    jet(c, xf(ID.S, ax + 60, y, 0.95, -1, 0), {alpha: i ? 0.8 : 1});
    const caught = t > Y.cross[i], age = t - Y.cross[i];
    if (caught) { gl(c, ax, y, 40, PAL.echo, 0.3 + 0.5 * Math.exp(-age / 0.5)); burst(c, ax, y, age, 70, PAL.echoHot, 0.9); }
    label(stage, nm, 560, y - 92, fadeIn(t, i ? P.stealth19 - 0.1 : s0 + 0.2, 0.3), {size: 32, color: i ? PAL.muted : PAL.ink});
    label(stage, '잡힘', ax + 150, y + 4, fadeIn(t, Y.cross[i], 0.2), {size: 34, color: PAL.echo, align: 'left'});
  }
  big(stage, '?', 540, 900, 170, PAL.echo, win(t, P.unseen19 - 0.1, P.no20 + 0.2));
  // graph
  const [gx0, gy0, gx1, gy1] = Y.g, X = l => lerp(gx0, gx1, (l - Y.lx[0]) / (Y.lx[1] - Y.lx[0])), Yv = l => lerp(gy1, gy0, (l - Y.ly[0]) / (Y.ly[1] - Y.ly[0]));
  const ga = fadeIn(t, P.no20 - 0.1, 0.5);
  if (ga > 0) withAlpha(c, ga, () => {
    c.fillStyle = 'rgba(0,14,20,0.55)'; c.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    for (let l = -1; l <= 0; l++) line(c, [[X(l), gy0], [X(l), gy1]], 'rgba(140,190,200,0.12)', 1);
    for (let l = -6; l <= 5; l++) line(c, [[gx0, Yv(l)], [gx1, Yv(l)]], 'rgba(140,190,200,0.07)', 1);
    line(c, [[gx0, gy1], [gx1, gy1]], rgba(PAL.line, 0.7), 1.8); line(c, [[gx0, gy0], [gx0, gy1]], rgba(PAL.line, 0.7), 1.8);
    c.save(); c.setLineDash([10, 8]); line(c, [[gx0, Yv(0)], [gx1, Yv(0)]], rgba(PAL.ink, 0.8), 2); c.restore();
    c.save(); c.beginPath(); c.rect(gx0, gy0, gx1 - gx0, gy1 - gy0); c.clip();
    for (const [sg, col, i] of [[1, PAL.echo, 0], [M.sigmaK, PAL.txHot, 1]]) {
      const pts = []; for (let l = Y.lx[0]; l <= Y.lx[1] + 1e-6; l += 0.02) pts.push([X(l), Yv(Math.log10(sg) - 4 * l)]);
      glowLine(c, pts, col, 0.9, 2.4);
      const lnow = t < Y.run[0] ? Y.lx[1] : Y.ld(t), p = [X(lnow), Yv(Math.log10(sg) - 4 * lnow)];
      gl(c, p[0], p[1], 26, col, 0.9); circle(c, p[0], p[1], 5, '#FFFFFF');
      if (t > Y.cross[i]) { const q = [X(-i), Yv(0)]; gl(c, q[0], q[1], 30, PAL.echoHot, 0.7); circle(c, q[0], q[1], 6, rgba(PAL.echoHot, 1)); }
    }
    c.restore();
    stage.text('R', X(0), gy1 + 34, {role: 'body', weight: 700, size: 32, color: PAL.ink, align: 'center'});
    stage.text('R ÷ 10', X(-1), gy1 + 34, {role: 'body', weight: 700, size: 32, color: PAL.ink, align: 'center'});
    stage.text('거리 →', gx1, gy1 + 34, {role: 'body', weight: 500, size: 30, color: PAL.muted, align: 'right'});
    stage.text('메아리 세기 (한 칸 = 10배)', gx0, gy0 - 22, {role: 'body', weight: 500, size: 30, color: PAL.muted});
    stage.text('잡히는 최소 세기', gx1 - 12, Yv(0) - 26, {role: 'body', weight: 700, size: 30, color: PAL.ink, align: 'right'});
  });
  label(stage, '메아리 ∝ σ ÷ 거리⁴', 540, 790, win(t, P.small20 - 0.1, P.tenk20 + 0.3), {size: 40, color: '#FFFFFF'});
  big(stage, 'σ ÷ 10,000 → 거리 ÷ 10', 540, 790, 58, PAL.echo, fadeIn(t, P.ten20 - 0.1, 0.3));
  fadeFromBlack(c, t, s0, 0.35);
}

// ------------------------------------------------------------------ close: the poster comes back (echo deflected away)
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start;
  const cm = keyCam(t, [[s0, 580, 930, 1.04], [P.poster + 0.6, 540, 860, 1], [P.end, 540, 860, 1]]);
  posterWorld(stage, t, P, cm);
  fadeFromBlack(c, t, s0, 0.45);
}

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; const T = [...times].sort((a, b) => a - b); ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((tt, k) => ({kind: 'tick', offset: r(tt - T[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.08, click: 0, gain_db: Array.isArray(o.g) ? o.g[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const tone = (id, t0, f, dur, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tone', params: {freq: f, dur, harmonics: o.h || [1, 0.3], attack: o.attack ?? 0.01, decay: o.decay ?? dur * 0.3, sustain: o.sustain ?? 0.4, release: o.release ?? dur * 0.5, gain_db: gain}, means});
  const pulses = (id, times, f, gain, means, o = {}) => { if (!times.length) return; const T = [...times].sort((a, b) => a - b); ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((tt, k) => ({kind: 'tone', offset: r(tt - T[0], 4), params: {freq: f, dur: o.dur ?? 0.14, harmonics: [1, 0.25], attack: 0.006, decay: 0.05, sustain: 0.4, release: 0.06, gain_db: Array.isArray(o.g) ? o.g[k] : 0}}))}, means}); };
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const hum = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * smooth((tt - t0) / 0.4) * (1 - smooth((tt - (t1 - 0.5)) / 0.5))), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 35, high: o.high ?? 140, fade: 0.05, points: Q}, means}); };
  const sc = id => tl.scene(id), inS = (id, a, b) => a.filter(x => x >= (b ?? sc(id).start) && x < sc(id).end);
  const hookEnd = sc('hook').end, closeS = sc('close').start;
  // ---- hook / close: pulses leave the dish, echoes return (quieter; after the tilt, much quieter)
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 레이더 접시에서 비행기로 가는 펄스와 돌아오는 메아리', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  const txH = P.tx.times().filter(x => (x >= 0.2 && x < hookEnd - 0.3) || (x >= closeS + 0.2 && x < P.end - 0.3));
  pulses('hook_tx', txH, 220, -33, '펄스를 쏨 (2초마다, 같은 모형)');
  const eb = P.echoBack.filter(x => (x >= 0 && x < hookEnd - 0.2) || (x >= closeS + 0.2 && x < P.end - 0.2));
  pulses('hook_echo', eb, 220, -38, '메아리가 접시에 닿음 (왕복 = 2 × 거리 ÷ 화면 속도); 비행기가 기운 뒤에는 더 작게', {dur: 0.11, g: eb.map(x => 20 * Math.log10(Math.max(0.05, P.lobeK(P.jetRot(x - P.tt), P.back))))});
  whoosh('tilt', P.tilt[0], P.tilt[1] - P.tilt[0], 90, 200, '비행기가 기울어 메아리가 다른 쪽으로 튐', -37);
  // ---- deathray
  tick('y1934', P.y34 + 0.1, 110, -34, '"1934"', {decay: 0.16});
  hum('deathbeam', P.beam[0], P.beam[1], tt => 0.6, -36, '죽음의 광선? (설명 그림의 굵은 빔): 낮은 웅웅거림', {low: 60, high: 200});
  tick('calc', P.calc3, 131, -34, '계산: 세기 ∝ 1/거리² — 퍼지는 파면', {decay: 0.12});
  ticks('spread', P.spread.times().filter(x => x < sc('deathray').end - 0.5), 98, -40, '퍼지는 파면이 하나씩 나감 (점점 약해짐)', {decay: 0.1, g: P.spread.times().filter(x => x < sc('deathray').end - 0.5).map((_, k) => -2 * k)});
  tick('impossible', P.imp3, 82, -34, '"떨어뜨리기: 불가능"', {decay: 0.2});
  pulses('dr_tx', P.drPulse.ts, 220, -33, '펄스를 쏨');
  tick('dr_hit', P.drHit, 147, -36, '펄스가 폭격기에 닿음 (거리 ÷ 화면 속도)', {decay: 0.1});
  pulses('dr_echo', [P.drRx], 220, -39, '약한 메아리가 수신 안테나에 닿음 → "찾기: 가능"', {dur: 0.12});
  // ---- daventry
  tick('y1935', P.y35 + 0.1, 110, -34, '"1935년 2월"', {decay: 0.16});
  hum('broadcast', sc('daventry').start, P.radar6 + 0.6, tt => 0.45, -40, '방송국의 연속 전파(설명용 낮은 잡음, 전파는 소리가 아님)', {low: 70, high: 180});
  chirp('crt', P.rxSeen, P.radar6 + 0.4, () => 165, tt => 0.08 + 0.4 * smooth((tt - P.scr5) / 0.6) * (0.6 + 0.4 * Math.sin(TAU * 1.3 * tt)), -36, '메아리를 받은 화면의 빛점이 흔들림 → 같은 박자(1.3 Hz)로 커졌다 작아지는 165 Hz 음');
  tick('km13', P.km5, 131, -33, '"약 13 km"', {decay: 0.14});
  tick('first', P.first5, 196, -34, '처음 잡힘 — 화면의 섬광', {decay: 0.14});
  whoosh('radar_in', P.radar6, 0.8, 90, 220, 'RADAR 글자로 넘어감', -36);
  ticks('letters', [P.ra6, P.d6, P.d6 + 0.35, P.r6], [131, 147, 165, 196], -35, 'RAdio · Detection · And · Ranging 글자가 하나씩 켜짐', {decay: 0.1});
  tick('y1940', P.y40, 110, -36, '"1940 · 미국 해군"', {decay: 0.14});
  // ---- essence
  pulses('es_tx', P.es.ts, 220, -32, '짧은 펄스를 쏨 (A 화면의 큰 봉우리)');
  ticks('es_hit', P.es.hits, 147, -38, '펄스가 비행기에 닿음', {decay: 0.08});
  pulses('es_echo', P.es.back, 220, -40, '희미한 메아리가 돌아옴 (왕복 = 2 × 거리 ÷ 화면 속도, A 화면의 작은 봉우리)', {dur: 0.11});
  tick('dist8', P.dist8, 131, -36, '"왕복 시간 → 거리"', {decay: 0.12});
  tick('speed8', P.speed8, 165, -36, '"진동수 변화 → 속도"', {decay: 0.12});
  // ---- range
  pulses('rg_tx', [P.rg.te], 220, -31, '펄스를 쏨 (시계 0.0000초)');
  tick('rg_hit', P.rg.hit, 147, -34, '150 km 밖 비행기에 닿음 (실제 0.0005초)', {decay: 0.12});
  pulses('rg_echo', [P.rg.ret], 220, -35, '메아리가 돌아옴 (실제 0.001초 = 300 km, 4,000배 느리게)');
  tick('half', P.half9, 131, -33, '"300 km ÷ 2 = 150 km"', {decay: 0.14});
  whoosh('fold', P.fold[0], P.fold[1] - P.fold[0], 90, 220, '거리 축이 돌아가는 빔이 되어 둥근 화면이 펼쳐짐', -36);
  { const T = [], G = []; for (const b of P.blips) for (const x of P.blipTimes(b)) { T.push(x); G.push(b.i ? -4 : 0); } ticks('ppi_blips', T, 196, -38, '회전하는 빔이 지나갈 때 점이 켜짐 (방향 = 빔의 각도)', {decay: 0.07, g: G}); }
  // ---- doppler: the echo pitch follows the on-screen compression ratio
  chirp('dop_tx', P.dp.onA + 0.3, P.dp.off, () => 165, () => 0.22, -38, '보낸 전파(설명용 165 Hz)');
  chirp('dop_in', P.dp.backA, P.up11 + 1.0, () => r(165 / M.dopIn, 1), () => 0.32, -36, `다가오는 비행기의 메아리: 화면의 파장 비율 ${M.dopIn.toFixed(2)}과 같은 비율로 높은 음 (${(165 / M.dopIn).toFixed(0)} Hz)`);
  chirp('dop_out', Math.max(P.dp.backB, P.away11 - 0.2), P.dp.off, () => r(165 / M.dopOut, 1), () => 0.32, -36, `멀어지는 비행기의 메아리: 비율 ${M.dopOut.toFixed(2)} → 낮은 음 (${(165 / M.dopOut).toFixed(0)} Hz)`);
  tick('gun', P.gun12, 196, -34, '스피드건: "시속 100 km"', {decay: 0.12});
  tick('wx', P.wx12, 147, -35, '기상 레이더 속도 화면: 다가옴 / 멀어짐', {decay: 0.12});
  // ---- wavelength: long λ → low tone, short λ → higher tone (×5.5 in wavelength, shown as pitch ratio 3)
  chirp('wl_long', sc('wavelength').start + 0.2, P.wl.rain, () => 98, tt => 0.18 + 0.25 * airy(P.wl.psi(tt) + M.sep / 2, M.dl[0]), -38, '긴 파장의 빔(낮은 음): 넓은 빔이 두 점을 함께 비춤');
  chirp('wl_short', P.short13, P.wl.rain, () => 294, tt => 0.1 + 0.4 * Math.max(airy(P.wl.psi(tt) - M.sep / 2, M.dl[1]), airy(P.wl.psi(tt) + M.sep / 2, M.dl[1])), -38, '짧은 파장의 빔(높은 음): 좁은 빔이 두 점을 따로 비춤 → 두 번씩 솟음');
  hum('rain', P.wl.rain + 0.2, sc('wavelength').end, () => 0.4, -40, '빗소리 대신 낮은 잡음(설명용)', {low: 120, high: 340});
  chirp('rain_short', P.weak14 - 1.0, P.weak14 + 1.6, () => 294, tt => 0.4 * (1 - smooth((tt - P.weak14 + 0.6) / 1.2)), -36, '3 cm 빔이 비 속에서 약해짐 → 작아지는 높은 음');
  chirp('rain_long', P.far14 - 0.4, sc('wavelength').end - 0.3, () => 98, () => 0.35, -36, '10 cm 빔은 비를 지나 멀리까지 → 낮은 음이 그대로');
  tick('cm10', P.cm14, 131, -33, '"10 cm"', {decay: 0.14});
  // ---- shape
  pulses('sh_tx', [0, 1, 2, 3].map(k => sc('shape').start + 0.2 + 1.6 * k).filter(x => x < P.sh.swap[0]), 220, -34, '비행기로 펄스를 쏨');
  tick('sigma', P.rcs15, 131, -35, '"반사 단면적 σ"', {decay: 0.12});
  whoosh('shrink', P.less15, 0.9, 200, 90, 'σ 원이 줄어듦', -37);
  whoosh('to_plate', P.sh.swap[0], 0.8, 90, 200, '평판 실험으로 넘어감', -37);
  { const back = te => te + 2 * (P.sh.P[0] - P.sh.V[0] - 46) / P.sh.c, T = [], G = [];
    for (let k = 0; ; k++) { const te = P.sh.t0 + k * 1.0; const b = back(te); if (b > sc('shape').end - 0.3) break; if (b < P.sh.swap[1] + 0.5) continue; const rot = P.sh.rot(b), coat = P.sh.coat(b); const kk = rot > 0.1 ? 0.05 : 1 - 0.72 * coat; T.push(b); G.push(r(20 * Math.log10(Math.max(0.03, kk)), 1)); }
    pulses('sh_echo', T, 196, -34, '평판에서 레이더로 돌아온 메아리의 크기 (정면: 크게, 기울임: 거의 없음, 흡수 재료: 작게)', {dur: 0.12, g: G}); }
  whoosh('tilt16', P.tilt16, 1.0, 90, 200, '평판이 기울어짐', -36);
  tick('other', P.other16, 147, -35, '반사파가 다른 쪽으로 (입사각 = 반사각)', {decay: 0.12});
  whoosh('coat', P.coat17 - 0.3, 0.8, 200, 90, '흡수 재료가 덮임', -37);
  hum('heat', P.heat17 - 0.2, sc('shape').end, () => 0.5, -40, '흡수층 안에서 에너지가 열로: 낮은 잡음', {low: 50, high: 160});
  ticks('bars', P.sh.bars, [196, 131, 165], -36, '메아리 크기 막대가 하나씩', {decay: 0.1});
  // ---- horizon
  pulses('hz_tx', P.hz.tx.times().filter(x => x < sc('horizon').end - 0.3), 220, -34, '펄스를 쏨 (곧게 나아감)');
  pulses('hz_echo', P.hz.back.filter(x => x < sc('horizon').end), 220, -39, '높은 비행기의 메아리 (낮은 비행기는 전파가 닿지 않아 소리 없음)', {dur: 0.11});
  tick('horizon_pt', P.hor18, 131, -35, '"지평선"', {decay: 0.12});
  // ---- myth
  swell('question', P.unseen19 - 0.1, [110, 165], '"안 보일까?"', {dur: 1.4, gain: -35});
  whoosh('graph', P.no20, 0.8, 90, 200, '그래프가 나타남', -37);
  tick('caught0', P.my.cross[0], 196, -32, '보통 비행기가 잡힘 (메아리 = 잡히는 최소 세기, 거리 R)', {decay: 0.14});
  tick('caught1', P.my.cross[1], 196, -32, '스텔스(σ ÷ 10,000)도 잡힘 (거리 R ÷ 10)', {decay: 0.14});
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
    notes: '설명용 합성음입니다(녹음 아님). 전파는 소리를 내지 않으므로 모든 소리는 화면 사건의 표시음입니다. 배경음악·배경음 없음. 모든 사건은 `node episodes/radar/scenes.mjs --emit-sound`가 scenes.mjs 머리의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 펄스를 쏨 → 짧은 220 Hz 음, 메아리가 접시에 닿음 → 같은 음을 작게(왕복 시간 = 2 × 거리 ÷ 화면 속도, 반사 세기에 따라 크기), 둥근 화면의 점 → 작은 틱, 도플러 메아리 → 화면의 파장 비율과 같은 비율의 음높이(다가옴 높게, 멀어짐 낮게), 긴 파장/짧은 파장 → 낮은 음/높은 음(빔이 표적을 비추면 커짐), 지평선 아래 비행기 → 소리 없음. 모든 기본음 700 Hz 아래. 패닝 없음(모노 안전). 타임라인이 바뀌면 다시 실행하세요.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; poster ${P.poster.toFixed(2)} s, one-way ${P.tt.toFixed(2)} s, doppler ×${M.dopIn.toFixed(3)}/×${M.dopOut.toFixed(3)}, myth cross ${P.my.cross.map(x => x.toFixed(2)).join(', ')}, f_d ${M.fd.toFixed(0)} Hz`);
}
