// 38 잠수함은 어떻게 찾을까 — intro and close scenes: hook (s01–s02), origin (s03–s05), essence (s06–s07), close (s23).
// PLAN.md §6.1, §6.2, §6.3, §6.9, §7. Stage-2 worker B. Same shape as scenes_core.mjs:
// planIntro(tl, P) → scenes {hook, origin, essence, close} → titles → soundIntro(tl, P).
// Every time comes from planIntro (word anchors via kit.wd); picture, instrument and sound read the same numbers.
// Colour roles: warm = came from the submarine (its sound, its echo, its field disturbance, a detection on the record);
// cool = sent by the searchers (radar, sonar ping). Field lines / ties / rulers are near-neutral PAL.field.
import {PAL, WARM, COOL, PX0, PX1, PY0, PY1, REC_BASE, W, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, ring, rect, withAlpha, TAU,
  fadeIn, fadeOut, keyed, hitFlash, hitAny, wd, tag, tagLeader, bigNum, cam, actorAlpha,
  sub, plane, ship, buoy, hydro, cable, glowBegin, glowFlush, ringWave, beamPulse, splatBurst,
  panel, panelLabel, axisTicks, recordLine, peakY, sampleRec, recNoise, tieLine, emptyBox, lens, snd} from './kit.mjs';
import {S as magS, fieldLines} from './model.mjs';

// =====================================================================================================
// small local helpers (not in kit)
// =====================================================================================================
const SURF0 = 640;                                          // surfY of hook / origin / close
/** sub geometry (mirrors kit.sub): sail top centre and mast top for a hull centre (x, y), length L, dir */
const subGeo = (x, y, L, dir = -1, mast = 0) => {
  const Hh = L * 0.13, sH = 0.7 * Hh, s0 = 0.16 * L, s1 = 0.30 * L, mx = s0 + 0.35 * (s1 - s0);
  return {sail: [x + dir * (s0 + s1) / 2, y - Hh / 2 - sH], mastTop: [x + dir * mx, y - Hh / 2 - sH - 64 * clamp(mast)], prop: [x - dir * (0.5 * L + 4), y], h: Hh};
};
/** damped-sine bursts at arrival times {t, k}: value at time tt (0.5 s each) */
const burstAt = (tt, arr, amp) => { let y = 0; for (const a of arr) { const g = tt - a.t; if (g >= 0 && g < 0.5) y += amp * (a.k ?? 1) * Math.exp(-g / 0.175) * Math.sin(g * TAU * 9); } return y; };
/** C1-smooth "max(0, u)" (soft knee of half-width h) */
const softPos = (u, h = 0.4) => (u >= h ? u : u <= -h ? 0 : (u + h) ** 2 / (4 * h));
/** draw field lines (precomputed absolute polylines [{x, y, k}]) translated by (dx, dy).
 *  o: {neutral (alpha of the plain line), warm (scale of the warm part), q (top→bottom reveal 0..1), yTop, yBot,
 *      hole {cx, cy, rx, ry} (skip inside the hull), lw, kMin} */
