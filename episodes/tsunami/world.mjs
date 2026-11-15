// 58번 쓰나미 — 무대 하나: 왼쪽 바다 밑 단층에서 오른쪽 해안 마을까지 이어진 바다의 단면(픽셀 버퍼 좌표, 한 픽셀 = 화면 4 px).
// 모형(설명용):
//   빠르기 = √(g × 수심). 화면에서 물결이 가는 빠르기는 한 장면 안에서 같은 식에 비례한다(장면마다 돌리는 배율은 다르다).
//   높이 ∝ 수심^(−1/4) (그린의 법칙, 수심 4,000 m 에서 1 m → 10 m 에서 4.5 m). 세로는 1 m = 3 픽셀로 과장.
//   물결 길이 ∝ √수심 (주기가 그대로이므로). 가로는 크게 줄였다(수백 km 를 화면 한 폭에).
//   발생: 단층 위쪽 땅덩이가 밀려 올라가 바닥이 솟고(바다 쪽), 그 옆은 조금 꺼진다(육지 쪽). 수면은 바닥과 같은 모양으로 들린다.
//   들린 물은 절반씩 양쪽으로 갈라져 간다. 해안 쪽으로 가는 물결은 낮은 부분이 앞선다(그래서 물이 먼저 빠진다).
import {W, H, C, bayer, clamp, lerp, hash} from './px.mjs';

export const XF = 220, X0 = XF - 35, SL0 = 900, SL1 = 1320, SH1 = 1345, DPX = 120, PXM = 3, UPX = 6;
export const X_BOAT = 670, X_BPR = 450, X_MAST = SH1 + 186, X_SIGN = SH1 + 100;
export const FOCUS = [XF - 10, DPX + 5 + 20];                       // 진원(화면용): 단층 위 한 점, 바다 기준 아래로 +

export const depthM = x => x <= SL0 ? 4000 : x < SL1 ? 4000 * (1 - (x - SL0) / (SL1 - SL0)) ** 2 + 10 : x < SH1 ? 10 - 9.4 * (x - SL1) / (SH1 - SL1) : 0.6;
const B10 = 5 + DPX * Math.sqrt(10 / 4000);
export const landY = dx => Math.min(22, dx * 0.22) + (dx > 120 ? Math.min(30, (dx - 120) * 0.6) : 0);
/** 바닥의 높이(수면 기준 아래로 +, 픽셀). 육지는 음수. */
const relief = x => x > XF + 330 && x < SL0 - 20 ? (1.6 * Math.sin(x / 31) + 1.1 * Math.sin(x / 11.3 + 1) + (Math.sin(x / 83) > 0.93 ? -5 * (Math.sin(x / 83) - 0.93) / 0.07 : 0)) * Math.min(1, (x - XF - 330) / 40, (SL0 - 20 - x) / 40) : 0;
export const bed0 = x => x < SL1 ? 5 + DPX * Math.sqrt(depthM(x) / 4000) + relief(x) : x < SH1 ? lerp(B10, 0, (x - SL1) / (SH1 - SL1)) : -landY(x - SH1);
/** 바닥이 솟고 꺼지는 모양(솟음 1, 꺼짐 −0.4). 수면도 같은 모양으로 들린다. */
export const U = x => Math.exp(-(((x - X0) / 70) ** 2)) - 0.4 * Math.exp(-(((x - X0 - 145) / 50) ** 2));
export const bed = (x, up) => bed0(x) - (up > 0 && x < XF + 300 && x > XF - 260 ? up * UPX * U(x) : 0);
const TRENCH = XF - 110;
/** 단층면(수면 기준 아래로 +). 해구에서 육지 쪽으로 비스듬히 내려간다. */
export const faultY = x => bed0(TRENCH) + (x - TRENCH) * 0.22;

