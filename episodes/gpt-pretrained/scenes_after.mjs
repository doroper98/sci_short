// 44 GPT는 어떻게 배웠을까 — scale (s17–s18), emerge (s19–s20), tune (s21), frozen (s22), close (s23). PLAN.md §3 + §1.1/§1.2.
// Exports: scenes, planAfter(tl, P), soundAfter(tl, P), titles, signature(P).
import {PAL, clamp, lerp, smooth, easeOut, easeIn, easeInOut, wd, bigNum, glowBegin, glowFlush, chip, tag, snd, withAlpha, rgba, line} from '../gpt-generative/kit.mjs';
import {camAt, camPt, backOut, spring, drop, rollNum, speedBadge, streak, ringPop, squash} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
import {LINE, BODY, DG, DIALC, BARS, LOSS, CPANEL, CP, BIGPOS, INLET, BOX, CAM_HOME, lineBoxes, boxOf, union, camKey, visA, bodyLabel, withCamH,
  coverChip, revealGlow, body, dialBoard, arrowLen, barRows, bars, rowCy, barX, lossBar, curvePanel, flowIn, pulseBack} from './parts.mjs';
import {ROW_IDS} from './scenes_core.mjs';
import {posterWorld} from './scenes_intro.mjs';

const PRE = M.SNAP.pre, TUNED = M.SNAP.tuned, S0 = M.SNAP[0], S1 = M.SNAP[1];
const EAST = M.toIds('해는 동쪽에서'), WEST = M.toIds('해는 서쪽으로');
const EM_ROWS = (() => { const p = M.probs(PRE, EAST), q = M.probs(PRE, WEST), ids = [M.ID['뜬다'], M.ID['진다']];
  const rest = p.map((v, i) => i).filter(i => !ids.includes(i)).sort((a, b) => (p[b] + q[b]) - (p[a] + q[a])).slice(0, 2); return ids.concat(rest); })();
