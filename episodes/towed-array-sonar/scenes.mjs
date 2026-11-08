// Episode scenes — "예인 소나 — 긴 줄로 바닷속 소리를 듣는 법" (27)
// Shape: export {theme, scenes, overlays, background, captionLayout, events}; scenes.<id>(stage, t, p, ctx).
//
// Visual direction (docs/ANIMATION_QUALITY.md "2026-11-07 후속 결정: 시리즈 화풍은 지킨다"): the series' diagram style —
// a dark navy sea cross-section (flat field, thin surface line, faint depth ticks, a few drifting specks), thin precise
// lines, small additive glowing dots (hydrophones), wavefronts as thin arcs, graphs/axes/labels, one warm accent (answer,
// beam, our own active ping) and one cool secondary (sound arriving from far away). Ships, the submarine and the aircraft
// are generic line icons (glyphs.mjs) — no real class, navy or markings. Dynamics: camera moves, an event every 2–4 s
// (hydrophone flashes in arrival order, thin rings), big numbers. Nothing of the notes below is printed on screen.
//
// =====================================================================================================
// MODEL — the one block that the picture, the graphs, the labels and sound.json (--emit-sound) all read.
// =====================================================================================================
//  - Sound speed in sea water c = 1,500 m/s (textbook constant; real 1,450–1,550 m/s with temperature, salinity,
//    pressure; rays bend — not shown). Air 340 m/s → ratio 4.41 ("네 배 넘게").
//  - Radio in sea water: amplitude ∝ e^(−z/δ) with a skin depth of a few metres (display δ); sunlight ∝ e^(−z/δL)
//    with δL ≈ 12 δ on screen (the real ratio is larger; both are explanatory).
//  - Line array (explanatory, NOT a real system): N hydrophones at half-wavelength spacing d = λ/2 for f = 100 Hz
//    (λ = c/f = 15 m, d = 7.5 m). Direction θ is measured from the array axis (towards the ship).
//    Arrival-time difference between neighbours Δt = d·cosθ / c. Delay-and-sum beam: B(φ) = |Σ e^{ik x_n (cosφ − cosθ)}| / N
//    (array factor, k = 2π/λ). N = 12 → 24 halves the beam width. The same formula gives the left–right mirror (cone).
//  - Wave sweeps are shown in declared slow motion (display speeds below, in world px per screen second); arrival
//    flashes and arrival ticks in sound.json come from the same geometry (distance / display speed).
//  - Own-ship noise at the array: intensity ∝ 1/r² from the propeller → level ∝ −20·log10(r); the graph and the noise
//    sound follow the array's distance r while the cable pays out.
//  - Echo (active): round trip 2R/c; display speed chosen per scene (compressed time), the target hears the ping at R/c.
//  - Sonobuoys: arrival times at each buoy = distance / c; each pair's time difference → a hyperbola (설명 모형); three
//    hyperbolas cross at the source.
//  - Sound: node episodes/towed-array-sonar/scenes.mjs --emit-sound writes sound.json from this model and the plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, withAlpha, TAU, rng, loadTimeline} from '../../pipeline/render/index.mjs';
import {PAL, gl, ringFx, burst, hydro, xf, shipSide, subSide, planeSide, shipTop, subTop, buoySide, backing} from './glyphs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920, D2R = Math.PI / 180;

