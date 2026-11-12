// 38 잠수함은 어떻게 찾을까 — the patrol-aircraft scenes: buoy (s16–s18), mad (s19–s20), mast (s21). PLAN.md §4.3, §4.4,
// §6.6, §6.7, §6.8, §7. Stage-2 worker C.
// Exports: planAir(tl, P), scenes {buoy, mad, mast}, titles {buoy, mad, mast}, soundAir(tl, P), signature(P).
// Every time comes from planAir (word anchors via kit.wd); picture, instrument and sound read the same numbers.
// Colour roles: warm = came from the submarine (its sound, its field disturbance, detections); cool = sent by the
// searchers (radio from the buoys, the radar beam).
import {PAL, WARM, COOL, PX0, PY0, PY1, REC_BASE, W, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, ring, rect, withAlpha, TAU,
  fadeIn, fadeOut, win, hitFlash, hitAny, wd, tag, tagLeader, bigNum, cam, actorAlpha, layerWater, layerEdges, depthTicks,
  sub, ship, plane, buoy as buoyBody, hydro, cable, glowBegin, glowFlush, ringWave, beamPulse,
  panel, panelLabel, axisTicks, recordLine, sampleRec, recNoise, tieLine, emptyBox, snd} from './kit.mjs';
import {BUOY, buoyLevels, S as magS, fieldLines} from './model.mjs';

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
const PL = 280, BOOM = 0.62 * PL;          // aircraft length in buoy/mad; centre → tail-boom tip (kit plane(): tail −0.42L −0.02L − boom 0.18L)
/** cubic Hermite from (p0, m0) to (p1, m1) over u ∈ [0, 1] (m in units per u) */
const hermite = (u, p0, p1, m0, m1) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1; };
/** inverse of a monotone f on [0, 1] (bisection) */
const invert = (f, y) => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(m) < y) a = m; else b = m; } return (a + b) / 2; };

