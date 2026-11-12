// 44 GPT는 어떻게 배웠을까 — hook (s01–s03), origin (s04–s05), essence (s06–s08). PLAN.md §3 + §1.1 (gpt-generative).
// Exports: scenes {hook, origin, essence}, planIntro(tl, P), soundIntro(tl, P), titles, signature(P), posterWorld (used by close).
import {PAL, clamp, lerp, smooth, easeOut, easeInOut, wd, bigNum, glowBegin, glowFlush, chip, tag, snd, withAlpha, rgba, sweep} from '../gpt-generative/kit.mjs';
import {camAt, withCam, camPt, backOut, spring, drop, rollNum, streak, ringPop, squash} from '../gpt-generative/motion.mjs';
import * as M from './model.mjs';
import {LINE, BODY, BIGPOS, INLET, BOX, CAM_HOME, lineBoxes, boxOf, union, camKey, visA, bodyLabel, boardVisAll, withCamH, coverChip, revealGlow, body, dialBoard, curvePanel} from './parts.mjs';

const PREV = '동쪽에서';
const SENTS = M.CORPUS.map(s => s.split(' '));                 // 4 pieces each (last '.')

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planIntro(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), SC = P.sc;
  {
    const H = {};
    // reveal cycles from 0 s, one every 1.5 s, through s01–s02; the last one before s03 is the example again
    H.cyc = 1.5; H.cycles = [];
    const order = [0, 6, 4, 3, 8, 1, 7, 5, 2];               // corpus sentences (0 = 해는 동쪽에서 뜬다)
    H.s3 = tl.at('s03') - 0.4;                                 // the example slides in and stays
    for (let j = 0, t = 0; t + 1.2 <= H.s3; j++, t += H.cyc) H.cycles.push({t, sent: order[j % order.length]});
    H.cycles.push({t: H.s3, sent: 0, last: true});
    H.k = c => 200 + 70 * c;                                    // training steps shown on the curve per reveal (fast-forward preview)
    H.ghost0 = W_('s02', '문법이나') - 0.2; H.ghost1 = W_('s02', '지식을') - 0.2;
    H.bump = W_('s02', '없습니다');                            // they cannot get in
    H.next = W_('s03', '다음') - 0.05;                         // cover hi + tag
    const HM = c => ({t: c, ...CAM_HOME}), fIn = {x0: 60, y0: 290, x1: 1020, y1: 760}, ex = boxOf(lineBoxes(SENTS[0].slice(0, 3)));
    H.fNext = union(ex, {x0: ex.x0, y0: ex.y1, x1: ex.x1, y1: ex.y1 + 80});
    H.cam = [HM(0), HM(H.ghost0 - 0.2), camKey(H.ghost0 + 0.4, fIn), camKey(H.bump + 0.7, fIn), HM(H.s3 - 0.1), HM(H.next - 0.4), camKey(H.next + 0.05, H.fNext)];
    P.hook = H;
  }
  {
    const O = {};
    O.drop = SC.origin.start + 0.05;
    O.mid = W_('s04', '가운데'); O.pre = W_('s04', '프리트레인드') - 0.05; O.miri = W_('s04', '미리') - 0.05;
    O.bands = tl.at('s05') - 0.35;
    O.short = W_('s05', '따로') - 0.05;
    O.fill0 = W_('s05', '엄청난') - 0.05; O.fill1 = W_('s05', '두었다는');
    O.first = W_('s05', '먼저') - 0.05;
    O.chat = O.fill1 + 0.15;
    const HM = c => ({t: c, ...CAM_HOME}), fP = {x0: tileX(0) - 30, y0: TILE.y - 50, x1: tileX(2) + TILE.s + 30, y1: TILE.y + TILE.s + 200};
    const fBand = {x0: BAND.x0, y0: BAND.y - 70, x1: BAND.s1, y1: BAND.y + BAND.h + 80};
    O.cam = [camKey(SC.origin.start, P.hook.fNext), HM(SC.origin.start + 0.45), HM(O.mid - 0.2), camKey(O.mid + 0.25, fP), camKey(O.miri + 0.8, fP), HM(O.bands),
      HM(O.fill0), camKey(O.fill1, fBand), HM(SC.origin.end - 0.2)];
    // the tiles that fill the long band: seeded widths, each flies in at its own time (accelerating)
    const r = M.TRACE ? mulberry(11) : null, tiles = []; let x = 0;
    while (x < 1) { const w = 0.025 + 0.035 * r(); tiles.push({x, w: Math.min(w, 1 - x), row: tiles.length % 3}); x += w / 3; }
    tiles.forEach((tl_, i) => { const f = i / tiles.length; tl_.t = O.fill0 + (O.fill1 - O.fill0) * (1 - Math.pow(1 - f, 0.6)) ** 1; });
    O.tiles = tiles;
    P.origin = O;
  }
  {
    const E = {};
    E.lineIn = SC.essence.start + 0.05;
    E.cover = W_('s06', '가려') + 0.05; E.one = W_('s06', '조각') - 0.05;
    E.read = W_('s07', '해는'); E.hid = W_('s07', '가렸다면');
    E.peek = W_('s07', '뜬다'); E.close = W_('s07', '이미');
    // s08 waterfall: every corpus position as a problem; the example (sentence 0, position 2) last
    const all = M.POS.map(q => ({sent: q.sent, pos: q.pos})).filter(q => !(q.sent === 0 && q.pos === 2));
    all.push({sent: 0, pos: 2});
    const fast = W_('s08', '얼마든지');
    E.w0 = W_('s08', '그래서') - 0.1;
    let t = E.w0; E.probs = all.map((q, i) => { const o = {...q, t}; t += t < fast ? 0.38 : 0.07; return o; });
    E.wEnd = E.probs[E.probs.length - 1].t;
    E.gather = Math.max(E.wEnd + 0.35, SC.essence.end - 0.6);   // the example rises to the top line, the rest slide away
    const HM = c => ({t: c, ...CAM_HOME}), fl = boxOf(lineBoxes(FULL)), fOne = union(fl, {x0: fl.x0, y0: fl.y1, x1: fl.x1, y1: fl.y1 + 80});
    E.cam = [HM(SC.essence.start), HM(E.one - 0.2), camKey(E.one + 0.2, fOne), camKey(E.peek + 1.6, fOne), HM(E.w0 - 0.1), HM(SC.essence.end)];
    P.essence = E;
  }
  return P;
}
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// =====================================================================================================
// HOOK
// =====================================================================================================
/** the cycling line: cycle c slides in (backOut 0.3 s), its verb is covered and opens at +0.6 s, leaves left at +1.2 s */
function hookLine(stage, t, H, GC, cam, o = {}) {
  let ci = 0; while (ci + 1 < H.cycles.length && t >= H.cycles[ci + 1].t) ci++;
  const draw = (c, dxF) => {
    const s = SENTS[c.sent].slice(0, 3), bx = lineBoxes(s), dx = dxF;
    bx.forEach((b, i) => { const bb = {...b, x: b.x + dx}; if (i < 2) chip(stage, bb, {kind: 'given'}); else { coverChip(stage, bb, t, c.last ? Infinity : c.t + 0.6, {coverHi: o.coverHi || 0}); if (!c.last) revealGlow(GC, cam, bb, t, c.t + 0.6); } });
    return bx.map(b => ({...b, x: b.x + dx}));
  };
  const cur = H.cycles[ci], age = t - cur.t;
  const inX = cur.t <= 0 ? 0 : (1 - backOut(clamp(age / 0.32))) * 1000;
  let out = null;
  if (ci > 0) { const prev = H.cycles[ci - 1], q = clamp(age / 0.28); if (q < 1) { const dx = -1100 * q * q; draw(prev, dx); const b = lineBoxes(SENTS[prev.sent].slice(0, 3)); streak(stage, [b[2].x + b[2].w + 20, 336], [b[2].x + b[2].w + 20 - 1100, 336], q, {color: PAL.cool, a: 0.35, w: 10}); } }
  out = draw(cur, inX);
  return {bx: out, ci};
}
/** dial value index (training steps) shown in the hook: rises with every reveal (spring) */
const hookK = (t, H) => { let k = H.k(0); for (const c of H.cycles) if (!c.last) k += 70 * spring(clamp((t - c.t - 0.6) / 0.5)); return Math.min(M.N_PRE, k); };
/** the poster world (0 s): line, curve panel, body + dials with alpha b. Also used by the close scene at P.poster. */
export function posterWorld(stage, t, P, GC, cam, bodyA) {
  const H = P.hook, k = hookK(t, H);
  const r = hookLine(stage, t, H, GC, cam);
  body(stage, bodyA);
  if (bodyA > 0) dialBoard(stage, M.rowA(M.snapAt(k), PREV), {a: bodyA});
  curvePanel(stage, k, {a: 1});
  return r;
}
function hookScene(stage, t, p, ctx) {
  const P = ctx.P, H = P.hook, cam = camAt(t, H.cam), {GW, GC} = glowBegin();
  const bodyA = smooth((t - P.MORPH[0] - 0.2) / 0.5);
  withCamH(stage, cam, () => {
    const coverHi = t >= H.next ? 1 : 0;
    let ci = 0; while (ci + 1 < H.cycles.length && t >= H.cycles[ci + 1].t) ci++;
    // world: line (cycling), body + dials (dials pop in as a wave after the title shrinks), curve below
    const k = hookK(t, H);
    const lv = visA(cam, {x0: LINE.x0, y0: LINE.y0, x1: 640, y1: LINE.y0 + 88});
    let r = {bx: []}; withAlpha(stage.ctx, lv, () => { r = hookLine(stage, t, H, GC, cam, {coverHi}); });
    body(stage, bodyA * squash(t, H.bump, 0.14, 0.012), {cam, label: bodyLabel(cam)});
    if (t > P.MORPH[0]) dialBoard(stage, M.rowA(M.snapAt(k), PREV), {cam}, i => ({s: backOut(clamp((t - P.MORPH[0] - 0.25 - i * 0.03) / 0.3))}));
    curvePanel(stage, k, {a: 1, cam});
    // s02: '문법' '지식' (ghost) fly toward the inlet, bounce off at "없습니다", pop away
    for (const [txt, t0, side] of [['문법', H.ghost0, -1], ['지식', H.ghost1, 1]]) {
      if (t < t0) continue;
      const w = 132, from = [540 + side * 640, 446], at = [540 + side * 150, 446];
      const q = clamp((t - t0) / Math.max(0.3, H.bump - t0));
      const e = easeInOut(q), bounce = t > H.bump ? spring(clamp((t - H.bump) / 0.5)) : 0;
      const x = lerp(from[0], at[0], e) + side * 70 * bounce, y = lerp(from[1], at[1], e) - 30 * Math.sin(Math.PI * bounce);
      const s = 1 - backOut(clamp((t - H.bump - 0.55) / 0.25), 2) * 1;
      if (s <= 0.02) continue;
      if (q < 1) streak(stage, from, at, e, {color: PAL.muted, a: 0.35, w: 8});
      const c = stage.ctx; c.save(); c.translate(x, y); c.scale(Math.max(0.01, s), Math.max(0.01, s)); c.translate(-x, -y);
      chip(stage, {text: txt, x: x - w / 2, y: y - 36, w, h: 72}, {kind: 'ghost'}); c.restore();
      if (t >= H.bump && t < H.bump + 0.3) ringPop(stage, at[0] - side * 10, at[1], t, H.bump, {color: PAL.muted});
    }
    if (t >= H.next && r.bx[2]) { const b = r.bx[2]; tag(stage, '다음 말 맞히기', b.x + b.w / 2, b.y + b.h + 44, {color: PAL.warm, a: backOut(clamp((t - H.next) / 0.3)), size: 34}); }
  });
  glowFlush(stage);
}

