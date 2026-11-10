// Episode 36 — "강착원반": why a star torn apart by a black hole ends up as a glowing disk.
// Shape: export {theme, scenes, overlays, background, captionLayout}; scenes.<id>(stage, t, p, ctx).
// One stage for the whole film: the orbital plane around the hole (unit = horizon radius). Scenes only move the camera
// (position, scale, tilt) and the model clock tau(t). All motion comes from model.mjs (see the notes there).
// Look (user decision 2026-11-10 "발광체가 조금씩은 있으면 좋겠어"): one filled, glowing body per scene (star → stream →
// ring → disk) in a float glow buffer, thin cool lines for the instruments, warm emitter on a dark teal ground.
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, glow, arrow, withAlpha, rect, TAU, rng,
} from '../../pipeline/render/index.mjs';
import * as M from './model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');
export const theme = {base: 'noturno', accent: '#FFB454'};
export const captionLayout = {};
const W = 1080, H = 1920;
const PAL = {ink: '#F4EBDD', warm: '#FFB454', hot: '#FFE2B0', cool: '#7FD6FF', coolDim: '#4F9FC4', muted: '#93A8AE', red: '#FF7A4D', plate: '#031C27'};
const STAR = [1.0, 0.76, 0.40], STREAM = [1.0, 0.46, 0.16], WHITE = [1.0, 0.93, 0.80];
const RAMP = [[0.80, 0.16, 0.02], [1.0, 0.42, 0.07], [1.0, 0.74, 0.36], [0.86, 0.90, 1.0]];
function ramp(u) { u = clamp(u) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(u)), f = u - i, a = RAMP[i], b = RAMP[i + 1]; return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]; }
const tempU = r => (M.tempShape(r) - 0.23) / 0.77;

// =====================================================================================================
// Time plan (shared with make_sound.mjs)
// =====================================================================================================
let PLAN = null;
export function plan(tl) {
  if (PLAN && PLAN.tl === tl) return PLAN;
  const s = id => tl.at(id), e = id => tl.at(id + ':end'), sc = id => tl.at(id), P = {tl};
  const probe = new M.Sim(); probe.advance(-10); P.tauTear = probe.tauTear;
  P.MORPH = [0.9, 1.7];
  P.diskOut = [e('s03') + 0.1, e('s03') + 1.5];                         // hook disk dissolves, the star's approach begins
  P.predict = s('s04') + 5.2;                                           // "밝은 빛이 날 것이라고"
  P.tear = s('s06') + 4.0;                                              // "버티지 못하면"
  P.dial = [s('s08') + 0.5, s('s08') + 4.3]; P.swallow = e('s08') - 1.0; P.dial2 = [s('s09') + 0.3, e('s09') - 0.6];
  P.core = s('s11'); P.amount = s('s12');
  P.tilt = [s('s14') - 0.3, s('s14') + 2.6, tl.at('disk')];
  P.blend = [tl.at('disk'), tl.at('disk') + 1.6];
  P.spiral = [s('s16') - 0.4, e('s16') + 1.0]; P.heat = s('s17');
  P.obsIn = tl.at('observe'); P.eht = s('s19') - 0.7; P.obsOut = tl.at('close');
  P.zoomIn = s('s21') - 0.4; P.poster = e('s21') - 1.3; P.end = tl.duration;
  // model clock: [video time, tau]
  P.TAU = [[P.diskOut[0], -452], [tl.at('tide'), -150], [e('s05'), -62], [P.tear, P.tauTear], [e('s06'), 6], [tl.at('whole'), 70], [tl.at('spin'), 105],
    [e('s10') + 0.4, 800], [e('s11'), 1040], [tl.at('flatten'), 1190], [e('s13'), 2400], [tl.at('disk'), 4000], [P.blend[1], 4300]];
  P.tau = t => { const T = P.TAU; if (t <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (t <= T[i][0]) return lerp(T[i - 1][1], T[i][1], (t - T[i - 1][0]) / (T[i][0] - T[i - 1][0])); return T[T.length - 1][1]; };
  const D = Math.PI / 180;
  // camera keys: time, focus (world, or 'star'), screen centre, scale (px per horizon radius), tilt
  P.CAM = [
    [0, {f: [0, 0], c: [540, 660], k: 22, inc: 62 * D}], [P.diskOut[0], {f: [0, 0], c: [540, 700], k: 24.5, inc: 62 * D}],
    [P.diskOut[1] + 0.9, {f: [0, 0], c: [860, 470], k: 12, inc: 0}], [tl.at('tide') - 0.6, {f: [0, 0], c: [860, 470], k: 12, inc: 0}],
    [tl.at('tide') + 1.8, {f: 'star', c: [560, 960], k: 50, inc: 0}], [e('s06') - 0.4, {f: 'star', c: [560, 960], k: 50, inc: 0}],
    [s('s07') + 1.3, {f: [0, 0], c: [640, 980], k: 24, inc: 0}], [tl.at('whole') - 0.5, {f: [0, 0], c: [640, 980], k: 24, inc: 0}],
    [tl.at('whole') + 0.9, {f: [0, 0], c: [540, 800], k: 24, inc: 0}], [tl.at('spin') - 0.2, {f: [0, 0], c: [540, 800], k: 24, inc: 0}],
    [tl.at('spin') + 2.4, {f: [0, 0], c: [850, 1040], k: 5, inc: 0}], [P.core - 0.6, {f: [0, 0], c: [850, 1040], k: 5, inc: 0}],
    [P.core + 2.4, {f: [0, 0], c: [700, 720], k: 11, inc: 0}], [P.amount + 2.0, {f: [0, 0], c: [640, 760], k: 17, inc: 0}],
    [tl.at('flatten') + 1.5, {f: [0, 0], c: [540, 800], k: 21, inc: 0}], [P.tilt[0], {f: [0, 0], c: [540, 800], k: 21, inc: 0}],
    [P.tilt[1], {f: [0, 0], c: [540, 800], k: 21, inc: 76 * D}], [P.tilt[2], {f: [0, 0], c: [540, 790], k: 20, inc: 38 * D}],
    [P.spiral[0], {f: [0, 0], c: [540, 790], k: 20, inc: 38 * D}], [P.heat + 1.5, {f: [0, 0], c: [540, 760], k: 27, inc: 52 * D}], [P.obsIn, {f: [0, 0], c: [540, 760], k: 29, inc: 52 * D}],
    [P.obsOut, {f: [0, 0], c: [540, 800], k: 5.5, inc: 0}], [P.zoomIn, {f: [0, 0], c: [540, 800], k: 5.5, inc: 0}],
    [P.zoomIn + 4.2, {f: [0, 0], c: [540, 660], k: 22, inc: 62 * D}], [P.end, {f: [0, 0], c: [540, 660], k: 22.6, inc: 62 * D}],
  ];
  P.tracer = 921;
  return (PLAN = P);
}

// =====================================================================================================
// Glow buffer (same technique as episodes 11 and 12: half-resolution float RGB, tone-mapped, local bloom)
// =====================================================================================================
class Glow {
  constructor(s = 0.5) {
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
    this.d = [this.w, this.h, 0, 0]; this.prev = [0, 0, 0, 0]; return this;
  }
  region(X0, Y0, X1, Y1) {
    const s = this.s, a = Math.max(0, Math.floor(X0 * s)), b = Math.max(0, Math.floor(Y0 * s)), c = Math.min(this.w, Math.ceil(X1 * s)), d = Math.min(this.h, Math.ceil(Y1 * s));
    if (c <= a || d <= b) return null;
    const D = this.d; D[0] = Math.min(D[0], a); D[1] = Math.min(D[1], b); D[2] = Math.max(D[2], c); D[3] = Math.max(D[3], d);
    return [a, b, c, d];
  }
  /** gaussian splat (screen px radius = 2σ) */
  splat(x, y, rad, col, I) {
    if (I <= 0) return; rad = Math.max(rad, 1.2);
    const r = this.region(x - rad * 1.6, y - rad * 1.6, x + rad * 1.6, y + rad * 1.6); if (!r) return;
    const s2 = 2 * (rad / 2) ** 2, {R, G, B, w} = this, inv = 1 / this.s;
    for (let by = r[1]; by < r[3]; by++) { const sy = (by + 0.5) * inv, o = by * w, dy2 = (sy - y) ** 2; for (let bx = r[0]; bx < r[2]; bx++) { const k = I * Math.exp(-(((bx + 0.5) * inv - x) ** 2 + dy2) / s2), i = o + bx; R[i] += k * col[0]; G[i] += k * col[1]; B[i] += k * col[2]; } }
  }
  flush(stage, {gain = 1.3, bloom = 0.5, alpha = 1, cross = 0.1} = {}) {
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
      sc.globalCompositeOperation = 'copy'; sc.filter = 'none'; sc.clearRect(0, 0, sm.width, sm.height);
      sc.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
      sc.filter = 'blur(5px)'; sc.drawImage(sm, 0, 0); sc.filter = 'none';
      c.globalAlpha = alpha * bloom; c.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, sm.width / q * inv, sm.height / q * inv);
    }
    c.restore();
  }
}
let GA = null, GB = null;
const bufs = () => [(GA ||= new Glow()).begin(), (GB ||= new Glow()).begin()];
const buf1 = () => (GA ||= new Glow()).begin();

