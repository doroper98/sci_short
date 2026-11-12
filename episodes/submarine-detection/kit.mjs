// 38 잠수함은 어떻게 찾을까 — shared kit: palette, helpers, camera/surfY, background, matte bodies, signals,
// instrument strip, header and poster. PLAN.md §3 and §5. Scene modules (scenes_core / scenes_intro / scenes_air)
// import from here. Stage-2 workers: ADD functions only; do not change what existing ones do.
//
// Grammar (docs/ANIMATION_QUALITY.md, 2026-11-10): bodies are matte filled masses (top light → bottom dark + a thin
// top highlight); only signals glow (Glow buffers GW warm / GC cool). Warm = came from the submarine, cool = sent by
// the searchers. Surface line is still (a fixed ripple, no motion).
import {rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, ring, rect, withAlpha, TAU, rand, progressBar} from '../../pipeline/render/index.mjs';
import {Glow} from './glow.mjs';

export const W = 1080, H = 1920;
export const theme = {base: 'noturno', accent: '#FFB454'};
export const captionLayout = {};
export const PAL = {ink: '#F4EBDD', muted: '#93A8AE', warm: '#FFB454', hot: '#FFE2B0', cool: '#8CD9FF', coolHi: '#D6F4FF', line: '#3C7387',
  field: '#9FC3CF', panelEdge: '#24505F', rec: '#9FD8F0', sea: '#06303D'};
export const WARM = [1.0, 0.70, 0.30], COOL = [0.55, 0.85, 1.0];
export const PX0 = 70, PX1 = 1010, PY0 = 1128, PY1 = 1338;      // instrument strip
export const WORLD = {y0: 280, y1: 1110};                         // world band (water continues below)
export {rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, line, circle, ring, rect, withAlpha, TAU, rand, progressBar};

// =====================================================================================================
// helpers
// =====================================================================================================
export const fadeIn = (t, t0, d = 0.5) => smooth((t - t0) / d);
export const fadeOut = (t, t1, d = 0.5) => 1 - smooth((t - t1) / d);
export const win = (t, a, b, d = 0.4) => fadeIn(t, a, d) * fadeOut(t, b, d);
export const EASE = {io: easeInOut, o: easeOut, i: easeIn, lin: q => clamp(q)};
/** keyed schedule [[t, v, ease], …] → f(t); ease ('io' | 'o' | 'i' | 'lin') shapes the segment ending at that key */
export function keyed(K) {
  return t => {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [t1, v1, e] = K[i]; if (t < t1) { const [t0, v0] = K[i - 1]; return v0 + (v1 - v0) * EASE[e || 'io']((t - t0) / Math.max(1e-6, t1 - t0)); } }
    return K[K.length - 1][1];
  };
}
/** 1 at t0 falling linearly to 0 over d (0 before t0) — the "struck" flash of a body (PLAN §3.5: 0.25 s) */
export const hitFlash = (t, t0, d = 0.25) => { const a = t - t0; return a < 0 || a > d ? 0 : 1 - a / d; };
/** max of hitFlash over several hit times */
export const hitAny = (t, times, d = 0.25) => times.reduce((m, t0) => Math.max(m, hitFlash(t, t0, d)), 0);

const WARNED = new Set();
/**
 * word anchor: start of `word` in sentence `sid` (searched in the spoken tts chars). If the word is missing (script under
 * review), warn once and return start + frac·(end − start) of that sentence instead of throwing.
 */
export function wd(tl, sid, word, frac = 0.5) {
  try { return tl.wordStart(sid, word); } catch (e) {
    const s = tl.sentence(sid), key = sid + '/' + word;
    if (!WARNED.has(key)) { WARNED.add(key); console.warn(`warning: word "${word}" not in ${sid}; using ${(frac * 100).toFixed(0)}% of the sentence`); }
    return s.start + frac * (s.end - s.start);
  }
}

/** short name tag (sar style): plate + text. size ≥ 24. Returns text width. */
export function tag(stage, s, x, y, o = {}) {
  const size = Math.max(24, o.size || 28), weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 9;
  const x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.74, w + 2 * pad, size * 1.48, 7, rgba('#03141C', o.plateA ?? 0.8), o.border ? rgba(o.border, 0.85) : null, 1.4);
    stage.text(s, x0, y, {size, weight, color: o.color || PAL.ink, role: o.role});
  });
  return w;
}
/** leader line from a body point to a tag; then the tag */
export function tagLeader(stage, s, from, at, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  withAlpha(stage.ctx, a, () => line(stage.ctx, [from, at], rgba(o.lineCol || PAL.field, 0.6), 1.4));
  tag(stage, s, at[0], at[1], o);
}
/** big number (sar bigNum): value + unit, right aligned at x (default 940, baseline 356), pops in at t0 */
export function bigNum(stage, val, unit, t, t0, a = 1, o = {}) {
  const x = o.x ?? 940, y = o.y ?? 356;
  const al = a * smooth((t - t0 + 0.03) / 0.12); if (al <= 0) return;
  const c = stage.ctx, sc = o.pop === false ? 1 : 1 + 0.10 * (1 - easeOut((t - t0) / 0.3)), size = o.size || 120, align = o.align || 'right';
  c.save(); c.translate(x, y); c.scale(sc, sc);
  const sh = {shadow: 'rgba(0,0,0,0.85)', shadowBlur: 16};
  if (align === 'right') {
    const wu = unit ? stage.text(unit, 0, size * 0.2, {role: 'display', weight: 700, size: 55 * size / 120, color: o.unitColor || PAL.warm, alpha: al, align: 'right', ...sh}) : 0;
    stage.text(val, -wu - (unit ? 12 : 0), 0, {role: 'display', weight: 700, size, color: o.color || PAL.ink, alpha: al, align: 'right', ...sh});
  } else {
    const wv = stage.text(val, 0, 0, {role: 'display', weight: 700, size, color: o.color || PAL.ink, alpha: al, align: 'left', ...sh});
    if (unit) stage.text(unit, wv + 12, size * 0.2, {role: 'display', weight: 700, size: 55 * size / 120, color: o.unitColor || PAL.warm, alpha: al, align: 'left', ...sh});
  }
  if (o.sub) stage.text(o.sub, 0, size * 0.62, {role: 'body', weight: 500, size: 30, color: PAL.muted, alpha: al, align, ...sh});
  c.restore();
}

