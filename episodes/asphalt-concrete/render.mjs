// node episodes/<slug>/render.mjs --stills | --video  [--timeline F] [--out DIR] [--scenes F] [--sound F] [--safe]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), slug = path.basename(here);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
const root = process.env.SCISHORT_ROOT || path.resolve(here, '../..');
const out = arg('--out', path.join(root, 'outputs', slug));
const kit = await import(pathToFileURL(path.join(root, 'pipeline/render/index.mjs')));
const ep = await import(pathToFileURL(arg('--scenes', path.join(here, 'scenes.mjs'))));
const tl = kit.loadTimeline(arg('--timeline', path.join(out, 'narration/timeline.json')));
const soundFile = arg('--sound', path.join(here, 'sound.json'));
const sound = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {events: []};
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);   // one event list for picture and sound
const theme = kit.resolveTheme(ep.theme), stage = kit.createStage({theme});
function frame(t) {
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  (ep.background || ((s, tt) => kit.background(s, tt)))(stage, t, ctx);
  const draw = ep.scenes[scene.id];
  if (!draw) throw new Error(`scenes.mjs has no scene "${scene.id}" (timeline scenes: ${tl.scenes.map(s => s.id).join(', ')})`);
  stage.ctx.save(); draw(stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
  if (process.argv.includes('--safe')) stage.drawSafeZones();
}
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({duration: tl.duration, events}, null, 1));
if (process.argv.includes('--video')) {
  await kit.renderVideo({stage, duration: tl.duration, frame, out: path.join(out, 'visual.mp4')});
} else {
  const times = tl.scenes.flatMap(s => [{t: s.start + Math.min(0.6, (s.end - s.start) / 3), label: s.id + '-start'}, {t: (s.start + s.end) / 2, label: s.id + '-mid'}])
    .concat(events.map(e => ({t: Math.min(tl.duration - 0.01, e.time + 0.12), label: 'event-' + e.id}))).sort((a, b) => a.t - b.t);
  await kit.renderStills({stage, times, frame, outDir: path.join(out, 'stills')});
}
