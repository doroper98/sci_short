// 충돌 시뮬레이션 가능성 시험의 그림 도구 (2026-11-14, 시안). 입자 스냅숏 → 매끈한 단면 장(field) → PPM 프레임(캔버스 의존 없음).
// --mode=mat: 재질 색 + 처음 깊이의 4 mm 띠(흐름선) / --mode=vm: 폰 미세스 응력(항복 강도 대비).
// usage: node render.mjs --run=DIR --out=DIR [--mode=mat|vm] [--ppm=8] [--every=1]
import fs from 'node:fs';
import path from 'node:path';

const A = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const run = A.run, out = A.out, mode = A.mode || 'mat', every = Number(A.every || 1);
fs.mkdirSync(out, {recursive: true});
const meta = JSON.parse(fs.readFileSync(path.join(run, 'meta.json'), 'utf8'));
const {Wm, Hm, dx, n} = meta;
const pxPerM = Number(A.ppm || 8) * 1000;
const axi = !!meta.axi, W = Math.round(Wm * pxPerM) * (axi ? 2 : 1), H = Math.round(Hm * pxPerM), X0 = axi ? W / 2 : 0;
const sp = dx / 2 * pxPerM;               // initial particle spacing in px
const R = Math.max(1.6, 1.6 * sp), norm = (sp * sp) / (R * R) / (meta.layers || 1);

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG0 = hex('#001621'), BG1 = hex('#000E16');
const STEEL = hex('#6F8791'), STEEL_B = hex('#5A717B'), ROD = hex('#E9BC78'), DEBRIS = hex('#3D4E55');
const HOT = [[600, hex('#5A1408')], [900, hex('#C4310A')], [1200, hex('#FF4103')], [1600, hex('#FFB36B')], [2200, hex('#FFE2C4')]];
const VM = [[0, hex('#120A2E')], [0.25, hex('#4B1D8F')], [0.5, hex('#A0288F')], [0.75, hex('#F0607A')], [1.0, hex('#FFD27A')]];
const ramp = (stops, v) => {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
    const f = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]), a = stops[i - 1][1], b = stops[i][1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  return stops.at(-1)[1];
};
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

const read = f => new Float32Array(fs.readFileSync(path.join(run, f)).buffer.slice(0));
const f0 = read(meta.frames[0]);
// flow-line marker: 4 mm bands of the plate's initial depth
const band = new Uint8Array(n);
for (let p = 0; p < n; p++) band[p] = Math.floor(f0[p * 10 + 1] / 0.004) & 1;

const d0 = new Float32Array(W * H), d1 = new Float32Array(W * H), sT = new Float32Array(W * H), sV = new Float32Array(W * H), sB = new Float32Array(W * H), sF = new Float32Array(W * H);
const Yref = [meta.mats[0].Y, meta.mats[1].Y];
let k = 0;
for (let fi = 0; fi < meta.frames.length; fi += every) {
  const b = read(meta.frames[fi]);
  d0.fill(0); d1.fill(0); sT.fill(0); sV.fill(0); sB.fill(0); sF.fill(0);
  for (let p = 0; p < n; p++) {
    const o = p * 10, st = b[o + 9];
    if (!st) continue;
    const py = (Hm - b[o + 1]) * pxPerM, m = b[o + 8];
    for (let side = 0; side < (axi ? 2 : 1); side++) {
    const px = X0 + (side ? -1 : 1) * b[o] * pxPerM;
    const x0 = Math.max(0, Math.ceil(px - R)), x1 = Math.min(W - 1, Math.floor(px + R));
    const y0 = Math.max(0, Math.ceil(py - R)), y1 = Math.min(H - 1, Math.floor(py + R));
    const T = b[o + 5], vm = b[o + 6] / Yref[m], bd = band[p], fl = st === 2 ? 1 : 0;
    for (let yy = y0; yy <= y1; yy++) {
      const wy = (1 - Math.abs(yy - py) / R) * norm;
      for (let xx = x0; xx <= x1; xx++) {
        const w = (1 - Math.abs(xx - px) / R) * wy, id = yy * W + xx;
        if (m === 0) d0[id] += w; else d1[id] += w;
        sT[id] += w * T; sV[id] += w * vm; sB[id] += w * bd; sF[id] += w * fl;
      }
    }
    }
  }
  const img = Buffer.alloc(W * H * 3);
  for (let yy = 0; yy < H; yy++) {
    const g = yy / H, bg = [BG0[0] + (BG1[0] - BG0[0]) * g, BG0[1] + (BG1[1] - BG0[1]) * g, BG0[2] + (BG1[2] - BG0[2]) * g];
    for (let xx = 0; xx < W; xx++) {
      const id = yy * W + xx, d = d0[id] + d1[id];
      let r = bg[0], gg = bg[1], bl = bg[2];
      if (d > 0.03) {
        const a = sstep(0.18, 0.5, d), fr = sstep(0.3, 0.7, d1[id] / d), T = sT[id] / d, fl = sF[id] / d;
        let c;
        if (mode === 'vm') c = ramp(VM, Math.min(1, sV[id] / d));
        else {
          const bd = sstep(0.35, 0.65, sB[id] / d);
          const s = [STEEL[0] + (STEEL_B[0] - STEEL[0]) * bd, STEEL[1] + (STEEL_B[1] - STEEL[1]) * bd, STEEL[2] + (STEEL_B[2] - STEEL[2]) * bd];
          c = [s[0] + (ROD[0] - s[0]) * fr, s[1] + (ROD[1] - s[1]) * fr, s[2] + (ROD[2] - s[2]) * fr];
          const df = fl * 0.55 * (1 - fr * 0.6); // failed material reads as dull debris
          c = [c[0] + (DEBRIS[0] - c[0]) * df, c[1] + (DEBRIS[1] - c[1]) * df, c[2] + (DEBRIS[2] - c[2]) * df];
          if (T > 600) { const h = ramp(HOT, T), ha = sstep(600, 1300, T) * 0.9; c = [c[0] + (h[0] - c[0]) * ha, c[1] + (h[1] - c[1]) * ha, c[2] + (h[2] - c[2]) * ha]; }
        }
        r += (c[0] - r) * a; gg += (c[1] - gg) * a; bl += (c[2] - bl) * a;
      }
      const o = id * 3; img[o] = r; img[o + 1] = gg; img[o + 2] = bl;
    }
  }
  fs.writeFileSync(path.join(out, `r_${String(k++).padStart(4, '0')}.ppm`), Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), img]));
}
console.log(`rendered ${k} frames ${W}x${H} mode=${mode}`);