// 물결 마루의 자리: dX/dτ = √(수심/4000) (깊은 바다에서 τ 1 에 1 픽셀)
const TAB = (() => { const a = [X0]; let x = X0; for (let i = 1; i <= 4400; i++) { x += Math.sqrt(Math.max(depthM(x), 8) / 4000); a.push(x); } return a; })();
export const crestX = tau => { const u = clamp(tau, 0, TAB.length - 1), i = Math.floor(u); return lerp(TAB[i], TAB[Math.min(TAB.length - 1, i + 1)], u - i); };
export const tauAt = X => { let lo = 0, hi = TAB.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAB[m] < X) lo = m; else hi = m; } return lo + (X - TAB[lo]) / Math.max(1e-6, TAB[hi] - TAB[lo]); };
export const heightM = d => (4000 / Math.max(d, 8)) ** 0.25;
export const lenPx = d => Math.max(12, 70 * Math.sqrt(d / 4000));
/** 계기에 찍는 값: 마루가 있는 곳의 수심·빠르기·높이 */
export const state = X => { const d = depthM(Math.min(X, SL1)); return {X, d, kmh: Math.sqrt(9.81 * d) * 3.6, hm: (4000 / d) ** 0.25, shore: X > SL1 + 0.5}; };
/** 마루가 X 에 있는 물결 하나의 수면 높이(픽셀). 낮은 부분이 마루의 오른쪽에 있다. */
export function pulse(x, X) {
  const d = depthM(Math.min(X, SL1 + 14)), L = lenPx(d), q = (x - X) / L;
  return PXM * heightM(d) * (Math.exp(-q * q) - 0.4 * Math.exp(-(((q - 2.07) / 0.71) ** 2)));
}
export const shoalGain = x => Math.min(1, heightM(depthM(Math.min(x, SL1))) / heightM(10));
/** 해안의 수면(픽셀): level(시각) = 해안선의 물 높이. 바다 쪽은 같은 변화가 먼저 지나간 것이고(초당 c 픽셀로 다가옴), 육지는 해안선의 높이로 잔잔히 차오른다. */
export const coastEta = (x, tt, level, c = 5) => x >= SH1 - 4 ? level(tt) : level(tt + (SH1 - 4 - x) / c) * shoalGain(x);

const rip = (x, t) => 0.55 * Math.sin(x * 0.9 + t * 2.6) + 0.4 * Math.sin(x * 0.37 - t * 1.7);
const HOUSES = [[41, 12, 13], [57, 15, 17], [76, 13, 14], [93, 18, 20], [114, 14, 15], [131, 19, 22], [152, 14, 15]];
const TREES = [33, 70, 108, 146, 204, 226, 262];
const NSPECK = 1100;

/**
 * v: {cx, sea, t, eta(x)→px (쓰나미만), up 0..1 (바닥 솟음), fault 0..1 (단층 빛), seis {r, a} (땅속 지진파 고리),
 *     mark X|null (마루 표시와 물기둥 점선), boats [x…], plane {x, y}|null, mast 0..1 (관측소 등불), sign 0..1 (대피 표지 빛),
 *     bpr 0..1 (압력계 신호), high px|0 (물이 닿은 높이 점선), calm 0..1 (바람 물결 세기, 기본 1)}
 */
