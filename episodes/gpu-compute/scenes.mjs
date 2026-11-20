// 48 GPU — GPU는 어떻게 계산할까
// Look grammar (2026-11-10): every moving thing is a link of the causal chain; one clock for world, gauges and sound;
// change one condition and keep an afterimage; only energy/signal glows — data and its results (light falling on the ball,
// a calculator that is computing, finished values) are the one warm colour, the instruction (control signal) the one cool
// colour; matte filled bodies (the ball, the pixels, CPU cores, the GPU die and its calculators, the number tables).
// Stage: one "screen + chip" — a screen of big pixels showing a matte ball lit by a moving light, and under it one group of
// 32 calculators (a warp) fed by one instruction unit. Zooms (4×4 pixels, CPU vs GPU, the warp, the number tables) are parts
// of that stage, joined by lenses / leader lines.
// HDR (2026-11-15): the light source and its rays, the instruction pulses, the firing calculators and the AI chips' activity
// are drawn inside lit(). Captions, gauges, labels, the pixels (the ball's shading) and the bodies never are. Wherever text
// sits over lit content the gain map below it is blanked (unlitRect — the 47 lesson).
// First moment (2026-11-16): 0–2.0 s at real speed (60 frames/s, frame counter 1→120) the light swings from the ball's upper
// left to its right and every pixel is recomputed each frame — the lit side and the shadow swap, the cast shadow sweeps
// across the floor. 2.2–3.0 s it is rewound to frame 1; then the explanation starts.
// Model notes / simplifications (also in brief.md):
//  - Ball shading = Lambert (brightness = cos of the angle between the light and the surface normal) plus a little ambient.
//    A real game pixel goes through hundreds of instructions (textures, many lights, shadows).
//  - "one pixel = one thread = one calculator": real GPUs run far more threads than calculators, warps take turns.
//  - CPU drawn with 4 cores (a 2022 desktop CPU has 16, and CPU cores have SIMD units too — not said in the script).
//  - Beat lengths: CPU tick 0.2 s vs GPU beat 0.45 s keeps the 5.7 : 2.52 GHz ratio (2.26). Absolute time is "very slow".
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, rand, line, circle, ring, rect, withAlpha, arrow, lit, ensureGain, progressBar, TAU, glow,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const events = [];
export const captionLayout = {};

const W = 1080, H = 1920;
const PAL = {
  bg: '#001621', deep: '#000E16', ink: '#EFE3D4', muted: '#8AA0A6', border: '#1C3A45', plate: '#06222E',
  warm: '#FF8C3A', warmHi: '#FFC48A',      // data, light, results, a computing calculator (the one warm colour)
  cool: '#5BB8E8',                          // instruction / control signal (the one cool colour)
  lo: '#0B222B', hi: '#F4E8D2',             // pixel shade: shadow … lit (matte paint, not a light)
  backdrop: '#0A1E27', floor: '#123039',
  die: '#0B232C', block: '#2C4652', blockHi: '#3E5D6B', blockLo: '#1D323B', lane: '#3A5663', laneLo: '#22363F',
  cpu: '#4A6470', cpuHi: '#6A8794', cpuLo: '#33474F',
};
const fmt = (x, d = 0) => (+x.toFixed(d)).toLocaleString('en-US');
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const ev = (ctx, id) => ctx.events.get(id);
const evT = (ctx, id) => ctx.events.get(id).time;
const S = (ctx, id) => ctx.tl.sentence(id);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
// repeated event (sound.json "repeat"/"interval") → list of tick times
function ticks(ctx, id) {
  const e = ev(ctx, id), n = e.params?.repeat ?? e.repeat ?? 1, dt = e.params?.interval ?? e.interval ?? 0;
  return Array.from({length: n}, (_, k) => e.time + k * dt);
}
const countUntil = (list, t) => { let n = 0; for (const x of list) if (x <= t) n++; return n; };

// Text laid over glowing (lit) things: blank the gain map under it (47's lesson). Only the gain map changes.
function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save();
  gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.globalCompositeOperation = 'source-over';
  gc.fillStyle = '#000'; gc.fillRect(x, y, w, h);
  gc.restore();
  g.dirty = true;
}
function label(stage, s, x, y, o = {}) {
  const w = stage.text(s, x, y, {size: 26, weight: 500, color: PAL.muted, ...o});
  return w;
}

// =====================================================================================================
// The screen: big pixels showing a matte ball on a floor, lit by one moving light. Every pixel = the same formula.
// =====================================================================================================
const SCR = {x: 40, y: 180, w: 1000, h: 920, cell: 20};      // 50 × 46 pixels
SCR.cols = SCR.w / SCR.cell; SCR.rows = SCR.h / SCR.cell;
const BALL = {cx: 540, cy: 610, r: 440}, FLOOR_Y = 1000;
function lightDir(th, el = 0.28) { const ce = Math.cos(el); return [Math.sin(th) * ce, -Math.sin(el), Math.cos(th) * ce]; }
// brightness of a screen point (x, y) for light angle th: 0..1. Returns also whether it is the ball.
function shadeAt(x, y, th, B = BALL) {
  const L = lightDir(th), dx = (x - B.cx) / B.r, dy = (y - B.cy) / B.r, d2 = dx * dx + dy * dy;
  if (d2 <= 1) {
    const nz = Math.sqrt(1 - d2), d = dx * L[0] + dy * L[1] + nz * L[2];
    return {b: 0.04 + 0.96 * Math.max(0, d), ball: true, n: [dx, dy, nz]};
  }
  if (y >= B.cy + B.r * 0.55 + (FLOOR_Y - B.cy - B.r * 0.55)) {
    // floor: lit by the light's horizontal side, darkened by the ball's cast shadow (offset away from the light)
    const fy = (y - FLOOR_Y) / 200, lx = B.cx + Math.sin(th) * 700;
    const pool = 0.12 + 0.42 * Math.exp(-(((x - lx) / 520) ** 2)) * Math.max(0.15, Math.cos(th) * 0.5 + 0.6);
    const sx = B.cx - Math.sin(th) * B.r * 1.15, sy = FLOOR_Y + 70 + fy * 10;
    const sh = Math.exp(-(((x - sx) / (B.r * 0.95)) ** 2) - (((y - sy) / 70) ** 2));
    return {b: Math.max(0.03, pool * (1 - 0.85 * sh)), ball: false};
  }
  return {b: 0.07, ball: false, back: true};
}
function pixColor(s) { return s.ball ? mix(PAL.lo, PAL.hi, Math.pow(clamp(s.b), 0.7)) : s.back ? PAL.backdrop : mix('#0A1D25', '#7C6A55', clamp(s.b)); }
function lightPos(th, B = BALL) { return [B.cx + Math.sin(th) * B.r * 1.32, B.cy - B.r * 0.95 + (1 - Math.cos(th)) * 18]; }
function drawLight(stage, th, a = 1, B = BALL) {
  const [x, y] = lightPos(th, B), behind = Math.cos(th) < -0.15 && Math.abs(x - B.cx) < B.r * 0.95;
  if (behind || a <= 0) return;
  lit(stage, c => { glow(c, x, y, 70, PAL.warmHi, 0.35 * a); circle(c, x, y, 16, rgba('#FFE9C8', a)); circle(c, x, y, 26, rgba(PAL.warm, 0.35 * a)); }, {gain: 0.8});
}
// draw the pixel screen. o: {box, cell, alpha, dimOutside(rect)}
function drawScreen(stage, th, o = {}) {
  const c = stage.ctx, S0 = o.box || SCR, cell = o.cell || SCR.cell, k = S0.w / SCR.w;
  const B = {cx: S0.x + (BALL.cx - SCR.x) * k, cy: S0.y + (BALL.cy - SCR.y) * k, r: BALL.r * k};
  rect(c, S0.x - 10, S0.y - 10, S0.w + 20, S0.h + 20, 10, '#03121A', rgba(PAL.border, 1), 2);
  const n = Math.round(S0.w / cell), m = Math.round(S0.h / cell), s = cell - Math.max(1, cell * 0.06);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const x = S0.x + (i + 0.5) * cell, y = S0.y + (j + 0.5) * cell;
    const sx = SCR.x + (x - S0.x) / k, sy = SCR.y + (y - S0.y) / k;
    c.fillStyle = pixColor(shadeAt(sx, sy, th)); c.fillRect(x - s / 2, y - s / 2, s, s);
  }
  drawLight(stage, th, o.light ?? 1, B);
  return B;
}

