# 에피소드 폴더 `{{slug}}`

`python pipeline/new_episode.py <slug> --title "…"`로 만든 폴더입니다. 직접 쓰는 파일은 셋입니다.

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap`. 스키마: `pipeline/narration/script_schema.py` |
| `scenes.mjs` | `theme`, `scenes.{id}(stage, t, p, ctx)`, 선택 `overlays`, `titles`, `captionLayout`, `events` |
| `sound.json` | 설명용 소리 사건(`events`)과 선택 배경음(`ambient`, 기본 꺼짐). 사건 시각은 화면과 공유 |

`brief.md`는 기획·단순화·검증 메모, `render.mjs`와 `run.sh`는 보통 고치지 않습니다.

```bash
episodes/{{slug}}/run.sh                       # narrate → stills → render → sfx → mix → finish → validate
episodes/{{slug}}/run.sh stills                # 스틸만 다시 (outputs/{{slug}}/stills/contact-sheet.jpg)
SCISHORT_ROOT=$PWD node episodes/{{slug}}/render.mjs --stills --safe   # 플랫폼 UI 영역 겹쳐 보기
```

`scenes.mjs`의 장면 id는 `script.json`의 `scene` 값과 같아야 합니다. 예시는 "얼음은 왜 물에 뜰까"이며 내용은 바꿉니다.
자세한 순서와 API는 [pipeline/README.md](../../pipeline/README.md).
