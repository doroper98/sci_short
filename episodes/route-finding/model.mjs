// 51 구글맵 길찾기 — 한 모형(같은 시계). scenes.mjs(그림)와 make_sound.mjs(소리)가 모두 여기서 읽는다.
// 설명 모형: 가상의 도로망(실제 도시 아님). 선의 무게 = 길이 ÷ 그 길의 속도(신호 대기·회전 없음). 속도는 설명용 값.
// 다익스트라·A* 는 교과서 그대로(무게가 음수가 아님, A* 어림 = 남은 직선거리 ÷ 가장 빠른 속도 → 실제보다 크지 않음).
// '층' 방법은 단순화한 모형: 여러 출발·도착 쌍의 가장 빠른 길에 자주 쓰인 선을 미리 세어 위층으로 올리고(계산한 중요도),
// 출발 동네·도착 동네 안에서만 아래층을 살핀 뒤 위층만 따라간다. 실제 축약 계층(Geisberger 2008)과는 다르다 — 화면 각주.

// ------------------------------------------------------------------ 공통
export const SPEED = {local: 20, art: 40, ramp: 50, hwy: 90};        // km/h (설명용 값)
export const VMAX = SPEED.hwy;
export const PX_PER_KM = 200;                                         // 동네 무대: 100 px = 0.5 km
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += hyp(pts[i - 1], pts[i]); return L; }

/** graph: {nodes:[{x,y,...}], edges:[{a,b,cls,pts,km}], adj} — minutes(e, state) 로 무게 */
function finish(g, pxPerKm) {
  g.adj = g.nodes.map(() => []);
  g.edges.forEach((e, k) => {
    e.id = k; e.pts = e.pts || [[g.nodes[e.a].x, g.nodes[e.a].y], [g.nodes[e.b].x, g.nodes[e.b].y]];
    e.km = polyLen(e.pts) / pxPerKm;
    g.adj[e.a].push(k); g.adj[e.b].push(k);
  });
  g.pxPerKm = pxPerKm;
  return g;
}
export function minutes(e, state = {}) {
  const v = SPEED[e.cls] * (state.jam && e.jam ? state.jamFactor ?? 0.18 : 1);
  return e.km / v * 60;
}

