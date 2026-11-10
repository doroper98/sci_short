// Episode scenes — "합성개구레이더(SAR)의 원리" (33)
// Shape: export {theme, scenes, overlays, background, captionLayout, plan}; scenes.<id>(stage, t, p, ctx).
//
// Visual grammar (docs/ANIMATION_QUALITY.md, 2026-11-10 "움직임이 설명하고, 빛은 조금만"; model sample samples/look-proposal-radar):
//  - ONE stage for every scene: a side view cut along the satellite's track. Orbit line on top, a flat matte cloud deck,
//    the night sea with matte ships, and under the sea a plan-view instrument strip — the radar picture — whose x axis is
//    the SAME ruler as the world's along-track axis (same origin and scale; dotted lines tie ships to their pixels).
//  - Only signals glow: sent pulses are warm (amber), echoes are cool (sky blue), recorded echoes and image pixels are the
//    instrument. Satellite, ships, clouds and droplets are matte filled bodies. Visible light (cloud scene) is pale white.
//  - Each scene is one causal chain: pulse leaves → passes the cloud → hits the sea/ships → echo returns → the instrument
//    marks it in the same frame → a number appears.
//  - Time honesty: outside the ranging scene the satellite moves 25× slower than real (7.5 km/s → 0.3 km/s of film).
//    While the light trip is slowed 1,000× (ranging) the satellite stops. Pulses are thinned (real: thousands per second).
//
// =====================================================================================================
// MODEL — one block read by the picture, the readouts and sound.json (node episodes/sar/scenes.mjs --emit-sound)
// =====================================================================================================
//  - Slant range R0 = 600 km, wavelength λ = 3 cm (X band), real antenna L = 5 m.
//    Real-aperture beam footprint on the ground = R0·λ/L = 3.6 km (설명 모형: beam width ≈ λ/L).
//    Antenna needed for 1 m with a real aperture: R0·λ/1 m = 18 km. Synthetic aperture = the footprint = 3.6 km,
//    strip-map azimuth resolution ≈ L/2 = 2.5 m (= λ·R0 / (2·3.6 km)).
//  - Round trip to 600 km: 2·600 km / 300,000 km/s = 0.004 s.
//  - Range history of a ship at along-track x_t seen from x_s: r = √(R0² + (x_s − x_t)²); extra delay
//    Δ = r − R0 ≈ u²/(2R0), at most 2.7 m at u = 1.8 km. The record panel draws Δ hugely stretched (declared).
//  - Cloud droplets ≈ 0.01 mm; 3 cm / 0.01 mm = 3,000. Visible light 0.4–0.7 µm, shorter than the droplets.
//  - Vertical axis of the stage is NOT to scale (600 km is drawn as ~610 px, ships and satellite hugely enlarged).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, glow, arrow, rect, withAlpha, TAU, rand, loadTimeline} from '../../pipeline/render/index.mjs';
import {Glow} from './glow.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
const W = 1080, H = 1920;
export const theme = {base: 'noturno', accent: '#FFB454'};
export const captionLayout = {};

export const M = {
  R0: 600, lam: 0.03, L: 5,                  // km, m, m
  v: 0.3, slow: 25,                          // km of track per second of film (real 7.5 km/s)
  OY: 470, CLOUD: [742, 912], SURF: 1080,    // screen rows: orbit, cloud deck, sea surface
  PY0: 1122, PY1: 1372,                      // instrument strip (plan view: along-track × cross-track)
  CROSS: 10,                                 // cross-track km shown in the strip
  vd: 3900,                                  // routine pulse speed on screen (px/s): one way ≈ 0.15 s
  slowRange: 1000,                           // ranging scene: light trip slowed 1,000×
};
M.foot = L => M.R0 * M.lam / L;              // km
M.FOOT = M.foot(M.L);                        // 3.6 km
M.NEED = M.R0 * M.lam / 1;                   // 18 km
M.RES = M.L / 2;                             // 2.5 m
M.DMAX = (M.FOOT / 2) ** 2 / (2 * M.R0);     // km, extra delay at the aperture edge (2.7 m)
const PAL = {ink: '#F4EBDD', muted: '#93A8AE', warm: '#FFB454', hot: '#FFE2B0', cool: '#8CD9FF', coolHi: '#D6F4FF', line: '#3C7387',
  light: '#F5F1E4', sat: '#C9C2B2', panelEdge: '#24505F', sea: '#05202A'};
const WARM = [1.0, 0.70, 0.30], COOL = [0.55, 0.85, 1.0], WHITE = [0.95, 0.93, 0.86];

// =====================================================================================================
// helpers
// =====================================================================================================
const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
const win = (t, a, b, d = 0.4) => fadeIn(t, a, d) * fadeOut(t, b, d);
const EASE = {io: easeInOut, o: easeOut, lin: q => clamp(q)};
/** keyed schedule [[t, v, ease], …]; ease shapes the segment ending at that key */
function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [t1, v1, e] = K[i]; if (t < t1) { const [t0, v0] = K[i - 1]; return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / (t1 - t0)); } }
    return K[K.length - 1][1];
  };
}
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 28, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba('#03141C', o.plateA ?? 0.8), o.border ? rgba(o.border, 0.85) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink, role: o.role});
  });
  return w;
}
/** big number: value + unit, right/left aligned, pops in at t0 */
function bigNum(stage, val, unit, x, y, t, t0, a = 1, o = {}) {
  const al = a * smooth((t - t0 + 0.03) / 0.12); if (al <= 0) return;
  const c = stage.ctx, sc = 1 + 0.10 * (1 - easeOut((t - t0) / 0.3)), size = o.size || 120, align = o.align || 'right';
  c.save(); c.translate(x, y); c.scale(sc, sc);
  const sh = {shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16};
  if (align === 'right') {
    const wu = unit ? stage.text(unit, 0, size * 0.2, {role: 'display', weight: 700, size: size * 0.46, color: o.unitColor || PAL.warm, alpha: al, align: 'right', ...sh}) : 0;
    stage.text(val, -wu - (unit ? 12 : 0), 0, {role: 'display', weight: 700, size, color: o.color || PAL.ink, alpha: al, align: 'right', ...sh});
  } else {
    const wv = stage.text(val, 0, 0, {role: 'display', weight: 700, size, color: o.color || PAL.ink, alpha: al, align: 'left', ...sh});
    if (unit) stage.text(unit, wv + 12, size * 0.2, {role: 'display', weight: 700, size: size * 0.46, color: o.unitColor || PAL.warm, alpha: al, align: 'left', ...sh});
  }
  if (o.sub) stage.text(o.sub, align === 'right' ? 0 : 0, size * 0.78, {role: 'body', weight: 500, size: 30, color: PAL.muted, alpha: al, align, ...sh});
  c.restore();
}

// =====================================================================================================
// TIME PLAN (word anchors; shared with --emit-sound)
// =====================================================================================================
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  const at = r => tl.at(r), wd = (s, w, o = 0) => tl.wordStart(s, w) + o;
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s]))};
  const SC = P.sc;
  P.MORPH = [0.9, 1.7];
  P.cloud1 = wd('s01', '구름'); P.sar1 = wd('s01', '합성개구레이더에');
  P.sat2 = wd('s02', '위성이'); P.ships2 = wd('s02', '배들이');
  P.ant3 = wd('s03', '안테나는'); P.blur3 = wd('s03', '흐려야');
  P.gae4 = wd('s04', '개구는'); P.open4 = wd('s04', '열린'); P.wave4 = wd('s04', '전파가'); P.ant4 = wd('s04', '안테나');
  P.y5 = wd('s05', '천구백오십일년'); P.carl5 = wd('s05', '칼'); P.move5 = wd('s05', '움직이는'); P.echo5 = wd('s05', '메아리로'); P.sep5 = wd('s05', '가르는');
  P.shoot6 = wd('s06', '쏘고'); P.back6 = wd('s06', '돌아온'); P.dist6 = wd('s06', '거리를');
  P.km7 = wd('s07', '육백킬로미터'); P.trip7 = wd('s07', '왕복'); P.sec7 = wd('s07', '영점영영사초가');
  P.two8 = wd('s08', '두'); P.once8 = wd('s08', '한꺼번에'); P.mix8 = wd('s08', '섞입니다');
  P.narrow9 = wd('s09', '좁아야'); P.long9 = wd('s09', '길수록'); P.nar9b = wd('s09', '좁아집니다');
  P.m10 = wd('s10', '오미터'); P.cm10 = wd('s10', '삼센티미터'); P.foot10 = wd('s10', '삼점육킬로미터로');
  P.one11 = wd('s11', '일미터'); P.need11 = wd('s11', '십팔킬로미터나');
  P.move12 = wd('s12', '움직이며'); P.join12 = wd('s12', '이어'); P.huge12 = wd('s12', '거대한');
  P.speed13 = wd('s13', '초속'); P.span13 = wd('s13', '삼점육킬로미터'); P.many13 = wd('s13', '수백');
  P.near14 = wd('s14', '다가올'); P.far14 = wd('s14', '멀어질'); P.curve14 = wd('s14', '휜');
  P.comp15 = wd('s15', '컴퓨터가'); P.align15 = wd('s15', '맞춰'); P.true15 = wd('s15', '진짜'); P.stack15 = wd('s15', '겹쳐');
  P.syn16 = wd('s16', '삼점육킬로미터짜리'); P.blur16 = wd('s16', '흐릿한'); P.res16 = wd('s16', '이점오미터의');
  P.self17 = wd('s17', '스스로'); P.lit17 = wd('s17', '비추므로'); P.night17 = wd('s17', '햇빛');
  P.drop18 = wd('s18', '구름'); P.x18 = wd('s18', '삼천배'); P.cm18 = wd('s18', '삼센티미터'); P.pass18 = wd('s18', '흩어지지');
  P.vis19 = wd('s19', '가시광선은'); P.scat19 = wd('s19', '이리저리'); P.block19 = wd('s19', '막힙니다');
  P.first20 = wd('s20', '첫'); P.y20 = wd('s20', '이천십삼년'); P.alt20 = wd('s20', '오백오십킬로미터'); P.name20 = wd('s20', '아리랑');
  P.day21 = wd('s21', '밤낮과'); P.oil21 = wd('s21', '기름'); P.res21 = wd('s21', '일미터');
  P.q22 = wd('s22', '밝기도'); P.cam22 = wd('s22', '카메라처럼');
  P.no23 = wd('s23', '아닙니다'); P.echo23 = wd('s23', '메아리의'); P.sea23 = wd('s23', '매끈한'); P.bounce23 = wd('s23', '튕겨'); P.ship23 = wd('s23', '배는');
  P.move24 = wd('s24', '움직이며');
  P.poster = at('s24:end') - 1.6;

  // ---- satellite track position: constant 0.3 km/s of film, stopped from the ranging scene until "움직이며" (s12)
  P.stop0 = SC.range.start - 0.3; P.go = P.move12 - 0.2;
  const vAt = t => M.v * (t < P.go ? 1 - smooth((t - P.stop0) / 1.4) : smooth((t - P.go) / 1.2));
  const DT = 1 / 120, N = Math.ceil((P.end + 2) / DT) + 2, X = new Float64Array(N);
  X[0] = -0.3 * 2; let tt = -2;   // integrate from t = −2 so pulses before 0 have a place
  for (let i = 1; i < N; i++) { X[i] = X[i - 1] + vAt(tt + DT / 2) * DT; tt += DT; }
  P.xs = t => { const f = (t + 2) / DT, i = clamp(Math.floor(f), 0, N - 2), q = f - i; return X[i] + (X[i + 1] - X[i]) * q; };
  P.vAt = vAt;
  P.xb = P.xs(SC.beam.start);                       // satellite position while stopped (range + beam scenes)
  // ---- ships (world km along track, cross-track km, size)
  P.A = P.xb - 0.5; P.B = P.xb + 0.5;              // the pair under the stopped beam
  P.C = P.xs(SC.synth.start + 0.25) + M.FOOT / 2 + 0.05; P.D = P.C + 1.0;   // the pair the synthetic aperture resolves
  // myth ship: behind the satellite, so the satellite looks at it obliquely from the upper right
  P.E = P.xs(SC.myth.start) - 1.6;
  P.oilX = P.xs(P.oil21) - M.FOOT / 2 - 3.2;       // oil slick centre: already imaged when "기름" is spoken
  P.SHIPS = [   // the named ships first: the de-duplication below keeps the earlier entry
    {x: P.A, y: 6.0, id: 'A'}, {x: P.B, y: 6.0, id: 'B'}, {x: P.C, y: 6.0, id: 'C'}, {x: P.D, y: 6.0, id: 'D'}, {x: P.E, y: 6.0, id: 'E'},
    {x: -11.5, y: 6.6}, {x: -7.4, y: 5.4}, {x: -3.6, y: 7.2}, {x: -0.9, y: 5.7}, {x: 2.6, y: 6.8}, {x: 5.9, y: 5.4},
    {x: P.D + 4.8, y: 5.4}, {x: P.D + 9.5, y: 7.0}, {x: P.oilX - 5.2, y: 5.6}, {x: P.oilX + 5.6, y: 6.2},
    {x: P.E + 5.5, y: 5.6}, {x: P.E + 9.6, y: 7.0},
  ].filter((s, i, arr) => s.id || !arr.some((o, j) => (j < i && Math.abs(o.x - s.x) < 0.9) || (o.id && Math.abs(o.x - s.x) < (o.id === 'A' || o.id === 'B' ? 3.8 : 2.6)) || Math.abs(s.x - P.oilX) < 3.0));

  // ---- routine pulses (display speed): hook/origin/cloud/korea/close — times of emission
  P.routine = [];
  const addTrain = (t0, t1, dt) => { for (let te = t0; te < t1; te += dt) P.routine.push(te); };
  addTrain(-1.32, SC.origin.start + 0.1, 0.62);   // a pulse is half-way down at t = 0 (the poster)
  addTrain(P.wave4 - 0.05, SC.range.start - 0.6, 0.62);
  addTrain(SC.cloud.start + 0.4, SC.myth.start - 0.1, 0.62);
  addTrain(SC.close.start + 0.3, P.end + 1, 0.62);
  // ---- ranging pulse (slowed 1,000×): one way 2 s
  P.r = {te: P.shoot6 - 0.05}; P.r.th = P.r.te + 2.0; P.r.tr = P.r.te + 4.0;
  // ---- beam scene pulses (display speed, satellite stopped)
  P.beamPulses = [];
  for (let te = P.two8 - 0.2; te < SC.beam.end - 0.4; te += 1.1) P.beamPulses.push(te);
  // ---- synth pulses: every 0.6 s while the satellite crosses C−1.8 … D+1.8
  P.synth = [];
  for (let te = SC.synth.start + 0.25; ; te += 0.6) {
    const x = P.xs(te); if (x > P.D + M.FOOT / 2 + 0.02 || te > SC.synth.end) break;
    const echoes = [];
    for (const id of ['C', 'D']) { const xt = P[id], u = x - xt; if (Math.abs(u) <= M.FOOT / 2 + 1e-6) echoes.push({id, xt, u, d: (u * u) / (2 * M.R0)}); }
    P.synth.push({te, x, tr: te + 0.30, echoes});
  }
  P.f1 = P.align15 - 0.2; P.f2 = P.true15 - 0.25;           // focusing: straighten, then gather
  // ---- myth pulses (oblique)
  P.myth = []; for (let te = SC.myth.start + 0.5; te < SC.myth.end - 0.3; te += 1.25) P.myth.push(te);
  PLANS.set(tl, P);
  return P;
}

