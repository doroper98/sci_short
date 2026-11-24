// 50 자외선 — 피부는 왜 햇볕에 탈까. 사실·단순화는 brief.md.
// 영상미 문법(2026-11-10): 움직이는 것은 모두 인과 사슬의 한 고리. 물체(피부 세포·핵·혈관·멜라닌·프리즘·분자)는 면과 명암이 있는 무광 덩어리.
// 빛나는 것은 에너지·신호뿐 — 자외선 알갱이(한색), 적외선 알갱이와 햇빛·색 띠(빛), 다친 세포가 내보내는 신호 점(난색). 모두 lit() 안.
// 계기·이름표·글자·바탕·피부는 lit() 밖이고, 글이 빛 위에 얹히는 곳은 빛 지도를 지운다(unlitRect — 47·55 교훈).
// 난색 하나 = 몸의 반응(신호, 붉어짐, 열), 한색 하나 = 자외선(알갱이, 그것이 만든 DNA 손상 표식). 멜라닌은 물체의 제 색(짙은 갈색).
// 무대 하나: 피부 단면(각질층 · 표피 다섯 줄 · 진피와 모세혈관 고리). 두께 비율은 과장(표피 약 0.1 mm, 진피 1~2 mm — 이름표로만).
// 질감 층(2026-11-22): 테마 film, 바탕 filmBackground, 맨 마지막 filmLook(render.mjs). 밝은 곳은 피부 단면 자리.
// 첫 순간(2026-11-16): 0~2초 '쬔 뒤 닷새를 빠르게' — 0~1초 붉어짐(하루), 1~2초 검어짐(닷새). 화면의 시계가 실제 경과 시간을 보인다.
//   2.2~3.0초 되감기. s02 동안 같은 시계를 천천히 다시 돌려 두 곡선을 그린다.
// Fable 검수(s18): 붉어짐 신호와 멜라닌 세포를 깨우는 신호는 다르다 — 화면에서 '같은 신호'로 이름 붙이지 않는다(경로도 다르게).
// Fable 검수(s13): 들러붙는 것은 같은 가닥의 이웃한 두 염기(맞은편 짝 아님).
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, rand, line, circle, ring, rect, poly, withAlpha, arrow, lit, ensureGain,
  progressBar, TAU,
} from '../../pipeline/render/index.mjs';

export const theme = 'film';
export const look = {background: {cx: 0.5, cy: 0.45}};   // 편마다 바꾸는 것은 밝은 곳의 자리뿐(세기는 config/look.json)
export const events = [];
export const captionLayout = {};

const W = 1080, H = 1920;
const PAL = {
  bg: '#1A1A1D', deep: '#0E0E10', ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#232327',
  warm: '#FF6B1A', warmHi: '#F5A066',     // 몸의 반응(하나뿐인 난색)
  cool: '#8C8EFF', coolHi: '#C3C4FF', coolLo: '#5E60B8',     // 자외선(하나뿐인 한색)
  corn: '#CDBBA6', cell: '#D9B89E', cellLo: '#A5826B', nuc: '#6F5F6C', nucHi: '#8A7A88',
  derm: '#A97F74', dermLo: '#7D5A54', fibre: '#BE958A', vessel: '#7C2B2F', vesselHi: '#C23A36',
  red: '#C4534A', melanin: '#3E2619', melaninHi: '#5C3A28', melano: '#6E4C3B', tanTint: '#8A6047',
  tanCurve: '#C99C74', prism: '#4C5A66', prismHi: '#8A9AA8', atom: '#8E96A0', atomHi: '#C9CED4', reader: '#6F8378',
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const S = (ctx, id) => ctx.tl.sentence(id);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;
const evT = (ctx, id) => ctx.events.get(id).time;
function ticks(ctx, id) {
  const e = ctx.events.get(id), n = e.params?.repeat ?? 1, dt = e.params?.interval ?? 0.12;
  return Array.from({length: n}, (_, k) => e.time + k * dt);
}
const countUntil = (list, t) => { let n = 0; for (const x of list) if (x <= t) n++; return n; };
/** piecewise-linear map of t through [[t, v], …] (clamped at both ends) */
function pw(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return lerp(va, vb, (t - a) / Math.max(1e-6, b - a)); }
  return pts[pts.length - 1][1];
}

// =====================================================================================================
// 모형: 쬔 뒤 시간(h, 시간)의 붉어짐 R(h)·검어짐 T(h) — brief.md (붉어짐 3~5시간 뒤 시작·12~24시간 정점, 그을림 2~3일 뒤 보임)
// =====================================================================================================
const R = h => smooth((h - 3) / 11) * (h < 16 ? 1 : Math.exp(-(h - 16) / 48));
const T = h => smooth((h - 40) / 100);
const clockText = h => (h < 47.5 ? `쬔 뒤 ${Math.round(h)}시간` : `쬔 뒤 ${Math.round(h / 24)}일`);

// =====================================================================================================
// 빛 지도 지우기(글이 빛 위에 얹히는 곳)
// =====================================================================================================
function unlitRect(stage, x, y, w, h, a = 1) {
  const g = ensureGain(stage), gc = g.ctx;
  if (a <= 0 || !g.dirty) return;
  gc.save(); gc.setTransform(g.scale, 0, 0, g.scale, 0, 0); gc.globalAlpha = clamp(a); gc.fillStyle = '#000'; gc.fillRect(x, y, w, h); gc.restore();
}
function panel(c, x, y, w, h, a = 0.9) { rect(c, x, y, w, h, 14, rgba(PAL.plate, a), rgba(PAL.border, 1), 2); }

// =====================================================================================================
// 무대: 피부 단면
// =====================================================================================================
const CORN_Y = 560, EPI_TOP = 582, ROW_H = 80, ROWS = 6, EPI_BOT = EPI_TOP + ROW_H * ROWS;   // 1062
const SKIN_BOT = 1250;
const bm = x => EPI_BOT + 12 * Math.sin((x - 75) * TAU / 150 + Math.PI / 2);     // 기저막(물결) — 꼭짓점 아래 x = 75 + 150k 에 유두
const LOOPS = Array.from({length: 7}, (_, k) => 75 + 150 * k);
const CELLS = (() => {
  const out = [], widths = [126, 116, 108, 100, 94, 76];
  for (let r = 0; r < ROWS; r++) {
    const w = widths[r], off = (r % 2) * w * 0.5 - w * 0.3;
    for (let k = 0; ; k++) {
      const x = off + k * w; if (x > W + w) break;
      const y = EPI_TOP + r * ROW_H, cx = x + w / 2, i = out.length;
      const melano = r === ROWS - 1 && k % 4 === 2;
      out.push({i, r, k, x, y, w, h: ROW_H, cx, cy: y + ROW_H / 2 + (rand(i * 7.1) - 0.5) * 6, melano,
        nx: cx + (rand(i * 3.3) - 0.5) * w * 0.12, ny: y + ROW_H * (r === ROWS - 1 ? 0.58 : 0.54)});
    }
  }
  return out;
})();
const KERAT = CELLS.filter(c => !c.melano);
const MELANO = CELLS.filter(c => c.melano);
const cellNear = (x, r) => CELLS.filter(c => c.r === r).reduce((b, c) => (Math.abs(c.cx - x) < Math.abs(b.cx - x) ? c : b));

/** 피부 단면. o: red 0..1, tan 0..1(색조), caps 0..1 또는 함수(cell)→0..1(핵 위 멜라닌), act 0..1(멜라닌 세포 가지), gran 0..1,
 *  marks: Map(cell.i → 0..1)(DNA 손상 표식, 한색 고리), dying: {cell, q}, x0..x1(잘라 그림), dim 0..1 */
