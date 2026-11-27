// 62 심전도 — 심장 박동의 물결
// Look grammar (2026-11-10): every moving thing is a link of one causal chain — the SA node fires → the excitation spreads over
// the muscle → the trace pen draws the wave → the muscle follows and squeezes → valves close (sound). One clock: every state
// (muscle colour, conduction-path signals, contraction, valves, blood, pen, labels, sounds) is read from model.mjs at the
// same beat time (phase(run, t)); runs come from model.plan(timeline), which make_sound.mjs also uses.
// Warm = electrical excitation (depolarisation: excited muscle, signals, the pen). Cool = recovery (repolarisation front, T).
// Matte filled bodies: heart muscle walls (rest = dark mauve-grey, excited = light apricot), blood (dark red, never lit),
// fibrous ring, valves, aorta, cells, galvanometer magnets. lit(): the excitation front, recovery front (low gain), SA flash,
// signals on the conduction paths, the pen tip, the galvanometer string and its light beam, the cell boundary marker.
// Film look (2026-11-22): charcoal background, fixed paper grain, soft bloom around lit() — config/look.json.
// Honest time scale: every kicker's factor is computed from the run's rate (K below).
import {createRequire} from 'node:module';
import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, line, circle, ring, rect, withAlpha, lit, ensureGain, progressBar, poly,
} from '../../pipeline/render/index.mjs';
import * as M from './model.mjs';
const {createCanvas} = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../pipeline/render/package.json'))('@napi-rs/canvas');

export const theme = 'film';
export const look = {background: {cx: 0.5, cy: 0.38}};
export const events = [];
export const captionLayout = {};

const W = 1080;
const PAL = {
  ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#1E1E22',
  warm: '#FF7A22', warmHi: '#F5A066', cool: '#5BA8F0', coolHi: '#A9D2FA',
  rest: [92, 78, 86], exc: [240, 196, 152], recov: [150, 186, 222],
  blood: [52, 18, 24], bloodHi: [78, 30, 36], particle: '#7A2E34',
  ring: '#8C857A', ringLo: '#6B655C', valve: '#D9CFC0', path: '#C9B89C', pathLo: '#8E806C',
  aorta: '#5A3A3E', aortaHi: '#6E4A4E', node: '#D7B9A0', magnet: '#55585F', magnetHi: '#6B6E76',
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);

function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save(); gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.fillStyle = '#000'; gc.fillRect(x, y, w, h); gc.restore();
}
function uText(stage, s, x, y, o = {}) {
  const size = o.size || 28, w = stage.measure(s, o) + 20, al = o.align || 'left';
  const x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x - 10;
  if ((o.alpha ?? 1) > 0) unlitRect(stage, x0, y - size * 0.8, w, size * 1.4, 1);
  return stage.text(s, x, y, o);
}
const label = (stage, s, x, y, o = {}) => uText(stage, s, x, y, {size: 30, weight: 700, color: PAL.ink, align: 'center', ...so, ...o});
const note = (stage, s, x, y, o = {}) => uText(stage, s, x, y, {size: 26, weight: 500, color: PAL.muted, align: 'center', ...so, ...o});

// =====================================================================================================
// 실행(같은 시계)과 시간 배율 — plan(tl) 은 make_sound.mjs 와 같은 함수
// =====================================================================================================
let PLAN = null, PLAN_TL = null;
function runs(tl) { if (PLAN_TL !== tl) { PLAN = M.plan(tl); PLAN_TL = tl; } return PLAN; }
const fmtX = x => (x >= 100 ? `${Math.round(x / 10) * 10}` : x >= 10 ? `${Math.round(x)}` : x.toFixed(0));
const realS = ms => (ms / 1000).toFixed(ms < 100 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '');
function K(run, span = null) {
  const ms = span ?? (run.msEnd ?? M.runMs(run, run.t1)) - run.ms0;
  return `실제 ${realS(ms)}초 · 약 ${fmtX(M.slowOf(run))}배 느리게`;
}
// essence 의 세포 줄: 세포 하나 약 0.1 mm, 심실 근육의 전도 약 0.4 m/s(출처 15) → 세포 하나 0.25 ms
const CELL = {n: 8, realMsPerCell: 0.1 / 0.4, visPerCell: 0.38};
CELL.slow = CELL.visPerCell / (CELL.realMsPerCell / 1000);
/** 세포 줄의 흥분 세 번(s06: 전극 없음, s07: 전극 오른쪽 → 왼쪽) — make_sound.mjs 도 이 시각을 쓴다 */
export function CELLWAVES(tl) {
  const s06 = tl.sentences.find(s => s.id === 's06'), s07 = tl.sentences.find(s => s.id === 's07'), st = CELL.visPerCell;
  return [{t0: s06.start + 0.9, elec: null, step: st}, {t0: s07.start + 0.3, elec: 'R', step: st}, {t0: s07.start + 0.3 + CELL.n * st + 0.9, elec: 'L', step: st}];
}

// =====================================================================================================
// 카메라
// =====================================================================================================
const CAM = {
  full: {cx: 540, cy: 700, z: 1.0, sy: 690},
  hook0: {cx: 540, cy: 720, z: 0.9, sy: 740},
  hookEnd: {cx: 566, cy: 812, z: 2.0, sy: 720},
  atria: {cx: 540, cy: 560, z: 1.3, sy: 640},
  av: {cx: 536, cy: 664, z: 2.0, sy: 690},
  vent: {cx: 566, cy: 820, z: 1.18, sy: 770},
  contract: {cx: 560, cy: 720, z: 1.04, sy: 690},
  rate: {cx: 540, cy: 690, z: 0.78, sy: 625},
  thumb: {cx: 600, cy: 700, z: 0.42, sy: 470},
  origin: {cx: 540, cy: 720, z: 0.5, sy: 470},
};
const camMix = (a, b, q) => ({cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), q)), sy: lerp(a.sy, b.sy, q)});
function withCam(stage, cam, fn) {
  const c = stage.ctx; c.save();
  c.translate(540 - cam.cx * cam.z, cam.sy - cam.cy * cam.z); c.scale(cam.z, cam.z);
  try { fn(); } finally { c.restore(); }
}
const toScreen = (cam, p) => [540 + (p[0] - cam.cx) * cam.z, cam.sy + (p[1] - cam.cy) * cam.z];
function sceneCam(id, t, ctx, prevId) {
  const s = ctx.scene, q = easeInOut((t - s.start) / 1.4);
  const to = CAM[id === 'ventricles' ? 'vent' : id === 'avnode' ? 'av' : id] || CAM.full;
  const from = prevId ? (CAM[prevId] || CAM.full) : to;
  return camMix(from, to, q);
}

// =====================================================================================================
// 심장 근육 — 화소마다 같은 시계의 상태(흥분·회복)를 읽어 그린다(절반 해상도 버퍼)
// =====================================================================================================
const DS = 2, BW = 540, BH = 626;
const BUF = {img: createCanvas(BW, BH), front: createCanvas(BW, BH), mask: createCanvas(BW, BH)};
for (const k of Object.keys(BUF)) BUF[k + 'Ctx'] = BUF[k].getContext('2d');
const IMG = {img: BUF.imgCtx.createImageData(BW, BH), front: BUF.frontCtx.createImageData(BW, BH), mask: BUF.maskCtx.createImageData(BW, BH)};

