// 35 아스팔트와 콘크리트 — 식어서 굳는 풀, 물과 반응해 굳는 풀
// Look grammar (2026-11-10): every moving thing is a link of the causal chain; one clock for world, gauges and sound;
// change one condition and keep an afterimage; only energy glows (heat = warm, the one warm colour; water = cool, the one
// cool colour); matte filled bodies (stones, binder, slabs, trucks). Stage: one road — seen in perspective (hook, close),
// cut into two cross-section blocks (essence, summer), and looked into through one lens (asphalt, concrete).
// HDR (2026-11-15): heat glows (hot bitumen, kiln flame, sun-heated surface) and the small reaction-heat sparks of hydration
// are drawn inside lit(). Captions, gauges, labels, trucks and stones never are.
// First moment (2026-11-16): 0–2.2 s the whole summer is replayed (trucks stream over both lanes, only the asphalt wheel
// paths sink) under the poster; 2.2–3.0 s it is rewound to "before summer"; then the trucks drive off at real speed.
// Model notes / simplifications (also in brief.md):
//  - Road: two 3.5 m lanes, concrete joints every 6 m, camera 8 m up, pitched 0.5 rad. Rut depth and stiffness bars are
//    explanatory scales (no units). Rut shape: one groove per wheel path with side humps (plastic flow).
//  - Bitumen stiffness falls smoothly with temperature (no threshold at the softening point — reviewer note on s22).
//  - Hydrate "fibres" stand for C-S-H (really a nano-scale gel). Strength S(d) = d/(d+6)·34/28 (S(7)≈0.65, S(28)=1), illustrative.
//  - Slab shrinkage in the joint comparison is exaggerated.
import {
  header, progressBar, rgba, mix, clamp, lerp, smooth, easeOut, easeInOut, rand, poly, line, circle, ring, glow, rect,
  withAlpha, clipEllipse, arrow, lit, TAU,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const events = [];
export const captionLayout = {};

const W = 1080, H = 1920;
const PAL = {
  bg: '#001621', deep: '#000E16', ink: '#EFE3D4', muted: '#8AA0A6', border: '#1C3A45', plate: '#06222E',
  warm: '#FF5A1F',            // heat (the one warm colour)
  cool: '#5BB8E8',            // water (the one cool colour)
  asph: '#26282c', asphHi: '#3a3d42', asphLo: '#141518',
  conc: '#a9a69d', concHi: '#c4c1b7', concLo: '#7c7970', joint: '#55534d',
  stones: ['#8f897e', '#a49c8d', '#7a736b', '#9a9488', '#b0a898'],
  roof: '#7b909a', back: '#5f737d', side: '#45565e', wheel: '#111214',
  ground: '#0a1c22', grain: '#8e8b83', fibre: '#d9d4c6',
};
const fmt = (x, d = 0) => (+x.toFixed(d)).toString();
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const at = (ctx, ref, off = 0) => ctx.tl.at(ref, off);
const ev = (ctx, id) => ctx.events.all(id).map(e => e.time);

// =====================================================================================================
// Road in perspective (hook, close)
// =====================================================================================================
const CAM = {h: 8, th: 0.5, F: 1154, cx: 540, cy: 960};
const ct = Math.cos(CAM.th), st = Math.sin(CAM.th);
function P3(X, Y, Z) {
  const dy = Y - CAM.h, zc = -dy * st + Z * ct, yc = dy * ct + Z * st;
  return [CAM.cx + CAM.F * X / zc, CAM.cy - CAM.F * yc / zc, CAM.F / zc];
}
const HORIZON = CAM.cy - CAM.F * st / ct;
const LANE = 3.5, ZN = 2.6, ZF = 160;
const WHEEL = [-1.75 - 0.9, -1.75 + 0.9];          // wheel paths in the asphalt lane
const RUT_W = 0.55;

// deterministic speckles (stones on the road surface)
const SPECK = Array.from({length: 900}, (_, i) => ({X: -LANE + rand(i) * 2 * LANE, Z: ZN + Math.pow(rand(i + 1000), 1.8) * 70, r: 0.03 + rand(i + 2000) * 0.05, c: i % 5}));

function strip(c, x0, x1, z0, z1, fill) {
  poly(c, [P3(x0, 0, z0), P3(x1, 0, z0), P3(x1, 0, z1), P3(x0, 0, z1)], fill);
}

function drawRoad(stage, t, {rut = 0, trucks = [], heat = 0, dim = 0} = {}) {
  const c = stage.ctx;
  // sky (plain dark gradient — not a picture sky) and roadside ground
  const g = c.createLinearGradient(0, 0, 0, HORIZON + 40);
  g.addColorStop(0, PAL.deep); g.addColorStop(1, '#06222E');
  c.fillStyle = g; c.fillRect(0, 0, W, HORIZON + 2);
  const g2 = c.createLinearGradient(0, HORIZON, 0, H);
  g2.addColorStop(0, '#0b2129'); g2.addColorStop(1, PAL.ground);
  c.fillStyle = g2; c.fillRect(0, HORIZON, W, H - HORIZON);
  // shoulders
  strip(c, -LANE - 1.2, -LANE, ZN - 2, ZF, '#1a2a2e'); strip(c, LANE, LANE + 1.2, ZN - 2, ZF, '#1a2a2e');
  // lanes
  strip(c, -LANE, 0, ZN - 2, ZF, PAL.asph);
  strip(c, 0, LANE, ZN - 2, ZF, PAL.conc);
  // depth haze on the far road (atmosphere, not light)
  const hz = c.createLinearGradient(0, HORIZON, 0, HORIZON + 260);
  hz.addColorStop(0, rgba('#0b2129', 0.85)); hz.addColorStop(1, rgba('#0b2129', 0));
  // asphalt speckles (aggregate in the surface)
  for (const s of SPECK) {
    if (s.X > 0) continue;
    const p = P3(s.X, 0, s.Z); if (p[1] > H + 20) continue;
    circle(c, p[0], p[1], Math.max(0.6, s.r * p[2] * 0.6), rgba(PAL.stones[s.c], 0.55));
  }
  // concrete: faint texture and transverse joints every 6 m
  for (const s of SPECK) {
    if (s.X <= 0) continue;
    const p = P3(s.X, 0, s.Z); if (p[1] > H + 20) continue;
    circle(c, p[0], p[1], Math.max(0.5, s.r * p[2] * 0.45), rgba(PAL.concLo, 0.35));
  }
  for (let z = 3; z < ZF; z += 6) { const a = P3(0, 0, z), b = P3(LANE, 0, z); line(c, [a, b], rgba(PAL.joint, 0.9), Math.max(1, 0.05 * a[2])); }
  // ruts in the asphalt wheel paths: dark groove (shadow side) + light humps either side
  if (rut > 0.002) {
    for (const xw of WHEEL) {
      const zs = []; for (let z = ZN - 1.5; z < 90; z *= 1.07) zs.push(z);
      const side = (x0, x1, col) => { const L = zs.map(z => P3(x0, 0, z)), R = zs.map(z => P3(x1, 0, z)).reverse(); poly(c, [...L, ...R], col); };
      side(xw - RUT_W * 0.95, xw - RUT_W * 0.55, rgba('#6d6a63', 0.75 * rut));       // outer hump, lit edge
      side(xw + RUT_W * 0.55, xw + RUT_W * 0.95, rgba('#5e5b55', 0.6 * rut));
      side(xw - RUT_W * 0.5, xw + RUT_W * 0.5, rgba('#060708', 0.85 * rut));          // groove
      side(xw - RUT_W * 0.5, xw - RUT_W * 0.15, rgba('#000000', 0.5 * rut));          // shadowed wall
    }
  }
  // seam between the two materials and road edges
  line(c, [P3(0, 0, ZN - 1.5), P3(0, 0, ZF)], rgba('#e9e3d6', 0.7), 3);
  line(c, [P3(-LANE, 0, ZN - 1.5), P3(-LANE, 0, ZF)], rgba('#e9e3d6', 0.55), 3);
  line(c, [P3(LANE, 0, ZN - 1.5), P3(LANE, 0, ZF)], rgba('#e9e3d6', 0.55), 3);
  c.fillStyle = hz; c.fillRect(0, HORIZON, W, 260);
  // sun-heated surface (heat = energy): a thin warm sheen over the asphalt lane only where it is hot
  if (heat > 0.01) lit(stage, cc => {
    for (let z = ZN; z < 60; z *= 1.25) {
      const a = P3(-LANE, 0.02, z), b = P3(0, 0.02, z);
      line(cc, [a, b], rgba(PAL.warm, 0.18 * heat * (1 - z / 60)), Math.max(1, 0.06 * a[2]));
    }
  }, {gain: 0.5});
  // trucks, far to near
  [...trucks].sort((a, b) => b.Z - a.Z).forEach(tr => drawTruck(c, tr));
  if (dim > 0) { c.fillStyle = rgba(PAL.deep, dim); c.fillRect(0, 0, W, H); }
}

function drawTruck(c, {lane, Z}) {
  const xc = lane === 0 ? -1.75 : 1.75, x0 = xc - 1.25, x1 = xc + 1.25, z0 = Math.max(Z, 1.2), z1 = Z + 12, y0 = 0.5, y1 = 3.8;
  if (z1 < 1.5 || Z > 140) return;
  const p = (x, y, z) => P3(x, y, z);
  // contact shadow
  poly(c, [p(x0 - 0.1, 0, z0), p(x1 + 0.1, 0, z0), p(x1 + 0.1, 0, z1), p(x0 - 0.1, 0, z1)], 'rgba(0,0,0,0.45)');
  // wheels (dark, under the body)
  for (const xw of [x0 + 0.15, x1 - 0.55]) for (const zw of [z0 + 0.4, z1 - 1.6]) {
    if (zw < 1.2) continue;
    poly(c, [p(xw, 0, zw), p(xw + 0.4, 0, zw), p(xw + 0.4, 1.0, zw), p(xw, 1.0, zw)], PAL.wheel);
  }
  // inner side face (towards the camera axis)
  const sx = xc < 0 ? x1 : x0;
  poly(c, [p(sx, y0, z0), p(sx, y0, z1), p(sx, y1, z1), p(sx, y1, z0)], PAL.side);
  // roof
  poly(c, [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], PAL.roof);
  // rear face
  if (Z > 1.2) {
    poly(c, [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], PAL.back);
    const m = p(xc, (y0 + y1) / 2, z0);
    line(c, [p(xc, y0 + 0.2, z0), p(xc, y1 - 0.2, z0)], rgba('#3b4a51', 0.9), Math.max(1, 0.04 * m[2]));
  }
}

// Truck positions. Hook: events 'truck' (0–2.2 s, time-lapse 45 m/s past Z = 10 at the event), rewind 2.2–3.0 s,
// then the same trucks drive off at real speed (22 m/s ≈ 80 km/h). s02: a time-lapse stream for the whole summer.
const TL_V = 45, REAL_V = 22, REW = [2.2, 3.0];
function hookTau(t) { return t < REW[0] ? t : Math.max(0, REW[0] - (t - REW[0]) * REW[0] / (REW[1] - REW[0])); }
function hookTrucks(t, ctx) {
  const tau = hookTau(t), real = Math.max(0, t - REW[1]);
  // trucks come towards the camera; each passes Z = 10 m at its sound event. At 0 s they are all still up the road.
  const times = ctx.events.all('truck').map(e => e.time);
  return times.map((te, i) => ({lane: i % 2, Z: 10 - TL_V * (tau - te) - REAL_V * real}));
}
function streamTrucks(t, t0, t1) {
  if (t < t0 - 0.5 || t > t1 + 0.5) return [];
  const out = [], q = (t - t0);
  for (let k = 0; k < 40; k++) for (const lane of [0, 1]) {
    const Z = k * 42 + lane * 21 + 14 - TL_V * q;
    if (Z > -12 && Z < 140) out.push({lane, Z});
  }
  return out;
}

// =====================================================================================================
// Poster (0 s frame = thumbnail): white question above, the topic word biggest
// =====================================================================================================
const POSTER = {q: ['60도로 달궈진 여름 길,', '왜 다르게 버틸까?'], a: ['아스팔트와', '콘크리트'], qy: 700, ay: 905, QS: 66, AS: 126};
function posterTitle(stage, q) {
  const c = stage.ctx, Q = POSTER.q, A = POSTER.a;
  const yTop = POSTER.qy - 100, yBot = POSTER.ay + POSTER.AS * 1.12 + 90;
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.2, 'rgba(0,10,16,0.58)'); g.addColorStop(0.85, 'rgba(0,10,16,0.58)'); g.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.9)';
  // question: two centred lines → one header line at y 228
  const s1 = lerp(POSTER.QS, 52, q), LH = POSTER.QS * 1.2 * (1 - smooth((q - 0.3) / 0.7));
  const joined = q > 0.55;
  withAlpha(c, 1, () => {
    if (!joined) Q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
    else stage.text(Q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 940});
  });
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => A.forEach((s, i) => stage.text(s, 540, lerp(POSTER.ay + i * POSTER.AS * 1.08, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa})));
}
const MORPH = ctx => [ctx.tl.sentence('s01').end + 0.15, ctx.tl.sentence('s01').end + 1.05];

