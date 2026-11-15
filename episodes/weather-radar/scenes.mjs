// Episode scenes — 64 "기상 레이더 — 전파를 쏘고, 빗방울의 메아리를 듣는다"
// 화풍 시험 둘째 편(2026-11-15 사용자: "하늘을 꼭 노을로 정해놓지 마. 기상레이더 편 한번 만들어봐 풀로"): 픽셀 일러스트 + 3D.
//   입체(관측소, 주변 땅, 비구름 덩이, 전파 빔)는 three.js(three3d.mjs, scene3d.html)가 270×480 에 (물체 번호, 밝기)만 그리고,
//   색·점묘·윤곽선은 px.mjs 가 입힌다. 하늘·먼 산·단면·계기는 2D 픽셀 그림(world.mjs). 글자는 4배로 키운 그림 위에 또렷하게 얹는다.
// HDR 첫 편: 빛나는 것(전파 묶음·메아리·빔·레이더 화면·켜진 칸)은 P.lit() 로 그린다 — 픽셀 버퍼가 화소마다 빛나는 정도를 적고,
//   blit() 이 그것을 pipeline/render 의 빛 지도(stage.gain)에 그대로 넣는다. 글자 판 아래의 빛은 꺼서 글자가 번쩍이지 않게 한다.
// 장면 함수는 async 다(3D 층을 헤드리스 크롬에서 받아 온다) — 이 편의 render.mjs 가 await 한다.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {progressBar, ensureGain} from '../../pipeline/render/index.mjs';
import {Pix, W, H, SCALE, C, bayer, clamp, lerp, ease, hash} from './px.mjs';
import * as M from './world.mjs';
import {open3d} from './three3d.mjs';

const require = createRequire(new URL('../../pipeline/render/index.mjs', import.meta.url));
const {ImageData, GlobalFonts} = require('@napi-rs/canvas');
const PIXEL_FONT = fileURLToPath(new URL('../../assets/fonts/Galmuri11-Bold.ttf', import.meta.url));
if (!fs.existsSync(PIXEL_FONT)) throw new Error('머리글 글꼴이 없습니다: python3 episodes/tsunami/fetch_pixel_font.py 를 먼저 실행하세요 (assets/fonts/Galmuri11-Bold.ttf)');
GlobalFonts.registerFromPath(PIXEL_FONT, 'TsuPixel');

export const theme = 'noturno';
export const captionLayout = {};
export const events = [];
export function background() {}

const P = new Pix(), TAU = Math.PI * 2;
const AMB = '#F2A742', GOLD = '#F7C766', CREAM = '#FBEBC0', INK = '#F4F1E8', DIM = '#A9C4B4', SH = 'rgba(6,10,20,0.6)';
const FOOT = '크기와 각도는 과장한 그림 · 설명 모형';
const RING = new Set([12]), GY = 236;                                        // 옆에서 본 장면의 땅의 줄
let T3 = null;
const three = async () => (T3 ||= await open3d(M.CFG3D));
export async function close() { if (T3) { await T3.close(); T3 = null; } }

// ---------------------------------------------------------------------------------------------------------------
// 시간 계획
// ---------------------------------------------------------------------------------------------------------------
let K = null;
const warned = new Set();
export function plan(tl) {
  if (K && K.tl === tl) return K;
  const S = id => tl.at(id), E = id => tl.at(id + ':end'), sc = id => tl.scene(id);
  const Wd = (sid, word, frac = 0.5) => {
    try { return tl.wordStart(sid, word); } catch { if (!warned.has(sid + word)) { warned.add(sid + word); console.warn(`plan: "${word}" not in ${sid} — using ${frac} of the sentence`); } const s = tl.sentence(sid); return s.start + frac * (s.end - s.start); }
  };
  const k = {tl, S, E, Wd, sc};
  // 첫 장면·맺음: 접시의 방향과 카메라의 방향. 빔이 화면 오른쪽(비 쪽)을 볼 때 메아리가 돌아온다
  k.spin = t => 1.45 + 1.3 * t; k.camAz = t => 0.32 + 0.2 * Math.sin(t * 0.33); k.HTILT = 0.16;
  k.heroRight = t => Math.cos(k.HTILT) * Math.sin(k.spin(t) - k.camAz(t)); k.heroHit = t => k.heroRight(t) > 0.72;
  k.oRain = Wd('s04', '화면에', 0.3); k.oTool = Wd('s04', '신호가', 0.85);
  // 전파 묶음: 가는 데 TLEG, 오는 데 TLEG. 닿는 순간과 '천 분의 일 초'에 맞춰 되풀이한다
  k.TLEG = 2.0;
  const hitA = Wd('s07', '닿으면', 0.25) + 0.1, backB = Wd('s08', '천 분의', 0.7) + 0.15, first = Wd('s05', '쏩니다', 0.55) + 0.1;
  const emitA = hitA - k.TLEG, m = Math.max(1, Math.round((emitA - first) / 5.0)), p1 = (emitA - first) / m;
  const n = Math.max(1, Math.round((backB - 2 * k.TLEG - emitA) / 5.0)), p2 = (backB - 2 * k.TLEG - emitA) / n;
  k.emits = [...Array.from({length: m}, (_, i) => first + i * p1), ...Array.from({length: n + 1}, (_, i) => emitA + i * p2)];
  k.cycle = t => { let e = null; for (const x of k.emits) if (x <= t) e = x; return e; };
  k.pDist = Wd('s08', '곧 거리', 0.45); k.pHalf = k.emits[k.emits.length - 1] + 2 * k.TLEG;          // '시간이 곧 거리' / 마지막 메아리가 돌아오는 때
  k.eMany = Wd('s09', '많다는', 0.75) - 0.2; k.eB = Wd('s10', '지름이 두 배면', 0.5) - 0.2; k.e64 = Wd('s10', '예순네', 0.85); k.eC = S('s11') + 0.3; k.eSee = Wd('s11', '레이더가 보는', 0.6);
  // 훑기: 한 바퀴 2.4초, 바퀴마다 고개를 든다
  const scan = sc('scan');
  k.scan0 = scan.start + 0.3; k.lap = 2.4;
  k.scanAng = t => Math.max(0, t - k.scan0) / k.lap * TAU; k.HEAD0 = 2.4;
  k.scanAz = t => ((Math.PI - k.HEAD0 + k.scanAng(t)) % TAU + TAU) % TAU;                              // 접시가 보는 방위(북에서 시계 방향)
  // 도플러, 이중편파, 한계
  k.dTow = Wd('s14', '다가오면', 0.2); k.dAway = Wd('s14', '멀어지면', 0.45); k.dRead = Wd('s14', '이 차이로', 0.6); k.dSide = Wd('s14', '옆으로', 0.82);
  k.pShape = Wd('s15', '방울의 모양도', 0.4); k.pRain = Wd('s15', '큰 빗방울은', 0.62); k.pHail = Wd('s15', '우박은', 0.85);
  k.lEarth = Wd('s16', '지구가', 0.35); k.l200 = Wd('s17', '이백', 0.05); k.lMiss = Wd('s17', '놓칠', 0.85); k.lMany = Wd('s18', '여러 곳의', 0.2); k.lFill = Wd('s18', '메웁니다', 0.85);
  K = k; return k;
}

