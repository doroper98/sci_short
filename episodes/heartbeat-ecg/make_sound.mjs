// 62 심전도 — sound.json 을 model.mjs 의 같은 시계(plan)에서 만든다. 실행: node episodes/heartbeat-ecg/make_sound.mjs
// 모두 합성한 설명용 소리(녹음 아님). 기본음·잡음 대역 모두 700 Hz 아래(사용자 규칙). 병원 감시 장치의 맑은 '삐' 소리는 쓰지 않는다.
//  - 발화(동방결절): 아주 작은 낮은 틱(240 Hz) — 느리게 보는 장면에서만(실제 빠르기에서는 두 심장 소리만)
//  - 첫째 소리(방실판막 닫힘): 낮고 둔한 둥(62 Hz + 대역 잡음 40~180 Hz), 둘째 소리: 조금 높고 짧은 둥(92 Hz)
//    — 실제 심음의 녹음이 아니라 '닫히는 순간'을 알리는 표시음. 느리게 보는 장면에서도 음높이는 그대로(SOUND_DESIGN 7).
//  - 방실결절에서 머무는 동안: 낮은 지속음(110 Hz, 작게), 되감기: 낮은 쓸림, 세포가 뒤집힐 때: 짧은 틱
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import * as M from './model.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const tl = JSON.parse(fs.readFileSync(path.join(root, 'outputs/heartbeat-ecg/narration/timeline.json'), 'utf8'));
const R = M.plan(tl), ev = [];
const r3 = x => Math.round(x * 1000) / 1000;
const add = (id, at, kind, params, means) => ev.push({id, at: r3(at), kind, params, means});
const S1 = (id, at, g) => add(id, at, 'custom', {layers: [{kind: 'tone', params: {freq: 62, dur: 0.22, attack: 0.005, release: 0.18, gain_db: g}}, {kind: 'noise', params: {dur: 0.12, low: 40, high: 180, release: 0.1, gain_db: g - 6}}]}, '방실판막이 닫힘 — 첫째 심장 소리(설명용 표시음)');
const S2 = (id, at, g) => add(id, at, 'custom', {layers: [{kind: 'tone', params: {freq: 92, dur: 0.14, attack: 0.004, release: 0.11, gain_db: g}}, {kind: 'noise', params: {dur: 0.08, low: 60, high: 240, release: 0.07, gain_db: g - 7}}]}, '동맥판막이 닫힘 — 둘째 심장 소리(설명용 표시음)');
const SA = (id, at, g) => add(id, at, 'tick', {freq: 240, decay: 0.06, gain_db: g}, '동방결절이 발화');
const runEvents = (key, {sa = null, s1 = -16, s2 = -18} = {}) => {
  const run = R[key];
  for (const e of M.beatEvents(run)) {
    if (e.t < run.t0 - 1e-6 || e.t > (run.t1 ?? Infinity)) continue;
    const id = `${key}_${e.kind}_${e.beat}`;
    if (e.kind === 'sa' && sa != null) SA(id, e.t, sa);
    if (e.kind === 's1' && s1 != null) S1(id, e.t, s1);
    if (e.kind === 's2' && s2 != null) S2(id, e.t, s2);
  }
};
runEvents('hook0', {sa: -16, s1: -12});
add('rewind', 2.2, 'whoosh', {dur: 0.8, f_start: 480, f_end: 140, gain_db: -24}, '되감기');
runEvents('hookReal', {s1: -20, s2: -22});
runEvents('origin', {s1: -24, s2: -26});
// essence: 세포가 하나씩 뒤집힐 때(scenes.mjs 의 waves 와 같은 시각: s06 시작 + 0.9, s07 시작 + 0.3, 그 뒤 + 8×0.38 + 0.9)
const {CELLWAVES} = await import('./scenes.mjs');
for (const [wi, w] of CELLWAVES(tl).entries()) for (let i = 0; i < 8; i++) add(`cell${wi}_${i}`, w.t0 + i * w.step + 0.5 * w.step, 'tick', {freq: 330, decay: 0.035, gain_db: -26}, '세포 하나가 뒤집힘');
runEvents('core', {sa: -18, s1: -14, s2: -16});
runEvents('atria', {sa: -14});
// 방실결절에 머무는 동안(모형 시각 avIn → avOut)
for (const key of ['atria', 'avnode']) {
  const run = R[key], a = Math.max(M.EV.avIn, run.ms0), b = Math.min(M.EV.avOut, run.msEnd);
  if (b > a) { const t0 = run.t0 + (a - run.ms0) / run.rate, t1 = run.t0 + (b - run.ms0) / run.rate; add(`av_hold_${key}`, t0, 'tone', {freq: 110, dur: t1 - t0, attack: 0.4, release: 0.5, gain_db: -30}, '신호가 방실결절에 머묾'); }
}
runEvents('contract', {s1: -12, s2: -13});
runEvents('rate75', {s1: -20, s2: -22});
runEvents('rate120', {s1: -20, s2: -22});
runEvents('close', {s1: -21, s2: -23});
ev.sort((a, b) => a.at - b.at);
fs.writeFileSync(path.join(here, 'sound.json'), JSON.stringify({version: 1, notes: '설명용 합성음(녹음 아님). make_sound.mjs 가 model.mjs 의 같은 시계(plan)로 만든다 — 손으로 고치지 말 것. 기본음·잡음 대역 모두 700 Hz 아래, 병원 감시 장치의 삐 소리 없음.', ambient: {enabled: false}, events: ev}, null, 1) + '\n');
console.log(ev.length, 'events');