// =====================================================================================================
// camera, surfY and scene transitions (PLAN §3.2)
// =====================================================================================================
export const SURF = {hook: 640, origin: 800, essence: 400, sonar: 560, layer: 560, buoy: 560, mad: 790, mast: 800, close: 640};   // origin·mast 800 (2026-11-12 검수: 떠 있는 잠수함 아래 물이 비어 보여 수면을 내림)
/** camera constants per scene: screen x = x0 + (X − X0)·kx, screen y = surfY + Z·kz (X, Z in m; px scenes use kx = kz = 1) */
export const CAMS = {
  sonar: {x0: 150, X0: 0, kx: 0.44, kz: 0.44},
  layer: {x0: 222, X0: 0, kx: 0.08, kz: 1.0},
  buoy: {x0: 90, X0: 0, kx: 0.075, kz: 1.0},
  mad: {x0: 540, X0: 0, kx: 1.2, kz: 1.2},
};
/** surfY(t) — moves only ±0.5 s around a scene boundary whose two scenes differ (easeInOut) */
export function surfY(t, tl) {
  const S = tl.scenes; let y = SURF[S[0].id] ?? 640;
  for (let i = 1; i < S.length; i++) {
    const b = S[i].start, ya = SURF[S[i - 1].id] ?? 640, yb = SURF[S[i].id] ?? 640;
    if (t < b - 0.5) return ya;
    if (t < b + 0.5) return lerp(ya, yb, easeInOut((t - b + 0.5) / 1.0));
    y = yb;
  }
  return y;
}
/** camera for a scene at time t: {sx(X), sy(Z), X(x), Z(y), surf, kx, kz} */
export function cam(id, t, tl) {
  const k = CAMS[id] || {x0: 0, X0: 0, kx: 1, kz: 1}, surf = surfY(t, tl);
  return {...k, surf, sx: X => k.x0 + (X - k.X0) * k.kx, sy: Z => surf + Z * k.kz, X: x => k.X0 + (x - k.x0) / k.kx, Z: y => (y - surf) / k.kz};
}
/** actors' alpha in a scene: out over 0.35 s before the end, in over 0.35 s after the start (none at film start/end) */
export function actorAlpha(t, sc, tl) {
  const first = sc.start <= 1e-6, last = Math.abs(sc.end - tl.duration) < 1e-3;
  return (first ? 1 : fadeIn(t, sc.start, 0.35)) * (last ? 1 : fadeOut(t, sc.end - 0.35, 0.35));
}

// =====================================================================================================
// background: sky + sea + still surface line (PLAN §3.3)
// =====================================================================================================
const surfRipple = x => 1.5 * Math.sin(x * 0.045 + 0.8 * Math.sin(x * 0.013 + 1.1)) * (0.6 + 0.4 * Math.sin(x * 0.0071 + 2.3));
export function surfacePts(ys, x0 = -10, x1 = W + 10) { const p = []; for (let x = x0; x <= x1; x += 6) p.push([x, ys + surfRipple(x)]); return p; }
export function background(stage, t, ctx) {
  const c = stage.ctx, ys = surfY(t, ctx.tl);
  const g = c.createLinearGradient(0, 0, 0, ys);
  g.addColorStop(0, '#00080F'); g.addColorStop(clamp(280 / ys, 0, 0.99), '#001621'); g.addColorStop(1, '#07303F');
  c.fillStyle = g; c.fillRect(0, 0, W, ys + 1);
  const s = c.createLinearGradient(0, ys, 0, H);
  s.addColorStop(0, '#073442'); s.addColorStop(clamp(500 / (H - ys), 0, 0.98), '#03202B'); s.addColorStop(1, '#01090E');
  c.fillStyle = s; c.fillRect(0, ys, W, H - ys);
  surfaceLine(stage, ys);
}
export function surfaceLine(stage, ys) {
  const c = stage.ctx;
  c.fillStyle = rgba('#2C7C93', 0.18); c.fillRect(0, ys - 10, W, 10);
  line(c, surfacePts(ys), rgba('#4A8AA0', 0.85), 2);
}
/** the thermocline water (layer / buoy scenes): Z 60–140 m; a = scene alpha */
export function layerWater(stage, cm, a = 1, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, y60 = cm.sy(60), y140 = cm.sy(140), ys = cm.surf, yb = o.yBottom ?? H;
  withAlpha(c, a, () => {
    let g = c.createLinearGradient(0, ys, 0, y60); g.addColorStop(0, '#0B4555'); g.addColorStop(1, '#0B4152'); c.fillStyle = g; c.fillRect(0, ys + 1, W, y60 - ys);
    g = c.createLinearGradient(0, y60, 0, y140); g.addColorStop(0, '#0B4152'); g.addColorStop(1, '#04222E'); c.fillStyle = g; c.fillRect(0, y60, W, y140 - y60);
    g = c.createLinearGradient(0, y140, 0, yb); g.addColorStop(0, '#04222E'); g.addColorStop(1, '#010A10'); c.fillStyle = g; c.fillRect(0, y140, W, yb - y140);
    surfaceLine(stage, ys);
  });
}
/** layer boundaries as dashed lines; hi (0..1) brightens them */
export function layerEdges(stage, cm, a = 1, hi = 0) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => { for (const Z of [60, 140]) line(stage.ctx, [[0, cm.sy(Z)], [W, cm.sy(Z)]], rgba(hi > 0 ? mix(PAL.line, PAL.field, hi) : PAL.line, 0.6 + 0.35 * hi), 1.2 + 0.8 * hi, {dash: [6, 7]}); });
}
/** depth ruler in the world: ticks at depths (m), labels right-aligned at xl, faint dashed lines across */
export function depthTicks(stage, cm, depths, a = 1, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, x0 = o.x0 ?? 196, x1 = o.x1 ?? 210, xl = o.xl ?? x0 - 4;
  withAlpha(c, a, () => {
    for (const Z of depths) {
      const y = cm.sy(Z);
      if (o.across !== false && Z > 0) line(c, [[x1, y], [o.acrossTo ?? W, y]], rgba(PAL.line, 0.10), 1, {dash: [2, 8]});
      line(c, [[x0, y], [x1, y]], rgba(PAL.muted, 0.7), 1.5);
      stage.text(Z === 0 ? '0' : Z === depths[depths.length - 1] && o.unitLast !== false ? `${Z} m` : `${Z}`, xl, y, {size: 24, weight: 500, color: PAL.muted, alpha: 0.7, align: o.align || 'right'});
    }
  });
}

