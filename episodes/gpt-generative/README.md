# 43 `gpt-generative` — GPT는 대답을 어떻게 쓸까

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap` |
| `PLAN.md`, `brief.md` | 구현 계획서(3부작 공통 1~3절 포함), 기획·단순화 메모 |
| `model.mjs` | 설명용 다음 조각 확률표와 뽑기(씨앗 고정). `node episodes/gpt-generative/model.mjs` 가 확인 값을 찍음 |
| `kit.mjs`, `glow.mjs`, `motion.mjs` | 3부작 공통 부품·빛·움직임 도구(44·45번이 import) |
| `parts.mjs` | 이 편의 무대(크기·자리), 카메라 틀 잡기(`frameBoxes`, `edgeA`), 글쓰기 엔진(`makeRun`/`drawRun`), 띠·막대 변형(34px 글자) |
| `scenes.mjs` | 모음(시간 계획 `plan`, 머리글·포스터, `--emit-sound`) |
| `scenes_intro.mjs` · `scenes_token.mjs` · `scenes_core.mjs` · `scenes_end.mjs` | hook·origin·essence / token / loop·dice / chat·wrong·close |
| `sound.json` | `node episodes/gpt-generative/scenes.mjs --emit-sound` 가 씀(손으로 고치지 않음) |

**화면의 확률·%는 실제 GPT의 값이 아닙니다.** 이 편을 위해 만든 작은 확률표(`model.mjs`)의 값이며, 조각도 읽기 쉽게 낱말에 가까운 단위로 잘랐습니다. 조각 종류 수 50,257 은 GPT-2·3 의 실제 값입니다.

```bash
node episodes/gpt-generative/scenes.mjs --emit-sound
SKIP_NARRATE=1 NO_MUSIC=1 episodes/gpt-generative/run.sh stills render sfx mix finish validate
node outputs/gpt-generative/review.mjs <prefix> <t0> <t1> <n> [cols]     # 검수용 묶음 스틸
```
