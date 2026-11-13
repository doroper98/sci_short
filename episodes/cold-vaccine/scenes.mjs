// Episode scenes — "감기 주사는 왜 없을까 — 범인이 200가지"
// Shape: export {theme, scenes, overlays, background, titles, captionLayout}; scenes.<id>(stage, t, p, ctx).
//
// Model notes (also in README.md; nothing of this is printed on screen as a footnote):
//  - Rhinovirus types: 169 (2021): A 80, B 32, C 57. Each type has an "epitope shape" s ∈ [0,1]^4 (seeded). The surface loop
//    profile, the pinwheel loops on the icon and the type colour (hue family = species) are all functions of s.
//  - Antibody made for type k fits type j with fit = exp(−|s_k − s_j|² / σ²), σ = 0.16; "blocks" when fit ≥ 0.5.
//    The demo type K blocks only itself (1 / 169). The tip of the drawn antibody is the complement of K's loop profile.
//  - Crowd of cold viruses: 169 rhinovirus types + 33 others (corona, adeno, RSV, parainfluenza, entero, hMPV) → "200가지 넘음".
//  - 1960s trial: one-type (RV13 = A13) vaccine; fit to another type ≈ 0 → it passes.
//  - Nose: airway temperature 33 °C (nostril) → 37 °C (lower throat); doubling time Td(T) = 0.7 s · (1.15/0.7)^((T−33)/4) on screen
//    (model; lab result = faster replication at 33 °C). Injected antibodies: blood 100 : mucosal surface 3 (explanatory model).
//  - Flu: 3 circulating types (A H1N1, A H3N2, B) drift in colour; the vaccine copies them every February (two model years).
//  - Balance (metaphor): beam angle from a damped spring toward k·(cost − benefit); no numbers.
//  - 2016 study: 50-valent inactivated vaccine, two rhesus macaques: dose 1 → 41 and 45 / 50, booster → 49 and 49 / 50.
//  - Myth: antibiotic hits weaken the bacterial wall until it bursts; the virus has no wall → nothing happens.
//  - Hand washing: 36 viruses, each rinsed off at an exponential time (τ = 0.55 s).
//  - Sound: node episodes/cold-vaccine/scenes.mjs --emit-sound [--timeline …] writes sound.json from the same model and plan.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url'; import {createRequire} from 'node:module';
import {
  progressBar, rgba, mix, clamp, lerp, smooth, easeInOut, easeOut, easeIn, poly, line, circle, ring, glow, arrow,
  withAlpha, rect, clipRect, TAU, rng, loadTimeline, contactShadow, curve,
} from '../../pipeline/render/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const {createCanvas} = createRequire(path.join(HERE, '../../pipeline/render/package.json'))('@napi-rs/canvas');   // same module instance as the toolkit
export const theme = 'noturno';
export const captionLayout = {};

// =====================================================================================================
// Model (pure; shared by picture, readouts and sound.json via --emit-sound)
// =====================================================================================================
const PHI = (1 + Math.sqrt(5)) / 2;
/** hsl (deg, 0..1, 0..1) → hex */
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12, v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * clamp(v)).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}
// ---- rhinovirus types ----
export const RV_SPECIES = [{id: 'A', n: 80, hue: 14}, {id: 'B', n: 32, hue: 214}, {id: 'C', n: 57, hue: 272}];
export const N_RV = 169, SIGMA = 0.16, FIT_MIN = 0.5;
export const typeColor = (sp, s) => hsl(sp.hue + (s[3] - 0.5) * 40, 0.74 + 0.16 * (s[2] - 0.5), 0.61 + 0.1 * (s[1] - 0.5));
export const RV = (() => {
  const R = rng(1692021), out = [];
  for (const sp of RV_SPECIES) for (let k = 1; k <= sp.n; k++) { const s = [R(), R(), R(), R()]; out.push({i: out.length, sp: sp.id, name: sp.id + k, s, col: typeColor(sp, s)}); }
  return out;
})();
export const d2 = (a, b) => a.reduce((q, v, k) => q + (v - b[k]) ** 2, 0);
export const fit = (sk, sj) => Math.exp(-d2(sk, sj) / SIGMA ** 2);
export const covers = k => RV.filter(v => fit(RV[k].s, v.s) >= FIT_MIN).length;
/** demo type: an A type whose antibody blocks only itself, with the closest neighbour clearly below the threshold */
export const K = (() => {
  let best = 14, bs = -1;
  for (let k = 10; k < 80; k++) { if (covers(k) !== 1) continue; const nb = Math.max(...RV.filter(v => v.i !== k).map(v => fit(RV[k].s, v.s))); if (nb < 0.4 && nb > bs) { bs = nb; best = k; } }
  return best;
})();
export const FITS_K = RV.map(v => fit(RV[K].s, v.s));
export const BLOCK_K = FITS_K.filter(f => f >= FIT_MIN).length;   // = 1
/** epitope loop profile (height 0..~1.1 over x ∈ [−1, 1]) */
const g = u => Math.exp(-u * u);
export const prof = (s, x) => (0.32 + 0.6 * s[1]) * g((x - (-0.48 + 0.32 * s[0])) / 0.2) + (0.18 + 0.66 * s[3]) * g((x - (0.1 + 0.42 * s[2])) / 0.17);
/** contact offset when an antibody for shape sk is pressed onto shape sj (0 when they match) */
export const contactGap = (sk, sj) => { let m = 0; for (let x = -1; x <= 1.0001; x += 0.02) m = Math.max(m, prof(sj, x) - prof(sk, x)); return m; };
// probes in s10 (other types, spread over the grid), cycle types, the 1960s pair, the s11 other type
export const PROBES = [K + 23, 92, 131, K + 52, 158].map(i => i % N_RV);
export const CYCLE = [3, 101, 140, 57, 120, K];
export const TRIAL = {vac: 12, other: 95};                               // RV13 (= A13) and a B type
export const J11 = 149;
// ---- crowd of cold viruses (poster and s08) ----
export const FAM = {
  rhino: {n: 169, name: '리노바이러스'}, corona: {n: 4, name: '코로나바이러스', col: '#E8B84A'}, adeno: {n: 11, name: '아데노바이러스', col: '#79C79A'},
  rsv: {n: 2, name: 'RSV', col: '#E784B0'}, para: {n: 4, name: '파라인플루엔자', col: '#56C6BE'}, entero: {n: 10, name: '엔테로바이러스', col: '#C8CF6A'},
  hmpv: {n: 2, name: '메타뉴모바이러스', col: '#F09A5C'},
};
export const N_COLD = Object.values(FAM).reduce((s, f) => s + f.n, 0);   // 202 → "200가지 넘음"
export const POSTER_SYR = {x: 540, y: 640, len: 560, ang: -0.52};
/** poster crowd: seeded rejection sampling, big ones in front; keeps a clear lane around the syringe */
export const CROWD = (() => {
  const R = rng(20261105), kinds = ['rhino', 'rhino', 'rhino', 'rhino', 'rhino', 'corona', 'corona', 'adeno', 'rsv', 'para', 'para', 'entero', 'hmpv'], out = [];
  const sx = Math.cos(POSTER_SYR.ang), sy = Math.sin(POSTER_SYR.ang);
  const lane = (x, y) => { const dx = x - POSTER_SYR.x, dy = y - POSTER_SYR.y, u = dx * sx + dy * sy, v = -dx * sy + dy * sx; return Math.abs(u) < POSTER_SYR.len / 2 + 20 ? Math.abs(v) : Math.hypot(Math.abs(u) - POSTER_SYR.len / 2 - 20, v); };
  for (let tries = 0; out.length < 120 && tries < 20000; tries++) {
    const big = out.length < 30, r = big ? 56 + 44 * R() : 18 + 30 * R() ** 1.3;
    const x = -40 + R() * 1160, y = -30 + R() * 1990;
    if (lane(x, y) < r + (big ? 46 : 26)) continue;
    if (y > 920 && y < 1320 && x > 60 && x < 1020 && r > 40) continue;  // big ones stay out of the text band
    if (out.some(o => Math.hypot(o.x - x, o.y - y) < (o.r + r) * (big || o.big ? 1.02 : 0.9))) continue;
    const kind = kinds[Math.floor(R() * kinds.length)];
    out.push({kind, x, y, r, big, rv: kind === 'rhino' ? Math.floor(R() * N_RV) : -1, rot: [R() * TAU, R() * TAU, R() * TAU], spin: (R() - 0.5) * 0.5, ph: R() * TAU, amp: 4 + 8 * R(), seed: Math.floor(R() * 1e6)});
  }
  return out.sort((a, b) => a.r - b.r);
})();
/** s08 cluster: the 202 cold viruses; rhino types in a sunflower, the others in small family groups on the right */
export const C8 = {cx: 395, cy: 715, sp: 33};
export const FAM_ROWS = [{fams: ['corona'], y: 440}, {fams: ['adeno'], y: 560}, {fams: ['entero'], y: 715}, {fams: ['para'], y: 870}, {fams: ['rsv', 'hmpv'], y: 960, label: 'RSV · 메타뉴모'}];
export const COLD_SET = (() => {
  const R = rng(808), out = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N_RV; i++) { const rr = C8.sp * 0.56 * Math.sqrt(i + 0.6), a = i * ga; out.push({fam: 'rhino', rv: i, x: C8.cx + rr * Math.cos(a), y: C8.cy + rr * Math.sin(a), r: 13}); }
  for (const row of FAM_ROWS) { let k = 0; for (const fam of row.fams) for (let j = 0; j < FAM[fam].n; j++, k++) out.push({fam, rv: -1, x: 712 + (k % 6) * 38, y: row.y + 44 + Math.floor(k / 6) * 38, r: 14, seed: k}); }
  const order = out.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach((idx, n) => { out[idx].rank = n; });
  return out;
})();
// ---- the 169 grid (types scene; mini copies later) ----
export const GRID = {cols: 13, cell: 44, x0: 540 - 13 * 22, y0: 590};
export const cellXY = (i, G = GRID) => [G.x0 + (i % G.cols + 0.5) * G.cell, G.y0 + (Math.floor(i / G.cols) + 0.5) * G.cell];
// ---- essence s07: two lanes (no antibody / antibodies) — screen geometry used by the plan and the sound ----
export const LANE = {top: 520, r: 74, mem: 1150, rec: 56, ab: 40, xs: [340, 740]};
LANE.dockY = LANE.mem - LANE.rec * 0.95 - LANE.r * 1.0;                  // virus centre when it sits in the receptor cup
LANE.blockY = LANE.mem - LANE.rec * 1.23 - (LANE.r + LANE.ab * 1.73);   // bound antibodies' stems meet the receptor
// ---- hook: two example years of colds (months, fractional) ----
export const COLD_YEARS = [{n: '예시 1', m: [2.3, 10.2]}, {n: '예시 2', m: [1.3, 4.7, 11.3]}];
// ---- nose ----
export const T_NOSE = 33, T_CORE = 37, TD33 = 0.7, TD37 = 1.15;
export const Td = T => TD33 * (TD37 / TD33) ** ((T - T_NOSE) / (T_CORE - T_NOSE));
export const airT = u => T_NOSE + (T_CORE - T_NOSE) * clamp(u) ** 1.25;  // nostril (u = 0) → lower throat (u = 1)
export const MUC = {blood: 100, surface: 3};
// ---- flu ----
export const FLU = [{n: 'A(H1N1)', hue: 352, drift: 16}, {n: 'A(H3N2)', hue: 32, drift: 26}, {n: 'B', hue: 196, drift: 12}];   // hue drift (deg / model year)
// ---- 2016 study ----
export const STUDY = {n: 50, dose1: [41, 45], boost: [49, 49]};
export const STUDY_ORDER = [0, 1].map(m => { const R = rng(2016 + 7 * m), o = [...Array(50).keys()]; for (let i = 49; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; });
export const STUDY_TYPES = (() => { const R = rng(5050), o = [...Array(N_RV).keys()]; for (let i = N_RV - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o.slice(0, 50).sort((a, b) => a - b); })();
// ---- myth ----
export const ABX = {hits: 9, burstAt: 7};
// ---- hand washing ----
export const WASH = {n: 36, tau: 0.55};
export const WASH_SET = (() => { const R = rng(1919), o = []; for (let i = 0; i < WASH.n; i++) o.push({u: R(), v: R(), q: -Math.log(1 - 0.98 * R()), kind: R() < 0.7 ? 'rhino' : ['corona', 'adeno', 'para'][Math.floor(R() * 3)], rv: Math.floor(R() * N_RV), rot: R() * TAU}); return o; })();

// ---- time anchors (words from the `tts` text; shared with sound.json through --emit-sound) ----
const W = (sentence, word, offset = 0) => ({sentence, word, offset});
export const A = {
  flu1: W('s01', '독감'), have: W('s01', '있는데'), cold1: W('s01', '감기'), why: W('s01', '왜'), ask: W('s01', '알아볼까요'),
  adult: W('s02', '어른도'), year: W('s02', '한 해'), catch2: W('s02', '걸리지만'), block2: W('s02', '막는'), none: W('s02', '없습니다'),
  kamgi: W('s03', '감기라는'), korea: W('s03', '우리나라에서'), hanja: W('s03', '한자말이고'), old: W('s03', '옛날에는'), nose3: W('s03', '코와'),
  fire: W('s03', '불을'), merge3: W('s03', '합친'), goppul: W('s03', '고뿔이라'),
  vaccine: W('s04', '백신이라는'), cow: W('s04', '소를'), latin: W('s04', '라틴어'), vacca: W('s04', '바카에서'), came: W('s04', '왔습니다'),
  jenner: W('s04', '제너가'), cowpox: W('s04', '우두로'), smallpox: W('s04', '천연두를'), stopped: W('s04', '막은'), origin4: W('s04', '비롯된'),
  y1960: W('s05', '천구백육십년대에'), vac5: W('s05', '백신을'), tested: W('s05', '시험했지만'), matched: W('s05', '맞춘'), virusOnly: W('s05', '바이러스만'), blocked5: W('s05', '막았습니다'),
  vac6: W('s06', '백신은'), shape6: W('s06', '겉모양을'), show: W('s06', '보여'), body: W('s06', '몸이'), fit6: W('s06', '맞는'), ab6: W('s06', '항체를'),
  make: W('s06', '만들어'), keep: W('s06', '두게'),
  ab7: W('s07', '항체는'), surface7: W('s07', '겉면에'), lock: W('s07', '맞물려'), stick: W('s07', '붙고'), virus7: W('s07', '바이러스가'), cell7: W('s07', '세포'),
  inside: W('s07', '안으로'), enter: W('s07', '들어가지'), cant7: W('s07', '못하게'),
  cold8: W('s08', '감기는'), oneDis: W('s08', '한 가지'), notOne: W('s08', '아니라'), n200: W('s08', '이백가지가'), cause8: W('s08', '일으키는'), similar: W('s08', '비슷한'), bundle: W('s08', '묶음입니다'),
  common: W('s09', '흔한'), rhino9: W('s09', '리노바이러스만'), n160: W('s09', '백육십가지가'), exist: W('s09', '있습니다'), rhinoWord: W('s09', '리노는'), noseW: W('s09', '코라는'),
  each10: W('s10', '형마다'), differ: W('s10', '달라'), oneType: W('s10', '한 형에'), ab10: W('s10', '항체는'), other10: W('s10', '다른'), no10: W('s10', '않습니다'),
  caught: W('s11', '걸려'), immunity: W('s11', '면역은'), other11: W('s11', '다른'), cant11: W('s11', '막지'),
  cool: W('s12', '서늘한'), t33: W('s12', '삼십삼도'), well12: W('s12', '잘'), grow: W('s12', '불어나'), mainly: W('s12', '주로'), mucosa: W('s12', '점막에'),
  inj: W('s13', '주사로'), ab13: W('s13', '항체는'), blood: W('s13', '핏속을'), mucosa13: W('s13', '점막'), lack: W('s13', '부족할'),
  flu14: W('s14', '독감은'), influenza: W('s14', '인플루엔자라는'), other14: W('s14', '다른'), three: W('s14', '세 가지'), approx: W('s14', '안팎이라'), yearly: W('s14', '해마다'),
  days: W('s15', '며칠이면'), heal: W('s15', '낫기에'), n160b: W('s15', '백육십가지를'), block15: W('s15', '막는'), cost: W('s15', '비용과'), risk: W('s15', '위험을'), accept: W('s15', '감수하기'),
  y2016: W('s16', '이천십육년'), n50: W('s16', '오십가지'), atOnce: W('s16', '한 번에'), contain: W('s16', '담은'), monkey: W('s16', '원숭이에게'), injected: W('s16', '맞혔습니다'),
  monkeys: W('s17', '원숭이들은'), among: W('s17', '중'), n49: W('s17', '마흔아홉가지'), about17: W('s17', '대한'), ab17: W('s17', '항체를'), cold17: W('s17', '감기를'), yet17: W('s17', '아직'), confirm: W('s17', '확인하지'),
  cold18: W('s18', '감기에'), heal18: W('s18', '나을까요'), no18: W('s18', '아닙니다'), abx2: W('s18', '항생제는'), bact: W('s18', '세균을'), kill: W('s18', '죽이는'), virus18: W('s18', '바이러스에는'), work: W('s18', '듣지'),
  hands: W('s19', '손을'), wash: W('s19', '씻고'), byHand: W('s19', '손으로'), nose19: W('s19', '코와'), eyes: W('s19', '눈을'), touch: W('s19', '만지지'),
  reason: W('s20', '까닭은'), cShape: W('s20', '겉모양이'), cEach: W('s20', '저마다'), cDiff: W('s20', '다른'), cMany: W('s20', '수많은'),
};


// ---- per-timeline plans (all motion that the sound also needs) ----
const PLANS = new WeakMap();
export const MORPH = [0.9, 1.7];                                         // first-frame title → header
export function plan(tl) {
  let P = PLANS.get(tl); if (P) return P; P = {};
  const at = r => tl.at(r), sc = id => tl.scene(id);
  // hook
  P.glide = [MORPH[1] + 0.05, at(A.have) + 0.05];                       // the poster syringe glides into the flu card
  P.fluOk = at(A.have) + 0.05; P.coldCard = at(A.cold1) - 0.1; P.why = at(A.why) - 0.05;
  P.yr = [at(A.year) - 0.05, at(A.catch2) + 0.55];                       // one model year swept on screen
  P.coldT = COLD_YEARS.map(y => y.m.map(m => P.yr[0] + m / 12 * (P.yr[1] - P.yr[0])));
  P.none = at(A.none) - 0.05;
  // origin
  P.hanja = at(A.kamgi) - 0.2; P.korea = at(A.korea) - 0.1; P.old = at(A.old) - 0.2;
  P.ko = at(A.nose3) - 0.05; P.bul = at(A.fire) - 0.05; P.merge = [at(A.merge3) - 0.05, at(A.merge3) + 0.6]; P.goppul = at(A.goppul) - 0.1;
  P.s04 = at('s04') - 0.55;
  P.vac = at(A.vaccine) - 0.15; P.cow = at(A.cow) - 0.1; P.latin = at(A.latin) - 0.1; P.vacca = [at(A.vacca) - 0.05, at(A.came) + 0.45];
  P.jenner = at(A.jenner) - 0.15; P.pox = [at(A.cowpox) - 0.1, at(A.smallpox) + 0.25]; P.shield = at(A.stopped) - 0.1; P.back4 = at(A.origin4) - 0.1;
  P.s05 = at('s05') - 0.55;
  P.trial = at(A.y1960) - 0.2; P.vial5 = at(A.vac5) - 0.15;
  P.arrive5 = [at(A.tested) - 0.3, at(A.matched) + 0.05];               // both viruses descend
  P.lock5 = at(A.matched) + 0.05; P.tap5 = at(A.virusOnly) - 0.05; P.dock5 = at(A.blocked5) + 0.15;
  // essence
  P.loopHi = at(A.shape6) - 0.1; P.vacShow = at(A.show) - 0.2;
  P.morph6 = [at(A.body) - 0.1, at(A.fit6) + 0.15]; P.lock6 = P.morph6[1];
  P.copies = [at(A.make) - 0.1, at(A.keep) + 0.7];
  P.s07 = at('s07') - 0.55;
  P.fall7 = [at(A.ab7) - 0.2, at(A.cell7) + 0.05];                      // both lanes: the virus approaches the cell
  P.abLock = [0, 1, 2].map(k => at(A.lock) - 0.05 + k * 0.16);          // three antibodies lock (right lane)
  P.fallY = t => lerp(LANE.top, LANE.dockY, easeInOut((t - P.fall7[0]) / (P.fall7[1] - P.fall7[0])));
  P.dockL = P.fall7[1]; P.enterL = [at(A.inside) - 0.05, at(A.enter) + 0.35]; P.cant = at(A.cant7) - 0.05;
  P.bump = at(A.enter) - 0.02;                                         // the antibody-covered virus meets the receptor
  P.fallR = t => lerp(LANE.top, LANE.blockY, clamp((t - P.fall7[0]) / (P.bump - P.fall7[0])) ** 1.6);   // accelerating: it arrives with speed
  // types
  P.single = sc('types').start + 0.2; P.notOne = at(A.notOne) - 0.05;
  P.crowd8 = [at(A.n200) - 0.3, at(A.cause8) + 0.35];
  P.cold8T = rank => P.crowd8[0] + (rank / (N_COLD - 1)) ** 0.85 * (P.crowd8[1] - P.crowd8[0]);
  P.bundle = [at(A.similar) - 0.1, at(A.bundle) + 0.35];
  P.s09 = at('s09') - 0.55; P.common = at(A.common) - 0.1;
  P.grid = [at(A.rhino9) + 0.1, at(A.exist) + 0.3];
  P.landT = i => P.grid[0] + (i / (N_RV - 1)) * (P.grid[1] - P.grid[0]) - 0.0;  // cell i lands (row-major)
  P.rhinoCard = at(A.rhinoWord) - 0.15; P.noseCard = at(A.noseW) - 0.1;
  P.s10 = at('s10') - 0.55;
  P.cycle = [at(A.each10) - 0.1, at(A.differ) + 0.35];
  P.cycT = CYCLE.map((_, n) => P.cycle[0] + n / (CYCLE.length - 1) * (P.cycle[1] - P.cycle[0]));
  P.make10 = at(A.oneType) - 0.1; P.lock10 = at(A.ab10) - 0.05;
  P.probeT = PROBES.map((_, n) => at(A.other10) - 0.05 + n * 0.3);
  P.sweep = [at(A.no10) + 0.15, at(A.no10) + 1.25];
  P.sweepT = i => P.sweep[0] + i / (N_RV - 1) * (P.sweep[1] - P.sweep[0]);
  P.s11 = at('s11') - 0.55; P.infect = at(A.caught) - 0.05; P.immune = at(A.immunity) - 0.1; P.other11 = at(A.other11) - 0.05; P.pass11 = at(A.cant11) - 0.1;
  // nose
  P.sect = sc('nose').start + 0.25; P.therm = [at(A.cool) - 0.1, at(A.t33) + 0.45];
  P.grow0 = at(A.well12) - 0.35; P.grow1 = at('s13') - 0.7;
  P.nAt = (t, T) => 2 ** ((clamp(t, P.grow0, P.grow1) - P.grow0) / Td(T));
  P.muc12 = at(A.mucosa) - 0.1;
  P.s13 = at('s13') - 0.6; P.inject = at(A.inj) - 0.05;
  P.flow0 = at(A.ab13) - 0.2; P.cross = [at(A.mucosa13) - 0.15, at(A.lack) - 0.15]; P.attach = at(A.lack) - 0.05;
  P.crossT = [0, 1, 2].map(k => P.cross[0] + (k + 1) / 3 * (P.cross[1] - P.cross[0]));
  // flu
  P.flu = at(A.flu14) - 0.2; P.inf = at(A.influenza) - 0.1; P.other14 = at(A.other14) - 0.1;
  P.cells3 = [0, 1, 2].map(k => at(A.three) - 0.1 + k * 0.17); P.cmp = at(A.approx) - 0.1;
  P.ring = [at(A.yearly) - 0.15, at('s15') - 0.45];                    // two model years around the calendar ring
  P.yearAt = t => 2 * clamp((t - P.ring[0]) / (P.ring[1] - P.ring[0]));   // model years since the ring started (0 = 1 Aug)
  P.febT = [0, 1].map(y => P.ring[0] + (y + 6 / 12) / 2 * (P.ring[1] - P.ring[0]));   // Feb = 6 months after Aug
  P.s15 = at('s15') - 0.55; P.benefit = at(A.days) - 0.05;
  P.stack = [at(A.n160b) - 0.1, at(A.block15) + 0.45];
  P.stackT = i => P.stack[0] + (i / (N_RV - 1)) ** 0.9 * (P.stack[1] - P.stack[0]);
  P.costTag = at(A.cost) - 0.1; P.riskTag = at(A.risk) - 0.1;
  { // damped beam (metaphor): θ'' = −ω²(θ − θ*) − 2ζωθ'
    const dt = 1 / 240, t0 = P.s15, t1 = sc('flu').end, n = Math.ceil((t1 - t0) / dt) + 2, TH = new Float64Array(n);
    let th = 0, v = 0; const w = 5.2, z = 0.32;
    const target = tt => { const ben = tt >= P.benefit ? 1 : 0, cost = clamp((tt - P.stack[0]) / (P.stack[1] - P.stack[0])) * 4.2; return clamp(0.055 * (cost - ben), -0.08, 0.2); };
    for (let i = 0; i < n; i++) { TH[i] = th; const tt = t0 + i * dt; const a = -w * w * (th - target(tt)) - 2 * z * w * v; v += a * dt; th += v * dt; }
    P.beam = tt => { const u = (tt - t0) / dt; if (u <= 0) return 0; if (u >= n - 1) return TH[n - 1]; const i = Math.floor(u); return lerp(TH[i], TH[i + 1], u - i); };
    P.beamTarget = target;
    let last = P.stack[0]; for (let tt = P.stack[0]; tt < t1; tt += dt) if (Math.abs(P.beam(tt) - target(tt)) > 0.012) last = tt;
    P.settle = last;                                                     // the beam stops swinging (within 0.7°)
  }
  // try
  P.card16 = at(A.y2016) - 0.2; P.fill16 = [at(A.n50) - 0.1, at(A.atOnce) + 0.25];
  P.tokT = k => P.fill16[0] + k / 49 * (P.fill16[1] - P.fill16[0]);
  P.cap = at(A.contain) - 0.05; P.monk = at(A.monkey) - 0.2; P.inj16 = at(A.injected) - 0.05;
  P.s17 = at('s17') - 0.55;
  P.dose1 = [at(A.monkeys) - 0.05, at(A.among) + 0.15]; P.boost = [at(A.n49) - 0.05, at(A.about17) + 0.1];
  P.litN = (m, tt) => (tt < P.dose1[0] ? 0 : tt < P.boost[0] ? STUDY.dose1[m] * clamp((tt - P.dose1[0]) / (P.dose1[1] - P.dose1[0])) : lerp(STUDY.dose1[m], STUDY.boost[m], clamp((tt - P.boost[0]) / (P.boost[1] - P.boost[0]))));
  P.question = at(A.cold17) - 0.1; P.stamp = at(A.confirm) - 0.1;
  // myth
  P.q18 = at(A.cold18) - 0.2; P.no18 = at(A.no18) - 0.05;
  P.abx0 = at(A.abx2) - 0.1; P.hitT = [...Array(ABX.hits)].map((_, k) => at(A.bact) - 0.15 + k * 0.13);
  P.burst = P.hitT[ABX.burstAt]; P.vir18 = at(A.virus18) - 0.1; P.noEffect = at(A.work) - 0.05;
  // close
  P.hand = at('s19') - 0.7; P.water = [at(A.hands) - 0.3, at(A.byHand) + 0.25];
  P.washT = WASH_SET.map(w => P.water[0] + 0.35 + w.q * WASH.tau);
  P.route = at(A.byHand) - 0.1; P.noTouch = at(A.touch) - 0.05;
  P.reason = at(A.reason) - 0.1;
  P.cPulse = [at(A.cShape) - 0.05, at(A.cDiff) + 0.2];
  PLANS.set(tl, P); return P;
}

// =====================================================================================================
// Render infrastructure: background
// =====================================================================================================
// out-of-focus specks drifting in the medium (depth cue; fixed seed)
const SPECKS = (() => { const R = rng(4242), s = []; for (let i = 0; i < 70; i++) s.push({x: R() * 1080, y: R() * 1920, r: 2 + 9 * R() ** 2, a: 0.03 + 0.08 * R(), vx: (R() - 0.5) * 6, vy: -2 - 5 * R(), c: R()}); return s; })();
export function background(stage, t, ctx) {
  const {ctx: c, W, H} = stage, T = stage.theme;
  const gr = c.createLinearGradient(0, 0, W * 0.4, H); gr.addColorStop(0, '#02202C'); gr.addColorStop(1, T.deep);
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  glow(c, 540, 760, 900, '#2C6F86', 0.07);
  for (const s of SPECKS) { const x = ((s.x + s.vx * t) % 1100 + 1100) % 1100 - 10, y = ((s.y + s.vy * t) % 1940 + 1940) % 1940 - 10; c.globalAlpha = s.a; circle(c, x, y, s.r, s.c > 0.7 ? '#9FD9E8' : '#5FA9BC'); }
  c.globalAlpha = 1;
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.42, H * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}

// =====================================================================================================
// Palette and small helpers
// =====================================================================================================
export const PAL = {ab: '#8FE3BF', abDark: '#3E9C7D', answer: '#FFB547', good: '#8FE3BF', bad: '#FF6A4D', warm: '#FFB36A', cool: '#7CC4FF',
  cell: '#E7A7A0', cellIn: '#5A2A33', blood: '#C8423F', mucus: '#D9C27A', flu: '#E57373', abx: '#F4E3A0', bact: '#9CCB86', wall: '#D6E8B0', skin: '#C9B6A4', water: '#6FC3F0'};
const fadeIn = (t, t0, d = 0.4) => smooth((t - t0) / d);
const fadeOut = (t, t1, d = 0.4) => 1 - smooth((t - t1) / d);
const sceneFade = (t, ctx, a = 0.22, b = 0.22) => fadeIn(t, ctx.scene.start, a) * fadeOut(t, ctx.scene.end - b, b);
function tag(stage, s, x, y, o = {}) {
  const size = o.size || 24, weight = o.weight ?? 700, w = stage.measure(s, {size, weight, role: o.role}), pad = 8;
  let x0 = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
  x0 = clamp(x0, 140 + pad, 940 - pad - w);
  if ((o.a ?? 1) <= 0) return [x0, w];
  withAlpha(stage.ctx, o.a ?? 1, () => {
    if (o.plate !== false) rect(stage.ctx, x0 - pad, y - size * 0.72, w + 2 * pad, size * 1.44, 6, rgba(stage.theme.plate, o.plateA ?? 0.85), o.border ? rgba(o.border, 0.9) : null, 1.2);
    stage.text(s, x0, y, {size, weight, color: o.color || stage.theme.ink, role: o.role, shadow: o.shadow, shadowBlur: o.shadowBlur});
  });
  return [x0, w];
}
function panel(c, T, x, y, w, h, a = 0.86, r = 12) { rect(c, x, y, w, h, r, rgba(T.plate, a), rgba(T.border, 1), 1.5); }
const fmtInt = n => Math.round(n).toLocaleString('en-US');
function head(stage, kicker, title, aK, aT, sub = '', aS = aT, sh = null) {
  const {ctx: c} = stage, T = stage.theme, so = sh ? {shadow: sh, shadowBlur: 14} : {};
  if (kicker) withAlpha(c, aK, () => {
    stage.text(kicker, 540, 146, {role: 'display', weight: 500, size: 26, color: T.accent, align: 'center', tracking: 3, ...so});
    line(c, [[510, 172], [570, 172]], T.accent, 3, {cap: 'butt'});
  });
  if (title) withAlpha(c, aT, () => stage.text(title, 540, 228, {role: 'display', weight: 700, size: 54, color: T.ink, align: 'center', maxWidth: 800, ...so}));
  if (sub) withAlpha(c, aS, () => stage.text(sub, 540, 290, {role: 'display', weight: 700, size: 32, color: PAL.answer, align: 'center', ...so}));
}
function strike(c, x0, x1, y, q, col = PAL.bad, w = 4) { if (q > 0) line(c, [[x0 - 4, y], [lerp(x0 - 4, x1 + 4, easeOut(q)), y]], rgba(col, 0.95), w); }
function cross(c, x, y, s, col = PAL.bad, w = 5, q = 1) {
  if (q <= 0) return; const a = Math.min(1, q * 2), b = clamp(q * 2 - 1);
  line(c, [[x - s, y - s], [lerp(x - s, x + s, a), lerp(y - s, y + s, a)]], col, w);
  if (b > 0) line(c, [[x + s, y - s], [lerp(x + s, x - s, b), lerp(y - s, y + s, b)]], col, w);
}
function check(c, x, y, s, col = PAL.good, w = 5, q = 1) {
  if (q <= 0) return; const P1 = [x - s, y], P2 = [x - s * 0.3, y + s * 0.7], P3 = [x + s, y - s * 0.75], a = Math.min(1, q * 2.2), b = clamp(q * 2.2 - 1);
  line(c, b > 0 ? [P1, P2, [lerp(P2[0], P3[0], b), lerp(P2[1], P3[1], b)]] : [P1, [lerp(P1[0], P2[0], a), lerp(P1[1], P2[1], a)]], col, w);
}

// =====================================================================================================
// 3D helpers and virus drawings (clean illustration; colours are a stated metaphor)
// =====================================================================================================
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const LIGHT = norm3([-0.5, 0.6, 0.7]);                                    // y up, z toward the viewer
function rotM([a, b, cc]) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cz = Math.cos(cc), sz = Math.sin(cc);
  // Rz · Ry · Rx
  return [[cz * cb, cz * sb * sa - sz * ca, cz * sb * ca + sz * sa], [sz * cb, sz * sb * sa + cz * ca, sz * sb * ca - cz * sa], [-sb, cb * sa, cb * ca]];
}
const mulM = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
const ICO_V = (() => { const v = []; for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]); return v.map(norm3); })();
const ICO_F = (() => { const f = [], n = ICO_V.length, d = (i, j) => Math.hypot(ICO_V[i][0] - ICO_V[j][0], ICO_V[i][1] - ICO_V[j][1], ICO_V[i][2] - ICO_V[j][2]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) if (d(i, j) < 1.1 && d(j, k) < 1.1 && d(i, k) < 1.1) f.push([i, j, k]); return f; })();
const FIB = n => { const o = [], ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y); o.push([r * Math.cos(i * ga), y, r * Math.sin(i * ga)]); } return o; };
const shadeCol = (col, lam, spec = 0) => mix(mix('#08141A', col, 0.3 + 0.7 * lam), '#FFFFFF', spec);
/**
 * Icosahedral capsid. o: {shape (rhinovirus epitope s → pinwheel loops), fibres (adenovirus), alpha, grey (inactivated),
 * edge, hi (0..1 highlight ring on one front vertex), hiIdx}
 */
