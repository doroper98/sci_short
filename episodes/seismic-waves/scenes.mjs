// 57 지진파 — 단층은 한 번 미끄러졌는데, 흔들림은 왜 두 번 올까. 사실·단순화는 brief.md, 모형은 model.mjs.
// 영상미 문법(2026-11-10): 움직이는 것은 모두 인과 사슬의 한 고리. 바위(지층 덩어리)·관측소·집·지진계·사슬의 덩어리·지구의 층은
// 면과 명암이 있는 무광 덩어리. 빛나는 것은 파의 에너지와 신호뿐 — P 앞면(난색), S 앞면(한색), 지진계 펜 끝, 경보 신호,
// 미끄러지는 순간의 작은 섬광, 지구 단면의 파면. 모두 lit() 안. 글이 빛 위에 얹히는 곳은 unlitRect.
// 난색 하나 = P파(먼저 오는 것, 미는 흔들림), 한색 하나 = S파(뒤에 오는 것, 비트는 흔들림).
// 무대 하나: 땅 단면(1 km = 6 px, 가로·세로 같은 자). 지진계 기록 띠의 시간 축 = 그 실행의 실제 초.
// 같은 시계: 파의 자리·바위의 흔들림·지진계·소리(make_sound.mjs) 모두 model.mjs 의 RUNS 에서 나온다.
// 움직임의 방향: P 는 나아가는 방향(r̂), S 는 직각(θ̂) — model.displacement. 연속 프레임으로 확인(brief.md 검증 메모).
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, rand, line, circle, ring, rect, poly, withAlpha, lit, ensureGain, arrow,
  progressBar, TAU,
} from '../../pipeline/render/index.mjs';
import * as M from './model.mjs';

export const theme = 'film';
export const look = {background: {cx: 0.45, cy: 0.40}};   // 편마다 바꾸는 것은 밝은 곳의 자리뿐(세기는 config/look.json)
export const events = [];
export const captionLayout = {};

const W = 1080;
const PAL = {
  ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#232327',
  warm: '#FF6B1A', warmHi: '#F5A066', cool: '#5BA8F0', coolHi: '#A9D2FA',
  mortar: '#211F1C', hut: '#5A5C63', hutLo: '#3A3B41', hutHi: '#7A7C84', house: '#6A655D', houseLo: '#4A463F', roof: '#3F3B36',
  water: '#34495A', waterHi: '#4A6478', block: '#6B655C', blockLo: '#4A453F', blockHi: '#8A8379', spring: '#9A958C',
  paper: '#D9D3C6', paperLo: '#A9A294', drum: '#4F4A44', drumHi: '#6E675E', ink2: '#2A2724',
  mantle: '#4B4640', mantleHi: '#5C564F', outer: '#2E3C48', outerHi: '#3A4C5B', inner: '#5E5850',
};
const ROCK = ['#57514A', '#35322D', '#665E54', '#3F3A34', '#5E574F', '#2F2C28', '#4D4740'];
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;

function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save(); gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.fillStyle = '#000'; gc.fillRect(x, y, w, h); gc.restore();
}
function panel(c, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 14, rgba(PAL.plate, a), rgba(PAL.border, 1), 2); }
/** 글 아래 빛 지도를 지우고 쓴다(빛 위에 얹히는 이름표 — 함께 밝아지지 않게) */
function uText(stage, s, x, y, o = {}) {
  const size = o.size || 28, w = s.length * size * 0.62 + 16, al = o.align || 'left';
  const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x - 8;
  unlitRect(stage, x0, y - size * 0.75, w, size * 1.5, 1);
  return stage.text(s, x, y, o);
}
function label(stage, s, x, y, o = {}) { uText(stage, s, x, y, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so, ...o}); }

// =====================================================================================================
// 카메라(세계 = 화면 좌표)
// =====================================================================================================
const CAM_FULL = {cx: 540, cy: 960, z: 1, sy: 960};
function withCam(stage, cam, fn) {
  const c = stage.ctx; c.save();
  c.translate(540 - cam.cx * cam.z, (cam.sy ?? 960) - cam.cy * cam.z); c.scale(cam.z, cam.z);
  try { fn(); } finally { c.restore(); }
}
const toScreen = (cam, p) => [540 + (p[0] - cam.cx) * cam.z, (cam.sy ?? 960) + (p[1] - cam.cy) * cam.z];
const CAM_PS = {cx: 360, cy: 820, z: 1.75, sy: 830};   // P·S 장면: 진원과 추적 알갱이 가까이
const camMix = (a, b, q) => ({cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), q)), sy: lerp(a.sy ?? 960, b.sy ?? 960, q)});

// =====================================================================================================
// 땅 단면: 지층 덩어리 격자(무광). 마디가 파에 따라 움직인다.
// =====================================================================================================
const GX = 45, GY = 30, X0 = -15 - 3 * 45, NC = 30, NR = 42;   // 마디 x = X0 + i·GX, y = SURF + j·GY
const TONE = (() => {
  // 지층: 두 줄(60 px)씩 같은 층, 층 안에서는 2~4칸씩 이어지는 덩어리(돌의 결)
  const a = [];
  for (let j = 0; j < NR; j++) {
    const band = Math.floor((j + 0.7 * Math.sin(j * 0.9)) / 2), base = ROCK[((band * 3) % ROCK.length + ROCK.length) % ROCK.length];
    for (let i = 0; i < NC; i++) {
      const run = Math.floor((i + 7 * rand(band * 11)) / (2 + Math.floor(3 * rand(band * 5 + 1))));
      const v = rand(run * 37 + band * 101);
      a.push(mix(base, v > 0.5 ? '#000000' : '#FFFFFF', 0.03 + 0.11 * Math.abs(v - 0.5) * 2));
    }
  }
  return a;
})();
/** 단면 그리기. runs: 실행 목록, o: {ampP, ampS, P, S, alpha} */
function section(stage, t, runs, o = {}) {
  const c = stage.ctx, ux = new Float32Array(NC * NR), uy = new Float32Array(NC * NR);
  for (let j = 0; j < NR; j++) for (let i = 0; i < NC; i++) {
    const k = j * NC + i, x = X0 + i * GX, y = M.SURF + j * GY;
    const [dx, dy] = M.displacement(x, y, runs, t, o);
    ux[k] = x + dx; uy[k] = j === 0 ? Math.min(y + dy, y + Math.abs(dy) * 0.0 + dy) : y + dy;
  }
  for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NC - 1; i++) {
    const a = j * NC + i, b = a + 1, d = a + NC, e = d + 1;
    c.beginPath(); c.moveTo(ux[a], uy[a]); c.lineTo(ux[b], uy[b]); c.lineTo(ux[e], uy[e]); c.lineTo(ux[d], uy[d]); c.closePath();
    c.fillStyle = TONE[a]; c.fill();
  }
  // 결: 가로 줄(층 경계)은 진하게, 세로 줄은 옅게 — 둘 다 마디를 따라 움직인다
  c.strokeStyle = rgba(PAL.mortar, 0.9); c.lineWidth = 2;
  for (let j = 1; j < NR; j++) { c.beginPath(); for (let i = 0; i < NC; i++) { const k = j * NC + i; if (i) c.lineTo(ux[k], uy[k]); else c.moveTo(ux[k], uy[k]); } c.stroke(); }
  c.strokeStyle = rgba(PAL.mortar, 0.45); c.lineWidth = 1.4;
  for (let i = 0; i < NC; i++) { c.beginPath(); for (let j = 0; j < NR; j++) { const k = j * NC + i; if (j) c.lineTo(ux[k], uy[k]); else c.moveTo(ux[k], uy[k]); } c.stroke(); }
  // 땅 표면 선(옅은 밝은 테)
  c.beginPath(); for (let i = 0; i < NC; i++) { if (i) c.lineTo(ux[i], uy[i]); else c.moveTo(ux[i], uy[i]); }
  c.strokeStyle = '#7A746A'; c.lineWidth = 3; c.stroke();
  return {ux, uy};
}
const surfDisp = (x, runs, t, o) => M.displacement(x, M.SURF, runs, t, o);

/** 파의 앞면(빛 — 에너지가 지나는 자리). 땅 표면 아래만. */
function fronts(stage, t, runs, o = {}) {
  for (const R of runs) {
    const tau = R.tau(t); if (tau <= 0) continue;
    const draw = (rad, col, w, gain) => {
      if (rad < 4 || rad > 2400) return;
      lit(stage, cc => {
        cc.save(); cc.beginPath(); cc.rect(-200, M.SURF + 2, 1500, 1400); cc.clip();
        ring(cc, M.HX, M.HY, rad, rgba(col, 0.9), w); ring(cc, M.HX, M.HY, rad, rgba(CORE(col), 0.95), w * 0.4);
        cc.restore();
      }, {gain});
    };
    const pa = o.P === false || !R.P ? 0 : (o.pAlpha ?? 1), sa = o.S === false || !R.S ? 0 : (o.sAlpha ?? 1);
    if (pa > 0) withAlpha(stage.ctx, (o.alpha ?? 1) * pa, () => draw(M.VPX * tau, PAL.warm, 5, 0.75 * pa));
    if (sa > 0) withAlpha(stage.ctx, (o.alpha ?? 1) * sa, () => draw(M.VSX * tau, PAL.cool, 6, 0.75 * sa));
  }
}

