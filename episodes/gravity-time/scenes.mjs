// Episode scenes — "머리가 발보다 빨리 늙는다 — 중력과 시간"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Weak field: a clock h higher runs faster by Δτ/τ = g·h/c² (g = 9.81 m/s² → 1.09×10⁻¹⁶ per metre).
//    Head vs feet h = 1.7 m → 1.85×10⁻¹⁶; over 80 years (2.52×10⁹ s) → 0.47 μs.
//  - Exact potential for large heights: Δτ/τ = (GM/c²)(1/R − 1/(R + h)) (GPS 20,200 km → +45.7 μs/day; the straight
//    g·h/c² line would give 190 μs/day). Speed effect of the GPS clock v²/2c² with v = √(GM/r) = 3.87 km/s → −7.2 μs/day.
//  - Rocket thought experiment (설명 모형): cabin h = 2 m, acceleration a (knob 0 → 1 g). The picture is drawn in the
//    ceiling clock's time. Received interval = 1 + a·h/c² (exact for uniform acceleration, in the clocks' own times),
//    shown with an exaggeration ×10¹⁵ (1 g → 1.218 s). Light is drawn slow (crosses the cabin in ~2.6 s); in the ceiling's
//    time a pulse at height fraction u moves at c'(1 + δu)/(1 + δ), so crests spread out as they climb (local spacing
//    stretched by 1 + δ at the ceiling) and the floor clock ticks every 1 + δ screen seconds.
//  - Tower (Pound–Rebka 1959, 22.5 m): frequency ratio 1 − 2.46×10⁻¹⁵; the wave spacing is drawn ×10¹⁴ (25 %).
//  - Black hole: the rate of a clock at radius r as seen from far, √(1 − r_s/r) (static clock; drawn creeping toward the
//    horizon, r − r_s shrinking exponentially). Myth scene: r = 2 r_s → 0.707.
//  - Sound: node episodes/gravity-time/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rand, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = {base: 'noturno', accent: '#FFC85A'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const C = 299792458, C2 = C * C, G_SURF = 9.81, GM = 3.986004418e14, R_E = 6.371e6, DAY = 86400, YEAR = 365.25 * DAY;
/** fractional rate excess of a clock h metres above another at the surface (weak field, uniform g) */
export const rateGH = h => G_SURF * h / C2;
/** exact potential difference (fraction) between the surface and height h */
export const ratePot = h => GM / C2 * (1 / R_E - 1 / (R_E + h));
export const H_PERSON = 1.7, LIFE_Y = 80;
export const HEAD_RATE = rateGH(H_PERSON);                               // 1.85e-16
export const LIFE_US = HEAD_RATE * LIFE_Y * YEAR * 1e6;                    // 0.468 μs
export const EXAG = 1e15;                                                 // on-screen exaggeration of clock-rate differences
export const D_HEAD = EXAG * HEAD_RATE;                                   // 0.1855: the shown head clock gains 0.19 s per s
// rocket (설명 모형)
export const ROCKET_H = 2.0;
export const deltaRocket = a => EXAG * a * ROCKET_H / C2;                 // a = 9.81 → 0.2183
export const D_ROCKET = deltaRocket(G_SURF);
// tower (Pound–Rebka)
export const TOWER_H = 22.5, TOWER_SHIFT = ratePot(TOWER_H), EXAG_T = 1e14, EPS_T = EXAG_T * TOWER_SHIFT;   // 2.46e-15, 0.246
// GPS
export const GPS_ALT = 20.2e6, GPS_R = R_E + GPS_ALT;
export const GPS_V = Math.sqrt(GM / GPS_R);
export const GPS_GRAV_US = ratePot(GPS_ALT) * DAY * 1e6;                   // +45.7
export const GPS_SPEED_US = GPS_V * GPS_V / (2 * C2) * DAY * 1e6;           // 7.2
export const GPS_NET_US = 45 - 7;                                         // the script's rounded values (+38)
export const GPS_KM_DAY = GPS_NET_US * 1e-6 * C / 1000;                    // 11.4 km
export const GPS_PERIOD_H = TAU * Math.sqrt(GPS_R ** 3 / GM) / 3600;       // 11.97 h
// height chart: per-day gain from the exact potential
export const CHART = [
  {id: 'jila', h: 1e-3, name: 'JILA', hs: '1 mm'},
  {id: 'nist', h: 0.33, name: 'NIST', hs: '33 cm'},
  {id: 'harvard', h: 22.5, name: 'Harvard', hs: '22.5 m'},
  {id: 'everest', h: 8848, name: '에베레스트', hs: '8.8 km'},
  {id: 'gps', h: GPS_ALT, name: 'GPS', hs: '20,200 km'},
].map(p => ({...p, day: ratePot(p.h) * DAY}));
export const NIST_RATE = rateGH(0.33), JILA_RATE = rateGH(1e-3);           // 3.6e-17, 1.1e-19
// black hole: rate of a clock at r (units of r_s) as seen from far
export const bhRate = r => Math.sqrt(Math.max(0, 1 - 1 / r));
export const MYTH_R = 2, MYTH_RATE = bhRate(MYTH_R);                       // 0.707

/** number → [mantissa, exponent] with d decimals */
export const sci = (v, d = 1) => { const e = Math.floor(Math.log10(Math.abs(v))); let m = v / 10 ** e; if (+m.toFixed(d) >= 10) return [(m / 10).toFixed(d), e + 1]; return [m.toFixed(d), e]; };
export const sciStr = (v, d = 1) => { const [m, e] = sci(v, d); return `${m}×10^{${e < 0 ? '−' + -e : e}}`; };

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  grav1: W('s01', '중력에'), flow1: W('s01', '흐르는'),
  high: W('s02', '높은'), low: W('s02', '낮은'), fast2: W('s02', '빨리'), head2: W('s02', '머리는'), feet2: W('s02', '발보다'), age: W('s02', '늙습니다'),
  life: W('s03', '평생을'), million: W('s03', '백만분의'), notReach: W('s03', '못'), today3: W('s03', '오늘날의'), measure: W('s03', '잴'),
  jung: W('s04', '중력은'), heavy: W('s04', '무거울'), force: W('s04', '힘'), english: W('s04', '영어'), gravity: W('s04', '그래비티도'), latin: W('s04', '라틴어로'), heaviness: W('s04', '무거움을'), came: W('s04', '왔습니다'),
  y1907: W('s05', '천구백칠년'), einstein: W('s05', '아인슈타인은'), falling: W('s05', '떨어지는'), weight: W('s05', '무게를'), feel: W('s05', '느끼지'), clue: W('s05', '실마리를'),
  inGrav: W('s06', '중력'), up6: W('s06', '위로'), rocket6: W('s06', '로켓'), cannot: W('s06', '구별할'),
  floor7: W('s07', '바닥에서'), everySec: W('s07', '일초마다'), light7: W('s07', '빛'), ceil7: W('s07', '천장은'), than1: W('s07', '일초보다'), longer: W('s07', '긴'),
  climb: W('s08', '올라가는'), ceil8: W('s08', '천장이'), faster8: W('s08', '빨라져'), away: W('s08', '달아나며'),
  fromTop: W('s09', '위에서'), below9: W('s09', '아래의'), stretch: W('s09', '늘어나니'), slow9: W('s09', '느리게'),
  gravToo: W('s10', '중력도'), strong10: W('s10', '강한'), lower10: W('s10', '아래쪽일수록'), slow10: W('s10', '느리게'),
  y1959: W('s11', '천구백오십구년'), harvard: W('s11', '하버드'), m225: W('s11', '이십이점오미터'), topBottom: W('s11', '위아래에서'), gamma: W('s11', '감마선의'), freq: W('s11', '진동수를'), compare: W('s11', '비교해'), first: W('s11', '처음'),
  satnav: W('s12', '위성'), gps: W('s12', '지피에스의'), ground12: W('s12', '땅에서'), km20k: W('s12', '이만'),
  weak: W('s13', '중력이'), us45: W('s13', '사십오마이크로초'), moving: W('s13', '빠르게'), us7: W('s13', '칠마이크로초'), late13: W('s13', '늦어집니다'),
  fix: W('s14', '고치지'), notFix: W('s14', '않으면'), position: W('s14', '위치가'), km10: W('s14', '십킬로미터'), over: W('s14', '어긋납니다'),
  y2010: W('s15', '이천십년'), height15: W('s15', '높이가'), cm33: W('s15', '삼십삼센티미터'), twoClocks: W('s15', '원자시계에서'), measured15: W('s15', '쟀습니다'),
  y2022: W('s16', '이천이십이년에는'), mm1: W('s16', '일밀리미터의'), cloud: W('s16', '원자'), topBot16: W('s16', '위아래에서도'), found: W('s16', '찾아냈습니다'),
  bh: W('s17', '블랙홀'), near: W('s17', '가까이에서는'), far: W('s17', '멀리서'), stop17: W('s17', '멈춘'),
  feel18: W('s18', '느낄까요'), no: W('s18', '아닙니다'), each: W('s18', '각자의'), sec18: W('s18', '일초에'),
  heights: W('s19', '높이의'), sideBy: W('s19', '나란히'), reveal: W('s19', '드러납니다'),
  reason: W('s20', '중력이'),
};

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export const HOOK_M0 = 8;                                                 // model seconds at t = 0 (head 1.48 s ahead)
export const CLOCK0 = 10 * 3600 + 9 * 60 + 52;                            // both clocks read 10:09:52 at model 0 → 10:10:00 at t = 0
export const footRead = m => CLOCK0 + m, headRead = m => CLOCK0 + m * (1 + D_HEAD);
/** integer crossings of read(m) for screen t in [t0, t1] with m = mOf(t) linear (slope 1) */
function crossings(read, mOf, t0, t1) {
  const out = [], m0 = mOf(t0), m1 = mOf(t1);
  for (let k = Math.ceil(read(m0)); k <= read(m1); k++) {            // read is increasing and linear in m
    const m = m0 + (k - read(m0)) / ((read(m1) - read(m0)) / (m1 - m0)); out.push(+(t0 + (m - m0)).toFixed(4));
  }
  return out;
}
// rocket geometry (screen) and slow light
export const RK = {x0: 160, x1: 530, wl: 180, wr: 510, ceil: 540, floor: 1140, col: 430, cLight: 230};
export const DROP_H = 3.2, DROP_T = Math.sqrt(2 * DROP_H / G_SURF);         // origin strobe: 3.2 m fall
export const APPLE_H = 0.8, APPLE_T = Math.sqrt(2 * APPLE_H / G_SURF);      // einstein: an apple from the hand (0.8 m)
export const BH_TAU = 1.0, BH_R0 = 4.4, BH_STEP = 0.5;

