// Episode scenes — "수소폭탄은 왜 더 강할까 — 핵융합"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Scope (safety, brief "다루지 않는 범위"): textbook physics only. The two stages are two abstract labelled blocks with an
//    energy arrow ([1단계 핵분열] → 열·압력 → [2단계 핵융합]); no device, no geometry, no arrangement, no materials.
//  - Cloud (hook, poster, s20): top height H(τ) from monotone knots ending at 64 km (Tsar Bomba, 1961); layer boundaries
//    12 / 50 / 85 km; airliner cruise ≈ 10 km → 64 / 10 = 6.4 ("여섯 배를 넘었습니다"). Shapes and widths are schematic,
//    the rise is time-compressed (real: minutes). 1 km = 10.8 px on screen.
//  - Yields (log bars): TNT 1 t, Hiroshima 15 kt, Ivy Mike 10.4 Mt, Castle Bravo 15 Mt, Tsar Bomba 50 Mt (≈ 3,300 × Hiroshima).
//  - Barrier (설명 모형): Coulomb hill U(r) ∝ 1/r outside the nucleus radius, normalised to 1 at the top; collision energies
//    follow the Maxwell energy distribution f(E) ∝ √E e^(−E/θ) with θ = 0.25·T/10⁸ K (display units); a collision can fuse
//    when E > E* = 0.55 (near the top, where the remaining wall is thin). Fusion rate ∝ tail fraction
//    Q(3/2, E*/θ) = erfc(√x) + 2√(x/π)e^(−x): 1.36 at 1.2억 도, 0.15 at 5천만, 3×10⁻⁴ at 2천만, ~10⁻⁸ at 1천만 (1억 = 1).
//    Mean speed of a deuteron √(8kT/πm_D): 1억 도 → about 1,000 km/s. Individual trials on the hill integrate
//    dr/dt = −c√(E − U(r)) and reflect at the turning point; a pass slips through the thin top into the well.
//  - Sun (essence): 4 protons (4 × 1.00728 u = 4.029 u) → ⁴He nucleus 4.002 u: 0.7 % lighter (several steps drawn as one).
//  - D + T → ⁴He (3.5 MeV) + n (14.1 MeV) = 17.6 MeV, 0.38 % of the mass. Equal and opposite momenta → the neutron moves
//    4 × faster (≈ 52,000 km/s = 0.17 c; He ≈ 13,000 km/s).
//  - Binding energy per nucleon (measured values, smoothed curve for A ≥ 12): peak at iron/nickel ≈ 8.8 MeV.
//    D-T gain 17.6/5 = 3.5 MeV per nucleon, U-235 fission ≈ 200/236 = 0.85 → ≈ 4 × per mass.
//  - Energy per kg: H₂ burning 1.42×10⁸ J, U-235 fission 8.2×10¹³ J, D-T fusion 3.38×10¹⁴ J (×4.1 fission, ×2.4 million chem).
//  - Two-stage flow (설명용 도식): stage 1 energy jumps at "터진"; stage-2 fuel density and temperature rise; burn rate
//    ∝ n²·rel(T)·f² with fuel f consumed; energy meter = integral (relative, no numbers).
//  - Tests: Enewetak (schematic atoll), Elugelab island → crater ≈ 1.9 km; Bikini → fallout band toward the east, the
//    Japanese fishing boat ≈ 130 km away ("100 km 넘게"). Schematic maps, not survey maps.
//  - Sound: node episodes/hydrogen-bomb/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow, sphere,
  withAlpha, rect, clipRect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = {base: 'navy', accent: '#FF7A59'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
/** monotone cubic (Fritsch–Carlson) through knots → f(x), clamped at the ends */
function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const u = (x - xs[i]) / h[i], u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h[i] * m[i + 1];
  };
}
// ---- atmosphere and cloud (hook / poster) ----
export const GROUND_Y = 1300, KM = 10.8, CLOUD_X = 540;
export const LAYERS = [{km: 12, name: '대류권', mid: 6}, {km: 50, name: '성층권', mid: 31}, {km: 85, name: '중간권', mid: 74}];
export const CLOUD_TOP_KM = 64, AIRLINER_KM = 10;
export const yKm = km => GROUND_Y - km * KM;
const TOP_KNOTS = [[0, 0], [0.5, 2.6], [1.5, 6.4], [3.5, 11.2], [5.5, 16], [8, 27], [10.5, 40], [12.5, 50.5], [14.6, 60], [15.8, 63.1], [17.2, 64]];
export const cloudTopKm = pchip(TOP_KNOTS.map(k => k[0]), TOP_KNOTS.map(k => k[1]));
export const FB_R = 8;                                                     // fireball radius (km, schematic)
/** cloud state τ seconds (screen) after detonation: top H, cap half-width a, half-height b, centre zc, fireball radius / light */
export function cloudState(tau, poster = false) {
  const H = cloudTopKm(tau), rf = FB_R * (1 - Math.exp(-Math.max(0, tau) / 0.28));
  const g = smooth((H - 7) / 52), b = lerp(rf, 9.5, g), a = lerp(rf, 22, smooth((H - 5) / 46) ** 0.85);
  const zc = Math.max(0, H - b);
  return {tau, H, a, b, zc, rf, Lf: poster ? 0 : Math.exp(-Math.max(0, tau) / 2.3), warm: poster ? 0.95 : 0.22 + 0.78 * Math.exp(-Math.max(0, tau) / 4.5), poster};
}
export const POSTER_TAU = 17.6;
// ---- yields (TNT equivalent, tonnes) ----
export const YIELD = {tnt: 1, hiro: 1.5e4, mike: 1.04e7, bravo: 1.5e7, tsar: 5e7};
export const TSAR_X_HIRO = YIELD.tsar / YIELD.hiro;                        // 3,333
export const DEC_S = 0.2;                                                  // a log bar rises one decade per 0.2 s
export const stepHz = k => 98 * 2 ** (3 * k / 12);                         // one minor third per decade (sound)
// ---- barrier (설명 모형) ----
export const BAR = {Estar: 0.55, th8: 0.25, R0: 0.12};
export const thetaOf = T => BAR.th8 * T / 1e8;
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** upper tail of the Maxwell energy distribution (Γ(3/2, θ)) above E */
export const tailAbove = (E, th) => { const x = E / th; return erfc(Math.sqrt(x)) + 2 * Math.sqrt(x / Math.PI) * Math.exp(-x); };
export const tailFrac = T => tailAbove(BAR.Estar, thetaOf(T));
export const REL1 = tailFrac(1e8);
export const relRate = T => tailFrac(T) / REL1;                            // fusion rate relative to 1억 도
/** energy with upper-tail probability q at temperature T (bisection) */
export function energyAtTail(q, T) { const th = thetaOf(T); let lo = 0, hi = 40 * th; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (tailAbove(m, th) > q) lo = m; else hi = m; } return (lo + hi) / 2; }
export const pdfE = (E, th) => (E <= 0 ? 0 : 2 * Math.sqrt(E / Math.PI) * th ** -1.5 * Math.exp(-E / th));
/** hill potential in display units: 1 at r = R0, 0 at r = 1; r < R0 is the well */
export const Uhill = r => (r >= BAR.R0 ? (BAR.R0 / r - BAR.R0) / (1 - BAR.R0) : -0.12);
export const rTurn = E => BAR.R0 / (E * (1 - BAR.R0) + BAR.R0);
const KB = 1.380649e-23, M_D = 3.3436e-27;
export const vMeanD = T => Math.sqrt(8 * KB * T / (Math.PI * M_D)) / 1000;  // km/s
/** one trial on the hill: approach from r = 1 at energy E; → {T (s), r(u), pass, tTurn} with dr/dt = −C√(E − U + ε) */
const HILL_C = 1.9;
export function hillTrial(E) {
  const pass = E >= BAR.Estar, rt = rTurn(E), dt = 1 / 240, R = [1];
  let r = 1;
  while (r > rt + 1e-4 && R.length < 4000) { r = Math.max(rt, r - HILL_C * Math.sqrt(Math.max(0, E - Uhill(r)) + 0.004) * dt); R.push(r); }
  const nIn = R.length;
  if (!pass) for (let k = nIn - 2; k >= 0; k--) R.push(R[k]);                // reflect: same path back
  const tTurn = (nIn - 1) * dt;
  return {E, pass, rt, R, dt, tTurn, T: (R.length - 1) * dt, tunnel: 0.32};
}
export const sampleTrial = (tr, u) => { if (u <= 0) return tr.R[0]; const k = u / tr.dt; if (k >= tr.R.length - 1) return tr.R.at(-1); const i = Math.floor(k); return lerp(tr.R[i], tr.R[i + 1], k - i); };
// ---- nuclear numbers ----
export const DT_Q = {he: 3.5, n: 14.1, tot: 17.6, massPct: 0.38, vN: 52000, vHe: 13000};
export const SUN_M = {p4: 4 * 1.00728, he: 4.00151};
export const SUN_LOSS = (SUN_M.p4 - SUN_M.he) / SUN_M.p4;                  // 0.0069
export const EPM = {chem: 1.42e8, fis: 8.2e13, fus: 3.38e14};              // J/kg
export const FUS_X_FIS = EPM.fus / EPM.fis, FUS_X_CHEM = EPM.fus / EPM.chem;
// binding energy per nucleon (MeV): light nuclei as points, A ≥ 12 a smooth curve through measured values
export const BE_LIGHT = [{A: 1, B: 0, n: '수소'}, {A: 2, B: 1.112, n: '중수소'}, {A: 3, B: 2.827, n: '삼중수소'}, {A: 4, B: 7.074, n: '헬륨'}, {A: 6, B: 5.33}, {A: 7, B: 5.61}, {A: 9, B: 6.46}];
const BE_A = [12, 16, 20, 24, 28, 32, 40, 48, 56, 62, 80, 100, 120, 140, 160, 180, 200, 220, 238];
const BE_B = [7.68, 7.98, 8.03, 8.26, 8.45, 8.49, 8.55, 8.72, 8.79, 8.79, 8.71, 8.62, 8.50, 8.38, 8.22, 8.06, 7.91, 7.70, 7.57];
export const beCurve = pchip(BE_A.map(a => Math.log10(a)), BE_B);
export const beAt = A => beCurve(Math.log10(A));
// ---- trigger: stage-2 burn (설명용 도식) ----
export const BURN = {R0: 15, T1: 1.5e8};

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  fuse1: W('s01', '합쳐'), hb1: W('s01', '수소폭탄에'),
  y1961: W('s02', '천구백육십일년'), biggest: W('s02', '가장'), hiro: W('s02', '히로시마'), x3000: W('s02', '삼천'), over2: W('s02', '넘는'),
  cloud3: W('s03', '버섯구름은'), km60: W('s03', '육십킬로미터'), rise3: W('s03', '솟아'), plane: W('s03', '여객기가'), six: W('s03', '여섯'),
  lav: W('s04', '라부아지에가'), water: W('s04', '물을'), make: W('s04', '만드는'), translated: W('s04', '옮긴'), mul: W('s04', '물 수에'), batang: W('s04', '바탕'), ssum: W('s04', '씁니다'),
  core: W('s05', '중심에서는'), hnuc: W('s05', '수소 원자핵들이'), merge5: W('s05', '합쳐져'), he5: W('s05', '헬륨이'), light5: W('s05', '빛과'), fusion5: W('s05', '핵융합입니다'),
  he6: W('s06', '헬륨은'), first6: W('s06', '처음'), little6: W('s06', '조금'), vanished: W('s06', '사라진'), energy6: W('s06', '에너지가'),
  nuc7: W('s07', '원자핵은'), plus7: W('s07', '양전기를'), push7: W('s07', '밀어내므로'), fast7: W('s07', '아주'), fuse7: W('s07', '합쳐집니다'),
  so8: W('s08', '그래서'), e8: W('s08', '일억'), need8: W('s08', '필요하고'), heat8: W('s08', '열로'), thermo8: W('s08', '열핵반응이라고도'),
  h9: W('s09', '수소의'), sib9: W('s09', '형제인'), d9: W('s09', '중수소와'), t9: W('s09', '삼중수소가'),
  two10: W('s10', '둘이'), he10: W('s10', '헬륨이'), n10: W('s10', '중성자'), big10: W('s10', '큰'), out10: W('s10', '튀어나옵니다'),
  temp11: W('s11', '온도를'), instant11: W('s11', '한순간에'), abomb11: W('s11', '원자폭탄뿐이라'), hbomb11: W('s11', '수소폭탄은'), trig11: W('s11', '방아쇠로'),
  burst12: W('s12', '터진'), heat12: W('s12', '열과'), press12: W('s12', '압력이'), squeeze12: W('s12', '짓눌러'), hot12: W('s12', '달구면'), fusion12: W('s12', '핵융합이'),
  pacific: W('s13', '태평양의'), island13: W('s13', '섬에서'), test13: W('s13', '시험했고'), gone13: W('s13', '섬 하나가'), whole13: W('s13', '통째로'),
  bikini: W('s14', '비키니'), test14: W('s14', '시험에서는'), fallout14: W('s14', '낙진이'), km100: W('s14', '백킬로미터'), boat14: W('s14', '어선까지'), fly14: W('s14', '날아가'), crew14: W('s14', '선원들이'),
  mass15: W('s15', '질량에서'), out15: W('s15', '나오는'), fus15: W('s15', '핵융합이'), fis15: W('s15', '핵분열의'), four15: W('s15', '네 배'), fuel15: W('s15', '연료를'), much15: W('s15', '만큼'), power15: W('s15', '위력도'),
  burn16: W('s16', '타는'), same16: W('s16', '같을까요'),
  no17: W('s17', '아닙니다'), h17: W('s17', '수소가'), elec17: W('s17', '전자가'), chem17: W('s17', '화학'), hb17: W('s17', '수소폭탄은'), merge17: W('s17', '합쳐지는'),
  same18: W('s18', '같은'), h18: W('s18', '수소에서'), e18: W('s18', '에너지가'), mil18: W('s18', '수백만'),
  y1963: W('s19', '천구백육십삼년'), atm19: W('s19', '대기권'), ban19: W('s19', '금지했고'), now19: W('s19', '이제는'), slow19: W('s19', '천천히'), power19: W('s19', '핵융합'),
  hb20: W('s20', '수소폭탄은'),
};

