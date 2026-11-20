// 66 꼬리날개 — 모듈 B(origin, essence) 확인용 정지화면. 장면 코드가 아니다.
//   SCISHORT_ROOT=$PWD node episodes/tail-stability/tools/dev_b.mjs [t1 t2 …]     → outputs/tail-stability/dev_b/frames/
// 시각을 주지 않으면 origin·essence 의 핵심 시각을 고른다. render.mjs 의 frame() 과 같은 순서로 그린다(배경 → 장면 → overlays → 자막).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), EP = path.resolve(HERE, '..');
const ROOT = process.env.SCISHORT_ROOT || path.resolve(EP, '../..');
const OUT = path.join(ROOT, 'outputs/tail-stability/dev_b/frames');
const kit = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
const ep = await import(pathToFileURL(path.join(EP, 'scenes.mjs')));
const tl = kit.loadTimeline(path.join(ROOT, 'outputs/tail-stability/narration/timeline.json'));
const sound = JSON.parse(fs.readFileSync(path.join(EP, 'sound.json'), 'utf8'));
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);
const theme = kit.resolveTheme(ep.theme), stage = kit.createStage({theme});
function frame(t) {
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  (ep.background || ((s, tt) => kit.background(s, tt)))(stage, t, ctx);
  stage.ctx.save(); ep.scenes[scene.id](stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
}
const ev = id => events.get(id).time;
let times = process.argv.slice(2).map(Number).filter(x => !Number.isNaN(x));
if (!times.length) {
  const O = tl.scene('origin'), E = tl.scene('essence');
  times = [O.start + 0.25, O.start + 0.7, ev('b_kick_a1') + 0.12, ev('b_kick_a2') + 0.15, ev('b_morph1') + 0.6, ev('b_etym') + 0.8,
    ev('b_year') + 0.5, ev('b_mark40') + 0.2, ev('b_kick_p1') + 0.2, ev('b_kick_p2') + 0.2, ev('b_propstop') + 0.3, O.end - 0.5, O.end - 0.1,
    E.start + 0.1, ev('b_kick_e1') + 0.25, ev('b_flip1') + 0.3, ev('b_kick_e3') + 0.25, ev('b_flip2') + 0.5, ev('b_slide') + 0.8, ev('b_balance') + 0.05,
    ev('b_slide') + 3.5, ev('b_ruler') + 0.6, ev('b_inset') + 0.6, ev('b_kick_e5') + 0.25, ev('b_kick_e5') + 0.6, E.end - 0.15];
}
fs.mkdirSync(OUT, {recursive: true});
await kit.renderStills({stage, times: times.map(t => ({t, label: tl.sceneAt(t).id})), frame, outDir: OUT, prefix: 'b', cols: 6});
