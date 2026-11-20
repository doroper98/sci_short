// 47 RAM — 램은 어떻게 기억할까
// Look grammar (2026-11-10): every moving thing is a link of the causal chain; one clock for world, gauges and sound;
// change one condition and keep an afterimage; only energy/signal glows — stored charge is the one warm colour, the control
// signal (word line, address, power) the one cool colour; matte filled bodies (wells, capacitor bowl, transistor door, chips).
// Stage: one DRAM array seen from above (hook, refresh, close) → one cell enlarged as a side-view schematic (origin, essence,
// cell) → a 4×6 slice of the array with its bit lines and sense amplifiers (read) → the RAM cell beside a flash cell (storage).
// HDR (2026-11-15): the stored charge, the open word line / address signal, the bit-line drive and the power LED are drawn
// inside lit(). Captions, gauges, labels, walls and chips never are.
// First moment (2026-11-16): 0–2.0 s the power is off and the picture stored in the array leaks away cell by cell (each cell at
// its own rate); 2.2–3.0 s it is rewound to "before the power went off"; then refresh sweeps keep it; s02 shows it again slowly.
// Model notes / simplifications (also in brief.md):
//  - Capacitor = bowl, transistor = sliding door, charge = a level in the bowl (schematic, not geometry). Real cells are deep
//    trench/stacked capacitors; bit lines are compared in pairs (BL / BL̄) — drawn as one line per column here.
//  - Charge sharing: the bit line is precharged to half the supply; ΔV ≈ ±(Vdd/2)·Cs/(Cs+Cb) with Cb ≈ 10 Cs → ±9 % of the half
//    swing; the bar scale is honest (no exaggeration) — the label says "아주 조금".
//  - Retention: most cells hold far longer than 64 ms (RAIDR); a few weak cells set the 64 ms interval. Leak rates here are
//    illustrative. Hook / refresh / storage decays are time-compressed (declared in the kicker).
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, rand, poly, line, circle, ring, rect, withAlpha, arrow, lit, ensureGain, TAU,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const events = [];
export const captionLayout = {};

const W = 1080, H = 1920;
const PAL = {
  bg: '#001621', deep: '#000E16', ink: '#EFE3D4', muted: '#8AA0A6', border: '#1C3A45', plate: '#06222E',
  warm: '#FF8C3A', warmHi: '#FFC48A',      // stored charge / high voltage (the one warm colour)
  cool: '#5BB8E8',                          // control signal: word line, address, power (the one cool colour)
  die: '#0B232C', well: '#06161D', rim: '#2A4855', rimHi: '#3C6170',
  wall: '#5C7480', wallHi: '#7690A0', wallLo: '#3A4E57', door: '#4A6470', doorLeaf: '#2C3F47', rail: '#24404B',
  mid: '#6E8790',                           // precharged bit line (half voltage) — grey, not a light
};
const fmt = (x, d = 0) => (+x.toFixed(d)).toString();
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const evAll = (ctx, id) => ctx.events.filter(e => new RegExp(`^${id}\\d+$`).test(e.id)).map(e => e.time).sort((a, b) => a - b);
const evT = (ctx, id) => ctx.events.get(id).time;
const S = (ctx, id) => ctx.tl.sentence(id);
// Text laid over glowing (lit) things: blank the gain map under it so the HDR grade does not brighten the white text
// together with the light below (pipeline/render/hdr.mjs, docs/HDR.md — same idea as the pixel episodes' `unlit`).
// Only the gain map changes; the SDR picture is untouched. `a` = how much of the light to remove (the text's opacity).
function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;          // nothing lit yet in this frame: the map is already black there
  gc.save();
  gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.globalCompositeOperation = 'source-over';
  gc.fillStyle = '#000'; gc.fillRect(x, y, w, h);
  gc.restore();
  g.dirty = true;
}

// =====================================================================================================
// The stored picture (mountains and a sun) — what the array "remembers"
// =====================================================================================================
function pic(u, v) {
  const ridge = 0.41 + 0.09 * Math.sin(u * 6.3 + 0.4) + 0.05 * Math.sin(u * 15.1 + 1.7)
    - 0.16 * Math.exp(-(((u - 0.3) / 0.12) ** 2)) - 0.06 * Math.exp(-(((u - 0.66) / 0.1) ** 2));
  if (v > ridge) return 1;
  const du = (u - 0.83) * 1.1, dv = v - 0.15;
  return du * du + dv * dv < 0.09 * 0.09 ? 1 : 0;
}
function makeGrid(x0, y0, pitch, cols, rows, force = []) {
  const cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, f = force.find(q => q.i === i && q.j === j);
    cells.push({i, j, k, x: x0 + (i + 0.5) * pitch, y: y0 + (j + 0.5) * pitch, one: f ? 1 : pic((i + 0.5) / cols, (j + 0.5) / rows),
      r: rand(k * 7 + 3), weak: f ? f.weak : rand(k * 13 + 5) < 0.025});
  }
  return {x0, y0, pitch, cols, rows, cells};
}
const G_HOOK = makeGrid(20, 200, 40, 26, 26);
const TRACK = {weak: {i: 20, j: 10}, typ: {i: 7, j: 14}};
const G_REF = makeGrid(105, 330, 29, 30, 19, [{...TRACK.weak, weak: true}, {...TRACK.typ, weak: false}]);
const cellAt = (G, q) => G.cells[q.j * G.cols + q.i];

function drawArray(stage, G, lev, {cursor = null, ghost = 0, marks = null, frame = 1} = {}) {
  const c = stage.ctx, p = G.pitch, s = p * 0.84, w = G.cols * p, h = G.rows * p;
  rect(c, G.x0 - 18, G.y0 - 20, w + 36, h + 40, 10, PAL.die, rgba(PAL.border, frame), 2);
  for (let j = 0; j < G.rows; j++) { const y = G.y0 + j * p; line(c, [[G.x0 - 6, y], [G.x0 + w + 6, y]], rgba(PAL.cool, 0.1), 1.5); }
  for (let i = 0; i <= G.cols; i++) { const x = G.x0 + i * p; line(c, [[x, G.y0 - 6], [x, G.y0 + h + 6]], rgba(PAL.muted, 0.1), 1.5); }
  for (const q of G.cells) rect(c, q.x - s / 2, q.y - s / 2, s, s, s * 0.22, PAL.well, PAL.rim, 1.5);
  const L = G.cells.map(lev);
  if (ghost > 0) withAlpha(c, ghost, () => {
    for (const q of G.cells) if (q.one && L[q.k] < 0.35) { const a = s * 0.36; line(c, [[q.x - a, q.y - a], [q.x + a, q.y - a], [q.x + a, q.y + a], [q.x - a, q.y + a], [q.x - a, q.y - a]], rgba(PAL.ink, 0.42), 1.2, {dash: [3, 3]}); }
  });
  // the cell's own surround takes a little of the charge's colour (not a light: drawn outside lit())
  for (const q of G.cells) { const l = L[q.k]; if (l >= 0.02) rect(c, q.x - p / 2 + 1, q.y - p / 2 + 1, p - 2, p - 2, p * 0.22, rgba(PAL.warm, 0.42 * l)); }
  lit(stage, cc => {
    for (const q of G.cells) {
      const l = L[q.k]; if (l < 0.02) continue;
      rect(cc, q.x - s * 0.4, q.y - s * 0.4, s * 0.8, s * 0.8, s * 0.16, rgba(mix(PAL.warm, PAL.warmHi, 0.3), 0.15 + 0.85 * l));
    }
  }, {gain: 0.3});
  if (cursor != null && cursor >= 0 && cursor < G.rows) lit(stage, cc => {
    const y = G.y0 + (Math.floor(cursor) + 0.5) * p;
    rect(cc, G.x0 - 8, y - p / 2, w + 16, p, 4, rgba(PAL.cool, 0.16));
    line(cc, [[G.x0 - 14, y - p / 2], [G.x0 + w + 14, y - p / 2]], rgba(PAL.cool, 0.9), 3);
  }, {gain: 0.5});
  if (marks) marks(c, L);
  return L;
}
// refresh sweeps: each sweep event starts a pass over all rows lasting P seconds
function sweepState(t, starts, P, rows) {
  let k = -1; for (let i = 0; i < starts.length; i++) if (starts[i] <= t) k = i;
  if (k < 0) return {pos: null, last: j => (starts.length ? starts[0] - P + (j + 0.5) / rows * P : -Infinity), k};
  const pos = t < starts[k] + P ? (t - starts[k]) / P * rows : null;
  const last = j => { const tk = starts[k] + (j + 0.5) / rows * P; if (tk <= t) return tk; return k > 0 ? starts[k - 1] + (j + 0.5) / rows * P : starts[k] - P + (j + 0.5) / rows * P; };
  return {pos, last, k};
}
function led(stage, x, y, on, label = true) {
  const c = stage.ctx;
  circle(c, x, y, 11, '#1B2C32'); ring(c, x, y, 11, rgba(PAL.rimHi, 1), 2);
  if (on > 0.01) lit(stage, cc => { circle(cc, x, y, 8, rgba(PAL.cool, on)); circle(cc, x, y, 16, rgba(PAL.cool, 0.18 * on)); }, {gain: 0.6});
  if (label) stage.text(on > 0.5 ? '전원 켜짐' : '전원 꺼짐', x + 24, y + 1, {size: 26, weight: 500, color: on > 0.5 ? PAL.ink : PAL.muted});
}