// ------------------------------------------------------------------ 동네 무대(한 도시 + 둘레 고속도로)
export const TOWN = (() => {
  const NX = 8, NY = 7, X0 = 190, Y0 = 400, D = 100, R = rnd(51), g = {nodes: [], edges: []};
  const id = (i, j) => j * NX + i;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const edge = i === 0 || j === 0 || i === NX - 1 || j === NY - 1;
    const jx = (R() - 0.5) * (edge ? 6 : 16), jy = (R() - 0.5) * (edge ? 6 : 16);
    g.nodes.push({x: X0 + i * D + jx, y: Y0 + j * D + jy, i, j, kind: 'grid'});
  }
  const ART_ROW = 3, ART_COL = 4;
  const drop = new Set(['2,1-3,1', '5,4-5,5', '1,2-1,3', '6,5-7,5', '3,5-3,6', '6,2-7,2', '2,4-3,4', '5,0-5,1', '0,3-1,3', '4,1-5,1']);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (i + 1 < NX && !drop.has(`${i},${j}-${i + 1},${j}`)) g.edges.push({a: id(i, j), b: id(i + 1, j), cls: j === ART_ROW ? 'art' : 'local'});
    if (j + 1 < NY && !drop.has(`${i},${j}-${i},${j + 1}`)) g.edges.push({a: id(i, j), b: id(i, j + 1), cls: i === ART_COL ? 'art' : 'local'});
  }
  // 둘레 고속도로: 모서리를 둥글린 사각형. 교차로(나들목)만 점, 그 사이는 굽은 선(pts)
  const L = 88, T = 318, Rt = 992, B = 1082, rc = 70;
  const ring = [];   // 둘레를 따라 시계 방향 표본점(위 왼쪽 모서리 끝에서 시작)
  const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; ring.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); } };
  const seg = (a, b) => { const n = Math.max(2, Math.round(hyp(a, b) / 20)); for (let k = 1; k < n; k++) ring.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); };
  arc(L + rc, T + rc, Math.PI, 1.5 * Math.PI); seg([L + rc, T], [Rt - rc, T]);
  arc(Rt - rc, T + rc, 1.5 * Math.PI, 2 * Math.PI); seg([Rt, T + rc], [Rt, B - rc]);
  arc(Rt - rc, B - rc, 0, 0.5 * Math.PI); seg([Rt - rc, B], [L + rc, B]);
  arc(L + rc, B - rc, 0.5 * Math.PI, Math.PI); seg([L, B - rc], [L, T + rc]);
  g.ring = ring;
  // 나들목: 격자 가장자리 점 → 둘레 위의 가장 가까운 표본점
  const ramps = [[0, 5], [0, 1], [3, 0], [6, 0], [7, 3], [4, 6], [1, 6]];
  const junc = ramps.map(([i, j]) => {
    const n = g.nodes[id(i, j)]; let best = 0, bd = 1e9;
    ring.forEach((p, k) => { const d = hyp(p, [n.x, n.y]); if (d < bd) { bd = d; best = k; } });
    return {grid: id(i, j), k: best};
  }).sort((a, b) => a.k - b.k);
  junc.forEach(jn => { const p = ring[jn.k]; jn.node = g.nodes.length; g.nodes.push({x: p[0], y: p[1], kind: 'hwy'}); g.edges.push({a: jn.grid, b: jn.node, cls: 'ramp'}); });
  for (let q = 0; q < junc.length; q++) {
    const A = junc[q], Bn = junc[(q + 1) % junc.length], pts = [];
    for (let k = A.k; ; k = (k + 1) % ring.length) { pts.push(ring[k]); if (k === Bn.k) break; }
    g.edges.push({a: A.node, b: Bn.node, cls: 'hwy', pts});
  }
  g.S = id(1, 5); g.D = id(6, 1); g.NX = NX; g.NY = NY; g.id = id; g.D0 = D; g.X0 = X0; g.Y0 = Y0;
  // 막힘(detour): 위쪽 고속도로 — S 쪽 왼편 나들목에서 D 쪽 위 나들목까지의 둘레 선
  finish(g, PX_PER_KM);
  // 블록: 격자 칸(무광 덩어리)
  g.blocks = [];
  for (let j = 0; j + 1 < NY; j++) for (let i = 0; i + 1 < NX; i++) g.blocks.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
  return g;
})();

// ------------------------------------------------------------------ 탐색(다익스트라 / A*)
/** 기록이 가장 작은 점부터 하나씩 확정. order[k] = {n, g, f, parent}, relax[] = {from, to, g, k}(k 번째 확정 때 고침) */
export function search(g, s, d, {state = {}, heur = null, upTo = null} = {}) {
  const N = g.nodes.length, best = new Array(N).fill(Infinity), par = new Array(N).fill(-1), done = new Array(N).fill(false);
  const h = n => heur ? heur(n) : 0;
  best[s] = 0; const order = [], relax = [];
  for (;;) {
    let u = -1, uf = Infinity;
    for (let n = 0; n < N; n++) if (!done[n] && best[n] < Infinity && (!upTo || upTo(n))) { const f = best[n] + h(n); if (f < uf - 1e-12 || (Math.abs(f - uf) < 1e-12 && n < u)) { uf = f; u = n; } }
    if (u < 0) break;
    done[u] = true; order.push({n: u, g: best[u], f: uf, parent: par[u], via: par[u] >= 0 ? edgeBetween(g, par[u], u) : -1});
    if (u === d) break;
    for (const k of g.adj[u]) {
      const e = g.edges[k], v = e.a === u ? e.b : e.a;
      if (done[v] || (upTo && !upTo(v))) continue;
      const w = (e.w ?? minutes(e, state)), nv = best[u] + w;
      if (nv < best[v] - 1e-12) { best[v] = nv; par[v] = u; relax.push({from: u, to: v, g: nv, k: order.length - 1, e: k}); }
    }
  }
  const path = []; if (d != null && done[d]) { for (let n = d; n >= 0; n = par[n]) path.unshift(n); }
  return {order, relax, path, best, par, reached: d != null && done[d]};
}
export function edgeBetween(g, a, b) { for (const k of g.adj[a]) { const e = g.edges[k]; if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return k; } return -1; }
export function pathStats(g, path, state = {}) {
  let km = 0, min = 0; const es = [];
  for (let i = 1; i < path.length; i++) { const k = edgeBetween(g, path[i - 1], path[i]), e = g.edges[k]; km += e.km; min += minutes(e, state); es.push(k); }
  return {km, min, edges: es};
}
export const astarHeur = (g, d) => n => hyp([g.nodes[n].x, g.nodes[n].y], [g.nodes[d].x, g.nodes[d].y]) / g.pxPerKm / VMAX * 60;

