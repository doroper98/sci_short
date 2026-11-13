// Episode scenes — "GPT는 그림을 어떻게 그릴까" (46). Collector: export {theme, captionLayout, scenes, overlays, background, plan, soundEvents}.
// Plan: PLAN.md (§1 model, §2 stage, §3 scenes) + episodes/gpt-generative/PLAN.md §1, §1.1, §1.2 (shared rules).
// Model: model.mjs. Stage and the board engine: parts.mjs. Shared drawing: ../gpt-generative/{kit,motion}.mjs (read-only).
// Scene modules:
//   scenes_intro.mjs → hook, origin            scenes_token.mjs → token, line, learn
//   scenes_draw.mjs  → draw, vary, mix          scenes_end.mjs   → other, close
// A module exports {scenes, titles, plan<Name>(tl, P), sound<Name>(tl, P), signature(P)}. Every event time is computed
// once in the plan functions from the timeline (kit.wd, tts text) and read by both the picture and the sound.
//
// node episodes/gpt-image/scenes.mjs --emit-sound   → sound.json (run again whenever the timeline changes)
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import * as K from '../gpt-generative/kit.mjs';
import {POSTER} from './parts.mjs';
import * as intro from './scenes_intro.mjs';
import * as token from './scenes_token.mjs';
import * as draw from './scenes_draw.mjs';
import * as end from './scenes_end.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODS = [['Intro', intro], ['Token', token], ['Draw', draw], ['End', end]];

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
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound.json is stale — run node episodes/gpt-image/scenes.mjs --emit-sound');
}
const wrap = fn => (stage, t, p, ctx) => { checkSoundTable(ctx); const P = plan(ctx.tl); ctx.P = P; fn(stage, t, p, {...ctx, P}); };
export const scenes = {};
for (const [, m] of MODS) for (const [id, fn] of Object.entries(m.scenes || {})) scenes[id] = wrap(fn);

// -----------------------------------------------------------------------------------------------------
// poster title, local variant of kit.posterTitle (2026-11-13 첫 프레임 = 흰 물음 위, 주제어 크게): the warm line is the
// topic keyword, drawn up to POSTER.AS px (a short keyword like "GPT" may be far bigger than the kit's 150 px cap).
// q = 0 poster, q = 1 header title (the question lines slide onto one line at 228, 56 px; the keyword shrinks toward
// 292 and fades, so it always stays below the question and never crosses it).
// -----------------------------------------------------------------------------------------------------
const PSIZE = new WeakMap();
function posterTitle(stage, POSTER, q, a = 1) {
  const c = stage.ctx, Q = [].concat(POSTER.q), fnt = s => ({role: 'display', weight: 700, size: s, tracking: -0.03 * s});
  const fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, fnt(max)));
  let S = PSIZE.get(POSTER);
  if (!S) { S = {QS: Math.min(...Q.map(s => fit(s, POSTER.qw ?? 880, POSTER.QM ?? 104))), AS: fit(POSTER.a, 860, POSTER.AS ?? 150)}; PSIZE.set(POSTER, S); }
  const {QS, AS} = S, NS = POSTER.NS ?? QS * 0.85, LH = QS * 1.14, tr = K.lerp(-0.03, -0.011, q), s1 = K.lerp(QS, 56, q);
  const wf = Q.map(s => stage.measure(s, {role: 'display', weight: 700, size: 56, tracking: -0.011 * 56})), sp = 56 * 0.28;
  let xh = 540 - (wf.reduce((x, y) => x + y, 0) + sp * (Q.length - 1)) / 2;
  const hx = wf.map(w => { const x = xh + w / 2; xh += w + sp; return x; });
  const yTop = POSTER.y - QS * 0.75, yBot = POSTER.y2 + AS * 0.55 + (POSTER.n ? NS * 1.4 : 0);
  if (q < 1) K.withAlpha(c, (1 - q) * a, () => { const g = c.createLinearGradient(0, yTop - 60, 0, yBot + 60); g.addColorStop(0, 'rgba(0,10,16,0)'); g.addColorStop(0.25, 'rgba(0,10,16,0.55)'); g.addColorStop(0.75, 'rgba(0,10,16,0.55)'); g.addColorStop(1, 'rgba(0,10,16,0)'); c.fillStyle = g; c.fillRect(0, yTop - 60, K.W, yBot - yTop + 120); });
  K.withAlpha(c, a, () => {
    const sh = 'rgba(0,0,0,0.9)';
    const qx = K.smooth(q / 0.45), qy = K.smooth((q - 0.4) / 0.6), yc = K.lerp(POSTER.y + (Q.length - 1) * LH / 2, 228, q), k = s1 / 56;
    Q.forEach((s, i) => stage.text(s, 540 + (hx[i] - 540) * k * qx, yc + (i - (Q.length - 1) / 2) * LH * (s1 / QS) * (1 - qy), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, tracking: tr * s1}));
    // keyword, and on its own centred line below it the series count ("1 of 4", 2026-11-13 owner: "줄 바꾸고 질문보다 살짝
    // 작은 폰트로 가운데정렬해서 1 of 4"): white, NS px (default 0.85 × the question), baseline NS × 1.3 under the keyword's
    const sa = K.lerp(AS, 34, q), k2 = sa / AS, yb = K.lerp(POSTER.y2, 292, q) + 0.36 * sa, sn = NS * k2;
    K.withAlpha(c, 1 - K.smooth(q / 0.6), () => {
      stage.text(POSTER.a, 540, yb, {role: 'display', weight: 700, size: sa, tracking: tr * sa, color: K.PAL.warm, align: 'center', baseline: 'alphabetic', shadow: sh, shadowBlur: 28});
      if (POSTER.n) stage.text(POSTER.n, 540, yb + (POSTER.ngap ?? 1.3) * sn, {role: 'display', weight: 700, size: sn, tracking: -0.01 * sn, color: '#FFFFFF', align: 'center', baseline: 'alphabetic', shadow: sh, shadowBlur: 22});
    });
  });
}

