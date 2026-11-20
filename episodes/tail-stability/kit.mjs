// 66 꼬리날개 — 공통 그리기 부품 (PLAN.md 2절 팔레트, 4절 부품 4.1~4.12).
// 장면 전용 그림(화살·페노의 모형·종이비행기·풍향계·시소·B-2 조종면)은 여기 두지 않는다.
// 영상미 문법: 모형은 면과 명암이 있는 무광 덩어리, 난색 = 꼬리날개와 되돌리는 힘, 한색 = 돌풍과 더 틀어지게 하는 힘.
// lit() 은 돌풍·힘 화살표·기록선 끝점에만 쓴다(klit — 렌즈 안이면 그 안에서 다시 자른다). 연기 줄·모형·글자는 lit() 밖.
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, line, circle, ring, poly, rect, withAlpha, lit, rand, TAU, progressBar,
} from '../../pipeline/render/index.mjs';
import {XW, LT, R2D} from './model.mjs';

export const W = 1080, H = 1920;
export const PAL = {
  bg: '#001621', deep: '#000E16', ink: '#EFE3D4', muted: '#8AA0A6', border: '#1C3A45', plate: '#06222E',
  warm: '#FF5A1F',                 // 꼬리날개 · 되돌리는 힘 (하나뿐인 난색)
  warmHi: '#F29060', warmLo: '#B4481F',   // 꼬리날개 면의 무광 명암
  cool: '#5BB8E8',                 // 돌풍 · 더 틀어지게 하는 힘 (하나뿐인 한색)
  smoke: '#5C8996',                // 연기 줄(무광, lit 아님)
  bodyHi: '#E6EFF1', bodyMid: '#B3C7CC', bodyLo: '#58747E', wing: '#C9D6DA', dark: '#34505A', darker: '#2B444D',
  paper: '#E9E2D2', paperLo: '#B9B09C',
};
export const FLOW_V = 520;          // 연기 줄이 흐르는 빠르기(px / 모형 초)

// =====================================================================================================
// lit() 감싸기: 렌즈 안에서 부르면 렌즈 원으로 다시 자른다(빛 지도는 바깥의 자르기를 따르지 않는다 — docs/HDR.md).
// LENS_CLIP 은 lens() 가 drawWorld 를 부르는 동안만 걸린다. fn 안에서는 읽기만 한다.
// 렌즈 안의 lit() 은 세계 좌표(렌즈 변환만 걸린 상태)에서 불러야 한다 — 모형 변환 안에서 부르지 않는다.
// =====================================================================================================
let LENS_CLIP = null;
export function klit(stage, fn, o = {}) {
  const C = LENS_CLIP;
  lit(stage, c => {
    if (!C) { fn(c); return; }
    c.save(); c.beginPath(); c.arc(C.x, C.y, C.r, 0, TAU); c.clip();
    try { fn(c); } finally { c.restore(); }
  }, o);
}

/** 모형 좌표(u) → 화면 px. m = {x, y, s, theta}. */
export function toScreen(m, ux, uy) {
  const cs = Math.cos(m.theta || 0), sn = Math.sin(m.theta || 0);
  return [m.x + m.s * (ux * cs - uy * sn), m.y + m.s * (ux * sn + uy * cs)];
}
/** 옆모습의 기준점(모형 u): 축, 날개의 양력이 걸리는 자리, 수평 꼬리날개 중심, 기수 끝, 꼬리 끝, 수직 꼬리날개 중심. */
export const SIDE_PTS = {cg: [0, 0], ac: [-XW, 9], stab: [151, -5], nose: [-118, 2], tailEnd: [172, -3], fin: [146, -38], wingLE: [-24, 9], wingTE: [46, 9]};
/** 평면도의 기준점(모형 u). */
export const TOP_PTS = {cg: [0, 0], nose: [-118, 0], fin: [144, 0], stab: [160, 0], tailEnd: [172, 0]};