const TEST = M.TEST.ctx.split(' '), TEST_IDS = M.toIds(M.TEST.ctx);
const TU_ROWS = (() => { const p = M.probs(PRE, TEST_IDS), w = M.ID['서쪽으로'], e = M.ID['동쪽에서']; return [w, e].concat(p.map((v, i) => i).filter(i => i !== w && i !== e).sort((a, b) => p[b] - p[a]).slice(0, 2)); })();
const DLG = o => ({size: 40, y0: LINE.y0, x0: 40, o: {padX: 12, gap: 8, x1: 1040}});
const dlgBoxes = pieces => { const d = DLG(); return lineBoxes(pieces, d.size, d.y0, d.x0, d.o); };
const EXP = ['해는', '동쪽에서', '뜬다'];
const OFFA = M.ID ? 25 + M.ID['동쪽에서'] * 25 : 0;   // flat index of A[동쪽에서][0] (c is V numbers, then A row by row)

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planAfter(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc, HM = c => ({t: c, ...CAM_HOME});
  {
    const S = {};
    S.j1 = W_('s17', '숫자가') - 0.1;               // jump 1: 18 dials → all 1,900 numbers of this model
    S.j2 = W_('s17', '천칠백오십억개') - 0.15;      // jump 2: pull back to the dot wall
    S.rain = W_('s17', '삼천억조각') - 0.1;          // pieces pour in
    S.time0 = W_('s18', '사람이') - 0.1; S.fill0 = W_('s18', '여덟시간씩'); S.fill1 = W_('s18', '사천년쯤') - 0.05;
    S.year = W_('s18', '사천년쯤') - 0.05;
    S.life = W_('s18', '하루');
    // rain: seeded drops (x, start), ~22 per second until the scene ends
    const r = mulberry(5); S.drops = [];
    for (let t = S.rain; t < SC.scale.end + 0.6; t += 1 / 22) S.drops.push({t, x: 80 + 920 * r(), y1: 330 + 560 * r(), w: 20 + 22 * r()});
    S.cam = [HM(SC.scale.start), HM(SC.scale.end)];
    P.scale = S;
  }
  {
    const E = {};
    E.back = SC.emerge.start + 0.05;                 // the wall comes back into one body with 18 dials
    E.flow = W_('s19', '다음을') - 0.35; E.bars = W_('s19', '다음을') + 0.05;
    E.tog = [W_('s19', '사실도'), W_('s20', '잘'), W_('s20', '고쳐'), W_('s20', '문법과')];   // 동→서, 서→동, 동→서, 서→동
    E.nobody = W_('s20', '아무도');
    E.push = W_('s20', '숫자') + 0.0;
    const fAll = union(boxOf(lineBoxes(EXP)), BOX.body, BOX.bars);
    E.cam = [HM(SC.emerge.start), HM(E.tog[0] - 0.3), camKey(E.tog[0] + 0.1, fAll), camKey(E.nobody - 0.4, fAll), HM(E.nobody),
      HM(E.push - 0.2), camKey(E.push + 0.4, BOX.body), camKey(SC.emerge.end, BOX.body)];
    void fAll;
    P.emerge = E;
  }
  {
    const T = {};
    T.in = SC.tune.start + 0.05; T.bars0 = W_('s21', '미리') + 0.2;
    T.rounds = [W_('s21', '사람이') - 0.1, W_('s21', '대화') - 0.05, W_('s21', '같은') - 0.05];
    T.j = [0, 1, 2, 3].map(r => Math.round(r * M.N_TUNE / 3));
    T.test = W_('s21', '질문에') - 0.1;
    T.cam = [HM(SC.tune.start), HM(T.test + 0.3), camKey(T.test + 0.7, union(BOX.bars, {x0: 40, y0: LINE.y0, x1: 1040, y1: LINE.y0 + 60})), camKey(SC.tune.end, union(BOX.bars, {x0: 40, y0: LINE.y0, x1: 1040, y1: LINE.y0 + 60}))];
    P.tune = T;
  }
  {
    const F = {};
    F.clear = W_('s22', '남는') - 0.1; F.keep = W_('s22', '숫자뿐이고') - 0.1;
    F.chat0 = W_('s22', '대화하는') - 0.1; F.chat1 = SC.frozen.end;
    // the chat stream: question (given) then answer (made), repeated; one piece every 0.16 s
    // questions the tiny model knows; each answer is the tuned model's own greedy continuation (model.greedy)
    const Q = ['질문: 달은 어디로 지나 ?', '질문: 해는 어디에서 뜨나 ?', '질문: 해는 어디로 지나 ?', '질문: 달은 어디에서 뜨나 ?', '질문: 달은 어디로 지나 ?'];
    F.stream = []; let t = F.chat0;
    for (const q of Q) { for (const w of q.split(' ')) { F.stream.push({w, kind: 'given', t}); t += 0.13; } F.stream.push({w: '대답:', kind: 'given', t}); t += 0.13;
      for (const w of M.greedy(TUNED, q + ' 대답:')) { F.stream.push({w, kind: 'made', t}); t += 0.13; } t += 0.1; }
    F.answers = Q.map(q => M.greedy(TUNED, q + ' 대답:').join(' '));
    const fB = union(BOX.body, {x0: 40, y0: LINE.y0, x1: 1040, y1: LINE.y0 + 60});
    F.cam = [HM(SC.frozen.start), HM(F.clear + 0.2), camKey(F.keep, BOX.body), camKey(F.chat0 - 0.3, BOX.body), camKey(F.chat0 + 0.2, fB), camKey(SC.frozen.end, fB)];
    P.frozen = F;
  }
  {
    const C = {};
    C.restart = W_('s23', '지피티는') - 0.05;        // back to the first numbers
    C.flow = W_('s23', '다음') - 0.15; C.bars = W_('s23', '조각') - 0.05; C.open = W_('s23', '맞히기를');
    C.loss = W_('s23', '수없이') - 0.05; C.back = W_('s23', '되풀이하며');
    C.turn = W_('s23', '틀린') - 0.05; C.curve0 = W_('s23', '숫자를') - 0.1; C.curve1 = P.poster - 0.15;
    C.arrive = DIALC.map((_, i) => C.back + 0.3 + (2 - Math.floor(i / 6)) * 0.07 + (i % 6) * 0.025 + 0.4);
    C.cam = [HM(SC.close.start), HM(SC.close.end)];
    P.close = C;
  }
  return P;
}
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// =====================================================================================================
// SCALE — three jumps: 18 dials → the 1,900 numbers of this model → a wall of dots; pieces pour in; 4,000 years
// =====================================================================================================
const GRID = {cols: 50, rows: 38, x0: BODY.x + 22, x1: BODY.x + BODY.w - 22, y0: BODY.y + 74, y1: BODY.y + BODY.h - 18};
const gx = i => GRID.x0 + (i % GRID.cols + 0.5) * (GRID.x1 - GRID.x0) / GRID.cols, gy = i => GRID.y0 + (Math.floor(i / GRID.cols) + 0.5) * (GRID.y1 - GRID.y0) / GRID.rows;
const BC = [BODY.x + BODY.w / 2, BODY.y + BODY.h / 2];
/** all numbers of the model as tiny dials inside the body (matte); the 18 shown before keep a warm ring */
function numberGrid(stage, Pm, a, hiA) {
  const c = stage.ctx, r = 6;
  withAlpha(c, a, () => {
    c.fillStyle = '#16232A';
    for (let i = 0; i < M.NPARAM; i++) { c.beginPath(); c.arc(gx(i), gy(i), r, 0, 6.2832); c.fill(); }
    c.strokeStyle = '#B9C4C8'; c.lineWidth = 1.4; c.beginPath();
    for (let i = 0; i < M.NPARAM; i++) { const an = -Math.PI / 2 + clamp(Pm[i] / 1.6, -1, 1) * 0.75 * Math.PI, x = gx(i), y = gy(i); c.moveTo(x, y); c.lineTo(x + 5 * Math.cos(an), y + 5 * Math.sin(an)); }
    c.stroke();
    if (hiA > 0) { c.strokeStyle = rgba(PAL.warm, 0.95 * hiA); c.lineWidth = 2; for (let j = 0; j < 18; j++) { c.beginPath(); c.arc(gx(OFFA + j), gy(OFFA + j), r + 2.5, 0, 6.2832); c.stroke(); } }
  });
}
/** the wall: copies of the body in a grid around the real one, the whole thing scaled by s about the body centre */
function dotWall(stage, s, a) {
  if (a <= 0) return;
  const c = stage.ctx, pw = (BODY.w + 40) * s, ph = (BODY.h + 40) * s, n = Math.ceil(700 / pw) + 1, m = Math.ceil(700 / ph) + 1;
  withAlpha(c, a, () => {
    for (let i = -n; i <= n; i++) for (let j = -m; j <= m; j++) {
      if (!i && !j) continue;
      const x = BC[0] + i * pw - BODY.w * s / 2, y = BC[1] + j * ph - BODY.h * s / 2;
      if (x > 1100 || x + BODY.w * s < -20 || y > 900 || y + BODY.h * s < 280) continue;
      const edge = clamp((900 - (y + BODY.h * s)) / 60);          // the wall thins out above the instrument panel
      withAlpha(c, edge, () => {
        c.fillStyle = '#1E2B31'; c.fillRect(x, y, BODY.w * s, BODY.h * s);
        // the copy's numbers as dots: the finer the pull-back, the fewer dots fit (≥ 4 px apart)
        const nx = clamp(Math.floor(BODY.w * s / 5), 2, 50), ny = clamp(Math.floor(BODY.h * s / 5), 1, 38);
        c.fillStyle = rgba('#9FB0B6', 0.55);
        for (let u = 0; u < nx; u++) for (let v = 0; v < ny; v++) c.fillRect(x + (u + 0.5) * BODY.w * s / nx - 0.9, y + (v + 0.5) * BODY.h * s / ny - 0.9, 1.8, 1.8);
      });
    }
  });
}
function scaleScene(stage, t, p, ctx) {
  const P = ctx.P, S = P.scale, F = P.fix, cam = camAt(t, S.cam), {GW, GC} = glowBegin(), SC = P.sc, st = SC.scale.start;
  const q1 = backOut(clamp((t - S.j1) / 0.6)), q2 = easeInOut(clamp((t - S.j2) / 0.8));
  const s = Math.exp(Math.log(0.05) * q2);                  // pull-back: the body shrinks to one cell of the wall
  withCamH(stage, cam, () => {
    const c = stage.ctx;
    // the time-lapse's last line flies up out
    { const q = clamp((t - st) / 0.35); if (q < 1) { const tr = M.TRACE[M.N_PRE], bx = lineBoxes(M.CORPUS[tr.sent].split(' ').slice(0, tr.pos + 1)); c.save(); c.translate(0, -300 * q * q); bx.forEach(b => chip(stage, b, {kind: 'given', a: 1 - q})); c.restore(); } }
    dotWall(stage, s, smooth((t - S.j2) / 0.3));
    c.save(); c.translate(BC[0], BC[1]); c.scale(s, s); c.translate(-BC[0], -BC[1]);
    body(stage, 1, {label: s > 0.6 && bodyLabel(cam)});
    if (q1 < 1) dialBoard(stage, M.rowA(PRE, '동쪽에서'), {a: 1 - clamp(q1)}, i => ({s: 1 - 0.85 * clamp(q1), r: 1}));
    if (t >= S.j1) numberGrid(stage, PRE, clamp((t - S.j1) / 0.25), (1 - smooth((t - S.j2 - 0.5) / 0.3)));
    c.restore();
    if (t >= S.j2 + 0.5) { const bw = BODY.w * s, bh = BODY.h * s; withAlpha(c, smooth((t - S.j2 - 0.5) / 0.3), () => { c.strokeStyle = PAL.warm; c.lineWidth = 2.5; c.strokeRect(BC[0] - bw / 2 - 4, BC[1] - bh / 2 - 4, bw + 8, bh + 8); }); }
    // the rain of pieces (matte cool tiles, no text — too small for the 34 px floor)
    for (const d of S.drops) {
      const q = (t - d.t) / 0.55; if (q < 0 || q > 1.15) continue;
      const y = lerp(250, d.y1, drop(q)), k = q > 1 ? 1 - (q - 1) / 0.15 : 1;
      if (q < 0.72) streak(stage, [d.x + d.w / 2, 250], [d.x + d.w / 2, d.y1], drop(q), {color: PAL.cool, a: 0.3, w: 4, len: 0.3});
      withAlpha(c, k, () => { c.fillStyle = '#1F3B48'; c.strokeStyle = rgba(PAL.cool, 0.6); c.lineWidth = 1; c.beginPath(); c.roundRect(d.x, y - 6, d.w, 12, 3); c.fill(); c.stroke(); });
    }
    // instrument: the curve (finished) → the time bar
    const tA = smooth((t - S.time0) / 0.3);
    if (tA < 1) curvePanel(stage, M.N_PRE, {a: 1, cam, label: tA > 0.5 ? '' : undefined});
    if (tA > 0) timeBar(stage, t, S, tA);
  });
  glowFlush(stage);
  // big number: 1,900 → 1,750억 → 3,000억 → 약 4,000년 (rolling)
  // s18: the time is the big number — it rolls with the bar's own fill (same q), reaching 약 4,000년 at "사천년쯤".
  // The s17 number "3,000억 조각" leaves first: it shrinks up toward the header, which carries both GPT-3 figures.
  const qFill = easeInOut(clamp((t - S.fill0) / (S.fill1 - S.fill0)));
  if (t >= S.fill0) bigNum(stage, '약 ' + rollNum(4000 * qFill, 1), '년', t, S.fill0, 1, BIGPOS);
  else {
    const bn = t >= S.rain ? [rollNum(3000, (t - S.rain) / 0.6) + '억', '조각', S.rain] : t >= S.j2 ? [rollNum(1750, (t - S.j2) / 0.7) + '억', '개', S.j2] : t >= S.j1 ? [rollNum(M.NPARAM, (t - S.j1) / 0.5), '개', S.j1] : null;
    const lq = smooth((t - S.time0) / 0.4);       // leave: shrink up and fade
    if (bn && lq < 1) bigNum(stage, bn[0], bn[1], t, bn[2], 1 - lq, {...BIGPOS, y: BIGPOS.y - 110 * lq, size: BIGPOS.size * (1 - 0.55 * lq), pop: t - bn[2] < 0.3});
  }
  if (t < st + 0.4 && t < S.j1) bigNum(stage, String(M.N_PRE), '번째', t, -1, 1 - smooth((t - st) / 0.3), BIGPOS);
}
const TB = {x0: 140, x1: 900, y: 1110, h: 58};
function timeBar(stage, t, S, a) {
  const c = stage.ctx, P = CPANEL, q = easeInOut(clamp((t - S.fill0) / (S.fill1 - S.fill0)));
  withAlpha(c, a, () => {
    c.beginPath(); c.roundRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 10); c.fillStyle = rgba('#03141C', 0.92); c.fill(); c.strokeStyle = PAL.panelEdge; c.lineWidth = 1.4; c.stroke();
    stage.text('하루 8시간씩 읽으면', P.x0 + 20, P.y0 + 36, {size: 32, weight: 500, color: PAL.muted});
    c.beginPath(); c.roundRect(TB.x0, TB.y, TB.x1 - TB.x0, TB.h, 8); c.fillStyle = rgba('#0A151B', 0.9); c.fill(); c.strokeStyle = rgba(PAL.muted, 0.3); c.lineWidth = 1; c.stroke();
    if (q > 0) { const g = c.createLinearGradient(0, TB.y, 0, TB.y + TB.h); g.addColorStop(0, '#2C5566'); g.addColorStop(1, '#1F3B48'); c.beginPath(); c.roundRect(TB.x0, TB.y, (TB.x1 - TB.x0) * q, TB.h, 8); c.fillStyle = g; c.fill(); }
    for (const [f, lab, al] of [[0, '0', 'center'], [0.5, '2천', 'center'], [1, '4천 년', 'right']]) { const x = TB.x0 + f * (TB.x1 - TB.x0); line(c, [[x, TB.y + TB.h + 2], [x, TB.y + TB.h + 10]], rgba(PAL.muted, 0.7), 1.4); stage.text(lab, x + (al === 'right' ? 30 : 0), TB.y + TB.h + 42, {size: 30, weight: 500, color: PAL.muted, align: al}); }
    // one lifetime: 80 years = 2 % of the bar
    const xl = TB.x0 + 0.02 * (TB.x1 - TB.x0), la = backOut(clamp((t - S.life) / 0.3));
    if (t >= S.life) { line(c, [[xl, TB.y - 16], [xl, TB.y + TB.h]], PAL.warm, 3); stage.text('80년', xl - 6, TB.y - 36, {size: 30, weight: 700, color: PAL.warm, alpha: clamp(la)}); }
  });
}