// =====================================================================================================
// matte bodies (PLAN §3.4). All: vertical gradient (top light → bottom dark) + 1.2 px top highlight; no gloss.
// dim (0..1) mixes toward the sea colour; lit (0..1) tints with litCol for the struck moment. Return anchor points.
// =====================================================================================================
function matte(c, pathFn, y0, y1, top, bot, o = {}) {
  const dim = o.dim || 0, sea = o.sea || PAL.sea;
  const t1 = dim ? mix(top, sea, dim) : top, b1 = dim ? mix(bot, sea, dim) : bot;
  const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, t1); g.addColorStop(1, b1);
  pathFn(); c.fillStyle = g; c.fill();
  if (o.lit > 0) { pathFn(); c.fillStyle = rgba(o.litCol || PAL.cool, 0.55 * clamp(o.lit)); c.fill(); }
}
const P2 = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

/**
 * submarine. (x, y) = hull centre. o: {len = 360, dir = 1 (bow → +x), a, dim, lit, litCol, mast (0..1), prop (rad), hi (top-line flash)}
 * → {center, bow, tail, prop, sail (top of the fin), mastTop, top, bottom}
 */
export function sub(stage, x, y, o = {}) {
  const c = stage.ctx, L = o.len || 360, dir = o.dir ?? 1, Hh = L * 0.13, a = o.a ?? 1;
  const hh = u => {                                  // half height at u = x / L (bow at +0.5)
    if (u > 0.34) return Hh / 2 * Math.sqrt(Math.max(0, 1 - ((u - 0.34) / 0.16) ** 2));
    if (u > -0.12) return Hh / 2;
    const q = (-0.12 - u) / 0.38; return Hh / 2 * (1 - 0.84 * Math.pow(q, 1.5));
  };
  const top = [], bot = [];
  for (let i = 0; i <= 60; i++) { const u = 0.5 - i / 60; top.push([u * L, -hh(u)]); }
  for (let i = 0; i <= 60; i++) { const u = -0.5 + i / 60; bot.push([u * L, hh(u)]); }
  const sail0 = 0.16 * L, sail1 = 0.30 * L, sH = 0.7 * Hh, mastH = 64 * clamp(o.mast || 0);
  const ex = (lx, ly) => [x + dir * lx, y + ly];
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    const sea = o.sea, dim = o.dim || 0, lit = o.lit || 0, litCol = o.litCol;
    // mast (behind the sail top): a thin tube
    if (mastH > 0) {
      const mx = sail0 + 0.35 * (sail1 - sail0);
      matte(c, () => { c.beginPath(); c.rect(mx - 3, -Hh / 2 - sH - mastH, 6, mastH + 4); }, -Hh / 2 - sH - mastH, -Hh / 2 - sH, '#7E929C', '#33454E', {dim: dim * 0.5, lit: o.mastLit || 0, litCol: o.mastLitCol || PAL.cool, sea});
      c.beginPath(); c.rect(mx - 5, -Hh / 2 - sH - mastH - 3, 10, 6); c.fillStyle = mix('#8FA3AC', sea || PAL.sea, dim * 0.5); c.fill();
    }
    // tail fins (upper and lower), behind the hull
    const fin = s => P2(c, [[-0.40 * L, s * Hh * 0.18], [-0.46 * L, s * Hh * 0.95], [-0.49 * L, s * Hh * 0.95], [-0.475 * L, s * Hh * 0.1]]);
    matte(c, () => fin(-1), -Hh, 0, '#4A6170', '#22323B', {dim, lit, litCol, sea});
    matte(c, () => fin(1), 0, Hh, '#2A3B45', '#121D23', {dim, lit, litCol, sea});
    // propeller: a flattened ellipse whose width follows |cos(prop)|
    const pw = 2 + 7 * Math.abs(Math.cos(o.prop || 0));
    c.beginPath(); c.ellipse(-0.5 * L - 4, 0, pw, Hh * 0.46, 0, 0, TAU); c.fillStyle = mix('#5B6E78', sea || PAL.sea, dim); c.fill();
    line(c, [[-0.5 * L + 2, 0], [-0.5 * L - 4, 0]], mix('#3A4B54', sea || PAL.sea, dim), 3);
    // sail (fin) with a sloped back
    const sailPath = () => P2(c, [[sail0, -Hh / 2 + 2], [sail0 + 0.01 * L, -Hh / 2 - sH], [sail1 - 0.025 * L, -Hh / 2 - sH], [sail1, -Hh / 2 - sH * 0.55], [sail1 + 0.01 * L, -Hh / 2 + 2]]);
    matte(c, sailPath, -Hh / 2 - sH, -Hh / 2, '#56707F', '#2C3F49', {dim, lit, litCol, sea});
    // sail planes
    matte(c, () => P2(c, [[sail0 + 0.025 * L, -Hh / 2 - sH * 0.55], [sail0 + 0.075 * L, -Hh / 2 - sH * 0.6], [sail0 + 0.075 * L, -Hh / 2 - sH * 0.47], [sail0 + 0.02 * L, -Hh / 2 - sH * 0.45]]), -Hh, 0, '#3C515D', '#22323B', {dim, lit, litCol, sea});
    // hull
    const hull = () => { c.beginPath(); top.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); bot.forEach(([px, py]) => c.lineTo(px, py)); c.closePath(); };
    matte(c, hull, -Hh / 2, Hh / 2, '#4A6170', '#16242C', {dim, lit, litCol, sea});
    // lower hull shade band (form, not gloss)
    c.save(); hull(); c.clip(); c.fillStyle = rgba('#050C10', 0.28 * (1 - dim * 0.6)); c.fillRect(-L, Hh * 0.12, 2 * L, Hh); c.restore();
    // top highlight
    const hiA = (0.5 + 0.45 * (o.hi || 0)) * (1 - 0.75 * dim);
    line(c, top.filter(([px]) => px > -0.42 * L && px < 0.47 * L), rgba(o.hi ? mix('#8FA7B3', '#E6EEF2', o.hi) : '#8FA7B3', hiA), 1.2 + (o.hi || 0));
    line(c, [[sail0 + 0.01 * L, -Hh / 2 - sH], [sail1 - 0.025 * L, -Hh / 2 - sH]], rgba('#8FA7B3', hiA), 1.2);
    c.restore();
  });
  const mx = sail0 + 0.35 * (sail1 - sail0);
  return {center: [x, y], bow: ex(0.5 * L, 0), tail: ex(-0.5 * L, 0), prop: ex(-0.5 * L - 4, 0), sail: ex((sail0 + sail1) / 2, -Hh / 2 - sH),
    mastTop: ex(mx, -Hh / 2 - sH - mastH), top: [x, y - Hh / 2], bottom: [x, y + Hh / 2], len: L, h: Hh};
}