/** 방의 공(cavity)과 바깥 덩어리의 지금 모양(수축 반영). 근육 = 덩어리 안 − 공. 심실은 바닥(방실 고리)에 붙은 채 심첨이 올라오고 벽이 두꺼워진다. */
const ENV = {A: {cx: 540, cy: 520, rx: 352, ry: 136, rot: 0}, V: {cx: 548, cy: 790, rx: 318, ry: 236, rot: -0.30}};
function shapes(aS, vS) {
  const out = {};
  for (const k of ['RA', 'LA']) {
    const c = M.H[k], sc = 1 - 0.13 * aS;
    out[k] = {cav: {cx: c.cx, cy: c.cy, rx: c.rx * sc, ry: c.ry * sc, rot: c.rot || 0}, wall: c.wall};
  }
  const so2 = 1 - 0.075 * vS;
  for (const k of ['RV', 'LV']) {
    const c = M.H[k], sc = 1 - (k === 'LV' ? 0.30 : 0.24) * vS, cy = M.H.avY + (c.cy - M.H.avY) * so2;
    out[k] = {cav: {cx: c.cx, cy, rx: c.rx * sc, ry: c.ry * sc, rot: c.rot}, wall: c.wall};
  }
  const e = ENV.A, f = ENV.V, sa = 1 - 0.04 * aS;
  out.envA = {cx: e.cx, cy: e.cy, rx: e.rx * sa, ry: e.ry * sa, rot: e.rot};
  out.envV = {cx: f.cx, cy: M.H.avY + (f.cy - M.H.avY) * so2, rx: f.rx * (1 - 0.03 * vS), ry: f.ry * so2, rot: f.rot};
  return out;
}
function eCoord(e, x, y) {
  const r = e.rot || 0, dx = x - e.cx, dy = y - e.cy, u = dx * Math.cos(r) + dy * Math.sin(r), v = -dx * Math.sin(r) + dy * Math.cos(r);
  return Math.hypot(u / e.rx, v / e.ry);
}
/** 흥분 정도(0..1), 회복 앞면, 흥분 앞면 — c = 1분에 75번 박동의 ms. 앞 박동(c+800)도 본다. */
function excState(k, x, y, w, c) {  // k = 방
  const a = M.actTime(k, x, y, w), r = M.recTime(k, x, y, w);
  let E = 0, F = 0, R = 0;
  for (const cc of [c, c + M.RR75]) {
    const e = smooth((cc - a) / 5) * (1 - smooth((cc - r) / 14));
    E = Math.max(E, e);
    const fd = cc - a; if (fd >= 0 && fd < 3.5) F = Math.max(F, 1 - fd / 3.5);
    const rd = cc - r, rw = k === 'RA' || k === 'LA' ? 3 : 5; if (rd >= 0 && rd < rw) R = Math.max(R, 1 - rd / rw);
  }
  return {E, F, R: clamp(R)};
}
/** 화면의 사각형(sx0, sy0, sw, sh) 안에 심장 근육을 그린다. st = {c, aS, vS, dim} */
function heartBuffer(stage, cam, st) {
  const sx0 = 0, sy0 = 0, sw = Math.min(W, BW * DS), sh = Math.min(1250, BH * DS);
  const bw = Math.ceil(sw / DS), bh = Math.ceil(sh / DS);
  const S = shapes(st.aS, st.vS), d = IMG.img.data, f = IMG.front.data, m = IMG.mask.data;
  d.fill(0); f.fill(0); m.fill(0);
  const order = [['LA', 'RA'], ['LV', 'RV']];
  const z = cam.z, avY = M.H.avY;
  for (let j = 0; j < bh; j++) {
    const Y = sy0 + (j + 0.5) * DS, y = cam.cy + (Y - cam.sy) / z;
    if (y < 380 || y > 1070) continue;
    const grp = y < avY - 7 ? order[0] : y > avY + 7 ? order[1] : null;
    if (!grp) continue;
    for (let i = 0; i < bw; i++) {
      const X = sx0 + (i + 0.5) * DS, x = cam.cx + (X - 540) / z;
      if (x < 180 || x > 920) continue;
      let hit = null;
      const env = grp === order[0] ? S.envA : S.envV, eEnv = eCoord(env, x, y);
      if (eEnv > 1) continue;
      let best = null, bec = 1e9;
      for (const k of grp) {
        const s = S[k], ec = eCoord(s.cav, x, y);
        if (ec < 1) { hit = {k, cav: true, ec}; break; }
        const r = Math.max(s.cav.rx, s.cav.ry), d = (ec - 1) * Math.min(s.cav.rx, s.cav.ry) * 0.5 + (ec - 1) * r * 0.5;
        if (d < bec) { bec = d; best = k; }
      }
      if (!hit && best) { const dEnv = (1 - eEnv) * 0.5 * (env.rx + env.ry); hit = {k: best, cav: false, w: clamp(bec / Math.max(1, bec + dEnv)), dc: bec, de: dEnv}; }
      if (!hit) continue;
      const o = (j * BW + i) * 4;
      if (hit.cav) {
        const q = 0.7 + 0.3 * clamp(hit.ec);
        d[o] = PAL.blood[0] * q + 6; d[o + 1] = PAL.blood[1] * q; d[o + 2] = PAL.blood[2] * q; d[o + 3] = 255;
        continue;
      }
      const {E, F, R} = excState(hit.k, x, y, hit.w, st.c, hit.k);
      const shade = 0.80 + 0.20 * Math.sin(Math.PI * hit.w) - 0.06 * hit.w;
      const rq = R * 0.55 * (1 - 0.3 * E), aa = 1.3 * DS / z, qc = clamp(hit.dc / aa), qe = clamp(hit.de / aa);   // 가장자리 부드럽게(공 쪽, 바깥 쪽)
      for (let ch = 0; ch < 3; ch++) {
        let v = lerp(PAL.rest[ch], PAL.exc[ch], E);
        v = lerp(v, PAL.recov[ch], rq);
        v = lerp(PAL.blood[ch] * 0.7, v * shade * (st.dim ?? 1), qc);
        d[o + ch] = clamp(v, 0, 255);
      }
      d[o + 3] = 255 * qe;
      if (F > 0.02) {           // 흥분 앞면 = 신호(빛)
        const a = F * F;
        f[o] = 255; f[o + 1] = 190 + 50 * a; f[o + 2] = 120 + 90 * a; f[o + 3] = 255 * a * 0.9;
        m[o] = m[o + 1] = m[o + 2] = 255; m[o + 3] = 255 * a * 0.9;
      } else if (R > 0.05 && st.showRec !== false) {
        const a = R * 0.55;
        f[o] = 170; f[o + 1] = 215; f[o + 2] = 255; f[o + 3] = 255 * a;
        m[o] = m[o + 1] = m[o + 2] = 255; m[o + 3] = 255 * a * 0.3;
      }
    }
  }
  BUF.imgCtx.putImageData(IMG.img, 0, 0); BUF.frontCtx.putImageData(IMG.front, 0, 0); BUF.maskCtx.putImageData(IMG.mask, 0, 0);
  const c = stage.ctx;
  c.save(); c.imageSmoothingEnabled = true; c.drawImage(BUF.img, 0, 0, bw, bh, sx0, sy0, bw * DS, bh * DS); c.restore();
  lit(stage, cc => { cc.save(); cc.imageSmoothingEnabled = true; cc.drawImage(cc === stage.ctx ? BUF.front : BUF.mask, 0, 0, bw, bh, sx0, sy0, bw * DS, bh * DS); cc.restore(); }, {gain: 0.55});
}

