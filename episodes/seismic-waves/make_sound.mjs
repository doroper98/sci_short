// 57 지진파 — sound.json 을 model.mjs(같은 시계)에서 만든다. 실행: node episodes/seismic-waves/make_sound.mjs
// 모두 합성한 설명용 소리(녹음 아님). 기본음·잡음 대역은 700 Hz 아래(사용자 규칙).
// 미끄러짐 = 낮은 둔한 울림, P 도착 = 짧은 낮은 틱(220 Hz, 작게), S 도착 = 더 낮고 긴 울림(130 Hz, 크게) — 소리의 크기 차이는 흔들림의 크기 차이.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import * as M from './model.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const {COUNT} = await import('./scenes.mjs');
const R = M.RUNS, ev = [];
const r3 = x => Math.round(x * 1000) / 1000;
const add = (id, at, kind, params, means) => ev.push({id, at: r3(at), kind, params, means});
const slip = (id, at, g = -10) => add(id, at, 'custom', {layers: [{kind: 'tone', params: {freq: 70, dur: 0.7, attack: 0.01, release: 0.5, gain_db: g}}, {kind: 'noise', params: {dur: 0.5, low: 50, high: 260, release: 0.4, gain_db: g - 4}}]}, '단층이 미끄러짐(진원)');
const pArr = (id, at, g = -16) => add(id, at, 'tick', {freq: 220, decay: 0.12, gain_db: g}, 'P파가 닿음(작은 흔들림)');
const sArr = (id, at, g = -9) => add(id, at, 'custom', {layers: [{kind: 'tone', params: {freq: 130, dur: 0.8, attack: 0.02, release: 0.6, gain_db: g}}, {kind: 'noise', params: {dur: 0.7, low: 60, high: 320, release: 0.5, gain_db: g - 6}}]}, 'S파가 닿음(큰 흔들림)');
const atR = (run, tau) => run.timeOf(tau);
// hook
slip('h0_slip', 0.0); pArr('h0_p', atR(R.h0, M.tP(100))); sArr('h0_s', atR(R.h0, M.tS(100)));
add('h0_rewind', 2.0, 'whoosh', {dur: 1.3, f_start: 520, f_end: 120, gain_db: -22}, '되감기');
slip('h1_slip', R.h1.t0); pArr('h1_p', atR(R.h1, M.tP(100))); sArr('h1_s', atR(R.h1, M.tS(100)));
const d2 = Math.hypot(M.xAt(100) - M.HX, M.SURF + 60 - M.HY) / M.KM;
pArr('h2_p', atR(R.h2, d2 / M.VP), -18); sArr('h2_s', atR(R.h2, d2 / M.VS), -12);
// origin(드럼 지진계)
const {ORIGIN} = await import('./scenes.mjs');
pArr('or_p', ORIGIN.timeOf(M.tP(100)), -16); sArr('or_s', ORIGIN.timeOf(M.tS(100)), -11);
// essence
for (const [id, at, f] of [['es_press', 41.5, 200], ['es_release', 42.5, 260], ['es_twist', 44.2, 170], ['es_release2', 45.0, 230]]) add(id, at, 'tick', {freq: f, decay: 0.1, gain_db: -18}, '덩어리를 누름·놓음·비틂');
const chainTicks = (key, f, g) => { const run = M.CHAIN_RUNS[key]; for (let i = 0; i < M.CHAIN.n; i++) { const t = M.chainArrive(run, i); if (isFinite(t)) add(`${key}_${i}`, t, 'tick', {freq: f + (run.water && i >= M.CHAIN.water ? -40 : 0), decay: 0.06, gain_db: g}, `${run.kind === 'push' ? '미는' : '비트는'} 흔들림이 ${i + 1}번째 덩어리에 닿음`); } };
chainTicks('push8', 300, -20); chainTicks('racePush', 330, -21); chainTicks('raceTwist', 190, -20); chainTicks('waterPush', 300, -20); chainTicks('waterTwist', 190, -19);
// pwave
slip('p1_slip', R.p1.t0, -14); pArr('p1_trk', atR(R.p1, (M.TRKX - M.HX) / M.KM / M.VP), -14);
slip('p2_slip', R.p2.t0, -14); for (let s = 1; s <= 4; s++) add(`p2_sec${s}`, R.p2.t0 + s, 'tick', {freq: 400, decay: 0.04, gain_db: -24}, `P 앞면이 ${s * 6} km — 1초`);
// swave
slip('s1_slip', R.s1.t0, -14); sArr('s1_trk', atR(R.s1, (M.TRKX - M.HX) / M.KM / M.VS), -11);
slip('s2_slip', R.s2.t0, -14); for (let s = 1; s <= 6; s++) add(`s2_sec${s}`, R.s2.t0 + s, 'tick', {freq: 360, decay: 0.04, gain_db: -24}, `S 앞면이 ${s * 3.5} km — 1초`);
// speed(크기만 다름: 소리도 크기만 다름)
slip('qa_slip', R.qa.t0, -18); pArr('qa_p', atR(R.qa, M.tP(100)), -22); sArr('qa_s', atR(R.qa, M.tS(100)), -17);
slip('qb_slip', R.qb.t0, -8); pArr('qb_p', atR(R.qb, M.tP(100)), -14); sArr('qb_s', atR(R.qb, M.tS(100)), -7);
// distance
slip('d1_slip', R.d1.t0, -12);
pArr('d1_p50', atR(R.d1, M.tP(50))); sArr('d1_s50', atR(R.d1, M.tS(50)), -11); pArr('d1_p100', atR(R.d1, M.tP(100)), -18); sArr('d1_s100', atR(R.d1, M.tS(100)), -12);
for (const [key, dkm] of [['near', 50], ['far', 100]]) { const n = Math.floor(M.tS(dkm) - M.tP(dkm) + 1e-6); for (let k = 1; k <= n; k++) add(`cnt_${key}${k}`, COUNT[key].t0 + k * COUNT[key].step, 'tick', {freq: 440, decay: 0.035, gain_db: -23}, `간격 ${k}초 — 8 km`); }
// warning
const W = M.WARN;
slip('w1_slip', R.w1.t0, -12); pArr('w1_detect', atR(R.w1, W.detect), -15); sArr('w1_nearS', atR(R.w1, W.nearS), -11);
add('w1_alert', atR(R.w1, W.alert), 'custom', {layers: [{kind: 'tone', params: {freq: 523, dur: 0.12, gain_db: -18}}, {kind: 'tone', params: {freq: 440, dur: 0.16, gain_db: -18}, offset: 0.16}]}, '경보가 나감');
add('w1_cityAlert', atR(R.w1, W.cityAlert), 'tick', {freq: 523, decay: 0.08, gain_db: -19}, '도시에 경보가 닿음');
pArr('w1_cityP', atR(R.w1, M.tP(W.city)), -18); sArr('w1_cityS', atR(R.w1, W.cityS), -10);
// core
const CR = M.CORE_RUN, at = tau => CR.t0 + tau / CR.rate;
slip('co_slip', CR.t0, -12);
const cmbT = Math.min(...M.RAYS.S.filter(r => r[r.length - 1].end === 'cmb').map(r => r[r.length - 1].t));
add('co_s_cmb', at(cmbT), 'tone', {freq: 110, dur: 0.5, attack: 0.01, release: 0.4, gain_db: -15}, 'S파가 바깥 핵에 닿아 멈춤');
const pCore = Math.min(...M.rayArrivals('P').filter(a => Math.abs(a.deg) > 110).map(a => a.t));
pArr('co_p_core', at(pCore), -15);
const sEnd = Math.max(...M.RAYS.S.map(r => r[r.length - 1].t));
add('co_shadow', at(sEnd), 'tone', {freq: 147, dur: 0.6, attack: 0.05, release: 0.5, gain_db: -19}, 'S파 그늘이 드러남');
// close
slip('c1_slip', R.c1.t0, -12); pArr('c1_p', atR(R.c1, M.tP(100)), -17); sArr('c1_s', atR(R.c1, M.tS(100)), -11);
ev.sort((a, b) => a.at - b.at);
fs.writeFileSync(path.join(here, 'sound.json'), JSON.stringify({version: 1, notes: '설명용 합성음(녹음 아님). make_sound.mjs 가 model.mjs 의 같은 시계로 만든다 — 손으로 고치지 말 것. 기본음·잡음 대역 모두 700 Hz 아래.', ambient: {enabled: false}, events: ev}, null, 1) + '\n');
console.log(ev.length, 'events');
