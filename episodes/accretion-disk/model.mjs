// Model for "강착원반" (episode 36): a star torn apart by a black hole and the debris settling into a disk.
// Explanatory model, not a hydrodynamic simulation. Everything on screen and every readout comes from here.
//
// Units: horizon radius Rs = 1, c = 1  →  GM = 0.5.
// Gravity: Paczyński–Wiita pseudo-Newtonian potential  Φ = −GM / (r − Rs).
//   - reproduces the innermost stable circular orbit at 3 Rs (inside it nothing can keep circling)
//   - gives the relativistic pericentre advance that makes the returning stream cross its own tail
// Star: N test particles in a ball of radius R_STAR moving rigidly on a parabolic orbit (pericentre R_PERI) until the
//   centre reaches the tear distance R_TEAR; from there every particle falls freely (self-gravity ignored: the "frozen-in"
//   approximation of Rees 1988). About half end up unbound, half bound — measured below, not imposed.
// Dissipation (stands in for the shocks where the stream hits itself): once a particle has come back and passed its
//   second pericentre, its radial and vertical velocities are damped. That removes energy but not angular momentum, so
//   the orbit shrinks to the circle with the same angular momentum.
// Viscosity (stands in for turbulence, MRI): a weak drag on circling gas removes angular momentum → slow inward spiral.
// Exaggerations: star radius (1.5 Rs; the Sun at a 10⁶ M☉ hole would be 0.23 Rs) and the close pass (8 Rs instead of the
//   ≈ 23 Rs tidal radius), so the whole stream fits on a phone screen. Time is compressed non-uniformly.
export const GM = 0.5, RS = 1, R_ISCO = 3;
export const R_PERI = 8, R_STAR = 1.5, R_TEAR = 9, R_START = 70;
export const N = 7000, DT = 0.15, FAR = 30, SLOW = 4;   // gas beyond FAR is stepped every SLOW-th step with SLOW·DT
export const GAMMA_R = 1 / 55, GAMMA_Z = 1 / 420, ETA = 2.6e-4, ETA_SIM = 5e-5, KICK = 0.05;

const acc = (x, y, z) => { const r = Math.hypot(x, y, z), k = -GM / ((r - RS) * (r - RS) * r); return [k * x, k * y, k * z, r]; };
export const vCirc = r => Math.sqrt(GM * r) / (r - RS);                 // circular speed in the PW potential
export const lCirc = r => r * vCirc(r);                                 // specific angular momentum of a circular orbit
export const omega = r => vCirc(r) / r;
/** radius of the circular orbit with angular momentum L (PW, outside the ISCO) */
export function rOfL(L) { let a = 3, b = 400; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (lCirc(m) < L) a = m; else b = m; } return (a + b) / 2; }
function rOfLfast(L) { let r = Math.max(3.2, L * L / GM - 2); for (let k = 0; k < 4; k++) { const f = GM * r * r * r - L * L * (r - 1) * (r - 1), d = 3 * GM * r * r - 2 * L * L * (r - 1); r = Math.max(3.05, r - f / d); } return r; }
/** tidal pull across the star ÷ the star's own gravity (1 at the tear distance) */
export const tideRatio = r => (R_TEAR / r) ** 3;

