// 45 GPT는 문맥을 어떻게 읽을까 — explanatory model (no drawing). PLAN.md §1.
// A two-direction toy of one attention step (NOT GPT and not its values — README / brief.md 단순화 메모):
//   map coordinates [u, v] ∈ [−1, 1]² (v up) · relevance table R (a learned matrix in a real model; set by hand here)
//   attention of word t over itself and the words before it: w = softmax(R[word_t][word_j]), j ≤ t (sum 1)
//   one layer: every word at once  x_i ← x_i + λ(Σ_j w_ij x_j − x_i)
//   next-word probabilities from the last word's point: softmax([γ·(x · O_c) …, 0]) (the last 0 = "그 밖")
//   the old (recurrent) way, as a model of memory: m_t = α·m_{t−1} + (1 − α)·E_t → share of the first word after n steps = α^n
// Run `node episodes/gpt-transformer/model.mjs` for the check values.
import {softmax, argmax} from '../gpt-generative/kit.mjs';
export {softmax, argmax};

// ---------------------------------------------------------------------------------------------
// map, starting points, relevance
// ---------------------------------------------------------------------------------------------
export const REGIONS = {
  탈것: {cx: 0.58, cy: 0.38, rx: 0.42, ry: 0.52},
  과일: {cx: -0.58, cy: -0.32, rx: 0.42, ry: 0.52},
};
/** starting point of each word (the same in every sentence) */
export const E = {
  배: [0.00, 0.02],
  항구를: [0.65, 0.50], 떠난: [0.40, 0.10], 폭풍을: [0.30, 0.62], 기차: [0.82, 0.22], 버스: [0.74, 0.66], 돛: [0.44, 0.78],
  익은: [-0.62, -0.20], 달게: [-0.40, -0.55], 사과: [-0.82, -0.36], 포도: [-0.72, -0.66], 감: [-0.44, -0.02],
  지: [0.05, -0.70], 사흘: [0.20, -0.55], 만에: [-0.10, -0.80], 만난: [0.12, 0.30],
};
/** background words shown on the map (not in any sentence) */
export const BACKDROP = {vehicle: ['기차', '버스', '돛'], fruit: ['사과', '포도', '감']};
/** R[looking word][looked-at word]; everything else (self included) is 0 */
export const R = {
  배: {항구를: 1.9, 떠난: 1.3, 익은: 1.9, 달게: 1.3, 폭풍을: 1.0},
  떠난: {항구를: 1.0},
  익은: {달게: 1.0},
  만난: {폭풍을: 1.0},
};
export const LAMBDA = 0.6;
export const SHIP = ['항구를', '떠난', '배'];
export const PEAR = ['달게', '익은', '배'];
export const LONG = ['항구를', '떠난', '지', '사흘', '만에', '폭풍을', '만난', '배'];

const rel = (a, b, k = 1) => k * ((R[a] && R[a][b]) || 0);
/** attention of every word over itself and the words before it, relevance scaled by k ∈ [0, 1] → W[i][j] (0 for j > i) */
export function attnAt(words, k = 1) {
  return words.map((wi, i) => {
    const s = softmax(words.slice(0, i + 1).map(wj => rel(wi, wj, k)));
    return words.map((_, j) => (j <= i ? s[j] : 0));
  });
}
/** L layers: → {W: [layer][i][j], X: [layer 0..L][i] = [u, v]} */
export function run(words, {layers = 4, k = 1, lambda = LAMBDA} = {}) {
  const X = [words.map(w => E[w].slice())], Ws = [];
  for (let l = 0; l < layers; l++) {
    const W = attnAt(words, k), x = X[l];                       // R depends on the words only → the same weights every layer
    X.push(x.map((xi, i) => {
      const m = [0, 0]; W[i].forEach((w, j) => { m[0] += w * x[j][0]; m[1] += w * x[j][1]; });
      return [xi[0] + lambda * (m[0] - xi[0]), xi[1] + lambda * (m[1] - xi[1])];
    }));
    Ws.push(W);
  }
  return {W: Ws, X};
}

// ---------------------------------------------------------------------------------------------
// next word
// ---------------------------------------------------------------------------------------------
export const CANDS = [
  {label: '위에서', o: [0.75, 0.45], side: 'vehicle'}, {label: '한 척이', o: [0.60, 0.70], side: 'vehicle'}, {label: '안에는', o: [0.50, 0.20], side: 'vehicle'},
  {label: '한 개를', o: [-0.75, -0.40], side: 'fruit'}, {label: '맛이', o: [-0.55, -0.65], side: 'fruit'}, {label: '껍질을', o: [-0.50, -0.15], side: 'fruit'},
];
/** γ: chosen so that after 4 layers the top word of SHIP / PEAR is 40–60 % (γ 5 → 45.5 % / 44.7 %; see the sweep printed below) */
export const GAMMA = 5;
/** → [{label, p}] for the six candidates (in CANDS order) + {label: '그 밖', p} last */
export function nextProbs(x, gamma = GAMMA) {
  const p = softmax([...CANDS.map(c => gamma * (x[0] * c.o[0] + x[1] * c.o[1])), 0]);
  return [...CANDS.map((c, i) => ({label: c.label, p: p[i]})), {label: '그 밖', p: p[CANDS.length]}];
}
/** top n candidates (by p, descending) + "그 밖" = the rest; `order` (labels) fixes which rows are shown */
export function topRows(x, n = 3, order = null) {
  const all = nextProbs(x), cand = all.slice(0, CANDS.length);
  const pick = order ? order.map(l => cand.find(c => c.label === l)) : [...cand].sort((a, b) => b.p - a.p).slice(0, n);
  const rest = 1 - pick.reduce((s, c) => s + c.p, 0);
  return [...pick.map(c => ({...c})), {label: '그 밖', p: rest, kind: 'rest'}];
}