/** t such that f(t) crosses v (f increasing on [a, b]) */
const solveUp = (f, v, a, b) => { let lo = a, hi = b; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) < v) lo = m; else hi = m; } return (lo + hi) / 2; };
/** integer crossings of N(t) = ∫ R dt on [t0, t1] (dt 1/240) → times; offset makes the first event come after half a count */
function poissonTimes(R, t0, t1, offset = 0.5) { const out = []; let N = offset, prev = Math.floor(N); for (let t = t0; t < t1; t += 1 / 240) { N += R(t) / 240; if (Math.floor(N) > prev) { prev = Math.floor(N); out.push(+t.toFixed(4)); } } return out; }
const thin = (times, gap = 0.15) => { const o = []; for (const x of times.slice().sort((a, b) => a - b)) if (!o.length || x - o.at(-1) >= gap) o.push(x); return o; };

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // ---- hook: detonation replay, yield bars, atmosphere ruler
  P.det = at(A.fuse1);
  P.tau = t => t - P.det;
  P.cross12 = P.det + solveUp(cloudTopKm, 12, 0, 17); P.cross50 = P.det + solveUp(cloudTopKm, 50, 0, 17); P.top64 = P.det + solveUp(cloudTopKm, 63.9, 0, 17.2);
  P.chartIn = at('s02') - 0.1; P.chartOut = at('s02:end') + 0.15;
  P.hiro0 = at(A.hiro) - 0.05; P.tsar0 = Math.max(P.hiro0 + Math.log10(YIELD.hiro) * DEC_S + 0.05, at(A.x3000) - Math.log10(YIELD.hiro) * DEC_S);
  P.tsarTop = P.tsar0 + Math.log10(YIELD.tsar) * DEC_S; P.bracket = P.tsarTop + 0.05; P.tsarTag = at(A.y1961) - 0.1;
  P.ruler = at(A.cloud3) - 0.25; P.km60 = at(A.km60) - 0.05; P.plane = at(A.plane) - 0.1; P.six = at(A.six) - 0.1;
  P.segT = [...Array(6)].map((_, k) => P.six + 0.17 * k); P.sixDone = P.segT[5] + 0.25;
  // ---- origin
  P.word = at('s04') - 0.15; P.lav = at(A.lav) - 0.1; P.hydro = at(A.water) - 0.1; P.gene = at(A.make) - 0.05;
  P.rx = [at(A.water) + 0.35, at(A.translated) + 0.15, at(A.ssum) + 0.4];
  P.arrowHan = at(A.translated) - 0.1; P.su = at(A.mul) - 0.05; P.so = at(A.batang) - 0.05; P.eq = at(A.ssum) - 0.1;
  // ---- essence
  P.core = at(A.core) - 0.1; P.protons = at(A.hnuc) - 0.1; P.merge5 = at(A.merge5) + 0.45; P.heLbl = at(A.he5) + 0.05; P.light5 = at(A.light5) - 0.05; P.fusionLbl = at(A.fusion5) - 0.1;
  P.sunFus = [P.merge5]; for (let tt = P.merge5 + 1.45; tt < at('s05:end') + 0.6; tt += 1.45) P.sunFus.push(+tt.toFixed(3));
  P.balance = at('s06') - 0.45; P.heMass = at(A.he6) - 0.05; P.hMass = at(A.first6) + 0.25; P.tilt = at(A.little6) - 0.05; P.vanish = at(A.vanished) - 0.05; P.emc2 = at(A.energy6) - 0.05;
  // ---- barrier: s07 scripted trials, s08 temperature knob and sampled trials
  const s07 = [hillTrial(0.24), hillTrial(0.42), hillTrial(0.86)];
  const fuseAt = at(A.fuse7) - 0.05, cStart = fuseAt - (s07[2].tTurn + s07[2].tunnel);
  const aStart = at(A.nuc7) - 0.3, bStart = Math.min(aStart + s07[0].T + 0.12, cStart - s07[1].T - 0.12);
  P.trials = [{...s07[0], t0: aStart}, {...s07[1], t0: Math.max(aStart + s07[0].T + 0.05, bStart)}, {...s07[2], t0: cStart}];
  P.s08 = at(A.so8) - 0.35; P.k0 = at(A.e8) - 0.12; P.k1 = at(A.need8) - 0.05;
  P.T = t => (t < P.k0 ? 1e6 : t > P.k1 ? 1.2e8 : 10 ** lerp(6, Math.log10(1.2e8), easeInOut((t - P.k0) / (P.k1 - P.k0))));
  { const Q = [0.55, 0.85, 0.3, 0.12, 0.62, 0.22, 0.45, 0.06, 0.7, 0.18, 0.4, 0.09]; let t0 = P.s08 + 0.55, k = 0;
    while (t0 < sc('barrier').end - 0.4 && k < 40) { const tr = hillTrial(Math.max(0.004, energyAtTail(Q[k % Q.length], P.T(t0)))); P.trials.push({...tr, t0, sampled: true}); t0 += Math.max(0.95, tr.T + (tr.pass ? tr.tunnel + 0.35 : 0.12)); k++; } }
  P.trialAt = t => { for (let i = P.trials.length - 1; i >= 0; i--) if (t >= P.trials[i].t0) return P.trials[i]; return null; };
  P.bounces = P.trials.filter(tr => !tr.pass).map(tr => +(tr.t0 + tr.tTurn).toFixed(4));
  P.passes = P.trials.filter(tr => tr.pass).map(tr => +(tr.t0 + tr.tTurn + tr.tunnel).toFixed(4));
  { const n = Math.ceil((sc('barrier').end - P.s08) * 60) + 2, PH = new Float64Array(n); for (let i = 1; i < n; i++) PH[i] = PH[i - 1] + Math.sqrt(P.T(P.s08 + (i - 0.5) / 60) / 1e8) / 60;
    P.phase = t => { if (t <= P.s08) return (t - P.s08) * 0.1; const u = clamp((t - P.s08) * 60, 0, n - 1.001), i = Math.floor(u); return lerp(PH[i], PH[i + 1], u - i); }; }
  P.boxFus = poissonTimes(t => 3.0 * relRate(P.T(t)), P.s08 + 0.3, sc('barrier').end - 0.25);
  P.thermo = at(A.heat8) - 0.1; P.thermoName = at(A.thermo8) - 0.1;
  // ---- fuel
  P.nH = at(A.h9) - 0.1; P.sib = at(A.sib9) - 0.1; P.nD = at(A.d9) - 0.1; P.nT = at(A.t9) - 0.1;
  P.move = at(A.two10) - 0.25; P.hit = at(A.he10) - 0.05; P.nLbl = at(A.n10) - 0.05; P.eLbl = at(A.big10) - 0.1; P.sumLbl = at(A.out10) - 0.05;
  // ---- trigger
  P.curve = sc('trigger').start + 0.15; P.therm = at(A.temp11) - 0.1; P.flame = at(A.instant11) - 0.05; P.fis = at(A.abomb11) - 0.1; P.fus = at(A.hbomb11) - 0.1; P.trig = at(A.trig11) - 0.1;
  P.blocks = at('s12') - 0.55; P.stage1 = at(A.burst12) - 0.02; P.heatArrow = at(A.heat12) - 0.1; P.press = at(A.press12) - 0.1; P.dens = at(A.squeeze12) - 0.05; P.hot = at(A.hot12) - 0.05;
  P.rho = t => 1 + 0.6 * smooth((t - P.dens) / 0.8);
  P.T2 = t => 10 ** lerp(6, Math.log10(BURN.T1), smooth((t - P.hot) / 0.9));
  { const N0 = 40, t0 = P.hot, t1 = sc('trigger').end - 0.1, ev = [], tab = []; let N = 0.5, prev = 0;
    for (let t = t0; t < t1; t += 1 / 240) { const f = Math.max(0, 1 - N / N0), R = 10 * P.rho(t) ** 2 * relRate(P.T2(t)) * f * f; N += R / 240; tab.push([t, N - 0.5]); if (Math.floor(N) > prev) { prev = Math.floor(N); ev.push(+t.toFixed(4)); } }
    P.burnT = ev; P.burnN0 = N0; P.burned = t => { if (t <= t0) return 0; const i = Math.min(tab.length - 1, Math.floor((t - t0) * 240)); return tab[i][1] / N0; }; }
  P.burst = P.burnT.length > 3 ? P.burnT[2] : P.hot + 0.8;
  // ---- tests
  P.locator = at(A.pacific) - 0.1; P.zoom = [at(A.island13) - 0.3, at(A.island13) + 0.9]; P.mike = at(A.test13) - 0.02; P.gone = at(A.gone13) - 0.1; P.whole = at(A.whole13) - 0.05;
  P.map2 = at('s14') - 0.6; P.bikini = at(A.bikini) - 0.1; P.bravo = at(A.test14) - 0.05; P.plume = at(A.fallout14) - 0.1; P.km100 = at(A.km100) - 0.1; P.boat = at(A.boat14) - 0.1; P.reach = at(A.fly14) + 0.1; P.crew = at(A.crew14) - 0.1;
  // ---- compare
  P.cmpChem = at(A.mass15) - 0.1; P.cmpFis = at(A.out15) - 0.1; P.cmpFus = at(A.fus15) - 0.1; P.four = at(A.four15) - 0.1;
  P.fuelK = [at(A.fuel15) - 0.1, at(A.much15) - 0.1, at(A.power15) - 0.05];
  // ---- myth
  P.ignite = at(A.burn16) - 0.05; P.eqQ = at(A.same16) - 0.1; P.no = at(A.no17) - 0.05; P.chemIn = at(A.h17) - 0.15; P.swap = at(A.elec17) + 0.1; P.chemLbl = at(A.chem17) - 0.1;
  P.nucIn = at(A.hb17) - 0.15; P.merge17 = at(A.merge17) + 0.05;
  P.bars18 = at(A.same18) - 0.1; P.chem18 = at(A.h18) - 0.25; P.fus18 = Math.min(at(A.e18) - 0.25, at(A.mil18) - 0.1 - (Math.log10(EPM.fus) - 7) * DEC_S); P.mil = at(A.mil18) - 0.1;
  // ---- close
  P.treaty = at(A.y1963) - 0.15; P.icons = at(A.atm19) - 0.1; P.ban = [0, 1, 2].map(k => at(A.ban19) - 0.05 + 0.2 * k); P.tok = at(A.now19) - 0.25; P.slow = at(A.slow19) - 0.1; P.power = at(A.power19) - 0.1;
  P.tokFus = []; for (let tt = P.slow + 0.3; tt < at(A.hb20) - 0.4; tt += 0.72 + 0.25 * rand(tt * 3.1)) P.tokFus.push(+tt.toFixed(3));
  P.poster = at(A.hb20) - 0.1;
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Render infrastructure: additive float buffer (glow), noise texture, star field, background
// =====================================================================================================
const TEXN = 256;
const TEX = (() => {
  const n = TEXN, out = new Float32Array(n * n), R = rng(20261106);
  let amp = 1;
  for (let cells = 8; cells <= 128; cells *= 2, amp *= 0.55) {
    const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n * cells, v = y / n * cells, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv), i1 = (i0 + 1) % cells, j1 = (j0 + 1) % cells;
      out[y * n + x] += amp * lerp(lerp(g[j0 * cells + i0], g[j0 * cells + i1], su), lerp(g[j1 * cells + i0], g[j1 * cells + i1], su), sv);
    }
  }
  let lo = Infinity, hi = -Infinity; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
})();
function tex(u, v) {
  u -= Math.floor(u / TEXN) * TEXN; v -= Math.floor(v / TEXN) * TEXN;
  const i0 = u | 0, j0 = v | 0, fu = u - i0, fv = v - j0, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  return (TEX[j0 * TEXN + i0] * (1 - fu) + TEX[j0 * TEXN + i1] * fu) * (1 - fv) + (TEX[j1 * TEXN + i0] * (1 - fu) + TEX[j1 * TEXN + i1] * fu) * fv;
}
class Glow {
  constructor(W = 1080, H = 1920, s = 0.5) {
    Object.assign(this, {s, w: Math.ceil(W * s), h: Math.ceil(H * s)});
    const n = this.w * this.h; this.R = new Float32Array(n); this.G = new Float32Array(n); this.B = new Float32Array(n);
    this.cv = createCanvas(this.w, this.h); this.cc = this.cv.getContext('2d'); this.img = this.cc.createImageData(this.w, this.h);
    this.sm = createCanvas(Math.ceil(this.w / 4), Math.ceil(this.h / 4)); this.smc = this.sm.getContext('2d');
    this.d = [this.w, this.h, 0, 0]; this.prev = [0, 0, 0, 0];
  }
  begin() {
    const [x0, y0, x1, y1] = this.prev;
    for (let y = y0; y < y1; y++) { const o = y * this.w; this.R.fill(0, o + x0, o + x1); this.G.fill(0, o + x0, o + x1); this.B.fill(0, o + x0, o + x1); }
    if (x1 > x0 && y1 > y0) this.cc.clearRect(Math.max(0, x0 - 2), Math.max(0, y0 - 2), x1 - x0 + 4, y1 - y0 + 4);
    this.d = [this.w, this.h, 0, 0]; return this;
  }
  region(X0, Y0, X1, Y1) {
    const s = this.s, a = Math.max(0, Math.floor(X0 * s)), b = Math.max(0, Math.floor(Y0 * s)), c = Math.min(this.w, Math.ceil(X1 * s)), d = Math.min(this.h, Math.ceil(Y1 * s));
    if (c <= a || d <= b) return null;
    const D = this.d; D[0] = Math.min(D[0], a); D[1] = Math.min(D[1], b); D[2] = Math.max(D[2], c); D[3] = Math.max(D[3], d);
    return [a, b, c, d];
  }
  each(X0, Y0, X1, Y1, fn) {
    const r = this.region(X0, Y0, X1, Y1); if (!r) return; const inv = 1 / this.s, w = this.w;
    for (let by = r[1]; by < r[3]; by++) { const sy = (by + 0.5) * inv, o = by * w; for (let bx = r[0]; bx < r[2]; bx++) fn((bx + 0.5) * inv, sy, o + bx); }
  }
  /** gaussian splat (screen px radius = 2σ) */
  splat(x, y, rad, col, I) {
    if (I <= 0 || rad <= 0) return;
    const s2 = 2 * (rad / 2) ** 2, {R, G, B} = this;
    this.each(x - rad * 1.6, y - rad * 1.6, x + rad * 1.6, y + rad * 1.6, (sx, sy, i) => { const k = I * Math.exp(-((sx - x) ** 2 + (sy - y) ** 2) / s2); R[i] += k * col[0]; G[i] += k * col[1]; B[i] += k * col[2]; });
  }
  flush(stage, {gain = 1.3, bloom = 0.55, alpha = 1, cross = 0.1} = {}) {
    const [x0, y0, x1, y1] = this.d; this.prev = [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
    if (x1 <= x0 || y1 <= y0 || alpha <= 0) return;
    const {w, R, G, B, img} = this, dd = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, j = i * 4, l = (R[i] + G[i] + B[i]) * cross;
      dd[j] = 255 * (1 - Math.exp(-(R[i] + l) * gain)); dd[j + 1] = 255 * (1 - Math.exp(-(G[i] + l) * gain)); dd[j + 2] = 255 * (1 - Math.exp(-(B[i] + l) * gain)); dd[j + 3] = 255;
    }
    this.cc.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    const c = stage.ctx, inv = 1 / this.s;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha; c.imageSmoothingEnabled = true;
    c.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * inv, y0 * inv, (x1 - x0) * inv, (y1 - y0) * inv);
    if (bloom > 0) {
      const sm = this.sm, sc = this.smc, q = 0.25;
      sc.globalCompositeOperation = 'copy'; sc.filter = 'none';
      sc.clearRect(0, 0, sm.width, sm.height);
      sc.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
      sc.filter = 'blur(5px)'; sc.drawImage(sm, 0, 0); sc.filter = 'none';
      c.globalAlpha = alpha * bloom; c.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, sm.width / q * inv, sm.height / q * inv);
    }
    c.restore();
  }
}
let GB = null;
const glowBuf = () => (GB ||= new Glow()).begin();
const SUNC = [1.0, 0.74, 0.42], HOTC = [1.0, 0.86, 0.62], FUSC = [1.0, 0.8, 0.45], PLASC = [1.0, 0.55, 0.62];
/** limb-darkened, granulated ball of hot gas (sun, fireball) into the glow buffer. o.ground: clip the body below this y */
function hotBall(gb, t, cx, cy, R, {I = 1, halo = 1, col = SUNC, spin = 0.05, seed = 0, ground = null, gran = 0.75, gscale = 1} = {}) {
  if (R <= 0.5 || I <= 0) return;
  const limbC = [col[0] * 1.08, col[1] * 0.78, col[2] * 0.62];
  const ext = R * (1 + 0.9 * halo + 0.15), {R: BR, G: BG, B: BB} = gb, invR = 1 / R, ph = seed * 91, dmax = ext * invR;
  const aa = 1.6 * invR, e2 = (1 + aa) * (1 + aa);
  gb.each(cx - ext, cy - ext, cx + ext, cy + ext, (x, y, i) => {
    const dx = (x - cx) * invR, dy = (y - cy) * invR, d2 = dx * dx + dy * dy;
    let r = 0, g = 0, b = 0, cov = 0;
    const below = ground != null && y > ground;
    if (d2 < e2 && !below) {
      const d = Math.sqrt(d2); cov = clamp((1 + aa - d) / (2 * aa));
      const mu = Math.sqrt(Math.max(0, 1 - Math.min(1, d2))), lon = Math.atan2(dx, Math.max(mu, 0.02)) + spin * t, lat = Math.asin(clamp(dy, -1, 1));
      const u = lon / TAU * 2048 * gscale + ph, v = (lat / Math.PI + 0.5) * 1024 * gscale;
      const gr = 0.5 * tex(u + t * 2.2, v + t * 1.3) + 0.3 * tex(u * 2.1 - t * 3.1 + 40, v * 2.1 + t * 1.7) + 0.2 * tex(u * 0.35 + 17, v * 0.35 - t * 0.4);
      const k = I * 1.08 * (0.3 + 0.7 * mu) * (1 + gran * (gr - 0.5) * (0.3 + 0.7 * mu)) * cov, m = mu ** 0.6;
      r = k * lerp(limbC[0], col[0], m); g = k * lerp(limbC[1], col[1], m); b = k * lerp(limbC[2], col[2], m);
    }
    if (cov < 1) {
      const d = Math.sqrt(d2), e = Math.max(0, d - 1), h = (1 - cov) * I * halo * (0.32 * Math.exp(-e / 0.05) + 0.14 * Math.exp(-e / 0.3) + 0.035 / Math.max(1, d2)) * smooth((dmax - d) / (0.45 * (dmax - 1))) * (below ? 0.35 : 1);
      r += h * col[0]; g += h * col[1]; b += h * col[2];
    }
    BR[i] += r; BG[i] += g; BB[i] += b;
  });
}
const FIELD = (() => { const R = rng(1961), s = []; for (let i = 0; i < 220; i++) s.push({x: R() * 1080, y: R() * 1920, r: 0.5 + 1.4 * R() ** 3, a: 0.1 + 0.45 * R() ** 2, c: R()}); return s; })();
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.35, H); g.addColorStop(0, '#08112A'); g.addColorStop(1, T.deep);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  glow(c, 540, 820, 900, '#2B3E78', 0.07);
  for (const s of FIELD) { c.globalAlpha = s.a * 0.5; circle(c, s.x, s.y, s.r, s.c > 0.8 ? '#FFE3C8' : '#DDE6FF'); }
  c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H * 0.44, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