// =====================================================================================================
// ORIGIN
// =====================================================================================================
const TILE = {y: 560, s: 150, gap: 22};
const tileX = i => 540 - (3 * TILE.s + 2 * TILE.gap) / 2 + i * (TILE.s + TILE.gap);
function letterTile(stage, x, y, s, ch, o = {}) {
  const c = stage.ctx;
  withAlpha(c, o.a ?? 1, () => {
    c.save(); const cx = x + s / 2, cy = y + s / 2, k = o.k ?? 1; c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy);
    const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, '#2B3A41'); g.addColorStop(1, '#1A252B');
    c.beginPath(); c.roundRect(x, y, s, s, 22); c.fillStyle = g; c.fill();
    c.strokeStyle = o.hi ? rgba(PAL.warm, 0.95 * o.hi) : rgba(PAL.muted, 0.35); c.lineWidth = o.hi ? 3 : 1.5; c.stroke();
    c.beginPath(); c.moveTo(x + 22, y + 2); c.lineTo(x + s - 22, y + 2); c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 1; c.stroke();
    stage.text(ch, cx, cy + 4, {role: 'display', weight: 700, size: s * 0.62, color: o.hi ? PAL.warm : PAL.ink, align: 'center'});
    c.restore();
  });
}
const BAND = {y: 1010, h: 96, x0: 100, x1: 800, s0: 822, s1: 980};
function originScene(stage, t, p, ctx) {
  const P = ctx.P, O = P.origin, H = P.hook, cam = camAt(t, O.cam), {GW, GC} = glowBegin(), SC = P.sc;
  const st = SC.origin.start;
  withCamH(stage, cam, () => {
    // the hook's line flies off left; the curve panel drops out of the frame (no fade to empty)
    { const q = clamp((t - st) / 0.3); if (q < 1) { const bx = lineBoxes(SENTS[0].slice(0, 3)); bx.forEach((b, i) => chip(stage, {...b, x: b.x - 1100 * q * q}, {kind: i < 2 ? 'given' : 'cover'})); } }
    { const q = clamp((t - st) / 0.4); if (q < 1) { const c = stage.ctx; c.save(); c.translate(0, 400 * q * q); curvePanel(stage, H.k(H.cycles.length - 1), {a: 1}); c.restore(); } }
    body(stage, lerp(1, 0.25, smooth((t - st) / 0.35)), {cam, label: bodyLabel(cam)});
    dialBoard(stage, M.rowA(M.snapAt(H.k(H.cycles.length - 1)), PREV), {cam, a: lerp(1, 0.25, smooth((t - st) / 0.35))});
    // G P T tiles drop in (accelerate, bounce, contact ring)
    const lift = t >= O.bands ? -60 * backOut(clamp((t - O.bands) / 0.45)) : 0;
    ['G', 'P', 'T'].forEach((ch, i) => {
      const t0 = O.drop + i * 0.09, q = clamp((t - t0) / 0.45); if (q <= 0) return;
      const y = lerp(-200, TILE.y, drop(q)) + lift, isP = i === 1, pq = isP ? backOut(clamp((t - O.mid) / 0.35)) : 0;
      letterTile(stage, tileX(i), y - 22 * pq, TILE.s, ch, {hi: isP && t >= O.mid ? 1 : 0, k: (1 + 0.1 * pq) * squash(t, t0 + 0.32, 0.12, 0.06), a: isP || t < O.mid ? 1 : 0.55});
      ringPop(stage, tileX(i) + TILE.s / 2, TILE.y + TILE.s, t, t0 + 0.32, {r0: 20, r1: 90, color: PAL.muted});
    });
    // "Pre-trained" under P, typed fast
    if (t >= O.pre) {
      const s = 'Pre-trained', n = Math.min(s.length, Math.floor((t - O.pre) / 0.045) + 1);
      stage.text(s.slice(0, n), 540, TILE.y + TILE.s + 72 + lift, {role: 'display', weight: 700, size: 60, color: PAL.ink, align: 'center'});
    }
    if (t >= O.miri && t < O.bands + 0.2) tag(stage, '미리 배웠다', 540, TILE.y + TILE.s + 160, {color: PAL.warm, size: 36, a: backOut(clamp((t - O.miri) / 0.3)) * (1 - smooth((t - O.bands) / 0.2))});
    // two bands: long (text study), short (chat) — the short one's outline first, filled bands later
    if (t >= O.bands) {
      const c = stage.ctx, aL = backOut(clamp((t - O.bands) / 0.4));
      withAlpha(c, clamp(aL), () => { c.beginPath(); c.roundRect(BAND.x0, BAND.y, (BAND.x1 - BAND.x0) * aL, BAND.h, 12); c.fillStyle = rgba('#0A151B', 0.85); c.fill(); c.strokeStyle = rgba(PAL.cool, 0.55); c.lineWidth = 1.5; c.stroke(); });
      for (const tl_ of O.tiles) {
        const q = clamp((t - tl_.t) / 0.32); if (q <= 0) continue;
        const tx = BAND.x0 + 8 + tl_.x * (BAND.x1 - BAND.x0 - 16), ty = BAND.y + 9 + tl_.row * 27, w = tl_.w * (BAND.x1 - BAND.x0) * 0.6 - 3;
        const x = lerp(-120, tx, easeOut(q)), y = lerp(BAND.y - 60, ty, easeOut(q));
        if (q < 1) streak(stage, [-120, BAND.y - 60], [tx, ty], easeOut(q), {color: PAL.cool, a: 0.3, w: 5});
        c.beginPath(); c.roundRect(x, y, Math.max(6, w), 23, 5); c.fillStyle = '#1F3B48'; c.fill(); c.strokeStyle = rgba(PAL.cool, 0.45); c.lineWidth = 1; c.stroke();
      }
      const sA = backOut(clamp((t - O.short) / 0.35)), chatHi = clamp((t - O.chat) / 0.2);
      if (t >= O.short) withAlpha(c, clamp(sA), () => {
        const cx = (BAND.s0 + BAND.s1) / 2, w = (BAND.s1 - BAND.s0) * sA;
        c.beginPath(); c.roundRect(cx - w / 2, BAND.y, w, BAND.h, 12); c.fillStyle = chatHi > 0 ? rgba('#5C3B12', 0.6 * chatHi) : 'rgba(0,0,0,0)'; c.fill();
        c.strokeStyle = chatHi > 0 ? rgba(PAL.hot, 0.95) : rgba(PAL.muted, 0.6); c.lineWidth = chatHi > 0 ? 2.5 : 1.5; c.setLineDash(chatHi > 0 ? [] : [6, 6]); c.stroke(); c.setLineDash([]);
      });
      if (t >= O.first) tag(stage, '먼저: 글로 공부', (BAND.x0 + BAND.x1) / 2, BAND.y + BAND.h + 44, {color: PAL.cool, size: 32, a: backOut(clamp((t - O.first) / 0.3))});
      if (t >= O.chat) tag(stage, '그다음: 대화', BAND.s1, BAND.y - 40, {align: 'right', color: PAL.warm, size: 32, a: backOut(clamp((t - O.chat) / 0.3))});
    }
  });
  glowFlush(stage);
}

