// node episodes/tsunami/emit_sound.mjs [--timeline outputs/tsunami/narration/timeline.json]
// sound.json 을 scenes.mjs 의 plan() 과 world.mjs 의 모형에서 써 넣는다(화면과 소리가 같은 시각·같은 모형).
// 내레이션 타임라인이 바뀌면 다시 실행한다.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import {plan} from './scenes.mjs';
import * as M from './world.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const i = process.argv.indexOf('--timeline');
const tl = loadTimeline(i > 0 ? path.resolve(process.argv[i + 1]) : path.join(root, 'outputs/tsunami/narration/timeline.json'));
const k = plan(tl), r = v => Math.round(v * 1000) / 1000, ev = [];
const add = (id, at, kind, params, means) => ev.push({id, at: r(at), kind, params, means});

// 빠르기 = 음높이, 높이 = 크기: 물결이 가는 동안의 낮은 음(설명용). f = 70 + 150·(빠르기 ÷ 깊은 바다의 빠르기)
const runTone = (t0, t1, Xof, step = 0.2) => {
  const pts = [];
  for (let t = t0; t <= t1 + 1e-6; t += step) { const s = M.state(Xof(Math.min(t, t1))); pts.push([r(t - t0), r(70 + 150 * s.kmh / 713.1), r(Math.min(1, 0.22 + 0.2 * (s.hm - 1)))]); }
  pts[0][2] = 0; pts[pts.length - 1][2] = 0; return pts;
};
const thud = gain => ({gain_db: gain, layers: [
  {kind: 'tone', offset: 0, params: {freq: 62, glide_to: 40, dur: 0.9, harmonics: [1, 0.4, 0.15], decay: 0.6, gain_db: 0}},
  {kind: 'noise', offset: 0, params: {dur: 0.7, low: 40, high: 220, attack: 0.005, release: 0.5, gain_db: -4}}]});