export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // ---- hook (screen time = the feet's clock)
  P.hookM = t => HOOK_M0 + t;
  P.high = at(A.high) - 0.1; P.low = at(A.low) - 0.1; P.lead = at(A.fast2) - 0.1; P.headTag = at(A.head2) - 0.1; P.age = at(A.age) - 0.1;
  P.life = at(A.life) - 0.15; P.lifeRun = [at(A.life) + 0.1, at(A.notReach) + 0.1]; P.million = at(A.million) - 0.1; P.today = at(A.today3) - 0.1;
  P.hookFoot = crossings(footRead, P.hookM, MORPH[1] + 0.2, sc('hook').end - 0.35);
  P.hookHead = crossings(headRead, P.hookM, MORPH[1] + 0.2, sc('hook').end - 0.35);
  // ---- origin
  P.hanja = at(A.jung) - 0.15; P.heavy = at(A.heavy) - 0.1; P.force = at(A.force) - 0.1; P.gravity = at(A.gravity) - 0.15; P.latin = at(A.latin) - 0.1;
  P.heaviness = at(A.heaviness) - 0.1; P.came = at(A.came) - 0.1;
  P.drops = []; for (let t0 = at(A.jung) + 0.25; t0 + DROP_T < sc('origin').end - 0.5; t0 += 1.7) P.drops.push(+t0.toFixed(4));
  // ---- einstein
  P.card5 = at(A.y1907) - 0.15; P.release = at(A.falling) - 0.05; P.weight = at(A.weight) - 0.1; P.feel = at(A.feel) - 0.1; P.clue = at(A.clue) - 0.1;
  P.fallEnd = at('s06') - 0.8; P.two = at(A.inGrav) - 0.4; P.up6 = at(A.up6) - 0.1; P.rocket6 = at(A.rocket6) - 0.1; P.eq = at(A.cannot) - 0.1;
  P.apples = []; for (let t0 = P.two + 0.7; t0 + APPLE_T < sc('einstein').end - 0.4; t0 += 1.45) P.apples.push(+t0.toFixed(4));
  // ---- rocket (screen time = the ceiling clock). Knob a: 0 → 1 g from "빛"; table integration of floor time and pulses
  const R0 = sc('rocket').start, R1 = sc('rocket').end;
  P.ign = [at(A.light7) - 0.05, at(A.light7) + 1.25];
  P.acc = t => G_SURF * smooth((t - P.ign[0]) / (P.ign[1] - P.ign[0]));
  P.delta = t => deltaRocket(P.acc(t));
  {
    const dt = 1 / 240, tA = R0 - 3.2, n = Math.ceil((R1 + 0.5 - tA) / dt) + 1, hpx = RK.floor - RK.ceil;
    const TF = new Float64Array(n), V = new Float64Array(n), S = new Float64Array(n);
    const emits = [], recvs = [], pulses = [];
    let tf = 0.05, v = 0, s = 0;
    for (let i = 0; i < n; i++) {
      const t = tA + i * dt, d = P.delta(t);
      TF[i] = tf; V[i] = v; S[i] = s;
      for (const p of pulses) if (p.recv == null) {
        p.U.push(p.u); const um = p.u + RK.cLight * (1 + d * p.u) / ((1 + d) * hpx) * dt / 2, du = RK.cLight * (1 + d * um) / ((1 + d) * hpx) * dt; p.u += du;
        if (p.u >= 1) { const tr = t + dt * (1 - (p.u - du)) / du; p.recv = +tr.toFixed(4); recvs.push(p.recv); }
      }
      const tf2 = tf + dt / (1 + d);
      if (Math.floor(tf2) > Math.floor(tf)) { const te = t + dt * (Math.floor(tf2) - tf) / (tf2 - tf); emits.push(+te.toFixed(4)); pulses.push({k: pulses.length, emit: +te.toFixed(4), i0: i + 1, U: [], u: (t + dt - te) * RK.cLight / ((1 + d) * hpx), recv: null}); }
      tf = tf2; v += P.acc(t) * dt; s += v * dt;
    }
    P.rk = {tA, dt, n, TF, V, S, emits, recvs, pulses};
    const idx = t => clamp((t - tA) / dt, 0, n - 1.001);
    const samp = (A_, t) => { const u = idx(t), i = Math.floor(u); return lerp(A_[i], A_[i + 1], u - i); };
    P.floorRead = t => samp(TF, t);                                   // floor clock seconds (integer = a pulse leaves)
    P.ceilRead = t => t - tA + 0.05;                                  // ceiling clock = screen time (same reading as the floor while a = 0)
    P.speed = t => samp(V, t); P.dist = t => samp(S, t);
    P.pulseU = (p, t) => { if (t < p.emit || (p.recv != null && t > p.recv)) return null; const u = (t - (tA + p.i0 * dt)) / dt; if (u < 0) return lerp(0, p.U[0] ?? 0, clamp(1 + u)); const i = Math.min(p.U.length - 2, Math.floor(u)); if (i < 0) return p.U[0]; return Math.min(1, lerp(p.U[i], p.U[i + 1], clamp(u - i, 0, 1))); };
    P.lastInterval = t => { let k = -1; for (let j = 0; j < recvs.length; j++) if (recvs[j] <= t) k = j; return k >= 1 ? recvs[k] - recvs[k - 1] : null; };
  }
  P.s08 = at('s08') - 0.5; P.s09 = at('s09') - 0.5; P.s10 = at('s10') - 0.5;
  P.hl = P.rk.pulses.reduce((b, p) => (Math.abs(p.emit - (at(A.climb) - 0.45)) < Math.abs(b.emit - (at(A.climb) - 0.45)) ? p : b));
  P.ceil7 = at(A.ceil7) - 0.1; P.longer = at(A.longer) - 0.1; P.away = at(A.away) - 0.1; P.faster8 = at(A.faster8) - 0.1;
  P.cmp0 = at(A.below9) - 0.1; P.slow9 = at(A.slow9) - 0.1; P.stretch = at(A.stretch) - 0.1;
  P.eqv = [at(A.gravToo) - 0.3, at(A.gravToo) + 1.2]; P.lower10 = at(A.lower10) - 0.1;
  P.rkSend = P.rk.emits.filter(x => x > R0 + 0.3 && x < R1 - 0.4);
  P.rkRecv = P.rk.recvs.filter(x => x > R0 + 0.3 && x < R1 - 0.4);
  P.rkCeil = []; for (let k = Math.ceil(P.ceilRead(at('s09') - 0.2)); k - 0.05 + P.rk.tA < P.eqv[0]; k++) P.rkCeil.push(+(k - 0.05 + P.rk.tA).toFixed(4));
  // ---- tower
  P.card11 = at(A.y1959) - 0.15; P.harv = at(A.harvard) - 0.1; P.h225 = at(A.m225) - 0.1; P.tb = at(A.topBottom) - 0.1;
  P.gam = at(A.gamma) - 0.35; P.freq = at(A.freq) - 0.1; P.cmp11 = at(A.compare) - 0.1; P.first = at(A.first) - 0.1;
  // ---- gps (one orbit = 12 s on screen)
  P.orb0 = at(A.satnav) - 0.25; P.gpsLabel = at(A.gps) - 0.1; P.alt = at(A.km20k) - 0.3;
  P.satA = t => -0.35 - TAU * (t - sc('gps').start) / 12;
  P.weak = at(A.weak) - 0.1; P.r45 = at(A.us45) - 0.15; P.moving = at(A.moving) - 0.1; P.r7 = at(A.us7) - 0.15; P.r38 = at(A.late13) + 0.15;
  P.mapIn = at(A.fix) - 0.45; P.off = at(A.notFix) - 0.05; P.drift = [P.off + 0.35, at(A.over) + 0.6];
  P.days = t => clamp((t - P.drift[0]) / (P.drift[1] - P.drift[0]));
  P.km10 = at(A.km10) - 0.1;
  // ---- clocks
  P.card15 = at(A.y2010) - 0.15; P.rise = [at(A.height15) - 0.1, at(A.cm33) + 0.7]; P.beat0 = at(A.twoClocks) - 0.15; P.meas15 = at(A.measured15) - 0.1;
  P.card16 = at(A.y2022) - 0.2; P.mm1 = at(A.mm1) - 0.1; P.cloud = at(A.cloud) - 0.1; P.tb16 = at(A.topBot16) - 0.1; P.found = at(A.found) - 0.1;
  P.chart0 = sc('clocks').start + 0.25;
  // ---- extreme (r − r_s shrinks exponentially; rate as seen from far = √(1 − r_s/r))
  P.bhLabel = at(A.bh) - 0.1; P.in0 = at(A.near) - 0.2; P.far = at(A.far) - 0.1; P.stop17 = at(A.stop17) - 0.1;
  P.bhR = t => 1 + (BH_R0 - 1) * Math.exp(-Math.max(0, t - P.in0) / BH_TAU);
  {
    const t0 = sc('extreme').start, t1 = sc('extreme').end, dt = 1 / 240, n = Math.ceil((t1 - t0) / dt) + 1, TAUc = new Float64Array(n);
    let s = 0; for (let i = 0; i < n; i++) { TAUc[i] = s; s += bhRate(P.bhR(t0 + i * dt)) * dt; }
    P.bhTau = t => { const u = clamp((t - t0) / dt, 0, n - 1.001), i = Math.floor(u); return lerp(TAUc[i], TAUc[i + 1], u - i); };
    P.bhTicks = []; for (let i = 1; i < n; i++) if (Math.floor(TAUc[i] / BH_STEP) > Math.floor(TAUc[i - 1] / BH_STEP) && t0 + i * dt > t0 + 0.4 && t0 + i * dt < t1 - 0.2) P.bhTicks.push(+(t0 + i * dt).toFixed(4));
    P.bhFar = []; for (let k = 1; t0 + k * BH_STEP < t1 - 0.2; k++) if (k * BH_STEP > 0.4) P.bhFar.push(+(t0 + k * BH_STEP).toFixed(4));
  }
  // ---- myth
  P.q18 = at(A.feel18) - 0.4; P.no = at(A.no) - 0.1; P.each = at(A.each) - 0.1; P.sec18 = at(A.sec18) - 0.1;
  P.cmp19 = at(A.heights) - 0.1; P.reveal = at(A.reveal) - 0.1; P.heights = at(A.heights) - 0.1;
  P.mythOwn = []; for (let k = Math.ceil(sc('myth').start + 0.5); k < sc('myth').end - 0.3; k++) P.mythOwn.push(k);
  P.mythLow = []; for (let k = 1; P.cmp19 + k / MYTH_RATE < sc('myth').end - 0.3; k++) P.mythLow.push(+(P.cmp19 + k / MYTH_RATE).toFixed(4));
  // ---- close: the poster returns on "중력이" and its clocks run into the thumbnail state at the last frame
  P.reason = at(A.reason); P.posterM = t => HOOK_M0 - (tl.duration - t);
  P.closeFoot = crossings(footRead, P.posterM, P.reason + 0.35, tl.duration - 0.12);
  P.closeHead = crossings(headRead, P.posterM, P.reason + 0.35, tl.duration - 0.12);
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const gr = c.createLinearGradient(0, 0, W * 0.3, H); gr.addColorStop(0, '#03141D'); gr.addColorStop(1, T.deep);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  glow(c, 560, 700, 950, '#2A4E63', 0.07);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
export const PAL = {gold: '#FFC85A', hot: '#FFE3A0', cool: '#7CC4FF', slow: '#6FB4E6', light: '#D8F2FF', gamma: '#B9A2FF', good: '#8FE3BF',
  bad: '#FF7A5C', earth: '#123346', earth2: '#0A1F2C', grid: '#3D6E86', body: '#1E3A4B', body2: '#10222D', rim: '#A9CCDA', metal: '#8DA4AF', red: '#FF5A3C'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.25, b = 0.25) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
const fmt = (x, d = 0) => x.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});

// ---- text with raised exponents: "1.1×10^{−16}" (the fallback font's superscript digits look uneven)
const SUP = /\^\{([^}]*)\}/g;
const supSize = size => Math.max(24, Math.round(size * 0.64));
function supParts(s) { const out = []; let last = 0; for (const m of s.matchAll(SUP)) { if (m.index > last) out.push([s.slice(last, m.index), false]); out.push([m[1], true]); last = m.index + m[0].length; } if (last < s.length) out.push([s.slice(last), false]); return out; }
export function txW(stage, s, o = {}) { s = String(s); const size = o.size || 32; return supParts(s).reduce((w, [p, sup]) => w + stage.measure(p, {...o, size: sup ? supSize(size) : size}), 0); }
export function tx(stage, s, x, y, o = {}) {
  s = String(s); if (!s.includes('^{')) return stage.text(s, x, y, o);
  const size = o.size || 32, W_ = txW(stage, s, o);
  let xx = o.align === 'center' ? x - W_ / 2 : o.align === 'right' ? x - W_ : x;
  for (const [p, sup] of supParts(s)) { const sz = sup ? supSize(size) : size; stage.text(p, xx, sup ? y - size * 0.36 : y, {...o, size: sz, align: 'left', maxWidth: undefined}); xx += stage.measure(p, {...o, size: sz}); }
  return W_;
}
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 26, weight = o.weight ?? 700, w = txW(stage, s, {size, weight, role: o.role}), pad = 9;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba(stage.theme.plate, o.plateA ?? 0.86), o.border ? rgba(o.border, 0.9) : null, 1.5);
    tx(stage, s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12, border = null) { rect(c, x, y, w, h, r, rgba(T.plate, a), border || rgba(T.border, 1), 1.5); }
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: titleSize(stage, title), color: T.ink, align: 'center', ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: T.accent, align: 'center', ...so}));
}
const TSIZE = new Map();
function titleSize(stage, s) { if (!TSIZE.has(s)) TSIZE.set(s, Math.min(54, 54 * 790 / stage.measure(s, {role: 'display', weight: 700, size: 54}))); return TSIZE.get(s); }
/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1345, 0, 1610);
  g.addColorStop(0, 'rgba(1,8,12,0)'); g.addColorStop(0.35, `rgba(1,8,12,${0.6 * a})`); g.addColorStop(0.75, `rgba(1,8,12,${0.6 * a})`); g.addColorStop(1, 'rgba(1,8,12,0)');
  c.fillStyle = g; c.fillRect(0, 1345, 1080, 265);
}
function strike(c, x0, x1, y, q, col = PAL.bad, w = 4) { if (q > 0) line(c, [[x0 - 4, y], [lerp(x0 - 4, x1 + 4, easeOut(q)), y]], rgba(col, 0.95), w); }
function bracketV(c, x, y0, y1, col, w = 3, tick = 12, dir = -1) { line(c, [[x - dir * tick, y0], [x, y0], [x, y1], [x - dir * tick, y1]], col, w); }

// ---- clock dial: reading in seconds (quartz: the second hand jumps at each whole second of THIS clock)
const secHand = (secs, o = {}) => { const st = o.step || 1; return o.sweep ? secs : st * (Math.floor(secs / st) + easeOut(clamp((secs / st - Math.floor(secs / st)) / 0.1 * st))); };
const secAng = (secs, o) => ((secHand(secs, o) / 60) % 1) * TAU - TAU / 4;
export function dial(c, x, y, r, secs, o = {}) {
  const col = o.col || PAL.gold, ink = o.ink || '#EFE3D4';
  withAlpha(c, o.a ?? 1, () => {
    if ((o.glowA ?? 0.2) > 0) glow(c, x, y, r * 2.0, col, o.glowA ?? 0.2);
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#0E2A36'); g.addColorStop(1, '#04121A');
    circle(c, x, y, r, g);
    ring(c, x, y, r, col, Math.max(2.5, r * 0.075));
    const n = r >= 44 ? 60 : 12;
    for (let k = 0; k < n; k++) {
      const an = k / n * TAU - TAU / 4, big = n === 12 || k % 5 === 0, r0 = r * (big ? 0.7 : 0.8), r1 = r * 0.88;
      line(c, [[x + r0 * Math.cos(an), y + r0 * Math.sin(an)], [x + r1 * Math.cos(an), y + r1 * Math.sin(an)]], rgba(ink, big ? 0.85 : 0.35), big ? Math.max(1.5, r * 0.045) : 1.2, {cap: 'butt'});
    }
    const s = secHand(secs, o);
    const hand = (ang, len, w, colr, back = 0) => line(c, [[x - back * Math.cos(ang), y - back * Math.sin(ang)], [x + len * Math.cos(ang), y + len * Math.sin(ang)]], colr, w);
    hand(((secs / 43200) % 1) * TAU - TAU / 4, r * 0.46, Math.max(2.5, r * 0.08), rgba(ink, 0.9));
    hand(((secs / 3600) % 1) * TAU - TAU / 4, r * 0.68, Math.max(2, r * 0.055), rgba(ink, 0.9));
    const sa = ((s / 60) % 1) * TAU - TAU / 4;
    hand(sa, r * 0.84, Math.max(1.6, r * 0.03), o.hand || col, r * 0.2);
    circle(c, x, y, Math.max(3, r * 0.07), o.hand || col);
    if (o.flash > 0) ring(c, x, y, r * (1.08 + 0.25 * (1 - o.flash)), rgba(col, 0.7 * o.flash), 3);
  });
}

// ---- a calm side-view standing person (facing +x), feet at (x, yFeet), height H px
const BODY = [
  [0.110, 0.000], [0.112, 0.010], [0.060, 0.030], [0.031, 0.056], [0.032, 0.110], [0.036, 0.200], [0.041, 0.290], [0.050, 0.390], [0.058, 0.470],
  [0.060, 0.530], [0.058, 0.580], [0.056, 0.620], [0.066, 0.700], [0.073, 0.745], [0.066, 0.790], [0.040, 0.818], [0.027, 0.848], [0.031, 0.872],
  [0.048, 0.882], [0.057, 0.904], [0.052, 0.917], [0.074, 0.931], [0.054, 0.953], [0.048, 0.976], [0.030, 0.995], [-0.008, 1.000], [-0.048, 0.978],
  [-0.060, 0.932], [-0.044, 0.888], [-0.034, 0.852], [-0.064, 0.792], [-0.067, 0.740], [-0.054, 0.650], [-0.056, 0.600], [-0.076, 0.522],
  [-0.070, 0.470], [-0.050, 0.380], [-0.040, 0.292], [-0.052, 0.215], [-0.037, 0.130], [-0.032, 0.062], [-0.047, 0.018], [-0.040, 0.000],
];
const ARM = [[-0.010, 0.802], [-0.006, 0.712], [-0.004, 0.626], [0.010, 0.545], [0.022, 0.470], [0.030, 0.408]], ARM_W = [0.050, 0.046, 0.040, 0.036, 0.034, 0.026];
function smoothPath(c, pts, closed = true) {
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = pts.length;
  c.beginPath(); const s0 = m(pts[n - 1], pts[0]); c.moveTo(s0[0], s0[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); c.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
  if (closed) c.closePath();
}
/** outline around a centre line with widths w (body units) */
function tube(pts, ws) {
  const L = [], R = [];
  pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; L.push([p[0] - dy / d * ws[i] / 2, p[1] + dx / d * ws[i] / 2]); R.push([p[0] + dy / d * ws[i] / 2, p[1] - dx / d * ws[i] / 2]); });
  return [...L, ...R.reverse()];
}
export function person(c, x, yFeet, H, o = {}) {
  const f = o.facing ?? 1, P = ([u, v]) => [x + f * u * H, yFeet - v * H];
  withAlpha(c, o.a ?? 1, () => {
    if (o.shadow !== false) { c.save(); c.translate(x + f * 0.03 * H, yFeet); c.scale(1, 0.12); glow(c, 0, 0, H * 0.16, '#000000', 0.55); c.restore(); }
    const g = c.createLinearGradient(0, yFeet - H, 0, yFeet); g.addColorStop(0, o.top || PAL.body); g.addColorStop(1, o.bottom || PAL.body2);
    smoothPath(c, BODY.map(P)); c.fillStyle = g; c.fill();
    c.strokeStyle = rgba(o.rim || PAL.rim, o.rimA ?? 0.5); c.lineWidth = Math.max(1.5, H * 0.003); c.lineJoin = 'round'; c.stroke();
    smoothPath(c, tube(ARM, ARM_W).map(P)); c.strokeStyle = rgba('#02070A', 0.42); c.lineWidth = Math.max(1.2, H * 0.0024); c.stroke();
    c.save(); smoothPath(c, BODY.map(P)); c.clip(); line(c, [P([-0.074, 0.80]), P([-0.07, 0.70]), P([-0.058, 0.62])], rgba(o.rim || PAL.rim, 0.18), H * 0.012); c.restore();
  });
  return {head: P([0.0, 0.935]), hand: P([0.030, 0.41]), feet: [x, yFeet], top: yFeet - H};
}

