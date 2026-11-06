// Episode scenes — "사고도 없는데 왜 막힐까 — 유령 체증"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Ring model "M" (모형): car following with a reaction delay τ = 0.25 s and a relative-speed term,
//      a(t) = κ[V(s(t−τ)) − v(t−τ)] + λ[v_ahead(t−τ) − v(t−τ)],  κ = 1.0 /s, λ = 0.9 /s, clipped to −9 … +2.5 m/s².
//    V(s) = A[tanh((s − 5)/1.5) − tanh((2.5 − 5)/1.5)] for gaps s > 2.5 m (0 below); A is set so that V = 30 km/h at the
//    gap of 22 cars on a 230 m ring (car length 4.4 m → gap 6.05 m). V saturates at 37.7 km/h ("drive at about 30").
//    Integrated once with a fixed step (0.02 s) into tables at module load; every scene samples the tables.
//    Ring of 22: one 0.004 m/s² nudge of one car → stop-and-go; jam moves backward at the measured W_KMH (≈ 20 km/h).
//    Ring of 16 (gap 10 m): the same nudge dies out. One controlled car (AV) driving at the jammed ring's average speed
//    with a 1.2 s gap rule removes the waves (Stern et al. 2018 idea).
//  - Chain model "R" (설명 모형) for the reaction, cut-in and close scenes: a_k(t) = c·[v_{k−1}(t−τ) − v_k(t−τ)],
//    c = 1.1 /s, τ = 1.0 s (delayed linear follower; cτ > 1/2 → a slow-down grows toward the back).
//  - Fundamental diagram: Greenshields v = v0(1 − k/kj), q = k·v, v0 = 100 km/h, kj = 80 veh/km/lane → q_max = 2,000 veh/h.
//  - Sound: node episodes/traffic-jam/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const CAR_L = 4.4, CAR_W = 1.8, RING_C = 230, RING_N = 22, V30 = 30 / 3.6, KMH = 3.6;
export const MP = {s0: 2.5, sc: 5.0, w: 1.5, kap: 1.0, lam: 0.9, tau: 0.25, amax: 2.5, bmax: 9};
const GAP30 = RING_C / RING_N - CAR_L;
const TB = Math.tanh((MP.s0 - MP.sc) / MP.w), VA = V30 / (Math.tanh((GAP30 - MP.sc) / MP.w) - TB);
/** optimal speed (m/s) for a bumper-to-bumper gap s (m) */
export const Vopt = s => (s <= MP.s0 ? 0 : VA * (Math.tanh((s - MP.sc) / MP.w) - TB));
export const VMAX = VA * (1 - TB);
const DT = 0.02, KS = 2, STORE = DT * KS;
/**
 * Fixed-step integration of model M. Car i follows car i+1 (ring: N−1 follows 0). Options: kick {i,t,d,a} (one car's
 * acceleration overridden for d seconds), av {i,t0,acc(t,gap,v,vAhead)}, zone (x,t) → factor on V, leaderV (open chain).
 * Returns tables X, V, A (row k = time k·STORE) and the final state.
 */
export function simM({N, ring = true, C = RING_C, x0, v0, T, kick = null, av = null, zone = null, leaderV = null}) {
  const lag = Math.round(MP.tau / DT), steps = Math.round(T / DT), n = Math.floor(steps / KS) + 1;
  const X = new Float64Array(n * N), Vt = new Float64Array(n * N), At = new Float64Array(n * N);
  const x = Float64Array.from(x0); let v = Float64Array.from(v0);
  const HS = new Array(steps + 1), HV = new Array(steps + 1); let minGap = 1e9;
  for (let k = 0; k <= steps; k++) {
    const t = k * DT, g = new Float64Array(N);
    for (let i = 0; i < N; i++) g[i] = i === N - 1 ? (ring ? x[0] + C - x[i] - CAR_L : 1e9) : x[i + 1] - x[i] - CAR_L;
    HS[k] = g; HV[k] = v; if (k - lag - 1 >= 0) { HS[k - lag - 1] = null; HV[k - lag - 1] = null; }
    const j = Math.max(0, k - lag), gd = HS[j], vd = HV[j], a = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const il = (i + 1) % N; let ai;
      if (!ring && i === N - 1) ai = (leaderV(t + DT) - leaderV(t)) / DT;
      else ai = MP.kap * ((zone ? zone(x[i], t) : 1) * Vopt(gd[i]) - vd[i]) + MP.lam * (vd[il] - vd[i]);
      if (av && i === av.i && t >= av.t0) ai = av.acc(t, g[i], v[i], v[il]);
      if (kick && i === kick.i && t >= kick.t && t < kick.t + kick.d) ai = kick.a;
      a[i] = clamp(ai, -MP.bmax, MP.amax);
    }
    if (k % KS === 0) { const r = (k / KS) * N; for (let i = 0; i < N; i++) { X[r + i] = x[i]; Vt[r + i] = v[i]; At[r + i] = a[i]; } }
    const nv = new Float64Array(N);
    for (let i = 0; i < N; i++) { nv[i] = Math.max(0, v[i] + a[i] * DT); x[i] += (v[i] + nv[i]) / 2 * DT; }
    v = nv; for (let i = 0; i < N; i++) minGap = Math.min(minGap, g[i]);
  }
  return {N, n, ring, C, T, X, V: Vt, A: At, minGap, state: {x: Array.from(x), v: Array.from(v)}};
}
/** linear interpolation in a table: arr ∈ 'X' | 'V' | 'A' */
export function sample(S, arr, i, t) {
  const u = clamp(t, 0, S.T) / STORE, k = Math.min(S.n - 2, Math.floor(u)), f = u - k;
  return lerp(S[arr][k * S.N + i], S[arr][(k + 1) * S.N + i], f);
}
export const BRAKE_A = -0.6, STOP_V = 0.4;
export const braking = (S, i, t) => sample(S, 'A', i, t) < BRAKE_A || sample(S, 'V', i, t) < STOP_V;
/** times when car i's brake light switches on (model time) */
export function brakeOnsets(S, i, t0 = 0, t1 = S.T) {
  const out = []; let prev = true;
  for (let k = Math.max(0, Math.floor(t0 / STORE)); k < S.n && k * STORE <= t1; k++) {
    const on = S.A[k * S.N + i] < BRAKE_A || S.V[k * S.N + i] < STOP_V;
    if (on && !prev && k * STORE > t0) out.push(+(k * STORE).toFixed(3)); prev = on;
  }
  return out;
}
const ringStart = N => ({x0: [...Array(N)].map((_, i) => i * RING_C / N), v0: Array(N).fill(Vopt(RING_C / N - CAR_L))});
export const meanV = (S, t) => { let s = 0; for (let i = 0; i < S.N; i++) s += sample(S, 'V', i, t); return s / S.N; };
export const stoppedN = (S, t) => { let s = 0; for (let i = 0; i < S.N; i++) if (sample(S, 'V', i, t) < STOP_V) s++; return s; };
export const spreadV = (S, t) => { let lo = 1e9, hi = -1e9; for (let i = 0; i < S.N; i++) { const v = sample(S, 'V', i, t); lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };

// ---- the 2008 ring (Sugiyama et al.): 22 cars, 230 m, homogeneous 30 km/h, one tiny nudge ----
export const KICK = {i: 0, t: 1.0, d: 1.0, a: -0.004};
export const RING = simM({N: RING_N, ...ringStart(RING_N), T: 250, kick: KICK});
export const FIRST_STOP = (() => { for (let t = 0; t < RING.T; t += STORE) if (stoppedN(RING, t) > 0) return +t.toFixed(2); return null; })();
/** main jam cluster at t: the longest run of consecutive cars (in road order) slower than 3 m/s, holding ≥ 1 stopped car.
 *  → {ids (tail → head), tail, head, center} positions in m along the ring, or null */
export function mainCluster(S, t) {
  const N = S.N, slow = [...Array(N)].map((_, i) => sample(S, 'V', i, t) < 3.0);
  if (slow.every(Boolean) || !slow.some(Boolean)) return null;
  let best = null, start = slow.findIndex(s => !s);
  for (let k = 1; k <= N; k++) {
    const i = (start + k) % N; if (!slow[i]) continue;
    if (slow[(i - 1 + N) % N]) continue;                                  // i starts a run (car i−1 behind it is fast)
    const run = []; let j = i; while (slow[j] && run.length < N) { run.push(j); j = (j + 1) % N; }
    const st = run.filter(r => sample(S, 'V', r, t) < STOP_V).length;
    if (st && (!best || run.length + st > best.score)) best = {ids: run, score: run.length + st};
  }
  if (!best) return null;
  const pos = i => ((sample(S, 'X', i, t) % S.C) + S.C) % S.C, tail = pos(best.ids[0]), head = pos(best.ids.at(-1));
  const len = ((head - tail) % S.C + S.C) % S.C;
  return {ids: best.ids, tail, head, center: (tail + len / 2) % S.C, len};
}
export const jamPos = (S, t) => mainCluster(S, t)?.center ?? null;
/** measured backward speed of the jam (km/h, negative = against the traffic) between t0 and t1 (least squares, unwrapped) */
export function jamSpeed(S, t0, t1) {
  const P = []; let prev = null, off = 0;
  for (let t = t0; t <= t1; t += 0.5) { const p = jamPos(S, t); if (p == null) continue; if (prev != null) { if (p + off - prev > S.C / 2) off -= S.C; if (p + off - prev < -S.C / 2) off += S.C; } prev = p + off; P.push([t, p + off]); }
  const n = P.length, mt = P.reduce((a, q) => a + q[0], 0) / n, mx = P.reduce((a, q) => a + q[1], 0) / n;
  return P.reduce((a, q) => a + (q[0] - mt) * (q[1] - mx), 0) / P.reduce((a, q) => a + (q[0] - mt) ** 2, 0) * KMH;
}
/** cars joining the main cluster at its tail and leaving at its head (membership held ≥ 1 s) in [t0, t1] */
export function clusterFlow(S, t0, t1) {
  const N = S.N, mem = [], joins = [], leaves = [];
  for (let t = t0; t <= t1 + 1e-9; t += STORE) { const c = mainCluster(S, t), set = new Set(c ? c.ids : []); mem.push([t, set]); }
  for (let i = 0; i < N; i++) {
    let state = mem[0][1].has(i), since = mem[0][0], pend = null;
    for (const [t, set] of mem) {
      const s = set.has(i);
      if (s !== state) { if (pend == null) pend = t; if (t - pend >= 1.0) { (s ? joins : leaves).push({i, m: +pend.toFixed(3), x: ((sample(S, 'X', i, pend) % S.C) + S.C) % S.C}); state = s; pend = null; } }
      else pend = null;
    }
  }
  return {joins: joins.sort((a, b) => a.m - b.m), leaves: leaves.sort((a, b) => a.m - b.m)};
}
export const W_KMH = jamSpeed(RING, FIRST_STOP + 40, FIRST_STOP + 160);
export const JAM_MEAN_KMH = (() => { let s = 0, n = 0; for (let t = FIRST_STOP + 40; t < FIRST_STOP + 160; t += 1) { s += meanV(RING, t); n++; } return s / n * KMH; })();
export const JAM_STOPPED = (() => { let s = 0, n = 0; for (let t = FIRST_STOP + 40; t < FIRST_STOP + 160; t += 1) { s += stoppedN(RING, t); n++; } return s / n; })();

// ---- s10: the same nudge on a ring with room (16 cars) and on the 22-car ring (kick 1 m/s², visible) ----
export const S10_KICK = {i: 0, t: 0.5, d: 1.0, a: -1.0};
export const RING16 = simM({N: 16, ...ringStart(16), T: 30, kick: S10_KICK});
export const RING22 = simM({N: RING_N, ...ringStart(RING_N), T: 30, kick: S10_KICK});

// ---- Stern et al. (2017 experiment, 2018 paper): one controlled car in the jammed ring ----
export const AV = {i: 0, U: 4.5, Tgap: 1.2, s0: 3.0, k: 0.5};
export const T_SW = 150;                                                   // model time of the jammed ring when control starts
export const AV_ACC = (t, g, v) => clamp(AV.k * (Math.min(AV.U, Math.max(0, (g - AV.s0) / AV.Tgap)) - v), -3, 1.0);
export const RING_AV = simM({N: RING_N, x0: [...Array(RING_N)].map((_, i) => sample(RING, 'X', i, T_SW)), v0: [...Array(RING_N)].map((_, i) => sample(RING, 'V', i, T_SW)), T: 130, av: {i: AV.i, t0: 0, acc: AV_ACC}});
export const TRACK_CAR = 11;                                               // the human car whose speed is drawn (before / after)
/** fuel proxy (relative, per car-second): idle + rolling + positive power; summed over all cars */
export const fuelRate = (v, a) => 0.25 + 0.03 * v + 0.12 * Math.max(0, a) * v;
const fuel = (S, t0, t1) => { let f = 0; for (let t = t0; t < t1; t += STORE) for (let i = 0; i < S.N; i++) f += fuelRate(sample(S, 'V', i, t), sample(S, 'A', i, t)); return f; };
export const FUEL = {before: fuel(RING, T_SW - 100, T_SW), after: fuel(RING_AV, 20, 120)};

// ---- bottlenecks (s15): a stable ring of 20 cars, a 40 m stretch where drivers slow a little (factor φ) ----
export const ZONES = [
  {id: 'drop', n: '차로 감소', phi: 0.80, N: 20},
  {id: 'merge', n: '합류', phi: 0.82, N: 20},
  {id: 'sag', n: '오르막 (새그)', phi: 0.86, N: 20},
  {id: 'tunnel', n: '터널 입구', phi: 0.84, N: 20},
];
export const ZONE_X = [150, 190], ZONE_T = 4.0, ZONE_RAMP = 2.0;
for (const z of ZONES) {
  const f = (x, t) => { const xm = ((x % RING_C) + RING_C) % RING_C; return xm > ZONE_X[0] && xm < ZONE_X[1] ? 1 - (1 - z.phi) * clamp((t - ZONE_T) / ZONE_RAMP) : 1; };
  z.sim = simM({N: z.N, ...ringStart(z.N), T: 40, zone: f});
}

// ---- hook / poster: four lanes, each an open platoon behind a leader that taps the brakes now and then ----
export const LANES = [-5.4, -1.8, 1.8, 5.4], HOOK_N = 16, HOOK_T = 70, HOOK_DV = 3.2;
export const HOOK_DIPS = [[3.2, 10.6, 17.9, 26.0, 33.4, 41.0, 48.5, 56.0], [4.4, 12.2, 19.0, 27.4, 34.6, 42.2, 50.1, 57.5], [2.6, 9.8, 17.0, 24.8, 32.8, 40.1, 47.6, 55.2], [3.8, 11.4, 18.6, 26.6, 34.0, 41.6, 49.3, 56.6]];
const dipV = (t, dips) => { let v = V30; for (const d0 of dips) { const u = t - d0 - 1.0; if (u > 0 && u < 1.3) v = Math.min(v, V30 - HOOK_DV * u / 1.3); else if (u >= 1.3 && u < 1.3 + 3.2) v = Math.min(v, V30 - HOOK_DV * (1 - (u - 1.3) / 3.2)); } return v; };
export const HOOK = LANES.map((X, l) => {
  const h = RING_C / RING_N, lv = t => dipV(t, HOOK_DIPS[l]);
  const S = simM({N: HOOK_N, ring: false, x0: [...Array(HOOK_N)].map((_, i) => i * h + (l % 2) * 3.1), v0: Array(HOOK_N).fill(V30), T: HOOK_T, leaderV: lv});
  return {X, S};
});
export const HOOK_M0 = 8.6;
export const HOOK_PICK = {l: 1, i: 9};                                    // a visible car that stops and goes again in the hook
/** screen times (hook) when the picked car comes to a stop */
export const HOOK_STOP = (() => { const o = []; let prev = false; for (let t = 0; t <= 15.8; t += 0.05) { const st = sample(HOOK[HOOK_PICK.l].S, 'V', HOOK_PICK.i, HOOK_M0 + t) < STOP_V; if (st && !prev) o.push(+t.toFixed(2)); prev = st; } return o; })();                                                // model time at t = 0 (the thumbnail)

// ---- chain model R (설명 모형) ----
export const RP = {c: 1.1, tau: 1.0, gap: 14};
/** delayed linear follower chain. leaders: function (k, t, v) → leader speed for car k (default: car k−1). Car 0 = front. */
export function simR({N, T, lead0, gaps = null, cs = null, insert = null}) {
  const lag = Math.round(RP.tau / DT), steps = Math.round(T / DT), n = Math.floor(steps / KS) + 1;
  const X = new Float64Array(n * N), Vt = new Float64Array(n * N), At = new Float64Array(n * N), HV = [];
  const x = new Float64Array(N), v = new Float64Array(N).fill(V30);
  for (let k = 1; k < N; k++) x[k] = x[k - 1] - CAR_L - (gaps ? gaps[k] : RP.gap);
  let minGap = 1e9;
  for (let s = 0; s <= steps; s++) {
    const t = s * DT; HV.push(Float64Array.from(v));
    const vd = HV[Math.max(0, s - lag)], a = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      if (k === 0) { a[k] = (lead0(t + DT) - lead0(t)) / DT; continue; }
      let vl = vd[k - 1];
      if (insert && k === insert.k && t - RP.tau >= insert.t) vl = insert.vAt(t - RP.tau);       // the car that cut in, seen τ later
      a[k] = clamp((cs ? cs[k] : RP.c) * (vl - vd[k]), -8, 2.5);
    }
    if (s % KS === 0) { const r = (s / KS) * N; for (let k = 0; k < N; k++) { X[r + k] = x[k]; Vt[r + k] = v[k]; At[r + k] = a[k]; } }
    for (let k = 0; k < N; k++) { const nv = k === 0 ? lead0(t + DT) : Math.max(0, v[k] + a[k] * DT); x[k] += (v[k] + nv) / 2 * DT; v[k] = nv; }
    for (let k = 1; k < N; k++) minGap = Math.min(minGap, x[k - 1] - x[k] - CAR_L);
    if (insert && t >= insert.t) { const xi = insert.xAt(t); minGap = Math.min(minGap, xi - x[insert.k] - CAR_L); }
  }
  return {N, n, T, X, V: Vt, A: At, minGap, ring: false};
}
export const R_BRAKE = -0.5;
export function onsetsR(S, k) { const o = []; let prev = true; for (let r = 0; r < S.n; r++) { const on = S.A[r * S.N + k] < R_BRAKE || S.V[r * S.N + k] < 0.05; if (on && !prev) o.push(+(r * STORE).toFixed(3)); prev = on; } return o; }
export const firstStopR = (S, k) => { for (let r = 0; r < S.n; r++) if (S.V[r * S.N + k] < 0.05) return +(r * STORE).toFixed(3); return null; };
export const peakDecelR = (S, k, t1 = S.T) => { let m = 0; for (let r = 0; r * STORE <= t1 && r < S.n; r++) m = Math.max(m, -S.A[r * S.N + k]); return m; };
/** leader: cruise, ease off by dv (m/s) at ad m/s² from t0, hold, recover at 0.6 m/s² */
export const dipLead = (t0, dv, ad = 1.0, hold = 1.0) => t => { const t1 = t0 + dv / ad, t2 = t1 + hold, t3 = t2 + dv / 0.6; return t < t0 ? V30 : t < t1 ? V30 - ad * (t - t0) : t < t2 ? V30 - dv : t < t3 ? V30 - dv + 0.6 * (t - t2) : V30; };
export const REACT_N = 8, REACT_SHOWN = 6;
export const REACT = simR({N: REACT_N, T: 24, lead0: dipLead(1.0, 2.0)});
export const REACT_ON = [...Array(REACT_N)].map((_, k) => onsetsR(REACT, k)[0] ?? null);
export const REACT_PEAK = [...Array(REACT_N)].map((_, k) => peakDecelR(REACT, k));
export const REACT_STOP = firstStopR(REACT, REACT_SHOWN - 1);
// myth: a slower car cuts in ahead of car 1 (second car in the lane)
export const CUT = {k: 1, t: 2.0, v0: 6.0, acc: 0.7, dur: 1.6};
const cutV = t => Math.min(V30, CUT.v0 + CUT.acc * Math.max(0, t - CUT.t));
export const MYTH_N = 8, MYTH_GAP = 18;
/** the cut-in car's front position along the lane: centred in car 1's gap when its lane change ends (CUT.t) */
function cutX(t) {
  const x1 = -(CAR_L + MYTH_GAP) + V30 * CUT.t, xa = x1 + CAR_L + (MYTH_GAP - CAR_L) / 2, tt = t - CUT.t, ta = (V30 - CUT.v0) / CUT.acc;
  return tt <= 0 ? xa + CUT.v0 * tt : xa + CUT.v0 * tt + 0.5 * CUT.acc * Math.min(tt, ta) ** 2 + Math.max(0, tt - ta) * CUT.acc * ta;
}
export const MYTH = simR({N: MYTH_N, T: 22, lead0: () => V30, gaps: Array(MYTH_N).fill(MYTH_GAP), insert: {k: CUT.k, t: CUT.t, vAt: cutV, xAt: cutX}});
export { cutX, cutV };
export const MYTH_ON = [...Array(MYTH_N)].map((_, k) => onsetsR(MYTH, k)[0] ?? null);
export const MYTH_PEAK = [...Array(MYTH_N)].map((_, k) => peakDecelR(MYTH, k));
// close: the same slow-down, (A) everybody close behind, (B) car 1 = "나": a big gap and gentle response
export const CLOSE_N = 7, ME = 1, ME_C = 0.15, ME_GAP = 34;
export const CLOSE_A = simR({N: CLOSE_N, T: 22, lead0: dipLead(1.0, 2.6)});
export const CLOSE_B = simR({N: CLOSE_N, T: 22, lead0: dipLead(1.0, 2.6), gaps: [0, ME_GAP, 14, 14, 14, 14, 14], cs: [0, ME_C, RP.c, RP.c, RP.c, RP.c, RP.c]});
export const minVR = (S, k) => { let m = 1e9; for (let r = 0; r < S.n; r++) m = Math.min(m, S.V[r * S.N + k]); return m; };