// ---------------------------------------------------------------------------------------------------------------
// 글자
// ---------------------------------------------------------------------------------------------------------------
function type(stage) {
  const {ctx} = stage;
  const unlit = (x, y, w, h) => { const g = stage.gain; if (g && g.dirty) { g.ctx.fillStyle = '#000'; g.ctx.fillRect(x * g.scale - 1, y * g.scale - 1, w * g.scale + 2, h * g.scale + 2); } };
  return {
    big(s, x, y, o = {}) { stage.text(s, x, y, {role: 'display', weight: 700, size: o.size || 64, color: o.color || INK, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 18}); },
    kicker(s, x = 60, y = 150, o = {}) { stage.text(s, x, y, {size: 26, weight: 700, color: AMB, tracking: 4, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 10}); },
    sans(s, x, y, o = {}) { stage.text(s, x, y, {size: o.size || 26, weight: o.weight || 500, color: o.color || CREAM, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 10}); },
    accent(s, x, y, o = {}) {
      ctx.save(); ctx.globalAlpha = o.alpha ?? 1; ctx.font = `${o.size || 48}px TsuPixel`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = o.align || 'left';
      ctx.fillStyle = 'rgba(6,10,20,0.9)'; ctx.fillText(s, x + 4, y + 4); ctx.fillStyle = o.color || CREAM; ctx.fillText(s, x, y); ctx.restore();
    },
    gauge(name, value, x, a = 1, color = INK) {
      stage.text(name, x, 1238, {size: 26, weight: 500, color: DIM, alpha: a, shadow: SH, shadowBlur: 8});
      stage.text(value, x, 1287, {role: 'display', weight: 700, size: 48, color, alpha: a, shadow: SH, shadowBlur: 12});
    },
    tag(s, x, y, o = {}) {
      const size = o.size || 26, a = o.alpha ?? 1; if (a <= 0.01) return;
      ctx.save(); ctx.font = `500 ${size}px sans-serif`; stage.text('', 0, 0, {size, weight: 500}); const w = stage.measure(s, {size, weight: 500}) + 20, h = size + 14, al = o.align || 'left';
      const x0 = Math.round((al === 'center' ? x - w / 2 : al === 'right' ? x - w : x) / 4) * 4, y0 = Math.round((y - h / 2) / 4) * 4, ww = Math.ceil(w / 4) * 4, hh = Math.ceil(h / 4) * 4;
      ctx.globalAlpha = a * 0.86; ctx.fillStyle = '#131C26'; ctx.fillRect(x0, y0, ww, hh); ctx.restore();
      if (a > 0.5) unlit(x0, y0, ww, hh);
      stage.text(s, x0 + 10, y0 + hh / 2 + 1, {size, weight: 500, color: o.color || CREAM, alpha: a});
    },
    foot(s, a = 1) { stage.text(s, 60, 1342, {size: 24, weight: 500, color: DIM, alpha: a, shadow: SH, shadowBlur: 8}); },
    footR(s, a = 1) { stage.text(s, 940, 1342, {size: 24, weight: 500, color: DIM, alpha: a, align: 'right', shadow: SH, shadowBlur: 8}); },
    lines(t, list) { for (const [s, t0, t1] of list) { const a = ease(t, t0, t0 + 0.35) * (1 - ease(t, t1 - 0.35, t1)); if (a > 0.01) this.accent(s, 60, 284, {alpha: a}); } },
    stage, ctx,
  };
}
/** 픽셀 그림과 빛 지도를 무대에 올린다 */
function blit(stage) {
  stage.ctx.putImageData(new ImageData(P.upscale(), W * SCALE, H * SCALE), 0, 0);
  if (P.anyLit) { const g = ensureGain(stage); g.ctx.putImageData(new ImageData(P.upscaleGain(), g.w, g.h), 0, 0); g.dirty = true; }
}
const fade = (t, t0, t1, d = 0.35) => ease(t, t0, t0 + d) * (1 - ease(t, t1 - d, t1));