// ---- the gravity grid: equipotential arcs that crowd toward the ground + field lines converging to the Earth's centre
function gravityGrid(c, groundY, a = 1, o = {}) {
  const R0 = o.R ?? 2600, cx = o.cx ?? 540, cy = groundY + R0, top = o.top ?? 330;
  withAlpha(c, a, () => {
    for (let k = 1; k < 30; k++) {
      const d = 22 * k + 2.6 * k * k; if (groundY - d < top) break;
      const r = R0 + d, half = Math.asin(Math.min(1, 640 / r));
      ring(c, cx, cy, r, rgba(PAL.grid, 0.42 * (1 - d / (groundY - top + 60)) + 0.06), 1.5, -Math.PI / 2 - half, -Math.PI / 2 + half);
    }
    for (let j = -16; j <= 16; j++) {
      const an = -Math.PI / 2 + j * 0.034, r1 = R0 + (groundY - top) + 30;
      const pts = [[cx + R0 * Math.cos(an), cy + R0 * Math.sin(an)], [cx + r1 * Math.cos(an), cy + r1 * Math.sin(an)]];
      const gr = c.createLinearGradient(0, groundY, 0, top); gr.addColorStop(0, rgba(PAL.grid, 0.36)); gr.addColorStop(1, rgba(PAL.grid, 0.03));
      line(c, pts, gr, 1.3);
    }
  });
}
function earthGround(c, groundY, a = 1, o = {}) {
  const R0 = o.R ?? 2600, cx = o.cx ?? 540, cy = groundY + R0;
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(cx, cy, R0 - 400, cx, cy, R0); g.addColorStop(0, PAL.earth2); g.addColorStop(1, PAL.earth);
    circle(c, cx, cy, R0, g);
    ring(c, cx, cy, R0 + 3, rgba('#6FC3E8', 0.35), 6); ring(c, cx, cy, R0 + 1, rgba('#A8E2FF', 0.5), 2);
  });
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '머리와 발, 어디가 더 빨리 늙을까'],
  origin: ['기원 · 이름', '무거울 重, 힘 力'],
  einstein: ['배경 · 1907년', '떨어지는 사람은 무게가 없다'],
  rocket: ['메커니즘 · 로켓 사고 실험', '바닥에서 1초마다 보낸 빛'],
  tower: ['실험 · 1959년', '22.5 m 탑의 감마선'],
  gps: ['현상 · 위성 항법', 'GPS 위성의 시계'],
  clocks: ['실험 · 원자시계', '33 cm, 그리고 1 mm'],
  extreme: ['극한 · 블랙홀', '멀리서 보면 거의 멈춘 시간'],
  myth: ['오해 바로잡기', '느려진 것을 느낄까?'],
  close: ['', ''],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'einstein') return [[-Infinity, ...titles.einstein], [P.two, '본질 · 등가 원리', '중력과 가속은 구별할 수 없다']];
  if (id === 'rocket') return [[-Infinity, ...titles.rocket], [P.s08, '메커니즘 · 까닭', '천장이 달아나며 받는다'], [P.s09, '메커니즘 · 위에서 본 아래', '아래의 1초가 길다'], [P.s10, '본질 · 등가 원리', '중력 속에서도 똑같다']];
  if (id === 'gps') return [[-Infinity, ...titles.gps], [P.mapIn - 0.1, '현상 · 보정', '고치지 않으면 어긋나는 위치']];
  if (id === 'myth') return [[-Infinity, ...titles.myth], [tl.at('s19') - 0.5, '오해 바로잡기', '비교할 때에만 드러난다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id;
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', POSTER_Q.q, fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, POSTER_Q.ans, ho, 'rgba(0,0,0,0.95)');
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  if (id === 'close') { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
const POSTER_Q = {y: 880, y2: 1040, q: '머리와 발, 어디가 더 빨리 늙을까', ans: '머리가 더 빨리'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 800, 96); ASIZE ||= fit(POSTER_Q.ans, 800, 230);
  const HS = titleSize(stage, POSTER_Q.q);
  const y1 = lerp(POSTER_Q.y, 228, q), s1_ = lerp(QSIZE, HS, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 760, 0, 1170); g2.addColorStop(0, 'rgba(1,8,12,0)'); g2.addColorStop(0.24, 'rgba(1,8,12,0.78)'); g2.addColorStop(0.78, 'rgba(1,8,12,0.78)'); g2.addColorStop(1, 'rgba(1,8,12,0)');
    c.fillStyle = g2; c.fillRect(0, 760, 1080, 410);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const kq = 1 - smooth(q / 0.7), w_ = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1_, tracking: tr * s1_}) + (kq > 0 ? 2 - kq : 0) * stage.measure('?', {role: 'display', weight: 700, size: s1_, tracking: tr * s1_}), s1 = Math.min(s1_, s1_ * 800 / w_);
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1});
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: T.accent, align: 'center', tracking: tr * s2, shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 26});
  });
}
/** the poster picture: gravity grid, ground, the standing person and the two clocks (model time m) */
export const POSTER_FIG = {x: 470, feet: 1330, H: 900, cx: 722, rHead: 80, rFoot: 80};
function posterPicture(stage, m, a = 1, fig = POSTER_FIG, o = {}) {
  const c = stage.ctx, yH = fig.feet - fig.H * 0.935, yF = fig.feet - fig.rFoot - 6;
  withAlpha(c, a, () => {
    gravityGrid(c, fig.feet, 1, {top: o.gridTop ?? 300});
    earthGround(c, fig.feet);
    const pp = person(c, fig.x, fig.feet, fig.H);
    // thin level lines from the clocks to the head / feet (where each clock is)
    line(c, [[pp.head[0] + fig.H * 0.08, yH], [fig.cx - fig.rHead - 12, yH]], rgba(PAL.gold, 0.4), 2, {dash: [6, 7]});
    line(c, [[fig.x + fig.H * 0.13, yF + fig.rFoot - 4], [fig.cx - fig.rFoot - 12, yF + fig.rFoot - 4]], rgba(PAL.slow, 0.35), 2, {dash: [6, 7]});
    const fl = o.flash || {};
    dial(c, fig.cx, yH, fig.rHead, headRead(m), {col: PAL.gold, glowA: 0.28, flash: fl.head || 0});
    if ((o.wedge || 0) > 0) withAlpha(c, o.wedge, () => {           // how far the head clock has run ahead of the foot clock
      const a0 = secAng(footRead(m)), a1 = secAng(headRead(m)), a1u = a1 < a0 ? a1 + TAU : a1, R = fig.rHead * 0.78;
      c.beginPath(); c.moveTo(fig.cx, yH); c.arc(fig.cx, yH, R, a0, a1u); c.closePath(); c.fillStyle = rgba(PAL.gold, 0.28); c.fill();
      line(c, [[fig.cx, yH], [fig.cx + R * Math.cos(a0), yH + R * Math.sin(a0)]], rgba(PAL.slow, 0.95), 2.5);
    });
    dial(c, fig.cx, yF, fig.rFoot, footRead(m), {col: PAL.slow, glowA: 0.2, flash: fl.foot || 0});
  });
  return {yH, yF};
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/gravity-time/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [55, 60, 66, 72, 80]) h += P.floorRead(t) / 100 + P.dist(t) / 1e5;
  for (const t of [134, 136, 138, 140]) h += P.bhTau(t) / 10;
  return `${h.toFixed(5)}@${tl.duration.toFixed(3)}/${D_HEAD.toFixed(5)}/${D_ROCKET.toFixed(5)}/${EPS_T.toFixed(4)}/${P.rk.emits.length}:${P.rk.recvs.length}/${P.bhTicks.length}/${P.hookHead.length}:${P.hookFoot.length}`;
}
/** 1 at a tick, fading over d s (ticks: sorted times) */
const lastPulse = (ticks, t, d = 0.35) => { let k = -1; for (let i = 0; i < ticks.length && ticks[i] <= t; i++) k = i; return k < 0 ? 0 : clamp(1 - (t - ticks[k]) / d); };

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  einstein(stage, t, p, ctx) { einsteinScene(stage, t, ctx); },
  rocket(stage, t, p, ctx) { rocketScene(stage, t, ctx); },
  tower(stage, t, p, ctx) { towerScene(stage, t, ctx); },
  gps(stage, t, p, ctx) { gpsScene(stage, t, ctx); },
  clocks(stage, t, p, ctx) { clocksScene(stage, t, ctx); },
  extreme(stage, t, p, ctx) { extremeScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → the two clocks drift apart (×10¹⁵) → a lifetime of real difference
export const HOOK_FIG = {x: 470, feet: 1305, H: 760, cx: 690, rHead: 64, rFoot: 64};
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3), m = P.hookM(t);
  const g = easeInOut((t - MORPH[0]) / 1.4), F = {};
  for (const k of Object.keys(POSTER_FIG)) F[k] = lerp(POSTER_FIG[k], HOOK_FIG[k], g);
  const fl = t < MORPH[1] ? {} : {head: lastPulse(P.hookHead, t), foot: lastPulse(P.hookFoot, t)};
  const {yH, yF} = posterPicture(stage, m, ef, F, {flash: fl, wedge: fadeIn(t, P.lead, 0.4)});
  if (t < MORPH[1]) return;
  captionShade(c, ef * fadeIn(t, 1.0, 0.4));
  withAlpha(c, ef, () => {
    const xr = F.cx + F.rHead + 18;
    tag(stage, '높은 곳 · 머리', xr, yH - 22, {align: 'left', color: PAL.gold, a: fadeIn(t, P.high, 0.35), plate: false, size: 28});
    tag(stage, '빨리 감', xr, yH + 20, {align: 'left', color: PAL.gold, a: fadeIn(t, P.lead, 0.35), plate: false, size: 28, role: 'display'});
    tag(stage, '낮은 곳 · 발', xr, yF - 22, {align: 'left', color: PAL.slow, a: fadeIn(t, P.low, 0.35), plate: false, size: 28});
    tag(stage, '느리게 감', xr, yF + 20, {align: 'left', color: PAL.slow, a: fadeIn(t, P.lead + 0.2, 0.35), plate: false, size: 28, role: 'display'});
    tag(stage, '과장 ×10^{15}', F.cx, yH + F.rHead + 34, {color: T.muted, a: fadeIn(t, P.high, 0.35), size: 24, plate: false});
    // the height between the two clocks
    const qb = fadeIn(t, P.headTag, 0.4);
    if (qb > 0) withAlpha(c, qb, () => {
      bracketV(c, 368, yH, yF + F.rFoot, rgba(T.ink, 0.7), 3, 12, -1);
      tag(stage, '1.7 m', 356, (yH + yF) / 2, {align: 'right', size: 30, role: 'display', plate: false});
    });
    // top tile: the shown difference of the two clocks (×10¹⁵), then a lifetime of the real difference
    const qa = fadeIn(t, P.lead, 0.4) * fadeOut(t, P.life, 0.35), ql = fadeIn(t, P.life + 0.25, 0.4);
    if (qa + ql > 0) panel(c, T, 150, 345, 780, 175, 0.86 * Math.max(qa, ql));
    if (qa > 0) withAlpha(c, qa, () => {
      stage.text('두 시계의 차이', 180, 384, {size: 26, weight: 700, color: T.muted});
      tx(stage, '과장 ×10^{15}', 900, 384, {size: 26, weight: 700, color: T.muted, align: 'right'});
      stage.text(`머리 +${fmt(m * D_HEAD, 1)}초`, 180, 448, {role: 'display', size: 52, weight: 700, color: PAL.gold});
      tx(stage, `실제: 1초마다 ${sciStr(HEAD_RATE, 1)}초`, 900, 452, {size: 28, weight: 700, color: T.ink, align: 'right'});
    });
    if (ql > 0) withAlpha(c, ql, () => {
      const yrs = LIFE_Y * easeInOut((t - P.lifeRun[0]) / (P.lifeRun[1] - P.lifeRun[0])), us = LIFE_US * yrs / LIFE_Y;
      const today0 = fadeIn(t, P.today, 0.25), today = fadeIn(t, P.today + 0.25, 0.3);
      if (today0 < 1) stage.text('평생 쌓이는 차이 (실제 값)', 180, 382, {size: 26, weight: 700, color: T.muted, alpha: 1 - today0});
      if (today > 0) stage.text('오늘날의 원자시계로 잴 수 있는 크기', 180, 382, {size: 26, weight: 700, color: PAL.good, alpha: today});
      stage.text(`${Math.round(yrs)}년`, 900, 382, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'right'});
      const X0 = 180, X1 = 900, fw = (X1 - X0) * us;
      rect(c, X0, 425, X1 - X0, 28, 6, rgba('#000000', 0.35), rgba(T.border, 1), 1.5);
      if (fw > 0.5) rect(c, X0, 425, fw, 28, 6, PAL.gold);
      const mk = fadeIn(t, P.million, 0.3);
      line(c, [[X1, 414], [X1, 464]], rgba(T.ink, 0.6 + 0.4 * mk), 3);
      stage.text('100만분의 1초 (1 μs)', X1, 490, {size: 26, weight: 700, color: mix(T.muted, T.ink, mk), align: 'right'});
      if (us > 0.02) stage.text(`${fmt(us, 2)} μs`, X0 + fw, 490, {size: 28, weight: 700, color: PAL.gold, align: 'center', role: 'display'});
    });
  });
}

