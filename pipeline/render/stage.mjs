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

// Number glue (2026-11-07 user rule): never break between a number and what it counts. Mirrors
// number_glue() in pipeline/narration/captions.py, which applies the same rule to caption cue boundaries.
const NUM_END = /(?:[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]|[0-9][0-9.,]*[십백천만억조]+|^(?:수|몇)?[십백천만억조]+)$/;
const NATIVE_NUM = /^(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두|열세|열네|스무|스물|스물한|스물두|스물세|스물네|서른|마흔|쉰|예순|일흔|여든|아흔|두세|서너|너덧|몇|수십|수백|수천|수만|수십만|수백만|수천만|수억|수십억)$/;
const NUM_PREFIX = new Set(['약', '단', '총', '무려', '불과', '겨우', '최대', '최소', '시속', '초속', '섭씨', '화씨', '영하', '영상']);
export function numberGlue(prev, next) {
  if (!prev || !next || /[,，;.!?]$/.test(prev)) return false;
  if (NUM_END.test(prev) || NATIVE_NUM.test(prev)) return true;
  const lead = next.replace(/[^가-힣].*$/, '') || '-';
  const startsNum = /^[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(next) || NATIVE_NUM.test(lead);
  return startsNum && (prev.endsWith('분의') || NUM_PREFIX.has(prev));
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
      // Even out the two lines, but never strand a one-syllable word (e.g. "수백 / 번", "그 / 까닭")
      // at a line edge: such a split costs a quarter of the column width extra (user rule, 2026-11).
      const words = out.join(' ').split(' ');
      // Dangling = a bound noun/counter opening line 2 ("수백 / 번", "극 / 쪽으로") or a determiner
      // closing line 1 ("그 / 까닭", "한 / 칸에", "두 / 블랙홀은", "첫 / 신호를").
      const BOUND = /^(번|개|수|것|때|등|중|쪽|년|배|초|분|명|곳|줄|채|뿐|듯|칸|쯤)(에|은|는|이|가|을|를|의|으로|로|도|씩|째|에서|까지|부터)?[.,!?]?$/;
      const DET = /^(그|이|저|한|두|세|네|첫|각|몇|온|약|극|빔|찬|큰|새)$/;
      const dangling = i => BOUND.test(words[i]) || DET.test(words[i - 1]);
      // A number and what it counts never sit on different lines ("3천 / 배가", "1억분의 / 1초", "섭씨 / 38도");
      // same rule as number_glue() in pipeline/narration/captions.py (2026-11-07 user rule).
      const cost = (a, b, i) => Math.max(w(a), w(b)) + (dangling(i) ? 0.25 * maxWidth : 0)
        + (numberGlue(words[i - 1], words[i]) ? 10 * maxWidth : 0);
      let best = out, bestC = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        if (Math.max(w(a), w(b)) > maxWidth) continue;
        const c = cost(a, b, i);
        if (c < bestC - 0.5) { best = [a, b]; bestC = c; }
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
