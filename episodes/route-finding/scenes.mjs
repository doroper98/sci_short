// 51 구글맵 길찾기 — 가장 빠른 길을 고르는 계산
// Look grammar (2026-11-10): every moving thing is a link of one chain — a crossing is confirmed → its neighbours' records are
// corrected (a signal runs along the road) → the confirmed area spreads → the destination is confirmed → the path is traced back.
// One clock: every state (confirmed crossings, records, pulses, route, gauges, sounds) is read from model.mjs runs
// (settleTime(run, k)); make_sound.mjs uses the same plan(timeline). No fixed-count loops.
// Warm = what the calculation does (confirmed area, the chosen route). Cool = outside information that sets the weights
// (A*'s straight-line estimate, phones' speeds, the jam).
// Matte filled bodies: town blocks, the confirmed tint (a state colour, not light), cars, layer plates, markers.
// lit(): relax pulses along roads, the node being confirmed, the chosen route, phone position pings, the route-follower dot.
// Film look (2026-11-22): charcoal background, fixed paper grain, soft bloom around lit() — config/look.json.
// Honest time scale: algorithm kickers state the run's rate ("1초에 N개", computed); the traffic scene is real speed.
// No logos, no real app screens, no map images: the road network is our own made-up town (설명 모형).
import {createRequire} from 'node:module';
import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, line, circle, ring, rect, withAlpha, lit, ensureGain, progressBar, poly,
} from '../../pipeline/render/index.mjs';
import * as M from './model.mjs';
const {createCanvas} = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../pipeline/render/package.json'))('@napi-rs/canvas');

export const theme = 'film';
export const look = {background: {cx: 0.5, cy: 0.37}};
export const events = [];
export const captionLayout = {};

const W = 1080;
const PAL = {
  ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#1E1E22',
  warm: '#FF8A2A', warmHi: '#F5A866', cool: '#5BA8F0', coolHi: '#A9D2FA',
  block: '#3B393F', blockHi: '#46444A', ground: '#26252A',
  flood: '#A26E45', floodHi: '#C98A55',
  local: '#625E5A', art: '#837D74', hwy: '#A39B90', casing: '#1A1A1D',
  node: '#CFC6B8', nodeDone: '#E5A066', car: ['#6F6B67', '#7E7A74', '#5E636B', '#8A8278'],
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);

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
function foot(stage, s, a = 1) { if (a > 0 && s) withAlpha(stage.ctx, a, () => uText(stage, s, 540, 300, {size: 24, weight: 500, color: PAL.muted, align: 'center', ...so, maxWidth: 1000})); }

// =====================================================================================================
// 실행(같은 시계)
// =====================================================================================================
let PLAN = null, PLAN_TL = null;
export function runs(tl) { if (PLAN_TL !== tl) { PLAN = M.plan(tl); PLAN_TL = tl; prep(PLAN); } return PLAN; }
function prep(R) {
  for (const run of Object.values(R)) {
    if (!run || !run.res) continue;
    const ord = run.res.order;
    run.at = new Map(ord.map((o, k) => [o.n, M.settleTime(run, k)]));
    run.relaxT = run.res.relax.map(r => ({...r, t: M.settleTime(run, r.k)}));
    run.end = M.runEnd(run);
  }
}
const countAt = (run, t) => (t < run.t0 ? 0 : Math.min(run.res.order.length, Math.floor((t - run.t0) * run.rate + 1e-9) + 1));
const rateTxt = run => `1초에 ${run.rate >= 10 ? Math.round(run.rate) : fmt1(run.rate)}개`;

// =====================================================================================================
// 카메라와 동네 무대
// =====================================================================================================
const CAM = {full: {z: 1, fx: 540, fy: 700}};
function withCam(stage, cam, fn) { const c = stage.ctx; c.save(); c.translate(540, 700); c.scale(cam.z, cam.z); c.translate(-cam.fx, -cam.fy); try { fn(c); } finally { c.restore(); } }
const toS = (cam, x, y) => [540 + (x - cam.fx) * cam.z, 700 + (y - cam.fy) * cam.z];
const camMix = (a, b, q) => ({z: lerp(a.z, b.z, q), fx: lerp(a.fx, b.fx, q), fy: lerp(a.fy, b.fy, q)});
const G = M.TOWN, NODE = n => [G.nodes[n].x, G.nodes[n].y];
function edgePts(k, from) { const e = G.edges[k]; return from === e.a ? e.pts : [...e.pts].reverse(); }
function pathPts(g, pathN) { const out = []; for (let i = 1; i < pathN.length; i++) { const k = M.edgeBetween(g, pathN[i - 1], pathN[i]), e = g.edges[k], pts = pathN[i - 1] === e.a ? e.pts : [...e.pts].reverse(); out.push(...(out.length ? pts.slice(1) : pts)); } return out; }
function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function partial(pts, u) { const L = pathLen(pts) * clamp(u), out = [pts[0]]; let d = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d + l >= L) { const q = l ? (L - d) / l : 0; out.push([lerp(pts[i - 1][0], pts[i][0], q), lerp(pts[i - 1][1], pts[i][1], q)]); return out; } out.push(pts[i]); d += l; } return out; }
function pointAt(pts, u) { const p = partial(pts, u); return p[p.length - 1]; }

// 블록: 네 모서리 점을 가운데 쪽으로 15 px 들인 무광 덩어리
const BLOCKS = G.blocks.map(ids => {
  const P = ids.map(NODE), cx = P.reduce((a, p) => a + p[0], 0) / 4, cy = P.reduce((a, p) => a + p[1], 0) / 4;
  return P.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy), q = (d - 21) / d; return [cx + (x - cx) * q, cy + (y - cy) * q]; });
});
const ROADW = {local: 7, art: 12, ramp: 9, hwy: 17};
const ROADC = {local: PAL.local, art: PAL.art, ramp: PAL.art, hwy: PAL.hwy};

