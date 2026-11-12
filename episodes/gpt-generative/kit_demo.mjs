// Kit check sheet (PLAN §2.3): every part of kit.mjs in its states on one 1080×1920 frame, plus the poster.
// node episodes/gpt-generative/kit_demo.mjs → outputs/gpt-generative/review/kit-demo.jpg, kit-demo-poster{,-q50,-q100}.jpg
// Values here are demo values (not a model); small grey labels name what is shown.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {createStage, resolveTheme} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'outputs/gpt-generative/review');
fs.mkdirSync(OUT, {recursive: true});
const stage = createStage({theme: resolveTheme(K.theme)}), c = stage.ctx;
const note = (s, x, y, align = 'left') => stage.text(s, x, y, {size: 24, weight: 500, color: K.PAL.muted, alpha: 0.85, align});
const save = async name => { fs.writeFileSync(path.join(OUT, name), await stage.canvas.encode('jpeg', 90)); console.log('→', path.join(OUT, name)); };

// ---------------- sheet 1: parts ----------------
K.background(stage, 0, {});
K.head(stage, '부품 확인표 · kit.mjs', 'GPT 3부작 공통 부품', 1, 1);
K.tag(stage, 'tag · 지금 뽑은 조각', 70, 320, {align: 'left', color: K.PAL.warm});
K.bigNum(stage, '62', '%', 1, 0, 1, {x: 1010, y: 320, size: 96});

// chips: kinds (wrapped), sweep at q = 0.5 over them
note('layoutChips + chip kinds · sweep q = 0.5 (first 4)', 70, 380);
const pieces = ['GPT는', '대답을', '어떻게', '쓸까?', '한', '조각씩', '뽑아서', '쓴다', '■', '가림막'];
const kinds = ['given', 'given', 'given', 'given', 'made', 'made', 'made', 'ghost', 'end', 'cover'];
const boxes = K.layoutChips(pieces, {x0: 70, x1: 1010, y0: 404, lineGap: 48});
boxes.forEach((b, i) => { K.chip(stage, b, {kind: kinds[i]}); note(kinds[i], b.x + b.w / 2, b.y + b.h + 30, 'center'); });
K.sweep(stage, boxes.slice(0, 4), 0.5);
// states
const yS = boxes[boxes.length - 1].y + boxes[0].h + 72;
note('states: hi · hi · dim · pop 0.5 · caret', 70, yS - 12);
const sb = K.layoutChips(['질문', '조각', '흐림', '반쯤', '끝'], {x0: 70, x1: 1010, y0: yS + 8, gap: 24});
const st = [['given', {hi: 1}, 'given hi'], ['made', {hi: 1}, 'made hi'], ['given', {dim: 1}, 'dim'], ['made', {pop: 0.5}, 'pop 0.5'], ['made', {}, 'caret']];
sb.forEach((b, i) => { K.chip(stage, b, {kind: st[i][0], ...st[i][1]}); note(st[i][2], b.x + b.w / 2, b.y + b.h + 26, 'center'); });
K.caret(stage, sb[4], 0.1, 1);

// machines
const yM = 816;
note('machine idle · busy 0.7', 70, yM - 22);
K.machine(stage, {x: 70, y: yM, w: 190, h: 138});
K.machine(stage, {x: 280, y: yM, w: 190, h: 138}, {busy: 0.7});
// dial grid
note('dialGrid 6×3 (ghost, hi)', 70, 974);
const vals = [0.4, -1.2, 2.1, 0.0, -2.6, 1.3, 1.8, -0.5, 0.9, -1.9, 2.8, 0.2, -0.8, 1.1, -2.2, 0.6, 2.4, -1.5];
const ghost = vals.map((v, i) => (i % 5 === 1 ? v - 1.1 : null)), hi = vals.map((v, i) => (i === 2 || i === 10 ? 1 : 0));
K.dialGrid(stage, vals, {x0: 96, y0: 1014, cols: 6, dx: 66, dy: 46, r: 20, ghost, hi});

