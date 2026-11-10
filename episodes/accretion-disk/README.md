# 에피소드 폴더 `accretion-disk` (36번)

"강착원반 — 별이 블랙홀 둘레에서 원반이 되는 이유". 기획·출처·단순화는 [brief.md](brief.md), 완성본은 [finals/36-accretion-disk](../../finals/36-accretion-disk/README.md).

| 파일 | 내용 |
|---|---|
| `script.json` | 21문장, 9장면(hook · origin · tide · whole · spin · flatten · disk · observe · close) |
| `model.mjs` | 설명 모형. 시험 입자 7,000개의 조석 붕괴(Paczyński–Wiita 퍼텐셜, 충돌은 반지름·수직 속도 감쇠로 흉내), 정상 원반, 힐스 질량, 관측 밝기 곡선 모형. `node episodes/accretion-disk/model.mjs`로 수치 확인(속박 비율 약 47%) |
| `scenes.mjs` | 무대 하나(블랙홀 중심 궤도면)에 카메라만 보간. Glow 버퍼(11·12번과 같은 기법)에 별 → 줄기 → 고리 → 원반 |
| `make_sound.mjs` | `sound.json`을 같은 시간 계획과 모형에서 써 넣음. 타임라인이 바뀌면 다시 실행 |
| `lookcheck.py` | PR #63 부록 A 정의의 장면별 영상미 지표(이 편에만 둔 계산, 규칙 문서 반영 전) |

```bash
episodes/accretion-disk/run.sh narrate
node episodes/accretion-disk/make_sound.mjs
SKIP_NARRATE=1 episodes/accretion-disk/run.sh stills render sfx mix finish validate
/home/user/.venv-scishort-render/bin/python episodes/accretion-disk/lookcheck.py outputs/accretion-disk/final/accretion-disk.mp4 outputs/accretion-disk/narration/timeline.json
```