/** 단층과 진원(미끄러짐 순간 작은 섬광). slip 0..1, flash 0..1, strain 0..1(미끄러지기 전 쌓이는 힘) */
function fault(stage, slip, flash, strain = 0, o = {}) {
  const c = stage.ctx, ang = -1.05, L = 80, dx = Math.cos(ang) * L, dy = Math.sin(ang) * L;
  const off = 7 * slip * (o.big ?? 1);
  // 두 쪽 덩어리 테(어긋남) — 무광 선
  line(c, [[M.HX - dx - off * 0.5, M.HY - dy], [M.HX + dx - off * 0.5, M.HY + dy]], '#15130F', 5);
  line(c, [[M.HX - dx + off * 0.5, M.HY - dy + 2], [M.HX + dx + off * 0.5, M.HY + dy + 2]], '#15130F', 3);
  if (strain > 0.02) {
    const s = strain;
    withAlpha(c, s, () => {
      arrow(c, [M.HX - 34, M.HY + 30], [M.HX - 34 + 18 * s, M.HY + 30 - 34 * s], PAL.ink, 4);
      arrow(c, [M.HX + 34, M.HY - 30], [M.HX + 34 - 18 * s, M.HY - 30 + 34 * s], PAL.ink, 4);
    });
  }
  if (flash > 0) lit(stage, cc => { circle(cc, M.HX, M.HY, 5 + 5 * (1 - flash), rgba(PAL.warm, 0.7 * flash)); circle(cc, M.HX, M.HY, 3, rgba(CORE(PAL.warm), flash)); }, {gain: 0.8 * flash});
  circle(c, M.HX, M.HY, 5, '#1A1816');
}
function runSlip(R, t) { const tau = R.tau(t); return tau < 0 ? 0 : clamp(tau / 2); }
function runFlash(R, t) { const tau = R.tau(t); if (tau < 0) return 0; const age = (t - R.t0); return age < 0 ? 0 : clamp(1 - age / 0.5); }

// ---------- 땅 위의 것(무광): 관측소, 집 ----------
function station(stage, x, runs, t, o = {}) {
  const c = stage.ctx, [dx, dy] = surfDisp(x, runs, t, o), X = x + dx, Y = M.SURF + dy;
  rect(c, X - 26, Y - 44, 52, 44, 4, PAL.hut, PAL.hutLo, 2);
  poly(c, [[X - 30, Y - 44], [X + 30, Y - 44], [X, Y - 64]], PAL.hutLo);
  rect(c, X - 9, Y - 26, 18, 26, 2, PAL.hutLo);
  if (o.ring) withAlpha(c, o.ring, () => ring(c, X, Y - 32, 52, PAL.ink, 2.5));
  return [X, Y];
}
function houses(stage, x, runs, t, n = 3, o = {}) {
  const c = stage.ctx;
  for (let k = 0; k < n; k++) {
    const hx = x + (k - (n - 1) / 2) * 40, h = 30 + 12 * rand(k * 5 + x);
    const [dx, dy] = surfDisp(hx, runs, t, o), X = hx + dx, Y = M.SURF + dy;
    rect(c, X - 15, Y - h, 30, h, 2, PAL.house, PAL.houseLo, 1.5);
    poly(c, [[X - 18, Y - h], [X + 18, Y - h], [X, Y - h - 14]], PAL.roof);
  }
}
/** 거리 자(진앙에서 km) — 땅 표면 바로 위 */
function ruler(stage, a = 1, marks = [50, 100, 150]) {
  const c = stage.ctx, y = M.SURF - 6;
  withAlpha(c, a, () => {
    for (let k = 0; k <= 15; k++) { const x = M.xAt(k * 10); line(c, [[x, y], [x, y - (k % 5 ? 6 : 12)]], rgba(PAL.muted, 0.8), 2); }
    marks.forEach(km => stage.text(`${km} km`, M.xAt(km), M.SURF + 26, {size: 24, weight: 700, color: PAL.ink, align: 'center', ...so}));
    stage.text('진앙', M.HX, y - 26, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
  });
}

// =====================================================================================================
// 지진계 기록 띠(계기) — 시간 축 = 실제 초. items: [{dkm, run, amp, y, ghost, name}]
// =====================================================================================================
const STRIP = {x: 70, y: 312, w: 940, h: 236, T: 40};
function strip(stage, t, items, o = {}) {
  const c = stage.ctx, S = {...STRIP, ...(o.box || {})}, px = (S.w - 120) / (o.T ?? S.T), x0 = S.x + 96;
  unlitRect(stage, S.x, S.y, S.w, S.h, 1);
  panel(c, S.x, S.y, S.w, S.h, 0.92);
  // 눈금(초)
  const T = o.T ?? S.T;
  for (let s = 0; s <= T; s += 5) { const x = x0 + s * px; line(c, [[x, S.y + S.h - 30], [x, S.y + S.h - 22]], PAL.muted, 2); if (s % 10 === 0) stage.text(`${s}`, x, S.y + S.h - 12, {size: 24, color: PAL.muted, align: 'center'}); }
  stage.text('초', x0 + T * px + 30, S.y + S.h - 12, {size: 24, color: PAL.muted, align: 'center'});
  for (const it of items) {
    const tau = it.run.tau(t), y0 = it.y ?? (S.y + 100), amp = (it.scale ?? 48) * (it.amp ?? 1);
    stage.text(it.name ?? '', S.x + 50, y0, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    line(c, [[x0, y0], [x0 + T * px, y0]], rgba(PAL.border, 1), 1.5);
    const end = it.frozen ?? tau; if (end < 0 && it.frozen == null) continue;
    const pts = [];
    for (let s = 0; s <= Math.min(T, end); s += 0.06) pts.push([x0 + s * px, y0 - amp * M.seismo(it.dkm, s, it.ampRun ?? 1)]);
    if (pts.length > 1) line(c, pts, it.ghost ? rgba(PAL.muted, 0.55) : PAL.ink, it.ghost ? 2 : 2.4);
    // 도착 표시 — 그 순간에 찍힌다(같은 시계)
    const ma = it.marks ?? 1;
    if (ma > 0 && !it.ghost) for (const [tt, col, nm] of [[M.tP(it.dkm), PAL.warm, it.pName], [M.tS(it.dkm), PAL.cool, it.sName]]) {
      if (end >= tt && tt <= T) {
        const x = x0 + tt * px, a = ma * clamp((end - tt) * 3);
        withAlpha(c, a, () => { line(c, [[x, y0 - 52], [x, y0 + 40]], col, 3); if (nm) stage.text(nm, x, y0 - 66, {size: 26, weight: 700, color: col, align: 'center', ...so}); });
      }
    }
    if (!it.ghost && it.frozen == null && tau >= 0 && tau <= T) {
      const yy = y0 - amp * M.seismo(it.dkm, tau, it.ampRun ?? 1), xx = x0 + tau * px;
      lit(stage, cc => { circle(cc, xx, yy, 6, rgba(PAL.warmHi, 0.9)); circle(cc, xx, yy, 3, '#FFF4E8'); }, {gain: 0.5});
    }
  }
  return {x0, px};
}

// =====================================================================================================
// 포스터(0초 프레임 = 썸네일): 흰 물음 위, 주제어(지진파)가 가장 크게. 시리즈 아님. 답은 쓰지 않는다.
// =====================================================================================================
const POSTER = {q: ['단층은 한 번 미끄러졌는데', '흔들림은 왜 두 번 올까?'], a: '지진파', qy: 232, ay: 500, QS: 62, AS: 170};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 0.45 + 30;
  if (q < 1) unlitRect(stage, 0, 118, W, yBot - 118, 1);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.45)'); g.addColorStop(0.85, 'rgba(9,9,11,0.45)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 46, q), LH = POSTER.QS * 1.3 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else withAlpha(c, 1 - smooth((q - 0.55) / 0.45), () => stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 960}));
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.ay, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa}));
}
const MORPH = tl => [tl.sentence('s01').end + 0.1, tl.sentence('s01').end + 1.0];