export function drawIco(c, x, y, r, col, rot, o = {}) {
  const M = rotM(rot), V = ICO_V.map(v => mulM(M, v)), P = v => [x + r * v[0], y - r * v[1]];
  const base = o.grey ? mix(col, '#9AA6AA', 0.75) : col;
  const fib = o.fibres;
  if (fib) for (const v of V) if (v[2] < 0) fibre(c, x, y, r, v, base, fib);
  if (o.shadowA) glow(c, x + r * 0.08, y + r * 0.12, r * 1.25, '#000000', o.shadowA);
  for (const f of ICO_F) {
    const n = norm3([V[f[0]][0] + V[f[1]][0] + V[f[2]][0], V[f[0]][1] + V[f[1]][1] + V[f[2]][1], V[f[0]][2] + V[f[1]][2] + V[f[2]][2]]);
    if (n[2] <= 0.0) continue;
    const lam = Math.max(0, dot3(n, LIGHT)), spec = 0.28 * Math.max(0, n[2] * 0.4 + lam * 0.6) ** 8;
    poly(c, f.map(i => P(V[i])), shadeCol(base, lam, spec), o.edge === false ? null : rgba('#04121A', 0.32), Math.max(0.6, r * 0.014));
  }
  if (o.shape && r > 5) {
    // the type's surface loops: a twisted five-point plateau around every five-fold vertex (twist s0, reach s1, waist s2, cap s3)
    const s = o.shape, tw = (s[0] - 0.5) * 1.1, L = r * (0.2 + 0.2 * s[1]), wst = 0.28 + 0.32 * s[2], lb = o.keepLoops ? col : base, lc = mix(lb, '#FFFFFF', 0.3), dc = mix(lb, '#FFFFFF', 0.7);
    V.forEach((v, vi) => {
      if (v[2] < -0.08) return;
      const e1 = norm3(Math.abs(v[2]) < 0.9 ? cross3(v, [0, 0, 1]) : cross3(v, [0, 1, 0])), e2 = cross3(v, e1), lam = Math.max(0, dot3(v, LIGHT));
      const pt = (th, rr, h) => { const cth = Math.cos(th), sth = Math.sin(th); return [x + v[0] * r * h + (cth * e1[0] + sth * e2[0]) * rr, y - (v[1] * r * h + (cth * e1[1] + sth * e2[1]) * rr)]; };
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const out = k % 2 === 0, th = vi * 0.7 + k * TAU / 10 + (out ? tw : tw * 0.35), rr = out ? L : L * wst, h = out ? 1.03 : 1.06;
        const [px, py] = pt(th, rr, h); k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      c.fillStyle = shadeCol(lc, 0.4 + 0.6 * lam); c.fill();
      if (r > 14) { c.strokeStyle = rgba('#04121A', 0.4); c.lineWidth = Math.max(0.7, r * 0.01); c.stroke(); }
      if (r > 12) { const [px, py] = pt(0, 0, 1.08); circle(c, px, py, r * (0.03 + 0.06 * s[3]), shadeCol(dc, 0.5 + 0.5 * lam)); }
      if (o.hi > 0 && vi === (o.hiIdx ?? -1)) withAlpha(c, o.hi, () => { const [px, py] = pt(0, 0, 1); ring(c, px, py, L * 1.45, rgba('#FFFFFF', 0.95), 3); });
    });
  }
  if (fib) for (const v of V) if (v[2] >= 0) fibre(c, x, y, r, v, base, fib);
  return V;
}
function fibre(c, x, y, r, v, col, len) {
  const a = [x + v[0] * r, y - v[1] * r], b = [x + v[0] * r * (1 + len), y - v[1] * r * (1 + len)], k = 0.55 + 0.45 * Math.max(0, v[2]);
  line(c, [a, b], shadeCol(mix(col, '#FFFFFF', 0.3), k), Math.max(1, r * 0.045));
  circle(c, b[0], b[1], Math.max(1.6, r * 0.1), shadeCol(mix(col, '#FFFFFF', 0.45), k));
}
const SPIKE_DIRS = FIB(46);
/** enveloped virus: shaded sphere (optionally lumpy) with spikes. o: {head: 'club'|'cap'|'fringe'|'mixed', len, n, lumpy, seed} */
export function drawEnv(c, x, y, r, col, rot, o = {}) {
  const M = rotM(rot), dirs = (o.dirs || SPIKE_DIRS).map(v => mulM(M, v)), len = o.len ?? 0.3, head = o.head || 'club';
  const hc = mix(col, '#FFFFFF', 0.35), sc = mix(col, '#FFFFFF', 0.15);
  const rad = th => r * (1 + (o.lumpy ? 0.07 * Math.sin(3 * th + o.seed) + 0.045 * Math.sin(5 * th + 2 * o.seed) : 0));
  const spike = (d, k) => {
    const th = Math.atan2(-d[1], d[0]), rr = rad(th), sx = d[0], sy = -d[1], ql = Math.hypot(sx, sy) || 1, fs = Math.sqrt(Math.max(0, 1 - d[2] * d[2]));
    const b0 = [x + sx * rr * 0.96, y + sy * rr * 0.96], tip = [x + sx * rr + sx * r * len, y + sy * rr + sy * r * len];
    const shade = 0.5 + 0.5 * Math.max(0, dot3(d, LIGHT));
    const hd = head === 'mixed' ? (k % 3 === 0 ? 'cap' : 'club') : head;
    if (d[2] > 0.45) {                                              // seen end-on: a knob on the face
      const px = x + sx * rr * 0.98, py = y + sy * rr * 0.98;
      circle(c, px, py, r * (hd === 'fringe' ? 0.035 : 0.075), shadeCol(hc, shade)); if (hd !== 'fringe') ring(c, px, py, r * 0.075, rgba('#04121A', 0.35), 1);
      return;
    }
    line(c, [b0, tip], shadeCol(sc, shade), Math.max(1, r * (hd === 'fringe' ? 0.03 : 0.045)));
    if (hd === 'club') { c.save(); c.translate(tip[0], tip[1]); c.rotate(Math.atan2(sy, sx)); c.scale(1, 0.75 + 0.25 * fs); c.beginPath(); c.ellipse(0, 0, r * 0.085, r * 0.07, 0, 0, TAU); c.fillStyle = shadeCol(hc, shade); c.fill(); c.restore(); }
    else if (hd === 'cap') { c.save(); c.translate(tip[0], tip[1]); c.rotate(Math.atan2(sy, sx)); c.beginPath(); c.ellipse(0, 0, r * 0.04, r * 0.1, 0, 0, TAU); c.fillStyle = shadeCol(hc, shade); c.fill(); c.restore(); }
  };
  dirs.forEach((d, k) => { if (d[2] < 0 && d[2] > -0.45) spike(d, k); });
  // body
  const g2 = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.05);
  g2.addColorStop(0, mix(col, '#FFFFFF', 0.45)); g2.addColorStop(0.35, col); g2.addColorStop(1, mix(col, '#061016', 0.62));
  c.beginPath(); for (let i = 0; i <= 48; i++) { const th = i / 48 * TAU, rr = rad(th); i ? c.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr) : c.moveTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr); }
  c.closePath(); c.fillStyle = g2; c.fill(); c.strokeStyle = rgba('#04121A', 0.4); c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
  dirs.forEach((d, k) => { if (d[2] >= 0) spike(d, k); });
}
/** any cold virus by family */
export function coldVirus(c, kind, x, y, r, rot, o = {}) {
  if (kind === 'rhino') { const v = RV[o.rv ?? 0]; drawIco(c, x, y, r, v.col, rot, {shape: v.s, grey: o.grey, hi: o.hi, hiIdx: o.hiIdx}); return; }
  const col = o.grey ? mix(FAM[kind].col, '#9AA6AA', 0.75) : FAM[kind].col;
  if (kind === 'adeno') drawIco(c, x, y, r * 0.86, col, rot, {fibres: 0.85});
  else if (kind === 'entero') drawIco(c, x, y, r * 0.8, col, rot, {});
  else if (kind === 'corona') drawEnv(c, x, y, r * 0.8, col, rot, {head: 'club', len: 0.28});
  else if (kind === 'para') drawEnv(c, x, y, r * 0.82, col, rot, {head: 'cap', len: 0.2});
  else if (kind === 'rsv') drawEnv(c, x, y, r * 0.84, col, rot, {head: 'fringe', len: 0.13, lumpy: true, seed: 1.3, dirs: FIB(90)});
  else if (kind === 'hmpv') drawEnv(c, x, y, r * 0.84, col, rot, {head: 'fringe', len: 0.12, lumpy: true, seed: 4.1, dirs: FIB(80)});
}
// sprite cache: rhinovirus type icons at a fixed orientation (the grid; differences come only from the type's shape)
const SPR = new Map(), SPR_ROT = [0.42, 0.55, 0.12];
function rvSprite(i, r) {
  const key = i + ':' + r; let s = SPR.get(key); if (s) return s;
  const S = Math.ceil(r * 2.9), cv = createCanvas(S, S), cc = cv.getContext('2d');
  drawIco(cc, S / 2, S / 2, r, RV[i].col, SPR_ROT, {shape: RV[i].s});
  s = {cv, S}; SPR.set(key, s); return s;
}
function drawRvSprite(c, i, x, y, r, scale = 1) { const s = rvSprite(i, r); const S = s.S * scale; c.drawImage(s.cv, x - S / 2, y - S / 2, S, S); }
const CS = new Map();
function coldSprite(kind, r, seed = 0) {
  const key = kind + ':' + r + ':' + seed; let s = CS.get(key); if (s) return s;
  const S = Math.ceil(r * 3.2), cv = createCanvas(S, S), cc = cv.getContext('2d');
  coldVirus(cc, kind, S / 2, S / 2, r, [0.3 + seed, 0.7 + seed * 1.7, 0.2]);
  s = {cv, S}; CS.set(key, s); return s;
}

// ---- antibody (Y): arms toward −y in local coordinates, stem toward +y ----
export function drawAb(c, x, y, s, ang, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  const col = o.col || PAL.ab, dark = mix(col, '#0A2A22', 0.45), lite = mix(col, '#FFFFFF', 0.3), w = s * 0.16;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.lineCap = 'round';
    const seg = (x0, y0, x1, y1, cl, ww) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = cl; c.lineWidth = ww; c.stroke(); };
    // stem (Fc): two chains
    seg(-w * 0.45, w * 0.3, -w * 0.45, s * 0.95, dark, w); seg(w * 0.45, w * 0.3, w * 0.45, s * 0.95, mix(dark, col, 0.4), w);
    for (const sg of [-1, 1]) {
      const ex = sg * s * 0.62, ey = -s * 0.78, nx = -ey, ny = ex, nl = Math.hypot(nx, ny), ox = nx / nl * w * 0.5 * sg, oy = ny / nl * w * 0.5 * sg;
      seg(sg * w * 0.3 - ox * 0, 0, ex - ox, ey - oy, mix(dark, col, 0.6), w);      // heavy chain
      seg(sg * s * 0.2 + ox, -s * 0.25 + oy, ex + ox * 1.6, ey + oy * 1.6, lite, w * 0.9);   // light chain
      circle(c, ex + ox * 0.3, ey + oy * 0.3, w * 0.62, o.tipCol || lite);
    }
    circle(c, 0, 0, w * 0.55, dark);
    c.restore();
  });
}
/** an antibody bound to a sphere-ish virus at (vx, vy, vr) at angle φ: arms toward the virus, stem outward */
function boundAb(c, vx, vy, vr, phi, s, o = {}) { const d = vr + s * 0.78; drawAb(c, vx + Math.cos(phi) * d, vy + Math.sin(phi) * d, s, phi - Math.PI / 2 + Math.PI, o); }