// =====================================================================================================
// One cell, side view: bit line | door (transistor) | bowl (capacitor); word line drives the door's gate
// =====================================================================================================
function bowl(stage, x, y, w, h, level, {th = 16, thresh = false, ghostLevel = null} = {}) {
  const c = stage.ctx, ix = x + th, iw = w - 2 * th, iy = y, ih = h - th;
  rect(c, x, y - 6, w, h + 6, 10, PAL.wall, rgba('#000', 0.35), 1.5);
  rect(c, x + 3, y - 4, th * 0.45, h, 4, rgba(PAL.wallHi, 0.55));
  rect(c, x + w - th * 0.7, y - 4, th * 0.5, h, 4, rgba(PAL.wallLo, 0.7));
  rect(c, ix, iy, iw, ih, 6, PAL.well);
  const lv = clamp(level), top = iy + ih * (1 - lv);
  if (lv > 0.004) lit(stage, cc => {
    rect(cc, ix + 2, top, iw - 4, iy + ih - top - 2, 5, rgba(PAL.warm, 0.78));
    line(cc, [[ix + 4, top + 1.5], [ix + iw - 4, top + 1.5]], rgba(PAL.warmHi, 0.95), 3);
  }, {gain: 0.4});
  if (ghostLevel != null) { const gy = iy + ih * (1 - clamp(ghostLevel)); line(c, [[ix + 4, gy], [ix + iw - 4, gy]], rgba(PAL.ink, 0.7), 2, {dash: [6, 5]}); }
  if (thresh) { const ty = iy + ih * 0.5; line(c, [[x - 10, ty], [x + w + 10, ty]], rgba(PAL.ink, 0.55), 2, {dash: [4, 6]}); }
  return {ix, iw, iy, ih};
}
// geometry of a cell at (cx, cy), scale k: returns key points
function cellGeo(cx, cy, k) {
  return {
    bitX: cx - 300 * k, pipeY: cy + 60 * k,
    door: [cx - 175 * k, cy - 10 * k, 120 * k, 140 * k],
    bowl: [cx + 20 * k, cy - 210 * k, 230 * k, 380 * k],
    wordY: cy - 110 * k, top: cy - 270 * k, bot: cy + 260 * k,
  };
}
function drawCell(stage, t, cx, cy, k, st = {}) {
  const {open = 0, level = 0, gate = 0, bitV = 0.5, bitLit = 0, flow = 0, leak = 0, labels = true, wordLabel = true, ghostLevel = null, thresh = false, noBowl = false} = st;
  const c = stage.ctx, g = cellGeo(cx, cy, k), [dx, dy, dw, dh] = g.door, [bx, by, bw, bh] = g.bowl;
  // word line → gate
  const gx = dx + dw / 2;
  line(c, [[g.bitX - 40 * k, g.wordY], [gx, g.wordY], [gx, dy - 26 * k]], PAL.rail, 10 * k, {cap: 'butt'});
  rect(c, dx + 6 * k, dy - 30 * k, dw - 12 * k, 16 * k, 4, '#33505B');
  if (gate > 0.01) lit(stage, cc => { line(cc, [[g.bitX - 40 * k, g.wordY], [gx, g.wordY], [gx, dy - 26 * k]], rgba(PAL.cool, 0.95 * gate), 6 * k, {cap: 'butt'}); rect(cc, dx + 6 * k, dy - 30 * k, dw - 12 * k, 16 * k, 4, rgba(PAL.cool, 0.8 * gate)); }, {gain: 0.5});
  // bit line (vertical rail) and its voltage
  rect(c, g.bitX - 9 * k, g.top, 18 * k, g.bot - g.top, 6, PAL.rail);
  const bc = bitV > 0.55 ? PAL.warm : null;
  if (bitLit > 0.01 && bc) lit(stage, cc => rect(cc, g.bitX - 6 * k, g.top + 3, 12 * k, g.bot - g.top - 6, 5, rgba(bc, 0.85 * bitLit * clamp((bitV - 0.5) * 2))), {gain: 0.5});
  else if (bitV > 0.3 && bitV <= 0.55) rect(c, g.bitX - 6 * k, g.top + 3, 12 * k, g.bot - g.top - 6, 5, rgba(PAL.mid, 0.75));
  // pipes: bit line → door → bowl
  rect(c, g.bitX, g.pipeY - 13 * k, dx - g.bitX, 26 * k, 3, PAL.well, PAL.rim, 1.5);
  rect(c, dx + dw, g.pipeY - 13 * k, bx + 16 * k - dx - dw, 26 * k, 3, PAL.well, PAL.rim, 1.5);
  // door body (matte) with the channel and the sliding leaf
  rect(c, dx, dy, dw, dh, 8, PAL.door, rgba('#000', 0.35), 1.5);
  rect(c, dx + 3, dy + 3, dw * 0.18, dh - 6, 4, rgba(PAL.wallHi, 0.35));
  rect(c, dx, g.pipeY - 13 * k, dw, 26 * k, 0, PAL.well);
  const leafY = g.pipeY - 16 * k - open * 64 * k;
  rect(c, dx + dw * 0.32, leafY, dw * 0.36, 32 * k, 3, PAL.doorLeaf, rgba('#000', 0.4), 1.5);
  // capacitor bowl
  const B = noBowl ? null : bowl(stage, bx, by, bw, bh, level, {th: 16 * k, ghostLevel, thresh});
  // charge travelling in the pipes (flow > 0: into the bowl, < 0: out), and the slow leak through the closed door
  const pipePts = q => [lerp(g.bitX + 10 * k, bx + 24 * k, q), g.pipeY];
  if (Math.abs(flow) > 0.01 && open > 0.6) lit(stage, cc => {
    for (let i = 0; i < 9; i++) { let q = (t * 0.9 + i / 9) % 1; if (flow < 0) q = 1 - q; const [x, y] = pipePts(q); circle(cc, x, y + (rand(i) - 0.5) * 10 * k, 6 * k, rgba(PAL.warm, 0.9 * Math.abs(flow))); }
  }, {gain: 0.6});
  if (leak > 0.01 && open < 0.2) lit(stage, cc => {
    for (let i = 0; i < 3; i++) { const q = ((t * 0.18 + i / 3) % 1); const x = lerp(bx + 16 * k, dx + dw * 0.3, q), y = g.pipeY + (rand(i + 4) - 0.5) * 8 * k; circle(cc, x, y, 4 * k, rgba(PAL.warm, 0.75 * leak * (1 - q))); }
  }, {gain: 0.5});
  if (labels) withAlpha(c, typeof labels === 'number' ? labels : 1, () => {
    const L = (s, x, y, al = 'center') => stage.text(s, x, y, {size: Math.round(28 * Math.max(0.85, k)), weight: 500, color: PAL.muted, align: al});
    L('세로줄', g.bitX, g.top - 26 * k);
    if (wordLabel) L('가로줄', g.bitX + 30 * k, g.wordY - 30 * k, 'left');
    L('트랜지스터', dx + dw / 2, dy + dh + 34 * k);
    if (!noBowl) L('축전기', bx + bw / 2, by + bh + 34 * k);
  });
  return {g, B};
}