export const PAL = {p: '#FF8A65', pShade: '#5A1E10', n: '#B4C3D8', nShade: '#26324A', fus: '#FFC15A', fusHot: '#FFE7A8', fis: '#7CC4FF', chem: '#8FD8C0',
  answer: '#FF7A59', warm: '#FFB36A', light: '#FFE2A0', cool: '#9FB8E8', grid: '#2A3A62', sea: '#0C2148', sea2: '#08183A', land: '#C9B98F', reef: '#5FA7C9', fall: '#C9A26A', bad: '#FF8A7A'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
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
function panel(c, T, x, y, w, h, a = 0.8, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
/** Korean number: 15000 → "1만 5천", 5e7 → "5천만", 1.04e7 → "1,040만" */
export function koNum(n) {
  if (n >= 1e8) { const e = n / 1e8; return (Number.isInteger(e) ? e : +e.toFixed(1)) + '억'; }
  if (n >= 1e4) { const m = Math.floor(n / 1e4); if (m % 1000 === 0) return `${m / 1000}천만`; if (m >= 10) return `${Math.round(n / 1e4).toLocaleString('en-US')}만`; const r = Math.round((n - m * 1e4) / 1e3); return r ? `${m}만 ${r}천` : `${m}만`; }
  return Math.round(n).toLocaleString('en-US');
}
export const fmtTemp = T => (T >= 1e8 ? `${+(T / 1e8).toFixed(1)}억 도` : `${Math.round(T / 1e4).toLocaleString('en-US')}만 도`);
const sig2 = v => { const p = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1340, 0, 1620);
  g.addColorStop(0, 'rgba(2,5,14,0)'); g.addColorStop(0.35, `rgba(2,5,14,${0.6 * a})`); g.addColorStop(0.75, `rgba(2,5,14,${0.6 * a})`); g.addColorStop(1, 'rgba(2,5,14,0)');
  c.fillStyle = g; c.fillRect(0, 1340, 1080, 280);
}
const sup = n => String(n).replace(/-/g, '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);

// ---- nuclei ----
function nucleon(c, x, y, r, isP, a = 1) {
  sphere(c, x, y, r, isP ? PAL.p : PAL.n, {alpha: a, shade: isP ? PAL.pShade : PAL.nShade, light: '#FFF7EE'});
  if (isP && r >= 10) withAlpha(c, a * 0.85, () => { const s = r * 0.38, w = Math.max(1.5, r * 0.13); line(c, [[x - s, y], [x + s, y]], '#FFF3EA', w, {cap: 'butt'}); line(c, [[x, y - s], [x, y + s]], '#FFF3EA', w, {cap: 'butt'}); });
}
const PACK = {1: [[0, 0, 0]], 2: [[-0.52, 0.06, 0], [0.52, -0.06, 0.2]], 3: [[-0.55, 0.32, 0], [0.55, 0.32, 0.1], [0, -0.6, 0.2]],
  4: [[-0.5, -0.42, -0.3], [0.5, -0.42, 0.1], [-0.5, 0.42, 0.25], [0.5, 0.42, -0.1]], 5: [[-0.6, -0.4, -0.2], [0.6, -0.4, 0], [-0.6, 0.45, 0.1], [0.6, 0.45, -0.1], [0, 0, 0.4]]};
/** a cluster of nP protons and nN neutrons centred at (x, y); r = nucleon radius. o: {rot, a, jig, t, order} */
function nucleus(c, x, y, r, nP, nN, o = {}) {
  const A = nP + nN, pk = PACK[Math.min(5, A)] || PACK[1], rot = o.rot ?? 0, a = o.a ?? 1, jig = o.jig ?? 0, t = o.t ?? 0;
  const kinds = o.order || [...Array(A)].map((_, i) => (A === 4 ? i === 0 || i === 3 : i < nP));
  const items = pk.slice(0, A).map(([px, py, pz], i) => {
    const cr = Math.cos(rot), sr = Math.sin(rot), qx = px * cr - py * sr, qy = px * sr + py * cr;
    const jx = jig * Math.sin(t * 9 + i * 2.1), jy = jig * Math.cos(t * 8 + i * 1.7);
    return {x: x + (qx + jx) * r * 1.08, y: y + (qy + jy) * r * 1.08, z: pz, p: kinds[i]};
  }).sort((u, v) => u.z - v.z);
  for (const it of items) nucleon(c, it.x, it.y, r, it.p, a);
}
/** a short-lived fusion flash on the canvas (additive): ring + core */
function flash(c, x, y, q, R = 60, col = PAL.fusHot) {
  if (q <= 0 || q > 1) return; const k = 1 - q;
  c.save(); c.globalCompositeOperation = 'lighter';
  glow(c, x, y, R * (0.6 + 0.8 * q), col, 0.85 * k * k);
  ring(c, x, y, R * (0.3 + 1.1 * easeOut(q)), rgba(col, 0.7 * k), 2.5);
  c.restore();
}

// =====================================================================================================
// The sky picture: atmosphere layers, mushroom cloud (puffs on a toroidal roll), fireball, ground and city lights
// =====================================================================================================
const CAP_PUFFS = (() => { const R = rng(64), out = []; for (let i = 0; i < 190; i++) { const s = i < 70 ? -1 : i < 140 ? 1 : 0; out.push({s, th: R() * TAU, rho: 0.3 + 0.7 * Math.sqrt(R()), sz: 0.22 + 0.2 * R(), d: R(), u: R(), v: R(), j: R()}); } return out.sort((p, q) => p.d - q.d); })();
const STEM_PUFFS = (() => { const R = rng(12), out = []; for (let i = 0; i < 70; i++) out.push({f: i / 70 + 0.008 * R(), x: R() - 0.5, sz: 0.5 + 0.4 * R(), d: R(), j: R()}); return out.sort((p, q) => p.d - q.d); })();
const SKIRT_PUFFS = (() => { const R = rng(31), out = []; for (let i = 0; i < 22; i++) { const s = R() < 0.5 ? -1 : 1; out.push({x: s * (3 + 12 * R() ** 1.3), z: 0.3 + 2.2 * R(), sz: 1.6 + 1.8 * R(), d: R()}); } return out.sort((p, q) => p.d - q.d); })();
const CITY = (() => { const R = rng(7), out = []; for (const [x0, x1] of [[150, 330], [745, 930]]) for (let i = 0; i < 70; i++) { const u = R(); out.push({x: lerp(x0, x1, u), y: GROUND_Y + 3 + 7 * R() ** 2 * (1 - Math.abs(u - 0.5)), r: 0.7 + 1.1 * R() ** 2, a: 0.35 + 0.6 * R(), ph: R() * TAU, warm: R() < 0.75}); } return out; })();
const SKY_STARS = (() => { const R = rng(85), s = []; for (let i = 0; i < 150; i++) s.push({x: R() * 1080, y: 120 + R() * (yKm(28) - 120), r: 0.5 + 1.2 * R() ** 3, a: 0.15 + 0.5 * R() ** 2}); return s; })();
/** one cloud puff: flat core, soft edge (the shading comes from the puff colour and the texture pass) */
function puff(c, x, y, r, col, a) {
  if (r <= 0.5 || a <= 0.003) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.68, rgba(col, a * 0.9)); g.addColorStop(0.86, rgba(col, a * 0.4)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
// cloud layer: puffs are drawn into an offscreen canvas, then a billow texture is laid on top (source-atop: only on cloud pixels)
let CLV = null, NOISE = null;
function cloudCanvas() {
  if (!CLV) { CLV = createCanvas(1080, GROUND_Y + 40); }
  if (!NOISE) {
    NOISE = createCanvas(TEXN, TEXN); const nc = NOISE.getContext('2d'), im = nc.createImageData(TEXN, TEXN);
    for (let i = 0; i < TEXN * TEXN; i++) { const v = TEX[i], j = i * 4;
      if (v > 0.5) { im.data[j] = 255; im.data[j + 1] = 244; im.data[j + 2] = 232; im.data[j + 3] = Math.round(255 * clamp((v - 0.5) * 1.1)); }
      else { im.data[j] = 8; im.data[j + 1] = 10; im.data[j + 2] = 24; im.data[j + 3] = Math.round(255 * clamp((0.5 - v) * 1.5)); } }
    nc.putImageData(im, 0, 0);
  }
  return CLV;
}
const CL_DARK = '#232C45', CL_LIT = '#B4BDD0', CL_WARM = '#E98F58', CL_HOT = '#FFD08A';
/** cloud state S (cloudState), roll clock tr (s). o: {a} */
function drawCloud(stage, S, tr, o = {}) {
  const cv = cloudCanvas(), c = cv.getContext('2d'), a = o.a ?? 1, X = km => CLOUD_X + km * KM, Y = yKm;
  if (a <= 0) return;
  const stemTop = S.zc - 0.5 * S.b, half = S.a + 8, x0 = Math.max(0, Math.floor(X(-half) - 20)), x1 = Math.min(1080, Math.ceil(X(half) + 20)), y0 = Math.max(0, Math.floor(Y(S.H + 3))), y1 = GROUND_Y + 30;
  c.clearRect(x0, y0, x1 - x0, y1 - y0);
  // skirt (dust raised at the base)
  const sk = smooth((S.tau - 0.6) / 2.5);
  if (sk > 0) for (const p of SKIRT_PUFFS) puff(c, X(p.x * (0.6 + 0.4 * sk)), Y(p.z), p.sz * KM * (0.7 + 0.3 * sk), mix(CL_DARK, '#6A5A5C', 0.35 + 0.5 * S.warm), 0.55 * sk);
  // stem: puffs rising along a column that narrows upward
  if (stemTop > 0.6) for (const p of STEM_PUFFS) {
    const f = (p.f + 0.035 * tr) % 1, z = f * stemTop, w = lerp(3.9, 2.9, f) + 3.4 * Math.exp(-z / 2.2);
    const lit = 0.3 + 0.3 * f, warmK = S.warm * (0.55 + 0.45 * (1 - f)) * (0.6 + 0.4 * p.j);
    const col = mix(mix(CL_DARK, CL_LIT, lit + 0.12 * (p.x < 0 ? 1 : -1)), CL_WARM, 0.6 * warmK);
    puff(c, X(p.x * w * 1.0), Y(z), (0.55 + 0.45 * p.sz) * w * KM, col, 0.7 * smooth(z / 1.2) * smooth((stemTop - z) / 1.5 + 0.6));
  }
  // cap: two counter-rotating rolls (rising in the middle, sinking at the rim) + a dome on top
  const rx = 0.5 * S.a, rz = 0.86 * S.b;
  for (const p of CAP_PUFFS) {
    let x, z;
    if (p.s) { const th = p.th - p.s * 0.3 * tr; x = p.s * 0.5 * S.a + p.s * rx * p.rho * Math.cos(th); z = S.zc + rz * p.rho * Math.sin(th); }
    else { x = (p.u - 0.5) * 1.5 * S.a * p.rho; z = S.zc + S.b * (-0.1 + 0.95 * p.v) + 0.4 * Math.sin(tr * 0.4 + p.j * 6); }
    const relZ = clamp((z - (S.zc - S.b)) / (2 * S.b)), side = clamp(0.5 - x / (2.4 * S.a));
    let col = mix(CL_DARK, CL_LIT, 0.16 + 0.62 * relZ ** 0.8 + 0.14 * (side - 0.5) + 0.08 * (p.d - 0.5));
    col = mix(col, CL_WARM, clamp(S.warm * (1 - relZ) ** 1.4 * 0.95 * (0.6 + 0.4 * p.j)));
    col = mix(col, CL_HOT, clamp(S.Lf * 1.15 * (0.75 + 0.25 * (1 - relZ))));
    puff(c, X(x), Y(z), p.sz * Math.max(S.b, 0.5 * S.a) * KM * 1.1, col, 0.8);
  }
  // billow texture (only where the cloud is), drifting upward with the convection
  c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.62;
  const k = 1.5 * Math.max(0.6, S.b / 9.5), off = (tr * 9) % (TEXN * k);
  for (let yy = y0 - (TEXN * k - (off % (TEXN * k))); yy < y1; yy += TEXN * k) for (let xx = x0 - 30; xx < x1; xx += TEXN * k) c.drawImage(NOISE, xx, yy, TEXN * k, TEXN * k);
  c.restore();
  const m = stage.ctx; m.save(); m.globalAlpha *= a; m.drawImage(cv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); m.restore();
}
/** full sky picture. o: {lines (layer-line alpha), poster (warm base dome), cityA} */
function skyPicture(stage, t, S, tr, o = {}) {
  const c = stage.ctx;
  const g = c.createLinearGradient(0, 0, 0, GROUND_Y); g.addColorStop(0, '#02060F'); g.addColorStop(0.55, '#07112A'); g.addColorStop(0.86, '#0E1C3D'); g.addColorStop(1, '#1B2B50');
  c.fillStyle = g; c.fillRect(0, 0, 1080, GROUND_Y);
  for (const s of SKY_STARS) { c.globalAlpha = s.a * (o.stars ?? 1); circle(c, s.x, s.y, s.r, '#DCE5FF'); } c.globalAlpha = 1;
  // airglow-ish haze in the lower layer, and the layer boundaries (thin lines)
  const hz = c.createLinearGradient(0, yKm(14), 0, GROUND_Y); hz.addColorStop(0, 'rgba(60,90,150,0)'); hz.addColorStop(1, 'rgba(60,90,150,0.12)'); c.fillStyle = hz; c.fillRect(0, yKm(14), 1080, GROUND_Y - yKm(14));
  const la = o.lines ?? 1;
  if (la > 0) for (const L of LAYERS) line(c, [[0, yKm(L.km)], [1080, yKm(L.km)]], rgba('#A9C0EE', 0.26 * la), 1.5);
  const base = o.poster ?? 0;
  // the warm light of the fireball on the lower sky
  const Lsky = Math.max(S.Lf * 0.9, base * 0.75);
  if (Lsky > 0.01) glow(c, CLOUD_X, GROUND_Y - 40, 560, '#FF9A50', 0.16 * Lsky);
  drawCloud(stage, S, tr, {a: o.cloudA ?? 1});
  // incandescent light: young fireball (rising), or the poster's glowing base dome
  const gb = glowBuf();
  if (S.Lf > 0.02) hotBall(gb, t, CLOUD_X, yKm(S.zc), S.rf * KM * (S.zc > 0 ? 1 : 1), {I: 1.25 * S.Lf, halo: 1.6, col: HOTC, seed: 3, ground: GROUND_Y, gran: 0.6, gscale: 0.6});
  if (base > 0) { hotBall(gb, t, CLOUD_X, GROUND_Y + 4, 8.5 * KM, {I: 1.05 * base, halo: 2.4, col: HOTC, seed: 5, ground: GROUND_Y, gran: 0.65, gscale: 0.6}); gb.splat(CLOUD_X, GROUND_Y - 120, 260, [1, 0.5, 0.2], 0.12 * base); }
  gb.flush(stage, {gain: 1.25, bloom: 0.6, cross: 0.08});
  // sea below the horizon, with the reflection of the light (a column of glints, brighter near the horizon)
  const gg = c.createLinearGradient(0, GROUND_Y, 0, 1920); gg.addColorStop(0, '#0C1634'); gg.addColorStop(0.35, '#060C20'); gg.addColorStop(1, '#03060F');
  c.fillStyle = gg; c.fillRect(0, GROUND_Y, 1080, 1920 - GROUND_Y);
  const Lg = Math.max(S.Lf, base * 0.9);
  if (Lg > 0.01) {
    c.save(); c.translate(CLOUD_X, GROUND_Y + 6); c.scale(1, 0.12); glow(c, 0, 0, 640, '#FF9A50', 0.45 * Lg); c.restore();
    c.save(); c.translate(CLOUD_X, GROUND_Y + 150); c.scale(0.28, 1); glow(c, 0, 0, 420, '#FFB36A', 0.22 * Lg); c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 46; k++) { const v = rand(k * 3.7 + 1), y = GROUND_Y + 6 + 560 * v ** 1.7, w0 = (14 + 120 * (1 - v)) * (0.5 + rand(k * 1.3 + 7)), x = CLOUD_X + (rand(k * 5.1) - 0.5) * 120 * (1 - 0.6 * v) + 10 * Math.sin(t * 0.9 + k);
      line(c, [[x - w0 / 2, y], [x + w0 / 2, y]], rgba('#FFC890', Lg * (0.32 - 0.26 * v) * (0.6 + 0.4 * Math.sin(t * 1.7 + k * 2.3))), 2, {cap: 'round'}); }
    c.restore();
  }
  line(c, [[0, GROUND_Y], [1080, GROUND_Y]], rgba('#7C8FC0', 0.35), 1.5);
  // tiny city lights on the horizon (scale)
  const ca = o.cityA ?? 1;
  if (ca > 0) { for (const p of CITY) { c.globalAlpha = ca * p.a * (0.85 + 0.15 * Math.sin(t * 2.3 + p.ph)); circle(c, p.x, p.y, p.r, p.warm ? '#FFD9A0' : '#CFE0FF'); } c.globalAlpha = 1;
    for (const x of [240, 838]) { c.save(); c.translate(x, GROUND_Y); c.scale(1, 0.25); glow(c, 0, 0, 120, '#FFC98A', 0.12 * ca); c.restore(); } }
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '가장 큰 수소폭탄의 위력은'],
  origin: ['기원 · 이름', '수소 · 水素'],
  essence: ['본질 · 태양 속', '원자핵이 합쳐지는 핵융합'],
  barrier: ['메커니즘 · 밀어냄', '양전기끼리 밀어내는 언덕'],
  fuel: ['연료 · 무거운 수소', '중수소와 삼중수소'],
  trigger: ['방아쇠 · 원자폭탄', '1억 도를 한순간에'],
  tests: ['시험 · 1952년 미국', 'Ivy Mike · 사라진 섬'],
  compare: ['비교 · 같은 질량', '핵융합 ≈ 핵분열의 4배'],
  myth: ['오해 바로잡기', '수소가 타는 것과 같을까?'],
  close: ['그 뒤', '실험 금지와 핵융합 발전'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'hook') return [[-Infinity, ...titles.hook], [P.ruler, '1961 · Tsar Bomba', '대기층을 뚫은 버섯구름']];
  if (id === 'essence') return [[-Infinity, ...titles.essence], [P.balance, '본질 · 질량', '사라진 질량 = 에너지']];
  if (id === 'barrier') return [[-Infinity, ...titles.barrier], [P.s08, '메커니즘 · 온도', '1억 도 · 열핵반응']];
  if (id === 'fuel') return [[-Infinity, ...titles.fuel], [P.move, '반응 · D + T', '헬륨 + 빠른 중성자']];
  if (id === 'trigger') return [[-Infinity, ...titles.trigger], [P.blocks, '두 단계 · 에너지 흐름', '핵분열 → 핵융합']];
  if (id === 'tests') return [[-Infinity, ...titles.tests], [P.map2, '시험 · 1954년', 'Castle Bravo · 낙진']];
  if (id === 'myth') return [[-Infinity, ...titles.myth], [P.bars18 - 0.2, '비교 · 같은 무게', '수백만 배 차이']];
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
  if (id === 'hook' && k === 0) {                                          // the poster question/answer become the header
    const aK = fadeIn(t, MORPH[1] - 0.05, 0.4) * a; head(stage, cur[1], cur[2], aK, a, '히로시마의 3천 배', a, sh);
  } else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out), id === 'hook' && k === 1 ? '히로시마의 3천 배' : '', a * (1 - out), sh);
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn, '', 0, sh);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
const POSTER_Q = {y: 930, y2: 1064, q: '가장 큰 수소폭탄의 위력은', ans: '히로시마의 3천 배'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 780, 96); ASIZE ||= fit(POSTER_Q.ans, 800, 220);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 830, 0, 1170); g2.addColorStop(0, 'rgba(2,5,14,0)'); g2.addColorStop(0.25, 'rgba(2,5,14,0.66)'); g2.addColorStop(0.78, 'rgba(2,5,14,0.66)'); g2.addColorStop(1, 'rgba(2,5,14,0)');
    c.fillStyle = g2; c.fillRect(0, 830, 1080, 340);
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
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/hydrogen-bomb/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const T of [2e7, 5e7, 1e8, 1.2e8]) h += relRate(T); for (const x of [1, 4, 8, 12, 16]) h += cloudTopKm(x) / 100;
  return `${h.toFixed(5)}@${tl.duration.toFixed(3)}/${P.trials.length}:${P.bounces.length}:${P.passes.length}/${P.boxFus.length}/${P.burnT.length}/${P.tsar0.toFixed(3)}/${P.det.toFixed(3)}`;
}
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  barrier(stage, t, p, ctx) { barrierScene(stage, t, ctx); },
  fuel(stage, t, p, ctx) { fuelScene(stage, t, ctx); },
  trigger(stage, t, p, ctx) { triggerScene(stage, t, ctx); },
  tests(stage, t, p, ctx) { testsScene(stage, t, ctx); },
  compare(stage, t, p, ctx) { compareScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → detonation replay → yield bars → atmosphere ruler
const DEC_LBL = ['1톤', '10톤', '100톤', '1천 톤', '1만 톤', '10만 톤', '100만 톤', '1천만 톤', '1억 톤'];
const HB = {y0: 1205, dy: 85, bars: [{id: 'tnt', x: 380, name: 'TNT 1톤', sub: '기준 단위', col: PAL.chem}, {id: 'hiro', x: 600, name: '히로시마', sub: '1945 · 원자폭탄', col: PAL.fis}, {id: 'tsar', x: 820, name: 'Tsar Bomba', sub: '1961 · 소련', col: PAL.fus}]};
const hbY = dec => HB.y0 - dec * HB.dy;
function yieldChart(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, 320, 0, 1345); g.addColorStop(0, 'rgba(2,5,14,0)'); g.addColorStop(0.08, 'rgba(2,5,14,0.8)'); g.addColorStop(0.95, 'rgba(2,5,14,0.8)'); g.addColorStop(1, 'rgba(2,5,14,0)');
    c.fillStyle = g; c.fillRect(0, 320, 1080, 1025);
    stage.text('위력 (TNT로 환산 · 로그 눈금)', 150, 400, {size: 26, weight: 700, color: T.muted});
    for (let d = 0; d <= 8; d++) { line(c, [[262, hbY(d)], [930, hbY(d)]], rgba(PAL.grid, d === 0 ? 1 : 0.7), d === 0 ? 2 : 1); stage.text(DEC_LBL[d], 250, hbY(d), {size: 24, color: T.muted, align: 'right'}); }
    for (const b of HB.bars) {
      const dec = Math.log10(YIELD[b.id]), t0 = b.id === 'hiro' ? P.hiro0 : b.id === 'tsar' ? P.tsar0 : P.chartIn, h = clamp((t - t0) / DEC_S, 0, dec);
      const hl = b.id === 'tsar' ? fadeIn(t, P.tsarTag, 0.3) : 0;
      stage.text(b.name, b.x, 1244, {role: 'display', size: 28, weight: 700, color: hl > 0 ? mix(T.ink, PAL.fus, hl) : T.ink, align: 'center'});
      stage.text(b.sub, b.x, 1284, {size: 24, color: T.muted, align: 'center'});
      if (b.id === 'tnt') { rect(c, b.x - 14, HB.y0 - 28, 28, 28, 3, rgba(b.col, 0.9)); continue; }
      rect(c, b.x - 58, hbY(dec), 116, HB.y0 - hbY(dec), 4, null, rgba(b.col, 0.28), 1.5);
      if (h > 0) {
        const yt = hbY(h), gr = c.createLinearGradient(0, HB.y0, 0, yt); gr.addColorStop(0, rgba(b.col, 0.35)); gr.addColorStop(1, rgba(b.col, 0.95));
        rect(c, b.x - 58, yt, 116, HB.y0 - yt, 4, gr);
        c.save(); c.globalCompositeOperation = 'lighter'; glow(c, b.x, yt, 70, b.col, 0.25 * (h < dec ? 1 : 0.4)); c.restore();
        if (h >= dec) stage.text(koNum(YIELD[b.id]) + ' 톤', b.x, yt - 30, {role: 'display', size: 30, weight: 700, color: b.col, align: 'center'});
      }
    }
    const qb = fadeIn(t, P.bracket, 0.35);
    if (qb > 0) withAlpha(c, qb, () => {
      const yh = hbY(Math.log10(YIELD.hiro)), ys = hbY(Math.log10(YIELD.tsar));
      line(c, [[658, yh], [762, yh]], rgba(PAL.answer, 0.9), 2, {dash: [7, 6]});
      line(c, [[712, yh], [712, ys]], PAL.answer, 3); line(c, [[702, ys], [722, ys]], PAL.answer, 3); line(c, [[702, yh], [722, yh]], PAL.answer, 3);
      stage.text('× 3,300', 600, (yh + ys) / 2 - 4, {role: 'display', size: 44, weight: 700, color: PAL.answer, align: 'center'});
      stage.text('히로시마의', 600, (yh + ys) / 2 - 52, {size: 24, color: T.muted, align: 'center'});
    });
  });
}
function planeIcon(c, x, y, s, col) {
  poly(c, [[x - 1.0 * s, y - 0.06 * s], [x + 0.9 * s, y - 0.08 * s], [x + 1.05 * s, y], [x + 0.9 * s, y + 0.08 * s], [x - 1.0 * s, y + 0.06 * s]], col);
  poly(c, [[x - 0.05 * s, y], [x - 0.42 * s, y + 0.55 * s], [x - 0.25 * s, y + 0.55 * s], [x + 0.25 * s, y]], col);
  poly(c, [[x - 0.05 * s, y], [x - 0.3 * s, y - 0.4 * s], [x - 0.18 * s, y - 0.4 * s], [x + 0.18 * s, y]], rgba(col, 0.7));
  poly(c, [[x - 0.85 * s, y], [x - 1.0 * s, y - 0.3 * s], [x - 0.9 * s, y - 0.3 * s], [x - 0.7 * s, y]], col);
}
function atmosphereRuler(stage, t, P, S, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    line(c, [[160, GROUND_Y], [160, yKm(85)]], rgba('#A9C0EE', 0.6), 2);
    for (let k = 0; k <= 8; k++) line(c, [[160, yKm(10 * k)], [172, yKm(10 * k)]], rgba('#A9C0EE', 0.6), 2);
    for (const L of LAYERS) { stage.text(`${L.km} km`, 925, yKm(L.km) - 18, {size: 24, weight: 700, color: rgba('#BCD0F5', 0.95), align: 'right'}); stage.text(L.name, 925, yKm(L.mid), {role: 'display', size: 30, weight: 700, color: T.muted, align: 'right'}); }
    tag(stage, '모식 · 시간 압축', 150, 340, {size: 24, color: T.muted, plate: false, align: 'left'});
    // cloud-top cursor and readout
    const yt = yKm(S.H);
    line(c, [[160, yt], [CLOUD_X - 40, yt]], rgba(PAL.answer, 0.85), 2, {dash: [8, 6]});
    circle(c, 160, yt, 5, PAL.answer);
    stage.text('구름 꼭대기', 180, yt - 66, {size: 24, weight: 700, color: T.muted});
    stage.text(`${Math.round(S.H)} km`, 180, yt - 30, {role: 'display', size: 44, weight: 700, color: PAL.answer});
    // airliner at about 10 km
    const pa = fadeIn(t, P.plane, 0.35);
    if (pa > 0) withAlpha(c, pa, () => {
      line(c, [[172, yKm(AIRLINER_KM)], [440, yKm(AIRLINER_KM)]], rgba('#DDE6FF', 0.5), 1.5, {dash: [5, 6]});
      planeIcon(c, 212, yKm(AIRLINER_KM) - 4, 30, '#E8EEFA');
      stage.text('여객기 약 10 km', 288, yKm(AIRLINER_KM) + 40, {size: 26, weight: 700, color: '#E8EEFA'});
    });
    // six airliner heights stacked
    for (let k = 0; k < 6; k++) { const q = fadeIn(t, P.segT[k], 0.12); if (q <= 0) continue;
      const y0 = yKm(10 * k) - 3, y1 = yKm(10 * k + 10 * q) + 3; line(c, [[262, y0], [262, y1]], rgba(PAL.answer, 0.95), 7, {cap: 'butt'}); }
    const sa = fadeIn(t, P.sixDone, 0.35);
    if (sa > 0) withAlpha(c, sa, () => { stage.text('10 km × 6', 288, yKm(32), {role: 'display', size: 32, weight: 700, color: PAL.answer}); stage.text('= 60 km', 288, yKm(32) + 40, {size: 26, weight: 700, color: T.muted}); });
  });
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  withAlpha(c, ef, () => {
    let S;
    if (t < P.det) { S = cloudState(POSTER_TAU, true); skyPicture(stage, t, S, POSTER_TAU + t, {poster: 1}); }
    else { S = cloudState(P.tau(t)); skyPicture(stage, t, S, P.tau(t), {}); }
    const fa = t < P.det ? 0.82 * smooth((t - P.det + 0.16) / 0.16) : 0.82 * Math.exp(-(t - P.det) / 0.34);
    if (fa > 0.003) { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(CLOUD_X, GROUND_Y - 40, 0, CLOUD_X, GROUND_Y - 40, 1250);
      g.addColorStop(0, `rgba(255,248,232,${fa})`); g.addColorStop(0.18, `rgba(255,226,170,${fa * 0.85})`); g.addColorStop(0.5, `rgba(255,160,80,${fa * 0.38})`); g.addColorStop(1, `rgba(120,60,30,0)`); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920); c.restore(); }
    if (t >= MORPH[1]) captionShade(c, fadeIn(t, 0.95, 0.4));
    const ta = fadeIn(t, P.det + 0.7, 0.4) * fadeOut(t, P.chartIn - 0.2, 0.3);
    if (ta > 0) tag(stage, 'Tsar Bomba · 1961 · 모식 재현', 540, 372, {size: 24, color: stage.theme.muted, a: ta, plate: false});
    const ca = fadeIn(t, P.chartIn, 0.4) * fadeOut(t, P.chartOut, 0.4);
    if (ca > 0) yieldChart(stage, t, P, ca);
    const ra = fadeIn(t, P.ruler, 0.45);
    if (ra > 0) atmosphereRuler(stage, t, P, S, ra);
  });
}


// ------------------------------------------------------------------ origin: hydrogène = "water maker" (H₂ + O₂ → H₂O) → 水 + 素
const ATOM = {H: {r: 16, col: '#E6ECF6'}, O: {r: 25, col: '#E0665E'}};
function atom(c, x, y, k, a = 1) { const A = ATOM[k]; withAlpha(c, a, () => { glow(c, x, y, A.r * 2.2, A.col, 0.18); sphere(c, x, y, A.r, A.col, {shade: k === 'O' ? '#4A1612' : '#3A4458'}); }); }
function bond(c, p, q, a = 1, n = 1) { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, ox = -dy / L * 4, oy = dx / L * 4;
  if (n === 2) { line(c, [[p[0] + ox, p[1] + oy], [q[0] + ox, q[1] + oy]], rgba('#C9D3E6', 0.75 * a), 3); line(c, [[p[0] - ox, p[1] - oy], [q[0] - ox, q[1] - oy]], rgba('#C9D3E6', 0.75 * a), 3); }
  else line(c, [p, q], rgba('#C9D3E6', 0.75 * a), 3); }
