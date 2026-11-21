# 에피소드 폴더 `clouds`

`python pipeline/new_episode.py <slug> --title "…"`로 만든 폴더입니다. 직접 쓰는 파일은 셋입니다.

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap`. 스키마: `pipeline/narration/script_schema.py` |
| `scenes.mjs` | `theme`, `scenes.{id}(stage, t, p, ctx)`, 선택 `overlays`, `titles`, `captionLayout`, `events` |
| `sound.json` | 설명용 소리 사건(`events`)과 선택 배경음(`ambient`, 기본 꺼짐). 사건 시각은 화면과 공유 |

`brief.md`는 기획·단순화·검증 메모, `render.mjs`와 `run.sh`는 보통 고치지 않습니다.

```bash
episodes/clouds/run.sh                       # narrate → stills → render → sfx → mix → finish → hdr → validate
episodes/clouds/run.sh stills                # 스틸만 다시 (outputs/clouds/stills/contact-sheet.jpg, 빛 지도 contact-sheet-hdr.jpg)
SCISHORT_ROOT=$PWD node episodes/clouds/render.mjs --stills --safe   # 플랫폼 UI 영역 겹쳐 보기
```

HDR 판(2026-11-15): 빛나는 것(에너지·신호)은 `scenes.mjs` 에서 `lit(stage, c => …)` 안에서 그립니다. `hdr` 단계가 `outputs/clouds/final/hdr/clouds.hdr.mp4` 를 만듭니다. 규칙은 [docs/HDR.md](../../docs/HDR.md).

`scenes.mjs`의 장면 id(hook · origin · essence · white · float · rain · close)는 `script.json`의 `scene` 값과 같아야 합니다. 54 구름 편: 하늘 단면의 뭉게구름(오르는 공기, 평평한 밑면) → 렌즈(수증기 / 물방울) → 크기 자(빛의 파장 · 구름 물방울 · 빗방울) → 빛의 흩어짐(공기 분자 대 물방울) → 떨어지는 물방울(무게와 저항, 빠르기 계기) → 합쳐져 빗방울. 기획·출처·검증은 `brief.md`.
자세한 순서와 API는 [pipeline/README.md](../../pipeline/README.md).