// =====================================================================================================
// CAMERA: k = px per km along track; camX = km at screen x 540. f = 1 follows the satellite (satellite at screen ox).
// =====================================================================================================
function camera(t, P) {
  const SC = P.sc, s = k => SC[k];
  if (!P.camK) {
    const KX = [  // [t, k, ox (screen x of satellite when following), fx (fixed camX), f]
      [0, 36, 690, 0, 1], [s('origin').start, 36, 690, 0, 1], [P.gae4 + 0.4, 70, 560, 0, 1], [P.y5 - 0.3, 70, 560, 0, 1], [P.move5 + 0.4, 46, 640, 0, 1],
      [s('range').start + 0.2, 46, 640, 0, 1], [s('range').start + 1.6, 120, 470, 0, 1], [s('beam').start + 0.5, 120, 540, 0, 1],
      [P.one11 - 0.5, 120, 540, 0, 1], [P.one11 + 1.4, 36, 540, 0, 1], [s('synth').start - 0.4, 36, 540, 0, 1],
      [s('synth').start + 1.1, 160, 540, P.C + 0.5, 0], [s('synth').end - 0.8, 160, 540, P.C + 0.5, 0],
      [s('cloud').start + 1.4, 36, 760, 0, 1], [s('korea').end - 0.6, 36, 760, 0, 1],
      [s('myth').start + 0.6, 120, 540, P.E, 0], [s('myth').end - 0.5, 120, 540, P.E, 0],
      [s('close').start + 1.2, 36, 690, 0, 1], [P.end + 1, 36, 690, 0, 1]];
    const ks = keyed(KX.map(([tt, k], i) => [tt, Math.log(k), i ? 'io' : undefined]));
    const oxs = keyed(KX.map(([tt, , ox], i) => [tt, ox, i ? 'io' : undefined]));
    const fs_ = keyed(KX.map(([tt, , , , f], i) => [tt, f, i ? 'io' : undefined]));
    // fixed camX keys: where f = 0 use fx; elsewhere hold the follow value (blend handles the transition)
    const fxs = t => (t < SC.cloud.start - 3 ? P.C + 0.5 : P.E);
    P.camK = {ks, oxs, fs_, fxs};
  }
  const {ks, oxs, fs_, fxs} = P.camK, k = Math.exp(ks(t)), f = fs_(t), follow = P.xs(t) - (oxs(t) - 540) / k;
  return {k, camX: f * follow + (1 - f) * fxs(t)};
}
const SX = (cam, x) => 540 + (x - cam.camX) * cam.k;

// =====================================================================================================
// WORLD LAYERS — background (sky, stars), cloud deck, sea, ships, satellite, beam
// =====================================================================================================
// value noise in 1D (world km), deterministic
const n1 = x => { const i = Math.floor(x), f = x - i, a = rand(i * 1.37 + 11), b = rand((i + 1) * 1.37 + 11); return lerp(a, b, f * f * (3 - 2 * f)); };
const fbm = (x, s = 0) => 0.55 * n1(x + s) + 0.3 * n1(2.1 * x + 3.7 + s) + 0.15 * n1(4.3 * x + 9.1 + s);
const n2 = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, h = (a, b) => rand(a * 57.3 + b * 131.7 + 5);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return lerp(lerp(h(i, j), h(i + 1, j), sx), lerp(h(i, j + 1), h(i + 1, j + 1), sx), sy); };

const STARS = Array.from({length: 170}, (_, i) => ({x: rand(i * 3.1 + 1) * W, y: 40 + rand(i * 7.7 + 2) * 600, m: rand(i * 1.9 + 5) ** 3, tw: rand(i * 5.3) * TAU}));
export function background(stage, t, ctx) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#00070D'); g.addColorStop(0.33, '#001621'); g.addColorStop(0.52, '#03202C'); g.addColorStop(1, '#00090E');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (const s of STARS) { const al = (0.10 + 0.5 * s.m) * (0.85 + 0.15 * Math.sin(t * 1.1 + s.tw)), r = 0.6 + 1.5 * s.m; c.fillStyle = rgba('#E8F0F6', al); c.fillRect(s.x - r / 2, s.y - r / 2, r, r); }
}

/** cloud deck: matte, flat; top edge and thickness from world-x noise so it scrolls with the camera */
function cloudDeck(stage, cam, a) {
  if (a <= 0) return;
  const c = stage.ctx, [y0, y1] = M.CLOUD, top = [], bot = [];
  const kk = Math.max(cam.k, 1);
  for (let x = -20; x <= W + 20; x += 6) {
    const wx = cam.camX + (x - 540) / kk;
    const puff = Math.abs(Math.sin(wx * 2.3 + 1.7 * n1(wx * 0.7))) ** 0.6;
    top.push([x, y0 + 26 + 34 * fbm(wx * 0.45) - 26 * puff * fbm(wx * 1.3, 4)]);
    bot.push([x, y1 - 10 + 16 * fbm(wx * 0.6, 9)]);
  }
  withAlpha(c, a, () => {
    c.beginPath(); top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); for (let i = bot.length - 1; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]); c.closePath();
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#2B4552'); g.addColorStop(0.35, '#1C3440'); g.addColorStop(1, '#0D2029');
    c.fillStyle = g; c.fill();
    line(c, top, rgba('#4D6E7C', 0.75), 2);
    // a second, darker inner layer for depth (still matte)
    const mid = top.map(([x, y], i) => [x, lerp(y, bot[i][1], 0.55) + 8 * Math.sin(i * 0.37)]);
    line(c, mid, rgba('#0B1C24', 0.55), 10);
  });
}

function seaLayer(stage, cam) {
  const c = stage.ctx, y = M.SURF;
  const g = c.createLinearGradient(0, y, 0, M.PY0); g.addColorStop(0, '#062A37'); g.addColorStop(1, '#021219');
  c.fillStyle = g; c.fillRect(0, y, W, M.PY0 - y);
  const pts = []; for (let x = -10; x <= W + 10; x += 8) { const wx = cam.camX + (x - 540) / cam.k; pts.push([x, y + 1.6 * Math.sin(wx * 9 + 0.7 * Math.sin(wx * 3.1))]); }
  line(c, pts, rgba('#4A8AA0', 0.8), 2);
}

/** matte ship silhouette, bow to the right; scale from the camera so it stays readable */
function ship(stage, x, s = 1, lit = 0) {
  const c = stage.ctx, y = M.SURF;
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath(); c.moveTo(-30, -9); c.lineTo(26, -9); c.lineTo(34, -14); c.lineTo(30, 3); c.lineTo(-26, 3); c.lineTo(-30, -2); c.closePath();
  const g = c.createLinearGradient(0, -14, 0, 3); g.addColorStop(0, '#7E949A'); g.addColorStop(1, '#2C4148'); c.fillStyle = g; c.fill();
  c.beginPath(); c.moveTo(-18, -9); c.lineTo(-18, -20); c.lineTo(-4, -20); c.lineTo(-2, -26); c.lineTo(6, -26); c.lineTo(8, -9); c.closePath();
  const g2 = c.createLinearGradient(0, -26, 0, -9); g2.addColorStop(0, '#A9B8BB'); g2.addColorStop(1, '#5B7178'); c.fillStyle = g2; c.fill();
  line(c, [[-30, -9], [26, -9], [34, -14]], rgba('#D5E0E3', 0.55), 1.2);
  if (lit > 0) { c.globalCompositeOperation = 'lighter'; c.beginPath(); c.moveTo(-30, -9); c.lineTo(26, -9); c.lineTo(34, -14); c.lineTo(30, 3); c.lineTo(-26, 3); c.closePath(); c.fillStyle = rgba(PAL.warm, 0.45 * lit); c.fill(); }
  c.restore();
}
const shipScale = cam => clamp(0.75 + cam.k / 260, 0.85, 1.35);

