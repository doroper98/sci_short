// Look-proposal sample — "레이더는 어떻게 거리를 잴까" (one scene `range`, ~10.4 s). Plan: PLAN.md in this folder.
// v2 (review pass): no narration and no captions, so the world sits lower and fills the frame; the dish is a solid bowl
// that slews onto the aircraft before the first pulse; the echo is a returning arc rather than a full ring.
// Shape: export {theme, scenes, overlays, background, captionLayout, plan}; scenes.range(stage, t, p, ctx).
// Grammar shown here: restrained look, motion that explains the principle. Only the radio pulse (warm), the echo (cool)
// and the receiver trace glow; dish and aircraft are matte filled bodies; thin instrument lines; no full-screen bloom.
// One clock: pulse position, scope spot, round-trip clock, distance number and sound all come from plan(tl), whose times
// use the same tl.at references as sound.json.
import {progressBar, rgba, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, glow, rect, withAlpha, TAU, rng} from '../../pipeline/render/index.mjs';
import {Glow} from './glow.mjs';

export const theme = {base: 'noturno', accent: '#FFB454'};
export const captionLayout = {};
const W = 1080, H = 1920, D2R = Math.PI / 180;
const PAL = {ink: '#F4EBDD', warm: '#FFB454', hot: '#FFE2B0', cool: '#8CD9FF', coolHi: '#D6F4FF', muted: '#93A8AE', line: '#3C7387'};
const WARM = [1.0, 0.70, 0.30], COOL = [0.55, 0.85, 1.0]; // pulse/echo splat strengths raised 1.5x over PLAN (0.55 → 0.82, 0.42 → 0.63) per PLAN §6.3 after lookcheck
// v2 (no captions): the world sits lower and uses the full height. O → far aircraft 700 px (150 km), near 350 px (75 km).
export const M = {O: [150, 1130], Y: 830, X1: 782.5, X2: 330.3, PX150: 700, V: 700 / 1.5, SLOW: 3000, AS: 1.12, YG: 1238, CY: 1000, LOCK: [0.25, 1.55]};
const [OX, OY] = M.O, V = M.V;
const SC = {y0: 1296, h: 210, base: 1456, g0: 1348, lab: 1486, top: 1330};   // receiver screen (screen-fixed)

// =====================================================================================================
// Time plan (PLAN.md §2). Every time is a tl.at() reference; sound.json uses the same references.
// =====================================================================================================
let PLAN = null;
export function plan(tl) {
  if (PLAN && PLAN.tl === tl) return PLAN;
  const P = {tl, D: tl.duration}, shoot = {sentence: 's01', word: '쏘고'};
  P.emit1 = tl.at(shoot); P.hit1 = tl.at({...shoot, offset: 1.5}); P.ret1 = tl.at({...shoot, offset: 3.0});
  P.fly0 = tl.at({...shoot, offset: 3.17}); P.fly1 = tl.at(['s02', 0.45]);
  P.emit2 = tl.at(['s02', 0.55]); P.hit2 = tl.at(['s02', 1.30]); P.ret2 = tl.at(['s02', 2.05]);
  P.emit3 = tl.at(['s02', 2.60]); P.hit3 = tl.at(['s02', 3.35]); P.ret3 = tl.at(['s02', 4.10]);
  P.PULSES = [{te: P.emit1, R: 700, km: 150}, {te: P.emit2, R: 350, km: 75}, {te: P.emit3, R: 350, km: 75}]
    .map((p, i) => ({...p, i, th: p.te + p.R / V, tr: p.te + 2 * p.R / V}));
  P.ax = t => lerp(M.X1, M.X2, easeInOut(clamp((t - P.fly0) / (P.fly1 - P.fly0))));
  P.los = t => Math.atan2(OY - M.Y, P.ax(t) - OX);                      // true line of sight
  P.theta = t => lerp(72 * D2R, P.los(t), easeInOut(clamp((t - M.LOCK[0]) / (M.LOCK[1] - M.LOCK[0]))));   // where the dish points
  P.locked = t => smooth((t - M.LOCK[1] + 0.2) / 0.3);
  for (const p of P.PULSES) { p.theta = P.los(p.te); p.A = [P.ax(p.th), M.Y]; }
  return (PLAN = P);
}
const current = (P, t) => { let c = null; for (const p of P.PULSES) if (t >= p.te) c = p; return c; };

