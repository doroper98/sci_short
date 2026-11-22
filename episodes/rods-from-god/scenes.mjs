// 55 신의 지팡이 — 장면(무대·계기·빛). 사실·단순화는 brief.md, 시뮬레이션은 sim/ 과 simview.mjs.
// 영상미 문법(2026-11-10): 움직이는 것은 모두 인과 사슬의 한 고리. 물체(막대·바위·지구)는 면과 명암이 있는 무광 덩어리.
// 빛나는 것은 에너지뿐 — 공기에 달궈진 막대 앞끝과 뒤의 뜨거운 공기 줄, 충돌면의 열(시뮬레이션 온도), 땅 속으로 퍼지는 충격의 앞면,
// 막대가 땅에 닿을 때의 섬광. 모두 lit() 안. 계기·이름표·글자·바탕은 lit() 밖이고, 글이 빛 위에 얹히는 곳은 빛 지도를 지운다(unlitRect).
// 난색 하나 = 에너지(열·충돌·에너지 막대), 한색 하나 = 빠르기(속도 바늘·궤도·빠르기 화살).
// 무대 하나: 땅 단면(지층 띠 = 막대 길이의 1/4, 1.525 m). 깊이 자는 세계 안 왼쪽 눈금이고 계기의 깊이 축과 같은 자.
// 질감 층(2026-11-22): 테마 film, 바탕은 filmBackground, 맨 마지막에 filmLook(render.mjs). 밝은 곳은 무대 가운데.
// 첫 순간(2026-11-16): 0~2초에 막대가 땅을 파고드는 단면(시뮬레이션, '실제 0.01초를 2초로'), 카메라가 앞끝을 따라 내려간다.
//   2.2~3.0초 되감기, 그다음 충돌 직전의 막대가 아주 느리게 내려온다.
// Fable 검수(s10): 화면에서 '공기가 7.8 을 3.4 로 줄였다'를 계산처럼 보이지 않는다 — 3.4 는 '흔히 드는 값' 표식으로만.
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, rand, line, circle, ring, rect, poly, withAlpha, arrow, lit, ensureGain,
  progressBar, TAU,
} from '../../pipeline/render/index.mjs';
import {loadRun, frameAt, drawSim, simHot, simRect, holeOutline, remainingLen, simFrame, SIMPAL, REAL_L} from './simview.mjs';

export const theme = 'film';
export const look = {background: {cx: 0.5, cy: 0.5, r0: 0.08, r1: 0.80}};
export const events = [];
export const captionLayout = {};

const W = 1080, H = 1920;
export const PAL = {
  bg: '#1A1A1D', deep: '#0E0E10', ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#232327',
  warm: '#FF6B1A', warmHi: '#F5A066',     // 에너지(하나뿐인 난색)
  cool: '#5BA8F0', coolHi: '#A6CDF4',     // 빠르기(하나뿐인 한색)
  earth: '#3C4148', earthHi: '#5A6069', air: '#2C3B4A',
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
const fmt = (x, d = 0) => (+x.toFixed(d)).toLocaleString('en-US');
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const S = (ctx, id) => ctx.tl.sentence(id);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;
const ev = (ctx, id) => ctx.events.get(id);
const evT = (ctx, id) => (ctx.events.has(id) ? ctx.events.get(id).time : NaN);

// ---- 물리 값(brief.md 와 같음) ----
const RHO_W = 19.25, RHO_ROCK = 2.7, RATIO = RHO_W / RHO_ROCK;          // 7.13
const NEWTON = REAL_L * RATIO, HYDRO = REAL_L * Math.sqrt(RATIO);      // 43.5 m, 16.3 m
const BAND = REAL_L / 4;                                                 // 지층 띠 두께(시뮬레이션과 같음)

// =====================================================================================================
// 빛 지도 지우기(글이 빛 위에 얹히는 곳 — 47번 교훈)
// =====================================================================================================
function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save(); gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.fillStyle = '#000'; gc.fillRect(x, y, w, h); gc.restore();
}
function panel(c, x, y, w, h, a = 0.92) { rect(c, x, y, w, h, 14, rgba(PAL.plate, a), rgba(PAL.border, 1), 2); }

// =====================================================================================================
// 무대: 땅 단면(지층 띠), 깊이 자, 막대
// =====================================================================================================
const ROCK_A = SIMPAL.rockA, ROCK_B = SIMPAL.rockB;
/** 지층 띠. sy = 지표의 화면 y, ppm = 1 m 당 px. x0..x1, 아래로 yMax 까지. */
function rockSection(stage, {sy, ppm, x0 = 0, x1 = W, yMax = H, alpha = 1, bands = true}) {
  const c = stage.ctx, bp = BAND * ppm;
  if (!bands) { withAlpha(c, alpha, () => { const top = Math.max(sy, -10); c.fillStyle = mix(ROCK_A, ROCK_B, 0.5); c.fillRect(x0, top, x1 - x0, yMax - top); if (sy > -4 && sy < yMax) line(c, [[x0, sy], [x1, sy]], '#6E6760', 3); }); return; }
  withAlpha(c, alpha, () => {
    const top = Math.max(sy, -10);
    let k = Math.max(0, Math.floor((top - sy) / bp));
    for (let y = sy + k * bp; y < yMax; y += bp, k++) {
      const ya = Math.max(y, top), yb = Math.min(y + bp, yMax);
      if (yb > ya) { c.fillStyle = (k & 1) ? ROCK_B : ROCK_A; c.fillRect(x0, ya, x1 - x0, yb - ya + 0.5); }
    }
    // 지표 위의 얇은 흙 선(무광)
    if (sy > -4 && sy < yMax) line(c, [[x0, sy], [x1, sy]], '#6E6760', 3);
  });
}
/** 깊이 자(세계 안, 왼쪽). every m 마다 눈금, label m 마다 숫자. */
function depthRuler(stage, {sy, ppm, x = 96, max = 45, every = 5, label = 10, alpha = 1, top = 280, bottom = 1240}) {
  const c = stage.ctx;
  withAlpha(c, alpha, () => {
    const y0 = Math.max(top, sy), y1 = Math.min(bottom, sy + max * ppm);
    if (y1 <= y0) return;
    line(c, [[x, y0], [x, y1]], rgba(PAL.ink, 0.55), 2);
    for (let m = 0; m <= max + 1e-6; m += every) {
      const y = sy + m * ppm; if (y < top - 2 || y > bottom + 2) continue;
      const big = Math.abs(m / label - Math.round(m / label)) < 1e-6;
      line(c, [[x - (big ? 16 : 9), y], [x, y]], rgba(PAL.ink, 0.6), 2);
      if (big) stage.text(`${m} m`, x - 22, y, {size: 26, weight: 500, color: PAL.muted, align: 'right'});
    }
  });
}
/** 막대(무광 금속, 옆으로 명암, 앞끝이 조금 가늚). x = 축, tipY = 앞끝, len·wid = px. */
function drawRod(c, x, tipY, len, wid, {alpha = 1, dashed = false} = {}) {
  const nose = Math.min(wid * 1.5, len * 0.3), hw = wid / 2, top = tipY - len;
  const pts = [[x - hw, top], [x + hw, top], [x + hw, tipY - nose], [x + hw * 0.25, tipY], [x - hw * 0.25, tipY], [x - hw, tipY - nose]];
  withAlpha(c, alpha, () => {
    if (dashed) { poly(c, pts, null, rgba(PAL.ink, 0.7), 2); return; }
    const g = c.createLinearGradient(x - hw, 0, x + hw, 0);
    g.addColorStop(0, SIMPAL.rodHi); g.addColorStop(0.45, SIMPAL.rodMid); g.addColorStop(1, SIMPAL.rodLo);
    poly(c, pts, g, rgba('#2A2D31', 0.9), Math.max(1, wid * 0.06));
  });
}
/** 공기에 달궈진 앞끝과 뒤의 뜨거운 공기 줄(에너지 — lit). heat 0..1. 방향 (dx, dy) = 날아가는 쪽. */
function heatTrail(stage, x, y, {len = 220, heat = 1, dx = 0, dy = 1, w = 6, gain = 0.6} = {}) {
  if (heat <= 0.01) return;
  const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
  lit(stage, c => {
    const g = c.createLinearGradient(x, y, x - ux * len, y - uy * len);
    g.addColorStop(0, rgba(PAL.warm, 0.85 * heat)); g.addColorStop(1, rgba(PAL.warm, 0));
    line(c, [[x, y], [x - ux * len, y - uy * len]], g, w);
    const g2 = c.createLinearGradient(x, y, x - ux * len * 0.5, y - uy * len * 0.5);
    g2.addColorStop(0, rgba(CORE(PAL.warm), 0.9 * heat)); g2.addColorStop(1, rgba(CORE(PAL.warm), 0));
    line(c, [[x, y], [x - ux * len * 0.5, y - uy * len * 0.5]], g2, w * 0.4);
    circle(c, x, y, w * 0.9, rgba(PAL.warm, heat)); circle(c, x, y, w * 0.45, rgba(CORE(PAL.warm), heat));
  }, {gain});
}

