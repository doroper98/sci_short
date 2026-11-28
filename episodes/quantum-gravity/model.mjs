// 73 양자중력 — 모형과 사건 시계(한 곳). 그림(scenes.mjs)·계기 숫자·소리(make_sound.mjs)가 모두 여기서 나온다.
// 단위: 다이아몬드 테두리 반지름 b = 1(세계 단위). 시간(빛줄기의 눈금 u)도 같은 단위 — 빛은 45°.
//
// 설명 모형(brief.md '모형'):
//  - 빛의 모임(논문 식 3.25f 의 꼴을 일정한 층밀림으로 단순화): 단면 반지름 ϱ'' = −σ² ϱ, ϱ(0)=0, ϱ'(0)=1 → ϱ(u) = sin(σu)/σ.
//    중력자 n 개: σ_n² = n·ε, ε b² = 0.11. 테두리(반지름 b)에 닿는 시계 눈금 u*(n) = asin(σ_n b)/σ_n.
//    다이아몬드 크기 한계 ℓ = 1.30 b → n = 0…8 은 들어가고(u* = 1.000 … 1.297) n = 9 는 넘친다(1.478).
//    '8개'는 '유한하다'를 보이기 위한 모형 값이다(실제 상태 수는 e^{넓이/4} 꼴로 엄청나게 크다).
//  - 두 합(논문 식 4.34 와 4.4절 통째 계산의 항 크기, 계수 뺌): H_N = Σ 1/k(끝없이 커짐), Z_N = Σ 1/k²(→ π²/6 ≈ 1.645).
//  - 블랙홀 엔트로피 S = A/4(플랑크 넓이 단위).
//  - 논문 감사의 글: GPT-6 Astra 와 주고받은 토큰 약 4억(∼400M).
export const B = 1, EPS = 0.11, ELL = 1.30, NMAX_TRY = 9;
export const TOKENS = 4e8;
export const sigma = n => Math.sqrt(Math.max(0, n) * EPS) / B;
/** 빛줄기 눈금 u 에서의 단면 반지름(중력자 n 개, 연속 n 도 됨) */
export function rho(u, n) { const s = sigma(n); return s < 1e-6 ? u : Math.sin(s * u) / s; }
/** 테두리(반지름 b)에 닿는 시계 눈금. σb > 1 이면 닿지 못함(Infinity) */
export function uStar(n) { const s = sigma(n); if (s < 1e-6) return B; return s * B > 1 ? Infinity : Math.asin(s * B) / s; }
export const fits = n => uStar(n) <= ELL + 1e-9;
export const NFIT = (() => { let n = 0; while (fits(n + 1)) n++; return n; })();   // = 8
if (NFIT !== 8 || fits(9)) throw new Error(`model: 한계가 8개가 아님 (NFIT=${NFIT})`);

const EULER = 0.5772156649015329;
/** H_N = Σ_{k≤N} 1/k (N 이 크면 점근식) */
export function Hsum(N) {
  if (N < 1) return 0;
  if (N <= 2000) { let s = 0; for (let k = 1; k <= Math.floor(N); k++) s += 1 / k; return s; }
  return Math.log(N) + EULER + 1 / (2 * N) - 1 / (12 * N * N);
}
/** Z_N = Σ_{k≤N} 1/k² */
export function Zsum(N) {
  if (N < 1) return 0;
  if (N <= 2000) { let s = 0; for (let k = 1; k <= Math.floor(N); k++) s += 1 / (k * k); return s; }
  return Math.PI ** 2 / 6 - 1 / N + 1 / (2 * N * N);
}
export const ZINF = Math.PI ** 2 / 6;
/** 연속 log10 N 에서의 부분합(계기 선을 매끄럽게: 정수 N 사이를 직선으로) */
export function sumAtLog(kind, lg) {
  const N = 10 ** lg, f = kind === 'H' ? Hsum : Zsum;
  if (N <= 2000) { const a = Math.floor(N), q = N - a; return f(a) * (1 - q) + f(a + 1) * q; }
  return f(N);
}
export const S_of_A = A => A / 4;

// 계기 축(infinity·finite·close 같은 축): 가로 log10 N 0…6, 세로 합 0…8
export const AX = {lg0: 0, lg1: 6, y0: 0, y1: 8};