export function planAir(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), at = r => tl.at(r), SC = P.sc;
  // ---------------- buoy (s16–s18): camera kx 0.075, kz 1.0, X=0 → x 90, surf 560
  {
    const B = {}, sc = SC.buoy;
    B.sx = X => 90 + 0.075 * X;
    B.lev = buoyLevels(BUOY);                                   // {X, r, db, h, dt}
    B.bx = B.lev.map(l => B.sx(l.X));                           // 240, 427.5, 615, 802.5
    B.sub = {x: B.sx(BUOY.sub.X), Z: BUOY.sub.Z};                // (660, Z 220)
    B.Zmic = BUOY.Zmic;
    // (a) s16 — the aircraft crosses at a steady speed va and passes x 1000 at '떨어뜨립니다' + 0.4; the warship goes va/10
    B.t0 = sc.start; B.tPass = W_('s16', '떨어뜨립니다', 0.85) + 0.4;
    B.va = (1000 + 160) / (B.tPass - B.t0);
    B.ax = t => -160 + B.va * (t - B.t0);                        // aircraft centre x on the outbound leg
    B.ts = B.t0 + (20 + BOOM + 160) / B.va;                      // both trails start when the boom tip is at x 20 (on screen)
    B.shipLen = 130;                                             // PLAN 170: a 170 hull would sail over buoy 1 within the s16 window
    B.shipX0 = 6 + 0.47 * B.shipLen;                             // ship centre at ts (stern at x 6)
    B.shipX = t => B.shipX0 + B.va / 10 * (t - B.ts);
    B.drops = B.bx.map(x => B.t0 + (x + 160) / B.va);           // aircraft centre over the buoy's x
    B.lands = B.drops.map(d => d + 0.9);
    B.numT = W_('s16', '열', 0.3);
    B.numOut = Math.max(B.numT + 1.5, B.t0 + (690 - 140 + 160) / B.va - 0.35);   // before the nose reaches the big number's box
    B.tagT = W_('s16', '소노부이라는', 0.45);
    { let k = 0; B.lands.forEach((l, i) => { if (l <= B.tagT) k = i; }); B.tagBuoy = k; B.tagOn = Math.max(B.tagT, B.lands[k] + 0.1); }
    B.tExit = B.tPass + (1090 + BOOM - 1000) / B.va;            // the boom tip leaves the right edge
    // the aircraft turns back (s17): in from the upper right, facing left, slowing to 40 px/s (listening)
    B.tRe = Math.max(at('s17'), B.tExit) + 0.05; B.reDur = 2.2;
    B.rx = t => t < B.tRe + B.reDur ? hermite(clamp((t - B.tRe) / B.reDur), 1270, 880, -300 * B.reDur, -40 * B.reDur) : 880 - 40 * (t - B.tRe - B.reDur);
    B.ryRel = -230;                                              // y 330 when the surface is at 560
    // (b) s17 — microphones go down, the submarine's sound reaches them (real speed), radio climbs to the aircraft
    B.mic0 = W_('s17', '마이크를', 0.3) - 0.2;
    B.micStart = B.bx.map((_, i) => B.mic0 + 0.15 * i); B.micLand = B.micStart.map(s => s + 1.3);
    B.te0 = Math.max(W_('s17', '들은', 0.4) - 1.0, ...B.lev.map((l, i) => B.micLand[i] - l.dt + 0.1));
    B.pings = []; for (let te = B.te0; te < sc.end - 0.3; te += 1.5) B.pings.push(te);
    B.hits = B.lev.map(l => B.pings.map(te => te + l.dt).filter(x => x < sc.end - 0.1));
    B.radioV = 900;
    B.tip = (i, ys) => [B.bx[i], ys - 44 * 0.45 - 28];         // kit buoy(): antenna end
    B.target = (t, ys) => [B.rx(t), ys + B.ryRel + 6];
    const arrive = (t0, i) => { const tip = B.tip(i, 560); let t = t0 + 0.3; for (let k = 0; k < 8; k++) { const g = B.target(t, 560); t = t0 + Math.hypot(g[0] - tip[0], g[1] - tip[1]) / B.radioV; } return t; };
    B.radio = B.hits.map((hs, i) => hs.map((h, j) => ({i, j, t0: h, t1: arrive(h, i)})).filter(r => r.t1 < sc.end - 0.05));
    B.bar = B.radio.map(rs => rs[0].t1);                         // the frame each bar stands
    B.radioHi = W_('s17', '전파에', 0.4);
    // (c) s18 — compare, mark the biggest, narrow the area
    B.cmpT = W_('s18', '크기를', 0.4); B.bestT = W_('s18', '비교해', 0.55); B.narrow0 = W_('s18', '좁혀', 0.75) - 0.3;
    B.best = B.lev.reduce((k, l, i) => (l.h > B.lev[k].h ? i : k), 0);
    B.band0 = [B.bx[0], B.bx[3]]; B.band1 = [525, 705];
    P.buoy = B;
  }
  // ---------------- mad (s19–s20): surf 790, iso 1.2 px/m; screen px relative to the surface
  {
    const M = {}, sc = SC.mad;
    M.Crel = 120; M.yLrel = -120; M.yHrel = -360;                // C (540, 910), yL 670, yH 430
    M.d0 = M.Crel - M.yLrel; M.dH = M.Crel - M.yHrel;            // 240, 480 px
    M.field0 = sc.start + 0.4; M.fieldDur = 0.9;
    M.subLen = 360; const ks = M.subLen / 300;                  // field scaled with the hull (M ∝ length³, rmin ∝ length; reference 300)
    M.lines = fieldLines(540, 790 + M.Crel, {y0: 285, y1: 1112, M: 0.22 * 110 ** 3 * ks ** 3, rmin: 90 * ks});   // 2026-11-12 review: PLAN's M crossed lines
    // passes: record point = tail-boom tip; it crosses x 540 at T
    const T1 = W_('s19', '금속도', 0.4) + 0.2;
    let T2 = Math.max(W_('s20', '팔분의', 0.4) - 0.1, T1 + 3.9);
    let T3 = Math.max(W_('s20', '지나가야', 0.6) + 0.1, T2 + 2.75);
    let v = [250, 520, 520];
    const winOf = (T, vv) => [T - (540 + 1.12 * PL) / vv, T + (1084 - 540) / vv];   // any part of the aircraft on screen
    for (let k = 0; k < 20; k++) {                               // never two aircraft on screen (PLAN §6.7)
      const w1 = winOf(T1, v[0]), w2 = winOf(T2, v[1]), w3 = winOf(T3, v[2]);
      if (w2[0] > w1[1] + 0.05 && w3[0] > w2[1] + 0.05) break;
      v = v.map(x => x * 1.08);
    }
    M.passes = [{T: T1, v: v[0], yRel: M.yLrel, d: M.d0}, {T: T2, v: v[1], yRel: M.yHrel, d: M.dH}, {T: T3, v: v[2], yRel: M.yLrel, d: M.d0}]
      .map(p => { const [tIn, tOut] = winOf(p.T, p.v); return {...p, tIn, tOut, tRec0: p.T - 440 / p.v, tRec1: p.T + 400 / p.v}; });
    const [p1, p2, p3] = M.passes;
    M.tagT = Math.max(W_('s19', '꼬리', 0.3), p1.T - (540 - 70) / p1.v);    // once the boom tip is on screen
    M.metalT = W_('s19', '금속도', 0.4);
    M.r1T = p1.tIn + 0.3;
    M.r2T = Math.max(p1.tOut + 0.3, (p1.tOut + p2.tIn) / 2 - 0.4);
    M.ghost1 = M.r2T; M.ghost2 = p3.tRec0 - 0.3;
    M.labT = W_('s20', '팔분의', 0.4);
    M.numT = Math.max(M.labT, p2.T + (950 - 540) / p2.v);      // the big "1/8" waits until the high pass has cleared its box
    M.subT = M.numT;
    M.confirm = p3.T;
    P.mad = M;
  }
  // ---------------- mast (s21): surf 640, screen px relative to the surface
  {
    const Q = {}, sc = SC.mast;
    Q.t0 = sc.start;
    Q.px = t => 240 + 30 * (t - Q.t0); Q.pyRel = -330; Q.pLen = 340;                 // 2026-11-12 review: surface at 800, bodies larger
    Q.nose = (t, ys) => [Q.px(t) + 0.5 * Q.pLen, ys + Q.pyRel + Q.pLen * 0.052 * 0.1];
    Q.subX = 700; Q.subLen = 460;
    Q.rise0 = W_('s21', '디젤', 0.3) - 0.2; Q.riseDur = 1.6; Q.yRel0 = 230;
    Q.mast0 = W_('s21', '관만', 0.5) - 0.5; Q.mastDur = 0.6; Q.mastFull = Q.mast0 + Q.mastDur;
    // the frame the tube breaks the surface: sail top (Hh/2 + 0.7Hh above the centre) + 64·q
    const Hh = Q.subLen * 0.13, sailTop = Hh / 2 + 0.7 * Hh;
    Q.yRel1 = sailTop + 64 - 46;                                 // tube top 46 px above the surface at full height (sail top 18 px under it)
    const need = Q.yRel1 - sailTop;
    Q.pierce = Q.mast0 + Q.mastDur * invert(u => 64 * easeOut(u), need);
    const tm = W_('s21', '레이더에', 0.5) - 1.5;
    Q.pings = [tm, tm + 2.2].filter(x => x + 1.4 < sc.end - 0.15);
    Q.out = 0.7; Q.back = 0.7;
    Q.hit = Q.pings.map(x => x + Q.out); Q.peak = Q.pings.map(x => x + Q.out + Q.back);
    Q.mastX = Q.subX - (0.16 + 0.35 * 0.14) * Q.subLen;        // kit sub(): mast at sail0 + 0.35(sail1 − sail0), facing left
    P.mast = Q;
  }
  return P;
}
/** joins modelSignature() in scenes.mjs so a stale sound.json is noticed */
export function signature(P) {
  const r = x => (x == null ? '-' : x.toFixed(3));
  return 'air:' + [...P.buoy.bar, P.buoy.te0, ...P.mad.passes.map(p => p.T), P.mad.numT, ...P.mast.pings].map(r).join(':');
}

