// 66 꼬리날개 — 장면 모듈 A: hook, wing, tail (PLAN.md 5.1 · 5.4 · 5.5, 9절 계약).
// 모든 각도·힘·계기·소리는 model.mjs 에서 읽는다(같은 시계). 사건 시각은 sound_a.json → ctx.events.
// 연기 줄은 ctx.clock.phase(t)(영상 전체에 하나), 모형 시간은 rateSegs 와 같은 구간으로 M.tau / M.runTheta.
// lit() 은 kit 의 부품(돌풍·힘 화살표·기록선 끝점)만 쓴다. 자막·숫자·이름표·연기 줄·모형은 lit() 밖.
import {rgba, mix, clamp, lerp, smooth, line, circle, ring, withAlpha, TAU} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';
import * as M from './model.mjs';

const {PAL} = K, D2R = M.D2R;
const SLOW = 1 / 8;                                   // 8배 느리게
const ZOOM_AT = 60;                                  // wing: 이 각을 넘으면 카메라가 물러난다(90° 에서는 동체가 계기 자리까지 내려와 늦음)
const fin = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fout = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, d = 0.3) => fin(t, a, d) * fout(t, b, d);

// ---------- 배치 ----------
const UP = {x: 400, y: 470, s: 2.9}, DN = {x: 400, y: 1110, s: 2.9};            // hook: 위 = 꼬리날개 없음, 아래 = 있음
const WT = {x: 410, y: 520, s: 3.0, beamY: 800, barY: 985, win: [260, 760], floor: [760, 1240],
  trace: {x: 130, y: 1078, w: 380, h: 132, t0: 0, span: 2.5},
  lensW: {cx: 240, cy: 352, r: 90, mag: 2.2},          // s12: 축 가까이(지시선이 저울을 가로지르지 않게 — 1단계 약점)
  lensT: {cx: 830, cy: 1110, r: 115, mag: 2.5}};       // s14~s17: 꼬리날개
const GUST_AT = m => K.toScreen({...m, theta: 0}, -96, 20);