// =====================================================================================================
// 머리글
// =====================================================================================================
function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx;
  if (Math.max(kicker ? aK : 0, title ? aT : 0) > 0.01) unlitRect(stage, 0, 118, W, 150, 1);
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warmHi, align: 'center', tracking: 1.5, maxWidth: 940, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: PAL.ink, align: 'center', maxWidth: 960, ...so}));
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
    case 'hook': return [[-Infinity, '실제 약 30초 · 빠르게'], [2.0, '되감기'], [3.4, '단층에 힘이 쌓인다 · 오랜 세월을 줄여서'], [5.5, '실제 약 40초 · 빠르게', '한 번 미끄러졌는데, 두 번'], [a('s03'), '같은 지진 다시 · 확대 · 빠르게', '바위는 제자리에서 흔들린다']];
    case 'origin': return [[-Infinity, '말의 뿌리', '지진학 seismology'], [a('s05'), '1900 · 올덤 · 기록은 빠르게', '먼 곳의 지진 기록'], [a('s06'), '도착 순서로 붙인 이름', 'P파와 S파']];
    case 'essence': return [[-Infinity, '바위 한 줄을 확대 · 용수철은 비유', '되돌아가려는 힘'], [a('s08'), '바위 한 줄을 확대 · 용수철은 비유', '이웃으로 넘겨준다'], [a('s09'), '같은 줄, 넘겨주는 방법만 다르게', '미는 흔들림이 먼저']];
    case 'pwave': return [[-Infinity, '실제 약 17초 · 빠르게', 'P파 — 앞뒤로'], [a('s11'), '바위와 물 · 용수철은 비유', 'P파는 물도 지난다'], [a('s12'), '실제 빠르기 그대로', '1초에 약 6 km']];
    case 'swave': return [[-Infinity, '실제 약 26초 · 빠르게', 'S파 — 직각으로'], [a('s14'), '실제 빠르기 그대로 · 같은 시계', '1초에 약 3.5 km'], [a('s15'), '바위와 물 · 용수철은 비유', 'S파는 물을 건너지 못한다']];
    case 'speed': return [[-Infinity, '지진의 크기만 바꿈 · 빠르게', '큰 지진도 같은 때 도착']];
    case 'distance': return [[-Infinity, '관측소의 거리만 바꿈 · 빠르게', '멀수록 간격이 벌어진다'], [a('s18'), '가까운 지진의 어림', '간격 1초 ≈ 8 km'], [a('s19'), '진원에서 100 km', 'S파가 12초쯤 늦게']];
    case 'warning': return [[-Infinity, '실제 약 36초 · 빠르게', '지진조기경보'], [a('s21'), '예측이 아니다', '이미 난 지진을 빨리 알린다']];
    case 'core': return [[-Infinity, '지구 단면 · 실제 약 30분 · 빠르게', 'S파의 그늘'], [a('s23'), 'P만 다시 · 실제 약 23분 · 빠르게', '바깥 핵은 액체']];
    case 'close': return [[-Infinity, '정리', '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1180, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.2, 'rgba(8,8,10,0.5)'); g.addColorStop(0.4, 'rgba(8,8,10,0.45)'); g.addColorStop(0.65, 'rgba(8,8,10,0.15)'); g.addColorStop(1, 'rgba(8,8,10,0.15)'); c.fillStyle = g; c.fillRect(0, 1180, W, 740); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }

// =====================================================================================================
// 추적 알갱이(단면의 마디 하나): 제자리 점선 원 + 지나온 자리 + 방향 화살표
// =====================================================================================================
const TRK = M.TRK;
function tracker(stage, t, runs, o = {}, cam = CAM_FULL) {
  const c = stage.ctx, at = tt => { const [dx, dy] = M.displacement(TRK.x, TRK.y, runs, tt, o); return toScreen(cam, [TRK.x + dx, TRK.y + dy]); };
  const home = toScreen(cam, [TRK.x, TRK.y]), pts = [];
  for (let k = 40; k >= 0; k--) pts.push(at(t - k * 0.05));
  ring(c, home[0], home[1], 12, rgba(PAL.ink, 0.7), 2);   // 제자리
  line(c, pts, rgba(PAL.ink, 0.55), 2.5);
  const [X, Y] = at(t); circle(c, X, Y, 11, PAL.ink); circle(c, X, Y, 5, '#2A2724');
  return [X, Y];
}
function dirArrows(stage, a, kind, cam = CAM_FULL) {
  if (a <= 0) return;
  const c = stage.ctx, col = kind === 'P' ? PAL.warmHi : PAL.coolHi, [hx, hy] = toScreen(cam, [TRK.x, TRK.y]);
  if (kind === 'P') unlitRect(stage, hx - 80, hy - 135, 160, 90, 1); else unlitRect(stage, hx - 150, hy - 125, 140, 200, 1);
  unlitRect(stage, hx + 60, hy + 70, 200, 76, 1);
  withAlpha(c, a, () => {
    arrow(c, [hx + 80, hy + 90], [hx + 230, hy + 90], PAL.muted, 4);
    stage.text('나아가는 방향', hx + 155, hy + 124, {size: 28, weight: 500, color: PAL.ink, align: 'center', ...so});
    if (kind === 'P') { arrow(c, [hx, hy - 70], [hx + 56, hy - 70], col, 5); arrow(c, [hx, hy - 70], [hx - 56, hy - 70], col, 5); stage.text('앞뒤로', hx, hy - 110, {size: 32, weight: 700, color: col, align: 'center', ...so}); }
    else { arrow(c, [hx - 80, hy], [hx - 80, hy - 60], col, 5); arrow(c, [hx - 80, hy], [hx - 80, hy + 60], col, 5); stage.text('직각으로', hx - 80, hy - 96, {size: 32, weight: 700, color: col, align: 'center', ...so}); }
  });
}

// =====================================================================================================
// 사슬(확대 — 용수철은 비유): 덩어리 n 개, 물 칸은 알갱이 무리
// =====================================================================================================
function chainShape(dt0) { return dt0 <= 0 || dt0 >= 1.1 ? 0 : Math.sin(Math.PI * dt0 / 1.1) * Math.exp(-dt0 * 0.4); }
function zig(c, a, b, col, w, n = 7, amp = 9, alongX = true) {
  const pts = [a];
  for (let k = 1; k < n; k++) { const q = k / n, s = k % 2 ? 1 : -1; pts.push([lerp(a[0], b[0], q) + (alongX ? 0 : s * amp), lerp(a[1], b[1], q) + (alongX ? s * amp : 0)]); }
  pts.push(b); line(c, pts, col, w);
}
function chainRow(stage, t, run, y, o = {}) {
  const c = stage.ctx, n = M.CHAIN.n, A = run.kind === 'push' ? 30 : 36, S = 48, pos = [];
  for (let i = 0; i < n; i++) {
    const tt = M.chainArrive(run, i), d = isFinite(tt) ? chainShape(t - tt) : 0;
    let dx = 0, dy = 0;
    const water = run.water && i >= M.CHAIN.water;
    // S 가 물 앞에서 막힘: 마지막 바위 덩어리는 반사되어 돌아가는 펄스를 받음(되튀김)
    if (run.kind === 'push') dx = A * d * (water ? 0.8 : 1); else dy = -A * d;
    if (run.kind === 'twist' && run.water && i < M.CHAIN.water) { const back = run.start + (2 * (M.CHAIN.water - 1) - i) * run.dt + 0.0; dy += -A * 0.7 * chainShape(t - back); }
    pos.push([M.CHAIN.x0 + i * M.CHAIN.dx + dx, y + dy, water]);
  }
  withAlpha(c, o.alpha ?? 1, () => {
    if (run.water) { const xw = M.CHAIN.x0 + (M.CHAIN.water - 0.5) * M.CHAIN.dx; rect(c, xw, y - 70, 1000 - xw, 140, 18, rgba(PAL.water, 0.55), rgba(PAL.waterHi, 0.6), 2); }
    for (let i = 0; i < n - 1; i++) {
      const [ax, ay, wa] = pos[i], [bx, by, wb] = pos[i + 1];
      if (wb) continue;   // 물 알갱이 사이에는 용수철 없음(옆으로 붙잡는 힘이 없다)
      zig(c, [ax + S / 2, ay], [bx - S / 2, by], PAL.spring, 3, 7, 9);
    }
    for (let i = 0; i < n; i++) {
      const [x, yy, wa] = pos[i];
      if (wa) { for (let k = 0; k < 3; k++) { const ox = (k - 1) * 18, oy = (k % 2 ? 1 : -1) * 14; circle(c, x + ox, yy + oy, 15, PAL.waterHi); circle(c, x + ox - 4, yy + oy - 4, 6, mix(PAL.waterHi, '#FFFFFF', 0.15)); } }
      else { rect(c, x - S / 2, yy - S / 2, S, S, 6, PAL.block, PAL.blockLo, 2); rect(c, x - S / 2 + 4, yy - S / 2 + 4, S - 8, 10, 3, rgba(PAL.blockHi, 0.6)); }
    }
    // 펄스 앞(빛 — 흔들림이 넘어가는 자리): 지금 닿은 덩어리 아래 작은 점
    const col = run.kind === 'push' ? PAL.warm : PAL.cool;
    for (let i = 0; i < n; i++) {
      const tt = M.chainArrive(run, i); if (!isFinite(tt)) continue;
      const age = t - tt; if (age < 0 || age > 0.6) continue;
      const q = 1 - age / 0.6, [x, yy] = pos[i];
      lit(stage, cc => { circle(cc, x, y + 48 + (run.kind === 'twist' ? 0 : 0), 7, rgba(col, 0.9 * q)); circle(cc, x, y + 48, 3, rgba(CORE(col), q)); }, {gain: 0.6 * q});
    }
  });
  return pos;
}

// =====================================================================================================
// 지구 단면
// =====================================================================================================
const EC = {x: 540, y: 780, R: 410};
const eS = EC.R / M.RE;
const eP = p => [EC.x + p.x * eS, EC.y - p.y * eS];
function earth(stage, o = {}) {
  const c = stage.ctx;
  circle(c, EC.x, EC.y + 8, EC.R + 4, 'rgba(0,0,0,0.35)');
  const g = c.createRadialGradient(EC.x - 120, EC.y - 160, 40, EC.x, EC.y, EC.R);
  g.addColorStop(0, PAL.mantleHi); g.addColorStop(1, PAL.mantle); c.fillStyle = g; c.beginPath(); c.arc(EC.x, EC.y, EC.R, 0, TAU); c.fill();
  const go = c.createRadialGradient(EC.x - 60, EC.y - 80, 10, EC.x, EC.y, M.RCMB * eS);
  go.addColorStop(0, mix(PAL.outerHi, '#FFFFFF', 0.06 * (o.hiOuter ?? 0))); go.addColorStop(1, PAL.outer); c.fillStyle = go; c.beginPath(); c.arc(EC.x, EC.y, M.RCMB * eS, 0, TAU); c.fill();
  circle(c, EC.x, EC.y, M.RICB * eS, PAL.inner);
  ring(c, EC.x, EC.y, EC.R, '#7A746A', 3);
  ring(c, EC.x, EC.y, M.RCMB * eS, rgba('#8FA6B8', 0.5 + 0.4 * (o.hiOuter ?? 0)), 2 + 2 * (o.hiOuter ?? 0));
}

// =====================================================================================================
export const scenes = {
  // 결과 먼저(0~2초) → 되감기 → 힘이 쌓임 → s02 천천히 + 지진계 → s03 확대(제자리에서 흔들림)
  hook(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, runs = [R.h0, R.h1, R.h2].filter(r => r.tau(t) >= 0);
    const zq = smooth((t - 14.0) / 0.9) * (1 - smooth((t - 18.9) / 0.6));
    // 0~1.2초: 카메라가 진원(가까이)에서 물러나며 파를 따라 관측소까지 — 결과 먼저의 한 고리(파가 건너가는 길)
    const pull = smooth(t / 1.2);
    const cam0 = camMix({cx: 215, cy: 830, z: 2.8, sy: 1010}, CAM_FULL, pull);
    const cam = camMix(cam0, {cx: 600, cy: 760, z: 2.0, sy: 900}, zq);
    const cur = R.h2.tau(t) >= 0 ? R.h2 : R.h1.tau(t) >= 0 ? R.h1 : R.h0;
    withCam(stage, cam, () => {
      section(stage, t, runs);
      fronts(stage, t, runs);
      const strain = t > 3.4 && t < 5.5 ? smooth((t - 3.4) / 2.0) : 0;
      fault(stage, runSlip(cur, t), Math.max(runFlash(R.h0, t), runFlash(R.h1, t)), strain);
      station(stage, M.xAt(100), runs, t);
      houses(stage, M.xAt(100) + 90, runs, t, 3);
      ruler(stage, fadeIn(t, 6.6, 0.5) * (1 - zq), [50, 100]);
      if (zq > 0.01) withAlpha(c, zq, () => tracker2(stage, t, [R.h2]));
    });
    // 지진계 기록(포스터가 줄어든 뒤)
    const sa = fadeIn(t, 6.4, 0.5);
    if (sa > 0) withAlpha(c, sa, () => {
      strip(stage, t, [{dkm: 100, run: R.h1.tau(t) >= 0 || t > 14 ? R.h1 : R.h1, y: 420, name: '100 km', frozen: t > 14 ? 40 : null}]);
      stage.text('관측소의 지진계', STRIP.x + 24, STRIP.y + 28, {size: 24, weight: 500, color: PAL.muted});
      // 각주(읽지 않음): 표면파
      withAlpha(c, fadeIn(t, 7.2, 0.5) * fadeOut(t, 13.6, 0.5), () => stage.text('땅 표면을 따라 더 늦게 오는 표면파는 이 편에서 다루지 않음', 540, STRIP.y + STRIP.h + 30, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so}));
    });
  },

  // ---------------------------------------------------------------------------------------------------
  origin(stage, t, p, ctx) {
    const c = stage.ctx, s04 = ctx.tl.sentence('s04'), R = ORIGIN_RUN, tau = R.tau(t);
    // 낱말: seismology → seismos(흔들림)
    const wa = fadeIn(t, ctx.scene.start + 0.2, 0.5) * fadeOut(t, ctx.tl.sentence('s05').start - 0.4, 0.5);
    if (wa > 0) withAlpha(c, wa, () => {
      unlitRect(stage, 0, 380, W, 260, 1);
      const sw = stage.text('seismology', 540, 470, {role: 'display', weight: 700, size: 92, color: PAL.ink, align: 'center', ...so});
      const ua = fadeIn(t, W0(ctx, 's04', '세이스모스', -0.2), 0.4);
      withAlpha(c, ua, () => {
        line(c, [[540 - sw / 2, 520], [540 - sw / 2 + sw * 0.54, 520]], PAL.warm, 5);
        stage.text('σεισμός · 세이스모스', 540, 580, {size: 34, weight: 500, color: PAL.warmHi, align: 'center', ...so});
      });
      withAlpha(c, fadeIn(t, W0(ctx, 's04', '흔들림', -0.2), 0.4), () => stage.text('= 흔들림', 540, 632, {size: 34, weight: 700, color: PAL.ink, align: 'center', ...so}));
    });
    // 지진계(드럼): 흔들림이 펜을 흔든다, 드럼이 돈다(시간)
    drum(stage, t, R, ctx);
    void s04; void tau;
  },

  // ---------------------------------------------------------------------------------------------------
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s08 = ctx.tl.sentence('s08').start - 0.4, s09 = ctx.tl.sentence('s09').start - 0.5;
    // 작은 단면 조각(어디를 확대했는지)
    insetSection(stage, t, fadeIn(t, ctx.scene.start, 0.4) * 0.9);
    if (t < s08) {
      // s07: 한 덩어리를 누르고(41.5) 놓으면 되돌아옴, 비틀고(44.2) 놓으면 되돌아옴
      const tp = 41.5, tr = 42.5, tw = 44.2, twr = 45.0;
      const squeeze = t < tp ? 0 : t < tr ? smooth((t - tp) / 0.5) : Math.exp(-(t - tr) * 2.2) * Math.cos((t - tr) * 9);
      const skew = t < tw ? 0 : t < twr ? smooth((t - tw) / 0.4) : Math.exp(-(t - twr) * 2.2) * Math.cos((t - twr) * 7);
      const a = fadeIn(t, ctx.scene.start + 0.1, 0.4) * fadeOut(t, s08 - 0.2, 0.3);
      withAlpha(c, a, () => {
        const cx = 540, cy = 860, w0 = 240, h0 = 200, w = w0 * (1 - 0.16 * squeeze), h = h0 * (1 + 0.06 * squeeze), sk = 40 * skew;
        // 누르는 판(무광)
        const px = (w0 - w) / 2;
        rect(c, cx - w0 / 2 - 60 + px, cy - 130, 36, 260, 6, PAL.hut, PAL.hutLo, 2);
        rect(c, cx + w0 / 2 + 24 - px, cy - 130, 36, 260, 6, PAL.hut, PAL.hutLo, 2);
        poly(c, [[cx - w / 2 + sk, cy - h / 2], [cx + w / 2 + sk, cy - h / 2], [cx + w / 2 - sk, cy + h / 2], [cx - w / 2 - sk, cy + h / 2]], PAL.block, PAL.blockLo, 3);
        poly(c, [[cx - w / 2 + sk + 8, cy - h / 2 + 8], [cx + w / 2 + sk - 8, cy - h / 2 + 8], [cx + w / 2 + sk * 0.8 - 8, cy - h / 2 + 30], [cx - w / 2 + sk * 0.8 + 8, cy - h / 2 + 30]], rgba(PAL.blockHi, 0.55));
        const ka = Math.max(fadeIn(t, tp, 0.2) * fadeOut(t, tw - 0.4, 0.3), 0), kb = fadeIn(t, tw, 0.2);
        withAlpha(c, ka, () => stage.text('눌림', cx, cy + 170, {size: 32, weight: 700, color: PAL.warmHi, align: 'center', ...so}));
        withAlpha(c, kb, () => stage.text('비틀림', cx, cy + 170, {size: 32, weight: 700, color: PAL.coolHi, align: 'center', ...so}));
      });
    } else if (t < s09) {
      const a = fadeIn(t, s08, 0.4) * fadeOut(t, s09 - 0.2, 0.3);
      withAlpha(c, a, () => { pusher(stage, t, M.CHAIN_RUNS.push8, 820); chainRow(stage, t, M.CHAIN_RUNS.push8, 820); });
    } else {
      const a = fadeIn(t, s09, 0.4);
      withAlpha(c, a, () => {
        const P = M.CHAIN_RUNS.racePush, S = M.CHAIN_RUNS.raceTwist;
        stage.text('미는 흔들림', 130, 660, {size: 30, weight: 700, color: PAL.warmHi, ...so});
        stage.text('비트는 흔들림', 130, 930, {size: 30, weight: 700, color: PAL.coolHi, ...so});
        pusher(stage, t, P, 760); chainRow(stage, t, P, 760);
        twister(stage, t, S, 1030); chainRow(stage, t, S, 1030);
        finish(stage, t, M.chainArrive(P, M.CHAIN.n - 1), 760, PAL.warm);
        finish(stage, t, M.chainArrive(S, M.CHAIN.n - 1), 1030, PAL.cool);
        // 잔상: 미는 흔들림이 끝에 닿은 순간, 비트는 흔들림은 어디까지 왔었나
        const ta = M.chainArrive(P, M.CHAIN.n - 1);
        if (t >= ta) withAlpha(c, fadeIn(t, ta, 0.3), () => {
          const k = (ta - S.start) / S.dt, xg = M.CHAIN.x0 + k * M.CHAIN.dx;
          line(c, [[xg, 960], [xg, 1100]], rgba(PAL.warm, 0.8), 3, {dash: [8, 6]});
          stage.text('미는 흔들림이 닿았을 때', xg, 1124, {size: 26, weight: 700, color: PAL.warmHi, align: 'center', ...so});
        });
      });
    }
  },

  // ---------------------------------------------------------------------------------------------------
  pwave(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, s11 = ctx.tl.sentence('s11').start - 0.4, s12 = ctx.tl.sentence('s12').start - 0.4;
    if (t < s11 || t >= s12) {
      const run = t < s11 ? R.p1 : R.p2, runs = run.tau(t) >= 0 ? [run] : [];
      const o = {S: false, ampP: 1.6};
      const a = t < s11 ? fadeOut(t, s11 - 0.3, 0.3) : fadeIn(t, s12, 0.4);
      withAlpha(c, a, () => {
        withCam(stage, CAM_PS, () => { section(stage, t, runs, o); fronts(stage, t, runs, {S: false}); fault(stage, runSlip(run, t), runFlash(run, t)); });
        if (t < s11) { tracker(stage, t, runs, o, CAM_PS); dirArrows(stage, fadeIn(t, 64.3, 0.4), 'P', CAM_PS); }
        else speedMarks(stage, t, run, M.VPX, PAL.warm, '6 km', CAM_PS);
      });
    } else {
      const a = fadeIn(t, s11, 0.4) * fadeOut(t, s12 - 0.3, 0.3);
      withAlpha(c, a, () => { labelsRockWater(stage, 760); pusher(stage, t, M.CHAIN_RUNS.waterPush, 860); chainRow(stage, t, M.CHAIN_RUNS.waterPush, 860); });
    }
  },

  // ---------------------------------------------------------------------------------------------------
  swave(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, s14 = ctx.tl.sentence('s14').start - 0.4, s15 = ctx.tl.sentence('s15').start - 0.4;
    if (t < s15) {
      const run = t < s14 ? R.s1 : R.s2, runs = run.tau(t) >= 0 ? [run] : [];
      const o = t < s14 ? {P: false, ampS: 1.2} : {ampP: 1.2, ampS: 1.2};
      const a = t < s14 ? fadeIn(t, ctx.scene.start, 0.3) * fadeOut(t, s14 - 0.3, 0.3) : fadeIn(t, s14, 0.4) * fadeOut(t, s15 - 0.3, 0.3);
      withAlpha(c, a, () => {
        withCam(stage, CAM_PS, () => { section(stage, t, runs, o); fronts(stage, t, runs, t < s14 ? {P: false} : {pAlpha: 0.45}); fault(stage, runSlip(run, t), runFlash(run, t)); });
        if (t < s14) { tracker(stage, t, runs, o, CAM_PS); dirArrows(stage, fadeIn(t, 83.2, 0.4), 'S', CAM_PS); }
        else { speedMarks(stage, t, run, M.VSX, PAL.cool, '3.5 km', CAM_PS); ghostMarks(stage, t, run, CAM_PS); }
      });
    } else {
      const a = fadeIn(t, s15, 0.4);
      withAlpha(c, a, () => {
        labelsRockWater(stage, 640);
        stage.text('P (앞 장면과 같은 줄)', 130, 690, {size: 26, weight: 500, color: rgba(PAL.warmHi, 0.7)});
        chainRow(stage, t, M.CHAIN_RUNS.waterPushGhost, 780, {alpha: 0.35});
        stage.text('S', 130, 930, {size: 30, weight: 700, color: PAL.coolHi, ...so});
        twister(stage, t, M.CHAIN_RUNS.waterTwist, 1030); chainRow(stage, t, M.CHAIN_RUNS.waterTwist, 1030);
        const stopA = fadeIn(t, M.chainArrive(M.CHAIN_RUNS.waterTwist, M.CHAIN.water - 1) + 0.3, 0.4);
        withAlpha(c, stopA, () => { const xw = M.CHAIN.x0 + (M.CHAIN.water - 0.5) * M.CHAIN.dx; line(c, [[xw, 950], [xw, 1110]], PAL.coolHi, 4, {dash: [10, 8]}); stage.text('여기서 멈춤', xw + 120, 1140, {size: 28, weight: 700, color: PAL.coolHi, align: 'center', ...so}); });
      });
    }
  },

  // ---------------------------------------------------------------------------------------------------
  speed(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, runs = [R.qa, R.qb].filter(r => r.tau(t) >= 0);
    section(stage, t, runs); fronts(stage, t, runs);
    const big = R.qb.tau(t) >= 0;
    fault(stage, runSlip(big ? R.qb : R.qa, t), Math.max(runFlash(R.qa, t), runFlash(R.qb, t)), 0, {big: big ? 2.2 : 0.8});
    station(stage, M.xAt(100), runs, t); houses(stage, M.xAt(100) + 90, runs, t, 3);
    ruler(stage, 1, [50, 100]);
    // 진원 옆 이름표: 지금 어느 지진인가
    withAlpha(c, fadeIn(t, R.qa.t0, 0.3) * fadeOut(t, R.qb.t0 - 0.3, 0.3), () => label(stage, '작은 지진', M.HX + 120, M.HY + 120, {color: PAL.muted}));
    withAlpha(c, fadeIn(t, R.qb.t0, 0.3), () => label(stage, '큰 지진', M.HX + 120, M.HY + 120, {size: 34}));
    strip(stage, t, [
      {dkm: 100, run: R.qa, y: 420, name: '작은', amp: 1, ampRun: 0.4, ghost: big, frozen: big ? 40 : null, pName: 'P', sName: 'S'},
      ...(big ? [{dkm: 100, run: R.qb, y: 420, name: '', amp: 1, ampRun: 1.25, pName: 'P', sName: 'S'}] : []),
    ]);
    stage.text('100 km 관측소 · 지진이 난 때부터', STRIP.x + 24, STRIP.y + 28, {size: 24, weight: 500, color: PAL.muted});
  },

  // ---------------------------------------------------------------------------------------------------
  distance(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, runs = R.d1.tau(t) >= 0 ? [R.d1] : [];
    section(stage, t, runs); fronts(stage, t, runs);
    fault(stage, runSlip(R.d1, t), runFlash(R.d1, t));
    station(stage, M.xAt(50), runs, t); station(stage, M.xAt(100), runs, t);
    ruler(stage, 1, [50, 100]);
    const sx = strip(stage, t, [
      {dkm: 50, run: R.d1, y: 380, name: '50 km', scale: 34, pName: 'P', sName: 'S'},
      {dkm: 100, run: R.d1, y: 488, name: '100 km', scale: 34, pName: '', sName: ''},
    ]);
    // 간격 세기: s18 은 50 km, s19 는 100 km — 1초 칸이 하나씩 켜지고 거리 막대가 8 km 씩 자란다
    for (const [dkm, y, t0, step] of [[50, 380, COUNT.near.t0, COUNT.near.step], [100, 488, COUNT.far.t0, COUNT.far.step]]) {
      const gap = M.tS(dkm) - M.tP(dkm), n = Math.floor(gap + 1e-6), k = clamp((t - t0) / step, 0, n + 1);
      if (t < t0 + step * 0.999) continue;
      const xa = sx.x0 + M.tP(dkm) * sx.px, xb = sx.x0 + M.tS(dkm) * sx.px;
      withAlpha(c, fadeIn(t, t0 + step, 0.25) * (dkm === 50 ? fadeOut(t, COUNT.far.t0 - 0.6, 0.4) : 1), () => {
        line(c, [[xa, y + 30], [xb, y + 30]], PAL.ink, 2);
        for (let i = 0; i < Math.min(n, Math.floor(k)); i++) rect(c, xa + i * sx.px + 2, y + 24, sx.px - 4, 12, 2, PAL.ink);
        const done = k >= n;
        stage.text(done ? `${gap.toFixed(0)}초` : `${Math.floor(k)}초`, (xa + xb) / 2, y + 56, {size: 26, weight: 700, color: PAL.ink, align: 'center', ...so});
        // 거리 막대(땅 표면 위, 진앙에서): 1초 칸마다 8 km — 다 세면 실제 거리
        const kmShown = done ? dkm : 8 * Math.floor(k), xEnd = M.xAt(kmShown);
        rect(c, M.HX, M.SURF - 90, Math.max(0, xEnd - M.HX), 12, 3, rgba(PAL.ink, 0.85));
        stage.text(`약 ${kmShown} km`, Math.max(M.HX + 60, xEnd), M.SURF - 112, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so});
      });
    }
    // s19 큰 숫자
    const bigA = fadeIn(t, W0(ctx, 's19', '십이초', -0.1), 0.3);
    if (bigA > 0) withAlpha(c, bigA, () => { unlitRect(stage, 560, 1060, 480, 160, 1); stage.text('12초', 800, 1130, {role: 'display', weight: 700, size: 120, color: PAL.coolHi, align: 'center', ...so}); stage.text('S파가 늦게 닿는 시간 · 100 km', 800, 1210, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so}); });
  },

  // ---------------------------------------------------------------------------------------------------
  warning(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, run = R.w1, runs = run.tau(t) >= 0 ? [run] : [], tau = run.tau(t), Wn = M.WARN;
    section(stage, t, runs); fronts(stage, t, runs);
    fault(stage, runSlip(run, t), runFlash(run, t));
    const [nx, ny] = station(stage, M.xAt(Wn.near), runs, t);
    houses(stage, M.xAt(Wn.near) + 70, runs, t, 2);
    houses(stage, M.xAt(Wn.city), runs, t, 4);
    ruler(stage, 1, [20, 100]);
    // 분석 막대(관측소 위)
    if (tau >= Wn.detect) {
      const q = clamp((tau - Wn.detect) / Wn.analysis);
      panel(c, nx - 70, ny - 150, 140, 40, 0.92);
      rect(c, nx - 62, ny - 140, 124 * q, 20, 4, PAL.warmHi);
      stage.text(q < 1 ? '분석' : '경보', nx, ny - 172, {size: 26, weight: 700, color: PAL.warmHi, align: 'center', ...so});
    }
    // 경보 신호: 관측소 → 도시(통신, 설명용 선)
    if (tau >= Wn.alert) {
      const q = clamp((tau - Wn.alert) / Wn.link), xa = nx, xb = M.xAt(Wn.city), ya = ny - 120, yb = M.SURF - 150;
      const pts = []; for (let k = 0; k <= 30; k++) { const s = k / 30; pts.push([lerp(xa, xb, s), lerp(ya, yb, s) - 80 * Math.sin(Math.PI * s)]); }
      line(c, pts, rgba(PAL.warm, 0.35), 2, {dash: [8, 8]});
      const m = Math.floor(q * 30), head = pts.slice(Math.max(0, m - 6), m + 1);
      if (q < 1 && head.length > 1) lit(stage, cc => { line(cc, head, PAL.warm, 6); line(cc, head, CORE(PAL.warm), 2.4); }, {gain: 0.8});
    }
    // 도시의 계기: S파까지 남은 초(같은 시계)
    const cx = M.xAt(Wn.city), cy = M.SURF - 130;
    if (tau >= Wn.cityAlert) {
      const left = Math.max(0, Wn.cityS - tau);
      unlitRect(stage, cx - 130, cy - 50, 260, 100, 1);
      panel(c, cx - 130, cy - 50, 260, 100, 0.94);
      stage.text(left > 0 ? `S파까지 ${Math.ceil(left)}초` : 'S파 도착', cx, cy - 8, {role: 'display', weight: 700, size: 40, color: left > 0 ? PAL.ink : PAL.coolHi, align: 'center'});
      stage.text('경보를 받은 도시 · 100 km', cx, cy + 32, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    }
    // 가까운 곳: 경보보다 S파가 먼저
    if (tau >= Wn.nearS) withAlpha(c, fadeIn(t, run.timeOf(Wn.nearS), 0.3), () => { label(stage, '가까운 곳은', M.xAt(Wn.near) + 70, M.SURF + 70, {size: 26, color: PAL.coolHi}); label(stage, 'S파가 경보보다 먼저', M.xAt(Wn.near) + 70, M.SURF + 104, {size: 26, color: PAL.coolHi}); });
    // 시간표(띠): 실제 초 — 지진 → P 감지 → 경보 → 도시의 S
    warnStrip(stage, t, tau, ctx);
  },

  // ---------------------------------------------------------------------------------------------------
  core(stage, t, p, ctx) {
    const c = stage.ctx, CR = M.CORE_RUN, s23 = ctx.tl.sentence('s23').start - 0.3;
    const ea = fadeIn(t, ctx.scene.start, 0.5);
    withAlpha(c, ea, () => earth(stage, {hiOuter: fadeIn(t, W0(ctx, 's23', '바깥', -0.2), 0.5)}));
    // 어디서 왔는지: 앞의 단면은 지구 껍질의 아주 작은 조각
    withAlpha(c, fadeOut(t, ctx.scene.start + 1.4, 0.5), () => { rect(c, EC.x - 14, EC.y - EC.R - 4, 28, 10, 2, null, PAL.ink, 2); label(stage, '앞의 단면', EC.x + 90, EC.y - EC.R - 30, {size: 24}); });
    const tau = (t - CR.t0) * CR.rate, tau2 = (t - s23 - 0.4) * 230;
    // s22: P·S 모두 / s23: P 만 다시(바깥 핵을 지나는 것), S 의 끝점은 남김
    const showP = t < s23 ? tau : tau2, showS = t < s23 ? tau : 1e9;
    withAlpha(c, ea, () => {
      raysDraw(stage, 'S', showS, PAL.cool, t < s23 ? 1 : 0.55);
      raysDraw(stage, 'P', showP, PAL.warm, 1);
    });
    // 그늘(모형의 S 가 닿지 않는 땅) — 모든 S 가 끝난 뒤
    const sEnd = Math.max(...M.RAYS.S.map(r => r[r.length - 1].t));
    const ga = fadeIn(t, CR.t0 + sEnd / CR.rate, 0.5);
    if (ga > 0) withAlpha(c, ga, () => {
      const maxDeg = Math.max(...M.rayArrivals('S').map(a => Math.abs(a.deg))) * Math.PI / 180;
      c.save(); c.setLineDash([14, 10]);
      ring(c, EC.x, EC.y, EC.R + 16, PAL.coolHi, 5, -Math.PI / 2 + maxDeg, -Math.PI / 2 + 2 * Math.PI - maxDeg);
      c.restore();
      unlitRect(stage, EC.x - 90, EC.y + EC.R - 70, 180, 48, 1); label(stage, 'S파 그늘', EC.x, EC.y + EC.R - 46, {size: 32, color: PAL.coolHi});
    });
    withAlpha(c, fadeIn(t, W0(ctx, 's23', '바깥', -0.2), 0.4), () => { label(stage, '바깥 핵 · 액체', EC.x, EC.y - 120, {size: 30}); label(stage, '안쪽 핵', EC.x, EC.y + 4, {size: 24, color: PAL.muted}); });
    withAlpha(c, ea * fadeIn(t, ctx.scene.start + 0.6, 0.4), () => label(stage, '맨틀', EC.x - 300, EC.y - 240, {size: 26, color: PAL.muted}));
    // 진원
    lit(stage, cc => { circle(cc, EC.x, EC.y - EC.R + 2, 7, rgba(PAL.warm, 0.9)); circle(cc, EC.x, EC.y - EC.R + 2, 3, '#FFF4E8'); }, {gain: 0.6});
  },

  // ---------------------------------------------------------------------------------------------------
  close(stage, t, p, ctx) {
    const c = stage.ctx, R = M.RUNS, runs = R.c1.tau(t) >= 0 ? [R.c1] : [], last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
    section(stage, t, runs); fronts(stage, t, runs);
    fault(stage, runSlip(R.c1, t), runFlash(R.c1, t));
    station(stage, M.xAt(100), runs, t); houses(stage, M.xAt(100) + 90, runs, t, 3);
    const ea = fadeIn(t, last.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 290, W, 330, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 290, 0, 620); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.7)'); g.addColorStop(0.85, 'rgba(9,9,11,0.7)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 290, W, 330);
        ['지진파는 바위가 이웃 바위를', '밀거나 비틀어 넘겨주는 흔들림,', '미는 흔들림이 더 빨라 먼저 닿습니다'].forEach((s, i) => stage.text(s, 540, 350 + i * 64, {role: 'display', weight: 700, size: 46, color: i === 2 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 1000, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 560, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, last.start, 0.5)});
      });
    }
  },
};

