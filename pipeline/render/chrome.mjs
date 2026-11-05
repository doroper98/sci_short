// Optional, theme-driven frame furniture: background, header, progress bar, source line, end card.
// Nothing here is mandatory; an episode may draw its own frame entirely.
import {rgba, clamp, line, rect, glow, smooth, easeOut} from './draw.mjs';

// All themes are dark technical palettes. noturno is the default (from the reportage report template).
export const THEMES = Object.freeze({
  noturno: {name: 'noturno', bg: '#001621', deep: '#000E16', plate: '#06222E', border: '#1C3A45', ink: '#EFE3D4', muted: '#8AA0A6',
    accent: '#FF4103', accent2: '#8AC0A0', up: '#8AC0A0', down: '#FF8A5C', light: '#FFE2C4'},
  slate: {name: 'slate', bg: '#0E1A1F', deep: '#071014', plate: '#12252B', border: '#284148', ink: '#ECF3F2', muted: '#93A7AB',
    accent: '#5FD3C8', accent2: '#E9BC78', up: '#7FD6A4', down: '#F08A6B', light: '#D8FFF9'},
  graphite: {name: 'graphite', bg: '#18191B', deep: '#0C0D0E', plate: '#222326', border: '#3A3B3F', ink: '#F1EDE6', muted: '#A09A90',
    accent: '#F2A93B', accent2: '#7FB8D8', up: '#9CCB86', down: '#F07F5E', light: '#FFF1D6'},
  navy: {name: 'navy', bg: '#0B1530', deep: '#050B1C', plate: '#121F40', border: '#2A3A62', ink: '#EEF1F8', muted: '#98A3BE',
    accent: '#FF6F91', accent2: '#7CC4FF', up: '#86D3B0', down: '#FF9A7A', light: '#E4ECFF'},
});
export const DEFAULT_THEME = 'noturno';

/** theme name | partial object (merged over a base, default noturno) → full theme */
export function resolveTheme(theme = DEFAULT_THEME) {
  if (!theme) return {...THEMES[DEFAULT_THEME]};
  if (typeof theme === 'string') { if (!THEMES[theme]) throw new Error(`unknown theme "${theme}" (have: ${Object.keys(THEMES).join(', ')})`); return {...THEMES[theme]}; }
  return {...THEMES[theme.base || DEFAULT_THEME], ...theme};
}

const th = (stage, theme) => theme || stage.theme || THEMES[DEFAULT_THEME];

/**
 * Vertical gradient + one soft key light + optional faint measurement grid and drifting dust (depth cue).
 * o: {light:[x,y], lightR, lightA, grid:false, dust:40, vignette:true}
 */