/** matte satellite: body, two dark solar wings, the SAR antenna panel under the body (length antPx) */
function satellite(stage, x, y, antPx, o = {}) {
  const c = stage.ctx, s = o.s || 1;
  c.save(); c.translate(x, y); c.scale(s, s);
  // solar wings
  for (const sg of [-1, 1]) {
    const x0 = sg < 0 ? -40 - 96 : 40;
    line(c, [[sg * 32, -6], [sg * 40, -6]], '#7D8A8E', 3);
    const g = c.createLinearGradient(0, -26, 0, 14); g.addColorStop(0, '#2C4A6B'); g.addColorStop(1, '#16273C');
    rect(c, x0, -24, 96, 34, 2, g, rgba('#7FA0C0', 0.6), 1.2);
    for (let i = 1; i < 6; i++) line(c, [[x0 + i * 16, -24], [x0 + i * 16, 10]], rgba('#7FA0C0', 0.28), 1);
    line(c, [[x0, -7], [x0 + 96, -7]], rgba('#7FA0C0', 0.28), 1);
  }
  // body
  const gb = c.createLinearGradient(-30, -34, 30, 18); gb.addColorStop(0, '#E2DBCB'); gb.addColorStop(0.5, '#B8B09F'); gb.addColorStop(1, '#6E685C');
  rect(c, -32, -36, 64, 50, 4, gb, rgba('#F4EDE0', 0.5), 1.2);
  line(c, [[-32, -20], [32, -20]], rgba('#5E584D', 0.6), 1);
  // antenna panel (the "aperture")
  const ga = c.createLinearGradient(0, 16, 0, 28); ga.addColorStop(0, '#D7DCDA'); ga.addColorStop(1, '#7C8786');
  line(c, [[-10, 14], [-10, 18]], '#7D8A8E', 2); line(c, [[10, 14], [10, 18]], '#7D8A8E', 2);
  if (o.antLit) { c.save(); c.shadowColor = rgba(o.antLitCol || PAL.warm, 0.9); c.shadowBlur = 18 * o.antLit; rect(c, -antPx / 2, 18, antPx, 9, 2, ga); c.restore(); }
  else rect(c, -antPx / 2, 18, antPx, 9, 2, ga);
  for (let i = 1; i < Math.floor(antPx / 14); i++) line(c, [[-antPx / 2 + i * 14, 19], [-antPx / 2 + i * 14, 26]], rgba('#56605F', 0.5), 1);
  c.restore();
}
/** antenna-only ghost (one recorded position of the synthetic aperture) */
function ghostAntenna(c, x, y, w, a, col = '#9FC3CF') { rect(c, x - w / 2, y + 18, w, 9, 2, rgba(col, 0.12 * a), rgba(col, 0.6 * a), 1.3); }
const ANT0 = 130;                                       // px for the real 5 m antenna (satellite enlarged)
const antPxOf = L => ANT0 * Math.min(L, 24) / 5;

/** beam wedge from the antenna face to the sea: faint warm fill + dashed edges. Returns geometry. */
function beamWedge(stage, sx, antPx, footPx, a, o = {}) {
  const c = stage.ctx, y0 = M.OY + 27, y1 = M.SURF, hw0 = antPx / 2 * 0.6, hw1 = footPx / 2, cx1 = o.cx1 ?? sx;
  if (a > 0) withAlpha(c, a, () => {
    c.beginPath(); c.moveTo(sx - hw0, y0); c.lineTo(sx + hw0, y0); c.lineTo(cx1 + hw1, y1); c.lineTo(cx1 - hw1, y1); c.closePath();
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(PAL.warm, 0.13)); g.addColorStop(1, rgba(PAL.warm, 0.05)); c.fillStyle = g; c.fill();
    line(c, [[sx - hw0, y0], [cx1 - hw1, y1]], rgba(PAL.warm, 0.42), 1.5, {dash: [4, 8]});
    line(c, [[sx + hw0, y0], [cx1 + hw1, y1]], rgba(PAL.warm, 0.42), 1.5, {dash: [4, 8]});
  });
  return {y0, y1, hw0, hw1, cx1};
}

// =====================================================================================================
// INSTRUMENT STRIP — the radar picture (plan view; x = the world's along-track ruler, y = cross-track 0…10 km)
// =====================================================================================================
const PX = {x0: 36, x1: 1044};
const PYc = yc => M.PY0 + 8 + yc / M.CROSS * (M.PY1 - M.PY0 - 16);
let TEX = null;
/** SAR-like picture generated from the same world (coast, sea, ships, an oil slick). Not a real satellite image. */
function texFor(P) {
  if (TEX && TEX.P === P) return TEX;
  const X0 = -32, X1 = P.E + 18, ppk = 40, ppy = 26, w = Math.ceil((X1 - X0) * ppk), h = Math.ceil(M.CROSS * ppy);
  const cv = createCanvas(w, h), cc = cv.getContext('2d'), img = cc.createImageData(w, h), d = img.data;
  const coast = x => 2.1 + 1.3 * fbm(x * 0.16, 2) + 0.7 * fbm(x * 0.55, 8);
  const oil = (x, y) => { const u = (x - P.oilX) / 3.4, v = (y - 6.9 - 0.35 * Math.sin((x - P.oilX) * 0.9)) / 1.05; return clamp(2.2 * (1 - Math.sqrt(u * u + v * v)) - 0.5 * n2(x * 1.8, y * 1.8) + 0.25); };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = X0 + (i + 0.5) / ppk, y = (j + 0.5) / ppy, cst = coast(x);
    let v;
    if (y < cst) {      // land: fields and settlements (bright), hills
      const f = n2(x * 1.1, y * 1.1), g2 = n2(x * 3.3 + 17, y * 3.3), hill = n2(x * 0.35 + 5, y * 0.35);
      v = 0.26 + 0.16 * f + 0.10 * g2 + 0.12 * hill;
      const town = n2(x * 0.45 + 40, y * 0.6); if (town > 0.7) v += 0.45 * smooth((town - 0.7) / 0.12) * (0.6 + 0.4 * g2);   // towns: bright
      if (cst - y < 0.07) v += 0.15;                                        // shoreline
    } else {            // sea: dark, faint wind streaks
      v = 0.07 + 0.035 * n2(x * 0.5 + 3, y * 0.7);
      v *= 1 - 0.85 * oil(x, y);
    }
    const sp = -Math.log(Math.max(1e-4, rand(i * 0.731 + j * 191.37))); // speckle (exponential)
    v *= y < cst ? 0.72 + 0.28 * sp : 0.55 + 0.45 * sp;
    const g = Math.pow(clamp(v), 0.8), k = (j * w + i) * 4;
    d[k] = 255 * g * 0.86; d[k + 1] = 255 * g * 0.95; d[k + 2] = 255 * g; d[k + 3] = 255;
  }
  cc.putImageData(img, 0, 0);
  // ships: bright point + SAR cross side-lobes
  for (const s of P.SHIPS) {
    if (s.y < coast(s.x) + 0.3) continue;
    const x = (s.x - X0) * ppk, y = s.y * ppy;
    cc.globalCompositeOperation = 'lighter';
    for (const [dx, dy, L] of [[1, 0, 12], [0, 1, 7]]) for (let q = -L; q <= L; q++) { const a = 0.6 * Math.exp(-Math.abs(q) / 3.2); cc.fillStyle = `rgba(220,240,255,${a})`; cc.fillRect(x + dx * q - 0.8, y + dy * q - 0.8, 1.8, 1.8); }
    cc.fillStyle = 'rgba(245,252,255,1)'; cc.fillRect(x - 2.2, y - 1.8, 4.6, 3.8);
  }
  cc.globalCompositeOperation = 'source-over';
  TEX = {P, cv, X0, X1, ppk, coast};
  return TEX;
}
function panelFrame(stage, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    rect(c, PX.x0, M.PY0, PX.x1 - PX.x0, M.PY1 - M.PY0, 10, '#020B10');
  });
}
function panelEdge(stage, label, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    rect(c, PX.x0, M.PY0, PX.x1 - PX.x0, M.PY1 - M.PY0, 10, null, PAL.panelEdge, 1.5);
    if (label) tag(stage, label, PX.x0 + 16, M.PY0 + 24, {size: 26, weight: 500, align: 'left', color: PAL.muted, plateA: 0.75});
  });
}
const clipPanel = (c, fn) => { c.save(); c.beginPath(); c.rect(PX.x0 + 1, M.PY0 + 1, PX.x1 - PX.x0 - 2, M.PY1 - M.PY0 - 2); c.clip(); try { fn(); } finally { c.restore(); } };
/** the picture, formed up to world x = reveal (km). Formed columns sit behind the satellite. */
function panelImage(stage, cam, P, reveal, a = 1, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, T = texFor(P), dx = SX(cam, T.X0), dw = (T.X1 - T.X0) * cam.k, xr = SX(cam, reveal);
  clipPanel(c, () => withAlpha(c, a, () => {
    // not yet imaged: dark with a faint grid on the same ruler (1 km)
    c.fillStyle = '#03121A'; c.fillRect(PX.x0, M.PY0, PX.x1 - PX.x0, M.PY1 - M.PY0);
    const step = cam.k >= 60 ? 1 : 2;
    for (let km = Math.ceil((cam.camX - 540 / cam.k) / step) * step; SX(cam, km) < PX.x1; km += step) line(c, [[SX(cam, km), M.PY0], [SX(cam, km), M.PY1]], rgba('#6FAFC4', 0.07), 1);
    c.save(); c.beginPath(); c.rect(PX.x0, M.PY0, Math.max(0, xr - PX.x0), M.PY1 - M.PY0); c.clip();
    c.globalAlpha *= o.dim ?? 1; c.imageSmoothingEnabled = true;
    c.drawImage(T.cv, 0, 0, T.cv.width, T.cv.height, dx, PYc(0), dw, PYc(M.CROSS) - PYc(0));
    c.restore();
    if (o.front !== false && xr > PX.x0 && xr < PX.x1) { line(c, [[xr, M.PY0 + 2], [xr, M.PY1 - 2]], rgba(PAL.coolHi, 0.75), 2); line(c, [[xr, M.PY0 + 2], [xr, M.PY1 - 2]], rgba(PAL.cool, 0.18), 10); }
  }));
}
/** real-aperture smear of a set of targets: each target smeared over the footprint (FWHM) along track */
function smearRow(GC, cam, xs, fwhm, yc, amp) {
  if (amp <= 0) return;
  const y = PYc(yc), sig = fwhm / 2.355, row = [];
  for (let X = PX.x0 + 4; X < PX.x1 - 4; X += 5) {
    const wx = cam.camX + (X - 540) / cam.k; let I = 0;
    for (const x of xs) I += Math.exp(-0.5 * ((wx - x) / sig) ** 2);
    row.push([X, I]);
  }
  const mx = Math.max(1e-6, ...row.map(r => r[1]));
  for (const [X, I] of row) { const q = smooth((I / mx - 0.35) / 0.3); if (q <= 0) continue; const k = amp * 0.24 * q * (0.6 + 0.4 * I / mx); GC.splat(X, y, 11, COOL, k); GC.splat(X, y - 7, 8, COOL, 0.45 * k); GC.splat(X, y + 7, 8, COOL, 0.45 * k); }
}