const LOCAL = new WeakMap();
function localPlan(tl) {
  let P = LOCAL.get(tl); if (P) return P;
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s])), MORPH: [0.9, 1.7], poster: tl.at('s23:end') - 1.4};
  planAir(tl, P); LOCAL.set(tl, P); return P;
}
const getP = ctx => { const P = ctx.P || ctx.plan; return P && P.buoy && P.mad && P.mast ? P : localPlan(ctx.tl); };

// =====================================================================================================
// small drawing helpers (scene-local)
// =====================================================================================================
/** a sonobuoy in free fall: canister with two small drag vanes spread at the top (matte) */
function fallingBuoy(c, x, y) {
  const w = 12, h = 30;
  const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, '#D8D2C4'); g.addColorStop(1, '#8B8679');
  c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, 3); c.fillStyle = g; c.fill();
  c.beginPath(); c.moveTo(x - w / 2, y - h / 2 + 3); c.lineTo(x - w / 2 - 10, y - h / 2 - 9); c.lineTo(x - w / 2 - 6, y - h / 2 - 11); c.lineTo(x - 1, y - h / 2); c.closePath();
  c.moveTo(x + w / 2, y - h / 2 + 3); c.lineTo(x + w / 2 + 10, y - h / 2 - 9); c.lineTo(x + w / 2 + 6, y - h / 2 - 11); c.lineTo(x + 1, y - h / 2); c.closePath();
  c.fillStyle = '#A9A396'; c.fill();
  line(c, [[x - w / 2 + 2, y - h / 2 + 0.5], [x + w / 2 - 2, y - h / 2 + 0.5]], rgba('#FFFFFF', 0.5), 1.2);
}
/** short vertical bracket ([ or ]) on the narrowing band */
function bracket(c, x, y0, y1, side, col) {
  line(c, [[x + 10 * side, y0], [x, y0], [x, y1], [x + 10 * side, y1]], col, 2.2);
}
const bigSub = (stage, s, a) => stage.text(s, 940, 356 + 120 * 0.62, {role: 'body', weight: 500, size: 30, color: PAL.muted, alpha: a, align: 'right', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16});