// =====================================================================================================
// EMERGE — a fact got into the numbers: change one piece (동쪽에서 ↔ 서쪽으로) and dials + bars switch in the same frame
// =====================================================================================================
function emergeState(t, E) {
  let k = 0; for (const tt of E.tog) if (t >= tt) k++;
  const west = k % 2 === 1, tl = k ? E.tog[k - 1] : -Infinity, q = spring(clamp((t - tl) / 0.45)), qb = easeInOut(clamp((t - tl) / 0.35));
  return {west, q, qb, tl};
}
function emergeScene(stage, t, p, ctx) {
  const P = ctx.P, E = P.emerge, S = P.scale, cam = camAt(t, E.cam), {GW, GC} = glowBegin(), SC = P.sc, st = SC.emerge.start;
  const back = easeInOut(clamp((t - E.back) / 0.7)), s = Math.exp(Math.log(0.05) * (1 - back));
  const {west, q, qb, tl} = emergeState(t, E);
  const from = west ? EAST : WEST, to = west ? WEST : EAST;
  const vFrom = M.rowA(PRE, from[1]), vTo = M.rowA(PRE, to[1]);
  const vals = tl === -Infinity ? M.rowA(PRE, '동쪽에서') : vFrom.map((v, i) => lerp(v, vTo[i], q));
  const pFrom = M.probs(PRE, from), pTo = M.probs(PRE, to), ctxNow = tl === -Infinity ? EAST : to;
  withCamH(stage, cam, () => {
    const c = stage.ctx;
    dotWall(stage, s, 1 - smooth((t - E.back - 0.5) / 0.2));
    c.save(); c.translate(BC[0], BC[1]); c.scale(s, s); c.translate(-BC[0], -BC[1]);
    body(stage, 1, {label: s > 0.6 && bodyLabel(cam)});
    const hiIdx = tl === -Infinity || !west ? M.ID['뜬다'] : M.ID['진다'];
    if (back > 0.4) dialBoard(stage, vals, {cam, a: smooth((back - 0.4) / 0.4)}, i => ({hi: t >= E.bars && i === hiIdx ? 1 : 0}));
    c.restore();
    // the line: 해는 [동쪽에서 / 서쪽으로] [cover]; the swapped-out piece drops below as a ghost (the header is above)
    const lb = lineBoxes(['해는', west ? '서쪽으로' : '동쪽에서', '뜬다']);
    const la = backOut(clamp((t - E.back - 0.3) / 0.35)), lv = visA(cam, {x0: LINE.x0, y0: LINE.y0, x1: 700, y1: LINE.y0 + 88});
    if (la > 0.01 && lv > 0) withAlpha(c, lv, () => {
      chip(stage, lb[0], {kind: 'given', pop: la});
      const sw = clamp((t - tl) / 0.35);
      if (tl > -Infinity && sw < 1) { const old = lineBoxes(['해는', west ? '동쪽에서' : '서쪽으로'])[1]; chip(stage, {...old, y: old.y + 110 * easeIn(sw)}, {kind: 'ghost', a: 1 - sw}); }
      const nb = lineBoxes(['해는', west ? '서쪽으로' : '동쪽에서', '뜬다'])[1];
      chip(stage, {...nb, y: tl > -Infinity ? lerp(nb.y - 120, nb.y, drop(sw)) : nb.y}, {kind: 'given', pop: la, hi: tl > -Infinity ? 1 - smooth((t - tl - 0.5) / 0.5) : 0});
      coverChip(stage, {...lb[2], x: nb.x + nb.w + 10}, t, Infinity, {a: clamp(la)});
      flowIn(stage, [nb.x + nb.w / 2, nb.y + nb.h + 4], INLET, (t - E.flow) / 0.4);
      for (const tt of E.tog) if (t >= tt && t < tt + 0.3) ringPop(stage, nb.x + nb.w / 2, nb.y + nb.h, t, tt + 0.22, {color: PAL.cool, r1: 70});
    });
    // instrument: the curve/time panel drops away, the bars spring up (trained model)
    { const qd = clamp((t - st) / 0.4); if (qd < 1) { c.save(); c.translate(0, 450 * qd * qd); timeBar(stage, 1e9, S, 1); c.restore(); } }
    if (t >= E.bars) {
      const g = [0, 1, 2, 3, 4].map(i => spring(clamp((t - E.bars - i * 0.08) / 0.55)));
      const rows = barRows(PRE, EAST, EM_ROWS).map((r, i) => r);
      const now = barRows(PRE, from, EM_ROWS), nxt = barRows(PRE, to, EM_ROWS);
      const R = (tl === -Infinity ? barRows(PRE, EAST, EM_ROWS) : now.map((r, i) => ({...r, p: lerp(r.p, nxt[i].p, qb)})))
        .map((r, i) => ({...r, grow: g[i], hi: (!west && i === 0) || (west && i === 1) ? 1 : 0, ghostP: tl > -Infinity && i <= 1 && now[i].p > nxt[i].p ? now[i].p : null}));
      bars(stage, R, {cam});
      void rows;
    }
    if (t >= E.nobody) tag(stage, '아무도 넣지 않았다', BODY.x + BODY.w / 2, BODY.y + BODY.h - 24, {color: PAL.warm, size: 34, a: backOut(clamp((t - E.nobody) / 0.3)) * visA(cam, {x0: 300, y0: BODY.y + BODY.h - 50, x1: 780, y1: BODY.y + BODY.h})});
  });
  glowFlush(stage);
  if (t >= E.bars) { const pv = M.probs(PRE, ctxNow)[west ? M.ID['진다'] : M.ID['뜬다']]; bigNum(stage, String(Math.round(100 * pv)), '%', t, E.bars, 1, {...BIGPOS}); }
}