// =====================================================================================================
// 무대의 나머지(세계 좌표, 카메라 안에서): 대동맥, 섬유 고리, 판막, 피, 전도 길과 신호
// =====================================================================================================
const AO = {x0: 800, y: 676, x1: 1120, r: 30};   // 좌심실 위 오른쪽에서 나가는 대동맥(설명 그림: 실제로는 위로 솟음)
const VALVES = {tri: {x: 388, y: M.H.avY, half: 40}, mit: {x: 690, y: M.H.avY, half: 40}};
function aorta(c) {
  rect(c, AO.x0 - 20, AO.y - AO.r, AO.x1 - AO.x0 + 20, AO.r * 2, AO.r, PAL.aorta);
  rect(c, AO.x0 - 20, AO.y - AO.r, AO.x1 - AO.x0 + 20, 8, 4, PAL.aortaHi);
  rect(c, AO.x0 - 10, AO.y - AO.r + 9, AO.x1 - AO.x0, AO.r * 2 - 18, 10, rgba('#2A0E12', 1));
}
function fibrousRing(c, hl = 0) {
  const y = M.H.avY, gaps = [[VALVES.tri.x - 44, VALVES.tri.x + 44], [VALVES.mit.x - 44, VALVES.mit.x + 44]];
  let x = 236; const col = mix(PAL.ringLo, PAL.ring, 0.5 + 0.5 * hl);
  for (const [a, b] of gaps) { rect(c, x, y - 8, a - x, 16, 6, col); x = b; }
  rect(c, x, y - 8, 862 - x, 16, 6, col);
}
function leaflets(c, cx, cy, half, open, dir = 1) {   // open 1 = 아래로 늘어짐, 0 = 가로로 닫힘
  for (const s of [-1, 1]) {
    const bx = cx + s * half, ang = lerp(0.12, 1.25, open), L = half * 1.08;
    const tx = bx - s * Math.cos(ang) * L, ty = cy + dir * Math.sin(ang) * L;
    line(c, [[bx, cy], [lerp(bx, tx, 0.5), lerp(cy, ty, 0.5) + 4 * dir], [tx, ty]], PAL.valve, 7);
  }
}
function aoLeaflets(c, open) {
  for (const s of [-1, 1]) {
    const by = AO.y + s * (AO.r - 9), ang = lerp(0.1, 1.3, open), L = AO.r * 0.98;
    const tx = AO.x0 + 6 + Math.sin(ang) * L, ty = by - s * Math.cos(ang) * L;
    line(c, [[AO.x0 + 6, by], [tx, ty]], PAL.valve, 6);
  }
}
// 피의 누적 흐름(한 박동 표, 1 ms 간격) — 입자 위치에 씀
const QIN = [0], QOUT = [0];
for (let m = 1; m <= M.RR75; m++) { QIN.push(QIN[m - 1] + M.inflowRate(m) * 0.001); QOUT.push(QOUT[m - 1] + M.outflowRate(m) * 0.001); }
const qAt = (T, beat, c) => { let b = beat, cc = c; while (cc < 0) { cc += M.RR75; b--; } while (cc >= M.RR75) { cc -= M.RR75; b++; } const i = Math.floor(cc); return b * T[M.RR75] + lerp(T[i], T[Math.min(M.RR75, i + 1)], cc - i); };
function along(pts, u) {
  let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let d = clamp(u) * L;
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const q = seg[i] ? d / seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)]; } d -= seg[i]; }
  return pts[pts.length - 1];
}
const FLOWS = [
  {pts: [[742, 470], [700, 560], [690, 640], [672, 730], [650, 820]], q: 'in', n: 14, spread: 26},
  {pts: [[330, 480], [372, 570], [388, 640], [400, 720], [404, 800]], q: 'in', n: 12, spread: 24},
  {pts: [[640, 880], [690, 780], [760, 700], [820, 676], [1000, 676], [1100, 676]], q: 'out', n: 16, spread: 14},
];
function blood(c, ph, S) {
  const qi = qAt(QIN, ph.beat, ph.c) * 1.6, qo = qAt(QOUT, ph.beat, ph.c) * 1.25;
  for (const [fi, F] of FLOWS.entries()) {
    const Q = F.q === 'in' ? qi : qo;
    for (let k = 0; k < F.n; k++) {
      const u = ((k / F.n + Q + 10) % 1), p = along(F.pts, u);
      const off = (((k * 7919 + fi * 31) % 97) / 97 - 0.5) * 2 * F.spread;
      const x = p[0] + off * 0.7, y = p[1] + off * 0.5;
      // 공 안에서만(지금 모양)
      const inside = ['RA', 'LA', 'RV', 'LV'].some(kk => eCoord(S[kk].cav, x, y) < 0.92) || (F.q === 'out' && x > AO.x0 + 10 && Math.abs(y - AO.y) < AO.r - 12);
      if (!inside) continue;
      circle(c, x, y, 5, PAL.particle);
    }
  }
}
const pathLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
function partial(pts, u) { const L = pathLen(pts) * clamp(u), out = [pts[0]]; let d = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d + l >= L) { const q = l ? (L - d) / l : 0; out.push([lerp(pts[i - 1][0], pts[i][0], q), lerp(pts[i - 1][1], pts[i][1], q)]); return out; } out.push(pts[i]); d += l; } return out; }
/** 전도 길: 방실결절 → 히스 다발 → 좌·우 갈래 → 푸르키네. 지나간 곳은 따뜻한 무광, 머리는 빛 */
function conduction(stage, c, cms, o = {}) {
  const P = M.PATH, E = M.EV, segs = [[P.his, E.avOut, E.hisEnd], [P.lbb, E.hisEnd, E.brEnd], [P.rbb, E.hisEnd, E.brEnd], ...M.PURK.map(b => [b.pts, b.t0, b.t1])];
  for (const [pts, t0, t1] of segs) {
    const lw = (pts === P.his ? 7 : 5) / Math.sqrt(o.z || 1);
    line(c, pts, rgba(PAL.pathLo, 0.85), lw);
    const u = clamp((cms - t0) / (t1 - t0)), back = cms < 120 + M.RR75 * 0 && cms > 520 ? 0 : 1;
    if (u > 0 && cms < 330) line(c, partial(pts, u), mix(PAL.path, PAL.warmHi, 0.6), lw * 0.8);
    if (u > 0 && u < 1) { const h = along(pts, u); lit(stage, cc => { circle(cc, h[0], h[1], 9, PAL.warm); circle(cc, h[0], h[1], 4.5, CORE(PAL.warm)); }, {gain: 0.9}); }
  }
  // 방실결절(느리게 기어가는 점) — E.avIn → E.avOut
  const [ax, ay] = M.H.AV;
  poly(c, [[ax - 26, ay - 10], [ax + 14, ay - 12], [ax + 22, ay + 6], [ax - 20, ay + 10]], PAL.node, rgba('#000', 0.3), 2);
  const ua = (cms - E.avIn) / (E.avOut - E.avIn);
  if (ua > 0 && ua < 1) { const hx = lerp(ax - 20, ax + 14, ua), hy = lerp(ay - 2, ay + 4, ua); lit(stage, cc => { circle(cc, hx, hy, 8, PAL.warm); circle(cc, hx, hy, 4, CORE(PAL.warm)); }, {gain: 0.8}); }
  // 동방결절
  const [sx, sy] = M.H.SA, fire = Math.max(0, 1 - Math.abs(cms - 4) / 14), fire2 = Math.max(0, 1 - Math.abs(cms - M.RR75 - 4) / 14);
  circle(c, sx, sy, 15, PAL.node); circle(c, sx - 4, sy - 4, 7, mix(PAL.node, '#FFFFFF', 0.25));
  const fl = Math.max(fire, fire2);
  if (fl > 0) lit(stage, cc => { ring(cc, sx, sy, 18 + 22 * (1 - fl), rgba(PAL.warm, fl), 5); circle(cc, sx, sy, 8, rgba(CORE(PAL.warm), fl)); }, {gain: 1});
}
/** 한 박동의 상태(phase) → 무대 전체를 그린다(카메라 안). o.labels: 방 이름표 */
function heartStage(stage, cam, ph, o = {}) {
  const c = stage.ctx, cm = ph.c;
  const aS = Math.max(M.atrialSqueeze(cm), M.atrialSqueeze(cm + M.RR75)), vS = Math.max(M.ventSqueeze(cm), M.ventSqueeze(cm + M.RR75));
  const S = shapes(aS, vS);
  c.save(); c.beginPath(); c.rect(0, 0, W, o.clipY ?? 1236); c.clip();
  try {
  withCam(stage, cam, () => aorta(c));
  heartBuffer(stage, cam, {c: cm, aS, vS, dim: o.dim});
  withCam(stage, cam, () => {
    fibrousRing(c, o.ringHi || 0);
    const avq = M.avValveQ(((cm % M.RR75) + M.RR75) % M.RR75);
    leaflets(c, VALVES.tri.x, VALVES.tri.y, VALVES.tri.half, avq); leaflets(c, VALVES.mit.x, VALVES.mit.y, VALVES.mit.half, avq);
    aoLeaflets(c, M.aoValveQ(((cm % M.RR75) + M.RR75) % M.RR75));
    blood(c, ph, S);
    conduction(stage, c, cm, {...o, z: cam.z});
  });
  } finally { c.restore(); }
  return {S, aS, vS};
}
function chamberLabels(stage, cam, a = 1) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => {
    for (const [s, x, y] of [['우심방', 352, 530], ['좌심방', 726, 520], ['우심실', 410, 830], ['좌심실', 664, 850]]) { const p = toScreen(cam, [x, y]); if (p[1] > 985 || p[1] < 300) continue; label(stage, s, p[0], p[1], {size: Math.round(clamp(26 * cam.z, 24, 34))}); }
  });
}

