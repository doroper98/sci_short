// 73 양자중력 — 빛원뿔로 조각낸 시공간
// 무대 하나: 시공간 그림(시간이 위, 비스듬히 내려다본 2+1 차원). 주인공은 인과 다이아몬드(아래 사건 p 의 미래 빛원뿔 + 위 사건 q 의
// 과거 빛원뿔, 둘이 만나는 테두리). 원뿔 면은 채워진 무광 면(앞면 밝고 뒷면 어두움, lambert 명암) — 쉼 = 어두운 회갈색, 빛이 지나간 면 =
// 밝은 모래색(회색조 밝기 차가 크게: 첫 순간 점검).
// 같은 시계: 모든 사건 시각·모형 값(빛의 모임 ϱ, u*(n), 두 합 H_N·Z_N, S = A/4, 토큰 수)은 model.mjs 에서. make_sound.mjs 가 같은 plan() 을 쓴다.
// 난색(테마 accent) = 빛·빛원뿔·'어림하지 않음'. 한색(accent2) = 잔물결·중력파·중력자·'먼저 어림'.
// lit(): 빛줄기·사건 섬광·빛의 앞면 고리, 중력파 고리, 주고받는 물음·답 점, 계기 선의 끝점, 맞붙는 순간의 이음매 섬광, 시계 펄스.
// 면·판·종이·막대·글자·자막은 lit() 밖. Math.random() 없음.
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, line, circle, ring, rect, poly, withAlpha, lit, ensureGain, progressBar,
  project, lambert, DrawQueue, TAU,
} from '../../pipeline/render/index.mjs';
import * as M from './model.mjs';

export const theme = 'film';
export const look = {background: {cx: 0.5, cy: 0.40}};   // 무대 위의 등: 시공간 그림이 있는 자리
export const events = [];
export const captionLayout = {};

const W = 1080;
const PAL = {
  ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40',
  warm: '#FF6B1A', warmHi: '#F5A066', cool: '#5BA8F0', coolHi: '#A9D2FA',
  rest: '#4C4541', litF: '#E3C49C', plate: '#55565C', plateHi: '#8B8C92', paper: '#D9D2C4', block: '#5A5B62', blockHi: '#73747C',
  hole: '#121214', mass: '#8A7F74',
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, d = 0.4) => fadeIn(t, a, d) * fadeOut(t, b, d);
const LIGHT = [-0.45, 0.75, 0.55];

let PLAN = null, PLAN_TL = null;
const plan = tl => { if (PLAN_TL !== tl) { PLAN = M.plan(tl); PLAN_TL = tl; } return PLAN; };

// ---------------------------------------------------------------- 글자 도우미(빛 지도를 글자 밑에서 지운다)
function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save(); gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.fillStyle = '#000'; gc.fillRect(x, y, w, h); gc.restore();
}
function uText(stage, s, x, y, o = {}) {
  const size = o.size || 28, w = stage.measure(s, o) + 20, al = o.align || 'left';
  const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x - 10;
  if ((o.alpha ?? 1) > 0) unlitRect(stage, x0, y - size * 0.8, w, size * 1.4, 1);
  return stage.text(s, x, y, o);
}
const label = (stage, s, x, y, o = {}) => uText(stage, s, x, y, {size: 30, weight: 700, color: PAL.ink, align: 'center', ...so, ...o});
const note = (stage, s, x, y, o = {}) => uText(stage, s, x, y, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so, ...o});
function bigNum(stage, s, x, y, o = {}) { return uText(stage, s, x, y, {role: 'display', size: 64, weight: 700, color: PAL.ink, align: 'center', ...so, ...o}); }

// ---------------------------------------------------------------- 시공간 카메라
const camOf = (o = {}) => ({angle: 0.32, tilt: 0.42, scale: 240, cx: 540, cy: 1000, distance: 16, ...o});
const camMix = (a, b, q) => ({...a, scale: Math.exp(lerp(Math.log(a.scale), Math.log(b.scale), q)), cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), tilt: lerp(a.tilt, b.tilt, q), angle: lerp(a.angle, b.angle, q)});
function viewNormal([x, y, z], angle, tilt) {
  const xx = x * Math.cos(angle) + z * Math.sin(angle), zz = -x * Math.sin(angle) + z * Math.cos(angle);
  return [xx, y * Math.cos(tilt) - zz * Math.sin(tilt), y * Math.sin(tilt) + zz * Math.cos(tilt)];
}
const P3 = (cam, v) => project(v, cam);
const hexA = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbS = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')},${a})`;
const REST = hexA(PAL.rest), LITF = hexA(PAL.litF);

/** 바닥 격자(한 순간의 공간) */
function floorGrid(stage, cam, y = 0, R = 6, a = 0.14) {
  const c = stage.ctx;
  for (let i = -R; i <= R; i++) {
    line(c, [P3(cam, [i, y, -R]), P3(cam, [i, y, R])], rgba(PAL.muted, a), 1.2);
    line(c, [P3(cam, [-R, y, i]), P3(cam, [R, y, i])], rgba(PAL.muted, a), 1.2);
  }
}

/**
 * 다이아몬드 하나를 깊이 큐 q 에 넣는다. 세계 좌표: 아래 사건 p = (ox, y0, oz), 테두리 반지름 1.
 * o.n: 중력자 수(아래 원뿔의 모임), o.low/o.up: 지어진 비율(0..1, 빛이 퍼져 간 곳까지), o.litLow/o.litUp: 빛이 지나가 밝아진 비율,
 * o.keep: 지나간 면이 밝게 남는 정도(0..1), o.front: 앞면 불투명도, o.wave: {u, amp} 중력파 고리, o.upA: 위 원뿔 투명도
 */
