// 38 잠수함은 어떻게 찾을까 — core mechanism scenes: sonar (s08–s11) and layer (s12–s15). PLAN.md §6.4, §6.5, §7.
// Exports: scenes {sonar, layer}, planCore(tl, P), soundCore(tl, P), titles {sonar, layer}.
// Every time comes from planCore (word anchors via kit.wd); picture, instrument and sound read the same numbers.
import {PAL, WARM, COOL, PX0, PX1, PY0, PY1, REC_BASE, W, H, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, line, circle, ring, rect, withAlpha, TAU,
  fadeIn, fadeOut, win, keyed, hitFlash, hitAny, wd, tag, tagLeader, bigNum, cam, actorAlpha, layerWater, layerEdges, depthTicks,
  sub, ship, heli, sonarBody, cable, glowBegin, glowFlush, ringWave, rayPath, rayHead, rayScreen,
  panel, panelLabel, axisTicks, recordLine, peakY, sampleRec, recNoise, tieLine, emptyBox, waveOffset, lens, snd} from './kit.mjs';
import {c as cOf, traceRay, aimRay, crossDepth} from './model.mjs';
import {arrow} from '../../pipeline/render/index.mjs';

// =====================================================================================================
// TIME PLAN
// =====================================================================================================
export function planCore(tl, P) {
  const W_ = (s, w, f) => wd(tl, s, w, f), at = r => tl.at(r), SC = P.sc;
  // ---------------- sonar (real speed: one way D → hull = 1.0 s)
  {
    const S = {};
    S.D = [150, 573]; S.Sb = [810, 705];
    S.V = Math.hypot(S.Sb[0] - S.D[0], S.Sb[1] - S.D[1]) / 1.0;      // px/s so that the one-way trip is exactly 1.0 s (PLAN: 660, rounded)
    S.tail = [810 + 134, 705];                                          // propeller of the 260 px hull (facing left)
    S.dTail = Math.hypot(S.tail[0] - S.D[0], S.tail[1] - S.D[1]) / S.V;  // ≈ 1.17 s
    S.sonarLab = W_('s08', '소나이고', 0.5); S.passiveLab = W_('s08', '수동', 0.85); S.listenT = W_('s08', '듣기만', 0.7);
    S.tp1 = W_('s09', '쏘고', 0.2);
    S.ruler = W_('s09', '천오백미터를', 0.8);
    S.tp2 = Math.max(S.tp1 + 2.5, W_('s10', '돌아왔다면', 0.15) - 2.0);
    S.halfT = W_('s10', '절반이', 0.55); S.rangeT = W_('s10', '천오백미터입니다', 0.85);
    S.tp3 = W_('s11', '쏘면', 0.16) - 0.1;
    S.pings = [S.tp1, S.tp2, S.tp3];
    S.quiet = S.tp1 - 0.3;                                              // background hum softens from here
    // background hum: every 0.6 s (amp 0.7) while only listening; every 1.2 s (amp 0.15) once the active sonar is in use
    S.hum = []; for (let te = SC.sonar.start - 0.8; te < SC.sonar.end; te += te < S.quiet ? 0.6 : 1.2) S.hum.push({te, amp: te < S.quiet ? 0.7 : 0.15, arr: te + S.dTail});
    P.sonar = S;
  }
  // ---------------- layer (depth ×13, rays 4× faster)
  {
    const L = {}, k = 4;
    L.k = k;
    L.warmT = W_('s12', '따뜻한', 0.22); L.coldT = W_('s12', '찬', 0.43);
    L.lensT = W_('s12', '깊이에', 0.6) - 0.2;
    L.pass1 = L.lensT + 0.4;
    L.bendT = W_('s12', '휘어집니다', 0.92);
    L.pass2 = Math.max(L.bendT - 1.4, L.pass1 + 1.0);                // the second bundle follows the first
    L.lensClose = at('s13') - 0.2;
    L.tq1 = W_('s13', '쏜', 0.08); L.layerHi = W_('s13', '층에서', 0.4); L.downT = W_('s13', '아래로', 0.47);
    L.shadeLab = W_('s13', '그늘이', 0.85);
    L.subT = W_('s14', '숨으면', 0.12) - 0.6;
    L.tow0 = W_('s14', '군함은', 0.2) - 0.2; L.towArr = L.tow0 + 1.3; L.tq2 = L.towArr + 0.15;
    L.towLab = W_('s14', '내리고', 0.5);
    L.heliTitle = W_('s14', '헬리콥터는', 0.55);
    L.heli0 = L.heliTitle - 1.6; L.heliStop = Math.max(W_('s14', '멈춰', 0.75), L.heli0 + 1.0);
    L.dip0 = W_('s14', '물속에', 0.88) - 0.5; L.dipArr = L.dip0 + 1.2; L.tq3 = L.dipArr + 0.15;
    // rays (world m). Scene rays run past the frame edge (x 10,600 m, z 540 m) so they leave the picture.
    const o = {xmax: 10600, zmax: 540};
    L.D = {X: 0, Z: 6}; L.TOW = {X: 1975, Z: 200}; L.DIP = {X: 4600, Z: 200}; L.SUB = {X: 6500, Z: 220};
    L.rays1 = [-1.6, -0.9, 0.4, 1.1, 1.7, 2.05, 2.3, 2.7, 3.3, 4.1, 5.2, 6.6, 8.3, 10.5].map(th => ({th, pts: traceRay(L.D.X, L.D.Z, th, o)}));
    L.limit = L.rays1.find(r => r.th === 2.05);
    L.rays2 = [-9, -4, 0.5, 2.5, 6.5].map(th => ({th, pts: traceRay(L.TOW.X, L.TOW.Z, th, o)}));
    L.rays3 = [-7, 1.5, 7].map(th => ({th, pts: traceRay(L.DIP.X, L.DIP.Z, th, o)}));
    const aim2 = aimRay(L.TOW.X, L.TOW.Z, L.SUB.X, L.SUB.Z), aim3 = aimRay(L.DIP.X, L.DIP.Z, L.SUB.X, L.SUB.Z);
    L.aim2 = {th: aim2.th, pts: aim2.pts.slice(0, aim2.i + 1), tHit: aim2.t, miss: aim2.miss};
    L.aim3 = {th: aim3.th, pts: aim3.pts.slice(0, aim3.i + 1), tHit: aim3.t, miss: aim3.miss};
    L.hit2 = L.aim2.tHit / k; L.hit3 = L.aim3.tHit / k;                // screen seconds launch → hull
    L.dur1 = Math.max(...L.rays1.map(r => r.pts[r.pts.length - 1].t)) / k;
    L.shadowT = Math.max(W_('s13', '먼', 0.7) - 0.1, L.tq1 + 1.5);
    // pings: the chain runs again while the narration continues (PLAN §0.9)
    L.pings1 = []; for (let te = L.tq1; te + L.dur1 + 0.1 < L.tow0; te += 3.2) L.pings1.push(te);
    L.pings2 = []; for (let te = L.tq2; te < L.dip0 - 1.0; te += 2.6) L.pings2.push(te);
    L.pings3 = []; for (let te = L.tq3; te + 2 * L.hit3 < SC.layer.end - 0.3; te += 2.4) L.pings3.push(te);
    L.echo2 = L.pings2.map(te => te + 2 * L.hit2); L.echo3 = L.pings3.map(te => te + 2 * L.hit3);
    L.subHits = [...L.pings2.map(te => te + L.hit2), ...L.pings3.map(te => te + L.hit3)];
    // the lens bundle path (screen px, inside the lens)
    L.lensC = [640, 880]; L.lensR = 170; L.lensFrom = [430, 640];
    L.path = bundlePath(L.lensC, L.lensR);
    L.passDur = 1.8;
    L.bendCross = [L.pass1, L.pass2].map(t0 => t0 + L.passDur * L.path.sCross / L.path.sEnd);
    P.layer = L;
  }
  return P;
}