// =====================================================================================================
// 4.1 옆모습 모형
// 원점 = 축(⊕), +x = 꼬리 쪽, +y = 아래. radar 샘플 bodyPath 의 x + 27, 수직 꼬리날개는 몸통에서 떼어 따로.
// 모든 닫힌 경로는 시계 방향(화면) — 실루엣 하나로 합칠 때 nonzero 채움이 합집합이 된다.
// =====================================================================================================
function bodyPathSide(c) {
  c.moveTo(-118, 2); c.bezierCurveTo(-116, -7, -107, -12, -101, -13); c.bezierCurveTo(-91, -16, -79, -17, -69, -17);
  c.lineTo(111, -17); c.lineTo(159, -9); c.lineTo(172, -5); c.lineTo(172, -1);
  c.bezierCurveTo(155, 5, 137, 10, 123, 12); c.lineTo(-73, 17); c.bezierCurveTo(-89, 17, -99, 16, -105, 14); c.bezierCurveTo(-112, 11, -117, 7, -118, 2);
  c.closePath();
}
const FIN_SIDE = [[111, -17], [145, -62], [167, -62], [159, -9]];
// 위가 볼록한 물방울 꼴(NACA 4자리 두께 분포, 위 1.5 : 아래 0.5)
function airfoil(xLE, chord, yC, thick, n = 18) {
  const T = thick / chord, up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const q = (1 - Math.cos(Math.PI * i / n)) / 2;   // 앞전 쪽을 촘촘히
    const yt = 5 * T * (0.2969 * Math.sqrt(q) - 0.126 * q - 0.3516 * q * q + 0.2843 * q ** 3 - 0.1036 * q ** 4) * chord;
    up.push([xLE + q * chord, yC - 1.5 * yt]); lo.push([xLE + q * chord, yC + 0.5 * yt]);
  }
  return [...up, ...lo.reverse().slice(1, -1)];
}
const WING_SIDE = airfoil(-24, 70, 9, 9);
const STAB_SIDE = (() => {   // 얇은 렌즈 꼴(대칭), 앞전 129 · 뒷전 173, y = −5, 두께 5
  const up = [], lo = [], n = 14;
  for (let i = 0; i <= n; i++) { const q = i / n, x = 129 + 44 * q, h = 2.5 * Math.sin(Math.PI * Math.pow(q, 0.75)); up.push([x, -5 - h]); lo.push([x, -5 + h]); }
  return [...up, ...lo.reverse().slice(1, -1)];
})();
const pathPts = (c, pts) => { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

function finSide(c) {
  c.beginPath(); pathPts(c, FIN_SIDE);
  const g = c.createLinearGradient(111, -62, 167, -9); g.addColorStop(0, PAL.warmHi); g.addColorStop(0.5, mix(PAL.warmHi, PAL.warmLo, 0.45)); g.addColorStop(1, PAL.warmLo);
  c.fillStyle = g; c.fill();
  c.beginPath(); c.moveTo(112, -18); c.lineTo(145, -62); c.lineTo(167, -62);
  c.strokeStyle = rgba('#FFE6D6', 0.45); c.lineWidth = 1.4; c.lineJoin = 'round'; c.stroke();
}
function stabSide(c) {
  c.beginPath(); pathPts(c, STAB_SIDE);
  const g = c.createLinearGradient(0, -8, 0, -2); g.addColorStop(0, PAL.warmHi); g.addColorStop(1, PAL.warmLo);
  c.fillStyle = g; c.fill();
  c.strokeStyle = rgba('#3A1A0C', 0.55); c.lineWidth = 0.8; c.stroke();
}
function tailOutlineSide(c, col, w, dash) {
  c.save(); c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round';
  c.beginPath(); pathPts(c, FIN_SIDE); c.stroke();
  c.beginPath(); pathPts(c, STAB_SIDE); c.stroke();
  c.restore();
}
function sideSilhouette(c, withTail) {
  c.beginPath(); bodyPathSide(c); pathPts(c, WING_SIDE);
  c.moveTo(22, 25); c.ellipse(-2, 25, 24, 8, 0, 0, TAU);
  if (withTail) { pathPts(c, FIN_SIDE); pathPts(c, STAB_SIDE); }
}

/**
 * 옆모습 모형. o = {x, y, s, theta, tail: 'on'|'ghost'|'off', tailAlpha, ghost, hl}
 *  tailAlpha (tail 'on'): 0..1 — 꼬리날개 면의 불투명도(떼기·붙이기 중간). 1 미만이면 그만큼 점선 윤곽이 비친다.
 *  ghost: a > 0 이면 몸 전체를 rgba(bodyMid, a) 실루엣 하나로(잔상용). 꼬리 포함 여부는 tail 을 따른다.
 *  hl = {ac: 0..1 양력이 걸리는 자리 표식, tail: 0..1 꼬리날개 윤곽 밝힘(붙는 순간 · '없으면' 짚기),
 *        track: 0..1 수평 꼬리날개 추적 원, trackFin: 0..1 수직 꼬리날개 추적 원, cg: 0..1 ⊕ 고리(기본 0)}
 */
export function drawSide(stage, o) {
  const {x, y, s, theta = 0, tail = 'on', tailAlpha = 1, ghost = 0, hl = {}} = o;
  const c = stage.ctx;
  c.save(); c.translate(x, y); c.rotate(theta); c.scale(s, s);
  if (ghost > 0) {
    sideSilhouette(c, tail === 'on'); c.fillStyle = rgba(PAL.bodyMid, ghost); c.fill('nonzero');
    c.restore(); return;
  }
  const tOn = tail === 'on' ? clamp(tailAlpha) : 0;
  if (tOn > 0) withAlpha(c, tOn, () => finSide(c));
  // fuselage
  c.beginPath(); bodyPathSide(c);
  const g = c.createLinearGradient(0, -17, 0, 17); g.addColorStop(0, PAL.bodyHi); g.addColorStop(0.55, PAL.bodyMid); g.addColorStop(1, PAL.bodyLo);
  c.fillStyle = g; c.fill();
  c.beginPath(); c.moveTo(-118, 2); c.bezierCurveTo(-116, -7, -107, -12, -101, -13); c.bezierCurveTo(-91, -16, -79, -17, -69, -17); c.lineTo(111, -17);
  c.strokeStyle = rgba('#FFFFFF', 0.55); c.lineWidth = 1.5 / Math.max(1, s * 0.6); c.lineJoin = 'round'; c.stroke();
  c.fillStyle = rgba('#0A1E27', 0.75); for (let wx = -69; wx <= 97; wx += 13) { c.beginPath(); c.arc(wx, -6, 1.6, 0, TAU); c.fill(); }
  c.beginPath(); c.moveTo(-97, -8); c.lineTo(-81, -12); c.lineTo(-77, -6); c.lineTo(-95, -3); c.closePath(); c.fillStyle = '#0A1E27'; c.fill();
  // engine (pylon + nacelle), then the wing root section in front
  rect(c, -8, 12, 14, 8, 0, PAL.darker);
  c.beginPath(); c.ellipse(-2, 25, 24, 8, 0, 0, TAU);
  const ge = c.createLinearGradient(0, 17, 0, 33); ge.addColorStop(0, '#46636D'); ge.addColorStop(1, '#1E333B'); c.fillStyle = ge; c.fill();
  c.beginPath(); c.ellipse(-2, 25, 24, 8, 0, Math.PI * 0.6, Math.PI * 1.4); c.strokeStyle = rgba('#9FB6BD', 0.8); c.lineWidth = 1.2; c.stroke();
  c.beginPath(); pathPts(c, WING_SIDE);
  // 날개 단면: 동체(bodyMid)와 갈리도록 윗면만 wing 색 띠로 밝고 몸은 한 단 어둡게(무광 명암)
  const gw = c.createLinearGradient(0, 2, 0, 12); gw.addColorStop(0, PAL.wing); gw.addColorStop(0.28, mix(PAL.wing, PAL.bodyLo, 0.55)); gw.addColorStop(1, PAL.dark);
  c.fillStyle = gw; c.fill(); c.strokeStyle = rgba(PAL.darker, 0.9); c.lineWidth = 1.2 / Math.max(1, s * 0.5); c.stroke();
  if (tOn > 0) withAlpha(c, tOn, () => stabSide(c));
  // tail outline: dashed where the tail is missing; warm when highlighted
  const hlT = clamp(hl.tail || 0), ga = tail === 'ghost' ? 1 : tail === 'on' ? 1 - tOn : 0;
  if (ga > 0) withAlpha(c, ga, () => tailOutlineSide(c, rgba(mix(PAL.ink, PAL.warmHi, hlT), 0.45 + 0.5 * hlT), (2 + 1.5 * hlT) / s, [6 / s, 6 / s]));
  if (tail === 'on' && hlT > 0) tailOutlineSide(c, rgba(PAL.warmHi, 0.95 * hlT * tOn), 3 / s);
  c.restore();
  // tracking circles and the lift point (screen space, so the line widths stay in px)
  const m = {x, y, s, theta};
  if (hl.track > 0) { const p = toScreen(m, ...SIDE_PTS.stab); ring(c, p[0], p[1], 34 * s * 0.75 + 18, rgba(PAL.ink, 0.85 * hl.track), 2.5); }
  if (hl.trackFin > 0) { const p = toScreen(m, ...SIDE_PTS.fin); ring(c, p[0], p[1], 30 * s * 0.75 + 18, rgba(PAL.ink, 0.85 * hl.trackFin), 2.5); }
  if (hl.ac > 0) withAlpha(c, hl.ac, () => { const p = toScreen(m, ...SIDE_PTS.ac); circle(c, p[0], p[1], 9, PAL.deep); circle(c, p[0], p[1], 6, PAL.cool); });
  cgMark(c, x, y, Math.max(14, 5 * s), theta, {ring: hl.cg || 0});
}

/** ⊕ 무게중심 = 축. 원을 넷으로 나눠 맞은편 둘을 ink, 나머지를 deep, 테두리 ink 2 px. rot 으로 모형과 함께 돈다. o.ring: 0..1 밖의 고리(짚기). */
export function cgMark(c, x, y, r, rot = 0, o = {}) {
  c.save(); c.translate(x, y); c.rotate(rot);
  for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, k * TAU / 4, (k + 1) * TAU / 4); c.closePath(); c.fillStyle = k % 2 ? PAL.deep : PAL.ink; c.fill(); }
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.strokeStyle = PAL.ink; c.lineWidth = 2; c.stroke();
  c.restore();
  if (o.ring > 0) ring(c, x, y, r + 8 + 10 * (1 - o.ring), rgba(PAL.ink, 0.9 * o.ring), 2.5);
}

