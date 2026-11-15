// 64번 기상 레이더 — 2D 픽셀 세계와 계기(픽셀 버퍼 좌표, 한 픽셀 = 화면 4 px). 3D 층(레이더 관측소·주변 땅)은 three3d.mjs 가 그린다.
// 모형(설명용, 수치의 출처는 brief.md):
//   거리 = 빛의 빠르기 × 걸린 시간 ÷ 2  (왕복 1,000분의 1초 = 150 km)
//   메아리의 세기 ∝ 방울 지름⁶  (지름 2배 → 64배)
//   빔의 높이(가장 낮은 각 0.5°) ≈ r·sin 0.5° + r² ÷ (2 × 8,495 km)  → 100 km 에서 약 1.5 km, 200 km 에서 약 4.1 km
//   비구름 세 덩이(CELLS)는 3D 그림, 레이더 화면(PPI), 메아리 표시가 함께 쓴다.
import {W, H, C, bayer, clamp, lerp, smooth, hash} from './px.mjs';

export const TAU = Math.PI * 2;
/** 비구름: az = 북에서 시계 방향(라디안), r = 레이더에서의 거리(3D 단위, 1 = 2 km), size = 반지름, h = 높이, dbz = 가장 센 곳의 반사도 */
export const CELLS = [{az: 0.75, r: 78, size: 17, h: 46, dbz: 52}, {az: 2.75, r: 96, size: 13, h: 40, dbz: 38}, {az: 4.55, r: 52, size: 10, h: 36, dbz: 26}];
export const LAND_R = 122, RINGS = [40, 80, 120], KM_PER_UNIT = 2;
export const CFG3D = {cells: CELLS, landR: LAND_R, rings: RINGS, stationScale: 1};
/** 3D 층의 색 사다리(물체 번호 → 어두운 색 … 밝은 색) */
export const RAMP = {0: [C.rock2, C.rock], 1: [C.grass3, C.grass2, C.grass, C.grass], 2: [C.rock2, C.rock2, C.rock, C.metal3], 3: [C.metal3, C.metal2, C.metal, C.white],
  4: [C.metal4, C.metal4, C.metal3, C.metal2], 5: [C.wall2, C.wall2, C.wall, C.wall], 6: [C.roof2, C.roof2, C.roof, C.roof], 7: [C.metal3, C.metal2, C.metal, C.white],
  8: [C.red, C.amber, C.gold, C.gold], 10: [C.grass3, C.grass2, C.grass2, C.grass], 11: [C.soil2, C.soil, C.soil, C.rock2], 12: [C.pale, C.pale],
  13: [C.cloud4, C.cloud3, C.cloud2, C.cloud], 14: [C.rain, C.rain], 15: [C.amber, C.gold]};