// =====================================================================================================
// SIGNALS (glow buffers): pulses down (warm), echoes up (cool), surface wash
// =====================================================================================================
let GW = null, GC = null;
/** a pulse wavefront inside the wedge at time t (emitted te, one-way time T) */
function splatPulse(sx, wedge, te, t, T, amp = 1) {
  const q = (t - te) / T; if (q < 0) return;
  const {y0, y1, hw0, hw1, cx1} = wedge;
  if (q <= 1) {
    for (const [lag, aa] of [[0, 1], [0.045, 0.55], [0.09, 0.28]]) {
      const qq = q - lag; if (qq < 0) continue;
      const y = lerp(y0, y1, qq), hw = lerp(hw0, hw1, qq), cx = lerp(sx, cx1, qq), n = Math.max(3, Math.ceil(2 * hw / 9));
      for (let i = 0; i <= n; i++) { const u = -1 + 2 * i / n, xx = cx + u * hw, yy = y - 10 * (1 - u * u) * (1 - qq) * 0 + 6 * u * u * qq;
        GW.splat(xx, yy, 8, WARM, amp * aa * 0.95 * (0.35 + 0.65 * (1 - u * u))); }
    }
  }
  // the sea where it lands glows warm for a moment (the radar lights its own footprint)
  const a = t - (te + T); if (a >= 0 && a < 0.45) { const k = amp * 0.5 * Math.exp(-a / 0.14); for (let u = -1; u <= 1.001; u += 0.08) GW.splat(cx1 + u * hw1, y1 - 2, 10, WARM, k * (1 - 0.6 * u * u)); }
}
/** an echo front rising from a ship at screen x (xa) to the antenna (sx), emitted at th, one-way time T */
function splatEcho(xa, sx, th, t, T, amp = 1) {
  const q = (t - th) / T; if (q < 0 || q > 1.0) return;
  for (const [lag, aa] of [[0, 1], [0.05, 0.5]]) {
    const qq = q - lag; if (qq < 0) continue;
    const y = lerp(M.SURF - 6, M.OY + 30, qq), cx = lerp(xa, sx, qq), hw = lerp(34, 16, qq);
    for (let u = -1; u <= 1.001; u += 0.25) GC.splat(cx + u * hw, y + 5 * u * u, 7.5, COOL, amp * aa * 1.05 * (1 - 0.5 * u * u));
  }
}

// =====================================================================================================
// STATE SCHEDULES (functions of absolute time, built once per timeline)
// =====================================================================================================
function sched(P) {
  if (P.S) return P.S;
  const SC = P.sc;
  const S = {};
  S.Lreal = keyed([[0, 5], [P.long9 - 0.15, 5], [P.long9 + 1.3, 20], [P.m10 - 0.8, 20], [P.m10 + 0.3, 5]]);
  const LL = keyed([[0, Math.log(5)], [P.long9 - 0.15, Math.log(5)], [P.long9 + 1.3, Math.log(20)], [P.m10 - 0.8, Math.log(20)], [P.m10 + 0.3, Math.log(5)],
    [P.need11 - 0.3, Math.log(5)], [P.need11 + 1.1, Math.log(18000)], [P.move12 + 0.6, Math.log(18000)], [P.move12 + 1.6, Math.log(5)]]);
  S.Lbeam = t => Math.exp(LL(t));
  S.cloudA = keyed([[0, 0.95], [SC.origin.start, 0.95], [SC.range.start + 1, 0.62], [SC.synth.start, 0.62], [SC.synth.start + 1, 0.5], [SC.cloud.start - 0.5, 0.5], [SC.cloud.start + 1, 0.97],
    [SC.korea.end - 0.5, 0.97], [SC.myth.start + 0.6, 0.45], [SC.myth.end - 0.4, 0.45], [SC.close.start + 0.8, 0.95]]);
  // the beam wedge is shown where a scene talks about the beam; elsewhere only the pulses show it
  S.wedgeA = keyed([[0, 0.8], [SC.origin.start + 1, 0.8], [P.gae4 + 0.6, 1], [SC.range.start + 1, 1], [SC.synth.start - 0.6, 1], [SC.synth.start + 0.4, 0.85], [SC.synth.end - 2, 0.85], [SC.synth.end, 0.0],
    [SC.cloud.start + 0.8, 0.8], [SC.korea.end - 0.4, 0.8], [SC.myth.start + 0.4, 0], [SC.myth.end - 0.3, 0], [SC.close.start + 0.8, 0.8]]);
  S.imgA = keyed([[0, 1], [SC.beam.start - 0.2, 1], [SC.beam.start + 0.6, 0.55], [SC.beam.end - 1.2, 0.55], [SC.synth.start + 0.2, 0], [SC.synth.end - 0.8, 0], [SC.cloud.start + 0.6, 1]]);
  S.recA = t => win(t, SC.synth.start - 0.2, SC.synth.end - 0.5, 0.6);
  S.blur = t => win(t, P.blur3 - 0.25, SC.origin.start + 0.4, 0.5);
  S.hypo = t => win(t, P.need11 - 0.4, P.move12 + 0.9, 0.4);
  S.lens = t => win(t, P.drop18 - 0.6, SC.korea.start + 0.3, 0.6);
  // trail pulses (s12 → synth): each leaves a ghost antenna on the orbit
  S.trail = []; for (let te = P.go + 0.5; te < SC.synth.start + 0.2; te += 0.6) S.trail.push({te, x: P.xs(te)});
  return (P.S = S);
}
const T1 = () => (M.SURF - M.OY - 27) / M.vd;   // routine one-way time (display)
const recY = d => M.PY0 + 54 + (d / M.DMAX) * 118;
const ROW = M.PY1 - 32;                           // image row of the synthetic-aperture panel

// =====================================================================================================
// THE FRAME — one world for every scene
// =====================================================================================================
function drawFrame(stage, t, ctx) {
  const P = plan(ctx.tl), S = sched(P), SC = P.sc, id = ctx.scene.id, c = stage.ctx, cam = camera(t, P);
  const xs = P.xs(t), sx = SX(cam, xs), Lr = S.Lreal(t), antPx = antPxOf(Lr), Lb = S.Lbeam(t), footPx = M.foot(Lb) * cam.k;
  const T = T1(), sS = shipScale(cam);
  GW ||= new Glow(); GC ||= new Glow(); GW.begin(); GC.begin();

  // ---------------- world: orbit, cloud deck, sea, ships
  line(c, [[0, M.OY + 2], [W, M.OY + 2]], rgba('#6FAFC4', 0.13), 1.5, {dash: [2, 10]});
  cloudDeck(stage, cam, S.cloudA(t));
  seaLayer(stage, cam);
  const litOf = new Map();
  const hitWarm = (x, tHit) => { const a = t - tHit; if (a >= 0 && a < 0.5) litOf.set(x, Math.max(litOf.get(x) || 0, Math.exp(-a / 0.15))); };

  // ---------------- routine pulses (display speed)
  for (const te of P.routine) {
    if (t < te || t > te + 2 * T + 0.5) continue;
    const x0 = P.xs(te), sxe = SX(cam, x0), fp = M.FOOT * cam.k, wedge = {y0: M.OY + 27, y1: M.SURF, hw0: ANT0 * 0.3, hw1: fp / 2, cx1: sxe};
    splatPulse(sxe, wedge, te, t, T, id === 'cloud' || id === 'korea' ? 1 : 0.85);
    for (const s of P.SHIPS) if (Math.abs(s.x - x0) <= M.FOOT / 2) { hitWarm(s.x, te + T); splatEcho(SX(cam, s.x), sx, te + T, t, T, 0.75); }
  }
  // ---------------- the slowed ranging pulse
  if (id === 'range' || (id === 'origin' && t > P.r.te - 0.2) || (id === 'beam' && t < P.r.tr + 0.6)) {
    const r = P.r, Tr = r.th - r.te, wedge = {y0: M.OY + 27, y1: M.SURF, hw0: antPx * 0.3, hw1: footPx / 2, cx1: sx};
    splatPulse(sx, wedge, r.te, t, Tr, 1.2);
    for (const s of P.SHIPS) if (Math.abs(s.x - xs) <= M.FOOT / 2) { hitWarm(s.x, r.th); splatEcho(SX(cam, s.x), sx, r.th, t, Tr, 1.1); }
  }
  // ---------------- beam scene pulses (satellite stopped; footprint from the current antenna)
  if (id === 'beam' || (id === 'synth' && t < SC.synth.start + 1)) {
    for (const te of P.beamPulses) {
      if (t < te || t > te + 2 * T + 0.5) continue;
      const fpe = M.foot(S.Lbeam(te)) * cam.k, wedge = {y0: M.OY + 27, y1: M.SURF, hw0: antPxOf(S.Lreal(te)) * 0.3, hw1: Math.max(3, fpe / 2), cx1: SX(cam, P.xs(te))};
      splatPulse(SX(cam, P.xs(te)), wedge, te, t, T, 1);
      for (const s of P.SHIPS) if (Math.abs(s.x - P.xs(te)) <= M.foot(S.Lbeam(te)) / 2 + 1e-4) { hitWarm(s.x, te + T); splatEcho(SX(cam, s.x), sx, te + T, t, T, 1); }
    }
  }
  // ---------------- synthetic-aperture pulses (and the trail that starts in s12)
  const synthList = [...S.trail.map(p => ({...p, tr: p.te + 0.3, echoes: []})), ...P.synth];
  if (id === 'beam' || id === 'synth') for (const p of synthList) {
    if (t < p.te || t > p.te + 0.6) continue;
    const sxe = SX(cam, p.x), wedge = {y0: M.OY + 27, y1: M.SURF, hw0: ANT0 * 0.3, hw1: M.FOOT * cam.k / 2, cx1: sxe};
    splatPulse(sxe, wedge, p.te, t, 0.15, 1);
    for (const e of p.echoes) { hitWarm(e.xt, p.te + 0.15); splatEcho(SX(cam, e.xt), sx, p.te + 0.15, t, 0.15, 1); }
  }

  for (const s of P.SHIPS) { const X = SX(cam, s.x); if (X > -60 && X < W + 60) ship(stage, X, sS * lerp(1.1, 0.8, clamp((s.y - 5.2) / 2.2)), litOf.get(s.x) || 0); }

  // ghost antennas = the recorded positions (s12 trail and synth)
  if (id === 'beam' || id === 'synth') {
    const gA = id === 'synth' ? 1 - smooth((t - SC.synth.end + 0.9) / 0.6) : fadeIn(t, P.go, 0.5) * fadeOut(t, SC.beam.end - 0.6, 0.5);
    const hiA = fadeIn(t, P.syn16 - 0.2, 0.5);
    for (const p of (id === 'synth' ? P.synth : synthList)) if (t >= p.te) {
      const inC = Math.abs(p.x - P.C) <= M.FOOT / 2 + 1e-6, w = cam.k > 100 ? 22 : 12;
      ghostAntenna(c, SX(cam, p.x), M.OY, w, gA * (inC ? lerp(0.6, 1.3, hiA) : lerp(0.6, 0.3, hiA)), inC && hiA > 0 ? PAL.cool : '#9FC3CF');
    }
  }

  // ---------------- beam wedge, satellite, hypothetical 18 km antenna
  const wA = S.wedgeA(t) * (id === 'range' ? 1 - 0.5 * win(t, P.r.te, P.r.tr + 0.4) : 1);
  beamWedge(stage, sx, antPx, Math.max(2, footPx), wA);
  const wideGhost = id === 'beam' ? win(t, P.long9 + 0.2, P.m10 + 0.1, 0.4) : 0;     // the old, wide footprint as a dashed outline
  if (wideGhost > 0) withAlpha(c, wideGhost, () => { const hw = M.FOOT * cam.k / 2; line(c, [[sx - ANT0 * 0.3, M.OY + 27], [sx - hw, M.SURF]], rgba('#9FC3CF', 0.5), 1.5, {dash: [3, 7]}); line(c, [[sx + ANT0 * 0.3, M.OY + 27], [sx + hw, M.SURF]], rgba('#9FC3CF', 0.5), 1.5, {dash: [3, 7]}); });
  const antLit = Math.max(0, ...[...P.routine, P.r.te, ...P.beamPulses, ...synthList.map(p => p.te)].map(te => { const a = t - te; return a >= 0 && a < 0.25 ? 1 - a / 0.25 : 0; }));
  satellite(stage, sx, M.OY, antPx, {antLit: antLit * 0.8});
  // s12: the places where echoes were taken, joined into one long bar behind the moving satellite
  if (id === 'beam' && t > P.go + 0.5) withAlpha(c, fadeIn(t, P.go + 0.5, 0.4) * fadeOut(t, SC.beam.end - 0.4, 0.4), () => {
    const done = S.trail.filter(p => p.te <= t); if (!done.length) return;
    const x0 = SX(cam, done[0].x), y = M.OY + 50;
    line(c, [[x0, y], [sx, y]], rgba(PAL.cool, 0.25), 8); line(c, [[x0, y], [sx, y]], rgba(PAL.coolHi, 0.9), 2.5);
    for (const p of done) line(c, [[SX(cam, p.x), y - 7], [SX(cam, p.x), y + 7]], rgba(PAL.coolHi, 0.8), 1.5);
    const la = fadeIn(t, P.join12, 0.3);
    if (la > 0) tag(stage, '메아리를 받은 자리', x0 - 14, y + 2, {size: 26, align: 'right', color: PAL.coolHi, a: la});
  });
  const hy = S.hypo(t);
  if (hy > 0) withAlpha(c, hy, () => {
    const g = easeOut((t - (P.need11 - 0.4)) / 1.2), half = lerp(antPx / 2, M.NEED / 2 * cam.k, g);
    c.setLineDash([7, 5]); rect(c, sx - half, M.OY + 16, 2 * half, 13, 3, rgba('#C9D2D0', 0.14), rgba('#E6EEF0', 0.9), 2.2); c.setLineDash([]);
    if (g > 0.9) { for (const sg of [-1, 1]) line(c, [[sx + sg * half, M.OY + 4], [sx + sg * half, M.OY + 42]], rgba('#DCE7EA', 0.7), 1.5); line(c, [[sx - half, M.OY - 4], [sx + half, M.OY - 4]], rgba('#DCE7EA', 0.5), 1.5, {dash: [3, 6]}); }
  });

  // ---------------- scene extras that live in the world
  if (id === 'origin') originExtras(stage, t, P, cam, sx);
  if (id === 'range') rangeExtras(stage, t, P, cam, sx);
  if (id === 'myth') mythWorld(stage, t, P, cam, sx);

  // ---------------- instrument strip
  panelFrame(stage, 1);
  const imgA = S.imgA(t), recA = S.recA(t);
  if (imgA > 0) {
    let reveal = xs - M.FOOT / 2;
    if (id === 'myth' || id === 'close') reveal = Math.max(reveal, cam.camX + 600 / cam.k);
    if (id === 'beam' || id === 'synth') reveal = P.xb - M.FOOT / 2 - 0.4;
    const bl = S.blur(t);
    if (bl > 0) { // "원래대로라면 흐려야": the same picture smeared over the real footprint
      panelImage(stage, cam, P, reveal, imgA * (1 - bl));
      const c2 = stage.ctx; c2.save(); c2.filter = `blur(${(10 * bl).toFixed(1)}px)`; panelImage(stage, cam, P, reveal, imgA * bl, {front: false}); c2.filter = 'none'; c2.restore();
    } else panelImage(stage, cam, P, reveal, imgA, {dim: id === 'beam' ? 0.55 : 1});
  }
  if (recA > 0) recordPanel(stage, t, P, cam, synthList, recA);
  if (id === 'beam') beamPanel(stage, t, P, cam, S);
  if (id === 'cloud') lens(stage, t, P, S);
  if (id === 'myth') mythPanel(stage, t, P, cam);

  GW.flush(stage, {gain: 1.25, bloom: 0.38}); GC.flush(stage, {gain: 1.25, bloom: 0.38});

  // ---------------- labels (after the glow so they stay readable)
  const label = id === 'synth' ? '' : '레이더 사진';
  panelEdge(stage, '', 1);   // the strip's name stays off the poster frames (0 s and the end)
  const labA = id === 'hook' ? fadeIn(t, P.MORPH[1] - 0.1, 0.4) : id === 'close' ? fadeOut(t, P.poster - 0.4, 0.4) : 1;
  if (label && labA > 0) withAlpha(c, labA, () => tag(stage, label, PX.x0 + 16, M.PY0 + 24, {size: 26, weight: 500, align: 'left', color: PAL.muted, plateA: 0.75}));
  if (id === 'synth') synthLabels(stage, t, P, cam, recA);
  sceneLabels(stage, t, P, cam, sx, id, S);
}

