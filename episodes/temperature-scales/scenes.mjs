// Episode scenes — worked example: "얼음은 왜 물에 뜰까?"
// Replace the content, keep the shape: export {theme, scenes, overlays?, titles?, captionLayout?, events?}.
// Each scene: (stage, t, p, ctx) where p = 0..1 progress inside the scene,
// ctx = {tl (Timeline), events (resolved, shared with sound.json), theme, scene (sceneAt result), local (s since scene start)}.
// Model notes (record simplifications here, not only in the brief):
//  - Densities: ice Ih 0.917 g/cm³, liquid water ≈1.000 g/cm³ near 0 °C → ≈8% of a floating cube above the surface.
//  - Lattice: a single puckered hexagonal layer; real ice Ih is 3D. One H per O–O link (ice rule); H that bond to the
//    next (undrawn) layer point out of plane. Sizes and the 0.35 O–H/O···O ratio are schematic.
//  - Molecule counts in the comparison box follow the density ratio (22/24 ≈ 0.92); illustrative, not a simulation.
import {
  header, progressBar, sourceLine, endCard, drawLabel, leader, scaleBar,
  project, lambert, DrawQueue, rgba, mix, clamp, lerp, smooth, easeOut, rand, poly, line, circle, ring, sphere, glow,
  withAlpha, clipRect, rect, TAU,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';   // 'noturno' (default) | 'slate' | 'graphite' | 'navy' | {base:'noturno', accent:'#…'}

// Visual-only events (sound events live in sound.json; both are merged into ctx.events).
export const events = [];

// Caption position per scene (baseline of the last caption line). Default ≈ 1480 for 1920 height.
export const captionLayout = {
  // default: {plate: true},          // square backing plate for every scene (default is shadowed text, no plate)
  // phenomenon: {y: 1480, plate: true},
};

export const titles = {
  hook: ['물리 · 상태 변화', '얼음은 왜\n물에 뜰까?', ''],
  origin: ['분자 하나', '물 분자의 모양', '산소 하나, 수소 둘'],
  mechanism: ['얼 때 일어나는 일', '수소 결합이\n만드는 틀', ''],
  phenomenon: ['같은 부피 비교', '틈이 많으면\n더 가볍다', ''],
  close: ['', '', ''],
};

// ---------- shared model ----------
const RHO_ICE = 0.917, RHO_WATER = 1.0;
const ABOVE = 1 - RHO_ICE / RHO_WATER; // fraction of a floating cube above the surface (≈0.083)
const ICE = '#CFEFFF', WATER = '#2D6E8E', O_COL = '#E86A4A', H_COL = '#F3EEE6';

// rotate a direction like project() does (angle about y, then tilt) → view-space normal
function viewNormal([x, y, z], angle, tilt) {
  const xx = x * Math.cos(angle) + z * Math.sin(angle), zz = -x * Math.sin(angle) + z * Math.cos(angle);
  return [xx, y * Math.cos(tilt) - zz * Math.sin(tilt), y * Math.sin(tilt) + zz * Math.cos(tilt)];
}

/** A translucent ice cube floating in a water tank, all in one projected 3D space.
 *  The tank camera is fixed (stable view for comparison); only the cube spins about its vertical axis. */
function tank(stage, t, {cx = 500, cy = 930, scale = 112, angle = 0.22, tilt = 0.24, spin = 0.5 + t * 0.12, bob = 0.03, pulse = 0} = {}) {
  const {ctx} = stage, cam = {angle, tilt, scale, cx, cy, distance: 14};
  const P = v => project(v, cam);
  const rotY = ([x, y, z]) => [x * Math.cos(spin) + z * Math.sin(spin), y, -x * Math.sin(spin) + z * Math.cos(spin)];
  const ys = 1 - 2 * ABOVE + Math.sin(t * 1.3) * bob; // water surface height in cube units (cube spans y -1..1)
  const X = 2.9, Z = 1.7, B = -2.5;
  const quad = (pts, fill, stroke) => poly(ctx, pts.map(P), fill, stroke, 1.5);
  // back wall, floor and water body behind the cube
  quad([[-X, B, -Z], [X, B, -Z], [X, 1.2, -Z], [-X, 1.2, -Z]], rgba('#0b2a36', 0.6), rgba(stage.theme.border, 0.9));
  quad([[-X, B, -Z], [-X, B, Z], [X, B, Z], [X, B, -Z]], rgba('#06202a', 0.9));
  quad([[-X, ys, -Z], [X, ys, -Z], [X, B, -Z], [-X, B, -Z]], rgba(WATER, 0.35));
  quad([[-X, ys, -Z], [-X, ys, Z], [-X, B, Z], [-X, B, -Z]], rgba(WATER, 0.25), rgba('#9fe0ff', 0.25));
  // surface plane with ripples
  quad([[-X, ys, -Z], [X, ys, -Z], [X, ys, Z], [-X, ys, Z]], rgba('#5fb2d4', 0.22), rgba('#9fe0ff', 0.35));
  for (let k = 0; k < 5; k++) {
    const z = -Z + (k + 0.5) * (2 * Z / 5), pts = [];
    for (let i = 0; i <= 40; i++) { const x = -X + i * (2 * X / 40); pts.push(P([x, ys + 0.015 * Math.sin(x * 3 + t * 2 + k), z])); }
    line(ctx, pts, rgba('#bfefff', 0.12), 1.5);
  }
  // contact-free shadow of the cube on the tank floor (depth cue)
  const sh = P([0, B, 0]);
  ctx.save(); ctx.translate(sh[0], sh[1]); ctx.scale(1, 0.22); glow(ctx, 0, 0, scale * 1.5, '#000000', 0.5); ctx.restore();
  // cube: translucent faces sorted back → front
  const s = 1, V = [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]].map(rotY);
  const F = [[[0, 1, 2, 3], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 4, 7, 3], [-1, 0, 0]], [[1, 5, 6, 2], [1, 0, 0]], [[3, 2, 6, 7], [0, 1, 0]], [[0, 1, 5, 4], [0, -1, 0]]];
  const pv = V.map(P), q = new DrawQueue();
  for (const [ids, n] of F) {
    const z = ids.reduce((a, i) => a + pv[i][2], 0) / 4, br = lambert(viewNormal(rotY(n), angle, tilt), [-0.5, 0.8, 0.6]);
    q.push(z, () => poly(ctx, ids.map(i => pv[i]), rgba(mix('#5d8ea3', ICE, br), 0.30 + 0.35 * br), rgba('#f2fbff', 0.25 + 0.5 * br), 2));
  }
  q.flush();
  // waterline on the cube, then the front/right water faces tint the submerged part
  poly(ctx, [[-s, ys, s], [s, ys, s], [s, ys, -s], [-s, ys, -s]].map(v => P(rotY(v))), null, rgba('#e9fbff', 0.6), 2);
  quad([[-X, ys, Z], [X, ys, Z], [X, B, Z], [-X, B, Z]], rgba(WATER, 0.42), rgba('#9fe0ff', 0.5));
  quad([[X, ys, Z], [X, ys, -Z], [X, B, -Z], [X, B, Z]], rgba(WATER, 0.3), rgba('#9fe0ff', 0.4));
  for (const [a, b] of [[[-X, 1.2, Z], [-X, B, Z]], [[X, 1.2, Z], [X, B, Z]], [[X, 1.2, -Z], [X, 1.2, Z]], [[-X, 1.2, Z], [X, 1.2, Z]]]) line(ctx, [P(a), P(b)], rgba(stage.theme.border, 1), 2);
  if (pulse > 0) { const c = P([0, ys, Z * 0.6]); ring(ctx, c[0], c[1], 40 + 160 * (1 - pulse), rgba('#bfefff', pulse * 0.8), 3); }
  return {P: v => P(rotY(v)), Ptank: P, ys};
}