/**
 * patrol aircraft, side view (generic). (x, y) = fuselage centre. o: {len = 300, dir = 1 (nose → +x), a, lit, litCol, boomLit (0..1 warm), prop (rad)}
 * → {center, nose, boom (tail-boom tip = MAD sensor), tail, belly}
 */
export function plane(stage, x, y, o = {}) {
  const c = stage.ctx, L = o.len || 300, dir = o.dir ?? 1, a = o.a ?? 1, R = L * 0.052, lit = o.lit || 0, litCol = o.litCol;
  const nose = 0.5 * L, tailX = -0.42 * L, boomL = 0.18 * L;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    // MAD boom: thin rod behind the tail
    const bx0 = tailX - 0.02 * L, bx1 = bx0 - boomL;
    line(c, [[bx0, -R * 0.55], [bx1, -R * 0.55]], '#B9B3A4', 3.2);
    circle(c, bx1, -R * 0.55, 3.2, '#B9B3A4');
    if (o.boomLit > 0) { line(c, [[bx0 - boomL * 0.5, -R * 0.55], [bx1, -R * 0.55]], rgba(PAL.warm, 0.8 * clamp(o.boomLit)), 3.2); circle(c, bx1, -R * 0.55, 4, rgba(PAL.warm, clamp(o.boomLit))); }
    // far-side engine (darker, behind)
    const nac = (cx, dy, top, bot) => matte(c, () => { c.beginPath(); c.roundRect(cx - 0.07 * L, dy - R * 0.42, 0.15 * L, R * 0.84, R * 0.42); }, dy - R * 0.4, dy + R * 0.4, top, bot, {lit, litCol});
    nac(0.17 * L, R * 0.62, '#9E998C', '#5F5B52');
    // vertical tail fin
    matte(c, () => P2(c, [[-0.26 * L, -R * 0.7], [-0.37 * L, -R * 3.6], [-0.43 * L, -R * 3.6], [-0.44 * L, -R * 0.6]]), -R * 3.6, 0, '#D9D3C4', '#8F897C', {lit, litCol});
    // fuselage: rounded nose, upswept tail cone
    const fus = () => {
      c.beginPath(); c.moveTo(-0.44 * L, -R * 0.95); c.lineTo(0.30 * L, -R);
      c.bezierCurveTo(0.42 * L, -R, nose, -R * 0.55, nose, R * 0.1);
      c.bezierCurveTo(nose, R * 0.7, 0.44 * L, R, 0.34 * L, R);
      c.lineTo(-0.16 * L, R); c.bezierCurveTo(-0.30 * L, R, -0.40 * L, R * 0.1, -0.45 * L, -R * 0.35); c.closePath();
    };
    matte(c, fus, -R, R, '#D9D3C4', '#7F7A6E', {lit, litCol});
    c.save(); fus(); c.clip(); c.fillStyle = rgba('#3A372F', 0.22); c.fillRect(-L, R * 0.25, 2 * L, R); c.restore();
    line(c, [[-0.40 * L, -R * 0.95], [0.30 * L, -R]], rgba('#FFFFFF', 0.45), 1.2);
    // cockpit window band (dark, matte)
    P2(c, [[0.40 * L, -R * 0.78], [0.455 * L, -R * 0.45], [0.43 * L, -R * 0.3], [0.385 * L, -R * 0.45]]); c.fillStyle = '#3E4A50'; c.fill();
    // wing, seen nearly edge-on: a thin dark blade across the upper fuselage
    matte(c, () => P2(c, [[-0.02 * L, -R * 0.35], [0.24 * L, -R * 0.55], [0.26 * L, -R * 0.2], [0.0, -R * 0.05]]), -R * 0.6, 0, '#B7B1A2', '#6E695E', {lit, litCol});
    // near-side engine under the wing + propeller disc (thin ellipse)
    nac(0.10 * L, R * 0.55, '#CFC9BA', '#77736A');
    const pw = 1.5 + 2.5 * Math.abs(Math.cos(o.prop || 0));
    for (const ex of [0.175 * L, 0.245 * L]) { c.beginPath(); c.ellipse(ex, R * 0.58 + (ex > 0.2 * L ? 0.06 * R : 0), pw, R * 1.15, 0, 0, TAU); c.fillStyle = rgba('#C8C2B4', 0.55); c.fill(); }
    c.restore();
  });
  const ex = (lx, ly) => [x + dir * lx, y + ly];
  return {center: [x, y], nose: ex(nose, R * 0.1), boom: ex(tailX - 0.02 * L - boomL, -R * 0.55), tail: ex(tailX, 0), belly: ex(0, R), len: L};
}

/**
 * warship (generic), drawn at the waterline y. o: {len = 260, dir = 1 (bow → +x), a, lit, litCol, dim (under-water part)}
 * → {dome (sonar dome under the bow), stern (waterline at the stern), bow, mast, center}
 */
