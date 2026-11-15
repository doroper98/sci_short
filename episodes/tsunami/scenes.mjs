// Episode scenes — 58 "쓰나미 — 낮고 빠르게 건너와, 얕은 곳에서 솟는다"
// 화풍 시험(2026-11-15 사용자 결정): 이 편만 픽셀 일러스트. 그림은 270×480 버퍼(px.mjs)에 그려 4배로 키우고, 글자는 그 위에 또렷하게 얹는다.
// 무대는 하나(world.mjs): 왼쪽 바다 밑 단층 → 깊은 바다 → 얕아지는 비탈 → 해안 마을. 장면은 카메라의 자리다.
// 모형·단순화는 world.mjs 머리와 brief.md 에 있다. 한 장면 안에서 물결의 화면 빠르기는 √수심에 비례한다(장면마다 돌리는 배율은 다르고, 빨리 돌릴 때는 머리글에 적는다).
// 소리 사건(sound.json)은 여기의 plan() 과 같은 문장·낱말 시각을 쓴다.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fontString, progressBar} from '../../pipeline/render/index.mjs';
import {Pix, W, H, SCALE, C, clamp, lerp, ease} from './px.mjs';
import * as M from './world.mjs';

const require = createRequire(new URL('../../pipeline/render/index.mjs', import.meta.url));
const {ImageData, GlobalFonts} = require('@napi-rs/canvas');
// 머리글 한 줄은 픽셀 글꼴(2026-11-15 사용자: "그리고 폰트는 e가 좋은데?" — 다섯 가지 가운데 E). 12 px 격자 글꼴이라 48 px 로 쓰면 그림의 픽셀(4 px)과 맞는다.
const PIXEL_FONT = fileURLToPath(new URL('../../assets/fonts/Galmuri11-Bold.ttf', import.meta.url));
if (!fs.existsSync(PIXEL_FONT)) throw new Error('머리글 글꼴이 없습니다: python3 episodes/tsunami/fetch_pixel_font.py 를 먼저 실행하세요 (assets/fonts/Galmuri11-Bold.ttf)');
GlobalFonts.registerFromPath(PIXEL_FONT, 'TsuPixel');

export const theme = 'noturno';
export const captionLayout = {};
export const events = [];
export function background() {}                      // 픽셀 그림이 화면을 다 채운다

const P = new Pix();
const {XF, X0, SL0, SL1, SH1, PXM, X_BPR, X_MAST, X_SIGN} = M;
const SEA = 170, SEIS = 35;                           // 수면의 줄(버퍼), 지진파 ÷ 쓰나미 빠르기(깊은 바다)
const AMB = '#F2A742', CREAM = '#FBEBC0', INK = '#F6EFE2', DIM = '#A9C4B4', SH = 'rgba(6,10,20,0.6)';
const FOOT = '가로는 크게 줄이고 세로는 키운 그림 · 설명 모형';

