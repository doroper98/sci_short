// 53 카톡 — 보내기를 누르면 메시지는 어디를 거쳐 갈까. 사실·단순화는 brief.md.
// 영상미 문법(2026-11-10): 움직이는 것은 모두 인과 사슬의 한 고리. 물체(휴대전화·기지국·광케이블·데이터센터·전신기)는 면과 명암이 있는
// 무광 덩어리. 빛나는 것은 신호뿐 — 메시지 신호 점(난색), 읽음·알림 신호(한색), 전파 고리, 광케이블 속 빛, 전신 전류, 서버 상태 불빛. 모두 lit() 안.
// 휴대전화 화면이 켜지는 것은 넓은 면이라 lit() 밖(SDR 밝기 그대로). 계기·이름표·글자·바탕도 lit() 밖이고 글이 빛 위에 얹히는 곳은 unlitRect.
// 난색 하나 = 내가 보낸 메시지(신호 점·주제어), 한색 하나 = 돌아오는 것(읽음 신호·알림).
// 무대 하나: '길' — 아래 책상 위의 두 전화, 왼쪽 기지국, 지평선의 데이터센터, 둘을 잇는 광케이블(원근, 크기·거리 과장).
// 같은 시계: 신호 점의 위치는 sound.json 사건 시각(보냄 · 기지국 · 데이터센터 · 나감 · 기지국 · 도착) 사이를 보간한다 — 그림과 소리가 같은 표.
// 서비스 이름의 선(묶음 8): 로고·실제 앱 화면·브랜드 색·말풍선 모양 없음. 이름 없는 전화와 메신저 화면만.
// 첫 순간(2026-11-16): 0~2초 '결과 먼저' — 가까이 본 두 전화에서 신호가 떠나고 카메라가 물러나 길 전체가 드러남 → 친구 전화가 켜짐 → 되감기.
// Fable 검수(s24): 곧장 잇는 점선은 흐린 잔상으로만(관측 사실 — 서버가 멈추자 함께 멈춤 — 이 주인공).
import {
  rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, rand, line, circle, ring, rect, poly, withAlpha, lit, ensureGain,
  progressBar, TAU,
} from '../../pipeline/render/index.mjs';

export const theme = 'film';
export const look = {background: {cx: 0.5, cy: 0.42}};   // 편마다 바꾸는 것은 밝은 곳의 자리뿐(세기는 config/look.json)
export const events = [];
export const captionLayout = {};

const W = 1080;
const PAL = {
  ink: '#F1EDE6', muted: '#A3A19B', border: '#3A3B40', plate: '#232327',
  warm: '#FF6B1A', warmHi: '#F5A066', warmLo: '#9C5B36',
  cool: '#5BA8F0', coolHi: '#A9D2FA',
  body: '#34353B', bodyLo: '#1E1F23', bodyHi: '#55575E', screen: '#121317', screenOn: '#6B7380',
  bubbleIn: '#8E8C88', desk: '#3A3631', deskLo: '#24211E',
  mast: '#62646B', mastLo: '#3C3E44', panel: '#8A8D95',
  dcFront: '#45464D', dcSide: '#2C2D32', dcRoof: '#56575E', rack: '#1C1D21', rackHi: '#2C2E33',
  cable: '#44464D', cableHi: '#8A8D95', ground: '#232326',
  paper: '#D9D3C6', paperLo: '#A9A294', brass: '#8C7A5C', brassHi: '#B8A47E', wood: '#4A3A2C',
};
const CORE = c => mix(c, '#FFFFFF', 0.5);
const so = {shadow: 'rgba(0,0,0,0.9)', shadowBlur: 16};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const S = (ctx, id) => ctx.tl.sentence(id);
const W0 = (ctx, sid, word, off = 0) => ctx.tl.wordStart(sid, word) + off;
const evT = (ctx, id) => ctx.events.get(id).time;
function pw(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return lerp(va, vb, (t - a) / Math.max(1e-6, b - a)); }
  return pts[pts.length - 1][1];
}

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
// 무대(세계 좌표 = 전체 보기의 화면 좌표). 크기·거리 과장.
// =====================================================================================================
const HOR = 560;                                   // 지평선
const PA = {x: 400, y: 1085}, PB = {x: 660, y: 1085};   // 내 전화 · 친구 전화(가운데)
const PW = 150, PH = 280;
const ANT = [165, 702];                            // 기지국 안테나
const TB = [165, 1150];                            // 기지국 밑
const DC = {x: 450, y: 430, w: 300, h: 170, side: 46};   // 데이터센터 앞면
const DOOR = [600, 600];
const NOTI = {x: 262, y: 512, w: 96, h: 50};      // 알림 서버(운영체제) — 지평선의 작은 건물

/** 2차 곡선 a → ctrl → b 를 n 점으로 */
function quad(a, c, b, n = 40) { const out = []; for (let i = 0; i <= n; i++) { const q = i / n, u = 1 - q; out.push([u * u * a[0] + 2 * u * q * c[0] + q * q * b[0], u * u * a[1] + 2 * u * q * c[1] + q * q * b[1]]); } return out; }
const CABLE = quad([200, 1162], [262, 760], [DOOR[0], DOOR[1] + 4], 60);       // 광케이블 중심선(기지국 → 데이터센터)
const cableW = q => lerp(22, 7, q);                                           // 원근으로 가늘어짐
function offsetLine(pts, d, wf) {          // 중심선에서 옆으로 d×(굵기 비율) 만큼
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const w = wf(i / (pts.length - 1));
    return [p[0] - dy / L * d * w, p[1] + dx / L * d * w];
  });
}
const LANE_UP = offsetLine(CABLE, -0.22, cableW), LANE_DN = offsetLine(CABLE, 0.22, cableW);
const antOf = p => [p.x, p.y - PH / 2 + 8];
const RADIO_UP = quad(antOf(PA), [300, 760], [ANT[0] + 12, ANT[1] + 6]);
const RADIO_DN = quad([ANT[0] + 12, ANT[1] + 6], [520, 720], antOf(PB));
const WIRE_UP = [[ANT[0], ANT[1] + 10], [ANT[0], TB[1] - 6], [200, 1162], ...LANE_UP.slice(1)];
const WIRE_DN = [...LANE_DN.slice().reverse(), [200, 1166], [ANT[0] + 4, TB[1] - 6], [ANT[0] + 4, ANT[1] + 10]];
const DC_IN = [[DOOR[0] - 4, DOOR[1]], [DOOR[0] - 4, 520], [DOOR[0] + 4, 520], [DOOR[0] + 4, DOOR[1]]];
const LEGS = [RADIO_UP, WIRE_UP, DC_IN, WIRE_DN, RADIO_DN];      // 경계: 0 보냄 · 1 기지국 · 2 데이터센터 · 3 나감 · 4 기지국 · 5 도착
const LEGS_REV = LEGS.slice().reverse().map(l => l.slice().reverse());