function molecule(ctx, x, y, r, dirs, a = 1) {
  // dirs: unit 2D directions of the two O–H bonds in screen space
  for (const [dx, dy] of dirs) sphere(ctx, x + dx * r * 1.15, y + dy * r * 1.15, r * 0.55, H_COL, {alpha: a, shade: '#5d6670'});
  sphere(ctx, x, y, r, O_COL, {alpha: a, shade: '#4a1a10'});
}

// honeycomb layer: points with bond length 1, puckered ±0.22 in z by sublattice
const LATTICE = (() => {
  const pts = [], R = 3.2;
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
    const ax = i * Math.sqrt(3) + j * Math.sqrt(3) / 2, ay = j * 1.5;
    for (const [dx, dy, sub] of [[0, 0, 0], [0, 1, 1]]) { const x = ax + dx, y = ay + dy - 0.5; if (Math.hypot(x, y * 1.05) < R) pts.push({x, y, z: sub ? -0.22 : 0.22}); }
  }
  const bonds = [];
  pts.forEach((a, i) => pts.forEach((b, j) => { if (j > i && Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 1) < 0.02) bonds.push([i, j]); }));
  // Ice rule: each O–O link carries exactly one H, and each O donates two H. Greedy orientation keeps donors ≤ 2;
  // an O with only one in-plane H gets its second H pointing out of the layer (towards the next, undrawn layer).
  const donors = pts.map(() => 0), hb = [];
  for (const [i, j] of bonds) { const d = donors[i] <= donors[j] ? i : j, a = d === i ? j : i; if (donors[d] < 2) { donors[d]++; hb.push([d, a]); } else { donors[a]++; hb.push([a, d]); } }
  pts.forEach((p, i) => { p.out = 2 - donors[i]; }); // remaining H point out of plane (0, 1 or 2)
  return {pts, bonds, hb};
})();