// =====================================================================================================
// 보조 그림
// =====================================================================================================
/** s03 확대: 관측소 아래 알갱이 하나의 자리 */
function tracker2(stage, t, runs) {
  const c = stage.ctx, x0 = M.xAt(100), y0 = M.SURF + 60;
  const at = tt => { const [dx, dy] = M.displacement(x0, y0, runs, tt); return [x0 + dx, y0 + dy]; };
  const pts = []; for (let k = 60; k >= 0; k--) pts.push(at(t - k * 0.04));
  ring(c, x0, y0, 7, rgba(PAL.ink, 0.8), 2); c.save(); c.setLineDash([4, 4]); ring(c, x0, y0, 30, rgba(PAL.ink, 0.6), 1.5); c.restore();
  line(c, pts, rgba(PAL.ink, 0.6), 2);
  const [X, Y] = at(t); circle(c, X, Y, 7, PAL.ink); circle(c, X, Y, 3, '#2A2724');
  stage.text('제자리', x0 + 52, y0 + 40, {size: 16, weight: 700, color: PAL.ink, ...so});   // 확대 2배 → 화면에서 32 px
}

/** 속도 눈금: 진원에서 오른쪽으로, 1초(실제)마다 앞면이 지난 자리 — 화면 좌표(카메라 cam) */
function speedMarks(stage, t, run, vpx, col, unit, cam) {
  const c = stage.ctx, tau = run.tau(t); if (tau < 0) return;
  const P0 = toScreen(cam, [M.HX, M.HY]), P1 = toScreen(cam, [M.HX + vpx * 6.2, M.HY]);
  line(c, [P0, P1], rgba(PAL.ink, 0.4), 2, {dash: [6, 8]});
  const n = Math.min(6, Math.floor(tau));
  for (let s = 1; s <= n; s++) {
    const [x, y] = toScreen(cam, [M.HX + vpx * s, M.HY]);
    line(c, [[x, y - 16], [x, y + 16]], col, 3);
    if (s === n) stage.text(`${s}초`, x, y - 36, {size: 28, weight: 700, color: col, align: 'center', ...so});
  }
  if (n >= 1) { const [xa, y] = toScreen(cam, [M.HX, M.HY]), [xb] = toScreen(cam, [M.HX + vpx, M.HY]); line(c, [[xa, y + 34], [xb, y + 34]], col, 2); stage.text(unit, (xa + xb) / 2, y + 60, {size: 26, weight: 700, color: col, align: 'center', ...so}); }
  // 큰 숫자
  const big = unit === '6 km' ? '6 km/s' : '3.5 km/s', bigA = fadeIn(t, run.t0 + 1.2, 0.4);
  withAlpha(c, bigA, () => { unlitRect(stage, 480, 960, 560, 230, 1); stage.text(big, 770, 1060, {role: 'display', weight: 700, size: 112, color: col, align: 'center', ...so}); stage.text(unit === '6 km' ? 'P파 · 지각 위쪽의 바위' : 'S파 · 지각 위쪽의 바위', 770, 1140, {size: 28, weight: 500, color: PAL.ink, align: 'center', ...so}); });
  // 시계(실제 초)
  unlitRect(stage, 60, 310, 250, 96, 1);
  panel(c, 60, 310, 250, 96, 0.92);
  stage.text(`${tau.toFixed(1)}초`, 185, 348, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'center'});
  stage.text('지진이 난 뒤', 185, 384, {size: 24, color: PAL.muted, align: 'center'});
}
function ghostMarks(stage, t, run, cam) {
  const c = stage.ctx, tau = run.tau(t); if (tau < 0) return;
  for (let s = 1; s <= Math.floor(tau) && s <= 6; s++) { const [x, y] = toScreen(cam, [M.HX + M.VPX * s, M.HY]); if (x > 1060) break; line(c, [[x, y - 10], [x, y + 10]], rgba(PAL.warm, 0.5), 2); }
}

