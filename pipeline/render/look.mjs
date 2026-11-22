// 질감 층(look): 숯색 바탕 + 빛나는 것 둘레의 은은한 번짐 + 약한 비네트 + 종이 같은 고정 질감(흑백 그레인). 후처리 공통 도구.
// 2026-11-22 사용자(참고 릴스를 보내며): "내가 말한 영상미는 이런거야. 그레인이 조금 가미 되었으면서, 적당한 빛(절대 과하지는
// 않은) 혹은 광원 효과같은게 있는 느낌? 색감이나 질감을 참고 하고."
// 같은 날 사용자 확인: "그레인 효과라는건 약간 종이같은 그런 질감인거 맞지?" — 그래서 그레인은 매 프레임 바뀌는 필름 잡음이 아니라
// 영상 내내 멈춰 있는 고운 결 + 조금 굵은 얼룩(mottle)이다(grain.hold_frames 0). 참고 릴스의 무늬도 거의 멈춰 있었다(제작 세션 측정).
// 영상미 문법 "빛은 조금만"은 그대로다: 번짐은 lit() 로 표시한 것(에너지·신호)에만 걸리고 화면 전체에는 걸리지 않는다.
// 수치(config/look.json)는 모두 제작 세션의 제안이며 사용자가 정한 값이 아니다. 견본은 samples/look-proposal-grain/.
//
// 부르는 순서(한 프레임):
//   clearGain(stage)                // renderVideo(gain:false) 는 빛 지도를 비우지 않는다 — 번짐을 쓰면 프레임 첫머리에 직접 비운다
//   filmBackground(stage)           // 바탕(띠 없는 방사형 그라디언트, 한 번 만들어 캐시)
//   …장면 → overlays → 자막…
//   filmLook(stage, t)              // 맨 마지막: ① 번짐(lit 만) → ② 비네트 → ③ 그레인 (화소 연산 한 번)
//
// 결정성: 같은 (프레임 번호, look) 이면 결과가 비트 단위로 같다(Math.random() 없음). 영상과 정지화면이 같고, 다시 렌더해도 같다.
// 빛 지도(stage.gain.canvas)는 읽기만 한다 — HDR 판이 그대로 쓴다.
import {createCanvas} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {REPO_ROOT} from './stage.mjs';

export const LOOK_FILE = path.join(REPO_ROOT, 'config/look.json');
let LOOK_RAW = null;
const stripDoc = o => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, stripDoc(v)])) : o);

/** config/look.json(한 번 읽음) 에 overrides 를 구획별로 얕게 합친다. 예: loadLook({grain: {amount: 3}}). */
export function loadLook(overrides = {}) {
  if (!LOOK_RAW) LOOK_RAW = stripDoc(JSON.parse(fs.readFileSync(LOOK_FILE, 'utf8')));
  const out = {};
  for (const k of new Set([...Object.keys(LOOK_RAW), ...Object.keys(overrides)])) {
    const a = LOOK_RAW[k], b = overrides[k];
    out[k] = a && typeof a === 'object' && b && typeof b === 'object' ? {...a, ...b} : b !== undefined ? b : (a && typeof a === 'object' ? {...a} : a);
  }
  return out;
}