// ---- fundamental diagram (Greenshields), per lane ----
export const GS = {v0: 100, kj: 80};
export const gsV = k => GS.v0 * (1 - k / GS.kj), gsQ = k => k * gsV(k), Q_MAX = GS.v0 * GS.kj / 4, K_CRIT = GS.kj / 2;
export const K_SCHED = {start: 25, low: 8, high: 72};

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  accident: W('s01', '사고도'), works: W('s01', '공사도'), none1: W('s01', '없는데'), jammed: W('s01', '막히는'), tj: W('s01', '교통체증에'),
  ahead: W('s02', '앞에'), nothing: W('s02', '아무'), stopgo: W('s02', '멈췄다'), repeat: W('s02', '되풀이하는'), ghost: W('s02', '유령'),
  chejeung: W('s03', '체증은'), ate: W('s03', '먹은'), stuck: W('s03', '얹혀'), notDown: W('s03', '내려가지'), symptom: W('s03', '증세를'),
  hanja: W('s03', '한자말이고'), blocked: W('s03', '막힌'), liken: W('s03', '빗댄'), word3: W('s03', '말입니다'),
  y2008: W('s04', '이천팔년'), round: W('s04', '둘레'), m230: W('s04', '이백삼십미터의'), ringRoad: W('s04', '원형'),
  n22: W('s05', '스물두'), n22b: W('s05', '대가'), same: W('s05', '같은'), spacing: W('s05', '간격을'), speed5: W('s05', '시속'), even: W('s05', '고르게'),
  few: W('s06', '몇'), onePlace: W('s06', '곳에서'), stop6: W('s06', '멈춰'), backward: W('s06', '뒤쪽으로'), reverse: W('s06', '거꾸로'),
  reason7: W('s07', '까닭은'), driver: W('s07', '운전자의'), see: W('s07', '보고'), sec1: W('s07', '일초'), late: W('s07', '늦은'), harder: W('s07', '세게'),
  front8: W('s08', '앞차가'), back8: W('s08', '뒤차는'), next8: W('s08', '그 뒤차는'), small8: W('s08', '작은'), grow8: W('s08', '갈수록'),
  enough: W('s09', '충분히'), fullStop: W('s09', '멈춰'), place: W('s09', '자리가'), seed: W('s09', '씨앗이'),
  roomy: W('s10', '넉넉하면'), fades: W('s10', '잦아들지만'), cars10: W('s10', '차가'), density10: W('s10', '밀도를'), grows: W('s10', '자라납니다'),
  point11: W('s11', '지점을'), count11: W('s11', '수는'), dens11: W('s11', '밀도에'), speed11: W('s11', '속도를'), mult: W('s11', '곱한'),
  few12: W('s12', '차가 적으면'), fast12: W('s12', '빨리'), tooMany: W('s12', '너무'), slow12: W('s12', '느려져서'), less12: W('s12', '적게'),
  between: W('s13', '그 사이'), most: W('s13', '많이'), lane13: W('s13', '차로가'), cap2000: W('s13', '이천대'),
  tail: W('s14', '꼬리로'), head: W('s14', '머리에서'), fewer: W('s14', '적으면'), w20: W('s14', '이십킬로미터로'), spread14: W('s14', '번져'),
  laneDrop: W('s15', '차로가'), merge: W('s15', '합류하는'), uphill: W('s15', '오르막과'), tunnel: W('s15', '터널'), unaware: W('s15', '모르는'),
  slower: W('s15', '속도가'), limit: W('s15', '한계를'), over: W('s15', '넘습니다'),
  y2017: W('s16', '이천십칠년'), ring16: W('s16', '원형'), n20: W('s16', '이십여대'), oneCar: W('s16', '한 대를'), auto: W('s16', '자율주행으로'), gap16: W('s16', '간격을'),
  then17: W('s17', '그러자'), waves17: W('s17', '물결이'), calm: W('s17', '잦아들고'), all17: W('s17', '전체'), fuel17: W('s17', '연료'), less17: W('s17', '줄었습니다'),
  laneQ: W('s18', '차로를'), faster: W('s18', '빨리'), cutin: W('s18', '끼어들'), followers: W('s18', '뒤차들이'), brakes18: W('s18', '브레이크를'), rather: W('s18', '오히려'), newWave: W('s18', '새 물결을'),
  roomy19: W('s19', '넉넉한'), gentle: W('s19', '부드럽게'), me: W('s19', '나 한'), behind19: W('s19', '뒤에'), reduce: W('s19', '줄일'),
  reason20: W('s20', '교통체증은'), late20: W('s20', '늦은'), small20: W('s20', '작은'), grow20: W('s20', '자라나'), back20: W('s20', '뒤로'),
};

/** screen time → model time through knots [t, m], softened over ±soft s (C¹-ish corners); inv(m) by bisection */
function knotMap(knots, soft = 0.25) {
  const lin = t => { if (t <= knots[0][0]) return knots[0][1] + (t - knots[0][0]) * (knots[1][1] - knots[0][1]) / (knots[1][0] - knots[0][0]);
    for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [a, ma] = knots[i - 1], [b, mb] = knots[i]; return ma + (t - a) / (b - a) * (mb - ma); }
    const [a, ma] = knots.at(-2), [b, mb] = knots.at(-1); return mb + (t - b) * (mb - ma) / (b - a); };
  const f = t => { let s = 0; for (let k = -4; k <= 4; k++) s += lin(t + k * soft / 4) * (5 - Math.abs(k)); return s / 25; };
  f.inv = m => { let lo = knots[0][0] - 50, hi = knots.at(-1)[0] + 50; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) < m) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  f.rate = t => (f(t + 0.02) - f(t - 0.02)) / 0.04;
  return f;
}

// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook (model time = HOOK_M0 + t, real time)
  P.hookM = t => HOOK_M0 + t;
  P.noAcc = at(A.accident) - 0.05; P.noWork = at(A.works) - 0.05; P.jammed = at(A.jammed) - 0.1;
  P.ahead = at(A.ahead) - 0.1; P.nothing = at(A.nothing) - 0.05; P.stopgo = at(A.stopgo) - 0.1; P.ghost = at(A.ghost) - 0.1;
  // origin
  P.hanja = at(A.chejeung) - 0.15; P.eat = [at(A.ate) - 0.1, at(A.stuck) + 0.2]; P.notDown = at(A.notDown) - 0.05;
  P.foodT = k => P.eat[0] + k * 0.33;                                    // food piece k enters the gullet
  P.symptom = at(A.symptom) - 0.1; P.hanjaEq = at(A.hanja) - 0.1; P.road3 = at(A.blocked) - 0.15; P.liken = at(A.liken) - 0.1; P.jamEn = at(A.word3) + 0.05;
  // ring: cars appear on "스물두", run at 1× from "고르게" (model 0), fast-forward from "몇" until the first stop lands on "멈춰"
  P.ringDraw = [at(A.y2008) - 0.2, at(A.round) + 0.5]; P.c230 = at(A.m230) - 0.1;
  P.carsIn = [at(A.n22) - 0.05, at(A.n22b) + 0.45]; P.spacing = at(A.spacing) - 0.1; P.speedTile = at(A.speed5) - 0.1;
  P.go = at(A.even); P.ff0 = at(A.few) - 0.1; P.stopT = at(A.stop6); P.where = at(A.onePlace) - 0.1;
  { const m1 = P.ff0 - P.go; P.ringM = knotMap([[P.go - 10, -10], [P.go, 0], [P.ff0, m1], [P.stopT, FIRST_STOP], [sc('ring').end, FIRST_STOP + 2.5 * (sc('ring').end - P.stopT)]], 0.3); }
  P.firstStop = P.ringM.inv(FIRST_STOP);
  P.back6 = at(A.backward) - 0.1; P.reverse = at(A.reverse) - 0.1;
  // react: chain model R, one linear slow-motion so that car 1 brakes on "보고" and car 6 stops on "멈춰" (s09)
  P.rb1 = at(A.see); P.RR = (REACT_STOP - REACT_ON[0]) / (at(A.fullStop) - P.rb1);
  P.reactM = t => REACT_ON[0] + (t - P.rb1) * P.RR;
  P.reactOn = REACT_ON.map(m => (m == null ? null : P.rb1 + (m - REACT_ON[0]) / P.RR));
  P.reactStop = P.rb1 + (REACT_STOP - REACT_ON[0]) / P.RR;
  P.sec1 = at(A.sec1) - 0.1; P.late = at(A.late) - 0.1; P.s08 = at('s08') - 0.55; P.front8 = at(A.front8) - 0.1; P.back8 = at(A.back8) - 0.1; P.next8 = at(A.next8) - 0.1; P.grow8 = at(A.grow8) - 0.1;
  P.s09 = at('s09') - 0.55; P.place = at(A.place) - 0.1; P.seed = at(A.seed) - 0.2;
  // flow s10: two rings, the left one nudged on "넉넉하면" (2× screen speed), the right one on "차가" (3×)
  P.s10L = at(A.roomy) - 0.4; P.s10R = at(A.cars10) - 0.3; P.mL = t => 2 * (t - P.s10L); P.mR = t => 3 * (t - P.s10R);
  P.fades = at(A.fades) - 0.1; P.dense = at(A.density10) - 0.1; P.grows = at(A.grows) - 0.1;
  // flow s11–s13: Greenshields knob
  P.fd0 = at('s11') - 0.3; P.gate = at(A.point11) - 0.1; P.count = at(A.count11) - 0.1; P.formula = at(A.dens11) - 0.1; P.mult = at(A.mult) - 0.1;
  P.kLow = [at(A.few12) - 0.15, at(A.few12) + 0.85]; P.kHigh = [at(A.tooMany) - 0.05, at(A.slow12) + 0.25]; P.kMid = [at(A.between) - 0.05, at(A.most)];
  P.kAt = t => { const {start, low, high} = K_SCHED; if (t < P.kLow[0]) return start; if (t < P.kLow[1]) return lerp(start, low, easeInOut((t - P.kLow[0]) / (P.kLow[1] - P.kLow[0])));
    if (t < P.kHigh[0]) return low; if (t < P.kHigh[1]) return lerp(low, high, easeInOut((t - P.kHigh[0]) / (P.kHigh[1] - P.kHigh[0]))); if (t < P.kMid[0]) return high;
    if (t < P.kMid[1]) return lerp(high, K_CRIT, easeInOut((t - P.kMid[0]) / (P.kMid[1] - P.kMid[0]))); return K_CRIT; };
  { let lo = P.kHigh[0], hi = P.kHigh[1]; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (P.kAt(m) < K_CRIT) lo = m; else hi = m; } P.peak1 = (lo + hi) / 2; }
  P.peak2 = P.kMid[1]; P.cap = at(A.cap2000) - 0.25; P.lane13 = at(A.lane13) - 0.1;
  { // cars counted at the gate: Φ(t) = ∫ q dt (veh); car n crosses the gate when Φ = n
    const t0 = P.fd0 - 2, t1 = sc('flow').end + 0.5, d = 1 / 120, n = Math.ceil((t1 - t0) / d) + 1, PH = new Float64Array(n);
    for (let i = 1; i < n; i++) PH[i] = PH[i - 1] + gsQ(P.kAt(t0 + (i - 0.5) * d)) / 3600 * d;
    P.phi = t => { const u = clamp((t - t0) / d, 0, n - 1.001), i = Math.floor(u); return lerp(PH[i], PH[i + 1], u - i) + 0.35; };
    P.passT = []; for (let i = 1; i < n; i++) { const a = PH[i - 1] + 0.35, b = PH[i] + 0.35; if (Math.floor(b) > Math.floor(a) && t0 + i * d > P.gate) P.passT.push(+(t0 + i * d).toFixed(4)); }
  }
  // wave s14: the ring's space–time diagram from just before the first stop; scan line rises with the narration
  P.W0 = FIRST_STOP - 6; P.W1 = FIRST_STOP + 64; P.wv = [sc('wave').start + 0.25, at(A.spread14) + 0.4];
  P.waveM = t => lerp(P.W0, P.W1, clamp((t - P.wv[0]) / (P.wv[1] - P.wv[0])));
  P.tail = at(A.tail) - 0.1; P.head = at(A.head) - 0.1; P.w20 = at(A.w20) - 0.2; P.spread = at(A.spread14) - 0.1;
  { // cars joining the main jam at its tail and leaving at its head, in the diagram window
    ({joins: P.joins, leaves: P.leaves} = clusterFlow(RING, P.W0, P.W1));
    const inv = m => P.wv[0] + (m - P.W0) / (P.W1 - P.W0) * (P.wv[1] - P.wv[0]);
    P.joinT = P.joins.map(j => +inv(j.m).toFixed(4)); P.leaveT = P.leaves.map(j => +inv(j.m).toFixed(4));
  }
  // bottlenecks s15 (3.5× screen speed; the slow-down ramps in on "속도가")
  P.s15 = at('s15') - 0.5; P.pan = [at(A.laneDrop), at(A.merge), at(A.uphill), at(A.tunnel)].map(x => x - 0.1);
  P.zoneRate = 3.5; P.zone0 = at(A.slower) - ZONE_T / P.zoneRate; P.zoneM = t => (t - P.zone0) * P.zoneRate;
  P.slowTag = at(A.slower) - 0.05; P.limit = at(A.limit) - 0.1;
  P.zoneStop = ZONES.map(z => { for (let m = 0; m < z.sim.T; m += STORE) if (stoppedN(z.sim, m) > 0) return P.zone0 + m / P.zoneRate; return null; });
  // av: the jammed ring at 3×, control on at "간격을", fast-forward between "그러자" and "전체"
  P.avCard = at(A.y2017) - 0.15; P.n20 = at(A.n20) - 0.1; P.oneCar = at(A.oneCar) - 0.1; P.auto = at(A.auto) - 0.1;
  P.avOn = at(A.gap16) - 0.05; P.calm0 = at(A.then17) - 0.05; P.calm1 = at(A.all17) - 0.1; P.fuel = at(A.fuel17) - 0.15; P.fuelLess = at(A.less17) - 0.1;
  P.avM = knotMap([[sc('av').start, T_SW - 3 * (P.avOn - sc('av').start)], [P.avOn, T_SW], [P.calm0, T_SW + 3 * (P.calm0 - P.avOn)], [P.calm1, T_SW + 110], [sc('av').end, T_SW + 110 + 3 * (sc('av').end - P.calm1)]], 0.3);
  P.beforeTrace = [at(A.ring16) - 0.2, at(A.n20) + 0.6];
  // myth: lane change ends 0.6 s after "끼어들"; 1.6× screen speed
  P.cutEnd = at(A.cutin) + 0.6; P.MR = 1.6; P.mythM = t => CUT.t + (t - P.cutEnd) * P.MR;
  P.mythOn = MYTH_ON.map(m => (m == null ? null : P.cutEnd + (m - CUT.t) / P.MR)); P.mythQ = at(A.laneQ) - 0.2; P.rather = at(A.rather) - 0.1; P.newWave = at(A.newWave) - 0.1;
  // close: the same slow-down in two columns (1.6×), then the poster on "교통체증은"
  P.cdip = at(A.roomy19) + 0.3; P.CR = 2.0; P.closeM = t => 1.0 + (t - P.cdip) * P.CR;
  P.roomy = at(A.roomy19) - 0.1; P.meTag = at(A.me) - 0.1; P.reduce = at(A.reduce) - 0.1;
  P.closeOnA = [...Array(CLOSE_N)].map((_, k) => onsetsR(CLOSE_A, k)[0] ?? null).map(m => (m == null ? null : P.cdip + (m - 1.0) / P.CR));
  P.closeOnB = [...Array(CLOSE_N)].map((_, k) => onsetsR(CLOSE_B, k)[0] ?? null).map(m => (m == null ? null : P.cdip + (m - 1.0) / P.CR));
  P.reason = at(A.reason20) - 0.1; P.posterM = t => HOOK_M0 - (tl.duration - t);   // the bookend replays the build-up and ends on the thumbnail state
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const gr = c.createLinearGradient(0, 0, W * 0.3, H); gr.addColorStop(0, '#04131C'); gr.addColorStop(1, T.deep);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  glow(c, 540, 760, 900, '#2C5F78', 0.06);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
export const PAL = {brake: '#FF3B1F', brakeHot: '#FF6A3D', tail: '#B3241A', answer: '#FF5A2A', good: '#8FE3BF', bad: '#FF6A4D', warm: '#FFB36A', cool: '#7CC4FF',
  av: '#3FA9F5', me: '#8FE3BF', asphalt: '#16222A', asphalt2: '#0E181F', mark: '#C9D2D6', lamp: '#FFC77A', jam: '#FF4A2A'};
