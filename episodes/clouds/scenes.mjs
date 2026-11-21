// 54 구름 — 구름은 왜 하얗고 왜 떠 있을까
// Look grammar (2026-11-10): every moving thing is a link of the causal chain; one clock for world, gauges and sound;
// change one condition and keep an afterimage; only energy/signal glows — sunlight and the light that droplets/molecules
// scatter (drawn as rays) — objects are matte filled bodies (the cloud, droplets, raindrops, the ground, molecules).
// One warm colour = what pushes UP (warm rising air, drag); one cool colour = what falls DOWN (droplet weight, rain).
// The colours of light (blue/green/red rays) are the light's own colours and appear only in the 'white' scene.
// Stage: one sky section — ground band (y 1180–1240), a cumulus whose flat base sits at 0.6 km (y 868), height ruler at left
// (1 km = 520 px). Lenses (vapour/droplets, sizes, scattering, falling, merging) are zooms into that cloud.
// HDR (2026-11-15): sun rays and scattered light rays are drawn inside lit(). The cloud body is NOT: it emits no light, it
// is a white matte object at SDR white (decision in brief.md). Text over lit rays blanks the gain map (unlitRect — 47).
// First moment (2026-11-16): 0–2.0 s the cumulus towers up ("20분을 2초로") fed by rising warm air — the base stays at the
// condensation height; 2.2–3.0 s rewind to the 0 s cloud; then the explanation.
// Model notes / simplifications (also in brief.md):
//  - Cloud = flat-shaded overlapping puffs (no 3D texture), base clipped flat at the condensation height.
//  - Rayleigh: intensity ∝ 1/λ⁴ → B 450 nm 1.00, G 550 nm 0.45, R 700 nm 0.17. Droplet (Mie, 20 µm ≫ λ): all ≈ 1.
//  - Terminal speed (Stokes, R < 40 µm): w = 1.19e8 · R² m/s → d 0.02 mm 1.2 cm/s, d 0.1 mm ≈ 30 cm/s (measured ≈ 27).
//  - Raindrop 2 mm ≈ 650 cm/s (Gunn & Kinzer, via secondary sources). Updraft band 30–300 cm/s (script: tens of cm to a few m).
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, rand, line, circle, ring, rect, withAlpha, arrow, lit, ensureGain,
  progressBar, TAU, glow, clipEllipse,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';
export const events = [];
export const captionLayout = {};

const W = 1080, H = 1920;
const PAL = {
  bg: '#001621', deep: '#000E16', ink: '#EFE3D4', muted: '#8AA0A6', border: '#1C3A45', plate: '#06222E',
  warm: '#FF8C3A', warmHi: '#FFC48A',    // pushes up: rising warm air, drag
  cool: '#5BB8E8', coolHi: '#9AD6F5',    // falls down: weight, droplet fall, rain
  sun: '#FFF0D2',                         // sunlight (energy)
  B: '#4F8DFF', G: '#4CD07A', R: '#FF5A4A',
  ground: '#26332C', groundHi: '#3A4A3F', groundLo: '#1A241F',
  drop: '#7FA3B4', dropHi: '#C6DCE6', dropLo: '#3E5A68',
};
const fmt = (x, d = 0) => (+x.toFixed(d)).toLocaleString('en-US');
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const ev = (ctx, id) => ctx.events.get(id);
const evT = (ctx, id) => ctx.events.get(id).time;
const S = (ctx, id) => ctx.tl.sentence(id);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
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
function panel(c, x, y, w, h) { rect(c, x, y, w, h, 14, rgba(PAL.plate, 0.94), rgba(PAL.border, 1), 2); }
function hbar(stage, x, y, w, v, {col = PAL.warm, ghost = null, h = 22} = {}) {
  const c = stage.ctx;
  rect(c, x, y - h / 2, w, h, h / 2, rgba(PAL.border, 0.95));
  if (v > 0.002) rect(c, x, y - h / 2, Math.max(h, w * clamp(v)), h, h / 2, col);
  if (ghost != null) { const gx = x + w * clamp(ghost); line(c, [[gx, y - h], [gx, y + h]], rgba(PAL.ink, 0.8), 3, {dash: [5, 5]}); }
}

// =====================================================================================================
// World: ground, height ruler, cloud, rising air, sun rays
// =====================================================================================================
const GY = 1180, K = 520, BASE_ALT = 0.5, BASE_Y = GY - BASE_ALT * K;   // base y = 920
const SUN_DIR = (() => { const a = Math.atan2(0.86, 0.5); return [Math.cos(a), Math.sin(a)]; })();  // rays head down-right

// cloud geometry states
const C0 = {cx: 560, w: 660, h: 380};        // 0 s (thumbnail)
const C2 = {cx: 560, w: 1000, h: 860};       // 2 s (towered)
const C1 = {cx: 560, w: 540, h: 520};        // ≈ 1 km × 1 km (s02 box)

// puffs in normalized coords: u (−0.5..0.5 of width), v (0..1 of height above base), r (× sqrt(w·h))
const PUFFS = (() => {
  const P = [];
  const row = (n, v, r, span, j) => { for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : -span / 2 + span * i / (n - 1); P.push({u: u + (rand(j + i) - 0.5) * 0.04, v: v + (rand(j + i + 50) - 0.5) * 0.04, r: r * (0.9 + 0.2 * rand(j + i + 90)), k: P.length}); } };
  row(7, 0.06, 0.12, 0.82, 1);
  row(6, 0.28, 0.15, 0.66, 20);
  row(4, 0.50, 0.17, 0.46, 40);
  row(3, 0.68, 0.16, 0.30, 60);
  row(1, 0.82, 0.16, 0, 80);
  return P;
})();
function puffXY(cl, p, t = 0) {
  const s = Math.sqrt(cl.w * cl.h), wob = 1 + 0.035 * Math.sin(t * 0.7 + p.k * 1.7);
  return [cl.cx + p.u * cl.w, (cl.baseY ?? BASE_Y) - p.v * cl.h, p.r * s * wob];
}
/** Matte cumulus: a shadow union and a lit union (offset toward the sun), both with one vertical gradient — greyer toward
 *  the base, darker overall with `dark` (thick / rain cloud). Base clipped flat at the condensation height. */
function drawCloud(stage, cl, t = 0, {dark = 0, alpha = 1} = {}) {
  const c = stage.ctx, base = cl.baseY ?? BASE_Y, top = base - cl.h * 1.0;
  const list = [...PUFFS].sort((a, b) => a.v - b.v);
  withAlpha(c, alpha, () => {
    c.save(); c.beginPath(); c.rect(0, 0, W, base); c.clip();
    const g1 = c.createLinearGradient(0, top, 0, base);
    g1.addColorStop(0, mix('#AEB8BD', '#6E7A80', dark)); g1.addColorStop(1, mix('#56626A', '#262F34', dark));
    const fill = (g, k) => { c.beginPath(); c.ellipse(cl.cx - k * 8, base - cl.h * 0.3 - k * 6, cl.w * 0.44, cl.h * 0.31, 0, 0, TAU); c.fillStyle = g; c.fill(); };
    fill(g1, 0);
    for (const p of list) { const [x, y, r] = puffXY(cl, p, t); circle(c, x, y, r, g1); }
    const g2 = c.createLinearGradient(0, top, 0, base);
    g2.addColorStop(0, mix('#FFFFFF', '#C9CED0', dark)); g2.addColorStop(0.55, mix('#ECEAE5', '#9AA3A8', dark));
    g2.addColorStop(1, mix('#B4BCC0', '#5C676D', dark));
    fill(g2, 1);
    for (const p of list) { const [x, y, r] = puffXY(cl, p, t); circle(c, x - r * 0.13, y - r * 0.15, r * 0.84, g2); }
    // a faint inner shade line under the upper puffs gives the heap its layers (matte, no texture)
    for (const p of list) if (p.v > 0.2) { const [x, y, r] = puffXY(cl, p, t); c.beginPath(); c.arc(x - r * 0.13, y - r * 0.15, r * 0.84, 0.15 * Math.PI, 0.75 * Math.PI); c.strokeStyle = rgba(mix('#9AA4AA', '#3C474D', dark), 0.35); c.lineWidth = 3; c.stroke(); }
    c.restore();
  });
}
/** Ellipse that approximates the cloud's outline (for ray hits and particle checks). */
function cloudEll(cl) { const base = cl.baseY ?? BASE_Y; const top = base - cl.h * 0.98; return {cx: cl.cx, cy: (base + top) / 2, rx: cl.w * 0.52, ry: (base - top) / 2}; }
function insideCloud(cl, x, y) { const e = cloudEll(cl); return ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 < 1 && y < (cl.baseY ?? BASE_Y); }