// =====================================================================================================
// plan(tl, ev): 사건 시각 → run 과 rate 구간(한 번 계산해 캐시)
// =====================================================================================================
let CACHE = null;
function plan(tl, ev) {
  if (CACHE && CACHE.tl === tl && CACHE.ev === ev) return CACHE.p;
  const T = id => ev.get(id).time, w = (s, x) => tl.wordStart(s, x);
  const hook = tl.scene('hook'), wing = tl.scene('wing'), tail = tl.scene('tail');
  // hook — 결과 먼저(run0) → 되감기 → s03(run1)
  const kick0 = T('a_kick0'), rw0 = T('a_rewind'), at0 = T('a_attach0');
  const rwRate = -((rw0 - kick0) + 0.25) / (at0 - rw0);     // 되감기 끝에 모형 시간 −0.25(돌풍이 올라오기 전)
  const hookSegs = [{t0: rw0, t1: at0, rate: rwRate}];
  const run0 = {id: 'hook0', kick: kick0, segs: [...hookSegs, {t0: at0, t1: Infinity, rate: 0}]};
  const run1 = {id: 'hook1', kick: T('a_kick1'), segs: [], reset: hook.end - 1.0};
  // wing
  const slow0 = T('a_slow0'), kw = T('a_kick_w'), fr0 = T('a_freeze0'), rel0 = T('a_release0'), resetW = wing.end - 0.6;
  const wingSegs = [{t0: slow0, t1: fr0, rate: SLOW}, {t0: fr0, t1: rel0, rate: 0}, {t0: rel0, t1: resetW, rate: SLOW}];
  const runW = {id: 'wing', kick: kw, segs: wingSegs, reset: resetW};
  // tail
  const slow1 = T('a_slow1'), kt = T('a_kick_t'), fr1 = T('a_freeze1'), rel1 = T('a_release1'), resetT = tail.end - 0.5;
  const tailSegs = [{t0: slow1, t1: fr1, rate: SLOW}, {t0: fr1, t1: rel1, rate: 0}, {t0: rel1, t1: resetT, rate: SLOW}];
  const runT = {id: 'tail', kick: kt, segs: tailSegs, reset: resetT};
  for (const [r, f] of [[runW, fr0], [runT, fr1]]) {
    const d = Math.abs(M.tau(r, f) - M.RISE);
    if (d > 0.01) console.warn(`[scenes_a] ${r.id}: 멈춤 시각의 모형 시간이 RISE 와 ${d.toFixed(3)} 다릅니다(기수가 10° 에서 멈추지 않음)`);
  }
  // wing: ZOOM_AT 을 넘는 시각(카메라가 물러남), 장면 끝의 모형 시간(tail 의 기록선 잔상)
  let t90 = Infinity;
  for (let t = rel0; t < resetW; t += 1 / 120) if (M.runTheta(runW, 'tailless', t) >= ZOOM_AT * D2R) { t90 = t; break; }
  let t22 = Infinity;
  for (let t = rel0; t < resetW; t += 1 / 120) if (M.runTheta(runW, 'tailless', t) >= 22 * D2R) { t22 = t; break; }
  // tail: 처음 0 을 지나는 시각(효과 막대가 물러남)
  let t0x = Infinity;
  for (let t = rel1; t < resetT; t += 1 / 120) if (M.runTheta(runT, 'tailed', t) < 0) { t0x = t; break; }
  const p = {
    hook: {sc: hook, kick0, rw0, at0, d0: T('a_detach0'), d1: T('a_detach1'), piv1: T('a_pivot1'), piv2: T('a_pivot2'), run0, run1,
      labels: w('s02', '모형'), prot: w('s02', '모형') + 0.4},
    wing: {sc: wing, slow0, kw, fr0, rel0, resetW, run: runW, t90, t22, det: T('a_detachW'), tauEnd: M.tau(runW, resetW),
      angLbl: fr0 + 0.2, beam: w('s11', '양력이') - 1.2, ac: w('s11', '양력이'), links: tl.sentence('s12').start - 0.35,
      lens: T('a_lens0'), garrows: T('a_lens0') + 1.55, dim: w('s12', '무게중심보다'), brackets: w('s12', '무게중심보다') + 0.5,
      bars: w('s12', '무게중심보다') + 1.1},
    tail: {sc: tail, att: T('a_attach1'), slow1, kt, fr1, rel1, resetT, run: runT, t0x,
      track: w('s14', '수평'), lens: fr1 + 1.0, links: tl.sentence('s14').end - 0.4, pulse: w('s15', '꼬리날개는'),
      arrows: w('s15', '사분의'), flabels: w('s15', '힘은'), brackets: w('s15', '거리는'), bars: tl.sentence('s15').end + 0.1,
      fill: w('s16', '곱하면')},
    segs: [...hookSegs, ...wingSegs, ...tailSegs],
  };
  CACHE = {tl, ev, p};
  return p;
}

export function rateSegs(tl, ev) { return plan(tl, ev).segs; }

// =====================================================================================================
// 머리글
// =====================================================================================================
const slowK = `${Math.round(1 / SLOW)}배 느리게`;
export function titles(id, ctx) {
  const P = plan(ctx.tl, ctx.events), S = x => ctx.tl.sentence(x).start;
  if (id === 'hook') return [[K.MORPH(ctx.tl)[1], '풍동 모형(사고 실험) · 바람은 왼쪽에서', ''], [S('s03'), '같은 돌풍 · 꼬리날개만 다름', '']];
  if (id === 'wing') {
    const W = P.wing, k = '꼬리날개 없는 모형';
    return [[W.sc.start, k, '기수가 들리면 양력이 커진다'], [W.slow0, `${slowK} · ${k}`, '기수가 들리면 양력이 커진다'],
      [W.fr0, `멈춤 · ${k}`, '기수가 들리면 양력이 커진다'], [S('s12'), `멈춤 · ${k}`, '그 자리가 무게중심보다 앞'],
      [W.rel0, `${slowK} · ${k}`, '그 자리가 무게중심보다 앞'], [S('s13'), `${slowK} · ${k}`, '들릴수록 더 들린다']];
  }
  if (id === 'tail') {
    const T = P.tail, k = '꼬리날개 있는 모형', ratio = Math.round(Math.abs(M.tailEffect(M.TH0)) / M.wingEffect(M.TH0));
    return [[T.sc.start, k, '꼬리날개도 바람을 더 가파르게'], [T.slow1, `${slowK} · ${k}`, '꼬리날개도 바람을 더 가파르게'],
      [T.fr1, `멈춤 · ${k}`, '꼬리날개도 바람을 더 가파르게'], [S('s15'), `멈춤 · ${k}`, '힘은 작지만 거리는 길다'],
      [S('s16'), `멈춤 · ${k}`, `내리는 효과가 ${ratio}배`], [T.rel1, `${slowK} · ${k}`, `내리는 효과가 ${ratio}배`],
      [S('s17'), `${slowK} · ${k}`, '흔들리다 제자리에']];
  }
  return [];
}
export const captionLayout = {};