// =====================================================================================================
// 계기
// =====================================================================================================
/** 가로 빠르기 계기: 0..vmax km/s. marks = [{v, label}] (흔히 드는 값 등). */
function speedGauge(stage, {x0 = 140, x1 = 900, y = 1180, v, vmax = 8, alpha = 1, marks = [], ghost = null, title = '빠르기 (km/s)'}) {
  const c = stage.ctx, X = q => lerp(x0, x1, clamp(q / vmax));
  withAlpha(c, alpha, () => {
    stage.text(title, x0, y - 52, {size: 26, weight: 500, color: PAL.muted});
    rect(c, x0, y - 9, x1 - x0, 18, 9, rgba(PAL.border, 0.95));
    for (let k = 0; k <= vmax; k += 2) { line(c, [[X(k), y + 14], [X(k), y + 24]], rgba(PAL.ink, 0.6), 2); stage.text(String(k), X(k), y + 44, {size: 24, weight: 500, color: PAL.muted, align: 'center'}); }
    for (const m of marks) {
      withAlpha(c, m.a ?? 1, () => { line(c, [[X(m.v), y - 24], [X(m.v), y + 12]], rgba(PAL.ink, 0.85), 3, {dash: [5, 4]}); stage.text(m.label, X(m.v), y - 40, {size: 24, weight: 500, color: PAL.ink, align: m.align || 'center'}); });
    }
    if (ghost != null) line(c, [[X(ghost), y - 14], [X(ghost), y + 14]], rgba(PAL.coolHi, 0.55), 4, {dash: [4, 4]});
    if (v > 0.001) rect(c, x0, y - 9, Math.max(18, X(v) - x0), 18, 9, PAL.cool);
    circle(c, X(v), y, 13, PAL.coolHi); circle(c, X(v), y, 6, PAL.cool);
  });
}

// =====================================================================================================
// 포스터(0초 프레임 = 썸네일): 흰 물음 위, 주제어가 가장 크게. 시리즈 아님.
// =====================================================================================================
const POSTER = {q: ['6미터 막대는 땅을', '얼마나 깊이 뚫을까?'], a: '신의 지팡이', qy: 262, ay: 470, QS: 64, AS: 150};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 100, yBot = POSTER.ay + POSTER.AS * 0.5 + 70;
  unlitRect(stage, 0, yTop, W, yBot - yTop, 1 - q);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.5)'); g.addColorStop(0.85, 'rgba(9,9,11,0.5)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 50, q), LH = POSTER.QS * 1.22 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 960});
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.ay, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa}));
}
const MORPH = tl => [tl.sentence('s01').end + 0.15, tl.sentence('s01').end + 1.05];