// ---- syringe, vial, receptor, membrane ----
export function drawSyringe(c, x, y, len, ang, o = {}) {
  const a = o.a ?? 1; if (a <= 0) return;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.rotate(ang);
    const L = len, bw = L * 0.13, b0 = -L * 0.42, b1 = L * 0.2, liq = o.liquid ?? '#7FD8F0', fill = o.fill ?? 0.75, dashed = o.dashed;
    if (dashed) {
      c.setLineDash([10, 8]); c.lineWidth = 3; c.strokeStyle = rgba('#EFE3D4', 0.6);
      c.beginPath(); c.roundRect(b0, -bw / 2, b1 - b0, bw, bw * 0.18); c.stroke();
      c.beginPath(); c.moveTo(b1, 0); c.lineTo(L * 0.5, 0); c.stroke();
      c.beginPath(); c.moveTo(b0 - L * 0.06, 0); c.lineTo(-L * 0.5, 0); c.moveTo(-L * 0.5, -bw * 0.55); c.lineTo(-L * 0.5, bw * 0.55); c.stroke();
      c.setLineDash([]); c.restore(); return;
    }
    contactShadow(c, 8, bw * 0.9, L * 0.45, bw * 0.35, 0.3);
    // plunger
    const pl = b0 + (b1 - b0) * (1 - fill);
    rect(c, -L * 0.5, -bw * 0.62, L * 0.035, bw * 1.24, 4, '#C9D3D8', rgba('#04121A', 0.4), 1.2);
    rect(c, -L * 0.5 + L * 0.03, -bw * 0.1, pl - (-L * 0.5 + L * 0.03), bw * 0.2, 3, '#AEB9BF');
    // needle
    line(c, [[b1 + L * 0.05, 0], [L * 0.5, 0]], '#D9E2E6', Math.max(1.5, L * 0.008));
    poly(c, [[b1, -bw * 0.22], [b1 + L * 0.055, -bw * 0.1], [b1 + L * 0.055, bw * 0.1], [b1, bw * 0.22]], '#9FB0B8');
    // barrel: liquid then glass
    if (fill > 0) rect(c, pl, -bw / 2 + 3, b1 - pl, bw - 6, 3, rgba(liq, 0.8));
    rect(c, pl - 6, -bw / 2 + 2, 10, bw - 4, 3, '#5E6E76');
    const gl = c.createLinearGradient(0, -bw / 2, 0, bw / 2); gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(0.3, 'rgba(255,255,255,0.08)'); gl.addColorStop(1, 'rgba(255,255,255,0.18)');
    rect(c, b0, -bw / 2, b1 - b0, bw, bw * 0.18, gl, rgba('#E8F4F8', 0.85), 2);
    rect(c, b0 - L * 0.012, -bw * 0.78, L * 0.02, bw * 1.56, 3, '#C9D3D8');
    for (let k = 1; k < 9; k++) { const xx = lerp(b0, b1, k / 9); line(c, [[xx, -bw / 2], [xx, -bw / 2 + (k % 2 ? bw * 0.22 : bw * 0.36)]], rgba('#E8F4F8', 0.75), 1.5); }
    c.restore();
  });
}
export function drawVial(c, x, y, w, h, o = {}) {
  const cap = o.cap ?? 1;
  rect(c, x - w / 2, y - h / 2, w, h, w * 0.14, rgba('#E8F4F8', 0.07), rgba('#E8F4F8', 0.75), 2.5);
  rect(c, x - w * 0.36, y - h / 2 - h * 0.06, w * 0.72, h * 0.07, 4, rgba('#E8F4F8', 0.25), rgba('#E8F4F8', 0.6), 1.5);
  if (cap > 0) withAlpha(c, cap, () => rect(c, x - w * 0.42, y - h / 2 - h * 0.15 - (1 - cap) * 30, w * 0.84, h * 0.1, 5, '#C8D2D6', rgba('#04121A', 0.4), 1.2));
  const gl = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(0.18, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0.08)');
  rect(c, x - w / 2, y - h / 2, w, h, w * 0.14, gl);
}
export function receptor(c, x, y, s, col = '#F2C29B', up = 1) {
  line(c, [[x, y], [x, y - s * 0.75 * up]], col, s * 0.16);
  c.beginPath(); c.arc(x, y - s * 0.95 * up, s * 0.28, up > 0 ? 0 : Math.PI, up > 0 ? Math.PI : TAU); c.strokeStyle = col; c.lineWidth = s * 0.16; c.lineCap = 'round'; c.stroke();
}
export function membrane(c, x0, x1, y, o = {}) {
  const th = o.th ?? 26, dip = o.dip || null, dep = o.depth ?? 140;   // dip: {x, w, d} an invagination
  const Y = x => (dip ? y + dip.d * Math.exp(-(((x - dip.x) / dip.w) ** 2)) : y);
  const inner = c.createLinearGradient(0, y, 0, y + dep); inner.addColorStop(0, rgba(PAL.cellIn, 0.85)); inner.addColorStop(1, rgba(PAL.cellIn, 0.15));
  c.beginPath(); c.moveTo(x0, Y(x0)); for (let x = x0; x <= x1; x += 6) c.lineTo(x, Y(x)); c.lineTo(x1, y + dep); c.lineTo(x0, y + dep); c.closePath(); c.fillStyle = inner; c.fill();
  for (const k of [0, 1]) { c.beginPath(); for (let x = x0; x <= x1; x += 6) { const yy = Y(x) + k * th * 0.55; x === x0 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.strokeStyle = rgba(PAL.cell, 0.85); c.lineWidth = 5; c.stroke(); }
  for (let x = x0 + 6; x < x1; x += 11) { circle(c, x, Y(x) - 3, 3.2, rgba(PAL.cell, 0.9)); circle(c, x, Y(x) + th * 0.55 + 3, 3.2, rgba(PAL.cell, 0.75)); }
}
function thermo(stage, x, y, h, T, o = {}) {
  const c = stage.ctx, lo = 30, hi = 39, q = clamp((T - lo) / (hi - lo)), col = mix(PAL.cool, PAL.warm, clamp((T - 33) / 4));
  rect(c, x - 12, y - h, 24, h, 12, rgba('#E8F4F8', 0.1), rgba('#E8F4F8', 0.7), 2);
  circle(c, x, y + 10, 20, rgba('#E8F4F8', 0.7)); circle(c, x, y + 10, 16, col);
  rect(c, x - 6, y - h * q, 12, h * q + 12, 6, col);
  for (const tt of [33, 35, 37]) { const yy = y - h * (tt - lo) / (hi - lo); line(c, [[x + 14, yy], [x + 24, yy]], rgba('#E8F4F8', 0.8), 2); }
  if (o.label !== false) stage.text(`${T.toFixed(o.dec ?? 0)} °C`, x + (o.right === false ? -30 : 30), y - h * q, {size: o.size || 30, weight: 700, color: col, align: o.right === false ? 'right' : 'left', role: 'display'});
}

// ---- small icons (clean line drawings; no faces) ----
function cowIcon(c, x, y, s, col = '#D9CBB8', a = 1) {
  if (a <= 0) return;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
    const dark = mix(col, '#0A1A20', 0.35);
    c.beginPath();                                               // body (facing left)
    c.moveTo(-40, -22); c.bezierCurveTo(-20, -30, 30, -30, 52, -24); c.bezierCurveTo(64, -20, 66, 4, 60, 16);
    c.lineTo(58, 20); c.bezierCurveTo(40, 26, -20, 26, -38, 18); c.bezierCurveTo(-46, 8, -46, -14, -40, -22); c.closePath();
    c.fillStyle = col; c.fill();
    for (const [lx, w] of [[-34, 9], [-20, 9], [40, 9], [52, 9]]) rect(c, lx - w / 2, 14, w, 40, 3, lx < 0 ? col : dark);
    c.beginPath(); c.moveTo(-40, -20); c.bezierCurveTo(-50, -26, -62, -24, -70, -14); c.bezierCurveTo(-76, -4, -74, 8, -66, 10); c.bezierCurveTo(-58, 12, -48, 4, -40, 2); c.closePath(); c.fillStyle = col; c.fill();
    c.beginPath(); c.ellipse(-71, 4, 8, 7, 0.3, 0, TAU); c.fillStyle = mix(col, '#E8A0A0', 0.5); c.fill();   // muzzle
    line(c, [[-58, -22], [-62, -34], [-54, -38]], mix(col, '#FFFFFF', 0.4), 3.5); line(c, [[-50, -22], [-46, -34], [-38, -36]], mix(col, '#FFFFFF', 0.4), 3.5);
    line(c, [[62, -18], [72, 6], [70, 22]], col, 3);                                                   // tail
    c.beginPath(); c.ellipse(26, 24, 12, 7, 0, 0, TAU); c.fillStyle = mix(col, '#E8A0A0', 0.45); c.fill();   // udder
    for (const [px, py, pr] of [[-6, -6, 10], [24, -10, 8], [38, 6, 7]]) { c.beginPath(); c.ellipse(px, py, pr * 1.3, pr, 0.2, 0, TAU); c.fillStyle = rgba('#5E4A3C', 0.55); c.fill(); }
    c.restore();
  });
}
function noseIcon(c, x, y, s, col, a = 1) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
    line(c, [[-6, -60], [-10, -20], [-34, 26], [-30, 38], [-12, 42], [0, 34], [14, 42], [30, 38]], col, 6);
    c.beginPath(); c.ellipse(-12, 30, 8, 5, -0.4, 0, TAU); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); c.restore(); });
}
function flameIcon(c, x, y, s, a = 1) {
  withAlpha(c, a, () => { c.save(); c.translate(x, y); c.scale(s / 100, s / 100);
    const fl = (k, col) => { c.beginPath(); c.moveTo(0, -60 * k); c.bezierCurveTo(26 * k, -28 * k, 40 * k, 0, 32 * k, 22 * k); c.bezierCurveTo(24 * k, 44 * k, -24 * k, 44 * k, -32 * k, 22 * k); c.bezierCurveTo(-40 * k, 2 * k, -14 * k, -20 * k, 0, -60 * k); c.fillStyle = col; c.fill(); };
    fl(1, '#FF7A3D'); fl(0.62, '#FFC25A'); c.restore(); });
}
function personIcon(c, x, y, s, col = '#B8C7CE', a = 1) {
  withAlpha(c, a, () => { circle(c, x, y - s * 0.42, s * 0.2, col); c.beginPath(); c.ellipse(x, y + s * 0.18, s * 0.36, s * 0.32, 0, Math.PI, TAU); c.fillStyle = col; c.fill(); });
}
function poxIcon(c, x, y, s, col = '#C9A27A') { rect(c, x - s * 0.6, y - s * 0.42, s * 1.2, s * 0.84, s * 0.3, col, rgba('#04121A', 0.4), 1); circle(c, x, y, s * 0.18, mix(col, '#000000', 0.35)); }
function shieldIcon(c, x, y, s, col, a = 1) {
  withAlpha(c, a, () => { c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x + s * 0.85, y - s * 0.8, x + s * 0.8, y - s * 0.55); c.quadraticCurveTo(x + s * 0.7, y + s * 0.55, x, y + s); c.quadraticCurveTo(x - s * 0.7, y + s * 0.55, x - s * 0.8, y - s * 0.55); c.quadraticCurveTo(x - s * 0.85, y - s * 0.8, x, y - s); c.closePath(); c.fillStyle = rgba(col, 0.25); c.fill(); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); });
}

// =====================================================================================================
// Header titles (sequential swaps) and the poster title
// =====================================================================================================
export const titles = {
  hook: ['감기 주사', '왜 아직 없을까'],   // kicker = the poster keyword (2026-11-13)
  origin: ['기원 · 이름', '감기와 고뿔'],
  essence: ['본질 · 백신', '겉모양을 미리 보여 주기'],
  types: ['메커니즘 · 범인의 수', '200가지가 넘는 바이러스'],
  nose: ['메커니즘 · 콧속', '서늘한 코에서 불어난다'],
  flu: ['비교 · 독감', '유행하는 형이 세 가지 안팎'],
  try: ['도전 · 2016년', '50가지 형을 한 번에'],
  myth: ['오해 바로잡기', '감기에 항생제?'],
  close: ['지금의 예방', '손 씻기'],
};
function titleList(id, tl) {
  const P = plan(tl);
  if (id === 'origin') return [[-Infinity, ...titles.origin], [P.s04, '기원 · 백신', '소에서 온 이름'], [P.s05, '기원 · 1960~70년대', '첫 감기 백신 시험']];
  if (id === 'essence') return [[-Infinity, ...titles.essence], [P.s07, '본질 · 항체', '열쇠처럼 맞물려 막기']];
  if (id === 'types') return [[-Infinity, ...titles.types], [P.s09, '메커니즘 · 리노바이러스', '160가지가 넘는 형'], [P.s10, '메커니즘 · 항체의 짝', '한 형에 맞춘 항체'], [P.s11, '메커니즘 · 면역', '다른 형은 못 막는다']];
  if (id === 'nose') return [[-Infinity, ...titles.nose], [P.s13, '메커니즘 · 주사 항체', '점막 겉면엔 항체가 적다']];
  if (id === 'flu') return [[-Infinity, ...titles.flu], [P.s15, '판단 · 비용과 이득', '비용·위험을 감수하기 어렵다']];
  if (id === 'try') return [[-Infinity, ...titles.try], [P.s17, '도전 · 결과', '50가지 중 49가지에 항체']];
  return [[-Infinity, ...(titles[id] || ['', ''])]];
}
export function overlays(stage, t, ctx) {
  const id = ctx.scene.id, P = plan(ctx.tl);
  if (id === 'hook') {
    if (t < MORPH[1]) { posterTitle(stage, t); return; }                // frame 0 = thumbnail: no progress bar yet
    const ho = fadeOut(t, ctx.scene.end - 0.3, 0.28);
    head(stage, POSTER_Q.k, POSTER_Q.q, fadeIn(t, MORPH[1] - 0.05, 0.4) * ho, ho, '', ho, 'rgba(0,0,0,0.95)');
    withAlpha(stage.ctx, fadeIn(t, MORPH[1], 0.4), () => progressBar(stage, t, ctx.tl.duration)); return;
  }
  if (id === 'close') {
    const a = smooth(ctx.scene.p / 0.04) * fadeOut(t, P.reason - 0.35, 0.3);
    if (a > 0) head(stage, ...titles.close, a, a);
    progressBar(stage, t, ctx.tl.duration); return;
  }
  const L = titleList(id, ctx.tl), a = smooth(ctx.scene.p / 0.04) * fadeOut(t, ctx.scene.end - 0.3, 0.28);
  let k = 0; while (k + 1 < L.length && t >= L[k + 1][0]) k++;
  const out = k > 0 ? smooth((t - L[k][0]) / 0.3) : 1, inn = k > 0 ? smooth((t - L[k][0] - 0.3) / 0.35) : 1, prev = L[Math.max(0, k - 1)], cur = L[k];
  if (k > 0 && out < 1) head(stage, prev[1] === cur[1] ? '' : prev[1], prev[2], a * (1 - out), a * (1 - out));
  head(stage, cur[1], cur[2], k > 0 && prev[1] !== cur[1] ? a * inn : a, a * inn);
  progressBar(stage, t, ctx.tl.duration);
}
// 2026-11-13 (owner: "주제어가 딱 보여야 해"): white question on top, the topic keyword (k) below as the biggest text, no answer.
// The question shrinks into the header title; the keyword shrinks a little in place and fades, and the header kicker shows it.
const POSTER_Q = {y: 1010, y2: 1180, q: '왜 아직 없을까', k: '감기 주사'};
let QSIZE = 0, KSIZE = 0;
/** t = 0 poster text (question + huge topic keyword in the central square) shrinking into the hook header; also the close bookend */
function posterTitle(stage, t, q = easeInOut((t - MORPH[0]) / (MORPH[1] - MORPH[0])), a = 1) {
  const c = stage.ctx, T = stage.theme;
  const TR = -0.03, fit = (s, w, max) => Math.min(max, max * w / stage.measure(s, {role: 'display', weight: 700, size: max, tracking: TR * max}));
  QSIZE ||= fit(POSTER_Q.q + '?', 770, 96); KSIZE ||= fit(POSTER_Q.k, 796, 210);
  const y1 = lerp(POSTER_Q.y, 228, q), s1 = lerp(QSIZE, 54, q), s2 = KSIZE * lerp(1, 0.7, q), tr = lerp(TR, -0.011, q), ak = 1 - smooth(q / 0.6);
  if (q < 1) withAlpha(c, (1 - q) * a, () => {
    const g2 = c.createLinearGradient(0, 880, 0, 1340); g2.addColorStop(0, 'rgba(0,8,13,0)'); g2.addColorStop(0.22, 'rgba(0,8,13,0.74)'); g2.addColorStop(0.82, 'rgba(0,8,13,0.74)'); g2.addColorStop(1, 'rgba(0,8,13,0)');
    c.fillStyle = g2; c.fillRect(0, 880, 1080, 460);
  });
  withAlpha(c, a, () => {
    const sh = q < 0.5 ? 'rgba(0,0,0,0.9)' : null;
    const wb = stage.measure(POSTER_Q.q, {role: 'display', weight: 700, size: s1, tracking: tr * s1}), wq = stage.measure('?', {role: 'display', weight: 700, size: s1, tracking: tr * s1}), kq = 1 - smooth(q / 0.7);
    const x0 = 540 - (wb + wq * kq) / 2;
    stage.text(POSTER_Q.q, x0, y1, {role: 'display', weight: 700, size: s1, color: T.ink, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (kq > 0) stage.text('?', x0 + wb, y1, {role: 'display', weight: 700, size: s1, color: T.ink, alpha: kq, shadow: sh, shadowBlur: 20, tracking: tr * s1});
    if (ak > 0) stage.text(POSTER_Q.k, 540, POSTER_Q.y2, {role: 'display', weight: 700, size: s2, color: PAL.answer, align: 'center', alpha: ak, tracking: TR * s2, shadow: 'rgba(0,0,0,0.9)', shadowBlur: 26});
  });
}
/** the poster picture: the crowd of cold viruses and the one syringe (drift is slow; t = 0 is the thumbnail) */
function crowdLayer(stage, t, a = 1, o = {}) {
  const c = stage.ctx, tt = Math.max(0, t - (o.t0 ?? 0));
  for (const v of CROWD) {
    const x = v.x + v.amp * Math.sin(0.33 * tt + v.ph) - v.amp * Math.sin(v.ph), y = v.y + v.amp * 0.8 * (Math.cos(0.27 * tt + v.ph * 1.3) - Math.cos(v.ph * 1.3));
    const rot = [v.rot[0] + v.spin * tt, v.rot[1] + v.spin * 0.7 * tt, v.rot[2]], depth = clamp((v.r - 20) / 90);
    const pulse = o.pulse ? o.pulse(v) : 0;
    withAlpha(c, a * (0.5 + 0.5 * depth), () => {
      if (pulse > 0) glow(c, x, y, v.r * 1.7, v.kind === 'rhino' ? RV[v.rv].col : FAM[v.kind].col, 0.35 * pulse);
      coldVirus(c, v.kind, x, y, v.r, rot, {rv: v.rv});
    });
  }
}
function posterSyringe(stage, a = 1, x = POSTER_SYR.x, y = POSTER_SYR.y, len = POSTER_SYR.len, ang = POSTER_SYR.ang) {
  if (a <= 0) return;
  withAlpha(stage.ctx, a, () => { glow(stage.ctx, x, y, len * 0.7, '#7FD8F0', 0.12); drawSyringe(stage.ctx, x, y, len, ang, {}); });
}

// =====================================================================================================
// Scenes
// =====================================================================================================
let staleWarned = false;
function checkSoundTable(ctx) {
  if (staleWarned) return; staleWarned = true;
  const e = ctx.events.find(x => x.model);
  if (!e?.model || e.model.sig !== modelSignature(ctx.tl)) console.warn('warning: sound tables in sound.json are stale — run node episodes/cold-vaccine/scenes.mjs --emit-sound');
}
/** a short fingerprint of the model + timeline (stored in sound.json; a mismatch means re-run --emit-sound) */
export function modelSignature(tl) {
  const P = plan(tl);
  let h = 0; for (const t of [9.1, 47.0, 81.3, 95.5, 115.0, 121.5, 137.2, 158.6]) h += P.nAt(t, 33) / 50 + P.nAt(t, 37) / 50 + P.beam(t) * 10 + P.yearAt(t) + P.litN(0, t) / 50 + P.litN(1, t) / 50;
  return `${h.toFixed(4)}@${tl.duration.toFixed(3)}/K${K}/${P.coldT.flat().map(x => x.toFixed(3)).join(',')}/${P.probeT.map(x => x.toFixed(3)).join(',')}/${P.settle.toFixed(3)}/${P.burst.toFixed(3)}/${FITS_K.reduce((s, f) => s + f, 0).toFixed(4)}`;
}

export const scenes = {
  hook(stage, t, p, ctx) { checkSoundTable(ctx); hookScene(stage, t, ctx); },
  origin(stage, t, p, ctx) { originScene(stage, t, ctx); },
  essence(stage, t, p, ctx) { essenceScene(stage, t, ctx); },
  types(stage, t, p, ctx) { typesScene(stage, t, ctx); },
  nose(stage, t, p, ctx) { noseScene(stage, t, ctx); },
  flu(stage, t, p, ctx) { fluScene(stage, t, ctx); },
  try(stage, t, p, ctx) { tryScene(stage, t, ctx); },
  myth(stage, t, p, ctx) { mythScene(stage, t, ctx); },
  close(stage, t, p, ctx) { closeScene(stage, t, ctx); },
};

// ------------------------------------------------------------------ hook: poster → flu shot exists, cold shot "?" → two example years of colds
const CARD_SYR = {x: 340, y: 528, len: 300, ang: -0.32};
function hookScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), ef = fadeOut(t, ctx.scene.end - 0.25, 0.25);
  const dim = t < MORPH[1] ? 1 : lerp(1, 0.42, smooth((t - MORPH[1]) / 0.9)) * lerp(1, 0.6, fadeIn(t, P.yr[0] - 0.6, 0.6));
  crowdLayer(stage, t, dim * ef);
  const cardA = fadeIn(t, MORPH[1] + 0.05, 0.4) * ef;
  if (cardA > 0) withAlpha(c, cardA, () => {
    panel(c, T, 140, 340, 390, 360, 0.88); panel(c, T, 550, 340, 390, 360, 0.88);
    stage.text('독감 예방 주사', 335, 384, {role: 'display', size: 32, weight: 700, color: T.ink, align: 'center'});
    stage.text('감기 예방 주사', 745, 384, {role: 'display', size: 32, weight: 700, color: T.ink, align: 'center', alpha: 0.35 + 0.65 * fadeIn(t, P.coldCard, 0.3)});
  });
  // the poster syringe glides into the flu card
  const gq = easeInOut((t - P.glide[0]) / (P.glide[1] - P.glide[0]));
  posterSyringe(stage, ef, lerp(POSTER_SYR.x, CARD_SYR.x, gq), lerp(POSTER_SYR.y, CARD_SYR.y, gq), lerp(POSTER_SYR.len, CARD_SYR.len, gq), lerp(POSTER_SYR.ang, CARD_SYR.ang, gq));
  if (cardA > 0) withAlpha(c, cardA, () => {
    const ok = fadeIn(t, P.fluOk, 0.3);
    check(c, 272, 650, 16, PAL.good, 5, ok); stage.text('있음', 300, 650, {role: 'display', size: 32, weight: 700, color: PAL.good, alpha: ok});
    const cq = fadeIn(t, P.coldCard, 0.35);
    drawSyringe(c, 745, 528, 300, -0.32, {dashed: true, a: cq});
    const wq = fadeIn(t, P.why, 0.3), bob = Math.sin(TAU * 0.8 * (t - P.why)) * 4 * (1 - fadeIn(t, P.none, 0.3));
    stage.text('?', 745, 520 + bob, {role: 'display', size: 120, weight: 700, color: PAL.answer, align: 'center', alpha: wq, shadow: 'rgba(0,0,0,0.8)', shadowBlur: 16});
    const nq = fadeIn(t, P.none, 0.3);
    cross(c, 668, 650, 13, PAL.bad, 5, nq); stage.text('아직 없음', 694, 650, {role: 'display', size: 32, weight: 700, color: PAL.bad, alpha: nq});
  });
  // s02: two example years of colds; the cursor sweeps one model year
  const yA = fadeIn(t, P.yr[0] - 0.55, 0.45) * ef;
  if (yA > 0) withAlpha(c, yA, () => yearStrips(stage, t, P));
}
const YR = {x0: 250, x1: 910, rows: [930, 1070], h: 62};
const monthX = m => lerp(YR.x0, YR.x1, m / 12);
function yearStrips(stage, t, P) {
  const c = stage.ctx, T = stage.theme, q = clamp((t - P.yr[0]) / (P.yr[1] - P.yr[0])), cx = monthX(12 * q);
  panel(c, T, 140, 760, 800, 530, 0.88);
  stage.text('어른 한 사람의 감기 (예시 두 해)', 160, 800, {size: 26, weight: 700, color: T.muted});
  COLD_YEARS.forEach((yr, r) => {
    const y = YR.rows[r], n = P.coldT[r].filter(x => t >= x).length;
    for (let m = 0; m < 12; m++) rect(c, monthX(m) + 2, y - YR.h / 2, (YR.x1 - YR.x0) / 12 - 4, YR.h, 6, rgba(T.deep, 0.75), rgba(T.border, 1), 1.2);
    stage.text(yr.n, 160, y - 4, {size: 26, weight: 700, color: T.ink});
    stage.text(`${n}번`, 160, y + 26, {role: 'display', size: 26, weight: 700, color: n ? PAL.answer : T.muted});
    yr.m.forEach((m, k) => {
      const t0 = P.coldT[r][k], u = clamp((t - t0) / 0.3); if (u <= 0) return;
      const x = monthX(m), fl = Math.exp(-Math.max(0, t - t0) / 0.35), kinds = ['rhino', 'corona', 'rhino', 'adeno', 'rhino'], kind = kinds[(r * 2 + k) % kinds.length];
      if (fl > 0.02) glow(c, x, y, 50, PAL.answer, 0.45 * fl);
      const sp = kind === 'rhino' ? rvSprite([3, 101, 140][k % 3], 20) : coldSprite(kind, 20);
      const S = sp.S * easeOut(u) * (1 + 0.25 * fl); c.drawImage(sp.cv, x - S / 2, y - S / 2, S, S);
    });
  });
  for (const m of [0, 3, 6, 9, 12]) { line(c, [[monthX(m), YR.rows[1] + YR.h / 2 + 4], [monthX(m), YR.rows[1] + YR.h / 2 + 12]], T.muted, 2); }
  [['1월', 0.5], ['4월', 3.5], ['7월', 6.5], ['10월', 9.5], ['12월', 11.5]].forEach(([s, m]) => stage.text(s, monthX(m), YR.rows[1] + YR.h / 2 + 34, {size: 24, weight: 500, color: T.muted, align: 'center'}));
  if (q > 0 && q < 1) { line(c, [[cx, YR.rows[0] - YR.h / 2 - 14], [cx, YR.rows[1] + YR.h / 2 + 14]], rgba('#FFFFFF', 0.85), 3); glow(c, cx, (YR.rows[0] + YR.rows[1]) / 2, 60, '#FFFFFF', 0.12); }
  tag(stage, '한 해 평균 2~3번', 540, 1226, {size: 30, color: PAL.answer, a: fadeIn(t, P.yr[1] - 0.1, 0.35), plate: false, role: 'display'});
}

