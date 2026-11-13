// 46 GPT는 그림을 어떻게 그릴까 — a really "trained" (counted) tiny picture model (PLAN.md §1). NOT GPT.
// Fifteen hand-drawn 20×20 pictures (2 creatures, 2 breaths × 5 shapes, water·cat held out); the model counts, for every cell, which prompt word decides it (mutual information) and
// which code follows a given left / up neighbour under that word's value; drawing samples one cell at a time in raster
// order with a seeded u per step (kit stripPick rule). Pure computation; `node episodes/gpt-image/model.mjs` prints the
// check values, `node episodes/gpt-image/model.mjs --search` re-runs the seed search that fixed RUN below.
// Everything the scenes draw (pictures, probabilities, codes, the WHO map, noise steps) comes from this file.
import {rng, PAL} from '../gpt-generative/kit.mjs';

export const G = 20, N = G * G;

// ----------------------------------------------------------------------------------------------------
// palette (8 codes). Hues only from the kit's cool (#8CD9FF) and warm (#FFB454) families + near-black / navy.
// ----------------------------------------------------------------------------------------------------
export const PALETTE = [
  {id: 0, name: '바탕', hex: '#223B4B'},          // ground: a cool-neutral matte tile, clearly lighter than an empty slot
  {id: 1, name: '윤곽', hex: '#04090D'},          // near-black outline
  {id: 2, name: '한색 진함', hex: '#2D6F8E'},
  {id: 3, name: '한색 중간', hex: '#5FB6E0'},
  {id: 4, name: '한색 밝음', hex: PAL.coolHi},     // #D6F4FF
  {id: 5, name: '난색 진함', hex: '#B4621C'},
  {id: 6, name: '난색 중간', hex: PAL.warm},       // #FFB454 amber
  {id: 7, name: '난색 밝음', hex: PAL.hot},        // #FFE2B0
];
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const RGB = PALETTE.map(p => hex2rgb(p.hex));
export const K = PALETTE.length;

// ----------------------------------------------------------------------------------------------------
// the training pictures: creature (cols 0–11) + breath (cols 12–19), drawn as 20-row character maps.
// '.' = 0, digits = codes. Creatures face right, mouth at rows 9–10 / col 11; breath is a fan over cols 12–19.
// ----------------------------------------------------------------------------------------------------
const DRAGON = [
  '............',
  '.....2...2..',
  '.....22..22.',
  '....1111111.',
  '.1..13333331',
  '121.13331331',
  '122113333331',
  '122213333331',
  '122213333111',
  '.121133331..',
  '..1333344441',
  '.21333344411',
  '.13333344441',
  '213333344441',
  '..1333344441',
  '211333334441',
  '3333333331..',
  '1113311331..',
  '...11..11...',
  '............',
];
const CAT = [
  '............',
  '............',
  '.....1...1..',
  '....141.141.',
  '....1441441.',
  '....1444441.',
  '....1444141.',
  '.1..14444412',
  '141.14444412',
  '141..144441.',
  '141..14441..',
  '.1411444441.',
  '..142424241.',
  '..142424241.',
  '..144444441.',
  '...1444441..',
  '...141.141..',
  '...11..11...',
  '............',
  '............',
];
const FIRE = [[
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '.....555',
  '...55666',
  '.5566776',
  '56677776',
  '56677776',
  '.5566776',
  '...55666',
  '.....555',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '........',
  '......55',
  '....5566',
  '...56677',
  '..567777',
  '.5677766',
  '56666655',
  '555555..',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '........',
  '......5.',
  '..5..565',
  '.565.565',
  '.5665666',
  '56677765',
  '56777776',
  '56777766',
  '5667765.',
  '.5665.5.',
  '..5..565',
  '......5.',
  '........',
  '........',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '555555..',
  '56666655',
  '.5677766',
  '..567777',
  '...56677',
  '....5566',
  '......55',
  '........',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '......5.',
  '..555565',
  '55667776',
  '56777777',
  '.5566665',
  '...555..',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
]];
const WATER = [[
  '........',
  '........',
  '........',
  '........',
  '......3.',
  '........',
  '.....333',
  '...33444',
  '.3344444',
  '34444444',
  '34444444',
  '.3344444',
  '...33444',
  '.....333',
  '........',
  '.....3..',
  '........',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '.....3..',
  '........',
  '......33',
  '....3344',
  '...34444',
  '..344444',
  '.3444444',
  '33444433',
  '333333..',
  '........',
  '...3....',
  '.......3',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '......3.',
  '........',
  '..3..333',
  '.343.344',
  '.3443444',
  '34444443',
  '34444444',
  '34444434',
  '3444443.',
  '.3443.3.',
  '..3..343',
  '......3.',
  '........',
  '.....3..',
  '........',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '.......3',
  '...3....',
  '........',
  '333333..',
  '33444433',
  '.3444444',
  '..344444',
  '...34444',
  '....3344',
  '......33',
  '........',
  '.....3..',
  '........',
  '........',
], [
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '.....3..',
  '........',
  '..333343',
  '33444444',
  '34444444',
  '.3344443',
  '...333..',
  '.3......',
  '........',
  '......3.',
  '........',
  '........',
  '........',
  '........',
]];
const parse = (left, right) => {
  const out = [];
  for (let r = 0; r < G; r++) {
    const row = left[r] + right[r];
    if (left[r].length !== 12 || right[r].length !== 8) throw new Error(`row ${r} has width ${left[r].length}+${right[r].length}`);
    for (const ch of row) out.push(ch === '.' ? 0 : +ch);
  }
  return out;
};
export const CREATURE = {용: DRAGON, 고양이: CAT}, BREATH = {불: FIRE, 물: WATER};
export const NV = FIRE.length;   // breath variants per element (same count for every combination)
/** the training pictures: what × breath × variant (same three breath shapes for both creatures) */
export const TRAIN = [];
for (const [what, breath] of [['용', '불'], ['용', '물'], ['고양이', '불']])
  for (let v = 0; v < NV; v++) TRAIN.push({what, breath, variant: v, codes: parse(CREATURE[what], BREATH[breath][v])});