// =====================================================================================================
// SCENE EXTRAS
// =====================================================================================================
function originExtras(stage, t, P, cam, sx) {
  const c = stage.ctx;
  // s04: the antenna face is the "opening"
  const oa = win(t, P.open4 - 0.2, P.y5 - 0.4, 0.4);
  if (oa > 0) withAlpha(c, oa, () => { const hw = ANT0 / 2 + 10; c.setLineDash([4, 5]); rect(c, sx - hw, M.OY + 10, 2 * hw, 26, 6, null, rgba(PAL.hot, 0.9), 1.8); c.setLineDash([]); });
  // s05: a moving radar hears the same ship from several places
  const wa = win(t, P.move5 - 0.2, P.sc.origin.end - 0.3, 0.4);
  if (wa > 0) {
    const tgt = P.originTarget ??= P.SHIPS.reduce((b, s) => (Math.abs(s.x - (P.xs(P.move5) + 0.9)) < Math.abs(b.x - (P.xs(P.move5) + 0.9)) ? s : b));
    const X = SX(cam, tgt.x);
    [0, 1.1, 2.2, 3.3].forEach((dt, i) => {
      const te = P.move5 + dt; if (t < te) return;
      const gx = SX(cam, P.xs(te)), la = wa * fadeIn(t, te, 0.3);
      ghostAntenna(c, gx, M.OY, 60, la);
      line(c, [[X, M.SURF - 18], [gx, M.OY + 30]], rgba(PAL.cool, 0.55 * la), 1.5, {dash: [3, 7]});
    });
    const ra = wa * fadeIn(t, P.sep5, 0.4);
    if (ra > 0) withAlpha(c, ra, () => ring(c, X, M.SURF - 10, 34, rgba(PAL.coolHi, 0.85), 2));
  }
}
function rangeExtras(stage, t, P, cam, sx) {
  const c = stage.ctx, r = P.r, X = sx - 300, y0 = M.OY + 27, y1 = M.SURF, Y = km => lerp(y0, y1, km / 600);
  const a = fadeIn(t, P.sc.range.start + 0.8, 0.5) * fadeOut(t, P.sc.range.end - 0.3, 0.4);
  if (a <= 0) return;
  withAlpha(c, a, () => {
    line(c, [[X, y0], [X, y1]], rgba('#6FAFC4', 0.6), 1.5);
    for (const km of [0, 200, 400, 600]) { line(c, [[X - 10, Y(km)], [X + 10, Y(km)]], rgba('#6FAFC4', 0.8), 1.5); stage.text(km === 600 ? '600 km' : String(km), X - 18, Y(km), {role: 'body', weight: 500, size: 28, color: PAL.muted, align: 'right'}); }
    for (const yy of [y0, y1]) line(c, [[X + 10, yy], [sx - 70, yy]], rgba('#6FAFC4', 0.22), 1.2, {dash: [2, 7]});
    // the ruler follows the wavefront: warm going down, cool coming back
    const q = (t - r.te) / (r.th - r.te);
    if (q >= 0 && q <= 2) {
      const down = q <= 1, yy = down ? lerp(y0, y1, q) : lerp(y1, y0, q - 1), col = down ? PAL.warm : PAL.cool;
      c.beginPath(); c.moveTo(X + 12, yy); c.lineTo(X + 26, yy - 8); c.lineTo(X + 26, yy + 8); c.closePath(); c.fillStyle = col; c.fill();
      line(c, [[X, down ? y0 : y1], [X, yy]], rgba(col, 0.9), 3);
    }
  });
}
// ---- beam scene: the picture row of the two ships (A, B), smeared over the footprint of the last echo
function beamPanel(stage, t, P, cam, S) {
  const T = T1(), rets = P.beamPulses.map(te => te + 2 * T).filter(x => x <= t);
  if (!rets.length) return;
  const last = rets[rets.length - 1], fw = M.foot(S.Lbeam(last - 2 * T)), amp = fadeIn(t, rets[0], 0.15) * (1 - smooth((t - P.go - 0.6) / 0.8));
  const flash = 1 + 0.8 * Math.exp(-(t - last) / 0.2);
  if (fw * cam.k < 8) { for (const x of [P.A, P.B]) GC.splat(SX(cam, x), PYc(6), 5, COOL, 1.4 * amp * flash); }
  else smearRow(GC, cam, [P.A, P.B], fw, 6, amp * flash);
}
// ---- synth scene: echo record (curves) and the picture row
function recordPanel(stage, t, P, cam, list, a) {
  const c = stage.ctx;
  clipPanel(c, () => withAlpha(c, a, () => {
    c.fillStyle = '#020D13'; c.fillRect(PX.x0, M.PY0, PX.x1 - PX.x0, M.PY1 - M.PY0);
    for (let km = Math.ceil(cam.camX - 540 / cam.k); SX(cam, km) < PX.x1; km += 1) line(c, [[SX(cam, km), M.PY0], [SX(cam, km), M.PY1]], rgba('#6FAFC4', 0.07), 1);
    line(c, [[PX.x0, ROW - 24], [PX.x1, ROW - 24]], rgba('#6FAFC4', 0.3), 1.2, {dash: [3, 7]});
  }));
  const f1 = P.f1, f2 = P.f2;
  let n = 0;
  for (const p of P.synth) {
    if (t < p.tr) continue;
    for (const e of p.echoes) {
      n++;
      const w = Math.abs(e.u) / (M.FOOT / 2), p1 = smooth((t - f1 - 0.5 * w) / 1.1), p2 = smooth((t - f2 - 0.45 * w) / 1.2);
      const X = lerp(SX(cam, p.x), SX(cam, e.xt), easeInOut(p2)), Y = lerp(recY(e.d), recY(0), easeInOut(p1));
      GC.splat(X, Y, 7, COOL, a * (0.36 + 1.0 * Math.exp(-(t - p.tr) / 0.25)));
    }
  }
  // picture row: what the real 5 m antenna alone gives (smear over 3.6 km), then the focused points
  const got = P.synth.filter(p => p.tr <= t && p.echoes.length).length, done = smooth((t - f2 - 1.5) / 0.6);
  if (got) smearRow(GC, cam, [P.C, P.D].filter(x => P.synth.some(p => p.tr <= t && p.echoes.some(e => e.xt === x))), M.FOOT, (ROW - M.PY0 - 8) / (M.PY1 - M.PY0 - 16) * M.CROSS, a * 0.75 * Math.min(1, got / 8) * (1 - 0.55 * done));
  if (done > 0) for (const x of [P.C, P.D]) { GC.splat(SX(cam, x), ROW, 5, COOL, a * 2.4 * done); GC.splat(SX(cam, x), ROW, 16, COOL, a * 0.4 * done); }
  // the moment the echoes pile up: a short flash at the gathered peak
  const ga = t - (f2 + 1.3); if (ga > 0 && ga < 0.8) for (const x of [P.C, P.D]) GC.splat(SX(cam, x), recY(0), 26 + 30 * ga, COOL, a * 0.9 * Math.exp(-ga / 0.25));
  return n;
}
function synthLabels(stage, t, P, cam, a) {
  const c = stage.ctx, done = smooth((t - P.f2 - 1.5) / 0.6);
  withAlpha(c, a, () => {
    tag(stage, '메아리 기록', PX.x0 + 16, M.PY0 + 24, {size: 26, weight: 500, align: 'left', color: PAL.muted, plateA: 0.75});
    tag(stage, '사진', PX.x0 + 16, ROW, {size: 26, weight: 500, align: 'left', color: PAL.muted, plateA: 0.75});
    // same ruler: dotted lines from the two ships to their picture column
    for (const x of [P.C, P.D]) line(c, [[SX(cam, x), M.SURF + 6], [SX(cam, x), M.PY0 - 2]], rgba('#6FAFC4', 0.35), 1.5, {dash: [2, 6]});
    const ca = win(t, P.near14 - 0.2, P.comp15 - 0.2, 0.4);
    if (ca > 0) { tag(stage, '다가올 때', SX(cam, P.C - 1.25), recY(M.DMAX * 0.55) + 2, {size: 26, color: PAL.coolHi, a: ca}); tag(stage, '멀어질 때', SX(cam, P.D + 1.25), recY(M.DMAX * 0.55) + 2, {size: 26, color: PAL.coolHi, a: fadeIn(t, P.far14 - 0.1, 0.4) * ca}); }
    const sa = win(t, P.f2 + 1.6, P.sc.synth.end - 0.4, 0.4);
    if (sa > 0) tag(stage, '5 m 안테나만', SX(cam, P.D + 1.6), ROW - 2, {size: 26, align: 'left', color: PAL.muted, a: sa * 0.95});
  });
  // the synthetic antenna on the orbit: a bracket over the ghost positions that saw ship C
  const ba = win(t, P.syn16 - 0.2, P.sc.synth.end - 0.4, 0.4);
  if (ba > 0) withAlpha(c, ba, () => {
    const x0 = SX(cam, P.C - M.FOOT / 2), x1 = SX(cam, P.C + M.FOOT / 2), y = M.OY + 64;
    line(c, [[x0, y], [x1, y]], PAL.coolHi, 2); for (const x of [x0, x1]) line(c, [[x, y - 12], [x, y + 12]], PAL.coolHi, 2);
    tag(stage, '합성 안테나 3.6 km', (x0 + x1) / 2, y + 36, {size: 30, color: PAL.coolHi});
  });
}
// ---- cloud scene: a magnifier on the cloud deck
const LENS = {x: 300, y: 560, r: 168, spot: [300, 818]};
const DROPS = (() => { const out = []; for (let i = 0; i < 6; i++) out.push([16 + i * 24 + (i % 2) * 4, -30 + (i % 3) * 34 + 6 * Math.sin(i * 2.1)]); for (const [x, y] of [[-120, -90], [-95, 40], [-70, 110], [-40, -130], [-20, 70], [-140, 10], [60, 120], [130, 60], [100, -110], [140, -40], [-60, -40]]) out.push([x, y]); return out; })();
function lens(stage, t, P, S) {
  const a = S.lens(t); if (a <= 0) return;
  const c = stage.ctx, {x: LX, y: LY, spot} = LENS, R = LENS.r * easeOut(a);
  withAlpha(c, Math.min(1, a * 1.4), () => {
    // leader to the cloud
    ring(c, spot[0], spot[1], 16, rgba('#DCE7EA', 0.8), 1.8);
    line(c, [[spot[0] - 12, spot[1] - 10], [LX - R * 0.55, LY + R * 0.83]], rgba('#DCE7EA', 0.45), 1.3);
    line(c, [[spot[0] + 12, spot[1] - 10], [LX + R * 0.55, LY + R * 0.83]], rgba('#DCE7EA', 0.45), 1.3);
    c.save(); c.beginPath(); c.arc(LX, LY, R, 0, TAU); c.clip();
    c.fillStyle = '#081C25'; c.fillRect(LX - R, LY - R, 2 * R, 2 * R);
    // droplets: matte water bodies
    for (const [dx, dy] of DROPS) { const X = LX + dx, Y = LY + dy, g = c.createRadialGradient(X - 2, Y - 2, 1, X, Y, 8); g.addColorStop(0, '#B9D3DC'); g.addColorStop(1, '#4F7280'); circle(c, X, Y, 7, g); }
    // radar wave: long sine (3 cm) travelling down through the droplets, unchanged
    const wa = fadeIn(t, P.drop18 + 0.2, 0.5);
    if (wa > 0) {
      const ph = (t - P.drop18) * 150, pts = [];
      for (let y = LY - LENS.r; y <= LY + LENS.r; y += 3) pts.push([LX - 60 + 30 * Math.sin(TAU * (y - LY - ph) / 210), y]);
      line(c, pts, rgba(PAL.warm, 0.22 * wa), 10); line(c, pts, rgba(PAL.hot, 0.9 * wa), 2.6);
      // one wavelength bracket
      const ba = fadeIn(t, P.cm18 - 0.2, 0.4) * wa, yb = LY - 105;
      if (ba > 0) withAlpha(c, ba, () => { line(c, [[LX - 112, yb], [LX - 112, yb + 210]], PAL.hot, 2); for (const yy of [yb, yb + 210]) line(c, [[LX - 120, yy], [LX - 104, yy]], PAL.hot, 2); });
    }
    // visible light: short wiggles that scatter at the droplets
    const va = fadeIn(t, P.vis19 - 0.1, 0.4);
    if (va > 0) for (let i = 0; i < 6; i++) {
      const [ddx, ddy] = DROPS[i], x = LX + ddx, yHit = LY + ddy - 8, period = 1.5, ph = ((t - P.vis19 + i * 0.27) % period + period) % period, yTop = LY - LENS.r;
      const yFront = yTop + ph * 260;
      const down = []; for (let y = yTop; y <= Math.min(yFront, yHit); y += 2) down.push([x + 3.5 * Math.sin(TAU * y / 12), y]);
      if (down.length > 1) line(c, down, rgba(PAL.light, 0.85 * va), 1.8);
      if (yFront > yHit) { const s = (yFront - yHit) / 260;
        for (let j = 0; j < 4; j++) { const ang = TAU * rand(i * 7.1 + j * 3.3), L = 26 + 60 * s, seg = [];
          for (let q = 0; q <= 1.001; q += 0.1) seg.push([x + Math.cos(ang) * (10 + L * q) + 2.5 * Math.sin(q * 9) * -Math.sin(ang), yHit + Math.sin(ang) * (10 + L * q) + 2.5 * Math.sin(q * 9) * Math.cos(ang)]);
          line(c, seg, rgba(PAL.light, 0.75 * va * (1 - s)), 1.5); }
      }
    }
    c.restore();
    ring(c, LX, LY, R, rgba('#DCE7EA', 0.85), 2.5);
  });
}
// ---- myth: an oblique look at smooth sea and a ship
const lerp2 = (a, b, q) => [lerp(a[0], b[0], q), lerp(a[1], b[1], q)];
function mythGeom(P, cam, te) {
  const S0 = [SX(cam, P.xs(te)), M.OY + 27], xc = SX(cam, P.E) - 30;
  return {S0, tgt: u => [xc + u * 170, M.SURF], T: 0.5};
}
function mythWorld(stage, t, P, cam, sx) {
  const c = stage.ctx, shipX = SX(cam, P.E);
  for (const te of P.myth) {
    const {S0, tgt, T} = mythGeom(P, cam, te), q = (t - te) / T;
    if (q < 0 || q > 2.4) continue;
    for (let u = -1; u <= 1.001; u += 0.1) {
      const [tx, ty] = tgt(u), onShip = Math.abs(tx - shipX) < 30 * shipScale(cam);
      if (q <= 1) GW.splat(lerp(S0[0], tx, q), lerp(S0[1], ty, q), 8, WARM, 0.95 * (1 - 0.4 * u * u));
      else if (!onShip) { const k = q - 1, x = tx + (tx - S0[0]) * k, y = ty - (ty - S0[1]) * k; if (y > M.OY - 40) GW.splat(x, y, 8, WARM, 0.8 * Math.exp(-k * 1.2) * (1 - 0.4 * u * u)); }
    }
    if (q > 1 && q < 2.05) { const k = q - 1; for (let u = -1; u <= 1.001; u += 0.34) GC.splat(lerp(shipX, sx, k) + u * lerp(26, 10, k), lerp(M.SURF - 16, M.OY + 30, k), 8, COOL, 1.15); }
  }
  // guide paths (same geometry as the pulses): in to the smooth sea, mirrored away; in to the ship, straight back
  const ga = fadeIn(t, P.sc.myth.start + 0.6, 0.6) * fadeOut(t, P.sc.myth.end - 0.3, 0.3), S0 = [sx, M.OY + 27], Ps = [shipX - 170, M.SURF];
  if (ga > 0) withAlpha(c, ga, () => {
    line(c, [S0, Ps], rgba(PAL.warm, 0.35), 1.6, {dash: [4, 8]});
    const k = 1.15, R1 = [Ps[0] + (Ps[0] - S0[0]) * k, Ps[1] - (Ps[1] - S0[1]) * k];
    const ra = fadeIn(t, P.sea23 - 0.2, 0.5); if (ra > 0) withAlpha(c, ra, () => { line(c, [Ps, R1], rgba(PAL.warm, 0.6), 2, {dash: [4, 8]}); arrow(c, lerp2(Ps, R1, 0.55), lerp2(Ps, R1, 0.62), rgba(PAL.warm, 0.9), 2.5, {head: 14}); });
    const sa = fadeIn(t, P.ship23 - 0.2, 0.5); if (sa > 0) withAlpha(c, sa, () => { line(c, [[shipX, M.SURF - 20], S0], rgba(PAL.cool, 0.6), 2, {dash: [4, 8]}); });
  });
  // dotted tie from the ship to its pixel (same ruler)
  line(c, [[shipX, M.SURF + 6], [shipX, M.PY0 - 2]], rgba('#6FAFC4', 0.35), 1.5, {dash: [2, 6]});
}
function mythPanel(stage, t, P, cam) {
  const X = SX(cam, P.E), Y = PYc(6);
  for (const te of P.myth) { const a = t - (te + 2 * 0.5); if (a >= 0 && a < 0.8) GC.splat(X, Y, 16, COOL, 0.9 * Math.exp(-a / 0.25)); }
}