// =====================================================================================================
// TUNE — a few dialog examples, same study: then an unseen question gets the right answer
// =====================================================================================================
function tuneScene(stage, t, p, ctx) {
  const P = ctx.P, T = P.tune, E = P.emerge, cam = camAt(t, T.cam), {GW, GC} = glowBegin(), SC = P.sc, st = SC.tune.start;
  // which line / params
  let ri = -1; T.rounds.forEach((tr, i) => { if (t >= tr) ri = i; });
  const testPost = t >= T.test;
  const pieces = testPost || ri < 0 ? TEST : M.DIALOG[ri].split(' ').slice(0, 6);
  const ctxIds = M.toIds(pieces.join(' '));
  let Pm = PRE, Pdial = PRE;
  if (testPost) { Pm = TUNED; Pdial = TUNED; }
  else if (ri >= 0) { const tr = T.rounds[ri], q = spring(clamp((t - tr - 0.5) / 0.4)); Pm = M.tuneSnapAt(T.j[ri]); Pdial = M.lerpP(M.tuneSnapAt(T.j[ri]), M.tuneSnapAt(T.j[ri + 1]), q); }
  const dIn = spring(clamp((t - st) / 0.5));
  const vals = M.rowA(PRE, '동쪽에서').map((v, i) => lerp(v, M.rowA(Pdial, '대답:')[i], dIn));
  withCamH(stage, cam, () => {
    // the example line flies out left; the dialog lines slide in from the right
    { const q = clamp((t - st) / 0.3); if (q < 1) { const lb = lineBoxes(EXP); lb.forEach((b, i) => (i < 2 ? chip(stage, {...b, x: b.x - 1100 * q * q}, {kind: 'given'}) : coverChip(stage, {...b, x: b.x - 1100 * q * q}, t, Infinity))); } }
    const lineT = testPost ? T.test : ri >= 0 ? T.rounds[ri] : st + 0.15;
    const sx = (1 - backOut(clamp((t - lineT) / 0.3))) * 1000;
    const bx = dlgBoxes(pieces.concat([testPost || ri < 0 ? '서쪽으로' : M.DIALOG[ri].split(' ')[6]])).map(b => ({...b, x: b.x + sx}));
    const tOpen = !testPost && ri >= 0 ? T.rounds[ri] + 0.35 : Infinity;
    const la = visA(cam, boxOf(bx));
    withAlpha(stage.ctx, la, () => {
      bx.forEach((b, i) => { if (i < bx.length - 1) chip(stage, b, {kind: 'given'}); });
      coverChip(stage, bx[bx.length - 1], t, tOpen); if (la > 0.5) revealGlow(GC, cam, bx[bx.length - 1], t, tOpen);
      if (ri >= 0 && !testPost) tag(stage, '대화 본보기', 1040, bx[0].y + bx[0].h + 34, {align: 'right', color: PAL.cool, size: 32, a: 1});
      if (testPost) tag(stage, '처음 보는 질문', 1040, bx[0].y + bx[0].h + 34, {align: 'right', color: PAL.warm, size: 32, a: backOut(clamp((t - T.test - 0.3) / 0.3))});
    });
    body(stage, 1, {cam, label: bodyLabel(cam)});
    dialBoard(stage, vals, {cam});
    // bars: the old rows sink, the dialog rows spring up
    { const qd = clamp((t - st) / 0.3); if (qd < 1) bars(stage, barRows(PRE, EAST, EM_ROWS).map(r => ({...r, a: 1 - qd})), {cam}); }
    if (t >= T.bars0) {
      const g0 = testPost ? T.test : ri >= 0 ? T.rounds[ri] : T.bars0;
      const R = barRows(Pm, ctxIds, TU_ROWS).map((r, i) => ({...r, grow: spring(clamp((t - g0 - 0.05 - i * 0.05) / 0.45)), hi: testPost && i === 0 ? 1 : 0,
        ghostP: testPost ? barRows(PRE, TEST_IDS, TU_ROWS)[i].p : null}));
      bars(stage, R, {cam});
    }
  });
  glowFlush(stage);
  if (ri >= 0 && !testPost) speedBadge(stage, '빨리 감기', 1);
}