// ---------------------------------------------------------------------------------------------------------------
// 시간 계획: 문장·낱말 시각에서 모든 장면의 시계를 만든다
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
  // 발생 → 먼바다: 내려앉기 시작한 때부터 물결이 간다
  k.tBlink = Wd('s06', '지진입니다', 0.2);
  k.tSlip = Wd('s06', '솟으면', 0.5) - 0.1;
  k.tCol = Wd('s06', '통째로', 0.85) - 0.2;
  k.tRel = Wd('s07', '내려앉으며', 0.35) - 0.2;
  const oc = sc('ocean');
  k.rate = Math.min(14, (SL0 - 8 - X0) / (oc.end - k.tRel));                 // 먼바다 장면이 끝날 때 마루가 비탈 앞에 닿는다
  k.tBoatO = Wd('s11', '배는', 0.4) + 0.9;
  k.xBoat = M.crestX(k.rate * (k.tBoatO - k.tRel));                           // 그때 마루가 배 밑을 지난다
  // 첫 장면: 같은 배 밑을 지나고, 해안으로 건너뛴다
  k.tBoat = Wd('s02', '지나가도', 0.5) + 0.3;
  k.hRate = 46; k.hTau0 = M.tauAt(k.xBoat) - k.hRate * k.tBoat;
  k.tCut = S('s03') - 0.15;
  k.tLand = Wd('s03', '밀려듭니다', 0.8) + 0.1;
  k.hLevel = tt => -4.5 * ease(tt, k.tLand - 2.7, k.tLand - 1.7) + 17.9 * ease(tt, k.tLand - 0.8, k.tLand + 1.9);
  // 이름
  k.oTsu = Wd('s04', '쓰가', 0.45); k.oNami = Wd('s04', '나미가', 0.65); k.oHigh = Wd('s05', '항구에', 0.45);
  // 얕아짐: 장면 끝에 수심 10 m 자리에 닿는다(장면 안에서 배율은 하나)
  const sh = sc('shoal');
  k.shTau0 = k.rate * (sh.start - k.tRel); k.shEnd = M.tauAt(SL1);
  k.shRate = (k.shEnd - k.shTau0) / (sh.end - 0.5 - sh.start);
  k.tTen = Wd('s12', '수심 십', 0.55) + 0.1;
  k.tCmp = Wd('s13', '길던', 0.4) - 0.3; k.tCmp2 = Wd('s13', '에너지가', 0.65);
  // 도달: 해안선의 물 높이(픽셀)
  k.aA = Wd('s14', '닿기도', 0.4) - 0.5; k.aB = Wd('s14', '빠져나갑니다', 0.8) + 0.5; k.aC = S('s16') - 0.1; k.aD = Wd('s16', '밀려드는', 0.8) + 0.9;
  k.aE = S('s17') + 0.2; k.aF = k.aE + 1.7; k.aG = Math.max(k.aF + 1.6, Wd('s17', '크지', 0.75) + 0.9);
  k.aLevel = tt => -9 * ease(tt, k.aA, k.aB) + 22.4 * ease(tt, k.aC, k.aD) - 16.9 * ease(tt, k.aE, k.aF) + 20 * ease(tt, k.aF, k.aG);
  // 경보: 같은 지진을 처음부터 다시
  k.tQ = S('s18') + 0.35;
  k.tBpr = Wd('s19', '압력계가', 0.3) + 1.1;                                   // 마루가 압력계 위를 지난다
  k.wRate = M.tauAt(X_BPR) / (k.tBpr - k.tQ - 0.5);
  k.tArr = k.tQ + (X_MAST - M.FOCUS[0]) / (SEIS * k.wRate);
  k.tSo = Wd('s18', '그래서', 0.55);
  k.tHrs = Wd('s20', '약 스물두', 0.75) + 1.0;
  // 정리
  const cl = sc('close');
  k.tFast = Wd('s21', '그래서', 0.4) - 0.3;
  k.clTau0 = M.tauAt(k.xBoat - 250); k.clTauF = k.clTau0 + k.rate * (k.tFast - cl.start);
  k.clRate = (k.shEnd - k.clTauF) / (cl.end - 1.0 - k.tFast);
  k.tDeep = Wd('s21', '깊은', 0.5); k.tShal = Wd('s21', '얕은', 0.75);
  K = k; return k;
}

