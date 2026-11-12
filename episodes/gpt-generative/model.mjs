// 43 GPT는 대답을 어떻게 쓸까 — explanatory next-piece model (no drawing). PLAN.md §4.
// A small hand-made probability table, NOT the values of a real GPT (brief.md 단순화 메모, README). Pieces are a little
// smaller than words. dist(context) reads the whole context but looks only at its last 1–2 pieces and at the current
// answer (the pieces after the last '?'), which is enough for the five paths below.
// Read by the picture, the instruments and --emit-sound. `node episodes/gpt-generative/model.mjs` prints the check values.
import {rng, stripPick} from './kit.mjs';

export const Q1 = ['하늘', '은', '왜', '파랄', '까', '?'];
export const Q2 = ['그럼', '노을', '은', '?'];
export const END = '■', REST = '그 밖';
export const PATH = {
  A: '햇빛 의 파란 빛 이 공기 에 더 잘 흩어 지기 때문 입니다 . ■'.split(' '),
  B: '공기 가 햇빛 의 파란 빛 을 더 많이 흩어 놓기 때문 입니다 . ■'.split(' '),
  C: '바다 가 하늘 에 비치기 때문 입니다 . ■'.split(' '),
  R: '저녁 에는 파란 빛 이 먼저 흩어 져서 붉은 빛 만 남 습니다 . ■'.split(' '),
};

// ---------------------------------------------------------------------------------------------
// the table: first matching rule wins (two-piece keys before one-piece keys). [piece, p] pairs; the rest is '그 밖'.
// ---------------------------------------------------------------------------------------------
const answerOf = ctx => { const i = ctx.lastIndexOf('?'); return ctx.slice(i + 1); };
const RULES = [
  // first piece of an answer
  [c => c.at(-1) === '?' && c.at(-2) === '까', [['햇빛', 0.62], ['공기', 0.17], ['바다', 0.09], ['하늘', 0.05]]],
  [c => c.at(-1) === '?' && c.includes('노을'), [['저녁', 0.86], ['해', 0.06], ['노을', 0.03]]],
  // two-piece keys
  [c => k2(c) === '? 공기', [['가', 0.90], ['의', 0.05], ['는', 0.03]]],
  [c => k2(c) === '? 바다', [['가', 0.92], ['의', 0.04]]],
  [c => k2(c) === '공기 가', [['햇빛', 0.84], ['파란', 0.08], ['빛', 0.05]]],
  [c => k2(c) === '바다 가', [['하늘', 0.88], ['파란', 0.07]]],
  [c => k2(c) === '가 하늘', [['에', 0.90], ['을', 0.06]]],
  [c => k2(c) === '하늘 에', [['비치기', 0.84], ['비쳐', 0.10]]],
  [c => k2(c) === '이 공기', [['에', 0.92], ['를', 0.04]]],
  [c => k2(c) === '공기 에', [['더', 0.88], ['잘', 0.07], ['부딪', 0.02]]],
  [c => k2(c) === '에 더', [['잘', 0.90], ['많이', 0.06]]],
  [c => k2(c) === '을 더', [['많이', 0.88], ['잘', 0.08]]],
  [c => k2(c) === '잘 흩어', [['지기', 0.93], ['져서', 0.04]]],
  [c => k2(c) === '많이 흩어', [['놓기', 0.82], ['지기', 0.12], ['서', 0.03]]],
  [c => k2(c) === '먼저 흩어', [['져서', 0.90], ['지고', 0.06]]],
  [c => k2(c) === '파란 빛' && answerOf(c)[0] === '공기', [['을', 0.90], ['이', 0.06]]],
  [c => k2(c) === '파란 빛', [['이', 0.89], ['을', 0.05], ['은', 0.03]]],
  [c => k2(c) === '빛 이' && answerOf(c).includes('저녁'), [['먼저', 0.86], ['더', 0.07], ['공기', 0.04]]],
  [c => k2(c) === '빛 이', [['공기', 0.87], ['먼저', 0.05], ['더', 0.04]]],
  [c => k2(c) === '붉은 빛', [['만', 0.85], ['이', 0.10]]],
  // one-piece keys
  [c => c.at(-1) === '햇빛', [['의', 0.91], ['이', 0.05], ['은', 0.02]]],
  [c => c.at(-1) === '의', [['파란', 0.88], ['빛', 0.06], ['색', 0.03]]],
  [c => c.at(-1) === '파란', [['빛', 0.93], ['색', 0.05]]],
  [c => c.at(-1) === '붉은', [['빛', 0.93], ['색', 0.05]]],
  [c => c.at(-1) === '을', [['더', 0.85], ['많이', 0.08], ['잘', 0.04]]],
  [c => c.at(-1) === '잘', [['흩어', 0.94], ['퍼', 0.03]]],
  [c => c.at(-1) === '많이', [['흩어', 0.92], ['퍼뜨', 0.04]]],
  [c => c.at(-1) === '먼저', [['흩어', 0.93], ['사라', 0.04]]],
  [c => ['지기', '놓기'].includes(c.at(-1)), [['때문', 0.95], ['쉽기', 0.02]]],
  [c => c.at(-1) === '비치기', [['때문', 0.93], ['쉽기', 0.03]]],
  [c => c.at(-1) === '때문', [['입니다', 0.90], ['이에요', 0.07]]],
  [c => c.at(-1) === '입니다', [['.', 0.96], ['!', 0.02]]],
  [c => c.at(-1) === '습니다', [['.', 0.97], ['!', 0.02]]],
  [c => c.at(-1) === '.', [['■', 0.90], ['그래서', 0.06]]],
  [c => c.at(-1) === '저녁', [['에는', 0.90], ['이', 0.05]]],
  [c => c.at(-1) === '에는', [['파란', 0.86], ['해', 0.08]]],
  [c => c.at(-1) === '져서', [['붉은', 0.88], ['노을', 0.06]]],
  [c => c.at(-1) === '만', [['남', 0.91], ['보이', 0.06]]],
  [c => c.at(-1) === '남', [['습니다', 0.95], ['아', 0.03]]],
];
function k2(c) { return c.slice(-2).join(' '); }
const FALLBACK = [['■', 0.6]];   // off the table (only reached by off-path draws while searching seeds)