// =====================================================================================================
// FROZEN — only the numbers remain; while chatting they do not move
// =====================================================================================================
function frozenScene(stage, t, p, ctx) {
  const P = ctx.P, F = P.frozen, T = P.tune, cam = camAt(t, F.cam), {GW, GC} = glowBegin(), SC = P.sc;
  const vals = M.rowA(TUNED, '대답:');
  withCamH(stage, cam, () => {
    const c = stage.ctx, qc = clamp((t - F.clear) / 0.45);
    // the text and the bars fall away (the reading is not kept)
    if (qc < 1) {
      const bx = dlgBoxes(TEST.concat(['서쪽으로']));
      bx.forEach((b, i) => { const dy = 700 * easeIn(clamp(qc * 1.3 - i * 0.04)); if (i < bx.length - 1) chip(stage, {...b, y: b.y + dy}, {kind: 'given', a: 1 - qc}); else chip(stage, {...b, y: b.y + dy}, {kind: 'given', a: 1 - qc}); });
      c.save(); c.translate(0, 500 * easeIn(qc)); bars(stage, barRows(TUNED, TEST_IDS, TU_ROWS).map(r => ({...r, a: 1 - qc})), {}); c.restore();
    }
    body(stage, 1, {cam, label: bodyLabel(cam), edge: smooth((t - F.keep) / 0.3)});
    dialBoard(stage, vals, {cam});
    if (t >= F.keep) tag(stage, '숫자는 그대로', BODY.x + BODY.w / 2, BODY.y + BODY.h + 40, {color: PAL.cool, size: 34, a: backOut(clamp((t - F.keep) / 0.3)) * visA(cam, {x0: 300, y0: BODY.y + BODY.h + 10, x1: 780, y1: BODY.y + BODY.h + 70})});
    // the chat streams past fast (pieces pop in at the right, the row slides left with streaks)
    if (t >= F.chat0) {
      const items = F.stream.filter(s => t >= s.t);
      const wl = s => lineBoxes([s.w], 40, LINE.y0, 0, {padX: 12})[0].w;
      let x = 0; const xs = items.map(s => { const x0 = x; x += wl(s) + 8; return x0; });
      const last = items[items.length - 1], lastEnd = x - 8, off = 1040 - lastEnd - 30 * (1 - backOut(clamp((t - last.t) / 0.13)));
      items.forEach((s, i) => {
        const bx = {text: s.w, x: xs[i] + off, y: LINE.y0, w: wl(s), h: 60};
        if (bx.x + bx.w < 30 || bx.x > 1060) return;
        const k = bx.x < 60 ? clamp((bx.x - 30) / 30) : 1;
        chip(stage, bx, {kind: s.kind, a: k, pop: backOut(clamp((t - s.t) / 0.14))});
      });
      streak(stage, [1040, LINE.y0 + 30], [200, LINE.y0 + 30], clamp((t - F.chat0) % 0.5 / 0.5), {color: PAL.muted, a: 0.18, w: 3, len: 0.3});
    }
  });
  glowFlush(stage);
}