/** bundle path inside the lens: 12° below horizontal in warm water, turning to 28° across the boundary (±40 px) */
function bundlePath([cx, cy], r) {
  const D2R = Math.PI / 180, phi = y => (12 + 16 * smooth((y - (cy - 40)) / 80)) * D2R, pts = [];
  let x = cx - r - 70, y = cy - 40, s = 0, sCross = 0;
  for (let i = 0; i < 400; i++) { const f = phi(y); pts.push({x, y, s, f}); if (!sCross && y >= cy) sCross = s; x += 2 * Math.cos(f); y += 2 * Math.sin(f); s += 2; if (x > cx + r + 90) break; }
  return {pts, sEnd: s, sCross, at(sq) { const i = clamp(Math.floor(sq / 2), 0, pts.length - 1); return pts[i]; }};
}

// =====================================================================================================
// SONAR (s08–s11) — surfY 560, 0.44 px/m, X=0 → x 150. Sound at its real speed.
// =====================================================================================================
const clipWater = ys => (x, y) => y > ys + 2 && y < 1112;
function sonarScene(stage, t, p, ctx) {
  const P = ctx.P || ctx.plan, S = P.sonar, SC = P.sc, c = stage.ctx, cm = cam('sonar', t, ctx.tl), A = actorAlpha(t, SC.sonar, ctx.tl), ys = cm.surf;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  const D = [S.D[0], S.D[1] + (ys - 560)], Sb = [S.Sb[0], S.Sb[1] + (ys - 560)], clip = clipWater(ys);
  // ---- world ruler (depth) — 100 m ticks under the iso camera
  depthTicks(stage, cm, [100, 200, 300, 400, 500], 0.9, {x0: 40, x1: 52, xl: 58, align: 'left', acrossTo: W});
  // ---- passive hum: warm rings from the propeller (crests 2)
  for (const h of S.hum) { const age = t - h.te, r = S.V * age; if (age < 0 || r > 1500) continue; ringWave(GW, S.tail[0], S.tail[1] + (ys - 560), r, {crests: 2, amp: h.amp * (1 - smooth((r - 1100) / 400)), clip}); }
  // ---- active pings: cool ring from D; warm echo ring from the hull 1.0 s later
  const hitT = S.pings.map(te => te + 1.0), backT = S.pings.map(te => te + 2.0);
  S.pings.forEach((te, i) => {
    const age = t - te; if (age < 0) return;
    const r = S.V * age; if (r < 1700) ringWave(GC, D[0], D[1], r, {crests: 3, amp: 1 - smooth((r - 1300) / 400), clip});
    const ae = t - hitT[i]; if (ae >= 0) { const re = S.V * ae; if (re < 1400) ringWave(GW, Sb[0], Sb[1], re, {crests: 2, amp: (i === 2 ? 0.5 : 1) * (1 - smooth((re - 900) / 500)), clip}); }
  });
  // ---- bodies
  const domeWarm = hitAny(t, backT.slice(0, 2), 0.5);
  const sh = ship(stage, D[0] - 0.36 * 170, ys, {len: 170, dir: 1, domeWarm, domeLit: hitAny(t, S.pings, 0.25)});
  const sb = sub(stage, Sb[0], Sb[1], {len: 260, dir: -1, dim: 0.25, lit: hitAny(t, hitT), litCol: PAL.cool, prop: t * TAU * 1.5});
  // ---- s11: the hull hears the ping → a line back to the ship, the ship outlined (cool, = sent by the searcher)
  const rv = hitT[2], ra = fadeIn(t, rv, 0.08);
  if (ra > 0) {
    const q = easeOut((t - rv) / 0.5), e = [lerp(Sb[0], D[0], q), lerp(Sb[1], D[1], q)];
    line(c, [Sb, e], rgba(PAL.cool, 0.9), 2, {dash: [4, 9]});
    const bx = sh.box, ol = lerp(0.9, 0.5, smooth((t - rv - 0.5) / 0.8));
    if (q >= 1) withAlpha(c, ol * fadeIn(t, rv + 0.45, 0.1), () => rect(c, Math.max(-20, bx[0] - 14), bx[1] - 12, bx[2] + 28, bx[3] + 24, 12, null, PAL.cool, 3));
  }
  // ---- s10 world ruler D → hull
  const ruA = fadeIn(t, S.ruler - 0.1, 0.35);
  if (ruA > 0) withAlpha(c, ruA, () => { const y = 1040; line(c, [[D[0], y], [Sb[0], y]], rgba(PAL.ink, 0.75), 1.6); for (const x of [D[0], Sb[0]]) line(c, [[x, y - 10], [x, y + 10]], rgba(PAL.ink, 0.75), 1.6); line(c, [[D[0], D[1] + 18], [D[0], y - 12]], rgba(PAL.line, 0.5), 1, {dash: [2, 6]}); line(c, [[Sb[0], Sb[1] + 22], [Sb[0], y - 12]], rgba(PAL.line, 0.5), 1, {dash: [2, 6]}); });
  // ---- instrument strip: received sound (top row) + range axis (same ruler as the world)
  panel(stage, 1);
  panelLabel(stage, '받은 소리', 1);
  const arrivals = [...S.hum.map(h => ({t: h.arr, k: h.amp / 0.7 * 0.8, w: 1})), ...backT.map((tb, i) => ({t: tb, k: i === 2 ? 0.8 : 1.5, w: 1}))];
  const WY = 1182, wfn = x => WY - waveOffset(x, t, arrivals.map(a => a.t), {amp: 13, x0: 100, x1: 940, pxs: 420});
  // amplitude per arrival: draw each burst separately for its own strength
  const wpts = sampleRec(x => { const tt = t - (940 - x) / 420; let y = 0; for (const a of arrivals) { const g = tt - a.t; if (g >= 0 && g < 0.5) y += 13 * a.k * Math.exp(-g / 0.175) * Math.sin(g * TAU * 9); } return WY - y - 1.2 * Math.sin(x * 0.9 + tt * 7); }, 100, 940, 2);
  recordLine(stage, wpts, {col: PAL.rec, alpha: 0.8, G: null});
  // warm overlay where a burst is present (the sound came from the submarine)
  { let seg = []; const segs = [];
    for (const [x, y] of wpts) { const tt = t - (940 - x) / 420, on = arrivals.some(a => a.k > 0.5 && tt - a.t >= 0 && tt - a.t < 0.42); if (on) seg.push([x, y]); else if (seg.length) { segs.push(seg); seg = []; } }
    if (seg.length) segs.push(seg);
    for (const s of segs) if (s.length > 1) line(c, s, rgba(PAL.warm, 0.95), 2); }
  // newest end glows when a burst is arriving
  { const on = arrivals.reduce((m, a) => Math.max(m, hitFlash(t, a.t, 0.35) * (a.k > 0.5 ? a.k : 0)), 0); if (on > 0) GW.splat(940, WY, 9, WARM, 0.5 * Math.min(1, on)); }
  // range row: peak at 1,500 m when the echo arrives
  const ticks = [{x: 150, label: '0'}, {x: 370, label: '500'}, {x: 590, label: '1,000'}, {x: 810, label: '1,500 m'}];
  axisTicks(stage, ticks, 1, {x0: 100, x1: 940});
  const pk = i => (t < backT[i] ? 0 : easeOut((t - backT[i]) / 0.25));
  const h1 = Math.max(pk(0), pk(1));
  const pts = sampleRec(x => peakY(x, 810, 86 * h1, 8) - 1.4 * recNoise(x, 1, 3), 100, 940, 3);
  recordLine(stage, pts, {col: PAL.rec, alpha: 0.85});
  if (h1 > 0) { line(c, sampleRec(x => peakY(x, 810, 86 * h1, 8), 780, 840, 2), rgba(PAL.warm, 0.95), 2.4); const f = Math.max(hitFlash(t, backT[0], 0.4), hitFlash(t, backT[1], 0.4)); if (f > 0) GW.splat(810, REC_BASE - 86 * h1, 9, WARM, 0.8 * f); }
  if (t >= backT[2]) { const g = hitFlash(t, backT[2], 0.6); if (g > 0) GW.splat(810, REC_BASE - 86, 8, WARM, 0.35 * g); }
  tieLine(stage, D[0], D[1] + 18, 0.8); tieLine(stage, Sb[0], Sb[1] + 26, 0.8);
  // ---- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---- tags and the big number
  const lA = fadeOut(t, ctx.tl.at('s09') - 0.3, 0.3);
  const l1 = fadeIn(t, S.sonarLab - 0.1, 0.3) * (1 - fadeIn(t, S.passiveLab - 0.15, 0.25)), l2 = fadeIn(t, S.passiveLab - 0.1, 0.3);
  if (l1 * lA > 0) tag(stage, '소나', 182, 622, {size: 28, align: 'left', color: PAL.ink, a: l1 * lA});
  if (l2 * lA > 0) tag(stage, '수동 소나 · 듣기만', 182, 622, {size: 28, align: 'left', color: PAL.ink, a: l2 * lA});
  const oa = Math.max(...[S.tp1, S.tp2].map(te => fadeIn(t, te + 1.0, 0.15) * fadeOut(t, te + 2.2, 0.4)));
  if (oa > 0) tag(stage, '1초', Sb[0], Sb[1] - 70, {size: 28, color: PAL.coolHi, a: oa});
  if (ruA > 0) tag(stage, '1초에 1,500 m', (D[0] + Sb[0]) / 2, 1040, {size: 24, weight: 500, color: PAL.ink, a: ruA, plateA: 0.9});
  if (ra > 0) tag(stage, '위치가 드러남', 250, 470, {size: 28, color: PAL.coolHi, a: fadeIn(t, rv + 0.45, 0.25)});
  // stopwatch (cool) → "1,500 m"
  const sw = (te, i) => { const v = clamp(t - te, 0, 2.0), shown = Math.floor(v * 10 + 1e-6) / 10; return shown.toFixed(1); };
  const swA = fadeIn(t, S.tp1 - 0.1, 0.1);
  if (t < S.rangeT) {
    const cur = t < S.tp2 ? 0 : 1, te = S.pings[cur];
    if (swA > 0) bigNum(stage, sw(te, cur), '초', t, S.tp1, swA, {color: PAL.coolHi, unitColor: PAL.cool, pop: false, sub: t >= S.halfT ? '가는 데 1초' : null});
  } else bigNum(stage, '1,500', 'm', t, S.rangeT, 1, {sub: '1,500 m/s × 1초'});
}

