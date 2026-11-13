// node episodes/log-scale/thumbnail.mjs [--out finals/08-log-scale/thumbnail.jpg] [--no-text]
// Shorts thumbnail for the log-scale episode (2026-11-05, user: "한 칸에 열 배는 탈락, 쇼츠 친화적으로").
// The hook of the video as one picture: a calm magnitude-3 seismogram and, at the SAME vertical scale,
// the magnitude-6 trace — 10³ = 1000 times the amplitude — bursting out of its panel. Text: the question
// "규모 6은 규모 3의 2배?" and the answer "아니, 1000배" (seismograph shaking, as stated in s02).
// 2026-11-13: the question is "지진 규모 6은 / 규모 3의 2배?" (topic keyword on the thumbnail, owner's feedback). The finals
// thumbnail.jpg is now frame 0 of the video; this script's --no-text output is the video's poster key picture.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const kit = await import(pathToFileURL(path.join(root, 'pipeline/render/index.mjs')));
const ep = await import(pathToFileURL(path.join(here, 'scenes.mjs')));
const i = process.argv.indexOf('--out'), out = path.resolve(i > 0 ? process.argv[i + 1] : path.join(root, 'finals/08-log-scale/thumbnail.jpg'));
const theme = kit.resolveTheme(ep.theme), stage = kit.createStage({theme}), c = stage.ctx, T = stage.theme;
kit.background(stage, 0, {});

// synthetic seismogram (shape only): quiet P onset, then the strong S train; same function for both traces
const rnd = (k => () => ((k = (k * 16807) % 2147483647) / 2147483647))(20261105);
const parts = Array.from({length: 9}, (_, n) => ({f: 0.13 + 0.16 * rnd(), ph: 6.28 * rnd(), a: 0.5 + 0.5 * rnd()}));
const env = x => (x < 70 ? 0 : x < 260 ? 0.010 * (x - 70) / 190 : 0.010 + Math.exp(-(((x - 470) / 150) ** 2)) + 0.3 * Math.exp(-(((x - 680) / 170) ** 2)));
const wave = x => env(x) * parts.reduce((s, p) => s + p.a * Math.sin(p.f * x + p.ph), 0) / 3.2;
const X0 = 120, X1 = 960, A3 = 22;                                   // magnitude 3: ±22 px at its peak; magnitude 6 = 1000 × that
function panel(y0, h, label, col) {
  kit.rect(c, X0 - 20, y0, X1 - X0 + 40, h, 18, kit.rgba(T.plate, 0.78), kit.rgba(T.border, 1), 2);
  stage.text(label, X0 + 6, y0 + 44, {role: 'display', weight: 700, size: 40, color: col});
}
function trace(yc, amp, col, w, clip) {
  c.save(); c.beginPath(); c.rect(clip[0], clip[1], clip[2] - clip[0], clip[3] - clip[1]); c.clip();
  c.beginPath(); for (let x = X0; x <= X1; x += 1) { const y = yc - amp * wave(x - X0); x === X0 ? c.moveTo(x, y) : c.lineTo(x, y); }
  c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.shadowColor = col; c.shadowBlur = 18; c.stroke(); c.restore();
}
// magnitude 6 (top): the same drawing ×1000 — it bursts out of its panel up to the top of the screen
panel(300, 440, '규모 6', '#FFB547');
trace(520, A3 * 1000, '#FF8A3D', 3, [X0 - 60, 0, X1 + 60, 770]);
// magnitude 3 (below, same vertical scale): calm
panel(800, 170, '규모 3', T.ink);
trace(905, A3, '#CFE3F2', 4, [X0, 810, X1, 965]);
stage.text('같은 축척', 900, 852, {size: 30, weight: 700, color: T.muted, align: 'right'});

if (!process.argv.includes('--no-text')) {   // --no-text: picture only (poster key for the video's first frame, 2026-11-07)
// text block (central square): question, then the answer
const band = c.createLinearGradient(0, 990, 0, 1600);
band.addColorStop(0, 'rgba(0,6,12,0)'); band.addColorStop(0.18, 'rgba(0,6,12,0.82)'); band.addColorStop(0.85, 'rgba(0,6,12,0.82)'); band.addColorStop(1, 'rgba(0,6,12,0)');
c.fillStyle = band; c.fillRect(0, 990, 1080, 610);
const fit = (s, w, max, weight = 700) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight, size: max}));
// 2026-11-13: two white lines with the topic keyword (same words as the video's first frame, poster.json q_lines)
for (const [l, y] of [['지진 규모 6은', 1080], ['규모 3의 2배?', 1180]]) stage.text(l, 540, y, {role: 'display', weight: 700, size: Math.min(fit('지진 규모 6은', 860, 92), fit('규모 3의 2배?', 860, 92)), color: T.ink, align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 18});
stage.text('아니, 1000배', 540, 1370, {role: 'display', weight: 700, size: fit('아니, 1000배', 900, 210), color: '#FFB547', align: 'center', shadow: 'rgba(0,0,0,0.9)', shadowBlur: 26});
stage.text('지진계에 그려지는 흔들림 · 한 칸에 열 배', 540, 1520, {role: 'display', weight: 500, size: 40, color: T.light, align: 'center', shadow: 'rgba(0,0,0,0.85)', shadowBlur: 12});
}

fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, await stage.canvas.encode('jpeg', 90));
console.log(`thumbnail: ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
