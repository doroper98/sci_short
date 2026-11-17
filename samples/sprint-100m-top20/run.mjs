// 100 m all-time top 20 — one race. Runner for the picture.
//   node run.mjs video OUT.mp4                 silent picture, 1080x1920, 30 fps
//   node run.mjs stills PREFIX --t=0,1.2,5     PREFIX_<t>.png
//   node run.mjs events [OUT.json]             crossing times etc. for sound.py (default: events.json here)
//   node run.mjs check                         every frame: tag/tag, tag/body, safe-zone and top-block overlaps
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createStage, renderVideo, resolveTheme} from '../../pipeline/render/index.mjs';
import {Pix, W, H, SCALE} from './px.mjs';
import * as scene from './scene.mjs';
import {TL, ATH, N, crossings, gapAtBoltFinish, raceTime, phase, laneOf, T_REF, V_END} from './model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, '../..');
const require = createRequire(path.join(REPO, 'pipeline/render/index.mjs'));
const {ImageData} = require('@napi-rs/canvas');

const [mode, out, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const stage = createStage({theme: resolveTheme('noturno')});
const {ctx} = stage, P = new Pix();
const T = {stage, ctx};

let lastTags = [];
function frame(t) {
  const fs_ = scene.draw(P, t);
  ctx.putImageData(new ImageData(P.upscale(), W * SCALE, H * SCALE), 0, 0);
  lastTags = scene.overlay(T, t, fs_);
}

if (mode === 'video') {
  await renderVideo({stage, duration: TL.duration, frame, out, fps: TL.fps, gain: false});
} else if (mode === 'stills') {
  for (const s of (opt.t || '0').split(',')) { frame(Number(s)); fs.writeFileSync(`${out}_${s}.png`, stage.canvas.toBuffer('image/png')); }
  console.log('stills', opt.t);
} else if (mode === 'events') {
  const ev = {
    _: 'Written by `node run.mjs events` from model.mjs + timeline.json; read by sound.py. Video seconds.',
    fps: TL.fps, duration: TL.duration, gun: TL.gun, freeze: TL.freeze, slowmo_end: TL.slowmo_end, board_in: TL.board_in, row_stagger: TL.row_stagger, fade_out_s: TL.fade_out_s,
    bolt_finish_speed_ms: +V_END.toFixed(3), gap_rank20_at_bolt_finish_m: +gapAtBoltFinish(N - 1).toFixed(3),
    crossings: crossings(),
    // every foot strike (half a run cycle) of every runner, video seconds, until the board lands; lane 0 = far, 19 = near
    footsteps: (() => {
      const out = [], dt = 1 / 2000;
      for (let i = 0; i < N; i++) { let prev = Math.floor(2 * phase(i, 0));
        for (let t = TL.gun; t < TL.board_in[0]; t += dt) { const tau = raceTime(t); if (tau <= 0) continue; const k = Math.floor(2 * phase(i, tau)); if (k > prev) out.push([+t.toFixed(4), laneOf(i)]); prev = k; } }
      return out.sort((a, b) => a[0] - b[0]);
    })(),
    // footfall clock: race time at each video frame (the sound scales footfall density by it)
    race_time_at_frame: Array.from({length: Math.round(TL.duration * TL.fps)}, (_, k) => +raceTime(k / TL.fps).toFixed(4)),
  };
  const p = out || path.join(HERE, 'events.json');
  fs.writeFileSync(p, JSON.stringify(ev, null, 1) + '\n'); console.log('events', p);
} else if (mode === 'check') {
  const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const L = scene.LAYOUT, problems = [], stats = {minTagGap: Infinity, minTagBody: Infinity};
  const topBlock = {x: 0, y: 0, w: 1080, h: L.sub + 18};
  const n = Math.round(TL.duration * TL.fps);
  for (let k = 0; k < n; k++) {
    const t = k / TL.fps; if (t >= TL.board_in[0] - 0.2) break;          // tags are dimmed under the board after this
    frame(t);
    const tags = lastTags.map(g => ({i: g.i, x: g.x, y: g.y, w: g.w, h: g.h}));
    const bodies = scene.lastBodies.flatMap(b => b.bb.segs.map(q => ({i: b.i, x: q[0] * SCALE, y: q[1] * SCALE, w: (q[2] - q[0]) * SCALE, h: (q[3] - q[1]) * SCALE})));
    for (const a of tags) {
      if (a.x < 40 || a.x + a.w > 940 || a.y < 120 || a.y + a.h > 1500) problems.push(`t=${t.toFixed(3)} tag ${a.i} outside safe area (${a.x.toFixed(0)},${a.y.toFixed(0)},${(a.x + a.w).toFixed(0)},${(a.y + a.h).toFixed(0)})`);
      if (ov(a, topBlock) && a.x + a.w > 200) problems.push(`t=${t.toFixed(3)} tag ${a.i} meets top block (y=${a.y.toFixed(0)})`);
      for (const b of tags) if (b.i > a.i) { if (ov(a, b)) problems.push(`t=${t.toFixed(3)} tags ${a.i}/${b.i} overlap`); stats.minTagGap = Math.min(stats.minTagGap, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), b.x - (a.x + a.w), a.x - (b.x + b.w))); }
      for (const b of bodies) { if (ov(a, b)) problems.push(`t=${t.toFixed(3)} tag ${a.i} overlaps body ${b.i}`); stats.minTagBody = Math.min(stats.minTagBody, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), b.x - (a.x + a.w), a.x - (b.x + b.w))); }
    }
  }
  console.log(`checked frames up to the board; min tag-tag gap ${stats.minTagGap.toFixed(1)} px, min tag-body gap ${stats.minTagBody.toFixed(1)} px`);
  // summarise: one line per kind of problem with its first/last time and count
  const kinds = new Map();
  for (const pr of problems) { const [, t, rest] = pr.match(/^t=([\d.]+) (.*?)(?: \(.*)?$/); const k = rest.replace(/\(.*$/, ''); const e = kinds.get(k) || {n: 0, t0: t, t1: t}; e.n++; e.t1 = t; kinds.set(k, e); }
  console.log(problems.length ? [...kinds].map(([k, e]) => `${k}: ${e.n} frames, t ${e.t0}…${e.t1}`).join('\n') : 'no overlaps, all tags inside the safe area');
  process.exitCode = problems.length ? 1 : 0;
} else {
  console.error('usage: node run.mjs video OUT.mp4 | stills PREFIX --t=… | events [OUT.json] | check'); process.exit(2);
}