/** held-out combination (never counted) */
export const HELD = {what: '고양이', breath: '물'};
export const WORDS = {what: ['용', '고양이'], breath: ['불', '물']};

// ----------------------------------------------------------------------------------------------------
// learning by counting
// ----------------------------------------------------------------------------------------------------
const H = counts => { const n = counts.reduce((a, b) => a + b, 0); let h = 0; for (const c of counts) if (c) h -= c / n * Math.log2(c / n); return h; };
/** mutual information (bits) between a word slot and the code of cell i over TRAIN */
function mutualInfo(i, slot) {
  const all = new Array(K).fill(0), by = {};
  for (const p of TRAIN) { const c = p.codes[i]; all[c]++; (by[p[slot]] ||= new Array(K).fill(0))[c]++; }
  let hc = 0; for (const v in by) hc += by[v].reduce((a, b) => a + b, 0) / TRAIN.length * H(by[v]);
  return H(all) - hc;
}
export const MI = Array.from({length: N}, (_, i) => ({what: mutualInfo(i, 'what'), breath: mutualInfo(i, 'breath')}));
const EPS = 1e-9;
/** the responsible word slot per cell: 'what' | 'breath' | null (both 0 → the cell is always the same) */
export const WHO = MI.map(m => (m.what < EPS && m.breath < EPS ? null : m.what >= m.breath ? 'what' : 'breath'));

export const ALPHA = 0.0005;   // additive smoothing per code (PLAN §1 said 0.02: that put ~10 stray tiles in every picture)
const left = (codes, i) => (i % G === 0 ? -1 : codes[i - 1]);
const up = (codes, i) => (i < G ? -1 : codes[i - G]);
const valOf = (i, prompt) => (WHO[i] ? prompt[WHO[i]] : '*');
/** back-off chain, most specific first: (left, up) → left → up → the cell alone (all under the responsible word's value) */
export const LEVELS = ['left+up', 'left', 'up', 'cell'];
const keyOf = [(i, v, l, u) => `${i}|${v}|${l}|${u}`, (i, v, l) => `${i}|${v}|${l}|`, (i, v, l, u) => `${i}|${v}||${u}`, (i, v) => `${i}|${v}||`];
const COUNTS = LEVELS.map(() => new Map());
const bump = (map, key, c) => { let a = map.get(key); if (!a) map.set(key, a = new Array(K).fill(0)); a[c]++; };
for (const p of TRAIN) for (let i = 0; i < N; i++) {
  const v = valOf(i, p), l = left(p.codes, i), u = up(p.codes, i);
  keyOf.forEach((f, k) => bump(COUNTS[k], f(i, v, l, u), p.codes[i]));
}
const sum = a => a.reduce((x, y) => x + y, 0);
const smoothDist = cnt => { const n = sum(cnt); return cnt.map(c => (c + ALPHA) / (n + K * ALPHA)); };
/**
 * P(code | cell i, responsible word's value, left code, up code), backing off along LEVELS when a context was never
 * counted. → {dist[8], level: index into LEVELS, n: count of the context used}
 */