// 확정한 곳의 무광 물듦: 한 번에 칠하는 화면 밖 판(겹쳐도 진해지지 않게)
const FL = {canvas: null, ctx: null, s: 0.5};
function floodLayer(stage, cam, run, te, a, grow = 0.25) {
  if (!run || a <= 0 || te < run.t0) return;
  if (!FL.canvas) { FL.canvas = createCanvas(W * FL.s, 1920 * FL.s); FL.ctx = FL.canvas.getContext('2d'); }
  const f = FL.ctx; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, W * FL.s, 1920 * FL.s);
  f.setTransform(FL.s * cam.z, 0, 0, FL.s * cam.z, FL.s * (540 - cam.fx * cam.z), FL.s * (700 - cam.fy * cam.z));
  f.save(); f.beginPath(); f.roundRect(80, 310, 920, 780, 78); f.clip();
  f.fillStyle = PAL.flood; f.strokeStyle = PAL.flood; f.lineCap = 'round';
  for (const o of run.res.order) {
    const ts = run.at.get(o.n); if (ts > te) break;
    const r = 74 * smooth((te - ts) / grow);
    f.beginPath(); f.arc(G.nodes[o.n].x, G.nodes[o.n].y, r, 0, Math.PI * 2); f.fill();
    if (o.via >= 0) {   // 확정한 점과 그 부모를 잇는 길도 물듦(고속도로처럼 점 사이가 먼 길)
      const pts = edgePts(o.via, o.parent), u = smooth((te - ts) / grow);
      f.lineWidth = 104; f.globalAlpha = 1; f.beginPath(); if (u > 0.01) { const pp = partial(pts, u); pp.forEach(([x, y], i) => (i ? f.lineTo(x, y) : f.moveTo(x, y))); f.stroke(); }
    }
  }
  f.restore();
  withAlpha(stage.ctx, a, () => stage.ctx.drawImage(FL.canvas, 0, 0, W, 1920));
}

/** 동네 무대 하나 — o: {cam, blocks, run, te, floodA, nodesA, pulses, cur, route:{pts,u,a}, ghost, jam, edgesA, hiEdges} */
function town(stage, t, o) {
  const c = stage.ctx, cam = o.cam || CAM.full;
  withCam(stage, cam, () => {
    const ba = o.blocks ?? 1;
    if (ba > 0) withAlpha(c, ba, () => { for (const B of BLOCKS) { poly(c, B, PAL.block); line(c, [B[0], B[1]], rgba(PAL.blockHi, 1), 3); } });
  });
  // 물듦(화면 좌표 판)
  if (o.ghost) floodLayer(stage, cam, o.ghost.run, o.ghost.te, o.ghost.a ?? 0.18);
  floodLayer(stage, cam, o.run, o.te ?? t, o.floodA ?? 0.42, o.grow ?? 0.25);
  withCam(stage, cam, () => {
    const ea = o.edgesA ?? 1;
    withAlpha(c, ea, () => {
      for (const cls of ['local', 'ramp', 'art', 'hwy']) for (const e of G.edges) if (e.cls === cls) line(c, e.pts, PAL.casing, ROADW[cls] + 6);
      for (const cls of ['local', 'ramp', 'art', 'hwy']) for (const e of G.edges) if (e.cls === cls) line(c, e.pts, ROADC[cls], ROADW[cls]);
    });
    // 막힘: 고속도로 위의 한색 띠(바깥 정보 — 빛 아님)
    if ((o.jam ?? 0) > 0) withAlpha(c, o.jam, () => { for (const e of G.edges) if (e.jam) { line(c, e.pts, rgba(PAL.cool, 0.55), ROADW.hwy + 2); line(c, e.pts, rgba('#0E1A28', 0.6), 4, {dash: [10, 12]}); } });
    // 확정된 길(부모 → 점): 무광 난색 선
    const run = o.run, te = o.te ?? t;
    if (run && te >= run.t0) for (const od of run.res.order) {
      const ts = run.at.get(od.n); if (ts > te) break;
      if (od.via >= 0) line(c, partial(edgePts(od.via, od.parent), smooth((te - ts) / 0.2)), PAL.floodHi, Math.max(4, ROADW[G.edges[od.via].cls] * 0.55));
    }
    if (o.hiEdges) for (const [k, a, col] of o.hiEdges) if (a > 0) withAlpha(c, a, () => line(c, G.edges[k].pts, col, ROADW[G.edges[k].cls] + 3));
    // 점(교차로)
    const na = o.nodesA ?? 0;
    if (na > 0) withAlpha(c, na, () => G.nodes.forEach((n, i) => {
      const done = run && run.at.has(i) && run.at.get(i) <= te;
      circle(c, n.x, n.y, n.kind === 'hwy' ? 10 : 8, PAL.casing); circle(c, n.x, n.y, n.kind === 'hwy' ? 7.5 : 6, done ? PAL.nodeDone : PAL.node);
    }));
    // 고침 신호(빛): 확정한 점에서 이웃으로 길을 따라 달림
    if (run && o.pulses !== false && te >= run.t0) {
      const dur = Math.min(0.5, 1.4 / run.rate);
      lit(stage, cc => {
        for (const r of run.relaxT) {
          if (r.t > te) break; const u = (te - r.t) / dur; if (u >= 1) continue;
          const pts = edgePts(r.e, r.from), seg = partial(pts, u), head = seg[seg.length - 1], tail = pointAt(pts, Math.max(0, u - 0.35));
          line(cc, [tail, head], rgba(PAL.warm, 0.95 * (1 - u * 0.4)), 5); line(cc, [tail, head], CORE(PAL.warm), 2);
        }
      });
    }
    // 지금 확정되는 점(빛 고리)
    if (run && o.cur !== false && te >= run.t0) {
      const k = countAt(run, te) - 1, od = run.res.order[k];
      if (od) { const ts = run.at.get(od.n), u = clamp((te - ts) / 0.35), [x, y] = NODE(od.n); if (u < 1) lit(stage, cc => { ring(cc, x, y, 12 + 18 * u, rgba(PAL.warm, 1 - u), 4); circle(cc, x, y, 6, CORE(PAL.warm)); }); }
    }
    // 고른 길(빛)
    if (o.route && o.route.a > 0 && o.route.u > 0) {
      const pts = o.route.rev ? [...o.route.pts].reverse() : o.route.pts, seg = partial(pts, o.route.u);
      withAlpha(c, o.route.a, () => lit(stage, cc => { line(cc, seg, PAL.warm, 11); line(cc, seg, CORE(PAL.warm), 4); }));
    }
    if (o.dashed) for (const [pts, a, col] of o.dashed) if (a > 0) withAlpha(c, a, () => line(c, pts, col, 6, {dash: [14, 12]}));
  });
  markers(stage, cam, o.sA ?? 1, o.dA ?? 1, t);
}
function markers(stage, cam, sA, dA, t) {
  const c = stage.ctx;
  if (sA > 0) { const [x, y] = toS(cam, ...NODE(G.S)); withAlpha(c, sA, () => { circle(c, x, y, 19, PAL.casing); circle(c, x, y, 14, PAL.ink); circle(c, x, y, 6, PAL.casing); label(stage, '출발', x - 6, y + 46, {size: 28}); }); }
  if (dA > 0) { const [x, y] = toS(cam, ...NODE(G.D)); withAlpha(c, dA, () => { rect(c, x - 17, y - 17, 34, 34, 4, PAL.casing); rect(c, x - 13, y - 13, 26, 26, 3, PAL.ink); rect(c, x - 6, y - 6, 12, 12, 2, PAL.casing); label(stage, '도착', x + 6, y - 44, {size: 28}); }); }
}
function scaleBar(stage, cam, a = 1) {
  if (a <= 0) return; const c = stage.ctx, L = M.PX_PER_KM * cam.z, x = 70, y = 1104;
  withAlpha(c, a, () => { line(c, [[x, y], [x + L, y]], PAL.ink, 3, {cap: 'butt'}); line(c, [[x, y - 8], [x, y + 8]], PAL.ink, 3); line(c, [[x + L, y - 8], [x + L, y + 8]], PAL.ink, 3); note(stage, '1 km', x + L / 2, y - 22, {size: 24, color: PAL.ink}); });
}

