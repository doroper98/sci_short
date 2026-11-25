# 에피소드 폴더 `seismic-waves`

`python pipeline/new_episode.py <slug> --title "…"`로 만든 폴더입니다. 직접 쓰는 파일은 셋입니다.

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap`. 스키마: `pipeline/narration/script_schema.py` |
| `scenes.mjs` | `theme`, `scenes.{id}(stage, t, p, ctx)`, 선택 `overlays`, `titles`, `captionLayout`, `events` |
| `sound.json` | 설명용 소리 사건(`events`)과 선택 배경음(`ambient`, 기본 꺼짐). 사건 시각은 화면과 공유 |

`brief.md`는 기획·단순화·검증 메모, `render.mjs`와 `run.sh`는 보통 고치지 않습니다.

```bash
episodes/seismic-waves/run.sh                       # narrate → stills → render → sfx → mix → finish → hdr → validate
episodes/seismic-waves/run.sh stills                # 스틸만 다시 (outputs/seismic-waves/stills/contact-sheet.jpg, 빛 지도 contact-sheet-hdr.jpg)
SCISHORT_ROOT=$PWD node episodes/seismic-waves/render.mjs --stills --safe   # 플랫폼 UI 영역 겹쳐 보기
```

HDR 판(2026-11-15): 빛나는 것(에너지·신호)은 `scenes.mjs` 에서 `lit(stage, c => …)` 안에서 그립니다. `hdr` 단계가 `outputs/seismic-waves/final/hdr/seismic-waves.hdr.mp4` 를 만듭니다. 규칙은 [docs/HDR.md](../../docs/HDR.md).

`scenes.mjs`의 장면 id는 `script.json`의 `scene` 값과 같아야 합니다.

이 편만의 파일: `model.mjs`(같은 시계 — 실행(미끄러짐)마다의 시각·배율, 파의 변위 해석해, 지진계 합성 기록, 경보 시각, 사슬 펄스 시각, 지구 단면 광선)와 `make_sound.mjs`(`sound.json` 을 `model.mjs` 에서 만든다 — `sound.json` 은 손으로 고치지 않는다: `node episodes/seismic-waves/make_sound.mjs`).
자세한 순서와 API는 [pipeline/README.md](../../pipeline/README.md).