function drawGround(stage, cl) {
  const c = stage.ctx;
  rect(c, 0, GY, W, 60, 0, PAL.ground);
  rect(c, 0, GY, W, 5, 0, PAL.groundHi);
  // the cloud's shadow on the ground (sun from upper left → shadow to the right)
  if (cl) {
    const e = cloudEll(cl), off = (GY - e.cy) * SUN_DIR[0] / SUN_DIR[1];
    const x0 = e.cx - e.rx * 0.9 + off, x1 = e.cx + e.rx * 0.9 + off;
    rect(c, x0, GY, x1 - x0, 60, 0, rgba(PAL.groundLo, 0.85));
  }
}
function heightRuler(stage, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    line(c, [[54, GY], [54, GY - 2 * K]], rgba(PAL.muted, 0.7), 2);
    for (let k = 0; k <= 2; k++) {
      const y = GY - k * K; line(c, [[46, y], [66, y]], rgba(PAL.muted, 0.9), 2);
      stage.text(`${k} km`, 74, y + (k === 0 ? -16 : 0), {size: 24, color: PAL.muted, weight: 500});
    }
    for (let k = 1; k < 4; k += 2) { const y = GY - k * K / 2; line(c, [[48, y], [60, y]], rgba(PAL.muted, 0.6), 2); }
  });
}
/** Warm air rising from the ground (dashes move up at a speed ∝ updraft). Stops at `top`. */
function risingAir(stage, t, xs, {top = BASE_Y + 10, a = 1, speed = 120, bottom = GY - 4} = {}) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    xs.forEach((x0, i) => {
      for (let y = bottom; y > top; y -= 8) {
        const ph = ((((bottom - y) - t * speed + i * 23) % 56) + 56) % 56;   // fixed phase: y = bottom − C − t·speed → dashes rise
        if (ph > 26) continue;
        const x = x0 + 9 * Math.sin((y + i * 40) * 0.025 + t * 1.3);
        const x2 = x0 + 9 * Math.sin((y - 8 + i * 40) * 0.025 + t * 1.3);
        const fade = clamp((bottom - y) / 60) * clamp((y - top) / 50);
        line(c, [[x, y], [x2, y - 8]], rgba(PAL.warm, 0.55 * fade), 3);
      }
      // arrow head near the top
      const hy = top + 34; arrow(c, [x0, hy + 30], [x0, hy], rgba(PAL.warm, 0.7), 3, {head: 12});
    });
  });
}
/** Sun rays from the upper left that land on the cloud's sunny side (short, fading in). Drawn lit. */
function sunRays(stage, t, cl, {a = 1, n = 6, gain = 0.55, len = 320} = {}) {
  if (a <= 0 || !cl) return;
  const e = cloudEll(cl), nx = -SUN_DIR[1], ny = SUN_DIR[0], rays = [];
  for (let i = 0; i < n; i++) {
    const o = lerp(-0.95, 0.35, i / (n - 1)) * Math.max(e.rx, e.ry), px = e.cx + nx * o, py = e.cy + ny * o;
    let end = null;
    for (let s = -1400; s < 1400; s += 4) { const x = px + SUN_DIR[0] * s, y = py + SUN_DIR[1] * s; if (insideCloud(cl, x, y)) { end = [x, y]; break; } }
    if (!end) continue;
    rays.push([[end[0] - SUN_DIR[0] * len, end[1] - SUN_DIR[1] * len], end]);
  }
  lit(stage, c => {
    for (const [st, end] of rays) {
      const g = c.createLinearGradient(st[0], st[1], end[0], end[1]);
      g.addColorStop(0, rgba(PAL.sun, 0)); g.addColorStop(1, rgba(PAL.sun, 0.8 * a));
      c.strokeStyle = g; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(st[0], st[1]); c.lineTo(end[0], end[1]); c.stroke();
    }
  }, {gain});
}

// =====================================================================================================
// Poster (0 s frame = thumbnail): white question above, the topic word biggest
// =====================================================================================================
const POSTER = {q: ['물이 수백 톤인데', '왜 하얗고, 왜 떨어지지 않을까?'], a: '구름', qy: 200, ay: 445, QS: 56, AS: 220};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 70, yBot = POSTER.ay + 120, a = 1 - smooth(q / 0.8);
  unlitRect(stage, 0, yTop, W, yBot - yTop, a);
  withAlpha(c, a, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.18, 'rgba(0,10,16,0.42)'); g.addColorStop(0.85, 'rgba(0,10,16,0.42)'); g.addColorStop(1, 'rgba(0,10,16,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
    const sh = {shadow: 'rgba(0,0,0,0.95)', shadowBlur: 22}, dy = -q * 120;
    POSTER.q.forEach((s, i) => stage.text(s, 540, POSTER.qy + i * POSTER.QS * 1.25 + dy, {role: 'display', weight: 700, size: POSTER.QS, color: '#FFFFFF', align: 'center', maxWidth: 980, ...sh}));
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
    case 'hook': return [[-Infinity, '20분을 2초로', '오르는 공기가 키운 뭉게구름'], [a('s02'), '어림 · 물 0.5 g/m³', '1 km 상자 속의 물']];
    case 'origin': return [[-Infinity, '1802 · 루크 하워드', '구름에 붙인 이름'], [a('s05'), '확대 · 구름의 밑면', '수증기는 보이지 않는다'], [a('s06'), '몇 분을 몇 초로', '식으면 맺힌다'], [a('s07'), '같은 높이에서', '평평한 밑면']];
    case 'essence': return [[-Infinity, '실제 크기 비율', '물방울과 빗방울'], [a('s09'), '100배 더 확대', '물방울과 빛의 파장']];
    case 'white': return [[-Infinity, '아주 느리게 · 크기 과장', '햇빛 = 여러 색'], [a('s11'), '공기 분자', '파란빛을 더 많이'], [a('s12'), '맑은 하늘', '사방에서 오는 파란빛'], [a('s13'), '구름 물방울', '모든 색을 거의 똑같이'], [a('s14'), '섞인 빛', '흰색'], [a('s15'), '두꺼운 구름', '밑면에 닿는 빛이 적다']];
    case 'float': return [[-Infinity, '아주 느리게 · 크기 과장', '무게와 공기 저항'], [a('s17'), '조건 하나 · 지름', '작을수록 느리게'], [a('s18'), '실제 빠르기 · 렌즈 속 자', '1초에 약 1 cm'], [a('s19'), '몇 분을 몇 초로', '오르는 공기'], [a('s20'), '구름 밖으로', '증발'], [a('s21'), '되풀이', '맺히고 사라진다']];
    case 'rain': return [[-Infinity, '몇십 분을 몇 초로 · 크기 과장', '부딪쳐 합쳐지면'], [a('s23'), '1분을 1초로', '빗방울은 뚫고 내려온다']];
    case 'close': return [[-Infinity, '정리', '크기 하나에서 두 답']];
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
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1240, W, 680, 1);
  if (id === 'close' && t > ctx.tl.at('s24') - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? fadeIn(t, M[0] + 0.3, 0.5) : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, M[0] + 0.3, 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, '#00121B'); g.addColorStop(1, '#03202C');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Hook: 0–2 s the cumulus towers (20 min → 2 s), 2.2–3.0 s rewind, then it grows slowly to ≈ 1 km
// =====================================================================================================
const REW = [2.2, 3.0];
function lerpCloud(a, b, q) { return {cx: lerp(a.cx, b.cx, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q)}; }
function hookCloud(t, ctx) {
  if (t < 2.0) return lerpCloud(C0, C2, easeOut(t / 2.0) * 0.85 + 0.15 * clamp(t / 2));
  if (t < REW[0]) return C2;
  if (t < REW[1]) return lerpCloud(C2, C0, easeInOut((t - REW[0]) / (REW[1] - REW[0])));
  const s02 = S(ctx, 's02');
  return lerpCloud(C0, C1, smooth((t - REW[1]) / (s02.start - REW[1])));
}
const AIR_XS = [330, 460, 600, 740];
// oblique 1 km box around the C1 cloud
const BOX = {x: 290, y: BASE_Y - K, s: K, dx: 110, dy: -70};