// meaning map (+ dots, trail, links through Glow)
const R = {x: 500, y: 816, w: 510, h: 290};
note('mapPlane · dot · trail · link 0.55/0.30/0.15', 500, yM - 22);
K.mapPlane(stage, R, {regions: [{cx: -0.5, cy: -0.05, rx: 0.42, ry: 0.55, label: '탈것', tone: 'cool'}, {cx: 0.5, cy: -0.05, rx: 0.42, ry: 0.55, label: '과일', tone: 'neutral'}]});
const P = uv => K.mapPt(R, uv);
const dGiven = [K.dot(stage, ...P([-0.65, 0.15]), {label: '버스'}), K.dot(stage, ...P([-0.35, -0.3]), {label: '기차'})];
K.dot(stage, ...P([0.3, 0.25]), {label: '사과', kind: 'given'});
K.dot(stage, ...P([0.62, -0.35]), {label: '배', kind: 'ghost'});
const tr = [P([0.05, -0.7]), P([0.2, -0.45]), P([0.45, -0.32]), P([0.6, -0.12])];
K.trail(stage, tr, 1);
const dMade = K.dot(stage, ...tr[3], {kind: 'made', label: '포도', labelDy: 30, labelDx: -70});
const {GW} = K.glowBegin();
K.link(GW, dMade, P([0.3, 0.25]), 0.55, 1, {bend: 0.15});
K.link(GW, dMade, dGiven[0], 0.30, 1, {bend: 0.12});
K.link(GW, dMade, dGiven[1], 0.15, 0.7, {bend: -0.1});
K.glowFlush(stage);

// instrument panel + curve
K.panel(stage); K.panelLabel(stage, 'panel · curve · axisTicks');
const pts = K.sampleRec(x => 1190 + 80 * (1 - Math.exp(-(x - 110) / 230)) + 4 * Math.sin(x * 0.05), 110, 760, 6);
K.curve(stage, pts.map(([x, y]) => [x, y]), {color: K.PAL.warm});
K.axisTicks(stage, [{x: 110, label: '0'}, {x: 435, label: '5천'}, {x: 760, label: '1만 번'}], 1, {x0: 110, x1: 960});

// strip
note('strip 5 segs · u = 0.70 (marker → its segment hi)', 70, 1372);
const segs = [{label: '맑고', p: 0.38}, {label: '흐리고', p: 0.24}, {label: '비가', p: 0.18}, {label: '춥고', p: 0.12}, {label: '눈', p: 0.08}];
const S = K.strip(stage, segs, {y: 1420, u: 0.70});
note(`stripPick(0.70) = ${K.stripPick(segs, 0.70)}`, 1010, 1372, 'right');

// probability bars
note('probBars: 5 cand + rest · row 2 hi · row 3 ghostP', 70, 1532);
const rows = [{label: '맑고', p: 0.38}, {label: '흐리고', p: 0.24, hi: 1}, {label: '비가', p: 0.18, ghostP: 0.31}, {label: '춥고', p: 0.12}, {label: '눈이', p: 0.004},
  {label: '그 밖', p: 0.076, kind: 'rest'}];
K.probBars(stage, rows, {y0: 1560});
await save('kit-demo.jpg');

// ---------------- sheet 2: poster (thumbnail frame) and its morph ----------------
const POSTER = {q: ['GPT는 대답을', '어떻게 쓸까?'], a: '한 조각씩 뽑아서', y: 470, y2: 760};
for (const [q, name] of [[0, 'kit-demo-poster.jpg'], [0.5, 'kit-demo-poster-q50.jpg'], [1, 'kit-demo-poster-q100.jpg']]) {
  K.background(stage, 0, {});
  const mb = K.layoutChips(['오늘', '날씨는', '어때?', '맑고'], {x0: 150, x1: 930, y0: 920});
  mb.forEach((b, i) => K.chip(stage, b, {kind: i < 3 ? 'given' : 'made'}));
  K.caret(stage, mb[3], 0.1);
  K.machine(stage, {x: 360, y: 1040, w: 360, h: 260}, {busy: 0.4});
  if (q === 1) K.head(stage, '오늘의 주제', '', 1, 0);
  K.posterTitle(stage, POSTER, q, 1);
  await save(name);
}