// =====================================================================================================
// ESSENCE
// =====================================================================================================
const FULL = ['해는', '동쪽에서', '뜬다', '.'];
const PITCH = 92;                                     // waterfall line pitch
function problemLine(stage, q, y, o = {}) {
  const s = SENTS[q.sent], bx = lineBoxes(s, 52, y);
  bx.forEach((b, i) => chip(stage, b, {kind: i < q.pos ? 'given' : 'cover', a: o.a ?? 1, hi: i === q.pos ? (o.hi ?? 0.6) : 0}));
  return bx;
}
function essenceScene(stage, t, p, ctx) {
  const P = ctx.P, E = P.essence, O = P.origin, cam = camAt(t, E.cam), {GW, GC} = glowBegin(), SC = P.sc, st = SC.essence.start;
  let bigA = 0, nShown = 0;
  withCamH(stage, cam, () => {
    // origin's tiles and bands fly up out; the body comes back
    { const q = clamp((t - st) / 0.35); if (q < 1) { const c = stage.ctx; c.save(); c.translate(0, -900 * q * q);
      ['G', 'P', 'T'].forEach((ch, i) => letterTile(stage, tileX(i), TILE.y - 170, TILE.s, ch, {hi: i === 1 ? 1 : 0}));
      c.beginPath(); c.roundRect(BAND.x0, BAND.y, BAND.x1 - BAND.x0, BAND.h, 12); c.fillStyle = '#1F3B48'; c.fill(); c.restore(); } }
    const inW = t < E.w0 - 0.2 ? 1 : t < E.gather ? 0.25 : 1;
    const bodyA = t < st + 0.4 ? lerp(0.25, 1, smooth((t - st) / 0.4)) : t < E.w0 - 0.2 ? 1 : t < E.gather ? lerp(1, 0.22, smooth((t - E.w0 + 0.2) / 0.3)) : lerp(0.22, 1, smooth((t - E.gather) / 0.4));
    const bv = boardVisAll(cam);                    // s06–s07 close-up: if any dial would be cut, the whole board leaves
    body(stage, bodyA * bv, {label: bodyLabel(cam)});
    dialBoard(stage, M.rowA(M.SNAP[0], PREV), {cam, a: 0.3 * bodyA * bv});      // the numbers sit dim until s10 introduces them
    if (t < E.w0) {
      // s06–s07: the full line pops in, then covers drop on '뜬다' '.'
      const bx = lineBoxes(FULL);
      bx.forEach((b, i) => {
        const q = backOut(clamp((t - E.lineIn - i * 0.07) / 0.3)); if (q <= 0) return;
        chip(stage, b, {kind: 'given', pop: q});
      });
      if (t >= E.read && t < E.read + 1.4) sweep(stage, bx.slice(0, 2), clamp((t - E.read) / 0.9));
      for (const i of [2, 3]) {
        const t0 = E.cover + (i - 2) * 0.1, q = clamp((t - t0) / 0.35); if (q <= 0) continue;
        const b = bx[i], y = lerp(b.y - 140, b.y, drop(q)), peek = i === 2 ? clamp((t - E.peek) / 0.18) * (1 - clamp((t - E.close) / 0.18)) : 0;
        const hi = i === 2 ? Math.max(t >= E.one ? 1 : 0, t >= E.hid && t < E.hid + 0.6 ? 1 : 0) : 0;
        if (peek > 0) chip(stage, b, {kind: 'given', a: peek});
        withAlpha(stage.ctx, 1 - 0.65 * peek, () => chip(stage, {...b, y}, {kind: 'cover', hi}));
        ringPop(stage, b.x + b.w / 2, b.y + b.h, t, t0 + 0.25, {color: PAL.muted, r0: 10, r1: 60});
      }
      if (t >= E.one) { const b = bx[2]; tag(stage, '다음 조각 하나', b.x + b.w / 2, b.y + b.h + 44, {color: PAL.warm, size: 32, a: backOut(clamp((t - E.one) / 0.3)) * (1 - smooth((t - E.read + 0.3) / 0.3))}); }
    } else {
      // s08 waterfall: each new problem enters at the bottom of the stack; the stack is pushed up (spring) and
      // problems leave over the top. Speeds up at "얼마든지".
      let n = 0; for (const q of E.probs) if (t >= q.t) n++;
      nShown = n;
      const scroll = E.probs.reduce((s, q, i) => s + (i === 0 ? 0 : spring(clamp((t - q.t) / 0.3), 16, 7)), 0);
      const yTop = LINE.y0 + 7 * PITCH;                // newest line's slot
      const gq = clamp((t - E.gather) / 0.4);
      E.probs.forEach((q, i) => {
        if (t < q.t) return;
        const y = yTop + i * PITCH - scroll * PITCH, enter = backOut(clamp((t - q.t) / 0.25));
        const last = i === E.probs.length - 1;
        if (y < LINE.y0 - 12) return;
        const a = clamp((y - LINE.y0 + 12) / 40);       // gone before it reaches the header
        if (last && gq > 0) { const yy = lerp(y, LINE.y0, backOut(gq)); problemLine(stage, q, yy, {hi: 0}); return; }
        const xo = (1 - enter) * 300 - (gq > 0 ? 1100 * gq * gq : 0);
        const c = stage.ctx; c.save(); c.translate(xo, 0); problemLine(stage, q, y, {a: a * (gq > 0 ? 1 : 1), hi: 0.6}); c.restore();
      });
    }
  });
  glowFlush(stage);
  if (t >= E.w0) bigNum(stage, String(Math.max(1, nShown)), '문제', t, E.w0, 1 - smooth((t - E.gather) / 0.3), BIGPOS);
}

