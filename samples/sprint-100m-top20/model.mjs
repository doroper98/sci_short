// Pace model, video clock and camera. Everything on screen (positions, clock, tags, results, sound events) comes from here.
//
// Pace: Bolt's Berlin 2009 profile (reaction 0.146 s, cumulative times every 10 m) interpolated with a monotone cubic
// (Fritsch-Carlson PCHIP, zero slope at the reaction point). Athlete i is at S(tau * 9.58 / T_i), so he covers 100 m
// in exactly T_i. After the line every runner keeps his final speed and slows gently (constant deceleration DECEL).
import fs from 'node:fs';

export const DATA = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
export const TL = JSON.parse(fs.readFileSync(new URL('./timeline.json', import.meta.url), 'utf8'));
export const ATH = DATA.athletes;
export const N = ATH.length;
const PP = DATA.pace_profile;
export const T_REF = PP.cumulative_s_at_10m_steps.at(-1);          // 9.58
export const DECEL = 1.4;                                            // m/s^2 after the line (gentle run-out)

// ---------- monotone cubic through the split points ----------
const XS = [PP.reaction_s, ...PP.cumulative_s_at_10m_steps];
const YS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const DS = (() => {
  const n = XS.length, h = [], del = [], d = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) { h[k] = XS[k + 1] - XS[k]; del[k] = (YS[k + 1] - YS[k]) / h[k]; }
  d[0] = 0;                                                          // standing still at the reaction point
  for (let k = 1; k < n - 1; k++) {
    if (del[k - 1] * del[k] <= 0) d[k] = 0;
    else { const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]; d[k] = (w1 + w2) / (w1 / del[k - 1] + w2 / del[k]); }
  }
  const m = n - 1;                                                   // three-point end slope, limited (Fritsch-Carlson)
  let e = ((2 * h[m - 1] + h[m - 2]) * del[m - 1] - h[m - 1] * del[m - 2]) / (h[m - 1] + h[m - 2]);
  if (Math.sign(e) !== Math.sign(del[m - 1])) e = 0; else if (Math.sign(del[m - 1]) !== Math.sign(del[m - 2]) && Math.abs(e) > 3 * Math.abs(del[m - 1])) e = 3 * del[m - 1];
  d[m] = e;
  return d;
})();
export const V_END = DS.at(-1);                                      // Bolt's speed at the line, m/s

/** Bolt's distance (m) at race time t (s from the gun); continues past 100 m with gentle deceleration. */
export function S(t) {
  if (t <= XS[0]) return 0;
  if (t >= T_REF) { const u = Math.min(t - T_REF, V_END / DECEL); return 100 + V_END * u - 0.5 * DECEL * u * u; }
  let k = 0; while (t > XS[k + 1]) k++;
  const h = XS[k + 1] - XS[k], s = (t - XS[k]) / h, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * YS[k] + (s3 - 2 * s2 + s) * h * DS[k] + (-2 * s3 + 3 * s2) * YS[k + 1] + (s3 - s2) * h * DS[k + 1];
}
/** dS/dt */
export function Sp(t) {
  if (t <= XS[0]) return 0;
  if (t >= T_REF) return Math.max(0, V_END - DECEL * (t - T_REF));
  let k = 0; while (t > XS[k + 1]) k++;
  const h = XS[k + 1] - XS[k], s = (t - XS[k]) / h, s2 = s * s;
  return ((6 * s2 - 6 * s) * YS[k] + (3 * s2 - 4 * s + 1) * h * DS[k] + (-6 * s2 + 6 * s) * YS[k + 1] + (3 * s2 - 2 * s) * h * DS[k + 1]) / h;
}
export const kOf = i => T_REF / ATH[i].time;
/** distance of athlete i (0-based list index) at race time tau */
export const dist = (i, tau) => S(tau * kOf(i));
export const speed = (i, tau) => Sp(tau * kOf(i)) * kOf(i);
/** gap of athlete i behind the line at the instant Bolt finishes */
export const gapAtBoltFinish = i => 100 - dist(i, T_REF);

/** rank label as World Athletics prints shared places: "2=", "7=" … */
export function rankLabel(i) {
  const r = ATH[i].rank, shared = ATH.filter(a => a.rank === r).length > 1 || (DATA.also_tied || []).some(a => a.rank === r);
  return shared ? `${r}=` : `${r}`;
}