export const beamHeightKm = d => d * Math.sin(0.5 * Math.PI / 180) + d * d / (2 * 8495);
/** 반사도(dBZ) → 레이더 화면의 색(없음이면 null) */
export const echoColor = z => z < 15 ? null : z < 28 ? C.e1 : z < 36 ? C.e2 : z < 44 ? C.e3 : z < 50 ? C.e4 : C.e5;
/** 레이더 둘레 (east, south) 3D 단위 자리의 반사도 — 세 덩이의 합 */
export function dbzAt(x, z) {
  let best = 0;
  for (const c of CELLS) { const cx = c.r * Math.sin(c.az), cz = -c.r * Math.cos(c.az), d = Math.hypot(x - cx, z - cz) / (c.size * 1.25); best = Math.max(best, c.dbz * Math.exp(-d * d * 0.9) - (hash(Math.round(x / 3), Math.round(z / 3)) - 0.5) * 6); }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// 하늘과 땅
// ---------------------------------------------------------------------------------------------------------------
/** 흐린 낮 하늘. hz = 수평선의 줄. 위는 짙고(머리글 자리) 아래로 갈수록 밝다. */
export function sky(P, hz, t, o = {}) {
  P.bands(0, W, [[0, C.night], [0.16, C.storm], [0.36, C.steel], [0.56, C.sky], [0.74, C.sky2], [0.9, C.haze]].map(([q, c]) => [Math.round(hz * q), c]), Math.round(hz) + 1, 5);
  const drift = (o.drift ?? 1) * t * 0.7;
  for (let i = 0; i < 9; i++) {                                    // 높은 구름 띠
    const y = Math.round(hz * (0.04 + 0.2 * hash(i, 5))), w = 40 + Math.round(46 * hash(i, 7)), x = Math.round(((i * 61 + 90 * hash(i, 3) + drift) % (W + 120)) - 60);
    P.rect(x, y, w, 3, C.cloud4); P.rect(x + 6, y - 2, w - 18, 2, C.cloud4); P.rect(x + 4, y + 3, w - 12, 1, C.steel);
  }
  for (let i = 0; i < 5; i++) {                                    // 수평선 가까운 옅은 구름
    const y = Math.round(hz * (0.78 + 0.1 * hash(i, 15))), w = 36 + Math.round(40 * hash(i, 17)), x = Math.round(((i * 83 + 70 * hash(i, 13) + drift * 0.5) % (W + 100)) - 50);
    P.rect(x, y, w, 2, C.pale); P.rect(x + 5, y - 1, w - 14, 1, C.pale);
  }
}
/** 먼 산등성이(수평선 위) */
export function hills(P, hz, cx = 0) {
  for (let x = 0; x < W; x++) {
    const a = 9 + 6 * Math.sin((x + cx * 0.3) * 0.031) + 4 * Math.sin((x + cx * 0.3) * 0.083 + 1), b = 5 + 4 * Math.sin((x + cx * 0.5) * 0.047 + 2) + 2 * Math.sin((x + cx * 0.5) * 0.13);
    for (let y = Math.round(hz - a); y < hz; y++) P.px(x, y, C.hill);
    for (let y = Math.round(hz - b); y < hz; y++) P.px(x, y, C.hill2);
  }
}
/** 땅: groundY(x) 아래를 풀·흙·어둠으로 채운다. o.field = 풀밭의 깊이(줄) — 위에서 비스듬히 내려다본 들판(기본은 얇은 단면) */
export function ground(P, groundY, o = {}) {
  const f = o.field || 0;
  for (let x = 0; x < W; x++) {
    const g = Math.round(typeof groundY === 'function' ? groundY(x) : groundY);
    for (let y = Math.max(0, g); y < H; y++) {
      const k = y - g + 3 * (bayer(x, y) - 0.5);
      if (f) P.px(x, y, k < f * 0.16 ? C.grass : k < f * 0.62 ? C.grass2 : k < f ? C.grass3 : k < f + 14 ? C.soil : k < f + 40 ? C.soil2 : C.ink);
      else P.px(x, y, k < 2 ? C.grass : k < 5 ? C.grass2 : k < 9 ? C.grass3 : k < 26 ? C.soil : k < 60 ? C.soil2 : C.ink);
    }
  }
}
/** 비구름 한 덩이(2D): 위는 밝고 밑은 짙다. rainTo 까지 빗줄기. o: {seed, dark 0..1, rain 0..1, t, slant, virga 줄(그 줄에서 빗줄기가 사라짐)} */
export function cloud(P, cx, cy, w, h, o = {}) {
  const seed = o.seed ?? 1, n = Math.max(5, Math.round(w / 9));
  const puffs = Array.from({length: n}, (_, i) => { const q = (i + 0.5) / n; return [cx - w / 2 + q * w + (hash(i, seed) - 0.5) * 5, cy - h * 0.22 * Math.sin(q * Math.PI) - (hash(i, seed + 3)) * h * 0.2, h * (0.34 + 0.22 * Math.sin(q * Math.PI) + 0.1 * hash(i, seed + 7))]; });
  if (o.rain) {
    const t = o.t || 0, to = o.rainTo ?? H, sl = o.slant ?? 0.25;
    for (let x = Math.round(cx - w * 0.42); x < cx + w * 0.42; x++) for (let y = Math.round(cy + h * 0.2); y < to; y++) {
      const ph = (((y - t * 34 + hash(x, 9) * 40) % 9) + 9) % 9, fade = o.virga ? clamp((o.virga - y) / 14) : 1;
      if (ph >= 0 && ph < 4 && ((x - Math.round((y - cy) * sl)) % 3 + 3) % 3 === 0 && o.rain * fade > bayer(x, y)) P.px(x - Math.round((y - cy) * sl), y, y < to * 0.5 ? C.rain : C.steel);     // 밝은 하늘 앞의 빗줄기는 짙게
    }
  }
  for (const [x, y, r] of puffs) P.disc(x, y + r * 0.35, r, o.dark > 0.5 ? C.cloud4 : C.cloud3);
  for (const [x, y, r] of puffs) P.disc(x, y, r, o.dark > 0.5 ? C.cloud3 : C.cloud2);
  for (const [x, y, r] of puffs) P.disc(x - r * 0.12, y - r * 0.3, r * 0.68, o.dark > 0.5 ? C.cloud2 : C.cloud);
  P.rect(Math.round(cx - w * 0.44), Math.round(cy + h * 0.2), Math.round(w * 0.88), 2, C.cloud4);
}

// ---------------------------------------------------------------------------------------------------------------
// 신호(빛나는 것): 전파 묶음, 메아리
// ---------------------------------------------------------------------------------------------------------------
/** 전파 묶음 한 개: (x, y) 가운데, 진행 방향 dir(±1), 길이 len, 높이 hh. strong 0..1 */
export function packet(P, x, y, dir, len, hh, strong = 1) {
  P.lit(strong, () => {
    for (let k = 0; k < len; k++) { const xx = Math.round(x - dir * k), a = strong * (1 - k / len) ** 0.7, half = Math.max(1, Math.round(hh * (0.55 + 0.45 * Math.sin(k * 1.6) ** 2)));
      for (let j = -half; j <= half; j++) P.pxA(xx, Math.round(y + j), k < 2 ? C.cream : Math.abs(j) < half * 0.5 ? C.gold : C.amber, a); }
  });
}
/** 선분을 따라가는 점묘 빔 */
export function beam2d(P, x0, y0, x1, y1, w0, w1, a, t) {
  const n = Math.hypot(x1 - x0, y1 - y0); if (n < 3) return;
  const nx = -(y1 - y0) / n, ny = (x1 - x0) / n;
  P.lit(0.8, () => {
    for (let k = 3; k < n; k++) { const q = k / n, w = lerp(w0, w1, q), cxp = x0 + (x1 - x0) * q, cyp = y0 + (y1 - y0) * q;
      for (let j = -w; j <= w; j++) P.pxA(Math.round(cxp + nx * j), Math.round(cyp + ny * j), Math.abs(j) < w * 0.35 ? C.gold : C.amber, a * (1 - 0.6 * q) * (1 - Math.abs(j) / (w + 1))); }
  });
}
/** 흩어지는 메아리 고리(빗방울에서 사방으로) */
export function ripple(P, cx, cy, r, a, c = C.gold) { if (a > 0.02 && r > 0.5) P.lit(0.9, () => P.ring(cx, cy, r, 1.3, c, a)); }

// ---------------------------------------------------------------------------------------------------------------
// 계기
// ---------------------------------------------------------------------------------------------------------------
/** 어두운 계기판 바탕 */
export function panel(P, x, y, w, h) { P.rect(x, y, w, h, C.panel); P.rect(x, y, w, 1, C.line); P.rect(x, y + h - 1, w, 1, C.line); P.rect(x, y, 1, h, C.line); P.rect(x + w - 1, y, 1, h, C.line); }

/**
 * 레이더 화면(PPI). 북쪽이 위. swept(각) = 그 방위가 이미 훑였는가, sweep = 지금 접시가 보는 방위(북에서 시계 방향), R = 화면 반지름(픽셀).
 * field(x, z) → dBZ (3D 단위). mono = 옛 화면(한 가지 색).
 */
export function ppi(P, cx, cy, R, o) {
  const k = LAND_R / R;
  P.disc(cx, cy, R + 2, C.line); P.disc(cx, cy, R + 1, C.panel);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y); if (d > R) continue;
    const az = (Math.atan2(x, -y) + TAU) % TAU, px = cx + x, py = cy + y;
    let c = null;
    if (o.swept(az)) { const z = o.field(x * k, y * k); c = o.mono ? (z > 15 ? (z > 34 ? C.cream : C.e2) : null) : echoColor(z); }
    if (c) P.lit(0.55, () => P.px(px, py, c)); else if (RINGS.some(r => Math.abs(d - r / k) < 0.5) || (Math.abs(x) < 0.5 || Math.abs(y) < 0.5)) P.px(px, py, C.panel2);
  }
  if (o.sweep != null) { const sx = Math.sin(o.sweep), sy = -Math.cos(o.sweep); P.lit(1, () => { for (let q = 1; q <= R; q++) P.px(Math.round(cx + sx * q), Math.round(cy + sy * q), q % 2 ? C.gold : C.cream); }); }
  P.lit(0.8, () => P.rect(cx - 1, cy - 1, 2, 2, C.cream));
}

