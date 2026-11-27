// 62 심전도 — 한 박동의 모형(같은 시계). 그림(scenes.mjs)과 소리(make_sound.mjs)가 모두 여기서 나온다.
// 단위: 실제 시각은 ms(동방결절 발화 = 0), 좌표는 세계 좌표(카메라 1배일 때 화면 px).
// 모든 수치는 건강한 어른의 교과서 대표값(1분에 75번 = 한 박동 800 ms) — 출처는 brief.md.
//   P 10~100 · 방실결절 지연 약 50→150 · PR 0.17 s · QRS 170~245(0.075 s) · S1 240(R 뒤 약 40 ms)
//   ST 245~360 · T 360~560 · QT 0.39 s · S2 560(T 끝 무렵) · 쉼·채우기 560~800
// 설명 모형: 흥분이 퍼지는 시각은 전도 길에서의 거리로 계산한 지도, 심전도는 한 유도(II 유도 꼴)의 교과서 모양을 가우스의 합으로 그린 것.
import {clamp, lerp, smooth} from '../../pipeline/render/index.mjs';

export const RR75 = 800;
export const EV = {sa: 0, pOn: 10, pOff: 100, avIn: 48, avOut: 150, hisEnd: 162, brEnd: 176, qrsOn: 170, qrsOff: 245,
  s1: 240, tOn: 360, tOff: 560, s2: 560, avOpen: 640, ejOn: 290, ejOff: 555};

// ---------------------------------------------------------------- 심장의 모양(정면 단면, 세계 좌표)
// 화면 기준 왼쪽 = 몸의 오른쪽(우심방·우심실). 공(cavity)은 타원, 벽은 그 둘레의 두께.
export const H = {
  RA: {cx: 352, cy: 522, rx: 126, ry: 106, wall: 26},
  LA: {cx: 726, cy: 510, rx: 122, ry: 98, wall: 26},
  RV: {cx: 386, cy: 800, rx: 98, ry: 146, wall: 34, rot: 0.22},
  LV: {cx: 680, cy: 806, rx: 104, ry: 168, wall: 70, rot: -0.24},
  avY: 640,                         // 방실 사이 섬유 고리(전기가 못 지나감)
  SA: [300, 418], AV: [528, 640],
  apex: [600, 1008],
};
// 전도 길(동방결절 → 방실결절은 심방 근육을 거쳐서, 그 뒤는 특수 전도 조직)
export const PATH = {
  his: [[528, 640], [540, 690]],
  lbb: [[540, 690], [560, 760], [574, 860], [600, 952]],
  rbb: [[540, 690], [522, 770], [506, 870], [520, 952]],
};
// 푸르키네 그물: 갈래 끝에서 심실 안쪽 벽을 따라 위로 뻗는 가지들(각 가지 = 점 목록 + 시작 시각)
export const PURK = (() => {
  const out = [];
  const branch = (pts, t0, t1) => out.push({pts, t0, t1});
  // 좌심실 안쪽 벽(오른쪽)
  branch([[600, 952], [680, 986], [770, 930], [806, 820], [800, 700]], EV.brEnd, EV.brEnd + 14);
  branch([[600, 952], [640, 900], [688, 870], [726, 790]], EV.brEnd, EV.brEnd + 10);
  branch([[574, 860], [600, 790], [616, 720]], EV.brEnd - 6, EV.brEnd + 4);
  // 우심실 안쪽 벽(왼쪽)
  branch([[520, 952], [450, 950], [360, 900], [292, 800], [296, 700]], EV.brEnd, EV.brEnd + 14);
  branch([[506, 870], [450, 840], [400, 760]], EV.brEnd - 4, EV.brEnd + 6);
  return out;
})();

