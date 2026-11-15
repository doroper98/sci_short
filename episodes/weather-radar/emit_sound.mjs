// node episodes/weather-radar/emit_sound.mjs [--timeline outputs/weather-radar/narration/timeline.json]
// sound.json 을 scenes.mjs 의 plan() 과 world.mjs 의 모형에서 써 넣는다(화면과 소리가 같은 시각·같은 모형).
// 내레이션 타임라인이 바뀌면 다시 실행한다.
// 소리의 자: 쏘는 전파 = 짧은 틱(440 Hz), 돌아온 메아리 = 한 옥타브 낮고 여린 틱(220 Hz, 세기 = 크기), 진동수 = 음높이(도플러), 빗소리 = 여린 잡음.
// 사용자 규칙: 모든 소리는 700 Hz 아래(기본음·잡음 대역 모두).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import {plan, close} from './scenes.mjs';
import * as M from './world.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const i = process.argv.indexOf('--timeline');
const tl = loadTimeline(i > 0 ? path.resolve(process.argv[i + 1]) : path.join(root, 'outputs/weather-radar/narration/timeline.json'));
const k = plan(tl), r = v => Math.round(v * 1000) / 1000, ev = [], sc = id => tl.scene(id), TAU = Math.PI * 2;
const add = (id, at, kind, params, means) => ev.push({id, at: r(Math.max(0, at)), kind, params, means});
const OUT = {freq: 440, decay: 0.06, click: 0.08}, BACK = {freq: 220, decay: 0.16, click: 0.03};

// 빗소리(약하게, 처음부터 끝까지): 비가 보이는 장면에서 조금 커지고, 방울을 크게 볼 때는 잦아든다
{
  const pts = [[0, 0.6]], lv = (t, a) => pts.push([r(t), a]);
  lv(sc('hook').end - 0.5, 0.6); lv(k.S('s04') + 0.6, 0.3); lv(sc('pulse').start + 0.5, 0.5); lv(sc('echo').start, 0.5); lv(sc('echo').start + 0.8, 0.25);
  lv(sc('scan').start, 0.25); lv(sc('scan').start + 0.8, 0.45); lv(sc('dualpol').start, 0.45); lv(sc('dualpol').start + 0.8, 0.25); lv(sc('limit').start, 0.25);
  lv(sc('limit').start + 0.8, 0.45); lv(sc('close').start + 0.5, 0.6); lv(tl.duration - 1.2, 0.6); lv(tl.duration - 0.05, 0);
  add('rain', 0, 'env_noise', {low: 220, high: 660, gain_db: -33, fade: 0.04, points: pts}, '빗소리(설명용 합성 잡음) — 비가 보이는 장면에서 조금 커짐');
}
// 첫 장면·맺음: 접시가 비 쪽을 볼 때마다 쏘는 틱과 돌아온 메아리(화면의 메아리 고리와 같은 시각)
const heroPings = (id, t0, t1) => { let n = 0, was = false;
  for (let t = t0; t < t1; t += 0.02) { const on = k.heroHit(t); if (on && !was) { n++;
    add(`${id}_out${n}`, t + 0.05, 'tick', {...OUT, gain_db: -20, repeat: 3, interval: 0.3}, '빔이 비를 지나는 동안 쏘는 전파 — 짧은 틱');
    add(`${id}_back${n}`, t + 0.2, 'tick', {...BACK, gain_db: -23, repeat: 3, interval: 0.3}, '빗방울에서 돌아온 메아리 — 낮고 여린 틱'); } was = on; } };
heroPings('h', 0, k.S('s03') - 0.5);
// 이름
[['전파로', 0.15, 0], ['찾아내고', 0.3, 0], ['거리를', 0.45, -0.15], ['거리를', 0.45, 0.1]].forEach(([w, f, d], n) =>
  add(`o_word${n + 1}`, k.Wd('s03', w, f) + d, 'tick', {freq: [330, 370, 392, 440][n], decay: 0.09, click: 0.05, gain_db: -25}, `이름의 낱말이 나타남(${['RAdio', 'Detection', 'And', 'Ranging'][n]})`));
