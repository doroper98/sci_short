// node episodes/accretion-disk/make_sound.mjs [--timeline outputs/accretion-disk/narration/timeline.json]
// Writes sound.json from the same time plan and model as scenes.mjs. Re-run whenever the narration timeline changes.
// All sounds are synthesised explanatory cues (space is silent); every fundamental stays below 700 Hz; no music, no panning.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {loadTimeline} from '../../pipeline/render/index.mjs';
import {plan, spiralAt} from './scenes.mjs'; import * as M from './model.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), i = process.argv.indexOf('--timeline');
const tl = loadTimeline(i > 0 ? path.resolve(process.argv[i + 1]) : path.join(HERE, '../../outputs/accretion-disk/narration/timeline.json'));
const P = plan(tl), s = id => tl.at(id), ev = [], r3 = x => Math.round(x * 1000) / 1000;
const add = (id, at, kind, params, means) => ev.push({id, at: r3(at), kind, params, means});
const swell = (id, at, freqs, means, o = {}) => add(id, at, 'swell', {freqs, dur: o.dur ?? 1.6, attack: 0.4, gain_db: o.gain ?? -34, cutoff: 700}, means);

swell('poster', 0.05, [98, 147], '첫 화면(썸네일): 블랙홀 둘레의 원반');
add('accrete', s('s03') + 0.6, 'tick', {freq: 196, decay: 0.14, click: 0, gain_db: -35, repeat: 6, interval: 0.588}, '기체 덩이가 원반 가장자리에 내려앉음(강착)');
swell('predict', P.predict, [110, 165, 220], '리스의 예측: 블랙홀 곁의 밝은 빛', {gain: -33});
{ // tidal pull ÷ self-gravity → pitch (90 Hz → 270 Hz at the limit)
  const S = new M.Sim(), t0 = s('s05') + 0.6, pts = [];
  for (let t = t0; t <= P.tear + 1e-6; t += 0.1) { S.advance(P.tau(t)); const r = Math.hypot(S.centre[0], S.centre[1]); pts.push([r3(t - t0), r3(90 + 180 * Math.min(1, M.tideRatio(r))), r3(0.12 + 0.2 * Math.min(1, M.tideRatio(r)))]); }
  add('tide', t0, 'chirp', {points: pts, harmonics: [1, 0.25], fade: 0.05, gain_db: -34}, '기조력 ÷ 별의 중력이 커질수록 높아지는 음(화면 막대와 같은 값)');
}
add('tear', P.tear, 'noise', {dur: 0.6, low: 80, high: 420, attack: 0.01, release: 0.45, gain_db: -30}, '별이 버티지 못하고 찢어지기 시작');
add('noodle', s('s07') + 0.2, 'whoosh', {dur: 1.6, f_start: 110, f_end: 300, q: 1.6, gain_db: -35}, '별이 줄기로 늘어남');
for (const [id, d] of [['dial', P.dial], ['dial2', P.dial2]]) { const pts = []; for (let u = 0; u <= 1.0001; u += 0.05) pts.push([r3(u * (d[1] - d[0])), r3(110 * 3 ** (u * u * (3 - 2 * u))), 0.18]); add(id, d[0], 'chirp', {points: pts, harmonics: [1, 0.2], fade: 0.05, gain_db: -37}, '블랙홀 질량 눈금이 올라감(100만 배 → 2억 배)'); }
add('swallow', P.swallow, 'tone', {freq: 65, dur: 0.6, attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3, gain_db: -29}, '별이 찢어지지 않고 통째로 경계 안으로');
add('fling', s('s10') + 0.4, 'whoosh', {dur: 2.2, f_start: 260, f_end: 90, q: 1.4, gain_db: -35}, '절반쯤은 튕겨 나가고 절반쯤은 돌아옴');
add('core', P.core + 0.4, 'tick', {freq: 147, decay: 0.2, click: 0, gain_db: -32}, '추적 표식: 기체 한 덩이');
{ // the tracked parcel: pitch ∝ its sideways speed (faster when closer)
  const S = new M.Sim(), t0 = P.amount + 0.3, t1 = tl.at('flatten'), k = P.tracer, raw = [];
  for (let t = t0; t <= t1; t += 0.1) { S.advance(P.tau(t)); const r = Math.hypot(S.x[k], S.y[k]); raw.push([t - t0, Math.abs(S.angmom(k)) / r]); }
  const v0 = Math.min(...raw.map(q => q[1]));
  add('orbit', t0, 'chirp', {points: raw.map(([t, v]) => [r3(t), r3(Math.min(660, 110 * v / v0)), 0.2]), harmonics: [1, 0.2], fade: 0.08, gain_db: -37}, '추적한 기체의 옆 속도에 비례하는 음높이(가까울수록 빠름)');
}
[2.6, 3.7, 4.8].forEach((d, n) => add('collide' + (n + 1), s('s13') + d, 'noise', {dur: 0.4, low: 100, high: 520, attack: 0.005, release: 0.3, gain_db: -32}, '줄기가 제 꼬리와 부딪힘'));
swell('flat', P.tilt[1], [131, 196], '같은 방향만 남아 납작해짐');
add('inner', s('s15') + 0.5, 'tone', {freq: 330, dur: 0.5, attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.25, gain_db: -35}, '안쪽 표식(빠름)');
add('outer', s('s15') + 2.2, 'tone', {freq: 110, dur: 0.7, attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.3, gain_db: -33}, '바깥쪽 표식(느림)');
{ const pts = [], w0 = M.omega(16.5); for (let t = P.spiral[0]; t <= P.spiral[1] + 1e-6; t += 0.1) { const r = Math.max(M.R_ISCO, spiralAt(P, t).r); pts.push([r3(t - P.spiral[0]), r3(110 * Math.sqrt(M.omega(r) / w0)), 0.2]); } add('spiral', P.spiral[0], 'chirp', {points: pts, harmonics: [1, 0.2], fade: 0.08, gain_db: -37}, '나선으로 내려오는 기체: 안으로 갈수록 빨리 돌아 높아지는 음'); }
swell('heat', P.heat + 0.5, [196, 294, 392], '안쪽일수록 뜨거움', {dur: 2.2});
swell('flare', s('s18') + 1.0, [147, 220], '2014년 관측된 빛이 밝아짐', {dur: 1.4});
add('photo', P.eht + 0.5, 'tick', {freq: 220, decay: 0.2, click: 0, gain_db: -33}, '2019년 블랙홀 사진');
swell('calm', s('s20') + 0.3, [98, 147], '멀리서는 보통 별과 같은 중력: 다른 별들은 그대로 돈다', {dur: 2.0, gain: -35});
swell('poster_back', P.poster, [98, 147, 196], '첫 화면의 포스터가 돌아옴', {dur: 1.8, gain: -32});

ev.sort((a, b) => a.at - b.at);
const out = {version: 1, notes: '설명용 합성음입니다(녹음 아님). 우주 공간의 현상은 소리를 내지 않으므로 모든 소리는 화면 사건의 표시음입니다. 배경음악·배경음 없음. 기본음은 모두 700 Hz 아래, 패닝 없음. node episodes/accretion-disk/make_sound.mjs 가 scenes.mjs 의 시간 계획과 model.mjs 에서 써 넣습니다. 타임라인이 바뀌면 다시 실행하세요.',
  events: ev, ambient: {enabled: false, kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}, music: {id: 'zabriskie_patriarch', enabled: false, under_db: 12, duck_db: 6, start_sec: 0, note: '음악 없음.'}};
fs.writeFileSync(path.join(HERE, 'sound.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`events: ${ev.length}`);
