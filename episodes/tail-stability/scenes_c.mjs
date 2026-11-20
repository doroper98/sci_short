// 66 꼬리날개 — 장면 모듈 C: yaw (s18~s19), tailless (s21~s22), close (s23~s24). PLAN.md 5.6~5.8, 9절 계약.
// 사건 시각의 원본은 sound_c.json 하나다: 장면은 ctx.events 에서 읽고, 아직 모으지 않았으면 같은 파일의 at 을 타임라인으로 푼다(같은 시계).
// 숫자·각도는 모두 model.mjs 또는 이 파일의 작은 모형(바람을 따르는 평면도, B-2 의 되먹임 제어)에서 읽는다 — 손으로 그린 곡선 없음.
// lit() 은 돌풍·힘 화살표·신호 점·기록선 끝점에만(kit 의 klit). 모형·연기 줄·글자·계기는 lit() 밖.
//
// 사슬(brief 표):
//  yaw      뒤집어 평면도 → 옆 돌풍 → 기수가 옆으로 10° → (멈춤) 수직 꼬리날개가 바람을 비스듬히 맞음, 꼬리에 난색 화살표
//           → (풀림) 기수가 돌아오다 넘치고 0 / 바람 방향이 12° 바뀜 → 비행기와 풍향계가 같은 θ 로 새 바람 쪽을 향함 → 바람이 0 으로 돌아옴
//  tailless 꼬리날개가 실려 감 → 전익기 윤곽 → 돌풍 → 컴퓨터에서 날개 끝으로 신호 → 판이 벌어짐 → 그 끝이 뒤로 끌림 → 기수가 돌아오다
//           지나침 → 반대쪽 … / 뒤집어 옆모습: 종이비행기 앞을 접음 → ⊕ 가 양력 자리보다 앞으로 → 뒤끝을 올림 → 돌풍 → 돌아옴
//  close    처음의 두 모형 → 같은 돌풍 → 아래: 난색 화살표가 되돌림 / 위: 한색 화살표가 커지고 꼬리 자리는 빈 점선 → 넘어감 → 결론 글 → 끝 한 줄
import fs from 'node:fs';
import {rgba, mix, clamp, lerp, smooth, easeInOut, line, circle, ring, poly, rect, withAlpha, TAU} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';
import * as M from './model.mjs';

const {PAL} = K, D = Math.PI / 180;
const SPEC = JSON.parse(fs.readFileSync(new URL('./sound_c.json', import.meta.url), 'utf8')).events;
const SPEC_BY = new Map(SPEC.map(e => [e.id, e]));

// ---------------------------------------------------------------------------------------------------------------
// 배치(1단계 값과 계약 9.2)
// ---------------------------------------------------------------------------------------------------------------
const WT = {x: 410, y: 520, s: 3.0};                       // tail 이 넘겨주는 옆모습(WT 자세)
const TOPV = {x: 400, y: 600, s: 2.2};                     // 평면도(yaw)
const FLYV = {x: 430, y: 626, s: 1.9};                     // 전익기(날개 폭 약 680 px)
const UP = {x: 400, y: 470, s: 2.9}, DN = {x: 400, y: 1110, s: 2.9};   // hook 배치(close)
const VANE = {x: 540, y: 1122};                            // 풍향계 받침(계기 자리)
const PAPER = {nx: 62, ny: 585, L: 700, sc: 1.25};         // 종이비행기: 기수 끝 화면 위치, 모형 길이(u), 배율(화면 길이 875 px)
const SLOW = 1 / 3;

// ---------------------------------------------------------------------------------------------------------------
// plan: 타임라인에서 사건 시각·rate 구간·작은 모형의 표를 한 번 계산해 둔다.
// ---------------------------------------------------------------------------------------------------------------
const PLANS = new WeakMap();
function plan(tl, ev) {
  if (PLANS.has(tl)) return PLANS.get(tl);
  const at = id => (ev && typeof ev.has === 'function' && ev.has(id) ? ev.get(id).time : tl.at(SPEC_BY.get(id).at));
  const yaw = tl.scene('yaw'), tls = tl.scene('tailless'), cl = tl.scene('close');
  const s = id => tl.sentence(id);
  const P = {yaw, tls, cl, s18: s('s18'), s19: s('s19'), s21: s('s21'), s22: s('s22'), s23: s('s23'), s24: s('s24')};

  // ---- yaw
  P.flip1 = at('c_flip1'); P.flip1End = P.flip1 + 0.8;
  P.kickY = at('c_kick_y'); P.kickYEnd = P.kickY + M.RISE / SLOW;
  P.releaseY = at('c_release_y');
  P.slowEndY = P.s19.start - 0.4;
  P.segY = [{t0: yaw.start, t1: P.kickYEnd, rate: SLOW}, {t0: P.kickYEnd, t1: P.releaseY, rate: 0}, {t0: P.releaseY, t1: P.slowEndY, rate: SLOW}];
  P.runY = {kick: P.kickY, segs: P.segY, reset: P.s19.start + 0.4};
  P.finTrack = tl.wordStart('s18', '수직');
  P.turn = at('c_turn'); P.turnBack = at('c_turnback');
  P.windDir = t => 12 * D * (smooth((t - P.turn) / 1.0) - smooth((t - P.turnBack) / 1.6));
  P.vaneIn = P.s19.start - 0.5;

  // 바람을 따르는 평면도 모형(풍향계와 같은 값): θ'' = −ω²(θ − dir) − 2ζω θ' (모형 시간). 벽시계로 적분 — 이 구간의 rate 는 1.
  {
    const {w, z} = M.OBJ.vane, t0 = P.turn - 0.2, t1 = tls.start + 3, dt = 1 / 1000, n = Math.ceil((t1 - t0) / dt);
    const tab = new Float64Array(n + 1); let th = 0, om = 0;
    for (let i = 1; i <= n; i++) {
      const t = t0 + i * dt, r = M.rateAt(P.segY, t);
      const acc = -w * w * (th - P.windDir(t)) - 2 * z * w * om;
      om += r * acc * dt; th += r * om * dt; tab[i] = th;
    }
    P.windTab = {t0, dt, tab};
  }
  P.thWind = t => { const {t0, dt, tab} = P.windTab; if (t <= t0) return 0; const x = (t - t0) / dt, i = Math.floor(x); return i >= tab.length - 1 ? tab[tab.length - 1] : tab[i] + (tab[i + 1] - tab[i]) * (x - i); };
  P.thYaw = t => M.runTheta(P.runY, 'vane', t) + P.thWind(t);

  // ---- tailless: 떼기 → 전익기
  P.detach = at('c_detach'); P.morph0 = P.detach + 0.35; P.morph1 = P.morph0 + 1.0;
  P.comp = tl.wordStart('s21', '컴퓨터가');
  P.kickB = at('c_kick_b');
  P.flaps = [1, 2, 3, 4, 5, 6].map(k => at('c_flap' + k));
  P.flip2 = at('c_flip2'); P.flip2End = P.flip2 + 0.8;
  P.b2 = simB2(P);

  // ---- tailless: 종이비행기
  P.folds = [1, 2, 3].map(k => at('c_fold' + k));
  P.bend = at('c_bend');
  P.cgSlide0 = P.folds[2] + 0.28; P.cgSlide1 = P.cgSlide0 + 1.2;   // 세 번 접은 뒤 ⊕ 가 앞으로 미끄러짐
  P.kickP = at('c_kick_pp');
  P.slowP0 = P.kickP - 0.25 / SLOW;                         // 돌풍 덩어리가 올라오기 시작하는 때(모형 시간 0.25초 전)
  P.segP = [{t0: P.slowP0, t1: tls.end, rate: SLOW}];
  P.runP = {kick: P.kickP, segs: P.segP};

  // ---- close
  P.kickC = at('c_kick_c');
  P.runC = {kick: P.kickC, segs: []};
  PLANS.set(tl, P);
  return P;
}

