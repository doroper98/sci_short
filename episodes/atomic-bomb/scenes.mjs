// Episode scenes — "원자폭탄은 어떻게 터질까 — 핵분열 연쇄반응"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Scope (safety, brief "다루지 않는 범위"): textbook level only — fission of U-235 by a neutron, 2–3 new neutrons,
// mass defect ≈ 1/1000 → E = mc², doubling per generation, generation ≈ 1e-8 s, ~80 generations, critical mass as a
// CONCEPT (no numbers, abstract sphere), fireball, shock wave, heat and radiation. No device, structure, assembly,
// materials processing, design figures or delivery systems are drawn or described anywhere in this file.
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Masses (u): ²³⁵U 235.04393, n 1.00866, ¹⁴¹Ba 140.91441, ⁹²Kr 91.92616 → before 236.0526, after 235.8666,
//    Δm = 0.186 u = 0.079 % ("1000분의 1쯤"). One representative split of many.
//  - Hiroshima 15 kt × 4.184e12 J/kt = 6.28e13 J → m = E/c² = 0.698 g; 1-won coin 0.729 g (aluminium).
//  - Chain (explanatory model): every fission sends 2 neutrons on to 2 new fissions (k = 2) → 1, 2, 4, 8 …;
//    one generation = 1e-8 s; generation g has 2^(g−1) fissions; after 80 generations 2^80 − 1 ≈ 1.2e24 in 0.8 μs.
//    The picture: a hexagonal field of nuclei (spacing 1 unit) and a greedy outward tree (gens 1–7, exact doubling),
//    then an ignition wave through the rest of the field (gens 8+), then the counter only (up to 80).
//  - Critical scene (explanatory model): a sphere of radius R (in mean free paths λ), every collision = fission with
//    ν = 2 neutrons; isotropic first-flight escape probability of a uniform sphere
//      P_esc(x) = 3/(8x³)·[2x² − 1 + (1 + 2x)e^(−2x)],  x = R/λ,   k = ν(1 − P_esc).
//    k = 1 ⇔ hits = escapes (with ν = 2 the narration's boundary is exact). A seeded 3D Monte-Carlo branching run
//    (projected orthographically) draws the neutrons; the readouts use the formula.
//  - Blast (illustrative): Sedov–Taylor R ∝ t^0.4 on a log time axis; the fireball follows the shock until 15 ms,
//    then grows slowly while the shock runs ahead. No real radii are shown.
//  - Reactor (myth, explanatory model): k = 1 + ρ, ρ = ρ0(t) − β·h; the control-rod depth h follows a slow feedback
//    on log n, so n stays flat; the bomb line has k > 1.
//  - Sound: node episodes/atomic-bomb/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rand, rng, loadTimeline,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = {base: 'graphite', accent: '#FFB547'};
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
export const MASS = {U235: 235.043930, n: 1.008665, Ba141: 140.914411, Kr92: 91.926156};
export const M_BEFORE = MASS.U235 + MASS.n;
export const M_AFTER = MASS.Ba141 + MASS.Kr92 + 3 * MASS.n;
export const DM = M_BEFORE - M_AFTER, DM_FRAC = DM / M_BEFORE;
export const C_LIGHT = 2.998e8, KT_J = 4.184e12, HIRO_KT = 15;
export const E_HIRO = HIRO_KT * KT_J;                                     // J
export const M_HIRO_G = E_HIRO / C_LIGHT ** 2 * 1000;                     // g (≈ 0.70)
export const COIN_G = 0.729;
export const GEN_S = 1e-8, N_GEN = 80;
export const perGen = g => 2 ** (g - 1);                                   // fissions in generation g (k = 2)
export const totalTo = g => 2 ** g - 1;

/** first-flight escape probability from a uniform sphere of radius x mean free paths (isotropic sources) */
export function pEsc(x) {
  if (x < 1e-3) return 1 - 0.75 * x;
  return 3 / (8 * x ** 3) * (2 * x * x - 1 + (1 + 2 * x) * Math.exp(-2 * x));
}
export const NU_C = 2;
export const kOf = x => NU_C * (1 - pEsc(x));
export const X_CRIT = (() => { let lo = 0.01, hi = 10; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (pEsc(m) > 0.5) lo = m; else hi = m; } return (lo + hi) / 2; })();

// ---- the neutron tree and the nuclei field (world units ≈ nucleus spacing, y down) ----
// Radial binary tree: generation g sits near radius TREE_RG[g]; every node owns an angular sector that its two
// children split in half (exact doubling 1, 2, 4 … 64 for g = 1…7). Jitter keeps it organic. The rest of the field is a
// jittered hexagonal lattice with the points that would crowd a tree node removed.
export const T_GMAX = 7, TREE_RG = [0, 0, 1.45, 2.85, 4.2, 5.55, 6.9, 8.25];
export const TREE = (() => {
  const R = rng(1945), nodes = [{x: 0, y: 0, g: 1, parent: -1, kids: [], a0: 0, a1: TAU, stray: null}];
  const theta0 = 2.35;
  for (let g = 1; g < T_GMAX; g++) for (const n of nodes.filter(q => q.g === g)) {
    const halves = n.parent < 0 ? [[theta0 - Math.PI / 2, theta0 + Math.PI / 2], [theta0 + Math.PI / 2, theta0 + 1.5 * Math.PI]] : [[n.a0, (n.a0 + n.a1) / 2], [(n.a0 + n.a1) / 2, n.a1]];
    for (const [a0, a1] of halves) {
      const ac = (a0 + a1) / 2 + (R() - 0.5) * (a1 - a0) * 0.3, rr = TREE_RG[g + 1] + (R() - 0.5) * (0.35 + 0.14 * g);
      const k = nodes.length; nodes.push({x: rr * Math.cos(ac), y: rr * Math.sin(ac), g: g + 1, parent: nodes.indexOf(n), kids: [], a0, a1, stray: null}); n.kids.push(k);
    }
  }
  nodes.forEach((n, k) => { n.tau = 0; if (k === 0) return; const par = nodes[n.parent], gen = nodes.filter(q => q.g === n.g), L = q => Math.hypot(q.x - nodes[q.parent].x, q.y - nodes[q.parent].y), Lm = gen.reduce((a, q) => a + L(q), 0) / gen.length;
    n.tau = n.g - 1 + clamp((L(n) / Lm - 1) * 0.6 + (rand(k * 9.3) - 0.5) * 0.12, -0.28, 0.28); });
  // a third neutron for some fissions (the root always): it flies off outward and is lost
  nodes.forEach((n, k) => {
    if (!(k === 0 || (rand(k * 7.31 + 2) < 0.38 && n.g < T_GMAX))) return;
    const ang = k === 0 ? 1.57 : Math.atan2(n.y, n.x) + (rand(k * 3.7) - 0.5) * 1.4, L = 1.3 + rand(k * 1.9) * 0.9;
    n.stray = [n.x + Math.cos(ang) * L, n.y + Math.sin(ang) * L];
  });
  return nodes;
})();
export const FIELD = (() => {
  const R = rng(235), pts = TREE.map((n, k) => ({x: n.x, y: n.y, tree: k})), h = Math.sqrt(3) / 2;
  for (let j = -15; j <= 27; j++) for (let i = -12; i <= 12; i++) {
    const x = i * 0.95 + (j & 1 ? 0.475 : 0) + (R() - 0.5) * 0.22, y = j * h * 0.95 + (R() - 0.5) * 0.22;
    if (x < -10.2 || x > 10.2 || y < -11.6 || y > 23) continue;
    if (TREE.some(n => (n.x - x) ** 2 + (n.y - y) ** 2 < 0.62 * 0.62)) continue;
    pts.push({x, y, tree: -1});
  }
  for (const p of pts) { p.r = Math.hypot(p.x, p.y); p.a = Math.atan2(p.y, p.x); p.ph = rand(p.x * 13.1 + p.y * 7.7) * TAU; }
  return pts;
})();
export const ROOT = 0;
export const TREE_GEN_N = [...Array(T_GMAX + 1)].map((_, g) => TREE.filter(n => n.g === g).length);   // [0, 1, 2, 4, …]
/** ignition generation (fractional) of every field nucleus: tree nodes at g − 1, the rest in a wave spreading outward */
export const IGNITE = FIELD.map((p, i) => (p.tree >= 0 ? TREE[p.tree].tau : T_GMAX - 1.5 + Math.max(0, p.r - 4.5) / 1.35 + rand(i * 5.1) * 0.6));

// ---- nucleon clusters (²³⁶U compound → ¹⁴¹Ba + ⁹²Kr + 3n), unit-ball packings ----
function packing(N, seed) {
  const R = rng(seed), pts = []; let dmin = 2 * Math.cbrt(0.5 / N) * 0.98;
  while (pts.length < N) {
    let ok = false;
    for (let tries = 0; tries < 4000 && !ok; tries++) {
      const x = R() * 2 - 1, y = R() * 2 - 1, z = R() * 2 - 1; if (x * x + y * y + z * z > 1) continue;
      if (pts.every(q => (q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2 > dmin * dmin)) { pts.push([x, y, z]); ok = true; }
    }
    if (!ok) dmin *= 0.97;
  }
  return pts;
}
export const NUC = (() => {
  const P = packing(236, 92), R = rng(36);
  // 92 protons, 144 neutrons, spread evenly
  const isP = P.map((_, i) => false); let np = 0; const order = P.map((_, i) => i).sort(() => R() - 0.5);
  for (const i of order) if (np < 92) { isP[i] = true; np++; }
  // split along y: top → Ba (56 p, 85 n), bottom → Kr (36 p, 56 n), middle 3 neutrons free
  const byY = P.map((_, i) => i).sort((a, b) => P[a][1] - P[b][1]);
  const grp = new Array(236).fill(-1); let pA = 0, nA = 0, pB = 0, nB = 0;
  for (const i of byY) { if (isP[i] && pA < 56) { grp[i] = 0; pA++; } else if (!isP[i] && nA < 85) { grp[i] = 0; nA++; } }
  for (const i of byY.slice().reverse()) { if (grp[i] >= 0) continue; if (isP[i] && pB < 36) { grp[i] = 1; pB++; } else if (!isP[i] && nB < 56) { grp[i] = 1; nB++; } }
  const free = P.map((_, i) => i).filter(i => grp[i] < 0);   // 3 neutrons
  const sA = Math.cbrt(141 / 236), sB = Math.cbrt(92 / 236), PA = packing(141, 56), PB = packing(92, 36);
  const assign = (ids, slots, c) => { const left = slots.map((_, k) => k), out = new Map(); for (const i of ids.slice().sort((a, b) => P[a][1] - P[b][1])) { let best = 0, bd = 1e9; left.forEach((k, u) => { const d = (slots[k][0] - (P[i][0] - c[0])) ** 2 + (slots[k][1] - (P[i][1] - c[1])) ** 2 + (slots[k][2] - P[i][2]) ** 2; if (d < bd) { bd = d; best = u; } }); out.set(i, slots[left[best]]); left.splice(best, 1); } return out; };
  const cen = g => { const ids = P.map((_, i) => i).filter(i => grp[i] === g); return [ids.reduce((s, i) => s + P[i][0], 0) / ids.length, ids.reduce((s, i) => s + P[i][1], 0) / ids.length]; };
  const cA = cen(0), cB = cen(1);
  const mA = assign(P.map((_, i) => i).filter(i => grp[i] === 0), PA.map(q => q.map(v => v * sA)), cA);
  const mB = assign(P.map((_, i) => i).filter(i => grp[i] === 1), PB.map(q => q.map(v => v * sB)), cB);
  return {P, isP, grp, free, sA, sB, slot: i => (grp[i] === 0 ? mA.get(i) : grp[i] === 1 ? mB.get(i) : null), r: Math.cbrt(0.5 / 236) * 1.02};
})();
/** a small packing used for a lone nucleus of N nucleons (Ba product in the 1938 scene) */
export const BA_PACK = packing(137, 56).map(q => q.map(v => v * Math.cbrt(137 / 236)));

// ---- critical scene: seeded 3D Monte-Carlo branching in a sphere whose radius follows the knob ----
export const CRIT = {nu: 2, dt: 0.62, bin: 0.4, cap: 300, xSmall: 0.6 * X_CRIT, xLarge: 2.4 * X_CRIT};
/**
 * Branching run in continuous screen time: a neutron born at tb flies its free path s (in mean free paths λ) at one λ
 * per CRIT.dt screen seconds; if it ends inside the sphere (radius R(tb)) it causes a fission there at tb + s·dt, which
 * emits ν = 2 new neutrons; otherwise it leaves through the surface. sources: [{t, n}] fresh fissions at random interior
 * points. Lineages are processed generation by generation (population capped by Russian roulette, weights kept).
 * Returns {sites [{p, tf, w}], n [{p, d, end, esc, tb, te, w}]} sorted by time.
 */
export function runMC({sources, R: Rof, seed, tEnd}) {
  const rnd = rng(seed), sites = [], neut = [];
  const iso = () => { const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), s * Math.sin(a), z]; };
  const inside = Rr => { for (;;) { const p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; if (p[0] ** 2 + p[1] ** 2 + p[2] ** 2 < 1) return p.map(v => v * Rr * 0.92); } };
  let cur = [];
  for (const S of sources) for (let q = 0; q < S.n; q++) { const tf = S.t + rnd() * 0.25; cur.push({p: inside(Rof(tf)), w: 1, tf}); }
  for (let g = 0; g < 400 && cur.length; g++) {
    cur = cur.filter(f => f.tf <= tEnd); sites.push(...cur);
    const next = [];
    for (const f of cur) for (let m = 0; m < CRIT.nu; m++) {
      const Rr = Rof(f.tf), d = iso(), s = -Math.log(1 - rnd()), e = f.p.map((v, q) => v + d[q] * s);
      const esc = e[0] ** 2 + e[1] ** 2 + e[2] ** 2 > Rr * Rr;
      let end = e, len = s; if (esc) { const b = f.p[0] * d[0] + f.p[1] * d[1] + f.p[2] * d[2], c = f.p[0] ** 2 + f.p[1] ** 2 + f.p[2] ** 2 - Rr * Rr, u = -b + Math.sqrt(Math.max(0, b * b - c)); len = u + 0.35 * Rr; end = f.p.map((v, q) => v + d[q] * len); }
      const n = {p: f.p, d, end, esc, w: f.w, tb: f.tf, te: f.tf + len * CRIT.dt}; neut.push(n);
      if (!esc) next.push({p: end, w: f.w, tf: n.te});
    }
    if (next.length > CRIT.cap) { cur = next.filter(() => rnd() < 0.5); cur.forEach(n => (n.w *= 2)); } else cur = next;
  }
  sites.sort((a, b) => a.tf - b.tf); neut.sort((a, b) => a.tb - b.tb);
  return {sites, n: neut};
}

// ---- blast (illustrative): log time, Sedov–Taylor R ∝ t^0.4 ----
export const BL = {Rs1: 900, tSep: 0.015, fbGrow: 0.5};
export const shockR = tm => BL.Rs1 * Math.pow(Math.max(tm, 1e-9), 0.4);          // screen px at zoom 1
export const fireR = tm => (tm <= BL.tSep ? shockR(tm) : shockR(BL.tSep) * (1 + BL.fbGrow * (1 - Math.exp(-(tm - BL.tSep) / 0.12))));

// ---- reactor (myth, explanatory model): rods hold k = 1 ----
export const REACTOR = (() => {
  const dt = 0.02, T = 18, n = Math.round(T / dt) + 1, logN = new Float64Array(n), h = new Float64Array(n), rho = new Float64Array(n);
  let L = 0, H = 0.5;
  for (let i = 0; i < n; i++) {
    const t = i * dt, rho0 = 0.5 * 0.06 + 0.012 * Math.sin(t * 0.9) + 0.008 * Math.sin(t * 2.3 + 1);   // reactivity of the fuel without rods (wanders a little)
    const r = rho0 - 0.06 * H;                                                                         // rods take reactivity away
    logN[i] = L; h[i] = H; rho[i] = r;
    L += r * dt * 2.2; H = clamp(H + (L * 0.9 + r * 4) * dt, 0, 1);                                     // feedback: push rods in when n rises
  }
  return {dt, T, logN, h, rho, at: (arr, t) => { const u = clamp(t / dt, 0, n - 1.001), i = Math.floor(u); return lerp(arr[i], arr[i + 1], u - i); }};
})();

// =====================================================================================================
// Time anchors (words from the `tts` text; shared with sound.json through --emit-sound) and the plan
// =====================================================================================================
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  nucleus1: W('s01', '원자핵'), split1: W('s01', '쪼개지며'), start1: W('s01', '시작되는'), bomb1: W('s01', '원자폭탄의'), chain1: W('s01', '연쇄반응에'),
  y1945: W('s02', '천구백사십오년'), hiro: W('s02', '히로시마의'), energy2: W('s02', '에너지로'), mass2: W('s02', '질량은'), g07: W('s02', '영점칠그램'), won1: W('s02', '일원짜리'), coin2: W('s02', '동전'), weight2: W('s02', '무게였습니다'),
  greek: W('s03', '그리스어로'), cut3: W('s03', '쪼갤'), cannot3: W('s03', '없다는'), atomos: W('s03', '아토모스에서'), name3: W('s03', '이름입니다'),
  y1938: W('s04', '천구백삼십팔년'), hahn: W('s04', '한과'), u4: W('s04', '우라늄에'), n4: W('s04', '중성자를'), shoot4: W('s04', '쏘자'), light4: W('s04', '가벼운'), ba4: W('s04', '바륨이'), found4: W('s04', '발견했습니다'),
  meitner: W('s05', '마이트너와'), nuc5: W('s05', '원자핵이'), two5: W('s05', '둘로'), split5: W('s05', '쪼개진'), cell5: W('s05', '세포가'), divide5: W('s05', '나뉘는'), liken5: W('s05', '빗대'), fission5: W('s05', '핵분열이라'),
  pieces6: W('s06', '조각들의'), all6: W('s06', '모두'), sum6: W('s06', '더하면'), first6: W('s06', '처음'), thousand6: W('s06', '천분의'), lighter6: W('s06', '가볍습니다'),
  gone7: W('s07', '사라진'), light7: W('s07', '빛의'), twice7: W('s07', '두 번'), mult7: W('s07', '곱한'), energy7: W('s07', '에너지가'), einstein: W('s07', '아인슈타인의'), emc2: W('s07', '엠씨제곱입니다'),
  u8: W('s08', '우라늄'), n8: W('s08', '중성자'), take8: W('s08', '받아'), split8: W('s08', '쪼개질'), new8: W('s08', '새'), twothree: W('s08', '두세'), out8: W('s08', '튀어나옵니다'),
  next9: W('s09', '이웃'), again9: W('s09', '쪼개면'), one9: W('s09', '하나'), two9: W('s09', '둘'), four9: W('s09', '넷'), eight9: W('s09', '여덟'), grow9: W('s09', '불어납니다'), chain9: W('s09', '연쇄반응입니다'),
  step10: W('s10', '단계가'), e8: W('s10', '일억분의'), eighty: W('s10', '여든'), repeat10: W('s10', '되풀이되는'), many10: W('s10', '수많은'), atonce: W('s10', '한꺼번에'), split10: W('s10', '쪼개집니다'),
  lump11: W('s11', '덩어리가'), small11: W('s11', '작으면'), surface11: W('s11', '겉으로'), escape11: W('s11', '빠져나가'), cont11: W('s11', '이어지지'), die11: W('s11', '잦아듭니다'),
  esc12: W('s12', '빠져나가는'), hit12: W('s12', '맞히는'), more12: W('s12', '많아지는'), border12: W('s12', '경계의'), crit12: W('s12', '임계질량이라고'),
  usec13: W('s13', '백만분의'), end13: W('s13', '끝나면'), temp13: W('s13', '수천만'), hot13: W('s13', '달아올라'), bright13: W('s13', '눈부신'), fb13: W('s13', '불덩이가'),
  air14: W('s14', '공기를'), push14: W('s14', '밀어내며'), shock14: W('s14', '충격파가'), heat14: W('s14', '열과'), rad14: W('s14', '방사선이'),
  jul15: W('s15', '칠월'), desert15: W('s15', '사막에서'), test15: W('s15', '시험이'), aug15: W('s15', '팔월에는'), hiro15: W('s15', '히로시마와'), naga15: W('s15', '나가사키에'),
  cities16: W('s16', '도시에서'), n150k: W('s16', '십오만'), lives16: W('s16', '목숨을'), korean16: W('s16', '조선인도'),
  npp17: W('s17', '원자력'), bomb17: W('s17', '폭탄처럼'),
  no18: W('s18', '그렇지'), fuel18: W('s18', '발전용'), few18: W('s18', '몇'), pct18: W('s18', '퍼센트뿐이고'), rods18: W('s18', '제어봉이'), absorb18: W('s18', '흡수해'), steady18: W('s18', '일정하게'),
  slow19: W('s19', '천천히'), elec19: W('s19', '전기가'), instant19: W('s19', '한순간에'), bomb19: W('s19', '폭탄이'),
  final20: W('s20', '원자폭탄은'),
};

