// node --test pipeline/render/tests/   (run from repo root or pipeline/render: npm test)
// Default caption position. 2026-11-17 user: "유튜브 상에서 이렇게 자막있는 부분이 좀 살짝 아래에 위치해 있거든? 조금 위로
// 올리면 좋겠네" — the baseline of the last caption line moved from 1480 to 1380 (stage.mjs CAPTION_LIFT).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStage, CAPTION_LIFT, SAFE_ZONES} from '../stage.mjs';
import {drawCaptionText, CAPTION_DEFAULTS} from '../captions.mjs';

const OWNER_UI_TOP = 1430;   // channel-name row in the owner's YouTube app view, measured on the 2026-11-17 screenshot (video px)

test('caption guides: baseline 1380, two-line top 1260, platform-UI zone unchanged', () => {
  const {safe} = createStage();
  assert.equal(SAFE_ZONES.bottom, 420);
  assert.equal(safe.y1, 1500);
  assert.equal(CAPTION_LIFT, 120);
  assert.equal(safe.captionBase, 1380);
  assert.equal(safe.captionTop, 1260);
});

test('a default one-line caption ends above the channel-name row', () => {
  const stage = createStage();
  const box = drawCaptionText(stage, '짧은 자막');
  const glyphBottom = box.y + box.h - CAPTION_DEFAULTS.padY;          // baseline + 0.32 × size
  assert.ok(Math.abs(glyphBottom - (1380 + 0.32 * CAPTION_DEFAULTS.size)) < 1e-6, `glyph bottom ${glyphBottom}`);
  assert.ok(glyphBottom < OWNER_UI_TOP - 30, `caption bottom ${glyphBottom} too close to ${OWNER_UI_TOP}`);
});

test('a two-line caption starts at about safe.captionTop', () => {
  const stage = createStage();
  const box = drawCaptionText(stage, '위도 30도 근처에서 편서풍을 만나면 태풍은 북동쪽으로 길을 바꿉니다');
  assert.ok(Math.abs(box.y - stage.safe.captionTop) <= 6, `two-line top ${box.y} vs captionTop ${stage.safe.captionTop}`);
});

test('scaled stage keeps the same proportions; an explicit y still wins', () => {
  const half = createStage({width: 540, height: 960});
  assert.equal(half.safe.captionBase, 690);
  assert.equal(half.safe.captionTop, 630);
  const stage = createStage();
  const box = drawCaptionText(stage, '짧은 자막', {y: 1250});
  assert.ok(Math.abs(box.y + box.h - CAPTION_DEFAULTS.padY - (1250 + 0.32 * CAPTION_DEFAULTS.size)) < 1e-6);
});
