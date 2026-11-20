// 66 꼬리날개 — 장면 모듈 B: origin (s04~s07), essence (s08~s10). 계약은 scenes.mjs 머리말과 PLAN.md 9절.
// 사건 시각은 sound_b.json 이 한 곳이다 — 장면은 ctx.events 에서 같은 id 를 읽는다(없으면 sound_b.json 의 at 을 직접 푼다).
// 시간 배율: 이 모듈의 장면은 모두 실제 빠르기다(rateSegs 없음). 페노의 비행도 실제 11초를 11초로 보인다(키커에 밝힘).
// 사실(brief.md '기원·배경'): empennage ← empenner "화살에 깃털을 달다", 페노 1871년 파리, 약 40 m, 11초. 그 밖의 수치·주장은 그리지 않는다.
//   "깃이 없으면 뒤집힌다", "페노가 꼬리 하나로 처음" 같은 암시도 하지 않는다(깃 없는 화살·꼬리 없는 모형은 그리지 않음).
// lit(): 돌풍(kit gustPuff), 힘 화살표(kit forceArrow), 기록선 끝점(kit traceGauge)뿐. 장면 전용 그림(화살·페노·시소·끼움 그림)은 lit 밖.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, poly, rect, withAlpha, TAU} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';
import * as M from './model.mjs';

const {PAL} = K, D = Math.PI / 180;
const HERE = path.dirname(fileURLToPath(import.meta.url));
let SOUND_B = [];
try { SOUND_B = JSON.parse(fs.readFileSync(path.join(HERE, 'sound_b.json'), 'utf8')).events || []; }
catch (e) { console.warn(`[scenes_b] sound_b.json 을 읽지 못했습니다: ${e.message}`); }
const SPEC = Object.fromEntries(SOUND_B.map(e => [e.id, e.at]));

// 무대(PLAN 9.2·9.3): 모형 WT 자세, 연기 줄 260~760, 그 아래 계기 바닥 760~1240
const WT = {x: 410, y: 520, s: 3.0};
const WIN = {y0: 260, y1: 760}, FLOOR = {y0: 760, y1: 1240};
const TOP_S = 1.5;                       // 평면도 배율(날개 끝이 y 295~745 — 연기 창 안)
const ARROW = {tip: -304, end: 456};     // 화살(길이 760 px, ⊕ 는 촉에서 40%)
const PEN = {nose: -220, end: 462};      // 페노의 모형(px, ⊕ 기준)
const FLIGHT = {sec: 11, m: 40};         // 페노 1871: 약 40 m, 11초(실제 빠르기로 보임)
const SEESAW = {y: 1080, unit: 100};     // 시소: 받침 = 축 x 바로 아래, 거리 1 = 100 px (거리 4.2 = 420 px = 꼬리날개 팔 LT·s)

// ----------------------------------------------------------------------------------------------- 시각
function evTime(ctx, id) {
  if (ctx.events?.has?.(id)) return ctx.events.get(id).time;
  if (!(id in SPEC)) throw new Error(`[scenes_b] 사건 ${id} 가 없습니다`);
  return ctx.tl.at(SPEC[id]);
}
let PLAN = null, PLAN_TL = null;
function plan(ctx) {
  if (PLAN && PLAN_TL === ctx.tl) return PLAN;
  const tl = ctx.tl, T = id => evTime(ctx, id), S = id => tl.sentence(id), O = tl.scene('origin'), E = tl.scene('essence');
  const P = {
    O0: O.start, O1: O.end, E0: E.start, E1: E.end,
    s04: S('s04'), s05: S('s05'), s06: S('s06'), s07: S('s07'), s08: S('s08'), s09: S('s09'), s10: S('s10'),
    kA1: T('b_kick_a1'), kA2: T('b_kick_a2'), morph1: T('b_morph1'), word: T('b_word'), etym: T('b_etym'),
    morph2: T('b_morph2'), year: T('b_year'), prop0: T('b_prop'), mark40: T('b_mark40'), kP1: T('b_kick_p1'), kP2: T('b_kick_p2'),
    morph3: T('b_morph3'),
    kE1: T('b_kick_e1'), kE2: T('b_kick_e2'), flip1: T('b_flip1'), kE3: T('b_kick_e3'), kE4: T('b_kick_e4'), flip2: T('b_flip2'),
    slide: T('b_slide'), balance: T('b_balance'), ruler: T('b_ruler'), inset: T('b_inset'), kE5: T('b_kick_e5'),
  };
  P.propEnd = P.prop0 + FLIGHT.sec;
  // 거리 자의 축척: 낱말 '사십미터'에 40 m 금이 화면 왼쪽(x 70)으로 들어오게(등속 비행)
  const dW = FLIGHT.m * clamp((P.mark40 - P.prop0) / FLIGHT.sec);
  P.pxPerM = clamp(340 / Math.max(1, FLIGHT.m - dW), 12, 30);
  // 작은 추는 등속으로 미끄러진다: 거리 4 에 닿는 시각 = b_balance → 4.2 까지의 시간
  P.slideDur = Math.max(0.5, (P.balance - P.slide) * 3.2 / 3);
  P.kicks = {
    arrow: [[P.kA1, 1], [P.kA2, -1]],
    penaud: [[P.kP1, 0.6], [P.kP2, -0.6]],
    pitch: [[P.kE1, 0.6], [P.kE2, -0.6], [P.kE5, 1]],
    yaw: [[P.kE3, 0.6], [P.kE4, -0.6]],
  };
  PLAN = P; PLAN_TL = ctx.tl;
  return P;
}
/** 돌풍 여러 번의 합(안정한 선형 물체라 겹쳐 더한다). ks = [[돌풍 시각, 크기(±, 1 = TH0 10°)]] */
const kicksTheta = (obj, ks, t) => ks.reduce((a, [tk, amp]) => a + amp * M.theta(obj, t - tk), 0);
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, d = 0.4) => fadeIn(t, a, d) * fadeOut(t, b - d, d);   // a 에서 켜져 b 에 다 꺼짐

