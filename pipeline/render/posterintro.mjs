// Poster intro / ending for episodes made before the "first frame = thumbnail" rule (2026-11-07 retrofit of 01–08).
//
// Use in an episode's scenes.mjs (rename the episode's own `overlays` to `baseOverlays` first):
//   import {posterIntro} from '../../pipeline/render/posterintro.mjs';
//   export const overlays = await posterIntro(baseOverlays, {slug: 'seasons'});
//
// Reads episodes/<slug>/poster.json:
//   {"q": "흰 질문", "a": "큰 강조색 답", "accent": "#FFC85A",
//    "key": {"t": 75, "crop": "x,y,w,h", "cy": 640, "fit": 1000, "maxh": 900, "feather": 70, "hide_text_below": 30},
//    "key_cmd": ["node", "episodes/log-scale/thumbnail.mjs", "--no-text", "--out", "episodes/log-scale/poster-key.jpg"]  // optional custom picture
//   }
// and the pre-rendered key picture episodes/<slug>/poster-key.jpg (full 1080×1920, no text). Make/refresh it with
//   node pipeline/render/posterintro.mjs <slug>        → poster-key.jpg + outputs/<slug>/poster-preview.jpg (t = 0 look)
// The key picture is the episode's own scene at time key.t drawn by pipeline/render/thumbnail.mjs --raw-only
// (same crop/zoom/feather options). It is pre-rendered so the video render never draws a scene out of order.
//
// Timeline: t < 0.9 s the poster covers the frame (frame 0 = thumbnail: picture + white question + huge answer);
// 0.9–1.7 s the picture fades out and the title rises, shrinks and fades, revealing the original hook;
// from just before the last sentence the poster fades back in (with a very slow zoom) and holds to the end.
// Captions are drawn after overlays, so they stay readable over the poster.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadImage} from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const MORPH = [0.9, 1.7], RETURN_LEAD = 0.25, RETURN_FADE = 0.6, END_ZOOM = 0.035;
const Q_Y = 1030, A_Y = 1222;
const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function readPosterConfig(slug) {
  const f = path.join(ROOT, 'episodes', slug, 'poster.json');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/** Draw the poster title block (dark band, white question, huge accent answer). k = 0..1 visibility. */
export function drawPosterTitle(stage, cfg, k = 1, rise = 0, scale = 1) {
  if (k <= 0) return;
  const c = stage.ctx, T = stage.theme;
  c.save(); c.globalAlpha *= k;
  const y0 = Q_Y - 150 - rise, y1 = A_Y + 120 - rise;
  const band = c.createLinearGradient(0, y0, 0, y1);
  band.addColorStop(0, 'rgba(0,6,12,0)'); band.addColorStop(0.22, 'rgba(0,6,12,0.74)');
  band.addColorStop(0.82, 'rgba(0,6,12,0.74)'); band.addColorStop(1, 'rgba(0,6,12,0)');
  c.fillStyle = band; c.fillRect(0, y0, 1080, y1 - y0);
  const fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max}));
  const qs = fit(cfg.q, 860, 86) * scale, as = fit(cfg.a, 800, 196) * scale;
  stage.text(cfg.q, 540, Q_Y - rise, {role: 'display', weight: 700, size: qs, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18});
  stage.text(cfg.a, 540, A_Y - rise - (1 - scale) * 120, {role: 'display', weight: 700, size: as, color: cfg.accent || T.accent, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 26});
  c.restore();
}

/** Wrap an episode's overlays with the poster intro / ending (async: decodes the key picture once). */
export async function posterIntro(baseOverlays, {slug}) {
  const cfg = readPosterConfig(slug);
  const keyFile = path.join(ROOT, 'episodes', slug, 'poster-key.jpg');
  if (!fs.existsSync(keyFile)) {   // first run: the key picture is drawn from this very episode, so fall back quietly
    console.warn(`posterintro: ${slug}: no poster-key.jpg yet — run node pipeline/render/posterintro.mjs ${slug}`);
    return baseOverlays || (() => {});
  }
  const img = await loadImage(fs.readFileSync(keyFile));
  const key = () => img;
  return function overlays(stage, t, ctx) {
    baseOverlays?.(stage, t, ctx);
    const tl = ctx.tl, dur = tl.duration;
    const last = tl.sentences?.length ? tl.sentences[tl.sentences.length - 1] : null;
    const tBack = (last ? last.start : dur - 6) - RETURN_LEAD;
    const intro = t < MORPH[0] ? 1 : 1 - ease((t - MORPH[0]) / (MORPH[1] - MORPH[0]));
    const outro = t >= tBack ? ease((t - tBack) / RETURN_FADE) : 0;
    const vis = Math.max(intro, outro);
    if (vis <= 0) return;
    const c = stage.ctx;
    c.save(); c.globalAlpha = vis;
    const z = outro > 0 ? 1 + END_ZOOM * Math.min(1, (t - tBack) / Math.max(1, dur - tBack)) : 1;
    c.drawImage(key(), 540 - 540 * z, 960 - 960 * z, 1080 * z, 1920 * z);
    c.restore();
    if (outro > 0) drawPosterTitle(stage, cfg, outro);
    else {
      const m = ease((t - MORPH[0]) / (MORPH[1] - MORPH[0]));   // 0 → 1 during the morph
      drawPosterTitle(stage, cfg, 1 - m, 520 * m, 1 - 0.45 * m);
    }
  };
}

// CLI: make the key picture and a t = 0 preview.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: node pipeline/render/posterintro.mjs <slug>'); process.exit(2); }
  const cfg = readPosterConfig(slug);
  const keyFile = path.join(ROOT, 'episodes', slug, 'poster-key.jpg');
  let r;
  if (cfg.key_cmd) r = spawnSync(cfg.key_cmd[0], cfg.key_cmd.slice(1), {cwd: ROOT, stdio: 'inherit'});
  else {
    const k = cfg.key, args = [path.join(HERE, 'thumbnail.mjs'), slug, '--t', String(k.t), '--main', '-', '--raw-only', '--out', keyFile];
    for (const [opt, name] of [['crop', '--crop'], ['cy', '--cy'], ['fit', '--fit'], ['maxh', '--maxh'], ['feather', '--feather'], ['hide_text_below', '--hide-text-below']])
      if (k[opt] != null) args.push(name, String(k[opt]));
    r = spawnSync(process.execPath, args, {cwd: ROOT, stdio: 'inherit'});
  }
  if (r.status !== 0) process.exit(r.status || 1);
  const kit = await import(path.join(HERE, 'index.mjs'));
  const ep = await import(path.join(ROOT, 'episodes', slug, 'scenes.mjs'));
  const stage = kit.createStage({theme: kit.resolveTheme(ep.theme)});
  const im = await loadImage(fs.readFileSync(keyFile));
  stage.ctx.drawImage(im, 0, 0, 1080, 1920);
  drawPosterTitle(stage, cfg, 1);
  const prev = path.join(ROOT, 'outputs', slug, 'poster-preview.jpg');
  fs.mkdirSync(path.dirname(prev), {recursive: true});
  fs.writeFileSync(prev, await stage.canvas.encode('jpeg', 90));
  console.log(`poster preview: ${path.relative(ROOT, prev)}`);
}
