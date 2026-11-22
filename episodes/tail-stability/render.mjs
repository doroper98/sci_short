// node episodes/<slug>/render.mjs --stills | --video  [--timeline F] [--out DIR] [--scenes F] [--sound F] [--safe]
// 2026-11-22 재렌더(사용자: "66번 재엔더. 마음에 드는군."): 틀(episodes/_template/render.mjs)과 같은 질감 층 — film 테마의 숯색 바탕,
// 자막까지 그린 뒤 filmLook(번짐 → 비네트 → 그레인), scenes.mjs 의 look 을 loadLook 해 한 번 만들고, 영상은 crf 20.
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
const film = theme.name === 'film', useLook = film && ep.look !== false;
const lookOpt = kit.loadLook(ep.look && typeof ep.look === 'object' ? ep.look : {});   // 편별 덮어쓰기(scenes.mjs 의 look)
function frame(t) {
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit, look: lookOpt};
  (ep.background || (film ? s => kit.filmBackground(s, lookOpt) : (s, tt) => kit.background(s, tt)))(stage, t, ctx);
  const draw = ep.scenes[scene.id];
  if (!draw) throw new Error(`scenes.mjs has no scene "${scene.id}" (timeline scenes: ${tl.scenes.map(s => s.id).join(', ')})`);
  stage.ctx.save(); draw(stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
  if (useLook) kit.filmLook(stage, t, lookOpt);   // 맨 마지막(안내선 전): 번짐 → 비네트 → 그레인
  if (process.argv.includes('--safe')) stage.drawSafeZones();
}
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({duration: tl.duration, events}, null, 1));
if (process.argv.includes('--video')) {
  // 고정 질감은 비트레이트를 올린다 — crf 18 은 48.5 MB, crf 20 은 39.7 MB 이고 질감 수치는 같다(samples/look-proposal-grain/README.md).
  await kit.renderVideo({stage, duration: tl.duration, frame, out: path.join(out, 'visual.mp4'), ...(useLook ? {crf: 20} : {})});
} else {
  const times = tl.scenes.flatMap(s => [{t: s.start + Math.min(0.6, (s.end - s.start) / 3), label: s.id + '-start'}, {t: (s.start + s.end) / 2, label: s.id + '-mid'}])
    .concat(events.map(e => ({t: Math.min(tl.duration - 0.01, e.time + 0.12), label: 'event-' + e.id}))).sort((a, b) => a.t - b.t);
  await kit.renderStills({stage, times, frame, outDir: path.join(out, 'stills')});
}
