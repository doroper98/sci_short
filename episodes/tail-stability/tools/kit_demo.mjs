// 66 꼬리날개 — 부품 확인용 도구(타임라인 없이). 장면 코드가 아니다.
//   SCISHORT_ROOT=$PWD node episodes/tail-stability/tools/kit_demo.mjs            # 정지화면 + 묶음
//   SCISHORT_ROOT=$PWD node episodes/tail-stability/tools/kit_demo.mjs --video    # + hook 0~4초 임시 영상(첫 순간 점검용)
// 결과: outputs/tail-stability/kitdemo/ (Git 제외)
// 시각은 PLAN 5절의 어림값을 그대로 쓴다(hook: kick0 0.25초, 되감기 2.2~3.0초). 실제 장면은 plan(tl) 이 timeline 에서 만든다.
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'outputs/tail-stability/kitdemo');
const R = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
const M = await import(pathToFileURL(path.join(HERE, '../model.mjs')));
const K = await import(pathToFileURL(path.join(HERE, '../kit.mjs')));
const {PAL} = K, D = Math.PI / 180;

const stage = R.createStage({theme: R.resolveTheme('noturno')});

// 자막 자리 확인용(실제 자막은 render.mjs 가 그린다): 44 px, 두 줄이면 1321 · 1380
function fakeCaption(lines) {
  const ys = lines.length === 2 ? [1380 - 59, 1380] : [1380];
  lines.forEach((s, i) => stage.text(s, 540, ys[i], {size: 44, weight: 500, color: '#FFFFFF', align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 14, baseline: 'alphabetic'}));
}
function chrome(t, kicker, title, cap) {
  K.captionBand(stage.ctx); K.topBand(stage.ctx);
  K.head(stage, kicker, title);
  R.progressBar(stage, t, 150);
  if (cap) fakeCaption(cap);
}

// =====================================================================================================
// a. hook (PLAN 5.1): 위 = 꼬리날개 없는 모형 (400, 470), 아래 = 있는 모형 (400, 1110), s 2.9
// =====================================================================================================
const HOOK = {segs: [{t0: 2.2, t1: 3.0, rate: -2.75}], kick: 0.25};
// run 의 구간과 바람의 구간은 따로다: 되감기 뒤(3.0초~) 바람은 다시 흐르지만 이 run 의 모형 시간은 0 앞에서 선다(돌풍이 다시 일어나지 않게).
const RUN0 = {id: 'hook0', kick: HOOK.kick, segs: [...HOOK.segs, {t0: 3.0, t1: Infinity, rate: 0}], models: ['tailless', 'tailed']};
const UP = {x: 400, y: 470, s: 2.9}, DN = {x: 400, y: 1110, s: 2.9};
const GUST_AT = m => K.toScreen({...m, theta: 0}, -96, 20);     // 기수 밑(수평 자세 기준)
export function hookFrame(t, {poster = true} = {}) {
  K.background(stage);
  const phase = M.flowPhase(HOOK.segs, t);
  const mU = {...UP, theta: M.runTheta(RUN0, 'tailless', t)}, mD = {...DN, theta: M.runTheta(RUN0, 'tailed', t)};
  K.smokeField(stage, phase, {wake: [K.wakeOf(mU)]});
  for (const g of M.strobe(RUN0, 'tailed', t)) K.drawSide(stage, {...mD, theta: g.theta, ghost: g.a});
  for (const g of M.strobe(RUN0, 'tailless', t)) K.drawSide(stage, {...mU, theta: g.theta, ghost: g.a, tail: 'ghost'});
  K.drawSide(stage, {...mU, tail: 'ghost'});
  K.drawSide(stage, {...mD, tail: 'on'});
  K.tailPiece(stage, {...UP, theta: 0}, K.detachPose(t, {pre: [70, -40], hold: 0}));   // 떠내려간 조각은 돌아오지 않는다(벽시계)
  const age = M.tau(RUN0, t) + 0.25;                                                     // 돌풍은 모형 시간을 따른다(되감기에서 거꾸로)
  K.gustPuff(stage, ...GUST_AT(UP), age); K.gustPuff(stage, ...GUST_AT(DN), age);
  if (poster) K.posterTitle(stage, 0);
}

