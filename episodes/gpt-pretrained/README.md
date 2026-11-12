# 44 `gpt-pretrained` — GPT는 어떻게 배웠을까

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap` |
| `PLAN.md`, `brief.md` | 이 편의 모형·무대·장면 계획(공통 규칙은 `../gpt-generative/PLAN.md` 1~3절), 기획·단순화 메모 |
| `model.mjs` | 실제로 학습시키는 아주 작은 모형(조각 25가지, 숫자 1,900개, 경사 하강). `node episodes/gpt-pretrained/model.mjs` 가 확인 값을 찍음 |
| `parts.mjs` | 이 편의 무대(크기·자리), 카메라 틀 잡기, 다이얼 판·막대·틀린 정도·곡선 |
| `scenes.mjs` | 모음(시간 계획 `plan`, 머리글·포스터, `--emit-sound`) |
| `scenes_intro.mjs` · `scenes_core.mjs` · `scenes_after.mjs` | hook·origin·essence / guess·fix / scale·emerge·tune·frozen·close |
| `sound.json` | `node episodes/gpt-pretrained/scenes.mjs --emit-sound` 가 씀(손으로 고치지 않음) |

공통 부품과 움직임 도구는 `../gpt-generative/kit.mjs`, `../gpt-generative/motion.mjs` 를 import 합니다.

**화면의 확률·다이얼·곡선은 실제 GPT의 값이 아닙니다.** 이 편을 위해 만든 작은 모형을 실제로 학습시킨 값이며, 손으로 적은 확률은 없습니다. GPT-3 의 수 셋(1,750억 개, 3,000억 조각, 약 4,000년)만 대본의 값입니다.

실행: `SKIP_NARRATE=1 NO_MUSIC=1 episodes/gpt-pretrained/run.sh stills render sfx mix finish validate`
