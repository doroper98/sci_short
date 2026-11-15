// 화풍 시안 02 — 달 크레이터(대기열 56번). 비스듬히 들어와도 구덩이는 둥글고, 충돌체보다 훨씬 크다.
// 설명 모형: 구덩이는 한 점에서 반구 모양으로 퍼지는 충격이 파낸다. 화면은 아주 느리게 본 것이다.
import {W, H, C, bayer, clamp, lerp, smooth, ease, hash} from './px.mjs';
export const DUR = 15;

const TI = 4.2, R = 60, IMP = 3;                         // impact time, final crater radius, impactor radius (px)
const ANG = 30 * Math.PI / 180, DIR = [Math.cos(ANG), Math.sin(ANG)];
const rc = t => t < TI ? 0 : R * (1 - Math.exp(-(t - TI) / 0.95)) ** 0.62;
export const ratio = t => Math.max(1, rc(t) / IMP);
const OLD = [[-210, 16, 4], [-128, 9, 2], [150, 22, 5], [236, 11, 3]];
const base = x => { let y = 0.8 * Math.sin(x * 0.045) + 0.6 * Math.sin(x * 0.11 + 2); for (const [c, r, d] of OLD) { const q = (x - c) / r; if (Math.abs(q) < 1) y += d * (1 - q * q); else if (Math.abs(q) < 1.5) y -= 1.2 * (1.5 - Math.abs(q)) * 2; } return y; };
function ground(x, t) {                                    // surface y (px, down positive) in world coords
  const r = rc(t); if (r < 1) return base(x);
  const a = Math.abs(x);
  if (a < r) return lerp(base(x), 0.42 * r * (1 - (a / r) ** 2), clamp(r / 6));
  if (a < r * 1.7) return base(x) - 4.5 * (r / R) * (1 - (a - r) / (0.7 * r)) ** 1.4;
  return base(x);
}
// ejecta: launched from the growing rim, early ones fast and far, late ones slow and near
const G = 62, EJ = Array.from({length: 440}, (_, i) => {
  const tau = 0.04 + 2.3 * hash(i, 1) ** 1.3, side = i % 2 ? 1 : -1, v = (150 * (1 - tau / 2.45) ** 1.4 + 20) * (0.8 + 0.4 * hash(i, 2)) * (side > 0 ? 1.1 : 0.94);
  const el = (40 + 14 * hash(i, 3)) * Math.PI / 180;
  return {tau, side, vx: side * v * Math.cos(el), vy: v * Math.sin(el), hot: hash(i, 4)};
});
const cam = t => ({x: lerp(-40, 0, ease(t, 1.6, 4.0)), row: Math.round(lerp(lerp(304, 236, ease(t, 1.6, 4.0)), 276, ease(t, 10.8, 12.6)))});