// =====================================================================================================
// 4.6 꼬리날개 떼기·붙이기 — 조각(수직 + 수평, 난색)을 따로 그린다
// =====================================================================================================
const PIECE_C = [146, -30];   // 조각이 도는 중심(모형 u)
/**
 * 떨어진 꼬리날개 조각. m = 모형 {x, y, s, theta}(조각이 붙어 있던 자리), pose = {dx, dy, rot, a}(화면 px, 라디안, 알파).
 */
export function tailPiece(stage, m, pose) {
  if (!pose || pose.a <= 0) return;
  const c = stage.ctx, [px, py] = toScreen(m, ...PIECE_C);
  withAlpha(c, pose.a, () => {
    c.save(); c.translate(px + pose.dx, py + pose.dy); c.rotate((m.theta || 0) + pose.rot); c.scale(m.s, m.s); c.translate(-PIECE_C[0], -PIECE_C[1]);
    finSide(c); stabSide(c);
    if (pose.flash > 0) tailOutlineSide(c, rgba(PAL.warmHi, 0.95 * pose.flash), 3 / m.s);
    c.restore();
  });
}
/**
 * 떼기의 자세: age = 떼기 사건부터 지난 초(벽시계). 0.12초 제자리 → 바람에 실려(FLOW_V × 0.9) 오른쪽으로, 조금 위로, 초당 40° 돈다.
 * pre = [dx, dy]: 0초 프레임에 이미 떠 있는 자리(hook: [70, −40]). hold 를 0 으로 주면 바로 움직인다.
 */
export function detachPose(age, {pre = [0, 0], hold = 0.12} = {}) {
  if (age < 0) return null;
  const u = Math.max(0, age - hold), ramp = Math.min(u, 0.15) * Math.min(u, 0.15) / 0.3 + Math.max(0, u - 0.15);   // 0.15초에 걸쳐 빨라짐
  return {dx: pre[0] + FLOW_V * 0.9 * ramp, dy: pre[1] - 46 * ramp, rot: -40 * Math.PI / 180 * u, a: 1};
}
/**
 * 붙이기의 자세: age = 붙이기 사건부터 지난 초. 0.5초에 오른쪽 밖(dx0)에서 날아와 붙는다. 붙은 뒤에는 null(drawSide 가 그림)
 * — 돌려주는 flash(0..1, 붙은 뒤 0.2초)를 drawSide 의 hl.tail 로 넘긴다. done = 붙었는가.
 */
export function attachPose(age, {dx0 = 620, dy0 = -60} = {}) {
  if (age < 0) return {pose: null, done: false, flash: 0};
  if (age < 0.5) { const q = easeInOut(age / 0.5); return {pose: {dx: dx0 * (1 - q), dy: dy0 * (1 - q), rot: 0.5 * (1 - q), a: 1}, done: false, flash: 0}; }
  const f = age - 0.5;
  return {pose: null, done: true, flash: f < 0.2 ? 1 - f / 0.2 : 0};
}

