// 49 HBM — 메모리를 왜 쌓을까
// Look grammar (2026-11-10): every moving thing is a link of the causal chain; one clock for world, gauges and sound;
// change one condition and keep an afterimage; only energy/signal glows. Warm = moving energy (bits = data signals, a
// working calculator, the charge filling a wire, heat). Cool = memory (the stacked DRAM dies, stored numbers).
// Matte filled bodies: GPU die, calculator cells, DRAM dies, base die, interposer, package, board, solder balls, bumps.
// Stage: one package cross-section — board, package substrate, silicon interposer, GPU die (its face = a grid of
// calculator cells), the HBM stack (base die + 12 DRAM dies). The 'board' scene is the same stage without the interposer
// (a separate graphics-memory package far away on the board). Plan views (stack, ai) are that stage seen from above.
// Film look (2026-11-22): charcoal background, fixed paper grain, soft bloom around lit() — config/look.json.
// HDR (2026-11-15): bits, working-cell cores, wire charge, TSV signals and heat are drawn inside lit(). Text over lit
// content gets the gain map blanked under it (unlitRect / uText — the 47 lesson).
// First moment (2026-11-16): 0–2.0 s the stack's bits pour over the interposer wires into the GPU and its waiting
// calculator cells light one by one while the camera pulls back from the stack; 2.2–3.0 s rewound.
// Time scales (computed below from the model constants, written in the kickers): see SCALE.
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, rand, line, circle, ring, rect, withAlpha, arrow, lit, ensureGain, progressBar,
} from '../../pipeline/render/index.mjs';

export const theme = 'film';
export const look = {background: {cx: 0.48, cy: 0.42}};   // 편마다 바꾸는 것은 밝은 곳의 자리뿐(세기는 config/look.json)
export const events = [];
export const captionLayout = {};

const W = 1080;
const PAL = {
  ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#232327',
  warm: '#FF7A22', warmHi: '#F5A066', cool: '#5BA8F0', coolHi: '#A9D2FA',
  board: '#2F3A33', boardHi: '#3D4A41', sub: '#4A4540', subHi: '#5C564F', inter: '#5B5F68', interHi: '#70747E', interLo: '#474A52',
  gpu: '#3A3B42', gpuHi: '#4C4D55', gpuLo: '#2C2D33', idle: '#2A2A30', busy: '#E6D8BE', busyLo: '#C9B998',
  dram: '#3F5E7C', dramHi: '#55789A', dramLo: '#2F4760', base: '#4B5260', baseHi: '#5D6575',
  ball: '#B7B2A8', ballLo: '#8C877E', bump: '#A9A49A', mold: '#2E2E33', moldHi: '#404047', copper: '#B8764A', copperHi: '#D08F60',
  lid: '#6B6E75', lidLo: '#50535A',
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const S = (ctx, id) => ctx.tl.sentence(id);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;
const evT = (ctx, id) => ctx.events.get(id).time;
function ticks(ctx, id) {
  const e = ctx.events.get(id), n = e.params?.repeat ?? 1, dt = e.params?.interval ?? 0;
  return Array.from({length: n}, (_, k) => e.time + k * dt);
}
const countUntil = (list, t) => { let n = 0; for (const x of list) if (x <= t) n++; return n; };

function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save(); gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.fillStyle = '#000'; gc.fillRect(x, y, w, h); gc.restore();
}
function panel(c, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 14, rgba(PAL.plate, a), rgba(PAL.border, 1), 2); }
/** 글 아래 빛 지도를 지우고 쓴다(빛 위에 얹히는 이름표 — 함께 밝아지지 않게). 화면 좌표(카메라 밖)에서 부른다. */
function uText(stage, s, x, y, o = {}) {
  const size = o.size || 28, w = s.length * size * 0.62 + 16, al = o.align || 'left';
  const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x - 8;
  unlitRect(stage, x0, y - size * 0.75, w, size * 1.5, 1);
  return stage.text(s, x, y, o);
}
function label(stage, s, x, y, o = {}) { uText(stage, s, x, y, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so, ...o}); }
function note(stage, s, x, y, o = {}) { uText(stage, s, x, y, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so, ...o}); }
function bigNum(stage, s, x, y, o = {}) { uText(stage, s, x, y, {role: 'display', size: 84, weight: 700, color: PAL.warmHi, align: 'center', ...so, ...o}); }

// =====================================================================================================
// 모형의 수치(출처 brief.md) — 머리글의 시간 배율도 여기서 계산한다
// =====================================================================================================
const M = {
  hbmGbps: 9.6,            // HBM3E 선 하나(Gb/s) — 비트 하나 0.104 ns
  gddrGbps: 21,            // GDDR6X 선 하나(Gb/s) — 비트 하나 0.048 ns
  gpuFlops: 82.6e12, gpuBps: 1008e9, numBytes: 4,          // 한 게임용 GPU(2022): 숫자 하나에 328번
  pjHBM: 3.9, pjGDDR: 14.0,                                // HBM2 대 GDDR5 (2017 측정)
  tokMs: 24,               // 80 GB 를 3.35 TB/s 로 읽는 시간(약 24 ms) — "수십 밀리초"
};
M.opsPerNum = M.gpuFlops / (M.gpuBps / M.numBytes);        // ≈ 327.7
const BIT_P = 0.25;        // hook·close: 화면에서 비트 사이 간격(초) = 비트 하나
const NUM_VIS = 2.5;       // essence: 숫자 하나가 오는 데 화면에서 2.5초
const CHG_VIS = 1.4;       // board·interposer: 비트 하나를 채웠다 비우는 데 화면에서
const TOK_VIS = 1.45;      // ai: 낱말 한 조각
const fmtSlow = x => { const e = Math.floor(Math.log10(x)); const m = x / 10 ** e; if (e >= 12) return `${Math.round(x / 1e12).toLocaleString('en-US')}조`; if (e >= 8) return `${Math.round(x / 1e8)}억`; if (e >= 4) return `${Math.round(x / 1e4)}만`; return `${Math.round(x)}`; };
export const SCALE = {
  hook: {realNs: 2.0 / BIT_P / M.hbmGbps, slow: BIT_P / (1 / (M.hbmGbps * 1e9))},           // 2초 = 비트 8개 = 0.83 ns
  num: {realPs: M.numBytes / M.gpuBps * 1e12, slow: NUM_VIS / (M.numBytes / M.gpuBps)},       // 3.97 ps → 2.5 s
  chgL: {realNs: 1 / M.gddrGbps, slow: CHG_VIS / (1 / (M.gddrGbps * 1e9))},
  chgS: {realNs: 1 / M.hbmGbps, slow: CHG_VIS / (1 / (M.hbmGbps * 1e9))},
  tok: {slow: TOK_VIS / (M.tokMs / 1000)},
};
const K = {
  hook: `실제 약 ${SCALE.hook.realNs.toFixed(1)}나노초 · ${fmtSlow(SCALE.hook.slow)} 배 느리게`,
  num: `실제 약 ${SCALE.num.realPs.toFixed(0)}피코초 · ${fmtSlow(SCALE.num.slow)} 배 느리게`,
  chgL: `비트 하나 약 ${SCALE.chgL.realNs.toFixed(2)}나노초 · ${fmtSlow(SCALE.chgL.slow)} 배 느리게 · 설명 모형`,
  chgS: `비트 하나 약 ${SCALE.chgS.realNs.toFixed(2)}나노초 · ${fmtSlow(SCALE.chgS.slow)} 배 느리게`,
  tok: `한 조각에 실제 수십 밀리초 · 약 ${Math.round(SCALE.tok.slow / 10) * 10}배 느리게`,
};

// =====================================================================================================
// 카메라
// =====================================================================================================
const CAM_FULL = {cx: 540, cy: 960, z: 1, sy: 960};
const CAM_HOOK0 = {cx: 690, cy: 760, z: 1.62, sy: 860};
const CAM_STACK = {cx: 760, cy: 760, z: 1.3, sy: 720};
function withCam(stage, cam, fn) {
  const c = stage.ctx; c.save();
  c.translate(540 - cam.cx * cam.z, (cam.sy ?? 960) - cam.cy * cam.z); c.scale(cam.z, cam.z);
  try { fn(); } finally { c.restore(); }
}
const toScreen = (cam, p) => [540 + (p[0] - cam.cx) * cam.z, (cam.sy ?? 960) + (p[1] - cam.cy) * cam.z];
const camMix = (a, b, q) => ({cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), q)), sy: lerp(a.sy ?? 960, b.sy ?? 960, q)});