// =====================================================================================================
// Camera and world drawing
// =====================================================================================================
let SIM = null, DISK = null;
const sim = () => (SIM ||= new M.Sim()), disk = () => (DISK ||= new M.Disk());
const CORE = (() => { const s = new M.Sim(), ids = []; for (let i = 0; i < M.N && ids.length < 260; i++) if (Math.hypot(s.ox[i], s.oy[i], s.oz[i]) < 0.45 * M.R_STAR) ids.push(i); return ids; })();
function starFocus(S) {
  if (S.rigid || S.tau < S.tauTear + 0.5) return [S.centre[0], S.centre[1]];
  let x = 0, y = 0; for (const i of CORE) { x += S.x[i]; y += S.y[i]; } return [x / CORE.length, y / CORE.length];
}
function camAt(P, t, S) {
  const K = P.CAM; let i = 1; while (i < K.length - 1 && t > K[i][0]) i++;
  const a = K[i - 1], b = K[i], q = easeInOut((t - a[0]) / Math.max(1e-6, b[0] - a[0])), sf = (a[1].f === 'star' || b[1].f === 'star') ? starFocus(S) : null;
  const fa = a[1].f === 'star' ? sf : a[1].f, fb = b[1].f === 'star' ? sf : b[1].f;
  const cam = {fx: lerp(fa[0], fb[0], q), fy: lerp(fa[1], fb[1], q), cx: lerp(a[1].c[0], b[1].c[0], q), cy: lerp(a[1].c[1], b[1].c[1], q),
    k: Math.exp(lerp(Math.log(a[1].k), Math.log(b[1].k), q)), inc: lerp(a[1].inc, b[1].inc, q)};
  cam.ci = Math.cos(cam.inc); cam.si = Math.sin(cam.inc);
  cam.P = (x, y, z = 0) => { const X = x - cam.fx, Y = y - cam.fy; return [cam.cx + cam.k * X, cam.cy - cam.k * (Y * cam.ci + z * cam.si), y * cam.si - z * cam.ci]; };   // [sx, sy, depth relative to the hole (> 0 = behind)]
  cam.hole = cam.P(0, 0, 0);
  return cam;
}
const onScreen = (x, y, m = 40) => x > -m && x < W + m && y > 120 && y < 1560;

function drawHole(stage, cam, a = 1) {
  const c = stage.ctx, [x, y] = cam.hole, r = cam.k * M.RS;
  withAlpha(c, a, () => {
    circle(c, x, y, r * 0.99, '#00070B');
    ring(c, x, y, Math.max(r, 3.5) + 1.2, rgba(PAL.coolDim, r < 14 ? 0.7 : 0.38), r < 14 ? 2 : 1.5);
  });
}

/** the torn star: particles of the Sim, split into behind / in front of the hole */
function drawSim(stage, cam, S, o = {}) {
  const a = o.alpha ?? 1; if (a <= 0.003) return;
  const [gb, gf] = bufs(), k = cam.k, rs = clamp(k * 0.105, 1.25, 4.6), free = !S.rigid, age = free ? S.tau - S.tauTear : 0;
  const cool = smooth(age / 420), base = (o.gain ?? 1) * clamp(0.34 * (4.2 / rs) ** 0.75, 0.22, 0.95);
  const col0 = [lerp(STAR[0], STREAM[0], cool), lerp(STAR[1], STREAM[1], cool), lerp(STAR[2], STREAM[2], cool)];
  // the star's body before (and just after) it is torn: a soft filled ball under the particles
  const body = 1 - smooth((age - 2) / 26);
  if (body > 0.01) { const f = starFocus(S), p = cam.P(f[0], f[1], 0), R = k * M.R_STAR; gf.splat(p[0], p[1], R * 1.5, [1.0, 0.5, 0.13], 0.6 * body); gf.splat(p[0], p[1], R * 0.9, STAR, 0.3 * body); gf.splat(p[0], p[1], R * 3.4, STREAM, 0.1 * body); }
  let nB = 0; for (let i = 0; i < M.N; i++) if (S.state[i] === 1 || S.state[i] === 2) nB++;
  const soft = clamp(k * 0.7, 3.2, 14), softI = 0.05 * clamp(k / 5, 1, 4.5) ** 1.25 * (o.gain ?? 1), grainK = 1 - 0.88 * body, softR = clamp(k * 0.62, 4, 18), softRI = 0.2 * clamp(900 / Math.max(nB, 60), 0.5, 1.7) ** 0.6, young = S.rigid ? 1 : 0.07 + 0.93 * smooth((age - 15) / 400);
  for (let i = 0; i < M.N; i++) {
    const st = S.state[i]; if (st === 3) continue;
    const x = S.x[i], y = S.y[i], p = cam.P(x, y, S.z[i]); if (!onScreen(p[0], p[1])) continue;
    let col = col0, I = base * young;
    if (st === 0) { const r = Math.hypot(x, y); I *= lerp(1, clamp(1.25 - r / 190, 0.25, 1), cool); }
    else {
      const r = Math.hypot(x, y), h = S.heat[i], d = ramp(tempU(r) * 0.9 + 0.05);
      col = [lerp(d[0], WHITE[0], h), lerp(d[1], WHITE[1], h), lerp(d[2], WHITE[2], h)]; I = base * (1.15 + 0.9 * h);
    }
    const g = p[2] > 0 && cam.si > 0.05 ? gb : gf;
    g.splat(p[0], p[1], rs * (st ? 1.15 : 1), col, I * grainK * (0.45 + 1.1 * S.seed[i]));
    if (st) g.splat(p[0], p[1], softR, col, softRI * (1 + 0.4 * S.heat[i]));
    else if (i % 2 === 0 && body < 0.99) g.splat(p[0], p[1], soft, col, softI * (1 - body) * I / base);
  }
  gb.flush(stage, {alpha: a, bloom: 0.5, cross: 0.05}); drawHole(stage, cam, o.hole ?? 1); gf.flush(stage, {alpha: a, bloom: 0.5, cross: 0.05});
}