function drawField(stage, lines, dx, dy, o = {}) {
  const c = stage.ctx, yTop = o.yTop ?? 280, yBot = o.yBot ?? 1112, yRev = yTop + (yBot - yTop) * (o.q ?? 1), kMin = o.kMin ?? 0.06;
  const neutral = o.neutral ?? 0, warm = o.warm ?? 0, lw = o.lw ?? 1.6, h = o.hole;
  if (neutral <= 0 && warm <= 0) return;
  const inHole = (x, y) => h && ((x - h.cx) / h.rx) ** 2 + ((y - h.cy) / h.ry) ** 2 < 1;
  for (const L of lines) {
    let runN = [], runW = [], lvl = -1;
    const flushN = () => { if (runN.length > 1) line(c, runN, rgba(PAL.field, neutral), 1.2); runN = []; };
    const flushW = () => { if (runW.length > 1 && lvl > 0) line(c, runW, rgba(PAL.warm, Math.min(0.9, lvl / 10 * 0.9) * warm), lw); runW = []; };
    for (const p of L) {
      const x = p.x + dx, y = p.y + dy;
      if (y < yTop || y > yRev || y > yBot || inHole(x, y)) { flushN(); flushW(); lvl = -1; continue; }
      if (neutral > 0) runN.push([x, y]);
      if (warm > 0) {
        const l = p.k > kMin ? Math.max(1, Math.round(10 * clamp((p.k - kMin) / 0.5))) : 0;
        if (l !== lvl) { if (runW.length) { const last = runW[runW.length - 1]; flushW(); runW = [last]; } lvl = l; }
        runW.push([x, y]);
      }
    }
    flushN(); flushW();
  }
}
/** water clip for sound (never above the surface, never into the strip) */
const clipWater = ys => (x, y) => y > ys + 2 && y < 1112;

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planIntro(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), at = r => tl.at(r), SC = P.sc;
  // field lines around a hull centre at (0, 0) — translated for hook / close (poster: 5 lines)
  const REL = fieldLines(0, 0, {xs: [-150, -75, 0, 75, 150], y0: -900, y1: 900});
  // ---------------- hook (s01–s02)
  {
    const H = {};
    H.plane = {x: 300, y: 430, len: 300, v: 12};                       // drifts right from the end of the poster hold
    H.planeX = t => H.plane.x + H.plane.v * softPos(t - P.MORPH[0], 0.3);
    H.nose = t => [H.planeX(t) + 0.5 * H.plane.len, H.plane.y + H.plane.len * 0.0052];
    H.sub = {x: 690, y: 1000, len: 400};
    H.subGeo = subGeo(H.sub.x, H.sub.y, H.sub.len, -1);
    H.S = [640, SURF0];
    H.beam = 0.8;
    H.tA = W_('s02', '전파는', 0.15) - 0.1;
    H.pulses = [H.tA, H.tA + 2.6, H.tA + 5.2].filter(te => te <= SC.hook.end - 0.6);
    H.hits = H.pulses.map(te => te + H.beam);
    H.cmT = W_('s02', '센티미터', 0.4);
    H.dotT = W_('s02', '잠수함까지', 0.62);
    H.lens = {c: [760, 830], r: 150};
    H.rings = [150, 260, 370];                                          // poster: sound fronts from the tail (px)
    H.buoy = [880, SURF0]; H.mic = [880, 860];
    H.rel = REL;
    P.hook = H;
  }
  // ---------------- origin (s03–s05)
  {
    const O = {};
    O.sub = {x: 700, y0: 930, yUp: 652, len: 380};
    O.rise0 = W_('s03', '충전하러', 0.25) - 0.6; O.surfaced = O.rise0 + 2.0;
    O.sink0 = W_('s05', '원자력', 0.45) - 0.2; O.sunk = O.sink0 + 1.8;
    O.subY = keyed([[SC.origin.start, O.sub.y0], [O.rise0, O.sub.y0], [O.surfaced, O.sub.yUp, 'io'], [O.sink0, O.sub.yUp], [O.sunk, O.sub.y0, 'io']]);
    O.subDim = keyed([[SC.origin.start, 0.45], [O.rise0, 0.45], [O.surfaced, 0.08, 'io'], [O.sink0, 0.08], [O.sunk, 0.6, 'io']]);
    O.sail = t => subGeo(O.sub.x, O.subY(t), O.sub.len, -1).sail;
    // battery: drains while submerged, charges once surfaced (s03), then holds; replaced by the day counter at '공기'
    O.batt = keyed([[SC.origin.start, 0.45], [O.rise0, 0.25], [O.surfaced, 0.25], [at('s03:end'), 0.85, 'lin']]);
    // the patrol aircraft (y 470: a little lower than PLAN's 430 so the big number's sub-line clears it)
    O.plane0 = W_('s03', '비행기의', 0.3) - 1.6; O.planeIn = 1.4;
    O.plane = {y: 470, len: 300, v: 22};
    O.planeX = t => {
      if (t < O.plane0) return -200;
      const q = (t - O.plane0) / O.planeIn;
      let x = q < 1 ? lerp(-200, 300, easeOut(q)) : 300 + O.plane.v * (t - O.plane0 - O.planeIn);
      if (x > 1150) x = ((x + 200) % 1350) - 200;                       // leaves right, comes back from the left
      return x;
    };
    O.nose = t => [O.planeX(t) + 0.5 * O.plane.len, O.plane.y + O.plane.len * 0.0052];
    // radar pulses every 1.7 s from tR: a surfaced sail is hit (echo → peak), a submerged hull is not (dies at the surface)
    O.tR = W_('s03', '레이더에', 0.3) - 0.2; O.beam = 0.8;
    O.pulses = [];
    for (let te = O.tR; te + 2 * O.beam < SC.origin.end - 0.4; te += 1.7) {
      const th = te + O.beam, sail = O.sail(th), from = O.nose(te);
      if (sail[1] < SURF0 - 8) O.pulses.push({te, th, kind: 'sail', from, to: [sail[0], sail[1] + 10], back: te + 2 * O.beam});
      else O.pulses.push({te, th, kind: 'surf', from, to: [clamp(from[0] + 160, 390, 910), SURF0], back: null});
    }
    O.echoes = O.pulses.filter(p => p.kind === 'sail').map(p => p.back);
    O.firstSurf = O.pulses.find(p => p.kind === 'surf' && p.te > O.tR)?.th ?? Infinity;
    O.tagT = W_('s04', '비행기를', 0.3);
    O.hjT = W_('s04', '망을', 0.3) - 0.2; O.hj1 = W_('s04', '망을', 0.3); O.hj2 = W_('s04', '경계한다는', 0.45); O.hj3 = W_('s04', '초계기라고', 0.7);
    O.hjOut = at('s05') - 0.4;
    O.yearT = W_('s05', '천구백오십오년에', 0.02);
    O.airT = W_('s05', '공기', 0.5); O.day0 = W_('s05', '몇', 0.6); O.day1 = at('s05:end') + 0.5;
    P.origin = O;
  }
  // ---------------- essence (s06–s07)
  {
    const E = {};
    E.sub = {x: 560, y: 760, len: 640};
    E.tail = subGeo(E.sub.x, E.sub.y, E.sub.len, -1).prop;            // ≈ (884, 760)
    E.mic = [130, 760];
    E.t0 = W_('s06', '소리를', 0.3) - 0.5;
    E.V = 330; E.period = 0.7; E.rmax = 900;
    const dMic = Math.hypot(E.tail[0] - E.mic[0], E.tail[1] - E.mic[1]) - 7;
    E.emits = []; for (let te = E.t0; te < SC.essence.end - 0.2; te += E.period) E.emits.push(te);
    E.fieldT = W_('s06', '강철', 0.3); E.warmT = W_('s06', '자기장을', 0.42);
    E.dimT = W_('s07', '가려도', 0.48) - 0.3; E.boostT = W_('s07', '흔적까지', 0.4);
    E.boost = t => lerp(1, 1.25, smooth((t - E.boostT) / 0.4));
    E.arrivals = E.emits.map(te => ({t: te + dMic / E.V, k: E.boost(te + dMic / E.V)}));
    E.lines = fieldLines(E.sub.x, E.sub.y, {y0: 280, y1: 1120});          // 13 lines at x = 60, 140, …, 1020 (PLAN §4.4)
    // measuring point: passes the hull at 180 px above it; the record is the same ruler shifted +180 px into the right half
    E.d0 = 180; E.passX = [360, 760]; E.recDX = 180; E.passDur = 2.2;
    E.passes = [E.warmT, E.boostT];
    E.passAt = (t0, x) => t0 + E.passDur * (x - E.passX[0]) / (E.passX[1] - E.passX[0]);
    E.passHull = E.passes.map(t0 => E.passAt(t0, E.sub.x));            // the record's bump forms here
    P.essence = E;
  }
  // ---------------- close (s23)
  {
    const C = {}, sc = SC.close;
    C.ship = {x: 170, len: 220};
    C.dome = [C.ship.x + 0.36 * C.ship.len, SURF0 + C.ship.len * 0.045 * 0.85 + C.ship.len * 0.014];
    C.sink0 = W_('s23', '가려도', 0.48) - 0.4; C.sinkDur = 1.6;
    C.subQ = t => easeInOut((t - C.sink0) / C.sinkDur);
    C.subPos = t => { const q = C.subQ(t); return [lerp(700, 690, q), lerp(716, 1000, q)]; };
    C.subLen = t => lerp(380, 400, C.subQ(t));
    C.mast = t => 1 - C.subQ(t);
    C.V = 760;
    // ① sound from the tail reaches the ship's sonar; ② ping → hull → echo; ③ the field; ④ radar echo off the mast
    C.c1 = sc.start + 0.35;
    const tail = t => subGeo(...C.subPos(t), C.subLen(t), -1).prop;
    const dT = Math.hypot(tail(C.c1)[0] - C.dome[0], tail(C.c1)[1] - C.dome[1]);
    C.emits = []; for (let te = C.c1 - dT / C.V - 0.7; te < P.poster; te += 0.7) { const p = tail(te); C.emits.push({te, p, arr: te + Math.hypot(p[0] - C.dome[0], p[1] - C.dome[1]) / C.V}); }
    C.ping = sc.start + 0.05;
    const dS = Math.hypot(C.subPos(C.ping)[0] - C.dome[0], C.subPos(C.ping)[1] - C.dome[1]);
    C.pingHit = C.ping + dS / C.V; C.c2 = C.ping + 2 * dS / C.V;
    C.radarHit = C.sink0 + 0.15; C.radarTr = 0.45; C.radar0 = C.radarHit - C.radarTr; C.c4 = C.radarHit + C.radarTr;
    C.c3 = (C.c2 + C.c4) / 2;
    C.cells = [C.c1, C.c2, C.c3, C.c4];
    C.fieldT = W_('s23', '소리와', 0.5);
    // aircraft: flies at 30 px/s and settles at the poster's (300, 430)
    C.planeX = t => 300 - 30 * softPos(P.poster - t, 0.4);
    C.nose = t => [C.planeX(t) + 150, 430 + 1.56];
    C.mastAt = t => { const [x, y] = C.subPos(t); return subGeo(x, y, C.subLen(t), -1, C.mast(t)).mastTop; };
    C.rel = REL;
    P.close = C;
  }
  return P;
}
const PLANS = new WeakMap();
function localPlan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s])), MORPH: [0.9, 1.7], poster: tl.at('s23:end') - 1.4};
  PLANS.set(tl, P); planIntro(tl, P); return P;
}
const planOf = ctx => (ctx.P?.hook ? ctx.P : ctx.plan?.hook ? ctx.plan : localPlan(ctx.tl));
export const signature = P => [P.hook?.tA, P.origin?.tR, P.essence?.t0, P.close?.c4].map(x => (x == null ? '-' : x.toFixed(3))).join(',');