// =====================================================================================================
// 심전도 띠(화면 좌표) — 'beat' = 한 박동 창(느리게), 'sweep' = 실제 빠르기로 쓸고 지나감, 'overlay' = 박동마다 같은 자리에 겹쳐 그림
// =====================================================================================================
const STRIP = {x0: 96, x1: 984, y0: 1036, y1: 1232, base: 1180, mv: 90};
const ecgAbs = ms => M.ecgBeat(ms) + M.ecgBeat(ms + M.RR75) + M.ecgBeat(ms - M.RR75);
function stripPanel(stage, title = '', o = {}) {
  const c = stage.ctx;
  unlitRect(stage, STRIP.x0 - 26, STRIP.y0 - 10, STRIP.x1 - STRIP.x0 + 52, STRIP.y1 - STRIP.y0 + 16, 1);
  rect(c, STRIP.x0 - 24, STRIP.y0 - 8, STRIP.x1 - STRIP.x0 + 48, STRIP.y1 - STRIP.y0 + 12, 12, rgba('#141416', 1), rgba(PAL.border, 1), 2);
  if (!o.noBase) line(c, [[STRIP.x0, STRIP.base], [STRIP.x1, STRIP.base]], rgba(PAL.muted, 0.25), 1.5);
  if (title) stage.text(title, STRIP.x0, STRIP.y0 + 24, {size: 24, weight: 700, color: PAL.muted});
}
const yOf = v => STRIP.base - v * STRIP.mv;
function penTip(stage, x, y) { lit(stage, cc => { circle(cc, x, y, 9, PAL.warm); circle(cc, x, y, 4.5, CORE(PAL.warm)); }, {gain: 1}); }
function gridTicks(stage, msPerPx, x0Ms) {   // 0.2초마다 옅은 세로줄
  const c = stage.ctx, step = 200;
  for (let ms = Math.ceil(x0Ms / step) * step; ; ms += step) { const x = STRIP.x0 + (ms - x0Ms) / msPerPx; if (x > STRIP.x1) break; line(c, [[x, STRIP.y0 + 34], [x, STRIP.y1 - 6]], rgba(PAL.muted, 0.12), 1); }
}
const BEATWIN = {a: -100, b: 800};
const xBeat = ms => STRIP.x0 + (ms - BEATWIN.a) / (BEATWIN.b - BEATWIN.a) * (STRIP.x1 - STRIP.x0);
/** 한 박동 창: msStart 부터 지금(cNow)까지 그려진 선. ghost = 앞 그림 잔상 */
function stripBeat(stage, msStart, cNow, o = {}) {
  const c = stage.ctx;
  stripPanel(stage, o.title ?? '심전도');
  gridTicks(stage, (BEATWIN.b - BEATWIN.a) / (STRIP.x1 - STRIP.x0), BEATWIN.a);
  const a = Math.max(BEATWIN.a, msStart), b = Math.min(BEATWIN.b, cNow);
  if (b > a) {
    const pts = []; for (let ms = a; ms <= b; ms += 1.5) pts.push([xBeat(ms), yOf(ecgAbs(ms))]);
    pts.push([xBeat(b), yOf(ecgAbs(b))]);
    line(c, pts, PAL.ink, 3.2);
    if (cNow <= BEATWIN.b + 1 && o.pen !== false) penTip(stage, xBeat(b), yOf(ecgAbs(b)));
  }
  return {x: xBeat, y: ms => yOf(ecgAbs(ms))};
}
const SWEEP = 2400;
function stripSweep(stage, run, t, o = {}) {
  const c = stage.ctx, hr = run.hr ?? 75;
  stripPanel(stage, o.title ?? '심전도 · 실제 빠르기');
  const now = M.runMs(run, t), msPerPx = SWEEP / (STRIP.x1 - STRIP.x0);
  gridTicks(stage, msPerPx, 0);
  const xs = ms => STRIP.x0 + (((ms % SWEEP) + SWEEP) % SWEEP) / msPerPx;
  const from = Math.max(run.ms0, now - SWEEP + 160);
  let seg = [];
  for (let ms = from; ms <= now; ms += 3) {
    const x = xs(ms), p = [x, yOf(M.ecgAt(ms, hr))];
    if (seg.length && x < seg[seg.length - 1][0]) { line(c, seg, PAL.ink, 3); seg = []; }
    seg.push(p);
  }
  if (seg.length > 1) line(c, seg, PAL.ink, 3);
  if (now >= run.ms0) penTip(stage, xs(now), yOf(M.ecgAt(now, hr)));
}
/** 물결 이름(사건 순간에 뜬다) — 한 박동 창의 x(ms) 위에 */
function waveNames(stage, cNow, o = {}) {
  const W = M.WAVES, base = STRIP.y0 + 4;
  const items = [['P', W.P.c, yOf(W.P.a) - 16], ['T', W.T.c, yOf(W.T.a) - 16]];
  for (const [s, ms, y] of items) if (cNow >= ms) note(stage, s, xBeat(ms), y, {size: 30, weight: 700, color: PAL.ink, alpha: fadeIn(cNow, ms, 12)});
  if (cNow >= W.Q.c) {
    note(stage, 'Q', xBeat(W.Q.c) - 16, yOf(W.Q.a) + 30, {size: 26, weight: 700, color: PAL.ink});
    if (cNow >= W.R.c) note(stage, 'R', xBeat(W.R.c) + 22, yOf(W.R.a) + 22, {size: 26, weight: 700, color: PAL.ink});
    if (cNow >= W.S.c) note(stage, 'S', xBeat(W.S.c) + 20, yOf(W.S.a) + 26, {size: 26, weight: 700, color: PAL.ink});
  }
}
/** 구간 괄호(띠 위쪽) — 지난 구간을 가리킨다 */
function bracket(stage, msA, msB, s, a = 1, col = PAL.warmHi, y = STRIP.y0 - 20, xf = xBeat) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => {
    const xa = xf(msA), xb = xf(msB);
    line(stage.ctx, [[xa, y + 10], [xa, y], [xb, y], [xb, y + 10]], col, 3);
    note(stage, s, (xa + xb) / 2, y - 16, {size: 24, weight: 700, color: col});
  });
}

// =====================================================================================================
// 포스터(0초 = 썸네일): 흰 물음 위, 주제어(심전도)가 가장 크게. 답은 쓰지 않는다.
// =====================================================================================================
const POSTER = {q: ['심장은 한 번 뛰는데', '물결은 왜 세 번일까?'], a: '심전도', qy: 172, ay: 402, QS: 64, AS: 168};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 0.45 + 30;
  if (q < 1) unlitRect(stage, 0, 80, W, yBot - 80, 1);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.55)'); g.addColorStop(0.85, 'rgba(9,9,11,0.55)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 46, q), LH = POSTER.QS * 1.3 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else withAlpha(c, 1 - smooth((q - 0.55) / 0.45), () => stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 960}));
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.ay, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa}));
}
const MORPH = tl => [tl.sentence('s01').end + 0.1, tl.sentence('s01').end + 0.9];