export function cellDist(i, prompt, codes) {
  const v = valOf(i, prompt), l = left(codes, i), u = up(codes, i);
  for (let k = 0; k < LEVELS.length; k++) {
    const cnt = COUNTS[k].get(keyOf[k](i, v, l, u));
    if (cnt) return {dist: smoothDist(cnt), level: k, n: sum(cnt)};
  }
  throw new Error('cell ' + i + ' never counted');
}
/** cumulative pick (same rule as kit stripPick): first k with u < Σ_{j≤k} p_j */
export const pickFrom = (dist, u) => { let acc = 0; for (let k = 0; k < dist.length; k++) { acc += dist[k]; if (u < acc) return k; } return dist.length - 1; };
export const argmax = a => a.reduce((k, v, i) => (v > a[k] ? i : k), 0);

/** draw one picture: {what, breath, seed} (or greedy) → {codes[400], steps[400] = {i, dist, u, pick, level}} */
export function generate({what, breath, seed = 1, greedy = false}) {
  const prompt = {what, breath}, r = rng(seed), codes = new Array(N).fill(-1), steps = [];
  for (let i = 0; i < N; i++) {
    const {dist, level} = cellDist(i, prompt, codes), u = greedy ? null : r();
    const pick = greedy ? argmax(dist) : pickFrom(dist, u);
    codes[i] = pick; steps.push({i, dist, u, pick, level});
  }
  return {codes, steps};
}

// ----------------------------------------------------------------------------------------------------
// picture ⇄ codes
// ----------------------------------------------------------------------------------------------------
export const S = 4, SG = G * S;     // 80×80 "smooth" pictures
const clamp255 = x => Math.max(0, Math.min(255, x));
/** Scale2x / EPX on a code grid (n×n → 2n×2n): stair-steps become clean diagonals, flat areas stay flat (no blur) */
export function scale2x(codes, n) {
  const out = new Array(4 * n * n), at = (x, y) => codes[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    const o = 2 * y * 2 * n + 2 * x; out[o] = e0; out[o + 1] = e1; out[o + 2 * n] = e2; out[o + 2 * n + 1] = e3;
  }
  return out;
}
/** code grid (any size m×m) → [r,g,b] with a very light matte shading: a lighter pixel under an edge above, darker over an edge below */
export function shadeCodes(codes, m) {
  return codes.map((k, i) => {
    const y = Math.floor(i / m), up = y > 0 ? codes[i - m] : k, dn = y < m - 1 ? codes[i + m] : k;
    const f = up !== k ? 1.08 : dn !== k ? 0.9 : 1;
    return RGB[k].map(v => Math.round(clamp255(v * f)));
  });
}
/** decode(codes): 80×80 [r,g,b] — the 20×20 codes upscaled twice with Scale2x (20 → 40 → 80) and lightly shaded */
export function decode(codes) { return shadeCodes(scale2x(scale2x(codes, G), 2 * G), SG); }
/** the in-between stage of the melt: 40×40 [r,g,b] (Scale2x once) */
export function decode40(codes) { return shadeCodes(scale2x(codes, G), 2 * G); }
/** SMOOTH: the "original picture" — TRAIN[0] decoded (crisp, rounded stair-steps, light shading), 80×80 [r,g,b] */
export const SMOOTH = decode(TRAIN[0].codes);
/** picture (80×80 [r,g,b]) → 20×20 codes: mean colour of each cell → nearest palette code */
export function quantize(pix) {
  const codes = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const m = [0, 0, 0];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = pix[(gy * S + y) * SG + gx * S + x]; m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; }
    const mean = m.map(v => v / (S * S));
    let best = 0, bd = Infinity;
    RGB.forEach((c, k) => { const d = (c[0] - mean[0]) ** 2 + (c[1] - mean[1]) ** 2 + (c[2] - mean[2]) ** 2; if (d < bd) { bd = d; best = k; } });
    codes.push(best);
  }
  return codes;
}
export const SMOOTH_CODES = quantize(SMOOTH);