// =====================================================================================================
// Camera (world layer only): slow 3.5 % push-in, 10 px drift
// =====================================================================================================
let CAM = {k: 1, ox: 0};
function setCam(t, D) { CAM = {k: 1, ox: 0}; }   // v3: fixed view. The receiver axis lines up with the range arcs, and a comparison needs a steady frame.
const S = (x, y) => [(x - 540) * CAM.k + 540 + CAM.ox, (y - M.CY) * CAM.k + M.CY];
const Sstar = (x, y) => { const k = 1 + 0.3 * (CAM.k - 1); return [(x - 540) * k + 540 + 0.3 * CAM.ox, (y - M.CY) * k + M.CY]; };
const RG = 5200, yg = x => M.YG + RG - Math.sqrt(RG * RG - (x - 540) ** 2);
const ygScreen = sx => { const wx = (sx - 540 - CAM.ox) / CAM.k + 540; return S(wx, yg(wx))[1]; };

// =====================================================================================================
// Background: sky, stars, range arcs, ground (PLAN §3.3 1–4)
// =====================================================================================================
const STARS = (() => { const r = rng(7), out = []; for (let i = 0; i < 150; i++) out.push({x: r() * W, y: 40 + r() * 1140, r: 0.6 + r() * 1.1, a: 0.12 + r() * 0.38, f: 0.3 + r() * 0.6, ph: r() * TAU, g: i % 12 === 0 && i < 144, gr: 7 + r() * 3}); return out; })();
// dotted ground rows: depth below the rim, spacing, alpha (rows 5..9 added for the caption-free band below the panel)
const DOT_ROWS = [[22, 0.18], [50, 0.16], [86, 0.14], [130, 0.12], [300, 0.13], [380, 0.11], [470, 0.09], [570, 0.07], [670, 0.05]];
const CONTOURS = [[340, 0.13], [425, 0.10], [520, 0.08], [620, 0.06]];   // faint terrain lines so the band under the receiver reads as ground

export function background(stage, t, ctx) {
  const P = plan(ctx.tl), c = stage.ctx; setCam(t, P.D);
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#00080F'); sky.addColorStop(0.42, '#001621'); sky.addColorStop(0.648, '#062B3A'); sky.addColorStop(1, '#00070B');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  // stars
  for (const s of STARS) {
    const [x, y] = Sstar(s.x, s.y); if (y > ygScreen(x) - 4) continue;
    const a = s.a * (1 + 0.12 * Math.sin(TAU * s.f * t + s.ph));
    circle(c, x, y, s.r, rgba('#DCE7EA', a)); if (s.g) glow(c, x, y, s.gr, '#DCE7EA', 0.10);
  }
  // range arcs (the ruler: 50 / 100 / 150 km, no text)
  const [ox, oy] = S(OX, OY);
  for (const R of [233.3, 466.7, 700]) { c.setLineDash([2, 9]); ring(c, ox, oy, R * CAM.k, rgba('#6FAFC4', 0.16), 1.5, -178 * D2R, -2 * D2R); c.setLineDash([]); }
  // atmosphere band above the rim
  const top = S(540, M.YG)[1];
  for (let i = 0; i < 24; i++) {
    const x0 = -20 + i * 47, x1 = x0 + 48, xm = (x0 + x1) / 2, yb = ygScreen(xm), h = 90 * CAM.k;
    const g = c.createLinearGradient(0, yb - h, 0, yb); g.addColorStop(0, rgba('#2C7C93', 0)); g.addColorStop(1, rgba('#2C7C93', 0.20));
    c.fillStyle = g; c.fillRect(x0, yb - h, x1 - x0, h + 2);
  }
  // ground fill
  const rim = []; for (let wx = -260; wx <= 1340; wx += 16) rim.push(S(wx, yg(wx)));
  c.beginPath(); rim.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineTo(W + 40, H + 10); c.lineTo(-40, H + 10); c.closePath();
  const gg = c.createLinearGradient(0, top, 0, H); gg.addColorStop(0, '#04171F'); gg.addColorStop(0.5, '#020D13'); gg.addColorStop(1, '#00070B'); c.fillStyle = gg; c.fill();
  for (const [d, a] of CONTOURS) { const pts = []; for (let wx = -260; wx <= 1340; wx += 24) pts.push(S(wx, yg(wx) + d)); line(c, pts, rgba('#3C7387', a), 1); }
  line(c, rim, rgba('#3C7387', 0.10), 8); line(c, rim, rgba('#4A8AA0', 0.85), 2);
  // surface dots
  DOT_ROWS.forEach(([d, a], i) => {
    const sp = 26 * (1 + 0.25 * i), off = (i % 2) * sp / 2;
    c.fillStyle = rgba('#6FAFC4', a);
    for (let wx = -40 + off; wx < 1140; wx += sp) { const [x, y] = S(wx, yg(wx) + d); if (y < H + 4) { c.beginPath(); c.arc(x, y, 1.2 + 0.16 * i, 0, TAU); c.fill(); } }
  });
  // the same ruler twice: where each range arc meets the ground, a dotted line drops to the matching tick of the receiver
  for (const R of [233.3, 466.7, 700]) { const [x, y] = S(OX + R, yg(OX + R)); line(c, [[x, y + 3], [x, SC.y0]], rgba('#6FAFC4', 0.26), 1.5, {dash: [2, 7]}); }
  // cable from the dish base into the 0 km end of the receiver axis
  const [bx, by] = S(OX, yg(OX)); line(c, [[bx, by], [bx, SC.y0]], rgba('#4A8AA0', 0.75), 2); circle(c, bx, SC.y0, 4, '#4A8AA0');
}