// ---------------------------------------------------------------------------------------------------------------
// B-2 의 작은 모형(설명 모형): 꼬리날개가 없으면 기수가 옆으로 틀어진 만큼 더 틀어진다(약한 불안정) — θ'' = λ²θ − cθ' + u.
// 되먹임 제어: 컴퓨터가 0.45초마다(c_flap 사건) 기수 각도를 재고, 틀어진 쪽의 반대 날개 끝의 판을 벌린다(끌림 → 기수를 되돌리는 회전).
// 끝은 좌우를 번갈아 쓰고, 얼마나 벌릴지는 다음 잴 때 기수가 반대쪽으로 지금의 0.55 배에 거의 멈춰 있도록 고른다(조금 지나치게 고침).
// 실제 B-2 의 제어 법칙·수치가 아니다(brief 단순화: 날개 끝의 판이 벌어져 좌우를 잡는 모습만).
// ---------------------------------------------------------------------------------------------------------------
const B2 = {lam: 1.0, c: 0.5, lead: 0.15, dur: 0.22, ratio: 0.45, umax: 14, aim: 0.0, wOm: 0.0, uref: 1.6, th0: 3 * D};
const flapShape = a => (a < 0 || a > B2.dur ? 0 : Math.min(1, a / 0.05) * Math.min(1, (B2.dur - a) / 0.08));
function simB2(P) {
  const t0 = P.kickB + M.RISE, tEnd = P.flip2End + 0.5, dt = 1 / 1000;
  const flaps = P.flaps.slice();
  while (flaps[flaps.length - 1] + 0.45 < P.flip2 - 0.2) flaps.push(flaps[flaps.length - 1] + 0.45);   // 6번 뒤에도 '쉬지 않고'(작게, 소리 없음)
  const U = [];
  const run = (Ulist, th, om, ta, tb) => {        // ta → tb 적분, 지금까지 고른 판(Ulist) 모두 반영
    for (let t = ta; t < tb - 1e-9; t += dt) {
      let u = 0; for (let j = 0; j < Ulist.length; j++) u += Ulist[j] * flapShape(t - flaps[j]);
      const acc = B2.lam * B2.lam * th - B2.c * om + u; om += acc * dt; th += om * dt;
    }
    return [th, om];
  };
  // 잴 때마다 다음 잴 때의 각을 맞추는 U 를 이분법으로 고른다
  let th = B2.th0, om = 0, tc = t0;
  for (let k = 0; k < flaps.length; k++) {
    const sk = flaps[k] - B2.lead;
    [th, om] = run(U, th, om, tc, sk); tc = sk;
    const sNext = (k + 1 < flaps.length ? flaps[k + 1] : flaps[k] + 0.45) + B2.aim, target = -B2.ratio * run(U, th, om, sk, flaps[k])[0];   // 판이 벌어질 때의 각을 미리 셈
    // 다음 잴 때 기수가 반대쪽으로 지금의 0.55 배에 있고, 그때 거의 멈춰 있도록(각속도 작게) — 한 값 U 를 훑어 가장 맞는 것
    let best = 0, bestJ = Infinity;
    const sg = (k % 2 ? 1 : -1) * Math.sign(B2.th0);          // 좌우 끝을 번갈아(첫 판은 틀어진 쪽의 반대 끝)
    for (let i = 0; i <= 160; i++) {
      const u = sg * B2.umax * i / 160, [thN, omN] = run([...U, u], th, om, sk, sNext);
      const J = (thN - target) ** 2 + (B2.wOm * omN) ** 2;
      if (J < bestJ) { bestJ = J; best = u; }
    }
    U.push(best);
  }
  // 표로 남긴다(벽시계 = 모형 시간, rate 1)
  const n = Math.ceil((tEnd - t0) / dt), tab = new Float64Array(n + 1);
  th = B2.th0; om = 0; tab[0] = th;
  for (let i = 1; i <= n; i++) {
    const t = t0 + (i - 1) * dt;
    let u = 0; for (let j = 0; j < U.length; j++) u += U[j] * flapShape(t - flaps[j]);
    const acc = B2.lam * B2.lam * th - B2.c * om + u; om += acc * dt; th += om * dt; tab[i] = th;
  }
  const theta = t => {
    if (t <= P.kickB) return 0;
    if (t < t0) return (B2.th0 / M.TH0) * M.kickTheta(t - P.kickB);
    const x = (t - t0) / dt, i = Math.floor(x); if (i >= tab.length - 1) return tab[tab.length - 1];
    return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
  };
  // 판: 음의 U(기수를 화면 아래로 = θ 를 줄임)는 화면 아래 날개 끝(+y)의 판, 양의 U 는 위 날개 끝(−y)의 판
  const flapOpen = (t, side) => { let a = 0; for (let j = 0; j < U.length; j++) if (Math.sign(-U[j]) === side) a += Math.min(1, Math.sqrt(Math.abs(U[j]) / B2.uref)) * flapShape(t - flaps[j]); return clamp(a); };
  return {theta, flaps, U, flapOpen, side: j => Math.sign(-U[j]) || 1};
}

// ---------------------------------------------------------------------------------------------------------------
// 계약: rateSegs, titles
// ---------------------------------------------------------------------------------------------------------------
export function rateSegs(tl, ev) {
  const P = plan(tl, ev);
  return [...P.segY, ...P.segP];
}