// ------------------------------------------------------------------ origin: 感氣 · 고뿔 → vaccine ← vacca, 1796 Jenner → the 1960s one-type trial
function originScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const a3 = fadeOut(t, P.s04, 0.3) * sf, a4 = fadeIn(t, P.s04 + 0.3, 0.4) * fadeOut(t, P.s05, 0.3) * sf, a5 = fadeIn(t, P.s05 + 0.3, 0.4) * sf;
  if (a3 > 0) withAlpha(c, a3, () => nameCards(stage, t, P));
  if (a4 > 0) withAlpha(c, a4, () => vaccineCards(stage, t, P));
  if (a5 > 0) withAlpha(c, a5, () => trial(stage, t, P));
}
function nameCards(stage, t, P) {
  const c = stage.ctx, T = stage.theme, h = fadeIn(t, P.hanja, 0.4), dy = 250 * (1 - easeInOut((t - P.old + 0.55) / 0.55));
  c.save(); c.translate(0, dy);
  panel(c, T, 140, 340, 800, 380, 0.88);
  // the two characters slide together
  const s1 = easeOut((t - P.hanja) / 0.7);
  stage.text('感', lerp(400, 462, s1), 470, {size: 150, weight: 700, color: T.ink, align: 'center', alpha: h});
  stage.text('氣', lerp(680, 618, s1), 470, {size: 150, weight: 700, color: T.ink, align: 'center', alpha: h});
  stage.text('느낄 감', 462, 584, {size: 28, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, P.hanja + 0.5, 0.4)});
  stage.text('기운 기', 618, 584, {size: 28, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, P.hanja + 0.5, 0.4)});
  tag(stage, '우리나라에서 만든 한자말', 540, 646, {size: 30, color: PAL.answer, a: fadeIn(t, P.korea, 0.35), role: 'display', border: PAL.answer});
  stage.text('중국 感冒 · 일본 風邪', 540, 694, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, P.korea + 0.9, 0.4)});
  c.restore();
  // 고뿔 ← 곳블 = 고(코) + ㅅ + 블(불)
  const oA = fadeIn(t, P.old, 0.4); if (oA <= 0) return;
  withAlpha(c, oA, () => {
    panel(c, T, 140, 760, 800, 540, 0.88);
    stage.text('옛말', 160, 800, {size: 26, weight: 700, color: T.muted});
    const ko = fadeIn(t, P.ko, 0.3), bu = fadeIn(t, P.bul, 0.3), m = easeInOut((t - P.merge[0]) / (P.merge[1] - P.merge[0])), gp = fadeIn(t, P.goppul, 0.2), gp2 = fadeIn(t, P.goppul + 0.2, 0.3);
    noseIcon(c, 300, 925, 150, PAL.cool, ko * (1 - 0.6 * m)); flameIcon(c, 780, 925, 150, bu * (1 - 0.6 * m));
    // syllables: 고 (from the nose) + ㅅ + 블 (from the fire) → 곳블
    const yS = lerp(1060, 1080, m), sz = lerp(64, 84, m);
    stage.text('고', lerp(300, 470, m), yS, {role: 'display', size: sz, weight: 700, color: PAL.cool, align: 'center', alpha: ko * (1 - gp)});
    stage.text('ㅅ', lerp(540, 532, m), yS + lerp(30, 6, m), {role: 'display', size: sz * 0.6, weight: 700, color: T.muted, align: 'center', alpha: m * (1 - gp)});
    stage.text('블', lerp(780, 610, m), yS, {role: 'display', size: sz, weight: 700, color: PAL.warm, align: 'center', alpha: bu * (1 - gp)});
    stage.text('= 코', 300, 1124, {size: 28, weight: 500, color: T.muted, align: 'center', alpha: ko * (1 - m)});
    stage.text('= 불', 780, 1124, {size: 28, weight: 500, color: T.muted, align: 'center', alpha: bu * (1 - m)});
    tag(stage, '곳블 · 15세기 문헌', 540, 1150, {size: 24, color: T.muted, a: m * (1 - gp), plate: false});
    stage.text('고뿔', 540, 1080 - 10 * (1 - gp2), {role: 'display', size: 96, weight: 700, color: T.ink, align: 'center', alpha: gp2, shadow: 'rgba(0,0,0,0.6)', shadowBlur: 12});
    stage.text('고뿔 ← 곳블 = 고(코) + 불', 540, 1236, {role: 'display', size: 34, weight: 700, color: PAL.answer, align: 'center', alpha: fadeIn(t, P.goppul + 0.35, 0.4)});
  });
}
const COW = {x: 300, y: 560, s: 230};
function vaccineCards(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, 140, 340, 800, 420, 0.88);
  cowIcon(c, COW.x, COW.y, COW.s, '#D9CBB8', fadeIn(t, P.cow, 0.4));
  tag(stage, '소', COW.x, 680, {size: 30, color: T.ink, a: fadeIn(t, P.cow + 0.2, 0.3), plate: false, role: 'display'});
  const vA = fadeIn(t, P.vac, 0.35), lA = fadeIn(t, P.latin, 0.35), m = easeInOut((t - P.vacca[0]) / (P.vacca[1] - P.vacca[0]));
  stage.text('백신', 700, 400, {role: 'display', size: 34, weight: 700, color: T.muted, align: 'center', alpha: vA});
  // "vacca" below, "vaccine" above; the shared letters v-a-c-c lift from vacca into vaccine
  const word = (s, x, y, size, col, al) => { const w = stage.measure(s, {size, weight: 700, role: 'display'}); stage.text(s, x - w / 2, y, {role: 'display', size, weight: 700, color: col, alpha: al}); return x - w / 2; };
  const VX = 700, vy = 470, ay = 620, sz = 66;
  const mp = easeOut(clamp((t - P.vacca[0]) / ((P.vacca[1] - P.vacca[0]) * 0.75)));
  const xV = word('vaccine', VX, vy, sz, T.ink, vA * (t > P.vacca[0] ? 0.2 + 0.8 * smooth((mp - 0.85) / 0.15) : 1));
  const xa = word('vacca', VX, ay, sz, PAL.warm, lA);
  if (m > 0 && m < 1) {
    let ox = 0, oy = 0; const wV = stage.measure('vacc', {size: sz, weight: 700, role: 'display'});
    const al = smooth((m - 0.12) / 0.12) * (1 - smooth((mp - 0.7) / 0.15));
    for (const ch of 'vacc') { const w = stage.measure(ch, {size: sz, weight: 700, role: 'display'}); stage.text(ch, lerp(xa + ox, xV + ox, mp), lerp(ay, vy, mp), {role: 'display', size: sz, weight: 700, color: PAL.warm, alpha: al}); ox += w; }
    void wV; void oy;
  }
  withAlpha(c, lA, () => arrow(c, [VX, ay - 44], [VX, vy + 44], rgba(PAL.warm, 0.9), 4, {head: 16}));
  stage.text('라틴어 · 소', VX, 684, {size: 28, weight: 700, color: PAL.warm, align: 'center', alpha: lA});
  stage.text('vaccine ← vacca (라틴어, 소)', 540, 734, {size: 28, weight: 700, color: PAL.answer, align: 'center', alpha: fadeIn(t, P.vacca[1] - 0.1, 0.4)});
  // 1796 · Jenner: cowpox from the cow → a person → smallpox blocked
  const jA = fadeIn(t, P.jenner, 0.4); if (jA <= 0) return;
  withAlpha(c, jA, () => {
    panel(c, T, 140, 800, 800, 500, 0.88);
    stage.text('1796 · 제너', 160, 842, {role: 'display', size: 32, weight: 700, color: T.accent});
    const N = [{x: 250, y: 1030}, {x: 540, y: 1030}, {x: 830, y: 1030}];
    cowIcon(c, N[0].x, N[0].y, 150, '#D9CBB8');
    personIcon(c, N[1].x, N[1].y + 10, 120);
    const sq = fadeIn(t, P.shield, 0.35);
    shieldIcon(c, N[1].x, N[1].y + 4, 82, PAL.good, sq);
    line(c, [[N[0].x + 90, N[0].y], [N[1].x - 80, N[1].y]], rgba(T.muted, 0.6), 2.5, {dash: [8, 7]});
    // cowpox particles travel cow → person
    const pq = (t - P.pox[0]) / (P.pox[1] - P.pox[0]);
    for (let k = 0; k < 4; k++) { const u = clamp(pq * 1.4 - k * 0.13); if (u <= 0 || u >= 1) continue; poxIcon(c, lerp(N[0].x + 90, N[1].x - 70, easeInOut(u)), N[0].y - 8 + 10 * Math.sin(k * 2.1 + u * 6), 22, '#D4B48C'); }
    // smallpox arrives from the right and stops at the shield
    const sx = t < P.shield - 0.6 ? N[2].x : lerp(N[2].x, N[1].x + 120, easeOut((t - P.shield + 0.6) / 0.6)), bounce = t > P.shield ? 22 * Math.sin(Math.min(Math.PI, (t - P.shield) * 6)) * Math.exp(-(t - P.shield) * 2) : 0;
    withAlpha(c, fadeIn(t, P.pox[0] + 0.3, 0.3), () => { for (let k = 0; k < 3; k++) poxIcon(c, sx + bounce + [0, 40, 8][k], N[2].y - 46 + k * 44, 26, '#C0584A'); });
    stage.text('소의 우두', N[0].x, 1150, {size: 28, weight: 700, color: T.ink, align: 'center'});
    stage.text('사람에게 접종', N[1].x, 1150, {size: 28, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.pox[0] + 0.5, 0.3)});
    stage.text('천연두', N[2].x, 1150, {size: 28, weight: 700, color: '#E88A7A', align: 'center', alpha: fadeIn(t, P.pox[0] + 0.3, 0.3)});
    tag(stage, '우두 → 천연두 예방', 540, 1236, {size: 32, color: PAL.good, a: sq, role: 'display', border: PAL.good});
  });
}
// the 1960s trial: an RV13 vaccine; the matching type is held off, another type docks
const TR = {memY: 1150, xs: [450, 760], top: 520};
function trial(stage, t, P) {
  const c = stage.ctx, T = stage.theme, v13 = RV[TRIAL.vac], vo = RV[TRIAL.other];
  tag(stage, '1960~70년대 시험 · 한 형(RV13 등)', 540, 372, {size: 30, color: T.ink, role: 'display', border: T.accent, a: fadeIn(t, P.trial, 0.4)});
  panel(c, T, 140, 420, 800, 880, 0.82);
  membrane(c, 150, 930, TR.memY, {th: 22});
  TR.xs.forEach(x => receptor(c, x, TR.memY, 56));
  stage.text('세포', 160, 1260, {size: 26, weight: 700, color: PAL.cell, alpha: 0.9});
  // vaccine vial (one type) and its antibodies
  const va = fadeIn(t, P.trial + 0.5, 0.4);
  withAlpha(c, va, () => {
    drawVial(c, 230, 560, 92, 150);
    for (let k = 0; k < 4; k++) drawRvSprite(c, TRIAL.vac, 214 + (k % 2) * 34, 520 + Math.floor(k / 2) * 46, 14);
    stage.text('RV13 백신', 230, 676, {size: 26, weight: 700, color: v13.col, align: 'center'});
  });
  // the two viruses descend; RV13 is caught by antibodies; the other type passes and docks
  const q = easeInOut((t - P.arrive5[0]) / (P.arrive5[1] - P.arrive5[0])), r = 62;
  const yStop = 760, dockY = TR.memY - 56 * 0.95 - r * 1.02;
  const y13 = t < P.lock5 ? lerp(TR.top, yStop, q) : yStop - 14 * Math.sin(Math.min(Math.PI, (t - P.lock5) * 7)) * Math.exp(-(t - P.lock5) * 2.5);
  const yO = t < P.arrive5[1] ? lerp(TR.top, yStop, q) : lerp(yStop, dockY, easeInOut((t - P.tap5 - 0.1) / (P.dock5 - P.tap5 - 0.1)));
  const vis = fadeIn(t, P.arrive5[0] - 0.2, 0.3);
  withAlpha(c, vis, () => {
    drawIco(c, TR.xs[0], y13, r, v13.col, [0.3 + 0.2 * t, 0.5 + 0.15 * t, 0.1], {shape: v13.s});
    drawIco(c, TR.xs[1], yO, r, vo.col, [0.6 + 0.2 * t, 0.2 + 0.15 * t, 0.3], {shape: vo.s});
    stage.text('RV13', TR.xs[0], y13 - r - 26, {size: 26, weight: 700, color: v13.col, align: 'center'});
    stage.text('다른 형', TR.xs[1], yO - r - 26, {size: 26, weight: 700, color: vo.col, align: 'center'});
  });
  // antibodies: float, then three lock onto RV13 (fit 1); one tries the other type and falls off (fit ≈ 0)
  const abA = fadeIn(t, P.vial5, 0.4);
  const AB0 = [[300, 930, -0.4], [430, 990, 0.5], [560, 920, 0.2], [640, 1010, -0.3]];
  const PHI = [Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75];
  AB0.forEach(([x0, y0, a0], k) => {
    const fx = x0 + 10 * Math.sin(t * 1.3 + k), fy = y0 + 8 * Math.cos(t * 1.1 + k * 2);
    if (k < 3) {
      const u = easeInOut((t - (P.lock5 - 0.55 + k * 0.08)) / 0.55);
      const phi = PHI[k], bx = TR.xs[0] + Math.cos(phi) * (r + 34 * 0.78), by = y13 + Math.sin(phi) * (r + 34 * 0.78);
      if (u >= 1) boundAb(c, TR.xs[0], y13, r, phi, 34, {a: abA});
      else drawAb(c, lerp(fx, bx, u), lerp(fy, by, u), 34, lerp(a0, phi + Math.PI / 2, u), {a: abA});
      if (u >= 1 && t - P.lock5 < 0.5) glow(c, bx, by, 40, PAL.ab, 0.5 * (1 - (t - P.lock5) / 0.5));
    } else {
      const u = clamp((t - (P.tap5 - 0.45)) / 0.45), back = clamp((t - P.tap5) / 0.6);
      const tx = TR.xs[1] - r * 0.9, ty = yStop + r * 0.3;
      const x = u < 1 ? lerp(fx, tx - 30, easeInOut(u)) : lerp(tx - 30, 640, easeOut(back)), y = u < 1 ? lerp(fy, ty, easeInOut(u)) : lerp(ty, 880, easeOut(back));
      drawAb(c, x, y, 34, u < 1 ? lerp(a0, 1.2, u) : 1.2 + back * 1.5, {a: abA});
    }
  });
  stage.text('RV13에 맞춘 항체', 290, 1062, {size: 26, weight: 700, color: PAL.ab, alpha: abA * fadeOut(t, P.lock5 - 0.3, 0.3)});
  const okA = fadeIn(t, P.lock5 + 0.15, 0.3), noA = fadeIn(t, P.dock5, 0.3);
  check(c, TR.xs[0] + r + 30, yStop, 16, PAL.good, 5, okA); stage.text('막음', TR.xs[0] + r + 56, yStop, {role: 'display', size: 32, weight: 700, color: PAL.good, alpha: okA});
  cross(c, TR.xs[1] - r - 124, dockY, 13, PAL.bad, 5, noA); stage.text('통과', TR.xs[1] - r - 98, dockY, {role: 'display', size: 32, weight: 700, color: PAL.bad, alpha: noA});
  if (t > P.dock5) glow(c, TR.xs[1], TR.memY, 90, PAL.bad, 0.35 * Math.exp(-(t - P.dock5) / 0.8));
  tag(stage, '맞춘 한 형만 막음', 540, 1236, {size: 32, color: PAL.answer, a: fadeIn(t, P.dock5 + 0.3, 0.4), role: 'display', plate: false});
}

// ------------------------------------------------------------------ essence: the surface shape → a matching antibody; lock and block entry
const ESS = {vx: 540, vy: 590, vr: 150, yb: 1200, H: 150, X0: 540, HW: 300, top: 905};
const PX = x => ESS.X0 + x * ESS.HW;
const S0 = RV[CYCLE[1]].s;                                              // the antibody's starting (unmatched) shape in s06
function essenceScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const a6 = fadeOut(t, P.s07, 0.3) * sf, a7 = fadeIn(t, P.s07 + 0.3, 0.4) * sf;
  if (a6 > 0) withAlpha(c, a6, () => shapeToAntibody(stage, t, P));
  if (a7 > 0) withAlpha(c, a7, () => lanes(stage, t, P));
}
/** the antibody shape during s06: from an unrelated shape to the complement of K's loop */
export const abShape6 = (P, t) => { const q = easeInOut((t - P.morph6[0]) / (P.morph6[1] - P.morph6[0])); return S0.map((v, k) => lerp(v, RV[K].s[k], q)); };
function shapeToAntibody(stage, t, P) {
  const c = stage.ctx, T = stage.theme, vK = RV[K], grey = fadeIn(t, P.vacShow, 0.5);
  const rot = [0.5 + 0.1 * (t - 42), 0.3 + 0.16 * (t - 42), 0.15];
  // which front vertex is lowest on screen now (its loop is the one we magnify)
  const M = rotM(rot); let hv = 0, best = -1e9; ICO_V.forEach((v, i) => { const w = mulM(M, v); const sc = w[2] > 0.25 ? -w[1] + 0.3 * w[2] : -9; if (sc > best) { best = sc; hv = i; } });
  const hi = fadeIn(t, P.loopHi, 0.3) * fadeOut(t, P.copies[0], 0.4);
  glow(c, ESS.vx, ESS.vy, ESS.vr * 1.6, vK.col, 0.12);
  const V = drawIco(c, ESS.vx, ESS.vy, ESS.vr, vK.col, rot, {shape: vK.s, grey: grey > 0.5, keepLoops: true, hi, hiIdx: hv, shadowA: 0.3});
  const hvP = [ESS.vx + V[hv][0] * ESS.vr, ESS.vy - V[hv][1] * ESS.vr];
  tag(stage, '백신: 병은 못 일으키고 겉모양만 보여 줌', 540, 372, {size: 26, color: T.ink, a: grey, border: T.border});
  // magnified loop profile
  const pA = fadeIn(t, P.loopHi + 0.2, 0.4); if (pA <= 0) return;
  withAlpha(c, pA, () => {
    if (hi > 0) withAlpha(c, hi, () => line(c, [hvP, [ESS.X0 - 110, 830], [ESS.X0 - 110, 840]], rgba('#FFFFFF', 0.7), 2, {dash: [6, 6]}));
    panel(c, T, 140, 840, 800, 460, 0.9);
    stage.text('겉면의 고리 (확대 · 모식)', 160, 874, {size: 24, weight: 700, color: T.muted});
    loopProfile(c, vK.s, vK.col, 1);
    // the antibody tip (complement of its own shape) comes down; its shape morphs toward K's loop
    const abA = fadeIn(t, P.morph6[0], 0.35); if (abA <= 0) return;
    const sAb = abShape6(P, t), sep = 70 * (1 - easeInOut((t - P.morph6[0]) / (P.morph6[1] - P.morph6[0])));
    withAlpha(c, abA, () => abTip(stage, sAb, vK.s, sep, t - P.lock6));
    const f = fit(sAb, vK.s);
    stage.text(`맞물림 ${Math.round(100 * f)}%`, 920, 874, {role: 'display', size: 30, weight: 700, color: mix(T.muted, PAL.ab, f), align: 'right', alpha: abA});
  });
  // copies: the body keeps many of the same antibody (doubling count)
  const cq = clamp((t - P.copies[0]) / (P.copies[1] - P.copies[0])); if (cq <= 0) return;
  const n = Math.min(32, Math.floor(2 ** (cq * 5.2)));
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? 1 : -1, j = Math.floor(k / 2), x = 540 + side * (230 + (j % 4) * 50 + (Math.floor(j / 4) % 2) * 25), y = 430 + Math.floor(j / 4) * 52, pop = easeOut(clamp((t - P.copies[0] - Math.log2(k + 1) / 5.2 * (P.copies[1] - P.copies[0])) / 0.25));
    drawAb(c, x, y, 26 * pop, 0.2 * Math.sin(k * 1.7 + t), {a: pop});
  }
  tag(stage, '같은 항체를 많이 만들어 둠', 540, 800, {size: 26, color: PAL.ab, a: fadeIn(t, P.copies[0] + 0.2, 0.4), plate: true});
}
function loopProfile(c, s, col, a = 1, B = ESS) {
  const pts = []; for (let x = -1; x <= 1.0001; x += 0.02) pts.push([B.X0 + x * B.HW, B.yb - B.H * prof(s, x)]);
  const surf = [[B.X0 - B.HW - 40, B.yb], ...pts, [B.X0 + B.HW + 40, B.yb], [B.X0 + B.HW + 40, B.yb + (B.depth ?? 70)], [B.X0 - B.HW - 40, B.yb + (B.depth ?? 70)]];
  const gr = c.createLinearGradient(0, B.yb - B.H, 0, B.yb + 70); gr.addColorStop(0, mix(col, '#FFFFFF', 0.35)); gr.addColorStop(0.6, col); gr.addColorStop(1, mix(col, '#061016', 0.6));
  withAlpha(c, a, () => { poly(c, surf, gr, rgba('#04121A', 0.5), 2); line(c, pts, rgba(mix(col, '#FFFFFF', 0.6), 0.9), 2.5); });
}
/** antibody tip whose lower edge is the complement of sAb, pressed onto loop sJ (stops at first contact), sep px above */
function abTip(stage, sAb, sJ, sep, since, B = ESS) {
  const c = stage.ctx, d = contactGap(sAb, sJ), edge = [];
  for (let x = -1.03; x <= 1.0301; x += 0.02) edge.push([B.X0 + x * B.HW, B.yb - B.H * (prof(sAb, clamp(x, -1, 1)) + d) - sep]);
  const top = B.top - sep * 0.2, neck = B.neck ?? 0.42, yE = Math.min(...edge.map(p => p[1])), sh = [];
  for (let k = 0; k <= 12; k++) { const u = k / 12; sh.push([B.X0 + (B.HW + 6) * lerp(neck, 1, smooth(u)), lerp(top, yE - 6, u)]); }
  const body = [...sh.map(([x, y]) => [2 * B.X0 - x, y]).reverse(), ...sh, ...edge.slice().reverse()];
  const gr = c.createLinearGradient(0, top, 0, B.yb); gr.addColorStop(0, mix(PAL.ab, '#0A2A22', 0.35)); gr.addColorStop(1, PAL.ab);
  poly(c, body, gr, rgba('#04121A', 0.55), 2);
  // gap shading between tip and loop (what does not touch)
  if (d > 0.01 || sep > 1) { const gp = []; for (let x = -1; x <= 1.0001; x += 0.02) gp.push([B.X0 + x * B.HW, B.yb - B.H * prof(sJ, x)]); const ga = [...edge.filter(p => p[0] >= B.X0 - B.HW && p[0] <= B.X0 + B.HW), ...gp.reverse()]; poly(c, ga, rgba('#FF6A4D', 0.16)); }
  if (B.label !== false) stage.text('항체 끝', B.X0, top + 30, {size: 26, weight: 700, color: '#08251C', align: 'center'});
  if (since >= 0 && since < 0.8 && d < 0.01 && sep < 1) { const fl = 1 - since / 0.8; for (const p of edge) if (p[0] > B.X0 - B.HW && p[0] < B.X0 + B.HW) circle(c, p[0], p[1], 5, rgba('#FFFFFF', 0.55 * fl)); glow(c, B.X0, B.yb - B.H * 0.5, B.HW, PAL.ab, 0.3 * fl); }
}
// s07: two lanes — without antibodies the virus docks and enters; with them it cannot reach the receptor
function lanes(stage, t, P) {
  const c = stage.ctx, T = stage.theme, vK = RV[K], R = LANE.r;
  LANE.xs.forEach((x, L) => {
    const x0 = L ? 550 : 145, w = 385;
    panel(c, T, x0, 340, w, 960, 0.84);
    stage.text(L ? '항체 있음' : '항체 없음', x, 384, {role: 'display', size: 32, weight: 700, color: L ? PAL.ab : T.ink, align: 'center'});
    const fall = P.fallY(t), rot = [0.4 + 0.15 * t, 0.2 + 0.12 * t + L, 0.1];
    let vy = L ? P.fallR(t) : fall, dip = null, inA = 0;
    if (!L) { const e = easeInOut((t - P.enterL[0]) / (P.enterL[1] - P.enterL[0])); vy = lerp(fall, LANE.mem + 70, e); dip = {x, w: 90, d: 110 * e}; inA = e; }
    else if (t >= P.bump) { const u = t - P.bump; vy = LANE.blockY - 26 * Math.abs(Math.sin(u * 7.5)) * Math.exp(-u * 2.6); }
    membrane(c, x0 + 8, x0 + w - 8, LANE.mem, {th: 22, dip, depth: 140});
    receptor(c, x, LANE.mem + (dip ? dip.d : 0), LANE.rec);
    drawIco(c, x, vy, R, vK.col, rot, {shape: vK.s, shadowA: 0.25});
    if (inA > 0) clipRect(c, x0 + 8, LANE.mem + 14, w - 16, 140, 0, () => withAlpha(c, 0.55 * inA, () => { c.fillStyle = PAL.cellIn; c.fillRect(x0, LANE.mem, w, 160); }));
    if (L) {
      const PH = [Math.PI * 0.27, Math.PI * 0.5, Math.PI * 0.73], START = [[x0 + 40, 700, -0.6], [x0 + w - 40, 640, 0.7], [x0 + 60, 900, 0.3]];
      PH.forEach((phi, k) => {
        const u = easeInOut((t - (P.abLock[k] - 0.6)) / 0.6), [sx, sy, a0] = START[k], fx = sx + 8 * Math.sin(t * 1.4 + k), fy = sy + 8 * Math.cos(t * 1.2 + k);
        const bx = x + Math.cos(phi) * (R + LANE.ab * 0.78), by = vy + Math.sin(phi) * (R + LANE.ab * 0.78);
        if (u >= 1) boundAb(c, x, vy, R, phi, LANE.ab); else drawAb(c, lerp(fx, bx, u), lerp(fy, by, u), LANE.ab, lerp(a0, phi + Math.PI / 2, u), {a: fadeIn(t, P.s07 + 0.4, 0.4)});
        if (t >= P.abLock[k] && t < P.abLock[k] + 0.5) glow(c, bx, by, 44, PAL.ab, 0.55 * (1 - (t - P.abLock[k]) / 0.5));
      });
      if (t >= P.bump && t < P.bump + 0.6) glow(c, x, LANE.mem - LANE.rec, 70, PAL.bad, 0.4 * (1 - (t - P.bump) / 0.6));
    } else if (t >= P.dockL && t < P.dockL + 0.6) glow(c, x, LANE.mem - LANE.rec, 70, PAL.cell, 0.5 * (1 - (t - P.dockL) / 0.6));
    stage.text('수용체 (세포의 문)', x, LANE.mem + 50, {size: 24, weight: 500, color: PAL.cell, align: 'center', alpha: fadeIn(t, P.s07 + 0.6, 0.4) * (L ? 1 : 1 - inA)});
    const out = L ? fadeIn(t, P.cant, 0.3) : fadeIn(t, P.enterL[1] - 0.2, 0.3);
    if (out > 0) stage.text(L ? '들어가지 못함' : '세포 안으로 들어감', x, 660, {role: 'display', size: 32, weight: 700, color: L ? PAL.good : PAL.bad, align: 'center', alpha: out});
  });
  tag(stage, '열쇠처럼 맞물림', LANE.xs[1], 470, {size: 26, color: PAL.ab, a: fadeIn(t, P.abLock[2] + 0.1, 0.3) * fadeOut(t, P.bump + 0.8, 0.4), plate: false});
}

