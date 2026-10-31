// Stage: a 1080x1920 canvas plus font roles, text helpers and platform safe zones.
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bind} from './draw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');
export const FONT_DIR = process.env.SCISHORT_FONT_DIR || path.join(REPO_ROOT, 'assets/fonts');

// Shorts/Reels/TikTok overlays, measured for a 1080x1920 frame. Values scale with frame height.
// top: title zone (status bar + platform search icons above ~110 px; titles may live 110..~420)
// bottom: platform UI (channel name, description, music ticker) -> no critical content
// right: action buttons (like/comment/share) -> keep labels and key objects out
export const SAFE_ZONES = Object.freeze({top: 200, bottom: 420, right: 140, left: 60});

const SYS = {
  cjk: ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', '/System/Library/Fonts/AppleSDGothicNeo.ttc', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'],
  cjkBold: ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc'],
  latin: ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
  latinBold: ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
};
const FETCH_HINT = 'python pipeline/render/fetch_fonts.py';

// Family aliases registered with @napi-rs/canvas. Each role is a fallback list so that
// glyphs missing in one font (GmarketSans has no space; Noto Sans KR has no subscript digits)
// come from the next family.
export const FAMILY = {display: 'SciDisplay', body: 'SciBody', cjk: 'SciCJK', latin: 'SciLatin'};
let registered = null;

const first = list => list.find(p => p && fs.existsSync(p));

/** Register fonts once per process. Returns {display:boolean, body:boolean, cjk:boolean, latin:boolean, warnings:[]} */
export function registerFonts(opts = {}) {
  if (registered) return registered;
  const dir = opts.dir || FONT_DIR, warnings = [];
  const reg = (file, family) => { if (file && fs.existsSync(file)) { GlobalFonts.registerFromPath(file, family); return true; } return false; };
  const display = ['GmarketSansBold.otf', 'GmarketSansMedium.otf', 'GmarketSansLight.otf'].map(f => reg(path.join(dir, f), FAMILY.display)).some(Boolean);
  const body = ['NotoSansKR-Regular.ttf', 'NotoSansKR-Medium.ttf', 'NotoSansKR-Bold.ttf'].map(f => reg(path.join(dir, f), FAMILY.body)).some(Boolean);
  const cjkR = reg(process.env.SCISHORT_FONT_CJK || first(SYS.cjk), FAMILY.cjk);
  reg(process.env.SCISHORT_FONT_CJK_BOLD || first(SYS.cjkBold), FAMILY.cjk);
  const latin = reg(first(SYS.latin), FAMILY.latin); reg(first(SYS.latinBold), FAMILY.latin);
  if (!display || !body) warnings.push(`fonts: ${[!display && 'GmarketSans', !body && 'Noto Sans KR'].filter(Boolean).join(' + ')} missing in ${dir}; falling back to system Noto Sans CJK. Run: ${FETCH_HINT}`);
  if (!body && !cjkR) throw new Error(`No Korean font available. Run "${FETCH_HINT}" or install fonts-noto-cjk (or set SCISHORT_FONT_CJK=/path/to/korean.ttc).`);
  if (!latin) warnings.push('fonts: DejaVu Sans not found; rare symbols (e.g. subscript digits) may render as boxes.');
  for (const w of warnings) if (!opts.quiet) console.warn(w);
  registered = {display, body, cjk: cjkR, latin, warnings, dir};
  return registered;
}

/** CSS font string for a role. role: 'display' | 'body'; weight: 400/500/700. */
export function fontString(role, size, weight = 400) {
  const f = registered || registerFonts();
  const stack = [];
  if (role === 'display' && f.display) stack.push(FAMILY.display);
  if (f.body) stack.push(FAMILY.body);
  if (f.cjk) stack.push(FAMILY.cjk);
  if (f.latin) stack.push(FAMILY.latin);
  // Display role without GmarketSans: compensate with a heavier body weight.
  const w = role === 'display' && !f.display ? Math.max(weight, 700) : weight;
  return `${w} ${size}px ${stack.join(', ')}`;
}