// ---------------------------------------------------------------------------------------------------------------
// 그림 조각
// ---------------------------------------------------------------------------------------------------------------
const HERO = {dx: -52, dy: 16, hz: 280, cx: 198, cy: 188};
/** 들판의 관측소(3D)와 그 너머의 비(2D). 접시가 도는 대로 빔이 나가고, 비를 향할 때 메아리가 돌아온다. o: {beam 0..1, cloud false = 비구름 없이} */
async function hero(t, k, o = {}) {
  const az = k.camAz(t), head = k.spin(t), r = await (await three()).frame({cam: {az, el: 0.42, zoom: 1, target: [0, 46, 0]}, head, tilt: k.HTILT, show: ['station'], beamLen: 150});
  const {hz, cx, cy} = HERO;
  P.begin();
  M.sky(P, hz, t);
  if (o.cloud !== false) M.cloud(P, cx, cy, 104, 42, {seed: 2, dark: 1, rain: 0.85, t, rainTo: hz, slant: 0.2});
  M.cloud(P, 42, 176, 50, 16, {seed: 5, dark: 0});
  M.hills(P, hz, 0);
  M.ground(P, hz, {field: 50});
  const x0 = r.feed[0] + HERO.dx, y0 = r.feed[1] + HERO.dy, x1 = r.far[0] + HERO.dx, y1 = r.far[1] + HERO.dy, n = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / n, ny = (x1 - x0) / n;
  const on = (o.beam ?? 1) > 0.5 ? 1 : 0, hit = on && o.cloud !== false && k.heroHit(t), qh = hit ? clamp((cx - 14 - x0) / (x1 - x0), 0.2, 0.9) : 1;         // 빔이 빗줄기에 닿는 자리
  const beam = () => {
    if (!on) return;
    M.beam2d(P, x0, y0, x1, y1, 1, 7, 0.7, t);
    const ph = (t * 0.8) % 1;
    P.lit(1, () => { for (const q of [ph, (ph + 0.5) % 1]) { const w = 1 + 6 * q, bx = lerp(x0, x1, q), by = lerp(y0, y1, q); for (let j = -w; j <= w; j++) P.px(Math.round(bx + nx * j), Math.round(by + ny * j), C.cream); } });
    if (hit) {
      for (let i = 0; i < 6; i++) { const q = qh + 0.3 * hash(i, 3), u = (t * 1.3 + hash(i, 7)) % 1, j = (hash(i, 5) - 0.5) * 14; M.ripple(P, lerp(x0, x1, q) + nx * j, lerp(y0, y1, q) + ny * j, 2 + 9 * u, 0.75 * (1 - u)); }
      const pb = 1 - ((t * 0.8 + 0.25) % 1); M.packet(P, lerp(x0, x1, pb * qh), lerp(y0, y1, pb * qh), -1, 5, 2, 0.8);                // 돌아오는 메아리
    }
  };
  if (r.away > 0) beam();
  P.blit3d(r.solid, M.RAMP, {dx: HERO.dx, dy: HERO.dy, emit: id => (id === 8 ? 0.7 : 0)});
  if (r.away <= 0) beam();
  return {r, hit};
}
/** 옆에서 본 관측소(3D, 움직이지 않으면 한 번만 그린다). 돌려주는 것: 급전부의 화면 자리 */
async function station(x, tiltRad, o = {}) {
  const zoom = o.zoom || 0.5, flip = o.flip ? -1 : 1, key = `side:${tiltRad.toFixed(3)}:${zoom}:${flip}`;
  const r = await (await three()).frame({cam: {az: 0, el: 0.07, zoom, target: [0, 40, 0]}, head: flip * Math.PI / 2, tilt: tiltRad, show: ['station']}, key);
  const dx = x - 135, dy = (o.gy ?? GY) - (240 + 40 * zoom * Math.cos(0.07)) - 1;
  P.blit3d(r.solid, M.RAMP, {dx, dy, emit: id => (id === 8 ? 0.7 : 0)});
  return [r.feed[0] + dx, r.feed[1] + dy];
}
/** 옆에서 본 세계의 바탕: 하늘, 먼 산, 땅 */
function sideWorld(t, gy = GY, o = {}) { P.begin(); M.sky(P, typeof gy === 'function' ? gy(0) : gy, t); if (o.hills !== false) M.hills(P, typeof gy === 'function' ? gy(0) : gy, 0); M.ground(P, gy); }
/** 빗속으로 들어간 바탕(방울을 크게 볼 때): 짙은 띠와 떨어지는 빗줄기 */
function inside(t) {
  P.begin(); P.bands(0, W, [[0, C.night], [48, C.storm], [110, C.steel], [300, C.storm], [372, C.night]], H, 6);
  for (let i = 0; i < 150; i++) { const x = Math.floor(hash(i, 1) * W), y = Math.floor((hash(i, 2) * 420 + t * (50 + 30 * hash(i, 3))) % 420) + 70, c = y < 110 || y > 300 ? C.steel : C.sky; for (let j = 0; j < 5; j++) P.px(x, y + j, c); }
}