/** one 2H₂ + O₂ → 2H₂O event centred at (cx, cy); u < 1 approach, u = 1 reaction, u > 1 products drift to (dx, dy). Returns flash q. */
function waterReaction(c, u, cx, cy, dst, a = 1) {
  const ap = easeInOut(clamp(u)), dr = clamp(u - 1), fade = 1 - smooth((dr - 0.55) / 0.45);
  const W = (s, o) => [cx + s * 42 + o[0], cy + o[1]];                    // water centred at ±42 px
  const wA = [[-42, 0], [-42 - 26, 18], [-42 + 26, 18]], wB = [[42, 0], [42 - 26, 18], [42 + 26, 18]];
  if (u < 1) {
    const h1 = [lerp(cx - 230, cx - 68, ap), cy + 18], h2 = [lerp(cx + 230, cx + 68, ap), cy + 18];
    const o1 = [cx - 21 * lerp(1, 2, ap), lerp(cy - 170, cy, ap)], o2 = [cx + 21 * lerp(1, 2, ap), lerp(cy - 170, cy, ap)];
    withAlpha(c, a * smooth(u / 0.25), () => {
      bond(c, [h1[0] - 16, h1[1]], [h1[0] + 16, h1[1]]); bond(c, [h2[0] - 16, h2[1]], [h2[0] + 16, h2[1]]); bond(c, o1, o2, 1, 2);
      atom(c, h1[0] - 16, h1[1], 'H'); atom(c, h1[0] + 16, h1[1], 'H'); atom(c, h2[0] - 16, h2[1], 'H'); atom(c, h2[0] + 16, h2[1], 'H'); atom(c, o1[0], o1[1], 'O'); atom(c, o2[0], o2[1], 'O');
    });
    return 0;
  }
  const mv = easeIn(clamp((dr - 0.15) / 0.7)), off = [lerp(0, dst[0] - cx, mv), lerp(0, dst[1] - cy, mv)], sc = 1 - 0.5 * mv;
  withAlpha(c, a * fade, () => { for (const w of [wA, wB]) { const P = w.map(o => [cx + off[0] + (o[0] - (w === wA ? -42 : 42)) * sc + (w === wA ? -42 : 42) * (1 - 0.6 * mv), cy + off[1] + o[1] * sc]);
    bond(c, P[0], P[1], 1); bond(c, P[0], P[2], 1); atom(c, P[0][0], P[0][1], 'O'); atom(c, P[1][0], P[1][1], 'H'); atom(c, P[2][0], P[2][1], 'H'); } });
  return dr;
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    // the name card
    const la = fadeIn(t, P.lav, 0.35);
    if (la > 0) tag(stage, 'Lavoisier · 1780년대 프랑스', 540, 384, {size: 26, color: T.muted, a: la, plate: false});
    const wa = fadeIn(t, P.word, 0.4), S1 = 88, wH = stage.measure('hydro', {role: 'display', size: S1, weight: 700}), wG = stage.measure('gène', {role: 'display', size: S1, weight: 700});
    const x0 = 540 - (wH + wG) / 2;
    withAlpha(c, wa, () => {
      stage.text('hydro', x0, 470, {role: 'display', size: S1, weight: 700, color: mix(T.ink, '#7CC4FF', fadeIn(t, P.hydro, 0.3))});
      stage.text('gène', x0 + wH, 470, {role: 'display', size: S1, weight: 700, color: mix(T.ink, PAL.warm, fadeIn(t, P.gene, 0.3))});
    });
    const ha = fadeIn(t, P.hydro, 0.3), ga = fadeIn(t, P.gene, 0.3);
    if (ha > 0) withAlpha(c, ha, () => { line(c, [[x0 + 6, 528], [x0 + wH - 6, 528]], '#7CC4FF', 3); stage.text('물', x0 + wH / 2, 566, {role: 'display', size: 34, weight: 700, color: '#7CC4FF', align: 'center'}); });
    if (ga > 0) withAlpha(c, ga, () => { line(c, [[x0 + wH + 6, 528], [x0 + wH + wG - 6, 528]], PAL.warm, 3); stage.text('만드는 것', x0 + wH + wG / 2, 566, {role: 'display', size: 34, weight: 700, color: PAL.warm, align: 'center'}); });
    // the reaction that gave the name: hydrogen + oxygen → water (repeats; the drop fills)
    const st = fadeIn(t, P.hydro - 0.2, 0.4);
    if (st > 0) withAlpha(c, st, () => {
      const cx = 540, cy = 770, drop = [540, 930];
      let filled = 0;
      for (let k = 0; k < P.rx.length; k++) {
        const u = (t - (P.rx[k] - 0.9)) / 0.9; if (u < 0) continue;
        if (u < 2.1) { c.save(); c.translate(cx, cy); c.scale(1.25, 1.25); c.translate(-cx, -cy); const dr = waterReaction(c, u, cx, cy, [drop[0], cy + (drop[1] - cy) / 1.25]); c.restore(); if (u >= 1) flash(c, cx, cy, dr / 0.5, 80, '#BFE6FF'); }
        filled += smooth((u - 1.6) / 0.4);
      }
      // the drop
      const lv = filled / P.rx.length, R0 = 46;
      c.save(); c.beginPath(); c.moveTo(drop[0], drop[1] - R0 * 1.7); c.bezierCurveTo(drop[0] + R0 * 0.5, drop[1] - R0 * 0.9, drop[0] + R0, drop[1] - R0 * 0.2, drop[0] + R0, drop[1] + R0 * 0.25);
      c.arc(drop[0], drop[1] + R0 * 0.25, R0, 0, Math.PI); c.bezierCurveTo(drop[0] - R0, drop[1] - R0 * 0.2, drop[0] - R0 * 0.5, drop[1] - R0 * 0.9, drop[0], drop[1] - R0 * 1.7); c.closePath();
      c.strokeStyle = rgba('#7CC4FF', 0.8); c.lineWidth = 2.5; c.stroke(); c.clip();
      const yl = drop[1] + R0 * 1.25 - lv * R0 * 2.95; const g = c.createLinearGradient(0, yl, 0, drop[1] + R0 * 1.3); g.addColorStop(0, rgba('#7CC4FF', 0.75)); g.addColorStop(1, rgba('#2E6FB0', 0.85));
      c.fillStyle = g; c.fillRect(drop[0] - R0 - 2, yl, 2 * R0 + 4, 4 * R0); c.restore();
      stage.text('수소 + 산소 → 물', 540, 1042, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('수소가 타면 물이 생김', 540, 1086, {size: 26, color: T.muted, align: 'center'});
    });
    // the translation: 水 (물 수) + 素 (바탕 소) = 水素 · 수소
    const aa = fadeIn(t, P.arrowHan, 0.35);
    if (aa > 0) withAlpha(c, aa, () => { line(c, [[905, 480], [930, 480], [930, 1185], [905, 1185]], rgba(T.muted, 0.7), 2); arrow(c, [930, 1185], [895, 1185], rgba(T.muted, 0.9), 2, {head: 12}); stage.text('뜻을 옮김', 912, 830, {size: 24, weight: 700, color: T.muted, align: 'right'}); });
    const HY = 1185;
    const sa = fadeIn(t, P.su, 0.3), oa = fadeIn(t, P.so, 0.3), ea = fadeIn(t, P.eq, 0.35);
    if (sa > 0) withAlpha(c, sa, () => { stage.text('水', 300, HY, {size: 110, weight: 700, color: '#7CC4FF', align: 'center'}); stage.text('물 수', 300, HY + 88, {size: 28, weight: 700, color: T.muted, align: 'center'}); });
    if (oa > 0) withAlpha(c, oa, () => { stage.text('+', 410, HY, {role: 'display', size: 56, color: T.muted, align: 'center'}); stage.text('素', 520, HY, {size: 110, weight: 700, color: PAL.warm, align: 'center'}); stage.text('바탕 소', 520, HY + 88, {size: 28, weight: 700, color: T.muted, align: 'center'}); });
    if (ea > 0) withAlpha(c, ea, () => { stage.text('=', 630, HY, {role: 'display', size: 56, color: T.muted, align: 'center'}); stage.text('수소', 770, HY, {role: 'display', size: 96, weight: 700, color: T.ink, align: 'center'}); stage.text('水素', 770, HY + 88, {size: 28, weight: 700, color: T.muted, align: 'center'}); });
  });
}

// ------------------------------------------------------------------ essence: the Sun's core (4 protons → helium + light), then the mass balance
const SUN = {x: 540, y: 600, R: 170}, LENS = {x: 540, y: 1070, R: 230};
const CORE_P = (() => { const R = rng(55), o = []; for (let i = 0; i < 14; i++) o.push({x: (R() - 0.5) * 1.6, y: (R() - 0.5) * 1.6, ax: 0.18 + 0.2 * R(), ay: 0.16 + 0.2 * R(), fx: 0.7 + 0.9 * R(), fy: 0.6 + 0.9 * R(), ph: R() * TAU}); return o; })();
const coreP = (p, t) => [clamp(p.x + p.ax * Math.sin(p.fx * t + p.ph), -0.85, 0.85), clamp(p.y + p.ay * Math.cos(p.fy * t + p.ph * 1.3), -0.85, 0.85)];
function photons(c, x, y, q, n = 8, R = 150, col = PAL.light, seed = 0) {
  if (q <= 0 || q >= 1) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < n; k++) { const ang = (k + 0.5 * rand(seed + k)) / n * TAU, r0 = 18 + R * q, r1 = r0 + 46, pts = [];
    for (let i = 0; i <= 18; i++) { const r = lerp(r0, r1, i / 18), w = 5 * Math.sin(i / 18 * TAU * 2 - q * 20); pts.push([x + Math.cos(ang) * r - Math.sin(ang) * w, y + Math.sin(ang) * r + Math.cos(ang) * w]); }
    line(c, pts, rgba(col, 0.85 * (1 - q)), 2.5); }
  c.restore();
}
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const sh = smooth((t - P.balance) / 0.8), sy = lerp(SUN.y, 520, sh), sR = lerp(SUN.R, 115, sh);
    const gb = glowBuf(); hotBall(gb, t, SUN.x, sy, sR, {I: 1.0, halo: 0.9, col: SUNC, seed: 2, spin: 0.05}); gb.flush(stage, {gain: 1.3, bloom: 0.5, cross: 0.1});
    stage.text('태양', SUN.x - sR - 40, sy - sR + 10, {role: 'display', size: 34, weight: 700, color: PAL.light, align: 'right'});
    const ca = fadeIn(t, P.core, 0.4), la = ca * fadeOut(t, P.balance, 0.4);
    if (ca > 0) withAlpha(c, ca * (1 - sh), () => { ring(c, SUN.x, SUN.y, 34, rgba('#FFFFFF', 0.9), 2.5); stage.text('중심', SUN.x + SUN.R + 34, SUN.y, {size: 26, weight: 700, color: PAL.light}); line(c, [[SUN.x + 36, SUN.y], [SUN.x + SUN.R + 24, SUN.y]], rgba('#FFFFFF', 0.6), 1.5); });
    if (la > 0) withAlpha(c, la, () => {
      // magnifier lines from the core to the lens
      const g = Math.asin(34 / (LENS.y - SUN.y)) * 0 + 1;
      line(c, [[SUN.x - 34, SUN.y + 6], [LENS.x - LENS.R * 0.97, LENS.y - LENS.R * 0.25]], rgba('#FFFFFF', 0.35 * g), 1.5);
      line(c, [[SUN.x + 34, SUN.y + 6], [LENS.x + LENS.R * 0.97, LENS.y - LENS.R * 0.25]], rgba('#FFFFFF', 0.35 * g), 1.5);
      const q = easeOut(clamp((t - P.core) / 0.6));
      c.save(); c.beginPath(); c.arc(LENS.x, LENS.y, LENS.R * q, 0, TAU); c.clip();
      const bg = c.createRadialGradient(LENS.x, LENS.y, 0, LENS.x, LENS.y, LENS.R); bg.addColorStop(0, '#5A2410'); bg.addColorStop(1, '#2A0E08'); c.fillStyle = bg; c.fillRect(LENS.x - LENS.R, LENS.y - LENS.R, 2 * LENS.R, 2 * LENS.R);
      // protons moving in the hot core; four of them converge and fuse at P.merge5
      const mv = clamp((t - (P.merge5 - 0.85)) / 0.85), gone = t >= P.merge5, sel = [0, 3, 6, 9];
      const he = [LENS.x, LENS.y - 10];
      CORE_P.forEach((p, i) => {
        if (gone && sel.includes(i)) return;
        let [u, v] = coreP(p, t); let x = LENS.x + u * LENS.R, y = LENS.y + v * LENS.R;
        if (sel.includes(i) && mv > 0) { const k = sel.indexOf(i), tx = he[0] + Math.cos(k * TAU / 4 + 0.4) * 20, ty = he[1] + Math.sin(k * TAU / 4 + 0.4) * 20, e = easeIn(mv); x = lerp(x, tx, e); y = lerp(y, ty, e); }
        nucleon(c, x, y, 13, true, fadeIn(t, P.core + 0.2, 0.4));
      });
      if (gone) {
        const age = t - P.merge5, drift = Math.min(age, 6) * 9;
        nucleus(c, he[0] - drift * 0.6, he[1] + drift, 15, 2, 2, {rot: 0.4 + age * 0.4, t, jig: 0.04});
        flash(c, he[0], he[1], age / 0.7, 110);
        photons(c, he[0], he[1], (t - P.light5) / 1.4, 9, 170, PAL.light, 3);
        if (t > P.light5 + 1.2) photons(c, he[0], he[1], (t - P.light5 - 1.2) / 1.4, 9, 170, PAL.light, 9);
      }
      for (let k = 1; k < P.sunFus.length; k++) { const q2 = (t - P.sunFus[k]) / 1.2; if (q2 < 0 || q2 > 1) continue; const x = LENS.x + (rand(k * 7.1) - 0.5) * 260, y = LENS.y + (rand(k * 3.3) - 0.5) * 240; flash(c, x, y, q2, 70); nucleus(c, x, y, 10, 2, 2, {a: 1 - smooth((q2 - 0.6) / 0.4), rot: k}); photons(c, x, y, q2, 6, 90, PAL.light, k * 5); }
      c.restore();
      ring(c, LENS.x, LENS.y, LENS.R * q, rgba('#FFE2C4', 0.85), 3);
      const pa = fadeIn(t, P.protons, 0.35) * fadeOut(t, P.merge5 - 0.2, 0.3);
      if (pa > 0) tag(stage, '수소 원자핵 (양성자)', LENS.x, LENS.y - LENS.R - 28, {size: 26, color: PAL.p, a: pa, plateA: 0.7});
      const hl = fadeIn(t, P.heLbl, 0.3);
      if (hl > 0) { const age = t - P.merge5, drift = Math.min(age, 6) * 9; tag(stage, '헬륨 원자핵', he[0] - drift * 0.6 + 120, he[1] + drift + 4, {size: 26, color: T.ink, a: hl, plateA: 0.75}); }
      const lt = fadeIn(t, P.light5, 0.3);
      if (lt > 0) tag(stage, '빛과 열', LENS.x, LENS.y - LENS.R - 28, {size: 28, color: PAL.light, a: lt, plateA: 0.75});
      const fl = fadeIn(t, P.fusionLbl, 0.35);
      if (fl > 0) withAlpha(c, fl, () => stage.text('핵융합', LENS.x, LENS.y + LENS.R - 52, {role: 'display', size: 46, weight: 700, color: PAL.fus, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16}));
      tag(stage, '여러 단계를 하나로 줄여 그림', LENS.x, LENS.y + LENS.R + 22, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.merge5, 0.4)});
    });
    const ba = fadeIn(t, P.balance + 0.3, 0.45);
    if (ba > 0) withAlpha(c, ba, () => balanceScale(stage, t, P));
  });
}
/** beam balance: 4 protons (4.029) vs one helium nucleus (4.002); the beam angle follows a damped spring (exaggerated) */
function balanceScale(stage, t, P) {
  const c = stage.ctx, T = stage.theme, pv = [540, 1000], L = 270, drop = 120;
  const u = t - P.tilt, ang = u <= 0 ? 0 : 0.12 * (1 - Math.exp(-u / 0.35) * Math.cos(u * 6.5));   // rad, + = left side down
  const ends = [-1, 1].map(s => [pv[0] + s * L * Math.cos(ang), pv[1] - s * L * Math.sin(ang)]);
  // stand
  line(c, [[pv[0], pv[1]], [pv[0], 1290]], rgba(T.muted, 0.9), 5); line(c, [[pv[0] - 90, 1292], [pv[0] + 90, 1292]], rgba(T.muted, 0.9), 6);
  poly(c, [[pv[0] - 16, pv[1] + 22], [pv[0] + 16, pv[1] + 22], [pv[0], pv[1] - 2]], rgba(T.muted, 1));
  line(c, [ends[0], ends[1]], '#D7DEEC', 6); circle(c, pv[0], pv[1], 7, '#D7DEEC');
  const panW = 150;
  ends.forEach(([ex, ey], i) => {
    const py = ey + drop;
    line(c, [[ex, ey], [ex - panW / 2, py]], rgba('#D7DEEC', 0.7), 1.5); line(c, [[ex, ey], [ex + panW / 2, py]], rgba('#D7DEEC', 0.7), 1.5);
    c.beginPath(); c.moveTo(ex - panW / 2, py); c.quadraticCurveTo(ex, py + 34, ex + panW / 2, py); c.strokeStyle = '#D7DEEC'; c.lineWidth = 4; c.stroke();
    if (i === 0) { for (let k = 0; k < 4; k++) nucleon(c, ex - 48 + k * 32, py - 12 - (k % 2) * 6, 14, true); }
    else nucleus(c, ex, py - 20, 15, 2, 2, {rot: 0.5, t, jig: 0.03});
  });
  const ma = fadeIn(t, P.hMass, 0.3), mb = fadeIn(t, P.heMass, 0.3), lx = 540 - L, rx = 540 + L;
  if (ma > 0) withAlpha(c, ma, () => { stage.text('수소 원자핵 4개', lx, 1186, {size: 26, weight: 700, color: T.ink, align: 'center'}); stage.text('4.029', lx, 1232, {role: 'display', size: 40, weight: 700, color: PAL.p, align: 'center'}); });
  if (mb > 0) withAlpha(c, mb, () => { stage.text('헬륨 원자핵 1개', rx, 1186, {size: 26, weight: 700, color: T.ink, align: 'center'}); stage.text('4.002', rx, 1232, {role: 'display', size: 40, weight: 700, color: PAL.fus, align: 'center'}); });
  const ta = fadeIn(t, P.heMass, 0.4);
  if (ta > 0) tag(stage, '질량: 원자 질량 단위 · 기울기 과장', 540, 1320, {size: 24, color: T.muted, plate: false, a: ta});
  const va = fadeIn(t, P.vanish, 0.35);
  if (va > 0) {
    withAlpha(c, va, () => stage.text(`사라진 질량 ${(SUN_LOSS * 100).toFixed(1)}%`, 540, 855, {role: 'display', size: 34, weight: 700, color: PAL.light, align: 'center'}));
    const q = (t - P.vanish) / 1.6; photons(c, rx, ends[1][1] + drop - 20, q, 10, 120, PAL.light, 21);
    if (q > 0 && q < 1) flash(c, rx, ends[1][1] + drop - 20, q, 80);
  }
  const ea = fadeIn(t, P.emc2, 0.35);
  if (ea > 0) withAlpha(c, ea, () => { stage.text('→ 빛과 열', 540, 905, {size: 28, weight: 700, color: T.muted, align: 'center'}); stage.text('E = mc²', 540, 790, {role: 'display', size: 48, weight: 700, color: PAL.answer, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 14}); });
}