// =====================================================================================================
// CLOSE — one more round from the very first numbers, then the poster comes back
// =====================================================================================================
function closeScene(stage, t, p, ctx) {
  const P = ctx.P, C = P.close, cam = camAt(t, C.cam), {GW, GC} = glowBegin(), SC = P.sc, st = SC.close.start;
  const pq = clamp((t - P.poster) / 0.45);               // cross to the poster world
  const exCtx = EAST, tId = M.ID['뜬다'];
  const qs = DIALC.map((_, i) => spring(clamp((t - C.turn - (2 - Math.floor(i / 6)) * 0.08 - (i % 6) * 0.02) / 0.5)));
  const qm = qs.reduce((a, b) => a + b, 0) / 18, Pm = M.lerpP(S0, S1, qm);
  const k = t >= C.curve0 ? easeInOut(clamp((t - C.curve0) / (C.curve1 - C.curve0))) * M.N_PRE : 0;
  const rs = spring(clamp((t - C.restart) / 0.55));
  const v0 = M.rowA(TUNED, '대답:'), vS0 = M.rowA(S0, '동쪽에서'), vS1 = M.rowA(S1, '동쪽에서');
  const vals = t >= C.curve0 ? M.rowA(M.snapAt(k), '동쪽에서') : vS0.map((v, i) => lerp(lerp(v0[i], v, rs), vS1[i], qs[i]));
  withCamH(stage, cam, () => {
    const c = stage.ctx;
    if (pq < 1) withAlpha(c, 1 - pq, () => {
      const lb = lineBoxes(EXP), la = backOut(clamp((t - C.restart) / 0.35));
      if (la > 0.01) { chip(stage, lb[0], {kind: 'given', pop: la}); chip(stage, lb[1], {kind: 'given', pop: la}); coverChip(stage, lb[2], t, C.open); revealGlow(GC, cam, lb[2], t, C.open); }
      flowIn(stage, [lb[1].x + lb[1].w / 2, lb[1].y + lb[1].h + 4], INLET, (t - C.flow) / 0.4);
      body(stage, 1, {cam, label: bodyLabel(cam)});
      const g = M.TRACE[1].grad;
      dialBoard(stage, vals, {cam, ghost: t >= C.turn && t < C.curve0 ? vS0 : null, wedge: 1}, i => ({arrow: {len: arrowLen(g[i]), q: backOut(clamp((t - C.arrive[i]) / 0.25)), a: 1 - smooth((t - C.turn - 0.2) / 0.25)}}));
      const fold = smooth((t - C.curve0) / 0.3);
      if (t >= C.bars && fold < 1) {
        const R = barRows(Pm, exCtx, ROW_IDS).map((r, i) => ({...r, grow: spring(clamp((t - C.bars - i * 0.06) / 0.5)), hi: i === 3 && t >= C.open ? 1 : 0, ghostP: i === 3 && t >= C.turn ? M.pOf(S0, exCtx, tId) : null}));
        bars(stage, R, {cam, a: 1 - fold});
        if (t >= C.loss) lossBar(stage, M.pOf(Pm, exCtx, tId), {cam, a: 1 - fold, grow: backOut(clamp((t - C.loss) / 0.35)), ghostP: t >= C.turn ? M.pOf(S0, exCtx, tId) : null});
      }
      // backward pulses (the same fan as s13, faster)
      const lossEnd = [LOSS.bx0 + (-Math.log(M.pOf(S0, exCtx, tId)) / LOSS.max) * (LOSS.bx1 - LOSS.bx0), LOSS.y + LOSS.h / 2], tRow = [barX(M.pOf(S0, exCtx, tId)) + 4, rowCy(3)];
      pulseBack(GW, cam, lossEnd, tRow, (t - C.back) / 0.3, 1.0);
      DIALC.forEach((d, i) => pulseBack(GW, cam, tRow, d, (t - (C.arrive[i] - 0.4)) / 0.4, 0.7));
      if (fold > 0) curvePanel(stage, k, {a: fold, cam});
    });
    if (pq > 0) withAlpha(c, pq, () => posterWorld(stage, t - P.poster, P, GC, cam, 0));
  });
  glowFlush(stage);
  if (t >= C.restart && t < C.restart + 0.9) speedBadge(stage, '◀◀ 처음 숫자로', 1);
  if (t >= C.curve0 && pq <= 0) bigNum(stage, String(Math.round(k)), '번째', t, C.curve0, 1, BIGPOS);
}

