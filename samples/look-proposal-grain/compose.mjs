// 견본 묶음 만들기 — render.mjs --png 로 뽑은 무손실 PNG 를 이어 붙인다.
//   node samples/look-proposal-grain/compose.mjs before-after <png 폴더> <out.jpg> t1 t2 t3
//   node samples/look-proposal-grain/compose.mjs crop <png 폴더> <out.jpg> t x1,y1 x2,y2       # 540×540 조각 둘, 100% 크기
//   node samples/look-proposal-grain/compose.mjs sheet <png 폴더> <out.jpg> t1 t2 …            # 새 질감만, 4열
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kit = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
const {createCanvas, loadImage} = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/node_modules/@napi-rs/canvas/index.js')));
kit.registerFonts({quiet: true});
const [mode, dir, out, ...rest] = process.argv.slice(2);
const img = async (look, t) => loadImage(fs.readFileSync(path.join(dir, `${look}_${(+t).toFixed(2)}.png`)));
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const BG = '#0B0B0C', INK = '#EDEAE4', MUTED = '#9A9893';
const label = (c, s, x, y, size = 26, col = INK, align = 'left') => { c.font = kit.fontString('body', size, 500); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'top'; c.fillText(s, x, y); };

let cv;
if (mode === 'before-after') {
  const times = rest.map(Number), w = 540, h = 960, pad = 16, cap = 44;
  cv = createCanvas(pad + 2 * (w + pad), pad + times.length * (h + cap + pad));
  const c = cv.getContext('2d'); c.fillStyle = BG; c.fillRect(0, 0, cv.width, cv.height);
  for (const [r, t] of times.entries()) {
    const y = pad + r * (h + cap + pad);
    for (const [k, look] of ['off', 'film'].entries()) {
      const x = pad + k * (w + pad);
      c.drawImage(await img(look, t), x, y + cap, w, h);
      label(c, look === 'off' ? '지금' : '새 질감', x + 2, y + 8, 26, look === 'off' ? MUTED : INK);
      label(c, fmt(t), x + w - 2, y + 10, 22, MUTED, 'right');
    }
  }
} else if (mode === 'crop') {
  const [t, ...pts] = rest, S = 540, pad = 16, cap = 44;
  const boxes = pts.map(p => p.split(',').map(Number));
  cv = createCanvas(pad + 2 * (S + pad), pad + boxes.length * (S + cap + pad));
  const c = cv.getContext('2d'); c.fillStyle = BG; c.fillRect(0, 0, cv.width, cv.height);
  const ims = {off: await img('off', t), film: await img('film', t)};
  for (const [r, [bx, by]] of boxes.entries()) {
    const y = pad + r * (S + cap + pad);
    for (const [k, look] of ['off', 'film'].entries()) {
      const x = pad + k * (S + pad);
      c.drawImage(ims[look], bx, by, S, S, x, y + cap, S, S);   // 100% (1 화소 = 1 화소)
      label(c, `${look === 'off' ? '지금' : '새 질감'} · 100% · ${fmt(+t)} · (${bx}, ${by})`, x + 2, y + 10, 22, look === 'off' ? MUTED : INK);
    }
  }
} else if (mode === 'sheet') {
  const times = rest.map(Number), cols = 4, w = 270, h = 480, pad = 12, cap = 36, rows = Math.ceil(times.length / cols);
  cv = createCanvas(pad + cols * (w + pad), pad + rows * (h + cap + pad));
  const c = cv.getContext('2d'); c.fillStyle = BG; c.fillRect(0, 0, cv.width, cv.height);
  for (const [i, t] of times.entries()) {
    const x = pad + (i % cols) * (w + pad), y = pad + Math.floor(i / cols) * (h + cap + pad);
    c.drawImage(await img('film', t), x, y, w, h);
    label(c, `새 질감 · ${fmt(t)}`, x + 2, y + h + 8, 20, INK);
  }
} else throw new Error(`모르는 모드 ${mode}`);
fs.writeFileSync(out, await cv.encode('jpeg', 92));
console.log(`${mode}: ${out} (${cv.width}×${cv.height})`);