export function drawWorld(P, v) {
  const {cx, sea, t} = v, sx0 = Math.round(cx - W / 2), eta = v.eta || (() => 0), up = v.up || 0, calm = v.calm ?? 1;
  // 하늘: 수평선에 매달린 색 띠
  P.bands(0, W, [[0, C.ink], [sea - 196, C.deep], [sea - 150, C.teal], [sea - 104, C.teal2], [sea - 64, C.sage], [sea - 34, C.amber], [sea - 12, C.orange]], sea + 20, 6);   // 물이 빠져 수면이 내려가도 그 위는 하늘
  const sunX = Math.round(170 - (cx - XF) * 0.075), sunY = sea - 22;
  P.glow(sunX, sunY, 44, C.gold, 0.55, 1.4); P.disc(sunX, sunY, 15, C.gold); P.disc(sunX, sunY, 11, C.cream);
  for (let i = 0; i < 12; i++) {                                       // 구름: 글자 자리(머리글·제목)는 비워 둔다
    const wx = -100 + i * 215 + 90 * hash(i, 3), low = i % 3 === 2, y = low ? sea - 64 + Math.round(14 * hash(i, 5)) : Math.round(sea * (0.03 + 0.13 * hash(i, 5)));
    const x = Math.round((wx - cx) * 0.14 + 120 + t * 0.5), w = 34 + Math.round(30 * hash(i, 7));
    P.rect(x, y, w, 3, C.mauve); P.rect(x + 6, y - 2, w - 16, 2, C.mauve); P.rect(x + 4, y + 3, w - 10, 1, C.rose);
  }
  if (v.plane) {                                                       // 여객기(빠르기를 견주는 대상)
    const x = Math.round(v.plane.x - sx0), y = Math.round(v.plane.y);
    for (let k = 0; k < 6; k++) P.rect(x - 14 - k * 7, y, 4, 1, C.mist);
    P.rect(x - 6, y - 1, 13, 2, C.cream); P.px(x + 7, y, C.cream); P.rect(x - 7, y - 3, 2, 2, C.cream); P.rect(x - 2, y + 1, 5, 1, C.grey2); P.rect(x - 1, y + 2, 3, 1, C.grey2);
  }
  // 마을 뒤의 먼 곶
  const hx = Math.round((SH1 + 40 - cx) * 0.45 + W / 2 - 20);
  P.poly([[hx, sea + 1], [hx + 40, sea - 22], [hx + 95, sea - 34], [hx + 170, sea - 26], [hx + 260, sea - 40], [hx + 420, sea - 30], [hx + 420, sea + 1]], C.slate);
  // 바다·바닥·육지 — 기둥 하나씩
  const seis = v.seis, fa = v.fault || 0;
  for (let sx = 0; sx < W; sx++) {
    const wx = sx0 + sx, b0 = bed0(wx), bu = up ? bed(wx, up) : b0, et = eta(wx);
    const e = et + (b0 > 1 ? calm * rip(wx, t) * clamp(b0 / 6) : 0.3 * rip(wx, t));
    const surf = Math.round(sea - e), bedRow = Math.round(sea + bu), bed0Row = Math.round(sea + b0), wet = surf < bedRow;
    if (wet) {
      for (let y = Math.max(0, surf); y < bedRow; y++) {
        const dd = y - sea + 2.5 * (bayer(sx, y) - 0.5);
        P.px(sx, y, dd < 7 ? C.teal2 : dd < 30 ? C.teal : dd < 86 ? C.deep : C.navy);
      }
      P.px(sx, surf, et > 4 ? C.white : et > 1.5 ? C.cream : C.mist);
      if (et > 7 && hash(wx, Math.floor(t * 8)) > 0.4) P.rect(sx, surf - 1, 1, 2, C.white);
    }
    const sandy = wx > SL1 - 60, upper = wx > TRENCH, fy = sea + faultY(wx), fRow = Math.round(fy);
    for (let y = Math.max(0, bedRow); y < H; y++) {
      const inUp = upper && y < fRow, k0 = y - (inUp ? bedRow : bed0Row), k = k0 + 3 * (bayer(sx, y) - 0.5);
      let c = k0 < 2 ? (sandy ? C.sand : C.slate) : sandy && k < 8 && bayer(sx, y) > 0.45 ? C.sand : k0 === 7 ? C.moon2 : k0 === 19 ? C.moon3 : k < 12 ? C.rock2 : k < 30 ? C.rock : k < 64 ? C.navy : C.ink;
      if (b0 < 0 && k0 < 2 && wx > SH1 + 120) c = C.teal;                                // 언덕의 풀
      P.px(sx, y, c);
    }
    if (upper && wx < XF + 78 && fRow > bedRow && fRow < H) {                             // 단층면
      P.px(sx, fRow, C.ink); if (fa > 0) { P.pxA(sx, fRow, C.gold, fa); P.pxA(sx, fRow - 1, C.amber, fa * 0.6); P.pxA(sx, fRow + 1, C.amber, fa * 0.6); }
    }
    if (seis && seis.a > 0) {                                                             // 땅속을 달리는 지진파
      const dx = wx - FOCUS[0];
      for (let y = Math.max(0, bedRow + 1); y < H; y++) {
        const d = Math.hypot(dx, y - sea - FOCUS[1]), w = Math.abs(d - seis.r), fade = seis.a * clamp(1 - (y - bedRow - 6) / 34);
        if (fade <= 0) break;
        if (w < 2.2) P.pxA(sx, y, C.gold, fade * (1 - w / 2.2)); else if (Math.abs(d - seis.r + 9) < 1.6) P.pxA(sx, y, C.amber, fade * 0.45);
      }
    }
  }
  // 물속의 알갱이: 수면과 바닥 사이에서 물과 함께 움직인다(바닥부터 수면까지 같은 만큼)
  for (let i = 0; i < NSPECK; i++) {
    const wx = -140 + (SH1 + 140) * hash(i, 1); if (wx < sx0 - 12 || wx > sx0 + W + 12) continue;
    const b = up ? bed(wx, up) : bed0(wx); if (b < 6) continue;
    const f = 0.05 + 0.9 * hash(i, 2), e = eta(wx), y = sea - e + f * (b + e), near = f * b < 7;
    const sway = clamp(1.6 * e, -9, 9) + (near ? calm * 0.9 * Math.cos(wx * 0.9 + t * 2.6) : 0);
    P.px(Math.round(wx + sway - sx0), Math.round(y + (near ? calm * 0.6 * Math.sin(wx * 0.9 + t * 2.6) : 0)), f * b < 26 ? C.mist : C.sage);
  }
  // 해의 반짝임
  for (let i = 0; i < 70; i++) {
    const sx = Math.round(sunX + (hash(i, 11) - 0.5) * (30 + 190 * hash(i, 12))), y = sea + 1 + Math.round(26 * hash(i, 13) ** 2);
    if (hash(i, Math.floor(t * 6 + 9 * hash(i, 14))) > 0.45 && bed0(sx0 + sx) > 28 && Math.abs(eta(sx0 + sx)) < 3) P.rect(sx, y, 2 + Math.round(3 * hash(i, 15)), 1, hash(i, 16) > 0.5 ? C.gold : C.cream);
  }
  // 물기둥 점선과 마루 표시
  if (v.mark != null && v.mark < SH1 - 2) {
    const mx = Math.round(v.mark - sx0), top = sea - Math.round(eta(v.mark)), bot = sea + Math.round(bed(v.mark, up));
    if (bot - top > 6) P.line(mx, top + 2, mx, bot - 1, C.cream, 2);
    P.poly([[mx - 3, top - 11], [mx + 4, top - 11], [mx + 0.5, top - 7]], C.amber);
  }
  // 부표와 바다 밑 압력계
  {
    const x = Math.round(X_BPR - sx0), sY = Math.round(sea - eta(X_BPR) - 0.5 * rip(X_BPR, t)), bRow = Math.round(sea + bed(X_BPR, up));
    if (x > -20 && x < W + 20) {
      P.line(x, sY + 1, x, bRow - 1, C.slate, 1);
      P.rect(x + 3, bRow - 4, 7, 4, C.grey2); P.rect(x + 4, bRow - 5, 5, 1, C.grey); P.px(x + 6, bRow - 3, C.navy);
      P.rect(x - 3, sY - 2, 7, 3, C.rust); P.rect(x - 1, sY - 6, 3, 4, C.cream); P.rect(x, sY - 10, 1, 4, C.navy);
      const on = v.bpr || 0;
      if (on > 0) {
        P.glow(x + 6, bRow - 3, 7, C.gold, 0.8 * on); P.px(x + 6, bRow - 3, C.gold); P.glow(x, sY - 11, 6, C.gold, 0.7 * on); P.px(x, sY - 11, C.gold);
        const span = bRow - 6 - sY; for (let k = 0; k < 6; k++) { const q = ((t * 0.9 + k / 6) % 1); P.px(x + 2, Math.round(bRow - 6 - q * span), C.gold); }
        for (let k = 0; k < 5; k++) { const q = ((t * 0.9 + k / 5) % 1), yy = Math.round(sY - 13 - q * (sY - 13)); P.px(x + Math.round(q * 18), yy, C.gold); P.px(x + Math.round(q * 18) + 1, yy, C.amber); }
      } else P.px(x, sY - 11, C.amber);
    }
  }
  // 배
  for (const bxw of v.boats || []) {
    const bx = Math.round(bxw - sx0);
    if (bx > -20 && bx < W + 20) {
      const bY = Math.min(Math.round(sea - eta(bxw) - 0.6 * rip(bxw, t)), Math.round(sea + bed0(bxw)) - 1);
      P.rect(bx - 8, bY - 2, 17, 3, C.navy); P.rect(bx - 6, bY + 1, 13, 1, C.navy2); P.rect(bx - 2, bY - 6, 6, 4, C.cream); P.rect(bx - 1, bY - 5, 2, 2, C.amber);
      P.line(bx + 5, bY - 3, bx + 5, bY - 13, C.navy); P.line(bx + 5, bY - 13, bx - 7, bY - 3, C.slate);
    }
  }
  // 부두와 마을, 언덕 위 관측소
  const px0 = SL1 - 2 - sx0, deck = sea - 6;
  if (px0 < W + 10 && px0 > -260) {
    P.rect(px0, deck, 44, 2, C.slate);
    for (let k = 0; k < 4; k++) P.rect(px0 + 3 + k * 12, deck + 2, 2, Math.max(2, Math.round(bed0(SL1 + 1 + k * 12)) + 5), C.navy2);
    for (const lx of [SL1 + 4, SL1 + 32]) { const x = lx - sx0; P.rect(x, deck - 9, 1, 9, C.navy); P.glow(x, deck - 10, 9, C.amber, 0.7); P.rect(x - 1, deck - 11, 3, 2, C.cream); }
    for (const [dx, w, h] of HOUSES) {
      const x = Math.round(SH1 + dx - sx0), g = Math.round(sea + bed0(SH1 + dx + w / 2));
      P.rect(x, g - h, w, h + 2, C.navy2); P.poly([[x - 1, g - h], [x + w / 2, g - h - 7], [x + w + 1, g - h]], C.maroon);
      for (let r = 0; r < Math.floor(h / 6); r++) for (let c = 0; c < Math.floor(w / 6); c++) if (hash(dx, r * 7 + c) > 0.35) P.rect(x + 2 + c * 6, g - h + 3 + r * 6, 2, 3, hash(dx + 1, r + c * 3) > 0.5 ? C.amber : C.cream);
    }
    for (const dx of TREES) { const x = SH1 + dx - sx0, g = Math.round(sea + bed0(SH1 + dx)); P.rect(x, g - 9, 1, 9, C.navy); P.disc(x + 0.5, g - 11, 4, C.teal); P.disc(x - 2, g - 9, 2.5, C.teal2); }
    {                                                                   // 대피 표지: 언덕 쪽을 가리키는 화살표
      const x = X_SIGN - sx0, g = Math.round(sea + bed0(X_SIGN)), on = v.sign || 0, col = on > 0.5 ? C.gold : C.grey;
      P.rect(x, g - 13, 1, 13, C.navy); P.rect(x - 4, g - 19, 10, 6, on > 0.5 ? C.rust : C.navy2);
      P.rect(x - 2, g - 16, 5, 1, col); P.px(x + 2, g - 17, col); P.px(x + 2, g - 15, col); P.px(x + 3, g - 16, col);
      if (on > 0) P.glow(x + 1, g - 16, 10, C.amber, 0.5 * on);
    }
    {                                                                   // 관측소: 오두막과 기둥, 등불
      const x = X_MAST - sx0, g = Math.round(sea + bed0(X_MAST)), on = v.mast || 0;
      P.rect(x - 12, g - 7, 9, 7, C.navy2); P.poly([[x - 13, g - 7], [x - 7.5, g - 11], [x - 2, g - 7]], C.maroon); P.rect(x - 9, g - 5, 2, 2, C.cream);
      P.rect(x, g - 22, 1, 22, C.navy); P.rect(x - 2, g - 17, 5, 1, C.navy); P.rect(x - 1, g - 24, 3, 2, on > 0 ? C.gold : C.grey);
      if (on > 0) { P.glow(x, g - 23, 13, C.gold, 0.75 * on); P.ring(x + 0.5, g - 22.5, 6 + 10 * ((t * 1.2) % 1), 1.2, C.amber, 0.7 * on * (1 - ((t * 1.2) % 1))); }
    }
    if (v.high) {                                                       // 물이 닿았던 높이
      const y = sea - Math.round(v.high), x1 = SH1 + Math.round(v.high / 0.22) - sx0;
      for (let x = SL1 - 18 - sx0; x < x1; x++) if ((x + sx0) % 4 < 2) P.px(x, y, C.cream);
    }
  }
  return {sx0, sunX};
}

/** 그림 안에 얹는 작은 판: 같은 자 위에 두 물결의 모양(깊은 곳의 길고 낮은 물결, 얕은 곳의 짧고 높은 물결). 글자는 장면이 얹는다. */
export function drawCompare(P, x, y, w, h, k) {
  P.rect(x, y, w, h, C.navy); P.rect(x, y, w, 1, C.slate); P.rect(x, y + h - 1, w, 1, C.slate); P.rect(x, y, 1, h, C.slate); P.rect(x + w - 1, y, 1, h, C.slate);
  const mid = x + Math.round(w * 0.62), row = (y0, d, a) => {
    const L = lenPx(d), A = PXM * heightM(d);
    for (let sx = x + 3; sx < x + w - 3; sx++) { const q = (sx - mid) / L, e = Math.round(A * Math.exp(-q * q)); for (let j = 0; j <= e; j++) if (a >= 1 || a > bayer(sx, y0 - j)) P.px(sx, y0 - j, j === e ? C.mist : C.teal2); P.px(sx, y0 + 1, C.deep); }
  };
  row(y + 19, 4000, 1);
  if (k > 0) row(y + h - 5, 10, k);
}