// =====================================================================================================
// shared drawing: the poster props (0 s and the final return)
// =====================================================================================================
/** sound fronts (static radii), warm field lines, the buoy and its microphone. a = alpha */
function posterProps(stage, G, H, sb, a, ys, grow = 0) {
  if (a <= 0) return;
  const c = stage.ctx, tail = sb.prop, clip = (x, y) => y > ys + 2 && y < 1340;
  H.rings.forEach((r, i) => ringWave(G.GW, tail[0], tail[1], r + grow, {crests: 2, gap: 14, amp: a * [1, 0.8, 0.6][i], clip}));
  withAlpha(c, a, () => drawField(stage, H.rel, sb.center[0], sb.center[1], {warm: 0.55, yTop: ys + 2, yBot: 1340, hole: {cx: sb.center[0], cy: sb.center[1], rx: sb.len / 2 + 6, ry: sb.h * 0.62}, lw: 2}));
  const bu = buoy(stage, H.buoy[0], ys, {a});
  cable(stage, [bu.bottom, [H.mic[0], H.mic[1] - 10]], a);
  // the microphone is on the first front's path: it is lit by the sound from the submarine
  const dm = Math.hypot(H.mic[0] - tail[0], H.mic[1] - tail[1]), lit = 0.8 * Math.exp(-(((dm - H.rings[0] - grow) / 40) ** 2));
  hydro(stage, H.mic[0], H.mic[1], {a, lit});
}