/** 미는 판(사슬 왼쪽) — 펄스 시작에 한 번 민다 */
function pusher(stage, t, run, y) {
  const c = stage.ctx, d = chainShape(t - run.start + 0.15), x = M.CHAIN.x0 - 70 + 24 * d;
  rect(c, x - 14, y - 60, 28, 120, 5, PAL.hut, PAL.hutLo, 2);
}
function twister(stage, t, run, y) {
  const c = stage.ctx, d = chainShape(t - run.start + 0.15), yy = y - 30 * d;
  rect(c, M.CHAIN.x0 - 84, yy - 36, 28, 72, 5, PAL.hut, PAL.hutLo, 2);
}
function finish(stage, t, ta, y, col) {
  const c = stage.ctx, x = M.CHAIN.x0 + (M.CHAIN.n - 1) * M.CHAIN.dx + 62;
  line(c, [[x, y - 60], [x, y + 60]], rgba(PAL.muted, 0.8), 3, {dash: [8, 6]});
  if (t >= ta) withAlpha(c, fadeIn(t, ta, 0.2), () => stage.text('닿음', x - 2, y + 86, {size: 26, weight: 700, color: col === PAL.warm ? PAL.warmHi : PAL.coolHi, align: 'center', ...so}));
}
function labelsRockWater(stage, y) {
  const xw = M.CHAIN.x0 + (M.CHAIN.water - 0.5) * M.CHAIN.dx;
  label(stage, '바위', (M.CHAIN.x0 + xw) / 2 - 30, y);
  label(stage, '물', (xw + 1000) / 2, y, {color: PAL.coolHi});
}
/** 단면 작은 조각(사슬 장면의 위치 표시) */
function insetSection(stage, t, a) {
  if (a <= 0) return;
  const c = stage.ctx, x = 760, y = 330, w = 250, h = 150;
  withAlpha(c, a, () => {
    panel(c, x, y, w, h, 0.9);
    c.save(); c.beginPath(); c.rect(x + 4, y + 4, w - 8, h - 8); c.clip();
    c.translate(x + 4, y + 4 - 0.17 * (M.SURF - 40)); c.scale(0.17, 0.17); c.translate(-(-100), 0);
    for (let j = 0; j < 30; j++) for (let i = 0; i < 28; i++) { c.fillStyle = TONE[j * NC + i]; c.fillRect(X0 + i * GX + 100, M.SURF + j * GY, GX, GY); }
    c.restore();
    rect(c, x + 110, y + 70, 40, 24, 2, null, PAL.ink, 2.5);
    line(c, [[x + 130, y + 94], [x + 130, y + h + 50]], rgba(PAL.ink, 0.6), 2, {dash: [6, 6]});
    stage.text('땅속 바위', x + w / 2, y - 18, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
  });
}

// ---------- 기원: 드럼 지진계 ----------
const ORIGIN_RUN = {t0: 25.56, rate: 5.73, tau(t) { return t < this.t0 ? -1 : Math.min(45, (t - this.t0) * this.rate); }, timeOf(tr) { return this.t0 + tr / this.rate; }};
export const ORIGIN = ORIGIN_RUN;
function drum(stage, t, R, ctx) {
  const c = stage.ctx, cx = 540, cy = 960, w = 880, r = 150, tau = R.tau(t);
  // 받침
  rect(c, cx - w / 2 - 30, cy + r + 10, w + 60, 26, 6, PAL.hutLo);
  rect(c, cx - w / 2 - 20, cy - r - 10, 22, 2 * r + 30, 4, PAL.hut); rect(c, cx + w / 2 - 2, cy - r - 10, 22, 2 * r + 30, 4, PAL.hut);
  // 드럼(종이) — 위아래 명암
  const g = c.createLinearGradient(0, cy - r, 0, cy + r); g.addColorStop(0, PAL.paperLo); g.addColorStop(0.35, PAL.paper); g.addColorStop(1, '#7A7468');
  c.fillStyle = g; c.fillRect(cx - w / 2, cy - r, w, 2 * r);
  // 기록: 펜은 오른쪽(x = penX)에, 종이는 왼쪽으로(드럼이 돈다) — 1실제초 = 15 px. 45초가 지나면 펜을 든다(기록 끝)
  const penX = cx + w / 2 - 70, pxs = 18, y0 = cy, amp = 70;
  const tNow = Math.max(0, tau);
  const spin = (t - ctx.scene.start) * (tau >= 45 ? 0 : 1);
  // 드럼이 도는 표시(세로 결)
  for (let k = 0; k < 14; k++) { const xx = cx - w / 2 + ((k * 70 + (tau < 0 ? spin * 30 : tNow * pxs)) % w); line(c, [[xx, cy - r + 6], [xx, cy + r - 6]], rgba('#8C8578', 0.25), 1.5); }
  const pts = [];
  for (let s = Math.max(0, tNow - (penX - (cx - w / 2)) / pxs); s <= tNow; s += 0.05) pts.push([penX - (tNow - s) * pxs, y0 - amp * M.seismo(100, s)]);
  if (tau < 0) pts.push([cx - w / 2, y0], [penX, y0]);
  if (pts.length > 1) line(c, pts, PAL.ink2, 2.4);
  // 펜 팔
  const py = y0 - amp * M.seismo(100, tNow), lift = tau >= 45 ? 1 : 0;
  line(c, [[penX + 200, cy - r - 70], [penX, py - 6 * lift]], PAL.hutHi, 5);
  circle(c, penX + 200, cy - r - 70, 12, PAL.hut);
  if (!lift && tau >= 0) lit(stage, cc => { circle(cc, penX, py, 6, rgba(PAL.warmHi, 0.9)); circle(cc, penX, py, 3, '#FFF4E8'); }, {gain: 0.5});
  stage.text('지진계 기록지 · 드럼이 돌며 시간을 적는다', cx, cy + r + 66, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so});
  // 도착 이름(s06): 종이 위 첫째·둘째
  const nameP = fadeIn(t, W0(ctx, 's06', '피파', -0.4), 0.4), nameS = fadeIn(t, W0(ctx, 's06', '에스파', -0.4), 0.4);
  for (const [tt, col, nm, sub, a] of [[M.tP(100), PAL.warm, 'P', ['primary', '첫째'], nameP], [M.tS(100), PAL.cool, 'S', ['secondary', '둘째'], nameS]]) {
    const x = penX - (tNow - tt) * pxs; if (tNow < tt) continue;
    // 도착 표시(올덤이 가려낸 두 흔들림) — s05 끝부터
    const ma = fadeIn(t, W0(ctx, 's05', '두 흔들림', -0.3), 0.4);
    withAlpha(c, ma, () => line(c, [[x, cy - r - 4], [x, cy + r + 4]], col, 3));
    withAlpha(c, a, () => { unlitRect(stage, x - 100, cy - r - 190, 200, 170, 1); stage.text(nm, x, cy - r - 150, {role: 'display', weight: 700, size: 72, color: col, align: 'center', ...so}); stage.text(sub[0], x, cy - r - 90, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so}); stage.text(sub[1], x, cy - r - 52, {size: 32, weight: 700, color: PAL.ink, align: 'center', ...so}); });
  }
}