/** 돌풍(kit gustPuff): 위로 드는 것은 기수 밑에서, 누르는 것은 기수 위에서 온다. 닿는 시각 = 돌풍 사건. */
function gusts(stage, ks, t, noseAt) {
  for (const [tk, amp] of ks) {
    const age = t - (tk - 0.25);
    if (age <= 0 || age >= 0.5) continue;
    const up = amp > 0, [x, y] = noseAt(up);
    K.gustPuff(stage, x, y, age, {angle: (up ? -70 : 70) * D, dist: Math.abs(amp) < 1 ? 105 : 130});
  }
}
/** 화살·페노의 모형(px 단위, 배율 없음)의 점 → 화면. 비행기 모형(u 단위)은 K.toScreen. */
const rot = (m, ux, uy) => { const c = Math.cos(m.theta || 0), s = Math.sin(m.theta || 0); return [m.x + ux * c - uy * s, m.y + ux * s + uy * c]; };

// ============================================================================================ 화살
/** 화살(옆모습, px, ⊕ 기준): 화살대·촉·뒤의 난색 깃털 두 장. thick 1 → 6 은 비행기로 바뀌는 중간(화살대가 굵어짐). */
function drawArrow(stage, {x, y, theta = 0, thick = 1, alpha = 1}) {
  if (alpha <= 0) return;
  const c = stage.ctx, hh = 5 * thick, f = 1 + 0.25 * (thick - 1);
  withAlpha(c, alpha, () => {
    c.save(); c.translate(x, y); c.rotate(theta);
    // 깃털(뒤): 앞이 낮고 뒤로 갈수록 높아지는 판. 위아래 두 장(셋째 장은 화살대 뒤에 가려짐)
    for (const sg of [-1, 1]) {
      c.beginPath();
      c.moveTo(292, sg * hh); c.bezierCurveTo(330, sg * (hh + 6 * f), 380, sg * (hh + 26 * f), 414, sg * (hh + 34 * f));
      c.lineTo(444, sg * (hh + 34 * f)); c.lineTo(440, sg * hh); c.closePath();
      const g = c.createLinearGradient(0, sg * (hh + 34 * f), 0, sg * hh);
      g.addColorStop(0, sg < 0 ? PAL.warmHi : PAL.warmLo); g.addColorStop(1, mix(PAL.warmHi, PAL.warmLo, 0.5));
      c.fillStyle = g; c.fill();
      line(c, [[300, sg * (hh + 3)], [438, sg * (hh + 3)]], rgba('#3A1A0C', 0.45), 1.5);   // 깃대
    }
    // 화살대
    const gs = c.createLinearGradient(0, -hh, 0, hh); gs.addColorStop(0, PAL.bodyHi); gs.addColorStop(0.55, PAL.bodyMid); gs.addColorStop(1, PAL.bodyLo);
    rect(c, -262, -hh, 712, 2 * hh, Math.min(hh, 6), gs);
    line(c, [[-258, -hh + 1.5], [446, -hh + 1.5]], rgba('#FFFFFF', 0.45), 1.5);
    rect(c, 446, -hh - 2, 12, 2 * hh + 4, 3, PAL.darker);                                      // 오늬
    // 촉
    c.beginPath(); c.moveTo(-304, 0); c.lineTo(-254, -15 - hh * 0.4); c.lineTo(-244, 0); c.lineTo(-254, 15 + hh * 0.4); c.closePath();
    const gh = c.createLinearGradient(0, -18, 0, 18); gh.addColorStop(0, '#9FB6BD'); gh.addColorStop(0.5, '#58747E'); gh.addColorStop(1, PAL.darker);
    c.fillStyle = gh; c.fill();
    c.restore();
    K.cgMark(c, x, y, 14, theta);
  });
}

// ============================================================================================ 페노의 모형(1871)
/**
 * 페노의 플라노포르(옆모습, px, ⊕ 기준): 가는 막대 동체, 앞쪽 위의 얇은 주날개(끝이 위로 휜 판이 뒤로 비침),
 * 뒤 끝의 작은 난색 꼬리날개(주날개보다 앞쪽이 조금 낮게 — 작은 각), 맨 뒤의 미는 프로펠러, 막대 밑의 꼬인 고무줄.
 * spin = 프로펠러 각(라디안), un = 고무줄이 풀린 정도 0..1, running = 도는 중인가.
 */