const ell = (c, x, y, grow = 0) => {      // 타원 좌표(1 = 공의 가장자리), 회전 포함
  const r = c.rot || 0, dx = x - c.cx, dy = y - c.cy, u = dx * Math.cos(r) + dy * Math.sin(r), v = -dx * Math.sin(r) + dy * Math.cos(r);
  return Math.hypot(u / (c.rx + grow), v / (c.ry + grow));
};
export const ellCoord = ell;

// ---------------------------------------------------------------- 흥분(탈분극)·회복(재분극) 시각 지도
// 심방: 동방결절에서의 거리 → 시각(심방 근육 약 4.4 px/ms — 화면 크기에 맞춘 축척, 맨 끝 약 95 ms)
// 심실: 안쪽 벽(푸르키네)에서 시작해 바깥으로, 꼭대기(심첨)에서 바닥(위쪽) 쪽으로 — 172~245 ms
// 회복: 심방은 흥분 뒤 약 170 ms(QRS 에 묻힘), 심실은 바깥쪽이 먼저(390) 안쪽이 나중(545) — 그래서 T 가 위로(설명 모형)
export function chamberOf(x, y) {
  // 섬유 고리 위는 심방, 아래는 심실. 각 방의 공 + 벽(두께)
  const out = [];
  for (const k of ['RA', 'LA', 'RV', 'LV']) {
    const c = H[k], e = ell(c, x, y), eo = ell(c, x, y, c.wall);
    if (eo <= 1) out.push({k, e, eo, inCav: e < 1});
  }
  return out;
}
/** k = 방, (x, y) = 그 자리, w = 벽 안에서의 깊이(0 안쪽 벽 … 1 바깥 벽) */
export function actTime(k, x, y, w = 0.5) {
  if (k === 'RA' || k === 'LA') return EV.pOn + Math.hypot(x - H.SA[0], y - H.SA[1]) / 5.0;   // 맨 끝(좌심방 오른쪽) ≈ 100 ms
  const up = clamp((H.apex[1] - y) / (H.apex[1] - H.avY));    // 0 심첨 … 1 바닥(방실 고리 쪽)
  return 172 + 30 * up + 38 * w;                               // 172 … 240(안쪽 벽·심첨이 먼저, 바깥 벽·바닥이 나중)
}
export function recTime(k, x, y, w = 0.5) {
  if (k === 'RA' || k === 'LA') return actTime(k, x, y, w) + 170;
  const up = clamp((H.apex[1] - y) / (H.apex[1] - H.avY));
  return 545 - 145 * w - 10 * (1 - up);                        // 바깥(w=1) ≈ 395, 안쪽(w=0) ≈ 540 — 회복은 바깥이 먼저
}

// ---------------------------------------------------------------- 수축(근육은 전기를 뒤따른다)
// 0 = 풀림, 1 = 가장 조임. 심방: P 뒤 90~230, 심실: S1(240) 뒤 오르기 시작 → 430 꼭대기 → T 끝 뒤 풀림(620).
export function atrialSqueeze(ms) { return smooth((ms - 95) / 55) * (1 - smooth((ms - 180) / 60)); }
export function ventSqueeze(ms) { return smooth((ms - 232) / 190) * (1 - smooth((ms - 540) / 110)); }

// 판막: 방실판막(심방과 심실 사이)은 S1 에 닫히고 avOpen 에 열림. 동맥판막(대동맥판)은 ejOn~ejOff 에 열림(S2 에 닫힘).
export const avValveOpen = ms => (ms < EV.s1 || ms >= EV.avOpen) ? 1 : 0;
export const avValveQ = ms => clamp(1 - smooth((ms - (EV.s1 - 14)) / 14) + smooth((ms - EV.avOpen) / 30));
export const aoValveQ = ms => smooth((ms - EV.ejOn) / 14) * (1 - smooth((ms - (EV.s2 - 12)) / 12));