export function titles(id, ctx) {
  const P = plan(ctx.tl, ctx.events);
  if (id === 'yaw') return [
    [-Infinity, '옆에서 본 모습', '수직 꼬리날개도 같은 일'],
    [P.flip1 + 0.4, '위에서 본 모습 · 3배 느리게', '수직 꼬리날개도 같은 일'],
    [P.kickYEnd, '멈춤 · 위에서 본 모습', '수직 꼬리날개도 같은 일'],
    [P.releaseY, '위에서 본 모습 · 3배 느리게', '수직 꼬리날개도 같은 일'],
    [P.slowEndY, '위에서 본 모습 · 실제 빠르기', '풍향계와 같은 원리'],
  ];
  if (id === 'tailless') return [
    [-Infinity, '위에서 본 모습', '꼬리날개 없이 나는 방법'],
    [P.comp - 0.2, 'B-2 · 위에서 본 모습', '컴퓨터가 쉬지 않고 고친다'],
    [P.flip2 + 0.4, '옆에서 본 모습', '종이비행기: 무게는 앞, 뒤끝은 위로'],
    [P.slowP0, '옆에서 본 모습 · 3배 느리게', '종이비행기: 무게는 앞, 뒤끝은 위로'],
  ];
  if (id === 'close') return [[-Infinity, '같은 돌풍 · 꼬리날개만 다름', '틀어질수록 더 틀어진다']];
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// 작은 그리기 도구
// ---------------------------------------------------------------------------------------------------------------
const ramp = (t, a, d = 0.35) => smooth((t - a) / d);
const win = (t, a, b, d = 0.35) => ramp(t, a, d) * (1 - smooth((t - b) / d));
const tx = (m, u, v) => K.toScreen(m, u, v);

/** 이름표 하나: 글 + 지시선(끝에 작은 점). 30 px, ink, 그림자. */
function tag(stage, text, x, y, px, py, a = 1, {align = 'center', size = 30, color = PAL.ink} = {}) {
  if (a <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    if (px != null) { line(c, [[x, y + (py > y ? 22 : -22)], [px, py]], rgba(PAL.ink, 0.75), 2); circle(c, px, py, 4, PAL.ink); }
    stage.text(text, x, y, {size, weight: 700, color, align, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 14});
  });
}

/** 가로 힘 화살표(뒤로 끌림): lit gain 0.6, 굵기 9, 화살촉 22. len > 0 = 오른쪽(바람 아래쪽). */
function hArrow(stage, x, y, len, col, a = 1) {
  if (a <= 0 || Math.abs(len) < 2) return;
  const sg = Math.sign(len), L = Math.abs(len), head = Math.min(22, Math.max(10, L * 0.6)), hw = head * 0.62;
  K.klit(stage, c => {
    c.save(); c.globalAlpha *= a;
    if (L > head) line(c, [[x, y], [x + sg * (L - head), y]], col, 9, {cap: 'butt'});
    poly(c, [[x + sg * L, y], [x + sg * (L - head), y - hw], [x + sg * (L - head), y + hw]], col);
    c.restore();
  }, {gain: 0.6});
}