function drawPenaud(stage, {x, y, theta = 0, spin = 0, un = 0, running = false, alpha = 1}) {
  if (alpha <= 0) return;
  const c = stage.ctx;
  withAlpha(c, alpha, () => {
    c.save(); c.translate(x, y); c.rotate(theta);
    // 휜 날개 끝(먼 쪽) — 주날개 판 위로 비치는 얇은 면
    { // 먼 쪽 날개 끝이 위로 휜 면: 주날개 판 바로 위의 얇은 띠(한 단 어둡게)
      c.beginPath(); c.moveTo(-62, -42); c.quadraticCurveTo(-50, -58, -36, -60); c.lineTo(96, -57); c.quadraticCurveTo(104, -50, 104, -42); c.closePath();
      const gt = c.createLinearGradient(0, -60, 0, -42); gt.addColorStop(0, mix(PAL.wing, PAL.dark, 0.35)); gt.addColorStop(1, mix(PAL.wing, PAL.dark, 0.75));
      c.fillStyle = gt; c.fill();
    }
    // 받침대
    line(c, [[-34, -6], [-28, -36]], PAL.bodyLo, 3); line(c, [[64, -6], [70, -36]], PAL.bodyLo, 3);
    // 고무줄(막대 밑, 앞 갈고리 → 뒤 갈고리). 꼬인 두 가닥: 풀릴수록 꼬임이 성기고 처진다.
    const x0 = -212, x1 = 446, yb = 15, pitch = lerp(15, 120, un), sag = 12 * un, ph = spin * 0.5;
    for (const k of [0, 1]) {
      const pts = [];
      for (let xx = x0; xx <= x1; xx += 4) {
        const q = (xx - x0) / (x1 - x0), sg = Math.sin(Math.PI * q) * sag;
        pts.push([xx, yb + sg + 3.2 * Math.sin(TAU * (xx - x0) / pitch + ph + k * Math.PI) * (1 - 0.6 * un)]);
      }
      line(c, pts, k ? '#58747E' : '#8AA0A6', 2.8);
    }
    line(c, [[x0, 4], [x0, yb + 2]], PAL.darker, 2.5); line(c, [[x1, 4], [x1, yb + 2]], PAL.darker, 2.5);   // 갈고리
    // 막대 동체
    const gs = c.createLinearGradient(0, -5, 0, 5); gs.addColorStop(0, PAL.bodyHi); gs.addColorStop(0.55, PAL.bodyMid); gs.addColorStop(1, PAL.bodyLo);
    rect(c, PEN.nose, -5, PEN.end - 8 - PEN.nose, 10, 4, gs);
    // 주날개(얇은 판, 앞전이 조금 높게)
    c.save(); c.translate(25, -38); c.rotate(-2.5 * D);
    c.beginPath(); c.moveTo(-85, 1); c.quadraticCurveTo(-45, -10, 85, -1); c.lineTo(85, 3); c.quadraticCurveTo(-40, -1, -85, 5); c.closePath();
    const gw = c.createLinearGradient(0, -9, 0, 5); gw.addColorStop(0, PAL.bodyHi); gw.addColorStop(0.45, PAL.wing); gw.addColorStop(1, PAL.bodyLo); c.fillStyle = gw; c.fill();
    c.restore();
    // 꼬리날개(난색, 주날개보다 작은 각 — 앞전이 조금 낮다)
    c.save(); c.translate(372, -15); c.rotate(3 * D);
    c.beginPath(); c.moveTo(-40, 0); c.quadraticCurveTo(-10, -6, 40, -1); c.lineTo(40, 2); c.quadraticCurveTo(-10, -1, -40, 3); c.closePath();
    const gt = c.createLinearGradient(0, -6, 0, 3); gt.addColorStop(0, PAL.warmHi); gt.addColorStop(1, PAL.warmLo); c.fillStyle = gt; c.fill();
    c.restore();
    line(c, [[352, -5], [356, -14]], PAL.darker, 2.5);
    // 미는 프로펠러(옆에서 본 두 날: 원판이 옆으로 서 있어 날의 보이는 길이가 cos 로 바뀐다)
    const px = PEN.end - 2;
    if (running) { c.beginPath(); c.ellipse(px, 0, 5, 62, 0, 0, TAU); c.fillStyle = rgba(PAL.muted, 0.16); c.fill(); }
    for (const k of [0, 1]) {
      const a = spin + k * Math.PI, ly = 60 * Math.cos(a), wd = 4 + 7 * Math.abs(Math.sin(a));
      c.beginPath(); c.ellipse(px, ly / 2, wd / 2, Math.abs(ly) / 2 + 1, 0, 0, TAU);
      const gb = c.createLinearGradient(px - wd, 0, px + wd, 0); gb.addColorStop(0, '#6E8A93'); gb.addColorStop(1, '#1E333B');
      c.fillStyle = gb; c.fill();
    }
    circle(c, px, 0, 6, PAL.darker);
    c.restore();
    K.cgMark(c, x, y, 14, theta);
  });
}