// 피의 흐름(누적 양, 임의 단위 — 입자의 위치에 씀). 채우기: 방실판막이 열린 동안(초기 빠름, 심방 수축 때 한 번 더),
// 내보내기: 동맥판막이 열린 동안.
export function inflowRate(ms) {
  const m = ((ms % RR75) + RR75) % RR75;
  if (m >= EV.s1 && m < EV.avOpen) return 0;
  const early = m >= EV.avOpen ? Math.exp(-(m - EV.avOpen) / 70) : 0;
  const late = m < EV.s1 ? 0.15 + atrialSqueeze(m) * 0.9 : 0;
  return 0.15 + early + late;
}
export function outflowRate(ms) { const m = ((ms % RR75) + RR75) % RR75; return aoValveQ(m) * Math.sin(Math.PI * clamp((m - EV.ejOn) / (EV.ejOff - EV.ejOn))) * 1.4; }

// ---------------------------------------------------------------- 심전도(한 유도, mV)
const g = (x, c, s, a) => a * Math.exp(-0.5 * ((x - c) / s) ** 2);
export const WAVES = {
  P: {c: 55, s: 18, a: 0.16}, Q: {c: 178, s: 5, a: -0.12}, R: {c: 198, s: 8, a: 1.15}, S: {c: 216, s: 7, a: -0.28},
  T: {c: 470, s: 46, a: 0.32}, Ta: {c: 235, s: 38, a: -0.05},
};
/** 한 박동 안의 전압(ms = 1분에 75번 박동의 ms, 발화부터). opt.noTa = 심방 회복을 뺌 */
export function ecgBeat(ms, opt = {}) {
  const W = WAVES;
  let v = g(ms, W.P.c, W.P.s, W.P.a) + g(ms, W.Q.c, W.Q.s, W.Q.a) + g(ms, W.R.c, W.R.s, W.R.a) + g(ms, W.S.c, W.S.s, W.S.a);
  const tc = W.T.c, ts = W.T.s;
  // T 는 비대칭(오름이 느리고 내림이 빠름)
  v += ms < tc ? g(ms, tc, ts * 1.15, W.T.a) : g(ms, tc, ts * 0.8, W.T.a);
  if (!opt.noTa) v += g(ms, W.Ta.c, W.Ta.s, W.Ta.a);
  return v;
}
/** 심박수에 따른 박동 시각의 늘이고 줄임(설명 모형): PR ∝ (RR/800)^0.4, QRS 뒤(QT 포함) ∝ (RR/800)^0.5(Bazett 꼴).
 *  canon(m) = 그 박동의 ms 를 1분에 75번 박동의 ms 로 바꾼 값 — 그림·소리·심전도가 모두 이 값으로 상태를 읽는다. */
export function beatParams(hr) {
  const rr = 60000 / hr, fp = (rr / RR75) ** 0.4, fq = (rr / RR75) ** 0.5;
  const canon = m => (m < EV.qrsOn * fp ? m / fp : EV.qrsOn + (m - EV.qrsOn * fp) / fq);
  const uncanon = c => (c < EV.qrsOn ? c * fp : EV.qrsOn * fp + (c - EV.qrsOn) * fq);
  return {rr, fp, fq, canon, uncanon};
}
export function ecgAt(msAbs, hr = 75) {
  const {rr, canon} = beatParams(hr), m = ((msAbs % rr) + rr) % rr;
  return ecgBeat(canon(m)) + ecgBeat(canon(m - rr)) * (m > rr * 0.5 ? 1 : 0);
}

// ---------------------------------------------------------------- 시계: 영상 시각 t(초) → 박동 시각 ms
// run = {t0, t1, ms0, rate, hr?, loop?} — rate = 영상 1초에 실제 몇 ms. 느리게 = rate 가 작음. 배율 = 1000 / rate.
export function runMs(run, t) { return run.ms0 + (Math.min(t, run.t1 ?? Infinity) - run.t0) * run.rate; }
export const slowOf = run => 1000 / run.rate;