add('o_scope', k.S('s04') + 0.1, 'tone', {freq: 330, dur: 0.35, harmonics: [1, 0.3], gain_db: -24}, '옛 레이더 화면이 켜짐');
add('o_blip', k.S('s04') + 1.0, 'tick', {...BACK, gain_db: -24, repeat: 2, interval: 0.6}, '화면의 점: 비행기와 배의 메아리');
add('o_clutter', k.oRain, 'env_noise', {low: 300, high: 680, gain_db: -20, points: [[0, 0], [0.25, 0.9], [1.4, 0.6], [r(k.oTool - k.oRain - 0.7), 0.5], [r(k.oTool - k.oRain - 0.2), 0]]}, '화면에 끼어든 잡음(비와 눈) — 잡음 소리');
add('o_signal', k.oTool - 0.7, 'swell', {freqs: [196, 294], dur: 1.6, gain_db: -25}, '잡음이 날씨를 읽는 신호가 됨');
// 쏘고 듣는다: 왕복 한 번(되풀이하지 않는다). 모으는 소리 → 쏘는 틱 → (가는 시간) → 흩어짐 → (오는 시간) → 메아리. 쏜 틱과 메아리의 간격이 걸린 시간이다
add('p_focus', k.pFocus, 'swell', {freqs: [147, 220], dur: r(k.pEmit - k.pFocus - 0.4), attack: 0.8, gain_db: -27}, '접시가 전파를 가느다란 빔으로 모음');
add('p_out', k.pEmit, 'tick', {...OUT, gain_db: -16}, '전파 묶음을 쏨 — 짧은 틱');
add('p_listen', k.pListen + 0.1, 'tone', {freq: 196, dur: 0.5, harmonics: [1, 0.2], attack: 0.1, gain_db: -27}, '접시가 듣기 시작함');
add('p_hour', k.S('s06') + 0.25, 'tick', {freq: 587, decay: 0.03, click: 0.05, gain_db: -24}, '1시간 막대 가운데 쏘는 시간의 가는 금');
add('p_hit', k.pHit - 0.05, 'env_noise', {low: 260, high: 680, gain_db: -21, points: [[0, 0], [0.15, 1], [1.2, 0.55], [3.2, 0.2], [4.2, 0]]}, '전파가 빗방울에 닿아 사방으로 흩어짐(고리가 퍼지는 동안)');
add('p_small', k.pHit + 1.6, 'tick', {...BACK, gain_db: -25}, '돋보기 안: 아주 조금이 레이더 쪽으로 되돌아감');
add('p_back', k.pBack, 'tick', {...BACK, gain_db: -18}, '메아리가 안테나로 돌아옴 — 쏜 틱과의 간격이 걸린 시간');
add('p_axis', k.pDist, 'tone', {freq: 392, glide_to: 523, dur: 0.4, harmonics: [1, 0.3], gain_db: -24}, '계기의 가로가 시간에서 거리로 바뀜');
add('p_dist', k.p150, 'tone', {freq: 523, dur: 0.5, harmonics: [1, 0.3], gain_db: -22}, '150 km 가 정해짐');
// 메아리의 세기 = 틱의 수와 크기: 1칸, 3칸, 64칸(차오름), 구름 방울은 거의 0
add('e_one', k.S('s09') + 1.3, 'tick', {...BACK, gain_db: -22}, '1 mm 방울 하나의 메아리 = 1칸');
add('e_three', k.eMany + 0.9, 'tick', {...BACK, gain_db: -22, repeat: 3, interval: 0.14}, '세 방울의 메아리 = 3칸(방울 수만큼)');
{ const d = Math.max(0.8, k.e64 - k.eB - 0.9);
  add('e_grow', k.eB + 0.9, 'chirp', {gain_db: -19, harmonics: [1, 0.35], fade: 0.02, points: [[0, 196, 0.08], [r(d * 0.5), 277, 0.35], [r(d), 392, 1], [r(d + 0.25), 392, 0]]}, '지름 2배 방울의 메아리가 64칸까지 차오름 — 칸 수 = 크기');
  add('e_64', k.e64 + 0.05, 'tick', {...BACK, freq: 523, gain_db: -17}, '64칸에 닿음'); }
add('e_cloud', k.eC + 1.4, 'tick', {...BACK, gain_db: -38}, '구름 방울의 메아리 — 거의 들리지 않게(거의 0)');
add('e_see', k.eSee, 'tone', {freq: 392, dur: 0.4, harmonics: [1, 0.3], gain_db: -24}, '레이더가 보는 것(빗방울)에 테두리가 켜짐');
// 훑기: 빔이 비구름을 지날 때마다 메아리(센 구름 = 높고 큰 소리), 한 바퀴마다 고개를 드는 틱
{ const s = sc('scan'), laps = Math.ceil((s.end - k.scan0) / k.lap);
  M.CELLS.forEach((c, ci) => { for (let n = 0; n <= laps; n++) { const ang = ((c.az - k.scanAz(k.scan0)) % TAU + TAU) % TAU + n * TAU, t = k.scan0 + ang / TAU * k.lap; if (t < s.start + 0.1 || t > s.end - 0.3) continue;
    add(`s_echo${ci + 1}_${n + 1}`, t, 'tick', {freq: c.dbz > 45 ? 523 : c.dbz > 32 ? 392 : 294, decay: 0.14, click: 0.03, gain_db: c.dbz > 45 ? -19 : c.dbz > 32 ? -23 : -27}, `빔이 비구름 ${ci + 1}을 지남 — 메아리의 세기 = 음높이와 크기(화면의 색)`); } });
  for (let n = 1; n <= Math.min(4, laps); n++) { const t = k.scan0 + n * k.lap - 0.15; if (t < s.end - 0.3) add(`s_tilt${n}`, t, 'tone', {freq: 196 + 22 * n, dur: 0.28, harmonics: [1, 0.3], gain_db: -26}, '한 바퀴를 돌고 고개를 한 단 듦'); } }