// =====================================================================================================
// 무대: 패키지 단면(세계 좌표 = 카메라 1배일 때 화면 좌표)
// =====================================================================================================
const G = {
  pcbY: 1112, pcbH: 52, subX0: 80, subX1: 1000, subY: 1062, subH: 32, ballY: 1102,
  intX0: 120, intX1: 960, intY: 960, intH: 72,
  gpuX0: 140, gpuX1: 592, gpuY0: 500, gpuY1: 944,
  hbmX0: 652, hbmX1: 934, baseY0: 904, baseY1: 944, dieH: 26, dieGap: 4, NL: 12,
};
G.cellX0 = G.gpuX0 + 22; G.cellX1 = G.gpuX1 - 22; G.cellY0 = G.gpuY0 + 22; G.cellY1 = G.gpuY1 - 52;   // 아래 띠 = 메모리 제어부
const dieTop = i => G.baseY0 - (i + 1) * (G.dieH + G.dieGap) + G.dieGap;   // i = 0 맨 아래 DRAM 칩
// 선 24줄(1,024선의 대표): HBM 범프 x_h(k) ↔ GPU 범프 x_g(k), 깊이 y_k. 안쪽 쌍이 얕게 — 겹치지 않는 U 꼴
const NW = 24;
const wireX = k => ({h: G.hbmX0 + 14 + k * 10.5, g: G.gpuX1 - 14 - k * 10.5, y: G.intY + 8 + k * 2.6});
function wirePath(k) { const w = wireX(k); return [[w.h, G.baseY1], [w.h, w.y], [w.g, w.y], [w.g, G.gpuY1]]; }
const wireLen = k => { const p = wirePath(k); let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
function along(path, u) {      // u 0..1 by length
  let L = 0; const seg = []; for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); L += l; }
  let d = clamp(u) * L;
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const q = seg[i] ? d / seg[i] : 0; return [lerp(path[i][0], path[i + 1][0], q), lerp(path[i][1], path[i + 1][1], q)]; } d -= seg[i]; }
  return path[path.length - 1];
}
// 계산기 칸 격자
function cellRect(j, n) {
  const cols = n, rows = n, cw = (G.cellX1 - G.cellX0) / cols, ch = (G.cellY1 - G.cellY0) / rows;
  const i = j % cols, r = Math.floor(j / cols);
  return [G.cellX0 + i * cw + 2, G.cellY0 + r * ch + 2, cw - 4, ch - 4];
}
const ORDER = (() => { const a = Array.from({length: 144}, (_, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(i * 3.7 + 11) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();

function drawBoard(c, x0 = -300, x1 = 1380) {
  rect(c, x0, G.pcbY, x1 - x0, G.pcbH, 0, PAL.board); rect(c, x0, G.pcbY, x1 - x0, 6, 0, PAL.boardHi);
}
function drawSubstrate(c, x0 = G.subX0, x1 = G.subX1, a = 1) {
  withAlpha(c, a, () => {
    for (let x = x0 + 16; x < x1 - 8; x += 34) circle(c, x, G.ballY, 10, PAL.ballLo), circle(c, x - 2, G.ballY - 2, 6, PAL.ball);
    rect(c, x0, G.subY, x1 - x0, G.subH, 4, PAL.sub); rect(c, x0, G.subY, x1 - x0, 5, 4, PAL.subHi);
  });
}
function drawInterposer(c, a = 1, x0 = G.intX0, x1 = G.intX1) {
  withAlpha(c, a, () => {
    for (let x = x0 + 12; x < x1 - 6; x += 24) circle(c, x, G.intY + G.intH + 8, 6, PAL.bump);
    rect(c, x0, G.intY, x1 - x0, G.intH, 3, PAL.inter); rect(c, x0, G.intY, x1 - x0, 5, 3, PAL.interHi);
  });
}
function drawWires(c, a = 1, n = NW) {        // 판 속 선(무광) — 신호·전하는 따로 lit
  withAlpha(c, a, () => { for (let k = 0; k < n; k++) line(c, wirePath(k), rgba('#2E3036', 0.95), 1.6, {cap: 'butt'}); });
}
function drawMicroBumps(c, x0, x1, y, a = 1) { withAlpha(c, a, () => { for (let x = x0 + 5; x < x1 - 3; x += 10.5) circle(c, x, y, 3.2, PAL.bump); }); }
/** GPU 다이: 앞면 = 계산기 칸 격자. busy(j) 0..1. n = 한 줄 칸 수 */
function drawGPU(stage, busy = () => 0, o = {}) {
  const c = stage.ctx, n = o.n ?? 12, a = o.a ?? 1;
  withAlpha(c, a, () => {
    drawMicroBumps(c, G.gpuX0, G.gpuX1, G.gpuY1 + 8);
    rect(c, G.gpuX0, G.gpuY0, G.gpuX1 - G.gpuX0, G.gpuY1 - G.gpuY0, 8, PAL.gpu, rgba('#000', 0.4), 2);
    rect(c, G.gpuX0 + 4, G.gpuY0 + 4, G.gpuX1 - G.gpuX0 - 8, 8, 4, PAL.gpuHi);
    rect(c, G.gpuX0 + 14, G.cellY1 + 10, G.gpuX1 - G.gpuX0 - 28, 26, 5, PAL.gpuLo);    // 메모리 제어부
    for (let j = 0; j < n * n; j++) {
      const [x, y, w, h] = cellRect(j, n), b = clamp(busy(j));
      rect(c, x, y, w, h, Math.min(5, w * 0.15), mix(PAL.idle, PAL.busy, b));
      if (b > 0.05) rect(c, x + 2, y + 2, w - 4, Math.max(2, h * 0.18), 2, rgba('#FFFFFF', 0.12 * b));
    }
  });
  // 일하는 칸 안의 작은 점화(신호) — lit
  lit(stage, cc => {
    for (let j = 0; j < n * n; j++) {
      const b = clamp(busy(j)); if (b < 0.05) continue;
      const [x, y, w, h] = cellRect(j, n), r = Math.min(w, h) * 0.16;
      circle(cc, x + w / 2, y + h / 2, r, rgba(PAL.warm, 0.9 * b * a)); circle(cc, x + w / 2, y + h / 2, r * 0.5, rgba(CORE(PAL.warm), b * a));
    }
  }, {gain: 0.45});
}
/** HBM 기둥: 바탕 다이 + DRAM 칩 nl 장(소수점이면 맨 위 칩이 내려오는 중). heat(i) 0..1(칩 i 의 데워짐) */
function drawStack(stage, o = {}) {
  const c = stage.ctx, nl = o.nl ?? G.NL, a = o.a ?? 1, dx = o.dx ?? 0, heat = o.heat || (() => 0), tsv = o.tsv ?? 0;
  const x0 = G.hbmX0 + dx, x1 = G.hbmX1 + dx, w = x1 - x0;
  withAlpha(c, a, () => {
    drawMicroBumps(c, x0, x1, G.baseY1 + 8);
    rect(c, x0, G.baseY0, w, G.baseY1 - G.baseY0, 4, mix(PAL.base, '#8A5A3C', heat(-1)), rgba('#000', 0.35), 1.5);
    rect(c, x0 + 3, G.baseY0 + 3, w - 6, 5, 2, PAL.baseHi);
    const full = Math.floor(nl), frac = nl - full;
    for (let i = 0; i < Math.ceil(nl - 1e-6) && i < G.NL; i++) {
      const drop = i === full ? (1 - easeInOut(frac)) * 160 : 0, al = i === full ? smooth(frac * 3) : 1;
      const y = dieTop(i) - drop;
      withAlpha(c, al, () => {
        drawMicroBumps(c, x0, x1, y + G.dieH + 2, 0.9);
        rect(c, x0, y, w, G.dieH, 3, mix(PAL.dram, '#8A5A3C', heat(i)), rgba('#000', 0.35), 1.2);
        rect(c, x0 + 3, y + 3, w - 6, 4, 2, mix(PAL.dramHi, '#A87050', heat(i)));
        if (tsv > 0) withAlpha(c, tsv, () => { for (let q = 0; q < 8; q++) { const tx = x0 + 22 + q * (w - 44) / 7; rect(c, tx - 2.5, y, 5, G.dieH, 1, PAL.copper); } });
      });
    }
    if (o.lid) withAlpha(c, o.lid, () => { const ty = dieTop(G.NL - 1) - 28; rect(c, x0 - 10, ty, w + 20, 22, 4, PAL.lid); rect(c, x0 - 10, ty, w + 20, 5, 4, '#80838A'); });
  });
}
// 비트(신호) 흐름: 선 k 에서 t0 부터 P 마다 출발, 속도 v(px/s), 출발은 tEnd 까지
function bitsOnWires(stage, t, o) {
  const {t0, tEnd = Infinity, P = BIT_P, v = 900, n = NW, a = 1, rev = false} = o;
  if (a <= 0) return;
  lit(stage, cc => {
    for (let k = 0; k < n; k++) {
      const path = wirePath(k), L = wireLen(k), T = L / v, off = (k % 6) * 0.04 + rand(k) * 0.05;
      const first = t0 + off, last = Math.min(tEnd, t - 0.0001);
      const m0 = Math.max(0, Math.ceil((t - T - first) / P)), m1 = Math.floor((last - first) / P);
      for (let m = m0; m <= m1; m++) {
        const te = first + m * P, u = (t - te) / T; if (u < 0 || u > 1) continue;
        const [x, y] = along(path, rev ? 1 - u : u);
        circle(cc, x, y, 5.2, rgba(PAL.warm, 0.95 * a)); circle(cc, x, y, 2.6, rgba(CORE(PAL.warm), a));
      }
    }
  }, {gain: 0.8});
}
// 비트 도착 시각들(정렬) — hook·close 의 칸 켜짐
function arrivals(t0, tEnd, P = BIT_P, v = 900, n = NW) {
  const out = []; tEnd = Math.min(tEnd, t0 + 1.5);   // 칸 144개를 채우는 데 필요한 만큼
  for (let k = 0; k < n; k++) { const T = wireLen(k) / v, first = t0 + (k % 6) * 0.04 + rand(k) * 0.05; for (let te = first; te <= tEnd; te += P) out.push(te + T); }
  return out.sort((x, y) => x - y);
}
const HOOK_ARR = arrivals(0.05, 1.55);
function busyFromArrivals(arr, tau, n = 144) { return j => { const k = ORDER.indexOf(j); if (k < 0 || k >= arr.length) return 0; return smooth((tau - arr[k]) / 0.12); }; }

/** 선 전체가 채워졌다 비워지는 전하(비트 하나) — path 를 따라 q(0..1) 만큼 차고, e(0..1) 로 사라짐 */
function chargePath(stage, path, q, e, col = PAL.warm, wdt = 5) {
  if (q <= 0 || e <= 0) return;
  let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  const pts = []; const N = 40; for (let s = 0; s <= N; s++) pts.push(along(path, s / N * q));
  lit(stage, cc => { line(cc, pts, rgba(col, 0.85 * e), wdt); line(cc, pts, rgba(CORE(col), e), wdt * 0.4); }, {gain: 0.6});
}

// =====================================================================================================
// 포스터(0초 프레임 = 썸네일): 흰 물음 위, 주제어(HBM)가 가장 크게. 시리즈 아님. 답은 쓰지 않는다.
// =====================================================================================================
const POSTER = {q: ['메모리 칩을 12층으로', '왜 쌓아 올릴까?'], a: 'HBM', qy: 178, ay: 402, QS: 60, AS: 170};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 0.45 + 30;
  if (q < 1) unlitRect(stage, 0, 100, W, yBot - 100, 1);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.5)'); g.addColorStop(0.85, 'rgba(9,9,11,0.5)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 46, q), LH = POSTER.QS * 1.3 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else withAlpha(c, 1 - smooth((q - 0.55) / 0.45), () => stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 960}));
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.ay, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa}));
}
const MORPH = tl => [tl.sentence('s01').end + 0.1, tl.sentence('s01').end + 0.9];