// =====================================================================================================
// BUOY (s16–s18) — surf 560, kx 0.075, kz 1.0, X=0 → x 90. s16 time ×12 (kicker), s17–s18 sound at real speed.
// =====================================================================================================
function buoyScene(stage, t, p, ctx) {
  const P = getP(ctx), B = P.buoy, SC = P.sc, c = stage.ctx, cm = cam('buoy', t, ctx.tl), A = actorAlpha(t, SC.buoy, ctx.tl), ys = cm.surf;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  // ---------------- water with the thermocline (same band as layer)
  layerWater(stage, cm, 1);
  layerEdges(stage, cm, 1);
  depthTicks(stage, cm, [100, 200, 300, 400], 0.9, {x0: 40, x1: 54, xl: 58, align: 'left', acrossTo: W});
  // ---------------- s18 narrowing band (behind everything)
  const bandA = fadeIn(t, B.narrow0 - 0.15, 0.3);
  if (bandA > 0) {
    const q = easeInOut((t - B.narrow0) / 1.0), x0 = lerp(B.band0[0], B.band1[0], q), x1 = lerp(B.band0[1], B.band1[1], q), y0 = ys + 4, y1 = 1108;
    withAlpha(c, bandA, () => {
      c.fillStyle = rgba(PAL.warm, 0.10); c.fillRect(x0, y0, x1 - x0, y1 - y0);
      bracket(c, x0, y0 + 8, y1 - 8, 1, rgba(PAL.warm, 0.75)); bracket(c, x1, y0 + 8, y1 - 8, -1, rgba(PAL.warm, 0.75));
    });
  }
  // ---------------- tie lines mic → panel (same ruler), behind the bodies
  const micY = B.bx.map((_, i) => (t < B.micStart[i] ? null : lerp(ys + 24, ys + B.Zmic, easeInOut((t - B.micStart[i]) / 1.3))));
  B.bx.forEach((x, i) => { if (micY[i] != null) tieLine(stage, x, micY[i] + 12, 0.7 * fadeIn(t, B.micLand[i] - 0.2, 0.4)); });
  // ---------------- the submarine (source of the sound)
  sub(stage, B.sub.x, cm.sy(B.sub.Z), {len: 280, dir: 1, dim: 0.25, prop: t * TAU * 1.5});
  // ---------------- its sound below the layer: rings at real speed R = 1500 (t − te) m, drawn only for Z 140–330 m
  for (const te of B.pings) {
    const R = 1500 * (t - te); if (R <= 0 || R > 6300) continue;
    // weaker with distance (spreading): the bars the buoys report shrink the same way
    const amp = (1 - smooth((R - 5000) / 1300)) * clamp(600 / R, 0.25, 1);
    for (let j = 0; j < 2; j++) {
      const Rj = R - 110 * j, k = 0.5 * amp * (j ? 0.3 : 1); if (Rj <= 0) continue;
      for (let Z = 140; Z <= 330; Z += 5) {
        const dz = Z - B.sub.Z; if (Math.abs(dz) > Rj) continue;
        const hx = 0.075 * Math.sqrt(Rj * Rj - dz * dz), y = cm.sy(Z);
        for (const s of [-1, 1]) { const x = B.sub.x + s * hx; if (x > -10 && x < W + 10) GW.splat(x, y, 5, WARM, k); }
      }
    }
  }
  // ---------------- s16 trails (exactly 10 : 1 — same start instant ts, speeds va and va/10), frozen at tPass
  const trA = fadeIn(t, B.ts, 0.15) * fadeOut(t, B.tPass + 1.0, 0.8);
  const tE = clamp(t, B.ts, B.tPass), yPl = ys - 160, yBoom = yPl - PL * 0.052 * 0.55;
  if (trA > 0 && t >= B.ts) withAlpha(c, trA, () => {
    const bx0 = B.ax(B.ts) - BOOM, bx1 = B.ax(tE) - BOOM;
    line(c, [[bx0, yBoom], [bx1, yBoom]], rgba(PAL.field, 0.5), 2, {dash: [7, 8]});
    const sx0 = B.shipX(B.ts) - 0.47 * B.shipLen, sx1 = B.shipX(tE) - 0.47 * B.shipLen;
    line(c, [[sx0, ys - 3], [sx1, ys - 3]], rgba('#FFFFFF', 0.5), 2);
    for (const [x, y] of [[bx0, yBoom], [sx0, ys - 3]]) line(c, [[x, y - 9], [x, y + 9]], rgba(PAL.field, 0.75), 1.6);
    if (t >= B.tPass) for (const [x, y] of [[bx1, yBoom], [sx1, ys - 3]]) line(c, [[x, y - 9], [x, y + 9]], rgba(PAL.field, 0.75), 1.6);
  });
  // ---------------- the warship (s16 only)
  const shA = fadeOut(t, B.tPass + 0.2, 0.7);
  if (shA > 0) withAlpha(c, shA, () => ship(stage, B.shipX(t), ys, {len: B.shipLen, dir: 1}));
  // ---------------- buoys: drop, fall, splash, float; microphones on cables
  const radioAll = B.radio.flat();
  B.bx.forEach((x, i) => {
    if (t < B.drops[i]) return;
    if (t < B.lands[i]) { fallingBuoy(c, x, lerp(ys - 148, ys - 14, easeIn((t - B.drops[i]) / 0.9))); return; }
    const sp = (t - B.lands[i]) / 0.4;
    if (sp < 1) ring(c, x, ys, 30 * easeOut(sp), rgba(PAL.field, 0.65 * (1 - sp)), 1.6);
    if (micY[i] != null) { cable(stage, [[x, ys + 24], [x, micY[i] - 9]]); hydro(stage, x, micY[i], {lit: hitAny(t, B.hits[i], 0.25)}); }
    buoyBody(stage, x, ys, {lit: 0.7 * hitAny(t, B.radio[i].map(r => r.t0), 0.25), litCol: PAL.cool});
  });
  // ---------------- radio: cool dotted arcs from the antenna to the aircraft (900 px/s)
  for (const r of radioAll) {
    if (t < r.t0 || t > r.t1 + 0.04) continue;
    const tip = B.tip(r.i, ys), g = B.target(t, ys), ang = Math.atan2(g[1] - tip[1], g[0] - tip[0]);
    const rr = B.radioV * (t - r.t0), first = r.j === 0;
    const k = Math.max(first ? 1 : 0.42, win(t, B.radioHi - 0.1, B.radioHi + 0.9, 0.15));
    const half = Math.min(0.3, 60 / Math.max(rr, 1));            // arcs keep about 120 px of length (do not sweep past the aircraft)
    ringWave(GC, tip[0], tip[1], rr, {crests: 3, gap: 13, a0: ang - half, a1: ang + half, amp: k, rad: 3.6, step: 9});
    if (t - r.t0 < 0.2) GC.splat(tip[0], tip[1], 6, COOL, 0.8 * (1 - (t - r.t0) / 0.2) * k);
  }
  // ---------------- the aircraft: outbound (s16) then back, slow, facing left (s17–s18)
  if (t < B.tExit) {
    const x = B.ax(t); if (x > -400) plane(stage, x, yPl, {len: PL, dir: 1, prop: t * TAU * 3});
  } else if (t >= B.tRe) {
    plane(stage, B.rx(t), ys + B.ryRel, {len: PL, dir: -1, prop: t * TAU * 3, lit: 0.5 * hitAny(t, radioAll.map(r => r.t1), 0.25), litCol: PAL.cool});
  }
  // ---------------- instrument strip: what the aircraft received, bar x = buoy x
  panel(stage, 1);
  panelLabel(stage, '초계기가 받은 소리', 1);
  axisTicks(stage, B.bx.map((x, i) => ({x, label: String(i + 1)})), 1, {x0: 200, x1: 845});
  const bestQ = smooth((t - B.bestT) / 0.3);
  const tops = B.bx.map((x, i) => {
    if (t < B.bar[i]) return null;
    const rs = B.radio[i], bump = rs.slice(1).reduce((m, r) => Math.max(m, hitFlash(t, r.t1, 0.3)), 0);
    const h = B.lev[i].h * easeOut((t - B.bar[i]) / 0.25) * (1 + 0.05 * bump), best = i === B.best ? bestQ : 0;
    const col = best > 0 ? mix(PAL.rec, PAL.warm, best) : PAL.rec;
    rect(c, x - 17, REC_BASE - h, 34, h, 3, rgba(col, 0.85), null);
    line(c, [[x - 17, REC_BASE - h], [x + 17, REC_BASE - h]], rgba(mix(col, '#FFFFFF', 0.3), 0.95), 2);
    const f = hitFlash(t, B.bar[i], 0.35);
    if (f > 0) GC.splat(x, REC_BASE - h, 10, COOL, 0.8 * f);
    return [x, REC_BASE - h];
  });
  // s18: dotted line over the bar tops (compare), the biggest marked
  if (t >= B.cmpT - 0.1 && tops.every(Boolean)) {
    const q = clamp((t - B.cmpT) / 0.5), pts = [tops[0]];
    for (let i = 1; i < 4; i++) { const seg = clamp(q * 3 - (i - 1)); if (seg <= 0) break; pts.push([lerp(tops[i - 1][0], tops[i][0], seg), lerp(tops[i - 1][1], tops[i][1], seg)]); }
    if (pts.length > 1) line(c, pts.map(([x, y]) => [x, y - 6]), rgba(PAL.ink, 0.7), 1.6, {dash: [3, 6]});
  }
  if (bestQ > 0) {
    const x = B.bx[B.best];
    withAlpha(c, bestQ, () => { c.beginPath(); c.moveTo(x, 1125); c.lineTo(x - 11, 1106); c.lineTo(x + 11, 1106); c.closePath(); c.fillStyle = PAL.warm; c.fill(); });
    ring(c, x, ys, 30 * easeOut((t - B.bestT) / 0.35), rgba(PAL.warm, 0.9 * bestQ), 2.5);
  }
  // ---------------- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---------------- tags and the big number
  const tg = fadeIn(t, B.tagOn - 0.1, 0.3) * fadeOut(t, ctx.tl.at('s17') - 0.4, 0.4);
  if (tg > 0) { const x = B.bx[B.tagBuoy]; tagLeader(stage, '소노부이', [x + 4, ys - 44], [x + 34, ys - 86], {size: 28, align: 'left', a: tg}); }
  const nA = fadeOut(t, B.numOut, 0.35);
  if (nA > 0 && t >= B.numT - 0.05) bigNum(stage, '10', '배', t, B.numT, nA, {sub: '같은 시간에 간 거리'});
}