// =====================================================================================================
// Header text per scene: [time from which it applies, kicker, title]
// =====================================================================================================
function titleList(id, ctx) {
  const a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, '시간 압축 · 여름 한 철을 5초로', '60도로 달궈진 여름 길']];
    case 'origin': return [[-Infinity, '이름 · 라틴어', '함께 자라난 것'], [a('s04'), '기원 · 로마, 서기 125년 무렵', '부어서 지은 둥근 지붕'], [a('s05'), '기원 · 고대 메소포타미아', '역청으로 붙인 벽돌']];
    case 'essence': return [[-Infinity, '본질 · 길을 잘라 본 단면', '같은 돌, 다른 풀'], [a('s08'), '본질 · 아스팔트 포장의 무게', '돌 95, 풀 5'], [a('s09'), '본질', '풀이 굳는 방법']];
    case 'asphalt': return [[-Infinity, '확대 · 아스팔트 속 (크기 과장)', '역청: 크고 무거운 분자'], [a('s12'), '확대 · 몇 시간을 몇 초로', '데우면 묽게 흐른다'], [a('s13'), '확대 · 몇 시간을 몇 초로', '식으면 엉겨 붙는다'], [a('s14'), '확대 · 온도만 바꿈', '다시 데우면 다시 물러진다']];
    case 'concrete': return [[-Infinity, '확대 · 콘크리트 속 (크기 과장)', '시멘트 가루와 물'], [a('s16'), '시멘트 만들기', '석회석과 점토를 구운 가루'], [a('s17'), '확대 · 몇 시간을 몇 초로', '물이 닿으면 자라난다'], [a('s18'), '확대 · 수화 반응', '새 물질이 엉켜 돌을 묶는다'], [a('s20'), '시간 압축 · 28일을 약 6초로', '강도는 28일째 기준'], [a('s21'), '조건 하나 바꿈 · 물속', '물속에서도 굳는다']];
    case 'summer': return [[-Infinity, '현상 · 한여름 노면', '60도 가까이 달궈진 길'], [a('s23'), '현상 · 바퀴 수천 번을 몇 초로', '돌이 밀려나 파인다'], [a('s24'), '현상 · 같은 60도', '콘크리트는 그대로'], [a('s25'), '현상 · 길이 변화 과장', '줄어들 때 금이 갈 자리']];
    case 'close': return [[-Infinity, '정리', '같은 60도, 다른 길']];
  }
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 900, ...so}));
}
function captionBand(c) { const g = c.createLinearGradient(0, 1230, 0, 1920); g.addColorStop(0, 'rgba(0,8,12,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.5)'); g.addColorStop(1, 'rgba(0,8,12,0.7)'); c.fillStyle = g; c.fillRect(0, 1230, W, 690); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, 'rgba(0,8,12,0.72)'); g.addColorStop(0.7, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 320); }

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, M = MORPH(ctx);
  if (id === 'hook' && t < M[1]) { posterTitle(stage, easeInOut((t - M[0]) / (M[1] - M[0]))); return; }
  captionBand(stage.ctx); topBand(stage.ctx);
  if (id === 'close' && t > ctx.tl.at('s27') - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook') head(stage, cur[1], '', fadeIn(t, M[1] - 0.05, 0.4) * a, 0);
  else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, M[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage) { const c = stage.ctx; c.fillStyle = PAL.bg; c.fillRect(0, 0, W, H); }

// =====================================================================================================
// Shared bits: stones, gauges
// =====================================================================================================
function stoneShape(i, r) {
  const n = 9, pts = [];
  for (let k = 0; k < n; k++) { const a = k / n * TAU + rand(i * 13 + k) * 0.4; pts.push([Math.cos(a) * r * (0.72 + 0.32 * rand(i * 7 + k * 3)), Math.sin(a) * r * (0.7 + 0.3 * rand(i * 5 + k * 11))]); }
  return pts;
}
function drawStone(c, x, y, shape, col, rot = 0, s = 1) {
  const pts = shape.map(([u, v]) => [x + (u * Math.cos(rot) - v * Math.sin(rot)) * s, y + (u * Math.sin(rot) + v * Math.cos(rot)) * s]);
  poly(c, pts, col, rgba('#000000', 0.35), 1.5);
  // simple matte shading: lighter upper-left facet
  const cx = x - 0.25 * s * 30, cy = y - 0.25 * s * 30;
  withAlpha(c, 0.18, () => poly(c, pts.map(([px, py]) => [lerp(px, cx, 0.45), lerp(py, cy, 0.45)]), '#ffffff'));
}
function bar(stage, x, y, w, v, {label = '', left = '', right = '', col = PAL.ink, ghost = null, h = 18} = {}) {
  const c = stage.ctx;
  rect(c, x, y - h / 2, w, h, h / 2, rgba(PAL.border, 0.95));
  rect(c, x, y - h / 2, Math.max(h, w * clamp(v)), h, h / 2, col);
  if (ghost != null) { const gx = x + w * clamp(ghost); line(c, [[gx, y - h], [gx, y + h]], rgba(PAL.ink, 0.7), 3, {dash: [5, 5]}); }
  if (label) stage.text(label, x, y - 34, {size: 26, weight: 500, color: PAL.muted});
  if (left) stage.text(left, x, y + 36, {size: 24, color: PAL.muted});
  if (right) stage.text(right, x + w, y + 36, {size: 24, color: PAL.muted, align: 'right'});
}

// =====================================================================================================
// Cross-section blocks (essence, summer): same stones in both, different binder
// =====================================================================================================
const BLK = [{x: 70, lane: 0}, {x: 560, lane: 1}], BW = 450, BY = 470, BH = 360;
const BSTONES = (() => {
  const out = []; let i = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
    const r = 22 + rand(i * 3) * 18;
    out.push({u: (col + 0.5 + (rand(i) - 0.5) * 0.55) / 7, v: (row + 0.5 + (rand(i + 99) - 0.5) * 0.5) / 5, r, shape: stoneShape(i + 40, r), col: PAL.stones[i % 5], rot: rand(i + 7) * TAU});
    i++;
  }
  return out;
})();
function drawBlock(stage, b, {fill = 1, stonesIn = 1, surface = null, stoneShift = null, heat = 0, outline = 0, cool = 0, fibres = 0, ghostSurface = null} = {}) {
  const c = stage.ctx, x0 = b.x, y0 = BY, asph = b.lane === 0;
  const top = surface || (() => 0);
  // top face (road surface) — a thin slanted parallelogram for depth
  const D = 34;
  const surfPts = []; for (let i = 0; i <= 40; i++) { const x = x0 + BW * i / 40; surfPts.push([x, y0 + top(i / 40)]); }
  poly(c, [...surfPts, [x0 + BW + D, y0 - D + top(1)], [x0 + D, y0 - D + top(0)]], asph ? PAL.asphHi : PAL.concHi);
  poly(c, [[x0 + BW, y0 + top(1)], [x0 + BW + D, y0 - D + top(1)], [x0 + BW + D, y0 + BH - D], [x0 + BW, y0 + BH]], asph ? PAL.asphLo : PAL.concLo);
  // front face clip: binder fill rising from the bottom, stones
  c.save(); c.beginPath(); c.moveTo(x0, y0 + BH); surfPts.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(x0 + BW, y0 + BH); c.closePath(); c.clip();
  c.fillStyle = '#0b1a20'; c.fillRect(x0, y0 - 60, BW, BH + 60);
  const fy = y0 + BH - (BH + 60) * fill;
  c.fillStyle = asph ? PAL.asph : PAL.conc; c.fillRect(x0, fy, BW, y0 + BH - fy);
  BSTONES.forEach((s, i) => {
    const drop = (1 - smooth(stonesIn * 1.6 - s.v * 0.6)) * 420;
    const [dx, dy] = stoneShift ? stoneShift(s) : [0, 0];
    drawStone(c, x0 + s.u * BW + dx, y0 + s.v * BH + dy - drop, s.shape, s.col, s.rot);
  });
  if (fibres > 0 && !asph) BSTONES.forEach((s, i) => {
    for (let k = 0; k < 3; k++) { const a = rand(i * 9 + k) * TAU, L = (14 + 16 * rand(i + k)) * fibres, x = x0 + s.u * BW + Math.cos(a) * s.r, y = y0 + s.v * BH + Math.sin(a) * s.r; line(c, [[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], rgba(PAL.fibre, 0.7), 2); }
  });
  if (cool > 0 && !asph) for (let i = 0; i < 26; i++) circle(c, x0 + rand(i + 300) * BW, y0 + rand(i + 400) * BH, 4, rgba(PAL.cool, 0.75 * cool));
  c.restore();
  if (heat > 0.01) lit(stage, cc => {                     // heat in the binder / on the surface (energy)
    cc.save(); cc.beginPath(); cc.moveTo(x0, y0 + BH); surfPts.forEach(p => cc.lineTo(p[0], p[1])); cc.lineTo(x0 + BW, y0 + BH); cc.closePath(); cc.clip();
    const g = cc.createLinearGradient(0, y0, 0, y0 + BH * 0.32); g.addColorStop(0, rgba(PAL.warm, 0.3 * heat)); g.addColorStop(1, rgba(PAL.warm, 0));
    cc.fillStyle = g; cc.fillRect(x0, y0 - 40, BW, BH);
    cc.restore();
    line(cc, surfPts, rgba(PAL.warm, 0.8 * heat), 4);
  }, {gain: 0.6});
  if (ghostSurface) line(c, ghostSurface, rgba(PAL.ink, 0.75), 2.5, {dash: [8, 7]});
  rect(c, x0, y0 + BH, BW, 0.1, 0, null, rgba(PAL.border, 1), 2);
  if (outline > 0) poly(c, [[x0, y0], [x0 + BW, y0], [x0 + BW, y0 + BH], [x0, y0 + BH]], null, rgba(PAL.ink, 0.8 * outline), 3);
  stage.text(asph ? '아스팔트' : '콘크리트', x0 + BW / 2, y0 - 68, {role: 'display', weight: 700, size: 40, align: 'center', color: PAL.ink});
}

// =====================================================================================================
// Lens (asphalt, concrete)
// =====================================================================================================
const LX = 540, LY = 690, LR = 350;
function lensFrame(stage, inner) {
  const c = stage.ctx;
  circle(c, LX, LY + 10, LR + 14, 'rgba(0,0,0,0.5)');
  clipEllipse(c, LX, LY, LR, LR, () => inner(c));
  ring(c, LX, LY, LR, rgba(PAL.muted, 0.9), 4);
}
const ASTONES = [[-170, -170, 95], [140, -200, 80], [-40, 30, 110], [210, 80, 90], [-230, 160, 85], [60, 240, 95], [-120, -330, 70], [300, -60, 60]].map(([x, y, r], i) => ({x, y, r, shape: stoneShape(i + 200, r), col: PAL.stones[i % 5], rot: rand(i + 3) * TAU}));
const CHAINS = Array.from({length: 70}, (_, i) => ({x: (rand(i + 500) - 0.5) * 2 * LR, y: (rand(i + 600) - 0.5) * 2 * LR, a: rand(i + 700) * TAU, n: 5 + Math.floor(rand(i + 800) * 4)}));

function asphaltTemp(t, ctx) {
  const h1 = ctx.tl.at('s12', 0.3), c1 = ctx.tl.at('s13', 0.2), h2 = ctx.tl.at('s14', 1.6);
  let T = 25;
  T = lerp(T, 150, smooth((t - h1) / 2.4));
  T = lerp(T, 25, smooth((t - c1) / 3.0));
  T = lerp(T, 150, smooth((t - h2) / 2.4));
  return T;
}
const fluidity = T => smooth((T - 35) / 110);        // smooth: no threshold

function drawAsphaltLens(stage, t, ctx) {
  const T = asphaltTemp(t, ctx), f = fluidity(T), c = stage.ctx;
  const enter = smooth((t - ctx.tl.at('s12', 1.0)) / 2.0);       // stones mix in while hot
  const coat = smooth((t - ctx.tl.at('s12', 2.0)) / 2.0);
  lensFrame(stage, cc => {
    cc.fillStyle = PAL.asph; cc.fillRect(LX - LR, LY - LR, 2 * LR, 2 * LR);
    // molecules: long chains, jiggle ∝ temperature; cold → closer, tangled
    const amp = 2 + 14 * f, sp = 0.6 + 6 * f;
    CHAINS.forEach((ch, i) => {
      const pts = []; let x = LX + ch.x, y = LY + ch.y, a = ch.a;
      for (let k = 0; k < ch.n; k++) {
        pts.push([x + amp * Math.sin(t * sp + i + k * 1.3), y + amp * Math.cos(t * sp * 1.1 + i * 2 + k)]);
        a += (rand(i * 31 + k) - 0.5) * (1.6 + 0.6 * (1 - f)); x += Math.cos(a) * 26; y += Math.sin(a) * 26;
      }
      line(cc, pts, rgba('#6e655a', 0.85), 4);
    });
    if (f > 0.01) lit(stage, g => { g.save(); g.beginPath(); g.arc(LX, LY, LR, 0, TAU); g.clip(); glow(g, LX, LY, LR * 1.2, PAL.warm, 0.35 * f); g.restore(); }, {gain: 0.5});
    // stones: slide in while the binder is runny; locked when cold
    ASTONES.forEach((s, i) => {
      const off = (1 - enter) * 520 * (i % 2 ? 1 : -1);
      const wob = 10 * f;
      const x = LX + s.x + off + wob * Math.sin(t * 2.3 + i), y = LY + s.y + wob * Math.cos(t * 1.9 + i * 2);
      if (coat > 0) poly(cc, s.shape.map(([u, v]) => [x + u * 1.16, y + v * 1.16]), rgba('#0d0e10', coat));   // thin binder film
      drawStone(cc, x, y, s.shape, s.col, s.rot);
    });
  });
  // labels and gauges (same clock as the lens)
  const la = fadeIn(t, ctx.tl.at('s11', 0.8));
  withAlpha(c, la * fadeOut(t, ctx.tl.at('s12', 0.5)), () => {
    line(c, [[LX + 90, LY - 120], [860, 330]], rgba(PAL.muted, 0.9), 2); circle(c, LX + 90, LY - 120, 6, PAL.muted);
    stage.text('큰 탄화수소 분자', 870, 318, {size: 28, weight: 500, color: PAL.ink, align: 'right'});
  });
  stage.text(`${fmt(T)}°C`, 120, 1115, {role: 'display', weight: 700, size: 76, color: T > 60 ? PAL.warm : PAL.ink});
  bar(stage, 120, 1185, 380, (T - 0) / 160, {label: '', left: '0', right: '160°C', col: rgba(PAL.warm, 0.85)});
  const ghost = t > ctx.tl.at('s14', 1.6) ? 1 - fluidity(25) : null;
  bar(stage, 580, 1150, 380, 1 - f, {label: '굳기', left: '묽음', right: '단단함', col: PAL.ink, ghost});
}

// ---------- concrete lens ----------
const CSTONES = [[-190, -150, 105], [170, -180, 95], [-20, 110, 115], [230, 170, 80], [-250, 210, 75]].map(([x, y, r], i) => ({x, y, r, shape: stoneShape(i + 300, r), col: PAL.stones[(i + 2) % 5], rot: rand(i + 9) * TAU}));
const GRAINS = (() => {
  const out = []; let i = 0;
  while (out.length < 46 && i < 2000) {
    const x = (rand(i + 900) - 0.5) * 2 * LR * 0.95, y = (rand(i + 950) - 0.5) * 2 * LR * 0.95, r = 13 + rand(i + 990) * 10; i++;
    if (Math.hypot(x, y) > LR - 20) continue;
    if (CSTONES.some(s => Math.hypot(x - s.x, y - s.y) < s.r + r + 6)) continue;
    if (out.some(g => Math.hypot(x - g.x, y - g.y) < g.r + r + 14)) continue;
    out.push({x, y, r, fib: Array.from({length: 7}, (_, k) => ({a: rand(i * 17 + k) * TAU, L: 30 + rand(i * 23 + k) * 46}))});
  }
  return out;
})();
const strength = d => d <= 0 ? 0 : (d / (d + 6)) * 34 / 28;
function concreteDays(t, ctx) {
  const g0 = ctx.tl.at('s17', 0.6), g1 = ctx.tl.at('s20', 0.3), d0 = ctx.tl.at('s20', 0.3), d1 = ctx.tl.at('s20', 5.0);
  if (t < g0) return 0;
  if (t < g1) return lerp(0, 1, clamp((t - g0) / (g1 - g0)));            // first day, slowly (hours)
  return lerp(1, 28, smooth((t - d0) / (d1 - d0)));
}
function drawConcreteLens(stage, t, ctx) {
  const c = stage.ctx, s15 = ctx.tl.at('s15'), wet = smooth((t - ctx.tl.at('s15', 1.4)) / 1.2);
  const sub = ctx.tl.at('s21', 0.2), subQ = smooth((t - sub) / 1.6);
  const d = concreteDays(t, ctx), S = strength(d), grow = Math.sqrt(clamp(S));
  // underwater sample: restarts fresh and grows again (time-lapse) — the air result stays as a faint afterimage
  const dW = t > sub ? lerp(0, 28, smooth((t - sub - 0.6) / 4.2)) : 0, growW = Math.sqrt(clamp(strength(dW)));
  const fibreSet = (cc, gr, alpha, sparks) => GRAINS.forEach((g, i) => g.fib.forEach((f, k) => {
    const L = f.L * gr; if (L < 1) return;
    const x = LX + g.x + Math.cos(f.a) * g.r, y = LY + g.y + Math.sin(f.a) * g.r;
    line(cc, [[x, y], [x + Math.cos(f.a) * L, y + Math.sin(f.a) * L]], rgba(PAL.fibre, alpha), 3);
  }));
  lensFrame(stage, cc => {
    cc.fillStyle = '#16232a'; cc.fillRect(LX - LR, LY - LR, 2 * LR, 2 * LR);
    if (wet > 0) { cc.fillStyle = rgba(PAL.cool, 0.28 * wet); cc.fillRect(LX - LR, LY + LR - 2 * LR * wet, 2 * LR, 2 * LR * wet); }
    CSTONES.forEach(s => drawStone(cc, LX + s.x, LY + s.y, s.shape, s.col, s.rot));
    if (t < sub) fibreSet(cc, grow, 0.9);
    else { fibreSet(cc, grow, 0.22 * (1 - 0.5 * subQ)); fibreSet(cc, growW, 0.9); }
    GRAINS.forEach((g, i) => circle(cc, LX + g.x, LY + g.y, g.r * (1 - 0.25 * (t < sub ? grow : growW)), PAL.grain));
    if (subQ > 0) { cc.fillStyle = rgba(PAL.cool, 0.3 * subQ); cc.fillRect(LX - LR, LY + LR - 2 * LR * subQ, 2 * LR, 2 * LR * subQ); line(cc, [[LX - LR, LY + LR - 2 * LR * subQ], [LX + LR, LY + LR - 2 * LR * subQ]], rgba(PAL.cool, 0.9 * (1 - subQ * 0.7)), 3); }
  });
  // reaction heat at the growing tips (hydration is exothermic) — small sparks while the growth is fast
  const rate = t < sub ? (t > ctx.tl.at('s17', 0.6) && d < 20 ? 1 - d / 20 : 0) : (dW > 0 && dW < 20 ? 1 - dW / 20 : 0);
  if (rate > 0.02) lit(stage, cc => {
    cc.save(); cc.beginPath(); cc.arc(LX, LY, LR, 0, TAU); cc.clip();
    const gr = t < sub ? grow : growW;
    GRAINS.forEach((g, i) => { const f = g.fib[Math.floor(i * 0.7) % 7], L = f.L * gr, x = LX + g.x + Math.cos(f.a) * (g.r + L), y = LY + g.y + Math.sin(f.a) * (g.r + L); if (L > 2) circle(cc, x, y, 3.5, rgba(PAL.warm, 0.9 * rate)); });
    cc.restore();
  }, {gain: 0.4});
  // kiln inset (s16): the powder is made by firing limestone and clay near 1450 °C
  const k16 = fadeIn(t, ctx.tl.at('s16', 0.1), 0.4) * fadeOut(t, ctx.tl.at('s17', -0.2), 0.4);
  if (k16 > 0) withAlpha(c, k16, () => {
    const x0 = 650, y0 = 300, w = 360, h = 220;
    rect(c, x0, y0, w, h, 14, rgba(PAL.plate, 0.94), rgba(PAL.border, 1), 2);
    const tube = [[x0 + 30, y0 + 120], [x0 + w - 40, y0 + 80]];
    line(c, tube, '#4d5357', 46); line(c, tube, '#6b7276', 34);
    lit(stage, cc => { glow(cc, x0 + w - 70, y0 + 86, 70, PAL.warm, 0.8); circle(cc, x0 + w - 70, y0 + 86, 12, '#FFD2A6'); }, {gain: 0.9});
    for (let i = 0; i < 6; i++) { const q = ((t * 0.6 + i / 6) % 1); circle(c, lerp(x0 + 40, x0 + w - 90, q), lerp(y0 + 118, y0 + 92, q) - 4, 6, q < 0.6 ? '#8a7f70' : '#6e6a62'); }
    stage.text('1450°C', x0 + w / 2, y0 + 180, {role: 'display', weight: 700, size: 52, color: PAL.warm, align: 'center'});
    stage.text('석회석 + 점토 → 가루', x0 + 24, y0 + 36, {size: 26, color: PAL.muted});
  });
  // labels
  const lw = fadeIn(t, ctx.tl.at('s15', 1.6)) * fadeOut(t, ctx.tl.at('s16', 0));
  withAlpha(c, lw, () => { stage.text('물', LX + LR - 40, LY + LR - 40, {size: 32, weight: 700, color: PAL.cool, align: 'right'}); stage.text('시멘트 가루', LX - LR + 40, LY - LR + 60, {size: 30, weight: 500, color: PAL.ink}); });
  const l18 = fadeIn(t, ctx.tl.at('s18', 0.2)) * fadeOut(t, ctx.tl.at('s20', -0.2));
  withAlpha(c, l18, () => { const g = GRAINS[3]; const f = g.fib[0]; const L = f.L * grow, p = [LX + g.x + Math.cos(f.a) * (g.r + L * 0.6), LY + g.y + Math.sin(f.a) * (g.r + L * 0.6)]; line(c, [p, [880, 330]], rgba(PAL.muted, 0.9), 2); circle(c, p[0], p[1], 6, PAL.muted); stage.text('새 물질 (수화 반응)', 890, 318, {size: 28, weight: 500, color: PAL.ink, align: 'right'}); });
  // gauges: days and strength (same model value as the fibre length)
  const gy = 1090, gx = 140, gw = 800, gh = 130;
  const ga = fadeIn(t, ctx.tl.at('s17', 0.4));
  withAlpha(c, ga, () => {
    const dd = t < sub ? d : dW;
    stage.text(dd < 1 ? `${fmt(dd * 24)}시간` : `${fmt(dd)}일`, gx - 20, gy - 24, {role: 'display', weight: 700, size: 58, color: PAL.ink});
    stage.text('강도', gx + 250, gy - 24, {size: 26, weight: 500, color: PAL.muted});
    const X = dv => gx + 250 + (gw - 250) * dv / 28, Y = sv => gy + gh - 20 - (gh - 20) * sv;
    line(c, [[X(0), Y(0)], [X(28), Y(0)]], rgba(PAL.muted, 0.8), 2);
    line(c, [[X(28), Y(0) + 8], [X(28), Y(1) - 6]], rgba(PAL.ink, 0.6), 2, {dash: [6, 6]});
    stage.text('28일', X(28), Y(0) + 28, {size: 24, color: PAL.muted, align: 'center'});
    const curve = (dmax, col, w, dash) => { const pts = []; for (let k = 0; k <= 60; k++) { const dv = dmax * k / 60; pts.push([X(dv), Y(strength(dv))]); } if (dmax > 0) line(c, pts, col, w, {dash}); };
    curve(Math.min(d, 28), PAL.ink, 4);
    if (t > sub) curve(Math.min(dW, 28), PAL.cool, 4, [10, 7]);
    if (t > sub) stage.text('물속', X(Math.max(2, Math.min(dW, 28))) - 10, Y(strength(Math.min(dW, 28))) + 30, {size: 24, color: PAL.cool, align: 'right'});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  // chain: summer time-lapse (trucks stream = repeated load) → only asphalt wheel paths sink → rewind → trucks drive off at real speed
  //        → s02: the whole summer again with gauges (days, rut depth per lane)
  hook(stage, t, p, ctx) {
    const s02 = ctx.tl.sentence('s02'), t0 = s02.start + 0.2, t1 = s02.end - 0.2;
    const tau = hookTau(t);
    let rut = smooth(tau / REW[0]);
    let trucks = hookTrucks(t, ctx);
    if (t > REW[1]) rut = 0;
    if (t > t0 - 0.5) { rut = smooth((t - t0) / (t1 - t0)); trucks = streamTrucks(t, t0, t1); }
    drawRoad(stage, t, {rut, trucks});
    // gauges during s02: days of summer and rut depth (asphalt grows, concrete stays 0)
    const ga = fadeIn(t, t0 - 0.2) * fadeOut(t, ctx.scene.end - 0.4);
    if (ga > 0) withAlpha(stage.ctx, ga, () => {
      const c = stage.ctx, x0 = 600, y0 = 300;
      rect(c, x0, y0, 420, 210, 14, rgba(PAL.plate, 0.9), rgba(PAL.border, 1), 2);
      stage.text(`여름 ${fmt(90 * clamp((t - t0) / (t1 - t0)))}일`, x0 + 24, y0 + 46, {role: 'display', weight: 700, size: 40, color: PAL.ink});
      stage.text('바퀴 자국 깊이', x0 + 24, y0 + 96, {size: 24, color: PAL.muted});
      bar(stage, x0 + 150, y0 + 138, 240, rut, {col: PAL.asphHi});
      stage.text('아스팔트', x0 + 24, y0 + 138, {size: 26, weight: 500, color: PAL.ink});
      bar(stage, x0 + 150, y0 + 180, 240, 0, {col: PAL.conc});
      stage.text('콘크리트', x0 + 24, y0 + 180, {size: 26, weight: 500, color: PAL.ink});
    });
  },

  // chain: CON + CRESCERE slide together (the name) → Roman dome poured ring by ring until it closes → bricks laid on hot
  //        bitumen, which cools black and holds them — both "stick and harden"
  origin(stage, t, p, ctx) {
    const c = stage.ctx, s03 = ctx.tl.sentence('s03'), s04 = ctx.tl.sentence('s04'), s05 = ctx.tl.sentence('s05');
    // --- name (s03)
    const nA = fadeOut(t, s04.start - 0.5, 0.5);
    if (nA > 0) withAlpha(c, nA, () => {
      const q = easeInOut((t - s03.start - 0.6) / 1.4);
      stage.text('CON', lerp(250, 372, q), 560, {role: 'display', weight: 700, size: 92, color: PAL.ink, align: 'right'});
      stage.text('CRESCERE', lerp(470, 372, q) + 10, 560, {role: 'display', weight: 700, size: 92, color: PAL.ink});
      withAlpha(c, 1 - q, () => { stage.text('함께', 200, 650, {size: 34, color: PAL.muted, align: 'center'}); stage.text('자라다', 680, 650, {size: 34, color: PAL.muted, align: 'center'}); });
      withAlpha(c, smooth((t - s03.start - 2.2) / 0.6), () => stage.text('→ 함께 자라난 것', 540, 680, {size: 40, weight: 500, color: PAL.warm, align: 'center'}));
      // a few grains growing together underneath (what the word will mean later)
      const gq = smooth((t - s03.start - 1.0) / 3.0);
      for (let i = 0; i < 9; i++) {
        const x = 300 + i * 60 + (rand(i) - 0.5) * 20, y = 850 + (rand(i + 9) - 0.5) * 60;
        for (let k = 0; k < 4; k++) { const a = rand(i * 4 + k) * TAU, L = 36 * gq; line(c, [[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], rgba(PAL.fibre, 0.75), 2.5); }
        circle(c, x, y, 13, PAL.grain);
      }
    });
    // --- Pantheon section (s04): drum + dome poured in rings
    const pours = ev(ctx, 'pour'), nP = pours.filter(x => x <= t).length, lastP = pours.filter(x => x <= t).pop();
    const pa = fadeIn(t, s04.start - 0.4, 0.5);
    if (pa > 0) withAlpha(c, pa, () => {
      const cx = 540, base = 860, R = 230, wall = 62, drumH = 230;
      // drum walls
      rect(c, cx - R - wall, base - drumH, wall, drumH, 0, PAL.conc, rgba('#000', 0.3), 1);
      rect(c, cx + R, base - drumH, wall, drumH, 0, PAL.conc, rgba('#000', 0.3), 1);
      rect(c, cx - R - wall - 20, base, 2 * (R + wall + 20), 14, 2, PAL.concLo);
      // dome: 6 rings from the springing line upwards; the last leaves the oculus open
      const N = 6, y0 = base - drumH;
      for (let k = 0; k < N; k++) {
        const done = k < nP, part = k === nP - 1 && lastP != null ? smooth((t - lastP) / 0.7) : 1;
        if (!done) { // formwork outline for rings still to come
          const a0 = Math.PI - k * (Math.PI / 2 - 0.16) / N, a1 = Math.PI - (k + 1) * (Math.PI / 2 - 0.16) / N;
          for (const s of [1, -1]) line(c, arcPts(cx, y0, R + wall / 2, a0, a1, s), rgba(PAL.muted, 0.5), 2, {dash: [6, 6]});
          continue;
        }
        const a0 = Math.PI - k * (Math.PI / 2 - 0.16) / N, a1 = Math.PI - (k + 0.15 + 0.85 * part) * (Math.PI / 2 - 0.16) / N;
        for (const s of [1, -1]) {
          const outer = arcPts(cx, y0, R + wall * (1 - k / N * 0.55), a0, a1, s), inner = arcPts(cx, y0, R, a0, a1, s).reverse();
          poly(c, [...outer, ...inner], mix(PAL.conc, PAL.concHi, k / N), rgba('#000', 0.25), 1);
        }
      }
      // the famous inscribed sphere: interior height = diameter
      withAlpha(c, smooth(nP / N), () => { ring(c, cx, y0, R, rgba(PAL.muted, 0.55), 2); line(c, [[cx - R, base - 30], [cx + R, base - 30]], rgba(PAL.muted, 0.7), 2); });
      if (nP >= N) stage.text('지름 43 m', cx, base - 56, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
      // pour stream at the latest pour
      if (lastP != null && t - lastP < 0.8) { const k = nP - 1, a = Math.PI - (k + 0.5) * (Math.PI / 2 - 0.16) / N; const px = cx + Math.cos(a) * R * 1.05, py = y0 - Math.sin(a) * R * 1.05; line(c, [[px, Math.max(330, py - 150)], [px, py - 10]], rgba(PAL.concHi, 0.9 * (1 - (t - lastP) / 0.8)), 10); }
    });
    // --- bricks and bitumen (s05)
    const bricks = ev(ctx, 'brick'), nB = bricks.filter(x => x <= t).length;
    const ba = fadeIn(t, s05.start - 0.4, 0.5);
    if (ba > 0) withAlpha(c, ba, () => {
      const x0 = 250, y0 = 1180, bw = 140, bh = 52, gap = 12;
      for (let r = 0; r < 4; r++) {
        if (r >= nB) break;
        const tr = bricks[r], q = smooth((t - tr) / 0.5), y = y0 - r * (bh + gap) - (1 - q) * 60;
        // hot bitumen bed under the row: glows when laid (heat), cools to black
        const hot = 1 - smooth((t - tr) / 2.2);
        rect(c, x0 - 10, y + bh, 4 * bw + 3 * gap + 20 + (r % 2 ? 0 : 0), gap, 2, '#121315');
        if (hot > 0.02) lit(stage, cc => rect(cc, x0 - 10, y + bh + 2, 4 * bw + 3 * gap + 20, gap - 4, 2, rgba(PAL.warm, 0.85 * hot)), {gain: 0.6});
        for (let k = 0; k < 4; k++) {
          const bx = x0 + k * (bw + gap) + (r % 2 ? -bw / 2 - gap / 2 : 0);
          if (bx < x0 - bw / 2 - 4 || bx + bw > x0 + 4 * bw + 3 * gap + 4) { const cx0 = Math.max(bx, x0 - 10), cx1 = Math.min(bx + bw, x0 + 4 * bw + 3 * gap + 10); rect(c, cx0, y, cx1 - cx0, bh, 3, '#9c6b4a', rgba('#000', 0.35), 1); continue; }
          rect(c, bx, y, bw, bh, 3, '#a8744f', rgba('#000', 0.35), 1);
          rect(c, bx, y, bw, 10, 3, rgba('#ffffff', 0.08));
          if (k > 0 || r % 2) rect(c, bx - gap, y, gap, bh, 0, '#121315');
        }
      }
      stage.text('역청', x0 + 4 * bw + 3 * gap + 40, y0 + bh + 6, {size: 28, weight: 500, color: PAL.ink});
      line(c, [[x0 + 4 * bw + 3 * gap + 34, y0 + bh + 6], [x0 + 4 * bw + 3 * gap + 6, y0 + bh + 6]], rgba(PAL.muted, 0.9), 2);
    });
  },

  // chain: road cut → same stones fall into both forms → binder fills (black film / grey paste) → weight bar 95:5
  //        → asphalt binder cools (heat glow fades) / water reaches the cement paste and short fibres grow
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s07 = ctx.tl.sentence('s07'), s08 = ctx.tl.sentence('s08'), s10 = ctx.tl.sentence('s10');
    const stonesIn = clamp((t - ctx.scene.start - 0.2) / 2.2), glue = ctx.events.has('glue') ? ctx.events.after('glue', t, 1.8) : 1;
    const cool = smooth((t - ctx.tl.at('s10', 0.2)) / 2.0), react = smooth((t - ctx.tl.wordStart('s10', '콘크리트')) / 2.0);
    const asHeat = fadeIn(t, s10.start - 0.6, 0.5) * (1 - cool);     // only while s10 says "식어서": hot, then cooling
    drawBlock(stage, BLK[0], {fill: glue, stonesIn, heat: 0.8 * asHeat});
    drawBlock(stage, BLK[1], {fill: glue, stonesIn, cool: react * (1 - smooth((t - s10.end) / 1.0)) + react * 0.4, fibres: react});
    // "same stones": dashed outline of the left stones laid over the right block for a moment
    const same = bump(t, s07.start + 2.4, s08.start - 0.2);
    if (same > 0) withAlpha(c, same, () => BSTONES.forEach(s => poly(c, s.shape.map(([u, v]) => [BLK[1].x + s.u * BW + u, BY + s.v * BH + v]), null, rgba(PAL.ink, 0.9), 2)));
    // weight bar (s08)
    const wa = fadeIn(t, s08.start + 0.2);
    if (wa > 0) withAlpha(c, wa, () => {
      const x = 120, y = 960, w = 840, q = smooth((t - s08.start - 0.4) / 1.6);
      stage.text('아스팔트 포장의 무게', x, y - 40, {size: 26, weight: 500, color: PAL.muted});
      rect(c, x, y - 18, w, 36, 6, rgba(PAL.border, 1));
      rect(c, x, y - 18, w * 0.95 * q, 36, 6, PAL.stones[1]);
      rect(c, x + w * 0.95, y - 18, w * 0.05 * smooth((t - s08.start - 2.0) / 0.8), 36, 6, '#0d0e10', rgba(PAL.ink, 0.6), 1.5);
      stage.text(`돌 ${fmt(95 * q)}%`, x, y + 66, {role: 'display', weight: 700, size: 60, color: PAL.ink});
      stage.text('풀 5%', x + w, y + 66, {role: 'display', weight: 700, size: 44, color: PAL.ink, align: 'right', alpha: smooth((t - s08.start - 2.0) / 0.8)});
    });
    // the two ways of hardening (s09–s10)
    const ha = fadeIn(t, ctx.tl.at('s10', -0.2));
    if (ha > 0) withAlpha(c, ha, () => {
      const y = 1130;
      // thermometer falling (asphalt)
      const tx = 150, col = lerp(1, 0.25, cool);
      rect(c, tx - 10, y - 70, 20, 90, 10, rgba(PAL.border, 1)); circle(c, tx, y + 26, 18, rgba(PAL.border, 1));
      rect(c, tx - 6, y + 16 - 76 * col, 12, 76 * col, 6, PAL.warm); circle(c, tx, y + 26, 13, PAL.warm);
      stage.text('식어서 굳는다', tx + 40, y, {role: 'display', weight: 700, size: 36, color: PAL.ink});
      // water drop (concrete)
      const dx = 640, dq = clamp(react * 1.3);
      poly(c, [[dx, y - 50 + 40 * dq], [dx + 16, y - 20 + 40 * dq], [dx, y - 6 + 40 * dq], [dx - 16, y - 20 + 40 * dq]], PAL.cool);
      stage.text('물과 반응해 굳는다', dx + 36, y, {role: 'display', weight: 700, size: 36, color: PAL.ink, maxWidth: 380});
    });
  },

  // chain: binder (chains) → heated 150 °C: chains jiggle fast, glow, stones slide in and get a thin film → cooled: chains slow,
  //        tangle, stones locked, stiffness bar up → reheated: runny again (afterimage of the cold stiffness)
  asphalt(stage, t, p, ctx) { drawAsphaltLens(stage, t, ctx); },

  // chain: dry grains → kiln (where the powder comes from) → water → fibres grow from grain surfaces (sparks = reaction heat)
  //        → fibres bridge grains and stones → days run to 28, strength curve → underwater sample grows the same way
  concrete(stage, t, p, ctx) { drawConcreteLens(stage, t, ctx); },

  // chain: surface heats to 60 °C (asphalt stiffness falls gradually) → wheel passes press both blocks → asphalt stones pushed
  //        aside, groove + humps; concrete unchanged → slabs shrink (curing, cold): with joints the cracks open at the joints,
  //        without joints they open anywhere (afterimage comparison)
  summer(stage, t, p, ctx) {
    const c = stage.ctx, s22 = ctx.tl.sentence('s22'), s25 = ctx.tl.sentence('s25');
    const T = lerp(25, 60, smooth((t - s22.start - 0.3) / 3.0));
    const heat = (T - 25) / 35;
    const wheels = ev(ctx, 'wheel'), nW = wheels.filter(x => x <= t).length, last = wheels.filter(x => x <= t).pop();
    const rut = clamp(nW / wheels.length) * (nW ? smooth((t - wheels[0]) / 0.3) : 0);
    const blockA = fadeOut(t, s25.start - 0.2, 0.6);
    if (blockA > 0) withAlpha(c, blockA, () => {
      const xw = 0.5, Dp = 46;
      const groove = u => { const d = (u - xw) / 0.13; return rut * Dp * (Math.exp(-d * d) - 0.42 * Math.exp(-(((Math.abs(u - xw) - 0.27) / 0.08) ** 2))); };
      const shift = s => { const du = s.u - xw, k = rut * Math.exp(-((s.v * 2.2) ** 2)); return [Math.sign(du) * 34 * k * Math.exp(-((du / 0.25) ** 2)), 40 * k * Math.exp(-((du / 0.16) ** 2))]; };
      const ghostS = rut > 0.05 ? [[BLK[0].x, BY], [BLK[0].x + BW, BY]] : null;
      drawBlock(stage, BLK[0], {surface: groove, stoneShift: shift, heat, ghostSurface: ghostS});
      drawBlock(stage, BLK[1], {heat: heat * 0.85, outline: bump(t, ctx.tl.at('s24'), ctx.tl.at('s24:end'))});
      // wheel passes: the same tyre load comes down on both blocks
      if (last != null && t - last < 0.42) {
        const q = (t - last) / 0.42, dy = Math.sin(q * Math.PI);
        for (const b of BLK) { const x = b.x + BW * 0.5, y = BY - 150 + 110 * dy + (b.lane === 0 ? groove(0.5) * dy : 0); rect(c, x - 70, y - 60, 140, 120, 22, PAL.wheel, rgba('#3a3d42', 1), 3); for (let k = 0; k < 4; k++) line(c, [[x - 60 + k * 40, y + 56], [x - 50 + k * 40, y + 60]], '#2b2d31', 4); }
      }
      // gauges: surface temperature (shared), stiffness per block, wheel-pass count
      stage.text(`${fmt(T)}°C`, 540, 990, {role: 'display', weight: 700, size: 84, color: T > 45 ? PAL.warm : PAL.ink, align: 'center'});
      stage.text('노면 온도', 540, 1050, {size: 24, color: PAL.muted, align: 'center'});
      bar(stage, BLK[0].x + 20, 1150, BW - 40, 1 - 0.75 * smooth((T - 25) / 40), {label: '굳기', left: '묽음', right: '단단함', col: PAL.ink});
      bar(stage, BLK[1].x + 20, 1150, BW - 40, 1, {label: '굳기', left: '묽음', right: '단단함', col: PAL.ink});
      if (nW > 0) stage.text(`바퀴 ×${fmt(nW * 500)}`, 540, 360, {role: 'display', weight: 500, size: 34, color: PAL.muted, align: 'center'});
    });
    // slabs shrink: joints vs no joints (plan view, length change exaggerated)
    const sA = fadeIn(t, s25.start - 0.2, 0.6);
    if (sA > 0) withAlpha(c, sA, () => {
      const shrink = smooth((t - ctx.tl.at('s25', 1.2)) / 2.6), cr = ev(ctx, 'crack');
      const x0 = 108, len = 864, pxm = len / 24, h = 150;
      const Tc = lerp(60, 5, shrink);
      stage.text(`${fmt(Tc)}°C`, 540, 360, {role: 'display', weight: 700, size: 64, color: Tc > 45 ? PAL.warm : PAL.ink, align: 'center'});
      for (const [row, y, joints] of [[0, 480, true], [1, 800, false]]) {
        stage.text(joints ? '줄눈 있음 · 6 m마다' : '줄눈 없음', x0, y - 36, {size: 30, weight: 500, color: PAL.ink});
        // each piece shortens about its own centre; the gaps (cracks) open where the pieces separate
        const breaks = joints ? [6, 12, 18] : [4.3, 13.6, 20.1];
        const opened = t > (cr[row] ?? 1e9);
        const segs = opened ? [0, ...breaks, 24] : [0, 24];
        for (let i = 0; i + 1 < segs.length; i++) {
          const a = segs[i], b = segs[i + 1], m = (a + b) / 2, k = 1 - 0.035 * shrink * (opened ? 1 : 0.4);
          const xa = x0 + (m - (m - a) * k) * pxm, xb = x0 + (m + (b - m) * k) * pxm;
          rect(c, xa, y, xb - xa, h, 3, PAL.conc, rgba('#000', 0.3), 1);
          for (let s = 0; s < 18; s++) circle(c, lerp(xa, xb, rand(s + i * 20 + row * 99)), y + rand(s + 50 + i * 20) * h, 2, rgba(PAL.concLo, 0.6));
        }
        if (joints) for (const j of breaks) { const x = x0 + j * pxm; line(c, [[x, y - 8], [x, y + h + 8]], rgba(PAL.joint, 1), 3); }
        if (opened) for (const j of breaks) {
          const x = x0 + j * pxm, pts = []; for (let s = 0; s <= 10; s++) pts.push([x + (joints ? 0 : (rand(s + j * 7) - 0.5) * 22), y + h * s / 10]);
          line(c, pts, '#0a0c0e', 3 + 3 * shrink);
        }
        if (opened) withAlpha(c, smooth((t - cr[row]) / 0.4), () => stage.text(joints ? '금이 줄눈에만' : '금이 아무 데나', x0 + len, y + h + 44, {size: 28, weight: 500, color: PAL.muted, align: 'right'}));
      }
      stage.text('길이 변화는 과장', 540, 1150, {size: 24, color: PAL.muted, align: 'center'});
    });
  },

  // chain: back to the road (same camera): 60 °C, the asphalt wheel paths are rutted, the concrete lane flat; trucks drive at
  //        real speed → conclusion text, end line
  close(stage, t, p, ctx) {
    const s27 = ctx.tl.sentence('s27'), c = stage.ctx;
    const trucks = [[0, 40], [1, 70], [0, 200], [1, 260]].map(([lane, z]) => ({lane, Z: z - REAL_V * (t - ctx.scene.start)}));
    const dim = 0.55 * smooth((t - s27.start + 0.6) / 0.8);
    drawRoad(stage, t, {rut: 1, trucks, dim});
    const ra = fadeIn(t, ctx.scene.start + 0.3) * (1 - smooth((t - s27.start + 0.6) / 0.6));
    if (ra > 0) withAlpha(c, ra, () => {
      rect(c, 640, 300, 380, 120, 14, rgba(PAL.plate, 0.9), rgba(PAL.border, 1), 2);
      stage.text('60°C', 664, 362, {role: 'display', weight: 700, size: 60, color: PAL.warm});
      stage.text('노면 온도', 1000, 362, {size: 26, color: PAL.muted, align: 'right'});
      const r = P3(WHEEL[0], 0, 9);
      line(c, [[r[0] + 20, r[1] - 20], [260, 640]], rgba(PAL.ink, 0.85), 2); circle(c, r[0] + 20, r[1] - 20, 6, PAL.ink);
      stage.text('바퀴 자국', 250, 620, {size: 32, weight: 700, color: PAL.ink, align: 'right'});
      const q = P3(1.75, 0, 9);
      line(c, [[q[0], q[1] - 20], [840, 640]], rgba(PAL.ink, 0.85), 2); circle(c, q[0], q[1] - 20, 6, PAL.ink);
      stage.text('그대로', 850, 620, {size: 32, weight: 700, color: PAL.ink});
    });
    // conclusion and the end line (only during the last sentence)
    const ea = smooth((t - s27.start + 0.4) / 0.6);
    if (ea > 0) withAlpha(c, ea, () => {
      stage.text('아스팔트는 식어서 굳고,', 540, 640, {role: 'display', weight: 700, size: 60, color: PAL.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18});
      stage.text('콘크리트는 물과 반응해 굳는다', 540, 730, {role: 'display', weight: 700, size: 60, color: PAL.ink, align: 'center', maxWidth: 940, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18});
      line(c, [[480, 800], [600, 800]], PAL.warm, 4, {cap: 'butt'});
      if (t >= s27.start) stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 870, {size: 34, weight: 500, color: PAL.muted, align: 'center', alpha: smooth((t - s27.start) / 0.5)});
    });
  },
};

function arcPts(cx, cy, r, a0, a1, side, n = 16) {
  const pts = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r]); }
  return side === 1 ? pts : pts.map(([x, y]) => [2 * cx - x, y]);
}
function bump(t, a, b) { if (t <= a || t >= b) return 0; const q = (t - a) / (b - a); return Math.min(1, Math.sin(q * Math.PI) * 1.6); }
