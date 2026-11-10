# 에피소드 폴더 `ai-learning` — 37. AI는 어떻게 배우고 답할까

> **기각(2026-11-11).** 사용자: "chatgpt 편은 내가 삭제 했어. 너무 내용이 부실해서 기각 됨." 유튜브 비공개 업로드 뒤 사용자가 삭제했고, `finals/37-ai-learning/`은 지웠다(git 기록에 남음). 다시 만들 때 참고용으로 코드만 둔다.

| 파일 | 내용 |
|---|---|
| `brief.md` | 범위, 출처, 장면별 인과 사슬 표, 소리, 단순화 메모 |
| `script.json` | 22문장(합니다체), 숫자·로마자는 `tts` |
| `scenes.mjs` | 계획(plan: 순전파·역전파 물결, 확률 막대, 붙는 토큰)과 장면. 무대 하나 = 글 띠 → 손잡이 판(모델) → 확률 막대 |
| `sound.json` | `node episodes/ai-learning/scenes.mjs --emit-sound`가 같은 계획에서 써 넣음(사건 38개) |

실행: `episodes/ai-learning/run.sh narrate` → `node episodes/ai-learning/scenes.mjs --emit-sound` → `SKIP_NARRATE=1 episodes/ai-learning/run.sh stills render sfx mix finish validate`.
예약 업로드 편이 아니다(`config/daily.json`에 없음). 병합 push 가 곧 유튜브 비공개 업로드이므로 사용자가 업로드를 요청할 때 병합한다.
