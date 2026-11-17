// node --test samples/sprint-100m-top20/test_model.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {ATH, N, S, Sp, dist, gapAtBoltFinish, raceTime, videoTimeOf, rankLabel, tagName, T_REF, TL} from './model.mjs';

test('every athlete is at 100.000 m (±1 mm) at his listed time', () => {
  for (let i = 0; i < N; i++) assert.ok(Math.abs(dist(i, ATH[i].time) - 100) < 0.001, `${ATH[i].name}: ${dist(i, ATH[i].time)}`);
});

test('the profile passes through every split exactly', () => {
  const sp = [1.89, 2.88, 3.78, 4.64, 5.47, 6.29, 7.10, 7.92, 8.75, 9.58];
  sp.forEach((t, k) => assert.ok(Math.abs(S(t) - 10 * (k + 1)) < 1e-9));
  assert.equal(S(0.146), 0); assert.equal(S(0), 0); assert.equal(Sp(0.146), 0);
});

test('S is monotone (non-decreasing) from 0 to 14 s, speed never negative', () => {
  let prev = -1;
  for (let t = 0; t <= 14; t += 0.0005) { const s = S(t); assert.ok(s >= prev - 1e-12, `t=${t}`); assert.ok(Sp(t) >= 0); prev = s; }
});

test('order at any instant after 1 s follows rank (ties run level)', () => {
  for (let tau = 1; tau <= 11; tau += 0.01)
    for (let i = 1; i < N; i++) {
      const a = dist(i - 1, tau), b = dist(i, tau);
      if (ATH[i].time === ATH[i - 1].time) assert.ok(Math.abs(a - b) < 1e-12);
      else assert.ok(a > b, `tau=${tau} ${ATH[i - 1].name} vs ${ATH[i].name}`);
    }
});

test('gap of rank 20 when Bolt finishes (computed)', () => {
  const g = gapAtBoltFinish(N - 1);
  console.log(`  rank 20 (${ATH[N - 1].name}, ${ATH[N - 1].time}) is ${g.toFixed(3)} m behind when Bolt finishes`);
  console.log(`  rank 2= (${ATH[1].name}, ${ATH[1].time}) is ${gapAtBoltFinish(1).toFixed(3)} m behind`);
  assert.ok(g > 2.5 && g < 3.1);
});

test('video clock: race time = video time - gun, freeze, slow motion ×0.1, every crossing maps back', () => {
  assert.equal(raceTime(TL.gun), 0);
  assert.ok(Math.abs(raceTime(5.5) - 4.5) < 1e-12);
  assert.equal(raceTime(10.7), T_REF);
  assert.ok(Math.abs(raceTime(TL.slowmo_end) - 9.82) < 1e-9);
  for (const a of ATH) assert.ok(Math.abs(raceTime(videoTimeOf(a.time)) - a.time) < 1e-6);
  let prev = -Infinity; for (let t = 0; t < TL.duration; t += 0.001) { const r = raceTime(t); assert.ok(r >= prev - 1e-12); prev = r; }
});

test('rank labels match World Athletics shared places', () => {
  assert.deepEqual(ATH.map((a, i) => rankLabel(i)), ['1', '2=', '2=', '4', '5', '6', '7=', '7=', '7=', '10=', '10=', '12', '13=', '13=', '13=', '16=', '16=', '18=', '18=', '18=']);
});

test('tag names: unique, surname in capitals from the athlete\'s own name, initial only when a surname is shared', () => {
  const names = ATH.map((a, i) => tagName(i));
  assert.equal(new Set(names).size, N);
  ATH.forEach((a, i) => {
    const sn = a.name.split(' ').slice(1).join(' ').toUpperCase();
    assert.ok(names[i] === sn || names[i] === `${a.name[0]}. ${sn}`, names[i]);
  });
  assert.equal(names[5], 'K. THOMPSON'); assert.equal(names[17], 'R. THOMPSON'); assert.equal(names[0], 'BOLT');
  console.log('  ' + names.join(', '));
});