export const CAR_COLS = ['#9FB1BC', '#7D8E99', '#C7CDD2', '#5F7382', '#A89A8B', '#6F8796', '#B5B9A8', '#8B97A7', '#D2C6B4', '#68777F'];
const carCol = i => CAR_COLS[(i * 7 + 3) % CAR_COLS.length];
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
const fmtInt = n => Math.round(n).toLocaleString('en-US');
const fmtClock = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
function strike(c, x0, x1, y, q, col = PAL.bad, w = 4) { if (q > 0) line(c, [[x0 - 4, y], [lerp(x0 - 4, x1 + 4, easeOut(q)), y]], rgba(col, 0.95), w); }
function cross(c, x, y, s, col = PAL.bad, w = 5, q = 1) {
  if (q <= 0) return; const a = Math.min(1, q * 2), b = clamp(q * 2 - 1);
  line(c, [[x - s, y - s], [lerp(x - s, x + s, a), lerp(y - s, y + s, a)]], col, w);
  if (b > 0) line(c, [[x + s, y - s], [lerp(x + s, x - s, b), lerp(y - s, y + s, b)]], col, w);
}
/** readout tile: small grey label above a big value */
function tile(stage, x, y, w, label, value, o = {}) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, x, y, w, o.h ?? 112, o.plateA ?? 0.88);
  stage.text(label, x + w / 2, y + 30, {size: 24, weight: 700, color: T.muted, align: 'center'});
  stage.text(value, x + w / 2, y + 76, {role: 'display', size: o.size ?? 40, weight: 700, color: o.color || T.ink, align: 'center'});
}

// =====================================================================================================
// Cars
// =====================================================================================================
/** top-down car centred at (x, y), heading ang (screen radians, 0 = +x); br 0..1 brake light; o: {hi, alpha, glowK} */
export function carTop(c, x, y, ang, l, w, col, br = 0, o = {}) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.globalAlpha *= o.alpha ?? 1;
  rect(c, -l / 2 + 1.5, -w / 2 + 2, l, w, w * 0.32, 'rgba(0,0,0,0.35)');                     // contact shadow
  const g = c.createLinearGradient(0, -w / 2, 0, w / 2); g.addColorStop(0, mix(col, '#FFFFFF', 0.18)); g.addColorStop(0.5, col); g.addColorStop(1, mix(col, '#0A1218', 0.45));
  rect(c, -l / 2, -w / 2, l, w, w * 0.32, g, rgba('#04121A', 0.55), Math.max(1, w * 0.06));
  rect(c, -l * 0.16, -w * 0.36, l * 0.36, w * 0.72, w * 0.16, mix(col, '#FFFFFF', 0.12));     // roof
  rect(c, l * 0.2, -w * 0.38, l * 0.13, w * 0.76, w * 0.1, rgba('#0B1820', 0.85));            // windscreen
  rect(c, -l * 0.3, -w * 0.36, l * 0.1, w * 0.72, w * 0.1, rgba('#0B1820', 0.8));             // rear window
  const lc = br > 0 ? mix(PAL.tail, PAL.brakeHot, br) : PAL.tail;
  rect(c, -l / 2 - 0.5, -w * 0.46, Math.max(2, l * 0.06), w * 0.24, 1.5, lc); rect(c, -l / 2 - 0.5, w * 0.22, Math.max(2, l * 0.06), w * 0.24, 1.5, lc);
  if (o.hi) { c.strokeStyle = o.hi; c.lineWidth = 3; c.beginPath(); c.roundRect(-l / 2 - 5, -w / 2 - 5, l + 10, w + 10, w * 0.4); c.stroke(); }
  c.restore();
  if (br > 0.02) {                                                                         // light bloom in screen space
    const rx = x - Math.cos(ang) * l * 0.55, ry = y - Math.sin(ang) * l * 0.55;
    glow(c, rx, ry, (o.glowK ?? 1) * (w * 1.6 + 10), PAL.brake, 0.55 * br * (o.alpha ?? 1));
  }
}

// ---- night highway (poster, hook, close): perspective camera behind the platoons ----
export const HW = {H: 14, pitch: 0.46, f: 1150, cx: 540, cy: 960, lane: 3.6, zNear: 5.6, zFar: 900};
function hwP(X, Y, Z) {
  const s = Math.sin(HW.pitch), co = Math.cos(HW.pitch), zc = HW.H * s + Z * co - Y * s, yc = -HW.H * co + Z * s + Y * co;
  return [HW.cx + HW.f * X / zc, HW.cy - HW.f * yc / zc, zc];
}
export const HORIZON_Y = HW.cy - HW.f * Math.tan(HW.pitch);
/** world Z (m ahead of the camera) of car i in lane l at model time m; the camera moves at 30 km/h */
export const HOOK_ZOFF = 112 - (HOOK_N - 1) * RING_C / RING_N;
const hookZ = (l, i, m) => sample(HOOK[l].S, 'X', i, m) - V30 * m + HOOK_ZOFF;
function car3D(c, X, Z, col, br, a = 1) {
  const w = CAR_W, h1 = 0.78, h2 = 1.42, L = CAR_L, P = (x, y, z) => hwP(X + x, y, Z + z);
  const q = pts => pts.map(p => [p[0], p[1]]);
  const side = X > 0 ? -w / 2 : w / 2, sideVis = Math.abs(X) > w / 2 + 0.2;
  const base = mix(col, '#0A1116', 0.52), rear = mix(base, '#000000', 0.4), sideC = mix(base, '#000000', 0.22), deck = mix(base, '#FFFFFF', 0.04), roof = mix(base, '#FFFFFF', 0.14), glass = '#0A161D';
  withAlpha(c, a, () => {
    const s0 = P(0, 0, -0.2); glow(c, s0[0], s0[1], HW.f * 2.4 / s0[2], '#000000', 0.5);
    if (sideVis) poly(c, q([P(side, 0.2, 0), P(side, 0.2, L), P(side, h1, L - 0.1), P(side, h1, 0.05)]), sideC);
    poly(c, q([P(-w / 2, 0.2, 0), P(w / 2, 0.2, 0), P(w / 2, h1, 0.05), P(-w / 2, h1, 0.05)]), rear);                // rear face
    poly(c, q([P(-w / 2, h1, 0.05), P(w / 2, h1, 0.05), P(w * 0.47, h1, L - 0.1), P(-w * 0.47, h1, L - 0.1)]), deck); // boot + bonnet
    const z0 = 1.0, z1 = 1.8, z2 = 3.0, cw = 0.74, rw = 0.64;
    if (sideVis) poly(c, q([P(side * 0.82, h1, z0), P(side * 0.82, h1, z2 + 0.45), P(side * 0.71, h2, z2), P(side * 0.71, h2, z1)]), mix(sideC, glass, 0.6));
    poly(c, q([P(-cw, h1, z0), P(cw, h1, z0), P(rw, h2, z1), P(-rw, h2, z1)]), glass);                                // rear window (sloped)
    poly(c, q([P(-rw, h2, z1), P(rw, h2, z1), P(rw, h2, z2), P(-rw, h2, z2)]), roof);                                // roof
    // tail / brake lights
    const lit = br > 0.02, lc = lit ? mix('#C0261C', '#FF4A26', br) : '#6E150E';
    for (const sx of [-1, 1]) {
      const a1 = P(sx * 0.86, 0.5, -0.01), a2 = P(sx * 0.48, 0.7, -0.01);
      poly(c, [[a1[0], a1[1]], [a2[0], a1[1]], [a2[0], a2[1]], [a1[0], a2[1]]], lc);
      const cxl = (a1[0] + a2[0]) / 2, cyl = (a1[1] + a2[1]) / 2, rr = HW.f * (lit ? 0.9 + 0.5 * br : 0.45) / a1[2];
      glow(c, cxl, cyl, rr * 2.2, lit ? PAL.brake : '#B3241A', lit ? 0.5 * br + 0.12 : 0.16);
    }
    if (lit) { const hm = P(0, h2 - 0.02, z1 - 0.05); glow(c, hm[0], hm[1], HW.f * 0.7 / hm[2], PAL.brake, 0.45 * br); }
  });
}
/** brake light glow reflected on the wet-looking asphalt behind a car */
function roadGlow(c, X, Z, br, a = 1) {
  if (br <= 0.02) return; const p = hwP(X, 0, Z - 1.2), k = HW.f / p[2];
  c.save(); c.translate(p[0], p[1]); c.scale(1, 0.32);
  glow(c, 0, 0, k * 3.4, PAL.brake, 0.28 * br * a); c.restore();
}
/** the highway: sky, road, markings, lamps; cars of the four platoons at model time m. o: {a, carA, dim} */
function highway(stage, m, o = {}) {
  const c = stage.ctx, a = o.a ?? 1, camZ = V30 * m;
  withAlpha(c, a, () => {
    const sky = c.createLinearGradient(0, 0, 0, HORIZON_Y + 40); sky.addColorStop(0, '#020A10'); sky.addColorStop(0.75, '#08151E'); sky.addColorStop(1, '#152430');
    c.fillStyle = sky; c.fillRect(0, 0, 1080, HORIZON_Y + 40);
    glow(c, 540, HORIZON_Y + 6, 520, '#3A4A55', 0.25); glow(c, 540, HORIZON_Y + 4, 240, '#FFB36A', 0.06);
    const R = rng(7); for (let k = 0; k < 40; k++) { const x = R() * 1080, y = HORIZON_Y - 6 - R() * 14; circle(c, x, y, 1 + R() * 1.4, rgba(R() < 0.5 ? '#FFD9A0' : '#9FC4D8', 0.25 + 0.3 * R())); }
    // ground beside the road
    const gnd = c.createLinearGradient(0, HORIZON_Y, 0, 1920); gnd.addColorStop(0, '#0A141A'); gnd.addColorStop(1, '#060D12');
    c.fillStyle = gnd; c.fillRect(0, HORIZON_Y, 1080, 1920 - HORIZON_Y);
    const E = 2 * HW.lane + 1.0, road = [hwP(-E, 0, HW.zNear), hwP(E, 0, HW.zNear), hwP(E, 0, HW.zFar), hwP(-E, 0, HW.zFar)].map(p => [p[0], p[1]]);
    const rg = c.createLinearGradient(0, HORIZON_Y, 0, 1920); rg.addColorStop(0, '#111C23'); rg.addColorStop(1, PAL.asphalt);
    poly(c, road, rg);
    // lamp pools (right side, every 45 m)
    for (let k = 0; k < 22; k++) { const z = 45 * k - (camZ % 45) + 8; if (z < HW.zNear) continue; const p = hwP(4.5, 0, z), r = HW.f * 9 / p[2]; c.save(); c.translate(p[0], p[1]); c.scale(1, 0.3); glow(c, 0, 0, r, PAL.lamp, 0.16); c.restore(); }
    // markings
    for (const X of [-2 * HW.lane, 2 * HW.lane]) { const p0 = hwP(X, 0, HW.zNear), p1 = hwP(X, 0, HW.zFar); line(c, [[p0[0], p0[1]], [p1[0], p1[1]]], rgba(PAL.mark, 0.55), 3); }
    for (const X of [-HW.lane, 0, HW.lane]) for (let k = 0; k < 75; k++) {
      const z0 = 12 * k - (camZ % 12), z1 = z0 + 3.2; if (z1 < HW.zNear) continue;
      const p0 = hwP(X, 0, Math.max(HW.zNear, z0)), p1 = hwP(X, 0, z1), wd = Math.max(1, HW.f * 0.15 / p0[2]);
      line(c, [[p0[0], p0[1]], [p1[0], p1[1]]], rgba(PAL.mark, 0.5 * clamp(1.4 - z0 / 500)), wd, {cap: 'butt'});
    }
    // lamp poles and heads (behind the cars for the near ones is fine: they stand beside the road)
    for (let k = 0; k < 22; k++) { const z = 45 * k - (camZ % 45) + 8; if (z < HW.zNear + 2) continue; const b = hwP(9.5, 0, z), tp = hwP(9.5, 10, z), hd = hwP(6.5, 9.8, z);
      line(c, [[b[0], b[1]], [tp[0], tp[1]], [hd[0], hd[1]]], rgba('#4B5961', 0.8), Math.max(1, HW.f * 0.18 / b[2])); glow(c, hd[0], hd[1], HW.f * 2.2 / hd[2], PAL.lamp, 0.35); }
    // cars, far → near
    const list = [];
    HOOK.forEach((L, l) => { for (let i = 0; i < HOOK_N; i++) { const Z = hookZ(l, i, m); if (Z < HW.zNear - 4.6 || Z > HW.zFar) continue; list.push({l, i, Z, X: L.X, br: braking(L.S, i, m) ? 1 : 0}); } });
    list.sort((p, q) => q.Z - p.Z);
    for (const k of list) roadGlow(c, k.X, k.Z, k.br, o.carA ?? 1);
    for (const k of list) car3D(c, k.X, k.Z, carCol(k.l * 5 + k.i), k.br, o.carA ?? 1);
    const vg = c.createLinearGradient(0, 1380, 0, 1920); vg.addColorStop(0, 'rgba(1,6,9,0)'); vg.addColorStop(1, 'rgba(1,6,9,0.62)'); c.fillStyle = vg; c.fillRect(0, 1380, 1080, 540);
  });
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '사고도 없는데 왜 막힐까'],
  origin: ['기원 · 이름', '체증이라는 말'],
  ring: ['실험 · 2008년 일본', '원형 도로 위 22대'],
  react: ['메커니즘 · 반응', '1초 남짓 늦은 브레이크'],
  flow: ['본질 · 밀도', '촘촘하면 흔들림이 자란다'],
  wave: ['메커니즘 · 정체의 물결', '뒤로 번지는 정체'],
  av: ['실험 · 2017년 미국', '자율주행차 한 대'],
  myth: ['오해 바로잡기', '차로를 자주 바꾸면?'],
  close: ['나부터 할 수 있는 일', '넉넉한 간격, 부드러운 운전'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'ring') return [[-Infinity, ...titles.ring], [at6(tl), '실험 · 결과', '정체가 뒤로 흐른다']];
  if (id === 'react') return [[-Infinity, ...titles.react], [P.s08, '메커니즘 · 증폭', '뒤로 갈수록 커지는 흔들림'], [P.s09, '메커니즘 · 씨앗', '멈춰 선 차 한 대']];
  if (id === 'flow') return [[-Infinity, ...titles.flow], [P.fd0 + 0.1, '본질 · 흐름', '흐름 = 밀도 × 속도'], [P.kMid[0], '본질 · 한계', '한 차로가 보낼 수 있는 차']];
  if (id === 'wave') return [[-Infinity, ...titles.wave], [P.s15, '현상 · 병목', '정체가 먼저 생기는 곳']];
  if (id === 'av') return [[-Infinity, ...titles.av], [tl.at('s17') - 0.55, '실험 · 결과', '물결이 잦아든다']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
const at6 = tl => tl.at('s06') - 0.55;
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', '사고도 없는데 왜 막힐까', fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, '유령 체증', ho, 'rgba(0,0,0,0.95)');
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  if (id === 'close') {
    const a = smooth(ctx.scene.p / 0.04) * fadeOut(t, P.reason - 0.35, 0.3);
    if (a > 0) head(stage, ...titles.close, a, a);
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
const POSTER_Q = {y: 1004, y2: 1172, q: '사고도 없는데 왜 막힐까', ans: '유령 체증'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 780, 96); ASIZE ||= fit(POSTER_Q.ans, 760, 230);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 860, 0, 1330); g2.addColorStop(0, 'rgba(1,8,12,0)'); g2.addColorStop(0.22, 'rgba(1,8,12,0.78)'); g2.addColorStop(0.8, 'rgba(1,8,12,0.78)'); g2.addColorStop(1, 'rgba(1,8,12,0)');
    c.fillStyle = g2; c.fillRect(0, 860, 1080, 470);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    stage.text(POSTER_Q.ans, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', tracking: tr * s2, shadow: q < 0.5 ? 'rgba(0,0,0,0.9)' : null, shadowBlur: 26});
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/traffic-jam/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const m of [5, 29, 40, 77, 120, 200]) h += meanV(RING, m) + stoppedN(RING, m) / 10 + spreadV(RING_AV, Math.min(129, m / 2)) / 10;
  for (const t of [3, 33, 97.5, 112, 126, 143]) h += P.ringM(30 + t / 10) / 50 + P.kAt(t) / 100 + P.avM(130 + t / 10) / 300;
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/${FIRST_STOP}/${W_KMH.toFixed(2)}/${P.reactOn.map(x => x?.toFixed(3)).join(',')}/${P.passT.length}/${P.joins.length}:${P.leaves.length}/${(FUEL.after / FUEL.before).toFixed(4)}/${P.mythOn.map(x => x?.toFixed(3)).join(',')}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  ring(stage, t, p, ctx) { ringScene(stage, t, ctx); },
  react(stage, t, p, ctx) { reactScene(stage, t, ctx); },
  flow(stage, t, p, ctx) { flowScene(stage, t, ctx); },
  wave(stage, t, p, ctx) { waveScene(stage, t, ctx); },
  av(stage, t, p, ctx) { avScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1340, 0, 1600);
  g.addColorStop(0, 'rgba(1,8,12,0)'); g.addColorStop(0.35, `rgba(1,8,12,${0.62 * a})`); g.addColorStop(0.75, `rgba(1,8,12,${0.62 * a})`); g.addColorStop(1, 'rgba(1,8,12,0)');
  c.fillStyle = g; c.fillRect(0, 1340, 1080, 260);
}

