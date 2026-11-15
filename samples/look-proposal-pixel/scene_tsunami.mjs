// 화풍 시안 01 — 쓰나미(대기열 58번). 먼바다에서는 낮고 빠르다가, 얕아지면 느려지고 높아진다.
// 빠르기 = √(g × 수심), 높이 ∝ 수심^(−1/4). 화면의 빠르기는 같은 식에 비례한다(세로 축척은 과장).
import {W, H, C, bayer, clamp, lerp, smooth, ease, hash} from './px.mjs';
export const DUR = 15;

// ---- 모형 ----
const depthM = x => x <= 520 ? 4000 : x < 940 ? 4000 * (1 - (x - 520) / 420) ** 2 + 10 : x < 965 ? 10 - 9 * (x - 940) / 25 : 0.6;
const bedY = x => x < 940 ? 6 + 194 * Math.sqrt(depthM(x) / 4000) : x < 965 ? lerp(6 + 194 * Math.sqrt(10 / 4000), 0, (x - 940) / 25) : -Math.min(15, (x - 965) * 0.18);
const V0 = 250, T0 = 1.6, X0 = 120;
const TAB = (() => { const a = [X0]; let x = X0; for (let i = 1; i <= 60 * 14; i++) { x += V0 * Math.sqrt(Math.max(depthM(x), 5) / 4000) / 60; a.push(x); } return a; })();
const crestX = t => { const u = clamp((t - T0) * 60, 0, TAB.length - 1), i = Math.floor(u); return lerp(TAB[i], TAB[Math.min(TAB.length - 1, i + 1)], u - i); };
const heightM = d => (4000 / Math.max(d, 6)) ** 0.25;
export const state = t => { const X = crestX(t), d = depthM(Math.min(X, 940)); return {X, d, kmh: Math.sqrt(9.81 * d) * 3.6, hm: heightM(d)}; };

function eta(x, t, X) {          // surface height in px above still water
  const d = depthM(Math.min(X, 940)), A = 3.0 * heightM(d), L = Math.max(11, 150 * Math.sqrt(d / 4000)), q = (x - X) / L;
  const land = clamp((X - 965) / 60);                                    // the surge thins out as it runs inland
  return A * (1 - 0.45 * land) * Math.exp(-q * q) - 0.28 * A * Math.exp(-(((x - X + 2.3 * L) / (1.5 * L)) ** 2)) + 0.55 * Math.sin(x * 0.21 + t * 2.3) + 0.35 * Math.sin(x * 0.083 - t * 1.4);
}

const cam = t => {
  const X = crestX(t);
  const follow = lerp(300, Math.min(X + 28, 1030), ease(t, 2.5, 3.7));
  return {x: follow, sea: Math.round(lerp(lerp(266, 178, ease(t, 1.5, 3.3)), 262, ease(t, 9.6, 11.6)))};
};

const HOUSES = [[1006, 12, 13], [1022, 15, 17], [1041, 13, 14], [1058, 18, 20], [1079, 14, 15], [1096, 19, 22], [1118, 15, 16], [1136, 20, 18], [1160, 16, 21]];