// 도플러: 진동수 = 음높이. 나가는 음(늘 같음) 뒤에 돌아온 음(다가오면 높게, 멀어지면 낮게, 옆으로면 같게)
[['tow', k.dTow + 0.2, 370, '다가옴 → 돌아온 음이 높다'], ['away', k.dAway + 0.2, 294, '멀어짐 → 돌아온 음이 낮다'], ['side', k.dSide + 0.2, 330, '옆으로 지나감 → 돌아온 음이 같다']].forEach(([id, t, f, m]) => {
  add(`d_${id}_out`, t, 'tone', {freq: 330, dur: 0.3, harmonics: [1, 0.25], gain_db: -23}, '나가는 전파의 진동수(기준 음)');
  add(`d_${id}_back`, t + 0.42, 'tone', {freq: f, dur: 0.45, harmonics: [1, 0.25], gain_db: -21}, m); });
// 이중편파: 가로 메아리와 세로 메아리 = 두 틱의 크기(막대의 길이)
add('x_rain_h', k.pRain + 0.1, 'tick', {...BACK, freq: 440, gain_db: -19}, '빗방울: 가로 메아리(크게)');
add('x_rain_v', k.pRain + 0.4, 'tick', {...BACK, freq: 330, gain_db: -25}, '빗방울: 세로 메아리(작게)');
add('x_hail_h', k.pHail + 0.1, 'tick', {...BACK, freq: 440, gain_db: -21}, '우박: 가로 메아리');
add('x_hail_v', k.pHail + 0.4, 'tick', {...BACK, freq: 330, gain_db: -21}, '우박: 세로 메아리(가로와 같은 크기)');
// 한계
{ const s = sc('limit');
  add('l_beam', s.start + 0.4, 'whoosh', {dur: 2.2, f_start: 260, f_end: 620, q: 3, gain_db: -25}, '빔이 200 km 밖까지 뻗음');
  add('l_bend', k.lEarth - 0.2, 'swell', {freqs: [98, 147], dur: 1.6, gain_db: -24}, '평평한 땅의 선이 그어짐 — 둥근 땅은 그 아래로 내려간다(빔은 곧게 간다)');
  add('l_100', k.E('s16') - 0.5, 'tick', {freq: 392, decay: 0.1, click: 0.05, gain_db: -25}, '100 km 자리의 높이 표시');
  add('l_200', k.l200 + 0.3, 'tick', {freq: 523, decay: 0.1, click: 0.05, gain_db: -24}, '200 km 자리의 높이 표시');
  add('l_miss', k.lMiss - 0.6, 'tone', {freq: 147, dur: 0.6, harmonics: [1, 0.4], gain_db: -21}, '빔 아래의 비 — 메아리가 없다(낮고 둔한 음)');
  add('l_out2', k.lMany + 0.4, 'tick', {...OUT, gain_db: -20}, '다른 레이더가 쏨');
  add('l_back2', k.lMany + 1.5, 'tick', {...BACK, gain_db: -20, repeat: 2, interval: 0.3}, '다른 레이더가 놓친 비의 메아리를 받음'); }
// 맺음
heroPings('c', sc('close').start + 0.2, tl.duration - 1.8);
add('c_end', tl.duration - 1.9, 'swell', {freqs: [196, 294], dur: 1.6, gain_db: -25}, '마무리');

ev.sort((a, b) => a.at - b.at);
const out = {version: 1,
  notes: '설명용 합성음입니다(녹음 아님). 배경음악 없음. 모든 사건의 시각은 `node episodes/weather-radar/emit_sound.mjs` 가 scenes.mjs 의 plan() 과 world.mjs 의 모형에서 써 넣습니다. 내레이션 타임라인이 바뀌면 다시 실행하세요. 소리의 자: 쏘는 전파 = 짧은 틱(440 Hz), 메아리 = 한 옥타브 낮고 여린 틱(세기 = 크기), 진동수 = 음높이. 모든 기본음과 잡음 대역은 700 Hz 아래. 패닝 없음(모노 안전).',
  ambient: {enabled: false}, music: {id: 'zabriskie_patriarch', enabled: false, note: '음악 없음(2026-10-31 사용자 결정).'}, events: ev};
fs.writeFileSync(path.join(here, 'sound.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`sound.json: ${ev.length} events, first at ${ev[1]?.at}s`);
await close();