/** the meter's five rows (fixed order, 2nd review): two ship words, two fruit words, and 그 밖 = every other candidate + the rest */
export const ROWS5 = ['한 척이', '위에서', '맛이', '한 개를'];
export function rows5(x) {
  const all = nextProbs(x), pick = ROWS5.map(l => all.find(c => c.label === l));
  return [...pick.map(c => ({label: c.label, p: c.p})), {label: '그 밖', p: 1 - pick.reduce((a, c) => a + c.p, 0), kind: 'rest'}];
}

// ---------------------------------------------------------------------------------------------
// the old way (recurrent memory)
// ---------------------------------------------------------------------------------------------
export const ALPHA = 0.6;
/** share of the first word in the memory n steps later */
export const oldShare = n => ALPHA ** n;

// ---------------------------------------------------------------------------------------------
// percentages that add up to 100 (largest value takes the rounding difference — PLAN §4)
// ---------------------------------------------------------------------------------------------
export function pct100(ps) {
  const r = ps.map(p => Math.round(p * 100)), d = 100 - r.reduce((a, b) => a + b, 0);
  if (d) r[argmax(ps)] += d;
  return r;
}

// ---------------------------------------------------------------------------------------------
// solved once
// ---------------------------------------------------------------------------------------------
export const RUN = {SHIP: run(SHIP), PEAR: run(PEAR), LONG: run(LONG)};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** per-layer movement of the last word ('배') */
export const moves = r => r.X.slice(1).map((x, l) => dist(x[x.length - 1], r.X[l][x.length - 1]));

const isMain = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const f = x => x.map(v => v.toFixed(3)).join(', '), pc = p => (p * 100).toFixed(1) + '%';
  for (const [name, words] of [['SHIP', SHIP], ['PEAR', PEAR]]) {
    const r = RUN[name], last = words.length - 1;
    console.log(`${name} ${words.join(' ')}`);
    console.log(`  attention of 배: ${words.map((w, j) => `${w} ${r.W[0][last][j].toFixed(3)}`).join(' · ')}  → % ${pct100(r.W[0][last]).join(' / ')}`);
    r.X.forEach((x, l) => console.log(`  layer ${l}: ${words.map((w, i) => `${w} (${f(x[i])})`).join('  ')}`));
    console.log(`  배 moved per layer: ${moves(r).map(v => v.toFixed(3)).join(' > ')}`);
    console.log(`  next after 4 layers: ${topRows(r.X[4][last]).map(c => `${c.label} ${pc(c.p)}`).join(' · ')}`);
    console.log(`  same rows at the start:  ${topRows(E.배, 3, topRows(r.X[4][last]).slice(0, 3).map(c => c.label)).map(c => `${c.label} ${pc(c.p)}`).join(' · ')}`);
  }
  console.log(`rows5 start: ${rows5(E.배).map(r => `${r.label} ${pc(r.p)}`).join(' · ')}`);
  console.log(`rows5 SHIP after 4: ${rows5(RUN.SHIP.X[4][2]).map(r => `${r.label} ${pc(r.p)}`).join(' · ')}`);
  console.log(`start (배 at E): all six ${nextProbs(E.배).map(c => `${c.label} ${pc(c.p)}`).join(' · ')}`);
  const L = RUN.LONG, li = LONG.length - 1;
  console.log(`LONG: 배 → ${LONG.map((w, j) => `${w} ${pc(L.W[0][li][j])}`).join(' · ')}`);
  console.log(`oldShare(7) = ${oldShare(7).toFixed(4)} (${Math.round(oldShare(7) * 100)}%) · steps ${[0, 1, 2, 3, 4, 5, 6, 7].map(n => oldShare(n).toFixed(3)).join(' ')}`);
  console.log(`attnAt(SHIP, 0) 배: ${f(attnAt(SHIP, 0)[2])} · attnAt(SHIP, 0.5): ${f(attnAt(SHIP, 0.5)[2])}`);
  for (const g of [3, 4, 5, 6]) console.log(`  γ ${g}: SHIP top ${pc(Math.max(...nextProbs(RUN.SHIP.X[4][2], g).slice(0, 6).map(c => c.p)))} · start max/min ${pc(Math.max(...nextProbs(E.배, g).slice(0, 6).map(c => c.p)))}/${pc(Math.min(...nextProbs(E.배, g).slice(0, 6).map(c => c.p)))}`);
}