/** screen time → model time through knots [t, m] (piecewise linear, softened by ±soft s); inv(m) by bisection */
function knotMap(knots, soft = 0.2) {
  const lin = t => { if (t <= knots[0][0]) return knots[0][1] + (t - knots[0][0]) * (knots[1][1] - knots[0][1]) / (knots[1][0] - knots[0][0]);
    for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [a, ma] = knots[i - 1], [b, mb] = knots[i]; return ma + (t - a) / (b - a) * (mb - ma); }
    const [a, ma] = knots.at(-2), [b, mb] = knots.at(-1); return mb + (t - b) * (mb - ma) / (b - a); };
  const f = soft > 0 ? t => { let s = 0; for (let k = -4; k <= 4; k++) s += lin(t + k * soft / 4) * (5 - Math.abs(k)); return s / 25; } : lin;
  f.inv = m => { let lo = knots[0][0] - 60, hi = knots.at(-1)[0] + 60; for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (f(mid) < m) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  return f;
}
/** balance scale: damped step responses to load changes [{t, mL, mR}] → angle (rad, + = right side down) */
function scaleModel(loads, {K, M0, w = 5.2, z = 0.32, max = 0.3}) {
  const eq = (mL, mR) => clamp(K * (mR - mL) / (mR + mL + M0), -max, max);
  const steps = loads.map((L, i) => ({t: L.t, d: eq(L.mL, L.mR) - (i ? eq(loads[i - 1].mL, loads[i - 1].mR) : 0)}));
  const wd = w * Math.sqrt(1 - z * z);
  return t => { let th = 0; for (const s of steps) { if (t < s.t) continue; const u = t - s.t; th += s.d * (1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + z * w / wd * Math.sin(wd * u))); } return th; };
}