/** A-스코프: 가로 = 거리(걸린 시간), 세로 = 돌아온 세기. q = 지금 훑는 자리(0..1), blips = [[자리 0..1, 높이 px]] (지나간 것만 보인다) */
export function ascope(P, x, y, w, h, q, blips, o = {}) {
  panel(P, x, y, w, h);
  const base = y + h - 7, x0 = x + 6, x1 = x + w - 6;
  P.rect(x0, base, x1 - x0, 1, C.line);
  for (let i = 0; i <= 4; i++) P.rect(Math.round(lerp(x0, x1, i / 4)), base, 1, 3, C.line);
  const cur = Math.round(lerp(x0, x1, clamp(q)));
  P.lit(0.7, () => {
    for (let xx = x0; xx <= cur; xx++) { let hgt = (hash(xx, o.seed || 3) > 0.7 ? 1 : 0); for (const [bq, bh] of blips) { const bx = lerp(x0, x1, bq), d = (xx - bx) / 2.2; if (bq <= q) hgt = Math.max(hgt, bh * Math.exp(-d * d)); } for (let j = 0; j <= Math.round(hgt); j++) P.px(xx, base - 1 - j, j === Math.round(hgt) ? C.gold : C.e2); }
    P.rect(cur, base - 3, 1, 5, C.cream);
  });
}

