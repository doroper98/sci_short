// 66 꼬리날개 — 모듈 C(yaw, tailless, close) 확인용 정지화면. render.mjs 와 같은 프레임 순서(배경 → 장면 → overlays → 자막).
//   SCISHORT_ROOT=$PWD node episodes/tail-stability/tools/dev_c.mjs [--safe] [t1 t2 …]
// 결과: outputs/tail-stability/dev_c/frames/ (Git 제외). 시각을 주지 않으면 아래 목록(낱말·사건 기준)을 쓴다.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), EP = path.resolve(HERE, '..');
const ROOT = process.env.SCISHORT_ROOT || path.resolve(EP, '../..');
const OUT = path.join(ROOT, 'outputs/tail-stability/dev_c/frames');
const kit = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
const ep = await import(pathToFileURL(path.join(EP, 'scenes.mjs')));
const tl = kit.loadTimeline(path.join(ROOT, 'outputs/tail-stability/narration/timeline.json'));
const sound = JSON.parse(fs.readFileSync(path.join(EP, 'sound.json'), 'utf8'));
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);
const theme = kit.resolveTheme(ep.theme), stage = kit.createStage({theme});
const safe = process.argv.includes('--safe');
function frame(t) {
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  (ep.background || ((s, tt) => kit.background(s, tt)))(stage, t, ctx);
  stage.ctx.save(); ep.scenes[scene.id](stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
  if (safe) stage.drawSafeZones();
}
const E = id => events.get(id).time, W = (s, w) => tl.wordStart(s, w);
const args = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number);
const times = args.length ? args.map(t => ({t, label: 't'})) : [
  ['yaw-flip', tl.scene('yaw').start + 0.4], ['yaw-kick', E('c_kick_y') + 0.3], ['yaw-hold', W('s18', '수직') + 0.4],
  ['yaw-release', E('c_release_y') + 0.9], ['yaw-over', E('c_release_y') + 1.7], ['yaw-vane', E('c_turn') - 0.3],
  ['yaw-turn', E('c_turn') + 0.7], ['yaw-turned', E('c_turn') + 2.0], ['yaw-back', E('c_turnback') + 1.2], ['yaw-end', tl.scene('yaw').end - 0.05],
  ['tl-detach', E('c_detach') + 0.35], ['tl-morph', E('c_detach') + 0.85], ['tl-comp', W('s21', '컴퓨터가') + 0.2],
  ['tl-signal', E('c_flap1') - 0.07], ['tl-flap1', E('c_flap1') + 0.2], ['tl-flap2', E('c_flap2') + 0.2], ['tl-flap4', E('c_flap4') + 0.2], ['tl-flap6', E('c_flap6') + 0.25],
  ['tl-flip2', E('c_flip2') + 0.25], ['tl-flip2b', E('c_flip2') + 0.6], ['tl-fold1', E('c_fold1') + 0.15], ['tl-fold3', E('c_fold3') + 0.35],
  ['tl-bend', E('c_bend') + 0.6], ['tl-gust', E('c_kick_pp') + 0.5], ['tl-end', tl.scene('tailless').end - 0.1],
  ['close-x', tl.scene('close').start + 0.25], ['close-pre', E('c_kick_c') - 0.2], ['close-kick', E('c_kick_c') + 0.4], ['close-up', E('c_kick_c') + 1.0],
  ['close-over', E('c_kick_c') + 1.8], ['close-dim', tl.sentence('s24').start + 0.3], ['close-end', tl.duration - 0.3],
].map(([label, t]) => ({t, label}));
fs.mkdirSync(OUT, {recursive: true});
await kit.renderStills({stage, times, frame, outDir: OUT, prefix: 'c', cols: 6});