export function createStage({width = 1080, height = 1920, fps = 30, fonts = {}, theme = null} = {}) {
  const info = registerFonts(fonts);
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  const k = height / 1920;
  const safe = {top: SAFE_ZONES.top * k, bottom: SAFE_ZONES.bottom * k, right: SAFE_ZONES.right * k, left: SAFE_ZONES.left * k};
  Object.assign(safe, {x0: safe.left, x1: width - safe.right, y0: safe.top, y1: height - safe.bottom, cx: width / 2});   // centre of the frame: a left-shifted stage reads as off-centre on phones; the right margin only limits text width
  // Top of a default 2-line caption plate (captions.mjs defaults). Keep key content above captionTop - 20.
  safe.captionTop = safe.y1 - 140 * k;

  const applyFont = (o = {}) => {
    const role = o.role || (o.display ? 'display' : 'body');
    const weight = o.weight ?? (o.bold ? 700 : role === 'display' ? 700 : 400);
    ctx.font = fontString(role, o.size || 32, weight);
    // letterSpacing in px; default tracking only for display (tight headline look).
    const tracking = o.tracking ?? (role === 'display' ? -0.011 * (o.size || 32) : 0);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  };
  const measure = (s, o = {}) => { applyFont(o); return ctx.measureText(String(s)).width; };

  /**
   * Draw a single line of text. o: {size, color, role:'body'|'display', weight, bold, align, baseline,
   *  alpha, maxWidth (shrinks font down to 0.8x, then squeezes), tracking, upper}
   * Returns the drawn width.
   */
  function text(s, x, y, o = {}) {
    s = String(s ?? ''); if (o.upper) s = s.toUpperCase();
    let size = o.size || 32;
    applyFont({...o, size});
    if (o.maxWidth) while (ctx.measureText(s).width > o.maxWidth && size > (o.size || 32) * 0.8) { size -= 1; applyFont({...o, size}); }
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillStyle = o.color || stage.theme?.ink || '#EFE3D4';
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur ?? 12; }
    if (o.maxWidth) ctx.fillText(s, x, y, o.maxWidth); else ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }

  /**
   * Word-wrap Korean/Latin text at spaces (eojeol), splitting over-long words by character.
   * Honours explicit '\n'. o.balance=true evens out a 2-line result (caption style).
   * o.maxChars additionally limits characters per line (captions use 22, mirrored in pipeline/validate.py).
   */
  function wrap(s, o = {}) {
    applyFont(o);
    const maxWidth = o.maxWidth || width - safe.left - safe.right;
    const maxChars = o.maxChars || Infinity; // optional hard limit on characters per line (spaces included)
    const w = str => (str.length > maxChars ? Infinity : ctx.measureText(str).width);
    const out = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const cand = line ? line + ' ' + word : word;
        if (w(cand) <= maxWidth) { line = cand; continue; }
        if (line) out.push(line);
        if (w(word) <= maxWidth) { line = word; continue; }
        line = '';
        for (const ch of word) { if (w(line + ch) > maxWidth && line) { out.push(line); line = ch; } else line += ch; }
      }
      out.push(line);
    }
    if (o.balance && out.length === 2 && !String(s).includes('\n')) {
      const words = out.join(' ').split(' ');
      let best = out, bestW = Math.max(w(out[0]), w(out[1]));
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const m = Math.max(w(a), w(b));
        if (m <= maxWidth && m < bestW - 0.5) { best = [a, b]; bestW = m; }
      }
      return best;
    }
    return out;
  }

  /** Debug overlay showing the platform UI zones. */
  function drawSafeZones(alpha = 0.28) {
    ctx.save();
    ctx.fillStyle = `rgba(255,0,80,${alpha})`;
    ctx.fillRect(0, 0, width, safe.top);
    ctx.fillRect(0, height - safe.bottom, width, safe.bottom);
    ctx.fillRect(width - safe.right, safe.top, safe.right, height - safe.top - safe.bottom);
    ctx.fillStyle = `rgba(255,200,0,${alpha * 0.6})`;
    ctx.fillRect(0, safe.top, safe.left, height - safe.top - safe.bottom);
    ctx.restore();
    text('TITLE ZONE (top)', 20, safe.top - 16, {size: 22, color: '#ffd0d8'});
    text('PLATFORM UI — no critical content', 20, height - safe.bottom + 36, {size: 22, color: '#ffd0d8'});
    ctx.save(); ctx.translate(width - safe.right / 2, height / 2); ctx.rotate(Math.PI / 2);
    text('ACTION BUTTONS', 0, 8, {size: 22, color: '#ffd0d8', align: 'center'}); ctx.restore();
  }

  const stage = {canvas, ctx, W: width, H: height, FPS: fps, safe, fonts: info, theme, text, wrap, measure, applyFont, drawSafeZones, font: fontString};
  stage.draw = bind(ctx);
  return stage;
}
