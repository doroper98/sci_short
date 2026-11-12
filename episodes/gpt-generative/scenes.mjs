// Episode scenes — "GPT는 대답을 어떻게 쓸까" (43). Collector: export {theme, captionLayout, scenes, overlays, background, plan, soundEvents}.
// Plan: PLAN.md (§1 shared rules, §1.1 dynamic rules, §4 model, §5 stage, §6 scenes). Model: model.mjs. Stage and the
// writing engine: parts.mjs. Shared drawing: kit.mjs, motion.mjs. Scene modules:
//   scenes_intro.mjs → hook, origin, essence      scenes_token.mjs → token
//   scenes_core.mjs  → loop, dice                 scenes_end.mjs   → chat, wrong, close
// A module exports {scenes, titles, plan<Name>(tl, P), sound<Name>(tl, P), signature(P)}. Every event time is computed
// once in the plan functions from the timeline (kit.wd) and read by both the picture and the sound.
//
// node episodes/gpt-generative/scenes.mjs --emit-sound   → sound.json (run again whenever the timeline changes)
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';
import {POSTER} from './parts.mjs';
import * as intro from './scenes_intro.mjs';
import * as token from './scenes_token.mjs';
import * as core from './scenes_core.mjs';
import * as end from './scenes_end.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODS = [['Intro', intro], ['Token', token], ['Core', core], ['End', end]];

export const theme = K.theme;
export const captionLayout = K.captionLayout;
export const background = K.background;

// =====================================================================================================
// TIME PLAN — one object P for all modules (cached per timeline)
// =====================================================================================================
const PLANS = new WeakMap();
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P;
  P = {tl, end: tl.duration, sc: Object.fromEntries(tl.scenes.map(s => [s.id, s]))};
  P.MORPH = [0.9, 1.7];
  P.poster = tl.at('s22:end') - 1.4;
  PLANS.set(tl, P);
  for (const [name, m] of MODS) m['plan' + name]?.(tl, P);
  return P;
}

const TITLES = {};
for (const [, m] of MODS) Object.assign(TITLES, m.titles || {});
const titleList = (id, P) => (TITLES[id] ? TITLES[id](P) : [[-Infinity, '', '']]);

export function modelSignature(tl) {
  const P = plan(tl);
  return [tl.duration.toFixed(3), P.poster.toFixed(3), ...MODS.map(([, m]) => m.signature?.(P) ?? '')].join('/');
}
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events?.find?.(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/gpt-generative/scenes.mjs --emit-sound');
}
const wrap = fn => (stage, t, p, ctx) => { checkSoundTable(ctx); const P = plan(ctx.tl); ctx.P = P; fn(stage, t, p, {...ctx, P}); };
export const scenes = {};
for (const [, m] of MODS) for (const [id, fn] of Object.entries(m.scenes || {})) scenes[id] = wrap(fn);

// =====================================================================================================
// OVERLAYS — header, poster (0 s and the last 1.4 s), caption band, progress bar
// =====================================================================================================
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), sc = ctx.scene;
  if (id === 'hook' && t < P.MORPH[1]) { K.posterTitle(stage, POSTER, K.easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (t >= P.poster) { K.posterTitle(stage, POSTER, 1 - K.easeInOut((t - P.poster) / 0.8)); return; }
  K.captionBand(stage.ctx);
  const first = sc.start <= 1e-6, a = (first ? 1 : K.smooth((t - sc.start) / 0.3)) * K.fadeOut(t, P.poster - 0.3, 0.3);
  const L = titleList(id, P);
  if (id === 'hook' && t < P.MORPH[1] + 0.5) { const cur = L[0]; K.head(stage, cur[1], cur[2], K.fadeIn(t, P.MORPH[1] - 0.05, 0.4) * a, a); }
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
  for (const e of ev) {   // PLAN §1: fundamentals under 700 Hz, no panning
    const fs_ = [e.params.freq, ...(e.params.freqs || []), ...(e.params.layers || []).flatMap(l => [l.params.freq, ...(l.params.freqs || [])])].filter(x => x != null);
    if (fs_.some(f => f >= 700)) throw new Error('fundamental ≥ 700 Hz in ' + e.id);
  }
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
    notes: '설명용 합성음입니다(녹음 아님). 모든 사건은 `node episodes/gpt-generative/scenes.mjs --emit-sound`가 model.mjs·장면 모듈의 같은 시간 계획에서 써 넣습니다(손으로 고치지 마세요). 대응: 표지가 띠에 떨어짐 → 짧은 틱(배속이 오를수록 높고 촘촘하게), 조각이 글줄에 붙음 → 330 Hz, 끝 조각(■) → 220 Hz 맺음 음, 읽기·계산 → 낮은 스웰(느린 걸음에서만), 확률 막대가 자람 → 확률에 비례한 높이의 낮은 음, 자르는 선 → 틱. 모든 기본음 700 Hz 아래, 모노(패닝 없음). 배경음악·배경음 없음. 타임라인이 바뀌면 다시 실행하세요.',
    events,
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 1) + '\n');
  console.log(`events: ${events.length}; poster ${plan(tl).poster.toFixed(2)}; ` + MODS.map(([n, m]) => `${n} ${(m['sound' + n]?.(tl, plan(tl)) || []).filter(Boolean).length}`).join(', '));
}