// =====================================================================================================
// 4.2 평면도 모형 — 같은 원점·같은 x 축, +y = 화면 아래(오른쪽 날개). theta > 0 = 기수가 화면 위로.
// flying 0..1: 전익기 윤곽으로 넘어감(동체가 날개 속으로 줄고, 날개 반쪽 외곽이 점 대 점으로 옮겨 감).
// =====================================================================================================
const WING_HALF = [[-24, 0], [8, 75], [40, 150], [62, 150], [58, 110], [54, 75], [50, 37], [46, 0]];           // 보통 비행기(뒤젖힘)
const FLY_HALF = [[-100, 0], [-19, 88], [62, 175], [80, 178], [38, 118], [78, 62], [44, 26], [68, 0]];        // 전익기(뒷전 톱니, 가운데 뾰족)
const STAB_TOP = [[129, 0], [158, -55], [178, -55], [173, 0]];
const FIN_TOP = (() => { const up = [], lo = []; for (let i = 0; i <= 12; i++) { const q = i / 12, x = 118 + 52 * q, h = 2.5 * Math.sin(Math.PI * Math.pow(q, 0.8)); up.push([x, -h]); lo.push([x, h]); } return [...up, ...lo.reverse().slice(1, -1)]; })();
function fuselageTop(c, x0, x1, hw) {
  const L = x1 - x0, nose = Math.min(hw * 1.6, L * 0.3);
  c.beginPath();
  c.moveTo(x0, 0); c.bezierCurveTo(x0, -hw * 0.7, x0 + nose * 0.5, -hw, x0 + nose, -hw);
  c.lineTo(x1 - L * 0.28, -hw); c.lineTo(x1, -hw * 0.22); c.lineTo(x1, hw * 0.22); c.lineTo(x1 - L * 0.28, hw);
  c.lineTo(x0 + nose, hw); c.bezierCurveTo(x0 + nose * 0.5, hw, x0, hw * 0.7, x0, 0); c.closePath();
}
function halfPoly(pts, sgn) { return pts.map(([x, y]) => [x, sgn * y]); }
function wingOutline(q) {
  const right = WING_HALF.map((p, i) => [lerp(p[0], FLY_HALF[i][0], q), lerp(p[1], FLY_HALF[i][1], q)]);
  return [...right.map(([x, y]) => [x, -y]), ...right.slice().reverse().map(([x, y]) => [x, y])];
}
function drawTopTail(c, alpha, dashedA, hlT, s) {
  if (alpha > 0) withAlpha(c, alpha, () => {
    for (const sg of [-1, 1]) {
      c.beginPath(); pathPts(c, halfPoly(STAB_TOP, sg));
      const g = c.createLinearGradient(140, -55, 175, 55); g.addColorStop(0, PAL.warmHi); g.addColorStop(1, PAL.warmLo); c.fillStyle = g; c.fill();
    }
  });
  return () => {   // the fin goes on top of the fuselage — returned so drawTop can call it after the fuselage
    if (alpha > 0) withAlpha(c, alpha, () => {
      c.beginPath(); pathPts(c, FIN_TOP); const g = c.createLinearGradient(0, -3, 0, 3); g.addColorStop(0, PAL.warmHi); g.addColorStop(1, PAL.warmLo); c.fillStyle = g; c.fill();
      c.strokeStyle = rgba('#3A1A0C', 0.6); c.lineWidth = 0.8; c.stroke();
    });
    if (dashedA > 0) withAlpha(c, dashedA, () => {
      c.save(); c.setLineDash([6 / s, 6 / s]); c.strokeStyle = rgba(mix(PAL.ink, PAL.warmHi, hlT), 0.45 + 0.5 * hlT); c.lineWidth = (2 + 1.5 * hlT) / s;
      for (const sg of [-1, 1]) { c.beginPath(); pathPts(c, halfPoly(STAB_TOP, sg)); c.stroke(); }
      c.beginPath(); pathPts(c, FIN_TOP); c.stroke(); c.restore();
    });
  };
}
/**
 * 평면도 모형. o = {x, y, s, theta, tail: 'on'|'ghost'|'off', tailAlpha, flying, ghost, hl: {tail, track (수평), trackFin (수직), cg}}
 */
export function drawTop(stage, o) {
  const {x, y, s, theta = 0, tail = 'on', tailAlpha = 1, flying = 0, ghost = 0, hl = {}} = o;
  const c = stage.ctx, q = smooth(flying);
  c.save(); c.translate(x, y); c.rotate(theta); c.scale(s, s);
  const fx0 = lerp(-118, -60, q), fx1 = lerp(172, 40, q), fhw = lerp(17, 12, q), fa = 1 - smooth((flying - 0.35) / 0.55);
  const wingPts = wingOutline(q);
  if (ghost > 0) {
    c.beginPath(); pathPts(c, wingPts); if (fa > 0.5) fuselageTop(c, fx0, fx1, fhw);
    if (tail === 'on') { pathPts(c, STAB_TOP); pathPts(c, halfPoly(STAB_TOP, -1).reverse()); }
    c.fillStyle = rgba(PAL.bodyMid, ghost); c.fill('nonzero'); c.restore(); return;
  }
  // engines (under the wings, ahead of the leading edge), fade with the morph
  if (fa > 0) withAlpha(c, fa, () => { for (const sg of [-1, 1]) rect(c, -40, sg * 60 - 7, 40, 14, 7, PAL.darker); });
  // wing: root bright → tip darker; becomes the dark matte flying wing
  c.beginPath(); pathPts(c, wingPts);
  const span = lerp(150, 178, q), gw = c.createLinearGradient(0, -span, 0, span);
  const tipC = mix(mix(PAL.wing, PAL.bodyLo, 0.42), PAL.dark, q), rootC = mix(PAL.wing, mix(PAL.bodyLo, PAL.dark, 0.3), q);
  gw.addColorStop(0, tipC); gw.addColorStop(0.42, rootC); gw.addColorStop(0.58, mix(rootC, PAL.bodyLo, 0.15)); gw.addColorStop(1, mix(tipC, PAL.darker, 0.35));
  c.fillStyle = gw; c.fill(); c.strokeStyle = rgba(PAL.darker, 0.9); c.lineWidth = 1 / s * 1.6; c.stroke();
  // leading-edge highlight (light from the top of the screen)
  const le = wingPts.slice(0, 3); line(c, le, rgba('#FFFFFF', 0.35 * (1 - 0.5 * q)), 1.2 / s * 1.6);
  const tOn = tail === 'on' ? clamp(tailAlpha) : 0, dashedA = (tail === 'ghost' ? 1 : tail === 'on' ? 1 - tOn : 0) * fa;
  const finAfter = drawTopTail(c, tOn * fa, dashedA, clamp(hl.tail || 0), s);
  // fuselage
  if (fa > 0) withAlpha(c, fa, () => {
    fuselageTop(c, fx0, fx1, fhw);
    const g = c.createLinearGradient(0, -fhw, 0, fhw); g.addColorStop(0, PAL.bodyHi); g.addColorStop(0.45, PAL.bodyMid); g.addColorStop(1, PAL.bodyLo);
    c.fillStyle = g; c.fill();
    line(c, [[fx0 + 14, -fhw * 0.45], [fx1 - 50, -fhw * 0.45]], rgba('#FFFFFF', 0.4), 1.2 / s * 1.6);
    c.beginPath(); c.moveTo(fx0 + 10, -6); c.lineTo(fx0 + 22, -9); c.lineTo(fx0 + 22, 9); c.lineTo(fx0 + 10, 6); c.closePath(); c.fillStyle = '#0A1E27'; c.fill();
  });
  finAfter();
  if (hl.tail > 0 && tail === 'on') {
    c.save(); c.strokeStyle = rgba(PAL.warmHi, 0.95 * hl.tail); c.lineWidth = 3 / s;
    for (const sg of [-1, 1]) { c.beginPath(); pathPts(c, halfPoly(STAB_TOP, sg)); c.stroke(); }
    c.beginPath(); pathPts(c, FIN_TOP); c.stroke(); c.restore();
  }
  c.restore();
  const m = {x, y, s, theta};
  if (hl.trackFin > 0) { const p = toScreen(m, ...TOP_PTS.fin); ring(c, p[0], p[1], 40 + 12 * s, rgba(PAL.ink, 0.85 * hl.trackFin), 2.5); }
  if (hl.track > 0) for (const sg of [-1, 1]) { const p = toScreen(m, 160, sg * 30); ring(c, p[0], p[1], 30 + 10 * s, rgba(PAL.ink, 0.85 * hl.track), 2.5); }
  cgMark(c, x, y, Math.max(14, 5 * s), theta, {ring: hl.cg || 0});
}

