// 66 꼬리날개 — 운동 모형 (PLAN.md 3절). 타임라인에 의존하지 않는 순수 함수만 둔다.
// 각도 θ 는 라디안. 옆모습에서 기수가 들리면 양수(캔버스에서는 축 중심 rotate(+θ) — 기수가 왼쪽이라 시계 방향 = 기수 들림).
// 평면도에서는 같은 θ 를 '기수가 화면 위쪽으로 틀어짐'으로 쓴다.
// 설명 모형: 큰 각의 움직임(불안정 모형의 90° 둘레 흔들림, 실속)과 3.4 표의 값은 그림을 위한 단순화다(brief.md).
//
// 시간 두 가지: t = 벽시계(영상 초), τ = 모형 시간. run 의 rate 구간 [{t0, t1, rate}] 로 τ = ∫ rate dt.
// rate 구간 목록은 장면 단계의 plan(tl) 이 timeline 에서 만들어 넘긴다(이 파일은 timeline 을 모른다).

export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const deg = r => r * R2D;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = q => { q = clamp(q); return q * q * (3 - 2 * q); };

// ---------- 3.1 돌풍 ----------
export const RISE = 0.18;          // 돌풍이 기수를 들어 올리는 시간(모형 초)
export const TH0 = 10 * D2R;       // 돌풍이 만드는 첫 각도
/** 돌풍 구간(0 ≤ τ < RISE)의 각도. τ < 0 이면 0. */
export const kickTheta = tau => (tau <= 0 ? 0 : TH0 * smooth(tau / RISE));

// ---------- 3.2 / 3.4 안정한 물체(같은 식, 값만 다름) ----------
export const OBJ = {
  tailed: {w: 6.2, z: 0.35, kind: 'stable'},     // 꼬리날개 있는 모형
  vane: {w: 6.2, z: 0.35, kind: 'stable'},       // 수직 꼬리날개(평면도)·풍향계 — 세로와 같은 일이라 같은 값
  arrow: {w: 9.0, z: 0.40, kind: 'stable'},      // 화살(origin s04)
  penaud: {w: 5.0, z: 0.30, kind: 'stable'},     // 페노의 모형(origin s06~s07)
  paper: {w: 7.0, z: 0.35, kind: 'stable'},      // 종이비행기(tailless s22)
  tailless: {sigma: 3.6, c: 0.25, kind: 'unstable'},   // 꼬리날개 없는 모형
};

/** 감쇠 진동의 닫힌 꼴. u = 풀려난 뒤의 모형 시간(초), th0 = 처음 각(라디안), 처음 각속도 0. */
export function stableFree(u, {w, z}, th0 = TH0) {
  if (u <= 0) return th0;
  const wd = w * Math.sqrt(1 - z * z);
  return th0 * Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u));
}

// ---------- 3.3 불안정 모형: RK4 표(한 번 계산해 캐시) ----------
const UN = {dt: 1 / 1000, T: 14, table: null};
function unstableTable() {
  if (UN.table) return UN.table;
  const {sigma, c} = OBJ.tailless, n = Math.round(UN.T / UN.dt), tab = new Float64Array(n + 1);
  const acc = (th, om) => (sigma * sigma / 2) * Math.sin(2 * th) - c * om;
  let th = TH0, om = 0, h = UN.dt;
  tab[0] = th;
  for (let i = 1; i <= n; i++) {
    const k1t = om, k1o = acc(th, om);
    const k2t = om + h / 2 * k1o, k2o = acc(th + h / 2 * k1t, om + h / 2 * k1o);
    const k3t = om + h / 2 * k2o, k3o = acc(th + h / 2 * k2t, om + h / 2 * k2o);
    const k4t = om + h * k3o, k4o = acc(th + h * k3t, om + h * k3o);
    th += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
    om += h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o);
    tab[i] = th;
  }
  return (UN.table = tab);
}
/** 불안정 모형, 풀려난 뒤 u 초의 각(라디안). 표를 선형 보간. 14초 뒤는 마지막 값. */
export function unstableFree(u) {
  const tab = unstableTable();
  if (u <= 0) return tab[0];
  const x = u / UN.dt, i = Math.floor(x);
  if (i >= tab.length - 1) return tab[tab.length - 1];
  return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
}

/** 물체 id 의 각도: 돌풍(0 → RISE) 다음 스스로 움직임. tau = 돌풍 시각부터의 모형 시간. */
export function theta(id, tau) {
  if (tau <= 0) return 0;
  if (tau < RISE) return kickTheta(tau);
  const u = tau - RISE, o = OBJ[id];
  if (!o) throw new Error(`model.theta: 모르는 물체 ${id}`);
  return o.kind === 'unstable' ? unstableFree(u) : stableFree(u, o);
}