// =====================================================================================================
// MAD (s19–s20) — surf 790, iso 1.2 px/m. Sizes exaggerated (kicker).
// =====================================================================================================
function madScene(stage, t, p, ctx) {
  const P = getP(ctx), M = P.mad, SC = P.sc, c = stage.ctx, A = actorAlpha(t, SC.mad, ctx.tl), ys = cam('mad', t, ctx.tl).surf, dy = ys - 790;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  const C = [540, ys + M.Crel], yL = ys + M.yLrel, yH = ys + M.yHrel;
  // ---------------- Earth's field lines bent around the hull: one stroke through sky and sea (no break at the surface)
  const fq = clamp((t - M.field0) / M.fieldDur), yRev = 285 + fq * (1112 - 285);
  if (fq > 0) {
    for (const L of M.lines) {
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], b = L[i]; if (b.y > yRev) break;
        const k = (a.k + b.k) / 2, hot = k > 0.06;
        line(c, [[a.x, a.y + dy], [b.x, b.y + dy]], hot ? rgba(PAL.warm, Math.min(0.9, 0.22 + 1.6 * (k - 0.06))) : rgba(PAL.field, 0.16), hot ? 1.8 : 1.4);
      }
    }
  }
  // ---------------- the distance ruler (거리 1 with the first pass, 거리 2 grows before the high pass)
  const r1 = fadeIn(t, M.r1T, 0.4), r2 = clamp((t - M.r2T) / 0.8);
  const hullTop = C[1] - M.subLen * 0.065;
  if (r1 > 0) withAlpha(c, r1, () => { line(c, [[566, hullTop], [566, yL]], rgba(PAL.ink, 0.6), 1.5, {dash: [4, 6]}); for (const y of [hullTop, yL]) line(c, [[559, y], [573, y]], rgba(PAL.ink, 0.6), 1.5); });
  if (r2 > 0) { const yTop = lerp(hullTop, yH, easeInOut(r2)); line(c, [[604, hullTop], [604, yTop]], rgba(PAL.ink, 0.6), 1.5, {dash: [4, 6]}); for (const y of [hullTop, yTop]) line(c, [[597, y], [611, y]], rgba(PAL.ink, 0.6), 1.5); }
  // ---------------- the submarine
  sub(stage, C[0], C[1], {len: M.subLen, dir: -1, dim: 0.3, prop: 0.6});
  // ---------------- confirm (pass 3): a warm dotted line rises from the hump's top to the hull, a ring stays around it
  const cq = clamp((t - M.confirm) / 0.4);
  // ---------------- the aircraft (one pass at a time)
  const pass = M.passes.find(q => t >= q.tIn && t <= q.tOut);
  let boom = null;
  if (pass) {
    const bxp = 540 + pass.v * (t - pass.T), y = ys + pass.yRel, s = magS(bxp - 540, pass.d, M.d0);
    if (t >= M.metalT - 0.2 && t <= M.metalT + 1.4 && pass === M.passes[0]) {
      const ha = win(t, M.metalT, M.metalT + 1.2, 0.2), x = bxp + BOOM + 20;
      // the aircraft's own metal disturbs the field too: neutral (not from the submarine) — faint fill + dashed ring
      withAlpha(c, ha, () => { c.beginPath(); c.arc(x, y, 70, 0, TAU); c.fillStyle = rgba(PAL.field, 0.12); c.fill(); c.setLineDash([5, 7]); c.strokeStyle = rgba(PAL.field, 0.6); c.lineWidth = 1.4; c.stroke(); c.setLineDash([]); });
    }
    const pl = plane(stage, bxp + BOOM, y, {len: PL, dir: 1, boomLit: clamp(s), prop: t * TAU * 3});
    boom = pl.boom;
    if (s > 0.02) GW.splat(boom[0], boom[1], 8, WARM, 0.9 * clamp(s));
    if (boom[0] >= 100 && boom[0] <= 940) tieLine(stage, boom[0], boom[1] + 8, 0.55, {col: PAL.field});
    if (pass === M.passes[0]) {
      const ha = win(t, M.metalT, M.metalT + 1.2, 0.2);
      if (ha > 0) ring(c, boom[0], boom[1], 9, rgba(PAL.ink, 0.9 * ha), 1.8);
    }
  }
  // ---------------- instrument strip: field strength along the record point's x
  panel(stage, 1);
  panelLabel(stage, '자기장 세기', 1);
  const base = PY1 - 60;
  axisTicks(stage, [{x: 540, label: '잠수함 위'}], 1, {base, x0: 100, x1: 940});
  M.passes.forEach((q, k) => {
    if (t < q.tRec0) return;
    const xEnd = Math.min(940, 540 + q.v * (t - q.T)); if (xEnd < 100) return;
    const s0 = magS(0, q.d, M.d0), fy = x => base - 82 * magS(x - 540, q.d, M.d0) - recNoise(x, 0.8, 11 + 5 * k);
    const ghostT = k === 0 ? M.ghost1 : k === 1 ? M.ghost2 : Infinity, gh = smooth((t - ghostT) / 0.6), al = lerp(1, 0.35, gh);
    const pts = sampleRec(fy, 100, xEnd, 2), live = xEnd < 940 && gh === 0;
    const hump = x => magS(x - 540, q.d, M.d0) / s0 > 0.3;
    const inHump = hump(xEnd);
    recordLine(stage, pts, {col: PAL.rec, alpha: 0.85 * al, lw: gh > 0 ? 1.6 : 2, G: live ? (inHump ? GW : GC) : null});
    const hp = pts.filter(([x]) => hump(x));
    if (hp.length > 1) line(c, hp, rgba(PAL.warm, 0.95 * al), gh > 0 ? 1.8 : 2.4);
  });
  // labels on the humps (at "팔분의")
  const lA = fadeIn(t, M.labT, 0.3);
  if (lA > 0) {
    stage.text('1', 556, base - 82 - 16, {size: 26, weight: 700, color: PAL.warm, alpha: lA, align: 'left'});
    stage.text('1/8', 556, base - 82 / 8 - 22, {size: 26, weight: 700, color: PAL.warm, alpha: lA, align: 'left'});
  }
  // confirm: hump top → hull
  if (cq > 0) {
    const yTop = lerp(base - 82, C[1] + 24, easeOut(cq));
    line(c, [[540, base - 82], [540, yTop]], rgba(PAL.warm, 0.9), 2.2, {dash: [3, 6]});
    const rq = easeOut((t - M.confirm - 0.4) / 0.5);
    if (rq > 0) { ring(c, C[0], C[1], 70 * rq, rgba(PAL.warm, 0.9), 2.5); const f = hitFlash(t, M.confirm + 0.4, 0.6); if (f > 0) GW.splat(C[0], C[1] - 70 * rq, 10, WARM, 0.6 * f); }
  }
  // ---------------- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---------------- tags and the big number
  if (r1 > 0) tag(stage, '거리 1', 580, (yL + C[1]) / 2 - 18, {size: 24, weight: 500, align: 'left', a: r1, color: PAL.ink});
  if (r2 > 0) tag(stage, '거리 2', 618, (yH + yL) / 2, {size: 24, weight: 500, align: 'left', a: smooth((r2 - 0.5) / 0.5), color: PAL.ink});
  const p1 = M.passes[0];
  if (boom && pass === p1 && t >= M.tagT - 0.05 && t <= M.tagT + 1.9) {
    const a = fadeIn(t, M.tagT, 0.25) * fadeOut(t, M.tagT + 1.6, 0.3), tx = Math.max(120, boom[0]);
    tagLeader(stage, '자기장 탐지기', [boom[0], boom[1] - 4], [tx, boom[1] - 84], {size: 28, a});
  }
  if (t >= M.numT - 0.05) { bigNum(stage, '1/8', '', t, M.numT, 1); bigSub(stage, '거리 2배', fadeIn(t, M.subT, 0.3)); }
}

