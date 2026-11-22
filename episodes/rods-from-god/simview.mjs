// 55 신의 지팡이 — 시뮬레이션 단면(sim/bake.mjs 가 만든 장)을 읽어 무대에 그린다.
// 실제 크기로 바꾸는 배율: 시뮬레이션 막대 0.04 m ↔ 흔히 예로 드는 막대 6.1 m → K = 152.5 (길이·시간 모두 같은 배율 — 강도를 무시하는
// 영역의 유체역학적 닮음. 강도가 있는 바위에서는 정확한 닮음이 아니다 — 설명 모형).
// 그림: 바위는 무광 지층 띠, 막대는 무광 금속(옆으로 명암), 부서진 바위는 조금 어둡게. 뜨거운 곳(600 K 위)은 따로 '빛' 캔버스(lit).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {createCanvas} = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../pipeline/render/package.json'))('@napi-rs/canvas');   // the toolkit's canvas module

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
export const SIMDIR = process.env.RODS_SIMDIR || path.join(ROOT, 'outputs/rods-from-god/sim');
export const REAL_L = 6.1;
export {createCanvas};                 // m — 흔히 예로 드는 막대 길이

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const SIMPAL = {
  rockA: '#5E5852', rockB: '#4A4540', rockD: '#3B3733',       // 지층 띠 둘, 부서진 바위
  rodHi: '#D3D6DB', rodMid: '#9DA3AB', rodLo: '#5C626A',      // 텅스텐(무광)
};
const RA = hex(SIMPAL.rockA), RB = hex(SIMPAL.rockB), RD = hex(SIMPAL.rockD), WH = hex(SIMPAL.rodHi), WM = hex(SIMPAL.rodMid), WL = hex(SIMPAL.rodLo);
const HOT = [[600, hex('#7A2208')], [900, hex('#C4400E')], [1300, hex('#FF6B1A')], [2000, hex('#FFB07A')], [3000, hex('#FFE6CC')]];
const ramp = (stops, v) => {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
    const f = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]), a = stops[i - 1][1], b = stops[i][1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  return stops.at(-1)[1];
};
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

const RUNS = {};
/** 실행 하나(A·B·C)를 읽는다. 없으면 null(정지화면 시험용 — 장면이 그 자리를 비운다). */
export function loadRun(name) {
  if (name in RUNS) return RUNS[name];
  const f = path.join(SIMDIR, name + '.bin');
  if (!fs.existsSync(f)) { console.warn(`[simview] ${f} 없음 — 그 실행은 그리지 않습니다`); return (RUNS[name] = null); }
  const buf = fs.readFileSync(f), hl = buf.readUInt32LE(0), H = JSON.parse(buf.subarray(4, 4 + hl).toString());
  const size = H.nr * H.nz * H.NC, off = 4 + hl, nF = H.times.length;
  const run = {name, ...H, K: REAL_L / H.rodL, nF, frame: i => buf.subarray(off + i * size, off + (i + 1) * size), cache: new Map()};
  run.intact0 = H.diag[0].intactN || 1;
  run.realT = run.times.map(t => t * run.K);                 // 실제 크기의 시각(초)
  run.realDepth = run.diag.map(d => Math.max(0, d.depth) * run.K);
  return (RUNS[name] = run);
}
/** 실제 시각(초) → 프레임 번호(가장 가까운 것). */
export function frameAt(run, tReal) {
  const T = run.realT; if (tReal <= 0) return 0; if (tReal >= T.at(-1)) return run.nF - 1;
  let lo = 0, hi = T.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= tReal) lo = m; else hi = m; }
  return tReal - T[lo] < T[hi] - tReal ? lo : hi;
}
/** 남은(아직 멀쩡한) 막대 길이, 실제 m. */
export const remainingLen = (run, fi) => REAL_L * (run.diag[fi].intactN || 0) / run.intact0;