// =====================================================================================================
// 머리글
// =====================================================================================================
function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx;
  if (Math.max(kicker ? aK : 0, title ? aT : 0) > 0.01) unlitRect(stage, 0, 118, W, 146, 1);
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 900, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 940, ...so}));
}
function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
}
function titleList(id, ctx) {
  const a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, '실제 0.01초를 2초로 · 설명 모형'], [ctx.tl.at(0) + 2.15, '되감기'], [a('s02'), '충돌 직전 · 아주 느리게']];
    case 'origin': return [[-Infinity, '1950년대 · 보잉', '프로젝트 토르'], [a('s04'), '2003 · 미국 공군 계획서', '구상으로만 남았다'], [a('s05'), '흔히 예로 드는 크기', '길이 6.1 m, 지름 0.3 m'], [a('s06'), '녹는점 3,422 °C · 금속 가운데 가장 높다', '텅스텐 기둥, 8톤 넘게']];
    case 'energy': return [[-Infinity, '운동에너지 = ½ × 질량 × 속도²', '속도 두 배, 에너지 네 배'], [a('s08'), '1 kg 기준', 'TNT 1 kg과 같아지는 속도']];
    case 'fall': return [[-Infinity, '낮은 궤도 · 몇 분을 몇 초로', '1초에 7.8 km'], [a('s10'), '공기층 · 크기 과장', '달궈지고, 느려진다'], [a('s11'), '흔히 드는 제원', '초속 3.4 km · 마하 10'], [a('s12'), '½ × 8.6 t × (3.4 km/s)²', 'TNT 11톤 남짓']];
    case 'penetrate': return [[-Infinity, '실제 0.007초를 아주 느리게 · 설명 모형', '막대도 바위도 흐른다'], [a('s14'), '단면 · 설명 모형', '앞끝부터 닳아 없어진다']];
    case 'depth': return [[-Infinity, '뉴턴의 어림셈', '제 질량만큼의 바위 기둥'], [a('s16'), '텅스텐 19.3 ÷ 바위 2.7 ≈ 7', '40미터 안팎'], [a('s17'), '닳는 것까지 따진 모형', '16미터쯤, 답은 그 사이'], [a('s18'), '같은 속도 · 길이와 지름 두 배', '두 배 길면, 두 배 깊이'], [a('s19'), '정리', '길이와 밀도 비가 정한다']];
    case 'limits': return [[-Infinity, '에너지 · 로그 눈금', '원자폭탄의 천분의 1 아래'], [a('s21'), '궤도까지 올리기', '1 kg 의 운동에너지 약 1,000배'], [a('s22'), '1967 · 우주조약 제4조', '해석이 갈린다']];
    case 'close': return [[-Infinity, '정리', '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1230, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.25, 'rgba(8,8,10,0.55)'); g.addColorStop(1, 'rgba(8,8,10,0.75)'); c.fillStyle = g; c.fillRect(0, 1230, W, 690); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.42)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 320); }

// =====================================================================================================
// 시뮬레이션 실행
// =====================================================================================================
// A = 막대 6.1 m(시뮬레이션 40 mm × 2 mm), 3.4 km/s. 두 배 막대는 A 를 두 배로 키워 그린다 — 이 모형(강도에 길이 척도가 없는
// 탄소성 + 같은 격자 비율)에서는 모든 길이와 시간을 두 배로 한 것이 정확히 같은 계산이다(길이와 지름이 함께 두 배).
// 따로 돌린 실행 B(같은 막대, 6.8 km/s)와 C(길이만 두 배, 지름 그대로)는 화면에 쓰지 않는다 — brief.md '시뮬레이션 대조'.
const RUN = {A: loadRun('A')};
/** 실제 시각 tr 에서 A 를 k 배로 키운 막대의 단면(k = 1 이면 A 그대로). */
function simScaled(stage, tr, view, k = 1, o = {}) {
  const run = RUN.A; if (!run) return null;
  return simAt(stage, run, frameAt(run, tr / k), {...view, ppm: view.ppm * k}, o);
}
const depthScaled = (tr, k = 1) => (RUN.A ? RUN.A.realDepth[frameAt(RUN.A, tr / k)] * k : 0);
/** 단면 + 뜨거운 곳(lit). 실행이 없으면 아무것도 그리지 않는다. */
function simAt(stage, run, fi, view, {hotGain = 0.7, alpha = 1, clipY = 1240, bands = true} = {}) {
  if (!run) return null;
  const c0 = stage.ctx;
  c0.save(); c0.beginPath(); c0.rect(0, 0, W, clipY); c0.clip();
  const f = drawSim(c0, run, fi, {...view, alpha, bands});
  c0.restore();
  if (hotGain > 0) lit(stage, c => { c.save(); c.beginPath(); c.rect(0, 0, W, clipY); c.clip(); simHot(c, stage, run, fi, {...view, alpha, bands}); c.restore(); }, {gain: hotGain});
  return f;
}
/** 지층 띠(시뮬레이션 밖) + 단면. */
function sectionWithSim(stage, run, fi, view, o = {}) {
  rockSection(stage, {sy: view.sy, ppm: view.ppm, yMax: o.yMax ?? H, x0: o.x0 ?? 0, x1: o.x1 ?? W});
  if (!run) return null;
  // 시뮬레이션 영역의 바위를 덮기 전에 그 사각형의 띠를 지워 두지 않는다 — 단면 그림이 같은 색 띠라 이어진다
  return simAt(stage, run, fi, view, o);
}
/** 구멍 윤곽 점선(잔상). */
function holeGhost(stage, run, fi, {ax, sy, ppm, alpha = 0.6, col = PAL.ink}) {
  if (!run || alpha <= 0) return;
  const P = holeOutline(run, fi); if (P.length < 3) return;
  const R = P.map(([r, d]) => [ax + r * ppm, sy + d * ppm]), L = P.map(([r, d]) => [ax - r * ppm, sy + d * ppm]).reverse();
  line(stage.ctx, [...L, ...R], rgba(col, alpha), 2.5, {dash: [8, 7]});
}

// =====================================================================================================
// 장면
// =====================================================================================================
// hook: 0~2초 결과 먼저(앞끝을 따라 내려가는 단면) → 2.2~3.0 되감기 → 위로 물러났다가 아주 느리게 내려옴
const HK = {ppm: 80, sy0: 900, follow: 330, slow: 0.005};     // 실제 0.01초 = 화면 2초
function hookCam(run, fi) {
  if (!run) return 0;
  const dpx = run.realDepth[fi] * HK.ppm;
  return Math.max(0, dpx - HK.follow);
}
function hookState(t, run) {
  // 화면 시각 → 시뮬레이션 실제 시각
  if (!run) return {fi: 0, cam: 0, lift: 0};
  const tEnd = 2.0 * HK.slow;
  let tr;
  if (t <= 2.0) tr = t * HK.slow;
  else if (t <= 2.2) tr = tEnd;
  else if (t <= 3.0) tr = tEnd * (1 - easeInOut((t - 2.2) / 0.8));
  else tr = 0;
  const fi = frameAt(run, tr);
  return {fi, cam: hookCam(run, fi), tr};
}

export const scenes = {
  hook(stage, t, p, ctx) {
    const c = stage.ctx, run = RUN.A, {fi, cam} = hookState(t, run), ax = 540;
    // 충돌 전(3초 뒤): 막대가 위로 물러났다가(되감기의 이어짐) 아주 느리게 내려온다
    const sEnd = ctx.scene.end, up = 420;
    let lift = 0;
    if (t > 3.0) { const q1 = easeOut((t - 3.0) / 0.7); lift = up * q1; if (t > 3.7) lift = lerp(up, 30, clamp((t - 3.7) / Math.max(1, sEnd - 3.7))); }
    const sy = HK.sy0 - cam, view = {ax, sy, ppm: HK.ppm};
    rockSection(stage, {sy, ppm: HK.ppm});
    // 충격의 앞면(땅 속으로 퍼지는 에너지, P파 5.8 km/s 를 같은 배율로): 0~0.6초
    if (t < 0.65 && run) {
      const rr = 5800 * t * HK.slow * HK.ppm, a = 1 - smooth(t / 0.65);
      c.save(); c.beginPath(); c.rect(0, sy, W, H - sy); c.clip();
      const g = c.createRadialGradient(ax, sy, Math.max(1, rr * 0.55), ax, sy, rr);
      g.addColorStop(0, rgba(PAL.warm, 0)); g.addColorStop(0.85, rgba(PAL.warm, 0.16 * a)); g.addColorStop(1, rgba(PAL.warm, 0));
      c.fillStyle = g; c.beginPath(); c.arc(ax, sy, rr, 0, Math.PI); c.fill();
      c.restore();
      lit(stage, g2 => { g2.save(); g2.beginPath(); g2.rect(0, sy, W, H - sy); g2.clip(); ring(g2, ax, sy, rr, rgba(PAL.warm, 0.7 * a), 4, 0, Math.PI); ring(g2, ax, sy, rr, rgba(CORE(PAL.warm), 0.7 * a), 1.6, 0, Math.PI); g2.restore(); }, {gain: 0.5});
    }
    if (run && t <= 3.0) simAt(stage, run, fi, view, {hotGain: 0.75, clipY: H});
    else if (run) {
      // 충돌 전: 땅은 처음 모습, 막대는 따로(같은 크기)
      simAt(stage, run, 0, view, {hotGain: 0, clipY: H});
    }
    // 2초의 구멍을 점선 잔상으로(되감은 뒤)
    if (run && t > 2.4) holeGhost(stage, run, frameAt(run, 2.0 * HK.slow), {...view, alpha: 0.55 * fadeIn(t, 2.4, 0.5)});
    // 충돌 전의 막대(아주 느리게) + 공기에 달궈진 앞끝
    if (t > 3.0) {
      // 시뮬레이션의 0번 프레임 막대를 지우고 위로 올린 막대를 그린다
      const rodPx = REAL_L * HK.ppm, wid = 0.3 * HK.ppm, tip = sy - lift - 2;
      // 0번 프레임 막대 자리를 바탕으로 덮는다(바위 위의 하늘)
      c.save(); c.beginPath(); c.rect(ax - wid, 0, wid * 2, sy - 1); c.clip(); stage.ctx.drawImage(bgCanvas(stage), 0, 0); c.restore();
      heatTrail(stage, ax, tip - rodPx, {len: 260, heat: 0.7, dx: 0, dy: 1, w: 8, gain: 0.5});
      drawRod(c, ax, tip, rodPx, wid);
      heatTrail(stage, ax, tip, {len: 0, heat: 0.9, w: 9, gain: 0.7});
      // 빠르기 화살(한색) — 아래로
      withAlpha(c, fadeIn(t, 3.4), () => { arrow(c, [ax + 70, tip - rodPx * 0.6], [ax + 70, tip - rodPx * 0.6 + 160], PAL.cool, 6); stage.text('초속 3.4 km', ax + 96, tip - rodPx * 0.6 + 70, {size: 30, weight: 700, color: PAL.coolHi, ...so}); });
    }
    depthRuler(stage, {sy, ppm: HK.ppm, max: 30, every: 1, label: 5, top: 300, alpha: fadeIn(t, 0.2, 0.3)});
    // 시간 배율(0초 프레임에는 없음 — 0.3초부터 결과 먼저 구간 동안)
    const ka = fadeIn(t, 0.3, 0.3) * fadeOut(t, 2.2, 0.3);
    if (ka > 0) { unlitRect(stage, 200, 575, 680, 50, ka); stage.text('실제 0.01초를 2초로 · 설명 모형', 540, 600, {size: 30, weight: 500, color: PAL.ink, align: 'center', alpha: ka, ...so}); }
  },

  origin(stage, t, p, ctx) {
    const c = stage.ctx, gy = 1150, ppm = 105, ax = 430, rodPx = REAL_L * ppm, wid = 0.3 * ppm;
    const s3 = S(ctx, 's03'), s4 = S(ctx, 's04'), s5 = S(ctx, 's05'), s6 = S(ctx, 's06');
    // 땅(무광) + 사람(1.7 m, 크기 비교)
    rect(c, 0, gy, W, 90, 0, '#3A3631'); line(c, [[0, gy], [W, gy]], '#6E6760', 3);
    // 연표(위쪽 가는 줄): 1950 → 2030
    const ty = 330, X = yr => lerp(150, 900, (yr - 1950) / 80);
    const now = t < s4.start - 0.3 ? lerp(1950, 1958, clamp((t - ctx.scene.start) / Math.max(1, s4.start - 0.3 - ctx.scene.start)))
      : t < s5.start ? lerp(1958, 2003, easeInOut((t - s4.start + 0.3) / 1.6)) : lerp(2003, 2026, easeInOut((t - s5.start) / 2.5));
    withAlpha(c, 1 - smooth((t - s6.end + 0.2) / 0.5) * 0, () => {
      line(c, [[X(1950), ty], [X(2030), ty]], rgba(PAL.ink, 0.45), 2);
      for (const yr of [1950, 1970, 1990, 2010, 2030]) { line(c, [[X(yr), ty - 8], [X(yr), ty + 8]], rgba(PAL.ink, 0.5), 2); stage.text(String(yr), X(yr), ty + 34, {size: 24, weight: 500, color: PAL.muted, align: 'center'}); }
      rect(c, X(1950), ty - 4, X(now) - X(1950), 8, 4, rgba(PAL.cool, 0.7));
      circle(c, X(now), ty, 10, PAL.coolHi);
      if (t > s3.start + 1.0) { circle(c, X(1955), ty, 7, PAL.ink); stage.text('구상', X(1955), ty - 30, {size: 24, weight: 500, color: PAL.ink, align: 'center'}); }
      if (t > W0(ctx, 's04', '계획서') - 0.2) { circle(c, X(2003), ty, 7, PAL.ink); stage.text('계획서 한 줄', X(2003), ty - 30, {size: 24, weight: 500, color: PAL.ink, align: 'center'}); }
    });
    // 막대: 구상(점선, 그려 나감) → s05 부터 채워진 무광 기둥
    const tipY = gy, topY = gy - rodPx;
    const solid = fadeIn(t, s5.start - 0.2, 0.8);
    if (solid < 1) {
      const q = clamp((t - ctx.scene.start - 0.3) / 3.0), per = 2 * (rodPx + wid), len = per * q;
      c.save(); c.setLineDash([10, 8]); c.lineDashOffset = -t * 18;
      c.beginPath(); c.moveTo(ax - wid / 2, gy); c.lineTo(ax - wid / 2, topY); c.lineTo(ax + wid / 2, topY); c.lineTo(ax + wid / 2, gy); c.closePath();
      c.strokeStyle = rgba(PAL.ink, 0.75 * (1 - solid) * smooth(q * 3)); c.lineWidth = 3; c.stroke(); c.restore();
    }
    if (solid > 0) {
      // s06: 안이 아래에서 위로 채워진다(무게) — 채워진 높이만큼 저울 막대가 오른다
      const fillQ = t < s6.start ? 1 : clamp((t - W0(ctx, 's06', '철') + 0.3) / 2.2);
      withAlpha(c, solid, () => {
        drawRod(c, ax, tipY, rodPx, wid, {alpha: t < s6.start ? 1 : 0.35});
        if (t >= s6.start) { c.save(); c.beginPath(); c.rect(ax - wid, gy - rodPx * fillQ, wid * 2, rodPx * fillQ); c.clip(); drawRod(c, ax, tipY, rodPx, wid); c.restore(); }
      });
      // 치수선
      withAlpha(c, fadeIn(t, W0(ctx, 's05', '육미터') - 0.2, 0.5), () => {
        const dxl = ax - wid / 2 - 46;
        line(c, [[dxl, topY], [dxl, gy]], rgba(PAL.ink, 0.8), 2); line(c, [[dxl - 10, topY], [dxl + 10, topY]], rgba(PAL.ink, 0.8), 2); line(c, [[dxl - 10, gy], [dxl + 10, gy]], rgba(PAL.ink, 0.8), 2);
        stage.text('6.1 m', dxl - 16, (topY + gy) / 2, {role: 'display', size: 44, weight: 700, color: PAL.ink, align: 'right', ...so});
      });
      withAlpha(c, fadeIn(t, W0(ctx, 's05', '지름') - 0.1, 0.5), () => {
        const yy = topY - 34;
        line(c, [[ax - wid / 2, yy], [ax + wid / 2, yy]], rgba(PAL.ink, 0.8), 2); line(c, [[ax - wid / 2, yy - 9], [ax - wid / 2, yy + 9]], rgba(PAL.ink, 0.8), 2); line(c, [[ax + wid / 2, yy - 9], [ax + wid / 2, yy + 9]], rgba(PAL.ink, 0.8), 2);
        stage.text('0.3 m', ax + wid / 2 + 18, yy, {size: 30, weight: 700, color: PAL.ink, ...so});
      });
    }
    // 사람(크기 비교, 무광 실루엣)
    const px0 = 650, ph = 1.7 * ppm;
    withAlpha(c, 0.9, () => {
      circle(c, px0, gy - ph + 13, 13, '#7D7A74');
      poly(c, [[px0 - 17, gy - ph + 30], [px0 + 17, gy - ph + 30], [px0 + 14, gy - ph * 0.48], [px0 + 9, gy], [px0 - 9, gy], [px0 - 14, gy - ph * 0.48]], '#6E6B66');
      stage.text('사람 1.7 m', px0, gy - ph - 30, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
    });
    // s06: 무게 저울(같은 크기의 철과 견줌)
    const wq = fadeIn(t, s6.start - 0.2, 0.5);
    if (wq > 0) withAlpha(c, wq, () => {
      const bx0 = 610, bx1 = 920, by = 700, Xm = m => lerp(bx0, bx1, m / 10);
      panel(c, 580, 560, 370, 330);
      stage.text('같은 크기의 무게', 600, 600, {size: 26, weight: 500, color: PAL.muted});
      const fillQ = clamp((t - W0(ctx, 's06', '철') + 0.3) / 2.2), mW = 8.6 * fillQ;
      stage.text('철', 600, by - 30, {size: 26, weight: 500, color: PAL.muted});
      rect(c, bx0, by, bx1 - bx0, 26, 8, rgba(PAL.border, 0.9)); rect(c, bx0, by, Xm(3.5) - bx0, 26, 8, '#7A7F86');
      stage.text('3.5 t', Xm(3.5) + 10, by + 13, {size: 26, weight: 700, color: PAL.ink});
      stage.text('텅스텐', 600, by + 70, {size: 26, weight: 500, color: PAL.muted});
      rect(c, bx0, by + 100, bx1 - bx0, 26, 8, rgba(PAL.border, 0.9)); if (mW > 0.05) rect(c, bx0, by + 100, Xm(mW) - bx0, 26, 8, SIMPAL.rodHi);
      stage.text(`${fmt(mW, 1)} t`, 765, by + 165, {role: 'display', size: 58, weight: 700, color: PAL.ink, align: 'center'});
    });
  },

  energy(stage, t, p, ctx) {
    const c = stage.ctx, s7 = S(ctx, 's07'), s8 = S(ctx, 's08');
    const vAt = tt => energySpeed(tt, ctx);
    // 속도(조절 변수): s07 에서 0 → 1 → 2 km/s, s08 에서 2 → 3 km/s
    const t1 = W0(ctx, 's07', '속도가', 0), tq = evT(ctx, 'tnt');
    const v = vAt(t);
    // 그래프: 가로 속도 0..8 km/s, 세로 1 kg 의 운동에너지 MJ 0..32
    const gx0 = 150, gx1 = 900, gy0 = 1150, gy1 = 620, X = q => lerp(gx0, gx1, q / 4), Y = e => lerp(gy0, gy1, e / 8);
    panel(c, 70, 500, 940, 730, 0.75);
    line(c, [[gx0, gy0], [gx1, gy0]], rgba(PAL.ink, 0.6), 2); line(c, [[gx0, gy0], [gx0, gy1]], rgba(PAL.ink, 0.6), 2);
    for (let k = 0; k <= 4; k += 1) { line(c, [[X(k), gy0], [X(k), gy0 + 10]], rgba(PAL.ink, 0.6), 2); stage.text(String(k), X(k), gy0 + 34, {size: 24, weight: 500, color: PAL.muted, align: 'center'}); }
    stage.text('속도 (km/s)', gx1, gy0 + 66, {size: 24, weight: 500, color: PAL.muted, align: 'right'});
    for (const e of [0, 2, 4, 6, 8]) { line(c, [[gx0 - 10, Y(e)], [gx0, Y(e)]], rgba(PAL.ink, 0.6), 2); stage.text(String(e), gx0 - 18, Y(e), {size: 24, weight: 500, color: PAL.muted, align: 'right'}); }
    stage.text('1 kg 의 운동에너지 (MJ)', gx0, gy1 - 50, {size: 24, weight: 500, color: PAL.muted});
    // TNT 1 kg = 4.184 MJ
    const tq2 = fadeIn(t, s8.start - 0.2, 0.5);
    withAlpha(c, tq2, () => { line(c, [[gx0, Y(4.184)], [gx1, Y(4.184)]], rgba(PAL.ink, 0.7), 2, {dash: [8, 6]}); stage.text('TNT 1 kg', gx1, Y(4.184) - 22, {size: 26, weight: 700, color: PAL.ink, align: 'right'}); });
    // 곡선 E = v²/2 (MJ/kg, v km/s) — 지나온 곳까지
    const pts = []; for (let q = 0; q <= v + 1e-6; q += 0.025) pts.push([X(q), Y(q * q / 2)]);
    line(c, pts, PAL.warm, 5);
    // 잔상: 1 km/s 와 2 km/s 자리
    if (t > t1 - 0.2) { line(c, [[X(1), Y(0.5)], [X(1), gy0]], rgba(PAL.ink, 0.5), 2, {dash: [5, 5]}); circle(c, X(1), Y(0.5), 8, rgba(PAL.warmHi, 0.6)); }
    if (t > t1 + 1.6) {
      line(c, [[X(2), Y(2)], [X(2), gy0]], rgba(PAL.ink, 0.5), 2, {dash: [5, 5]}); circle(c, X(2), Y(2), 8, rgba(PAL.warmHi, 0.6));
      withAlpha(c, fadeIn(t, t1 + 1.6, 0.4) * fadeOut(t, s8.start + 0.5), () => stage.text('×4', X(2) + 40, Y(2) + 50, {role: 'display', size: 64, weight: 700, color: PAL.warm, ...so}));
    }
    // 지금의 점(에너지 — 빛은 아님: 계기의 값)
    circle(c, X(v), Y(v * v / 2), 13, PAL.warmHi); circle(c, X(v), Y(v * v / 2), 6, PAL.warm);
    if (!Number.isNaN(tq) && t > tq) withAlpha(c, fadeIn(t, tq, 0.3), () => { ring(c, X(2.893), Y(4.184), 18, PAL.ink, 3); line(c, [[X(2.893), Y(4.184) + 18], [X(2.893), gy0]], rgba(PAL.ink, 0.7), 2, {dash: [5, 5]}); stage.text('2.9', X(2.893), gy0 - 30, {role: 'display', size: 44, weight: 700, color: PAL.ink, align: 'center', ...so}); });
    // 위: 같은 막대가 그 속도로 날아간다(한색 빠르기 줄)
    // 날아가는 막대의 위치 = 속도의 적분(같은 시계) — 오른쪽으로만 간다
    let dist = 0; for (let tt = ctx.scene.start; tt < t; tt += 1 / 30) dist += 140 * vAt(tt) / 30;
    const ry = 420, span = 1300, xx = (dist % span) - 110 + 230, len = 230;
    c.save(); c.beginPath(); c.rect(70, 340, 940, 150); c.clip();
    for (let k = 0; k < 4; k++) line(c, [[xx - len - 30 - k * 46, ry - 16 + k * 10], [xx - len - 30 - k * 46 - 40 * v, ry - 16 + k * 10]], rgba(PAL.cool, 0.6), 3);
    // 옆으로 누운 막대
    const g = c.createLinearGradient(0, ry - 12, 0, ry + 12); g.addColorStop(0, SIMPAL.rodHi); g.addColorStop(0.5, SIMPAL.rodMid); g.addColorStop(1, SIMPAL.rodLo);
    poly(c, [[xx - len, ry - 12], [xx - 18, ry - 12], [xx, ry - 3], [xx, ry + 3], [xx - 18, ry + 12], [xx - len, ry + 12]], g, rgba('#2A2D31', 0.9), 1.5);
    c.restore();
    stage.text(`${fmt(v, 1)} km/s`, X(v), Y(v * v / 2) - 46, {role: 'display', size: 40, weight: 700, color: PAL.coolHi, align: v > 3.3 ? 'right' : 'center', ...so});
  },

  fall(stage, t, p, ctx) {
    const c = stage.ctx, s9 = S(ctx, 's09'), s10 = S(ctx, 's10'), s11 = S(ctx, 's11'), s12 = S(ctx, 's12');
    // 지구(무광 원) + 공기층(두께 과장) + 낮은 궤도(높이 과장)
    const ex = 540, ey = 1880, R = 930, airT = 90, orbR = R + 260;
    const gE = c.createLinearGradient(0, ey - R, 0, ey - R + 320); gE.addColorStop(0, PAL.earthHi); gE.addColorStop(1, PAL.earth);
    c.fillStyle = gE; c.beginPath(); c.arc(ex, ey, R, 0, TAU); c.fill();
    const gA = c.createRadialGradient(ex, ey, R, ex, ey, R + airT); gA.addColorStop(0, rgba('#4A6A86', 0.55)); gA.addColorStop(1, rgba('#4A6A86', 0));
    c.fillStyle = gA; c.beginPath(); c.arc(ex, ey, R + airT, Math.PI, TAU); c.fill();
    line(c, Array.from({length: 121}, (_, i) => { const a = Math.PI * (1.0 + i / 120); return [ex + orbR * Math.cos(a), ey + orbR * Math.sin(a)]; }), rgba(PAL.cool, 0.55), 2, {dash: [10, 8]});
    stage.text('낮은 궤도 (높이 과장)', 70, 560, {size: 26, weight: 500, color: PAL.muted});
    stage.text('공기층 (두께 과장)', 1010, 820, {size: 26, weight: 500, color: PAL.muted, align: 'right'});
    // 막대의 길: s09 궤도를 돈다 → s10 공기층으로 내려가 달궈지고 느려짐 → s12 처음에 땅에 닿음
    const tD = s10.start - 0.2, tHit = s12.start + 0.3;
    const pos = tt => {
      if (tt < tD) { const ang = Math.PI * (1.37 + 0.07 * clamp((tt - ctx.scene.start) / Math.max(1, tD - ctx.scene.start))); return {ang, rad: orbR}; }
      const q = clamp((tt - tD) / (tHit - tD));
      return {ang: Math.PI * (1.44 + 0.06 * q), rad: lerp(orbR, R, easeInOut(q)), q};
    };
    const P = pos(t), P0 = pos(t - 0.06);
    const x = ex + P.rad * Math.cos(P.ang), y = ey + P.rad * Math.sin(P.ang);
    const x0 = ex + P0.rad * Math.cos(P0.ang), y0 = ey + P0.rad * Math.sin(P0.ang);
    const n = Math.hypot(x - x0, y - y0) || 1, ux = (x - x0) / n, uy = (y - y0) / n;
    const inAir = clamp((R + airT - P.rad) / airT);
    let heat = t < tD ? 0 : smooth(inAir * 1.6) * (1 - 0.3 * smooth(((P.q ?? 0) - 0.85) / 0.15));
    const v = t < tD ? 7.8 : t < tHit ? lerp(7.8, 3.4, smooth(inAir)) : 3.4;    // 화면: 공기층에서 줄어 흔히 드는 값에 머문다(계산이 아님 — brief.md Fable 검수)
    if (t < tHit) {
      heatTrail(stage, x, y, {len: 40 + 200 * heat, heat, dx: ux, dy: uy, w: 7, gain: 0.6});
      const L = 90, wd = 12;
      c.save(); c.translate(x, y); c.rotate(Math.atan2(uy, ux));
      const g = c.createLinearGradient(0, -wd / 2, 0, wd / 2); g.addColorStop(0, SIMPAL.rodHi); g.addColorStop(1, SIMPAL.rodLo);
      poly(c, [[-L, -wd / 2], [-10, -wd / 2], [0, 0], [-10, wd / 2], [-L, wd / 2]], g, rgba('#2A2D31', 0.9), 1.5);
      c.restore();
      if (heat > 0.05) lit(stage, g2 => { circle(g2, x, y, 9, rgba(PAL.warm, heat)); circle(g2, x, y, 4.5, rgba(CORE(PAL.warm), heat)); }, {gain: 0.7});
    } else {
      const a = 1 - clamp((t - tHit) / 0.8);
      if (a > 0) lit(stage, g2 => { ring(g2, x, y, 10 + 90 * (1 - a), rgba(PAL.warm, 0.8 * a), 5); circle(g2, x, y, 10 * a + 4, rgba(CORE(PAL.warm), a)); }, {gain: 0.8});
      circle(c, x, y + 4, 8, '#2A2620');
    }
    // 빠르기 계기(같은 시계) — 3.4 표식은 s11 '초속' 에서
    const mA = fadeIn(t, W0(ctx, 's11', '초속') - 0.2, 0.4);
    speedGauge(stage, {v, y: 1180, ghost: t > tD + 0.5 ? 7.8 : null, marks: [{v: 7.8, label: '궤도 7.8', a: 1}, {v: 3.4, label: '흔히 드는 값 3.4', a: mA}]});
    // s12: 에너지 = TNT 11톤 남짓(큰 숫자)
    const eA = fadeIn(t, W0(ctx, 's12', '에너지') - 0.1, 0.5);
    if (eA > 0) withAlpha(c, eA, () => {
      panel(c, 250, 380, 580, 170);
      stage.text('TNT 11톤 남짓', 540, 445, {role: 'display', size: 64, weight: 700, color: PAL.warm, align: 'center'});
      stage.text('운동에너지 약 48 GJ', 540, 510, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
      unlitRect(stage, 250, 380, 580, 170, eA);
    });
  },

  penetrate(stage, t, p, ctx) {
    const c = stage.ctx, run = RUN.A, s13 = S(ctx, 's13'), s14 = S(ctx, 's14');
    // 한 번의 충돌을 장면 전체에 펼친다(실제 0~7.5 ms) — s13: 맞닿는 면, s14: 닳아 가는 막대와 되흐름
    const t0 = s13.start - 0.3, t1 = s14.end - 0.4, tr = 0.0075 * smooth01((t - t0) / (t1 - t0));
    const ppm = 70, ax = 400, fi = run ? frameAt(run, tr) : 0;
    const dpx = run ? run.realDepth[fi] * ppm : 0, cam = Math.max(0, dpx - 380), sy = 760 - cam, view = {ax, sy, ppm};
    rockSection(stage, {sy, ppm});
    const f = sectionWithSim(stage, run, fi, view, {hotGain: 0.7, clipY: H});
    if (!run) return;
    depthRuler(stage, {sy, ppm, x: 96, max: 30, every: 1, label: 5, top: 300});
    const noseY = sy + run.realDepth[fi] * ppm;
    // 이름표(사슬의 고리)
    withAlpha(c, fadeIn(t, W0(ctx, 's13', '막대도') - 0.2) * fadeOut(t, s14.start), () => {
      line(c, [[ax + 18, noseY - 6], [ax + 120, noseY - 60]], rgba(PAL.ink, 0.8), 2);
      stage.text('맞닿는 면', ax + 128, noseY - 66, {size: 28, weight: 700, color: PAL.ink, ...so});
    });
    withAlpha(c, fadeIn(t, W0(ctx, 's14', '뭉개지고') - 0.2), () => {
      line(c, [[ax + 14, noseY - 4], [ax + 120, noseY + 50]], rgba(PAL.ink, 0.8), 2);
      stage.text('뭉개진 앞끝', ax + 128, noseY + 56, {size: 28, weight: 700, color: PAL.ink, ...so});
    });
    withAlpha(c, fadeIn(t, W0(ctx, 's14', '구멍') - 0.2), () => {
      const yy = Math.max(380, (sy + noseY) / 2);
      line(c, [[ax - 20, yy], [ax - 150, yy - 70]], rgba(PAL.ink, 0.8), 2);
      stage.text('벽을 타고', ax - 158, yy - 100, {size: 28, weight: 700, color: PAL.ink, align: 'right', ...so});
      stage.text('되흐르는 막대', ax - 158, yy - 66, {size: 28, weight: 700, color: PAL.ink, align: 'right', ...so});
    });
    // 계기: 맞닿는 면의 압력(로그 눈금) 대 강도 / 남은 막대 길이
    const gx = 660, gw = 270;
    panel(c, gx - 20, 470, gw + 40, 720);
    unlitRect(stage, gx - 20, 470, gw + 40, 720, 1);
    stage.text('맞닿는 면의 압력', gx, 510, {size: 26, weight: 500, color: PAL.muted});
    const Lg = pa => clamp((Math.log10(pa) - 7) / 4);       // 10 MPa .. 100 GPa
    const by0 = 560, by1 = 880, Yb = q => lerp(by1, by0, q), bx = gx + 30;
    rect(c, bx, by0, 40, by1 - by0, 8, rgba(PAL.border, 0.95));
    const pN = f?.pNose || 0, pq = pN > 0 ? Lg(pN) : 0;
    if (pq > 0) rect(c, bx, Yb(pq), 40, by1 - Yb(pq), 8, PAL.warm);
    for (const [pa, lab] of [[1e8, '0.1 GPa'], [1e9, '1 GPa'], [1e10, '10 GPa']]) { line(c, [[bx - 8, Yb(Lg(pa))], [bx, Yb(Lg(pa))]], rgba(PAL.ink, 0.6), 2); stage.text(lab, bx - 12, Yb(Lg(pa)), {size: 24, weight: 500, color: PAL.muted, align: 'right'}); }
    for (const [pa, lab] of [[2e8, '바위 강도'], [1.5e9, '텅스텐 강도']]) { line(c, [[bx - 4, Yb(Lg(pa))], [bx + 56, Yb(Lg(pa))]], rgba(PAL.ink, 0.9), 3, {dash: [5, 4]}); stage.text(lab, bx + 64, Yb(Lg(pa)), {size: 24, weight: 700, color: PAL.ink}); }
    stage.text('남은 막대', gx, 950, {size: 26, weight: 500, color: PAL.muted});
    const rem = remainingLen(run, fi);
    rect(c, gx, 990, gw, 26, 8, rgba(PAL.border, 0.95)); if (rem > 0.02) rect(c, gx, 990, gw * rem / REAL_L, 26, 8, SIMPAL.rodHi);
    stage.text(`${fmt(rem, 1)} m`, gx + gw / 2, 1080, {role: 'display', size: 58, weight: 700, color: PAL.ink, align: 'center'});
  },

  depth(stage, t, p, ctx) {
    const c = stage.ctx, s15 = S(ctx, 's15'), s16 = S(ctx, 's16'), s17 = S(ctx, 's17'), s18 = S(ctx, 's18'), s19 = S(ctx, 's19');
    const sy = 480, ppm = (1215 - sy) / 45;        // 0~45 m 를 지표 아래 875 px 에
    const RL = REAL_L * ppm, wid = Math.max(6, 0.3 * ppm);
    rockSection(stage, {sy, ppm, bands: false});
    depthRuler(stage, {sy, ppm, x: 96, max: 45, every: 5, label: 10, top: 300});
    const tr = (t0, dur) => 0.016 * smooth01((t - t0) / dur);        // 실제 0~16 ms 를 dur 초에
    // --- 왼쪽 x 300: 시뮬레이션 A (s17 부터 재생, 그 전에는 충돌 전) ---
    const xA = 300, xB = 640, tA = s17.start - 0.2;
    const stateA = t < tA || !RUN.A ? 0 : frameAt(RUN.A, tr(tA, 3.0));
    // 막대 그림(충돌 전): 지표 위에
    const showSimL = t >= tA;
    if (RUN.A) simAt(stage, RUN.A, showSimL ? stateA : 0, {ax: xA, sy, ppm}, {hotGain: 0.6, bands: false});
    // --- 오른쪽: s15~s17 뉴턴 기둥 / s18~s19 시뮬레이션 C(두 배 길이) / s20 시뮬레이션 B(두 배 빠르기) ---
    if (t < s18.start - 0.3) {
      // 막대(지표 위, 폭 과장) + 같은 질량의 바위 기둥(지표 아래, 같은 폭)
      const cw = 44, q = smooth01((t - W0(ctx, 's15', '바위') + 0.4) / 2.6), colLen = NEWTON * ppm * q, a = fadeOut(t, s18.start - 0.6, 0.3);
      withAlpha(c, a, () => {
        drawRod(c, xB, sy - 4, RL, cw);
        // 막대를 일곱 토막으로(같은 질량의 바위 기둥 한 토막씩)
        for (let k = 1; k < 7; k++) line(c, [[xB - cw / 2, sy - 4 - RL * k / RATIO], [xB + cw / 2, sy - 4 - RL * k / RATIO]], rgba('#2A2D31', 0.6), 1.5);
        if (colLen > 2) {
          c.fillStyle = rgba(PAL.warm, 0.14); c.fillRect(xB - cw / 2, sy, cw, colLen);
          poly(c, [[xB - cw / 2, sy], [xB + cw / 2, sy], [xB + cw / 2, sy + colLen], [xB - cw / 2, sy + colLen]], null, rgba(PAL.warm, 0.95), 3);
          for (let k = 1; k < 7; k++) if (RL * k < colLen) line(c, [[xB - cw / 2, sy + RL * k], [xB + cw / 2, sy + RL * k]], rgba(PAL.warm, 0.5), 1.5, {dash: [4, 4]});
        }
        stage.text('폭 과장', xB, sy - RL - 30, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
        withAlpha(c, fadeIn(t, s15.start + 0.6), () => { stage.text('막대 8.6 t', xB + cw / 2 + 16, sy - RL / 2, {size: 26, weight: 700, color: PAL.ink}); });
        withAlpha(c, fadeIn(t, W0(ctx, 's15', '바위') + 0.4), () => stage.text('같은 질량의 바위', xB + cw / 2 + 16, sy + Math.min(colLen, 180) - 20, {size: 26, weight: 700, color: PAL.warm}));
      });
      // s16: 깊이 표식 43 m, ×7
      withAlpha(c, fadeIn(t, W0(ctx, 's16', '육미터') - 0.2) * a, () => {
        const yN = sy + NEWTON * ppm;
        line(c, [[110, yN], [xB + 60, yN]], rgba(PAL.warm, 0.9), 3, {dash: [9, 6]});
        stage.text('뉴턴의 어림셈 ≈ 43 m', xB + 70, yN - 28, {size: 28, weight: 700, color: PAL.warm});
        stage.text('×7', xB + 96, sy + 360, {role: 'display', size: 96, weight: 700, color: PAL.warm, ...so});
      });
    }
    // s17: 닳는 모형 16 m 표식 + 두 값 사이 괄호
    const hA = fadeIn(t, W0(ctx, 's17', '십육미터') - 0.2) * fadeOut(t, s18.start - 0.4, 0.3);
    if (hA > 0) withAlpha(c, hA, () => {
      const yH = sy + HYDRO * ppm, yN = sy + NEWTON * ppm;
      line(c, [[110, yH], [xA + 90, yH]], rgba(PAL.ink, 0.9), 3, {dash: [9, 6]});
      stage.text('닳는 모형 ≈ 16 m', 130, yH - 24, {size: 28, weight: 700, color: PAL.ink});
      line(c, [[110, yN], [xA + 90, yN]], rgba(PAL.warm, 0.9), 3, {dash: [9, 6]});
      withAlpha(c, fadeIn(t, W0(ctx, 's17', '사이') - 0.2), () => {
        const bx = xA + 110; line(c, [[bx, yH], [bx + 18, yH], [bx + 18, yN], [bx, yN]], PAL.ink, 3);
        stage.text('답은 이 사이', bx + 30, (yH + yN) / 2, {size: 30, weight: 700, color: PAL.ink, ...so});
      });
    });
    // s18~s19: 두 배 길이(C), 같은 속도. (두 배 빠르기 실행 B 는 화면에 쓰지 않는다 — brief.md '시뮬레이션 대조')
    const cmpL = t >= s18.start - 0.3, cmpV = false;
    if (cmpL) {
      const t0 = s18.start, a = fadeIn(t, s18.start - 0.3, 0.4), trr = 2 * tr(t0 + 0.2, 3.2);     // 실제 0~32 ms
      // 왼쪽도 같은 시계로 다시 재생(같은 실제 시각)
      rockSection(stage, {sy, ppm, x0: xA - 150, x1: xA + 150, yMax: 1240, bands: false}); simScaled(stage, trr, {ax: xA, sy, ppm}, 1, {hotGain: 0.6, bands: false});
      withAlpha(c, a, () => { rockSection(stage, {sy, ppm, x0: xB - 160, x1: xB + 160, yMax: 1240, bands: false}); simScaled(stage, trr, {ax: xB, sy, ppm}, 2, {hotGain: 0.6, bands: false}); });
      withAlpha(c, a, () => {
        const lab = ['6 m 막대', '12 m 막대'];
        stage.text(lab[0], xA + 24, sy - RL * 0.6, {size: 30, weight: 700, color: PAL.ink, ...so});
        stage.text(lab[1], xB + 30, sy - RL * 1.2, {size: 30, weight: 700, color: PAL.ink, ...so});
        stage.text('지름도 두 배', xB + 30, sy - RL * 1.2 + 36, {size: 24, weight: 500, color: PAL.muted});
        // 같은 깊이 / 두 배 깊이 비교선(실행의 깊이에서 — 실제 막대 길이 배율)
        if (RUN.A) {
          const dA = depthScaled(trr, 1), dB = depthScaled(trr, 2);
          line(c, [[xA - 40, sy + dA * ppm], [xA + 40, sy + dA * ppm]], rgba(PAL.ink, 0.9), 3);
          line(c, [[xB - 40, sy + dB * ppm], [xB + 40, sy + dB * ppm]], rgba(PAL.ink, 0.9), 3);
        }
      });
    }
  },

  limits(stage, t, p, ctx) {
    const c = stage.ctx, s21 = S(ctx, 's20'), s22 = S(ctx, 's21'), s23 = S(ctx, 's22');
    const aE = fadeOut(t, s22.start - 0.4, 0.4), aV = fadeIn(t, s22.start - 0.3, 0.4) * fadeOut(t, s23.start - 0.4, 0.4), aT = fadeIn(t, s23.start - 0.3, 0.4);
    // s21: 에너지 로그 막대(TNT 톤)
    if (aE > 0) withAlpha(c, aE, () => {
      const x0 = 150, x1 = 900, Lx = tons => lerp(x0, x1, clamp(Math.log10(tons) / 5));     // 1 t .. 100,000 t
      panel(c, 70, 520, 940, 640, 0.8);
      stage.text('에너지 (TNT 톤, 로그 눈금)', x0, 570, {size: 26, weight: 500, color: PAL.muted});
      for (let k = 0; k <= 5; k++) { const x = lerp(x0, x1, k / 5); line(c, [[x, 1040], [x, 1052]], rgba(PAL.ink, 0.6), 2); stage.text(['1', '10', '100', '1천', '1만', '10만'][k], x, 1080, {size: 24, weight: 500, color: PAL.muted, align: 'center'}); line(c, [[x, 620], [x, 1040]], rgba(PAL.border, 0.6), 1); }
      const q1 = smooth01((t - ctx.scene.start - 0.2) / 1.0), q2 = smooth01((t - W0(ctx, 's20', '히로시마') + 0.2) / 1.6);
      stage.text('이 막대', x0, 680, {size: 28, weight: 700, color: PAL.ink});
      rect(c, x0, 710, Math.max(4, (Lx(11.5) - x0) * q1), 44, 8, PAL.warm);
      stage.text('11.5 t', Lx(11.5) + 16, 732, {size: 28, weight: 700, color: PAL.warm});
      stage.text('히로시마 원자폭탄', x0, 840, {size: 28, weight: 700, color: PAL.ink});
      rect(c, x0, 870, Math.max(4, (Lx(15000) - x0) * q2), 44, 8, '#8E8A84');
      withAlpha(c, q2, () => stage.text('약 15,000 t', Lx(15000) - 10, 960, {size: 28, weight: 700, color: PAL.ink, align: 'right'}));
      withAlpha(c, fadeIn(t, W0(ctx, 's20', '천분의일') - 0.2), () => stage.text('1/1,000 아래', 540, 1140, {role: 'display', size: 54, weight: 700, color: PAL.warm, align: 'center', ...so}));
    });
    // s22: 그 빠르기를 내기 — 여객기 0.25 km/s 대 궤도 7.8 km/s, 1 kg 의 운동에너지는 거의 1,000배
    if (aV > 0) withAlpha(c, aV, () => {
      panel(c, 70, 520, 940, 640, 0.8);
      const q = smooth01((t - s22.start) / 2.0);
      stage.text('그 빠르기까지 올리려면', 150, 570, {size: 26, weight: 500, color: PAL.muted});
      speedGauge(stage, {x0: 150, x1: 900, y: 700, v: 0.25 * q, vmax: 8, title: '여객기 순항 0.25 km/s'});
      speedGauge(stage, {x0: 150, x1: 900, y: 880, v: 7.8 * q, vmax: 8, title: '낮은 궤도 7.8 km/s'});
      withAlpha(c, fadeIn(t, W0(ctx, 's21', '비용') - 0.3), () => {
        stage.text('1 kg 의 운동에너지', 540, 990, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
        stage.text('0.03 MJ 대 30 MJ', 540, 1050, {role: 'display', size: 54, weight: 700, color: PAL.warm, align: 'center'});
      });
    });
    // s23: 지구, 궤도를 도는 막대, 조약 제4조의 금지 범위(대량살상무기)
    if (aT > 0) withAlpha(c, aT, () => {
      const ex = 540, ey = 830, R = 230, oR = 330;
      const gE = c.createRadialGradient(ex - 70, ey - 80, 20, ex, ey, R); gE.addColorStop(0, PAL.earthHi); gE.addColorStop(1, PAL.earth);
      circle(c, ex, ey, R, gE);
      ring(c, ex, ey, oR, rgba(PAL.cool, 0.6), 2);
      const a = -Math.PI / 2 + (t - s23.start) * 0.5, rx = ex + oR * Math.cos(a), ry = ey + oR * Math.sin(a);
      c.save(); c.translate(rx, ry); c.rotate(a + Math.PI / 2);
      const g = c.createLinearGradient(0, -6, 0, 6); g.addColorStop(0, SIMPAL.rodHi); g.addColorStop(1, SIMPAL.rodLo);
      poly(c, [[-34, -6], [26, -6], [34, 0], [26, 6], [-34, 6]], g, rgba('#2A2D31', 0.9), 1.5); c.restore();
      panel(c, 120, 1060, 840, 150);
      stage.text('궤도에 두지 못함: 핵무기 등 대량살상무기', 540, 1105, {size: 30, weight: 700, color: PAL.ink, align: 'center'});
      withAlpha(c, fadeIn(t, W0(ctx, 's22', '막대가') - 0.2), () => stage.text('운동에너지 막대가 여기에 드는가 — 해석이 갈림', 540, 1162, {size: 26, weight: 500, color: PAL.warmHi, align: 'center'}));
    });
  },

  close(stage, t, p, ctx) {
    const c = stage.ctx, s24 = S(ctx, 's23');
    const sy = 860, ppm = 8.4, xA = 380, xC = 700;
    // 두 막대(6 m, 12 m)가 같은 속도로 닿는다 → 깊이 1배·2배
    const trr = 0.032 * smooth01((t - ctx.scene.start - 0.2) / 3.0);
    rockSection(stage, {sy, ppm, yMax: 1240, bands: false});
    simScaled(stage, trr, {ax: xA, sy, ppm}, 1, {hotGain: 0.5, bands: false});
    simScaled(stage, trr, {ax: xC, sy, ppm}, 2, {hotGain: 0.5, bands: false});
    stage.text('6 m 막대', xA + 22, sy - 30, {size: 28, weight: 700, color: PAL.ink, ...so});
    stage.text('12 m 막대', xC + 22, sy - 60, {size: 28, weight: 700, color: PAL.ink, ...so});
    const ea = fadeIn(t, s24.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 30, 330, W - 60, 340, ea);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 320, 0, 680); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.6)'); g.addColorStop(0.85, 'rgba(9,9,11,0.6)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 320, W, 360);
        ['아주 빠른 충돌에서 뚫는 깊이는,', '속도가 아니라 막대의 길이와,', '땅과의 밀도 비가 정합니다'].forEach((s, i) => stage.text(s, 540, 400 + i * 74, {role: 'display', weight: 700, size: 52, color: i === 2 ? PAL.warm : PAL.ink, align: 'center', maxWidth: 980, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 630, {size: 34, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, s24.start, 0.5)});
      });
    }
  },
};
function smooth01(q) { return smooth(clamp(q)); }
/** energy 장면의 속도(km/s) — 소리(vel1·vel2·vel3, 음높이 = 110 + 60·속도)와 같은 시각표. 2.893 km/s(TNT 1 kg 과 같음)에 닿는 순간 = 'tnt' 사건. */
function energySpeed(t, ctx) {
  const s8 = ctx.tl.sentence('s08'), t1 = ctx.tl.wordStart('s07', '속도가'), tq = ctx.events.get('tnt').time, t0 = ctx.tl.scene('energy').start;
  if (t < t0 + 1.4) return lerp(0, 1, smooth((t - t0) / 1.4));
  if (t < t1) return 1;
  if (t < s8.start) return lerp(1, 2, smooth((t - t1) / 1.6));
  if (t < tq) return lerp(2, 2.893, (t - s8.start) / Math.max(0.3, tq - s8.start));
  return lerp(2.893, 3.2, smooth((t - tq) / 1.2));
}

// 바탕 캔버스(충돌 전 막대 자리를 덮을 때) — render.mjs 의 filmBackground 와 같은 그림
let BGCV = null;
import {createCanvas} from './simview.mjs';
import {filmBackground, loadLook} from '../../pipeline/render/index.mjs';
function bgCanvas(stage) {
  if (!BGCV) {
    const fake = {W: stage.W, H: stage.H, ctx: null};
    BGCV = createCanvas(stage.W, stage.H); fake.ctx = BGCV.getContext('2d');
    filmBackground(fake, loadLook(look));
  }
  return BGCV;
}


export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { unlitRect(stage, 0, 1230, W, 690, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); unlitRect(stage, 0, 0, W, 120, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') {
    posterTitle(stage, 1);
    let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
    head(stage, L[k][1], '', fadeIn(t, Math.max(MO[1] - 0.05, L[k][0]), 0.4) * a, 0);
    withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration));
    return;
  }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
