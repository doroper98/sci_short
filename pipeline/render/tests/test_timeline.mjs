// node --test pipeline/render/tests/   (run from repo root or pipeline/render: npm test)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTimeline} from '../timeline.mjs';
import {parseMarked} from '../captions.mjs';
import {project, DrawQueue} from '../draw.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tl = loadTimeline(path.join(here, 'fixtures/timeline.sample.json'));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('fixture is a valid contiguous v1 timeline', () => {
  assert.equal(tl.schema_version, 1);
  assert.deepEqual(tl.problems, []);
  assert.equal(tl.scenes.length, 3);
  assert.equal(tl.sentences.length, 5);
  assert.equal(tl.isDegraded(), false);
});

test('sceneAt: boundaries, progress and clamping', () => {
  const [hook, mech, close_] = tl.scenes;
  assert.equal(tl.sceneAt(0).id, 'hook');
  assert.equal(tl.sceneAt(mech.start - 1e-6).id, 'hook');
  assert.equal(tl.sceneAt(mech.start).id, 'mechanism');
  assert.equal(tl.sceneAt(mech.start).index, 1);
  close(tl.sceneAt((mech.start + mech.end) / 2).p, 0.5, 1e-9);
  close(tl.sceneAt(mech.start + 1).local, 1, 1e-9);
  assert.equal(tl.sceneAt(tl.duration).id, 'close');
  assert.equal(tl.sceneAt(tl.duration + 5).p, 1);
  assert.equal(tl.sceneAt(-3).id, 'hook');
  assert.equal(tl.sceneAt(-3).p, 0);
  assert.equal(hook.start, 0); assert.equal(close_.end, tl.duration);
});

test('at: sentence/scene refs, edges, offsets, word and fraction forms', () => {
  const s3 = tl.sentence('s03'), mech = tl.scene('mechanism');
  close(tl.at('s03'), s3.start);
  close(tl.at('s03:end'), s3.end);
  close(tl.at('s03:mid'), (s3.start + s3.end) / 2);
  close(tl.at('s03', 0.4), s3.start + 0.4);
  close(tl.at(['s03', -0.2]), s3.start - 0.2);
  close(tl.at('mechanism'), mech.start);
  close(tl.at({scene: 'mechanism', p: 0.5}), (mech.start + mech.end) / 2);
  close(tl.at(12.5), 12.5);
  const idx = s3.chars.map(c => c.c).join('').indexOf('수소 결합');
  close(tl.at({sentence: 's03', word: '수소 결합', offset: 0.1}), s3.chars[idx].start + 0.1);
  assert.throws(() => tl.at('nope'), /no sentence or scene/);
  assert.throws(() => tl.at('s03:later'), /edge/);
  assert.throws(() => tl.at({sentence: 's03', word: '없는말'}), /not found/);
});

test('progress is clamped 0..1 between two refs', () => {
  const a = tl.at('s02'), b = tl.at('s02:end');
  assert.equal(tl.progress(a - 1, 's02', 's02:end'), 0);
  assert.equal(tl.progress(b + 1, 's02', 's02:end'), 1);
  close(tl.progress((a + b) / 2, 's02', 's02:end'), 0.5, 1e-9);
});

test('events: sorted, resolved, pulse/after helpers', () => {
  const E = tl.events([{id: 'late', at: ['s05', 0.2]}, {id: 'bond', at: {sentence: 's03', word: '수소 결합'}}, {id: 'abs', at: 2.0}]);
  assert.deepEqual(E.map(e => e.id), ['abs', 'bond', 'late']);
  const t = E.get('bond').time;
  assert.equal(E.pulse('bond', t - 0.01), 0);
  assert.equal(E.pulse('bond', t), 1);
  close(E.pulse('bond', t + 0.3, 0.6), 0.5, 1e-9);
  assert.equal(E.after('bond', t + 1), 1);
  assert.equal(E.has('missing'), false);
  assert.throws(() => E.get('missing'), /unknown event/);
});

test('captionAt holds until next cue or +hold', () => {
  const [c0, c1] = tl.captions;
  assert.equal(tl.captionAt(c0.start).index, 0);
  assert.equal(tl.captionAt(c0.end + 0.1).index, 0);           // within 0.15 s hold (gap to next is 0.4 s)
  assert.equal(tl.captionAt(c0.end + 0.2), null);
  assert.equal(tl.captionAt(c1.start).index, 1);
  assert.equal(tl.sentenceAt(c0.start + 0.01).id, 's01');
  assert.equal(tl.sentenceAt(tl.sentence('s01').end + 0.1), null);
});

test('parseMarked strips ** markers and records ranges', () => {
  const {plain, ranges} = parseMarked('얼음은 **빈 공간** 때문에  가볍습니다');
  assert.equal(plain, '얼음은 빈 공간 때문에 가볍습니다');
  assert.deepEqual(ranges, [[4, 8]]);  // "빈 공간" = 4 chars
});

test('project + DrawQueue: nearer points are larger and drawn last', () => {
  const near = project([0, 0, 1], {angle: 0, tilt: 0}), far = project([0, 0, -1], {angle: 0, tilt: 0});
  assert.ok(near[3] > far[3] && near[2] > far[2]);
  const order = [];
  new DrawQueue().push(near[2], () => order.push('near')).push(far[2], () => order.push('far')).flush();
  assert.deepEqual(order, ['far', 'near']);
});