// ---------- 경보의 시간표 ----------
function warnStrip(stage, t, tau, ctx) {
  const c = stage.ctx, x0 = 110, x1 = 960, y = 418, T = 30, px = (x1 - x0) / T, Wn = M.WARN;
  unlitRect(stage, 70, 312, 940, 196, 1);
  panel(c, 70, 312, 940, 196, 0.92);
  line(c, [[x0, y], [x1, y]], PAL.border, 4);
  for (let s = 0; s <= T; s += 10) { line(c, [[x0 + s * px, y + 8], [x0 + s * px, y + 16]], PAL.muted, 2); stage.text(`${s}`, x0 + s * px, y + 34, {size: 24, color: PAL.muted, align: 'center'}); }
  stage.text('지진이 난 때부터(실제 초)', x1 + 20, 336, {size: 24, color: PAL.muted, align: 'right'});
  if (tau >= 0) rect(c, x0, y - 4, Math.min(T, tau) * px, 8, 3, rgba(PAL.ink, 0.7));
  // 위: 지진 · P 감지 · 경보 · 도시에 S / 아래: 가까운 곳 S
  const marks = [[0, '지진', PAL.ink, -1], [Wn.detect, 'P 감지', PAL.warmHi, -1], [Wn.nearS, '가까운 곳 S', PAL.coolHi, 1], [Wn.alert, '경보', PAL.warmHi, -1], [Wn.cityS, '도시에 S', PAL.coolHi, -1]];
  for (const [tt, nm, col, side] of marks) {
    if (tau < tt) continue;
    const x = x0 + tt * px, a = clamp((tau - tt) * 2);
    withAlpha(c, a, () => { circle(c, x, y, 9, col); stage.text(nm, x, side < 0 ? y - 32 : y + 64, {size: 26, weight: 700, color: col, align: side < 0 && tt === 0 ? 'center' : 'center'}); });
  }
  // s21: 경보는 지진이 난 '뒤'
  const ka = fadeIn(t, W0(ctx, 's21', '이미', -0.3), 0.4);
  if (ka > 0) withAlpha(c, ka, () => { const xa = x0, xb = x0 + Wn.alert * px, yy = y - 64; line(c, [[xa, yy], [xb, yy]], PAL.ink, 2); line(c, [[xa, yy - 8], [xa, yy + 8]], PAL.ink, 2); line(c, [[xb, yy - 8], [xb, yy + 8]], PAL.ink, 2); stage.text('지진이 난 뒤에', xb + 20, yy, {size: 24, weight: 700, color: PAL.ink, align: 'left'}); });
}