// 평면도의 꼬리날개 조각(떼기): kit 의 평면도 꼴과 같은 좌표(수평 꼬리날개 STAB_TOP, 수직 FIN_TOP)
const STAB_TOP = [[129, 0], [158, -55], [178, -55], [173, 0]];
const FIN_TOP = (() => { const up = [], lo = []; for (let i = 0; i <= 12; i++) { const q = i / 12, x = 118 + 52 * q, h = 2.5 * Math.sin(Math.PI * Math.pow(q, 0.8)); up.push([x, -h]); lo.push([x, h]); } return [...up, ...lo.reverse().slice(1, -1)]; })();
const pathPts = (c, pts) => { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
function topTailPiece(stage, m, pose) {
  if (!pose || pose.a <= 0) return;
  const c = stage.ctx, C = [152, 0], [px, py] = tx(m, ...C);
  withAlpha(c, pose.a, () => {
    c.save(); c.translate(px + pose.dx, py + pose.dy); c.rotate((m.theta || 0) + pose.rot); c.scale(m.s, m.s); c.translate(-C[0], -C[1]);
    for (const sg of [-1, 1]) {
      c.beginPath(); pathPts(c, STAB_TOP.map(([x, y]) => [x, sg * y]));
      const g = c.createLinearGradient(140, -55, 175, 55); g.addColorStop(0, PAL.warmHi); g.addColorStop(1, PAL.warmLo); c.fillStyle = g; c.fill();
    }
    c.beginPath(); pathPts(c, FIN_TOP); const g = c.createLinearGradient(0, -3, 0, 3); g.addColorStop(0, PAL.warmHi); g.addColorStop(1, PAL.warmLo); c.fillStyle = g; c.fill();
    c.restore();
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 풍향계(위에서 본 모습): 가는 화살 + 뒤쪽 넓은 난색 깃, 받침 원. 무광. 받침을 축으로 θ 만큼 돈다(기수 = 화살촉, 왼쪽).
// ---------------------------------------------------------------------------------------------------------------
function drawVane(stage, x, y, th, a) {
  if (a <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    // 받침 원(돌지 않음)
    circle(c, x, y + 4, 34, 'rgba(0,0,0,0.35)');
    const gb = c.createRadialGradient(x - 10, y - 10, 4, x, y, 32); gb.addColorStop(0, '#3E5B66'); gb.addColorStop(1, '#1A2E36');
    c.beginPath(); c.arc(x, y, 30, 0, TAU); c.fillStyle = gb; c.fill(); ring(c, x, y, 30, rgba(PAL.muted, 0.7), 2);
    c.save(); c.translate(x, y); c.rotate(th);
    // 깃(난색, 넓은 판 두 장이 뒤로 벌어진 꼴)
    c.beginPath(); pathPts(c, [[96, -5], [150, -48], [206, -48], [176, 0], [206, 48], [150, 48], [96, 5]]);
    const gf = c.createLinearGradient(0, -48, 0, 48); gf.addColorStop(0, PAL.warmHi); gf.addColorStop(0.5, mix(PAL.warmHi, PAL.warmLo, 0.5)); gf.addColorStop(1, PAL.warmLo);
    c.fillStyle = gf; c.fill(); c.strokeStyle = rgba('#3A1A0C', 0.6); c.lineWidth = 1.2; c.stroke();
    line(c, [[100, 0], [178, 0]], rgba('#3A1A0C', 0.45), 2);
    // 화살대
    c.beginPath(); c.moveTo(-168, -5); c.lineTo(180, -4); c.lineTo(180, 4); c.lineTo(-168, 5); c.closePath();
    const gs = c.createLinearGradient(0, -5, 0, 5); gs.addColorStop(0, PAL.bodyHi); gs.addColorStop(0.55, PAL.bodyMid); gs.addColorStop(1, PAL.bodyLo); c.fillStyle = gs; c.fill();
    // 화살촉
    c.beginPath(); pathPts(c, [[-206, 0], [-160, -20], [-168, 0], [-160, 20]]);
    const gh = c.createLinearGradient(0, -20, 0, 20); gh.addColorStop(0, PAL.bodyHi); gh.addColorStop(1, PAL.bodyLo); c.fillStyle = gh; c.fill();
    c.strokeStyle = rgba(PAL.darker, 0.9); c.lineWidth = 1.2; c.stroke();
    c.restore();
    K.cgMark(c, x, y, 13, th);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// YAW
// ---------------------------------------------------------------------------------------------------------------
function yawScene(stage, t, p, ctx) {
  const P = plan(ctx.tl, ctx.events), c = stage.ctx, ph = ctx.clock.phase(t), sc = ctx.scene;
  const q = clamp((t - P.flip1) / 0.8), fe = easeInOut(q);
  const vIn = ramp(t, P.vaneIn, 0.5) * (1 - smooth((t - (sc.end - 0.45)) / 0.4));   // 풍향계: s19 동안, 끝 0.4초에 스스로 사라짐
  const ySplit = lerp(760, 1000, fe), dir = P.windDir(t);
  K.smokeField(stage, ph, {y0: 260, y1: lerp(ySplit, 1240, vIn), dir});
  withAlpha(c, 1 - 0.55 * vIn, () => K.gaugeFloor(stage, ySplit, 1240));

  const th = P.thYaw(t), m = {...TOPV, theta: th};
  const kickRun = P.runY, tauK = M.tau(kickRun, t);
  // 계기 바닥의 기록선(옆 돌풍의 run, 모형 시간 — 멈춤에서는 선도 멈춘다). 풍향계가 나오기 전에 스스로 사라진다.
  const ta = ramp(t, P.flip1End, 0.3) * (1 - smooth((t - (P.vaneIn - 0.5)) / 0.5));
  if (ta > 0) {
    K.traceGauge(stage, {x: 130, y: 1052, w: 600, h: 140, t0: 0, span: 2.5, yMin: -6, yMax: 14, ticks: [-5, 0, 10], alpha: ta},
      tauK > 0 ? [{fn: tt => M.theta('vane', tt), col: PAL.warm, upTo: tauK, width: 3}] : []);
    stage.text('기수 각도 · 좌우', 750, 1122, {size: 26, weight: 500, color: PAL.muted, align: 'left', alpha: ta});
  }
  const drawTopWorld = st => {
    for (const g of M.strobe(kickRun, 'vane', t)) K.drawTop(st, {...TOPV, theta: g.theta, ghost: g.a});
    K.drawTop(st, {...m, tail: 'on', hl: {trackFin: win(t, P.finTrack, P.s18.end, 0.3)}});
    const gp = tx({...TOPV, theta: 0}, -100, 15);
    K.gustPuff(st, gp[0], gp[1], tauK + 0.25);
  };
  if (q < 1) {
    K.flipView(stage, q, st => K.drawSide(st, {...WT, theta: 0, tail: 'on'}), drawTopWorld, {cy: q < 0.5 ? WT.y : TOPV.y});
  } else drawTopWorld(stage);

  if (q >= 1) {
    // 수직 꼬리날개의 힘: 바람과 동체가 이루는 각(θ − 바람 방향)에서 — 기수가 위로 틀어지면 꼬리를 화면 위로 민다(기수를 되돌림)
    const fin = tx(m, ...K.TOP_PTS.fin), rel = th - dir;
    K.forceArrow(stage, fin[0], fin[1], M.dLt(rel) * K.FORCE_PX, PAL.warm, {alpha: ramp(t, P.flip1End, 0.2)});
    const ia = ramp(t, P.flip1End, 0.3) * (1 - smooth((t - (sc.end - 0.45)) / 0.4));
    K.protractor(stage, m.x, m.y, 330, th, {max: 30, alpha: ia});
    // 바뀐 바람 방향(바람이 불어오는 쪽): 각도기 위의 점선 하나
    const da = ia * clamp(Math.abs(dir) / (3 * D));
    if (da > 0) withAlpha(c, da, () => {
      const P2 = r => [m.x - r * Math.cos(dir), m.y - r * Math.sin(dir)];
      line(c, [P2(150), P2(372)], rgba(PAL.ink, 0.8), 2.5, {dash: [8, 7]});
      const [lx, ly] = P2(300);
      stage.text('바람 방향', lx + 10, ly - 30, {size: 26, weight: 500, color: PAL.ink, align: 'left', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
    });
    K.bigAngle(stage, 940, 318, th, {warm: true, align: 'right', alpha: ia});
  }
  // 풍향계: 같은 θ(같은 식, 같은 값)
  drawVane(stage, VANE.x, VANE.y, th, vIn);
  tag(stage, '풍향계', 800, VANE.y, null, null, vIn, {align: 'left'});
}

// ---------------------------------------------------------------------------------------------------------------
// TAILLESS — B-2(평면도)
// ---------------------------------------------------------------------------------------------------------------
// 전익기의 판(날개 끝 뒷전): 경첩 두 점(모형 u, 아래 날개 끝 +y). 위 날개 끝은 y 를 뒤집는다.
const HINGE = [[52, 138], [72, 166]];
const TE_N = (() => { const d = [42, 60], L = Math.hypot(...d); return [d[1] / L, -d[0] / L]; })();   // 뒷전 바깥쪽 법선(+y 쪽 날개)
const COMP = [-58, 0];                                    // 컴퓨터 자리(모형 u)
function b2Pose(P, t) {
  const k = smooth((t - P.morph0) / (P.morph1 - P.morph0));
  const fade = 1 - smooth((t - P.detach) / 0.8);          // yaw 에서 남은 아주 작은 각을 떼기 뒤 0 으로(설명 모형의 이음)
  const th = (t < P.kickB ? P.thYaw(t) * fade : 0) + P.b2.theta(t);
  return {x: lerp(TOPV.x, FLYV.x, k), y: lerp(TOPV.y, FLYV.y, k), s: lerp(TOPV.s, FLYV.s, k), theta: th, flying: k};
}
function flapPts(m, side, open) {
  const sg = side, A = [HINGE[0][0], sg * HINGE[0][1]], B = [HINGE[1][0], sg * HINGE[1][1]];
  const n = [TE_N[0], sg * TE_N[1]], d = [(B[0] - A[0]) / 34.4, (B[1] - A[1]) / 34.4];
  const inner = 9, out = 4 + 16 * open, spread = 7 * open;
  const A0 = [A[0] - n[0] * inner, A[1] - n[1] * inner], B0 = [B[0] - n[0] * inner, B[1] - n[1] * inner];
  const Ao = [A[0] + n[0] * out - d[0] * spread, A[1] + n[1] * out - d[1] * spread], Bo = [B[0] + n[0] * out + d[0] * spread, B[1] + n[1] * out + d[1] * spread];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return {A0, B0, Ao, Bo, A, B, tip: mid(Ao, Bo), hingeMid: mid(A, B), toS: pt => tx(m, ...pt)};
}
function drawFlap(stage, m, side, open, a) {
  if (a <= 0) return;
  const c = stage.ctx, F = flapPts(m, side, open), S = F.toS;
  withAlpha(c, a, () => {
    // 닫힌 판(뒷전 안쪽의 띠)
    poly(c, [S(F.A0), S(F.B0), S(F.B), S(F.A)], mix(PAL.warmLo, PAL.dark, 0.25), rgba('#3A1A0C', 0.6), 1);
    if (open > 0.02) {
      // 벌어진 판 두 장(위·아래로 벌어진 것을 위에서 본 쐐기): 밝은 쪽 = 위로 선 판, 어두운 쪽 = 아래로 선 판
      const M1 = [(F.Ao[0] + F.Bo[0]) / 2, (F.Ao[1] + F.Bo[1]) / 2];
      poly(c, [S(F.A), S(F.B), S(F.Bo), S(M1)], PAL.warmHi, rgba('#3A1A0C', 0.6), 1);
      poly(c, [S(F.A), S(M1), S(F.Ao)], PAL.warmLo, rgba('#3A1A0C', 0.6), 1);
    }
  });
}
/** 컴퓨터(무광 네모, 모형과 함께 돈다). */
function drawComputer(stage, m, a) {
  if (a <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    c.save(); const [x, y] = tx(m, ...COMP); c.translate(x, y); c.rotate(m.theta);
    const g = c.createLinearGradient(0, -22, 0, 22); g.addColorStop(0, '#5C7883'); g.addColorStop(1, '#22383F');
    rect(c, -30, -22, 60, 44, 6, g, rgba(PAL.ink, 0.55), 1.5);
    line(c, [[-26, -18], [26, -18]], rgba('#FFFFFF', 0.3), 1.5);
    for (let k = 0; k < 3; k++) rect(c, -18 + k * 13, -6, 9, 12, 2, '#0E1D23');
    c.restore();
  });
}
function b2Frame(stage, t, P, {flipped = false} = {}) {
  const c = stage.ctx, pose = b2Pose(P, t), m = {x: pose.x, y: pose.y, s: pose.s, theta: pose.theta};
  const tailState = t < P.detach ? 'on' : 'ghost';
  K.drawTop(stage, {...m, tail: tailState, flying: pose.flying});
  topTailPiece(stage, {...TOPV, theta: 0}, t >= P.detach ? K.detachPose(t - P.detach) : null);
  if (pose.flying < 0.5) return m;
  const fa = smooth((pose.flying - 0.5) / 0.5);
  const cA = ramp(t, P.comp, 0.35);
  // 컴퓨터에서 두 날개 끝으로 가는 선(점선, 무광)
  withAlpha(c, cA * 0.55, () => { for (const sd of [-1, 1]) { const F = flapPts(m, sd, 0); line(c, [tx(m, ...COMP), F.toS(F.hingeMid)], rgba(PAL.muted, 0.6), 2, {dash: [4, 7]}); } });
  for (const sd of [-1, 1]) drawFlap(stage, m, sd, P.b2.flapOpen(t, sd), fa);
  drawComputer(stage, m, cA);
  if (flipped) return m;
  // 신호 점(lit): 잰 순간(판이 벌어지기 0.15초 전) 컴퓨터를 떠나 그 끝에 닿는다
  P.b2.flaps.forEach((f, j) => {
    const a0 = f - B2.lead; if (t < a0 || t > f + 0.05) return;
    const F = flapPts(m, P.b2.side(j), 0), pa = tx(m, ...COMP), pb = F.toS(F.hingeMid), qq = easeInOut(clamp((t - a0) / B2.lead));
    const x = lerp(pa[0], pb[0], qq), y = lerp(pa[1], pb[1], qq), fade = 1 - smooth((t - f) / 0.05);
    K.klit(stage, cc => { circle(cc, x, y, 10, rgba(PAL.warm, 0.95 * fade)); }, {gain: 0.6});
  });
  // 벌어진 끝이 뒤로 끌리는 짧은 화살표(lit)
  for (const sd of [-1, 1]) {
    const o = P.b2.flapOpen(t, sd); if (o < 0.04) continue;
    const F = flapPts(m, sd, o), p0 = F.toS(F.tip);
    hArrow(stage, p0[0] + 6, p0[1], 22 + 46 * o, PAL.warm, smooth(o / 0.15));
  }
  // 이름표 '날개 끝의 판'(첫 판 하나에, 한 번)
  {
    const j = 0, F = flapPts(m, P.b2.side(j), 0), p0 = F.toS(F.hingeMid), a = win(t, P.b2.flaps[0] - 0.1, P.b2.flaps[0] + 2.4, 0.3);
    const ly = p0[1] > m.y ? p0[1] + 74 : p0[1] - 74;
    tag(stage, '날개 끝의 판', p0[0] + 170, ly, p0[0] + 10, p0[1] + (ly > p0[1] ? 10 : -10), a, {align: 'center'});
  }
  tag(stage, '컴퓨터', tx(m, ...COMP)[0], tx(m, ...COMP)[1] + 62, null, null, cA * (1 - smooth((t - (P.flip2 - 0.4)) / 0.4)));
  // 돌풍(기수 밑에서 위로)
  const gp = tx({...m, theta: 0}, -100, 12);
  K.gustPuff(stage, gp[0], gp[1], t - (P.kickB - 0.25));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// TAILLESS — 종이비행기(옆모습). 기수 왼쪽, 기수 끝 = (PAPER.nx, PAPER.ny), 모형 700 u × 1.25 = 화면 875 px. 무광 종이색.
// ---------------------------------------------------------------------------------------------------------------
const FOLD = [{L: 250, D: 62}, {L: 190, D: 50}, {L: 136, D: 40}];
const CG_FR = [0.53, 0.475, 0.43, 0.385], AC_FR = 0.45, BEND = {x0: 610, deg: 15};
function paperState(P, t) {
  // 앞쪽 겹이 다 포개진 뒤 무게중심이 한 번에 앞으로 미끄러진다(1.2초, 접는 프레임 바로 뒤)
  const fr = lerp(CG_FR[0], CG_FR[3], smooth((t - P.cgSlide0) / (P.cgSlide1 - P.cgSlide0)));
  const th = M.runTheta(P.runP, 'paper', t);
  const cg = [fr * PAPER.L, 12];
  return {cg, th, bend: smooth((t - P.bend) / 0.35)};
}
function paperModel(stage, t, P, {labels = true} = {}) {
  const c = stage.ctx, S = paperState(P, t), L = PAPER.L, SC = PAPER.sc;
  const cgS = [PAPER.nx + S.cg[0] * SC, PAPER.ny + S.cg[1] * SC];
  const toS = (u, v) => { const dx = (u - S.cg[0]) * SC, dy = (v - S.cg[1]) * SC, cs = Math.cos(S.th), sn = Math.sin(S.th); return [cgS[0] + dx * cs - dy * sn, cgS[1] + dx * sn + dy * cs]; };
  c.save(); c.translate(cgS[0], cgS[1]); c.rotate(S.th); c.scale(SC, SC); c.translate(-S.cg[0], -S.cg[1]);
  // 용골(아래로 접힌 몸통): 기수에서 뒤로 깊어지는 긴 삼각형
  c.beginPath(); pathPts(c, [[2, 3], [L, 3], [L - 10, 96], [L - 120, 102]]);
  const gk = c.createLinearGradient(0, 0, 0, 102); gk.addColorStop(0, PAL.paper); gk.addColorStop(1, PAL.paperLo);
  c.fillStyle = gk; c.fill(); c.strokeStyle = rgba('#5E5644', 0.7); c.lineWidth = 1.5; c.stroke();
  line(c, [[40, 8], [L - 40, 52]], rgba('#5E5644', 0.35), 1.5);                    // 접힌 금
  // 앞쪽 겹(접기): 위로 선 모서리가 윗선을 축으로 아래로 넘어와 포개진다
  FOLD.forEach((f, k) => {
    const tf = P.folds[k], up = smooth((t - (tf - 0.22)) / 0.2), dn = smooth((t - tf) / 0.28);
    if (up <= 0) return;
    const sy = dn > 0 ? lerp(-1, 1, dn) : -up, off = 2 + 3 * k;
    c.save(); c.translate(0, off); c.scale(1, sy);
    c.beginPath(); pathPts(c, [[4 + 4 * k, 0], [f.L, 0], [f.L * 0.78, f.D]]);
    const g = c.createLinearGradient(0, 0, 0, f.D); g.addColorStop(0, mix(PAL.paper, '#FFFFFF', 0.25)); g.addColorStop(1, mix(PAL.paper, PAL.paperLo, 0.6));
    c.fillStyle = g; c.fill(); c.strokeStyle = rgba('#5E5644', 0.8); c.lineWidth = 1.6 / Math.max(0.3, Math.abs(sy)); c.stroke();
    c.restore();
  });
  // 날개(옆에서 본 얇은 판). 앞쪽은 겹만큼 두꺼워진다.
  const thick = 3 * P.folds.filter(f => t >= f + 0.28).length;
  c.beginPath(); pathPts(c, [[0, 1 - thick * 0.3], [BEND.x0, -6], [BEND.x0, 5], [0, 4 + thick * 0.7]]);
  const gw = c.createLinearGradient(0, -7, 0, 6); gw.addColorStop(0, mix(PAL.paper, '#FFFFFF', 0.35)); gw.addColorStop(1, PAL.paperLo);
  c.fillStyle = gw; c.fill(); c.strokeStyle = rgba('#5E5644', 0.6); c.lineWidth = 1; c.stroke();
  // 뒤끝(꺾이는 부분): 꺾일수록 난색
  c.save(); c.translate(BEND.x0, 0); c.rotate(-BEND.deg * D * S.bend);
  c.beginPath(); pathPts(c, [[0, -6], [L - BEND.x0, -7], [L - BEND.x0, 3], [0, 5]]);
  const gb = c.createLinearGradient(0, -7, 0, 5); gb.addColorStop(0, mix(mix(PAL.paper, '#FFFFFF', 0.35), PAL.warmHi, S.bend)); gb.addColorStop(1, mix(PAL.paperLo, PAL.warmLo, S.bend));
  c.fillStyle = gb; c.fill(); c.strokeStyle = rgba(S.bend > 0.5 ? '#3A1A0C' : '#5E5644', 0.6); c.lineWidth = 1; c.stroke();
  c.restore();
  c.restore();

  const la = labels ? 1 : 0;
  // 양력이 걸리는 자리(작은 점)와 ⊕
  const acA = ramp(t, P.folds[0] - 0.2, 0.3);
  const ac = toS(AC_FR * L, 0);
  withAlpha(c, acA, () => { circle(c, ac[0], ac[1], 9, PAL.deep); circle(c, ac[0], ac[1], 6, PAL.cool); });
  const tagOut = 1 - smooth((t - (P.tls.end - 0.45)) / 0.4);
  // 옛 자리의 흐린 잔상(점선 원): 미끄러지기 시작할 때 남고, 뒤끝을 꺾을 때 사라진다
  const old = toS(CG_FR[0] * L, 12), oa = la * win(t, P.cgSlide0, P.bend, 0.3) * clamp(Math.abs(old[0] - cgS[0]) / 6);
  if (oa > 0) withAlpha(c, oa, () => { c.save(); c.setLineDash([5, 5]); c.beginPath(); c.arc(old[0], old[1], 14, 0, TAU); c.strokeStyle = rgba(PAL.ink, 0.6); c.lineWidth = 2; c.stroke(); c.restore();
    line(c, [[old[0] - 18, old[1] - 26], [cgS[0] + 20, old[1] - 26]], rgba(PAL.ink, 0.45), 2, {dash: [3, 6]}); });
  K.cgMark(c, cgS[0], cgS[1], 14, S.th);
  tag(stage, '양력이 걸리는 자리', ac[0] + 70, PAPER.ny - 130, ac[0], ac[1] - 10, la * acA * tagOut);
  tag(stage, '무게중심', cgS[0] - 40, PAPER.ny + 200, cgS[0], cgS[1] + 18, la * ramp(t, P.folds[0] - 0.2, 0.3) * tagOut);
  // 가로 치수선: ⊕ 가 양력이 걸리는 자리보다 앞(미끄러짐이 끝난 뒤, 뒤끝을 꺾기 전까지)
  const da = la * win(t, P.cgSlide1 - 0.2, P.bend - 0.3, 0.3);
  if (da > 0) withAlpha(c, da, () => {
    const y = Math.min(ac[1], cgS[1]) - 44, xa = cgS[0], xb = ac[0];
    line(c, [[xa, y - 10], [xa, y + 10]], PAL.ink, 2); line(c, [[xb, y - 10], [xb, y + 10]], PAL.ink, 2); line(c, [[xa, y], [xb, y]], PAL.ink, 2.5);
    line(c, [[xa, y + 12], [xa, cgS[1] - 16]], rgba(PAL.ink, 0.4), 1.5, {dash: [3, 4]}); line(c, [[xb, y + 12], [xb, ac[1] - 10]], rgba(PAL.ink, 0.4), 1.5, {dash: [3, 4]});
    stage.text('무게중심이 더 앞', xa - 14, y, {size: 28, weight: 700, color: PAL.ink, align: 'right', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
  });
  // 뒤끝: 각도 호와 이름표, 아래로 짧은 난색 화살표(꺾인 뒤끝을 바람이 아래로 민다 → 기수를 드는 쪽)
  const pv = toS(BEND.x0, 0), tipS = toS(BEND.x0 + (L - BEND.x0) * Math.cos(BEND.deg * D * S.bend), -(L - BEND.x0) * Math.sin(BEND.deg * D * S.bend));
  if (S.bend > 0.02) withAlpha(c, la * S.bend * tagOut, () => {
    const pts = []; for (let i = 0; i <= 12; i++) { const a = -BEND.deg * D * S.bend * i / 12 + S.th; pts.push([pv[0] + 88 * Math.cos(a), pv[1] + 88 * Math.sin(a)]); }
    line(c, pts, rgba(PAL.ink, 0.7), 2);
  });
  tag(stage, '뒤끝 15° 위로', tipS[0] - 30, PAPER.ny - 130, tipS[0] - 4, tipS[1] - 12, la * S.bend * tagOut);
  const mid = toS(BEND.x0 + (L - BEND.x0) * 0.55 * Math.cos(BEND.deg * D), -(L - BEND.x0) * 0.55 * Math.sin(BEND.deg * D) + 6);
  K.forceArrow(stage, mid[0], mid[1] + 8, -46, PAL.warm, {alpha: la * ramp(t, P.bend + 0.3, 0.3)});
  // 돌풍(기수 밑에서 위로, 모형 시간)
  const gp = [PAPER.nx + 70, PAPER.ny + 34];
  if (labels) K.gustPuff(stage, gp[0], gp[1], M.tau(P.runP, t) + 0.25);
  return S;
}

function taillessScene(stage, t, p, ctx) {
  const P = plan(ctx.tl, ctx.events), c = stage.ctx, ph = ctx.clock.phase(t), sc = ctx.scene;
  const q2 = clamp((t - P.flip2) / 0.8), e2 = easeInOut(q2);
  const yF = lerp(1000, PFLOOR, e2);                       // 종이비행기 쪽은 풍동 창 260~900, 그 아래 계기 바닥
  K.smokeField(stage, ph, {y0: 260, y1: yF});
  K.gaugeFloor(stage, yF, 1240);
  if (q2 <= 0) b2Frame(stage, t, P);
  else if (q2 < 1) K.flipView(stage, q2, st => b2Frame(st, t, P, {flipped: true}), st => paperModel(st, t, P, {labels: false}), {cy: q2 < 0.5 ? FLYV.y : PAPER.ny});
  else paperModel(stage, t, P);

  // B-2 의 계기: 큰 숫자(기수 각도)와 작은 톱니 기록선(모형 시간 = 벽시계)
  const t0 = P.kickB - 0.2, ia = ramp(t, P.kickB - 0.3, 0.3) * (1 - smooth((t - P.flip2) / 0.4));
  if (ia > 0) {
    const pose = b2Pose(P, t);
    K.bigAngle(stage, 940, 318, pose.theta, {warm: false, align: 'right', alpha: ia});
    K.traceGauge(stage, {x: 130, y: 1062, w: 620, h: 128, t0: 0, span: 5, yMin: -4, yMax: 4, ticks: [-3, 0, 3], alpha: ia},
      [{fn: tt => b2Pose(P, t0 + tt).theta, col: PAL.ink, upTo: t - t0, width: 3}]);
    stage.text('기수 각도', 760, 1126, {size: 26, weight: 500, color: PAL.muted, align: 'left', alpha: ia});
  }
  // 종이비행기의 돌풍: 큰 숫자
  const pa = ramp(t, P.slowP0, 0.3) * (1 - smooth((t - (sc.end - 0.45)) / 0.4));
  if (pa > 0) K.bigAngle(stage, 940, 318, M.runTheta(P.runP, 'paper', t), {warm: true, align: 'right', alpha: pa});
  paperTrace(stage, t, P, ramp(t, P.flip2End, 0.4) * (1 - smooth((t - (sc.end - 0.45)) / 0.4)));
}
const PFLOOR = 900;
/** 종이비행기의 기수 각도 기록선(모형 시간 — 3배 느리게 구간이면 선도 느리게). 돌풍 전에는 눈금만. */
function paperTrace(stage, t, P, a) {
  if (a <= 0) return;
  const tau = M.tau(P.runP, t);
  K.traceGauge(stage, {x: 130, y: 968, w: 620, h: 150, t0: 0, span: 2.0, yMin: -6, yMax: 14, ticks: [-5, 0, 10], alpha: a},
    tau > 0 ? [{fn: tt => M.theta('paper', tt), col: PAL.warm, upTo: tau, width: 3}] : []);
  stage.text('기수 각도 · 위아래', 770, 1043, {size: 26, weight: 500, color: PAL.muted, align: 'left', alpha: a});
}

// ---------------------------------------------------------------------------------------------------------------
// CLOSE — hook 의 두 모형 배치로 돌아와 같은 돌풍. 마지막 문장에는 결론 글과 끝 한 줄.
// ---------------------------------------------------------------------------------------------------------------
function closeScene(stage, t, p, ctx) {
  const P = plan(ctx.tl, ctx.events), c = stage.ctx, ph = ctx.clock.phase(t), sc = ctx.scene;
  const xq = smooth((t - sc.start) / 0.5);                 // 0.5초 교차 전환
  const run = P.runC;
  const mU = {...UP, theta: M.runTheta(run, 'tailless', t)}, mD = {...DN, theta: M.runTheta(run, 'tailed', t)};
  K.smokeField(stage, ph, {wake: [K.wakeOf(mU)]});
  if (xq < 1) withAlpha(c, 1 - xq, () => {
    c.fillStyle = PAL.bg; c.fillRect(0, 0, K.W, 260);           // 앞 장면의 풍동 창 위쪽(연기 없음)
    K.gaugeFloor(stage, PFLOOR, 1240);
    paperTrace(stage, t, P, 1);
    paperModel(stage, t, P, {labels: false});
  });
  withAlpha(c, xq, () => {
    for (const g of M.strobe(run, 'tailed', t)) K.drawSide(stage, {...mD, theta: g.theta, ghost: g.a});
    for (const g of M.strobe(run, 'tailless', t)) K.drawSide(stage, {...mU, theta: g.theta, ghost: g.a, tail: 'ghost'});
    K.drawSide(stage, {...mU, tail: 'ghost'});
    K.drawSide(stage, {...mD, tail: 'on'});
  });
  const age = M.tau(run, t) + 0.25;
  const GA = m => tx({...m, theta: 0}, -96, 20);
  K.gustPuff(stage, ...GA(UP), age); K.gustPuff(stage, ...GA(DN), age);

  // 힘 화살표(s23): 아래 = 꼬리날개의 난색(되돌림), 위 = 날개의 한색(더 틀어지게) + 꼬리 자리의 빈 점선(없는 힘)
  const s24 = P.s24, endA = 1 - smooth((t - (s24.start - 0.6)) / 0.5);
  const thU = mU.theta, thD = mD.theta, upA = endA * (1 - smooth((thU - 50 * D) / (25 * D)));
  if (t > P.kickC) {
    const sb = tx(mD, ...K.SIDE_PTS.stab); K.forceArrow(stage, sb[0], sb[1], M.dLt(thD) * K.FORCE_PX, PAL.warm, {alpha: endA});
    // 한색 화살표: 끝이 머리글 아래(y 275)를 넘지 않게 자른다
    const ac = tx(mU, ...K.SIDE_PTS.ac), lenU = Math.min(Math.min(2, M.dLw(thU)) * K.FORCE_PX, ac[1] - 275);
    if (lenU > 0) K.forceArrow(stage, ac[0], ac[1], lenU, PAL.cool, {alpha: upA});
    const st = tx(mU, ...K.SIDE_PTS.stab), ghostLen = Math.min(0.6, M.dLt(thU)) * K.FORCE_PX;
    if (ghostLen > 3) {
      K.forceArrow(stage, st[0], st[1], ghostLen, null, {dashed: true, alpha: upA});
      stage.text('없음', st[0] - 22, st[1] - ghostLen - 6, {size: 26, weight: 500, color: PAL.muted, align: 'right', alpha: upA * (1 - smooth((thU - 20 * D) / (10 * D))), shadow: 'rgba(0,0,0,0.9)', shadowBlur: 8});
    }
  }
  // 큰 숫자 둘(모형에서 읽음) — 두 모형 사이, 각자의 이름과 함께
  const na = ramp(t, sc.start + 0.4, 0.4) * endA;
  if (na > 0) {
    withAlpha(c, na, () => {
      stage.text('꼬리날개 없음', 940, 622, {size: 26, weight: 500, color: PAL.muted, align: 'right', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 10});
      stage.text('꼬리날개 있음', 80, 930, {size: 26, weight: 500, color: PAL.muted, align: 'left', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 10});
    });
    K.bigAngle(stage, 940, 670, thU, {warm: false, size: 60, align: 'right', alpha: na});
    K.bigAngle(stage, 80, 978, thD, {warm: true, size: 60, align: 'left', alpha: na});
  }
  // s24: 어두워지고 결론 글, 끝 한 줄(마지막 문장이 시작한 뒤에만)
  const dim = 0.55 * smooth((t - (s24.start - 0.6)) / 0.8);
  if (dim > 0) {
    c.fillStyle = `rgba(0,8,12,${dim})`; c.fillRect(0, 0, K.W, K.H);
    // 결론 글 뒤의 띠(알파 0.45 이하 — 뒤의 모형이 비쳐 보인다)
    const b = 0.45 * dim / 0.55, g = c.createLinearGradient(0, 520, 0, 940);
    g.addColorStop(0, 'rgba(0,8,12,0)'); g.addColorStop(0.2, `rgba(0,8,12,${b})`); g.addColorStop(0.8, `rgba(0,8,12,${b})`); g.addColorStop(1, 'rgba(0,8,12,0)');
    c.fillStyle = g; c.fillRect(0, 520, K.W, 420);
  }
  K.conclusion(stage, smooth((t - (s24.start - 0.4)) / 0.6));
  if (t >= s24.start) K.endLine(stage, smooth((t - s24.start) / 0.5));
}

export const scenes = {yaw: yawScene, tailless: taillessScene, close: closeScene};

// ---------------------------------------------------------------------------------------------------------------
// 소리 표(모형에서 뽑음): 각도를 따르는 음. tools/export_sound.mjs 가 모아 sound_gen.json 에 쓴다.
// 음높이 220 × 2^(θ/60°) Hz, 660 에서 자름, 0.05초 간격.
// ---------------------------------------------------------------------------------------------------------------
export function genSound(tl, ev) {
  const P = plan(tl, ev), out = [];
  const r3 = x => Math.round(x * 1000) / 1000;
  // 바람(env_noise)은 tools/export_sound.mjs 가 rateSegs 에서 장면마다 gen_wind_<장면> 으로 만든다 — 여기서는 각도의 음만.
  const pitch = th => Math.min(660, 220 * Math.pow(2, (th * M.R2D) / 60));
  const tone = (id, t0, t1, fn, gain, means, fadeAt = null) => {
    const pts = [];
    for (let t = t0; t <= t1 + 1e-6; t += 0.05) {
      let a = smooth((t - t0) / 0.15) * (1 - smooth((t - (t1 - 0.4)) / 0.4));
      if (fadeAt != null) a *= 1 - smooth((t - fadeAt) / 0.8);
      pts.push([r3(t - t0), r3(pitch(fn(t))), r3(a)]);
    }
    out.push({id, at: r3(t0), kind: 'chirp', params: {points: pts, gain_db: gain}, means});
  };
  tone('c_tone_yaw', P.kickY - 0.1, P.s18.end + 0.8, t => M.runTheta(P.runY, 'vane', t), -24, '평면도 모형의 기수 각도(옆 돌풍) — 음이 올랐다 제자리로');
  tone('c_tone_turn', P.turn - 0.1, P.yaw.end, t => P.thYaw(t), -26, '바람 방향이 바뀌자 기수·풍향계가 새 바람 쪽으로 — 음이 조금 올라 머묾, 바람이 돌아오면 내려옴');
  tone('c_tone_paper', P.kickP - 0.1, P.tls.end - 0.1, t => M.runTheta(P.runP, 'paper', t), -24, '종이비행기의 기수 각도(3배 느리게) — 음이 올랐다 제자리로');
  tone('c_tone_close_up', P.kickC - 0.1, P.s24.start + 1.2, t => M.runTheta(P.runC, 'tailless', t), -27, '꼬리날개 없는 모형의 기수 각도 — 음이 올라가 버림(660 Hz 에서 자름)', P.s24.start);
  tone('c_tone_close_dn', P.kickC - 0.1, P.kickC + 2.4, t => M.runTheta(P.runC, 'tailed', t), -27, '꼬리날개 있는 모형의 기수 각도 — 음이 제자리로');
  return out;
}
export const _plan = plan;   // 점검용(도구에서 모형 값을 읽을 때)