/** 거리 자(바닥): 10 m 마다 금, ⊕ 바로 아래의 바늘이 지금 거리를 읽는다. 모형은 왼쪽으로 날아가므로 땅의 금은 오른쪽으로 흐른다. */
function distanceRuler(stage, P, t, a) {
  if (a <= 0) return;
  const c = stage.ctx, d = FLIGHT.m * clamp((t - P.prop0) / FLIGHT.sec), Y = 1124, X = m => WT.x + (d - m) * P.pxPerM;
  const done = t >= P.propEnd, g40 = clamp(1 - (t - P.mark40) / 0.8) * (t >= P.mark40 ? 1 : 0);
  withAlpha(c, a, () => {
    line(c, [[WT.x, WT.y + 22], [WT.x, Y - 38]], rgba(PAL.muted, 0.45), 2, {dash: [4, 7]});   // ⊕ ↔ 바늘(같은 자)
    line(c, [[60, Y], [1020, Y]], rgba(PAL.muted, 0.9), 3, {cap: 'butt'});
    for (let m = 0; m <= FLIGHT.m; m += 2) {
      const xm = X(m); if (xm < 50 || xm > 1030) continue;
      const major = m % 10 === 0;
      line(c, [[xm, Y], [xm, Y + (major ? 22 : 9)]], rgba(PAL.muted, major ? 0.95 : 0.6), major ? 3 : 2, {cap: 'butt'});
      if (major) {
        const glow = m === FLIGHT.m ? g40 : 0;
        if (glow > 0) ring(c, xm, Y + 46, 34 + 10 * (1 - glow), rgba(PAL.ink, 0.8 * glow), 2.5);
        stage.text(m === 0 ? '0' : `${m} m`, xm, Y + 46, {size: m === FLIGHT.m ? 30 : 26, weight: m === FLIGHT.m ? 700 : 500, color: m === FLIGHT.m ? PAL.ink : PAL.muted, align: 'center'});
      }
    }
    poly(c, [[WT.x, Y - 4], [WT.x - 11, Y - 22], [WT.x + 11, Y - 22]], PAL.ink);
    const lab = done ? `${FLIGHT.m} m · ${FLIGHT.sec}초` : `${Math.floor(d)} m`;
    stage.text(lab, WT.x, Y - 56, {role: 'display', weight: 700, size: 50, color: PAL.ink, align: 'center'});
  });
}