function skin(stage, o = {}) {
  const c = stage.ctx, red = o.red ?? 0, tan = o.tan ?? 0, x0 = o.x0 ?? 0, x1 = o.x1 ?? W;
  c.save(); c.beginPath(); c.rect(x0, 0, x1 - x0, SKIN_BOT); c.clip();
  // 진피
  const dTop = EPI_BOT - 20, gd = c.createLinearGradient(0, dTop, 0, SKIN_BOT);
  gd.addColorStop(0, mix(PAL.derm, '#B23E38', 0.75 * red)); gd.addColorStop(1, mix(PAL.dermLo, mix(PAL.red, '#5A1E20', 0.4), 0.55 * red));
  c.fillStyle = gd; c.fillRect(x0, dTop, x1 - x0, SKIN_BOT - dTop);
  // 결(콜라겐) — 고정된 가는 물결, 무광
  for (let j = 0; j < 9; j++) {
    const y = EPI_BOT + 40 + j * 24, pts = [];
    for (let x = x0; x <= x1; x += 24) pts.push([x, y + 6 * Math.sin(x * 0.02 + j * 1.7)]);
    line(c, pts, rgba(mix(PAL.fibre, PAL.red, 0.4 * red), 0.28), 2);
  }
  // 모세혈관 고리(유두 속으로 올라옴) + 아래 혈관
  const vw = 9 + 9 * red, vc = mix(PAL.vessel, PAL.vesselHi, red);
  const plexY = 1200;
  line(c, [[x0 - 20, plexY], [x1 + 20, plexY]], mix('#4E1A1E', vc, 0.6), vw + 6);
  for (const lx of LOOPS) {
    const pts = [];
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const ang = Math.PI * a, top = bm(lx) - 4;
      if (a === 0) pts.push([lx - 14, plexY]);
      pts.push([lx - 14 * Math.cos(ang), top + 26 - 14 * Math.sin(ang) - 0]);
    }
    pts.push([lx + 14, plexY]);
    line(c, pts, mix('#3E1416', vc, 0.5), vw + 4);
    line(c, pts, vc, vw);
    line(c, pts, rgba(mix(vc, '#FFFFFF', 0.25), 0.5), Math.max(2, vw * 0.25));
  }
  // 기저막 물결 위로 표피 바탕
  const ep = [];
  for (let x = x0 - 10; x <= x1 + 10; x += 10) ep.push([x, bm(x)]);
  poly(c, [[x0 - 10, EPI_TOP - 2], [x1 + 10, EPI_TOP - 2], ...ep.reverse()], mix(mix(PAL.cellLo, PAL.red, 0.45 * red), mix(PAL.tanTint, '#000000', 0.25), 0.5 * tan));
  // 세포
  for (const cl of CELLS) {
    if (cl.x + cl.w < x0 - 4 || cl.x > x1 + 4) continue;
    const isDying = o.dying && o.dying.cell === cl;
    const q = isDying ? o.dying.q : 0;
    if (cl.melano) { melanocyte(stage, cl, o.act ?? 0, o.gran ?? 0, red, tan); continue; }
    const s = 1 - 0.45 * q, inset = 3;
    const cx = cl.cx, cy = cl.cy, w = (cl.w - inset * 2) * s, h = (cl.h - inset * 2) * s;
    const yb = cl.r === ROWS - 1 ? Math.min(cy + h / 2, bm(cx) - 3) : cy + h / 2;
    const base = mix(mix(PAL.cell, '#CF7468', 0.72 * red), PAL.tanTint, 0.7 * tan);
    const g = c.createLinearGradient(0, cy - h / 2, 0, yb);
    g.addColorStop(0, mix(base, '#F4E4D6', 0.25)); g.addColorStop(1, mix(base, PAL.cellLo, 0.45));
    withAlpha(c, 1 - 0.75 * smooth((q - 0.6) / 0.4), () => {
      rect(c, cx - w / 2, cy - h / 2, w, yb - (cy - h / 2), 16 * s, isDying ? mix(PAL.cellLo, '#3A2E2A', q) : g, rgba(mix(PAL.cellLo, '#5A4438', 0.5), 0.9), 2);
      // 핵
      if (q < 0.55) {
        const nr = Math.min(w, h) * 0.22;
        const gn = c.createRadialGradient(cl.nx - nr * 0.3, cl.ny - nr * 0.35, nr * 0.2, cl.nx, cl.ny, nr * 1.2);
        gn.addColorStop(0, PAL.nucHi); gn.addColorStop(1, PAL.nuc);
        c.beginPath(); c.ellipse(cl.nx, cl.ny, nr * 1.15, nr * 0.9, 0, 0, TAU); c.fillStyle = gn; c.fill();
      } else {
        for (let j = 0; j < 4; j++) circle(c, cx + (rand(cl.i + j) - 0.5) * w * 0.5, cy + (rand(cl.i * 2 + j) - 0.5) * h * 0.4, 5, PAL.nuc);
      }
      const capA = typeof o.caps === 'function' ? o.caps(cl) : (o.caps ?? 0);
      if (capA > 0.01 && q < 0.5) melaninCap(c, cl, capA);
      const mk = o.marks?.get(cl.i);
      if (mk) ring(c, cl.nx, cl.ny, Math.min(w, h) * 0.3, rgba(PAL.cool, 0.95 * mk), 3.5);
    });
  }
  // 각질층
  const gc = c.createLinearGradient(0, CORN_Y, 0, EPI_TOP);
  gc.addColorStop(0, mix(mix(PAL.corn, '#D8857A', 0.5 * red), PAL.tanTint, 0.5 * tan)); gc.addColorStop(1, mix(mix(PAL.cellLo, PAL.red, 0.4 * red), PAL.tanTint, 0.5 * tan));
  c.fillStyle = gc; c.fillRect(x0, CORN_Y, x1 - x0, EPI_TOP - CORN_Y);
  for (let x = x0 - 40 + 0; x < x1; x += 70) line(c, [[x, CORN_Y + 8], [x + 52, CORN_Y + 8]], rgba(PAL.cellLo, 0.5), 2);
  for (let x = x0 - 5; x < x1; x += 70) line(c, [[x, CORN_Y + 16], [x + 52, CORN_Y + 16]], rgba(PAL.cellLo, 0.45), 2);
  c.restore();
  if (o.dim) { c.save(); c.fillStyle = rgba(PAL.deep, 0.55 * o.dim); c.fillRect(x0, CORN_Y, x1 - x0, SKIN_BOT - CORN_Y); c.restore(); }
}
function melaninCap(c, cl, a) {
  // 핵 위를 덮는 멜라닌 알갱이 무더기(초승달 모양으로 핵에 붙음 — 떨어진 '눈썹'처럼 보이지 않게)
  const nr = Math.min(cl.w, cl.h) * 0.22, rx = nr * 1.15, ry = nr * 0.9;
  withAlpha(c, clamp(a), () => {
    c.save(); c.beginPath(); c.ellipse(cl.nx, cl.ny, rx * 1.18, ry * 1.25, 0, Math.PI, TAU); c.ellipse(cl.nx, cl.ny - ry * 0.05, rx * 0.98, ry * 0.55, 0, TAU, Math.PI, true); c.closePath();
    c.fillStyle = PAL.melanin; c.fill(); c.restore();
    for (let j = 0; j < 7; j++) { const ang = Math.PI * (1.1 + 0.8 * j / 6); circle(c, cl.nx + Math.cos(ang) * rx * 1.02, cl.ny + Math.sin(ang) * ry * 1.0, 3.6, PAL.melaninHi); }
  });
}
/** 멜라닌 세포(기저층): 짙은 몸통 + 이웃 세포 사이로 뻗는 가지(act), 몸통 속 알갱이(gran) */
function melanocyte(stage, cl, act, gran, red, tan) {
  const c = stage.ctx, cx = cl.cx, cy = cl.cy + 6;
  const body = mix(PAL.melano, '#8A5E48', 0.25 * act);
  for (const [dx, dy] of DENDRITES) {
    const L = 0.3 + 0.7 * act, pts = [];
    for (let u = 0; u <= 1.001; u += 0.1) pts.push([cx + dx * L * u + 10 * Math.sin(u * Math.PI) * Math.sign(dx), cy + dy * L * u]);
    line(c, pts, rgba(mix(body, '#2E1E16', 0.2), 0.85), 5 - 2 * act);
  }
  c.beginPath(); c.ellipse(cx, cy, cl.w * 0.38, cl.h * 0.36, 0, 0, TAU);
  const g = c.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, cl.w * 0.42); g.addColorStop(0, mix(body, '#C49478', 0.35)); g.addColorStop(1, body);
  c.fillStyle = g; c.fill(); c.strokeStyle = rgba('#2E1E16', 0.8); c.lineWidth = 2; c.stroke();
  circle(c, cx, cy + 4, 9, PAL.nuc);
  const n = Math.round(10 * gran);
  for (let j = 0; j < n; j++) circle(c, cx + (rand(cl.i * 5 + j) - 0.5) * cl.w * 0.5, cy - 14 + (rand(cl.i * 9 + j) - 0.5) * 18, 4.6, PAL.melanin);
}
const DENDRITES = [[-92, -120], [-40, -170], [44, -165], [96, -118]];

/** 왼쪽 층 이름표(세계 안의 자 — 두께는 과장) */
function layerLabels(stage, a = 1, hi = '') {
  const c = stage.ctx;
  withAlpha(c, a, () => {
    const col = k => (hi === k ? PAL.ink : PAL.muted);
    stage.text('각질층', 22, CORN_Y - 16, {size: 24, weight: 500, color: col('corn'), ...so});
    line(c, [[14, EPI_TOP + 6], [14, EPI_BOT - 6]], rgba(PAL.ink, 0.6), 3);
    stage.text('표피', 26, EPI_TOP + 30, {size: 26, weight: 700, color: col('epi'), ...so});
    stage.text('약 0.1 mm', 26, EPI_TOP + 62, {size: 24, weight: 500, color: PAL.muted, ...so});
    line(c, [[14, EPI_BOT + 20], [14, 1236]], rgba(PAL.ink, 0.6), 3);
    stage.text('진피', 26, EPI_BOT + 50, {size: 26, weight: 700, color: col('derm'), ...so});
    stage.text('1~2 mm', 26, EPI_BOT + 82, {size: 24, weight: 500, color: PAL.muted, ...so});
  });
}

// =====================================================================================================
// 빛 알갱이(광자): 짧은 물결 꾸러미. 머리(x, y), 방향(dx, dy), 파장 lam px. 밝은 심 + 색, lit() 안에서.
// =====================================================================================================
function photonPath(x, y, dx, dy, lam, len, amp) {
  const pts = [], px = -dy, py = dx;
  for (let s = 0; s <= len; s += 2) { const w = amp * Math.sin(TAU * s / lam) * Math.sin(Math.PI * s / len); pts.push([x - dx * s + px * w, y - dy * s + py * w]); }
  return pts;
}
function photon(stage, x, y, {dx = 0, dy = 1, lam = 12, len = 54, amp = 7, col = PAL.cool, a = 1, w = 3.6, gain = 0.8} = {}) {
  if (a <= 0.01) return;
  const pts = photonPath(x, y, dx, dy, lam, len, amp);
  withAlpha(stage.ctx, a, () => lit(stage, c => { line(c, pts, col, w); line(c, pts, CORE(col), w * 0.4); circle(c, x, y, w * 1.05, CORE(col)); }, {gain}));
}
function absorbFlash(stage, x, y, age, col = PAL.cool, r0 = 6) {
  const q = clamp(age / 0.35);
  if (q >= 1) return;
  withAlpha(stage.ctx, 1 - q, () => lit(stage, c => { ring(c, x, y, r0 + 16 * q, col, 3); circle(c, x, y, 3.5 * (1 - q) + 1, CORE(col)); }, {gain: 0.6}));
}
const SLANT = [0.2, 0.98];   // 해는 왼쪽 위 — 알갱이는 조금 기울어 내려온다
/** 결정된 알갱이 흐름. 알갱이 i: 출발 ts = t0 + i/rate, x = 범위 안 rand, y0 에서 출발, stop(i, x) 깊이에서 흡수. */
function stream(stage, t, {t0, t1 = Infinity, rate, xa, xb, y0 = 280, speed = 520, stop, kind = 'B', seed = 1, onStop = null, flash = true, alpha = 1}) {
  if (t < t0) return;
  const st = kind === 'C' ? {lam: 9, len: 46, amp: 6, col: PAL.coolLo, w: 3.2, gain: 0.5}
    : kind === 'A' ? {lam: 18, len: 60, amp: 7, col: mix(PAL.cool, PAL.muted, 0.35), w: 3.2, gain: 0.55}
    : {lam: 11, len: 54, amp: 7, col: PAL.cool, w: 3.8, gain: 0.8};
  const iMax = Math.floor((Math.min(t, t1) - t0) * rate);
  const dx = SLANT[0], dy = SLANT[1];
  for (let i = Math.max(0, iMax - Math.ceil(rate * 4)); i <= iMax; i++) {
    const ts = t0 + i / rate, x = xa + rand(i * 1.37 + seed * 11.1) * (xb - xa), ys = stop(i, x);
    const tStop = (ys - y0) / (speed * dy), age = t - ts;
    if (age < 0) continue;
    if (age < tStop) photon(stage, x + dx * speed * age, y0 + dy * speed * age, {dx, dy, ...st, a: alpha});
    else {
      const sx = x + dx * speed * tStop;
      if (flash) absorbFlash(stage, sx, ys, age - tStop, st.col);
      onStop?.(i, sx, ys, age - tStop);
    }
  }
}
const epiDepth = i => EPI_TOP + 30 + Math.pow(rand(i * 2.71), 1.4) * (EPI_BOT - EPI_TOP - 60);
const dermDepth = i => EPI_BOT + 25 + rand(i * 3.17) * 140;

