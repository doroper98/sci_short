// 감기 예방 주사가 없는 이유 — 외워야 할 얼굴이 너무 많다
// 모형 메모(brief.md 와 함께 둔다):
//  - 캡시드: 지름 약 30 nm, VP1·VP2·VP3·VP4 네 단백질이 한 벌(protomer)이고 60벌이 20면체 껍질을 이룬다.
//    바깥은 VP1·VP2·VP3, VP4 는 안쪽 RNA 쪽. 화면은 바깥 세 종류만 색으로 나누고 요철을 과장했다.
//  - 결합 자리: HRV14 탈출 돌연변이로 정의된 네 자리(NIm-IA·IB = VP1, NIm-II = VP2, NIm-III = VP3) 계열.
//    "자리의 모양"은 설명용 홈·돌기 모형이며 실제 입체 구조가 아니다.
//  - 교차 중화 행렬은 실제 측정 자료가 아니라 "대각선만 밝다"는 성질만 보이는 설명용 모형이다.
//  - 종류 수 169 = RV-A 80 + RV-B 32 + RV-C 57 (VP1 염기 차이로 정의한 유전형, 2026년 기준).
//  - 항체는 캡시드보다 훨씬 작지만 읽히도록 크게 그렸다. "얼굴"과 "외운다"는 비유다.
import {
  header, progressBar, endCard, drawLabel, leader, scaleBar,
  project, lambert, DrawQueue, rgba, mix, clamp, lerp, invLerp, smooth, easeOut, bump, rand,
  poly, line, circle, ring, sphere, glow, withAlpha, clipRect, clipEllipse, rect, arrow, curve, TAU,
} from '../../pipeline/render/index.mjs';

export const theme = 'noturno';

export const events = [];   // 소리까지 있는 사건은 sound.json 에 둔다(두 목록이 합쳐진다)

export const captionLayout = {
  faces: {y: 1480},
  many: {y: 1480},
};

export const titles = {
  hook: ['면역 · 바이러스', '감기 예방 주사\n왜 없을까', ''],
  origin: ['이름과 기록', '감기를 40여 년\n연구한 곳', ''],
  vaccine: ['백신의 원리', '얼굴 하나를\n외우게 한다', ''],
  faces: ['리노바이러스', '같은 자리,\n다른 모양', ''],
  many: ['원숭이 실험 · 2016', '50 종류를\n한 병에', ''],
  flu: ['대비', '독감은 왜\n되는가', ''],
  myth: ['흔한 오해', '', ''],
  close: ['', '', ''],
};

// ---------- 공통 모형 ----------
const VP = ['#6FD3C4', '#F2C063', '#9FB8E8'];        // VP1 · VP2 · VP3 (바깥 세 단백질)
const VP4 = '#8A7BA8';
const RV_A = 80, RV_B = 32, RV_C = 57, N_TYPES = RV_A + RV_B + RV_C;   // 169
const VIAL_FULL = '#E8A14A';

/** 종류마다 다른 색(16진수 — 툴킷의 mix/rgba 가 16진수만 받는다). 같은 종류는 영상 내내 같은 색. */
function typeCol(i, sat = 62, lum = 58) {
  const h = ((i * 137.508) % 360) / 360, s = sat / 100, l = lum / 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h * 12) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 60벌 protomer 의 구 위 위치(피보나치 배치). 20면체 껍질의 자리 분포를 대신하는 모형. */
const PROTOMERS = (() => {
  const n = 60, out = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i;
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
})();

/** 한 벌 안에서 VP1·VP2·VP3 가 놓인 접선 방향의 작은 치우침 */
const SUBS = [[0, 0], [0.62, 0.30], [-0.46, 0.52]];

/** 리노바이러스 입자. built = 0..1 이면 조립 중(바깥에서 날아와 자리에 앉는다). */
function capsid(stage, cx, cy, R, o = {}) {
  const {ctx} = stage;
  const {spin = 0, tilt = 0.28, type = 0, alpha = 1, dim = 0, built = 1, glowA = 0, rna = false, seed = 0} = o;
  const body = typeCol(type, 34, 26);
  if (glowA > 0) glow(ctx, cx, cy, R * 2.3, typeCol(type, 70, 62), glowA * 0.5);
  sphere(ctx, cx, cy, R, mix(body, '#07202a', dim * 0.7), {alpha, shade: '#04161d'});
  if (rna) {                                        // 안쪽 RNA 실(흐리게)
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const a = i / 90 * TAU * 2.6, rr = R * (0.26 + 0.17 * Math.sin(a * 1.7 + seed));
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8]);
    }
    curve(ctx, pts, rgba('#F2EDE4', 0.16 * alpha), 3);
  }
  const cam = {angle: spin, tilt, scale: R, cx, cy, distance: 9};
  const q = new DrawQueue();
  PROTOMERS.forEach((v, i) => {
    const seat = clamp((built - 0.45 * rand(i + seed * 7)) / 0.55, 0, 1);
    if (seat <= 0) return;
    const fly = 1 + (1 - easeOut(seat)) * 1.9;                       // 바깥에서 날아들어온다
    const up = [v[0] * fly, v[1] * fly, v[2] * fly];
    const e1 = unit([-v[2], 0, v[0]]), e2 = cross(v, e1);
    SUBS.forEach(([a, b], k) => {
      const w = up.map((c, m) => c + (e1[m] * a + e2[m] * b) * 0.17);
      const p = project(w, cam);
      if (p[2] < -0.1) return;                                       // 뒤쪽은 몸체에 가려진다
      const br = 0.35 + 0.65 * clamp(p[2] / 1.1, 0, 1);
      const col = mix(mix(VP[k], typeCol(type, 70, 60), 0.3), '#06202a', dim * 0.75);
      q.push(p[2], () => sphere(ctx, p[0], p[1], R * 0.135 * p[3], mix(col, '#ffffff', br * 0.18),
        {alpha: alpha * (0.45 + 0.55 * seat), shade: '#061b22'}));
    });
  });
  q.flush();
  ring(ctx, cx, cy, R, rgba(mix(typeCol(type, 60, 70), '#ffffff', 0.2), 0.3 * alpha * (1 - dim)), 2);
}