// =====================================================================================================
// LAYER (s12–s15) — surfY 560, kx 0.08, kz 1.0, X=0 → x 222. Depth ×13, rays 4× faster.
// =====================================================================================================
const SP = {x0: 62, x1: 178, cMin: 1490, cMax: 1525, xa: 74, xb: 166};
const spX = cc => SP.xa + (cc - SP.cMin) / (SP.cMax - SP.cMin) * (SP.xb - SP.xa);
function layerScene(stage, t, p, ctx) {
  const P = ctx.P || ctx.plan, L = P.layer, SC = P.sc, c = stage.ctx, cm = cam('layer', t, ctx.tl), A = actorAlpha(t, SC.layer, ctx.tl), ys = cm.surf;
  const {GW, GC} = glowBegin();
  c.globalAlpha = A;
  // ---------------- water with the thermocline
  layerWater(stage, cm, 1);
  const edgeHi = hitFlash(t, L.layerHi, 0.6) > 0 ? Math.sin(Math.PI * clamp((t - L.layerHi) / 0.6)) : 0;
  layerEdges(stage, cm, 1, edgeHi);
  depthTicks(stage, cm, [100, 200, 300, 400], 0.9, {x0: 196, x1: 210, xl: 214, align: 'left', acrossTo: W});
  // ---------------- sound-speed panel (same depth ruler)
  {
    const q = clamp((t - L.warmT) / 0.9), a = fadeIn(t, L.warmT - 0.3, 0.3);
    withAlpha(c, a, () => {
      rect(c, SP.x0, cm.sy(0), SP.x1 - SP.x0, cm.sy(450) - cm.sy(0), 6, rgba('#03141C', 0.55), rgba(PAL.panelEdge, 0.9), 1.2);
      for (const cc of [1500, 1520]) line(c, [[spX(cc), cm.sy(0)], [spX(cc), cm.sy(450)]], rgba(PAL.field, 0.12), 1);
      const pts = []; for (let z = 0; z <= 450 * q; z += 3) pts.push([spX(cOf(z)), cm.sy(z)]);
      if (pts.length > 1) line(c, pts, rgba(PAL.ink, 0.9), 2);
      stage.text('1,500', spX(1500) + 18, cm.sy(450) + 22, {size: 24, weight: 500, color: PAL.muted, align: 'right'});
      stage.text('1,520', spX(1520) - 14, cm.sy(450) + 22, {size: 24, weight: 500, color: PAL.muted, align: 'left'});
      stage.text('소리 빠르기', 120, ys - 56, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      stage.text('빠름 →', 120, ys - 24, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    });
  }
  // ---------------- s12 lens: a bundle of sound crossing warm → cold water turns toward the cold side
  const lensQ = clamp((t - L.lensT) / 0.4) * (1 - clamp((t - L.lensClose) / 0.4));
  let markerZ = null;
  if (lensQ > 0) {
    const [cx, cy] = L.lensC, R = L.lensR, Ls = lens(stage, cx, cy, R, L.lensFrom, lensQ);
    Ls.clipLens(rr => {
      let g = c.createLinearGradient(0, cy - rr, 0, cy + rr); g.addColorStop(0, '#0D4B5D'); g.addColorStop(0.47, '#0B4152'); g.addColorStop(0.53, '#04222E'); g.addColorStop(1, '#031A23');
      c.fillStyle = g; c.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr);
      line(c, [[cx - rr, cy], [cx + rr, cy]], rgba(PAL.line, 0.8), 1.4, {dash: [6, 7]});
      const path = L.path;
      for (const t0 of [L.pass1, L.pass2]) {
        const sHead = (t - t0) / L.passDur * path.sEnd; if (sHead < 0) continue;
        const trail = path.pts.filter(pp => pp.s <= Math.min(sHead - 88, path.sEnd)).map(pp => [pp.x, pp.y]);
        if (trail.length > 1) line(c, trail, rgba(PAL.cool, 0.45), 1.4);
        if (sHead - 88 > path.sEnd) continue;
        for (let j = 0; j < 5; j++) {
          const sj = sHead - 22 * j; if (sj < 0 || sj > path.sEnd) continue;
          const pp = path.at(sj), nx = -Math.sin(pp.f), ny = Math.cos(pp.f);
          for (let u = -45; u <= 45; u += 5) { const x = pp.x + nx * u, y = pp.y + ny * u; if (Math.hypot(x - cx, y - cy) < rr - 3) GC.splat(x, y, 5, COOL, 0.42 * (1 - 0.15 * j)); }
          if (j === 2 && Math.hypot(pp.x - cx, pp.y - cy) < rr) markerZ = 100 + (pp.y - cy) / R * 70;
        }
      }
      const ar = fadeIn(t, L.bendT - 0.05, 0.3) * fadeOut(t, L.lensClose - 0.1, 0.2);
      if (ar > 0) { const p0 = path.at(path.sCross + 50), nx = -Math.sin(p0.f), ny = Math.cos(p0.f), o = 62; withAlpha(c, ar, () => arrow(c, [p0.x + nx * o, p0.y + ny * o], [p0.x + nx * o + 84 * Math.cos(p0.f), p0.y + ny * o + 84 * Math.sin(p0.f)], PAL.ink, 3)); }
    });
    Ls.frame();
  }
  if (markerZ != null) { ring(c, spX(cOf(markerZ)), cm.sy(markerZ), 7, rgba(PAL.coolHi, 0.95), 2); }
  // ---------------- rays from the hull-mounted sonar D (s13): the shadow forms
  const tauOf = te => (t - te) * L.k;
  const ghost1 = smooth((t - L.tow0) / 0.6);           // old rays turn into faint dashed ghosts when the sonar is lowered
  const raysOn1 = t >= L.tq1;
  if (raysOn1) {
    for (const r of L.rays1) {
      const isLim = r.th === 2.05, firstTau = tauOf(L.pings1[0]);
      const lw = isLim ? lerp(1.6, 3, smooth((t - L.shadowT) / 0.6)) : 1.6;
      if (ghost1 < 1) rayPath(stage, r.pts, cm, firstTau, {col: PAL.cool, lw, alpha: 0.5 * (1 - ghost1), G: null});
      if (ghost1 > 0 && L.rays1.indexOf(r) % 2 === 0) rayPath(stage, r.pts, cm, 1e9, {col: PAL.cool, lw: 1.2, alpha: 0.10 * ghost1, dash: [4, 6]});
      const dn = r.th >= 2.05 ? Math.sin(Math.PI * clamp((t - L.downT) / 0.8)) * (1 - ghost1) : 0;
      if (dn > 0) { const i0 = r.pts.findIndex(q => q.z >= 140); if (i0 > 0) line(c, rayScreen(r.pts.slice(i0, Math.min(r.pts.length, i0 + 400)), cm), rgba(PAL.coolHi, 0.75 * dn), 2.2); }
      for (const te of L.pings1) { const tau = tauOf(te); if (tau > 0 && tau < r.pts[r.pts.length - 1].t) { const h = rayHead(r.pts, cm, tau); GC.splat(h.p[0], h.p[1], 7, COOL, 0.8); } }
    }
  }
  // the shadow: right of the limiting ray, under the layer
  const shA = smooth((t - L.shadowT) / 0.6) * lerp(1, 0.25 / 0.45, ghost1) * (1 - smooth((t - L.tq2) / 0.5));   // the lowered sonar reaches it: no longer a shadow
  if (shA > 0) {
    const lim = L.limit.pts, i0 = lim.findIndex(q => q.z >= 140), poly = [];
    for (let i = i0; i < lim.length; i++) poly.push([cm.sx(lim[i].x), cm.sy(lim[i].z)]);
    const last = poly[poly.length - 1];
    poly.push([last[0], 1112], [W + 20, 1112], [W + 20, cm.sy(140)]);
    withAlpha(c, shA, () => { c.beginPath(); poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); const y0 = cm.sy(140), g = c.createLinearGradient(0, y0, 0, 1110), f = y => clamp((y - y0) / (1110 - y0));   // soft top (30 px) and bottom (960 → 1110); the limiting-ray edge stays sharp
      g.addColorStop(0, rgba('#000A10', 0)); g.addColorStop(f(y0 + 30), rgba('#000A10', 0.45)); g.addColorStop(f(960), rgba('#000A10', 0.45)); g.addColorStop(1, rgba('#000A10', 0));
      c.fillStyle = g; c.fill(); });
  }
  // ---------------- bodies: ship (bow left), towed sonar, helicopter + dipping sonar, submarine
  const sh = ship(stage, 286, ys, {len: 180, dir: -1, domeLit: hitAny(t, L.pings1, 0.25)});
  const stern = [366, ys + 6];
  const towQ = easeInOut((t - L.tow0) / 1.5), towOn = t >= L.tow0;
  const tow = [lerp(stern[0], 380, towQ), lerp(stern[1], cm.sy(L.TOW.Z), towQ)];
  if (towOn) {
    cable(stage, [stern, [lerp(stern[0], tow[0], 0.55) - 6, lerp(stern[1], tow[1], 0.6)], tow]);
    sonarBody(stage, tow[0], tow[1], {dir: -1, lit: hitAny(t, L.pings2, 0.25), litCol: PAL.cool});
  }
  // helicopter
  const heliOn = t >= L.heli0;
  let hl = null, dip = null;
  if (heliOn) {
    const q = easeOut((t - L.heli0) / (L.heliStop - L.heli0)), hx = lerp(1150, 590, q), hy = lerp(400, 420, q);
    hl = heli(stage, hx, hy, {len: 170, dir: -1, rotor: t * TAU * 2.2});
    const dq = easeInOut((t - L.dip0) / 1.3);
    if (t >= L.dip0) {
      dip = [hl.hook[0], lerp(450, cm.sy(L.DIP.Z), dq)];
      cable(stage, [hl.hook, dip]);
      sonarBody(stage, dip[0], dip[1], {dir: -1, len: 30, lit: hitAny(t, L.pings3, 0.25), litCol: PAL.cool});
      // a small ring where it breaks the surface
      const tc = L.dip0 + 1.3 * invEase((ys - 450) / (cm.sy(L.DIP.Z) - 450)), ra = t - tc;
      if (ra >= 0 && ra < 0.4) ring(c, dip[0], ys, 30 * ra / 0.4, rgba(PAL.field, 0.6 * (1 - ra / 0.4)), 1.5);
    }
  }
  // submarine (appears in the shadow at "그늘이")
  const subA = fadeIn(t, L.subT, 0.6);
  if (subA > 0) withAlpha(c, subA, () => sub(stage, cm.sx(L.SUB.X), cm.sy(L.SUB.Z), {len: 230, dir: -1, dim: 0.35, lit: hitAny(t, L.subHits), litCol: PAL.cool, prop: t * TAU * 1.2}));
  // ---------------- lowered sonar rays (towed, then dipping) + the aimed ray and its echo
  const lowered = (pings, rays, aim, echoes) => {
    if (!pings.length || t < pings[0]) return;
    const dimQ = smooth((t - echoes[0]) / 0.6);         // after the first echo is back, the fan steps back
    const firstTau = tauOf(pings[0]);
    for (const r of rays) rayPath(stage, r.pts, cm, firstTau, {col: PAL.cool, lw: 1.6, alpha: lerp(0.5, 0.22, dimQ)});
    rayPath(stage, aim.pts, cm, firstTau, {col: PAL.cool, lw: 2.4, alpha: lerp(0.75, 0.4, dimQ)});
    pings.forEach((te, k) => {
      const tau = tauOf(te);
      if (tau <= 0) return;
      if (k === 0) for (const r of rays) if (tau < r.pts[r.pts.length - 1].t) { const h = rayHead(r.pts, cm, tau); GC.splat(h.p[0], h.p[1], 7, COOL, 0.75); }   // repeats: the aimed ray only
      if (tau < aim.tHit) { const h = rayHead(aim.pts, cm, tau); GC.splat(h.p[0], h.p[1], 8, COOL, 1.0); }
      else if (tau < 2 * aim.tHit) {          // the echo runs back along the same path (warm = from the submarine)
        const back = 2 * aim.tHit - tau, h = rayHead(aim.pts, cm, back);
        const seg = rayScreen(aim.pts.filter(q => q.t >= back), cm); seg.unshift(h.p);
        line(c, seg, rgba(PAL.warm, 0.85), 2.2);
        GW.splat(h.p[0], h.p[1], 8, WARM, 1.0);
      }
    });
  };
  lowered(L.pings2, L.rays2, L.aim2, L.echo2);
  lowered(L.pings3, L.rays3, L.aim3, L.echo3);
  // ---------------- instrument strip: returned echoes, x = the world's ruler
  panel(stage, 1);
  panelLabel(stage, '돌아온 메아리', 1);
  axisTicks(stage, [{x: 222, label: '0'}, {x: 462, label: '3'}, {x: 702, label: '6'}, {x: 942, label: '9 km'}], 1, {x0: 222, x1: 942});
  const subX = cm.sx(L.SUB.X);
  if (t >= L.tq1) {
    // the trace runs out as far as the sound has gone (pen = the farthest ray head); nothing comes back from the shadow
    const reach = Math.min(942, Math.max(222, ...L.rays1.map(r => rayHead(r.pts, cm, tauOf(L.pings1[0])).p[0])));
    const e2 = L.echo2.filter(x => t >= x), e3 = L.echo3.filter(x => t >= x);
    const h2 = e2.length ? easeOut((t - e2[0]) / 0.25) : 0, h3 = e3.length ? easeOut((t - e3[0]) / 0.25) : 0;
    const bump2 = e2.reduce((m, x) => Math.max(m, hitFlash(t, x, 0.5)), 0), bump3 = e3.reduce((m, x) => Math.max(m, hitFlash(t, x, 0.5)), 0);
    const hNow = h3 > 0 ? (h2 > 0 ? lerp(84, 96, h3) : 96 * h3) : 84 * h2;   // a second echo makes the same peak rise higher
    const fy = x => peakY(x, subX, hNow * (1 + 0.06 * Math.max(bump2, bump3)), 9) - recNoise(x, 2, 7);
    const pts = sampleRec(fy, 222, reach, 3);
    recordLine(stage, pts, {col: PAL.rec, alpha: 0.85, G: reach < 942 ? GC : null});
    if (hNow > 0) { line(c, sampleRec(x => peakY(x, subX, hNow, 9), subX - 26, subX + 26, 2), rgba(PAL.warm, 0.95), 2.4); const f = Math.max(bump2, bump3); if (f > 0) GW.splat(subX, REC_BASE - hNow, 9, WARM, 0.9 * f); }
    // empty dashed box where the submarine should be — until the first echo comes back
    emptyBox(stage, subX, fadeIn(t, L.subT, 0.6) * (1 - h2), {w: 60, h: 70});
    tieLine(stage, subX, cm.sy(L.SUB.Z) + 18, subA * 0.9);
  }
  // ---------------- glow
  c.globalAlpha = 1; glowFlush(stage, {alpha: A}); c.globalAlpha = A;
  // ---------------- tags
  const endA = fadeOut(t, L.lensClose + 0.2, 0.4);
  if (t > L.warmT - 0.1) tag(stage, '따뜻한 물 · 빠름', 560, 592, {size: 26, color: PAL.ink, a: fadeIn(t, L.warmT - 0.1, 0.3) * fadeOut(t, L.tow0 - 0.3, 0.4)});
  if (t > L.coldT - 0.1) tag(stage, '찬 물 · 느림', 330, 742, {size: 26, color: PAL.ink, a: fadeIn(t, L.coldT - 0.1, 0.3) * fadeOut(t, L.tow0 - 0.3, 0.4)});
  if (t > L.shadeLab - 0.1) tag(stage, '소리 그늘', 850, 930, {size: 28, color: PAL.muted, a: fadeIn(t, L.shadeLab - 0.1, 0.4) * fadeOut(t, L.tq2, 0.5)});
  if (t > L.towLab - 0.1) tag(stage, '끄는 소나', 380, 806, {size: 26, color: PAL.ink, a: fadeIn(t, L.towLab - 0.1, 0.3)});
  if (dip && t > L.dipArr - 0.1) tag(stage, '담그는 소나', 590, 806, {size: 26, color: PAL.ink, a: fadeIn(t, L.dipArr - 0.1, 0.3)});
  void endA; void sh;
}
const invEase = y => { // inverse of easeInOut on [0, 1] (bisection)
  let a = 0, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (easeInOut(m) < y) a = m; else b = m; } return (a + b) / 2; };

