// node --test pipeline/render/tests/test_look.mjs — 질감 층(look.mjs): 바탕·번짐·비네트·그레인
import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createStage, lit, clearGain, circle, loadLook, filmLook, filmBackground, grainParams} from '../index.mjs';

const stage = createStage();
const fill = (s, v) => { const c = s.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(0, 0, s.W, s.H); };
const digest = s => crypto.createHash('sha1').update(s.ctx.getImageData(0, 0, s.W, s.H).data).digest('hex');
const grainOnly = (g = {}) => loadLook({bloom: {tight_alpha: 0, wide_alpha: 0}, vignette: {strength: 0}, grain: g});
function stats(s, x0 = 200, y0 = 600, w = 600, h = 600) {   // 가운데 조각의 G 채널 평균·표준편차
  const d = s.ctx.getImageData(x0, y0, w, h).data; let m = 0, v = 0; const n = w * h;
  for (let i = 1; i < d.length; i += 4) m += d[i]; m /= n;
  for (let i = 1; i < d.length; i += 4) v += (d[i] - m) ** 2;
  return {mean: m, sd: Math.sqrt(v / n)};
}
const lum = (s, x, y) => { const d = s.ctx.getImageData(x, y, 1, 1).data; return (d[0] + d[1] + d[2]) / 3; };

test('loadLook reads config/look.json, drops _ keys and merges overrides per section', () => {
  const L = loadLook(), O = loadLook({grain: {amount: 1.5}});
  assert.equal(typeof L.enabled, 'boolean');
  assert.ok(!Object.keys(L).some(k => k.startsWith('_')));
  assert.equal(O.grain.amount, 1.5);
  assert.equal(O.grain.size, L.grain.size, 'other keys of the section survive');
  assert.notEqual(loadLook().grain.amount, 1.5, 'overrides do not leak into the cached file');
});

test('same frame index → bit-identical pixels', () => {
  const look = grainOnly();
  fill(stage, 90); filmLook(stage, 37 / stage.FPS, look); const a = digest(stage);
  fill(stage, 90); filmLook(stage, 37 / stage.FPS, look); const b = digest(stage);
  assert.equal(a, b);
});

test('hold_frames: frames inside one hold share the pattern, the next hold differs', () => {
  const look = grainOnly({hold_frames: 2});
  const at = f => { fill(stage, 90); filmLook(stage, f / stage.FPS, look); return digest(stage); };
  assert.equal(at(10), at(11));
  assert.notEqual(at(11), at(12));
  for (let k = 0; k < 50; k++) {
    const p = grainParams(k * 2, look), q = grainParams(k * 2 + 2, look);
    assert.notEqual(p.tile, q.tile, 'neighbouring holds use different tiles');
  }
});

test('flat grey 60: mean unchanged (±0.3), sd ≈ amount (±15%); near-white 235 has less grain', () => {
  const look = grainOnly();
  fill(stage, 60); filmLook(stage, 0, look); const s = stats(stage);
  assert.ok(Math.abs(s.mean - 60) <= 0.3, `mean ${s.mean}`);
  assert.ok(Math.abs(s.sd - look.grain.amount) <= 0.15 * look.grain.amount, `sd ${s.sd} vs amount ${look.grain.amount}`);
  fill(stage, 235); filmLook(stage, 0, look); const w = stats(stage);
  assert.ok(w.sd < s.sd * 0.75, `white sd ${w.sd} should be well below ${s.sd}`);
});

test('enabled:false leaves pixels untouched', () => {
  fill(stage, 77); const a = digest(stage);
  lit(stage, c => circle(c, 540, 960, 20, '#fff'));
  fill(stage, 77);
  filmLook(stage, 0.5, loadLook({enabled: false}));
  assert.equal(digest(stage), a);
  clearGain(stage);
});

test('no lit() in the frame → no bloom', () => {
  clearGain(stage);
  const look = loadLook({vignette: {strength: 0}, grain: {amount: 0}});
  fill(stage, 40); stage.ctx.fillStyle = '#fff'; stage.ctx.fillRect(500, 900, 80, 80);   // 밝지만 lit 아님
  const a = digest(stage); filmLook(stage, 0, look);
  assert.equal(digest(stage), a);
});

test('lit() bright dot: its surroundings brighten, far away stays the same', () => {
  clearGain(stage);
  const look = loadLook({vignette: {strength: 0}, grain: {amount: 0}});
  fill(stage, 20);
  lit(stage, c => circle(c, 540, 960, 16, '#FFB070'));
  const near0 = lum(stage, 540 + 30, 960), far0 = lum(stage, 100, 300);
  filmLook(stage, 0, look);
  const near1 = lum(stage, 540 + 30, 960), far1 = lum(stage, 100, 300);
  assert.ok(near1 > near0 + 3, `near ${near0} → ${near1}`);
  assert.equal(far1, far0, 'far away unchanged');
  assert.equal(stage.ctx.globalCompositeOperation, 'source-over', 'composite op restored');
  assert.equal(stage.ctx.globalAlpha, 1, 'alpha restored');
  clearGain(stage);
});

test('filmBackground: centre brighter than corners, no 8-bit banding steps along a radius', () => {
  const look = loadLook();
  filmBackground(stage, look);
  const c = lum(stage, 540, Math.round(0.42 * 1920)), k = lum(stage, 5, 5);
  assert.ok(c > k + 8, `centre ${c} corner ${k}`);
  // 반지름을 따라 64 px 평균이 단조롭게(거의) 어두워진다 — 디더 덕에 계단이 평균에 남지 않는다
  const d = stage.ctx.getImageData(540, 900, 1, 900).data, avg = [];
  for (let y = 0; y + 64 <= 900; y += 64) { let s = 0; for (let j = y; j < y + 64; j++) s += d[j * 4 + 1]; avg.push(s / 64); }
  for (let i = 1; i < avg.length; i++) assert.ok(avg[i] <= avg[i - 1] + 0.35, `row means ${avg.map(v => v.toFixed(2)).join(' ')}`);
});