export const M = {
  cWater: 1500, cAir: 340, f: 100,
  N: 12, N2: 24,
  theta: 125 * D2R,                 // bearing scene: direction to the source from the array axis (source upper-left)
  vSide: 260,                       // display speed of spherical wavefronts in the cross-section (world px / s)
  vPlan: 120,                       // display speed of the plane wave in the bearing scene (world px / s)
  dPx: 66,                          // hydrophone spacing on screen in the bearing scene (world px at zoom 1) ↔ d = 7.5 m
};
M.ratio = M.cWater / M.cAir;                       // 4.41
M.lambda = M.cWater / M.f;                         // 15 m
M.d = M.lambda / 2;                                // 7.5 m
M.dt = M.d * Math.abs(Math.cos(M.theta)) / M.cWater;   // real neighbour delay (s) ≈ 2.9 ms
M.slow = (M.dPx * Math.abs(Math.cos(M.theta)) / M.vPlan) / M.dt;   // slow-motion factor of the bearing sweep (≈ 110)
/** delay-and-sum array factor (0..1) for steering φ, true direction θ, N elements, spacing d, wavelength λ */
export function beam(phi, theta = M.theta, N = M.N, d = M.d, lam = M.lambda) {
  const x = TAU * d * (Math.cos(phi) - Math.cos(theta)) / lam, s = Math.sin(x / 2);
  return Math.abs(s) < 1e-6 ? 1 : Math.abs(Math.sin(N * x / 2) / (N * s));
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** a periodic emitter of spherical packets (crests) from a fixed point */
class Emitter {
  constructor(o) { Object.assign(this, {crests: 3, gap: 34, rep: 2.4, n: 999, rmax: 2400, w: 2, a: 1, col: PAL.sig, half: 0}, o); }
  times() { const T = []; for (let k = 0; k < this.n; k++) T.push(this.t0 + k * this.rep); return T; }
  /** arrival times (screen s) of the leading crest of each packet at point p */
  arrivals(p, from = -1e9, to = 1e9) { const d = dist(p, this.src) / this.v; return this.times().map(te => te + d).filter(x => x >= from && x <= to); }
  /** seconds since the last leading-crest arrival at p (9 if none) */
  age(p, t) { const d = dist(p, this.src) / this.v, k = Math.floor((t - d - this.t0) / this.rep); if (k < 0) return 9; const kk = Math.min(k, this.n - 1); return t - (this.t0 + kk * this.rep + d); }
  draw(c, cam, t, o = {}) {
    const a0 = (o.alpha ?? 1) * this.a; if (a0 <= 0.01) return;
    const [sx, sy] = cam.S(this.src[0], this.src[1]);
    c.save();
    if (o.clip) { c.beginPath(); o.clip(c); c.clip(); }
    for (const te of this.times()) {
      const r0 = this.v * (t - te); if (r0 <= 0) continue; if (r0 - (this.crests - 1) * this.gap > this.rmax) continue;
      for (let j = 0; j < this.crests; j++) {
        const r = r0 - j * this.gap; if (r <= 2 || r > this.rmax) continue;
        const fade = (1 - r / this.rmax) ** (this.pow ?? 1) * [1, 0.55, 0.28, 0.15][j] * a0 * (this.near ? Math.min(1, this.near / r) : 1);
        if (fade < 0.01) continue;
        if (this.half === 1) ringFx(c, sx, sy, r * cam.z, this.col, fade, this.w, 0, Math.PI);
        else if (this.half === -1) ringFx(c, sx, sy, r * cam.z, this.col, fade, this.w, Math.PI, TAU);
        else ringFx(c, sx, sy, r * cam.z, this.col, fade, this.w);
      }
    }
    c.restore();
  }
}

// =====================================================================================================
// Palette, cameras, the sea cross-section
// =====================================================================================================
export const theme = {base: 'navy', accent: PAL.acc};
export const captionLayout = {};
export const events = [];
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const win = (t, a, b, fi = 0.35, fo = 0.35) => fadeIn(t, a, fi) * fadeOut(t, b - fo, fo);
const cam = (fx, fy, z, cx = 540, cy = 860, k = 1) => ({fx, fy, z, cx, cy, k, S: (x, y) => [cx + (x - fx) * z, cy + (y - fy) * z * k]});
/** keyframed camera: keys [[t, fx, fy, z], …] (eased, log-zoom) */
function keyCam(t, keys, cx = 540, cy = 860) {
  let k = 0; while (k + 1 < keys.length && t > keys[k + 1][0]) k++;
  const a = keys[k], b = keys[Math.min(k + 1, keys.length - 1)], q = b === a ? 0 : easeInOut((t - a[0]) / Math.max(1e-3, b[0] - a[0]));
  if (t <= keys[0][0]) return cam(keys[0][1], keys[0][2], keys[0][3], cx, cy);
  return cam(lerp(a[1], b[1], q), lerp(a[2], b[2], q), Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), q)), cx, cy);
}
const STARS = (() => { const R = rng(1942), s = []; for (let i = 0; i < 90; i++) s.push([R() * 1080, R() * 1920, 0.5 + 1.1 * R() ** 3, 0.06 + 0.22 * R() ** 2]); return s; })();
const SPECK = (() => { const R = rng(27), s = []; for (let i = 0; i < 150; i++) s.push([R() * 1400, R() * 2200, 0.5 + 1.3 * R() ** 2.5, 0.05 + 0.22 * R() ** 2, R() * TAU]); return s; })();
/** sea cross-section: sky tint above the surface, faint depth tint, drifting specks, rippled surface line, depth ticks */
function sea(stage, cm, t, o = {}) {
  const c = stage.ctx, ys = cm.S(0, 0)[1], a = o.alpha ?? 1;
  if (ys > 0) { c.fillStyle = `rgba(2,4,12,${0.5 * a})`; c.fillRect(0, 0, W, Math.min(H, ys)); for (const [x, y, r, al] of STARS) if (y < ys - 8) circle(c, x, y, r, rgba('#DCE6FF', al * a)); }
  if (ys < H) {
    const y0 = Math.max(0, ys), g = c.createLinearGradient(0, ys, 0, ys + 1100 * Math.max(0.4, cm.z));
    g.addColorStop(0, `rgba(70,120,200,${0.11 * a})`); g.addColorStop(0.5, `rgba(40,80,150,${0.04 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, y0, W, H - y0);
    if (o.dark > 0) { const g2 = c.createLinearGradient(0, ys, 0, ys + 1500 * cm.z); g2.addColorStop(0, 'rgba(1,3,10,0)'); g2.addColorStop(1, `rgba(1,3,10,${0.55 * o.dark})`); c.fillStyle = g2; c.fillRect(0, y0, W, H - y0); }
  }
  // drifting specks (in water only), slight parallax with the camera
  for (const [x0, y0, r, al, ph] of SPECK) {
    const x = ((x0 - cm.fx * 0.35 * cm.z + t * 5 * Math.sin(ph)) % 1400 + 1400) % 1400 - 160, y = ((y0 - cm.fy * 0.35 * cm.z * (cm.k || 1) - t * 3) % 2200 + 2200) % 2200 - 140;
    if (y < ys + 6 || y > H) continue; circle(c, x, y, r, rgba('#BFD6FF', al * a));
  }
  if (o.seabed != null) {
    const yb = cm.S(0, o.seabed)[1], sa = (o.seabedA ?? 1) * a;
    if (yb < H + 10 && sa > 0) { c.fillStyle = `rgba(1,3,10,${0.55 * sa})`; c.fillRect(0, yb, W, H - yb); line(c, [[0, yb], [W, yb]], `rgba(150,172,214,${0.55 * sa})`, 1.5);
      const R = rng(5); for (let i = 0; i < 160; i++) { const x = R() * W, y = yb + 6 + R() ** 2 * 120; circle(c, x, y, 0.8 + R() * 1.2, `rgba(150,172,214,${(0.1 + 0.18 * R()) * sa})`); } }
  }
  if (ys > -10 && ys < H + 10) {               // the surface: a thin rippled line
    c.save(); c.beginPath();
    for (let x = 0; x <= W; x += 12) { const wx = (x - cm.cx) / cm.z + cm.fx, y = ys + (2.2 * Math.sin(wx * 0.021 + t * 1.6) + 1.3 * Math.sin(wx * 0.053 - t * 2.3)) * Math.min(1.4, cm.z); x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.strokeStyle = `rgba(150,190,240,${0.14 * a})`; c.lineWidth = 7; c.stroke(); c.strokeStyle = `rgba(190,214,248,${0.8 * a})`; c.lineWidth = 2; c.stroke(); c.restore();
  }
  if ((o.ticks ?? 1) > 0) {                    // depth ticks along the left edge (no numbers)
    const step = 100 * cm.z < 40 ? 500 : 100, x = 62;
    withAlpha(c, (o.ticks ?? 1) * a, () => { for (let k = 1; k < 60; k++) { const y = cm.S(0, k * step)[1]; if (y < ys + 4) continue; if (y > H) break; const big = k % 5 === 0; line(c, [[x, y], [x + (big ? 16 : 8), y]], 'rgba(150,172,214,0.45)', 1.4); }
      if (ys < H) line(c, [[x, Math.max(ys, 0)], [x, H]], 'rgba(150,172,214,0.25)', 1.2); });
  }
}
const waterClip = cm => c => { const ys = cm.S(0, 0)[1]; c.rect(0, ys, W, H - ys); };
const airClip = cm => c => { const ys = cm.S(0, 0)[1]; c.rect(0, 0, W, Math.max(0, ys)); };
/** plan view (sea seen from above): a faint chart grid */
function planBg(stage, pc, a = 1) {
  const c = stage.ctx, step = 120;
  withAlpha(c, a, () => {
    c.lineWidth = 1; c.strokeStyle = 'rgba(120,150,210,0.10)';
    const x0 = pc.fx - (pc.cx) / pc.z, x1 = pc.fx + (W - pc.cx) / pc.z, y0 = pc.fy - pc.cy / (pc.z * pc.k), y1 = pc.fy + (H - pc.cy) / (pc.z * pc.k);
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const p = pc.S(x, 0)[0]; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, H); c.stroke(); }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const p = pc.S(0, y)[1]; c.beginPath(); c.moveTo(0, p); c.lineTo(W, p); c.stroke(); }
    const g = c.createRadialGradient(540, 820, 200, 540, 820, 1200); g.addColorStop(0, 'rgba(60,100,170,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
}

// ---- towed array in the cross-section ----
/** stern (world) → cable (sagging) → straight array of n hydrophones from head to tail */
function towGeom(sternX, back, depth, {len = 430, n = 12, slope = 6 * D2R} = {}) {
  const st = [sternX + 4, 16], head = [sternX - back, depth], tail = [head[0] - len * Math.cos(slope), head[1] + len * Math.sin(slope)];
  const pts = []; for (let i = 0; i < n; i++) pts.push([lerp(head[0], tail[0], i / (n - 1)), lerp(head[1], tail[1], i / (n - 1))]);
  return {st, head, tail, pts, ctrl: [st[0] - back * 0.15, depth * 0.92]};
}
function drawTow(c, cm, G, o = {}) {
  const a = o.alpha ?? 1; if (a <= 0) return;
  const P = cm.S(...G.st), C = cm.S(...G.ctrl), Hd = cm.S(...G.head), T = cm.S(...G.tail);
  c.save(); c.globalAlpha *= a; c.lineCap = 'round';
  c.beginPath(); c.moveTo(...P); c.quadraticCurveTo(...C, ...Hd); c.strokeStyle = rgba(PAL.line, 0.75); c.lineWidth = 1.6; c.stroke();
  c.beginPath(); c.moveTo(...Hd); c.lineTo(...T); c.strokeStyle = rgba(PAL.sig, 0.16); c.lineWidth = 7; c.stroke(); c.strokeStyle = rgba(PAL.sig, 0.75); c.lineWidth = 2.4; c.stroke();
  c.restore();
  if (o.pulse != null && o.pulse >= 0 && o.pulse <= 1) {           // a light running along the cable to the tail
    const u = o.pulse, q = u < 0.35 ? u / 0.35 : (u - 0.35) / 0.65;
    let x, y; if (u < 0.35) { const s = q; x = (1 - s) ** 2 * P[0] + 2 * (1 - s) * s * C[0] + s * s * Hd[0]; y = (1 - s) ** 2 * P[1] + 2 * (1 - s) * s * C[1] + s * s * Hd[1]; } else { x = lerp(Hd[0], T[0], q); y = lerp(Hd[1], T[1], q); }
    gl(c, x, y, 34, PAL.accHot, 0.8 * a); circle(c, x, y, 3.5, rgba('#FFFFFF', 0.9 * a));
  }
  G.pts.forEach((p, i) => { const s = cm.S(...p); hydro(c, s[0], s[1], o.age ? o.age(p, i) : 9, {alpha: a, r: o.r ?? 4.5, col: o.col, hot: o.hot, k: o.k}); });
}

// ---- text ----
function big(stage, s, x, y, size, col = '#FFFFFF', a = 1, o = {}) {
  if (a <= 0) return; withAlpha(stage.ctx, a, () => stage.text(s, x, y, {role: 'display', weight: 700, size, color: col, align: o.align || 'center', tracking: -0.02 * size, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 20, ...o}));
}
function label(stage, s, x, y, a = 1, o = {}) {
  if (a <= 0) return; const size = Math.max(30, o.size || 32), w = stage.measure(s, {role: 'body', weight: 700, size}), al = o.align || 'center';
  let x0 = al === 'left' ? x : al === 'right' ? x - w : x - w / 2; x0 = clamp(x0, 64, 936 - w);
  withAlpha(stage.ctx, a, () => { if (o.back !== false) backing(stage.ctx, x0, y, w, size, 1); stage.text(s, x0, y, {role: 'body', weight: o.weight ?? 700, size, color: o.color || PAL.ink, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 12}); });
}

// =====================================================================================================
// Time anchors (words of the tts text) and the plan
// =====================================================================================================
const Wd = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  ship1: Wd('s01', '배 뒤로'), line1: Wd('s01', '긴 줄을'), sea1: Wd('s01', '바닷속'), name1: Wd('s01', '예인 소나에'),
  radio2: Wd('s02', '전파를'), few2: Wd('s02', '몇 미터'), eat2: Wd('s02', '삼키고'), sun2: Wd('s02', '햇빛도'), deep2: Wd('s02', '깊은'),
  snd3: Wd('s03', '소리는'), air3: Wd('s03', '공기 중보다'), x4: Wd('s03', '네 배'), far3: Wd('s03', '멀리까지'), spread3: Wd('s03', '퍼져'),
  y42: Wd('s04', '천구백사십이년'), radar4: Wd('s04', '레이더에'), so4: Wd('s04', '소리로'), nav4: Wd('s04', '길을'), rng4: Wd('s04', '거리를'), acr4: Wd('s04', '머리글자입니다'),
  ping5: Wd('s05', '소리를 쏘아'), echo5: Wd('s05', '메아리를'), act5: Wd('s05', '능동형과'), quiet5: Wd('s05', '소리를 내지'), listen5: Wd('s05', '듣기만'), pas5: Wd('s05', '수동형이'),
  far6: Wd('s06', '멀리까지'), ship6: Wd('s06', '배와'), sub6: Wd('s06', '잠수함의'), prop6: Wd('s06', '프로펠러와'), eng6: Wd('s06', '엔진이'), low6: Wd('s06', '낮은'),
  core7: Wd('s07', '핵심은'), line7: Wd('s07', '긴 줄에'), ears7: Wd('s07', '귀들이'), arr7: Wd('s07', '도착 시각'), dir7: Wd('s07', '방향을'),
  near8: Wd('s08', '가까이에서'), loud8: Wd('s08', '시끄러운'), mine8: Wd('s08', '내 배가'),
  mic9: Wd('s09', '물속 마이크를'), hang9: Wd('s09', '매달아'), back9: Wd('s09', '배 뒤로'), pull9: Wd('s09', '끌어'), away9: Wd('s09', '떨어뜨립니다'),
  slant10: Wd('s10', '비스듬히'), end10: Wd('s10', '한쪽 끝'), first10: Wd('s10', '먼저'), other10: Wd('s10', '다른 끝에는'), late10: Wd('s10', '늦게'),
  diff11: Wd('s11', '시각 차이만큼'), delay11: Wd('s11', '늦춰'), add11: Wd('s11', '더하면'), that11: Wd('s11', '그 방향의'), big11: Wd('s11', '커져'), know11: Wd('s11', '알 수'),
  long12: Wd('s12', '줄이 길수록'), sharp12: Wd('s12', '날카롭게'), wl12: Wd('s12', '파장이'), low12: Wd('s12', '낮은 소리까지'),
  straight13: Wd('s13', '곧은 줄은'), left13: Wd('s13', '왼쪽에서'), right13: Wd('s13', '오른쪽에서'), cant13: Wd('s13', '가리지'),
  turn14: Wd('s14', '방향을 틀어'), again14: Wd('s14', '다시 들으면'), true14: Wd('s14', '진짜 방향은'), stay14: Wd('s14', '그대로'), mirror14: Wd('s14', '거울 쪽'), odd14: Wd('s14', '엉뚱하게'),
  plane15: Wd('s15', '초계기는'), buoy15: Wd('s15', '소노부이라는'), drop15: Wd('s15', '떨어뜨립니다'),
  each16: Wd('s16', '부표마다'), mic16: Wd('s16', '마이크를 내려'), hear16: Wd('s16', '듣고'), radio16: Wd('s16', '전파에'), plane16: Wd('s16', '비행기로'),
  many17: Wd('s17', '여러 부표를'), wide17: Wd('s17', '넓게'), each17: Wd('s17', '각 부표에'), diff17: Wd('s17', '시각 차이로'), narrow17: Wd('s17', '좁혀'),
  ping18: Wd('s18', '소리를 쏘아'), echo18: Wd('s18', '메아리로'), foe18: Wd('s18', '상대를'),
  no19: Wd('s19', '아닙니다'), shoot19: Wd('s19', '쏘면'), me19: Wd('s19', '내 위치도'), show19: Wd('s19', '드러나기'), quiet19: Wd('s19', '조용히'), listen19: Wd('s19', '듣기만'),
  core20: Wd('s20', '핵심은'), ears20: Wd('s20', '귀들이'), arr20: Wd('s20', '도착 시각'),
};
export const MORPH = [0.9, 1.7];
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {tl};
  for (const [k, r] of Object.entries(A)) P[k] = tl.at(r);
  P.end = tl.duration; const sc = id => tl.scene(id); P.sc = sc;
  // ---------------- hook / close: the poster world (ship 0..262 at the surface, array behind and below)
  P.posterCam = [10.3, 262, 1.45];
  P.hookTow = towGeom(0, 31, 172, {len: 285, slope: 8.4 * D2R});
  P.posterSub = [-217, 614];                                   // generic submarine (scale 0.6), lower left
  P.target = new Emitter({src: [-295, 614], v: M.vSide, t0: -3.78, rep: 1.1, crests: 2, gap: 30, rmax: 1400, col: PAL.sig});
  P.cablePulse = [P.line1 + 0.05, P.line1 + 1.35];
  P.radio = P.radio2 - 0.5;                                   // radio waves start falling
  P.sun = P.sun2 - 0.3;
  P.airSrc = [-480, -330]; P.waterSrc = [-480, 330];
  P.sndT0 = P.snd3 - 0.05;
  P.water = new Emitter({src: P.waterSrc, v: 330, t0: P.sndT0, rep: 1.5, n: 5, crests: 2, gap: 46, rmax: 2600, col: PAL.sig, w: 2.2});
  P.air = new Emitter({src: P.airSrc, v: 330 / M.ratio, t0: P.sndT0, rep: 1.5, n: 5, crests: 2, gap: 46 / M.ratio * 2.2, rmax: 700, col: PAL.noise, w: 2.2});
  const h0 = sc('hook').end;
  P.hookKeys = [[0, 10.3, 262, 1.45], [1.7, 10.3, 262, 1.45], [3.2, -20, 281, 1.35], [6.5, -80, 286, 1.4], [7.6, -200, 150, 1.55], [11.0, -200, 150, 1.6], [12.6, -200, 820, 0.55], [14.3, -200, 860, 0.53],
    [15.3, -330, 120, 0.72], [19.6, -330, 150, 0.7], [21.3, -330, 640, 0.42], [h0 + 0.2, -330, 650, 0.41]];
  // ---------------- origin (same world as the hook): seabed pings, then two panels
  P.seabed = 830;
  P.pingSrc = [150, 22];
  P.pings = [P.y42 - 0.2, P.y42 + 3.6];
  P.vPing = 640;
  P.originKeys = [[sc('origin').start - 0.3, -330, 650, 0.41], [sc('origin').start + 0.9, -50, 430, 1.0], [sc('origin').end, -40, 440, 1.03]];
  P.so = [P.so4 - 0.1, P.nav4 - 0.05, P.rng4 - 0.25, P.rng4 + 0.05];   // SOund, Navigation, And, Ranging
  P.split = tl.at('s05') - 0.55;
  P.ping5 = P.ping5 - 0.2; P.vPing5 = 1300; P.pings5 = [P.ping5, P.ping5 + 2.7];
  P.pnl = {fy: 400, z: 0.75, sub: [240, 840], ping: [150, 22], tow: towGeom(0, 20, 300, {len: 200, n: 8, slope: 20 * D2R})};
  P.pnl.pas = new Emitter({src: [240 + 130 * 0.9, 840], v: 900, t0: P.quiet5 - 0.9, rep: 1.3, n: 4, crests: 3, gap: 80, rmax: 2400, col: PAL.sig, w: 2.2});
  // ---------------- essence: the far world
  P.farShip = 100; P.farSub = [520, 640];
  P.lowSub = new Emitter({src: [390, 640], v: 420, t0: sc('essence').start - 3, rep: 2.0, crests: 3, gap: 70, rmax: 3200, col: PAL.sig, w: 2.2, pow: 1.2});
  P.lowShip = new Emitter({src: [114, 12], v: 420, t0: sc('essence').start - 2.6, rep: 1.3, crests: 3, gap: 70, rmax: 3200, col: PAL.sig, w: 2, a: 0.7, pow: 1.2});
  P.hiSub = new Emitter({src: [390, 640], v: 420, t0: sc('essence').start - 2, rep: 0.22, crests: 1, gap: 0, rmax: 300, col: PAL.noise, w: 1.6, a: 0.8});
  P.hiShip = new Emitter({src: [114, 12], v: 420, t0: sc('essence').start - 2, rep: 0.22, crests: 1, gap: 0, rmax: 300, col: PAL.noise, w: 1.4, a: 0.6});
  P.essShip = 1700; P.essTow = towGeom(P.essShip, 90, 236, {len: 560});
  P.essKeys = [[sc('essence').start, 960, 520, 0.5], [P.ship6 - 0.4, 960, 520, 0.5], [P.prop6 - 0.1, 940, 540, 0.52], [P.prop6 + 0.7, 450, 640, 1.45], [P.eng6 + 0.1, 470, 640, 1.5],
    [P.low6 - 0.2, 520, 620, 1.35], [P.low6 + 1.1, 960, 500, 0.5], [tl.at('s07') - 0.2, 980, 500, 0.5], [tl.at('s07') + 1.0, 1380, 330, 0.95], [sc('essence').end, 1400, 340, 0.97]];
  { const pts = P.essTow.pts, tail = pts[pts.length - 1], s7 = tl.at('s07') + 0.7, te = P.lowSub.times().find(x => x + dist(tail, P.lowSub.src) / P.lowSub.v >= s7);
    P.ess7te = te; P.ess7arr = pts.map(p => te + dist(p, P.lowSub.src) / P.lowSub.v); }
  // ---------------- tow: own ship noise, the cable pays out
  P.towSrc = [14, 12];
  P.noise = new Emitter({src: P.towSrc, v: 420, t0: sc('tow').start - 4, rep: 0.17, crests: 1, gap: 0, rmax: 1300, col: PAL.noise, w: 1.8, near: 160});
  P.towTarget = new Emitter({src: [-2700, 760], v: 420, t0: sc('tow').start - 6, rep: 2.0, crests: 3, gap: 60, rmax: 5200, col: PAL.sig, w: 2.2});
  P.pay = [P.pull9 - 1.0, P.pull9 + 2.1];
  P.back = tt => lerp(40, 940, easeInOut((tt - P.pay[0]) / (P.pay[1] - P.pay[0])));
  P.depth = tt => lerp(120, 300, easeInOut((tt - P.pay[0]) / (P.pay[1] - P.pay[0])));
  P.towG = tt => towGeom(0, P.back(tt), P.depth(tt));
  P.level = r => clamp(1 - Math.log10(Math.max(20, r) / 20) / Math.log10(2600 / 20));   // relative noise level (dB scale, 1/r²)
  P.towKeys = [[sc('tow').start, 40, 360, 1.0], [P.loud8, 30, 380, 0.95], [P.pay[0], 10, 400, 0.9], [P.pay[1] + 0.3, -540, 590, 0.62], [sc('tow').end, -550, 590, 0.61]];
  // ---------------- bearing (plan view): plane wave at θ onto a straight array
  P.u = [-Math.cos(M.theta), Math.sin(M.theta)];                // propagation direction (screen y down): from the upper-left
  P.el = n => { const o = []; for (let i = 0; i < n; i++) o.push([363 - i * M.dPx, 0]); return o; };
  P.sStart = -420;
  P.firstTail = P.end10 + 0.25;                                      // the first crest reaches the tail at "한쪽 끝"
  P.tePlan = P.firstTail - (P.el(12)[11][0] * P.u[0] - P.sStart) / M.vPlan;
  P.planRep = 4.0;
  P.planTimes = [-1, 0, 1, 2, 3, 4].map(k => P.tePlan + k * P.planRep);
  P.arrPlan = (p, te) => te + (p[0] * P.u[0] + p[1] * P.u[1] - P.sStart) / M.vPlan;
  P.tilt = [sc('bearing').start - 0.15, sc('bearing').start + 0.85];
  P.delay = [P.delay11 - 0.3, P.delay11 + 0.45];
  P.sum = [P.add11, P.add11 + 0.65];
  P.steer = [P.big11 - 50 / 160 * 2.6, P.big11 + 110 / 160 * 2.6];    // the sweep passes θ exactly at '커져'
  P.steerPhi = tt => lerp(175, 15, clamp((tt - P.steer[0]) / (P.steer[1] - P.steer[0]))) * D2R;
  P.grow = [P.long12 - 0.1, P.long12 + 1.0];
  P.lam = P.wl12 - 0.15;
  // ---------------- ambiguity (plan view): ship turns, the true line stays, the mirror line moves
  P.amb = ambiguityModel(P);
  // ---------------- aircraft
  P.air0 = sc('aircraft').start;
  P.planeX = tt => -1250 + 330 * (tt - P.air0);
  P.alt = -560; P.oldBuoys = [-1, -2, -3].map(k => P.planeX(P.buoy15 - 0.1) + 10 + 165 + k * 270);
  P.hydDepth = 300; P.micDown = [P.mic16 - 0.1, P.mic16 + 1.1];
  const drop = (t0, x0, alt, vx, mic) => ({t0, x0, alt, vx, hit: t0 + Math.sqrt(2 * -alt / 1000), fx: x0 + vx * 0.5, mic});
  P.drops = [P.buoy15 - 0.1, P.drop15 + 0.05].map(t0 => drop(t0, P.planeX(t0) + 10, P.alt, 330, P.micDown));
  const b1x = P.drops[0].fx; P.b1x = b1x;
  // second pass (heading left, a little higher): drops one more buoy, then receives the radio relay
  P.alt2 = -600; P.drop3 = P.each16 + 0.25; P.plane2 = tt => b1x + 380 - 220 * (tt - P.drop3);
  { const d = drop(P.drop3, P.plane2(P.drop3) - 10, P.alt2, -220, null); d.mic = [d.hit + 0.25, d.hit + 1.2]; P.drops.push(d); }
  P.hyd = [P.drops[0], P.drops[2]].map(d => [d.fx, 22 + P.hydDepth]);
  P.airSub = [b1x - 560, 400];
  P.airLow = new Emitter({src: P.airSub, v: 600, t0: P.hear16 + 0.05 - dist(P.airSub, P.hyd[0]) / 600, rep: 1.6, n: 5, crests: 3, gap: 70, rmax: 2600, col: PAL.sig, w: 2.2});
  // radio relay (display speed 900 world px/s — light is instantaneous on this scale; slowed to be seen)
  P.vRadio = 900; P.ant = [P.drops[0], P.drops[2]].map(d => [d.fx, -54]);
  P.radioE = P.plane16 - dist(P.ant[0], [P.plane2(P.plane16), P.alt2]) / P.vRadio;
  P.radioEm = [0, 1].map(j => [0, 1, 2, 3, 4].map(k => P.radioE + j * 0.1 + k * 0.32));
  P.radioRx = [0, 1].map(j => { let ta = P.radioEm[j][0] + 1; for (let it = 0; it < 6; it++) ta = P.radioEm[j][0] + dist(P.ant[j], [P.plane2(ta), P.alt2]) / P.vRadio; return ta; });
  P.radioT = [P.radioE, P.radioE + 1.6];
  P.airCam = tt => {                                             // follow the aircraft, then the buoys under the second pass
    const fol = cam(P.planeX(Math.min(tt, P.drops[0].t0 + 0.6)) - 150, -274, 0.95);
    if (tt < P.drops[0].t0 + 0.6) return fol;
    return keyCam(tt, [[P.drops[0].t0 + 0.6, fol.fx, fol.fy, fol.z], [P.drops[1].hit + 0.3, b1x + 60, -230, 0.9], [P.each16 - 0.1, b1x + 90, -120, 0.88], [P.hear16 + 0.5, b1x - 40, -110, 0.9],
      [P.plane16 + 0.3, b1x - 160, -130, 0.86], [P.tilt17[0], b1x - 170, -130, 0.86]]);
  };
  P.tilt17 = [tl.at('s17') - 0.75, tl.at('s17') + 0.15];
  P.buoys = [[-500, -330], [10, -420], [480, -300], [-430, 120], [70, 20], [500, 170], [-80, 450]];
  P.src17 = [-210, 250];
  P.te17 = P.each17 - 0.85; P.v17 = 520;
  P.arr17 = P.buoys.map(b => P.te17 + dist(b, P.src17) / P.v17);
  P.hyp = [[0, 3], [3, 6], [4, 6]]; P.hypT = [P.diff17 - 0.1, P.diff17 + 1.2];
  P.fix = [P.narrow17 - 0.2, P.narrow17 + 0.8];
  // ---------------- myth
  P.mythShip = 0; P.mythSub = [560, 700]; P.mythPing = [150, 22];
  P.R18 = dist(P.mythPing, P.mythSub); P.v18 = 2 * P.R18 / 1.5;
  P.p18 = P.ping18 + 0.05; P.p19 = P.shoot19 + 0.05;
  P.mythTow = towGeom(0, 40, 220, {len: 300});
  P.mythPas = new Emitter({src: [P.mythSub[0] + 130, P.mythSub[1]], v: 420, t0: P.quiet19 - 0.4 - dist([P.mythSub[0] + 130, P.mythSub[1]], P.mythTow.pts[0]) / 420, rep: 1.4, n: 4, crests: 3, gap: 60, rmax: 2600, col: PAL.sig, w: 2.2});
  // ---------------- close
  P.poster = tl.at('s20') + 0.1;
  PLANS.set(tl, P); return P;
}
function ambiguityModel(P) {
  const tl = P.tl, s0 = tl.scene('ambiguity').start, L = {};
  L.cable = 110; L.n = 12; L.sp = 60; L.len = (L.n - 1) * L.sp;
  L.R = 190; L.dpsi = 40 * D2R;
  L.tTurn = P.turn14 - 0.5;                                      // the ship starts to turn ("배가 방향을 틀어")
  L.v0 = 30; L.v1 = 560;                                         // slow cruise; time-lapse during the turn until the array is straight again
  // ship arc length: integrate the speed; fast from the turn until the tail has passed the end of the turn
  L.dt = 0.01; L.t0 = s0 - 1; L.S = [0]; let fast = 0, done = false, tDone = Infinity;
  const sTurn0 = L.v0 * (L.tTurn - L.t0);
  for (let tt = L.t0; tt < s0 + 20; tt += L.dt) {
    const sNow = L.S[L.S.length - 1];
    if (!done && tt >= L.tTurn - 0.15 && sNow - L.cable - L.len >= sTurn0 + L.R * L.dpsi) { done = true; tDone = tt; }
    fast = tt < L.tTurn - 0.15 ? 0 : !done ? Math.min(1, fast + L.dt / 0.25) : Math.max(0, fast - L.dt / 0.45);
    L.S.push(sNow + lerp(L.v0, L.v1, smooth(fast)) * L.dt);
  }
  L.sAt = tt => { const i = clamp((tt - L.t0) / L.dt, 0, L.S.length - 2), k = Math.floor(i); return lerp(L.S[k], L.S[k + 1], i - k); };
  L.s1 = L.sAt(L.tTurn - 0.15); L.s2 = L.s1 + L.R * L.dpsi; L.tStraight = tDone;
  L.pos = s => {                                                  // track: straight along +x, left (upward) turn, straight
    if (s <= L.s1) return [s - L.s1, 0, 0];
    if (s <= L.s2) { const ph = (s - L.s1) / L.R; return [L.R * Math.sin(ph), -L.R * (1 - Math.cos(ph)), -ph]; }
    const e = [L.R * Math.sin(L.dpsi), -L.R * (1 - Math.cos(L.dpsi))], d = s - L.s2; return [e[0] + d * Math.cos(L.dpsi), e[1] - d * Math.sin(L.dpsi), -L.dpsi];
  };
  L.elems = tt => { const s = L.sAt(tt), o = []; for (let i = 0; i < L.n; i++) o.push(L.pos(s - L.cable - i * L.sp)); return o; };
  L.center = tt => { const e = L.elems(tt); return [(e[0][0] + e[L.n - 1][0]) / 2, (e[0][1] + e[L.n - 1][1]) / 2]; };
  L.meas1 = P.straight13 - 0.1;                                  // first measurement (snapshot)
  L.meas2 = Math.max(L.tStraight + 0.05, P.again14 + 0.2);       // second measurement once the array is straight again
  const c1 = L.center(L.meas1);
  L.src = [c1[0] + 420 * Math.cos(60 * D2R), c1[1] - 420 * Math.sin(60 * D2R)];
  const mirror = (p, c, ang) => { const ux = Math.cos(ang), uy = Math.sin(ang), dx = p[0] - c[0], dy = p[1] - c[1], al = dx * ux + dy * uy; return [c[0] + 2 * al * ux - dx, c[1] + 2 * al * uy - dy]; };
  L.ghost1 = mirror(L.src, c1, 0);
  const c2 = L.center(L.meas2), e2 = L.elems(L.meas2), ang2 = Math.atan2(e2[0][1] - e2[L.n - 1][1], e2[0][0] - e2[L.n - 1][0]);
  L.c1 = c1; L.c2 = c2; L.ang2 = ang2; L.ghost2 = mirror(L.src, c2, ang2);
  L.tFreeze = L.tTurn - 0.2; L.cOld = L.center(L.tFreeze);        // the first bearings follow the array until the turn, then stay as a snapshot
  // fixed camera that frames the source, both ghosts, the first array and the ship after the turn
  // camera that follows the turn: frame 1 = source, mirror, array before the turn; frame 2 = source, new mirror, array after
  const fit = (pts, mx = 120, my = 170) => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), bw = Math.max(...xs) - Math.min(...xs) + 2 * mx, bh = Math.max(...ys) - Math.min(...ys) + 2 * my;
    return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, Math.min(880 / bw, 950 / bh)]; };
  const e1 = L.elems(L.meas1), e2b = L.elems(L.meas2 + 0.5);
  L.fit1 = fit([L.src, L.ghost1, e1[0], e1[L.n - 1], L.pos(L.sAt(L.meas1))]);
  L.fit2 = fit([L.src, L.ghost2, L.cOld, e2b[0], e2b[L.n - 1]]);
  const mid = fit([L.src, L.ghost1, L.ghost2, e1[L.n - 1], e2b[0]]);
  L.camKeys = [[s0, L.fit1[0], L.fit1[1], L.fit1[2] * 1.05], [L.tTurn - 0.2, ...L.fit1], [L.tTurn + 0.9, ...mid], [L.tStraight + 0.5, ...L.fit2], [tl.scene('ambiguity').end, L.fit2[0], L.fit2[1], L.fit2[2] * 1.03]];
  L.emit = new Emitter({src: L.src, v: 420, t0: s0 - 1.0, rep: 2.2, crests: 3, gap: 50, rmax: 2400, col: PAL.sig, w: 2.2});
  return L;
}

// =====================================================================================================
// Header titles, poster
// =====================================================================================================
function titleList(id, P) {
  const at = s => P.tl.at(s) - 0.5;
  if (id === 'hook') return [[-Infinity, '오늘의 주제', '군함은 왜 긴 줄을 끌까?'], [at('s02'), '바닷속 · 전파와 빛', '몇 미터 만에 사라진다'], [at('s03'), '바닷속 · 소리', '공기보다 4배 넘게 빠르다']];
  if (id === 'origin') return [[-Infinity, '1942 · 미국', 'SONAR라는 이름'], [P.split + 0.1, '소나의 두 방식', '쏘아 듣기 · 듣기만']];
  if (id === 'essence') return [[-Infinity, '멀리 가는 소리', '프로펠러와 엔진의 낮은 소리'], [at('s07'), '본질', '도착 시각 차이 → 방향']];
  if (id === 'tow') return [[-Infinity, '가장 큰 소음', '바로 내 배'], [at('s09'), '예인', '멀리 끌어 떨어뜨린다']];
  if (id === 'bearing') return [[-Infinity, '위에서 본 모습 · 메커니즘 ①', '한쪽 끝에 먼저 닿는다'], [at('s11'), '메커니즘 ② · 늦춰 더하기', '그 방향만 커진다'], [at('s12'), '메커니즘 ③ · 줄의 길이', '길수록 날카롭게']];
  if (id === 'ambiguity') return [[-Infinity, '곧은 줄의 한계', '왼쪽? 오른쪽?'], [at('s14'), '방향을 틀어 다시 듣기', '진짜는 그대로 남는다']];
  if (id === 'aircraft') return [[-Infinity, '하늘에서 · 초계기', '소노부이'], [at('s16'), '소노부이', '듣고, 전파로 보낸다'], [P.tilt17[0], '여러 부표 · 위에서 본 모습', '시각 차이로 위치를']];
  if (id === 'myth') return [[-Infinity, '오해 바로잡기', '늘 소리를 쏠까?'], [P.no19 - 0.2, '오해 바로잡기', '대부분 조용히 듣는다']];
  return [[-Infinity, '', '']];
}
function head(stage, kicker, title, aK, aT, sub = '', aS = aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.acc, align: 'center', tracking: 2, ...so}); line(c, [[505, 174], [575, 174]], PAL.acc, 3, {cap: 'butt'}); });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 840, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 292, {role: 'display', weight: 700, size: 34, color: PAL.acc, align: 'center', ...so}));
}
const POSTER = {q: '군함은 왜 긴 줄을 끌까?', a: '바닷속 소리를 들으려고', y: 1090, y2: 1222};
let QS = 0, AS = 0;
function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 860, 100); AS ||= fit(POSTER.a, 900, 140);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 56, q), y2 = lerp(POSTER.y2, 292, q), s2 = lerp(AS, 34, q), tr = lerp(-0.03, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, 960, 0, 1340); g.addColorStop(0, 'rgba(3,6,18,0)'); g.addColorStop(0.3, 'rgba(3,6,18,0.62)'); g.addColorStop(0.75, 'rgba(3,6,18,0.62)'); g.addColorStop(1, 'rgba(3,6,18,0)'); c.fillStyle = g; c.fillRect(0, 960, W, 380); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: PAL.ink, align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    stage.text(POSTER.a, 540, y2, {role: 'display', weight: 700, size: s2, color: PAL.acc, align: 'center', tracking: tr * s2, shadow: sh, shadowBlur: 28});
  });
}
function captionBand(c) { const g = c.createLinearGradient(0, 1300, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(1,3,10,0.35)'); g.addColorStop(1, 'rgba(1,3,10,0.55)'); c.fillStyle = g; c.fillRect(0, 1300, W, 620); }
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook' && t < MORPH[1]) { posterTitle(stage, easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0]))); return; }
  if (!(id === 'close' && t >= P.poster)) captionBand(stage.ctx);
  if (id === 'close') {
    if (t >= P.poster) { posterTitle(stage, 1 - easeInOut((t - P.poster) / 0.9)); return; }
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, P), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (id === 'hook' && k === 0) head(stage, cur[1], cur[2], fadeIn(t, MORPH[1] - 0.05, 0.4) * a, a, POSTER.a, a);
  else {
    if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out), id === 'hook' && k === 1 ? POSTER.a : '', a * (1 - out));
    head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  }
  withAlpha(stage.ctx, id === 'hook' ? fadeIn(t, MORPH[1], 0.4) : 1, () => progressBar(stage, t, ctx.tl.duration));
}
export function background(stage) {
  const c = stage.ctx, g = c.createLinearGradient(0, 0, 380, H); g.addColorStop(0, '#0A142E'); g.addColorStop(1, '#050B1C');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(540, 860, 520, 540, 860, 1500); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) { if (staleWarned) return; staleWarned = true; const e = ctx.events.find(x => x.model); if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/towed-array-sonar/scenes.mjs --emit-sound'); }
export function modelSignature(tl) { const P = plan(tl); return `${tl.duration.toFixed(3)}/${P.tePlan.toFixed(3)}/${P.amb.tTurn.toFixed(3)}/${P.v18.toFixed(2)}/${M.slow.toFixed(1)}/${beam(1.9).toFixed(4)}`; }
const shake = (c, t, t0, amp = 6) => { const k = t > t0 ? Math.exp(-(t - t0) / 0.18) : 0; if (k > 0.01) c.translate(amp * k * Math.sin(t * 91), amp * k * Math.cos(t * 77)); };
export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  tow(stage, t, p, ctx) { towScene(stage, t, ctx); },
  bearing(stage, t, p, ctx) { bearingScene(stage, t, ctx); },
  ambiguity(stage, t, p, ctx) { ambiguityScene(stage, t, ctx); },
  aircraft(stage, t, p, ctx) { aircraftScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ the poster world (hook start, close)
function posterWorld(stage, t, P, cm, o = {}) {      // target sound + its source, the towed array, the ship
  const c = stage.ctx, ta = o.target ?? 1;
  if (ta > 0) { P.target.draw(c, cm, t, {clip: waterClip(cm), alpha: ta}); subSide(c, xf(cm.S, P.posterSub[0], P.posterSub[1], 0.6), {spin: t * 8, alpha: ta}); }
  drawTow(c, cm, P.hookTow, {age: pt => P.target.age(pt, t), pulse: o.pulse, alpha: 0.35 + 0.65 * ta, k: ta, r: 5.5});
  shipSide(c, xf(cm.S, 0, 0), {spin: t * 9});
}
function hookScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), cm = keyCam(t, P.hookKeys);
  const ta = fadeOut(t, 6.6, 0.8);
  const pu = t > P.cablePulse[0] && t < P.cablePulse[1] ? (t - P.cablePulse[0]) / (P.cablePulse[1] - P.cablePulse[0]) : null;
  const sunA = fadeIn(t, P.sun, 0.8) * fadeOut(t, 15.0, 0.6);
  sea(stage, cm, t, {ticks: 0.8, dark: sunA});
  // sunlight (s02 second half): slanted thin rays from the surface, fading with depth
  if (sunA > 0) {
    const ys = cm.S(0, 0)[1], dL = 230 * cm.z;
    const g = c.createLinearGradient(0, ys, 0, ys + 4 * dL); g.addColorStop(0, `rgba(200,222,255,${0.16 * sunA})`); g.addColorStop(1, 'rgba(200,222,255,0)'); c.fillStyle = g; c.fillRect(0, ys, W, 4 * dL);
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let k = -8; k < 16; k++) { const x0 = 60 + k * 80 + 18 * Math.sin(t * 0.6 + k); const L = 5 * dL, x1 = x0 + 0.28 * L;
      const gg = c.createLinearGradient(x0, ys, x1, ys + L); gg.addColorStop(0, `rgba(220,234,255,${0.5 * sunA})`); gg.addColorStop(0.35, `rgba(220,234,255,${0.12 * sunA})`); gg.addColorStop(1, 'rgba(220,234,255,0)');
      c.strokeStyle = gg; c.lineWidth = 1.6 + (k % 3 === 0 ? 1 : 0); c.beginPath(); c.moveTo(x0, ys); c.lineTo(x1, ys + L); c.stroke(); }
    c.restore();
  }
  // the target's sound and the array (poster content) — fade as we go up to the surface
  posterWorld(stage, t, P, cm, {target: ta, pulse: pu});
  const nm = win(t, P.name1 - 0.1, 6.9, 0.35, 0.4);
  if (nm > 0) { const m = cm.S(...P.hookTow.pts[6]); label(stage, '예인 소나', m[0], m[1] + 70, nm, {size: 40, color: PAL.sig}); }
  // radio waves (s02): sinusoids falling from the sky, dying a few "metres" under the surface
  const ra = fadeIn(t, P.radio, 0.4) * fadeOut(t, P.sun + 0.6, 0.6);
  if (ra > 0) {
    const ys = cm.S(0, 0)[1], dlt = 22;
    c.save(); c.beginPath(); c.rect(0, 330, W, H - 330); c.clip(); c.lineJoin = 'round';
    for (const wx of [-470, -330, -190]) {
      const front = -620 + 520 * (t - P.radio);
      for (const [ya, yb] of [[-620, 0], [0, 4 * dlt]]) {         // in the air at full strength; under the surface it dies away
        if (front <= ya) continue; c.beginPath(); let first = true;
        for (let y = ya; y <= Math.min(front, yb); y += 3) {
          const amp = 15 * (y < 0 ? 1 : Math.exp(-y / dlt)), x = wx + amp * Math.sin(y * 0.11 - t * 9), p = cm.S(x, y);
          first ? c.moveTo(...p) : c.lineTo(...p); first = false;
        }
        if (ya < 0) c.strokeStyle = rgba(PAL.noise, 0.85 * ra);
        else { const g = c.createLinearGradient(0, cm.S(0, 0)[1], 0, cm.S(0, 4 * dlt)[1]); g.addColorStop(0, rgba(PAL.noise, 0.85 * ra)); g.addColorStop(1, rgba(PAL.noise, 0)); c.strokeStyle = g; }
        c.lineWidth = 2; c.stroke();
      }
    }
    c.restore();
    const at = fadeIn(t, P.few2 - 0.1, 0.3) * ra, bx = cm.S(-110, 0)[0], b0 = ys, b1 = cm.S(0, 3 * dlt)[1];
    if (at > 0) withAlpha(c, at, () => { line(c, [[bx, b0], [bx, b1]], PAL.acc, 2.5); line(c, [[bx - 9, b0], [bx + 9, b0]], PAL.acc, 2.5); line(c, [[bx - 9, b1], [bx + 9, b1]], PAL.acc, 2.5); });
    label(stage, '몇 m', bx + 24, (b0 + b1) / 2, at, {size: 40, color: PAL.acc, align: 'left'});
    const top = cm.S(-190, 0); label(stage, '전파', top[0] + 50, Math.max(400, ys - 150), fadeIn(t, P.radio2 - 0.1, 0.3) * ra, {size: 38, align: 'left'});
    if (t > P.eat2 && t < P.eat2 + 1.4) for (const wx of [-470, -330, -190]) { const q = cm.S(wx, 2.5 * dlt); gl(c, q[0], q[1], 30, PAL.noise, 0.4 * (1 - (t - P.eat2) / 1.4)); }
  }
  if (sunA > 0) label(stage, '햇빛', cm.S(-760, 0)[0], cm.S(0, 120)[1], fadeIn(t, P.sun2, 0.4) * sunA, {size: 38});
  // s03: one sound in the air and one in the water, emitted together: the water front runs 4.4× faster
  const sa = fadeIn(t, P.sndT0 - 0.5, 0.4);
  if (sa > 0) {
    P.water.draw(c, cm, t, {clip: waterClip(cm), alpha: sa});
    P.air.draw(c, cm, t, {clip: airClip(cm), alpha: sa});
    for (const [s, col] of [[P.airSrc, PAL.noise], [P.waterSrc, PAL.sig]]) { const q = cm.S(...s); gl(c, q[0], q[1], 22, col, 0.6 * sa); circle(c, q[0], q[1], 4, rgba('#FFFFFF', 0.9 * sa)); burst(c, q[0], q[1], t - P.sndT0, 60, col, 0.8); }
    const la = sa * fadeOut(t, P.far3 + 0.3, 0.5), qa = cm.S(...P.airSrc), qw = cm.S(...P.waterSrc);
    label(stage, '공기 340 m/s', qa[0], qa[1] - 190, fadeIn(t, P.air3 - 0.2, 0.3) * la, {size: 34, color: '#DCE4F2'});
    label(stage, '물 1,500 m/s', qw[0], qw[1] + 74, fadeIn(t, P.snd3 + 0.3, 0.3) * la, {size: 34, color: PAL.sig});
    big(stage, '×4.4', 760, 470, 150, PAL.acc, fadeIn(t, P.x4 - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.6, 0.4));
  }
}

// ------------------------------------------------------------------ origin: SONAR (1942), seabed ranging, then two panels
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t < P.split) {
    const cm = keyCam(t, P.originKeys), sb = fadeIn(t, ctx.scene.start - 0.1, 0.8);
    sea(stage, cm, t, {seabed: P.seabed, seabedA: sb});
    // pings to the seabed and their echoes (image source below the seabed)
    for (const te of P.pings) {
      const r = P.vPing * (t - te), D = P.seabed - P.pingSrc[1], s = cm.S(...P.pingSrc);
      if (r > 0 && r < D + 40) { c.save(); c.beginPath(); waterClip(cm)(c); c.clip(); for (let j = 0; j < 2; j++) { const rr = r - j * 40; if (rr > 0) ringFx(c, s[0], s[1], rr * cm.z, PAL.acc, (j ? 0.4 : 0.85) * (1 - 0.4 * rr / D), 2.2, 0, Math.PI); } c.restore(); }
      if (r > D) { const im = cm.S(P.pingSrc[0], 2 * P.seabed - P.pingSrc[1]), yb = cm.S(0, P.seabed)[1]; c.save(); c.beginPath(); c.rect(0, cm.S(0, 0)[1], W, yb - cm.S(0, 0)[1]); c.clip(); for (let j = 0; j < 2; j++) { const rr = r - j * 40; if (rr > D && rr < 2 * D + 40) ringFx(c, im[0], im[1], rr * cm.z, PAL.acc, (j ? 0.25 : 0.55), 2, Math.PI, TAU); } c.restore();
        const hb = cm.S(P.pingSrc[0], P.seabed); burst(c, hb[0], hb[1], t - te - D / P.vPing, 70, PAL.acc, 0.8); }
      burst(c, s[0], s[1], t - te, 50, PAL.acc, 0.7); burst(c, s[0], s[1], t - te - 2 * D / P.vPing, 70, PAL.accHot, 0.9);
    }
    shipSide(c, xf(cm.S, 0, 0), {spin: t * 8});
    // typography: 1942 → RADAR / SONAR → SOund · Navigation · And · Ranging
    const k1 = fadeIn(t, P.y42 - 0.15, 0.35) * fadeOut(t, P.so[0] - 0.1, 0.35);
    big(stage, '1942', 300, 500, 150 * (1 + 0.15 * Math.exp(-(t - P.y42) / 0.25) * (t > P.y42 ? 1 : 0)), '#FFFFFF', k1);
    const kr = fadeIn(t, P.radar4 - 0.1, 0.3) * fadeOut(t, P.so[0] - 0.1, 0.35);
    big(stage, 'RADAR', 300, 690, 92, '#AEB9D2', kr);
    const ks = fadeIn(t, P.radar4 + 0.4, 0.3), mv = easeInOut((t - P.so[0]) / 0.6);
    const rows = [['SO', 'und'], ['N', 'avigation'], ['A', 'nd'], ['R', 'anging']], rx = 104, ry = [560, 680, 800, 920];
    if (ks > 0) {
      if (mv <= 0) big(stage, 'SONAR', 300, 820, 92, PAL.acc, ks);
      else {
        const sz = lerp(92, 78, mv), wS = ['SO', 'N', 'A', 'R'].map(s => stage.measure(s, {role: 'display', weight: 700, size: 92, tracking: -0.02 * 92}));
        let x0 = 300 - wS.reduce((a, b) => a + b, 0) / 2;
        rows.forEach(([h, rest], i) => {
          const sx = x0 + wS[i] / 2; x0 += wS[i];
          const tx = rx + stage.measure(h, {role: 'display', weight: 700, size: 78}) / 2, x = lerp(sx, tx, mv), y = lerp(820, ry[i], mv);
          big(stage, h, x, y, sz, PAL.acc, ks);
          const ra = fadeIn(t, P.so[i], 0.35);
          if (ra > 0) { const hw = stage.measure(h, {role: 'display', weight: 700, size: 78}); withAlpha(c, ra, () => stage.text(rest, rx + hw + 4 + 30 * (1 - ra), ry[i] + 4, {role: 'display', weight: 500, size: 66, color: '#D9E0EE', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16})); }
        });
      }
    }
    return;
  }
  // ---- two panels: active (ping → echo) | passive (listen only); the full view folds into the left panel
  const e = easeInOut(clamp((t - P.split) / 0.7)), Q = P.pnl, zc = Q.z + 0.02 * smooth((t - P.split) / 6);
  const panel = (x0, w, fn) => { c.save(); c.beginPath(); c.rect(x0, 0, w, H); c.clip(); fn(); c.restore(); };
  const o = P.originKeys[P.originKeys.length - 1];
  const left = cam(lerp(o[1], 131, e), lerp(o[2], Q.fy, e), Math.exp(lerp(Math.log(o[3]), Math.log(zc), e)), lerp(540, 270, e), 860);
  panel(0, lerp(1080, 540, e), () => {
    sea(stage, left, t, {ticks: 0, seabed: P.seabed, seabedA: 1 - e});
    const R = dist(Q.ping, Q.sub);
    subSide(c, xf(left.S, Q.sub[0], Q.sub[1], 0.9, -1), {spin: t * 6, alpha: e});
    for (const te of P.pings5) {
    const r = P.vPing5 * (t - te), s = left.S(...Q.ping), sb = left.S(...Q.sub);
    c.save(); c.beginPath(); waterClip(left)(c); c.clip();
    for (let j = 0; j < 2; j++) { const rr = r - j * 60; if (rr > 0 && rr < R + 150) ringFx(c, s[0], s[1], rr * left.z, PAL.acc, (j ? 0.4 : 0.9) * (1 - 0.5 * rr / R), 2.2, 0, Math.PI); }
    for (let j = 0; j < 2; j++) { const rr = r - R - j * 60; if (rr > 0 && rr < R * 1.1) ringFx(c, sb[0], sb[1], rr * left.z, PAL.acc, (j ? 0.3 : 0.65) * (1 - rr / (R * 1.1)), 2, Math.PI, TAU); }
    c.restore();
    burst(c, s[0], s[1], t - te, 50, PAL.acc, 0.8); burst(c, sb[0], sb[1], t - te - R / P.vPing5, 70, PAL.accHot, 0.9); burst(c, s[0], s[1], t - te - 2 * R / P.vPing5, 80, PAL.accHot, 1);
    }
    shipSide(c, xf(left.S, 0, 0), {spin: t * 8});
  });
  const right = cam(131, Q.fy, zc, 810 + 560 * (1 - e), 860);
  if (e > 0) panel(540, 540, () => {
    sea(stage, right, t, {ticks: 0});
    Q.pas.draw(c, right, t, {clip: waterClip(right)});
    subSide(c, xf(right.S, Q.sub[0], Q.sub[1], 0.9, -1), {spin: t * 6});
    drawTow(c, right, Q.tow, {age: pt => Q.pas.age(pt, t)});
    shipSide(c, xf(right.S, 0, 0), {spin: t * 3});
  });
  withAlpha(c, e, () => line(c, [[540, 320], [540, 1330]], 'rgba(160,180,220,0.45)', 1.5));
  label(stage, '능동', 270, 380, fadeIn(t, P.act5 - 0.9, 0.35), {size: 56, color: PAL.acc});
  label(stage, '쏘고 메아리 듣기', 270, 445, fadeIn(t, P.echo5 - 0.1, 0.35), {size: 32});
  label(stage, '수동', 810, 380, fadeIn(t, P.quiet5 - 0.2, 0.35), {size: 56, color: PAL.sig});
  label(stage, '듣기만', 810, 445, fadeIn(t, P.listen5 - 0.1, 0.35), {size: 32});
}

// ------------------------------------------------------------------ essence: low sounds travel far → arrival order along the array
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), cm = keyCam(t, P.essKeys);
  sea(stage, cm, t, {});
  const wc = {clip: waterClip(cm)};
  P.hiShip.draw(c, cm, t, wc); P.hiSub.draw(c, cm, t, wc);
  P.lowShip.draw(c, cm, t, wc); P.lowSub.draw(c, cm, t, wc);
  shipSide(c, xf(cm.S, P.farShip, 0), {spin: t * 9});
  subSide(c, xf(cm.S, P.farSub[0], P.farSub[1]), {spin: t * 9});
  // engine glyph inside the submarine (pulsing)
  const ea = win(t, P.eng6 - 0.2, P.low6 + 0.8);
  if (ea > 0) { const a = cm.S(P.farSub[0] - 70, P.farSub[1] - 10), b = cm.S(P.farSub[0] - 20, P.farSub[1] + 10), pu = 0.5 + 0.5 * Math.sin(t * 22);
    withAlpha(c, ea, () => { c.save(); c.setLineDash([6, 5]); c.strokeStyle = rgba(PAL.acc, 0.9); c.lineWidth = 2; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.restore(); gl(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 40 + 10 * pu, PAL.acc, 0.35); }); }
  drawTow(c, cm, P.essTow, {age: pt => t > ctx.tl.at('s07') - 0.3 ? P.lowSub.age(pt, t) : 9});
  shipSide(c, xf(cm.S, P.essShip, 0), {spin: t * 9});
  // labels
  const sp = cm.S(P.farSub[0] - 130, P.farSub[1]), en = cm.S(P.farSub[0] - 45, P.farSub[1]);
  label(stage, '프로펠러', sp[0], sp[1] + 80, win(t, P.prop6 + 0.3, P.low6 + 0.4), {size: 36, color: PAL.ink});
  label(stage, '엔진', en[0], en[1] - 80, win(t, P.eng6, P.low6 + 0.4), {size: 36, color: PAL.acc});
  const la = win(t, P.low6 + 0.6, ctx.tl.at('s07') + 0.4);
  if (la > 0) { const lo = cm.S(P.farSub[0] + 900, P.farSub[1] + 260), hi = cm.S(P.farSub[0] - 140, P.farSub[1] + 230); label(stage, '낮은 소리 · 멀리', lo[0], lo[1], la, {size: 36, color: PAL.sig}); label(stage, '높은 소리 · 금방 약해짐', hi[0] + 120, hi[1] + 40, la, {size: 32, color: '#DCE4F2'}); }
  // s07: arrival times under the array (a slanted row of dots) → direction
  const s7 = ctx.tl.at('s07'), ca = fadeIn(t, s7 + 0.6, 0.5);
  if (ca > 0) {
    const pts = P.essTow.pts, base = cm.S(0, 400)[1], arr = P.ess7arr, first = Math.min(...arr), last = Math.max(...arr);
    const yOf = tt => base + (tt - first) / (last - first) * 300;
    withAlpha(c, ca, () => {
      const x0 = cm.S(...pts[pts.length - 1])[0] - 40, x1 = cm.S(...pts[0])[0] + 40;
      line(c, [[x0, base - 24], [x1, base - 24]], 'rgba(150,172,214,0.5)', 1.5);
      line(c, [[x0, base - 24], [x0, base + 330]], 'rgba(150,172,214,0.5)', 1.5);
      c.save(); c.fillStyle = 'rgba(150,172,214,0.6)'; c.beginPath(); c.moveTo(x0 - 8, base + 322); c.lineTo(x0 + 8, base + 322); c.lineTo(x0, base + 338); c.fill(); c.restore();
      const dots = [];
      pts.forEach((p, i) => { const ta = arr[i]; if (t < ta) return; const x = cm.S(...p)[0], y = yOf(ta), hy = cm.S(...p)[1];
        line(c, [[x, hy + 12], [x, y - 8]], rgba(PAL.sig, 0.14), 1.2); gl(c, x, y, 20, PAL.sig, 0.55); circle(c, x, y, 5.5, rgba(PAL.sigHot, 0.95)); dots.push([x, y]); });
      if (dots.length >= 2) { const a = dots[0], b = dots[dots.length - 1]; line(c, [a, b], rgba(PAL.acc, 0.9), 2.5); }
    });
    label(stage, '↓ 도착 시각', cm.S(...pts[pts.length - 1])[0] - 30, base + 380, ca * fadeIn(t, P.arr7 - 0.2, 0.3), {size: 34, align: 'left'});
    const da = fadeIn(t, P.dir7 - 0.2, 0.4);
    if (da > 0) { const m = cm.S(...pts[5]), d = [cm.S(...P.farSub)[0] - m[0], cm.S(...P.farSub)[1] - m[1]], l = Math.hypot(...d), q = [m[0] + d[0] / l * 300 * da, m[1] + d[1] / l * 300 * da];
      withAlpha(c, da, () => { line(c, [m, q], PAL.acc, 3); gl(c, q[0], q[1], 30, PAL.acc, 0.6); }); label(stage, '방향', q[0] - 10, q[1] + 44, da, {size: 36, color: PAL.acc}); }
    label(stage, '귀 = 물속 마이크', cm.S(...pts[3])[0], cm.S(...pts[3])[1] - 80, win(t, P.ears7 - 0.1, P.arr7 + 0.2), {size: 34, color: PAL.sig});
  }
}

// ------------------------------------------------------------------ tow: own-ship noise, paying the cable out
function towScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), cm = keyCam(t, P.towKeys), G = P.towG(t);
  sea(stage, cm, t, {});
  const wc = {clip: waterClip(cm)};
  P.towTarget.draw(c, cm, t, {...wc, alpha: 0.35 + 0.65 * fadeIn(t, P.pay[1] - 0.6, 0.8)});
  const na = 0.55 + 0.45 * fadeIn(t, P.loud8 - 0.3, 0.5);
  P.noise.draw(c, cm, t, {...wc, alpha: na});
  const mid = G.pts[5], r = dist(mid, P.towSrc), lev = P.level(r);
  // hydrophones: pale noisy flicker when close, clean cyan flashes when far
  const R = rng(Math.floor(t * 30));
  drawTow(c, cm, G, {age: pt => P.towTarget.age(pt, t), col: mix(PAL.sig, PAL.noise, lev), k: 1 - 0.8 * lev});
  if (lev > 0.3) G.pts.forEach(pt => { const s = cm.S(...pt); gl(c, s[0] + (R() - 0.5) * 6, s[1] + (R() - 0.5) * 6, 18 + 22 * R(), PAL.noise, 0.5 * lev * R()); });
  shipSide(c, xf(cm.S, 0, 0), {spin: t * 14});
  const pr = cm.S(...P.towSrc); c.save(); c.beginPath(); waterClip(cm)(c); c.clip(); burst(c, pr[0], pr[1], t - P.mine8, 90, PAL.noise, 0.8); c.restore();
  // graph: noise level vs distance behind the ship (shares the camera's x axis)
  const ga = fadeIn(t, P.loud8 - 0.4, 0.5), gy0 = 1290, gy1 = 1000;
  if (ga > 0) withAlpha(c, ga, () => {
    const xS = cm.S(P.towSrc[0], 0)[0];
    line(c, [[60, gy0], [Math.min(W - 60, xS + 20), gy0]], 'rgba(150,172,214,0.55)', 1.5);
    line(c, [[xS, gy0], [xS, gy1 - 30]], 'rgba(150,172,214,0.35)', 1.2, {dash: [5, 6]});
    c.save(); c.beginPath(); let first = true;
    for (let rr = 20; rr < 4000; rr *= 1.04) { const x = cm.S(P.towSrc[0] - rr, 0)[0]; if (x < 40) break; const y = lerp(gy0, gy1, P.level(rr)); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; }
    c.strokeStyle = rgba(PAL.noise, 0.16); c.lineWidth = 9; c.stroke(); c.strokeStyle = rgba(PAL.noise, 0.95); c.lineWidth = 2.6; c.stroke(); c.restore();
    const mx = cm.S(...mid)[0], my = lerp(gy0, gy1, lev);
    line(c, [[mx, cm.S(...mid)[1] + 14], [mx, my - 10]], rgba(PAL.sig, 0.35), 1.2, {dash: [4, 6]});
    gl(c, mx, my, 30, lev > 0.4 ? PAL.noise : PAL.sig, 0.7); circle(c, mx, my, 7, rgba(lev > 0.4 ? '#FFFFFF' : PAL.sigHot, 1));
  });
  label(stage, '내 배의 소음', pr[0] + 30, pr[1] + 120, win(t, P.loud8, P.pay[0] + 0.5), {size: 36, align: 'left'});
  label(stage, '소음 크기', 70, gy1 - 40, ga * fadeOut(t, ctx.scene.end - 0.4), {size: 30, align: 'left', color: PAL.muted});
  label(stage, '← 배에서 멀리', 70, gy0 + 36, ga * fadeOut(t, ctx.scene.end - 0.4), {size: 30, align: 'left', color: PAL.muted});
  label(stage, '멀어질수록 조용', clamp(cm.S(...mid)[0], 200, 800), gy0 - 0.5 * (gy0 - gy1) - 10, fadeIn(t, P.away9 - 0.3, 0.4), {size: 36, color: PAL.sig});
}

// ------------------------------------------------------------------ bearing (plan view): arrival times → delay-and-sum → beam
function bearingScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start;
  const k = lerp(0.06, 1, easeInOut((t - P.tilt[0]) / (P.tilt[1] - P.tilt[0])));
  const g = easeInOut((t - P.grow[0]) / (P.grow[1] - P.grow[0])), N = t < P.grow[0] ? 12 : 12 + Math.round(12 * clamp((t - P.grow[0]) / 0.8));
  const els = P.el(24).slice(0, N), xc = (els[0][0] + els[N - 1][0]) / 2;
  // during the tilt the plan view grows out of the towed array's place in the cross-section
  const qT = easeInOut((t - P.tilt[0]) / (P.tilt[1] - P.tilt[0])), Gs = P.towG(ctx.tl.scene('tow').end), cs = keyCam(ctx.tl.scene('tow').end, P.towKeys);
  const hs = cs.S(...Gs.head), ts = cs.S(...Gs.tail), z0 = Math.hypot(hs[0] - ts[0], hs[1] - ts[1]) / (11 * M.dPx);
  const z = lerp(1.0, 0.56, g) * lerp(z0, 1, qT), pc = cam(lerp(0, -396, g), 0, z, lerp((hs[0] + ts[0]) / 2, 540, qT), lerp((hs[1] + ts[1]) / 2, 760, qT), k);
  // fading cross-section (the tilt starts from the side view)
  if (k < 0.99) withAlpha(c, 1 - smooth((k - 0.06) / 0.55), () => towScene(stage, t, {...ctx, scene: ctx.tl.scene('tow')}));
  planBg(stage, pc, smooth((k - 0.2) / 0.6));
  // plane wave packets (above the array; fade below it)
  const wfA = 1 - smooth((t - P.steer[0] - 0.4) / 0.8) * 0.75;
  c.save(); c.beginPath(); c.rect(0, 300, W, pc.S(0, 0)[1] + 30 - 300); c.clip();
  for (const te of P.planTimes) for (let j = 0; j < 3; j++) {
    const s = P.sStart + M.vPlan * (t - te) - j * 26; if (s < -1400 || s > 900) continue;
    const o = [P.u[0] * s, P.u[1] * s], n = [-P.u[1], P.u[0]], a = pc.S(o[0] + n[0] * 2000, o[1] + n[1] * 2000), b = pc.S(o[0] - n[0] * 2000, o[1] - n[1] * 2000);
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(PAL.sig, [0.8, 0.45, 0.22][j] * wfA * smooth((k - 0.1) / 0.5)); c.lineWidth = [2.4, 2, 1.6][j]; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.restore();
  }
  c.restore();
  // the array (plan) with the cable going off to the ship on the right
  const head = pc.S(...els[0]), tail = pc.S(...els[N - 1]);
  line(c, [head, [W + 20, head[1] - 0]], rgba(PAL.line, 0.6), 1.6);
  line(c, [tail, head], rgba(PAL.sig, 0.75), 2.4);
  const ageOf = (p) => { let best = 9; for (const te of P.planTimes) { const a = t - P.arrPlan(p, te); if (a >= 0 && a < best) best = a; } return best; };
  els.forEach((p, i) => { const s = pc.S(...p), pop = i >= 12 ? clamp((t - P.grow[0] - (i - 12) * 0.06) / 0.25) : 1; if (pop > 0) hydro(c, s[0], s[1], t < P.steer[0] + 0.5 ? ageOf(p) : 9, {alpha: pop, r: 5}); });
  // labels of s10: first / late / θ / Δt
  const L10 = fadeOut(t, P.delay[0] - 0.2, 0.4);
  const e12 = P.el(12);
  label(stage, '먼저', pc.S(...e12[11])[0], pc.S(...e12[11])[1] - 64, fadeIn(t, P.first10 - 0.1, 0.3) * L10, {size: 38, color: PAL.sigHot});
  label(stage, '늦게', pc.S(...e12[0])[0] - 10, pc.S(...e12[0])[1] - 64, fadeIn(t, P.late10 - 0.1, 0.3) * L10, {size: 38, color: PAL.sigHot});
  const ta = fadeIn(t, P.other10 - 0.2, 0.4) * L10;
  if (ta > 0) { const o = pc.S(0, 0); withAlpha(c, ta, () => { c.save(); c.strokeStyle = rgba(PAL.acc, 0.95); c.lineWidth = 2.4; c.beginPath(); c.arc(o[0], o[1], 92, -M.theta, 0); c.stroke(); c.restore();
      line(c, [o, [o[0] + 230 * Math.cos(M.theta), o[1] - 230 * Math.sin(M.theta)]], rgba(PAL.acc, 0.85), 2.2, {dash: [9, 7]}); });
    stage.text('θ', o[0] + 122 * Math.cos(M.theta / 2), o[1] - 122 * Math.sin(M.theta / 2), {role: 'body', weight: 700, size: 40, color: PAL.acc, align: 'center', alpha: ta, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10}); }
  big(stage, 'Δt = d · cosθ ÷ c', 540, 400, 64, '#FFFFFF', fadeIn(t, P.late10 + 0.4, 0.4) * fadeOut(t, P.delay[0] - 0.2, 0.4));
  // waterfall: one trace hanging under each hydrophone (newest at the top), then delays, then the sum
  const wa = fadeIn(t, s0 + 0.9, 0.5) * fadeOut(t, P.steer[0], 0.45) * (1 - g);
  if (wa > 0) waterfall(stage, t, P, pc, wa);
  // the beam: steering line sweeps, the lobe B(φ) is traced
  const ba = fadeIn(t, P.steer[0] - 0.1, 0.4);
  if (ba > 0) beamPlot(stage, t, P, pc, ba, N, g, xc);
  if (t > P.lam - 0.3) lambdaRuler(stage, t, P, pc, els, N);
}
const NOISE = (() => { const R = rng(11), o = []; for (let i = 0; i < 24; i++) o.push([R() * TAU, R() * TAU, R() * TAU, 0.8 + 0.4 * R()]); return o; })();
function sig(P, i, tt, p) {
  let v = 0;
  for (const te of P.planTimes) { const d = tt - P.arrPlan(p, te); if (d > -0.8 && d < 0.8) v += Math.exp(-((d / 0.26) ** 2)) * Math.sin(TAU * 2.2 * d); }
  const [a, b, cc, s] = NOISE[i % 24];
  return v + 0.17 * s * (0.6 * Math.sin(7.1 * tt + a) * Math.sin(2.3 * tt + b) + 0.45 * Math.sin(12.7 * tt + cc));
}
function waterfall(stage, t, P, pc, a) {
  const c = stage.ctx, y0 = pc.S(0, 0)[1] + 34, y1 = 1300, vwf = 82, els = P.el(12);
  const head = els.map(p => P.arrPlan(p, 0)), dmax = Math.max(...head);
  const dl = easeInOut((t - P.delay[0]) / (P.delay[1] - P.delay[0])), sm = easeInOut((t - P.sum[0]) / (P.sum[1] - P.sum[0]));
  withAlpha(c, a, () => {
    line(c, [[90, y0 - 8], [990, y0 - 8]], 'rgba(150,172,214,0.3)', 1);
    stage.text('↓ 시간', 70, y0 + 24, {role: 'body', weight: 700, size: 30, color: PAL.muted, alpha: 1 - sm});
    els.forEach((p, i) => {
      const D = (dmax - head[i]) * dl, x = lerp(pc.S(...p)[0], 540, sm), aa = sm > 0 ? 1 - sm * 0.85 : 1;
      c.save(); c.beginPath();
      for (let y = y0; y <= y1; y += 4) { const tau = (y - y0) / vwf, v = sig(P, i, t - tau - D, p); y === y0 ? c.moveTo(x + 20 * v, y) : c.lineTo(x + 20 * v, y); }
      c.strokeStyle = rgba(PAL.sig, 0.7 * aa); c.lineWidth = 1.8; c.stroke(); c.restore();
    });
    // arrival markers (the centre of each blip) joined per wavefront: slanted before the delays, level after
    if (sm < 1) for (const te of P.planTimes) {
      const pts = els.map((p, i) => { const D = (dmax - head[i]) * dl; return [lerp(pc.S(...p)[0], 540, sm), y0 + (t - P.arrPlan(p, te) - D) * vwf]; });
      const vis = pts.filter(q => q[1] >= y0 && q[1] <= y1); if (vis.length < 2) continue;
      line(c, vis, rgba(PAL.sigHot, 0.35 * (1 - sm)), 1.4);
      vis.forEach(q => { gl(c, q[0], q[1], 16, PAL.sig, 0.6 * (1 - sm)); circle(c, q[0], q[1], 3.5, rgba(PAL.sigHot, 0.95 * (1 - sm))); });
    }
    if (sm > 0) {                 // the delayed sum: N times bigger where the delays line up
      c.save(); c.beginPath();
      for (let y = y0; y <= y1; y += 3) { const tau = (y - y0) / vwf; let v = 0; els.forEach((p, i) => { v += sig(P, i, t - tau - (dmax - head[i]) * dl, p); }); const x = 540 + 9 * v * sm; y === y0 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.strokeStyle = rgba(PAL.acc, 0.2 * sm); c.lineWidth = 8; c.stroke(); c.strokeStyle = rgba(PAL.acc, 0.95 * sm); c.lineWidth = 2.6; c.stroke(); c.restore();
    }
  });
  label(stage, '늦춰서 맞추기', 540, y1 - 30, win(t, P.delay[0] + 0.1, P.sum[0] + 0.2) * a, {size: 36, color: PAL.sigHot});
  label(stage, '더하면 12배', 760, 1150, fadeIn(t, P.sum[1] - 0.3, 0.3) * a, {size: 40, color: PAL.acc});
}
function lobePath(c, cx, cy, R, N, theta = M.theta, a0 = 0, a1 = Math.PI) {
  c.beginPath(); c.moveTo(cx, cy);
  for (let k = 0; k <= 360; k++) { const ph = lerp(a0, a1, k / 360), r = R * beam(ph, theta, N); c.lineTo(cx + r * Math.cos(ph), cy - r * Math.sin(ph)); }
  c.closePath();
}
function beamPlot(stage, t, P, pc, a, N, g, xc) {
  const c = stage.ctx, o = pc.S(xc, 0), R = 400, phi = P.steerPhi(t), done = t > P.steer[1];
  withAlpha(c, a, () => {
    // polar grid (half circle) above the array
    c.save(); c.strokeStyle = 'rgba(150,172,214,0.22)'; c.lineWidth = 1.2; for (const rr of [0.5, 1]) { c.beginPath(); c.arc(o[0], o[1], R * rr, Math.PI, TAU); c.stroke(); } c.restore();
    for (const ang of [30, 60, 90, 120, 150]) line(c, [o, [o[0] + R * Math.cos(ang * D2R), o[1] - R * Math.sin(ang * D2R)]], 'rgba(150,172,214,0.12)', 1);
    // short-array lobe (N = 12): traced by the sweep; after growing it stays as a dashed reference
    const traced = done ? 0 : phi;
    c.save(); lobePath(c, o[0], o[1], R, 12, M.theta, traced, Math.PI); c.globalCompositeOperation = 'lighter';
    c.fillStyle = rgba(PAL.acc, 0.12 * (1 - g)); c.fill(); c.strokeStyle = rgba(g > 0 ? PAL.muted : PAL.acc, g > 0 ? 0.6 : 0.95); c.lineWidth = 2.6; if (g > 0) c.setLineDash([9, 8]); c.stroke(); c.restore();
    if (g > 0) { c.save(); lobePath(c, o[0], o[1], R, 24); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(PAL.acc, 0.16 * g); c.fill(); c.strokeStyle = rgba(PAL.acc, 0.95 * g); c.lineWidth = 2.8; c.stroke(); c.restore(); }
    if (!done) { const b = beam(phi), q = [o[0] + R * Math.cos(phi), o[1] - R * Math.sin(phi)], r2 = R * b, pk = [o[0] + r2 * Math.cos(phi), o[1] - r2 * Math.sin(phi)];
      line(c, [o, q], rgba(PAL.accHot, 0.5), 1.6, {dash: [6, 6]}); gl(c, pk[0], pk[1], 26 + 40 * b, PAL.acc, 0.4 + 0.5 * b); circle(c, pk[0], pk[1], 5, rgba('#FFFFFF', 0.95)); }
    const hit = P.steer[0] + (175 - M.theta / D2R) / 160 * (P.steer[1] - P.steer[0]); const pk = [o[0] + R * Math.cos(M.theta), o[1] - R * Math.sin(M.theta)];
    burst(c, pk[0], pk[1], t - hit, 80, PAL.accHot, 1);
  });
  label(stage, '이 방향만 커진다', o[0] + R * Math.cos(M.theta) + 40, o[1] - R * Math.sin(M.theta) - 44, win(t, P.big11, P.grow[0] + 0.1) * a, {size: 36, color: PAL.acc});
  label(stage, '더 날카롭게', o[0] + R * Math.cos(M.theta) + 40, o[1] - R * Math.sin(M.theta) - 44, fadeIn(t, P.sharp12 - 0.1, 0.3) * a, {size: 36, color: PAL.acc});
  // the same beam output as a graph: x = steering direction (180° → 0°), y = loudness of the delayed sum
  const ga = a * fadeOut(t, P.lam - 0.4, 0.4); if (ga <= 0) return;
  const gx0 = 90, gx1 = 930, gy0 = 1270, gy1 = 900, X = ph => lerp(gx0, gx1, (175 - ph / D2R) / 160), Y = b => lerp(gy0, gy1, b);
  withAlpha(c, ga, () => {
    line(c, [[gx0, gy1 - 20], [gx0, gy0], [gx1, gy0]], 'rgba(150,172,214,0.55)', 1.5);
    line(c, [[X(M.theta), gy0], [X(M.theta), gy1 - 10]], rgba(PAL.acc, 0.3), 1.2, {dash: [5, 7]});
    const curve = (N, a0, a1, col, al, w, dash) => { c.save(); c.beginPath(); let first = true; for (let d = a0; d >= a1 - 1e-9; d -= 0.25) { const ph = d * D2R, p = [X(ph), Y(beam(ph, M.theta, N))]; first ? c.moveTo(...p) : c.lineTo(...p); first = false; }
      if (dash) c.setLineDash(dash); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(col, al * 0.18); c.lineWidth = w * 3.5; c.stroke(); c.strokeStyle = rgba(col, al); c.lineWidth = w; c.stroke(); c.restore(); };
    const upto = done ? 15 : phi / D2R;
    curve(12, 175, upto, g > 0 ? PAL.muted : PAL.acc, g > 0 ? 0.7 : 0.95, 2.4, g > 0 ? [9, 8] : null);
    if (g > 0) curve(24, 175, 15, PAL.acc, 0.95 * g, 2.6);
    if (!done) { const b = beam(phi); gl(c, X(phi), Y(b), 22 + 30 * b, PAL.acc, 0.5 + 0.4 * b); circle(c, X(phi), Y(b), 5, '#FFFFFF'); }
  });
  label(stage, '방향별 소리 크기', gx0 + 10, gy1 - 50, ga * fadeIn(t, P.steer[0], 0.4), {size: 30, align: 'left', color: PAL.muted});
  label(stage, '짧은 줄', X(M.theta) - 150, Y(0.55), ga * fadeIn(t, P.grow[1] - 0.2, 0.3), {size: 32, color: PAL.muted});
  label(stage, '긴 줄', X(M.theta) + 90, Y(0.9), ga * fadeIn(t, P.grow[1] - 0.2, 0.3), {size: 34, color: PAL.acc});
}
function lambdaRuler(stage, t, P, pc, els, N) {
  const c = stage.ctx, a = fadeIn(t, P.lam, 0.5), y = pc.S(0, 0)[1] + 150, x0 = pc.S(...els[N - 1])[0], x1 = pc.S(...els[0])[0], lamPx = 2 * M.dPx * pc.z;
  withAlpha(c, a, () => {
    c.save(); c.beginPath(); const ph = t * 3.2;
    for (let x = x0; x <= x1; x += 3) { const yy = y + 26 * Math.sin(TAU * (x - x0) / lamPx - ph); x === x0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
    c.strokeStyle = rgba(PAL.sig, 0.2); c.lineWidth = 7; c.stroke(); c.strokeStyle = rgba(PAL.sig, 0.95); c.lineWidth = 2.2; c.stroke(); c.restore();
    const bx = x0 + lamPx * 2, by = y + 60; line(c, [[bx, by], [bx + lamPx, by]], PAL.acc, 2.5); line(c, [[bx, by - 10], [bx, by + 10]], PAL.acc, 2.5); line(c, [[bx + lamPx, by - 10], [bx + lamPx, by + 10]], PAL.acc, 2.5);
    stage.text('λ', bx + lamPx / 2, by + 32, {role: 'body', weight: 700, size: 34, color: PAL.acc, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 10});
  });
  big(stage, '100 Hz → 파장 15 m', 540, y + 170, 60, '#FFFFFF', a);
  label(stage, '줄 = 파장의 여러 배', 540, y + 250, fadeIn(t, P.low12, 0.4), {size: 36, color: PAL.sig});
}

// ------------------------------------------------------------------ ambiguity (plan view): the cone, the turn
function ambiguityScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), L = P.amb, s0 = ctx.scene.start;
  const sNow = L.sAt(t), ship = L.pos(sNow), ctr = L.center(t);
  const kc = keyCam(t, L.camKeys, 510, 815), pc = cam(kc.fx, kc.fy, kc.z, 510, 815);
  const fi = smooth((t - s0) / 0.5);
  planBg(stage, pc, fi);
  // sound from the true source (and, dashed, the mirror source that would give the same arrival order)
  const below = c2 => c2.rect(0, 300, W, H - 300);
  L.emit.draw(c, pc, t, {alpha: fi, clip: below});
  const ghostA = win(t, P.left13 - 0.3, L.tTurn + 0.2) * 0.6;
  if (ghostA > 0) { const g2 = new Emitter({...L.emit, src: L.ghost1}); c.save(); c.setLineDash([10, 10]); g2.draw(c, pc, t, {alpha: ghostA, clip: below}); c.restore(); }
  const snapA = 0.4 * fadeIn(t, L.tTurn, 0.5);
  if (snapA > 0) { const e1 = L.elems(L.tFreeze); withAlpha(c, snapA, () => { line(c, e1.map(p => pc.S(p[0], p[1])), rgba(PAL.sig, 0.8), 2, {dash: [6, 6]}); e1.forEach(p => { const q = pc.S(p[0], p[1]); circle(c, q[0], q[1], 3, rgba(PAL.sig, 0.8)); }); }); }
  // track, array, ship
  c.save(); c.beginPath(); for (let s = sNow - L.cable - L.len - 600; s <= sNow; s += 10) { const p = pc.S(...L.pos(s)); s === sNow - L.cable - L.len - 600 ? c.moveTo(...p) : c.lineTo(...p); }
  c.strokeStyle = 'rgba(150,172,214,0.25)'; c.lineWidth = 1.5; c.setLineDash([6, 8]); c.stroke(); c.restore();
  const els = L.elems(t);
  c.save(); c.beginPath(); for (let s = sNow - L.cable; s <= sNow - 60; s += 8) { const p = pc.S(...L.pos(s)); s === sNow - L.cable ? c.moveTo(...p) : c.lineTo(...p); } c.strokeStyle = rgba(PAL.line, 0.7); c.lineWidth = 1.6; c.stroke(); c.restore();
  c.save(); c.beginPath(); els.forEach((p, i) => { const q = pc.S(p[0], p[1]); i ? c.lineTo(...q) : c.moveTo(...q); }); c.strokeStyle = rgba(PAL.sig, 0.75); c.lineWidth = 2.4; c.stroke(); c.restore();
  els.forEach(p => { const q = pc.S(p[0], p[1]); hydro(c, q[0], q[1], L.emit.age([p[0], p[1]], t), {r: 4}); });
  shipTop(c, xf(pc.S, ship[0], ship[1], 0.9, 1, ship[2]));
  // bearing lines: measurement 1 (both sides of the axis), measurement 2 after the turn
  const ray = (o, ang, len, col, a, dash) => { const q = [o[0] + len * Math.cos(ang), o[1] + len * Math.sin(ang)]; line(c, [pc.S(...o), pc.S(...q)], rgba(col, a), 2.6, {dash}); };
  const c1 = t < L.tFreeze ? L.center(t) : L.cOld, m1 = fadeIn(t, P.straight13 + 0.1, 0.6), ang1 = Math.atan2(L.src[1] - c1[1], L.src[0] - c1[0]), ang1m = Math.atan2(L.ghost1[1] - c1[1], L.ghost1[0] - c1[0]);
  const old = t > L.tTurn ? 0.45 : 1;
  const l1 = dist(c1, L.src) + 160, l2 = dist(L.c2, L.src) + 160, l2m = dist(L.c2, L.ghost2) + 120;
  if (m1 > 0) { withAlpha(c, m1, () => { ray(c1, ang1, l1 * m1, PAL.acc, 0.9 * old); ray(c1, ang1m, l1 * m1, PAL.acc, 0.9 * old * fadeOut(t, P.odd14, 0.6) + 0.25 * (t > P.odd14 ? 1 : 0), t > L.tTurn ? [10, 10] : null); }); }
  const m2 = fadeIn(t, L.meas2, 0.6), ang2 = Math.atan2(L.src[1] - L.c2[1], L.src[0] - L.c2[0]), ang2m = Math.atan2(L.ghost2[1] - L.c2[1], L.ghost2[0] - L.c2[0]);
  if (m2 > 0) withAlpha(c, m2, () => { ray(L.c2, ang2, l2 * m2, PAL.acc, 0.95); ray(L.c2, ang2m, l2m * m2, PAL.acc, 0.95); });
  // true source and ghosts
  const sp = pc.S(...L.src), g1 = pc.S(...L.ghost1), g2 = pc.S(...L.ghost2);
  const qa = fadeIn(t, P.left13, 0.3) * fadeOut(t, P.true14 - 0.45, 0.3);
  label(stage, '?', sp[0], sp[1] - 60, qa, {size: 56, color: PAL.acc});
  label(stage, '?', g1[0], g1[1] + 60, fadeIn(t, P.right13, 0.3) * fadeOut(t, P.true14 - 0.45, 0.3), {size: 56, color: PAL.acc});
  ringFx(c, g1[0], g1[1], 24, PAL.muted, 0.7 * fadeIn(t, P.right13, 0.3) * fadeOut(t, P.odd14 + 0.3, 0.6), 2);
  const tv = fadeIn(t, P.true14 - 0.1, 0.3);
  gl(c, sp[0], sp[1], 36, PAL.sig, 0.6 * fi); circle(c, sp[0], sp[1], 6, rgba(PAL.sigHot, fi));
  if (tv > 0) { burst(c, sp[0], sp[1], t - P.true14, 110, PAL.accHot, 1); label(stage, '진짜 · 그대로', sp[0] + 10, sp[1] - 64, tv, {size: 38, color: PAL.acc}); }
  const ga = fadeIn(t, P.mirror14 - 0.1, 0.3);
  if (ga > 0) { ringFx(c, g2[0], g2[1], 24, PAL.muted, 0.8 * ga, 2); line(c, [g1, g2], `rgba(150,172,214,${0.5 * ga})`, 1.6, {dash: [6, 8]}); gl(c, g2[0], g2[1], 30, PAL.noise, 0.3 * ga);
    label(stage, '거울 · 엉뚱하게 바뀜', g2[0], g2[1] + 64, fadeIn(t, P.odd14 - 0.1, 0.3), {size: 36, color: '#DCE4F2'}); }
}

// ------------------------------------------------------------------ aircraft: drop, listen, relay; then the buoy field
function buoyPos(P, d, tt) {
  const u = tt - d.t0; if (u < 0) return null;
  return [d.x0 + d.vx * 0.5 * (1 - Math.exp(-u / 0.5)), Math.min(0, d.alt + 0.5 * 1000 * u * u), u];
}
function aircraftScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl);
  if (t >= P.tilt17[0]) { if (t < P.tilt17[1]) { const q = smooth((t - P.tilt17[0]) / (P.tilt17[1] - P.tilt17[0]) / 0.6); withAlpha(c, 1 - q, () => aircraftSide(stage, t, P)); } buoyField(stage, t, P, ctx); return; }
  aircraftSide(stage, t, P);
}
function aircraftSide(stage, t, P) {
  const c = stage.ctx, px = P.planeX(t), cm = P.airCam(t);
  sea(stage, cm, t, {});
  P.airLow.draw(c, cm, t, {clip: waterClip(cm)});
  subSide(c, xf(cm.S, P.airSub[0] + 75, P.airSub[1], 0.6), {spin: t * 8, alpha: 0.9 * fadeIn(t, P.each16 - 0.6, 0.5)});
  P.oldBuoys.forEach((x, k) => buoySide(c, xf(cm.S, x, 4 * Math.sin(t * 2 + k * 1.7), 2), {depth: P.hydDepth / 2, alpha: 0.75}));
  // buoys: fall, splash, lower the hydrophone on a thin line; the hydrophone flashes when a wavefront reaches it
  for (const [k, d] of P.drops.entries()) {
    const b = buoyPos(P, d, t); if (!b) continue;
    const [x, y] = b, floating = y >= 0, depth = d.mic ? P.hydDepth * easeInOut((t - d.mic[0]) / (d.mic[1] - d.mic[0])) : 0;
    buoySide(c, xf(cm.S, x, floating ? 4 * Math.sin(t * 2 + k) : y, 2), {depth: depth / 2});
    if (!floating) { const s = cm.S(x, y); gl(c, s[0], s[1], 14, PAL.noise, 0.4); line(c, [s, cm.S(x - d.vx * 0.12, y - 70)], rgba(PAL.noise, 0.3), 1.4); }
    c.save(); c.beginPath(); waterClip(cm)(c); c.clip(); const sp = cm.S(x, 0); burst(c, sp[0], sp[1], t - d.hit, 60, PAL.noise, 0.8); c.restore();
    if (depth > 4) { const h = cm.S(x, 22 + depth); hydro(c, h[0], h[1], depth > P.hydDepth - 2 ? P.airLow.age([d.fx, 22 + P.hydDepth], t) : 9, {r: 6}); }
  }
  // radio relay: dashed rings rising from the floats' antennas to the aircraft
  c.save(); c.beginPath(); airClip(cm)(c); c.clip(); c.setLineDash([7, 9]);
  P.radioEm.forEach((em, j) => { const b = buoyPos(P, j ? P.drops[2] : P.drops[0], t); if (!b) return; const an = cm.S(b[0], -54);
    for (const te of em) { const r = P.vRadio * (t - te); if (r <= 0 || r > 1500) continue; ringFx(c, an[0], an[1], r * cm.z, PAL.noise, 0.8 * (1 - r / 1500), 1.8, Math.PI, TAU); } });
  c.restore();
  // aircraft: first pass (drops two buoys), second pass (drops one more, then receives)
  planeSide(c, xf(cm.S, px, P.alt), {});
  if (t > P.drops[1].hit - 0.3) { const x2 = P.plane2(t), q = cm.S(x2, P.alt2); planeSide(c, xf(cm.S, x2, P.alt2, 1, -1), {}); P.radioRx.forEach((ta, j) => burst(c, q[0], q[1], t - ta, j ? 60 : 90, PAL.accHot, j ? 0.6 : 0.9)); }
  // labels (≤ 3 at a time)
  const pl = cm.S(px, P.alt);
  label(stage, '초계기', pl[0] - 40, pl[1] - 90, win(t, P.plane15 - 0.1, P.drops[0].t0 + 1.4), {size: 38});
  const d0 = buoyPos(P, P.drops[0], t); if (d0) { const q = cm.S(d0[0], d0[1]); label(stage, '소노부이', q[0] + 30, q[1] - 46, win(t, P.buoy15, P.each16 - 0.2), {size: 38, color: PAL.acc, align: 'left'}); }
  const p2 = cm.S(P.plane2(t), P.alt2); label(stage, '초계기', p2[0] + 10, p2[1] - 80, win(t, P.drop3 - 0.4, P.drop3 + 1.3), {size: 36});
  const h = cm.S(P.hyd[0][0], P.hyd[0][1]), an = cm.S(P.ant[0][0], P.ant[0][1]);
  label(stage, '물속 마이크', h[0] - 30, h[1] + 4, win(t, P.mic16 + 0.4, P.radio16), {size: 36, color: PAL.sig, align: 'right'});
  label(stage, '전파', an[0] + 50, an[1] - 150, win(t, P.radio16 + 0.1, P.tilt17[0]), {size: 38, align: 'left'});
}
function hyperbola(A, B, S) {           // branch through S of |p−A| − |p−B| = |S−A| − |S−B|
  const M2 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], ex = [(B[0] - A[0]), (B[1] - A[1])], cl = Math.hypot(...ex) / 2, e = [ex[0] / (2 * cl), ex[1] / (2 * cl)], n = [-e[1], e[0]];
  const D = dist(S, A) - dist(S, B), a = D / 2, b = Math.sqrt(Math.max(1, cl * cl - a * a));
  const loc = p => [(p[0] - M2[0]) * e[0] + (p[1] - M2[1]) * e[1], (p[0] - M2[0]) * n[0] + (p[1] - M2[1]) * n[1]], uS = Math.asinh(loc(S)[1] / b);
  return {uS, at: u => { const x = Math.sign(a) * Math.abs(a) * Math.cosh(u), y = b * Math.sinh(u); return [M2[0] + x * e[0] + y * n[0], M2[1] + x * e[1] + y * n[1]]; }};
}
function buoyField(stage, t, P, ctx) {
  const c = stage.ctx, k = lerp(0.06, 1, easeInOut((t - P.tilt17[0]) / (P.tilt17[1] - P.tilt17[0]))), pc = cam(30, 40, 0.8, 540, 830, k);
  planBg(stage, pc, smooth((k - 0.2) / 0.6));
  // aircraft track overhead (dashed loop)
  withAlpha(c, smooth((k - 0.3) / 0.5) * 0.8, () => { c.save(); c.beginPath(); c.ellipse(pc.S(0, 0)[0], pc.S(0, 0)[1], 600 * pc.z, 560 * pc.z * k, 0, 0, TAU); c.strokeStyle = 'rgba(200,210,235,0.3)'; c.lineWidth = 1.5; c.setLineDash([12, 12]); c.stroke(); c.restore(); });
  // the wavefront from the hidden source
  const r = P.v17 * (t - P.te17), S = pc.S(...P.src17);
  if (r > 0) for (let j = 0; j < 3; j++) { const rr = r - j * 50; if (rr > 0) ringFx(c, S[0], S[1], rr * pc.z, PAL.sig, [0.85, 0.45, 0.22][j] * Math.max(0, 1 - rr / 1600), 2.2); }
  // hyperbolas
  const hp = clamp((t - P.hypT[0]) / (P.hypT[1] - P.hypT[0]));
  P.hyp.forEach(([i, j], n) => { const ts = P.hypT[0] + n * 0.3 / 1.6 * (P.hypT[1] - P.hypT[0]); for (const b of [P.buoys[i], P.buoys[j]]) { const q = pc.S(...b); burst(c, q[0], q[1], t - ts, 46, PAL.acc, 0.8); } });
  if (hp > 0) P.hyp.forEach(([i, j], n) => {
    const hy = hyperbola(P.buoys[i], P.buoys[j], P.src17), q = clamp(hp * 1.6 - n * 0.3), Lm = 430 * q;
    if (q <= 0) return; c.save(); c.beginPath();
    const side = sg => { const o = []; for (let s = 0; s < 4; s += 0.01) { const w = hy.at(hy.uS + sg * s); if (dist(w, P.src17) > Lm) break; o.push(w); } return o; };
    [...side(-1).reverse(), ...side(1)].forEach((w, k) => { const p = pc.S(...w); k ? c.lineTo(...p) : c.moveTo(...p); });
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(PAL.acc, 0.18); c.lineWidth = 8; c.stroke(); c.strokeStyle = rgba(PAL.acc, 0.9); c.lineWidth = 2.4; c.stroke(); c.restore();
  });
  // buoys (pop in), flash on arrival
  P.buoys.forEach((b, i) => { const s = pc.S(...b), pop = clamp((t - (P.many17 - 0.2 + i * 0.09)) / 0.3); if (pop <= 0) return;
    c.save(); c.globalAlpha *= pop; circle(c, s[0], s[1], 12, rgba(PAL.fill, 1)); c.strokeStyle = rgba(PAL.line, 0.9); c.lineWidth = 2; c.beginPath(); c.arc(s[0], s[1], 12, 0, TAU); c.stroke(); c.restore();
    hydro(c, s[0], s[1], t - P.arr17[i], {r: 4, alpha: pop}); ringFx(c, s[0], s[1], 8 + 18 * (1 - pop), PAL.line, 0.6 * (1 - pop)); });
  // the fix: a shrinking circle around the source, then the source revealed
  const f = clamp((t - P.fix[0]) / (P.fix[1] - P.fix[0]));
  if (f > 0) { ringFx(c, S[0], S[1], lerp(170, 22, easeInOut(f)), PAL.acc, 0.9 * (1 - 0.5 * f), 2.4); burst(c, S[0], S[1], t - P.fix[1], 110, PAL.accHot, 1);
    subTop(c, xf(pc.S, P.src17[0], P.src17[1], 0.55, 1, -0.4), {alpha: smooth((t - P.fix[1]) / 0.5), col: PAL.accHot}); }
  label(stage, '부표', pc.S(...P.buoys[1])[0], pc.S(...P.buoys[1])[1] - 50, win(t, P.many17, P.diff17), {size: 34});
  label(stage, '두 부표의 시각 차이 → 곡선', 540, 1300, win(t, P.diff17 + 0.2, ctx.scene.end), {size: 36, color: PAL.acc});
  label(stage, '소리 나는 곳', S[0] + 20, S[1] - 80, fadeIn(t, P.fix[1] - 0.1, 0.3), {size: 40, color: PAL.accHot});
}

// ------------------------------------------------------------------ myth: active ping reveals us; towed sonar mostly listens
function mythScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start;
  const cm = cam(200 + 30 * smooth((t - s0) / 12), 380, 0.8 + 0.03 * smooth((t - s0) / 12));
  sea(stage, cm, t, {});
  P.mythPas.draw(c, cm, t, {clip: waterClip(cm), alpha: fadeIn(t, P.quiet19 - 0.6, 0.4)});
  for (const te of [P.p18, P.p19]) {
    const r = P.v18 * (t - te), s = cm.S(...P.mythPing), sb = cm.S(...P.mythSub);
    c.save(); c.beginPath(); waterClip(cm)(c); c.clip();
    for (let j = 0; j < 2; j++) { const rr = r - j * 50; if (rr > 0 && rr < P.R18 * 1.5) ringFx(c, s[0], s[1], rr * cm.z, PAL.acc, (j ? 0.4 : 0.9) * (1 - rr / (P.R18 * 1.5)), 2.4); }
    const re = r - P.R18; if (re > 0 && re < P.R18 * 1.2) ringFx(c, sb[0], sb[1], re * cm.z, PAL.acc, 0.55 * (1 - re / (P.R18 * 1.2)), 2);
    c.restore();
    burst(c, s[0], s[1], t - te, 60, PAL.acc, 0.8); burst(c, sb[0], sb[1], t - te - P.R18 / P.v18, 80, PAL.accHot, 0.9); burst(c, s[0], s[1], t - te - 2 * P.R18 / P.v18, 70, PAL.accHot, 0.9);
  }
  drawTow(c, cm, P.mythTow, {age: pt => P.mythPas.age(pt, t)});
  shipSide(c, xf(cm.S, P.mythShip, 0), {spin: t * 8});
  subSide(c, xf(cm.S, P.mythSub[0], P.mythSub[1], 1, -1), {spin: t * 7});
  // the target hears the ping first → a dashed line back to us
  const hearT = P.p19 + P.R18 / P.v18, ba = fadeIn(t, hearT, 0.5) * fadeOut(t, P.quiet19 - 0.2, 0.5);
  if (ba > 0) { const a = cm.S(...P.mythSub), b = cm.S(...P.mythPing), q = [lerp(a[0], b[0], easeOut((t - hearT) / 0.7)), lerp(a[1], b[1], easeOut((t - hearT) / 0.7))];
    withAlpha(c, ba, () => { line(c, [a, q], rgba(PAL.accHot, 0.9), 2.6, {dash: [12, 9]}); }); label(stage, '내 위치가 드러남', (a[0] + b[0]) / 2 + 36, (a[1] + b[1]) / 2 + 6, fadeIn(t, P.show19 - 0.2, 0.3) * ba, {size: 38, color: PAL.accHot, align: 'left'}); }
  // time strip for the first ping: shot → reaches the target → echo back (2R/c)
  const sa = win(t, P.p18 - 0.2, P.no19 + 0.6);
  if (sa > 0) {
    const y = 1250, x0 = 150, x1 = 900, T0 = P.p18 - 0.1, T1 = P.p18 + 2 * P.R18 / P.v18 + 0.3, X = tt => lerp(x0, x1, (tt - T0) / (T1 - T0));
    withAlpha(c, sa, () => { line(c, [[x0, y], [x1, y]], 'rgba(150,172,214,0.6)', 1.6); const cur = X(clamp(t, T0, T1)); line(c, [[x0, y], [cur, y]], rgba(PAL.acc, 0.9), 3); circle(c, cur, y, 5, '#FFFFFF'); });
    [[P.p18, '쏨'], [P.p18 + P.R18 / P.v18, '닿음'], [P.p18 + 2 * P.R18 / P.v18, '메아리']].forEach(([tt, s]) => { const x = X(tt), on = fadeIn(t, tt, 0.2) * sa; withAlpha(c, on, () => { line(c, [[x, y - 14], [x, y + 14]], PAL.acc, 2.5); gl(c, x, y, 24, PAL.acc, 0.6); }); label(stage, s, x, y + 50, on, {size: 32}); });
  }
  label(stage, '조용히 듣기', cm.S(...P.mythTow.pts[6])[0], cm.S(...P.mythTow.pts[6])[1] + 80, fadeIn(t, P.listen19 - 0.2, 0.4), {size: 40, color: PAL.sig});
  const fi = smooth((t - s0) / 0.4); if (fi < 1) { c.fillStyle = `rgba(4,8,22,${1 - fi})`; c.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ close: the poster comes back
function closeScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), s0 = ctx.scene.start;
  const cm = keyCam(t, [[s0, -60, 300, 1.7], [P.poster + 0.6, ...P.posterCam], [P.end, 0, 255, 1.42]]);
  sea(stage, cm, t, {ticks: 0.8});
  posterWorld(stage, t, P, cm);
  const fi = smooth((t - s0) / 0.45); if (fi < 1) { c.fillStyle = `rgba(4,8,22,${1 - fi})`; c.fillRect(0, 0, W, H); }
}

// =====================================================================================================
// --emit-sound: model-driven explanatory sounds (all fundamentals < 700 Hz, mono)
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => { if (!times.length) return; const T = [...times].sort((a, b) => a - b); ev.push({id, at: r(T[0], 4), kind: 'custom', params: {gain_db: gain, layers: T.map((tt, k) => ({kind: 'tick', offset: r(tt - T[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.08, click: 0, gain_db: 0}}))}, means}); };
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -34) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const tone = (id, t0, f, dur, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tone', params: {freq: f, dur, harmonics: o.h || [1, 0.3], attack: o.attack ?? 0.01, decay: o.decay ?? dur * 0.3, sustain: o.sustain ?? 0.4, release: o.release ?? dur * 0.5, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -30, f = 62, dur = 0.5) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur, harmonics: [1, 0.35], attack: 0.006, decay: dur * 0.33, release: dur * 0.33, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: dur * 0.5, low: 30, high: 220, release: dur * 0.35, gain_db: -9}}]}, means});
  const chirp = (id, t0, t1, f, amp, gain, means) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.04) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt)), 4)]); Q[Q.length - 1][2] = 0; ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.3], fade: 0.03, points: Q}, means}); };
  const hum = (id, t0, t1, amp, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += 0.05) Q.push([r(tt - t0), r(clamp(amp(tt) * smooth((tt - t0) / 0.4) * (1 - smooth((tt - (t1 - 0.5)) / 0.5))), 4)]); Q[Q.length - 1][1] = 0;
    ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {gain_db: gain, low: o.low ?? 35, high: o.high ?? 140, fade: 0.05, points: Q}, means}); };
  const sc = id => tl.scene(id);
  // ---- hook
  swell('poster', 0.05, [73, 110], '첫 화면(썸네일): 배 뒤로 늘어진 줄과 줄 위의 빛나는 점들, 멀리서 오는 소리의 파면', {dur: 1.8, gain: -34});
  ev[0].model = {sig: modelSignature(tl)};
  ticks('hook_arrivals', P.hookTow.pts.flatMap(p => P.target.arrivals(p, 0.3, 6.6)), 131, -38, '파면이 줄에 닿는 순서대로 마이크가 빛남 (꼬리 → 머리, 거리 ÷ 화면 속도)', {decay: 0.07});
  whoosh('cable_light', P.cablePulse[0], P.cablePulse[1] - P.cablePulse[0], 90, 200, '빛이 배에서 줄을 따라 꼬리까지 달림', -38);
  whoosh('to_surface', 6.6, 1.0, 200, 90, '카메라가 수면으로 올라감', -36);
  chirp('radio_die', P.radio + 0.9, P.eat2 + 0.6, tt => lerp(330, 110, smooth((tt - P.radio - 0.9) / (P.eat2 - P.radio - 0.3))), tt => 0.3 * (1 - smooth((tt - P.eat2) / 0.6)), -38, '전파가 물에 들어가 몇 m 만에 사라짐 → 내려가며 꺼지는 음');
  swell('sunlight', P.sun, [98, 147], '햇빛의 띠가 깊이와 함께 어두워짐', {dur: 1.8, gain: -36});
  for (let k = 0; k < 3; k++) {
    tick(`emit${k}`, P.sndT0 + k * 1.5, 98, -33, '공기와 물속에서 같은 순간 소리가 남', {decay: 0.12});
  }
  tick('x44', P.x4 - 0.1, 131, -32, '"×4.4" (1,500 m/s 대 340 m/s)', {decay: 0.16});
  whoosh('far_out', P.far3 - 0.3, 1.4, 160, 70, '카메라가 멀리 물러남: 물속 파면이 멀리 퍼짐', -36);
  // ---- origin
  P.pings.forEach((te, k) => { const D = (P.seabed - P.pingSrc[1]) / P.vPing; tone(`ping${k}`, te, 262, 0.35, -31, '소나 핑: 배에서 바닥으로 소리를 쏨 (짧은 음)', {sustain: 0.3});
    tone(`echo${k}`, te + 2 * D, 262, 0.3, -38, `바닥에서 되돌아온 메아리 (왕복 시간 = 2 × 거리 ÷ 화면 속도, ${(2 * D).toFixed(2)}초 뒤, 더 작게)`, {sustain: 0.25}); });
  tick('y1942', P.y42, 123, -34, '"1942"', {decay: 0.14});
  tick('radar', P.radar4, 110, -36, '"RADAR" → "SONAR"', {decay: 0.12});
  ticks('letters', P.so, [131, 147, 165, 196], -36, 'SOund · Navigation · And · Ranging 글자가 하나씩', {decay: 0.1});
  whoosh('split', P.split, 0.6, 90, 220, '화면이 둘로 갈라짐: 능동 | 수동', -36);
  { const R = dist(P.pnl.ping, P.pnl.sub); P.pings5.forEach((te, k) => { tone(`ping5_${k}`, te, 262, 0.35, k ? -35 : -31, '능동: 소리를 쏨', {sustain: 0.3}); tone(`echo5_${k}`, te + 2 * R / P.vPing5, 262, 0.3, k ? -40 : -37, `능동: 메아리가 돌아옴 (2R/c, ${(2 * R / P.vPing5).toFixed(2)}초 뒤)`, {sustain: 0.25}); }); }
  { const pas = P.pnl.pas, G = P.pnl.tow;
    ticks('passive5', G.pts.flatMap(p => pas.arrivals(p, P.quiet5 - 0.9, sc('origin').end)), 123, -38, '수동: 상대의 소리가 줄의 마이크에 차례로 닿음', {decay: 0.07}); }
  // ---- essence
  hum('machines', sc('essence').start, sc('essence').end, () => 0.55, -38, '멀리 있는 배와 잠수함의 프로펠러·엔진: 낮은 웅웅거림', {low: 35, high: 120});
  whoosh('push_prop', P.prop6 - 0.1, 0.8, 90, 200, '잠수함 프로펠러로 다가감', -36);
  chirp('engine', P.eng6, P.low6 + 0.8, () => 55, tt => 0.3 * (0.6 + 0.4 * Math.sin((tt - P.eng6) * 22)), -36, '엔진이 떠는 낮은 음 (55 Hz)');
  whoosh('pull_out', P.low6 - 0.2, 1.3, 200, 80, '멀리 물러남: 낮은 소리 파면만 멀리 감', -36);
  ticks('ess_arrivals', P.ess7arr.flat(), 131, -36, '낮은 소리 파면이 긴 줄의 마이크에 차례로 닿음 (도착 시각 차이)', {decay: 0.07});
  // ---- tow: own-ship noise level follows 1/r² at the array while the cable pays out
  hum('own_noise', sc('tow').start, sc('tow').end, tt => 0.2 + 0.8 * P.level(dist(P.towG(tt).pts[5], P.towSrc)), -30, '내 배의 소음 (줄 위치에서의 크기 ∝ 1/r²): 줄이 풀려 멀어지며 작아짐', {low: 60, high: 260});
  tick('mine', P.mine8, 82, -32, '"내 배" — 프로펠러에서 섬광', {decay: 0.2});
  whoosh('payout', P.pay[0], P.pay[1] - P.pay[0], 140, 70, '줄이 풀려 나감', -36);
  { const T = []; for (let tt = P.pay[1] - 0.2; tt < sc('tow').end; tt += 0.05) {} P.towG(P.pay[1]).pts.forEach(p => T.push(...P.towTarget.arrivals(p, P.pay[1] + 0.1, sc('tow').end))); ticks('tow_arrivals', T, 131, -37, '멀리 끈 뒤: 먼 소리가 마이크에 깨끗하게 차례로 닿음', {decay: 0.07}); }
  // ---- bearing
  whoosh('tilt', P.tilt[0], 0.9, 90, 200, '위에서 본 모습으로 돌아감', -37);
  const e12 = P.el(12), arrB = []; for (const te of P.planTimes) e12.forEach(p => { const a = P.arrPlan(p, te); if (a > sc('bearing').start + 0.5 && a < P.delay[0]) arrB.push(a); });
  ticks('plane_arrivals', arrB, 131, -34, `평면파가 줄의 꼬리부터 머리까지 차례로 닿음 (이웃 사이 Δt = d·cosθ/c, 실제 약 ${(M.dt * 1000).toFixed(1)} ms를 약 ${Math.round(M.slow)}배 느리게)`, {decay: 0.07});
  whoosh('align', P.delay[0], P.delay[1] - P.delay[0], 120, 240, '신호를 늦춰 줄을 맞춤', -37);
  swell('sum', P.sum[1] - 0.2, [98, 147, 196], '맞춘 신호를 더함: 12배로 커진 신호', {dur: 1.4, gain: -31});
  chirp('steer', P.steer[0], P.steer[1], tt => 98 + 98 * beam(P.steerPhi(tt)), tt => 0.08 + 0.42 * beam(P.steerPhi(tt)), -32, '방향을 훑음: 빔의 크기 B(φ) → 음높이·크기 (진짜 방향에서 커짐)');
  tick('grow', P.grow[0], 110, -35, '줄이 두 배로 길어짐', {decay: 0.14});
  chirp('steer24', P.grow[1] + 0.1, P.grow[1] + 1.6, tt => 98 + 98 * beam(lerp(150, 100, (tt - P.grow[1] - 0.1) / 1.5) * D2R, M.theta, 24), tt => 0.08 + 0.42 * beam(lerp(150, 100, (tt - P.grow[1] - 0.1) / 1.5) * D2R, M.theta, 24), -33, '긴 줄로 다시 훑음: 더 좁은 빔 → 더 짧게 솟는 음');
  tone('lambda', P.lam + 0.1, 100, 1.4, -34, '100 Hz 음 (파장 15 m)', {h: [1, 0.25], sustain: 0.6, release: 0.5});
  // ---- ambiguity
  const L = P.amb;
  ticks('amb_arrivals', L.elems(P.straight13).flatMap(p => L.emit.arrivals(p, sc('ambiguity').start + 0.5, L.tTurn - 0.2)), 131, -38, '음원의 파면이 줄에 차례로 닿음 (거울 쪽 음원이어도 같은 순서)', {decay: 0.07});
  swell('two_lines', P.straight13 + 0.1, [110, 165], '방향선 두 개가 동시에: 왼쪽? 오른쪽?', {dur: 1.4, gain: -34});
  whoosh('turn', L.tTurn, 2.4, 80, 180, '배가 방향을 틈 (시간 압축)', -35);
  tick('meas2', L.meas2, 131, -34, '다시 들음: 새 방향선 두 개', {decay: 0.12});
  swell('true', P.true14 - 0.05, [98, 147, 196], '진짜 방향: 두 선이 음원에서 만남', {dur: 1.4, gain: -31});
  tick('ghost', P.mirror14, 82, -35, '거울 방향: 엉뚱한 곳으로 바뀜', {decay: 0.2});
  // ---- aircraft
  hum('aircraft', sc('aircraft').start, P.tilt17[0], tt => tt < P.drops[1].t0 + 1.2 ? 0.45 : 0.3, -40, '초계기의 낮은 엔진 소리 (두 번째 지나감 포함)', {low: 70, high: 200});
  P.drops.forEach((d, k) => { whoosh(`drop${k}`, d.t0, d.hit - d.t0, 200, 110, '부표가 떨어짐', -37); thump(`splash${k}`, d.hit, '부표가 수면에 닿음', -33, 70, 0.4); });
  whoosh('mic_down', P.micDown[0], P.micDown[1] - P.micDown[0], 160, 80, '물속 마이크가 줄을 따라 내려감', -38);
  whoosh('mic_down3', P.drops[2].mic[0], P.drops[2].mic[1] - P.drops[2].mic[0], 160, 80, '새 부표의 물속 마이크도 내려감', -40);
  ticks('buoy_hear', [...P.airLow.arrivals(P.hyd[0], P.micDown[1], P.tilt17[0]), ...P.airLow.arrivals(P.hyd[1], P.drops[2].mic[1], P.tilt17[0])], 131, -35, '두 부표의 마이크에 잠수함 소리가 차례로 닿음 (거리 ÷ 화면 속도)', {decay: 0.08});
  ticks('radio_relay', P.radioEm.flat(), 196, -40, '부표가 전파로 비행기에 보냄 (전파는 들리지 않음: 보내는 순간의 표시음)', {decay: 0.05});
  ticks('plane_rx', P.radioRx, [165, 147], -34, '비행기가 받음 (안테나에서 비행기까지 거리 ÷ 화면 속도)', {decay: 0.12});
  whoosh('tilt17', P.tilt17[0], 0.9, 90, 200, '위에서 본 부표 배치로', -37);
  ticks('field', P.arr17, 131, -34, '파면이 각 부표에 닿는 순서 (거리 ÷ 화면 속도)', {decay: 0.08});
  swell('hyp', P.hypT[0], [110, 147], '시각 차이마다 곡선이 그려짐', {dur: 1.4, gain: -36});
  ticks('hyp_pairs', P.hyp.map((_, n) => P.hypT[0] + n * 0.3 / 1.6 * (P.hypT[1] - P.hypT[0])), [147, 165, 196], -35, '곡선 하나마다 두 부표가 함께 깜빡임 (그 둘의 도착 시각 차이 → 곡선 하나)', {decay: 0.1});
  swell('fix', P.fix[1] - 0.05, [98, 147, 196], '세 곡선이 만나는 곳: 소리 나는 곳', {dur: 1.6, gain: -31});
  // ---- myth: ping → the target hears it at R/c → echo back at 2R/c
  for (const [k, te] of [[0, P.p18], [1, P.p19]]) {
    tone(`act_ping${k}`, te, 262, 0.35, -30, '능동: 소리를 쏨', {sustain: 0.3});
    tick(`act_hit${k}`, te + P.R18 / P.v18, 147, -34, `상대에게 닿음 (거리 ÷ 화면 속도 = ${(P.R18 / P.v18).toFixed(2)}초): 상대도 이 소리를 들음`, {decay: 0.12});
    tone(`act_echo${k}`, te + 2 * P.R18 / P.v18, 262, 0.3, -37, `메아리 (왕복 = 2 × 거리 ÷ 화면 속도 = ${(2 * P.R18 / P.v18).toFixed(2)}초, 더 작게)`, {sustain: 0.25});
  }
  tick('revealed', P.show19, 98, -33, '"내 위치가 드러남" — 상대에게서 우리 쪽으로 방향선', {decay: 0.18});
  ticks('myth_arrivals', P.mythTow.pts.flatMap(p => P.mythPas.arrivals(p, P.quiet19 - 0.6, sc('myth').end)), 131, -37, '조용히 듣기: 상대의 소리가 마이크에 차례로 닿음', {decay: 0.07});
  // ---- close
  swell('poster_back', P.poster, [73, 110, 147], '첫 화면의 포스터가 돌아옴', {dur: 1.8, gain: -32});
  ticks('close_arrivals', P.hookTow.pts.flatMap(p => P.target.arrivals(p, sc('close').start + 0.3, P.end - 0.4)), 131, -38, '마지막: 파면이 줄에 닿는 순서대로 마이크가 빛남', {decay: 0.07});
  return lowBandOnly(ev, modelSignature(tl));
}
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') { const f = Math.max(...p.points.map(q => q[1])); if (f >= HIGH_CUT) throw new Error(`${e.id}: chirp ${f} Hz`); p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT); }
    else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev.sort((a, b) => a.at - b.at);
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const sound = {version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/towed-array-sonar/scenes.mjs --emit-sound`가 scenes.mjs 머리의 같은 모형과 시간 계획에서 써 넣습니다. 대응: 파면이 마이크에 닿음 → 닿는 순서대로 작은 틱(거리 ÷ 화면 속도), 방향 훑기 → 빔 크기 B(φ)를 따라 음높이·크기가 커짐, 내 배 소음 → 줄 위치의 1/r² 크기를 따르는 낮은 잡음(줄이 풀리며 작아짐), 능동 핑 → 짧은 262 Hz 음과 2R/c 뒤 더 작은 메아리, 부표 → 떨어짐·수면·도착 틱. 모든 기본음 700 Hz 아래. 패닝 없음(모노 안전). 타임라인이 바뀌면 다시 실행하세요.',
    events: soundEvents(tl),
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  const txt = JSON.stringify(sound, null, 2).replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]').replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; slow ×${M.slow.toFixed(0)}, Δt ${(M.dt * 1e3).toFixed(2)} ms, poster ${P.poster.toFixed(2)} s, turn ${P.amb.tTurn.toFixed(2)} s`);
}