// ---------- 결정적 난수 ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash32(x) {   // 정수 해시(lowbias32)
  x = (x >>> 0) ^ (x >>> 16); x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return x >>> 0;
}
const hexRGB = s => { const h = s.replace('#', ''); const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6); return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)); };
const smoothstep = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ---------- 바탕 ----------
const BG_CACHE = new Map();
/** 가운데 center → 가장자리 edge 의 방사형 바탕. 화소마다 실수로 계산하고 ±0.5 삼각 디더를 넣어 8비트 띠를 없앤다. */
export function filmBackground(stage, look = loadLook()) {
  const b = look.background, {W, H} = stage;
  const key = JSON.stringify([W, H, b.center, b.edge, b.cx, b.cy, b.r0, b.r1]);
  let cv = BG_CACHE.get(key);
  if (!cv) {
    cv = createCanvas(W, H);
    const c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
    const C = hexRGB(b.center), E = hexRGB(b.edge), cx = b.cx * W, cy = b.cy * H, r0 = b.r0 * H, span = Math.max(1e-6, (b.r1 - b.r0) * H);
    const rnd = mulberry32(0x5EED + W * 31 + H);
    for (let y = 0, i = 0; y < H; y++) {
      const dy2 = (y + 0.5 - cy) ** 2;
      for (let x = 0; x < W; x++, i += 4) {
        const s = smoothstep((Math.sqrt((x + 0.5 - cx) ** 2 + dy2) - r0) / span);
        for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.floor(C[ch] + (E[ch] - C[ch]) * s + 0.5 + (rnd() - rnd()) * 0.5);
        d[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    BG_CACHE.set(key, cv);
  }
  const ctx = stage.ctx;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy'; ctx.filter = 'none';
  ctx.drawImage(cv, 0, 0); ctx.restore();
}

// ---------- ① 빛 번짐(lit 로 표시한 것만) ----------
const Q = 4;   // 번짐 버퍼는 1/4 해상도
let BLOOM = null;
function bloomBuffers(W, H) {
  const w = Math.round(W / Q), h = Math.round(H / Q);
  if (!BLOOM || BLOOM.w !== w || BLOOM.h !== h) {
    const A = createCanvas(w, h), B = createCanvas(w, h), C = createCanvas(w, h);
    BLOOM = {w, h, A, B, C, a: A.getContext('2d'), b: B.getContext('2d'), c: C.getContext('2d'), filterOK: null};
  }
  return BLOOM;
}
/** ctx.filter='blur()' 가 실제로 퍼지는지 한 번 확인한다. 안 되면 줄였다 키우는 흐림으로 대신한다. */
function filterWorks() {
  const a = createCanvas(32, 32), b = createCanvas(32, 32), ac = a.getContext('2d'), bc = b.getContext('2d');
  ac.fillStyle = '#000'; ac.fillRect(0, 0, 32, 32); ac.fillStyle = '#fff'; ac.fillRect(15, 15, 2, 2);
  bc.globalCompositeOperation = 'copy'; bc.filter = 'blur(3px)'; bc.drawImage(a, 0, 0); bc.filter = 'none';
  return bc.getImageData(20, 16, 1, 1).data[0] > 0;
}
function blurInto(BL, px) {
  const {b, A, B, w, h} = BL;
  b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = 'copy';
  if (BL.filterOK) { b.filter = `blur(${px}px)`; b.drawImage(A, 0, 0); b.filter = 'none'; }
  else {   // 대체: 줄였다 키우기(대략 같은 반지름)
    const k = Math.max(1, Math.round(px)), sw = Math.max(1, Math.round(w / k)), sh = Math.max(1, Math.round(h / k));
    b.imageSmoothingEnabled = true; b.drawImage(A, 0, 0, sw, sh); b.drawImage(B, 0, 0, sw, sh, 0, 0, w, h);
  }
  b.restore();
}
/** 번짐 층(1/4 해상도 RGB, 0~255)을 만들어 돌려준다. 이 프레임에 lit() 이 없거나 세기가 0 이면 null. */
function bloomLayer(stage, o) {
  const g = stage.gain;
  if (!g || !g.dirty) return null;                  // 이 프레임에 lit() 이 없었다
  const steps = [[o.tight_px, o.tight_alpha], [o.wide_px, o.wide_alpha]].filter(([px, al]) => al > 0 && px > 0);
  if (!steps.length) return null;
  const BL = bloomBuffers(stage.W, stage.H);
  if (BL.filterOK === null) BL.filterOK = filterWorks();
  const {a, w, h} = BL;
  // A = 화면 × 빛 지도 (빛 지도가 검은 곳은 검게 → 빛나는 것의 색만 남는다)
  a.save(); a.setTransform(1, 0, 0, 1, 0, 0); a.globalAlpha = 1; a.filter = 'none'; a.imageSmoothingEnabled = true;
  a.globalCompositeOperation = 'copy'; a.drawImage(stage.canvas, 0, 0, w, h);
  a.globalCompositeOperation = 'multiply'; a.drawImage(g.canvas, 0, 0, w, h);
  a.restore();
  // 두 흐림을 작은 버퍼 C 에서 먼저 합친다: screen 은 결합 법칙이 서고 screen(바닥, α·s) = 바닥 위에 s 를 알파 α 로 screen 한 것과 같아
  // 결과는 두 번 따로 얹는 것과 같다. 큰 화면에 얹는 일은 아래 화소 연산 한 번에서 한다.
  const cc = BL.c;
  cc.save(); cc.setTransform(1, 0, 0, 1, 0, 0); cc.filter = 'none'; cc.globalAlpha = 1; cc.globalCompositeOperation = 'copy';
  cc.fillStyle = '#000'; cc.fillRect(0, 0, w, h); cc.globalCompositeOperation = 'screen';
  for (const [px, al] of steps) { blurInto(BL, px * (stage.W / 1080) / Q); cc.globalAlpha = al; cc.drawImage(BL.B, 0, 0); }
  cc.restore();
  const d = cc.getImageData(0, 0, w, h).data, rowHas = new Uint8Array(h);   // 행마다 번짐이 있는가(없는 행은 건너뛴다)
  for (let y = 0; y < h; y++) { let any = 0; for (let i = y * w * 4, e = i + w * 4; i < e; i += 4) if (d[i] | d[i + 1] | d[i + 2]) { any = 1; break; } rowHas[y] = any; }
  return {d, w, h, rowHas};
}

// ---------- ② 비네트 ----------
// 중심 (W/2, 0.46H), 반지름 r0·H 에서 0 → r1·H 에서 strength 로 선형인 검정 덮개(= 화소에 곱하는 1 − a). 한 번 계산해 캐시.
let VIG = null, VIG_KEY = '';
function vignetteMap(W, H, o) {
  if (!(o.strength > 0)) return null;
  const key = JSON.stringify([W, H, o.strength, o.r0, o.r1]);
  if (key !== VIG_KEY) {
    const m = new Float32Array(W * H), cx = W / 2, cy = H * 0.46, r0 = o.r0 * H, span = Math.max(1e-6, (o.r1 - o.r0) * H);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const q = (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r0) / span;
      m[i] = 1 - o.strength * (q <= 0 ? 0 : q >= 1 ? 1 : q);
    }
    VIG = m; VIG_KEY = key;
  }
  return VIG;
}

// ---------- ③ 그레인(종이 같은 질감) ----------
const TILE_CACHE = new Map();
function gaussNoise(rnd, N) {   // Box–Muller
  const a = new Float32Array(N);
  for (let i = 0; i < N; i += 2) {
    const u = Math.max(1e-12, rnd()), v = rnd(), r = Math.sqrt(-2 * Math.log(u));
    a[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < N) a[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  return a;
}
/** n×n 잡음 a 에 가로·세로 분리 가우시안 흐림(σ, 가장자리는 감아 돎)을 걸고 평균 0·표준편차 1 로 맞춘다(a 를 바꿔 돌려줌). */
function blurNorm(a, n, sigma) {
  const N = n * n;
  if (sigma > 0) {
    const R = Math.max(1, Math.ceil(sigma * 3)), ker = new Float32Array(2 * R + 1);
    let ks = 0; for (let i = -R; i <= R; i++) ks += ker[i + R] = Math.exp(-(i * i) / (2 * sigma * sigma));
    for (let i = 0; i < ker.length; i++) ker[i] /= ks;
    const idx = new Int32Array(n + 2 * R); for (let i = 0; i < idx.length; i++) idx[i] = (((i - R) % n) + n) % n;   // 감아 도는 색인
    const b = new Float32Array(N), row = new Float32Array(n + 2 * R);
    for (let y = 0; y < n; y++) {
      const o = y * n; for (let i = 0; i < row.length; i++) row[i] = a[o + idx[i]];
      for (let x = 0; x < n; x++) { let s = 0; for (let j = 0; j < ker.length; j++) s += ker[j] * row[x + j]; b[o + x] = s; }
    }
    const acc = new Float64Array(n);   // 배정밀도로 더한다(가로와 같음)
    for (let y = 0; y < n; y++) {   // 세로: 행 단위로 더해 캐시를 아낀다
      acc.fill(0);
      for (let j = 0; j < ker.length; j++) { const o = idx[y + j] * n, k = ker[j]; for (let x = 0; x < n; x++) acc[x] += k * b[o + x]; }
      a.set(acc, y * n);
    }
  }
  let m = 0; for (let i = 0; i < N; i++) m += a[i]; m /= N;
  let v = 0; for (let i = 0; i < N; i++) v += (a[i] - m) ** 2; const sd = Math.sqrt(v / N) || 1;
  for (let i = 0; i < N; i++) a[i] = (a[i] - m) / sd;
  return a;
}
/**
 * tiles 장의 tile×tile 잡음. 한 장 = sqrt(1−m)·고운 잡음(σ = size) + sqrt(m)·굵은 얼룩(σ = mottle_size), 각각 표준편차 1 로 맞춰 섞고
 * 다시 표준편차 1 로. m = mottle(0 이면 고운 잡음만 — 얼룩을 더하기 전과 같은 값). σ 는 1080 폭 기준이라 화면 폭에 비례한다.
 */
function grainTiles(o, W) {
  const k1080 = W / 1080, sigma = o.size * k1080, m = Math.max(0, Math.min(1, o.mottle || 0)), ms = (o.mottle_size || 0) * k1080;
  const key = JSON.stringify([o.seed, o.tiles, o.tile, sigma, m, ms]);
  let T = TILE_CACHE.get(key);
  if (T) return T;
  const n = o.tile, rnd = mulberry32(o.seed), N = n * n;
  T = [];
  for (let k = 0; k < o.tiles; k++) {
    const a = blurNorm(gaussNoise(rnd, N), n, sigma);
    if (m > 0) {
      const c = blurNorm(gaussNoise(rnd, N), n, ms), f1 = Math.sqrt(1 - m), f2 = Math.sqrt(m);
      for (let i = 0; i < N; i++) a[i] = f1 * a[i] + f2 * c[i];
      blurNorm(a, n, 0);
    }
    T.push(a);
  }
  TILE_CACHE.set(key, T);
  return T;
}

/** 그 프레임의 잡음 무늬: {k, tile, ox, oy, fx, fy}. 같은 k(= floor(frame / hold_frames); hold_frames ≤ 0 이면 늘 0) 면 같은 무늬. */
export function grainParams(frameIndex, look = loadLook()) {
  const o = look.grain, hold = o.hold_frames | 0, k = hold <= 0 ? 0 : Math.floor(frameIndex / hold);   // hold_frames ≤ 0 = 영상 내내 같은 무늬(종이 같은 고정 질감)
  const h1 = hash32(k ^ Math.imul(o.seed | 0, 0x9E3779B1)), h2 = hash32(h1 + 0x68E31DA4), h3 = hash32(h2 + 0x1B56C4E9);
  const tiles = Math.max(1, o.tiles | 0);
  return {k, tile: ((k % tiles) + tiles) % tiles, ox: h1 % o.tile, oy: h2 % o.tile, fx: (h3 & 1) === 1, fy: (h3 & 2) === 2};   // 이웃한 k 는 늘 다른 타일
}

let LUT = null, LUT_KEY = '', COLS = null, ROWS = null, BX = null;
/**
 * 프레임을 다 그린 맨 마지막에 부른다. ① 번짐(lit 만) → ② 비네트 → ③ 그레인. look.enabled 가 false 면 아무것도 안 한다.
 * 셋은 화면을 한 번 읽고(getImageData) 한 번 쓰는(putImageData) 화소 연산 하나로 한다 — 캔버스 합성을 세 번 하는 것보다 빠르다.
 */
export function filmLook(stage, t, look = loadLook()) {
  if (!look.enabled) return;
  const {ctx, W, H} = stage, frameIndex = Math.round(t * stage.FPS);
  const B = look.bloom ? bloomLayer(stage, look.bloom) : null;
  const V = look.vignette ? vignetteMap(W, H, look.vignette) : null;
  const o = look.grain, G = o && o.amount > 0;
  if (!B && !V && !G) return;
  let noise = null, lut = null;
  if (G) {
    const n = o.tile, pow2 = (n & (n - 1)) === 0, mask = n - 1;
    const T = grainTiles(o, W), P = grainParams(frameIndex, look);
    noise = T[P.tile];
    const lk = `${o.amount}|${o.highlight}`;
    if (lk !== LUT_KEY) {
      LUT = new Float32Array(256);
      for (let L = 0; L < 256; L++) LUT[L] = o.amount * (L <= 128 ? 1 : 1 + (o.highlight - 1) * (L - 128) / 127);
      LUT_KEY = lk;
    }
    lut = LUT;
    if (!COLS || COLS.length !== W) COLS = new Int32Array(W);
    if (!ROWS || ROWS.length !== H) ROWS = new Int32Array(H);
    const wrap = pow2 ? i => i & mask : i => ((i % n) + n) % n;
    for (let x = 0; x < W; x++) COLS[x] = wrap((P.fx ? -x : x) + P.ox);
    for (let y = 0; y < H; y++) ROWS[y] = wrap((P.fy ? -y : y) + P.oy) * n;
  }
  if (B && (!BX || BX.W !== W || BX.w !== B.w)) {   // 번짐 층을 키울 때의 가로 색인·무게(쌍선형, 화소 중심 맞춤)
    const x0 = new Int32Array(W), x1 = new Int32Array(W), fx = new Float32Array(W), sc = B.w / W;
    for (let x = 0; x < W; x++) { const sx = Math.min(B.w - 1, Math.max(0, (x + 0.5) * sc - 0.5)), a = Math.floor(sx); x0[x] = a * 4; x1[x] = Math.min(B.w - 1, a + 1) * 4; fx[x] = sx - a; }
    BX = {W, w: B.w, x0, x1, fx};
  }
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const fr = new Float32Array(3);
  for (let y = 0, i = 0, p = 0; y < H; y++) {
    let r0 = -1, r1 = -1, fy = 0;
    if (B) {
      const sy = Math.min(B.h - 1, Math.max(0, (y + 0.5) * (B.h / H) - 0.5)), a = Math.floor(sy), b = Math.min(B.h - 1, a + 1);
      if (B.rowHas[a] || B.rowHas[b]) { r0 = a * B.w * 4; r1 = b * B.w * 4; fy = sy - a; }
    }
    const rb = G ? ROWS[y] : 0;
    for (let x = 0; x < W; x++, i += 4, p++) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (r0 >= 0) {   // ① screen: c + s − c·s/255
        const bd = B.d, a0 = r0 + BX.x0[x], a1 = r0 + BX.x1[x], b0 = r1 + BX.x0[x], b1 = r1 + BX.x1[x], u = BX.fx[x];
        for (let ch = 0; ch < 3; ch++) {
          const top = bd[a0 + ch] + (bd[a1 + ch] - bd[a0 + ch]) * u, bot = bd[b0 + ch] + (bd[b1 + ch] - bd[b0 + ch]) * u;
          fr[ch] = top + (bot - top) * fy;
        }
        r += fr[0] * (1 - r / 255); g += fr[1] * (1 - g / 255); b += fr[2] * (1 - b / 255);
      }
      if (V) { const m = V[p]; r *= m; g *= m; b *= m; }   // ②
      if (G) {   // ③ 흑백 그레인: 밝기에 따른 세기(흰색으로 갈수록 약하게)
        const L = (54 * r + 183 * g + 19 * b) >> 8, v = noise[rb + COLS[x]] * lut[L > 255 ? 255 : L];
        r += v; g += v; b += v;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;   // Uint8ClampedArray 가 반올림·자르기
    }
  }
  ctx.putImageData(img, 0, 0);
}
