# 45 `gpt-transformer` — GPT는 문맥을 어떻게 읽을까

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap` |
| `PLAN.md`, `brief.md` | 이 편의 모형·무대·장면 계획(공통 규칙은 `../gpt-generative/PLAN.md` 1~3절), 기획·단순화 메모 |
| `model.mjs` | 두 방향짜리 아주 작은 주의(어텐션) 계산: 주의 softmax, 섞어 옮기기(층), 다음에 올 만한 말의 확률, 예전 방식의 기억. `node episodes/gpt-transformer/model.mjs` 가 확인 값을 찍음 |
| `parts.mjs` | 이 편의 무대, 카메라 틀 잡기, 카메라를 따르는 주의의 선, 낱말 줄·주의 막대·지도·숫자 묶음·층 표시·기억 덩어리 |
| `scenes.mjs` | 모음(시간 계획 `plan`, 머리글·포스터, `--emit-sound`) |
| `scenes_intro.mjs` · `scenes_core.mjs` · `scenes_out.mjs` | hook·origin·essence / attend·swap / layers·far·learned·close |
| `sound.json` | `node episodes/gpt-transformer/scenes.mjs --emit-sound` 가 씀(손으로 고치지 않음) |

공통 부품과 움직임 도구는 `../gpt-generative/kit.mjs`, `../gpt-generative/motion.mjs` 를 import 합니다.

**화면의 주의 값·점의 자리·확률은 실제 GPT의 값이 아닙니다.** 낱말의 처음 자리와 관련 점수표는 이 편을 위해 손으로 정했고(실제로는 배워서 얻음), 주의·섞기·옮겨 가기·다음 말 확률은 그 값에서 계산합니다. GPT-3 의 수 둘(낱말 하나 12,288개, 96층)만 대본의 값입니다.

실행: `SKIP_NARRATE=1 NO_MUSIC=1 episodes/gpt-transformer/run.sh stills render sfx mix finish validate`
