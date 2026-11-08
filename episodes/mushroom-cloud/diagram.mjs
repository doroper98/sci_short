// Diagram-style drawing for episode 22 (series look: dark field, thin lines, small glowing dots).
//  - DotBuf: additive accumulation of small gaussian dots at screen resolution, soft tone map, a small halo (quarter-res
//    blur limited to the dots' bounding box — not a full-screen bloom).
//  - smooth121 / contourPath: marching-squares isolines of a gridded field, drawn as thin strokes.
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');

export class DotBuf {
  constructor(W = 1080, H = 1920) {
    const n = W * H;
    Object.assign(this, {W, H, R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n)});
    this.cv = createCanvas(W, H); this.cc = this.cv.getContext('2d'); this.img = this.cc.createImageData(W, H);
    this.sm = createCanvas(Math.ceil(W / 4), Math.ceil(H / 4)); this.smc = this.sm.getContext('2d');
    this.box = [W, H, 0, 0]; this.prev = [0, 0, 0, 0];
  }
  begin() {
    const [x0, y0, x1, y1] = this.prev;
    for (let y = y0; y < y1; y++) { const o = y * this.W; this.R.fill(0, o + x0, o + x1); this.G.fill(0, o + x0, o + x1); this.B.fill(0, o + x0, o + x1); }
    this.box = [this.W, this.H, 0, 0]; this.prev = [0, 0, 0, 0]; return this;
  }
  /** gaussian dot: rad ≈ visible radius in px, col = [r, g, b] (0–1), I = intensity */
  dot(x, y, col, I, rad = 1.2) {
    if (!(I > 0.002)) return;
    const s = Math.max(1, Math.ceil(rad * 1.5)), xi = Math.round(x), yi = Math.round(y), W = this.W, H = this.H;
    if (xi + s < 0 || xi - s >= W || yi + s < 0 || yi - s >= H) return;
    const x0 = Math.max(0, xi - s), x1 = Math.min(W - 1, xi + s), y0 = Math.max(0, yi - s), y1 = Math.min(H - 1, yi + s), k2 = 1 / (2 * (rad * 0.55) ** 2);
    const b = this.box; if (x0 < b[0]) b[0] = x0; if (y0 < b[1]) b[1] = y0; if (x1 + 1 > b[2]) b[2] = x1 + 1; if (y1 + 1 > b[3]) b[3] = y1 + 1;
    const {R, G, B} = this, cr = col[0] * I, cg = col[1] * I, cb = col[2] * I;
    for (let yy = y0; yy <= y1; yy++) { const dy = yy - y, o = yy * W, ey = dy * dy;
      for (let xx = x0; xx <= x1; xx++) { const dx = xx - x, w = Math.exp(-(dx * dx + ey) * k2); if (w < 0.01) continue; const i = o + xx; R[i] += w * cr; G[i] += w * cg; B[i] += w * cb; } }
  }
  /** composite additively onto the stage; gain sets the soft saturation, halo the small glow around the dots */
  flush(stage, {gain = 1.2, halo = 0.35, alpha = 1, haloBlur = 3} = {}) {
    const [x0, y0, x1, y1] = this.box; this.prev = [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
    if (x1 <= x0 || y1 <= y0 || alpha <= 0) return;
    const {W, R, G, B, img} = this, dd = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, j = i * 4, r = R[i] * gain, g = G[i] * gain, b = B[i] * gain;
      dd[j] = 255 * r / (1 + r); dd[j + 1] = 255 * g / (1 + g); dd[j + 2] = 255 * b / (1 + b); dd[j + 3] = 255;
    }
    this.cc.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    const c = stage.ctx;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha;
    c.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    if (halo > 0) {
      const sm = this.sm, sc = this.smc, q = 0.25, pad = 6;
      const a0 = Math.max(0, Math.floor(x0 * q) - pad), b0 = Math.max(0, Math.floor(y0 * q) - pad), a1 = Math.min(sm.width, Math.ceil(x1 * q) + pad), b1 = Math.min(sm.height, Math.ceil(y1 * q) + pad);
      sc.globalCompositeOperation = 'copy'; sc.filter = 'none'; sc.clearRect(0, 0, sm.width, sm.height);
      sc.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
      sc.globalCompositeOperation = 'source-over'; sc.filter = `blur(${haloBlur}px)`; sc.drawImage(sm, a0, b0, a1 - a0, b1 - b0, a0, b0, a1 - a0, b1 - b0); sc.filter = 'none';
      c.globalAlpha = alpha * halo; c.drawImage(sm, a0, b0, a1 - a0, b1 - b0, a0 / q, b0 / q, (a1 - a0) / q, (b1 - b0) / q);
    }
    c.restore();
    // the canvas keeps old pixels outside the next box: clear what we wrote
    this.cc.clearRect(x0, y0, x1 - x0, y1 - y0);
  }
}

