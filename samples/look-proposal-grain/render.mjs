// 질감 층 견본 — 66 꼬리날개의 실제 장면 함수로 '지금'과 '새 질감'을 그린다(무음, 빛 지도 파일 없음).
//   node samples/look-proposal-grain/render.mjs --look off  --stills 0,1,2 --out outputs/look-proposal-grain/off
//   node samples/look-proposal-grain/render.mjs --look film --stills 0,1,2 --out outputs/look-proposal-grain/film
//   node samples/look-proposal-grain/render.mjs --look film --from 0 --to 6 --out outputs/look-proposal-grain/a.mp4
//   [--hold N] [--amount A] [--size S]   config/look.json 의 grain 값을 이번 실행만 바꾼다(측정용)
//   [--crf N]                            영상 crf(기본 18 = 에피소드와 같음)
//   [--bloom K]                          번짐 세기 배율(0 = 끔, 비교용)
//   node samples/look-proposal-grain/render.mjs --look film --png 0,110 --out DIR   # 무손실 PNG
//   [--timing]                           filmLook 에 걸린 시간을 재서 찍는다
// --look off : 66번 render.mjs 의 frame 과 같은 순서(배경 → 장면 → overlays → 자막).
// --look film: kit.mjs 의 PAL 을 숯색 팔레트로 바꾼 뒤 scenes.mjs 를 읽고, 바탕은 filmBackground, 맨 끝에 filmLook.
// 에피소드 파일은 고치지 않는다. PAL 을 거치지 않고 직접 적힌 청록 계열 색은 사본에서만 바꾼다(아래 FILM_HARDCODED, --raw 로 끔).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
const EP = path.join(ROOT, 'episodes/tail-stability');
const argv = process.argv, arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const LOOK = arg('--look', 'film');
if (!['off', 'film'].includes(LOOK)) throw new Error(`--look 은 off 또는 film (받은 값: ${LOOK})`);

export const FILM_PAL = {
  bg: '#1A1A1D', deep: '#0E0E10', ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#232327',
  warm: '#FF6B1A', warmHi: '#F5A066', warmLo: '#B8501C', cool: '#5BA8F0', smoke: '#737B85',
  bodyHi: '#ECEDEF', bodyMid: '#BFC3C8', bodyLo: '#6A7078', wing: '#D2D5D9', dark: '#44484E', darker: '#34373C',
};

// PAL 을 거치지 않고 직접 적힌 청록 계열 색(엔진·조종석 창·풍향계·띠 등) → 밝기가 비슷한 중성 회색. 에피소드 파일은 그대로 두고
// --look film 에서만 그 사본(outputs/look-proposal-grain/src/)을 읽는다. 어느 파일 몇째 줄인지는 README '직접 적힌 색'.
export const FILM_HARDCODED = {
  '#0A1E27': '#141518', '#46636D': '#5A5E64', '#1E333B': '#27292D', '#9FB6BD': '#B1B4B9', '#58747E': '#6A7078', '#8AA0A6': '#9C9FA4',
  '#6E8A93': '#7F8389', '#3E5B66': '#50545A', '#1A2E36': '#222428', '#5C7883': '#6D7177', '#22383F': '#2B2D31', '#0E1D23': '#151619',
  'rgba(0,8,12,': 'rgba(8,8,10,', 'rgba(0,10,16,': 'rgba(9,9,11,',
};
const kit = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
let SRC = EP;
if (LOOK === 'film' && !argv.includes('--raw')) {   // --raw: 직접 적힌 색을 바꾸지 않은 원본 그대로(비교용)
  SRC = path.join(ROOT, 'outputs/look-proposal-grain/src');
  fs.mkdirSync(SRC, {recursive: true});
  const lib = pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')).href;
  for (const f of fs.readdirSync(EP)) {
    if (!f.endsWith('.json') && (!f.endsWith('.mjs') || f === 'render.mjs')) continue;
    let s = fs.readFileSync(path.join(EP, f), 'utf8');
    if (f.endsWith('.mjs')) { s = s.replaceAll("'../../pipeline/render/index.mjs'", `'${lib}'`); for (const [a, b] of Object.entries(FILM_HARDCODED)) s = s.replaceAll(a, b); }
    const dst = path.join(SRC, f);   // 같으면 다시 쓰지 않는다(여러 렌더를 함께 돌릴 때 반쯤 쓴 파일을 읽지 않게)
    if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== s) { fs.writeFileSync(dst + '.tmp', s); fs.renameSync(dst + '.tmp', dst); }
  }
}
const K = await import(pathToFileURL(path.join(SRC, 'kit.mjs')));
if (LOOK === 'film') Object.assign(K.PAL, FILM_PAL);          // scenes.mjs 를 읽기 전에(모듈이 import 때 색을 잡아 두는 경우에 대비)
const ep = await import(pathToFileURL(path.join(SRC, 'scenes.mjs')));

