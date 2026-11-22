// 55 신의 지팡이 — 시뮬레이션 스냅숏(f_*.bin, 입자) → 장면이 읽는 단면 장(field) 한 파일.
// 입자를 반쪽 단면(r ≥ 0, z) 격자에 퍼뜨려(render.mjs 와 같은 삼각 커널) 채널 6개를 Uint8 로 저장한다.
//   0 표적(바위) 덮임  1 막대 덮임  2 온도(K/12)  3 처음 깊이의 띠(지층 표시)  4 압력 log10(p/1e7)/3 (10 MPa..10 GPa → 0..1)  5 부서진 비율
// usage: node bake.mjs --run=DIR --out=FILE.bin [--cell=1.25e-4] [--every=1]
//   FILE.bin = [u32 헤더 길이][JSON 헤더][프레임마다 nr*nz*6 바이트]
import fs from 'node:fs';
import path from 'node:path';

const A = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const run = A.run, outFile = A.out, every = Number(A.every || 1);
const meta = JSON.parse(fs.readFileSync(path.join(run, 'meta.json'), 'utf8'));
const {Wm, Hm, dx, n} = meta;
const cell = Number(A.cell || dx / 2), nr = Math.round(Wm / cell), nz = Math.round(Hm / cell), NC = 6;
const sp = dx / 2 / cell, R = Math.max(1.6, 1.6 * sp), norm = (sp * sp) / (R * R);
const read = f => new Float32Array(fs.readFileSync(path.join(run, f)).buffer.slice(0));
const f0 = read(meta.frames[0]);
const band = new Uint8Array(n);
for (let p = 0; p < n; p++) band[p] = Math.floor((meta.plateTop - f0[p * 10 + 1]) / (meta.rodL * 0.25)) & 1;   // 막대 길이의 1/4 두께 띠

const frames = [];
for (let fi = 0; fi < meta.frames.length; fi += every) frames.push(fi);
const header = {Wm, Hm, dx, cell, nr, nz, NC, plateTop: meta.plateTop, rodL: meta.rodL, rodD: meta.rodD, V0: meta.V0,
  times: frames.map(fi => meta.diag[fi].t), diag: frames.map(fi => meta.diag[fi]), mats: meta.mats.map(m => ({name: m.name, rho: m.rho}))};
const hb = Buffer.from(JSON.stringify(header)), fd = fs.openSync(outFile, 'w'), len = Buffer.alloc(4);
len.writeUInt32LE(hb.length); fs.writeSync(fd, len); fs.writeSync(fd, hb);
const d0 = new Float32Array(nr * nz), d1 = new Float32Array(nr * nz), sT = new Float32Array(nr * nz), sB = new Float32Array(nr * nz), sP = new Float32Array(nr * nz), sF = new Float32Array(nr * nz);
for (const fi of frames) {
  const b = read(meta.frames[fi]);
  d0.fill(0); d1.fill(0); sT.fill(0); sB.fill(0); sP.fill(0); sF.fill(0);
  for (let p = 0; p < n; p++) {
    const o = p * 10, st = b[o + 9];
    if (!st) continue;
    const px = b[o] / cell, py = b[o + 1] / cell, m = b[o + 8];
    const x0 = Math.max(0, Math.ceil(px - R)), x1 = Math.min(nr - 1, Math.floor(px + R));
    const y0 = Math.max(0, Math.ceil(py - R)), y1 = Math.min(nz - 1, Math.floor(py + R));
    const T = b[o + 5], pr = b[o + 7], pl = pr > 1e7 ? Math.min(1, Math.log10(pr / 1e7) / 3) : 0, bd = band[p], fl = st === 2 ? 1 : 0;
    for (let yy = y0; yy <= y1; yy++) {
      const wy = (1 - Math.abs(yy - py) / R) * norm;
      for (let xx = x0; xx <= x1; xx++) {
        const w = (1 - Math.abs(xx - px) / R) * wy, id = yy * nr + xx;
        if (m === 0) d0[id] += w; else d1[id] += w;
        sT[id] += w * T; sB[id] += w * bd; sP[id] += w * pl; sF[id] += w * fl;
      }
    }
  }
  const buf = Buffer.alloc(nr * nz * NC);
  for (let id = 0; id < nr * nz; id++) {
    const d = d0[id] + d1[id], o = id * NC;
    buf[o] = Math.min(255, Math.round(d0[id] * 200)); buf[o + 1] = Math.min(255, Math.round(d1[id] * 200));
    if (d > 0.02) {
      buf[o + 2] = Math.min(255, Math.round(sT[id] / d / 12)); buf[o + 3] = Math.round(255 * sB[id] / d);
      buf[o + 4] = Math.round(255 * Math.min(1, sP[id] / d)); buf[o + 5] = Math.round(255 * sF[id] / d);
    }
  }
  fs.writeSync(fd, buf);
}
fs.closeSync(fd);
console.log(`baked ${frames.length} frames ${nr}x${nz} → ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
