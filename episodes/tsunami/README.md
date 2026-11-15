# 에피소드 폴더 `tsunami` — 58번 쓰나미(화풍 시험: 픽셀 일러스트)

2026-11-15 사용자 결정으로 **이 편만** 픽셀 일러스트 화풍으로 만들었습니다. 다른 편의 본보기로 쓰지 마세요(나머지 편은 지금 화풍 그대로). 완성본은 [finals/58-tsunami](../../finals/58-tsunami/README.md).

| 파일 | 내용 |
|---|---|
| `brief.md` | 기획·근거·출처·단순화·검증 메모 |
| `script.json` | 문장 21개(Fable 검수 반영) |
| `px.mjs` | 픽셀 그림 도구(270×480 버퍼, 색 한 벌, 점묘) — `samples/look-proposal-pixel/px.mjs` 를 옮겨 온 것 |
| `world.mjs` | 무대 하나(단층 → 깊은 바다 → 비탈 → 해안)와 모형(빠르기·높이·물결 길이), `drawWorld()` |
| `scenes.mjs` | 장면 = 카메라의 자리. `plan(tl)` 이 문장·낱말 시각에서 모든 장면의 시계를 만든다. 글자는 키운 그림 위에 얹는다 |
| `emit_sound.mjs` | `sound.json` 을 `plan()` 과 모형에서 써 넣는다 |
| `sound.json` | 생성물(직접 고치지 않는다) |

```bash
episodes/tsunami/run.sh narrate                       # 음성(대본이 바뀌면)
node episodes/tsunami/emit_sound.mjs                  # 타임라인이나 plan() 이 바뀌면 소리 표를 다시 쓴다
SKIP_NARRATE=1 episodes/tsunami/run.sh stills render sfx mix finish validate
```