function diamond(stage, q, cam, o = {}) {
  const c = stage.ctx, ox = o.ox || 0, oz = o.oz || 0, y0 = o.y0 ?? -1, n = o.n || 0, U = Math.min(M.uStar(n), 2);
  const NU = o.nu || 6, NP = o.np || 28, low = o.low ?? 1, up = o.up ?? 1, keep = o.keep ?? 1, front = o.front ?? 1, upA = o.upA ?? 1;
  const litLow = o.litLow ?? 0, litUp = o.litUp ?? 0, shear = o.shear || null, dim = o.dim ?? 1;
  const ecc = (u, ph) => (shear ? 1 + shear(u) * Math.cos(2 * ph) : 1);
  const lowPt = (u, ph) => { const r = M.rho(u, n) * ecc(u, ph); return [ox + r * Math.cos(ph), y0 + u, oz + r * Math.sin(ph)]; };
  const upPt = (v, ph) => { const r = M.rho(Math.max(0, U - v), n === 0 ? 0 : n); return [ox + r * Math.cos(ph), y0 + U + v * (1 / U) * U, oz + r * Math.sin(ph)]; };
  const cones = [];
  if (low > 0) cones.push({pt: lowPt, len: U * low, lit: litLow * U, a: 1});
  if (up > 0 && upA > 0) cones.push({pt: upPt, len: U * up, lit: litUp * U, a: upA});
  for (const cn of cones) {
    for (let i = 0; i < NU; i++) {
      const u0 = cn.len * i / NU, u1 = cn.len * (i + 1) / NU, um = (u0 + u1) / 2;
      const lq = clamp((cn.lit - um) / (cn.len / NU) + 0.5) * keep;          // 빛이 지나간 면
      const base = REST.map((v, k) => lerp(v, LITF[k], lq));
      for (let j = 0; j < NP; j++) {
        const p0 = (j / NP) * TAU, p1 = ((j + 1) / NP) * TAU;
        const A = cn.pt(u0, p0), Bq = cn.pt(u0, p1), C = cn.pt(u1, p1), D = cn.pt(u1, p0);
        const e1 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], e2 = [D[0] - Bq[0], D[1] - Bq[1], D[2] - Bq[2]];
        let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const mid = [(A[0] + C[0]) / 2 - ox, 0, (A[2] + C[2]) / 2 - oz];
        if (nrm[0] * mid[0] + nrm[2] * mid[2] < 0) nrm = nrm.map(v => -v);
        const vn = viewNormal(nrm, cam.angle, cam.tilt), facing = vn[2] > 0;
        const sh = facing ? 0.62 + 0.5 * lambert(vn, LIGHT) : 0.42 + 0.22 * lambert(vn.map(v => -v), LIGHT);
        const pts = [A, Bq, C, D].map(v => P3(cam, v)), z = pts.reduce((s, p) => s + p[2], 0) / 4;
        const col = rgbS(base.map(v => v * sh * dim), (facing ? front : 1) * cn.a);
        q.push(z + (facing ? 0.001 : -0.001), () => { poly(c, pts, col, col, 0.8); });
      }
    }
  }
  // 테두리(무광 선) — 두 원뿔이 만나는 곳
  const rimPts = []; for (let j = 0; j <= 48; j++) rimPts.push(P3(cam, lowPt(U, j / 48 * TAU)));
  if (low >= 0.999) {
    const zr = rimPts.reduce((s, p) => s + p[2], 0) / rimPts.length;
    q.push(zr + 0.5, () => line(c, rimPts, rgba(mix(PAL.rest, PAL.litF, 0.75), 0.9 * (o.rimA ?? 1)), 2.2));
  }
  return {p: P3(cam, [ox, y0, oz]), qp: P3(cam, [ox, y0 + 2 * U, oz]), rim: rimPts, U, lowPt, upPt,
    rimC: P3(cam, [ox, y0 + U, oz]), rimR: P3(cam, [ox + 1, y0 + U, oz])};
}
/** 빛의 앞면: 원뿔 면 위의 고리 + 빛줄기 몇 가닥(밝은 심 + 색). which = 'low' | 'up', f = 앞면 위치(0..1) */
function lightFront(stage, cam, d, which, f, a = 1, o = {}) {
  if (a <= 0 || f <= 0 || f >= 1.001) return;
  const U = d.U, u = f * U, pt = which === 'low' ? d.lowPt : d.upPt, pts = [];
  for (let j = 0; j <= 40; j++) pts.push(P3(cam, pt(u, j / 40 * TAU)));
  const streaks = [];
  for (let j = 0; j < 12; j++) { const ph = j / 12 * TAU + 0.13, seg = []; for (let k = 0; k <= 4; k++) seg.push(P3(cam, pt(Math.max(0, u - 0.22 * U * (k / 4)), ph))); streaks.push(seg); }
  lit(stage, cc => {
    cc.save(); cc.globalAlpha *= a;
    line(cc, pts, PAL.warm, o.w || 4); line(cc, pts, CORE(PAL.warm), (o.w || 4) * 0.4);
    for (const s of streaks) line(cc, s, rgba(PAL.warmHi, 0.8), 2);
    cc.restore();
  }, {gain: o.gain ?? 0.9});
}
function flash(stage, p, a, r = 16) {
  if (a <= 0) return;
  lit(stage, cc => { cc.save(); cc.globalAlpha *= a; ring(cc, p[0], p[1], r + 18 * (1 - a), PAL.warm, 4); circle(cc, p[0], p[1], r * 0.55, CORE(PAL.warm)); cc.restore(); }, {gain: 1});
}
function eventDot(stage, p, col = PAL.ink, r = 9) { circle(stage.ctx, p[0], p[1], r, col); circle(stage.ctx, p[0] - r * 0.3, p[1] - r * 0.3, r * 0.4, rgba('#FFFFFF', 0.25)); }

// ---------------------------------------------------------------- 머리글·띠
function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx;
  if (Math.max(kicker ? aK : 0, title ? aT : 0) > 0.01) unlitRect(stage, 0, 112, W, 160, 1);
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 29, color: PAL.warmHi, align: 'center', tracking: 1, maxWidth: 980, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 52, color: PAL.ink, align: 'center', maxWidth: 980, ...so}));
}
function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2] === cur[2] ? '' : prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, k > 0 && prev[2] !== cur[2] ? a * inn : a);
}
function titleList(id, ctx) {
  const tl = ctx.tl, P = plan(tl), a = (s, o = -0.4) => tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, '', ''], [P.exch.t0, '논문 · arXiv 2611.34924', '빛원뿔에서 출발한 중력의 양자화']];
    case 'origin': return [[-Infinity, '양자중력', '일반상대성이론 + 양자역학'], [a('s04'), '양자중력', '무대가 휘고 출렁인다']];
    case 'infinity': return [[-Infinity, '먼저 어림 · 잔물결을 하나씩', '평평한 시공간 위의 잔물결'], [P.rip.find(r => r.decade).t - 0.3, '먼저 어림 · ×10씩', '더할수록 끝없이 커진다'], [a('s07'), '', '빛의 길로 조각내면?']];
    case 'diamond': return [[-Infinity, '시공간 그림 — 시간이 위', '두 빛원뿔'], [a('s09'), '시공간 그림 — 시간이 위', '두 빛원뿔이 감싼 곳']];
    case 'focus': return [[-Infinity, '모형: 8개까지', '중력파는 빛을 모은다'], [a('s11'), '모형: 8개까지', '중력 시계'], [a('s13'), '모형: 8개까지', '중력자는 끝없이 못 넣는다']];
    case 'finite': return [[-Infinity, '조각보처럼 이어 붙이기', '합은 유한한 값에서 멈춘다'], [a('s16'), '같은 계산, 먼저 어림하면', '무한대가 다시 나온다']];
    case 'blackhole': return [[-Infinity, '베켄슈타인 · 호킹', '블랙홀의 상태 수']];
    case 'limits': return [[-Infinity, '아직', '동료 심사 전'], [a('s19'), '아직', '실험으로 확인되지 않음']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1236, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.1, 'rgba(8,8,10,0.42)'); g.addColorStop(0.4, 'rgba(8,8,10,0.32)'); g.addColorStop(0.65, 'rgba(8,8,10,0.12)'); g.addColorStop(1, 'rgba(8,8,10,0.12)'); c.fillStyle = g; c.fillRect(0, 1236, W, 684); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }

// ---------------------------------------------------------------- 포스터(0초 = 썸네일): 흰 물음 두 줄, 그 아래 가장 큰 난색 주제어 두 줄. 답 없음.
const POSTER = {q: ['무한대가 나오던 중력 계산,', '어떻게 유한해진다는 걸까?'], a: ['OpenAI', '양자중력이론'], qy: 300, QS: 60, ay: 520, AS: 128};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 1.15 + 70;
  if (q < 1) unlitRect(stage, 0, yTop, W, yBot - yTop, 1);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.5)'); g.addColorStop(0.85, 'rgba(9,9,11,0.5)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 44, q), LH = POSTER.QS * 1.3;
  withAlpha(c, 1 - smooth((q - 0.4) / 0.6), () => POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 200 + i * 50, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22})));
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => POSTER.a.forEach((s, i) => stage.text(s, 540, lerp(POSTER.ay + i * POSTER.AS * 1.15, 300 + i * 48, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa})));
}