// ============================================================================================ 시소·끼움 그림
/** 시소: 받침이 축 x 바로 아래. 왼쪽 가까이 큰 추(힘 4, 거리 1), 오른쪽 작은 난색 추(힘 1, 거리 d). 그 프레임의 4×1 과 1×d 를 견줘 기운다. */
function drawSeesaw(stage, {d, a = 1, labA = 1, prodA = 0}) {
  if (a <= 0) return null;
  const c = stage.ctx, X = WT.x, Y = SEESAW.y, U = SEESAW.unit;
  const tilt = 8 * D * Math.tanh((1 * d - 4 * 1) * 4);          // + = 오른쪽이 내려감
  const B = (u, n = 0) => [X + u * Math.cos(tilt) - n * Math.sin(tilt), Y + u * Math.sin(tilt) + n * Math.cos(tilt)];
  withAlpha(c, a, () => {
    poly(c, [[X, Y + 6], [X - 26, Y + 50], [X + 26, Y + 50]], PAL.dark, rgba(PAL.muted, 0.9), 2);   // 받침
    c.save(); c.translate(X, Y); c.rotate(tilt);
    const gb = c.createLinearGradient(0, -7, 0, 7); gb.addColorStop(0, '#9FB6BD'); gb.addColorStop(1, PAL.dark);
    rect(c, -170, -7, 640, 14, 5, gb);
    for (let k = -1; k <= 4; k++) if (k) {
      line(c, [[k * U, 7], [k * U, 17]], rgba(PAL.muted, 0.9), 2, {cap: 'butt'});
    }
    // 큰 추(무게 4, 무채색 덩어리)
    const gk = c.createLinearGradient(0, -95, 0, -7); gk.addColorStop(0, PAL.bodyMid); gk.addColorStop(1, PAL.bodyLo);
    rect(c, -U - 42, -91, 84, 84, 8, gk); line(c, [[-U - 38, -89], [-U + 38, -89]], rgba('#FFFFFF', 0.4), 2);
    // 작은 추(무게 1, 난색)
    const gw = c.createLinearGradient(0, -51, 0, -7); gw.addColorStop(0, PAL.warmHi); gw.addColorStop(1, PAL.warmLo);
    rect(c, d * U - 22, -51, 44, 44, 6, gw);
    c.restore();
    for (let k = -1; k <= 4; k++) if (k) { const p = B(k * U, 32); stage.text(String(Math.abs(k)), p[0], p[1], {size: 24, weight: 500, color: PAL.muted, align: 'center'}); }
    const pk = B(-U, -48), pw = B(d * U, -28);
    stage.text('4', pk[0], pk[1], {role: 'display', weight: 700, size: 36, color: PAL.deep, align: 'center'});
    stage.text('1', pw[0], pw[1], {role: 'display', weight: 700, size: 26, color: PAL.deep, align: 'center'});
    circle(c, X, Y, 7, PAL.ink);
    if (labA > 0) withAlpha(c, labA, () => {
      const lk = B(-U, -128), lw = B(d * U, -84), ds = d.toFixed(1);
      stage.text(`힘 4 × 거리 1${prodA > 0.5 ? ' = 4' : ''}`, lk[0], lk[1], {size: 30, weight: 500, color: PAL.ink, align: 'center'});
      stage.text(`힘 1 × 거리 ${ds}${prodA > 0.5 ? ` = ${ds}` : ''}`, Math.min(lw[0], 940 - 150), lw[1], {size: 30, weight: 500, color: PAL.warmHi, align: 'center'});
    });
  });
  return {tilt, small: B(d * U, -51), fulcrum: [X, Y]};
}
/** 넓이 끼움 그림(평면도): 주날개 1, 수평 꼬리날개 1/4. 보잉 737·A320 의 값(brief 출처 1)이고, 모형의 평면도도 같은 비(0.255)로 그렸다. */
function insetArea(stage, a) {
  if (a <= 0) return;
  const c = stage.ctx, bx = 60, by = 772, bw = 335, bh = 196, m = {x: 160, y: 845, s: 0.45, theta: 0};
  withAlpha(c, a, () => {
    rect(c, bx, by, bw, bh, 10, rgba(PAL.plate, 0.96), rgba(PAL.border, 1), 2);
    K.drawTop(stage, m);
    const wP = K.toScreen(m, 30, -100), sP = K.toScreen(m, 166, -40);
    line(c, [wP, [262, 812]], rgba(PAL.muted, 0.8), 1.5);
    line(c, [sP, [262, 870]], rgba(PAL.warmHi, 0.8), 1.5);
    stage.text('1', 270, 812, {role: 'display', weight: 700, size: 40, color: PAL.ink});
    stage.text('1/4', 270, 872, {role: 'display', weight: 700, size: 40, color: PAL.warm});
    stage.text('수평 꼬리날개 넓이 ·', bx + 14, 924, {size: 24, weight: 500, color: PAL.muted});
    stage.text('보잉 737, A320 기준', bx + 14, 952, {size: 24, weight: 500, color: PAL.muted});
  });
}
function tag(stage, text, x, y, to, a) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => {
    line(stage.ctx, [[x, y + 20], to], rgba(PAL.ink, 0.6), 2);
    stage.text(text, x, y, {size: 30, weight: 500, color: PAL.ink, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 10});
  });
}
function floorOn(stage, a) { if (a > 0) withAlpha(stage.ctx, a, () => K.gaugeFloor(stage, FLOOR.y0, FLOOR.y1)); }