// ------------------------------------------------------------------ origin: 重 + 力, gravity ← gravitas; a falling ball photographed every 0.1 s
const OB = {x: 540, y0: 990, pxm: 96, r: 13};
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const qh = fadeIn(t, P.hanja, 0.4), hv = fadeIn(t, P.heavy, 0.35), fo = fadeIn(t, P.force, 0.35);
    withAlpha(c, qh, () => {
      if (hv > 0) glow(c, 380, 520, 150, PAL.gold, 0.18 * hv);
      if (fo > 0) glow(c, 700, 520, 150, PAL.gold, 0.18 * fo);
      stage.text('重', 380, 520, {role: 'display', size: 170, weight: 700, color: mix(T.ink, PAL.gold, hv), align: 'center'});
      stage.text('+', 540, 520, {role: 'display', size: 70, weight: 700, color: T.muted, align: 'center'});
      stage.text('力', 700, 520, {role: 'display', size: 170, weight: 700, color: mix(T.ink, PAL.gold, fo), align: 'center'});
    });
    stage.text('무거울 중', 380, 650, {size: 34, weight: 700, color: T.ink, align: 'center', alpha: hv});
    stage.text('힘 력', 700, 650, {size: 34, weight: 700, color: T.ink, align: 'center', alpha: fo});
    const qg = fadeIn(t, P.gravity, 0.35), ql = fadeIn(t, P.latin, 0.35), qm = fadeIn(t, P.heaviness, 0.35);
    stage.text('gravity', 520, 770, {role: 'display', size: 62, weight: 700, color: T.ink, align: 'right', alpha: qg});
    stage.text('← gravitas', 548, 770, {role: 'display', size: 62, weight: 700, color: PAL.gold, alpha: ql});
    stage.text('라틴어 · 무거움 (gravis = 무거운)', 540, 846, {size: 30, weight: 700, color: T.ink, align: 'center', alpha: qm});
    // the falling ball (real g, positions every 0.1 s)
    const yFloor = OB.y0 + DROP_H * OB.pxm + OB.r;
    const qb = fadeIn(t, P.drops[0] - 0.6, 0.4);
    if (qb > 0) withAlpha(c, qb, () => {
      line(c, [[OB.x - 120, yFloor], [OB.x + 120, yFloor]], rgba(T.ink, 0.5), 3);
      let k = -1; for (let i = 0; i < P.drops.length; i++) if (P.drops[i] <= t) k = i;
      const t0 = k >= 0 ? P.drops[k] : null, tt = t0 == null ? 0 : Math.min(t - t0, DROP_T);
      for (let j = 1; j * 0.1 <= tt + 1e-6; j++) { const y = OB.y0 + 0.5 * G_SURF * (j * 0.1) ** 2 * OB.pxm; circle(c, OB.x, y, OB.r, rgba(PAL.gold, 0.32)); line(c, [[OB.x + 20, y], [OB.x + 34, y]], rgba(T.muted, 0.7), 2); }
      circle(c, OB.x, OB.y0, OB.r, rgba(PAL.gold, 0.32));
      const y = OB.y0 + 0.5 * G_SURF * tt * tt * OB.pxm;
      glow(c, OB.x, y, 40, PAL.gold, 0.3); circle(c, OB.x, y, OB.r, PAL.gold);
      stage.text('0.1초마다 찍은 위치', OB.x - 50, OB.y0 + 20, {size: 24, weight: 700, color: T.muted, align: 'right'});
      arrow(c, [OB.x + 120, OB.y0 + 60], [OB.x + 120, OB.y0 + 230], rgba(PAL.gold, 0.9), 5, {head: 18});
      stage.text('중력', OB.x + 146, OB.y0 + 150, {role: 'display', size: 34, weight: 700, color: PAL.gold});
    });
  });
}

// ---- shared props
function cabinBox(c, x0, y0, x1, y1, o = {}) {
  const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#0B2430'); g.addColorStop(0.5, '#0E2C3A'); g.addColorStop(1, '#081C26');
  rect(c, x0, y0, x1 - x0, y1 - y0, 6, g);
  rect(c, x0, y0, x1 - x0, y1 - y0, 6, null, rgba(PAL.metal, 0.85), 4);
  rect(c, x0 + 4, y1 - 14, x1 - x0 - 8, 10, 2, rgba(PAL.metal, 0.35));
}
function scalePad(c, x, y, w, hot = 0) {
  rect(c, x - w / 2, y, w, 14, 4, mix('#4A6470', PAL.gold, 0.35 * hot), rgba('#0A1820', 0.9), 1.5);
  rect(c, x - w * 0.18, y + 3, w * 0.36, 7, 2, rgba(PAL.good, 0.6 + 0.4 * hot));
}
function apple(c, x, y, r = 10, a = 1) { withAlpha(c, a, () => { circle(c, x, y, r, '#D9483B'); circle(c, x - r * 0.35, y - r * 0.35, r * 0.35, rgba('#FFFFFF', 0.35)); line(c, [[x, y - r], [x + 2, y - r - 6]], '#5B3A1E', 2); }); }
function flame(c, x, y, w, L, t, a = 1) {
  if (L <= 2 || a <= 0) return;
  withAlpha(c, a, () => {
    const fl = 1 + 0.08 * Math.sin(t * 41) + 0.05 * Math.sin(t * 67 + 1.3);
    glow(c, x, y + L * 0.35, L * 0.9, '#FF9B3D', 0.35);
    poly(c, [[x - w / 2, y], [x + w / 2, y], [x + w * 0.12, y + L * fl], [x - w * 0.12, y + L * fl]], rgba('#FFB255', 0.85));
    poly(c, [[x - w * 0.3, y], [x + w * 0.3, y], [x, y + L * 0.6 * fl]], rgba('#FFF1C8', 0.9));
  });
}
function streaks(c, S, v, a = 1, box = [0, 330, 1080, 1340], n = 70) {
  if (a <= 0) return;
  const [x0, y0, x1, y1] = box, H = y1 - y0, len = clamp(v * 0.22, 2, 70);
  withAlpha(c, a, () => { for (let i = 0; i < n; i++) { const x = x0 + rand(i * 3.1) * (x1 - x0), y = y0 + ((((rand(i * 7.7) * H + S) % H) + H) % H); line(c, [[x, y], [x, y - len]], rgba('#CFE6F2', 0.18 + 0.25 * rand(i * 1.9)), 1.6); } });
}

// ------------------------------------------------------------------ einstein: 1907 · a falling box (scale reads 0) → Earth vs accelerating rocket: the same
const EF = {x0: 420, x1: 720, y0: 600, y1: 1100, pxm: 14, man: 400};
function einsteinScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx), a1 = fadeOut(t, P.fallEnd, 0.35), a2 = fadeIn(t, P.two, 0.45);
  withAlpha(c, sf, () => {
    if (a1 > 0) withAlpha(c, a1, () => fallPart(stage, t, P));
    if (a2 > 0) withAlpha(c, a2, () => twoCabins(stage, t, P));
  });
}
function fallPart(stage, t, P) {
  const c = stage.ctx, T = stage.theme, tf = Math.max(0, t - P.release), off = 0.5 * G_SURF * tf * tf * EF.pxm, v = G_SURF * tf;
  // the building (seen from the falling box: it slides up)
  clipRect(c, 145, 440, 195, 900, 0, () => {
    rect(c, 145, 440, 195, 900, 0, '#0B1E28');
    for (let j = -1; j < 12; j++) { const y = 440 + ((((j * 92 - off) % (92 * 11)) + 92 * 11) % (92 * 11)) - 40; for (const x of [168, 228, 288]) rect(c, x, y, 34, 50, 3, rgba('#F6D58C', 0.16 + 0.1 * rand(j * 5 + x))); }
    line(c, [[340, 440], [340, 1340]], rgba(PAL.metal, 0.5), 3);
  });
  streaks(c, off * 1.0, v * 10, clamp(v / 8), [350, 440, 410, 1340], 14); streaks(c, off * 1.0, v * 10, clamp(v / 8), [735, 440, 760, 1340], 6);
  // beam and cable (stay with the building)
  const yb = 470 - off; if (yb > 300) withAlpha(c, clamp((yb - 300) / 60), () => { rect(c, 330, yb - 10, 280, 16, 3, '#3E5560'); line(c, [[570, yb + 6], [570, tf > 0 ? yb + 120 : EF.y0]], rgba(PAL.metal, 0.9), 3); });
  cabinBox(c, EF.x0, EF.y0, EF.x1, EF.y1);
  const feet = EF.y1 - 22, man = person(c, 520, feet, EF.man);
  scalePad(c, 520 + 12, feet, 130, tf > 0 ? 1 - smooth(tf / 0.2) : 0);
  // the apple: held, then let go just after the release; it stays where it was (falls with the box)
  const ta = Math.max(0, t - P.release - 0.5), ax = man.hand[0] + 16 + 8 * ta, ay = man.hand[1] + 6 - 3 * ta;
  apple(c, ax, ay, 11);
  // scale readout
  const kg = 60 * (1 - smooth(tf / 0.18));
  panel(c, T, 750, 640, 180, 150);
  stage.text('저울 눈금', 840, 672, {size: 24, weight: 700, color: T.muted, align: 'center'});
  stage.text(`${Math.round(kg)} kg`, 840, 735, {role: 'display', size: 50, weight: 700, color: tf > 0 ? PAL.gold : T.ink, align: 'center'});
  tag(stage, '자유 낙하', 840, 830, {size: 28, color: PAL.gold, a: fadeIn(t, P.release + 0.1, 0.3), role: 'display', plate: false});
  if (tf > 0) arrow(c, [840, 860], [840, 950], rgba(PAL.gold, 0.85), 5, {head: 18});
  tag(stage, '무게를 느끼지 못함', 570, 1170, {size: 34, color: PAL.gold, a: fadeIn(t, P.feel, 0.35), role: 'display', plate: false});
  stage.text('1907 · Einstein', 540, 392, {role: 'display', size: 44, weight: 700, color: PAL.gold, align: 'center', alpha: fadeIn(t, P.card5, 0.4)});
  tag(stage, '“내 생애 가장 행복한 생각”', 540, 1245, {size: 28, color: T.ink, a: fadeIn(t, P.clue, 0.4), plate: false});
}
const TC = [{x0: 165, x1: 505, name: '지구 위에 서 있음', kind: 'earth'}, {x0: 575, x1: 915, name: '위로 가속하는 로켓 안', kind: 'rocket'}], TCY = [600, 1060], TCM = 300;
function twoCabins(stage, t, P) {
  const c = stage.ctx, T = stage.theme, ra = fadeIn(t, P.up6, 0.4);
  // left: the ground; right: the rocket (nose, flame, passing stars)
  { const g = c.createLinearGradient(0, TCY[1], 0, 1330); g.addColorStop(0, PAL.earth); g.addColorStop(1, rgba(PAL.earth2, 0));
    rect(c, 150, TCY[1], 370, 1330 - TCY[1], 0, g); line(c, [[150, TCY[1] + 1], [520, TCY[1] + 1]], rgba('#A8E2FF', 0.55), 3); }
  withAlpha(c, ra, () => {
    const x0 = TC[1].x0, x1 = TC[1].x1, xm = (x0 + x1) / 2, S = 160 * (t - P.up6) ** 2;
    streaks(c, S, 120, 1, [530, 330, 565, 1340], 10); streaks(c, S, 120, 1, [925, 330, 1060, 1340], 16);
    poly(c, [[x0, TCY[0]], [x1, TCY[0]], [xm + 40, TCY[0] - 95], [xm, TCY[0] - 120], [xm - 40, TCY[0] - 95]], '#2A4350', rgba(PAL.metal, 0.8), 3);
    poly(c, [[xm - 46, TCY[1]], [xm + 46, TCY[1]], [xm + 62, TCY[1] + 34], [xm - 62, TCY[1] + 34]], '#34505C', rgba(PAL.metal, 0.8), 2);
    flame(c, xm, TCY[1] + 34, 100, 120, t, 1);
  });
  TC.forEach((cb, j) => {
    const xm = (cb.x0 + cb.x1) / 2, rocket = cb.kind === 'rocket';
    withAlpha(c, rocket ? ra : 1, () => {
      cabinBox(c, cb.x0, TCY[0], cb.x1, TCY[1]);
      const feet = TCY[1] - 22, px = cb.x0 + 105, man = person(c, px, feet, TCM);
      scalePad(c, px + 10, feet, 104);
      // the apple dropped from the hand: real g in the box frame (on Earth it falls; in the rocket the floor comes up — the same picture)
      let k = -1; for (let i = 0; i < P.apples.length; i++) if (P.apples[i] <= t) k = i;
      const hx = man.hand[0] + 18, hy = man.hand[1] + 6, floorY = feet - 9, pxm = (floorY - hy) / APPLE_H;
      if (k < 0 || t - P.apples[k] > APPLE_T + 0.7) apple(c, hx, hy, 9);
      else { const tt = Math.min(t - P.apples[k], APPLE_T);
        for (let q = 0.05; q < tt; q += 0.05) apple(c, hx, hy + 0.5 * G_SURF * q * q * pxm, 9, 0.22);
        apple(c, hx, hy + 0.5 * G_SURF * tt * tt * pxm, 9); }
      stage.text('저울', cb.x1 - 24, TCY[0] + 34, {size: 24, weight: 700, color: T.muted, align: 'right'});
      stage.text('60 kg', cb.x1 - 24, TCY[0] + 74, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'right'});
      stage.text(cb.name, xm, 400, {role: 'display', size: 32, weight: 700, color: rocket ? PAL.gold : T.ink, align: 'center'});
    });
  });
  tag(stage, '중력 1 g ↓', 335, 1130, {size: 28, color: T.ink, plate: false, role: 'display'});
  tag(stage, '가속 1 g ↑', 850, 1130, {size: 28, color: PAL.gold, a: ra, plate: false, role: 'display'});
  const qe = fadeIn(t, P.eq, 0.35);
  if (qe > 0) withAlpha(c, qe, () => {
    stage.text('=', 540, 830, {role: 'display', size: 90, weight: 700, color: PAL.gold, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16});
    stage.text('구별할 수 없음', 540, 1250, {role: 'display', size: 40, weight: 700, color: PAL.gold, align: 'center'});
  });
}

