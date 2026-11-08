// Drawing helpers for episode 32 (series diagram style: dark field, thin lines, small additive glowing dots).
// Generic line icons only — a radar dish on a pedestal, a jet airliner shape, a 1930s biplane bomber, a lattice mast,
// a van, a car and a hand-held speed gun. No real type, air force or markings. Strokes keep a constant screen width
// (≈ 1.5–3 px) whatever the camera zoom. gl / ringFx / burst / backing follow episode 27's glyphs.mjs (local copy).
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {rgba, easeOut, circle, TAU} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');

export const PAL = {
  tx: '#FFB85C', txHot: '#FFE6BF',            // the transmitted wave (warm)
  echo: '#6CF2B4', echoHot: '#DAFFF0',        // the returned echo = theme accent (radar-scope green)
  line: '#C8D7DB', ink: '#EFE3D4', muted: '#8AA0A6', faint: 'rgba(160,190,196,0.32)', fill: '#04202B',
  heat: '#FF8A5C', rain: '#9FC4D8',
};

// ---------------------------------------------------------------- additive light
const SPR = {};
function glowSprite(col, size = 128) {
  const cv = createCanvas(size, size), c = cv.getContext('2d'), r = size / 2, g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.18, rgba(col, 0.55)); g.addColorStop(0.45, rgba(col, 0.16)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
}
/** small additive glow (sprite) */
export function gl(c, x, y, r, col, a = 1) {
  if (a <= 0.003 || r <= 0) return;
  const s = (SPR[col] ||= glowSprite(col));
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= Math.min(1, a); c.drawImage(s, x - r, y - r, 2 * r, 2 * r); c.restore();
}
/** thin glowing ring / arc */
export function ringFx(c, x, y, r, col, a, w = 2, a0 = 0, a1 = TAU) {
  if (a <= 0.01 || r <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, r, a0, a1);
  c.strokeStyle = rgba(col, Math.min(1, a) * 0.2); c.lineWidth = w * 4; c.stroke();
  c.strokeStyle = rgba(col, Math.min(1, a)); c.lineWidth = w; c.stroke(); c.restore();
}
/** an arc whose brightness varies with direction: k(φ) in 0..1 (φ = screen angle, radians) */
export function lobeArc(c, x, y, r, col, a, w, k, a0 = -Math.PI, a1 = Math.PI, step = 0.07) {
  if (a <= 0.01 || r <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'butt';
  for (let p = a0; p < a1 - 1e-6; p += step) {
    const q = Math.min(a1, p + step), kk = k((p + q) / 2) * a; if (kk <= 0.01) continue;
    c.beginPath(); c.arc(x, y, r, p, q + 0.004);
    c.strokeStyle = rgba(col, Math.min(1, kk) * 0.2); c.lineWidth = w * 4; c.stroke();
    c.strokeStyle = rgba(col, Math.min(1, kk)); c.lineWidth = w; c.stroke();
  }
  c.restore();
}
/** a glowing polyline (wave line) */
export function glowLine(c, pts, col, a = 1, w = 2) {
  if (a <= 0.01 || pts.length < 2) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = rgba(col, Math.min(1, a) * 0.2); c.lineWidth = w * 4; c.stroke();
  c.strokeStyle = rgba(col, Math.min(1, a)); c.lineWidth = w; c.stroke(); c.restore();
}
/** an event: a small white flash and two thin rings running out (age in screen seconds) */
export function burst(c, x, y, age, R, col = PAL.echoHot, k = 1) {
  if (age < 0 || age > 2.4) return;
  gl(c, x, y, R * 0.45 * (0.6 + age), '#FFFFFF', 0.75 * k * Math.exp(-age / 0.12));
  gl(c, x, y, R * (0.4 + age * 0.7), col, 0.3 * k * Math.exp(-age / 0.35));
  ringFx(c, x, y, R * (0.2 + 1.5 * easeOut(age / 1.3)), col, 0.8 * k * Math.exp(-age / 0.6));
  if (age > 0.16) ringFx(c, x, y, R * (0.15 + 1.05 * easeOut((age - 0.16) / 1.3)), '#FFFFFF', 0.4 * k * Math.exp(-(age - 0.16) / 0.5), 1.4);
}
/** a soft dark gradient behind a text line (labels stay readable over lines and dots) */
export function backing(c, x0, y, w, size, a = 1) {
  const g = c.createLinearGradient(0, y - size, 0, y + size); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.5, `rgba(0,10,16,${0.62 * a})`); g.addColorStop(1, 'rgba(0,10,16,0)');
  c.fillStyle = g; c.fillRect(x0 - 24, y - size, w + 48, size * 2);
}