// 동네 무대의 결과(평소 / 막힘)
export const JAM = {jam: true, jamFactor: 0.16};
// 막힘(detour): 둘레 고속도로 전체 — 'jam' 표시가 붙은 선만 느려진다
TOWN.edges.forEach(e => { if (e.cls === 'hwy') e.jam = true; });
export const RES = {
  free: search(TOWN, TOWN.S, TOWN.D),
  astar: search(TOWN, TOWN.S, TOWN.D, {heur: astarHeur(TOWN, TOWN.D)}),
  jam: search(TOWN, TOWN.S, TOWN.D, {state: JAM}),
};
RES.freeStats = pathStats(TOWN, RES.free.path);
RES.jamStats = pathStats(TOWN, RES.jam.path, JAM);
RES.townStatsFree = pathStats(TOWN, RES.jam.path);          // 시내 길을 평소에 달리면
RES.hwyStatsJam = pathStats(TOWN, RES.free.path, JAM);      // 고속도로 길을 막혔을 때 달리면
// 거리로만 잰 가장 짧은 길(무게 = 거리)
RES.shortest = (() => { const sv = TOWN.edges.map(e => e.w); TOWN.edges.forEach(e => { e.w = e.km; }); const r = search(TOWN, TOWN.S, TOWN.D); TOWN.edges.forEach((e, k) => { e.w = sv[k]; }); return r; })();
RES.shortStats = pathStats(TOWN, RES.shortest.path);