/** the steady disk: a smooth filled body (per pixel) plus circling grains; o.beam = Doppler brightening of the approaching side */
function drawDisk(stage, cam, Dk, o = {}) {
  const a = o.alpha ?? 1; if (a <= 0.003) return;
  const [gb, gf] = bufs(), k = cam.k, [hx, hy] = cam.hole, beam = o.beam ?? 0.26, hot = o.hot ?? 0, Rout = M.DISK_OUT;
  const vIn = M.vCirc(M.R_ISCO), boost = (r, cph) => (1 - beam * cam.si * cph * Math.min(1, M.vCirc(Math.max(r, 3)) / vIn)) ** 3;
  const prof = r => (r < M.R_ISCO ? smooth((r - 2.6) / 0.4) : (r / M.R_ISCO) ** -0.8 * (1 - smooth((r - Rout * 0.7) / (Rout * 0.32))));
  // filled body
  for (const g of [gb, gf]) {
    const reg = g.region(hx - k * Rout, hy - k * Rout * Math.max(cam.ci, 0.02) - 4, hx + k * Rout, hy + k * Rout * Math.max(cam.ci, 0.02) + 4); if (!reg) continue;
    const inv = 1 / g.s, ci = Math.max(cam.ci, 0.03), {R, G, B, w} = g;
    for (let by = reg[1]; by < reg[3]; by++) {
      const Y = -((by + 0.5) * inv - hy) / (k * ci); if ((Y > 0) !== (g === gb) && cam.si > 0.05) continue; if (cam.si <= 0.05 && g === gb) continue;
      for (let bx = reg[0]; bx < reg[2]; bx++) {
        const X = ((bx + 0.5) * inv - hx) / k, r = Math.hypot(X, Y); if (r > Rout || r < 2.6) continue;
        const I = 1.25 * prof(r) * boost(r, X / r) * (0.6 + 0.4 * ci); if (I < 0.004) continue;
        const col = ramp(tempU(r) * (0.82 + 0.3 * hot)), i = by * w + bx; R[i] += I * col[0]; G[i] += I * col[1]; B[i] += I * col[2];
      }
    }
  }
  // grains
  const rs = clamp(k * 0.085, 1.25, 3.4);
  for (let i = 0; i < M.ND; i++) {
    const r = Dk.r[i], ph = Dk.ph[i], cph = Math.cos(ph), p = cam.P(r * cph, r * Math.sin(ph), Dk.z[i] * Math.min(1, r / 6)); if (!onScreen(p[0], p[1])) continue;
    const I = 0.34 * (0.4 + 0.6 * prof(Math.max(r, 3)) ** 0.6) * boost(r, cph) * (r < M.R_ISCO ? 0.22 : 1) * (0.4 + 1.2 * Dk.s[i] ** 2);
    (p[2] > 0 && cam.si > 0.05 ? gb : gf).splat(p[0], p[1], rs, ramp(tempU(r) * (0.9 + 0.3 * hot) + 0.08), I);
  }
  gb.flush(stage, {alpha: a, bloom: 0.5, cross: 0.04}); drawHole(stage, cam, o.hole ?? 1); gf.flush(stage, {alpha: a, bloom: 0.5, cross: 0.04});
}

// background: dark ground, fixed faint stars (environment to the edges), soft vignette
const FIELD = (() => { const R = rng(36), s = []; for (let i = 0; i < 340; i++) s.push({x: R() * W, y: R() * H, r: 0.5 + 1.6 * R() ** 3, a: 0.12 + 0.5 * R() ** 2, c: R()}); return s; })();
export function background(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme;
  const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#00131D'); g.addColorStop(1, T.deep || '#000C12'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (const s of FIELD) { c.globalAlpha = s.a * 0.75; circle(c, s.x, s.y, s.r, s.c > 0.8 ? '#FFE9C8' : s.c > 0.6 ? '#CFE0FF' : '#EAF0F6'); } c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Small helpers
// =====================================================================================================
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d), fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const SH = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 30, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 10;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2; x0 = clamp(x0, 70 + pad, 940 - pad - w);
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba(PAL.plate, o.plateA ?? 0.78), o.border ? rgba(o.border, 0.85) : null, 1.5);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink, role: o.role, ...SH});
  });
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx;
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 860, ...SH}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 232, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 880, ...SH}));
}
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, '오늘의 주제', '강착원반']];
  if (id === 'origin') return [[-Infinity, '이름의 뜻', '강착 = 내려와 붙는다'], [at('s04'), '1988년 · 마틴 리스의 예측', '블랙홀이 별을 찢으면 빛난다']];
  if (id === 'tide') return [[-Infinity, '메커니즘 ① 기조력', '가까운 쪽을 더 세게'], [at('s07'), '스파게티화', '국수 가락처럼 길게']];
  if (id === 'whole') return [[-Infinity, '무거운 블랙홀이라면', '찢지 않고 통째로']];
  if (id === 'spin') return [[-Infinity, '메커니즘 ② 찢긴 뒤 · 시간을 크게 압축', '절반은 밖으로, 절반은 돌아온다'], [at('s11'), '핵심', '곧장 떨어지지 못하고 돈다'], [at('s12'), '각운동량', '가까울수록 더 빨리']];
  if (id === 'flatten') return [[-Infinity, '메커니즘 ③ 충돌', '제 꼬리와 부딪힌다'], [at('s14'), '메커니즘 ③ 납작해지기', '같은 방향만 남는다']];
  if (id === 'disk') return [[-Infinity, '메커니즘 ④ 원반 안', '안쪽이 더 빨리 돈다'], [at('s16'), '원반 안 · 빨리 감기', '나선을 그리며 안으로'], [at('s17'), '원반 안', '안쪽일수록 뜨겁다']];
  if (id === 'observe') return [[-Infinity, '관측 · 2014년', '몇 달에 걸쳐 어두워진 빛'], [P.eht, '관측 · 2019년 블랙홀 사진', '한쪽이 더 밝은 고리']];
  if (id === 'close') return [[-Infinity, '오해 바로잡기', '진공청소기가 아니다'], [P.zoomIn, '', '']];
  return [[-Infinity, '', '']];
}
const POSTER = {q: '블랙홀 둘레엔 왜 원반이?', a: '곧장 못 떨어져서', y: 1040, y2: 1172};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 860, 96); AS ||= fit(POSTER.a, 900, 150);
  const y1 = lerp(POSTER.y, 232, q), s1 = lerp(QS, 56, q), y2 = lerp(POSTER.y2, 296, q), s2 = lerp(AS, 34, q), tr = lerp(-0.03, -0.011, q);
  withAlpha(c, a, () => {
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 22, tracking: tr * s1});
    withAlpha(c, 1 - smooth((q - 0.7) / 0.3), () => stage.text(POSTER.a, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.warm, align: 'center', tracking: tr * s2, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 28}));
  });
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), c = stage.ctx;
  if (id === 'hook' && t < P.MORPH[1]) {
    const q = easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]));
    withAlpha(c, q, () => withAlpha(c, 1, () => head(stage, '오늘의 주제', '강착원반', 1, 1)));
    withAlpha(c, 1 - q, () => posterTitle(stage, 0)); return;
  }
  if (id === 'close' && t >= P.poster) { posterTitle(stage, 0, fadeIn(t, P.poster, 0.7)); progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, P), a = smooth(ctx.scene.p / 0.03) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
