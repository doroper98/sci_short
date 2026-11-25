// 57 지진파 — 그림과 소리가 함께 쓰는 모형(같은 시계). scenes.mjs 와 make_sound.mjs 가 이 파일만 본다.
// 단면 무대: 화면 좌표 = 세계 좌표. 1 km = 6 px(가로·세로 같은 자). 진원 깊이 15 km.
// 파: 한 점에서 나오는 파의 해석해 — P 는 나아가는 방향(r̂), S 는 직각(θ̂)으로 바위를 움직인다.
//   균질한 바위로 단순화(지층에 따른 빠르기 변화·땅 표면의 반사·표면파·단층의 방향별 세기 차이는 그리지 않는다).
// 빠르기: 지각 위쪽 대표값 P 6 km/s, S 3.5 km/s(brief.md 출처 8·10). 흔들림의 크기와 파의 폭(px)은 과장.
// 지구 단면: 깊이에 따라 빨라지는 간단한 빠르기 표(PREM 을 줄인 것)로 광선을 계산한다. S 는 바깥 핵(액체)에서 끝난다.

export const KM = 6;                      // px per km
export const SURF = 700;                  // 땅 표면 y
export const HX = 120, HY = SURF + 15 * KM; // 진원(깊이 15 km)
export const VP = 6.0, VS = 3.5;          // km/s
export const VPX = VP * KM, VSX = VS * KM; // px per real second
export const TRK = {x: 435, y: 790};       // 추적 알갱이(진원과 같은 깊이, 진원에서 52.5 km)
export const TRKX = TRK.x;

/** 표면의 한 점(진앙에서 가로 d km)까지 진원 거리(km) */
export const hypoDist = dkm => Math.hypot(dkm, 15);
export const xAt = dkm => HX + dkm * KM;
export const tP = dkm => hypoDist(dkm) / VP;   // 실제 초
export const tS = dkm => hypoDist(dkm) / VS;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------------------------------------
// 실행(run): 한 번의 미끄러짐. tau(t) = 미끄러진 뒤 흐른 실제 초(없으면 −1).
//   rate = 화면 1초에 흐르는 실제 초. amp = 흔들림 크기(1 = 기본). P/S = 그 파를 그리는가.
// 시각은 narration timeline(outputs/seismic-waves/narration/timeline.json)의 단어 시각에 맞춰 고른 숫자다.
// ------------------------------------------------------------------------------------------------
function linRun(id, t0, rate, o = {}) {
  return {id, t0, rate, amp: 1, P: true, S: true, L: 210, until: Infinity, ...o,
    tau(t) { if (t < this.t0 || t > this.until) return -1; return (t - this.t0) * this.rate + (this.tau0 || 0); },
    timeOf(tauReal) { return this.t0 + (tauReal - (this.tau0 || 0)) / this.rate; }};
}

export const RUNS = {
  // 결과 먼저: 0~2초 실제 30초를 빠르게(15배), 2.0~3.4초 되감기
  h0: {id: 'h0', t0: 0, rate: 15, amp: 1.8, P: true, S: true, L: 260, tau0: 2,
    // 0초 프레임(썸네일)에 이미 두 고리가 진원 둘레에 보이도록, 미끄러진 지 실제 2초 뒤에서 시작한다
    tau(t) {
      if (t < 0) return -1;
      if (t <= 2.0) return 2 + t * 15;
      if (t <= 3.4) return 32 * (1 - smooth((t - 2.0) / 1.4));
      return -1;
    },
    timeOf(tr) { return (tr - 2) / 15; }},
  // s02: 같은 일을 천천히(P 가 '약한'에, S 가 '더 큰'에 관측소에 닿도록)
  h1: linRun('h1', 5.5, 4.82, {until: 14.0}),
  // s03: 같은 지진 다시 · 확대(관측소 아래 알갱이)
  h2: linRun('h2', 14.0, 8.08, {tau0: 12, until: 19.6}),
  // pwave s10: P 만, 빠르게(화면 1초 = 실제 3초) / s12: P 만, 실제 빠르기
  p1: linRun('p1', 62.0, 3.0, {S: false, until: 68.0}),
  p2: linRun('p2', 74.6, 1.0, {S: false, until: 80.5}),
  // swave s13: S 만, 빠르게(화면 1초 = 실제 5.7초) / s14: 실제 빠르기(P 는 흐리게 같은 시계로)
  s1: linRun('s1', 81.0, 5.7, {P: false, until: 86.0}),
  s2: linRun('s2', 86.2, 1.0, {until: 101.4}),
  // speed s16: 작은 지진 → 큰 지진(크기만 다름)
  qa: linRun('qa', 101.9, 10, {amp: 0.4, until: 110}),
  qb: linRun('qb', 105.0, 10, {amp: 1.25, until: 110}),
  // distance s17: 50 km · 100 km 관측소
  d1: linRun('d1', 110.5, 4.0, {until: 130.6}),
  // warning s20~s21
  w1: linRun('w1', 131.2, 2.5, {until: 145.8}),
  // close s24
  c1: linRun('c1', 159.6, 6.0, {until: 999}),
};