// 바다 소리(약하게, 처음부터 끝까지): 해안 장면에서 조금 커진다
{
  const sc = id => tl.scene(id), pts = [[0, 0.45]], lv = (t, a) => pts.push([r(t), a]);
  lv(k.S('s02'), 0.45); lv(k.tCut, 0.4); lv(k.tCut + 1, 0.7); lv(sc('origin').end - 0.5, 0.7); lv(sc('source').start + 0.6, 0.35);
  lv(sc('shoal').start, 0.35); lv(sc('shoal').end - 3, 0.6); lv(sc('arrive').end - 0.5, 0.7); lv(sc('warn').start + 0.5, 0.35);
  lv(sc('close').start, 0.35); lv(tl.duration - 1.2, 0.55); lv(tl.duration - 0.05, 0);
  add('sea', 0, 'env_noise', {low: 160, high: 900, gain_db: -31, fade: 0.04, points: pts}, '바다 소리(설명용 합성 잡음) — 해안 장면에서 조금 커짐');
}
// 첫 장면
add('h_pass', k.tBoat - 0.8, 'swell', {freqs: [98, 147], dur: 1.8, gain_db: -27}, '낮은 물결이 배 밑을 지나감 — 일부러 아주 작게(배는 알아채지 못함)');
add('h_surge', k.tLand - 1.0, 'env_noise', {low: 120, high: 700, gain_db: -17, points: [[0, 0.05], [1.2, 0.7], [2.8, 1], [4.2, 0.45], [4.9, 0]]}, '해안에서 물이 밀려듦 — 화면의 물 높이가 오르는 동안');
// 이름
add('o_tsu', k.oTsu, 'tone', {freq: 220, dur: 0.5, harmonics: [1, 0.3], gain_db: -24}, "'쓰(津)' 글자가 나타남");
add('o_nami', k.oNami, 'tone', {freq: 294, dur: 0.5, harmonics: [1, 0.3], gain_db: -24}, "'나미(波)' 글자가 나타남");
add('o_high', k.oHigh, 'tick', {freq: 523, decay: 0.1, gain_db: -26}, '물이 닿았던 높이의 점선이 그려짐');
// 발생
add('q_blink', k.tBlink, 'tick', {freq: 180, decay: 0.16, click: 0.2, gain_db: -20, repeat: 2, interval: 0.22}, '단층이 빛나며 자리를 알림');
add('q_slip', k.tSlip, 'custom', thud(-11), '단층이 어긋나 바닥이 솟는 순간 — 둔한 울림(설명용)');
add('q_lift', k.tSlip + 0.05, 'swell', {freqs: [98, 147, 196], dur: 1.3, attack: 0.3, gain_db: -22}, '바닥과 함께 수면이 들림');
add('q_col', k.tCol, 'tick', {freq: 392, decay: 0.1, gain_db: -26}, '물기둥 점선이 그려짐(바닥부터 수면까지)');
add('q_rel', k.tRel, 'whoosh', {dur: 1.8, f_start: 520, f_end: 170, q: 2, gain_db: -22}, '들린 물이 내려앉으며 양쪽으로 퍼지기 시작');
add('core', k.S('s08') + 0.2, 'swell', {freqs: [147, 220, 294], dur: 2.0, gain_db: -26}, '핵심 명제: 물 전체가 움직이는 파도');
// 먼바다: 물결의 길이 = 소리의 길이(짧은 틱 대 긴 낮은 음)
add('o_wind', k.Wd('s09', '물결 하나의', 0.3), 'tick', {freq: 660, decay: 0.05, gain_db: -24, repeat: 3, interval: 0.12}, '바람 파도의 자: 짧은 물결 = 짧은 소리');
add('o_long', k.Wd('s09', '쓰나미는', 0.75), 'tone', {freq: 110, dur: 1.6, harmonics: [1, 0.3], attack: 0.3, decay: 1.0, sustain: 0.5, release: 0.5, gain_db: -22}, '쓰나미의 자: 긴 물결 = 길고 낮은 소리');
add('o_depth', k.Wd('s10', '바다 깊이', 0.1), 'tick', {freq: 294, decay: 0.12, gain_db: -26}, '수심의 자가 그려짐');
add('o_plane', k.Wd('s10', '여객기에', 0.85) - 1.2, 'whoosh', {dur: 2.4, f_start: 500, f_end: 900, q: 3, gain_db: -31}, '여객기가 나란히 들어옴');
add('o_boat', k.tBoatO - 0.9, 'swell', {freqs: [98, 147], dur: 1.8, gain_db: -27}, '물결이 배 밑을 지나감 — 아주 작게');
// 얕아짐: 빠르기 = 음높이(내려감), 높이 = 크기(커짐)
{
  const sh = tl.scene('shoal'), Xof = t => M.crestX(Math.min(k.shTau0 + k.shRate * (t - sh.start), k.shEnd));
  add('sh_run', sh.start + 0.2, 'chirp', {gain_db: -21, harmonics: [1, 0.35, 0.12], fade: 0.08, points: runTone(sh.start + 0.2, sh.end - 0.3, Xof)}, '물결의 빠르기 = 음높이(얕아질수록 내려감), 높이 = 크기(커짐) — 계기와 같은 모형');
  add('sh_ten', k.tTen, 'tick', {freq: 440, decay: 0.12, gain_db: -24}, '수심 10 m 자리의 표시가 켜짐');
  add('sh_cmp1', k.tCmp + 0.1, 'tone', {freq: 110, dur: 1.0, harmonics: [1, 0.3], attack: 0.2, decay: 0.6, sustain: 0.4, release: 0.3, gain_db: -26}, '견주는 판: 깊은 곳의 길고 낮은 물결 = 길고 여린 소리');
  add('sh_cmp2', k.tCmp + 1.3, 'tone', {freq: 110, dur: 0.35, harmonics: [1, 0.3], gain_db: -19}, '견주는 판: 얕은 곳의 짧고 높은 물결 = 짧고 센 소리(같은 음높이)');
}
// 도달
add('a_draw', k.aA, 'whoosh', {dur: r(k.aB - k.aA + 0.4), f_start: 700, f_end: 180, q: 2, gain_db: -21}, '바닷물이 빠져나감');
add('a_sign', k.S('s15') + 0.05, 'tick', {freq: 587, decay: 0.14, gain_db: -22, repeat: 3, interval: 0.42}, '대피 표지가 켜짐(신호)');
add('a_surge', k.aC, 'env_noise', {low: 120, high: 700, gain_db: -17, points: [[0, 0.05], [r((k.aD - k.aC) * 0.5), 0.6], [r(k.aD - k.aC), 0.95], [r(k.aE - k.aC), 0.75], [r(k.aF - k.aC), 0.12]]}, '첫 물결: 물 높이가 오르는 동안 계속 밀려드는 소리');
add('a_mark', k.aD + 0.3, 'tick', {freq: 523, decay: 0.1, gain_db: -26}, '첫 물결이 닿은 높이의 점선');
add('a_surge2', k.aF, 'env_noise', {low: 120, high: 700, gain_db: -15, points: [[0, 0.1], [r(k.aG - k.aF), 1], [r(k.aG - k.aF + 0.9), 0.5], [r(tl.scene('arrive').end - k.aF), 0]]}, '둘째 물결: 첫 물결보다 높이 오름 = 더 큰 소리');
// 경보
add('w_slip', k.tQ, 'custom', thud(-13), '같은 지진을 처음부터: 단층이 어긋남');
add('w_seis', k.tQ + 0.1, 'chirp', {gain_db: -22, harmonics: [1, 0.4], fade: 0.03, points: [[0, 90, 0], [0.15, 110, 0.7], [r(k.tArr - k.tQ - 0.1), 300, 0.7], [r(k.tArr - k.tQ), 320, 0]]}, '지진파가 땅속을 달려 관측소로 감(카메라가 따라감)');
add('w_arr', k.tArr, 'tone', {freq: 587, dur: 0.22, harmonics: [1, 0.3], gain_db: -20, repeat: 2, interval: 0.3}, '관측소에 지진파가 닿아 등불이 켜짐');
add('w_bpr', k.tBpr - 0.9, 'tick', {freq: 494, decay: 0.16, click: 0.1, gain_db: -23, repeat: 5, interval: 0.5}, '바다 밑 압력계가 지나가는 물결을 재어 신호를 보냄');
add('w_hours', k.S('s20') + 0.5, 'chirp', {gain_db: -27, harmonics: [1, 0.3], fade: 0.05, points: [[0, 147, 0], [0.3, 147, 0.5], [r(k.tHrs - k.S('s20') - 0.5), 220, 0.5], [r(k.tHrs - k.S('s20') - 0.3), 220, 0]]}, '칠레에서 일본까지 가는 시간의 막대가 차오름');
add('w_done', k.tHrs, 'tone', {freq: 294, dur: 0.5, harmonics: [1, 0.3], gain_db: -23}, '22시간에 닿음');
// 정리
{
  const cl = tl.scene('close'), Xof = t => M.crestX(t < k.tFast ? k.clTau0 + k.rate * (t - cl.start) : Math.min(k.shEnd, k.clTauF + k.clRate * (t - k.tFast)));
  add('c_run', k.tFast, 'chirp', {gain_db: -22, harmonics: [1, 0.35, 0.12], fade: 0.08, points: runTone(k.tFast, cl.end - 1.0, Xof, 0.1)}, '정리: 빠르기 = 음높이(내려감), 높이 = 크기(커짐)');
  add('c_end', cl.end - 1.6, 'swell', {freqs: [147, 220], dur: 1.5, gain_db: -25}, '마무리');
}

const out = {
  version: 1,
  notes: '설명용 합성음입니다(녹음 아님). 배경음악 없음. 모든 사건의 시각과 표(빠르기 = 음높이, 높이 = 크기)는 `node episodes/tsunami/emit_sound.mjs` 가 scenes.mjs 의 plan() 과 world.mjs 의 모형에서 써 넣습니다. 내레이션 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
  events: ev.sort((a, b) => a.at - b.at),
  ambient: {enabled: false},
  music: {id: 'zabriskie_patriarch', enabled: false, note: '음악 없음(2026-10-31 사용자 결정).'},
};
fs.writeFileSync(path.join(here, 'sound.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`sound.json: ${ev.length} events, timeline ${tl.duration.toFixed(2)} s`);