// =====================================================================================================
// 4.3 연기 줄 — 무광, 모형 뒤에 그린다. phase = model.flowPhase(t).
// =====================================================================================================
const SM = {gap: 44, w: 11, period: 2200, edge: 40, alpha: 0.5};   // PLAN 0.72 → 0.5: 0초 포스터(썸네일)에서 줄이 모형·글을 이기지 않게. 첫 순간 수치는 다시 잼(kit_demo)
const SMOKE_LINES = new Map();
function smokePattern(i) {
  if (SMOKE_LINES.has(i)) return SMOKE_LINES.get(i);
  const dashes = []; let x = 0, k = 0;
  while (true) {
    const len = 120 + 140 * rand(i * 31.7 + k * 3.1 + 5), gap = 100 + 140 * rand(i * 57.3 + k * 7.9 + 11);
    if (x + len > SM.period - 100) break;
    dashes.push([x, x + len]); x += len + gap; k++;
  }
  const p = {dashes, off: rand(i * 7.3 + 1) * SM.period};
  SMOKE_LINES.set(i, p); return p;
}
/**
 * 연기 줄. o = {y0, y1 (화면에서 자르는 범위), alpha, dir (바람 방향 회전, 라디안, 화면 가운데 중심), wake: [{x, y, halfH, amp}],
 *   width (줄 굵기, 기본 11), strength (색 알파 계수, 기본 0.72)}
 * wake: 축의 오른쪽, y ± halfH 안의 줄에 amp px 의 사인 굽이(파장 180 px, phase 를 따라 흐름).
 */
export function smokeField(stage, phase, o = {}) {
  const {y0 = 0, y1 = H, alpha = 1, dir = 0, wake = [], width = SM.w, strength = SM.alpha} = o;
  if (alpha <= 0) return;
  const c = stage.ctx, shift = FLOW_V * phase, col = PAL.smoke, A = strength * alpha;
  c.save();
  c.beginPath(); c.rect(-10, y0, W + 20, y1 - y0); c.clip();
  // extended range when the wind is turned, so the rotated field still covers the clip
  const ext = dir ? 420 : 0, xa = -ext - 20, xb = W + ext + 20;
  if (dir) { c.translate(540, 960); c.rotate(dir); c.translate(-540, -960); }
  const iA = Math.floor((y0 - ext) / SM.gap) - 1, iB = Math.ceil((y1 + ext) / SM.gap) + 1;
  c.lineCap = 'round'; c.lineWidth = width;
  for (let i = iA; i <= iB; i++) {
    const ly = SM.gap * i + SM.gap / 2;
    if (!dir && (ly < y0 - width || ly > y1 + width)) continue;
    const P = smokePattern(i), base = ((shift + P.off) % SM.period + SM.period) % SM.period;
    const wk = wake.filter(w => w.amp > 0.3 && Math.abs(ly - w.y) < w.halfH);
    for (let n = -1; n <= Math.ceil((xb - xa) / SM.period) + 1; n++) for (const [a, b] of P.dashes) {
      const xs = xa + a + base + (n - 1) * SM.period, xe = xs + (b - a);
      if (xe < xa || xs > xb) continue;
      const len = xe - xs, e = Math.min(SM.edge, len / 2) / len;
      const g = c.createLinearGradient(xs, 0, xe, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(e, rgba(col, A)); g.addColorStop(1 - e, rgba(col, A)); g.addColorStop(1, rgba(col, 0));
      c.strokeStyle = g; c.beginPath();
      if (!wk.length) { c.moveTo(xs, ly); c.lineTo(xe, ly); }
      else {
        for (let x = xs, j = 0; ; x = Math.min(xe, x + 12), j++) {
          let dy = 0;
          for (const w of wk) if (x > w.x) dy += w.amp * smooth((x - w.x) / 80) * Math.cos(Math.PI / 2 * (ly - w.y) / w.halfH) * Math.sin(TAU * (x - shift) / 180);
          j ? c.lineTo(x, ly + dy) : c.moveTo(x, ly + dy);
          if (x >= xe) break;
        }
      }
      c.stroke();
    }
    circle(c, dir ? xa + ext + 4 : 4, ly, 4, PAL.muted);   // nozzle of the smoke rake
  }
  c.restore();
}
/** 넘어가는 모형 뒤의 굽이(wake) 하나: m = {x, y, s, theta}. 0° 에서 0. */
export function wakeOf(m, amp0 = 16) {
  const sn = Math.abs(Math.sin(m.theta));
  return {x: m.x, y: m.y, halfH: Math.max(40, 172 * m.s * sn + 30 * m.s), amp: amp0 * sn};
}

// =====================================================================================================
// 4.4 카드 뒤집기 — 축의 y 를 중심으로 세로 배율 1 → 0.05(앞 그림) → 1(뒤 그림). q 0..1(0.8초).
// =====================================================================================================
export function flipView(stage, q, drawA, drawB, {cy = 960} = {}) {
  const c = stage.ctx, front = q < 0.5;
  const sy = front ? lerp(1, 0.05, easeInOut(q / 0.5)) : lerp(0.05, 1, easeInOut((q - 0.5) / 0.5));
  c.save(); c.translate(0, cy); c.scale(1, sy); c.translate(0, -cy);
  (front ? drawA : drawB)(stage);
  c.restore();
  return {front, sy};
}
/** 뒤집기 동안의 키커: '옆에서 본 모습' / '위에서 본 모습' 중 지금 보이는 면. */
export const flipKicker = (q, fromSide = true) => ((q < 0.5) === fromSide ? '옆에서 본 모습' : '위에서 본 모습');

// =====================================================================================================
// 4.5 돌풍 — 한색, lit(gain 0.5). (x, y) = 닿는 자리(기수 밑). age = 돌풍이 올라오기 시작한 뒤의 초.
// 0.25초에 130 px 아래에서 올라와 닿고, 0.25~0.5초에 사라진다. angle = 나아가는 방향(화면, 기본 위로 70°).
// =====================================================================================================
export function gustPuff(stage, x, y, age, {angle = -70 * Math.PI / 180, dist = 130} = {}) {
  if (age <= 0 || age >= 0.5) return;
  const p = 1 - Math.pow(1 - clamp(age / 0.25), 2), a = smooth(age / 0.05) * (1 - smooth((age - 0.25) / 0.25));
  const d = [Math.cos(angle), Math.sin(angle)], n = [-d[1], d[0]];
  const head = [x - d[0] * dist * (1 - p), y - d[1] * dist * (1 - p)];
  klit(stage, c => {
    c.save(); c.globalAlpha *= a;
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * 22, lag = Math.abs(k - 2) * 9, L = 46 + (k === 2 ? 10 : 0);
      const tip = [head[0] + n[0] * off - d[0] * lag, head[1] + n[1] * off - d[1] * lag];
      line(c, [[tip[0] - d[0] * L, tip[1] - d[1] * L], tip], rgba(PAL.cool, 0.95), 7);
    }
    const hb = [head[0] + d[0] * 18, head[1] + d[1] * 18];
    poly(c, [[hb[0], hb[1]], [head[0] + n[0] * 12, head[1] + n[1] * 12], [head[0] - n[0] * 12, head[1] - n[1] * 12]], rgba(PAL.cool, 0.95));
    c.restore();
  }, {gain: 0.5});
}