/** 프레임 하나를 색칠한 캔버스 둘(화면용, 빛 지도용)과 막대 앞끝 압력·구멍 윤곽. 최근 몇 개를 기억한다. */
export function simFrame(run, fi, {bands = true} = {}) {
  const ck = bands ? fi : 'nb' + fi;
  if (run.cache.has(ck)) return run.cache.get(ck);
  const {nr, nz, NC} = run, d = run.frame(fi), W2 = nr * 2;
  const cv = createCanvas(W2, nz), hot = createCanvas(W2, nz), hotW = createCanvas(W2, nz);
  const c = cv.getContext('2d'), img = c.createImageData(W2, nz), px = img.data;
  const hc = hot.getContext('2d'), himg = hc.createImageData(W2, nz), hp = himg.data;
  const wc = hotW.getContext('2d'), wimg = wc.createImageData(W2, nz), wp = wimg.data;
  let pMax = 0, noseZ = 1e9;
  const rodR = run.rodD / 2 / run.cell;
  for (let zz = 0; zz < nz; zz++) {
    const row = nz - 1 - zz;     // 캔버스 위 = 큰 z
    for (let rr = 0; rr < nr; rr++) {
      const o = (zz * nr + rr) * NC, d0 = d[o] / 200, d1 = d[o + 1] / 200, dd = d0 + d1;
      if (dd < 0.03) continue;
      const a = sstep(0.18, 0.5, dd), fr = sstep(0.3, 0.7, d1 / dd), T = d[o + 2] * 12, bd = bands ? d[o + 3] / 255 : 0.5, fl = d[o + 5] / 255;
      if (d1 / dd > 0.5) { const pl = d[o + 4] / 255; if (pl > pMax) pMax = pl; if (zz < noseZ) noseZ = zz; }
      for (const side of [1, -1]) {
        const col = side > 0 ? nr + rr : nr - 1 - rr, i = (row * W2 + col) * 4;
        // 바위: 띠 + 부서지면 어둡게 / 막대: 옆으로 명암(왼쪽이 밝다)
        const rock = [RA[0] + (RB[0] - RA[0]) * bd, RA[1] + (RB[1] - RA[1]) * bd, RA[2] + (RB[2] - RA[2]) * bd];
        const df = fl * 0.6;
        for (let k = 0; k < 3; k++) rock[k] += (RD[k] - rock[k]) * df;
        const u = Math.min(1, rr / Math.max(1, rodR)), sh = side < 0 ? 0.55 - 0.45 * u : 0.55 + 0.45 * u;     // 0 = 밝은 쪽
        const rod = sh < 0.5 ? WH.map((v, k) => v + (WM[k] - v) * (sh / 0.5)) : WM.map((v, k) => v + (WL[k] - v) * ((sh - 0.5) / 0.5));
        let col3 = rock.map((v, k) => v + (rod[k] - v) * fr);
        if (T > 700) { const h = ramp(HOT, T), ha = sstep(700, 1400, T) * 0.85; col3 = col3.map((v, k) => v + (h[k] - v) * ha); }
        px[i] = col3[0]; px[i + 1] = col3[1]; px[i + 2] = col3[2]; px[i + 3] = 255 * a;
        if (T > 900) {
          const h = ramp(HOT, T), ha = sstep(900, 1800, T) * a;
          hp[i] = h[0]; hp[i + 1] = h[1]; hp[i + 2] = h[2]; hp[i + 3] = 255 * ha;
          wp[i] = wp[i + 1] = wp[i + 2] = 255; wp[i + 3] = 255 * ha;
        }
      }
    }
  }
  c.putImageData(img, 0, 0); hc.putImageData(himg, 0, 0); wc.putImageData(wimg, 0, 0);
  const out = {cv, hot, hotW, pNose: pMax > 0 ? 1e7 * 10 ** (3 * pMax) : 0, noseZ: noseZ * run.cell};
  if (run.cache.size > 8) run.cache.delete(run.cache.keys().next().value);
  run.cache.set(ck, out);
  return out;
}
/** 구멍의 윤곽(실제 m): 깊이마다 축에서 바깥으로 처음 바위가 덮인 반지름. [[r, depth], …] (얕은 곳 → 깊은 곳). */
export function holeOutline(run, fi) {
  const key = 'hole' + fi; if (run.cache.has(key)) return run.cache.get(key);
  const {nr, nz, NC, cell, plateTop} = run, d = run.frame(fi), z0 = Math.round(plateTop / cell), pts = [];
  for (let zz = z0 - 1; zz > 0; zz -= 2) {
    let r = -1;
    for (let rr = 0; rr < nr; rr++) { const o = (zz * nr + rr) * NC; if ((d[o] + d[o + 1]) / 200 > 0.5) { r = rr; break; } }
    if (r <= 0) { if (r === 0) break; continue; }
    pts.push([r * cell * run.K, (z0 - zz) * cell * run.K]);
  }
  run.cache.set(key, pts);
  return pts;
}

/**
 * 단면을 무대에 그린다. ax = 축의 화면 x, sy = 처음 지표의 화면 y, ppm = 실제 1 m 당 px.
 * hot: 'screen' 이면 뜨거운 곳을 화면에(이미 색에 들어 있음), lit 은 부르는 쪽이 simHot 으로.
 */
export function drawSim(ctx, run, fi, {ax, sy, ppm, alpha = 1, bands = true}) {
  const f = simFrame(run, fi, {bands}), s = ppm * run.K;
  const x = ax - run.nr * run.cell * s, y = sy - (run.Hm - run.plateTop) * s, w = run.nr * 2 * run.cell * s, h = run.nz * run.cell * s;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(f.cv, x, y, w, h); ctx.restore();
  return f;
}
/** 뜨거운 곳 — lit(stage, c => simHot(c, stage, …)) 안에서 부른다(화면에는 색, 빛 지도에는 흰색). */
export function simHot(c, stage, run, fi, {ax, sy, ppm, alpha = 1, bands = true}) {
  const f = simFrame(run, fi, {bands}), s = ppm * run.K;
  const x = ax - run.nr * run.cell * s, y = sy - (run.Hm - run.plateTop) * s, w = run.nr * 2 * run.cell * s, h = run.nz * run.cell * s;
  c.save(); c.globalAlpha *= alpha; c.imageSmoothingEnabled = true;
  c.drawImage(c === stage.ctx ? f.hot : f.hotW, x, y, w, h); c.restore();
}
/** 시뮬레이션 영역의 화면 사각형(바깥은 장면이 그린 지층 띠). */
export function simRect(run, {ax, sy, ppm}) {
  const s = ppm * run.K;
  return {x0: ax - run.Wm * s, x1: ax + run.Wm * s, y0: sy - (run.Hm - run.plateTop) * s, y1: sy + run.plateTop * s};
}