// =====================================================================================================
// Poster (0 s frame = thumbnail): white question above, the topic word biggest
// =====================================================================================================
const POSTER = {q: ['1초에 15번 넘게 다시 채워야 하는', '램은 어떻게 기억할까?'], a: 'RAM', qy: 590, ay: 830, QS: 56, AS: 220};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 110, yBot = POSTER.ay + POSTER.AS * 0.62 + 70;
  unlitRect(stage, 0, yTop, W, yBot - yTop, 1 - smooth(q / 0.8));
  withAlpha(c, 1 - smooth(q / 0.8), () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.18, 'rgba(0,10,16,0.62)'); g.addColorStop(0.85, 'rgba(0,10,16,0.62)'); g.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
    const sh = {shadow: 'rgba(0,0,0,0.95)', shadowBlur: 22}, dy = -q * 120;
    POSTER.q.forEach((s, i) => stage.text(s, 540, POSTER.qy + i * POSTER.QS * 1.25 + dy, {role: 'display', weight: 700, size: POSTER.QS, color: '#FFFFFF', align: 'center', maxWidth: 960, ...sh}));
    stage.text(POSTER.a, 540, POSTER.ay + dy, {role: 'display', weight: 700, size: POSTER.AS, color: PAL.warm, align: 'center', tracking: -0.02 * POSTER.AS, ...sh, shadowBlur: 30});
  });
}
const MORPH = ctx => [S(ctx, 's01').end + 0.15, S(ctx, 's01').end + 0.95];

// =====================================================================================================
// Header text per scene: [time from which it applies, kicker, title]
// =====================================================================================================
function titleList(id, ctx) {
  const a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, '시간 압축 · 전원을 끈 뒤 (한 예)', '전원이 꺼지면']];
    case 'origin': return [[-Infinity, '이름 · Random Access Memory', '어느 칸이든 곧바로'], [a('s04'), '기원 · 1960년대 후반', '트랜지스터 하나, 축전기 하나'], [a('s05'), '이름 · Dynamic RAM', '디램: 가만두면 변한다']];
    case 'essence': return [[-Infinity, '본질 · 한 칸 (크기 과장)', '그릇 같은 축전기'], [a('s07'), '본질 · 한 칸', '차 있으면 1, 비면 0'], [a('s08'), '본질 · 시간 압축', '저절로 새어 나간다'], [a('s09'), '본질 · 시간 압축', '사라지기 전에 다시 채운다']];
    case 'cell': return [[-Infinity, '확대 · 한 칸 (아주 느리게)', '트랜지스터는 문'], [a('s11'), '쓰기 · 아주 느리게', '세로줄 전압이 정한다'], [a('s12'), '시간 압축', '닫혀도 조금씩 샌다']];
    case 'read': return [[-Infinity, '읽기 · 수십 나노초를 몇 초로', '가로줄 하나가 열린다'], [a('s14'), '읽기 · 전하 나눔', '중간 전압의 긴 세로줄'], [a('s15'), '읽기 · 감지 증폭기', '작은 차이를 키운다'], [a('s16'), '읽기 · 다시 쓰기', '읽으면 다시 써 넣는다'], [a('s17'), '읽기 · 주소', '가로 번호와 세로 번호']];
    case 'refresh': return [[-Infinity, '리프레시 · 64밀리초를 2.4초로', '줄마다 차례로 다시 채운다'], [a('s19'), '리프레시 · 64밀리초마다 한 바퀴', '1초에 15번 넘게'], [a('s20'), '리프레시', '가장 빨리 새는 칸에 맞춘다'], [a('s21'), '시간 압축 · 전원을 끄면', '리프레시가 멈춘다']];
    case 'storage': return [[-Infinity, '비교 · 시간 압축', '램과 SSD'], [a('s23'), '비교', '지금 쓰는 것, 오래 둘 것']];
    case 'close': return [[-Infinity, '정리', '새면 다시 채운다']];
  }
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  unlitRect(stage, 0, 118, W, 146, Math.max(kicker ? aK : 0, title ? aT : 0));
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 900, ...so}));
}
function captionBand(c) { const g = c.createLinearGradient(0, 1240, 0, 1920); g.addColorStop(0, 'rgba(0,8,12,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.5)'); g.addColorStop(1, 'rgba(0,8,12,0.7)'); c.fillStyle = g; c.fillRect(0, 1240, W, 680); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, 'rgba(0,8,12,0.72)'); g.addColorStop(0.7, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 300); }

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, M = MORPH(ctx);
  if (id === 'hook' && t < M[1]) { posterTitle(stage, easeInOut((t - M[0]) / (M[1] - M[0]))); if (t < M[0]) return; }
  captionBand(stage.ctx); topBand(stage.ctx);
  if (id === 'close' && t > ctx.tl.at('s24') - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? fadeIn(t, M[0] + 0.3, 0.5) : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, M[0] + 0.3, 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage) { const c = stage.ctx; c.fillStyle = PAL.bg; c.fillRect(0, 0, W, H); }

function panel(c, x, y, w, h) { rect(c, x, y, w, h, 14, rgba(PAL.plate, 0.92), rgba(PAL.border, 1), 2); }
function hbar(stage, x, y, w, v, {label = '', col = PAL.ink, ghost = null, h = 18, litBar = false} = {}) {
  const c = stage.ctx;
  rect(c, x, y - h / 2, w, h, h / 2, rgba(PAL.border, 0.95));
  if (v > 0.002) { if (litBar) lit(stage, cc => rect(cc, x, y - h / 2, Math.max(h, w * clamp(v)), h, h / 2, col), {gain: 0.4}); else rect(c, x, y - h / 2, Math.max(h, w * clamp(v)), h, h / 2, col); }
  if (ghost != null) { const gx = x + w * clamp(ghost); line(c, [[gx, y - h], [gx, y + h]], rgba(PAL.ink, 0.75), 3, {dash: [5, 5]}); }
  if (label) stage.text(label, x - 20, y, {size: 26, weight: 500, color: PAL.muted, align: 'right'});
}

// =====================================================================================================
// Hook timing: power off at 0 → leak (0–2 s) → rewind (2.2–3.0) → power on, refresh sweeps → power off again in s02
// =====================================================================================================
const REW = [2.2, 3.0], HP = 1.0;
const hookTau = t => (t < REW[0] ? t : Math.max(0, REW[0] - (t - REW[0]) * REW[0] / (REW[1] - REW[0])));
const death0 = q => 0.05 + 1.4 * Math.pow(q.r, 1.4);
function leakLevelsAfterOff(t, off, span, q, base) {           // decay after a power-off at `off`, spread over `span` seconds
  const d = off + 0.25 + (death0(q) - 0.05) / 1.4 * span;
  return base * (1 - smooth((t - d) / Math.max(0.3, span * 0.18)));
}