// ---------- 3.5 힘·팔·효과 (단위 없음) ----------
export const XW = 7, LT = 140;            // 팔 길이(모형 단위 u): 날개 양력 자리는 축보다 7 u 앞, 꼬리날개는 140 u 뒤 → 거리 비 20
export const ARM_RATIO = LT / XW;         // 20
const S2 = Math.sin(2 * TH0) / 2;
/** 날개의 늘어난 양력: θ = TH0 에서 1, 45° 에서 가장 크고 그 뒤 줄어든다(실속, 설명 모형). */
export const dLw = th => (Math.sin(2 * th) / 2) / S2;
/** 꼬리날개의 늘어난 힘(있는 모형, 작은 각에서만): θ = TH0 에서 1/5, θ < 0 이면 음수(아래로). */
export const dLt = th => 0.2 * th / TH0;
/** 돌리는 효과(날개의 것 = 1): 날개는 +(기수를 듦), 꼬리는 −(기수를 내림). 화면에는 1 과 4. */
export const wingEffect = th => dLw(th);
export const tailEffect = th => -4 * dLt(th) / 0.2;
// ω²/σ² = 6.2²/3.6² ≈ 2.97 ≈ 3 = (꼬리 4 − 날개 1) / 날개 1. 3.3 절: 바꾸려면 둘을 함께 바꾼다.
export const STIFFNESS_RATIO = (OBJ.tailed.w / OBJ.tailless.sigma) ** 2;

// ---------- 3.6 rate 구간과 모형 시계 ----------
/**
 * rate 구간 [{t0, t1, rate}] 에서 ∫_{a}^{b} rate dt. 구간 밖의 rate 는 base(기본 1).
 * 구간은 겹치지 않아야 한다(겹치면 먼저 나온 것이 이긴다). a > b 이면 음수.
 */
export function integrateRate(segs, a, b, base = 1) {
  if (b < a) return -integrateRate(segs, b, a, base);
  let sum = base * (b - a);
  for (const s of segs || []) {
    const lo = Math.max(a, s.t0), hi = Math.min(b, s.t1);
    if (hi > lo) sum += (s.rate - base) * (hi - lo);
  }
  return sum;
}
/** 그 시각의 rate(구간 밖이면 base). */
export function rateAt(segs, t, base = 1) {
  for (const s of segs || []) if (t >= s.t0 && t < s.t1) return s.rate;
  return base;
}
/**
 * run = {id, kick (벽시계 돌풍 시각), models: ['tailed'|'tailless'|…], segs: [{t0,t1,rate}], reset?: 벽시계 시각(이때부터 0° 로 되돌림)}.
 * tau(run, t) = ∫_{kick}^{t} rate dt (모형 시간; 돌풍 전은 음수).
 */
export function tau(run, t) { return integrateRate(run.segs, run.kick, t); }

export const RESET_SEC = 0.5, GHOST_FADE_SEC = 0.3;
/** run 의 물체 id 각도(벽시계 t). reset 뒤 0.5초 smooth 로 0° 로 되돌린다. */
export function runTheta(run, id, t) {
  const th = theta(id, tau(run, t));
  if (run.reset == null || t <= run.reset) return th;
  const th1 = theta(id, tau(run, run.reset));
  return th1 * (1 - smooth((t - run.reset) / RESET_SEC));
}

/**
 * 잔상 부채(스트로보): 풀려난 뒤(τ = RISE) every 초마다의 자세. 지금 τ 까지 지난 것만, 최대 max 장.
 * 돌려주는 값 [{theta, a}] — a = 기본 알파 × (reset 뒤 0.3초에 사라짐). 되감기에서는 τ 가 줄어 거꾸로 사라진다.
 */
export function strobe(run, id, t, {every = 0.14, max = 9, alpha = 0.28} = {}) {
  const tt = tau(run, t), out = [];
  let fade = 1;
  if (run.reset != null && t > run.reset) fade = 1 - smooth((t - run.reset) / GHOST_FADE_SEC);
  if (fade <= 0) return out;
  for (let k = 0; k < max; k++) {
    const tk = RISE + k * every;
    if (tk > tt) break;
    out.push({theta: theta(id, tk), a: alpha * fade, tau: tk});
  }
  return out;
}

/**
 * 바람(연기 줄)의 위상: 전체 영상에 하나. flowPhase(t) = ∫₀ᵗ rate dt, rate 구간은 지금 보는 run 의 것을 모은 목록
 * (run 이 없을 때는 1). 느리게 볼 때 연기도 느려지고, 멈춤에서는 서고, 되감기에서는 거꾸로 간다.
 */
export function flowPhase(segs, t) { return integrateRate(segs, 0, t); }

// ---------- 검산용 ----------
/** 안정 모형의 첫 넘침 각(라디안)과 그 시각(풀려난 뒤), |θ| < lim 으로 영영 들어가는 시각. */
export function stableStats(o = OBJ.tailed, lim = 0.3 * D2R) {
  const wd = o.w * Math.sqrt(1 - o.z * o.z), tOver = Math.PI / wd;
  let settle = 0;
  for (let u = 0; u < 10; u += 0.001) if (Math.abs(stableFree(u, o)) >= lim) settle = u;
  return {overshoot: stableFree(tOver, o), tOver, settle};
}