/** 장면별로 그리는 실행 */
export const SCENE_RUNS = {
  hook: ['h0', 'h1', 'h2'], pwave: ['p1', 'p2'], swave: ['s1', 's2'], speed: ['qa', 'qb'], distance: ['d1'], warning: ['w1'], close: ['c1'],
};

// 파 모양: s ∈ (−1, 0) 에서 한 번 눌렸다 늘어나는 펄스(앞면이 s = 0)
export function wavelet(s) {
  if (s <= -1 || s >= 0) return 0;
  const w = Math.sin(Math.PI * s) ** 2;
  return Math.sin(2 * Math.PI * -s) * w;
}
const spread = r => Math.min(1, Math.sqrt(260 / Math.max(r, 1)));
export const AP = 9, AS = 20;    // px(과장) — 실제로도 S 가 대개 더 크게 흔든다(brief.md)

/** 단면의 한 점의 변위 [ux, uy] (px) — 여러 실행의 합 */
export function displacement(x, y, runs, t, o = {}) {
  let ux = 0, uy = 0;
  const dx = x - HX, dy = y - HY, r = Math.hypot(dx, dy) || 1, rx = dx / r, ry = dy / r;
  for (const R of runs) {
    const tau = R.tau(t); if (tau < 0) continue;
    const sp = spread(r) * R.amp;
    if (R.P && o.P !== false) { const a = AP * (o.ampP ?? 1) * sp * wavelet((r - VPX * tau) / R.L); ux += rx * a; uy += ry * a; }
    if (R.S && o.S !== false) { const a = AS * (o.ampS ?? 1) * sp * wavelet((r - VSX * tau) / (R.L * 0.85)); ux += -ry * a; uy += rx * a; }
  }
  return [ux, uy];
}

// ------------------------------------------------------------------------------------------------
// 지진계 기록(합성): 관측소(진앙에서 d km)에서 실제 초 tau 의 땅 흔들림. P 는 작게, S 는 크게, 뒤에 잦아드는 떨림.
// ------------------------------------------------------------------------------------------------
function burst(x, f, dur) {
  if (x < 0) return 0;
  const env = (1 - Math.exp(-x / 0.25)) * Math.exp(-x / dur);
  return env * (Math.sin(2 * Math.PI * f * x) + 0.45 * Math.sin(2 * Math.PI * f * 1.73 * x + 1.1));
}
export function seismo(dkm, tau, amp = 1) {
  if (tau < 0) return 0;
  return amp * (0.28 * burst(tau - tP(dkm), 1.1, 1.6) + 1.0 * burst(tau - tS(dkm), 0.7, 3.2));
}

// ------------------------------------------------------------------------------------------------
// 경보(warning): 가까운 관측소 20 km, 분석 5초(기상청 5~10초의 짧은 쪽, brief.md), 도시 100 km
// ------------------------------------------------------------------------------------------------
export const WARN = {near: 20, city: 100, analysis: 5.0, link: 0.6};
WARN.detect = tP(WARN.near);                 // 실제 초
WARN.alert = WARN.detect + WARN.analysis;     // 경보 나감
WARN.cityAlert = WARN.alert + WARN.link;      // 도시에 닿음(통신 — 그림의 선은 설명용)
WARN.nearS = tS(WARN.near);                   // 가까운 곳의 S — 경보보다 먼저
WARN.cityS = tS(WARN.city);

// ------------------------------------------------------------------------------------------------
// 사슬(essence·s11·s15): 덩어리 줄. 펄스가 i 번째에 닿는 시각 = start + i·dt
// ------------------------------------------------------------------------------------------------
export const CHAIN = {n: 10, x0: 150, dx: 88, water: 5};   // water: 이 번호부터 물(s11·s15)
export const CHAIN_RUNS = {
  push8: {start: 47.35, dt: 0.30, kind: 'push'},           // s08 미는 펄스
  racePush: {start: 53.3, dt: 0.30, kind: 'push'},          // s09 경주(빠르기 비 1.73)
  raceTwist: {start: 53.3, dt: 0.30 * 1.73, kind: 'twist'},
  waterPush: {start: 68.7, dt: 0.30, kind: 'push', water: true, dtWater: 0.55},
  waterTwist: {start: 95.3, dt: 0.42, kind: 'twist', water: true},
  waterPushGhost: {start: 95.3, dt: 0.30, kind: 'push', water: true, dtWater: 0.55},
};
/** 펄스가 i 번째 덩어리에 닿는 시각(물에서 S 는 닿지 않음 → Infinity) */
export function chainArrive(run, i) {
  const w = CHAIN.water;
  if (!run.water || i < w) return run.start + i * run.dt;
  if (run.kind === 'twist') return Infinity;
  return run.start + w * run.dt + (i - w) * run.dtWater;
}

