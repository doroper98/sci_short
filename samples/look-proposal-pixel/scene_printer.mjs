// 화풍 시안 03 — 3D 프린터(대기열 59번). 녹인 플라스틱을 한 줄씩 긋고, 한 층 위에 또 한 층을 쌓는다.
// 픽셀 한 줄이 한 층이다. 갓 나온 자리는 뜨겁고(밝음), 식으며 제 색이 된다.
import {W, H, C, hex, bayer, clamp, lerp, smooth, ease, hash} from './px.mjs';
export const DUR = 15;

const NL = 96, BED = -8;
const hw = k => Math.max(1, Math.round(k < 16 ? 9 + 11 * (1 - k / 16) ** 1.2 : k < 66 ? 9 : 9 * (1 - ((k - 66) / 30) ** 1.7)));
// layers printed (continuous) at time t: slow while we look closely, then fast-forward
const Lraw = t => t < 1.6 ? 4 + 0.22 * t : t < 6.0 ? 4.35 + (t - 1.6) * 0.85 : Math.min(NL, 8.09 + (NL - 8.09) * smooth((t - 6.0) / 5.6) ** 0.9);
const TAB = Array.from({length: 15 * 120 + 1}, (_, i) => Lraw(i / 120));
const timeOf = L => { let a = 0, b = TAB.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (TAB[m] < L) a = m; else b = m; } return b / 120; };
const LAYER_T = Array.from({length: NL + 1}, (_, k) => timeOf(k));
export const progress = t => { const L = Math.min(NL, Lraw(t)); return {L, layer: Math.min(NL, Math.floor(L) + 1), minutes: L * 1.98}; };

function head(t) {
  const L = Lraw(t), done = L >= NL, k = Math.min(NL - 1, Math.floor(L)), f = done ? 1 : L - k, w = hw(k), dir = k % 2 === 0 ? 1 : -1;
  const lift = done ? 16 * ease(t, timeOf(NL - 0.001), timeOf(NL - 0.001) + 1.0) : 0;
  return {k, f, x: dir > 0 ? -w + f * 2 * w : w - f * 2 * w, y: BED - k - 1 - lift, done};
}
function cam(t) {
  const h = head(t), wide = {x: 0, y: -80, z: 1.25}, macro = {x: h.x * 0.8, y: h.y - 5, z: 3.3}, back = {x: 0, y: -44 - 0.32 * Math.min(NL, Lraw(t)), z: 1.5};
  const a = ease(t, 1.6, 3.4), b = ease(t, 5.6, 7.3);
  const mix = (p, q, u) => ({x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), z: Math.exp(lerp(Math.log(p.z), Math.log(q.z), u))});
  return mix(mix(wide, macro, a), back, b);
}
const HOT = [[0.16, hex('#FFF7DC')], [0.45, C.gold], [0.95, C.amber], [1.7, C.orange]];
const baseCol = (k, x) => (k >= 50 && k <= 56 && Math.abs(x) <= 3 && (k - 53) ** 2 + x * x <= 11) ? C.teal2 : (k >= 38 && k <= 43) || (k >= 62 && k <= 64) ? C.rust : C.cream;