export function draw(P, t) {
  const {x: cx, sea} = cam(t), X = crestX(t), sx0 = Math.round(cx - W / 2);
  // sky: bands hang from the horizon
  P.bands(0, W, [[0, C.ink], [sea - 196, C.deep], [sea - 150, C.teal], [sea - 104, C.teal2], [sea - 64, C.sage], [sea - 34, C.amber], [sea - 12, C.orange]], sea + 2, 6);
  const sunX = Math.round(96 - (cx - 300) * 0.05), sunY = sea - 22;
  P.glow(sunX, sunY, 44, C.gold, 0.55, 1.4); P.disc(sunX, sunY, 15, C.gold); P.disc(sunX, sunY, 11, C.cream);
  for (let i = 0; i < 7; i++) {                                       // clouds
    const wx = 60 + i * 230 + 90 * hash(i, 3), y = sea - 150 + Math.round(60 * hash(i, 5)), x = Math.round(wx - cx * 0.14 + t * 1.2), w = 34 + Math.round(30 * hash(i, 7));
    P.rect(x, y, w, 3, C.mauve); P.rect(x + 6, y - 2, w - 16, 2, C.mauve); P.rect(x + 4, y + 3, w - 10, 1, C.rose);
  }
  // far headland behind the town
  const hx = Math.round(1010 - cx * 0.45 - 300 * 0.55 + W / 2 - 135);
  P.poly([[hx, sea + 1], [hx + 40, sea - 22], [hx + 95, sea - 34], [hx + 170, sea - 26], [hx + 260, sea - 40], [hx + 420, sea - 30], [hx + 420, sea + 1]], C.slate);
  // sea, bed, land — column by column
  for (let sx = 0; sx < W; sx++) {
    const wx = sx0 + sx, by = bedY(wx), e = eta(wx, t, X), surf = Math.round(sea - e), bed = Math.round(sea + by);
    const wet = by > 0 ? true : e > -by + 0.5;
    if (wet) for (let y = surf; y < bed; y++) {
      const dd = y - sea + 2.5 * (bayer(sx, y) - 0.5);
      P.px(sx, y, dd < 7 ? C.teal2 : dd < 30 ? C.teal : dd < 92 ? C.deep : C.navy);
    }
    if (wet) { P.px(sx, surf, e > 4 ? C.white : C.mist); if (e > 7 && hash(wx, Math.floor(t * 8)) > 0.4) P.rect(sx, surf - 1, 1, 2, C.white); }
    for (let y = Math.max(0, bed); y < H; y++) {
      const k = y - bed + 3 * (bayer(sx, y) - 0.5), sandy = wx > 900;      // strata follow the sea floor
      P.px(sx, y, k < 2 ? (sandy ? C.sand : C.slate) : sandy && k < 8 && bayer(sx, y) > 0.45 ? C.sand : k < 26 ? C.rock2 : k < 70 ? C.rock : k < 130 ? C.navy : C.ink);
    }
  }
  // water column marker under the crest + drifting specks that sway with the whole column
  const mx = Math.round(X - sx0), d = depthM(Math.min(X, 940));
  if (X < 965) P.line(mx, sea - Math.round(eta(X, t, X)) + 2, mx, sea + Math.round(bedY(X)) - 1, C.cream, 2);
  for (let i = 0; i < 520; i++) {
    const wx = 20 + 1040 * hash(i, 1), dep = 6 + 190 * hash(i, 2); if (dep > bedY(wx) - 3) continue;
    const L = Math.max(11, 150 * Math.sqrt(d / 4000)), q = (wx - X) / L, sway = 5.5 * Math.exp(-q * q);
    P.px(Math.round(wx + sway - sx0), sea + Math.round(dep), dep < 30 ? C.mist : C.sage);
  }
  // sparkles
  for (let i = 0; i < 70; i++) {
    const sx = Math.round(sunX + (hash(i, 11) - 0.5) * (30 + 190 * hash(i, 12))), y = sea + 1 + Math.round(26 * hash(i, 13) ** 2);
    if (hash(i, Math.floor(t * 6 + 9 * hash(i, 14))) > 0.45 && bedY(sx0 + sx) > 4) P.rect(sx, y, 2 + Math.round(3 * hash(i, 15)), 1, hash(i, 16) > 0.5 ? C.gold : C.cream);
  }
  // boat
  const bx = Math.round(300 - sx0), bY = Math.round(sea - eta(300, t, X));
  P.rect(bx - 8, bY - 2, 17, 3, C.navy); P.rect(bx - 6, bY + 1, 13, 1, C.navy2); P.rect(bx - 2, bY - 6, 6, 4, C.cream); P.rect(bx - 1, bY - 5, 2, 2, C.amber);
  P.line(bx + 5, bY - 3, bx + 5, bY - 13, C.navy); P.line(bx + 5, bY - 13, bx - 7, bY - 3, C.slate);
  // pier and town
  const px0 = 938 - sx0, deck = sea - 6;
  P.rect(px0, deck, 44, 2, C.slate);
  for (let k = 0; k < 4; k++) P.rect(px0 + 3 + k * 12, deck + 2, 2, Math.max(2, Math.round(bedY(941 + k * 12)) + 5), C.navy2);
  for (const lx of [944, 972]) { const x = lx - sx0; P.rect(x, deck - 9, 1, 9, C.navy); P.glow(x, deck - 10, 9, C.amber, 0.7); P.rect(x - 1, deck - 11, 3, 2, C.cream); }
  for (const [hxw, w, h] of HOUSES) {
    const x = Math.round(hxw - sx0), g = Math.round(sea + bedY(hxw + w / 2));
    P.rect(x, g - h, w, h, C.navy2); P.poly([[x - 1, g - h], [x + w / 2, g - h - 7], [x + w + 1, g - h]], C.maroon);
    for (let r = 0; r < Math.floor(h / 6); r++) for (let c = 0; c < Math.floor(w / 6); c++) if (hash(hxw, r * 7 + c) > 0.35) P.rect(x + 2 + c * 6, g - h + 3 + r * 6, 2, 3, hash(hxw + 1, r + c * 3) > 0.5 ? C.amber : C.cream);
  }
  for (const tx of [998, 1035, 1070, 1110, 1150]) { const x = tx - sx0, g = Math.round(sea + bedY(tx)); P.rect(x, g - 9, 1, 9, C.navy); P.disc(x + 0.5, g - 11, 4, C.teal); P.disc(x - 2, g - 9, 2.5, C.teal2); }
  // crest marker
  if (X < 1000) { const y = sea - Math.round(eta(X, t, X)) - 7; P.poly([[mx - 3, y - 4], [mx + 4, y - 4], [mx + 0.5, y]], C.amber); }
}

export function overlay(T, t) {
  const s = state(t), a0 = 1 - ease(t, 1.5, 2.0);
  T.kicker('화풍 시안 01 / 03', 60, 150, {alpha: 1});
  if (a0 > 0) {
    T.big('먼바다에서는', 60, 250, {size: 62, alpha: a0}); T.big('왜 보이지 않을까?', 60, 330, {size: 62, alpha: a0});
    T.big('쓰나미', 56, 500, {size: 168, color: '#F2A742', alpha: a0});
  }
  const line = (txt, t0, t1) => { const a = ease(t, t0, t0 + 0.4) * (1 - ease(t, t1 - 0.4, t1)); if (a > 0) T.accent(txt, 60, 270, {size: 54, alpha: a}); };
  line('먼바다에서는 낮고, 빠릅니다', 2.3, 5.4);
  line('얕아지면 느려지고', 5.7, 9.3);
  line('높아집니다', 9.5, 12.6);
  line('물기둥 전체가 움직이는 파도', 12.9, 15.2);
  const ga = ease(t, 2.0, 2.6), y = 1330;
  T.gauge('수심', s.X > 940 ? '해안' : `${Math.round(s.d).toLocaleString('en-US')} m`, 60, y, {alpha: ga});
  T.gauge('빠르기', `시속 ${Math.round(s.kmh)} km`, 330, y, {alpha: ga, color: '#F2A742'});
  T.gauge('높이', `${s.hm.toFixed(1)} m`, 730, y, {alpha: ga});
  T.sans('세로 길이는 과장했습니다 · 설명 모형', 60, 1470, {size: 24, color: '#A9C4B4', alpha: ga});
}
