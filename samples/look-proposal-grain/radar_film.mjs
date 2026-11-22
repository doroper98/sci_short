// 빛이 주인공인 장면 — 레이더 견본(samples/look-proposal-radar/, 2026-11-10 사용자 승인본)을 새 질감으로 다시 그린다.
// 2026-11-22 사용자(질감 시안을 보고): "66번 재엔더. 마음에 드는군. 빛 효과 있는걸 보고싶은데 샘플을 만들어줄 수 있나"
//
//   node samples/look-proposal-grain/radar_film.mjs --look off  --png 3.0,4.0,5.0 --out outputs/look-proposal-grain/radar/png
//   node samples/look-proposal-grain/radar_film.mjs --look film --png 3.0,4.0,5.0 --out outputs/look-proposal-grain/radar/png
//   node samples/look-proposal-grain/radar_film.mjs --look film --video --out samples/look-proposal-grain/light-radar.mp4
//   [--timeline F]   기본 outputs/look-proposal-radar/silent/timeline.json (자막을 비운 음성 시간표 — README '빛이 주인공인 장면')
//   [--look-json J]  config/look.json 위에 구획별로 덮어쓸 JSON(문자열 또는 파일). 기본은 아래 LOOK_OVERRIDES(바탕 자리만)
//   [--noglow]       원본 Glow 번짐을 끈다(측정용: 번짐이 없는 심 밝기와 견줄 때)
//   [--nolook]       filmLook(비네트·질감)을 끈다(측정용)
//
// --look off : 원본 render.mjs 의 frame 과 같은 순서(background → scenes.range → overlays → 자막(비어 있음)). 원본 파일을 그대로 import.
// --look film: 원본 scenes.mjs 의 PAL 은 모듈 안의 const 라 밖에서 바꿀 수 없다 → 원본을 outputs/look-proposal-grain/radar/src/ 로
//              복사해 색 문자열과 하늘 채움 한 줄만 바꾼 사본을 import 한다(아래 FILM_SUBST). 원본 samples/look-proposal-radar/ 는 고치지 않는다.
//              바탕은 filmBackground, 맨 끝에 filmLook. 이 장면은 lit() 을 쓰지 않으므로 질감 층의 번짐은 걸리지 않고,
//              '빛 효과'는 원본의 Glow(국소 번짐)가 그대로 맡는다(둘을 겹치면 과해진다).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
const ORIG = path.join(ROOT, 'samples/look-proposal-radar');
const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const LOOK = arg('--look', 'film');
if (!['off', 'film'].includes(LOOK)) throw new Error(`--look 은 off 또는 film (받은 값: ${LOOK})`);