// ------------------------------------------------------------------ hook: the night highway → no accident, no works → stop-and-go → "유령 체증"
function warnIcon(c, x, y, s, col) { poly(c, [[x, y - s], [x + s * 1.1, y + s * 0.85], [x - s * 1.1, y + s * 0.85]], null, col, 4); line(c, [[x, y - s * 0.35], [x, y + s * 0.3]], col, 5); circle(c, x, y + s * 0.6, 3.5, col); }
function coneIcon(c, x, y, s, col) { poly(c, [[x - s * 0.25, y - s], [x + s * 0.25, y - s], [x + s * 0.7, y + s * 0.8], [x - s * 0.7, y + s * 0.8]], null, col, 4); line(c, [[x - s * 0.45, y - s * 0.1], [x + s * 0.45, y - s * 0.1]], col, 4); line(c, [[x - s * 1.0, y + s * 0.85], [x + s * 1.0, y + s * 0.85]], col, 4); }
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3), m = P.hookM(t);
  highway(stage, m, {a: ef});
  if (t < MORPH[1]) return;
  captionShade(c, ef * fadeIn(t, 0.95, 0.4));
  withAlpha(c, ef, () => {
    // nothing on the road ahead: no accident, no road works
    const yI = 470;
    [[P.noAcc, 400, '사고', warnIcon], [P.noWork, 680, '공사', coneIcon]].forEach(([t0, x, s, icon]) => {
      const q = fadeIn(t, t0, 0.3); if (q <= 0) return;
      withAlpha(c, q, () => { icon(c, x, yI, 30, rgba(T.ink, 0.75)); stage.text(`${s} 없음`, x, yI + 66, {size: 28, weight: 700, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)'}); });
      cross(c, x, yI + 4, 40, PAL.bad, 6, clamp((t - t0 - 0.15) / 0.35));
    });
    // s02: the empty road ahead, then the stop-and-go readout and the name
    const qa = fadeIn(t, P.ahead, 0.4);
    if (qa > 0) withAlpha(c, qa, () => {
      const zf = 150, p0 = hwP(-2 * HW.lane, 0, zf), p1 = hwP(2 * HW.lane, 0, zf), p2 = hwP(2 * HW.lane, 0, 420), p3 = hwP(-2 * HW.lane, 0, 420);
      line(c, [[p0[0], p0[1]], [p1[0], p1[1]], [p2[0], p2[1]], [p3[0], p3[1]], [p0[0], p0[1]]], rgba(PAL.cool, 0.8), 3, {dash: [10, 8]});
      tag(stage, '앞: 아무 일도 없음', 540, 372, {size: 26, color: PAL.cool, plateA: 0.7});
    });
    const qs = fadeIn(t, P.stopgo, 0.4) * fadeOut(t, P.ghost - 0.2, 0.3);
    if (qs > 0) withAlpha(c, qs, () => {
      const {l, i} = HOOK_PICK, L = HOOK[l], Z = hookZ(l, i, m), pc = hwP(L.X, 0.8, Z + CAR_L / 2);
      ring(c, pc[0], pc[1], HW.f * 3.2 / pc[2], rgba(PAL.cool, 0.95), 4);
      const G = {x0: 230, x1: 880, y0: 1290, y1: 1180, t1: 15.8};
      panel(c, T, 150, 1120, 780, 200, 0.8);
      stage.text('표시한 차의 속도 (모형)', 175, 1150, {size: 26, weight: 700, color: PAL.cool});
      line(c, [[G.x0, G.y1], [G.x0, G.y0], [G.x1, G.y0]], rgba(T.muted, 0.7), 2);
      stage.text('0', G.x0 - 12, G.y0, {size: 24, weight: 500, color: T.muted, align: 'right'}); stage.text('30', G.x0 - 12, G.y1 + 6, {size: 24, weight: 500, color: T.muted, align: 'right'});
      const pts = []; for (let tt = 0; tt <= t; tt += 0.05) pts.push([lerp(G.x0, G.x1, tt / G.t1), lerp(G.y0, G.y1 + 6, sample(L.S, 'V', i, P.hookM(tt)) / V30)]);
      if (pts.length > 1) line(c, pts, PAL.cool, 4);
      const st = HOOK_STOP.filter(x => x <= t);
      for (const x of st) tag(stage, '멈춤', lerp(G.x0, G.x1, x / G.t1) + 4, G.y0 - 22, {size: 24, color: PAL.bad, plateA: 0.8});
    });
    const qg = fadeIn(t, P.ghost, 0.35);
    if (qg > 0) withAlpha(c, qg, () => {
      const g2 = c.createLinearGradient(0, 960, 0, 1320); g2.addColorStop(0, 'rgba(1,8,12,0)'); g2.addColorStop(0.3, 'rgba(1,8,12,0.7)'); g2.addColorStop(0.75, 'rgba(1,8,12,0.7)'); g2.addColorStop(1, 'rgba(1,8,12,0)');
      c.fillStyle = g2; c.fillRect(0, 960, 1080, 360);
      stage.text('유령 체증', 540, 1110, {role: 'display', size: 110, weight: 700, color: PAL.answer, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 22});
      stage.text('phantom traffic jam', 540, 1210, {size: 32, weight: 500, color: T.muted, align: 'center'});
    });
  });
}

// ------------------------------------------------------------------ origin: 滯症 = 滯(막힐 체) + 症(증세 증) → food stuck → 교통 체증 ← 막힌 길
const GUT = {x0: 330, y0: 740, inlet: [352, 904]};
const gutY = y => 900 + (y - 900) * 1.25, gutX = x => GUT.x0 + (x - GUT.x0) * 1.25;
const FOOD_N = 5, FOOD_SP = 30;
/** food piece k: y along the gullet at time t (falls, then queues behind the stuck one) */
function foodY(P, k, t) { const t0 = P.foodT(k); if (t < t0) return null; const yStop = GUT.inlet[1] - 12 - k * FOOD_SP; return Math.min(GUT.y0 + 420 * (t - t0) ** 1.4, yStop); }
export const foodStopT = (P, k) => P.foodT(k) + ((GUT.inlet[1] - 12 - k * FOOD_SP - GUT.y0) / 420) ** (1 / 1.4);
function stomach(c, T, a, hot) {
  withAlpha(c, a, () => {
    c.save(); c.translate(GUT.x0, 900); c.scale(1.25, 1.25); c.translate(-GUT.x0, -900);
    const col = rgba('#D9C7B8', 0.85);
    // gullet (two walls)
    line(c, [[GUT.x0 - 20, GUT.y0 - 40], [GUT.x0 - 20, 880], [GUT.inlet[0] - 22, 900]], col, 3.5);
    line(c, [[GUT.x0 + 20, GUT.y0 - 40], [GUT.x0 + 20, 880], [GUT.inlet[0] + 14, 900]], col, 3.5);
    // stomach bag (J shape), pylorus to the right
    c.beginPath(); c.moveTo(GUT.inlet[0] - 22, 900); c.bezierCurveTo(240, 960, 250, 1150, 400, 1160); c.bezierCurveTo(520, 1168, 600, 1080, 610, 1010);
    c.lineTo(660, 990); c.moveTo(GUT.inlet[0] + 14, 900); c.bezierCurveTo(430, 940, 470, 1000, 560, 990); c.lineTo(600, 975); c.lineTo(660, 965);
    c.strokeStyle = col; c.lineWidth = 3.5; c.stroke();
    if (hot > 0) glow(c, GUT.inlet[0], GUT.inlet[1] - 30, 90, PAL.brake, 0.25 * hot);
    c.restore();
  });
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const a0 = fadeIn(t, P.hanja, 0.4);
    stage.text('滯症', 540, 440, {size: 150, weight: 700, color: T.ink, align: 'center', alpha: a0, shadow: 'rgba(0,0,0,0.6)', shadowBlur: 16});
    stage.text('체증', 540, 560, {size: 34, weight: 700, color: T.muted, align: 'center', alpha: a0});
    // the two characters explained (on "한자말이고")
    const ah = fadeIn(t, P.hanjaEq, 0.4);
    if (ah > 0) withAlpha(c, ah, () => {
      panel(c, T, 160, 610, 360, 84, 0.86); panel(c, T, 560, 610, 360, 84, 0.86);
      stage.text('滯', 215, 652, {size: 46, weight: 700, color: PAL.answer, align: 'center'}); stage.text('막힐 체', 380, 652, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('症', 615, 652, {size: 46, weight: 700, color: PAL.answer, align: 'center'}); stage.text('증세 증', 780, 652, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('+', 540, 652, {role: 'display', size: 40, weight: 700, color: T.muted, align: 'center'});
    });
    // stomach: food goes down and gets stuck at the inlet, the next pieces queue behind it
    const as = fadeIn(t, P.eat[0] - 0.5, 0.5) * lerp(1, 0.16, fadeIn(t, P.road3 - 0.1, 0.5));
    const stuck = fadeIn(t, foodStopT(P, 0), 0.25);
    stomach(c, T, as, stuck);
    for (let k = 0; k < FOOD_N; k++) {
      const y = foodY(P, k, t); if (y == null) continue;
      const stopped = t >= foodStopT(P, k);
      withAlpha(c, as, () => { rect(c, GUT.x0 - 16, gutY(y) - 14, 32, 28, 8, stopped ? '#C9A27A' : '#B8A48C', rgba('#04121A', 0.5), 1.2); });
    }
    const al = fadeIn(t, P.notDown, 0.4) * (1 - fadeIn(t, P.road3 - 0.1, 0.5) * 0.6);
    if (al > 0) withAlpha(c, al, () => {
      line(c, [[GUT.x0 + 40, gutY(GUT.inlet[1] - 40)], [620, 840]], rgba(T.muted, 0.7), 2);
      stage.text('먹은 음식이 얹혀', 640, 830, {role: 'display', size: 32, weight: 700, color: T.ink});
      stage.text('내려가지 않음', 640, 876, {role: 'display', size: 32, weight: 700, color: T.ink});
      const az = fadeIn(t, P.symptom, 0.35); stage.text('= 증세 (症)', 640, 934, {role: 'display', size: 32, weight: 700, color: PAL.answer, alpha: az});
    });
    // "막힌 길을 여기에 빗댄 말" → a queue of cars on a road
    const ar = fadeIn(t, P.road3, 0.45);
    if (ar > 0) withAlpha(c, ar, () => {
      rect(c, 150, 1150, 780, 96, 6, PAL.asphalt, rgba(PAL.mark, 0.35), 2);
      for (let x = 170; x < 920; x += 46) line(c, [[x, 1198], [x + 20, 1198]], rgba(PAL.mark, 0.25), 3, {cap: 'butt'});
      for (let k = 0; k < 7; k++) {
        const xs = 860 - k * 108, enter = P.road3 + 0.1 * k, q = clamp((t - enter) / 0.4), x = lerp(xs + 160, xs, easeOut(q));
        if (q > 0) clipRect(c, 150, 1150, 780, 96, 6, () => carTop(c, x, 1198, 0, 86, 40, carCol(k), 1, {alpha: q}));
      }
      const ak = fadeIn(t, P.liken, 0.35);
      stage.text('교통 체증', 330, 1296, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center', alpha: ak});
      stage.text('← 막힌 길에 빗댐', 640, 1296, {role: 'display', size: 34, weight: 700, color: PAL.answer, align: 'center', alpha: ak});
      
    });
    const ae = fadeIn(t, P.jamEn, 0.35);
    if (ae > 0) stage.text('traffic jam · jam = 꽉 끼다', 540, 1098, {size: 26, weight: 500, color: T.muted, align: 'center', alpha: ae});
  });
}

// =====================================================================================================
// Ring view (2008 ring, s10, AV)
// =====================================================================================================
/** car states of a ring table at model time m (m < 0: the homogeneous start extrapolated back) */
function ringCars(S, m) {
  const out = [];
  for (let i = 0; i < S.N; i++) {
    if (m < 0) { out.push({i, x: S.X[i] + S.V[i] * m, v: S.V[i], a: 0, br: 0}); continue; }
    const v = sample(S, 'V', i, m), a = sample(S, 'A', i, m);
    out.push({i, x: sample(S, 'X', i, m), v, a, br: a < BRAKE_A || v < STOP_V ? 1 : 0});
  }
  return out;
}
/** tilted ring: V = {cx, cy, R, k, rw}; o: {alpha, color(i), hi(i) → stroke colour, streak (model s per frame), show(i), scale} */
function ringDraw(stage, V, cars, o = {}) {
  const c = stage.ctx, T = stage.theme, sc = o.scale ?? 1;
  withAlpha(c, o.alpha ?? 1, () => {
    c.save(); c.translate(V.cx, V.cy); c.scale(1, V.k);
    c.beginPath(); c.arc(0, 0, V.R + V.rw / 2, 0, TAU); c.arc(0, 0, V.R - V.rw / 2, 0, TAU, true);
    c.fillStyle = PAL.asphalt; c.fill('evenodd');
    ring(c, 0, 0, V.R + V.rw / 2, rgba(PAL.mark, 0.5), 2.2 / V.k * 0.8); ring(c, 0, 0, V.R - V.rw / 2, rgba(PAL.mark, 0.5), 2.2 / V.k * 0.8);
    if (o.under) o.under(c);
    const order = cars.slice().sort((p, q) => Math.sin(q.x / RING_C * TAU) - Math.sin(p.x / RING_C * TAU));
    const pxm = V.R * TAU / RING_C;
    for (const k of order) {
      if (o.show && !o.show(k.i)) continue;
      const a = k.x / RING_C * TAU, s = (1 - 0.1 * Math.sin(a)) * sc, x = V.R * Math.cos(a), y = -V.R * Math.sin(a), ang = Math.atan2(-Math.cos(a), -Math.sin(a));
      if (o.streak && k.v * o.streak > 1.2) { const da = k.v * o.streak / RING_C * TAU; c.beginPath(); c.arc(0, 0, V.R, -a, -a + da); c.strokeStyle = rgba(o.color ? o.color(k.i) : carCol(k.i), 0.22); c.lineWidth = CAR_W * pxm * s; c.lineCap = 'butt'; c.stroke(); }
      carTop(c, x, y, ang, CAR_L * pxm * s, CAR_W * pxm * s * 1.15, o.color ? o.color(k.i) : carCol(k.i), k.br, {hi: o.hi ? o.hi(k.i) : null, alpha: o.carA ? o.carA(k.i) : 1, glowK: 1.3});
    }
    c.restore();
  });
}
const ringPt = (V, x, rOff = 0) => { const a = x / RING_C * TAU; return [V.cx + (V.R + rOff) * Math.cos(a), V.cy - (V.R + rOff) * V.k * Math.sin(a)]; };
/** red band under the main jam cluster (drawn inside ringDraw's squashed frame) */
const jamBand = (V, cl, a) => c => {
  if (!cl || a <= 0) return; const a0 = (cl.tail - 4) / RING_C * TAU, a1 = (cl.tail + cl.len + 4) / RING_C * TAU;
  c.beginPath(); c.arc(0, 0, V.R, -a1, -a0); c.strokeStyle = rgba(PAL.jam, 0.32 * a); c.lineWidth = V.rw * 1.5; c.lineCap = 'round'; c.stroke();
};
/** arc arrow along the ring outside it: from position x0 to x1 (m), at radius offset */
function ringArrow(c, V, x0, x1, rOff, col, w = 5) {
  const pts = []; for (let k = 0; k <= 24; k++) pts.push(ringPt(V, lerp(x0, x1, k / 24), rOff));
  line(c, pts.slice(0, -1), col, w); arrow(c, pts.at(-3), pts.at(-1), col, w, {head: 18});
}

// ------------------------------------------------------------------ ring (s04–s06)
const RV = {cx: 540, cy: 680, R: 380, k: 0.6, rw: 54};
function ringScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), m = P.ringM(t), rate = P.ringM.rate(t);
  withAlpha(c, sf, () => {
    const dq = easeInOut((t - P.ringDraw[0]) / (P.ringDraw[1] - P.ringDraw[0]));
    // the track draws on, then the cars
    c.save(); c.translate(RV.cx, RV.cy); c.scale(1, RV.k);
    if (dq < 1) { c.beginPath(); c.arc(0, 0, RV.R, 0, -TAU * dq, true); c.strokeStyle = rgba(PAL.mark, 0.6); c.lineWidth = 3; c.stroke(); }
    c.restore();
    const cars = ringCars(RING, m), cl = m > 0 ? mainCluster(RING, m) : null, nIn = Math.floor(clamp((t - P.carsIn[0]) / (P.carsIn[1] - P.carsIn[0])) * RING_N + 1e-6);
    if (dq > 0.98) ringDraw(stage, RV, cars, {scale: 1.2, alpha: smooth((dq - 0.98) / 0.02), show: i => t >= P.carsIn[1] || i < nIn, streak: rate > 4 ? rate / 30 : 0,
      under: jamBand(RV, cl, fadeIn(t, P.firstStop, 0.4))});
    // labels inside the ring
    stage.text('둘레 230 m', 540, 640, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.c230, 0.4)});
    const nShown = t >= P.carsIn[1] ? RING_N : nIn;
    if (t > P.carsIn[0]) stage.text(`차 ${nShown}대`, 540, 704, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.carsIn[0], 0.3)});
    tag(stage, '실험 재현 · 모형', 540, 352, {size: 24, color: T.muted, a: fadeIn(t, P.ringDraw[0] + 0.3, 0.4), plate: false});
    // same spacing: bracket between two cars at the bottom of the ring
    const sa = fadeIn(t, P.spacing, 0.35) * fadeOut(t, P.ff0, 0.4);
    if (sa > 0) withAlpha(c, sa, () => {
      const xs = cars.map(k => ((k.x % RING_C) + RING_C) % RING_C), pick = xs.map((x, i) => [Math.abs(x - 172.5), i]).sort((p, q) => p[0] - q[0])[0][1];
      const xa = xs[pick], xb = xa + RING_C / RING_N, pa = ringPt(RV, xa, -50), pb = ringPt(RV, xb, -50);
      line(c, [ringPt(RV, xa, -32), pa, pb, ringPt(RV, xb, -32)], rgba(PAL.cool, 0.9), 3);
      stage.text('앞차까지 10.5 m', (pa[0] + pb[0]) / 2, Math.min(pa[1], pb[1]) - 30, {size: 28, weight: 700, color: PAL.cool, align: 'center'});
    });
    // "한 곳에서": where the first car will stop (from the model)
    const fi = (() => { let best = 0, bv = 1e9; for (let i = 0; i < RING_N; i++) { const v = sample(RING, 'V', i, FIRST_STOP); if (v < bv) { bv = v; best = i; } } return best; })();
    const wa = fadeIn(t, P.where, 0.3) * fadeOut(t, P.firstStop + 1.2, 0.5);
    if (wa > 0) { const xw = sample(RING, 'X', fi, Math.max(0, m)), pw = ringPt(RV, xw); withAlpha(c, wa, () => { ring(c, pw[0], pw[1], 44 + 6 * Math.sin(TAU * 1.5 * t), rgba(PAL.answer, 0.9), 4); }); }
    // arrows: cars go one way, the jam the other
    const ba = fadeIn(t, P.back6, 0.4);
    if (ba > 0 && cl) withAlpha(c, ba, () => {
      const xc = cl.center, xb = cl.tail - 4;
      ringArrow(c, RV, xb, xb - 40 * clamp((t - P.back6) / 0.8), RV.rw / 2 + 40, PAL.jam, 6);
      const pl = ringPt(RV, xb - 26, -RV.rw / 2 - 70); tag(stage, '정체: 뒤로', pl[0], pl[1], {size: 28, color: PAL.jam, plateA: 0.75});
      const xa = cl.head + 30; ringArrow(c, RV, xa, xa + 40 * clamp((t - P.reverse) / 0.8), RV.rw / 2 + 40, rgba(T.ink, 0.85), 5);
      const pc = ringPt(RV, xa + 26, -RV.rw / 2 - 70); if (t > P.reverse) tag(stage, '차: 앞으로', pc[0], pc[1], {size: 28, color: T.ink, plateA: 0.75, a: fadeIn(t, P.reverse, 0.3)});
    });
    // readouts: mean speed, stopped cars, model clock; then the mean-speed record
    const ra = fadeIn(t, P.speedTile, 0.4);
    if (ra > 0) withAlpha(c, ra, () => {
      const mv = m < 0 ? 30 : meanV(RING, m) * KMH, st = m < 0 ? 0 : stoppedN(RING, m);
      tile(stage, 150, 985, 240, '평균 속도', `${Math.round(mv)} km/h`, {color: mv < 25 ? PAL.brakeHot : T.ink});
      tile(stage, 420, 985, 240, '멈춘 차', `${st} / 22`, {color: st ? PAL.brakeHot : T.ink});
      tile(stage, 690, 985, 240, '경과 시간', fmtClock(Math.max(0, m)), {});
      const G = {x0: 190, x1: 900, y0: 1290, y1: 1170, m1: 45};
      stage.text('평균 속도 (km/h)', 160, 1140, {size: 24, weight: 700, color: T.muted});
      line(c, [[G.x0, G.y1 - 6], [G.x0, G.y0], [G.x1, G.y0]], rgba(T.muted, 0.7), 2);
      for (const v of [0, 30]) stage.text(String(v), G.x0 - 12, lerp(G.y0, G.y1, v / 40), {size: 24, weight: 500, color: T.muted, align: 'right'});
      line(c, [[G.x0, lerp(G.y0, G.y1, 0.75)], [G.x1, lerp(G.y0, G.y1, 0.75)]], rgba(T.muted, 0.25), 1, {dash: [6, 6]});
      if (m > 0) { const pts = []; for (let mm = 0; mm <= Math.min(m, G.m1); mm += 0.25) pts.push([lerp(G.x0, G.x1, mm / G.m1), lerp(G.y0, G.y1, meanV(RING, mm) * KMH / 40)]); if (pts.length > 1) line(c, pts, PAL.answer, 4); }
      stage.text('모형 시간 0 → 45초', G.x1, G.y0 + 26, {size: 24, weight: 500, color: T.muted, align: 'right'});
    });
    const fa = fadeIn(t, P.ff0, 0.3) * (rate > 3 ? 1 : 0.55);
    if (t > P.ff0) tag(stage, rate > 3 ? '▶▶ 시간 압축 · 모형' : '시간 압축 · 모형', 810, 1140, {size: 24, color: PAL.warm, a: fa, plate: false});
  });
}