const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // ---- hook: poster → one nucleus → chain → fireball; s02 the scale
  P.hX = [1.8, 2.25];                                                        // poster picture fades to the start state
  P.hIn = [1.95, at(A.split1) - 0.04];                                       // incoming neutron flight
  P.hG = [at(A.split1), 3.0, 3.47, 3.86, 4.19, 4.47, 4.72];                  // generations 1…7 (screen)
  P.hTau = knotMap([...P.hG.map((t, g) => [t, g]), [5.6, 9.5], [6.6, 14]], 0.12);
  P.hFB = [4.85, 6.3];                                                       // fireball blooms
  P.hCam = t => lerp(150, 58, easeInOut((t - 2.0) / 2.9));
  P.s02 = at('s02') - 0.4; P.shrink = [at('s02') - 0.35, at('s02') + 0.85];
  P.y1945 = at(A.y1945) - 0.05; P.tnt = at(A.energy2) - 0.1; P.stream = [at(A.mass2) - 0.15, at(A.g07) + 0.2]; P.grain = P.stream[1];
  P.coin = [at(A.won1) - 0.05, at(A.won1) + 0.35]; P.same = at(A.weight2) - 0.05;
  P.hookScale = scaleModel([{t: -1, mL: 0, mR: 0}, {t: P.grain, mL: 0, mR: M_HIRO_G}, {t: P.coin[1], mL: COIN_G, mR: M_HIRO_G}], {K: 0.36, M0: 0.5});
  // ---- origin
  P.atom = at('s03') - 0.3; P.cut = [at(A.cut3) - 0.05, at(A.cannot3) + 0.2]; P.atomos = at(A.atomos) - 0.1; P.hanja = at(A.name3) - 0.15;
  P.s04 = at('s04') - 0.5; P.uLabel = at(A.u4) - 0.1; P.nFly = [at(A.n4) - 0.05, at(A.shoot4) + 0.45]; P.ba = at(A.ba4) - 0.1; P.bars = at(A.light4) - 0.05;
  P.s05 = at('s05') - 0.5; P.split5 = [at(A.two5) - 0.1, at(A.split5) + 0.75]; P.cell5 = [at(A.cell5) - 0.05, at(A.liken5) - 0.1]; P.fission5 = at(A.fission5) - 0.1;
  // ---- essence
  P.e0 = sc('essence').start; P.drop6 = [at(A.all6) - 0.35, at(A.sum6) + 0.15]; P.read6 = at(A.first6) - 0.1; P.thou6 = at(A.thousand6) - 0.1; P.light6 = at(A.lighter6) - 0.1;
  P.essScale = scaleModel([{t: -1, mL: M_BEFORE, mR: 0}, {t: P.drop6[1], mL: M_BEFORE, mR: M_AFTER}], {K: 254, M0: 0, max: 0.3});
  P.gone7 = at(A.gone7) - 0.1; P.c1 = at(A.light7) - 0.05; P.c2 = at(A.twice7) + 0.05; P.eFlash = at(A.energy7) - 0.05; P.formula = at(A.einstein) - 0.1; P.tnt7 = at(A.emc2) + 0.5;
  // ---- chain: generation g (1…7) fissions at P.cG[g − 1]; τ = model generations (fission of gen g at τ = g − 1)
  P.cIn = [at(A.n8) - 0.2, at(A.take8)]; P.cG = [at(A.split8), at(A.again9) + 0.06, at(A.four9), at(A.eight9), at(A.eight9) + 0.37, at(A.eight9) + 0.7, at(A.eight9) + 1.01];
  P.cTau = knotMap([...P.cG.map((t, g) => [t, g]), [79.4, 8.6], [82.4, 11.0], [86.2, 21], [88.6, 26]], 0.15);
  P.c82 = 82.4; P.c80 = at(A.split10) - 0.15;
  P.gC = t => { if (t < P.cG[0]) return 0; if (t < P.c82) return Math.min(11, Math.floor(P.cTau(t) + 1e-6) + 1); return Math.round(lerp(11, N_GEN, easeInOut((t - P.c82) / (P.c80 - P.c82)))); };
  P.uLbl8 = at(A.u8) - 0.1; P.nLbl8 = at(A.n8) - 0.1; P.new8 = at(A.new8) - 0.1; P.twothree = at(A.twothree) - 0.1;
  P.inst = at('s09') - 0.45; P.count = [at(A.one9), at(A.two9), at(A.four9), at(A.eight9)]; P.chainName = at(A.chain9) - 0.1;
  P.e8 = at(A.e8) - 0.1; P.eighty = at(A.eighty) - 0.1; P.atonce = at(A.atonce) - 0.1;
  P.cCam = t => { const k = [[69.2, 230], [72.3, 74], [75.4, 46], [76.5, 34], [80.5, 30], [85, 27]]; if (t <= k[0][0]) return k[0][1]; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return Math.exp(lerp(Math.log(k[i - 1][1]), Math.log(k[i][1]), easeInOut((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])))); return k.at(-1)[1]; };
  P.cCy = t => lerp(770, 640, easeInOut((t - 69.2) / 1.6));
  // ---- critical: radius knob (λ units) crosses X_CRIT exactly on "많아지는"
  P.cross = at(A.more12) + 0.05; P.border = at(A.border12) - 0.1; P.critName = at(A.crit12) - 0.1;
  { const D = 4.4, lnr = Math.log(CRIT.xLarge / CRIT.xSmall), uc = Math.log(X_CRIT / CRIT.xSmall) / lnr; let lo = 0, hi = 1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (smooth(m) < uc) lo = m; else hi = m; } P.knob = [P.cross - (lo + hi) / 2 * D, P.cross - (lo + hi) / 2 * D + D]; }
  P.xAt = t => CRIT.xSmall * (CRIT.xLarge / CRIT.xSmall) ** smooth((t - P.knob[0]) / (P.knob[1] - P.knob[0]));
  const s11 = at('s11');
  P.burst = [s11 + 0.25, at(A.escape11) - 0.2, at(A.cont11) - 0.35];
  P.mcT0 = sc('critical').start + 0.3;
  { const src = P.burst.map(t => ({t, n: 6})); for (let t = at('s12'); t < P.cross + 0.8; t += 0.55) src.push({t, n: 1});
    P.MC = runMC({sources: src, R: P.xAt, seed: 1938, tEnd: sc('blast').start + 1.5}); }
  P.MCB = []; for (let tb = P.mcT0; tb < sc('critical').end; tb += CRIT.bin) { let f = 0; for (const q of P.MC.sites) if (q.tf >= tb && q.tf < tb + CRIT.bin) f += q.w; P.MCB.push({t: tb + CRIT.bin, fis: f, R: P.xAt(tb + CRIT.bin / 2)}); }
  P.lumpIn = sc('critical').start + 0.1; P.small11 = at(A.small11) - 0.1; P.surface11 = at(A.surface11) - 0.1; P.die11 = at(A.die11) - 0.1;
  P.esc12 = at(A.esc12) - 0.1;
  // ---- blast: log10 of model time (s) and zoom
  const b0 = sc('blast').start;
  P.bU = knotMap([[b0 + 0.2, -8], [at(A.end13), -6.1], [at(A.temp13), -5.3], [at(A.fb13), -4], [at('s14') + 0.05, -3], [at('s14') + 6.05, 0]], 0.1);
  P.bZ = t => lerp(6.6, 1, smooth((t - (at(A.fb13) + 0.5)) / 2.2));
  P.end13 = at(A.end13) - 0.1; P.temp13 = at(A.temp13) - 0.1; P.bright13 = at(A.bright13) - 0.1; P.fb13 = at(A.fb13) - 0.1;
  P.tsep = P.bU.inv(Math.log10(BL.tSep)); P.heat14 = at(A.heat14) - 0.1; P.rad14 = at(A.rad14) - 0.1; P.air14 = at(A.air14) - 0.1;
  P.ruler = [260, 340, 420].map(R => ({R, t: P.bU.inv(Math.log10((R / BL.Rs1) ** 2.5))}));
  // ---- history
  P.jul = at(A.jul15) - 0.15; P.test = at(A.test15) - 0.05; P.aug = at(A.aug15) - 0.1; P.hiro = at(A.hiro15) - 0.05; P.naga = at(A.naga15) - 0.05;
  P.dark16 = at(A.cities16) - 0.2; P.n150k = at(A.n150k) - 0.1; P.korean = at(A.korean16) - 0.1;
  // ---- myth
  P.m0 = sc('myth').start; P.bomb17 = at(A.bomb17) - 0.1; P.no18 = at(A.no18) - 0.05; P.fuel18 = at(A.fuel18) - 0.1; P.pct18 = at(A.few18) - 0.1;
  P.rods18 = at(A.rods18) - 0.1; P.absorb18 = at(A.absorb18) - 0.1; P.steady18 = at(A.steady18) - 0.1;
  P.mBombG = [0, 1, 2, 3, 4, 5, 6].map(g => P.bomb17 + 0.35 + g * 0.42);
  P.RL = reactorLineages(P.m0 + 0.4, sc('myth').end, tt => REACTOR.at(REACTOR.h, tt - P.m0 - 0.2));
  P.mTau = knotMap([...P.mBombG.map((t, g) => [t, g]), [P.mBombG[6] + 1.2, 11], [P.mBombG[6] + 3, 16]], 0.1);
  // ---- close
  P.slow19 = at(A.slow19) - 0.3; P.elec19 = at(A.elec19) - 0.1; P.inst19 = at(A.instant19) - 0.1; P.bomb19 = at(A.bomb19) - 0.1;
  P.kOneT = [...Array(9)].map((_, k) => P.slow19 + 0.25 + k * 0.62);
  P.clG = [0, 1, 2, 3, 4, 5, 6].map(g => P.inst19 + 0.1 + g * 0.26);
  P.clTau = knotMap([...P.clG.map((t, g) => [t, g]), [P.clG[6] + 0.9, 11], [P.clG[6] + 2.5, 15]], 0.08);
  // ---- poster bookend (replays the hook build-up and ends on the thumbnail state)
  P.back = at(A.final20) - 0.1;
  P.pG = [0, 1, 2, 3, 4, 5, 6].map(g => P.back + 0.35 + [0, 0.5, 0.9, 1.24, 1.53, 1.78, 2.0][g]);
  P.pTau = knotMap([...P.pG.map((t, g) => [t, g]), [P.pG[6] + 0.8, 9.5], [P.pG[6] + 1.6, 12]], 0.1);
  P.pFB = [P.pG[6] + 0.1, P.pG[6] + 1.5];
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Background, palette and small helpers
// =====================================================================================================
export const PAL = {
  n: '#86D0FF', nCore: '#E8F6FF', flash: '#FFC46A', ember: '#FFB547', nuc: '#8F877C', fb: '#FFD9A0',
  heat: '#FFB547', rad: '#9FD8FF', ring: '#EEE6D8', reactor: '#7FD1B9', bomb: '#FF8A4C', hit: '#FFC46A', esc: '#86D0FF',
  proton: '#C98A55', bound: '#8E979E', cell: '#A9CDBB', land: '#2A2B2E', landEdge: '#7E7A73', city: '#FFD9A0', answer: '#FFB547',
};
const FLASH_C = [1.0, 0.70, 0.34], FB_HOT = [1.0, 0.95, 0.86], FB_MID = [1.0, 0.70, 0.33], FB_EDGE = [0.95, 0.43, 0.15], N_C = [0.45, 0.78, 1.0];
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage;
  const g = c.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, '#111214'); g.addColorStop(1, '#060607');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  glow(c, 540, 700, 900, '#3A3026', 0.10);
  const v = c.createRadialGradient(W / 2, H * 0.4, H * 0.25, W / 2, H * 0.4, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.25, b = 0.25) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
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
/** text with "^" exponents ("약 10^24개", "10^-8"): the exponent is drawn smaller and raised. Returns width. */
function sci(stage, s, x, y, o = {}) {
  const size = o.size || 32, parts = String(s).split(/\^([−\-]?\d+)/), es = Math.round(size * 0.62), base = {...o, align: 'left'};
  const ws = parts.map((p, i) => (i % 2 ? stage.measure(p, {...base, size: es}) : stage.measure(p, {...base, size})));
  const W2 = ws.reduce((a, b) => a + b, 0); let xx = o.align === 'center' ? x - W2 / 2 : o.align === 'right' ? x - W2 : x;
  parts.forEach((p, i) => { if (p) stage.text(p, xx, i % 2 ? y - size * 0.36 : y, {...base, size: i % 2 ? es : size}); xx += ws[i]; });
  return W2;
}
/** 2^(g−1)-like counts: plain up to a million, then "6.0 × 10^23" */
export function fmtCount(v) {
  if (v < 1e6) return Math.round(v).toLocaleString('en-US');
  const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)} × 10^${e}`;
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
function tile(stage, x, y, w, label, value, o = {}) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, x, y, w, o.h ?? 104, o.plateA ?? 0.88);
  if (o.hi > 0) rect(c, x, y, w, o.h ?? 104, 12, null, rgba(o.hiCol || T.accent, o.hi), 2.5);
  stage.text(label, x + w / 2, y + 28, {size: 24, weight: 700, color: T.muted, align: 'center'});
  sci(stage, value, x + w / 2, y + 72, {role: 'display', size: o.size ?? 40, weight: 700, color: o.color || T.ink, align: 'center'});
}
/** darkened band behind the header (a picture adjustment, not a plate) */
function headShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 0, 0, 340);
  g.addColorStop(0, `rgba(4,4,5,${0.92 * a})`); g.addColorStop(0.7, `rgba(4,4,5,${0.7 * a})`); g.addColorStop(1, 'rgba(4,4,5,0)');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 340);
}
/** darkened band behind captions (a picture adjustment, not a plate) */
function captionShade(c, a = 1) {
  if (a <= 0) return; const g = c.createLinearGradient(0, 1340, 0, 1600);
  g.addColorStop(0, 'rgba(4,4,5,0)'); g.addColorStop(0.35, `rgba(4,4,5,${0.62 * a})`); g.addColorStop(0.75, `rgba(4,4,5,${0.62 * a})`); g.addColorStop(1, 'rgba(4,4,5,0)');
  c.fillStyle = g; c.fillRect(0, 1340, 1080, 260);
}
/** smooth value noise in 2D (deterministic) */
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

// =====================================================================================================
// Light buffer (additive, tone-mapped): fission flashes, the fireball, glowing lumps
// =====================================================================================================
class Glow {
  constructor(W = 1080, H = 1920, s = 0.5) {
    Object.assign(this, {s, w: Math.ceil(W * s), h: Math.ceil(H * s)});
    const n = this.w * this.h; this.R = new Float32Array(n); this.G = new Float32Array(n); this.B = new Float32Array(n);
    this.cv = createCanvas(this.w, this.h); this.cc = this.cv.getContext('2d'); this.img = this.cc.createImageData(this.w, this.h);
    this.sm = createCanvas(Math.ceil(this.w / 4), Math.ceil(this.h / 4)); this.smc = this.sm.getContext('2d');
    this.d = [this.w, this.h, 0, 0]; this.prev = [0, 0, 0, 0];
  }
  begin() {
    const [x0, y0, x1, y1] = this.prev;
    for (let y = y0; y < y1; y++) { const o = y * this.w; this.R.fill(0, o + x0, o + x1); this.G.fill(0, o + x0, o + x1); this.B.fill(0, o + x0, o + x1); }
    if (x1 > x0 && y1 > y0) this.cc.clearRect(Math.max(0, x0 - 2), Math.max(0, y0 - 2), x1 - x0 + 4, y1 - y0 + 4);
    this.d = [this.w, this.h, 0, 0]; return this;
  }
  region(X0, Y0, X1, Y1) {
    const s = this.s, a = Math.max(0, Math.floor(X0 * s)), b = Math.max(0, Math.floor(Y0 * s)), c = Math.min(this.w, Math.ceil(X1 * s)), d = Math.min(this.h, Math.ceil(Y1 * s));
    if (c <= a || d <= b) return null;
    const D = this.d; D[0] = Math.min(D[0], a); D[1] = Math.min(D[1], b); D[2] = Math.max(D[2], c); D[3] = Math.max(D[3], d);
    return [a, b, c, d];
  }
  each(X0, Y0, X1, Y1, fn) {
    const r = this.region(X0, Y0, X1, Y1); if (!r) return; const inv = 1 / this.s, w = this.w;
    for (let by = r[1]; by < r[3]; by++) { const sy = (by + 0.5) * inv, o = by * w; for (let bx = r[0]; bx < r[2]; bx++) fn((bx + 0.5) * inv, sy, o + bx); }
  }
  /** gaussian splat (screen px radius = 2σ) */
  splat(x, y, rad, col, I) {
    if (I <= 0.002 || rad <= 0.3) return;
    const s2 = 2 * (rad / 2) ** 2, {R, G, B} = this, c0 = col[0] * I, c1 = col[1] * I, c2 = col[2] * I;
    this.each(x - rad * 1.6, y - rad * 1.6, x + rad * 1.6, y + rad * 1.6, (sx, sy, i) => { const k = Math.exp(-((sx - x) ** 2 + (sy - y) ** 2) / s2); R[i] += k * c0; G[i] += k * c1; B[i] += k * c2; });
  }
  flush(stage, {gain = 1.3, bloom = 0.5, alpha = 1, cross = 0.1} = {}) {
    const [x0, y0, x1, y1] = this.d; this.prev = [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
    if (x1 <= x0 || y1 <= y0 || alpha <= 0) return;
    const {w, R, G, B, img} = this, dd = img.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, j = i * 4, l = (R[i] + G[i] + B[i]) * cross;
      dd[j] = 255 * (1 - Math.exp(-(R[i] + l) * gain)); dd[j + 1] = 255 * (1 - Math.exp(-(G[i] + l) * gain)); dd[j + 2] = 255 * (1 - Math.exp(-(B[i] + l) * gain)); dd[j + 3] = 255;
    }
    this.cc.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    const c = stage.ctx, inv = 1 / this.s;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= alpha; c.imageSmoothingEnabled = true;
    c.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * inv, y0 * inv, (x1 - x0) * inv, (y1 - y0) * inv);
    if (bloom > 0) {
      const sm = this.sm, sc = this.smc, q = 0.25;
      sc.globalCompositeOperation = 'copy'; sc.filter = 'none';
      sc.clearRect(0, 0, sm.width, sm.height);
      sc.drawImage(this.cv, x0, y0, x1 - x0, y1 - y0, x0 * q, y0 * q, (x1 - x0) * q, (y1 - y0) * q);
      sc.filter = 'blur(5px)'; sc.drawImage(sm, 0, 0); sc.filter = 'none';
      c.globalAlpha = alpha * bloom; c.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, sm.width / q * inv, sm.height / q * inv);
    }
    c.restore();
  }
}
let GB = null;
const glowBuf = () => (GB ||= new Glow()).begin();

/** fireball into the light buffer: hot core, granular limb, soft halo. heat 1 = white-hot, 0 = orange */
function fireballGlow(gb, t, cx, cy, R, {I = 1, heat = 1, halo = 1, seed = 0} = {}) {
  if (R < 1 || I <= 0) return;
  const ext = R * (1 + 1.6 * halo), inv = 1 / R, {R: BR, G: BG, B: BB} = gb, aa = 1.5 * inv;
  const mid = [0, 1, 2].map(k => lerp(FB_MID[k], FB_HOT[k], heat * 0.6)), edge = [0, 1, 2].map(k => lerp(FB_EDGE[k], FB_MID[k], heat * 0.5));
  const core = [0, 1, 2].map(k => lerp(FB_MID[k], FB_HOT[k], 0.4 + 0.6 * heat));
  gb.each(cx - ext, cy - ext, cx + ext, cy + ext, (x, y, i) => {
    const dx = (x - cx) * inv, dy = (y - cy) * inv, d = Math.sqrt(dx * dx + dy * dy); if (d > 1 + 1.6 * halo) return;
    let r = 0, g = 0, b = 0;
    const cov = clamp((1 + aa - d) / (2 * aa));
    if (cov > 0) {
      const ang = Math.atan2(dy, dx), nz = vnoise(Math.cos(ang) * 3.2 + seed + t * 0.35, Math.sin(ang) * 3.2 + d * 2.4 - t * 0.5) * 0.65 + vnoise(dx * 7 + t * 0.6, dy * 7 + seed) * 0.35;
      const prof = (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - d * d))) * (1 + 0.32 * (nz - 0.5) * d * d);
      const q = Math.pow(d, 1.6), k = I * 1.25 * prof * cov;
      const cr = q < 0.5 ? lerp(core[0], mid[0], q * 2) : lerp(mid[0], edge[0], q * 2 - 1), cg = q < 0.5 ? lerp(core[1], mid[1], q * 2) : lerp(mid[1], edge[1], q * 2 - 1), cb = q < 0.5 ? lerp(core[2], mid[2], q * 2) : lerp(mid[2], edge[2], q * 2 - 1);
      r = k * cr; g = k * cg; b = k * cb;
    }
    if (cov < 1) { const e = Math.max(0, d - 1), h = (1 - cov) * I * halo * (0.42 * Math.exp(-e / 0.07) + 0.12 * Math.exp(-e / 0.45)); r += h * edge[0] * 1.05; g += h * edge[1]; b += h * edge[2] * 0.9; }
    BR[i] += r; BG[i] += g; BB[i] += b;
  });
}

// ---- sprites (drawn once, scaled with drawImage) ----
function sphereSprite(col, light, shade, r = 40) {
  const cv = createCanvas(2 * r + 4, 2 * r + 4), c = cv.getContext('2d'), x = r + 2;
  const g = c.createRadialGradient(x - r * 0.35, x - r * 0.4, r * 0.04, x, x, r);
  g.addColorStop(0, light); g.addColorStop(0.3, col); g.addColorStop(0.75, col); g.addColorStop(1, shade);
  c.fillStyle = g; c.beginPath(); c.arc(x, x, r, 0, TAU); c.fill();
  return {cv, r};
}
const SPR = {
  nuc: sphereSprite('#7E776D', '#E9E1D3', '#1C1A17'),
  proton: sphereSprite(PAL.proton, '#F6DABA', '#3A2414', 24),
  bound: sphereSprite(PAL.bound, '#E6EBEE', '#1D2226', 24),
};
const sprite = (c, S, x, y, r, a = 1) => { if (r <= 0.2 || a <= 0) return; if (a < 1) { c.save(); c.globalAlpha *= a; c.drawImage(S.cv, x - r * (S.r + 2) / S.r, y - r * (S.r + 2) / S.r, 2 * r * (S.r + 2) / S.r, 2 * r * (S.r + 2) / S.r); c.restore(); } else c.drawImage(S.cv, x - r * (S.r + 2) / S.r, y - r * (S.r + 2) / S.r, 2 * r * (S.r + 2) / S.r, 2 * r * (S.r + 2) / S.r); };

/** a free neutron: small cool light (canvas, additive) */
function neutronDot(c, x, y, r = 5, a = 1) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  glow(c, x, y, r * 4.2, PAL.n, 0.55 * a); circle(c, x, y, r, rgba(PAL.n, 0.9 * a)); circle(c, x, y, r * 0.5, rgba(PAL.nCore, a));
  c.restore();
}
/** neutron light trail from a to b (head at b): faint wide stroke + thin bright stroke, brighter toward the head */
function trail(c, a, b, alpha = 1, w = 2, col = PAL.n) {
  if (alpha <= 0.003) return; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  const grad = k => { const g = c.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, rgba(col, 0.3 * k * alpha)); g.addColorStop(1, rgba(col, k * alpha)); return g; };
  for (const [ww, k] of [[w * 5, 0.09], [w * 2.2, 0.24], [w, 0.95]]) { c.strokeStyle = grad(k); c.lineWidth = ww; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  c.restore();
}
/**
 * Nucleon cluster (²³⁶U compound nucleus) at (x, y), radius R. q = split progress (0 whole → 1 two fragments formed),
 * fly = extra separation of the fragments (in R), spin = slow turn about the split axis, rot = split axis angle
 * (0 = vertical). o.only: 0 | 1 draws one fragment; o.free: draw the 3 freed neutrons (cool) when q > 0.
 */
function cluster(c, x, y, R, q = 0, o = {}) {
  const {fly = 0, spin = 0.3, rot = 0, a = 1, only = -1, free = true, freeFly = 1, center = false} = o;
  const e = smooth(q / 0.45), s = smooth((q - 0.3) / 0.7), cs = Math.cos(spin), sn = Math.sin(spin), cr = Math.cos(rot), sr = Math.sin(rot);
  const yA = -(NUC.sA + 0.08 + fly), yB = NUC.sB + 0.08 + fly, list = [];
  if (center && only >= 0) { const oy = (only === 0 ? yA : yB) * s; x += sr * oy * R; y -= cr * oy * R; }
  for (let i = 0; i < 236; i++) {
    const g = NUC.grp[i]; if (only >= 0 && g !== only) continue;
    const p = NUC.P[i]; let px = p[0] * (1 - 0.14 * e), py = p[1] * (1 + 0.38 * e), pz = p[2] * (1 - 0.1 * e);
    if (g >= 0 && s > 0) { const sl = NUC.slot(i), cyy = g === 0 ? yA : yB; px = lerp(px, sl[0], s); py = lerp(py, cyy + sl[1], s); pz = lerp(pz, sl[2], s); }
    if (g < 0 && q > 0.3) continue;
    const X = px * cs + pz * sn, Z = -px * sn + pz * cs;
    list.push([X * cr - py * sr, X * sr + py * cr, Z, NUC.isP[i]]);
  }
  list.sort((m, n) => m[2] - n[2]);
  const rr = R * NUC.r * 1.12;
  withAlpha(c, a, () => { for (const [X, Y, Z, isP] of list) if (Z > -0.55) sprite(c, isP ? SPR.proton : SPR.bound, x + X * R, y + Y * R, rr * (1 + 0.05 * Z)); });
  if (q > 0.3 && free && only < 0) NUC.free.forEach((i, k) => {
    const ang = rot + [0, Math.PI, -0.95][k], d = (0.3 + 1.9 * smooth((q - 0.3) / 0.7) * freeFly) * R;
    neutronDot(c, x + Math.cos(ang) * d, y + Math.sin(ang) * d, Math.max(3, R * 0.07), a);
  });
}

// =====================================================================================================
// The chain picture: field of nuclei, neutron light-trails, fission flashes, optional fireball and shock rings
// =====================================================================================================
export const POSTER_TAU = 9.0, POSTER_CAM = {cx: 540, cy: 640, s: 58}, FB_R = 2.55, RINGS = [5.7, 8.9];
const INV = new WeakMap();
/** inverse of a monotone screen→τ map on [t0, t1], tabulated at 1/120 s; returns screen time of τ (or −∞ / +∞ outside) */
function invOf(f, t0, t1) {
  let tab = INV.get(f); if (tab) return tab;
  const n = Math.ceil((t1 - t0) * 120) + 1, T = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) { T[i] = t0 + i / 120; V[i] = f(T[i]); for (let j = 1; j <= i; j++) if (V[i] < V[i - 1]) V[i] = V[i - 1]; }
  tab = m => { if (m <= V[0]) return T[0]; if (m >= V[n - 1]) return T[n - 1] + (m - V[n - 1]) * 0.25; let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (V[mid] < m) lo = mid; else hi = mid; } return lerp(T[lo], T[hi], (m - V[lo]) / Math.max(1e-9, V[hi] - V[lo])); };
  INV.set(f, tab); return tab;
}
/**
 * o: {cx, cy, s, tau, tOf (τ → screen time, for flash ages; default: static), fieldA, trailA (persistent), inc ({from:[x,y], q}),
 *     fb ({R units, I, heat}), rings ([{r units, a}]), rootCluster (bool), clip ([x0,y0,x1,y1]), flashK, gb (shared buffer), noFlush}
 */
function chainPicture(stage, t, o) {
  const c = stage.ctx, {cx, cy, s} = o, tau = o.tau, fA = o.fieldA ?? 1, tA = o.trailA ?? 0.4, fK = o.flashK ?? 1;
  const X = x => cx + s * x, Y = y => cy + s * y, clip = o.clip || [-60, -60, 1140, 1980];
  const vis = (x, y, m = 20) => x > clip[0] - m && x < clip[2] + m && y > clip[1] - m && y < clip[3] + m;
  const ageOf = (ig, i) => { const real = o.tOf ? t - o.tOf(ig) : 1e9; return o.ageCap ? Math.min(real, o.ageCap(ig, i)) : (o.tOf ? real : 30); };
  const rN = Math.max(3.2, 0.145 * s), gb = o.gb || glowBuf(), nA = o.nucA ?? 0.8;
  // nuclei and fragments
  for (let i = 0; i < FIELD.length; i++) {
    const p = FIELD[i], x = X(p.x), y = Y(p.y); if (!vis(x, y)) continue;
    const ig = IGNITE[i], root = i === 0 && o.rootCluster, fall = o.fall ? clamp(o.fall[0] - p.r / o.fall[1]) : 1; if (fall <= 0) continue;
    if (tau < ig || (root && tau < ig + 1.5)) {
      if (root) { const q = tau < ig ? 0 : clamp(ageOf(ig) / 0.75), wob = o.wob || 0; cluster(c, x, y, rN * 1.7 * (1 + 0.04 * wob), q, {fly: 0.9 * smooth(ageOf(ig) / 3.5), rot: -0.79, free: false, a: fA, spin: 0.25 + t * 0.05}); }
      else sprite(c, SPR.nuc, x, y, rN, fA * fall * nA);
      continue;
    }
    const age = ageOf(ig, i), u = smooth(age / 0.7), d = (0.1 + 0.14 * u) * s, ea = fA * fall * (o.emberA ?? 1) * (0.25 + 0.5 * Math.exp(-age / 1.2));
    const dx = Math.cos(p.ph) * d, dy = Math.sin(p.ph) * d, er = Math.max(1.8, rN * 0.55);
    c.save(); c.globalCompositeOperation = 'lighter';
    circle(c, x + dx, y + dy, er, rgba(PAL.ember, ea)); circle(c, x - dx, y - dy, er * 0.85, rgba(PAL.ember, ea * 0.85));
    c.restore();
    if (fK > 0) gb.splat(x, y, Math.max(12, 0.52 * s), FLASH_C, fK * fall * (1.25 * Math.exp(-Math.max(0, age) / 0.16) + 0.16 * Math.exp(-Math.max(0, age) / 3)));
  }
  // incoming neutron (before the first fission)
  if (o.inc && o.inc.q > 0 && o.inc.q < 1) {
    const [fx, fy] = o.inc.from, hx = lerp(fx, 0, o.inc.q), hy = lerp(fy, 0, o.inc.q);
    trail(c, [X(lerp(fx, 0, Math.max(0, o.inc.q - 0.5))), Y(lerp(fy, 0, Math.max(0, o.inc.q - 0.5)))], [X(hx), Y(hy)], 1, Math.max(1.6, s * 0.012));
    neutronDot(c, X(hx), Y(hy), Math.max(3, s * 0.03));
  }
  // neutron flights of the tree (and the lost third neutrons)
  const w = o.trailW ?? clamp(s * 0.016, 1.3, 3.2);
  TREE.forEach((n, k) => {
    const tp = tau - n.tau; if (tp <= 0) return;
    for (const kid of n.kids) {
      const m = TREE[kid], u = clamp(tp / (m.tau - n.tau)), hx = lerp(n.x, m.x, u), hy = lerp(n.y, m.y, u);
      if (!vis(X(hx), Y(hy), 200)) continue;
      const al = u < 1 ? 1 : tA + (1 - tA) * Math.exp(-(tau - m.tau) * 2.2);
      trail(c, [X(n.x), Y(n.y)], [X(hx), Y(hy)], al * fA, w);
      if (u < 1) neutronDot(c, X(hx), Y(hy), clamp(s * 0.028, 2.2, 6.5), fA);
    }
    if (n.stray) {
      const u = clamp(tp / 1.2), hx = lerp(n.x, n.stray[0], u), hy = lerp(n.y, n.stray[1], u), al = (u < 1 ? 0.75 : 0.75 * Math.exp(-(tp - 1.2) * 1.5)) * fA;
      if (al > 0.01) { trail(c, [X(n.x), Y(n.y)], [X(hx), Y(hy)], al * 0.7, w * 0.8); if (u < 1) neutronDot(c, X(hx), Y(hy), clamp(s * 0.022, 2, 5), al); }
    }
  });
  if (o.hot && o.hot.I > 0) fireballGlow(gb, t, cx, cy, o.hot.R * s, {I: o.hot.I, heat: o.hot.heat ?? 0.95, halo: 0.45, seed: 11});
  if (o.fb && o.fb.R > 0) fireballGlow(gb, t, cx, cy, o.fb.R * s, {I: o.fb.I ?? 1, heat: o.fb.heat ?? 1, halo: o.fb.halo ?? 1, seed: 3});
  if (!o.noFlush) gb.flush(stage, {gain: 1.25, bloom: 0.55, alpha: o.glowA ?? fA});
  for (const r of o.rings || []) shockRing(c, cx, cy, r.r * s, r.a);
}
/** a clean shock ring: crisp thin line and a faint compressed band just inside */
function shockRing(c, cx, cy, R, a = 1, w = 2.2) {
  if (a <= 0 || R <= 2) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(cx, cy, Math.max(0, R - 26), cx, cy, R);
  g.addColorStop(0, 'rgba(255,236,210,0)'); g.addColorStop(0.85, `rgba(255,236,210,${0.07 * a})`); g.addColorStop(1, `rgba(255,236,210,${0.16 * a})`);
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  ring(c, cx, cy, R, rgba(PAL.ring, 0.75 * a), w);
  ring(c, cx, cy, R + 3, rgba(PAL.ring, 0.12 * a), 6);
  c.restore();
}
/** the poster / thumbnail picture (static at τ = POSTER_TAU); o.tau / o.fbq / o.rq replay its build-up */
export const posterAge = (ig, i) => (ig >= 5.5 && i < TREE.length ? 0.1 + (6 - Math.min(ig, 6)) * 0.5 + rand(i * 2.7) * 0.35 : 4 + (6 - Math.min(ig, 6)) * 0.4);
function posterPicture(stage, t, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  const fbq = o.fbq ?? 1, rq = o.rq ?? 1;
  withAlpha(stage.ctx, a, () => chainPicture(stage, t, {...POSTER_CAM, tau: o.tau ?? POSTER_TAU, tOf: o.tOf, ageCap: posterAge, fieldA: 1, trailA: 0.8, trailW: 2.1, glowA: a, fall: [1.22, 13], emberA: 0.6,
    fb: {R: FB_R * easeOut(fbq), I: 0.95 * smooth(fbq / 0.6) * (1 + 0.025 * Math.sin(t * 2.1)), heat: 0.8, halo: 1.2},
    rings: RINGS.map((r, k) => ({r: r * lerp(0.94, 1, easeOut(rq)), a: smooth((rq - k * 0.25) / 0.6) * (k ? 0.55 : 0.8)}))}));
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['오늘의 주제', '히로시마 원폭, 에너지가 된 질량은'],
  origin: ['기원 · 이름', '쪼갤 수 없는 것'],
  essence: ['본질 · 질량', '조각이 더 가볍다'],
  chain: ['메커니즘 · 핵분열', '중성자 하나가 핵을 쪼갠다'],
  critical: ['조건 · 덩어리 크기', '작으면 잦아든다'],
  blast: ['현상 · 불덩이', '100만분의 1초 뒤'],
  history: ['역사 · 1945년', '첫 시험, 그리고 두 도시'],
  myth: ['오해 바로잡기', '원자력 발전소도 터질까?'],
  close: ['정리', '같은 연쇄반응, 두 갈래'],
};
function titleList(id, tl) {
  const P = plan(tl), at = r => tl.at(r);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [P.s04 + 0.2, '1938 · 독일', 'Hahn · Strassmann'], [P.s05 + 0.2, '1939 · 해석', 'Meitner · Frisch']];
  if (id === 'essence') return [[-Infinity, ...titles.essence], [at('s07') - 0.6, '본질 · 에너지', '사라진 질량 → 에너지']];
  if (id === 'chain') return [[-Infinity, ...titles.chain], [P.inst, '메커니즘 · 연쇄반응', '1, 2, 4, 8 …'], [at('s10') - 0.6, '메커니즘 · 속도', '80단계, 100만분의 1초 안']];
  if (id === 'critical') return [[-Infinity, ...titles.critical], [at('s12') - 0.6, '조건 · 임계질량', '맞히는 쪽이 많아지는 경계']];
  if (id === 'blast') return [[-Infinity, ...titles.blast], [at('s14') - 0.6, '현상 · 충격파', '열과 방사선']];
  if (id === 'history') return [[-Infinity, ...titles.history], [at('s16') - 0.6, '역사 · 1945년', '그해, 두 도시에서']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                 // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, '오늘의 주제', titles.hook[1], fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, '단 0.7그램', ho, 'rgba(0,0,0,0.95)');
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  if (id === 'close') {
    const a = smooth(ctx.scene.p / 0.04) * fadeOut(t, P.back - 0.35, 0.3);
    if (a > 0) head(stage, ...titles.close, a, a);
    if (t >= P.back - 0.1) posterTitle(stage, t, 0, fadeIn(t, P.back - 0.1, 0.5));
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
const POSTER_Q = {y: 1036, y2: 1206, q: '히로시마 원폭, 에너지가 된 질량은', ans: '단 0.7그램'};
let QSIZE = 0, ASIZE = 0;
/** t = 0 poster text (white question + huge answer in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 790, 80); ASIZE ||= fit(POSTER_Q.ans, 790, 230);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), y2 = lerp(POSTER_Q.y2, 290, q), s2 = lerp(ASIZE, 32, q), tr = lerp(TR, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 900, 0, 1330); g2.addColorStop(0, 'rgba(4,4,5,0)'); g2.addColorStop(0.25, 'rgba(4,4,5,0.74)'); g2.addColorStop(0.8, 'rgba(4,4,5,0.74)'); g2.addColorStop(1, 'rgba(4,4,5,0)');
    c.fillStyle = g2; c.fillRect(0, 900, 1080, 430);
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
// Balance scale (hook and essence)
// =====================================================================================================
const SC = {L: 240, hang: 150, panR: 92};
/** pivot (x, y), angle th (+ = right side down). left/right(px, py): draw contents on the pan top centre. Returns pan centres. */
function balance(stage, x, y, th, o = {}) {
  const c = stage.ctx, T = stage.theme, a = o.a ?? 1, col = rgba(T.ink, 0.62), base = o.base ?? 1230;
  const L = SC.L, ex = Math.cos(th) * L, ey = Math.sin(th) * L, ends = [[x - ex, y - ey], [x + ex, y + ey]];
  const pans = ends.map(([px, py]) => [px, py + SC.hang]);
  withAlpha(c, a, () => {
    // stand
    line(c, [[x, y + 6], [x, base]], rgba(T.ink, 0.35), 4); line(c, [[x - 90, base], [x + 90, base]], rgba(T.ink, 0.35), 4);
    // needle and its small arc scale
    ring(c, x, y, 78, rgba(T.ink, 0.25), 1.5, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    for (const k of [-2, -1, 0, 1, 2]) { const an = -Math.PI / 2 + k * 0.2, r0 = k ? 72 : 66; line(c, [[x + Math.cos(an) * r0, y + Math.sin(an) * r0], [x + Math.cos(an) * 84, y + Math.sin(an) * 84]], rgba(T.ink, k ? 0.3 : 0.6), k ? 1.5 : 2.5); }
    const na = -Math.PI / 2 + th * (o.needleK ?? 1);
    line(c, [[x, y], [x + Math.cos(na) * 76, y + Math.sin(na) * 76]], PAL.answer, 3);
    // beam
    line(c, ends, col, 5); circle(c, x, y, 7, rgba(T.ink, 0.8)); circle(c, x, y, 3, '#111214');
    for (const [px, py] of ends) circle(c, px, py, 4, col);
    // pans: strings and dish
    pans.forEach(([px, py], k) => {
      const [hx, hy] = ends[k];
      line(c, [[hx, hy], [px - SC.panR * 0.86, py]], rgba(T.ink, 0.35), 1.5); line(c, [[hx, hy], [px + SC.panR * 0.86, py]], rgba(T.ink, 0.35), 1.5);
      c.beginPath(); c.ellipse(px, py + 2, SC.panR, 14, 0, 0, Math.PI); c.lineTo(px - SC.panR, py + 2); c.fillStyle = rgba('#2A2B2E', 0.95); c.fill();
      c.beginPath(); c.ellipse(px, py, SC.panR, 12, 0, 0, TAU); c.fillStyle = rgba('#3B3C40', 0.95); c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.ellipse(px, py + 2, SC.panR, 16, 0, 0, Math.PI); c.strokeStyle = rgba(T.ink, 0.4); c.lineWidth = 2; c.stroke();
    });
  });
  if (o.left) withAlpha(c, a, () => o.left(pans[0][0], pans[0][1]));
  if (o.right) withAlpha(c, a, () => o.right(pans[1][0], pans[1][1]));
  return pans;
}
/** 1-won coin (aluminium) lying on a pan */
function coin(c, x, y, a = 1) {
  withAlpha(c, a, () => {
    c.beginPath(); c.ellipse(x, y + 3, 30, 8, 0, 0, TAU); c.fillStyle = '#6F7377'; c.fill();
    const g = c.createLinearGradient(x - 30, y - 8, x + 30, y + 8); g.addColorStop(0, '#E9ECEE'); g.addColorStop(0.5, '#B7BCC0'); g.addColorStop(1, '#D9DDE0');
    c.beginPath(); c.ellipse(x, y, 30, 8, 0, 0, TAU); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(80,84,88,0.9)'; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.ellipse(x, y, 22, 5.6, 0, 0, TAU); c.strokeStyle = 'rgba(120,124,128,0.7)'; c.lineWidth = 1; c.stroke();
  });
}
/** a small amber grain of "mass that became energy" */
function grain(c, x, y, r = 8, a = 1, pulse = 0) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  glow(c, x, y, r * (4 + 2 * pulse), PAL.flash, 0.5 * a); circle(c, x, y, r, rgba(PAL.flash, 0.95 * a)); circle(c, x - r * 0.25, y - r * 0.25, r * 0.45, rgba('#FFF4DC', a));
  c.restore();
}

// =====================================================================================================
// Critical lump (Monte-Carlo neutrons in an abstract sphere)
// =====================================================================================================
const LUMP = {cx: 540, cy: 618, px: 108};
function lumpPicture(stage, t, P, o = {}) {
  const c = stage.ctx, T = stage.theme, {cx, cy, px} = o.cam || LUMP, a = o.a ?? 1, x = o.x ?? P.xAt(t), R = x * px;
  const gb = glowBuf(), heat = o.heat ?? 0;
  withAlpha(c, a, () => {
    const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R);
    g.addColorStop(0, 'rgba(120,108,92,0.42)'); g.addColorStop(0.7, 'rgba(70,64,56,0.38)'); g.addColorStop(1, 'rgba(40,37,33,0.55)');
    circle(c, cx, cy, R, g);
    ring(c, cx, cy, R, rgba(T.ink, 0.55), 1.6);
    ring(c, cx, cy, R * 0.93, rgba(T.ink, 0.12), 1, Math.PI * 1.05, Math.PI * 1.45);
  });
  const S = (p) => [cx + p[0] * px, cy + p[1] * px], live = P.MC.n.filter(n => t >= n.tb && t <= n.te + 0.9), step = Math.max(1, Math.ceil(live.length / 480));
  for (let j = 0; j < live.length; j += step) {
    const n = live[j], u = clamp((t - n.tb) / (n.te - n.tb)), A = S(n.p), E = S(n.end), hx = lerp(A[0], E[0], u), hy = lerp(A[1], E[1], u);
    const fade = t <= n.te ? 1 : Math.exp(-(t - n.te) / 0.25), outside = n.esc && Math.hypot(hx - cx, hy - cy) > R;
    withAlpha(c, a, () => trail(c, A, [hx, hy], (outside ? 0.5 : 0.85) * fade, 1.6, n.esc ? PAL.esc : PAL.n));
    if (u < 1) withAlpha(c, a, () => neutronDot(c, hx, hy, 3, outside ? 0.55 : 1));
  }
  const fl = P.MC.sites.filter(f => t >= f.tf && t - f.tf < 1.5), stepS = Math.max(1, Math.ceil(fl.length / 320));
  for (let j = 0; j < fl.length; j += stepS) { const f = fl[j], age = t - f.tf, [sx, sy] = S(f.p); gb.splat(sx, sy, 16, FLASH_C, a * (1.4 * Math.exp(-age / 0.14) + 0.12 * Math.exp(-age / 0.8))); }
  if (heat > 0) fireballGlow(gb, t, cx, cy, R, {I: heat, heat: 1, halo: 0.6, seed: 5});
  gb.flush(stage, {gain: 1.2, bloom: 0.5, alpha: 1});
  return R;
}

// =====================================================================================================
// Map (history): Natural Earth 1:110m coastline (public domain), Korean peninsula and western Japan
// =====================================================================================================
const KOREA = [[130.94, 42.55], [130.78, 42.22], [130.4, 42.28], [129.97, 41.94], [129.67, 41.6], [129.7, 40.88], [129.19, 40.66], [129.01, 40.48], [128.63, 40.19], [127.97, 40.03], [127.53, 39.76], [127.5, 39.32], [127.39, 39.21], [127.79, 39.05], [128.35, 38.61], [129.21, 37.43], [129.46, 36.78], [129.47, 35.63], [129.09, 35.08], [128.18, 34.89], [127.39, 34.48], [126.49, 34.39], [126.37, 34.93], [126.56, 35.68], [126.12, 36.73], [126.86, 36.89], [126.18, 37.75], [125.69, 37.94], [125.57, 37.75], [125.28, 37.67], [125.24, 37.86], [124.98, 37.95], [124.71, 38.11], [124.99, 38.55], [125.22, 38.67], [125.13, 38.85], [125.39, 39.39], [125.32, 39.55], [124.74, 39.66], [124.26, 39.93], [122.87, 39.64], [122.13, 39.17]];
const HONSHU = [[140.98, 37.14], [140.6, 36.34], [140.77, 35.84], [140.25, 35.14], [138.97, 34.67], [137.22, 34.61], [135.79, 33.46], [135.12, 33.85], [135.08, 34.6], [133.34, 34.38], [132.16, 33.9], [130.99, 33.89], [132.0, 33.15], [131.33, 31.45], [130.69, 31.03], [130.2, 31.42], [130.45, 32.32], [129.82, 32.61], [129.41, 33.3], [130.36, 33.6], [130.88, 34.23], [131.89, 34.75], [132.62, 35.43], [134.61, 35.73], [135.68, 35.53], [136.72, 37.3], [137.39, 36.83], [138.86, 37.83], [139.43, 38.22], [140.05, 39.44], [139.88, 40.56], [140.31, 41.2], [141.37, 41.38], [141.92, 39.99], [141.88, 39.18], [140.96, 38.17], [140.98, 37.14]];
const SHIKOKU = [[134.64, 34.15], [134.77, 33.81], [134.2, 33.2], [133.79, 33.52], [133.28, 33.29], [133.02, 32.7], [132.36, 32.99], [132.37, 33.46], [132.93, 34.06], [133.49, 33.94], [133.91, 34.36], [134.64, 34.15]];
const MAPR = [150, 548, 930, 1176];
export const geo = (lon, lat) => [540 + (lon - 133) * 42.1, 860 - (lat - 35.5) * 52];
export const CITIES = {hiro: {lon: 132.46, lat: 34.39, name: '히로시마', date: '8.6'}, naga: {lon: 129.87, lat: 32.75, name: '나가사키', date: '8.9'}};
export const CITY_LIGHTS = Object.fromEntries(Object.entries(CITIES).map(([k, cty], j) => {
  const R = rng(31 + j), [x, y] = geo(cty.lon, cty.lat), pts = [];
  for (let i = 0; i < 26; i++) { const r = 24 * Math.sqrt(R()), an = R() * TAU; pts.push({x: x + Math.cos(an) * r, y: y + Math.sin(an) * r * 0.8, off: R(), b: 0.5 + 0.5 * R()}); }
  return [k, pts];
}));
function mapLand(c, T, a, korea = 0) {
  withAlpha(c, a, () => clipRect(c, MAPR[0], MAPR[1], MAPR[2] - MAPR[0], MAPR[3] - MAPR[1], 12, () => {
    rect(c, MAPR[0], MAPR[1], MAPR[2] - MAPR[0], MAPR[3] - MAPR[1], 12, rgba('#0B0C0E', 0.9));
    for (let lon = 125; lon <= 141; lon += 4) line(c, [geo(lon, 29), geo(lon, 43)], rgba(T.ink, 0.05), 1);
    for (let lat = 31; lat <= 41; lat += 4) line(c, [geo(122, lat), geo(144, lat)], rgba(T.ink, 0.05), 1);
    const kp = KOREA.map(p => geo(...p)); kp.push(geo(121, 39.17), geo(121, 43.5), geo(131, 43.5));
    poly(c, kp, PAL.land, rgba(PAL.landEdge, 0.9), 1.5);
    if (korea > 0) poly(c, KOREA.slice(1, 40).map(p => geo(...p)).concat([[125.3, 40.45], [126.7, 41.6], [128.1, 41.95], [129.2, 42.25], [130.4, 42.5]].map(p => geo(...p))), rgba('#3A362F', 0.6 * korea), rgba(T.ink, 0.85 * korea), 2.2);
    for (const ring0 of [HONSHU, SHIKOKU]) poly(c, ring0.map(p => geo(...p)), PAL.land, rgba(PAL.landEdge, 0.9), 1.5);
  }));
  withAlpha(c, a, () => rect(c, MAPR[0], MAPR[1], MAPR[2] - MAPR[0], MAPR[3] - MAPR[1], 12, null, rgba(T.border, 1), 1.5));
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/atomic-bomb/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  const mc = P.MC.sites.reduce((a, q) => a + q.w * q.tf, 0) / 1000;
  return `${tl.duration.toFixed(3)}/${TREE.length}:${FIELD.length}/${X_CRIT.toFixed(4)}/${mc.toFixed(2)}/${P.cG.map(x => x.toFixed(3)).join(',')}/${P.tsep.toFixed(3)}/${(REACTOR.logN[300] * 1e4).toFixed(2)}`;
}
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  chain(stage, t, p, ctx) { chainScene(stage, t, ctx); },
  critical(stage, t, p, ctx) { criticalScene(stage, t, ctx); },
  blast(stage, t, p, ctx) { blastScene(stage, t, ctx); },
  history(stage, t, p, ctx) { historyScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};
const leaderTo = (c, T, a, b, al = 1) => withAlpha(c, al, () => { line(c, [a, b], rgba(T.ink, 0.55), 1.5); circle(c, b[0], b[1], 3, rgba(T.ink, 0.8)); });

// ------------------------------------------------------------------ hook: poster → one nucleus splits → chain → fireball; s02 the scale
const HK = {piv: [540, 820], fb: [540, 500]};
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.3, 0.3);
  if (t < P.hX[1]) posterPicture(stage, t, {a: 1 - smooth((t - P.hX[0]) / (P.hX[1] - P.hX[0]))});
  if (t < P.hX[0]) return;
  const a0 = smooth((t - P.hX[0]) / (P.hX[1] - P.hX[0])) * ef, q2 = easeInOut((t - P.shrink[0]) / (P.shrink[1] - P.shrink[0]));
  const s = lerp(P.hCam(t), 24, q2), cy = lerp(640, HK.fb[1], q2), tau = t < P.hG[0] ? -0.01 : Math.min(POSTER_TAU, P.hTau(t));
  const fbq = clamp((t - P.hFB[0]) / (P.hFB[1] - P.hFB[0])), wob = t > P.hIn[1] && t < P.hG[0] ? Math.sin((t - P.hIn[1]) * 45) : 0;
  chainPicture(stage, t, {cx: 540, cy, s, tau, tOf: invOf(P.hTau, 1.5, 9), fieldA: a0 * lerp(1, 0.45, q2), glowA: a0, trailA: lerp(0.5, 0.35, q2), rootCluster: s > 95, wob, fall: [lerp(1.6, 1.5, q2), lerp(16, 6.5, q2)],
    inc: {from: [-3.4, -2.3], q: (t - P.hIn[0]) / (P.hIn[1] - P.hIn[0])},
    fb: fbq > 0 ? {R: FB_R * easeOut(fbq), I: 1.05 * smooth(fbq / 0.5) * (1 + 0.025 * Math.sin(t * 2.1)), heat: 0.85} : null});
  captionShade(c, ef * fadeIn(t, 0.95, 0.4) * (1 - q2 * 0.5)); headShade(c, a0 * (1 - q2));
  if (t < P.s02) return;
  // s02: 1945 Hiroshima, its energy (TNT) and the mass that became energy on a balance with a 1-won coin
  withAlpha(c, ef, () => {
    const [fx, fy] = HK.fb;
    const ay = fadeIn(t, P.y1945, 0.4); if (ay > 0) withAlpha(c, ay, () => { stage.text('1945년 8월 6일', 270, 478, {size: 26, weight: 500, color: T.muted, align: 'center'}); stage.text('히로시마', 270, 522, {role: 'display', size: 38, weight: 700, color: T.ink, align: 'center'}); });
    const at2 = fadeIn(t, P.tnt, 0.4); if (at2 > 0) withAlpha(c, at2, () => { stage.text('에너지 (TNT로 환산)', 810, 478, {size: 24, weight: 500, color: T.muted, align: 'center'}); stage.text('약 1만 5천 톤', 810, 522, {role: 'display', size: 38, weight: 700, color: PAL.answer, align: 'center'}); });
    const th = P.hookScale(t), sa = fadeIn(t, P.stream[0] - 0.6, 0.5);
    const pans = balance(stage, HK.piv[0], HK.piv[1], th, {a: sa, base: 1210,
      left: (x, y) => { const q = clamp((t - P.coin[0]) / (P.coin[1] - P.coin[0])); if (q > 0) coin(c, x, lerp(y - 300, y - 4, q * q)); },
      right: (x, y) => { if (t >= P.grain) grain(c, x, y - 8, 8, 1, Math.exp(-(t - P.grain) / 0.4)); }});
    // the energy, counted as mass, flows from the fireball into the right pan
    if (t > P.stream[0] && t < P.grain + 0.2) {
      const [x1, y1] = [pans[1][0], pans[1][1] - 8], x0 = fx + 40, y0 = fy + 45, cxp = (x0 + x1) / 2 + 120, cyp = (y0 + y1) / 2 - 60;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 18; k++) { const u = (t - P.stream[0] - k * 0.035) / 0.55; if (u <= 0 || u >= 1) continue; const v = easeIn(u), x = (1 - v) ** 2 * x0 + 2 * (1 - v) * v * cxp + v * v * x1, y = (1 - v) ** 2 * y0 + 2 * (1 - v) * v * cyp + v * v * y1; glow(c, x, y, 14, PAL.flash, 0.45); circle(c, x, y, 2.6, rgba('#FFF1D6', 0.9)); }
      c.restore();
    }
    const al = fadeIn(t, P.coin[1] - 0.1, 0.4), ar = fadeIn(t, P.grain - 0.1, 0.4);
    if (ar > 0) withAlpha(c, ar, () => { stage.text('에너지가 된 질량', 780, 1112, {size: 26, weight: 700, color: T.ink, align: 'center'}); stage.text('약 0.7 g', 780, 1156, {role: 'display', size: 36, weight: 700, color: PAL.answer, align: 'center'}); });
    if (al > 0) withAlpha(c, al, () => { stage.text('1원 동전', 300, 1112, {size: 26, weight: 700, color: T.ink, align: 'center'}); stage.text('0.729 g', 300, 1156, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'}); });
    tag(stage, '거의 같은 무게', 540, 1268, {size: 28, color: PAL.answer, a: fadeIn(t, P.same, 0.4), plateA: 0.8});
  });
}

// ------------------------------------------------------------------ origin: atomos → 1938 barium → 1939 fission (with cell division)
const ORG = {u: [350, 640], ba: [790, 640], uR: 112, cell: [790, 640]};
/** Cassini oval outline (cell dividing): foci ±a on the axis, constant b; rotated by rot (0 = vertical split) */
function cassini(a, b, n = 96) {
  const loops = [];
  if (b >= a * 1.0005) { const pts = []; for (let i = 0; i <= n; i++) { const th = i / n * TAU, s2 = Math.sin(2 * th), r2 = a * a * Math.cos(2 * th) + Math.sqrt(Math.max(0, b ** 4 - a ** 4 * s2 * s2)); pts.push([Math.sqrt(Math.max(0, r2)) * Math.cos(th), Math.sqrt(Math.max(0, r2)) * Math.sin(th)]); } loops.push(pts); }
  else for (const sg of [1, -1]) { const tm = 0.5 * Math.asin(Math.min(1, b * b / (a * a))) * 0.9999, pts = [];
    for (let i = 0; i <= n; i++) { const th = -tm + i / n * 2 * tm, s2 = Math.sin(2 * th), r = Math.sqrt(Math.max(0, a * a * Math.cos(2 * th) + Math.sqrt(Math.max(0, b ** 4 - a ** 4 * s2 * s2)))); pts.push([sg * r * Math.cos(th), r * Math.sin(th)]); }
    for (let i = n; i >= 0; i--) { const th = -tm + i / n * 2 * tm, s2 = Math.sin(2 * th), r = Math.sqrt(Math.max(0, a * a * Math.cos(2 * th) - Math.sqrt(Math.max(0, b ** 4 - a ** 4 * s2 * s2)))); pts.push([sg * r * Math.cos(th), r * Math.sin(th)]); }
    loops.push(pts); }
  return loops;
}
function cellDivide(c, x, y, S, q, a = 1) {
  // q 0 → 1: one cell → two (Cassini ovals, foci ±af, b = 1; pinch at af = 1). The scale grows a little so each daughter
  // keeps roughly half the area.
  const e = easeInOut(q), af = lerp(0.3, 1.08, e), k = S * 0.6 * lerp(1, 1.32, e), loops = cassini(af, 1);
  withAlpha(c, a, () => {
    for (const L of loops) { const pts = L.map(([u, v]) => [x + v * k, y + u * k]); poly(c, pts, rgba(PAL.cell, 0.12), rgba(PAL.cell, 0.85), 2.2); }
    const cn = af < 1 ? 0.62 * af * smooth((q - 0.1) / 0.5) : (Math.sqrt(af * af - 1) + Math.sqrt(af * af + 1)) / 2, d = cn * k;
    for (const sg of [-1, 1]) { const yy = y + sg * d; circle(c, x, yy, S * 0.1, rgba(PAL.cell, 0.35)); ring(c, x, yy, S * 0.1, rgba(PAL.cell, 0.8), 1.5); if (d < 2) break; }
  });
}
function originScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    // s03 — the atom, a cut that does not go through, atomos and 原子
    const zq = smooth((t - P.s04) / 0.9), aa = fadeIn(t, P.atom, 0.5) * (1 - zq);
    if (aa > 0) withAlpha(c, aa, () => {
      const R = 150 * (1 + 2.2 * zq), [x, y] = [540, 620];
      const g = c.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.05, x, y, R); g.addColorStop(0, 'rgba(190,200,210,0.30)'); g.addColorStop(0.75, 'rgba(110,120,132,0.18)'); g.addColorStop(1, 'rgba(60,66,74,0.30)');
      circle(c, x, y, R, g); ring(c, x, y, R, rgba(T.ink, 0.45), 1.6);
      for (let k = 0; k < 3; k++) { c.save(); c.translate(x, y); c.rotate(k * Math.PI / 3 + t * 0.15); c.scale(1, 0.32); ring(c, 0, 0, R * 0.82, rgba('#9FB4C8', 0.22), 3); c.restore(); }
      glow(c, x, y, 26, PAL.flash, 0.5); circle(c, x, y, 5, rgba(PAL.flash, 0.9));
      const qc = clamp((t - P.cut[0]) / 0.5), fc = fadeOut(t, P.cut[1], 0.5);
      if (qc > 0 && fc > 0) withAlpha(c, fc, () => { const yb = lerp(400, y - R - 6, easeOut(qc)); line(c, [[x, 380], [x, yb]], rgba(T.ink, 0.9), 2.5); poly(c, [[x - 9, yb - 26], [x + 9, yb - 26], [x, yb]], rgba(T.ink, 0.9)); if (qc >= 1) line(c, [[x, y - R], [x, y + R]], rgba(T.ink, 0.35), 2, {dash: [8, 10]}); });
    });
    const at = fadeIn(t, P.atomos, 0.45) * (1 - zq);
    if (at > 0) withAlpha(c, at, () => {
      stage.text('atomos', 540, 900, {role: 'display', size: 92, weight: 700, color: T.ink, align: 'center'});
      stage.text('a- (아니) + tomos (자르다)', 540, 978, {size: 30, weight: 500, color: T.muted, align: 'center'});
      stage.text('→ 쪼갤 수 없는 것', 540, 1036, {role: 'display', size: 38, weight: 700, color: PAL.answer, align: 'center'});
    });
    const ah = fadeIn(t, P.hanja, 0.4) * (1 - zq);
    if (ah > 0) withAlpha(c, ah, () => { panel(c, T, 250, 1110, 580, 120, 0.85); stage.text('原子', 350, 1170, {size: 56, weight: 700, color: T.ink, align: 'center'}); stage.text('原 근원 + 子 작은 알갱이', 640, 1152, {size: 28, weight: 700, color: T.ink, align: 'center'}); stage.text('물질의 근원이 되는 알갱이', 640, 1196, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
    // s04 — zoom into the atom: the uranium nucleus; a neutron; barium appears
    const ua = fadeIn(t, P.s04 + 0.3, 0.6);
    if (ua > 0) {
      const sp = smooth((t - P.split5[0]) / (P.split5[1] - P.split5[0])), fly = 0.55 * smooth((t - P.split5[0] - 0.5) / 1.6);
      const nq = clamp((t - P.nFly[0]) / (P.nFly[1] - P.nFly[0])), wob = nq >= 1 ? Math.exp(-(t - P.nFly[1]) * 2) * Math.sin((t - P.nFly[1]) * 30) : 0;
      const ux = lerp(540, ORG.u[0], smooth((t - P.s04 - 0.9) / 0.8));
      withAlpha(c, ua, () => cluster(c, ux, ORG.u[1], ORG.uR * (1 + 0.03 * wob), sp, {fly, spin: 0.3 + t * 0.06, rot: 0, free: false}));
      if (nq > 0 && nq < 1) { const hx = lerp(150, ux - ORG.uR * 0.9, nq), hy = lerp(430, ORG.u[1] - 40, nq); trail(c, [lerp(150, hx, 0.3), lerp(430, hy, 0.3)], [hx, hy], 1, 2); neutronDot(c, hx, hy, 5); }
      if (nq > 0 && t < P.s05) tag(stage, '중성자', 230, 420, {size: 26, color: PAL.n, a: fadeIn(t, P.nFly[0], 0.3) * fadeOut(t, P.nFly[1] + 0.6, 0.4), plate: false});
      if (nq >= 1) { const g = glowBuf(); g.splat(ux - ORG.uR * 0.9, ORG.u[1] - 40, 60, FLASH_C, 1.2 * Math.exp(-(t - P.nFly[1]) / 0.25)); g.flush(stage, {bloom: 0.4}); }
      tag(stage, '우라늄 U', ux, ORG.u[1] + ORG.uR + 46, {size: 28, a: fadeIn(t, P.uLabel, 0.4) * (1 - sp), plate: false});
      const ba = fadeIn(t, P.ba, 0.5) * fadeOut(t, P.s05 + 0.2, 0.5);
      if (ba > 0) withAlpha(c, ba, () => {
        arrow(c, [ux + ORG.uR + 26, ORG.u[1]], [ORG.ba[0] - 104, ORG.ba[1]], rgba(T.ink, 0.7), 3);
        const list = BA_PACK.map((q, i) => [q[0], q[1], q[2], i % 5 < 2]).sort((m, n) => m[2] - n[2]);
        for (const [X, Y, Z, isP] of list) if (Z > -0.5) sprite(c, isP ? SPR.proton : SPR.bound, ORG.ba[0] + X * ORG.uR, ORG.ba[1] + Y * ORG.uR, ORG.uR * NUC.r * 1.12);
        stage.text('바륨 Ba', ORG.ba[0], ORG.u[1] + ORG.uR + 46, {size: 28, weight: 700, color: T.ink, align: 'center'});
        // relative atomic mass bars
        const bq = smooth((t - P.ba - 0.3) / 0.8);
        stage.text('원자량', 160, 880, {size: 24, weight: 700, color: T.muted});
        rect(c, 300, 900, 520 * bq, 26, 5, rgba(T.ink, 0.55)); stage.text('우라늄 약 238', 300, 950, {size: 26, weight: 700, color: T.ink});
        rect(c, 300, 990, 520 * 137 / 238 * bq, 26, 5, rgba(PAL.answer, 0.75)); stage.text('바륨 약 137 · 훨씬 가벼움', 300, 1040, {size: 26, weight: 700, color: PAL.answer});
      });
      // s05: the split and the cell
      if (t > P.s05) {
        const qa = fadeIn(t, P.split5[0] + 0.6, 0.4);
        tag(stage, '바륨', ux + 150, ORG.u[1] - 150, {size: 26, a: qa, plate: false}); tag(stage, '크립톤', ux + 150, ORG.u[1] + 150, {size: 26, a: qa, plate: false});
        stage.text('원자핵이 둘로', ux, 920, {size: 28, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.split5[0] + 0.3, 0.4)});
        const ca = fadeIn(t, P.cell5[0] - 0.8, 0.5);
        if (ca > 0) { cellDivide(c, ORG.cell[0], ORG.cell[1], 220, clamp((t - P.cell5[0]) / (P.cell5[1] - P.cell5[0])), ca); stage.text('세포가 둘로', ORG.cell[0], 920, {size: 28, weight: 700, color: PAL.cell, align: 'center', alpha: fadeIn(t, P.cell5[0] + 0.3, 0.4)}); }
        const fa = fadeIn(t, P.fission5, 0.45);
        if (fa > 0) withAlpha(c, fa, () => {
          line(c, [[200, 975], [880, 975]], rgba(T.border, 1), 1.5);
          stage.text('fission · 핵분열', 540, 1050, {role: 'display', size: 64, weight: 700, color: PAL.answer, align: 'center'});
          stage.text('세포 분열에 빗댄 이름', 540, 1120, {size: 28, weight: 500, color: T.muted, align: 'center'});
        });
      }
    }
  });
}

// ------------------------------------------------------------------ essence: the balance (before vs after) → E = mc²
const ES = {piv: [540, 860]};
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), s07 = ctx.tl.at('s07');
  withAlpha(c, sf, () => {
    const dim = lerp(1, 0.4, fadeIn(t, P.gone7, 0.6)), th = P.essScale(t), dq = clamp((t - P.drop6[0]) / (P.drop6[1] - P.drop6[0]));
    const pans = balance(stage, ES.piv[0], ES.piv[1], th, {a: dim, base: 1240,
      left: (x, y) => { cluster(c, x - 8, y - 46, 44, 0, {spin: 0.3 + t * 0.06}); neutronDot(c, x + 62, y - 16, 5); },
      right: (x, y) => { if (dq <= 0) return; const yy = y - 300 * (1 - dq * dq); cluster(c, x - 36, yy - 38, 44, 1, {only: 0, center: true, rot: Math.PI / 2, spin: 0.2}); cluster(c, x + 40, yy - 30, 44, 1, {only: 1, center: true, rot: Math.PI / 2, spin: 0.2}); for (const [dx, dy] of [[-80, -12], [78, -14], [6, -84]]) neutronDot(c, x + dx, yy + dy, 5); }});
    withAlpha(c, dim, () => {
      stage.text('처음', 300, 1112, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text('우라늄 235 + 중성자', 300, 1148, {size: 26, weight: 700, color: T.ink, align: 'center'});
      const ar = fadeIn(t, P.drop6[0], 0.4); if (ar > 0) withAlpha(c, ar, () => { stage.text('쪼개진 뒤', 780, 1112, {size: 24, weight: 700, color: T.muted, align: 'center'}); stage.text('바륨 + 크립톤 + 중성자 3', 780, 1148, {size: 26, weight: 700, color: T.ink, align: 'center'}); });
      const am = fadeIn(t, P.read6, 0.4); if (am > 0) withAlpha(c, am, () => { stage.text(`${M_BEFORE.toFixed(2)} u`, 300, 1194, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'}); stage.text(`${M_AFTER.toFixed(2)} u`, 780, 1194, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center'}); });
      tag(stage, `차이 ${DM.toFixed(2)} u ≈ 1000분의 1`, 540, 1290, {size: 30, color: PAL.answer, a: fadeIn(t, P.thou6, 0.4), plateA: 0.8});
      tag(stage, 'u = 원자 질량 단위', 540, 1336 - 10, {size: 24, color: T.muted, a: fadeIn(t, P.read6, 0.4) * fadeOut(t, P.thou6 - 0.2, 0.3), plate: false});
      tag(stage, '기울기 과장', 680, 752, {size: 24, color: T.muted, a: fadeIn(t, P.drop6[1] + 0.4, 0.4), plate: false});
    });
    // s07 — the missing mass rises and becomes energy: m × c × c = E
    if (t > P.gone7 - 0.1) {
      const rx = pans[1][0], ry = pans[1][1] - 70, mq = smooth((t - P.gone7 - 0.4) / 0.9), gx = lerp(rx, 290, mq), gy = lerp(ry, 470, mq) - Math.sin(mq * Math.PI) * 60;
      const fade = 1 - fadeIn(t, P.formula, 0.4);
      if (fade > 0) withAlpha(c, fade, () => {
        grain(c, gx, gy, 9, fadeIn(t, P.gone7, 0.3), Math.exp(-(t - P.gone7) / 0.5));
        tag(stage, '사라진 질량 m', gx, gy + 52, {size: 26, color: PAL.answer, a: fadeIn(t, P.gone7 + 0.2, 0.4), plate: false});
        const c1 = fadeIn(t, P.c1, 0.3), c2 = fadeIn(t, P.c2, 0.3), ee = fadeIn(t, P.eFlash, 0.25);
        if (c1 > 0) stage.text('× c', 450, 472, {role: 'display', size: 60, weight: 700, color: PAL.n, align: 'center', alpha: c1});
        if (c2 > 0) stage.text('× c', 600, 472, {role: 'display', size: 60, weight: 700, color: PAL.n, align: 'center', alpha: c2});
        if (c1 > 0) stage.text('c = 빛의 속도 · 초속 30만 km', 525, 545, {size: 26, weight: 500, color: T.muted, align: 'center', alpha: c1});
        for (const [t0, y0] of [[P.c1, 440], [P.c2, 500]]) { const u = (t - t0) / 0.35; if (u > 0 && u < 1) trail(c, [lerp(140, 940, Math.max(0, u - 0.3)), y0], [lerp(140, 940, u), y0], 1, 3); }
        if (ee > 0) { stage.text('=', 710, 472, {role: 'display', size: 60, weight: 700, color: T.ink, align: 'center', alpha: ee}); const g = glowBuf(); g.splat(820, 470, 150, FLASH_C, ee * (0.7 + 1.6 * Math.exp(-(t - P.eFlash) / 0.35))); g.flush(stage, {bloom: 0.6}); stage.text('E', 820, 474, {role: 'display', size: 76, weight: 700, color: '#1A1208', align: 'center', alpha: ee}); stage.text('에너지', 820, 545, {size: 26, weight: 700, color: PAL.answer, align: 'center', alpha: ee}); }
      });
      const fq = fadeIn(t, P.formula, 0.45);
      if (fq > 0) withAlpha(c, fq, () => {
        const g = glowBuf(); g.splat(540, 470, 260, FLASH_C, 0.35); g.flush(stage, {bloom: 0.5});
        stage.text('E = mc²', 540, 470, {role: 'display', size: 120, weight: 700, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.6)', shadowBlur: 16});
        stage.text('Einstein', 540, 566, {size: 30, weight: 500, color: T.muted, align: 'center'});
        const tq = fadeIn(t, P.tnt7, 0.45);
        if (tq > 0) withAlpha(c, tq, () => { stage.text('0.7 g × c²  ≈  TNT 약 1만 5천 톤', 540, 640, {role: 'display', size: 36, weight: 700, color: PAL.answer, align: 'center'}); stage.text('히로시마 원폭의 에너지', 540, 690, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
      });
    }
  });
}

// ------------------------------------------------------------------ chain: three-tier instrument (stage · counters · log graph)
const CG = {x0: 240, x1: 905, y0: 1302, y1: 1162};
const cgX = g => lerp(CG.x0, CG.x1, g / N_GEN), cgY = L => lerp(CG.y0, CG.y1, L / 24);
function chainScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = fadeIn(t, ctx.scene.start, 0.3) * fadeOut(t, ctx.scene.end - 0.35, 0.3);
  const s = P.cCam(t), cy = P.cCy(t), tau = t < P.cG[0] ? -0.01 : P.cTau(t), g = P.gC(t), inst = fadeIn(t, P.inst, 0.6);
  const yb = lerp(1330, 968, inst), wob = t > P.cIn[1] && t < P.cG[0] ? Math.sin((t - P.cIn[1]) * 45) : 0;
  const late = smooth((t - 79) / 7.5);
  withAlpha(c, sf, () => clipRect(c, 0, 318, 1080, yb - 318, 0, () => chainPicture(stage, t, {cx: 540, cy, s, tau, tOf: invOf(P.cTau, P.cG[0] - 1, ctx.scene.end + 1), clip: [0, 318, 1080, yb],
    fieldA: sf, glowA: sf, trailA: 0.45, rootCluster: s > 95, wob, inc: {from: [-2.6, -1.9], q: (t - P.cIn[0]) / (P.cIn[1] - P.cIn[0])},
    flashK: lerp(1, 0.6, late), fall: [lerp(40, 7.2, smooth((t - 78.6) / 1.6)), 1.4], hot: {R: 9.9, I: 1.25 * smooth((t - 80.2) / 5.8)}})));
  { const g = c.createLinearGradient(0, yb - 70, 0, yb); g.addColorStop(0, 'rgba(8,8,9,0)'); g.addColorStop(1, `rgba(8,8,9,${sf})`); c.fillStyle = g; c.fillRect(0, yb - 70, 1080, 70); }
  const lb = fadeIn(t, 78.8, 1.2) * sf; if (lb > 0) withAlpha(c, lb, () => { ring(c, 540, cy, 9.9 * s, rgba(T.ink, 0.4), 1.6); tag(stage, '덩어리 하나', 540 + 9.9 * s + 18, cy, {size: 24, color: T.muted, plate: false, align: 'left'}); });
  withAlpha(c, sf, () => {
    // s08 labels
    const rx = 540, ry = cy;
    const ul = fadeIn(t, P.uLbl8, 0.35) * fadeOut(t, P.cG[0] + 0.4, 0.4);
    if (ul > 0) { leaderTo(c, T, [700, 600], [rx + 34, ry - 34], ul); tag(stage, '우라늄 235 원자핵', 760, 584, {size: 28, a: ul, plateA: 0.75}); }
    tag(stage, '중성자', 300, 470, {size: 28, color: PAL.n, a: fadeIn(t, P.nLbl8, 0.3) * fadeOut(t, P.cG[0] + 0.3, 0.4), plateA: 0.6});
    const fl = fadeIn(t, P.cG[0] + 0.6, 0.4) * fadeOut(t, P.inst - 0.3, 0.4);
    if (fl > 0) { leaderTo(c, T, [780, 960], [rx + 80, ry + 80], fl); tag(stage, '쪼개진 조각 둘', 800, 978, {size: 26, a: fl, plateA: 0.75}); }
    const nl = fadeIn(t, P.twothree, 0.35) * fadeOut(t, P.inst - 0.3, 0.4);
    tag(stage, '새 중성자 2~3개', 290, 1010, {size: 28, color: PAL.n, a: nl, plateA: 0.75});
    // instruments
    if (inst <= 0) return;
    withAlpha(c, inst, () => {
      tag(stage, '설명 모형 · 단계마다 2배', 300, 350, {size: 24, color: T.muted, plateA: 0.7});
      tag(stage, '시간 압축', 870, 350, {size: 24, color: T.muted, a: fadeIn(t, P.cG[3], 0.4), plateA: 0.7});
      tag(stage, '한 단계 ≈ 1억분의 1초', 540, 940, {size: 28, color: PAL.answer, a: fadeIn(t, P.e8, 0.35) * fadeOut(t, P.eighty + 1.5, 0.5), plateA: 0.85});
      const cnt = P.count.reduce((a, x) => a + Math.exp(-Math.max(0, t - x) / 0.25) * (t >= x ? 1 : 0), 0);
      tile(stage, 150, 985, 200, '단계', `${g}`, {hi: fadeIn(t, P.eighty, 0.3) * fadeOut(t, P.c80 + 0.8, 0.5)});
      tile(stage, 365, 985, 270, '이번 단계 분열 수', g ? fmtCount(perGen(g)) : '0', {color: PAL.flash, hi: Math.min(1, cnt)});
      tile(stage, 650, 985, 280, '실제로 흐른 시간', `${(g * GEN_S).toFixed(8)}초`, {size: 34, hi: fadeIn(t, P.e8, 0.3) * fadeOut(t, P.eighty + 1.5, 0.5)});
      // graph: fissions per generation, log scale
      panel(c, T, 150, 1104, 780, 222, 0.82);
      stage.text('단계마다 쪼개지는 핵의 수 · 로그 눈금', 172, 1132, {size: 24, weight: 700, color: T.muted});
      line(c, [[CG.x0, CG.y1 - 8], [CG.x0, CG.y0], [CG.x1, CG.y0]], rgba(T.muted, 0.7), 2);
      for (const [L, s2] of [[0, '1'], [12, '10¹²'], [24, '10²⁴']]) { stage.text(s2, CG.x0 - 12, cgY(L), {size: 24, weight: 500, color: T.muted, align: 'right'}); line(c, [[CG.x0, cgY(L)], [CG.x1, cgY(L)]], rgba(T.border, 0.6), 1); }
      stage.text('80단계', CG.x1, CG.y0 - 18, {size: 24, weight: 500, color: T.muted, align: 'right'});
      if (g > 0) {
        const pts = []; for (let k = 1; k <= g; k++) pts.push([cgX(k), cgY(Math.log10(perGen(k)))]);
        if (pts.length > 1) line(c, pts, PAL.flash, 3.5);
        for (let k = 1; k <= Math.min(g, 8); k++) circle(c, cgX(k), cgY(Math.log10(perGen(k))), 4.5, PAL.flash);
        const e = pts.at(-1); c.save(); c.globalCompositeOperation = 'lighter'; glow(c, e[0], e[1], 26, PAL.flash, 0.6); c.restore(); circle(c, e[0], e[1], 6, '#FFF1D6');
        P.count.forEach((x, k) => { const q = (t - x) / 0.6; if (q > 0 && q < 1) ring(c, cgX(k + 1), cgY(Math.log10(perGen(k + 1))), 8 + 20 * q, rgba(PAL.flash, 1 - q), 2.5); });
      }
      const ao = fadeIn(t, P.atonce, 0.4); if (ao > 0) tag(stage, '모두 합쳐 약 10²⁴번', 700, 1262, {size: 30, color: PAL.answer, a: ao, plateA: 0.85});
    });
  });
}

// ------------------------------------------------------------------ critical: the lump, the size knob, hit vs escape, per-generation counts
const KN = {x0: 330, x1: 880, y: 966}, CRG = {x0: 240, x1: 905, y0: 1300, y1: 1172};
const knobX = x => lerp(KN.x0, KN.x1, Math.log(x / CRIT.xSmall) / Math.log(CRIT.xLarge / CRIT.xSmall));
function criticalScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = fadeIn(t, ctx.scene.start, 0.3);
  const x = P.xAt(t), k = kOf(x), pe = pEsc(x), endA = 1 - smooth((t - ctx.scene.end + 0.25) / 0.25) * 0;
  const R = lumpPicture(stage, t, P, {a: sf * endA});
  withAlpha(c, sf, () => {
    tag(stage, '설명 모형 · 분열마다 중성자 2개', 330, 350, {size: 24, color: T.muted, plateA: 0.7});
    const el = fadeIn(t, P.surface11, 0.35) * fadeOut(t, P.knob[0] + 0.5, 0.4);
    if (el > 0) { leaderTo(c, T, [LUMP.cx + R + 50, LUMP.cy - 70], [LUMP.cx + R * 0.8, LUMP.cy - R * 0.6], el); tag(stage, '겉으로 빠져나감', LUMP.cx + R + 60, LUMP.cy - 86, {size: 26, color: PAL.esc, a: el, align: 'left', plateA: 0.75}); }
    // knob (no numbers: concept only)
    stage.text('덩어리 크기', 150, KN.y, {size: 24, weight: 700, color: T.muted});
    line(c, [[KN.x0, KN.y], [KN.x1, KN.y]], rgba(T.ink, 0.35), 4);
    line(c, [[KN.x0, KN.y], [knobX(x), KN.y]], rgba(PAL.answer, 0.85), 4);
    stage.text('작게', KN.x0, KN.y + 32, {size: 24, weight: 500, color: T.muted, align: 'center'}); stage.text('크게', KN.x1, KN.y + 32, {size: 24, weight: 500, color: T.muted, align: 'center'});
    const xc = knobX(X_CRIT), ba = fadeIn(t, P.border, 0.35);
    if (ba > 0) withAlpha(c, ba, () => { line(c, [[xc, KN.y - 16], [xc, KN.y + 16]], PAL.answer, 3); const nm = t >= P.critName ? '임계질량' : '경계'; stage.text(nm, xc, KN.y - 34, {role: 'display', size: 26, weight: 700, color: PAL.answer, align: 'center'}); });
    circle(c, knobX(x), KN.y, 13, T.ink); circle(c, knobX(x), KN.y, 6, '#111214');
    // hit vs escape (per 100 neutrons, formula)
    const rows = [['원자핵을 맞힘', 1 - pe, PAL.hit, 1032], ['겉으로 빠져나감', pe, PAL.esc, 1074]];
    for (const [lab, v, col, y] of rows) {
      stage.text(lab, 150, y, {size: 24, weight: 700, color: col});
      rect(c, 340, y - 11, 400, 22, 5, rgba(T.border, 0.8)); rect(c, 340, y - 11, 400 * v, 22, 5, rgba(col, 0.85));
      stage.text(`${Math.round(v * 100)}%`, 760, y, {role: 'display', size: 30, weight: 700, color: col});
    }
    line(c, [[540, 1016], [540, 1090]], rgba(T.ink, 0.35), 1.5, {dash: [4, 5]});
    // per-generation fissions (Monte-Carlo), log scale; k from the formula
    panel(c, T, 150, 1106, 780, 222, 0.82);
    stage.text('쪼개지는 수 (0.4초마다) · 로그 눈금', 172, 1134, {size: 24, weight: 700, color: T.muted});
    sci(stage, `증배 계수 k = ${k.toFixed(2)}`, 908, 1136, {role: 'display', size: 30, weight: 700, color: k >= 1 ? PAL.bomb : PAL.esc, align: 'right'});
    const B = P.MCB, N = B.length, gx = i => lerp(CRG.x0, CRG.x1, i / (N - 1)), gy = L => lerp(CRG.y0, CRG.y1, (L + 0.3) / 3.3);
    line(c, [[CRG.x0, CRG.y1 - 4], [CRG.x0, CRG.y0], [CRG.x1, CRG.y0]], rgba(T.muted, 0.7), 2);
    for (const [L, s2] of [[0, '1'], [1, '10'], [2, '100'], [3, '1000']]) { stage.text(s2, CRG.x0 - 12, gy(L), {size: 24, weight: 500, color: T.muted, align: 'right'}); line(c, [[CRG.x0, gy(L)], [CRG.x1, gy(L)]], rgba(T.border, 0.55), 1); }
    const pts = []; B.forEach((b2, i) => { if (b2.t <= t) pts.push([gx(i), gy(b2.fis > 0 ? Math.min(3, Math.log10(b2.fis)) : -0.3), b2]); });
    for (let i = 1; i < pts.length; i++) line(c, [pts[i - 1], pts[i]], pts[i][2].R >= X_CRIT ? PAL.bomb : PAL.esc, 3);
    for (const p2 of pts) if (p2[2].fis > 0) circle(c, p2[0], p2[1], 3.5, p2[2].R >= X_CRIT ? PAL.bomb : PAL.esc);
    const ci = B.findIndex(b2 => b2.R >= X_CRIT);
    if (ci > 0 && ba > 0) withAlpha(c, ba, () => { const xx = gx(ci - 0.5); line(c, [[xx, CRG.y1 - 4], [xx, CRG.y0]], rgba(PAL.answer, 0.8), 2, {dash: [6, 6]}); });
    const sd = B.findIndex(b2 => b2.t > P.burst[0]);
    stage.text('시간 →', CRG.x1, CRG.y0 - 16, {size: 24, weight: 500, color: T.muted, align: 'right'});
    tag(stage, '잦아듦 · k < 1', gx(sd + 7), gy(2.65), {size: 24, color: PAL.esc, a: fadeIn(t, P.die11, 0.4), plate: false});
    tag(stage, '불어남 · k > 1', gx(N - 7), gy(2.85), {size: 24, color: PAL.bomb, a: fadeIn(t, P.critName + 0.4, 0.4), plate: false});
  });
}

// ------------------------------------------------------------------ blast: the hot lump → fireball → shock ring, heat and radiation (log time)
const BLC = {cx: 540, cy: 640}, BAX = {x0: 190, x1: 900, y: 1268};
const baX = u => lerp(BAX.x0, BAX.x1, (u + 8) / 8);
const AIR = (() => { const pts = []; for (let y = 352; y < 1170; y += 46) for (let x = 162; x < 930; x += 46) { const dx = x - BLC.cx + (rand(x * 3 + y) - 0.5) * 10, dy = y - BLC.cy + (rand(x + y * 7) - 0.5) * 10; pts.push({dx, dy, r: Math.hypot(dx, dy)}); } return pts; })();
function blastGeom(P, t, b0) {
  const u = P.bU(t), tm = 10 ** u, Z = P.bZ(t), Rl = lerp(LUMP.px * CRIT.xLarge, 150, smooth((t - b0) / 1.1));
  const R = t < P.fb13 ? Rl : Math.max(fireR(tm) * Z, t < P.fb13 + 0.6 ? Rl * (1 - smooth((t - P.fb13) / 0.6)) : 0);
  return {u, tm, Z, R, Rs: shockR(tm) * Z};
}
function blastScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), b0 = ctx.scene.start, ef = fadeOut(t, ctx.scene.end - 0.35, 0.3);
  const {u, tm, R, Rs} = blastGeom(P, t, b0), {cx, cy} = BLC;
  const sep = smooth((t - P.tsep + 0.15) / 0.5);
  withAlpha(c, ef, () => {
    // air (s14): parcels pushed outward as the shock passes
    const aa = fadeIn(t, P.air14 - 0.6, 0.6) * 0.9;
    if (aa > 0) for (const p of AIR) {
      if (p.r < R * 1.02) continue; let r = p.r;
      if (Rs > p.r) { const d = Rs - p.r; r += 22 * Math.pow(160 / p.r, 0.6) * (1 - Math.exp(-d / 14)) * Math.exp(-d / 240); }
      const hit = Rs > p.r && Rs - p.r < 30 ? 1 - (Rs - p.r) / 30 : 0;
      circle(c, cx + p.dx / p.r * r, cy + p.dy / p.r * r, 1.7 + hit * 1.2, rgba(T.ink, aa * (0.2 + 0.5 * hit)));
    }
    // the lump at the start (neutrons of the last generations), then white heat, then the fireball
    if (t < b0 + 1.0) lumpPicture(stage, t, P, {a: 1 - smooth((t - b0) / 1.0), cam: {cx, cy, px: R / CRIT.xLarge}, x: CRIT.xLarge});
    const gb = glowBuf(), heatUp = smooth((t - b0) / (P.temp13 - b0 + 0.6)), fbAge = t - P.fb13;
    const I = t < P.fb13 ? lerp(0.35, 1.9, heatUp) : lerp(1.9, 0.8, smooth((t - P.fb13) / 5.5)) * (1 + 0.6 * Math.exp(-Math.max(0, fbAge) / 0.6));
    const heat = t < P.tsep ? 1 : lerp(1, 0.35, smooth((t - P.tsep) / 3.5));
    fireballGlow(gb, t, cx, cy, R, {I, heat, halo: t < P.bright13 ? 0.45 : 1.15, seed: 7});
    gb.flush(stage, {gain: 1.25, bloom: 0.6});
    if (t < P.bright13 + 0.3) withAlpha(c, 1 - smooth((t - P.bright13) / 0.3), () => ring(c, cx, cy, R, rgba(T.ink, 0.45), 1.6));
    // shock ring once it runs ahead of the fireball
    if (sep > 0) shockRing(c, cx, cy, Rs, sep, 2.4);
    headShade(c, smooth((Rs - 300) / 60) * sep);
    // heat and radiation
    const hr = fadeIn(t, P.heat14, 0.4);
    if (hr > 0) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 18; k++) {
        const an = k / 18 * TAU + 0.17, warm = k % 2 === 0, r0 = R + 14, r1 = Math.min(Rs - 10, 1000); if (r1 <= r0) continue;
        c.setLineDash(warm ? [16, 12] : [5, 9]); c.lineDashOffset = -t * (warm ? 90 : 160);
        c.strokeStyle = rgba(warm ? PAL.heat : PAL.rad, (warm ? 0.55 : 0.6) * hr); c.lineWidth = warm ? 3 : 2;
        c.beginPath(); c.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); c.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); c.stroke();
      }
      c.setLineDash([]); c.restore();
      tag(stage, '열 (빛)', 290, 400, {size: 28, color: PAL.heat, a: hr, plateA: 0.7});
      tag(stage, '방사선', 800, 400, {size: 28, color: PAL.rad, a: fadeIn(t, P.rad14, 0.4), plateA: 0.7});
    }
    // ruler on the right: the shock passes three marks (a low thump each)
    const ra = fadeIn(t, P.air14, 0.5);
    if (ra > 0) withAlpha(c, ra, () => {
      line(c, [[cx + 236, cy], [cx + 432, cy]], rgba(T.ink, 0.3), 1.5, {dash: [5, 6]});
      for (const m of P.ruler) { const hit = t >= m.t ? Math.exp(-(t - m.t) / 0.4) : 0; line(c, [[cx + m.R, cy - 12], [cx + m.R, cy + 12]], rgba(t >= m.t ? PAL.ring : T.ink, 0.5 + 0.5 * hit), 2.5); if (hit > 0) ring(c, cx + m.R, cy, 10 + 24 * (1 - hit), rgba(PAL.ring, hit * 0.8), 2); }
      stage.text('거리', 912, cy + 34, {size: 24, weight: 500, color: T.muted, align: 'center'});
    });
    tag(stage, '그림 · 크기와 빛은 모형', 300, 350, {size: 24, color: T.muted, a: fadeIn(t, b0 + 0.3, 0.4), plateA: 0.7});
    // readouts (s13)
    const tA = fadeIn(t, P.end13, 0.4) * fadeOut(t, ctx.tl.at('s14') + 0.3, 0.5), tB = fadeIn(t, P.temp13, 0.4) * fadeOut(t, ctx.tl.at('s14') + 0.3, 0.5);
    if (tA > 0) withAlpha(c, tA, () => tile(stage, 160, 960, 370, '연쇄반응이 끝나는 데', '100만분의 1초 안', {size: 32, color: PAL.flash}));
    if (tB > 0) withAlpha(c, tB, () => tile(stage, 550, 960, 370, '그 자리의 온도', '수천만 도', {size: 36, color: PAL.answer}));
    // log time axis
    panel(c, T, 150, 1176, 780, 150, 0.82);
    stage.text('폭발 뒤 시간 · 로그 눈금', 908, 1200, {size: 24, weight: 700, color: T.muted, align: 'right'});
    line(c, [[BAX.x0, BAX.y], [BAX.x1, BAX.y]], rgba(T.muted, 0.7), 2);
    for (let v = -8; v <= 0; v++) line(c, [[baX(v), BAX.y - (v % 3 === 0 || v === -8 ? 9 : 5)], [baX(v), BAX.y + 5]], rgba(T.muted, 0.7), 1.5);
    stage.text('1억분의 1초', BAX.x0 - 12, BAX.y + 34, {size: 24, weight: 500, color: T.muted});
    stage.text('100만분의 1초', baX(-6), BAX.y - 32, {size: 24, weight: 500, color: T.muted, align: 'center'});
    stage.text('1000분의 1초', baX(-3), BAX.y + 34, {size: 24, weight: 500, color: T.muted, align: 'center'});
    stage.text('1초', BAX.x1, BAX.y - 32, {size: 24, weight: 500, color: T.muted, align: 'right'});
    const ux = baX(clamp(u, -8, 0)); line(c, [[BAX.x0, BAX.y], [ux, BAX.y]], PAL.answer, 4); poly(c, [[ux, BAX.y - 3], [ux - 9, BAX.y - 17], [ux + 9, BAX.y - 17]], PAL.answer);
  });
  captionShade(c, ef);
}

// ------------------------------------------------------------------ history: 1945 — Trinity, two cities, the dead (quiet)
const TLN = {x0: 200, x1: 880, y: 392, d0: 0, d1: 36};                   // day 0 = 10 July 1945
const tlX = d => lerp(TLN.x0, TLN.x1, d / TLN.d1);
function historyScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx, 0.3, 0.3), s16 = ctx.tl.at('s16');
  withAlpha(c, sf, () => {
    // date strip
    const da = fadeIn(t, ctx.scene.start + 0.2, 0.5) * fadeOut(t, s16 - 0.6, 0.5);
    if (da > 0) withAlpha(c, da, () => {
      line(c, [[TLN.x0, TLN.y], [TLN.x1, TLN.y]], rgba(T.muted, 0.6), 2);
      stage.text('1945', TLN.x0 - 4, TLN.y - 34, {role: 'display', size: 28, weight: 700, color: T.muted});
      const mk = (d, top, bot, t0, al) => { const q = fadeIn(t, t0, 0.35); if (q <= 0) return; withAlpha(c, q, () => { circle(c, tlX(d), TLN.y, 7, PAL.answer); stage.text(top, tlX(d), TLN.y - 32, {role: 'display', size: 28, weight: 700, color: T.ink, align: 'center'}); stage.text(bot, al === 'right' ? tlX(d) + 6 : al === 'left' ? tlX(d) - 6 : tlX(d), TLN.y + 34, {size: 26, weight: 700, color: T.ink, align: al}); }); };
      mk(6, '7.16', 'Trinity', P.jul, 'center'); mk(27, '8.6', '히로시마', P.hiro, 'right'); mk(30, '8.9', '나가사키', P.naga, 'left');
    });
    // Trinity: a desert horizon at dawn, a distant light
    const ta = fadeIn(t, ctx.scene.start + 0.3, 0.6) * fadeOut(t, P.aug - 0.2, 0.6);
    if (ta > 0) withAlpha(c, ta, () => clipRect(c, 160, 470, 760, 400, 12, () => {
      const sky = c.createLinearGradient(0, 470, 0, 760); sky.addColorStop(0, '#08090C'); sky.addColorStop(1, '#1F1C1A'); c.fillStyle = sky; c.fillRect(160, 470, 760, 290);
      const gr = c.createLinearGradient(0, 760, 0, 870); gr.addColorStop(0, '#1A1714'); gr.addColorStop(1, '#0D0C0B'); c.fillStyle = gr; c.fillRect(160, 760, 760, 110);
      const mt = []; for (let x = 160; x <= 920; x += 20) mt.push([x, 760 - 22 * vnoise(x * 0.012, 3) - 26 * vnoise(x * 0.004, 9) * (x > 560 ? 1 : 0.5)]); mt.push([920, 760], [160, 760]); poly(c, mt, '#121110');
      const lq = clamp((t - P.test) / 2.6);
      if (lq > 0) { c.save(); c.globalCompositeOperation = 'lighter'; const a1 = Math.sin(Math.PI * Math.min(1, lq * 1.4)) ** 0.8; glow(c, 640, 742, 70 + 60 * lq, PAL.flash, 0.6 * a1); glow(c, 640, 742, 18 + 14 * lq, '#FFF4DC', 0.8 * a1); c.restore(); }
      stage.text('Trinity · 미국 뉴멕시코 사막', 540, 835, {size: 26, weight: 700, color: T.muted, align: 'center'});
    }));
    if (ta > 0) withAlpha(c, ta, () => rect(c, 160, 470, 760, 400, 12, null, rgba(T.border, 1), 1.5));
    // map: two cities
    const ma = fadeIn(t, P.aug - 0.2, 0.6);
    if (ma > 0) {
      const kq = fadeIn(t, P.korean, 0.8);
      mapLand(c, T, ma, kq);
      withAlpha(c, ma, () => {
        stage.text('일본', 780, 760, {size: 26, weight: 500, color: T.muted, align: 'center'});
        for (const [key, t0] of [['hiro', P.hiro], ['naga', P.naga]]) {
          const cty = CITIES[key], [x, y] = geo(cty.lon, cty.lat), q = fadeIn(t, t0, 0.4); if (q <= 0) continue;
          for (const L of CITY_LIGHTS[key]) { const off = P.dark16 + 0.3 + L.off * (P.korean - P.dark16 - 0.2), on = q * (1 - smooth((t - off) / 0.8)); if (on > 0.01) circle(c, L.x, L.y, 2, rgba(PAL.city, on * L.b * (0.75 + 0.25 * Math.sin(t * 1.3 + L.off * 9)))); }
          withAlpha(c, q, () => { ring(c, x, y, 30, rgba(T.ink, 0.7), 1.5); circle(c, x, y, 3.5, T.ink); });
          const lx = key === 'hiro' ? x + 46 : x - 46, al = key === 'hiro' ? 'left' : 'right';
          withAlpha(c, q, () => { stage.text(cty.name, lx, y - 12, {size: 28, weight: 700, color: T.ink, align: al}); stage.text(`1945.${cty.date}`, lx, y + 22, {size: 24, weight: 500, color: T.muted, align: al}); });
        }
        if (kq > 0) tag(stage, '조선 · 당시 일본의 식민지', 300, 640, {size: 26, color: T.ink, a: kq, plateA: 0.8});
      });
    }
    // the number (s16), calm
    const na = fadeIn(t, P.n150k, 0.6);
    if (na > 0) withAlpha(c, na, () => {
      stage.text('15만 명 넘게', 540, 408, {role: 'display', size: 72, weight: 700, color: T.ink, align: 'center'});
      stage.text('1945년 말까지 · 두 도시의 사망자 (추정)', 540, 474, {size: 26, weight: 500, color: T.muted, align: 'center'});
    });
  });
}

// ------------------------------------------------------------------ myth: reactor core (rods hold k = 1) vs the runaway lump (k > 1)
const RC = {x0: 182, x1: 488, y0: 462, y1: 842, fuel: [214, 274, 334, 394, 454], rods: [244, 304, 364, 424]};
const rodBottom = h => RC.y0 + 24 + h * 330;
/** visual lineages of the k = 1 core: each fission sends one neutron to the next fission and one into a control rod */
export function reactorLineages(t0, t1, hAt) {
  const R = rng(1957), fis = [], fl = [];
  for (let L = 0; L < 4; L++) {
    let t = t0 + L * 0.17 + R() * 0.1, f = Math.floor(R() * 5), y = RC.y0 + 50 + R() * 280;
    while (t < t1) {
      fis.push({t, x: RC.fuel[f], y});
      const nf = clamp(f + (R() < 0.5 ? -1 : 1) * (1 + Math.floor(R() * 2)), 0, 4), ny = clamp(y + (R() - 0.5) * 220, RC.y0 + 45, RC.y0 + 345), dt = 0.5 + R() * 0.25;
      fl.push({t0: t, t1: t + dt, a: [RC.fuel[f], y], b: [RC.fuel[nf], ny], kind: 'fis'});
      const ri = clamp(f + (R() < 0.5 ? -1 : 0), 0, 3), rb = rodBottom(hAt(t + 0.3)), ay = Math.min(y - 20 + (R() - 0.5) * 60, rb - 12);
      fl.push({t0: t, t1: t + 0.3, a: [RC.fuel[f], y], b: [RC.rods[ri], Math.max(RC.y0 + 20, ay)], kind: 'abs'});
      t += dt; f = nf; y = ny;
    }
  }
  return {fis: fis.sort((p, q) => p.t - q.t), fl};
}
const MG = {x0: 240, x1: 905, y0: 1300, y1: 1110};
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx), m0 = P.m0 + 0.2;
  const h = REACTOR.at(REACTOR.h, t - m0), rb = rodBottom(h);
  withAlpha(c, sf, () => {
    stage.text('원자력 발전소', 335, 364, {role: 'display', size: 34, weight: 700, color: PAL.reactor, align: 'center'});
    stage.text('원자폭탄', 745, 364, {role: 'display', size: 34, weight: 700, color: PAL.bomb, align: 'center'});
    // reactor core: water, fuel rods, control rods, neutrons
    rect(c, RC.x0, RC.y0, RC.x1 - RC.x0, RC.y1 - RC.y0, 10, rgba('#16323A', 0.55), rgba(T.ink, 0.4), 1.5);
    for (const x of RC.fuel) rect(c, x - 12, RC.y0 + 30, 24, 340, 6, rgba('#5A4A36', 0.9), rgba(PAL.flash, 0.35), 1.2);
    const rh = fadeIn(t, P.rods18, 0.4);
    for (const x of RC.rods) { rect(c, x - 7, RC.y0 - 40, 14, rb - RC.y0 + 40, 3, '#2B2D31', rgba(T.ink, 0.5 + 0.4 * rh), 1.4 + rh); }
    rect(c, RC.rods[0] - 12, RC.y0 - 52, RC.rods[3] - RC.rods[0] + 24, 14, 4, '#3A3C40', rgba(T.ink, 0.5), 1.2);
    const gb = glowBuf();
    for (const f of P.RL.fis) { const age = t - f.t; if (age < 0 || age > 1.2) continue; gb.splat(f.x, f.y, 22, FLASH_C, 1.2 * Math.exp(-age / 0.14)); }
    for (const n of P.RL.fl) { const q = (t - n.t0) / (n.t1 - n.t0); if (q < 0 || q > 1.25) continue; const hx = lerp(n.a[0], n.b[0], Math.min(1, q)), hy = lerp(n.a[1], n.b[1], Math.min(1, q));
      if (q <= 1) { trail(c, [lerp(n.a[0], hx, 0.4), lerp(n.a[1], hy, 0.4)], [hx, hy], 0.8, 1.6); neutronDot(c, hx, hy, 3); }
      else if (n.kind === 'abs') ring(c, n.b[0], n.b[1], 4 + 30 * (q - 1), rgba(PAL.n, 0.9 * (1.25 - q) * 4), 1.5); }
    gb.flush(stage, {bloom: 0.4});
    const rl = fadeIn(t, P.rods18, 0.35);
    if (rl > 0) { leaderTo(c, T, [RC.rods[3] + 70, RC.y0 - 20], [RC.rods[3] + 7, RC.y0 - 30], rl); tag(stage, '제어봉', RC.rods[3] + 76, RC.y0 - 20, {size: 26, a: rl, align: 'left', plateA: 0.8}); }
    tag(stage, '중성자 흡수', 335, 868, {size: 24, color: PAL.n, a: fadeIn(t, P.absorb18, 0.35), plate: false});
    // fuel: only a few percent is the easily split uranium
    const fa = fadeIn(t, P.fuel18, 0.4);
    if (fa > 0) withAlpha(c, fa, () => {
      const g0 = [186, 900], hot = [[2, 1], [7, 3], [4, 6], [8, 8]];
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const isHot = hot.some(([a, b]) => a === i && b === j); circle(c, g0[0] + i * 13, g0[1] + j * 13, isHot ? 4.6 : 3.4, isHot ? rgba(PAL.flash, lerp(0.5, 1, fadeIn(t, P.pct18, 0.3))) : rgba(T.muted, 0.5)); }
      stage.text('발전용 연료', 340, 906, {size: 24, weight: 700, color: T.muted});
      stage.text('U-235', 340, 946, {size: 26, weight: 700, color: PAL.flash, alpha: fadeIn(t, P.pct18, 0.3)});
      stage.text('3~5%', 340, 990, {role: 'display', size: 38, weight: 700, color: PAL.flash, alpha: fadeIn(t, P.pct18, 0.3)});
    });
    // the lump with a runaway chain (k > 1)
    const lx = 745, ly = 640, LR = 140, la = fadeIn(t, P.m0 + 0.1, 0.5);
    withAlpha(c, la, () => {
      const g = c.createRadialGradient(lx - 40, ly - 50, 10, lx, ly, LR); g.addColorStop(0, 'rgba(120,108,92,0.35)'); g.addColorStop(1, 'rgba(40,37,33,0.5)'); circle(c, lx, ly, LR, g);
      const tau = t < P.mBombG[0] ? -0.01 : P.mTau(t), late = smooth((tau - 6) / 6);
      c.save(); c.beginPath(); c.arc(lx, ly, LR, 0, TAU); c.clip();
      chainPicture(stage, t, {cx: lx, cy: ly, s: 15, tau, tOf: invOf(P.mTau, P.mBombG[0] - 1, ctx.scene.end + 1), clip: [lx - LR, ly - LR, lx + LR, ly + LR], fieldA: la, glowA: la, trailA: 0.5, flashK: 0.8, hot: {R: 9.3, I: 0.85 * late, heat: 0.7}});
      c.restore();
      ring(c, lx, ly, LR, rgba(T.ink, 0.5), 1.6);
    });
    const kb = fadeIn(t, P.bomb17 + 1, 0.4);
    if (kb > 0) withAlpha(c, kb, () => { panel(c, T, 600, 896, 290, 104, 0.85); sci(stage, 'k > 1', 745, 934, {role: 'display', size: 38, weight: 700, color: PAL.bomb, align: 'center'}); stage.text('쪼개지는 수가 계속 불어남', 745, 976, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
    // graph: neutrons over time (log): reactor flat, bomb steep
    panel(c, T, 150, 1028, 780, 298, 0.82);
    stage.text('중성자 수 · 로그 눈금', 172, 1056, {size: 24, weight: 700, color: T.muted});
    stage.text('시간 →', MG.x1, MG.y0 - 18, {size: 24, weight: 500, color: T.muted, align: 'right'});
    line(c, [[MG.x0, MG.y1 - 6], [MG.x0, MG.y0], [MG.x1, MG.y0]], rgba(T.muted, 0.7), 2);
    const gx = tt => lerp(MG.x0, MG.x1, (tt - m0) / (ctx.scene.end - m0)), gy = L => lerp(MG.y0, MG.y1, L / 8);
    const rp = [], bp = [];
    for (let tt = m0; tt <= Math.min(t, ctx.scene.end); tt += 0.05) { rp.push([gx(tt), gy(2 + REACTOR.at(REACTOR.logN, tt - m0) / Math.LN10)]); if (tt >= P.bomb17) { const L = 2 + Math.log10(2) * (tt - P.bomb17) / 0.42; if (L <= 8) bp.push([gx(tt), gy(L)]); } }
    if (rp.length > 1) line(c, rp, PAL.reactor, 3.5);
    if (bp.length > 1) { line(c, bp, PAL.bomb, 3.5); const e = bp.at(-1); if (2 + Math.log10(2) * (t - P.bomb17) / 0.42 > 8) arrow(c, [e[0], e[1] + 20], [e[0], e[1] - 6], PAL.bomb, 3); }
    const st = fadeIn(t, P.steady18, 0.4);
    tag(stage, '발전소 · k = 1 · 일정', 790, gy(2) - 30, {size: 26, color: PAL.reactor, a: fadeIn(t, P.no18, 0.4), plateA: 0.8, border: st > 0 ? PAL.reactor : null});
    if (bp.length > 1) tag(stage, '폭탄 · k > 1', Math.min(bp.at(-1)[0] + 90, 860), gy(6.6), {size: 26, color: PAL.bomb, a: fadeIn(t, P.bomb17 + 1.2, 0.4), plateA: 0.8});
    tag(stage, '설명 모형', 860, 1056, {size: 24, color: T.muted, plate: false});
  });
}

// ------------------------------------------------------------------ close: the same chain, held at k = 1 (power) or released at k > 1 (bomb) → poster
const K1 = {xs: [300, 372], y0: 470, dy: 66, rod: 214};
const k1Pos = k => [K1.xs[k % 2], K1.y0 + k * K1.dy];
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = fadeIn(t, ctx.scene.start, 0.3), out = 1 - fadeIn(t, P.back - 0.3, 0.45);
  if (out > 0) withAlpha(c, sf * out, () => {
    stage.text('천천히 다스리면', 335, 368, {role: 'display', size: 32, weight: 700, color: PAL.reactor, align: 'center'});
    stage.text('k = 1', 335, 412, {size: 26, weight: 700, color: T.muted, align: 'center'});
    stage.text('한순간에 풀어 놓으면', 750, 368, {role: 'display', size: 32, weight: 700, color: PAL.bomb, align: 'center'});
    stage.text('k > 1', 750, 412, {size: 26, weight: 700, color: T.muted, align: 'center'});
    line(c, [[540, 360], [540, 1240]], rgba(T.border, 0.9), 1.5);
    // left: one neutron goes on, the other is absorbed by a control rod
    rect(c, K1.rod - 9, 450, 18, 560, 4, '#2B2D31', rgba(T.ink, 0.5), 1.4);
    stage.text('제어봉', K1.rod, 1036, {size: 24, weight: 700, color: T.muted, align: 'center'});
    const gb = glowBuf(); let done = 0;
    for (let k = 0; k < 9; k++) {
      const [x, y] = k1Pos(k), tf = P.kOneT[k], age = t - tf;
      if (age < 0) { sprite(c, SPR.nuc, x, y, 12); continue; }
      done++;
      c.save(); c.globalCompositeOperation = 'lighter'; circle(c, x - 6, y - 3, 4, rgba(PAL.ember, 0.6)); circle(c, x + 6, y + 3, 3.5, rgba(PAL.ember, 0.55)); c.restore();
      gb.splat(x, y, 30, FLASH_C, 1.5 * Math.exp(-age / 0.15) + 0.1);
      if (k < 8) { const q = clamp(age / (P.kOneT[k + 1] - tf)), [nx, ny] = k1Pos(k + 1); trail(c, [x, y], [lerp(x, nx, q), lerp(y, ny, q)], q < 1 ? 1 : 0.45, 2); if (q < 1) neutronDot(c, lerp(x, nx, q), lerp(y, ny, q), 3.5); }
      const qa = clamp(age / 0.3), ax = lerp(x, K1.rod + 9, qa), ay = y + 12 * qa; trail(c, [x, y], [ax, ay], qa < 1 ? 0.8 : Math.max(0, 0.45 - (age - 0.3)), 1.6); if (qa < 1) neutronDot(c, ax, ay, 3);
    }
    gb.flush(stage, {bloom: 0.4});
    stage.text(Array(Math.max(1, Math.min(done, 6))).fill('1').join(' → ') + (done > 6 ? ' …' : ''), 335, 1100, {role: 'display', size: 30, weight: 700, color: PAL.reactor, align: 'center', alpha: fadeIn(t, P.kOneT[0], 0.3)});
    const ea = fadeIn(t, P.elec19, 0.4); if (ea > 0) withAlpha(c, ea, () => { stage.text('→ 전기', 335, 1176, {role: 'display', size: 42, weight: 700, color: PAL.reactor, align: 'center'}); stage.text('일정한 출력', 335, 1226, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
    // right: the tree
    const tau = t < P.clG[0] ? -0.01 : P.clTau(t), late = smooth((tau - 6) / 6);
    clipRect(c, 552, 440, 388, 590, 10, () => chainPicture(stage, t, {cx: 750, cy: 730, s: 21, tau, tOf: invOf(P.clTau, P.clG[0] - 1, ctx.scene.end + 1), clip: [552, 440, 940, 1030], fieldA: 1, glowA: 1, trailA: 0.5, flashK: 0.9, fall: [7.6, 1.2], hot: {R: 8.9, I: 0.85 * late, heat: 0.7}}));
    ring(c, 750, 730, 8.9 * 21, rgba(T.ink, 0.35), 1.4);
    const gN = t < P.clG[0] ? 0 : Math.min(7, Math.floor(tau) + 1);
    if (gN > 0) sci(stage, [1, 2, 4, 8].slice(0, Math.min(gN, 4)).join(' → ') + (gN > 4 ? ' …' : ''), 750, 1100, {role: 'display', size: 30, weight: 700, color: PAL.bomb, align: 'center'});
    const ba = fadeIn(t, P.bomb19, 0.4); if (ba > 0) withAlpha(c, ba, () => { stage.text('→ 폭탄', 750, 1176, {role: 'display', size: 42, weight: 700, color: PAL.bomb, align: 'center'}); stage.text('한순간에 터짐', 750, 1226, {size: 24, weight: 500, color: T.muted, align: 'center'}); });
    tag(stage, '설명 모형', 540, 1290, {size: 24, color: T.muted, plate: false});
  });
  const fin = fadeIn(t, P.back - 0.2, 0.5);
  if (fin > 0) {
    const tau = Math.min(POSTER_TAU, t < P.pG[0] ? -0.01 : P.pTau(t));
    posterPicture(stage, t, {a: fin, tau, tOf: invOf(P.pTau, P.pG[0] - 1, ctx.tl.duration + 1), fbq: clamp((t - P.pFB[0]) / (P.pFB[1] - P.pFB[0])), rq: clamp((t - P.pFB[1] + 0.7) / 1.4)});
    captionShade(c, fin);
  }
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Fission (picture flash) → a short low tick 123 Hz. Ticks of a dense run are made quieter so that the run's
//    loudness stays about that of 4 ticks per second; where they run together a low hum takes over.
//  - Chain hum: pitch 55 + 3.2·log10(fissions in this generation) Hz (1 → 55 Hz, 10²⁴ → 131 Hz), loudness capped.
//  - Critical: the same fission ticks from the Monte-Carlo run (they die away for the small lump, multiply for the
//    large one); while the knob turns a soft tone follows k: 110·k Hz; a tick when k passes 1.
//  - Fireball: band-limited noise (35–200 Hz) whose amplitude follows the fireball brightness; shock → low thump
//    (58–72 Hz) when it leaves the fireball and when it passes each ruler mark.
//  - Reactor (k = 1): steady ticks 110 Hz; bomb (k > 1): multiplying ticks 123 Hz → hum.
//  - History: soft date ticks only; the victims sentence has no sound (silent events).
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export const humHz = L => 55 + 3.2 * L;
export const FIS_HZ = 123;
const thin = (times, gap = 0.035) => { const o = []; for (const x of times.slice().sort((a, b) => a - b)) if (!o.length || x - o.at(-1) >= gap) o.push(x); return o; };
/** screen times of tree fissions (and of the ignition wave for nuclei within rMax) under a τ map */
function treeTimes(map, t0, t1, {tauMax = Infinity, rMax = 0, cut = Infinity} = {}) {
  const inv = invOf(map, t0, t1), out = [];
  TREE.forEach(n => { if (n.tau <= tauMax) out.push(inv(n.tau)); });
  if (rMax > 0) FIELD.forEach((p, i) => { if (p.tree < 0 && p.r < rMax && IGNITE[i] <= tauMax) out.push(inv(IGNITE[i])); });
  return out.filter(x => x >= t0 && x <= Math.min(t1, cut));
}
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [], sc = id => tl.scene(id);
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.04, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.5, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const envNoise = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.3, o.fo ?? 0.5)), 4)]); Q[Q.length - 1][1] = 0; ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 35, high: o.high ?? 200, fade: 0.05, points: Q}, means}); };
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => {
    const T = thin(times, o.gap ?? 0.035); if (!T.length) return 0;
    const dens = T.map(x => T.filter(y => Math.abs(y - x) <= 0.5).length), g = dens.map(n => r(-10 * Math.log10(Math.max(1, n / (o.per ?? 4))), 2));
    ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((x, k) => ({kind: 'tick', offset: r(x - T[0], 4), params: {freq, decay: o.decay ?? 0.06, click: 0, gain_db: g[k]}}))}, means: means.replace('{n}', T.length)});
    return T.length;
  };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -34}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -35) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -30, f = 62) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur: 0.7, harmonics: [1, 0.4, 0.2], attack: 0.006, decay: 0.22, release: 0.25, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.35, low: 35, high: 200, release: 0.25, gain_db: -8}}]}, means});
  const silent = (id, t0, means) => ev.push({id, at: r(t0, 4), kind: 'silent', means});
  const humFrom = (id, times, t0, t1, L, means, gain = -34) => {   // a hum that fades in where the ticks run together
    const rate = tt => times.filter(x => Math.abs(x - tt) <= 0.25).length * 2;
    chirp(id, t0, t1, tt => humHz(L(tt)), tt => 0.32 * smooth((rate(tt) - 12) / 30), gain, means, {fi: 0.2, fo: 0.4});
  };

  // ---- hook
  swell('poster', 0.05, [65.4, 98, 131], '첫 화면(썸네일): 불덩이와 갈래 치는 중성자 빛줄기', {dur: 1.9, gain: -35});
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  whoosh('hook_neutron', P.hIn[0], P.hIn[1] - P.hIn[0], 85, 140, '중성자 하나가 날아와 원자핵에 닿음', -36);
  const hT = treeTimes(P.hTau, 1.5, 9, {tauMax: POSTER_TAU, rMax: 11, cut: P.hFB[1]});
  ticks('hook_fissions', hT, FIS_HZ, -33, `원자핵이 쪼개질 때마다 낮은 틱 ({n}번): 단계마다 두 배로 촘촘해짐`);
  humFrom('hook_hum', hT, P.hG[3], P.hFB[1] + 0.3, tt => Math.log10(2) * clamp(P.hTau(tt), 0, 9), '틱이 촘촘해져 하나의 낮은 웅웅으로 합쳐짐 (음높이 = 단계마다 쪼개지는 핵의 수, 로그)');
  envNoise('hook_fireball', P.hFB[0], tl.scene('hook').end - 0.3, tt => smooth((tt - P.hFB[0]) / (P.hFB[1] - P.hFB[0])) * (1 - 0.6 * smooth((tt - P.shrink[0]) / 1.2)), -33, '불덩이가 부풀어 오름 (낮은 대역 잡음, 밝기를 따름)', {high: 160});
  tick('y1945', P.y1945, 147, -36, '"1945년 8월 6일 · 히로시마"', {decay: 0.12});
  tick('tnt', P.tnt, 165, -35, '"에너지 (TNT로 환산) 약 1만 5천 톤"', {decay: 0.12});
  whoosh('stream', P.stream[0], P.grain - P.stream[0], 140, 80, '에너지를 질량으로 따지면: 불덩이에서 접시로 흐르는 빛', -37);
  tick('grain', P.grain, 196, -34, '"약 0.7 g"이 오른쪽 접시에 놓임', {decay: 0.08});
  tick('coin', P.coin[1], 196, -33, '1원 동전이 왼쪽 접시에 떨어짐', {decay: 0.05});
  swell('same', P.same, [98, 147], '"거의 같은 무게"', {dur: 1.4, gain: -35});
  // ---- origin
  swell('atom', P.atom + 0.2, [110, 165], '원자 그림', {dur: 1.3, gain: -37});
  whoosh('cut', P.cut[0], 0.5, 140, 80, '자르는 선이 내려옴', -37);
  tick('cut_stop', P.cut[0] + 0.5, 98, -34, '선이 원자 겉에서 멈춤 (쪼갤 수 없다는 이름)', {decay: 0.1});
  tick('atomos', P.atomos, 147, -35, '"atomos = 쪼갤 수 없는 것"', {decay: 0.12});
  tick('hanja', P.hanja, 131, -36, '"原子 = 原 근원 + 子 작은 알갱이"', {decay: 0.12});
  swell('nucleus', P.s04 + 0.3, [82.4, 123], '원자 한가운데 원자핵으로 확대', {dur: 1.4, gain: -37});
  whoosh('n1938', P.nFly[0], P.nFly[1] - P.nFly[0], 85, 140, '우라늄에 중성자를 쏨', -36);
  tick('n1938_hit', P.nFly[1], FIS_HZ, -33, '중성자가 우라늄 원자핵에 닿음', {decay: 0.08});
  tick('barium', P.ba, 165, -35, '"바륨 Ba"가 생김', {decay: 0.12});
  tick('bars', P.ba + 0.3, 131, -36, '원자량 막대: 우라늄 238, 바륨 137', {decay: 0.1});
  thump('split1939', P.split5[0] + 0.35, '원자핵이 둘로 갈라짐 (바륨 + 크립톤)', -32, 70);
  chirp('cell', P.cell5[0], P.cell5[1], tt => lerp(147, 110, smooth((tt - P.cell5[0]) / (P.cell5[1] - P.cell5[0]))), () => 0.3, -37, '세포가 둘로 나뉨 (조용히 내려가는 음)', {fi: 0.2, fo: 0.3});
  swell('fission_name', P.fission5, [110, 165, 220], '"fission · 핵분열"', {dur: 1.6, gain: -34});
  // ---- essence
  tick('drop', P.drop6[1], 147, -33, '쪼개진 조각(바륨 · 크립톤 · 중성자 3)이 오른쪽 접시에 놓임', {decay: 0.08});
  chirp('swing', P.drop6[1], P.drop6[1] + 1.6, tt => 98 + 40 * P.essScale(tt), tt => 0.25, -38, '저울이 흔들리다 왼쪽(처음 원자핵)으로 조금 기욺 (음높이 = 기울기)', {fi: 0.05, fo: 0.5});
  tick('masses', P.read6, 131, -36, '"236.05 u / 235.87 u"', {decay: 0.1});
  swell('thousandth', P.thou6, [98, 147], '"차이 0.19 u ≈ 1000분의 1"', {dur: 1.4, gain: -35});
  whoosh('rise', P.gone7 + 0.4, 0.9, 85, 140, '사라진 질량 m이 떠오름', -37);
  tick('c1', P.c1, 196, -35, '"× c" (빛의 속도)', {decay: 0.08});
  tick('c2', P.c2, 175, -35, '"× c" 한 번 더', {decay: 0.08});
  swell('energy', P.eFlash, [110, 165, 220], '"= E": 사라진 질량이 에너지로 (빛)', {dur: 1.6, gain: -33});
  tick('emc2', P.formula, 131, -35, '"E = mc² · Einstein"', {decay: 0.12});
  tick('tnt7', P.tnt7, 147, -36, '"0.7 g × c² ≈ TNT 약 1만 5천 톤"', {decay: 0.12});
  // ---- chain
  const cInv = invOf(P.cTau, P.cG[0] - 1, sc('chain').end + 1);
  whoosh('chain_neutron', P.cIn[0], P.cIn[1] - P.cIn[0], 85, 140, '중성자 하나가 우라늄 235 원자핵으로 날아감', -36);
  tick('absorb', P.cIn[1], 98, -34, '원자핵이 중성자를 받음 (흔들림)', {decay: 0.12});
  const cT = treeTimes(P.cTau, P.cG[0] - 0.5, sc('chain').end, {tauMax: 30, rMax: 10.2});
  ticks('chain_fissions', cT, FIS_HZ, -32, `화면의 원자핵이 쪼개질 때마다 낮은 틱 ({n}번, 0.035초 넘게 떨어진 것만): 1, 2, 4, 8 … 단계마다 두 배로 촘촘해짐`);
  chirp('chain_hum', P.cG[3], sc('chain').end - 0.35, tt => humHz(Math.log10(perGen(Math.max(1, P.gC(tt))))), tt => 0.32 * smooth((tt - P.cG[3]) / 1.5), -33,
    `연쇄반응의 웅웅: 음높이 = 단계마다 쪼개지는 핵의 수(로그) 55 + 3.2·log₁₀N Hz (1개 ${humHz(0).toFixed(0)} Hz → 10²⁴개 ${humHz(24).toFixed(0)} Hz), 소리 크기는 제한`, {fi: 1.0, fo: 0.35});
  tick('step', P.e8, 165, -35, '"한 단계 ≈ 1억분의 1초"', {decay: 0.1});
  swell('atonce', P.atonce, [98, 147, 196], '"모두 합쳐 약 10²⁴번"', {dur: 1.6, gain: -35});
  void cInv;
  // ---- critical
  const crT = P.MC.sites.filter(q => q.tf < sc('critical').end).map(q => q.tf);
  ticks('crit_fissions', crT, FIS_HZ, -32, '덩어리 안에서 원자핵이 쪼개질 때마다 틱 ({n}번): 작은 덩어리는 몇 번 울리다 잦아들고, 임계를 넘은 큰 덩어리는 불어남');
  humFrom('crit_hum', crT, P.cross, sc('critical').end - 0.1, tt => { let f = 0; for (const q of P.MC.sites) if (Math.abs(q.tf - tt) < 0.2) f += q.w; return Math.log10(Math.max(1, f * 2.5)); }, '틱이 촘촘해지면 낮은 웅웅으로 (음높이 = 쪼개지는 수, 로그)');
  chirp('knob', P.knob[0], P.knob[1], tt => 110 * kOf(P.xAt(tt)), () => 0.22, -38, `덩어리 크기 손잡이: 증배 계수 k에 따라 음이 오름 (110·k Hz, k ${kOf(CRIT.xSmall).toFixed(2)} → ${kOf(CRIT.xLarge).toFixed(2)})`, {fi: 0.3, fo: 0.4});
  tick('k_one', P.cross, 196, -33, 'k가 1을 넘음: 맞히는 중성자 = 빠져나가는 중성자 (경계)', {decay: 0.12});
  swell('crit_name', P.critName, [98, 147, 196], '"임계질량"', {dur: 1.4, gain: -35});
  // ---- blast
  const b0 = sc('blast').start, fbI = tt => { const {R} = blastGeom(P, tt, b0); return tt < P.fb13 ? 0.35 + 0.65 * smooth((tt - b0) / (P.temp13 - b0 + 0.6)) : clamp(0.6 + 0.4 * Math.exp(-(tt - P.fb13) / 2.5) + R / 1500); };
  envNoise('fireball', b0 + 0.05, sc('blast').end - 0.3, fbI, -32, '덩어리가 수천만 도로 달아올라 불덩이가 됨: 낮은 대역 잡음의 크기 = 불덩이의 밝기', {fi: 0.4, fo: 0.6, low: 35, high: 160});
  tick('t_end', P.end13, 147, -36, '"100만분의 1초 안"', {decay: 0.1});
  tick('t_temp', P.temp13, 165, -36, '"수천만 도"', {decay: 0.1});
  swell('bright', P.bright13, [65.4, 98, 131], '눈부신 불덩이', {dur: 1.8, gain: -34});
  thump('shock_sep', P.tsep, '충격파가 불덩이를 떠나 앞서 나감', -31, 58);
  P.ruler.forEach((m, k) => thump(`shock_mark${k + 1}`, m.t, `충격파가 거리 눈금 ${k + 1}을 지남`, -32 - k, 72 - 5 * k));
  envNoise('heat_rad', P.heat14, sc('blast').end - 0.3, () => 0.5, -36, '열과 방사선이 쏟아짐 (조용한 넓은 잡음)', {fi: 0.5, fo: 0.5, low: 70, high: 200});
  // ---- history (near silence)
  tick('d0716', P.jul, 98, -40, '"7.16 Trinity"', {decay: 0.12});
  swell('trinity', P.test, [55, 82.4], '먼 사막의 첫 시험 (아주 작게)', {dur: 2.2, gain: -41});
  tick('d0806', P.hiro, 98, -40, '"히로시마 1945.8.6"', {decay: 0.12});
  tick('d0809', P.naga, 98, -40, '"나가사키 1945.8.9"', {decay: 0.12});
  silent('lights_out', P.dark16 + 0.3, '두 도시의 불빛이 하나씩 꺼짐 — 소리를 비움');
  silent('victims', P.n150k, '"15만 명 넘게" — 소리 없음');
  silent('korea', P.korean, '"조선 · 당시 일본의 식민지" — 소리 없음');
  // ---- myth
  ticks('reactor', P.RL.fis.map(f => f.t), 110, -34, '발전소 노심: 한 번 쪼개질 때 다음에도 한 번 (k = 1) → 고른 박자의 틱 ({n}번)', {gap: 0.06, per: 6});
  const mT = treeTimes(P.mTau, P.mBombG[0] - 0.5, sc('myth').end, {tauMax: 16, rMax: 9.3});
  ticks('bomb_ticks', mT, FIS_HZ, -34, '폭탄 덩어리: 쪼개지는 수가 불어나는 틱 ({n}번) (k > 1)');
  humFrom('bomb_hum', mT, P.mBombG[3], sc('myth').end - 0.3, tt => Math.log10(2) * clamp(P.mTau(tt), 0, 16), '폭탄 쪽 틱이 하나의 웅웅으로 (음높이 = 쪼개지는 수, 로그)', -36);
  tick('no', P.no18, 131, -35, '"그렇지 않습니다": 발전소 · k = 1 · 일정', {decay: 0.12});
  tick('fuel', P.pct18, 165, -36, '"U-235 3~5%"', {decay: 0.1});
  chirp('rods', P.rods18, sc('myth').end - 0.3, tt => 90 + 60 * REACTOR.at(REACTOR.h, tt - P.m0 - 0.2), () => 0.2, -39, '제어봉 깊이를 따라가는 조용한 음 (깊을수록 높음): 반응을 일정하게', {fi: 0.4, fo: 0.4});
  swell('steady', P.steady18, [98, 147], '"일정" — 평평한 선', {dur: 1.4, gain: -35});
  // ---- close
  ticks('k1', P.kOneT.filter(x => x < P.back - 0.3), 110, -33, '천천히 다스리면: 고른 박자 ({n}번, k = 1)', {gap: 0.05});
  const clT = treeTimes(P.clTau, P.clG[0] - 0.5, P.back - 0.3, {tauMax: 15, rMax: 8.9});
  ticks('k2', clT, FIS_HZ, -33, '한순간에 풀어 놓으면: 불어나는 틱 ({n}번, k > 1)');
  humFrom('k2_hum', clT, P.clG[3], P.back - 0.2, tt => Math.log10(2) * clamp(P.clTau(tt), 0, 15), '불어나는 쪽이 웅웅으로', -35);
  swell('elec', P.elec19, [82.4, 123], '"→ 전기"', {dur: 1.3, gain: -36});
  swell('bomb', P.bomb19, [65.4, 98], '"→ 폭탄"', {dur: 1.3, gain: -35});
  swell('poster_back', P.back, [65.4, 98, 131], '"원자폭탄은" — 첫 화면의 포스터와 제목이 돌아옴', {dur: 1.9, gain: -34});
  const pT = treeTimes(P.pTau, P.pG[0] - 0.5, tl.duration, {tauMax: POSTER_TAU, rMax: 11});
  ticks('poster_fissions', pT, FIS_HZ, -35, '포스터의 연쇄반응이 다시 번짐 ({n}번)');
  envNoise('poster_fireball', P.pFB[0], tl.duration - 0.05, tt => 0.7 * smooth((tt - P.pFB[0]) / (P.pFB[1] - P.pFB[0])), -34, '포스터의 불덩이 (낮은 대역 잡음)', {fi: 0.3, fo: 1.2, high: 160});
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
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/atomic-bomb/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(중성자 갈래 나무와 점화 파면, 임계 장면의 몬테카를로 실행, 불덩이·충격파의 로그 시간 모형, 발전소 노심의 k = 1 모형)에서 써 넣습니다. 대응: 원자핵이 쪼개질 때마다 낮은 틱 123 Hz(촘촘한 구간은 작게), 틱이 합쳐지면 웅웅 55 + 3.2·log₁₀(쪼개지는 수) Hz, 불덩이 밝기 → 35~200 Hz 잡음, 충격파가 불덩이를 떠날 때와 거리 눈금을 지날 때 낮은 쿵(58~72 Hz), 임계 손잡이 → 110·k Hz, 발전소 노심 → 고른 박자 110 Hz. 역사 장면은 날짜 틱만, 희생 문장에는 소리 없음. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; X_CRIT ${X_CRIT.toFixed(3)}, cross ${P.cross.toFixed(2)}, tsep ${P.tsep.toFixed(2)}, ruler ${P.ruler.map(m => m.t.toFixed(2)).join(' ')}, MC sites ${P.MC.sites.length}`);
}