// ----------------------------------------------------------------------------------------------------
// diffusion explainer: noisy(codes, level, seed) — each cell has a fixed threshold and a fixed random code, so lowering
// the level uncovers cells monotonically (every cell at once moves a step closer to the picture)
// ----------------------------------------------------------------------------------------------------
export const NOISE_STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.12, 0];
export function noisy(codes, level, seed = 1) {
  const r = rng(seed);
  return codes.map(c => { const th = r(), rc = Math.floor(r() * K); return th < level ? rc : c; });
}

// ----------------------------------------------------------------------------------------------------
// fixed seeds (found by --search) and helpers
// ----------------------------------------------------------------------------------------------------
export const RUN = {MAIN: 52, WATER: 52, S1: 3, S2: 31, S3: 41, HELD: 36, GLITCH: 1834, NOISE: 7};
export const same = (a, b) => a.every((v, i) => v === b[i]);
export const diffCells = (a, b) => a.map((v, i) => (v !== b[i] ? i : -1)).filter(i => i >= 0);
/** cells whose pick had probability < LOW (a "glitch": a code the training never put in that context) */
export const LOW = 0.05;
export const lowPicks = g => g.steps.filter(s => s.dist[s.pick] < LOW).map(s => ({i: s.i, code: s.pick, p: s.dist[s.pick]}));
/** the breath area (cols 12–19) of a picture as a string, to compare shapes */
export const breathKey = codes => codes.filter((c, i) => i % G >= 12).join('');
export const TRAINED_BREATH = {불: FIRE.map((v, k) => breathKey(parse(DRAGON, v))), 물: WATER.map((v, k) => breathKey(parse(DRAGON, v)))};
/** shape check of the breath area: 4-connected components of non-ground cells, sizes, and enclosed holes */
export function breathShape(codes) {
  const inA = i => i % G >= 12, seen = new Set(), comps = [];
  for (let i = 0; i < N; i++) {
    if (!inA(i) || !codes[i] || seen.has(i)) continue;
    let n = 0; const st = [i]; seen.add(i);
    while (st.length) {
      const j = st.pop(); n++;
      for (const d of [-1, 1, -G, G]) { const k = j + d; if (k < 0 || k >= N || !inA(k) || (d === 1 && k % G === 0) || (d === -1 && j % G === 0)) continue; if (codes[k] && !seen.has(k)) { seen.add(k); st.push(k); } }
    }
    comps.push(n);
  }
  comps.sort((a, b) => b - a);
  let holes = 0;
  for (let i = 0; i < N; i++) if (inA(i) && !codes[i] && i % G > 12 && i % G < 19 && i >= G && i < N - G && [-1, 1, -G, G].every(d => codes[i + d])) holes++;
  return {comps, holes};
}
/** a clean run: no low-probability pick anywhere and a plausible breath (fire: one blob; water: one jet + ≤ 4 single drops) */
export function isClean(g, breath) {
  if (lowPicks(g).length) return false;
  const {comps, holes} = breathShape(g.codes);
  if (holes || !comps.length || comps[0] < 22) return false;
  if (breath === '불') return comps.length === 1;
  return comps.slice(1).every(n => n === 1) && comps.length >= 2 && comps.length <= 5;
}

