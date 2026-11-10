# 에피소드 폴더 `tides` — 28. 밀물과 썰물이 생기는 이유

| 파일 | 내용 |
|---|---|
| `brief.md` | 범위, 출처, 장면 계획, 소리, 단순화 메모 |
| `script.json` | 23문장(합니다체), 숫자·연도는 `tts` |
| `scenes.mjs` | 모형(평형 조석, 기조력 무늬, 하루 두 번, 사리·조금, 해안 단면)과 장면. 지구는 `pipeline/render/globe.mjs` `drawEarthLit` |
| `sound.json` | `node episodes/tides/scenes.mjs --emit-sound`가 같은 모형에서 써 넣음(사건 36개) |
| `land.json` | Natural Earth 1:110m 육지(공유 저작물), `episodes/precession/land.json` 사본 |

실행: `episodes/tides/run.sh narrate` → `node episodes/tides/scenes.mjs --emit-sound` → `SKIP_NARRATE=1 episodes/tides/run.sh stills render sfx mix finish validate`.
영상은 템플릿 기본 CRF 18로 인코딩합니다.