// ------------------------------------------------------------------ rocket: 3-part instrument panel (stage · knob · meters), drawn in the ceiling clock's time
function rocketScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const eq = smooth((t - P.eqv[0]) / (P.eqv[1] - P.eqv[0])), acc = P.acc(t), d = P.delta(t), hpx = RK.floor - RK.ceil;
  withAlpha(c, sf, () => {
    streaks(c, P.dist(t) * 1.5, P.speed(t) * 1.5, (1 - eq) * fadeIn(t, P.ign[0], 0.6), [0, 330, 1080, 1340], 80);
    if (eq > 0) earthGround(c, lerp(1560, 1215, eq), eq, {R: 2600});
    // hull, nose, fins, engine
    const xm = (RK.x0 + RK.x1) / 2;
    poly(c, [[RK.x0, RK.ceil - 20], [RK.x1, RK.ceil - 20], [xm + 120, RK.ceil - 110], [xm, RK.ceil - 160], [xm - 120, RK.ceil - 110]], '#2A4350', rgba(PAL.metal, 0.85), 3);
    poly(c, [[RK.x0, 1060], [RK.x0 - 34, 1205], [RK.x0, 1170]], '#2A4350', rgba(PAL.metal, 0.7), 2);
    poly(c, [[RK.x1, 1060], [RK.x1 + 34, 1205], [RK.x1, 1170]], '#2A4350', rgba(PAL.metal, 0.7), 2);
    poly(c, [[xm - 48, 1168], [xm + 48, 1168], [xm + 66, 1213], [xm - 66, 1213]], '#34505C', rgba(PAL.metal, 0.8), 2);
    flame(c, xm, 1213, 110, 112 * acc / G_SURF * (1 - eq), t, 1 - eq);
    rect(c, RK.x0, RK.ceil - 20, RK.x1 - RK.x0, RK.floor - RK.ceil + 50, 6, '#1D323C', rgba(PAL.metal, 0.8), 3);
    cabinBox(c, RK.wl, RK.ceil, RK.wr, RK.floor + 12);
    person(c, 255, RK.floor, H_PERSON * hpx / ROCKET_H, {a: 0.9});
    // emitter (floor) and receiver (ceiling)
    const sendF = lastPulse(P.rk.emits, t, 0.3), recvF = lastPulse(P.rk.recvs, t, 0.35);
    rect(c, RK.col - 42, RK.floor - 22, 84, 20, 4, mix('#28465A', PAL.slow, 0.3 + 0.7 * sendF), rgba(PAL.slow, 0.9), 2);
    rect(c, RK.col - 42, RK.ceil + 2, 84, 20, 4, mix('#4A4228', PAL.gold, 0.3 + 0.7 * recvF), rgba(PAL.gold, 0.9), 2);
    if (sendF > 0) glow(c, RK.col, RK.floor - 12, 70, PAL.slow, 0.5 * sendF);
    if (recvF > 0) glow(c, RK.col, RK.ceil + 12, 80, PAL.gold, 0.55 * recvF);
    // light pulses
    clipRect(c, RK.wl + 4, RK.ceil + 22, RK.wr - RK.wl - 8, hpx - 44, 0, () => {
      for (const p of P.rk.pulses) {
        const u = P.pulseU(p, t); if (u == null) continue;
        const y = RK.floor - 22 - u * (hpx - 44), hl = p === P.hl && t > P.s08 - 0.3 && t < P.s09;
        const col = hl ? PAL.gold : PAL.light;
        glow(c, RK.col, y, 60, col, 0.35); line(c, [[RK.col - 52, y], [RK.col + 52, y]], col, 6);
      }
    });
    line(c, [[RK.col + 46, RK.ceil + 12], [570, RK.ceil + 12]], rgba(PAL.gold, 0.5), 2, {dash: [6, 6]});
    line(c, [[RK.col + 46, RK.floor - 12], [570, RK.floor - 12]], rgba(PAL.slow, 0.5), 2, {dash: [6, 6]});
    tag(stage, '과장 ×10^{15} · 빛은 느리게 그림', 750, 1222, {size: 24, color: T.muted, plate: false});
    rocketPanel(stage, t, P, eq, acc, d);
  });
}
function rocketPanel(stage, t, P, eq, acc, d) {
  const c = stage.ctx, T = stage.theme, X = 570, Wd = 360, xt = 690;
  // ceiling meter
  const iv = P.lastInterval(t), recvF = lastPulse(P.rk.recvs, t, 0.4);
  panel(c, T, X, 455, Wd, 185, 0.88, 12, recvF > 0 ? rgba(PAL.gold, 0.4 + 0.6 * recvF) : null);
  dial(c, 628, 548, 42, 36000 + P.ceilRead(t), {col: PAL.gold, glowA: 0.15});
  stage.text('천장 · 받은 간격', xt, 486, {size: 24, weight: 700, color: T.muted});
  stage.text(iv == null ? '—' : `${fmt(iv, 3)} 초`, xt, 538, {role: 'display', size: 44, weight: 700, color: iv != null && iv > 1.0005 ? PAL.gold : T.ink});
  tx(stage, '과장 ×10^{15}', xt, 582, {size: 24, weight: 700, color: T.muted});
  tx(stage, iv == null || iv < 1.0005 ? '실제 차이 0' : `실제 +${sciStr((iv - 1) / EXAG, 1)}초`, xt, 618, {size: 24, weight: 700, color: T.ink});
  // knob: acceleration (→ gravity in s10)
  panel(c, T, X, 660, Wd, 110, 0.88);
  const ka = fadeOut(t, P.eqv[0] + 0.3, 0.25), kg = fadeIn(t, P.eqv[0] + 0.55, 0.3);
  if (ka > 0) stage.text('가속도 a', 592, 692, {size: 26, weight: 700, color: T.ink, alpha: ka});
  if (kg > 0) stage.text('중력 g', 592, 692, {size: 26, weight: 700, color: PAL.good, alpha: kg});
  stage.text(acc < 0.05 ? '0' : `${fmt(acc, 1)} m/s²`, 908, 692, {role: 'display', size: 30, weight: 700, color: acc > 0.05 ? PAL.gold : T.ink, align: 'right'});
  const k0 = 625, k1 = 870, kx = lerp(k0, k1, acc / G_SURF);
  line(c, [[k0, 738], [k1, 738]], rgba(T.border, 1), 8); line(c, [[k0, 738], [kx, 738]], PAL.gold, 8);
  circle(c, kx, 738, 13, '#FFE7B0'); ring(c, kx, 738, 13, PAL.gold, 3);
  stage.text('0', 604, 738, {size: 24, weight: 700, color: T.muted, align: 'center'});
  stage.text('1 g', 884, 738, {size: 24, weight: 700, color: T.muted});
  // middle panel: s08 speeds (outside view) → s09 the two seconds → s10 equivalence
  panel(c, T, X, 790, Wd, 225, 0.88);
  const q8 = fadeIn(t, P.s08 + 0.3, 0.35) * fadeOut(t, P.s09, 0.3), q9 = fadeIn(t, P.s09 + 0.3, 0.35) * fadeOut(t, P.s10, 0.3), q10 = fadeIn(t, P.s10 + 0.3, 0.35);
  const q7 = 1 - fadeIn(t, P.s08, 0.3);
  if (q7 > 0) withAlpha(c, q7, () => {
    stage.text('보내는 바닥 시계', 592, 822, {size: 24, weight: 700, color: T.muted});
    stage.text('1초마다 한 번', 592, 866, {role: 'display', size: 34, weight: 700, color: PAL.slow});
    stage.text('받는 천장 시계', 592, 918, {size: 24, weight: 700, color: T.muted});
    stage.text(iv != null && iv > 1.0005 ? '1초보다 긴 간격' : '같은 간격', 592, 962, {role: 'display', size: 34, weight: 700, color: iv != null && iv > 1.0005 ? PAL.gold : T.ink});
  });
  if (q8 > 0) withAlpha(c, q8, () => {
    const hl = P.hl, vE = P.speed(Math.min(t, hl.emit)), vR = P.speed(Math.min(t, hl.recv)), vMax = P.speed(hl.recv) * 1.1, L = 300;
    stage.text('바깥에서 본 로켓의 속도', 592, 820, {size: 24, weight: 700, color: T.muted});
    stage.text('보낼 때 · 바닥', 592, 858, {size: 24, weight: 700, color: PAL.slow});
    rect(c, 592, 874, L * vE / vMax, 16, 4, PAL.slow);
    stage.text('받을 때 · 천장', 592, 922, {size: 24, weight: 700, color: PAL.gold});
    rect(c, 592, 938, L * vR / vMax, 16, 4, PAL.gold);
    tag(stage, '더 빨라져 달아남', 750, 988, {size: 26, color: PAL.gold, a: fadeIn(t, hl.recv, 0.3), plate: false, role: 'display'});
  });
  if (q9 > 0) withAlpha(c, q9, () => {
    const L0 = 190, e = Math.max(0, t - P.cmp0), dd = P.delta(P.cmp0 + 0.1);
    stage.text('천장 시계로 잰 1초 (과장)', 592, 820, {size: 24, weight: 700, color: T.muted});
    stage.text('천장의 1초', 592, 858, {size: 24, weight: 700, color: PAL.gold});
    rect(c, 592, 874, L0 * Math.min(e, 1), 16, 4, PAL.gold);
    stage.text('바닥의 1초', 592, 922, {size: 24, weight: 700, color: PAL.slow});
    rect(c, 592, 938, L0 * Math.min(e, 1 + dd), 16, 4, PAL.slow);
    line(c, [[592 + L0, 868], [592 + L0, 960]], rgba(T.ink, 0.5), 2, {dash: [4, 4]});
    if (e > 1 + dd) stage.text(`+${fmt(dd, 2)}초`, 592 + L0 * (1 + dd) + 10, 946, {size: 24, weight: 700, color: PAL.slow});
    tag(stage, '아래 시계가 느리게 감', 750, 990, {size: 26, color: PAL.slow, a: fadeIn(t, P.slow9, 0.3), plate: false, role: 'display'});
  });
  if (q10 > 0) withAlpha(c, q10, () => {
    stage.text('등가 원리', 592, 820, {size: 24, weight: 700, color: T.muted});
    stage.text('가속 1 g = 중력 1 g', 592, 866, {role: 'display', size: 34, weight: 700, color: PAL.good});
    stage.text('받은 간격도 같음', 592, 914, {size: 26, weight: 700, color: T.ink});
    tag(stage, '아래쪽일수록 느리게', 750, 970, {size: 30, color: PAL.slow, a: fadeIn(t, P.lower10, 0.3), plate: false, role: 'display'});
  });
  // floor meter
  const sendF = lastPulse(P.rk.emits, t, 0.4);
  panel(c, T, X, 1035, Wd, 150, 0.88, 12, sendF > 0 ? rgba(PAL.slow, 0.4 + 0.6 * sendF) : null);
  dial(c, 628, 1110, 42, 36000 + P.floorRead(t), {col: PAL.slow, glowA: 0.12});
  stage.text('바닥 · 보낸 간격', xt, 1066, {size: 24, weight: 700, color: T.muted});
  stage.text('1 초', xt, 1114, {role: 'display', size: 44, weight: 700, color: PAL.slow});
  stage.text('바닥 시계로 잼', xt, 1156, {size: 24, weight: 700, color: T.muted});
}

// ------------------------------------------------------------------ tower: 1959 · Harvard, 22.5 m, gamma rays from the bottom; the spacing stretches (×10¹⁴)
const TW = {x0: 190, x1: 420, top: 490, ground: 1235, shaft: 305, src: 1205, det: 515};
const TWAVE = {f: 4.0, lam0: 64};
/** height fraction reached by the gamma-ray wave front (local spacing λ0(1 + εu), frequency f) */
export const towerFront = (P, t) => t <= P.gam ? 0 : Math.min(1, (Math.exp(EPS_T * TWAVE.lam0 * TWAVE.f * (t - P.gam) / (TW.src - TW.det)) - 1) / EPS_T);
function towerScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), H = TW.src - TW.det;
  withAlpha(c, sf, () => {
    earthGround(c, TW.ground, 1, {R: 2600});
    // the building section
    rect(c, TW.x0, TW.top, TW.x1 - TW.x0, TW.ground - TW.top, 4, '#132833', rgba(PAL.metal, 0.75), 3);
    for (let k = 1; k < 7; k++) { const y = TW.top + k * (TW.ground - TW.top) / 7; line(c, [[TW.x0, y], [TW.shaft - 30, y]], rgba(PAL.metal, 0.35), 3); line(c, [[TW.shaft + 30, y], [TW.x1, y]], rgba(PAL.metal, 0.35), 3); }
    for (let k = 0; k < 7; k++) for (const x of [222, 388]) rect(c, x - 14, TW.top + k * 106 + 30, 28, 44, 3, rgba('#F6D58C', 0.12));
    rect(c, TW.shaft - 26, TW.top + 6, 52, TW.ground - TW.top - 12, 3, '#06141B', rgba(PAL.metal, 0.4), 1.5);
    // source (bottom) and detector (top)
    const qs = fadeIn(t, P.tb, 0.3);
    rect(c, TW.shaft - 30, TW.src - 4, 60, 26, 4, mix('#2A2F48', PAL.gamma, 0.3 + 0.5 * qs), rgba(PAL.gamma, 0.9), 2);
    rect(c, TW.shaft - 30, TW.det - 22, 60, 26, 4, mix('#4A4228', PAL.gold, 0.3 + 0.5 * qs), rgba(PAL.gold, 0.9), 2);
    // the gamma-ray wave: local spacing λ(u) = λ0(1 + ε u), u = height fraction (ε = 0.246, ×10¹⁴)
    if (t > P.gam) {
      const f = TWAVE.f, lam0 = TWAVE.lam0, eps = EPS_T, ph = f * (t - P.gam), uF = towerFront(P, t);
      const pts = []; for (let y = TW.src; y >= TW.src - uF * H; y -= 2) { const u = (TW.src - y) / H, Phi = H / (eps * lam0) * Math.log(1 + eps * u); pts.push([TW.shaft + 15 * Math.sin(TAU * (ph - Phi)), y]); }
      if (pts.length > 1) { glow(c, TW.shaft, TW.src - uF * H, 40, PAL.gamma, 0.4); line(c, pts, PAL.gamma, 3.5); }
    }
    // height bracket
    const qh = fadeIn(t, P.h225, 0.4);
    if (qh > 0) withAlpha(c, qh, () => { const y1 = lerp(TW.src + 9, TW.det - 9, easeOut(clamp((t - P.h225) / 0.8))); bracketV(c, 448, TW.src + 9, y1, rgba(T.ink, 0.8), 3, 12, 1); });
    tag(stage, '22.5 m', 466, (TW.src + TW.det) / 2, {align: 'left', size: 34, role: 'display', a: fadeIn(t, P.h225 + 0.4, 0.4), plate: false});
    stage.text('1959 · Harvard', 540, 382, {role: 'display', size: 44, weight: 700, color: PAL.gold, align: 'center', alpha: fadeIn(t, P.card11, 0.4)});
    stage.text('Pound–Rebka', 540, 432, {size: 28, weight: 700, color: T.muted, align: 'center', alpha: fadeIn(t, P.harv, 0.4)});
    // meters
    const qf = fadeIn(t, P.freq, 0.35);
    withAlpha(c, qs, () => {
      panel(c, T, 600, 480, 330, 170, 0.88);
      stage.text('위 · 검출기', 622, 512, {size: 24, weight: 700, color: PAL.gold});
      stage.text('받은 진동수', 622, 552, {size: 26, weight: 700, color: T.ink, alpha: qf});
      tx(stage, `1 − ${sciStr(TOWER_SHIFT, 1)} 배`, 622, 604, {role: 'display', size: 34, weight: 700, color: PAL.gold, alpha: fadeIn(t, P.cmp11, 0.35)});
    });
    withAlpha(c, qs, () => {
      panel(c, T, 600, 1070, 330, 150, 0.88);
      stage.text('아래 · 감마선원', 622, 1102, {size: 24, weight: 700, color: PAL.gamma});
      stage.text('보낸 진동수', 622, 1142, {size: 26, weight: 700, color: T.ink, alpha: qf});
      stage.text('1 배', 622, 1188, {role: 'display', size: 34, weight: 700, color: T.ink, alpha: qf});
    });
    // the spacing comparison (exaggerated)
    const qc = fadeIn(t, P.cmp11, 0.4);
    if (qc > 0) withAlpha(c, qc, () => {
      panel(c, T, 600, 700, 330, 320, 0.88);
      tx(stage, '물결 간격 (과장 ×10^{14})', 622, 734, {size: 24, weight: 700, color: T.muted});
      const L0 = 190;
      stage.text('위', 622, 800, {size: 26, weight: 700, color: PAL.gold}); rect(c, 668, 790, L0 * (1 + EPS_T), 18, 4, PAL.gold);
      stage.text('아래', 622, 860, {size: 26, weight: 700, color: PAL.gamma}); rect(c, 668, 850, L0, 18, 4, PAL.gamma);
      stage.text('위로 갈수록 늘어남', 622, 920, {size: 26, weight: 700, color: T.ink});
      stage.text('= 위에서 받은 진동수가 낮음', 622, 968, {size: 24, weight: 700, color: T.muted});
    });
    tag(stage, '처음 확인 · 예측과 10% 안에서 일치', 540, 1300, {size: 30, color: PAL.gold, a: fadeIn(t, P.first, 0.4), role: 'display', plate: false});
  });
}