// ----------------------------------------------------------------------------------------------------
// check output / search
// ----------------------------------------------------------------------------------------------------
const pc = x => (100 * x).toFixed(2) + '%';
const rc = i => `r${Math.floor(i / G)}c${i % G}`;
function search(maxSeed = 3000) {
  const gen = (w, b, s) => generate({what: w, breath: b, seed: s});
  const main = [], s = [], held = [], glitch = [];
  for (let seed = 1; seed <= maxSeed; seed++) {
    const f = gen('용', '불', seed), w = gen('용', '물', seed), h = gen('고양이', '물', seed);
    const fc = isClean(f, '불'), novel = !TRAINED_BREATH.불.includes(breathKey(f.codes));
    if (fc && isClean(w, '물')) main.push(`${seed}${TRAINED_BREATH.불.includes(breathKey(f.codes)) ? '' : '*'}`);
    if (fc) s.push(`${seed}${novel ? '*' : ''}`);
    if (isClean(h, '물')) held.push(seed);
    const lp = lowPicks(f);
    if (lp.length === 1 && WHO[lp[0].i] === 'what' && f.steps[lp[0].i].dist[f.codes[lp[0].i]] < LOW) {
      const rest = {...f, steps: f.steps.filter(st => st.i !== lp[0].i)};
      const {comps, holes} = breathShape(f.codes);
      if (!lowPicks(rest).length && comps.length === 1 && !holes && comps[0] >= 22) glitch.push(`${seed}:${rc(lp[0].i)}=${lp[0].code}(${pc(lp[0].p)})`);
    }
  }
  console.log('MAIN+WATER clean (* = fire not a trained shape):', main.slice(0, 40).join(' '));
  console.log('fire clean (* = novel):', s.slice(0, 60).join(' '));
  console.log('HELD clean:', held.slice(0, 40).join(' '));
  console.log('GLITCH candidates:', glitch.slice(0, 40).join(' '));
}

// ----------------------------------------------------------------------------------------------------
// for the scenes
// ----------------------------------------------------------------------------------------------------
/**
 * hook (s02): a tiny next-text-piece table after '아기 용이 불을'. ILLUSTRATIVE values chosen for this episode (not
 * counted from anything, not GPT's numbers): it only shows "pick one piece from a fixed list". u lands in '뿜는다'.
 */