// =====================================================================================================
// Vertical road (react / myth / close): cars drive up the screen; world x (m) → screen y
// =====================================================================================================
const RD = {px: 8.2};
/** chain car state at model time m (m < 0: cruise extrapolated back) */
function chainCar(S, k, m) {
  if (m < 0) return {x: S.X[k] + V30 * m, v: V30, a: 0, br: 0};
  const v = sample(S, 'V', k, m), a = sample(S, 'A', k, m);
  return {x: sample(S, 'X', k, m), v, a, br: a < R_BRAKE || v < 0.05 ? clamp(0.55 + 0.45 * clamp(-a / 3)) : 0};
}
function roadColumn(c, x, y0, y1, w, camX, lanes = 1) {
  rect(c, x - w / 2, y0, w, y1 - y0, 0, PAL.asphalt);
  line(c, [[x - w / 2, y0], [x - w / 2, y1]], rgba(PAL.mark, 0.55), 2.5); line(c, [[x + w / 2, y0], [x + w / 2, y1]], rgba(PAL.mark, 0.55), 2.5);
  if (lanes === 2) { const off = ((camX * RD.px) % 108 + 108) % 108; for (let yy = y0 - 108 + off; yy < y1; yy += 108) line(c, [[x, Math.max(y0, yy)], [x, Math.min(y1, yy + 40)]], rgba(PAL.mark, 0.45), 3, {cap: 'butt'}); }
  const off2 = ((camX * RD.px) % 90 + 90) % 90; for (let yy = y0 - 90 + off2; yy < y1; yy += 90) { circle(c, x - w / 2 - 14, yy, 2, rgba(PAL.mark, 0.25)); circle(c, x + w / 2 + 14, yy, 2, rgba(PAL.mark, 0.25)); }
}

// ------------------------------------------------------------------ react (s07–s09): chain model R, six cars, slow motion
const RX = {road: 240, top: 390, bot: 1300, y0: 430, rowY: k => 410 + k * 164, tr0: 400, tr1: 700, bar0: 740, bar1: 935, mMax: 13.0};
function reactScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), m = P.reactM(t);
  const camLag = (() => { const d6 = V30 * Math.max(0, m) - (chainCar(REACT, REACT_SHOWN - 1, m).x - REACT.X[REACT_SHOWN - 1]); return Math.max(0, d6 - 0.5); })();
  const camX = V30 * m - camLag, ys = x => RX.y0 - (x - camX) * RD.px;
  const CW = CAR_W * RD.px * 1.45;
  withAlpha(c, sf, () => {
    clipRect(c, 140, RX.top, 230, RX.bot - RX.top, 10, () => {
      roadColumn(c, RX.road, RX.top, RX.bot, 80, camX);
      for (let k = REACT_N - 1; k >= 0; k--) {
        const s = chainCar(REACT, k, m), y = ys(s.x) + CAR_L * RD.px / 2;
        if (y < RX.top - 40 || y > RX.bot + 40) continue;
        const hiSeed = k === REACT_SHOWN - 1 ? fadeIn(t, P.seed, 0.3) : 0;
        carTop(c, RX.road, y, -Math.PI / 2, CAR_L * RD.px, CW, k < REACT_SHOWN ? carCol(k) : mix(carCol(k), '#33434C', 0.4), s.br, {hi: hiSeed > 0 ? rgba(PAL.answer, hiSeed) : null, glowK: 1.4});
        if (k < REACT_SHOWN && y > RX.top + 16 && y < RX.bot - 16) stage.text(String(k + 1), RX.road + 58, y, {role: 'display', size: 26, weight: 700, color: carCol(k), align: 'center'});
      }
      // the seed: a stopped car with others arriving behind it
      const sa = fadeIn(t, P.seed, 0.35);
      if (sa > 0) { const s = chainCar(REACT, REACT_SHOWN - 1, m), y = ys(s.x) + CAR_L * RD.px / 2; withAlpha(c, sa, () => glow(c, RX.road, y, 120, PAL.jam, 0.28)); }
    });
    tag(stage, '설명 모형 · 느린 화면', 150, 332, {size: 24, color: T.muted, plate: false, align: 'left', a: fadeIn(t, ctx.scene.start + 0.2, 0.4)});
    const sa = fadeIn(t, P.seed, 0.35);
    if (sa > 0) { const s6 = chainCar(REACT, REACT_SHOWN - 1, m), y6 = ys(s6.x) + CAR_L * RD.px / 2; tag(stage, '정체의 씨앗', 352, clamp(y6 - 64, 420, 1240), {size: 30, color: PAL.answer, a: sa, role: 'display', align: 'right', plateA: 0.85}); }
    // instrument rows: speed trace (left) and braking strength (right)
    stage.text('속도', RX.tr0, 374, {size: 24, weight: 700, color: T.muted, alpha: fadeIn(t, ctx.scene.start + 0.3, 0.4)});
    stage.text('브레이크 세기', RX.bar1, 374, {size: 24, weight: 700, color: T.muted, align: 'right', alpha: fadeIn(t, ctx.scene.start + 0.3, 0.4)});
    const px = mm => lerp(RX.tr0, RX.tr1, mm / RX.mMax);
    for (let k = 0; k < REACT_SHOWN; k++) {
      const y = RX.rowY(k) + 20, h = 104, yv = v => y + h / 2 - v / V30 * (h - 14);
      withAlpha(c, fadeIn(t, ctx.scene.start + 0.3 + 0.08 * k, 0.4), () => {
        line(c, [[RX.tr0, y + h / 2], [RX.tr1, y + h / 2]], rgba(T.muted, 0.35), 1.5);
        line(c, [[RX.tr0, yv(V30)], [RX.tr1, yv(V30)]], rgba(T.muted, 0.2), 1, {dash: [5, 6]});
        if (m > 0) { const pts = []; for (let mm = 0; mm <= Math.min(m, RX.mMax); mm += 0.05) pts.push([px(mm), yv(sample(REACT, 'V', k, mm))]); if (pts.length > 1) line(c, pts, carCol(k), 3.5); }
        const on = REACT_ON[k]; if (on != null && m >= on) { line(c, [[px(on), y - h / 2 + 4], [px(on), y + h / 2]], rgba(PAL.brake, 0.9), 3); }
        // braking strength: current (solid) and the largest so far (outline)
        const cur = Math.max(0, -chainCar(REACT, k, m).a), pk = m > 0 ? peakDecelR(REACT, k, m) : 0, bw = RX.bar1 - RX.bar0, f = v => clamp(v / 8) * bw;
        rect(c, RX.bar0, y - 16, bw, 32, 6, rgba(T.deep, 0.8), rgba(T.border, 1), 1.2);
        if (pk > 0.05) rect(c, RX.bar0, y - 16, f(pk), 32, 6, rgba(PAL.brake, 0.38));
        if (cur > 0.05) rect(c, RX.bar0, y - 16, f(cur), 32, 6, PAL.brake);
      });
      stage.text(String(k + 1), RX.tr0 - 24, y, {role: 'display', size: 26, weight: 700, color: carCol(k), align: 'center', alpha: fadeIn(t, ctx.scene.start + 0.3, 0.4)});
    }
    // "1초 남짓": the gap between car 1's and car 2's brake lights
    const qa = fadeIn(t, P.sec1, 0.35) * fadeOut(t, P.s08, 0.5);
    if (qa > 0 && m > REACT_ON[0]) withAlpha(c, qa, () => {
      const x1 = px(REACT_ON[0]), x2 = px(Math.min(m, REACT_ON[1])), yb = RX.rowY(0) + 20 + 76;
      line(c, [[x1, yb - 10], [x1, yb], [x2, yb], [x2, yb - 10]], PAL.warm, 3);
      tag(stage, '1초 남짓', x1, yb + 30, {size: 28, color: PAL.warm, role: 'display', plateA: 0.8, align: 'left'});
    });
    // "늦은 만큼 더 세게": compare bars 1 and 2
    const la = fadeIn(t, P.late, 0.35) * fadeOut(t, P.s08, 0.5);
    if (la > 0) tag(stage, '늦은 만큼 더 세게', RX.bar1, RX.rowY(1) + 66, {size: 26, color: PAL.brakeHot, a: la, plateA: 0.8, align: 'right'});
    // s08: the growth toward the back
    const ga = fadeIn(t, P.grow8, 0.4);
    if (ga > 0) tag(stage, '뒤로 갈수록 커짐', RX.bar1, RX.rowY(5) + 72, {size: 26, color: PAL.brakeHot, a: ga, plateA: 0.8, align: 'right'});
    // model clock
    if (m > 0) tag(stage, `모형 시간 ${m.toFixed(1)}초`, RX.bar1, 332, {size: 24, color: T.muted, plate: false, align: 'right'});
    if (t >= P.reactStop - 0.05) tag(stage, '멈춤', px(REACT_STOP) + 6, RX.rowY(5) + 72, {size: 26, color: PAL.bad, a: fadeIn(t, P.reactStop, 0.3), plateA: 0.8, align: 'left'});
  });
}