export function draw(P, t) {
  const c = cam(t), sx = wx => (wx - c.x) * c.z + 135, sy = wy => (wy - c.y) * c.z + 200;
  const R = (wx, wy, ww, wh, col) => { const x0 = Math.round(sx(wx)), y0 = Math.round(sy(wy)); P.rect(x0, y0, Math.max(1, Math.round(sx(wx + ww)) - x0), Math.max(1, Math.round(sy(wy + wh)) - y0), col); };
  const zb = 1 + (c.z - 1) * 0.5, bx = wx => (wx - c.x * 0.55) * zb + 135, by = wy => (wy - c.y * 0.55 - 40) * zb + 200;
  const B = (wx, wy, ww, wh, col) => { const x0 = Math.round(bx(wx)), y0 = Math.round(by(wy)); P.rect(x0, y0, Math.max(1, Math.round(bx(wx + ww)) - x0), Math.max(1, Math.round(by(wy + wh)) - y0), col); };
  // wall
  const wy0 = Math.round(by(-40));
  P.bands(0, W, [[0, C.ink], [wy0 - 150, C.navy], [wy0 - 60, C.navy2]], H, 6);
  // window with the evening outside
  const wx0 = Math.round(bx(84)), wyt = Math.round(by(-168)), ww = Math.round(62 * zb), wh = Math.round(84 * zb);
  P.bands(wx0, ww, [[wyt, C.teal], [wyt + wh * 0.3, C.teal2], [wyt + wh * 0.52, C.sage], [wyt + wh * 0.7, C.amber], [wyt + wh * 0.84, C.orange]], wyt + wh, 3);
  for (let i = 0; i < 9; i++) { const hh = Math.round((8 + 16 * hash(i, 41)) * zb), xx = wx0 + Math.round(i * ww / 9); P.rect(xx, wyt + wh - hh, Math.ceil(ww / 9), hh, C.navy); if (hash(i, 42) > 0.4) P.rect(xx + 2, wyt + wh - hh + 3, 1, 2, C.gold); }
  P.rect(wx0 - 2, wyt - 2, ww + 4, 2, C.slate); P.rect(wx0 - 2, wyt + wh, ww + 4, 3, C.slate); P.rect(wx0 - 2, wyt, 2, wh, C.slate); P.rect(wx0 + ww, wyt, 2, wh, C.slate); P.rect(wx0 + (ww >> 1), wyt, 1, wh, C.slate);
  // shelf with spare spools and boxes, lamp
  B(88, -62, 62, 3, C.slate);
  [[92, 14, 18, C.maroon], [110, 10, 12, C.teal], [124, 16, 22, C.rust]].forEach(([x, w, h, col]) => B(x, -62 - h, w, h, col));
  // desk with drawers
  R(-220, 0, 440, 5, C.maroon); R(-220, 0, 440, 1, C.mauve); R(-220, 5, 440, 220, C.navy);
  for (const dx of [-150, -40, 70]) { R(dx, 12, 96, 30, C.navy2); R(dx, 12, 96, 1, C.slate); R(dx, 48, 96, 30, C.navy2); R(dx, 48, 96, 1, C.slate); }
  // desk lamp to the left of the printer: its light falls on the desk
  P.glow(sx(-88), sy(-26), 34 * c.z, C.cream, 0.3, 1.25);
  R(-108, -3, 14, 3, C.slate); P.line(sx(-101), sy(-3), sx(-106), sy(-46), C.slate); P.line(sx(-106), sy(-46), sx(-92), sy(-62), C.slate);
  P.poly([[sx(-98), sy(-66)], [sx(-84), sy(-60)], [sx(-80), sy(-50)], [sx(-96), sy(-55)]], C.rust); R(-90, -53, 5, 2, C.cream);
  // printer frame
  R(-78, -176, 156, 6, C.slate); R(-78, -176, 156, 1, C.grey);
  for (const px of [-76, 70]) { R(px, -170, 6, 170, C.navy2); R(px, -170, 1, 170, C.slate); }
  R(-66, -4, 132, 4, C.slate); R(-62, BED, 124, 4, C.rock2); R(-62, BED, 124, 1, C.grey);
  // printed part: finished rows as bars, the newest pixels by their age
  const h = head(t), L = Math.min(NL, Lraw(t));
  for (let k = 0; k <= Math.min(NL - 1, h.k); k++) {
    const w = hw(k), n = 2 * w, dir = k % 2 === 0 ? 1 : -1, t0 = LAYER_T[k], t1 = LAYER_T[k + 1], full = k < h.k || h.done;
    if (full && t - t1 > 1.75) { R(-w, BED - k - 1, n, 1, C.cream); for (let x = -w; x < w; x++) { const b = baseCol(k, x + 0.5); if (b !== C.cream) R(x, BED - k - 1, 1, 1, b); } continue; }
    const cnt = full ? n : Math.floor(h.f * n);
    for (let j = 0; j < cnt; j++) {
      const x = dir > 0 ? -w + j : w - 1 - j, age = t - (t0 + (t1 - t0) * (j + 1) / n);
      let col = baseCol(k, x + 0.5); for (const [a, hc] of HOT) if (age < a) { col = hc; break; }
      R(x, BED - k - 1, 1, 1, col);
    }
  }
  // gantry, filament, head
  const rail = h.y - 16; R(-70, rail, 140, 3, C.slate); R(-70, rail, 140, 1, C.grey);
  const spx = 60, spy = -204;
  P.line(sx(spx - 12), sy(spy + 4), sx(h.x), sy(h.y - 34), C.amber); P.line(sx(h.x), sy(h.y - 34), sx(h.x), sy(h.y - 8), C.amber);
  const sr = 15 * c.z; P.disc(sx(spx), sy(spy), sr, C.amber); P.disc(sx(spx), sy(spy), sr * 0.82, C.gold); P.disc(sx(spx), sy(spy), sr * 0.42, C.navy2); P.disc(sx(spx), sy(spy), sr * 0.16, C.grey);
  R(spx - 1, spy + 15, 2, 14, C.navy2);
  R(h.x - 10, h.y - 26, 20, 18, C.grey2); R(h.x - 10, h.y - 26, 20, 1, C.white); R(h.x - 10, h.y - 9, 20, 1, C.grey); R(h.x - 2, h.y - 26, 4, 18, C.slate); R(h.x - 0.5, h.y - 26, 1, 18, C.amber);
  for (let q = 0; q < 3; q++) R(h.x + 4, h.y - 24 + q * 2.5, 5, 1, C.grey);        // vent slits
  {                                                                              // a toothed drive wheel pushes the filament against a small idler
    const gx = h.x - 4, gy = h.y - 16, a = (t * 4) % (Math.PI * 2);
    P.disc(sx(gx), sy(gy), 3.2 * c.z, C.slate); P.disc(sx(gx), sy(gy), 1.1 * c.z, C.navy);
    for (let q = 0; q < 6; q++) P.px(Math.round(sx(gx + Math.cos(a + q * Math.PI / 3) * 2.7)), Math.round(sy(gy + Math.sin(a + q * Math.PI / 3) * 2.7)), C.cream);
    P.disc(sx(h.x + 2.6), sy(gy), 1.5 * c.z, C.navy2); P.px(Math.round(sx(h.x + 2.6)), Math.round(sy(gy)), C.grey);
  }
  R(h.x - 5, h.y - 8, 10, 4, C.rust); R(h.x - 5, h.y - 8, 10, 1, C.orange);
  P.poly([[sx(h.x - 3), sy(h.y - 4)], [sx(h.x + 3), sy(h.y - 4)], [sx(h.x + 1), sy(h.y)], [sx(h.x - 1), sy(h.y)]], C.amber);
  if (!h.done) { P.glow(sx(h.x), sy(h.y), 7 * c.z, C.gold, 0.75, 1.3); R(h.x - 0.5, h.y, 1, 1, hex('#FFF7DC')); }
}

