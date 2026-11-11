# 에피소드 폴더 `typhoon-track` — 25. 태풍은 왜 우리나라 앞에서 꺾일까

| 파일 | 내용 |
|---|---|
| `brief.md` | 범위, 출처, 대본 Fable 검수, 장면별 인과 사슬, 소리, 단순화·검증 메모 |
| `script.json` | 24문장(합니다체, 800음절), 숫자·연도는 `tts`. Fable 검수 반영본 |
| `scenes.mjs` | 모형(북태평양 고기압 타원, 그 둘레를 도는 태풍 길, 위도에 따른 이동 속도, 전향력 ∝ sin 위도, 레드필드의 두 숲)과 장면. 무대 하나(북서태평양 평면 지도) |
| `land.json` | Natural Earth 1:110m 육지 윤곽(퍼블릭 도메인, `episodes/tides/land.json` 사본) |
| `sound.json` | `node episodes/typhoon-track/scenes.mjs --emit-sound`가 같은 모형에서 써 넣음(사건 40개) |

실행: `episodes/typhoon-track/run.sh narrate` → `node episodes/typhoon-track/scenes.mjs --emit-sound` → `SKIP_NARRATE=1 episodes/typhoon-track/run.sh stills render sfx mix finish validate`.
영상은 템플릿 기본 CRF 18로 인코딩합니다. 완성본은 `finals/25-typhoon-track/`.