function unit(v) { const n = Math.hypot(...v) || 1; return v.map(c => c / n); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

/** 백신 병. fill = 0..1, 안에 떠 있는 종류 색 점 개수 = dots */
function vial(stage, x, y, w, h, o = {}) {
  const {ctx} = stage, T = stage.theme;
  const {fill = 1, label = '', dots = [], empty = false, alpha = 1, dim = 0} = o;
  withAlpha(ctx, alpha, () => {
    const col = empty ? rgba(T.border, 0.8) : rgba(mix(VIAL_FULL, '#06202a', dim * 0.6), 0.85);
    rect(ctx, x + w * 0.22, y - h * 0.16, w * 0.56, h * 0.16, 3, empty ? null : rgba('#C9CDD2', 0.8), rgba(T.border, 1), 2);
    rect(ctx, x, y, w, h, 8, rgba('#0A2A36', 0.75), rgba(T.border, 1), 2);
    if (!empty) {
      clipRect(ctx, x, y, w, h, 8, () => {
        rect(ctx, x, y + h * (1 - fill), w, h * fill, 0, col);
        dots.forEach((ti, k) => {
          const px = x + 8 + ((k * 37) % Math.max(1, w - 16)), py = y + h * (1 - fill) + 10 + ((k * 23) % Math.max(1, h * fill - 16));
          circle(ctx, px, py, 4.2, typeCol(ti, 70, 66));
        });
      });
    } else {
      for (let i = 0; i < 4; i++) line(ctx, [[x, y + h * (i + 0.5) / 4], [x + w, y + h * (i + 0.5) / 4]], rgba(T.border, 0.35), 1.5, {dash: [5, 7]});
      stage.text('?', x + w / 2, y + h / 2, {role: 'display', weight: 700, size: 46, align: 'center', color: rgba(T.muted, 0.9)});
    }
    rect(ctx, x, y, w, h, 8, null, rgba(T.border, 1), 2);
    if (label) stage.text(label, x + w / 2, y + h + 32, {size: 28, weight: 500, align: 'center', color: dim > 0.4 ? T.muted : T.ink});
  });
}

/** 좁은 빛줄기: 병 입구에서 목표까지. */
function beam(stage, from, to, a, col) {
  const {ctx} = stage;
  if (a <= 0) return;
  const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const w0 = 7, w1 = 34;
  poly(ctx, [[from[0] + nx * w0, from[1] + ny * w0], [to[0] + nx * w1, to[1] + ny * w1],
    [to[0] - nx * w1, to[1] - ny * w1], [from[0] - nx * w0, from[1] - ny * w0]], rgba(col, 0.16 * a));
  line(ctx, [from, to], rgba(col, 0.5 * a), 2.5);
}

/** 항체 Y. tip 쪽에 종류별 홈 모양(plug)이 달려 있다. */
function antibody(stage, x, y, s, ang, o = {}) {
  const {ctx} = stage;
  const {col = '#F2EDE4', alpha = 1, type = null, open = 1} = o;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  withAlpha(ctx, alpha, () => {
    const arm = 0.95 * s, sp = 0.52 * open;
    line(ctx, [[0, 0], [0, s * 1.05]], rgba(col, 0.9), s * 0.2);                       // 자루
    for (const sg of [-1, 1]) {
      const tip = [Math.sin(sp) * arm * sg, -Math.cos(sp) * arm];
      line(ctx, [[0, 0], tip], rgba(col, 0.9), s * 0.18);
      if (type !== null) plug(ctx, tip[0], tip[1], s * 0.34, Math.atan2(tip[1], tip[0]) + Math.PI / 2, type, col, sg < 0 ? 0 : 1);
      else circle(ctx, tip[0], tip[1], s * 0.17, rgba(col, 0.9));
    }
  });
  ctx.restore();
}

/** 종류 i 의 결합 자리 모양(홈·돌기). 같은 자리라도 종류마다 요철이 다르다. */
function profile(i, site, n = 9) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(0.55 + 0.45 * rand(i * 31 + site * 7 + k * 3));
  return out;
}

function plug(ctx, x, y, r, ang, type, col, site = 0) {
  const pr = profile(type, site), pts = [];
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  for (let k = 0; k < pr.length; k++) {
    const a = -Math.PI / 2 + (k / (pr.length - 1) - 0.5) * Math.PI * 1.1;
    pts.push([(k / (pr.length - 1) - 0.5) * 2 * r, r * 0.55 - pr[k] * r * 1.05]);
  }
  poly(ctx, [[-r, r * 0.9], ...pts, [r, r * 0.9]], rgba(col, 0.92), rgba('#06202a', 0.8), 1.5);
  ctx.restore();
}

