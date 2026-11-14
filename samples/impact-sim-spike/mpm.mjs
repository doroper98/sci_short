// 충돌 시뮬레이션 가능성 시험 (2026-11-14). 표준 도구가 아닌 시안입니다 — README.md 를 먼저 읽으세요.
// 2D MLS-MPM (APIC, quadratic B-spline), hypoelastic J2 plasticity + linear EOS, SI units.
//   기본: 평면 변형(plane strain) — 막대가 '무한히 넓은 판'이 되어 경사 충돌이 크게 과장됩니다.
//   --axi=1: 축대칭(r, z) — 수직 충돌의 원기둥 막대. 이 모드만 이론값과 대조했습니다.
// 검증된 충돌 해석 프로그램이 아닌 설명 모형입니다. 수치는 격자 크기에 따라 달라집니다.
// usage: node mpm.mjs --out=DIR [--axi=1] [--dx=0.5e-3] [--v=1600] [--angle=0] [--W=0.08] [--H=0.16] [--plate=0.07] [--plateTop=0.105]
//                     [--rodL=0.05] [--rodD=0.005] [--rodRho=17600] [--target=steel|rock] [--T=120e-6] [--frames=120] [--cfl=0.25]
import fs from 'node:fs';
import path from 'node:path';

const A = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const num = (k, d) => (A[k] !== undefined ? Number(A[k]) : d);
const out = A.out || './run';
fs.mkdirSync(out, {recursive: true});

const dx = num('dx', 0.5e-3), inv = 1 / dx;
const Wm = num('W', 0.08), Hm = num('H', 0.16);
const axi = A.axi === '1', ia = axi ? 2 : 0; // axisymmetric (r,z): axis at grid column ia, two ghost columns
const nx = Math.round(Wm / dx) + 1 + ia, ny = Math.round(Hm / dx) + 1;
const V0 = num('v', 1600), angleDeg = num('angle', 0);
const plateT = num('plate', 0.07), plateTop = num('plateTop', 0.105);
const rodL = num('rodL', 0.05), rodD = num('rodD', 0.005);
const Tend = num('T', 120e-6), nFrames = num('frames', 120);

// material table: 0 = target, 1 = penetrator
const tgt = A.target || 'steel';
const TARGETS = {
  steel: {name: 'RHA-like steel', rho: 7850, K: 165e9, G: 80e9, Y: 1.0e9, cp: 470, Tm: 1800, epsF: 1.5},
  // rock 은 검증되지 않았습니다(2026-11-14: 3 km/s 에서 200 mm 블록을 그대로 관통). 압력 의존 강도 모형으로 바꿔야 합니다.
  rock: {name: 'rock/concrete-like', rho: 2400, K: 30e9, G: 15e9, Y: 0.15e9, cp: 800, Tm: 1500, epsF: 0.3},
};
const mats = [
  TARGETS[tgt],
  {name: 'tungsten alloy', rho: num('rodRho', 17600), K: 290e9, G: 140e9, Y: 1.5e9, cp: 134, Tm: 1723, epsF: 1.0},
];
for (const m of mats) m.c = Math.sqrt((m.K + 4 * m.G / 3) / m.rho);
const cmax = Math.max(...mats.map(m => m.c));
const dt = num('cfl', 0.25) * dx / (cmax + Math.abs(V0));
const nSteps = Math.ceil(Tend / dt);
const frameEvery = Math.max(1, Math.floor(nSteps / nFrames));

// ---- particles ----
const ppc = 2; // per axis
const sp = dx / ppc, vol0 = sp * sp; // per unit depth
const P = [];
function addBlock(inside, mat, vx, vy, x0, x1, y0, y1) {
  for (let yy = y0 + sp / 2; yy < y1; yy += sp) for (let xx = x0 + sp / 2; xx < x1; xx += sp) if (inside(xx, yy)) P.push([xx, yy, vx, vy, mat]);
}
const margin = 3 * dx;
// plate spans the whole width (clamped at side walls)
addBlock(() => true, 0, 0, 0, axi ? 0 : margin, Wm - margin, plateTop - plateT, plateTop);
// rod: axis tilted by angle from the plate normal (−y), nose just above the surface
const th = angleDeg * Math.PI / 180;
const dirx = Math.sin(th), diry = -Math.cos(th); // flight direction
const noseX = axi ? 0 : num('noseX', Wm / 2 - Math.sin(th) * 0.012), noseY = plateTop + 0.0015;
const noseLen = rodD * 1.5;
function inRod(x, y) {
  const rx = x - noseX, ry = y - noseY;
  const s = -(rx * dirx + ry * diry); // distance back from nose tip along the axis
  const r = Math.abs(rx * (-diry) + ry * dirx);
  if (s < 0 || s > rodL) return false;
  const half = s < noseLen ? (rodD / 2) * (0.25 + 0.75 * s / noseLen) : rodD / 2;
  return r <= half;
}
addBlock(inRod, 1, V0 * dirx, V0 * diry, axi ? 0 : margin, Wm - margin, plateTop, Hm - margin);