// ---------------------------------------------------------------- 사건 시계
const r3 = x => Math.round(x * 1000) / 1000;
function finder(tl) {
  const S = id => tl.sentences.find(s => s.id === id), sc = id => tl.scenes.find(s => s.id === id);
  /** 문장 id 안에서 낱말(발음 tts 기준)의 첫 글자 시각 */
  const word = (id, w, off = 0) => {
    const s = S(id), ch = s.chars || [], joined = ch.map(c => c.c).join(''), i = joined.indexOf(w);
    if (i < 0) throw new Error(`model: ${id} 에 "${w}" 없음`);
    return ch[i].start + off;
  };
  return {S, sc, word};
}

/** 영상 전체의 사건 계획. 시각은 모두 영상 초. scenes.mjs 와 make_sound.mjs 가 같은 함수를 부른다. */
export function plan(tl) {
  const {S, sc, word} = finder(tl), P = {};
  // ---- hook: 결과 먼저(0~2) → 멈춤 → 되감기(2.2~3.2) → 다이아몬드 하나에서 빛이 되풀이
  P.hook = {sweepA: [0.03, 0.42], sweepB: [0.42, 0.72], sew: [], rewind: [2.2, 3.2], zoom: [0.72, 2.0], loops: []};
  const HEX = hexRing(2);
  HEX.forEach((h, i) => P.hook.sew.push({...h, t: r3(0.62 + i * (1.2 / HEX.length))}));
  const s01 = S('s01'), s02 = S('s02');
  for (let t0 = 3.5; t0 + 1.0 < s02.start - 0.2; t0 += 2.3) P.hook.loops.push(r3(t0));
  P.hook.morph = [s01.end + 0.1, s01.end + 0.9];
  // s02: 물음 점 → 답 점(K 번 주고받음), 답이 닿을 때 논문에 한 줄
  const K = 6, x0 = s02.start + 0.5, x1 = s02.end + 0.6, step = (x1 - x0) / K;
  P.exch = {t0: s02.start - 0.5, K, trips: []};
  for (let k = 0; k < K; k++) { const a = x0 + k * step; P.exch.trips.push({ask: r3(a), askArr: r3(a + step * 0.38), ans: r3(a + step * 0.48), ansArr: r3(a + step * 0.86)}); }
  // ---- origin
  P.origin = {land: r3(word('s03', '일반상대성', -0.25)), bend: 1.3, wobble: r3(word('s04', '휘고', -0.1)), wobbleEnd: sc('origin').end, quant: r3(word('s03', '양자역학', 0))};
  // ---- infinity: 잔물결 k = 1…10 하나씩, 그 뒤 ×10 씩(N = 100 … 10⁶)
  const rip = [], s05 = S('s05'), s06 = S('s06');
  const r1 = word('s05', '잔물결', 0.1);
  rip.push({k: 1, lg: 0, t: r3(r1)}, {k: 2, lg: Math.log10(2), t: r3(r1 + 1.3)}, {k: 3, lg: Math.log10(3), t: r3(r1 + 2.6)});
  const r4 = s06.start + 0.3;
  for (let k = 4; k <= 10; k++) rip.push({k, lg: Math.log10(k), t: r3(r4 + (k - 4) * 0.42)});
  const d0 = r4 + 7 * 0.42 + 0.2;
  for (let d = 2; d <= 6; d++) rip.push({k: 10 ** d, lg: d, decade: true, t: r3(d0 + (d - 2) * 0.58)});
  P.rip = rip;
  P.infinity = {plateOut: [S('s07').start - 0.2, S('s07').start + 1.4], loops: []};
  for (let t0 = word('s07', '빛의', -0.1); t0 < sc('infinity').end - 1.2; t0 += 2.3) P.infinity.loops.push(r3(t0));
  // ---- diamond
  P.diamond = {p: r3(word('s08', '사건에서', 0.0)), grow: 2.0, q0: r3(word('s08', '나중', 0.0)), qArr: 0, label: r3(word('s09', '인과', -0.2)), sig: r3(word('s09', '원인과', -0.3)), sigDur: 2.6};
  P.diamond.qArr = r3(P.diamond.q0 + 1.8);
  // ---- focus: 중력자 n 하나씩(고리가 원뿔을 따라 올라감), 9번째는 한계에 막힘
  const grav = [], s10 = S('s10'), s12 = S('s12'), s13 = S('s13');
  grav.push({n: 1, t: r3(word('s10', '중력파가', 0.0)), dur: 2.4});
  const g0 = s12.start + 0.5, gstep = (s12.end - 0.4 - g0) / 7;
  for (let n = 2; n <= 8; n++) grav.push({n, t: r3(g0 + (n - 2) * gstep), dur: 0.9});
  const g9 = word('s13', '끝없이', -0.4);
  grav.push({n: 9, t: r3(g9), dur: 0.9, blocked: true});
  P.grav = grav;
  P.block = r3(g9 + 0.9 * uFrac(ELL));   // 고리가 한계선에 닿는 순간
  P.focus = {clock: r3(word('s11', '빛줄기를', -0.2)), clockPeriod: 2.2};
  // ---- finite: 조각을 하나씩 이어 붙임(항 k = 1…6), k = 7…10 빠르게, ×10 씩; s16 에서 먼저 어림한 합을 다시
  const s14 = S('s14'), s15 = S('s15'), s16 = S('s16');
  const sew = [], t14 = word('s14', '이어', -0.3);
  const H1 = hexRing(1);
  H1.forEach((h, i) => sew.push({...h, k: i + 1, t: r3(t14 + i * 0.78)}));
  const terms = sew.map(s => ({k: s.k, lg: Math.log10(s.k), t: s.t}));
  const t7 = t14 + 6 * 0.78;
  for (let k = 7; k <= 10; k++) terms.push({k, lg: Math.log10(k), t: r3(t7 + (k - 7) * 0.3)});
  const td = s15.start + 0.4;
  for (let d = 2; d <= 6; d++) terms.push({k: 10 ** d, lg: d, decade: true, t: r3(td + (d - 2) * 0.62)});
  P.sew = sew; P.terms = terms;
  const ta = word('s16', '먼저', -0.1), approx = [];
  for (let k = 1; k <= 10; k++) approx.push({k, lg: Math.log10(k), t: r3(ta + (k - 1) * 0.2)});
  for (let d = 2; d <= 6; d++) approx.push({k: 10 ** d, lg: d, decade: true, t: r3(ta + 2.0 + (d - 2) * 0.5)});
  P.approx = approx;
  P.finite = {sweeps: [r3(s15.start + 0.2), r3(s15.start + 3.6), r3(s16.end - 1.6)]};
  // ---- blackhole: 덩어리 둘이 떨어짐 → 넓이가 커짐(칸 수)
  const s17 = S('s17');
  P.bh = {r0: 1.0, falls: [{t: r3(s17.start + 0.9), dr: 0.16}, {t: r3(s17.start + 3.9), dr: 0.16}], fallDur: 1.2};
  // ---- limits
  P.limits = {mark: r3(S('s18').start + 0.4), empty: r3(word('s18', '물질이', -0.2)), exp: r3(word('s19', '실험으로', -0.1))};
  // ---- close
  P.close = {sweep: r3(S('s20').start + 0.2), end: r3(S('s20').start)};
  return P;
}
/** 고리가 u 높이에 닿는 비율(직선 원뿔 기준 0..1.5 를 0..1 로) — 막힘 시각 계산용 */
function uFrac(u) { return u / 1.5; }
/** 테두리 반지름 1 인 다이아몬드를 육각으로 맞붙인 이웃 자리(중심 간격 2). rings 겹까지, 가까운 것부터 */
export function hexRing(rings) {
  const out = [];
  for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) {
    const s = -q - r; if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > rings || (q === 0 && r === 0)) continue;
    const x = 2 * (q + r / 2), z = 2 * (r * Math.sqrt(3) / 2);
    out.push({x, z, d: Math.hypot(x, z), ang: Math.atan2(z, x)});
  }
  out.sort((a, b) => a.d - b.d || a.ang - b.ang);
  return out;
}
/** 블랙홀 반지름(시각 t) — 떨어진 덩어리를 삼킬 때 커짐 */
export function bhRadius(P, t) {
  let r = P.bh.r0;
  for (const f of P.bh.falls) { const q = Math.min(1, Math.max(0, (t - (f.t + P.bh.fallDur)) / 0.6)); r += f.dr * (q * q * (3 - 2 * q)); }
  return r;
}
/** 지금 다이아몬드 안의 중력자 수(연속: 고리가 지나가는 동안 n−1 → n) */
export function gravAt(P, t) {
  let n = 0, wave = null;
  for (const g of P.grav) {
    if (t < g.t) break;
    const q = (t - g.t) / g.dur;
    if (g.blocked) { if (q < 1.6) wave = {...g, q}; continue; }
    if (q < 1) { n = g.n - 1 + q; wave = {...g, q}; } else n = g.n;
  }
  return {n, wave};
}
/** 블랙홀 지평선 넓이(그림 단위): 반지름 1 에서 A ≈ 126 → S = A/4 ≈ 31. 표면의 칸 수 = floor(S) */
export const bhArea = r => 40 * Math.PI * r * r;