// ============================================================================================ 장면
export const scenes = {
  origin(stage, t, p, ctx) {
    const P = plan(ctx), c = stage.ctx, ph = ctx.clock.phase(t);
    // hook 의 화면 전체 연기 → 풍동 창(260~760)과 계기 바닥
    const qw = smooth((t - P.O0 - 0.15) / 0.8);
    K.smokeField(stage, ph, {y0: lerp(0, WIN.y0, qw), y1: lerp(1920, WIN.y1, qw)});
    const hand = 1 - smooth((t - P.O0) / 0.5);
    if (hand > 0) withAlpha(c, hand, () => {
      K.drawSide(stage, {x: 400, y: 470, s: 2.9, tail: 'ghost'});
      K.drawSide(stage, {x: 400, y: 1110, s: 2.9, tail: 'on'});
    });
    floorOn(stage, qw);

    // --- 물체: 화살 → (s05) 비행기 → (s06) 페노의 모형 → (끝) 비행기
    const q1 = clamp((t - P.morph1) / 1.2), q2 = clamp((t - P.morph2) / 0.6), q3 = clamp((t - P.morph3) / 0.7);
    const aArrow = smooth((t - P.O0) / 0.5) * (1 - smooth((q1 - 0.35) / 0.45));
    const thArrow = kicksTheta('arrow', P.kicks.arrow, t);
    const aPlane = smooth((q1 - 0.3) / 0.5) * (1 - smooth(q2)) + smooth(q3);
    const aPen = smooth(q2) * (1 - smooth(q3));
    const thPen = kicksTheta('penaud', P.kicks.penaud, t);
    const mA = {...WT, theta: thArrow};
    drawArrow(stage, {x: WT.x, y: WT.y, theta: thArrow, thick: lerp(1, 6, smooth(q1 / 0.6)), alpha: aArrow});
    if (aArrow > 0.05) {
      gusts(stage, P.kicks.arrow, t, up => rot({...WT, theta: 0}, -266, up ? 9 : -9));
      const fp = rot(mA, 380, 0);                                     // 깃털이 바람을 받아 촉을 되돌리는 힘(난색)
      K.forceArrow(stage, fp[0], fp[1], 60 * thArrow / M.TH0, PAL.warm, {alpha: aArrow});
    }
    const wordGlow = win(t, P.word, P.morph2 - 0.2, 0.4);
    if (aPlane > 0) withAlpha(c, aPlane, () => K.drawSide(stage, {...WT, theta: 0, tail: 'on', hl: {tail: 0.8 * wordGlow * (1 - smooth(q2))}}));
    const now = t - P.prop0, running = now > 0 && now < FLIGHT.sec, un = clamp(now / FLIGHT.sec);
    const W = TAU * 2.2, spin = now <= 0 ? 0 : W * FLIGHT.sec * (2 / 3) * (1 - Math.pow(1 - un, 1.5));
    drawPenaud(stage, {x: WT.x, y: WT.y, theta: thPen, spin, un, running, alpha: aPen});
    if (aPen > 0.05) {
      gusts(stage, P.kicks.penaud, t, up => rot({...WT, theta: 0}, PEN.nose + 22, up ? 6 : -6));
      const tp = rot({...WT, theta: thPen}, 372, -16);
      K.forceArrow(stage, tp[0], tp[1], 60 * thPen / M.TH0, PAL.warm, {alpha: aPen});
    }

    // --- 계기 바닥
    // s04: 촉의 각도 기록선(실시간)
    const aTrA = win(t, P.s04.start - 0.2, P.morph1 + 0.3, 0.4);
    if (aTrA > 0) {
      stage.text('촉의 각도', 150, 782, {size: 26, weight: 500, color: PAL.muted, alpha: aTrA});
      K.traceGauge(stage, {x: 150, y: 812, w: 760, h: 150, t0: P.s04.start, span: P.s05.start - P.s04.start, yMin: -13, yMax: 13, ticks: [-10, 0, 10], alpha: aTrA},
        [{fn: tt => kicksTheta('arrow', P.kicks.arrow, tt), col: PAL.warm, upTo: Math.min(t, P.s05.start)}]);
    }
    const aBigA = win(t, P.kA1 - 0.3, P.morph1 + 0.3, 0.3);
    if (aBigA > 0) K.bigAngle(stage, 940, 318, thArrow, {warm: true, align: 'right', prefix: '촉 ', alpha: aBigA});
    // s05: 낱말(내레이션이 읽지 않으므로 화면에 반드시)
    const aW = win(t, P.word, P.morph2 - 0.1, 0.45), aE = win(t, P.etym, P.morph2 - 0.1, 0.4);
    if (aW > 0) {
      const dx = -260 * (1 - easeOut((t - P.word) / 0.55));
      const w = stage.text('empennage', 540 + dx, 880, {role: 'display', weight: 700, size: 84, color: PAL.ink, align: 'center', alpha: aW});
      withAlpha(c, aW * 0.9, () => line(c, [[540 + dx + w / 2 + 14, 858], K.toScreen({...WT, theta: 0}, 146, -40)], rgba(PAL.warmHi, 0.55), 2, {dash: [5, 7]}));
    }
    if (aE > 0) {
      const o = {size: 34, weight: 500};
      const parts = [['← empenner · 프랑스어 ', PAL.muted], ['"화살에 깃털을 달다"', PAL.warm]];
      const tw = parts.reduce((s, [str]) => s + stage.measure(str, o), 0);
      let xx = 540 - tw / 2;
      for (const [str, col] of parts) xx += stage.text(str, xx, 972, {...o, color: col, alpha: aE});
    }
    // s06: 1871, 거리 자 / s07: 기록선
    const aY = win(t, P.year, P.s07.start - 0.1, 0.4);
    if (aY > 0) stage.text('1871', 90, 890, {role: 'display', weight: 700, size: 112, color: PAL.ink, alpha: aY});
    distanceRuler(stage, P, t, win(t, P.morph2 + 0.1, P.O1, 0.5));
    const aTrP = win(t, P.s07.start - 0.4, P.O1, 0.4);
    if (aTrP > 0) {
      stage.text('기수 각도', 520, 782, {size: 26, weight: 500, color: PAL.muted, alpha: aTrP});
      K.traceGauge(stage, {x: 540, y: 812, w: 380, h: 130, t0: P.s07.start - 0.2, span: 4.5, yMin: -10, yMax: 10, ticks: [-6, 0, 6], alpha: aTrP},
        [{fn: tt => kicksTheta('penaud', P.kicks.penaud, tt), col: PAL.warm, upTo: t}]);
      K.bigAngle(stage, 940, 318, thPen, {warm: true, align: 'right', alpha: aTrP * fadeOut(t, P.O1 - 1.0, 0.4)});
    }
  },

  essence(stage, t, p, ctx) {
    const P = plan(ctx), c = stage.ctx, ph = ctx.clock.phase(t);
    K.smokeField(stage, ph, WIN);
    floorOn(stage, 1);
    const F1 = [P.flip1, P.flip1 + 0.8], F2 = [P.flip2, P.flip2 + 0.8];
    const q1 = clamp((t - F1[0]) / 0.8), q2 = clamp((t - F2[0]) / 0.8);
    const pitch = kicksTheta('tailed', P.kicks.pitch, t), yaw = kicksTheta('vane', P.kicks.yaw, t);
    const inTop = t >= F1[1] && t < F2[0], flipping = (t >= F1[0] && t < F1[1]) || (t >= F2[0] && t < F2[1]);
    const s = t < F1[0] || t >= F2[1] ? WT.s : inTop ? TOP_S : t < F1[1] ? lerp(WT.s, TOP_S, easeInOut(q1)) : lerp(TOP_S, WT.s, easeInOut(q2));
    const side = st => K.drawSide(st, {...WT, s, theta: pitch, tail: 'on', hl: {track: hlTrack}});
    const top = st => K.drawTop(st, {...WT, s, theta: yaw, tail: 'on', hl: {trackFin: hlFin}});
    const hlTrack = win(t, P.E0 + 0.1, F1[0], 0.4), hlFin = win(t, F1[1], F2[0], 0.4);
    if (t >= F1[0] && t < F1[1]) K.flipView(stage, q1, side, top, {cy: WT.y});
    else if (t >= F2[0] && t < F2[1]) K.flipView(stage, q2, top, side, {cy: WT.y});
    else (inTop ? top : side)(stage);
    if (!flipping) {
      const m0 = {...WT, s, theta: 0};
      if (inTop) gusts(stage, P.kicks.yaw, t, up => K.toScreen(m0, -112, up ? 16 : -16));
      else gusts(stage, P.kicks.pitch, t, up => K.toScreen(m0, -100, up ? 18 : -14));
    }
    // 이름표는 한 번에 하나
    if (hlTrack > 0) { const sp = K.toScreen({...WT, theta: pitch}, ...K.SIDE_PTS.stab); tag(stage, '수평 꼬리날개', 800, 340, [sp[0] - 10, sp[1] - 92], hlTrack); }
    if (hlFin > 0) { const fp = K.toScreen({...WT, s: TOP_S, theta: yaw}, ...K.TOP_PTS.fin); tag(stage, '수직 꼬리날개', 770, 340, [fp[0], fp[1] - 58], hlFin); }

    // s08 계기: 기수 각도 기록선(옆모습은 위아래, 평면도는 좌우 — 같은 자)
    const aTr = win(t, P.E0, P.flip2 + 0.3, 0.4), mid1 = F1[0] + 0.4;
    if (aTr > 0) {
      stage.text(t < mid1 ? '기수 각도 · 위아래' : '기수 각도 · 좌우', 150, 782, {size: 26, weight: 500, color: PAL.muted, alpha: aTr});
      K.traceGauge(stage, {x: 150, y: 812, w: 760, h: 150, t0: P.E0, span: P.s09.start - P.E0, yMin: -9, yMax: 9, ticks: [-6, 0, 6], alpha: aTr},
        [{fn: tt => (tt < mid1 ? kicksTheta('tailed', P.kicks.pitch, tt) : kicksTheta('vane', P.kicks.yaw, tt)), col: PAL.warm, upTo: Math.min(t, P.s09.start)}]);
    }

    // s09 시소 / s10 추 = 꼬리날개
    const d = t < P.slide ? 1 : Math.min(4.2, 1 + 3.2 * (t - P.slide) / P.slideDur);
    const aSee = win(t, F2[0] + 0.5, P.E1, 0.4);
    const sw = drawSeesaw(stage, {d, a: aSee, labA: win(t, P.slide - 0.6, P.s10.start + 0.5, 0.4), prodA: t >= ctx.tl.wordStart('s09', '곱한') ? 1 : 0});
    const aLink = win(t, P.s10.start, P.E1, 0.6);
    if (sw && aLink > 0) withAlpha(c, aLink * aSee, () => {
      const m = {...WT, theta: pitch}, st = K.toScreen(m, M.LT, -5);
      line(c, [sw.small, st], rgba(PAL.warmHi, 0.75), 2.5, {dash: [6, 7]});
      line(c, [[WT.x, SEESAW.y - 10], [WT.x, WT.y + 20]], rgba(PAL.ink, 0.5), 2, {dash: [4, 7]});
    });
    // 세계 안의 자: ⊕ → 꼬리날개(모형과 함께 돈다)
    const aR = win(t, P.ruler, P.E1, 0.4);
    if (aR > 0) withAlpha(c, aR, () => {
      const m = {...WT, theta: pitch}, a0 = K.toScreen(m, 0, 44), a1 = K.toScreen(m, M.LT, 44), n = [-Math.sin(pitch), Math.cos(pitch)];
      const grow = smooth((t - P.ruler) / 0.5), aE = [lerp(a0[0], a1[0], grow), lerp(a0[1], a1[1], grow)];
      line(c, [a0, aE], PAL.ink, 2.5);
      for (const q of [a0, aE]) line(c, [[q[0] - n[0] * 10, q[1] - n[1] * 10], [q[0] + n[0] * 10, q[1] + n[1] * 10]], PAL.ink, 2.5);
      const mp = K.toScreen(m, M.LT / 2, 63);
      stage.text('멀리', mp[0], mp[1], {size: 32, weight: 700, color: PAL.ink, align: 'center', alpha: grow});
    });
    insetArea(stage, win(t, P.inset, P.E1, 0.4));
    // s10 돌풍: 꼬리날개의 짧은 난색 화살표(실시간) — 큰 숫자가 같은 프레임에
    // 꼬리날개의 늘어난 힘(난색, lit) — s08 의 끄덕임과 s10 의 돌풍 모두 같은 식(model.dLt)
    if (!flipping && inTop) { const fp = K.toScreen({...WT, s, theta: yaw}, ...K.TOP_PTS.fin); K.forceArrow(stage, fp[0], fp[1], M.dLt(yaw) * K.FORCE_PX, PAL.warm); }
    if (!flipping && !inTop) { const sp = K.toScreen({...WT, theta: pitch}, ...K.SIDE_PTS.stab); K.forceArrow(stage, sp[0], sp[1], M.dLt(pitch) * K.FORCE_PX, PAL.warm); }
    if (t > P.s10.start) {
      const aB = win(t, P.kE5 - 0.3, P.E1 - 0.3, 0.3);
      if (aB > 0) K.bigAngle(stage, 940, 318, pitch, {warm: true, align: 'right', alpha: aB});
    }
    if (t >= F2[0] + 0.4 && t < P.s10.start) stage.text('(돌림힘)', 540, 284, {size: 26, weight: 500, color: PAL.muted, align: 'center', alpha: win(t, F2[0] + 0.4, P.s10.start, 0.3)});
  },
};