// ---- which black holes can tear a Sun-like star? (Newtonian estimate, non-spinning hole) ----
export const RSUN_KM = 6.957e5, RS_KM_PER_MSUN = 2.953;
export const tearKm = M => RSUN_KM * Math.cbrt(M);                      // r_t = R★ (M/m★)^⅓
export const horizonKm = M => RS_KM_PER_MSUN * M;                       // R_s = 2GM/c²
export const M_WHOLE = (RSUN_KM / RS_KM_PER_MSUN) ** 1.5;               // r_t = R_s  →  ≈ 1.1 × 10⁸ M☉

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** The tidal-disruption run. tau = 0 when the star's centre is at pericentre. advance(tau) is monotonic (restarts if asked to go back). */
export class Sim {
  constructor() { this.reset(); }
  reset() {
    const R = mulberry(20261110);
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.z = new Float32Array(N);
    this.vx = new Float32Array(N); this.vy = new Float32Array(N); this.vz = new Float32Array(N);
    this.ox = new Float32Array(N); this.oy = new Float32Array(N); this.oz = new Float32Array(N);   // offset inside the star
    this.state = new Uint8Array(N);       // 0 falling freely, 1 came back (dissipating), 2 circling (viscous), 3 swallowed
    this.peri = new Uint8Array(N); this.prevR = new Float32Array(N); this.dr = new Int8Array(N);
    this.heat = new Float32Array(N);      // shock heating shown as brightness (decays)
    this.n = 0;
    this.seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // centrally concentrated ball
      let a, b, c; do { a = R() * 2 - 1; b = R() * 2 - 1; c = R() * 2 - 1; } while (a * a + b * b + c * c > 1);
      const q = Math.hypot(a, b, c) ** 0.6;
      this.ox[i] = a * q * R_STAR; this.oy[i] = b * q * R_STAR; this.oz[i] = c * q * R_STAR * 0.9; this.seed[i] = R();
    }
    // star centre: parabolic orbit in the PW potential, integrated inward from pericentre and time-reversed
    const vp = Math.sqrt(2 * GM / (R_PERI - RS));
    let c = {x: R_PERI, y: 0, vx: 0, vy: -vp}, t = 0;                   // run backwards: at pericentre moving −y, reversed later
    const path = [[0, c.x, c.y, -c.vx, -c.vy]];
    while (Math.hypot(c.x, c.y) < R_START) {
      let [ax, ay] = acc(c.x, c.y, 0); c.vx += ax * DT / 2; c.vy += ay * DT / 2; c.x += c.vx * DT; c.y += c.vy * DT;
      [ax, ay] = acc(c.x, c.y, 0); c.vx += ax * DT / 2; c.vy += ay * DT / 2; t -= DT;
      path.push([t, c.x, c.y, -c.vx, -c.vy]);
    }
    this.path = path.reverse();                                         // increasing time, ends at pericentre (tau = 0)
    this.tau0 = this.path[0][0]; this.tau = this.tau0; this.rigid = true; this.tauTear = null; this.k = 0;
    this.centre = this.path[0].slice(1);
    this.placeRigid();
  }
  placeRigid() { const [cx, cy] = this.centre; for (let i = 0; i < N; i++) { this.x[i] = cx + this.ox[i]; this.y[i] = cy + this.oy[i]; this.z[i] = this.oz[i]; } }
  step() {
    const {x, y, z, vx, vy, vz, state, prevR, dr, peri, heat} = this;
    if (this.rigid) {
      this.k = Math.min(this.k + 1, this.path.length - 1); const p = this.path[this.k];
      this.centre = [p[1], p[2], p[3], p[4]]; this.tau = p[0]; this.placeRigid();
      if (Math.hypot(p[1], p[2]) <= R_TEAR || this.k === this.path.length - 1) {
        this.rigid = false; this.tauTear = this.tau;
        for (let i = 0; i < N; i++) { vx[i] = p[3]; vy[i] = p[4]; vz[i] = 0; prevR[i] = Math.hypot(x[i], y[i], z[i]); dr[i] = -1; }
      }
      return;
    }
    this.n = (this.n || 0) + 1; const slowTurn = this.n % SLOW === 0;
    for (let i = 0; i < N; i++) {
      if (state[i] === 3) continue;
      let DTi = DT;
      if (prevR[i] > FAR) { if (!slowTurn) continue; DTi = DT * SLOW; }
      let [ax, ay, az, r] = acc(x[i], y[i], z[i]);
      vx[i] += ax * DTi / 2; vy[i] += ay * DTi / 2; vz[i] += az * DTi / 2;
      x[i] += vx[i] * DTi; y[i] += vy[i] * DTi; z[i] += vz[i] * DTi;
      [ax, ay, az, r] = acc(x[i], y[i], z[i]);
      vx[i] += ax * DTi / 2; vy[i] += ay * DTi / 2; vz[i] += az * DTi / 2;
      if (r < 1.25) { state[i] = 3; continue; }
      const rc = Math.hypot(x[i], y[i]), ur = [x[i] / rc, y[i] / rc];
      const vr = vx[i] * ur[0] + vy[i] * ur[1];
      // pericentre counting (sign change of dr/dt from − to +; only close in — far out the turn-around is lost in float noise)
      const d = r > prevR[i] ? 1 : -1; if (dr[i] < 0 && d > 0 && r < 20) { peri[i]++; if (peri[i] === 2 && state[i] === 0) { state[i] = 1; heat[i] = 1; vz[i] += (this.seed[i] - 0.5) * 2 * KICK; } } dr[i] = d; prevR[i] = r;
      if (state[i] >= 1) {
        const kr = Math.exp(-GAMMA_R * DT), kz = Math.exp(-GAMMA_Z * DT);
        const dv = vr * (1 - kr); vx[i] -= dv * ur[0]; vy[i] -= dv * ur[1]; vz[i] *= kz; z[i] *= Math.exp(-GAMMA_Z * 0.35 * DT);
        heat[i] *= Math.exp(-DT / 260);
        const vt = -vx[i] * ur[1] + vy[i] * ur[0];
        if (state[i] === 1 && Math.abs(vr) < 0.1 * Math.abs(vt) && Math.abs(rc - rOfLfast(rc * vt)) < 0.15 * rc) state[i] = 2;
        if (state[i] === 2 && rc > R_ISCO) { const kv = ETA_SIM * DT * (0.6 + 0.8 * this.seed[i]); vx[i] -= kv * vt * -ur[1]; vy[i] -= kv * vt * ur[0]; }
      }
    }
    this.tau += DT;
    if (this.tau < 0) { this.k = Math.min(this.k + 1, this.path.length - 1); const p = this.path[this.k]; this.centre = [p[1], p[2], p[3], p[4]]; }
  }
  advance(tau) { if (tau < this.tau - DT) this.reset(); while (this.tau + DT / 2 < tau) this.step(); return this; }
  /** specific orbital energy of particle i (negative = bound) */
  energy(i) { const r = Math.hypot(this.x[i], this.y[i], this.z[i]); return 0.5 * (this.vx[i] ** 2 + this.vy[i] ** 2 + this.vz[i] ** 2) - GM / (r - RS); }
  angmom(i) { return this.x[i] * this.vy[i] - this.y[i] * this.vx[i]; }
}