export function draw(P, t) {
  const {x: cx, row} = cam(t), sx0 = Math.round(cx - W / 2), sk = t > TI && t < TI + 0.5 ? Math.round(3 * (1 - (t - TI) / 0.5) * (hash(Math.floor(t * 30)) - 0.5) * 2) : 0;
  P.rect(0, 0, W, H, C.ink);
  for (let i = 0; i < 110; i++) {                                                             // stars
    const x = Math.round(W * hash(i, 21)), y = Math.round((row - 14) * hash(i, 22)); if (hash(i, Math.floor(t * 3 + 7 * hash(i, 23))) > 0.12) P.px(x, y, hash(i, 24) > 0.7 ? C.cream : C.grey);
  }
  const ex = Math.round(228 - cx * 0.06), ey = Math.round(30 + (row - 236) * 0.25);                                    // Earth
  P.glow(ex, ey, 34, C.teal2, 0.35, 1.5); P.disc(ex, ey, 21, C.teal2);
  for (let y = -21; y <= 21; y++) for (let x = -21; x <= 21; x++) { const d = Math.hypot(x, y); if (d > 21) continue; const sh = (x * 0.8 + y * 0.5) / 21; if (sh > 0.1 + 0.5 * (bayer(ex + x, ey + y) - 0.5)) P.px(ex + x, ey + y, C.deep); else if (hash(x >> 2, y >> 1) > 0.78) P.px(ex + x, ey + y, hash(x >> 2, 7) > 0.5 ? C.cream : C.sage); }
  // far ridge
  const rx = Math.round(-cx * 0.35);                                                         // far ridges, kept clear of the impact site
  P.poly([[rx - 60, row + 1], [rx - 20, row - 11], [rx + 22, row - 6], [rx + 44, row + 1]], C.moon3);
  P.poly([[rx + 222, row + 1], [rx + 250, row - 8], [rx + 290, row - 14], [rx + 340, row - 5], [rx + 340, row + 1]], C.moon3);
  // ground with strata; the cavity cuts through them
  const r = rc(t), age = t - TI;
  for (let sx = 0; sx < W; sx++) {
    const wx = sx0 + sx, gy = Math.round(row + ground(wx, t)) + sk;
    for (let y = Math.max(0, gy); y < H; y++) {
      const dep = y - sk - row + 3 * (bayer(sx, y) - 0.5), k = y - gy;
      let c = dep < 9 ? C.moon : dep < 30 ? C.moon2 : dep < 74 ? C.moon3 : dep < 130 ? C.navy2 : C.navy;
      if (k < 1) c = C.grey2; else if (dep < 9 && hash(wx >> 1, y >> 1) > 0.9) c = C.grey;
      P.px(sx, y, c);
    }
    if (age > 0 && Math.abs(wx) < r) {                                                       // melt glow on the cavity floor
      const heat = clamp(1.25 - age / 5) * (1 - (Math.abs(wx) / r) ** 2); for (let k = 0; k < 4; k++) P.pxA(sx, gy + k, k < 2 ? C.gold : C.orange, heat * (1 - k / 5));
    }
  }
  const ix = Math.round(-sx0), iy = row + sk;
  // shock front: a hemisphere, whatever the incoming angle
  if (age > 0 && age < 3.4) { const rs = 6 + 190 * (age / 3.4) ** 0.62, a = 0.95 * (1 - age / 3.4) ** 0.8; P.ring(ix, iy, rs, 3, C.amber, a, 1); P.ring(ix, iy, rs - 3, 4, C.orange, a * 0.6, 1); }
  // ejecta
  if (age > 0) for (const e of EJ) {
    const dt = age - e.tau; if (dt < 0) continue;
    const x0 = e.side * rc(TI + e.tau) * 0.96, x = x0 + e.vx * dt, y = e.vy * dt - 0.5 * G * dt * dt;
    if (y < 0) continue;
    P.px(Math.round(x - sx0), iy - Math.round(y) - 1, dt < 0.35 && e.hot > 0.5 ? C.gold : e.hot > 0.6 ? C.grey2 : C.moon);
    if (e.hot > 0.8) P.px(Math.round(x - sx0) + 1, iy - Math.round(y) - 1, C.moon2);
  }
  // incoming body with a dotted path
  if (t < TI) {
    const dist = Math.max(0, (TI - t) * 100), px = -DIR[0] * dist, py = -DIR[1] * dist;
    if (t > 1.2) for (let k = 6; k < dist - 6; k += 7) P.px(Math.round(-DIR[0] * k - sx0), iy - Math.round(DIR[1] * k) - 2, C.cream);
    const bx = Math.round(px - sx0), by = iy - Math.round(-py) - 3;
    P.disc(bx + 0.5, by + 0.5, IMP + 0.4, C.grey); P.px(bx - 1, by - 1, C.grey2); P.px(bx + 1, by + 1, C.moon3);
  } else if (age < 0.55) { const f = 1 - age / 0.55; P.glow(ix, iy - 2, 16 + 46 * (age / 0.55), C.gold, 0.95 * f, 1.2); P.disc(ix, iy - 2, 4 + 10 * f, C.cream); }
  // size brackets once the dust has settled
  const ba = ease(t, 11.4, 12.2);
  if (ba > 0.5) {
    const y = iy + 44, l = ix - R, rr = ix + R;
    P.rect(l, y, 2 * R + 1, 1, C.cream); P.rect(l, y - 3, 1, 7, C.cream); P.rect(rr, y - 3, 1, 7, C.cream);
    const bx = ix - R - 34, by = iy - 22; P.disc(bx + 0.5, by + 0.5, IMP + 0.4, C.grey); P.rect(bx - 3, by + 8, 7, 1, C.cream); P.rect(bx - 3, by + 6, 1, 5, C.cream); P.rect(bx + 3, by + 6, 1, 5, C.cream);
    // plan view: round
    const vx = 214, vy = 150; P.rect(vx - 34, vy - 34, 69, 69, C.navy); P.rect(vx - 34, vy - 34, 69, 1, C.slate); P.rect(vx - 34, vy + 34, 69, 1, C.slate); P.rect(vx - 34, vy - 34, 1, 69, C.slate); P.rect(vx + 34, vy - 34, 1, 69, C.slate);
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + 0.2, l2 = 24 + 8 * hash(k, 31); P.line(vx + Math.cos(a) * 15, vy + Math.sin(a) * 15, vx + Math.cos(a) * l2, vy + Math.sin(a) * l2, C.moon2, 1); }
    P.disc(vx + 0.5, vy + 0.5, 14, C.moon); P.disc(vx + 0.5, vy + 0.5, 11.5, C.moon3); P.ring(vx + 0.5, vy + 0.5, 14, 1.4, C.grey2); P.rectMix(vx - 10, vy - 10, 12, 20, null, C.navy2, 0.5);
  }
}