// ------------------------------------------------------------------ gps: orbit to scale (20,200 km), +45 / −7 / +38 μs a day, uncorrected → the position slides ~11 km a day
const GE = {cx: 540, cy: 790, R: 78}; GE.orb = GE.R * GPS_R / R_E;
function earthDisc(c, x, y, R, a = 1) {
  withAlpha(c, a, () => {
    glow(c, x, y, R * 1.6, '#4FB3E8', 0.2);
    const g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R); g.addColorStop(0, '#3C8DBA'); g.addColorStop(0.7, '#1A4F72'); g.addColorStop(1, '#0B2638');
    circle(c, x, y, R, g);
    c.save(); c.beginPath(); c.arc(x, y, R, 0, TAU); c.clip();
    for (const [u, v, rx, ry, rot] of [[-0.35, -0.2, 0.42, 0.28, 0.4], [0.35, 0.25, 0.3, 0.42, -0.3], [0.1, -0.55, 0.25, 0.14, 0.1], [-0.2, 0.55, 0.22, 0.16, 0.6]]) { c.beginPath(); c.ellipse(x + u * R, y + v * R, rx * R, ry * R, rot, 0, TAU); c.fillStyle = rgba('#5E9F6A', 0.75); c.fill(); }
    const sh = c.createLinearGradient(x - R, y, x + R, y); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.6, 'rgba(0,0,0,0.1)'); sh.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = sh; c.fillRect(x - R, y - R, 2 * R, 2 * R);
    c.restore(); ring(c, x, y, R + 2, rgba('#A8E2FF', 0.6), 2);
  });
}
function satellite(c, x, y, ang, s = 1) {
  c.save(); c.translate(x, y); c.rotate(ang);
  rect(c, -34 * s, -7 * s, 22 * s, 14 * s, 2, '#3A6F9A', rgba('#BFE3FF', 0.8), 1.2); rect(c, 12 * s, -7 * s, 22 * s, 14 * s, 2, '#3A6F9A', rgba('#BFE3FF', 0.8), 1.2);
  rect(c, -10 * s, -10 * s, 20 * s, 20 * s, 3, '#C9B37A', rgba('#FFF1C8', 0.9), 1.5);
  c.restore();
}
function pin(c, x, y, col, a = 1) {
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-6, -14, -18, -22, -18, -36); c.arc(0, -36, 18, Math.PI, 0); c.bezierCurveTo(18, -22, 6, -14, 0, 0); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2; c.stroke(); circle(c, 0, -36, 7, '#0B1C25');
    c.restore();
  });
}
function gpsScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), qo = fadeIn(t, P.orb0, 0.5), mapA = fadeIn(t, P.mapIn, 0.5);
  withAlpha(c, sf, () => {
    withAlpha(c, 1 - mapA, () => {
      earthDisc(c, GE.cx, GE.cy, GE.R);
      const sweep = clamp((t - P.orb0) / 1.0);
      if (sweep > 0) ring(c, GE.cx, GE.cy, GE.orb, rgba(PAL.cool, 0.8), 3.5, -Math.PI / 2, -Math.PI / 2 + Math.min(TAU - 1e-3, TAU * easeOut(sweep)));
      const a = P.satA(t), sx = GE.cx + GE.orb * Math.cos(a), sy = GE.cy + GE.orb * Math.sin(a);
      withAlpha(c, qo, () => {
        const w = fadeIn(t, P.weak, 0.4);
        dial(c, GE.cx, GE.cy - GE.R - 34, 24, 36000 + t, {col: PAL.slow, glowA: 0.15});
        glow(c, sx, sy, 60, PAL.gold, 0.3 + 0.3 * w); satellite(c, sx, sy, a + Math.PI / 2, 1.1);
        const ox = sx + 56 * Math.cos(a), oy = sy + 56 * Math.sin(a);
        dial(c, ox, oy, 24, 36000 + t * 1.00, {col: PAL.gold, glowA: 0.2 + 0.3 * w});
        const qm = fadeIn(t, P.moving, 0.35) * fadeOut(t, P.mapIn, 0.3);
        if (qm > 0) withAlpha(c, qm, () => { const tx_ = -Math.sin(a), ty_ = Math.cos(a); arrow(c, [sx, sy], [sx - 90 * tx_, sy - 90 * ty_], rgba(PAL.cool, 0.95), 4, {head: 16}); });
        tag(stage, 'GPS 위성', 540, 418, {size: 30, color: PAL.gold, role: 'display', a: fadeIn(t, P.gpsLabel, 0.35), plate: false});
        tag(stage, '시간 압축 · 한 바퀴 12시간', 540, 1112, {size: 24, color: T.muted, plate: false, a: qo});
        tag(stage, '땅의 시계', GE.cx, GE.cy + GE.R + 30, {size: 24, color: PAL.slow, plate: false, a: fadeIn(t, P.weak, 0.4)});
      });
      const qa = fadeIn(t, P.alt, 0.4);
      if (qa > 0) withAlpha(c, qa, () => {
        const an = -2.45, ux = Math.cos(an), uy = Math.sin(an), r1 = lerp(GE.R, GE.orb, easeOut(clamp((t - P.alt) / 0.8)));
        line(c, [[GE.cx + GE.R * ux, GE.cy + GE.R * uy], [GE.cx + r1 * ux, GE.cy + r1 * uy]], rgba(T.ink, 0.85), 3);
        for (const r of [GE.R, r1]) line(c, [[GE.cx + r * ux - 10 * uy, GE.cy + r * uy + 10 * ux], [GE.cx + r * ux + 10 * uy, GE.cy + r * uy - 10 * ux]], rgba(T.ink, 0.85), 3);
        tag(stage, '약 20,200 km', 382, 640, {align: 'right', size: 32, role: 'display', plate: false, a: fadeIn(t, P.alt + 0.5, 0.35)});
      });
    });
    // ledger
    const r1 = fadeIn(t, P.r45, 0.35), r2 = fadeIn(t, P.r7, 0.35), r3 = fadeIn(t, P.r38, 0.35);
    if (r1 > 0) withAlpha(c, r1, () => {
      panel(c, T, 160, 1140, 760, 192, 0.9);
      stage.text('위성 시계 · 하루에', 900, 1162, {size: 24, weight: 700, color: T.muted, align: 'right'});
      stage.text('+45 μs', 190, 1180, {role: 'display', size: 38, weight: 700, color: PAL.gold});
      stage.text('중력이 약해서 빨리', 380, 1182, {size: 28, weight: 700, color: T.ink});
      withAlpha(c, r2, () => { stage.text('−7 μs', 190, 1236, {role: 'display', size: 38, weight: 700, color: PAL.cool}); stage.text('빠르게 움직여서 늦게', 380, 1238, {size: 28, weight: 700, color: T.ink}); });
      withAlpha(c, r3, () => { line(c, [[180, 1266], [900, 1266]], rgba(T.ink, 0.4), 2); stage.text(`= +${GPS_NET_US} μs`, 190, 1300, {role: 'display', size: 38, weight: 700, color: PAL.gold}); stage.text('하루에 앞서 감', 380, 1302, {size: 28, weight: 700, color: PAL.gold}); });
    });
    // the map: correction switched off → the computed position slides away (≈ 11 km a day)
    if (mapA > 0) withAlpha(c, mapA, () => {
      panel(c, T, 160, 470, 760, 640, 0.95);
      const off = fadeIn(t, P.off, 0.25), days = P.days(t), km = GPS_KM_DAY * days;
      stage.text('상대성 보정', 188, 512, {size: 28, weight: 700, color: T.ink});
      rect(c, 355, 494, 96, 36, 18, off < 0.5 ? rgba(PAL.good, 0.9) : rgba(PAL.bad, 0.9));
      circle(c, lerp(437, 369, off), 512, 14, '#F4F1EA');
      stage.text(off < 0.5 ? '켬' : '끔', 475, 512, {role: 'display', size: 30, weight: 700, color: off < 0.5 ? PAL.good : PAL.bad});
      stage.text(`경과 ${fmt(days, 2)}일`, 900, 512, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'right'});
      clipRect(c, 180, 548, 720, 470, 8, () => {
        rect(c, 180, 548, 720, 470, 0, '#0C2230');
        for (let i = -2; i < 16; i++) { line(c, [[180 + i * 62, 548], [180 + i * 62 + 60, 1020]], rgba('#6E8C99', 0.22), i % 4 === 0 ? 5 : 2); }
        for (let j = 0; j < 9; j++) line(c, [[180, 570 + j * 58], [900, 560 + j * 58]], rgba('#6E8C99', 0.22), j % 3 === 1 ? 5 : 2);
        const rv = []; for (let x = 180; x <= 900; x += 10) rv.push([x, 690 + 70 * Math.sin((x - 180) / 140) + 0.12 * (x - 180)]);
        line(c, rv, rgba('#3E86B4', 0.75), 14);
        const X0 = 330, Y0 = 860, pxk = 36, gx = X0 + pxk * km, gy = Y0 - 0.12 * pxk * km;
        if (km > 0.05) { line(c, [[X0, Y0 + 26], [gx, gy + 26]], rgba(PAL.gold, 0.9), 3, {dash: [8, 6]}); }
        pin(c, X0, Y0, PAL.good); pin(c, gx, gy, PAL.gold, fadeIn(t, P.off, 0.3));
        line(c, [[700, 995], [700 + 5 * pxk, 995]], rgba(T.ink, 0.8), 3); line(c, [[700, 987], [700, 1003]], rgba(T.ink, 0.8), 3); line(c, [[700 + 5 * pxk, 987], [700 + 5 * pxk, 1003]], rgba(T.ink, 0.8), 3);
        stage.text('5 km', 700 + 2.5 * pxk, 970, {size: 24, weight: 700, color: T.ink, align: 'center'});
        tag(stage, '실제 위치', X0, Y0 + 30, {size: 26, color: PAL.good});
        if (off > 0) tag(stage, 'GPS가 계산한 위치', gx, gy - 88, {size: 26, color: PAL.gold, a: off});
        if (km > 0.3) tag(stage, `${fmt(km, 1)} km`, (X0 + gx) / 2, (Y0 + gy) / 2 + 80, {size: 30, color: PAL.gold, role: 'display'});
      });
      tag(stage, `${GPS_NET_US} μs × 빛의 속도 ≈ ${Math.round(GPS_KM_DAY)} km`, 540, 1066, {size: 28, color: T.ink, a: fadeIn(t, P.km10, 0.35), plate: false});
    });
  });
}

// ------------------------------------------------------------------ clocks: 2010 · NIST (33 cm, two optical clocks) → 2022 · JILA (1 mm atom cloud) + the height chart
const CLOUD = (() => { const out = []; let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; while (out.length < 520) { const u = r() * 2 - 1, v = r() * 2 - 1; if (u * u + v * v > 1) continue; out.push([540 + 235 * u, 600 + 80 * v, r()]); } return out; })();
const CH = {x0: 262, x1: 905, y0: 1262, y1: 915, l0: -3, l1: 7.5, e0: -15, e1: -4};
const chX = h => lerp(CH.x0, CH.x1, (Math.log10(h) - CH.l0) / (CH.l1 - CH.l0)), chY = d => lerp(CH.y0, CH.y1, (Math.log10(d) - CH.e0) / (CH.e1 - CH.e0));
function heightChart(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, 150, 855, 780, 478, 0.9);
  stage.text('하루에 앞서는 시간 (계산)', 172, 884, {size: 24, weight: 700, color: T.muted});
  stage.text('로그 눈금', 908, 884, {size: 24, weight: 700, color: T.muted, align: 'right'});
  line(c, [[CH.x0, CH.y1 - 10], [CH.x0, CH.y0], [CH.x1 + 10, CH.y0]], rgba(T.ink, 0.6), 2);
  for (const e of [-15, -12, -9, -6]) { const y = chY(10 ** e); line(c, [[CH.x0, y], [CH.x1, y]], rgba(T.border, 0.8), 1); tx(stage, `10^{−${-e}}초`, CH.x0 - 10, y, {size: 26, weight: 700, color: T.muted, align: 'right'}); }
  for (const [h, s] of [[1e-3, '1 mm'], [1, '1 m'], [1e3, '1 km'], [1e6, '1,000 km']]) { const x = chX(h); line(c, [[x, CH.y0], [x, CH.y0 + 8]], rgba(T.ink, 0.6), 2); stage.text(s, x, CH.y0 + 30, {size: 24, weight: 700, color: T.muted, align: 'center'}); }
  const dq = smooth((t - P.chart0) / 1.2), pts = [];
  for (let l = CH.l0; l <= CH.l0 + (CH.l1 - CH.l0) * dq; l += 0.05) { const h = 10 ** l; pts.push([chX(h), chY(ratePot(h) * DAY)]); }
  if (pts.length > 1) line(c, pts, rgba(PAL.gold, 0.75), 3);
  const shown = {harvard: P.chart0 + 0.8, everest: P.chart0 + 1.0, gps: P.chart0 + 1.2, nist: P.meas15, jila: P.found};
  const lab = {jila: [26, 14, 'left'], nist: [14, 36, 'left'], harvard: [14, 36, 'left'], everest: [14, 36, 'left'], gps: [0, 40, 'right']};
  for (const p of CHART) {
    const a = fadeIn(t, shown[p.id], 0.35); if (a <= 0) continue;
    const x = chX(p.h), y = chY(p.day), hot = (p.id === 'nist' || p.id === 'jila') ? Math.max(0, 1 - (t - shown[p.id]) / 1.2) : 0;
    withAlpha(c, a, () => { glow(c, x, y, 36 + 30 * hot, PAL.gold, 0.4 + 0.4 * hot); circle(c, x, y, 8, PAL.hot); });
    const [dx, dy, al] = lab[p.id];
    tag(stage, `${p.name} · ${p.hs}`, x + dx, y + dy, {align: al, size: 24, a, plate: false, color: (p.id === 'nist' || p.id === 'jila') ? PAL.gold : T.ink});
  }
  // readout of the latest point
  const rd = [[P.chart0 + 1.2, 'gps'], [P.meas15, 'nist'], [P.found, 'jila']]; let k = 0; for (let i = 0; i < rd.length; i++) if (t >= rd[i][0]) k = i;
  const p = CHART.find(q => q.id === rd[k][1]), ra = fadeIn(t, rd[k][0], 0.35);
  tx(stage, `${p.name} ${p.hs}: 하루 ${sciStr(p.day, 1)}초`, 280, 940, {size: 26, weight: 700, color: T.ink, alpha: ra});
}
function clocksScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), a15 = fadeOut(t, P.card16 - 0.1, 0.4), a16 = fadeIn(t, P.card16 + 0.2, 0.45);
  withAlpha(c, sf, () => {
    if (a15 > 0) withAlpha(c, a15, () => {
      stage.text('2010 · NIST', 540, 392, {role: 'display', size: 44, weight: 700, color: PAL.gold, align: 'center', alpha: fadeIn(t, P.card15, 0.4)});
      const rise = 150 * easeInOut((t - P.rise[0]) / (P.rise[1] - P.rise[0])), yT = 700;
      line(c, [[190, yT + 4], [890, yT + 4]], rgba(PAL.metal, 0.7), 6);
      const box = (x, yb, col, lab) => {
        rect(c, x, yb - 120, 180, 120, 10, '#0E2532', rgba(col, 0.9), 2.5);
        const fl = 0.75 + 0.25 * Math.sin(t * 9 + x);
        line(c, [[x + 14, yb - 60], [x + 166, yb - 60]], rgba(col, 0.55), 3); glow(c, x + 90, yb - 60, 40, col, 0.5 * fl); circle(c, x + 90, yb - 60, 6, '#FFFFFF');
        stage.text(lab, x + 90, yb - 96, {size: 24, weight: 700, color: col, align: 'center'});
      };
      box(200, yT, PAL.slow, '아래 원자시계');
      if (rise > 1) { const yb = yT - rise; rect(c, 640, yb, 180, rise, 0, rgba('#203A46', 0.9), rgba(PAL.metal, 0.6), 1.5); for (let y = yb + 12; y < yT - 6; y += 24) line(c, [[650, y], [810, y + 12]], rgba(PAL.metal, 0.35), 2); }
      box(640, yT - rise, PAL.gold, '위 원자시계');
      if (rise > 10) withAlpha(c, clamp(rise / 60), () => { bracketV(c, 846, yT - rise, yT, rgba(T.ink, 0.85), 3, 10, 1); tag(stage, '33 cm', 860, yT - rise / 2, {align: 'left', size: 28, role: 'display', plate: false}); });
      // the light of the two clocks compared: the upper one's waves creep ahead (×10¹⁵)
      const qb = fadeIn(t, P.beat0, 0.4);
      if (qb > 0) withAlpha(c, qb, () => {
        const f = 2.5, dN = EXAG * NIST_RATE, tt = Math.max(0, t - P.beat0);
        for (const [y, col, ph] of [[742, PAL.gold, f * tt * (1 + dN)], [786, PAL.slow, f * tt]]) {
          const pts = []; for (let x = 230; x <= 900; x += 3) pts.push([x, y + 13 * Math.sin(TAU * ((x - 230) / 90 - ph))]); line(c, pts, col, 3);
        }
        stage.text('위', 175, 742, {size: 26, weight: 700, color: PAL.gold}); stage.text('아래', 175, 786, {size: 26, weight: 700, color: PAL.slow});
        tx(stage, `위 시계가 1초마다 ${sciStr(NIST_RATE, 1)}초 빠름 · 물결은 과장 ×10^{15}`, 540, 830, {size: 24, weight: 700, color: T.ink, align: 'center'});
      });
    });
    if (a16 > 0) withAlpha(c, a16, () => {
      stage.text('2022 · JILA', 540, 392, {role: 'display', size: 44, weight: 700, color: PAL.gold, align: 'center'});
      for (let y = 470; y <= 730; y += 13) line(c, [[250, y], [830, y]], rgba('#E85A5A', 0.08), 2);
      const qa = fadeIn(t, P.cloud, 0.4), qc = fadeIn(t, P.tb16, 0.5);
      glow(c, 540, 600, 300, '#9FD0FF', 0.08 + 0.08 * qa);
      for (const [x, y, r] of CLOUD) { const u = clamp((680 - y) / 160), col = mix('#E7F2F8', mix('#FF8A5A', '#7FB2FF', u), qc); circle(c, x + 1.5 * Math.sin(t * 2 + r * 20), y, 2.6 + 1.4 * r, rgba(col, 0.55 + 0.4 * qa)); }
      const qm = fadeIn(t, P.mm1, 0.35);
      if (qm > 0) withAlpha(c, qm, () => { bracketV(c, 800, 520, 680, rgba(T.ink, 0.85), 3, 10, 1); tag(stage, '1 mm', 814, 600, {align: 'left', size: 30, role: 'display', plate: false}); });
      tag(stage, '원자 구름 · 약 10만 개', 540, 470, {size: 26, color: T.ink, a: qa, plate: false});
      withAlpha(c, qc, () => {
        stage.text('위', 230, 535, {size: 26, weight: 700, color: '#9CC4FF', align: 'center'}); stage.text('아래', 230, 665, {size: 26, weight: 700, color: '#FF9C74', align: 'center'});
        tx(stage, `위아래 진동수 차이 ${sciStr(JILA_RATE, 1)}`, 540, 760, {size: 28, weight: 700, color: T.ink, align: 'center'});
        tx(stage, '색 차이는 과장 ×10^{18}', 540, 806, {size: 24, weight: 700, color: T.muted, align: 'center'});
      });
    });
    heightChart(stage, t, P);
  });
}