// ---------------------------------------------------------------- line icons (local units; T maps local → screen)
const LW = 2.2;
function pathOf(c, pts, T, close = true) {
  c.beginPath(); pts.forEach(([x, y], i) => { const p = T(x, y); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); if (close) c.closePath();
}
function strokeFill(c, col, a, fill = PAL.fill, w = LW) {
  if (fill) { c.fillStyle = rgba(fill, 0.94 * a); c.fill(); }
  c.strokeStyle = rgba(col, 0.92 * a); c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}
/** transform helper: origin (ox, oy) in world, scale s, heading sign dir (+1 right, −1 left), rotation rot, then cam S */
export const xf = (S, ox, oy, s = 1, dir = 1, rot = 0) => (x, y) => {
  const cr = Math.cos(rot), sr = Math.sin(rot), X = dir * x * s, Y = y * s;
  return S(ox + X * cr - Y * sr, oy + X * sr + Y * cr);
};

/** radar dish on a pedestal. (x, y) = dish vertex on screen, s = scale, aim = axis angle (screen radians, 0 = +x),
 *  ground = y of the ground under the pedestal (null: no pedestal). Returns the feed point (where waves start). */
export function dish(c, x, y, s, aim, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return [x, y];
  const ca = Math.cos(aim), sa = Math.sin(aim), R = 62 * s, k = 22 * s, f = R * R / (4 * k);
  const P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  c.save();
  if (o.ground != null) {                                  // pedestal: post + base
    const bx = x - 14 * s * ca, by = y - 14 * s * sa;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(x - 4 * s, o.ground - 34 * s); c.strokeStyle = rgba(col, 0.9 * a); c.lineWidth = 2.4; c.stroke();
    c.beginPath(); c.moveTo(x - 30 * s, o.ground); c.lineTo(x - 14 * s, o.ground - 34 * s); c.lineTo(x + 6 * s, o.ground - 34 * s); c.lineTo(x + 22 * s, o.ground); c.closePath();
    c.fillStyle = rgba(PAL.fill, 0.95 * a); c.fill(); c.strokeStyle = rgba(col, 0.9 * a); c.lineWidth = 2; c.stroke();
    c.beginPath(); c.moveTo(x - 50 * s, o.ground); c.lineTo(x + 42 * s, o.ground); c.lineWidth = 1.6; c.stroke();
  }
  // reflector (parabola) with a faint fill, struts and the feed
  c.beginPath(); for (let i = 0; i <= 24; i++) { const u = -1 + 2 * i / 24, p = P(k * u * u, R * u); i ? c.lineTo(...p) : c.moveTo(...p); }
  c.fillStyle = rgba(PAL.fill, 0.9 * a); c.fill(); c.strokeStyle = rgba(col, 0.95 * a); c.lineWidth = 2.6; c.lineJoin = 'round'; c.stroke();
  c.beginPath(); for (let i = 0; i <= 24; i++) { const u = -0.86 + 1.72 * i / 24, p = P(k * u * u + 3 * s, R * u * 0.98); i ? c.lineTo(...p) : c.moveTo(...p); }
  c.strokeStyle = rgba(col, 0.35 * a); c.lineWidth = 1.2; c.stroke();
  const F = P(f, 0);
  for (const u of [-0.92, 0.92]) { const r = P(k * u * u, R * u); c.beginPath(); c.moveTo(...r); c.lineTo(...F); c.strokeStyle = rgba(col, 0.6 * a); c.lineWidth = 1.3; c.stroke(); }
  c.beginPath(); c.moveTo(...P(-2, 0)); c.lineTo(...P(-14 * s, 0)); c.strokeStyle = rgba(col, 0.9 * a); c.lineWidth = 2.4; c.stroke();
  circle(c, F[0], F[1], 3.2 * Math.max(0.8, s), rgba(o.feed || PAL.txHot, 0.95 * a));
  c.restore();
  return F;
}
/** generic jet airliner shape, side view, heading +x. Local frame: centre at origin, nose at +120 */
export function jet(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  const body = [];
  for (let k = 0; k <= 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 10; body.push([104 + 16 * Math.cos(an), 2 + 13 * Math.sin(an)]); }
  body.push([-70, 15], [-118, 4], [-122, -6], [-80, -11]);
  c.save();
  pathOf(c, body, T); strokeFill(c, col, a, o.fill ?? PAL.fill);
  pathOf(c, [[-84, -10], [-110, -50], [-124, -50], [-118, -6]], T); strokeFill(c, col, a, o.fill ?? PAL.fill);     // fin
  pathOf(c, [[-112, -2], [-84, -2]], T, false); strokeFill(c, col, a, null, 1.6);                                  // tailplane
  pathOf(c, [[-26, 6], [34, 6], [14, 10], [-30, 10]], T); strokeFill(c, col, a, o.fill ?? PAL.fill, 1.8);          // wing (edge-on)
  pathOf(c, [[-2, 12], [34, 12], [34, 22], [-2, 22]], T); strokeFill(c, col, a, o.fill ?? PAL.fill, 1.6);          // engine pod
  pathOf(c, [[86, -4], [100, -4]], T, false); strokeFill(c, col, 0.6 * a, null, 1.4);                              // cockpit
  for (let i = 0; i < 8; i++) { const p = T(60 - i * 17, -3); circle(c, p[0], p[1], 1.3, rgba(col, 0.45 * a)); }  // windows
  c.restore();
}
/** generic 1930s biplane bomber, side view, heading +x. Local frame: centre at origin, nose at +88 */
export function biplane(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  c.save();
  pathOf(c, [[88, -6], [70, -14], [-40, -10], [-104, -4], [-106, 4], [-40, 10], [70, 12], [88, 4]], T); strokeFill(c, col, a);   // fuselage
  pathOf(c, [[-90, -4], [-106, -34], [-116, -34], [-112, -2]], T); strokeFill(c, col, a);                                        // fin
  pathOf(c, [[-20, -36], [56, -36]], T, false); strokeFill(c, col, a, null, 4);                                                // upper wing
  pathOf(c, [[-14, 18], [52, 18]], T, false); strokeFill(c, col, a, null, 4);                                                  // lower wing
  for (const x of [-8, 40]) { pathOf(c, [[x, -36], [x + 2, 18]], T, false); strokeFill(c, col, 0.8 * a, null, 1.4); }
  pathOf(c, [[-8, -36], [42, 18]], T, false); strokeFill(c, col, 0.5 * a, null, 1.1);
  for (const [ex, ey] of [[30, -8], [30, 26]]) { pathOf(c, [[ex - 16, ey - 6], [ex + 16, ey - 6], [ex + 16, ey + 6], [ex - 16, ey + 6]], T); strokeFill(c, col, a, PAL.fill, 1.5);
    const p0 = T(ex + 20, ey - 18), p1 = T(ex + 20, ey + 18); c.strokeStyle = rgba(col, 0.5 * a); c.lineWidth = 1.3; c.beginPath(); c.moveTo(...p0); c.lineTo(...p1); c.stroke(); }
  pathOf(c, [[10, 18], [4, 40]], T, false); strokeFill(c, col, 0.8 * a, null, 1.5);                                            // gear
  const w = T(4, 44), w2 = T(10, 44); circle(c, w[0], w[1], Math.max(3, Math.abs(w2[0] - w[0]) * 0.9), rgba(col, 0.75 * a));
  c.restore();
}
/** lattice mast from (x, yb) up to height h (screen units) */
export function mast(c, x, yb, h, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line, w0 = o.w0 ?? 26, w1 = o.w1 ?? 5; if (a <= 0) return;
  c.save(); c.strokeStyle = rgba(col, 0.85 * a); c.lineWidth = 1.8; c.lineCap = 'round';
  const L = q => [x - lerp(w0, w1, q), yb - q * h], R = q => [x + lerp(w0, w1, q), yb - q * h];
  c.beginPath(); c.moveTo(...L(0)); c.lineTo(...L(1)); c.moveTo(...R(0)); c.lineTo(...R(1)); c.stroke();
  c.lineWidth = 1; c.strokeStyle = rgba(col, 0.45 * a); c.beginPath();
  const n = Math.max(4, Math.round(h / 34)); for (let i = 0; i < n; i++) { const q0 = i / n, q1 = (i + 1) / n; c.moveTo(...L(q0)); c.lineTo(...R(q1)); c.moveTo(...R(q0)); c.lineTo(...L(q1)); }
  c.stroke(); c.restore();
}
const lerp = (p, q, u) => p + (q - p) * u;
/** box van (1930s-ish), side view; (x, y) = ground under the middle, s scale, facing +x */
export function van(c, x, y, s = 1, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  const T = (u, v) => [x + u * s, y + v * s];
  c.save();
  pathOf(c, [[-60, -12], [-60, -72], [26, -72], [26, -12]], T); strokeFill(c, col, a);
  pathOf(c, [[26, -12], [26, -54], [46, -54], [60, -34], [60, -12]], T); strokeFill(c, col, a);
  pathOf(c, [[32, -50], [44, -50], [54, -36], [32, -36]], T); strokeFill(c, col, 0.6 * a, null, 1.3);
  for (const u of [-38, 40]) { const p = T(u, -8); circle(c, p[0], p[1], 9 * s, rgba(PAL.fill, a)); c.beginPath(); c.arc(p[0], p[1], 9 * s, 0, TAU); c.strokeStyle = rgba(col, 0.9 * a); c.lineWidth = 2; c.stroke(); }
  c.restore();
}
/** generic car, side view, heading +x; local centre at ground level, length ≈ 200 */
export function car(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  c.save();
  pathOf(c, [[-100, -12], [-100, -36], [-86, -40], [-52, -42], [-28, -66], [34, -66], [62, -42], [96, -36], [102, -24], [100, -12]], T); strokeFill(c, col, a);
  pathOf(c, [[-20, -44], [-12, -60], [22, -60], [42, -44]], T); strokeFill(c, col, 0.6 * a, null, 1.3);
  for (const u of [-58, 62]) { const p = T(u, -12), q = T(u + 18, -12), r = Math.abs(q[0] - p[0]); circle(c, p[0], p[1], r, rgba(PAL.fill, a)); c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.strokeStyle = rgba(col, 0.9 * a); c.lineWidth = 2; c.stroke(); }
  c.restore();
}
/** hand-held radar speed gun, side view, aiming +x; local origin at the muzzle */
export function speedGun(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  c.save();
  pathOf(c, [[0, -18], [-70, -20], [-74, -16], [-74, 16], [-70, 20], [0, 18]], T); strokeFill(c, col, a);
  pathOf(c, [[0, -22], [8, -22], [8, 22], [0, 22]], T); strokeFill(c, col, a);
  pathOf(c, [[-52, 18], [-60, 64], [-44, 66], [-34, 18]], T); strokeFill(c, col, a);
  pathOf(c, [[-30, 18], [-26, 34]], T, false); strokeFill(c, col, 0.6 * a, null, 1.4);
  c.restore();
}