export const scenes = {hook: hookScene, origin: originScene, essence: essenceScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  hook: P => [[-Infinity, '오늘의 주제', 'GPT는 어떻게 배웠을까?']],
  origin: P => { const at = s => P.tl.at(s) - 0.5; return [[-Infinity, '이름 · GPT의 P', 'P = Pre-trained'], [at('s05'), '순서', '먼저 글로 공부, 그다음 대화']]; },
  essence: P => { const at = s => P.tl.at(s) - 0.5; return [[-Infinity, '본질', '가리고, 다음 조각 맞히기'], [at('s07'), '본질', '정답은 가린 자리에 있다'], [at('s08'), `본질 · 빨라짐`, '채점할 사람이 필요 없다']]; },
};
export const signature = P => [P.hook.next, P.origin.mid, P.essence.cover, P.essence.w0, P.essence.gather].map(x => x.toFixed(3)).join('/');

// =====================================================================================================
// SOUND
// =====================================================================================================
export function soundIntro(tl, P) {
  const H = P.hook, O = P.origin, E = P.essence, ev = [];
  ev.push(snd.swell('poster', 0.05, [98, 147], 1.6, -36, '첫 화면(썸네일): 포스터 구도'));
  ev.push(snd.swell('poster_end', P.poster, [98, 147], 1.4, -36, '포스터 구도로 돌아옴'));
  H.cycles.filter(c => !c.last).forEach((c, i) => ev.push(snd.tick('hook_open' + (i + 1), c.t + 0.6, 392, -35, `훅: 가림막이 젖혀지며 정답이 드러남(${i + 1}) — 곡선 머리가 오름`)));
  ev.push(snd.tone('hook_ghost', H.bump, 98, 0.45, -33, "s02: '문법' '지식'이 몸통에 들어가지 못하고 튕겨 남", {decay: 0.2, sustain: 0.2}));
  ev.push(snd.tick('hook_next', H.next, 330, -34, "s03: 가림막 강조 + 꼬리표 '다음 말 맞히기'"));
  ev.push(snd.tick('origin_land', O.drop + 0.32, 147, -36, 'G P T 타일이 떨어져 자리 잡음', {decay: 0.12}));
  ev.push(snd.tone('origin_p', O.mid, 262, 0.5, -35, "s04: 가운데 글자 P 가 들림", {decay: 0.25, sustain: 0.2}));
  ev.push(snd.swell('origin_fill', O.fill0, [131, 196], O.fill1 - O.fill0 + 0.3, -38, 's05: 엄청난 양의 글 조각이 긴 띠를 채움'));
  ev.push(snd.tick('origin_chat', O.chat, 330, -35, "s05: 짧은 띠(대화) 강조 — 글 공부가 먼저 끝난 뒤"));
  ev.push(snd.tick('ess_cover', E.cover + 0.25, 160, -33, "s06: 가림막이 '뜬다 .' 위로 떨어져 덮음", {decay: 0.12}));
  ev.push(snd.tick('ess_one', E.one, 330, -36, 's06: 바로 다음 조각 하나만 강조'));
  ev.push(snd.tick('ess_peek', E.peek, 392, -37, "s07: 가림막이 비쳐 '뜬다'가 보임"));
  ev.push(snd.tick('ess_close', E.close, 220, -37, 's07: 다시 닫힘'));
  const slow = E.probs.filter(q => q.t < E.probs[0].t + 2.2), fast = E.probs.slice(slow.length);
  slow.forEach((q, i) => ev.push(snd.tick('ess_prob' + (i + 1), q.t, 300, -37, `s08: 문제 한 줄이 들어옴(${i + 1})`, {decay: 0.05})));
  ev.push(snd.train('ess_fast', fast.map((q, i) => [q.t, 'tick', {freq: 300 + 6 * i, decay: 0.03, gain_db: -4, click: 0}]), -37, 's08: 빨라진 문제들(줄마다 틱, 음이 조금씩 오름)'));
  return ev;
}
