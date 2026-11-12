// 44 GPT는 어떻게 배웠을까 — a really trained tiny next-piece model (PLAN.md §1). NOT GPT: ~1,900 numbers, 25 pieces.
// Pure computation (no drawing). `node episodes/gpt-pretrained/model.mjs` prints the check values;
// `node episodes/gpt-pretrained/model.mjs --search` re-runs the seed / step-size search that fixed SEED and LR below.
//
// logit(next | ctx) = c[next] + A[prev1][next] + B[prev2][next] + mean_{w ∈ ctx} C[w][next];  p = softmax(logit)
// Loss at one position = −ln p(target). One step = plain gradient descent on that one position with a fixed step size LR.
// Everything the scenes draw (probabilities, dial needles, the curve, step counts) comes from this file.

// ----------------------------------------------------------------------------------------------------
// pieces, text
// ----------------------------------------------------------------------------------------------------
export const VOCAB = ['해는', '달은', '별은', '비는', '눈은', '물은', '동쪽에서', '서쪽으로', '밤에', '낮에', '구름에서', '아래로',
  '뜬다', '진다', '빛난다', '내린다', '흐른다', '.',                       // the 18 "front" pieces (dials)
  '질문:', '대답:', '어디에서', '어디로', '뜨나', '지나', '?'];
export const V = VOCAB.length, NFRONT = 18;
export const ID = Object.fromEntries(VOCAB.map((w, i) => [w, i]));
const split = s => s.split(' ').map(w => { if (!(w in ID)) throw new Error('unknown piece ' + w); return ID[w]; });
export const CORPUS = ['해는 동쪽에서 뜬다 .', '해는 서쪽으로 진다 .', '달은 동쪽에서 뜬다 .', '달은 서쪽으로 진다 .', '별은 밤에 빛난다 .',
  '해는 낮에 빛난다 .', '비는 구름에서 내린다 .', '눈은 구름에서 내린다 .', '물은 아래로 흐른다 .'];
export const DIALOG = ['질문: 해는 어디에서 뜨나 ? 대답: 동쪽에서 뜬다 .', '질문: 해는 어디로 지나 ? 대답: 서쪽으로 진다 .',
  '질문: 달은 어디에서 뜨나 ? 대답: 동쪽에서 뜬다 .'];
export const TEST = {ctx: '질문: 달은 어디로 지나 ? 대답:', target: '서쪽으로'};       // not in DIALOG
export const EX = {ctx: '해는 동쪽에서', target: '뜬다'};                            // the episode's one example
export const EX2 = {ctx: '해는 서쪽으로', target: '진다'};
/** all positions of a list of sentences: predict piece i from pieces 0..i−1 (i ≥ 1) */
function positions(list) {
  const out = [];
  list.forEach((s, si) => { const ids = split(s); for (let i = 1; i < ids.length; i++) out.push({sent: si, pos: i, ctx: ids.slice(0, i), target: ids[i]}); });
  return out;
}
export const POS = positions(CORPUS), POS_DIALOG = positions(DIALOG);
export const toIds = s => (Array.isArray(s) ? s : split(s));

// ----------------------------------------------------------------------------------------------------
// numbers (parameters): flat Float64Array [c (V) | A (V·V) | B (V·V) | C (V·V)]
// ----------------------------------------------------------------------------------------------------
export const NPARAM = 3 * V * V + V;
const oC = 0, oA = V, oB = V + V * V, oCC = V + 2 * V * V;
function mulberry32(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normals(seed, n, sd) { const r = mulberry32(seed), out = new Float64Array(n); for (let i = 0; i < n; i += 2) { const u = Math.max(1e-12, r()), v = r(), m = Math.sqrt(-2 * Math.log(u)); out[i] = sd * m * Math.cos(2 * Math.PI * v); if (i + 1 < n) out[i + 1] = sd * m * Math.sin(2 * Math.PI * v); } return out; }
export function softmax(z) { let m = -Infinity; for (const v of z) m = Math.max(m, v); const e = z.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); }
function logits(P, ctx) {
  const n = ctx.length, a = ctx[n - 1], b = n >= 2 ? ctx[n - 2] : -1, z = new Array(V);
  for (let j = 0; j < V; j++) {
    let v = P[oC + j] + P[oA + a * V + j] + (b >= 0 ? P[oB + b * V + j] : 0), m = 0;
    for (const w of ctx) m += P[oCC + w * V + j];
    z[j] = v + m / n;
  }
  return z;
}
/** probabilities over all V pieces after ctx (array of ids or a string) */
export const probs = (P, ctx) => softmax(logits(P, toIds(ctx)));
export const pOf = (P, ctx, target) => probs(P, ctx)[typeof target === 'number' ? target : ID[target]];
/**
 * one gradient step on −ln p(target | ctx). → {params, pBefore, pAfter, grad}
 * grad = d(−ln p)/dA[prev1][j] for the 18 front pieces (= p_j − [j = target]); the step moves A by −lr·grad.
 */