// ------------------------------------------------------------------ 큰 도로망(층 장면)
export const BIG = (() => {
  // 3×3 동네, 동네마다 5×5 격자(0.5 km 간격, 가운데 줄·칸이 큰길), 동네 사이를 고속도로가 잇는다. 단위 km.
  const g = {nodes: [], edges: [], town: []}, R = rnd(7), SP = 9, n5 = 5, d = 0.5;
  const tid = [];
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
    const cx = tx * SP, cy = ty * SP, base = g.nodes.length, T = ty * 3 + tx;
    for (let j = 0; j < n5; j++) for (let i = 0; i < n5; i++) g.nodes.push({x: cx + (i - 2) * d + (R() - 0.5) * 0.12, y: cy + (j - 2) * d + (R() - 0.5) * 0.12, town: T, i, j, kind: 'grid'});
    for (let j = 0; j < n5; j++) for (let i = 0; i < n5; i++) {
      const id = base + j * n5 + i;
      if (i + 1 < n5) g.edges.push({a: id, b: id + 1, cls: j === 2 ? 'art' : 'local'});
      if (j + 1 < n5) g.edges.push({a: id, b: id + n5, cls: i === 2 ? 'art' : 'local'});
    }
    tid.push(base);
  }
  // 나들목: 동네 가장자리 가운데 점(위·아래·왼·오른) 바깥 0.8 km 에 고속도로 점
  const J = {};
  const side = {L: [0, 2, -1, 0], R: [4, 2, 1, 0], U: [2, 0, 0, -1], Dn: [2, 4, 0, 1]};
  for (let T = 0; T < 9; T++) for (const [k, [i, j, dx, dy]] of Object.entries(side)) {
    const gn = g.nodes[tid[T] + j * n5 + i], id = g.nodes.length;
    g.nodes.push({x: gn.x + dx * 0.8, y: gn.y + dy * 0.8, town: T, kind: 'hwy'});
    g.edges.push({a: tid[T] + j * n5 + i, b: id, cls: 'ramp'});
    J[`${T}${k}`] = id;
  }
  // 동네 사이 고속도로(가로·세로 이웃), 동네 안 나들목끼리는 둘러 가는 고속도로가 없음
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
    const T = ty * 3 + tx;
    if (tx < 2) g.edges.push({a: J[`${T}R`], b: J[`${T + 1}L`], cls: 'hwy'});
    if (ty < 2) g.edges.push({a: J[`${T}Dn`], b: J[`${T + 3}U`], cls: 'hwy'});
  }
  // 바깥쪽 나들목도 서로 잇는 짧은 순환로(동네 둘레)
  for (let T = 0; T < 9; T++) {
    const q = ['U', 'R', 'Dn', 'L'];
    for (let m = 0; m < 4; m++) {
      const a = J[`${T}${q[m]}`], b = J[`${T}${q[(m + 1) % 4]}`], A = g.nodes[a], B = g.nodes[b];
      const corner = (q[m] === 'U' || q[m] === 'Dn') ? [B.x, A.y] : [A.x, B.y];
      g.edges.push({a, b, cls: 'hwy', pts: [[A.x, A.y], corner, [B.x, B.y]]});
    }
  }
  finish(g, 1);
  g.S = tid[6] + 3 * n5 + 1;   // 왼쪽 아래 동네
  g.D = tid[2] + 1 * n5 + 3;   // 오른쪽 위 동네
  g.tid = tid;
  // 미리 계산: 서로 다른 동네의 쌍 72개(동네마다 정해진 점 둘)의 가장 빠른 길에서 각 선이 몇 번 쓰였는지
  const use = g.edges.map(() => 0), pick = [6, 18];
  let pairs = 0;
  for (let A = 0; A < 9; A++) for (let B = 0; B < 9; B++) if (A !== B) for (const pa of pick) {
    const pb = pick[(A + B) % 2], r = search(g, tid[A] + pa, tid[B] + pb);
    for (const k of pathStats(g, r.path).edges) use[k]++;
    pairs++;
  }
  g.use = use; g.pairs = pairs;
  const TH = Math.ceil(pairs * 0.05);
  g.edges.forEach((e, k) => { e.up = use[k] >= TH; });
  g.upNode = g.nodes.map((_, n) => g.adj[n].some(k => g.edges[k].up));
  return g;
})();

export const BIGRES = (() => {
  const g = BIG, dij = search(g, g.S, g.D), ast = search(g, g.S, g.D, {heur: n => Math.hypot(g.nodes[n].x - g.nodes[g.D].x, g.nodes[n].y - g.nodes[g.D].y) / VMAX * 60});
  // 층 방법: ① 출발 동네 안(아래층)만 살핌 → 위층 점에 닿은 기록 ② 위층만 살핌 ③ 도착 동네 안(아래층) — 여기서는 ①②③을 한 탐색으로:
  // 확정해도 되는 점 = 출발 동네의 점, 도착 동네의 점, 위층의 점. 위층 선만 따라가도록 아래층 선은 두 동네 안에서만 쓴다.
  const sT = g.nodes[g.S].town, dT = g.nodes[g.D].town;
  const sv = g.edges.map(e => e.w);
  g.edges.forEach(e => { const inEnds = [g.nodes[e.a].town, g.nodes[e.b].town].every(T => T === sT) || [g.nodes[e.a].town, g.nodes[e.b].town].every(T => T === dT); e.w = (e.up || inEnds) ? undefined : Infinity; });
  const lay = search(g, g.S, g.D, {upTo: n => g.upNode[n] || g.nodes[n].town === sT || g.nodes[n].town === dT});
  g.edges.forEach((e, k) => { e.w = sv[k]; });
  return {dij, ast, lay, dijStats: pathStats(g, dij.path), layStats: pathStats(g, lay.path), same: dij.path.join() === lay.path.join()};
})();