// ------------------------------------------------------------------ types: 200+ viruses → 169 rhinovirus types → one antibody fits one type → immunity
const B10 = {X0: 390, HW: 205, yb: 545, H: 96, top: 372, depth: 18, neck: 0.5, label: false};
function typesScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    if (t < P.grid[1] + 0.1) coldCrowd(stage, t, P);
    if (t >= P.grid[0] - 0.7) rhinoGrid(stage, t, P);
    if (t >= P.s09 && t < P.s10 + 0.3) withAlpha(c, fadeOut(t, P.s10, 0.3), () => rhinoInfo(stage, t, P));
    if (t >= P.s10 && t < P.s11 + 0.3) withAlpha(c, fadeIn(t, P.s10 + 0.3, 0.4) * fadeOut(t, P.s11, 0.3), () => probeTier(stage, t, P));
    if (t >= P.s11) withAlpha(c, fadeIn(t, P.s11 + 0.3, 0.4), () => immunityTier(stage, t, P));
    if (t >= P.lock10) readout(stage, t, P);
  });
}
function coldCrowd(stage, t, P) {
  const c = stage.ctx, T = stage.theme, b0 = P.crowd8[0], com = fadeIn(t, P.common, 0.5), gone = fadeIn(t, P.grid[0] - 0.6, 0.4);
  // one disease? — a single virus and the question
  const qA = fadeIn(t, P.single, 0.4) * fadeOut(t, b0 + 0.3, 0.4);
  if (qA > 0) withAlpha(c, qA, () => {
    stage.text('감기 = 병 하나?', 540, 520, {role: 'display', size: 56, weight: 700, color: T.ink, align: 'center'});
    strike(c, 540 - 118, 540 + 188, 520, clamp((t - P.notOne) / 0.35), PAL.bad, 6);
  });
  const v0 = COLD_SET[0], mq = easeInOut((t - b0) / 0.5);
  for (const v of COLD_SET) {
    const isRh = v.fam === 'rhino', tA = v === v0 ? -1 : P.cold8T(v.rank);
    if (v !== v0 && t < tA) continue;
    let a = v === v0 ? 1 : 1, x = v.x, y = v.y, sc = v === v0 ? 1 : easeOut(clamp((t - tA) / 0.22)) * (1 + 0.35 * Math.exp(-(t - tA) / 0.15));
    if (v === v0) { x = lerp(540, v.x, mq); y = lerp(710, v.y, mq); sc = lerp(70 / 13, 1, mq); }
    if (isRh) { if (t >= P.landT(v.rv) - 0.6) continue; }               // the rhino icons now belong to the grid
    else a *= lerp(1, 0.13, com) * (1 - gone);
    if (a <= 0.01 || sc <= 0.01) continue;
    withAlpha(c, a, () => { if (isRh) drawRvSprite(c, v.rv, x, y, 17, sc * 13 / 17); else { const sp = coldSprite(v.fam, 14, v.seed % 3); const S = sp.S * sc; c.drawImage(sp.cv, x - S / 2, y - S / 2, S, S); } });
  }
  // family labels
  const lA = fadeIn(t, P.crowd8[1] - 0.6, 0.4) * fadeOut(t, P.common, 0.4);
  if (lA > 0) withAlpha(c, lA, () => {
    stage.text('리노바이러스', 160, 448, {size: 26, weight: 700, color: '#FF9C7A'});
    for (const row of FAM_ROWS) stage.text(row.label || FAM[row.fams[0]].name, 700, row.y, {size: 24, weight: 700, color: FAM[row.fams[0]].col});
  });
  // counter → bundle
  const n = COLD_SET.filter(v => v === v0 || t >= P.cold8T(v.rank)).length, cA = fadeIn(t, b0, 0.3) * fadeOut(t, P.bundle[0], 0.3);
  if (cA > 0 && t < P.s09) withAlpha(c, cA, () => {
    stage.text(n > 200 ? '200가지 넘음' : `${n}가지`, 540, 1130, {role: 'display', size: 64, weight: 700, color: PAL.answer, align: 'center'});
    stage.text('감기를 일으키는 바이러스', 540, 1206, {size: 28, weight: 700, color: T.muted, align: 'center'});
  });
  const bq = easeOut((t - P.bundle[0]) / 0.6), bA = (t < P.s09 ? 1 : fadeOut(t, P.s09, 0.3));
  if (bq > 0 && bA > 0) withAlpha(c, bA, () => {
    rect(c, 146, 404, 788, 640, 18, null, rgba(PAL.answer, 0.85 * bq), 3);
    tag(stage, '200가지 넘음', 800, 404, {size: 26, color: PAL.answer, a: bq, border: PAL.answer});
    arrow(c, [540, 1046], [540, 1046 + 44 * bq], rgba(PAL.answer, 0.9 * bq), 4, {head: 16});
    withAlpha(c, fadeIn(t, P.bundle[0] + 0.25, 0.4), () => {
      panel(c, T, 160, 1102, 760, 196, 0.92);
      stage.text('감기 = 비슷한 증상의 묶음', 540, 1160, {role: 'display', size: 40, weight: 700, color: T.ink, align: 'center'});
      stage.text('콧물 · 재채기 · 목 아픔 · 기침', 540, 1236, {size: 30, weight: 500, color: T.muted, align: 'center'});
    });
  });
}
/** state of every grid cell at time t → {a (icon alpha), mark: 'x'|'ok'|'inf'|'shield'|null, glow} */
function cellLook(i, t, P) {
  let a = 1, mark = null, gl = 0, ring = 0;
  if (t >= P.lock10 && i === K) { mark = 'ok'; ring = 1; gl = Math.exp(-(t - P.lock10) / 0.6); }
  const pn = PROBES.indexOf(i);
  if (pn >= 0 && t >= P.probeT[pn]) { mark = 'x'; gl = 0; }
  if (t >= P.sweep[0]) { const ts = P.sweepT(i); if (t >= ts) { a = i === K ? 1 : lerp(1, 0.28 + 0.6 * FITS_K[i], clamp((t - ts) / 0.25)); if (i !== K && FITS_K[i] > 0.2) gl = Math.max(gl, 0.5 * FITS_K[i]); } else a = 1; }
  if (t >= P.s11 - 0.2) { a = Math.max(a, lerp(a, 0.7, fadeIn(t, P.s11, 0.4))); if (pn >= 0) mark = t < P.s11 + 0.3 ? 'x' : null; }
  if (i === K && t >= P.infect) { mark = t < P.immune ? 'inf' : 'shield'; gl = t < P.immune ? 0.6 : Math.exp(-(t - P.immune) / 0.8) * 0.8; }
  if (i === J11 && t >= P.other11) { mark = 'inf'; a = 1; gl = Math.exp(-(t - P.other11) / 1.2) * 0.7; }
  return {a, mark, gl, ring};
}
function rhinoGrid(stage, t, P) {
  const c = stage.ctx, T = stage.theme, G = GRID, cellA = fadeIn(t, P.grid[0] - 0.4, 0.5);
  if (cellA > 0) withAlpha(c, cellA, () => { for (let i = 0; i < N_RV; i++) { const [x, y] = cellXY(i); rect(c, x - G.cell / 2 + 2, y - G.cell / 2 + 2, G.cell - 4, G.cell - 4, 6, rgba(T.deep, 0.7), rgba(T.border, 0.9), 1); } });
  const cur = t >= P.cycle[0] && t < P.make10 + 0.2 ? cycleIdx(t, P) : -1;
  for (let i = 0; i < N_RV; i++) {
    const tl = P.landT(i), u = easeInOut((t - (tl - 0.6)) / 0.6); if (u <= 0) continue;
    const v = COLD_SET[i], [gx, gy] = cellXY(i), x = lerp(v.x, gx, u), y = lerp(v.y, gy, u) - 30 * Math.sin(Math.PI * u), L = cellLook(i, t, P);
    if (L.gl > 0.02) glow(c, gx, gy, 46, L.mark === 'inf' ? PAL.bad : PAL.ab, 0.6 * L.gl);
    withAlpha(c, L.a, () => drawRvSprite(c, i, x, y, 17, lerp(13 / 17, 1, u)));
    if (u >= 1) {
      if (L.mark === 'x') cross(c, gx, gy, 9, PAL.bad, 3.5);
      if (L.mark === 'ok' || L.ring) ring(c, gx, gy, 21, PAL.ab, 3);
      if (L.mark === 'inf') ring(c, gx, gy, 21, PAL.bad, 3);
      if (L.mark === 'shield') { ring(c, gx, gy, 21, PAL.ab, 4); ring(c, gx, gy, 27, rgba(PAL.ab, 0.5), 2); }
    }
  }
  if (cur >= 0) { const [x, y] = cellXY(cur); ring(c, x, y, 24, rgba('#FFFFFF', 0.95), 3); }
  if (t >= P.sweep[0] && t < P.sweep[1] + 0.1) { const i = Math.min(N_RV - 1, Math.floor((t - P.sweep[0]) / (P.sweep[1] - P.sweep[0]) * N_RV)), [x, y] = cellXY(i); rect(c, G.x0 - 4, y - G.cell / 2, G.cols * G.cell + 8, G.cell, 6, null, rgba('#FFFFFF', 0.5), 2); ring(c, x, y, 24, rgba('#FFFFFF', 0.9), 3); }
}
function rhinoInfo(stage, t, P) {
  const c = stage.ctx, T = stage.theme, n = Math.min(N_RV, Array.from({length: N_RV}, (_, i) => P.landT(i)).filter(x => t >= x).length);
  tag(stage, '가장 흔한 범인 · 감기의 30~50%', 540, 404, {size: 30, color: '#FF9C7A', a: fadeIn(t, P.common, 0.4) * fadeOut(t, P.rhinoCard - 0.3, 0.3), role: 'display', border: '#FF9C7A'});
  const rA = fadeIn(t, P.rhinoCard, 0.4);
  if (rA > 0) withAlpha(c, rA, () => {
    panel(c, T, 140, 336, 800, 224, 0.9);
    stage.text('rhino- = 코', 540, 400, {role: 'display', size: 54, weight: 700, color: T.ink, align: 'center'});
    stage.text('그리스어', 540, 452, {size: 26, weight: 700, color: T.muted, align: 'center'});
    stage.text('rhinoceros 코뿔소 = 코 + 뿔', 540, 512, {role: 'display', size: 32, weight: 700, color: PAL.answer, align: 'center', alpha: fadeIn(t, P.noseCard, 0.4)});
  });
  const gA = fadeIn(t, P.grid[0], 0.4);
  if (gA > 0) withAlpha(c, gA, () => {
    stage.text('리노바이러스의 형', 470, 1206, {size: 30, weight: 700, color: T.ink, align: 'right'});
    stage.text(`${n}가지`, 490, 1206, {role: 'display', size: 40, weight: 700, color: PAL.answer});
    let x = 300; for (const sp of RV_SPECIES) { const col = hsl(sp.hue, 0.74, 0.61); rect(c, x, 1252, 20, 20, 4, col); const s = `${sp.id} ${sp.n}`; stage.text(s, x + 28, 1262, {size: 26, weight: 700, color: col}); x += 40 + stage.measure(s, {size: 26, weight: 700}) + 18; }
    stage.text('(2021년 기준)', x, 1262, {size: 24, weight: 500, color: T.muted});
  });
}
const cycleIdx = (t, P) => { let k = 0; while (k + 1 < CYCLE.length && t >= P.cycT[k + 1] - 0.12) k++; return CYCLE[k]; };
/** shape on the top-tier profile at t (cycle, then K, then each probe), and the antibody press */
function probeState(t, P) {
  if (t < P.make10) { let k = 0; while (k + 1 < CYCLE.length && t >= P.cycT[k + 1] - 0.15) k++; const nx = Math.min(k + 1, CYCLE.length - 1), u = smooth((t - (P.cycT[nx] - 0.15)) / 0.15); return {j: CYCLE[k], s: RV[CYCLE[k]].s.map((v, q) => lerp(v, RV[CYCLE[nx]].s[q], k === nx ? 0 : u)), ab: 0, sep: 0}; }
  let j = K, s = RV[K].s, sep = 70 * (1 - easeInOut((t - (P.lock10 - 0.45)) / 0.45));
  for (let n = 0; n < PROBES.length; n++) {
    const tp = P.probeT[n]; if (t < tp - 0.16) break;
    const prev = n ? PROBES[n - 1] : K, u = smooth((t - (tp - 0.16)) / 0.1);
    j = u > 0.5 ? PROBES[n] : prev; s = RV[prev].s.map((v, q) => lerp(v, RV[PROBES[n]].s[q], u));
    sep = t < tp ? 26 * (1 - smooth((t - (tp - 0.08)) / 0.08)) * 1 + (t < tp - 0.08 ? 26 : 0) * 0 : 0;
  }
  if (t >= P.sweep[0]) { j = K; s = RV[K].s; sep = 0; }
  return {j, s, ab: fadeIn(t, P.make10, 0.3), sep};
}
function probeTier(stage, t, P) {
  const c = stage.ctx, T = stage.theme, st = probeState(t, P), v = RV[st.j];
  panel(c, T, 140, 336, 800, 236, 0.9);
  c.save(); c.beginPath(); c.rect(150, 340, 500, 228); c.clip();
  loopProfile(c, st.s, v.col, 1, B10);
  if (st.ab > 0) withAlpha(c, st.ab, () => abTip(stage, RV[K].s, st.s, st.sep, t - P.lock10, B10));
  c.restore();
  stage.text('형', 676, 400, {size: 26, weight: 700, color: T.muted});
  stage.text(v.name, 712, 400, {role: 'display', size: 40, weight: 700, color: v.col});
  if (st.ab > 0) {
    const f = fit(RV[K].s, RV[st.j].s), pressed = t >= P.lock10 && st.sep < 1;
    tag(stage, `${RV[K].name}에 맞춘 항체`, 790, 456, {size: 24, color: PAL.ab, a: st.ab, plate: false});
    if (pressed) {
      stage.text(`맞물림 ${Math.round(100 * f)}%`, 676, 516, {role: 'display', size: 30, weight: 700, color: f >= FIT_MIN ? PAL.ab : PAL.bad});
      if (f >= FIT_MIN) check(c, 900, 516, 13, PAL.ab, 4); else cross(c, 900, 516, 11, PAL.bad, 4);
    }
  } else tag(stage, '형마다 다른 겉모양', 790, 470, {size: 26, color: T.ink, plate: false});
  if (t >= P.sweep[0]) tag(stage, '169가지 모두에 대 보기', 790, 552, {size: 24, color: T.ink, a: fadeIn(t, P.sweep[0], 0.2) * fadeOut(t, P.sweep[1] + 0.4, 0.3), plate: false});
}
function readout(stage, t, P) {
  const c = stage.ctx, T = stage.theme, a = fadeIn(t, P.lock10, 0.35);
  const im = t >= P.s11;
  const x1 = t >= P.sweep[0] ? Array.from({length: N_RV}, (_, i) => i).filter(i => t >= P.sweepT(i) && FITS_K[i] >= FIT_MIN).length || 1 : 1;
  withAlpha(c, a * (im ? fadeOut(t, P.s11, 0.3) : 1), () => {
    stage.text('이 항체가 막는 형', 520, 1226, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'right'});
    stage.text(`${x1} / ${N_RV}`, 544, 1226, {role: 'display', size: 60, weight: 700, color: PAL.ab});
  });
  if (im) withAlpha(c, fadeIn(t, P.immune, 0.4), () => {
    stage.text('면역이 생긴 형', 520, 1226, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'right'});
    stage.text(`1 / ${N_RV}`, 544, 1226, {role: 'display', size: 60, weight: 700, color: PAL.ab});
  });
}
function immunityTier(stage, t, P) {
  const c = stage.ctx, T = stage.theme, vk = RV[K], vj = RV[J11];
  panel(c, T, 140, 336, 800, 236, 0.9);
  const rows = [{y: 400, v: vk, n: '1번째 감기', t0: P.infect, res: `${vk.name}에 면역 생김`, rt: P.immune, col: PAL.ab}, {y: 504, v: vj, n: '2번째 감기', t0: P.other11, res: '막지 못함 · 또 감기', rt: P.pass11, col: PAL.bad}];
  for (const r of rows) {
    const a = fadeIn(t, r.t0 - 0.2, 0.3); if (a <= 0) continue;
    withAlpha(c, a, () => {
      drawRvSprite(c, r.v.i, 196, r.y, 17, 1.25);
      stage.text(r.n, 236, r.y, {size: 28, weight: 700, color: T.ink});
      stage.text(`형 ${r.v.name}`, 384, r.y, {role: 'display', size: 30, weight: 700, color: r.v.col});
      const ra = fadeIn(t, r.rt, 0.3);
      if (ra > 0) { arrow(c, [500, r.y], [540, r.y], rgba(r.col, ra), 3, {head: 12}); stage.text(r.res, 556, r.y, {role: 'display', size: 30, weight: 700, color: r.col, alpha: ra}); }
    });
  }
}