// =====================================================================================================
// Droplet particles cycling through a cloud (float, close): condense at the base in rising air, rise, leave at the edge, evaporate
// =====================================================================================================
function particles(cl, t, {n = 60, period = 7, a = 1} = {}) {
  const e = cloudEll(cl), base = cl.baseY ?? BASE_Y, out = [];
  for (let i = 0; i < n; i++) {
    const u = ((t / period) + rand(i * 3.1)) % 1, side = rand(i * 7.7) < 0.5 ? -1 : 1;
    const x0 = e.cx + side * e.rx * (0.05 + 0.5 * rand(i * 5.3)), topY = base - e.ry * 2 * (0.55 + 0.4 * rand(i * 2.9));
    let x, y, r = 1, al = 1, phase;
    if (u < 0.6) { const q = u / 0.6; x = x0 + 10 * Math.sin(q * 6 + i); y = lerp(base - 8, topY, q); phase = 'rise'; r = smooth(u / 0.05); }
    else {
      const q = (u - 0.6) / 0.4, xe = e.cx + side * (e.rx * 1.02), ye = lerp(topY, base + 60, q);
      x = lerp(x0, xe + side * 40, smooth(q * 1.6)); y = q < 0.2 ? lerp(topY, topY + 20, q / 0.2) : ye;
      phase = 'out'; const ev0 = 0.35; r = q < ev0 ? 1 : 1 - smooth((q - ev0) / 0.45); al = r;
    }
    out.push({x, y, r, al: al * a, phase, u, i});
  }
  return out;
}
function drawParticles(stage, ps, {rad = 5} = {}) {
  const c = stage.ctx;
  for (const p of ps) if (p.r > 0.02) { circle(c, p.x, p.y, rad * p.r + 1, rgba(PAL.dropLo, 0.9 * p.al)); circle(c, p.x - 1, p.y - 1, rad * p.r * 0.7, rgba(PAL.dropHi, 0.85 * p.al)); }
}

// =====================================================================================================
// Log ruler (essence, rain): sizes from 10⁻⁷ mm to 10 mm
// =====================================================================================================
const LR = {x0: 110, x1: 950, y: 1112, lo: -7, hi: 1};
const lx = mm => lerp(LR.x0, LR.x1, (Math.log10(mm) - LR.lo) / (LR.hi - LR.lo));
function logRuler(stage, {mark = null, win = null, a = 1} = {}) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    panel(c, 70, 1040, 940, 150); unlitRect(stage, 70, 1040, 940, 150, a);
    line(c, [[LR.x0, LR.y], [LR.x1, LR.y]], rgba(PAL.muted, 0.8), 2);
    for (let d = LR.lo; d <= LR.hi; d++) { const x = lx(10 ** d); line(c, [[x, LR.y - 8], [x, LR.y + 8]], rgba(PAL.muted, 0.8), 2); }
    stage.text('1 nm', lx(1e-6), LR.y + 30, {size: 24, color: PAL.muted, align: 'center'});
    stage.text('1 mm', lx(1), LR.y + 30, {size: 24, color: PAL.muted, align: 'center'});
    // light band
    const bx0 = lx(4e-4), bx1 = lx(7e-4), g = c.createLinearGradient(bx0, 0, bx1, 0);
    g.addColorStop(0, PAL.B); g.addColorStop(0.5, PAL.G); g.addColorStop(1, PAL.R);
    rect(c, bx0, LR.y - 10, bx1 - bx0, 20, 4, g);
    const m = (x, s, col, up = true) => { circle(c, x, LR.y, 7, col); stage.text(s, x, LR.y + (up ? -34 : 54), {size: 24, weight: 700, color: col, align: 'center'}); };
    m(lx(3e-7), '공기 분자', PAL.muted);
    m((bx0 + bx1) / 2, '빛의 파장', PAL.ink, false);
    m(lx(0.02), '구름 물방울', PAL.coolHi);
    m(lx(2), '빗방울', PAL.cool);
    if (mark != null) { const x = lx(mark); ring(c, x, LR.y, 14, PAL.warm, 3); }
    if (win) { const x0 = lx(win[0]), x1 = lx(win[1]); rect(c, x0, LR.y - 22, x1 - x0, 44, 6, null, rgba(PAL.ink, 0.9), 2); }
    stage.text('크기(지름) · 눈금 하나에 10배', 990, 1172, {size: 24, color: PAL.muted, align: 'right'});
  });
}

// =====================================================================================================
// Speed gauge (float, rain): log scale 0.1 … 1000 cm/s, vertical at the right
// =====================================================================================================
const SG = {x: 790, y0: 1110, y1: 350, lo: -1, hi: 3};
const sy = cms => lerp(SG.y0, SG.y1, (Math.log10(Math.max(cms, 0.1)) - SG.lo) / (SG.hi - SG.lo));
function speedGauge(stage, {v = null, ghost = null, band = null, rain = null, a = 1} = {}) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    panel(c, 652, 280, 288, 880); unlitRect(stage, 652, 280, 288, 880, a);
    stage.text('떨어지는 빠르기', 796, 306, {size: 24, weight: 700, color: PAL.muted, align: 'center'});
    line(c, [[SG.x, SG.y0], [SG.x, SG.y1]], rgba(PAL.muted, 0.8), 3);
    for (let d = SG.lo; d <= SG.hi; d++) {
      const y = sy(10 ** d); line(c, [[SG.x - 10, y], [SG.x + 10, y]], rgba(PAL.muted, 0.9), 2);
      stage.text(d >= 2 ? `${10 ** (d - 2)} m/s` : `${10 ** d} cm/s`, SG.x - 18, y, {size: 24, color: PAL.muted, align: 'right'});
    }
    if (band) { const y0 = sy(band[0]), y1 = sy(band[1]); rect(c, SG.x + 16, y1, 26, y0 - y1, 6, rgba(PAL.warm, 0.85)); stage.text('오르는', SG.x + 52, (y0 + y1) / 2 - 15, {size: 24, weight: 700, color: PAL.warm}); stage.text('공기', SG.x + 52, (y0 + y1) / 2 + 15, {size: 24, weight: 700, color: PAL.warm}); }
    if (ghost != null) { const y = sy(ghost); line(c, [[SG.x - 6, y], [SG.x + 40, y]], rgba(PAL.ink, 0.75), 3, {dash: [5, 5]}); }
    if (rain != null) { const y = sy(rain); poly3(c, SG.x + 4, y, PAL.cool); stage.text(`${fmt(rain / 100, 1)} m/s`, SG.x + 38, y, {size: 24, weight: 700, color: PAL.cool}); }
    if (v != null) { const y = sy(v); poly3(c, SG.x + 4, y, PAL.coolHi); stage.text(v < 10 ? `${fmt(v, 1)} cm/s` : `${fmt(v)} cm/s`, SG.x + 38, y, {size: 24, weight: 700, color: PAL.coolHi}); }
  });
}
function poly3(c, x, y, col) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30, y - 12); c.lineTo(x + 30, y + 12); c.closePath(); c.fillStyle = col; c.fill(); }

// Lens: a circular window with leader lines from a point in the world
function lens(stage, cx, cy, r, from, fn, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    if (from) { line(c, [from, [cx - r * 0.7, cy + r * 0.7]], rgba(PAL.ink, 0.45), 2, {dash: [6, 6]}); line(c, [from, [cx + r * 0.7, cy + r * 0.7]], rgba(PAL.ink, 0.45), 2, {dash: [6, 6]}); ring(c, from[0], from[1], 14, rgba(PAL.ink, 0.9), 3); }
    circle(c, cx, cy, r, PAL.deep);
    clipEllipse(c, cx, cy, r, r, () => fn(c));
    ring(c, cx, cy, r, rgba(PAL.ink, 0.85), 3);
  });
}

// =====================================================================================================
// White scene helpers: a light beam of three colours (B/G/R waves) and scattered rays
// =====================================================================================================
const WS = {sx: 540, sy: 600, from: [40, 250]};          // scatterer and where the beam enters
const LAM = {B: 45, G: 55, R: 70};                       // drawn wavelengths ∝ 450/550/700 nm
const RAY = {B: 1.0, G: 0.45, R: 0.17};                  // Rayleigh ∝ 1/λ⁴ (relative to blue)
function wave(c, a, b, lam, amp, ph, col, w = 3) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, pts = [];
  for (let s = 0; s <= L; s += 3) { const o = amp * Math.sin((s / lam - ph) * TAU); pts.push([a[0] + ux * s + nx * o, a[1] + uy * s + ny * o]); }
  line(c, pts, col, w);
}
function beam(stage, t, {split = 1, a = 1, to = [WS.sx, WS.sy]} = {}) {
  const A = WS.from, B = to, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  lit(stage, c => withAlpha(c, a, () => {
    const off = {B: -18 * split, G: 0, R: 18 * split};
    if (split < 0.999) line(c, [A, B], rgba(PAL.sun, 0.8 * (1 - split)), 10);
    for (const k of ['B', 'G', 'R']) {
      const o = off[k];
      wave(c, [A[0] + nx * o, A[1] + ny * o], [B[0] + nx * o * 0.15, B[1] + ny * o * 0.15], LAM[k], 9 * split, t * 1.2, rgba(PAL[k], 0.95 * split), 3.5);
    }
  }), {gain: 0.6});
}
const SCAT_DIRS = Array.from({length: 9}, (_, i) => -Math.PI * 0.95 + i * (Math.PI * 1.9 / 8));
function scatterRays(stage, t, t0, weights, {a = 1, len = 330, src = [WS.sx, WS.sy], skip = -1, r0 = 20} = {}) {
  const age = t - t0; if (age < 0) return;
  const reach = clamp(age / 0.9) * len;
  lit(stage, c => withAlpha(c, a, () => {
    SCAT_DIRS.forEach((th, i) => {
      if (i === skip) return;
      const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
      ['B', 'G', 'R'].forEach((k, j) => {
        const o = (j - 1) * 9, w = weights[k];
        if (w < 0.01) return;
        line(c, [[src[0] + ux * r0 + nx * o, src[1] + uy * r0 + ny * o], [src[0] + ux * (r0 + reach) + nx * o, src[1] + uy * (r0 + reach) + ny * o]], rgba(PAL[k], 0.25 + 0.7 * w), 1.5 + 6 * w);
      });
    });
  }), {gain: 0.55});
}
function eye(stage, x, y, col, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    c.beginPath(); c.moveTo(x - 46, y); c.quadraticCurveTo(x, y - 34, x + 46, y); c.quadraticCurveTo(x, y + 34, x - 46, y); c.closePath();
    c.fillStyle = '#DCE3E6'; c.fill(); circle(c, x, y, 18, col || '#2B3B44'); circle(c, x, y, 8, '#0A1014');
  });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