// =====================================================================================================
// Aircraft (matte, side view, nose left). Local units: length 290, y down.
// =====================================================================================================
function bodyPath(c) {
  c.beginPath();
  c.moveTo(-145, 2); c.bezierCurveTo(-143, -7, -134, -12, -128, -13); c.bezierCurveTo(-118, -16, -106, -17, -96, -17);
  c.lineTo(84, -17); c.lineTo(118, -62); c.lineTo(140, -62); c.lineTo(132, -9); c.lineTo(145, -5); c.lineTo(145, -1);
  c.bezierCurveTo(128, 5, 110, 10, 96, 12); c.lineTo(-100, 17); c.bezierCurveTo(-116, 17, -126, 16, -132, 14); c.bezierCurveTo(-139, 11, -144, 7, -145, 2);
  c.closePath();
}
function drawGhost(stage, t, P) {
  const a = smooth((t - P.fly0) / 0.5); if (a <= 0) return;
  const c = stage.ctx, [x, y] = S(M.X1, M.Y), [nx] = S(P.ax(t), M.Y);
  c.save(); c.translate(x, y); c.scale(CAM.k * M.AS, CAM.k * M.AS);
  bodyPath(c); c.fillStyle = rgba('#9FC3CF', 0.05 * a); c.fill(); c.setLineDash([4, 5]); c.strokeStyle = rgba('#9FC3CF', 0.42 * a); c.lineWidth = 1.3; c.stroke(); c.setLineDash([]);
  c.restore();
  // dashed track from the old place to the nose-side of the aircraft, with a small arrow head
  const x0 = x - 150 * M.AS * CAM.k, x1 = nx + 152 * M.AS * CAM.k, yy = y + 2;
  if (x0 - x1 > 30) { line(c, [[x0, yy], [x1, yy]], rgba('#9FC3CF', 0.34 * a), 1.5, {dash: [3, 8]}); line(c, [[x1 + 12, yy - 7], [x1, yy], [x1 + 12, yy + 7]], rgba('#9FC3CF', 0.5 * a), 1.5); }
}
function drawAircraft(stage, t, P) {
  const c = stage.ctx, ax = P.ax(t), [x, y] = S(ax, M.Y);
  c.save(); c.translate(x, y); c.scale(CAM.k * M.AS, CAM.k * M.AS);
  const g = c.createLinearGradient(0, -62, 0, 17); g.addColorStop(0, '#E6EFF1'); g.addColorStop(0.55, '#B3C7CC'); g.addColorStop(1, '#58747E');
  bodyPath(c); c.fillStyle = g; c.fill();
  // fin root line (separates the fin from the fuselage a little), top highlight
  c.beginPath(); c.moveTo(-145, 2); c.bezierCurveTo(-143, -7, -134, -12, -128, -13); c.bezierCurveTo(-118, -16, -106, -17, -96, -17); c.lineTo(84, -17); c.lineTo(118, -62); c.lineTo(140, -62);
  c.strokeStyle = rgba('#FFFFFF', 0.55); c.lineWidth = 1.5; c.lineJoin = 'round'; c.stroke();
  // horizontal stabiliser (same fill, thin darker edge so it reads against the fuselage)
  c.beginPath(); c.moveTo(104, -6); c.lineTo(144, -10); c.lineTo(146, -4); c.lineTo(112, 0); c.closePath(); c.fillStyle = '#B7C8CD'; c.fill();
  c.strokeStyle = rgba('#4B6670', 0.7); c.lineWidth = 1; c.stroke();
  // windows, cockpit
  c.fillStyle = rgba('#0A1E27', 0.75); for (let wx = -96; wx <= 70; wx += 13) { c.beginPath(); c.arc(wx, -6, 1.6, 0, TAU); c.fill(); }
  c.beginPath(); c.moveTo(-124, -8); c.lineTo(-108, -12); c.lineTo(-104, -6); c.lineTo(-122, -3); c.closePath(); c.fillStyle = '#0A1E27'; c.fill();
  // wing, engine
  c.beginPath(); c.moveTo(-34, 6); c.lineTo(36, 6); c.lineTo(64, 20); c.lineTo(14, 18); c.closePath(); c.fillStyle = '#34505A'; c.fill();
  c.beginPath(); c.ellipse(-8, 24, 26, 9, 0, 0, TAU); c.fillStyle = '#2B444D'; c.fill();
  c.beginPath(); c.ellipse(-8, 24, 26, 9, 0, Math.PI * 0.55, Math.PI * 1.45); c.strokeStyle = '#9FB6BD'; c.lineWidth = 1.5; c.stroke();
  // lit by the pulse: warm wash from the dish side, only right after the hit
  for (const p of P.PULSES) {
    const a = t - p.th; if (a < 0 || a > 0.7) continue;
    const A = 0.55 * Math.exp(-a / 0.25) * (1 - smooth((a - 0.5) / 0.2));
    const lg = c.createLinearGradient(-145, 40, 60, -40); lg.addColorStop(0, rgba('#FFB454', A)); lg.addColorStop(1, rgba('#FFB454', 0));
    c.save(); c.globalCompositeOperation = 'lighter'; bodyPath(c); c.fillStyle = lg; c.fill();
    c.beginPath(); c.ellipse(-8, 24, 26, 9, 0, 0, TAU); c.fill(); c.restore();
  }
  c.restore();
}

