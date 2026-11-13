# 46 `gpt-image` — GPT는 그림을 어떻게 그릴까

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap` |
| `PLAN.md`, `brief.md` | 이 편의 모형·무대·장면 계획(공통 규칙은 `../gpt-generative/PLAN.md` 1~3절), 기획·단순화 메모 |
| `model.mjs` | 손으로 그린 20×20 그림 15장에서 실제로 세어 배우는 아주 작은 그림 모형(무늬 8가지, 칸마다 담당 낱말·왼쪽/위 문맥, 평활 α 0.0005). `node episodes/gpt-image/model.mjs` 가 확인 값을, `--search` 가 씨앗 찾기를 다시 찍음 |
| `preview.mjs` | 그림 확인표 → `outputs/gpt-image/review/art.jpg` |
| `parts.mjs` | 이 편의 무대(크기·자리), 카메라 틀 잡기, 무광 타일·그림판·Scale2x 그림, 무늬 색 뽑기 띠, 그림판 그리기 엔진 |
| `scenes.mjs` | 모음(시간 계획 `plan`, 머리글·포스터, `--emit-sound`) |
| `scenes_intro.mjs` · `scenes_token.mjs` · `scenes_draw.mjs` · `scenes_end.mjs` | hook·origin / token·line·learn / draw·vary·mix / other·close |
| `sound.json` | `node episodes/gpt-image/scenes.mjs --emit-sound` 가 씀(손으로 고치지 않음) |

공통 부품과 움직임 도구는 `../gpt-generative/kit.mjs`, `../gpt-generative/motion.mjs` 를 import 합니다(읽기 전용).

**화면의 그림·확률·번호는 실제 GPT의 값이 아닙니다.** 이 편을 위해 만든 작은 모형이 그림 15장에서 실제로 센 값이며, 손으로 적은 확률은 없습니다. 예외는 둘입니다. hook 의 글 조각 표(`TEXT_NEXT`, `뿜는다` 86% 등)는 "목록에서 하나를 고른다"를 보이려고 정한 설명용 값이고, 확산 장면과 연표의 그림판(`noisy`)은 방식의 생김새를 보여 주는 설명용 그림입니다(키커에 "설명용 그림"). DALL·E 의 수(1,024개, 8,192가지, 2억 5천만 장)만 대본의 값입니다. 생물(아기 용, 고양이)은 이 편을 위해 직접 그린 것입니다.

실행: `SKIP_NARRATE=1 NO_MUSIC=1 episodes/gpt-image/run.sh stills render sfx mix finish validate`