// ------------------------------------------------------------------ nose: a cool nose (33 °C) vs the body (37 °C); growth; injected antibodies stay in the blood
// airway centre line (schematic sagittal section, facing left): nostril → nasal cavity → nasopharynx → throat
const AIR = (() => {
  const pts = [[232, 640], [300, 575], [380, 548], [480, 540], [580, 546], [660, 572], [708, 626], [722, 700], [722, 780], [718, 852]];
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return {pts, L, len: L[L.length - 1]};
})();
function airAt(u) {
  const d = clamp(u) * AIR.len; let i = 1; while (i < AIR.pts.length - 1 && AIR.L[i] < d) i++;
  const q = (d - AIR.L[i - 1]) / (AIR.L[i] - AIR.L[i - 1]), a = AIR.pts[i - 1], b = AIR.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  return {x: lerp(a[0], b[0], q), y: lerp(a[1], b[1], q), nx: -dy / l, ny: dx / l};
}
const AIR_W = 64;
/** viruses on the mucosa at sample k: count = ⌊N(t, T(u))/16⌋ (≤ 4), N doubles every Td(T) */
const MUC_SITES = (() => { const o = []; for (let k = 0; k < 15; k++) { const u = 0.04 + k / 14 * 0.92; o.push({u, side: k % 2 ? 1 : -1}); } return o; })();
export const sitesCount = (P, t) => MUC_SITES.map(m => (t < P.grow0 - 0.4 ? 0 : Math.min(4, 1 + Math.floor(P.nAt(t, airT(m.u)) / 16))));
function noseScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const a12 = fadeOut(t, P.s13, 0.35) * sf, a13 = fadeIn(t, P.s13 + 0.3, 0.45) * sf;
  if (a12 > 0) withAlpha(c, a12, () => { noseSection(stage, t, P); growthDishes(stage, t, P); });
  if (a13 > 0) withAlpha(c, a13, () => mucosaSection(stage, t, P));
}
function noseSection(stage, t, P) {
  const c = stage.ctx, T = stage.theme, sA = fadeIn(t, P.sect, 0.4);
  withAlpha(c, sA, () => {
    panel(c, T, 140, 336, 800, 528, 0.84);
    c.save(); c.beginPath(); c.roundRect(142, 338, 796, 524, 12); c.clip();
    // head tissue (schematic) with the profile on the left
    const tis = c.createLinearGradient(0, 340, 0, 860); tis.addColorStop(0, '#3A3036'); tis.addColorStop(1, '#2A2228');
    c.beginPath(); c.moveTo(318, 336); c.bezierCurveTo(300, 400, 300, 430, 286, 462); c.bezierCurveTo(250, 530, 200, 590, 188, 622); c.bezierCurveTo(184, 640, 200, 654, 236, 660);
    c.bezierCurveTo(246, 690, 236, 720, 250, 748); c.bezierCurveTo(262, 790, 250, 830, 262, 870); c.lineTo(940, 870); c.lineTo(940, 336); c.closePath(); c.fillStyle = tis; c.fill();
    c.strokeStyle = rgba('#C9B6A4', 0.55); c.lineWidth = 3; c.stroke();
    // palate between the nose and the mouth (schematic)
    line(c, [[262, 690], [610, 668], [680, 690]], rgba('#C9B6A4', 0.35), 6);
    // airway, coloured by the model temperature (cool → warm)
    const N = 40, mh = fadeIn(t, P.muc12, 0.3) * fadeOut(t, P.muc12 + 1.8, 0.5);
    if (mh > 0) for (let i = 0; i < N; i++) { const a = airAt(i / N), b = airAt((i + 1) / N); line(c, [[a.x, a.y], [b.x, b.y]], rgba('#FFC2C8', 0.55 * mh), AIR_W + 40, {cap: 'round'}); }
    for (const [w, colf] of [[AIR_W + 16, () => rgba('#E58F9A', 0.95)], [AIR_W, u => mix('#0B2633', '#2B1A16', clamp((airT(u) - 33) / 4))]]) {
      for (let i = 0; i < N; i++) { const a = airAt(i / N), b = airAt((i + 1) / N); line(c, [[a.x, a.y], [b.x, b.y]], colf((i + 0.5) / N), w, {cap: 'round'}); }
    }
    // turbinates (shelves in the nasal cavity)
    for (const [x, y, rx, ry] of [[430, 530, 64, 9], [500, 552, 78, 9]]) { c.beginPath(); c.ellipse(x, y, rx, ry, -0.03, 0, TAU); c.fillStyle = rgba('#5A4248', 0.85); c.fill(); c.strokeStyle = rgba('#E58F9A', 0.8); c.lineWidth = 3; c.stroke(); }
    // temperature tint inside the airway
    for (let i = 0; i < N; i++) { const a = airAt(i / N), b = airAt((i + 1) / N), T0 = airT((i + 0.5) / N); line(c, [[a.x, a.y], [b.x, b.y]], rgba(mix(PAL.cool, PAL.warm, clamp((T0 - 33) / 4)), 0.22), AIR_W - 18, {cap: 'butt'}); }
    // viruses on the mucosa, growing with the local doubling time
    const cnt = sitesCount(P, t);
    MUC_SITES.forEach((m, k) => {
      const p = airAt(m.u);
      for (let j = 0; j < cnt[k]; j++) { const off = (AIR_W / 2 - 6) * m.side, du = (j - 1.5) * 0.024; const q = airAt(m.u + du); drawRvSprite(c, (k * 13 + j * 7) % N_RV, q.x + q.nx * off, q.y + q.ny * off, 17, 0.85); }
      void p;
    });
    c.restore();
    stage.text('콧속', 380, 470, {size: 26, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.sect + 0.4, 0.4)});
    stage.text('목', 660, 800, {size: 26, weight: 700, color: T.ink, align: 'right', alpha: fadeIn(t, P.sect + 0.4, 0.4)});
    tag(stage, '점막 (코 · 목)', 610, 650, {size: 26, color: '#FFC2C8', a: fadeIn(t, P.muc12, 0.3), plate: true});
  });
  // thermometers: the nose one reads down to 33 °C
  const tq = easeInOut((t - P.therm[0]) / (P.therm[1] - P.therm[0])), tA = fadeIn(t, P.sect + 0.3, 0.4);
  withAlpha(c, tA, () => {
    thermo(stage, 186, 820, 120, lerp(37, T_NOSE, tq), {size: 28});
    thermo(stage, 890, 820, 120, T_CORE, {size: 28, right: false});
    stage.text('콧속 33~35 °C', 168, 380, {size: 26, weight: 700, color: PAL.cool, alpha: fadeIn(t, P.therm[1] - 0.2, 0.4)});
    stage.text('몸속 37 °C', 920, 380, {size: 26, weight: 700, color: PAL.warm, align: 'right', alpha: fadeIn(t, P.therm[1] - 0.2, 0.4)});
  });
}
const DISH = [{x: 330, T: 33, col: PAL.cool, n: '33 °C · 콧속 온도'}, {x: 750, T: 37, col: PAL.warm, n: '37 °C · 몸속 온도'}];
function growthDishes(stage, t, P) {
  const c = stage.ctx, T = stage.theme, a = fadeIn(t, P.therm[0], 0.4); if (a <= 0) return;
  withAlpha(c, a, () => {
    panel(c, T, 140, 884, 800, 416, 0.88);
    stage.text('세포 실험 · 실험실 결과', 160, 918, {size: 24, weight: 700, color: T.muted});
    stage.text('증식 속도는 모형', 920, 918, {size: 24, weight: 700, color: T.muted, align: 'right'});
    const ga = Math.PI * (3 - Math.sqrt(5));
    DISH.forEach((d, k) => {
      const n = P.nAt(t, d.T), cy = 1170, R = 116;
      stage.text(d.n, d.x, 968, {role: 'display', size: 30, weight: 700, color: d.col, align: 'center'});
      stage.text(`바이러스 × ${Math.floor(n)}`, d.x, 1018, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
      ring(c, d.x, cy, R + 6, rgba('#E8F4F8', 0.6), 3); circle(c, d.x, cy, R, rgba(d.col, 0.07));
      const m = Math.min(110, Math.floor(n));
      for (let i = 0; i < m; i++) { const rr = R * 0.9 * Math.sqrt((i + 0.5) / 110), th = i * ga; drawRvSprite(c, (i * 37 + k * 11) % N_RV, d.x + rr * Math.cos(th), cy + rr * Math.sin(th), 17, 0.5); }
      if (n > 1.01) glow(c, d.x, cy, R * 1.1, d.col, 0.06 + 0.1 * clamp(Math.log2(n) / 7));
    });
  });
}
// s13: the mucosa section — antibodies from an injection flow in the blood; few reach the surface
const MS = {air: 440, mucus: 470, cellTop: 488, cellBot: 640, vessel: [880, 990], x0: 150, x1: 930};
const SURF_V = [200, 268, 336, 404, 472, 540, 608, 676, 744, 812, 880].map((x, k) => ({x, rv: [K, 140, 57, 101, 3, 120, 88, 30, 150, 66, 12][k]}));
const BOUND = [2, 5, 8];                                                // the three surface viruses that meet an antibody (model 3)
function mucosaSection(stage, t, P) {
  const c = stage.ctx, T = stage.theme;
  panel(c, T, 140, 336, 800, 700, 0.88);
  c.save(); c.beginPath(); c.roundRect(142, 338, 796, 696, 12); c.clip();
  // layers
  c.fillStyle = '#0A2230'; c.fillRect(140, 338, 800, MS.air - 338);
  c.fillStyle = rgba(PAL.mucus, 0.28); c.fillRect(140, MS.air, 800, MS.cellTop - MS.air);
  const tis = c.createLinearGradient(0, MS.cellBot, 0, 1040); tis.addColorStop(0, '#3A2C30'); tis.addColorStop(1, '#2A2024'); c.fillStyle = tis; c.fillRect(140, MS.cellBot, 800, 400);
  for (let x = 140, k = 0; x < 940; x += 52, k++) {
    const att = SURF_V.findIndex(v => Math.abs(v.x - (x + 26)) < 26 && !BOUND.includes(SURF_V.indexOf(v)));
    const hit = att >= 0 && t >= P.attach ? Math.exp(-(t - P.attach - 0.1 * att) / 0.8) * (t >= P.attach + 0.1 * att ? 1 : 0) : 0;
    rect(c, x + 2, MS.cellTop, 48, MS.cellBot - MS.cellTop, 8, mix('#C98C8C', '#FF6A4D', hit * 0.7), rgba('#04121A', 0.5), 1.5);
    circle(c, x + 26, MS.cellTop + 98, 11, rgba('#5A2A33', 0.9));
    for (let j = 0; j < 5; j++) { const cx = x + 8 + j * 9, sw = 4 * Math.sin(t * 6 + j + k); line(c, [[cx, MS.cellTop], [cx + sw, MS.cellTop - 14]], rgba('#E8C8C8', 0.6), 1.6); }
  }
  // blood vessel and the antibody stream
  const [v0, v1] = MS.vessel, vg = c.createLinearGradient(0, v0, 0, v1); vg.addColorStop(0, '#7A2228'); vg.addColorStop(0.5, '#A8343A'); vg.addColorStop(1, '#6A1C22');
  rect(c, 130, v0, 820, v1 - v0, 0, vg); line(c, [[130, v0], [950, v0]], '#D8636A', 4); line(c, [[130, v1], [950, v1]], '#D8636A', 4);
  for (let k = 0; k < 14; k++) { const x = ((k * 61 + 40 * t) % 840) + 120, y = v0 + 18 + (k * 37) % (v1 - v0 - 36); c.beginPath(); c.ellipse(x, y, 12, 7, 0.3, 0, TAU); c.fillStyle = rgba('#E05058', 0.75); c.fill(); }
  const fl = 1, NAB = 26;
  for (let k = 0; k < NAB; k++) {
    const spawn = P.flow0 + k * 0.19; if (t < spawn) continue;
    const x = 214 + ((t - spawn) * 160) % 740, y = v0 + 26 + ((k * 53) % 58);
    drawAb(c, x, y, 26, 0.8 * Math.sin(k * 1.9 + t * 1.5), {a: fl});
  }
  // three antibodies leave the vessel and reach the surface
  BOUND.forEach((vi, k) => {
    const t0 = P.crossT[k] - 1.2, u = easeInOut((t - t0) / 1.2); if (u <= 0) return;
    const v = SURF_V[vi], x = lerp(v.x - 20, v.x, u), y = lerp(v0 + 30, MS.mucus - 4 + 34, u), ang = lerp(0.6, Math.PI, u);
    drawAb(c, x, y, 26, ang, {});
    if (t >= P.crossT[k] && t < P.crossT[k] + 0.5) glow(c, v.x, MS.mucus, 40, PAL.ab, 0.6 * (1 - (t - P.crossT[k]) / 0.5));
  });
  // surface viruses: unbound ones attach to cells at "부족할"
  SURF_V.forEach((v, k) => {
    const free = !BOUND.includes(k), dy = free && t >= P.attach + 0.1 * k ? 14 * easeOut((t - P.attach - 0.1 * k) / 0.4) : 0;
    drawIco(c, v.x, MS.mucus - 8 + dy, 22, RV[v.rv].col, [0.3 + k, 0.4 + 0.2 * t, 0.1], {shape: RV[v.rv].s, edge: false});
  });
  c.restore();
  // syringe into the vessel
  const sA = fadeIn(t, P.inject - 0.3, 0.3), push = clamp((t - P.inject) / 0.9);
  drawSyringe(c, 196, MS.vessel[0] - 40, 200, 0.42, {a: sA, fill: 0.8 * (1 - push), liquid: PAL.ab});
  // labels
  const lA = fadeIn(t, P.s13 + 0.5, 0.4);
  withAlpha(c, lA, () => {
    stage.text('콧속 공기', 160, 380, {size: 24, weight: 700, color: T.muted});
    stage.text('점막 겉면', 920, 380, {size: 26, weight: 700, color: '#FFC2C8', align: 'right'});
    stage.text('점막 세포', 920, 700, {size: 24, weight: 700, color: '#E8B8B8', align: 'right'});
    stage.text('핏줄', 920, 850, {size: 26, weight: 700, color: '#FF8A8F', align: 'right'});
  });
  tag(stage, '주사', 280, 830, {size: 26, color: T.ink, a: sA * fadeOut(t, P.flow0 + 1.5, 0.4), plate: false});
  // ratio readout (explanatory model)
  const rA = fadeIn(t, P.flow0 + 0.6, 0.4); if (rA <= 0) return;
  const nb = Math.round(MUC.blood * clamp((t - P.flow0) / 1.6)), ns = BOUND.filter((_, k) => t >= P.crossT[k]).length;
  withAlpha(c, rA, () => {
    panel(c, T, 140, 1060, 800, 240, 0.9);
    stage.text('항체의 양 (설명 모형)', 160, 1094, {size: 24, weight: 700, color: T.muted});
    const bx = 380, bw = 470;
    stage.text('핏속', 360, 1150, {role: 'display', size: 30, weight: 700, color: '#FF8A8F', align: 'right'});
    rect(c, bx, 1134, bw, 32, 6, rgba(T.deep, 0.8)); rect(c, bx, 1134, bw * nb / MUC.blood, 32, 6, PAL.ab);
    stage.text(`${nb}`, bx + bw + 14, 1150, {role: 'display', size: 30, weight: 700, color: T.ink});
    stage.text('점막 겉면', 360, 1236, {role: 'display', size: 30, weight: 700, color: '#FFC2C8', align: 'right'});
    rect(c, bx, 1220, bw, 32, 6, rgba(T.deep, 0.8)); if (ns) rect(c, bx, 1220, Math.max(6, bw * ns / MUC.blood), 32, 4, PAL.ab);
    stage.text(`${ns}`, bx + Math.max(6, bw * ns / MUC.blood) + 14, 1236, {role: 'display', size: 30, weight: 700, color: T.ink});
  });
  tag(stage, '막기에 부족할 수 있음', 540, 760, {size: 28, color: PAL.bad, a: fadeIn(t, P.attach + 0.4, 0.3), role: 'display', border: PAL.bad});
}

// ------------------------------------------------------------------ flu: three drifting flu types, a yearly update; then the cost–benefit balance
const RING = {x: 735, y: 528, r: 118};
export const fluHue = (k, yr) => FLU[k].hue + FLU[k].drift * yr;          // circulating type k after yr model years (drift = colour metaphor)
export const vacYear = (P, t) => P.febT.filter(x => t >= x).length;      // the vaccine copies the circulating types every February
function fluScene(stage, t, ctx) {
  const c = stage.ctx, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  const a14 = fadeOut(t, P.s15, 0.35) * sf, a15 = fadeIn(t, P.s15 + 0.3, 0.45) * sf;
  if (a14 > 0) withAlpha(c, a14, () => fluTypes(stage, t, P));
  if (a15 > 0) withAlpha(c, a15, () => balance(stage, t, P));
}
function fluVirus(c, x, y, r, col, rot) { drawEnv(c, x, y, r, col, rot, {head: 'mixed', len: 0.24, dirs: FIB(56)}); }
function fluTypes(stage, t, P) {
  const c = stage.ctx, T = stage.theme, yr = P.yearAt(t), vy = vacYear(P, t);
  const fA = fadeIn(t, P.flu, 0.4);
  withAlpha(c, fA, () => {
    glow(c, 300, 520, 200, PAL.flu, 0.12);
    fluVirus(c, 300, 520, 112, PAL.flu, [0.3 + 0.1 * t, 0.2 + 0.12 * t, 0.1]);
    stage.text('인플루엔자 바이러스', 300, 690, {role: 'display', size: 30, weight: 700, color: '#FF9C9C', align: 'center', alpha: fadeIn(t, P.inf, 0.35)});
    tag(stage, '감기와 다른 바이러스', 300, 738, {size: 26, color: T.ink, a: fadeIn(t, P.other14, 0.35), border: T.border});
  });
  // the yearly calendar ring: cursor from August; every February the vaccine copies the circulating colours
  const rA = fadeIn(t, P.ring[0] - 0.5, 0.4);
  if (rA > 0) withAlpha(c, rA, () => {
    const {x, y, r} = RING, ang = m => -Math.PI / 2 + m / 12 * TAU;   // m = months since August
    ring(c, x, y, r, rgba(T.muted, 0.5), 10);
    for (let m = 0; m < 12; m++) line(c, [[x + Math.cos(ang(m)) * (r - 12), y + Math.sin(ang(m)) * (r - 12)], [x + Math.cos(ang(m)) * (r + 8), y + Math.sin(ang(m)) * (r + 8)]], rgba(T.muted, 0.8), 2);
    const fe = ang(6); circle(c, x + Math.cos(fe) * r, y + Math.sin(fe) * r, 10, T.accent);
    const cm = 12 * (yr % 1 || (yr >= 2 ? 1 : 0)), ca = ang(cm);
    if (yr > 0) { ring(c, x, y, r, rgba(PAL.answer, 0.9), 10, ang(0), ang(0) + (yr >= 2 ? TAU : (yr % 1) * TAU)); circle(c, x + Math.cos(ca) * r, y + Math.sin(ca) * r, 12, '#FFFFFF'); }
    stage.text('2월 · WHO가 유행 형 선정', x - 10, y + r + 40, {size: 24, weight: 700, color: T.accent, align: 'center'});
    // vial with three slots (vaccine) in the middle of the ring
    drawVial(c, x, y + 8, 84, 120);
    FLU.forEach((f, k) => { const h = fluHue(k, vy); rect(c, x - 30, y - 38 + k * 34, 60, 26, 5, hsl(h, 0.65, 0.6)); });
    for (const tf of P.febT) if (t >= tf && t < tf + 0.6) glow(c, x, y, 120, PAL.answer, 0.4 * (1 - (t - tf) / 0.6));
    stage.text(vy ? `${vy}년째 백신` : '백신', x, y - r - 30, {role: 'display', size: 28, weight: 700, color: T.ink, align: 'center'});
  });
  // comparison: three flu types vs 169 rhinovirus types
  const cA = fadeIn(t, P.other14 + 0.3, 0.4);
  if (cA > 0) withAlpha(c, cA, () => {
    panel(c, T, 140, 790, 800, 510, 0.88);
    line(c, [[540, 820], [540, 1270]], rgba(T.border, 1), 2);
    stage.text('독감 · 유행하는 형', 340, 830, {role: 'display', size: 30, weight: 700, color: '#FF9C9C', align: 'center'});
    FLU.forEach((f, k) => {
      const cx = 220 + k * 120, q = easeOut(clamp((t - P.cells3[k]) / 0.3)), h = fluHue(k, yr);
      rect(c, cx - 50, 890, 100, 100, 12, rgba(T.deep, 0.8), rgba(T.border, 1), 1.5);
      if (q > 0) withAlpha(c, q, () => { fluVirus(c, cx, 940, 34 * q, hsl(h, 0.65, 0.6), [0.2 + k, 0.3 * t, 0.1]); });
      stage.text(f.n, cx, 1024, {size: 24, weight: 700, color: T.ink, align: 'center', alpha: q});
    });
    stage.text('3가지 안팎', 340, 1100, {role: 'display', size: 48, weight: 700, color: PAL.answer, align: 'center', alpha: fadeIn(t, P.cells3[2], 0.3)});
    stage.text('해마다 형이 조금씩 바뀜', 340, 1170, {size: 26, weight: 700, color: T.muted, align: 'center', alpha: fadeIn(t, P.ring[0], 0.4)});
    stage.text('색 변화 = 모식', 340, 1220, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: fadeIn(t, P.ring[0], 0.4)});
    const gA = fadeIn(t, P.cmp, 0.4);
    stage.text('감기 · 리노바이러스만', 740, 830, {role: 'display', size: 30, weight: 700, color: '#FF9C7A', align: 'center', alpha: 0.35 + 0.65 * gA});
    const MG = {cols: 13, cell: 20, x0: 740 - 130, y0: 868};
    withAlpha(c, gA, () => { for (let i = 0; i < N_RV; i++) { const [x, y] = cellXY(i, MG); drawRvSprite(c, i, x, y, 17, 0.46); } });
    stage.text('169가지', 740, 1186, {role: 'display', size: 48, weight: 700, color: PAL.answer, align: 'center', alpha: gA});
  });
}
function balance(stage, t, P) {
  const c = stage.ctx, T = stage.theme, th = P.beam(t), PX0 = 540, PY0 = 470, HL = 270, SL = 190;
  tag(stage, '비유 · 저울', 540, 372, {size: 24, color: T.muted, plate: false});
  // stand
  line(c, [[PX0, PY0], [PX0, 1000]], '#7F8F96', 10); rect(c, PX0 - 120, 996, 240, 18, 8, '#7F8F96');
  const ends = [-1, 1].map(sg => [PX0 + sg * HL * Math.cos(th), PY0 + sg * HL * Math.sin(th)]);
  line(c, ends, '#C9D3D8', 9); circle(c, PX0, PY0, 14, '#C9D3D8'); circle(c, PX0, PY0, 6, '#556167');
  ends.forEach(([ex, ey], k) => {
    const py = ey + SL;
    line(c, [[ex, ey], [ex - 100, py]], rgba('#C9D3D8', 0.7), 2); line(c, [[ex, ey], [ex + 100, py]], rgba('#C9D3D8', 0.7), 2);
    c.beginPath(); c.moveTo(ex - 115, py); c.quadraticCurveTo(ex, py + 46, ex + 115, py); c.closePath(); c.fillStyle = '#9AA8AE'; c.fill();
    if (k === 0) {                                                       // benefit: a few days of illness
      const q = easeOut(clamp((t - P.benefit + 0.35) / 0.35)), yy = lerp(py - 160, py - 26, q);
      if (t > P.benefit - 0.35) { rect(c, ex - 60, yy - 26, 120, 52, 8, '#D9B36A', rgba('#04121A', 0.5), 1.5); stage.text('며칠', ex, yy, {role: 'display', size: 28, weight: 700, color: '#2A1E08', align: 'center'}); }
    } else {                                                             // cost: 169 type components stacked
      const n = Array.from({length: N_RV}, (_, i) => P.stackT(i)).filter(x => t >= x).length;
      for (let i = 0; i < n; i++) { const col = i % 13, row = Math.floor(i / 13), x = ex - 84 + col * 13 + 6, y = py - 8 - row * 13; rect(c, x - 5.5, y - 5.5, 11, 11, 2, RV[i].col); }
    }
  });
  // fixed labels under the balance
  stage.text('막아서 얻는 것', 300, 1070, {role: 'display', size: 30, weight: 700, color: '#D9B36A', align: 'center', alpha: fadeIn(t, P.benefit, 0.35)});
  stage.text('며칠 앓고 저절로 낫는 병', 300, 1118, {size: 26, weight: 500, color: T.ink, align: 'center', alpha: fadeIn(t, P.benefit + 0.2, 0.35)});
  stage.text('치를 것', 780, 1070, {role: 'display', size: 30, weight: 700, color: PAL.answer, align: 'center', alpha: fadeIn(t, P.stack[0], 0.35)});
  stage.text('169가지를 다 담은 백신', 780, 1118, {size: 26, weight: 500, color: T.ink, align: 'center', alpha: fadeIn(t, P.stack[0] + 0.2, 0.35)});
  tag(stage, '개발 · 생산 비용', 780, 1186, {size: 28, color: T.ink, a: fadeIn(t, P.costTag, 0.3), border: PAL.answer});
  tag(stage, '드문 부작용 위험', 780, 1250, {size: 28, color: T.ink, a: fadeIn(t, P.riskTag, 0.3), border: PAL.bad});
}