export function ship(stage, x, y, o = {}) {
  const c = stage.ctx, L = o.len || 260, dir = o.dir ?? 1, a = o.a ?? 1, lit = o.lit || 0, litCol = o.litCol;
  const fb = L * 0.055, dr = L * 0.045;          // freeboard, draft
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    // under-water hull + sonar dome (seen through the water: darker)
    const uw = () => { c.beginPath(); c.moveTo(-0.47 * L, 0); c.lineTo(0.47 * L, 0); c.quadraticCurveTo(0.40 * L, dr, 0.30 * L, dr); c.lineTo(-0.42 * L, dr * 0.9); c.lineTo(-0.47 * L, 0.2 * dr); c.closePath(); };
    matte(c, uw, 0, dr, '#2C4148', '#132026', {});
    c.beginPath(); c.arc(0.36 * L, dr * 0.85, L * 0.028, 0, Math.PI); c.fillStyle = '#3A5058'; c.fill();
    c.beginPath(); c.arc(0.36 * L, dr * 0.85, L * 0.028, 0, Math.PI); c.fillStyle = rgba(PAL.cool, 0.6 * clamp(o.domeLit || 0)); c.fill();
    if (o.domeWarm) { c.beginPath(); c.arc(0.36 * L, dr * 0.85, L * 0.028, 0, Math.PI); c.fillStyle = rgba(PAL.warm, 0.7 * clamp(o.domeWarm)); c.fill(); }
    // hull above water: sheer rising to a raked bow
    const hull = () => P2(c, [[-0.47 * L, -fb * 0.8], [0.20 * L, -fb], [0.50 * L, -fb * 1.55], [0.47 * L, 0], [-0.47 * L, 0]]);
    matte(c, hull, -fb * 1.5, 0, '#7E949A', '#2C4148', {lit, litCol});
    // stepped superstructure + mast
    const sup = () => P2(c, [[-0.26 * L, -fb * 0.85], [-0.26 * L, -fb * 1.9], [-0.06 * L, -fb * 1.9], [-0.04 * L, -fb * 2.9], [0.10 * L, -fb * 2.9], [0.14 * L, -fb * 1.9], [0.20 * L, -fb * 1.9], [0.21 * L, -fb * 0.95]]);
    matte(c, sup, -fb * 2.9, -fb, '#A9B8BB', '#5B7178', {lit, litCol});
    matte(c, () => P2(c, [[0.01 * L, -fb * 2.9], [0.025 * L, -fb * 5.2], [0.04 * L, -fb * 5.2], [0.06 * L, -fb * 2.9]]), -fb * 5.2, -fb * 2.9, '#A9B8BB', '#6C8188', {lit, litCol});
    line(c, [[-0.01 * L, -fb * 4.5], [0.075 * L, -fb * 4.5]], '#93A5A9', 2.2);
    // a gun mount on the bow deck and a funnel block aft
    matte(c, () => P2(c, [[0.27 * L, -fb * 1.05], [0.28 * L, -fb * 1.5], [0.34 * L, -fb * 1.5], [0.35 * L, -fb * 1.15]]), -fb * 1.5, -fb, '#A9B8BB', '#6C8188', {lit, litCol});
    line(c, [[0.33 * L, -fb * 1.35], [0.42 * L, -fb * 1.5]], '#8FA1A6', 2);
    matte(c, () => P2(c, [[-0.20 * L, -fb * 1.9], [-0.19 * L, -fb * 2.6], [-0.12 * L, -fb * 2.6], [-0.11 * L, -fb * 1.9]]), -fb * 2.6, -fb * 1.9, '#8E9FA3', '#56696F', {lit, litCol});
    line(c, [[-0.47 * L, -fb * 0.8], [0.20 * L, -fb], [0.50 * L, -fb * 1.55]], rgba('#D5E0E3', 0.55), 1.2);
    c.restore();
  });
  const ex = (lx, ly) => [x + dir * lx, y + ly];
  return {dome: ex(0.36 * L, dr * 0.85 + L * 0.014), stern: ex(-0.47 * L, 0), bow: ex(0.5 * L, 0), mast: ex(0.03 * L, -fb * 5.2), center: [x, y - fb], len: L,
    box: [x - 0.5 * L, y - fb * 5.2, L, fb * 5.2 + dr]};
}

/**
 * helicopter (generic). (x, y) = cabin centre. o: {len = 170, dir = 1 (nose → +x), a, rotor (rad), lit, litCol}
 * → {center, hook (winch point under the cabin), nose, rotorHub}
 */
export function heli(stage, x, y, o = {}) {
  const c = stage.ctx, L = o.len || 170, dir = o.dir ?? 1, a = o.a ?? 1, lit = o.lit || 0, litCol = o.litCol, R = L * 0.13;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    // tail boom and fin
    matte(c, () => P2(c, [[-0.05 * L, -R * 0.55], [-0.50 * L, -R * 0.35], [-0.50 * L, -R * 0.05], [-0.05 * L, R * 0.15]]), -R * 0.6, R * 0.2, '#C6CCC9', '#6F7B7C', {lit, litCol});
    matte(c, () => P2(c, [[-0.44 * L, -R * 0.3], [-0.52 * L, -R * 1.5], [-0.56 * L, -R * 1.5], [-0.53 * L, -R * 0.1]]), -R * 1.5, 0, '#C6CCC9', '#7F8A8B', {lit, litCol});
    const tw = 1.5 + 0.09 * L * Math.abs(Math.cos((o.rotor || 0) * 5.3));
    c.beginPath(); c.ellipse(-0.53 * L, -R * 0.75, tw * 0.3, 0.09 * L, 0, 0, TAU); c.fillStyle = rgba('#B8C0BE', 0.5); c.fill();
    // cabin: rounded teardrop
    const cab = () => { c.beginPath(); c.moveTo(-0.12 * L, -R); c.lineTo(0.14 * L, -R); c.bezierCurveTo(0.26 * L, -R, 0.32 * L, -R * 0.1, 0.30 * L, R * 0.35);
      c.bezierCurveTo(0.28 * L, R * 0.85, 0.18 * L, R, 0.08 * L, R); c.lineTo(-0.10 * L, R); c.bezierCurveTo(-0.20 * L, R * 0.8, -0.20 * L, -R * 0.6, -0.12 * L, -R); c.closePath(); };
    matte(c, cab, -R, R, '#C6CCC9', '#6F7B7C', {lit, litCol});
    c.save(); cab(); c.clip(); c.fillStyle = rgba('#2A3233', 0.25); c.fillRect(-L, R * 0.3, 2 * L, R); c.restore();
    P2(c, [[0.17 * L, -R * 0.82], [0.27 * L, -R * 0.2], [0.21 * L, -R * 0.15], [0.14 * L, -R * 0.7]]); c.fillStyle = '#3E4A50'; c.fill();
    line(c, [[-0.12 * L, -R], [0.14 * L, -R]], rgba('#FFFFFF', 0.4), 1.2);
    // skids
    line(c, [[-0.04 * L, R], [-0.06 * L, R * 1.45]], '#7F8A8B', 2.5); line(c, [[0.16 * L, R], [0.18 * L, R * 1.45]], '#7F8A8B', 2.5);
    line(c, [[-0.14 * L, R * 1.45], [0.26 * L, R * 1.45]], '#9AA4A4', 3);
    // rotor mast + blade (seen from the side: a long thin ellipse whose length follows the blade angle)
    line(c, [[0.02 * L, -R], [0.02 * L, -R * 1.55]], '#7F8A8B', 4);
    const bl = 0.25 * L + 0.40 * L * Math.abs(Math.cos(o.rotor || 0));
    c.beginPath(); c.ellipse(0.02 * L, -R * 1.6, bl, 2.6, 0, 0, TAU); c.fillStyle = '#9AA4A4'; c.fill();
    c.restore();
  });
  const ex = (lx, ly) => [x + dir * lx, y + ly];
  return {center: [x, y], hook: ex(0.04 * L, R * 1.0), nose: ex(0.30 * L, 0), rotorHub: ex(0.02 * L, -R * 1.6), len: L};
}