// ------------------------------------------------------------------ flow: s10 two rings, s11–s13 Greenshields instrument
const FR = [{cx: 315, S: RING16, n: 16, gap: '간격 10 m', name: '넉넉한 간격'}, {cx: 765, S: RING22, n: 22, gap: '간격 6 m', name: '촘촘한 간격'}];
function flowScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const aR = fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, P.fd0 - 0.1, 0.35), aF = fadeIn(t, P.fd0 + 0.1, 0.45) * fadeOut(t, ctx.scene.end - 0.22, 0.22);
  if (aR > 0) withAlpha(c, aR, () => twoRings(stage, t, P));
  if (aF > 0) withAlpha(c, aF, () => fdInstrument(stage, t, P));
}
function twoRings(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  FR.forEach((F, j) => {
    const V = {cx: F.cx, cy: 650, R: 190, k: 0.66, rw: 30}, m = j ? P.mR(t) : P.mL(t), live = j ? fadeIn(t, P.s10R - 0.3, 0.4) : 1;
    const cars = ringCars(F.S, Math.min(m, F.S.T - 0.01));
    stage.text(F.name, F.cx, 380, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
    stage.text(`차 ${F.n}대 · ${F.gap}`, F.cx, 424, {size: 26, weight: 700, color: T.muted, align: 'center'});
    ringDraw(stage, V, cars, {scale: 1.45, alpha: 0.55 + 0.45 * live});
    // record: speed spread (흔들림) vs model time
    const G = {x0: Math.max(F.cx - 160, 190), x1: F.cx + 175, y0: 1040, y1: 920, m1: 14};
    stage.text('흔들림 (속도 차)', F.cx, 880, {size: 26, weight: 700, color: T.muted, align: 'center'});
    line(c, [[G.x0, G.y1], [G.x0, G.y0], [G.x1, G.y0]], rgba(T.muted, 0.7), 2);
    if (m > 0) { const pts = []; for (let mm = 0; mm <= Math.min(m, G.m1); mm += 0.1) pts.push([lerp(G.x0, G.x1, mm / G.m1), lerp(G.y0, G.y1, clamp(spreadV(F.S, mm) * KMH / 40))]); if (pts.length > 1) line(c, pts, j ? PAL.brakeHot : PAL.good, 4); }
    stage.text('0', G.x0 - 10, G.y0, {size: 24, weight: 500, color: T.muted, align: 'right'}); stage.text('40', G.x0 - 10, G.y1 + 6, {size: 24, weight: 500, color: T.muted, align: 'right'});
    const sp = m > 0 ? spreadV(F.S, Math.min(m, F.S.T - 0.01)) * KMH : 0;
    stage.text(`${Math.round(sp)} km/h`, F.cx, 1090, {role: 'display', size: 36, weight: 700, color: j ? PAL.brakeHot : PAL.good, align: 'center', alpha: m > 0 ? 1 : 0.3});
  });
  const va = fadeIn(t, P.fades, 0.35); if (va > 0) tag(stage, '잦아듦', FR[0].cx, 1150, {size: 30, color: PAL.good, a: va, role: 'display'});
  const vb = fadeIn(t, P.grows, 0.35); if (vb > 0) tag(stage, '자라남 · 멈췄다 가기', FR[1].cx, 1150, {size: 30, color: PAL.brakeHot, a: vb, role: 'display'});
  tag(stage, '같은 모형 · 같은 작은 흔들림', 540, 1240, {size: 26, color: T.muted, plate: false, a: fadeIn(t, P.dense, 0.4)});
}
const FD = {x0: 230, x1: 900, y0: 1250, y1: 950, kMax: 80, qMax: 2200};
const fdXY = (k, q) => [lerp(FD.x0, FD.x1, k / FD.kMax), lerp(FD.y0, FD.y1, q / FD.qMax)];
function fdInstrument(stage, t, P) {
  const c = stage.ctx, T = stage.theme, k = P.kAt(t), v = gsV(k), q = gsQ(k), phi = P.phi(t);
  // top: one lane, cars at density k moving at v(k); the gate counts them
  const RY = 440, PXM = 6.6;
  rect(c, 140, RY - 40, 800, 80, 6, PAL.asphalt, rgba(PAL.mark, 0.35), 2);
  const n0 = Math.floor(phi);
  for (let n = n0 - 12; n <= n0 + 12; n++) {
    const xm = (phi - n) / k * 1000, x = 540 + xm * PXM; if (x < 120 || x > 960) continue;
    clipRect(c, 140, RY - 40, 800, 80, 6, () => carTop(c, x, RY, 0, CAR_L * PXM, CAR_W * PXM * 1.2, carCol(((n % 10) + 10) % 10), v < 25 ? 0.7 : 0));
  }
  const ga = fadeIn(t, P.gate, 0.35);
  withAlpha(c, ga, () => {
    line(c, [[540, RY - 56], [540, RY + 56]], PAL.warm, 3, {dash: [8, 6]});
    stage.text('한 지점', 540, RY - 76, {size: 26, weight: 700, color: PAL.warm, align: 'center'});
    const lastPass = P.passT.filter(x => x <= t).at(-1); if (lastPass != null && t - lastPass < 0.4) glow(c, 540, RY, 60, PAL.warm, 0.4 * (1 - (t - lastPass) / 0.4));
  });
  const cnt = P.passT.filter(x => x <= t).length;
  tag(stage, `지나간 차 ${cnt}대`, 540, RY + 84, {size: 26, color: T.ink, a: fadeIn(t, P.count, 0.35), plateA: 0.8});
  // middle: knob and q = k × v
  const KY = 600;
  stage.text('밀도 손잡이', 160, KY - 30, {size: 24, weight: 700, color: T.muted});
  line(c, [[230, KY], [900, KY]], rgba(T.muted, 0.6), 6);
  const kx = lerp(230, 900, k / FD.kMax); circle(c, kx, KY, 17, PAL.answer); ring(c, kx, KY, 17, '#04121A', 2);
  stage.text('적음', 230, KY + 34, {size: 24, weight: 500, color: T.muted, align: 'center'}); stage.text('많음', 900, KY + 34, {size: 24, weight: 500, color: T.muted, align: 'center'});
  const fa = fadeIn(t, P.formula, 0.4);
  const yR = 720;
  withAlpha(c, 0.35 + 0.65 * fa, () => {
    stage.text('밀도', 250, yR - 32, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text(`${Math.round(k)}대/km`, 250, yR + 10, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'});
    stage.text('×', 385, yR + 10, {role: 'display', size: 40, weight: 700, color: T.muted, align: 'center'});
    stage.text('속도', 520, yR - 32, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text(`${Math.round(v)} km/h`, 520, yR + 10, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'});
    stage.text('=', 650, yR + 10, {role: 'display', size: 40, weight: 700, color: T.muted, align: 'center'});
    stage.text('흐름 (시간당)', 800, yR - 32, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text(`${fmtInt(Math.round(q / 10) * 10)}대`, 800, yR + 10, {role: 'display', size: 40, weight: 700, color: PAL.answer, align: 'center'});
  });
  // bottom: q(k) parabola
  const da = fadeIn(t, P.mult, 0.45);
  line(c, [[FD.x0, FD.y1 - 10], [FD.x0, FD.y0], [FD.x1 + 10, FD.y0]], rgba(T.muted, 0.75), 2);
  stage.text('흐름 (대/시간)', 150, 896, {size: 24, weight: 700, color: T.muted});
  stage.text('밀도 (대/km) →', FD.x1, FD.y0 + 64, {size: 24, weight: 700, color: T.muted, align: 'right'});
  for (const qq of [0, 1000, 2000]) { const [, yy] = fdXY(0, qq); stage.text(fmtInt(qq), FD.x0 - 12, yy, {size: 24, weight: 500, color: T.muted, align: 'right'}); if (qq) line(c, [[FD.x0, yy], [FD.x1, yy]], rgba(T.muted, 0.18), 1, {dash: [6, 6]}); }
  for (const kk of [40, 80]) { const [xx] = fdXY(kk, 0); stage.text(String(kk), xx, FD.y0 + 30, {size: 24, weight: 500, color: T.muted, align: 'center'}); }
  stage.text('0', FD.x0, FD.y0 + 30, {size: 24, weight: 500, color: T.muted, align: 'center'});
  withAlpha(c, 0.25 + 0.75 * da, () => { const pts = []; for (let kk = 0; kk <= FD.kMax; kk += 1) pts.push(fdXY(kk, gsQ(kk))); line(c, pts, rgba(PAL.cool, 0.8), 3); });
  tag(stage, 'Greenshields 모형 · 한 차로', 940, 896, {size: 24, color: T.muted, plate: false, align: 'right', a: 0.4 + 0.6 * da});
  const lA = fadeIn(t, P.kLow[1] - 0.3, 0.4), hA = fadeIn(t, P.kHigh[1] - 0.2, 0.4);
  if (lA > 0) { const [x, y] = fdXY(8, gsQ(8)); tag(stage, '적어서 적게', x + 70, y - 30, {size: 24, color: PAL.cool, a: lA * 0.9, plateA: 0.75}); }
  if (hA > 0) { const [x, y] = fdXY(72, gsQ(72)); tag(stage, '느려서 적게', x - 30, y - 30, {size: 24, color: PAL.cool, a: hA * 0.9, plateA: 0.75}); }
  const [px, py] = fdXY(k, q);
  const near = Math.exp(-(((k - K_CRIT) / 5) ** 2)), pk = Math.max(Math.max(0, 1 - Math.abs(t - P.peak1) / 0.5), t >= P.peak2 ? 1 : 0);
  glow(c, px, py, 50, PAL.answer, 0.25 + 0.3 * near * pk); circle(c, px, py, 13, PAL.answer); ring(c, px, py, 13, '#04121A', 2);
  line(c, [[px, py], [px, FD.y0]], rgba(PAL.answer, 0.4), 2, {dash: [5, 5]});
  const ca = fadeIn(t, P.peak2, 0.4);
  if (ca > 0) withAlpha(c, ca, () => {
    const [x, y] = fdXY(K_CRIT, Q_MAX); ring(c, x, y, 24, PAL.answer, 3);
    const cq = fadeIn(t, P.cap, 0.35);
    tag(stage, '가장 많이 흐르는 점', x, y - 46, {size: 26, color: PAL.answer, plateA: 0.8});
    if (cq > 0) tag(stage, '약 2천 대 안팎 / 시간 · 한 차로', 540, 808, {size: 30, color: PAL.answer, a: cq, role: 'display', plateA: 0.85});
  });
}

// ------------------------------------------------------------------ wave: s14 space–time diagram of the ring, s15 four bottlenecks
const STD = {x0: 150, x1: 930, y0: 1200, y1: 520};
const stX = x => lerp(STD.x0, STD.x1, (((x % RING_C) + RING_C) % RING_C) / RING_C);
/** jam states measured in the steady part of the ring run (for w = (q₂ − q₁)/(k₂ − k₁)) */
export const WAVE_STATES = (() => {
  let hf = 0, vf = 0, nf = 0, hj = 0, nj = 0;
  for (let m = FIRST_STOP + 40; m < FIRST_STOP + 160; m += 0.5) for (let i = 0; i < RING_N; i++) {
    const v = sample(RING, 'V', i, m), x = sample(RING, 'X', i, m), xn = i === RING_N - 1 ? sample(RING, 'X', 0, m) + RING_C : sample(RING, 'X', i + 1, m), h = xn - x;
    if (v < STOP_V) { hj += h; nj++; } else if (v > 0.9 * VMAX) { hf += h; vf += v; nf++; }
  }
  hf /= nf; vf /= nf; hj /= nj;
  const k1 = 1000 / hf, q1 = vf / hf * 3600, k2 = 1000 / hj;
  return {k1, q1, k2, q2: 0, w: (0 - q1) / (k2 - k1)};
})();
function waveScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const a1 = fadeIn(t, ctx.scene.start, 0.25) * fadeOut(t, P.s15 - 0.2, 0.35), a2 = fadeIn(t, P.s15 + 0.1, 0.4) * fadeOut(t, ctx.scene.end - 0.22, 0.22);
  if (a1 > 0) withAlpha(c, a1, () => spaceTime(stage, t, P));
  if (a2 > 0) withAlpha(c, a2, () => bottlenecks(stage, t, P));
}
function spaceTime(stage, t, P) {
  const c = stage.ctx, T = stage.theme, m = P.waveM(t), my = mm => lerp(STD.y0, STD.y1, (mm - P.W0) / (P.W1 - P.W0));
  // top: the ring unrolled, cars now
  stage.text('원형 도로 230 m를 펼친 모습', 540, 340, {size: 26, weight: 700, color: T.muted, align: 'center'});
  rect(c, STD.x0, 372, STD.x1 - STD.x0, 40, 4, PAL.asphalt, rgba(PAL.mark, 0.35), 1.5);
  for (const k of ringCars(RING, m)) carTop(c, stX(k.x), 392, 0, CAR_L * 3.39 * 1.4, CAR_W * 3.39 * 2.0, carCol(k.i), k.br, {glowK: 0.8});
  arrow(c, [STD.x1 - 120, 440], [STD.x1 - 20, 440], rgba(T.ink, 0.7), 3, {head: 14}); stage.text('차의 방향', STD.x1 - 130, 440, {size: 24, weight: 700, color: T.muted, align: 'right'});
  // diagram frame
  line(c, [[STD.x0, STD.y1], [STD.x0, STD.y0], [STD.x1, STD.y0]], rgba(T.muted, 0.7), 2);
  stage.text('위치 →', STD.x1, STD.y0 + 30, {size: 24, weight: 700, color: T.muted, align: 'right'});
  stage.text('시간 ↑', STD.x0 + 8, STD.y1 - 24, {size: 24, weight: 700, color: T.muted});
  // trajectories up to now (red where the car is slower than 1.5 m/s)
  clipRect(c, STD.x0, STD.y1 - 4, STD.x1 - STD.x0, STD.y0 - STD.y1 + 4, 0, () => {
    for (let i = 0; i < RING_N; i++) {
      let seg = [], slowSeg = null, px = null;
      const flush = () => { if (seg.length > 1) line(c, seg, slowSeg ? rgba(PAL.jam, 0.95) : rgba('#B9C6CC', 0.55), slowSeg ? 3.2 : 1.8); };
      for (let mm = P.W0; mm <= m; mm += 0.2) {
        const x = sample(RING, 'X', i, mm), xs = stX(x), slow = sample(RING, 'V', i, mm) < 1.5, ys = my(mm);
        if (px != null && (Math.abs(xs - px) > 200 || slow !== slowSeg)) { if (Math.abs(xs - px) > 200) { flush(); seg = []; } else { seg.push([xs, ys]); flush(); seg = [seg.at(-1)]; } }
        seg.push([xs, ys]); slowSeg = slow; px = xs;
      }
      flush();
    }
    // tail joins (red) and head leaves (white)
    const ta = fadeIn(t, P.tail, 0.3), ha = fadeIn(t, P.head, 0.3);
    for (const j of P.joins) if (j.m <= m) circle(c, stX(j.x), my(j.m), 5, rgba(PAL.brakeHot, ta));
    for (const j of P.leaves) if (j.m <= m) circle(c, stX(j.x), my(j.m), 5, rgba('#FFFFFF', 0.9 * ha));
  });
  // scan line (now)
  line(c, [[STD.x0, my(m)], [STD.x1, my(m)]], rgba(PAL.warm, 0.6), 2, {dash: [6, 6]});
  // the jam's path: dashed guide along its centre, with the measured backward speed
  const wa = fadeIn(t, P.w20, 0.4);
  const guide = seg => { if (seg.length < 2) return; line(c, seg, 'rgba(0,0,0,0.75)', 9); line(c, seg, '#FFFFFF', 4, {dash: [12, 8]}); };
  if (wa > 0) withAlpha(c, wa, () => {
    let prev = null, off = 0, seg = [];
    for (let mm = FIRST_STOP + 6; mm <= Math.min(m, P.W1); mm += 0.5) {
      const p = jamPos(RING, mm); if (p == null) continue;
      if (prev != null && Math.abs(p - prev) > RING_C / 2) { guide(seg); seg = []; }
      seg.push([stX(p), my(mm)]); prev = p;
    }
    guide(seg);
    tag(stage, `뒤로 약 시속 ${Math.round(-W_KMH / 5) * 5} km`, 540, 488, {size: 32, color: '#FFFFFF', role: 'display', plateA: 0.85});
  });
  const sa = fadeIn(t, P.spread, 0.4);
  if (sa > 0) withAlpha(c, sa, () => { arrow(c, [900, 488], [740, 488], rgba(PAL.jam, 0.95), 6, {head: 22}); });
  // counters
  const nIn = P.joins.filter(j => j.m <= m).length, nOut = P.leaves.filter(j => j.m <= m).length;
  const ya = 1250;
  withAlpha(c, fadeIn(t, P.tail, 0.3), () => { circle(c, 175, ya + 18, 8, PAL.brakeHot); stage.text(`꼬리로 들어온 차 ${nIn}`, 195, ya + 18, {size: 28, weight: 700, color: PAL.brakeHot}); });
  withAlpha(c, fadeIn(t, P.head, 0.3), () => { circle(c, 575, ya + 18, 8, '#FFFFFF'); stage.text(`머리에서 빠져나간 차 ${nOut}`, 595, ya + 18, {size: 28, weight: 700, color: T.ink}); });
  const da = fadeIn(t, P.w20 + 0.6, 0.4);
  if (da > 0) stage.text(`물결 속도 = (0 − ${fmtInt(Math.round(WAVE_STATES.q1 / 10) * 10)}) ÷ (${Math.round(WAVE_STATES.k2)} − ${Math.round(WAVE_STATES.k1)}) ≈ ${Math.round(WAVE_STATES.w)} km/h`, 540, ya + 66, {size: 26, weight: 700, color: T.muted, align: 'center', alpha: da});
}
// four bottleneck rows: the zone sim's cars drawn along each row's road; window = ring positions 110–200 m
const BN = {x: 140, w: 800, y: j => 335 + j * 196, h: 180, u0: 50, uw: 700, base: 118}, WIN = [110, 200];
const zU = x => (x - WIN[0]) / (WIN[1] - WIN[0]);
function bnPath(id, u) {
  const x = BN.u0 + u * BN.uw;
  if (id === 'sag') return [x, u < 0.42 ? BN.base - 18 + 30 * smooth(u / 0.42) : BN.base + 12 - 64 * smooth((u - 0.42) / 0.58)];
  return [x, BN.base];
}
const bnSlope = (id, u) => { const a = bnPath(id, u - 0.01), b = bnPath(id, u + 0.01); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
function bnRoad(c, T, id, a) {
  const pts = []; for (let u = -0.02; u <= 1.0201; u += 0.02) pts.push(bnPath(id, u));
  const zu0 = zU(ZONE_X[0]), zu1 = zU(ZONE_X[1]);
  if (id === 'drop') { const xa = BN.u0 + zu0 * BN.uw, xb = xa + 0.16 * BN.uw; poly(c, [[BN.u0 - 20, BN.base - 44], [xa, BN.base - 44], [xb, BN.base - 16], [BN.u0 - 20, BN.base - 16]], PAL.asphalt);
    line(c, [[BN.u0 - 20, BN.base - 44], [xa, BN.base - 44], [xb, BN.base - 16]], rgba(PAL.mark, 0.5), 2); line(c, [[BN.u0 - 20, BN.base - 16], [xa, BN.base - 16]], rgba(PAL.mark, 0.4), 2, {dash: [10, 8]}); }
  if (id === 'merge') { const xa = BN.u0 + zu0 * BN.uw, r = [[BN.u0 + 60, BN.base + 54], [xa - 140, BN.base + 44], [xa, BN.base + 18], [xa + 90, BN.base + 12]]; line(c, r, '#2A3A44', 24); line(c, r.map(([x, y]) => [x, y + 12]), rgba(PAL.mark, 0.55), 2); line(c, r.map(([x, y]) => [x, y - 12]), rgba(PAL.mark, 0.35), 2); }
  line(c, pts, PAL.asphalt, 28, {cap: 'butt'}); line(c, pts.map(([x, y]) => [x, y - 14]), rgba(PAL.mark, 0.5), 2); line(c, pts.map(([x, y]) => [x, y + 14]), rgba(PAL.mark, 0.5), 2);
  if (id === 'tunnel') { const x = BN.u0 + zu0 * BN.uw; rect(c, x, BN.base - 40, BN.u0 + BN.uw + 20 - x, 80, 0, rgba('#000000', 0.5));
    c.beginPath(); c.moveTo(x, BN.base + 40); c.lineTo(x, BN.base - 26); c.quadraticCurveTo(x + 2, BN.base - 46, x + 26, BN.base - 46); c.lineTo(BN.u0 + BN.uw + 20, BN.base - 46); c.strokeStyle = rgba('#9AA8AF', 0.9); c.lineWidth = 6; c.stroke(); }
  if (id === 'sag') { const g = bnPath(id, 0.7); line(c, [[g[0] + 30, g[1] - 40], [g[0] + 70, g[1] - 52]], rgba(T.muted, 0.6), 3); }
  const z0 = bnPath(id, zu0), z1 = bnPath(id, zu1);
  withAlpha(c, a, () => { const zz = []; for (let u = zu0; u <= zu1 + 1e-6; u += 0.02) { const q = bnPath(id, u); zz.push([q[0], q[1] + 24]); } line(c, zz, rgba(PAL.warm, 0.95), 5); });
  return [z0, z1];
}
function bottlenecks(stage, t, P) {
  const c = stage.ctx, T = stage.theme, m = P.zoneM(t), za = clamp((m - ZONE_T) / ZONE_RAMP);
  ZONES.forEach((Z, j) => {
    const y0 = BN.y(j), pa = fadeIn(t, P.pan[j], 0.35); if (pa <= 0) return;
    withAlpha(c, pa, () => {
      panel(c, T, BN.x, y0, BN.w, BN.h, 0.88);
      stage.text(Z.n, BN.x + 20, y0 + 30, {role: 'display', size: 30, weight: 700, color: T.ink});
      c.save(); c.translate(BN.x, y0);
      bnRoad(c, T, Z.id, za);
      clipRect(c, 10, 46, BN.w - 20, BN.h - 52, 6, () => {
        for (const k of ringCars(Z.sim, Math.min(m, Z.sim.T - 0.01))) {
          const xm = ((k.x % RING_C) + RING_C) % RING_C; if (xm < WIN[0] - 8 || xm > WIN[1] + 8) continue;
          const u = zU(xm), [x, y] = bnPath(Z.id, u);
          carTop(c, x, y, bnSlope(Z.id, u), CAR_L * BN.uw / 90, CAR_W * BN.uw / 90 * 1.35, carCol(k.i), k.br, {glowK: 1.0});
        }
      });
      c.restore();
      const [zx, zy] = bnPath(Z.id, (zU(ZONE_X[0]) + zU(ZONE_X[1])) / 2);
      if (t > P.slowTag) tag(stage, '속도 ↓', BN.x + zx, y0 + zy + 46, {size: 24, color: PAL.warm, a: fadeIn(t, P.slowTag, 0.3), plateA: 0.85});
      const st = P.zoneStop[j]; if (st != null && t > st - 0.6) { const [qx, qy] = bnPath(Z.id, 0.22); tag(stage, '정체 시작', BN.x + qx, y0 + qy + 46, {size: 26, color: PAL.brakeHot, a: fadeIn(t, st - 0.6, 0.3), plateA: 0.85}); }
    });
  });
  // shared readout: incoming flow vs what the slow stretch can pass (relative, from the model; no numbers)
  const ra = fadeIn(t, P.pan[3] + 0.3, 0.4);
  if (ra > 0) withAlpha(c, ra, () => {
    const y = 1150, w = 560, x0 = 340, cap = lerp(1, ZONE_CAP_REL, za), flowRel = ZONE_IN_REL;
    stage.text('들어오는 차', x0 - 20, y, {size: 26, weight: 700, color: T.ink, align: 'right'});
    rect(c, x0, y - 15, w, 30, 6, rgba(T.deep, 0.8), rgba(T.border, 1), 1.2); rect(c, x0, y - 15, w * flowRel, 30, 6, PAL.cool);
    stage.text('보낼 수 있는 차', x0 - 20, y + 50, {size: 26, weight: 700, color: T.ink, align: 'right'});
    rect(c, x0, y + 35, w, 30, 6, rgba(T.deep, 0.8), rgba(T.border, 1), 1.2); rect(c, x0, y + 35, w * cap, 30, 6, cap < flowRel - 0.01 ? PAL.brakeHot : PAL.good);
    stage.text('(이 구간)', x0 - 20, y + 82, {size: 24, weight: 500, color: T.muted, align: 'right'});
    if (t > P.limit) tag(stage, '한계를 넘음 → 정체', x0 + w * cap + 6, y + 100, {size: 28, color: PAL.brakeHot, a: fadeIn(t, P.limit, 0.35), role: 'display', plateA: 0.85, align: 'right'});
  });
}
// relative inflow and capacity of the slow stretch (model M, φ = mean of the four panels)
const capOf = phi => { let best = 0; for (let s = MP.s0; s < 30; s += 0.05) best = Math.max(best, phi * Vopt(s) / (s + CAR_L)); return best; };
export const ZONE_IN_REL = (Vopt(RING_C / 20 - CAR_L) / (RING_C / 20)) / capOf(1);
export const ZONE_CAP_REL = capOf(ZONES.reduce((s, z) => s + z.phi, 0) / ZONES.length) / capOf(1);

// ------------------------------------------------------------------ av (s16–s17): one controlled car in the jammed ring
const RV2 = {cx: 540, cy: 640, R: 360, k: 0.58, rw: 50};
const avState = (P, t) => { const M = P.avM(t); return M < T_SW ? {S: RING, m: M, on: false} : {S: RING_AV, m: M - T_SW, on: true}; };
function avScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), st = avState(P, t), rate = P.avM.rate(t);
  withAlpha(c, sf, () => {
    tag(stage, '실험 재현 · 모형', 540, 352, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.avCard, 0.4)});
    const blue = fadeIn(t, P.auto, 0.4), hiA = fadeIn(t, P.oneCar, 0.3), trk = fadeIn(t, P.beforeTrace[0], 0.4);
    const cars = ringCars(st.S, Math.min(st.m, st.S.T - 0.01)), cl = mainCluster(st.S, Math.min(st.m, st.S.T - 0.01));
    ringDraw(stage, RV2, cars, {scale: 1.2, streak: rate > 6 ? rate / 30 : 0, color: i => (i === AV.i ? mix(carCol(i), PAL.av, blue) : carCol(i)),
      hi: i => (i === AV.i && hiA > 0 ? rgba(blue > 0.5 ? PAL.av : '#FFFFFF', hiA) : i === TRACK_CAR && trk > 0 ? rgba('#FFFFFF', 0.7 * trk) : null),
      under: jamBand(RV2, cl, 0.8)});
    stage.text('차 22대 (모형)', 540, 616, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.n20, 0.35)});
    if (blue > 0) stage.text('자율주행 1대', 540, 666, {role: 'display', size: 32, weight: 700, color: PAL.av, align: 'center', alpha: blue});
    // the AV keeps its gap: bracket to the car ahead
    const ga = fadeIn(t, P.avOn, 0.35);
    if (ga > 0 && st.on) withAlpha(c, ga, () => {
      const xa = cars[AV.i].x, xb = cars[(AV.i + 1) % RING_N].x - CAR_L; const pts = []; for (let k = 0; k <= 16; k++) pts.push(ringPt(RV2, lerp(xa + CAR_L / 2, xb, k / 16), -RV2.rw / 2 - 16));
      line(c, pts, PAL.av, 4); const pm = pts[8]; tag(stage, '간격 유지', pm[0], pm[1] - 34, {size: 24, color: PAL.av, plateA: 0.8});
    });
    // speed of one human car: before (record) and after (live)
    const G = (y, lab, col, a) => ({x0: 200, x1: 900, y0: y + 100, y1: y + 10, lab, col, a});
    const G1 = G(905, '자율주행 전', PAL.brakeHot, trk), G2 = G(1060, '자율주행 후', PAL.av, fadeIn(t, P.avOn, 0.4));
    for (const g of [G1, G2]) withAlpha(c, g.a, () => {
      stage.text(g.lab, 200, g.y1 - 22, {size: 26, weight: 700, color: g.col});
      stage.text('흰 테 차의 속도 (0~40 km/h)', 900, g.y1 - 22, {size: 24, weight: 500, color: T.muted, align: 'right'});
      line(c, [[g.x0, g.y1 + 8], [g.x0, g.y0], [g.x1, g.y0]], rgba(T.muted, 0.6), 2);

    });
    const sp = (S, mm) => sample(S, 'V', TRACK_CAR, mm) * KMH, gx = (g, f) => lerp(g.x0, g.x1, f), gy = (g, v) => lerp(g.y0, g.y1 + 10, clamp(v / 40));
    if (trk > 0) { const q = clamp((t - P.beforeTrace[0]) / (P.beforeTrace[1] - P.beforeTrace[0])), pts = []; for (let f = 0; f <= q; f += 0.004) pts.push([gx(G1, f), gy(G1, sp(RING, T_SW - 110 + 110 * f))]); if (pts.length > 1) withAlpha(c, trk, () => line(c, pts, PAL.brakeHot, 3)); }
    if (st.on) { const pts = []; for (let mm = 0; mm <= Math.min(st.m, 110); mm += 0.4) pts.push([gx(G2, mm / 110), gy(G2, sp(RING_AV, mm))]); if (pts.length > 1) line(c, pts, PAL.av, 3); }
    // fuel (relative bars, no numbers)
    const fa = fadeIn(t, P.fuel, 0.4);
    if (fa > 0) withAlpha(c, fa, () => {
      const y = 1222, w = 500, x0 = 380, q = easeInOut((t - P.fuelLess) / 0.8), rel = FUEL.after / FUEL.before;
      stage.text('전체 연료 소비 (모형)', 200, y - 8, {size: 26, weight: 700, color: T.ink});
      stage.text('전', x0 - 16, y + 36, {size: 26, weight: 700, color: PAL.brakeHot, align: 'right'}); rect(c, x0, y + 22, w, 26, 6, rgba(PAL.brakeHot, 0.85));
      stage.text('후', x0 - 16, y + 76, {size: 26, weight: 700, color: PAL.av, align: 'right'}); rect(c, x0, y + 62, w * lerp(1, rel, q), 26, 6, PAL.av);
      if (q > 0.5) stage.text('연료 소비 ↓', x0 + w * rel + 20, y + 76, {size: 26, weight: 700, color: PAL.av, alpha: smooth((q - 0.5) / 0.3)});
    });
    if (rate > 6) tag(stage, '▶▶ 시간 압축 · 모형', 810, 352, {size: 24, color: PAL.warm, plate: false});
  });
}

