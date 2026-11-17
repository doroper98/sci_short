// The race: pixel picture (draw) + crisp HD type (overlay). All positions, the clock and the board come from model.mjs.
import {W, H, SCALE, C, clamp, lerp, smooth, ease} from './px.mjs';
import {ATH, N, TL, T_REF, dist, speed, phase, kOf, raceTime, cameraD, laneOf, rankLabel, phaseLabel, gapAtBoltFinish, videoTimeOf, DATA} from './model.mjs';
import {camera, toScreen, drawWorld, drawDistanceBoards} from './world.mjs';
import {poseFor, drawRunner, drawShadow, KITS, SKINS, BODY_H} from './runner.mjs';
import {drawFlag} from './flags.mjs';

export const DUR = TL.duration;
const REACT = DATA.pace_profile.reaction_s;
const [F0, F1] = TL.freeze;
const CROSS = ATH.map(a => videoTimeOf(a.time));
const GAP20 = gapAtBoltFinish(N - 1);

// kit variant per athlete: alternate within a country, in list order
const KIT = (() => { const seen = {}; return ATH.map(a => { const v = seen[a.country] = (seen[a.country] ?? -1) + 1; const ks = KITS[a.country]; return ks[v % ks.length]; }); })();
const SCALE_OF = i => i === 0 ? 1.05 : 1;                                   // Bolt ~5% taller
const SET_SHIFT = -0.3;                                                     // metres: in the blocks the body sits behind its race point

/** per-frame state of every runner */
export function frameState(t) {
  const tau = raceTime(t), cam = camera(cameraD(t));
  const rs = ATH.map((a, i) => {
    const k = kOf(i), d = tau > 0 ? dist(i, tau) : 0, v = tau > 0 ? speed(i, tau) : 0;
    const react = REACT / k, q = smooth((tau - react) / 0.32);
    const dd = d + SET_SHIFT * (1 - q), u = laneOf(i) + 0.5;
    const [sx, sy] = toScreen(cam, dd, u);
    return {i, lane: laneOf(i), d, v, gx: Math.round(sx), gy: Math.round(sy), s: SCALE_OF(i),
      st: {tau, react, d, v, ph: phase(i, tau), finishedFor: tau - a.time}};
  });
  return {t, tau, cam, rs};
}

export let lastBodies = [];                                                // buffer-px bboxes of the last drawn frame (for checks)

export function draw(P, t) {
  const fs = frameState(t);
  const crowd = t < TL.gun ? 0.15 : clamp(0.3 + 0.7 * (fs.tau / T_REF));
  drawWorld(P, fs.cam, t, crowd);
  drawDistanceBoards(P, fs.cam);
  for (const r of fs.rs) drawShadow(P, r.gx, r.gy);
  lastBodies = [];
  // far lane (0) first so nearer runners overlap
  for (const r of [...fs.rs].sort((a, b) => a.lane - b.lane)) {
    const bb = drawRunner(P, r.gx, r.gy, poseFor(r.st), KIT[r.i], SKINS[r.lane % 2], r.s);
    lastBodies.push({i: r.i, bb});
  }
  return fs;
}

// ------------------------------------------------------------------ HD overlay
const SH = 'rgba(4,7,16,0.65)';
const GOLD = '#F7C766', AMBER = '#F2A742', OFF = '#F6EFE2', MUTED_GOLD = '#CDAE6A';
const TAG_H = 28, TAG_DX = 26;

/** tag rectangle (screen px) for runner r: right edge TAG_DX px left of his centre, bottom 6 px above his highest head top.
 *  TAG_DX is 26, not the 8 of the brief: with 8 the kicked heel of the runner just behind (up-left) clipped the leader's tag. */
export function tagGeom(stage, r, wide = false) {
  const a = ATH[r.i];
  const wt = stage.measure(a.time.toFixed(2), {size: 22, weight: 700}), wy = stage.measure(String(a.year), {size: 20, weight: 500});
  const w = 6 + 30 + 7 + wt + 7 + wy + 9;
  const xr = SCALE * r.gx - TAG_DX, yb = SCALE * (r.gy - BODY_H * r.s) - 6;
  return {x: xr - w, y: yb - TAG_H, w, h: TAG_H, wt, wy};
}