const n = P.length;
const x = new Float64Array(n), y = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
const C00 = new Float64Array(n), C01 = new Float64Array(n), C10 = new Float64Array(n), C11 = new Float64Array(n);
const J = new Float64Array(n).fill(1), sxx = new Float64Array(n), syy = new Float64Array(n), szz = new Float64Array(n), sxy = new Float64Array(n);
const eps = new Float64Array(n), Tk = new Float64Array(n).fill(300), q = new Float64Array(n), seqA = new Float64Array(n), prA = new Float64Array(n);
const mat = new Uint8Array(n), failed = new Uint8Array(n), alive = new Uint8Array(n).fill(1);
for (let p = 0; p < n; p++) { [x[p], y[p], vx[p], vy[p]] = P[p]; mat[p] = P[p][4]; }
const pm = new Float64Array(n), pv = new Float64Array(n); // axisymmetric: per radian (weighted by initial radius)
for (let p = 0; p < n; p++) { pv[p] = vol0 * (axi ? x[p] : 1); pm[p] = mats[mat[p]].rho * pv[p]; }

const gm = new Float64Array(nx * ny), gvx = new Float64Array(nx * ny), gvy = new Float64Array(nx * ny);
const xmin = axi ? -1 : 2 * dx, xmax = Wm - 2 * dx, ymin = 2 * dx, ymax = Hm - 2 * dx;
const b1 = 0.15, b2 = 1.5, beta = 0.9;

