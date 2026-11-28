# 에피소드 폴더 `quantum-gravity` (73 OpenAI 양자중력이론)

`python pipeline/new_episode.py <slug> --title "…"`로 만든 폴더입니다. 직접 쓰는 파일은 셋입니다.

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap`. 스키마: `pipeline/narration/script_schema.py` |
| `scenes.mjs` | `theme`(film), `look`(밝은 곳의 자리), `scenes.{id}(stage, t, p, ctx)`, `overlays`(포스터·머리글·띠) |
| `sound.json` | 설명용 소리 사건 — `make_sound.mjs` 가 만든다(손으로 고치지 않음). 배경음악 없음 |

`brief.md`는 기획·단순화·검증 메모, `render.mjs`와 `run.sh`는 틀 그대로입니다.

이 편은 파일이 둘 더 있습니다(같은 시계).
- `model.mjs` — 모형과 사건 계획 한 곳: 빛의 모임 `ϱ(u) = sin(σu)/σ`, `σ_n² = n·ε`(ε b² = 0.11), 한계 ℓ = 1.30 b, `u*(n)`(n = 0…8 들어감, 9 넘침), 두 합 `H_N = Σ1/k`·`Z_N = Σ1/k²`(→ π²/6), 블랙홀 `S = A/4`, 토큰 약 4억. `plan(timeline)` 이 장면마다의 사건 시각(섬광·맞붙음·잔물결 k·중력자 n·막힘·항 k·떨어짐 …)을 낸다. 그림·계기 숫자·소리가 모두 이 값을 쓴다.
- `make_sound.mjs` — `sound.json` 을 같은 `plan()` 에서 만든다. 대본·음성이 바뀌면 `node episodes/quantum-gravity/make_sound.mjs` 를 다시 돌린 뒤 `run.sh stills render sfx …`.

```bash
SKIP_NARRATE=1 episodes/quantum-gravity/run.sh stills                 # 스틸만 다시 (outputs/quantum-gravity/stills/contact-sheet.jpg, 빛 지도 contact-sheet-hdr.jpg)
SKIP_NARRATE=1 episodes/quantum-gravity/run.sh render sfx mix finish hdr validate
SCISHORT_ROOT=$PWD node episodes/quantum-gravity/render.mjs --stills --safe   # 플랫폼 UI 영역 겹쳐 보기
```

장면(무대 하나 = 시공간 그림, 시간이 위):
- hook — 포스터(흰 물음 두 줄 + 난색 주제어 "OpenAI / 양자중력이론") 아래 쉬는 색 다이아몬드. 0.03~0.72초 빛이 아래 → 위 원뿔을 훑어 면이 밝아짐, 0.62~1.82초 이웃 18개가 맞붙고 0.72~2.0초 카메라가 물러남, 2.2~3.2초 되감기, 그 뒤 빛이 되풀이. s02: 왼쪽 "스탠퍼드 대학 물리학자 · V. Chandrasekaran" ↔ 오른쪽 "OpenAI의 인공지능 · GPT-6 Astra", 가운데 논문(arXiv 2611.34924 · 2026.11.25)에 답마다 한 줄, 큰 숫자 토큰 0 → 약 4억.
- origin — 격자 판에 질량이 떨어져 판이 휨, 질량이 우물을 천천히 돌며 눈금 한 칸의 길이가 바뀜(계기). s04: 고정된 무대(점선 잔상), 판이 두 모양으로 겹쳐 출렁이고 눈금이 두 자리에.
- infinity — 판에 잔물결 k = 1…10, 그 뒤 ×10 씩(10⁶까지). 계기(가로 log N, 세로 합) 한색 선 H_N 이 천장을 뚫음, 큰 숫자 = 합. s07: 판이 물러나고 다이아몬드가 섬, 빛이 되풀이.
- diamond — 사건 p 섬광 → 미래 빛원뿔이 자람 → 테두리에서 과거 빛원뿔로 빛이 모여 q 섬광. 이름표(사건(먼저)·사건(나중)·빛원뿔 null cone·테두리), s09: "인과 다이아몬드", 신호 점들이 안쪽 길로 q 에 닿고 하나는 원뿔 면에 붙어 감.
- focus — 아래 원뿔 확대. 중력파 고리(한색)가 올라가며 단면이 찌그러지고 원뿔이 안으로 굽어 테두리가 올라감. 시계 막대(무대와 같은 세로 자, 한계선 1.30), 중력자 n 1…8, 9번째는 한계선에서 막힘. 잔상 = 중력자 0개의 곧은 원뿔(점선).
- finite — 조각 6개가 하나씩 맞붙음(이음매 섬광 = 항 k), 계기의 난색 선 Z_N 이 1.645 에서 평평, 한색 H_N 잔상 → s16 에 다시 그려져 천장을 뚫음. 큰 숫자 = 합.
- blackhole — 무광 검은 공에 덩어리 둘이 떨어져 넓이가 커지고 표면 칸 수(= floor S)가 늘어남, 계기 직선 S = A/4 위의 점, 큰 글 "S = A / 4".
- limits — 검증의 길 네 칸(공개 → 동료 심사 → 재확인 → 실험), 표식은 '공개', 확인 점이 심사 쪽으로 가다 흐려짐. 아래 빈 다이아몬드("빈 시공간만")와 밖의 물질 상자.
- close — 조각보를 한 번 훑는 밝기, 계기 평평한 난색 선, 결론 글 + 끝 한 줄 "다음 원리도 이어서 — 과학쑛츠".

HDR 판(2026-11-15): 빛나는 것(빛의 앞면 고리·빛줄기·사건 섬광·이음매 섬광, 중력파 고리, 물음·답 점, 시계 펄스, 신호 점, 계기 선의 끝점)만 `lit()` 안에서 그립니다. `hdr` 단계가 `outputs/quantum-gravity/final/hdr/quantum-gravity.hdr.mp4` 를 만듭니다. **HDR 화면에서 보지 못함.** 규칙은 [docs/HDR.md](../../docs/HDR.md).
