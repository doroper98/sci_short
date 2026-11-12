// 44 GPT는 어떻게 배웠을까 — collector: export {theme, captionLayout, scenes, overlays, background, plan, soundEvents}.
// Plan: PLAN.md (this folder) + ../gpt-generative/PLAN.md §1–3 and §1.1 (dynamic directive). Model: model.mjs (really trained).
// Shared drawing: ../gpt-generative/kit.mjs + motion.mjs (read-only here); this episode's parts: parts.mjs.
// Scene modules: scenes_core.mjs → guess, fix · scenes_intro.mjs → hook, origin, essence · scenes_after.mjs → scale, emerge,
// tune, frozen, close. A module exports {scenes, titles, plan<Name>(tl, P), sound<Name>(tl, P), signature(P)}.
//
// node episodes/gpt-pretrained/scenes.mjs --emit-sound   → sound.json (run again whenever the timeline changes)
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import * as K from '../gpt-generative/kit.mjs';
import * as core from './scenes_core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const optional = async name => (fs.existsSync(path.join(HERE, name)) ? import(pathToFileURL(path.join(HERE, name)).href) : null);
const intro = await optional('scenes_intro.mjs');
const after = await optional('scenes_after.mjs');
const MODS = [['Core', core], ['Intro', intro], ['After', after]].filter(([, m]) => m);

export const theme = K.theme;
export const captionLayout = K.captionLayout;
export const background = K.background;
/** poster (thumbnail) text: the question the whole video answers + its answer (brief.md 첫 프레임) */
export const POSTER = {q: ['GPT는 어떻게', '배웠을까?'], a: '다음 말 맞히기로', y: 560, y2: 858};

// =====================================================================================================
// TIME PLAN — one object P for all modules (cached per timeline)
// =====================================================================================================
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s]))};
  P.MORPH = [0.9, 1.7];
  P.poster = tl.at('s23:end') - 1.4;
  PLANS.set(tl, P);
  for (const [name, m] of MODS) m['plan' + name]?.(tl, P);
  return P;
}

// =====================================================================================================
// HEADERS
// =====================================================================================================
const TITLES = {};
for (const [, m] of MODS) Object.assign(TITLES, m.titles || {});
const titleList = (id, P) => (TITLES[id] ? TITLES[id](P) : [[-Infinity, '', '']]);

// =====================================================================================================
// SCENES
// =====================================================================================================
let staleWarned = false;
export function modelSignature(tl) {
  const P = plan(tl);
  return [tl.duration.toFixed(3), P.poster.toFixed(3), ...MODS.map(([, m]) => m.signature?.(P) ?? '')].join('/');
}
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events?.find?.(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/gpt-pretrained/scenes.mjs --emit-sound');
}
const wrap = fn => (stage, t, p, ctx) => { checkSoundTable(ctx); const P = plan(ctx.tl); ctx.P = P; fn(stage, t, p, {...ctx, P, plan: P}); };
const ALL = ['hook', 'origin', 'essence', 'guess', 'fix', 'scale', 'emerge', 'tune', 'frozen', 'close'];
export const scenes = {};
for (const id of ALL) scenes[id] = wrap(() => {});
for (const [, m] of MODS) for (const [id, fn] of Object.entries(m.scenes || {})) scenes[id] = wrap(fn);

// =====================================================================================================
// OVERLAYS — header, poster (0 s and the last 1.4 s), caption band, progress bar (screen-fixed, outside the camera)
// =====================================================================================================
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), sc = ctx.scene; ctx.P = P;
  if (id === 'hook' && t < P.MORPH[1]) { K.posterTitle(stage, POSTER, K.easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (t >= P.poster) { K.posterTitle(stage, POSTER, 1 - K.easeInOut((t - P.poster) / 0.8)); return; }
  K.captionBand(stage.ctx);
  const first = sc.start <= 1e-6, a = (first ? 1 : K.smooth((t - sc.start) / 0.3)) * K.fadeOut(t, sc.end - 0.3, 0.28) * K.fadeOut(t, P.poster - 0.3, 0.3);
  const L = titleList(id, P);
  if (id === 'hook') { const cur = L[0]; K.head(stage, cur[1], cur[2], K.fadeIn(t, P.MORPH[1] - 0.05, 0.4) * a, a); }
  else K.headList(stage, t, L, a);
  K.withAlpha(stage.ctx, id === 'hook' ? K.fadeIn(t, P.MORPH[1], 0.4) : 1, () => K.progressBar(stage, t, ctx.tl.duration));
}

// =====================================================================================================
// --emit-sound
// =====================================================================================================
export function soundEvents(tl) {
  const P = plan(tl), ev = [];
  for (const [name, m] of MODS) ev.push(...(m['sound' + name]?.(tl, P) || []).filter(Boolean));
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error('duplicate sound id ' + e.id); ids.add(e.id); }
  ev.sort((a, b) => a.at - b.at);
  if (ev.length) ev[0] = {...ev[0], model: {sig: modelSignature(tl)}};
  return ev;
}
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json'));
  const events = soundEvents(tl);
  const sound = {version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 모든 사건은 `node episodes/gpt-pretrained/scenes.mjs --emit-sound`가 model.mjs·각 장면 모듈의 같은 시간 계획에서 써 넣습니다(손으로 고치지 마세요). 대응: 가림막이 열림 → 392 Hz 틱, 확률 막대 → 막대 길이에 따른 160~420 Hz 짧은 음, 다이얼이 돎 → 330 Hz 틱(크게 틀림 → 큰 틱, 조금 틀림 → 작은 틱), 틀린 정도 → 110 Hz 긴 음, 거꾸로 가는 펄스 → 520→220 Hz 내려가는 처프, 30배로 고침 → 82 Hz 거친 음, 되감기 → 내려가는 쉬익, 타임랩스 → 빨라질수록 촘촘하고 높아지는 틱, 큰 숫자 → 147 Hz 틱. 모든 기본음 700 Hz 아래, 모노. 배경음악·배경음 없음. 타임라인이 바뀌면 다시 실행하세요.',
    events,
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 1) + '\n');
  const P = plan(tl);
  console.log(`events: ${events.length}; poster ${P.poster.toFixed(2)}; open ${P.guess.open.toFixed(2)}; back ${P.fix.back.toFixed(2)}; ff ${P.fix.ff0.toFixed(2)}→${P.fix.ffDone.toFixed(2)}`);
}
