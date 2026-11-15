// 화풍 시안 실행기 (2026-11-15, 시안 — README.md 를 먼저 읽으세요).
// node run.mjs <tsunami|crater|printer> OUT.mp4   |   node run.mjs <name> PREFIX --still=1,5,9
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStage, renderVideo, resolveTheme, fontString} from '../../pipeline/render/index.mjs';
import {Pix, W, H, SCALE} from './px.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '../..');
const require = createRequire(path.join(REPO, 'pipeline/render/index.mjs'));
const {ImageData} = require('@napi-rs/canvas');

const [name, out, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const scene = await import(`./scene_${name}.mjs`);
const stage = createStage({theme: resolveTheme('noturno')});
const {ctx} = stage, P = new Pix();
const SH = 'rgba(6,10,20,0.55)';

/** crisp type laid over the upscaled pixel picture */
const T = {
  /** bold display line(s) */
  big(s, x, y, o = {}) { stage.text(s, x, y, {role: 'display', weight: 700, size: o.size || 64, color: o.color || '#F6EFE2', align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 18, baseline: o.baseline}); },
  /** small spaced label */
  kicker(s, x, y, o = {}) { stage.text(s, x, y, {size: o.size || 26, weight: 700, color: o.color || '#F2A742', tracking: 4, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 10}); },
  sans(s, x, y, o = {}) { return stage.text(s, x, y, {size: o.size || 30, weight: o.weight || 500, color: o.color || '#F6EFE2', align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 10}); },
  /** accent line: the title family at medium weight (2026-11-15 사용자 "명조체 좀 구린데" — 명조를 뺐다) */
  accent(s, x, y, o = {}) {
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1; ctx.font = fontString('display', o.size || 46, 500); ctx.textBaseline = 'middle'; ctx.textAlign = o.align || 'left';
    ctx.shadowColor = SH; ctx.shadowBlur = 14; ctx.fillStyle = o.color || '#FBEBC0'; ctx.fillText(s, x, y); ctx.restore();
  },
  /** number readout: small name over a big value */
  gauge(name, value, x, y, o = {}) {
    const a = o.alpha ?? 1;
    stage.text(name, x, y, {size: 26, weight: 500, color: '#A9C4B4', alpha: a, shadow: SH, shadowBlur: 8});
    stage.text(value, x, y + 50, {role: 'display', weight: 700, size: o.size || 50, color: o.color || '#F6EFE2', alpha: a, shadow: SH, shadowBlur: 12});
  },
  stage, ctx,
};

function frame(t) {
  scene.draw(P, t);
  ctx.putImageData(new ImageData(P.upscale(), W * SCALE, H * SCALE), 0, 0);
  scene.overlay(T, t);
}

if (opt.still) {
  for (const s of opt.still.split(',')) { frame(Number(s)); fs.writeFileSync(`${out}_${s}.png`, stage.canvas.toBuffer('image/png')); }
  console.log('stills', name, opt.still);
} else {
  await renderVideo({stage, duration: scene.DUR, frame, out});
  console.log('video', out);
}