function pill(ctx, x, y, w, h, fill, stroke = null) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawTag(T, r, t, alpha = 1) {
  const {ctx, stage} = T, a = ATH[r.i], won = r.i === 0 && t >= F0;
  const g = tagGeom(stage, r, won);
  const since = t - CROSS[r.i], flash = since >= 0 && since < 0.45 && r.i !== 0 ? 1 - since / 0.45 : 0;
  const crossed = t >= CROSS[r.i];
  ctx.save(); ctx.globalAlpha = alpha;
  if (won) pill(ctx, g.x, g.y, g.w, g.h, GOLD);
  else pill(ctx, g.x, g.y, g.w, g.h, crossed ? 'rgba(18,24,44,0.86)' : 'rgba(8,12,26,0.74)', crossed ? `rgba(247,199,102,${0.35 + 0.65 * flash})` : null);
  if (flash > 0) { ctx.globalAlpha = 0.55 * flash * alpha; pill(ctx, g.x, g.y, g.w, g.h, '#FFFFFF'); ctx.globalAlpha = alpha; }
  drawFlag(ctx, a.country, g.x + 6, g.y + 4, 30, 20);
  const tx = g.x + 6 + 30 + 7, cy = g.y + g.h / 2 + 1;
  stage.text(a.time.toFixed(2), tx, cy, {size: 22, weight: 700, color: won ? '#1A1408' : '#FFFFFF'});
  stage.text(String(a.year), tx + g.wt + 7, cy, {size: 20, weight: 500, color: won ? '#3B2C0C' : MUTED_GOLD});
  if (won) {                                                                  // "WR" chip, sitting on the tag's upper-right corner
    const cx = g.x + g.w - 40, cy = g.y - 20;
    ctx.beginPath(); ctx.roundRect(cx, cy, 40, 22, 6); ctx.fillStyle = '#C8202F'; ctx.fill();
    stage.text('WR', cx + 20, cy + 12, {size: 17, weight: 700, color: '#FFFFFF', align: 'center'});
  }
  ctx.restore();
  return won ? {...g, y: g.y - 20, h: g.h + 20} : g;
}

/** fixed-width clock: every digit sits in a cell of the same width so the number never jitters */
function clock(T, s, cx, cy, size, alpha) {
  const {ctx, stage} = T;
  stage.applyFont({role: 'display', weight: 700, size}); const dw = Math.max(...'0123456789'.split('').map(d => ctx.measureText(d).width)), pw = ctx.measureText('.').width;
  const cells = [...s].map(ch => (ch === '.' ? pw : dw)), total = cells.reduce((p, q) => p + q, 0);
  let x = cx - total / 2;
  [...s].forEach((ch, k) => { stage.text(ch, x + cells[k] / 2, cy, {role: 'display', weight: 700, size, color: GOLD, align: 'center', alpha, shadow: SH, shadowBlur: 20, tracking: 0}); x += cells[k]; });
}

export const LAYOUT = {kicker: 150, head1: 220, head2: 284, clock: 405, bar: 492, sub: 532, barX0: 290, barX1: 790};