/** 방울 상자: 지름 d(px)의 방울 n개. pulse 0..1 = 전파 묶음이 지나간 자리(왼→오), echo 0..1 = 메아리 고리의 진행 */
export function drops(P, x, y, w, h, d, n, o = {}) {
  panel(P, x, y, w, h);
  const pts = Array.from({length: n}, (_, i) => [x + 5 + (w - 10) * hash(i, o.seed || 1), y + 5 + (h - 10) * hash(i, (o.seed || 1) + 5)]);
  const fall = o.fall ? (o.t || 0) * o.fall : 0;
  for (const [px0, py0] of pts) {
    const py = y + 4 + ((py0 - y - 4 + fall) % (h - 8) + (h - 8)) % (h - 8);
    if (d <= 1) P.px(Math.round(px0), Math.round(py), C.cloud2);
    else if (o.oblate) { const a = d / 2, up = d * 0.36, dn = d * 0.27;                       // 큰 빗방울: 위는 둥글고 밑은 납작하다
      for (let yy = -Math.ceil(up); yy <= Math.ceil(dn); yy++) for (let xx = -Math.ceil(a); xx <= Math.ceil(a); xx++) if ((xx / a) ** 2 + (yy / (yy < 0 ? up : dn)) ** 2 <= 1) P.px(Math.round(px0 + xx), Math.round(py + yy), C.rain);
      P.rect(Math.round(px0 - a * 0.5), Math.round(py - up * 0.6), Math.max(1, Math.round(d * 0.14)), 1, C.pale); }
    else if (o.hail) { const r = d / 2, w = (o.t || 0) * 5 + hash(px0, 2) * 6; P.disc(px0, py, r, C.cloud); for (const q of [0, 2.2, 4.1]) P.disc(px0 + Math.cos(w + q) * r * 0.75, py + Math.sin(w + q) * r * 0.75, r * 0.42, C.cloud); P.disc(px0 + Math.cos(w) * r * 0.35, py + Math.sin(w) * r * 0.35, r * 0.3, C.cloud2); }
    else { P.disc(px0, py, d / 2, C.rain); if (d >= 4) P.px(Math.round(px0 - d * 0.18), Math.round(py - d * 0.2), C.pale); }
    if (o.echo > 0 && o.pulse != null && x + (w * o.pulse) > px0 && d > 1) ripple(P, px0, py, d * 0.5 + 1 + 6 * ((o.echo * 1.7 + hash(px0, 3)) % 1), 0.7 * (1 - ((o.echo * 1.7 + hash(px0, 3)) % 1)));
  }
  if (o.pulse != null && o.pulse > 0 && o.pulse < 1) P.lit(1, () => { const xx = Math.round(x + w * o.pulse); for (let yy = y + 2; yy < y + h - 2; yy++) { P.pxA(xx, yy, C.cream, 0.9); P.pxA(xx - 1, yy, C.gold, 0.6); P.pxA(xx - 2, yy, C.amber, 0.3); } });
}
/** 메아리 세기를 칸으로 센다: cols×rows 칸 가운데 lit 개가 켜진다 */
export function blocks(P, x, y, cols, rows, lit, o = {}) {
  const s = o.size || 3, g = o.gap ?? 1;
  for (let i = 0; i < cols * rows; i++) { const cx = x + (i % cols) * (s + g), cy = y + (rows - 1 - Math.floor(i / cols)) * (s + g);
    if (i < lit) P.lit(0.75, () => P.rect(cx, cy, s, s, i < lit - 0.5 ? C.gold : C.amber)); else P.rect(cx, cy, s, s, o.ghost && i < o.ghost ? C.line : C.panel2); }
}
