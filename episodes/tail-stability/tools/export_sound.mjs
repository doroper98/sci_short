// 66 꼬리날개 — 모형에서 소리 표를 뽑아 sound_gen.json 을 쓴다(PLAN 6절).
//   node episodes/tail-stability/tools/export_sound.mjs [--timeline F]   →   node episodes/tail-stability/tools/merge_sound.mjs
// 1) 조각 sound_a/b/c.json(있는 것만, sound_gen.json 은 빼고)으로 tl.events(...) 를 만든다(render.mjs 와 같은 방식).
// 2) 세 모듈(있는 것만)의 rateSegs(tl, ev) 를 모아 장면마다 바람 하나 gen_wind_<scene>(env_noise, 진폭 = 그 장면의 rate 표).
// 3) 모듈의 genSound(tl, ev) 가 돌려준 사건(각도를 따르는 음 등)을 그대로 더한다.
// 대본·시각·모형이 바뀌면 다시 돌린다. 다른 모듈이 없거나 genSound 가 없어도 돈다.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath, pathToFileURL} from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SCISHORT_ROOT || path.resolve(HERE, '../..');
const argv = process.argv, ai = argv.indexOf('--timeline');
const tlFile = ai > 0 ? path.resolve(argv[ai + 1]) : path.join(ROOT, 'outputs/tail-stability/narration/timeline.json');
const R = await import(pathToFileURL(path.join(ROOT, 'pipeline/render/index.mjs')));
const tl = R.loadTimeline(tlFile);

// 1) 사건
const spec = [];
for (const f of ['sound_a.json', 'sound_b.json', 'sound_c.json']) {
  const p = path.join(HERE, f);
  if (!fs.existsSync(p)) continue;
  try { spec.push(...(JSON.parse(fs.readFileSync(p, 'utf8')).events || [])); }
  catch (e) { console.warn(`[export_sound] ${f} 를 읽지 못해 건너뜁니다: ${e.message}`); }
}
const ev = tl.events(spec);

// 2) 모듈
const mods = [];
for (const f of ['scenes_a.mjs', 'scenes_b.mjs', 'scenes_c.mjs']) {
  const p = path.join(HERE, f);
  if (!fs.existsSync(p)) continue;
  try { mods.push({f, m: await import(pathToFileURL(p))}); }
  catch (e) { console.warn(`[export_sound] ${f} 를 읽지 못해 건너뜁니다: ${e.message}`); }
}
const segs = [];
for (const {f, m} of mods) {
  if (!m.rateSegs) continue;
  try { segs.push(...m.rateSegs(tl, ev)); } catch (e) { console.warn(`[export_sound] ${f} rateSegs 실패, 건너뜁니다: ${e.message}`); }
}
segs.sort((a, b) => a.t0 - b.t0);
for (let i = 1; i < segs.length; i++) if (segs[i].t0 < segs[i - 1].t1 - 1e-6) throw new Error(`rateSegs 구간이 겹칩니다: ${JSON.stringify(segs[i - 1])} / ${JSON.stringify(segs[i])}`);
const rateAt = t => { for (const s of segs) if (t >= s.t0 && t < s.t1) return s.rate; return 1; };

// 바람의 진폭: |rate| 1 → 0.5, 1/3 → 0.3, 1/8 → 0.18, 0(멈춤) → 0.04, 되감기(음수) → 0.5. 사이 값은 선형으로.
const AMP = [[0, 0.04], [1 / 8, 0.18], [1 / 3, 0.3], [1, 0.5]];
function windAmp(rate) {
  if (rate < 0) return 0.5;
  if (rate >= 1) return 0.5;
  for (let i = 1; i < AMP.length; i++) if (rate <= AMP[i][0]) { const [r0, a0] = AMP[i - 1], [r1, a1] = AMP[i]; return a0 + (a1 - a0) * (rate - r0) / (r1 - r0); }
  return 0.5;
}
const RAMP = 0.15, r3 = x => +x.toFixed(3);
const out = [];
for (const sc of tl.scenes) {
  const s0 = sc.start, s1 = sc.end;
  const cuts = [...new Set(segs.flatMap(s => [s.t0, s.t1]).filter(x => x > s0 && x < s1))].sort((a, b) => a - b);
  const pts = [[0, windAmp(rateAt(s0))]];
  for (const b of cuts) {
    const a0 = windAmp(rateAt(b - 1e-6)), a1 = windAmp(rateAt(b));
    if (Math.abs(a0 - a1) < 1e-6) continue;
    const tb = b - s0, prev = pts[pts.length - 1][0];
    pts.push([Math.max(prev, tb), a0], [Math.max(prev, tb) + RAMP, a1]);
  }
  pts.push([Math.max(pts[pts.length - 1][0], s1 - s0), windAmp(rateAt(s1 - 1e-6))]);
  out.push({id: `gen_wind_${sc.id}`, at: r3(s0), kind: 'env_noise',
    params: {points: pts.map(([a, b]) => [r3(a), r3(b)]), low: 120, high: 600, gain_db: -30},
    means: `바람(${sc.id}) — 진폭은 그 장면의 모형 시계(rate)를 따른다: 실시간 0.5, 8배 느리게 0.18, 3배 느리게 0.3, 멈춤 0.04`});
}

// 3) 모듈이 뽑는 사건
for (const {f, m} of mods) {
  if (!m.genSound) continue;
  try { const g = m.genSound(tl, ev) || []; out.push(...g); console.log(`[export_sound] ${f}: genSound 사건 ${g.length}개`); }
  catch (e) { console.warn(`[export_sound] ${f} genSound 실패, 건너뜁니다: ${e.message}`); }
}
const ids = new Set();
for (const e of out) { if (ids.has(e.id)) throw new Error(`같은 id ${e.id}`); ids.add(e.id); }
const file = path.join(HERE, 'sound_gen.json');
fs.writeFileSync(file, JSON.stringify({notes: '모형에서 뽑은 소리 표(tools/export_sound.mjs 가 씀 — 직접 고치지 않음). 바람 gen_wind_* 와 모듈의 genSound 사건.', events: out}) + '\n');
console.log(`[export_sound] 모듈 ${mods.map(x => x.f).join(', ') || '없음'} · rate 구간 ${segs.length}개 · 사건 ${out.length}개 → ${path.relative(ROOT, file)}`);
