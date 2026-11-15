// HDR 판을 위한 '빛 지도'(gain layer). 2026-11-15 사용자 결정: "다음 편부터 hdr 적용해".
//
// 생각: SDR 화면은 지금 그대로 그린다. 그와 별도로 "어디가 빛나는가"를 흑백 지도 한 장에 표시한다(흰색 = 빛남).
// pipeline/hdr.py 가 SDR 영상에 이 지도를 곱해 HDR 판을 만든다 — 지도가 0 인 곳은 SDR 과 같은 밝기(흰색 = 203 nit),
// 지도가 1 이고 그 자리의 화면이 밝은 곳은 최대 peak_boost 배(기본 4배, 약 812 nit)까지 밝아진다.
// 영상미 문법 "빛나는 것은 에너지·신호뿐"을 HDR 에서 그대로 지키는 방법이다: 빛나는 것만 lit() 안에서 그린다.
//
//   import {lit} from '<repo>/pipeline/render/index.mjs';
//   lit(stage, c => {                       // c 는 캔버스 컨텍스트. 이 안에서는 stage.ctx 대신 c 로 그린다
//     glow(c, x, y, 120, '#F2A742', 0.5);   //   → 화면에 그려지고, 같은 모양이 빛 지도에 흰색으로 찍힌다
//     line(c, pts, '#FFD9A0', 6);
//   });
//   lit(stage, c => circle(c, x, y, 20, '#fff'), {gain: 0.5});   // gain 0..1: 얼마나 더 밝게(1 = 최대)
//
// 규칙:
//  - fn 은 두 번 불린다(화면용 한 번, 빛 지도용 한 번). 같은 입력에 같은 그림을 그려야 한다 — Math.random(), 호출 횟수를 세는
//    변수, 바깥 상태를 바꾸는 코드를 넣지 않는다. stage.text() 처럼 stage.ctx 에 직접 그리는 호출은 빛 지도에 찍히지 않는다.
//  - 빛 지도에는 색이 없다. 색·그라디언트·그림자 색은 모두 흰색으로 바뀌고 투명도만 남는다.
//  - 어두운 것은 lit() 안에 있어도 밝아지지 않는다(합성 때 화면이 밝은 곳만 통과시킨다). 그래서 빛 위를 지나가는 어두운
//    물체는 따로 처리하지 않아도 된다. 반대로 빛 위에 겹친 밝은 글자·흰 이름표는 함께 밝아지니 겹치지 않게 놓는다.
//  - 자막·계기 숫자·이름표·바탕은 lit() 에 넣지 않는다(흰 글자가 번쩍이면 읽기 어렵다).
//  - 빛 지도는 lit() 를 부른 순간의 변환(transform)과 투명도(globalAlpha)만 따라간다. 바깥에서 건 자르기(clip)는 따라가지
//    않으니, 잘라 그릴 때는 lit() 안에서 다시 자른다.
import {createCanvas} from '@napi-rs/canvas';

export const GAIN_SCALE = 0.5;                       // 빛 지도는 절반 해상도(빛은 부드럽고, 가장자리는 합성 때 화면이 정한다)
const clamp01 = v => Math.max(0, Math.min(1, v));

/** stage.gain = {canvas, ctx, w, h, scale, dirty, litFrames} — 없으면 만든다. */
export function ensureGain(stage) {
  if (!stage.gain) {
    const w = Math.round(stage.W * GAIN_SCALE), h = Math.round(stage.H * GAIN_SCALE), canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    stage.gain = {canvas, ctx, w, h, scale: GAIN_SCALE, dirty: false};
  }
  return stage.gain;
}

/** 프레임을 그리기 전에 부른다(renderVideo·renderStills 가 부른다). */
export function clearGain(stage) {
  const g = stage.gain;
  if (!g || !g.dirty) return;
  g.ctx.setTransform(1, 0, 0, 1, 0, 0); g.ctx.globalAlpha = 1; g.ctx.globalCompositeOperation = 'source-over';
  g.ctx.fillStyle = '#000'; g.ctx.fillRect(0, 0, g.w, g.h);
  g.dirty = false;
}

/** CSS 색 문자열의 투명도(0..1). 모르는 꼴은 1. */
export function cssAlpha(color) {
  if (typeof color !== 'string') return 1;
  const s = color.trim().toLowerCase();
  if (s === 'transparent') return 0;
  if (s[0] === '#') return s.length === 9 ? parseInt(s.slice(7, 9), 16) / 255 : s.length === 5 ? parseInt(s[4] + s[4], 16) / 255 : 1;
  const m = s.match(/^(?:rgba?|hsla?)\((.*)\)$/);
  if (!m) return 1;
  const parts = m[1].includes('/') ? [m[1].split('/')[1]] : m[1].split(',').length === 4 ? [m[1].split(',')[3]] : [];
  if (!parts.length) return 1;
  const a = parts[0].trim();
  return clamp01(a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a));
}
const white = v => (typeof v === 'string' ? `rgba(255,255,255,${cssAlpha(v)})` : v);
const STYLE_PROPS = new Set(['fillStyle', 'strokeStyle', 'shadowColor']);
const GRADIENTS = new Set(['createLinearGradient', 'createRadialGradient', 'createConicGradient']);

/** 캔버스 컨텍스트를 감싼다: 그리기는 그대로, 색은 모두 흰색(투명도는 유지). */
export function whiteContext(target) {
  const bound = new Map();
  return new Proxy(target, {
    get(t, prop) {
      const v = t[prop];
      if (typeof v !== 'function') return v;
      if (!bound.has(prop)) {
        bound.set(prop, GRADIENTS.has(prop)
          ? (...a) => { const g = t[prop](...a), add = g.addColorStop.bind(g); g.addColorStop = (o, c) => add(o, white(c)); return g; }
          : v.bind(t));
      }
      return bound.get(prop);
    },
    set(t, prop, value) { t[prop] = STYLE_PROPS.has(prop) ? white(value) : value; return true; },
  });
}

/**
 * 빛나는 것을 그린다: fn(ctx) 를 화면에 그리고, 같은 그림을 빛 지도에 흰색으로 찍는다.
 * o.gain (0..1, 기본 1): HDR 판에서 얼마나 더 밝게 할지(1 = config/hdr.json 의 peak_boost 까지).
 */
export function lit(stage, fn, o = {}) {
  const ctx = stage.ctx;
  fn(ctx);
  const g = ensureGain(stage), gc = g.ctx, m = ctx.getTransform();
  gc.save();
  try {
    gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    gc.globalAlpha = ctx.globalAlpha * clamp01(o.gain ?? 1);
    gc.globalCompositeOperation = ctx.globalCompositeOperation;
    fn(whiteContext(gc));
  } finally { gc.restore(); }
  g.dirty = true;
}
