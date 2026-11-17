// Pixel-layer tool for the 100 m piece. Adapted from samples/look-proposal-pixel/px.mjs:
// a 360x640 buffer of flat colours and 4x4 Bayer dither, upscaled x3 (nearest neighbour) to 1080x1920.
// Type is never drawn here; it goes on top of the upscaled picture, crisp.
export const W = 360, H = 640, SCALE = 3;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
/** works for negative integers too (two's complement & 3) — use world coordinates for scenery so dither never crawls */
export const bayer = (x, y) => B4[(y & 3) * 4 + (x & 3)];
export const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, q) => a + (b - a) * q;
export const smooth = q => { q = clamp(q); return q * q * (3 - 2 * q); };
export const ease = (t, t0, t1) => smooth((t - t0) / (t1 - t0));
/** integer hash -> [0,1) (stable for any ints, including negatives) */
export const ih = (a, b = 0, c = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
export const shade = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];

// One palette: night stadium (navy shadows), terracotta track, cream lines, a little amber light.
export const C = Object.fromEntries(Object.entries({
  ink: '#070B17', night: '#0C1224', navy: '#121A31', navy2: '#1A2442', navy3: '#243154', slate: '#34405F', slate2: '#4A5677',
  track: '#B4523A', track2: '#A54933', track3: '#C2613F', trackDark: '#8B3B2B', line: '#F0E4C8', white: '#FFFFFF',
  apron: '#7C3A2D', apron2: '#713427', walk: '#262E45', walk2: '#2C3550', kerb: '#D9D3C3',
  grass: '#1B4430', grass2: '#215036', grass3: '#173A29',
  amber: '#F2A742', gold: '#F7C766', cream: '#FBEBC0', block: '#5C6684', block2: '#8C95AF',
  black: '#14161C', shadow: '#2A1A1C',
}).map(([k, v]) => [k, hex(v)]));

export class Pix {
  constructor() { this.buf = new Uint8ClampedArray(W * H * 4); this.big = new Uint8ClampedArray(W * SCALE * H * SCALE * 4); }
  px(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4, b = this.buf; b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255; }
  /** dithered alpha; (wx, wy) = coordinates used for the threshold (pass world coords for scenery) */
  pxA(x, y, c, a, wx = x, wy = y) { if (a > bayer(wx | 0, wy | 0)) this.px(x, y, c); }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h), b = this.buf;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0, o = (yy * W + x0) * 4; xx < x1; xx++, o += 4) { b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255; }
  }
  disc(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) this.px(x, y, c); } }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { this.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** a limb: Bresenham line stamped with a w x w square */
  thick(x0, y0, x1, y1, w, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const o = Math.floor((w - 1) / 2);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { this.rect(x0 - o, y0 - o, w, w, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** nearest-neighbour upscale into this.big (RGBA, W*SCALE x H*SCALE) */
  upscale() {
    const s = this.buf, d = this.big, BW = W * SCALE;
    for (let y = 0; y < H; y++) {
      const row0 = y * SCALE * BW * 4;
      for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, r = s[o], g = s[o + 1], b = s[o + 2]; for (let k = 0; k < SCALE; k++) { const q = row0 + (x * SCALE + k) * 4; d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = 255; } }
      for (let k = 1; k < SCALE; k++) d.copyWithin(row0 + k * BW * 4, row0, row0 + BW * 4);
    }
    return d;
  }
}