// =====================================================================================================
// One warp: an instruction unit (cool) feeding 32 calculators (two rows of 16). fire(i) → 0..1, wait(i) → 0..1 (dimmed)
// =====================================================================================================
function drawWarp(stage, x, y, w, h, o = {}) {
  const c = stage.ctx, {fire = () => 0, wait = () => 0, cmd = 0, rows = 2, labels = 0, n = 32} = o;
  const iu = Math.min(150, w * 0.16), gx = x + iu + 26, gw = w - iu - 26, per = n / rows, lw = gw / per, lh = h / rows;
  rect(c, x - 14, y - 14, w + 28, h + 28, 12, PAL.die, rgba(PAL.border, 1), 2);
  // instruction unit (matte) and its bus
  rect(c, x, y, iu, h, 10, PAL.block, rgba('#000', 0.35), 1.5); rect(c, x + 4, y + 4, iu * 0.18, h - 8, 4, rgba(PAL.blockHi, 0.6));
  for (let r = 0; r < rows; r++) rect(c, gx - 10, y + r * lh + 4, gw + 6, 6, 3, PAL.laneLo);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / per), q = i % per, lx = gx + q * lw + 3, ly = y + r * lh + 16, bw = lw - 6, bh = lh - 22;
    const wv = clamp(wait(i));
    rect(c, lx, ly, bw, bh, 5, mix(PAL.lane, PAL.laneLo, wv), rgba('#000', 0.35), 1);
    rect(c, lx + 2, ly + 2, bw * 0.22, bh - 4, 3, rgba(PAL.blockHi, 0.45 * (1 - wv)));
  }
  if (cmd > 0.01) lit(stage, cc => {
    rect(cc, x + 6, y + 6, iu - 12, h - 12, 8, rgba(PAL.cool, 0.28 * cmd));
    for (let r = 0; r < rows; r++) rect(cc, gx - 10, y + r * lh + 4, gw + 6, 6, 3, rgba(PAL.cool, 0.95 * cmd));
  }, {gain: 0.6});
  lit(stage, cc => {
    for (let i = 0; i < n; i++) {
      const f = clamp(fire(i)); if (f < 0.02) continue;
      const r = Math.floor(i / per), q = i % per, lx = gx + q * lw + 3, ly = y + r * lh + 16, bw = lw - 6, bh = lh - 22;
      rect(cc, lx + bw * 0.25, ly + bh * 0.3, bw * 0.5, bh * 0.4, 3, rgba(PAL.warm, 0.95 * f));
    }
  }, {gain: 0.5});
  if (labels > 0) withAlpha(c, labels, () => {
    unlitRect(stage, x + iu / 2 - 44, y + h / 2 - 24, 88, 48, labels);
    stage.text('명령', x + iu / 2, y + h / 2, {size: 28, weight: 700, color: PAL.ink, align: 'center'});
  });
  return {gx, gw, lw, lh, iu, per, cx: i => gx + (i % per + 0.5) * lw, cy: i => y + Math.floor(i / per) * lh + 16 + (lh - 22) / 2};
}

// a GPU die: grid of blocks (each = several warps' calculators). act(b) → 0..1 activity of block b
function drawDie(stage, x, y, w, h, o = {}) {
  const c = stage.ctx, {cols = 8, rows = 16, act = () => 0, gain = 0.45} = o, pw = w / cols, ph = h / rows;
  rect(c, x - 16, y - 16, w + 32, h + 32, 14, '#14262E', rgba(PAL.border, 1), 2);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const bx = x + i * pw + 3, by = y + j * ph + 3;
    rect(c, bx, by, pw - 6, ph - 6, 4, PAL.block);
    for (let k = 0; k < 4; k++) rect(c, bx + 4, by + 4 + k * (ph - 14) / 4, pw - 14, (ph - 14) / 4 - 2, 1, PAL.laneLo);
  }
  lit(stage, cc => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = clamp(act(j * cols + i)); if (a < 0.02) continue;
      const bx = x + i * pw + 3, by = y + j * ph + 3;
      for (let k = 0; k < 4; k++) rect(cc, bx + 4, by + 4 + k * (ph - 14) / 4, pw - 14, (ph - 14) / 4 - 2, 1, rgba(PAL.warm, 0.8 * a));
    }
  }, {gain});
}

// CPU die: n big cores (matte), each with control/cache area and one small calculator that lights when it works
function drawCPU(stage, x, y, w, h, o = {}) {
  const c = stage.ctx, {n = 4, busy = () => 0, labels = 0} = o, cw = (w - (n + 1) * 18) / n;
  rect(c, x, y, w, h, 14, '#14262E', rgba(PAL.border, 1), 2);
  const cores = [];
  for (let k = 0; k < n; k++) {
    const cx = x + 18 + k * (cw + 18), cy = y + 18, ch = h - 36;
    rect(c, cx, cy, cw, ch, 10, PAL.cpu, rgba('#000', 0.35), 1.5);
    rect(c, cx + 4, cy + 4, cw * 0.14, ch - 8, 4, rgba(PAL.cpuHi, 0.55));
    rect(c, cx + 12, cy + 12, cw - 24, ch * 0.42, 6, PAL.cpuLo);                 // control / prediction
    rect(c, cx + 12, cy + ch * 0.62, cw - 24, ch * 0.3, 6, PAL.cpuLo);            // cache
    rect(c, cx + cw / 2 - 26, cy + ch * 0.47, 52, ch * 0.12, 5, PAL.lane);        // the calculator
    cores.push({x: cx, y: cy, w: cw, h: ch});
  }
  lit(stage, cc => cores.forEach((r, k) => { const b = clamp(busy(k)); if (b > 0.02) rect(cc, r.x + r.w / 2 - 20, r.y + r.h * 0.49, 40, r.h * 0.08, 4, rgba(PAL.warm, 0.95 * b)); }), {gain: 0.5});
  if (labels > 0) withAlpha(c, labels, () => cores.forEach(r => {
    stage.text('제어 · 예측', r.x + r.w / 2, r.y + r.h * 0.23, {size: 22, color: PAL.muted, align: 'center'});
    stage.text('캐시', r.x + r.w / 2, r.y + r.h * 0.77, {size: 22, color: PAL.muted, align: 'center'});
  }));
  return cores;
}
// a strip of pixels to paint: done(i) → 0..1, colour from a fixed slice of the ball
function pixStrip(stage, x, y, n, cell, done, {rowsOf = n, th = -0.6} = {}) {
  const c = stage.ctx, rows = Math.ceil(n / rowsOf);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / rowsOf), q = i % rowsOf, px = x + q * cell, py = y + r * cell;
    const col = pixColor(shadeAt(BALL.cx - BALL.r * 0.9 + (q / rowsOf) * BALL.r * 1.8, BALL.cy - BALL.r * 0.2 + r * 30, th));
    rect(c, px + 1, py + 1, cell - 2, cell - 2, 2, '#081820', rgba(PAL.border, 1), 1);
    const d = clamp(done(i)); if (d > 0) withAlpha(c, d, () => rect(c, px + 2, py + 2, cell - 4, cell - 4, 2, col));
  }
  return rows * cell;
}
function panel(c, x, y, w, h) { rect(c, x, y, w, h, 14, rgba(PAL.plate, 0.94), rgba(PAL.border, 1), 2); }
function hbar(stage, x, y, w, v, {col = PAL.warm, ghost = null, h = 20} = {}) {
  const c = stage.ctx;
  rect(c, x, y - h / 2, w, h, h / 2, rgba(PAL.border, 0.95));
  if (v > 0.002) rect(c, x, y - h / 2, Math.max(h, w * clamp(v)), h, h / 2, col);
  if (ghost != null) { const gx = x + w * clamp(ghost); line(c, [[gx, y - h], [gx, y + h]], rgba(PAL.ink, 0.75), 3, {dash: [5, 5]}); }
}