/** sonobuoy floating at the surface. o: {a, lit, litCol, scale} → {tip (antenna end), bottom, center} */
export function buoy(stage, x, ySurf, o = {}) {
  const c = stage.ctx, s = o.scale || 1, w = 16 * s, h = 44 * s, a = o.a ?? 1;
  const y0 = ySurf - h * 0.45, y1 = ySurf + h * 0.55;
  withAlpha(c, a, () => {
    line(c, [[x, y0], [x, y0 - 28 * s]], '#BEB8AA', 2);
    circle(c, x, y0 - 28 * s, 2.5, '#BEB8AA');
    matte(c, () => { c.beginPath(); c.roundRect(x - w / 2, y0, w, h, 4); }, y0, y1, '#D8D2C4', '#8B8679', {lit: o.lit, litCol: o.litCol});
    c.fillStyle = rgba('#03202B', 0.45); c.fillRect(x - w / 2, ySurf, w, y1 - ySurf);   // the submerged half, seen through water
    line(c, [[x - w / 2 + 2, y0 + 0.5], [x + w / 2 - 2, y0 + 0.5]], rgba('#FFFFFF', 0.5), 1.2);
  });
  return {tip: [x, y0 - 28 * s], bottom: [x, y1], center: [x, ySurf]};
}
/** underwater microphone (hydrophone). o: {a, lit (warm by default), litCol, d = 14} → {center, top} */
export function hydro(stage, x, y, o = {}) {
  const c = stage.ctx, d = o.d || 14, a = o.a ?? 1;
  withAlpha(c, a, () => {
    matte(c, () => { c.beginPath(); c.roundRect(x - d / 2, y - d * 0.7, d, d * 1.4, d / 2); }, y - d * 0.7, y + d * 0.7, '#C9D2D4', '#6E7A7D', {lit: o.lit, litCol: o.litCol || PAL.warm});
    line(c, [[x - d / 2 + 2, y - d * 0.7 + 1], [x + d / 2 - 2, y - d * 0.7 + 1]], rgba('#FFFFFF', 0.45), 1.2);
  });
  return {center: [x, y], top: [x, y - d * 0.7]};
}
/** the cable a hydrophone or towed body hangs on (1.5 px #9FB3B8 alpha 0.7) */
export function cable(stage, pts, a = 1) { withAlpha(stage.ctx, a, () => line(stage.ctx, pts, rgba('#9FB3B8', 0.7), 1.5)); }
/** towed / dipping sonar body: small droplet (len 34). o: {dir, a, lit, litCol} → {center, nose, tail} */
export function sonarBody(stage, x, y, o = {}) {
  const c = stage.ctx, L = o.len || 34, dir = o.dir ?? 1, a = o.a ?? 1, h = L * 0.34;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    const p = () => { c.beginPath(); c.moveTo(L / 2, 0); c.bezierCurveTo(L / 2, -h * 0.75, L * 0.15, -h / 2, 0, -h / 2); c.lineTo(-L / 2, -h * 0.12); c.lineTo(-L / 2, h * 0.12); c.lineTo(0, h / 2); c.bezierCurveTo(L * 0.15, h / 2, L / 2, h * 0.75, L / 2, 0); c.closePath(); };
    matte(c, p, -h / 2, h / 2, '#C9D2D4', '#5F6C70', {lit: o.lit, litCol: o.litCol});
    P2(c, [[-L / 2, -h * 0.1], [-L / 2 - 6, -h * 0.55], [-L / 2 - 2, 0], [-L / 2 - 6, h * 0.55], [-L / 2, h * 0.1]]); c.fillStyle = '#7C888B'; c.fill();
    c.restore();
  });
  return {center: [x, y], nose: [x + dir * L / 2, y], tail: [x - dir * L / 2, y]};
}

// =====================================================================================================
// signals (PLAN §3.5): two Glow buffers per frame. glowBegin() → splats → glowFlush(stage) at the scene's end.
// =====================================================================================================
let GW = null, GC = null;
/** start a frame's glow; → {GW (warm), GC (cool)} */
export function glowBegin() { GW ||= new Glow(); GC ||= new Glow(); GW.begin(); GC.begin(); return {GW, GC}; }
export function glowFlush(stage, o = {}) { GW.flush(stage, {gain: 1.25, bloom: 0.38, ...o}); GC.flush(stage, {gain: 1.25, bloom: 0.38, ...o}); }
export const colOf = G => (G === GW ? WARM : COOL);
/**
 * circular wavefront: crests at r − gap·j (strength 1, 0.6, 0.32). o: {col, amp = 1, crests = 3, gap = 16, a0, a1 (rad), clip(x, y), rad = 6, step = 7}
 * clip(x, y) false → skip (use it to drop sound above the surface).
 */
export function ringWave(G, cx, cy, r, o = {}) {
  const col = o.col || colOf(G), amp = o.amp ?? 1, n = o.crests ?? 3, gap = o.gap ?? 16, a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU, rad = o.rad ?? 6, step = o.step ?? 7;
  const S = [1, 0.6, 0.32, 0.2];
  for (let j = 0; j < n; j++) {
    const rr = r - gap * j; if (rr <= 1) continue;
    const k = amp * S[Math.min(j, 3)] * 0.55, m = Math.max(6, Math.ceil(rr * (a1 - a0) / step));
    for (let i = 0; i <= m; i++) { const th = a0 + (a1 - a0) * i / m, x = cx + rr * Math.cos(th), y = cy + rr * Math.sin(th); if (o.clip && !o.clip(x, y)) continue; G.splat(x, y, rad, col, k); }
  }
}
/** radar beam pulse at fraction q of from → to: three short arcs across the direction (±0.16 rad). o: {col, amp} */
export function beamPulse(G, from, to, q, o = {}) {
  if (q < 0 || q > 1) return;
  const col = o.col || colOf(G), amp = o.amp ?? 1, dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  for (const [lag, k] of [[0, 1], [11, 0.6], [22, 0.32]]) {
    const d = q * L - lag; if (d < 0) continue;
    for (let u = -0.16; u <= 0.1601; u += 0.04) G.splat(from[0] + d * Math.cos(ang + u), from[1] + d * Math.sin(ang + u), 5.5, col, amp * k * 0.6 * (1 - 2 * u * u / 0.0256 * 0.25));
  }
}
/** a short burst at a point (e.g. radar dying at the surface) */
export function splatBurst(G, x, y, r, k, col) { G.splat(x, y, r, col || colOf(G), k); }
/**
 * ray drawn to its head: trail as a canvas line (lw 1.6, alpha 0.5), head as a Glow splat.
 * pts: [{x, z, t}] world; cm: camera; tau: real seconds since launch (already × the scene's time factor).
 * o: {col (hex), G, lw, alpha, dash, headAmp, from (tau where the trail starts, for echoes running back), back (bool: draw from the end toward the start)}
 * → head screen point or null
 */