// =====================================================================================================
// Dish (matte bowl, diameter 256, seen slightly from the front so the concave face shows). Local: +u along the aim,
// +v perpendicular (up side). Canvas: x = u, y = -v. The pivot O is the range origin; the bowl sits just in front of it.
// =====================================================================================================
const UV = 18, FOC = 96, RD = 128, EL = 26, RIM = UV + RD * RD / (4 * FOC), FEED = UV + FOC;   // vertex, focal length, radius, aperture half-width
const backU = v => UV + v * v / (4 * FOC) - 8 - 26 * Math.pow(Math.max(0, 1 - (v / RD) ** 2), 0.7);
function facePath(c) { c.beginPath(); c.ellipse(RIM, 0, EL, RD, 0, 0, TAU); }
function drawDish(stage, t, P) {
  const c = stage.ctx, th = P.theta(t), [ox, oy] = S(OX, OY), k = CAM.k, gy = S(OX, yg(OX))[1];
  // tower and base (screen-upright)
  const sg = c.createLinearGradient(ox - 46 * k, 0, ox + 46 * k, 0); sg.addColorStop(0, '#3A5A66'); sg.addColorStop(0.45, '#22404B'); sg.addColorStop(1, '#0F222A');
  c.beginPath(); c.moveTo(ox - 17 * k, oy + 4 * k); c.lineTo(ox + 17 * k, oy + 4 * k); c.lineTo(ox + 45 * k, gy); c.lineTo(ox - 45 * k, gy); c.closePath(); c.fillStyle = sg; c.fill();
  line(c, [[ox - 17 * k, oy + 4 * k], [ox - 45 * k, gy]], rgba('#7FA5B2', 0.7), 1.5);
  rect(c, ox - 66 * k, gy - 10 * k, 132 * k, 10 * k, 2, '#1D3944'); line(c, [[ox - 66 * k, gy - 10 * k], [ox + 66 * k, gy - 10 * k]], rgba('#7FA5B2', 0.5), 1.5, {cap: 'butt'});
  c.save(); c.translate(ox, oy); c.rotate(-th); c.scale(k, k);
  // back shell
  c.beginPath(); for (let v = RD; v >= -RD; v -= 4) { const u = backU(v); v === RD ? c.moveTo(u, -v) : c.lineTo(u, -v); } c.lineTo(RIM, RD); c.lineTo(RIM, -RD); c.closePath();
  const g = c.createLinearGradient(0, -RD, 0, RD); g.addColorStop(0, '#93ABB3'); g.addColorStop(0.5, '#587680'); g.addColorStop(1, '#2A434C'); c.fillStyle = g; c.fill();
  // concave face
  facePath(c); const fg = c.createRadialGradient(RIM - 8, -46, 10, RIM, 0, RD * 1.15); fg.addColorStop(0, '#E2ECEE'); fg.addColorStop(0.55, '#A9BFC6'); fg.addColorStop(1, '#617E88'); c.fillStyle = fg; c.fill();
  c.beginPath(); c.ellipse(RIM, 0, EL, RD, 0, -Math.PI / 2, Math.PI / 2); c.strokeStyle = rgba('#FFFFFF', 0.6); c.lineWidth = 2; c.stroke();        // near rim edge
  c.beginPath(); c.ellipse(RIM, 0, EL, RD, 0, Math.PI / 2, Math.PI * 1.5); c.strokeStyle = rgba('#3A545D', 0.8); c.lineWidth = 1.5; c.stroke();   // far rim edge
  // the face lights up when it sends (warm) and when the echo lands (cool)
  for (const p of P.PULSES) for (const [a, dur, col] of [[t - p.te, 0.35, PAL.warm], [t - p.tr, 0.45, PAL.cool]]) if (a >= 0 && a < dur) {
    c.save(); c.globalCompositeOperation = 'lighter'; facePath(c); c.fillStyle = rgba(col, 0.42 * (1 - a / dur)); c.fill(); c.restore();
  }
  // struts and feed
  for (const [u, v] of [[RIM, RD - 6], [RIM, -(RD - 6)], [RIM - EL, 0]]) line(c, [[u, -v], [FEED, 0]], rgba('#B8CBD1', 0.85), 2);
  rect(c, FEED - 9, -8, 18, 16, 3, '#D5E0E3');
  c.restore();
  circle(c, ox, oy, 9 * k, '#7C98A1'); ring(c, ox, oy, 9 * k, rgba('#C9D9DE', 0.7), 1.5);
}
const feed = (th) => { const [ox, oy] = S(OX, OY); return [ox + FEED * CAM.k * Math.cos(th), oy - FEED * CAM.k * Math.sin(th)]; };
const R0 = 122;   // waves and path lines start here (just outside the feed), measured from O