// =====================================================================================================
// HOOK (s01–s02) — surfY 640. Radar dies within ~1 cm of sea water; the hull is never reached.
// =====================================================================================================
function hookScene(stage, t, p, ctx) {
  const P = planOf(ctx), H = P.hook, SC = P.sc, c = stage.ctx, cm = cam('hook', t, ctx.tl), A = actorAlpha(t, SC.hook, ctx.tl), ys = cm.surf;
  const G = glowBegin(), {GW, GC} = G;
  c.globalAlpha = A;
  const [m0, m1] = P.MORPH, postA = 1 - smooth((t - m0) / 0.6), live = fadeIn(t, m1, 0.4);
  const dS = [H.S[0], ys];
  // ---- ties from the world to the radar screen (under the lens)
  if (live > 0) { tieLine(stage, dS[0], ys + 4, live * 0.8); tieLine(stage, H.sub.x, H.sub.y + 30, live * 0.8); }
  // ---- bodies
  const pl = plane(stage, H.planeX(t), H.plane.y, {len: H.plane.len, dir: 1, prop: t * TAU * 3});
  const sb = sub(stage, H.sub.x, H.sub.y, {len: H.sub.len, dir: -1, dim: lerp(0.45, 0.6, smooth((t - m0) / 0.8)), prop: t * TAU * 1.0});
  // ---- poster props (fade out over the morph); fronts keep spreading at the sound's own pace while they fade
  posterProps(stage, G, H, sb, postA, ys, 330 * t);
  // ---- radar pulses: nose → surface point S (cool), a short burst where they die
  H.pulses.forEach((te, i) => {
    const q = (t - te) / H.beam; if (q >= 0 && q <= 1) beamPulse(GC, H.nose(te), dS, q, {amp: 1});
    const f = hitFlash(t, H.hits[i], 0.3); if (f > 0) splatBurst(GC, dS[0], dS[1] + 2, 26, 0.9 * f, COOL);
  });
  // ---- dotted path from S to the hull: the radar does not get there (s02 '잠수함까지')
  const dq = clamp((t - H.dotT) / 0.6);
  if (dq > 0) {
    const sail = H.subGeo.sail, e = [lerp(dS[0], sail[0], easeOut(dq)), lerp(dS[1], sail[1] - 14, easeOut(dq))];
    line(c, [dS, e], rgba(PAL.field, 0.35 * 1.6), 1.6, {dash: [3, 9]});
    if (dq >= 1) withAlpha(c, fadeIn(t, H.dotT + 0.6, 0.2), () => ring(c, sail[0], sail[1] - 14 - 11, 11, rgba(PAL.field, 0.8), 1.6));
  }
  // ---- zoom lens at S: the wave decays within ~1 cm of sea water (opens at the first hit)
  const h0 = H.hits[0], lq = clamp((t - h0) / 0.4);
  if (lq > 0) {
    const [cx, cy] = H.lens.c, R = H.lens.r, Ls = lens(stage, cx, cy, R, dS, lq);
    const surfL = cy - R / 2, cmPx = 60, wx = cx + 40, amp0 = 34, lam = 46;
    const lastHit = H.hits.filter(x => t >= x).pop() ?? h0;
    const front = cy - R + (2 * R) * clamp((t - lastHit) / 0.9);
    Ls.clipLens(rr => {
      let g = c.createLinearGradient(0, cy - rr, 0, surfL); g.addColorStop(0, '#001621'); g.addColorStop(1, '#07303F');
      c.fillStyle = g; c.fillRect(cx - rr, cy - rr, 2 * rr, surfL - (cy - rr));
      g = c.createLinearGradient(0, surfL, 0, cy + rr); g.addColorStop(0, '#0A3D4D'); g.addColorStop(1, '#03202B');
      c.fillStyle = g; c.fillRect(cx - rr, surfL, 2 * rr, cy + rr - surfL);
      line(c, [[cx - rr, surfL], [cx + rr, surfL]], rgba('#4A8AA0', 0.9), 2);
      // depth ruler 0–3 cm (1 cm = 60 px)
      const rx = cx - 40;
      line(c, [[rx, surfL], [rx, surfL + 3 * cmPx]], rgba(PAL.muted, 0.6), 1.4);
      for (let k = 0; k <= 3; k++) { const y = surfL + k * cmPx; line(c, [[rx - 8, y], [rx, y]], rgba(PAL.muted, 0.8), 1.4); stage.text(k === 3 ? '3 cm' : String(k), rx - 12, y, {size: 24, weight: 500, color: PAL.muted, align: 'right'}); }
      // envelope e^(−z / 1 cm), faint
      const env = y => (y < surfL ? amp0 : amp0 * Math.exp(-(y - surfL) / cmPx));
      for (const s of [-1, 1]) line(c, sampleRec(y => y, cy - rr, cy + rr, 4).map(([, y]) => [wx + s * env(y), y]), rgba(PAL.field, 0.28), 1.2, {dash: [3, 6]});
      // the travelling wave: drawn down to `front`, then only its phase flows
      const ph = (t - lastHit) * 2 * Math.PI * 1.6, pts = [];
      for (let y = cy - rr; y <= Math.min(front, cy + rr); y += 2) pts.push([wx + env(y) * Math.sin((y - (cy - R)) / lam * TAU - ph), y]);
      if (pts.length > 1) {
        line(c, pts, rgba(PAL.cool, 0.85), 2.4);
        for (let i = 0; i < pts.length; i += 4) { const k = env(pts[i][1]) / amp0; if (k > 0.04) GC.splat(pts[i][0], pts[i][1], 5, COOL, 0.32 * k); }
      }
    });
    Ls.frame();
  }
  // ---- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---- instrument strip (from the end of the morph): radar screen, x = the world's x
  if (live > 0) {
    const g2 = glowBegin();
    withAlpha(c, live, () => {
      panel(stage, 1); panelLabel(stage, '레이더 화면', 1);
      axisTicks(stage, [{x: dS[0], label: '수면'}], 1, {x0: 100, x1: 940});
      const got = H.hits.filter(x => t >= x), first = got.length ? got[0] : null;
      const bump = first == null ? 0 : 22 * easeOut((t - first) / 0.2) + got.reduce((m, x) => Math.max(m, 18 * Math.exp(-(t - x) / 0.5) * smooth((t - x) / 0.08)), 0);
      const pts = sampleRec(x => peakY(x, dS[0], bump, 8) - recNoise(x, 1.5, 11), 100, 940, 3);
      recordLine(stage, pts, {col: PAL.rec, alpha: 0.8});
      if (bump > 0) { line(c, sampleRec(x => peakY(x, dS[0], bump, 8), dS[0] - 24, dS[0] + 24, 2), rgba(PAL.coolHi, 0.95), 2.4); const f = hitAny(t, got, 0.35); if (f > 0) g2.GC.splat(dS[0], REC_BASE - bump, 8, COOL, 0.8 * f); }
      emptyBox(stage, H.sub.x, 1, {w: 50, h: 70});
    });
    c.globalAlpha = 1; glowFlush(stage, {alpha: A * live}); c.globalAlpha = A;
  }
  // ---- big number: ~1 cm (s02 '센티미터')
  if (t >= H.cmT - 0.05) bigNum(stage, '약 1', 'cm', t, H.cmT, 1, {sub: '전파가 줄어드는 깊이'});
  void pl;
}