// =====================================================================================================
// OVERLAYS — header, poster (0 s and the last 1.4 s), caption band, progress bar
// =====================================================================================================
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl), sc = ctx.scene;
  if (id === 'hook' && t < P.MORPH[1]) { posterTitle(stage, POSTER, K.easeInOut((t - P.MORPH[0]) / (P.MORPH[1] - P.MORPH[0]))); return; }
  if (t >= P.poster) { posterTitle(stage, POSTER, 1 - K.easeInOut((t - P.poster) / 0.8)); return; }
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
  for (const e of ev) {   // fundamentals under 700 Hz, no panning
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
    notes: '설명용 합성음입니다(녹음 아님). 모든 사건은 `node episodes/gpt-image/scenes.mjs --emit-sound`가 model.mjs·장면 모듈의 같은 시간 계획에서 써 넣습니다(손으로 고치지 마세요). 대응: 표지가 띠에 떨어져 칸이 채워짐 → 짧은 틱(빨리 감을수록 높고 촘촘하게, 묶음), 조각이 붙음 → 낮은 음, 읽기 → 낮은 스웰, 자르는 선 → 틱 묶음, 잡음이 걷힘 → 걸음마다 음(맑아질수록 높게), 가림막 → 낮게 덮는 음. 모든 기본음 700 Hz 아래, 모노(패닝 없음). 배경음악·배경음 없음. 타임라인이 바뀌면 다시 실행하세요.',
    events,
    ambient: {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16], enabled: false},
    music: {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0, enabled: false, note: '음악 없음.'}};
  fs.writeFileSync(soundFile, JSON.stringify(sound, null, 1) + '\n');
  console.log(`events: ${events.length}; poster ${plan(tl).poster.toFixed(2)}; ` + MODS.map(([n, m]) => `${n} ${(m['sound' + n]?.(tl, plan(tl)) || []).filter(Boolean).length}`).join(', '));
}