// ---------------------------------------------------------------- 합 계기(infinity · finite · close 같은 축): 가로 log10 N, 세로 합
const GA = {x0: 176, x1: 880, y0: 1040, y1: 1196, px0: 96, px1: 960, py0: 996, py1: 1236};
const gx = lg => GA.x0 + (lg - M.AX.lg0) / (M.AX.lg1 - M.AX.lg0) * (GA.x1 - GA.x0);
const gy = s => GA.y1 - (s - M.AX.y0) / (M.AX.y1 - M.AX.y0) * (GA.y1 - GA.y0);
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶'];
function gaugePanel(stage, a = 1) {
  const c = stage.ctx;
  if (a <= 0) return;
  withAlpha(c, a, () => {
    unlitRect(stage, GA.px0, GA.py0, GA.px1 - GA.px0, GA.py1 - GA.py0, 1);
    rect(c, GA.px0, GA.py0, GA.px1 - GA.px0, GA.py1 - GA.py0, 12, rgba('#141416', 0.92), rgba(PAL.border, 1), 2);
    line(c, [[GA.x0, GA.y1], [GA.x1, GA.y1]], rgba(PAL.muted, 0.5), 1.5);
    line(c, [[GA.x0, GA.y0], [GA.x0, GA.y1]], rgba(PAL.muted, 0.5), 1.5);
    for (let d = 0; d <= 6; d++) { line(c, [[gx(d), GA.y1], [gx(d), GA.y1 + 6]], rgba(PAL.muted, 0.6), 1.5); stage.text(d === 0 ? '1' : d === 1 ? '10' : '10' + SUP[d], gx(d), GA.y1 + 20, {size: 20, weight: 500, color: PAL.muted, align: 'center'}); }
    for (const s of [0, 4, 8]) stage.text(String(s), GA.x0 - 14, gy(s), {size: 20, weight: 500, color: PAL.muted, align: 'right'});
    line(c, [[GA.x0, gy(M.ZINF)], [GA.x1, gy(M.ZINF)]], rgba(PAL.warmHi, 0.18), 1, {dash: [4, 6]});
    stage.text('더한 잔물결의 수 N', GA.x1, GA.py0 + 22, {size: 21, weight: 500, color: PAL.muted, align: 'right'});
    stage.text('합', GA.x0 - 14, GA.py0 + 22, {size: 21, weight: 500, color: PAL.muted, align: 'right'});
  });
}
/** 합 선: kind 'H'(먼저 어림, 한색) | 'Z'(어림하지 않음, 난색), lg = 지금까지 더한 log10 N. ghost = 잔상(점선) */
function gaugeLine(stage, kind, lg, o = {}) {
  if (lg < 0) return null;
  const c = stage.ctx, col = kind === 'H' ? PAL.cool : PAL.warm, pts = [];
  for (let x = 0; x <= lg + 1e-9; x += 0.02) pts.push([gx(x), gy(M.sumAtLog(kind, x))]);
  pts.push([gx(lg), gy(M.sumAtLog(kind, lg))]);
  const clip = pts.map(p => [p[0], Math.max(GA.y0 - 4, p[1])]);   // 천장: 축 이름 줄(py0+22) 아래에서 잘라 글자와 겹치지 않게
  const a = o.a ?? 1;
  withAlpha(c, a, () => line(c, clip, o.ghost ? rgba(col, 0.45) : col, o.ghost ? 2.2 : 3.2, o.ghost ? {dash: [8, 7]} : {}));
  const end = clip[clip.length - 1], over = pts[pts.length - 1][1] < GA.y0 - 4;
  if (!o.ghost && o.tip !== false) lit(stage, cc => { cc.save(); cc.globalAlpha *= a; circle(cc, end[0], end[1], 8, col); circle(cc, end[0], end[1], 4, CORE(col)); cc.restore(); }, {gain: 0.8});
  return {end, over, val: M.sumAtLog(kind, lg)};
}
/** 사건 목록(k 하나씩)에서 지금의 log10 N(다음 사건까지 매끄럽게 건너감) */
function lgAt(list, t, jump = 0.25) {
  let lg = -1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (t < e.t) break;
    const prev = i ? list[i - 1].lg : e.lg; lg = lerp(prev, e.lg, smooth((t - e.t) / jump));
  }
  return lg;
}

// ---------------------------------------------------------------- 판(origin · infinity): 높이 h(x,z)
const PLATE = {X: 3.2, Z: 1.9, nx: 48, nz: 16};
function plateMesh(stage, cam, hf, o = {}) {
  const c = stage.ctx, {X, Z, nx, nz} = PLATE, q = new DrawQueue(), base = hexA(o.col || PAL.plate), a = o.a ?? 1;
  const V = (x, z) => [x, hf(x, z), z];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = -X + 2 * X * i / nx, x1 = -X + 2 * X * (i + 1) / nx, z0 = -Z + 2 * Z * j / nz, z1 = -Z + 2 * Z * (j + 1) / nz;
    const A = V(x0, z0), Bq = V(x1, z0), C = V(x1, z1), D = V(x0, z1);
    const e1 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], e2 = [D[0] - Bq[0], D[1] - Bq[1], D[2] - Bq[2]];
    let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (nrm[1] < 0) nrm = nrm.map(v => -v);
    const vn = viewNormal(nrm, cam.angle, cam.tilt), sh = 0.45 + 0.75 * lambert(vn, LIGHT);
    const pts = [A, Bq, C, D].map(v => P3(cam, v)), z = pts.reduce((s, p) => s + p[2], 0) / 4;
    const grid = (i % 4 === 0) || (j % 4 === 0);
    const col = rgbS(base.map(v => v * sh * (grid && i % 4 === 0 && j % 4 === 0 ? 1 : 1)), a);
    q.push(z, () => { poly(c, pts, col, col, 0.7); });
  }
  q.flush();
  // 격자선(판에 그려 둔 줄)
  withAlpha(c, a, () => {
    for (let i = 0; i <= nx; i += 4) { const x = -X + 2 * X * i / nx, pts = []; for (let j = 0; j <= nz * 2; j++) { const z = -Z + Z * j / nz; pts.push(P3(cam, V(x, z))); } line(c, pts, rgba(PAL.plateHi, 0.35), 1.2); }
    for (let j = 0; j <= nz; j += 4) { const z = -Z + 2 * Z * j / nz, pts = []; for (let i = 0; i <= nx * 2; i++) { const x = -X + X * i / nx; pts.push(P3(cam, V(x, z))); } line(c, pts, rgba(PAL.plateHi, 0.35), 1.2); }
  });
}
/** 판의 우물(질량): 깊이 D, 폭 w */
const well = (x, z, mx, mz, D, w = 0.95) => -D * Math.exp(-((x - mx) ** 2 + (z - mz) ** 2) / (w * w));
/** 눈금 두 개 사이(x = 0 … 0.5, z = 0)의 판 위 길이 / 평평할 때 길이 */
function tickLen(hf) { let L = 0, px = 0, py = hf(0, 0); for (let i = 1; i <= 40; i++) { const x = 0.5 * i / 40, y = hf(x, 0); L += Math.hypot(x - px, y - py); px = x; py = y; } return L / 0.5; }
function rulerTicks(stage, cam, hf, col, a = 1, hi = true) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    for (let k = -6; k <= 6; k++) { const x = k * 0.5, b = P3(cam, [x, hf(x, 0), 0]), t = P3(cam, [x, hf(x, 0) + 0.22, 0]); line(c, [b, t], col, k === 0 || k === 1 ? 4 : 2.4); }
    if (hi) { const pts = []; for (let i = 0; i <= 20; i++) { const x = 0.5 * i / 20; pts.push(P3(cam, [x, hf(x, 0) + 0.11, 0])); } line(c, pts, col, 3); }
  });
}

// =====================================================================================================
// 장면
// =====================================================================================================
/** hook 의 시각 → 상태: litLow/litUp(빛의 앞면), sewN(맞붙은 이웃 수, 연속), zoom(0..1) */
function hookState(P, t) {
  const H = P.hook, sA = H.sweepA, sB = H.sweepB;
  if (t < H.rewind[0]) {
    const fl = clamp((t - sA[0]) / (sA[1] - sA[0])), fu = clamp((t - sB[0]) / (sB[1] - sB[0]));
    let sew = 0; for (const s of H.sew) sew += smooth((t - s.t) / 0.18);
    return {fl, fu, keep: 1, sew, zoom: easeInOut(clamp((t - H.zoom[0]) / (H.zoom[1] - H.zoom[0]))), front: [fl, fu]};
  }
  if (t < H.rewind[1]) {   // 되감기: 같은 길을 거꾸로
    const r = 1 - easeInOut((t - H.rewind[0]) / (H.rewind[1] - H.rewind[0]));
    return {fl: 1, fu: 1, keep: smooth(r * 1.6), sew: H.sew.length * r, zoom: r, front: [0, 0]};
  }
  // 되풀이: 빛이 퍼지고 모인 뒤 면이 쉼 색으로 돌아감
  let st = {fl: 0, fu: 0, keep: 0, sew: 0, zoom: 0, front: [0, 0]};
  for (const t0 of H.loops) {
    const a = t - t0; if (a < 0 || a > 2.3) continue;
    const fl = clamp(a / 0.55), fu = clamp((a - 0.55) / 0.45), keep = 1 - smooth((a - 1.3) / 0.8);
    st = {fl, fu, keep, sew: 0, zoom: 0, front: [fl, fu]};
  }
  return st;
}
const CAM_HOOK0 = camOf({scale: 290, cy: 995}), CAM_HOOK1 = camOf({scale: 112, cy: 960, tilt: 0.5});