export function step(P, ctx, target, lr) {
  ctx = toIds(ctx); target = typeof target === 'number' ? target : ID[target];
  const p = probs(P, ctx), n = ctx.length, a = ctx[n - 1], b = n >= 2 ? ctx[n - 2] : -1, Q = Float64Array.from(P);
  for (let j = 0; j < V; j++) {
    const g = p[j] - (j === target ? 1 : 0);       // d loss / d logit_j
    Q[oC + j] -= lr * g; Q[oA + a * V + j] -= lr * g; if (b >= 0) Q[oB + b * V + j] -= lr * g;
    for (const w of ctx) Q[oCC + w * V + j] -= lr * g / n;
  }
  return {params: Q, pBefore: p[target], pAfter: probs(Q, ctx)[target], grad: p.slice(0, NFRONT).map((v, j) => v - (j === target ? 1 : 0))};
}
/** copy of P with A[prev][next] += dv (s10: turn one dial by hand and recompute) */
export function withA(P, prev, next, dv) { const Q = Float64Array.from(P), a = typeof prev === 'number' ? prev : ID[prev], j = typeof next === 'number' ? next : ID[next]; Q[oA + a * V + j] += dv; return Q; }
/** element-wise mix of two parameter sets (the scenes animate one step by moving every number from before to after) */
export function lerpP(P, Q, q) { if (q <= 0) return P; if (q >= 1) return Q; const R = new Float64Array(P.length); for (let i = 0; i < P.length; i++) R[i] = P[i] + (Q[i] - P[i]) * q; return R; }
/** the 18 dial values: A[piece][front j] */
export const rowA = (P, piece) => { const a = typeof piece === 'number' ? piece : ID[piece]; return Array.from(P.slice(oA + a * V, oA + a * V + NFRONT)); };
/** mean probability given to the right piece over every corpus position */
export const meanCorrect = P => POS.reduce((s, q) => s + probs(P, q.ctx)[q.target], 0) / POS.length;

// ----------------------------------------------------------------------------------------------------
// training run (fixed seeds)
// ----------------------------------------------------------------------------------------------------
export const SEED = 130, SD = 0.8, ORDER_SEED = 7, LR = 0.15, BIG_X = 30;   // fixed by --search (seed and LR rule: see search() at the bottom)
export const init = normals(SEED, NPARAM, SD);
const exIds = split(EX.ctx), exT = ID[EX.target], ex2Ids = split(EX2.ctx), ex2T = ID[EX2.target];
const sameCtx = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** pretraining: step 1 = the example, then seeded shuffles of every corpus position until both examples ≥ 0.9 */
function pretrain(P0, lr, orderSeed, maxSteps = 5000) {
  const r = mulberry32(orderSeed), trace = [null], snaps = [P0], curve = [meanCorrect(P0)];
  let P = P0, k = 0, queue = [{sent: 0, pos: 2, ctx: exIds, target: exT}];
  while (k < maxSteps) {
    if (!queue.length) { queue = POS.slice(); for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; } }
    const q = queue.shift(), s = step(P, q.ctx, q.target, lr);
    k++; P = s.params; snaps.push(P); curve.push(meanCorrect(P));
    trace.push({sent: q.sent, pos: q.pos, ctx: q.ctx, target: q.target, pBefore: s.pBefore, pAfter: s.pAfter, grad: s.grad});
    if (pOf(P, exIds, exT) >= 0.9 && pOf(P, ex2Ids, ex2T) >= 0.9) break;
  }
  return {trace, snaps, curve, N: k};
}
/** fine-tuning on DIALOG: seeded shuffles of every dialog position, whole passes, until the unseen question ≥ 0.6 */
function tune(P0, lr, orderSeed, maxPasses = 200) {
  const r = mulberry32(orderSeed + 1), trace = [], test = [pOf(P0, TEST.ctx, TEST.target)];
  let P = P0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const q = POS_DIALOG.slice(); for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    for (const x of q) { const s = step(P, x.ctx, x.target, lr); P = s.params; trace.push({...x, pBefore: s.pBefore, pAfter: s.pAfter, grad: s.grad}); test.push(pOf(P, TEST.ctx, TEST.target)); }
    if (test[test.length - 1] >= 0.6) break;
  }
  return {trace, P, N: trace.length, test};
}