// ------------------------------------------------------------------ extreme: a clock creeping toward a black hole ticks ever slower as seen from far (√(1 − r_s/r))
const BHC = {x: 540, y: 790, rs: 108, ang: -0.96};
function extremeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    for (let i = 0; i < 90; i++) circle(c, 150 + rand(i * 2.3) * 780, 340 + rand(i * 5.1) * 1000, 1 + 1.4 * rand(i * 9.7), rgba('#DDEBF2', 0.15 + 0.4 * rand(i * 3.3)));
    glow(c, BHC.x, BHC.y, 420, '#FF8A3D', 0.1);
    for (let k = 0; k < 3; k++) ring(c, BHC.x, BHC.y, BHC.rs * (1.45 + 0.08 * k), rgba('#FFB066', 0.45 - 0.12 * k), 8 - 2 * k);
    glow(c, BHC.x, BHC.y, BHC.rs * 1.9, '#FFC27A', 0.18);
    circle(c, BHC.x, BHC.y, BHC.rs, '#000000'); ring(c, BHC.x, BHC.y, BHC.rs, rgba('#FF9E57', 0.5), 2);
    tag(stage, '블랙홀', BHC.x, BHC.y + BHC.rs * 1.75 + 20, {size: 34, role: 'display', a: fadeIn(t, P.bhLabel, 0.35), plate: false});
    tag(stage, '사건의 지평선 (r_s)', 300, 1030, {size: 26, color: T.muted, a: fadeIn(t, P.bhLabel + 0.4, 0.35), plate: false});
    withAlpha(c, fadeIn(t, P.bhLabel + 0.4, 0.35), () => line(c, [[330, 1008], [BHC.x - BHC.rs * 0.75, BHC.y + BHC.rs * 0.66]], rgba(T.muted, 0.7), 2));
    tag(stage, '모형 · 멀리서 본 모습', 540, 390, {size: 24, color: T.muted, plate: false});
    // the far clock and the approaching clock
    dial(c, 250, 470, 52, 36000 + (t - ctx.scene.start), {col: PAL.gold, glowA: 0.22, step: BH_STEP, flash: lastPulse(P.bhFar, t, 0.3) * 0.6});
    tag(stage, '멀리 있는 시계', 250, 552, {size: 24, plate: false, a: fadeIn(t, P.far, 0.35), color: PAL.gold});
    const r = P.bhR(t), rate = bhRate(r), ux = Math.cos(BHC.ang), uy = Math.sin(BHC.ang), cx = BHC.x + ux * r * BHC.rs, cy = BHC.y + uy * r * BHC.rs;
    const col = mix('#C2321E', PAL.gold, rate);
    dial(c, cx, cy, 44, 36000 + P.bhTau(t), {col, glowA: 0.3 * rate, a: 0.5 + 0.5 * rate, hand: col, step: BH_STEP, flash: lastPulse(P.bhTicks, t, 0.4) * rate});
    tag(stage, '다가가는 시계', cx + 58, cy - 52, {align: 'left', size: 24, plate: false, a: fadeOut(t, P.in0 + 1.5, 0.4), color: T.ink});
    tag(stage, '거의 멈춘 듯', cx - 62, cy - 48, {align: 'right', size: 30, role: 'display', color: PAL.gold, a: fadeIn(t, P.stop17, 0.35), plate: false});
    // the rate meter
    panel(c, T, 150, 1150, 780, 175, 0.88);
    stage.text('멀리서 본 그 시계의 빠르기', 175, 1182, {size: 26, weight: 700, color: T.muted});
    stage.text(`${fmt(rate, 2)}배`, 905, 1184, {role: 'display', size: 40, weight: 700, color: col, align: 'right'});
    rect(c, 175, 1222, 730, 24, 6, rgba('#000000', 0.35), rgba(T.border, 1), 1.5); rect(c, 175, 1222, 730 * rate, 24, 6, col);
    for (const [v, s, al] of [[0, '0 (멈춤)', 'left'], [0.5, '0.5', 'center'], [1, '1 (멀리 있는 시계)', 'right']]) stage.text(s, 175 + 730 * v, 1282, {size: 24, weight: 700, color: T.muted, align: al});
  });
}