const tlFile = [path.join(ROOT, 'outputs/tail-stability/narration/timeline.json'), path.join(ROOT, 'finals/66-tail-stability/timeline.json')].find(f => fs.existsSync(f));
const tl = kit.loadTimeline(path.resolve(arg('--timeline', tlFile)));
const sound = JSON.parse(fs.readFileSync(path.join(EP, 'sound.json'), 'utf8'));   // 소리 사건은 원본에서
const events = tl.events([...(sound.events || []), ...(ep.events || [])]);
const theme0 = kit.resolveTheme(ep.theme);   // noturno — film 에서는 바탕 계열 색만 팔레트에 맞춘다(진행 막대 트랙·자막 판)
const theme = LOOK === 'film' ? {...theme0, ...Object.fromEntries(['bg', 'deep', 'plate', 'border', 'ink', 'muted'].map(k => [k, FILM_PAL[k]]))} : theme0;
const stage = kit.createStage({theme});
const g = {};
for (const k of ['hold_frames', 'amount', 'size']) { const v = arg('--' + (k === 'hold_frames' ? 'hold' : k)); if (v != null) g[k] = +v; }
const L0 = kit.loadLook(), bk = +arg('--bloom', 1);   // --bloom k: 번짐 세기 배율(0 = 끔, 비교용)
const look = kit.loadLook({grain: g, bloom: {tight_alpha: L0.bloom.tight_alpha * bk, wide_alpha: L0.bloom.wide_alpha * bk}});
const timing = argv.includes('--timing'), spent = [];

function frame(t) {
  kit.clearGain(stage);   // renderVideo(gain:false) 는 빛 지도를 비우지 않는다 — 번짐이 지난 프레임의 lit 을 보지 않게
  const scene = tl.sceneAt(t), ctx = {tl, events, theme, scene, local: scene.local, kit};
  if (LOOK === 'film') kit.filmBackground(stage, look); else ep.background(stage, t, ctx);
  stage.ctx.save(); ep.scenes[scene.id](stage, t, scene.p, ctx); stage.ctx.restore();
  ep.overlays?.(stage, t, ctx);
  kit.drawCaptions(stage, tl, t, {...(ep.captionLayout?.default || {}), ...(ep.captionLayout?.[scene.id] || {})});
  if (LOOK === 'film') {
    const t0 = timing ? process.hrtime.bigint() : 0n;
    kit.filmLook(stage, t, look);
    if (timing) spent.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
}
const report = () => {
  if (!timing || !spent.length) return;
  const s = [...spent].sort((a, b) => a - b), avg = s.reduce((a, b) => a + b, 0) / s.length;
  console.log(`[look] filmLook ${s.length}프레임: 평균 ${avg.toFixed(1)} ms, 중앙 ${s[s.length >> 1].toFixed(1)} ms, 최대 ${s[s.length - 1].toFixed(1)} ms`);
};

if (arg('--png')) {   // 무손실 정지화면(견본 묶음·100% 조각·측정용): <out>/<look>_<t>.png
  const dir = path.resolve(arg('--out', path.join(ROOT, 'outputs/look-proposal-grain/png')));
  fs.mkdirSync(dir, {recursive: true});
  for (const t of arg('--png').split(',').map(Number)) { await frame(t); fs.writeFileSync(path.join(dir, `${LOOK}_${t.toFixed(2)}.png`), await stage.canvas.encode('png')); }
  report();
  process.exit(0);
}
if (arg('--stills')) {
  const times = arg('--stills').split(',').map(Number).map(t => ({t, label: tl.sceneAt(t).id}));
  const dir = path.resolve(arg('--out', path.join(ROOT, `outputs/look-proposal-grain/${LOOK}`)));
  await kit.renderStills({stage, times, frame, outDir: dir, prefix: LOOK, cols: Math.min(4, times.length), quality: 95});
  report();
  process.exit(0);
}
const from = Math.max(0, +arg('--from', 0)), to = Math.min(tl.duration, +arg('--to', from + 6));
const out = path.resolve(arg('--out', path.join(ROOT, `outputs/look-proposal-grain/${LOOK}_${from}-${to}.mp4`)));
await kit.renderVideo({stage, duration: to - from, start: from, frame, out, gain: false, crf: +arg('--crf', 18), preset: 'medium'});
report();
