// Staggered-grid (MAC) stable-fluids solver for the mushroom-cloud episode (episode-local, not part of pipeline/).
// Cell (i, j) spans [i, i+1] × [j, j+1]; j = 0 is the ground, y grows upward. Units: cells and steps.
//   u[(nx+1)·ny] : horizontal / radial velocity on vertical faces x = i
//   v[nx·(ny+1)] : vertical velocity on horizontal faces y = j
//   th, s, d     : cell-centred potential-temperature anomaly, smoke (or ink), dust
// axi: true → axisymmetric (x = radius r, axis at x = 0): divergence (1/r)∂(r u)/∂r + ∂v/∂y, so a rising
//      thermal becomes a real vortex RING (not a 2D vortex pair). Rendering projects it along the line of sight.
// Buoyancy on v-faces: a = B·(th − thAmb(y)) − W·s. thAmb grows slowly below the tropopause row jt and steeply above
// it (stable stratosphere): the rising parcel loses its buoyancy there and spreads sideways — the cap.
// Deterministic; checkpoints let any step be reached cheaply in any order.

export class Fluid {
  constructor(cfg) {
    this.cfg = {nx: 128, ny: 256, axi: false, B: 0.002, W: 0, eps: 0.08, sor: 40, omega: 1.85, velDamp: 1, thDamp: 1, sDamp: 1, dDamp: 1,
      g1: 0, g2: 0, jt: 1e9, ckEvery: 25, tracers: 0, lid: true, visc: 0, kappa: 0, kappaD: null, axisDamp: 0, mat: 0, ...cfg};
    const {nx, ny} = this.cfg;
    Object.assign(this, {nx, ny, n: nx * ny, axi: !!this.cfg.axi});
    this.u = new Float32Array((nx + 1) * ny); this.u0 = new Float32Array((nx + 1) * ny);
    this.v = new Float32Array(nx * (ny + 1)); this.v0 = new Float32Array(nx * (ny + 1));
    for (const k of ['th', 's', 'd', 'a0', 'a1', 'a2', 'p', 'div', 'w', 'aw', 'fx', 'fy', 'ar', 'az', 'br', 'bz']) this[k] = new Float32Array(nx * ny);
    this.fields = ['u', 'v', 'th', 's', 'd', 'p', 'tx', 'ty', 'tage', 'tk', ...(this.cfg.mat ? ['ar', 'az', 'br', 'bz'] : [])];
    this.thAmb = new Float32Array(ny + 1);   // at face heights y = j
    for (let j = 0; j <= ny; j++) this.thAmb[j] = this.ambAt(j);
    this.aR = new Float32Array(nx); this.aL = new Float32Array(nx);
    for (let i = 0; i < nx; i++) {
      const rc = this.axi ? i + 0.5 : 1;
      this.aR[i] = i < nx - 1 ? (this.axi ? (i + 1) / rc : 1) : 0;
      this.aL[i] = i > 0 ? (this.axi ? i / rc : 1) : 0;
    }
    this.nt = this.cfg.tracers;
    this.tx = new Float32Array(this.nt); this.ty = new Float32Array(this.nt); this.tage = new Float32Array(this.nt); this.tk = new Float32Array(this.nt);
    this.cks = new Map(); this.stepNo = 0;
    this.reset();
  }
  ambAt(y) { const {g1, g2, jt} = this.cfg; return g1 * Math.min(y, jt) + g2 * Math.max(0, y - jt); }
  reset() {
    this.u.fill(0); this.v.fill(0); this.s.fill(0); this.d.fill(0); this.p.fill(0);
    for (let j = 0; j < this.ny; j++) this.th.fill(this.ambAt(j + 0.5), j * this.nx, (j + 1) * this.nx);
    this.stepNo = 0; this.cks.clear();
    if (this.cfg.mat) { this.resetMat('a'); this.resetMat('b'); }
    this.cfg.init?.(this);
    this.cfg.initTracers?.(this);
    this.checkpoint();
  }
  checkpoint() { if (!this.cks.has(this.stepNo)) this.cks.set(this.stepNo, Object.fromEntries(this.fields.map(f => [f, this[f].slice()]))); }
  restore(k) { const c = this.cks.get(k); for (const f of this.fields) this[f].set(c[f]); this.stepNo = k; }
  /** material (texture) coordinates: identity map, then carried by the flow; two layers reset half a period apart */
  resetMat(layer) {
    const {nx, ny} = this, R = this[layer + 'r'], Z = this[layer + 'z'], off = layer === 'a' ? 0 : 517.3;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { R[i + j * nx] = i + 0.5 + off; Z[i + j * nx] = j + 0.5 - off * 0.37; }
  }
  /** blend weights of the two material layers at the current step (sum = 1; a layer has weight 0 when it is reset) */
  matWeights() { const T = this.cfg.mat, ph = (this.stepNo % T) / T, wa = Math.sin(Math.PI * ph) ** 2; return [wa, 1 - wa]; }
  /** bring the state to step k (forward, or back through the nearest checkpoint) */
  goto(k) {
    k = Math.max(0, Math.round(k));
    if (k === this.stepNo) return this;
    if (k < this.stepNo || k - this.stepNo > this.cfg.ckEvery * 2) {
      let best = 0; for (const key of this.cks.keys()) if (key <= k && key > best) best = key;
      if (!(k >= this.stepNo && this.stepNo >= best)) this.restore(best);
    }
    while (this.stepNo < k) this.step();
    return this;
  }
  // ---------- sampling (x, y in cell units; centres at i + 0.5) ----------
  sampleC(f, x, y) {
    const {nx, ny} = this;
    let X = x - 0.5, Y = y - 0.5;
    X = X < 0 ? 0 : X > nx - 1.0001 ? nx - 1.0001 : X; Y = Y < 0 ? 0 : Y > ny - 1.0001 ? ny - 1.0001 : Y;
    const i = X | 0, j = Y | 0, a = X - i, b = Y - j, k = i + j * nx;
    return (f[k] * (1 - a) + f[k + 1] * a) * (1 - b) + (f[k + nx] * (1 - a) + f[k + nx + 1] * a) * b;
  }
  sampleU(x, y, u = this.u) {
    const {nx, ny} = this, W = nx + 1;
    let X = x, Y = y - 0.5;
    X = X < 0 ? 0 : X > nx - 0.0001 ? nx - 0.0001 : X; Y = Y < 0 ? 0 : Y > ny - 1.0001 ? ny - 1.0001 : Y;
    const i = X | 0, j = Y | 0, a = X - i, b = Y - j, k = i + j * W;
    return (u[k] * (1 - a) + u[k + 1] * a) * (1 - b) + (u[k + W] * (1 - a) + u[k + W + 1] * a) * b;
  }
  sampleV(x, y, v = this.v) {
    const {nx, ny} = this;
    let X = x - 0.5, Y = y;
    X = X < 0 ? 0 : X > nx - 1.0001 ? nx - 1.0001 : X; Y = Y < 0 ? 0 : Y > ny - 0.0001 ? ny - 0.0001 : Y;
    const i = X | 0, j = Y | 0, a = X - i, b = Y - j, k = i + j * nx;
    return (v[k] * (1 - a) + v[k + 1] * a) * (1 - b) + (v[k + nx] * (1 - a) + v[k + nx + 1] * a) * b;
  }
  // ---------- advection ----------
  advectVel() {
    const {nx, ny, u, v, u0, v0} = this, W = nx + 1;
    u0.set(u); v0.set(v);
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const x = i, y = j + 0.5, ux = u0[i + j * W], vy = this.sampleV(x, y, v0);
      u[i + j * W] = this.sampleU(x - ux, y - vy, u0);
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = i + 0.5, y = j, vy = v0[i + j * nx], ux = this.sampleU(x, y, u0);
      v[i + j * nx] = this.sampleV(x - ux, y - vy, v0);
    }
  }
  advectC(dst, src, sign) {
    const {nx, ny, u, v} = this, U = nx + 1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = i + j * nx, ux = 0.5 * (u[i + j * U] + u[i + 1 + j * U]), vy = 0.5 * (v[k] + v[k + nx]);
      dst[k] = this.sampleC(src, i + 0.5 - sign * ux, j + 0.5 - sign * vy);
    }
  }
  /** MacCormack with min/max clamp (sharp edges, no new extrema) */
  advectMC(f) {
    const {nx, ny, a0, a1, a2, u, v} = this, U = nx + 1;
    this.advectC(a0, f, 1); this.advectC(a1, a0, -1);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = i + j * nx, ux = 0.5 * (u[i + j * U] + u[i + 1 + j * U]), vy = 0.5 * (v[k] + v[k + nx]);
      let X = i - ux, Y = j - vy;
      X = X < 0 ? 0 : X > nx - 1.0001 ? nx - 1.0001 : X; Y = Y < 0 ? 0 : Y > ny - 1.0001 ? ny - 1.0001 : Y;
      const q = (X | 0) + (Y | 0) * nx, m0 = f[q], m1 = f[q + 1], m2 = f[q + nx], m3 = f[q + nx + 1];
      const lo = Math.min(m0, m1, m2, m3), hi = Math.max(m0, m1, m2, m3), val = a0[k] + 0.5 * (f[k] - a1[k]);
      a2[k] = val < lo ? lo : val > hi ? hi : val;
    }
    f.set(a2);
  }
  // ---------- explicit diffusion (5-point Laplacian; stable for coefficient ≤ 0.2) ----------
  diffuse(f, w, h, c, tmp) {
    if (!(c > 0)) return;
    tmp.set(f.subarray(0, w * h));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = i + j * w, x0 = tmp[k];
      const l = i > 0 ? tmp[k - 1] : x0, r = i < w - 1 ? tmp[k + 1] : x0, b = j > 0 ? tmp[k - w] : x0, t = j < h - 1 ? tmp[k + w] : x0;
      f[k] = x0 + c * (l + r + b + t - 4 * x0);
    }
  }
  // ---------- forces ----------
  forces() {
    const {nx, ny, u, v, th, s, w, aw, fx, fy} = this, {B, W, eps} = this.cfg, U = nx + 1;
    for (let j = 1; j < ny; j++) {
      const ta = this.thAmb[j];
      for (let i = 0; i < nx; i++) {
        const kb = i + (j - 1) * nx, kt = i + j * nx;
        v[i + j * nx] += B * (0.5 * (th[kb] + th[kt]) - ta) - W * 0.5 * (s[kb] + s[kt]);
      }
    }
    if (eps > 0) {
      w.fill(0); aw.fill(0);
      for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const vR = 0.5 * (v[i + 1 + j * nx] + v[i + 1 + (j + 1) * nx]), vL = 0.5 * (v[i - 1 + j * nx] + v[i - 1 + (j + 1) * nx]);
        const uT = 0.5 * (u[i + (j + 1) * U] + u[i + 1 + (j + 1) * U]), uB = 0.5 * (u[i + (j - 1) * U] + u[i + 1 + (j - 1) * U]);
        const k = i + j * nx; w[k] = 0.5 * (vR - vL - uT + uB); aw[k] = Math.abs(w[k]);
      }
      fx.fill(0); fy.fill(0);
      for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) {
        const k = i + j * nx;
        let gx = 0.5 * (aw[k + 1] - aw[k - 1]), gy = 0.5 * (aw[k + nx] - aw[k - nx]);
        const L = Math.hypot(gx, gy) + 1e-6; gx /= L; gy /= L;
        fx[k] = eps * gy * w[k]; fy[k] = -eps * gx * w[k];
      }
      for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) u[i + j * U] += 0.5 * (fx[i - 1 + j * nx] + fx[i + j * nx]);
      for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) v[i + j * nx] += 0.5 * (fy[i + (j - 1) * nx] + fy[i + j * nx]);
    }
  }
  // ---------- projection ----------
  project() {
    const {nx, ny, u, v, p, div, aR, aL, axi} = this, U = nx + 1, om = this.cfg.omega;
    for (let j = 0; j < ny; j++) { u[j * U] = 0; u[nx + j * U] = 0; }
    for (let i = 0; i < nx; i++) { v[i] = 0; if (this.cfg.lid) v[i + ny * nx] = 0; }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const rc = axi ? i + 0.5 : 1, wr = axi ? i + 1 : 1, wl = axi ? i : 1;
      div[i + j * nx] = (wr * u[i + 1 + j * U] - wl * u[i + j * U]) / rc + v[i + (j + 1) * nx] - v[i + j * nx];
    }
    for (let it = 0; it < this.cfg.sor; it++) for (let col = 0; col < 2; col++) {
      for (let j = 0; j < ny; j++) {
        const hasB = j > 0, hasT = j < ny - 1;
        for (let i = (j + col) & 1; i < nx; i += 2) {
          const k = i + j * nx, a = aR[i], b = aL[i];
          const num = (a ? a * p[k + 1] : 0) + (b ? b * p[k - 1] : 0) + (hasB ? p[k - nx] : 0) + (hasT ? p[k + nx] : 0) - div[k];
          const den = a + b + (hasB ? 1 : 0) + (hasT ? 1 : 0);
          p[k] += om * (num / den - p[k]);
        }
      }
    }
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) u[i + j * U] -= p[i + j * nx] - p[i - 1 + j * nx];
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) v[i + j * nx] -= p[i + j * nx] - p[i + (j - 1) * nx];
  }
  step() {
    const c = this.cfg;
    c.sources?.(this);
    this.forces();
    this.advectVel();
    if (c.velDamp !== 1) { for (let k = 0; k < this.u.length; k++) this.u[k] *= c.velDamp; for (let k = 0; k < this.v.length; k++) this.v[k] *= c.velDamp; }
    if (c.ground) for (let i = 1; i < this.nx; i++) this.u[i] *= c.ground;
    if (c.visc > 0) { this.tmpU ||= new Float32Array(this.u.length); this.tmpV ||= new Float32Array(this.v.length);
      this.diffuse(this.u, this.nx + 1, this.ny, c.visc, this.tmpU); this.diffuse(this.v, this.nx, this.ny + 1, c.visc, this.tmpV); }
    if (c.axisDamp > 0) { const {v, nx} = this; for (let j = 1; j < this.ny; j++) for (let i = 0; i < 3; i++) { const k = i + j * nx, nb = v[3 + j * nx]; v[k] += c.axisDamp * (1 - i / 3) * (nb - v[k]); } }
    this.project();
    { const {u, v} = this, L = 2.0; for (let k = 0; k < u.length; k++) u[k] = u[k] > L ? L : u[k] < -L ? -L : u[k]; for (let k = 0; k < v.length; k++) v[k] = v[k] > L ? L : v[k] < -L ? -L : v[k]; }
    this.advectMC(this.th); this.advectMC(this.s); this.advectMC(this.d);
    if (c.mat) { this.advectC(this.a0, this.ar, 1); this.ar.set(this.a0); this.advectC(this.a0, this.az, 1); this.az.set(this.a0); this.advectC(this.a0, this.br, 1); this.br.set(this.a0); this.advectC(this.a0, this.bz, 1); this.bz.set(this.a0); }
    if (c.kappa > 0) { this.diffuse(this.th, this.nx, this.ny, c.kappa, this.a0); this.diffuse(this.s, this.nx, this.ny, c.kappa, this.a0); this.diffuse(this.d, this.nx, this.ny, c.kappaD ?? c.kappa, this.a0); }
    if (c.thDamp !== 1) { const {th, nx} = this; for (let k = 0; k < this.n; k++) { const ta = this.ambAt(((k / nx) | 0) + 0.5); th[k] = ta + (th[k] - ta) * c.thDamp; } }
    if (c.sDamp !== 1) { const s = this.s; for (let k = 0; k < this.n; k++) s[k] *= c.sDamp; }
    if (c.dDamp !== 1) { const d = this.d; for (let k = 0; k < this.n; k++) d[k] *= c.dDamp; }
    if (this.nt) {
      const {tx, ty, tage} = this;
      for (let q = 0; q < this.nt; q++) {
        const ux = this.sampleU(tx[q], ty[q]), vy = this.sampleV(tx[q], ty[q]);
        const mx = tx[q] + 0.5 * ux, my = ty[q] + 0.5 * vy;
        tx[q] += this.sampleU(mx, my); ty[q] += this.sampleV(mx, my); tage[q] += 1;
        if (this.axi && tx[q] < 0) tx[q] = -tx[q];
      }
      c.respawn?.(this);
    }
    this.stepNo++;
    if (c.mat) { const T = c.mat; if (this.stepNo % T === 0) this.resetMat('a'); if ((this.stepNo + T / 2) % T === 0) this.resetMat('b'); }
    if (this.stepNo % c.ckEvery === 0) this.checkpoint();
  }
  /** smoke-weighted mean vertical speed (cells/step) */
  riseSpeed() {
    const {nx, ny, s, v} = this; let a = 0, b = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx, wgt = s[k] * (this.axi ? i + 0.5 : 1); a += wgt * 0.5 * (v[k] + v[k + nx]); b += wgt; }
    return b > 1e-6 ? a / b : 0;
  }
  topRow(thr = 0.03) {
    const {nx, ny, s} = this;
    for (let j = ny - 1; j >= 0; j--) { const o = j * nx; for (let i = 0; i < nx; i++) if (s[o + i] >= thr) return j; }
    return 0;
  }
  spread(thr = 0.03, j0 = 0, j1 = this.ny) {
    const {nx, s} = this; let m = 0;
    for (let j = j0; j < j1; j++) { const o = j * nx; for (let i = nx - 1; i > m; i--) if (s[o + i] >= thr) { m = i; break; } }
    return m;
  }
}