/** 영상의 모든 '박동 실행'을 장면 시각에서 계산한다 — scenes.mjs 와 make_sound.mjs 가 같은 함수를 부른다. */
export function plan(tl) {
  const S = id => tl.sentences.find(s => s.id === id), sc = id => tl.scenes.find(s => s.id === id);
  const runs = {};
  // hook: 결과 먼저 — 발화부터 심실이 한창 조일 때(20 → 320 ms)를 2.0초에
  runs.hook0 = {t0: 0.0, t1: 2.0, ms0: 20, rate: 300 / 2.0};
  // hook 둘째: 실제 빠르기(1분에 75번), s02 가 시작할 무렵부터
  const h = sc('hook');
  runs.hookReal = {t0: S('s02').start - 0.35, t1: h.end, ms0: -60, rate: 1000, hr: 75, loop: true};
  // origin: 실 검류계 — 실제 빠르기
  const o = sc('origin');
  runs.origin = {t0: o.start, t1: o.end, ms0: -300, rate: 1000, hr: 75, loop: true};
  // essence 의 끝(s08): 한 박동을 천천히
  const s08 = S('s08');
  runs.core = {t0: s08.start - 0.4, t1: sc('essence').end, ms0: -40, rate: 820 / (sc('essence').end - s08.start + 0.2)};
  // 메커니즘: 한 박동을 장면마다 이어서(끝 ms = 다음 장면 처음 ms). 장면 안에서는 빠르기가 일정(머리글에 배율)
  const seg = [['atria', -90, 105], ['avnode', 105, 152], ['ventricles', 152, 232], ['contract', 232, 700]];
  for (const [id, a, b] of seg) { const s = sc(id); runs[id] = {t0: s.start, t1: s.end, ms0: a, rate: (b - a) / (s.end - s.start), msEnd: b}; }
  // rate: 실제 빠르기 75번 → 120번(운동할 때 흔한 값, 설명용)
  const r = sc('rate'), s21 = S('s21');
  runs.rate75 = {t0: r.start, t1: s21.start - 0.3, ms0: -60, rate: 1000, hr: 75, loop: true};
  runs.rate120 = {t0: s21.start - 0.3, t1: r.end, ms0: -60, rate: 1000, hr: 120, loop: true};
  const c = sc('close');
  runs.close = {t0: c.start, t1: c.end, ms0: -60, rate: 1000, hr: 75, loop: true};
  return runs;
}
/** 실행 안에서 박동마다의 사건(발화, S1, S2) 시각 — 영상 초 */
export function beatEvents(run) {
  const out = [], hr = run.hr ?? 75, {rr, uncanon} = beatParams(hr);
  const msEnd = run.loop ? runMs(run, run.t1) : (run.msEnd ?? runMs(run, run.t1));
  const toT = ms => run.t0 + (ms - run.ms0) / run.rate;
  const b0 = run.loop ? Math.floor(run.ms0 / rr) - 1 : 0, b1 = run.loop ? Math.ceil(msEnd / rr) : 0;
  for (let b = b0; b <= b1; b++) {
    const base = run.loop ? b * rr : 0;
    for (const kind of ['sa', 's1', 's2']) {
      const m = base + (run.loop ? uncanon(EV[kind]) : EV[kind]);
      if (m >= run.ms0 && m < msEnd) out.push({kind, t: toT(m), beat: b, ms: m});
    }
  }
  return out;
}
/** 실행의 지금 상태: c = 1분에 75번 박동으로 바꾼 ms(0 = 발화) — 상태는 모두 c 로 읽는다 */
export function phase(run, t) {
  const ms = runMs(run, t);
  if (!run.loop) return {c: ms, m: ms, beat: 0, hr: 75, msAbs: ms};
  const P = beatParams(run.hr ?? 75), b = Math.floor(ms / P.rr), m = ms - b * P.rr;
  return {c: P.canon(m), m, beat: b, hr: run.hr, rr: P.rr, msAbs: ms};
}