// 계기(무대 아래, 1240 위): 확정 수 · 기록
function gauge(stage, items, a = 1) {
  if (a <= 0) return; const c = stage.ctx;
  withAlpha(c, a, () => {
    unlitRect(stage, 0, 1132, W, 104, 1);
    items.forEach((it, i) => {
      const x = items.length === 1 ? 540 : i ? 800 : 280;
      note(stage, it[0], x, 1150, {size: 26});
      uText(stage, it[1], x, 1200, {role: 'display', size: 50, weight: 700, color: it[2] || PAL.ink, align: 'center', ...so});
    });
  });
}
function bars(stage, rows, a = 1) {   // rows: [name, value, max, col, alpha]
  if (a <= 0) return; const c = stage.ctx, x0 = 300, w = 560;
  withAlpha(c, a, () => {
    unlitRect(stage, 0, 1120, W, 120, 1);
    const n = rows.length, h = n === 3 ? 30 : 38, gap = n === 3 ? 38 : 50, y0 = 1178 - (n - 1) * gap / 2;
    rows.forEach(([name, v, max, col, al = 1], i) => {
      const y = y0 + i * gap;
      withAlpha(c, al, () => {
        uText(stage, name, x0 - 20, y, {size: 26, weight: 500, color: PAL.muted, align: 'right', ...so});
        rect(c, x0, y - h / 2, w, h, 6, rgba('#000', 0.4), rgba(PAL.border, 1), 2);
        rect(c, x0, y - h / 2, Math.max(0, w * clamp(v / max)), h, 6, col);
        uText(stage, `${v}개`, x0 + w + 16, y, {size: 28, weight: 700, color: PAL.ink, ...so});
      });
    });
  });
}