export function rayPath(stage, pts, cm, tau, o = {}) {
  const c = stage.ctx, col = o.col || PAL.cool, lw = o.lw ?? 1.6, al = o.alpha ?? 0.5;
  if (tau <= 0 || pts.length < 2) return null;
  const tEnd = pts[pts.length - 1].t, tt = Math.min(tau, tEnd), out = [];
  for (let i = 0; i < pts.length; i++) { if (pts[i].t > tt) { const a = pts[i - 1], b = pts[i], q = (tt - a.t) / Math.max(1e-9, b.t - a.t); out.push([cm.sx(a.x + q * (b.x - a.x)), cm.sy(a.z + q * (b.z - a.z))]); break; } out.push([cm.sx(pts[i].x), cm.sy(pts[i].z)]); }
  if (al > 0 && out.length > 1) line(c, out, rgba(col, al), lw, {dash: o.dash || null});
  const head = out[out.length - 1];
  if (o.G && tau <= tEnd && (o.headAmp ?? 1) > 0) { o.G.splat(head[0], head[1], 7, o.gcol || colOf(o.G), 0.75 * (o.headAmp ?? 1)); }
  return head;
}
/** full ray as a static path (screen pts) */
export const rayScreen = (pts, cm) => pts.map(p => [cm.sx(p.x), cm.sy(p.z)]);
/** point at real time tau along a ray (screen), plus whether finished */
export function rayHead(pts, cm, tau) {
  const tEnd = pts[pts.length - 1].t; if (tau >= tEnd) return {p: [cm.sx(pts[pts.length - 1].x), cm.sy(pts[pts.length - 1].z)], done: true};
  for (let i = 1; i < pts.length; i++) if (pts[i].t >= tau) { const a = pts[i - 1], b = pts[i], q = (tau - a.t) / Math.max(1e-9, b.t - a.t); return {p: [cm.sx(a.x + q * (b.x - a.x)), cm.sy(a.z + q * (b.z - a.z))], done: false}; }
  return {p: [cm.sx(pts[0].x), cm.sy(pts[0].z)], done: false};
}

// =====================================================================================================
// instrument strip (PLAN §5)
// =====================================================================================================
export const REC_BASE = PY1 - 52;
export function panel(stage, a = 1) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => rect(stage.ctx, PX0, PY0, PX1 - PX0, PY1 - PY0, 8, rgba('#03141C', 0.78), PAL.panelEdge, 1.4));
}
/** panel name, top-left (PX0 + 16, PY0 + 24) unless x/y given */
export function panelLabel(stage, text, a = 1, o = {}) {
  if (a <= 0 || !text) return;
  stage.text(text, o.x ?? PX0 + 16, o.y ?? PY0 + 24, {role: 'body', weight: 500, size: 24, color: o.color || PAL.muted, alpha: a, align: o.align || 'left'});
}
/** tick labels along the bottom (y = PY1 − 22), 6 px tick marks above them. ticks: [{x, label}] */
export function axisTicks(stage, ticks, a = 1, o = {}) {
  if (a <= 0) return;
  const c = stage.ctx, y = o.y ?? PY1 - 22, base = o.base ?? REC_BASE;
  withAlpha(c, a, () => {
    if (o.axis !== false) line(c, [[o.x0 ?? 100, base], [o.x1 ?? 940, base]], rgba(PAL.field, 0.22), 1);
    for (const tk of ticks) { line(c, [[tk.x, base], [tk.x, base + 6]], rgba(PAL.muted, 0.7), 1.4); stage.text(tk.label, tk.x, y, {size: 24, weight: 500, color: PAL.muted, align: tk.align || 'center'}); }
  });
}
/** record line: pts [[x, y]] drawn as a 2 px line; the pen tip (last point) glows. o: {col, alpha, lw, G, pen (bool), dash} */
export function recordLine(stage, pts, o = {}) {
  if (pts.length < 2) return;
  const a = o.alpha ?? 0.85;
  line(stage.ctx, pts, rgba(o.col || PAL.rec, a), o.lw ?? 2, {dash: o.dash || null});
  if (o.G && o.pen !== false) { const p = pts[pts.length - 1]; o.G.splat(p[0], p[1], 6, o.gcol || colOf(o.G), 0.7); }
}
/** a peak shape on the record: base − h·exp(−((x − xc)/w)²) */
export const peakY = (x, xc, h, w = 9, base = REC_BASE) => base - h * Math.exp(-(((x - xc) / w) ** 2));
/** sample a record function y(x) from x0 to x1 (step px) → [[x, y]] */
export function sampleRec(fy, x0, x1, step = 3) { const p = []; for (let x = x0; x <= x1 + 1e-6; x += step) p.push([x, fy(x)]); if (p.length && p[p.length - 1][0] < x1) p.push([x1, fy(x1)]); return p; }
/** deterministic record noise (±amp px) */
export const recNoise = (x, amp = 2, seed = 0) => amp * (2 * rand(Math.floor(x / 3) * 1.31 + seed) - 1) * 0.6 + amp * 0.4 * Math.sin(x * 0.37 + seed);
/** dotted tie from a world x down to the panel's top edge */
export function tieLine(stage, x, yFrom, a = 1, o = {}) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => line(stage.ctx, [[x, yFrom], [x, o.yTo ?? PY0]], rgba(o.col || PAL.line, 0.5), 1.2, {dash: [3, 8]}));
}
/** dashed empty box on the record (where something should be but is not) */
export function emptyBox(stage, x, a = 1, o = {}) {
  if (a <= 0) return;
  const w = o.w ?? 60, h = o.h ?? 70, base = o.base ?? REC_BASE;
  withAlpha(stage.ctx, a, () => { const c = stage.ctx; c.beginPath(); c.rect(x - w / 2, base - h, w, h); c.strokeStyle = rgba(PAL.muted, 0.6); c.lineWidth = 1.5; c.setLineDash([4, 5]); c.stroke(); c.setLineDash([]); });
}
/** received-sound waveform: a damped sine burst for each arrival time (0.5 s). → y offset at x for time t */
export function waveOffset(x, t, arrivals, o = {}) {
  const amp = o.amp ?? 20, x0 = o.x0 ?? 100, x1 = o.x1 ?? 940, dur = o.dur ?? 0.5;
  // the trace scrolls: newest at the right edge (x1), x maps to time t − (x1 − x)/pxs
  const pxs = o.pxs ?? 420, tt = t - (x1 - x) / pxs;
  let y = 0;
  for (const ta of arrivals) { const a = tt - ta; if (a < 0 || a > dur) continue; y += amp * (o.k ?? 1) * Math.exp(-a / (dur * 0.35)) * Math.sin(a * TAU * 9); }
  return y + 1.2 * Math.sin(x * 0.9 + tt * 7) * (o.noise ?? 1);
}