function patchwork(stage, cam, sites, o = {}) {
  // sites: [{x, z, a(0..1 붙은 정도), lit(0..1 밝기)}], 가운데 다이아몬드 포함
  const q = new DrawQueue(), out = [];
  for (const s of sites) {
    if (s.a <= 0) continue;
    const off = (1 - s.a) * 0.9, d = Math.hypot(s.x, s.z) || 1;
    const ox = s.x + (s.x / d) * off, oz = s.z + (s.z / d) * off;
    out.push({s, d: diamond(stage, q, cam, {ox, oz, y0: -1, litLow: s.litLow ?? 1, litUp: s.litUp ?? 1, keep: s.lit, nu: o.nu || 4, np: o.np || 20, front: 1, dim: s.dim ?? 1, rimA: s.a})});
  }
  q.flush();
  return out;
}

export const scenes = {
  hook(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, H = P.hook;
    const xf = smooth((t - P.exch.t0) / 0.5);
    if (xf < 1) withAlpha(c, 1 - xf, () => {
      const st = hookState(P, t), cam = camMix(CAM_HOOK0, CAM_HOOK1, st.zoom);
      floorGrid(stage, cam, -1, 6, 0.10);
      const sites = [{x: 0, z: 0, a: 1, lit: st.keep, litLow: st.fl, litUp: st.fu}];
      H.sew.forEach((s, i) => sites.push({x: s.x, z: s.z, a: clamp(st.sew - i), lit: st.keep, litLow: 1, litUp: 1}));
      const ds = patchwork(stage, cam, sites, {nu: 5, np: 24});
      const d0 = ds[0].d;
      lightFront(stage, cam, d0, 'low', st.front[0], 1 - smooth((st.front[0] - 0.92) / 0.08) * (st.front[1] > 0 ? 1 : 0));
      lightFront(stage, cam, d0, 'up', st.front[1], 1);
      // 사건의 섬광: 떠날 때(p), 모일 때(q)
      const starts = t < H.rewind[0] ? [H.sweepA[0]] : H.loops, ends = t < H.rewind[0] ? [H.sweepB[1]] : H.loops.map(x => x + 1.0);
      for (const s of starts) flash(stage, d0.p, Math.max(0, 1 - Math.abs(t - s) / 0.35) * (t >= s - 0.05 ? 1 : 0));
      for (const e of ends) flash(stage, d0.qp, Math.max(0, 1 - Math.abs(t - e) / 0.35) * (t >= e - 0.05 ? 1 : 0));
      // 이음매 섬광(맞붙는 순간)
      for (let i = 0; i < ds.length - 1; i++) { const s = H.sew[i], f = Math.max(0, 1 - Math.abs(t - s.t - 0.18) / 0.22); if (f > 0 && t < H.rewind[0]) { const dd = Math.hypot(s.x, s.z), cp = P3(cam, [s.x * (1 - 1 / dd), 0, s.z * (1 - 1 / dd)]); flash(stage, cp, f, 9); } }
      eventDot(stage, d0.p, PAL.ink, 7 * cam.scale / 290 + 3); eventDot(stage, d0.qp, PAL.ink, 7 * cam.scale / 290 + 3);
    });
    if (xf > 0) withAlpha(c, xf, () => exchange(stage, t, P));
  },

  origin(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, O = P.origin, s0 = ctx.scene.start;
    const cam = camOf({scale: 165, cy: 700, tilt: 0.66, angle: 0.18});
    // 질량: 떨어짐 → 놓임 → 우물 둘레를 천천히 돎(판이 따라 휨)
    const fallT0 = s0 + 0.35, land = O.land, bend = smooth((t - land) / O.bend);
    const orb = Math.max(0, t - land - 0.6), ang = orb * 0.55, rad = 0.55 * smooth(orb / 2);
    const mx = rad * Math.cos(ang), mz = rad * Math.sin(ang) * 0.8;
    const wob = fadeIn(t, O.wobble, 0.6), ph = Math.sin((t - O.wobble) * 2 * Math.PI * 0.6);
    const D = 1.35 * bend;
    const hA = (x, z) => well(x, z, mx - 0.45 * wob, mz, D * (1 + 0.12 * wob * ph)), hB = (x, z) => well(x, z, mx + 0.45 * wob, mz, D * (0.8 - 0.12 * wob * ph));
    // 고정된 무대(양자역학의 무대) — s04 부터 잔상으로
    const fixA = win(t, ctx.tl.at('s04') + 0.2, ctx.scene.end + 1, 0.6);
    if (fixA > 0) { const pts = []; for (const z of [-PLATE.Z, PLATE.Z]) pts.push([P3(cam, [-PLATE.X, 0.0, z]), P3(cam, [PLATE.X, 0.0, z])]);
      withAlpha(c, fixA * 0.8, () => { for (let k = -6; k <= 6; k++) line(c, [P3(cam, [k * 0.5, 0, -PLATE.Z]), P3(cam, [k * 0.5, 0, PLATE.Z])], rgba(PAL.ink, 0.12), 1, {dash: [5, 7]}); for (let k = -4; k <= 4; k++) line(c, [P3(cam, [-PLATE.X, 0, k * 0.475]), P3(cam, [PLATE.X, 0, k * 0.475])], rgba(PAL.ink, 0.12), 1, {dash: [5, 7]}); }); }
    if (wob > 0.01) { plateMesh(stage, cam, hA, {a: 0.55 + 0.45 * (1 - wob)}); plateMesh(stage, cam, hB, {a: 0.5 * wob}); }
    else plateMesh(stage, cam, hA);
    if (fixA > 0) rulerTicks(stage, cam, () => 0, rgba(PAL.ink, 0.35), fixA, false);
    rulerTicks(stage, cam, hA, PAL.ink, 1);
    if (wob > 0.01) rulerTicks(stage, cam, hB, rgba(PAL.ink, 0.75), wob);
    // 질량 덩어리(무광 공)
    const my = t < land ? lerp(2.6, 0, smooth((t - fallT0) / (land - fallT0)) ** 1.6) : 0;
    const mp = P3(cam, [mx, (t < land ? my : well(mx, mz, mx, mz, D)) + 0.28, mz]);
    if (t >= fallT0 - 0.3) {
      const r = 0.28 * cam.scale * mp[3];
      circle(c, mp[0], mp[1], r, PAL.mass); circle(c, mp[0] - r * 0.3, mp[1] - r * 0.3, r * 0.45, rgba('#FFFFFF', 0.12));
      if (t >= land - 0.2) note(stage, '질량', mp[0], mp[1] - r - 26, {size: 26, alpha: fadeIn(t, land - 0.2, 0.3) * fadeOut(t, O.wobble, 0.4)});
    }
    // 계기: 눈금 한 칸의 길이(평평할 때 1.00)
    const LA = tickLen(hA), LB = tickLen(hB);
    uText(stage, '눈금 한 칸의 길이', 540, 950, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
    if (wob > 0.3) bigNum(stage, `${LA.toFixed(2)} 또는 ${LB.toFixed(2)}`, 540, 1020, {size: 60});
    else bigNum(stage, LA.toFixed(2), 540, 1020, {size: 60});
    note(stage, '평평한 판에서 1.00', 540, 1078, {size: 24});
    if (fixA > 0) note(stage, '점선: 고정된 무대', 230, 1150, {size: 24, alpha: fixA, align: 'left'});
    if (wob > 0) note(stage, '두 모양이 겹친 채 출렁임', 850, 1150, {size: 24, alpha: wob, align: 'right'});
  },

  infinity(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, I = P.infinity, R = P.rip;
    const out = smooth((t - I.plateOut[0]) / (I.plateOut[1] - I.plateOut[0]));
    if (out < 1) withAlpha(c, 1 - out, () => {
      const cam = camOf({scale: lerp(150, 90, out), cy: lerp(720, 860, out), tilt: 0.5, angle: 0.18});
      const shown = R.filter(r => !r.decade && t >= r.t);
      const amp = k => 0.16 / k, hf = (x, z) => { let h = 0; for (const r of shown) { const k = r.k, g = smooth((t - r.t) / 0.4); h += g * amp(k) * Math.sin(k * 1.35 * x - Math.sqrt(k) * 1.6 * t + k * 0.7 + 0.25 * z * k); } return h; };
      plateMesh(stage, cam, hf);
      // 앞 가장자리의 단면(한색 선) — 더한 잔물결의 합
      const pts = []; for (let i = 0; i <= 160; i++) { const x = -PLATE.X + 2 * PLATE.X * i / 160; pts.push(P3(cam, [x, hf(x, PLATE.Z), PLATE.Z])); }
      line(c, pts, PAL.cool, 2.6);
      // 새 잔물결이 얹히는 순간 / ×10 으로 건너뛰는 순간: 단면이 번쩍(중력파의 에너지)
      for (const r of R) { const f = Math.max(0, 1 - (t - r.t) / 0.45) * (t >= r.t ? 1 : 0); if (f > 0) lit(stage, cc => { cc.save(); cc.globalAlpha *= f; line(cc, pts, PAL.cool, 4); line(cc, pts, CORE(PAL.cool), 1.6); cc.restore(); }, {gain: 0.8}); }
      // 중력자(알갱이): 잔물결 마루를 타는 한색 무광 점
      const gA = fadeIn(t, ctx.tl.at('s05') + 4.2, 0.5);
      if (gA > 0) withAlpha(c, gA, () => { for (let i = 0; i < 7; i++) { const x = -2.7 + i * 0.9, z = -1.2 + (i % 3) * 1.1, pp = P3(cam, [x, hf(x, z) + 0.06, z]); circle(c, pp[0], pp[1], 7, PAL.coolHi); } });
      if (gA > 0) note(stage, '중력자', 540, P3(cam, [0, 0, -PLATE.Z])[1] - 40, {size: 26, color: PAL.coolHi, alpha: gA});
      // 계기
      gaugePanel(stage, 1);
      const lg = lgAt(R, t);
      const g = gaugeLine(stage, 'H', lg);
      stage.text('먼저 어림', GA.x0 + 16, GA.py0 + 22, {size: 22, weight: 700, color: PAL.cool});
      if (g) {
        const N = Math.round(10 ** lg);
        uText(stage, '합', 540, 360, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
        bigNum(stage, g.val.toFixed(2), 540, 420, {size: 80, color: PAL.coolHi});
        note(stage, `잔물결 N = ${N.toLocaleString('en-US')}개`, 540, 482, {size: 26});
        if (g.over) note(stage, '↑ 끝없이', Math.min(g.end[0], 590), GA.y0 - 34, {size: 24, color: PAL.coolHi, weight: 700});
      }
    });
    // s07: 판이 물러나고 빛원뿔(다이아몬드)이 선다
    if (out > 0) {
      const cam = camOf({scale: 230, cy: 980});
      floorGrid(stage, cam, -1, 6, 0.10 * out);
      const rise = smooth((t - I.plateOut[0] - 0.5) / 1.2), q = new DrawQueue();
      let fa = 0, keep = 0, t0 = -1e9;
      for (const l of I.loops) if (t >= l) t0 = l;
      if (t0 > 0) { const a = t - t0; fa = clamp(a / 1.0); keep = 1 - smooth((a - 1.3) / 0.8); }
      const d = diamond(stage, q, cam, {low: rise, up: rise, litLow: clamp(fa * 2), litUp: clamp(fa * 2 - 1), keep, upA: 1});
      withAlpha(c, out, () => q.flush());
      lightFront(stage, cam, d, 'low', clamp(fa * 2), fa < 0.5 ? 1 : 0);
      lightFront(stage, cam, d, 'up', clamp(fa * 2 - 1), 1);
      eventDot(stage, d.p, PAL.ink, 9); if (rise > 0.99) eventDot(stage, d.qp, PAL.ink, 9);
      for (const s of I.loops) { flash(stage, d.p, Math.max(0, 1 - Math.abs(t - s) / 0.35) * (t >= s - 0.05 ? 1 : 0)); flash(stage, d.qp, Math.max(0, 1 - Math.abs(t - s - 1) / 0.35) * (t >= s + 0.95 ? 1 : 0)); }
    }
  },

  diamond(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, Dm = P.diamond;
    const cam = camOf({scale: 290, cy: 900});
    floorGrid(stage, cam, -1, 6, 0.12);
    const fl = clamp((t - Dm.p) / Dm.grow), fu = clamp((t - Dm.q0) / (Dm.qArr - Dm.q0)), q = new DrawQueue();
    const d = diamond(stage, q, cam, {low: Math.max(0.001, fl), up: fu, litLow: fl, litUp: fu, keep: 0.75, front: 0.62});
    if (t < Dm.p) { /* 아직 사건 전: 원뿔 없음 */ }
    q.flush();
    lightFront(stage, cam, d, 'low', fl, fl < 1 ? 1 : 0);
    // 위 원뿔: 테두리에서 q 로 모이는 빛
    if (fu > 0 && fu < 1) { const v = fu * d.U, pts = []; for (let j = 0; j <= 40; j++) pts.push(P3(cam, d.upPt(v, j / 40 * TAU))); lit(stage, cc => { line(cc, pts, PAL.warm, 4); line(cc, pts, CORE(PAL.warm), 1.6); }, {gain: 0.9}); }
    flash(stage, d.p, Math.max(0, 1 - Math.abs(t - Dm.p) / 0.4) * (t >= Dm.p - 0.05 ? 1 : 0));
    flash(stage, d.qp, Math.max(0, 1 - Math.abs(t - Dm.qArr) / 0.4) * (t >= Dm.qArr - 0.05 ? 1 : 0));
    eventDot(stage, d.p, PAL.ink, 10);
    if (t >= Dm.q0 - 0.3) eventDot(stage, d.qp, PAL.ink, 10);
    // 신호 점: p 를 떠나 빛보다 느린 여러 길로 q 에 닿음(모두 다이아몬드 안). 하나는 밖으로 가려다 원뿔 면에 붙어 감.
    const sq = clamp((t - Dm.sig) / Dm.sigDur);
    if (t >= Dm.sig) {
      const paths = [[0.0, 0.0], [0.45, 0.6], [-0.4, 1.9], [0.3, 3.5], [-0.5, 4.6]];
      for (const [k, phs] of paths) {
        const u = sq * 2, xr = k * Math.sin(Math.PI * sq) * 0.95;
        const v = [xr * Math.cos(phs), -1 + u, xr * Math.sin(phs)], pp = P3(cam, v);
        lit(stage, cc => { circle(cc, pp[0], pp[1], 8, PAL.warmHi); circle(cc, pp[0], pp[1], 3.6, CORE(PAL.warm)); }, {gain: 0.7});
      }
      // 밖으로 가려는 점: 빛원뿔 면을 넘지 못하고 면을 따라 감(빛의 빠르기가 한계)
      const u = sq * 1.6, r = Math.min(u * 1.6, u), ph = -0.35, v = [r * Math.cos(ph), -1 + Math.min(u, 1) + Math.max(0, u - 1) * 0.0, r * Math.sin(ph)];
      const pp = P3(cam, [Math.min(1, r) * Math.cos(ph), -1 + Math.min(u, 1), Math.min(1, r) * Math.sin(ph)]);
      lit(stage, cc => { circle(cc, pp[0], pp[1], 8, PAL.warmHi); circle(cc, pp[0], pp[1], 3.6, CORE(PAL.warm)); }, {gain: 0.7});
      void v;
    }
    // 이름표(1240 위)
    const la = fadeIn(t, Dm.p + 0.2, 0.4);
    if (la > 0) label(stage, '사건(먼저)', d.p[0] + 130, d.p[1] + 8, {size: 28, alpha: la});
    if (t > Dm.q0) label(stage, '사건(나중)', d.qp[0] + 130, d.qp[1] - 6, {size: 28, alpha: fadeIn(t, Dm.q0 + 0.3, 0.4)});
    if (fl > 0.6) { const side = P3(cam, [-0.62, -0.38, 0.35]); label(stage, '빛원뿔 null cone', side[0] - 110, side[1] + 40, {size: 28, color: PAL.warmHi, alpha: fadeIn(t, Dm.p + 1.2, 0.4)}); }
    if (fl >= 1) { const rr = P3(cam, [1.0, 0, 0.0]); note(stage, '테두리', rr[0] + 70, rr[1] + 4, {size: 26, color: PAL.ink, alpha: fadeIn(t, Dm.p + Dm.grow, 0.4)}); }
    if (t >= Dm.label) { bigNum(stage, '인과 다이아몬드', 540, 360, {size: 58, color: PAL.warmHi, alpha: fadeIn(t, Dm.label, 0.4)}); }
    // 시간 화살표(시공간 그림의 축)
    const ta = P3(cam, [-2.3, -1, -0.3]), tb = P3(cam, [-2.3, 0.9, -0.3]);
    line(c, [ta, tb], rgba(PAL.muted, 0.6), 2.4); poly(c, [[tb[0] - 8, tb[1] + 12], [tb[0] + 8, tb[1] + 12], [tb[0], tb[1] - 4]], rgba(PAL.muted, 0.6));
    note(stage, '시간', tb[0], tb[1] - 28, {size: 24});
  },

  focus(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, F = P.focus, s0 = ctx.scene.start;
    const cam = camOf({scale: 330, cx: 470, cy: 1150, tilt: 0.36});
    const {n, wave} = M.gravAt(P, t);
    const nShow = Math.min(n, M.NFIT);
    // 잔상: 중력자 0개의 곧은 원뿔(점선 옆선 + 테두리)
    const ghostA = fadeIn(t, P.grav[0].t + 0.6, 0.5);
    const gl = []; for (let j = 0; j <= 48; j++) { const ph = j / 48 * TAU; gl.push(P3(cam, [Math.cos(ph), 1, Math.sin(ph)])); }
    // 층밀림(단면 찌그러짐): 고리가 지나간 바로 아래에서 크고, 곧 잦아듦
    const shear = wave && !wave.blocked ? (u => { const uw = wave.q * 1.5; return u < uw ? 0.22 * Math.exp(-(uw - u) * 2.2) * (1 - smooth((wave.q - 0.9) / 0.4)) : 0; }) : null;
    const q = new DrawQueue();
    const d = diamond(stage, q, cam, {y0: 0, n: nShow, up: 1, upA: 0.28, litLow: 1, litUp: 0, keep: 0.55, front: 0.7, nu: 9, np: 32, shear});
    q.flush();
    withAlpha(c, ghostA, () => { line(c, gl, rgba(PAL.ink, 0.45), 2, {dash: [7, 7]}); const a = P3(cam, [0, 0, 0]); for (const ph of [Math.PI - 0.32, -0.32]) line(c, [a, P3(cam, [Math.cos(ph), 1, Math.sin(ph)])], rgba(PAL.ink, 0.4), 2, {dash: [7, 7]}); });
    eventDot(stage, d.p, PAL.ink, 10);
    // 빛줄기(옆선): 앞쪽 몇 가닥을 무광 선으로, 그 위를 달리는 시계 펄스(빛) — 꼭짓점 → 테두리
    const gens = [0.5, 1.2, 1.9, 2.6].map(ph => { const pts = []; for (let i = 0; i <= 24; i++) pts.push(P3(cam, d.lowPt(d.U * i / 24, ph))); return pts; });
    const gA = fadeIn(t, F.clock - 4, 0.5);
    withAlpha(c, gA, () => { for (const g of gens) line(c, g, rgba(PAL.warmHi, 0.55), 2); });
    if (t >= F.clock - 5.6) {
      const ph = ((t - (F.clock - 5.6)) % F.clockPeriod) / F.clockPeriod;
      const u = ph * d.U, a = 1 - smooth((ph - 0.9) / 0.1);
      for (const g of [0.5, 1.9]) { const pp = P3(cam, d.lowPt(u, g)); lit(stage, cc => { cc.save(); cc.globalAlpha *= a; circle(cc, pp[0], pp[1], 9, PAL.warm); circle(cc, pp[0], pp[1], 4, CORE(PAL.warm)); cc.restore(); }, {gain: 0.85}); }
    }
    // 중력파 고리(한색, 빛나는 것 = 중력파의 에너지): 원뿔을 따라 올라감
    if (wave) {
      const top = wave.blocked ? M.ELL : M.uStar(wave.n), uw = Math.min(wave.q * 1.5, top), a = wave.blocked ? 1 - smooth((wave.q - 0.95) / 0.5) : 1 - smooth((wave.q - 0.85) / 0.25);
      const pts = []; for (let j = 0; j <= 48; j++) { const ph = j / 48 * TAU, r = M.rho(uw, Math.max(nShow, 0)) * 1.04; pts.push(P3(cam, [r * Math.cos(ph), uw, r * Math.sin(ph)])); }
      if (a > 0) lit(stage, cc => { cc.save(); cc.globalAlpha *= a; line(cc, pts, PAL.cool, 5); line(cc, pts, CORE(PAL.cool), 2); cc.restore(); }, {gain: 0.85});
    }
    // 시계 막대 — 무대와 같은 세로 자(세계 높이 u 를 같은 투영으로)
    const bx = 880, yOfU = u => P3(cam, [0, u, 0])[1], y0 = yOfU(0);
    const blk = P.block, blocking = t >= blk && t < blk + 1.4;
    const tryU = wave && wave.blocked ? Math.min(M.ELL, M.uStar(M.NFIT) + (M.ELL - M.uStar(M.NFIT)) * smooth(wave.q / 0.9)) : M.uStar(n % 1 === 0 ? n : n);
    const uNow = wave && wave.blocked && t < blk + 1.4 ? tryU : uStarCont(Math.min(n, M.NFIT));
    const barA = fadeIn(t, P.focus.clock + 0.4 + (ctx.tl.at('s11') - P.focus.clock), 0.5);
    withAlpha(c, barA, () => {
      unlitRect(stage, bx - 70, yOfU(1.55) - 30, 140, y0 - yOfU(1.55) + 60, 1);
      rect(c, bx - 16, yOfU(1.5), 32, y0 - yOfU(1.5), 10, rgba('#000', 0.45), rgba(PAL.border, 1), 2);
      rect(c, bx - 16, yOfU(uNow), 32, y0 - yOfU(uNow), 10, '#C9B39A');
      for (const u of [0, 0.5, 1.0]) { line(c, [[bx - 26, yOfU(u)], [bx - 16, yOfU(u)]], PAL.muted, 2); stage.text(u.toFixed(1), bx - 34, yOfU(u), {size: 20, color: PAL.muted, align: 'right'}); }
      line(c, [[bx - 34, yOfU(M.ELL)], [bx + 34, yOfU(M.ELL)]], blocking ? PAL.ink : PAL.warmHi, 4, {cap: 'butt'});
      stage.text('한계', bx + 4, yOfU(M.ELL) - 22, {size: 22, weight: 700, color: PAL.warmHi, align: 'center'});
      stage.text('시계', bx, y0 + 30, {size: 24, weight: 700, color: PAL.muted, align: 'center'});
      stage.text(uNow.toFixed(2), bx - 30, yOfU(uNow) - 22, {size: 26, weight: 700, color: PAL.ink, align: 'right'});
      // 막대 끝 = 지금 테두리의 높이 — 무대의 테두리와 이어 주는 옅은 선
      line(c, [[d.rimR[0] + 8, d.rimR[1]], [bx - 20, yOfU(uNow)]], rgba(PAL.muted, 0.3), 1.5, {dash: [4, 6]});
    });
    if (blocking) { const f = 1 - (t - blk) / 1.4; lit(stage, cc => { cc.save(); cc.globalAlpha *= f; line(cc, [[bx - 34, yOfU(M.ELL)], [bx + 34, yOfU(M.ELL)]], PAL.warm, 5); cc.restore(); }, {gain: 0.6}); }
    // 큰 숫자: 중력자 수 n
    const nA = fadeIn(t, P.grav[0].t, 0.4);
    uText(stage, '중력자', 210, 360, {size: 28, weight: 500, color: PAL.muted, align: 'center', alpha: nA});
    bigNum(stage, String(Math.floor(Math.min(n, M.NFIT) + 1e-6)), 210, 430, {size: 96, color: PAL.coolHi, alpha: nA});
    if (t >= blk - 0.2) note(stage, '9번째: 한계를 넘음', 210, 500, {size: 24, color: PAL.ink, alpha: fadeIn(t, blk, 0.3)});
    note(stage, '점선: 중력자 0개', 210, 1196, {size: 22, alpha: ghostA, align: 'center'});
    void s0;
  },

  finite(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, s0 = ctx.scene.start;
    const camZ = camOf({scale: lerp(230, 140, easeInOut(clamp((t - s0) / 1.5))), cy: lerp(980, 730, easeInOut(clamp((t - s0) / 1.5))), tilt: 0.5});
    const sites = [{x: 0, z: 0, a: 1, lit: 0.5}];
    P.sew.forEach(s => sites.push({x: s.x, z: s.z, a: smooth((t - s.t + 0.25) / 0.25), lit: 0.5}));
    // 조각보를 훑는 빛(같은 계산이 조각마다): 가로로 지나감
    for (const st of sites) { let L = 0.5; for (const sw of P.finite.sweeps) { const x = -4 + (t - sw) * 5; L = Math.max(L, 0.5 + 0.5 * Math.exp(-((st.x - x) ** 2) / 1.2)); } st.lit = L; }
    floorGrid(stage, camZ, -1, 7, 0.08);
    const ds = patchwork(stage, camZ, sites, {nu: 4, np: 22});
    // 이음매 섬광
    for (const s of P.sew) { const f = Math.max(0, 1 - Math.abs(t - s.t) / 0.3); if (f > 0) { const dd = Math.hypot(s.x, s.z), cp = P3(camZ, [s.x * 0.5, 0, s.z * 0.5]); flash(stage, cp, f, 10); void dd; } }
    void ds;
    // 계기: 어림하지 않음(난색) Z_N, 먼저 어림(한색) H_N 은 잔상 → s16 에 다시
    gaugePanel(stage, 1);
    const lgZ = lgAt(P.terms, t), lgH = lgAt(P.approx, t, 0.2);
    gaugeLine(stage, 'H', 6, {ghost: true, a: 0.9});
    if (lgH >= 0) gaugeLine(stage, 'H', lgH);
    const g = gaugeLine(stage, 'Z', lgZ);
    stage.text('어림하지 않음', GA.x0 + 16, GA.py0 + 22, {size: 22, weight: 700, color: PAL.warm});
    stage.text('먼저 어림', GA.x0 + 200, GA.py0 + 22, {size: 22, weight: 700, color: PAL.cool, alpha: 0.85});
    if (g) { uText(stage, '합', 540, 360, {size: 28, weight: 500, color: PAL.muted, align: 'center'}); bigNum(stage, g.val.toFixed(3), 540, 420, {size: 80, color: PAL.warmHi}); }
    if (lgH > 2.5) note(stage, '↑ 끝없이', Math.min(gx(Math.min(lgH, 6)) - 10, 590), GA.y0 - 34, {size: 24, color: PAL.coolHi, weight: 700, alpha: fadeIn(lgH, 2.5, 0.3)});
  },

  blackhole(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, BH = P.bh;
    const r = M.bhRadius(P, t), A = bhArea(r), S = M.S_of_A(A);
    const cx = 500, cy = 700, R = 190 * r;
    // 블랙홀(무광 검은 공) + 표면의 칸(넓이 1칸 = 플랑크 넓이 4칸 묶음의 그림)
    const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#2C2B30'); g.addColorStop(0.75, '#141416'); g.addColorStop(1, '#0B0B0C');
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = g; c.fill();
    ring(c, cx, cy, R, rgba(PAL.muted, 0.35), 2);
    const cells = Math.floor(S), nLat = Math.max(3, Math.round(Math.sqrt(cells / 2))), nLon = Math.max(6, Math.round(cells / nLat));
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    for (let i = 1; i < nLat; i++) { const la = -Math.PI / 2 + Math.PI * i / nLat, yy = cy + R * Math.sin(la) * 0.98, rx = R * Math.cos(la); c.beginPath(); c.ellipse(cx, yy, rx, rx * 0.18, 0, 0, Math.PI); c.strokeStyle = rgba(PAL.muted, 0.28); c.lineWidth = 1.4; c.stroke(); }
    for (let j = 0; j < nLon; j++) { const lo = Math.PI * j / nLon - Math.PI / 2 + 0.12; const rx = Math.abs(R * Math.sin(lo)); c.beginPath(); c.ellipse(cx, cy, rx, R, 0, -Math.PI / 2, Math.PI / 2, Math.sin(lo) < 0); c.strokeStyle = rgba(PAL.muted, 0.28); c.lineWidth = 1.4; c.stroke(); }
    c.restore();
    // 떨어지는 덩어리(무광): 오른쪽 위에서 휘어 들어감 → 지평선에 닿으면 사라지고 넓이가 커짐
    for (const f of BH.falls) {
      const q = (t - f.t) / BH.fallDur; if (q < 0 || q > 1) continue;
      const a0 = -0.6 + q * 2.4, d = lerp(2.2, 1.0, q * q) * 190 * r;
      const x = cx + d * Math.cos(a0) * 1.0, y = cy + d * Math.sin(a0) * 0.55;
      circle(c, x, y, 22 * (1 - 0.4 * q), PAL.mass);
    }
    note(stage, '지평선의 넓이 A', cx, cy + R + 40, {size: 26});
    // 큰 글: S = A / 4
    bigNum(stage, 'S = A / 4', 540, 390, {size: 76, color: PAL.warmHi});
    // 계기: 직선 S = A/4 위의 점
    const X0 = 200, X1 = 860, Y0 = 1030, Y1 = 1196, Amax = bhArea(1.45);
    unlitRect(stage, GA.px0, GA.py0, GA.px1 - GA.px0, GA.py1 - GA.py0, 1);
    rect(c, GA.px0, GA.py0, GA.px1 - GA.px0, GA.py1 - GA.py0, 12, rgba('#141416', 0.92), rgba(PAL.border, 1), 2);
    const sx = a => X0 + a / Amax * (X1 - X0), sy = s => Y1 - s / M.S_of_A(Amax) * (Y1 - Y0);
    line(c, [[X0, Y1], [X1, Y1]], rgba(PAL.muted, 0.5), 1.5); line(c, [[X0, Y0], [X0, Y1]], rgba(PAL.muted, 0.5), 1.5);
    line(c, [[sx(0), sy(0)], [sx(Amax), sy(M.S_of_A(Amax))]], rgba(PAL.warmHi, 0.55), 2.4);
    stage.text('넓이 A', X1, Y1 + 22, {size: 21, color: PAL.muted, align: 'right'}); stage.text('S', X0 - 16, Y0 + 4, {size: 22, weight: 700, color: PAL.muted, align: 'right'});
    stage.text('상태 수의 로그', X0 + 14, GA.py0 + 22, {size: 21, color: PAL.muted});
    const pp = [sx(A), sy(S)];
    lit(stage, cc => { circle(cc, pp[0], pp[1], 9, PAL.warm); circle(cc, pp[0], pp[1], 4, CORE(PAL.warm)); }, {gain: 0.85});
    stage.text(`A ${A.toFixed(0)} → S ${S.toFixed(1)}`, pp[0] + 18, pp[1] - 22, {size: 22, weight: 700, color: PAL.ink});
  },

  limits(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, L = P.limits;
    const steps = ['공개', '동료 심사', '재확인', '실험'], xs = [190, 410, 630, 850], y = 470;
    line(c, [[xs[0], y], [xs[3], y]], rgba(PAL.border, 1), 6);
    steps.forEach((s, i) => {
      const hi = i === 0, ex = i === 3 && t >= L.exp;
      rect(c, xs[i] - 92, y - 40, 184, 80, 14, hi ? '#5A4E44' : '#2A2A2F', ex ? rgba(PAL.ink, 0.5 + 0.3 * Math.sin((t - L.exp) * 4)) : rgba(PAL.border, 1), ex ? 3 : 2);
      stage.text(s, xs[i], y + 2, {size: 28, weight: 700, color: hi ? PAL.ink : PAL.muted, align: 'center'});
    });
    // 표식: '공개'에 서 있음
    const ma = fadeIn(t, L.mark, 0.3), mk = [xs[0], y - 78];
    withAlpha(c, ma, () => poly(c, [[mk[0] - 16, mk[1] - 20], [mk[0] + 16, mk[1] - 20], [mk[0], mk[1] + 6]], PAL.warmHi));
    note(stage, '지금', mk[0], mk[1] - 46, {size: 24, color: PAL.warmHi, alpha: ma});
    // 확인 점: 공개 → 심사 쪽으로 가다가 닿기 전에 흐려짐(아직 도착 전)
    for (let i = 0; i < 4; i++) {
      const ph = ((t - L.mark) * 0.35 + i / 4) % 1; if (t < L.mark) continue;
      const x = lerp(xs[0] + 96, xs[1] - 110, ph), a = smooth(ph / 0.15) * (1 - smooth((ph - 0.6) / 0.4));
      lit(stage, cc => { cc.save(); cc.globalAlpha *= a; circle(cc, x, y, 7, PAL.warmHi); circle(cc, x, y, 3, CORE(PAL.warm)); cc.restore(); }, {gain: 0.6});
    }
    // 아래: 빈 다이아몬드(빈 시공간) · 물질은 밖의 흐린 상자에
    const cam = camOf({scale: 170, cx: 400, cy: 960, tilt: 0.42});
    floorGrid(stage, cam, -1, 3, 0.10);
    const q = new DrawQueue(); const d = diamond(stage, q, cam, {litLow: 1, litUp: 1, keep: 0.45, front: 0.75, nu: 5, np: 26}); q.flush();
    eventDot(stage, d.p, PAL.ink, 8); eventDot(stage, d.qp, PAL.ink, 8);
    const ea = fadeIn(t, L.empty, 0.4);
    rect(c, 700, 760, 200, 200, 16, rgba('#2A2A2F', 0.6), rgba(PAL.border, 1), 2);
    for (let i = 0; i < 9; i++) { const xx = 740 + (i % 3) * 60 + 6 * Math.sin(t * 1.3 + i), yy = 800 + Math.floor(i / 3) * 60 + 6 * Math.cos(t * 1.1 + i * 2); circle(c, xx, yy, 13, rgba(PAL.mass, 0.75)); }
    note(stage, '물질', 800, 994, {size: 26});
    label(stage, '빈 시공간만', 400, 1196, {size: 32, color: PAL.warmHi, alpha: ea});
    void d;
  },

  close(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx, last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
    const cam = camOf({scale: 140, cy: 780, tilt: 0.5});
    const sites = [{x: 0, z: 0, a: 1, lit: 0.5}, ...M.hexRing(1).map(h => ({x: h.x, z: h.z, a: 1, lit: 0.5}))];
    for (const st of sites) { const x = -4 + (t - P.close.sweep) * 1.4; st.lit = 0.5 + 0.5 * Math.exp(-((st.x - x) ** 2) / 1.2); }
    floorGrid(stage, cam, -1, 7, 0.08);
    patchwork(stage, cam, sites, {nu: 4, np: 22});
    gaugePanel(stage, 1);
    gaugeLine(stage, 'H', 6, {ghost: true, a: 0.7});
    gaugeLine(stage, 'Z', 6);
    stage.text('어림하지 않음', GA.x0 + 16, GA.py0 + 22, {size: 22, weight: 700, color: PAL.warm});
    stage.text('먼저 어림', GA.x0 + 200, GA.py0 + 22, {size: 22, weight: 700, color: PAL.cool, alpha: 0.85});
    const ea = fadeIn(t, last.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 250, W, 250, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 250, 0, 500); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.7)'); g.addColorStop(0.85, 'rgba(9,9,11,0.7)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 250, W, 250);
        ['시공간을 빛의 길로 조각내 계산하면', '무한대가 사라진다 — 논문의 주장'].forEach((s, i) => stage.text(s, 540, 316 + i * 62, {role: 'display', weight: 700, size: 44, color: i === 1 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 1000, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 452, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, last.start, 0.5)});
      });
    }
  },
};