// =====================================================================================================
// LABELS AND BIG NUMBERS (one big number at a time)
// =====================================================================================================
function sceneLabels(stage, t, P, cam, sx, id, S) {
  const c = stage.ctx, SC = P.sc;
  if (id === 'hook') {
    const sa = win(t, P.ships2 - 0.1, P.ant3 - 0.3, 0.4);
    if (sa > 0) { let n = 0; for (const s of P.SHIPS) { const X = SX(cam, s.x); if (s.x < P.xs(t) - M.FOOT / 2 - 0.1 && X > PX.x0 + 20 && X < PX.x1 - 20 && n < 6) { n++; withAlpha(c, sa * fadeIn(t, P.ships2 + n * 0.12, 0.3), () => ring(c, X, PYc(s.y), 15, rgba(PAL.coolHi, 0.9), 2)); } } }
    const aa = win(t, P.ant3 - 0.2, SC.hook.end - 0.2, 0.4);
    if (aa > 0) tag(stage, '안테나 몇 m', sx + ANT0 / 2 + 16, M.OY + 24, {size: 28, align: 'left', color: PAL.hot, a: aa});
    const ba = win(t, P.blur3 - 0.1, SC.hook.end - 0.1, 0.4);
    if (ba > 0) tag(stage, '안테나 크기만큼 흐리게', 540, M.PY0 - 22, {size: 28, color: PAL.ink, a: ba});
  }
  if (id === 'origin') {
    const ca = win(t, P.gae4 - 0.2, P.y5 - 0.3, 0.4);
    if (ca > 0) withAlpha(c, ca, () => {
      rect(c, 92, 540, 360, 180, 14, rgba('#03141C', 0.86), rgba(PAL.warm, 0.7), 1.5);
      stage.text('開', 182, 610, {role: 'display', weight: 700, size: 96, color: PAL.ink, align: 'center'});
      stage.text('口', 362, 610, {role: 'display', weight: 700, size: 96, color: PAL.ink, align: 'center'});
      stage.text('열 개', 182, 688, {role: 'body', weight: 500, size: 30, color: PAL.muted, align: 'center', alpha: fadeIn(t, P.open4 - 0.1, 0.3)});
      stage.text('입 구', 362, 688, {role: 'body', weight: 500, size: 30, color: PAL.muted, align: 'center', alpha: fadeIn(t, P.open4 + 0.3, 0.3)});
    });
    const ta = win(t, P.ant4 - 0.2, P.y5 - 0.3, 0.4);
    if (ta > 0) tag(stage, '안테나의 입', sx + ANT0 / 2 + 22, M.OY + 24, {size: 28, align: 'left', color: PAL.hot, a: ta});
    const ya = win(t, P.y5 - 0.1, SC.origin.end - 0.3, 0.4);
    if (ya > 0) bigNum(stage, '1951', '', 92, 650, t, P.y5, ya, {align: 'left', sub: '칼 와일리'});
  }
  if (id === 'range') {
    const r = P.r, a = fadeIn(t, r.te - 0.3, 0.4) * fadeOut(t, SC.range.end - 0.3, 0.3);
    if (a > 0) {
      const done = t >= r.tr, v = clamp((t - r.te) / M.slowRange, 0, (r.tr - r.te) / M.slowRange);
      bigNum(stage, done ? '0.004' : v.toFixed(4), '초', 960, 650, t, done ? r.tr : r.te, a, {sub: done ? '왕복' : '', size: 112});
    }
  }
  if (id === 'beam') {
    const ma = win(t, P.once8 - 0.1, P.narrow9 - 0.2, 0.4);
    if (ma > 0) tag(stage, '한 덩어리', SX(cam, P.xb), PYc(6) - 46, {size: 28, color: PAL.coolHi, a: ma});
    const la = win(t, P.long9 + 0.6, P.m10 - 0.7, 0.4);
    const split = P.splitT ??= P.beamPulses.map(te => te + 2 * T1()).find(tr => tr - 2 * T1() >= P.long9 + 1.3) ?? P.nar9b;
    if (la > 0) { tag(stage, '안테나 4배', sx, M.OY - 52, {size: 28, color: PAL.hot, a: la}); tag(stage, '둘로 갈림', SX(cam, P.xb), PYc(6) - 46, {size: 28, color: PAL.coolHi, a: la * fadeIn(t, split, 0.3)}); }
    const fa = win(t, P.m10 - 0.1, P.one11 - 0.3, 0.4);
    if (fa > 0) {
      tag(stage, '5 m', sx - ANT0 / 2 - 14, M.OY + 24, {size: 28, align: 'right', color: PAL.hot, a: fa});
      tag(stage, '3 cm 전파', sx + 150, 690, {size: 28, align: 'left', color: PAL.warm, a: fa * fadeIn(t, P.cm10 - 0.1, 0.3)});
      const da = fa * fadeIn(t, P.foot10 - 0.2, 0.3), hw = M.FOOT * cam.k / 2, y = M.SURF - 64;
      if (da > 0) withAlpha(c, da, () => { line(c, [[sx - hw, y], [sx + hw, y]], PAL.hot, 2); for (const x of [sx - hw, sx + hw]) line(c, [[x, y - 12], [x, y + 12]], PAL.hot, 2); });
      bigNum(stage, '3.6', 'km', 960, 650, t, P.foot10, fa);
    }
    const na = win(t, P.need11 - 0.2, P.move12 - 0.2, 0.4);
    if (na > 0) { bigNum(stage, '18', 'km', 960, 650, t, P.need11, na, {sub: '1 m를 가르는 안테나'}); }
  }
  if (id === 'synth') {
    const a1 = win(t, P.span13 - 0.2, P.near14 - 0.3, 0.4);
    if (a1 > 0) bigNum(stage, '3.6', 'km', 960, 650, t, P.span13, a1, {sub: '같은 배를 비추는 구간'});
    const a2 = fadeIn(t, P.res16 - 0.1, 0.4) * fadeOut(t, SC.synth.end - 0.4, 0.3);
    if (a2 > 0) bigNum(stage, '2.5', 'm', 960, 650, t, P.res16, a2, {sub: '얼룩 3.6 km → 점'});
  }
  if (id === 'cloud') {
    const na = win(t, P.self17 - 0.2, P.drop18 - 0.6, 0.4);
    if (na > 0) tag(stage, '햇빛 없음, 전파로 비춤', 540, M.SURF - 40, {size: 28, color: PAL.warm, a: na});
    const la = S.lens(t);
    if (la > 0.6) {
      tag(stage, '물방울', LENS.x + DROPS[9][0] + 14, LENS.y + DROPS[9][1] - 24, {size: 26, align: 'left', color: '#C9DCE2', a: fadeIn(t, P.drop18 + 0.3, 0.4) * fadeOut(t, P.vis19 - 0.3, 0.3)});
      tag(stage, '3 cm', LENS.x - 124, LENS.y - 2, {size: 26, align: 'right', color: PAL.hot, a: fadeIn(t, P.cm18 - 0.1, 0.4)});
      tag(stage, '가시광선', LENS.x + 70, LENS.y - LENS.r + 40, {size: 26, color: PAL.light, a: fadeIn(t, P.vis19, 0.4)});
    }
    const xa = fadeIn(t, P.x18 - 0.1, 0.3) * fadeOut(t, SC.cloud.end - 0.3, 0.3);
    if (xa > 0) bigNum(stage, '3,000', '배', 1000, 660, t, P.x18, xa, {sub: '물방울보다 긴 파장'});
  }
  if (id === 'korea') {
    const a = fadeOut(t, SC.korea.end - 0.3, 0.3);
    tag(stage, '아리랑 5호', sx, M.OY - 56, {size: 30, color: PAL.ink, a: a * fadeIn(t, P.name20 - 0.2, 0.4)});
    const ya = a * fadeIn(t, P.alt20 - 0.2, 0.4), X = sx - 230, y0 = M.OY + 27, y1 = M.SURF;
    if (ya > 0) withAlpha(c, ya, () => { line(c, [[X, y0], [X, y1]], rgba('#6FAFC4', 0.7), 1.5); for (const y of [y0, y1]) line(c, [[X - 10, y], [X + 10, y]], rgba('#6FAFC4', 0.8), 1.5); tag(stage, '550 km', X - 12, (y0 + y1) / 2, {size: 28, align: 'right', color: PAL.ink}); });
    const y2 = win(t, P.y20 - 0.1, P.day21 - 0.3, 0.3);
    if (y2 > 0) bigNum(stage, '2013', '', 92, 650, t, P.y20, y2 * a, {align: 'left'});
    const oa = a * fadeIn(t, P.oil21 - 0.2, 0.4);
    if (oa > 0) { const X2 = SX(cam, P.oilX); withAlpha(c, oa, () => ring(c, X2, PYc(6.9), 58, rgba(PAL.coolHi, 0.6), 1.5)); tag(stage, '기름 유출', X2, PYc(6.9) - 78, {size: 28, color: PAL.coolHi, a: oa}); }
    const ra = a * fadeIn(t, P.res21 - 0.1, 0.3);
    if (ra > 0) bigNum(stage, '1', 'm', 92, 650, t, P.res21, ra, {align: 'left', sub: '가장 선명할 때'});
  }
  if (id === 'myth') {
    const shipX = SX(cam, P.E), a = fadeOut(t, SC.myth.end - 0.3, 0.3);
    const qa = a * win(t, P.cam22 - 0.2, P.no23, 0.3);
    if (qa > 0) tag(stage, '빛의 밝기?', shipX, PYc(6) - 48, {size: 28, color: PAL.ink, a: qa});
    const sa = a * fadeIn(t, P.sea23 - 0.1, 0.4);
    if (sa > 0) { tag(stage, '매끈한 바다', shipX - 250, M.SURF + 30, {size: 28, color: PAL.warm, a: sa}); tag(stage, '튕겨 나감', shipX - 360, M.SURF - 330, {size: 28, color: PAL.warm, a: a * fadeIn(t, P.bounce23, 0.4)}); tag(stage, '어둡게', shipX - 250, PYc(6) + 4, {size: 28, color: PAL.muted, a: sa}); }
    const ba = a * fadeIn(t, P.ship23 - 0.1, 0.4);
    if (ba > 0) { tag(stage, '배', shipX + 70, M.SURF - 40, {size: 28, color: PAL.coolHi, a: ba}); tag(stage, '밝게', shipX + 80, PYc(6) + 4, {size: 28, color: PAL.coolHi, a: ba}); }
    const ea = a * win(t, P.echo23 - 0.1, P.sea23 - 0.2, 0.3);
    if (ea > 0) tag(stage, '밝기 = 메아리의 세기', 540, M.PY0 - 22, {size: 28, color: PAL.coolHi, a: ea});
  }
}

