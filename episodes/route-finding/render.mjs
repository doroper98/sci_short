// node episodes/<slug>/render.mjs --stills | --video  [--timeline F] [--out DIR] [--scenes F] [--sound F] [--safe]
// 질감 층(2026-11-22 사용자: "그레인이 조금 … 적당한 빛(절대 과하지는 않은)"): 테마가 film 이면 바탕은 filmBackground(숯색),
// 자막까지 그린 뒤 맨 마지막에 filmLook(lit() 둘레 번짐 → 비네트 → 그레인)을 건다. scenes.mjs 가 `export const look = false` 면
// 질감 층만 꺼지고(숯색 바탕은 그대로), 다른 테마면 둘 다 꺼져 예전 모습이다. 기준: docs/ANIMATION_QUALITY.md 2026-11-22 절, 수치 config/look.json.
// `export const look = {…}`(객체)면 config/look.json 위에 구획별로 덮어쓴다 — 편마다 바꾸는 것은 '밝은 곳의 자리'(background 의 cx·cy·r0·r1)
// 정도이고 세기는 config/look.json 에 둔다.
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
const lookOpt = kit.loadLook(ep.look && typeof ep.look === 'object' ? ep.look : {});   // 한 번만 만든다(편별 덮어쓰기)
const defaultBackground = film ? s => kit.filmBackground(s, lookOpt) : (s, tt) => kit.background(s, tt);
function frame(t) {
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  (ep.background || defaultBackground)(stage, t, ctx);
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
  // 고정 질감은 비트레이트를 올린다 — 66번 전체 기준 crf 18 은 48.5 MB, crf 20 은 39.7 MB 이고 질감 수치는 같다(samples/look-proposal-grain/README.md).
  // 완성본 mp4 는 Git 에 들어가므로 50 MB 를 넘기지 않는다: 질감 층이 켜진 편만 crf 20, 끄면 기본 18.
  await kit.renderVideo({stage, duration: tl.duration, frame, out: path.join(out, 'visual.mp4'), ...(useLook ? {crf: 20} : {})});
} else {
  const times = tl.scenes.flatMap(s => [{t: s.start + Math.min(0.6, (s.end - s.start) / 3), label: s.id + '-start'}, {t: (s.start + s.end) / 2, label: s.id + '-mid'}])
    .concat(events.filter(e => !/_settle_|_relax_|^ping_/.test(e.id)).map(e => ({t: Math.min(tl.duration - 0.01, e.time + 0.12), label: 'event-' + e.id}))).sort((a, b) => a.t - b.t);
  await kit.renderStills({stage, times, frame, outDir: path.join(out, 'stills')});
}