// =====================================================================================================
// 포스터(0초 = 썸네일): 흰 물음 위, 주제어(구글맵)가 가장 크게. 답은 쓰지 않는다.
// =====================================================================================================
const POSTER = {q: ['멀리 돌아가는 길이 더 빠를 때', '그 길을 어떻게 찾을까?'], a: '구글맵', qy: 168, ay: 392, QS: 62, AS: 160};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 0.45 + 30;
  if (q < 1) unlitRect(stage, 0, 80, W, yBot - 80, 1);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.6)'); g.addColorStop(0.85, 'rgba(9,9,11,0.6)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 46, q), LH = POSTER.QS * 1.3 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 1000}));
  else withAlpha(c, 1 - smooth((q - 0.55) / 0.45), () => stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 1000}));
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
    case 'hook': return [[-Infinity, `결과 먼저 · 교차로 ${rateTxt(R.hook0)} 확정`], [2.2, '되감기'], [3.1, '', ''], [MORPH(ctx.tl)[1], '가상의 도로망 · 설명 모형', '목적지를 넣으면, 길 하나']];
    case 'origin': return [[-Infinity, '다익스트라 · 단순화한 그림', '두 도시 사이의 가장 짧은 길'], [a('s04'), '머릿속으로 약 20분', '3년 뒤에 발표']];
    case 'essence': return [[-Infinity, '가상의 도로망 · 설명 모형', '교차로는 점, 도로는 선'], [a('s06'), '동네 길 20 · 큰길 40 · 고속도로 90 km/h · 설명용 값', '선의 무게 = 걸리는 시간'], [a('s07'), '가상의 도로망 · 설명 모형', '시간의 합이 가장 작은 선들']];
    case 'dijkstra': return [[-Infinity, `다익스트라 · 교차로 하나씩 · ${rateTxt(R.dijkstra)}`, '가장 빨리 닿는 곳부터 확정'], [a('s09'), `다익스트라 · 교차로 하나씩 · ${rateTxt(R.dijkstra)}`, '이웃의 기록을 고친다'],
      [a('s10'), `다익스트라 · 교차로 하나씩 · ${rateTxt(R.dijkstra)}`, '같은 시간의 물결'], [a('s11'), `다익스트라 · 교차로 하나씩 · ${rateTxt(R.dijkstra)}`, '온 길을 거꾸로 — 가장 빠른 길']];
    case 'astar': return [[-Infinity, '다익스트라가 확정한 곳 · 잔상', '반대쪽까지 살핀다'], [a('s13'), `A* · 교차로 하나씩 · ${rateTxt(R.astar)}`, '남은 직선거리로 어림'], [a('s14'), `A* · 교차로 하나씩 · ${rateTxt(R.astar)}`, '덜 살피고, 같은 길']];
    case 'layers': return [[-Infinity, `큰 도로망 · 설명 모형 · ${rateTxt(R.bigDij)}`, '점이 많으면 오래 걸린다'], [a('s16'), '미리 센 중요도 · 설명 모형', '먼 길에 자주 쓰이는 도로를 위층으로'],
      [a('s17'), `층 방법 · ${rateTxt(R.bigLay)}`, '양 끝 동네만 아래층, 사이는 위층'], [a('s18'), '널리 알려진 방법의 하나', '구글맵의 방법 — 자세히 공개되지 않음']];
    case 'traffic': return [[-Infinity, '고속도로 한 구간 0.5 km · 실제 빠르기', '구글이 밝힌 것 — 무게를 아는 법'], [a('s20'), '고속도로 한 구간 0.5 km · 실제 빠르기', '휴대전화들이 알려 준 지금 속도'], [a('s21'), '지난 기록 · 설명용 곡선', '조금 뒤에 걸릴 시간을 예측']];
    case 'detour': return [[-Infinity, `다시 계산 · ${rateTxt(R.detour)}`, '고속도로가 막히면'], [R.jamOff + 0.3, '막힘이 풀린 평소 · 모형의 값', '짧은 길 ≠ 빠른 길'], [a('s24'), '막힘이 풀린 평소 · 모형의 값', '무게는 거리가 아니라 시간']];
    case 'close': return [[-Infinity, `교차로 ${rateTxt(R.close)}`, '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1236, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.1, 'rgba(8,8,10,0.45)'); g.addColorStop(0.4, 'rgba(8,8,10,0.35)'); g.addColorStop(0.65, 'rgba(8,8,10,0.12)'); g.addColorStop(1, 'rgba(8,8,10,0.12)'); c.fillStyle = g; c.fillRect(0, 1236, W, 684); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }

// =====================================================================================================
// 장면
// =====================================================================================================
const ROUTE_FREE = pathPts(G, M.RES.free.path), ROUTE_JAM = pathPts(G, M.RES.jam.path), ROUTE_A = pathPts(G, M.RES.astar.path);
function hookTe(R, t) {   // 결과 먼저(0~1.9) → 멈춤(~2.2) → 되감기(2.2~3.0) → 처음 상태
  const r = R.hook0;
  if (t < 2.2) return t;
  if (t < 3.0) return lerp(2.2, r.t0 - 0.01, easeInOut((t - 2.2) / 0.8));
  return -1;
}
function routeU(run, t) { return smooth((t - run.path0) / (run.path1 - run.path0)); }

// 큰 도로망(층 장면)의 투영: q = 기울기(0 평면 → 1 비스듬히), up = 위층을 들어 올린 정도
const BG = M.BIG, BS = 34;
const BP = (x, y, lay, q) => [540 + (x - 9) * BS, 690 + (y - 9) * BS * (1 - 0.5 * q) + 190 * q - lay * 330 * q];
const bnode = (n, lay, q) => BP(BG.nodes[n].x, BG.nodes[n].y, lay, q);
const BW = {local: 2.5, art: 4, ramp: 3.5, hwy: 7};

export const scenes = {
  hook(stage, t, p, ctx) {
    const R = runs(ctx.tl), te = hookTe(R, t), run = R.hook0;
    const app = R.hookApp, dA = t < 3.0 ? 1 - smooth((t - 2.6) / 0.4) : fadeIn(t, app.pin - 0.1, 0.3);
    const rA = t < 3.0 ? (t < 2.2 ? 1 : 1 - smooth((t - 2.2) / 0.5)) : fadeIn(t, app.t, 0.15);
    const rU = t < 3.0 ? routeU(run, Math.min(t, 2.19)) : smooth((t - app.t) / 0.45);
    town(stage, t, {run: te >= 0 ? run : null, te, floodA: 0.5, grow: 0.12, nodesA: 0, pulses: t < 2.2, cur: t < 2.2, route: {pts: ROUTE_FREE, u: rU, a: rA}, dA});
    if (t > 3.0 && t < app.pin) { const [x, y] = toS(CAM.full, ...NODE(G.S)), u = ((t - 3.0) % 1.2) / 1.2; lit(stage, cc => ring(cc, x, y, 22 + 26 * u, rgba(PAL.warm, 0.8 * (1 - u)), 3)); }
    if (t < 3.0 && te >= run.t0) gauge(stage, [['확정한 교차로', `${countAt(run, te)}개`]], fadeIn(t, 0.05, 0.2) * fadeOut(t, 2.6, 0.3));
    scaleBar(stage, CAM.full, fadeIn(t, MORPH(ctx.tl)[1], 0.4));
  },

  origin(stage, t, p, ctx) {
    const R = runs(ctx.tl), run = R.origin, g = M.ORIGIN, c = stage.ctx, sa = fadeIn(t, ctx.scene.start, 0.5);
    withAlpha(c, sa, () => {
      for (const e of g.edges) { line(c, e.pts, PAL.casing, 9); line(c, e.pts, PAL.local, 5); }
      for (const od of run.res.order) { const ts = run.at.get(od.n); if (ts > t) break; if (od.via >= 0) { const e = g.edges[od.via], pts = od.parent === e.a ? e.pts : [...e.pts].reverse(); line(c, partial(pts, smooth((t - ts) / 0.3)), PAL.floodHi, 5); } }
      const dur = Math.min(0.6, 1.2 / run.rate);
      lit(stage, cc => { for (const r of run.relaxT) { if (r.t > t) break; const u = (t - r.t) / dur; if (u >= 1) continue; const e = g.edges[r.e], pts = r.from === e.a ? e.pts : [...e.pts].reverse(), seg = partial(pts, u); const h = seg[seg.length - 1], tl0 = pointAt(pts, Math.max(0, u - 0.35)); line(cc, [tl0, h], PAL.warm, 5); line(cc, [tl0, h], CORE(PAL.warm), 2); } });
      g.nodes.forEach((n, i) => { const done = run.at.has(i) && run.at.get(i) <= t; circle(c, n.x, n.y, 17, PAL.casing); circle(c, n.x, n.y, 13, done ? PAL.nodeDone : PAL.node); });
      const pts = pathPts(g, run.res.path), u = smooth((t - run.path0) / (run.path1 - run.path0));
      if (u > 0) lit(stage, cc => { const s = partial(pts, u); line(cc, s, PAL.warm, 10); line(cc, s, CORE(PAL.warm), 4); });
      const S = g.nodes[g.S], D = g.nodes[g.D];
      label(stage, '출발 도시', S.x, S.y + 48, {size: 28}); label(stage, '도착 도시', D.x, D.y - 44, {size: 28});
    });
    // 큰 숫자 하나: 해(1956 → 1959)
    const pub = fadeIn(t, R.yearPub - 0.1, 0.3);
    withAlpha(c, sa * (1 - pub), () => uText(stage, '1956', 540, 1150, {role: 'display', size: 96, weight: 700, color: PAL.ink, align: 'center', ...so}));
    withAlpha(c, pub, () => { uText(stage, '1959', 540, 1150, {role: 'display', size: 96, weight: 700, color: PAL.warmHi, align: 'center', ...so}); note(stage, '발표', 690, 1166, {size: 30, align: 'left', color: PAL.ink}); });
  },

  essence(stage, t, p, ctx) {
    const tl = ctx.tl, w = (s, x) => { const ss = tl.sentence(s), tts = ss.tts || ss.text, i = tts.indexOf(x); return ss.chars[i].start; };
    const tP = w('s05', '점으로'), tL = w('s05', '선으로'), tW = w('s06', '시간을'), s07 = tl.sentence('s07');
    const blocks = 1 - 0.75 * smooth((t - tP + 0.3) / 0.8), nodesA = fadeIn(t, tP - 0.2, 0.5);
    const hiA = fadeIn(t, tL - 0.2, 0.4) * fadeOut(t, tW - 1.0, 0.5);
    town(stage, t, {blocks, nodesA, edgesA: 1, hiEdges: G.edges.map((e, k) => [k, hiA * 0.8, rgba(PAL.ink, 0.35)])});
    // 무게: 두 길의 선마다 '분'(길이 ÷ 속도) — 하나씩
    const both = [M.RES.free, M.RES.jam].map(r => M.pathStats(G, r.path).edges), seq = [...new Set([...both[1], ...both[0]])];
    const wa = fadeOut(t, s07.end + 0.4, 0.5);
    seq.forEach((k, i) => {
      const ts = tW - 0.4 + i * 0.16, a = fadeIn(t, ts, 0.25) * wa; if (a <= 0) return;
      const e = G.edges[k], m = pointAt(e.pts, 0.5), horiz = Math.abs(e.pts[e.pts.length - 1][0] - e.pts[0][0]) > Math.abs(e.pts[e.pts.length - 1][1] - e.pts[0][1]);
      const [x, y] = toS(CAM.full, m[0] + (horiz ? 0 : 30), m[1] + (horiz ? -24 : 0));
      withAlpha(stage.ctx, a, () => uText(stage, fmt1(M.minutes(e)), x, y, {size: 26, weight: 700, color: e.cls === 'hwy' ? PAL.warmHi : PAL.ink, align: 'center', ...so}));
    });
    // 합: 두 길을 차례로 더해 감(시간의 합) — 계기
    const tS = s07.start + 0.8, routes = [[M.RES.jam, '시내 길'], [M.RES.free, '고속도로 길']];
    const vals = routes.map(([r], i) => { const es = M.pathStats(G, r.path).edges, u = clamp((t - tS - i * 1.6) / 2.2); let s = 0; es.forEach((k, j) => { if (j < u * es.length) s += M.minutes(G.edges[k]); }); return {u, s, es}; });
    routes.forEach(([r], i) => { const v = vals[i]; if (v.u > 0) withAlpha(stage.ctx, 0.9, () => withCam(stage, CAM.full, c => line(c, partial(pathPts(G, r.path), v.u), i ? PAL.floodHi : rgba(PAL.ink, 0.85), 7, {dash: i ? null : [14, 10]}))); });
    const win = fadeIn(t, tS + 4.2, 0.5);
    if (t > tS - 0.2) gauge(stage, routes.map(([, n], i) => [n, `${fmt1(vals[i].s)}분`, i && win > 0.5 ? PAL.warmHi : PAL.ink]), fadeIn(t, tS - 0.2, 0.3));
    scaleBar(stage, CAM.full, 1);
  },

  dijkstra(stage, t, p, ctx) {
    const R = runs(ctx.tl), run = R.dijkstra, tl = ctx.tl;
    const ru = routeU(run, t);
    town(stage, t, {run, blocks: 0.45, floodA: 0.36, nodesA: 1, route: {pts: ROUTE_FREE, u: ru, a: 1, rev: true}});
    // 기록(분): 아직 확정되지 않은, 기록이 붙은 점 위에 — 고칠 때 바뀜
    const rec = new Map();
    for (const r of run.relaxT) { if (r.t > t) break; rec.set(r.to, {g: r.g, t: r.t}); }
    for (const [n, v] of rec) {
      const done = run.at.get(n) <= t; if (done && t - run.at.get(n) > 0.6) continue;
      const [x, y] = toS(CAM.full, ...NODE(n)), fresh = clamp(1 - (t - v.t) / 0.5), a = done ? 1 - clamp((t - run.at.get(n)) / 0.6) : 1;
      withAlpha(stage.ctx, a, () => uText(stage, fmt1(v.g), x + 20, y - 22, {size: 25, weight: 700, color: mix(PAL.ink, PAL.warmHi, fresh), ...so}));
    }
    const k = countAt(run, t), od = run.res.order[Math.max(0, k - 1)];
    gauge(stage, [['확정한 교차로', `${k}개`], ['방금 확정한 기록', k ? `${fmt1(od.g)}분` : '—', PAL.warmHi]], 1);
    if (ru > 0.98) { const [x, y] = toS(CAM.full, ...NODE(G.D)); note(stage, `${fmt1(M.RES.freeStats.min)}분 · ${fmt1(M.RES.freeStats.km)} km`, x - 10, y + 52, {size: 28, color: PAL.warmHi, weight: 700, alpha: fadeIn(t, run.path1, 0.3)}); }
    scaleBar(stage, CAM.full, 1);
  },

  astar(stage, t, p, ctx) {
    const R = runs(ctx.tl), run = R.astar, dj = R.dijkstra, tl = ctx.tl, s13 = tl.at('s13');
    const ghostA = 0.34;
    const on = t >= run.t0 - 0.05;
    town(stage, t, {run: on ? run : null, ghost: {run: dj, te: dj.end + 5, a: on ? 0.16 : ghostA}, blocks: 0.45, floodA: 0.4, nodesA: 1, route: {pts: ROUTE_A, u: routeU(run, t), a: 1}});
    // 다익스트라가 반대쪽에서 살핀 점: 출발점보다 목적지에서 먼 점 — s12 동안 표시
    const far = fadeIn(t, tl.at('s12') + 0.8, 0.4) * fadeOut(t, s13 - 0.2, 0.4);
    if (far > 0) { const dS = M.astarHeur(G, G.D); const dS0 = dS(G.S); withAlpha(stage.ctx, far, () => withCam(stage, CAM.full, c => { for (const od of dj.res.order) if (dS(od.n) > dS0 + 0.05) ring(c, ...NODE(od.n), 15, PAL.coolHi, 3); })); note(stage, '목적지에서 더 먼 쪽', 300, 1080, {size: 26, color: PAL.coolHi, alpha: far}); }
    // 어림: 지금 확정하는 점 → 목적지 직선(한색 점선)
    if (on && t < run.end + 0.4) { const k = countAt(run, t) - 1, od = run.res.order[Math.max(0, k)]; withCam(stage, CAM.full, c => line(c, [NODE(od.n), NODE(G.D)], rgba(PAL.cool, 0.9), 3, {dash: [9, 9]})); }
    foot(stage, '어림 = 남은 직선거리 ÷ 가장 빠른 속도(90 km/h)', fadeIn(t, s13, 0.4));
    const nD = dj.res.order.length, kA = on ? countAt(run, t) : 0;
    bars(stage, [['다익스트라', nD, nD, rgba(PAL.flood, 0.7), 1], ['A*', kA, nD, PAL.floodHi, fadeIn(t, run.t0 - 0.4, 0.3)]], 1);
    const ru = routeU(run, t); if (ru > 0.98) { const [x, y] = toS(CAM.full, ...NODE(G.D)); note(stage, `같은 길 · ${fmt1(M.RES.freeStats.min)}분`, x - 10, y + 52, {size: 28, color: PAL.warmHi, weight: 700, alpha: fadeIn(t, run.path1, 0.3)}); }
  },

  layers(stage, t, p, ctx) {
    const R = runs(ctx.tl), tl = ctx.tl, c = stage.ctx, d = R.bigDij, ly = R.bigLay, sc = ctx.scene;
    const q = easeInOut((t - R.lift.t0) / (R.lift.t1 - R.lift.t0)), layOn = t >= ly.t0 - 0.05;
    const enter = fadeIn(t, sc.start, 0.6);
    const run = layOn ? ly : d;
    const sT = BG.nodes[BG.S].town, dT = BG.nodes[BG.D].town;
    const onUp = n => BG.upNode[n] && BG.nodes[n].town !== sT && BG.nodes[n].town !== dT;
    withAlpha(c, enter, () => {
      // 위층 판(무광): 들어 올린 뒤
      if (q > 0.02) {
        const corners = [[-3, -3], [21, -3], [21, 21], [-3, 21]];
        withAlpha(c, 0.9 * q, () => { poly(c, corners.map(([x, y]) => BP(x, y, 0, q)), rgba('#2E2D33', 0.9), rgba(PAL.border, 1), 2); poly(c, corners.map(([x, y]) => BP(x, y, 1, q)), rgba('#34323A', 0.55), rgba(PAL.border, 1), 2); });
      }
      // 아래층: 모든 길
      for (const cls of ['local', 'art', 'ramp', 'hwy']) for (const e of BG.edges) if (e.cls === cls) line(c, e.pts.map(([x, y]) => BP(x, y, 0, q)), cls === 'hwy' ? PAL.hwy : cls === 'local' ? PAL.local : PAL.art, BW[cls]);
      // 위층: 미리 센 중요한 선 + 세로 이음
      if (q > 0.02) withAlpha(c, q, () => {
        BG.nodes.forEach((n, i) => { if (onUp(i)) line(c, [bnode(i, 0, q), bnode(i, 1, q)], rgba(PAL.muted, 0.35), 1.5); });
        for (const e of BG.edges) if (e.up) line(c, e.pts.map(([x, y]) => BP(x, y, 1, q)), PAL.hwy, BW[e.cls] + 2);
      });
      // 확정(무광 난색 점·선)
      const lay = n => (layOn && onUp(n) ? 1 : 0);
      const fa = layOn ? 1 : fadeOut(t, R.lift.t0 - 0.6, 0.5);
      if (fa > 0) withAlpha(c, fa, () => { for (const od of run.res.order) {
        const ts = run.at.get(od.n); if (ts > t) break;
        if (od.via >= 0) { const e = BG.edges[od.via], L = Math.min(lay(od.parent), lay(od.n)), pts = (od.parent === e.a ? e.pts : [...e.pts].reverse()).map(([x, y]) => BP(x, y, L, q)); line(c, partial(pts, smooth((t - ts) / 0.15)), PAL.floodHi, 4); if (lay(od.parent) !== lay(od.n)) line(c, [bnode(od.n, 0, q), bnode(od.n, 1, q)], PAL.floodHi, 3); }
        const [x, y] = bnode(od.n, lay(od.n), q); circle(c, x, y, 4.5, PAL.nodeDone);
      } });
      // 고른 길(빛)
      const u = routeU(run, t) * fa;
      if (u > 0) {
        const pn = run.res.path, pts = [];
        for (let i = 1; i < pn.length; i++) { const k = M.edgeBetween(BG, pn[i - 1], pn[i]), e = BG.edges[k], L = Math.min(lay(pn[i - 1]), lay(pn[i])), seg = (pn[i - 1] === e.a ? e.pts : [...e.pts].reverse()).map(([x, y]) => BP(x, y, L, q)); if (lay(pn[i - 1]) !== lay(pn[i])) pts.push(bnode(pn[i - 1], lay(pn[i - 1]), q)); pts.push(...seg); }
        lit(stage, cc => { const s = partial(pts, u); line(cc, s, PAL.warm, 7); line(cc, s, CORE(PAL.warm), 2.6); });
        // s18: 고른 길을 따라가는 점(빛)
        const s18 = tl.at('s18');
        if (t > s18 && layOn) { const v = ((t - s18) / 3.2) % 1; lit(stage, cc => { const [x, y] = pointAt(pts, v); circle(cc, x, y, 9, PAL.warm); circle(cc, x, y, 4.5, CORE(PAL.warm)); }); }
      }
      const S = bnode(BG.S, 0, q), D = bnode(BG.D, 0, q);
      circle(c, S[0], S[1], 12, PAL.casing); circle(c, S[0], S[1], 8, PAL.ink); label(stage, '출발', S[0], S[1] + 36, {size: 26});
      rect(c, D[0] - 11, D[1] - 11, 22, 22, 3, PAL.casing); rect(c, D[0] - 8, D[1] - 8, 16, 16, 2, PAL.ink); label(stage, '도착', D[0], D[1] - 32, {size: 26});
      if (q > 0.5) { const a = smooth((q - 0.5) / 0.5); note(stage, '위층 — 미리 고른 선', 960, BP(21, -3, 1, q)[1] + 26, {size: 26, alpha: a, color: PAL.ink, align: 'right'}); note(stage, '아래층 — 모든 길', 120, BP(-3, 21, 0, q)[1] + 18, {size: 24, alpha: a, align: 'left'}); }
    });
    const s16 = tl.at('s16');
    foot(stage, t < s16 - 0.4 ? '미국 도로망: 연구용 자료(DIMACS) 약 2,400만 점' : '층은 도로 종류가 아니라 계산한 중요도 순서 · 설명 모형', fadeIn(t, sc.start + 0.6, 0.4));
    const nD = d.res.order.length, nA = M.BIGRES.ast.order.length;
    const kD = countAt(d, t), kL = layOn ? countAt(ly, t) : 0;
    if (!layOn) bars(stage, [['다익스트라', kD, nD, PAL.floodHi]], 1);
    else bars(stage, [['다익스트라', nD, nD, rgba(PAL.flood, 0.7)], ['A*', nA, nD, rgba(PAL.flood, 0.7)], ['층 방법', kL, nD, PAL.floodHi]], 1);
  },

  traffic(stage, t, p, ctx) {
    const R = runs(ctx.tl), sc = ctx.scene, c = stage.ctx, tl = ctx.tl, T = M.TRAFFIC;
    const RY = 720, LW = 46;   // 도로 띠
    const enter = fadeIn(t, sc.start, 0.6);
    withAlpha(c, enter, () => {
      rect(c, -10, RY - LW - 26, W + 20, 2 * LW + 52, 0, '#2A292E');
      rect(c, -10, RY - LW - 6, W + 20, 2 * LW + 12, 0, PAL.hwy);
      rect(c, -10, RY - LW, W + 20, 2 * LW, 0, '#56524D');
      line(c, [[0, RY], [W, RY]], rgba(PAL.ink, 0.55), 3, {dash: [34, 30]});
      // 0.5 km 구간 표시(같은 자: 1 m = 2 px)
      const x0 = 40, x1 = 40 + T.segKm * 1000 * T.pxPerM;
      const ry = RY - LW - 44;
      line(c, [[x0, ry], [Math.min(x1, 1040), ry]], PAL.ink, 3, {cap: 'butt'}); line(c, [[x0, ry - 10], [x0, ry + 10]], PAL.ink, 3);
      note(stage, '이 구간 0.5 km →', 150, ry - 24, {size: 26, color: PAL.ink, align: 'left'});
      const cs = M.cars(sc), live = [];
      for (const car of cs) {
        const x = car.x(t); if (x < -100 || x > W + 100) continue;
        const y = RY + (car.lane ? LW / 2 : -LW / 2);
        rect(c, x - 20, y - 12, 40, 24, 6, PAL.car[Math.floor(car.col * 4)], rgba('#000', 0.5), 2);
        rect(c, x + 6, y - 9, 9, 18, 3, rgba('#000', 0.3));
        circle(c, x - 4, y, 4, PAL.cool);   // 차 안의 휴대전화(무광 점)
        if (x > 40 && x < 1040) live.push(car);
      }
      // 위치 알림(빛): 휴대전화에서 위로 — 1.5초마다
      const pg = t > R.ping0 ? M.pings(sc, R.ping0) : [];
      lit(stage, cc => { for (const pp of pg) { if (pp.t > t) break; const u = (t - pp.t) / 0.9; if (u >= 1) continue; const car = cs[pp.car], x = car.x(t) - 4, y = RY + (car.lane ? LW / 2 : -LW / 2); ring(cc, x, y, 8 + 30 * u, rgba(PAL.cool, 1 - u), 3); line(cc, [[x, y - 14 - 160 * u], [x, y - 30 - 160 * u]], rgba(PAL.coolHi, 1 - u), 3); } });
      // 계기: 지금 속도 = 구간 안 차들의 속도 평균(같은 시계) → 무게
      const ga = fadeIn(t, R.ping0 + 0.6, 0.4);
      if (ga > 0) {
        const v = live.length ? live.reduce((a, cr) => a + cr.v, 0) / live.length : M.typicalSpeed(T.nowH);
        withAlpha(c, ga, () => {
          note(stage, '휴대전화들이 알려 준 지금 속도', 540, 410, {size: 28});
          uText(stage, `${Math.round(v)} km/h`, 540, 478, {role: 'display', size: 64, weight: 700, color: PAL.coolHi, align: 'center', ...so});
          note(stage, `선의 무게 = 0.5 km ÷ ${Math.round(v)} km/h = ${(T.segKm / v * 60).toFixed(2)}분`, 540, 544, {size: 28, color: PAL.ink});
        });
      }
    });
    foot(stage, '위치 설정을 켠 기기의 집계 자료 · 구글 발표 · 차는 크게 그림', fadeIn(t, R.ping0, 0.4) * fadeOut(t, R.hist0, 0.3));
    // 지난 기록(설명용 곡선) → 조금 뒤의 예측
    const ha = fadeIn(t, R.hist0, 0.5);
    if (ha > 0) withAlpha(c, ha, () => {
      const X0 = 150, X1 = 960, Y0 = 1210, Y1 = 860, X = h => X0 + (X1 - X0) * h / 24, Y = v => Y0 + (Y1 - Y0) * v / 100;
      unlitRect(stage, 60, 820, 960, 420, 1);
      rect(c, 60, 820, 960, 416, 12, rgba('#141417', 0.85), rgba(PAL.border, 1), 2);
      line(c, [[X0, Y0], [X1, Y0]], PAL.muted, 2); line(c, [[X0, Y0], [X0, Y1]], PAL.muted, 2);
      for (const h of [6, 12, 18]) { uText(stage, `${h}시`, X(h), Y0 - 20, {size: 24, color: PAL.muted, align: 'center'}); }
      uText(stage, '90', X0 - 16, Y(90), {size: 24, color: PAL.muted, align: 'right'}); uText(stage, '30', X0 - 16, Y(30), {size: 24, color: PAL.muted, align: 'right'});
      uText(stage, '지난 기록 · 이 구간의 보통 속도(km/h)', 80, 850, {size: 26, weight: 500, color: PAL.coolHi});
      const u = clamp((t - R.hist0) / 2.0), pts = [];
      for (let h = 0; h <= 24 * u + 1e-9; h += 0.25) pts.push([X(h), Y(M.typicalSpeed(h))]);
      if (pts.length > 1) line(c, pts, PAL.cool, 4, {dash: [10, 7]});
      const nx = X(T.nowH), nv = M.typicalSpeed(T.nowH), ax = X(T.aheadH), av = M.typicalSpeed(T.aheadH);
      const na = fadeIn(t, R.hist0 + 1.2, 0.3), pa = fadeIn(t, R.predict, 0.4);
      withAlpha(c, na, () => { line(c, [[nx, Y0], [nx, Y(100)]], rgba(PAL.ink, 0.5), 2); circle(c, nx, Y(nv), 9, PAL.ink); uText(stage, '지금 16시', nx - 14, Y(100) + 4, {size: 24, color: PAL.ink, align: 'right'}); });
      withAlpha(c, pa, () => {
        line(c, [[nx, Y(nv)], [ax, Y(av)]], PAL.warmHi, 3, {dash: [6, 6]}); circle(c, ax, Y(av), 10, PAL.warmHi);
        uText(stage, `18시 예측 약 ${Math.round(av)} km/h`, ax + 18, Y(av) + 30, {size: 26, weight: 700, color: PAL.warmHi});
        uText(stage, `→ ${(T.segKm / av * 60).toFixed(2)}분`, ax + 18, Y(av) + 66, {size: 26, weight: 700, color: PAL.warmHi});
      });
    });
    foot(stage, '지난 기록 곡선은 설명용 값 · 예측은 기계 학습(구글 발표)', ha);
  },

  detour(stage, t, p, ctx) {
    const R = runs(ctx.tl), run = R.detour, tl = ctx.tl;
    const jam = fadeIn(t, R.jamOn, 0.5) * fadeOut(t, R.jamOff, 0.5), after = fadeIn(t, R.jamOff, 0.5);
    const ru = routeU(run, t);
    town(stage, t, {run: after < 1 ? run : null, blocks: 0.45, floodA: 0.36 * (1 - after), nodesA: 0.7, jam, route: {pts: ROUTE_JAM, u: ru, a: 1 - after},
      dashed: [[ROUTE_FREE, fadeIn(t, R.jamOn, 0.4) * (1 - after), rgba(PAL.muted, 0.9)], [ROUTE_JAM, after, rgba(PAL.ink, 0.85)]]});
    if (after > 0) withCam(stage, CAM.full, () => lit(stage, cc => { withAlpha(cc, after, () => { line(cc, ROUTE_FREE, PAL.warm, 11); line(cc, ROUTE_FREE, CORE(PAL.warm), 4); }); }));
    if (jam > 0) { const top = toS(CAM.full, 540, 318); note(stage, `고속도로 막힘 · ${Math.round(M.SPEED.hwy * M.JAM.jamFactor)} km/h`, top[0], top[1] + 44, {size: 28, color: PAL.coolHi, alpha: jam, weight: 700}); }
    const ja = fadeIn(t, run.path1, 0.3) * (1 - after);
    if (ja > 0) gauge(stage, [['막혔을 때 고속도로 길', `${fmt1(M.RES.hwyStatsJam.min)}분`, PAL.coolHi], ['피해 가는 시내 길', `${fmt1(M.RES.jamStats.min)}분`, PAL.warmHi]], ja);
    if (after > 0) {
      const tS = M.RES.townStatsFree, fS = M.RES.freeStats;
      gauge(stage, [['시내 길', `${fmt1(tS.km)} km · ${fmt1(tS.min)}분`], ['고속도로 길', `${fmt1(fS.km)} km · ${fmt1(fS.min)}분`, PAL.warmHi]], after);
      note(stage, '짧다', toS(CAM.full, 560, 700)[0], toS(CAM.full, 560, 700)[1] - 30, {size: 28, color: PAL.ink, alpha: after, weight: 700});
      note(stage, '빠르다', 420, 356, {size: 28, color: PAL.warmHi, alpha: fadeIn(t, tl.at('s24'), 0.4), weight: 700});
    }
    if (t < R.jamOn) gauge(stage, [['평소의 가장 빠른 길', `${fmt1(M.RES.freeStats.min)}분`, PAL.warmHi]], 1);
  },

  close(stage, t, p, ctx) {
    const R = runs(ctx.tl), run = R.close, c = stage.ctx, last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
    const cam = camMix(CAM.full, {z: 0.75, fx: 540, fy: 560}, easeInOut((t - ctx.scene.start) / 1.0));
    town(stage, t, {cam, run, blocks: 0.6, floodA: 0.36, nodesA: 0.8, grow: 0.15, route: {pts: ROUTE_FREE, u: routeU(run, t), a: 1}});
    const ea = fadeIn(t, ctx.scene.start + 0.5, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 250, W, 270, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 250, 0, 520); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.8)'); g.addColorStop(0.85, 'rgba(9,9,11,0.8)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 250, W, 270);
        ['길찾기는, 도로를 점과 선으로 바꾸고,', '걸리는 시간의 합이 가장 작은 선들을 고르는 계산'].forEach((s, i) => stage.text(s, 540, 316 + i * 62, {role: 'display', weight: 700, size: 44, color: i === 1 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 1000, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 458, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, last.start, 0.5)});
      });
    }
  },
};

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { captionBand(stage.ctx); unlitRect(stage, 0, 1236, W, 684, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); hookKicker(stage, t, ctx, MO); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1236, W, 684, 1); unlitRect(stage, 0, 0, W, 112, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') { headList(stage, t, L, 1); withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return; }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
function hookKicker(stage, t, ctx, MO) {
  const L = titleList('hook', ctx);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const s = L[k][1];
  if (s) { unlitRect(stage, 0, 60, W, 70, 1); stage.text(s, 540, 96, {role: 'display', weight: 500, size: 28, color: PAL.warmHi, align: 'center', ...so}); }
}