// =====================================================================================================
// 시간 계기: 쬔 뒤 시간 축 위 붉어짐(난색)·검어짐(멜라닌 색) 곡선
// =====================================================================================================
function timeGauge(stage, {x = 90, y = 292, w = 900, h = 250, hmax = 120, now = 0, red = 1, tan = 1, days = false, alpha = 1, ghostRed = 0, labelNow = true}) {
  const c = stage.ctx, px = x + 70, pw_ = w - 110, base = y + h - 52, top = y + 30, X = hh => px + pw_ * clamp(hh / hmax), Y = v => base - (base - top) * v;
  withAlpha(c, alpha, () => {
    panel(c, x, y, w, h);
    line(c, [[px, base], [px + pw_, base]], rgba(PAL.muted, 0.9), 2);
    const step = days ? 24 : (hmax <= 48 ? 12 : 24);
    for (let k = 0; k * step <= hmax + 0.01; k++) {
      const xx = X(k * step); line(c, [[xx, base], [xx, base + 8]], rgba(PAL.muted, 0.9), 2);
      const lab = k === 0 ? '0' : days || step === 24 ? `${(k * step) / 24}일` : `${k * step}시간`;
      if (!(step === 12 && k % 2 === 1 && k > 0)) stage.text(lab, xx, base + 28, {size: 24, color: PAL.muted, align: 'center', weight: 500});
    }
    stage.text('쬔 뒤', px - 12, base + 28, {size: 24, color: PAL.muted, align: 'right', weight: 500});
    const curve = (f, upto, col, a) => {
      if (a <= 0.01 || upto <= 0) return;
      const pts = []; for (let hh = 0; hh <= Math.min(upto, hmax) + 0.01; hh += hmax / 160) pts.push([X(hh), Y(f(hh))]);
      withAlpha(c, a, () => line(c, pts, col, 5));
    };
    if (ghostRed > 0) { const pts = []; for (let hh = 0; hh <= hmax; hh += hmax / 160) pts.push([X(hh), Y(R(hh))]); withAlpha(c, ghostRed, () => line(c, pts, rgba(PAL.warm, 0.45), 3, {dash: [8, 8]})); }
    curve(R, now, PAL.warm, red);
    curve(T, now, PAL.tanCurve, tan);
    if (red > 0.01 && now > 15) stage.text('붉어짐', X(Math.min(16, hmax * 0.5)) + 14, Y(R(Math.min(16, hmax))) - 22, {size: 26, weight: 700, color: PAL.warm, alpha: red});
    if (tan > 0.01 && T(Math.min(now, hmax)) > 0.35) { const hl = Math.min(now, hmax) * 0.72; stage.text('검어짐', X(hl) + 10, Y(T(hl)) + 20, {size: 26, weight: 700, color: PAL.tanCurve, alpha: tan}); }
    if (now > 0 && now <= hmax + 0.01) {
      const xx = X(now); line(c, [[xx, top - 6], [xx, base]], rgba(PAL.ink, 0.75), 2, {dash: [4, 5]});
      if (red > 0.01) circle(c, xx, Y(R(now)), 7, PAL.warm);
      if (tan > 0.01) circle(c, xx, Y(T(now)), 7, PAL.tanCurve);
      if (labelNow) stage.text(clockText(now), Math.min(xx + 12, px + pw_ - 150), top + 4, {size: 26, weight: 700, color: PAL.ink});
    }
  });
}

// =====================================================================================================
// 포스터(0초 프레임 = 썸네일): 흰 물음 위, 주제어(자외선)가 가장 크게. 시리즈 아님. 답은 쓰지 않는다.
// =====================================================================================================
const POSTER = {q: ['난로 앞에선 따뜻할 뿐인데', '햇볕엔 왜 탈까?'], a: '자외선', qy: 250, ay: 452, QS: 62, AS: 168};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 0.5 + 40;
  if (q < 1) unlitRect(stage, 0, 118, W, yBot - 118, 1);   // 포스터·머리글로 줄어드는 동안 글 아래 빛 지도를 모두 지운다
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.5)'); g.addColorStop(0.85, 'rgba(9,9,11,0.5)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 48, q), LH = POSTER.QS * 1.25 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else withAlpha(c, 1 - smooth((q - 0.55) / 0.45), () => stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 960}));
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.ay, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.cool, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa}));
}
const MORPH = tl => [tl.sentence('s01').end + 0.15, tl.sentence('s01').end + 1.05];