// ------------------------------------------------------------------ barrier: the Coulomb hill (설명 모형) → temperature knob, speed spread, fusion rate
const HG = {x0: 210, x1: 900, y0: 690, yT: 452, wellY: 712};
const hx = r => HG.x0 + r * (HG.x1 - HG.x0), hy = U => HG.y0 - U * (HG.y0 - HG.yT);
const BOX = {x0: 150, y0: 770, x1: 600, y1: 1030}, HIST = {x0: 650, x1: 930, y0: 790, y1: 1010, Emax: 1.2, n: 24}, KNOB = {x0: 250, x1: 880, y: 1108, l0: 6, l1: 8.3};
const BOX_P = (() => { const R = rng(808), o = []; for (let i = 0; i < 30; i++) { const ang = R() * TAU, q = (i + 0.5) / 30, sp = Math.sqrt(2 * Math.log(1 / (1 - q * 0.97))) * 0.8; o.push({x: R(), y: R(), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, nN: i % 2 ? 2 : 1}); } return o; })();
const fold = (v, a, b) => { const L = b - a, u = ((v - a) % (2 * L) + 2 * L) % (2 * L); return a + (u < L ? u : 2 * L - u); };
function boxPos(p, ph) { return [fold(BOX.x0 + 20 + p.x * (BOX.x1 - BOX.x0 - 40) + p.vx * 300 * ph, BOX.x0 + 14, BOX.x1 - 14), fold(BOX.y0 + 50 + p.y * (BOX.y1 - BOX.y0 - 66) + p.vy * 300 * ph, BOX.y0 + 46, BOX.y1 - 14)]; }
export const relText = r => (r >= 0.095 ? `× ${r >= 1 ? r.toFixed(1) : r.toFixed(2)}` : r >= 1e-8 ? `약 ${koNum(sig2(1 / r))}분의 1` : '거의 0');
function hillGraph(stage, t, P, tr) {
  const c = stage.ctx, T = stage.theme;
  // the hill (U ∝ 1/r outside the nucleus), the well inside, the zone near the top where a collision can fuse
  const pts = []; for (let i = 0; i <= 80; i++) { const r = BAR.R0 + (1 - BAR.R0) * (i / 80) ** 2; pts.push([hx(r), hy(Uhill(r))]); }
  const fill = c.createLinearGradient(0, HG.yT, 0, HG.y0); fill.addColorStop(0, rgba(PAL.p, 0.32)); fill.addColorStop(1, rgba(PAL.p, 0.04));
  poly(c, [[hx(BAR.R0), HG.y0], ...pts, [hx(1), HG.y0]], fill);
  const rz = rTurn(BAR.Estar), zone = [[hx(BAR.R0), hy(BAR.Estar)], ...pts.filter(p => p[0] <= hx(rz)), [hx(rz), hy(BAR.Estar)]];
  poly(c, zone, rgba(PAL.fus, 0.32)); line(c, [[hx(BAR.R0), hy(BAR.Estar)], [hx(rz) + 70, hy(BAR.Estar)]], rgba(PAL.fus, 0.8), 1.5, {dash: [5, 5]});
  stage.text('합쳐질 수 있는 높이', hx(rz) + 80, hy(BAR.Estar), {size: 24, weight: 700, color: PAL.fus});
  line(c, pts, PAL.p, 3.5);
  line(c, [[hx(BAR.R0), hy(1)], [hx(BAR.R0), HG.wellY], [HG.x0, HG.wellY]], rgba(PAL.fus, 0.9), 3);
  line(c, [[hx(BAR.R0), HG.y0], [HG.x1, HG.y0]], rgba(T.muted, 0.6), 1.5);
  stage.text('두 원자핵 사이의 거리 →', HG.x1, HG.y0 + 30, {size: 24, color: T.muted, align: 'right'});
  stage.text('붙으면 합쳐짐', HG.x0 - 50, HG.wellY + 30, {size: 24, color: PAL.fus});
  tag(stage, '설명 모형', 925, 395, {size: 24, color: T.muted, plate: false, align: 'right'});
  const ta = fadeOut(t, P.thermo, 0.3), tb = fadeIn(t, P.thermo + 0.15, 0.35), tc = fadeIn(t, P.thermoName, 0.35);
  if (ta > 0) withAlpha(c, ta, () => stage.text('밀어내는 힘의 언덕 (에너지)', 150, 395, {size: 26, weight: 700, color: T.ink}));
  if (tb > 0) withAlpha(c, tb, () => { stage.text('열(熱 · thermo) + 핵(核 · nuclear)', 150, 395, {size: 26, weight: 700, color: T.ink}); });
  if (tc > 0) withAlpha(c, tc, () => stage.text('= 열핵반응', 150, 437, {role: 'display', size: 36, weight: 700, color: PAL.answer}));
  // target nucleus resting in the well; the incoming nucleus rolling on the hill
  nucleon(c, HG.x0 + 30, HG.wellY - 15, 14, true);
  if (!tr) return;
  const u = t - tr.t0, rIn = tr.pass ? sampleTrial(tr, Math.min(u, tr.tTurn)) : sampleTrial(tr, u);
  const yE = hy(tr.E);
  if (u >= 0 && u <= tr.T + (tr.pass ? tr.tunnel + 0.6 : 0.2)) {
    const ea = (tr.E < 0.08 ? 0 : 1) * smooth(u / 0.2) * (tr.pass ? 1 - smooth((u - tr.tTurn - tr.tunnel - 0.2) / 0.3) : 1 - smooth((u - tr.T + 0.15) / 0.15));
    withAlpha(c, ea, () => {
      line(c, [[hx(rTurn(tr.E)), yE], [HG.x1, yE]], rgba('#DDE6FF', 0.45), 1.5, {dash: [4, 5]});
      stage.text('충돌 에너지', HG.x1, yE - 18, {size: 24, color: rgba('#DDE6FF', 0.85), align: 'right'});
    });
    if (tr.pass && u > tr.tTurn) {
      const q = clamp((u - tr.tTurn) / tr.tunnel), x = lerp(hx(tr.rt), hx(BAR.R0) - 26, q), y = q < 0.85 ? yE : lerp(yE, HG.wellY - 15, (q - 0.85) / 0.15);
      line(c, [[hx(tr.rt), yE], [x, y]], rgba(PAL.fus, 0.9), 2, {dash: [3, 4]});
      if (q < 1) nucleon(c, x, y - 14, 14, true); else flash(c, HG.x0 + 30, HG.wellY - 15, (u - tr.tTurn - tr.tunnel) / 0.7, 70);
    } else if (u <= tr.T) {
      nucleon(c, hx(rIn), hy(Uhill(rIn)) - 14, 14, true);
      const bq = (u - tr.tTurn) / 0.35; if (!tr.pass && bq > 0 && bq < 1) ring(c, hx(tr.rt), hy(tr.E) - 14, 16 + 26 * bq, rgba('#DDE6FF', 0.7 * (1 - bq)), 2);
    }
  }
}
/** s07: the two nuclei in real space, distance from the same trial; repulsion arrows ∝ 1/d² */
function coulombPair(stage, t, P, tr, a) {
  const c = stage.ctx, T = stage.theme, y = 1020, xA = 300;
  withAlpha(c, a, () => {
    let r = 1, merged = 0;
    if (tr) { const u = t - tr.t0; r = tr.pass ? sampleTrial(tr, Math.min(u, tr.tTurn)) : sampleTrial(tr, u); if (tr.pass && u > tr.tTurn) { const q = clamp((u - tr.tTurn) / tr.tunnel); r = lerp(tr.rt, 0, q); merged = u - tr.tTurn - tr.tunnel; } }
    const d = 84 + r * 500, xB = xA + d;
    stage.text('같은 양전기(+)끼리 서로 밀어냄', 540, 850, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
    if (merged > 0) { nucleus(c, xA + 32, y, 24, 2, 0, {t}); flash(c, xA + 32, y, merged / 0.8, 120); stage.text('합쳐짐', xA + 32, y + 80, {role: 'display', size: 30, weight: 700, color: PAL.fus, align: 'center'}); }
    else {
      const L = clamp(80 * (220 / d) ** 2, 12, 190);
      for (const [x, s] of [[xA, -1], [xB, 1]]) { arrow(c, [x + s * 44, y], [x + s * (44 + L), y], rgba(PAL.bad, 0.95), 6, {head: 18}); nucleon(c, x, y, 34, true); }
      stage.text('가까울수록 더 세게', 540, 1150, {size: 28, weight: 700, color: T.muted, align: 'center'});
      line(c, [[xA, y + 50], [xB, y + 50]], rgba(T.muted, 0.6), 1.5); line(c, [[xA, y + 42], [xA, y + 58]], rgba(T.muted, 0.6), 1.5); line(c, [[xB, y + 42], [xB, y + 58]], rgba(T.muted, 0.6), 1.5);
    }
    const fa = fadeIn(t, P.trials[2].t0, 0.3);
    if (fa > 0 && tr === P.trials[2]) tag(stage, '아주 빠른 원자핵', 540, 1230, {size: 28, color: PAL.fus, a: fa});
    else if (tr && !tr.pass && tr.t0 < P.trials[2].t0) tag(stage, '느리면 튕겨 나감', 540, 1230, {size: 28, color: T.muted, a: fadeIn(t, tr.t0 + tr.tTurn - 0.2, 0.25)});
  });
}
function knobPanel(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, Tk = P.T(t), ph = P.phase(t), th = thetaOf(Tk), rr = relRate(Tk);
  withAlpha(c, a, () => {
    // tier 2: the gas of nuclei (speed ∝ √T) with fusion flashes, and the spread of collision energies
    panel(c, T, BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0, 0.55);
    stage.text('중수소·삼중수소 원자핵', BOX.x0 + 16, BOX.y0 + 26, {size: 24, weight: 700, color: T.muted});
    clipRect(c, BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0, 12, () => {
      const v = Math.sqrt(Tk / 1e8);
      for (const p of BOX_P) { const [x, y] = boxPos(p, ph); if (v > 0.3) line(c, [[x - p.vx * 300 * v * 0.05, y - p.vy * 300 * v * 0.05], [x, y]], rgba(PAL.p, 0.35), 3); nucleus(c, x, y, 7, 1, p.nN, {rot: p.vx * 3}); }
      P.boxFus.forEach((tf, k) => { const q = (t - tf) / 0.75; if (q < 0 || q > 1) return; const p = BOX_P[(k * 7 + 3) % BOX_P.length], [x, y] = boxPos(p, P.phase(tf)), ang = rand(k * 9.1) * TAU;
        flash(c, x, y, q, 46); const e = easeOut(q); nucleus(c, x - Math.cos(ang) * 22 * e, y - Math.sin(ang) * 22 * e, 6, 2, 2, {a: 1 - q});
        line(c, [[x + Math.cos(ang) * 60 * e, y + Math.sin(ang) * 60 * e], [x + Math.cos(ang) * 110 * e, y + Math.sin(ang) * 110 * e]], rgba(PAL.n, 0.9 * (1 - q)), 3); });
    });
    // energy spread (Maxwell; display units of the hill)
    stage.text('충돌 에너지의 분포', HIST.x0, BOX.y0 + 6, {size: 24, weight: 700, color: T.muted});
    const bw = (HIST.x1 - HIST.x0) / HIST.n, xs = HIST.x0 + BAR.Estar / HIST.Emax * (HIST.x1 - HIST.x0);
    for (let i = 0; i < HIST.n; i++) { const e0 = i * HIST.Emax / HIST.n, e1 = e0 + HIST.Emax / HIST.n, pr = tailAbove(e0, th) - tailAbove(e1, th), h = Math.min(1, pr / 0.11) * (HIST.y1 - HIST.y0 - 30);
      if (h > 0.4) rect(c, HIST.x0 + i * bw + 1, HIST.y1 - h, bw - 2, h, 2, e0 >= BAR.Estar - 1e-9 ? PAL.fus : rgba(PAL.p, 0.75)); }
    line(c, [[HIST.x0, HIST.y1], [HIST.x1, HIST.y1]], rgba(T.muted, 0.7), 1.5);
    line(c, [[xs, HIST.y0 + 26], [xs, HIST.y1]], rgba(PAL.fus, 0.9), 2, {dash: [5, 4]});
    stage.text('합쳐질 수 있음', xs + 8, HIST.y0 + 42, {size: 24, weight: 700, color: PAL.fus});
    stage.text('느림', HIST.x0, HIST.y1 + 24, {size: 24, color: T.muted}); stage.text('빠름', HIST.x1, HIST.y1 + 24, {size: 24, color: T.muted, align: 'right'});
    // tier 3: the knob and the readouts
    const kx = l => KNOB.x0 + (l - KNOB.l0) / (KNOB.l1 - KNOB.l0) * (KNOB.x1 - KNOB.x0), lx = kx(Math.log10(Tk));
    stage.text('온도', 150, KNOB.y, {size: 26, weight: 700, color: T.ink});
    rect(c, KNOB.x0, KNOB.y - 4, KNOB.x1 - KNOB.x0, 8, 4, rgba(PAL.grid, 1));
    const kg = c.createLinearGradient(KNOB.x0, 0, KNOB.x1, 0); kg.addColorStop(0, '#5E7BC0'); kg.addColorStop(1, PAL.answer);
    rect(c, KNOB.x0, KNOB.y - 4, lx - KNOB.x0, 8, 4, kg);
    for (const [l, s] of [[6, '100만'], [7, '1,000만'], [8, '1억 도']]) { line(c, [[kx(l), KNOB.y + 10], [kx(l), KNOB.y + 20]], rgba(T.muted, 0.9), 2); stage.text(s, kx(l), KNOB.y + 40, {size: 24, color: l === 8 ? PAL.answer : T.muted, align: 'center'}); }
    circle(c, lx, KNOB.y, 17, '#F4F6FB'); ring(c, lx, KNOB.y, 17, PAL.answer, 3);
    const tiles = [[150, '온도', fmtTemp(Tk), T.ink], [420, '평균 빠르기', `초속 ${koNum(sig2(vMeanD(Tk)))} km`, T.ink], [690, '융합 빈도 (1억 도 = 1)', relText(rr), rr > 0.05 ? PAL.fus : T.muted]];
    for (const [x, lb, val, col] of tiles) { panel(c, T, x, 1180, 240, 140, 0.8); stage.text(lb, x + 120, 1210, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text(val, x + 120, 1258, {role: 'display', size: val.length > 9 ? 28 : 34, weight: 700, color: col, align: 'center', maxWidth: 220}); }
    // log bar of the relative rate (10⁻⁸ … 10¹)
    const bx0 = 712, bx1 = 908, by = 1298, lr = Math.log10(Math.max(1e-12, rr)), f = clamp((lr + 8) / 9);
    rect(c, bx0, by - 4, bx1 - bx0, 8, 4, rgba(PAL.grid, 1)); if (f > 0) rect(c, bx0, by - 4, (bx1 - bx0) * f, 8, 4, PAL.fus);
    for (const l of [-8, -4, 0]) line(c, [[bx0 + (l + 8) / 9 * (bx1 - bx0), by - 9], [bx0 + (l + 8) / 9 * (bx1 - bx0), by + 9]], rgba(T.muted, 0.9), 1.5);
  });
}
function barrierScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx), tr = P.trialAt(t);
  withAlpha(c, sf, () => {
    hillGraph(stage, t, P, tr);
    const lo = fadeOut(t, P.s08, 0.35), hi = fadeIn(t, P.s08 + 0.2, 0.4);
    if (lo > 0) coulombPair(stage, t, P, tr && tr.t0 < P.s08 ? tr : null, lo);
    if (hi > 0) knobPanel(stage, t, P, hi);
  });
}

// ------------------------------------------------------------------ fuel: H, D, T nuclei → D + T → ⁴He (3.5 MeV) + n (14.1 MeV)
const ISO = [{x: 270, n: 0, name: '수소', sym: 'H'}, {x: 540, n: 1, name: '중수소', sym: 'D'}, {x: 810, n: 2, name: '삼중수소', sym: 'T'}];
const RX = {cx: 540, cy: 1000, vHe: 30, angHe: Math.PI + 0.22, angN: 0.22};
function fuelScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const appear = [P.nH, P.nD, P.nT], dim = 1 - 0.45 * fadeIn(t, P.move, 0.5), up = easeInOut(clamp((t - P.move + 0.5) / 0.9)), oy = lerp(250, 0, up), rN = lerp(46, 34, up);
    ISO.forEach((it, i) => {
      const a = fadeIn(t, appear[i], 0.35); if (a <= 0) return;
      withAlpha(c, a * dim, () => {
        const sc = 0.8 + 0.2 * easeOut(clamp((t - appear[i]) / 0.4));
        if (oy > 1) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, it.x, 530 + oy, rN * 3, i ? PAL.fus : PAL.p, 0.1 * (1 - up)); c.restore(); }
        nucleus(c, it.x, 530 + oy, rN * sc, 1, it.n, {t, jig: 0.03, rot: 0.3 + i * 0.4});
        stage.text(it.name, it.x, 628 + oy * 1.2, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'});
        stage.text(it.sym, it.x, 672 + oy * 1.2, {role: 'display', size: 30, weight: 700, color: i ? PAL.fus : T.muted, align: 'center'});
        stage.text(`양성자 1 · 중성자 ${it.n}`, it.x, 712 + oy * 1.2, {size: 24, color: T.muted, align: 'center'});
        if (oy > 1) withAlpha(c, (1 - up) ** 3, () => stage.text(`질량 약 ${i + 1}배`, it.x, 752 + oy * 1.2, {size: 24, weight: 700, color: i ? PAL.fus : T.muted, align: 'center'}));
      });
    });
    const ba = fadeIn(t, P.sib, 0.35) * dim;
    if (ba > 0) withAlpha(c, ba, () => {
      const y = 432 + oy * 0.8;
      line(c, [[200, y + 16], [200, y], [880, y], [880, y + 16]], rgba(PAL.p, 0.85), 2.5);
      stage.text('양성자가 1개 → 모두 수소 (중성자 수만 다름)', 540, y - 28, {size: 26, weight: 700, color: PAL.p, align: 'center'});
    });
    const lg = fadeIn(t, P.nH + 0.3, 0.4) * dim;
    if (lg > 0) withAlpha(c, lg, () => { const y = 762 + oy * 1.45; nucleon(c, 380, y, 11, true); stage.text('양성자 (+)', 398, y, {size: 24, color: T.muted}); nucleon(c, 580, y, 11, false); stage.text('중성자', 598, y, {size: 24, color: T.muted}); });
    // the reaction (slow motion): D and T glide down, collide, ⁴He and n leave with equal and opposite momenta (n 4× faster)
    const ra = fadeIn(t, P.move + 0.4, 0.3);
    if (ra <= 0) return;
    withAlpha(c, ra, () => {
      stage.text('D + T → ⁴He + n', 540, 830, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center'});
      tag(stage, '느린 화면', 925, 830, {size: 24, color: T.muted, plate: false, align: 'right'});
      const tc = P.hit, u = (t - P.move) / (tc - 0.4 - P.move), w = (t - (tc - 0.4)) / 0.4;
      if (t < tc) {
        const pD = u < 1 ? [lerp(540, RX.cx - 170, easeInOut(u)), lerp(530, RX.cy, easeInOut(u))] : [lerp(RX.cx - 170, RX.cx - 26, easeIn(clamp(w))), RX.cy];
        const pT = u < 1 ? [lerp(810, RX.cx + 170, easeInOut(u)), lerp(530, RX.cy, easeInOut(u))] : [lerp(RX.cx + 170, RX.cx + 30, easeIn(clamp(w))), RX.cy];
        nucleus(c, pD[0], pD[1], 22, 1, 1, {t, jig: 0.03}); nucleus(c, pT[0], pT[1], 22, 1, 2, {t, jig: 0.03, rot: 0.6});
        if (u >= 1) { stage.text('D', pD[0], pD[1] - 50, {role: 'display', size: 28, weight: 700, color: PAL.fus, align: 'center'}); stage.text('T', pT[0], pT[1] - 50, {role: 'display', size: 28, weight: 700, color: PAL.fus, align: 'center'}); }
      } else {
        const age = t - tc, sHe = RX.vHe * age, sN = 4 * RX.vHe * age;
        const he = [RX.cx + Math.cos(RX.angHe) * sHe, RX.cy + Math.sin(RX.angHe) * sHe], nn = [RX.cx + Math.cos(RX.angN) * sN, RX.cy + Math.sin(RX.angN) * sN];
        const gb = glowBuf(); if (age < 1.6) { gb.splat(RX.cx, RX.cy, 150 * (0.5 + age), FUSC, 1.6 * Math.exp(-age / 0.35)); } gb.flush(stage, {gain: 1.3, bloom: 0.6});
        flash(c, RX.cx, RX.cy, age / 1.1, 140); flash(c, RX.cx, RX.cy, (age - 0.25) / 1.1, 200, PAL.light);
        line(c, [[RX.cx, RX.cy], he], rgba(PAL.fus, 0.35), 3); line(c, [[RX.cx, RX.cy], [Math.min(nn[0], 930), RX.cy + Math.tan(RX.angN) * (Math.min(nn[0], 930) - RX.cx)]], rgba(PAL.n, 0.45), 3);
        nucleus(c, he[0], he[1], 20, 2, 2, {t, jig: 0.03, rot: 0.5});
        const na = clamp((940 - nn[0]) / 40);
        if (na > 0) { withAlpha(c, na, () => { for (let k = 1; k <= 5; k++) circle(c, nn[0] - Math.cos(RX.angN) * k * 9, nn[1] - Math.sin(RX.angN) * k * 9, 12 - k * 1.6, rgba(PAL.n, 0.18)); nucleon(c, nn[0], nn[1], 20, false); }); }
        const hl = fadeIn(t, tc + 0.05, 0.3);
        if (hl > 0) withAlpha(c, hl, () => { stage.text('헬륨', he[0], he[1] - 48, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'}); });
        const nl = fadeIn(t, P.nLbl, 0.3) * clamp((900 - nn[0]) / 60);
        if (nl > 0) withAlpha(c, nl, () => { const lx = Math.min(nn[0], 860), ly = nn[1] + 58; stage.text('빠른 중성자', lx, ly, {role: 'display', size: 30, weight: 700, color: PAL.n, align: 'center'}); });
        const vl = fadeIn(t, P.nLbl + 0.5, 0.35);
        if (vl > 0) withAlpha(c, vl, () => stage.text('헬륨보다 4배 빠름 · 초속 약 5만 km', 540, 1118, {size: 26, weight: 700, color: T.muted, align: 'center'}));
      }
      const ea = fadeIn(t, P.eLbl, 0.35), sa = fadeIn(t, P.sumLbl, 0.35);
      if (ea > 0) withAlpha(c, ea, () => {
        const tiles = [[150, '헬륨', `${DT_Q.he} MeV`, T.ink], [420, '중성자', `${DT_Q.n} MeV`, PAL.n]];
        for (const [x, lb, val, col] of tiles) { panel(c, T, x, 1176, 240, 140, 0.8); stage.text(lb, x + 120, 1208, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text(val, x + 120, 1260, {role: 'display', size: 38, weight: 700, color: col, align: 'center'}); }
      });
      if (sa > 0) withAlpha(c, sa, () => { panel(c, T, 690, 1176, 240, 140, 0.8); stage.text('합계', 810, 1208, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text(`${DT_Q.tot} MeV`, 810, 1254, {role: 'display', size: 38, weight: 700, color: PAL.fus, align: 'center'}); stage.text(`질량의 ${DT_Q.massPct}%`, 810, 1294, {size: 24, color: T.muted, align: 'center'}); });
    });
  });
}

// ------------------------------------------------------------------ trigger: binding energy (fission ↗ and fusion ↗), temperature, two abstract blocks
const BEG = {x0: 210, x1: 900, y0: 690, y1: 450, Bmax: 9, Amax: 250};
const bx = A => BEG.x0 + Math.log10(A) / Math.log10(BEG.Amax) * (BEG.x1 - BEG.x0), by = B => BEG.y0 - B / BEG.Bmax * (BEG.y0 - BEG.y1);
function bindingCurve(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    const q = easeOut(clamp((t - P.curve) / 1.2));
    stage.text('원자핵이 얼마나 단단히 묶였나', 150, 392, {size: 26, weight: 700, color: T.ink});
    stage.text('핵자 1개당 · 측정값', 925, 392, {size: 24, color: T.muted, align: 'right'});
    line(c, [[BEG.x0, BEG.y0], [BEG.x1, BEG.y0]], rgba(T.muted, 0.6), 1.5); line(c, [[BEG.x0, BEG.y0], [BEG.x0, BEG.y1 - 20]], rgba(T.muted, 0.6), 1.5);
    stage.text('↑ 단단함', BEG.x0 + 12, BEG.y1 - 4, {size: 24, color: T.muted, align: 'left'});
    stage.text('가벼움 ← 원자핵의 무게 → 무거움', 555, BEG.y0 + 28, {size: 24, color: T.muted, align: 'center'});
    const pts = []; for (let i = 0; i <= 90; i++) { const A = 12 * (238 / 12) ** (i / 90); pts.push([bx(A), by(beAt(A))]); }
    const lit = BE_LIGHT.map(p => [bx(p.A), by(p.B)]);
    c.save(); c.beginPath(); c.rect(0, 0, BEG.x0 + (BEG.x1 - BEG.x0 + 10) * q, 1920); c.clip();
    line(c, [...lit.slice(3), pts[0]], rgba('#C9D3E6', 0.45), 1.5, {dash: [4, 4]});
    line(c, pts, '#C9D3E6', 3);
    for (const [k, p] of lit.entries()) circle(c, p[0], p[1], k === 3 ? 7 : 5, k < 3 ? PAL.p : k === 3 ? PAL.fus : '#C9D3E6');
    c.restore();
    if (q > 0.98) {
      const fe = [bx(56), by(8.79)]; circle(c, fe[0], fe[1], 6, '#FFFFFF'); stage.text('철 · 가장 단단함', fe[0], fe[1] + 30, {size: 24, weight: 700, color: T.ink, align: 'center'});
      stage.text('우라늄', bx(235), by(7.59) + 30, {size: 24, weight: 700, color: PAL.fis, align: 'center'});
      stage.text('수소', bx(1) + 14, by(0) - 22, {size: 24, weight: 700, color: PAL.p});
      stage.text('헬륨', bx(4) + 16, by(7.07) + 4, {size: 24, weight: 700, color: PAL.fus});
    }
    const fi = clamp((t - P.fis) / 0.6), fu = clamp((t - P.fus) / 0.6);
    if (fi > 0) { const a0 = [bx(235), by(7.59)], a1 = [bx(118), by(8.52)]; withAlpha(c, 1, () => { arrow(c, a0, [lerp(a0[0], a1[0], easeOut(fi)), lerp(a0[1], a1[1], easeOut(fi))], PAL.fis, 5, {head: 18});
      if (fi >= 1) { stage.text('핵분열 · 원자폭탄', 925, by(4.5), {role: 'display', size: 28, weight: 700, color: PAL.fis, align: 'right'}); stage.text('핵자당 약 0.9 MeV', 925, by(4.5) + 34, {size: 24, color: T.muted, align: 'right'}); } }); }
    if (fu > 0) { const a0 = [bx(2.5), by(2.0)], a1 = [bx(4) - 10, by(6.7)]; arrow(c, a0, [lerp(a0[0], a1[0], easeOut(fu)), lerp(a0[1], a1[1], easeOut(fu))], PAL.fus, 5, {head: 18});
      if (fu >= 1) { stage.text('핵융합 · 수소폭탄', bx(4) + 30, by(4.3), {role: 'display', size: 28, weight: 700, color: PAL.fus}); stage.text('핵자당 약 3.5 MeV', bx(4) + 30, by(4.3) + 34, {size: 24, color: T.muted}); } }
    const ta = fadeIn(t, P.trig, 0.4);
    if (ta > 0) withAlpha(c, ta, () => { const pts2 = []; for (let i = 0; i <= 30; i++) { const u = i / 30; pts2.push([lerp(bx(150), bx(5.5), u), by(9.4) - 34 * Math.sin(u * Math.PI)]); } line(c, pts2, rgba(PAL.answer, 0.9), 2.5, {dash: [7, 5]}); arrow(c, pts2[28], pts2[30], PAL.answer, 2.5, {head: 14}); stage.text('방아쇠', 650, by(9.4) - 44, {role: 'display', size: 28, weight: 700, color: PAL.answer, align: 'center'}); });
  });
}
const TH = {x0: 200, x1: 900, y: 960, l0: 3, l1: 9};
const thx = l => TH.x0 + (l - TH.l0) / (TH.l1 - TH.l0) * (TH.x1 - TH.x0);
function thermometer(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    stage.text('한순간에 만들 수 있는 온도', 150, 820, {size: 26, weight: 700, color: T.ink});
    rect(c, TH.x0, TH.y - 12, TH.x1 - TH.x0, 24, 12, rgba(PAL.grid, 1));
    const lbl = ['1천', '1만', '10만', '100만', '1,000만', '1억', '10억 도'];
    for (let l = 3; l <= 9; l++) { line(c, [[thx(l), TH.y + 16], [thx(l), TH.y + 28]], rgba(T.muted, 0.9), 2); stage.text(lbl[l - 3], thx(l), TH.y + 50, {size: 24, color: l === 8 ? PAL.fus : T.muted, align: 'center'}); }
    const need = fadeIn(t, P.therm, 0.35);
    if (need > 0) withAlpha(c, need, () => { line(c, [[thx(8), TH.y - 52], [thx(8), TH.y + 14]], PAL.fus, 3); stage.text('핵융합에 필요', thx(8), TH.y - 70, {size: 24, weight: 700, color: PAL.fus, align: 'center'}); });
    const fl = fadeIn(t, P.flame, 0.3), fq = easeOut(clamp((t - P.flame) / 0.5)), lf = Math.log10(3000);
    if (fl > 0) { rect(c, TH.x0, TH.y - 12, (thx(lf) - TH.x0) * fq + 1, 24, 12, PAL.warm); withAlpha(c, fl, () => stage.text('가장 뜨거운 불꽃 · 수천 도', thx(lf) - 20, TH.y - 52, {size: 24, color: PAL.warm})); }
    const fb = clamp((t - P.fis) / 0.25);
    if (fb > 0) { const xe = lerp(thx(lf), thx(8), easeOut(fb)); rect(c, TH.x0, TH.y - 12, xe - TH.x0, 24, 12, PAL.fis); c.save(); c.globalCompositeOperation = 'lighter'; glow(c, xe, TH.y, 90, PAL.fis, 0.5 * (1 - fb * 0.6)); c.restore();
      withAlpha(c, fadeIn(t, P.fis + 0.2, 0.3), () => stage.text('원자폭탄 · 한순간에', thx(8) - 16, TH.y + 92, {role: 'display', size: 30, weight: 700, color: PAL.fis, align: 'right'})); }
  });
}
const BLK = [{x: 150, y: 790, w: 270, h: 260}, {x: 660, y: 790, w: 270, h: 260}];
const FIS_N = [[0.25, 0.42], [0.55, 0.3], [0.78, 0.5], [0.4, 0.72], [0.68, 0.78], [0.2, 0.8]];
const FIS_HIT = [0, 0.14, 0.17, 0.3, 0.33, 0.45];
const BLK2_P = (() => { const R = rng(4242), o = []; for (let i = 0; i < 20; i++) { const ang = R() * TAU, sp = 0.4 + 0.8 * R(); o.push({x: R(), y: R(), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, nN: i % 2 ? 2 : 1}); } return o; })();
function stageBlocks(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    const s1 = t - P.stage1, hot1 = s1 > 0 ? Math.exp(-s1 / 1.8) : 0;
    BLK.forEach((b, i) => { panel(c, T, b.x, b.y, b.w, b.h, 0.75, 14); if (i === 0 && hot1 > 0) rect(c, b.x, b.y, b.w, b.h, 14, null, rgba(PAL.fis, 0.9 * hot1), 3); });
    // block 1: a small fission chain (heavy nuclei split one after another)
    const b1 = BLK[0], ix = u => b1.x + 20 + u * (b1.w - 40), iy = v => b1.y + 100 + v * (b1.h - 120);
    FIS_N.forEach(([u, v], k) => { const h = s1 - FIS_HIT[k];
      if (h < 0) { sphere(c, ix(u), iy(v), 15, '#8FA6C8', {shade: '#1E2A44'}); return; }
      const e = easeOut(clamp(h / 0.5)), ang = k * 1.7; for (const sgn of [-1, 1]) sphere(c, ix(u) + sgn * Math.cos(ang) * 22 * e, iy(v) + sgn * Math.sin(ang) * 22 * e, 11, '#8FA6C8', {alpha: 1 - 0.5 * e, shade: '#1E2A44'});
      flash(c, ix(u), iy(v), h / 0.5, 40, '#BFE0FF'); });
    if (s1 > -0.3 && s1 < 0) { const q = (s1 + 0.3) / 0.3; circle(c, lerp(b1.x - 10, ix(FIS_N[0][0]), q), lerp(iy(0.3), iy(FIS_N[0][1]), q), 6, PAL.n); }
    if (s1 > 0) { const gb = glowBuf(); gb.splat(b1.x + b1.w / 2, b1.y + b1.h / 2 + 40, 150, [0.55, 0.8, 1.0], 0.9 * Math.exp(-s1 / 0.6) * smooth(s1 / 0.15)); gb.flush(stage, {gain: 1.2, bloom: 0.35}); }
    // the energy arrow: heat and pressure
    const ha = clamp((t - P.heatArrow) / 0.6), pa = fadeIn(t, P.press, 0.3);
    if (ha > 0) { const y = BLK[0].y + 150, xa = BLK[0].x + BLK[0].w + 10, xb = BLK[1].x - 10;
      arrow(c, [xa, y], [lerp(xa, xb, easeOut(ha)), y], PAL.answer, 7, {head: 22});
      for (let k = 0; k < 6; k++) { const f = ((t - P.heatArrow) * 0.9 + k / 6) % 1; if (t > P.heatArrow) circle(c, lerp(xa, xb - 20, f), y + Math.sin(f * 9 + k) * 6, 4, rgba(PAL.light, 0.8 * Math.sin(f * Math.PI))); }
      withAlpha(c, fadeIn(t, P.heatArrow, 0.3), () => stage.text('열', (xa + xb) / 2 - (pa > 0 ? 40 : 0), y - 40, {role: 'display', size: 32, weight: 700, color: PAL.answer, align: 'center'}));
      if (pa > 0) withAlpha(c, pa, () => stage.text('· 압력', (xa + xb) / 2 + 30, y - 40, {role: 'display', size: 32, weight: 700, color: PAL.answer, align: 'center'})); }
    // block 2: fuel nuclei get denser and hotter, then fuse all at once
    const b2 = BLK[1], rho = P.rho(t), T2 = P.T2(t), sp = Math.sqrt(T2 / 1e8), sq = 1 / Math.sqrt(rho), cx = b2.x + b2.w / 2, cy = b2.y + 165;
    clipRect(c, b2.x, b2.y + 90, b2.w, b2.h - 90, 10, () => {
      BLK2_P.forEach((p, k) => { const ph = (t - P.blocks) * (0.08 + 0.9 * sp), x = cx + (fold(p.x + p.vx * ph, 0, 1) - 0.5) * (b2.w - 40) * sq, y = cy + (fold(p.y + p.vy * ph, 0, 1) - 0.5) * (b2.h - 130) * sq; nucleus(c, x, y, 6, 1, p.nN, {rot: k}); });
      P.burnT.forEach((tf, k) => { const q = (t - tf) / 0.6; if (q < 0 || q > 1) return; flash(c, cx + (rand(k * 3.3) - 0.5) * 150 * sq, cy + (rand(k * 7.7) - 0.5) * 100 * sq, q, 40); });
    });
    const burned = P.burned(t);
    if (burned > 0.01) { const gb = glowBuf(); gb.splat(cx, cy + 10, 130, FUSC, 1.0 * smooth(burned / 0.25) * (0.5 + 0.5 * Math.exp(-(t - P.burst) / 1.2))); gb.flush(stage, {gain: 1.2, bloom: 0.35}); }
    stage.text('1단계', BLK[0].x + 18, BLK[0].y + 30, {size: 24, weight: 700, color: PAL.fis, shadow: 'rgba(0,0,0,0.8)'}); stage.text('핵분열', BLK[0].x + 18, BLK[0].y + 68, {role: 'display', size: 34, weight: 700, color: T.ink, shadow: 'rgba(0,0,0,0.8)'});
    stage.text('2단계', BLK[1].x + 18, BLK[1].y + 30, {size: 24, weight: 700, color: PAL.fus, shadow: 'rgba(0,0,0,0.8)'}); stage.text('핵융합', BLK[1].x + 18, BLK[1].y + 68, {role: 'display', size: 34, weight: 700, color: T.ink, shadow: 'rgba(0,0,0,0.8)'});
    if (t > P.dens - 0.2) stage.text(`온도 ${fmtTemp(T2)}`, b2.x + b2.w / 2, b2.y + b2.h + 26, {size: 24, weight: 700, color: T2 >= 1e8 ? PAL.fus : T.muted, align: 'center', shadow: 'rgba(0,0,0,0.9)'});
    // energy meter (relative, no numbers)
    stage.text('나온 에너지 (설명용 상대값)', 150, 1110, {size: 24, weight: 700, color: T.muted});
    rect(c, 150, 1140, 780, 36, 8, rgba(PAL.grid, 1));
    const e1 = 0.1 * easeOut(clamp((t - P.stage1 - 0.1) / 0.5)), e2 = 0.9 * clamp(burned / 0.8);
    if (e1 > 0) rect(c, 150, 1140, 780 * e1, 36, 8, PAL.fis);
    if (e2 > 0) { rect(c, 150 + 780 * 0.1, 1140, 780 * e2, 36, 8, PAL.fus); c.save(); c.globalCompositeOperation = 'lighter'; glow(c, 150 + 780 * (0.1 + e2), 1158, 80, PAL.fus, 0.4); c.restore(); }
    if (e1 > 0.02) stage.text('1단계', 150 + 39, 1206, {size: 24, weight: 700, color: PAL.fis, align: 'center'});
    if (e2 > 0.35) stage.text('2단계 · 훨씬 큼', 150 + 780 * (0.1 + e2 / 2), 1206, {size: 24, weight: 700, color: PAL.fus, align: 'center'});
    tag(stage, '설명용 도식 · 장치의 모양이 아님', 540, 1290, {size: 24, color: T.muted, plate: false});
  });
}
function triggerScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    bindingCurve(stage, t, P, 1 - 0.55 * fadeIn(t, P.blocks, 0.6));
    const ta = fadeIn(t, P.therm - 0.2, 0.4) * fadeOut(t, P.blocks, 0.4);
    if (ta > 0) thermometer(stage, t, P, ta);
    const ba = fadeIn(t, P.blocks + 0.3, 0.4);
    if (ba > 0) stageBlocks(stage, t, P, ba);
  });
}