// ------------------------------------------------------------------ myth (s18): a slower car cuts in → the cars behind brake harder and harder
const MY = {road: 280, top: 470, bot: 1300, y0: 540, px: 9.5, rowY: k => 520 + k * 128};
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), m = P.mythM(t);
  const shown = 6, lag = (() => { const s = chainCar(MYTH, 4, m); return Math.max(0, V30 * Math.max(0, m) - (s.x - MYTH.X[4]) - 4); })();
  const camX = V30 * m - lag * 0.8, ys = x => MY.y0 - (x - camX) * MY.px;
  withAlpha(c, sf, () => {
    // the question, struck out on "오히려"
    const qa = fadeIn(t, P.mythQ, 0.35), sq = clamp((t - P.rather) / 0.4);
    if (qa > 0) withAlpha(c, qa, () => {
      const s = '자주 바꾸면 빨리?', w = stage.measure(s, {role: 'display', size: 44, weight: 700});
      stage.text(s, 540, 380, {role: 'display', size: 44, weight: 700, color: T.ink, align: 'center'});
      strike(c, 540 - w / 2, 540 + w / 2, 382, sq, PAL.bad, 6);
    });
    clipRect(c, 150, MY.top, 260, MY.bot - MY.top, 10, () => {
      rect(c, MY.road - 50, MY.top, 100, MY.bot - MY.top, 0, PAL.asphalt);
      line(c, [[MY.road - 50, MY.top], [MY.road - 50, MY.bot]], rgba(PAL.mark, 0.55), 2.5); line(c, [[MY.road + 50, MY.top], [MY.road + 50, MY.bot]], rgba(PAL.mark, 0.55), 2.5);
      const off = ((camX * MY.px) % 96 + 96) % 96; for (let yy = MY.top - 96 + off; yy < MY.bot; yy += 96) line(c, [[MY.road, yy], [MY.road, yy + 36]], rgba(PAL.mark, 0.45), 3, {cap: 'butt'});
      // the left (slower) lane: a few cars at 6 m/s, one of them changes lanes
      for (const dx of [-38, 26, 60]) { const x = cutX(m) + dx + (V30 - CUT.v0) * 0; const y = ys(x) + CAR_L * MY.px / 2; carTop(c, MY.road - 25, y, -Math.PI / 2, CAR_L * MY.px, CAR_W * MY.px * 1.4, '#6D7B84', 0); }
      const lc = clamp((m - (CUT.t - CUT.dur)) / CUT.dur), lx = lerp(MY.road - 25, MY.road + 25, smooth(lc)), cy = ys(cutX(m)) + CAR_L * MY.px / 2;
      carTop(c, lx, cy, -Math.PI / 2 + 0.35 * Math.sin(Math.PI * lc) * (lc > 0 && lc < 1 ? 1 : 0), CAR_L * MY.px, CAR_W * MY.px * 1.4, PAL.warm, 0, {hi: lc > 0 && lc < 1.0 ? rgba(PAL.warm, 0.8) : null});
      for (let k = MYTH_N - 1; k >= 0; k--) { const s = chainCar(MYTH, k, m), y = ys(s.x) + CAR_L * MY.px / 2; if (y < MY.top - 40 || y > MY.bot + 40) continue; carTop(c, MY.road + 25, y, -Math.PI / 2, CAR_L * MY.px, CAR_W * MY.px * 1.4, carCol(k + 2), s.br, {glowK: 1.4}); }
    });
    if (t > P.cutEnd - 1.0) tag(stage, '끼어들기', 280, MY.top - 26, {size: 26, color: PAL.warm, a: fadeIn(t, P.cutEnd - 1.0, 0.3), plateA: 0.8});
    // rows: braking of the cars behind the cut-in
    stage.text('뒤차들의 브레이크', 920, MY.top - 26, {size: 26, weight: 700, color: T.muted, align: 'right'});
    for (let k = 1; k <= shown; k++) {
      const y = MY.rowY(k - 1) + 20, cur = Math.max(0, -chainCar(MYTH, k, m).a), pk = m > 0 ? peakDecelR(MYTH, k, m) : 0, x0 = 540, bw = 380, f = v => clamp(v / 8) * bw;
      stage.text(`${k}번째 뒤차`, 520, y, {size: 26, weight: 700, color: T.muted, align: 'right'});
      rect(c, x0, y - 14, bw, 28, 6, rgba(T.deep, 0.8), rgba(T.border, 1), 1.2);
      if (pk > 0.05) rect(c, x0, y - 14, f(pk), 28, 6, rgba(PAL.brake, 0.35)); if (cur > 0.05) rect(c, x0, y - 14, f(cur), 28, 6, PAL.brake);
    }
    const na = fadeIn(t, P.newWave, 0.35);
    if (na > 0) tag(stage, '새 물결 · 뒤로 갈수록 세게', 920, MY.rowY(shown - 1) + 80, {size: 32, color: PAL.brakeHot, role: 'display', plateA: 0.85, align: 'right', a: na});
    tag(stage, '설명 모형 · 화면 속도 1.6배', 540, 434, {size: 24, color: T.muted, plate: false, a: fadeIn(t, P.cutEnd - 1.2, 0.4)});
  });
}