export const scenes = {sonar: sonarScene, layer: layerScene};

// =====================================================================================================
// HEADERS
// =====================================================================================================
export const titles = {
  sonar: P => { const at = s => P.tl.at(s) - 0.5, K = '메커니즘 ① · 소리는 실제 빠르기 그대로';
    return [[-Infinity, K, '소리로 찾는 장치, 소나'], [P.sonar.listenT - 0.5, K, '듣기만 하는 수동 소나'], [at('s09'), K, '쏘고 기다리는 능동 소나'], [at('s10'), K, '돌아오는 시간이 곧 거리'], [at('s11'), K, '쏘면 나도 들킨다']]; },
  layer: P => { const at = s => P.tl.at(s) - 0.5, K2 = '메커니즘 ② · 깊이 13배 과장, 4배 빠르게';
    return [[-Infinity, '메커니즘 ② · 깊이 13배 과장', '소리는 찬 쪽으로 휜다'], [at('s13'), K2, '층 아래 먼 곳의 소리 그늘'], [at('s14'), K2, '소나를 층 아래로'], [P.layer.heliTitle - 0.5, K2, '끄는 소나, 담그는 소나']]; },
};

// =====================================================================================================
// SOUND (PLAN §7) — sonar and layer events
// =====================================================================================================
export function soundCore(tl, P) {
  const S = P.sonar, L = P.layer, SC = P.sc, ev = [];
  const humTick = g => ({freq: 82, decay: 0.18, click: 0, gain_db: g});
  const ping = (id, t0, means) => ev.push(snd.tone(id, t0, 440, 0.22, -30, means, {decay: 0.06, sustain: 0}));
  const echo = (id, t0, means, g = -33) => ev.push(snd.tone(id, t0, 330, 0.2, g, means, {decay: 0.08, sustain: 0.2}));
  // ---- sonar
  ev.push(snd.train('hum_sonar', S.hum.filter(h => h.te >= SC.sonar.start && h.te < SC.sonar.end).map(h => [h.te, 'tick', humTick(h.amp > 0.5 ? 0 : -13)]), -40,
    'sonar: 잠수함 프로펠러의 소리 파면이 하나 나올 때마다 낮은 박동(능동 소나를 쏘는 동안은 약하게)'));
  S.pings.forEach((te, i) => {
    ping('sonar_ping' + (i + 1), te, `능동 소나를 쏨(${i + 1}) — 군함 소나에서 한색 파면이 떠나는 프레임`);
    echo('sonar_echo' + (i + 1), te + 2.0, `메아리가 군함에 도착(${i + 1}) — 쏜 뒤 정확히 2.0초, 거리 축의 1,500 m 봉우리와 같은 프레임`, i === 2 ? -39 : -33);
  });
  ev.push(snd.tick('sonar_1500', S.rangeT, 147, -35, '큰 숫자 "1,500 m"가 뜸', {decay: 0.12}));
  ev.push(snd.tone('sonar_reveal', S.tp3 + 1.0, 220, 0.3, -34, '쏜 소리가 잠수함에 닿아 군함의 위치가 드러남(잠수함에서 군함으로 선)', {decay: 0.15, sustain: 0.2}));
  // ---- layer
  L.bendCross.forEach((tc, i) => ev.push(snd.chirp('layer_bend' + (i + 1), tc - 0.4, [[0, 300, 0], [0.1, 300, 0.6], [0.7, 220, 0.6], [0.8, 220, 0]], -40, `확대 원: 소리 묶음이 층 경계를 넘으며 찬 쪽으로 꺾임(${i + 1})`)));
  L.pings1.forEach((te, i) => ping('layer_ping_hull' + (i + 1), te, `군함 소나가 층 위에서 쏨(${i + 1}) — 메아리 없음(그늘: 침묵이 설명)`));
  ev.push(snd.whoosh('layer_tow_down', L.tow0, 1.5, 260, 140, -40, '끄는 소나가 줄을 타고 층 아래로 내려감'));
  L.pings2.forEach((te, i) => { ping('layer_ping_tow' + (i + 1), te, `끄는 소나가 층 아래에서 쏨(${i + 1})`); echo('layer_echo_tow' + (i + 1), L.echo2[i], `잠수함 메아리가 끄는 소나에 도착(${i + 1}) — 계기 봉우리와 같은 프레임(화면 4배 빠르기)`); });
  ev.push(snd.whoosh('layer_dip_down', L.dip0, 1.3, 260, 140, -40, '헬리콥터가 담그는 소나를 내림'));
  L.pings3.forEach((te, i) => { ping('layer_ping_dip' + (i + 1), te, `담그는 소나가 쏨(${i + 1})`); echo('layer_echo_dip' + (i + 1), L.echo3[i], `메아리가 담그는 소나에 도착(${i + 1}) — 둘째 봉우리`); });
  return ev.filter(Boolean);
}