// 원본 색 → 새 질감 색. 빛(전파 난색·메아리 한색·수신기 선·별)은 그대로 두고, 무광 덩어리와 계기·자의 청록 기운만 중성 회색으로.
// 밝기(Y)는 원본과 비슷하게 맞췄다. [원본, 새 값, 쓰인 곳]
export const FILM_SUBST = [
  // 하늘 — 채우지 않는다(바탕은 filmBackground). 그라디언트 색 자체는 아래 줄을 빼면 쓰이지 않는다.
  ['c.fillStyle = sky; c.fillRect(0, 0, W, H);', '/* film: 하늘 채움 없음 — filmBackground */', '하늘 그라디언트 채움(#00080F→#001621→#062B3A→#00070B)'],
  // 자·계기 선(빛나지 않는 것)
  ['#6FAFC4', '#9A9CA1', '거리 호 점선 · 땅의 점 줄 · 자 이음 점선 · 수신기 눈금'],
  ['#3C7387', '#4A4C51', '등고선 · 땅 테두리 넓은 선 · 수신기 축(PAL.line)'],
  ['#4A8AA0', '#6B6D72', '땅 테두리 선 · 접시 케이블'],
  ['#2C7C93', '#55575C', '땅 위 대기 띠(알파 0~0.20 그대로)'],
  ['#9FC3CF', '#B4B6BA', '조준선 · 비행기 옛 자리 점선 윤곽 · 이동 화살표'],
  // 땅(무광 덩어리)
  ['#04171F', '#19191C', '땅 채움 위'],
  ['#020D13', '#131315', '땅 채움 가운데'],
  ['#00070B', '#0D0D0F', '땅 채움 아래(하늘 아래 끝과 같은 값 — 하늘은 채우지 않음)'],
  // 비행기(무광)
  ['#E6EFF1', '#ECEDEF', '비행기 몸통 위'],
  ['#B3C7CC', '#BFC3C8', '비행기 몸통 가운데'],
  ['#58747E', '#6A7078', '비행기 몸통 아래'],
  ['#B7C8CD', '#C4C7CB', '수평 꼬리날개'],
  ['#4B6670', '#5A5E64', '수평 꼬리날개 테두리'],
  ['#0A1E27', '#141518', '창문 · 조종석 창'],
  ['#34505A', '#44484E', '날개'],
  ['#2B444D', '#34373C', '엔진'],
  ['#9FB6BD', '#B1B4B9', '엔진 테두리'],
  // 접시·탑(무광)
  ['#3A5A66', '#4A4D52', '탑 왼쪽'],
  ['#22404B', '#303236', '탑 가운데'],
  ['#0F222A', '#18191C', '탑 오른쪽'],
  ['#7FA5B2', '#9A9DA2', '탑 모서리 · 받침 윗선'],
  ['#1D3944', '#2A2B2F', '받침'],
  ['#93ABB3', '#A4A7AB', '접시 뒷면 위'],
  ['#587680', '#686C71', '접시 뒷면 가운데'],
  ['#2A434C', '#36383D', '접시 뒷면 아래'],
  ['#E2ECEE', '#E8E9EA', '오목한 면 밝은 곳'],
  ['#A9BFC6', '#B5B8BB', '오목한 면 가운데'],
  ['#617E88', '#6F7278', '오목한 면 가장자리'],
  ['#3A545D', '#46494E', '먼 쪽 테두리'],
  ['#B8CBD1', '#C4C6CA', '버팀대'],
  ['#D5E0E3', '#DCDEE0', '급전부'],
  ['#7C98A1', '#8C9095', '회전축'],
  ['#C9D9DE', '#D3D5D8', '회전축 테두리'],
  // 수신기 판
  ['#05202B', '#222226', '수신기 판 위(알파 0.96, film plate #232327 쪽)'],
  ['#02121A', '#19191C', '수신기 판 아래'],
  ['#24505F', '#3A3B40', '수신기 판 테두리(film border)'],
  // 글자·별·속도선
  ['#93A8AE', '#A3A19B', '보조 글자(PAL.muted → film muted)'],
  ['#F4EBDD', '#F1EDE6', '큰 글자(PAL.ink → film ink)'],
  ['#DCE7EA', '#E2E1DD', '별 · 속도선(청록 기운만 뺌)'],
];
// 빛은 바꾸지 않았다(숯색 위에서 탁하지 않음 — README): PAL.warm #FFB454, hot #FFE2B0, cool #8CD9FF, coolHi #D6F4FF, 수신기 한색 번짐 #49C8FF,
// 시계 숫자 #CFEFFF, Glow 의 WARM [1, 0.70, 0.30] · COOL [0.55, 0.85, 1.0]. 테마의 바탕 계열(진행 막대 트랙 등)만 film 으로.

// '가운데가 조금 밝은 곳' = 접시(150, 1130)에서 비행기(782, 830)로 가는 전파 길의 가운데쯤(약 466, 980). 그 아래는 땅이 덮는다.
export const LOOK_OVERRIDES = {background: {center: '#29282D', cx: 0.43, cy: 0.50, r0: 0.05, r1: 0.66}};

const kit = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
let scenesFile = path.join(ORIG, 'scenes.mjs');
if (LOOK === 'film') {
  const SRC = path.join(ROOT, 'outputs/look-proposal-grain/radar/src');
  fs.mkdirSync(SRC, {recursive: true});
  let s = fs.readFileSync(scenesFile, 'utf8');
  s = s.replaceAll("'../../pipeline/render/index.mjs'", `'${pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')).href}'`)
       .replaceAll("'./glow.mjs'", `'${pathToFileURL(path.join(ORIG, 'glow.mjs')).href}'`);   // glow.mjs 에는 색이 없다 — 원본을 그대로
  for (const [a, b] of FILM_SUBST) {
    if (!s.includes(a)) throw new Error(`치환할 문자열이 원본에 없다: ${a}`);
    s = s.replaceAll(a, b);
  }
  const dst = path.join(SRC, 'scenes.mjs');
  if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== s) { fs.writeFileSync(dst + '.tmp', s); fs.renameSync(dst + '.tmp', dst); }
  scenesFile = dst;
}
const ep = await import(pathToFileURL(scenesFile));
const noGlow = argv.includes('--noglow');
if (noGlow) { const G = (await import(pathToFileURL(path.join(ORIG, 'glow.mjs')))).Glow; G.prototype.flush = function () { this.prev = [...this.d]; }; }