/** a horizontal instrument bar: value 0..1 */
function bar(stage, x, y, w, v, col, label, o = {}) {
  const c = stage.ctx; rect(c, x, y - 9, w, 18, 9, rgba('#0A2A38', 0.9), rgba(PAL.coolDim, 0.55), 1.5);
  if (v > 0.004) rect(c, x, y - 9, Math.max(18, w * clamp(v)), 18, 9, col);
  if (label) stage.text(label, x - 16, y, {size: 28, weight: 500, color: o.lc || PAL.ink, align: 'right', ...SH});
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  hook(stage, t, p, ctx) { const P = plan(ctx.tl), cam = camAt(P, t, null); drawDisk(stage, cam, disk().advance(t)); },

  origin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, S = sim().advance(P.tau(t)), cam = camAt(P, t, S), tl = ctx.tl;
    const dA = fadeOut(t, P.diskOut[0], P.diskOut[1] - P.diskOut[0]), sA = fadeIn(t, P.diskOut[0] + 0.5, 1.0);
    if (dA > 0.003) {
      drawDisk(stage, cam, disk().advance(t), {alpha: dA});
      // gas clumps dropping onto the outer edge: "떨어져 쌓이는 일"
      const [g] = [buf1()];
      for (let j = 0; j < 5; j++) { const u = ((t - tl.at('s03')) * 0.34 + j * 0.2) % 1, ang = 2.3 + j * 1.17, r = lerp(40, 20.5, easeOut(u)), ph = ang + 0.9 * u, q = cam.P(r * Math.cos(ph), r * Math.sin(ph), 0); g.splat(q[0], q[1], 9, STAR, 0.8 * Math.sin(Math.PI * u) * dA); g.splat(q[0], q[1], 22, STREAM, 0.14 * Math.sin(Math.PI * u) * dA); }
      g.flush(stage, {bloom: 0.5});
      // the word, taken apart
      const a1 = fadeIn(t, tl.at('s03') + 0.2, 0.5) * dA, a2 = fadeIn(t, tl.at('s03') + 1.5, 0.5) * dA;
      withAlpha(c, a1, () => { stage.text('降', 400, 1125, {role: 'display', weight: 700, size: 120, color: PAL.hot, align: 'center', ...SH}); stage.text('着', 680, 1125, {role: 'display', weight: 700, size: 120, color: PAL.hot, align: 'center', ...SH}); });
      withAlpha(c, a2, () => { stage.text('내릴 강', 400, 1232, {size: 36, weight: 700, color: PAL.cool, align: 'center', ...SH}); stage.text('붙을 착', 680, 1232, {size: 36, weight: 700, color: PAL.cool, align: 'center', ...SH}); });
    }
    if (sA > 0.003) {
      // the star's predicted path (the rest of its parabola) and the predicted flare
      const pts = S.path.filter((_, i) => i % 12 === 0).map(q => cam.P(q[1], q[2])), aP = sA * 0.75;
      withAlpha(c, aP, () => line(c, pts, rgba(PAL.cool, 0.55), 2, {dash: [3, 12]}));
      const fl = fadeIn(t, P.predict, 0.9) * fadeOut(t, ctx.scene.end - 0.5, 0.5), [hx, hy] = cam.hole;
      if (fl > 0.01) { const [g] = [buf1()], pu = 0.85 + 0.15 * Math.sin((t - P.predict) * 3.2); g.splat(hx, hy, 150 * pu, STREAM, 0.5 * fl); g.splat(hx, hy, 70 * pu, STAR, 0.8 * fl); g.flush(stage, {bloom: 0.45}); withAlpha(c, fl, () => { ring(c, hx, hy, 120, rgba(PAL.warm, 0.8), 2); c.setLineDash([]); }); tag(stage, '예측: 밝은 빛', hx - 30, hy + 175, {a: fl, color: PAL.warm}); }
      drawSim(stage, cam, S, {alpha: sA});
      const f = starFocus(S), sp = cam.P(f[0], f[1]);
      tag(stage, '별', sp[0] - 62, sp[1] + 6, {a: sA * fadeOut(t, ctx.scene.end - 0.6, 0.4)});
      tag(stage, '블랙홀', cam.hole[0] - 20, cam.hole[1] - 62, {a: sA * (1 - fl) * fadeOut(t, ctx.scene.end - 0.6, 0.4)});
    }
  },

  tide(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, S = sim().advance(P.tau(t)), cam = camAt(P, t, S);
    drawSim(stage, cam, S);
    const f = starFocus(S), r = Math.hypot(f[0], f[1]), ux = -f[0] / r, uy = -f[1] / r, ratio = t >= P.tear ? Math.max(1.02, M.tideRatio(r)) : M.tideRatio(r);
    // pull on the near side and on the far side (arrow length ∝ the hole's gravity there)
    const aA = fadeIn(t, tl.at('s05') + 0.6, 0.6) * fadeOut(t, P.tear + 0.5, 0.8);
    if (aA > 0.01) {
      const g = d => M.GM / (d - 1) ** 2, sc = 190 / g(Math.max(r - M.R_STAR, 2.4)) * clamp(ratio * 1.6 + 0.45, 0.5, 1);
      for (const [sgn, name] of [[1, '가까운 쪽: 세게'], [-1, '먼 쪽: 약하게']]) {
        const wx = f[0] + sgn * ux * M.R_STAR * 1.1, wy = f[1] + sgn * uy * M.R_STAR * 1.1, a0 = cam.P(wx, wy), len = Math.max(26, g(r - sgn * M.R_STAR) * sc);
        const b0 = [a0[0] + ux * len, a0[1] - uy * len];
        withAlpha(c, aA, () => { arrow(c, [a0[0], a0[1]], b0, '#04222F', 11, {head: 30}); arrow(c, [a0[0], a0[1]], b0, PAL.cool, 5, {head: 22}); });
        tag(stage, name, a0[0] - uy * 92 * 1 + (sgn > 0 ? 40 : -40) * ux, a0[1] - ux * 92 - (sgn > 0 ? 40 : -40) * uy, {a: aA * fadeIn(t, tl.at('s05') + (sgn > 0 ? 3.0 : 4.1), 0.4), size: 30});
      }
    }
    // instrument: tidal pull ÷ the star's own gravity
    const aG = fadeIn(t, tl.at('s06') + 0.3, 0.5) * fadeOut(t, tl.at('s06:end') + 0.2, 0.6), x0 = 250, w = 560, y = 1262;
    withAlpha(c, aG, () => {
      stage.text('기조력 ÷ 별의 중력', 540, y - 52, {size: 30, weight: 700, color: PAL.cool, align: 'center', ...SH});
      bar(stage, x0, y, w, ratio / 1.5, ratio >= 1 ? PAL.warm : PAL.cool, '');
      const xm = x0 + w / 1.5; line(c, [[xm, y - 24], [xm, y + 24]], PAL.ink, 3); stage.text('버티는 한계', xm, y + 48, {size: 28, weight: 500, color: PAL.ink, align: 'center', ...SH});
    });
    const pulse = clamp(1 - (t - P.tear) / 1.0); if (t >= P.tear && pulse > 0) { const sp = cam.P(f[0], f[1]); ring(c, sp[0], sp[1], 70 + 190 * (1 - pulse), rgba(PAL.hot, 0.7 * pulse), 3); }
    const aB = fadeIn(t, tl.at('tide') + 2.2, 0.6) * fadeOut(t, ctx.scene.end - 0.5, 0.4); if (onScreen(cam.hole[0], cam.hole[1], -60)) tag(stage, '블랙홀', cam.hole[0], cam.hole[1] - cam.k - 34, {a: aB, size: 28});
  },

  whole(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, S = sim().advance(P.tau(t)), cam = camAt(P, t, S);
    const g0 = fadeOut(t, tl.at('whole') + 0.2, 0.9), g1 = fadeIn(t, ctx.scene.end - 1.1, 1.0), ghost = Math.max(g0, g1), aD = fadeIn(t, tl.at('whole') + 0.6, 0.7) * fadeOut(t, ctx.scene.end - 1.0, 0.7);
    drawSim(stage, cam, S, {alpha: 0.1 + 0.9 * ghost, hole: ghost});
    // same stage, a what-if dial: the tear distance is drawn at a fixed size, the horizon grows against it
    const LGMAX = Math.log10(2e8);
    const lg = t < P.dial2[0] - 0.4 ? lerp(6, LGMAX, easeInOut((t - P.dial[0]) / (P.dial[1] - P.dial[0]))) : lerp(6, LGMAX, easeInOut((t - P.dial2[0]) / (P.dial2[1] - P.dial2[0])));
    const reset = t >= P.dial2[0] - 0.4 && t < P.dial2[0] ? 1 : 0, Mh = 10 ** lg, RT = 285, cx = 540, cy = 800, rh = RT * M.horizonKm(Mh) / M.tearKm(Mh), over = Mh >= M.M_WHOLE;
    withAlpha(c, aD * (1 - reset), () => {
      circle(c, cx, cy, rh, '#00070B'); ring(c, cx, cy, rh, rgba(PAL.warm, 0.95), 3.5); ring(c, cx, cy, rh + 5, rgba(PAL.warm, 0.25), 8);
      c.setLineDash([10, 12]); ring(c, cx, cy, RT, rgba(PAL.cool, over ? 0.55 : 0.95), 3); c.setLineDash([]);
      tag(stage, '별이 찢어지는 거리', cx, cy - RT - 34, {color: PAL.cool, size: 30});
      if (rh > 60 && rh < 520) tag(stage, '빛도 못 나오는 경계', cx, cy + Math.min(rh, 420) * 0.45, {color: PAL.warm, size: 30, plate: rh > 110 ? false : undefined});
    });
    // the star: torn at the dashed circle for a light hole, swallowed whole by a heavy one
    const [g] = [buf1()], u = clamp((t - (P.swallow - 2.6)) / 2.6), sx = lerp(980, cx + Math.max(rh, RT) * 0.92, easeInOut(u)), sy = lerp(520, cy - 60, easeInOut(u));
    const gone = fadeOut(t, P.swallow, 0.45), sA = aD * gone * (t < P.dial2[0] - 0.4 ? fadeIn(t, P.dial[0] - 0.2, 0.5) : 0);
    if (sA > 0.01) { g.splat(sx, sy, 62, STAR, 0.95 * sA); g.splat(sx, sy, 34, WHITE, 0.7 * sA); g.splat(sx, sy, 150, STREAM, 0.12 * sA); }
    // second pass: a small star rides the dashed circle so the two radii can be compared
    const s2 = aD * fadeIn(t, P.dial2[0], 0.5); if (s2 > 0.01) { const an = -0.6 - 0.25 * (t - P.dial2[0]), x = cx + RT * Math.cos(an), y = cy + RT * Math.sin(an), vis = over ? 0.25 : 1; g.splat(x, y, 46, STAR, 0.9 * s2 * vis); g.splat(x, y, 24, WHITE, 0.6 * s2 * vis); g.splat(x, y, 110, STREAM, 0.1 * s2 * vis); }
    g.flush(stage, {bloom: 0.5});
    if (t >= P.swallow && t < P.swallow + 0.9) { const q = (t - P.swallow) / 0.9; ring(c, sx, sy, 40 + 60 * q, rgba(PAL.warm, 0.6 * (1 - q)), 3); }
    // dial
    const txt = lg < 6.98 ? `${Math.round(10 ** (lg - 4) / 10) * 10 || 100}만 배` : lg < 7.98 ? `${(Math.round(10 ** (lg - 7) * 10) / 10 * 1000).toLocaleString('en-US')}만 배` : `${(Math.round(10 ** (lg - 8) * 10) / 10).toLocaleString('en-US')}억 배`;
    withAlpha(c, aD, () => {
      stage.text('블랙홀의 질량 = 태양의', 540, 1262, {size: 30, weight: 500, color: PAL.muted, align: 'center', ...SH});
      stage.text(txt, 540, 1322, {role: 'display', weight: 700, size: 64, color: over ? PAL.warm : PAL.ink, align: 'center', ...SH});
    });
    const aX = aD * fadeIn(t, P.dial2[0] + 0.6, 0.5), f10 = 10 ** (lg - 6);
    withAlpha(c, aX, () => {
      stage.text(`경계 × ${f10 >= 10 ? Math.round(f10).toLocaleString('en-US') : f10.toFixed(1)}`, 110, 420, {size: 34, weight: 700, color: PAL.warm, ...SH});
      stage.text(`찢는 거리 × ${Math.cbrt(f10).toFixed(1)}`, 110, 474, {size: 34, weight: 700, color: PAL.cool, ...SH});
    });
  },

  spin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, S = sim().advance(P.tau(t)), cam = camAt(P, t, S), i = P.tracer;
    drawSim(stage, cam, S, {gain: 1.15});
    // s10: half escapes, half returns — counted from the model (orbital energy of every particle)
    const aH = fadeIn(t, tl.at('s10') + 1.2, 0.6) * fadeOut(t, P.core - 0.7, 0.5);
    if (aH > 0.01) {
      let ux = 0, uy = 0, un = 0, bx = 0, by = 0, bn = 0; for (let j = 0; j < M.N; j += 7) { if (S.state[j]) continue; if (S.energy(j) > 0) { ux += S.x[j]; uy += S.y[j]; un++; } else { bx += S.x[j]; by += S.y[j]; bn++; } }
      const pu = cam.P(ux / un, uy / un), pb = cam.P(bx / bn, by / bn), fr = Math.round(un / (un + bn) * 100);
      tag(stage, '절반쯤: 우주로', clamp(pu[0] + 150, 300, 760), clamp(pu[1], 380, 700), {a: aH * fadeIn(t, tl.at('s10') + 1.4, 0.4), color: PAL.cool});
      tag(stage, '절반쯤: 되돌아옴', clamp(pb[0] + 190, 330, 720), clamp(pb[1] + 60, 900, 1280), {a: aH * fadeIn(t, tl.at('s10') + 3.6, 0.4), color: PAL.warm});
      tag(stage, `모형: 튕겨 나감 ${fr}% · 돌아옴 ${100 - fr}%`, 400, 1305, {a: aH * fadeIn(t, tl.at('s10') + 4.6, 0.4), size: 26, weight: 500, color: PAL.muted});
    }
    // s11–s12: one parcel of gas, its sideways motion and the straight path it cannot take
    const aT = fadeIn(t, P.core + 0.4, 0.6) * fadeOut(t, ctx.scene.end - 0.5, 0.4);
    if (aT > 0.01 && S.state[i] !== 3) {
      const x = S.x[i], y = S.y[i], r = Math.hypot(x, y), q = cam.P(x, y), [hx, hy] = cam.hole, vx = S.vx[i], vy = S.vy[i];
      const rx = -x / r, ry = -y / r, vr = vx * rx + vy * ry, tx = -ry, ty = rx, vt = vx * tx + vy * ty, L = Math.abs(S.angmom(i)), sv = 620;
      withAlpha(c, aT, () => {
        line(c, [[q[0], q[1]], [hx, hy]], rgba(PAL.muted, 0.75), 2.5, {dash: [10, 10]});
        ring(c, q[0], q[1], 17, PAL.ink, 3); circle(c, q[0], q[1], 6, PAL.hot);
        const aV = fadeIn(t, P.core + 1.6, 0.5);
        withAlpha(c, aV, () => {
          arrow(c, [q[0], q[1]], [q[0] + vx * sv, q[1] - vy * sv], rgba(PAL.ink, 0.55), 3, {head: 16});
          arrow(c, [q[0], q[1]], [q[0] + tx * vt * sv, q[1] - ty * vt * sv], PAL.warm, 5, {head: 22});
        });
      });
      const mid = [(q[0] + hx) / 2, (q[1] + hy) / 2];
      if (r > 14) tag(stage, '곧장 떨어지는 길', mid[0] - 40, mid[1] + 44, {a: aT * fadeIn(t, P.core + 0.9, 0.4) * fadeOut(t, P.amount + 1.5, 0.5), size: 28, color: PAL.muted});
      tag(stage, '옆으로 움직이던 운동', clamp(q[0] + tx * vt * sv + 10, 260, 720), q[1] - ty * vt * sv - 46, {a: aT * fadeIn(t, P.core + 2.0, 0.4) * fadeOut(t, P.amount + 0.8, 0.5), size: 28, color: PAL.warm});
      // instrument: distance × sideways speed stays the same
      const aG = fadeIn(t, P.amount + 0.3, 0.5) * fadeOut(t, ctx.scene.end - 0.5, 0.4), x0 = 330, w = 470, r0 = 60, v0 = 0.36;
      withAlpha(c, aG, () => {
        bar(stage, x0, 1178, w, r / 34, PAL.cool, '거리'); bar(stage, x0, 1228, w, Math.abs(vt) / v0, PAL.warm, '옆 속도');
        bar(stage, x0, 1290, w, L / 3.6, PAL.hot, '각운동량', {lc: PAL.hot});
        stage.text('×', x0 - 150, 1203, {size: 30, weight: 700, color: PAL.muted, align: 'center'}); stage.text('=', x0 - 190, 1290, {size: 30, weight: 700, color: PAL.muted, align: 'center'});
        stage.text('그대로', x0 + w + 16, 1290, {size: 28, weight: 700, color: PAL.hot, ...SH});
      });
    }
  },

  flatten(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, S = sim().advance(P.tau(t)), cam = camAt(P, t, S);
    drawSim(stage, cam, S, {gain: 1.1});
    // where the returning stream meets gas that has already gone round: shock rings (model: energy lost, angular momentum kept)
    const aS = fadeIn(t, tl.at('s13') + 2.6, 0.5) * fadeOut(t, P.tilt[0] + 0.2, 0.5), hit = cam.P(-2.5, -10.5);
    if (aS > 0.01) { for (let j = 0; j < 3; j++) { const u = ((t * 0.9 + j / 3) % 1); ring(c, hit[0], hit[1], 16 + 70 * u, rgba(PAL.hot, 0.7 * (1 - u) * aS), 3); } tag(stage, '충돌', hit[0] - 120, hit[1] + 70, {a: aS, color: PAL.hot}); }
    // thickness bracket while the camera lies down
    const aB = fadeIn(t, P.tilt[1] - 0.6, 0.6) * fadeOut(t, ctx.scene.end - 0.6, 0.5);
    if (aB > 0.01) {
      let z2 = 0, n = 0; for (let j = 0; j < M.N; j += 3) if (S.state[j] >= 1) { z2 += S.z[j] ** 2; n++; } const hgt = Math.sqrt(z2 / Math.max(1, n)) * 2.2 * cam.k * cam.si + 6, x = cam.hole[0] + 13 * cam.k + 46, y = cam.hole[1];
      withAlpha(c, aB, () => { line(c, [[x - 12, y - hgt], [x, y - hgt], [x, y + hgt], [x - 12, y + hgt]], PAL.cool, 3); stage.text('두께', x + 16, y, {size: 30, weight: 700, color: PAL.cool, ...SH}); });
      const dir = cam.hole[1] + 12 * cam.k * cam.ci + 80;
      withAlpha(c, aB * fadeIn(t, tl.at('s14') + 2.4, 0.5), () => { arrow(c, [380, dir], [700, dir], PAL.warm, 4, {head: 20}); stage.text('같은 방향', 540, dir + 44, {size: 30, weight: 700, color: PAL.warm, align: 'center', ...SH}); });
    }
  },

  disk(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, S = sim().advance(P.tau(t)), cam = camAt(P, t, S), Dk = disk().advance(t);
    const b = smooth((t - P.blend[0]) / (P.blend[1] - P.blend[0])), hot = smooth((t - P.heat) / 2.5);
    if (b < 0.999) drawSim(stage, cam, S, {alpha: 1 - b, hole: 0});
    drawDisk(stage, cam, Dk, {alpha: b, hot, beam: 0.2});
    // s15: an inner and an outer marker, same start line — the inner one laps the outer one
    const aM = fadeIn(t, tl.at('s15') + 0.5, 0.6) * fadeOut(t, P.spiral[0] + 0.1, 0.5);
    if (aM > 0.01) {
      const t0 = tl.at('s15') + 0.5, dt = Math.max(0, t - t0) * M.DISK_RATE;
      for (const [r, name, col] of [[5.2, '안쪽: 빠르게', PAL.hot], [15.5, '바깥쪽: 느리게', PAL.cool]]) {
        const ph0 = -2.0, ph = ph0 + M.omega(r) * dt, pts = []; for (let a = Math.max(ph0, ph - 5.2); a <= ph; a += 0.06) pts.push(cam.P(r * Math.cos(a), r * Math.sin(a)));
        const q = cam.P(r * Math.cos(ph), r * Math.sin(ph));
        withAlpha(c, aM, () => { if (pts.length > 1) line(c, pts, rgba(col, 0.8), 3); ring(c, q[0], q[1], 13, col, 3); circle(c, q[0], q[1], 5, col); });
      }
      tag(stage, '안쪽: 빠르게', 540, cam.hole[1] + 15.5 * cam.k * cam.ci + 112, {a: aM * fadeIn(t, tl.at('s15') + 1.0, 0.4), color: PAL.hot});
      tag(stage, '바깥쪽: 느리게', 540, cam.hole[1] + 15.5 * cam.k * cam.ci + 54, {a: aM * fadeIn(t, tl.at('s15') + 2.2, 0.4), color: PAL.cool});
    }
    // s16: one parcel followed inward (fast-forward): circular speed at each radius, radius shrinking
    const aS = fadeIn(t, P.spiral[0], 0.5) * fadeOut(t, P.spiral[1] + 0.3, 0.6), sp = spiralAt(P, t);
    if (aS > 0.01) {
      const pts = sp.trail.map(([r, ph]) => cam.P(r * Math.cos(ph), r * Math.sin(ph))), q = pts[pts.length - 1];
      withAlpha(c, aS, () => { if (pts.length > 1) line(c, pts, rgba(PAL.ink, 0.85), 2.5); ring(c, q[0], q[1], 15, PAL.ink, 3); circle(c, q[0], q[1], 6, PAL.hot); });
      const ox = cam.hole[0] + 19 * cam.k, oy = cam.hole[1] - 12 * cam.k * cam.ci;
      withAlpha(c, aS * fadeIn(t, tl.at('s16') + 0.6, 0.5), () => { arrow(c, [cam.hole[0] + 8 * cam.k, oy - 30], [Math.min(ox, 900), oy - 30], PAL.cool, 4, {head: 20}); });
      tag(stage, '각운동량은 바깥으로', 640, oy - 76, {a: aS * fadeIn(t, tl.at('s16') + 0.6, 0.5), color: PAL.cool, size: 28});
    }
    // s17: temperature along the radius (thin-disk shape T ∝ r^-3/4)
    const aT = fadeIn(t, P.heat + 0.5, 0.6) * fadeOut(t, ctx.scene.end - 0.5, 0.4), x0 = 190, w = 660, y = 1250;
    withAlpha(c, aT, () => {
      const g = c.createLinearGradient(x0, 0, x0 + w, 0); for (let k = 0; k <= 10; k++) { const r = lerp(M.DISK_OUT, M.R_ISCO, k / 10), col = ramp(tempU(r) * 1.12 + 0.02); g.addColorStop(k / 10, `rgb(${col.map(v => Math.round(255 * Math.min(1, v))).join(',')})`); }
      rect(c, x0, y - 13, w, 26, 13, g, rgba(PAL.ink, 0.5), 1.5);
      stage.text('바깥', x0, y - 44, {size: 28, weight: 500, color: PAL.muted, ...SH}); stage.text('안쪽 · 자외선과 엑스선', x0 + w, y - 44, {size: 28, weight: 700, color: '#CFE2FF', align: 'right', ...SH});
      stage.text('온도', x0 - 16, y, {size: 28, weight: 700, color: PAL.ink, align: 'right', ...SH});
      const pts = []; for (let k = 0; k <= 40; k++) { const r = lerp(M.DISK_OUT, M.R_ISCO, k / 40); pts.push([x0 + w * k / 40, y + 80 - 62 * M.tempShape(r)]); } line(c, pts, rgba(PAL.ink, 0.9), 3);
    });
  },

  observe(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, a = fadeIn(t, P.obsIn + 0.25, 0.5) * fadeOut(t, P.obsOut - 0.55, 0.45);
    // carry the disk out through a short dark fade (1 of 2 in the film)
    if (t < P.obsIn + 0.3) { const cam = camAt(P, P.obsIn, null); drawDisk(stage, cam, disk().advance(t), {alpha: fadeOut(t, P.obsIn, 0.3), hot: 1, beam: 0.2}); }
    const x = smooth((t - P.eht) / 0.9), [g] = [buf1()];
    // ---- 2014: a flare in a galaxy 290 million light-years away, fading over months (curve = model with the reported 60-day scale)
    const d = lerp(-34, 190, clamp((t - (tl.at('s18') - 0.2)) / (P.eht - 0.3 - (tl.at('s18') - 0.2)))), fl = M.flare(d), aG = a * (1 - x);
    if (aG > 0.01) {
      const gx = 540, gy = 640;
      for (let k = 0; k < 90; k++) { const u = k / 90, rr = 20 + 250 * u ** 1.4, an = k * 2.399, ex = gx + rr * Math.cos(an) * Math.cos(0.5) - rr * 0.55 * Math.sin(an) * Math.sin(0.5), ey = gy + rr * Math.cos(an) * Math.sin(0.5) + rr * 0.55 * Math.sin(an) * Math.cos(0.5); g.splat(ex, ey, 70 - 30 * u, [0.9, 0.78, 0.62], 0.035 * (1 - 0.7 * u) * aG); }
      g.splat(gx, gy, 60, [0.95, 0.8, 0.6], 0.25 * aG); g.splat(gx, gy, 16 + 34 * fl, [0.78, 0.86, 1], (0.25 + 2.2 * fl) * aG); g.splat(gx, gy, 120 * fl, [0.6, 0.75, 1], 0.3 * fl * aG);
    }
    // ---- 2019: the ring of M87*, drawn after the published image (brighter in the south)
    if (x > 0.01) { const rx = 540, ry = 640, R0 = 150; for (let k = 0; k < 120; k++) { const an = k / 120 * TAU, b = 0.22 + 0.78 * (0.5 + 0.5 * Math.cos(an - 1.95)) ** 1.6; g.splat(rx + R0 * Math.cos(an), ry + R0 * Math.sin(an), 78, [1.0, 0.52, 0.12], 0.085 * b * a * x); g.splat(rx + R0 * Math.cos(an), ry + R0 * Math.sin(an), 40, [1.0, 0.8, 0.4], 0.05 * b * b * a * x); } }
    g.flush(stage, {bloom: 0.5});
    withAlpha(c, aG, () => {
      tag(stage, '약 2억 9천만 광년 밖 은하', 540, 400, {size: 30, color: PAL.ink});
      const x0 = 170, y0 = 1270, w = 700, h = 270, X = dd => x0 + w * (dd + 34) / 224, Y = v => y0 - h * v;
      line(c, [[x0, y0 - h - 10], [x0, y0], [x0 + w, y0]], rgba(PAL.muted, 0.9), 2);
      for (let m = 0; m <= 6; m += 2) { const xx = X(m * 30.4); line(c, [[xx, y0], [xx, y0 + 10]], rgba(PAL.muted, 0.9), 2); stage.text(m === 0 ? '발견' : `${m}달 뒤`, xx, y0 + 38, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...SH}); }
      stage.text('밝기', x0 + 14, y0 - h - 4, {size: 28, weight: 700, color: PAL.cool, ...SH});
      const pts = []; for (let dd = -34; dd <= d; dd += 2) pts.push([X(dd), Y(M.flare(dd) * 0.92)]); if (pts.length > 1) line(c, pts, PAL.cool, 4);
      circle(c, X(d), Y(fl * 0.92), 9, PAL.hot); ring(c, X(d), Y(fl * 0.92), 16, rgba(PAL.hot, 0.6), 2);
    });
    withAlpha(c, a * x, () => {
      const rx = 540, ry = 640; rect(c, rx - 290, ry - 290, 580, 580, 10, null, rgba(PAL.muted, 0.55), 2);
      tag(stage, 'M87 은하의 블랙홀 · 사진을 본뜬 그림', 540, 962, {size: 26, weight: 500, color: PAL.muted, plate: false});
    });
    const aL = a * fadeIn(t, tl.at('s19') + 4.2, 0.5);
    tag(stage, '다가오는 쪽: 더 밝게', 540, 870, {a: aL * x, color: PAL.warm, size: 30}); tag(stage, '멀어지는 쪽: 더 어둡게', 540, 420, {a: aL * x * fadeIn(t, tl.at('s19') + 5.4, 0.5), color: PAL.cool, size: 30});
    // the model disk seen at a tilt, with the same one-sided brightening
    if (a * x > 0.01) {
      const cam = {fx: 0, fy: 0, cx: 540, cy: 1150, k: 9.5, inc: 1.1}; cam.ci = Math.cos(cam.inc); cam.si = Math.sin(cam.inc); cam.P = (X, Y, z = 0) => [cam.cx + cam.k * X, cam.cy - cam.k * (Y * cam.ci + z * cam.si), Y * cam.si - z * cam.ci]; cam.hole = cam.P(0, 0, 0);
      drawDisk(stage, cam, disk().advance(t), {alpha: a * x, beam: 0.5});
      withAlpha(c, aL * x, () => { arrow(c, [300, 1265], [240, 1310], PAL.warm, 4, {head: 18}); arrow(c, [780, 1040], [840, 995], PAL.cool, 4, {head: 18}); stage.text('우리 쪽으로', 250, 1340, {size: 26, weight: 700, color: PAL.warm, align: 'center', ...SH}); stage.text('멀어짐', 850, 968, {size: 26, weight: 700, color: PAL.cool, align: 'center', ...SH}); });
    }
  },

  close(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, tl = ctx.tl, cam = camAt(P, t, null), a = fadeIn(t, P.obsOut + 0.1, 0.5);
    // far away the hole pulls like any star of the same mass: other stars keep circling on ordinary orbits
    const aO = a * fadeOut(t, P.zoomIn + 0.3, 1.6);
    if (aO > 0.01) {
      const [g] = [buf1()];
      ORBITS.forEach((o, n) => {
        const pts = []; for (let k = 0; k <= 90; k++) { const E = k / 90 * TAU; pts.push(cam.P(...kepler(o, E))); }
        withAlpha(c, aO * 0.5, () => line(c, pts, rgba(PAL.coolDim, 0.8), 1.5));
        const Mn = o.m0 + (t - P.obsOut) * o.n; let E = Mn; for (let k = 0; k < 6; k++) E = Mn + o.e * Math.sin(E);
        const q = cam.P(...kepler(o, E)); g.splat(q[0], q[1], 17, STAR, 0.9 * aO); g.splat(q[0], q[1], 8, WHITE, 0.8 * aO); g.splat(q[0], q[1], 42, STREAM, 0.1 * aO);
      });
      g.flush(stage, {bloom: 0.5});
      tag(stage, '멀리서는 같은 질량의 별과 같은 중력', 540, 1290, {a: aO * fadeIn(t, tl.at('s20') + 4.6, 0.5), size: 30, color: PAL.cool});
    }
    drawDisk(stage, cam, disk().advance(t), {alpha: a});
  },
};

