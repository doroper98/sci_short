// 66 꼬리날개 — 소리 조각을 sound.json 하나로 모은다.
//   node episodes/tail-stability/tools/merge_sound.mjs
// 조각: episodes/tail-stability/sound_*.json — 각각 {"events": [ … ]} (장면 모듈마다 하나, 그리고 모형에서 뽑은 표 sound_gen.json).
// 같은 id 가 둘이면 멈춘다(sfx.py --events-check 가 id 로 화면과 대조한다). 읽지 못한 조각은 경고만 하고 건너뛴다.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(HERE).filter(f => /^sound_[a-z0-9]+\.json$/.test(f)).sort();
const events = [], seen = new Map();
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')); }
  catch (e) { console.warn(`[merge_sound] ${f} 를 읽지 못해 건너뜁니다: ${e.message}`); continue; }
  for (const ev of d.events || []) {
    if (seen.has(ev.id)) { console.error(`[merge_sound] 같은 id "${ev.id}" 가 ${seen.get(ev.id)} 와 ${f} 에 있습니다`); process.exit(2); }
    seen.set(ev.id, f); events.push(ev);
  }
}
const out = {
  version: 1,
  notes: '설명용 합성음입니다(녹음 아님). 조각 sound_*.json 을 tools/merge_sound.mjs 로 모은 파일이라 직접 고치지 않습니다. 기본음은 모두 700 Hz 아래, 음악 없음.',
  events,
  ambient: {enabled: false, kind: 'pad', seed: 7, gain_db: -32, root_hz: 110, intervals: [0, 7, 12, 16]},
  music: {id: 'zabriskie_patriarch', enabled: false, under_db: 12, duck_db: 6, start_sec: 0, note: '기본 꺼짐(2026-10-31 사용자 결정)'},
};
fs.writeFileSync(path.join(HERE, 'sound.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`[merge_sound] ${files.length}개 조각, 사건 ${events.length}개 → sound.json`);