// ---------- scenes ----------
export const scenes = {
  hook(stage, t, p, ctx) {
    const {P, ys} = tank(stage, t, {pulse: 0});
    const top = P([0.3, 1, 0.3]), sub = P([0.2, -0.4, 0.2]);
    leader(stage, '수면 위: 부피의 약 8%', top, [560, 560], {sub: '얼음 0.917 · 물 1.000 g/cm³', alpha: smooth((p - 0.15) / 0.15)});
    leader(stage, '수면 아래 약 92%', sub, [640, 1290], {size: 28, alpha: smooth((p - 0.35) / 0.15)});
  },

  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, cx = 500, cy = 880, A = 0.3 * Math.sin(t * 0.4), sc = 250;
    const half = 104.5 / 2 * Math.PI / 180, d = 0.96;
    const cam = {angle: A, tilt: 0.12, scale: sc, cx, cy, distance: 14};
    const O = project([0, 0.25, 0], cam), H1 = project([Math.sin(half) * d, 0.25 - Math.cos(half) * d, 0], cam), H2 = project([-Math.sin(half) * d, 0.25 - Math.cos(half) * d, 0], cam);
    glow(c, O[0], O[1], 260, O_COL, 0.08);
    for (const H of [H1, H2]) { line(c, [O, H], '#0b1a22', 22); line(c, [O, H], rgba(H_COL, 0.7), 12); }
    sphere(c, H1[0], H1[1], 62 * H1[3], H_COL, {shade: '#56606a'}); sphere(c, H2[0], H2[1], 62 * H2[3], H_COL, {shade: '#56606a'});
    sphere(c, O[0], O[1], 105 * O[3], O_COL, {shade: '#3d140b'});
    const a1 = Math.atan2(H1[1] - O[1], H1[0] - O[0]), a2 = Math.atan2(H2[1] - O[1], H2[0] - O[0]);
    ring(c, O[0], O[1], 170, rgba(stage.theme.accent, 0.9), 3, Math.min(a1, a2), Math.max(a1, a2));
    stage.text('104.5°', O[0], O[1] + 205, {role: 'display', weight: 500, size: 40, color: stage.theme.accent, align: 'center'});
    leader(stage, '산소 O', [O[0] + 60, O[1] - 70], [700, 560], {alpha: smooth((p - 0.1) / 0.2)});
    leader(stage, '수소 H', [H1[0] + 30, H1[1] + 40], [760, 1230], {alpha: smooth((p - 0.25) / 0.2)});
    scaleBar(stage, 120, 1290, sc * 0.1 / 0.096 * 0.96, '0.1 nm');
    sourceLine(stage, '원자 크기는 보기 쉽게 키움 · 결합 길이 0.096 nm');
  },

  mechanism(stage, t, p, ctx) {
    const {ctx: c} = stage, E = ctx.events;
    const bondT = E.has('bond') ? E.get('bond').time : ctx.scene.start + ctx.scene.duration * 0.4;
    const settle = smooth((t - ctx.scene.start - 0.2) / Math.max(0.5, bondT - ctx.scene.start - 0.2));
    const cam = {angle: 0.35 * Math.sin(t * 0.25), tilt: 0.25, scale: 112, cx: 500, cy: 860, distance: 12};
    // liquid → layer: molecules start packed a little closer with thermal jitter, then settle onto the lattice
    const pos = LATTICE.pts.map((pt, i) => {
      const jx = (rand(i) - 0.5) * 1.8 + 0.25 * Math.sin(t * 2.1 + i), jy = (rand(i + 50) - 0.5) * 1.8 + 0.25 * Math.cos(t * 1.7 + i * 2);
      return [lerp(pt.x * 0.78 + jx, pt.x, settle), lerp(pt.y * 0.78 + jy, pt.y, settle), lerp(rand(i + 9) - 0.5, pt.z, settle)];
    });
    const O = pos.map(v => project(v, cam));
    const hb = E.has('bond') ? E.after('bond', t, 0.5) : settle, flash = E.has('bond') ? E.pulse('bond', t, 0.8) : 0;
    // H positions: along the donor→acceptor link (0.35 of O···O ≈ 0.96/2.76), blended from a tumbling liquid direction
    const hpos = [];
    const tumble = (i, k) => { const a = t * 1.4 + i * 2.3 + k * 1.82; return [Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0.1 * Math.sin(a * 0.7)]; };
    const count = pos.map(() => 0);
    for (const [d, a] of LATTICE.hb) {
      const k = count[d]++, lat = pos[a].map((v, m) => (v - pos[d][m]) * 0.35), liq = tumble(d, k);
      hpos.push({d, a, v: pos[d].map((v, m) => v + lerp(liq[m], lat[m], settle))});
    }
    LATTICE.pts.forEach((pt, i) => { for (let k = 0; k < pt.out; k++) { const liq = tumble(i, count[i]++), lat = [0, 0, (pt.z > 0 ? 1 : -1) * 0.35]; hpos.push({d: i, a: -1, v: pos[i].map((v, m) => v + lerp(liq[m], lat[m], settle))}); } });
    const q = new DrawQueue();
    for (const h of hpos) {
      const H = project(h.v, cam), Od = O[h.d];
      q.push((H[2] + Od[2]) / 2 - 0.02, () => line(c, [Od, H], rgba(H_COL, 0.85), 5 * H[3]));         // covalent O–H
      q.push(H[2], () => sphere(c, H[0], H[1], 9 * H[3], H_COL, {shade: '#5d6670'}));
      if (h.a >= 0) {
        const A = O[h.a];
        q.push((H[2] + A[2]) / 2 - 0.01, () => {                                                          // hydrogen bond H···O
          line(c, [H, A], rgba(stage.theme.accent2, 0.85 * hb), 3, {dash: [7, 7]});
          if (flash > 0) line(c, [H, A], rgba('#ffffff', 0.7 * flash), 5);
        });
      }
    }
    O.forEach((v, i) => q.push(v[2], () => sphere(c, v[0], v[1], 17 * v[3], O_COL, {shade: '#4a1a10'})));
    q.flush();
    if (flash > 0) glow(c, 500, 860, 420, stage.theme.accent2, 0.25 * flash);
    // the empty hexagon centre
    const hole = project([Math.sqrt(3) / 2, 0.25, 0], cam), show = smooth((p - 0.55) / 0.12);
    withAlpha(c, show, () => { ring(c, hole[0], hole[1], 52, stage.theme.accent, 3); });
    leader(stage, '빈 공간', [hole[0] + 40, hole[1] - 30], [700, 520], {alpha: show, color: stage.theme.accent, sub: '육각형 고리의 가운데'});
    drawLabel(stage, '수소 결합', 120, 1250, {key: stage.theme.accent2, alpha: hb});
    drawLabel(stage, '물 분자 (O 빨강 · H 흰색)', 380, 1250, {key: O_COL});
    sourceLine(stage, '한 층만 그린 단순화 · 실제 얼음은 3차원 육각 구조');
  },

  phenomenon(stage, t, p, ctx) {
    // Same molecule size in both boxes; what differs is the arrangement. Water: packed, jittered, drifting.
    // Ice: an open honeycomb with visibly empty ring centres (one layer of ice Ih, simplified), held by dashed H-bonds.
    const {ctx: c} = stage, T = stage.theme, w = 380, h = 470, y0 = 590, R = 14;
    line(c, [[495, 560], [495, 1180]], rgba(T.border, 1), 2);
    const boxes = [[80, '물 · 0 °C', 24, false], [510, '얼음', 22, true]];
    for (const [x0, name, n, solid] of boxes) {
      stage.text(name, x0 + w / 2, 545, {role: 'display', weight: 700, size: 40, align: 'center', color: solid ? ICE : '#8fd0ef'});
      rect(c, x0, y0, w, h, 14, rgba(solid ? '#0f3343' : '#0c2b3b', 0.9), rgba(T.border, 1), 2);
      clipRect(c, x0, y0, w, h, 14, () => {
        if (!solid) {
          // 24 molecules on a tight 5×5 grid (one cell empty), small jitter + slow drift: dense but disordered
          const cw = (w - 24) / 5, chh = (h - 24) / 5;
          for (let i = 0; i < n; i++) {
            const cell = i + (i >= 12 ? 1 : 0);
            const x = x0 + 12 + cw * (cell % 5 + 0.5) + (rand(i) - 0.5) * 18 + 6 * Math.sin(t * 1.9 + i);
            const y = y0 + 12 + chh * (Math.floor(cell / 5) + 0.5) + (rand(i + 30) - 0.5) * 22 + 6 * Math.cos(t * 1.6 + i * 2);
            const a = t * 1.2 + i * 1.7;
            molecule(c, x, y, R, [[Math.cos(a), Math.sin(a)], [Math.cos(a + 1.82), Math.sin(a + 1.82)]]);
          }
        } else {
          // honeycomb vertices (edge L) nearest the box centre → 22 molecules; bonds = pairs at distance L
          const L = 66, cx = x0 + w / 2, cy = y0 + h / 2 + 6, pts = [];
          for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
            const bx = cx + (i * Math.sqrt(3) + j * Math.sqrt(3) / 2) * L, by = cy + j * 1.5 * L;
            pts.push([bx, by - L / 2], [bx, by + L / 2]);
          }
          pts.sort((u, v) => Math.hypot(u[0] - cx, u[1] - cy) - Math.hypot(v[0] - cx, v[1] - cy));
          const v = pts.slice(0, n), bonds = [];
          for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (Math.abs(Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1]) - L) < 2) bonds.push([i, j]);
          for (const [i, j] of bonds) line(c, [v[i], v[j]], rgba('#9fd9c8', 0.55), 2, {dash: [6, 7]});
          for (let i = 0; i < v.length; i++) {
            const nb = bonds.filter(([a, b]) => a === i || b === i).map(([a, b]) => v[a === i ? b : a]).slice(0, 2);
            const dirs = nb.map(q => { const d = Math.hypot(q[0] - v[i][0], q[1] - v[i][1]); return [(q[0] - v[i][0]) / d, (q[1] - v[i][1]) / d]; });
            while (dirs.length < 2) dirs.push([Math.cos(i), Math.sin(i)]);
            molecule(c, v[i][0] + 1.5 * Math.sin(t * 6 + i), v[i][1] + 1.5 * Math.cos(t * 5 + i), R, dirs);   // only a slight vibration
          }
          // one empty ring centre, pointed out
          const hole = [cx + Math.sqrt(3) / 2 * L, cy + 0.0];
          ring(c, hole[0], hole[1], L * 0.55, rgba(T.accent, 0.85), 2);
          stage.text('빈 공간', hole[0], hole[1], {size: 20, weight: 500, align: 'center', color: T.accent});
        }
      });
      stage.text(`분자 ${n}개 · 같은 부피`, x0 + w / 2, y0 + h + 40, {size: 30, weight: 500, align: 'center', color: T.ink});
    }
    // density bars: an observation of the same two boxes
    const show = smooth((p - 0.35) / 0.2);
    for (const [k, name, rho, col] of [[0, '물', RHO_WATER, '#8fd0ef'], [1, '얼음', RHO_ICE, ICE]]) {
      const y = 1180 + k * 58;
      stage.text(name, 80, y, {size: 28, weight: 500, color: T.muted});
      rect(c, 170, y - 14, 600, 28, 6, rgba(T.border, 0.8));
      rect(c, 170, y - 14, 600 * rho * show, 28, 6, col);
      stage.text(`${rho.toFixed(3)} g/cm³`, 790, y, {role: 'display', weight: 500, size: 28, color: T.ink, alpha: show});
    }
    sourceLine(stage, '분자 개수는 밀도 비(0.92)를 반영한 설명용 모형 · 얼음은 한 층만 그림');
  },

  close(stage, t, p, ctx) {
    const E = ctx.events, pulse = E.has('float') ? E.pulse('float', t, 1.2) : 0;
    endCard(stage, {kicker: '정리', takeaway: '틈이 많은 결정은 물보다 가볍습니다', lines: ['얼음 0.917 g/cm³ · 물 1.000 g/cm³'], p, y: 560});
    tank(stage, t, {cx: 500, cy: 1080, scale: 62, pulse});
  },
};

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) {
  const [kicker, title, subtitle] = titles[ctx.scene.id] || ['', '', ''];
  if (title || kicker) header(stage, {kicker, title, subtitle, p: ctx.scene.p});
  progressBar(stage, t, ctx.tl.duration);
}