// ------------------------------------------------------------------ close: s19 the same slow-down with and without "나" → s20 the poster again
const CL = [{x: 300, S: CLOSE_A, name: '모두 바짝 붙어서'}, {x: 760, S: CLOSE_B, name: '나 한 대가 넉넉하게'}], CPX = 5.9, CTOP = 430, CBOT = 1240;
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = fadeIn(t, ctx.scene.start, 0.25), fin = fadeIn(t, P.reason - 0.2, 0.6), out = 1 - fadeIn(t, P.reason - 0.3, 0.4);
  const m = P.closeM(t);
  if (out > 0) withAlpha(c, sf * out, () => {
    CL.forEach((C, j) => {
      const S = C.S, last = CLOSE_N - 1, lagOf = k => V30 * Math.max(0, m) - (chainCar(S, k, m).x - S.X[k]);
      const camX = V30 * m - Math.max(0, lagOf(last) - 4) * 0.95, ys = x => 455 - (x - camX) * CPX;
      stage.text(C.name, C.x, 392, {role: 'display', size: 32, weight: 700, color: j ? PAL.me : T.ink, align: 'center'});
      clipRect(c, C.x - 110, CTOP, 220, CBOT - CTOP, 10, () => {
        rect(c, C.x - 36, CTOP, 72, CBOT - CTOP, 0, PAL.asphalt);
        line(c, [[C.x - 36, CTOP], [C.x - 36, CBOT]], rgba(PAL.mark, 0.55), 2.5); line(c, [[C.x + 36, CTOP], [C.x + 36, CBOT]], rgba(PAL.mark, 0.55), 2.5);
        for (let k = CLOSE_N - 1; k >= 0; k--) {
          const s = chainCar(S, k, m), y = ys(s.x) + CAR_L * CPX / 2, me = j === 1 && k === ME;
          carTop(c, C.x, y, -Math.PI / 2, CAR_L * CPX, CAR_W * CPX * 1.5, me ? PAL.me : carCol(k + 4), s.br, {hi: me ? rgba(PAL.me, 0.9) : null, glowK: 1.4});
          if (me) { stage.text('나', C.x + 64, y, {role: 'display', size: 30, weight: 700, color: PAL.me, align: 'center'}); }
        }
        if (j === 1) { const ga = fadeIn(t, P.roomy, 0.35); if (ga > 0) { const s0 = chainCar(S, 0, m), s1 = chainCar(S, ME, m), ya = ys(s0.x - CAR_L) + CAR_L * CPX, yb = ys(s1.x); withAlpha(c, ga, () => { line(c, [[C.x - 46, ya], [C.x - 56, ya], [C.x - 56, yb], [C.x - 46, yb]], PAL.me, 3); }); } }
      });
      if (j === 1) tag(stage, '넉넉한 간격', C.x - 150, 560, {size: 26, color: PAL.me, a: fadeIn(t, P.roomy, 0.35), plateA: 0.8});
      // the last car's lowest speed so far
      let mn = 1e9; for (let mm = 0; mm <= Math.max(0, m); mm += 0.1) mn = Math.min(mn, sample(S, 'V', last, mm)); if (m <= 0) mn = V30;
      const kmh = Math.round(mn * KMH), ra = fadeIn(t, P.meTag, 0.4);
      if (ra > 0) withAlpha(c, ra, () => {
        stage.text('맨 뒤 차의 가장 낮은 속도', C.x, 1282, {size: 24, weight: 700, color: T.muted, align: 'center'});
        stage.text(kmh <= 0 ? '0 km/h · 멈춤' : `${kmh} km/h`, C.x, 1318, {role: 'display', size: 32, weight: 700, color: kmh <= 0 ? PAL.bad : PAL.me, align: 'center'});
      });
    });
    tag(stage, '설명 모형 · 같은 앞차의 감속', 540, 330, {size: 24, color: T.muted, plate: false});
  });
  if (fin > 0) {
    highway(stage, P.posterM(t), {a: fin});
    captionShade(c, fin);
    posterTitle(stage, t, 0, fin);
  }
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Brake light switching on (model): a very low, short tick (92–110 Hz), thinned to ≥ 0.15 s apart, so the backward
//    rhythm of the cascade is heard. In the chain scenes the tick is a little louder for a harder brake.
//  - Ring mean speed → pitch of a low hum 50 + 2.6·v̄ Hz (30 km/h → 128 Hz, jammed ≈ 92 Hz). AV scene: the tracked car's
//    speed → the same kind of hum (wobbles before, steadies after).
//  - Greenshields flow q → pitch 80·2^(q/q_max) Hz; a low chord where the point passes / reaches the peak. Gate passes → tick.
//  - Joining the jam (tail) → low tick 82 Hz; leaving it (head) → 123 Hz tick.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export const humHz = kmh => 50 + 2.6 * kmh;
export const flowHz = q => 80 * 2 ** (q / Q_MAX);
const thin = (times, gap = 0.15) => { const o = []; for (const x of times.slice().sort((a, b) => a - b)) if (!o.length || x - o.at(-1) >= gap) o.push(x); return o; };
/** brake onsets of the visible highway cars (screen times) between screen t0 and t1; m(t) = mOf(t) linear with slope 1 */
function highwayOnsets(t0, t1, mOf) {
  const out = [];
  HOOK.forEach((L, l) => { for (let i = 0; i < HOOK_N; i++) for (const m of brakeOnsets(L.S, i, mOf(t0), mOf(t1))) { const Z = hookZ(l, i, m); if (Z > HW.zNear && Z < 220) out.push(t0 + (m - mOf(t0))); } });
  return out;
}
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -33) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur: 0.6, harmonics: [1, 0.35], attack: 0.006, decay: 0.2, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.3, low: 40, high: 220, release: 0.22, gain_db: -9}}]}, means});
  const tapL = off => [{kind: 'tone', offset: r(off, 4), params: {freq: 70, dur: 0.2, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}, {kind: 'noise', offset: r(off, 4), params: {dur: 0.09, low: 40, high: 200, attack: 0.002, release: 0.07, gain_db: -8}}];
  const misfit = (id, times, means, gain = -28) => { const T0 = [].concat(times); ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => tapL(tt - T0[0]))}, means}); };
  const brakeGain = pk => clamp(20 * Math.log10(Math.max(pk, 0.3) / 8), -14, 0);

  // hook
  swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 밤 고속도로의 브레이크 등 물결과 제목', {dur: 1.8, gain: -34});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  const hb = thin(highwayOnsets(MORPH[1], tl.scene('hook').end - 0.3, P.hookM), 0.18);
  ticks('hook_brakes', hb, 98, -37, `화면 속 차들의 브레이크 등이 켜질 때마다 아주 낮은 틱 (${hb.length}번, 0.18초 넘게 떨어진 것만): 앞에서 뒤로 번지는 박자 (모형)`, {decay: 0.06});
  misfit('no_accident', P.noAcc + 0.2, '"사고 없음" ✕', -30); misfit('no_works', P.noWork + 0.2, '"공사 없음" ✕', -30);
  tick('ahead_box', P.ahead, 131, -33, '"앞: 아무 일도 없음" 점선 상자', {decay: 0.12});
  tick('stopgo_tiles', P.stopgo, 110, -33, '"멈춘 차 · 브레이크 등" 계기', {decay: 0.12});
  swell('ghost_name', P.ghost, [98, 147, 196], '"유령 체증 · phantom traffic jam"', {dur: 1.6, gain: -32});
  // origin
  tick('hanja', P.hanja + 0.1, 147, -32, '"滯症" 글자', {decay: 0.14});
  ticks('food_stops', [...Array(FOOD_N)].map((_, k) => foodStopT(P, k)), 82, -33, `먹은 음식 ${FOOD_N}조각이 차례로 멈춰 쌓임 (앞 조각이 막히면 뒤 조각이 그 뒤에 섬)`, {decay: 0.08});
  tick('hanja_eq', P.hanjaEq, 131, -33, '"滯 막힐 체 + 症 증세 증"', {decay: 0.12});
  tick('symptom', P.symptom, 165, -33, '"= 증세 (症)"', {decay: 0.12});
  ticks('road_queue', [0, 3, 6].map(k => P.road3 + 0.08 * k + 0.35), 98, -34, '막힌 길: 차들이 줄지어 멈춤 (세 대마다)', {decay: 0.06});
  swell('liken', P.liken, [110, 165], '"교통 체증 ← 막힌 길에 빗댐"', {dur: 1.4, gain: -33});
  tick('jam_en', P.jamEn, 147, -34, '"traffic jam · jam = 꽉 끼다"', {decay: 0.1});
  // ring
  whoosh('track', P.ringDraw[0], P.ringDraw[1] - P.ringDraw[0], 90, 170, '둘레 230 m 원형 도로가 그려짐', -35);
  tick('c230', P.c230, 147, -33, '"둘레 230 m"', {decay: 0.12});
  ticks('cars_in', [...Array(11)].map((_, k) => P.carsIn[0] + (2 * k + 1.5) / RING_N * (P.carsIn[1] - P.carsIn[0])), 131, -35, '차 22대가 차례로 놓임 (두 대마다 작은 틱)', {decay: 0.04});
  tick('spacing', P.spacing, 165, -33, '"앞차까지 10.5 m" 같은 간격', {decay: 0.12});
  tick('speed_tile', P.speedTile, 131, -33, '"평균 속도 30 km/h" 계기', {decay: 0.12});
  chirp('ring_hum', P.carsIn[0], tl.scene('ring').end - 0.15, tt => humHz(P.ringM(tt) < 0 ? 30 : meanV(RING, P.ringM(tt)) * KMH), () => 0.3, -36,
    `원형 도로의 평균 속도 v̄ → 낮은 웅웅의 음높이 50 + 2.6·v̄ Hz: 30 km/h ${humHz(30).toFixed(0)} Hz → 정체가 생긴 뒤 약 ${Math.round(meanV(RING, P.ringM(tl.scene('ring').end - 0.2)) * KMH)} km/h ${humHz(meanV(RING, P.ringM(tl.scene('ring').end - 0.2)) * KMH).toFixed(0)} Hz (화면의 "평균 속도"와 같은 값)`, {h: [1, 0.5, 0.25], fi: 0.4, fo: 0.3});
  whoosh('ff', P.ff0, 0.9, 110, 170, '"▶▶ 시간 압축" 시작', -36);
  const rb = []; for (let i = 0; i < RING_N; i++) for (const m of brakeOnsets(RING, i, Math.max(0.01, P.ringM(P.ff0)), P.ringM(tl.scene('ring').end - 0.3))) rb.push(P.ringM.inv(m));
  const rbt = thin(rb, 0.15);
  ticks('ring_brakes', rbt, 92, -37, `원형 도로에서 브레이크 등이 켜질 때마다 아주 낮은 틱 (${rbt.length}번, 0.15초 간격으로 솎음): 정체가 생기며 박자가 촘촘해짐`, {decay: 0.05});
  thump('first_stop', P.firstStop, `처음으로 한 대가 멈춤 (모형 시간 ${FIRST_STOP.toFixed(1)}초)`, -30, 55);
  whoosh('jam_back', P.back6, 1.0, 150, 80, `정체가 차의 반대쪽(뒤)으로 흐름 (모형에서 뒤로 시속 ${(-W_KMH).toFixed(1)} km)`, -34);
  // react
  const rOn = P.reactOn.filter(x => x != null && x < tl.scene('react').end - 0.1);
  ticks('react_brakes', rOn, 110, -31, `반응 사슬: ${rOn.length}대의 브레이크 등이 1초 남짓씩 늦게 차례로 켜짐 (뒤로 갈수록 세게 밟아 조금씩 커짐: 최대 감속 ${REACT_PEAK.slice(0, rOn.length).map(x => x.toFixed(1)).join(' · ')} m/s²)`, {decay: 0.12, gains: REACT_PEAK.slice(0, rOn.length).map(brakeGain)});
  tick('sec1', P.sec1, 165, -34, '"1초 남짓" 표시', {decay: 0.1});
  thump('react_stop', P.reactStop, '6번째 차가 완전히 멈춤', -29, 55);
  swell('seed', P.seed, [98, 147], '"정체의 씨앗"', {dur: 1.4, gain: -33});
  // flow s10
  misfit('kick16', P.s10L + 0.25, '왼쪽(넉넉한 간격) 원형 도로: 한 차가 살짝 늦춤', -31);
  misfit('kick22', P.s10R + 0.5 / 3, '오른쪽(촘촘한 간격) 원형 도로: 같은 만큼 살짝 늦춤', -31);
  const r22 = []; for (let i = 0; i < RING_N; i++) for (const m of brakeOnsets(RING22, i, 1.6, Math.min(RING22.T, P.mR(P.fd0 - 0.2)))) r22.push(P.s10R + m / 3);
  const r22t = thin(r22, 0.15);
  ticks('r22_brakes', r22t, 92, -37, `촘촘한 원형 도로에서만 브레이크 등이 퍼짐 (${r22t.length}번): 넉넉한 쪽은 조용함 = 흔들림이 잦아듦`, {decay: 0.05});
  // flow s11–s13
  ticks('gate', P.passT, 196, -35, `"한 지점"을 차가 지날 때마다 작은 틱 (${P.passT.length}대): 지나가는 차의 수 = 밀도 × 속도`, {decay: 0.05});
  chirp('flow_pitch', P.fd0 + 0.3, tl.scene('flow').end - 0.25, tt => flowHz(gsQ(P.kAt(tt))), () => 0.28, -36, `흐름 q = k·v → 음높이 80·2^(q/${Q_MAX}) Hz: 밀도를 올리면 꼭대기(${flowHz(Q_MAX).toFixed(0)} Hz)까지 오르고, 넘으면 다시 내려감`, {h: [1, 0.4], fi: 0.4, fo: 0.35});
  swell('peak_pass', P.peak1, [110, 165, 220], '점이 포물선 꼭대기(용량)를 지남: 낮은 화음', {dur: 1.0, gain: -34});
  swell('peak_mark', P.peak2, [110, 165, 220], '점이 꼭대기에 멈춤 "가장 많이 흐르는 점"', {dur: 1.8, gain: -32});
  tick('cap', P.cap, 131, -33, '"약 2천 대 안팎 / 시간 · 한 차로"', {decay: 0.14});
  // wave
  const jT = thin(P.joinT, 0.12), lT = thin(P.leaveT, 0.12);
  ticks('wave_in', jT, 82, -37, `시공간 그림: 차가 정체의 꼬리로 들어갈 때마다 낮은 틱 (${jT.length}번)`, {decay: 0.05});
  ticks('wave_out', lT, 123, -38, `차가 정체의 머리에서 빠져나갈 때마다 조금 높은 틱 (${lT.length}번)`, {decay: 0.04});
  swell('w20', P.w20, [98, 147], `"뒤로 약 시속 20 km" (모형 ${(-W_KMH).toFixed(1)} km/h)`, {dur: 1.5, gain: -33});
  whoosh('spread', P.spread, 0.9, 150, 70, '정체가 뒤쪽으로 번짐 (화살표)', -34);
  ticks('panels', P.pan, [110, 123, 131, 147], -33, '병목 네 칸: 차로 감소 · 합류 · 오르막 · 터널 입구', {decay: 0.12});
  whoosh('slow', P.slowTag, 1.0, 170, 90, '"속도 ↓": 그 구간에서 모르는 사이 속도가 조금 줄어듦', -34);
  ticks('zone_stops', P.zoneStop.filter(x => x != null).sort((a, b) => a - b), 70, -33, '네 칸에서 차례로 첫 차가 멈춤: 정체가 병목 바로 앞에서 시작 (모형)', {decay: 0.18});
  misfit('limit', P.limit + 0.15, '"한계를 넘음 → 정체"', -30);
  // av
  tick('av_card', P.avCard, 147, -33, '"2017년 미국 연구진" 실험 재현', {decay: 0.12});
  chirp('av_hum', tl.scene('av').start + 0.25, tl.scene('av').end - 0.2, tt => { const s = avState(P, tt); return humHz(sample(s.S, 'V', TRACK_CAR, Math.min(s.m, s.S.T - 0.01)) * KMH); }, () => 0.3, -36,
    '그래프로 그리는 사람 차 한 대의 속도 → 같은 웅웅 음높이 50 + 2.6·v Hz: 자율주행 전에는 오르내리고(멈췄다 가기), 후에는 고르게 가라앉음', {h: [1, 0.5, 0.25], fi: 0.3, fo: 0.3, dt: 0.02});
  const ab = []; for (let i = 0; i < RING_N; i++) { const m0 = P.avM(tl.scene('av').start + 0.3), m1 = P.avM(tl.scene('av').end - 0.3);
    for (const m of brakeOnsets(RING, i, m0, Math.min(T_SW, m1))) ab.push(P.avM.inv(m));
    for (const m of brakeOnsets(RING_AV, i, 0.05, m1 - T_SW)) ab.push(P.avM.inv(m + T_SW)); }
  const abt = thin(ab, 0.15);
  ticks('av_brakes', abt, 92, -37, `자율주행 장면의 브레이크 등 (${abt.length}번): 물결이 잦아들며 틱이 드물어짐`, {decay: 0.05});
  tick('one_car', P.oneCar, 131, -33, '22대 가운데 한 대 표시', {decay: 0.12});
  swell('auto', P.auto, [147, 220], '그 차가 자율주행(파란색)으로 바뀜', {dur: 1.3, gain: -33});
  tick('av_on', P.avOn, 165, -33, '"간격 유지" 시작', {decay: 0.12});
  whoosh('ff_av', P.calm0, 1.0, 110, 170, '"▶▶ 시간 압축": 물결이 잦아드는 과정', -36);
  chirp('fuel', P.fuelLess, P.fuelLess + 0.9, tt => 140 - 40 * smooth((tt - P.fuelLess) / 0.8), () => 0.35, -34, `연료 소비 막대가 줄어듦 (모형 비 ${(FUEL.after / FUEL.before).toFixed(2)}, 화면엔 숫자 없음)`, {fi: 0.1, fo: 0.3});
  // myth
  tick('myth_q', P.mythQ, 131, -33, '"자주 바꾸면 빨리?"', {decay: 0.12});
  whoosh('cutin', P.cutEnd - 1.0, 1.0, 100, 170, '옆 차로의 느린 차가 끼어듦', -33);
  const mOn = P.mythOn.slice(1, 7).filter(x => x != null && x < tl.scene('myth').end - 0.1);
  ticks('myth_brakes', mOn, 110, -31, `끼어든 차 뒤로 브레이크 등이 차례로 켜짐 (${mOn.length}대, 뒤로 갈수록 세게)`, {decay: 0.12, gains: MYTH_PEAK.slice(1, 1 + mOn.length).map(brakeGain)});
  misfit('strike', P.rather + 0.25, '"자주 바꾸면 빨리?"에 줄', -30);
  swell('new_wave', P.newWave, [98, 147], '"새 물결"', {dur: 1.4, gain: -33});
  // close
  const ca = P.closeOnA.slice(1).filter(x => x != null && x < P.reason - 0.3), cb = P.closeOnB.slice(1).filter(x => x != null && x < P.reason - 0.3);
  const pa = [...Array(CLOSE_N)].map((_, k) => peakDecelR(CLOSE_A, k)), pb = [...Array(CLOSE_N)].map((_, k) => peakDecelR(CLOSE_B, k));
  ticks('close_a', ca, 110, -31, `왼쪽(모두 바짝): 브레이크 등이 차례로, 뒤로 갈수록 세게 (최대 감속 ${pa.slice(1, 1 + ca.length).map(x => x.toFixed(1)).join(' · ')} m/s²)`, {decay: 0.12, gains: pa.slice(1, 1 + ca.length).map(brakeGain)});
  ticks('close_b', cb, 110, -31, `오른쪽("나"가 넉넉한 간격): 같은 앞차 감속인데 브레이크가 부드러움 (최대 감속 ${pb.slice(1, 1 + cb.length).map(x => x.toFixed(1)).join(' · ')} m/s²) → 틱이 작음`, {decay: 0.12, gains: pb.slice(1, 1 + cb.length).map(brakeGain)});
  tick('roomy', P.roomy, 165, -33, '"넉넉한 간격" 표시', {decay: 0.12});
  tick('me_tag', P.meTag, 131, -34, '맨 뒤 차의 가장 낮은 속도 비교', {decay: 0.12});
  swell('poster_back', P.reason, [110, 165, 220], '"교통체증은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.8, gain: -32});
  const pbk = thin(highwayOnsets(P.reason + 0.4, tl.duration - 0.2, P.posterM), 0.18);
  ticks('poster_brakes', pbk, 98, -38, `포스터의 브레이크 등이 앞에서 뒤로 켜짐 (${pbk.length}번): "뒤로 번지는 물결"`, {decay: 0.06});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz, because the band-pass skirts fall only 12 dB/octave); swell overtones (2f)
 * are kept below it by construction (frequencies < HIGH_CUT/2). Events that would break this throw.
 */
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') {
      const f = Math.max(...p.points.map(q => q[1])); if (f >= HIGH_CUT) throw new Error(`${e.id}: chirp ${f} Hz`);
      p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT);
    } else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/traffic-jam/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(반응 지연이 있는 차 따라가기 모형의 원형 도로·병목·고속도로 표, 반응 사슬 설명 모형, Greenshields 기본도, 시간 지도)에서 써 넣습니다. 대응: 브레이크 등이 켜짐 → 아주 낮은 틱(92~110 Hz, 0.15초 넘게 떨어진 것만), 원형 도로 평균 속도 → 웅웅 음높이 50 + 2.6·v̄ Hz, 자율주행 장면은 그래프의 한 차 속도 → 같은 웅웅, 흐름 q → 음높이 80·2^(q/2000) Hz와 꼭대기의 낮은 화음, 한 지점을 지나는 차 → 작은 틱, 정체 꼬리로 들어옴 82 Hz · 머리에서 빠져나감 123 Hz 틱. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; first stop ${FIRST_STOP} s (screen ${P.firstStop.toFixed(2)}), W ${W_KMH.toFixed(1)} km/h, jam mean ${JAM_MEAN_KMH.toFixed(1)} km/h, stopped ${JAM_STOPPED.toFixed(1)}`);
  console.log(`react onsets ${P.reactOn.map(x => x?.toFixed(2)).join(' ')}; stop ${P.reactStop.toFixed(2)}; peak ${P.peak1.toFixed(2)}/${P.peak2.toFixed(2)}; fuel ${(FUEL.after / FUEL.before).toFixed(3)}`);
}
