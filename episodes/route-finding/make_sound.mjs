// 51 구글맵 길찾기 — sound.json 을 model.mjs 의 같은 시계(plan)에서 만든다. 실행: node episodes/route-finding/make_sound.mjs
// 모두 합성한 설명용 소리(녹음 아님). 기본음·잡음 대역 모두 700 Hz 아래(사용자 규칙).
//  - 교차로 확정: 아주 짧은 낮은 틱(기록이 클수록 조금 낮게 — 물결이 멀어짐을 귀로) · 빠른 실행은 몇 개마다 하나만
//  - 기록을 고침(다익스트라 장면만): 더 낮고 작은 틱
//  - 길이 켜짐: 낮은 둥(87 Hz + 배음) · 되감기: 낮은 쓸림 · 층을 들어 올림: 오르는 쓸림
//  - 휴대전화 위치 알림: 작은 펄스(300 Hz) · 막힘: 낮은 지속음
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import * as M from './model.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const tl = JSON.parse(fs.readFileSync(path.join(root, 'outputs/route-finding/narration/timeline.json'), 'utf8'));
const R = M.plan(tl), ev = [];
const r3 = x => Math.round(x * 1000) / 1000;
const add = (id, at, kind, params, means) => ev.push({id, at: r3(at), kind, params, means});
const scene = id => tl.scenes.find(s => s.id === id);
function settles(key, {every = 1, g = -18, until = Infinity} = {}) {
  const run = R[key], ord = run.res.order, gmax = ord[ord.length - 1].g || 1;
  ord.forEach((o, k) => {
    if (k % every) return; const t = M.settleTime(run, k); if (t > until) return;
    add(`${key}_settle_${k}`, t, 'tick', {freq: Math.round(420 - 160 * (o.g / gmax)), decay: 0.04, click: 0.15, gain_db: g}, '교차로 하나를 확정');
  });
}
const thud = (id, at, g = -14) => add(id, at, 'custom', {layers: [{kind: 'tone', params: {freq: 87, dur: 0.5, attack: 0.01, release: 0.4, harmonics: [1, 0.5, 0.25], gain_db: g}}]}, '가장 빠른 길이 켜짐');
settles('hook0', {every: 2, g: -22, until: 2.2});
thud('hook0_route', R.hook0.path0, -15);
add('rewind', 2.2, 'whoosh', {dur: 0.8, f_start: 520, f_end: 150, gain_db: -24}, '되감기');
add('pin', R.hookApp.pin, 'tick', {freq: 260, decay: 0.08, gain_db: -18}, '목적지를 넣음');
thud('app_route', R.hookApp.t, -17);
settles('origin', {g: -18});
thud('origin_route', R.origin.path0, -16);
add('year', R.yearPub, 'tick', {freq: 220, decay: 0.1, gain_db: -18}, '1959 발표');
settles('dijkstra', {g: -17});
for (const [i, r] of R.dijkstra.res.relax.entries()) add(`dijkstra_relax_${i}`, M.settleTime(R.dijkstra, r.k) + 0.12, 'tick', {freq: 190, decay: 0.03, click: 0.1, gain_db: -27}, '이웃의 기록을 고침');
thud('dijkstra_route', R.dijkstra.path0, -14);
settles('astar', {g: -17});
thud('astar_route', R.astar.path0, -15);
settles('bigDij', {every: 4, g: -24});
thud('bigDij_route', R.bigDij.path0, -17);
add('lift', R.lift.t0, 'whoosh', {dur: R.lift.t1 - R.lift.t0, f_start: 160, f_end: 480, gain_db: -24}, '중요한 선을 위층으로');
settles('bigLay', {every: 2, g: -22});
thud('bigLay_route', R.bigLay.path0, -15);
for (const [i, pp] of M.pings(scene('traffic'), R.ping0).entries()) add(`ping_${i}`, pp.t, 'tone', {freq: 300, dur: 0.07, attack: 0.004, release: 0.06, gain_db: -30}, '휴대전화가 위치를 알림');
add('jam', R.jamOn, 'tone', {freq: 70, dur: R.jamOff - R.jamOn, attack: 0.6, release: 0.8, harmonics: [1, 0.4], gain_db: -28}, '고속도로 막힘(설명용 지속음)');
settles('detour', {every: 2, g: -21});
thud('detour_route', R.detour.path0, -15);
thud('free_again', R.jamOff + 0.3, -18);
settles('close', {every: 2, g: -22});
thud('close_route', R.close.path0, -15);
ev.sort((a, b) => a.at - b.at);
fs.writeFileSync(path.join(here, 'sound.json'), JSON.stringify({version: 1, notes: '설명용 합성음(녹음 아님). make_sound.mjs 가 model.mjs 의 같은 시계(plan)로 만든다 — 손으로 고치지 말 것. 기본음·잡음 대역 모두 700 Hz 아래.', ambient: {enabled: false}, events: ev}, null, 1) + '\n');
console.log(ev.length, 'events');