// =====================================================================================================
// 머리글
// =====================================================================================================
function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx;
  if (Math.max(kicker ? aK : 0, title ? aT : 0) > 0.01) unlitRect(stage, 0, 118, W, 150, 1);
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 29, color: PAL.warmHi, align: 'center', tracking: 1, maxWidth: 980, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: PAL.ink, align: 'center', maxWidth: 980, ...so}));
}
function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2] === cur[2] ? '' : prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, k > 0 && prev[2] !== cur[2] ? a * inn : a);
}
function titleList(id, ctx) {
  const a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, K.hook], [2.2, '되감기'], [3.1, `같은 일 다시 · ${K.hook}`, 'HBM — 고대역폭 메모리']];
    case 'origin': return [[-Infinity, '개념도 · 해마다를 몇 초로', '계산기는 늘고, 선은 그대로'], [W0(ctx, 's03', '메모리 벽', -0.3), '개념도 · 해마다를 몇 초로', '메모리 벽 — 1994'], [a('s04'), '연도', 'HBM — 2013 표준, 2015 첫 그래픽 카드']];
    case 'essence': return [[-Infinity, '선 4줄 · 아주 느리게', '숫자를 기다리는 계산기'], [a('s06'), K.num, '숫자 하나 = 계산 328번'], [a('s07'), '선의 수만 바꿈 · 같은 빠르기', '대역폭 = 선의 수 × 선 하나의 빠르기'], [a('s08'), `크기 과장 · ${K.hook}`, '쌓고, 옆에, 짧고 많은 선']];
    case 'board': return [[-Infinity, '보통 그래픽 메모리 · 크기 과장', '기판 위, 따로 포장'], [a('s10'), '보통 그래픽 메모리 · 크기 과장', '땜납 구슬 0.75 mm'], [a('s11'), K.chgL, '긴 선은 채울 전하가 많다']];
    case 'interposer': return [[-Infinity, '크기 과장', '인터포저 — 실리콘 판'], [a('s13'), '같은 자로 확대', '접점이 10배 넘게 촘촘'], [a('s14'), '1,024선을 24줄로 그림', '한 덩이에 데이터 선 1,024개'], [a('s15'), K.chgS, '짧은 선은 전하가 적다'], [a('s16'), `${K.hook}`, '한 덩이 1초에 1.2 TB']];
    case 'stack': return [[-Infinity, '위에서 본 판 · 크기 과장', 'GPU 옆자리는 몇 곳뿐'], [ctx.events.get('die').time - 0.6, '만드는 순서 · 시간 생략', '같은 자리에 위로 쌓는다'], [a('s18'), '칩 한 장 확대 · 크기 과장', '실리콘 관통 전극 · TSV'], [a('s19'), '2024 · 대량 생산', '열두 층']];
    case 'tradeoff': return [[-Infinity, '열의 길 · 설명 모형 · 시간 줄임', '아래층의 열은 위로'], [a('s21'), '구멍 수천 개를 층마다', '맞춰 쌓기가 까다롭다']];
    case 'ai': return [[-Infinity, `위에서 본 판 · ${K.tok}`, '낱말 한 조각마다 모두 다시 읽기'], [a('s23'), `위에서 본 판 · ${K.tok}`, '한 인공지능용 GPU — HBM 다섯 덩이']];
    case 'close': return [[-Infinity, '정리', '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1200, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.15, 'rgba(8,8,10,0.45)'); g.addColorStop(0.4, 'rgba(8,8,10,0.4)'); g.addColorStop(0.65, 'rgba(8,8,10,0.12)'); g.addColorStop(1, 'rgba(8,8,10,0.12)'); c.fillStyle = g; c.fillRect(0, 1200, W, 720); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }

/** 멀리 있는 메모리(origin·essence 의 개념도) — 오른쪽 끝 */
function farMem(stage) {
  const c = stage.ctx; rect(c, 968, 880, 150, 70, 6, PAL.dram, rgba('#000', 0.35), 2); rect(c, 968, 880, 150, 6, 4, PAL.dramHi);
  stage.text('메모리', 1000, 915, {size: 26, weight: 700, color: PAL.ink});
}
// =====================================================================================================
// 장면별 상태
// =====================================================================================================
function hookTau(t) {                 // 결과 먼저(0~2) → 되감기(2.2~3.0) → 0
  if (t < 2.2) return Math.min(t, 2.0);
  if (t < 3.0) return 2.0 * (1 - easeInOut((t - 2.2) / 0.8));
  return 0;
}
function packageScene(stage, t, o = {}) {
  const c = stage.ctx;
  drawBoard(c); drawSubstrate(c); drawInterposer(c, o.inter ?? 1); drawWires(c, o.inter ?? 1);
  drawStack(stage, {nl: o.nl ?? G.NL, a: o.hbm ?? 1, dx: o.hbmDx ?? 0, heat: o.heat, tsv: o.tsv ?? 0, lid: o.lid});
  drawGPU(stage, o.busy || (() => 0), {n: o.n ?? 12});
}
/** 기판 장면: 인터포저 없이 GPU 포장과 멀리 놓인 그래픽 메모리 포장, 긴 기판 선 4줄 */
const BD = {gpuSubX0: 110, gpuSubX1: 622, memX0: 808, memX1: 1000, memY0: 1010, memY1: 1062};
const bwPath = k => { const xg = 560 - k * 26, xm = 836 + k * 30, y = G.pcbY + 14 + k * 9; return [[xm, G.ballY], [xm, y], [xg, y], [xg, G.ballY]]; };
function boardScene(stage, t, o = {}) {
  const c = stage.ctx, a = o.mem ?? 1;
  drawBoard(c);
  drawSubstrate(c, BD.gpuSubX0, BD.gpuSubX1);
  rect(c, BD.gpuSubX0 + 10, G.gpuY1 + 14, BD.gpuSubX1 - BD.gpuSubX0 - 20, G.subY - G.gpuY1 - 14, 4, PAL.sub); rect(c, BD.gpuSubX0 + 10, G.gpuY1 + 14, BD.gpuSubX1 - BD.gpuSubX0 - 20, 5, 4, PAL.subHi);
  withAlpha(c, a, () => {
    for (let x = BD.memX0 + 16; x < BD.memX1 - 8; x += 34) circle(c, x, G.ballY, 10, PAL.ballLo), circle(c, x - 2, G.ballY - 2, 6, PAL.ball);
    rect(c, BD.memX0, BD.memY1 - 10, BD.memX1 - BD.memX0, 30, 3, PAL.sub);
    rect(c, BD.memX0 + 6, BD.memY0, BD.memX1 - BD.memX0 - 12, BD.memY1 - BD.memY0, 5, PAL.mold); rect(c, BD.memX0 + 6, BD.memY0, BD.memX1 - BD.memX0 - 12, 6, 5, PAL.moldHi);
    rect(c, BD.memX0 + 40, BD.memY0 + 16, BD.memX1 - BD.memX0 - 80, 18, 3, PAL.dram);
    for (let k = 0; k < 4; k++) line(c, bwPath(k), rgba('#1E2622', 1), 3, {cap: 'butt'});
  });
  drawGPU(stage, o.busy || (() => 0), {n: 12});
}

// =====================================================================================================
// 위에서 본 판(stack·ai)
// =====================================================================================================
const PV = {gx: 330, gy: 530, gw: 420, gh: 420, sw: 150, sh: 118};
const SITES = [[PV.gx - PV.sw - 26, PV.gy + 14], [PV.gx - PV.sw - 26, PV.gy + 151], [PV.gx - PV.sw - 26, PV.gy + 288], [PV.gx + PV.gw + 26, PV.gy + 14], [PV.gx + PV.gw + 26, PV.gy + 151], [PV.gx + PV.gw + 26, PV.gy + 288]];
function planView(stage, o = {}) {
  const c = stage.ctx, {fill = [], busy = 0, hide = []} = o;
  rect(c, PV.gx - PV.sw - 60, PV.gy - 40, PV.gw + 2 * PV.sw + 120, PV.gh + 80, 10, PAL.inter, rgba('#000', 0.35), 2);
  rect(c, PV.gx - PV.sw - 60, PV.gy - 40, PV.gw + 2 * PV.sw + 120, 6, 6, PAL.interHi);
  rect(c, PV.gx, PV.gy, PV.gw, PV.gh, 8, PAL.gpu, rgba('#000', 0.4), 2);
  const n = 12, cw = (PV.gw - 40) / n;
  for (let j = 0; j < n * n; j++) { const i = j % n, r = Math.floor(j / n); const b = clamp(typeof busy === 'function' ? busy(j) : busy); rect(c, PV.gx + 20 + i * cw + 1.5, PV.gy + 20 + r * cw + 1.5, cw - 3, cw - 3, 3, mix(PAL.idle, PAL.busy, b)); }
  SITES.forEach(([x, y], s) => {
    if (hide.includes(s)) return;
    const f = clamp(fill[s] ?? 0);
    rect(c, x, y, PV.sw, PV.sh, 6, null, rgba(PAL.muted, 0.6 * (1 - f) + 0.1), 2);
    if (f > 0) withAlpha(c, f, () => { rect(c, x, y, PV.sw, PV.sh, 6, PAL.dram, rgba('#000', 0.35), 2); rect(c, x + 4, y + 4, PV.sw - 8, 8, 4, PAL.dramHi); for (let q = 0; q < 4; q++) rect(c, x + 14, y + 26 + q * 21, PV.sw - 28, 12, 3, rgba(PAL.dramLo, 0.9)); });
  });
}
function planStream(stage, t, sites, t0, a = 1) {      // 기둥 → GPU 로 흐르는 비트(위에서)
  lit(stage, cc => {
    for (const s of sites) {
      const [x, y] = SITES[s], left = x < PV.gx, sx = left ? x + PV.sw : x, ex = left ? PV.gx : PV.gx + PV.gw;
      for (let r = 0; r < 6; r++) {
        const yy = y + 14 + r * 18;
        for (let m = 0; m < 3; m++) { if (t < t0) continue; const u = ((t - t0) * 1.4 + m / 3 + r * 0.13) % 1; const xx = lerp(sx, ex, u); circle(cc, xx, yy, 4, rgba(PAL.warm, 0.9 * a)); circle(cc, xx, yy, 2, rgba(CORE(PAL.warm), a)); }
      }
    }
  }, {gain: 0.7});
}

// =====================================================================================================
export const scenes = {
  // ---------------------------------------------------------------- hook: 결과 먼저 → 되감기 → 이름
  hook(stage, t, p, ctx) {
    const tau = hookTau(t), s02 = S(ctx, 's02').start;
    const cam = t < 2.0 ? camMix(CAM_HOOK0, CAM_FULL, easeInOut(t / 2.0)) : CAM_FULL;
    // 3.4 초부터 다시 흐름(이번엔 계속)
    const t2 = 3.4, arr2 = arrivals(t2, 1e9);
    const busy = t < 3.0 ? busyFromArrivals(HOOK_ARR, tau) : busyFromArrivals(arr2, t);
    withCam(stage, cam, () => {
      packageScene(stage, t, {busy});
      if (t < 2.2) bitsOnWires(stage, tau, {t0: 0.05, tEnd: 1.55});
      else if (t < 3.0) bitsOnWires(stage, tau, {t0: 0.05, tEnd: 1.55, a: 1 - (t - 2.2) / 0.8});
      else bitsOnWires(stage, t, {t0: t2});
    });
    const la = fadeIn(t, W0(ctx, 's02', '고 대역폭', -0.2), 0.5);
    if (la > 0) withAlpha(stage.ctx, la, () => {
      const [x, y] = toScreen(cam, [(G.hbmX0 + G.hbmX1) / 2, dieTop(G.NL - 1) - 40]);
      label(stage, 'HBM', x, y - 34, {size: 40, color: PAL.coolHi});
      note(stage, 'High Bandwidth Memory', x - 40, y + 6, {size: 26});
      label(stage, 'GPU', 366, 470, {size: 34});
    });
  },
  // ---------------------------------------------------------------- origin: 계산기는 늘고, 선은 그대로 → 메모리 벽 → 2013·2015
  origin(stage, t, p, ctx) {
    const c = stage.ctx, g1 = evT(ctx, 'grow1'), g2 = evT(ctx, 'grow2'), y15 = evT(ctx, 'y2015'), y13 = evT(ctx, 'y2013');
    const n = t < g1 ? 3 : t < g2 ? 6 : 12, N = n * n, slide = easeInOut((t - y15) / 1.2);
    // 선 4줄(메모리는 화면 밖 오른쪽) — 비트가 일정한 박자로 도착, 도착한 칸은 1.2초 일함
    const P = 0.3, D = 1.2, tA = S(ctx, 's03').start - 1.4;
    const DT = P / 4, FLY = 1.0, arrAt = m => tA + m * DT;           // 도착 열 하나: 칸·계기·보이는 비트가 함께 쓴다
    const arr = []; for (let m = 0; arrAt(m) <= t + 1e-6; m++) arr.push(arrAt(m));
    const slots = new Map();
    arr.forEach((ta, m) => { const j = Math.floor(rand(m * 1.37 + n) * N); if (t - ta < D) slots.set(j, Math.max(slots.get(j) || 0, smooth((t - ta) / 0.1) * (1 - smooth((t - ta - D + 0.2) / 0.2)))); });
    const after = slide > 0 ? busyFromArrivals(arrivals(y15 + 0.3, 1e9), t, 144) : null;   // 아래 bitsOnWires 와 같은 t0
    const busy = j => Math.max(slots.get(j) || 0, after ? after(j) : 0);
    withCam(stage, CAM_FULL, () => {
      drawBoard(c); drawSubstrate(c); drawInterposer(c, 1); drawWires(c, slide);
      // 좁은 버스 4줄(멀리 있는 메모리에서)
      withAlpha(c, 1 - slide, () => { for (let q = 0; q < 4; q++) line(c, [[1100, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.gpuY1]], rgba('#2E3036', 1), 2.2, {cap: 'butt'}); farMem(stage); });
      if (slide > 0) drawStack(stage, {dx: (1 - slide) * 520});
      drawGPU(stage, busy, {n});
      lit(stage, cc => {
        if (slide >= 1) return;
        // 지금 날아오는 비트 = 도착 시각이 (t, t + FLY] 인 것(상한 없음). m 번째 비트가 arr[m] 에 칸 하나를 켠다
        for (let m = Math.max(0, Math.ceil((t - tA) / DT - 1e-6)); arrAt(m) <= t + FLY; m++) {
          const q = m % 4, u = (t - (arrAt(m) - FLY)) / FLY; if (u < 0 || u > 1) continue;
          const pth = [[1100, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.gpuY1]];
          const [x, y] = along(pth, u); circle(cc, x, y, 5, rgba(PAL.warm, 0.95 * (1 - slide))); circle(cc, x, y, 2.5, rgba(CORE(PAL.warm), 1 - slide));
        }
      }, {gain: 0.8});
      if (slide > 0) bitsOnWires(stage, t, {t0: y15 + 0.3, a: slide});
    });
    // 일하는 칸 비율 계기 — 앞 단계 값은 잔상
    let on = 0; for (let j = 0; j < N; j++) on += busy(j) > 0.5 ? 1 : 0;
    const frac = on / N, gx = 640, gy = 420;
    panel(c, gx - 20, gy - 50, 380, 120);
    stage.text('일하는 계산기', gx, gy - 18, {size: 26, weight: 500, color: PAL.muted});
    rect(c, gx, gy + 12, 340, 22, 6, rgba('#000', 0.35));
    rect(c, gx, gy + 12, 340 * frac, 22, 6, PAL.busyLo);
    stage.text(`${Math.round(frac * 100)}%`, gx + 340, gy - 18, {size: 30, weight: 700, color: PAL.ink, align: 'right'});
    stage.text(`계산기 ${N}칸`, 160, gy - 18, {size: 28, weight: 700, color: PAL.ink});
    stage.text(slide > 0.5 ? '선 1,024개(그림 24줄)' : '메모리 선 그대로', 160, gy + 22, {size: 26, weight: 500, color: PAL.muted});
    const yrA = fadeIn(t, y13, 0.4);
    if (yrA > 0) withAlpha(c, yrA, () => {
      line(c, [[160, 1236], [920, 1236]], rgba(PAL.muted, 0.7), 2);
      [[1994, 220, evT(ctx, 'wall')], [2013, 640, y13], [2015, 820, y15]].forEach(([y, x, tt]) => withAlpha(c, fadeIn(t, tt, 0.3), () => { line(c, [[x, 1226], [x, 1246]], PAL.ink, 3); stage.text(String(y), x, 1206, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so}); }));
    });
  },
  // ---------------------------------------------------------------- essence
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s06 = S(ctx, 's06').start, s07 = S(ctx, 's07').start, s08 = S(ctx, 's08').start;
    const sp = ticks(ctx, 'sparse');
    const sparseBusy = j => { let b = 0; sp.forEach((ta, m) => { if (ORDER[(m * 37) % 144] === j) b = Math.max(b, smooth((t - ta) / 0.1) * (1 - smooth((t - ta - 0.35) / 0.15))); }); return b; };
    const coreA = fadeIn(t, s08 - 0.3, 0.8);
    const coreBusy = busyFromArrivals(arrivals(s08 - 0.2, 1e9), t);   // 아래 bitsOnWires 와 같은 t0
    withCam(stage, CAM_FULL, () => {
      drawBoard(c); drawSubstrate(c); drawInterposer(c, 1); drawWires(c, coreA);
      withAlpha(c, 1 - coreA, () => { for (let q = 0; q < 4; q++) line(c, [[1100, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.gpuY1]], rgba('#2E3036', 1), 2.2, {cap: 'butt'}); farMem(stage); });
      if (coreA > 0) drawStack(stage, {dx: (1 - coreA) * 520});
      drawGPU(stage, j => Math.max(t < s06 + 0.3 ? sparseBusy(j) : 0, coreA > 0 ? coreBusy(j) : 0), {n: 12});
      // s05: 드문드문 오는 비트
      if (t < s06 + 0.3) lit(stage, cc => {
        sp.forEach(ta => { const u = (t - (ta - 0.9)) / 0.9; if (u < 0 || u > 1) return; const q = Math.floor(rand(ta) * 4), pth = [[1100, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.intY + 20 + q * 10], [G.gpuX1 - 30 - q * 12, G.gpuY1]]; const [x, y] = along(pth, u); circle(cc, x, y, 5, rgba(PAL.warm, 0.95)); circle(cc, x, y, 2.5, CORE(PAL.warm)); });
      }, {gain: 0.8});
      if (coreA > 0) bitsOnWires(stage, t, {t0: s08 - 0.2, a: coreA});
    });
    if (t < s06 - 0.2) {
      let on = 0; for (let j = 0; j < 144; j++) on += sparseBusy(j) > 0.5 ? 1 : 0;
      label(stage, `일하는 칸 ${on} / 144`, 366, 450, {size: 30});
      note(stage, '나머지는 숫자를 기다림', 366, 488);
    }
    // s06: 숫자 하나가 오는 동안 계산 328번 — 위 판
    const pa = fadeIn(t, s06 - 0.2, 0.4) * fadeOut(t, s07 - 0.3, 0.3);
    if (pa > 0) withAlpha(c, pa, () => {
      unlitRect(stage, 60, 300, 960, 560, pa);
      panel(c, 60, 300, 960, 560, 0.96);
      const a1 = evT(ctx, 'num1'), r1 = evT(ctx, 'arr1'), r2 = evT(ctx, 'arr2'), y = 520;
      rect(c, 100, y - 70, 170, 140, 10, PAL.dram, rgba('#000', 0.35), 2); stage.text('메모리', 185, y, {size: 30, weight: 700, color: PAL.ink, align: 'center'});
      rect(c, 760, y - 90, 220, 180, 10, PAL.gpu, rgba('#000', 0.4), 2);
      for (let i = 0; i < 4; i++) for (let r = 0; r < 3; r++) rect(c, 778 + i * 48, y - 72 + r * 52, 42, 46, 4, mix(PAL.idle, PAL.busy, 0.9));
      line(c, [[270, y], [760, y]], rgba('#2E3036', 1), 3);
      // 32비트 한 덩이: 출발 a1 → 도착 r1, 다음 r1 → r2
      const seg = t < r1 ? [a1, r1] : [r1, r2];
      const u = clamp((t - seg[0]) / (seg[1] - seg[0]));
      lit(stage, cc => { for (let b = 0; b < 32; b++) { const x = lerp(270 - 32 * 13, 760, u) + b * 13; if (x < 270 || x > 760) continue; circle(cc, x, y, 5.5, rgba(PAL.warm, 0.95)); circle(cc, x, y, 2.6, CORE(PAL.warm)); } }, {gain: 0.8});
      const cnt = Math.min(328, Math.floor(328 * clamp((t - seg[0]) / (seg[1] - seg[0]))));
      lit(stage, cc => { for (let i = 0; i < 4; i++) for (let r = 0; r < 3; r++) { const on = (Math.floor(t * 10) + i + r) % 2; circle(cc, 778 + i * 48 + 21, y - 72 + r * 52 + 23, 6, rgba(PAL.warm, 0.6 + 0.4 * on)); } }, {gain: 0.4});
      unlitRect(stage, 300, 330, 480, 120, 1);
      stage.text(`${cnt}`, 540, 390, {role: 'display', size: 96, weight: 700, color: PAL.warmHi, align: 'center'});
      stage.text('번 계산하는 동안', 540, 450, {size: 30, weight: 500, color: PAL.muted, align: 'center'});
      stage.text('숫자 하나(4바이트)', 515, y + 50, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
      stage.text('RTX 4090 (2022) · 그래픽 메모리 GDDR6X — HBM 아님', 540, 700, {size: 27, weight: 500, color: PAL.ink, align: 'center'});
      stage.text('82.6조 번/초 ÷ (1,008 GB/s ÷ 4바이트) ≈ 328', 540, 748, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
      stage.text('최대 성능끼리의 비 · 설명 모형', 540, 800, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
    });
    // s07: 선 4줄 → 16줄(같은 빠르기), 박자마다 도착 비트 수
    const ba = fadeIn(t, s07 - 0.2, 0.4) * fadeOut(t, s08 - 0.3, 0.3);
    if (ba > 0) withAlpha(c, ba, () => {
      unlitRect(stage, 60, 300, 960, 560, ba);
      panel(c, 60, 300, 960, 560, 0.96);
      const w16 = evT(ctx, 'w16'), nW = t < w16 - 0.3 ? 4 : 16, y0 = 360, hgt = 330;
      for (let q = 0; q < nW; q++) { const yy = y0 + (q + 0.5) * hgt / nW; line(c, [[150, yy], [880, yy]], rgba('#2E3036', 1), 2.5); }
      rect(c, 100, y0 - 10, 50, hgt + 20, 6, PAL.dram); rect(c, 880, y0 - 10, 60, hgt + 20, 6, PAL.gpu);
      stage.text('메모리', 125, y0 + hgt + 36, {size: 24, weight: 700, color: PAL.ink, align: 'center'}); stage.text('GPU', 910, y0 + hgt + 36, {size: 24, weight: 700, color: PAL.ink, align: 'center'});
      const P = 0.3, t0 = nW === 4 ? evT(ctx, 'w4') : w16;
      lit(stage, cc => { for (let q = 0; q < nW; q++) { const yy = y0 + (q + 0.5) * hgt / nW; for (let m = 0; m <= Math.floor((t - t0) / P); m++) { const x = 150 + ((t - t0) / P - m) * 120; if (x > 880) continue; circle(cc, x, yy, 5, rgba(PAL.warm, 0.95)); circle(cc, x, yy, 2.4, CORE(PAL.warm)); } } }, {gain: 0.8});
      const beats = Math.max(0, Math.floor((t - t0) / P - 730 / 120) + 1);   // x = 880 에 닿은 박자 수(위 그림과 같은 식)
      stage.text(`박자마다 ${nW}비트`, 540, 760, {role: 'display', size: 50, weight: 700, color: PAL.warmHi, align: 'center'});
      if (nW === 16) stage.text('선 4줄일 때: 박자마다 4비트', 540, 815, {size: 27, weight: 500, color: rgba(PAL.muted, 0.8), align: 'center'});
      else stage.text(`선 하나 = 박자마다 비트 하나 · 도착 ${beats * nW}비트`, 540, 815, {size: 27, weight: 500, color: PAL.muted, align: 'center'});
    });
  },
  // ---------------------------------------------------------------- board: 기판 위 멀리, 땜납 구슬, 긴 선의 전하
  board(stage, t, p, ctx) {
    const c = stage.ctx, s10 = S(ctx, 's10').start, s11 = S(ctx, 's11').start, gd = evT(ctx, 'gddr');
    const ma = fadeIn(t, gd - 0.3, 0.6);
    const chg = ticks(ctx, 'chargeL');
    const busyB = j => { let b = 0; chg.forEach((ta, m) => { for (let q = 0; q < 4; q++) if (ORDER[(m * 4 + q) * 5 % 144] === j) b = Math.max(b, smooth((t - ta - 0.6) / 0.1) * (1 - smooth((t - ta - 1.2) / 0.15))); }); return b; };
    withCam(stage, CAM_FULL, () => {
      boardScene(stage, t, {mem: ma, busy: busyB});
      // 비트마다 긴 선 전체가 채워졌다(0.6 s) 비워짐(0.6 s)
      chg.forEach(ta => { const q = clamp((t - ta) / 0.6), e = 1 - smooth((t - ta - 0.7) / 0.5); for (let k = 0; k < 4; k++) chargePath(stage, bwPath(k), q, e, PAL.warm, 5); });
    });
    // 몇 센티미터
    const da = fadeIn(t, W0(ctx, 's09', '몇센티미터', -0.2), 0.4) * fadeOut(t, s10 - 0.3);
    if (da > 0) withAlpha(c, da, () => { arrow(c, [622, 1000], [808, 1000], PAL.muted, 2.5); arrow(c, [808, 1000], [622, 1000], PAL.muted, 2.5); label(stage, '몇 cm', 715, 968, {size: 28}); note(stage, '(그림은 줄임)', 715, 1036, {size: 24}); });
    if (ma > 0) withAlpha(c, ma, () => { label(stage, '그래픽 메모리', 904, 976, {size: 28}); if (t < s10 - 0.3) label(stage, 'GPU', 366, 470, {size: 34}); });
    // s10: 땜납 구슬 확대 렌즈(같은 자: 1 mm = 300 px)
    const la = fadeIn(t, s10 - 0.2, 0.5) * fadeOut(t, s11 - 0.2, 0.3);
    if (la > 0) withAlpha(c, la, () => {
      unlitRect(stage, 120, 300, 840, 470, 1);
      panel(c, 120, 300, 840, 470, 0.96);
      line(c, [[904, 1060], [700, 770]], rgba(PAL.muted, 0.6), 2, {dash: [6, 6]});
      const px = 300, yb = 600;
      rect(c, 160, 420, 760, 70, 6, PAL.sub);
      for (let i = 0; i < 3; i++) { const x = 240 + i * 0.75 * px; circle(c, x, yb - 30, 0.22 * px, PAL.ballLo); circle(c, x - 8, yb - 38, 0.15 * px, PAL.ball); }
      line(c, [[240, 715], [240 + 0.75 * px, 715]], PAL.ink, 3); line(c, [[240, 703], [240, 727]], PAL.ink, 3); line(c, [[240 + 0.75 * px, 703], [240 + 0.75 * px, 727]], PAL.ink, 3);
      stage.text('0.75 mm', 240 + 0.375 * px, 745, {size: 30, weight: 700, color: PAL.ink, align: 'center'});
      stage.text('데이터 선 32개 / 칩 하나', 700, 745, {size: 28, weight: 700, color: PAL.warmHi, align: 'center'});
      stage.text('땜납 구슬', 540, 345, {size: 30, weight: 700, color: PAL.ink, align: 'center'});
    });
    // s11: 에너지 막대(긴 선)
    const ea = fadeIn(t, s11 - 0.1, 0.4);
    if (ea > 0) withAlpha(c, ea, () => {
      panel(c, 120, 330, 840, 150);
      stage.text('비트 하나를 보내는 에너지', 150, 372, {size: 28, weight: 700, color: PAL.ink});
      const n = countUntil(chg.map(x => x + 0.6), t), fill = Math.min(1, n > 0 ? 1 : clamp((t - chg[0]) / 0.6));
      rect(c, 150, 410, 780 * (M.pjGDDR / 14.5), 30, 6, rgba('#000', 0.35));
      rect(c, 150, 410, 780 * (M.pjGDDR / 14.5) * fill, 30, 6, PAL.busyLo);
      stage.text('긴 선 — 채울 전하가 많다', 150, 462, {size: 25, weight: 500, color: PAL.muted});
      note(stage, '설명 모형', 860, 462, {size: 24});
    });
  },
  // ---------------------------------------------------------------- interposer
  interposer(stage, t, p, ctx) {
    const c = stage.ctx, s12 = S(ctx, 's12').start, s13 = S(ctx, 's13').start, s14 = S(ctx, 's14').start, s15 = S(ctx, 's15').start, s16 = S(ctx, 's16').start;
    const rise = easeInOut((t - s12 - 0.2) / 1.6), memOut = 1 - smooth((t - s12) / 0.6), wl = fadeIn(t, evT(ctx, 'lines') - 0.2, 0.8);
    const cs = ticks(ctx, 'chargeS'), flowA = fadeIn(t, s16 - 0.2, 0.5);
    const arr14 = busyFromArrivals(arrivals(s14 + 0.2, s15 - 1.0), t), live14 = t >= s14 && t < s15 + 0.6 ? 1 - smooth((t - s15 - 0.1) / 0.4) : 0;   // s14: 선 1,024개로 온 비트가 칸을 켜고, 흐름이 멈추면 꺼짐
    const busy = flowA > 0 ? busyFromArrivals(arrivals(s16 - 0.3, 1e9), t) : (j => Math.max(arr14(j) * live14, (j => { let b = 0; cs.forEach((ta, m) => { for (let q = 0; q < 6; q++) if (ORDER[(m * 6 + q) * 7 % 144] === j) b = Math.max(b, smooth((t - ta - 0.3) / 0.1) * (1 - smooth((t - ta - 0.9) / 0.15))); }); return b; })(j)));
    withCam(stage, CAM_FULL, () => {
      drawBoard(c); drawSubstrate(c);
      withAlpha(c, memOut, () => { for (let x = BD.memX0 + 16; x < BD.memX1 - 8; x += 34) circle(c, x, G.ballY, 10, PAL.ballLo); rect(c, BD.memX0 + 6, BD.memY0, BD.memX1 - BD.memX0 - 12, BD.memY1 - BD.memY0, 5, PAL.mold); });
      c.save(); c.translate(0, (1 - rise) * 120); withAlpha(c, rise, () => drawInterposer(c, 1)); c.restore();
      drawWires(c, wl);
      drawStack(stage, {dx: (1 - rise) * 420, a: rise});
      drawGPU(stage, busy, {n: 12});
      // s15: 짧은 선의 전하(선 24줄 모두)
      if (t < s16) cs.forEach(ta => { const q = clamp((t - ta) / 0.3), e = 1 - smooth((t - ta - 0.35) / 0.4); if (e > 0 && q > 0) for (let k = 0; k < NW; k += 3) chargePath(stage, wirePath(k), q, e, PAL.warm, 3); });
      if (t >= s14 && t < s15 + 0.6) bitsOnWires(stage, t, {t0: s14 + 0.2, tEnd: s15 - 1.0, a: wl});   // 칸 켜짐(arr14)과 같은 출발 열
      if (flowA > 0) bitsOnWires(stage, t, {t0: s16 - 0.3, a: flowA});
    });
    if (rise > 0.6 && t < s13 - 0.2) withAlpha(c, fadeIn(t, s12 + 1.4, 0.4), () => { label(stage, '인터포저 — 실리콘 판', 540, 1000, {size: 28}); label(stage, 'GPU', 366, 470, {size: 34}); label(stage, 'HBM', 793, 500, {size: 34, color: PAL.coolHi}); });
    // s13: 같은 자로 확대 — 땜납 구슬 하나 자리에 범프 여럿(1 mm = 300 px)
    const la = fadeIn(t, s13 - 0.2, 0.5) * fadeOut(t, s14 - 0.2, 0.3);
    if (la > 0) withAlpha(c, la, () => {
      unlitRect(stage, 120, 300, 840, 470, 1);
      panel(c, 120, 300, 840, 470, 0.96);
      const px = 300, yb = 560;
      stage.text('같은 자: 1 mm = 300 px', 540, 340, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
      // 위: 땜납 구슬(간격 0.75 mm) / 아래: 같은 폭의 마이크로범프(간격 약 0.05 mm)
      rect(c, 160, 380, 760, 34, 5, PAL.sub);
      for (let i = 0; i < 3; i++) { const x = 250 + i * 0.75 * px; circle(c, x, 470, 0.2 * px, PAL.ballLo); circle(c, x - 7, 463, 0.14 * px, PAL.ball); }
      line(c, [[250, 548], [250 + 0.75 * px, 548]], PAL.ink, 3); line(c, [[250, 538], [250, 558]], PAL.ink, 3); line(c, [[250 + 0.75 * px, 538], [250 + 0.75 * px, 558]], PAL.ink, 3);
      stage.text('땜납 구슬 0.75 mm', 560, 548, {size: 27, weight: 700, color: PAL.ink});
      rect(c, 160, 600, 760, 34, 5, PAL.inter);
      const bt = evT(ctx, 'bumps');
      for (let i = 0; i < 51; i++) { const x = 168 + i * 0.05 * px; withAlpha(c, fadeIn(t, bt + i * 0.008, 0.1), () => circle(c, x, 643, 0.0125 * px + 1, PAL.bump)); }
      line(c, [[168, 690], [168 + 0.05 * px, 690]], PAL.ink, 3);
      stage.text('범프 간격 약 0.04~0.055 mm — 구슬 한 칸에 15개쯤', 540, 724, {size: 26, weight: 700, color: PAL.warmHi, align: 'center'});
    });
    if (t >= s14 - 0.2 && t < s15 - 0.2) withAlpha(c, fadeIn(t, s14, 0.4), () => { bigNum(stage, '1,024', 540, 380); note(stage, '한 덩이의 데이터 선 · 그림은 24줄', 540, 446); });
    // s15: 에너지 막대 — 앞 장면의 긴 선 막대를 잔상으로
    if (t >= s15 - 0.2 && t < s16 - 0.2) withAlpha(c, fadeIn(t, s15 - 0.2, 0.4), () => {
      panel(c, 120, 300, 840, 210);
      stage.text('비트 하나를 보내는 에너지 · 한 측정', 150, 342, {size: 28, weight: 700, color: PAL.ink});
      rect(c, 150, 372, 780 * (M.pjGDDR / 14.5), 26, 6, null, rgba(PAL.muted, 0.7), 2);
      stage.text(`그래픽 메모리 ${M.pjGDDR.toFixed(1)} pJ`, 160, 386, {size: 22, weight: 500, color: PAL.muted});
      const fill = clamp((t - cs[0]) / 0.3);
      rect(c, 150, 414, 780 * (M.pjHBM / 14.5) * fill, 26, 6, PAL.busyLo);
      stage.text(`HBM ${M.pjHBM.toFixed(1)} pJ`, 150 + 780 * (M.pjHBM / 14.5) + 14, 428, {size: 24, weight: 700, color: PAL.ink});
      stage.text('HBM2 대 GDDR5, 2017 측정', 150, 476, {size: 24, weight: 500, color: PAL.muted});
    });
    if (t >= s16 - 0.2) withAlpha(c, fadeIn(t, s16 - 0.2, 0.4), () => {
      bigNum(stage, '1.2 TB/s', 540, 370);
      note(stage, '선 하나 9.6 Gb/s × 1,024 (그래픽 메모리 선 하나 21 Gb/s)', 540, 436, {size: 25});
    });
  },
  // ---------------------------------------------------------------- stack: 옆자리 몇 곳 → 위로 쌓기 → TSV → 12층
  stack(stage, t, p, ctx) {
    const c = stage.ctx, dl = ticks(ctx, 'die'), s18 = S(ctx, 's18').start, s19 = S(ctx, 's19').start;
    const toSide = smooth((t - (dl[0] - 0.9)) / 0.6);
    if (toSide < 1) withAlpha(c, 1 - toSide, () => {
      const s0 = S(ctx, 's17').start, f = [0, 1, 2, 3, 4, 5].map(q => fadeIn(t, s0 + 0.6 + q * 0.25, 0.25));
      planView(stage, {fill: f});
      label(stage, 'GPU', PV.gx + PV.gw / 2, PV.gy + PV.gh / 2, {size: 40});
      note(stage, '메모리 칩 한 장씩 — 옆자리가 다 찼다', 540, PV.gy - 76, {size: 26});
    });
    if (toSide > 0) withAlpha(c, toSide, () => {
      const nl = Math.min(G.NL, countUntil(dl.map(x => x - 0.32), t) + clamp((t - (dl[countUntil(dl, t) - 1] ?? dl[0])) / 0.32) * 0) ;
      let nlf = 0; for (let i = 0; i < G.NL; i++) { if (t >= dl[i]) nlf = i + 1; else if (t >= dl[i] - 0.32) { nlf = i + (t - (dl[i] - 0.32)) / 0.32; break; } else break; }
      const tsvA = fadeIn(t, evT(ctx, 'cu'), 0.8);
      const cam = t < s18 - 0.2 ? CAM_STACK : camMix(CAM_STACK, {cx: 793, cy: 700, z: 1.45, sy: 660}, easeInOut((t - s18 + 0.2) / 0.8) * (1 - easeInOut((t - s19 + 0.4) / 0.8)));
      withCam(stage, cam, () => {
        drawBoard(c); drawSubstrate(c); drawInterposer(c); drawWires(c);
        drawStack(stage, {nl: Math.max(0.0001, nlf), tsv: tsvA});
        const tt = ticks(ctx, 'tsv');
        drawGPU(stage, busyFromArrivals(arrivals(tt[0], 1e9), t));   // 아래 bitsOnWires 와 같은 출발 열
        // TSV 신호가 층을 오르내림
        if (t > tt[0] - 0.1) lit(stage, cc => {
          for (let q = 0; q < 8; q++) { const tx = G.hbmX0 + 22 + q * (G.hbmX1 - G.hbmX0 - 44) / 7; for (let m = 0; m < 3; m++) { const u = ((t - tt[0]) * 0.5 + m / 3 + q * 0.07) % 1; const yy = lerp(G.baseY0, dieTop(G.NL - 1), q % 2 ? u : 1 - u); circle(cc, tx, yy, 4, rgba(PAL.warm, 0.95 * tsvA)); circle(cc, tx, yy, 1.8, rgba(CORE(PAL.warm), tsvA)); } }
        }, {gain: 0.7});
        if (t > tt[0]) bitsOnWires(stage, t, {t0: tt[0], a: 0.8});
      });
      const n = Math.floor(nlf + 1e-6);
      if (t < s18 - 0.3) { bigNum(stage, `${n}층`, 930, 600); note(stage, '바닥 넓이', 930, 664); note(stage, '그대로', 930, 698); }
      // TSV 렌즈(칩 한 장 확대)
      const la = fadeIn(t, s18 - 0.1, 0.4) * fadeOut(t, s19 - 0.4, 0.3);
      if (la > 0) withAlpha(c, la, () => {
        unlitRect(stage, 80, 300, 520, 360, 1);
        panel(c, 80, 300, 520, 360, 0.96);
        const dr = evT(ctx, 'drill'), cu = evT(ctx, 'cu');
        for (let L = 0; L < 3; L++) {
          const y = 400 + L * 70;
          rect(c, 110, y, 460, 50, 4, PAL.dram); rect(c, 110, y, 460, 6, 4, PAL.dramHi);
          for (let q = 0; q < 6; q++) {
            const x = 150 + q * 76, h = 50 * fadeIn(t, dr + q * 0.05, 0.3), fillq = fadeIn(t, cu + q * 0.05, 0.6);
            rect(c, x - 6, y, 12, h, 2, '#141416');
            rect(c, x - 5, y + 50 * (1 - fillq), 10, 50 * fillq, 2, PAL.copper);
          }
        }
        stage.text('칩마다 구멍 수천 개 · 지름 약 2~5 µm', 340, 340, {size: 26, weight: 700, color: PAL.ink, align: 'center'});
        stage.text('구리를 채워 위아래를 잇는다', 340, 630, {size: 25, weight: 500, color: PAL.muted, align: 'center'});
      });
      if (t >= evT(ctx, 'cu') && t < s19 - 0.4) withAlpha(c, fadeIn(t, evT(ctx, 'cu') + 0.6, 0.4), () => { label(stage, '구리 기둥', 960, 700, {size: 28}); note(stage, '(TSV)', 960, 740, {size: 26}); });
      if (t >= s19 - 0.4) withAlpha(c, fadeIn(t, s19 - 0.4, 0.4), () => { bigNum(stage, '12층', 930, 600); note(stage, '2024년부터', 930, 664); note(stage, '대량 생산', 930, 698); });
    });
  },
  // ---------------------------------------------------------------- tradeoff: 열의 길(설명 모형), 맞춰 쌓기
  tradeoff(stage, t, p, ctx) {
    const c = stage.ctx, s20 = S(ctx, 's20').start, s21 = S(ctx, 's21').start, al = ticks(ctx, 'align');
    const hp = clamp((t - s20 - 0.3) / 4.2);          // 열 앞면이 바탕 다이(-1)에서 맨 위(11)까지
    const front = -1 + hp * 13;
    const heat = i => clamp(0.85 - (i + 1) * 0.045) * smooth((front - i + 1) / 1.5) * fadeOut(t, s21 + 0.3, 1.2);
    const lidA = fadeIn(t, s20 - 0.6, 0.5);
    // s21: 맨 위 칩이 들렸다가 구멍을 맞춰 내려앉음
    // 들림(s21) → 구멍 줄이 어긋난 채 떠 있음 → 첫 '딸깍'(al[0])에 줄을 맞춤 → 둘째(al[1])에 내려앉음
    const lift = t < s21 ? 0 : (t < al[1] - 0.45 ? easeInOut((t - s21) / 0.5) : 1 - easeInOut((t - (al[1] - 0.45)) / 0.45));
    const shift = t < s21 ? 0 : 16 * (1 - easeInOut((t - al[0] + 0.35) / 0.35));
    const cam = {cx: 793, cy: 760, z: 1.5, sy: 720};
    withCam(stage, cam, () => {
      drawBoard(c); drawSubstrate(c); drawInterposer(c); drawWires(c);
      drawStack(stage, {nl: G.NL - (lift > 0 ? 1 : 0), heat, tsv: 1, lid: lidA * (lift > 0 ? 0.25 : 1)});
      const tw0 = ctx.scene.start - 2.0; drawGPU(stage, busyFromArrivals(arrivals(tw0, 1e9), t)); bitsOnWires(stage, t, {t0: tw0});   // 일하는 칸 = 도착한 비트
      if (lift > 0) {   // 들린 맨 위 칩
        const y = dieTop(G.NL - 1) - lift * 60, x0 = G.hbmX0 + shift, w = G.hbmX1 - G.hbmX0;
        rect(c, x0, y, w, G.dieH, 3, PAL.dram, rgba('#000', 0.35), 1.2); rect(c, x0 + 3, y + 3, w - 6, 4, 2, PAL.dramHi);
        for (let q = 0; q < 8; q++) { const tx = x0 + 22 + q * (w - 44) / 7; rect(c, tx - 2.5, y, 5, G.dieH, 1, PAL.copper); const bx = G.hbmX0 + 22 + q * (w - 44) / 7; line(c, [[bx, y + G.dieH], [bx, dieTop(G.NL - 2)]], rgba(PAL.coolHi, 0.6), 1.2, {dash: [3, 4]}); }
      }
      // 열의 흐름(아지랑이 줄): 앞면 아래쪽 층에서 위로 — 에너지라 lit
      if (t < s21 + 0.6) lit(stage, cc => {
        for (let q = 0; q < 6; q++) {
          const x = G.hbmX0 + 30 + q * 44;
          for (let m = 0; m < 4; m++) {
            const u = ((t - s20) * 0.35 + m / 4 + q * 0.11) % 1, yy = lerp(G.baseY0 + 10, G.baseY0 - (front + 1) * 30, u);
            if (yy < dieTop(G.NL - 1) - 10) continue;
            const a = 0.7 * (1 - u) * fadeOut(t, s21, 0.6);
            line(cc, [[x - 4, yy + 10], [x + 4, yy], [x - 4, yy - 10]], rgba(PAL.warm, a), 3);
          }
        }
      }, {gain: 0.5});
    });
    if (t < s21 - 0.3) {
      note(stage, '열이 빠지는 곳', 930, 420, {size: 26}); note(stage, '(맨 위)', 930, 456, {size: 26});
      note(stage, '설명 모형 · 실제로는 옆·아래로도 조금', 540, 1210, {size: 24});
      const [bx, by] = toScreen(cam, [G.hbmX1 + 10, (G.baseY0 + G.baseY1) / 2]);
      label(stage, '바탕 다이', 970, by - 18, {size: 26}); label(stage, '가장 뜨겁다', 970, by + 18, {size: 26});
    } else {
      label(stage, '구멍 줄을', 930, 520, {size: 30}); label(stage, '층마다 맞춰야', 930, 560, {size: 30});
      note(stage, '칩 한 장에', 930, 610, {size: 26}); note(stage, '수천 개', 930, 644, {size: 26});
    }
  },
  // ---------------------------------------------------------------- ai: 낱말 한 조각마다 모두 다시 읽기, 다섯 덩이
  ai(stage, t, p, ctx) {
    const c = stage.ctx, tk = ticks(ctx, 'token'), s23 = S(ctx, 's23').start;
    const k = countUntil(tk, t), last = k ? tk[k - 1] : tk[0] - TOK_VIS, ph = clamp((t - last) / TOK_VIS);
    const sites = [0, 1, 2, 3, 4];
    // 한 조각: 앞 0.9 동안 기둥에서 읽어 GPU 로, 그다음 계산(칸 켜짐), 끝에 조각이 나옴
    const readA = smooth(ph / 0.08) * (1 - smooth((ph - 0.6) / 0.15)), busy = j => smooth((ph - 0.2 - (ORDER.indexOf(j) / 144) * 0.4) / 0.08) * (1 - smooth((ph - 0.92) / 0.08));
    withAlpha(c, fadeIn(t, ctx.scene.start, 0.5), () => {
      planView(stage, {fill: [1, 1, 1, 1, 1, 0], busy, hide: [5]});
      planStream(stage, t, sites, last, readA);   // 한 조각마다 기둥에서 새로 읽기 시작
      label(stage, 'GPU', PV.gx + PV.gw / 2, PV.gy + PV.gh / 2, {size: 40});
      SITES.slice(0, 5).forEach(([x, y]) => note(stage, 'HBM', x + PV.sw / 2, y + PV.sh / 2, {size: 26, color: PAL.coolHi}));
    });
    // 나온 낱말 조각들
    const toks = ['메모리', '를', ' 왜', ' 쌓', '을', '까', '?', ' 선', '을'];
    unlitRect(stage, 80, 330, 920, 80, 1);
    let x = 120;
    for (let i = 0; i < Math.min(k, toks.length); i++) {
      const s = toks[i].trim(), w = s.length * 30 + 26, a = fadeIn(t, tk[i], 0.25);
      withAlpha(c, a, () => { rect(c, x, 345, w, 52, 8, rgba(PAL.plate, 0.95), rgba(i === k - 1 ? PAL.warm : PAL.border, 1), 2); stage.text(s, x + w / 2, 372, {size: 28, weight: 700, color: PAL.ink, align: 'center'}); });
      x += w + 10;
    }
    note(stage, `낱말 조각 ${k}개 = 모델의 숫자를 ${k}번 다 읽음`, 540, 440, {size: 26});
    if (t >= s23 - 0.2) withAlpha(c, fadeIn(t, s23 - 0.2, 0.4), () => {
      bigNum(stage, '3.35 TB/s', 540, 1090, {size: 72});
      note(stage, 'H100 (2022) · HBM3 다섯 덩이 · 80 GB', 540, 1150, {size: 26});
    });
  },
  // ---------------------------------------------------------------- close
  close(stage, t, p, ctx) {
    const c = stage.ctx, last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
    const t0 = ctx.scene.start, busy = busyFromArrivals(arrivals(t0, 1e9), t);   // 아래 bitsOnWires 와 같은 t0
    withCam(stage, CAM_FULL, () => { packageScene(stage, t, {busy}); bitsOnWires(stage, t, {t0: t0}); });
    const ea = fadeIn(t, last.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 270, W, 230, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 270, 0, 500); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.75)'); g.addColorStop(0.85, 'rgba(9,9,11,0.75)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 270, W, 230);
        ['HBM은 메모리를 쌓아 GPU 옆에 붙이고,', '짧고 많은 선으로 한꺼번에 보냅니다'].forEach((s, i) => stage.text(s, 540, 320 + i * 62, {role: 'display', weight: 700, size: 46, color: i === 1 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 1000, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 452, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, last.start, 0.5)});
      });
    }
  },
};

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { captionBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); hookKicker(stage, t, ctx, MO); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); unlitRect(stage, 0, 0, W, 120, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') { hookKicker(stage, t, ctx, MO); withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return; }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
/** hook 의 키커(시간 배율 선언) — 포스터 위 맨 위 줄. 머리글 제목은 포스터가 줄어든 뒤 */
function hookKicker(stage, t, ctx, MO) {
  const L = titleList('hook', ctx);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  if (t < MO[1]) {
    const s = L[k][1];
    if (s) { unlitRect(stage, 0, 100, W, 60, 1); stage.text(s, 540, 122, {role: 'display', weight: 500, size: 28, color: PAL.warmHi, align: 'center', ...so}); }
    return;
  }
  headList(stage, t, L, 1);
}