// =====================================================================================================
// zoom lens (a magnified window tied to a point by two tangent leader lines)
// =====================================================================================================
/** frame of a lens circle opened from `from`; q = opening 0..1. Returns clip function clipLens(fn). */
export function lens(stage, cx, cy, r, from, q, o = {}) {
  const c = stage.ctx, rr = r * easeOut(q);
  const clipLens = fn => { if (rr <= 1) return; c.save(); c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.clip(); try { fn(rr); } finally { c.restore(); } };
  const frame = () => {
    if (rr <= 1) return;
    const d = Math.hypot(from[0] - cx, from[1] - cy), beta = Math.atan2(from[1] - cy, from[0] - cx), phi = Math.acos(Math.min(1, rr / Math.max(d, rr + 1e-3)));
    withAlpha(c, (o.a ?? 1) * clamp(q * 2), () => {
      for (const s of [-1, 1]) line(c, [from, [cx + rr * Math.cos(beta + s * phi), cy + rr * Math.sin(beta + s * phi)]], rgba(PAL.line, 0.9), 1.4);
      ring(c, cx, cy, rr, rgba(PAL.line, 1), 2);
      circle(c, from[0], from[1], 3.5, rgba(PAL.field, 0.8));
    });
  };
  return {rr, clipLens, frame};
}

// =====================================================================================================
// header, poster, caption band (sar style; PLAN §3.1, §3.6)
// =====================================================================================================
export function head(stage, kicker, title, aK, aT) {
  const c = stage.ctx, so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18};
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warm, align: 'center', tracking: 1.5, maxWidth: 880, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 56, color: PAL.ink, align: 'center', maxWidth: 880, ...so}));
}
/** header from a title list [[t, kicker, title], …] (first t = −Infinity), cross-fading at each switch; a = scene alpha */
export function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
}
export const POSTER = {q: '잠수함은 어떻게 찾을까?', a: '소리와 자기장으로', y: 742, y2: 878};
let QS = 0, AS = 0;
/** poster title: q = 0 poster (big question + big warm answer, dark plate 640–975), q = 1 header title position */
export function posterTitle(stage, q, a = 1) {
  const c = stage.ctx, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: -0.03 * max}));
  QS ||= fit(POSTER.q, 880, 104); AS ||= fit(POSTER.a, 860, 150);
  const y1 = lerp(POSTER.y, 228, q), s1 = lerp(QS, 56, q), tr = lerp(-0.03, -0.011, q);
  if (q < 1) withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, 640, 0, 975); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.3, 'rgba(0,10,16,0.55)'); g.addColorStop(0.75, 'rgba(0,10,16,0.55)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, 640, W, 335); });
  withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    stage.text(POSTER.q, 540, y1, {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1});
    withAlpha(c, 1 - q, () => stage.text(POSTER.a, 540, lerp(POSTER.y2, 292, q), {role: 'display', weight: 700, size: lerp(AS, 34, q), color: PAL.warm, align: 'center', tracking: tr * AS, shadow: sh, shadowBlur: 28}));
  });
}
export function captionBand(c) { const g = c.createLinearGradient(0, 1376, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(0,8,12,0.4)'); g.addColorStop(1, 'rgba(0,8,12,0.6)'); c.fillStyle = g; c.fillRect(0, 1376, W, 544); }

// =====================================================================================================
// sound helpers (sar soundEvents style) — build event objects for sound.json
// =====================================================================================================
export const r3 = (x, d = 4) => +(+x).toFixed(d);
export const snd = {
  tick: (id, t0, freq, gain, means, o = {}) => ({id, at: r3(t0), kind: 'tick', params: {freq, decay: o.decay ?? 0.08, gain_db: gain, click: 0}, means}),
  tone: (id, t0, freq, dur, gain, means, o = {}) => ({id, at: r3(t0), kind: 'tone', params: {freq, dur, harmonics: o.harmonics ?? [1, 0.2], attack: 0.005, decay: o.decay ?? dur * 0.5, sustain: o.sustain ?? 0.1, release: o.release ?? Math.min(0.08, dur / 3), gain_db: gain}, means}),
  swell: (id, t0, freqs, dur, gain, means) => ({id, at: r3(t0), kind: 'swell', params: {freqs, dur, attack: 0.4, gain_db: gain}, means}),
  whoosh: (id, t0, dur, f0, f1, gain, means) => ({id, at: r3(t0), kind: 'whoosh', params: {dur: r3(dur, 3), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means}),
  chirp: (id, t0, points, gain, means) => ({id, at: r3(t0), kind: 'chirp', params: {gain_db: gain, harmonics: [1, 0.25], fade: 0.03, points: points.map(p => p.map(v => r3(v, 3)))}, means}),
  /** many layers in one event: items [[t, kind, params]] */
  train: (id, items, gain, means) => { if (!items.length) return null; const T0 = Math.min(...items.map(x => x[0]));
    return {id, at: r3(T0), kind: 'custom', params: {gain_db: gain, layers: items.map(([tt, kind, params]) => ({kind, offset: r3(tt - T0), params}))}, means}; },
};