// =====================================================================================================
// 머리글
// =====================================================================================================
function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx;
  if (Math.max(kicker ? aK : 0, title ? aT : 0) > 0.01) unlitRect(stage, 0, 112, W, 160, 1);
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 29, color: PAL.warmHi, align: 'center', tracking: 1, maxWidth: 980, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 52, color: PAL.ink, align: 'center', maxWidth: 980, ...so}));
}
function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2] === cur[2] ? '' : prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, k > 0 && prev[2] !== cur[2] ? a * inn : a);
}
function titleList(id, ctx) {
  const R = runs(ctx.tl), a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, K(R.hook0)], [2.2, '되감기'], [3.1, '', ''], [R.hookReal.t0, '실제 빠르기 · 1분에 75번', '심전도 — 심장의 전압을 시간에 따라']];
    case 'origin': return [[-Infinity, '실 검류계 · 설명 그림 · 실제 빠르기', '아주 가는 실의 그림자 — 1903'], [a('s04'), '물결의 이름', 'P · Q · R · S · T — 1924 노벨상']];
    case 'essence': return [[-Infinity, '심실 벽 세포 8개 · 크기 과장', '쉬는 세포 — 안쪽이 −90 mV'], [a('s06'), `세포 8개 · 실제 약 ${realS(CELL.n * CELL.realMsPerCell)}초 · 약 ${fmtX(CELL.slow)}배 느리게`, '뒤집힘이 옆 세포로 번진다'],
      [a('s07'), '전극의 자리만 바꿈 · 사이 시간 생략 · 설명 모형', '경계가 다가오면 위로, 멀어지면 아래로'], [R.core.t0, K(R.core, 820), '전기가 먼저, 근육은 뒤따라']];
    case 'atria': return [[-Infinity, K(R.atria), '동방결절 — 저절로 시작'], [a('s10'), K(R.atria), 'P파 — 심방의 흥분']];
    case 'avnode': return [[-Infinity, K(R.avnode), '방실결절 — 약 0.1초 늦춤'], [a('s12'), K(R.avnode), '평평한 선 — 그동안 피가 마저']];
    case 'ventricles': return [[-Infinity, K(R.ventricles), '히스 다발 · 푸르키네 섬유'], [a('s14'), K(R.ventricles), 'QRS파 — 심실의 흥분'], [a('s15'), K(R.ventricles), '심방의 회복은 QRS에 묻힌다']];
    case 'contract': return [[-Infinity, K(R.contract), '심실 수축 — 첫째 심장 소리'], [a('s17'), K(R.contract), 'ST — 평평한 동안 피를 내보냄'], [a('s18'), K(R.contract), 'T파 — 심실의 회복, 둘째 소리'], [a('s19'), K(R.contract), '물결 셋 = 사건 셋']];
    case 'rate': return [[-Infinity, '실제 빠르기 · 박동마다 같은 자리에 겹쳐 그림', '쉬는 어른 — 1분에 60~100번'], [R.rate120.t0, '심박수만 바꿈 · 75번은 잔상', '빨리 뛰면 쉼이 줄어든다'], [a('s22'), '모형의 값 · 1분에 120번일 때', '물결의 모양과 간격을 잰다']];
    case 'close': return [[-Infinity, '실제 빠르기', '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1236, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.1, 'rgba(8,8,10,0.45)'); g.addColorStop(0.4, 'rgba(8,8,10,0.35)'); g.addColorStop(0.65, 'rgba(8,8,10,0.12)'); g.addColorStop(1, 'rgba(8,8,10,0.12)'); c.fillStyle = g; c.fillRect(0, 1236, W, 684); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }
function clock(stage, cms, a = 1, prefix = '발화 뒤') {
  if (a <= 0) return;
  const s = cms < 0 ? `발화 전 ${(-cms / 1000).toFixed(3)}초` : `${prefix} ${(cms / 1000).toFixed(3)}초`;
  withAlpha(stage.ctx, a, () => uText(stage, s, STRIP.x1, STRIP.y0 + 32, {role: 'display', size: 36, weight: 700, color: PAL.warmHi, align: 'right'}));
}

// =====================================================================================================
// 장면
// =====================================================================================================
function hookPhase(R, t) {          // 결과 먼저(0~2) → 멈춤(2~2.2) → 되감기(2.2~3.0) → 쉼 → 실제 빠르기
  const r = R.hook0;
  if (t < 2.2) return {c: M.runMs(r, Math.min(t, 2.0)), beat: 0};
  if (t < 3.0) return {c: lerp(M.runMs(r, 2.0), r.ms0, easeInOut((t - 2.2) / 0.8)), beat: 0};
  if (t < R.hookReal.t0) return {c: r.ms0, beat: 0};
  return M.phase(R.hookReal, t);
}
export const scenes = {
  hook(stage, t, p, ctx) {
    const R = runs(ctx.tl), ph = hookPhase(R, t);
    const zq = t < 2.0 ? easeInOut(t / 2.0) : t < 3.0 ? 1 - easeInOut((t - 2.2) / 0.8) : 0;
    const cam = t < 3.2 ? camMix(CAM.hook0, CAM.hookEnd, zq) : camMix(CAM.hook0, CAM.full, easeInOut((t - 3.2) / 1.2));
    heartStage(stage, cam, ph);
    if (t >= 3.0) chamberLabels(stage, cam, fadeIn(t, MORPH(ctx.tl)[1], 0.5));
    if (t < 3.0) { stripBeat(stage, R.hook0.ms0, ph.c, {title: '심전도'}); }
    else if (t < R.hookReal.t0) stripPanel(stage, '심전도');
    else stripSweep(stage, R.hookReal, t);
  },

  origin(stage, t, p, ctx) {
    const R = runs(ctx.tl), run = R.origin, ph = M.phase(run, t), c = stage.ctx;
    // 왼쪽 위: 작은 심장(같은 박동), 오른쪽: 실 검류계, 아래: 사진 띠(빛이 그린 선)
    const cam = {cx: 560, cy: 710, z: 0.5, sy: 520};
    heartStage(stage, {...cam, cx: 860}, ph, {});
    const now = M.runMs(run, t), v = M.ecgAt(now, 75);
    // 전선: 심장 → 검류계
    line(c, [[226, 560], [226, 420], [760, 420], [760, 446]], rgba(PAL.muted, 0.6), 3);
    line(c, [[300, 690], [300, 880], [760, 880], [760, 836]], rgba(PAL.muted, 0.6), 3);
    // 자석 두 덩이와 실
    const gx = 760, gy = 640;
    rect(c, gx - 150, gy - 170, 100, 340, 10, PAL.magnet); rect(c, gx - 150, gy - 170, 100, 14, 6, PAL.magnetHi);
    rect(c, gx + 50, gy - 170, 100, 340, 10, PAL.magnet); rect(c, gx + 50, gy - 170, 100, 14, 6, PAL.magnetHi);
    stage.text('N', gx - 100, gy + 10, {size: 34, weight: 700, color: PAL.muted, align: 'center'}); stage.text('S', gx + 100, gy + 10, {size: 34, weight: 700, color: PAL.muted, align: 'center'});
    const dx = v * 32;
    const str = [[gx, gy - 190], [gx + dx * 0.6, gy - 80], [gx + dx, gy], [gx + dx * 0.6, gy + 80], [gx, gy + 190]];
    lit(stage, cc => { line(cc, str, rgba('#FFE7C8', 0.95), 3); line(cc, str, '#FFFFFF', 1.2); }, {gain: 0.6});
    line(c, [[gx - 6, gy - 200], [gx + 6, gy - 200]], PAL.muted, 4); line(c, [[gx - 6, gy + 200], [gx + 6, gy + 200]], PAL.muted, 4);
    // 빛줄기 → 띠의 기록 자리(x = 540 + 이동)
    const recX = 540 + dx * 2.2;
    lit(stage, cc => { cc.save(); cc.globalAlpha = 0.35; poly(cc, [[gx - 14, gy + 210], [gx + 14, gy + 210], [recX + 6, STRIP.y0 + 30], [recX - 6, STRIP.y0 + 30]], rgba('#FFD9A8', 0.6)); cc.restore(); }, {gain: 0.35});
    note(stage, '실(석영)', gx, gy - 236, {size: 26});
    note(stage, '자석', gx - 100, gy - 190, {size: 26}); note(stage, '자석', gx + 100, gy - 190, {size: 26});
    // 사진 띠: 기록 자리는 x = 540 고정(빛), 종이는 왼쪽으로 흐른다(실제 빠르기, 0.2초 = 75 px)
    stripPanel(stage, '사진 띠 · 왼쪽으로 흐름');
    const pxPerMs = 0.375, recBase = 540;
    const xs = ms => recBase - (now - ms) * pxPerMs + dx * 2.2 * (ms === now ? 1 : 0);
    const pts = []; for (let ms = Math.max(run.ms0, now - (recBase - STRIP.x0) / pxPerMs); ms <= now; ms += 2) pts.push([recBase - (now - ms) * pxPerMs, yOf(M.ecgAt(ms, 75))]);
    if (pts.length > 1) line(c, pts, PAL.ink, 3);
    for (let ms = Math.ceil((now - 1200) / 200) * 200; ms <= now; ms += 200) { const x = recBase - (now - ms) * pxPerMs; if (x > STRIP.x0) line(c, [[x, STRIP.y0 + 34], [x, STRIP.y1 - 6]], rgba(PAL.muted, 0.12), 1); }
    penTip(stage, recBase, yOf(v));
    // s04: 이름 P Q R S T 를 지나간 박동의 굴곡에(사건 순간 뒤 종이와 함께 흐름)
    const s04 = ctx.tl.sentence('s04').start - 0.3;
    if (t > s04) {
      const {rr} = M.beatParams(75);
      for (let b = Math.floor(now / rr); b >= Math.floor(now / rr) - 2; b--) {
        for (const [s, k, dy, dx] of [['P', 'P', -16, 0], ['Q', 'Q', 26, -14], ['R', 'R', -14, 18], ['S', 'S', 26, 16], ['T', 'T', -16, 0]]) {
          const ms = b * rr + M.WAVES[k].c; if (ms > now || ms < run.ms0) continue;
          const tAt = run.t0 + (ms - run.ms0) / run.rate; if (tAt < s04) continue;
          const x = recBase - (now - ms) * pxPerMs; if (x < STRIP.x0 + 10) continue;
          note(stage, s, x + dx, yOf(M.WAVES[k].a) + dy, {size: 28, weight: 700, color: k === 'R' ? PAL.warmHi : PAL.ink, alpha: fadeIn(t, tAt, 0.15)});
        }
      }
    }
  },

  essence(stage, t, p, ctx) {
    const R = runs(ctx.tl), c = stage.ctx, tl = ctx.tl;
    if (t >= R.core.t0) {           // s08: 한 박동을 천천히 — 전기가 먼저, 근육은 뒤따라
      const q = fadeIn(t, R.core.t0, 0.6), ph = M.phase(R.core, t);
      const cam = CAM.full;
      withAlpha(c, q, () => { heartStage(stage, cam, ph); chamberLabels(stage, cam, 0.0); });
      stripBeat(stage, R.core.ms0, ph.c, {title: '심전도'});
      // 수축 계기: 심실 수축 정도(무광 막대) — 같은 시각
      const vS = M.ventSqueeze(ph.c), aS = M.atrialSqueeze(ph.c);
      bars(stage, aS, vS, q);
      return;
    }
    // 위: 작은 심장과 확대 상자(좌심실 벽)
    const th = CAM.thumb;
    heartStage(stage, th, {c: -200, beat: 0});
    const wp = toScreen(th, [790, 830]);
    ring(c, wp[0], wp[1], 18, PAL.warmHi, 3);
    line(c, [[wp[0] - 12, wp[1] + 16], [160, 660]], rgba(PAL.warmHi, 0.6), 2); line(c, [[wp[0] + 12, wp[1] + 16], [920, 660]], rgba(PAL.warmHi, 0.6), 2);
    note(stage, '좌심실 벽의 한 조각', wp[0] + 160, wp[1] - 10, {size: 26});
    // 세포 줄
    const waves = CELLWAVES(tl);
    let wi = -1; for (let i = 0; i < waves.length; i++) if (t >= waves[i].t0 - (i ? 0.45 : 0)) wi = i;
    const wv = wi >= 0 ? waves[wi] : null, b = wv ? clamp((t - wv.t0) / CELL.visPerCell, 0, CELL.n) : 0;   // 경계 위치(세포 수)
    const X0 = 172, CW = 86, CY = 760, CH = 92;
    rect(c, X0 - 20, CY - CH / 2 - 26, CELL.n * CW + 40, CH + 52, 14, rgba('#141416', 0.85), rgba(PAL.border, 1), 2);
    for (let i = 0; i < CELL.n; i++) {
      const x = X0 + i * CW, e = smooth(b - i);
      const col = `rgb(${PAL.rest.map((v, ch) => Math.round(lerp(v, PAL.exc[ch], e))).join(',')})`;
      rect(c, x + 4, CY - CH / 2, CW - 8, CH, 22, col, rgba('#000', 0.35), 2);
      rect(c, x + 10, CY - CH / 2 + 6, CW - 20, 10, 5, rgba('#FFFFFF', 0.10));
      // 안팎 부호: 바깥 +, 안 − (쉼) → 뒤집힘
      const inS = e > 0.5 ? '+' : '−', outS = e > 0.5 ? '−' : '+';
      stage.text(inS, x + CW / 2, CY + 12, {size: 34, weight: 700, color: e > 0.5 ? '#3A2A20' : PAL.ink, align: 'center'});
      stage.text(outS, x + CW / 2, CY - CH / 2 - 8, {size: 26, weight: 700, color: PAL.muted, align: 'center'});
      // 이온(바깥 → 안): 뒤집히는 순간에만 몇 알
      const fl = b - i;
      if (fl > 0 && fl < 1) for (let k = 0; k < 3; k++) { const yy = lerp(CY - CH / 2 - 34, CY - 8, fl); circle(c, x + 22 + k * 20, yy + (k % 2) * 8, 5, PAL.coolHi); }
    }
    if (wv && b > 0 && b < CELL.n) { const bx = X0 + b * CW; lit(stage, cc => { line(cc, [[bx, CY - CH / 2 - 4], [bx, CY + CH / 2 + 4]], PAL.warm, 6); line(cc, [[bx, CY - CH / 2 - 4], [bx, CY + CH / 2 + 4]], CORE(PAL.warm), 2.4); }, {gain: 0.8}); }
    // 큰 숫자: 첫 세포의 안쪽 전압
    const e0 = smooth(b), mv = Math.round(lerp(-90, 20, e0));
    uText(stage, `세포 안쪽 ${mv > 0 ? '+' : mv < 0 ? '−' : ''}${Math.abs(mv)} mV`, 540, 900, {role: 'display', size: 54, weight: 700, color: mv > 0 ? PAL.warmHi : PAL.ink, align: 'center', ...so});
    // 전극과 그 전압(아래 띠)
    if (wv?.elec) {
      const ex = wv.elec === 'R' ? X0 + CELL.n * CW + 46 : X0 - 46, ea = fadeIn(t, wv.t0 - 0.45, 0.3);
      withAlpha(c, ea, () => { circle(c, ex, CY, 22, '#C9C2B4'); stage.text('+', ex, CY + 12, {size: 34, weight: 700, color: '#1E1E22', align: 'center'}); note(stage, '전극', ex, CY + 66, {size: 26}); });
    }
    const vOf = (k, bb) => { const s = waves[k].elec === 'L' ? -1 : 1, d = waves[k].elec === 'L' ? 1 - bb / CELL.n : bb / CELL.n; return s * 0.9 * (0.3 + 0.7 * d * d) * smooth(bb / 0.5) * (1 - smooth((bb - CELL.n + 0.4) / 0.4)); };
    stripPanel(stage, '전극이 재는 전압', {noBase: true});
    const X = bb => STRIP.x0 + 60 + bb / CELL.n * (STRIP.x1 - STRIP.x0 - 200), yy = v => STRIP.base - 40 - v * 70;
    line(c, [[STRIP.x0 + 20, yy(0)], [STRIP.x1 - 20, yy(0)]], rgba(PAL.muted, 0.3), 1.5);
    for (let k = 1; k <= Math.min(wi, 2); k++) {
      const end = k === wi ? b : CELL.n + 0.6, pts = [];
      for (let bb = 0; bb <= end; bb += 0.05) pts.push([X(bb), yy(vOf(k, Math.min(bb, CELL.n + 0.6)))]);
      if (pts.length > 1) line(c, pts, k === wi ? PAL.ink : rgba(PAL.ink, 0.3), k === wi ? 3.2 : 2.4, k === wi ? {} : {dash: [8, 8]});
      if (k === wi && b < CELL.n + 0.5) penTip(stage, X(b), yy(vOf(k, b)));
    }
    if (wi >= 2) note(stage, '먼저 그린 선(전극 오른쪽)', STRIP.x1 - 190, STRIP.y0 + 26, {size: 24});
  },

  atria(stage, t, p, ctx) { mech(stage, t, ctx, 'atria', 'essence'); },
  avnode(stage, t, p, ctx) { mech(stage, t, ctx, 'avnode', 'atria'); },
  ventricles(stage, t, p, ctx) { mech(stage, t, ctx, 'ventricles', 'avnode'); },
  contract(stage, t, p, ctx) { mech(stage, t, ctx, 'contract', 'ventricles'); },

  rate(stage, t, p, ctx) {
    const R = runs(ctx.tl), c = stage.ctx, fast = t >= R.rate120.t0, run = fast ? R.rate120 : R.rate75;
    const ph = M.phase(run, t), cam = sceneCam('rate', t, ctx, 'contract');
    heartStage(stage, cam, ph);
    // 큰 숫자: 1분에 박동 수, 그 아래 T 뒤 쉼(모형에서 계산)
    uText(stage, `1분에 ${run.hr}번`, 540, 330, {role: 'display', size: 56, weight: 700, color: fast ? PAL.warmHi : PAL.ink, align: 'center', ...so});
    const restOf = hr => { const P = M.beatParams(hr); return (P.rr - P.uncanon(M.EV.tOff)) / 1000; };
    const ra = fast ? fadeIn(t, run.t0 + 0.5, 0.4) : fadeIn(t, ctx.tl.sentence('s20').start + 2, 0.5);
    uText(stage, fast ? `T 뒤 쉼 ${restOf(75).toFixed(2)}초 → ${restOf(120).toFixed(2)}초` : `T 뒤 쉼 ${restOf(75).toFixed(2)}초`, 540, 376, {size: 30, weight: 700, color: PAL.coolHi, align: 'center', alpha: ra, ...so});
    // 박동마다 같은 자리(발화 = 0)에 겹쳐 그림 — 창 0 ~ 820 ms
    stripPanel(stage, '박동마다 발화 순간부터 겹쳐 그림');
    const xr = ms => STRIP.x0 + ms / 820 * (STRIP.x1 - STRIP.x0);
    for (let ms = 200; ms < 820; ms += 200) line(c, [[xr(ms), STRIP.y0 + 34], [xr(ms), STRIP.y1 - 6]], rgba(PAL.muted, 0.12), 1);
    const beat = (hr, upTo) => { const pts = []; for (let m = 0; m <= upTo; m += 2) pts.push([xr(m), yOf(M.ecgAt(m, hr))]); return pts; };
    const restBar = (hr, col, a, yy) => { const P = M.beatParams(hr), a0 = P.uncanon(M.EV.tOff); withAlpha(c, a, () => rect(c, xr(a0), yy, xr(P.rr) - xr(a0), 10, 5, col)); };
    if (fast) { line(c, beat(75, 800), rgba(PAL.ink, 0.3), 2.4, {dash: [8, 7]}); restBar(75, rgba(PAL.coolHi, 0.4), 1, STRIP.y1 - 16); }
    const P = M.beatParams(run.hr), pm = ph.m;
    if (ph.msAbs >= 0) { const pts = beat(run.hr, pm); if (pts.length > 1) line(c, pts, PAL.ink, 3.2); penTip(stage, xr(pm), yOf(M.ecgAt(pm, run.hr))); }
    restBar(run.hr, PAL.cool, ra, fast ? STRIP.y1 - 30 : STRIP.y1 - 16);
    // s22: 간격을 잰다(모형의 값, 지금 심박수) — 띠 위 세 줄
    const s22 = ctx.tl.sentence('s22').start - 0.2;
    if (t > s22) {
      const E = M.EV, sec = (x, y) => ((P.uncanon(y) - P.uncanon(x)) / 1000).toFixed(2);
      bracket(stage, P.uncanon(E.pOn), P.uncanon(E.qrsOn), `PR ${sec(E.pOn, E.qrsOn)}초`, fadeIn(t, s22, 0.4), PAL.warmHi, STRIP.y0 - 20, xr);
      bracket(stage, P.uncanon(E.qrsOn), P.uncanon(E.qrsOff), `QRS ${sec(E.qrsOn, E.qrsOff)}초`, fadeIn(t, s22 + 0.8, 0.4), PAL.warmHi, STRIP.y0 - 66, xr);
      bracket(stage, P.uncanon(E.qrsOn), P.uncanon(E.tOff), `QT ${sec(E.qrsOn, E.tOff)}초`, fadeIn(t, s22 + 1.6, 0.4), PAL.coolHi, STRIP.y0 - 112, xr);
    }
  },

  close(stage, t, p, ctx) {
    const R = runs(ctx.tl), c = stage.ctx, ph = M.phase(R.close, t), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
    heartStage(stage, camMix(CAM.rate, CAM.full, easeInOut((t - ctx.scene.start) / 1.2)), ph);
    stripSweep(stage, R.close, t);
    const ea = fadeIn(t, last.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 250, W, 250, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 250, 0, 500); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.78)'); g.addColorStop(0.85, 'rgba(9,9,11,0.78)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 250, W, 250);
        ['심전도의 물결은 심장을 지나가는 전기의 그림자,', '근육은 그 전기를 뒤따라 조입니다'].forEach((s, i) => stage.text(s, 540, 316 + i * 62, {role: 'display', weight: 700, size: 44, color: i === 1 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 1000, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 452, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, last.start, 0.5)});
      });
    }
  },
};

