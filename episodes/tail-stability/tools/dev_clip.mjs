// 66 꼬리날개 — 실제 장면 함수로 한 구간만 영상으로 쓰는 개발 도구(무음, 빛 지도 없음).
//   SCISHORT_ROOT=$PWD node episodes/tail-stability/tools/dev_clip.mjs --from 0 --to 4 --out outputs/tail-stability/dev_a/clip_0-4.mp4
//   SCISHORT_ROOT=$PWD node episodes/tail-stability/tools/dev_clip.mjs --stills 0,0.5,1,74.2 --out outputs/tail-stability/dev_a/pick   # 정지화면(JPG + 묶음)
//   [--timeline F] [--sound F] [--scenes F] [--safe]
// 프레임 순서는 render.mjs 의 frame 과 같다: 배경 → 장면 → overlays → 자막.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const kit = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
const ep = await import(pathToFileURL(path.resolve(arg('--scenes', path.join(HERE, 'scenes.mjs')))));
const tl = kit.loadTimeline(path.resolve(arg('--timeline', path.join(ROOT, 'outputs/tail-stability/narration/timeline.json'))));
const soundFile = path.resolve(arg('--sound', path.join(HERE, 'sound.json')));
const sound = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {events: []};
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);
const theme = kit.resolveTheme(ep.theme), stage = kit.createStage({theme});
const from = Math.max(0, +arg('--from', 0)), to = Math.min(tl.duration, +arg('--to', from + 4));
const out = path.resolve(arg('--out', path.join(ROOT, `outputs/tail-stability/dev_a/clip_${from}-${to}.mp4`)));
if (!(to > from)) throw new Error(`--to(${to}) 가 --from(${from}) 보다 커야 합니다`);

function frame(t) {
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  (ep.background || ((s, tt) => kit.background(s, tt)))(stage, t, ctx);
  stage.ctx.save(); ep.scenes[scene.id](stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
  if (argv.includes('--safe')) stage.drawSafeZones();
}
if (arg('--stills')) {
  const times = arg('--stills').split(',').map(Number).map(t => ({t, label: tl.sceneAt(t).id}));
  const dir = path.resolve(arg('--out', path.join(ROOT, 'outputs/tail-stability/dev_a/pick')));
  await kit.renderStills({stage, times, frame, outDir: dir, prefix: 'pick', cols: Math.min(5, times.length)});
  console.log(`[dev_clip] 정지화면 ${times.length}장 → ${path.relative(ROOT, dir)}`);
  process.exit(0);
}
await kit.renderVideo({stage, duration: to - from, start: from, frame, out, gain: false, preset: 'veryfast'});
console.log(`[dev_clip] ${from}–${to}초 → ${path.relative(ROOT, out)}`);