// =====================================================================================================
// 4.7 각도기와 큰 숫자 — 축 둘레, 기수 쪽(왼쪽 위)의 호. 바늘 = 동체 축을 기수 너머로 이은 선.
// =====================================================================================================
const fmtDeg = d => { const v = Math.round(d); return v === 0 ? '0°' : v > 0 ? `+${v}°` : `−${-v}°`; };
export const degLabel = th => fmtDeg(th * R2D);
/**
 * o = {max (도, 기본 90), min (도, 기본 −10), needle (바늘 시작 px, 기본 R − 70), alpha, top (평면도 — 같은 그림)}
 * 돌려주는 값: 호의 바깥 끝 [x, y](큰 숫자 자리를 정할 때).
 */
export function protractor(stage, x, y, R, theta, o = {}) {
  const {max = 90, min = -10, alpha = 1} = o, c = stage.ctx, D = Math.PI / 180;
  const P = (phi, r) => [x - r * Math.cos(phi), y - r * Math.sin(phi)];
  withAlpha(c, alpha, () => {
    line(c, [[x, y], P(0, R + 26)], rgba(PAL.muted, 0.55), 2, {dash: [6, 7]});           // 0° = wind direction
    const arc = []; for (let d = min; d <= max + 0.01; d += 2) arc.push(P(d * D, R)); line(c, arc, rgba(PAL.muted, 0.5), 2);
    for (let d = 0; d <= max + 0.01; d += 30) {
      line(c, [P(d * D, R - 10), P(d * D, R + 10)], rgba(PAL.muted, 0.8), 2);
      const [lx, ly] = P(d * D, R + 34);
      if (d > 0) stage.text(`${d}°`, lx, ly, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    }
    const r0 = o.needle ?? R - 70;
    line(c, [P(theta, r0), P(theta, R + 14)], PAL.ink, 2);
    circle(c, ...P(theta, R), 4, PAL.ink);
  });
  return P(max * D, R + 34);
}
/** 큰 숫자 `기수 +10°`. warm = 꼬리날개 있는 모형(난색), 아니면 ink. align 'left'|'right'|'center'. */
export function bigAngle(stage, x, y, theta, {warm = false, size = 68, align = 'left', alpha = 1, prefix = '기수 '} = {}) {
  return stage.text(`${prefix}${degLabel(theta)}`, x, y, {role: 'display', weight: 700, size, color: warm ? PAL.warm : PAL.ink, align, alpha, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 14});
}

// =====================================================================================================
// 4.8 힘 화살표 — lit(gain 0.6), 굵기 9, 화살촉 22. len px(> 0 위, < 0 아래). 늘 화면 위/아래(바람에 수직).
// 길이 = 힘 × 100 px(날개 1 → 100, 꼬리 1/5 → 20). dashed: 빈 점선 화살표(사라진 힘, lit 아님).
// =====================================================================================================
export const FORCE_PX = 100;
export function forceArrow(stage, x, y, len, col, {dashed = false, alpha = 1, gain = 0.6, w = 9} = {}) {
  if (Math.abs(len) < 0.5 || alpha <= 0) return;
  const sg = Math.sign(len), L = Math.abs(len), head = Math.min(22, Math.max(10, L * 0.75)), hw = head * 0.62;
  const tip = [x, y - sg * L], back = [x, y - sg * (L - head)];
  const draw = c => {
    c.save(); c.globalAlpha *= alpha;
    if (L > head + 0.5) line(c, [[x, y], back], col, w, {cap: 'butt'});
    poly(c, [tip, [x - hw, back[1]], [x + hw, back[1]]], col);
    c.restore();
  };
  if (dashed) {
    const c = stage.ctx; c.save(); c.globalAlpha *= alpha;
    line(c, [[x, y], back], rgba(PAL.ink, 0.55), 3, {dash: [6, 6]});
    poly(c, [tip, [x - hw, back[1]], [x + hw, back[1]]], null, rgba(PAL.ink, 0.55), 2.5);
    c.restore(); return;
  }
  klit(stage, draw, {gain});
}

// =====================================================================================================
// 4.9 계기 바닥과 저울 — 비행기와 같은 가로 자. 받침 = 축의 x 바로 아래.
// =====================================================================================================
export function gaugeFloor(stage, y0 = 760, y1 = 1240) {
  const c = stage.ctx;
  c.fillStyle = rgba(PAL.deep, 0.86); c.fillRect(0, y0, W, y1 - y0);
  const g = c.createLinearGradient(0, y1, 0, y1 + 40); g.addColorStop(0, rgba(PAL.deep, 0.86)); g.addColorStop(1, rgba(PAL.deep, 0));
  c.fillStyle = g; c.fillRect(0, y1, W, 40);
  line(c, [[0, y0], [W, y0]], PAL.border, 2, {cap: 'butt'});
}
/**
 * 저울. o = {x (= 모형 축 x), y (막대 높이), s (모형 배율), theta (모형 각), my (모형 축 y), wing, tail (힘: 1, 0.2 …),
 *   tailOn (꼬리날개가 있는가), effects: [드는, 내리는] (|효과|, 막대 길이 × 90 px), show: {beam, links, arrows, brackets, bars} 0..1,
 *   maxTilt (막대가 기우는 최대 각, 라디안, 기본 12° — 큰 각에서 막대가 계기 자리를 벗어나지 않게. PLAN 은 '같은 θ'),
 *   barX (효과 막대 글 왼쪽 끝, 기본 80), barY (효과 막대 첫 줄 y, 기본 y + 185; 둘째 줄은 + 46)}
 * 꺾쇠는 막대와 나란히 54 px 아래(받침 삼각형 밑), 글은 그 밑 24 px.
 * 돌려주는 값: {wingPt, tailPt} 막대 위 두 자리(화면 px).
 */
export function leverGauge(stage, o) {
  const {x, y, s, theta = 0, my, wing = 0, tail = 0, tailOn = true, effects = null, show = {}, maxTilt = 12 * Math.PI / 180, barX = 80, barY = null} = o;
  const c = stage.ctx, sh = k => clamp(show[k] ?? 1), tilt = clamp(theta, -maxTilt, maxTilt);
  const B = u => [x + u * Math.cos(tilt), y + u * Math.sin(tilt)];     // point on the beam, u px from the fulcrum (+ = tail side)
  const wingPt = B(-XW * s), tailPt = B(LT * s);
  if (sh('beam') > 0) withAlpha(c, sh('beam'), () => {
    poly(c, [[x, y + 6], [x - 22, y + 44], [x + 22, y + 44]], PAL.dark, rgba(PAL.muted, 0.9), 2);   // fulcrum
    line(c, [B(-60), B(LT * s + 30)], PAL.muted, 8);
    circle(c, x, y, 7, PAL.ink);
    for (const p of [wingPt, tailPt]) circle(c, p[0], p[1], 6, PAL.ink);
  });
  if (my != null && sh('links') > 0) withAlpha(c, sh('links'), () => {
    const m = {x, y: my, s, theta};
    const wa = toScreen(m, ...SIDE_PTS.ac), ta = toScreen(m, ...SIDE_PTS.stab);
    line(c, [wa, wingPt], rgba(PAL.muted, 0.5), 2, {dash: [3, 7]});
    line(c, [ta, tailPt], rgba(PAL.muted, 0.5), 2, {dash: [3, 7]});
  });
  if (sh('arrows') > 0) {
    forceArrow(stage, wingPt[0], wingPt[1] - 10, wing * FORCE_PX, PAL.cool, {alpha: sh('arrows')});
    if (tailOn) forceArrow(stage, tailPt[0], tailPt[1] - 10, tail * FORCE_PX, PAL.warm, {alpha: sh('arrows')});
    else {
      forceArrow(stage, tailPt[0], tailPt[1] - 10, 0.2 * FORCE_PX, null, {dashed: true, alpha: sh('arrows')});
      stage.text('없음', tailPt[0] + 22, tailPt[1] - 30, {size: 26, weight: 500, color: PAL.muted, alpha: sh('arrows')});
    }
  }
  if (sh('brackets') > 0) withAlpha(c, sh('brackets'), () => {
    const nx = -Math.sin(tilt), ny = Math.cos(tilt), off = 54, Q = (p, k = 0) => [p[0] + nx * (off + k), p[1] + ny * (off + k)];
    const br = (pa, pb, lab, al) => {
      line(c, [Q(pa, -10), Q(pa), Q(pb), Q(pb, -10)], rgba(PAL.ink, 0.8), 2);
      const m = Q([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], 26);
      stage.text(lab, al === 'left' ? Q(pa, 26)[0] - 10 : m[0], al === 'left' ? Q(pa, 26)[1] : m[1], {size: 26, weight: 500, color: PAL.ink, align: al === 'left' ? 'right' : 'center'});
    };
    br(wingPt, [x, y], '거리 1', 'left');
    br([x, y], tailPt, '거리 20', 'center');
  });
  if (effects && sh('bars') > 0) withAlpha(c, sh('bars'), () => {
    const rows = [['기수를 드는 효과', effects[0], PAL.cool], ['기수를 내리는 효과', effects[1], PAL.warm]];
    rows.forEach(([lab, v, col], i) => {
      const yy = (barY ?? y + 185) + i * 46, x0 = barX + 236;
      stage.text(lab, barX, yy, {size: 26, weight: 500, color: PAL.muted});
      rect(c, x0, yy - 8, 360, 16, 8, rgba(PAL.border, 0.9));
      const L = Math.abs(v) * 90; if (L > 0.5) rect(c, x0, yy - 8, Math.max(16, L), 16, 8, col);
      stage.text(fmtNum(Math.abs(v)), x0 + Math.max(16, L) + 14, yy + 2, {role: 'display', weight: 700, size: 44, color: col});
    });
  });
  return {wingPt, tailPt};
}
const fmtNum = v => { const r = Math.round(v * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

// =====================================================================================================
// 4.10 렌즈 — 세계의 점 (wx, wy)를 mag 배로. drawWorld(stage) 는 같은 모형·연기 줄·화살표를 변환만 바꿔 다시 그린다.
// =====================================================================================================
export function lens(stage, {cx, cy, r, mag, wx, wy, alpha = 1, bg = PAL.bg}, drawWorld) {
  if (alpha <= 0) return;
  const c = stage.ctx;
  withAlpha(c, alpha, () => {
    // leader: lens edge → small circle at the world point
    const dx = wx - cx, dy = wy - cy, d = Math.hypot(dx, dy) || 1, sr = Math.max(16, r / mag);
    if (d > r + sr) line(c, [[cx + dx / d * r, cy + dy / d * r], [wx - dx / d * sr, wy - dy / d * sr]], rgba(PAL.muted, 0.8), 2);
    ring(c, wx, wy, sr, rgba(PAL.muted, 0.9), 2);
    circle(c, cx, cy + 10, r + 12, 'rgba(0,0,0,0.5)');
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
    c.fillStyle = bg; c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    c.translate(cx, cy); c.scale(mag, mag); c.translate(-wx, -wy);
    const prev = LENS_CLIP; LENS_CLIP = {x: wx, y: wy, r: r / mag};
    try { drawWorld(stage); } finally { LENS_CLIP = prev; c.restore(); }
    ring(c, cx, cy, r, PAL.muted, 4);
  });
}

// =====================================================================================================
// 4.11 기록선 — 기수 각도–모형 시간. series = [{fn: τ → θ(라디안), col, dash, upTo, from, alpha, dot}]
// 지금 τ(upTo) 까지만 그리고 끝에 점(lit gain 0.5, 반지름 6). 범위를 넘으면 위 테두리에서 잘리고 ▲ 와 지금 값.
// =====================================================================================================
export function traceGauge(stage, {x, y, w, h, t0 = 0, span = 2.5, yMin = -12, yMax = 32, ticks = [-10, 0, 10, 30], alpha = 1}, series = []) {
  const c = stage.ctx;
  const X = tt => x + w * (tt - t0) / span, Y = d => y + h - h * (clamp(d, yMin, yMax) - yMin) / (yMax - yMin);
  withAlpha(c, alpha, () => {
    line(c, [[x, y - 6], [x, y + h]], rgba(PAL.muted, 0.9), 2);
    line(c, [[x, Y(0)], [x + w, Y(0)]], rgba(PAL.muted, 0.6), 2, {dash: [5, 6]});
    line(c, [[x, y + h], [x + w, y + h]], rgba(PAL.muted, 0.35), 1.5);
    for (const d of ticks) { stage.text(fmtDeg(d), x - 10, Y(d), {size: 24, weight: 500, color: PAL.muted, align: 'right'}); line(c, [[x - 4, Y(d)], [x + 4, Y(d)]], rgba(PAL.muted, 0.9), 2); }
    for (let tt = t0; tt <= t0 + span + 1e-6; tt += 0.5) line(c, [[X(tt), y + h], [X(tt), y + h + 9]], rgba(PAL.muted, 0.8), 2);
    for (const S of series) {
      const from = S.from ?? t0, upTo = Math.min(S.upTo ?? t0 + span, t0 + span);
      if (upTo <= from) continue;
      const pts = [], N = Math.max(8, Math.ceil(200 * (upTo - from) / span));
      let over = null;
      for (let i = 0; i <= N; i++) {
        const tt = from + (upTo - from) * i / N, d = S.fn(tt) * R2D;
        if (d > yMax && over == null) over = tt;
        pts.push([X(tt), Y(d)]);
      }
      withAlpha(c, S.alpha ?? 1, () => line(c, pts, S.col, S.width ?? 4, {dash: S.dash}));
      const last = pts[pts.length - 1], dNow = S.fn(upTo) * R2D;
      if (S.dot !== false && !S.dash) klit(stage, cc => circle(cc, last[0], last[1], 6, S.col), {gain: 0.5});
      if (dNow > yMax) withAlpha(c, S.alpha ?? 1, () => {
        const xo = X(over);
        poly(c, [[xo, y - 22], [xo - 9, y - 8], [xo + 9, y - 8]], S.col);
        if (!S.dash) stage.text(fmtDeg(dNow), xo + 16, y - 16, {size: 26, weight: 700, color: S.col});
      });
    }
  });
  return {X, Y};
}

// =====================================================================================================
// 4.12 포스터·머리글·띠·끝 한 줄 (episodes/asphalt-concrete/scenes.mjs 를 본뜸, 값만 바꿈)
// =====================================================================================================
export const POSTER = {q: ['주날개의 4분의 1 크기인데,', '떼면 왜 뒤집힐까?'], a: ['꼬리날개'], qy: 628, ay: 835, QS: 62, AS: 180, band: 0.5};
/** q 0..1: 0 = 0초 포스터, 1 = 물음이 머리글(y 228)로 줄고 주제어는 사라짐. */
export function posterTitle(stage, q) {
  const c = stage.ctx, Q = POSTER.q, A = POSTER.a;
  const yTop = POSTER.qy - 100, yBot = POSTER.ay + POSTER.AS * 0.5 + 80;
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.2, `rgba(0,10,16,${POSTER.band})`); g.addColorStop(0.85, `rgba(0,10,16,${POSTER.band})`); g.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.9)';
  const s1 = lerp(POSTER.QS, 52, q), LH = POSTER.QS * 1.2 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) Q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else stage.text(Q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 940});
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => A.forEach((s, i) => stage.text(s, 540, lerp(POSTER.ay + i * POSTER.AS * 1.08, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa})));
}
/** 포스터가 머리글로 줄어드는 구간 [s01 끝 + 0.15, + 1.05]. tl = Timeline. */
export const MORPH = tl => [tl.sentence('s01').end + 0.15, tl.sentence('s01').end + 1.05];