// =====================================================================================================
// ORIGIN (s03–s05) — surfY 640. Surfaced to charge → seen by radar; the name 哨戒; 1955: stays down for months.
// =====================================================================================================
const BAT = {x: 116, y: 1214, w: 200, h: 34}, RAD = {x0: 360, x1: 940};
function originScene(stage, t, p, ctx) {
  const P = planOf(ctx), O = P.origin, SC = P.sc, c = stage.ctx, cm = cam('origin', t, ctx.tl), A = actorAlpha(t, SC.origin, ctx.tl), ys = cm.surf;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  const subY = O.subY(t);
  // ---- ties
  tieLine(stage, O.sub.x, subY + 30, 0.7);
  // ---- bodies
  const hitsSail = O.pulses.filter(q => q.kind === 'sail').map(q => q.th);
  const sb = sub(stage, O.sub.x, subY, {len: O.sub.len, dir: -1, dim: O.subDim(t), lit: hitAny(t, hitsSail), litCol: PAL.cool, prop: t * TAU * 1.2});
  const px = O.planeX(t);
  const pl = px > -190 ? plane(stage, px, O.plane.y, {len: O.plane.len, dir: 1, prop: t * TAU * 3}) : null;
  // ---- radar pulses: out (cool) → sail hit (lit) → echo back (warm)  |  or die at the surface
  for (const q of O.pulses) {
    const qo = (t - q.te) / O.beam; if (qo >= 0 && qo <= 1) beamPulse(GC, q.from, q.to, qo);
    if (q.kind === 'sail') { const qb = (t - q.th) / O.beam; if (qb >= 0 && qb <= 1) beamPulse(GW, q.to, O.nose(q.back), qb); }
    else { const f = hitFlash(t, q.th, 0.3); if (f > 0) splatBurst(GC, q.to[0], ys + 2, 22, 0.85 * f, COOL); }
  }
  // ---- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  const {GW: gw2} = glowBegin();
  // ---- instrument strip: battery (left) | radar screen (right, x = the world's x)
  panel(stage, 1);
  line(c, [[345, PY0 + 14], [345, PY1 - 14]], rgba(PAL.panelEdge, 0.9), 1.2);
  const battA = 1 - smooth((t - O.airT) / 0.3), dayA = fadeIn(t, O.airT + 0.15, 0.3);
  if (battA > 0) withAlpha(c, battA, () => {
    panelLabel(stage, '배터리', 1);
    const v = O.batt(t), charging = t > O.surfaced && t < ctx.tl.at('s03:end') + 0.2;
    rect(c, BAT.x, BAT.y, BAT.w, BAT.h, 5, rgba('#03141C', 0.6), rgba(PAL.field, 0.7), 1.6);
    rect(c, BAT.x + BAT.w, BAT.y + 9, 7, BAT.h - 18, 2, rgba(PAL.field, 0.7));
    rect(c, BAT.x + 4, BAT.y + 4, (BAT.w - 8) * v, BAT.h - 8, 3, rgba(PAL.rec, charging ? 0.95 : 0.8));
  });
  if (dayA > 0) withAlpha(c, dayA, () => {
    panelLabel(stage, '물속에 머문 날', 1);
    const n = Math.round(lerp(1, 90, easeInOut((t - O.day0) / (O.day1 - O.day0)))), s = String(n);
    const w = stage.text(s, BAT.x, 1250, {role: 'display', weight: 700, size: 64, color: PAL.ink});
    stage.text('일', BAT.x + w + 10, 1262, {role: 'display', weight: 700, size: 34, color: PAL.warm});
  });
  panelLabel(stage, '레이더 화면', 1, {x: RAD.x0 + 16});
  {
    // sail echoes: a warm peak at the hull x that refreshes with every echo; after the dive it stays as a dashed ghost
    const got = O.echoes.filter(x => t >= x);
    const hPk = got.reduce((m, a) => Math.max(m, 80 * easeOut((t - a) / 0.2) * (0.62 + 0.38 * Math.exp(-(t - a) / 0.7))), 0);
    const ghost = smooth((t - O.firstSurf) / 0.4);
    // surface bumps (cool, transient) where a pulse died
    const surf = O.pulses.filter(q => q.kind === 'surf' && t >= q.th);
    const fy = x => {
      let y = REC_BASE - recNoise(x, 1.5, 21);
      if (ghost < 1) y -= hPk * (1 - ghost) * Math.exp(-(((x - O.sub.x) / 9) ** 2));
      for (const q of surf) y -= 22 * Math.exp(-(t - q.th) / 0.9) * smooth((t - q.th) / 0.1) * Math.exp(-(((x - q.to[0]) / 8) ** 2));
      return y;
    };
    recordLine(stage, sampleRec(fy, RAD.x0, RAD.x1, 3), {col: PAL.rec, alpha: 0.8});
    if (hPk > 0 && ghost < 1) {
      line(c, sampleRec(x => peakY(x, O.sub.x, hPk * (1 - ghost), 9), O.sub.x - 26, O.sub.x + 26, 2), rgba(PAL.warm, 0.95 * (1 - ghost)), 2.4);
      const f = hitAny(t, got, 0.4); if (f > 0) gw2.splat(O.sub.x, REC_BASE - hPk, 9, WARM, 0.9 * f);
    }
    if (ghost > 0 && hPk > 0) line(c, sampleRec(x => peakY(x, O.sub.x, 80 * 0.62, 9), O.sub.x - 30, O.sub.x + 30, 2), rgba(PAL.warm, 0.35 * ghost), 2, {dash: [3, 4]});
    for (const q of surf) { const k = Math.exp(-(t - q.th) / 0.9); if (k > 0.05) line(c, sampleRec(x => peakY(x, q.to[0], 22 * k, 8), q.to[0] - 20, q.to[0] + 20, 2), rgba(PAL.coolHi, 0.8 * k), 2); }
    axisTicks(stage, [], 1, {x0: RAD.x0, x1: RAD.x1});
  }
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---- name tag, 哨戒 cells, big numbers
  const hjA = fadeIn(t, O.hjT, 0.3) * fadeOut(t, O.hjOut, 0.3);
  if (pl) {
    const ta = fadeIn(t, O.tagT - 0.1, 0.3) * fadeOut(t, O.hjOut, 0.3), hi = hitFlash(t, O.hj3, 0.5);
    if (ta > 0) tagLeader(stage, '초계기', [px - 20, O.plane.y - 30], [px - 20, O.plane.y - 84], {size: 28, a: ta, border: hi > 0 ? mix(PAL.panelEdge, PAL.warm, hi) : null, color: hi > 0 ? mix(PAL.ink, PAL.hot, hi) : PAL.ink});
  }
  if (hjA > 0) {
    const cell = (ch, sub_, x, tOn) => {
      const k = Math.max(hitFlash(t, tOn, 0.6), hitFlash(t, O.hj3, 0.6)), on = t >= tOn ? 1 : 0;
      const col = mix(PAL.ink, PAL.warm, Math.max(0.0, 0.35 * on + 0.65 * k));
      stage.text(ch, x, 322, {role: 'display', weight: 700, size: 110, color: col, alpha: hjA, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16});
      stage.text(sub_, x, 412, {role: 'body', weight: 500, size: 30, color: PAL.muted, alpha: hjA, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 12});
    };
    cell('哨', '망볼 초', 700, O.hj1); cell('戒', '경계할 계', 860, O.hj2);
  }
  if (t >= O.yearT - 0.05) bigNum(stage, '1955', '', t, O.yearT, fadeIn(t, O.yearT - 0.03, 0.05), {sub: '첫 원자력 잠수함 항해'});
  void sb;
}