function polyLen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
const LCACHE = new Map();
function along(pts, q) {
  let c = LCACHE.get(pts); if (!c) { c = polyLen(pts); LCACHE.set(pts, c); }
  const L = c[c.length - 1] * clamp(q);
  let i = 1; while (i < c.length - 1 && c[i] < L) i++;
  const f = (L - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
}
/** 여행: 경계 시각 T[0..n] 과 다리 목록. t 에서의 (다리 k, 비율 q) — 출발 전 null, 도착 뒤 {done} */
function tripAt(t, T) {
  if (t < T[0]) return null;
  for (let k = 0; k < T.length - 1; k++) if (t < T[k + 1]) return {k, q: (t - T[k]) / Math.max(1e-6, T[k + 1] - T[k])};
  return {k: T.length - 2, q: 1, done: true};
}
const tripPos = (legs, k, q) => along(legs[k], q);

// ---------- 물체(무광 덩어리) ----------
function ground(c) {
  const g = c.createLinearGradient(0, HOR, 0, 1250);
  g.addColorStop(0, 'rgba(40,40,44,0)'); g.addColorStop(0.08, 'rgba(40,40,44,0.55)'); g.addColorStop(1, 'rgba(30,30,33,0.75)');
  c.fillStyle = g; c.fillRect(-400, HOR, 1900, 900);
  line(c, [[-400, HOR], [1500, HOR]], rgba('#55565C', 0.7), 2);
}
function desk(c) {
  poly(c, [[250, 1170], [820, 1170], [900, 1260], [170, 1260]], PAL.desk);
  poly(c, [[170, 1260], [900, 1260], [900, 1300], [170, 1300]], PAL.deskLo);
}
function tower(c, a = 1) {
  withAlpha(c, a, () => {
    poly(c, [[ANT[0] - 30, TB[1]], [ANT[0] + 30, TB[1]], [ANT[0] + 7, ANT[1] + 10], [ANT[0] - 7, ANT[1] + 10]], PAL.mastLo);
    poly(c, [[ANT[0] - 30, TB[1]], [ANT[0], TB[1]], [ANT[0], ANT[1] + 10], [ANT[0] - 7, ANT[1] + 10]], PAL.mast);
    for (let k = 0; k < 7; k++) { const y0 = lerp(ANT[1] + 40, TB[1], k / 7), y1 = lerp(ANT[1] + 40, TB[1], (k + 1) / 7), w0 = lerp(9, 30, (y0 - ANT[1]) / (TB[1] - ANT[1])), w1 = lerp(9, 30, (y1 - ANT[1]) / (TB[1] - ANT[1]));
      line(c, [[ANT[0] - w0, y0], [ANT[0] + w1, y1]], rgba('#2A2B30', 0.8), 2); }
    for (const dx of [-22, 0, 22]) { rect(c, ANT[0] + dx - 8, ANT[1] - 26, 16, 58, 4, PAL.panel); rect(c, ANT[0] + dx - 8, ANT[1] - 26, 7, 58, 3, mix(PAL.panel, '#FFFFFF', 0.18)); }
    rect(c, 182, 1126, 44, 40, 5, PAL.mastLo, rgba('#55565C', 1), 2);      // 장비함
  });
}
function cable(c, a = 1) {
  withAlpha(c, a, () => {
    for (let i = 1; i < CABLE.length; i++) {
      const q = i / (CABLE.length - 1);
      line(c, [CABLE[i - 1], CABLE[i]], PAL.cable, cableW(q) + 4, {cap: 'butt'});
    }
    for (let i = 1; i < CABLE.length; i++) line(c, [offsetLine(CABLE, -0.35, cableW)[i - 1], offsetLine(CABLE, -0.35, cableW)[i]], rgba(PAL.cableHi, 0.6), 1.5);
  });
}
const CABLE_HI = offsetLine(CABLE, -0.35, cableW);
function cableFast(c) {
  for (let i = 1; i < CABLE.length; i++) line(c, [CABLE[i - 1], CABLE[i]], '#18181B', cableW(i / (CABLE.length - 1)) + 8, {cap: 'butt'});
  for (let i = 1; i < CABLE.length; i++) line(c, [CABLE[i - 1], CABLE[i]], PAL.cable, cableW(i / (CABLE.length - 1)) + 4, {cap: 'butt'});
  line(c, CABLE_HI, rgba(PAL.cableHi, 0.6), 1.5);
}
/** 데이터센터. dark 0..1(화재로 꺼짐), lights(t) 서버 상태 불빛 켤지 */
function datacenter(stage, t, {dark = 0, lights = 1, active = 0} = {}) {
  const c = stage.ctx, {x, y, w, h, side} = DC;
  const dim = col => mix(col, '#0C0C0E', 0.55 * dark);
  poly(c, [[x + w, y], [x + w + side, y - 22], [x + w + side, y + h - 22], [x + w, y + h]], dim(PAL.dcSide));
  poly(c, [[x, y], [x + side, y - 22], [x + w + side, y - 22], [x + w, y]], dim(PAL.dcRoof));
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, dim(mix(PAL.dcFront, '#FFFFFF', 0.06))); g.addColorStop(1, dim(mix(PAL.dcFront, '#000000', 0.25)));
  c.fillStyle = g; c.fillRect(x, y, w, h);
  // 앞면의 랙 줄(창 너머로 보이는 서버 줄)
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
    const rx = x + 16 + k * 40, ry = y + 18 + r * 46;
    rect(c, rx, ry, 30, 36, 3, dim(PAL.rack), rgba(dim(PAL.rackHi), 1), 1.5);
  }
  rect(c, DOOR[0] - 16, y + h - 34, 32, 34, 3, dim('#26272B'));
  if (lights > 0 && dark < 1) lit(stage, cc => {
    for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
      const i = r * 7 + k, on = rand(i * 3.7 + Math.floor(t * 2.2 + rand(i) * 3)) > 0.45;
      if (!on) continue;
      const rx = x + 16 + k * 40 + 7, ry = y + 18 + r * 46 + 8 + (i % 3) * 9;
      withAlpha(cc, lights * (1 - dark), () => circle(cc, rx, ry, 2.4, i % 4 === 0 ? CORE(PAL.cool) : CORE('#7FD6A4')));
    }
    if (active > 0) withAlpha(cc, active, () => { rect(cc, DOOR[0] - 22, y + 104, 44, 6, 3, CORE(PAL.warm)); });
  }, {gain: 0.4});
}
function notiServer(c, a = 1) {
  withAlpha(c, a, () => {
    const {x, y, w, h} = NOTI;
    poly(c, [[x, y], [x + 14, y - 8], [x + w + 14, y - 8], [x + w, y]], PAL.dcRoof);
    rect(c, x, y, w, h, 0, PAL.dcFront);
    for (let k = 0; k < 3; k++) rect(c, x + 10 + k * 28, y + 10, 20, 30, 2, PAL.rack);
  });
}
/** 휴대전화(세계 좌표). o: screen 0..1(켜짐 밝기), sent 0..1(보낸 말풍선), one 0..1(숫자 1), recv 0..1(받은 말풍선), off(꺼짐), text */
function phone(stage, p, o = {}) {
  const c = stage.ctx, x = p.x - PW / 2, y = p.y - PH / 2;
  // 몸체
  const g = c.createLinearGradient(x, y, x + PW, y + PH); g.addColorStop(0, PAL.bodyHi); g.addColorStop(0.35, PAL.body); g.addColorStop(1, PAL.bodyLo);
  rect(c, x + 4, y + 8, PW, PH, 22, 'rgba(0,0,0,0.45)');
  rect(c, x, y, PW, PH, 22, g);
  // 화면
  const sx = x + 9, sy = y + 22, sw = PW - 18, sh = PH - 44;
  const on = o.off ? 0 : (o.screen ?? 0.35);
  rect(c, sx, sy, sw, sh, 12, mix(PAL.screen, PAL.screenOn, on));
  if (!o.off && on > 0.05) {
    withAlpha(c, clamp(on * 2), () => {
      line(c, [[sx + 12, sy + 20], [sx + sw - 12, sy + 20]], rgba('#FFFFFF', 0.12), 2);
      const txt = o.text || '가자';
      if ((o.sent ?? 0) > 0) withAlpha(c, o.sent, () => {
        const bw = 78, bx = sx + sw - bw - 10, by = sy + sh - 74 - 26 * (1 - o.sent);
        rect(c, bx, by, bw, 40, 12, PAL.warmLo);
        stage.text(txt, bx + bw / 2, by + 28, {size: 24, weight: 700, color: '#F6EDE4', align: 'center'});
        if ((o.one ?? 0) > 0) withAlpha(c, o.one, () => stage.text('1', bx - 8, by + 36, {size: 26, weight: 700, color: PAL.warmHi, align: 'right'}));
      });
      if ((o.recv ?? 0) > 0) withAlpha(c, o.recv, () => {
        const bw = 78, bx = sx + 10, by = sy + sh - 74 - 26 * (1 - o.recv);
        rect(c, bx, by, bw, 40, 12, PAL.bubbleIn);
        stage.text(txt, bx + bw / 2, by + 28, {size: 24, weight: 700, color: '#1B1B1D', align: 'center'});
      });
      if ((o.notice ?? 0) > 0) withAlpha(c, o.notice, () => { rect(c, sx + 8, sy + 34, sw - 16, 34, 8, rgba('#6A717C', 0.95)); stage.text('새 메시지', sx + sw / 2, sy + 58, {size: 20, weight: 500, color: '#F1EDE6', align: 'center'}); });
    });
  }
  // 옆 빛(면과 명암)
  line(c, [[x + 3, y + 30], [x + 3, y + PH - 30]], rgba('#FFFFFF', 0.10), 3);
}
/** 신호 점과 꼬리(lit). legs·T: 여행 표. col: 난색(메시지) / 한색(읽음·알림) */
function signal(stage, t, legs, T, {col = PAL.warm, trail = 0.28, size = 9, a = 1, stopAt = null} = {}) {
  const tr = tripAt(t, T); if (!tr || a <= 0) return null;
  if (tr.done && t > T[T.length - 1] + 0.25) return tr;
  const pts = [];
  const N = 10;
  for (let j = N; j >= 0; j--) {
    const tt = Math.max(T[0], t - trail * j / N);
    const r = tripAt(tt, T); if (!r) continue;
    pts.push(tripPos(legs, r.k, r.q));
  }
  const head = pts[pts.length - 1], fade = tr.done ? 1 - (t - T[T.length - 1]) / 0.25 : 1;
  withAlpha(stage.ctx, a * fade, () => lit(stage, cc => {
    if (pts.length > 1) { line(cc, pts, rgba(col, 0.55), size * 0.9); line(cc, pts.slice(-5), CORE(col), size * 0.4); }
    circle(cc, head[0], head[1], size, col); circle(cc, head[0], head[1], size * 0.5, CORE(col));
  }, {gain: 0.85}));
  return {...tr, head};
}
/** 전파 고리: 보내는 쪽에서 받는 쪽으로 퍼지는 호(lit). age 0..dur */
function radioRings(stage, from, to, t0, t, col = PAL.warm, dur = 0.9, n = 3) {
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0]), D = Math.hypot(to[0] - from[0], to[1] - from[1]);
  lit(stage, cc => {
    for (let k = 0; k < n; k++) {
      const age = t - t0 - k * 0.18; if (age < 0 || age > dur) continue;
      const q = age / dur, r = 14 + q * D;
      withAlpha(cc, (1 - q) * 0.9, () => { ring(cc, from[0], from[1], r, rgba(col, 0.8), 3.5, ang - 0.45, ang + 0.45); ring(cc, from[0], from[1], r, CORE(col), 1.4, ang - 0.4, ang + 0.4); });
    }
  }, {gain: 0.6});
}
/** 여행이 전파 다리에 있을 때 고리를 띄운다 */
function tripRings(stage, t, T, col, rev = false) {
  const legsFrom = rev ? [[antOf(PB), ANT], [ANT, antOf(PA)]] : [[antOf(PA), ANT], [ANT, antOf(PB)]];
  const radioK = rev ? [0, 4] : [0, 4];
  radioK.forEach((k, j) => { if (t >= T[k] - 0.05 && t < T[k + 1] + 0.9) radioRings(stage, legsFrom[j][0], legsFrom[j][1], T[k], t, col, Math.max(0.5, T[k + 1] - T[k] + 0.2)); });
}

