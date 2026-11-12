// Episode scenes — "GPT는 문맥을 어떻게 읽을까" (45). Collector: export {theme, captionLayout, scenes, overlays, background, plan, soundEvents}.
// Plan: PLAN.md (구현 계획서, + ../gpt-generative/PLAN.md §1–3, §1.1 다이내믹 지침). Model: model.mjs. Shared drawing: ../gpt-generative/kit.mjs
// (read-only) and ../gpt-generative/motion.mjs; local helpers: parts.mjs.
// Scene modules:
//   scenes_intro.mjs → hook, origin, essence      (s01–s09)
//   scenes_core.mjs  → attend, swap               (s10–s15, the key mechanism)
//   scenes_out.mjs   → layers, far, learned, close (s16–s21)
// A module exports {scenes, titles, plan<Name>(tl, P), sound<Name>(tl, P), signature(P)}.
//
// node episodes/gpt-transformer/scenes.mjs --emit-sound   → sound.json (run again whenever the timeline changes)
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import * as K from '../gpt-generative/kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const optional = async name => (fs.existsSync(path.join(HERE, name)) ? import(pathToFileURL(path.join(HERE, name)).href) : null);
const intro = await optional('scenes_intro.mjs');
const core = await optional('scenes_core.mjs');
const out = await optional('scenes_out.mjs');
const MODS = [['Intro', intro], ['Core', core], ['Out', out]].filter(([, m]) => m);

export const theme = K.theme;
export const captionLayout = K.captionLayout;
export const background = K.background;
export const POSTER = {q: ['GPT는 문맥을', '어떻게 읽을까?'], a: '앞말을 살펴서', y: 612, y2: 884};

// =====================================================================================================
// TIME PLAN — one object P for all modules (cached per timeline)
// =====================================================================================================
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s]))};
  P.MORPH = [0.9, 1.7];
  P.poster = tl.at('s21:end') - 1.4;
  PLANS.set(tl, P);
  for (const [name, m] of MODS) m['plan' + name]?.(tl, P);
  return P;
}

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
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/gpt-transformer/scenes.mjs --emit-sound');
}
const stub = () => {};
const wrap = fn => (stage, t, p, ctx) => { checkSoundTable(ctx); const P = plan(ctx.tl); ctx.P = P; fn(stage, t, p, {...ctx, P}); };
const ALL = ['hook', 'origin', 'essence', 'attend', 'swap', 'layers', 'far', 'learned', 'close'];
export const scenes = {};
for (const id of ALL) scenes[id] = wrap(stub);
for (const [, m] of MODS) for (const [id, fn] of Object.entries(m.scenes || {})) scenes[id] = wrap(fn);

// =====================================================================================================
// OVERLAYS — header, poster (0 s and the last 1.4 s), caption band, progress bar (screen-fixed)
// =====================================================================================================
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), sc = ctx.scene; ctx.P = P;
  if (id === 'hook' && t < P.MORPH[1]) { K.posterTitle(stage, POSTER, K.easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (t >= P.poster) { K.posterTitle(stage, POSTER, 1 - K.easeInOut((t - P.poster) / 0.8)); return; }
  K.captionBand(stage.ctx);
  const L = titleList(id, P);
  if (id === 'hook' && t < P.MORPH[1] + 0.5) { const cur = L[0]; K.head(stage, cur[1], cur[2], K.fadeIn(t, P.MORPH[1] - 0.05, 0.4), 1); }
  else K.headList(stage, t, L, 1);
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
    notes: '설명용 합성음입니다(녹음 아님). 모든 사건은 `node episodes/gpt-transformer/scenes.mjs --emit-sound`가 model.mjs·각 장면 모듈의 같은 시간 계획에서 써 넣습니다(손으로 고치지 마세요). 대응: 주의의 선이 뻗음 → 부드러운 음(196·294 Hz), 주의 막대가 자람 → 길이에 따른 높이의 짧은 음(220~520 Hz), 낱말·점이 찍힘 → 틱, 기억 덩어리가 한 칸 건너뜀 → 첫 낱말의 몫에 따라 낮아지는 틱, 점이 탈것 쪽으로 끌려감 → 올라가는 음, 과일 쪽 → 내려가는 음, 층 → 층마다 한 음씩 높아짐, 큰 숫자 → 147 Hz 틱. 모든 기본음 700 Hz 아래, 모노(패닝 없음). 배경음악·배경음 없음. 타임라인이 바뀌면 다시 실행하세요.',
    events,
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 1) + '\n');
  const fmax = Math.max(...events.flatMap(e => [e.params?.freq || 0, ...(e.params?.freqs || []), ...((e.params?.points || []).map(p => p[1])), ...((e.params?.layers || []).map(l => l.params?.freq || 0))]));
  console.log(`events: ${events.length}; highest fundamental ${fmax} Hz; poster ${P0(tl).toFixed(2)}`);
}
function P0(tl) { return plan(tl).poster; }