function run(P0, lr) {
  const PRE = pretrain(P0, lr, ORDER_SEED), N_PRE = PRE.N, TRACE = PRE.trace, SNAPS = PRE.snaps;
  const EX_STEPS = TRACE.map((x, k) => (x && sameCtx(x.ctx, exIds) && x.target === exT ? k : -1)).filter(k => k > 0);
  const K_SMALL = EX_STEPS.find(k => TRACE[k].pBefore >= 0.6);
  const TU = tune(SNAPS[N_PRE], lr, ORDER_SEED);
  // BIG: from the params before one of the example's steps, the same step with BIG_X·lr. Does another line's right piece drop?
  const bigAt = (k, other) => {
    const P = SNAPS[k - 1], o = {ctx: toIds(other.ctx), target: ID[other.target]};
    const sm = step(P, exIds, exT, lr), bg = step(P, exIds, exT, BIG_X * lr);
    return {snapStep: k, other, pSelf: [sm.pBefore, bg.pAfter], pSelfSmall: [sm.pBefore, sm.pAfter],
      pOther: [pOf(P, o.ctx, o.target), pOf(bg.params, o.ctx, o.target)], pOtherSmall: [pOf(P, o.ctx, o.target), pOf(sm.params, o.ctx, o.target)],
      paramsBefore: P, paramsSmall: sm.params, paramsBig: bg.params};
  };
  // other line: '해는 서쪽으로 [진다]' first. Snapshot: the K_SMALL step itself (the scene goes straight on from s14's step)
  // when its drop is clear (≥ 0.3); otherwise the example step (≤ N_PRE) with the clearest drop.
  const drop = b => b.pOther[0] - b.pOther[1], ks = EX_STEPS.filter(k => k <= N_PRE);
  let BIG = K_SMALL ? bigAt(K_SMALL, EX2) : null;
  if (!BIG || drop(BIG) < 0.3) BIG = ks.map(k => bigAt(k, EX2)).reduce((m, b) => (drop(b) > drop(m) ? b : m));
  if (drop(BIG) <= 0.05) {   // fall back: any other corpus position (reported, never invented)
    for (const q of POS.filter(q => !sameCtx(q.ctx, exIds))) for (const k of ks) { const b = bigAt(k, {ctx: q.ctx.map(i => VOCAB[i]).join(' '), target: VOCAB[q.target]}); if (drop(b) > drop(BIG)) BIG = b; }
  }
  return {PRE, N_PRE, TRACE, SNAPS, CURVE: PRE.curve, EX_STEPS, K_SMALL, TU, BIG, drop: drop(BIG)};
}
const R = run(init, LR);
export const N_PRE = R.N_PRE;
export const TRACE = R.TRACE;                   // TRACE[k] (k ≥ 1) = step k: uses SNAPS[k − 1], gives SNAPS[k]
export const CURVE = R.CURVE;                   // CURVE[k] = mean right-piece probability after k steps (k = 0..N_PRE)
const SNAPS = R.SNAPS, TU = R.TU;
export const EX_STEPS = R.EX_STEPS;             // steps on the example
export const K_SMALL = R.K_SMALL;               // earliest step on the example whose pBefore ≥ 0.6
export const N_TUNE = TU.N, TUNE_TRACE = TU.trace, TEST_CURVE = TU.test;
export const BIG = R.BIG;