const tl = kit.loadTimeline(path.resolve(arg('--timeline', path.join(ROOT, 'outputs/look-proposal-radar/silent/timeline.json'))));
const sound = JSON.parse(fs.readFileSync(path.join(ORIG, 'sound.json'), 'utf8'));
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);
const theme0 = kit.resolveTheme(ep.theme);
const FILM = kit.resolveTheme('film');
const theme = LOOK === 'film' ? {...theme0, ...Object.fromEntries(['bg', 'deep', 'plate', 'border', 'ink', 'muted'].map(k => [k, FILM[k]]))} : theme0;
const stage = kit.createStage({theme});
const lj = arg('--look-json'), LJ = lj ? JSON.parse(lj.trim().startsWith('{') ? lj : fs.readFileSync(lj, 'utf8')) : {};
const look = kit.loadLook({...LOOK_OVERRIDES, ...LJ, background: {...LOOK_OVERRIDES.background, ...(LJ.background || {})}});
const noLook = argv.includes('--nolook');

function frame(t) {
  kit.clearGain?.(stage);
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  if (LOOK === 'film') kit.filmBackground(stage, look);
  ep.background(stage, t, ctx);   // film: 사본은 하늘을 채우지 않고 별·자·땅만 그린다
  stage.ctx.save(); ep.scenes[scene.id](stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
  if (LOOK === 'film' && !noLook) kit.filmLook(stage, t, look);
}

if (arg('--png')) {
  const dir = path.resolve(arg('--out', path.join(ROOT, 'outputs/look-proposal-grain/radar/png')));
  fs.mkdirSync(dir, {recursive: true});
  const tag = LOOK + (noGlow ? '-noglow' : '') + (noLook ? '-nolook' : '');
  // Glow 버퍼는 지난 프레임의 더러운 영역만 지운다 — 시각을 건너뛰어도 begin() 이 앞 영역을 지우므로 결과는 같다
  for (const t of arg('--png').split(',').map(Number)) { await frame(t); fs.writeFileSync(path.join(dir, `${tag}_${t.toFixed(2)}.png`), await stage.canvas.encode('png')); }
  process.exit(0);
}
if (argv.includes('--video')) {
  const out = path.resolve(arg('--out', path.join(ROOT, `outputs/look-proposal-grain/radar/${LOOK}.mp4`)));
  await kit.renderVideo({stage, duration: tl.duration, frame, out, gain: false, crf: +arg('--crf', 20), preset: 'medium'});
  process.exit(0);
}
// 묶음: --compose stills <png 폴더> <out.jpg> t:설명 …        세로 행마다 [예전 | 새 질감], 칸 540×960
//       --compose crop   <png 폴더> <out.jpg> t:x,y:설명 …    행마다 [예전 | 새 질감] 540×540 100% 조각
if (arg('--compose')) {
  const mode = arg('--compose'), i0 = argv.indexOf('--compose'), [dir, out, ...items] = argv.slice(i0 + 2);
  const {createCanvas, loadImage} = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/node_modules/@napi-rs/canvas/index.js')));
  kit.registerFonts({quiet: true});
  const BG = '#0B0B0C', INK = '#EDEAE4', MUTED = '#9A9893', pad = 16, cap = 44;
  const label = (c, s, x, y, size, col, align = 'left') => { c.font = kit.fontString('body', size, 500); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'top'; c.fillText(s, x, y); };
  const img = async (look, t) => loadImage(fs.readFileSync(path.join(dir, `${look}_${(+t).toFixed(2)}.png`)));
  const rows = items.map(s => s.split(':')), crop = mode === 'crop', w = 540, h = crop ? 540 : 960;
  const cv = createCanvas(pad + 2 * (w + pad), pad + rows.length * (h + cap + pad)), c = cv.getContext('2d');
  c.fillStyle = BG; c.fillRect(0, 0, cv.width, cv.height);
  for (const [r, row] of rows.entries()) {
    const t = +row[0], xy = crop ? row[1].split(',').map(Number) : null, desc = crop ? row[2] : row[1], y = pad + r * (h + cap + pad);
    for (const [k, look] of ['off', 'film'].entries()) {
      const x = pad + k * (w + pad), im = await img(look, t);
      if (crop) c.drawImage(im, xy[0], xy[1], w, h, x, y + cap, w, h); else c.drawImage(im, x, y + cap, w, h);
      label(c, (look === 'off' ? '예전' : '새 질감') + (crop ? ' · 100%' : ''), x + 2, y + 8, 26, look === 'off' ? MUTED : INK);
      label(c, `${t.toFixed(2)}초 · ${desc}`, x + w - 2, y + 12, 20, MUTED, 'right');
    }
  }
  fs.writeFileSync(out, await cv.encode('jpeg', 92));
  console.log(`${mode}: ${out} (${cv.width}×${cv.height})`);
  process.exit(0);
}
console.error('--png t1,t2,… 또는 --video 또는 --compose 를 주세요');
process.exit(2);