function step() {
  gm.fill(0); gvx.fill(0); gvy.fill(0);
  const k0 = -dt * 4 * inv * inv;
  for (let p = 0; p < n; p++) {
    if (!alive[p]) continue;
    const m = mats[mat[p]], mp = pm[p];
    const X = x[p] * inv + ia, Y = y[p] * inv;
    const bx = Math.floor(X - 0.5), by = Math.floor(Y - 0.5);
    const fx = X - bx, fy = Y - by;
    const wx0 = 0.5 * (1.5 - fx) * (1.5 - fx), wx1 = 0.75 - (fx - 1) * (fx - 1), wx2 = 0.5 * (fx - 0.5) * (fx - 0.5);
    const wy0 = 0.5 * (1.5 - fy) * (1.5 - fy), wy1 = 0.75 - (fy - 1) * (fy - 1), wy2 = 0.5 * (fy - 0.5) * (fy - 0.5);
    const Jp = J[p];
    let pr = m.K * (1 / Jp - 1) + q[p];
    if (failed[p] && pr < 0) pr = 0;
    prA[p] = pr;
    const k = k0 * pv[p] * Jp;
    const hoop = axi ? -dt * pv[p] * Jp * (szz[p] - pr) / x[p] : 0;
    const a00 = k * (sxx[p] - pr) + mp * C00[p], a01 = k * sxy[p] + mp * C01[p];
    const a10 = k * sxy[p] + mp * C10[p], a11 = k * (syy[p] - pr) + mp * C11[p];
    const mvx = mp * vx[p], mvy = mp * vy[p];
    for (let j = 0; j < 3; j++) {
      const wy = j === 0 ? wy0 : j === 1 ? wy1 : wy2, dpy = (j - fy) * dx, row = (by + j) * nx + bx;
      for (let i = 0; i < 3; i++) {
        const w = (i === 0 ? wx0 : i === 1 ? wx1 : wx2) * wy, dpx = (i - fx) * dx, id = row + i;
        gm[id] += w * mp;
        gvx[id] += w * (mvx + a00 * dpx + a01 * dpy + hoop);
        gvy[id] += w * (mvy + a10 * dpx + a11 * dpy);
      }
    }
  }
  if (axi) for (let j = 0; j < ny; j++) for (let k = 1; k <= 2; k++) { // fold ghost columns onto their mirror images
    const g = j * nx + ia - k, r = j * nx + ia + k;
    gm[r] += gm[g]; gvx[r] -= gvx[g]; gvy[r] += gvy[g]; gm[g] = 0;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = j * nx + i, m = gm[id];
    if (m > 0) {
      if ((!axi && i < 3) || i > nx - 4) { gvx[id] = 0; gvy[id] = 0; } // clamped side walls
      else { gvx[id] /= m; gvy[id] /= m; }
    }
  }
  if (axi) for (let j = 0; j < ny; j++) { // symmetry: v_r odd, v_z even about the axis
    const a = j * nx + ia; gvx[a] = 0;
    for (let k = 1; k <= 2; k++) { gvx[a - k] = -gvx[a + k]; gvy[a - k] = gvy[a + k]; }
  }
  const c4 = 4 * inv * inv;
  for (let p = 0; p < n; p++) {
    if (!alive[p]) continue;
    const m = mats[mat[p]];
    const X = x[p] * inv + ia, Y = y[p] * inv;
    const bx = Math.floor(X - 0.5), by = Math.floor(Y - 0.5);
    const fx = X - bx, fy = Y - by;
    const wx0 = 0.5 * (1.5 - fx) * (1.5 - fx), wx1 = 0.75 - (fx - 1) * (fx - 1), wx2 = 0.5 * (fx - 0.5) * (fx - 0.5);
    const wy0 = 0.5 * (1.5 - fy) * (1.5 - fy), wy1 = 0.75 - (fy - 1) * (fy - 1), wy2 = 0.5 * (fy - 0.5) * (fy - 0.5);
    let nvx = 0, nvy = 0, c00 = 0, c01 = 0, c10 = 0, c11 = 0;
    for (let j = 0; j < 3; j++) {
      const wy = j === 0 ? wy0 : j === 1 ? wy1 : wy2, dpy = (j - fy) * dx, row = (by + j) * nx + bx;
      for (let i = 0; i < 3; i++) {
        const w = (i === 0 ? wx0 : i === 1 ? wx1 : wx2) * wy, dpx = (i - fx) * dx, id = row + i;
        const gx = gvx[id], gy = gvy[id];
        nvx += w * gx; nvy += w * gy;
        c00 += w * gx * dpx; c01 += w * gx * dpy; c10 += w * gy * dpx; c11 += w * gy * dpy;
      }
    }
    c00 *= c4; c01 *= c4; c10 *= c4; c11 *= c4;
    vx[p] = nvx; vy[p] = nvy; C00[p] = c00; C01[p] = c01; C10[p] = c10; C11[p] = c11;
    x[p] += dt * nvx; y[p] += dt * nvy;
    if (axi && x[p] < 0.02 * dx) { x[p] = 0.02 * dx; if (vx[p] < 0) vx[p] = 0; }
    if (x[p] < xmin || x[p] > xmax || y[p] < ymin || y[p] > ymax) { alive[p] = 0; continue; }
    // --- constitutive update ---
    const dtt = axi ? nvx / x[p] : 0; // hoop strain rate v_r / r
    const trD = c00 + c11 + dtt;
    let Jn = J[p] * (1 + dt * trD);
    if (Jn < 0.3) Jn = 0.3;
    if (failed[p] && Jn > 1) Jn = 1; // debris keeps no memory of expansion
    J[p] = Jn;
    const rho = m.rho / Jn;
    q[p] = trD < 0 ? rho * (b1 * m.c * dx * -trD + b2 * dx * dx * trD * trD) : 0;
    if (failed[p]) { sxx[p] = syy[p] = szz[p] = sxy[p] = 0; seqA[p] = 0; continue; }
    const t3 = trD / 3, dxy = 0.5 * (c01 + c10), w = 0.5 * (c01 - c10), G2 = 2 * m.G;
    const oxx = sxx[p], oyy = syy[p], oxy = sxy[p];
    let nxx = oxx + dt * (G2 * (c00 - t3) + 2 * w * oxy);
    let nyy = oyy + dt * (G2 * (c11 - t3) - 2 * w * oxy);
    let nzz = szz[p] + dt * (G2 * (dtt - t3));
    let nxy = oxy + dt * (G2 * dxy + w * (oyy - oxx));
    const seq = Math.sqrt(1.5 * (nxx * nxx + nyy * nyy + nzz * nzz) + 3 * nxy * nxy);
    const soft = Math.max(0.05, 1 - (Tk[p] - 300) / (m.Tm - 300));
    const Yc = m.Y * soft;
    if (seq > Yc) {
      const f = Yc / seq; nxx *= f; nyy *= f; nzz *= f; nxy *= f;
      const de = (seq - Yc) / (3 * m.G);
      eps[p] += de;
      Tk[p] += beta * Yc * de / (rho * m.cp);
      if (eps[p] > m.epsF) failed[p] = 1;
      seqA[p] = Yc;
    } else seqA[p] = seq;
    sxx[p] = nxx; syy[p] = nyy; szz[p] = nzz; sxy[p] = nxy;
  }
}