// 이 모듈의 장면은 모두 실제 빠르기 — 모형 시간이 벽시계와 다르게 흐르는 구간이 없다.
export function rateSegs() { return []; }

export function titles(id, ctx) {
  const P = plan(ctx);
  if (id === 'origin') return [
    [P.O0, '기원 · 화살의 깃털', '깃털이 화살을 바로잡는다'],
    [P.s05.start, '이름 · 프랑스어에서', '꼬리날개 = 화살의 깃털'],
    [P.s06.start, '기원 · 1871년 파리 · 실제 빠르기', '페노의 고무줄 비행기'],
    [P.s07.start, '기원 · 1871년 파리 · 실제 빠르기', '사람 없이도 스스로 바로잡는다'],
  ];
  if (id === 'essence') return [
    [P.E0, '옆에서 본 모습', '꼬리날개는 둘'],
    [P.flip1 + 0.4, '위에서 본 모습', '꼬리날개는 둘'],
    [P.flip2 + 0.4, '옆에서 본 모습 · 비유: 시소', '돌리는 효과 = 힘 × 거리'],
    [P.s10.start, '옆에서 본 모습', '멀리 있는 작은 날개'],
  ];
  return [];
}

/**
 * 각도를 따르는 음(PLAN 6절 tone_*): 음높이 220 × 2^(θ/60°) Hz(660 에서 자름), 벽시계 0.05초 간격.
 * ev = 사건 목록(tl.events(...)) — 없으면 sound_b.json 의 at 을 직접 푼다.
 */