export function overlay(T, t) {
  const a0 = 1 - ease(t, 1.5, 2.0);
  T.kicker('화풍 시안 02 / 03', 60, 150);
  if (a0 > 0) {
    T.big('달의 구덩이는', 60, 250, {size: 62, alpha: a0}); T.big('왜 모두 둥글까?', 60, 330, {size: 62, alpha: a0});
    T.big('크레이터', 56, 500, {size: 160, color: '#F2A742', alpha: a0});
  }
  const line = (txt, t0, t1) => { const a = ease(t, t0, t0 + 0.4) * (1 - ease(t, t1 - 0.4, t1)); if (a > 0) T.accent(txt, 60, 270, {size: 54, alpha: a}); };
  line('비스듬히 들어와도', 2.2, 4.1);
  line('충격은 한 점에서 둥글게 퍼지고', 4.5, 8.0);
  line('사방으로 똑같이 파냅니다', 8.3, 11.0);
  line('그래서 구덩이는 둥급니다', 11.3, 15.2);
  const ga = ease(t, 4.3, 4.9), y = 1330;
  T.gauge('구덩이 ÷ 충돌체', `약 ${Math.round(ratio(t))}배`, 60, y, {alpha: ga, color: '#F2A742'});
  T.gauge('충돌 속도', '초속 약 20 km', 470, y, {alpha: ga});
  T.sans('아주 느리게 본 모습 · 설명 모형', 60, 1470, {size: 24, color: '#A9C4B4', alpha: ease(t, 2.0, 2.6)});
  const pa = ease(t, 11.6, 12.3);
  if (pa > 0) { T.sans('위에서 보면', 856, 440, {size: 26, alpha: pa, align: 'center', color: '#FBEBC0'}); T.sans('구덩이', 540, 1250, {size: 26, alpha: pa, align: 'center', color: '#FBEBC0'}); T.sans('충돌체', 166, 1104, {size: 26, alpha: pa, align: 'center', color: '#FBEBC0'}); }
}