/** 카메라: 세계 → 화면. cam {cx, cy, z} — 화면 (540, sy) 에 세계 (cx, cy) */
function withCam(stage, cam, fn) {
  const c = stage.ctx; c.save();
  c.translate(540 - cam.cx * cam.z, (cam.sy ?? 960) - cam.cy * cam.z); c.scale(cam.z, cam.z);
  try { fn(); } finally { c.restore(); }
}
const toScreen = (cam, p) => [540 + (p[0] - cam.cx) * cam.z, (cam.sy ?? 960) + (p[1] - cam.cy) * cam.z];
const CAM_FULL = {cx: 540, cy: 960, z: 1, sy: 960};
const CAM_CLOSE = {cx: 530, cy: 1085, z: 2.4, sy: 950};
const CAM_B = {cx: 660, cy: 1075, z: 2.6, sy: 950};
const CAM_DC = {cx: 612, cy: 515, z: 2.7, sy: 820};
const camMix = (a, b, q) => ({cx: lerp(a.cx, b.cx, q), cy: lerp(a.cy, b.cy, q), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), q)), sy: lerp(a.sy ?? 960, b.sy ?? 960, q)});

/** 무대 전체 그리기(세계 좌표, 카메라 안에서) */
function world(stage, t, o = {}) {
  const c = stage.ctx;
  ground(c);
  if (o.noti) notiServer(c, o.noti);
  datacenter(stage, t, {dark: o.dark ?? 0, lights: o.lights ?? 1, active: o.active ?? 0});
  cableFast(c);
  tower(c);
  desk(c);
  phone(stage, PA, {screen: 0.6, sent: o.sentA ?? 1, one: o.oneA ?? 1, text: '가자'});
  phone(stage, PB, {screen: o.screenB ?? 0.2, recv: o.recvB ?? 0, off: o.offB, notice: o.noticeB ?? 0, text: '가자'});
}
function nodeLabel(stage, cam, p, s, a = 1, dy = 0, col = PAL.ink) {
  if (a <= 0) return;
  const [x, y] = toScreen(cam, p);
  withAlpha(stage.ctx, a, () => stage.text(s, x, y + dy, {size: 28, weight: 700, color: col, align: 'center', ...so}));
}

// =====================================================================================================
// 포스터(0초 프레임 = 썸네일): 흰 물음 위, 주제어(카톡)가 가장 크게. 시리즈 아님. 답은 쓰지 않는다.
// =====================================================================================================
const POSTER = {q: ['옆자리 친구에게 보낸', '메시지는 어디를 거쳐 갈까?'], a: '카톡', qy: 232, ay: 520, QS: 64, AS: 178};
function posterTitle(stage, q) {
  const c = stage.ctx, yTop = POSTER.qy - 90, yBot = POSTER.ay + POSTER.AS * 0.4 + 40;
  if (q < 1) unlitRect(stage, 0, 118, W, yBot - 118, 1);
  if (q < 1) withAlpha(c, 1 - q, () => {
    const g = c.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.2, 'rgba(9,9,11,0.5)'); g.addColorStop(0.85, 'rgba(9,9,11,0.5)'); g.addColorStop(1, 'rgba(9,9,11,0)');
    c.fillStyle = g; c.fillRect(0, yTop, W, yBot - yTop);
  });
  const sh = 'rgba(0,0,0,0.92)', s1 = lerp(POSTER.QS, 46, q), LH = POSTER.QS * 1.3 * (1 - smooth((q - 0.3) / 0.7));
  if (q <= 0.55) POSTER.q.forEach((s, i) => stage.text(s, 540, lerp(POSTER.qy + i * LH, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22}));
  else withAlpha(c, 1 - smooth((q - 0.55) / 0.45), () => stage.text(POSTER.q.join(' '), 540, lerp(POSTER.qy, 228, q), {role: 'display', weight: 700, size: s1, color: '#FFFFFF', align: 'center', shadow: sh, shadowBlur: 22, maxWidth: 960}));
  const sa = lerp(POSTER.AS, 40, q);
  withAlpha(c, 1 - smooth(q / 0.6), () => stage.text(POSTER.a, 540, lerp(POSTER.ay, 300, q), {role: 'display', weight: 700, size: sa, color: PAL.warm, align: 'center', shadow: sh, shadowBlur: 28, tracking: -0.02 * sa}));
}
const MORPH = tl => [tl.sentence('s01').end + 0.1, tl.sentence('s01').end + 1.0];

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
    case 'hook': return [[-Infinity, '실제 1초 안 · 느리게'], [2.0, '되감기'], [2.9, '보내기를 누르면'], [W0(ctx, 's02', '그사이', -0.3), '실제 1초 안 · 느리게', '옆자리까지 가는 먼 길'], [a('s03'), '2026년 집계', '한 달에 4,700만 명 넘게']];
    case 'origin': return [[-Infinity, '1844 · 모스의 전신', '글자를 전기 신호로'], [a('s05'), '전보가 많아지자', '중계국이 받아 두었다가'], [a('s06'), '2010 · 카카오톡', '문자 대신 인터넷으로']];
    case 'essence': return [[-Infinity, '가운데의 컴퓨터', '서버'], [a('s08'), '핵심', '곧장 가지 않고, 서버를 거쳐']];
    case 'encode': return [[-Infinity, '① 글자 → 숫자', '유니코드'], [a('s10'), '② 숫자 → 0과 1', '한글 한 글자에 24개'], [a('s11'), '③ 잠그고 묶기', '패킷'], [a('s12'), '패킷의 도착 주소', '친구 전화가 아니라 서버']];
    case 'route': return [[-Infinity, '④ 전파', '기지국까지'], [a('s14'), '⑤ 광케이블', '유리 섬유 속 빛'], [a('s15', -0.6), '광케이블 확대 · 실제보다 2만 배 느리게', '1초에 약 20만 km']];
    case 'server': return [[-Infinity, '⑥ 데이터센터 · 크기 과장', '서버 수만 대'], [a('s17'), '받는 사람 찾기', '지금 연결돼 있나?']];
    case 'deliver': return [[-Infinity, '친구 전화의 상태만 바꿈', '① 앱이 연결됨 — 곧바로'], [a('s19'), '친구 전화의 상태만 바꿈', '② 앱이 쉬는 중 — 깨운다'], [a('s20'), '친구 전화의 상태만 바꿈', '③ 꺼짐 — 맡아 두었다가']];
    case 'read': return [[-Infinity, '⑦ 읽음', '짧은 신호가 돌아간다'], [a('s22'), '숫자 1', '읽음 신호도 서버를 거쳐']];
    case 'myth': return [[-Infinity, '2022년 10월 · 데이터센터 화재', '서버가 멈추자'], [a('s24'), '바로 옆자리 친구에게도', '메시지가 함께 멈췄다']];
    case 'close': return [[-Infinity, '정리', '']];
  }
  return [[-Infinity, '', '']];
}
function captionBand(c) { const g = c.createLinearGradient(0, 1230, 0, 1920); g.addColorStop(0, 'rgba(8,8,10,0)'); g.addColorStop(0.2, 'rgba(8,8,10,0.6)'); g.addColorStop(1, 'rgba(8,8,10,0.8)'); c.fillStyle = g; c.fillRect(0, 1230, W, 690); }
function topBand(c) { const g = c.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, 'rgba(8,8,10,0.75)'); g.addColorStop(0.7, 'rgba(8,8,10,0.4)'); g.addColorStop(1, 'rgba(8,8,10,0)'); c.fillStyle = g; c.fillRect(0, 0, W, 290); }