export const TEXT_NEXT = {ctx: ['아기', '용이', '불을'], next: [{piece: '뿜는다', p: 0.86}, {piece: '삼킨다', p: 0.08}, {piece: '본다', p: 0.04}, {piece: '그 밖', p: 0.02}], u: 0.41};
/** steps of a generated run whose distribution is really split (top probability < 99 %) → [{i, dist, pick, u, k}] */
export const SPLIT_CELLS = run => run.steps.filter(s => Math.max(...s.dist) < 0.99).map(s => ({...s, k: s.i}));
/** cached runs at the fixed seeds */
const RC = new Map();
export function runOf(what, breath, seed) { const key = what + breath + seed; let r = RC.get(key); if (!r) RC.set(key, r = generate({what, breath, seed})); return r; }
const isMain = import.meta.url === new URL('file://' + (process.argv[1] || '')).href;
function report() {
  const gen = (w, b, s) => generate({what: w, breath: b, seed: s});
  const cnt = {what: 0, breath: 0, null: 0}; WHO.forEach(w => cnt[w ?? 'null']++);
  console.log(`grid ${G}×${G} = ${N} cells, ${K} codes; TRAIN ${TRAIN.length} pictures (${NV} breath shapes × ${TRAIN.length / NV} combinations), held out ${HELD.breath}·${HELD.what}`);
  console.log(`smoothing α ${ALPHA} per code; back-off ${LEVELS.join(' → ')}`);
  console.log(`WHO: what ${cnt.what}, breath ${cnt.breath}, null ${cnt.null}`);
  console.log(`quantize(SMOOTH) = TRAIN[0] in ${SMOOTH_CODES.filter((c, i) => c === TRAIN[0].codes[i]).length}/${N} cells (${(100 * SMOOTH_CODES.filter((c, i) => c === TRAIN[0].codes[i]).length / N).toFixed(1)}%)`);
  const main = gen('용', '불', RUN.MAIN), water = gen('용', '물', RUN.WATER);
  const nontriv = g => g.steps.filter(s => Math.max(...s.dist) < 0.99);
  const lv = g => LEVELS.map((l, k) => `${l} ${g.steps.filter(s => s.level === k).length}`).join(', ');
  console.log(`RUN ${JSON.stringify(RUN)}`);
  console.log(`(1) MAIN 불·용 seed ${RUN.MAIN}: clean ${isClean(main, '불')}, low picks ${lowPicks(main).length}, breath ${JSON.stringify(breathShape(main.codes))}, trained shape ${TRAINED_BREATH.불.indexOf(breathKey(main.codes))} (-1 = new); context levels: ${lv(main)}`);
  const nt = nontriv(main);
  console.log(`    cells with a non-trivial choice (max p < 99%): ${nt.length}; first in raster order: ${nt.slice(0, 8).map(s => `${rc(s.i)} [${s.dist.map((p, k) => p > 0.01 ? k + ':' + (100 * p).toFixed(0) + '%' : '').filter(Boolean).join(' ')}] → ${s.pick}`).join('; ')}`);
  const d = diffCells(main.codes, water.codes), whatSame = WHO.every((w, i) => w !== 'what' || main.codes[i] === water.codes[i]);
  console.log(`(2) WATER 물·용 seed ${RUN.WATER}: clean ${isClean(water, '물')}; ${d.length} cells differ from MAIN, all breath-responsible: ${d.every(i => WHO[i] === 'breath')}; what-cells identical: ${whatSame}; null cells identical: ${WHO.every((w, i) => w || main.codes[i] === water.codes[i])}`);
  const ss = ['S1', 'S2', 'S3'].map(k => gen('용', '불', RUN[k])), keys = ss.map(g => breathKey(g.codes));
  console.log(`(3) S1–S3 seeds ${RUN.S1}, ${RUN.S2}, ${RUN.S3}: clean ${ss.map(g => isClean(g, '불')).join('/')}, distinct ${new Set(keys).size}/3, equal to trained shape ${keys.map(k => TRAINED_BREATH.불.indexOf(k)).join('/')} (-1 = new); pairwise differing cells ${[[0, 1], [0, 2], [1, 2]].map(([a, b]) => diffCells(ss[a].codes, ss[b].codes).length).join('/')}`);
  const h = gen(HELD.what, HELD.breath, RUN.HELD);
  const catSame = WHO.every((w, i) => w !== 'what' || h.codes[i] === TRAIN[2 * NV].codes[i]);
  console.log(`(4) HELD 물·고양이 seed ${RUN.HELD}: clean ${isClean(h, '물')}; what-cells = trained cat: ${catSame}; breath = a trained water shape: ${TRAINED_BREATH.물.indexOf(breathKey(h.codes))} (-1 = new); equals a training picture: ${TRAIN.some(t => same(t.codes, h.codes))}; contexts backed off: ${lv(h)}`);
  const g = gen('용', '불', RUN.GLITCH), lp = lowPicks(g);
  console.log(`(5) GLITCH 불·용 seed ${RUN.GLITCH}: low picks ${lp.map(l => `${rc(l.i)} (cell ${l.i}, WHO ${WHO[l.i]}) code ${l.code} p = ${l.p.toExponential(2)} (${(100 * l.p).toFixed(4)}%), u = ${g.steps[l.i].u.toFixed(6)}, expected code ${argmax(g.steps[l.i].dist)} p ${(100 * Math.max(...g.steps[l.i].dist)).toFixed(3)}%`).join('; ')}; cells off the trained dragon (WHO what/null): ${diffCells(g.codes, TRAIN[0].codes).filter(i => WHO[i] !== 'breath').map(rc).join(', ')}`);
  let clean = 0, low = 0; for (let s = 1; s <= 1000; s++) { const q = gen('용', '불', s), n = lowPicks(q).length; low += n; if (!n) clean++; }
  console.log(`seeds 1–1000 (불·용): ${clean / 10}% have no low-probability pick; mean low picks per picture ${(low / 1000).toFixed(3)}`);
  console.log(`NOISE_STEPS ${NOISE_STEPS.join(' ')} (seed ${RUN.NOISE}): cells ≠ picture ${NOISE_STEPS.map(l => diffCells(noisy(TRAIN[0].codes, l, RUN.NOISE), TRAIN[0].codes).length).join(' ')}`);
}
if (isMain) (process.argv.includes('--search') ? search : report)();
