// Burned-in Korean captions (sentence role) and on-screen object labels (name role).
import {rgba, clamp, rect} from './draw.mjs';

export const CAPTION_DEFAULTS = Object.freeze({
  size: 44,          // px at 1080 wide ≈ 16 pt on a phone
  weight: 500,       // Noto Sans KR Medium
  lineHeight: 1.34,
  maxWidth: 840,     // ≈ 19 Hangul syllables per line at 44 px (validate.py checks ≤ 22 chars)
  maxLines: 2,
  maxChars: 22,      // per line, spaces included (validate.py uses the same limit)
  hold: 0.15,        // keep a cue up to 0.15 s after speech ends unless the next cue starts
  fade: 0.08,
  y: null,           // baseline of the LAST line; default = H - safe.bottom - 20 (≈1480 for 1920)
  x: null,           // centre x; default = centre of the safe column (keeps clear of action buttons)
  plate: true,
  padX: 26, padY: 16, radius: 18,
});

/** Split '**marked**' spans: → {plain, ranges:[[a,b),…]} on whitespace-normalised text. */
export function parseMarked(text) {
  const src = String(text).replace(/\s+/g, ' ').trim();
  let plain = '', ranges = [], open = -1;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '*' && src[i + 1] === '*') { if (open < 0) open = plain.length; else { ranges.push([open, plain.length]); open = -1; } i++; continue; }
    plain += src[i];
  }
  if (open >= 0) ranges.push([open, plain.length]);
  return {plain, ranges};
}
export const stripMarked = s => parseMarked(s).plain;

/** Draw one line made of accent / normal runs. */
function drawRuns(stage, line, offset, ranges, x, y, font, color, accent, align) {
  const {ctx} = stage;
  stage.applyFont(font);
  const total = ctx.measureText(line).width;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const isAcc = i => ranges.some(([a, b]) => i >= a && i < b);
  let run = '', runAcc = null;
  const flush = () => {
    if (!run) return;
    ctx.fillStyle = runAcc ? accent : color; ctx.textAlign = 'left';
    ctx.fillText(run, cx, y); cx += ctx.measureText(run).width; run = '';
  };
  for (let i = 0; i < line.length; i++) {
    const a = isAcc(offset + i);
    if (a !== runAcc) { flush(); runAcc = a; }
    run += line[i];
  }
  flush();
}

/** Lay out a caption string: → {lines, offsets, ranges, size, width, height} */
export function layoutCaption(stage, text, o = {}) {
  const opt = {...CAPTION_DEFAULTS, ...o};
  const {plain, ranges} = parseMarked(text);
  let size = opt.size, lines = stage.wrap(plain, {size, weight: opt.weight, maxWidth: opt.maxWidth, maxChars: opt.maxChars, balance: true});
  if (lines.length > opt.maxLines) { // one gentle step down, never more (docs: don't keep shrinking text)
    size = Math.round(opt.size * 0.92);
    lines = stage.wrap(plain, {size, weight: opt.weight, maxWidth: opt.maxWidth, maxChars: opt.maxChars, balance: true});
  }
  const offsets = []; let cur = 0;
  for (const l of lines) { const i = plain.indexOf(l, cur); offsets.push(i < 0 ? cur : i); cur = (i < 0 ? cur : i) + l.length; }
  const width = Math.max(...lines.map(l => stage.measure(l, {size, weight: opt.weight})));
  return {lines, offsets, ranges, size, width, height: lines.length * size * opt.lineHeight, overflow: lines.length > opt.maxLines};
}

const warned = new Set();
/**
 * Draw the caption cue active at t. opts: see CAPTION_DEFAULTS plus {color, accent, plateColor, theme}.
 * Move captions per scene with opts.y when the phenomenon sits low in the frame.
 * Returns the plate rectangle {x,y,w,h} (or null) so scenes can avoid it.
 */
export function drawCaptions(stage, timeline, t, opts = {}) {
  const opt = {...CAPTION_DEFAULTS, ...opts};
  const hit = timeline.captionAt(t, opt.hold);
  if (!hit) return null;
  return drawCaptionText(stage, hit.cue.text, {...opt, alpha: clamp(hit.age / opt.fade) * clamp(hit.remaining / opt.fade), cueIndex: hit.index});
}

/** Draw arbitrary caption text with caption styling (used by drawCaptions; handy for stills). */
export function drawCaptionText(stage, text, opts = {}) {
  const opt = {...CAPTION_DEFAULTS, ...opts}, th = opt.theme || stage.theme || {}, {ctx} = stage;
  const L = layoutCaption(stage, text, opt);
  if (L.overflow && !warned.has(text)) { warned.add(text); console.warn(`caption exceeds ${opt.maxLines} lines (${L.lines.length}): "${stripMarked(text)}" — split the cue in the script`); }
  const lh = L.size * opt.lineHeight;
  const yLast = opt.y ?? stage.H - stage.safe.bottom - 20;
  const x = opt.x ?? stage.safe.cx;
  const top = yLast - (L.lines.length - 1) * lh - L.size * 0.95 - opt.padY, bottom = yLast + L.size * 0.32 + opt.padY;
  const box = {x: x - L.width / 2 - opt.padX, y: top, w: L.width + opt.padX * 2, h: bottom - top};
  ctx.save();
  ctx.globalAlpha *= opt.alpha ?? 1;
  if (opt.plate) {
    rect(ctx, box.x, box.y, box.w, box.h, opt.radius, opt.plateColor || rgba(th.plate || '#06222E', 0.86));
    rect(ctx, box.x, box.y, box.w, box.h, opt.radius, null, rgba(th.border || '#1C3A45', 0.9), 1.5);
  }
  ctx.textBaseline = 'alphabetic';
  L.lines.forEach((line, i) => drawRuns(stage, line, L.offsets[i], L.ranges, x, yLast - (L.lines.length - 1 - i) * lh,
    {size: L.size, weight: opt.weight}, opt.color || th.ink || '#EFE3D4', opt.accent || th.accent || '#FF4103', 'center'));
  ctx.restore();
  return box;
}

/**
 * On-screen object label (names a thing; captions explain). Distinct look: no full plate by default,
 * a small colour key, medium weight. opts: {size:30, color, key (colour square), align, plate, sub, alpha, weight}
 */
export function drawLabel(stage, text, x, y, opts = {}) {
  const th = stage.theme || {}, {ctx} = stage, size = opts.size || 30, align = opts.align || 'left';
  const w = stage.measure(text, {size, weight: opts.weight ?? 500});
  const keyW = opts.key ? size * 0.42 + 10 : 0;
  const x0 = align === 'center' ? x - (w + keyW) / 2 : align === 'right' ? x - w - keyW : x;
  ctx.save(); ctx.globalAlpha *= opts.alpha ?? 1;
  if (opts.plate) rect(ctx, x0 - 14, y - size * 0.8, w + keyW + 28, size * 1.6 + (opts.sub ? size * 0.9 : 0), 10, rgba(th.plate || '#06222E', 0.78), rgba(th.border || '#1C3A45', 0.9), 1);
  if (opts.key) rect(ctx, x0, y - size * 0.21, size * 0.42, size * 0.42, 3, opts.key);
  stage.text(text, x0 + keyW, y, {size, color: opts.color || th.ink, weight: opts.weight ?? 500});
  if (opts.sub) stage.text(opts.sub, x0 + keyW, y + size * 0.95, {size: Math.round(size * 0.74), color: opts.subColor || th.muted});
  ctx.restore();
  return {x: x0, y: y - size / 2, w: w + keyW, h: size};
}