/** 캡시드 표면 한 조각(확대). 네 결합 자리를 홈으로 그린다. 홈의 요철이 종류마다 다르다. */
function patch(stage, cx, cy, w, type, o = {}) {
  const {ctx} = stage, T = stage.theme;
  const {sites = 0, markN = 0, alpha = 1, h = 150} = o;
  withAlpha(ctx, alpha, () => {
    const face = typeCol(type, 55, 55), top = [];
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, x = cx - w / 2 + u * w;
      top.push([x, cy - Math.cos((u - 0.5) * 2.3) * 22 + 16]);
    }
    poly(ctx, [...top, [cx + w / 2, cy + h], [cx - w / 2, cy + h]],
      rgba(mix(typeCol(type, 30, 22), '#0a2531', 0.35), 0.95), rgba(face, 0.55), 2);
    for (let k = 1; k <= 2; k++) {                                   // VP 경계
      const u = k / 3, x = cx - w / 2 + u * w;
      line(ctx, [[x, cy - Math.cos((u - 0.5) * 2.3) * 22 + 16], [x, cy + h]], rgba(VP[k], 0.28), 2, {dash: [6, 8]});
    }
    for (let si = 0; si < 4; si++) {
      if (si >= sites) continue;
      const u = 0.16 + si * 0.227, x = cx - w / 2 + u * w, y = cy - Math.cos((u - 0.5) * 2.3) * 22 + 16;
      const pr = profile(type, si), W = w * 0.082, socket = [];
      for (let k = 0; k < pr.length; k++) socket.push([x - W + k * (2 * W / (pr.length - 1)), y + 4 + pr[k] * 30]);
      poly(ctx, [[x - W, y - 3], ...socket, [x + W, y - 3]], rgba('#041920', 0.95), rgba(face, 0.95), 2.5);
      if (si < markN) {
        ring(ctx, x, y + 20, W + 13, rgba(T.accent, 0.9), 2.5);
        stage.text(['IA', 'IB', 'II', 'III'][si], x, y + 68, {size: 20, weight: 500, align: 'center', color: T.accent});
      }
    }
  });
}

/** 교차 중화 행렬: 대각선만 밝다. n 칸(비대각선은 한 장의 어두운 판으로 그려 비용을 아낀다). */
function matrix(stage, x, y, S, n, o = {}) {
  const {ctx} = stage, T = stage.theme;
  const {lit = 1, alpha = 1, label = ''} = o;
  withAlpha(ctx, alpha, () => {
    rect(ctx, x, y, S, S, 6, rgba('#071E27', 0.95), rgba(T.border, 1), 2);
    const c = S / n, shown = Math.max(1, Math.round(n * lit));
    for (let i = 0; i < shown; i++) {
      const cs = Math.max(1.5, c);
      rect(ctx, x + i * c, y + i * c, cs, cs, c > 6 ? 2 : 0, rgba('#8FE6C8', 0.95));
    }
    if (c > 14) for (let i = 1; i < n; i++) {
      line(ctx, [[x + i * c, y], [x + i * c, y + S]], rgba(T.border, 0.5), 1);
      line(ctx, [[x, y + i * c], [x + S, y + i * c]], rgba(T.border, 0.5), 1);
    }
    stage.text(`${n} 종류`, x + S / 2, y + S + 26, {size: 24, weight: 500, align: 'center', color: T.muted});
    if (label) stage.text(label, x + S / 2, y - 18, {size: 22, weight: 500, align: 'center', color: T.muted});
  });
}

/** 글자 하나를 뜻과 함께. */
function hanja(stage, ch, mean, x, y, a) {
  const {ctx} = stage, T = stage.theme;
  withAlpha(ctx, a, () => {
    rect(ctx, x - 62, y - 62, 124, 124, 10, rgba('#0C2A37', 0.9), rgba(T.border, 1), 2);
    stage.text(ch, x, y - 4, {role: 'display', weight: 700, size: 76, align: 'center', color: T.ink});
    stage.text(mean, x, y + 92, {size: 26, weight: 500, align: 'center', color: T.accent});
  });
}