// ---------------------------------------------------------------------------------------------------------------
// 글자(또렷하게 얹는 것): 머리글 한 줄 · 계기 숫자 · 각주
// ---------------------------------------------------------------------------------------------------------------
function type(stage) {
  const {ctx} = stage;
  return {
    big(s, x, y, o = {}) { stage.text(s, x, y, {role: 'display', weight: 700, size: o.size || 64, color: o.color || INK, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 18}); },
    kicker(s, x = 60, y = 150, o = {}) { stage.text(s, x, y, {size: 26, weight: 700, color: AMB, tracking: 4, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 10}); },
    sans(s, x, y, o = {}) { stage.text(s, x, y, {size: o.size || 28, weight: o.weight || 500, color: o.color || CREAM, align: o.align || 'left', alpha: o.alpha ?? 1, shadow: SH, shadowBlur: 10}); },
    /** 머리글 한 줄: 픽셀 글꼴 48 px(글꼴의 한 칸 = 4 px), 한 칸 어긋난 어두운 그림자. y 는 글자 밑줄(4의 배수) */
    accent(s, x, y, o = {}) {
      ctx.save(); ctx.globalAlpha = o.alpha ?? 1; ctx.font = '48px TsuPixel'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = o.align || 'left';
      ctx.fillStyle = 'rgba(6,10,20,0.9)'; ctx.fillText(s, x + 4, y + 4); ctx.fillStyle = o.color || CREAM; ctx.fillText(s, x, y); ctx.restore();
    },
    gauge(name, value, x, a = 1, color = INK) {
      stage.text(name, x, 1238, {size: 26, weight: 500, color: DIM, alpha: a, shadow: SH, shadowBlur: 8});
      stage.text(value, x, 1287, {role: 'display', weight: 700, size: 48, color, alpha: a, shadow: SH, shadowBlur: 12});
    },
    /** 밝은 하늘 위의 이름표: 납작한 어두운 판 + 글자 */
    tag(s, x, y, o = {}) {
      const size = o.size || 26, a = o.alpha ?? 1; if (a <= 0.01) return;
      ctx.save(); ctx.font = fontString('body', size, 500); const w = ctx.measureText(s).width + 20, h = size + 14, al = o.align || 'left';
      const x0 = Math.round((al === 'center' ? x - w / 2 : al === 'right' ? x - w : x) / 4) * 4, y0 = Math.round((y - h / 2) / 4) * 4;
      ctx.globalAlpha = a * 0.86; ctx.fillStyle = '#172238'; ctx.fillRect(x0, y0, Math.ceil(w / 4) * 4, Math.ceil(h / 4) * 4); ctx.restore();
      stage.text(s, x0 + 10, y0 + Math.ceil(h / 4) * 2 + 1, {size, weight: 500, color: o.color || CREAM, alpha: a});
    },
    foot(s, a = 1) { stage.text(s, 60, 1342, {size: 24, weight: 500, color: DIM, alpha: a, shadow: SH, shadowBlur: 8}); },
    /** heading lines: [[text, t0, t1], …] — one at a time, same place */
    lines(t, list) { for (const [s, t0, t1] of list) { const a = ease(t, t0, t0 + 0.35) * (1 - ease(t, t1 - 0.35, t1)); if (a > 0.01) this.accent(s, 60, 284, {alpha: a}); } },
    stage, ctx,
  };
}
const blit = stage => stage.ctx.putImageData(new ImageData(P.upscale(), W * SCALE, H * SCALE), 0, 0);
const scr = (v, wx, yRel) => [(wx - Math.round(v.cx - W / 2)) * SCALE, (v.sea + yRel) * SCALE];
const num = n => Math.round(n).toLocaleString('en-US');
const signed = (m, d = 1) => (m >= 0 ? '+' : '−') + Math.abs(m).toFixed(d);
function gauges3(T, st, a, hm) {
  T.gauge('수심', st.shore ? '해안' : `${num(st.d)} m`, 60, a);
  T.gauge('빠르기', `시속 ${Math.round(st.kmh)} km`, 330, a, AMB);
  T.gauge('높이', `${(hm ?? st.hm).toFixed(1)} m`, 730, a);
}
// 그림 안의 자(픽셀): 가로·세로 괄호
function hbr(x0, x1, y, c) {
  const a = Math.max(0, x0), b = Math.min(W - 1, x1); P.rect(a, y, b - a + 1, 1, c);
  if (x0 >= 0) P.rect(x0, y - 2, 1, 5, c); else { P.px(1, y - 1, c); P.px(1, y + 1, c); P.px(2, y - 2, c); P.px(2, y + 2, c); }
  if (x1 < W) P.rect(x1, y - 2, 1, 5, c); else { P.px(W - 2, y - 1, c); P.px(W - 2, y + 1, c); P.px(W - 3, y - 2, c); P.px(W - 3, y + 2, c); }
}
function vbr(x, y0, y1, c) { P.rect(x, y0, 1, y1 - y0 + 1, c); P.rect(x - 2, y0, 5, 1, c); P.rect(x - 2, y1, 5, 1, c); }