export const scenes = {
  // chain: power off → each cell leaks at its own rate → picture gone (result first) → rewind → power on, the refresh cursor
  //        sweeps → s02: power off again, the cursor stops, the picture leaks away against a clock (one example)
  hook(stage, t, p, ctx) {
    const c = stage.ctx, G = G_HOOK, s02 = S(ctx, 's02');
    const off2 = evT(ctx, 'off2'), span = s02.end - 0.6 - off2, sweeps = evAll(ctx, 'hsweep');
    const sw = sweepState(t, sweeps, HP, G.rows);
    let lev, cursor = null, on = 0;
    if (t < REW[1]) { const tau = hookTau(t); lev = q => (q.one ? 1 - smooth((tau - death0(q)) / 0.3) : 0); on = smooth((t - REW[1] + 0.15) / 0.15); }
    else {
      const base = q => (q.one ? 1 - 0.12 * clamp((Math.min(t, off2) - sw.last(q.j)) / HP) : 0);
      lev = t < off2 ? base : q => leakLevelsAfterOff(t, off2, span, q, base(q));
      cursor = t < off2 ? sw.pos : null; on = t < off2 ? 1 : 1 - smooth((t - off2) / 0.12);
    }
    const ghost = t > off2 ? fadeIn(t, off2 + span * 0.5, 0.8) : 0;
    const L = drawArray(stage, G, lev, {cursor, ghost});
    const showUi = fadeIn(t, MORPH(ctx)[0] + 0.2, 0.5);
    led(stage, 52, 172, on, false);
    if (showUi > 0) withAlpha(c, showUi, () => stage.text(on > 0.5 ? '전원 켜짐' : '전원 꺼짐', 76, 173, {size: 26, weight: 500, color: on > 0.5 ? PAL.ink : PAL.muted}));
    // gauge during s02: seconds since power off (one example) and the share of '1' cells still read as 1
    const ga = fadeIn(t, off2 - 0.5) * fadeOut(t, ctx.scene.end - 0.35);
    if (ga > 0) withAlpha(c, ga, () => {
      const x0 = 70, y0 = 296; panel(c, x0, y0, 420, 190); unlitRect(stage, x0, y0, 420, 190, ga);
      const sec = 60 * clamp((t - off2) / (span + 0.4));
      stage.text(`전원 끈 뒤 ${fmt(sec)}초`, x0 + 24, y0 + 46, {role: 'display', weight: 700, size: 38, color: PAL.ink});
      stage.text('한 예 · 기계마다 다름', x0 + 24, y0 + 90, {size: 24, color: PAL.muted});
      let n1 = 0, n = 0; for (const q of G.cells) if (q.one) { n++; if (L[q.k] > 0.5) n1++; }
      stage.text('남은 1', x0 + 24, y0 + 145, {size: 26, weight: 500, color: PAL.muted});
      hbar(stage, x0 + 120, y0 + 145, 200, n1 / n, {col: PAL.warm, litBar: false});
      stage.text(`${fmt(100 * n1 / n)}%`, x0 + 396, y0 + 145, {size: 28, weight: 700, color: PAL.ink, align: 'right'});
    });
  },

  // chain: tape winds to the wanted cell (far = long) / RAM: row + column address light the cell at once (always short) →
  //        one cell = transistor + capacitor slide together (Dennard) → charge fills → D = dynamic: the level falls by itself
  origin(stage, t, p, ctx) {
    const c = stage.ctx, s03 = S(ctx, 's03'), s04 = S(ctx, 's04'), s05 = S(ctx, 's05');
    const sk = [evT(ctx, 'seek1'), evT(ctx, 'seek2')], DUR = [0.35, 2.4], TGT = [3, 43];
    // ---- tape vs RAM (s03)
    const ta = fadeOut(t, s04.start - 0.5, 0.5) * fadeIn(t, ctx.scene.start, 0.3);
    if (ta > 0) withAlpha(c, ta, () => {
      // tape
      stage.text('테이프', 60, 400, {role: 'display', weight: 700, size: 40, color: PAL.ink});
      let pos = 0; if (t > sk[0]) pos = lerp(0, TGT[0], easeInOut((t - sk[0]) / DUR[0]));
      if (t > sk[1]) pos = lerp(TGT[0], TGT[1], easeInOut((t - sk[1]) / DUR[1]));
      const headX = 230, pitch = 46, ty = 500;
      rect(c, 0, ty - 30, W, 60, 0, '#2a2622');
      for (let i = Math.floor(pos) - 6; i < Math.floor(pos) + 22; i++) {
        if (i < 0) continue; const x = headX + (i - pos) * pitch;
        rect(c, x - 18, ty - 18, 36, 36, 5, rand(i + 50) < 0.55 ? '#5a4c40' : '#3a332c');
        if (i % 5 === 0) stage.text(String(i), x, ty + 48, {size: 24, color: PAL.muted, align: 'center'});
      }
      rect(c, headX - 34, ty - 70, 68, 34, 6, PAL.door, rgba('#000', 0.4), 1.5); rect(c, headX - 8, ty - 38, 16, 10, 2, '#33505B');
      stage.text('읽는 머리', headX, ty - 92, {size: 24, color: PAL.muted, align: 'center'});
      const reach = k => t > sk[k] + DUR[k];
      for (let k = 0; k < 2; k++) if (t > sk[k] && (k === 1 || t < sk[1])) {
        const x = headX + (TGT[k] - pos) * pitch;
        if (reach(k)) lit(stage, cc => ring(cc, x, ty, 26, rgba(PAL.cool, 0.95), 4), {gain: 0.5});
        else ring(c, x, ty, 26, rgba(PAL.ink, 0.6), 2);
      }
      // RAM grid with row/column address
      stage.text('램', 60, 740, {role: 'display', weight: 700, size: 40, color: PAL.ink});
      const gx0 = 230, gy0 = 700, gp = 56, cols = 12, rows = 4, T2 = [[1, 2], [3, 10]];
      rect(c, gx0 - 14, gy0 - 14, cols * gp + 28, rows * gp + 28, 8, PAL.die, PAL.border, 2);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) rect(c, gx0 + i * gp + 6, gy0 + j * gp + 6, gp - 12, gp - 12, 8, PAL.well, PAL.rim, 1.5);
      for (let k = 0; k < 2; k++) if (t > sk[k] && (k === 1 || t < sk[1])) {
        const [r, cl] = T2[k], q = smooth((t - sk[k]) / 0.12);
        lit(stage, cc => {
          line(cc, [[gx0 - 14, gy0 + (r + 0.5) * gp], [gx0 + (cl + 0.5) * gp, gy0 + (r + 0.5) * gp]], rgba(PAL.cool, 0.85 * q), 4);
          line(cc, [[gx0 + (cl + 0.5) * gp, gy0 - 14], [gx0 + (cl + 0.5) * gp, gy0 + (r + 0.5) * gp]], rgba(PAL.cool, 0.85 * q), 4);
          ring(cc, gx0 + (cl + 0.5) * gp, gy0 + (r + 0.5) * gp, 26, rgba(PAL.cool, q), 4);
        }, {gain: 0.5});
      }
      // gauge: time to reach the wanted cell (same clock as the motion)
      const bx = 300, bw = 640, sc = bw / 2.6;
      stage.text('찾는 데 걸린 시간', 60, 1010, {size: 28, weight: 500, color: PAL.muted});
      const el = k => clamp(t - sk[k], 0, DUR[k]), elR = k => clamp(t - sk[k], 0, 0.12);
      const curK = t > sk[1] ? 1 : 0;
      stage.text('테이프', bx - 20, 1070, {size: 26, weight: 500, color: PAL.ink, align: 'right'});
      rect(c, bx, 1061, bw, 18, 9, rgba(PAL.border, 0.95)); if (t > sk[0]) rect(c, bx, 1061, Math.max(18, el(curK) * sc), 18, 9, PAL.ink);
      if (curK === 1) line(c, [[bx + DUR[0] * sc, 1052], [bx + DUR[0] * sc, 1088]], rgba(PAL.ink, 0.75), 3, {dash: [5, 5]});
      stage.text('램', bx - 20, 1130, {size: 26, weight: 500, color: PAL.ink, align: 'right'});
      rect(c, bx, 1121, bw, 18, 9, rgba(PAL.border, 0.95)); if (t > sk[0]) rect(c, bx, 1121, Math.max(18, elR(curK) * sc + 18), 18, 9, PAL.ink);
      if (t > sk[0]) stage.text(`${TGT[curK]}번째 자리`, bx + bw, 1010, {size: 26, weight: 500, color: PAL.ink, align: 'right'});
    });
    // ---- one cell: transistor + capacitor (s04), then D = dynamic (s05)
    const ca = fadeIn(t, s04.start - 0.3, 0.5);
    if (ca > 0) withAlpha(c, ca, () => {
      const join = smooth((t - evT(ctx, 'join1') + 1.2) / 1.2), lvlFill = smooth((t - evT(ctx, 'fill1')) / 1.4);
      const leakT = ctx.tl.at('s05', 2.0), lvl = lvlFill * (1 - 0.55 * smooth((t - leakT) / 3.6));
      const cy = 650, k = 0.95;
      // the transistor half slides in from the left, the capacitor half from the right; they meet at join1
      const off = (1 - join) * 300;
      c.save(); c.beginPath(); c.rect(0, 0, 570, H); c.clip(); c.translate(-off, 0);
      drawCell(stage, t, 560, cy, k, {level: 0, labels: 1, wordLabel: false, bitV: 0, noBowl: true});
      c.restore();
      c.save(); c.beginPath(); c.rect(570, 0, W, H); c.clip(); c.translate(off, 0);
      const B = bowl(stage, cellGeo(560, cy, k).bowl[0], cellGeo(560, cy, k).bowl[1], cellGeo(560, cy, k).bowl[2], cellGeo(560, cy, k).bowl[3], lvl, {th: 16 * k});
      stage.text('축전기', cellGeo(560, cy, k).bowl[0] + cellGeo(560, cy, k).bowl[2] / 2, cellGeo(560, cy, k).bowl[1] + cellGeo(560, cy, k).bowl[3] + 34, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
      c.restore();
      const na = fadeIn(t, evT(ctx, 'join1') + 0.2, 0.5) * fadeOut(t, s05.start - 0.3, 0.4);
      if (na > 0) withAlpha(c, na, () => {
        stage.text('트랜지스터 1개 + 축전기 1개 = 한 칸', 540, 1030, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'center'});
        stage.text('로버트 데나드 · IBM', 540, 1100, {size: 30, weight: 500, color: PAL.muted, align: 'center'});
      });
      const da = fadeIn(t, s05.start + 0.2, 0.5);
      if (da > 0) withAlpha(c, da, () => {
        stage.text('D', 330, 1080, {role: 'display', weight: 700, size: 110, color: PAL.warm, align: 'right'});
        stage.text('RAM', 336, 1080, {role: 'display', weight: 700, size: 110, color: PAL.ink});
        stage.text('Dynamic', 650, 1050, {role: 'display', weight: 500, size: 44, color: PAL.warm});
        stage.text('가만두면 변한다', 650, 1110, {size: 32, weight: 500, color: PAL.ink});
        if (t > leakT) stage.text('저절로 줄어듦', cellGeo(560, cy, k).bowl[0] + cellGeo(560, cy, k).bowl[2] + 20, cy - 30, {size: 26, color: PAL.muted});
      });
    });
  },

  // chain: one bowl fills (charge in) → full = 1 / empty = 0 → left alone it leaks → the level crosses the threshold → read as 0
  //        → (core) topped up before it falls that far: a sawtooth, the leak-only curve kept as a dashed afterimage
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s06 = S(ctx, 's06'), s07 = S(ctx, 's07'), s08 = S(ctx, 's08'), s09 = S(ctx, 's09');
    const bx = 120, by = 430, bw = 270, bh = 520;                 // bowl; the graph shares its vertical scale
    const f2 = evT(ctx, 'fill2'), dr = evT(ctx, 'drain1'), f3 = evT(ctx, 'fill3');
    const T0 = s08.start + 0.3, TAU0 = 3.6 / Math.LN2, D = 5.4;    // leak: crosses half at 3.6 s
    const refills = evAll(ctx, 'refill'), T1 = refills.length ? refills[0] - 1.2 : s09.start + 0.2, RP = 1.2;
    const leakV = tau => Math.exp(-Math.max(0, tau) / TAU0);
    const saw = tau => { let last = 0; for (let k = 1; k <= refills.length; k++) if (tau >= k * RP) last = k * RP; return leakV(tau - last); };
    let lvl;
    if (t < s08.start) lvl = smooth((t - f2) / 1.2) * (1 - smooth((t - dr) / 0.7)) + smooth((t - f3) / 0.7) * (t > f3 ? 1 : 0);
    else if (t < T1) lvl = leakV(t - T0);
    else lvl = saw(t - T1);
    lvl = clamp(lvl);
    const ghost = t > T1 ? leakV(t - T1) : null;
    const B = bowl(stage, bx, by, bw, bh, lvl, {th: 20, thresh: t > s08.start - 0.3, ghostLevel: ghost != null && t < T1 + D ? ghost : null});
    stage.text('축전기', bx + bw / 2, by + bh + 44, {size: 30, weight: 500, color: PAL.muted, align: 'center'});
    // read-out 1 / 0 (threshold = half)
    const one = lvl > 0.5;
    stage.text(one ? '1' : '0', bx + bw / 2, 360, {role: 'display', weight: 700, size: 92, color: one ? PAL.warm : PAL.muted, align: 'center'});
    // graph: same vertical scale as the bowl's inside (0 at the inner bottom, full at the top)
    const ga = fadeIn(t, s08.start - 0.6, 0.5);
    if (ga > 0) withAlpha(c, ga, () => {
      const gx0 = 470, gx1 = 1000, y0 = B.iy + B.ih, y1 = B.iy, Y = v => lerp(y0, y1, v), X = tau => lerp(gx0, gx1, tau / D);
      line(c, [[gx0, y1 - 10], [gx0, y0], [gx1, y0]], rgba(PAL.muted, 0.9), 2);
      line(c, [[bx + bw + 8, Y(0.5)], [gx1, Y(0.5)]], rgba(PAL.ink, 0.55), 2, {dash: [4, 6]});
      stage.text('문턱', gx1, Y(0.5) - 22, {size: 26, weight: 500, color: PAL.muted, align: 'right'});
      stage.text('1', gx0 - 18, Y(0.82), {size: 28, weight: 700, color: PAL.muted, align: 'right'});
      stage.text('0', gx0 - 18, Y(0.18), {size: 28, weight: 700, color: PAL.muted, align: 'right'});
      stage.text('시간 →', gx1, y0 + 34, {size: 26, color: PAL.muted, align: 'right'});
      line(c, [[bx + bw + 8, Y(lvl)], [gx0, Y(lvl)]], rgba(PAL.ink, 0.35), 1.5, {dash: [3, 5]});   // the bowl level and the graph share one ruler
      const curve = (f, tau1, col, w, dash = null) => { const pts = []; for (let i = 0; i <= 120; i++) { const tau = D * i / 120; if (tau > tau1) break; pts.push([X(tau), Y(f(tau))]); } if (pts.length > 1) line(c, pts, col, w, {dash}); };
      if (t < T1) curve(leakV, t - T0, PAL.ink, 4);
      else {
        curve(leakV, D, rgba(PAL.ink, 0.6), 2.5, [7, 6]);            // afterimage: no refill
        lit(stage, cc => { const pts = []; for (let i = 0; i <= 240; i++) { const tau = D * i / 240; if (tau > t - T1) break; pts.push([X(tau), Y(saw(tau))]); } if (pts.length > 1) line(cc, pts, rgba(PAL.warm, 0.95), 4); }, {gain: 0.45});
        refills.forEach((tr, k) => { if (t >= tr) { const x = X((k + 1) * RP); line(c, [[x, y0], [x, y0 + 14]], rgba(PAL.ink, 0.8), 2); } });
        if (t > refills[0]) stage.text('다시 채움', X(RP), y0 + 34, {size: 24, color: PAL.ink, align: 'center'});
      }
      // where the leak curve crosses the threshold: the bit flips
      const cross = T0 + 3.6;
      if (t > cross && t < T1 + 0.5) withAlpha(c, fadeIn(t, cross, 0.3), () => { circle(c, X(3.6), Y(0.5), 8, PAL.ink); stage.text('1 → 0', X(3.6), Y(0.5) + 44, {size: 30, weight: 700, color: PAL.ink, align: 'center'}); });
    });
  },

  // chain: word line signal (cool) reaches the gate → door slides open → bit line high: charge flows in (1) / low: flows out (0)
  //        / high again (1) → word line off: door closes, charge trapped → a slow trickle through the closed door
  cell(stage, t, p, ctx) {
    const c = stage.ctx, g1 = evT(ctx, 'gate1'), g2 = evT(ctx, 'gate2'), u1 = evT(ctx, 'bitup1'), d1 = evT(ctx, 'bitdn1'), u2 = evT(ctx, 'bitup2');
    const gate = smooth((t - g1) / 0.25) * (1 - smooth((t - g2) / 0.25)), open = smooth((t - g1 - 0.15) / 0.5) * (1 - smooth((t - g2 - 0.1) / 0.5));
    let bitV = 0.5; if (t > u1) bitV = 1; if (t > d1) bitV = 0; if (t > u2) bitV = 1; if (t > g2 + 0.6) bitV = 0.5;
    let lvl = 0.0;
    lvl = smooth((t - u1 - 0.1) / 1.1);
    if (t > d1) lvl = 1 - smooth((t - d1 - 0.1) / 1.0);
    if (t > u2) lvl = smooth((t - u2 - 0.1) / 1.0);
    const leakStart = g2 + 0.7; if (t > leakStart) lvl = 1 - 0.32 * smooth((t - leakStart) / 4.0);
    const flow = open > 0.6 ? (t > u2 ? 1 - smooth((t - u2 - 1.0) / 0.3) : t > d1 ? -(1 - smooth((t - d1 - 1.0) / 0.3)) : t > u1 ? 1 - smooth((t - u1 - 1.1) / 0.3) : 0) : 0;
    drawCell(stage, t, 560, 640, 1.0, {open, level: lvl, gate, bitV, bitLit: 1, flow, leak: t > leakStart ? 1 : 0, labels: true, thresh: false});
    // read-out of what is stored
    stage.text(lvl > 0.5 ? '1' : '0', 700, 330, {role: 'display', weight: 700, size: 76, color: lvl > 0.5 ? PAL.warm : PAL.muted, align: 'center'});
    // gauges (same clock): word line, bit line voltage, cell voltage
    const x0 = 360, w = 560;
    hbar(stage, x0, 1080, w, gate, {label: '가로줄 신호', col: PAL.cool, litBar: true});
    hbar(stage, x0, 1135, w, t > u1 && t < g2 + 0.6 ? bitV : 0.5, {label: '세로줄 전압', col: PAL.ink});
    hbar(stage, x0, 1190, w, lvl, {label: '칸 전압', col: PAL.warm, ghost: 0.5});
    stage.text('문턱', x0 + w * 0.5, 1222, {size: 24, color: PAL.muted, align: 'center'});
    if (t > g2 + 0.3) withAlpha(c, fadeIn(t, g2 + 0.3), () => stage.text('문 닫힘 · 조금씩 샘', 700, 930, {size: 28, weight: 500, color: PAL.ink, align: 'center'}));
  },

  // chain: one word line opens a whole row of doors → each cell's charge spreads into its long, half-voltage bit line
  //        → bit line voltage moves a little up (1) or down (0) → sense amplifiers drive it all the way → the full value flows
  //        back into the cells (rewritten) → the column number picks one bit to send out
  read(stage, t, p, ctx) {
    const c = stage.ctx, ron = evT(ctx, 'rowon1'), amp = evT(ctx, 'amp1'), back = evT(ctx, 'wback1'), csel = evT(ctx, 'colsel1'), out = evT(ctx, 'out1'), roff = evT(ctx, 'rowoff1');
    const s14 = S(ctx, 's14');
    const COLS = 6, ROWS = 4, X = i => 175 + i * 140, Yr = j => 400 + j * 150, R = 2, VAL = [1, 0, 1, 1, 0, 1], SEL = 3;
    const other = (i, j) => (rand(i * 11 + j * 5 + 2) < 0.5 ? 1 : 0);
    const share = smooth((t - ron - 0.2) / 0.6) * (1 - smooth((t - back) / 0.6));
    const ampQ = smooth((t - amp) / 0.6) * (1 - smooth((t - roff - 0.4) / 0.5));
    const rowGate = smooth((t - ron) / 0.25) * (1 - smooth((t - roff) / 0.25));
    const backQ = smooth((t - back) / 0.8);
    const cq = smooth((t - csel) / 0.25);
    const dV = 0.09;                                       // ±ΔV as a fraction of the half swing (Cb ≈ 10 Cs)
    // row decoder and word lines
    rect(c, 50, 330, 60, 560, 8, PAL.door, rgba('#000', 0.35), 1.5);
    stage.text('가로', 80, 296, {size: 24, color: PAL.muted, align: 'center'});
    for (let j = 0; j < ROWS; j++) {
      const y = Yr(j) - 50; line(c, [[110, y], [X(COLS - 1) + 110, y]], PAL.rail, 8);
      stage.text(String(j), 80, Yr(j), {size: 28, weight: 700, color: j === R && rowGate > 0.5 ? PAL.ink : PAL.muted, align: 'center'});
    }
    if (rowGate > 0.01) lit(stage, cc => line(cc, [[110, Yr(R) - 50], [X(COLS - 1) + 110, Yr(R) - 50]], rgba(PAL.cool, 0.95 * rowGate), 6), {gain: 0.5});
    // bit lines, sense amplifiers, bars
    const ampY = 1000, barY = 1135, barH = 70;
    for (let i = 0; i < COLS; i++) {
      const x = X(i), v = VAL[i] ? 1 : -1;
      const vb = 0.5 + 0.5 * (share * dV * v * (1 - ampQ) + ampQ * v);          // bit line voltage 0..1 (0.5 = precharged half)
      rect(c, x - 7, 320, 14, ampY - 330, 5, PAL.rail);
      if (vb > 0.52) lit(stage, cc => rect(cc, x - 5, 322, 10, ampY - 334, 4, rgba(PAL.warm, clamp((vb - 0.5) * 2) * 0.95)), {gain: 0.5});
      else if (vb > 0.3) rect(c, x - 5, 322, 10, ampY - 334, 4, rgba(PAL.mid, 0.75 * clamp(1 - Math.abs(vb - 0.5) * 3)));
      // sense amplifier (matte triangle) and its output
      poly(c, [[x - 30, ampY - 22], [x + 30, ampY - 22], [x, ampY + 22]], PAL.door, rgba('#000', 0.4), 1.5);
      if (ampQ > 0.02 && v > 0) lit(stage, cc => poly(cc, [[x - 22, ampY - 16], [x + 22, ampY - 16], [x, ampY + 14]], rgba(PAL.warm, 0.8 * ampQ)), {gain: 0.5});
      // bar: bit line voltage around the half line (honest scale: ±ΔV is ~9 % of the half swing)
      rect(c, x - 22, barY - barH, 44, 2 * barH, 6, rgba(PAL.border, 0.9));
      line(c, [[x - 30, barY], [x + 30, barY]], rgba(PAL.ink, 0.6), 2);
      const dy = (vb - 0.5) * 2 * barH;
      if (Math.abs(dy) > 0.5) rect(c, x - 16, Math.min(barY, barY - dy), 32, Math.abs(dy), 4, v > 0 ? PAL.warm : PAL.mid);
      if (ampQ > 0.6) stage.text(VAL[i] ? '1' : '0', x + 40, ampY, {role: 'display', weight: 700, size: 40, color: VAL[i] ? PAL.warm : PAL.muted});
    }
    for (let i = 0; i < COLS; i++) stage.text(String(i), X(i), 296, {size: 26, weight: 700, color: i === SEL && cq > 0.5 ? PAL.ink : PAL.muted, align: 'center'});
    stage.text('세로', X(COLS - 1) + 70, 296, {size: 24, color: PAL.muted, align: 'center'});
    stage.text('감지 증폭기', 1040, ampY - 50, {size: 24, color: PAL.muted, align: 'right'});
    stage.text('세로줄 전압', 60, barY - barH - 18, {size: 24, color: PAL.muted});
    stage.text('중간', 60, barY, {size: 24, color: PAL.muted});
    if (t > ron + 0.6 && t < amp + 0.3) withAlpha(c, fadeIn(t, ron + 0.6), () => stage.text('아주 조금', X(COLS - 1) + 40, barY - 40, {size: 24, weight: 500, color: PAL.ink}));
    // cells: small side-view bowls right of each bit line; door tab between them
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const x = X(i) + 22, y = Yr(j) - 36, bw = 66, bh = 82, isRow = j === R;
      const full = isRow ? VAL[i] : other(i, j);
      let lvl = full;
      if (isRow) { const shared = full ? 0.5 + dV * 0.5 : 0.5 - dV * 0.5; lvl = lerp(full, shared, share); lvl = lerp(lvl, full, backQ * (t > back ? 1 : 0)); }
      const open = isRow ? rowGate : 0;
      rect(c, X(i) + 6, y + bh * 0.62, 18, 12, 2, PAL.well, PAL.rim, 1);
      rect(c, X(i) + 8, y + bh * 0.62 - 8 - open * 18, 12, 28, 2, PAL.doorLeaf);
      bowl(stage, x, y, bw, bh, lvl, {th: 8, ghostLevel: isRow && t > ron + 0.3 && t < back + 0.9 ? full : null});
    }
    // write-back: charge carried up the bit lines into the open row
    if (t > back && t < back + 0.9) lit(stage, cc => { for (let i = 0; i < COLS; i++) if (VAL[i]) for (let n = 0; n < 3; n++) { const q = clamp((t - back) / 0.8 - n * 0.15); if (q <= 0 || q >= 1) continue; circle(cc, X(i), lerp(ampY - 30, Yr(R) + 10, q), 7, rgba(PAL.warm, 0.9)); } }, {gain: 0.6});
    if (t > back + 0.2 && t < csel) withAlpha(c, fadeIn(t, back + 0.2), () => stage.text('다시 채워짐', X(COLS - 1) + 100, Yr(R) - 92, {size: 26, weight: 500, color: PAL.ink, align: 'right'}));
    // column select and output
    if (cq > 0.01) lit(stage, cc => { rect(cc, X(SEL) - 34, 320, 68, ampY - 300, 10, rgba(PAL.cool, 0.12 * cq)); line(cc, [[X(SEL) - 34, 316], [X(SEL) + 34, 316]], rgba(PAL.cool, 0.9 * cq), 4); }, {gain: 0.4});
    if (t > out) {
      const q = clamp((t - out) / 1.0), x = lerp(X(SEL), 1030, easeInOut(q)), y = ampY + 50;
      line(c, [[X(SEL), y], [1030, y]], rgba(PAL.muted, 0.6), 2, {dash: [5, 6]});
      lit(stage, cc => circle(cc, x, y, 10, rgba(PAL.warm, 0.95)), {gain: 0.6});
      if (q >= 1) stage.text('밖으로', 1030, y + 30, {size: 24, weight: 500, color: PAL.ink, align: 'right'});
    }
    if (t > ctx.tl.at('s17', 3.4)) withAlpha(c, fadeIn(t, ctx.tl.at('s17', 3.4)), () => {
      rect(c, 300, 902, 480, 64, 12, rgba(PAL.plate, 0.94), rgba(PAL.border, 1), 2); unlitRect(stage, 300, 902, 480, 64, fadeIn(t, ctx.tl.at('s17', 3.4)));
      stage.text(`주소 = 가로 ${R}, 세로 ${SEL}`, 540, 935, {role: 'display', weight: 700, size: 38, color: PAL.ink, align: 'center'});
    });
    if (t < s14.start + 0.4 && t > ron + 0.3) withAlpha(c, fadeIn(t, ron + 0.3) * fadeOut(t, s14.start), () => stage.text('한 줄이 한꺼번에', X(COLS - 1) + 100, Yr(R) - 92, {size: 26, weight: 500, color: PAL.ink, align: 'right'}));
  },

  // chain: the refresh cursor opens row after row → each opened row is read and rewritten (levels jump back up) → the cursor
  //        wraps every 64 ms (one pass) → a weak cell leaks fastest and sets the interval → power off: no more passes, cells
  //        fall below the threshold one by one, the picture is gone (dashed afterimage)
  refresh(stage, t, p, ctx) {
    const c = stage.ctx, G = G_REF, RP = 2.4, sweeps = evAll(ctx, 'sweep'), off = evT(ctx, 'off3');
    const sw = sweepState(t, sweeps, RP, G.rows), s19 = S(ctx, 's19'), s20 = S(ctx, 's20');
    const rate = q => (q.weak ? 0.44 : 0.05 + 0.05 * q.r);
    const levAt = (q, tt) => { if (!q.one) return 0; const s = sweepState(Math.min(tt, off), sweeps, RP, G.rows); const base = 1 - rate(q) * clamp((Math.min(tt, off) - s.last(q.j)) / RP, 0, 2); if (tt <= off) return base; const dd = q.weak ? 0.15 + q.r * 0.5 : 0.5 + q.r * 3.4; return base * (1 - smooth((tt - off - dd) / 0.7)); };
    const firstStart = sweeps[0];
    const lev = q => (t < firstStart ? (q.one ? 1 - rate(q) * 0.5 : 0) : levAt(q, t));
    const wq = fadeIn(t, s20.start + 0.3, 0.5);
    const weakC = cellAt(G, TRACK.weak), typC = cellAt(G, TRACK.typ);
    const L = drawArray(stage, G, lev, {cursor: t < off ? sw.pos : null, ghost: t > off ? fadeIn(t, off + 1.5, 0.8) : 0, marks: (cc) => {
      if (wq > 0) withAlpha(cc, wq, () => { for (const q of G.cells) if (q.weak && q.one && q !== weakC) ring(cc, q.x, q.y, G.pitch * 0.62, rgba(PAL.ink, 0.6), 2); });
      ring(cc, weakC.x, weakC.y, G.pitch * 0.72, PAL.ink, 3); ring(cc, typC.x, typC.y, G.pitch * 0.72, rgba(PAL.muted, 0.95), 3);
    }});
    led(stage, 120, 300, t < off ? 1 : 1 - smooth((t - off) / 0.12));
    // scope: two tracked cells' voltage over the last 2.2 passes, same clock (threshold = half)
    const gx0 = 120, gx1 = 1000, gy0 = 1215, gy1 = 960, win = RP * 2.2, Y = v => lerp(gy0, gy1, v), Xs = tt => lerp(gx0, gx1, 1 - (t - tt) / win);
    panel(c, gx0 - 30, gy1 - 52, gx1 - gx0 + 60, gy0 - gy1 + 70);
    line(c, [[gx0, gy1 - 6], [gx0, gy0], [gx1, gy0]], rgba(PAL.muted, 0.9), 2);
    line(c, [[gx0, Y(0.5)], [gx1, Y(0.5)]], rgba(PAL.ink, 0.5), 2, {dash: [4, 6]});
    stage.text('문턱', gx0 + 8, Y(0.5) - 18, {size: 24, color: PAL.muted});
    stage.text('칸 전압', gx0 - 6, gy1 - 28, {size: 24, color: PAL.muted});
    for (const sk of sweeps) { const x = Xs(sk + (TRACK.weak.j + 0.5) / G.rows * RP); if (x > gx0 && x <= gx1 && sk <= t) { line(c, [[x, gy0], [x, gy0 + 10]], rgba(PAL.ink, 0.7), 2); } }
    const tr = (q, col, w, glowIt) => { const pts = []; for (let i = 0; i <= 160; i++) { const tt = t - win + win * i / 160; if (tt < ctx.scene.start + 0.2) continue; pts.push([Xs(tt), Y(levAt(q, tt))]); } if (pts.length < 2) return; if (glowIt) lit(stage, cc => line(cc, pts, col, w), {gain: 0.45}); else line(c, pts, col, w); };
    tr(typC, rgba(PAL.muted, 0.95), 3, false);
    tr(weakC, rgba(PAL.warm, 0.95), 4, true);
    unlitRect(stage, gx0 + 2, Y(0.5) - 34, 64, 32);                 // the threshold label sits on the scope's light
    stage.text('빨리 새는 칸', gx1, gy1 - 26, {size: 24, weight: 500, color: PAL.warm, align: 'right'});
    stage.text('보통 칸', gx1 - 190, gy1 - 26, {size: 24, weight: 500, color: PAL.muted, align: 'right'});
    // one pass = 64 ms: the passes counted, then the big number
    const done = sweeps.filter(x => x + RP <= Math.min(t, off)).length;
    const bn = fadeIn(t, ctx.tl.at('s19', 2.6), 0.5) * fadeOut(t, s20.start + 0.2, 0.4);
    if (bn > 0) withAlpha(c, bn, () => { rect(c, 120, 350, 400, 140, 14, rgba(PAL.plate, 0.95), rgba(PAL.border, 1), 2); unlitRect(stage, 120, 350, 400, 140, bn); stage.text('1초에 15.6번', 320, 400, {role: 'display', weight: 700, size: 54, color: PAL.ink, align: 'center'}); stage.text('1000 ÷ 64 ms', 320, 458, {size: 26, color: PAL.muted, align: 'center'}); });
    stage.text(`한 바퀴 = 64 ms`, gx1 - 10, gy0 - 16, {size: 24, color: PAL.muted, align: 'right'});
    if (t > off) { let flip = 0; for (const q of G.cells) if (q.one && L[q.k] < 0.5) flip++; withAlpha(c, fadeIn(t, off + 0.3), () => { rect(c, 120, 350, 400, 110, 14, rgba(PAL.plate, 0.95), rgba(PAL.border, 1), 2); unlitRect(stage, 120, 350, 400, 110, fadeIn(t, off + 0.3)); stage.text(`1 → 0  ${flip}칸`, 320, 405, {role: 'display', weight: 700, size: 46, color: PAL.ink, align: 'center'}); }); }
  },

  // chain: RAM cell (open bowl) beside a flash cell (charge locked inside an insulating shell) → power off: the RAM cell
  //        leaks out, the flash cell keeps its charge → read/write time bars start together: RAM done at once, SSD long
  //        → (s23) CPU ↔ RAM busy and fast, RAM ↔ SSD slow and occasional
  storage(stage, t, p, ctx) {
    const c = stage.ctx, off = evT(ctx, 'off4'), rw = evT(ctx, 'rw1'), s23 = S(ctx, 's23'), on2 = evT(ctx, 'on2'), ld = evT(ctx, 'load1');
    const on = t < on2 ? 1 - smooth((t - off) / 0.12) : smooth((t - on2) / 0.12);
    led(stage, 470, 345, on);
    // RAM cell (left)
    const ramL = t < on2 ? 1 - smooth((t - off - 0.3) / 1.6) : smooth((t - ld - 2.0) / 0.6);
    stage.text('램 (디램)', 285, 440, {role: 'display', weight: 700, size: 38, color: PAL.ink, align: 'center'});
    drawCell(stage, t, 300, 720, 0.75, {open: 0, level: ramL, gate: 0, bitV: 0.5, leak: t > off ? 1 - smooth((t - off - 1.6) / 0.4) : 0.4, labels: false});
    // flash cell (right): control gate / insulator shell / floating gate with trapped charge / channel
    const fx = 610, fy = 560, fw = 400, fh = 340;
    stage.text('SSD (플래시)', fx + fw / 2, 440, {role: 'display', weight: 700, size: 38, color: PAL.ink, align: 'center'});
    rect(c, fx, fy + fh - 60, fw, 60, 6, PAL.door, rgba('#000', 0.35), 1.5);                      // channel / substrate
    rect(c, fx + 40, fy + 40, fw - 80, fh - 120, 14, '#7E959E', rgba('#000', 0.3), 1.5);          // insulator shell
    rect(c, fx + 70, fy + 110, fw - 140, 70, 8, PAL.well, PAL.rim, 1.5);                           // floating gate
    rect(c, fx + 90, fy, fw - 180, 40, 6, '#33505B', rgba('#000', 0.35), 1.5);                    // control gate
    lit(stage, cc => { for (let i = 0; i < 10; i++) circle(cc, fx + 98 + i * 22.6, fy + 145 + (i % 2 ? 9 : -9), 7, rgba(PAL.warm, 0.92)); }, {gain: 0.55});
    const la = fadeIn(t, ctx.tl.at('s22', 1.6));
    if (la > 0) withAlpha(c, la, () => {
      line(c, [[fx + fw - 44, fy + 70], [fx + fw + 6, fy + 20]], rgba(PAL.ink, 0.85), 2); circle(c, fx + fw - 44, fy + 70, 5, PAL.ink);
      stage.text('절연막', fx + fw + 4, fy - 6, {size: 28, weight: 700, color: PAL.ink, align: 'right'});
      stage.text('갇힌 전하', fx + fw / 2, fy + fh + 40, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
    });
    if (t > off + 0.6) withAlpha(c, fadeIn(t, off + 0.6) * fadeOut(t, on2, 0.3), () => { stage.text('비어 감', 330, 985, {size: 28, weight: 500, color: PAL.ink, align: 'center'}); stage.text('그대로', fx + fw / 2, 985, {size: 28, weight: 500, color: PAL.ink, align: 'center'}); });
    // read/write time bars (illustrative scale) — start together at rw1
    const ba = fadeIn(t, rw - 0.4) * fadeOut(t, s23.start - 0.2, 0.4);
    if (ba > 0) withAlpha(c, ba, () => {
      stage.text('읽고 쓰는 데 걸리는 시간 (설명용 눈금)', 540, 1050, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
      hbar(stage, 300, 1110, 680, clamp((t - rw) / 0.12) * 0.03, {label: '램', col: PAL.ink});
      hbar(stage, 300, 1175, 680, clamp((t - rw) / 1.6), {label: 'SSD', col: PAL.ink});
    });
    // s23: who keeps what
    const fa = fadeIn(t, s23.start - 0.1);
    if (fa > 0) withAlpha(c, fa, () => {
      const box = (x, s, sub) => { rect(c, x - 110, 1060, 220, 90, 12, PAL.door, rgba('#000', 0.35), 1.5); stage.text(s, x, 1105, {role: 'display', weight: 700, size: 34, color: PAL.ink, align: 'center'}); if (sub) stage.text(sub, x, 1185, {size: 26, weight: 500, color: PAL.muted, align: 'center'}); };
      box(190, 'CPU', ''); box(540, '램', '지금 쓰는 것'); box(890, 'SSD', '오래 둘 것');
      lit(stage, cc => {
        for (let i = 0; i < 6; i++) { const q = (t * 1.6 + i / 6) % 1, dir = i % 2; circle(cc, lerp(dir ? 300 : 430, dir ? 430 : 300, q), 1092 + (dir ? 16 : -6), 6, rgba(PAL.warm, 0.9)); }
        const lq = clamp((t - evT(ctx, 'load1')) / 2.2); if (lq > 0 && lq < 1) circle(cc, lerp(780, 650, lq), 1105, 7, rgba(PAL.warm, 0.9));
      }, {gain: 0.5});
    });
  },

  // chain: back to the first array (same picture), power on, the refresh cursor keeps sweeping → the picture stays
  //        → conclusion text, end line
  close(stage, t, p, ctx) {
    const c = stage.ctx, G = G_HOOK, s24 = S(ctx, 's24'), sweeps = evAll(ctx, 'csweep');
    const sw = sweepState(t, sweeps, HP, G.rows);
    drawArray(stage, G, q => (q.one ? 1 - 0.12 * clamp((t - sw.last(q.j)) / HP) : 0), {cursor: sw.pos});
    led(stage, 52, 172, 1);
    const dim = 0.68 * smooth((t - s24.start + 0.6) / 0.8);
    c.fillStyle = rgba(PAL.deep, dim); c.fillRect(0, 160, W, 1100);
    const ea = smooth((t - s24.start + 0.4) / 0.6);
    unlitRect(stage, 30, 585, W - 60, 325, ea);
    if (ea > 0) withAlpha(c, ea, () => {
      const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
      stage.text('새어 나가는 전하를,', 540, 640, {role: 'display', weight: 700, size: 62, color: PAL.ink, align: 'center', ...so});
      stage.text('사라지기 전에 다시 채운다', 540, 735, {role: 'display', weight: 700, size: 62, color: PAL.ink, align: 'center', maxWidth: 960, ...so});
      line(c, [[480, 805], [600, 805]], PAL.warm, 4, {cap: 'butt'});
      if (t >= s24.start) stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 875, {size: 34, weight: 500, color: '#C9D5D8', align: 'center', alpha: smooth((t - s24.start) / 0.5)});
    });
  },
};
