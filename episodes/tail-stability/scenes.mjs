// 66 꼬리날개 — 장면 모음. 장면은 세 모듈이 나눠 맡고, 이 파일은 그것을 모아 render.mjs 의 계약으로 내보낸다.
//   scenes_a.mjs  hook, wing, tail          scenes_b.mjs  origin, essence          scenes_c.mjs  yaw, tailless, close
// 모듈이 내보내는 것(계약):
//   export const scenes = {id(stage, t, p, ctx) {…}}       ctx.clock = {segs, phase(t), rate(t)} 가 더해져 들어온다
//   export function rateSegs(tl, ev) → [{t0, t1, rate}]     제 장면 안에서 모형 시간이 벽시계와 다르게 흐르는 구간(느리게·멈춤·되감기)
//   export function titles(id, ctx) → [[적용 시각, 키커, 제목], …]   머리글(없으면 그리지 않음)
//   export const captionLayout = {id: {y}}                  선택
// 연기 줄의 위상(ctx.clock.phase)은 영상 전체에 하나다 — 장면이 바뀌어도 줄이 튀지 않는다. 장면은 반드시 이 위상으로 연기 줄을 그린다.
// 무대·색·모형은 kit.mjs / model.mjs, 계획은 PLAN.md, 사실과 단순화는 brief.md.
import {smooth, easeInOut} from '../../pipeline/render/index.mjs';
import * as K from './kit.mjs';
import * as M from './model.mjs';

const FILES = ['./scenes_a.mjs', './scenes_b.mjs', './scenes_c.mjs'];
const MODS = [];
for (const f of FILES) {
  try { MODS.push(await import(f)); }
  catch (e) { console.warn(`[scenes] ${f} 를 읽지 못해 그 장면은 빈 화면으로 둡니다: ${e.message}`); }
}
const OWNER = {};
for (const m of MODS) for (const id of Object.keys(m.scenes || {})) OWNER[id] = m;

export const theme = 'noturno';
export const events = [];
export const captionLayout = Object.assign({}, ...MODS.map(m => m.captionLayout || {}));

// 영상 전체의 모형 시계(바람의 위상). 타임라인이 바뀌면 다시 만든다.
let CLOCK = null, CLOCK_TL = null;
function clockOf(ctx) {
  if (CLOCK_TL !== ctx.tl) {
    const segs = MODS.flatMap(m => (m.rateSegs ? m.rateSegs(ctx.tl, ctx.events) : [])).sort((a, b) => a.t0 - b.t0);
    for (let i = 1; i < segs.length; i++) if (segs[i].t0 < segs[i - 1].t1 - 1e-6) throw new Error(`rateSegs 구간이 겹칩니다: ${JSON.stringify(segs[i - 1])} / ${JSON.stringify(segs[i])}`);
    CLOCK = {segs, phase: t => M.flowPhase(segs, t), rate: t => M.rateAt(segs, t)};
    CLOCK_TL = ctx.tl;
  }
  return CLOCK;
}
const withClock = ctx => ({...ctx, clock: clockOf(ctx)});

const IDS = ['hook', 'origin', 'essence', 'wing', 'tail', 'yaw', 'tailless', 'close'];
function stub(id) {
  return (stage, t, p, ctx) => {
    K.smokeField(stage, ctx.clock.phase(t), {});
    stage.text(`(${id} — 아직 없음)`, 540, 700, {size: 40, color: K.PAL.muted, align: 'center'});
  };
}
export const scenes = Object.fromEntries(IDS.map(id => [id, (stage, t, p, ctx) => {
  const fn = OWNER[id]?.scenes?.[id] || stub(id);
  fn(stage, t, p, withClock(ctx));
}]));

export function background(stage) { K.background(stage); }

const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);

export function overlays(stage, t, ctx0) {
  const ctx = withClock(ctx0), id = ctx.scene.id, MO = K.MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  // 0초 프레임 = 포스터(물음 + 가장 큰 주제어). 첫 문장이 끝나면 물음이 머리글로 줄어든다.
  if (id === 'hook' && t < MO[1]) { K.posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); return; }
  K.captionBand(stage.ctx); K.topBand(stage.ctx);
  // 마지막 문장 동안에는 결론 글이 화면을 맡는다(머리글 없음, 진행 막대만).
  if (id === 'close' && t > last.start - 0.6) { K.progressBar(stage, t, ctx.tl.duration); return; }
  const L = OWNER[id]?.titles?.(id, ctx);
  const a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') {
    // 물음은 머리글 자리에 남고, 그 위에 키커만 바뀐다.
    K.posterTitle(stage, 1);
    if (L && L.length) {
      let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
      const t0 = Math.max(MO[1] - 0.05, L[k][0]);
      K.head(stage, L[k][1], '', fadeIn(t, t0, 0.4) * a, 0);
    }
    stage.ctx.save(); stage.ctx.globalAlpha *= fadeIn(t, MO[1], 0.4); K.progressBar(stage, t, ctx.tl.duration); stage.ctx.restore();
    return;
  }
  if (L && L.length) K.headList(stage, t, L, a);
  K.progressBar(stage, t, ctx.tl.duration);
}
