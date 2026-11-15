// 64번 기상 레이더 — 3D 층 구동기. 헤드리스 크롬(Playwright)에서 scene3d.html 을 열고, 프레임마다 (물체 번호, 밝기) 그림을 받아 온다.
// Claude 클라우드 세션에는 Chromium 과 Playwright 가 깔려 있다. three.js 는 pipeline/render 의 선택 의존성이다(npm install).
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {createRequire} from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
export const W = 270, H = 480;

export async function open3d(cfg) {
  const require = createRequire(import.meta.url);
  let chromium; try { ({chromium} = require('playwright')); } catch (e) { throw new Error('3D 층에는 Playwright 와 Chromium 이 필요합니다(Claude 클라우드 세션에는 깔려 있습니다): ' + e.message); }
  const three = path.join(ROOT, 'pipeline/render/node_modules/three/build');
  if (!fs.existsSync(path.join(three, 'three.module.js'))) throw new Error('three.js 가 없습니다: (cd pipeline/render && npm install)');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.route('http://scene.local/**', r => { const name = new URL(r.request().url()).pathname.slice(1), f = name.startsWith('three.') ? path.join(three, name) : path.join(HERE, name);
    r.fulfill({body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : 'text/javascript'}); });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://scene.local/scene3d.html'); await page.waitForFunction('typeof window.init === "function"', null, {timeout: 20000});
  await page.evaluate(c => window.init(c), cfg);
  if (errs.length) throw new Error('3D 장면 오류: ' + errs.join(' | '));
  const cache = new Map();
  /** layer → {id: Uint8Array(W*H), light: Uint8Array(W*H)} (위에서 아래로) */
  const unpack = b64 => { const px = Buffer.from(b64, 'base64'), id = new Uint8Array(W * H), light = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((H - 1 - y) * W + x) * 4; if (px[o + 3] > 127) { id[y * W + x] = px[o]; light[y * W + x] = px[o + 1]; } } return {id, light}; };
  return {
    /** p 는 scene3d.html 의 window.frame 인자. key 를 주면 같은 key 의 결과를 다시 쓴다(움직이지 않는 장면). */
    async frame(p, key = null) {
      if (key && cache.has(key)) return cache.get(key);
      const r = await page.evaluate(q => window.frame(q), p);
      if (errs.length) throw new Error('3D 장면 오류: ' + errs.join(' | '));
      const out = {solid: unpack(r.solid), rain: r.rain ? unpack(r.rain) : null, beam: r.beam ? unpack(r.beam) : null, feed: r.feed, far: r.far, away: r.away, axis: r.axis, points: r.points};
      if (key) cache.set(key, out);
      return out;
    },
    async close() { await browser.close(); },
  };
}