// ------------------------------------------------------------------ try: 2016 — 50 types in one vaccine; two macaques 41/45 → 49/50; protection not tested
function monkeyIcon(c, x, y, s, col = '#A8998A', a = 1) {
  if (a <= 0) return;
  withAlpha(c, a, () => {
    c.save(); c.translate(x, y); c.scale(s / 200, s / 200);
    const dark = mix(col, '#0A1A20', 0.32), face = mix(col, '#E8B4A4', 0.45);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-58, 50); c.bezierCurveTo(-96, 58, -114, 26, -102, -6); c.strokeStyle = dark; c.lineWidth = 8; c.stroke();     // tail
    line(c, [[8, -26], [-2, 20], [-6, 64]], dark, 12);                                                      // far arm
    c.beginPath(); c.moveTo(20, -48); c.bezierCurveTo(-4, -56, -40, -44, -56, -8); c.bezierCurveTo(-68, 18, -66, 52, -44, 66);
    c.bezierCurveTo(-20, 74, 8, 64, 20, 46); c.bezierCurveTo(30, 24, 32, -10, 30, -30); c.closePath(); c.fillStyle = col; c.fill();   // torso
    line(c, [[-36, 42], [10, 26], [18, 66]], mix(col, dark, 0.4), 19); line(c, [[18, 66], [34, 68]], mix(col, dark, 0.4), 10);       // hind leg, foot
    line(c, [[22, -30], [38, 16], [46, 64]], col, 12); line(c, [[46, 64], [58, 66]], col, 8);                // near arm, hand
    circle(c, 36, -70, 22, col);                                                                            // head
    c.beginPath(); c.ellipse(58, -62, 14, 10, 0.2, 0, TAU); c.fillStyle = face; c.fill();                  // muzzle
    c.beginPath(); c.ellipse(46, -74, 10, 7, -0.2, 0, TAU); c.fillStyle = face; c.fill();                  // face
    circle(c, 47, -77, 2.6, '#1A1210');                                                                    // eye
    circle(c, 24, -78, 7, face);                                                                            // ear
    c.restore();
  });
}
const VIAL16 = {x: 735, y: 650, w: 210, h: 300};
const MON = [{x: 340, y: 1010}, {x: 740, y: 1010}];
function tryScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    withAlpha(c, fadeIn(t, P.card16, 0.4), () => {
      panel(c, T, 140, 336, 800, 112, 0.9);
      stage.text('2016 · 미국 Emory 대학 연구진', 540, 376, {role: 'display', size: 34, weight: 700, color: T.ink, align: 'center'});
      stage.text('Nature Communications · 붉은털원숭이 실험', 540, 420, {size: 24, weight: 500, color: T.muted, align: 'center'});
    });
    const a16 = fadeOut(t, P.s17, 0.35), a17 = fadeIn(t, P.s17 + 0.3, 0.4);
    if (a16 > 0) withAlpha(c, a16, () => vialFill(stage, t, P));
    if (a17 > 0) withAlpha(c, a17, () => responses(stage, t, P));
    // the two macaques (both sentences)
    const mA = fadeIn(t, P.monk, 0.4);
    MON.forEach((m, k) => {
      monkeyIcon(c, m.x, m.y, 210, '#A8998A', mA);
      const inj = clamp((t - P.inj16 + 0.4) / 0.9);
      if (inj > 0 && inj < 1) drawSyringe(c, m.x - 70, m.y - 20 + 10 * (1 - inj), 150, 0.5, {a: Math.sin(Math.PI * inj), fill: 0.7 * (1 - inj), liquid: '#C9B2FF'});
      if (t >= P.inj16 && t < P.inj16 + 0.7) glow(c, m.x - 30, m.y, 90, '#C9B2FF', 0.4 * (1 - (t - P.inj16) / 0.7));
    });
    stage.text('붉은털원숭이 두 마리', 540, 1176, {size: 26, weight: 700, color: T.muted, align: 'center', alpha: mA * fadeOut(t, P.question - 0.35, 0.3)});
    // the open question
    const sq = fadeIn(t, P.stamp, 0.3);
    if (sq > 0) withAlpha(c, sq, () => {
      const s = 1 + 0.18 * (1 - easeOut(clamp((t - P.stamp) / 0.3))), Y = 1222;
      rect(c, 540 - 330 * s, Y - 42 * s, 660 * s, 84 * s, 10, rgba(T.plate, 0.92), null); c.setLineDash([12, 8]); rect(c, 540 - 330 * s, Y - 42 * s, 660 * s, 84 * s, 10, null, PAL.answer, 3); c.setLineDash([]);
      stage.text('감기 예방 효과는 아직 미확인', 540, Y, {role: 'display', size: 40 * Math.min(s, 1.15), weight: 700, color: PAL.answer, align: 'center'});
    });
    tag(stage, '감기를 막는지?', 540, 1176, {size: 28, color: T.ink, a: fadeIn(t, P.question, 0.3) * fadeOut(t, P.stamp, 0.3), plate: false, role: 'display'});
  });
}
const MINI16 = {cols: 13, cell: 24, x0: 166, y0: 486};
function vialFill(stage, t, P) {
  const c = stage.ctx, T = stage.theme, V = VIAL16, n = STUDY_TYPES.filter((_, k) => t >= P.tokT(k)).length;
  stage.text('리노바이러스 169가지', 322, 470 + 0, {size: 24, weight: 700, color: T.muted, align: 'center', alpha: 0});
  for (let i = 0; i < N_RV; i++) { const [x, y] = cellXY(i, MINI16), k = STUDY_TYPES.indexOf(i), gone = k >= 0 && t >= P.tokT(k) - 0.5; drawRvSprite(c, i, x, y, 17, 0.5); if (k >= 0) ring(c, x, y, 11, rgba(PAL.answer, gone ? 0.25 : 0.7 * fadeIn(t, P.fill16[0] - 0.4, 0.3)), 1.6); }
  stage.text('리노바이러스 형', 322, 820, {size: 26, weight: 700, color: T.muted, align: 'center'});
  const cap = easeOut(clamp((t - P.cap) / 0.3));
  drawVial(c, V.x, V.y, V.w, V.h, {cap});
  STUDY_TYPES.forEach((i, k) => {
    const t0 = P.tokT(k) - 0.5, u = easeInOut((t - t0) / 0.5); if (u <= 0) return;
    const [sx, sy] = cellXY(i, MINI16), tx = V.x - V.w / 2 + 30 + (k % 5) * 37, ty = V.y - V.h / 2 + 22 + Math.floor(k / 5) * 28;
    drawRvSprite(c, i, lerp(sx, tx, u), lerp(sy, ty, u) - 60 * Math.sin(Math.PI * u), 17, lerp(0.5, 0.62, u));
  });
  stage.text(`${n} / 50가지`, V.x, V.y + V.h / 2 + 40, {role: 'display', size: 36, weight: 700, color: PAL.answer, align: 'center', alpha: fadeIn(t, P.fill16[0], 0.3)});
  stage.text('50가지 형을 한 번에 담은 백신', V.x, V.y + V.h / 2 + 84, {size: 24, weight: 700, color: T.ink, align: 'center', alpha: fadeIn(t, P.cap, 0.3)});
}
function responses(stage, t, P) {
  const c = stage.ctx, T = stage.theme, boostA = fadeIn(t, P.boost[0], 0.3);
  MON.forEach((m, k) => {
    const n = P.litN(k, t), lit = Math.floor(n + 1e-6), cx = m.x, G = {cols: 10, cell: 30, x0: cx - 150, y0: 548};
    stage.text(boostA > 0.5 ? '추가 접종 뒤' : '1차 접종 뒤', cx, 500, {size: 26, weight: 700, color: boostA > 0.5 ? PAL.ab : T.muted, align: 'center'});
    for (let j = 0; j < 50; j++) {
      const [x, y] = cellXY(j, G), on = STUDY_ORDER[k].indexOf(j) < lit;
      rect(c, x - 13, y - 13, 26, 26, 5, on ? rgba(PAL.ab, 0.9) : rgba(T.deep, 0.8), rgba(T.border, 1), 1);
      if (on) { const r = STUDY_ORDER[k].indexOf(j); if (t - (P.boost[0] + (r - STUDY.dose1[k]) / (STUDY.boost[k] - STUDY.dose1[k]) * (P.boost[1] - P.boost[0])) < 0.3 && r >= STUDY.dose1[k]) glow(c, x, y, 30, PAL.ab, 0.5); }
    }
    stage.text(`${lit}`, cx - 8, 760, {role: 'display', size: 56, weight: 700, color: PAL.ab, align: 'right'});
    stage.text('/ 50', cx + 4, 768, {role: 'display', size: 34, weight: 700, color: T.ink});
    stage.text('형에 대한 항체', cx, 812, {size: 24, weight: 700, color: T.muted, align: 'center'});
  });
  tag(stage, '실험실 결과 · 혈액 속 항체 측정', 540, 870, {size: 24, color: T.muted, a: fadeIn(t, P.dose1[1], 0.4), plate: false});
}

// ------------------------------------------------------------------ myth: antibiotics break a bacterial wall; a virus has no wall
const BAC = {x: 335, y: 830, L: 300, W: 128, ang: -0.32};
const ABX_TOK = [...Array(ABX.hits)].map((_, k) => ({u: (k * 0.37 + 0.11) % 1, side: k % 2 ? 1 : -1, sx: 170 + (k * 53) % 330, sy: 560 + (k * 41) % 60}));
const VIR18 = {x: 745, y: 830, r: 58};
function hexTok(c, x, y, s, a = 1) { if (a <= 0) return; withAlpha(c, a, () => { const pts = []; for (let k = 0; k < 6; k++) pts.push([x + Math.cos(k * TAU / 6 + 0.5) * s, y + Math.sin(k * TAU / 6 + 0.5) * s]); poly(c, pts, rgba(PAL.abx, 0.9), rgba('#04121A', 0.5), 1.2); line(c, [[x + s, y], [x + s * 1.7, y - s * 0.4]], rgba(PAL.abx, 0.9), 2.4); }); }
function wallPoint(u, side) {                                             // a point on the rod's wall: u along, side ±1
  const ca = Math.cos(BAC.ang), sa = Math.sin(BAC.ang), lx = lerp(-BAC.L / 2 + BAC.W / 2, BAC.L / 2 - BAC.W / 2, u), ly = side * BAC.W / 2;
  return [BAC.x + lx * ca - ly * sa, BAC.y + lx * sa + ly * ca, -side * sa, side * ca];
}
function mythScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = sceneFade(t, ctx);
  withAlpha(c, sf, () => {
    const qA = fadeIn(t, P.q18, 0.4), no = fadeIn(t, P.no18, 0.3);
    withAlpha(c, qA, () => {
      panel(c, T, 140, 336, 800, 136, 0.9);
      stage.text('감기에 항생제를 먹으면 빨리 나을까?', 540, 384, {role: 'display', size: 36, weight: 700, color: T.ink, align: 'center', alpha: 1 - 0.45 * no});
      cross(c, 450, 436, 13, PAL.bad, 5, no); stage.text('아닙니다', 476, 436, {role: 'display', size: 32, weight: 700, color: PAL.bad, alpha: no});
    });
    const pA = fadeIn(t, P.q18 + 0.8, 0.4); if (pA <= 0) return;
    withAlpha(c, pA, () => {
      panel(c, T, 140, 500, 390, 690, 0.86); panel(c, T, 550, 500, 390, 690, 0.86);
      stage.text('세균', 335, 546, {role: 'display', size: 34, weight: 700, color: PAL.bact, align: 'center'});
      stage.text('바이러스', 745, 546, {role: 'display', size: 34, weight: 700, color: RV[K].col, align: 'center'});
      bacterium(stage, t, P);
      virusSide(stage, t, P);
    });
    tag(stage, '항생제 = 세균용', 540, 1246, {size: 40, color: PAL.answer, a: fadeIn(t, P.noEffect + 0.2, 0.4), role: 'display', plate: false});
  });
}
function bacterium(stage, t, P) {
  const c = stage.ctx, T = stage.theme, hits = P.hitT.filter(x => t >= x).length, burst = t >= P.burst, bq = burst ? clamp((t - P.burst) / 1.2) : 0;
  const ca = Math.cos(BAC.ang), sa = Math.sin(BAC.ang);
  if (!burst) {
    c.save(); c.translate(BAC.x, BAC.y); c.rotate(BAC.ang);
    const cyto = c.createRadialGradient(-30, -20, 10, 0, 0, BAC.L / 2); cyto.addColorStop(0, '#CDE6B8'); cyto.addColorStop(1, '#6E9A5A');
    c.beginPath(); c.roundRect(-BAC.L / 2, -BAC.W / 2, BAC.L, BAC.W, BAC.W / 2); c.fillStyle = cyto; c.fill();
    c.strokeStyle = PAL.wall; c.lineWidth = 10; c.stroke();
    c.beginPath(); c.roundRect(-BAC.L / 2 + 9, -BAC.W / 2 + 9, BAC.L - 18, BAC.W - 18, BAC.W / 2 - 9); c.strokeStyle = rgba('#3E6A30', 0.8); c.lineWidth = 2; c.stroke();
    line(c, [[-70, 0], [-40, -14], [-10, 10], [20, -10], [50, 8], [70, -4]], rgba('#2E4E24', 0.6), 4);   // nucleoid (schematic)
    c.restore();
    // cracks where antibiotics hit
    for (let k = 0; k < hits; k++) { const tk = ABX_TOK[k], [wx, wy, nx, ny] = wallPoint(tk.u, tk.side); line(c, [[wx - nx * 8 - ny * 4, wy - ny * 8 + nx * 4], [wx + nx * 6 + ny * 8, wy + ny * 6 - nx * 8]], '#2A1A10', 5); circle(c, wx, wy, 7, rgba('#2A1A10', 0.85)); }
  } else {
    // burst: wall fragments fly apart, contents spill (fade)
    const R = rng(77);
    for (let k = 0; k < 14; k++) { const a = R() * TAU, d = 30 + 120 * easeOut(bq), x = BAC.x + Math.cos(a) * (40 + d) * 0.9, y = BAC.y + Math.sin(a) * (24 + d * 0.8); withAlpha(c, 1 - 0.6 * bq, () => { c.save(); c.translate(x, y); c.rotate(a + bq * 2); c.beginPath(); c.arc(0, 0, 26, -0.5, 0.5); c.strokeStyle = PAL.wall; c.lineWidth = 7; c.stroke(); c.restore(); }); }
    for (let k = 0; k < 40; k++) { const a = R() * TAU, d = R() * 150 * easeOut(bq); circle(c, BAC.x + Math.cos(a) * d, BAC.y + Math.sin(a) * d * 0.8, 4 + 3 * R(), rgba('#8DBA70', 0.8 * (1 - bq))); }
    if (t - P.burst < 0.5) glow(c, BAC.x, BAC.y, 160, '#E8FFD0', 0.45 * (1 - (t - P.burst) / 0.5));
    stage.text('세포벽이 깨져 터짐', 335, 1120, {role: 'display', size: 28, weight: 700, color: PAL.bact, align: 'center', alpha: fadeIn(t, P.burst + 0.2, 0.3)});
  }
  // antibiotic tokens travel to their wall points
  ABX_TOK.forEach((tk, k) => {
    const th = P.hitT[k], t0 = th - 0.55, u = easeIn(clamp((t - t0) / 0.55)); if (t < P.abx0) return;
    const [wx, wy, nx, ny] = wallPoint(tk.u, tk.side);
    const x0 = wx + nx * 150 + 30 * Math.sin(k), y0 = wy + ny * 150;
    const drift = t < t0 ? [6 * Math.sin(t * 2 + k), 6 * Math.cos(t * 1.7 + k)] : [0, 0];
    if (t < th) hexTok(c, lerp(x0, wx + nx * 14, u) + drift[0], lerp(y0, wy + ny * 14, u) + drift[1], 15);
    else if (t < th + 0.25) hexTok(c, wx + nx * 14, wy + ny * 14, 15, 1 - (t - th) / 0.25);
  });
  stage.text('세포벽', 196, 690, {size: 26, weight: 700, color: PAL.wall, alpha: fadeOut(t, P.hitT[0], 0.3)});
  stage.text('항생제', 335, 1050, {size: 26, weight: 700, color: PAL.abx, align: 'center', alpha: fadeIn(t, P.abx0, 0.3) * fadeOut(t, P.burst, 0.3)});
}
function virusSide(stage, t, P) {
  const c = stage.ctx, T = stage.theme, v = RV[K], vA = fadeIn(t, P.vir18 - 0.8, 0.4);
  drawIco(c, VIR18.x, VIR18.y, VIR18.r, v.col, [0.3 + 0.15 * t, 0.5 + 0.1 * t, 0.1], {shape: v.s, shadowA: 0.2});
  stage.text('세포벽 없음', VIR18.x, 1050, {size: 26, weight: 700, color: T.ink, align: 'center', alpha: vA});
  stage.text('크기는 세균보다 훨씬 작음', VIR18.x, 1150, {size: 24, weight: 500, color: T.muted, align: 'center', alpha: vA});
  // tokens drift past: nothing to grab
  for (let k = 0; k < 6; k++) {
    const t0 = P.vir18 + k * 0.12, u = (t - t0) / 2.2; if (u <= 0) continue;
    const y = 640 + k * 70, x = lerp(580, 920, clamp(u)) + 0, dy = 26 * Math.sin(u * 5 + k);
    const near = Math.hypot(x - VIR18.x, y + dy - VIR18.y);
    hexTok(c, x, y + dy + (near < VIR18.r + 34 ? Math.sign(y - VIR18.y || 1) * (VIR18.r + 34 - near) : 0), 15, (1 - smooth((u - 0.85) / 0.15)) * fadeIn(t, t0, 0.2));
  }
  const nq = fadeIn(t, P.noEffect, 0.3);
  cross(c, 652, 1100, 12, PAL.bad, 5, nq); stage.text('효과 없음', 678, 1100, {role: 'display', size: 30, weight: 700, color: PAL.bad, alpha: nq});
}

// ------------------------------------------------------------------ close: hand washing; hands → nose and eyes; the poster returns
const HAND = {x: 330, y: 820, s: 1.35};
const HAND_PTS = (() => {
  const cv = createCanvas(1080, 1920), cc = cv.getContext('2d'), R = rng(4545), out = [];
  handPath(cc, HAND.x, HAND.y, HAND.s);
  const inside = (x, y) => [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]].every(([dx, dy]) => cc.isPointInPath(x + dx, y + dy));
  for (let tries = 0; out.length < WASH.n && tries < 20000; tries++) { const x = 200 + R() * 260, y = 620 + R() * 360; if (inside(x, y) && out.every(p => Math.hypot(p[0] - x, p[1] - y) > 24)) out.push([x, y]); }
  return out;
})();
function handPath(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath();
  c.moveTo(-70, 150); c.lineTo(-74, 40);
  c.bezierCurveTo(-100, 10, -130, -30, -118, -48); c.bezierCurveTo(-106, -62, -86, -40, -70, -18);   // thumb
  c.lineTo(-70, -96); c.bezierCurveTo(-70, -116, -44, -116, -44, -96); c.lineTo(-42, -40);          // index
  c.lineTo(-38, -130); c.bezierCurveTo(-38, -150, -10, -150, -10, -130); c.lineTo(-8, -40);          // middle
  c.lineTo(-4, -120); c.bezierCurveTo(-4, -140, 24, -140, 24, -120); c.lineTo(24, -38);              // ring
  c.lineTo(30, -92); c.bezierCurveTo(30, -110, 54, -110, 54, -92); c.lineTo(56, 10);                 // little
  c.bezierCurveTo(58, 60, 50, 100, 44, 150); c.closePath();
  c.restore();
}
function closeScene(stage, t, ctx) {
  const c = stage.ctx, T = stage.theme, P = plan(ctx.tl), sf = fadeIn(t, ctx.scene.start, 0.25), fin = fadeIn(t, P.reason - 0.2, 0.6), out = 1 - fadeIn(t, P.reason - 0.3, 0.4);
  if (out > 0) withAlpha(c, sf * out, () => washing(stage, t, P));
  if (fin > 0) {
    const pulse = v => { const k = (v.x + v.y * 0.4) / 1500, tp = lerp(P.cPulse[0], P.cPulse[1], clamp(k)); return t >= tp ? Math.exp(-(t - tp) / 0.5) : 0; };
    crowdLayer(stage, t, fin, {t0: P.reason, pulse});
    withAlpha(c, fin, () => { const g2 = c.createLinearGradient(0, 1330, 0, 1640); g2.addColorStop(0, 'rgba(0,8,13,0)'); g2.addColorStop(0.35, 'rgba(0,8,13,0.62)'); g2.addColorStop(0.7, 'rgba(0,8,13,0.62)'); g2.addColorStop(1, 'rgba(0,8,13,0)'); c.fillStyle = g2; c.fillRect(0, 1330, 1080, 310); });
    posterSyringe(stage, fin);
    posterTitle(stage, t, 0, fin);
  }
}
function washing(stage, t, P) {
  const c = stage.ctx, T = stage.theme, wq = clamp((t - P.water[0]) / 0.3) * (1 - clamp((t - P.water[1]) / 0.4));
  // faucet and water
  rect(c, 230, 360, 150, 34, 10, '#A9B6BC'); rect(c, 330, 376, 34, 70, 8, '#A9B6BC'); rect(c, 300, 352, 30, 18, 4, '#7F8F96');
  if (wq > 0) {
    const gr = c.createLinearGradient(0, 446, 0, 1180); gr.addColorStop(0, rgba(PAL.water, 0.8 * wq)); gr.addColorStop(1, rgba(PAL.water, 0.15 * wq));
    c.fillStyle = gr; c.fillRect(334, 446, 26, 300);
    for (let k = 0; k < 18; k++) { const ph = (t * 1.6 + k * 0.137) % 1, x = 300 + (k * 37) % 90, y = 760 + ph * 380; circle(c, x, y, 4, rgba(PAL.water, 0.6 * wq * (1 - ph))); }
  }
  // the hand with viruses; each is rinsed off at its model time and falls away
  c.save(); handPath(c, HAND.x, HAND.y, HAND.s); const hg = c.createLinearGradient(0, 600, 0, 1020); hg.addColorStop(0, '#D8C6B4'); hg.addColorStop(1, '#B9A592');
  c.fillStyle = hg; c.fill(); c.strokeStyle = rgba('#5E4A3C', 0.8); c.lineWidth = 3; c.stroke(); c.restore();
  if (wq > 0) withAlpha(c, 0.35 * wq, () => { c.save(); handPath(c, HAND.x, HAND.y, HAND.s); c.clip(); c.fillStyle = PAL.water; c.fillRect(HAND.x - 30, 600, 70, 440); c.restore(); });
  const left = P.washT.filter(x => t < x).length;
  WASH_SET.forEach((w, i) => {
    const [hx, hy] = HAND_PTS[i % HAND_PTS.length], tw = P.washT[i], fall = t > tw ? t - tw : 0;
    if (fall > 1.2) return;
    const x = hx + 30 * fall * (w.u - 0.5), y = hy + 420 * fall * fall + 60 * fall;
    withAlpha(c, 1 - fall / 1.2, () => coldVirus(c, w.kind, x, y, 13, [w.rot, 0.4, 0.2], {rv: w.rv}));
  });
  stage.text('손', HAND.x, 1070, {role: 'display', size: 30, weight: 700, color: T.ink, align: 'center'});
  // remaining (model) bar
  const bA = fadeIn(t, P.water[0] - 0.4, 0.4);
  withAlpha(c, bA, () => {
    stage.text('손에 남은 바이러스 (모형)', 160, 1176, {size: 24, weight: 700, color: T.muted});
    rect(c, 160, 1206, 360, 26, 6, rgba(T.deep, 0.8)); rect(c, 160, 1206, 360 * left / WASH.n, 26, 6, PAL.answer);
    stage.text(`${left}`, 540, 1220, {role: 'display', size: 30, weight: 700, color: T.ink});
  });
  // hands → nose and eyes, then "don't touch"
  const rA = fadeIn(t, P.route, 0.4);
  if (rA > 0) withAlpha(c, rA, () => {
    panel(c, T, 600, 480, 340, 520, 0.86);
    noseIcon(c, 800, 600, 120, '#E8D2C0'); stage.text('코', 880, 640, {role: 'display', size: 30, weight: 700, color: T.ink});
    c.save(); c.translate(790, 820); c.beginPath(); c.moveTo(-50, 0); c.quadraticCurveTo(0, -36, 50, 0); c.quadraticCurveTo(0, 36, -50, 0); c.strokeStyle = '#E8D2C0'; c.lineWidth = 5; c.stroke(); circle(c, 0, 0, 14, '#7FB2C8'); circle(c, 0, 0, 6, '#10222C'); c.restore();
    stage.text('눈', 880, 820, {role: 'display', size: 30, weight: 700, color: T.ink});
    const fq = clamp((t - P.route) / 0.8);
    for (const [ty, k] of [[640, 0], [820, 1]]) {
      const pts = curve([470, 640], [700, ty], k ? -40 : 40, 24), m = Math.max(2, Math.floor(pts.length * fq));
      line(c, pts.slice(0, m), rgba(PAL.answer, 0.85), 4, {dash: [10, 8]});
      const tip = pts[m - 1]; if (fq < 1) coldVirus(c, 'rhino', tip[0], tip[1], 11, [t, 0.4, 0.2], {rv: K});
      const nq = fadeIn(t, P.noTouch + k * 0.12, 0.3);
      if (nq > 0) { circle(c, pts[12][0], pts[12][1], 26, rgba(T.plate, 0.9 * nq)); cross(c, pts[12][0], pts[12][1], 13, PAL.bad, 5, nq); }
    }
    stage.text('손에 묻은 바이러스가', 770, 920, {size: 24, weight: 700, color: T.muted, align: 'center'});
    stage.text('코 · 눈으로 옮겨 감', 770, 956, {size: 24, weight: 700, color: T.muted, align: 'center'});
  });
}