// ------------------------------------------------------------------------------------------------
// 지구 단면: 광선. 반지름 km. 빠르기 표(PREM 을 줄인 것, km/s).
// ------------------------------------------------------------------------------------------------
export const RE = 6371, RCMB = 3480, RICB = 1221;
function vP(r) {
  if (r > RCMB) return lerpTab(r, [[RCMB, 13.7], [5701, 10.8], [5961, 9.0], [6346, 8.1], [RE, 6.5]]);
  if (r > RICB) return lerpTab(r, [[RICB, 10.3], [RCMB, 8.0]]);
  return 11.1;
}
function vS(r) {
  if (r > RCMB) return lerpTab(r, [[RCMB, 7.3], [5701, 5.9], [5961, 4.9], [6346, 4.45], [RE, 3.6]]);
  return 0;   // 바깥 핵은 액체 — S 없음(안쪽 핵의 S 는 다루지 않음)
}
function lerpTab(r, tab) {
  for (let i = 1; i < tab.length; i++) if (r <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (r - a) / (b - a); }
  return tab[tab.length - 1][1];
}
/** 광선 하나: 진원(지표 바로 아래)에서 아래로 기울기 ang(0 = 곧장 아래, ±90° = 수평)으로. → [{x,y,t}] (km, 지구 중심 좌표) */
const regionOf = r => r > RCMB ? 'm' : r > RICB ? 'o' : 'i';
function traceRay(kind, ang) {
  const V = kind === 'P' ? vP : vS, ds = 8;
  let x = 0, y = RE - 15, dx = Math.sin(ang), dy = -Math.cos(ang), t = 0;
  const pts = [{x, y, t}];
  for (let k = 0; k < 5000; k++) {
    const r = Math.hypot(x, y), v = V(r), reg = regionOf(r), h = 2;
    // 굴절(같은 층 안): d/ds(n̂/v) = ∇(1/v)
    if (regionOf(r + h) === reg && regionOf(r - h) === reg) {
      const g = (1 / V(r + h) - 1 / V(r - h)) / (2 * h);
      const px = dx / v + g * x / r * ds, py = dy / v + g * y / r * ds, pn = Math.hypot(px, py);
      dx = px / pn; dy = py / pn;
    }
    const nx = x + dx * ds, ny = y + dy * ds, r2 = Math.hypot(nx, ny), reg2 = regionOf(r2);
    if (reg2 !== reg) {
      const rb = (reg === 'i' || reg2 === 'i') ? RICB : RCMB;
      const v1 = V(reg === regionOf(rb + 1) ? rb + 1 : rb - 1), v2 = V(reg2 === regionOf(rb + 1) ? rb + 1 : rb - 1);
      if (v2 <= 0) { pts.push({x: nx, y: ny, t: t + ds / v, end: 'cmb'}); return pts; }   // S 가 액체(바깥 핵)에 닿음 — 끝
      const n0x = nx / r2, n0y = ny / r2, dn = dx * n0x + dy * n0y;
      const tx = dx - dn * n0x, ty = dy - dn * n0y, q = v2 / v1, s2 = q * q * (tx * tx + ty * ty);
      if (s2 < 1) { const c = Math.sqrt(1 - s2) * Math.sign(dn); dx = q * tx + c * n0x; dy = q * ty + c * n0y; }
      else { dx -= 2 * dn * n0x; dy -= 2 * dn * n0y; t += ds / v; continue; }   // 전반사(드묾)
    }
    t += ds / v; x = nx; y = ny;
    pts.push({x, y, t});
    if (Math.hypot(x, y) >= RE && k > 3) { pts[pts.length - 1].end = 'surface'; return pts; }
  }
  return pts;
}
export const RAYS = (() => {
  const out = {P: [], S: []}, N = 241;
  for (const kind of ['P', 'S']) for (let i = 0; i < N; i++) {
    const ang = (-88 + 176 * i / (N - 1)) * Math.PI / 180;
    out[kind].push(traceRay(kind, ang));
  }
  return out;
})();
/** 광선이 실제 초 tau 에 있는 자리(없으면 null — 끝난 뒤는 끝점과 끝난 까닭) */
export function rayAt(ray, tau) {
  if (tau <= 0) return {x: ray[0].x, y: ray[0].y, done: false};
  const last = ray[ray.length - 1];
  if (tau >= last.t) return {x: last.x, y: last.y, done: true, end: last.end};
  let lo = 0, hi = ray.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ray[m].t < tau) lo = m; else hi = m; }
  const a = ray[lo], b = ray[hi], q = (tau - a.t) / (b.t - a.t);
  return {x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q, done: false};
}
/** 지표에 닿은 광선의 진앙 각거리(도) */
export function rayArrivals(kind) {
  return RAYS[kind].filter(r => r[r.length - 1].end === 'surface').map(r => {
    const e = r[r.length - 1]; return {deg: Math.atan2(Math.abs(e.x), e.y) * 180 / Math.PI * Math.sign(e.x || 1), t: e.t};
  });
}
export const CORE_RUN = {t0: 146.3, rate: 300};   // 실제 초 / 화면 초
