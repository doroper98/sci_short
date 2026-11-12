// Episode scenes — "잠수함은 어떻게 찾을까" (38). Collector: export {theme, captionLayout, scenes, overlays, background, plan, soundEvents}.
// Plan: PLAN.md (구현 계획서), brief.md (기획). Model: model.mjs. Shared drawing: kit.mjs.
// Scene modules (each optional except core):
//   scenes_core.mjs  → sonar, layer                   (stage 1)
//   scenes_intro.mjs → hook, origin, essence, close   (stage 2, worker B)
//   scenes_air.mjs   → buoy, mad, mast                (stage 2, worker C)
// A module exports {scenes, titles?, plan<Name>(tl, P)?, sound<Name>(tl, P)?}; scenes.mjs imports it if the file exists
// and otherwise draws a stub (background + header + empty instrument strip) for its scenes.
//
// node episodes/submarine-detection/scenes.mjs --emit-sound   → sound.json (run again whenever the timeline changes)
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';
import * as core from './scenes_core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const optional = async name => (fs.existsSync(path.join(HERE, name)) ? import(pathToFileURL(path.join(HERE, name)).href) : null);
const intro = await optional('scenes_intro.mjs');
const air = await optional('scenes_air.mjs');
const MODS = [['Core', core], ['Intro', intro], ['Air', air]].filter(([, m]) => m);

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
  P.poster = tl.at('s23:end') - 1.4;
  PLANS.set(tl, P);
  for (const [name, m] of MODS) m['plan' + name]?.(tl, P);
  return P;
}

// =====================================================================================================
// HEADERS — stub lists from PLAN §6 (a module's `titles[id]` replaces its scene's list)
// =====================================================================================================
const STUB_TITLES = {
  hook: P => [[-Infinity, '오늘의 주제', '잠수함은 어떻게 찾을까?']],
  origin: P => { const at = s => P.tl.at(s) - 0.5; return [[-Infinity, '제2차 세계대전', '떠오르면 레이더에 들켰다'], [at('s04'), '이름 · 哨戒', '망보며 경계하는 비행기'], [at('s05'), '1955 · 빨리 감기', '공기 없이 몇 달씩 물속에']]; },
  essence: P => [[-Infinity, '본질', '모습은 가려도 흔적은 남는다']],
  buoy: P => { const at = s => P.tl.at(s) - 0.5; return [[-Infinity, '메커니즘 ③ · 12배 빠르게 감기', '멈출 수 없는 초계기는 부표를 쓴다'], [at('s17'), '메커니즘 ③ · 소리는 실제 빠르기', '듣고, 전파로 올려 보낸다'], [at('s18'), '메커니즘 ③ · 소리는 실제 빠르기', '크기를 비교해 좁힌다']]; },
  mad: P => [[-Infinity, '메커니즘 ④ · 크기 과장', '꼬리 끝의 자기 탐지기'], [P.tl.at('s20') - 0.5, '메커니즘 ④ · 크기 과장', '두 배 멀면 8분의 1']],
  mast: P => [[-Infinity, '메커니즘 ⑤', '물 밖으로 내민 관']],
  close: P => [[-Infinity, '정리', '숨길 수 없는 흔적']],
};
const TITLES = {...STUB_TITLES};
for (const [, m] of MODS) Object.assign(TITLES, m.titles || {});
const titleList = (id, P) => (TITLES[id] ? TITLES[id](P) : [[-Infinity, '', '']]);

// =====================================================================================================
// SCENES — module scenes over stubs
// =====================================================================================================
let staleWarned = false;
export function modelSignature(tl) {
  const P = plan(tl), r = x => (x == null ? '-' : x.toFixed(3));
  return [tl.duration.toFixed(3), r(P.sonar?.tp1), r(P.sonar?.tp2), r(P.layer?.tq1), r(P.layer?.tq2), r(P.layer?.tq3), r(P.poster), ...MODS.map(([, m]) => m.signature?.(P) ?? '')].join('/');
}
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events?.find?.(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/submarine-detection/scenes.mjs --emit-sound');
}
/** stub: background (drawn by render) + empty instrument strip; the header comes from overlays */
const stub = (stage, t, p, ctx) => { const sc = ctx.scene, a = K.actorAlpha(t, sc, ctx.tl); if (t > 0.05) K.panel(stage, a * (sc.id === 'hook' ? K.fadeIn(t, 1.7, 0.4) : 1)); };
const wrap = fn => (stage, t, p, ctx) => { checkSoundTable(ctx); const P = plan(ctx.tl); ctx.P = P; fn(stage, t, p, {...ctx, P, plan: P}); };
const ALL = ['hook', 'origin', 'essence', 'sonar', 'layer', 'buoy', 'mad', 'mast', 'close'];
export const scenes = {};
for (const id of ALL) scenes[id] = wrap(stub);
for (const [, m] of MODS) for (const [id, fn] of Object.entries(m.scenes || {})) scenes[id] = wrap(fn);

// =====================================================================================================
// OVERLAYS — header, poster (0 s and the last 1.4 s), caption band, progress bar
// =====================================================================================================
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), sc = ctx.scene; ctx.P = P;
  if (id === 'hook' && t < P.MORPH[1]) { K.posterTitle(stage, K.easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (t >= P.poster) { K.posterTitle(stage, 1 - K.easeInOut((t - P.poster) / 0.8)); return; }
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
  if (!intro?.soundIntro) {   // worker B's soundIntro emits the two poster swells; until then the collector does
    ev.push(K.snd.swell('poster', 0.05, [98, 147], 1.8, -34, '첫 화면(썸네일): 포스터 구도'));
    ev.push(K.snd.swell('poster_end', P.poster, [98, 147], 1.8, -34, '포스터 구도로 돌아옴'));
  }
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
    notes: '설명용 합성음입니다(녹음 아님). 모든 사건은 `node episodes/submarine-detection/scenes.mjs --emit-sound`가 model.mjs·각 장면 모듈의 같은 시간 계획에서 써 넣습니다(손으로 고치지 마세요). 대응: 잠수함 프로펠러 파면 → 82 Hz 낮은 박동, 능동 소나를 쏨 → 440 Hz 짧은 음, 메아리 도착 → 330 Hz(sonar 장면은 쏜 뒤 정확히 2.0초, layer 장면은 화면 4배 빠르기의 도착 프레임), 위치가 드러남 → 220 Hz, 소리 묶음이 꺾임 → 300→220 Hz, 소리 그늘 → 침묵, 소나를 내림 → 낮은 쉬익, 큰 숫자 → 147 Hz 틱. 모든 기본음 700 Hz 아래, 모노. 배경음악·배경음 없음. 타임라인이 바뀌면 다시 실행하세요.',
    events,
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 1) + '\n');
  const P = plan(tl), L = P.layer;
  console.log(`events: ${events.length}; sonar tp ${P.sonar.pings.map(x => x.toFixed(2)).join(' ')}; layer tq1 ${L.tq1.toFixed(2)} tq2 ${L.tq2.toFixed(2)} tq3 ${L.tq3.toFixed(2)}; aim tow ${L.aim2.th}° miss ${L.aim2.miss.toFixed(1)} m hit ${L.aim2.tHit.toFixed(2)} s; aim dip ${L.aim3.th}° miss ${L.aim3.miss.toFixed(1)} m hit ${L.aim3.tHit.toFixed(2)} s; pings ${L.pings1.length}/${L.pings2.length}/${L.pings3.length}; poster ${P.poster.toFixed(2)}`);
}