// =====================================================================================================
// HEADER, POSTER, OVERLAYS
// =====================================================================================================
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, '오늘의 주제', '구름 낀 밤, 위성 사진?']];
  if (id === 'origin') return [[-Infinity, '기원 · 이름', '開口 = 열린 입, 안테나의 크기'], [at('s05'), '1951 · 칼 와일리', '움직이며 받은 메아리']];
  if (id === 'range') return [[-Infinity, '메아리 · 실제 0.004초를 1,000배 느리게', '돌아오는 시간이 곧 거리']];
  if (id === 'beam') return [[-Infinity, '본질 · 높이 축소, 위성 크기 과장', '빔이 좁아야 둘로 갈린다'], [at('s11'), '본질', '1 m를 가르려면 18 km'], [at('s12'), '본질', '움직이며 이어 붙인다']];
  if (id === 'synth') return [[-Infinity, '메커니즘 ① · 25배 느리게, 메아리 일부만', '같은 배를 여러 자리에서'], [at('s15'), '메커니즘 ① · 곡선의 휨 과장', '거리 차이만큼 맞춰 더하기'], [at('s16'), '메커니즘 ①', '3.6 km짜리 안테나']];
  if (id === 'cloud') return [[-Infinity, '메커니즘 ② · 크기 비 줄여 그림', '밤과 구름을 지나는 전파']];
  if (id === 'korea') return [[-Infinity, '사례', '우리나라 첫 위성 레이더']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '사진의 밝기는 빛일까?'], [P.no23 - 0.2, '오해 바로잡기', '밝기는 메아리의 세기']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 880, ...so}));
}
const POSTER = {q: '구름 낀 밤, 위성 사진?', a: '메아리로 찍는다', y: 742, y2: 878};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 880, 104); AS ||= fit(POSTER.a, 860, 150);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 56, q), tr = lerp(-0.03, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, 640, 0, 975); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.3, 'rgba(0,10,16,0.55)'); g.addColorStop(0.75, 'rgba(0,10,16,0.55)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, 640, W, 335); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    withAlpha(c, 1 - q, () => stage.text(POSTER.a, 540, lerp(POSTER.y2, 292, q), {role: 'display', weight: 700, size: lerp(AS, 34, q), color: PAL.warm, align: 'center', tracking: tr * AS, shadow: sh, shadowBlur: 28}));
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1376, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0.6)'); c.fillStyle = g; c.fillRect(0, 1376, W, 544); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < P.MORPH[1]) { posterTitle(stage, easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    captionBand(stage.ctx); head(stage, '한 줄로', '움직이며 이어 붙인 거대한 안테나', smooth(ctx.scene.p / 0.08), smooth(ctx.scene.p / 0.08) * fadeOut(t, P.poster - 0.3, 0.3)); progressBar(stage, t, ctx.tl.duration); return;
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