// =====================================================================================================
// Poster (0 s frame = thumbnail): white question above, the topic word biggest
// =====================================================================================================
const POSTER = {q: ['1초에 점 5억 개 가까이 칠하는', 'GPU는 어떻게 계산할까?'], a: 'GPU', qy: 470, ay: 700, QS: 58, AS: 230};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 100, yBot = POSTER.ay + POSTER.AS * 0.6 + 60, a = 1 - smooth(q / 0.8);
  unlitRect(stage, 0, yTop, W, yBot - yTop, a);
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.2, 'rgba(0,10,16,0.36)'); g.addColorStop(0.82, 'rgba(0,10,16,0.36)'); g.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
    const sh = {shadow: 'rgba(0,0,0,0.95)', shadowBlur: 22}, dy = -q * 120;
    POSTER.q.forEach((s, i) => stage.text(s, 540, POSTER.qy + i * POSTER.QS * 1.25 + dy, {role: 'display', weight: 700, size: POSTER.QS, color: '#FFFFFF', align: 'center', maxWidth: 980, ...sh}));
    stage.text(POSTER.a, 540, POSTER.ay + 70 + dy, {role: 'display', weight: 700, size: POSTER.AS, color: PAL.warm, align: 'center', tracking: -0.02 * POSTER.AS, ...sh, shadowBlur: 30});
  });
}
const MORPH = ctx => [S(ctx, 's01').end + 0.15, S(ctx, 's01').end + 0.95];