// ---------- video clock ----------
const [F0, F1] = TL.freeze, RATE = TL.slowmo_rate, SM_END = TL.slowmo_end;
const TAU_SM_END = T_REF + RATE * (SM_END - F1);
/** race time (s after the gun) shown at video time t; negative before the gun */
export function raceTime(t) {
  if (t < F0) return t - TL.gun;
  if (t < F1) return T_REF;
  if (t < SM_END) return T_REF + RATE * (t - F1);
  // run-out: the rate ramps smoothly from the slow-motion rate up to runout_rate_to over runout_ramp_s
  const R = TL.runout_ramp_s, r1 = TL.runout_rate_to, u = Math.min(t - SM_END, R), q = u / R;
  // integral of RATE + (r1-RATE)*smoothstep(q) over [0,u]
  const integ = RATE * u + (r1 - RATE) * R * (q * q * q - 0.5 * q * q * q * q);
  return TAU_SM_END + integ + (t - SM_END > R ? r1 * (t - SM_END - R) : 0);
}
/** video time at which race time tau is shown (first time; tau within the race and slow motion) */
export function videoTimeOf(tau) {
  if (tau < T_REF) return tau + TL.gun;
  if (tau === T_REF) return F0;
  if (tau <= TAU_SM_END) return F1 + (tau - T_REF) / RATE;
  let a = SM_END, b = TL.duration; for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (raceTime(m) < tau) a = m; else b = m; } return b;
}
export const phaseLabel = t => t < TL.gun ? 'SET' : t < F0 ? 'REAL TIME' : t < F1 ? 'FREEZE' : 'SLOW MOTION';

// ---------- camera (metres along the track at the screen anchor) ----------
const LAG = 0.15;
const follow = tau => {
  const a = tau - LAG, w = Math.min(1, Math.max(0, (tau - 0.6) / 2.0)), ws = w * w * (3 - 2 * w);
  return S(a) + LAG * Sp(a) * ws;                                    // lag early (punch), no steady-state offset
};
export const CAM_REST = 101.5;
const D_FREEZE = follow(T_REF), V_FREEZE = (follow(T_REF) - follow(T_REF - 0.01)) / 0.01 * RATE;   // m per video second
const SETTLE = 2.4;
export function cameraD(t) {
  if (t < TL.push_in[1]) { const q = Math.min(1, Math.max(0, (t - TL.push_in[0]) / (TL.push_in[1] - TL.push_in[0]))); return TL.push_in_from_m * (1 - q) * (1 - q); }   // ease-out glide onto the start line
  if (t < TL.gun) return 0;
  if (t < F0) return Math.max(0, follow(t - TL.gun));
  if (t < F1) return D_FREEZE;
  const u = Math.min(1, (t - F1) / SETTLE), T = SETTLE;             // Hermite from (D_FREEZE, V_FREEZE) to (CAM_REST, 0)
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2;
  return h00 * D_FREEZE + h10 * T * V_FREEZE + h01 * CAM_REST;
}

// ---------- step phase (two steps per cycle) ----------
const STEP_DT = 0.002, STEP_MAX = 16;
const stepsPerSec = v => 3.9 + 0.07 * v;                              // 4.74 steps/s at 12 m/s
const PHASE = ATH.map((a, i) => {
  const arr = new Float64Array(Math.ceil(STEP_MAX / STEP_DT) + 2); let ph = 0.37 * i % 1;  // own offset per runner
  for (let k = 0; k < arr.length; k++) { arr[k] = ph; const v = speed(i, k * STEP_DT); if (v > 0.05) ph += stepsPerSec(v) / 2 * STEP_DT; }
  return arr;
});
export function phase(i, tau) {
  const u = Math.max(0, tau) / STEP_DT, k = Math.min(PHASE[i].length - 2, Math.floor(u)), f = u - k;
  return PHASE[i][k] * (1 - f) + PHASE[i][k + 1] * f;
}

/** lane index (0 = far lane, 19 = near lane) of athlete i: rank 1 runs nearest the camera */
export const laneOf = i => N - 1 - i;

/** per-runner crossing times in video seconds (for the sound and the tag flashes) */
export const crossings = () => ATH.map((a, i) => ({i, rank: rankLabel(i), name: a.name, time: a.time, video_t: +videoTimeOf(a.time).toFixed(4)}));