/** next-piece distribution: [{piece, p}] descending, sum 1, last = {piece: '그 밖', p} */
export function dist(context) {
  const rule = RULES.find(([when]) => when(context));
  const rows = (rule ? rule[1] : FALLBACK).map(([piece, p]) => ({piece, p})).sort((a, b) => b.p - a.p);
  const rest = Math.max(0, 1 - rows.reduce((s, r) => s + r.p, 0));
  rows.push({piece: REST, p: +rest.toFixed(6)});
  return rows;
}
/** strip segments for a distribution (same order; scenes pass these to kit.strip / kit.stripPick) */
export const segsOf = d => d.map(r => ({label: r.piece === END ? '■' : r.piece, p: r.p}));
/** centre of segment i in u (0..1) */
export function segMid(d, i) { let a = 0; for (let k = 0; k < i; k++) a += d[k].p; return a + d[i].p / 2; }

/**
 * generate(context, {seed}) — draw by probability: per step u = rng(), cumulative rule of stripPick; if '그 밖' is hit
 * that step draws again (the shown u is the last one). generate(context, {greedy: true}) — always the widest segment
 * (u = its centre, so stripPick(u) is the same pick). → {pieces, steps: [{dist, u, pick, piece, p, redraws}]}
 */
export function generate(context, {seed = 1, greedy = false, max = 30} = {}) {
  const R = rng(seed), ctx = [...context], steps = [], pieces = [];
  for (let n = 0; n < max; n++) {
    const d = dist(ctx), segs = segsOf(d);
    let u, pick, redraws = 0;
    if (greedy) { pick = 0; u = segMid(d, 0); }
    else { for (;;) { u = R(); pick = stripPick(segs, u); if (pick >= 0 && d[pick].piece !== REST) break; redraws++; } }
    const piece = d[pick].piece;
    steps.push({dist: d, u, pick, piece, p: d[pick].p, redraws});
    pieces.push(piece); ctx.push(piece);
    if (piece === END) break;
  }
  return {pieces, steps};
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------------------------------------
// seeds — found by findSeeds() below (first seed from 1 upward that meets the condition; re-run to check)
// ---------------------------------------------------------------------------------------------
export const CTX_R = [...Q1, ...PATH.A.slice(0, -1), ...Q2];   // Q1 + A (without ■) + Q2
export const RUN_SEED = {A: 18, B: 2, C: 44, R: 2};
export const DROP_SEED = 83;
export function findSeeds() {
  const first = (ok, from = 1) => { for (let s = from; s < 100000; s++) if (ok(s)) return s; return -1; };
  return {
    A: first(s => { const g = generate(Q1, {seed: s}); return same(g.pieces, PATH.A) && g.steps[0].u > 0.2 && g.steps[0].u < 0.45; }),   // first u well inside 햇빛 (s11 close-up)
    B: first(s => same(generate(Q1, {seed: s}).pieces, PATH.B)),
    C: first(s => same(generate(Q1, {seed: s}).pieces, PATH.C)),
    R: first(s => same(generate(CTX_R, {seed: s}).pieces, PATH.R)),
    drops: first(s => { const c = dropCounts(dropsOf(s)); const last = stripPick(segsOf(dist(Q1)), dropsOf(s)[11]);
      return c['햇빛'] >= 7 && c['햇빛'] <= 8 && c['공기'] >= 2 && c['공기'] <= 3 && c['바다'] === 1 && c['하늘'] <= 1 && c[REST] === 0 && dist(Q1)[last].piece === '바다'; }),
  };
}
/** twelve u from a seed (first-step strip). The search also asks that the single '바다' drop is the last one, so it lands
 *  on "낮은 조각도" in s12. */
export function dropsOf(seed) { const R = rng(seed); return Array.from({length: 12}, () => R()); }
export function dropCounts(us) {
  const d = dist(Q1), segs = segsOf(d), c = Object.fromEntries(d.map(r => [r.piece, 0]));
  for (const u of us) c[d[stripPick(segs, u)].piece]++;
  return c;
}

export const RUN = {
  A: generate(Q1, {seed: RUN_SEED.A}),
  B: generate(Q1, {seed: RUN_SEED.B}),
  C: generate(Q1, {seed: RUN_SEED.C}),
  R: generate(CTX_R, {seed: RUN_SEED.R}),
  G: generate(Q1, {greedy: true}),
};
export const DROPS = dropsOf(DROP_SEED);
/** s10: how many times each of the three pieces follows the question in the "read" lines — ratio = first-step p
 *  (n = round(p / p(바다))) */
export const CORPUS = (() => { const d = dist(Q1), pb = d.find(r => r.piece === '바다').p;
  return Object.fromEntries(['햇빛', '공기', '바다'].map(k => [k, Math.round(d.find(r => r.piece === k).p / pb)])); })();
/** GPT-2/GPT-3 vocabulary size (Radford et al. 2019, "The vocabulary is expanded to 50,257") */
export const VOCAB = 50257;
export const pct = p => (p < 0.01 ? '<1' : String(Math.round(p * 100)));

// ---------------------------------------------------------------------------------------------
// check output
// ---------------------------------------------------------------------------------------------
const isMain = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const ok = (k, ref) => (same(RUN[k].pieces, ref) ? 'OK' : 'MISMATCH');
  for (const [k, ref] of [['A', PATH.A], ['B', PATH.B], ['C', PATH.C], ['R', PATH.R], ['G', PATH.A]])
    console.log(`RUN.${k}${k === 'G' ? ' (greedy)' : ` (seed ${RUN_SEED[k]})`}: ${RUN[k].pieces.join(' ')}  [${ok(k, ref)}]  path p: ${RUN[k].steps.map(s => s.p.toFixed(2)).join(' ')}  redraws ${RUN[k].steps.reduce((a, s) => a + s.redraws, 0)}`);
  console.log('dist(Q1):', dist(Q1).map(r => `${r.piece} ${r.p.toFixed(2)}`).join(' · '));
  console.log('path C, last steps p:', RUN.C.steps.slice(1).map(s => `${s.piece} ${pct(s.p)}%`).join(' · '));
  for (const k of ['A', 'B', 'C', 'R']) { const bad = RUN[k].steps.slice(k === 'R' ? 0 : 1).filter(s => s.p < 0.8 || s.p > 0.97); if (bad.length) console.log(`  warning: path ${k} steps outside 0.80–0.97:`, bad.map(s => s.piece)); }
  console.log('DROPS (seed ' + DROP_SEED + '):', DROPS.map(u => u.toFixed(3)).join(' '), '→', JSON.stringify(dropCounts(DROPS)), 'last →', dist(Q1)[stripPick(segsOf(dist(Q1)), DROPS[11])].piece);
  console.log('CORPUS:', JSON.stringify(CORPUS), 'VOCAB', VOCAB);
  if (process.argv.includes('--find')) console.log('findSeeds():', JSON.stringify(findSeeds()));
}
