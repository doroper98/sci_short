# 에피소드 폴더 `sar` — 33. 합성개구레이더(SAR)의 원리

| 파일 | 내용 |
|---|---|
| `brief.md` | 범위, 출처, 장면별 인과 사슬, 소리, 단순화 메모 |
| `script.json` | 24문장(합니다체), 숫자·연도는 `tts` |
| `scenes.mjs` | 모형(거리 R = c·t/2, 빔 폭 = Rλ/L, 메아리 거리 이력 √(R0² + u²), 맞춰 더하기)과 장면. 무대 하나(궤도 방향 옆모습 + 위에서 본 레이더 사진 띠) |
| `glow.mjs` | 빛 버퍼(신호만 빛남). `samples/look-proposal-radar/glow.mjs` 사본 |
| `sound.json` | `node episodes/sar/scenes.mjs --emit-sound`가 같은 모형에서 써 넣음(사건 33개) |

실행: `episodes/sar/run.sh narrate` → `node episodes/sar/scenes.mjs --emit-sound` → `SKIP_NARRATE=1 episodes/sar/run.sh stills render sfx mix finish validate`.
영상은 템플릿 기본 CRF 18로 인코딩합니다.