// =====================================================================================================
// ESSENCE (s06–s07) — surfY 400 (camera down in the water). The hull hides; its sound and its field do not.
// =====================================================================================================
const HALF = {l0: 100, l1: 500, r0: 540, r1: 940};
function essenceScene(stage, t, p, ctx) {
  const P = planOf(ctx), E = P.essence, SC = P.sc, c = stage.ctx, cm = cam('essence', t, ctx.tl), A = actorAlpha(t, SC.essence, ctx.tl), ys = cm.surf;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  const boost = E.boost(t), clip = clipWater(ys);
  // ---- field lines (under the hull): neutral reveal at '강철', warm bend at '자기장을'
  const fq = clamp((t - E.fieldT) / 1.2), warmA = smooth((t - E.warmT) / 0.5);
  const hole = {cx: E.sub.x, cy: E.sub.y, rx: E.sub.len / 2 + 8, ry: E.sub.len * 0.13 * 0.62};
  if (fq > 0) drawField(stage, E.lines, 0, 0, {neutral: 0.2, q: fq, yTop: 280, yBot: 1112, hole});
  if (warmA > 0) drawField(stage, E.lines, 0, 0, {warm: warmA * boost, yTop: 280, yBot: 1112, hole, lw: 2});
  // ---- microphone on its cable (left)
  cable(stage, [[E.mic[0], ys], [E.mic[0], E.mic[1] - 10]]);
  hydro(stage, E.mic[0], E.mic[1], {lit: hitAny(t, E.arrivals.map(a => a.t), 0.3)});
  // ---- hull (fades into the dark at s07 '가려도')
  const dim = lerp(0.2, 0.92, smooth((t - E.dimT) / 1.2));
  const spin = Math.max(0, t - E.t0) * TAU * 1.5;
  sub(stage, E.sub.x, E.sub.y, {len: E.sub.len, dir: -1, dim, prop: spin});
  // ---- sound fronts from the propeller (warm), 330 px/s, one per 0.7 s
  for (const te of E.emits) { const r = E.V * (t - te); if (r <= 0 || r > E.rmax) continue; ringWave(GW, E.tail[0], E.tail[1], r, {crests: 2, gap: 15, amp: boost * (1 - smooth((r - 700) / 200)), clip}); }
  // ---- measuring point passes 180 px above the hull; a dashed tie to the pen on the record
  const passIdx = E.passes.map((t0, i) => (t >= t0 && t <= t0 + E.passDur + 0.3 ? i : -1)).filter(i => i >= 0).pop();
  if (passIdx != null) {
    const t0 = E.passes[passIdx], q = clamp((t - t0) / E.passDur), x = lerp(E.passX[0], E.passX[1], q), y = E.sub.y - E.d0;
    const a = fadeIn(t, t0, 0.15) * fadeOut(t, t0 + E.passDur, 0.3);
    withAlpha(c, a, () => {
      line(c, [[x, y + 8], [x + E.recDX, PY0]], rgba(PAL.line, 0.55), 1.2, {dash: [3, 8]});
      c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y); c.lineTo(x, y + 7); c.lineTo(x - 7, y); c.closePath(); c.fillStyle = PAL.ink; c.fill();
    });
  }
  // ---- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  const {GW: gw2} = glowBegin();
  // ---- instrument strip: received sound (left; the pen is at the microphone's x) | field strength (right)
  panel(stage, 1);
  line(c, [[520, PY0 + 14], [520, PY1 - 14]], rgba(PAL.panelEdge, 0.9), 1.2);
  panelLabel(stage, '받은 소리', 1);
  panelLabel(stage, '자기장 세기', 1, {x: HALF.r0 + 2});
  tieLine(stage, E.mic[0], E.mic[1] + 12, 0.7);
  {
    const WY = 1236, pxs = 300, x0 = E.mic[0];
    const fy = x => { const tt = t - (x - x0) / pxs; return WY - burstAt(tt, E.arrivals, 26) - 1.2 * Math.sin(x * 0.9 + tt * 7); };
    const pts = sampleRec(fy, x0, HALF.l1, 2);
    recordLine(stage, pts, {col: PAL.rec, alpha: 0.75});
    let seg = []; const segs = [];
    for (const [x, y] of pts) { const tt = t - (x - x0) / pxs, on = E.arrivals.some(a => tt - a.t >= 0 && tt - a.t < 0.42); if (on) seg.push([x, y]); else if (seg.length) { segs.push(seg); seg = []; } }
    if (seg.length) segs.push(seg);
    for (const s of segs) if (s.length > 1) line(c, s, rgba(PAL.warm, 0.95), 2.2);
    const f = E.arrivals.reduce((m, a) => Math.max(m, hitFlash(t, a.t, 0.3) * (a.k ?? 1)), 0); if (f > 0) gw2.splat(x0, WY, 9, WARM, 0.55 * f);
  }
  {
    const base = REC_BASE - 6, ruler = x => x - E.recDX;            // record x → world x
    const recY = (x, h) => base - h * magS(ruler(x) - E.sub.x, E.d0) - recNoise(x, 1.2, 31);
    const drawPass = (i, alpha, pen) => {
      const t0 = E.passes[i]; if (t < t0) return;
      const q = clamp((t - t0) / E.passDur), xe = HALF.r0 + (HALF.r1 - HALF.r0) * q;
      const pts = sampleRec(x => recY(x, 60), HALF.r0, xe, 3);
      recordLine(stage, pts, {col: PAL.rec, alpha: 0.85 * alpha, G: pen && q < 1 ? gw2 : null, gcol: COOL});
      const bump = pts.filter(([x]) => Math.abs(ruler(x) - E.sub.x) < 120);
      if (bump.length > 1) line(c, bump, rgba(PAL.warm, 0.95 * alpha), 2.4, alpha < 1 ? {dash: [3, 4]} : {});
      if (pen) { const f = hitFlash(t, E.passHull[i], 0.4); if (f > 0) gw2.splat(E.sub.x + E.recDX, base - 60, 9, WARM, 0.9 * f); }
    };
    const second = t >= E.passes[1];
    drawPass(0, second ? 0.35 : 1, !second);
    if (second) drawPass(1, 1, true);
    line(c, [[HALF.r0, base], [HALF.r1, base]], rgba(PAL.field, 0.18), 1);
  }
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
}