// ------------------------------------------------------------------ myth: each one's own clock: 1 s per 1 s; the difference shows only side by side
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), S = ctx.scene.start, own = 36000 + (t - S);
  withAlpha(c, sf, () => {
    const he = fadeIn(t, P.each, 0.35), q = fadeIn(t, P.cmp19, 0.45);
    // top: far / high
    panel(c, T, 150, 340, 780, 432, 0.82);
    stage.text('멀리 있는 사람 · 높은 곳', 175, 374, {size: 26, weight: 700, color: T.ink});
    person(c, 250, 740, 300);
    dial(c, 470, 555, 60, own, {col: PAL.gold, glowA: 0.2 + 0.2 * he, flash: lastPulse(P.mythOwn, t, 0.35)});
    stage.text('내 시계', 470, 648, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text('1초에 1초', 470, 690, {role: 'display', size: 30, weight: 700, color: mix(T.ink, PAL.gold, he), align: 'center'});
    // bottom: near the black hole (r = 2 r_s)
    panel(c, T, 150, 800, 780, 525, 0.82);
    clipRect(c, 151, 801, 778, 523, 12, () => { glow(c, 540, 1920, 860, '#FF8A3D', 0.26); ring(c, 540, 1920, 664, rgba('#FFB066', 0.55), 10); circle(c, 540, 1920, 650, '#000000'); });
    stage.text('블랙홀 가까이 (r = 2 r_s)', 175, 834, {size: 26, weight: 700, color: T.ink});
    person(c, 250, 1200, 300);
    dial(c, 470, 1010, 60, own, {col: PAL.slow, glowA: 0.2 + 0.2 * he, flash: lastPulse(P.mythOwn, t, 0.35)});
    stage.text('내 시계', 470, 1103, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text('1초에 1초', 470, 1145, {role: 'display', size: 30, weight: 700, color: mix(T.ink, PAL.slow, he), align: 'center'});
    const qq = fadeIn(t, P.q18, 0.35), no = fadeIn(t, P.no, 0.3);
    if (qq > 0) { const [x0, w] = tag(stage, '느려진 것을 느낄까?', 760, 960, {size: 30, role: 'display', a: qq * (1 - 0.45 * no), plate: false}); strike(c, x0, x0 + w, 960, clamp((t - P.no) / 0.35), PAL.bad, 4); }
    tag(stage, '아니다 · 느끼지 못함', 760, 1030, {size: 30, role: 'display', color: PAL.gold, a: no, plate: false});
    tag(stage, '각자의 시간으로 본 화면', 905, 374, {align: 'right', size: 24, color: T.muted, a: he, plate: false});
    // side by side: the lower clock's ticks sent up by light, compared next to the upper clock
    if (q > 0) withAlpha(c, q, () => {
      line(c, [[530, 1010], [700, 1010], [760, 640]], rgba(PAL.slow, 0.35), 2, {dash: [6, 8]});
      for (const ta of P.mythLow) { const u = (t - (ta - 0.9)) / 0.9; if (u < 0 || u > 1) continue; const L1 = 170, L2 = Math.hypot(60, 370), s_ = u * (L1 + L2), [px, py] = s_ < L1 ? [530 + s_, 1010] : [700 + 60 * (s_ - L1) / L2, 1010 - 370 * (s_ - L1) / L2]; glow(c, px, py, 22, PAL.light, 0.6); circle(c, px, py, 5, PAL.light); }
      dial(c, 760, 555, 60, 36000 + (P.cmp19 - S) + (t - P.cmp19) * MYTH_RATE, {col: PAL.slow, glowA: 0.2, flash: lastPulse(P.mythLow, t, 0.35)});
      stage.text('아래 시계를 나란히', 760, 648, {size: 24, weight: 700, color: T.muted, align: 'center'});
      stage.text(`${fmt(MYTH_RATE, 2)}배로 느림`, 760, 690, {role: 'display', size: 30, weight: 700, color: PAL.slow, align: 'center', alpha: fadeIn(t, P.reveal, 0.35)});
    });
  });
}

// ------------------------------------------------------------------ close: the poster returns on "중력이" and holds; its clocks run into the thumbnail state
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), fin = fadeIn(t, ctx.scene.start + 0.05, 0.55);
  const fl = {head: lastPulse(P.closeHead, t), foot: lastPulse(P.closeFoot, t)};
  posterPicture(stage, P.posterM(t), fin, POSTER_FIG, {flash: fl});
  captionShade(c, fin);
  posterTitle(stage, t, 0, fin);
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Clock seconds → short low ticks at the moment each clock's second hand jumps. Lower / slower clock 110–147 Hz,
//    upper / faster clock 165–220 Hz. Under the ×10¹⁵ exaggeration the two rhythms drift apart audibly.
//  - Light pulses in the rocket: sent 110 Hz, received 165 Hz; the ceiling's own second 220 Hz (s09).
//  - Received frequency (tower, black hole, myth): pitch scales with the frequency ratio the model gives
//    (tower: 196 Hz/(1 + ε u) at the wave front; black hole: 196 Hz × √(1 − r_s/r); myth: 165 Hz × 0.71).
//  - Lifetime difference → pitch 98·2^(Δ/1 μs) Hz (1 μs = one octave). GPS drift → whoosh while the marker slides.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [], sc = id => tl.scene(id);
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.08, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -33}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, times, means, gain = -31, f = 58) => { const T0 = [].concat(times); ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => [{kind: 'tone', offset: r(tt - T0[0], 4), params: {freq: f, dur: 0.45, harmonics: [1, 0.35], attack: 0.004, decay: 0.15, release: 0.15, gain_db: 0}}, {kind: 'noise', offset: r(tt - T0[0], 4), params: {dur: 0.2, low: 40, high: 220, release: 0.15, gain_db: -10}}])}, means}); };
  const between = (times, a, b) => times.filter(x => x >= a && x <= b);

  // ---- hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 서 있는 사람, 머리 시계와 발 시계, 제목', {dur: 1.8, gain: -35});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  ticks('hook_foot', P.hookFoot, 147, -38, `발 시계(낮은 곳)의 초침이 넘어갈 때마다 낮은 틱 147 Hz (${P.hookFoot.length}번, 1초 간격)`, {decay: 0.06});
  ticks('hook_head', P.hookHead, 196, -38, `머리 시계(높은 곳)의 초침 틱 196 Hz (${P.hookHead.length}번): 과장 ×10¹⁵로 ${fmt(1 / (1 + D_HEAD), 3)}초 간격 → 두 박자가 점점 어긋났다 다시 맞음`, {decay: 0.06});
  tick('tag_high', P.high, 196, -35, '"높은 곳 · 머리" 표시');
  tick('tag_low', P.low, 147, -35, '"낮은 곳 · 발" 표시');
  tick('lead_tile', P.lead, 131, -34, '"두 시계의 차이 · 과장 ×10¹⁵" 계기');
  tick('height', P.headTag, 110, -35, '"1.7 m" 높이 괄호');
  const yrsT = k => { let lo = P.lifeRun[0], hi = P.lifeRun[1]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (LIFE_Y * easeInOut((m - P.lifeRun[0]) / (P.lifeRun[1] - P.lifeRun[0])) < 10 * k) lo = m; else hi = m; } return (lo + hi) / 2; };
  chirp('life', P.lifeRun[0] - 0.1, P.today - 0.2, tt => 98 * 2 ** (LIFE_US * easeInOut((tt - P.lifeRun[0]) / (P.lifeRun[1] - P.lifeRun[0]))), () => 0.3, -37,
    `평생 쌓이는 실제 차이 Δ → 음높이 98·2^(Δ/1 μs) Hz: 0 → ${fmt(LIFE_US, 2)} μs에서 ${(98 * 2 ** LIFE_US).toFixed(0)} Hz (1 μs면 한 옥타브 위 196 Hz)`, {h: [1, 0.4], fi: 0.3, fo: 0.5});
  ticks('decades', [1, 2, 3, 4, 5, 6, 7, 8].map(yrsT), 123, -37, '나이 계기가 10년씩 넘어갈 때마다 작은 틱 (8번, 80년까지)', {decay: 0.05});
  tick('million', P.million, 196, -35, '"100만분의 1초 (1 μs)" 눈금이 밝아짐 (위 음높이 대응의 한 옥타브)', {decay: 0.12});
  swell('today', P.today, [147, 220], '"오늘날의 원자시계로 잴 수 있는 크기"', {dur: 1.4, gain: -34});
  // ---- origin
  tick('hanja', P.hanja + 0.1, 147, -33, '"重 + 力" 글자', {decay: 0.14});
  tick('heavy', P.heavy, 131, -34, '重 "무거울 중" 밝아짐'); tick('force', P.force, 165, -34, '力 "힘 력" 밝아짐');
  tick('gravity', P.gravity, 147, -34, '"gravity"'); tick('latin', P.latin, 110, -34, '"← gravitas" (라틴어)');
  swell('heaviness', P.heaviness, [110, 165], '"라틴어 · 무거움 (gravis = 무거운)"', {dur: 1.4});
  thump('drops', P.drops.map(x => x + DROP_T), `떨어진 공이 바닥에 닿음 (${P.drops.length}번, 3.2 m를 실제 g로 ${fmt(DROP_T, 2)}초)`, -32, 62);
  // ---- einstein
  tick('card1907', P.card5, 147, -33, '"1907 · Einstein"', {decay: 0.14});
  whoosh('fall', P.release, 1.6, 170, 80, '상자가 자유 낙하를 시작 (옆 건물이 위로 미끄러짐)', -34);
  chirp('scale_zero', P.release - 0.05, P.release + 0.45, tt => 73 + 74 * (1 - smooth((tt - P.release) / 0.18)), () => 0.4, -35, '저울 눈금 60 kg → 0 kg: 음높이 147 → 73 Hz (눈금에 비례)', {fi: 0.03, fo: 0.15, dt: 0.02});
  swell('feel', P.feel, [110, 165], '"무게를 느끼지 못함"', {dur: 1.4});
  tick('clue', P.clue, 131, -34, '"내 생애 가장 행복한 생각"');
  tick('two_boxes', P.two + 0.2, 110, -34, '지구 위의 상자와 로켓 안의 상자가 나란히');
  swell('rocket_up', P.up6, [82, 123], '로켓이 위로 1 g로 가속 (설명용 낮은 음, 엔진 소리 아님)', {dur: 1.5, gain: -35});
  thump('apples', P.apples.map(x => x + APPLE_T), `두 상자에서 사과가 같은 순간 바닥에 닿음 (${P.apples.length}번; 한 소리 = 같은 시각)`, -33, 70);
  swell('same', P.eq, [131, 196, 262], '"=" · "구별할 수 없음"', {dur: 1.8, gain: -32});
  // ---- rocket
  const R0 = sc('rocket').start, R1 = sc('rocket').end;
  chirp('knob', P.ign[0] - 0.05, P.ign[1] + 0.8, tt => 82 + 41 * P.acc(tt) / G_SURF, () => 0.3, -37, '가속도 손잡이 a: 0 → 1 g, 음높이 82 → 123 Hz (a에 비례)', {fi: 0.15, fo: 0.4});
  ticks('pulse_send', P.rkSend, 110, -37, `바닥 시계가 1초를 셀 때마다 빛 신호를 보냄: 낮은 틱 110 Hz (${P.rkSend.length}번). 화면은 천장 시계의 시간 → 가속 뒤 간격 1.000 → ${fmt(1 + D_ROCKET, 3)}초`, {decay: 0.07});
  ticks('pulse_recv', P.rkRecv, 165, -36, `천장이 신호를 받을 때마다 틱 165 Hz (${P.rkRecv.length}번): 받은 간격 1.000초 → ${fmt(1 + D_ROCKET, 3)}초 (과장 ×10¹⁵)`, {decay: 0.08});
  ticks('ceil_own', P.rkCeil, 220, -40, `위에서 볼 때(s09): 천장 자기 시계의 1초 틱 220 Hz (${P.rkCeil.length}번) — 받은 틱(${fmt(1 + D_ROCKET, 3)}초 간격)과 점점 어긋남`, {decay: 0.05});
  chirp('ceiling_speed', P.hl.emit, P.hl.recv + 0.25, tt => 82 + 60 * P.speed(Math.min(tt, P.hl.recv)) / (P.speed(P.hl.recv) * 1.1), () => 0.28, -38, '노란 신호가 올라가는 동안 천장의 속도(바깥 기준 막대) → 음높이: 보낼 때보다 받을 때 높음', {fi: 0.2, fo: 0.25});
  tick('away', P.hl.recv, 196, -34, '"더 빨라져 달아남": 노란 신호가 천장에 닿음', {decay: 0.12});
  tick('sec_top', P.cmp0 + 1, 220, -34, '"천장의 1초" 막대가 끝남', {decay: 0.1});
  tick('sec_bottom', P.cmp0 + 1 + D_ROCKET, 110, -34, `"바닥의 1초" 막대가 ${fmt(D_ROCKET, 2)}초 늦게 끝남`, {decay: 0.1});
  tick('slow9', P.slow9, 110, -35, '"아래 시계가 느리게 감"');
  whoosh('to_earth', P.eqv[0], P.eqv[1] - P.eqv[0], 150, 80, '로켓 바깥이 지구로 바뀜 (같은 1 g)', -35);
  thump('landed', P.eqv[1], '지구 위에 섬', -33, 55);
  swell('lower10', P.lower10, [98, 147], '"아래쪽일수록 느리게"', {dur: 1.5});
  // ---- tower
  tick('card1959', P.card11, 147, -33, '"1959 · Harvard"', {decay: 0.14});
  tick('h225', P.h225 + 0.8, 131, -34, '"22.5 m" 높이 괄호가 다 그려짐');
  tick('src_det', P.tb, 165, -34, '아래 감마선원과 위 검출기');
  const tTop = (() => { let tt = P.gam; while (towerFront(P, tt) < 1 && tt < P.gam + 10) tt += 0.01; return tt; })();
  chirp('gamma', P.gam, tTop + 1.6, tt => 196 / (1 + EPS_T * towerFront(P, tt)), () => 0.32, -35, `감마선 물결의 앞머리 높이에서 잰 진동수 → 음높이 196/(1 + ε·u) Hz: 위에 닿으면 ${(196 / (1 + EPS_T)).toFixed(0)} Hz (과장 ×10¹⁴, 실제 비 1 − 2.5×10⁻¹⁵)`, {h: [1, 0.3], fi: 0.15, fo: 0.4});
  tick('cmp11', P.cmp11, 131, -34, '"물결 간격" 비교 막대');
  swell('first', P.first, [110, 165, 220], '"처음 확인 · 예측과 10% 안에서 일치"', {dur: 1.6});
  // ---- gps
  whoosh('orbit', P.orb0, 1.0, 90, 150, '궤도가 그려짐', -35);
  tick('gps_label', P.gpsLabel, 165, -34, '"GPS 위성"');
  tick('alt', P.alt + 0.8, 131, -34, '"약 20,200 km" 높이 괄호');
  tick('row45', P.r45, 196, -33, '"+45 μs 중력이 약해서 빨리"', {decay: 0.12});
  whoosh('speed_arrow', P.moving, 0.7, 110, 170, '위성의 속도 화살표', -36);
  tick('row7', P.r7, 131, -33, '"−7 μs 빠르게 움직여서 늦게"', {decay: 0.12});
  swell('row38', P.r38, [131, 196], `"= +${GPS_NET_US} μs 하루에 앞서 감"`, {dur: 1.5});
  tick('map', P.mapIn + 0.2, 110, -35, '지도 카드');
  thump('off', P.off + 0.1, '"상대성 보정" 스위치를 끔', -32, 70);
  whoosh('drift', P.drift[0], P.drift[1] - P.drift[0], 90, 180, `GPS가 계산한 위치가 밀려남: 하루에 약 ${fmt(GPS_KM_DAY, 1)} km (경과 0 → 1일, 시간 압축)`, -35);
  swell('km11', P.drift[1], [110, 165], `"${GPS_NET_US} μs × 빛의 속도 ≈ ${Math.round(GPS_KM_DAY)} km"에 도달`, {dur: 1.4});
  // ---- clocks
  whoosh('chart', P.chart0, 1.2, 80, 130, '높이–시간 그래프의 곡선이 그려짐 (계산값)', -38);
  tick('card2010', P.card15, 147, -33, '"2010 · NIST"', {decay: 0.14});
  chirp('rise', P.rise[0], P.rise[1] + 0.2, tt => 98 + 33 * easeInOut((tt - P.rise[0]) / (P.rise[1] - P.rise[0])), () => 0.28, -38, '위 원자시계를 33 cm 올림: 높이 → 음높이 98 → 131 Hz', {fi: 0.1, fo: 0.25});
  {
    const t0 = P.beat0 + 0.2, dur = P.meas15 + 0.6 - t0, dN = EXAG * NIST_RATE;
    ev.push({id: 'beat', at: r(t0, 4), kind: 'custom', params: {gain_db: -40, layers: [196, 196 * (1 + dN)].map(f => ({kind: 'tone', offset: 0, params: {freq: r(f, 2), dur: r(dur), harmonics: [1], attack: 0.3, decay: 0.3, sustain: 1, release: 0.5, gain_db: 0}}))},
      means: `두 원자시계 빛의 진동 비교: 196 Hz와 ${(196 * (1 + dN)).toFixed(1)} Hz (위 시계, 과장 ×10¹⁵) → 초당 ${(196 * dN).toFixed(1)}번의 맥놀이 (화면 물결이 어긋나는 것과 같은 비)`});
  }
  tick('nist_pt', P.meas15, 196, -33, '그래프에 "NIST · 33 cm" 점이 켜짐', {decay: 0.12});
  tick('card2022', P.card16, 147, -33, '"2022 · JILA"', {decay: 0.14});
  tick('mm1', P.mm1, 131, -34, '"1 mm" 괄호');
  swell('cloud', P.cloud, [110, 165], '원자 구름 (약 10만 개)', {dur: 1.4, gain: -35});
  swell('colors', P.tb16, [131, 175], '구름의 위아래 색 차이가 드러남 (과장)', {dur: 1.4, gain: -35});
  tick('jila_pt', P.found, 196, -33, '그래프에 "JILA · 1 mm" 점이 켜짐', {decay: 0.12});
  // ---- extreme
  swell('blackhole', sc('extreme').start + 0.15, [55, 82], '블랙홀', {dur: 1.8, gain: -34});
  const bt = P.bhTicks.map(tt => ({tt, rate: bhRate(P.bhR(tt))}));
  ticks('bh_far', P.bhFar, 147, -41, `멀리 있는 시계의 0.5초 틱 147 Hz (${P.bhFar.length}번): 기준 박자`, {decay: 0.05});
  ticks('bh_clock', bt.map(b => b.tt), bt.map(b => r(Math.max(40, 196 * b.rate), 1)), -35, `다가가는 시계의 0.5초 틱(멀리서 본 시각): 간격이 0.5/√(1 − r_s/r)초로 늘어나고 음높이 196·√(1 − r_s/r) Hz로 낮아지다 (${bt.map(b => b.rate.toFixed(2)).join(' · ')}) 끊김`, {decay: 0.12, gains: bt.map(b => r(20 * Math.log10(Math.max(0.25, b.rate)), 1))});
  // ---- myth
  ticks('own', P.mythOwn.filter(x => x < P.cmp19), 165, -38, `두 사람 각자의 시계: 1초에 1초 (같은 틱 165 Hz, ${P.mythOwn.filter(x => x < P.cmp19).length}번)`, {decay: 0.06});
  tick('q18', P.q18, 131, -34, '"느려진 것을 느낄까?"');
  thump('no', P.no + 0.15, '"아니다" — 질문에 줄', -33, 70);
  swell('each', P.each, [131, 196], '"각자의 시간으로 본 화면" · "1초에 1초"', {dur: 1.5});
  ticks('own_top', P.mythOwn.filter(x => x >= P.cmp19), 165, -38, '위 사람의 자기 시계 1초 틱 165 Hz', {decay: 0.06});
  ticks('low_seen', P.mythLow, r(165 * MYTH_RATE, 1), -36, `빛으로 받아 나란히 놓은 아래 시계의 틱: ${fmt(1 / MYTH_RATE, 2)}초 간격, 음높이도 ${fmt(MYTH_RATE, 2)}배 (${(165 * MYTH_RATE).toFixed(0)} Hz)`, {decay: 0.08});
  swell('reveal', P.reveal, [117, 175], `"${fmt(MYTH_RATE, 2)}배로 느림" — 비교할 때에만 드러남`, {dur: 1.5});
  // ---- close
  swell('poster_back', P.reason - 0.25, [110, 165, 220], '"중력이 강한 곳일수록" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -33});
  ticks('close_foot', P.closeFoot, 147, -38, '포스터의 발 시계 틱 147 Hz', {decay: 0.06});
  ticks('close_head', P.closeHead, 196, -38, '포스터의 머리 시계 틱 196 Hz (과장 ×10¹⁵: 끝 화면에서 썸네일과 같은 상태로 앞섬)', {decay: 0.06});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands end ≤ 360 Hz and whoosh bands
 * ≤ 520 Hz (band-pass skirts fall only 12 dB/octave); swell overtones (2f) stay below it. Events that would break this throw.
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
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/gravity-time/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(머리·발 시계, 로켓 빛 신호 표, 탑의 감마선 물결, GPS 궤도·지도, 원자시계, 블랙홀 시계의 고유 시간 표)에서 써 넣습니다. 대응: 시계 초침이 넘어감 → 낮은 틱(아래·느린 시계 110~147 Hz, 위·빠른 시계 165~220 Hz; 과장 ×10¹⁵에서 두 박자가 어긋남), 로켓 신호 보냄 110 Hz · 받음 165 Hz, 받은 진동수 → 음높이(탑 196/(1 + εu) Hz, 블랙홀 196·√(1 − r_s/r) Hz, 오해 장면 165 × 0.71 Hz), 평생 차이 → 98·2^(Δ/1 μs) Hz, GPS 위치 밀림 → 휙. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; rocket emits ${P.rk.emits.length} recvs ${P.rk.recvs.length}, hl ${P.hl.emit.toFixed(2)}→${P.hl.recv.toFixed(2)}; bh ticks ${P.bhTicks.length}; hook ticks ${P.hookFoot.length}/${P.hookHead.length}`);
  console.log(`D_HEAD ${D_HEAD.toFixed(4)} D_ROCKET ${D_ROCKET.toFixed(4)} EPS_T ${EPS_T.toFixed(4)} GPS +${GPS_GRAV_US.toFixed(1)} −${GPS_SPEED_US.toFixed(1)} km/day ${GPS_KM_DAY.toFixed(2)} life ${LIFE_US.toFixed(3)} μs`);
}