/** params the scenes use: 0 (init), 1, K_SMALL − 1, K_SMALL, BIG.snapStep − 1, BIG.snapStep, N_PRE, N_PRE + N_TUNE ('tuned') */
export const SNAP = {0: SNAPS[0], 1: SNAPS[1], [K_SMALL - 1]: SNAPS[K_SMALL - 1], [K_SMALL]: SNAPS[K_SMALL], [BIG.snapStep - 1]: SNAPS[BIG.snapStep - 1],
  [BIG.snapStep]: SNAPS[BIG.snapStep], [N_PRE]: SNAPS[N_PRE], [N_PRE + N_TUNE]: TU.P, tuned: TU.P, pre: SNAPS[N_PRE]};
/** any pretraining snapshot (for the fast-forward scenes: dials turning as the curve rises) */
export const snapAt = k => SNAPS[Math.max(0, Math.min(N_PRE, Math.round(k)))];
/** dialog snapshots: after j tuning steps (0..N_TUNE) */
const TSNAPS = [SNAPS[N_PRE]]; { let P = SNAPS[N_PRE]; for (const x of TU.trace) { P = step(P, x.ctx, x.target, LR).params; TSNAPS.push(P); } }
export const tuneSnapAt = j => TSNAPS[Math.max(0, Math.min(N_TUNE, Math.round(j)))];

/** greedy continuation (highest piece each time) until '.' or max pieces — used for the chat stream in s22 */
export function greedy(P, ctx, max = 4) { const ids = toIds(ctx).slice(), out = []; for (let i = 0; i < max; i++) { const p = probs(P, ids), j = p.indexOf(Math.max(...p)); out.push(VOCAB[j]); ids.push(j); if (VOCAB[j] === '.') break; } return out; }
/** top-k rows for probability bars: {ids, p} sorted desc, excluding `exclude` ids */
export function top(P, ctx, k = 3, exclude = []) {
  const p = probs(P, ctx), ids = p.map((v, i) => i).filter(i => !exclude.includes(i)).sort((a, b) => p[b] - p[a]).slice(0, k);
  return ids.map(i => ({id: i, piece: VOCAB[i], p: p[i]}));
}