/** Line-of-sight projection of an axisymmetric field: column density at screen offset X (cells from the axis), row j.
 *  Output Float32Array (2·nx) × ny; column index = nx + X for X ∈ [−nx, nx). */
export class Projector {
  constructor(nx, ny) {
    this.nx = nx; this.ny = ny; this.tab = [];
    for (let a = 0; a < nx; a++) {
      const lo = [], fr = [], xa = a + 0.5;
      for (let b = 0; ; b++) {
        const r = Math.hypot(xa, b + 0.5); if (r >= nx) break;
        const X = Math.max(0, r - 0.5), i = Math.min(X | 0, nx - 2); lo.push(i); fr.push(Math.min(1, X - i));
      }
      this.tab.push({lo: Int32Array.from(lo), fr: Float32Array.from(fr)});
    }
  }
  run(f, out = new Float32Array(2 * this.nx * this.ny)) {
    const {nx, ny, tab} = this, W = 2 * nx;
    for (let a = 0; a < nx; a++) {
      const {lo, fr} = tab[a], m = lo.length;
      for (let j = 0; j < ny; j++) {
        const o = j * nx; let sum = 0;
        for (let q = 0; q < m; q++) { const i = o + lo[q]; sum += f[i] + (f[i + 1] - f[i]) * fr[q]; }
        sum *= 2; out[nx + a + j * W] = sum; out[nx - 1 - a + j * W] = sum;
      }
    }
    return out;
  }
}