// =====================================================================================================
// 머리글
// =====================================================================================================
function head(stage, kicker, title, aK = 1, aT = 1) {
  const c = stage.ctx;
  if (Math.max(kicker ? aK : 0, title ? aT : 0) > 0.01) unlitRect(stage, 0, 118, W, 150, 1);
  if (kicker && aK > 0) withAlpha(c, aK, () => { stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 30, color: PAL.warmHi, align: 'center', tracking: 1.5, maxWidth: 900, ...so}); line(c, [[505, 174], [575, 174]], PAL.warm, 3, {cap: 'butt'}); });
  if (title && aT > 0) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: PAL.ink, align: 'center', maxWidth: 940, ...so}));
}
function headList(stage, t, L, a = 1) {
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
}
function titleList(id, ctx) {
  const a = (s, o = -0.4) => ctx.tl.at(s) + o;
  switch (id) {
    case 'hook': return [[-Infinity, '쬔 뒤 닷새 · 빠르게'], [2.15, '되감기'], [3.0, '햇볕을 쬐는 동안'], [W0(ctx, 's02', '몇', -0.3), '그늘에서 · 쬔 뒤 닷새를 몇 초로']];
    case 'origin': return [[-Infinity, '1800 · 허셜', '빨간빛 바깥의 열선'], [a('s04'), '1801 · 리터', '보랏빛 바깥에 염화은'], [a('s05'), '빛이 보이지 않는 자리', '가장 빨리 검어졌다'], [a('s06'), '자외선(紫外線)', '보라(紫) 바깥(外)의 빛']];
    case 'essence': return [[-Infinity, '빛의 알갱이', '파장이 짧을수록 한 알이 세다'], [a('s08'), '같은 분자 · 알갱이만 바꿈', '흔들기 대 결합 바꾸기'], [a('s09'), '핵심', '뜨거워서가 아니라, 다친 DNA']];
    case 'bands': return [[-Infinity, '파장으로 나눈 자외선', 'C · B · A'], [a('s11'), '땅에 닿는 자외선', 'A 95% · 붉게 태우는 것은 B'], [a('s12'), '피부 단면 · 두께 과장', 'B 는 표피, A 는 진피까지']];
    case 'dna': return [[-Infinity, '표피 세포의 핵 · 실제는 순식간 · 아주 느리게', '이웃한 두 염기가 들러붙는다'], [a('s14'), '읽는 장치가 멈춘다', '잘라 내고, 다시 채운다'], [a('s15'), '고칠 수 없을 만큼 다치면', '세포가 스스로 죽는다']];
    case 'red': return [[-Infinity, '몇 시간을 몇 초로', '혈관이 넓어진다'], [a('s17'), '붉어짐의 시간', '반나절에서 하루에 가장 심하다']];
    case 'tan': return [[-Infinity, '기저층의 멜라닌 세포', '깨어나 색소를 만든다'], [a('s19'), '이웃 세포로 건네진 멜라닌', '핵 위의 양산'], [a('s20'), '며칠을 몇 초로', '검어지는 것은 2~3일 뒤부터']];
    case 'cases': return [[-Infinity, '같은 자외선 · 멜라닌만 다름', '그을려도 두~네 배'], [a('s22'), '같은 햇볕 · 땅만 바꿈', '눈은 80%까지 되비춘다'], [a('s23'), '손상이 쌓이면', '위험도 커진다']];
    case 'close': return [[-Infinity, '정리', '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1230, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.2, 'rgba(8,8,10,0.6)'); g.addColorStop(1, 'rgba(8,8,10,0.8)'); c.fillStyle = g; c.fillRect(0, 1230, W, 690); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }

// =====================================================================================================
// hook: 결과 먼저 → 되감기 → 햇볕 → s02 시계를 다시 돌려 두 곡선
// =====================================================================================================
function hookClock(t, ctx) {
  const s2 = S(ctx, 's02'), tA = W0(ctx, 's02', '몇', -0.2), tR = W0(ctx, 's02', '빨개지는', 0.5), tM = W0(ctx, 's02', '며칠', -0.1), tK = W0(ctx, 's02', '검어지는', 0.6);
  if (t < 1) return 24 * t;
  if (t < 2) return 24 + 96 * (t - 1);
  if (t < 2.2) return 120;
  if (t < 3.0) return 120 * (1 - easeInOut((t - 2.2) / 0.8));
  return pw(t, [[tA, 0], [tR, 18], [tM, 36], [tK, 84], [s2.end + 0.4, 120]]);
}
const DAMAGED = [3, 7, 11, 16, 20, 25, 29, 33].map(i => KERAT.filter(c => c.r <= 2)[i % KERAT.filter(c => c.r <= 2).length]);
const DMG = new Map(DAMAGED.map(c => [c.i, 1]));

export const scenes = {
  hook(stage, t, p, ctx) {
    const h = hookClock(t, ctx), tA = W0(ctx, 's02', '몇', -0.2);
    const shining = t < 2.05 || (t > 3.0 && t < tA);
    skin(stage, {red: R(h), tan: T(h), caps: T(h)});
    layerLabels(stage, fadeIn(t, MORPH(ctx.tl)[1], 0.5));
    // 알갱이: 해가 비치는 동안만(되감기 동안·그늘에서는 멈춤)
    const t0 = t < 2.2 ? -0.9 : 3.0, t1 = t < 2.2 ? 2.05 : tA;
    if (t < 2.6 || t > 2.95) stream(stage, t, {t0, t1, rate: 16, xa: 40, xb: 1000, y0: 250, speed: 560, stop: i => epiDepth(i), kind: 'B', seed: 3});
    // 시계(결과 먼저 동안) — 화면의 시계가 실제 경과 시간을 보인다
    if (t < 3.05) {
      const a = t < 2.2 ? 1 : fadeOut(t, 2.75, 0.3);
      withAlpha(stage.ctx, a, () => {
        rect(stage.ctx, 800, 1176, 240, 56, 12, rgba(PAL.plate, 0.85));
        stage.text(t >= 2.2 ? '되감기' : clockText(h), 1020, 1205, {size: 32, weight: 700, color: PAL.ink, align: 'right'});
      });
    }
    // s02: 같은 시계를 천천히 — 두 곡선
    const ga = fadeIn(t, tA - 0.6, 0.5);
    if (ga > 0) timeGauge(stage, {hmax: 120, now: t > tA ? h : 0, red: 1, tan: fadeIn(t, W0(ctx, 's02', '며칠', -0.3), 0.4), alpha: ga});
  },

  // ---------------------------------------------------------------------------------------------------
  origin(stage, t, p, ctx) {
    const c = stage.ctx, sc = ctx.scene.start;
    const ex = [410, 712], board = {x: 740, y0: 330, y1: 1010};
    const BANDS = [['#E8453C', 470], ['#F08A2E', 540], ['#E8D23A', 610], ['#5CC46A', 680], ['#4C8CF0', 770], ['#8A5CE0', 862]];
    const IRY = [350, 440], UVY = [905, 1000];
    const aBeam = fadeIn(t, sc + 0.1, 0.6);
    // 햇빛 줄기 → 프리즘 → 색 띠 (빛, lit)
    withAlpha(c, aBeam, () => {
      lit(stage, cc => { line(cc, [[0, 690], [330, 700]], '#FFF3DC', 10); line(cc, [[0, 690], [330, 700]], '#FFFFFF', 4); }, {gain: 0.7});
      lit(stage, cc => {
        for (let k = 0; k < BANDS.length; k++) {
          const [col, y] = BANDS[k], y2 = k + 1 < BANDS.length ? BANDS[k + 1][1] : y + 90, ym = (y + y2) / 2;
          poly(cc, [ex, [board.x, y - 34], [board.x, Math.min(y + 40, ym + 10)]], rgba(col, 0.55));
          line(cc, [ex, [board.x, y]], CORE(col), 2);
        }
      }, {gain: 0.55});
    });
    // 프리즘(무광 유리 덩어리)
    const pr = [[365, 585], [262, 800], [468, 800]];
    const gp = c.createLinearGradient(262, 585, 468, 800); gp.addColorStop(0, rgba(PAL.prismHi, 0.95)); gp.addColorStop(1, rgba(PAL.prism, 0.95));
    poly(c, pr, gp, rgba('#C8D2DA', 0.8), 2.5);
    // 판(스크린)
    rect(c, board.x, board.y0, 22, board.y1 - board.y0, 4, '#3B3C41', rgba('#55565C', 1), 2);
    // 적외선 자리: 온도계(1800)
    const tIR = W0(ctx, 's03', '보이지', 0), aIR = fadeIn(t, tIR - 0.4, 0.5);
    withAlpha(c, aIR, () => {
      line(c, [ex, [board.x, IRY[0]]], rgba(PAL.warm, 0.6), 2, {dash: [10, 9]}); line(c, [ex, [board.x, IRY[1]]], rgba(PAL.warm, 0.6), 2, {dash: [10, 9]});
      const lvl = smooth((t - tIR) / 2.2);
      rect(c, 790, 300, 26, 100, 13, '#D9D6D0', rgba('#8A8780', 1), 2); circle(c, 803, 410, 20, '#D9D6D0');
      circle(c, 803, 410, 14, PAL.red); rect(c, 797, 402 - 84 * (0.25 + 0.75 * lvl), 12, 84 * (0.25 + 0.75 * lvl), 6, PAL.red);
      stage.text('적외선', 600, 360, {size: 30, weight: 700, color: PAL.warmHi, align: 'center', ...so});
      stage.text('보이지 않음 · 온도가 오름', 600, 398, {size: 24, weight: 500, color: PAL.muted, align: 'center', ...so});
    });
    // 염화은 조각(1801): 색 자리마다, 그리고 보라 바깥
    const tPut = evT(ctx, 'agcl'), dk = ticks(ctx, 'dark_uv'), RATES = [0.03, 0.07, 0.14, 0.32, 0.58, 1.0];
    const spots = [470, 610, 680, 770, 862, 952];
    const nDark = countUntil(dk, t), qDark = nDark === 0 ? 0 : clamp((nDark - 1 + smooth((t - dk[nDark - 1]) / 0.5)) / dk.length);
    for (let k = 0; k < 6; k++) {
      const ak = fadeIn(t, tPut + k * 0.16, 0.25);
      if (ak <= 0) continue;
      const dark = clamp(RATES[k] * Math.max(0, qDark));
      withAlpha(c, ak, () => {
        rect(c, 790, spots[k] - 22, 60, 44, 6, mix('#E9E6E0', '#1C1A1A', dark), rgba('#8A8780', 1), 2);
        rect(c, 864, spots[k] - 8, 70, 16, 8, rgba(PAL.border, 1));
        if (dark > 0.01) rect(c, 864, spots[k] - 8, Math.max(16, 70 * dark), 16, 8, k === 5 ? PAL.coolHi : PAL.ink);
      });
    }
    if (fadeIn(t, tPut, 0.4) > 0) stage.text('염화은 · 검어진 정도', 900, 1050, {size: 24, weight: 500, color: PAL.muted, align: 'right', alpha: fadeIn(t, tPut, 0.4)});
    // 자외선 자리(보이지 않는 빛) — s05 부터 점선 쐐기, s06 에 이름
    const aUV = fadeIn(t, S(ctx, 's05').start + 0.6, 0.6);
    withAlpha(c, aUV, () => {
      line(c, [ex, [board.x, UVY[0]]], rgba(PAL.cool, 0.7), 2, {dash: [10, 9]}); line(c, [ex, [board.x, UVY[1]]], rgba(PAL.cool, 0.7), 2, {dash: [10, 9]});
      stage.text('빛이 보이지 않는 자리', 560, 1000, {size: 24, weight: 500, color: PAL.muted, align: 'center', ...so});
    });
    const aName = fadeIn(t, W0(ctx, 's06', '보라색', 0), 0.5);
    withAlpha(c, aName, () => {
      stage.text('자외선', 560, 952, {role: 'display', size: 44, weight: 700, color: PAL.cool, align: 'center', ...so});
      // 보이지 않는 빛도 알갱이로 들어온다(s06 동안)
    });
    // 보이지 않는 빛도 알갱이로 와서 염화은을 검게 한다(s05~): 자외선 길을 따라 알갱이가 조각에 닿음
    const t5 = S(ctx, 's05').start;
    if (t > t5) {
      const per = 0.55, L = Math.hypot(790 - ex[0], 952 - ex[1]), dur = L / 420;
      for (let k = Math.max(0, Math.floor((t - t5 - dur) / per)); k <= Math.floor((t - t5) / per); k++) {
        const age = t - t5 - k * per;
        if (age < 0) continue;
        const ddx = (790 - ex[0]) / L, ddy = (952 - ex[1]) / L;
        if (age < dur) photon(stage, ex[0] + ddx * 420 * age, ex[1] + ddy * 420 * age, {dx: ddx, dy: ddy, len: 46});
        else absorbFlash(stage, 790, 952, age - dur);
      }
    }
    // 햇빛과 색 띠를 따라 흐르는 빛 알갱이(에너지의 흐름)
    if (aBeam > 0.5) lit(stage, cc => {
      for (let k = 0; k < 6; k++) { const u = ((t * 0.9 + k / 6) % 1); circle(cc, u * 330, 690 + 10 * u, 4, '#FFFFFF'); }
      for (let b = 0; b < BANDS.length; b++) for (let k = 0; k < 2; k++) {
        const u = ((t * 0.8 + k / 2 + b * 0.13) % 1); circle(cc, lerp(ex[0], board.x, u), lerp(ex[1], BANDS[b][1], u), 3.5, CORE(BANDS[b][0]));
      }
    }, {gain: 0.5});
  },

  // ---------------------------------------------------------------------------------------------------
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s8 = S(ctx, 's08'), s9 = S(ctx, 's09');
    // 파장 다이얼(로그 눈금 3000 → 250 nm)과 알갱이 하나의 에너지 막대(eV = 1240/λ)
    const AX = {x0: 110, x1: 700, y: 1190}, lx = l => AX.x0 + (AX.x1 - AX.x0) * (Math.log(3000 / l) / Math.log(3000 / 250));
    const tD = evT(ctx, 'dial');
    let lam = Math.exp(lerp(Math.log(3000), Math.log(300), easeInOut((t - tD) / 2.6)));
    // s08: 적외선 알갱이 → 자외선 알갱이(같은 분자, 알갱이만 바꿈)
    const tIR = evT(ctx, 'ir_hit'), tUV = evT(ctx, 'uv_hit'), tB = evT(ctx, 'bond');
    if (t > s8.start - 0.3) lam = t < (tIR + tUV) / 2 ? 3000 : 300;
    const E = 1240 / lam;
    const aMain = fadeOut(t, s9.start - 0.4, 0.5);
    withAlpha(c, aMain, () => {
      // 눈금
      line(c, [[AX.x0, AX.y], [AX.x1, AX.y]], rgba(PAL.muted, 0.9), 2);
      for (const [l, lab] of [[3000, '3000 nm'], [700, '700'], [400, '400'], [300, '300']]) {
        const x = lx(l); line(c, [[x, AX.y - 8], [x, AX.y + 8]], rgba(PAL.muted, 0.9), 2);
        stage.text(lab, x, AX.y + 28, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      }
      stage.text('적외선', lx(3000) + 6, AX.y - 30, {size: 24, weight: 700, color: PAL.warmHi});
      stage.text('보이는 빛', (lx(700) + lx(400)) / 2, AX.y - 30, {size: 24, weight: 500, color: PAL.ink, align: 'center'});
      stage.text('자외선', lx(300), AX.y - 30, {size: 24, weight: 700, color: PAL.coolHi, align: 'center'});
      // 보이는 빛 띠(빛)
      lit(stage, cc => { const g = cc.createLinearGradient(lx(700), 0, lx(400), 0); g.addColorStop(0, '#E8453C'); g.addColorStop(0.3, '#E8D23A'); g.addColorStop(0.6, '#5CC46A'); g.addColorStop(1, '#8A5CE0'); cc.fillStyle = g; cc.fillRect(lx(700), AX.y - 4, lx(400) - lx(700), 8); }, {gain: 0.3});
      // 다이얼 바늘
      const xn = lx(lam); poly(c, [[xn, AX.y - 12], [xn - 10, AX.y - 30], [xn + 10, AX.y - 30]], PAL.ink);
      // 에너지 막대
      const bx = 820, by = 1150, bh = 440, Y = e => by - bh * e / 4.5;
      rect(c, bx, Y(4.5), 64, bh, 10, rgba(PAL.border, 0.9));
      const col = lam > 700 ? PAL.warm : lam < 400 ? PAL.cool : PAL.ink;
      rect(c, bx, Y(E), 64, by - Y(E), 10, col);
      for (const [e, l] of [[0.41, '적외선'], [1.77, '빨강'], [4.13, '자외선 B']]) { line(c, [[bx - 14, Y(e)], [bx, Y(e)]], rgba(PAL.muted, 1), 2); stage.text(l, bx - 20, Y(e), {size: 24, weight: 500, color: PAL.muted, align: 'right'}); }
      stage.text(`${E.toFixed(1)} eV`, bx + 32, Y(4.5) - 34, {role: 'display', size: 40, weight: 700, color: col, align: 'center'});
      stage.text('알갱이 하나의 에너지', bx + 32, Y(4.5) - 78, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    });
    // 알갱이 하나(s07: 같은 길을 되풀이하며 파장이 줄어듦)
    if (t < s8.start - 0.3) {
      const per = 2.2, u = ((t - ctx.scene.start) % per) / per, x = lerp(120, 720, u);
      const col = lam > 700 ? PAL.warm : lam < 400 ? PAL.cool : mix(PAL.warm, PAL.cool, (700 - lam) / 300);
      const lamPx = 14 + 90 * Math.log(lam / 250) / Math.log(12);
      withAlpha(c, fadeIn(t, ctx.scene.start + 0.2) * fadeOut(t, s8.start - 0.6, 0.3), () => photon(stage, x, 780, {dx: 1, dy: 0, lam: lamPx, len: Math.max(90, lamPx * 2.6), amp: 24, col, w: 6}));
      return;
    }
    // s08: 분자 둘(같은 분자). 적외선 → 흔들림, 자외선 → 가운데 두 원자가 새로 결합
    const MX = 400, MY = 800, d0 = 104;
    const vib = t > tIR && t < tUV - 0.3 ? 14 * Math.sin((t - tIR) * 22) * Math.exp(-(t - tIR) * 0.4) : 0;
    const qB = smooth((t - tB) / 0.5);
    const atoms = [[MX - 1.5 * d0 - vib - 0 * qB, MY], [MX - 0.5 * d0 + vib + 18 * qB, MY + 26 * qB], [MX + 0.5 * d0 - vib - 18 * qB, MY + 26 * qB], [MX + 1.5 * d0 + vib, MY]];
    withAlpha(c, aMain, () => {
      // 적외선 흔들림의 잔상(점선 범위)
      if (t > tUV - 0.3) withAlpha(c, 0.7, () => { line(c, [[MX - 1.5 * d0 - 50, MY + 70], [MX + 1.5 * d0 + 50, MY + 70]], rgba(PAL.warmHi, 0.6), 2, {dash: [6, 6]}); stage.text('적외선 때: 흔들리기만', MX, MY + 104, {size: 26, weight: 500, color: PAL.warmHi, align: 'center'}); });
      const bondCol = PAL.atomHi;
      line(c, [atoms[0], atoms[1]], bondCol, 12); line(c, [atoms[2], atoms[3]], bondCol, 12);
      if (qB > 0) withAlpha(c, qB, () => line(c, [atoms[1], atoms[2]], PAL.coolHi, 12));
      for (const [x, y] of atoms) { const g = c.createRadialGradient(x - 12, y - 14, 5, x, y, 42); g.addColorStop(0, PAL.atomHi); g.addColorStop(1, PAL.atom); circle(c, x, y, 36, g); }
      if (qB > 0) stage.text('결합이 바뀜', MX, MY - 84, {size: 28, weight: 700, color: PAL.coolHi, align: 'center', alpha: qB});
      // 온도계(작게): 적외선일 때만 오름
      const th = smooth((t - tIR) / 1.6) * (1 - 0.0 * qB);
      rect(c, 640, 930, 24, 130, 12, '#D9D6D0'); circle(c, 652, 1068, 19, '#D9D6D0'); circle(c, 652, 1068, 12, PAL.red);
      rect(c, 647, 1055 - 40 - 70 * th, 10, 40 + 70 * th, 5, PAL.red);
      stage.text('온도', 600, 1000, {size: 24, weight: 500, color: PAL.muted, align: 'right'});
    });
    // 날아드는 알갱이
    const fly = (tHit, col, lamPx) => {
      const tt = t - (tHit - 0.9);
      if (tt < 0) return;
      const tx = MX, ty = MY - 6;
      if (tt < 0.9) photon(stage, lerp(60, tx, tt / 0.9), lerp(MY - 260, ty, tt / 0.9), {dx: 0.84, dy: 0.54, lam: lamPx, len: lamPx * 2.6, amp: 20, col, w: 5});
      else absorbFlash(stage, tx, ty, tt - 0.9, col, 14);
    };
    withAlpha(c, aMain, () => { fly(tIR, PAL.warm, 90); fly(tUV, PAL.cool, 16); });
    // s09: 피부로 — 핵에 남은 손상 표식(한색)과 몸의 반응(난색 신호)
    const a9 = fadeIn(t, s9.start - 0.4, 0.6);
    if (a9 > 0) withAlpha(c, a9, () => {
      const marks = new Map(DAMAGED.slice(0, 5).map((cl, k) => [cl.i, fadeIn(t, s9.start + 0.6 + k * 0.5, 0.3)]));
      skin(stage, {marks, red: 0.25 * smooth((t - W0(ctx, 's09', '반응하는', -0.6)) / 1.2)});
      layerLabels(stage, 1);
      stream(stage, t, {t0: s9.start - 0.8, rate: 6, xa: 40, xb: 1000, y0: 290, speed: 560, stop: i => epiDepth(i), kind: 'B', seed: 21});
      const tS = W0(ctx, 's09', '몸이', -0.4);
      for (const [k, cl] of DAMAGED.slice(0, 5).entries()) signalDot(stage, cl, LOOPS.reduce((b, x) => (Math.abs(x - cl.cx) < Math.abs(b - cl.cx) ? x : b)), t - tS - k * 0.25, 1.4);
    });
  },

  // ---------------------------------------------------------------------------------------------------
  bands(stage, t, p, ctx) {
    const c = stage.ctx, sc = ctx.scene.start, s11 = S(ctx, 's11'), s12 = S(ctx, 's12');
    const RX = nm => 110 + (930 - 110) * (nm - 100) / 300, RY = 312;
    const ATM = [420, 466];
    skin(stage, {});
    layerLabels(stage, 1, t > s12.start ? (t > W0(ctx, 's12', '에이는', -0.3) ? 'derm' : 'epi') : '');
    // 파장 자
    const cells = [['C', 100, 280, PAL.coolLo, W0(ctx, 's10', '씨로')], ['B', 280, 315, PAL.cool, W0(ctx, 's10', '비,')], ['A', 315, 400, mix(PAL.cool, PAL.muted, 0.35), W0(ctx, 's10', '에이,')]];
    for (const [L, a, b, col, tw] of cells) {
      const on = 0.35 + 0.65 * fadeIn(t, tw - 0.2, 0.3);
      rect(c, RX(a) + 2, RY - 22, RX(b) - RX(a) - 4, 44, 8, rgba(col, 0.55 * on), rgba(col, on), 2);
      stage.text(L, (RX(a) + RX(b)) / 2, RY, {role: 'display', size: 32, weight: 700, color: PAL.ink, align: 'center', alpha: on});
    }
    for (const nm of [100, 280, 315, 400]) stage.text(nm === 400 ? '400 nm' : `${nm}`, RX(nm) - (nm === 400 ? 20 : 0), RY + 40, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    // 대기(오존층) 띠
    const ga = c.createLinearGradient(0, ATM[0], 0, ATM[1]); ga.addColorStop(0, 'rgba(120,130,150,0.0)'); ga.addColorStop(0.5, 'rgba(120,130,150,0.32)'); ga.addColorStop(1, 'rgba(120,130,150,0.0)');
    c.fillStyle = ga; c.fillRect(0, ATM[0] - 10, W, ATM[1] - ATM[0] + 20);
    stage.text('대기 · 오존층', 1000, ATM[0] + 22, {size: 24, weight: 500, color: PAL.muted, align: 'right', ...so});
    // 세 갈래 알갱이: C 는 모두 대기에서, B 는 열에 아홉이 대기에서, A 는 모두 지나감
    const tC = W0(ctx, 's10', '씨로', -0.4), tBb = W0(ctx, 's10', '비,', -0.4), tAa = W0(ctx, 's10', '에이,', -0.4);
    const atmStop = i => ATM[0] + 8 + rand(i * 5.3) * 30;
    const bStop = i => (i % 10 === 4 ? epiDepth(i) : atmStop(i));
    const aStop = i => (rand(i * 7.7) < 0.35 ? epiDepth(i + 3) : dermDepth(i));
    const ghostB = [], ghostA = [];
    stream(stage, t, {t0: tC, rate: 4, xa: RX(110), xb: RX(270), y0: RY + 20, speed: 420, stop: atmStop, kind: 'C', seed: 1});
    stream(stage, t, {t0: tBb, rate: 10, xa: RX(282), xb: RX(313), y0: RY + 20, speed: 420, stop: bStop, kind: 'B', seed: 2, onStop: (i, x, y) => { if (y > CORN_Y) ghostB.push([x, y]); }});
    stream(stage, t, {t0: tAa, rate: 10, xa: RX(318), xb: RX(398), y0: RY + 20, speed: 420, stop: aStop, kind: 'A', seed: 3, onStop: (i, x, y) => ghostA.push([x, y])});
    // 멈춘 자리 표식(s12 부터) — 무광 점
    const aG = fadeIn(t, s12.start, 0.5);
    if (aG > 0) withAlpha(c, aG, () => { for (const [x, y] of ghostB) circle(c, x, y, 7, PAL.coolHi); for (const [x, y] of ghostA) circle(c, x, y, 7, PAL.coolLo); });
    // 땅에 닿는 비율(s11)
    const a11 = fadeIn(t, W0(ctx, 's11', '구십오퍼센트쯤은', -0.2), 0.4);
    if (a11 > 0) withAlpha(c, a11, () => {
      const x0 = 300, x1 = 930, y = 512, xm = lerp(x0, x1, 0.95 * smooth((t - evT(ctx, 'ground95')) / 0.8));
      rect(c, x0, y - 12, x1 - x0, 24, 12, rgba(PAL.border, 1));
      rect(c, x0, y - 12, xm - x0, 24, 12, mix(PAL.cool, PAL.muted, 0.35));
      rect(c, xm, y - 12, Math.max(0, x1 - xm) * clamp((t - evT(ctx, 'ground95') - 0.8) / 0.3), 24, 6, PAL.cool);
      stage.text('땅에 닿는 자외선', x0 - 14, y, {size: 24, weight: 500, color: PAL.muted, align: 'right'});
      stage.text('A 95%', lerp(x0, xm, 0.5), y + 1, {size: 24, weight: 700, color: PAL.deep, align: 'center'});
    });
  },

  // ---------------------------------------------------------------------------------------------------
  dna(stage, t, p, ctx) {
    const c = stage.ctx, s13 = S(ctx, 's13'), s14 = S(ctx, 's14'), s15 = S(ctx, 's15');
    const SEL = KERAT.find(cl => cl.r === 1 && cl.cx > 160 && cl.cx < 260);
    const tDie = evT(ctx, 'die'), qDie = smooth((t - tDie) / 2.6);
    const marks = new Map([[SEL.i, fadeIn(t, evT(ctx, 'dimer'), 0.3)]]);
    skin(stage, {marks, dying: qDie > 0 ? {cell: SEL, q: qDie} : null, dim: 0.55 * (1 - fadeIn(t, tDie + 0.4, 0.8))});
    // 렌즈
    const L = {x: 610, y: 800, r: 315}, aL = fadeIn(t, ctx.scene.start + 0.2, 0.6) * fadeOut(t, tDie + 0.2, 0.6);
    if (aL <= 0) { if (qDie > 0.3) stage.text('스스로 죽은 세포', SEL.cx, SEL.y - 40 + 0, {size: 26, weight: 700, color: PAL.ink, align: 'center', ...so, alpha: fadeIn(t, tDie + 0.6)}); return; }
    withAlpha(c, aL, () => {
      // 연결 표시(세포 → 렌즈)
      ring(c, SEL.nx, SEL.ny, 26, rgba(PAL.ink, 0.9), 3);
      const ang = Math.atan2(L.y - SEL.ny, L.x - SEL.nx);
      for (const s of [-1, 1]) { const a = ang + Math.PI / 2 * s * 0.92; line(c, [[SEL.nx + 26 * Math.cos(a), SEL.ny + 26 * Math.sin(a)], [L.x + L.r * Math.cos(a), L.y + L.r * Math.sin(a)]], rgba(PAL.ink, 0.45), 2); }
      c.save(); c.beginPath(); c.arc(L.x, L.y, L.r, 0, TAU); c.clip();
      const gb = c.createRadialGradient(L.x - 60, L.y - 80, 40, L.x, L.y, L.r); gb.addColorStop(0, '#4A3E49'); gb.addColorStop(1, '#2C252C');
      c.fillStyle = gb; c.fillRect(L.x - L.r, L.y - L.r, 2 * L.r, 2 * L.r);
      ladder(stage, t, ctx, L);
      c.restore();
      ring(c, L.x, L.y, L.r, rgba(PAL.ink, 0.85), 3);
      stage.text('세포핵 속 DNA', L.x, L.y - L.r - 24, {size: 26, weight: 700, color: PAL.ink, align: 'center', ...so});
    });
  },

  // ---------------------------------------------------------------------------------------------------
  red(stage, t, p, ctx) {
    const s16 = S(ctx, 's16'), s17 = S(ctx, 's17');
    const tW = evT(ctx, 'widen'), tP = evT(ctx, 'peak');
    const h = pw(t, [[s16.start, 0], [tW, 4], [s16.end, 8], [tP + 0.3, 16], [s17.end + 1.2, 40]]);
    const marks = new Map(DAMAGED.map(cl => [cl.i, 1]));
    skin(stage, {red: R(h), marks});
    layerLabels(stage, 1, 'derm');
    // 다친 세포가 내보내는 신호(난색) → 가까운 모세혈관으로
    const tk = ticks(ctx, 'signal');
    for (const [k, cl] of DAMAGED.entries()) {
      const vx = LOOPS.reduce((b, x) => (Math.abs(x - cl.cx) < Math.abs(b - cl.cx) ? x : b));
      for (let r = 0; r < 3; r++) signalDot(stage, cl, vx, t - tk[k % tk.length] - r * 1.1, 1.6, r);
    }
    timeGauge(stage, {hmax: 48, now: h, red: 1, tan: 0, alpha: fadeIn(t, ctx.scene.start + 0.1, 0.5)});
  },

  // ---------------------------------------------------------------------------------------------------
  tan(stage, t, p, ctx) {
    const c = stage.ctx, s18 = S(ctx, 's18'), s19 = S(ctx, 's19'), s20 = S(ctx, 's20');
    const tWake = evT(ctx, 'wake'), tCap = evT(ctx, 'cap'), gk = ticks(ctx, 'grain');
    const h = pw(t, [[s18.start, 2], [tWake, 12], [s19.end, 60], [s20.end + 1.0, 168]]);
    const act = smooth((t - tWake + 0.2) / 1.4), gran = clamp(countUntil(gk, t) / gk.length);
    // 건네짐: s19 시작 → 양산처럼(모자 완성)
    const qPass = smooth((t - s19.start - 0.2) / Math.max(0.5, tCap - s19.start));
    skin(stage, {act, gran: gran * (1 - 0.6 * qPass), caps: cl => clamp((0.35 * qPass + 0.65 * T(h)) * (melNear(cl) ? 1 : 0.8)), tan: T(h), red: R(h) * 0.6});
    layerLabels(stage, 1, 'epi');
    // 다친 세포 → 멜라닌 세포(기저층)로 가는 신호(붉어짐 신호와 다른 길: 아래로, 기저층의 멜라닌 세포로)
    const tS = s18.start + 0.2;
    for (const [k, cl] of DAMAGED.entries()) {
      const m = MELANO.reduce((b, x) => (Math.abs(x.cx - cl.cx) < Math.abs(b.cx - cl.cx) ? x : b));
      const age = t - tS - k * 0.22, q = clamp(age / 1.6);
      if (age > 0 && q < 1) withAlpha(c, 1 - smooth((q - 0.8) / 0.2), () => lit(stage, cc => { const x = lerp(cl.nx, m.cx, q), y = lerp(cl.ny, m.cy, q); circle(cc, x, y, 6, PAL.warm); circle(cc, x, y, 2.6, CORE(PAL.warm)); }, {gain: 0.5}));
    }
    // 건네지는 알갱이(무광) — 가지를 따라 이웃 세포의 핵 위로
    if (qPass > 0 && qPass < 1) for (const m of MELANO) {
      const near = KERAT.filter(cl => Math.abs(cl.cx - m.cx) < 120 && cl.r >= 3);
      near.forEach((cl, j) => { for (let g = 0; g < 3; g++) { const q = clamp(qPass * 1.25 - g * 0.1 - j * 0.03); const x = lerp(m.cx, cl.nx + (g - 1) * 7, q) + (g - 1) * 3, y = lerp(m.cy - 10, cl.ny - 16, q) + (g === 1 ? -6 : 0) + g * 4 * (1 - q); circle(c, x, y, 5, PAL.melanin); } });
    }
    // 자외선 알갱이가 멜라닌 모자에서 멈춤(s19 끝) — 모자가 없을 때 갔을 길은 점선 잔상
    const tBlk = evT(ctx, 'block');
    if (t > tBlk - 1.2) {
      const xs = KERAT.filter(cl => cl.r === 2 && cl.cx > 80 && cl.cx < 520).slice(0, 4);
      xs.forEach((cl, k) => {
        const tHit = tBlk + k * 0.3, y0 = 300, capY = cl.ny - 22, dur = (capY - y0) / 560, tt = t - (tHit - dur);
        const x0 = cl.nx - SLANT[0] * (capY - y0);
        withAlpha(c, 0.5, () => line(c, [[cl.nx, capY], [cl.nx + SLANT[0] * 26, cl.ny]], rgba(PAL.coolHi, 0.8), 2, {dash: [5, 5]}));
        if (tt > 0 && tt < dur) photon(stage, x0 + SLANT[0] * 560 * tt, y0 + SLANT[1] * 560 * tt, {dx: SLANT[0], dy: SLANT[1]});
        else if (tt >= dur) absorbFlash(stage, cl.nx, capY, tt - dur);
      });
    }
    timeGauge(stage, {x: 560, y: 292, w: 440, h: 250, hmax: 168, days: true, now: h, red: 0.0, tan: 1, ghostRed: 0.9, alpha: fadeIn(t, ctx.scene.start + 0.1, 0.5)});
  },

  // ---------------------------------------------------------------------------------------------------
  cases(stage, t, p, ctx) {
    const c = stage.ctx, s21 = S(ctx, 's21'), s22 = S(ctx, 's22'), s23 = S(ctx, 's23');
    if (t < s22.start - 0.35) return casesTan(stage, t, ctx);
    if (t < s23.start - 0.35) return casesSnow(stage, t, ctx);
    return casesYears(stage, t, ctx);
  },

  // ---------------------------------------------------------------------------------------------------
  close(stage, t, p, ctx) {
    const c = stage.ctx, s24 = S(ctx, 's24');
    skin(stage, {red: 0.0, tan: 0.0, marks: new Map(DAMAGED.map(cl => [cl.i, fadeIn(t, ctx.scene.start + 0.4 + 0.15 * (cl.i % 5), 0.3)]))});
    layerLabels(stage, 1);
    stream(stage, t, {t0: ctx.scene.start - 1, rate: 8, xa: 40, xb: 1000, y0: 300, speed: 560, stop: i => epiDepth(i), kind: 'B', seed: 41});
    const ea = fadeIn(t, s24.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 290, W, 290, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 290, 0, 580); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.65)'); g.addColorStop(0.85, 'rgba(9,9,11,0.65)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 290, W, 290);
        ['피부가 타는 것은 뜨거워서가 아니라,', '자외선에 다친 DNA에', '몸이 반응하는 것입니다'].forEach((s, i) => stage.text(s, 540, 345 + i * 66, {role: 'display', weight: 700, size: 48, color: i === 1 ? PAL.coolHi : i === 2 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 980, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 535, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, s24.start, 0.5)});
      });
    }
  },
};

/** 다친 세포 → 모세혈관으로 가는 신호 점(난색, lit). age 0..dur */
function signalDot(stage, cl, vx, age, dur = 1.5, r = 0) {
  if (age < 0 || age > dur) return;
  const q = age / dur, x0 = cl.nx + (r - 1) * 10, y0 = cl.ny + 10, x1 = vx + (r - 1) * 6, y1 = bm(vx) + 30;
  const x = lerp(x0, x1, easeInOut(q)) + 12 * Math.sin(q * 6 + r), y = lerp(y0, y1, q);
  withAlpha(stage.ctx, 1 - smooth((q - 0.8) / 0.2), () => lit(stage, cc => { circle(cc, x, y, 9, PAL.warm); circle(cc, x, y, 4, CORE(PAL.warm)); }, {gain: 0.5}));
}
const melNear = cl => MELANO.some(m => Math.abs(m.cx - cl.cx) < 120) && cl.r >= 3;

// ---------------------------------------------------------------------------------------------------
// DNA 사다리(렌즈 속): 위 가닥의 이웃한 두 T 가 들러붙음 → 읽는 장치가 멈춤 → 잘라 내고 다시 채움 → (s15) 들러붙은 자리가 많아짐
// ---------------------------------------------------------------------------------------------------
const SEQ = 'GACTTAGCATCGAT', PAIR = {A: 'T', T: 'A', G: 'C', C: 'G'};
function ladder(stage, t, ctx, L) {
  const c = stage.ctx, s14 = S(ctx, 's14'), s15 = S(ctx, 's15');
  const yT = L.y - 92, yB = L.y + 92, dx = 66, x0 = L.x - dx * 4.5;
  const tAbs = evT(ctx, 'absorb'), tDim = evT(ctx, 'dimer'), tStall = evT(ctx, 'stall'), tCut = evT(ctx, 'cut'), tFill = evT(ctx, 'fill');
  const qD = smooth((t - tDim) / 0.5) * (1 - smooth((t - tCut) / 0.3)), qCut = smooth((t - tCut) / 0.8), qFill = smooth((t - tFill + 0.2) / 0.8);
  const many = ticks(ctx, 'many'), nMany = countUntil(many, t);
  const X = k => x0 + k * dx;
  // 등뼈(무광 띠)
  const bb = (y, from, to, col = '#B9AEB8') => line(c, [[X(from) - dx / 2, y], [X(to) + dx / 2, y]], col, 12, {cap: 'butt'});
  bb(yB, 0, SEQ.length - 1);
  // 위 가닥: 잘라 낸 조각(k 2..5)은 떠올라 사라지고, 새 조각이 채워진다
  const cutA = 2, cutB = 5;
  bb(yT, 0, cutA - 1); bb(yT, cutB + 1, SEQ.length - 1);
  if (qCut < 1) withAlpha(c, 1 - qCut, () => { c.save(); c.translate(0, -90 * qCut); bb(yT, cutA, cutB); c.restore(); });
  if (qFill > 0) withAlpha(c, qFill, () => bb(yT, cutA, cutB, '#D8D0D6'));
  for (let k = 0; k < SEQ.length; k++) {
    const b = SEQ[k], x = X(k), inCut = k >= cutA && k <= cutB;
    // 아래 반 칸(짝)
    rect(c, x - 15, L.y + 4, 30, yB - L.y - 10, 6, '#8E868C'); stage.text(PAIR[b], x, L.y + 30, {size: 26, weight: 700, color: PAL.ink, align: 'center'});
    // 위 반 칸
    const tilt = (k === 3 ? 1 : k === 4 ? -1 : 0) * 12 * qD;
    const draw = (alpha, lift = 0, col = '#9A9298') => withAlpha(c, alpha, () => {
      c.save(); c.translate(x + tilt, L.y - 4 - lift);
      rect(c, -15, -(L.y - yT - 10), 30, L.y - yT - 10, 6, col);
      stage.text(b, 0, -24, {size: 26, weight: 700, color: PAL.ink, align: 'center'});
      c.restore();
    });
    if (!inCut) draw(1);
    else { if (qCut < 1) draw(1 - qCut, 90 * qCut); if (qFill > 0) draw(qFill, 0, '#BDB4BA'); }
  }
  // 들러붙은 자리(한색 고리 + 이음): 같은 가닥의 이웃한 두 T
  if (qD > 0.01) withAlpha(c, qD, () => {
    const xa = X(3) + 12 * qD + 15, xb = X(4) - 12 * qD - 15, y = yT + 30;
    line(c, [[xa, y - 8], [xb, y - 8]], PAL.coolHi, 7); line(c, [[xa, y + 10], [xb, y + 10]], PAL.coolHi, 7);
    stage.text('들러붙은 두 염기', (X(3) + X(4)) / 2 + 30, yT - 70, {size: 26, weight: 700, color: PAL.coolHi, align: 'center'});
  });
  // 자외선 B 알갱이가 들어와 흡수됨
  const ta = t - (tAbs - 0.8);
  if (ta > 0 && ta < 0.8) photon(stage, lerp(L.x - 300, (X(3) + X(4)) / 2, ta / 0.8), lerp(L.y - 300, yT - 10, ta / 0.8), {dx: 0.7, dy: 0.7, lam: 11, len: 60});
  else if (ta >= 0.8) absorbFlash(stage, (X(3) + X(4)) / 2, yT - 10, ta - 0.8, PAL.cool, 10);
  // 읽는 장치(무광 덩어리): 왼쪽에서 위 가닥을 따라 오다 들러붙은 자리 앞에서 멈춤
  const aR = fadeIn(t, s14.start, 0.4) * fadeOut(t, tCut - 0.2, 0.4);
  if (aR > 0) withAlpha(c, aR, () => {
    const xr = lerp(X(-0.5), X(2.3), smooth((t - s14.start) / Math.max(0.4, tStall - s14.start)));
    const g = c.createRadialGradient(xr - 14, yT - 20, 6, xr, yT, 52); g.addColorStop(0, mix(PAL.reader, '#FFFFFF', 0.25)); g.addColorStop(1, PAL.reader);
    c.beginPath(); c.ellipse(xr, yT, 46, 40, 0, 0, TAU); c.fillStyle = g; c.fill();
    line(c, [[xr, yT + 40], [xr, yB + 40]], rgba(PAL.ink, 0.6), 2); stage.text('읽는 장치', xr, yB + 62, {size: 26, weight: 700, color: PAL.ink, align: 'center'});
    if (t > tStall) stage.text('멈춤', xr, yT + 2, {size: 24, weight: 700, color: PAL.deep, align: 'center'});
  });
  if (qFill > 0.3 && t < s15.start) stage.text('고침', (X(cutA) + X(cutB)) / 2, yT - 46, {size: 26, weight: 700, color: PAL.ink, align: 'center', alpha: fadeIn(t, tFill, 0.4)});
  // s15: 들러붙은 자리가 여기저기 — 수를 셈
  if (nMany > 0) {
    const spots = [[7, 8], [0, 1], [9, 10], [5, 6], [1, 2], [8, 9], [10, 11], [6, 7], [2, 3], [3, 4]];
    for (let j = 0; j < Math.min(nMany, spots.length); j++) {
      const [a] = spots[j], y = yT + 30;
      line(c, [[X(a) + 15, y - 8], [X(a + 1) - 15, y - 8]], PAL.coolHi, 7); line(c, [[X(a) + 15, y + 10], [X(a + 1) - 15, y + 10]], PAL.coolHi, 7);
    }
    stage.text(`들러붙은 자리 ${Math.min(nMany, spots.length)}곳`, L.x, L.y + L.r - 60, {size: 28, weight: 700, color: PAL.coolHi, align: 'center'});
  }
}

// ---------------------------------------------------------------------------------------------------
// cases ①: 같은 자외선, 멜라닌 모자만 다른 두 피부
// ---------------------------------------------------------------------------------------------------
function casesTan(stage, t, ctx) {
  const c = stage.ctx, s21 = S(ctx, 's21'), tX = evT(ctx, 'x24');
  skin(stage, {x0: 0, x1: 540});
  skin(stage, {x0: 540, x1: W, caps: 1, tan: 0.55});
  line(c, [[540, 290], [540, SKIN_BOT]], rgba(PAL.ink, 0.8), 3);
  stage.text('그을리기 전', 270, 312, {size: 30, weight: 700, color: PAL.ink, align: 'center', ...so});
  stage.text('그을린 뒤', 810, 312, {size: 30, weight: 700, color: PAL.ink, align: 'center', ...so});
  // 같은 알갱이(같은 표적 자리를 양쪽에) — 왼쪽은 핵까지, 오른쪽은 셋 중 둘이 멜라닌 모자에서 멈춤
  const rows = KERAT.filter(cl => cl.r === 1 || cl.r === 2);
  const target = (i, side) => { const cands = rows.filter(cl => (side ? cl.cx > 580 && cl.cx < 1040 : cl.cx > 40 && cl.cx < 500)); return cands[Math.floor(rand(i * 4.1) * cands.length)]; };
  const counts = [0, 0], RATE = 4, t1 = s21.end + 0.5;
  for (const side of [0, 1]) {
    const iMax = Math.floor((Math.min(t, t1) - ctx.scene.start) * RATE);
    for (let i = 0; i <= iMax; i++) {
      const cl = target(i, side), blocked = side && i % 3 !== 0, yEnd = blocked ? cl.ny - 22 : cl.ny;
      const ts = ctx.scene.start + i / RATE, dur = (yEnd - 400) / (560 * SLANT[1]), age = t - ts;
      if (age < 0) continue;
      const x0 = cl.nx - SLANT[0] / SLANT[1] * (yEnd - 400);
      if (age < dur) { photon(stage, x0 + SLANT[0] * 560 * age, 400 + SLANT[1] * 560 * age, {dx: SLANT[0], dy: SLANT[1]}); continue; }
      absorbFlash(stage, cl.nx, yEnd, age - dur);
      if (!blocked) { counts[side]++; ring(c, cl.nx, cl.ny, 16, rgba(PAL.cool, 0.9), 3); }
    }
  }
  withAlpha(c, fadeIn(t, ctx.scene.start + 1.0), () => {
    stage.text(`핵에 닿은 알갱이 ${counts[0]}`, 270, 356, {size: 26, weight: 700, color: PAL.coolHi, align: 'center'});
    stage.text(`핵에 닿은 알갱이 ${counts[1]}`, 810, 356, {size: 26, weight: 700, color: PAL.coolHi, align: 'center'});
  });
  // 빨개지기까지의 시간 막대: 1배 대 2~4배
  const aX = fadeIn(t, tX - 0.2, 0.5);
  if (aX > 0) withAlpha(c, aX, () => {
    const y = 1160, u = 60;
    panel(c, 60, 1110, 960, 110, 0.94);
    stage.text('빨개지기까지 걸리는 시간', 540, 1135, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
    rect(c, 90, y + 6, u, 30, 8, PAL.warm); stage.text('1배', 90 + u + 14, y + 22, {size: 26, weight: 700, color: PAL.ink});
    const g = smooth((t - tX) / 1.0);
    rect(c, 600, y + 6, u * 2 * g, 30, 8, PAL.warm);
    rect(c, 600 + u * 2 * g, y + 6, u * 2 * g, 30, 8, rgba(PAL.warm, 0.4));
    stage.text('2~4배', 600 + u * 4 * g + 12, y + 22, {size: 26, weight: 700, color: PAL.ink, alpha: g});
  });
}

// ---------------------------------------------------------------------------------------------------
// cases ②: 같은 햇볕, 땅만 바꿈(풀밭 → 눈). 되비친 알갱이가 아래에서도 피부에 닿는다.
// ---------------------------------------------------------------------------------------------------
function casesSnow(stage, t, ctx) {
  const c = stage.ctx, s22 = S(ctx, 's22'), tSnow = evT(ctx, 'snow');
  const GY = 1110, SK = {x: 640, y0: 560, y1: 1040, w: 70};
  const snow = smooth((t - tSnow) / 0.6);
  // 땅
  const gg = c.createLinearGradient(0, GY, 0, GY + 130);
  gg.addColorStop(0, mix('#55624E', '#E4E6E8', snow)); gg.addColorStop(1, mix('#36402F', '#A9AEB4', snow));
  c.fillStyle = gg; c.fillRect(0, GY, W, 130);
  stage.text(snow < 0.5 ? '풀밭' : '눈', 90, GY + 40, {size: 28, weight: 700, color: snow < 0.5 ? PAL.ink : PAL.deep});
  // 피부 조각(세운 단면: 왼쪽 면이 겉)
  const gs = c.createLinearGradient(SK.x, 0, SK.x + SK.w, 0); gs.addColorStop(0, PAL.corn); gs.addColorStop(0.12, PAL.cell); gs.addColorStop(0.5, PAL.cellLo); gs.addColorStop(0.55, PAL.derm); gs.addColorStop(1, PAL.dermLo);
  rect(c, SK.x, SK.y0, SK.w, SK.y1 - SK.y0, 10, gs, rgba('#5A4438', 0.9), 2);
  stage.text('피부', SK.x + SK.w + 18, SK.y0 + 30, {size: 26, weight: 700, color: PAL.ink, ...so});
  // 알갱이: 위에서 땅으로(일부는 곧장 피부로), 땅에서 되비친 것은 피부 왼쪽 면으로
  const rate = 7, t0 = ctx.scene.start - 1.5, frac = i => (rand(i * 9.13) < (snow > 0.5 ? 0.8 : 0.08));
  let hitsDirect = 0, hitsRefl = 0;
  const iMax = Math.floor((t - t0) * rate);
  for (let i = Math.max(0, iMax - 40); i <= iMax; i++) {
    const ts = t0 + i / rate, age = t - ts, gx = 80 + rand(i * 2.2) * 500, x0 = gx - SLANT[0] / SLANT[1] * (GY - 280), dur = (GY - 280) / (560 * SLANT[1]);
    if (age < 0) continue;
    if (age < dur) { photon(stage, x0 + SLANT[0] * 560 * age, 280 + SLANT[1] * 560 * age, {dx: SLANT[0], dy: SLANT[1]}); continue; }
    const snowAt = smooth((ts + dur - tSnow) / 0.6) > 0.5;
    const refl = rand(i * 9.13) < (snowAt ? 0.8 : 0.08);
    const a2 = age - dur;
    if (!refl) { absorbFlash(stage, gx, GY, a2); continue; }
    const tx = SK.x, ty = lerp(SK.y1 - 30, SK.y0 + 140, rand(i * 3.9)), L = Math.hypot(tx - gx, ty - GY), d2 = L / 560;
    if (a2 < d2) { const q = a2 / d2, ddx = (tx - gx) / L, ddy = (ty - GY) / L; photon(stage, lerp(gx, tx, q), lerp(GY, ty, q), {dx: ddx, dy: ddy}); }
    else absorbFlash(stage, tx, ty, a2 - d2);
  }
  // 되비침 막대
  withAlpha(c, fadeIn(t, s22.start, 0.4), () => {
    panel(c, 90, 330, 900, 110);
    stage.text('땅이 되비추는 자외선', 120, 360, {size: 24, weight: 500, color: PAL.muted});
    const v = lerp(0.08, 0.8, snow);
    rect(c, 120, 392, 820, 26, 13, rgba(PAL.border, 1)); rect(c, 120, 392, 820 * v, 26, 13, PAL.cool);
    withAlpha(c, snow, () => line(c, [[120 + 820 * 0.08, 384], [120 + 820 * 0.08, 426]], rgba(PAL.ink, 0.9), 3, {dash: [4, 4]}));
    stage.text(snow < 0.5 ? '풀밭: 10% 아래' : '눈: 80%까지', 960, 360, {size: 28, weight: 700, color: PAL.ink, align: 'right'});
  });
}

// ---------------------------------------------------------------------------------------------------
// cases ③: 해마다 고치지 못하고 남는 손상 표식이 쌓임 → 위험 막대
// ---------------------------------------------------------------------------------------------------
function casesYears(stage, t, ctx) {
  const c = stage.ctx, yk = ticks(ctx, 'years'), n = countUntil(yk, t);
  skin(stage, {marks: new Map(KERAT.filter(cl => cl.r <= 3).filter((cl, j) => rand(j * 1.9) < 0.12 * n).map(cl => [cl.i, 1]))});
  layerLabels(stage, 1, 'epi');
  withAlpha(c, fadeIn(t, S(ctx, 's23').start - 0.3, 0.4), () => {
    panel(c, 90, 330, 900, 160);
    stage.text(`${n * 10}년`, 150, 410, {role: 'display', size: 52, weight: 700, color: PAL.ink});
    stage.text('남은 손상', 360, 380, {size: 24, weight: 500, color: PAL.muted});
    for (let k = 0; k < 5; k++) rect(c, 360 + k * 66, 402, 54, 24, 6, k < n ? PAL.cool : rgba(PAL.border, 1));
    stage.text('피부암의 위험', 720, 380, {size: 24, weight: 500, color: PAL.muted});
    rect(c, 720, 402, 240, 24, 12, rgba(PAL.border, 1)); rect(c, 720, 402, Math.max(24, 240 * n / 5), 24, 12, PAL.warm);
  });
}

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { captionBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); unlitRect(stage, 0, 0, W, 120, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') {
    posterTitle(stage, 1);
    let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
    head(stage, L[k][1], '', fadeIn(t, Math.max(MO[1] - 0.05, L[k][0]), 0.4) * a, 0);
    withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration));
    return;
  }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