// ------------------------------------------------------------------ tests: 1952 Ivy Mike (schematic Enewetak, island → crater), 1954 Castle Bravo (fallout band)
const MAPR = {x: 140, y: 330, w: 800, h: 990};
const ringPt = phi => [16 * Math.cos(phi) + 1.2 * Math.cos(3 * phi), 13 * Math.sin(phi) + 0.8 * Math.sin(2 * phi)];
const ELUG_PHI = -1.75, ELUG = ringPt(ELUG_PHI);
const ISLETS = [[-1.75, 1.2, 1], [-1.6, 0.8], [-1.9, 0.9], [-1.47, 0.6], [-2.08, 0.7], [-2.5, 1.4], [-2.9, 2.2], [2.9, 1.1], [2.4, 2.6], [1.9, 1.2], [1.2, 0.9], [0.7, 1.6], [0.25, 2.4], [-0.3, 1.2], [-0.8, 1.6], [-1.15, 0.8]];
function mapCam(t, P) {
  const e = easeInOut(clamp((t - P.zoom[0]) / (P.zoom[1] - P.zoom[0]))), s0 = 22, s1 = 115, s = Math.exp(lerp(Math.log(s0), Math.log(s1), e)), k = (1 - s0 / s) / (1 - s0 / s1);
  const c = [lerp(0, ELUG[0], k), lerp(-1.5, ELUG[1], k)];
  return {s, P: ([x, y]) => [540 + (x - c[0]) * s, 840 + (y - c[1]) * s]};
}
function seaPanel(c, a = 1) {
  const g = c.createLinearGradient(0, MAPR.y, 0, MAPR.y + MAPR.h); g.addColorStop(0, PAL.sea); g.addColorStop(1, PAL.sea2);
  rect(c, MAPR.x, MAPR.y, MAPR.w, MAPR.h, 18, g);
  withAlpha(c, a * 0.5, () => { for (let k = 1; k < 8; k++) { line(c, [[MAPR.x + k * 100, MAPR.y], [MAPR.x + k * 100, MAPR.y + MAPR.h]], rgba('#3A5A9A', 0.25), 1); } for (let k = 1; k < 10; k++) line(c, [[MAPR.x, MAPR.y + k * 100], [MAPR.x + MAPR.w, MAPR.y + k * 100]], rgba('#3A5A9A', 0.25), 1); });
}
function islet(c, cam, phi, L, col, a = 1, w = 0.36) {
  const p = ringPt(phi), q = ringPt(phi + 0.01), ang = Math.atan2(q[1] - p[1], q[0] - p[0]), [x, y] = cam.P(p);
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.rotate(ang); rect(c, -L * cam.s / 2, -w * cam.s / 2, L * cam.s, w * cam.s, w * cam.s / 2, col); c.restore(); });
}
function ivyMike(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, cam = mapCam(t, P);
  withAlpha(c, a, () => {
    clipRect(c, MAPR.x, MAPR.y, MAPR.w, MAPR.h, 18, () => {
      seaPanel(c);
      const pts = []; for (let i = 0; i <= 180; i++) pts.push(cam.P(ringPt(i / 180 * TAU)));
      poly(c, pts, rgba('#1C4C86', 0.55));                                         // lagoon
      line(c, pts, rgba(PAL.reef, 0.55), Math.max(3, 0.6 * cam.s));                // reef
      const boom = t - P.mike, gone = boom > 0.35;
      for (const [phi, L, el] of ISLETS) { if (el) { if (!gone) islet(c, cam, phi, L, PAL.land, 1 - smooth((boom - 0.1) / 0.25)); } else islet(c, cam, phi, L, PAL.land, 0.95); }
      const E = cam.P(ELUG);
      if (boom > 0.2) {                                                             // crater (≈ 1.9 km across)
        const ca = smooth((boom - 0.2) / 0.6), R = 0.95 * cam.s;
        withAlpha(c, ca, () => { const g = c.createRadialGradient(E[0], E[1], 0, E[0], E[1], R); g.addColorStop(0, '#050E26'); g.addColorStop(0.8, '#0A1C44'); g.addColorStop(1, '#2C5C92'); circle(c, E[0], E[1], R, g); ring(c, E[0], E[1], R, rgba(PAL.reef, 0.8), 2.5); });
      }
      const wa = fadeIn(t, P.whole, 0.4);
      if (wa > 0) withAlpha(c, wa, () => { const p = ELUG, q = ringPt(ELUG_PHI + 0.01), ang = Math.atan2(q[1] - p[1], q[0] - p[0]); c.save(); c.translate(E[0], E[1]); c.rotate(ang); c.setLineDash([6, 6]); c.strokeStyle = rgba(PAL.land, 0.95); c.lineWidth = 2.5; c.beginPath(); c.roundRect(-0.6 * cam.s, -0.18 * cam.s, 1.2 * cam.s, 0.36 * cam.s, 0.18 * cam.s); c.stroke(); c.setLineDash([]); c.restore(); });
      if (boom > 0 && boom < 2.6) {                                                 // fireball (≈ 5 km across) and the shock ring
        const gb = glowBuf(), R = 2.6 * cam.s * (1 - Math.exp(-boom / 0.12)) * (1 + 0.15 * boom); hotBall(gb, t, E[0], E[1], R, {I: 1.3 * Math.exp(-boom / 0.7), halo: 1.2, col: HOTC, seed: 8, gran: 0.6, gscale: 0.6}); gb.flush(stage, {gain: 1.25, bloom: 0.55});
        const rq = boom / 1.6; if (rq < 1) ring(c, E[0], E[1], 60 + 760 * easeOut(rq), rgba('#FFE7C0', 0.7 * (1 - rq)), 3);
      }
    });
    const la = fadeIn(t, P.locator, 0.35) * fadeOut(t, P.mike + 0.3, 0.3), ma = fadeIn(t, P.mike + 0.7, 0.35);
    if (la > 0) tag(stage, '태평양 · 마셜 제도 · 에니웨톡 환초', 540, 372, {size: 26, a: la, plateA: 0.75});
    if (ma > 0) tag(stage, '1952 · Ivy Mike · 1,040만 톤', 540, 372, {size: 28, color: PAL.fus, a: ma, plateA: 0.75});
    const E = cam.P(ELUG), ea = fadeIn(t, P.zoom[1] - 0.2, 0.35) * fadeOut(t, P.mike, 0.2);
    if (ea > 0) withAlpha(c, ea, () => { line(c, [[E[0], E[1] - 30], [E[0], 640]], rgba(T.ink, 0.6), 1.5); tag(stage, '엘루겔라브섬', E[0], 612, {size: 28, plateA: 0.75}); });
    const ga = fadeIn(t, P.gone, 0.35);
    if (ga > 0) { tag(stage, '섬이 사라지고 분화구', 540, 612, {size: 28, color: T.ink, a: ga, plateA: 0.75}); tag(stage, '지름 약 1.9 km', 540, E[1] + 0.95 * cam.s + 44, {size: 28, color: PAL.reef, a: ga, plateA: 0.75}); }
    if (fadeIn(t, P.whole, 0.4) > 0) tag(stage, '점선: 섬이 있던 자리', 540, E[1] + 0.95 * cam.s + 92, {size: 24, color: PAL.land, a: fadeIn(t, P.whole, 0.4), plate: false});
    const z = cam.s > 60, km = z ? 1 : 10; line(c, [[910 - km * cam.s, 1285], [910, 1285]], T.ink, 3); stage.text(`${km} km`, 910 - km * cam.s / 2, 1258, {size: 24, weight: 700, color: T.ink, align: 'center'});
  });
}
const BRV = {gx: 215, gy: 820, s: 2.8, ang: 0.08, boatKm: 130, boatOff: 6};
const brvP = (along, lat = 0) => [BRV.gx + (along * Math.cos(BRV.ang) - lat * Math.sin(BRV.ang)) * BRV.s, BRV.gy + (along * Math.sin(BRV.ang) + lat * Math.cos(BRV.ang)) * BRV.s];
const FALL_P = (() => { const R = rng(1954), o = []; for (let i = 0; i < 150; i++) o.push({s0: R(), lat: R() * 2 - 1, sp: 0.8 + 0.4 * R(), r: 1 + 1.8 * R()}); return o; })();
function castleBravo(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, vk = BRV.boatKm / (P.reach - P.plume), L = clamp((t - P.plume) * vk, 0, 420), wOf = s => 9 + 0.22 * s;
  withAlpha(c, a, () => {
    clipRect(c, MAPR.x, MAPR.y, MAPR.w, MAPR.h, 18, () => {
      seaPanel(c);
      // the fallout band, carried east by the wind (schematic)
      if (L > 0) {
        const up = [], dn = []; for (let i = 0; i <= 40; i++) { const sx = L * i / 40, w = wOf(sx) * Math.min(1, (L - sx) / 30 + 0.25) ** 0.5; up.push(brvP(sx, -w)); dn.push(brvP(sx, w)); }
        const g = c.createLinearGradient(BRV.gx, 0, brvP(L)[0], 0); g.addColorStop(0, rgba(PAL.fall, 0.5)); g.addColorStop(1, rgba(PAL.fall, 0.12));
        poly(c, [...up, ...dn.reverse()], g, rgba(PAL.fall, 0.55), 1.5);
        for (const p of FALL_P) { const sx = ((t - P.plume) * vk * p.sp * 0.95 - p.s0 * 260); if (sx < 2 || sx > L) continue; const [x, y] = brvP(sx, p.lat * wOf(sx) * 0.85); circle(c, x, y, p.r, rgba('#F1D6A8', 0.6 * (1 - sx / 460))); }
      }
      // Bikini atoll (schematic ring)
      const rp = []; for (let i = 0; i <= 60; i++) { const ph = i / 60 * TAU; rp.push([BRV.gx + 20 * Math.cos(ph) * BRV.s, BRV.gy + 9 * Math.sin(ph) * BRV.s]); }
      line(c, rp, rgba(PAL.reef, 0.85), 3);
      const ba = t - P.bravo; if (ba > 0 && ba < 1.6) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, BRV.gx, BRV.gy, 90, '#FFD9A0', 0.9 * Math.exp(-ba / 0.4)); c.restore(); }
      circle(c, BRV.gx, BRV.gy, 5, PAL.fus);
      // the fishing boat (a point; no people drawn)
      const bo = fadeIn(t, P.boat, 0.35), [bx0, by0] = brvP(BRV.boatKm, BRV.boatOff);
      if (bo > 0) withAlpha(c, bo, () => { poly(c, [[bx0 - 14, by0 - 3], [bx0 + 14, by0 - 3], [bx0 + 9, by0 + 6], [bx0 - 9, by0 + 6]], '#E8EEFA'); line(c, [[bx0 - 2, by0 - 3], [bx0 - 2, by0 - 18]], '#E8EEFA', 2); ring(c, bx0, by0, 26, rgba('#E8EEFA', 0.75), 1.5); });
    });
    const wa = fadeIn(t, P.plume, 0.4);
    if (wa > 0) withAlpha(c, wa, () => { for (const x of [330, 520, 710]) arrow(c, [x, 1180], [x + 100, 1180], rgba('#BCD0F5', 0.85), 3, {head: 14}); stage.text('바람', 300, 1180, {size: 26, weight: 700, color: '#BCD0F5', align: 'right'});
      if (L > 60) { const [lx, ly] = brvP(Math.min(L * 0.5, 70), 0); stage.text('낙진', lx, ly, {role: 'display', size: 30, weight: 700, color: '#FFF1DC', align: 'center', shadow: 'rgba(0,0,0,0.9)'}); } });
    const da = fadeIn(t, P.km100, 0.35), [bx0, by0] = brvP(BRV.boatKm, BRV.boatOff);
    if (da > 0) withAlpha(c, da, () => { const y = 690; line(c, [[BRV.gx, y], [bx0, y]], T.ink, 2.5); line(c, [[BRV.gx, y - 10], [BRV.gx, y + 10]], T.ink, 2.5); line(c, [[bx0, y - 10], [bx0, y + 10]], T.ink, 2.5);
      line(c, [[BRV.gx, y + 12], [BRV.gx, BRV.gy - 10]], rgba(T.ink, 0.35), 1, {dash: [3, 4]}); line(c, [[bx0, y + 12], [bx0, by0 - 28]], rgba(T.ink, 0.35), 1, {dash: [3, 4]});
      stage.text('약 130 km · 100 km 넘게', (BRV.gx + bx0) / 2, y - 26, {size: 26, weight: 700, color: T.ink, align: 'center'}); });
    const bl = fadeIn(t, P.bikini, 0.35); if (bl > 0) tag(stage, '비키니 환초', BRV.gx, BRV.gy + 50, {size: 26, a: bl, plateA: 0.7});
    const bo = fadeIn(t, P.boat, 0.35); if (bo > 0) { tag(stage, '일본 어선 (제5후쿠류마루)', bx0 + 40, by0 + 120, {size: 26, a: bo, plateA: 0.7}); }
    const cr = fadeIn(t, P.crew, 0.5); if (cr > 0) tag(stage, '선원 23명이 방사선 피해', bx0 + 40, by0 + 166, {size: 26, color: T.muted, a: cr, plate: false});
    const ta = fadeIn(t, P.bravo + 0.3, 0.35); if (ta > 0) tag(stage, '1954 · Castle Bravo · 1,500만 톤', 540, 372, {size: 28, color: PAL.fus, a: ta, plateA: 0.75});
    line(c, [[910 - 100 * BRV.s, 1285], [910, 1285]], T.ink, 3); stage.text('100 km', 910 - 50 * BRV.s, 1258, {size: 24, weight: 700, color: T.ink, align: 'center'});
  });
}
function testsScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const a1 = fadeOut(t, P.map2, 0.5), a2 = fadeIn(t, P.map2 + 0.2, 0.5);
    if (a1 > 0) ivyMike(stage, t, P, a1);
    if (a2 > 0) castleBravo(stage, t, P, a2);
    tag(stage, '모식도', 160, 1285, {size: 24, color: stage.theme.muted, plate: false, align: 'left'});
  });
}