// =====================================================================================================
// Pulse, echo, paths, event flashes (PLAN §3.4)
// =====================================================================================================
let GW = null, GC = null;
function pathAlpha(P, p, t) { const nx = P.PULSES[p.i + 1]; let a = 1 - smooth((t - p.tr - 0.7) / 0.5); if (nx && t >= nx.te) a *= 1 - smooth((t - nx.te) / 0.25); return a; }
function drawPaths(stage, t, P) {
  const c = stage.ctx;
  for (const p of P.PULSES) {
    if (t < p.te) continue; const al = pathAlpha(P, p, t); if (al <= 0) continue;
    const d = [Math.cos(p.theta), -Math.sin(p.theta)], n = [-Math.sin(p.theta), -Math.cos(p.theta)];
    const r0 = Math.min(V * (t - p.te), p.R);
    c.save(); c.globalCompositeOperation = 'lighter';
    if (r0 > R0) { const out = [S(OX + R0 * d[0] + 6 * n[0], OY + R0 * d[1] + 6 * n[1]), S(OX + r0 * d[0] + 6 * n[0], OY + r0 * d[1] + 6 * n[1])];
      line(c, out, rgba(PAL.warm, 0.10 * al), 9); line(c, out, rgba(PAL.warm, 0.42 * al), 3); }
    if (t >= p.th) {
      const re = Math.min(V * (t - p.th), p.R - R0), [Ax, Ay] = p.A;
      const back = [S(Ax - 6 * n[0], Ay - 6 * n[1]), S(Ax - re * d[0] - 6 * n[0], Ay - re * d[1] - 6 * n[1])];
      line(c, back, rgba(PAL.cool, 0.12 * al), 9); line(c, back, rgba(PAL.cool, 0.50 * al), 3);
    }
    c.restore();
  }
}
function splatWaves(t, P) {
  const k = CAM.k;
  for (const p of P.PULSES) {
    if (t < p.te) continue;
    const r0 = V * (t - p.te), th = p.theta;
    if (r0 <= p.R + 240) {
      const fade = 1 - smooth((r0 - p.R) / 240);
      [1, 0.6, 0.32].forEach((amp, j) => {
        const r = r0 - 18 * j; if (r < R0) return;
        const n = Math.max(2, Math.ceil(0.6 * r / 7)), rad = 7 * k, born = smooth((r - R0) / 40);
        for (let i = 0; i <= n; i++) {
          const phi = th - 0.30 + 0.60 * i / n, wx = OX + r * Math.cos(phi), wy = OY - r * Math.sin(phi);
          if (wy > yg(wx)) continue;
          const [x, y] = S(wx, wy);
          GW.splat(x, y, rad, WARM, 0.82 * amp * Math.exp(-(((phi - th) / 0.15) ** 2)) * clamp(1.15 - 0.45 * r / 700) * fade * born);
        }
      });
    }
    const a0 = t - p.te; if (a0 < 0.3) { const [fx, fy] = feed(P.theta(t)); GW.splat(fx, fy, 50, WARM, 0.9 * (1 - a0 / 0.3)); }
    // echo
    if (t >= p.th) {
      const re = V * (t - p.th), amp0 = t <= p.tr ? 1 : 1 - (t - p.tr) / 0.4;
      if (amp0 > 0) {
        const [Ax, Ay] = p.A, home = Math.atan2(-(OY - Ay), OX - Ax);   // canvas angle A → O
        [0.75, 0.4].forEach((amp, j) => {
          const r = re - 16 * j; if (r <= 8) return;
          const n = Math.max(8, Math.ceil(TAU * r / 7)), base = 0.63 * amp * amp0 * clamp(1.1 - 0.5 * re / 700) * (p.km === 75 ? 1.25 : 1);
          for (let i = 0; i < n; i++) {
            const psi = TAU * i / n, wx = Ax + r * Math.cos(psi), wy = Ay + r * Math.sin(psi);
            if (wy > yg(wx)) continue;
            let dp = Math.abs(psi - home) % TAU; if (dp > Math.PI) dp = TAU - dp;
            const [x, y] = S(wx, wy); if (x < -20 || x > W + 20 || y < -20) continue;
            GC.splat(x, y, 6 * k, COOL, base * (0.05 + 0.95 * Math.exp(-((dp / 0.42) ** 2))));
          }
        });
      }
    }
    // event flashes
    const ah = t - p.th; if (ah >= 0 && ah < 0.5) { const [x, y] = S(p.A[0] - 60 * M.AS, p.A[1] + 18 * M.AS); GW.splat(x, y, (40 + 60 * ah) * k, WARM, 0.9 * Math.exp(-ah / 0.12)); }
    const ar = t - p.tr; if (ar >= 0 && ar < 0.5) { const [fx, fy] = feed(P.theta(t)); GC.splat(fx, fy, 44, COOL, 0.9 * Math.exp(-ar / 0.15)); }
  }
}
function hitRings(stage, t, P) {
  const c = stage.ctx;
  for (const p of P.PULSES) {
    const a = t - p.th; if (a < 0 || a >= 0.5) continue;
    const [x, y] = S(p.A[0] - 60 * M.AS, p.A[1] + 18 * M.AS);
    c.save(); c.globalCompositeOperation = 'lighter'; ring(c, x, y, (18 + 110 * easeOut(a / 0.5)) * CAM.k, rgba(PAL.hot, 0.7 * (1 - a / 0.5)), 2); c.restore();
  }
}

