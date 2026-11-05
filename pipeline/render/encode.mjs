// Frame → ffmpeg (H.264 visual.mp4, no audio) and review stills + contact sheet.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {fontString} from './stage.mjs';

const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/**
 * Stream frames into ffmpeg. frame(t) must draw the full frame on stage.ctx (opaque background).
 * getImageData() returns straight (un-premultiplied) RGBA in @napi-rs/canvas 1.0.11 — verified —
 * so ffmpeg reads -pix_fmt rgba. Full-range RGB is converted to BT.709 limited-range yuv420p.
 * Returns {frames, seconds, fps, out}.
 */
export async function renderVideo({stage, duration, frame, out, fps = stage.FPS, start = 0, crf = 18, preset = 'medium', onProgress = null, threads = 0}) {
  if (!(duration > 0)) throw new Error('renderVideo: duration must be > 0');
  fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
  const {W, H, ctx} = stage;
  const args = ['-y', '-hide_banner', '-v', 'warning', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    ...(threads ? ['-threads', String(threads)] : []), '-r', String(fps), '-movflags', '+faststart', out];
  const ff = spawn('ffmpeg', args, {stdio: ['pipe', 'inherit', 'pipe']});
  let stderr = '', err = null;
  ff.stderr.on('data', d => { stderr += d; process.stderr.write(d); });
  ff.stdin.on('error', e => { err = e; });
  const closed = once(ff, 'close');
  const total = Math.round(duration * fps), t0 = Date.now();
  const progress = onProgress || ((i, n, rate) => { if (i % (fps * 10) === 0 || i === n) console.log(`  frame ${i}/${n}  ${(i / fps).toFixed(1)}s  ${rate.toFixed(1)} fps`); });
  for (let i = 0; i < total; i++) {
    if (err) throw new Error(`ffmpeg pipe failed: ${err.message}\n${stderr}`);
    frame(start + i / fps);
    const px = ctx.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) await Promise.race([once(ff.stdin, 'drain'), closed]);
    progress(i + 1, total, (i + 1) / ((Date.now() - t0) / 1000));
  }
  ff.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}\n${stderr}`);
  const seconds = (Date.now() - t0) / 1000;
  const result = {out, frames: total, seconds, fps: total / seconds};
  console.log(`visual: ${out}  ${total} frames in ${seconds.toFixed(1)} s (${result.fps.toFixed(2)} fps render+encode)`);
  return result;
}

/**
 * Write review stills (JPG) and an optional contact sheet with timestamps.
 * times: [number | {t, label}] ; returns {files, sheet}
 */
export async function renderStills({stage, times, frame, outDir, contactSheet = true, quality = 90, cols = 4, thumbW = 270, prefix = 'still'}) {
  fs.mkdirSync(outDir, {recursive: true});
  const items = times.map(x => (typeof x === 'number' ? {t: x} : x)).map((x, i) => ({...x, i}));
  const files = [];
  const thumbs = [];
  for (const it of items) {
    frame(it.t);
    const name = `${prefix}_${String(it.i).padStart(2, '0')}_${it.t.toFixed(2).replace('.', 's')}${it.label ? '_' + String(it.label).replace(/[^\w.-]+/g, '-') : ''}.jpg`;
    const file = path.join(outDir, name);
    fs.writeFileSync(file, await stage.canvas.encode('jpeg', quality));
    files.push(file);
    if (contactSheet) {
      const th = createCanvas(thumbW, Math.round(thumbW * stage.H / stage.W));
      th.getContext('2d').drawImage(stage.canvas, 0, 0, th.width, th.height);
      thumbs.push({canvas: th, ...it});
    }
  }
  let sheet = null;
  if (contactSheet && thumbs.length) {
    const tw = thumbW, thh = thumbs[0].canvas.height, pad = 12, cap = 44, rows = Math.ceil(thumbs.length / cols);
    const sc = createCanvas(pad + cols * (tw + pad), pad + rows * (thh + cap + pad)), c = sc.getContext('2d');
    c.fillStyle = '#0b0d0f'; c.fillRect(0, 0, sc.width, sc.height);
    thumbs.forEach((th, k) => {
      const x = pad + (k % cols) * (tw + pad), y = pad + Math.floor(k / cols) * (thh + cap + pad);
      c.drawImage(th.canvas, x, y);
      c.strokeStyle = '#333'; c.strokeRect(x + 0.5, y + 0.5, tw - 1, thh - 1);
      c.fillStyle = '#e8e8e8'; c.font = fontString('body', 18, 500); c.textBaseline = 'top';
      c.fillText(`${fmtT(th.t)}  ${th.label || ''}`.slice(0, 34), x + 2, y + thh + 8);
    });
    sheet = path.join(outDir, 'contact-sheet.jpg');
    fs.writeFileSync(sheet, await sc.encode('jpeg', 88));
  }
  console.log(`stills: ${files.length} → ${outDir}${sheet ? ' (+ contact-sheet.jpg)' : ''}`);
  return {files, sheet};
}
