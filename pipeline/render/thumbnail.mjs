// node pipeline/render/thumbnail.mjs <slug> --t <sec> --main "제목" --sub "부제" [--y 1088] [--out FILE] [--hide-text-below PX] [--raw]
//
// A thumbnail IMAGE (1080x1920 JPEG) for an episode whose first frame was not made as a thumbnail.
// It draws the episode's own scene at time t with the same code as the video (background + scene only:
// no header overlay, no progress bar, no captions) and puts the big two-line poster title in the central
// square, in the same style as the first-frame posters (2026-11-03 rule; eddington-limit, quasar, twinkle, aurora).
//   --hide-text-below PX  skip scene text smaller than PX (small labels); their plates, if any, stay
//   --y                   baseline of the main title (default 1088, the poster position); keep it inside y 420–1500
//   --crop x,y,w,h        keep only this region of the scene, scaled to --fit px wide (default 1000, height capped
//                         at 900) and centred at y = --cy (default 640) on a fresh background, edges feathered
//   --raw                 also write <out>.raw.jpg without the title (for choosing the moment)
//   --raw-only            write only the picture without any title to --out and stop (poster key image for
//                         pipeline/render/posterintro.mjs, 2026-11-07)
// Timeline: outputs/<slug>/narration/timeline.json, else the archived finals/*-<slug>/timeline.json.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = process.env.SCISHORT_ROOT || path.resolve(here, '../..');
const argv = process.argv.slice(2), slug = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
if (!slug || slug.startsWith('--')) { console.error('usage: node pipeline/render/thumbnail.mjs <slug> --t <sec> --main "제목" --sub "부제" [--y 1088] [--out FILE]'); process.exit(2); }
const t = Number(opt('--t', 'NaN')), main = opt('--main', ''), sub = opt('--sub', ''), y1 = Number(opt('--y', 1088));
const hideBelow = Number(opt('--hide-text-below', 0));
if (!Number.isFinite(t) || !main) { console.error('need --t and --main'); process.exit(2); }

const kit = await import(pathToFileURL(path.join(here, 'index.mjs')));
const epDir = path.join(root, 'episodes', slug);
const ep = await import(pathToFileURL(path.join(epDir, 'scenes.mjs')));
let tlFile = path.join(root, 'outputs', slug, 'narration', 'timeline.json');
if (!fs.existsSync(tlFile)) {
  const fin = fs.readdirSync(path.join(root, 'finals')).find(d => d.replace(/^\d+-/, '') === slug);
  if (fin) tlFile = path.join(root, 'finals', fin, 'timeline.json');
}
const tl = kit.loadTimeline(tlFile);
const soundFile = path.join(epDir, 'sound.json');
const sound = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {events: []};
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);
const theme = kit.resolveTheme(ep.theme), stage = kit.createStage({theme});

// scene only (as render.mjs draws it, minus overlays and captions)
const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
(ep.background || ((s, tt) => kit.background(s, tt)))(stage, t, ctx);
const text0 = stage.text;
if (hideBelow > 0) stage.text = (s, x, y, o = {}) => ((o.size || 32) < hideBelow ? 0 : text0(s, x, y, o));
stage.ctx.save(); ep.scenes[scene.id](stage, t, scene.p, ctx); stage.ctx.restore();
stage.text = text0;

// optional crop + zoom (--maxh caps the height, default 900): the key picture alone, larger, above the title (no panels or readouts)
const crop = opt('--crop', null);
if (crop) {
  const [cx0, cy0, cw, ch] = crop.split(',').map(Number), fit = Number(opt('--fit', 1000)), cyc = Number(opt('--cy', 640));
  const k = Math.min(fit / cw, Number(opt('--maxh', 900)) / ch), W = Math.round(cw * k), H = Math.round(ch * k), feather = Math.round(Number(opt('--feather', 70)));
  const C = stage.canvas.constructor, piece = new C(W, H), pc = piece.getContext('2d');
  pc.imageSmoothingQuality = 'high'; pc.drawImage(stage.canvas, cx0, cy0, cw, ch, 0, 0, W, H);
  // feathered edges: multiply by a horizontal and a vertical alpha ramp
  for (const [gx0, gy0, gx1, gy1, len] of [[0, 0, W, 0, W], [0, 0, 0, H, H]]) {
    const g = pc.createLinearGradient(gx0, gy0, gx1, gy1), f = Math.min(0.45, feather / len);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, 'rgba(0,0,0,1)'); g.addColorStop(1 - f, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    pc.globalCompositeOperation = 'destination-in'; pc.fillStyle = g; pc.fillRect(0, 0, W, H);
  }
  pc.globalCompositeOperation = 'source-over';
  (ep.background || ((st, tt) => kit.background(st, tt)))(stage, t, ctx);
  stage.ctx.drawImage(piece, Math.round(540 - W / 2), Math.round(cyc - H / 2));
}

const out = path.resolve(opt('--out', path.join(root, 'outputs', slug, 'thumbnail.jpg')));
fs.mkdirSync(path.dirname(out), {recursive: true});
if (argv.includes('--raw')) fs.writeFileSync(out.replace(/\.jpg$/i, '') + '.raw.jpg', await stage.canvas.encode('jpeg', 90));
if (argv.includes('--raw-only')) {
  fs.writeFileSync(out, await stage.canvas.encode('jpeg', 92));
  console.log(`poster key: ${path.relative(root, out)}  (scene ${scene.id} @ ${t.toFixed(2)} s)`);
  process.exit(0);
}

// poster title: dark band behind, big main line fitted to 800 px, subtitle below (same as the first-frame posters)
const c = stage.ctx, T = stage.theme, y2 = y1 + 126;
const g = c.createLinearGradient(0, y1 - 128, 0, y2 + 106);
g.addColorStop(0, 'rgba(0,6,12,0)'); g.addColorStop(0.32, 'rgba(0,6,12,0.66)'); g.addColorStop(0.8, 'rgba(0,6,12,0.66)'); g.addColorStop(1, 'rgba(0,6,12,0)');
c.fillStyle = g; c.fillRect(0, y1 - 128, 1080, y2 + 106 - (y1 - 128));
const big = Math.min(168, 168 * 800 / stage.measure(main, {role: 'display', weight: 700, size: 168}));
stage.text(main, 540, y1, {role: 'display', weight: 700, size: big, color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 20});
if (sub) stage.text(sub, 540, y2, {role: 'display', weight: 500, size: Math.min(64, 64 * 800 / stage.measure(sub, {role: 'display', weight: 500, size: 64})), color: T.light, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 14});

fs.writeFileSync(out, await stage.canvas.encode('jpeg', 90));
console.log(`thumbnail: ${path.relative(root, out)}  (scene ${scene.id} @ ${t.toFixed(2)} s, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