/** 수축 계기(무광 막대): 심방·심실이 얼마나 조였는가 — 심장과 같은 시각 */
function bars(stage, aS, vS, a = 1) {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    for (const [i, s, v] of [[0, '심방 수축', aS], [1, '심실 수축', vS]]) {
      const x = i ? 640 : 240, y = 336, w = 200;
      rect(c, x, y, w, 18, 9, rgba('#000', 0.45), rgba(PAL.border, 1), 2); rect(c, x, y, Math.max(0, w * clamp(v)), 18, 9, '#C9B39A');
      note(stage, s, x + w / 2, y - 10, {size: 24});
    }
  });
}

/** 메커니즘 네 장면: 한 박동을 장면마다 이어서(같은 띠, 같은 시계) */
function mech(stage, t, ctx, id, prevId) {
  const R = runs(ctx.tl), run = R[id], ph = M.phase(run, t), cm = ph.c, c = stage.ctx, tl = ctx.tl;
  const cam = sceneCam(id, t, ctx, prevId === 'essence' ? 'full' : prevId);
  const ringHi = id === 'avnode' ? fadeIn(t, ctx.scene.start + 0.8, 0.6) : 0;
  heartStage(stage, cam, ph, {ringHi});
  chamberLabels(stage, cam, id === 'atria' ? fadeIn(t, ctx.scene.start + 0.6, 0.5) * fadeOut(t, ctx.scene.end - 1, 0.5) : 0);
  const at = (w) => toScreen(cam, w);
  const sb = stripBeat(stage, R.atria.ms0, cm, {title: '심전도 · 한 박동'});
  waveNames(stage, cm);
  clock(stage, cm, 1);
  if (id === 'atria') {
    // 동방결절의 문턱 계기: 저절로 오르는 전압(무광 막대) → 문턱에서 발화
    const sa = at(M.H.SA), lvl = cm < 0 ? clamp(1 + cm / 90) : clamp(1 - cm / 40);
    const x = sa[0] - 110, y = sa[1] - 34;
    rect(c, x, y, 26, 120, 8, rgba('#000', 0.45), rgba(PAL.border, 1), 2);
    rect(c, x, y + 120 * (1 - lvl), 26, 120 * lvl, 8, '#C9B39A');
    line(c, [[x - 8, y + 6], [x + 34, y + 6]], PAL.warmHi, 3);
    note(stage, '문턱', x - 40, y + 14, {size: 24, color: PAL.warmHi});
    label(stage, '동방결절', sa[0] + 40, sa[1] - 44, {size: 30});
  }
  if (id === 'avnode') {
    const av = at(M.H.AV);
    label(stage, '방실결절', av[0] + 150, av[1] + 74, {size: 30});
    line(c, [[av[0] + 30, av[1] + 24], [av[0] + 90, av[1] + 56]], rgba(PAL.ink, 0.7), 2);
    note(stage, '섬유 고리 — 전기가 못 지나감', 300, at([0, M.H.avY])[1] + 64, {size: 26, alpha: ringHi});
    const d = clamp(cm - M.EV.avIn, 0, M.EV.avOut - M.EV.avIn);
    uText(stage, `결절에서 머문 시간 ${(d / 1000).toFixed(3)}초`, 540, 400, {size: 32, weight: 700, color: PAL.ink, align: 'center', ...so});
    if (tl.at('s12') - 0.3 < t) bracket(stage, M.EV.pOff, Math.min(cm, M.EV.qrsOn), '평평한 선', fadeIn(t, tl.at('s12') - 0.3, 0.4));
  }
  if (id === 'ventricles') {
    const hb = at(M.PATH.his[1]);
    label(stage, '히스 다발', hb[0] + 90, hb[1] - 10, {size: 28, alpha: fadeIn(t, ctx.scene.start + 0.6, 0.4) * fadeOut(t, tl.at('s14'), 0.5)});
    const pk = at([800, 860]);
    label(stage, '푸르키네 섬유', pk[0] - 40, pk[1] + 150, {size: 28, alpha: fadeIn(t, ctx.scene.start + 3.0, 0.4) * fadeOut(t, tl.at('s14'), 0.5)});
    if (cm >= M.WAVES.Q.c - 4) bracket(stage, M.EV.qrsOn, Math.min(cm, M.EV.qrsOff), 'QRS — 큰 물결 하나', fadeIn(cm, M.WAVES.Q.c - 4, 6), PAL.warmHi);
    // 심방의 회복(Ta): 숨은 작은 물결을 점선으로 따로
    const s15 = tl.at('s15') - 0.3;
    if (t > s15) {
      const a = fadeIn(t, s15, 0.5), pts = [];
      for (let ms = 150; ms <= Math.min(cm, 330); ms += 2) pts.push([xBeat(ms), STRIP.base - 22 + (M.WAVES.Ta.a * Math.exp(-0.5 * ((ms - M.WAVES.Ta.c) / M.WAVES.Ta.s) ** 2)) * -STRIP.mv * 4]);
      withAlpha(c, a, () => { if (pts.length > 1) line(c, pts, PAL.coolHi, 2.4, {dash: [7, 6]}); note(stage, '심방의 회복(크게 그림)', xBeat(380), STRIP.base - 34, {size: 24, color: PAL.coolHi}); });
    }
  }
  if (id === 'contract') {
    const s1T = run.t0 + (M.EV.s1 - run.ms0) / run.rate, s2T = run.t0 + (M.EV.s2 - run.ms0) / run.rate;
    label(stage, '심실 수축', 880, 960, {size: 32, color: PAL.warmHi, alpha: fadeIn(cm, M.EV.s1, 20) * fadeOut(t, tl.at('s19'), 0.5)});
    const mv = at([VALVES.mit.x, VALVES.mit.y]), ao = at([AO.x0 + 10, AO.y]);
    if (t > s1T - 0.1) note(stage, '판막 닫힘 · 첫째 소리', mv[0] - 20, mv[1] - 60, {size: 26, color: PAL.ink, alpha: fadeIn(t, s1T, 0.2) * fadeOut(t, s1T + 6, 0.5)});
    if (t > s2T - 0.1) note(stage, '판막 닫힘 · 둘째 소리', ao[0] - 10, ao[1] - 56, {size: 26, color: PAL.ink, alpha: fadeIn(t, s2T, 0.2) * fadeOut(t, s2T + 5, 0.5)});
    note(stage, '대동맥', at([980, AO.y + 60])[0], at([980, AO.y + 60])[1], {size: 26});
    const s17 = tl.at('s17') - 0.3, s18 = tl.at('s18') - 0.3, s19 = tl.at('s19') - 0.3;
    if (t > s17) bracket(stage, M.EV.qrsOff, M.EV.tOn, 'ST · 평평', fadeIn(t, s17, 0.4) * fadeOut(t, s19, 0.4), PAL.warmHi);
    if (t > s18 + 1.2) {   // T 가 위로 솟는 까닭(설명 모형)
      const a = fadeIn(t, s18 + 1.2, 0.5) * fadeOut(t, s19, 0.4);
      note(stage, '회복은 바깥 → 안쪽: 방향도 부호도 반대라 위로 · 설명 모형', 540, 316, {size: 25, color: PAL.coolHi, alpha: a});
    }
    if (t > s19) {
      const a = fadeIn(t, s19, 0.5), y = STRIP.y0 - 20;
      bracket(stage, M.EV.pOn, M.EV.pOff, '심방 흥분', a, PAL.warmHi, y);
      bracket(stage, M.EV.qrsOn, M.EV.qrsOff, '심실 흥분', fadeIn(t, s19 + 0.9, 0.4), PAL.warmHi, y);
      bracket(stage, M.EV.tOn, M.EV.tOff, '심실 회복', fadeIn(t, s19 + 1.8, 0.4), PAL.coolHi, y);
      note(stage, '이름 다섯(P Q R S T) · 큰 물결 셋', 540, 316, {size: 28, weight: 700, color: PAL.ink, alpha: fadeIn(t, s19 + 2.6, 0.4)});
    }
  }
}

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { captionBand(stage.ctx); unlitRect(stage, 0, 1236, W, 684, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); hookKicker(stage, t, ctx, MO); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1236, W, 684, 1); unlitRect(stage, 0, 0, W, 112, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') { hookKicker(stage, t, ctx, MO); withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return; }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
function hookKicker(stage, t, ctx, MO) {
  const L = titleList('hook', ctx);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  if (t < MO[1]) {
    const s = L[k][1];
    if (s) { unlitRect(stage, 0, 60, W, 70, 1); stage.text(s, 540, 96, {role: 'display', weight: 500, size: 28, color: PAL.warmHi, align: 'center', ...so}); }
    return;
  }
  headList(stage, t, L, 1);
}