export const scenes = {scale: scaleScene, emerge: emergeScene, tune: tuneScene, frozen: frozenScene, close: closeScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  scale: P => [[-Infinity, 'GPT-3 · 2020', '숫자 1,750억 개, 글 3,000억 조각'], [P.tl.at('s18') - 0.5, 'GPT-3 · 2020', '하루 8시간씩 읽어도 약 4천 년']],
  emerge: P => [[-Infinity, '다 배운 뒤', '맞히려면 사실을 알아야 한다'], [P.tl.at('s20') - 0.5, '다 배운 뒤', '아무도 넣지 않은 문법과 지식']],
  tune: P => [[-Infinity, '대화 다듬기 · 빨리 감기', '대화 본보기로 같은 공부를 더']],
  frozen: P => [[-Infinity, '공부가 끝나면', '대화하는 동안 숫자는 그대로']],
  close: P => [[-Infinity, '정리', '맞히고, 틀린 만큼 고친다']],
};
export const signature = P => [P.scale.j1, P.scale.j2, P.emerge.tog[0], P.tune.test, P.frozen.chat0, P.close.turn].map(x => x.toFixed(3)).join('/');

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundAfter(tl, P) {
  const S = P.scale, E = P.emerge, T = P.tune, F = P.frozen, C = P.close, ev = [];
  ev.push(snd.whoosh('scale_j1', S.j1, 0.5, 200, 120, -38, `s17: 도약 1 — 다이얼 18개가 이 모형의 숫자 전체(${M.NPARAM}개)로`));
  ev.push(snd.swell('scale_j2', S.j2, [82, 123], 1.6, -34, 's17: 도약 2 — 카메라가 물러나 점의 벽(1,750억 개)'));
  ev.push(snd.tick('scale_big1', S.j2 + 0.7, 147, -36, '큰 숫자 1,750억 개', {decay: 0.12}));
  ev.push(snd.swell('scale_rain', S.rain, [110, 165], 2.4, -36, 's17: 글 조각 3,000억 개가 쏟아져 들어감'));
  ev.push(snd.train('scale_rain_ticks', S.drops.filter((d, i) => i % 3 === 0 && d.t < tl.at('s18')).map(d => [d.t + 0.4, 'tick', {freq: 240, decay: 0.02, gain_db: -8, click: 0}]), -40, 's17: 쏟아지는 조각이 닿는 틱(세 개에 하나)'));
  ev.push(snd.swell('scale_time', S.fill0, [98, 147], S.fill1 - S.fill0 + 0.6, -35, 's18: 시간 막대가 0 → 4,000년으로 차오름(긴 스웰)'));
  ev.push(snd.tick('scale_life', S.life, 196, -36, 's18: 한평생(80년) 눈금', {decay: 0.1}));
  ev.push(snd.tick('scale_year', S.year, 147, -34, '큰 숫자가 약 4,000년에 닿음(시간 막대가 다 참)', {decay: 0.14}));
  ev.push(snd.whoosh('emerge_back', E.back, 0.7, 120, 260, -38, 's19: 점의 벽이 몸통 하나로 돌아옴'));
  ev.push(snd.tone('emerge_bars', E.bars, 330, 0.3, -34, "s19: 다 배운 모형 — '뜬다' 막대가 높이 솟음", {decay: 0.15, sustain: 0.2}));
  E.tog.forEach((tt, i) => ev.push(snd.tone('emerge_tog' + (i + 1), tt, i % 2 ? 330 : 262, 0.22, -34, `s19–20: 조각 하나를 바꿈(${i % 2 ? '서쪽으로 → 동쪽에서' : '동쪽에서 → 서쪽으로'}) — 같은 프레임에 다이얼·막대가 바뀜`, {decay: 0.1, sustain: 0.1})));
  ev.push(snd.tick('emerge_tag', E.nobody, 220, -37, "s20: 꼬리표 '아무도 넣지 않았다'"));
  ev.push(snd.tick('tune_in', T.in, 260, -37, 's21: 처음 보는 질문(본보기 공부 전) — 엉뚱한 이어 쓰기'));
  T.rounds.forEach((tr, i) => { ev.push(snd.tick('tune_open' + (i + 1), tr + 0.35, 392, -35, `s21: 대화 본보기 ${i + 1} — 열기`)); ev.push(snd.tick('tune_fix' + (i + 1), tr + 0.5, 330, -38, `s21: 대화 본보기 ${i + 1} — 숫자를 고침(빨리 감기)`, {decay: 0.04})); });
  ev.push(snd.tone('tune_test', T.test, 330, 0.4, -33, "s21: 처음 보는 질문에 '서쪽으로'가 높음", {decay: 0.2, sustain: 0.2}));
  ev.push(snd.whoosh('frozen_clear', F.clear, 0.45, 300, 120, -38, 's22: 글과 막대가 떨어져 사라짐 — 남는 것은 숫자'));
  ev.push(snd.tick('frozen_keep', F.keep, 196, -37, "s22: 다이얼 판 테두리 + '숫자는 그대로'", {decay: 0.12}));
  ev.push(snd.train('frozen_chat', F.stream.filter((s, i) => i % 2 === 0).map(s => [s.t, 'tick', {freq: s.kind === 'made' ? 300 : 240, decay: 0.02, gain_db: -10, click: 0}]), -42, 's22: 대화 조각이 빠르게 흐름(조용한 틱) — 다이얼은 꼼짝 않음'));
  ev.push(snd.whoosh('close_restart', C.restart, 0.5, 400, 180, -40, 's23: 처음 숫자로 되감기'));
  ev.push(snd.tick('close_open', C.open, 392, -34, 's23: 가림막이 열림'));
  ev.push(snd.chirp('close_back', C.back, [[0, 520, 0], [0.05, 520, 0.6], [0.75, 220, 0.6], [0.95, 200, 0]], -40, 's23: 거꾸로 가는 펄스'));
  ev.push(snd.train('close_turn', DIALC.map((_, i) => [C.turn + (2 - Math.floor(i / 6)) * 0.08 + (i % 6) * 0.02, 'tick', {freq: 330, decay: 0.04, gain_db: -2, click: 0}]), -36, 's23: 다이얼이 조금씩 돎'));
  ev.push(snd.chirp('close_curve', C.curve0, [[0, 180, 0], [0.1, 180, 0.5], [C.curve1 - C.curve0, 180 + 300 * M.CURVE[M.N_PRE], 0.5], [C.curve1 - C.curve0 + 0.3, 180 + 300 * M.CURVE[M.N_PRE], 0]], -40, 's23: 곡선이 끝까지 오름(음이 곡선을 따라 오름)'));
  ev.push(snd.tone('close_end', P.poster, 196, 0.9, -35, '맺음 음 — 포스터 구도로', {decay: 0.4, sustain: 0.3}));
  return ev;
}