export const scenes = {
  range(stage, t, p, ctx) {
    const P = plan(ctx.tl), c = stage.ctx; setCam(t, P.D);
    // line of sight
    const lo = P.los(t), [sx, sy] = S(OX + R0 * Math.cos(lo), OY - R0 * Math.sin(lo)), [px, py] = S(P.ax(t), M.Y), lk = P.locked(t);
    if (lk > 0) line(c, [[sx, sy], [px, py]], rgba('#9FC3CF', 0.18 * lk), 1.5, {dash: [3, 10]});
    drawGhost(stage, t, P);
    drawPaths(stage, t, P);
    drawAircraft(stage, t, P);
    drawDish(stage, t, P);
    GW ||= new Glow(); GC ||= new Glow(); GW.begin(); GC.begin();
    splatWaves(t, P);
    GW.flush(stage, {gain: 1.25, bloom: 0.38}); GC.flush(stage, {gain: 1.25, bloom: 0.38});
    hitRings(stage, t, P);
    // "5분 뒤": the only moment the aircraft moves
    const la = smooth((t - P.fly0) / 0.25) * (1 - smooth((t - (P.fly1 + 0.1)) / 0.3));
    if (la > 0) { const [lx, ly] = S(556, 716); stage.text('5분 뒤', lx, ly, {role: 'body', weight: 500, size: 34, color: PAL.ink, align: 'center', alpha: la}); }
    const q = (t - P.fly0) / (P.fly1 - P.fly0);
    if (q > 0 && q < 1) {
      const ax = P.ax(t), sp = Math.sin(Math.PI * q), x0 = ax + 140 * M.AS, x1 = Math.min(x0 + 240, M.X1 + 145 * M.AS);
      if (x1 > x0 + 4) for (const dy of [-9, -3, 3, 9]) {
        const [a0, y0] = S(x0, M.Y + dy), [a1] = S(x1, M.Y + dy), g = c.createLinearGradient(a0, 0, a1, 0);
        g.addColorStop(0, rgba('#DCE7EA', 0.35 * sp)); g.addColorStop(1, rgba('#DCE7EA', 0));
        line(c, [[a0, y0], [a1, y0]], g, 1.5);
      }
    }
  },
};