export function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 900, ...so}));
}
/**
 * 머리글 목록 [[적용 시각, 키커, 제목], …] 을 t 에 맞춰 그린다. 바뀔 때 0.3초에 갈아 끼운다(키커가 같으면 키커는 그대로).
 * a = 전체 알파. 본보기 overlays 의 머리글 부분.
 */
export function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
}
export function captionBand(c) { const g = c.createLinearGradient(0, 1230, 0, 1920); g.addColorStop(0, 'rgba(0,8,12,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.5)'); g.addColorStop(1, 'rgba(0,8,12,0.7)'); c.fillStyle = g; c.fillRect(0, 1230, W, 690); }
export function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, 'rgba(0,8,12,0.72)'); g.addColorStop(0.7, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 320); }
/** 끝 한 줄(마지막 문장 동안, 읽지 않음). */
export function endLine(stage, a = 1, y = 880) { if (a > 0) stage.text('다음 원리도 이어서 — 과학쑛츠', 540, y, {size: 34, weight: 500, color: PAL.muted, align: 'center', alpha: a}); }
/** 결론 글(PLAN 5.8 s24): 세 줄 + 난색 짧은 줄. a = 알파. */
export const CONCLUSION = ['꼬리날개는 무게중심에서', '멀리 떨어진 작은 날개,', '작은 힘으로도 제자리로 되돌린다'];
export function conclusion(stage, a = 1, ys = [600, 680, 760]) {
  if (a <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    CONCLUSION.forEach((s, i) => stage.text(s, 540, ys[i], {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 940, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18}));
    line(c, [[480, ys[2] + 56], [600, ys[2] + 56]], PAL.warm, 4, {cap: 'butt'});
  });
}
export function background(stage) { const c = stage.ctx; c.fillStyle = PAL.bg; c.fillRect(0, 0, W, H); }
export {progressBar};