// other stars around the hole (Kepler ellipses, GM from the model; speeded up ×~30 on screen)
const ORBITS = [{a: 62, e: 0.25, w: 0.4, m0: 0.3}, {a: 88, e: 0.45, w: 2.2, m0: 2.0}, {a: 104, e: 0.15, w: 4.0, m0: 4.4}, {a: 76, e: 0.6, w: 5.3, m0: 3.1}, {a: 118, e: 0.35, w: 1.2, m0: 5.5}]
  .map(o => ({...o, n: Math.sqrt(M.GM / o.a ** 3) * 34}));
function kepler(o, E) { const x = o.a * (Math.cos(E) - o.e), y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E), cw = Math.cos(o.w), sw = Math.sin(o.w); return [x * cw - y * sw, x * sw + y * cw, 0]; }

/** s16 tracer: radius shrinks from 16 to the inner edge while the angle advances at the local circular rate (fast-forward) */
let SPIRAL = null;
export function spiralAt(P, t) {
  if (!SPIRAL) { const T = [], h = 1 / 60, dur = P.spiral[1] - P.spiral[0]; let ph = 2.2; for (let u = 0; u <= dur + 1.2; u += h) { const q = clamp(u / dur), r = u <= dur ? 16.5 * (M.R_ISCO / 16.5) ** (q ** 1.25) : Math.max(1.2, M.R_ISCO - (u - dur) * 2.6); ph += M.omega(Math.max(r, 2.2)) * h * 26; T.push([r, ph]); } SPIRAL = T; }
  const n = clamp(Math.round((t - P.spiral[0]) * 60), 0, SPIRAL.length - 1);
  return {r: SPIRAL[n][0], trail: SPIRAL.slice(Math.max(0, n - 300), n + 1)};
}