// =====================================================================================================
// b. wing / tail (PLAN 5.4·5.5): 모형 (410, 520) s 3.0, 연기 260~760, 계기 바닥 760~1240
// =====================================================================================================
const WT = {x: 410, y: 520, s: 3.0, beamY: 800, barY: 985, trace: {x: 130, y: 1078, w: 380, h: 132, t0: 0, span: 2.5}, lens: {cx: 830, cy: 1110, r: 115, mag: 2.5}};
function wtFrame({tailed, th, tauNow, lensOn, lensAt, show, effects, kicker, title, cap, phase = 3.3, ghostTrace = false, protMax = 30}) {
  K.background(stage);
  const m = {x: WT.x, y: WT.y, s: WT.s, theta: th};
  const world = st => {
    K.smokeField(st, phase, {y0: 260, y1: 760});
    K.drawSide(st, {...m, tail: tailed ? 'on' : 'ghost', hl: {ac: 1, track: tailed ? 1 : 0}});
    const ac = K.toScreen(m, ...K.SIDE_PTS.ac), sb = K.toScreen(m, ...K.SIDE_PTS.stab);
    K.forceArrow(st, ac[0], ac[1], M.dLw(th) * K.FORCE_PX, PAL.cool);
    if (tailed) K.forceArrow(st, sb[0], sb[1], M.dLt(th) * K.FORCE_PX, PAL.warm);
  };
  world(stage);
  K.protractor(stage, m.x, m.y, 380, th, {max: protMax});
  K.bigAngle(stage, 940, 318, th, {warm: tailed, align: 'right'});
  K.gaugeFloor(stage, 760, 1240);
  K.leverGauge(stage, {x: m.x, y: WT.beamY, s: WT.s, theta: th, my: m.y, wing: M.dLw(th), tail: tailed ? M.dLt(th) : 0, tailOn: tailed, effects, show, barY: WT.barY});
  const series = [];
  if (ghostTrace) series.push({fn: tt => M.theta('tailless', tt), col: PAL.ink, dash: [8, 7], alpha: 0.5, upTo: 2.5});
  series.push({fn: tt => M.theta(tailed ? 'tailed' : 'tailless', tt), col: tailed ? PAL.warm : PAL.ink, upTo: tauNow});
  K.traceGauge(stage, WT.trace, series);
  if (lensOn) K.lens(stage, {...WT.lens, wx: lensAt[0], wy: lensAt[1]}, world);
  chrome(40, kicker, title, cap);
}

// =====================================================================================================
// c. 평면도 (PLAN 5.6): 축 (400, 600) s 2.2, 연기 260~1000, 계기 바닥 1000~1240
// =====================================================================================================
function topFrame({th = 10 * D, flying = 0, tail = 'on', kicker, title, phase = 1.7, arrow = true, prot = true, ghosts = []}) {
  K.background(stage);
  const m = {x: 400, y: 600, s: 2.2, theta: th};
  K.smokeField(stage, phase, {y0: 260, y1: 1000});
  for (const g of ghosts) K.drawTop(stage, {...m, theta: g, ghost: 0.28, tail});
  K.drawTop(stage, {...m, tail, flying, hl: {trackFin: arrow ? 1 : 0}});
  if (arrow) { const p = K.toScreen(m, ...K.TOP_PTS.fin); K.forceArrow(stage, p[0], p[1], M.dLt(th) * K.FORCE_PX, PAL.warm); }
  if (prot) { K.protractor(stage, m.x, m.y, 330, th, {max: 30}); K.bigAngle(stage, 940, 318, th, {warm: true, align: 'right'}); }
  K.gaugeFloor(stage, 1000, 1240);
  chrome(90, kicker, title);
}

// =====================================================================================================
// d. 카드 뒤집기 (PLAN 4.4)
// =====================================================================================================
function flipFrame(q) {
  K.background(stage);
  K.smokeField(stage, 2.0 + q * 0.8, {y0: 260, y1: 1000});
  const m = {x: 400, y: 600, s: 2.2, theta: 0};
  K.flipView(stage, q, st => K.drawSide(st, m), st => K.drawTop(st, m), {cy: m.y});
  chrome(80, K.flipKicker(q, true), '꼬리날개는 둘');
}