// ------------------------------------------------------------------ 기원 장면: 두 도시를 잇는 작은 그물(거리 무게, 단순화한 지도 — 실제 지도 아님)
export const ORIGIN = (() => {
  const P = [[300, 470], [470, 420], [640, 450], [800, 400], [360, 640], [560, 600], [740, 620], [880, 560], [250, 830], [450, 800], [650, 820], [830, 790], [380, 990], [600, 980], [800, 990]];
  const E = [[0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [3, 7], [2, 6], [4, 5], [5, 6], [6, 7], [4, 8], [4, 9], [5, 9], [5, 10], [6, 10], [7, 11], [6, 11], [8, 9], [9, 10], [10, 11], [8, 12], [9, 12], [9, 13], [10, 13], [10, 14], [11, 14], [12, 13], [13, 14]];
  const g = finish({nodes: P.map(([x, y]) => ({x, y})), edges: E.map(([a, b]) => ({a, b, cls: 'local'}))}, 100);
  g.edges.forEach(e => { e.w = e.km; });
  g.S = 12; g.D = 3;
  return g;
})();
export const ORIGRES = search(ORIGIN, ORIGIN.S, ORIGIN.D);

// ------------------------------------------------------------------ 지난 기록(교통 장면 — 설명용 곡선): 하루 동안 이 구간의 보통 속도
export function typicalSpeed(h) {   // h = 0..24 시
  const dip = (c, w, a) => a * Math.exp(-0.5 * ((h - c) / w) ** 2);
  return 90 - dip(8.2, 0.9, 48) - dip(18.2, 1.0, 55) - dip(13, 2.5, 8);
}
export const TRAFFIC = {segKm: 0.5, nowH: 16.0, aheadH: 18.0, pxPerM: 2, x0: -90, x1: 1170};
/** 교통 장면의 차(실제 빠르기): 1초마다 한 대(차로마다 2초 간격), 두 차로. 속도 = 지금 시각의 보통 속도 ± 4 km/h. 휴대전화는 1.5초마다 위치를 알린다. */
export function cars(scene) {
  const out = [], R = rnd(16), v0 = typicalSpeed(TRAFFIC.nowH);
  for (let k = 0, ts = scene.start - 26; ts < scene.end; k++, ts += 1.0) {
    const v = v0 + (R() - 0.5) * 8, lane = k % 2, off = R() * 1.5, col = R();
    out.push({k, ts, v, lane, off, col, x: t => TRAFFIC.x0 + (t - ts) * v / 3.6 * TRAFFIC.pxPerM});
  }
  return out;
}
export function pings(scene, tFrom) {
  const out = [];
  for (const c of cars(scene)) for (let tp = c.ts + c.off; tp < scene.end - 0.3; tp += 1.5) { if (tp < tFrom) continue; const x = c.x(tp); if (x > 60 && x < 1020) out.push({t: tp, car: c.k, x, lane: c.lane}); }
  return out.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ 실행 계획(같은 시계)
/** run = {key, res, t0, rate(점/초)}: k 번째 확정 시각 = t0 + k / rate. */
export function settleTime(run, k) { return run.t0 + k / run.rate; }
export function runEnd(run) { return settleTime(run, run.res.order.length - 1); }
export function plan(tl) {
  const S = id => tl.sentences.find(s => s.id === id), sc = id => tl.scenes.find(s => s.id === id);
  const word = (id, w) => { const s = S(id), tts = s.tts || s.text, i = tts.indexOf(w); if (i < 0) throw new Error(`no word ${w} in ${id}`); return s.chars[i].start; };
  const nF = RES.free.order.length;
  const R = {};
  R.hook0 = {key: 'hook0', res: RES.free, t0: 0.05, rate: (nF - 1) / 1.45};
  R.hook0.path0 = runEnd(R.hook0) + 0.02; R.hook0.path1 = R.hook0.path0 + 0.3;
  R.hookApp = {t: word('s02', '그려집니다') - 0.1, pin: word('s02', '목적지를')};
  const o0 = S('s03').start + 1.6, o1 = word('s04', '떠올린');
  R.origin = {key: 'origin', res: ORIGRES, t0: o0, rate: (ORIGRES.order.length - 1) / (o1 - o0)};
  R.origin.path0 = runEnd(R.origin) + 0.1; R.origin.path1 = R.origin.path0 + 0.8;
  R.yearPub = word('s04', '삼년');
  // 다익스트라: s08 '확정해' 무렵부터, 목적지가 s11 '확정되는' 무렵 확정
  const dj0 = word('s08', '확정해') - 0.2, dj1 = word('s11', '확정되는');
  R.dijkstra = {key: 'dijkstra', res: RES.free, t0: dj0, rate: (nF - 1) / (dj1 - dj0)};
  R.dijkstra.path0 = word('s11', '거꾸로') - 0.1; R.dijkstra.path1 = R.dijkstra.path0 + 1.6;
  // A*: 다익스트라와 같은 빠르기(같은 1초에 N개) — 확정 수를 견준다
  const a0 = S('s13').start + 0.5;
  R.astar = {key: 'astar', res: RES.astar, t0: a0, rate: R.dijkstra.rate * 1.25};
  R.astar.path0 = Math.max(runEnd(R.astar) + 0.15, S('s14').start + 0.6); R.astar.path1 = R.astar.path0 + 1.2;
  // 큰 도로망
  const nB = BIGRES.dij.order.length, nL = BIGRES.lay.order.length;
  R.bigDij = {key: 'bigDij', res: BIGRES.dij, t0: S('s15').start + 1.2, rate: (nB - 1) / (S('s15').end - 0.2 - (S('s15').start + 1.2))};
  R.bigDij.path0 = runEnd(R.bigDij) + 0.1; R.bigDij.path1 = R.bigDij.path0 + 0.6;
  R.lift = {t0: word('s16', '위층으로') - 0.8, t1: word('s16', '위층으로') + 0.8};
  const l0 = S('s17').start + 0.4;
  R.bigLay = {key: 'bigLay', res: BIGRES.lay, t0: l0, rate: R.bigDij.rate * 0.5};
  R.bigLay.path0 = runEnd(R.bigLay) + 0.15; R.bigLay.path1 = R.bigLay.path0 + 0.8;
  // 막힘
  R.ping0 = word('s20', '위치') - 0.4; R.hist0 = S('s21').start - 0.2; R.predict = word('s21', '예측한다고') - 0.3;
  R.jamOn = S('s22').start + 0.3;
  const jr0 = word('s22', '같은') - 0.2;
  R.detour = {key: 'detour', res: RES.jam, t0: jr0, rate: (RES.jam.order.length - 1) / (word('s22', '고릅니다') - 0.3 - jr0)};
  R.detour.path0 = runEnd(R.detour) + 0.05; R.detour.path1 = R.detour.path0 + 0.7;
  R.jamOff = S('s23').start - 0.3;
  R.close = {key: 'close', res: RES.free, t0: sc('close').start + 0.3, rate: (nF - 1) / 2.6};
  R.close.path0 = runEnd(R.close) + 0.05; R.close.path1 = R.close.path0 + 0.5;
  return R;
}