// =====================================================================================================
// 작은 그림들(이 모듈 전용)
// =====================================================================================================
function label(stage, s, x, y, {a = 1, align = 'left', size = 30, color = PAL.ink, lead = null} = {}) {
  if (a <= 0) return;
  const c = stage.ctx;
  withAlpha(c, a, () => {
    if (lead) line(c, lead, rgba(PAL.ink, 0.7), 2);
    if (lead) circle(c, lead[lead.length - 1][0], lead[lead.length - 1][1], 4, PAL.ink);
    stage.text(s, x, y, {size, weight: 500, color, align, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
  });
}
/** 받는 각: 바람 방향(수평 점선)과 날개(또는 꼬리날개) 시위선 사이의 호. pt = 모형 u 의 앞전, 호는 앞쪽(왼쪽)에. */
function attackArc(stage, m, pt, {R = 78, a = 1, col = PAL.ink, txt = true, tx = null, ty = null, align = 'center'} = {}) {
  if (a <= 0) return;
  const c = stage.ctx, [x, y] = K.toScreen(m, ...pt), th = m.theta;
  withAlpha(c, a, () => {
    line(c, [[x, y], [x - R - 34, y]], rgba(PAL.deep, 0.8), 6);
    line(c, [[x, y], [x - R - 34, y]], rgba(PAL.ink, 0.85), 2, {dash: [6, 6]});
    const ch = [x - (R + 34) * Math.cos(th), y - (R + 34) * Math.sin(th)];
    line(c, [[x, y], ch], rgba(PAL.deep, 0.8), 6); line(c, [[x, y], ch], col, 2.5);
    if (Math.abs(th) > 0.3 * D2R) {
      const a0 = Math.PI, a1 = Math.PI + th;
      ring(c, x, y, R, rgba(PAL.deep, 0.8), 6, Math.min(a0, a1), Math.max(a0, a1));
      ring(c, x, y, R, col, 3, Math.min(a0, a1), Math.max(a0, a1));
    }
    if (txt) stage.text(`받는 각 ${K.degLabel(th)}`, tx ?? x - R - 10, ty ?? y + 44, {size: 28, weight: 500, color: col, align, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12});
  });
}
/** 효과를 화면에 쓰는 값(1, 4 …)으로: 날개의 것을 1 로. */
const effs = th => [M.wingEffect(th), M.tailEffect(th)];
const frac = v => { if (Math.abs(v - 1) < 0.02) return '1'; const n = Math.round(1 / v); return Math.abs(1 / n - v) < 0.01 ? `1/${n}` : v.toFixed(2); };

// =====================================================================================================
// hook (s01~s03)
// =====================================================================================================
function hook(stage, t, p, ctx) {
  const P = plan(ctx.tl, ctx.events), H = P.hook, end = H.sc.end, c = stage.ctx;
  const th = id => M.runTheta(H.run0, id, t) + M.runTheta(H.run1, id, t);
  const mU = {...UP, theta: th('tailless')}, mD = {...DN, theta: th('tailed')};
  K.smokeField(stage, ctx.clock.phase(t), {wake: [K.wakeOf(mU)]});
  // 잔상 부채: 넓은 것(위) / 좁은 것(아래)
  for (const run of [H.run0, H.run1]) {
    for (const g of M.strobe(run, 'tailed', t)) K.drawSide(stage, {...mD, theta: g.theta, ghost: g.a});
    for (const g of M.strobe(run, 'tailless', t)) K.drawSide(stage, {...mU, theta: g.theta, ghost: g.a, tail: 'ghost'});
  }
  // 위 모형의 꼬리날개: 0초에 떠 있던 조각 → 되감기 끝에 돌아와 붙음 → '떼면'에 다시 떨어져 나감
  const att = K.attachPose(t - (H.at0 - 0.5));
  let upTail = 'ghost', flash = 0;
  if (t >= H.at0 && t < H.d1) { upTail = 'on'; flash = att.flash; }
  // 각도기(s02 '모형'부터, 장면 끝 0.4초에 사라짐)
  const aProt = fin(t, H.prot, 0.5) * fout(t, end - 0.4, 0.35);
  if (aProt > 0) {
    K.protractor(stage, mU.x, mU.y, 380, mU.theta, {max: 30, alpha: aProt});
    K.protractor(stage, mD.x, mD.y, 380, mD.theta, {max: 30, alpha: aProt});
  }
  const ringOf = (te) => (t >= te && t < te + 0.9 ? 1 - (t - te) / 0.9 : 0);
  K.drawSide(stage, {...mU, tail: upTail, hl: {tail: flash, cg: ringOf(H.piv1)}});
  K.drawSide(stage, {...mD, tail: 'on', hl: {cg: ringOf(H.piv2)}});
  if (t < H.at0) {
    if (att.pose && t >= H.at0 - 0.5) K.tailPiece(stage, mU, att.pose);
    else K.tailPiece(stage, {...UP, theta: 0}, K.detachPose(Math.max(0, t - H.d0), {pre: [70, -40], hold: 0}));
  }
  if (t >= H.d1) K.tailPiece(stage, {...UP, theta: 0}, K.detachPose(ctx.clock.phase(t) - ctx.clock.phase(H.d1)));
  // 돌풍: 모형 시간을 따른다(되감기에서 거꾸로) — 두 모형에 같은 프레임
  for (const run of [H.run0, H.run1]) {
    if (run.reset != null && t > run.reset) continue;
    const age = M.tau(run, t) + 0.25;
    K.gustPuff(stage, ...GUST_AT(UP), age); K.gustPuff(stage, ...GUST_AT(DN), age);
  }
  // s02 이름표(셋): 무게중심 = 축, 꼬리날개 없음 / 있음
  const s03 = ctx.tl.sentence('s03').start;
  label(stage, '무게중심 = 축', 400, 985, {align: 'center', a: win(t, H.piv1 + 0.1, s03 - 0.3), lead: [[400, 1008], [400, 1086]]});
  label(stage, '꼬리날개 없음', 810, 612, {align: 'center', a: win(t, H.labels, s03 - 0.3), lead: [[810, 588], [845, 470]]});
  label(stage, '꼬리날개 있음', 800, 880, {align: 'center', a: win(t, H.labels + 0.25, s03 - 0.3), lead: [[800, 902], [810, 960]]});
  // s03: 기수 이름표(2초), 큰 숫자 둘(모형이 읽는 값)
  const kick1 = H.run1.kick, nose = K.toScreen(mD, ...K.SIDE_PTS.nose);
  label(stage, '기수 = 비행기의 머리', 60, 1222, {a: win(t, kick1, kick1 + 2.0), lead: [[110, 1200], [nose[0] + 14, nose[1] + 22]]});
  const aNum = fin(t, s03, 0.4) * fout(t, end - 0.4, 0.35);
  if (aNum > 0) {
    K.bigAngle(stage, 940, 312, mU.theta, {align: 'right', size: 60, alpha: aNum});
    K.bigAngle(stage, 940, 862, mD.theta, {warm: true, align: 'right', size: 60, alpha: aNum});
  }
}

// =====================================================================================================
// wing (s11~s13) — 꼬리날개 없는 모형 하나, 8배 느리게
// =====================================================================================================
function wingScene(stage, t, p, ctx) {
  const P = plan(ctx.tl, ctx.events), W = P.wing, end = W.sc.end, c = stage.ctx, phase = ctx.clock.phase(t);
  const th = M.runTheta(W.run, 'tailless', t), tauNow = M.tau(W.run, t);
  // 카메라: ZOOM_AT(60°)을 넘으면 축을 중심으로 물러나고(3.0 → 1.5), 되돌릴 때 돌아온다
  const zoom = smooth((t - W.t90) / 0.8) * (1 - smooth((t - W.resetW) / 0.5));
  const m = {x: WT.x, y: WT.y, s: lerp(WT.s, 1.5, zoom), theta: th};
  const tailOn = t < W.det, aAc = fin(t, W.ac, 0.4);
  const arrowA = 1 - smooth((t - W.resetW) / 0.3);
  const world = (st, inLens = false) => {
    K.smokeField(st, phase, {y0: WT.win[0], y1: WT.win[1]});
    if (!inLens) return;
    drawModel(st);
  };
  const drawModel = st => {
    K.drawSide(st, {...m, tail: tailOn ? 'on' : 'ghost', hl: {ac: aAc}});
    const ac = K.toScreen(m, ...K.SIDE_PTS.ac);
    K.forceArrow(st, ac[0], ac[1], M.dLw(th) * K.FORCE_PX, PAL.cool, {alpha: arrowA});
  };
  world(stage);
  K.gaugeFloor(stage, ...WT.floor);
  drawModel(stage);
  if (t >= W.det) K.tailPiece(stage, {x: WT.x, y: WT.y, s: WT.s, theta: 0}, K.detachPose(phase - ctx.clock.phase(W.det)));
  // 돌풍(모형 시간 — 8배 느리게 올라온다)
  if (t < W.resetW) K.gustPuff(stage, ...GUST_AT(m), tauNow + 0.25);
  // '양력이' — 양력이 걸리는 자리에 고리 한 번
  if (t >= W.ac && t < W.ac + 0.9) { const q = K.toScreen(m, ...K.SIDE_PTS.ac); ring(c, q[0], q[1], 16 + 22 * (t - W.ac), rgba(PAL.cool, 0.9 * (1 - (t - W.ac) / 0.9)), 3); }
  // 받는 각(돌풍부터, 카메라가 물러나면 사라짐)
  const aArc = fin(t, W.kw, 0.3) * (1 - smooth((t - W.t90) / 0.4)) * fout(t, W.resetW - 0.2, 0.3);
  attackArc(stage, m, K.SIDE_PTS.wingLE, {a: aArc, col: PAL.cool, txt: t > W.angLbl, tx: 120, ty: 640, align: 'left'});
  // 각도기: 작은 각은 R 380 · 30° 까지, 물러난 뒤는 R 190 · 180° 까지
  const aEnd = fout(t, end - 0.4, 0.35);
  K.protractor(stage, m.x, m.y, 380, th, {max: 30, alpha: (1 - zoom) * fin(t, W.sc.start, 0.4) * aEnd});
  if (zoom > 0) K.protractor(stage, m.x, m.y, 190, th, {max: 180, alpha: zoom * aEnd});
  K.bigAngle(stage, 940, 318, th, {align: 'right', alpha: fin(t, W.sc.start + 0.2, 0.4) * aEnd});
  // 저울(같은 가로 자 — s 는 3.0 그대로)
  const after90 = 1 - smooth((t - W.t90) / 0.5), endA = fout(t, W.resetW - 0.3, 0.3);
  const show = {beam: fin(t, W.beam, 0.5), links: fin(t, W.links, 0.5) * after90 * endA, arrows: fin(t, W.garrows, 0.4) * after90 * endA,
    brackets: fin(t, W.brackets, 0.4) * after90 * endA, bars: fin(t, W.bars, 0.4) * after90 * endA};
  K.leverGauge(stage, {x: WT.x, y: WT.beamY, s: WT.s, theta: th, my: zoom < 0.02 ? WT.y : null, wing: M.dLw(th), tail: 0, tailOn: false,
    effects: [Math.max(0, M.wingEffect(th)), 0], show, barY: WT.barY});
  // 기록선: 모형 시간
  K.traceGauge(stage, {...WT.trace, alpha: fin(t, W.sc.start, 0.4)}, [{fn: tt => M.theta('tailless', tt), col: PAL.ink, upTo: Math.max(0, tauNow)}]);
  // s12 렌즈: 양력이 걸리는 자리(한색 점)와 ⊕ — 둘 사이 '조금 앞'
  const aLens = fin(t, W.lens, 0.5) * (1 - smooth((t - W.t22) / 0.4));
  if (aLens > 0) {
    const ac = K.toScreen(m, ...K.SIDE_PTS.ac), wx = (ac[0] + m.x) / 2, wy = (ac[1] + m.y) / 2;
    const mag = WT.lensW.mag, aDim = fin(t, W.dim, 0.4);
    K.lens(stage, {...WT.lensW, wx, wy, alpha: aLens}, st => {
      world(st, true);
      if (aDim > 0) withAlpha(st.ctx, aDim, () => {
        const yy = Math.max(ac[1], m.y) + 16, lw = 2 / mag;
        line(st.ctx, [[ac[0], yy], [m.x, yy]], PAL.ink, lw);
        for (const x of [ac[0], m.x]) line(st.ctx, [[x, yy - 5], [x, yy + 5]], PAL.ink, lw);
        line(st.ctx, [[ac[0], ac[1]], [ac[0], yy]], rgba(PAL.ink, 0.6), 1.2 / mag, {dash: [3 / mag, 3 / mag]});
        line(st.ctx, [[m.x, m.y], [m.x, yy]], rgba(PAL.ink, 0.6), 1.2 / mag, {dash: [3 / mag, 3 / mag]});
      });
    });
    label(stage, '조금 앞', WT.lensW.cx + WT.lensW.r + 18, WT.lensW.cy - 46, {a: aLens * aDim});
  }
}

// =====================================================================================================
// tail (s14~s17) — 꼬리날개 있는 모형 하나, 8배 느리게
// =====================================================================================================
function tailScene(stage, t, p, ctx) {
  const P = plan(ctx.tl, ctx.events), T = P.tail, W = P.wing, end = T.sc.end, c = stage.ctx, phase = ctx.clock.phase(t);
  const th = M.runTheta(T.run, 'tailed', t), tauNow = M.tau(T.run, t);
  const m = {x: WT.x, y: WT.y, s: WT.s, theta: th};
  const at = K.attachPose(t - (T.att - 0.5)), tailOn = at.done;
  const aEnd = fout(t, end - 0.4, 0.35);
  const arrowA = (1 - smooth((t - T.resetT) / 0.3));
  const drawModel = st => {
    K.drawSide(st, {...m, tail: tailOn ? 'on' : 'ghost', hl: {ac: fin(t, T.kt, 0.4) * aEnd, tail: Math.max(at.flash, pulseOf(t, T.pulse)), track: win(t, T.track, T.lens, 0.3)}});
    const ac = K.toScreen(m, ...K.SIDE_PTS.ac), sb = K.toScreen(m, ...K.SIDE_PTS.stab);
    K.forceArrow(st, ac[0], ac[1], M.dLw(th) * K.FORCE_PX, PAL.cool, {alpha: arrowA});
    if (tailOn) K.forceArrow(st, sb[0], sb[1], M.dLt(th) * K.FORCE_PX, PAL.warm, {alpha: arrowA});
  };
  K.smokeField(stage, phase, {y0: WT.win[0], y1: WT.win[1]});
  K.gaugeFloor(stage, ...WT.floor);
  drawModel(stage);
  if (at.pose) K.tailPiece(stage, m, at.pose);
  if (t < T.resetT) K.gustPuff(stage, ...GUST_AT(m), tauNow + 0.25);
  // 받는 각: 날개와 꼬리날개가 함께(돌풍부터 풀린 뒤 조금까지)
  const aArc = fin(t, T.kt, 0.3) * fout(t, T.rel1 + 0.8, 0.5);
  attackArc(stage, m, K.SIDE_PTS.wingLE, {a: aArc, col: PAL.cool, R: 70, tx: 120, ty: 640, align: 'left'});
  attackArc(stage, m, [129, -5], {a: aArc, col: PAL.warm, R: 60, txt: false});
  // 각도기·큰 숫자(큰 숫자는 가운데 — 들린 수직 꼬리날개 끝과 겹치지 않게: 1단계 약점)
  K.protractor(stage, m.x, m.y, 380, th, {max: 30, alpha: fin(t, T.sc.start, 0.4) * aEnd});
  K.bigAngle(stage, 590, 318, th, {warm: true, align: 'center', alpha: fin(t, T.sc.start + 0.2, 0.4) * aEnd});
  // 저울: 힘 1 대 1/5, 거리 1 대 20, 효과 1 대 4 — 막대는 '곱하면'부터 차오르고, 다 찬 프레임에 풀린다
  const propA = fout(t, end - 0.4, 0.35), barsOut = 1 - smooth((t - T.t0x) / 0.4);
  const fillQ = t < T.rel1 ? smooth((t - T.fill) / (T.rel1 - T.fill)) : 1;
  const [we, te] = effs(th);
  const show = {beam: propA, links: fin(t, T.links, 0.5) * propA, arrows: fin(t, T.arrows, 0.4) * propA,
    brackets: fin(t, T.brackets, 0.4) * fout(t, T.rel1, 0.5), bars: fin(t, T.bars, 0.4) * barsOut * propA};
  const g = K.leverGauge(stage, {x: WT.x, y: WT.beamY, s: WT.s, theta: th, my: WT.y, wing: M.dLw(th), tail: M.dLt(th), tailOn: true,
    effects: [Math.max(0, we) * fillQ, Math.max(0, -te) * fillQ], show, barY: WT.barY});
  const aF = fin(t, T.flabels, 0.4) * fout(t, T.rel1, 0.4);
  if (aF > 0) {
    label(stage, `힘 ${frac(M.dLw(th))}`, g.wingPt[0] - 24, g.wingPt[1] - 66, {a: aF, align: 'right', size: 28, color: PAL.cool});
    label(stage, `힘 ${frac(M.dLt(th))}`, g.tailPt[0] - 24, g.tailPt[1] - 40, {a: aF * fin(t, T.flabels + 1.0, 0.4), align: 'right', size: 28, color: PAL.warm});
  }
  // 기록선: 앞 장면(꼬리날개 없음)의 결과를 점선 잔상으로
  K.traceGauge(stage, {...WT.trace, alpha: propA}, [
    {fn: tt => M.theta('tailless', tt), col: PAL.ink, dash: [8, 7], alpha: 0.5, upTo: Math.min(WT.trace.span, W.tauEnd)},
    {fn: tt => M.theta('tailed', tt), col: PAL.warm, upTo: Math.max(0, Math.min(tauNow, WT.trace.span))}]);
  // 렌즈: 꼬리날개를 2.5배로(얇은 난색 판이 연기 줄을 비스듬히 맞고, 난색 화살표)
  const aLens = fin(t, T.lens, 0.5) * propA;
  if (aLens > 0) {
    const sb = K.toScreen(m, ...K.SIDE_PTS.stab);
    K.lens(stage, {...WT.lensT, wx: sb[0], wy: sb[1], alpha: aLens}, st => {
      K.smokeField(st, phase, {y0: WT.win[0], y1: WT.win[1]});
      drawModel(st);
    });
  }
}
const pulseOf = (t, te) => (t >= te && t < te + 1.2 ? Math.sin(Math.PI * (t - te) / 1.2) : 0);

export const scenes = {hook, wing: wingScene, tail: tailScene};

// =====================================================================================================
// 소리: 각도를 따르는 음(tools/export_sound.mjs 가 부른다). 음높이 220 × 2^(θ/60°), 660 Hz 에서 자름, 0.05초 간격.
// 느리게 보는 구간에서는 θ 가 그만큼 천천히 움직이므로 음도 그만큼 천천히, 멈춤에서는 그대로 머물고 진폭 0.25.
// run 이 끝나면(되돌릴 때) 0.2초에 사라진다.
// =====================================================================================================
export function genSound(tl, ev) {
  const P = plan(tl, ev), out = [];
  const f = th => Math.min(660, 220 * Math.pow(2, (th * M.R2D) / 60));
  const tone = (id, run, model, t0, tEnd, means) => {
    const pts = [], dt = 0.05;
    for (let t = t0; t <= tEnd + 1e-9; t += dt) {
      const th = M.runTheta(run, model, t), r = M.rateAt(run.segs, t);
      let amp = r === 0 ? 0.25 : 1;
      if (t > tEnd - 0.2) amp *= Math.max(0, (tEnd - t) / 0.2);
      pts.push([+(t - t0).toFixed(3), +f(th).toFixed(1), +amp.toFixed(3)]);
    }
    out.push({id, at: +t0.toFixed(4), kind: 'chirp', params: {points: pts, gain_db: -24}, means});
  };
  const H = P.hook;
  tone('a_tone0', H.run0, 'tailless', H.kick0, H.at0 + 0.2, 'hook 결과 먼저: 꼬리날개 없는 모형의 기수 각(올라가 버리는 음, 되감기에서 내려옴)');
  tone('a_tone1', H.run1, 'tailless', H.run1.kick, H.run1.reset + 0.2, 'hook s03: 꼬리날개 없는 모형의 기수 각(올라가 버리는 음)');
  tone('a_toneW', P.wing.run, 'tailless', P.wing.kw, P.wing.resetW + 0.2, 'wing: 꼬리날개 없는 모형의 기수 각(8배 느리게, 멈춤에서 머묾)');
  tone('a_toneT', P.tail.run, 'tailed', P.tail.kt, P.tail.resetT + 0.2, 'tail: 꼬리날개 있는 모형의 기수 각(제자리로 돌아오는 음)');
  return out;
}