// =====================================================================================================
// MAST (s21) — surf 640, wide picture in screen px.
// =====================================================================================================
function mastScene(stage, t, p, ctx) {
  const P = getP(ctx), Q = P.mast, SC = P.sc, c = stage.ctx, A = actorAlpha(t, SC.mast, ctx.tl), ys = cam('mast', t, ctx.tl).surf;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  // ---------------- the submarine rises to just under the surface and raises its air tube
  const rq = easeInOut((t - Q.rise0) / Q.riseDur), subY = ys + lerp(Q.yRel0, Q.yRel1, rq);
  const mq = easeOut((t - Q.mast0) / Q.mastDur);
  const mastLit = hitAny(t, Q.hit, 0.25);
  const sb = sub(stage, Q.subX, subY, {len: Q.subLen, dir: -1, dim: lerp(0.4, 0.22, rq), mast: mq, mastLit, mastLitCol: PAL.cool, prop: t * TAU * 1.2});
  // surface ring where the tube breaks through
  { const a = (t - Q.pierce) / 0.4; if (a >= 0 && a < 1) ring(c, sb.mastTop[0], ys, 30 * easeOut(a), rgba(PAL.field, 0.65 * (1 - a)), 1.6); }
  // air drawn down the tube (three grey dots, 0.5 s period)
  if (t >= Q.mastFull) {
    const yTop = sb.mastTop[1] + 4, yBot = sb.sail[1] - 2;
    for (let k = 0; k < 3; k++) { const ph = (((t - Q.mastFull) / 0.5 + k / 3) % 1 + 1) % 1; circle(c, sb.mastTop[0], lerp(yTop, yBot, ph), 2.6, rgba(PAL.field, 0.75 * Math.sin(Math.PI * ph))); }
  }
  // ---------------- the aircraft flies on; radar beam out (cool) → the tube → echo back (warm)
  const pl = plane(stage, Q.px(t), ys + Q.pyRel, {len: Q.pLen, dir: 1, prop: t * TAU * 3});
  Q.pings.forEach((tp, i) => {
    const from = Q.nose(tp, ys), to = sb.mastTop, q = (t - tp) / Q.out;
    const trace = (a, b, qq, col) => { const e = [lerp(a[0], b[0], qq), lerp(a[1], b[1], qq)], fa = 1 - smooth((qq - 0.75) / 0.25) * 0.5; line(c, [a, e], rgba(col, 0.4 * fa), 1.4); };
    if (q >= 0 && q <= 1) { trace(from, to, q, PAL.cool); beamPulse(GC, from, to, q); }
    const hf = hitFlash(t, Q.hit[i], 0.3);
    if (hf > 0) { GC.splat(to[0] + 30, ys + 2, 14, COOL, 0.5 * hf); GC.splat(to[0], to[1], 8, COOL, 0.7 * hf); }   // the rest of the beam dies at the surface beside the tube
    const q2 = (t - Q.hit[i]) / Q.back;
    if (q2 >= 0 && q2 <= 1) { const nz = Q.nose(Q.peak[i], ys); trace(to, nz, q2, PAL.warm); beamPulse(GW, to, nz, q2); }
  });
  void pl;
  // ---------------- instrument strip: battery (left) | radar screen (right, x = world x)
  panel(stage, 1);
  panelLabel(stage, '배터리', 1);
  panelLabel(stage, '레이더 화면', 1, {x: 376});
  line(c, [[345, PY0 + 14], [345, PY1 - 14]], rgba(PAL.panelEdge, 0.9), 1.2);
  const charge = 0.2 + 0.6 * clamp((t - Q.mastFull) / Math.max(0.5, SC.mast.end - Q.mastFull));
  const by = 1222;
  rect(c, 100, by, 200, 34, 5, rgba('#03141C', 0.6), rgba(PAL.field, 0.6), 1.4);
  rect(c, 103, by + 3, 194 * charge, 28, 3, rgba(PAL.rec, 0.85), null);
  stage.text(`${Math.round(charge * 100)}%`, 200, by + 62, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
  axisTicks(stage, [{x: Q.mastX, label: '관'}], 1, {x0: 376, x1: 940});
  const pk = Q.peak.filter(x => t >= x), mx = Q.mastX;
  const h = pk.length ? 80 * easeOut((t - pk[0]) / 0.25) * (1 + 0.08 * pk.reduce((m, x, i) => Math.max(m, i ? hitFlash(t, x, 0.4) : 0), 0)) : 0;
  const fy = x => REC_BASE - h * Math.exp(-(((x - mx) / 9) ** 2)) - recNoise(x, 1.5, 21);
  const rpts = sampleRec(fy, 376, 940, 3);
  recordLine(stage, rpts, {col: PAL.rec, alpha: 0.85});
  if (h > 0) { line(c, sampleRec(x => REC_BASE - h * Math.exp(-(((x - mx) / 9) ** 2)), mx - 26, mx + 26, 2), rgba(PAL.warm, 0.95), 2.4); const f = pk.reduce((m, x) => Math.max(m, hitFlash(t, x, 0.4)), 0); if (f > 0) GW.splat(mx, REC_BASE - h, 9, WARM, 0.9 * f); }
  emptyBox(stage, mx, 1 - smooth((t - (Q.peak[0] ?? Infinity)) / 0.25), {w: 60, h: 70});
  tieLine(stage, mx, sb.bottom[1] + 8, 0.8);
  // ---------------- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
}

export const scenes = {buoy: buoyScene, mad: madScene, mast: mastScene};

// =====================================================================================================
// HEADERS (PLAN §6.6–6.8)
// =====================================================================================================
export const titles = {
  buoy: P => { const at = s => P.tl.at(s) - 0.5, K2 = '메커니즘 ③ · 소리는 실제 빠르기';
    return [[-Infinity, '메커니즘 ③ · 12배 빠르게 감기', '멈출 수 없는 초계기는 부표를 쓴다'], [at('s17'), K2, '듣고, 전파로 올려 보낸다'], [at('s18'), K2, '크기를 비교해 좁힌다']]; },
  mad: P => [[-Infinity, '메커니즘 ④ · 크기 과장', '꼬리 끝의 자기 탐지기'], [P.tl.at('s20') - 0.5, '메커니즘 ④ · 크기 과장', '두 배 멀면 8분의 1']],
  mast: P => [[-Infinity, '메커니즘 ⑤', '물 밖으로 내민 관']],
};

// =====================================================================================================
// SOUND (PLAN §7) — buoy, mad, mast events. All fundamentals below 700 Hz.
// =====================================================================================================
export function soundAir(tl, P) {
  const B = P.buoy, M = P.mad, Q = P.mast, ev = [];
  // ---- buoy
  B.lands.forEach((t0, i) => ev.push(snd.tick('buoy_splash' + (i + 1), t0, 165, -38, `부표 ${i + 1}이 물에 닿음(수면의 작은 고리와 같은 프레임)`, {decay: 0.09})));
  ev.push(snd.tick('buoy_10x', B.numT, 147, -35, '큰 숫자 "10배"가 뜸', {decay: 0.12}));
  ev.push(snd.train('hum_buoy', B.pings.map(te => [te, 'tick', {freq: 82, decay: 0.18, click: 0, gain_db: 0}]), -40,
    'buoy: 잠수함에서 난색 소리 파면이 하나 나올 때마다 낮은 프로펠러 박동'));
  B.bar.forEach((t0, i) => ev.push(snd.tone('buoy_bar' + (i + 1), t0, Math.round(196 + 196 * B.lev[i].h / 150), 0.18, -34,
    `부표 ${i + 1}의 무선이 초계기에 닿아 막대가 섬(높이 ${B.lev[i].h.toFixed(0)} px, 음높이가 세기를 따름)`, {decay: 0.08, sustain: 0.15})));
  // ---- mad: a 220 Hz tone whose loudness follows |S| as the boom tip passes (T ± 0.9 s)
  M.passes.forEach((q, k) => {
    const pts = []; for (let u = -0.9; u <= 0.9 + 1e-9; u += 0.1) pts.push([u + 0.9, 220, 0.6 * Math.max(0, magS(q.v * u, q.d, M.d0))]);
    ev.push(snd.chirp('mad_pass' + (k + 1), q.T - 0.9, pts, -34, `자기 탐지기 통과 ${k + 1}(${k === 1 ? '두 배 높이: 혹 1/8' : '낮게: 큰 혹'}) — 기록선의 혹과 같은 시각, 세기가 |S|를 따라감`));
  });
  ev.push(snd.tick('mad_eighth', M.numT, 147, -35, '큰 숫자 "1/8"이 뜸', {decay: 0.12}));
  ev.push(snd.swell('mad_confirm', M.confirm + 0.4, [110, 165, 220], 1.2, -33, '셋째 통과: 혹 꼭대기에서 잠수함까지 선이 닿고 위치 확인 고리'));
  // ---- mast
  Q.pings.forEach((tp, i) => {
    ev.push(snd.tick('mast_radar' + (i + 1), tp, 196, -38, `초계기가 레이더 펄스를 쏨(${i + 1})`, {decay: 0.08}));
    ev.push(snd.tone('mast_echo' + (i + 1), Q.peak[i], 294, 0.16, -32, `물 밖 관에 맞은 메아리가 초계기에 도착 — 레이더 화면의 봉우리(${i + 1})`, {decay: 0.08, sustain: 0.1}));
  });
  return ev.filter(Boolean);
}