export function overlay(T, t) {
  const a0 = 1 - ease(t, 1.5, 2.0), p = progress(t);
  T.kicker('화풍 시안 03 / 03', 60, 150);
  if (a0 > 0) {
    T.big('물건을 어떻게', 60, 250, {size: 62, alpha: a0}); T.big('한 층씩 쌓을까?', 60, 330, {size: 62, alpha: a0});
    T.big('3D 프린터', 56, 492, {size: 136, color: '#F2A742', alpha: a0});
  }
  const line = (txt, t0, t1) => { const a = ease(t, t0, t0 + 0.4) * (1 - ease(t, t1 - 0.4, t1)); if (a > 0) T.accent(txt, 60, 270, {size: 54, alpha: a}); };
  line('녹여서, 한 줄씩 긋고', 2.3, 5.5);
  line('한 층 위에 또 한 층', 5.9, 9.4);
  line('같은 일을 되풀이합니다', 9.7, 12.5);
  line('깎지 않고, 쌓아서 만듭니다', 12.8, 15.2);
  const ga = ease(t, 2.0, 2.6), y = 1330, m = Math.round(p.minutes);
  T.gauge('층', `${p.layer} / 96`, 60, y, {alpha: ga, color: '#F2A742'});
  T.gauge('노즐', '210 °C', 360, y, {alpha: ga});
  T.gauge('걸린 시간', `${Math.floor(m / 60)}시간 ${String(m % 60).padStart(2, '0')}분`, 620, y, {alpha: ga});
  T.sans(t > 6 && t < 11.6 ? '빨리 감기 · 설명 모형' : '설명 모형', 60, 1470, {size: 24, color: '#A9C4B4', alpha: ga});
}