// ---------------------------------------------------------------------------------------------------------------
// 장면
// ---------------------------------------------------------------------------------------------------------------
export const scenes = {
  // 0초 = 포스터(흰 물음 + 가장 큰 주제어). 접시는 0초부터 돈다.
  async hook(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s2 = k.S('s02'), end = ctx.scene.end;
    await hero(t, k); blit(stage);
    const a0 = 1 - ease(t, s2 - 0.6, s2 - 0.1);
    if (a0 > 0) { T.big('비구름을', 60, 250, {size: 62, alpha: a0}); T.big('어떻게 볼까?', 60, 330, {size: 62, alpha: a0}); T.big('기상 레이더', 56, 496, {size: 150, color: AMB, alpha: a0}); }
    const ka = ease(t, s2, s2 + 0.5); if (ka > 0) { T.kicker('기상 레이더', 60, 150, {alpha: ka}); T.footR(FOOT, ka); }
    const tw = k.Wd('s02', '전파를', 0.5);
    T.lines(t, [['구름을 찍는 카메라가 아닙니다', s2 + 0.2, tw - 0.15], ['전파를 쏘고, 메아리를 듣습니다', tw + 0.1, end + 1]]);
  },

  // 이름: RAdio Detection And Ranging. 옛 화면의 점(비행기·배)과 얼룩(비) — 그 얼룩이 날씨를 보는 도구가 됐다.
  async origin(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s3 = k.S('s03'), s4 = k.S('s04'), end = ctx.scene.end;
    const tRain = k.oRain, tTool = k.oTool, on = t > s4 + 0.1;
    const {r} = await hero(t, k, {beam: on ? 0 : 1, cloud: !on});
    const PX = 124, PY = 150, CX = PX + 62, CY = PY + 62;                       // 옛 레이더 화면: 훑는 선은 접시와 같은 방향을 본다
    const blips = [[-22 + 4 * Math.sin(t * 0.2), -18], [10, 24 - (t * 0.5) % 6]];
    if (on) {
      M.panel(P, PX, PY, 124, 124);
      M.ppi(P, CX, CY, 50, {sweep: Math.atan2(r.axis[0], -r.axis[2]), mono: true, swept: () => true,
        field: (x, z) => { let v = t > tRain ? 44 * Math.exp(-(((x - 62) / 30) ** 2 + ((z + 20) / 24) ** 2) * 1.1) + (hash(Math.round(x / 4), Math.round(z / 4) + Math.floor(t * 3)) - 0.5) * 22 : 0;
          for (const [bx, bz] of blips) if (Math.hypot(x - bx * 2.44, z - bz * 2.44) < 5) v = 60; return v; }});
    }
    blit(stage);
    T.kicker('이름의 뜻 · 1940년');
    const out = 1 - ease(t, s4 - 0.5, s4 - 0.1), a = ease(t, s3 + 0.2, s3 + 0.6) * out;
    if (a > 0.01) {
      stage.text('RADAR', 60, 300, {role: 'display', weight: 700, size: 132, color: AMB, alpha: a, shadow: SH, shadowBlur: 18, tracking: 10});
      const tw = k.Wd('s03', '거리를', 0.45), words = [['RA', 'dio', k.Wd('s03', '전파로', 0.15)], ['D', 'etection', k.Wd('s03', '찾아내고', 0.3)], ['A', 'nd', tw - 0.15], ['R', 'anging', tw + 0.1]];
      let x = 60; for (const [cap, rest, tt] of words) { const wa = a * ease(t, tt - 0.1, tt + 0.25); x += stage.text(cap, x, 420, {role: 'display', weight: 700, size: 46, color: AMB, alpha: wa, shadow: SH, shadowBlur: 10}); x += stage.text(rest, x, 420, {role: 'display', weight: 500, size: 46, color: CREAM, alpha: wa, shadow: SH, shadowBlur: 10}) + 18; }
      const tg = k.Wd('s03', '줄임말', 0.8) - 0.3; T.sans('전파로 찾아내고 거리를 잰다', 60, 492, {size: 34, alpha: a * ease(t, tg, tg + 0.4)});
    }
    T.lines(t, [['처음에는 비행기와 배를 찾는 장치', s4 + 0.2, tRain - 0.1], ['화면에 끼어든 잡음, 비와 눈', tRain + 0.15, tTool - 0.9], ['그 잡음이 날씨를 읽는 신호로', tTool - 0.7, end + 1]]);
    if (on) {
      T.sans('옛 레이더 화면', (PX + 4) * 4, (PY + 7) * 4, {size: 24, color: DIM});
      T.tag('비행기', (CX + blips[0][0] - 3) * 4, (CY + blips[0][1] - 8) * 4, {alpha: fade(t, s4 + 0.8, tRain + 2.5), align: 'right'});
      T.tag(t > tTool - 0.7 ? '비와 눈' : '잡음', 940, (CY - 35) * 4, {alpha: ease(t, tRain + 0.3, tRain + 0.7), align: 'right', color: GOLD});
    }
    T.footR(FOOT);
  },

  // 쏘고 듣는다: 짧은 전파 묶음이 150 km 를 다녀오는 데 1,000분의 1초. 달린 길 300 km 의 절반이 비까지의 거리.
  async pulse(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s5 = k.S('s05'), s6 = k.S('s06'), s7 = k.S('s07'), s8 = k.S('s08'), end = ctx.scene.end;
    sideWorld(t);
    const XR = 200, cy = GY - 106;                                              // 비: 150 km 밖
    M.cloud(P, XR, cy, 84, 40, {seed: 3, dark: 1, rain: 0.85, t, rainTo: GY, slant: 0.18});
    const [fx, fy] = await station(46, 0.07, {zoom: 0.8}), xe = XR - 12, ye = fy - 8;
    for (let i = 0; i <= 3; i++) P.rect(Math.round(lerp(fx, XR, i / 3)), GY + 3, 1, 4, C.pale);                 // 50 km 마다 눈금
    P.line(fx + 4, fy, xe, ye, C.pale, 2);                                                                        // 전파가 가는 길
    const e = k.cycle(t), u = e == null ? -1 : (t - e) / k.TLEG;                                                  // 0..1 가는 중, 1..2 오는 중
    if (u >= 0 && u < 1) M.packet(P, lerp(fx + 4, xe, u), lerp(fy, ye, u), 1, 12, 5, 1);
    if (u >= 1 && u < 2) M.packet(P, lerp(xe, fx + 4, u - 1), lerp(ye, fy, u - 1), -1, 8, 3, 0.65);
    if (u >= 0.96 && u < 1.9) for (let i = 0; i < 8; i++) { const q = (u - 0.96) * 1.1 - hash(i, 4) * 0.25; if (q > 0 && q < 1) M.ripple(P, XR - 26 + 52 * hash(i, 1), ye - 14 + 44 * hash(i, 2), 1 + 13 * q, 0.8 * (1 - q)); }
    if (u > 0.08 && u < 2.3) { const b = 0.5 + 0.5 * Math.sin(t * 9); P.lit(0.5, () => P.ring(fx, fy, 6 + 2 * b, 1, C.amber, 0.75)); }      // 듣는 중
    // 계기: 시간–세기 화면(훑는 점이 150 km 자리에 올 때 메아리가 도착한다) / 1시간 가운데 쏘는 시간
    const tDist = k.pDist, tHalf = k.pHalf;
    const hour = t > s6 + 0.2 && t < s7 - 0.2, back = u >= 2, q = u < 0 ? 0 : Math.min(1, u / 2) * 0.75;
    if (hour) { M.panel(P, 10, 252, 250, 44); P.rect(18, 272, 234, 9, C.panel2); P.lit(1, () => P.rect(18, 272, 1, 9, C.gold)); }
    else M.ascope(P, 10, 252, 250, 44, q, back ? [[0.75, 16]] : [], {seed: Math.floor(t * 12)});
    blit(stage);
    T.kicker('아주 느리게 본 모습');
    T.lines(t, [['아주 짧게 쏘고, 곧바로 듣습니다', s5 + 0.3, s6 - 0.3], ['1시간에 쏘는 시간은 7초 남짓', s6 + 0.2, s7 - 0.3], ['빗방울이 전파를 사방으로 흩습니다', s7 + 0.2, s8 - 0.3], ['걸린 시간이 곧 거리', s8 + 0.2, end + 1]]);
    if (hour) { T.sans('쏘는 시간을 다 합쳐 7초', 76, 1050, {size: 24, color: GOLD}); T.sans('듣는 시간 59분 53초', 1000, 1050, {size: 24, align: 'right'}); T.sans('1시간', 540, 1152, {size: 24, align: 'center', color: DIM}); }
    else { T.sans(t < tDist ? '돌아온 세기 · 가로는 쏜 뒤 지난 시간(1,000분의 1초)' : '돌아온 세기 · 가로는 거리', 56, 1030, {size: 24, color: DIM});
      (t < tDist ? ['0', '0.33', '0.67', '1.00', '1.33'] : ['0', '50', '100', '150', '200 km']).forEach((v, i) => T.sans(v, 64 + 952 * i / 4, 1172, {size: 22, color: t < tDist ? DIM : GOLD, align: i === 4 ? 'right' : i ? 'center' : 'left'})); }
    const ms = u < 0 ? 0 : Math.min(2, u) / 2, tone = back ? AMB : INK;
    T.gauge('지난 시간(1,000분의 1초)', ms.toFixed(2), 60, 1, tone); T.gauge('전파가 달린 길', `${Math.round(300 * ms)} km`, 450, ease(t, s8 + 0.2, s8 + 0.7), tone); T.gauge('비까지는 그 절반', back ? '150 km' : '— km', 740, ease(t, tDist, tDist + 0.5), tone);
    T.tag('150 km', XR * 4, (GY + 10) * 4, {align: 'center', alpha: ease(t, tHalf, tHalf + 0.4)});
    T.foot(hour ? '7초는 미국 기상 레이더(NEXRAD)의 값입니다' : FOOT);
  },

  // 메아리의 세기: 방울이 많으면 그만큼(3방울 = 3칸), 크면 지름의 여섯제곱만큼(지름 2배 한 방울 = 64칸). 구름 방울은 0칸.
  async echo(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s9 = k.S('s09'), s10 = k.S('s10'), s11 = k.S('s11'), end = ctx.scene.end;
    inside(t);
    const tMany = k.eMany, tB = k.eB, t64 = k.e64, tC = k.eC, tSee = k.eSee;
    const n1 = t < tMany ? 1 : 3, cols = [[8, 8, n1, s9 + 0.3, n1, 9], [95, 16, 1, tB, 64, 4], [182, 1, 90, tC, 0, 2]], PY = 98, PH = 86;
    cols.forEach(([x, d, n, t0, lit, seed], i) => {
      if (t < t0) return;
      const pu = ((t - t0) % 2.6) / 1.3, grow = i === 1 ? clamp((t - t0 - 0.9) / Math.max(0.8, t64 - t0 - 0.9)) : clamp((t - t0 - 0.9) / 0.4);
      M.drops(P, x, PY, 80, PH, d, n, {seed, pulse: pu, echo: pu > 0.3 && pu < 2 ? pu - 0.3 : 0, t, fall: 4});
      M.blocks(P, x + 12, PY + PH + 12, 8, 8, Math.round(lit * grow), {size: 6, gap: 1, ghost: 64});
      if (t > tSee && i < 2) { P.rect(x - 2, PY - 2, 84, 1, C.gold); P.rect(x - 2, PY + PH + 1, 84, 1, C.gold); P.rect(x - 2, PY - 2, 1, PH + 4, C.gold); P.rect(x + 81, PY - 2, 1, PH + 4, C.gold); }
    });
    blit(stage);
    T.kicker('빗방울을 크게 본 모습');
    T.lines(t, [['메아리가 강하다 = 크거나 많다', s9 + 0.2, s10 - 0.3], ['지름이 2배면 메아리는 64배', s10 + 0.2, s11 - 0.3], ['구름 방울은 거의 잡히지 않습니다', s11 + 0.2, tSee - 0.1], ['레이더가 보는 것은 빗방울', tSee + 0.1, end + 1]]);
    const lab = (s, x, t0) => { if (t >= t0) T.sans(s, (x + 40) * 4, (PY - 9) * 4, {size: 26, align: 'center'}); };
    lab(t < tMany ? '지름 1 mm · 1방울' : '지름 1 mm · 3방울', 8, s9 + 0.3); lab('지름 2 mm · 1방울', 95, tB); lab('구름 방울 0.01 mm', 182, tC);
    const cnt = (s, x, t0, c) => T.sans(s, (x + 40) * 4, (PY + PH + 78) * 4, {size: 30, weight: 700, align: 'center', alpha: ease(t, t0, t0 + 0.4), color: c});
    cnt(t < tMany + 1.1 ? '메아리 1' : '메아리 3', 8, s9 + 1.3, GOLD); cnt('메아리 64', 95, t64, GOLD); cnt('거의 0', 182, tC + 1.4, CREAM);
    const g = clamp((t - tB - 0.9) / Math.max(0.8, t64 - tB - 0.9));
    const cur = t < tB ? ['1 mm', '1'] : t < tC ? ['2 mm', String(Math.round(64 ** g))] : ['0.01 mm', '1조분의 1'];
    T.gauge('방울 지름', cur[0], 60); T.gauge('방울 하나의 메아리', cur[1], 420, 1, AMB);
    T.foot('방울이 전파의 파장보다 훨씬 작을 때 · 설명 모형');
  },

  // 훑기(3D): 접시가 돌며 빔이 비구름을 지난다 → 메아리 → 레이더 화면의 그 방위에 색이 칠해진다 → 한 바퀴마다 고개를 든다
  async scan(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s12 = k.S('s12'), s13 = k.S('s13'), end = ctx.scene.end;
    const ang = k.scanAng(t), lapN = Math.floor(ang / TAU), head = k.HEAD0 - ang, tiltStep = lapN + ease(ang % TAU, TAU - 0.5, TAU) , tilt = 0.06 + 0.06 * Math.min(4, tiltStep);
    const pts = M.CELLS.map(c => [c.r * Math.sin(c.az), c.h, -c.r * Math.cos(c.az)]);
    const r = await (await three()).frame({cam: {az: 0, el: 0.6, zoom: 0.95, target: [0, 10, 0]}, head, tilt, stationScale: 0.32, show: ['station', 'land', 'clouds', 'rain', 'beam'], beamLen: 100, points: pts});
    const az = k.scanAz(t), az0 = k.scanAz(k.scan0), DY = -84;
    P.begin(); M.sky(P, 228, t, {drift: 0.4});
    for (let y = 228; y < H; y++) for (let x = 0; x < W; x++) P.px(x, y, y < 232 ? C.soil : C.ink);
    P.blit3d(r.solid, M.RAMP, {dy: DY, emit: id => (id === 8 ? 0.7 : 0), flat: RING});
    P.blit3d(r.rain, M.RAMP, {dy: DY, outline: null, alpha: (x, y) => (((x + Math.floor(y * 0.5 - t * 14)) % 3 + 3) % 3 === 0 ? 0.85 : 0)});
    P.lit(0.85, () => P.blit3d(r.beam, M.RAMP, {dy: DY, outline: null, alpha: () => 0.62}));
    M.CELLS.forEach((c, i) => { const d = Math.abs(((az - c.az + Math.PI + TAU) % TAU) - Math.PI), hitNow = clamp(1 - d / 0.3); if (hitNow > 0) for (let j = 0; j < 4; j++) M.ripple(P, r.points[i][0] + (hash(j, i) - 0.5) * c.size * 0.9, r.points[i][1] + DY + 4 + (hash(j, i + 9) - 0.5) * 8, 2 + 8 * ((t * 2 + hash(j, 3)) % 1), hitNow * (1 - ((t * 2 + hash(j, 3)) % 1)), c.dbz > 45 ? C.cream : C.gold); });
    // 계기: 레이더 화면(북쪽이 위 — 위의 그림과 같은 방향)
    M.panel(P, 8, 222, 254, 82);
    M.ppi(P, 62, 263, 37, {sweep: az, field: M.dbzAt, swept: a => ang >= TAU || ((a - az0 + TAU) % TAU) <= ang});
    [C.e1, C.e2, C.e3, C.e4, C.e5].forEach((c, i) => P.rect(124 + i * 22, 262, 20, 7, c));               // 색의 자(빛나는 것이 아니다)
    blit(stage);
    T.kicker('빠르게 돌린 화면');
    T.lines(t, [['돌면서, 한 바퀴마다 고개를 듭니다', s12 + 0.2, s13 - 0.3], ['메아리의 세기를 색으로 칠한 지도', s13 + 0.2, end + 1]]);
    T.sans('레이더 화면', 480, 916, {size: 24, color: DIM}); T.sans('약한 메아리', 496, 1100, {size: 24}); T.sans('센 메아리', 932, 1100, {size: 24, align: 'right'});
    T.sans('북', 248, 908, {size: 22, color: DIM, align: 'center'});
    const deg = [0.5, 1.5, 2.4, 3.4, 4.3][Math.min(4, lapN)];
    T.gauge('접시가 보는 방위', `${Math.round(az * 180 / Math.PI)}°`, 60); T.gauge('올려다보는 각', `${deg.toFixed(1)}°`, 420, 1, AMB); T.gauge('훑은 층', `${Math.min(5, lapN + 1)}층`, 760);
    T.foot(FOOT);
  },

  // 도플러: 다가오면 돌아온 물결이 촘촘해지고(진동수 ↑), 멀어지면 성겨진다(↓). 옆으로 지나가면 그대로다 — 읽는 것은 레이더 쪽으로의 움직임뿐.
  async doppler(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s = ctx.scene, end = s.end;
    sideWorld(t);
    const mode = t < k.dAway - 0.2 ? 0 : t < k.dSide - 0.3 ? 1 : 2;                                  // 0 다가옴, 1 멀어짐, 2 옆으로
    const xa = 206 - (Math.min(t, k.dAway - 0.2) - s.start) * 3.0, xb = xa + (clamp(t, k.dAway - 0.2, k.dSide - 0.3) - (k.dAway - 0.2)) * 3.4, XR = xb, cy = GY - 106;
    M.cloud(P, XR, cy, 78, 38, {seed: 4, dark: 1, rain: 0.85, t, rainTo: GY, slant: [0.45, -0.3, 0.05][mode]});
    const [fx, fy] = await station(46, 0.07, {zoom: 0.8});
    const lane = (y, sp, dir, c, a, lv) => P.lit(lv, () => { for (let x = Math.round(fx + 8); x < XR - 30; x++) { const ph = ((x * dir - t * 26) % sp + sp) % sp; if (ph < 1.6) for (let j = -6; j <= 6; j++) P.pxA(x, y + j, c, a * (1 - Math.abs(j) / 9)); } });
    lane(fy - 10, 8, 1, C.amber, 0.85, 0.6);                                                          // 나가는 전파(간격은 늘 같다)
    const sp = [5.5, 11, 8][mode], col = [C.blue, C.red, C.cream][mode];
    if (t > k.dTow - 0.3) lane(fy + 10, sp, -1, col, 0.95, 0.8);                                      // 돌아오는 전파
    if (mode > 0) for (let x = Math.round(fx + 8); x < XR - 30; x++) if (((x % 5.5) + 5.5) % 5.5 < 1) P.rect(x, fy + 19, 1, 3, C.steel);   // 잔상: 다가올 때의 간격
    // 계기: 위에서 본 움직임(레이더가 왼쪽, 점선 = 레이더가 보는 방향)
    M.panel(P, 10, 250, 250, 48);
    const rx = 30, ry = 274, bx = 60 + (XR - 150) * 1.6, by = ry + (mode === 2 ? -14 + 28 * (((t - k.dSide + 0.3) * 0.35) % 1) : 0);
    P.line(rx, ry, bx, by, C.line, 2); P.rect(rx - 2, ry - 2, 5, 5, C.metal); P.disc(bx, by, 6, C.cloud3); P.disc(bx - 1, by - 1, 4, C.cloud2);
    const arrow = (x, y, dx, dy, c) => { for (let i = 0; i < 12; i++) P.px(Math.round(x + dx * i), Math.round(y + dy * i), c); for (let j = 1; j < 4; j++) { P.px(Math.round(x + dx * (11 - j) - dy * j), Math.round(y + dy * (11 - j) + dx * j), c); P.px(Math.round(x + dx * (11 - j) + dy * j), Math.round(y + dy * (11 - j) - dx * j), c); } };
    if (mode === 0) arrow(bx - 10, by, -1, 0, C.blue); else if (mode === 1) arrow(bx + 10, by, 1, 0, C.red); else arrow(bx + 12, by - 5, 0, 1, C.cream);
    blit(stage);
    T.kicker('도플러');
    T.lines(t, [['다가오면 진동수가 높아지고', k.dTow - 0.2, k.dAway - 0.3], ['멀어지면 낮아집니다', k.dAway, k.dRead - 0.2], ['다가오는지 멀어지는지는 읽지만', k.dRead, k.dSide - 0.3], ['옆으로 지나가는 움직임은 모릅니다', k.dSide - 0.1, end + 1]]);
    const tone = ['#7FB6E6', '#E88A78', CREAM][mode];
    T.tag('나가는 전파', (fx + 12) * 4, (fy - 25) * 4); T.tag('돌아오는 전파', (fx + 12) * 4, (fy + 30) * 4, {alpha: ease(t, k.dTow, k.dTow + 0.4), color: tone});
    T.sans('위에서 본 움직임', 56, 1022, {size: 24, color: DIM});
    T.gauge('빗방울의 움직임', ['다가옴', '멀어짐', '옆으로'][mode], 60, 1, tone); T.gauge('돌아온 진동수', ['조금 높아짐', '조금 낮아짐', '그대로'][mode], 420, ease(t, k.dTow, k.dTow + 0.4), AMB);
    T.foot('물결 간격의 차이는 크게 과장했습니다 · 설명 모형');
  },

  // 이중편파: 가로·세로로 떨리는 두 전파. 납작한 빗방울은 가로 메아리가 세고, 둥근 우박은 둘이 비슷하다.
  async dualpol(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s = ctx.scene, end = s.end;
    inside(t);
    const PY = 98, PH = 92, BX = 40, BW = 72, cols = [[10, true, s.start + 0.2, k.pRain, 1, 0.6], [140, false, k.pHail - 0.6, k.pHail, 0.8, 0.8]];
    cols.forEach(([x, rain, tIn, t0, hBar, vBar], i) => {
      if (t < tIn) return;
      const pu = ((t - tIn) % 2.6) / 1.3, g = clamp((t - t0) / 0.7);
      M.drops(P, x, PY, 120, PH, rain ? 24 : 20, 3, {seed: rain ? 12 : 21, oblate: rain, hail: !rain, pulse: pu, echo: pu > 0.3 && pu < 2 ? pu - 0.3 : 0, t, fall: rain ? 5 : 8});
      for (const [j, v, c] of [[0, hBar, C.gold], [1, vBar, C.amber]]) { const y = PY + PH + 14 + j * 18; P.rect(x + BX, y, BW, 9, C.panel); P.lit(0.75, () => P.rect(x + BX, y, Math.round(BW * v * g), 9, c)); }
    });
    blit(stage);
    T.kicker('이중편파');
    T.lines(t, [['가로와 세로, 두 전파를 함께', s.start + 0.3, k.pShape - 0.1], ['방울의 모양이 보입니다', k.pShape + 0.1, k.pRain - 0.2], ['납작한 빗방울: 가로가 더 셉니다', k.pRain, k.pHail - 0.2], ['구르는 우박: 둘이 비슷합니다', k.pHail, end + 1]]);
    cols.forEach(([x, rain, tIn], i) => { if (t < tIn) return;
      T.sans(rain ? '큰 빗방울' : '구르는 우박', (x + 60) * 4, (PY - 9) * 4, {size: 26, align: 'center'});
      ['가로 메아리', '세로 메아리'].forEach((n, j) => T.sans(n, (x + BX - 3) * 4, (PY + PH + 18.5 + j * 18) * 4, {size: 22, align: 'right', color: j ? AMB : GOLD})); });
    T.gauge('가로 메아리와 세로 메아리', t > k.pHail ? '비슷함 → 우박' : t > k.pRain ? '가로가 큼 → 빗방울' : '—', 60, 1, AMB);
    T.foot('막대의 길이는 설명용 비율입니다 · 설명 모형');
  },

  // 한계: 빔은 곧게 가고 땅은 둥글게 내려간다 → 멀수록 빔이 높다 → 그 아래의 비는 놓친다 → 다른 레이더가 메운다
  async limit(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s = ctx.scene, end = s.end;
    const X0 = 22, KX = 0.9, KY = 10, bend = ease(t, k.lEarth - 0.2, k.lEarth + 1.2);                       // 가로 1 px = 1.1 km, 세로 1 px = 0.1 km
    const gy = x => GY - 24 + Math.max(0, (x - X0) / KX) ** 2 / (2 * 8495) * KY * bend, xk = km => X0 + km * KX, far = xk(204);
    sideWorld(t, gy, {hills: false});
    M.cloud(P, far, gy(far) - 96, 58, 26, {seed: 6, dark: 1, rain: 0.85, t, rainTo: gy(far), slant: 0.08});
    const [fx, fy] = await station(X0, 0.035, {zoom: 0.4, gy: gy(X0)}), SIN = Math.sin(0.5 * Math.PI / 180);
    const by = km => fy - km * SIN * KY, hw = km => Math.max(1, km * 0.0087 * KY), show = clamp((t - s.start - 0.4) / 2.2) * 215;
    P.lit(0.7, () => { for (let km = 4; km < show; km += 1 / KX) { const x = Math.round(xk(km)), c = by(km), w = hw(km); for (let j = -w; j <= w; j++) P.pxA(x, Math.round(c + j), Math.abs(j) < w * 0.3 ? C.gold : C.amber, 0.55 * (1 - Math.abs(j) / (w + 1))); } });
    const a100 = t > k.E('s16') - 0.5, a200 = t > k.l200 + 0.3, miss = t > k.lMiss - 0.6, fill = t > k.lMany + 0.2;
    const mark = km => { const x = Math.round(xk(km)), y0 = Math.round(by(km)), y1 = Math.round(gy(x)); for (let y = y0; y < y1; y += 2) P.px(x, y, C.cream); P.rect(x - 2, y0, 5, 1, C.cream); P.rect(x - 2, y1 - 1, 5, 1, C.cream); };
    if (a100) mark(100); if (a200) mark(200);
    if (miss) for (let x = Math.round(far - 25); x < far + 25; x++) { const km = (x - X0) / KX; for (let y = Math.round(by(km) + hw(km) + 2); y < gy(x) - 1; y++) if ((x + y) % 4 === 0) P.px(x, y, fill ? C.gold : C.red); }
    const x2 = 247;
    if (fill) { const [gx, g2] = await station(x2, 0.035, {zoom: 0.4, gy: gy(x2), flip: true});
      P.lit(0.7, () => { for (let d = 3; d < 66 * clamp((t - k.lMany - 0.4) / 1.2); d++) { const x = Math.round(gx - d), c = g2 - d / KX * SIN * KY, w = hw(d / KX); for (let j = -w; j <= w; j++) P.pxA(x, Math.round(c + j), C.gold, 0.5 * (1 - Math.abs(j) / (w + 1))); } }); }
    blit(stage);
    T.kicker('한계');
    T.lines(t, [['빔은 곧게, 땅은 둥글게', k.lEarth - 0.2, k.E('s16') + 0.3], ['멀수록 빔이 높아집니다', k.S('s17') + 0.2, k.lMiss - 0.7], ['빔 아래의 비는 놓칩니다', k.lMiss - 0.5, k.S('s18') - 0.2], ['여러 레이더가 놓친 곳을 메웁니다', k.S('s18') + 0.2, end + 1]]);
    const midY = km => (by(km) + gy(xk(km))) / 2 * 4;
    if (a100) { T.tag('약 1.5 km', (xk(100) + 4) * 4, midY(100)); T.sans('100 km', xk(100) * 4, (gy(xk(100)) + 7) * 4, {size: 24, align: 'center'}); }
    if (a200) { T.tag('약 4 km', (xk(200) + 4) * 4, midY(200), {color: GOLD}); T.sans('200 km', xk(200) * 4, (gy(xk(200)) + 7) * 4, {size: 24, align: 'center'}); }
    if (miss) T.tag(fill ? '다른 레이더가 봅니다' : '보이지 않는 비', (xk(200) - 5) * 4, (gy(far) - 9) * 4, {align: 'right', color: fill ? GOLD : '#E88A78'});
    const km = clamp((t - s.start - 0.4) / 2.2) * 200;
    T.gauge('거리', `${Math.round(km)} km`, 60); T.gauge('빔 가운데의 높이', `${M.beamHeightKm(km).toFixed(1)} km`, 420, 1, AMB);
    T.foot('높이는 11배 크게 그림 · 0.5° 빔의 가운데 · 표준 대기');
  },

  // 맺음: 구름을 찍지 않는다. 쏘고, 듣고, 시간과 세기를 잰다.
  async close(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s = ctx.scene, tw = k.Wd('s19', '전파를 쏘고', 0.42), tm = k.Wd('s19', '시간과 세기', 0.8);
    await hero(t, k); blit(stage);
    T.kicker('정리');
    T.lines(t, [['구름을 찍지 않습니다', s.start + 0.3, tw - 0.15], ['전파를 쏘고, 메아리를 듣습니다', tw + 0.1, tm - 0.2], ['메아리의 시간과 세기를 잽니다', tm, s.end + 1]]);
    const a = ease(t, tm + 0.1, tm + 0.6), b = ease(t, tm + 0.5, tm + 1.0);
    T.sans('걸린 시간', 60, 384, {size: 34, alpha: a, color: DIM}); T.big('→ 거리', 330, 384, {size: 44, alpha: a, color: AMB});
    T.sans('메아리의 세기', 60, 456, {size: 34, alpha: b, color: DIM}); T.big('→ 빗방울의 크기와 수', 330, 456, {size: 44, alpha: b});
    T.footR(FOOT);
  },
};

export function overlays(stage, t, ctx) { progressBar(stage, t, ctx.tl.duration); }