// ---- run ----
const meta = {axi, dx, Wm, Hm, nx, ny, n, dt, nSteps, frameEvery, V0, angleDeg, plateT, plateTop, rodL, rodD, mats, fields: ['x', 'y', 'vx', 'vy', 'eps', 'T', 'seq', 'p', 'mat', 'state'], frames: [], diag: []};
console.log(`grid ${nx}x${ny}, particles ${n}, dt ${(dt * 1e9).toFixed(2)} ns, steps ${nSteps}, frame every ${frameEvery}`);
const t0 = Date.now();
let fcount = 0;
function dump(stepNo) {
  const buf = new Float32Array(n * 10);
  let tail = -1e9, nose = 1e9, rodKE = 0, tailV = 0, tailN = 0;
  for (let p = 0; p < n; p++) {
    const o = p * 10;
    buf[o] = x[p]; buf[o + 1] = y[p]; buf[o + 2] = vx[p]; buf[o + 3] = vy[p]; buf[o + 4] = eps[p]; buf[o + 5] = Tk[p]; buf[o + 6] = seqA[p]; buf[o + 7] = prA[p];
    buf[o + 8] = mat[p]; buf[o + 9] = alive[p] ? (failed[p] ? 2 : 1) : 0;
    if (alive[p] && mat[p] === 1) {
      const s = -((x[p] - noseX) * dirx + (y[p] - noseY) * diry); // along-axis coordinate (0 at initial nose, + backwards)
      if (-s < nose) nose = -s; // most forward
      if (!failed[p] && eps[p] < 0.05) { if (s > tail) tail = s; }
      rodKE += 0.5 * pm[p] * (vx[p] * vx[p] + vy[p] * vy[p]);
    }
  }
  // speed of still-intact rod tail (undeformed particles)
  for (let p = 0; p < n; p++) if (alive[p] && mat[p] === 1 && eps[p] < 0.05) { tailV += Math.hypot(vx[p], vy[p]); tailN++; }
  let deep = 1e9; // deepest penetrator particle below the original surface
  for (let p = 0; p < n; p++) if (alive[p] && mat[p] === 1 && y[p] < deep) deep = y[p];
  const t = stepNo * dt;
  const d = {frame: fcount, t, depth: plateTop - deep, intactN: tailN, intactV: tailN ? tailV / tailN : 0, rodKE};
  meta.diag.push(d); meta.frames.push(`f_${String(fcount).padStart(4, '0')}.bin`);
  fs.writeFileSync(path.join(out, meta.frames.at(-1)), Buffer.from(buf.buffer));
  fcount++;
  return d;
}
dump(0);
for (let s = 1; s <= nSteps; s++) {
  step();
  if (s % frameEvery === 0) {
    const d = dump(s);
    if (fcount % 10 === 0) console.log(`t=${(d.t * 1e6).toFixed(1)}us depth=${(d.depth * 1e3).toFixed(1)}mm intact=${d.intactN} v_intact=${d.intactV.toFixed(0)} m/s  wall=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
meta.wallSec = (Date.now() - t0) / 1000;
meta.particleStepsPerSec = n * nSteps / meta.wallSec;
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta));
console.log(`done ${meta.wallSec.toFixed(1)} s, ${(meta.particleStepsPerSec / 1e6).toFixed(2)} M particle-steps/s`);