// =====================================================================================================
// CLOSE (s23) — surfY 640. The four traces fire once each, then the hull hides; the poster returns.
// =====================================================================================================
const CELLS = [100, 310, 520, 730], CELL_W = 200, CELL_NAMES = ['듣기', '메아리', '자기장', '레이더'];
function closeScene(stage, t, p, ctx) {
  const P = planOf(ctx), C = P.close, H = P.hook, SC = P.sc, c = stage.ctx, cm = cam('close', t, ctx.tl), A = actorAlpha(t, SC.close, ctx.tl), ys = cm.surf;
  const G = glowBegin(), {GW, GC} = G;
  c.globalAlpha = A;
  const post = smooth((t - P.poster) / 0.8), live = 1 - smooth((t - (P.poster - 0.4)) / 0.4), clip = clipWater(ys);
  const [sx, sy] = C.subPos(t), sl = C.subLen(t), sinkQ = C.subQ(t);
  // ---- field: ③ flashes, then stays from '소리와'; at the poster it settles to the poster's 0.55
  const fA = Math.max(0.9 * fadeIn(t, C.c3 - 0.05, 0.1) * fadeOut(t, C.c3 + 0.45, 0.2), 0.7 * fadeIn(t, C.fieldT, 0.4));
  const geo = subGeo(sx, sy, sl, -1);
  if (fA > 0 && post < 1) withAlpha(c, 1 - post, () => drawField(stage, C.rel, sx, sy, {warm: fA, yTop: ys + 2, yBot: 1112, hole: {cx: sx, cy: sy, rx: sl / 2 + 6, ry: geo.h * 0.62}, lw: 2}));
  // ---- ship (appears at the scene start; leaves at the poster)
  const shipA = fadeIn(t, SC.close.start, 0.4) * (1 - post);
  const echoBack = C.c2, domeWarm = Math.max(hitAny(t, C.emits.map(e => e.arr), 0.35), hitFlash(t, echoBack, 0.5));
  if (shipA > 0) ship(stage, C.ship.x, ys, {len: C.ship.len, dir: 1, a: shipA, domeLit: hitFlash(t, C.ping, 0.3), domeWarm});
  // ---- aircraft (radar)
  const px = C.planeX(t);
  plane(stage, px, 430, {len: 300, dir: 1, prop: t * TAU * 3});
  // ---- submarine: mast up, then down while the hull sinks into the dark (s23 '가려도'); poster: dim 0.45, length 400
  const dim = lerp(lerp(0.3, 0.92, sinkQ), 0.45, post);
  const mastLit = hitFlash(t, C.radarHit, 0.3);
  const sb = sub(stage, sx, sy, {len: sl, dir: -1, dim, mast: C.mast(t), mastLit, mastLitCol: PAL.cool, lit: hitFlash(t, C.pingHit, 0.3), litCol: PAL.cool, prop: t * TAU * 1.2});
  // ---- ① sound fronts from the tail (warm), stop at the poster
  const ringsA = 1 - post;
  if (ringsA > 0) for (const e of C.emits) { const r = C.V * (t - e.te); if (r <= 0 || r > 1100) continue; ringWave(GW, e.p[0], e.p[1], r, {crests: 2, gap: 15, amp: ringsA * (1 - smooth((r - 800) / 300)), clip}); }
  // ---- ② ping (cool) → hull → echo (warm)
  { const r = C.V * (t - C.ping); if (r > 0 && r < 1200) ringWave(GC, C.dome[0], C.dome[1], r, {crests: 3, amp: 1 - smooth((r - 800) / 400), clip});
    const re = C.V * (t - C.pingHit); if (re > 0 && re < 1100) ringWave(GW, C.subPos(C.pingHit)[0], C.subPos(C.pingHit)[1], re, {crests: 2, amp: 1 - smooth((re - 700) / 400), clip}); }
  // ---- ④ radar pulse to the mast and its echo
  { const from = C.nose(C.radar0), to = C.mastAt(C.radarHit);
    const q1 = (t - C.radar0) / C.radarTr; if (q1 >= 0 && q1 <= 1) beamPulse(GC, from, to, q1);
    const q2 = (t - C.radarHit) / C.radarTr; if (q2 >= 0 && q2 <= 1) beamPulse(GW, to, C.nose(C.c4), q2); }
  // ---- poster props come back
  if (post > 0) posterProps(stage, G, H, sb, post, ys, 0);
  // ---- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---- instrument strip: four cells, each lit once (warm = came from the submarine)
  if (live > 0) {
    const {GW: gw2} = glowBegin();
    withAlpha(c, live, () => {
      panel(stage, 1);
      CELLS.forEach((x0, i) => {
        if (i) line(c, [[x0 - 5, PY0 + 14], [x0 - 5, PY1 - 14]], rgba(PAL.panelEdge, 0.9), 1.2);
        panelLabel(stage, CELL_NAMES[i], 1, {x: x0 + 8});
        const tc = C.cells[i], g = easeOut((t - tc) / 0.3), xa = x0 + 12, xb = x0 + CELL_W - 18, xm = (xa + xb) / 2, base = REC_BASE - 10;
        const shape = [
          x => (t < tc ? 0 : 18 * g * Math.exp(-Math.max(0, x - (xm - 50)) / 34) * Math.sin((x - (xm - 50)) / 9) * (x > xm - 50 ? 1 : 0)),
          x => 60 * g * Math.exp(-(((x - xm) / 8) ** 2)),
          x => 48 * g * magS((x - xm) * 1.6, 60),
          x => 60 * g * Math.exp(-(((x - xm) / 8) ** 2)),
        ][i];
        const pts = sampleRec(x => base - (t >= tc ? shape(x) : 0) - recNoise(x, 1.2, 40 + i), xa, xb, 2);
        recordLine(stage, pts, {col: PAL.rec, alpha: 0.7});
        if (t >= tc) {
          const hot = pts.filter(([x]) => Math.abs(shape(x)) > 1.2 || (i === 0 && x > xm - 52 && x < xm + 40));
          if (hot.length > 1) line(c, hot, rgba(PAL.warm, 0.95), 2.2);
          const f = hitFlash(t, tc, 0.45); if (f > 0) gw2.splat(xm, base - (i === 2 ? 48 : i === 0 ? 10 : 60) * g, 9, WARM, 0.9 * f);
        }
      });
    });
    c.globalAlpha = 1; glowFlush(stage, {alpha: A * live}); c.globalAlpha = A;
  }
}