export const scenes = {
  // chain: the ground warms → warm air rises → it cools and condenses at the base height → the cloud towers (0–2 s result first,
  //        20 min → 2 s) → rewind → the cloud grows to ≈ 1 km → s02: a 1 km box → the water in it: about 500 t
  hook(stage, t, p, ctx) {
    const c = stage.ctx, cl = hookCloud(t, ctx), s02 = S(ctx, 's02');
    heightRuler(stage, 0.9);
    drawGround(stage, cl);
    risingAir(stage, t, AIR_XS, {speed: t < 2.0 ? 260 : 120});
    // afterimage of the towered cloud after the rewind
    if (t > REW[0] && t < s02.start) withAlpha(c, 0.55 * fadeIn(t, REW[0], 0.3) * fadeOut(t, s02.start - 1.0, 0.8), () => {
      const e = cloudEll(C2); c.save(); c.beginPath(); c.ellipse(e.cx, e.cy, e.rx, e.ry, 0, Math.PI, TAU); c.setLineDash([10, 10]); c.strokeStyle = rgba(PAL.ink, 0.7); c.lineWidth = 3; c.stroke(); c.restore();
    });
    drawCloud(stage, cl, t);
    sunRays(stage, t, cl);
    // condensation-height line (base) during the growth
    withAlpha(c, 0.7 * fadeIn(t, 0.3, 0.4) * fadeOut(t, s02.start, 0.5), () => line(c, [[80, BASE_Y], [1040, BASE_Y]], rgba(PAL.ink, 0.5), 2, {dash: [8, 8]}));
    // s02: 1 km box
    const ba = fadeIn(t, s02.start + 0.2, 0.6);
    if (ba > 0) withAlpha(c, ba, () => {
      const {x, y, s, dx, dy} = BOX, q = clamp((t - s02.start - 0.2) / 1.6);
      const edges = [[[x, y + s], [x + s, y + s]], [[x + s, y + s], [x + s, y]], [[x + s, y], [x, y]], [[x, y], [x, y + s]],
        [[x, y], [x + dx, y + dy]], [[x + s, y], [x + s + dx, y + dy]], [[x + s, y + s], [x + s + dx, y + s + dy]], [[x + dx, y + dy], [x + s + dx, y + dy]], [[x + s + dx, y + dy], [x + s + dx, y + s + dy]]];
      edges.forEach(([A, B], i) => { const u = clamp(q * edges.length - i); if (u > 0) line(c, [A, [lerp(A[0], B[0], u), lerp(A[1], B[1], u)]], rgba(PAL.ink, 0.9), 3, {dash: [10, 7]}); });
      const la = fadeIn(t, s02.start + 1.4, 0.4);
      withAlpha(c, la, () => {
        stage.text('1 km', x + s / 2, y + s + 30, {size: 26, weight: 700, color: PAL.ink, align: 'center', ...so});
        stage.text('1 km', x - 14, y + s / 2, {size: 26, weight: 700, color: PAL.ink, align: 'right', ...so});
        stage.text('1 km', x + s + dx / 2 + 14, y + s + dy / 2 + 10, {size: 26, weight: 700, color: PAL.ink, ...so});
      });
    });
    const na = fadeIn(t, W0(ctx, 's02', '오백톤') - 0.1, 0.4) * fadeOut(t, ctx.scene.end - 0.3);
    if (na > 0) withAlpha(c, na, () => {
      panel(c, 600, 980, 430, 150); unlitRect(stage, 600, 980, 430, 150, na);
      stage.text('약 500 t', 815, 1040, {role: 'display', weight: 700, size: 64, color: PAL.cool, align: 'center'});
      stage.text('물 0.5 g × 10억 m³', 815, 1100, {size: 24, color: PAL.muted, align: 'center'});
    });
  },

  // chain: (s03–s04) one sky, three named forms; the cumulus keeps growing on rising air → (s05) lens at the base: below it
  //        invisible vapour (molecules in motion), above it droplets → (s06) a warm air parcel rises, its thermometer drops,
  //        at the dew point the vapour condenses on dust → droplets → (s07) parcels from different places all condense at the
  //        same height → the flat base
  origin(stage, t, p, ctx) {
    const c = stage.ctx, s04 = S(ctx, 's04'), s05 = S(ctx, 's05'), s06 = S(ctx, 's06'), s07 = S(ctx, 's07');
    const cl = C1;
    heightRuler(stage, 0.9);
    drawGround(stage, cl);
    risingAir(stage, t, AIR_XS, {a: t < s06.start - 0.5 ? 1 : 0.35});
    // s03: cirrus (high wisps) and stratus (a flat sheet) appear beside the cumulus
    const na = fadeIn(t, ctx.scene.start + 0.6, 0.6) * fadeOut(t, s05.start - 0.2, 0.5);
    if (na > 0) withAlpha(c, na, () => {
      for (let i = 0; i < 4; i++) { const x = 700 + i * 46, y = 320 + i * 16; line(c, [[x, y], [x + 70, y - 22], [x + 130, y - 30]], rgba('#D9DDE0', 0.8), 6); }
      rect(c, 90, 1090, 200, 26, 13, '#AEB7BC'); rect(c, 98, 1086, 180, 12, 6, '#D6DBDE');
    });
    drawCloud(stage, cl, t);
    sunRays(stage, t, cl, {a: t < s05.start ? 1 : 0.6});
    if (na > 0) withAlpha(c, na, () => {
      const tag = (name, mean, x, y, al, hi) => withAlpha(c, al, () => { unlitRect(stage, x - 10, y - 30, 250, 74, 1); stage.text(name, x, y, {role: 'display', size: 34, weight: 700, color: hi ? PAL.warm : PAL.ink, ...so}); stage.text(mean, x, y + 34, {size: 24, color: PAL.muted, ...so}); });
      tag('cirrus', '머리털', 740, 400, fadeIn(t, ctx.scene.start + 1.0, 0.4), false);
      tag('stratus', '층', 90, 1030, fadeIn(t, ctx.scene.start + 1.6, 0.4), false);
      const ca = fadeIn(t, ctx.scene.start + 2.2, 0.4);
      withAlpha(c, ca, () => line(c, [[250, 560], [330, 600]], rgba(PAL.ink, 0.6), 2));
      tag('cumulus', '무더기', 90, 530, ca, t > W0(ctx, 's04', '큐뮬러스') - 0.2);
      const ya = fadeIn(t, ctx.scene.start + 0.2, 0.5);
      withAlpha(c, ya, () => { panel(c, 90, 300, 260, 120); unlitRect(stage, 90, 300, 260, 120, 1); stage.text('1802', 220, 345, {role: 'display', weight: 700, size: 52, color: PAL.warm, align: 'center'}); stage.text('Luke Howard', 220, 395, {size: 24, color: PAL.muted, align: 'center'}); });
    });
    // s05: lens across the base — vapour (invisible, drawn faint) below, droplets above
    const la = fadeIn(t, s05.start - 0.2, 0.5) * fadeOut(t, s06.start - 0.3, 0.4);
    if (la > 0) {
      const LX = 540, LY = 560, LRr = 230, from = [690, BASE_Y - 4];
      lens(stage, LX, LY, LRr, from, cc => {
        rect(cc, LX - LRr, LY - LRr, LRr * 2, LRr, 0, '#1B2C34');
        line(cc, [[LX - LRr, LY], [LX + LRr, LY]], rgba(PAL.ink, 0.6), 2, {dash: [8, 6]});
        for (let i = 0; i < 26; i++) {      // droplets above the base line
          const x = LX - LRr + 20 + rand(i) * (LRr * 2 - 40), y = LY - 24 - rand(i + 9) * (LRr - 40) + 6 * Math.sin(t * 1.5 + i);
          circle(cc, x, y, 13, PAL.dropLo); circle(cc, x - 3, y - 3, 9, PAL.dropHi);
        }
        for (let i = 0; i < 70; i++) {      // vapour molecules below: tiny, fast, faint
          const x = LX - LRr + ((rand(i * 3) * 2 * LRr + t * 160 * (rand(i) - 0.5)) % (2 * LRr) + 2 * LRr) % (2 * LRr), y = LY + 14 + ((rand(i * 5) * (LRr - 20) + t * 90 * (rand(i + 4) - 0.5)) % (LRr - 20) + (LRr - 20)) % (LRr - 20);
          circle(cc, x, y, 2.5, rgba(PAL.muted, 0.45));
        }
      }, la);
      withAlpha(c, la, () => {
        unlitRect(stage, LX - 200, LY - 140, 400, 50, 1); unlitRect(stage, LX - 200, LY + 90, 400, 50, 1);
        stage.text('물방울 · 보인다', LX, LY - 112, {size: 30, weight: 700, color: PAL.ink, align: 'center', ...so});
        stage.text('수증기 · 보이지 않는다', LX, LY + 118, {size: 30, weight: 700, color: PAL.muted, align: 'center', ...so});
      });
    }
    // s06–s07: air parcels rise from the ground; they cool; at the base height they condense
    const pa = fadeIn(t, s06.start - 0.2, 0.4);
    if (pa > 0) {
      const tc = evT(ctx, 'cond1'), parcels = [{x: 170, t0: tc - 3.0}];
      const cond2 = ticks(ctx, 'cond2');
      cond2.forEach((tt, i) => parcels.push({x: [400, 680, 540, 300][i], t0: tt - 2.2}));
      withAlpha(c, pa, () => {
        parcels.forEach((P, i) => {
          const dur = i === 0 ? 3.0 : 2.2, q = clamp((t - P.t0) / dur);
          if (t < P.t0 - 0.2) return;
          const y = lerp(GY - 40, BASE_Y + 6, easeInOut(q)), r = 40 + 8 * q, after = t - (P.t0 + dur);
          const keep = i === 0 ? 1 : fadeOut(after, 1.0, 0.5);
          if (keep <= 0) return;
          c.save(); c.globalAlpha *= keep;
          const col = mix(PAL.warm, '#8FA3AC', q);
          circle(c, P.x, y, r, rgba(col, 0.25)); ring(c, P.x, y, r, rgba(col, 0.9), 3);
          // inside: vapour dots that become droplets once condensed
          for (let k = 0; k < 10; k++) {
            const a = k * 2.4 + i, rr = r * 0.6 * Math.sqrt((k + 0.5) / 10), x = P.x + Math.cos(a) * rr, yy = y + Math.sin(a) * rr;
            if (after > 0) { const g = smooth(after / 0.5); circle(c, x, yy, 3 + 7 * g, mix(PAL.muted, PAL.dropHi, g)); }
            else circle(c, x + 3 * Math.sin(t * 9 + k), yy, 2.5, rgba(PAL.muted, 0.6));
          }
          if (i === 0) {
            // thermometer readout beside the first parcel: 25 °C at ground, −1 °C per 100 m
            const alt = (GY - 40 - y) / K + 0.08, temp = 25 - 10 * alt;
            panel(c, P.x + 70, y - 34, 150, 60); unlitRect(stage, P.x + 70, y - 34, 150, 60, 1);
            stage.text(`${fmt(temp, 0)} °C`, P.x + 145, y - 4, {role: 'display', size: 32, weight: 700, color: after > 0 ? PAL.coolHi : PAL.warm, align: 'center'});
            if (after > 0) withAlpha(c, fadeIn(after, 0, 0.4), () => stage.text('이슬점 · 맺힘', P.x + 145, y - 54, {size: 24, weight: 700, color: PAL.coolHi, align: 'center', ...so}));
          }
          c.restore();
        });
        // s07: the condensation height
        const ha = fadeIn(t, s07.start + 0.2, 0.5);
        withAlpha(c, ha, () => {
          line(c, [[80, BASE_Y], [1040, BASE_Y]], rgba(PAL.coolHi, 0.9), 3, {dash: [12, 8]});
          unlitRect(stage, 640, BASE_Y + 40, 400, 46, 1);
          stage.text('물방울이 맺히는 높이 ≈ 0.5 km', 1030, BASE_Y + 62, {size: 26, weight: 700, color: PAL.coolHi, align: 'right', ...so});
        });
      });
    }
  },

  // chain: lens into the cloud → a raindrop (2 mm) and a cloud droplet (0.02 mm) at true size ratio (100×) → zoom 100× into the
  //        droplet (the raindrop's edge sweeps away) → light's wavelength appears as a tiny wave beside it (droplet ≈ 40 λ)
  //        → the size ruler marks: droplet sits between light and raindrop
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s09 = S(ctx, 's09');
    const PX = 250;                          // px per mm at zoom 1
    const D = [760, 600];                    // the droplet (zoom centre)
    const R0 = [330, 600];                   // raindrop centre
    const zq = smooth((t - (s09.start - 0.6)) / 2.6), z = Math.pow(100, zq);
    const P = q => [D[0] + (q[0] - D[0]) * z, D[1] + (q[1] - D[1]) * z];
    c.save(); c.beginPath(); c.rect(0, 280, W, 740); c.clip();
    // raindrop (2 mm)
    const rp = P(R0), rr = 1.0 * PX * z;
    circle(c, rp[0], rp[1], rr, PAL.dropLo); circle(c, rp[0] - rr * 0.1, rp[1] - rr * 0.12, rr * 0.86, PAL.drop); circle(c, rp[0] - rr * 0.3, rp[1] - rr * 0.34, rr * 0.4, PAL.dropHi);
    // cloud droplet (0.02 mm)
    const dr = 0.01 * PX * z;
    circle(c, D[0], D[1], dr + 0.5, PAL.dropLo); circle(c, D[0] - dr * 0.1, D[1] - dr * 0.12, dr * 0.86, PAL.drop); if (dr > 6) circle(c, D[0] - dr * 0.3, D[1] - dr * 0.34, dr * 0.4, PAL.dropHi);
    if (z < 3) ring(c, D[0], D[1], 22, rgba(PAL.warm, 0.9), 3);
    // light wavelength (0.0005 mm) — a short wave train beside the droplet once zoomed
    const wa = fadeIn(t, s09.start + 1.8, 0.5);
    if (wa > 0) {
      const lam = 0.0005 * PX * z, y = D[1] + dr + 60;
      lit(stage, cc => withAlpha(cc, wa, () => wave(cc, [D[0] - dr - 60, y], [D[0] + dr + 60, y], lam, 6, t * 2, rgba(PAL.sun, 0.9), 2.5)), {gain: 0.5});
      withAlpha(c, wa, () => {
        unlitRect(stage, D[0] - 260, y + 18, 400, 44, 1);
        line(c, [[D[0] - dr - 60, y + 22], [D[0] - dr - 60 + lam, y + 22]], PAL.ink, 3);
        stage.text('빛의 파장 ≈ 0.0005 mm', D[0] - dr - 60, y + 46, {size: 24, weight: 700, color: PAL.ink, ...so});
      });
    }
    c.restore();
    // labels
    const la = fadeOut(t, s09.start - 0.6, 0.4);
    if (la > 0) withAlpha(c, la, () => {
      unlitRect(stage, 160, 870, 340, 80, 1); unlitRect(stage, 640, 660, 400, 90, 1);
      stage.text('빗방울 2 mm', 330, 900, {size: 30, weight: 700, color: PAL.cool, align: 'center', ...so});
      stage.text('구름 물방울', 840, 690, {size: 30, weight: 700, color: PAL.coolHi, align: 'center', ...so});
      stage.text('0.02 mm', 840, 728, {size: 26, color: PAL.muted, align: 'center', ...so});
    });
    const ka = fadeIn(t, W0(ctx, 's08', '백분의일') - 0.2, 0.4) * fadeOut(t, s09.start - 0.6, 0.4);
    if (ka > 0) withAlpha(c, ka, () => { unlitRect(stage, 540, 400, 440, 110, 1); stage.text('지름 100분의 1', 760, 460, {role: 'display', size: 60, weight: 700, color: PAL.ink, align: 'center', ...so}); });
    const kb = fadeIn(t, s09.start + 2.2, 0.4);
    if (kb > 0) withAlpha(c, kb, () => {
      const dr2 = 0.01 * PX * z;
      unlitRect(stage, 60, 360, 500, 110, 1);
      stage.text('파장의 약 40배', 300, 420, {role: 'display', size: 56, weight: 700, color: PAL.ink, align: 'center', ...so});
      unlitRect(stage, D[0] - 220, D[1] - dr2 - 70, 440, 50, 1);
      stage.text('구름 물방울 0.02 mm', D[0], D[1] - dr2 - 44, {size: 28, weight: 700, color: PAL.coolHi, align: 'center', ...so});
    });
    // ruler gauge: the viewing window slides as we zoom
    const vw = W / (PX * z), hi = 0.02 + vw / 2, lo = Math.max(0.02 - vw / 2, 0.0004 / hi);
    logRuler(stage, {mark: 0.02, win: [lo, hi]});
  },

  // chain: sunlight enters (white) → splits into colours of different wavelength → hits an air molecule → scattered: blue strongly,
  //        red weakly (bars) → many molecules send blue to the eye (blue sky) → the scatterer becomes a droplet → all colours
  //        equally (bars equal, molecule bars as afterimage) → mixed → white at the eye → thick cloud: light bounces back up and
  //        out, little reaches the base (base darkens, gauge)
  white(stage, t, p, ctx) {
    const c = stage.ctx, s11 = S(ctx, 's11'), s12 = S(ctx, 's12'), s13 = S(ctx, 's13'), s14 = S(ctx, 's14'), s15 = S(ctx, 's15');
    const hitM = evT(ctx, 'scatB'), hitD = evT(ctx, 'scatW');
    const thick = t > s15.start - 0.6;
    if (!thick) {
      const split = smooth((t - (W0(ctx, 's10', '섞여') + 0.3)) / 0.8);
      const isDrop = t > s13.start - 0.5, dq = smooth((t - (s13.start - 0.5)) / 0.5);
      // scatterer
      const EYE = [880, 930];
      if (!isDrop || dq < 1) withAlpha(c, 1 - dq, () => { circle(c, WS.sx, WS.sy, 9, '#B9C6CC'); circle(c, WS.sx - 2, WS.sy - 2, 5, '#E4ECEF'); });
      // the beam reaches the scatterer from s11 (before: it passes to the right edge)
      const toS = t > s11.start - 0.6;
      beam(stage, t, {split, to: toS ? [WS.sx, WS.sy] : [1100, 830]});
      // wavelength bracket on the red wave (s10)
      const wb = fadeIn(t, W0(ctx, 's10', '파장') - 0.3, 0.4) * fadeOut(t, s11.start - 0.4, 0.3);
      if (wb > 0) withAlpha(c, wb, () => { const x0 = 220, y0 = 330; line(c, [[x0, y0 + 70], [x0 + LAM.R, y0 + 70]], PAL.ink, 3); line(c, [[x0, y0 + 60], [x0, y0 + 80]], PAL.ink, 3); line(c, [[x0 + LAM.R, y0 + 60], [x0 + LAM.R, y0 + 80]], PAL.ink, 3); unlitRect(stage, x0 - 20, y0 + 84, 260, 44, 1); stage.text('파장', x0 + LAM.R / 2, y0 + 104, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so}); });
      // colour names (s10)
      const cn = fadeIn(t, W0(ctx, 's10', '무지개') - 0.2, 0.4) * fadeOut(t, s11.start - 0.4, 0.3);
      if (cn > 0) withAlpha(c, cn, () => { unlitRect(stage, 80, 700, 340, 170, 1); [['파랑 450 nm', PAL.B], ['초록 550 nm', PAL.G], ['빨강 700 nm', PAL.R]].forEach(([s, col], i) => stage.text(s, 100, 730 + i * 52, {size: 30, weight: 700, color: col, ...so})); });
      // molecule scattering
      if (!isDrop) {
        scatterRays(stage, t, hitM, RAY);
        // s12: more molecules across the sky send blue to the eye
        const ma = fadeIn(t, s12.start - 0.3, 0.6);
        if (ma > 0) {
          const MOL = [[200, 560], [330, 800], [700, 420], [760, 700], [420, 420], [250, 960]];
          withAlpha(c, ma, () => MOL.forEach(([x, y]) => { circle(c, x, y, 8, '#B9C6CC'); }));
          lit(stage, cc => withAlpha(cc, ma, () => MOL.concat([[WS.sx, WS.sy]]).forEach(([x, y], i) => {
            const u = clamp((t - s12.start - i * 0.12) / 0.8);
            line(cc, [[x, y], [lerp(x, EYE[0], u), lerp(y, EYE[1], u)]], rgba(PAL.B, 0.85), 4);
          })), {gain: 0.55});
          eye(stage, EYE[0], EYE[1], PAL.B, ma);
          withAlpha(c, fadeIn(t, W0(ctx, 's12', '파랗게') - 0.2, 0.4), () => { unlitRect(stage, 780, 980, 220, 50, 1); stage.text('파랗게', EYE[0], 1004, {role: 'display', size: 34, weight: 700, color: PAL.B, align: 'center', ...so}); });
        }
        const lb = fadeIn(t, hitM - 0.6, 0.4) * fadeOut(t, s12.start - 0.4, 0.3);
        if (lb > 0) withAlpha(c, lb, () => { unlitRect(stage, WS.sx - 160, WS.sy + 40, 320, 50, 1); stage.text('공기 분자', WS.sx, WS.sy + 62, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so}); });
      } else {
        // the droplet
        withAlpha(c, dq, () => { circle(c, WS.sx, WS.sy, 80, PAL.dropLo); circle(c, WS.sx - 8, WS.sy - 10, 69, PAL.drop); circle(c, WS.sx - 24, WS.sy - 28, 32, PAL.dropHi); });
        scatterRays(stage, t, hitD, {B: 0.8, G: 0.8, R: 0.8}, {r0: 84});
        const lb = fadeIn(t, hitD - 0.4, 0.4) * fadeOut(t, s14.start - 0.3, 0.3);
        if (lb > 0) withAlpha(c, lb, () => { unlitRect(stage, WS.sx - 230, WS.sy + 96, 460, 50, 1); stage.text('구름 물방울 · 크기 줄여 그림', WS.sx, WS.sy + 120, {size: 26, weight: 700, color: PAL.ink, align: 'center', ...so}); });
        // s14: the three colours reach the eye together → white
        const wa = fadeIn(t, s14.start - 0.3, 0.6);
        if (wa > 0) {
          lit(stage, cc => withAlpha(cc, wa, () => {
            const u = clamp((t - s14.start + 0.3) / 0.9), A = [WS.sx + 60, WS.sy + 60], B = [lerp(A[0], EYE[0] - 50, u), lerp(A[1], EYE[1] - 20, u)];
            ['B', 'G', 'R'].forEach((k, j) => line(cc, [[A[0] + (j - 1) * 10, A[1] - (j - 1) * 10], [B[0] + (j - 1) * 10 * (1 - u), B[1] - (j - 1) * 10 * (1 - u)]], rgba(PAL[k], 0.9 * (1 - u * 0.6)), 5));
            line(cc, [A, B], rgba('#FFFFFF', 0.9 * u), 6);
          }), {gain: 0.6});
          eye(stage, EYE[0], EYE[1], '#E8E4DC', wa);
          withAlpha(c, fadeIn(t, W0(ctx, 's14', '흰색') - 0.2, 0.4), () => { unlitRect(stage, 780, 980, 220, 50, 1); stage.text('흰색', EYE[0], 1004, {role: 'display', size: 34, weight: 700, color: '#FFFFFF', align: 'center', ...so}); });
        }
      }
      // gauge: scattered strength per colour (same frame as the hit)
      const ga = fadeIn(t, hitM - 0.3, 0.4);
      if (ga > 0) withAlpha(c, ga, () => {
        panel(c, 70, 1050, 940, 140); unlitRect(stage, 70, 1050, 940, 140, ga);
        stage.text('흩어지는 빛의 세기', 100, 1078, {size: 24, weight: 700, color: PAL.muted});
        const w = isDrop ? (t >= hitD ? 0.8 : 0) : (t >= hitM ? 1 : 0), ws = isDrop ? {B: w, G: w, R: w} : {B: RAY.B * w, G: RAY.G * w, R: RAY.R * w};
        ['B', 'G', 'R'].forEach((k, j) => { const y = 1110 + j * 30; stage.text(k === 'B' ? '파랑' : k === 'G' ? '초록' : '빨강', 140, y, {size: 24, weight: 700, color: PAL[k], align: 'right'}); hbar(stage, 160, y, 820, ws[k], {col: PAL[k], ghost: isDrop ? RAY[k] : null, h: 18}); });
      });
    } else {
      // s15: thick cloud — rays enter the top, bounce inside, leave by the top and sides; few reach the base
      const q = smooth((t - s15.start + 0.2) / 3.0), cl = {cx: 540, w: 760, h: lerp(420, 560, q)};
      heightRuler(stage, 0.9);
      drawGround(stage, cl);
      drawCloud(stage, cl, t, {dark: q * 0.9});
      sunRays(stage, t, cl, {a: 0.8});
      // random walks inside the cloud (deterministic): light enters on the sunny side, is scattered again and again;
      // most of it leaves by the top and sides, little reaches the base
      const e = cloudEll(cl), nx = -SUN_DIR[1], ny = SUN_DIR[0];
      const walks = Array.from({length: 8}, (_, i) => {
        const o = lerp(-0.8, 0.3, i / 7) * e.rx, px = e.cx + nx * o, py = e.cy + ny * o;
        let x = px, y = py;
        for (let s = -1400; s < 1400; s += 4) { x = px + SUN_DIR[0] * s; y = py + SUN_DIR[1] * s; if (insideCloud(cl, x, y)) break; }
        const pts = [[x - SUN_DIR[0] * 160, y - SUN_DIR[1] * 160], [x, y]];
        let exit = 'out';
        for (let k = 0; k < 18; k++) {
          const a = rand(i * 31 + k * 7 + 3) * TAU, step = 52;
          x += Math.cos(a) * step; y += Math.sin(a) * step * 0.8;
          pts.push([x, y]);
          if (!insideCloud(cl, x, y)) { exit = y >= (cl.baseY ?? BASE_Y) - 2 ? 'base' : 'out'; break; }
        }
        return {pts, exit};
      });
      const prog = clamp((t - s15.start - 0.6) / 4.0);
      lit(stage, cc => walks.forEach(({pts, exit}, i) => {
        const n = Math.max(2, Math.floor(prog * pts.length * 1.3) - (i % 3));
        const P = pts.slice(0, Math.min(pts.length, n));
        if (P.length < 2) return;
        line(cc, P, rgba(exit === 'base' ? PAL.sun : '#FFF7E8', 0.7), 2.5);
        if (n >= pts.length) { const L = P[P.length - 1], M = P[P.length - 2]; arrow(cc, M, [L[0] + (L[0] - M[0]) * 0.7, L[1] + (L[1] - M[1]) * 0.7], rgba('#FFF7E8', 0.9), 3, {head: 14}); }
      }), {gain: 0.5});
      const ga = fadeIn(t, s15.start + 0.4, 0.4);
      withAlpha(c, ga, () => {
        panel(c, 70, 1050, 940, 110); unlitRect(stage, 70, 1050, 940, 110, ga);
        stage.text('밑면에 닿는 빛', 100, 1082, {size: 24, weight: 700, color: PAL.muted});
        hbar(stage, 100, 1122, 860, lerp(0.55, 0.12, q), {col: PAL.sun, ghost: 0.55});
      });
    }
  },

  // chain: (s16) a droplet falls → drag grows with speed → drag = weight → speed stops growing (needle) → (s17) shrink the
  //        diameter → weight falls ∝ d³, drag ∝ d → the needle drops to ≈ 1 cm/s (afterimage at 30) → (s18) real speed with a cm
  //        ruler; 1 hour ≈ 40 m → (s19) back to the cloud: rising air (warm band on the gauge) carries droplets up → (s20)
  //        droplets that leave the cloud shrink and vanish → (s21) new droplets keep forming in the rising air
  float(stage, t, p, ctx) {
    const c = stage.ctx, s16 = S(ctx, 's16'), s17 = S(ctx, 's17'), s18 = S(ctx, 's18'), s19 = S(ctx, 's19'), s20 = S(ctx, 's20'), s21 = S(ctx, 's21');
    const COL = {x: 70, y: 300, w: 545, h: 860, cx: 342};
    const big = 30, small = 1.2;
    const rel = evT(ctx, 'release'), shr = evT(ctx, 'shrink');
    const inLens = t < s19.start - 0.5;
    if (inLens) {
      // the falling column (camera follows the droplet; air streaks move up past it)
      const dQ = smooth((t - shr) / 2.4), d = lerp(0.1, 0.02, dQ);         // mm
      const v = speedAt(t, ctx);                                              // cm/s
      const real = t > s18.start - 0.4;
      panel(c, COL.x - 20, COL.y - 10, COL.w + 40, COL.h + 20);
      unlitRect(stage, COL.x - 20, COL.y - 10, COL.w + 40, COL.h + 20, 1);
      clipRectSimple(c, COL.x, COL.y, COL.w, COL.h, () => {
        if (!real) {
          // relative air streaks (up), speed ∝ v
          const off = streakOffset(t, ctx);
          for (let i = 0; i < 26; i++) { const x = COL.x + 20 + rand(i) * (COL.w - 40), y = COL.y + ((rand(i + 7) * COL.h - off * (0.6 + 0.4 * rand(i + 3))) % COL.h + COL.h) % COL.h; line(c, [[x, y], [x, y - 10 - v * 1.2]], rgba(PAL.muted, 0.35), 2); }
          const r = 70 * d / 0.1 + 6, X = COL.cx, Y = COL.y + COL.h * 0.45;
          circle(c, X, Y, r, PAL.dropLo); circle(c, X - r * 0.1, Y - r * 0.12, r * 0.86, PAL.drop); circle(c, X - r * 0.3, Y - r * 0.34, r * 0.4, PAL.dropHi);
          // forces: weight ∝ d³ (cool, down) · drag ∝ d·v (warm, up), scaled so they are equal at d 0.1 mm, 30 cm/s
          const Wt = 240 * (d / 0.1) ** 3, Dr = 240 * (d / 0.1) * (v / big);
          if (t > rel) {
            arrow(c, [X, Y + r + 6], [X, Y + r + 6 + Math.max(Wt, 3)], PAL.cool, 8, {head: 22});
            if (Dr > 2) arrow(c, [X, Y - r - 6], [X, Y - r - 6 - Dr], PAL.warm, 8, {head: 22});
            stage.text('무게', X + 30, Y + r + 40, {size: 26, weight: 700, color: PAL.cool});
            stage.text('공기 저항', X + 30, Y - r - 40, {size: 26, weight: 700, color: PAL.warm});
          }
          // diameter dial
          unlitRect(stage, COL.x, COL.y + COL.h - 116, COL.w, 116, 1);
          stage.text(`지름 ${fmt(d, 2)} mm`, COL.x + 24, COL.y + COL.h - 40, {role: 'display', size: 34, weight: 700, color: PAL.ink});
          // weight ∝ d³ and drag ∝ d·v: the drag ratio below is AT THE SAME SPEED (stated in the label), not the drag drawn now
          if (t > shr) withAlpha(c, fadeIn(t, shr + 0.6, 0.4), () => {
            stage.text('같은 빠르기에서', COL.x + COL.w - 24, COL.y + COL.h - 88, {size: 24, weight: 500, color: PAL.muted, align: 'right'});
            stage.text(`무게 ${fmt(1 / ((d / 0.1) ** 3), 0)}분의 1`, COL.x + COL.w - 24, COL.y + COL.h - 56, {size: 26, weight: 700, color: PAL.cool, align: 'right'});
            stage.text(`저항 ${fmt(1 / (d / 0.1), 0)}분의 1`, COL.x + COL.w - 24, COL.y + COL.h - 24, {size: 26, weight: 700, color: PAL.warm, align: 'right'});
          });
        } else {
          // real speed: 1 cm = 60 px on the ruler; the droplet moves 1.2 cm/s
          const t0 = s18.start - 0.4, y = COL.y + 120 + (t - t0) * small * 60, X = COL.cx;
          for (let k = 0; k <= 12; k++) { const yy = COL.y + 120 + k * 60; line(c, [[COL.x + 40, yy], [COL.x + (k % 5 === 0 ? 120 : 90), yy]], rgba(PAL.muted, 0.9), 3); if (k % 5 === 0) stage.text(`${k} cm`, COL.x + 132, yy, {size: 24, color: PAL.muted}); }
          circle(c, X, y, 14, PAL.dropLo); circle(c, X - 2, y - 2, 10, PAL.drop); circle(c, X - 5, y - 5, 5, PAL.dropHi);
          arrow(c, [X, y + 22], [X, y + 70], PAL.cool, 5, {head: 16});
          withAlpha(c, fadeIn(t, W0(ctx, 's18', '한시간') - 0.2, 0.4), () => {
            unlitRect(stage, COL.x + 250, COL.y + 300, 300, 140, 1);
            stage.text('1시간', COL.x + 400, COL.y + 340, {size: 30, weight: 700, color: PAL.muted, align: 'center'});
            stage.text('≈ 40 m', COL.x + 400, COL.y + 400, {role: 'display', size: 60, weight: 700, color: PAL.cool, align: 'center'});
          });
        }
      });
      speedGauge(stage, {v: t > rel ? Math.max(v, 0.1) : null, ghost: t > shr + 0.4 ? big : null});
      return;
    }
    // ---- back on the cloud (s19–s21): rising air carries droplets; at the edges they leave and evaporate; new ones form
    const back = smooth((t - (s19.start - 0.5)) / 0.8);
    const cl = {cx: 360, w: 560, h: 540};
    heightRuler(stage, back);
    withAlpha(c, back, () => {
      drawGround(stage, cl);
      risingAir(stage, t, [240, 360, 480], {top: BASE_Y + 10, speed: 160});
      drawCloud(stage, cl, t);
      sunRays(stage, t, cl, {a: 0.7});
      // updraft arrows inside the cloud
      const e = cloudEll(cl);
      for (let i = 0; i < 4; i++) { const x = e.cx - 150 + i * 100, ph = ((t * 0.9 + i * 0.3) % 1); arrow(c, [x, BASE_Y - 20 - ph * 260], [x, BASE_Y - 80 - ph * 260], rgba(PAL.warm, 0.85 * Math.sin(ph * Math.PI)), 6, {head: 18}); }
      const ps = particles(cl, t, {n: 70, period: 6});
      drawParticles(stage, ps, {rad: 6});
      // s20: mark the evaporating ones; s21: mark the forming ones
      const ea = fadeIn(t, s20.start - 0.2, 0.4), fa = fadeIn(t, s21.start - 0.2, 0.4);
      for (const q of ps) {
        if (ea > 0 && q.phase === 'out' && q.r < 0.9 && q.r > 0.05) ring(c, q.x, q.y, 14, rgba(PAL.cool, 0.8 * ea * q.r), 2.5);
        if (fa > 0 && q.phase === 'rise' && q.u < 0.08) ring(c, q.x, q.y, 14, rgba(PAL.warm, 0.9 * fa), 2.5);
      }
      if (ea > 0) withAlpha(c, ea, () => { unlitRect(stage, 40, 300, 300, 50, 1); stage.text('밖으로 → 증발', 60, 325, {size: 28, weight: 700, color: PAL.cool, ...so}); });
      if (fa > 0) withAlpha(c, fa, () => { unlitRect(stage, 40, 1060, 330, 50, 1); stage.text('오르는 공기 속 → 맺힘', 60, 1085, {size: 28, weight: 700, color: PAL.warm, ...so}); });
    });
    speedGauge(stage, {v: small, ghost: big, band: [30, 300], a: 1});
  },

  // chain: (s22) a falling drop sweeps up small droplets — each contact merges (tick) → count 1 → 1,000,000, diameter 0.02 → 2 mm
  //        (ruler mark moves) → (s23) back on the cloud: raindrops fall at ≈ 6.5 m/s, faster than the rising air (gauge) →
  //        they reach the ground
  rain(stage, t, p, ctx) {
    const c = stage.ctx, s23 = S(ctx, 's23');
    const mt = ticks(ctx, 'merge');
    if (t < s23.start - 0.5) {
      const q = clamp((t - mt[0]) / (mt[mt.length - 1] - mt[0]));
      const dmm = 0.02 * Math.pow(100, q), N = Math.round(Math.pow(1e6, q));
      // lens view: scale changes so the growing drop stays visible: drop radius on screen from 30 → 240 px (log)
      const r = 30 * Math.pow(8, q), X = 540, Y = 610, sScale = r / (dmm / 2);   // px per mm
      lens(stage, X, Y, 290, null, cc => {
        // small droplets streaming up relative to the faster-falling big drop
        const sr = Math.max(1.2, 0.01 * sScale);
        for (let i = 0; i < 40; i++) { const x = X - 280 + rand(i) * 560, y = Y + 290 - (((t * 220 + rand(i + 5) * 580) % 580)); if (Math.hypot(x - X, y - Y) < r) continue; circle(cc, x, y, sr + 1, PAL.dropLo); circle(cc, x - 0.5, y - 0.5, sr * 0.7, PAL.dropHi); }
        circle(cc, X, Y, r, PAL.dropLo); circle(cc, X - r * 0.1, Y - r * 0.12, r * 0.86, PAL.drop); circle(cc, X - r * 0.3, Y - r * 0.34, r * 0.4, PAL.dropHi);
        // contact flash ring at each merge (same frame as the tick)
        for (const tt of mt) { const a = t - tt; if (a >= 0 && a < 0.35) ring(cc, X, Y, r + 4 + a * 30, rgba(PAL.coolHi, 0.8 * (1 - a / 0.35)), 3); }
      });
      unlitRect(stage, 200, 912, 680, 120, 1);
      stage.text(`${fmt(N)}개`, 540, 950, {role: 'display', size: 64, weight: 700, color: PAL.ink, align: 'center', ...so});
      stage.text(`합쳐진 구름 물방울 · 지름 ${dmm < 0.1 ? fmt(dmm, 2) : dmm < 1 ? fmt(dmm, 1) : fmt(dmm, 1)} mm`, 540, 1004, {size: 26, color: PAL.muted, align: 'center', ...so});
      logRuler(stage, {mark: dmm});
      return;
    }
    const back = smooth((t - (s23.start - 0.5)) / 0.8), cl = {cx: 360, w: 580, h: 600};
    heightRuler(stage, back);
    withAlpha(c, back, () => {
      drawGround(stage, cl);
      risingAir(stage, t, [250, 470], {top: BASE_Y + 10, speed: 160, a: 0.6});
      drawCloud(stage, cl, t, {dark: 0.55});
      // raindrops: from the base to the ground; 6.5 m/s at "1 min → 1 s" → 390 m/s → 203 px/s
      const hits = ticks(ctx, 'rainhit');
      hits.forEach((th, i) => {
        const fall = (GY - BASE_Y) / 203, t0 = th - fall, x = 150 + ((i * 97) % 420);
        if (t < t0 || t > th + 0.4) return;
        if (t <= th) { const y = lerp(BASE_Y + 4, GY - 4, (t - t0) / fall); line(c, [[x, y - 44], [x, y]], rgba(PAL.cool, 0.8), 6); circle(c, x, y, 9, PAL.coolHi); }
        else { const a = 1 - (t - th) / 0.4; ring(c, x, GY - 2, 10 + (t - th) * 60, rgba(PAL.coolHi, 0.8 * a), 2.5); }
      });
    });
    speedGauge(stage, {v: 1.2, band: [30, 300], rain: 650, a: 1});
  },

  // chain: the first cumulus → sun rays scatter off it (white), droplets form and vanish inside, rising air → the two answers
  close(stage, t, p, ctx) {
    const c = stage.ctx, s24 = S(ctx, 's24'), cl = C1;
    heightRuler(stage, 0.9);
    drawGround(stage, cl);
    risingAir(stage, t, AIR_XS, {a: 0.8});
    drawCloud(stage, cl, t);
    drawParticles(stage, particles(cl, t, {n: 50, period: 6}), {rad: 4});
    sunRays(stage, t, cl);
    const dim = 0.84 * smooth((t - s24.start + 0.6) / 0.8);
    c.fillStyle = rgba(PAL.deep, dim); c.fillRect(0, 280, W, 960);
    const ea = smooth((t - s24.start + 0.4) / 0.6);
    unlitRect(stage, 30, 380, W - 60, 520, ea);
    if (ea > 0) withAlpha(c, ea, () => {
      stage.text('빛의 파장보다 커서', 540, 450, {role: 'display', weight: 700, size: 58, color: PAL.ink, align: 'center', ...so});
      stage.text('→ 하얗게 보이고', 540, 530, {role: 'display', weight: 700, size: 58, color: '#FFFFFF', align: 'center', ...so});
      line(c, [[480, 590], [600, 590]], PAL.warm, 4, {cap: 'butt'});
      withAlpha(c, fadeIn(t, W0(ctx, 's24', '빗방울') - 0.2, 0.4), () => {
        stage.text('빗방울보다 작아서', 540, 670, {role: 'display', weight: 700, size: 58, color: PAL.ink, align: 'center', ...so});
        stage.text('→ 좀처럼 떨어지지 않는다', 540, 750, {role: 'display', weight: 700, size: 58, color: PAL.coolHi, align: 'center', maxWidth: 980, ...so});
      });
      if (t >= s24.start) stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 850, {size: 34, weight: 500, color: '#C9D5D8', align: 'center', alpha: smooth((t - s24.start) / 0.5)});
    });
  },
};

function clipRectSimple(c, x, y, w, h, fn) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); try { fn(); } finally { c.restore(); } }
// air streak offset in the falling column: integral of the fall speed (so the streaks move at the droplet's speed)
function streakOffset(t, ctx) {
  const rel = evT(ctx, 'release'); if (t < rel) return 0;
  let s = 0; const dt = 1 / 30; for (let x = rel; x < t; x += dt) s += speedAt(x, ctx) * dt;
  return s * 18;    // px per cm in this 'very slow, enlarged' view
}
function speedAt(t, ctx) {
  const rel = evT(ctx, 'release'), shr = evT(ctx, 'shrink');
  if (t < rel) return 0;
  if (t < shr) return 30 * (1 - Math.exp(-(t - rel) / 1.0));
  const d = lerp(0.1, 0.02, smooth((t - shr) / 2.4)), vt = 1.19e8 * (d / 2 * 1e-3) ** 2 * 100;
  return Math.min(30, vt + (30 - vt) * Math.exp(-Math.max(0, t - shr - 1.2) / 0.7));
}