// =====================================================================================================
// Overlays: header, distance number, receiver screen (screen-fixed)
// =====================================================================================================
function grass(x, seed) { const i = Math.floor(x / 3), f = x / 3 - i, h = j => { const a = Math.sin(j * 127.1 + seed * 311.7) * 43758.5453; return (a - Math.floor(a)) * 2 - 1; }; return 2.5 * lerp(h(i), h(i + 1), smooth(f)); }
const X0 = 150, XE = 890, XR = km => X0 + 700 / 150 * km;   // same scale and origin as the world (O.x = 150)
const hTrace = (x, p) => grass(x, p.i + 1) + 96 * Math.exp(-(x - X0) / 9) + (p.km === 150 ? 54 : 84) * Math.exp(-(((x - XR(p.km)) / 7) ** 2));
const xsOf = (p, t) => Math.min(XE, X0 + 700 * (t - p.te) / 3.0);
function drawTrace(c, p, xEnd, alpha) {
  if (xEnd <= X0 || alpha <= 0) return;
  const pts = []; for (let x = X0; x <= xEnd; x += 1) pts.push([x, SC.base - hTrace(x, p)]); pts.push([xEnd, SC.base - hTrace(xEnd, p)]);
  const split = pts.findIndex(([x]) => x >= X0 + 32), warm = split < 0 ? pts : pts.slice(0, split + 1), cool = split < 0 ? [] : pts.slice(split);
  c.save(); c.globalCompositeOperation = 'lighter';
  if (cool.length > 1) { line(c, cool, rgba('#49C8FF', 0.20 * alpha), 9); line(c, cool, rgba(PAL.coolHi, 0.95 * alpha), 2.5); }
  line(c, warm, rgba(PAL.warm, 0.20 * alpha), 9); line(c, warm, rgba(PAL.hot, 0.95 * alpha), 2.5);
  c.restore();
}
function receiver(stage, t, P) {
  const c = stage.ctx, T = (s, x, y, o) => stage.text(s, x, y, {role: 'body', weight: 500, size: 28, color: PAL.muted, ...o});
  const pg = c.createLinearGradient(0, SC.y0, 0, SC.y0 + SC.h); pg.addColorStop(0, rgba('#05202B', 0.96)); pg.addColorStop(1, rgba('#02121A', 0.96));
  rect(c, 80, SC.y0, 860, SC.h, 18, pg, '#24505F', 1.5);
  for (const km of [0, 50, 100, 150]) line(c, [[XR(km), SC.y0 + 1], [XR(km), SC.base]], rgba('#6FAFC4', km ? 0.20 : 0), 1.5, {dash: [2, 7]});
  line(c, [[X0, SC.base], [XE, SC.base]], rgba(PAL.line, 0.6), 1.5);
  [['0', 0], ['50', 50], ['100', 100], ['150 km', 150]].forEach(([s, km]) => T(s, XR(km), SC.lab, {align: 'center'}));
  T('받은 신호', 196, SC.top);
  // traces: previous pulse as afterglow, current pulse up to the spot
  const cur = current(P, t);
  if (cur) {
    const prev = P.PULSES[cur.i - 1];
    if (prev) {
      const endAlpha = lerp(1, 0.8, smooth((cur.te - prev.tr) / 2.5));
      const a = lerp(endAlpha, 0.55, smooth((t - cur.te) / 0.15)) * Math.exp(-(t - cur.te) / 2.5);
      drawTrace(c, prev, xsOf(prev, cur.te), a);
    }
    const xs = xsOf(cur, t), aCur = t > cur.tr ? lerp(1, 0.8, smooth((t - cur.tr) / 2.5)) : 1;
    drawTrace(c, cur, xs, aCur);
    const tEdge = cur.te + (XE - X0) * 3.0 / 700, sa = 0.8 * (1 - smooth((t - tEdge) / 0.3));
    if (sa > 0) glow(c, xs, SC.base - hTrace(xs, cur), 16, PAL.coolHi, sa);
    if (t >= cur.tr) { const x = XR(cur.km); c.beginPath(); c.moveTo(x, SC.base + 4); c.lineTo(x - 6, SC.base + 12); c.lineTo(x + 6, SC.base + 12); c.closePath(); c.fillStyle = PAL.coolHi; c.fill(); }
  }
  // round-trip clock, fixed-width digits
  const val = cur ? Math.min(t - cur.te, 2 * cur.R / V) / 3.0 * 0.001 : 0, digits = val.toFixed(4);
  const adv = ch => (ch === '.' ? 12 : 23), wDig = [...digits].reduce((a, ch) => a + adv(ch), 0);
  const wSec = T('초', 912, SC.top + 2, {size: 30, align: 'right'}), x0 = 912 - wSec - 8 - wDig;
  let cx = x0; for (const ch of digits) { stage.text(ch, cx + adv(ch) / 2, SC.top + 2, {role: 'display', weight: 700, size: 38, color: '#CFEFFF', align: 'center'}); cx += adv(ch); }
  T('왕복', x0 - 10, SC.top + 2, {size: 30, align: 'right'});
}
function distanceBlock(stage, t, P) {
  const c = stage.ctx, XRT = 940;
  stage.text('비행기까지의 거리', XRT, 322, {role: 'body', weight: 500, size: 30, color: PAL.muted, alpha: 0.9, align: 'right'});
  if (t < P.ret1) { line(c, [[XRT - 250, 470], [XRT, 470]], rgba(PAL.muted, 0.35), 2); return; }
  const [val, t0] = t < P.ret2 ? ['150', P.ret1] : ['75', P.ret2], a = t - t0;
  let al = smooth((a + 0.034) / 0.1); if (t < P.ret2) al *= lerp(1, 0.38, smooth((t - P.fly0) / 0.25));
  const sc = 1 + 0.10 * (1 - easeOut(a / 0.28));
  c.save(); c.translate(XRT, 416); c.scale(sc, sc);
  const wk = stage.text('km', 0, 26, {role: 'display', weight: 700, size: 60, color: PAL.warm, alpha: al, align: 'right'});
  stage.text(val, -wk - 14, 0, {role: 'display', weight: 700, size: 128, color: PAL.ink, alpha: al, align: 'right'});
  c.restore();
  const fa = smooth((t - P.ret1 - 0.3) / 0.3);
  if (fa > 0) stage.text('빛의 빠르기 × 왕복 시간 ÷ 2', XRT, 508, {role: 'body', weight: 400, size: 30, color: PAL.muted, alpha: fa, align: 'right'});
}
export function overlays(stage, t, ctx) {
  const P = plan(ctx.tl), c = stage.ctx;
  progressBar(stage, t, ctx.tl.duration);
  stage.text('메커니즘 · 실제 0.001초를 3,000배 느리게', 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center'});
  line(c, [[510, 172], [570, 172]], PAL.warm, 3);
  stage.text('돌아오는 시간이 곧 거리', 540, 232, {role: 'display', weight: 700, size: 62, color: PAL.ink, align: 'center'});
  distanceBlock(stage, t, P);
  receiver(stage, t, P);
}