// ---------- 지구 단면의 광선과 파면 ----------
function raysDraw(stage, kind, tau, col, a = 1) {
  if (tau <= 0) return;
  const c = stage.ctx, rays = M.RAYS[kind], pos = rays.map(r => M.rayAt(r, tau));
  // 지나온 길(흐린 선, 무광 — 광선의 휨)
  withAlpha(c, 0.22 * a, () => {
    for (let i = 0; i < rays.length; i += 6) {
      const r = rays[i], pts = [];
      for (const q of r) { if (q.t > tau) break; pts.push(eP(q)); }
      if (pts.length > 1) line(c, pts, col, 1.5);
    }
  });
  // 끝난 광선의 끝: S 가 바깥 핵에 막힌 자리 / 지표에 닿은 자리
  for (let i = 0; i < rays.length; i += 2) {
    const q = pos[i]; if (!q.done) continue;
    const [x, y] = eP(q);
    if (q.end === 'cmb') circle(c, x, y, 3.5, rgba(PAL.coolHi, 0.9 * a));
    else if (q.end === 'surface') circle(c, x, y, 4, rgba(col === PAL.warm ? PAL.warmHi : PAL.coolHi, 0.9 * a));
  }
  // 파면(빛): 이웃 광선의 지금 자리를 잇는다(끝난 것·멀리 떨어진 것은 끊음)
  const segs = []; let cur = [];
  for (let i = 0; i < rays.length; i++) {
    const q = pos[i];
    if (q.done) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
    const p = eP(q);
    if (cur.length && Math.hypot(p[0] - cur[cur.length - 1][0], p[1] - cur[cur.length - 1][1]) > 40) { if (cur.length > 1) segs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length > 1) segs.push(cur);
  if (segs.length) withAlpha(c, a, () => lit(stage, cc => { for (const s of segs) { line(cc, s, rgba(col, 0.9), 5); line(cc, s, rgba(CORE(col), 0.95), 2); } }, {gain: 0.75 * a}));
}

// =====================================================================================================
// 간격 세기(distance)
// =====================================================================================================
export const COUNT = {near: {t0: 117.6, step: 0.5}, far: {t0: 123.9, step: 0.32}};

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { captionBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); hookKicker(stage, t, ctx, MO); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); unlitRect(stage, 0, 0, W, 120, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') { hookKicker(stage, t, ctx, MO); withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return; }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
/** hook 의 키커(시간 배율 선언) — 포스터 위 맨 위 줄. 머리글 제목은 포스터가 줄어든 뒤 */
function hookKicker(stage, t, ctx, MO) {
  const L = titleList('hook', ctx);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  if (t < MO[1]) {
    const s = L[k][1];
    if (s) { unlitRect(stage, 0, 100, W, 60, 1); stage.text(s, 540, 128, {role: 'display', weight: 500, size: 28, color: PAL.warmHi, align: 'center', ...so}); }
    return;
  }
  headList(stage, t, L, 1);
}
