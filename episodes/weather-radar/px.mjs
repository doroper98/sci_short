// 64번 기상 레이더(픽셀 + 3D 화풍 시험, 2026-11-15)의 픽셀 그림 도구 — episodes/tsunami/px.mjs 를 옮겨 와 넓힌 것.
// 넓힌 것: ① 이 편의 색 한 벌(흐린 낮 — 2026-11-15 사용자 "하늘을 꼭 노을로 정해놓지 마") ② 빛 지도(HDR): 화소마다 '빛나는 정도'를 함께 적는다
//   (P.emit = 0..1 로 켜고 그린 화소만 빛난다. 뒤에 다른 것을 덧그리면 그 화소의 빛은 꺼진다 — 가려짐이 그대로 반영된다) ③ 3D 층 합성(blit3d).
// 270×480 버퍼에 납작한 색·띠·점묘로 그리고 4배로 키운다.
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

// 이 편의 색 한 벌: 비 오는 낮. 하늘은 위가 짙고(머리글 자리) 수평선 쪽이 밝다. 빛나는 색은 전파·신호·화면에만 쓴다.
export const C = Object.fromEntries(Object.entries({
  ink: '#0E1620', night: '#17222E', storm: '#24384A', steel: '#35506A', sky: '#4D6C84', sky2: '#6C8A9E', haze: '#93ABB8', pale: '#BCCBD0',
  cloud: '#E3E8E8', cloud2: '#B4BEC6', cloud3: '#7F8C9A', cloud4: '#56626F', rain: '#9CC3D6',
  hill: '#6E8F86', hill2: '#55766C', grass: '#5E8A5A', grass2: '#46703F', grass3: '#33562F', soil: '#3A3F3A', soil2: '#2A2E2C', rock: '#59616A', rock2: '#3F464E',
  white: '#F4F1E8', metal: '#C9CDD2', metal2: '#989FA8', metal3: '#666E78', metal4: '#3E454E', roof: '#A8483A', roof2: '#7A3028', wall: '#D7C9A8', wall2: '#A99C80',
  amber: '#F2A742', gold: '#F7C766', cream: '#FBEBC0', red: '#D8503C', blue: '#2F6FB8',
  e1: '#4CAF6A', e2: '#B7D650', e3: '#F0D24A', e4: '#F29A3C', e5: '#D8503C',
  panel: '#131C26', panel2: '#1E2B38', line: '#3C5266', mist: '#A9C4B4',
}).map(([k, v]) => [k, hex(v)]));

export class Pix {
  constructor() { this.buf = new Uint8ClampedArray(W * H * 4); this.big = new Uint8ClampedArray(W * SCALE * H * SCALE * 4); this.gb = new Uint8Array(W * H); this.gbig = new Uint8ClampedArray(W * 2 * H * 2 * 4); this.emit = 0; this.anyLit = false; }
  /** 프레임을 그리기 전에: 빛 지도를 지운다 */
  begin() { this.gb.fill(0); this.emit = 0; this.anyLit = false; }
  /** fn 안에서 그린 화소는 빛난다(HDR 판에서 밝아진다). level 0..1 */
  lit(level, fn) { const prev = this.emit; this.emit = level; try { fn(); } finally { this.emit = prev; } }
  px(x, y, c) { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y | 0) * W + (x | 0), o = i * 4, b = this.buf; b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255; const g = this.emit * 255; this.gb[i] = g; if (g) this.anyLit = true; }
  /** alpha by dither: the pixel is either painted or not */
  pxA(x, y, c, a) { if (a > bayer(x | 0, y | 0)) this.px(x, y, c); }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h), b = this.buf;
    const g = this.emit * 255; if (g) this.anyLit = true;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0, o = (yy * W + x0) * 4; xx < x1; xx++, o += 4) { b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = 255; this.gb[yy * W + xx] = g; }
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
  /** 빛 지도를 2배로 키운다(540×960 RGBA, 흑백) — pipeline/render 의 stage.gain 캔버스에 그대로 넣는다 */
  upscaleGain() {
    const s = this.gb, d = this.gbig, BW = W * 2;
    for (let y = 0; y < H; y++) {
      const row0 = y * 2 * BW * 4;
      for (let x = 0; x < W; x++) { const v = s[y * W + x]; for (let k = 0; k < 2; k++) { const q = row0 + (x * 2 + k) * 4; d[q] = v; d[q + 1] = v; d[q + 2] = v; d[q + 3] = 255; } }
      d.copyWithin(row0 + BW * 4, row0, row0 + BW * 4);
    }
    return d;
  }
  /**
   * 3D 층({id, light}: three3d.mjs)을 색 사다리로 칠한다. ramps[번호] = [어두운 색 … 밝은 색]. 번호가 바뀌는 곳에는 윤곽선.
   * o: {dx, dy 옮길 픽셀, outline 색(null 이면 없음), only(id) → 그릴지, alpha(x, y, id) → 0..1 점묘 투명도, emit(id) → 0..1 빛나는 정도, flat: Set(윤곽선 없는 번호)}
   */
  blit3d(layer, ramps, o = {}) {
    const {id, light} = layer, outline = o.outline === undefined ? C.ink : o.outline, dx = Math.round(o.dx || 0), dy = Math.round(o.dy || 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, n = id[i]; if (!n || (o.only && !o.only(n))) continue;
      if (o.alpha && o.alpha(x + dx, y + dy, n) <= bayer(x + dx, y + dy)) continue;
      const ramp = ramps[n] || ramps[0];
      const fl = o.flat, df = m => m !== n && !(fl && fl.has(m));                 // flat: 윤곽선을 만들지 않는 번호(땅 위에 그은 선)
      const edge = outline && !(fl && fl.has(n)) && ((x + 1 < W && df(id[i + 1])) || (y + 1 < H && df(id[i + W])) || (x > 0 && id[i - 1] === 0) || (y > 0 && id[i - W] === 0));
      const prev = this.emit; if (o.emit) this.emit = o.emit(n);
      this.px(x + dx, y + dy, edge ? outline : ramp[clamp(Math.floor(light[i] / 255 * ramp.length + (bayer(x, y) - 0.5) * 0.9), 0, ramp.length - 1)]);
      this.emit = prev;
    }
  }
}
