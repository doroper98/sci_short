// node --test pipeline/render/tests/test_hdr.mjs — lit() 와 빛 지도(hdr.mjs)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStage, lit, clearGain, ensureGain, cssAlpha, whiteContext, circle, glow, rgba} from '../index.mjs';

const px = (g, x, y) => Array.from(g.ctx.getImageData(Math.round(x * g.scale), Math.round(y * g.scale), 1, 1).data);

test('cssAlpha reads the alpha of common colour strings', () => {
  assert.equal(cssAlpha('#fff'), 1);
  assert.equal(cssAlpha('#11223380'), 128 / 255);
  assert.equal(cssAlpha('rgba(1, 2, 3, 0.25)'), 0.25);
  assert.equal(cssAlpha('rgb(1 2 3 / 40%)'), 0.4);
  assert.equal(cssAlpha('transparent'), 0);
  assert.equal(cssAlpha('orange'), 1);
});

test('lit() draws on the stage and stamps the same shape in white on the light map', () => {
  const stage = createStage();
  stage.ctx.fillStyle = '#000'; stage.ctx.fillRect(0, 0, stage.W, stage.H);
  lit(stage, c => circle(c, 300, 400, 40, '#F2A742'));
  const s = Array.from(stage.ctx.getImageData(300, 400, 1, 1).data);
  assert.deepEqual(s.slice(0, 3), [0xF2, 0xA7, 0x42], 'the stage gets the real colour');
  const g = stage.gain;
  assert.ok(g && g.dirty, 'the light map is marked dirty');
  assert.deepEqual(px(g, 300, 400).slice(0, 3), [255, 255, 255], 'the light map gets white');
  assert.deepEqual(px(g, 600, 900).slice(0, 3), [0, 0, 0], 'elsewhere the light map stays black');
});

test('lit() follows the stage transform and alpha, and {gain} scales the stamp', () => {
  const stage = createStage(), {ctx} = stage;
  ctx.save(); ctx.translate(200, 300); ctx.globalAlpha = 0.5;
  lit(stage, c => { c.fillStyle = 'rgba(10,200,30,1)'; c.fillRect(0, 0, 100, 100); }, {gain: 0.5});
  ctx.restore();
  const v = px(stage.gain, 250, 350)[0];
  assert.ok(Math.abs(v - 64) <= 3, `0.5 alpha × 0.5 gain ≈ 25% white, got ${v}`);
  assert.equal(px(stage.gain, 100, 100)[0], 0, 'outside the translated rect nothing is stamped');
});

test('gradients keep their alpha profile but lose their colour', () => {
  const stage = createStage();
  lit(stage, c => glow(c, 540, 960, 200, '#35C9B0', 0.8));
  const centre = px(stage.gain, 540, 960), edge = px(stage.gain, 540 + 190, 960);
  assert.ok(centre[0] === centre[1] && centre[1] === centre[2], 'grey, not teal');
  assert.ok(centre[0] > 150 && edge[0] < 30, `bright centre (${centre[0]}), dark edge (${edge[0]})`);
});

test('clearGain() resets the light map between frames', () => {
  const stage = createStage();
  lit(stage, c => circle(c, 100, 100, 30, rgba('#ffffff', 1)));
  clearGain(stage);
  assert.equal(stage.gain.dirty, false);
  assert.equal(px(stage.gain, 100, 100)[0], 0);
});

test('whiteContext leaves non-colour properties alone', () => {
  const stage = createStage(), g = ensureGain(stage), w = whiteContext(g.ctx);
  w.lineWidth = 7; w.fillStyle = '#ff000080';
  assert.equal(g.ctx.lineWidth, 7);
  assert.match(String(g.ctx.fillStyle), /255, ?255, ?255|#ffffff/i);
});