/** [1 2 1]/4 separable smoothing of rows j0..j1 (in place through tmp), `passes` times */
export function smooth121(F, W, H, j0, j1, tmp, passes = 2) {
  j0 = Math.max(0, j0); j1 = Math.min(H - 1, j1);
  for (let p = 0; p < passes; p++) {
    for (let j = j0; j <= j1; j++) { const o = j * W; for (let i = 0; i < W; i++) tmp[o + i] = 0.25 * F[o + Math.max(0, i - 1)] + 0.5 * F[o + i] + 0.25 * F[o + Math.min(W - 1, i + 1)]; }
    for (let j = j0; j <= j1; j++) { const o = j * W, om = Math.max(j0, j - 1) * W, op = Math.min(j1, j + 1) * W; for (let i = 0; i < W; i++) F[o + i] = 0.25 * tmp[om + i] + 0.5 * tmp[o + i] + 0.25 * tmp[op + i]; }
  }
}

/** marching squares: append the isoline F = lev (rows j0..j1) to the current path; X(i), Y(j) map grid node → screen */
export function contourPath(ctx, F, W, H, lev, j0, j1, X, Y) {
  j0 = Math.max(0, j0); j1 = Math.min(H - 1, j1);
  const seg = (ax, ay, bx, by) => { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); };
  for (let j = j0; j < j1; j++) {
    const yA = Y(j), yB = Y(j + 1);
    for (let i = 0; i < W - 1; i++) {
      const a = F[i + j * W], b = F[i + 1 + j * W], c = F[i + 1 + (j + 1) * W], d = F[i + (j + 1) * W];
      const k = (a > lev ? 1 : 0) | (b > lev ? 2 : 0) | (c > lev ? 4 : 0) | (d > lev ? 8 : 0);
      if (k === 0 || k === 15) continue;
      const xA = X(i), xB = X(i + 1);
      const eB = () => [xA + (xB - xA) * (lev - a) / (b - a), yA];            // bottom edge a–b (row j)
      const eR = () => [xB, yA + (yB - yA) * (lev - b) / (c - b)];            // right edge b–c
      const eT = () => [xA + (xB - xA) * (lev - d) / (c - d), yB];            // top edge d–c (row j+1)
      const eL = () => [xA, yA + (yB - yA) * (lev - a) / (d - a)];            // left edge a–d
      let p, q, r, s;
      switch (k) {
        case 1: case 14: [p, q] = [eB(), eL()]; seg(p[0], p[1], q[0], q[1]); break;
        case 2: case 13: [p, q] = [eB(), eR()]; seg(p[0], p[1], q[0], q[1]); break;
        case 3: case 12: [p, q] = [eL(), eR()]; seg(p[0], p[1], q[0], q[1]); break;
        case 4: case 11: [p, q] = [eR(), eT()]; seg(p[0], p[1], q[0], q[1]); break;
        case 6: case 9: [p, q] = [eB(), eT()]; seg(p[0], p[1], q[0], q[1]); break;
        case 7: case 8: [p, q] = [eL(), eT()]; seg(p[0], p[1], q[0], q[1]); break;
        case 5: case 10: {
          const m = (a + b + c + d) / 4, up = (m > lev) === (k === 5);
          [p, q, r, s] = [eB(), eL(), eR(), eT()];
          if (up) { seg(p[0], p[1], r[0], r[1]); seg(q[0], q[1], s[0], s[1]); } else { seg(p[0], p[1], q[0], q[1]); seg(r[0], r[1], s[0], s[1]); }
          break;
        }
      }
    }
  }
}