// ----------------------------------------------------------------------------------------------------
// check output / search
// ----------------------------------------------------------------------------------------------------
const pc = x => (100 * x).toFixed(1) + '%';
function report() {
  const p0 = probs(init, exIds), t4 = top(init, exIds, 4);
  console.log(`numbers (parameters): ${NPARAM}  (3·V·V + V, V = ${V})`);
  console.log(`seed ${SEED} (init normal sd ${SD}), order seed ${ORDER_SEED}, step size LR ${LR}, BIG ×${BIG_X}`);
  console.log(`initial p(· | ${EX.ctx}): top4 ${t4.map(x => x.piece + ' ' + pc(x.p)).join(', ')}; ${EX.target} ${pc(p0[exT])} (rank ${[...p0].sort((a, b) => b - a).indexOf(p0[exT]) + 1})`);
  console.log(`first step: p(${EX.target}) ${pc(TRACE[1].pBefore)} → ${pc(TRACE[1].pAfter)} (×${(TRACE[1].pAfter / TRACE[1].pBefore).toFixed(2)}); dial ${EX.target} ${rowA(SNAPS[0], '동쪽에서')[exT].toFixed(3)} → ${rowA(SNAPS[1], '동쪽에서')[exT].toFixed(3)}`);
  console.log(`example steps: ${EX_STEPS.filter(k => k <= N_PRE).map(k => k + ':' + pc(TRACE[k].pBefore)).join(' ')}`);
  console.log(`K_SMALL ${K_SMALL}: p ${pc(TRACE[K_SMALL].pBefore)} → ${pc(TRACE[K_SMALL].pAfter)}; −ln p ${(-Math.log(TRACE[K_SMALL].pBefore)).toFixed(3)} (first ${(-Math.log(TRACE[1].pBefore)).toFixed(3)}); dial Δ ${(rowA(SNAPS[K_SMALL], '동쪽에서')[exT] - rowA(SNAPS[K_SMALL - 1], '동쪽에서')[exT]).toFixed(3)} (first ${(rowA(SNAPS[1], '동쪽에서')[exT] - rowA(SNAPS[0], '동쪽에서')[exT]).toFixed(3)})`);
  console.log(`BIG at step ${BIG.snapStep}, other "${BIG.other.ctx} → ${BIG.other.target}": pSelf ${pc(BIG.pSelf[0])} → ${pc(BIG.pSelf[1])} (small → ${pc(BIG.pSelfSmall[1])}); pOther ${pc(BIG.pOther[0])} → ${pc(BIG.pOther[1])} (small → ${pc(BIG.pOtherSmall[1])})`);
  console.log(`N_PRE ${N_PRE}, N_TUNE ${N_TUNE} (${N_TUNE / POS_DIALOG.length} passes of ${POS_DIALOG.length} dialog positions); corpus positions ${POS.length}`);
  console.log(`after pretraining: p(뜬다 | 해는 동쪽에서) ${pc(pOf(SNAPS[N_PRE], exIds, exT))}, p(진다 | 해는 서쪽으로) ${pc(pOf(SNAPS[N_PRE], ex2Ids, ex2T))}`);
  console.log(`unseen question "${TEST.ctx} → ${TEST.target}": before tuning ${pc(TEST_CURVE[0])} (top ${top(SNAPS[N_PRE], TEST.ctx, 3).map(x => x.piece + ' ' + pc(x.p)).join(', ')}), after ${pc(TEST_CURVE[N_TUNE])} (top ${top(TU.P, TEST.ctx, 3).map(x => x.piece + ' ' + pc(x.p)).join(', ')})`);
  console.log(`after tuning: p(뜬다 | 해는 동쪽에서) ${pc(pOf(TU.P, exIds, exT))} (unchanged meaning check)`);
  console.log(`CURVE ${pc(CURVE[0])} → ${pc(CURVE[N_PRE])}`);
}
function search() {
  // seeds: p(뜬다 | 해는 동쪽에서) in 2–6 % and a wrong piece ≥ 20 % on top; LR: first step ×1.3–2
  for (const sd of [0.8, 0.9, 1.0]) for (let seed = 1; seed < 400; seed++) {
    const P = normals(seed, NPARAM, sd), p = probs(P, exIds), m = Math.max(...p), am = p.indexOf(m);
    if (p[exT] < 0.02 || p[exT] > 0.06 || m < 0.2 || am === exT) continue;
    const lrs = [0.1, 0.15, 0.2, 0.25, 0.3].filter(lr => { const s = step(P, exIds, exT, lr); return s.pAfter / s.pBefore >= 1.3 && s.pAfter / s.pBefore <= 2; });
    for (const lr of lrs) {
      const r = run(P, lr); if (!r.K_SMALL || am >= NFRONT) continue;
      console.log(`sd ${sd} seed ${seed} lr ${lr}: p ${pc(p[exT])}, top ${VOCAB[am]} ${pc(m)}; first ×${(r.TRACE[1].pAfter / r.TRACE[1].pBefore).toFixed(2)}; N_PRE ${r.N_PRE}; K_SMALL ${r.K_SMALL} (${pc(r.TRACE[r.K_SMALL].pBefore)}); BIG @${r.BIG.snapStep} ${r.BIG.other.ctx}: ${pc(r.BIG.pOther[0])}→${pc(r.BIG.pOther[1])} self→${pc(r.BIG.pSelf[1])}; tuned ex ${pc(pOf(r.TU.P, exIds, exT))}; N_TUNE ${r.TU.N} test ${pc(r.TU.test[0])}→${pc(r.TU.test[r.TU.N])}`);
    }
  }
}
const isMain = import.meta.url === new URL('file://' + (process.argv[1] || '')).href;
if (isMain) (process.argv.includes('--search') ? search : report)();
