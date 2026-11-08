// Drawing helpers for episode 27 (series diagram style: dark field, thin lines, small additive glowing dots).
// Generic line icons only — a surface ship, a submarine and a patrol aircraft drawn as outlines with no real class,
// navy or markings. Strokes stay a constant screen width (≈ 1.5–3 px) whatever the camera zoom.
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
import {rgba, clamp, easeOut, circle, TAU} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');

export const PAL = {
  sig: '#7FD8FF', sigHot: '#E2F7FF',          // secondary: sound arriving from far away (the signal)
  acc: '#FFB85C', accHot: '#FFE4B8',          // accent: answer, beam, our own active ping, big numbers
  noise: '#C9D3E6',                           // neutral: own-ship noise, radio, sunlight
  line: '#C6D3EA', ink: '#EEF1F8', muted: '#93A2C2', faint: 'rgba(150,172,214,0.35)', fill: '#060D22',
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
/** thin glowing ring */
export function ringFx(c, x, y, r, col, a, w = 2, a0 = 0, a1 = TAU) {
  if (a <= 0.01 || r <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, r, a0, a1);
  c.strokeStyle = rgba(col, Math.min(1, a) * 0.2); c.lineWidth = w * 4; c.stroke();
  c.strokeStyle = rgba(col, Math.min(1, a)); c.lineWidth = w; c.stroke(); c.restore();
}
/** an event: a small white flash and two thin rings running out (age in screen seconds) */
export function burst(c, x, y, age, R, col = PAL.accHot, k = 1) {
  if (age < 0 || age > 2.4) return;
  gl(c, x, y, R * 0.45 * (0.6 + age), '#FFFFFF', 0.75 * k * Math.exp(-age / 0.12));
  gl(c, x, y, R * (0.4 + age * 0.7), col, 0.3 * k * Math.exp(-age / 0.35));
  ringFx(c, x, y, R * (0.2 + 1.5 * easeOut(age / 1.3)), col, 0.8 * k * Math.exp(-age / 0.6));
  if (age > 0.16) ringFx(c, x, y, R * (0.15 + 1.05 * easeOut((age - 0.16) / 1.3)), '#FFFFFF', 0.4 * k * Math.exp(-(age - 0.16) / 0.5), 1.4);
}
/** a hydrophone: small cool dot; `age` = seconds since the last wavefront reached it (flash) */
export function hydro(c, x, y, age = 9, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.sig, hot = o.hot || PAL.sigHot, r = o.r ?? 4.5, k = o.k ?? 1;
  if (a <= 0) return;
  gl(c, x, y, r * 3.6, col, 0.35 * a);
  c.save(); c.globalAlpha *= a; circle(c, x, y, r, rgba(col, 0.95)); circle(c, x, y, r * 0.45, rgba(hot, 0.9)); c.restore();
  if (age >= 0 && age < 1.6) {
    const e = Math.exp(-age / 0.28) * k;
    gl(c, x, y, r * (7 + 6 * age), hot, 0.85 * e * a);
    ringFx(c, x, y, r * (1.6 + 4.5 * easeOut(age / 0.9)), col, 0.75 * Math.exp(-age / 0.4) * a * k, 1.6);
  }
}

// ---------------------------------------------------------------- line icons (world units; T maps world → screen)
const LW = 2.2;
function pathOf(c, pts, T, close = true) {
  c.beginPath(); pts.forEach(([x, y], i) => { const p = T(x, y); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); if (close) c.closePath();
}
function strokeFill(c, col, a, fill = PAL.fill, w = LW) {
  if (fill) { c.fillStyle = rgba(fill, 0.92 * a); c.fill(); }
  c.strokeStyle = rgba(col, 0.92 * a); c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}
/** transform helper: origin (ox, oy) in world, scale s, heading sign dir (+1 right, -1 left), then cam.S */
export const xf = (S, ox, oy, s = 1, dir = 1, rot = 0) => (x, y) => {
  const cr = Math.cos(rot), sr = Math.sin(rot), X = dir * x * s, Y = y * s;
  return S(ox + X * cr - Y * sr, oy + X * sr + Y * cr);
};

/** generic surface ship, side view. Local frame: stern at x = 0, bow at x = 262, waterline y = 0 (y down).
 *  Returns the propeller position (local) for noise emission. */
export function shipSide(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  c.save();
  pathOf(c, [[0, -24], [200, -24], [262, -34], [246, -4], [232, 18], [36, 20], [10, 13], [0, -4]], T); strokeFill(c, col, a);
  pathOf(c, [[70, -24], [70, -54], [150, -54], [150, -72], [192, -72], [196, -54], [176, -54], [176, -24]], T, false); strokeFill(c, col, a, null, 1.8);
  pathOf(c, [[98, -54], [102, -78], [122, -78], [124, -54]], T, false); strokeFill(c, col, a, null, 1.8);
  pathOf(c, [[140, -72], [140, -114]], T, false); strokeFill(c, col, a, null, 1.6);
  pathOf(c, [[128, -102], [152, -102]], T, false); strokeFill(c, col, a, null, 1.6);
  pathOf(c, [[156, -64], [188, -64]], T, false); strokeFill(c, col, 0.6 * a, null, 1.4);           // bridge windows
  pathOf(c, [[36, 20], [232, 18]], T, false); strokeFill(c, col, 0.5 * a, null, 1.2);
  // propeller (spins)
  const [px, py] = T(14, 12), [qx] = T(20, 12), r = Math.max(3, Math.abs(qx - px) * 0.8), sp = (o.spin ?? 0);
  c.strokeStyle = rgba(col, 0.85 * a); c.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) { const an = sp + k * TAU / 3; c.beginPath(); c.moveTo(px, py); c.lineTo(px + r * 1.4 * Math.cos(an) * 0.35, py + r * 1.4 * Math.sin(an)); c.stroke(); }
  c.restore();
  return [14, 12];
}
/** generic submarine, side view. Local frame: centre at origin, nose at +128, tail at −128 */
export function subSide(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  const hull = [];
  for (let k = 0; k <= 12; k++) { const an = -Math.PI / 2 + k * Math.PI / 12; hull.push([104 + 18 * Math.cos(an), 18 * Math.sin(an)]); }
  hull.push([-60, 18], [-122, 6], [-122, -6], [-60, -18]);
  c.save();
  pathOf(c, hull, T); strokeFill(c, col, a);
  pathOf(c, [[36, -18], [44, -46], [76, -46], [82, -18]], T); strokeFill(c, col, a);
  pathOf(c, [[-104, -9], [-114, -28], [-124, -28], [-121, -6]], T); strokeFill(c, col, a, PAL.fill, 1.8);
  pathOf(c, [[-104, 9], [-114, 28], [-124, 28], [-121, 6]], T); strokeFill(c, col, a, PAL.fill, 1.8);
  const [px, py] = T(-130, 0), [qx] = T(-124, 0), r = Math.max(3, Math.abs(qx - px)), sp = o.spin ?? 0;
  c.strokeStyle = rgba(col, 0.85 * a); c.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) { const an = sp + k * TAU / 3; c.beginPath(); c.moveTo(px, py); c.lineTo(px + r * 0.45 * Math.cos(an), py + r * 1.6 * Math.sin(an)); c.stroke(); }
  c.restore();
  return [-130, 0];
}
/** generic propeller patrol aircraft, side view, heading +x. Local frame: centre at origin, nose at +122 */
export function planeSide(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  const body = [];
  for (let k = 0; k <= 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 10; body.push([100 + 22 * Math.cos(an), -1 + 13 * Math.sin(an)]); }
  body.push([-40, 12], [-112, -4], [-124, -12], [-60, -14]);
  c.save();
  pathOf(c, body, T); strokeFill(c, col, a);
  pathOf(c, [[-82, -14], [-106, -56], [-122, -56], [-120, -12]], T); strokeFill(c, col, a);
  pathOf(c, [[-110, -8], [-80, -8]], T, false); strokeFill(c, col, a, null, 1.6);                        // tailplane
  pathOf(c, [[-14, -3], [56, -3]], T, false); strokeFill(c, col, a, null, 3.2);                          // wing seen edge-on
  for (const ex of [8, 34]) { pathOf(c, [[ex - 10, 2], [ex + 22, 2], [ex + 22, 10], [ex - 10, 10]], T); strokeFill(c, col, a, PAL.fill, 1.6);
    const [x0, y0] = T(ex + 25, -6), [, y1] = T(ex + 25, 18); c.strokeStyle = rgba(col, 0.55 * a); c.lineWidth = 1.4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y1); c.stroke(); }
  pathOf(c, [[80, -6], [96, -6]], T, false); strokeFill(c, col, 0.6 * a, null, 1.4);                     // cockpit
  c.restore();
}
/** generic surface ship seen from above (plan view). Local frame: centre at origin, bow at +130 */
export function shipTop(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  c.save();
  pathOf(c, [[130, 0], [96, -15], [-110, -17], [-126, -12], [-126, 12], [-110, 17], [96, 15]], T); strokeFill(c, col, a);
  pathOf(c, [[-60, -9], [30, -9], [30, 9], [-60, 9]], T); strokeFill(c, col, 0.8 * a, null, 1.6);
  pathOf(c, [[40, -6], [62, -6], [62, 6], [40, 6]], T); strokeFill(c, col, 0.8 * a, null, 1.6);
  c.restore();
}
/** generic submarine seen from above */
export function subTop(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  const hull = [];
  for (let k = 0; k <= 12; k++) { const an = -Math.PI / 2 + k * Math.PI / 12; hull.push([100 + 16 * Math.cos(an), 16 * Math.sin(an)]); }
  hull.push([-60, 16], [-118, 5], [-118, -5], [-60, -16]);
  c.save(); pathOf(c, hull, T); strokeFill(c, col, a);
  pathOf(c, [[40, -5], [76, -5], [76, 5], [40, 5]], T); strokeFill(c, col, 0.8 * a, null, 1.5);
  pathOf(c, [[-104, -5], [-114, -22], [-120, -22], [-118, -4]], T); strokeFill(c, col, 0.8 * a, null, 1.5);
  pathOf(c, [[-104, 5], [-114, 22], [-120, 22], [-118, 4]], T); strokeFill(c, col, 0.8 * a, null, 1.5);
  c.restore();
}
/** sonobuoy at the surface (local: float centre at origin, y down); returns nothing. `depth` = hydrophone depth below (world) */
export function buoySide(c, T, o = {}) {
  const a = o.alpha ?? 1, col = o.col || PAL.line; if (a <= 0) return;
  c.save();
  pathOf(c, [[-7, -10], [7, -10], [7, 14], [-7, 14]], T); strokeFill(c, col, a, PAL.fill, 1.8);
  pathOf(c, [[0, -10], [0, -34]], T, false); strokeFill(c, col, a, null, 1.5);
  const [tx, ty] = T(0, -34); circle(c, tx, ty, 2.5, rgba(col, a));
  if (o.depth > 0) { pathOf(c, [[0, 14], [0, 14 + o.depth]], T, false); strokeFill(c, col, 0.55 * a, null, 1.2); }
  c.restore();
}
/** a soft dark gradient behind a text line (labels stay readable over lines and dots) */
export function backing(c, x0, y, w, size, a = 1) {
  const g = c.createLinearGradient(0, y - size, 0, y + size); g.addColorStop(0, 'rgba(4,8,22,0)'); g.addColorStop(0.5, `rgba(4,8,22,${0.6 * a})`); g.addColorStop(1, 'rgba(4,8,22,0)');
  c.fillStyle = g; c.fillRect(x0 - 24, y - size, w + 48, size * 2);
}
export {clamp};