// ---------- 장면 ----------
export const scenes = {
  // 0초 프레임이 그대로 썸네일. 페이드인 없이 처음부터 다 보인다.
  hook(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const rv = E.has('reveal') ? smooth(invLerp(0, 1.3, t - E.get('reveal').time)) : 0;
    // 뒤쪽: 서로 다른 종류. 0초에도 색이 보이고(어둡게), reveal 에서 또렷해진다.
    const BG = [[130, 520], [345, 478], [690, 478], [880, 530], [130, 862], [882, 862],
      [300, 1296], [640, 1308], [885, 1206]];
    BG.forEach(([gx, gy], i) => capsid(stage, gx, gy + Math.sin(t * 0.7 + i) * 5, 52,
      {type: i * 17 + 5, spin: t * 0.2 + i, dim: 0.58 - 0.4 * rv}));
    // 가운데: 빛을 받는 한 종류
    capsid(stage, 500, 1030, 158, {type: 3, spin: t * 0.22, glowA: 1, rna: true});
    vial(stage, 96, 1046, 80, 140, {fill: 0.72, dots: [3]});
    beam(stage, [176, 1090], [500, 1030], 1, '#FFE3A8');
  },

  origin(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const A = s => ctx.tl.at(s), seg = (a, b) => smooth(invLerp(A(a), A(a) + b, t));
    const fade = (a, b) => clamp(invLerp(A(a) - 0.5, A(a) + 0.2, t) * (1 - invLerp(A(b) - 0.2, A(b) + 0.5, t)), 0, 1);

    // ① 어원 (s03)
    const a1 = fade('s03', 's04');
    if (a1 > 0.01) withAlpha(c, a1, () => {
      hanja(stage, '感', '느낄 감', 370, 640, seg('s03', 0.5));
      hanja(stage, '氣', '기운 기', 630, 640, seg('s03', 1.4));
      stage.text('감기', 500, 820, {role: 'display', weight: 700, size: 70, align: 'center', color: T.accent, alpha: seg('s03', 2.2)});
      const rows = [['한국', '감기 感氣'], ['중국', '감모 感冒'], ['일본', '풍사 風邪']];
      rows.forEach(([a, b], i) => withAlpha(c, seg('s03', 3.1 + i * 0.25), () => {
        stage.text(a, 330, 920 + i * 54, {size: 28, weight: 500, color: T.muted, align: 'right'});
        stage.text(b, 380, 920 + i * 54, {size: 30, weight: 500, color: T.ink});
      }));
      stage.text('옛말 · 고뿔', 500, 1110, {size: 30, weight: 500, align: 'center', color: T.muted, alpha: seg('s03', 4.1)});
    });

    // ② 1946 연구 기관과 자원자 (s04·s05)
    const a2 = fade('s04', 's06');
    if (a2 > 0.01) withAlpha(c, a2, () => {
      stage.text('1946', 500, 560, {role: 'display', weight: 700, size: 66, align: 'center', color: T.ink});
      stage.text('영국 솔즈베리', 500, 616, {size: 28, weight: 500, align: 'center', color: T.muted});
      // 병동 카드
      const bx = 300, by = 660, bw = 400, bh = 150, bp = seg('s04', 1.2);
      withAlpha(c, bp, () => {
        rect(c, bx, by, bw, bh, 8, rgba('#0C2A37', 0.95), rgba(T.border, 1), 2);
        poly(c, [[bx - 14, by], [bx + bw / 2, by - 44], [bx + bw + 14, by]], rgba('#13394A', 0.95), rgba(T.border, 1), 2);
        for (let i = 0; i < 5; i++) rect(c, bx + 28 + i * 70, by + 40, 44, 54, 3, rgba('#FFE3A8', 0.18), rgba(T.border, 0.8), 1.5);
        stage.text('감기 연구 기관', bx + bw / 2, by + bh - 24, {size: 26, weight: 500, align: 'center', color: T.ink});
      });
      // 열흘 달력
      const cp = seg('s05', 0.6);
      withAlpha(c, cp, () => {
        for (let i = 0; i < 10; i++) {
          const x = 300 + (i % 5) * 82, y = 860 + Math.floor(i / 5) * 60;
          rect(c, x, y, 66, 46, 5, rgba('#0C2A37', 0.9), rgba(T.border, 1), 1.5);
          if (i < Math.floor(cp * 10 + 0.001)) rect(c, x + 4, y + 4, 58, 38, 3, rgba(T.accent, 0.35));
        }
        stage.text('열흘씩 머묾', 500, 1002, {size: 28, weight: 500, align: 'center', color: T.muted});
      });
      // 자원자 점 — 점 하나 = 20명
      const vp = seg('s05', 1.2), nd = Math.floor(vp * 500);
      for (let i = 0; i < nd; i++) {
        const x = 180 + (i % 40) * 17.4, y = 1082 + Math.floor(i / 40) * 15.2;
        circle(c, x, y, 3.4, rgba('#9FD9E8', 0.6));
      }
      if (vp > 0.2) stage.text('자원자 약 2만 명 · 점 하나 = 40명', 500, 1308, {size: 26, weight: 500, align: 'center', color: T.muted, alpha: vp});
    });

    // ③ 1956 분리와 이름 (s06)
    const a3 = clamp(invLerp(A('s06') - 0.5, A('s06') + 0.2, t) * (1 - invLerp(A('s07') - 0.3, A('s07') + 0.2, t)), 0, 1);
    if (a3 > 0.01) withAlpha(c, a3, () => {
      stage.text('1956', 500, 560, {role: 'display', weight: 700, size: 66, align: 'center', color: T.ink});
      const mp = seg('s06', 1.3);
      // 현미경 원 안의 입자
      ring(c, 500, 830, 196, rgba(T.border, 1), 3);
      clipEllipse(c, 500, 830, 193, 193, () => {
        rect(c, 300, 630, 400, 400, 0, rgba('#071E27', 0.9));
        capsid(stage, 500, 830, 118, {type: 3, spin: t * 0.3, rna: true, alpha: mp});
      });
      withAlpha(c, seg('s06', 2.4), () => {
        stage.text('rhino- = 코', 500, 1070, {role: 'display', weight: 500, size: 42, align: 'center', color: T.accent});
        stage.text('리노바이러스', 500, 1130, {size: 32, weight: 500, align: 'center', color: T.ink});
      });
    });

    // ④ 논문은 쌓이고 백신 칸은 빈다 (s07)
    const a4 = clamp(invLerp(A('s07') + 0.3, A('s07') + 0.9, t), 0, 1);
    if (a4 > 0.01) withAlpha(c, a4, () => {
      const pp = seg('s07', 2.2), n = Math.floor(pp * 24);
      for (let i = 0; i < n; i++) {
        const x = 150 + (i % 8) * 46, y = 980 - Math.floor(i / 8) * 34;
        rect(c, x, y, 40, 26, 3, rgba(mix('#9FD9E8', '#0C2A37', 0.35), 0.9), rgba(T.border, 0.9), 1.5);
      }
      stage.text('논문 천 편', 294, 1062, {size: 28, weight: 500, align: 'center', color: T.ink, alpha: pp});
      stage.text('40여 년', 500, 560, {role: 'display', weight: 700, size: 60, align: 'center', color: T.ink});
      // 빈 백신 칸
      vial(stage, 630, 812, 120, 200, {empty: true, label: '백신', alpha: smooth((pp - 0.45) / 0.3)});
    });
  },

  vaccine(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const A = s => ctx.tl.at(s);
    const fit = E.has('fit1') ? smooth(invLerp(0, 0.45, t - E.get('fit1').time)) : 0;
    const p3 = E.has('polio3') ? clamp(invLerp(0, 1.1, t - E.get('polio3').time), 0, 1) : 0;

    // 자리 둘과 거기에 맞물리는 항체 하나
    const PW = 420, PX = 500, sx = u => PX - PW / 2 + u * PW;
    const sh = clamp(invLerp(A('s08') - 0.3, A('s08') + 1.4, t), 0, 1);
    withAlpha(c, sh, () => {
      stage.text('껍질 표면의 자리', 500, 500, {size: 28, weight: 500, align: 'center', color: T.muted});
      patch(stage, PX, 700, PW, 3, {sites: 2, markN: 0});
      const drop = lerp(-190, 0, fit);
      antibody(stage, (sx(0.16) + sx(0.387)) / 2, 617 + drop, 100, Math.PI,
        {type: 3, col: fit > 0.5 ? '#FFE3A8' : '#F2EDE4'});
      if (fit > 0.5) glow(c, 404, 660, 200, '#FFE3A8', 0.3 * fit);
      drawLabel(stage, '항체', 118, 890, {key: '#F2EDE4', alpha: sh});
      drawLabel(stage, '맞물리면 막는다', 320, 890, {key: '#FFE3A8', alpha: fit});
    });

    // 홍역 1 · 소아마비 3 · 리노바이러스 169
    const cmpA = clamp(invLerp(A('s09') - 0.4, A('s09') + 0.6, t), 0, 1);
    withAlpha(c, cmpA, () => {
      stage.text('외워야 할 얼굴 수', 120, 950, {size: 26, weight: 500, color: T.muted});
      const rows = [
        ['홍역', 1, smooth(invLerp(A('s09'), A('s09') + 1.2, t))],
        ['소아마비', 3, p3],
        ['리노바이러스', N_TYPES, 0],
      ];
      rows.forEach(([name, n, on], i) => {
        const y = 990 + i * 118, last = i === 2;
        withAlpha(c, last ? smooth(invLerp(A('s10') + 2.0, A('s10') + 3.0, t)) : 1, () => {
          stage.text(name, 120, y, {size: 30, weight: 500, color: last ? T.accent : T.ink});
          for (let k = 0; k < Math.min(n, 3); k++) {
            const litN = Math.round(on * Math.min(n, 3));
            circle(c, 134 + k * 46, y + 48, 18, k < litN ? typeCol(k * 37 + 5, 66, 60) : rgba(T.border, 0.9));
          }
          if (n > 3) {
            stage.text('…', 278, y + 48, {size: 34, weight: 500, color: T.muted});
            for (let k = 0; k < 9; k++) circle(c, 316 + k * 24, y + 48, 9, typeCol(k * 23 + 9, 60, 52));
          }
          stage.text(last ? '169' : String(n), 830, y + 48, {role: 'display', weight: 700, size: 52, align: 'right', color: last ? T.accent : T.ink});
          stage.text('가지', 866, y + 54, {size: 24, weight: 500, color: T.muted});
        });
      });
    });
  },

  // 3단 계기판: 상단 전체 입자 · 중단 결합 자리 확대 · 하단 교차 중화 행렬
  faces(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const A = s => ctx.tl.at(s);
    const ae = E.has('assemble') ? t - E.get('assemble').time : -99;
    const built = ae < 0 ? 1 : clamp(invLerp(-0.1, 2.0, ae), 0, 1);   // s12 에서 흩어졌다 다시 모인다
    const sitesOn = E.has('siteon') ? clamp(invLerp(0, 1.5, t - E.get('siteon').time), 0, 1) : 0;
    const missA = E.has('missB') ? smooth(invLerp(0, 0.5, t - E.get('missB').time)) : 0;
    const mtx = clamp(invLerp(A('s14') - 0.3, A('s14') + 1.2, t), 0, 1);   // 측정값 단은 s14 부터
    const others = E.has('others') ? clamp(invLerp(0, 1.2, t - E.get('others').time), 0, 1) : 0;

    // ── 상단: 입자 전체 (추적 표식 = 종류 A)
    const shrink = smooth(invLerp(A('s13') - 0.6, A('s13') + 0.4, t));
    const R = lerp(150, 84, shrink), cxT = lerp(500, 188, shrink), cyT = lerp(620, 540, shrink);
    capsid(stage, cxT, cyT, R, {type: 3, spin: t * 0.2, built, rna: true});
    ring(c, cxT, cyT, R + 15, rgba(T.accent, 0.75 * (0.55 + 0.45 * Math.sin(t * 2))), 2.5);
    stage.text('종류 A', cxT, cyT + R + 40, {size: 26, weight: 500, align: 'center', color: T.accent, alpha: shrink});
    if (shrink < 0.99) withAlpha(c, 1 - shrink, () => {
      scaleBar(stage, 640, 820, 150, '30 nm');
      stage.text(`단백질 네 종류 × ${Math.round(built * 60)}벌`, 500, 882,
        {size: 30, weight: 500, align: 'center', color: T.ink});
    });
    // VP 범례는 줄어든 뒤 옆자리로
    withAlpha(c, shrink, () => {
      [['VP1', VP[0]], ['VP2', VP[1]], ['VP3', VP[2]], ['VP4 (안쪽)', VP4]].forEach(([n, col], i) =>
        drawLabel(stage, n, 330 + (i % 2) * 180, 492 + Math.floor(i / 2) * 44, {key: col}));
    });

    // ── 중단: 같은 자리, 다른 모양 (종류 A · B)
    if (shrink > 0.05) withAlpha(c, shrink, () => {
      const y0 = 700, PW = 300;
      patch(stage, 320, y0, PW, 3, {sites: 4, markN: Math.round(sitesOn * 4), h: 128});
      patch(stage, 712, y0, PW, 46, {sites: 4, markN: Math.round(sitesOn * 4), h: 128});
      stage.text('종류 A', 320, y0 + 162, {size: 26, weight: 500, align: 'center', color: T.accent});
      stage.text('종류 B', 712, y0 + 162, {size: 26, weight: 500, align: 'center', color: typeCol(46, 60, 68)});
      // A 에 생긴 항체: A 의 자리 IA·IB 에 앉고, B 에서는 떠서 어긋난다
      const seat = smooth(invLerp(A('s13') + 1.2, A('s13') + 2.2, t));
      antibody(stage, 320 - PW / 2 + PW * 0.273, y0 - lerp(130, 2, seat), 66, Math.PI,
        {type: 3, col: seat > 0.6 ? '#FFE3A8' : '#F2EDE4'});
      if (seat > 0.6) stage.text('맞물림', 320, y0 + 196, {size: 26, weight: 500, align: 'center', color: '#FFE3A8', alpha: (seat - 0.6) / 0.4});
      if (missA > 0) {
        const jx = Math.sin(t * 9) * 3 * missA;
        antibody(stage, 712 - PW / 2 + PW * 0.273 + jx, y0 - 42, 66, Math.PI + 0.09 * missA, {type: 3, col: '#F2EDE4', alpha: missA});
        line(c, [[712 - PW / 2 + 36, y0 - 6], [712 - PW / 2 + 128, y0 - 6]], rgba('#E86A4A', 0.9 * missA), 3, {dash: [7, 6]});
        stage.text('어긋남', 712, y0 + 196, {size: 26, weight: 500, align: 'center', color: '#E86A4A', alpha: missA});
      }
    });

    // ── 하단 ①: 교차 중화 행렬 (2 → 10 → 169). others 가 뜨면 뒤로 물러난다.
    const mA = mtx * (1 - clamp(others * 2.6, 0, 1));          // 행렬이 먼저 빠지고 다음 판이 든다
    if (mA > 0.01) {
      const stepT = t - (A('s14') - 0.3);
      const n = stepT < 3.4 ? 2 : stepT < 6.0 ? 10 : N_TYPES;
      matrix(stage, 292, 1020, 250, n, {alpha: mA, label: '교차 중화 (설명용 모형)'});
      withAlpha(c, mA, () => {
        stage.text(n === N_TYPES ? '169 가지 가운데 1' : `${n} 가지 가운데 1`, 596, 1104,
          {role: 'display', weight: 700, size: 42, color: T.accent});
        stage.text('대각선만 밝다', 596, 1152, {size: 26, weight: 500, color: T.ink});
        if (n === N_TYPES) {                                        // 169 의 내역
          let x = 596;
          const bw = 268;
          [['A', RV_A, VP[0]], ['B', RV_B, VP[1]], ['C', RV_C, VP[2]]].forEach(([nm, v, col]) => {
            const w = bw * v / N_TYPES;
            rect(c, x, 1232, w, 20, 3, rgba(col, 0.85));
            stage.text(`${nm} ${v}`, x + w / 2, 1212, {size: 20, weight: 500, align: 'center', color: col});
            x += w;
          });
        }
      });
    }

    // ── 하단 ②: 감기 원인은 리노바이러스만이 아니다
    const oA = clamp((others - 0.38) / 0.62, 0, 1);
    if (oA > 0.01) withAlpha(c, oA, () => {
      rect(c, 120, 1092, 760, 236, 10, rgba('#0C2A37', 0.96), rgba(T.border, 1), 2);
      stage.text('감기를 일으키는 바이러스', 500, 1132, {size: 28, weight: 500, align: 'center', color: T.muted});
      const chips = [['리노', T.accent], ['코로나', VP[0]], ['RSV', VP[1]], ['아데노', VP[2]], ['파라인플루엔자', VP4]];
      chips.forEach(([nm, col], i) => withAlpha(c, clamp((oA - i * 0.12) / 0.3, 0, 1), () => {
        const w = i === 4 ? 196 : 126, x = 148 + [0, 136, 272, 378, 492][i];
        rect(c, x, 1166, w, 48, 6, rgba(col, 0.16), rgba(col, 0.8), 2);
        stage.text(nm, x + w / 2, 1190, {size: i === 4 ? 21 : 23, weight: 500, align: 'center', color: col});
      }));
      stage.text('200 가지 넘음', 500, 1276, {role: 'display', weight: 700, size: 46, align: 'center', color: T.accent});
    });
  },

  many(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const A = s => ctx.tl.at(s);
    const fill = E.has('fill50') ? clamp(invLerp(0, 1.6, t - E.get('fill50').time), 0, 1) : 0;
    const ab = E.has('ab49') ? clamp(invLerp(0, 1.8, t - E.get('ab49').time), 0, 1) : 0;
    const third = clamp(invLerp(A('s20') - 0.3, A('s20') + 1.6, t), 0, 1);

    // 병 하나에 50 종류
    const nIn = Math.round(fill * 50);
    vial(stage, 120, 620, 150, 260, {fill: 0.1 + 0.68 * fill, dots: Array.from({length: nIn}, (_, i) => i * 7 + 2), label: '50 종류'});
    for (let i = nIn; i < 50; i++) {                                     // 아직 병에 들어가지 않은 종류
      const x = 330 + (i % 10) * 56, y = 520 + Math.floor(i / 10) * 44 + Math.sin(t * 1.1 + i) * 4;
      circle(c, x, y, 9, rgba(typeCol(i * 7 + 2, 62, 58), 0.85));
    }
    if (nIn < 50) stage.text('리노바이러스 50 종류', 610, 486, {size: 26, weight: 500, align: 'center', color: T.muted, alpha: 1 - fill});
    // 항체 자리는 병이 차는 동안 미리 보이고, ab49 에서 하나씩 켜진다(1개는 끝까지 안 켜진다)
    const gridA = clamp(invLerp(0.5, 1.0, fill), 0, 1);
    if (gridA > 0.01) withAlpha(c, gridA, () => {
      const lit = Math.min(49, Math.round(ab * 49));
      for (let i = 0; i < 50; i++) {
        const x = 360 + (i % 10) * 56, y = 640 + Math.floor(i / 10) * 52;
        const on = i < lit;
        antibody(stage, x, y, 20, Math.PI, {col: on ? '#8FE6C8' : rgba(T.border, 0.95), alpha: on ? 1 : 0.75});
      }
      if (ab > 0.9) {
        const x = 360 + 9 * 56, y = 640 + 4 * 52;
        ring(c, x, y - 8, 26, rgba('#E86A4A', 0.9), 2.5);
        stage.text('1 종류는 안 생김', 700, 900, {size: 24, weight: 500, align: 'center', color: '#E86A4A'});
      }
      stage.text(ab > 0.02 ? `항체 ${Math.min(49, Math.round(ab * 49))} 종류` : '항체가 생길 자리 50',
        640, 596, {role: 'display', weight: 700, size: 42, align: 'center', color: ab > 0.02 ? '#8FE6C8' : T.muted});
    });

    // 169 칸 가운데 50 칸
    if (third > 0.01) withAlpha(c, third, () => {
      const x0 = 150, y0 = 980, cw = 44, ch = 26, cols = 16;
      stage.text('돌아다니는 리노바이러스 169 종류', 500, 952, {size: 26, weight: 500, align: 'center', color: T.muted});
      for (let i = 0; i < N_TYPES; i++) {
        const x = x0 + (i % cols) * cw, y = y0 + Math.floor(i / cols) * ch;
        const covered = i < Math.round(third * 50);
        rect(c, x, y, cw - 6, ch - 6, 2, covered ? rgba('#8FE6C8', 0.9) : rgba(T.border, 0.55));
      }
      stage.text('약 3분의 1', 500, 1286, {role: 'display', weight: 700, size: 50, align: 'center', color: T.accent});
      stage.text('50 / 169', 500, 1336, {size: 28, weight: 500, align: 'center', color: T.ink});
    });
  },

  flu(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const A = s => ctx.tl.at(s);
    const dr = E.has('drift') ? clamp(invLerp(0, 2.2, t - E.get('drift').time), 0, 1) : 0;
    const cal = E.has('cal') ? clamp(invLerp(0, 1.0, t - E.get('cal').time), 0, 1) : 0;

    // 왼쪽: 독감 — 같은 얼굴의 조금씩 바뀌는 판본
    stage.text('독감', 290, 560, {role: 'display', weight: 700, size: 46, align: 'center', color: '#F2C063'});
    stage.text('한 얼굴, 조금씩 바뀜', 290, 612, {size: 26, weight: 500, align: 'center', color: T.muted});
    for (let k = 0; k < 3; k++) {
      const on = clamp((dr - k * 0.3) / 0.35, 0, 1), y = 700 + k * 142;
      withAlpha(c, 0.25 + 0.75 * on, () => {
        // 표면 돌기가 해마다 조금씩 모양을 바꾸는 입자(모식도)
        const R = 48;
        sphere(c, 290, y, R, mix('#8A6A2A', '#0a2531', 0.35), {shade: '#06202a'});
        for (let i = 0; i < 18; i++) {
          // 같은 얼굴이지만 해마다 돌기 몇 개의 길이·방향이 조금씩 달라진다(항원 소변이, 모식도)
          const a = i / 18 * TAU + k * 0.1 + (k ? 0.16 * rand(i + k * 50) : 0);
          const L = R + 14 + 16 * (k ? rand(i + k * 20) : 0.5);
          const moved = k > 0 && rand(i + k * 20) > 0.68;
          const col = moved ? T.accent : '#F2C063';
          line(c, [[290 + Math.cos(a) * R, y + Math.sin(a) * R], [290 + Math.cos(a) * L, y + Math.sin(a) * L]], rgba(col, 0.85), 3.5);
          circle(c, 290 + Math.cos(a) * L, y + Math.sin(a) * L, moved ? 5.6 : 4.6, rgba(col, 0.95));
        }
        stage.text(['지난해', '올해', '내년'][k], 392, y - 8, {size: 24, weight: 500, color: T.ink});
        if (k > 0) stage.text('바뀐 자리', 392, y + 20, {size: 20, weight: 500, color: T.accent});
      });
    }
    // 오른쪽: 리노바이러스 — 처음부터 다른 얼굴 169개
    stage.text('감기', 730, 560, {role: 'display', weight: 700, size: 46, align: 'center', color: T.accent});
    stage.text('처음부터 다른 얼굴', 730, 612, {size: 26, weight: 500, align: 'center', color: T.muted});
    for (let i = 0; i < 24; i++) {
      const x = 604 + (i % 5) * 62, y = 694 + Math.floor(i / 5) * 62;
      capsid(stage, x, y, 25, {type: i * 13 + 1, spin: t * 0.18 + i, dim: 0.1});
    }
    stage.text('169 종류', 728, 1010, {size: 28, weight: 500, align: 'center', color: T.ink});

    // 조성 갱신: 2월·9월
    if (cal > 0.01) withAlpha(c, cal, () => {
      rect(c, 150, 1096, 700, 112, 8, rgba('#0C2A37', 0.95), rgba(T.border, 1), 2);
      stage.text('조성을 해마다 바꾼다', 500, 1130, {size: 28, weight: 500, align: 'center', color: T.ink});
      [['2월', '북반구'], ['9월', '남반구']].forEach(([m, h], i) => withAlpha(c, clamp((cal - i * 0.3) / 0.4, 0, 1), () => {
        const x = 330 + i * 340;
        stage.text(m, x, 1178, {role: 'display', weight: 700, size: 38, align: 'center', color: T.accent});
        stage.text(h, x + 70, 1182, {size: 24, weight: 500, align: 'center', color: T.muted});
      }));
      stage.text('세계보건기구 권고', 500, 1258, {size: 24, weight: 500, align: 'center', color: T.muted});
    });
  },

  myth(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const no = E.has('nope') ? smooth(invLerp(0, 0.6, t - E.get('nope').time)) : 0;
    stage.text('독감 주사를 맞으면 감기도 막아 줄까', 500, 620, {size: 32, weight: 500, align: 'center', color: T.muted});
    // 독감 입자(돌기) · 감기 입자(요철) — 빛줄기는 한쪽만 비춘다
    const R = 86;
    sphere(c, 330, 880, R, mix('#8A6A2A', '#0a2531', 0.3), {shade: '#06202a'});
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU, L = R + 18;
      line(c, [[330 + Math.cos(a) * R, 880 + Math.sin(a) * R], [330 + Math.cos(a) * L, 880 + Math.sin(a) * L]], rgba('#F2C063', 0.9), 3.5);
      circle(c, 330 + Math.cos(a) * L, 880 + Math.sin(a) * L, 4.6, rgba('#F2C063', 0.9));
    }
    stage.text('인플루엔자', 330, 1016, {size: 28, weight: 500, align: 'center', color: '#F2C063'});
    capsid(stage, 720, 880, R, {type: 3, spin: t * 0.25, dim: 0.55 * no, rna: true});
    stage.text('리노바이러스', 720, 1016, {size: 28, weight: 500, align: 'center', color: T.accent});
    vial(stage, 120, 1120, 76, 130, {fill: 0.7, label: '독감 주사'});
    beam(stage, [158, 1120], [330, 968], 1, '#F2C063');
    if (no > 0) {
      line(c, [[500, 1010], [640, 940]], rgba('#E86A4A', 0.8 * no), 3, {dash: [9, 8]});
      stage.text('다른 바이러스', 720, 1150, {role: 'display', weight: 700, size: 36, align: 'center', color: '#E86A4A', alpha: no});
      stage.text('막지 못한다', 720, 1200, {size: 28, weight: 500, align: 'center', color: T.ink, alpha: no});
    }
  },

  close(stage, t, p, ctx) {
    const {ctx: c} = stage, T = stage.theme, E = ctx.events;
    const en = E.has('end') ? clamp(invLerp(0, 1.4, t - E.get('end').time), 0, 1) : 0;
    endCard(stage, {
      kicker: '정리',
      takeaway: '외울 얼굴이 너무 많습니다',
      lines: ['백신은 얼굴 하나를 외우게 하는 훈련 · 리노바이러스 169 종류'],
      p, y: 560,
    });
    // 포스터 구도로 복귀
    const GX = [180, 380, 620, 820], GY = [980, 1180];
    let k = 1;
    for (const gy of GY) for (const gx of GX) {
      if (Math.abs(gx - 500) < 180 && Math.abs(gy - 1080) < 130) { k++; continue; }
      capsid(stage, gx, gy + Math.sin(t * 0.7 + k) * 4, 44, {type: k * 11, spin: t * 0.2 + k, dim: 0.55});
      k++;
    }
    capsid(stage, 500, 1080, 118, {type: 3, spin: t * 0.22, rna: true, glowA: en * 0.8});
  },
};

export function overlays(stage, t, ctx) {
  const [kicker, title, subtitle] = titles[ctx.scene.id] || ['', '', ''];
  // 0초 프레임 = 썸네일. 내레이션이 시작될 때(약 1초) 큰 제목이 머리글 크기로 줄어든다.
  const big = clamp(invLerp(1.3, 0.9, t), 0, 1);
  if (big > 0.01) {
    withAlpha(stage.ctx, big, () => {
      const s = lerp(60, 96, big);
      stage.text('감기 예방 주사', 500, lerp(300, 650, big), {role: 'display', weight: 700, size: s, align: 'center', color: stage.theme.ink});
      stage.text('왜 없을까', 500, lerp(372, 754, big), {role: 'display', weight: 700, size: s, align: 'center', color: stage.theme.accent});
    });
  }
  if (big < 0.99 && (title || kicker)) {
    withAlpha(stage.ctx, 1 - big, () => header(stage, {kicker, title, subtitle, p: ctx.scene.p}));
  }
  progressBar(stage, t, ctx.tl.duration);
}