export function genSound(tl, ev) {
  const T = id => (ev?.has?.(id) ? ev.get(id).time : tl.at(SPEC[id]));
  const runs = [
    ['b_tone_arrow', 'arrow', [['b_kick_a1', 1], ['b_kick_a2', -1]], '화살의 촉 각도(돌풍 두 번 → 되돌아옴)'],
    ['b_tone_penaud', 'penaud', [['b_kick_p1', 0.6], ['b_kick_p2', -0.6]], '페노의 모형의 기수 각도'],
    ['b_tone_pitch', 'tailed', [['b_kick_e1', 0.6], ['b_kick_e2', -0.6]], '옆모습 — 기수 위아래 각도'],
    ['b_tone_yaw', 'vane', [['b_kick_e3', 0.6], ['b_kick_e4', -0.6]], '평면도 — 기수 좌우 각도'],
    ['b_tone_e5', 'tailed', [['b_kick_e5', 1]], '작은 힘으로 제자리로(기수 각도)'],
  ];
  return runs.map(([id, obj, kk, means]) => {
    const ks = kk.map(([k, a]) => [T(k), a]), t0 = ks[0][0] - 0.05, t1 = ks[ks.length - 1][0] + 1.6, dur = t1 - t0, pts = [];
    for (let r = 0; r <= dur + 1e-9; r += 0.05) {
      const th = kicksTheta(obj, ks, t0 + r) / D, f = Math.min(660, 220 * Math.pow(2, th / 60));
      const amp = 0.55 * smooth(r / 0.08) * (1 - smooth((r - (dur - 0.4)) / 0.4));
      pts.push([+r.toFixed(3), +f.toFixed(1), +amp.toFixed(3)]);
    }
    return {id, at: +t0.toFixed(3), kind: 'chirp', params: {points: pts, gain_db: -24}, means: `각도를 따르는 음 — ${means}. 220 × 2^(θ/60°) Hz`};
  });
}