export function background(stage, t = 0, o = {}, theme) {
  const T = th(stage, theme), {ctx, W, H} = stage;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, T.bg); g.addColorStop(1, T.deep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const [lx, ly] = o.light || [W * 0.62, H * 0.42];
  glow(ctx, lx, ly, o.lightR || W * 0.75, T.light || T.ink, o.lightA ?? 0.05);
  if (o.grid) {
    ctx.save(); ctx.strokeStyle = rgba(T.border, 0.35); ctx.lineWidth = 1;
    const step = o.grid === true ? 60 : o.grid;
    ctx.beginPath();
    for (let x = step / 2; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = step / 2; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke(); ctx.restore();
  }
  const n = o.dust ?? 36;
  for (let i = 0; i < n; i++) {
    const a = Math.sin(i * 127.1 + 9.2) * 43758.5453, r = a - Math.floor(a);
    const b = Math.sin(i * 311.7 + 3.1) * 23421.631, s = b - Math.floor(b);
    const x = (r * W + t * (6 + s * 10)) % W, y = 260 + s * (H - 700) + Math.sin(t * 0.2 + i) * 6;
    ctx.fillStyle = rgba(T.ink, 0.04 + 0.08 * s); ctx.beginPath(); ctx.arc(x, y, 0.8 + 1.6 * r, 0, Math.PI * 2); ctx.fill();
  }
  if (o.vignette !== false) {
    const v = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.48, H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
}

/**
 * Header in the top title zone. {kicker, title ('\n' allowed), subtitle, p (scene progress for entrance), y}
 * Returns the y just below the header so content can start there.
 */
export function header(stage, {kicker = '', title = '', subtitle = '', p = 1, y = 128, size = 70} = {}, theme) {
  const T = th(stage, theme), x = stage.safe.left + 6, maxW = stage.safe.x1 - x - 10, {ctx} = stage;
  const a = easeOut(clamp(p / 0.06));
  ctx.save(); ctx.globalAlpha *= a;
  let yy = y;
  if (kicker) {
    stage.text(kicker, x, yy, {role: 'display', weight: 500, size: 24, color: T.accent, upper: true, tracking: 3});
    line(ctx, [[x, yy + 26], [x + 64, yy + 26]], T.accent, 3, {cap: 'butt'});
    yy += 50;
  }
  const lines = String(title).split('\n');
  yy += size * 0.62;
  for (const l of lines) { stage.text(l, x - 3, yy, {role: 'display', weight: 700, size, color: T.ink, maxWidth: maxW}); yy += size * 1.1; }
  if (subtitle) { stage.text(subtitle, x, yy - size * 0.2 + 12, {size: 30, weight: 400, color: T.muted, maxWidth: maxW}); yy += 44; }
  ctx.restore();
  return yy;
}

/** Thin progress bar. o: {y (default 30), x0, x1, h} — non-critical; may sit under platform UI. */
export function progressBar(stage, t, duration, o = {}, theme) {
  const T = th(stage, theme), {ctx} = stage, y = o.y ?? 34, x0 = o.x0 ?? stage.safe.left, x1 = o.x1 ?? stage.W - stage.safe.left, h = o.h ?? 4;
  rect(ctx, x0, y, x1 - x0, h, h / 2, rgba(T.border, 0.9));
  rect(ctx, x0, y, Math.max(h, (x1 - x0) * clamp(t / duration)), h, h / 2, T.accent);
}

/** Small credit / data source / simplification note. Default sits just above a 2-line caption plate (safe.captionTop). */
export function sourceLine(stage, text, o = {}, theme) {
  const T = th(stage, theme);
  stage.text(text, o.x ?? stage.safe.left + 6, o.y ?? stage.safe.captionTop - 34, {size: o.size || 22, color: o.color || T.muted, weight: 400, align: o.align || 'left', maxWidth: stage.safe.x1 - stage.safe.left - 10, alpha: o.alpha ?? 0.9});
}

/** Closing card: one takeaway (display font) + supporting lines. p = scene progress for entrance. */
export function endCard(stage, {takeaway = '', lines = [], p = 1, y = null, kicker = ''} = {}, theme) {
  const T = th(stage, theme), {ctx} = stage, cx = stage.safe.cx;
  const a = smooth(p / 0.15), cy = y ?? stage.H * 0.42;
  ctx.save(); ctx.globalAlpha *= a;
  if (kicker) stage.text(kicker, cx, cy - 130, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', upper: true, tracking: 3});
  const tl = stage.wrap(takeaway, {role: 'display', weight: 700, size: 66, maxWidth: stage.safe.x1 - stage.safe.left - 40, balance: true});
  tl.forEach((l, i) => stage.text(l, cx, cy - (tl.length - 1) * 40 + i * 80, {role: 'display', weight: 700, size: 66, color: T.ink, align: 'center'}));
  const ry = cy + (tl.length - 1) * 40 + 70;
  line(ctx, [[cx - 60 * a, ry], [cx + 60 * a, ry]], T.accent, 4, {cap: 'butt'});
  lines.forEach((l, i) => stage.text(l, cx, ry + 60 + i * 50, {size: 32, color: T.muted, align: 'center', alpha: smooth((p - 0.1 - i * 0.05) / 0.15)}));
  ctx.restore();
}