const bhArea = M.bhArea;
function uStarCont(n) { const a = Math.floor(n), f = n - a; return f < 1e-6 ? M.uStar(a) : lerp(M.uStar(a), M.uStar(a + 1), f); }

// ---------------------------------------------------------------- s02: 누가 무엇으로 썼나
function exchange(stage, t, P) {
  const c = stage.ctx, E = P.exch, L = [210, 720], R = [870, 720], paper = [540, 700];
  // 왼쪽: 스탠퍼드 대학 물리학자(무광 도형 — 책상과 공책), 오른쪽: OpenAI 의 인공지능(무광 상자)
  rect(c, L[0] - 120, L[1] - 30, 240, 150, 18, PAL.block); rect(c, L[0] - 120, L[1] - 30, 240, 14, 7, PAL.blockHi);
  rect(c, L[0] - 70, L[1] - 92, 140, 70, 10, '#6A635B'); for (let i = 0; i < 3; i++) line(c, [[L[0] - 50, L[1] - 72 + i * 16], [L[0] + 50, L[1] - 72 + i * 16]], rgba(PAL.ink, 0.35), 2);
  rect(c, R[0] - 100, R[1] - 110, 200, 230, 18, PAL.block); rect(c, R[0] - 100, R[1] - 110, 200, 14, 7, PAL.blockHi);
  for (let i = 0; i < 5; i++) rect(c, R[0] - 70, R[1] - 76 + i * 38, 140, 14, 6, rgba('#000', 0.35));
  // 가운데 논문(무광 종이): 답이 닿을 때마다 한 줄씩
  const nLines = E.trips.filter(tr => t >= tr.ansArr).length;
  const pw = 210, ph = 280;
  rect(c, paper[0] - pw / 2 + 8, paper[1] - ph / 2 + 8, pw, ph, 6, rgba('#000', 0.35));
  rect(c, paper[0] - pw / 2, paper[1] - ph / 2, pw, ph, 6, PAL.paper);
  stage.text('arXiv', paper[0], paper[1] - ph / 2 + 30, {size: 24, weight: 700, color: '#4A4540', align: 'center'});
  for (let i = 0; i < 6; i++) {
    const k = i < nLines ? 1 : i === nLines ? smooth((t - (E.trips[i]?.ansArr ?? 1e9)) / 0.3) : 0;
    const L2 = i < nLines ? 1 : 0;
    if (L2 || k) line(c, [[paper[0] - 78, paper[1] - 70 + i * 34], [paper[0] - 78 + 156 * (L2 || k), paper[1] - 70 + i * 34]], '#6B645C', 7, {cap: 'butt'});
  }
  // 물음 점(왼 → 오, 위로 휘는 길), 답 점(오 → 왼, 아래로 휘는 길) — 신호
  const arc = (a, b, h, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - h * Math.sin(Math.PI * u)];
  const Lp = [L[0] + 100, L[1] - 100], Rp = [R[0] - 90, R[1] - 120];
  for (const tr of E.trips) {
    for (const [s0, s1, a, b, h] of [[tr.ask, tr.askArr, Lp, Rp, 190], [tr.ans, tr.ansArr, Rp, Lp, -90]]) {
      const u = (t - s0) / (s1 - s0); if (u < 0 || u > 1) continue;
      const pts = []; for (let i = 0; i <= 12; i++) pts.push(arc(a, b, h, Math.max(0, u - 0.16 * (1 - i / 12))));
      lit(stage, cc => { line(cc, pts, rgba(PAL.warmHi, 0.7), 2.4); const e = pts[pts.length - 1]; circle(cc, e[0], e[1], 10, PAL.warm); circle(cc, e[0], e[1], 4.5, CORE(PAL.warm)); }, {gain: 0.8});
    }
  }
  // 큰 숫자: 주고받은 토큰(감사의 글 ∼400M)
  const done = E.trips.filter(tr => t >= tr.ansArr).length, last = E.trips[Math.min(done, E.K - 1)];
  const frac = (done + (done < E.K ? smooth((t - last.ask) / (last.ansArr - last.ask)) : 0)) / E.K;
  const tok = M.TOKENS * frac;
  uText(stage, '주고받은 토큰', 540, 360, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
  bigNum(stage, frac >= 1 ? '약 4억' : `${(tok / 1e8).toFixed(1)}억`, 540, 432, {size: 84, color: PAL.warmHi});
  // 이름표(누가 무엇으로)
  label(stage, '스탠퍼드 대학 물리학자', L[0], 916, {size: 28}); note(stage, 'V. Chandrasekaran', L[0], 956, {size: 26});
  label(stage, 'OpenAI의 인공지능', R[0] - 20, 916, {size: 28}); note(stage, 'GPT-6 Astra', R[0] - 20, 956, {size: 26});
  note(stage, 'arXiv 2611.34924 · 2026.11.25', paper[0], 1064, {size: 26, color: PAL.ink});
}

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), MO = P.hook.morph, last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  captionBand(stage.ctx); unlitRect(stage, 0, 1236, W, 684, 1);
  if (id === 'hook' && t < MO[1]) { posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); return; }
  topBand(stage.ctx); unlitRect(stage, 0, 0, W, 112, 1);
  if (id === 'close') { if (t < last.start - 0.6) headList(stage, t, [[-Infinity, '', '']], 1); progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? fadeIn(t, MO[1] - 0.2, 0.4) : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