// ---------------------------------------------------------------------------------------------------------------
// 장면
// ---------------------------------------------------------------------------------------------------------------
export const scenes = {
  // 0초 = 포스터(흰 물음 + 가장 큰 주제어). 그림은 0초부터 움직인다. 배 밑을 지난 낮은 물결을 해안에서 다시 본다.
  hook(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s2 = k.S('s02'), end = ctx.scene.end;
    const cut = ease(t, k.tCut, k.tCut + 0.9), pre = t < k.tCut + 0.45;
    const X = M.crestX(Math.max(0, k.hTau0 + k.hRate * t));
    const v = {t, sea: Math.round(lerp(262, SEA, ease(t, s2 - 0.5, s2 + 1.6))), cx: lerp(k.xBoat - 15, SH1 + 12, cut), boats: [k.xBoat, SL1 + 6],
      eta: pre ? x => M.pulse(x, X) : x => M.coastEta(x, t, k.hLevel, 30), mark: pre && t > s2 + 0.2 ? X : null, calm: pre ? 1 : 0.6};
    M.drawWorld(P, v); blit(stage);
    const a0 = 1 - ease(t, s2 - 0.6, s2 - 0.1);
    if (a0 > 0) {
      T.big('어떻게 생기고,', 60, 250, {size: 62, alpha: a0}); T.big('어떻게 바다를 건널까?', 60, 330, {size: 62, alpha: a0});
      T.big('쓰나미', 56, 500, {size: 168, color: AMB, alpha: a0});
    }
    const ga = ease(t, s2 + 0.3, s2 + 0.9);
    if (ga > 0) {
      T.kicker(pre ? '먼바다' : '해안', 60, 150, {alpha: ga});
      const st = pre ? M.state(X) : M.state(Math.min(SH1, SH1 - 4 - 30 * (k.tLand - 0.8 - t)));
      gauges3(T, st, ga); T.foot(FOOT, ga);
    }
    T.lines(t, [['먼바다의 배는 알아채지 못합니다', s2 + 0.2, k.tCut + 0.1], ['해안에서는 몇 미터의 물이 됩니다', k.tCut + 0.8, end + 1]]);
  },

  // 이름: 津(쓰, 항구) + 波(나미, 파도). 먼바다에서 돌아온 배가 항구에서 물이 닿았던 높이를 본다.
  origin(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s5 = k.S('s05'), e5 = k.E('s05'), end = ctx.scene.end;
    const v = {t, sea: SEA, cx: SH1 + 26, boats: [lerp(SH1 - 150, SL1 - 16, ease(t, s5 + 0.2, e5 - 0.2)), SL1 + 6], high: t > k.oHigh ? 13.4 : 0};
    M.drawWorld(P, v); blit(stage);
    T.kicker('이름의 뜻');
    const out = 1 - ease(t, s5 - 0.5, s5 - 0.1), a1 = ease(t, k.oTsu - 0.15, k.oTsu + 0.2) * out, a2 = ease(t, k.oNami - 0.15, k.oNami + 0.2) * out;
    const han = (ch, read, mean, x, a) => {
      if (a <= 0.01) return;
      stage.text(ch, x, 292, {size: 150, weight: 700, color: INK, align: 'center', alpha: a, shadow: SH, shadowBlur: 18});
      stage.text(read, x - 12, 408, {role: 'display', weight: 700, size: 46, color: AMB, align: 'right', alpha: a, shadow: SH, shadowBlur: 12});
      stage.text(mean, x + 12, 408, {role: 'display', weight: 500, size: 46, color: CREAM, align: 'left', alpha: a, shadow: SH, shadowBlur: 12});
    };
    han('津', '쓰', '항구', 300, a1); han('波', '나미', '파도', 660, a2);
    T.lines(t, [['항구에 와서야 보이는 파도', s5 + 0.2, end + 1]]);
    const ha = ease(t, k.oHigh, k.oHigh + 0.4);
    if (ha > 0) { const [x, y] = scr(v, SH1 + 66, -13.4); T.tag('물이 닿았던 높이', x, y - 30, {alpha: ha}); }
    T.foot('이름의 유래는 널리 알려진 설명입니다', ease(t, s5, s5 + 0.5));
  },

  // 발생: 단층이 어긋남 → 바닥이 솟음 → 그 위의 물이 통째로 들림 → 내려앉으며 양쪽으로 퍼짐 → 물 전체가 움직이는 파도
  source(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s7 = k.S('s07'), s8 = k.S('s08'), end = ctx.scene.end;
    const up = ease(t, k.tSlip, k.tSlip + 0.55), age = t - k.tSlip, tau = k.rate * Math.max(0, t - k.tRel), XR = M.crestX(tau), XL = X0 - tau;
    const eta = x => up * (M.pulse(x, XR) + M.pulse(x, XL));
    const blink = clamp(1 - Math.abs(t - k.tBlink - 0.45) / 0.45) * 0.8;
    const SRC = SEA - 30, crestM = up * (1 + Math.exp(-(((2 * tau) / 70) ** 2)));          // 단층이 계기 위에 보이도록 카메라를 조금 내린다
    const v = {t, up, eta, boats: [k.xBoat, SL1 + 6], sea: Math.round(lerp(SRC, SEA, ease(t, s8 - 0.4, s8 + 1.6))),
      cx: lerp(XF + 30, XR + 20, ease(t, s8 - 0.4, s8 + 1.6)), fault: Math.max(blink, age > 0 ? clamp(1 - age / 1.8) : 0),
      seis: age > 0 && age < 1.4 ? {r: SEIS * k.rate * age, a: 0.85 * (1 - age / 1.4)} : null, mark: t > k.tCol ? XR : null};
    M.drawWorld(P, v);
    const wa = ease(t, s8 + 0.4, s8 + 0.9);                                     // 바람 파도는 표면만
    if (wa > 0.5) { const sx = Math.round(XR + 74 - (v.cx - W / 2)); vbr(sx, v.sea + 1, v.sea + 7, C.cream); }
    blit(stage);
    T.kicker('발생');
    T.lines(t, [['바다 밑 지진', k.S('s06') + 0.2, k.tSlip - 0.15], ['바닥이 솟은 만큼 물도 들립니다', k.tSlip + 0.35, s7 - 0.2],
      ['내려앉으며 양쪽으로 퍼집니다', s7 + 0.2, s8 - 0.3], ['물 전체가 움직이는 파도', s8 + 0.2, end + 1]]);
    const fl = ease(t, k.tBlink, k.tBlink + 0.3) * (1 - ease(t, s7 - 0.5, s7));
    if (fl > 0) { const [x, y] = scr(v, XF + 84, M.faultY(XF + 78)); T.sans('단층', x, y, {size: 26, alpha: fl}); }
    if (wa > 0) {
      const [x1, y1] = scr(v, XR + 80, 4); T.sans('바람 파도 · 표면만', x1, y1, {size: 26, alpha: wa});
      const cb = ease(t, k.Wd('s08', '바닥부터', 0.45), k.Wd('s08', '바닥부터', 0.45) + 0.4), [x2, y2] = scr(v, XR + 4, 66);
      T.sans('쓰나미 · 바닥까지', x2, y2, {size: 26, alpha: cb});
    }
    const g1 = ease(t, k.tBlink, k.tBlink + 0.5) * (1 - ease(t, s8 - 0.4, s8)), g2 = ease(t, s8, s8 + 0.5);
    if (g1 > 0) { T.gauge('바닥이 솟은 높이', `${(2 * up).toFixed(1)} m`, 60, g1, AMB); T.gauge('수면이 솟은 높이', `${crestM.toFixed(1)} m`, 420, g1); }
    if (g2 > 0) gauges3(T, M.state(XR), g2, crestM);
    T.foot(FOOT);
  },

  // 먼바다: 길고(수백 km) 낮고(1 m) 빠르다(수심이 정한다). 배는 천천히 오르내릴 뿐이다.
  ocean(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s9 = k.S('s09'), s10 = k.S('s10'), s11 = k.S('s11'), end = ctx.scene.end;
    const tau = k.rate * (t - k.tRel), XR = M.crestX(tau), XL = X0 - tau, eta = x => M.pulse(x, XR) + M.pulse(x, XL);
    const tp = k.Wd('s10', '여객기에', 0.85) - 1.4, tdeep = k.Wd('s10', '깊을수록', 0.3);
    const v = {t, sea: SEA, eta, cx: XR + 20, boats: [k.xBoat, SL1 + 6], mark: XR,
      plane: t > tp ? {x: XR + lerp(-185, 24, ease(t, tp, tp + 3.4)) + k.rate * 0.26 * (t - tp), y: SEA - 82} : null};
    M.drawWorld(P, v);
    const sx = wx => Math.round(wx - (v.cx - W / 2));
    const tw = k.Wd('s09', '물결 하나의', 0.3), tt = k.Wd('s09', '쓰나미는', 0.75);
    const aw = ease(t, tw, tw + 0.3) * (1 - ease(t, s10 - 0.5, s10)), at = ease(t, tt, tt + 0.3) * (1 - ease(t, s10 - 0.5, s10));
    if (aw > 0.5) hbr(sx(XR + 14), sx(XR + 21), SEA - 6, C.ink);
    if (at > 0.5) hbr(sx(XR - 122), sx(XR + 200), SEA - 15, C.ink);
    const td = k.Wd('s10', '바다 깊이', 0.1), ad = ease(t, td, td + 0.3) * (1 - ease(t, s11 - 0.5, s11));
    if (ad > 0.5) vbr(sx(XR - 96), SEA + 2, SEA + Math.round(M.bed0(XR - 96)) - 2, C.cream);
    const th = k.Wd('s11', '높이는', 0.08), ah = ease(t, th, th + 0.3) * (1 - ease(t, k.tBoatO - 1.2, k.tBoatO - 0.7));
    if (ah > 0.5) vbr(sx(XR - 30), SEA - Math.round(eta(XR)), SEA, C.ink);
    blit(stage);
    T.kicker('먼바다');
    T.lines(t, [['물결 하나가 수백 킬로미터', s9 + 0.2, s10 - 0.3], ['빠르기는 수심이 정합니다', s10 + 0.2, tdeep - 0.2], ['깊을수록 빠릅니다', tdeep, s11 - 0.3], ['높이는 커도 1미터 안팎', s11 + 0.2, end + 1]]);
    if (aw > 0) { const [x, y] = scr(v, XR + 26, -6); T.tag('바람 파도 · 100 m쯤', x + 12, y - 2, {alpha: aw}); }
    if (at > 0) { const [x, y] = scr(v, XR + 20, -15); T.tag('쓰나미 · 수백 km', x - 120, y - 34, {alpha: at, align: 'center', color: '#F7C766'}); }
    if (ad > 0) { const [x, y] = scr(v, XR - 96, 56); T.sans('수심 4,000 m', x + 22, y, {size: 26, alpha: ad}); T.sans('빠르기 = √(중력가속도 × 수심)', x + 22, y + 44, {size: 26, alpha: ad * ease(t, td + 0.8, td + 1.2), color: '#F7C766'}); }
    if (ah > 0) { const [x, y] = scr(v, XR - 30, -2); T.tag('1 m 안팎', x - 16, y - 8, {alpha: ah, align: 'right', color: '#F7C766'}); }
    const pa = t > tp ? ease(t, tp + 2.6, tp + 3.2) : 0;
    if (pa > 0) { const [x, y] = scr(v, v.plane.x, 0); T.sans('여객기 · 시속 약 900 km', x - 40, v.plane.y * SCALE + 38, {size: 26, alpha: pa, align: 'center'}); }
    gauges3(T, M.state(XR), 1); T.foot(FOOT);
  },

  // 얕아짐: 바닥이 올라옴 → 앞이 느려짐 → 뒤가 따라붙음 → 짧게 눌림 → 높이 솟음. 깊은 곳의 물결 모양을 같은 자 위에 남겨 견준다.
  shoal(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), sh = ctx.scene, s13 = k.S('s13');
    const XR = M.crestX(Math.min(k.shTau0 + k.shRate * (t - sh.start), k.shEnd)), eta = x => M.pulse(x, XR);
    const v = {t, sea: SEA, eta, cx: Math.min(XR + 28, SH1 - 30), boats: [k.xBoat, SL1 + 6], mark: XR};
    M.drawWorld(P, v);
    const ten = ease(t, k.tTen, k.tTen + 0.3), sx10 = Math.round(SL1 - (v.cx - W / 2));
    if (ten > 0.5 && sx10 < W) { for (let y = SEA + 1; y < SEA + Math.round(M.bed0(SL1)); y += 2) P.px(sx10, y, C.gold); P.glow(sx10, SEA + 5, 8, C.amber, 0.45); }
    const cmp = ease(t, k.tCmp, k.tCmp + 0.4);
    if (cmp > 0.5) M.drawCompare(P, 15, 92, 200, 52, ease(t, k.tCmp + 1.2, k.tCmp2 + 0.6));
    blit(stage);
    T.kicker('얕아지는 바다 · 빠르게 돌린 화면');
    T.lines(t, [['얕아지면 앞쪽부터 느려지고', sh.start + 0.6, s13 - 0.3], ['짧게 눌리며 높이 솟습니다', s13 + 0.2, sh.end + 1]]);
    if (ten > 0 && sx10 < W) { const [x, y] = scr(v, SL1, -22); T.tag('수심 10 m · 시속 36 km', Math.min(x + 20, 930), y - 24, {alpha: ten * (1 - cmp), align: 'right', color: '#F7C766'}); }
    if (cmp > 0) { T.sans('수심 4,000 m · 길고 낮게', 78, 396, {size: 24, alpha: cmp}); T.sans('수심 10 m · 짧고 높게', 78, 524, {size: 24, alpha: ease(t, k.tCmp + 1.2, k.tCmp + 1.7)}); }
    gauges3(T, M.state(XR), 1); T.foot(FOOT);
  },

  // 도달: 낮은 부분이 먼저 닿음 → 물이 빠짐(대피 신호) → 몇 분 넘게 밀려듦 → 다시 빠지고 둘째 물결(첫 물결의 높이를 남겨 견줌)
  arrive(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s15 = k.S('s15'), s16 = k.S('s16'), s17 = k.S('s17'), end = ctx.scene.end;
    const eta = x => M.coastEta(x, t, k.aLevel, 45), go = t > s15 - 0.1 && t < s16 + 1.5;
    const v = {t, sea: SEA, eta, cx: SH1 + 50, boats: [SL1 + 6], calm: 0.6, sign: go ? 0.6 + 0.4 * Math.sin(t * 7) : 0, high: t > k.aD + 0.3 ? 13.4 : 0};
    M.drawWorld(P, v);
    if (go) for (let wx = X_SIGN + 8; wx < X_MAST - 16; wx += 1) if (((wx - t * 22) % 12 + 12) % 12 < 3) P.px(Math.round(wx - (v.cx - W / 2)), SEA + Math.round(M.bed0(wx)) - 4, C.gold);   // 언덕으로 가는 길
    blit(stage);
    T.kicker('해안');
    T.lines(t, [['낮은 부분이 먼저 닿으면', k.S('s14') + 0.2, k.aA + 1.6], ['바닷물이 멀리 빠져나갑니다', k.aA + 1.9, s15 - 0.2], ['곧바로 높은 곳으로', s15 + 0.1, s16 - 0.2],
      ['몇 분 넘게 계속 밀려드는 물', s16 + 0.2, s17 - 0.2], ['첫 물결이 가장 크지 않을 수도', s17 + 0.2, end + 1]]);
    const ga = ease(t, s15 + 0.3, s15 + 0.8) * (1 - ease(t, s16 + 1.0, s16 + 1.5));
    if (ga > 0) { const [x, y] = scr(v, X_MAST - 8, -86); T.tag('높은 곳', Math.min(x, 935), y, {alpha: ga, align: 'right', color: '#F7C766'}); }
    const ha = ease(t, k.aD + 0.3, k.aD + 0.8);
    if (ha > 0) { const [x, y] = scr(v, SL1 - 16, -13.4); T.tag('첫 물결', x - 10, y - 2, {alpha: ha, align: 'right'}); }
    const lv = k.aLevel(t) / PXM;
    T.gauge('해안의 물 높이', `${signed(lv)} m`, 60, 1, Math.abs(lv) > 0.3 ? AMB : INK); T.gauge('지난 시간', `${Math.round(2.5 * Math.max(0, t - k.aA))}분`, 470, 1);
    T.foot('물이 빠지지 않고 올 때도 있습니다 · 높이와 시간은 설명용 값');
  },

  // 경보: 같은 지진을 처음부터 다시 — 지진파가 땅속으로 먼저 달려 관측소에 닿고, 쓰나미는 뒤에 온다. 바다 밑 압력계가 지나가는 물결을 잰다.
  warn(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), s19 = k.S('s19'), s20 = k.S('s20'), end = ctx.scene.end;
    const age = t - k.tQ, up = ease(t, k.tQ, k.tQ + 0.5), tau = k.wRate * Math.max(0, age - 0.5), XR = M.crestX(tau), XL = X0 - tau;
    const eta = x => up * (M.pulse(x, XR) + M.pulse(x, XL)), arr = k.tArr - k.tQ, vs = SEIS * k.wRate;
    const cxA = Math.min(Math.max(XF + 30, M.FOCUS[0] + vs * Math.max(0, age - 0.12) - 50), X_MAST - 95);
    const cx = lerp(lerp(cxA, X_BPR + 14, ease(t, s19 - 1.6, s19 - 0.2)), XR + 20, ease(t, s20 - 0.9, s20 + 0.9));
    const lit = t > k.tArr && t < s19 - 0.3, sig = t > k.tBpr - 0.9 ? 1 : 0;
    const v = {t, up, eta, cx, sea: SEA, boats: [k.xBoat, SL1 + 6],
      fault: age > 0 ? clamp(1 - age / 1.6) : 0, seis: age > 0 && age < arr + 0.7 ? {r: vs * age, a: age < arr ? 0.9 : 0.9 * (1 - (age - arr) / 0.7)} : null,
      mark: age > 0.6 ? XR : null, mast: lit ? 1 : 0, bpr: sig};
    M.drawWorld(P, v); blit(stage);
    T.kicker('경보 · 같은 지진을 처음부터');
    T.lines(t, [['지진파는 수십 배 빠릅니다', k.S('s18') + 0.2, k.tSo - 0.1], ['먼저 알아채고 경보를 냅니다', k.tSo + 0.2, s19 - 0.3],
      ['바다 밑 압력계가 확인합니다', s19 + 0.2, s20 - 0.3], ['태평양을 건너는 데 약 22시간', s20 + 0.2, end + 1]]);
    if (lit) { const a = ease(t, k.tArr, k.tArr + 0.3), [x, y] = scr(v, X_MAST, -56); T.tag('관측소 · 지진 감지', Math.min(x + 60, 935), y - 60, {alpha: a, align: 'right', color: '#F7C766'}); }
    const la = ease(t, s19 + 0.2, s19 + 0.7) * (1 - ease(t, s20 - 0.6, s20 - 0.1));
    if (la > 0) { const [x1, y1] = scr(v, X_BPR + 12, M.bed0(X_BPR) - 12); T.sans('압력계', x1 + 8, y1, {size: 26, alpha: la}); const [x2, y2] = scr(v, X_BPR + 8, -12); T.tag('부표', x2 + 8, y2 - 6, {size: 26, alpha: la}); }
    const g1 = ease(t, k.tQ + 0.4, k.tQ + 0.9) * (1 - ease(t, s19 - 0.5, s19 - 0.1)), g2 = ease(t, s19 + 0.2, s19 + 0.7) * (1 - ease(t, s20 - 0.5, s20 - 0.1)), g3 = ease(t, s20 + 0.2, s20 + 0.7);
    if (g1 > 0) { T.gauge('지진파', '초속 약 7 km', 60, g1, AMB); T.gauge('쓰나미 (수심 4,000 m)', '초속 약 0.2 km', 470, g1); }
    if (g2 > 0) { T.gauge('압력계가 잰 수면 변화', `${signed(Math.max(0, eta(X_BPR)) / PXM, 2)} m`, 60, g2, sig ? AMB : INK); T.gauge('잴 수 있는 변화', '1 cm', 600, g2); }
    if (g3 > 0) {                                                               // 태평양을 건너는 시간
      const c = stage.ctx, q = clamp((t - s20 - 0.5) / (k.tHrs - s20 - 0.5)), x0 = 150, x1 = 800, y = 1262;
      c.save(); c.globalAlpha = g3; c.fillStyle = 'rgba(251,235,192,0.55)'; c.fillRect(x0, y - 2, x1 - x0, 4); c.fillRect(x0 - 2, y - 12, 4, 24); c.fillRect(x1 - 2, y - 12, 4, 24);
      c.fillStyle = AMB; c.fillRect(x0 + (x1 - x0) * q - 9, y - 9, 18, 18); c.restore();
      T.sans('칠레', x0 - 14, y, {size: 28, alpha: g3, align: 'right'}); T.sans('일본', x1 + 14, y, {size: 28, alpha: g3});
      stage.text(`${Math.round(22 * q)}시간`, (x0 + x1) / 2, 1306, {role: 'display', weight: 700, size: 44, color: AMB, align: 'center', alpha: g3, shadow: SH, shadowBlur: 12});
    }
    T.foot(FOOT);
  },

  // 정리: 깊은 바다에서는 낮고 빠르게, 얕은 해안에서는 느리고 높게
  close(stage, t, p, ctx) {
    const k = plan(ctx.tl), T = type(stage), cl = ctx.scene;
    const tau = t < k.tFast ? k.clTau0 + k.rate * (t - cl.start) : Math.min(k.shEnd, k.clTauF + k.clRate * (t - k.tFast));
    const XR = M.crestX(tau), eta = x => M.pulse(x, XR);
    const v = {t, sea: SEA, eta, cx: Math.min(XR + 24, SH1 - 30), boats: [k.xBoat, SL1 + 6], mark: XR};
    M.drawWorld(P, v); blit(stage);
    T.kicker(t < k.tFast ? '정리' : '정리 · 빠르게 돌린 화면');
    T.lines(t, [['바닥까지 물 전체가 움직이는 파도', cl.start + 0.3, k.tDeep - 0.2], ['깊은 바다 · 낮고 빠르게', k.tDeep, k.tShal - 0.2], ['얕은 해안 · 느리고 높게', k.tShal, cl.end + 1]]);
    gauges3(T, M.state(XR), 1); T.foot(FOOT);
  },
};

/** Drawn after the scene, before captions. */
export function overlays(stage, t, ctx) { progressBar(stage, t, ctx.tl.duration); }