// =====================================================================================================
// Header text per scene: [time from which it applies, kicker, title]
// =====================================================================================================
function titleList(id, ctx) {
  const a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, '실제 속도 · 1초에 60장', '매 장면, 모든 점을 새로'], [a('s02'), '4K 화면 · 3840 × 2160', '1초에 예순 번']];
    case 'origin': return [[-Infinity, '이름 · Graphics Processing Unit', '그래픽 처리 장치'], [a('s04'), '기원 · 1999년', 'GPU라는 이름이 널리'], [a('s05'), '본질로', '그림 계산의 남다른 성질']];
    case 'essence': return [[-Infinity, '확대 · 점 16개 (크기 과장)', '빛을 정면으로 받을수록 밝게'], [a('s07'), '같은 식, 다른 숫자', '달라지는 것은 데이터뿐'], [a('s08'), '순서를 바꿔도', '서로 기다리지 않는다'], [a('s09'), 'Single Instruction, Multiple Data', 'SIMD: 명령 하나, 데이터 여럿'], [a('s10'), '본질', '같은 명령 하나로, 한꺼번에']];
    case 'cores': return [[-Infinity, '나노초를 초로 · 아주 느리게', 'CPU: 큰 코어 몇 개'], [a('s12'), '나노초를 초로 · 아주 느리게', 'GPU: 명령 하나에 계산기 여럿'], [a('s13'), '엔비디아 · 워프', '계산 32개가 한 묶음'], [a('s14'), '2022 · RTX 4090', '계산기 1만 6천 개 넘게'], [a('s15'), '박자는 느려도', '모두 합하면']];
    case 'branch': return [[-Infinity, '약점 · 아주 느리게', '조건에 따라 갈리면'], [a('s17'), '약점', '앞의 답을 기다리는 일'], [a('s18'), '나눠 맡기', 'CPU와 GPU']];
    case 'ai': return [[-Infinity, '2006 · CUDA', '그림이 아닌 계산도'], [a('s20'), '신경망 계산', '행렬 곱셈'], [a('s21'), '같은 꼴', '칸마다 같은 곱셈과 덧셈'], [a('s22'), '2012 · 이미지 인식 대회', 'GPU 두 개로 학습한 신경망'], [a('s23'), '그 뒤로', '인공지능의 계산기']];
    case 'close': return [[-Infinity, '정리', '명령 하나, 데이터 여럿']];
  }
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx;
  unlitRect(stage, 0, 118, W, 146, Math.max(kicker ? aK : 0, title ? aT : 0));
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 900, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 940, ...so}));
}
function captionBand(c) { const g = c.createLinearGradient(0, 1240, 0, 1920); g.addColorStop(0, 'rgba(0,8,12,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.5)'); g.addColorStop(1, 'rgba(0,8,12,0.7)'); c.fillStyle = g; c.fillRect(0, 1240, W, 680); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, 'rgba(0,8,12,0.75)'); g.addColorStop(0.7, 'rgba(0,8,12,0.45)'); g.addColorStop(1, 'rgba(0,8,12,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 300); }

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

// =====================================================================================================
// Hook / close light motion: 0–2 s real-time sweep, 2.2–3.0 s rewind, then a slow swing (every frame still recomputed)
// =====================================================================================================
const TH0 = -1.6, TH1 = 1.6, REW = [2.2, 3.0];
function hookTheta(t) {
  if (t < 2.0) return lerp(TH0, TH1, smooth(t / 2.0) * 0.7 + 0.3 * clamp(t / 2.0));
  if (t < REW[0]) return TH1;
  if (t < REW[1]) return lerp(TH1, TH0, easeInOut((t - REW[0]) / (REW[1] - REW[0])));
  return TH0 + 0.75 * (1 - Math.cos((t - REW[1]) * 0.55));
}
function hookFrame(t) {
  if (t < 2.0) return 1 + Math.floor(t * 60);
  if (t < REW[0]) return 120;
  if (t < REW[1]) return Math.max(1, Math.round(120 * (1 - easeInOut((t - REW[0]) / (REW[1] - REW[0])))));
  return 1 + Math.floor((t - REW[1]) * 60);
}
// the warp under the screen: one instruction per frame sweeps the calculators (drawn at 10 Hz so it reads)
function screenWarp(stage, t, a = 1, y = 1134) {
  const ph = (t * 10) % 1;
  withAlpha(stage.ctx, a, () => drawWarp(stage, 60, y, 960, 86, {cmd: 1 - smooth(ph / 0.5), fire: i => 0.35 + 0.65 * (1 - smooth(Math.abs(ph - 0.18 - (i % 16) / 60) / 0.25))}));
}

export const scenes = {
  // chain: the light moves → every pixel's angle to the light changes → one instruction per frame through the calculators →
  //        the whole picture is recomputed (0–2 s result first, real speed) → rewind to frame 1 → slow swing; s02 counts pixels
  hook(stage, t, p, ctx) {
    const c = stage.ctx, th = hookTheta(t), M = MORPH(ctx), s02 = S(ctx, 's02');
    drawScreen(stage, th);
    // afterimage of frame 1's terminator during the sweep: where the shadow edge was
    if (t > 0.1 && t < REW[1]) withAlpha(c, 0.5 * fadeIn(t, 0.1, 0.3) * fadeOut(t, REW[0], 0.3), () => {
      const L = lightDir(TH0); const ang = Math.atan2(L[1], L[0]) + Math.PI / 2;
      c.save(); c.translate(BALL.cx, BALL.cy); c.rotate(ang); c.beginPath(); c.ellipse(0, 0, BALL.r * Math.abs(L[2]), BALL.r, 0, -Math.PI / 2, Math.PI / 2);
      c.setLineDash([8, 8]); c.strokeStyle = rgba(PAL.ink, 0.7); c.lineWidth = 2.5; c.stroke(); c.restore();
    });
    screenWarp(stage, t);
    // frame counter (not in the 0 s frame)
    const fa = fadeIn(t, 0.08, 0.2);
    if (fa > 0) withAlpha(c, fa, () => {
      panel(c, 60, 1010, 400, 64); unlitRect(stage, 60, 1010, 400, 64, fa);
      stage.text(`프레임 ${hookFrame(t)}`, 84, 1043, {role: 'display', weight: 700, size: 34, color: PAL.ink});
      stage.text(t < REW[1] && t > 2.0 ? '되감기' : '1초에 60장', 440, 1043, {size: 24, color: PAL.muted, align: 'right'});
    });
    // s02: count the pixels of a 4K screen
    const ca = fadeIn(t, s02.start - 0.1, 0.5) * fadeOut(t, ctx.scene.end - 0.3);
    if (ca > 0) withAlpha(c, ca, () => {
      const y = SCR.y - 4;
      line(c, [[SCR.x, y], [SCR.x + SCR.w, y]], rgba(PAL.ink, 0.8), 2); line(c, [[SCR.x + SCR.w + 6, SCR.y], [SCR.x + SCR.w + 6, SCR.y + SCR.h]], rgba(PAL.ink, 0.8), 2);
      const big = t > W0(ctx, 's02', '화면을') - 0.2 ? 1 : 0;
      panel(c, 600, 1010, 420, 64); unlitRect(stage, 600, 1010, 420, 64, 1);
      if (t < W0(ctx, 's02', '화면을')) stage.text('3840 × 2160 ≈ 830만 점', 810, 1043, {role: 'display', weight: 700, size: 32, color: PAL.ink, align: 'center'});
      else withAlpha(c, fadeIn(t, W0(ctx, 's02', '화면을'), 0.4), () => stage.text('830만 × 60 ≈ 5억 점/초', 810, 1043, {role: 'display', weight: 700, size: 32, color: PAL.warm, align: 'center'}));
      void big;
    });
  },

  // chain: the screen moves up and the chip appears below → the chip's computed pixels travel up the wires and paint the
  //        screen row by row → name tag GPU = Graphics Processing Unit → 1999 GeForce 256 → a lens marks 16 pixels (next)
  origin(stage, t, p, ctx) {
    const c = stage.ctx, s04 = S(ctx, 's04'), s05 = S(ctx, 's05');
    const q = easeInOut((t - ctx.scene.start) / 1.2), th = hookTheta(t);
    const box = {x: lerp(SCR.x, 190, q), y: lerp(SCR.y, 290, q), w: lerp(SCR.w, 700, q), h: lerp(SCR.h, 644, q)};
    drawScreen(stage, th, {box, cell: lerp(20, 14, q)});
    // chip below with wires up to the screen
    const cy0 = lerp(1134, 975, q);
    const chipA = fadeIn(t, ctx.scene.start + 0.4, 0.6);
    withAlpha(c, chipA, () => {
      const dx = 300, dy = cy0, dw = 480, dh = 160;
      for (let k = 0; k < 6; k++) { const x = dx + 40 + k * 80; line(c, [[x, dy - 16], [x, box.y + box.h + 12]], rgba(PAL.border, 1), 6); }
      drawDie(stage, dx, dy, dw, dh, {cols: 8, rows: 4, act: b => 0.35 + 0.65 * (1 - smooth(Math.abs(((t * 1.6) % 1) - (b % 8) / 8) / 0.2))});
      // computed values travelling up the wires (data, warm)
      lit(stage, cc => { for (let k = 0; k < 6; k++) for (let m = 0; m < 3; m++) { const u = (t * 1.6 + m / 3 + k * 0.13) % 1, x = dx + 40 + k * 80; circle(cc, x, lerp(dy - 16, box.y + box.h + 12, u), 5, rgba(PAL.warm, 0.9)); } }, {gain: 0.5});
      unlitRect(stage, dx - 16, dy + dh + 18, dw + 32, 56, 1);
      stage.text('GPU', dx + dw / 2, dy + dh + 44, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'center'});
    });
    // 1999 tag
    const ya = fadeIn(t, s04.start + 0.2, 0.5);
    if (ya > 0) withAlpha(c, ya, () => {
      panel(c, 60, 975, 210, 120); unlitRect(stage, 60, 975, 210, 120, ya);
      stage.text('1999', 165, 1015, {role: 'display', weight: 700, size: 44, color: PAL.warm, align: 'center'});
      stage.text('GeForce 256', 165, 1063, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    });
    // s05: a lens on 4×4 pixels of the screen (the next scene enlarges it)
    const la = fadeIn(t, s05.start + 0.3, 0.6);
    if (la > 0) withAlpha(c, la, () => {
      const k = box.w / SCR.w, lx = box.x + (ESS.sx - 30 - SCR.x) * k, ly = box.y + (ESS.sy - 30 - SCR.y) * k, sz = 240 * k;
      rect(c, lx, ly, sz, sz, 3, null, rgba(PAL.ink, 0.95), 3);
    });
  },

  // chain: 16 pixels enlarged; each has its own surface direction (data). s06: the light's ray hits one pixel → its brightness.
  //        s07: the same instruction (cool plate) for all; numbers (data) differ; done one by one (16 beats).
  //        s08: reset, done in a shuffled order → the same picture (nobody waits). s09: reset, one instruction to all 16 at once
  //        (1 beat; the 16-beat bar stays as afterimage). s10: the light moves → all 16 recomputed together again.
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s07 = S(ctx, 's07'), s08 = S(ctx, 's08'), s09 = S(ctx, 's09'), s10 = S(ctx, 's10');
    const one = evT(ctx, 'eone'), seq = ticks(ctx, 'eseq'), shuf = ticks(ctx, 'eshuf'), cmd = evT(ctx, 'ecmd'), cmd2 = evT(ctx, 'ecmd2');
    const thA = -0.6, thB = 0.35, th = t < cmd2 ? thA : lerp(thA, thB, smooth((t - cmd2) / 0.45));
    // which pass are we in, and is tile k done?
    const ORDER = [5, 12, 0, 9, 14, 3, 7, 10, 1, 15, 6, 2, 11, 8, 13, 4];
    const pass = t < seq[0] - 0.2 ? 0 : t < shuf[0] - 0.4 ? 1 : t < cmd - 0.4 ? 2 : 3;
    const doneAt = k => {
      if (pass === 0) return k === 5 ? one : Infinity;
      if (pass === 1) return seq[k];
      if (pass === 2) return shuf[ORDER.indexOf(k)];
      return cmd;
    };
    const tiles = ESS.tiles();
    // left: a thumbnail of the whole screen with the lens (same stage)
    const mini = {x: 60, y: 400, w: 230, h: 212};
    drawScreen(stage, th, {box: mini, cell: 4.6, light: 0.8});
    const kx = mini.w / SCR.w, lx = mini.x + (ESS.sx - SCR.x) * kx, ly = mini.y + (ESS.sy - SCR.y) * kx;
    rect(c, lx - 30 * kx, ly - 30 * kx, 240 * kx, 240 * kx, 2, null, rgba(PAL.ink, 0.9), 2);
    line(c, [[lx + 12, ly + 12], [ESS.x0, ESS.y0]], rgba(PAL.ink, 0.35), 2, {dash: [6, 6]});
    // light source (top right of the tiles) and its direction
    const LP = [ESS.x0 + ESS.T * 2 + 430 * Math.sin(th), 345];
    lit(stage, cc => { glow(cc, LP[0], LP[1], 60, PAL.warmHi, 0.35); circle(cc, LP[0], LP[1], 14, '#FFE9C8'); }, {gain: 0.8});
    // instruction plate (cool) — the same formula for every pixel
    const pa = fadeIn(t, s07.start + 0.2, 0.5);
    const pulse = k => Math.max(0, 1 - Math.abs(t - doneAt(k)) / 0.35);
    const broad = Math.max(t >= cmd ? Math.max(0, 1 - (t - cmd) / 0.6) : 0, t >= cmd2 ? Math.max(0, 1 - (t - cmd2) / 0.6) : 0);
    for (const T of tiles) {
      const d = t >= doneAt(T.k) ? smooth((t - doneAt(T.k)) / 0.25) : 0;
      const s = shadeAt(T.sx, T.sy, th), col = pixColor(s);
      rect(c, T.x, T.y, ESS.T - 10, ESS.T - 10, 10, '#081820', rgba(PAL.border, 1), 2);
      if (d > 0) withAlpha(c, d, () => rect(c, T.x + 4, T.y + 4, ESS.T - 18, ESS.T - 18, 8, col));
      // the pixel's own surface direction (data): a short arrow from its centre
      const cx = T.x + (ESS.T - 10) / 2, cy = T.y + (ESS.T - 10) / 2, n = s.n || [0, 0, 1], dark = d > 0 && s.b > 0.5;
      arrow(c, [cx, cy], [cx + n[0] * 105, cy + n[1] * 105], dark ? '#3A2A1A' : rgba(PAL.warmHi, 0.85), 4, {head: 12});
      circle(c, cx, cy, 5, dark ? '#3A2A1A' : rgba(PAL.warmHi, 0.85));
      // the numbers fed in (data): the angle to the light, shown from s07
      if (pa > 0) withAlpha(c, pa, () => {
        const L = lightDir(th), cosA = clamp(n[0] * L[0] + n[1] * L[1] + n[2] * L[2], -1, 1);
        stage.text(`${Math.round(Math.acos(cosA) * 180 / Math.PI)}°`, T.x + ESS.T - 22, T.y + ESS.T - 34, {size: 24, weight: 700, color: dark ? '#3A2A1A' : PAL.ink, align: 'right'});
      });
    }
    // the ray to the first pixel (s06) and the instruction pulses
    if (t > one - 0.6 && t < s07.start) lit(stage, cc => {
      const T = tiles[5], cx = T.x + 70, cy = T.y + 70, u = smooth((t - (one - 0.6)) / 0.6);
      line(cc, [LP, [lerp(LP[0], cx, u), lerp(LP[1], cy, u)]], rgba(PAL.warmHi, 0.9), 3);
    }, {gain: 0.6});
    if (pa > 0) withAlpha(c, pa, () => {
      const px = ESS.x0, py = 1080, pw = ESS.T * 4 - 10;
      rect(c, px, py, pw, 64, 12, PAL.block, rgba('#000', 0.35), 1.5);
      lit(stage, cc => {
        let a = broad; for (const T of tiles) a = Math.max(a, pass === 1 || pass === 2 ? pulse(T.k) : 0);
        if (a > 0.01) rect(cc, px + 4, py + 4, pw - 8, 56, 10, rgba(PAL.cool, 0.45 * a));
        for (const T of tiles) {
          const b = pass === 3 ? broad : pulse(T.k); if (b < 0.02) continue;
          const tx = T.x + (ESS.T - 10) / 2;
          line(cc, [[tx, py], [tx, T.y + ESS.T - 10]], rgba(PAL.cool, 0.85 * b), 4);
        }
      }, {gain: 0.6});
      unlitRect(stage, px, py, pw, 64, pa);
      stage.text('명령: 밝기 계산 (모든 점에 같은 식)', px + pw / 2, py + 33, {size: 28, weight: 700, color: PAL.ink, align: 'center'});
    });
    // beats gauge (s07 → s10): how many beats this pass took; afterimage of the 16-beat pass
    const ga = fadeIn(t, s07.start + 0.6, 0.5);
    if (ga > 0) withAlpha(c, ga, () => {
      const x0 = 330, y0 = 1192;
      const nBeats = pass === 1 ? countUntil(seq, t) : pass === 2 ? countUntil(shuf, t) : pass === 3 ? (t >= cmd ? 1 : 0) + (t >= cmd2 ? 1 : 0) : 0;
      stage.text('걸린 박자', x0 - 20, y0, {size: 26, weight: 500, color: PAL.muted, align: 'right'});
      hbar(stage, x0, y0, 560, nBeats / 16, {col: pass === 3 ? PAL.cool : PAL.warm, ghost: pass === 3 ? 1 : null});
      unlitRect(stage, x0 + 580, y0 - 24, 120, 48, 1);
      stage.text(`${nBeats}`, x0 + 640, y0, {role: 'display', weight: 700, size: 34, color: PAL.ink, align: 'center'});
      if (pass === 3) stage.text('차례로 16', x0 + 560, y0 - 30, {size: 22, color: PAL.muted, align: 'right'});
    });
    void s08; void s09; void s10;
  },

  // chain: CPU — 4 big cores each paint one pixel per tick (fast clock) → 64 pixels in 16 ticks | GPU — the instruction unit
  //        sends one instruction → 32 calculators fire together → 32 pixels per beat (slower clock) → 64 in 2 beats.
  //        s14: the warp shrinks into one block of the die; 128 blocks → 16,384 calculators. s15: clocks and the total.
  cores(stage, t, p, ctx) {
    const c = stage.ctx, s12 = S(ctx, 's12'), s14 = S(ctx, 's14'), s15 = S(ctx, 's15');
    const cpu1 = ticks(ctx, 'ccpu'), cpu2 = ticks(ctx, 'ccpu2'), gT = ticks(ctx, 'cgpu');
    const zq = easeInOut((t - (s14.start - 0.3)) / 1.0);
    const race = t >= cpu2[0] - 0.35, cpuT = race ? cpu2 : cpu1;
    const nC = countUntil(cpuT, t), lastC = cpuT[nC - 1] ?? -9;
    // ---- CPU (top) — 4 big cores, each paints its own 16 pixels one per tick (fast clock); fades out when zooming
    const ca = fadeIn(t, ctx.scene.start, 0.4) * (1 - smooth((t - s14.start + 0.4) / 0.6));
    if (ca > 0) withAlpha(c, ca, () => {
      stage.text('CPU', 70, 318, {role: 'display', weight: 700, size: 40, color: PAL.ink});
      stage.text('코어 4개로 그림 (2022년 데스크톱 CPU는 16개)', 172, 321, {size: 22, color: PAL.muted});
      const cores = drawCPU(stage, 60, 350, 960, 210, {busy: () => (nC > 0 && nC < 16 + 1 && t - lastC < 0.16 ? 1 : 0), labels: fadeIn(t, ctx.scene.start + 0.5)});
      cores.forEach(r => {
        const bx = r.x + (r.w - 144) / 2;
        for (let i = 0; i < 16; i++) {
          const x = bx + (i % 4) * 36, y = 584 + Math.floor(i / 4) * 36;
          rect(c, x + 1, y + 1, 34, 34, 3, '#081820', rgba(PAL.border, 1), 1);
          if (i < nC) rect(c, x + 3, y + 3, 30, 30, 2, pixColor(shadeAt(BALL.cx - 330 + (r.x - 60) * 0.62 + (i % 4) * 40, BALL.cy - 200 + Math.floor(i / 4) * 90, -0.6)));
        }
      });
      stage.text(`${Math.min(64, nC * 4)} / 64점`, 1020, 318, {role: 'display', weight: 700, size: 32, color: PAL.ink, align: 'right'});
    });
    // ---- GPU warp (bottom): one instruction → 32 calculators fire together → 32 pixels per beat (slower clock)
    const ga = fadeIn(t, s12.start - 0.2, 0.5);
    if (ga > 0) withAlpha(c, ga * (1 - zq), () => {
      const nG = countUntil(gT, t), lastG = gT[nG - 1] ?? -9, f = Math.max(0, 1 - (t - lastG) / 0.4);
      stage.text('GPU', 70, 790, {role: 'display', weight: 700, size: 40, color: PAL.ink});
      stage.text('명령 부분 하나 + 계산기 32개', 172, 793, {size: 22, color: PAL.muted});
      drawWarp(stage, 60, 836, 960, 150, {cmd: nG ? f : 0, fire: () => (nG ? f : 0), labels: 1});
      for (let i = 0; i < 64; i++) {
        const x = 92 + (i % 32) * 28, y = 1012 + Math.floor(i / 32) * 28;
        rect(c, x + 1, y + 1, 26, 26, 3, '#081820', rgba(PAL.border, 1), 1);
        if (i < nG * 32) rect(c, x + 3, y + 3, 22, 22, 2, pixColor(shadeAt(BALL.cx - 360 + (i % 32) * 23, BALL.cy - 120 + Math.floor(i / 32) * 160, -0.6)));
      }
      stage.text(`${Math.min(64, nG * 32)} / 64점`, 1020, 790, {role: 'display', weight: 700, size: 32, color: PAL.ink, align: 'right'});
      const wa = fadeIn(t, S(ctx, 's13').start + 0.4, 0.5);
      if (wa > 0) withAlpha(c, wa, () => { rect(c, 232, 818, 800, 186, 14, null, rgba(PAL.cool, 0.8), 2); unlitRect(stage, 760, 1080, 260, 44, wa); stage.text('워프 · 32', 1020, 1102, {size: 26, weight: 700, color: PAL.cool, align: 'right'}); });
      // the race (s13): same moment, CPU and GPU started together
      if (race) withAlpha(c, fadeIn(t, cpu2[0] - 0.3, 0.3), () => stage.text('같은 때 시작', 540, 790, {size: 24, weight: 500, color: PAL.muted, align: 'center'}));
    });
    // ---- zoom out to the whole die (s14)
    if (zq > 0) withAlpha(c, zq, () => {
      const x = 110, y = 330, w = 860, h = 700, pulseT = t - s14.start;
      drawDie(stage, x, y, w, h, {cols: 8, rows: 16, act: b => 0.25 + 0.75 * (1 - smooth(Math.abs(((pulseT * 0.8) % 1.2) - (Math.floor(b / 8) + (b % 8)) / 24) / 0.12))});
      // where the warp went: one block outlined
      rect(c, x - 2, y - 2, w / 8 + 4, h / 16 + 4, 4, null, rgba(PAL.cool, 0.9), 3);
      withAlpha(c, 1 - fadeIn(t, W0(ctx, 's15', '모두'), 0.3), () => {
      panel(c, 250, 1060, 580, 150); unlitRect(stage, 250, 1060, 580, 150, 1);
      stage.text('16,384', 540, 1115, {role: 'display', weight: 700, size: 76, color: PAL.warm, align: 'center'});
      stage.text('계산기 · 128묶음 × 128 · RTX 4090 (2022)', 540, 1180, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      });
    });
    // ---- s15: clocks and the total (over the die)
    const ka = fadeIn(t, s15.start - 0.1, 0.5);
    if (ka > 0) withAlpha(c, ka, () => {
      const x0 = 110, y0 = 360;
      panel(c, 70, 330, 940, 250); unlitRect(stage, 70, 330, 940, 250, ka);
      stage.text('박자 (최대)', x0, y0 + 20, {size: 26, weight: 500, color: PAL.muted});
      stage.text('CPU', x0, y0 + 80, {role: 'display', weight: 700, size: 30, color: PAL.ink}); hbar(stage, x0 + 100, y0 + 80, 600, 5.7 / 6, {col: PAL.muted});
      stage.text('5.7 GHz', x0 + 860, y0 + 80, {size: 28, weight: 700, color: PAL.ink, align: 'right'});
      stage.text('GPU', x0, y0 + 150, {role: 'display', weight: 700, size: 30, color: PAL.ink}); hbar(stage, x0 + 100, y0 + 150, 600, 2.52 / 6, {col: PAL.muted});
      stage.text('2.52 GHz', x0 + 860, y0 + 150, {size: 28, weight: 700, color: PAL.ink, align: 'right'});
      stage.text('같은 2022년 제품 · 한 예', x0 + 860, y0 + 20, {size: 22, color: PAL.muted, align: 'right'});
      const ta = fadeIn(t, W0(ctx, 's15', '모두'), 0.5);
      if (ta > 0) withAlpha(c, ta, () => {
        panel(c, 250, 1060, 580, 150); unlitRect(stage, 250, 1060, 580, 150, ta);
        stage.text('1초에 82.6조 번', 540, 1115, {role: 'display', weight: 700, size: 64, color: PAL.warm, align: 'center'});
        stage.text('곱셈·덧셈 (FP32 최대) · RTX 4090', 540, 1180, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      });
    });
  },

  // chain: s16 a condition splits the warp: instruction A → only the bright-pixel calculators fire, the others wait (dim) →
  //        instruction B → the other half → 2 beats instead of 1 (afterimage). s17: each answer feeds the next → one calculator
  //        at a time (1/32). s18: branching / ordered work goes to the CPU, the same repeated work to the GPU.
  branch(stage, t, p, ctx) {
    const c = stage.ctx, s17 = S(ctx, 's17'), s18 = S(ctx, 's18');
    const A = evT(ctx, 'bra'), B = evT(ctx, 'brb'), chain = ticks(ctx, 'bchain');
    const half = i => rand(i * 3 + 1) < 0.5;                     // which calculators' pixels are on the bright side
    const fade1 = fadeOut(t, s18.start - 0.5, 0.5);
    if (fade1 > 0) withAlpha(c, fade1, () => {
      // each calculator's pixel above it (its data): bright or dark
      const wy = 760;
      let geo = null;
      const inChain = t > s17.start - 0.3;
      const fire = i => {
        if (!inChain) { const fa = t >= A ? Math.max(0, 1 - (t - A) / 1.0) : 0, fb = t >= B ? Math.max(0, 1 - (t - B) / 1.0) : 0; return half(i) ? fa : fb; }
        const m = countUntil(chain, t) - 1; return i === m ? 1 : 0;
      };
      const wait = i => {
        if (!inChain) { if (t >= A && t < B + 1.0) return half(i) ? (t >= B ? 1 : 0) : (t < B ? 1 : 0); return 0; }
        const m = countUntil(chain, t) - 1; return m >= 0 && i !== m ? 0.85 : 0;
      };
      const cmd = !inChain ? Math.max(t >= A ? Math.max(0, 1 - (t - A) / 0.6) : 0, t >= B ? Math.max(0, 1 - (t - B) / 0.6) : 0) : (chain.some(x => t >= x && t < x + 0.25) ? 1 : 0);
      geo = drawWarp(stage, 60, wy, 960, 220, {fire, wait, cmd, labels: 1});
      for (let i = 0; i < 32; i++) {
        const x = geo.cx(i), y = (Math.floor(i / 16) === 0 ? wy - 60 : wy + 220 + 46);
        const bright = half(i);
        rect(c, x - 18, y - 18, 36, 36, 4, bright ? PAL.hi : PAL.lo, rgba(PAL.border, 1), 1.5);
      }
      // condition plate (cool outline) — s16
      const ca = fadeIn(t, ctx.scene.start + 0.2, 0.4) * fadeOut(t, s17.start - 0.4, 0.4);
      if (ca > 0) withAlpha(c, ca, () => {
        panel(c, 160, 340, 760, 230); unlitRect(stage, 160, 340, 760, 230, ca);
        stage.text('조건: 밝은 점이면 A, 아니면 B', 540, 390, {role: 'display', weight: 700, size: 34, color: PAL.ink, align: 'center'});
        const wA = t >= A && t < B ? 1 : 0.4, wB = t >= B ? 1 : 0.4;
        stage.text('A 계산', 360, 460, {size: 30, weight: 700, color: rgba(PAL.cool, wA), align: 'center'});
        stage.text('B 계산', 720, 460, {size: 30, weight: 700, color: rgba(PAL.cool, wB), align: 'center'});
        stage.text(t >= A && t < B ? '16개 계산 · 16개 멈춤' : t >= B ? '나머지 16개 계산' : '', 540, 525, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
        // beats: 2 (afterimage 1 = no split)
        const nb = (t >= A ? 1 : 0) + (t >= B ? 1 : 0);
        stage.text('걸린 박자', 210, 1180 - 40, {size: 24, color: PAL.muted});
      });
      const ba = fadeIn(t, A - 0.2, 0.4) * fadeOut(t, s17.start - 0.4, 0.4);
      if (ba > 0) withAlpha(c, ba, () => {
        const nb = (t >= A ? 1 : 0) + (t >= B ? 1 : 0);
        hbar(stage, 340, 1150, 440, nb / 2, {col: PAL.warm, ghost: 0.5});
        unlitRect(stage, 800, 1126, 200, 48, 1);
        stage.text(`${nb}박자`, 900, 1150, {role: 'display', weight: 700, size: 32, color: PAL.ink, align: 'center'});
        stage.text('갈리지 않으면 1', 780, 1188, {size: 22, color: PAL.muted, align: 'right'});
      });
      // s17: the dependency chain — arrows from each answer to the next calculator
      const da = fadeIn(t, s17.start - 0.2, 0.4);
      if (da > 0) withAlpha(c, da, () => {
        const m = countUntil(chain, t) - 1;
        for (let i = 0; i < 15; i++) { const y = wy + 12; arrow(c, [geo.cx(i) + 12, y], [geo.cx(i + 1) - 12, y], rgba(PAL.ink, i < m ? 0.9 : 0.35), 2.5, {head: 9}); }
        panel(c, 160, 360, 760, 170); unlitRect(stage, 160, 360, 760, 170, da);
        stage.text('앞의 답 → 다음 계산 → …', 540, 410, {role: 'display', weight: 700, size: 34, color: PAL.ink, align: 'center'});
        stage.text(`일하는 계산기 ${m >= 0 ? 1 : 0} / 32`, 540, 480, {size: 30, weight: 700, color: PAL.warm, align: 'center'});
      });
    });
    // s18: sorting work
    const sa = fadeIn(t, s18.start - 0.3, 0.5);
    if (sa > 0) withAlpha(c, sa, () => {
      const tc = W0(ctx, 's18', '씨피유가'), tg = W0(ctx, 's18', '지피유가');
      drawCPU(stage, 70, 420, 440, 230, {n: 2, busy: () => (t > tc ? 0.6 + 0.4 * Math.sin(t * 9) : 0)});
      drawDie(stage, 600, 436, 400, 200, {cols: 8, rows: 6, act: b => (t > tg ? 0.4 + 0.6 * (1 - smooth(Math.abs(((t * 1.5) % 1) - (b % 8) / 8) / 0.2)) : 0)});
      stage.text('CPU', 290, 390, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'center'});
      stage.text('GPU', 800, 390, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'center'});
      // the work items slide into their boxes
      const tok = (s, x0, y0, x1, y1, t0) => { const u = easeInOut((t - t0) / 0.7); const x = lerp(x0, x1, u), y = lerp(y0, y1, u); panel(c, x - 200, y - 32, 400, 64); stage.text(s, x, y, {size: 28, weight: 700, color: PAL.ink, align: 'center'}); };
      tok('조건에 따라 갈림', 540, 840, 290, 760, W0(ctx, 's18', '조건에'));
      tok('순서가 중요', 540, 920, 290, 850, W0(ctx, 's18', '순서가'));
      tok('같은 계산 되풀이', 540, 1000, 800, 760, W0(ctx, 's18', '같은'));
    });
  },

  // chain: s19 the die with "CUDA 2006": the screen's place is taken by any calculation. s20 two number tables A × B = C.
  //        s21 one cell of C = a row of A times a column of B, added → the same for every cell → one instruction fills all 16
  //        cells at once (the warp below), the ball screen kept small as afterimage of "the same shape". s22 2012: two GPUs,
  //        error-rate bars. s23 many chips, all computing tables.
  ai(stage, t, p, ctx) {
    const c = stage.ctx, s20 = S(ctx, 's20'), s21 = S(ctx, 's21'), s22 = S(ctx, 's22'), s23 = S(ctx, 's23');
    const mrow = evT(ctx, 'mrow'), mall = evT(ctx, 'mall');
    // s19: die + CUDA tag
    const da = fadeIn(t, ctx.scene.start, 0.4) * fadeOut(t, s20.start - 0.5, 0.5);
    if (da > 0) withAlpha(c, da, () => {
      drawDie(stage, 240, 420, 600, 520, {cols: 8, rows: 12, act: b => 0.3 + 0.7 * (1 - smooth(Math.abs(((t * 0.9) % 1.3) - (Math.floor(b / 8) + (b % 8)) / 20) / 0.14))});
      panel(c, 380, 1000, 320, 130); unlitRect(stage, 380, 1000, 320, 130, da);
      stage.text('CUDA', 540, 1048, {role: 'display', weight: 700, size: 52, color: PAL.cool, align: 'center'});
      stage.text('2006 · 그림이 아닌 계산도', 540, 1100, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      // the screen it used to feed, fading out to the left
      withAlpha(c, 1 - smooth((t - ctx.scene.start - 1.5) / 2.5), () => drawScreen(stage, hookTheta(t), {box: {x: 40, y: 330, w: 160, h: 144}, cell: 6, light: 0.6}));
    });
    // s20–s21: matrices
    const ma = fadeIn(t, s20.start - 0.3, 0.5) * fadeOut(t, s22.start - 0.4, 0.4);
    if (ma > 0) withAlpha(c, ma, () => {
      const n = 4, cs = 92, Ax = 110, Ay = 700, Bx = 540, By = 300, Cx = 540, Cy = 700;
      const a = (i, j) => 1 + Math.floor(rand(i * 7 + j * 3 + 1) * 9), b = (i, j) => 1 + Math.floor(rand(i * 5 + j * 11 + 40) * 9);
      const cval = (i, j) => { let s = 0; for (let k = 0; k < n; k++) s += a(i, k) * b(k, j); return s; };
      const RI = 1, CJ = 2;
      const hiRow = t > mrow && t < mall ? smooth((t - mrow) / 0.4) : 0;
      const grid = (x0, y0, f, hl, filled = () => 1, warm = false) => {
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const x = x0 + j * cs, y = y0 + i * cs, h = hl(i, j), fd = filled(i, j);
          rect(c, x + 3, y + 3, cs - 6, cs - 6, 8, warm ? '#081820' : PAL.block, rgba(PAL.border, 1), 1.5);
          if (fd > 0) withAlpha(c, fd, () => {
            if (warm) rect(c, x + 6, y + 6, cs - 12, cs - 12, 6, '#3A2A1E', rgba(PAL.warm, 0.7), 2);
            stage.text(String(f(i, j)), x + cs / 2, y + cs / 2 + 2, {role: 'display', weight: 700, size: f(i, j) > 99 ? 30 : 36, color: warm ? PAL.warmHi : PAL.ink, align: 'center'});
          });
          if (h > 0) rect(c, x + 2, y + 2, cs - 4, cs - 4, 8, null, rgba(PAL.warm, h), 4);
        }
      };
      stage.text('A', Ax - 34, Ay + 2 * cs, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'center'});
      stage.text('B', Bx + 2 * cs + 230, By + 2 * cs, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'left'});
      stage.text('×', Ax + 4 * cs + 18, By + 2 * cs, {role: 'display', weight: 700, size: 40, color: PAL.muted, align: 'center'});
      grid(Ax, Ay, a, (i) => (i === RI ? hiRow : 0));
      grid(Bx, By, b, (i, j) => (j === CJ ? hiRow : 0));
      const filled = (i, j) => (t >= mall ? smooth((t - mall) / 0.3) : (i === RI && j === CJ && t > mrow + 1.2 ? smooth((t - mrow - 1.2) / 0.3) : 0));
      grid(Cx, Cy, cval, (i, j) => (i === RI && j === CJ ? hiRow : 0), filled, true);
      stage.text('C', Cx + 4 * cs + 30, Cy + 2 * cs, {role: 'display', weight: 700, size: 40, color: PAL.ink, align: 'left'});
      // the row·column pairs travelling into the cell (data) during mrow → mrow+1.2
      if (t > mrow && t < mrow + 1.3) lit(stage, cc => {
        const u = smooth((t - mrow - 0.2) / 0.9);
        for (let k = 0; k < n; k++) {
          const ax = Ax + k * cs + cs / 2, ay = Ay + RI * cs + cs / 2, bx = Bx + CJ * cs + cs / 2, by = By + k * cs + cs / 2, tx = Cx + CJ * cs + cs / 2, ty = Cy + RI * cs + cs / 2;
          circle(cc, lerp(ax, tx, u), lerp(ay, ty, u), 7, rgba(PAL.warm, 0.9)); circle(cc, lerp(bx, tx, u), lerp(by, ty, u), 7, rgba(PAL.warm, 0.9));
        }
      }, {gain: 0.5});
      // the numbers are text: no light under them (the travelling dots stay visible in SDR)
      if (t > mrow && t < mrow + 1.3) { unlitRect(stage, Ax, Ay, n * cs, n * cs); unlitRect(stage, Bx, By, n * cs, n * cs); unlitRect(stage, Cx, Cy, n * cs, n * cs); }
      // the warp below: one instruction, 16 calculators fill the 16 cells
      const wa = fadeIn(t, s21.start, 0.5);
      if (wa > 0) withAlpha(c, wa, () => {
        const f = t >= mall ? Math.max(0, 1 - (t - mall) / 0.8) : 0;
        drawWarp(stage, 110, 1110, 880, 90, {n: 16, rows: 1, cmd: f, fire: () => f, labels: 0});
        // afterimage: the same instruction once painted pixels
        drawScreen(stage, -0.6, {box: {x: 110, y: 320, w: 270, h: 248}, cell: 9, light: 0.7});
        stage.text('화면의 점과 같은 꼴', 245, 610, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      });
    });
    // s22: 2012 — two GPUs and the result
    const ra = fadeIn(t, s22.start - 0.2, 0.5) * fadeOut(t, s23.start - 0.4, 0.4);
    if (ra > 0) withAlpha(c, ra, () => {
      drawDie(stage, 110, 380, 380, 300, {cols: 6, rows: 8, act: b => 0.4 + 0.6 * (1 - smooth(Math.abs(((t * 1.2) % 1) - (b % 6) / 6) / 0.25))});
      drawDie(stage, 590, 380, 380, 300, {cols: 6, rows: 8, act: b => 0.4 + 0.6 * (1 - smooth(Math.abs(((t * 1.2 + 0.5) % 1) - (b % 6) / 6) / 0.25))});
      unlitRect(stage, 110, 700, 860, 50, 1);
      stage.text('GPU 2개 (GTX 580) · 5~6일 학습', 540, 724, {size: 28, weight: 500, color: PAL.muted, align: 'center'});
      const ba = fadeIn(t, W0(ctx, 's22', '크게'), 0.5);
      panel(c, 110, 790, 860, 290); unlitRect(stage, 110, 790, 860, 290, 1);
      stage.text('틀린 비율 (상위 5개 답 안에 정답이 없을 때)', 540, 830, {size: 24, color: PAL.muted, align: 'center'});
      stage.text('GPU 신경망', 150, 910, {role: 'display', weight: 700, size: 30, color: PAL.ink}); hbar(stage, 360, 910, 440, 0.153 / 0.3 * ba, {col: PAL.warm});
      stage.text('15.3%', 930, 910, {size: 30, weight: 700, color: PAL.ink, align: 'right'});
      stage.text('2위', 150, 1000, {role: 'display', weight: 700, size: 30, color: PAL.ink}); hbar(stage, 360, 1000, 440, 0.262 / 0.3 * ba, {col: PAL.muted});
      stage.text('26.2%', 930, 1000, {size: 30, weight: 700, color: PAL.ink, align: 'right'});
      stage.text('ImageNet 2012 · AlexNet', 540, 1055, {size: 22, color: PAL.muted, align: 'center'});
    });
    // s23: many chips computing tables
    const ka = fadeIn(t, s23.start - 0.3, 0.5);
    if (ka > 0) withAlpha(c, ka, () => {
      for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
        const x = 110 + q * 300, y = 360 + r * 280, ph = (r * 3 + q) * 0.17;
        drawDie(stage, x, y, 240, 220, {cols: 4, rows: 6, act: b => 0.35 + 0.65 * (1 - smooth(Math.abs(((t * 1.1 + ph) % 1) - (b % 4) / 4) / 0.3))});
      }
    });
  },

  // chain: back to the first screen → the light keeps moving, every pixel recomputed each frame → conclusion, end line
  close(stage, t, p, ctx) {
    const c = stage.ctx, s24 = S(ctx, 's24');
    drawScreen(stage, TH0 + 0.9 * Math.sin((t - ctx.scene.start) * 0.6));
    screenWarp(stage, t);
    const dim = 0.66 * smooth((t - s24.start + 0.6) / 0.8);
    c.fillStyle = rgba(PAL.deep, dim); c.fillRect(0, 160, W, 1100);
    const ea = smooth((t - s24.start + 0.4) / 0.6);
    unlitRect(stage, 30, 560, W - 60, 340, ea);
    if (ea > 0) withAlpha(c, ea, () => {
      stage.text('같은 명령 하나로,', 540, 620, {role: 'display', weight: 700, size: 64, color: PAL.ink, align: 'center', ...so});
      stage.text('수많은 데이터를 한꺼번에', 540, 715, {role: 'display', weight: 700, size: 64, color: PAL.ink, align: 'center', maxWidth: 980, ...so});
      line(c, [[480, 785], [600, 785]], PAL.warm, 4, {cap: 'butt'});
      if (t >= s24.start) stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 855, {size: 34, weight: 500, color: '#C9D5D8', align: 'center', alpha: smooth((t - s24.start) / 0.5)});
    });
  },
};

// 16 tiles of the essence scene: a 4×4 corner of the screen near the ball's terminator, enlarged
const ESS = {sx: 680, sy: 470, x0: 340, y0: 400, T: 165};
ESS.tiles = () => {
  const out = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) out.push({k: j * 4 + i, x: ESS.x0 + i * ESS.T, y: ESS.y0 + j * ESS.T, sx: ESS.sx + i * 60, sy: ESS.sy + j * 60});
  return out;
};