/** 여행 표: sound.json 의 사건 prefix_send, _ant, _dc, _out, _ant2, _arr → 경계 시각 */
const TRIP_KEYS = ['send', 'ant', 'dc', 'out', 'ant2', 'arr'];
const trip = (ctx, p) => TRIP_KEYS.map(k => evT(ctx, `${p}_${k}`));
const hasTrip = (ctx, p) => ctx.events.has(`${p}_send`);

// =====================================================================================================
export const scenes = {
  // 결과 먼저(0~2초) → 되감기 → s02 같은 길을 천천히 → s03 큰 숫자
  hook(stage, t, p, ctx) {
    const c = stage.ctx, T1 = trip(ctx, 'hk'), T2 = trip(ctx, 'h2');
    const tG = W0(ctx, 's02', '그사이', -0.2);
    // 카메라: 0.1~1.1 물러남 → 2.0~2.8 되감기 → '그사이'부터 다시 물러남
    // 결과 먼저: 물러나 길 전체(0.1~1.0) → 친구 전화로 다가가 메시지가 뜨는 화면(1.45~1.95) → 되감기(2.0~2.8)
    let cam;
    if (t < 1.45) cam = camMix(CAM_CLOSE, CAM_FULL, easeInOut((t - 0.1) / 0.9));
    else if (t < 2.0) cam = camMix(CAM_FULL, CAM_B, easeInOut((t - 1.45) / 0.5));
    else if (t < tG) cam = camMix(CAM_B, CAM_CLOSE, easeInOut((t - 2.0) / 0.8));
    else cam = camMix(CAM_CLOSE, CAM_FULL, easeInOut((t - tG) / 1.4));
    const arr1 = T1[5], arr2 = T2[5];
    const firstRun = t < 2.0, rewinding = t >= 2.0 && t < 2.8;
    const recvB = firstRun ? fadeIn(t, arr1, 0.15) : rewinding ? 1 - smooth((t - 2.0) / 0.6) : fadeIn(t, arr2, 0.2);
    const screenB = 0.2 + 0.8 * recvB;
    const resend = t < 2.0 ? 1 : t < 2.8 ? 1 - smooth((t - 2.0) / 0.5) : fadeIn(t, 3.05, 0.35);
    withCam(stage, cam, () => {
      world(stage, t, {sentA: resend, oneA: resend, recvB, screenB});
      if (t < 2.0) { tripRings(stage, t, T1, PAL.warm); signal(stage, t, LEGS, T1); }
      else if (t >= tG - 0.1) { tripRings(stage, t, T2, PAL.warm); signal(stage, t, LEGS, T2); }
    });
    // 되감기 동안 길의 흔적(잔상)
    if (rewinding) withCam(stage, cam, () => withAlpha(c, 1 - smooth((t - 2.0) / 0.7), () => LEGS.forEach(L => line(c, L, rgba(PAL.warm, 0.35), 3, {dash: [10, 10]}))));
    // s02: 고리 이름 — 신호가 지나는 순간 켜짐
    if (t >= tG) {
      const ln = [[PA, '내 전화', T2[0], 150], [{x: ANT[0], y: ANT[1]}, '기지국', T2[1], -48], [{x: DOOR[0], y: DC.y}, '데이터센터', T2[2], -40], [PB, '친구 전화', T2[5], 150]];
      for (const [pp, s, tt, dy] of ln) nodeLabel(stage, cam, [pp.x, pp.y], s, fadeIn(t, tt - 0.1, 0.3) * fadeOut(t, ctx.scene.end - 0.4, 0.3), dy);
      // 계기: 보내기 → 친구 화면(어림)
      const ga = fadeIn(t, tG, 0.4) * fadeOut(t, ctx.tl.at('s03') - 0.2, 0.4);
      if (ga > 0) withAlpha(c, ga, () => {
        panel(c, 560, 690, 360, 120);
        stage.text('보내기 → 친구 화면', 740, 728, {size: 26, weight: 700, color: PAL.ink, align: 'center'});
        const qq = clamp((t - T2[0]) / (T2[5] - T2[0]));
        rect(c, 590, 750, 300, 16, 8, rgba(PAL.border, 1)); rect(c, 590, 750, Math.max(16, 300 * qq), 16, 8, PAL.warm);
        stage.text('보통 1초 안 · 어림', 740, 796, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      });
    }
    // s03: 큰 숫자 + 길 위로 계속 오가는 메시지들(많은 사람이 쓰는 길)
    const s3 = S(ctx, 's03');
    if (t > s3.start - 0.3) {
      withCam(stage, CAM_FULL, () => {
        for (let k = 0; k < 6; k++) {
          const t0 = s3.start + k * 0.9, D = 1.6;
          const TT = [t0, t0 + 0.3, t0 + 0.75, t0 + 0.85, t0 + 1.3, t0 + D];
          signal(stage, t, k % 2 ? LEGS_REV : LEGS, TT, {size: 6, a: 0.8});
        }
      });
      const na = fadeIn(t, s3.start + 0.2, 0.5);
      unlitRect(stage, 550, 680, 380, 150, na);
      withAlpha(c, na, () => {
        panel(c, 560, 690, 360, 130);
        stage.text('4,700만 명', 740, 760, {role: 'display', weight: 700, size: 64, color: PAL.warm, align: 'center'});
        stage.text('한 달 사용자 · 표본 집계', 740, 800, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      });
    }
  },

  // ---------------------------------------------------------------------------------------------------
  // 전신: 손잡이 → 전류 펄스 → 종이띠 / 중계국: 다 받아 두었다가 알맞은 전선으로 / 2010: 중계국 자리에 서버
  origin(stage, t, p, ctx) {
    const c = stage.ctx, s4 = S(ctx, 's04'), s5 = S(ctx, 's05'), s6 = S(ctx, 's06');
    const relayA = fadeIn(t, s5.start - 0.2, 0.6), modern = fadeIn(t, s6.start - 0.1, 0.7);
    const A = [150, 720], R = [540, 720], B1 = [880, 560], B2 = [880, 900];
    // 전선(무광): 처음은 A → B1 곧장, 중계국이 생기면 A → R → B1/B2
    withAlpha(c, 1 - modern, () => {
      withAlpha(c, 1 - relayA * 0.85, () => line(c, [A, B1], '#6A6C72', 4, relayA > 0.5 ? {dash: [10, 10]} : {}));
      withAlpha(c, relayA, () => { line(c, [A, R], '#6A6C72', 4); line(c, [R, B1], '#6A6C72', 4); line(c, [R, B2], '#6A6C72', 4); });
      // 전신 손잡이(보내는 곳)
      const press = t < s5.start ? morseLevel(t - s4.start - 0.6) : 0;
      rect(c, A[0] - 90, A[1] + 20, 150, 26, 6, PAL.wood);
      poly(c, [[A[0] - 70, A[1] + 18], [A[0] + 30, A[1] + 18 - 22 + 12 * press], [A[0] + 30, A[1] + 8 - 22 + 12 * press], [A[0] - 70, A[1] + 8]], PAL.brass);
      circle(c, A[0] + 34, A[1] - 6 + 12 * press, 14, PAL.brassHi);
      stage.text('보내는 곳', A[0] - 15, A[1] + 92, {size: 26, weight: 700, color: PAL.muted, align: 'center', ...so});
      // 받는 곳(종이띠에 점·줄)
      for (const [P, lab, aa] of [[B1, '받는 곳', 1], [B2, '다른 곳', relayA]]) withAlpha(c, aa, () => {
        rect(c, P[0] - 40, P[1] - 34, 80, 68, 8, PAL.dcFront);
        stage.text(lab, P[0], P[1] + 72, {size: 26, weight: 700, color: PAL.muted, align: 'center', ...so});
      });
      // 종이띠: B1 아래로 흘러나옴(받은 만큼)
      const recvMarks = MORSE.filter(m => s4.start + 0.6 + m[0] + TRAVEL1 < Math.min(t, s5.start));
      tape(stage, B1[0] - 34, B1[1] + 110, recvMarks, t);
      // 펄스(신호, lit) — s04: A → B1 곧장
      if (t < s5.start) for (const m of MORSE) {
        const t0 = s4.start + 0.6 + m[0], q = (t - t0) / TRAVEL1;
        if (q < 0 || q > 1 + m[1] / TRAVEL1) continue;
        pulse(stage, A, B1, q, m[1] / TRAVEL1);
      }
      // s05: 중계국 — 펄스가 들어와 쌓이고(종이띠 더미), 다 받은 뒤 알맞은 전선(B1)으로 다시 나감
      if (relayA > 0) withAlpha(c, relayA, () => {
        const inT = s5.start + 0.5, outT = W0(ctx, 's05', '알맞은', -0.2);
        rect(c, R[0] - 70, R[1] - 60, 140, 120, 10, PAL.dcFront, rgba('#606168', 1), 2);
        poly(c, [[R[0] - 80, R[1] - 60], [R[0], R[1] - 100], [R[0] + 80, R[1] - 60]], PAL.dcRoof);
        stage.text('중계국', R[0], R[1] + 100, {size: 28, weight: 700, color: PAL.ink, align: 'center', ...so});
        const got = clamp((t - inT) / (outT - inT - 0.3));
        // 쌓인 종이띠(받아 둔 전보)
        for (let k = 0; k < Math.floor(got * 6 + 0.001); k++) rect(c, R[0] - 46, R[1] + 34 - k * 10, 92, 8, 3, mix(PAL.paper, PAL.paperLo, (k % 2) * 0.5));
        for (const m of MORSE) {                    // 들어옴
          const t0 = inT + m[0] * 0.7, q = (t - t0) / (TRAVEL1 * 0.5);
          if (q >= 0 && q <= 1.2) pulse(stage, A, R, q, m[1] * 0.7 / (TRAVEL1 * 0.5));
        }
        for (const m of MORSE) {                    // 다 받은 뒤 나감 — 알맞은 전선으로
          const t0 = outT + m[0] * 0.7, q = (t - t0) / (TRAVEL1 * 0.5);
          if (q >= 0 && q <= 1.2) pulse(stage, R, B1, q, m[1] * 0.7 / (TRAVEL1 * 0.5));
        }
      });
    });
    // s06: 같은 자리에 전화 — 서버 — 전화
    if (modern > 0) withAlpha(c, modern, () => {
      const L = [200, 760], M = [540, 640], Rr = [860, 760];
      line(c, [L, M], '#6A6C72', 4, {dash: [8, 8]}); line(c, [M, Rr], '#6A6C72', 4, {dash: [8, 8]});
      for (const P of [L, Rr]) { rect(c, P[0] - 50, P[1] - 92, 100, 184, 16, PAL.body); rect(c, P[0] - 43, P[1] - 78, 86, 156, 10, PAL.screen); }
      rect(c, M[0] - 80, M[1] - 90, 160, 180, 10, PAL.dcFront, rgba('#606168', 1), 2);
      for (let k = 0; k < 4; k++) rect(c, M[0] - 64, M[1] - 74 + k * 40, 128, 30, 4, PAL.rack);
      stage.text('서버', M[0], M[1] + 132, {size: 30, weight: 700, color: PAL.ink, align: 'center', ...so});
      stage.text('내 전화', L[0], L[1] + 136, {size: 26, weight: 700, color: PAL.muted, align: 'center', ...so});
      stage.text('친구 전화', Rr[0], Rr[1] + 136, {size: 26, weight: 700, color: PAL.muted, align: 'center', ...so});
      const t0 = W0(ctx, 's06', '인터넷으로', -0.1), q = (t - t0) / 1.6;
      if (q > 0 && q < 1.15) lit(stage, cc => {
        const pt = q < 0.5 ? [lerp(L[0], M[0], q / 0.5), lerp(L[1] - 60, M[1], q / 0.5)] : [lerp(M[0], Rr[0], (q - 0.5) / 0.5), lerp(M[1], Rr[1] - 60, (q - 0.5) / 0.5)];
        circle(cc, pt[0], pt[1], 10, PAL.warm); circle(cc, pt[0], pt[1], 5, CORE(PAL.warm));
      }, {gain: 0.85});
    });
  },

  // ---------------------------------------------------------------------------------------------------
  // 곧장 가는 점선(흐린 잔상) 대 서버를 거치는 실제 길
  essence(stage, t, p, ctx) {
    const c = stage.ctx, s7 = S(ctx, 's07'), s8 = S(ctx, 's08'), cam = CAM_FULL, T = trip(ctx, 'es');
    const recvB = fadeIn(t, T[5], 0.2);
    withCam(stage, cam, () => {
      world(stage, t, {recvB, screenB: 0.2 + 0.6 * recvB, active: fadeIn(t, T[2], 0.2) * fadeOut(t, T[3] + 0.3, 0.3)});
      // 곧장 잇는 길(흐린 점선 — 실제로 쓰지 않는 길)
      withAlpha(c, 0.35 * fadeIn(t, s8.start - 0.2, 0.5), () => line(c, [[PA.x + 70, PA.y - 30], [PB.x - 70, PB.y - 30]], rgba(PAL.muted, 0.8), 3, {dash: [8, 10]}));
      // 지나온 길의 흔적
      withAlpha(c, 0.5 * fadeIn(t, T[5], 0.4), () => LEGS.forEach(L => line(c, L, rgba(PAL.warm, 0.4), 3, {dash: [10, 10]})));
      tripRings(stage, t, T, PAL.warm); signal(stage, t, LEGS, T);
    });
    nodeLabel(stage, cam, [DOOR[0], DC.y], '서버', fadeIn(t, s7.start + 0.8, 0.4), -40, PAL.warmHi);
    nodeLabel(stage, cam, [530, 1030], '곧장?', 0.6 * fadeIn(t, s8.start, 0.5), 0, PAL.muted);
  },

  // ---------------------------------------------------------------------------------------------------
  // 내 전화 화면을 키운 렌즈: '가' → 44032 → 0과 1 스물네 칸 → 잠금(무늬가 바뀜) → 패킷 → 도착 주소 '서버'
  encode(stage, t, p, ctx) {
    const c = stage.ctx, s9 = S(ctx, 's09'), s10 = S(ctx, 's10'), s11 = S(ctx, 's11'), s12 = S(ctx, 's12');
    const cam = CAM_CLOSE;
    withCam(stage, cam, () => world(stage, t, {}));
    // 렌즈 테두리: 내 전화 화면의 말풍선 → 위 판
    const bub = toScreen(cam, [PA.x + 22, PA.y + 48]);
    const pa = fadeIn(t, ctx.scene.start, 0.5);
    unlitRect(stage, 60, 290, 960, 400, pa);
    withAlpha(c, pa, () => {
      panel(c, 70, 300, 940, 380, 0.94);
      line(c, [[bub[0], bub[1] - 28], [300, 680]], rgba(PAL.muted, 0.7), 2, {dash: [6, 6]});
      ring(c, bub[0], bub[1], 48, rgba(PAL.muted, 0.8), 2);
    });
    // ① '가' → 44032
    const tNum = evT(ctx, 'enc_num');
    withAlpha(c, pa, () => {
      rect(c, 120, 340, 110, 70, 14, PAL.warmLo);
      stage.text('가', 175, 392, {role: 'display', size: 50, weight: 700, color: '#F6EDE4', align: 'center'});
      const ar = fadeIn(t, W0(ctx, 's09', '유니코드', -0.2), 0.4);
      withAlpha(c, ar, () => { line(c, [[250, 375], [330, 375]], PAL.muted, 3); poly(c, [[330, 365], [346, 375], [330, 385]], PAL.muted); });
      withAlpha(c, fadeIn(t, tNum, 0.4), () => {
        stage.text('44032', 520, 402, {role: 'display', size: 86, weight: 700, color: PAL.warm, align: 'center'});
        stage.text('번 (유니코드 U+AC00)', 800, 398, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
      });
    });
    // ② 0과 1 — 스물네 칸이 하나씩 펼쳐짐(같은 시계: 사건 enc_bits 의 되풀이)
    const BITS = '111010101011000010000000';
    const bitT = ctx.events.get('enc_bits').time, bitDt = ctx.events.get('enc_bits').params?.interval ?? 0.06;
    const lockT = evT(ctx, 'enc_lock'), packT = evT(ctx, 'enc_pack'), addrT = evT(ctx, 'enc_addr');
    const lockQ = smooth((t - lockT) / 0.7), packQ = easeInOut((t - packT) / 0.8);
    const cells = [];
    for (let i = 0; i < 24; i++) cells.push({x: 148 + Math.floor(i / 8) * 268 + (i % 8) * 31, y: 470});
    withAlpha(c, pa, () => {
      for (let i = 0; i < 24; i++) {
        const show = fadeIn(t, bitT + i * bitDt, 0.08);
        if (show <= 0) continue;
        const scr = rand(i * 5.3 + 2) > 0.5 ? '1' : '0';
        const b = lockQ > 0.5 ? scr : BITS[i];
        const cx = lerp(cells[i].x, 540 - 14 + (i % 8 - 3.5) * 6, packQ), cy = lerp(cells[i].y, 590, packQ);
        withAlpha(c, show * (1 - packQ * 0.85), () => {
          rect(c, cx, cy, 28, 42, 5, b === '1' ? mix(PAL.warmLo, PAL.border, lockQ) : rgba('#2A2B30', 1), rgba(lockQ > 0.5 ? PAL.cool : '#55565C', 1), 1.5);
          stage.text(b, cx + 14, cy + 31, {size: 26, weight: 700, color: b === '1' ? '#F6EDE4' : PAL.muted, align: 'center'});
        });
      }
      const nb = Math.min(24, Math.max(0, Math.floor((t - bitT) / bitDt) + 1));
      withAlpha(c, fadeIn(t, bitT, 0.2) * (1 - packQ), () => stage.text(`${nb}개`, 540, 548, {size: 28, weight: 700, color: PAL.ink, align: 'center'}));
      withAlpha(c, fadeIn(t, lockT, 0.3) * (1 - packQ), () => stage.text('잠금 — 무늬가 바뀜', 540, 640, {size: 26, weight: 500, color: PAL.coolHi, align: 'center'}));
      // 패킷(봉투 모양의 묶음, 무광) + 도착 주소
      const ea = fadeIn(t, packT + 0.4, 0.4);
      if (ea > 0) withAlpha(c, ea, () => {
        rect(c, 400, 555, 280, 90, 10, '#C9C3B8', rgba('#8E887E', 1), 2);
        line(c, [[400, 557], [540, 610], [680, 557]], rgba('#8E887E', 1), 2);
        stage.text('패킷', 540, 632, {size: 26, weight: 700, color: '#2A2724', align: 'center'});
        const aa = fadeIn(t, addrT, 0.35);
        withAlpha(c, aa, () => {
          rect(c, 700, 560, 230, 70, 10, rgba(PAL.plate, 1), PAL.warm, 2);
          stage.text('도착 주소', 815, 588, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
          stage.text('메신저 서버', 815, 618, {size: 26, weight: 700, color: PAL.warmHi, align: 'center'});
          line(c, [[680, 595], [700, 595]], PAL.warm, 2);
        });
        // 친구 전화 쪽은 흐려짐
        const fa = fadeIn(t, addrT + 0.3, 0.5);
        withAlpha(c, 0.6 * (1 - fa) * aa, () => stage.text('친구 전화?', 220, 618, {size: 26, weight: 500, color: PAL.muted, align: 'center'}));
      });
    });
  },

  // ---------------------------------------------------------------------------------------------------
  // 패킷 → 전파 → 기지국 → 광케이블 속 빛 → (s15) 광케이블 확대: 거리 자와 시간 계기가 같은 시계
  route(stage, t, p, ctx) {
    const c = stage.ctx, s15 = S(ctx, 's15'), T = [evT(ctx, 'rt_send'), evT(ctx, 'rt_ant'), evT(ctx, 'rt_dc')];
    const zq = easeInOut((t - ctx.scene.start) / 1.2);
    const cam = camMix(CAM_CLOSE, CAM_FULL, zq);
    withCam(stage, cam, () => {
      world(stage, t, {});
      // 기다리는 동안(전파 다리 전·광케이블 뒤)에는 신호를 멈춘 자리에 둔다 — 여행 표가 정함
      if (t > T[0] - 0.05 && t < T[1] + 0.9) radioRings(stage, antOf(PA), ANT, T[0], t, PAL.warm, T[1] - T[0] + 0.2);
      signal(stage, t, [RADIO_UP, WIRE_UP], T);
      if (t < T[0]) lit(stage, cc => { const q = antOf(PA); circle(cc, q[0], q[1] + 20, 8, PAL.warm); circle(cc, q[0], q[1] + 20, 4, CORE(PAL.warm)); }, {gain: 0.6});
    });
    nodeLabel(stage, cam, [ANT[0], ANT[1]], '기지국', fadeIn(t, T[1] - 0.2, 0.3), -46);
    nodeLabel(stage, cam, [360, 850], '광케이블', fadeIn(t, W0(ctx, 's14', '광케이블', -0.2), 0.3), 0, PAL.muted);
    nodeLabel(stage, cam, [ANT[0] + 120, ANT[1] + 120], '(와이파이면 공유기)', 0.8 * fadeIn(t, T[1], 0.3) * fadeOut(t, ctx.tl.at('s14'), 0.3), 0, PAL.muted);
    // s15: 광케이블 확대
    const fa = fadeIn(t, s15.start - 0.6, 0.5);
    if (fa > 0) {
      unlitRect(stage, 60, 600, 960, 330, fa);
      withAlpha(c, fa, () => {
        panel(c, 70, 610, 940, 310, 0.95);
        const mid = toScreen(cam, CABLE[30]);
        line(c, [[mid[0], mid[1]], [200, 920]], rgba(PAL.muted, 0.6), 2, {dash: [6, 6]});
        // 유리 섬유: 겉(피복) · 속(유리)
        rect(c, 110, 720, 860, 58, 29, '#2E2F35');
        rect(c, 110, 736, 860, 26, 13, '#3E5560');
        for (let k = 0; k <= 4; k++) { const x = 130 + k * 205; line(c, [[x, 790], [x, 806]], PAL.muted, 2); stage.text(`${k * 10} km`, x, 836, {size: 24, weight: 500, color: PAL.muted, align: 'center'}); }
      });
      // 빛의 깜빡임(펄스 묶음) — 40 km 를 200마이크로초에 → 4초에 그림(2만 배)
      const t0 = evT(ctx, 'rt_fiber'), q = (t - t0) / 4.0;
      if (q > 0) lit(stage, cc => {
        withAlpha(cc, fa, () => {
          for (let j = 0; j < 6; j++) {
            const x = 130 + 820 * clamp(q) - j * 22; if (x < 130) continue;
            const on = rand(j * 2.1) > 0.3;
            if (on) { rect(cc, x - 7, 742, 14, 14, 4, PAL.warm); rect(cc, x - 4, 745, 8, 8, 3, CORE(PAL.warm)); }
          }
        });
      }, {gain: 0.8});
      withAlpha(c, fa, () => {
        const us = Math.round(200 * clamp(q));
        stage.text(`${(40 * clamp(q)).toFixed(0)} km · ${us}마이크로초`, 540, 690, {role: 'display', size: 44, weight: 700, color: PAL.ink, align: 'center'});
        stage.text('1 km 에 약 5마이크로초 · 1초면 약 20만 km', 540, 892, {size: 26, weight: 500, color: PAL.muted, align: 'center'});
      });
    }
  },

  // ---------------------------------------------------------------------------------------------------
  // 데이터센터 단면(카메라가 다가감): 패킷이 들어감 → 한 서버가 받음 → 받는 사람을 찾음 → '연결됨?'
  server(stage, t, p, ctx) {
    const c = stage.ctx, s17 = S(ctx, 's17');
    const zq = easeInOut((t - ctx.scene.start) / 1.4);
    const cam = camMix(CAM_FULL, CAM_DC, zq);
    const tIn = evT(ctx, 'sv_in'), tFind = evT(ctx, 'sv_find'), tChk = evT(ctx, 'sv_check');
    withCam(stage, cam, () => {
      world(stage, t, {active: fadeIn(t, tIn + 0.5, 0.2)});
      // 들어가는 패킷(문 → 가운데 랙)
      const q = clamp((t - tIn) / 0.6);
      if (t > tIn - 0.6 && q < 1) lit(stage, cc => {
        const y = lerp(DOOR[1] + 40, 512, easeOut(q));
        circle(cc, DOOR[0], y, 6, PAL.warm); circle(cc, DOOR[0], y, 3, CORE(PAL.warm));
      }, {gain: 0.85});
    });
    nodeLabel(stage, cam, [DOOR[0], DC.y - 26], '데이터센터', fadeIn(t, ctx.scene.start + 0.6, 0.4), 0);
    // 받는 사람 찾기 — 목록(무광 판) 위로 훑는 표시, 그다음 '연결됨?' 표시
    const la = fadeIn(t, tFind - 0.3, 0.4);
    if (la > 0) {
      unlitRect(stage, 150, 1090, 780, 150, la);
      withAlpha(c, la, () => {
        panel(c, 160, 1100, 760, 136);
        const names = ['받는 사람: 친구', '연결 상태'];
        stage.text(names[0], 340, 1152, {size: 28, weight: 700, color: PAL.ink, align: 'center'});
        const sweep = clamp((t - tFind) / 0.9);
        rect(c, 190, 1170, 300 * sweep, 6, 3, rgba(PAL.warm, 0.8));
        stage.text(names[1], 700, 1152, {size: 28, weight: 700, color: PAL.ink, align: 'center'});
        const ca = fadeIn(t, tChk, 0.3);
        withAlpha(c, ca, () => { rect(c, 600, 1176, 200, 40, 20, rgba(PAL.border, 1)); stage.text('확인 중', 700, 1205, {size: 26, weight: 500, color: PAL.coolHi, align: 'center'}); });
      });
    }
    void s17;
  },

  // ---------------------------------------------------------------------------------------------------
  // 조건 하나 — 친구 전화의 상태: ① 앱 연결됨 ② 앱 쉬는 중(알림 서버로 깨움) ③ 꺼짐(맡아 두었다가). 앞 경우의 길을 잔상으로
  deliver(stage, t, p, ctx) {
    const c = stage.ctx, s18 = S(ctx, 's18'), s19 = S(ctx, 's19'), s20 = S(ctx, 's20');
    const cam = CAM_FULL;
    const case_ = t < s19.start - 0.35 ? 0 : t < s20.start - 0.35 ? 1 : 2;
    // 각 경우의 여행: 데이터센터에서 나감(out) → 기지국 → 친구 전화
    const D1 = [evT(ctx, 'd1_out'), evT(ctx, 'd1_ant'), evT(ctx, 'd1_arr')];
    const D2 = [evT(ctx, 'd2_noti'), evT(ctx, 'd2_wake'), evT(ctx, 'd2_out'), evT(ctx, 'd2_ant'), evT(ctx, 'd2_arr')];
    const D3 = [evT(ctx, 'd3_hold'), evT(ctx, 'd3_on'), evT(ctx, 'd3_out'), evT(ctx, 'd3_ant'), evT(ctx, 'd3_arr')];
    const legsOut = [WIRE_DN, RADIO_DN];
    let screenB = 0.2, recvB = 0, offB = false, noticeB = 0;
    if (case_ === 0) { recvB = fadeIn(t, D1[2], 0.2); screenB = 0.25 + 0.55 * recvB; }
    if (case_ === 1) { screenB = 0.1 + 0.4 * fadeIn(t, D2[1], 0.2) + 0.35 * fadeIn(t, D2[4], 0.2); noticeB = fadeIn(t, D2[1], 0.2) * fadeOut(t, D2[4], 0.3); recvB = fadeIn(t, D2[4], 0.2); }
    if (case_ === 2) { offB = t < D3[1]; screenB = offB ? 0 : 0.25 + 0.55 * fadeIn(t, D3[4], 0.2); recvB = fadeIn(t, D3[4], 0.2); }
    withCam(stage, cam, () => {
      world(stage, t, {noti: fadeIn(t, s19.start - 0.6, 0.5), screenB, recvB, offB, noticeB, active: 0.6});
      // 앞 경우의 길(잔상)
      if (case_ >= 1) withAlpha(c, 0.35, () => line(c, [...WIRE_DN, ...RADIO_DN], rgba(PAL.warm, 0.5), 3, {dash: [10, 10]}));
      if (case_ >= 2) withAlpha(c, 0.35, () => line(c, [[DOOR[0], DC.y + 20], [NOTI.x + NOTI.w / 2, NOTI.y + 20], ...WIRE_DN.slice(6)], rgba(PAL.cool, 0.5), 3, {dash: [6, 10]}));
      if (case_ === 0) { signal(stage, t, legsOut, D1); if (t > D1[1] - 0.05) radioRings(stage, ANT, antOf(PB), D1[1], t, PAL.warm, D1[2] - D1[1] + 0.3); }
      if (case_ === 1) {
        // 알림(한색): 데이터센터 → 알림 서버 → 케이블 → 기지국 → 친구 전화
        const NL = [[[DOOR[0] - 10, DC.y + 40], [NOTI.x + NOTI.w, NOTI.y + 25]], [[NOTI.x + NOTI.w / 2, NOTI.y + NOTI.h], ...WIRE_DN.slice(Math.floor(WIRE_DN.length * 0.25))], RADIO_DN];
        const TN = [D2[0], D2[0] + 0.5, D2[0] + 1.3, D2[1]];
        signal(stage, t, NL, TN, {col: PAL.cool, size: 7});
        if (t > TN[2] - 0.05) radioRings(stage, ANT, antOf(PB), TN[2], t, PAL.cool, TN[3] - TN[2] + 0.3);
        // 깨어난 앱이 서버에 연결 → 메시지(난색)
        signal(stage, t, legsOut, [D2[2], D2[3], D2[4]]);
        if (t > D2[3] - 0.05) radioRings(stage, ANT, antOf(PB), D2[3], t, PAL.warm, D2[4] - D2[3] + 0.3);
      }
      if (case_ === 2) {
        // 보관함: 데이터센터 안에 머무는 메시지
        if (t < D3[2]) lit(stage, cc => { const y = 560 + 3 * Math.sin(t * 4); circle(cc, DOOR[0] + 30, y, 8, PAL.warm); circle(cc, DOOR[0] + 30, y, 4, CORE(PAL.warm)); }, {gain: 0.6});
        signal(stage, t, legsOut, [D3[2], D3[3], D3[4]]);
        if (t > D3[3] - 0.05) radioRings(stage, ANT, antOf(PB), D3[3], t, PAL.warm, D3[4] - D3[3] + 0.3);
      }
    });
    const stateB = case_ === 0 ? '앱 연결됨' : case_ === 1 ? (t < D2[1] ? '쉬는 중' : '깨어남') : (t < D3[1] ? '꺼짐' : '켜짐');
    nodeLabel(stage, cam, [PB.x, PB.y + 150], stateB, 1, 0, case_ === 0 ? PAL.ink : PAL.muted);
    nodeLabel(stage, cam, [PA.x, PA.y + 150], '내 전화', 1, 0, PAL.muted);
    if (case_ >= 1) nodeLabel(stage, cam, [NOTI.x + NOTI.w / 2, NOTI.y - 14], '알림 서버(운영체제)', fadeIn(t, s19.start - 0.2, 0.4), -6, PAL.coolHi);
    if (case_ === 2) {
      nodeLabel(stage, cam, [DOOR[0] + 30, DC.y + 210], '맡아 둠', fadeIn(t, D3[0], 0.3) * fadeOut(t, D3[2], 0.3), 0, PAL.warmHi);
      const sk = fadeIn(t, D3[1] - 0.6, 0.2) * fadeOut(t, D3[1] + 0.2, 0.3);
      nodeLabel(stage, cam, [PB.x, PB.y - 160], '켜질 때까지 건너뜀', sk, 0, PAL.muted);
    }
    // 계기: 세 경우의 상태 칩(지금 것 밝게, 끝난 것은 '전달')
    const chips = [['앱 연결됨', D1[2]], ['앱 쉬는 중', D2[4]], ['꺼짐', D3[4]]];
    unlitRect(stage, 90, 290, 900, 90, 1);
    chips.forEach(([s, tArr], k) => {
      const x = 240 + k * 300, cur = k === case_, done = t > tArr;
      rect(c, x - 130, 300, 260, 66, 33, rgba(cur ? PAL.plate : '#1C1C1F', 0.95), cur ? PAL.warm : PAL.border, cur ? 3 : 2);
      stage.text(done ? `${s} · 전달` : s, x, 344, {size: 26, weight: 700, color: cur ? PAL.ink : PAL.muted, align: 'center'});
    });
    void s18;
  },

  // ---------------------------------------------------------------------------------------------------
  // 친구가 엶 → 읽음 신호(한색) → 서버 → 내 전화 → 숫자 1이 사라짐
  read(stage, t, p, ctx) {
    const c = stage.ctx, T = trip(ctx, 'rd');
    const cam = CAM_FULL;
    const oneA = 1 - smooth((t - T[5]) / 0.25);
    const openB = evT(ctx, 'rd_open');
    withCam(stage, cam, () => {
      world(stage, t, {recvB: 1, screenB: 0.8 + 0.1 * fadeIn(t, openB, 0.3), oneA, active: fadeIn(t, T[2], 0.2) * fadeOut(t, T[3] + 0.3, 0.3)});
      // 갈 때 길(난색 잔상) 과 올 때(한색)
      withAlpha(c, 0.3, () => LEGS.forEach(L => line(c, L, rgba(PAL.warm, 0.5), 3, {dash: [10, 10]})));
      tripRings(stage, t, T, PAL.cool, true);
      signal(stage, t, LEGS_REV, T, {col: PAL.cool, size: 8});
      // 친구가 대화방을 엶: 화면을 누르는 표시
      if (t > openB - 0.2 && t < openB + 0.8) withAlpha(c, 1 - smooth((t - openB) / 0.8), () => ring(c, PB.x, PB.y, 20 + 30 * smooth((t - openB) / 0.5), rgba('#FFFFFF', 0.7), 3));
    });
    nodeLabel(stage, cam, [PB.x, PB.y - 166], '읽음', fadeIn(t, T[0], 0.3) * fadeOut(t, T[1] + 0.5, 0.3), 0, PAL.coolHi);
    // 숫자 1 확대(내 전화의 말풍선)
    const za = fadeIn(t, ctx.tl.at('s22') - 0.4, 0.4);
    if (za > 0) {
      const b = toScreen(cam, [PA.x + 22, PA.y + 48]);
      withAlpha(c, za, () => {
        ring(c, b[0] - 40, b[1] + 6, 34, rgba(PAL.muted, 0.8), 2);
        line(c, [[b[0] - 66, b[1] - 18], [170, 860]], rgba(PAL.muted, 0.6), 2, {dash: [6, 6]});
        panel(c, 70, 780, 220, 150);
        rect(c, 150, 815, 110, 60, 14, PAL.warmLo);
        stage.text('가자', 205, 856, {size: 30, weight: 700, color: '#F6EDE4', align: 'center'});
        withAlpha(c, oneA, () => stage.text('1', 130, 870, {size: 40, weight: 700, color: PAL.warmHi, align: 'right'}));
        stage.text(oneA > 0.5 ? '안 읽음' : '읽음', 180, 912, {size: 24, weight: 500, color: oneA > 0.5 ? PAL.warmHi : PAL.coolHi, align: 'center'});
      });
    }
  },

  // ---------------------------------------------------------------------------------------------------
  // 데이터센터가 꺼짐 → 메시지가 서버 앞에서 멈춤 → 멈춘 시간(약 10시간 — 텍스트 수발신 일부 복구까지) → 옆자리에도
  myth(stage, t, p, ctx) {
    const c = stage.ctx, s23 = S(ctx, 's23'), s24 = S(ctx, 's24');
    const cam = CAM_FULL;
    const tOff = evT(ctx, 'my_off'), tSend = evT(ctx, 'my_send'), tStop = evT(ctx, 'my_stop');
    const dark = smooth((t - tOff) / 0.8);
    withCam(stage, cam, () => {
      world(stage, t, {dark, lights: 1, recvB: 0, screenB: 0.2, sentA: fadeIn(t, tSend - 0.3, 0.3), oneA: fadeIn(t, tSend - 0.3, 0.3)});
      // 메시지: 기지국 → 케이블 → 데이터센터 문 앞에서 멈춤
      const T = [tSend, tSend + 0.6, tStop];
      const tr = tripAt(Math.min(t, tStop), T);
      if (tr) {
        if (t < tSend + 0.9) radioRings(stage, antOf(PA), ANT, tSend, t, PAL.warm, 0.8);
        const legs = [RADIO_UP, WIRE_UP.slice(0, -3)];
        const pos = tripPos(legs, tr.k, tr.q);
        const blink = t > tStop ? 0.55 + 0.45 * Math.cos((t - tStop) * 5) : 1;
        lit(stage, cc => withAlpha(cc, blink, () => { circle(cc, pos[0], pos[1], 9, PAL.warm); circle(cc, pos[0], pos[1], 4.5, CORE(PAL.warm)); }), {gain: 0.8});
      }
      // s24: 곧장 잇는 길 — 흐린 잔상으로만(쓰지 않는 길)
      withAlpha(c, 0.3 * fadeIn(t, s24.start, 0.6), () => line(c, [[PA.x + 70, PA.y - 30], [PB.x - 70, PB.y - 30]], rgba(PAL.muted, 0.8), 3, {dash: [8, 10]}));
    });
    nodeLabel(stage, cam, [DOOR[0], DC.y], '서버 꺼짐', fadeIn(t, tOff + 0.4, 0.4), -40, PAL.muted);
    // 멈춘 시간 계기(텍스트 수발신 일부 복구까지 약 10시간 — 몇 초로 건너뜀)
    const ga = fadeIn(t, tStop, 0.4);
    if (ga > 0) {
      unlitRect(stage, 560, 680, 400, 140, ga);
      withAlpha(c, ga, () => {
        panel(c, 570, 690, 380, 126);
        const h = pw(t, [[tStop + 0.3, 0], [s23.end, 10]]);
        stage.text(`멈춘 시간 약 ${Math.round(h)}시간`, 760, 744, {size: 32, weight: 700, color: PAL.ink, align: 'center'});
        stage.text('글 메시지 일부 복구까지 · 빠르게', 760, 786, {size: 24, weight: 500, color: PAL.muted, align: 'center'});
      });
    }
    nodeLabel(stage, cam, [PB.x, PB.y - 166], '받지 못함', fadeIn(t, s24.start + 0.3, 0.4), 0, PAL.muted);
  },

  // ---------------------------------------------------------------------------------------------------
  close(stage, t, p, ctx) {
    const c = stage.ctx, last = ctx.tl.sentences[ctx.tl.sentences.length - 1], T = trip(ctx, 'cl');
    const recvB = fadeIn(t, T[5], 0.2);
    withCam(stage, CAM_FULL, () => {
      world(stage, t, {recvB, screenB: 0.2 + 0.6 * recvB, active: fadeIn(t, T[2], 0.2) * fadeOut(t, T[3] + 0.3, 0.3)});
      withAlpha(c, 0.4 * fadeIn(t, T[5], 0.4), () => LEGS.forEach(L => line(c, L, rgba(PAL.warm, 0.45), 3, {dash: [10, 10]})));
      tripRings(stage, t, T, PAL.warm); signal(stage, t, LEGS, T);
    });
    const ea = fadeIn(t, last.start - 0.3, 0.6);
    if (ea > 0) {
      unlitRect(stage, 0, 290, W, 300, 1);
      withAlpha(c, ea, () => {
        const g = c.createLinearGradient(0, 290, 0, 590); g.addColorStop(0, 'rgba(9,9,11,0)'); g.addColorStop(0.15, 'rgba(9,9,11,0.7)'); g.addColorStop(0.85, 'rgba(9,9,11,0.7)'); g.addColorStop(1, 'rgba(9,9,11,0)');
        c.fillStyle = g; c.fillRect(0, 290, W, 300);
        ['메시지는 친구의 전화로', '곧장 가지 않고, 숫자가 되어', '서버를 거쳐 갑니다'].forEach((s, i) => stage.text(s, 540, 350 + i * 64, {role: 'display', weight: 700, size: 48, color: i === 2 ? PAL.warmHi : PAL.ink, align: 'center', maxWidth: 980, ...so}));
        stage.text('다음 원리도 이어서 — 과학쑛츠', 540, 545, {size: 32, weight: 500, color: PAL.muted, align: 'center', alpha: fadeIn(t, last.start, 0.5)});
      });
    }
  },
};

// ---------- 전신(origin) ----------
// 모스 부호의 모양만(정성적): [시작(초), 길이(초)] — 점 짧게, 줄 길게
const MORSE = [[0, 0.12], [0.22, 0.36], [0.7, 0.12], [0.92, 0.12], [1.16, 0.36], [1.64, 0.36], [2.12, 0.12], [2.34, 0.36], [2.82, 0.12]];
const TRAVEL1 = 1.1;
function morseLevel(tt) { for (const m of MORSE) if (tt >= m[0] && tt < m[0] + m[1]) return 1; return 0; }
function pulse(stage, a, b, q, len) {
  const q0 = clamp(q - len), q1 = clamp(q);
  if (q1 <= q0) return;
  lit(stage, cc => {
    const p0 = [lerp(a[0], b[0], q0), lerp(a[1], b[1], q0)], p1 = [lerp(a[0], b[0], q1), lerp(a[1], b[1], q1)];
    line(cc, [p0, p1], PAL.warm, 8); line(cc, [p0, p1], CORE(PAL.warm), 3);
  }, {gain: 0.7});
}
function tape(stage, x, y, marks, t) {
  const c = stage.ctx, n = marks.length;
  if (n === 0) return;
  const len = 40 + n * 26;
  rect(c, x, y, 68, len, 4, PAL.paper);
  marks.forEach((m, i) => { const yy = y + 20 + i * 26; if (m[1] < 0.2) circle(c, x + 34, yy, 5, '#2A2724'); else rect(c, x + 31, yy - 9, 6, 18, 2, '#2A2724'); });
}

export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, MO = MORPH(ctx.tl), last = ctx.tl.sentences[ctx.tl.sentences.length - 1];
  if (id === 'hook' && t < MO[1]) { captionBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); posterTitle(stage, easeInOut((t - MO[0]) / (MO[1] - MO[0]))); hookKicker(stage, t, ctx, MO); return; }
  captionBand(stage.ctx); topBand(stage.ctx); unlitRect(stage, 0, 1230, W, 690, 1); unlitRect(stage, 0, 0, W, 120, 1);
  if (id === 'close' && t > last.start - 0.6) { progressBar(stage, t, ctx.tl.duration); return; }
  const L = titleList(id, ctx), a = (id === 'hook' ? 1 : smooth(ctx.scene.p / 0.04)) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  if (id === 'hook') {
    posterTitle(stage, 1);
    hookKicker(stage, t, ctx, MO);
    withAlpha(stage.ctx, fadeIn(t, MO[1], 0.4), () => progressBar(stage, t, ctx.tl.duration));
    return;
  }
  headList(stage, t, L, a);
  progressBar(stage, t, ctx.tl.duration);
}
/** hook 의 키커(시간 배율 선언) — 포스터 위 맨 위 줄. 머리글 제목은 포스터가 줄어든 뒤 */
function hookKicker(stage, t, ctx, MO) {
  const L = titleList('hook', ctx);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  if (t < MO[1]) {   // 포스터 동안: 키커만 아주 작게 맨 위(포스터 물음 위)
    const s = L[k][1];
    if (s) { unlitRect(stage, 0, 100, W, 60, 1); stage.text(s, 540, 128, {role: 'display', weight: 500, size: 28, color: PAL.warmHi, align: 'center', ...so}); }
    return;
  }
  headList(stage, t, L, 1);
}
