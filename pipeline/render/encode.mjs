// Frame → ffmpeg (H.264 visual.mp4, no audio) and review stills + contact sheet.
// HDR(2026-11-15): 같은 반복에서 빛 지도(gain.mp4, hdr.mjs 의 lit())도 함께 쓴다 — pipeline/hdr.py 가 둘을 합쳐 HDR 판을 만든다.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createCanvas} from '@napi-rs/canvas';
import {fontString} from './stage.mjs';
import {ensureGain, clearGain} from './hdr.mjs';

const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/**
 * Stream frames into ffmpeg. frame(t) must draw the full frame on stage.ctx (opaque background). frame may be async
 * (it is awaited) — e.g. a scene that fetches a 3D layer from a headless browser.
 * getImageData() returns straight (un-premultiplied) RGBA in @napi-rs/canvas 1.0.11 — verified —
 * so ffmpeg reads -pix_fmt rgba. Full-range RGB is converted to BT.709 limited-range yuv420p.
 * gain: path of the HDR gain-map video (default: gain.mp4 next to `out`; false = do not write). Every frame gets a gain frame
 * (black when nothing was drawn with lit()), and <gain>.json records how many frames were lit.
 * Returns {frames, seconds, fps, out, gain, litFrames}.
 */
export async function renderVideo({stage, duration, frame, out, fps = stage.FPS, start = 0, crf = 18, preset = 'medium', onProgress = null, threads = 0, gain = undefined}) {
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
  // gain map: half-resolution grey video, full-range frames stored limited-range (pipeline/hdr.py reads it back with in_range=tv)
  const gainOut = gain === false ? null : (gain || path.join(path.dirname(path.resolve(out)), 'gain.mp4'));
  const G = gainOut ? ensureGain(stage) : null;
  let gf = null, gclosed = null, gerr = '', litFrames = 0;
  const blank = G ? Buffer.alloc(G.w * G.h * 4) : null;
  if (G) {
    for (let i = 3; i < blank.length; i += 4) blank[i] = 255;
    gf = spawn('ffmpeg', ['-y', '-hide_banner', '-v', 'warning', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${G.w}x${G.h}`, '-r', String(fps), '-i', 'pipe:0',
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', '-color_range', 'tv', '-r', String(fps), gainOut], {stdio: ['pipe', 'inherit', 'pipe']});
    gf.stderr.on('data', d => { gerr += d; process.stderr.write(d); });
    gf.stdin.on('error', e => { err = e; });
    gclosed = once(gf, 'close');
  }
  const total = Math.round(duration * fps), t0 = Date.now();
  const progress = onProgress || ((i, n, rate) => { if (i % (fps * 10) === 0 || i === n) console.log(`  frame ${i}/${n}  ${(i / fps).toFixed(1)}s  ${rate.toFixed(1)} fps`); });
  for (let i = 0; i < total; i++) {
    if (err) throw new Error(`ffmpeg pipe failed: ${err.message}\n${stderr}`);
    if (G) clearGain(stage);
    await frame(start + i / fps);
    const px = ctx.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(px.buffer, px.byteOffset, px.byteLength))) await Promise.race([once(ff.stdin, 'drain'), closed]);
    if (G) {
      let buf = blank;
      if (G.dirty) { const gp = G.ctx.getImageData(0, 0, G.w, G.h).data; buf = Buffer.from(gp.buffer, gp.byteOffset, gp.byteLength); litFrames++; }
      if (!gf.stdin.write(buf)) await Promise.race([once(gf.stdin, 'drain'), gclosed]);
    }
    progress(i + 1, total, (i + 1) / ((Date.now() - t0) / 1000));
  }
  ff.stdin.end();
  if (gf) gf.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}\n${stderr}`);
  if (gf) {
    const [gcode] = await gclosed;
    if (gcode !== 0) throw new Error(`ffmpeg (gain map) exited ${gcode}\n${gerr}`);
    fs.writeFileSync(gainOut.replace(/\.mp4$/, '.json'), JSON.stringify({file: path.basename(gainOut), frames: total, lit_frames: litFrames, width: G.w, height: G.h, scale: G.scale, fps}, null, 1) + '\n');
  }
  const seconds = (Date.now() - t0) / 1000;
  const result = {out, frames: total, seconds, fps: total / seconds, gain: gainOut, litFrames};
  console.log(`visual: ${out}  ${total} frames in ${seconds.toFixed(1)} s (${result.fps.toFixed(2)} fps render+encode)`);
  if (gf) console.log(`gain:   ${gainOut}  빛 지도 — lit() 를 쓴 프레임 ${litFrames}/${total}${litFrames ? '' : '  (없음: HDR 판에서 밝아지는 곳이 없습니다 — 빛나는 것을 lit() 안에서 그리세요)'}`);
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
  const thumbs = [], lights = [];
  for (const it of items) {
    clearGain(stage);
    await frame(it.t);
    const name = `${prefix}_${String(it.i).padStart(2, '0')}_${it.t.toFixed(2).replace('.', 's')}${it.label ? '_' + String(it.label).replace(/[^\w.-]+/g, '-') : ''}.jpg`;
    const file = path.join(outDir, name);
    fs.writeFileSync(file, await stage.canvas.encode('jpeg', quality));
    files.push(file);
    if (contactSheet) {
      const th = createCanvas(thumbW, Math.round(thumbW * stage.H / stage.W));
      th.getContext('2d').drawImage(stage.canvas, 0, 0, th.width, th.height);
      thumbs.push({canvas: th, ...it});
      // 빛 지도 확인용: 어둡게 한 화면 위에 lit() 로 표시한 곳만 밝게
      const lt = createCanvas(th.width, th.height), lc = lt.getContext('2d');
      lc.drawImage(stage.canvas, 0, 0, lt.width, lt.height); lc.fillStyle = 'rgba(0,0,0,0.72)'; lc.fillRect(0, 0, lt.width, lt.height);
      if (stage.gain?.dirty) { lc.globalCompositeOperation = 'lighter'; lc.drawImage(stage.gain.canvas, 0, 0, lt.width, lt.height); }
      lights.push({canvas: lt, lit: !!stage.gain?.dirty, ...it});
    }
  }
  const writeSheet = async (list, name) => {
    const tw = thumbW, thh = list[0].canvas.height, pad = 12, cap = 44, rows = Math.ceil(list.length / cols);
    const sc = createCanvas(pad + cols * (tw + pad), pad + rows * (thh + cap + pad)), c = sc.getContext('2d');
    c.fillStyle = '#0b0d0f'; c.fillRect(0, 0, sc.width, sc.height);
    list.forEach((th, k) => {
      const x = pad + (k % cols) * (tw + pad), y = pad + Math.floor(k / cols) * (thh + cap + pad);
      c.drawImage(th.canvas, x, y);
      c.strokeStyle = '#333'; c.strokeRect(x + 0.5, y + 0.5, tw - 1, thh - 1);
      c.fillStyle = '#e8e8e8'; c.font = fontString('body', 18, 500); c.textBaseline = 'top';
      c.fillText(`${fmtT(th.t)}  ${th.label || ''}`.slice(0, 34), x + 2, y + thh + 8);
    });
    const file = path.join(outDir, name);
    fs.writeFileSync(file, await sc.encode('jpeg', 88));
    return file;
  };
  let sheet = null, lightSheet = null;
  if (contactSheet && thumbs.length) sheet = await writeSheet(thumbs, 'contact-sheet.jpg');
  if (contactSheet && lights.some(l => l.lit)) lightSheet = await writeSheet(lights, 'contact-sheet-hdr.jpg');   // 빛 지도(HDR 판에서 밝아질 곳)
  console.log(`stills: ${files.length} → ${outDir}${sheet ? ' (+ contact-sheet.jpg)' : ''}${lightSheet ? ' (+ contact-sheet-hdr.jpg: 빛 지도)' : ''}`);
  return {files, sheet, lightSheet};
}