// ------------------------------------------------------------------ compare: energy per kg on a log axis (chemical ≪ fission < fusion), then "more fuel → more energy"
const LG = {x0: 250, x1: 900, l0: 7, l1: 15};
const lgx = v => LG.x0 + (Math.log10(v) - LG.l0) / (LG.l1 - LG.l0) * (LG.x1 - LG.x0);
/** a log bar rising one decade per DEC_S from 10⁷ */
function logBar(stage, t, t0, v, y, col, h = 32) {
  const c = stage.ctx, d = Math.log10(v) - LG.l0, k = clamp((t - t0) / DEC_S, 0, d);
  rect(c, LG.x0, y - h / 2, lgx(v) - LG.x0, h, 6, null, rgba(col, 0.3), 1.5);
  if (k <= 0) return 0;
  const xe = LG.x0 + k / (LG.l1 - LG.l0) * (LG.x1 - LG.x0), g = c.createLinearGradient(LG.x0, 0, xe, 0); g.addColorStop(0, rgba(col, 0.35)); g.addColorStop(1, rgba(col, 0.95));
  rect(c, LG.x0, y - h / 2, xe - LG.x0, h, 6, g);
  if (k < d) { c.save(); c.globalCompositeOperation = 'lighter'; glow(c, xe, y, 60, col, 0.4); c.restore(); }
  return k / d;
}
const sci = v => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)}×10${sup(e)} J`; };
function logAxis(stage, y0, y1) {
  const c = stage.ctx, T = stage.theme;
  for (let l = LG.l0; l <= LG.l1; l++) { line(c, [[lgx(10 ** l), y0], [lgx(10 ** l), y1]], rgba(PAL.grid, l % 2 ? 0.35 : 0.7), 1); if (l % 2 === 0) stage.text(`10${sup(l)}`, lgx(10 ** l), y1 + 24, {size: 24, color: T.muted, align: 'center'}); }
}
function compareScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    stage.text('1 kg에서 나오는 에너지 (로그 눈금)', 150, 392, {size: 26, weight: 700, color: T.ink});
    logAxis(stage, 430, 830);
    const rows = [{y: 520, v: EPM.chem, t0: P.cmpChem, col: PAL.chem, lb: '수소가 탈 때 (화학)', pct: ''}, {y: 650, v: EPM.fis, t0: P.cmpFis, col: PAL.fis, lb: '우라늄-235 핵분열', pct: '질량의 0.09%'}, {y: 780, v: EPM.fus, t0: P.cmpFus, col: PAL.fus, lb: '중수소·삼중수소 핵융합', pct: '질량의 0.38%'}];
    for (const r of rows) {
      const hl = r.v === EPM.fus ? fadeIn(t, P.cmpFus, 0.3) : r.v === EPM.fis ? fadeIn(t, P.cmpFis, 0.3) : fadeIn(t, P.cmpChem, 0.3);
      withAlpha(c, 0.35 + 0.65 * hl, () => {
        stage.text(r.lb, 150, r.y - 42, {size: 26, weight: 700, color: T.ink});
        const q = logBar(stage, t, r.t0, r.v, r.y, r.col);
        if (q >= 1) { stage.text(sci(r.v), 930, r.y - 42, {role: 'display', size: 26, weight: 700, color: r.col, align: 'right'}); }
      });
    }
    const fa = fadeIn(t, P.four, 0.3);
    if (fa > 0) withAlpha(c, fa, () => {
      const x = 912; line(c, [[x, 650], [x, 780]], PAL.answer, 3); line(c, [[x - 10, 650], [x, 650]], PAL.answer, 3); line(c, [[x - 10, 780], [x, 780]], PAL.answer, 3);
      stage.text('약 4배', 700, 716, {role: 'display', size: 36, weight: 700, color: PAL.answer, align: 'center'});
      stage.text('질량의 0.09%', LG.x0 + 8, 650 + 2, {size: 24, weight: 700, color: '#0A1630'}); stage.text('질량의 0.38%가 에너지로', LG.x0 + 8, 780 + 2, {size: 24, weight: 700, color: '#2A1606'});
      // the same comparison on an ordinary (linear) scale
      stage.text('보통 눈금으로 보면', 150, 900, {size: 24, weight: 700, color: T.muted});
      const k = easeOut(clamp((t - P.four) / 0.6)), W1 = 145;
      rect(c, 250, 935, W1, 26, 5, PAL.fis); rect(c, 250, 975, W1 * FUS_X_FIS * k, 26, 5, PAL.fus);
      stage.text('핵분열 1', 150, 948, {size: 24, color: T.muted}); stage.text('핵융합', 150, 988, {size: 24, color: T.muted});
      stage.text(`${FUS_X_FIS.toFixed(1)}`, 250 + W1 * FUS_X_FIS * k + 12, 988, {size: 24, weight: 700, color: PAL.fus});
    });
    // more fuel → proportionally more energy (explanatory)
    const ua = fadeIn(t, P.fuelK[0] - 0.1, 0.35);
    if (ua > 0) withAlpha(c, ua, () => {
      stage.text('연료를 늘리면', 150, 1080, {size: 26, weight: 700, color: T.ink});
      const n = P.fuelK.filter(x => t >= x).length;
      for (let k = 0; k < 3; k++) { const q = fadeIn(t, P.fuelK[k], 0.25), x = 170 + k * 62, y = 1150; rect(c, x, y, 50, 50, 6, k < n ? rgba(PAL.fus, 0.25 + 0.6 * q) : null, rgba(PAL.fus, 0.6), 2); }
      const tgt = n / 3, cur = n === 0 ? 0 : lerp((n - 1) / 3, tgt, easeOut(clamp((t - P.fuelK[n - 1]) / 0.5)));
      rect(c, 380, 1155, 550, 40, 8, rgba(PAL.grid, 1)); if (cur > 0) rect(c, 380, 1155, 550 * cur, 40, 8, PAL.fus);
      stage.text(`연료 × ${Math.max(1, n)}`, 170, 1240, {role: 'display', size: 30, weight: 700, color: PAL.fus});
      stage.text(`나오는 에너지 × ${Math.max(1, n)}`, 930, 1240, {role: 'display', size: 30, weight: 700, color: PAL.fus, align: 'right'});
      tag(stage, '설명용', 930, 1080, {size: 24, color: T.muted, plate: false, align: 'right'});
    });
  });
}

// ------------------------------------------------------------------ myth: burning hydrogen (electrons change partners) ≠ fusing nuclei; same 1 kg → ×2.4 million
const COLL = 330, COLR = 750, MY = 640;
const CHEM_R = {H1: [-120, 40], H2: [-80, 40], H3: [80, 40], H4: [120, 40], O1: [-22, -60], O2: [22, -60]};
const CHEM_P = {H1: [-110, 40], H2: [-30, 40], H3: [30, 40], H4: [110, 40], O1: [-70, -6], O2: [70, -6]};
const PAIRS = [[['H1', 'H2'], ['O1', 'H1']], [['H3', 'H4'], ['O2', 'H3']], [['O1', 'O2'], ['O1', 'H2']], [['O1', 'O2'], ['O2', 'H4']]];
function chemAtom(c, x, y, k, a = 1) {
  const R = k === 'O' ? 34 : 25, col = k === 'O' ? '#E0665E' : '#E6ECF6';
  withAlpha(c, a, () => { const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, rgba('#7CC4FF', 0.32)); g.addColorStop(1, rgba('#7CC4FF', 0)); circle(c, x, y, R, g); ring(c, x, y, R * 0.8, rgba('#7CC4FF', 0.35), 1); circle(c, x, y, k === 'O' ? 8 : 6, col); });
}
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const up = 1 - 0.45 * fadeIn(t, P.bars18, 0.5);
    withAlpha(c, up, () => {
      stage.text('수소 가스가 타는 폭발', COLL, 400, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
      stage.text('수소폭탄', COLR, 400, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
      line(c, [[540, 440], [540, 930]], rgba(T.border, 1), 1.5);
      // left: the balloon and its flame (s16) → molecules (s17)
      const mol = fadeIn(t, P.chemIn, 0.45), bal = 1 - mol;
      if (bal > 0) withAlpha(c, bal, () => {
        const ig = t - P.ignite, bo = 1 - smooth(ig / 0.25);
        if (bo > 0) withAlpha(c, bo, () => { ring(c, COLL, MY - 10, 105, rgba('#C9D3E6', 0.8), 2.5); line(c, [[COLL, MY + 95], [COLL - 6, MY + 200]], rgba('#C9D3E6', 0.6), 1.5); });
        for (let k = 0; k < 6; k++) { const ph = k * 1.9, x = COLL + Math.cos(ph + t * 0.6) * 55 * (0.4 + 0.6 * rand(k)), y = MY - 10 + Math.sin(ph * 1.3 + t * 0.5) * 50 * (0.4 + 0.6 * rand(k + 9)); withAlpha(c, bo, () => { circle(c, x - 9, y, 8, '#E6ECF6'); circle(c, x + 9, y, 8, '#E6ECF6'); line(c, [[x - 9, y], [x + 9, y]], '#E6ECF6', 3); }); }
        if (ig > 0) { const q = clamp(ig / 1.6), R = 60 + 110 * easeOut(q), g = c.createRadialGradient(COLL, MY - 10, 0, COLL, MY - 10, R);
          g.addColorStop(0, rgba('#FFE4A8', 0.85 * (1 - q * 0.6))); g.addColorStop(0.5, rgba('#FF9A50', 0.55 * (1 - q * 0.5))); g.addColorStop(0.85, rgba('#5E8BE0', 0.25 * (1 - q))); g.addColorStop(1, rgba('#5E8BE0', 0));
          c.save(); c.globalCompositeOperation = 'lighter'; circle(c, COLL, MY - 10, R, g); c.restore(); }
      });
      if (mol > 0) withAlpha(c, mol, () => {
        const u = easeInOut(clamp((t - P.swap) / 1.0)), pos = k => [COLL + lerp(CHEM_R[k][0], CHEM_P[k][0], u) * 1.35, MY + lerp(CHEM_R[k][1], CHEM_P[k][1], u) * 1.35];
        const R0 = k => [COLL + CHEM_R[k][0] * 1.35, MY + CHEM_R[k][1] * 1.35], P0 = k => [COLL + CHEM_P[k][0] * 1.35, MY + CHEM_P[k][1] * 1.35];
        const bonds = u < 0.5 ? [['H1', 'H2'], ['H3', 'H4'], ['O1', 'O2']] : [['O1', 'H1'], ['O1', 'H2'], ['O2', 'H3'], ['O2', 'H4']];
        for (const [a2, b2] of bonds) line(c, [pos(a2), pos(b2)], rgba('#C9D3E6', 0.5 * Math.abs(u - 0.5) * 2), 2);
        for (const k of ['O1', 'O2', 'H1', 'H2', 'H3', 'H4']) chemAtom(c, ...pos(k), k[0]);
        PAIRS.forEach(([from, to], i) => { const mid = (A2, B2, f) => { const p1 = f(A2), p2 = f(B2); return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]; };
          const m0 = mid(...from, R0), m1 = mid(...to, P0), off = from[0] === 'O1' && from[1] === 'O2' ? (i === 2 ? -7 : 7) : 0, m = [lerp(m0[0], m1[0], u), lerp(m0[1] + off, m1[1], u) - 26 * Math.sin(u * Math.PI)];
          for (const s2 of [-1, 1]) circle(c, m[0] + s2 * 5, m[1], 4.5, '#7CC4FF'); });
        const la = fadeIn(t, P.swap + 0.2, 0.4);
        if (la > 0) withAlpha(c, la, () => { stage.text('● ● 전자쌍', COLL - 150, MY - 150, {size: 24, weight: 700, color: '#7CC4FF'}); stage.text('· 원자핵 그대로', COLL + 10, MY - 150, {size: 24, weight: 700, color: T.muted}); });
        const ca = fadeIn(t, P.chemLbl, 0.35);
        if (ca > 0) withAlpha(c, ca, () => { stage.text('화학 반응', COLL, 862, {role: 'display', size: 36, weight: 700, color: '#7CC4FF', align: 'center'}); stage.text('전자가 짝을 바꿈', COLL, 906, {size: 26, weight: 700, color: T.muted, align: 'center'}); });
      });
      // right: a fusion fireball (s16) → D + T merging (s17)
      const nuc = fadeIn(t, P.nucIn, 0.45);
      if (nuc < 1) withAlpha(c, 1 - nuc, () => { const gb = glowBuf(); hotBall(gb, t, COLR, MY - 10, 78, {I: 1.1, halo: 1.3, col: HOTC, seed: 12, gran: 0.6, gscale: 0.6}); gb.flush(stage, {gain: 1.25, bloom: 0.5, alpha: 1 - nuc}); });
      if (nuc > 0) withAlpha(c, nuc, () => {
        const tc = P.merge17, u = clamp((t - P.nucIn) / (tc - P.nucIn));
        if (t < tc) { const e = easeIn(u); nucleus(c, lerp(COLR - 150, COLR - 24, e), MY, 18, 1, 1, {t, jig: 0.03}); nucleus(c, lerp(COLR + 150, COLR + 26, e), MY, 18, 1, 2, {t, jig: 0.03, rot: 0.6}); }
        else { const age = t - tc; flash(c, COLR, MY, age / 1.0, 120); nucleus(c, COLR - 18 * age, MY - 4 * age, 17, 2, 2, {t, jig: 0.03, rot: 0.5}); const nx = COLR + 72 * age; if (nx < 920) nucleon(c, nx, MY + 18 * age, 17, false); }
        const na = fadeIn(t, tc + 0.1, 0.35);
        if (na > 0) withAlpha(c, na, () => { stage.text('핵반응', COLR, 862, {role: 'display', size: 36, weight: 700, color: PAL.fus, align: 'center'}); stage.text('원자핵 자체가 합쳐짐', COLR, 906, {size: 26, weight: 700, color: T.muted, align: 'center'}); });
      });
      // the question sign: =? → ≠
      const qa = fadeIn(t, P.eqQ, 0.3), no = fadeIn(t, P.no, 0.25), ny = MY - 10;
      if (qa > 0 && t < P.chemIn + 0.4) withAlpha(c, qa * fadeOut(t, P.chemIn, 0.35), () => {
        circle(c, 540, ny, 46, rgba(T.plate, 0.95)); ring(c, 540, ny, 46, rgba(no > 0 ? PAL.answer : T.border, 1), 2);
        stage.text(no > 0.5 ? '≠' : '= ?', 540, ny + 2, {role: 'display', size: no > 0.5 ? 60 : 44, weight: 700, color: no > 0.5 ? PAL.answer : T.ink, align: 'center'});
      });
      if (no > 0 && t >= P.chemIn + 0.4) withAlpha(c, no, () => { circle(c, 540, ny, 34, rgba(T.plate, 0.95)); ring(c, 540, ny, 34, PAL.answer, 2); stage.text('≠', 540, ny + 2, {role: 'display', size: 48, weight: 700, color: PAL.answer, align: 'center'}); });
    });
    // s18: the same 1 kg of hydrogen, burned vs fused (log bars, as in the compare scene)
    const ba = fadeIn(t, P.bars18, 0.4);
    if (ba > 0) withAlpha(c, ba, () => {
      panel(c, T, 140, 970, 800, 360, 0.6, 14);
      stage.text('같은 1 kg의 수소에서 나오는 에너지 (로그)', 160, 1004, {size: 26, weight: 700, color: T.ink});
      for (let l = LG.l0; l <= LG.l1; l++) line(c, [[lgx(10 ** l), 1030], [lgx(10 ** l), 1240]], rgba(PAL.grid, l % 2 ? 0.35 : 0.7), 1);
      stage.text('탈 때 (화학 반응)', 160, 1050, {size: 24, weight: 700, color: '#7CC4FF'}); const q1 = logBar(stage, t, P.chem18, EPM.chem, 1086, '#7CC4FF', 28);
      if (q1 >= 1) stage.text(sci(EPM.chem), 920, 1050, {size: 24, weight: 700, color: '#7CC4FF', align: 'right'});
      stage.text('핵융합 (핵반응)', 160, 1144, {size: 24, weight: 700, color: PAL.fus}); const q2 = logBar(stage, t, P.fus18, EPM.fus, 1180, PAL.fus, 28);
      if (q2 >= 1) stage.text(sci(EPM.fus), 920, 1144, {size: 24, weight: 700, color: PAL.fus, align: 'right'});
      const ma = fadeIn(t, P.mil, 0.35);
      if (ma > 0) withAlpha(c, ma, () => { line(c, [[lgx(EPM.chem), 1216], [lgx(EPM.fus), 1216]], PAL.answer, 2.5); line(c, [[lgx(EPM.chem), 1206], [lgx(EPM.chem), 1226]], PAL.answer, 2.5); line(c, [[lgx(EPM.fus), 1206], [lgx(EPM.fus), 1226]], PAL.answer, 2.5);
        stage.text(`약 ${koNum(sig2(FUS_X_CHEM))} 배 → 수백만 배`, 540, 1280, {role: 'display', size: 38, weight: 700, color: PAL.answer, align: 'center'}); });
    });
  });
}

// ------------------------------------------------------------------ close: 1963 treaty → a tokamak (the same reaction, slowly and controlled) → the poster
function treatyCard(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme;
  withAlpha(c, a, () => {
    panel(c, T, 290, 345, 500, 285, 0.85, 14);
    stage.text('1963', 540, 400, {role: 'display', size: 58, weight: 700, color: T.ink, align: 'center'});
    stage.text('부분적 핵실험 금지 조약', 540, 455, {size: 28, weight: 700, color: T.muted, align: 'center'});
    const ia = fadeIn(t, P.icons, 0.35), names = ['대기권', '우주', '수중'];
    if (ia > 0) withAlpha(c, ia, () => [400, 540, 680].forEach((x, k) => {
      const y = 535;
      if (k === 0) { for (let j = 0; j < 3; j++) line(c, [[x - 30, y - 14 + j * 14], [x + 30, y - 14 + j * 14]], rgba('#BCD0F5', 0.8 - j * 0.2), 2); circle(c, x + 14, y - 22, 7, rgba(PAL.light, 0.9)); }
      if (k === 1) { circle(c, x, y, 13, '#7CC4FF'); c.save(); c.translate(x, y); c.rotate(-0.35); c.beginPath(); c.ellipse(0, 0, 34, 12, 0, 0, TAU); c.strokeStyle = rgba('#DDE6FF', 0.8); c.lineWidth = 2; c.stroke(); c.restore(); }
      if (k === 2) for (let j = 0; j < 3; j++) { const pts = []; for (let i = 0; i <= 20; i++) pts.push([x - 32 + i * 3.2, y - 14 + j * 14 + 4 * Math.sin(i / 20 * TAU * 1.5 + t * 2)]); line(c, pts, rgba('#7CC4FF', 0.85 - j * 0.2), 2); }
      stage.text(names[k], x, 594, {size: 24, weight: 700, color: T.ink, align: 'center'});
      const bq = clamp((t - P.ban[k]) / 0.25); if (bq > 0) { ring(c, x, y, 40, rgba(PAL.answer, 0.95), 3); line(c, [[x - 28, y + 28], [lerp(x - 28, x + 28, bq), lerp(y + 28, y - 28, bq)]], PAL.answer, 3.5); }
    }));
  });
}
const TOK = {cx: 540, cy: 1010, R: 300, a: 76, k: 0.36};
const tokP = (phi, rr = 0, th = 0) => { const rad = TOK.R + rr * Math.cos(th); return [TOK.cx + rad * Math.cos(phi), TOK.cy + rad * TOK.k * Math.sin(phi) - rr * Math.sin(th)]; };
function tokamak(stage, t, P, a) {
  const c = stage.ctx, T = stage.theme, w = 0.55;                                 // plasma pattern circulation (rad/s): slow
  withAlpha(c, a, () => {
    // vessel body (torus silhouette) with a darker inner hole
    c.save(); c.beginPath(); c.ellipse(TOK.cx, TOK.cy, TOK.R + TOK.a, TOK.R * TOK.k + TOK.a, 0, 0, TAU); c.ellipse(TOK.cx, TOK.cy - 4, TOK.R - TOK.a, Math.max(8, TOK.R * TOK.k - TOK.a * 0.9), 0, 0, TAU);
    const g = c.createLinearGradient(0, TOK.cy - TOK.R * TOK.k - TOK.a, 0, TOK.cy + TOK.R * TOK.k + TOK.a); g.addColorStop(0, '#2B3A62'); g.addColorStop(0.5, '#1A2546'); g.addColorStop(1, '#2E3D66');
    c.fillStyle = g; c.fill('evenodd'); c.strokeStyle = rgba('#8FA3CF', 0.6); c.lineWidth = 2; c.stroke(); c.restore();
    const coil = (phi, al) => { const pts = []; for (let i = 0; i <= 36; i++) pts.push(tokP(phi, TOK.a * 1.12, i / 36 * TAU)); line(c, pts, rgba('#B9C6E6', al), 2.5); };
    for (let k = 0; k < 18; k++) { const phi = k / 18 * TAU; if (Math.sin(phi) < 0) coil(phi, 0.35); }
    // plasma ring (glow), brightness pattern circulating slowly around the ring
    const gb = glowBuf();
    for (let i = 0; i < 120; i++) { const phi = i / 120 * TAU, [x, y] = tokP(phi), front = Math.sin(phi) > 0 ? 0.8 : 1, I = (0.55 + 0.45 * Math.cos(3 * phi - w * t) ** 2) * front; gb.splat(x, y, TOK.a * 1.15, PLASC, 0.075 * I); }
    for (let k = 0; k < P.tokFus.length; k++) { const q = (t - P.tokFus[k]) / 0.8; if (q < 0 || q > 1) continue; const [x, y] = tokP(rand(k * 4.7) * TAU); gb.splat(x, y, 46, FUSC, 1.2 * (1 - q)); }
    gb.flush(stage, {gain: 1.25, bloom: 0.5});
    // a helical magnetic field line on the plasma surface
    let seg = [], prevFront = null;
    for (let i = 0; i <= 600; i++) { const phi = i / 600 * TAU, th = 4 * phi + 0.35 * t, p = tokP(phi, TOK.a * 0.55, th), front = Math.sin(phi) > 0;
      if (prevFront !== null && front !== prevFront) { line(c, seg, rgba(PAL.light, prevFront ? 0.7 : 0.25), 1.5); seg = [seg.at(-1)]; } seg.push(p); prevFront = front; }
    line(c, seg, rgba(PAL.light, prevFront ? 0.7 : 0.25), 1.5);
    for (let k = 0; k < 18; k++) { const phi = k / 18 * TAU; if (Math.sin(phi) >= 0) coil(phi, 0.8); }
    const la = fadeIn(t, P.tok + 0.3, 0.4), sa = fadeIn(t, P.slow, 0.35), ka = fadeIn(t, P.power, 0.35);
    if (la > 0) withAlpha(c, la, () => stage.text('토카막 · 핵융합 발전 연구 장치', 540, 720, {role: 'display', size: 32, weight: 700, color: T.ink, align: 'center'}));
    if (sa > 0) withAlpha(c, sa, () => stage.text('자기장으로 가둔 뜨거운 플라스마 · 천천히, 계속', 540, 764, {size: 26, weight: 700, color: '#FFB7C6', align: 'center'}));
    if (ka > 0) withAlpha(c, ka, () => stage.text('예: KSTAR (한국)', 540, 1290, {size: 26, weight: 700, color: T.muted, align: 'center'}));
    tag(stage, '모식도', 925, 1290, {size: 24, color: T.muted, plate: false, align: 'right'});
  });
}
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), fin = fadeIn(t, P.poster, 0.6), out = 1 - fin;
  if (out > 0) withAlpha(c, out * fadeIn(t, ctx.scene.start, 0.22), () => {
    treatyCard(stage, t, P, fadeIn(t, P.treaty, 0.4) * (1 - 0.35 * fadeIn(t, P.tok, 0.5)));
    const ta = fadeIn(t, P.tok, 0.6); if (ta > 0) tokamak(stage, t, P, ta);
  });
  if (fin > 0) withAlpha(c, fin, () => {
    const tr = POSTER_TAU + (t - ctx.tl.duration);                              // ends on the thumbnail state
    skyPicture(stage, t - ctx.tl.duration, cloudState(POSTER_TAU, true), tr, {poster: 1});
    captionShade(c, 1);
    posterTitle(stage, t, 0, 1);
  });
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - One fusion (any scene) → a low chord-like tick (131 + 196 + 262 Hz together); fission → a single low tick (110–123 Hz).
//    In the barrier scene the chord ticks come from the same fusion times as the flashes, so their rate climbs steeply with
//    the temperature knob (relative rate ×10⁻⁸ at 1천만 도 → 1 at 1억 도).
//  - A nucleus bouncing off the Coulomb hill → a dull thud (70 Hz + low noise) at the turning point.
//  - Log bars (yields, energy per kg) → a short tone at every decade crossed, one minor third higher per decade (98·2^(k/4) Hz).
//  - Temperature knob → a soft tone whose pitch follows log₁₀T; the tokamak → a low steady hum.
//  - Stage 1 (fission) → a low thump; stage 2 (fusion) → a deeper, longer swell (level capped).
//  - The fallout beat (1954) is nearly silent: a faint wind only.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe). Synthetic explanatory sounds, not recordings.
// =====================================================================================================
export const knobHz = T => 70 + 26 * Math.log10(T / 1e6);
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const envNoise = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.3, o.fo ?? 0.5)), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 30, high: o.high ?? 160, fade: 0.05, points: Q.filter((q, i) => i === 0 || i === Q.length - 1 || Math.abs(q[1] - Q[i - 1][1]) > 1e-4 || Math.abs(q[1] - Q[i + 1][1]) > 1e-4)}, means}); };
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const chordL = (off, g = 0, dec = 0.13) => [[131, 0], [196, -4], [262, -8]].map(([f, d]) => ({kind: 'tick', offset: r(off, 4), params: {freq: f, decay: dec, click: 0, gain_db: g + d}}));
  const chords = (id, times, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.flatMap((tt, k) => chordL(tt - times[0], o.gains ? o.gains[k] : 0, o.decay))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58, dur = 0.6) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur, harmonics: [1, 0.35], attack: 0.006, decay: dur * 0.33, release: dur * 0.33, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: dur * 0.5, low: 30, high: 200, release: dur * 0.35, gain_db: -9}}]}, means});
  const tapL = off => [{kind: 'tone', offset: r(off, 4), params: {freq: 70, dur: 0.2, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}, {kind: 'noise', offset: r(off, 4), params: {dur: 0.09, low: 40, high: 200, attack: 0.002, release: 0.07, gain_db: -8}}];
  const thuds = (id, times, means, gain = -30) => { const T0 = [].concat(times); if (!T0.length) return; ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => tapL(tt - T0[0]))}, means}); };
  /** decade steps of a log bar starting at t0 (one decade per DEC_S), k0 = decade index at the bar's foot */
  const steps = (id, t0, decades, gain, means, k0 = 0) => { const L = []; for (let k = 1; k <= Math.floor(decades + 1e-9); k++) L.push({kind: 'tone', offset: r(k * DEC_S - DEC_S * 0.02, 4), params: {freq: r(stepHz(k0 + k), 2), dur: 0.16, harmonics: [1, 0.25], attack: 0.004, decay: 0.06, sustain: 0.2, release: 0.07, gain_db: 0}});
    ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: L}, means}); };

  // ---- hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 지평선의 불덩이와 대기층을 뚫은 버섯구름', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  thump('detonation', P.det, '폭발 재현의 섬광과 불덩이 (Tsar Bomba 모식 재현)', -30, 44, 1.4);
  envNoise('cloud_rise', P.det + 0.05, P.top64, tt => clamp(0.25 + (cloudTopKm(P.tau(tt) + 0.2) - cloudTopKm(P.tau(tt) - 0.2)) / 2.4), -35, '버섯구름이 솟는 빠르기 → 낮은 우르릉의 세기 (모식, 시간 압축; 실제 소리 아님)', {low: 28, high: 150, fi: 0.4, fo: 1.2});
  tick('cross12', P.cross12, 82, -34, '구름 꼭대기가 대류권 경계(12 km)를 지남', {decay: 0.16});
  tick('cross50', P.cross50, 98, -34, '구름 꼭대기가 성층권 경계(50 km)를 지남', {decay: 0.16});
  tick('tsar_tag', P.tsarTag, 131, -34, '"Tsar Bomba · 1961 · 소련" 막대 표시', {decay: 0.12});
  steps('hiro_bar', P.hiro0, Math.log10(YIELD.hiro), -33, '히로시마 막대(로그): 한 자릿수(×10) 오를 때마다 단3도씩 높아지는 음 (1톤 → 1만 5천 톤, 4번)');
  steps('tsar_bar', P.tsar0, Math.log10(YIELD.tsar), -33, 'Tsar Bomba 막대(로그): 같은 대응으로 7번 (1톤 → 5천만 톤)');
  swell('x3300', P.bracket, [98, 147], '"× 3,300" 괄호 (히로시마 → Tsar Bomba)', {dur: 1.5, gain: -33});
  tick('ruler', P.ruler + 0.2, 110, -35, '고도 눈금과 대기층 이름', {decay: 0.12});
  tick('km60', P.km60, 147, -34, '구름 꼭대기 읽음값 60 km', {decay: 0.12});
  tick('plane', P.plane, 165, -34, '여객기 순항 높이 약 10 km 표시', {decay: 0.12});
  ticks('six', P.segT, P.segT.map((_, k) => r(110 * 2 ** (2 * k / 12), 2)), -34, '여객기 높이(10 km) 여섯 칸이 차례로 쌓임 (한 칸마다 온음씩 높아짐)', {decay: 0.1});
  swell('six_done', P.sixDone, [110, 165], '"10 km × 6 = 60 km" (구름은 64 km)', {dur: 1.4, gain: -34});
  // ---- origin
  tick('lavoisier', P.lav, 131, -34, '"Lavoisier · 1780년대 프랑스"', {decay: 0.12});
  tick('hydro', P.hydro, 147, -34, '"hydro = 물"', {decay: 0.1}); tick('gene', P.gene, 165, -34, '"gène = 만드는 것"', {decay: 0.1});
  ticks('burn_water', P.rx, 262, -36, `수소와 산소가 만나 물이 되는 순간 (${P.rx.length}번, 화학 반응: 짧고 가벼운 틱)`, {decay: 0.04});
  tick('han_arrow', P.arrowHan, 123, -35, '"뜻을 옮김" 화살표', {decay: 0.12});
  ticks('hanja', [P.su, P.so, P.eq], [147, 165, 196], -34, '水 (물 수) · 素 (바탕 소) · = 수소', {decay: 0.12});
  // ---- essence
  whoosh('lens', P.core, 0.7, 90, 160, '태양 중심을 확대하는 원이 열림', -35);
  chords('sun_fusion', [P.merge5], -30, '태양 중심: 수소 원자핵 4개가 헬륨 하나로 합쳐짐 (융합 화음 틱)');
  chords('sun_more', P.sunFus.slice(1).filter(x => x < P.balance), -36, '중심에서 이어지는 다른 융합들 (작은 화음 틱)');
  swell('light', P.light5, [131, 196], '빛과 열이 퍼져 나감', {dur: 1.4, gain: -34});
  tick('fusion_word', P.fusionLbl, 147, -34, '"핵융합" 표시', {decay: 0.12});
  chirp('tilt', P.tilt, P.tilt + 1.2, tt => 147 - 24 * smooth((tt - P.tilt) / 0.8), () => 0.35, -34, '저울이 수소 쪽으로 기움 (헬륨이 0.7% 가벼움; 기울기 과장)', {fi: 0.05, fo: 0.4});
  swell('vanish', P.vanish, [131, 196, 262], '사라진 질량 0.7%가 빛으로 (E = mc²)', {dur: 1.6, gain: -33});
  // ---- barrier
  thuds('bounce', P.bounces.filter(x => x < tl.scene('barrier').end), `원자핵이 밀어냄 언덕에서 튕겨 나감 (${P.bounces.length}번, 둔한 툭)`, -30);
  chords('hill_pass', P.passes, -31, '아주 빠른 원자핵이 언덕 꼭대기 가까이에서 지나 합쳐짐 (융합 화음 틱)');
  chirp('knob', P.k0 - 0.1, P.k1 + 0.4, tt => knobHz(P.T(tt)), () => 0.3, -36, `온도 손잡이 100만 → 1.2억 도: 로그 온도 → 음높이 ${knobHz(1e6).toFixed(0)} → ${knobHz(1.2e8).toFixed(0)} Hz`, {fi: 0.1, fo: 0.3});
  const bf = thin(P.boxFus, 0.12);
  chords('box_fusion', bf, -36, `원자핵 기체 속 융합 ${bf.length}번 (같은 화음 틱): 온도가 1억 도에 가까워지면 갑자기 잦아짐 (설명 모형: 융합 빈도는 1천만 도에서 1억 도의 1억분의 1 수준)`, {decay: 0.1});
  tick('thermo', P.thermo, 147, -34, '"열(thermo) + 핵(nuclear)"', {decay: 0.12});
  swell('thermo_name', P.thermoName, [110, 165], '"= 열핵반응"', {dur: 1.4, gain: -33});
  // ---- fuel
  ticks('isotopes', [P.nH, P.nD, P.nT], [196, 165, 147], -33, '수소 · 중수소 · 삼중수소 원자핵 (무거울수록 낮은 틱)', {decay: 0.12});
  tick('siblings', P.sib, 131, -35, '"양성자가 1개 → 모두 수소"', {decay: 0.12});
  whoosh('dt_glide', P.move + 0.1, P.hit - P.move - 0.3, 90, 150, 'D와 T가 반응 자리로 내려옴', -36);
  chords('dt_fusion', [P.hit], -29, 'D + T가 합쳐짐 → 헬륨 + 중성자 (융합 화음 틱)', {decay: 0.18});
  whoosh('neutron', P.hit + 0.05, 1.6, 300, 120, '빠른 중성자가 튀어나감 (헬륨보다 4배 빠름)', -35);
  ticks('mev', [P.eLbl, P.eLbl + 0.25], [147, 165], -34, '"헬륨 3.5 MeV" · "중성자 14.1 MeV"', {decay: 0.1});
  swell('mev_sum', P.sumLbl, [131, 196], '"합계 17.6 MeV · 질량의 0.38%"', {dur: 1.3, gain: -34});
  // ---- trigger
  whoosh('curve', P.curve, 1.2, 80, 160, '결합 에너지 곡선이 그려짐 (측정값)', -36);
  tick('need', P.therm, 131, -34, '"핵융합에 필요 · 1억 도" 표시', {decay: 0.12});
  tick('hot_flame', P.flame, 147, -35, '"가장 뜨거운 불꽃 · 수천 도"', {decay: 0.1});
  tick('fission_arrow', P.fis, 110, -31, '핵분열 화살표(우라늄 → 철 쪽)와 온도 막대가 한순간에 1억 도 쪽으로 (분열: 단일 틱)', {decay: 0.18});
  chords('fusion_arrow', [P.fus], -33, '핵융합 화살표(수소 → 헬륨)');
  swell('trigger_link', P.trig, [98, 147], '"방아쇠" 연결', {dur: 1.3, gain: -34});
  thump('stage1', P.stage1, '1단계 블록: 핵분열 (낮은 쿵)', -29, 62, 0.7);
  ticks('fission_chain', FIS_HIT.map(h => P.stage1 + h), [123, 110, 123, 110, 123, 110], -36, '1단계 블록 안에서 무거운 원자핵이 차례로 쪼개짐 (분열: 단일 틱 6번)', {decay: 0.08});
  whoosh('heat_arrow', P.heatArrow, 1.0, 100, 220, '"열 · 압력" 화살표가 2단계로', -34);
  chirp('stage2_heat', P.dens, P.hot + 1.0, tt => knobHz(P.T2(tt)), () => 0.3, -36, `2단계 연료가 짓눌려 달궈짐: 같은 대응(로그 온도 → 음높이) ${knobHz(1e6).toFixed(0)} → ${knobHz(BURN.T1).toFixed(0)} Hz`, {fi: 0.15, fo: 0.3});
  const bt = thin(P.burnT, 0.07);
  chords('burst', bt, -38, `2단계: 핵융합이 한꺼번에 (${bt.length}번의 화음 틱, 0.07초 넘게 떨어진 것만)`, {decay: 0.08});
  swell('stage2', P.burst - 0.15, [41, 55, 82], '2단계: 1단계보다 더 낮고 큰 부풂 (음량은 제한)', {dur: 3.0, attack: 0.25, gain: -32});
  // ---- tests
  tick('locator', P.locator, 131, -35, '"태평양 · 마셜 제도 · 에니웨톡 환초"', {decay: 0.12});
  whoosh('zoom', P.zoom[0], P.zoom[1] - P.zoom[0], 80, 140, '엘루겔라브섬으로 확대', -36);
  thump('mike', P.mike, '1952 Ivy Mike: 섬 위의 불덩이 (모식)', -31, 44, 1.2);
  chirp('island_gone', P.gone, P.gone + 1.0, tt => 131 - 50 * smooth((tt - P.gone) / 0.9), () => 0.3, -35, '섬이 사라지고 지름 약 1.9 km 분화구', {fi: 0.05, fo: 0.4});
  tick('outline', P.whole, 98, -37, '"점선: 섬이 있던 자리"', {decay: 0.14});
  tick('bikini', P.bikini, 110, -40, '"비키니 환초" (낙진 장면: 소리를 줄임)', {decay: 0.12});
  tick('bravo', P.bravo, 55, -40, '1954 Castle Bravo 시험 (작고 둔하게)', {decay: 0.25});
  envNoise('wind', P.plume, tl.scene('tests').end - 0.1, () => 0.6, -44, '낙진을 실어 가는 바람 (아주 작은 바람 소리; 이 장면은 거의 조용히)', {low: 40, high: 160, fi: 0.8, fo: 0.8});
  ev.push({id: 'km130', at: r(P.km100, 4), kind: 'silent', means: '"약 130 km · 100 km 넘게" (소리 없음)'});
  ev.push({id: 'boat', at: r(P.boat, 4), kind: 'silent', means: '일본 어선 위치 (소리 없음)'});
  ev.push({id: 'crew', at: r(P.crew, 4), kind: 'silent', means: '"선원 23명이 방사선 피해" (소리 없음)'});
  // ---- compare
  steps('chem_bar', P.cmpChem, Math.log10(EPM.chem) - 7, -34, '화학(수소 연소) 막대: 10⁷ J에서 한 자릿수마다 단3도 (1번)');
  steps('fis_bar', P.cmpFis, Math.log10(EPM.fis) - 7, -34, '핵분열 막대: 같은 대응 (6번)');
  steps('fus_bar', P.cmpFus, Math.log10(EPM.fus) - 7, -33, '핵융합 막대: 같은 대응 (7번, 핵분열보다 한 단계 더)');
  swell('x4', P.four, [131, 196], `"약 4배" (질량당: 핵융합 ${FUS_X_FIS.toFixed(1)} : 핵분열 1)`, {dur: 1.4, gain: -33});
  ticks('fuel', P.fuelK, [131, 165, 196], -34, '연료 ×1 · ×2 · ×3 → 나오는 에너지 ×1 · ×2 · ×3 (설명용)', {decay: 0.12});
  // ---- myth
  whoosh('h2_flame', P.ignite, 1.2, 100, 200, '수소 풍선이 탐 (화학 반응의 불꽃)', -35);
  tick('equal_q', P.eqQ, 147, -34, '"= ?"', {decay: 0.12});
  thuds('not_equal', [P.no + 0.1], '"≠" (아닙니다)', -30);
  ticks('pairs', [0, 1, 2, 3].map(k => P.swap + 0.2 + 0.2 * k), 262, -36, '전자쌍 넷이 새 짝으로 옮겨 감 (화학 반응: 가벼운 단일 틱; 원자핵은 그대로)', {decay: 0.06});
  tick('chem_label', P.chemLbl, 147, -35, '"화학 반응 · 전자가 짝을 바꿈"', {decay: 0.1});
  chords('nuc_merge', [P.merge17], -30, 'D와 T 원자핵 자체가 합쳐짐 (융합 화음 틱)');
  steps('chem_bar2', P.chem18, Math.log10(EPM.chem) - 7, -34, '같은 1 kg: 탈 때 막대 (1번)');
  steps('fus_bar2', P.fus18, Math.log10(EPM.fus) - 7, -33, '같은 1 kg: 핵융합 막대 (7번)');
  swell('millions', P.mil, [98, 147, 196], `"약 ${koNum(sig2(FUS_X_CHEM))} 배 → 수백만 배"`, {dur: 1.6, gain: -32});
  // ---- close
  tick('treaty', P.treaty, 131, -34, '"1963 부분적 핵실험 금지 조약"', {decay: 0.12});
  tick('domains', P.icons, 147, -35, '대기권 · 우주 · 수중', {decay: 0.12});
  thuds('bans', P.ban, '세 곳에 차례로 금지 표시', -33);
  swell('tokamak', P.tok, [82, 123], '토카막이 나타남', {dur: 1.6, gain: -34});
  chirp('plasma_hum', P.slow, P.poster - 0.1, () => 98, tt => 0.25 + 0.05 * Math.sin((tt - P.slow) * 0.55 * 3), -38, '고리 속 플라스마가 천천히 돎 → 낮고 고른 웅웅 (폭탄의 한꺼번에와 대비)', {fi: 0.5, fo: 0.5});
  chords('tok_fusion', P.tokFus, -40, `토카막 속 드문 융합 (${P.tokFus.length}번, 작은 화음 틱)`, {decay: 0.1});
  tick('kstar', P.power, 131, -35, '"예: KSTAR (한국)"', {decay: 0.12});
  swell('poster_back', P.poster, [73, 110, 147], '"수소폭탄은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz, because the band-pass skirts fall only 12 dB/octave); swell overtones (2f)
 * are kept below it by construction (frequencies < HIGH_CUT/2). Events that would break this throw.
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/hydrogen-bomb/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(버섯구름 높이 표, 쿨롱 언덕 시도·온도 손잡이·맥스웰 분포 꼬리의 융합 빈도 설명 모형, 2단계 연소 표, 로그 막대)에서 써 넣습니다. 대응: 융합 하나 → 낮은 화음 틱(131+196+262 Hz), 분열 → 단일 틱(110~123 Hz), 언덕에서 튕김 → 둔한 툭, 로그 막대 → 한 자릿수마다 단3도씩 오르는 음, 온도 → 음높이(70 + 26·log₁₀(T/10⁶) Hz), 1단계 → 낮은 쿵, 2단계 → 더 낮고 긴 부풂, 낙진 장면은 거의 조용히. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; det ${P.det.toFixed(2)} s, cloud 12/50/64 km at ${P.cross12.toFixed(2)}/${P.cross50.toFixed(2)}/${P.top64.toFixed(2)} s`);
  console.log(`barrier: ${P.trials.length} trials (${P.bounces.length} bounces, ${P.passes.length} passes), ${P.boxFus.length} box fusions; burn ${P.burnT.length} (burst ${P.burst.toFixed(2)}), burned at end ${P.burned(tl.scene('trigger').end).toFixed(2)}`);
}