export const scenes = {hook: hookScene, origin: originScene, essence: essenceScene, close: closeScene};

// =====================================================================================================
// HEADERS (PLAN §6.1, §6.2, §6.3, §6.9)
// =====================================================================================================
export const titles = {
  hook: P => [[-Infinity, '오늘의 주제', '잠수함은 어떻게 찾을까?']],
  origin: P => { const at = s => P.tl.at(s) - 0.5; return [[-Infinity, '제2차 세계대전', '떠오르면 레이더에 들켰다'], [at('s04'), '이름 · 哨戒', '망보며 경계하는 비행기'], [at('s05'), '1955 · 빨리 감기', '공기 없이 몇 달씩 물속에']]; },
  essence: P => [[-Infinity, '본질', '모습은 가려도 흔적은 남는다']],
  close: P => [[-Infinity, '정리', '숨길 수 없는 흔적']],
};

// =====================================================================================================
// SOUND (PLAN §7) — hook, origin, essence, close; plus the two poster swells
// =====================================================================================================
export function soundIntro(tl, P) {
  const H = P.hook, O = P.origin, E = P.essence, C = P.close, ev = [];
  const humTick = g => ({freq: 82, decay: 0.18, click: 0, gain_db: g});
  ev.push(snd.swell('poster', 0.05, [98, 147], 1.8, -34, '첫 화면(썸네일): 포스터 구도'));
  ev.push(snd.swell('poster_end', P.poster, [98, 147], 1.8, -34, '포스터 구도로 돌아옴'));
  // ---- hook
  H.pulses.forEach((te, i) => {
    ev.push(snd.tick('hook_radar' + (i + 1), te, 196, -38, `초계기가 레이더 펄스를 쏨(${i + 1})`, {decay: 0.1}));
    ev.push(snd.whoosh('hook_surface' + (i + 1), H.hits[i], 0.4, 220, 110, -40, `전파가 수면에서 사라짐(${i + 1}) — 확대 원의 물결이 1 cm 안에서 줄어듦`));
  });
  ev.push(snd.tick('hook_1cm', H.cmT, 147, -35, '큰 숫자 "약 1 cm"', {decay: 0.12}));
  // ---- origin
  O.pulses.forEach((q, i) => {
    ev.push(snd.tick('origin_radar' + (i + 1), q.te, 196, -38, `초계기 레이더 펄스(${i + 1})`, {decay: 0.1}));
    if (q.kind === 'sail') ev.push(snd.tone('origin_echo' + (i + 1), q.back, 294, 0.16, -32, `떠오른 잠수함에 맞은 메아리가 도착(${i + 1}) — 레이더 화면의 봉우리와 같은 프레임`, {decay: 0.08, sustain: 0.15}));
    else ev.push(snd.whoosh('origin_surface' + (i + 1), q.th, 0.4, 220, 110, -40, `잠긴 잠수함: 전파가 수면에서 사라짐(${i + 1})`));
  });
  ev.push(snd.tick('origin_hanja', O.hjT, 147, -35, '한자 칸 哨戒가 뜸', {decay: 0.12}));
  ev.push(snd.tick('origin_1955', O.yearT, 147, -35, '큰 숫자 "1955"', {decay: 0.12}));
  // ---- essence: one low beat per sound front from the propeller
  ev.push(snd.train('hum_essence', E.emits.map(te => [te, 'tick', humTick(te >= E.boostT ? 1.5 : 0)]), -40, 'essence: 프로펠러에서 난색 소리 파면이 하나 나올 때마다 낮은 박동'));
  // ---- close
  ev.push(snd.train('hum_close', C.emits.filter(e => e.te >= P.sc.close.start && e.te < P.poster).map(e => [e.te, 'tick', humTick(0)]), -40, 'close: 잠수함 꼬리의 소리 파면마다 낮은 박동(① 듣기)'));
  ev.push(snd.tone('close_ping', C.ping, 440, 0.22, -30, 'close ②: 군함 소나가 쏨', {decay: 0.06, sustain: 0}));
  ev.push(snd.tone('close_echo', C.c2, 330, 0.2, -33, 'close ②: 메아리가 군함에 도착 — 메아리 칸이 켜짐', {decay: 0.08, sustain: 0.2}));
  ev.push(snd.chirp('close_field', C.c3, [[0, 220, 0], [0.15, 220, 0.6], [0.45, 220, 0.6], [0.6, 220, 0]], -34, 'close ③: 휜 자기장 선이 난색으로 — 자기장 칸이 켜짐'));
  ev.push(snd.tick('close_radar', C.radar0, 196, -38, 'close ④: 초계기 레이더 펄스(관을 향해)', {decay: 0.1}));
  ev.push(snd.tone('close_radar_echo', C.c4, 294, 0.16, -32, 'close ④: 관에 맞은 메아리 도착 — 레이더 칸이 켜짐', {decay: 0.08, sustain: 0.15}));
  return ev.filter(Boolean);
}