// =====================================================================================================
const jobs = [];
const add = (label, draw, t = 0) => jobs.push({t, label, draw});
for (const t of [0, 0.5, 1.0, 1.5, 2.0, 2.6, 3.2]) add(`hook-${t.toFixed(1)}`, () => hookFrame(t), t);
add('hook-1.0-noposter', () => hookFrame(1.0, {poster: false}), 1.0);
// wing s12: 멈춤, 렌즈가 축 둘레(양력 자리와 ⊕), 저울에 날개 화살표·'없음', 효과 1 · 0
add('wing-s12', () => wtFrame({tailed: false, th: 10 * D, tauNow: M.RISE, lensOn: true, lensAt: K.toScreen({x: WT.x, y: WT.y, s: WT.s, theta: 10 * D}, -4, 4),
  effects: [1, 0], kicker: '멈춤 · 꼬리날개 없는 모형', title: '그 자리가 무게중심보다 앞', cap: ['양력이 걸리는 자리가', '무게중심보다 조금 앞에 있습니다']}));
// wing s13: 8배 느리게, 크게 들림(렌즈 사라짐), 기록선이 위로 달아남
const t13 = 0.75;
add('wing-s13', () => wtFrame({tailed: false, th: M.theta('tailless', t13), tauNow: t13, lensOn: false, effects: [M.wingEffect(M.theta('tailless', t13)), 0],
  kicker: '8배 느리게 · 꼬리날개 없는 모형', title: '들릴수록 더 들린다', protMax: 90}));
// tail s16: 멈춤, 렌즈가 꼬리날개, 저울 전부, 효과 1 · 4, 기록선에 앞 장면의 잔상
add('tail-s16', () => wtFrame({tailed: true, th: 10 * D, tauNow: M.RISE, lensOn: true, lensAt: K.toScreen({x: WT.x, y: WT.y, s: WT.s, theta: 10 * D}, 151, -5),
  effects: [1, 4], ghostTrace: true, kicker: '멈춤 · 꼬리날개 있는 모형', title: '내리는 효과가 4배', cap: ['그래서 기수를 내리는 효과가', '네 배쯤 큽니다']}));
// tail s17: 넘침(−3°) — 꼬리날개 화살표가 아래로
const t17 = M.RISE + 0.54;
add('tail-s17', () => wtFrame({tailed: true, th: M.theta('tailed', t17), tauNow: t17, lensOn: true, lensAt: K.toScreen({x: WT.x, y: WT.y, s: WT.s, theta: M.theta('tailed', t17)}, 151, -5),
  effects: [M.wingEffect(M.theta('tailed', t17)), M.tailEffect(M.theta('tailed', t17))], ghostTrace: true, kicker: '8배 느리게 · 꼬리날개 있는 모형', title: '흔들리다 제자리에'}));
// c. 평면도
add('top-yaw', () => topFrame({th: 10 * D, kicker: '위에서 본 모습 · 3배 느리게', title: '수직 꼬리날개도 같은 일', ghosts: [4 * D, 8 * D]}));
for (const f of [0, 0.5, 1]) add(`top-flying-${f}`, () => topFrame({th: 0, flying: f, tail: f > 0 ? 'ghost' : 'on', arrow: false, prot: false, kicker: '위에서 본 모습', title: '꼬리날개 없이 나는 방법'}));
// d. 뒤집기
for (const q of [0.25, 0.5, 0.75]) add(`flip-${q}`, () => flipFrame(q));

let idx = 0;
await R.renderStills({stage, times: jobs.map(j => ({t: j.t, label: j.label})), frame: () => jobs[idx++].draw(), outDir: OUT, prefix: 'kit', cols: 5});

if (process.argv.includes('--video')) {
  const out = path.join(OUT, 'hook_0-4s.mp4');
  await R.renderVideo({stage, duration: 4, frame: t => hookFrame(t), out, gain: false});
}
