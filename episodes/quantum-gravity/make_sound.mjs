// 73 양자중력 — sound.json 을 model.mjs 의 같은 계획(plan)에서 만든다. 실행: node episodes/quantum-gravity/make_sound.mjs
// 모두 합성한 설명용 소리(녹음 아님). 기본음은 700 Hz 아래, 병원 기기 같은 맑은 고음 '삐'는 쓰지 않는다. 배경음악 없음.
//  - 사건 섬광(빛이 떠남·모임): 짧은 틱 320 Hz · 조각이 맞붙음: 틱 260 Hz · 되감기: 낮은 쓸림
//  - 잔물결 k(먼저 어림의 항): 짧을수록(k 가 클수록) 높은 음, 크기 ∝ 그 항이 더한 값(1/k — 잦아들지 않음; ×10 한 번에 약 2.3)
//  - 어림하지 않음의 항 k: 같은 음높이 규칙, 크기 ∝ 1/k²(빨리 잦아듦; ×10 한 번에 더한 값은 0.09, 0.009 …)
//  - 중력자 n: 같은 낮은 음(110 Hz) · 9번째가 한계에 막힘: 둔한 틱
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import * as M from './model.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const tl = JSON.parse(fs.readFileSync(path.join(root, 'outputs/quantum-gravity/narration/timeline.json'), 'utf8'));
const P = M.plan(tl), ev = [];
const r3 = x => Math.round(x * 1000) / 1000;
const add = (id, at, kind, params, means) => ev.push({id, at: r3(at), kind, params, means});
const dB = x => 20 * Math.log10(Math.max(1e-6, x));
const tick = (id, at, freq, g, means, o = {}) => add(id, at, 'tick', {freq, decay: o.decay ?? 0.06, gain_db: g, click: 0.15, ...(o.pan != null ? {pan: o.pan} : {})}, means);
const pitch = k => (k <= 10 ? 170 + 150 * Math.log10(k) : Math.min(640, 320 + 64 * (Math.log10(k) - 1)));
const termTone = (id, at, k, amount, means) => add(id, at, 'tone', {freq: r3(pitch(k)), dur: 0.32, attack: 0.006, release: 0.2, harmonics: [1, 0.35, 0.12], gain_db: r3(Math.min(-11, -15 + dB(amount)))}, means);

// hook
const H = P.hook;
tick('flash_p0', H.sweepA[0], 320, -14, '사건 p 에서 빛이 떠남(첫 섬광)');
tick('flash_q0', H.sweepB[1], 320, -17, '빛이 사건 q 로 모임');
H.sew.forEach((s, i) => tick(`sew_h${i}`, s.t + 0.18, 260, -24, '이웃 다이아몬드가 맞붙음', {decay: 0.04}));
add('rewind', H.rewind[0], 'whoosh', {dur: 1.0, f_start: 480, f_end: 140, gain_db: -24}, '되감기');
H.loops.forEach((t0, i) => { tick(`flash_pl${i}`, t0, 320, -20, '빛이 떠남'); tick(`flash_ql${i}`, t0 + 1.0, 320, -22, '빛이 모임'); });
P.exch.trips.forEach((tr, i) => { tick(`ask_${i}`, tr.askArr, 360, -21, '물음이 GPT-6 Astra 에 닿음', {pan: 0.35}); tick(`ans_${i}`, tr.ansArr, 280, -21, '답이 물리학자에게 닿음 — 논문에 한 줄', {pan: -0.35}); });
// origin
const O = P.origin;
add('mass_land', O.land, 'custom', {layers: [{kind: 'tone', params: {freq: 70, dur: 0.5, attack: 0.004, release: 0.35, harmonics: [1, 0.6, 0.3], gain_db: -14}}, {kind: 'noise', params: {dur: 0.12, low: 50, high: 220, release: 0.1, gain_db: -22}}]}, '질량이 판에 놓임');
add('bend', O.land + 0.05, 'tone', {freq: 92, dur: O.bend, attack: 0.3, release: 0.6, sustain: 0.6, harmonics: [1, 0.4], gain_db: -28}, '판이 휨');
{ const dur = O.wobbleEnd - O.wobble, pts = []; for (let x = 0; x <= dur + 1e-6; x += 0.05) pts.push([r3(x), 104, r3(0.05 + 0.06 * (0.5 + 0.5 * Math.sin(x * 2 * Math.PI * 0.6)) * Math.min(1, x / 0.6) * Math.min(1, (dur - x) / 0.4))]);
  add('wobble', O.wobble, 'chirp', {points: pts, harmonics: [1, 0.5, 0.25], gain_db: -6}, '판이 두 모양으로 출렁임(느린 떨림)'); }
