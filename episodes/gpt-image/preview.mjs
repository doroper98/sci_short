// Art check sheet (PLAN §1): node episodes/gpt-image/preview.mjs → outputs/gpt-image/review/art.jpg
// Every picture comes from model.mjs (training maps, SMOOTH + quantize, generated runs at the fixed RUN seeds, WHO, noise).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {createStage, resolveTheme} from '../../pipeline/render/index.mjs';
import * as K from '../gpt-generative/kit.mjs';
import * as M from './model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'outputs/gpt-image/review');
fs.mkdirSync(OUT, {recursive: true});

const T = 24, PW = M.G * T, COLS = 5, GAP = 44, LAB = 64, X0 = 44, Y0 = 110;
const panels = [];
M.TRAIN.forEach((p, k) => panels.push({label: `공부 ${k + 1} · ${p.breath}·${p.what} #${p.variant + 1}`, codes: p.codes}));
panels.push({label: 'SMOOTH (원래 그림)', smooth: M.SMOOTH});
panels.push({label: `quantize · 같은 칸 ${(100 * M.SMOOTH_CODES.filter((c, i) => c === M.TRAIN[0].codes[i]).length / M.N).toFixed(1)}%`, codes: M.SMOOTH_CODES});
const gen = (what, breath, seed) => M.generate({what, breath, seed});
const main = gen('용', '불', M.RUN.MAIN), water = gen('용', '물', M.RUN.WATER);
panels.push({label: `MAIN 불·용 seed ${M.RUN.MAIN}`, codes: main.codes});
panels.push({label: `WATER 물·용 seed ${M.RUN.WATER} · ${M.diffCells(main.codes, water.codes).length}칸 다름`, codes: water.codes});
for (const s of ['S1', 'S2', 'S3']) panels.push({label: `${s} 불·용 seed ${M.RUN[s]}`, codes: gen('용', '불', M.RUN[s]).codes});
panels.push({label: `HELD 물·고양이 seed ${M.RUN.HELD}`, codes: gen('고양이', '물', M.RUN.HELD).codes});
const gl = gen('용', '불', M.RUN.GLITCH), lp = M.lowPicks(gl);
panels.push({label: `GLITCH seed ${M.RUN.GLITCH} · ${lp.map(l => `r${Math.floor(l.i / M.G)}c${l.i % M.G} p=${(100 * l.p).toPrecision(2)}%`).join(', ') || '흠 없음'}`, codes: gl.codes});
panels.push({label: 'WHO (한색 무엇 · 난색 숨 · 회색 늘 같음)', who: M.WHO});
M.NOISE_STEPS.forEach(l => panels.push({label: `noisy ${l}`, codes: M.noisy(M.TRAIN[0].codes, l, M.RUN.NOISE)}));

const rows = Math.ceil(panels.length / COLS), Wd = X0 * 2 + COLS * PW + (COLS - 1) * GAP, Hd = Y0 + rows * (PW + LAB + GAP) + 20;
const stage = createStage({width: Wd, height: Hd, theme: resolveTheme(K.theme)}), c = stage.ctx;
c.fillStyle = '#071017'; c.fillRect(0, 0, Wd, Hd);
stage.text('46 gpt-image · art check (model.mjs)', X0, 66, {size: 40, weight: 700, color: K.PAL.ink});

const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`, sh = (a, k) => rgb(a.map(v => Math.max(0, Math.min(255, v * k))));
function tiles(x, y, codes, rings = []) {
  for (let i = 0; i < M.N; i++) {
    const tx = x + (i % M.G) * T, ty = y + Math.floor(i / M.G) * T, col = M.RGB[codes[i]];
    c.fillStyle = rgb(col); c.fillRect(tx, ty, T, T);
    c.fillStyle = sh(col, 1.18); c.fillRect(tx, ty, T, 1);              // matte tile: 1 px lighter top, 1 px darker bottom
    c.fillStyle = sh(col, 0.62); c.fillRect(tx, ty + T - 1, T, 1);
    c.fillStyle = sh(col, 0.8); c.fillRect(tx + T - 1, ty, 1, T);
  }
  for (const i of rings) { const tx = x + (i % M.G) * T, ty = y + Math.floor(i / M.G) * T; c.strokeStyle = K.PAL.hot; c.lineWidth = 2; c.strokeRect(tx + 1, ty + 1, T - 2, T - 2); }
}
panels.forEach((p, k) => {
  const x = X0 + (k % COLS) * (PW + GAP), y = Y0 + Math.floor(k / COLS) * (PW + LAB + GAP);
  stage.text(p.label, x, y + 40, {size: 26, weight: 600, color: K.PAL.muted});
  const py = y + LAB;
  if (p.codes) tiles(x, py, p.codes, p.rings);
  else if (p.smooth) { const s = PW / M.SG; p.smooth.forEach((col, i) => { c.fillStyle = rgb(col); c.fillRect(x + (i % M.SG) * s, py + Math.floor(i / M.SG) * s, s + 0.5, s + 0.5); }); }
  else if (p.who) p.who.forEach((w, i) => { c.fillStyle = w === 'what' ? '#5FB6E0' : w === 'breath' ? '#FFB454' : '#2A3238'; c.fillRect(x + (i % M.G) * T + 1, py + Math.floor(i / M.G) * T + 1, T - 2, T - 2); });
});
fs.writeFileSync(path.join(OUT, 'art.jpg'), await stage.canvas.encode('jpeg', 90));
console.log('→', path.join(OUT, 'art.jpg'));