/** A steady disk for the hook, disk, observe and close scenes: gas circling at the local circular speed and drifting inward. */
export const DISK_OUT = 21, ND = 5200, DISK_RATE = 12;                  // sim time units per video second
export class Disk {
  constructor() { this.reset(); }
  reset() {
    const R = mulberry(36); this.r = new Float32Array(ND); this.ph = new Float32Array(ND); this.z = new Float32Array(ND); this.s = new Float32Array(ND); this.t = 0;
    for (let i = 0; i < ND; i++) { this.r[i] = R_ISCO * (DISK_OUT / R_ISCO) ** R(); this.ph[i] = R() * 2 * Math.PI; this.s[i] = R(); this.z[i] = (R() + R() + R() - 1.5) * 0.14; }
  }
  /** video seconds; fixed 1/30 s steps from zero so stills and video agree */
  advance(t) {
    if (t < this.t - 1 / 30) this.reset();
    const h = 1 / 30;
    while (this.t + h / 2 < t) {
      const dtau = h * DISK_RATE;
      for (let i = 0; i < ND; i++) {
        let r = this.r[i];
        if (r > R_ISCO) { r -= 2 * ETA * 2.2 * r * dtau * (0.6 + 0.8 * this.s[i]); this.ph[i] += omega(r) * dtau; }
        else { r -= 0.035 * dtau * (R_ISCO + 0.4 - r) * 3; this.ph[i] += Math.sqrt(GM * R_ISCO) / (R_ISCO - RS) * R_ISCO / (r * r) * dtau; }   // plunge keeps the ISCO angular momentum
        if (r < 1.15) { r = DISK_OUT * (0.9 + 0.1 * this.s[i]); }
        this.r[i] = r;
      }
      this.t += h;
    }
    return this;
  }
}
/** thin-disk temperature shape (Shakura–Sunyaev): T ∝ r^(−3/4), 1 at the inner edge */
export const tempShape = r => (Math.max(r, R_ISCO) / R_ISCO) ** -0.75;

// ---- observed flare, model curve: rise in ~3 weeks, then a decline with the ≈ 60-day time-scale reported for ASASSN-14li ----
export const flare = d => (d < 0 ? Math.exp(-((d / 14) ** 2)) : Math.exp(-d / 60));

// quick numbers when run directly: node episodes/accretion-disk/model.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = new Sim(); console.log('start tau', s.tau0.toFixed(1), 'M_whole', M_WHOLE.toExponential(2));
  s.advance(40); let b = 0; for (let i = 0; i < N; i++) if (s.energy(i) < 0) b++;
  console.log('tear at tau', s.tauTear.toFixed(1), 'bound fraction', (b / N).toFixed(3));
  for (const T of [400, 800, 1200, 1600, 2000, 3000, 4000, 6000, 8000]) {
    const t0 = Date.now(); s.advance(T); const c = [0, 0, 0, 0]; let rs = 0, n2 = 0, zr = 0;
    for (let i = 0; i < N; i++) { c[s.state[i]]++; if (s.state[i] === 2) { rs += Math.hypot(s.x[i], s.y[i]); zr += Math.abs(s.z[i]); n2++; } }
    console.log(T, 'states', c.join('/'), 'mean r(circling)', (rs / Math.max(1, n2)).toFixed(1), '|z|', (zr / Math.max(1, n2)).toFixed(2), (Date.now() - t0) + 'ms');
  }
}