// infinity: 잔물결 k
for (const r of P.rip) { const amount = r.decade ? M.Hsum(r.k) - M.Hsum(r.k / 10) : 1 / r.k; termTone(`rip_${r.k}`, r.t, r.k, amount, `잔물결 k=${r.k} 를 더함(먼저 어림, 더한 값 ${amount.toFixed(3)})`); }
P.infinity.loops.forEach((t0, i) => { tick(`flash_c${i}`, t0, 320, i ? -21 : -18, '빛이 사건에서 퍼짐'); tick(`flash_cq${i}`, t0 + 1.0, 320, -23, '빛이 위 사건으로 모임'); });
// diamond
const Dm = P.diamond;
tick('flash_p', Dm.p, 320, -15, '먼저 일어난 사건에서 빛이 퍼짐'); tick('flash_q', Dm.qArr, 320, -17, '나중 사건으로 빛이 모임');
tick('sig_arrive', Dm.sig + Dm.sigDur, 300, -22, '신호 점들이 나중 사건에 닿음', {decay: 0.05});
// focus
for (const g of P.grav) if (!g.blocked) add(`grav_${g.n}`, g.t, 'tone', {freq: 110, dur: 0.5, attack: 0.01, release: 0.3, harmonics: [1, 0.5, 0.3], gain_db: -17}, `중력자 ${g.n}번째가 들어감(고리가 원뿔을 지나감)`);
add('grav_9', P.grav.find(g => g.blocked).t, 'tone', {freq: 110, dur: 0.5, attack: 0.01, release: 0.3, harmonics: [1, 0.5, 0.3], gain_db: -17}, '9번째 중력자를 넣으려 함');
add('block', P.block, 'custom', {layers: [{kind: 'tick', params: {freq: 90, decay: 0.08, click: 0.1, gain_db: -12}}, {kind: 'noise', params: {dur: 0.12, low: 60, high: 240, release: 0.1, gain_db: -20}}]}, '9번째가 한계선에 막힘(둔한 틱)');
// finite
P.sew.forEach(s => tick(`sew_${s.k}`, s.t, 260, -22, '조각이 맞붙음', {decay: 0.04}));
for (const r of P.terms) { const amount = r.decade ? M.Zsum(r.k) - M.Zsum(r.k / 10) : 1 / (r.k * r.k); termTone(`term_${r.k}`, r.t, r.k, amount, `어림하지 않음의 항 k=${r.k}(더한 값 ${amount.toExponential(2)})`); }
for (const r of P.approx) { const amount = r.decade ? M.Hsum(r.k) - M.Hsum(r.k / 10) : 1 / r.k; termTone(`approx_${r.k}`, r.t, r.k, amount, `먼저 어림의 항 k=${r.k}(더한 값 ${amount.toFixed(3)})`); }
// blackhole: 삼킬 때 낮은 음, 표면 칸 수(floor S)가 늘 때마다 작은 틱
for (const [i, f] of P.bh.falls.entries()) add(`fall_${i}`, f.t + P.bh.fallDur, 'tone', {freq: 60, dur: 0.8, attack: 0.01, release: 0.5, harmonics: [1, 0.6, 0.3], gain_db: -16}, '덩어리가 지평선을 넘음');
{ let prev = Math.floor(M.bhArea(M.bhRadius(P, P.bh.falls[0].t)) / 4), k = 0;
  for (let t = P.bh.falls[0].t; t < P.bh.falls[P.bh.falls.length - 1].t + P.bh.fallDur + 1; t += 1 / 30) {
    const s = Math.floor(M.bhArea(M.bhRadius(P, t)) / 4); if (s > prev) { tick(`cell_${k++}`, t, 240, -29, '표면의 칸 하나가 늘어남', {decay: 0.03}); prev = s; } } }
// limits · close
tick('mark', P.limits.mark, 300, -20, '표식이 "공개"에 섬');
add('close', P.close.sweep, 'tone', {freq: 82, dur: 1.6, attack: 0.2, release: 0.9, sustain: 0.4, harmonics: [1, 0.5, 0.25], gain_db: -22}, '조각보 전체를 빛이 한 번 훑음');
ev.sort((a, b) => a.at - b.at);
fs.writeFileSync(path.join(here, 'sound.json'), JSON.stringify({version: 1, notes: '설명용 합성음(녹음 아님). make_sound.mjs 가 model.mjs 의 같은 계획(plan)으로 만든다 — 손으로 고치지 말 것. 기본음 700 Hz 아래, 배경음악 없음.', ambient: {enabled: false}, music: {enabled: false}, events: ev}, null, 1) + '\n');
console.log(ev.length, 'events');