let staleWarned = false;
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.synth.length}/${P.routine.length}/${P.C.toFixed(3)}`; }
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/sar/scenes.mjs --emit-sound'); }
const one = (stage, t, p, ctx) => { checkSoundTable(ctx); drawFrame(stage, t, ctx); };
export const scenes = {hook: one, origin: one, range: one, beam: one, synth: one, cloud: one, korea: one, myth: one, close: one};

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), S = sched(P), SC = P.sc, r = (x, d = 3) => +x.toFixed(d), ev = [], T = T1();
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.08, gain_db: gain, click: 0}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -36) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  /** many short layers in one event: [[t, kind, params], …] */
  const train = (id, items, gain, means) => { if (!items.length) return; const T0 = Math.min(...items.map(x => x[0]));
    ev.push({id, at: r(T0, 4), kind: 'custom', params: {gain_db: gain, layers: items.map(([tt, kind, params]) => ({kind, offset: r(tt - T0, 4), params}))}, means}); };
  const pulseTick = f => ({freq: f, decay: 0.05, click: 0, gain_db: 0});
  const echoTone = (f, g = 0) => ({freq: f, dur: 0.16, harmonics: [1, 0.2], attack: 0.01, decay: 0.08, sustain: 0.3, release: 0.08, gain_db: g});
  // ---- hook: the poster, then routine pulses (sent: low tick; echo back: soft higher tone)
  swell('poster', 0.05, [110, 165], '첫 화면(썸네일): 구름 위 위성과 만들어지는 레이더 사진', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  const routineIn = (a, b) => P.routine.filter(te => te >= Math.max(0, a) && te < b);
  const routine = (id, a, b, means) => { const L = []; for (const te of routineIn(a, b)) { L.push([te, 'tick', pulseTick(196)]); if (P.SHIPS.some(s => Math.abs(s.x - P.xs(te)) <= M.FOOT / 2)) L.push([te + 2 * T, 'tone', echoTone(294, -4)]); } train(id, L, -40, means); };
  routine('pulses_hook', 0, SC.origin.start + 0.2, '보낸 전파(낮은 틱)와 배에서 돌아온 메아리(부드러운 음). 실제로는 1초에 수천 번');
  swell('blur', P.blur3 - 0.1, [98, 131], '"흐려야": 사진이 안테나 크기만큼 번짐', {dur: 1.4, gain: -36});
  // ---- origin
  tick('opening', P.open4, 165, -35, '"열린 입": 안테나 면 표시', {decay: 0.12});
  routine('pulses_origin', P.wave4 - 0.1, SC.range.start, '"전파가 드나드는": 보낸 전파와 메아리');
  tick('y1951', P.y5, 147, -34, '1951 큰 숫자', {decay: 0.12});
  train('wiley_echo', [0, 1.1, 2.2, 3.3].map(dt => [P.move5 + dt, 'tone', echoTone(262 + dt * 12, 0)]), -38, '움직이는 레이더가 여러 자리에서 같은 배의 메아리를 받음');
  // ---- range (slowed 1,000×): the trip down and back as a falling then rising tone
  const rr = P.r; tick('range_shoot', rr.te, 220, -32, '"쏘고": 전파가 떠남', {decay: 0.1});
  ev.push({id: 'range_trip', at: r(rr.te + 0.05, 4), kind: 'chirp', params: {gain_db: -40, harmonics: [1, 0.3], fade: 0.03, points: [[0, 220, 0.0], [0.2, 210, 0.5], [r(rr.th - rr.te - 0.05), 150, 0.6], [r(rr.th - rr.te + 0.1), 160, 0.6], [r(rr.tr - rr.te - 0.1), 300, 0.6], [r(rr.tr - rr.te - 0.05), 300, 0.0]]}, means: '전파가 내려가고(음이 내려감) 메아리가 올라옴(음이 올라감), 1,000배 느리게'});
  tick('range_hit', rr.th, 147, -34, '전파가 바다에 닿음', {decay: 0.12});
  ev.push({id: 'range_back', at: r(rr.tr, 4), kind: 'tone', params: echoTone(330, -30), means: '메아리가 안테나에 도착: 시계가 0.004초에서 멈춤'});
  // ---- beam
  { const L = []; for (const te of P.beamPulses) { L.push([te, 'tick', pulseTick(196)]); L.push([te + 2 * T, 'tone', echoTone(262, 0)]); } train('pulses_beam', L, -38, '빔 장면의 펄스와 메아리(두 배의 메아리가 한꺼번에 돌아옴)'); }
  whoosh('antenna_long', P.long9 - 0.1, 1.4, 120, 260, '안테나가 길어지고 빔이 좁아짐');
  whoosh('antenna_back', P.m10 - 0.8, 1.0, 260, 120, '안테나가 5 m로 돌아옴');
  tick('foot', P.foot10, 131, -34, '"3.6 km" 큰 숫자와 빔 폭 표시', {decay: 0.12});
  swell('need18', P.need11, [82, 123, 165], '"18 km": 필요한 안테나가 펼쳐짐', {dur: 1.8, gain: -33});
  // ---- synth: pulse train; each echo's pitch follows the ship's distance (closer = higher)
  { const L = [];
    for (const p of S.trail) L.push([p.te, 'tick', pulseTick(196)]);
    for (const p of P.synth) { L.push([p.te, 'tick', pulseTick(196)]); for (const e of p.echoes) L.push([p.tr, 'tone', echoTone(r(330 - 110 * e.d / M.DMAX, 1), -3)]); }
    train('pulses_synth', L, -38, '움직이며 쏜 펄스(틱)와 C·D 배의 메아리(가까울수록 높은 음)'); }
  ev.push({id: 'straighten', at: r(P.f1, 4), kind: 'chirp', params: {gain_db: -38, harmonics: [1, 0.25], fade: 0.03, points: [[0, 150, 0], [0.2, 160, 0.5], [1.4, 260, 0.6], [1.6, 262, 0]]}, means: '"맞춰": 휜 곡선이 곧게 펴짐'});
  swell('focus', P.f2 + 1.5, [147, 220, 294], '"겹쳐 커집니다": 메아리가 한 점에 모여 두 배가 점으로 찍힘', {dur: 1.8, gain: -31});
  tick('synthetic', P.syn16, 165, -34, '"3.6 km짜리 안테나": 궤도 위 합성 안테나 표시', {decay: 0.12});
  tick('res', P.res16, 220, -33, '"2.5 m" 큰 숫자', {decay: 0.1});
  // ---- cloud
  routine('pulses_cloud', SC.cloud.start, SC.korea.start, '밤에도 스스로 쏘는 전파와 메아리');
  swell('lens', P.drop18 - 0.4, [131, 196], '구름 속 확대 원이 열림', {dur: 1.4, gain: -36});
  tick('x3000', P.x18, 147, -34, '"3천 배" 큰 숫자', {decay: 0.12});
  whoosh('scatter', P.scat19 - 0.2, 1.2, 420, 160, '"이리저리": 가시광선이 물방울에 흩어짐', -38);
  // ---- korea
  routine('pulses_korea', SC.korea.start, SC.myth.start, '아리랑 5호 장면의 펄스와 메아리');
  tick('y2013', P.y20, 147, -34, '2013 큰 숫자', {decay: 0.12});
  tick('alt550', P.alt20, 131, -35, '550 km 높이 표시', {decay: 0.12});
  swell('oil', P.oil21, [98, 147], '"기름": 사진 속 어두운 기름띠', {dur: 1.4, gain: -36});
  tick('res1m', P.res21, 220, -33, '"1 m" 큰 숫자', {decay: 0.1});
  // ---- myth: sea reflects away (a sweep that leaves), the ship answers (echo tone)
  { const L = []; for (const te of P.myth) { L.push([te, 'tick', pulseTick(196)]); L.push([te + 0.5, 'whoosh', {dur: 0.5, f_start: 220, f_end: 110, q: 1.6, gain_db: -2}]); L.push([te + 1.0, 'tone', echoTone(294, 0)]); } train('pulses_myth', L, -38, '비스듬히 쏜 전파: 매끈한 바다에서는 멀어지는 소리(돌아오지 않음), 배에서는 메아리'); }
  // ---- close
  routine('pulses_close', SC.close.start, P.end, '마지막 장면의 펄스와 메아리');
  swell('poster_end', P.poster, [110, 165], '포스터 구도로 돌아옴', {dur: 1.8, gain: -34});
  return ev.sort((a, b) => a.at - b.at);
}
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const events = soundEvents(tl), first = events.find(e => e.model);
  if (first !== events[0]) { const i = events.indexOf(first); events.splice(i, 1); events.unshift(first); }
  const sound = {version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 전파는 소리를 내지 않으므로 모든 소리는 화면 사건의 표시음입니다. 배경음악·배경음 없음. 모든 사건은 `node episodes/sar/scenes.mjs --emit-sound`가 scenes.mjs 머리의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 보낸 펄스 → 낮은 틱, 돌아온 메아리 → 부드러운 음(합성개구 장면에서는 배가 가까울수록 높은 음), 휜 곡선이 펴짐 → 올라가는 음, 점으로 모임 → 화음. 모든 기본음 700 Hz 아래. 패닝 없음(모노 안전). 타임라인이 바뀌면 다시 실행하세요.',
    events,
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 1) + '\n');
  const P = plan(tl);
  console.log(`events: ${events.length}; xb ${P.xb.toFixed(2)} C ${P.C.toFixed(2)} D ${P.D.toFixed(2)} E ${P.E.toFixed(2)} oil ${P.oilX.toFixed(2)}; synth pulses ${P.synth.length} (echoes ${P.synth.reduce((a, p) => a + p.echoes.length, 0)}); routine ${P.routine.length}; poster ${P.poster.toFixed(2)}`);
}
