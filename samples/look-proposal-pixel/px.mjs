// 화풍 시안용 픽셀 그림 도구 (2026-11-15, 시안 — 표준 도구가 아님): 270×480 버퍼에 납작한 색·띠·점묘(바이어 디더)로 그리고 4배로 키운다.
// 글자는 여기서 그리지 않는다(키운 뒤 1080×1920 위에 또렷하게 얹는다).
export const W = 270, H = 480, SCALE = 4;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const bayer = (x, y) => B4[(y & 3) * 4 + (x & 3)];
export const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, q) => a + (b - a) * q;
export const smooth = q => { q = clamp(q); return q * q * (3 - 2 * q); };
export const ease = (t, t0, t1) => smooth((t - t0) / (t1 - t0));
export const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// 한 벌의 색(레퍼런스의 색을 베끼지 않고 새로 고른 해질녘 계열)
export const C = Object.fromEntries(Object.entries({
  ink: '#0C1424', navy: '#172238', navy2: '#22304C', slate: '#3A4868', deep: '#0F3540', teal: '#1E5560', teal2: '#2F7478', sage: '#6B9C8E',
  mist: '#A9C4B4', amber: '#F2A742', gold: '#F7C766', cream: '#FBEBC0', orange: '#E3743A', rust: '#B5482F', maroon: '#7C2B3C', mauve: '#B26A80',
  rose: '#D79AA0', white: '#F6EFE2', sand: '#C99A62', rock: '#2A3148', rock2: '#3B4460', grey: '#8D93A6', grey2: '#B9BDC9', moon: '#9A9BB4', moon2: '#6F7190', moon3: '#4A4C6C',
}).map(([k, v]) => [k, hex(v)]));

export class Pix {
  constructor() { this.buf = new Uint8ClampedArray(W * H * 4); this.big = new Uint8ClampedArray(W * SCALE * H * SCALE * 4); }
  px(x, y, c) { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = ((y | 0) * W + (x | 0)) * 4, b = this.buf; b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255; }
  /** alpha by dither: the pixel is either painted or not */
  pxA(x, y, c, a) { if (a > bayer(x | 0, y | 0)) this.px(x, y, c); }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h), b = this.buf;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0, o = (yy * W + x0) * 4; xx < x1; xx++, o += 4) { b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255; }
  }
  /** rect where each pixel takes c2 when level(x,y) beats the dither threshold, else c1 (c1 null = leave) */
  rectMix(x, y, w, h, c1, c2, level) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const f = typeof level === 'function' ? level : () => level;
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      if (f(xx, yy) > bayer(xx, yy)) this.px(xx, yy, c2); else if (c1) this.px(xx, yy, c1);
    }
  }
  /** horizontal colour bands with dithered seams. stops: [[y, colour], …] in screen rows, top to bottom */
  bands(x, w, stops, yEnd, soft = 5) {
    for (let i = 0; i < stops.length; i++) {
      const [y0, c] = stops[i], y1 = i + 1 < stops.length ? stops[i + 1][0] : yEnd;
      this.rect(x, y0, w, y1 - y0, c);
      if (i + 1 < stops.length) { const c2 = stops[i + 1][1]; this.rectMix(x, y1 - soft, w, soft * 2, null, c2, (xx, yy) => (yy - (y1 - soft)) / (soft * 2)); }
    }
  }
  disc(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) this.px(x, y, c); } }
  ring(cx, cy, r, th, c, a = 1, half = 0) {     // half: 0 full, 1 lower half only, -1 upper half only
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (half === 1 && dy < 0) continue; if (half === -1 && dy > 0) continue;
      if (d <= r && d > r - th) { if (a >= 1) this.px(x, y, c); else this.pxA(x, y, c, a); }
    }
  }
  /** dithered radial glow */
  glow(cx, cy, r, c, max = 0.8, pow = 1.6) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d < r) this.pxA(x, y, c, max * Math.pow(1 - d / r, pow));
    }
  }
  line(x0, y0, x1, y1, c, dash = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy, n = 0;
    for (;;) { if (!dash || (n++ % (dash * 2)) < dash) this.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  poly(pts, c) {
    let ymin = Infinity, ymax = -Infinity; for (const p of pts) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
    for (let y = Math.max(0, Math.floor(ymin)); y <= Math.min(H - 1, Math.ceil(ymax)); y++) {
      const xs = [], yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) this.rect(Math.round(xs[i]), y, Math.max(1, Math.round(xs[i + 1]) - Math.round(xs[i])), 1, c);
    }
  }
  /** nearest-neighbour upscale into this.big (RGBA, W*SCALE × H*SCALE) */
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