// =====================================================================================================
// --emit-sound: write the model-driven sound events into sound.json
// Mappings (kept wherever they recur):
//  - Antibody fits (fit ≥ 0.5): a low "딸깍" = short 247 Hz tick + 110/165 Hz chord. Misfit: a dull "툭" = 70 Hz knock + low noise.
//    The same two sounds for the 1960s trial, the s07 lanes, the s10 probes, the s11 infections and the mucosa.
//  - Shape matching in s06: antibody-to-loop fit (0 → 1) → pitch 98 · 2^fit Hz.
//  - Counting fills (200+ viruses, 169 cells, 169 vials, 50 tokens): one tiny tick per 10 / 13 / 13 / 5 items.
//  - Virus growth (s12): pitch 80 + 36·log2(N) Hz, one tone per temperature (33 °C rises faster than 37 °C).
//  - 2016 study: antibody count n / 50 → pitch 110·2^(n/50) (monkey 1) and a fifth above (monkey 2).
//  - Balance beam angle → pitch 98·2^(θ/0.2). Water → low band noise. Bacterium burst → soft low pop; the virus side stays silent.
//  Everything stays below 700 Hz (lowBandOnly). No panning (mono-safe).
// =====================================================================================================
export const fitHz = f => 98 * 2 ** clamp(f);
export const growHz = n => 80 + 36 * Math.log2(Math.max(1, n));
export const studyHz = (n, m) => 110 * 2 ** (n / 50) * (m ? 1.5 : 1);
export const beamHz = th => 98 * 2 ** clamp(th / 0.2, -0.5, 1);
export function soundEvents(tl) {
  const P = plan(tl), r = (x, d = 3) => +x.toFixed(d), ev = [];
  const squeeze = Q => Q.filter((q, i) => i === 0 || i === Q.length - 1 || q.slice(1).some((v, k) => Math.abs(v - Q[i - 1][k + 1]) > 1e-4 || Math.abs(v - Q[i + 1][k + 1]) > 1e-4));
  const env = (tt, t0, t1, fi, fo) => smooth((tt - t0) / fi) * (1 - smooth((tt - (t1 - fo)) / fo));
  const table = (t0, t1, f, amp, dt = 0.03, fi = 0.25, fo = 0.35) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += dt) Q.push([r(tt - t0), r(f(tt), 2), r(clamp(amp(tt) * env(tt, t0, t1, fi, fo)), 4)]); Q[Q.length - 1][2] = 0; return squeeze(Q); };
  const chirp = (id, t0, t1, f, amp, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'chirp', params: {gain_db: gain, harmonics: o.h || [1, 0.3], fade: 0.03, points: table(t0, t1, f, amp, o.dt, o.fi, o.fo)}, means});
  const envNoise = (id, t0, t1, amp, lo, hi, gain, means, o = {}) => { const Q = []; for (let tt = t0; tt <= t1 + 1e-6; tt += o.dt ?? 0.04) Q.push([r(tt - t0), r(clamp(amp(tt) * env(tt, t0, t1, o.fi ?? 0.2, o.fo ?? 0.4)), 4)]); Q[Q.length - 1][1] = 0; ev.push({id, at: r(t0, 4), kind: 'env_noise', params: {low: lo, high: hi, gain_db: gain, fade: 0.05, points: squeeze(Q)}, means}); };
  const tick = (id, t0, freq, gain, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'tick', params: {freq, decay: o.decay ?? 0.1, gain_db: gain, click: 0}, means});
  const ticks = (id, times, freq, gain, means, o = {}) => ev.push({id, at: r(times[0], 4), kind: 'custom', params: {gain_db: gain, layers: times.map((tt, k) => ({kind: 'tick', offset: r(tt - times[0], 4), params: {freq: Array.isArray(freq) ? freq[k] : freq, decay: o.decay ?? 0.1, click: 0, gain_db: o.gains ? o.gains[k] : 0}}))}, means});
  const swell = (id, t0, freqs, means, o = {}) => ev.push({id, at: r(t0, 4), kind: 'swell', params: {freqs, dur: o.dur ?? 1.6, attack: o.attack ?? 0.4, gain_db: o.gain ?? -32}, means});
  const whoosh = (id, t0, dur, f0, f1, means, gain = -33) => ev.push({id, at: r(t0, 4), kind: 'whoosh', params: {dur: r(dur), f_start: f0, f_end: f1, q: 1.6, gain_db: gain}, means});
  const thump = (id, t0, means, gain = -29, f = 58) => ev.push({id, at: r(t0, 4), kind: 'custom', params: {gain_db: gain, layers: [{kind: 'tone', offset: 0, params: {freq: f, dur: 0.6, harmonics: [1, 0.35], attack: 0.006, decay: 0.2, release: 0.2, gain_db: 0}}, {kind: 'noise', offset: 0, params: {dur: 0.3, low: 40, high: 220, release: 0.22, gain_db: -9}}]}, means});
  // 딸깍 (fit) and 툭 (misfit): the same two sounds everywhere
  const clickL = off => [{kind: 'tick', offset: r(off, 4), params: {freq: 247, decay: 0.035, click: 0, gain_db: 0}}, {kind: 'tone', offset: r(off, 4), params: {freq: 110, dur: 0.55, harmonics: [1, 0.3], attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.22, gain_db: -7}}, {kind: 'tone', offset: r(off, 4), params: {freq: 165, dur: 0.55, harmonics: [1, 0.2], attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.22, gain_db: -9}}];
  const tapL = off => [{kind: 'tone', offset: r(off, 4), params: {freq: 70, dur: 0.2, harmonics: [1, 0.5], attack: 0.003, decay: 0.05, sustain: 0, release: 0.08, gain_db: 0}}, {kind: 'noise', offset: r(off, 4), params: {dur: 0.09, low: 40, high: 200, attack: 0.002, release: 0.07, gain_db: -8}}];
  const fitClick = (id, times, means, gain = -29) => { const T0 = [].concat(times); ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => clickL(tt - T0[0]))}, means}); };
  const misfit = (id, times, means, gain = -27) => { const T0 = [].concat(times); ev.push({id, at: r(T0[0], 4), kind: 'custom', params: {gain_db: gain, layers: T0.flatMap(tt => tapL(tt - T0[0]))}, means}); };
  const every = (times, n) => times.filter((_, i) => (i + 1) % n === 0);

  // hook
  whoosh('syringe_glide', P.glide[0], P.glide[1] - P.glide[0], 90, 220, '포스터의 주사기가 "독감 예방 주사" 칸으로 옮겨 감');
  ev[ev.length - 1].model = {sig: modelSignature(tl)};
  tick('flu_ok', P.fluOk, 147, -31, '독감 예방 주사 "있음"', {decay: 0.16});
  tick('cold_card', P.coldCard, 131, -33, '"감기 예방 주사" 칸 (점선 주사기)', {decay: 0.12});
  tick('why_mark', P.why, 165, -33, '"?" 표시', {decay: 0.14});
  misfit('colds', P.coldT.flat().sort((a, b) => a - b), `예시 두 해: 커서가 감기에 걸린 달을 지날 때마다 툭 (${P.coldT.map(x => x.length).join(' · ')}번)`, -30);
  misfit('none', P.none, '"아직 없음"', -29);
  // origin
  tick('hanja', P.hanja + 0.7, 147, -32, '感 · 氣 두 글자가 맞붙음', {decay: 0.14});
  tick('korea', P.korea, 131, -33, '"우리나라에서 만든 한자말"', {decay: 0.12});
  ticks('ko_bul', [P.ko, P.bul], [110, 131], -32, '"고 = 코", "블 = 불" 차례로', {decay: 0.12});
  tick('gotbul', P.merge[1], 165, -31, '고 + ㅅ + 블 → "곳블"로 합쳐짐', {decay: 0.1});
  swell('goppul', P.goppul, [110, 165], '"고뿔"', {dur: 1.3});
  tick('vaccine_word', P.vac, 147, -33, '"vaccine"', {decay: 0.12});
  tick('cow', P.cow, 98, -32, '소 그림', {decay: 0.18});
  whoosh('vacca', P.vacca[0], P.vacca[1] - P.vacca[0], 110, 260, 'vacca의 글자 v-a-c-c가 vaccine으로 올라감');
  tick('jenner', P.jenner, 147, -33, '"1796 · 제너" 카드', {decay: 0.12});
  whoosh('cowpox', P.pox[0], P.pox[1] - P.pox[0], 120, 240, '우두 입자가 소에서 사람에게로 옮겨 감');
  fitClick('smallpox_block', P.shield, '천연두 입자가 방패에 막힘 (막음 = 딸깍)');
  tick('trial_card', P.trial, 147, -33, '"1960~70년대 시험" 표식', {decay: 0.12});
  tick('vial5', P.vial5, 131, -33, 'RV13 백신 병', {decay: 0.12});
  fitClick('lock5', P.lock5, `RV13에 맞춘 항체가 RV13에 맞물림 (맞물림 ${fit(RV[TRIAL.vac].s, RV[TRIAL.vac].s).toFixed(2)} → 딸깍)`);
  misfit('tap5', P.tap5, `같은 항체가 다른 형(${RV[TRIAL.other].name})에 닿았다가 튕겨 나감 (맞물림 ${fit(RV[TRIAL.vac].s, RV[TRIAL.other].s).toFixed(3)} → 툭)`);
  thump('dock5', P.dock5, '다른 형이 세포의 수용체에 붙음 (통과)', -30, 62);
  // essence
  tick('loop_hi', P.loopHi, 165, -33, '겉면의 고리 하나를 표시', {decay: 0.12});
  tick('vac_show', P.vacShow, 131, -33, '"백신: 겉모양만 보여 줌" (바이러스가 회색으로)', {decay: 0.14});
  chirp('fit6', P.morph6[0], P.lock6, tt => fitHz(fit(abShape6(P, tt), RV[K].s)), () => 0.32, -32, `항체 끝 모양이 고리에 맞아 갈수록 음이 올라감: 맞물림 ${Math.round(100 * fit(S0, RV[K].s))}% → 100% = ${fitHz(fit(S0, RV[K].s)).toFixed(0)} → ${fitHz(1).toFixed(0)} Hz (화면의 "맞물림" 값과 같은 fit)`, {fi: 0.2, fo: 0.05, h: [1, 0.25]});
  fitClick('lock6', P.lock6, '항체 끝이 고리에 꼭 맞물림 (맞물림 100% → 딸깍)');
  ticks('copies', [0, 1, 2, 3, 4, 5].map(m => P.copies[0] + m / 5.2 * (P.copies[1] - P.copies[0])), [110, 123, 139, 147, 165, 185], -34, '같은 항체가 1 → 2 → 4 → … → 32개로 늘어날 때마다', {decay: 0.08});
  fitClick('lock7', P.abLock, '오른쪽 칸: 항체 셋이 바이러스 겉면에 차례로 맞물림 (딸깍 ×3)', -30);
  thump('dock7', P.dockL, '왼쪽 칸(항체 없음): 바이러스가 수용체에 붙음', -30, 62);
  whoosh('enter7', P.enterL[0], P.enterL[1] - P.enterL[0], 200, 70, '왼쪽 칸: 바이러스가 세포 안으로 들어감', -32);
  misfit('bump7', P.bump, '오른쪽 칸: 항체로 덮인 바이러스가 수용체에 닿지 못하고 튕김 (툭)');
  // types
  tick('strike8', P.notOne, 131, -32, '"병 하나?"에 줄', {decay: 0.12});
  const bloomT = COLD_SET.filter(v => v !== COLD_SET[0]).map(v => P.cold8T(v.rank)).sort((a, b) => a - b);
  ticks('bloom', every(bloomT, 10), 175, -36, `감기 바이러스 ${N_COLD}가지가 화면을 채움: 10개 나타날 때마다 작은 틱`, {decay: 0.04});
  swell('bundle', P.bundle[0], [110, 165, 220], '"감기 = 비슷한 증상의 묶음" 상자', {dur: 1.5});
  tick('common', P.common, 147, -33, '"가장 흔한 범인 · 리노바이러스"', {decay: 0.12});
  ticks('grid_fill', [...Array(13)].map((_, k) => P.landT(13 * k + 12)), 196, -35, '리노바이러스 아이콘이 169칸에 내려앉음: 한 줄(13칸)이 찰 때마다 작은 틱', {decay: 0.05});
  tick('rhino_card', P.rhinoCard, 147, -33, '"rhino- = 코" 카드', {decay: 0.12});
  tick('nose_card', P.noseCard, 131, -33, '"rhinoceros 코뿔소 = 코 + 뿔"', {decay: 0.12});
  ticks('cycle', P.cycT, 131, -35, '형마다 다른 겉면 고리 (모양이 바뀔 때마다)', {decay: 0.06});
  fitClick('lock10', P.lock10, `${RV[K].name} 항체가 ${RV[K].name}에 맞물림 (딸깍) → "이 항체가 막는 형 1 / 169"`);
  misfit('probes', P.probeT, `같은 항체를 다른 형 ${PROBES.map(i => RV[i].name).join(' · ')}에 대 봄 → 모두 툭 (맞물림 ${PROBES.map(i => (100 * FITS_K[i]).toFixed(0) + '%').join(' · ')})`);
  ticks('sweep', [...Array(13)].map((_, k) => P.sweepT(13 * k)), 147, -36, '169가지 모두에 대 보기: 한 줄씩 훑을 때마다 작은 틱', {decay: 0.04});
  fitClick('sweep_hit', P.sweepT(K), `훑는 중 맞는 형은 ${RV[K].name} 하나뿐 (딸깍)`, -31);
  swell('one_of_169', P.sweep[1] + 0.05, [98, 147], `"1 / ${N_RV}"`, {dur: 1.4, gain: -33});
  misfit('infect', P.infect, `1번째 감기: ${RV[K].name}에 걸림 (툭)`);
  fitClick('immune', P.immune, `${RV[K].name}에 대한 면역 생김 (딸깍 · 방패)`);
  misfit('other11', P.other11, `2번째 감기: 다른 형 ${RV[J11].name} — 면역이 맞지 않음 (툭)`);
  thump('pass11', P.pass11, '"막지 못함 · 또 감기"', -31, 62);
  // nose
  whoosh('therm', P.therm[0], P.therm[1] - P.therm[0], 180, 100, '콧속 온도계가 37 → 33 °C로 내려감', -34);
  chirp('grow33', P.grow0, P.grow1 + 0.3, tt => growHz(P.nAt(tt, 33)), () => 0.34, -33, `33 °C(콧속) 바이러스 수 → 음높이 80 + 36·log2(N) Hz: N 1 → ${Math.floor(P.nAt(P.grow1, 33))} (${growHz(1).toFixed(0)} → ${growHz(P.nAt(P.grow1, 33)).toFixed(0)} Hz) — 배가 시간 ${TD33} s (모형)`, {fi: 0.2, fo: 0.3, h: [1, 0.3]});
  chirp('grow37', P.grow0, P.grow1 + 0.3, tt => growHz(P.nAt(tt, 37)), () => 0.3, -34, `37 °C(몸속) 같은 대응: N 1 → ${Math.floor(P.nAt(P.grow1, 37))} (${growHz(1).toFixed(0)} → ${growHz(P.nAt(P.grow1, 37)).toFixed(0)} Hz) — 배가 시간 ${TD37} s (모형), 더 천천히 올라감`, {fi: 0.2, fo: 0.3, h: [1, 0.3]});
  tick('mucosa', P.muc12, 131, -33, '"점막 (코 · 목)" 표시', {decay: 0.12});
  whoosh('inject', P.inject, 0.9, 80, 200, '주사기가 핏줄에 항체를 넣음', -33);
  envNoise('blood_flow', P.flow0, tl.scene('nose').end - 0.15, tt => 0.25 + 0.45 * clamp((tt - P.flow0) / (26 * 0.19)), 50, 260, -36, '핏줄 속 항체의 흐름: 흐르는 항체 수(26개까지 늘어남) → 낮은 잡음 크기', {fi: 0.3, fo: 0.4});
  fitClick('surface_ab', P.crossT, `점막 겉면까지 온 항체 ${MUC.surface}개가 바이러스에 맞물림 (딸깍 ×3)`, -31);
  misfit('attach', SURF_V.map((_, k) => k).filter(k => !BOUND.includes(k)).map(k => P.attach + 0.1 * k), `항체가 닿지 않은 바이러스 ${SURF_V.length - BOUND.length}개가 세포에 붙음 (툭 ×${SURF_V.length - BOUND.length})`, -31);
  // flu
  tick('flu_in', P.flu, 131, -33, '인플루엔자 바이러스', {decay: 0.14});
  ticks('flu3', P.cells3, [131, 147, 165], -32, '독감 유행 형 세 칸 A(H1N1) · A(H3N2) · B', {decay: 0.12});
  tick('cmp169', P.cmp, 110, -33, '감기(리노바이러스) 169칸', {decay: 0.14});
  ev.push({id: 'feb_update', at: r(P.febT[0], 4), kind: 'custom', params: {gain_db: -31, layers: P.febT.flatMap(tt => clickL(tt - P.febT[0]))}, means: '해마다 2월: 백신이 그해 유행 형의 색으로 바뀜 (딸깍 ×2, 모형 두 해)'});
  thump('benefit', P.benefit, '"며칠" 추가 왼쪽 접시에 놓임', -31, 70);
  ticks('stack', [...Array(13)].map((_, k) => P.stackT(13 * k + 12)), 175, -35, '오른쪽 접시에 169가지가 쌓임: 13개마다 작은 틱', {decay: 0.05});
  chirp('beam', P.s15 + 0.4, tl.scene('flu').end - 0.3, tt => beamHz(P.beam(tt)), () => 0.28, -34, `저울 기울기 θ → 음높이 98·2^(θ/0.2) Hz: 비용 쪽으로 기울수록 높아짐 (끝 ${(P.beam(tl.scene('flu').end) * 180 / Math.PI).toFixed(1)}°)`, {fi: 0.4, fo: 0.4, h: [1, 0.25]});
  thump('settle', P.settle, '저울이 비용 쪽으로 기운 채 멈춤', -32, 62);
  ticks('cost_risk', [P.costTag, P.riskTag], [131, 110], -33, '"개발 · 생산 비용", "드문 부작용 위험"', {decay: 0.12});
  // try
  tick('card16', P.card16, 147, -33, '"2016 · 미국 Emory 대학 연구진" 카드', {decay: 0.12});
  ticks('tokens', every(STUDY_TYPES.map((_, k) => P.tokT(k)), 5), [...Array(10)].map((_, k) => 110 * 2 ** (k / 10)), -34, '50가지 형이 백신 병에 담김: 5개마다 틱 (담긴 수만큼 음이 올라감)', {decay: 0.06});
  fitClick('cap', P.cap, '병뚜껑이 닫힘 = 50가 백신', -32);
  tick('monkeys', P.monk, 98, -33, '붉은털원숭이 두 마리', {decay: 0.16});
  whoosh('inj16', P.inj16 - 0.4, 0.9, 90, 200, '두 원숭이에게 백신 접종', -33);
  [0, 1].forEach(m => chirp(`ab_monkey${m + 1}`, P.dose1[0], P.boost[1] + 0.5, tt => studyHz(P.litN(m, tt), m), () => 0.3, -34, `원숭이 ${m + 1}: 항체가 생긴 형 수 n → 음높이 ${m ? '165' : '110'}·2^(n/50) Hz, 1차 ${STUDY.dose1[m]} → 추가 접종 ${STUDY.boost[m]} / 50`, {fi: 0.15, fo: 0.4, h: [1, 0.25]}));
  tick('boost', P.boost[0], 147, -33, '"추가 접종 뒤"', {decay: 0.12});
  misfit('unconfirmed', P.stamp, '"감기 예방 효과는 아직 미확인" 표식 (툭)', -29);
  // myth
  misfit('no18', P.no18, '"아닙니다"', -29);
  ticks('abx_hits', P.hitT.slice(0, ABX.burstAt), 131, -33, `항생제 알갱이가 세균의 세포벽에 부딪힘 (${ABX.burstAt}번, 금이 늘어남)`, {decay: 0.06});
  thump('burst', P.burst, '세포벽이 깨져 세균이 터짐 (부드러운 낮은 펑)', -28, 55);
  ev.push({id: 'virus_silent', at: r(P.vir18 + 0.6, 4), kind: 'silent', means: '바이러스 쪽: 항생제가 붙을 세포벽이 없어 아무 일도 일어나지 않음 (소리 없음)'});
  misfit('no_effect', P.noEffect, '"효과 없음"', -30);
  // close
  const washed = P.washT.slice().sort((a, b) => a - b);
  envNoise('water', P.water[0], P.water[1] + 0.4, tt => (tt < P.water[1] ? 1 : 0.3) * (0.45 + 0.4 * clamp(washed.filter(x => x > tt - 0.3 && x <= tt).length / 6)), 55, 250, -32, '물줄기 (55~250 Hz 낮은 잡음): 크기 = 물 + 0.3초 동안 씻겨 나간 바이러스 수', {fi: 0.25, fo: 0.4, dt: 0.03});
  whoosh('route', P.route, 0.8, 110, 240, '손 → 코 · 눈으로 가는 길', -34);
  misfit('no_touch', [P.noTouch, P.noTouch + 0.12], '"만지지 않기" ✕ 두 개', -30);
  swell('poster', P.reason, [110, 165, 220], '"까닭은" — 포스터와 제목이 돌아옴', {dur: 1.8});
  return lowBandOnly(ev, modelSignature(tl));
}
/**
 * User decision (2026-11-03): no effects in the high band. Every tonal fundamental stays below HIGH_CUT; harmonics at or
 * above it are dropped; tick partials (f, 2.01f) must stay below it (click off); noise bands and whoosh bands end below
 * it (noise tops ≤ 360 Hz, whoosh band tops ≤ 520 Hz, because the band-pass skirts fall only 12 dB/octave); swell overtones (2f)
 * are kept below it by construction (frequencies < HIGH_CUT/2). Events that would break this throw.
 */
const HIGH_CUT = 700, NOISE_TOP = 360;
function lowBandOnly(ev, sig) {
  const check = (e, p, kind) => {
    if (kind === 'chirp') {
      const f = Math.max(...p.points.map(q => q[1])); if (f >= HIGH_CUT) throw new Error(`${e.id}: chirp ${f} Hz`);
      p.harmonics = (p.harmonics || [1]).filter((a, k) => k === 0 || f * (k + 1) < HIGH_CUT);
    } else if (kind === 'tick') { if (p.freq * 2.01 >= HIGH_CUT) throw new Error(`${e.id}: tick ${p.freq} Hz`); p.click = 0; }
    else if (kind === 'tone') { const h = p.harmonics || [1, 0.2]; if (p.freq >= HIGH_CUT) throw new Error(`${e.id}: tone`); p.harmonics = h.filter((a, k) => k === 0 || p.freq * (k + 1) < HIGH_CUT); p.wave = 'sine'; }
    else if (kind === 'whoosh') { const q = p.q ?? 2; if (Math.max(p.f_start, p.f_end) * (1 + 1 / q) > NOISE_TOP + 160) throw new Error(`${e.id}: whoosh band`); }
    else if (kind === 'env_noise' || kind === 'noise') { if ((p.high ?? 1500) > NOISE_TOP) throw new Error(`${e.id}: noise band`); }
    else if (kind === 'swell') { if (Math.max(...p.freqs) * 2 >= HIGH_CUT) throw new Error(`${e.id}: swell overtone`); p.cutoff = HIGH_CUT; }
    else if (kind === 'custom') for (const L of p.layers) check(e, L.params, L.kind);
  };
  for (const e of ev) { if (!e.means) throw new Error(`${e.id}: missing "means"`); if (e.kind !== 'silent') check(e, e.params || {}, e.kind); }
  for (const e of ev) if (e.model && e.model.sig !== sig) e.model = {sig};
  const ids = new Set(); for (const e of ev) { if (ids.has(e.id)) throw new Error(`duplicate event id ${e.id}`); ids.add(e.id); }
  return ev;
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--emit-sound')) {
  const root = path.resolve(HERE, '../..');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const tl = loadTimeline(arg('--timeline', path.join(root, 'outputs', path.basename(HERE), 'narration/timeline.json')));
  const soundFile = arg('--sound', path.join(HERE, 'sound.json')), old = fs.existsSync(soundFile) ? JSON.parse(fs.readFileSync(soundFile, 'utf8')) : {};
  const sound = {
    version: 1,
    notes: '설명용 합성음입니다(녹음 아님). 배경음악·배경음 없음. 모든 사건은 `node episodes/cold-vaccine/scenes.mjs --emit-sound`가 scenes.mjs의 같은 모형과 시간 계획(형마다의 겉모양 벡터와 맞물림 fit, 감기 바이러스 202개의 등장 순서, 169칸 격자, 온도별 배가 시간, 주사 항체의 핏속 100 : 점막 겉면 3, 독감 형의 색 변화와 2월 갱신, 저울의 감쇠 진동, 2016년 원숭이 두 마리의 41·45 → 49 / 50, 항생제 충돌과 세균 파열, 손 씻기의 지수 제거 시각)에서 써 넣습니다. 대응: 맞물림(fit ≥ 0.5) → 낮은 "딸깍"(247 Hz 틱 + 110·165 Hz 화음), 안 맞음 → 둔한 "툭"(70 Hz), 세는 것 → 작은 틱(10·13·5개마다), 증식 → 음높이 80 + 36·log2(N) Hz, 항체 수 → 110·2^(n/50) Hz, 저울 기울기 → 음높이, 물 → 낮은 잡음, 세균 파열 → 낮은 펑, 바이러스 쪽 → 무음. 모든 음은 700 Hz 아래. 타임라인이 바뀌면 다시 실행하세요. 패닝 없음(모노 안전).',
    events: soundEvents(tl),
    ambient: {...(old.ambient || {kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]}), enabled: false},
    music: {...(old.music || {id: 'zabriskie_patriarch', under_db: 12, duck_db: 6, start_sec: 0}), enabled: false, note: '음악 없음.'},
  };
  const txt = JSON.stringify(sound, null, 2)
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2, $3]')
    .replace(/\[\n\s+([-\d.e]+),\n\s+([-\d.e]+)\n\s+\]/g, '[$1, $2]');
  fs.writeFileSync(soundFile, txt + '\n');
  const P = plan(tl);
  console.log(`events: ${sound.events.length}; K = ${RV[K].name} blocks ${BLOCK_K}/${N_RV} (nearest ${Math.max(...FITS_K.filter((_, i) => i !== K)).toFixed(3)}); probes ${PROBES.map(i => RV[i].name).join(' ')}`);
  console.log(`colds ${P.coldT.flat().map(x => x.toFixed(2)).join(' ')}; lock6 ${P.lock6.toFixed(2)}; bump ${P.bump.toFixed(2)}; N(33) ${P.nAt(P.grow1, 33).toFixed(1)} N(37) ${P.nAt(P.grow1, 37).toFixed(1)}; settle ${P.settle.toFixed(2)}; burst ${P.burst.toFixed(2)}`);
}