export function overlay(T, t, fs) {
  const {ctx, stage} = T;
  const boardQ = ease(t, TL.board_in[0] - 0.2, TL.board_in[0] + 0.25);
  // top darkening so the headline reads over the track and stands
  const g = ctx.createLinearGradient(0, 0, 0, 640);
  g.addColorStop(0, 'rgba(5,8,18,0.82)'); g.addColorStop(0.55, 'rgba(5,8,18,0.5)'); g.addColorStop(1, 'rgba(5,8,18,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, stage.W, 640);

  // tags: far lanes first (a nearer tag is drawn on top, though they never overlap)
  const tags = [];
  for (const r of [...fs.rs].sort((a, b) => a.lane - b.lane)) tags.push({i: r.i, ...drawTag(T, r, t, 1 - boardQ)});

  // finish: flash, gap bracket
  if (t >= F0 && t < F0 + 2 / 30 + 1e-6) { ctx.fillStyle = `rgba(255,255,255,${t < F0 + 1 / 30 ? 0.85 : 0.45})`; ctx.fillRect(0, 0, stage.W, stage.H); }
  const brQ = t >= F0 ? clamp((t - F0) / 0.12) * (1 - ease(t, F1 + 0.15, F1 + 0.55)) : 0;
  if (brQ > 0) gapBracket(T, brQ);

  // dim + results board
  if (boardQ > 0) { ctx.fillStyle = `rgba(4,6,14,${0.7 * boardQ})`; ctx.fillRect(0, 0, stage.W, stage.H); }

  // top block
  const L = LAYOUT, cx = stage.W / 2;
  stage.text("MEN'S 100 m · ALL-TIME TOP 20", cx, L.kicker, {size: 26, weight: 700, color: AMBER, tracking: 5, align: 'center', shadow: SH, shadowBlur: 10, alpha: 1 - boardQ});
  stage.text('The 20 fastest men in history.', cx, L.head1, {role: 'display', size: 56, weight: 700, color: OFF, align: 'center', shadow: SH, shadowBlur: 18});
  stage.text('One race.', cx, L.head2, {role: 'display', size: 56, weight: 700, color: OFF, align: 'center', shadow: SH, shadowBlur: 18});
  const ca = 1 - boardQ;
  if (ca > 0) {
    clock(T, Math.max(0, fs.tau).toFixed(2), cx, L.clock, 140, ca);
    // progress bar 0..100 m with the leader's marker
    const x0 = L.barX0, x1 = L.barX1, by = L.bar, lead = clamp(fs.rs[0].d / 100);
    ctx.save(); ctx.globalAlpha = ca;
    ctx.fillStyle = 'rgba(246,239,226,0.22)'; ctx.fillRect(x0, by - 2, x1 - x0, 4);
    ctx.fillStyle = GOLD; ctx.fillRect(x0, by - 2, (x1 - x0) * lead, 4);
    for (let k = 0; k <= 10; k++) { ctx.fillStyle = k % 5 ? 'rgba(246,239,226,0.35)' : 'rgba(246,239,226,0.7)'; ctx.fillRect(x0 + (x1 - x0) * k / 10 - 1, by - (k % 5 ? 6 : 9), 2, k % 5 ? 12 : 18); }
    ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * lead, by, 8, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill();
    ctx.restore();
    stage.text('0', x0 - 14, by, {size: 20, weight: 500, color: '#C9C2B4', align: 'right', alpha: ca});
    stage.text('100 m', x1 + 14, by, {size: 20, weight: 500, color: '#C9C2B4', alpha: ca});
    // badge + line
    const lab = phaseLabel(t), slow = lab === 'SLOW MOTION' || lab === 'FREEZE';
    const bw = stage.measure(lab, {size: 18, weight: 700, tracking: 2}) + 24, line = 'Each runs his personal best';
    const lw = stage.measure(line, {size: 22, weight: 500}), gx0 = cx - (bw + 14 + lw) / 2;
    ctx.save(); ctx.globalAlpha = ca;
    pill(ctx, gx0, L.sub - 15, bw, 30, slow ? '#C8202F' : 'rgba(246,239,226,0.14)', slow ? null : 'rgba(246,239,226,0.45)');
    ctx.restore();
    stage.text(lab, gx0 + bw / 2, L.sub + 1, {size: 18, weight: 700, color: '#FFFFFF', tracking: 2, align: 'center', alpha: ca});
    stage.text(line, gx0 + bw + 14, L.sub, {size: 22, weight: 500, color: '#E7DFD0', alpha: ca, shadow: SH, shadowBlur: 8});
  }
  if (boardQ > 0) board(T, t);
  // fade to black over the last 0.3 s
  const fo = ease(t, DUR - TL.fade_out_s, DUR);
  if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${fo})`; ctx.fillRect(0, 0, stage.W, stage.H); }
  return tags;
}

/** thin bracket along lane 0 from the last runner to the finish line, frozen at Bolt's finish */
function gapBracket(T, a) {
  const {ctx, stage} = T, cam = camera(cameraD(F0)), i = N - 1, u = laneOf(i) - 0.35;
  const d0 = dist(i, T_REF), p = toScreen(cam, d0, u).map(v => v * SCALE), q = toScreen(cam, 100, u).map(v => v * SCALE);
  const nx = 0.7071 * 10, ny = -0.7071 * 10;                                  // tick direction: across the track, far side
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
  ctx.moveTo(p[0] - nx, p[1] - ny); ctx.lineTo(p[0] + nx, p[1] + ny); ctx.moveTo(q[0] - nx, q[1] - ny); ctx.lineTo(q[0] + nx, q[1] + ny); ctx.stroke();
  // label in the empty space past the line, with a thin leader
  const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], lx = 740, ly = 1165;           // past the finish line: empty track at this instant
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(m[0] + 4, m[1] + 6); ctx.lineTo(lx + 90, ly - 50); ctx.stroke();
  pill(ctx, lx - 170, ly - 50, 340, 104, 'rgba(8,12,26,0.88)', 'rgba(255,255,255,0.6)');
  ctx.restore();
  stage.text(`${GAP20.toFixed(1)} m`, lx, ly - 10, {role: 'display', size: 44, weight: 700, color: '#FFFFFF', align: 'center', alpha: a});
  stage.text('No. 20 behind when Bolt wins', lx, ly + 30, {size: 20, weight: 500, color: '#E7DFD0', align: 'center', alpha: a});
}

const BOARD = {title: 345, row0: 400, rowH: 48, x: [90, 160, 224, 720, 822], foot: [1385, 1416, 1447]};
function board(T, t) {
  const {ctx, stage} = T, t0 = TL.board_in[0], B = BOARD;
  const tq = ease(t, t0 - 0.1, t0 + 0.2);
  stage.text("ALL-TIME TOP 20 · MEN'S 100 m", stage.W / 2, B.title, {size: 30, weight: 700, color: AMBER, tracking: 3, align: 'center', alpha: tq});
  ATH.forEach((a, i) => {
    const q = ease(t, t0 + i * TL.row_stagger, t0 + i * TL.row_stagger + 0.22); if (q <= 0) return;
    const y = B.row0 + i * B.rowH + B.rowH / 2, dx = (1 - q) * 40, gold = i === 0;
    ctx.save(); ctx.globalAlpha = q;
    ctx.fillStyle = gold ? 'rgba(247,199,102,0.95)' : i % 2 ? 'rgba(24,32,58,0.88)' : 'rgba(16,22,42,0.88)';
    ctx.beginPath(); ctx.roundRect(70 + dx, y - B.rowH / 2 + 3, 860, B.rowH - 6, 8); ctx.fill();
    drawFlag(ctx, a.country, B.x[1] + dx, y - 12, 36, 24);
    ctx.restore();
    const ink = gold ? '#1A1408' : OFF, sub = gold ? '#3B2C0C' : MUTED_GOLD;
    const [first, ...rest] = a.name.split(' ');
    stage.text(rankLabel(i), B.x[0] + dx, y + 1, {size: 28, weight: 700, color: ink, alpha: q});
    const w1 = stage.text(first + ' ', B.x[2] + dx, y + 1, {size: 28, weight: 500, color: ink, alpha: q});
    stage.text(rest.join(' ').toUpperCase(), B.x[2] + dx + w1, y + 1, {size: 28, weight: 700, color: ink, alpha: q});
    stage.text(a.time.toFixed(2), B.x[3] + dx, y + 1, {size: 30, weight: 700, color: ink, alpha: q});
    stage.text(String(a.year), B.x[4] + dx, y + 1, {size: 26, weight: 500, color: sub, alpha: q});
  });
  const fq = ease(t, t0 + 0.7, t0 + 1.0);
  ctx.save(); ctx.globalAlpha = fq; ctx.beginPath(); ctx.roundRect(70, B.foot[0] - 22, 940 - 70, B.foot[2] - B.foot[0] + 44, 10); ctx.fillStyle = 'rgba(8,11,22,0.82)'; ctx.fill(); ctx.restore();
  stage.text('Wind-legal personal bests. Four men share 18th at 9.82 —', stage.W / 2, B.foot[0], {size: 22, weight: 500, color: '#D9D1C2', align: 'center', alpha: fq});
  stage.text('the first 20 on the list are shown.', stage.W / 2, B.foot[1], {size: 22, weight: 500, color: '#D9D1C2', align: 'center', alpha: fq});
  stage.text("Pace profile: Bolt's 2009 splits scaled to each time. Data: World Athletics, Nov 2026.", stage.W / 2, B.foot[2], {size: 20, weight: 500, color: '#A9A293', align: 'center', alpha: fq, maxWidth: 860});
}
