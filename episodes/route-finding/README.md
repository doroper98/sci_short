# 에피소드 폴더 `route-finding`

`python pipeline/new_episode.py <slug> --title "…"`로 만든 폴더입니다. 직접 쓰는 파일은 셋입니다.

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap`. 스키마: `pipeline/narration/script_schema.py` |
| `scenes.mjs` | `theme`, `scenes.{id}(stage, t, p, ctx)`, 선택 `overlays`, `titles`, `captionLayout`, `events` |
| `sound.json` | 설명용 소리 사건(`events`)과 선택 배경음(`ambient`, 기본 꺼짐). 사건 시각은 화면과 공유 |

`brief.md`는 기획·단순화·검증 메모, `render.mjs`와 `run.sh`는 보통 고치지 않습니다.

이 편은 파일이 둘 더 있습니다(같은 시계).
- `model.mjs` — 가상의 도로망(동네 무대·큰 도로망·기원 장면의 작은 그물), 다익스트라·A*·층 방법의 탐색, 교통 장면의 차와 지난 기록 곡선, 그리고 장면마다의 '실행'(`plan(timeline)` — k 번째 확정 시각 = t0 + k ÷ 빠르기).
- `make_sound.mjs` — `sound.json` 을 같은 `plan()` 에서 만든다(손으로 고치지 않는다). 대본·음성이 바뀌면 `node episodes/route-finding/make_sound.mjs` 를 다시 돌린 뒤 `run.sh stills render sfx …`.

```bash
episodes/route-finding/run.sh                       # narrate → stills → render → sfx → mix → finish → hdr → validate
episodes/route-finding/run.sh stills                # 스틸만 다시 (outputs/route-finding/stills/contact-sheet.jpg, 빛 지도 contact-sheet-hdr.jpg)
SCISHORT_ROOT=$PWD node episodes/route-finding/render.mjs --stills --safe   # 플랫폼 UI 영역 겹쳐 보기
```

HDR 판(2026-11-15): 빛나는 것(에너지·신호)은 `scenes.mjs` 에서 `lit(stage, c => …)` 안에서 그립니다. `hdr` 단계가 `outputs/route-finding/final/hdr/route-finding.hdr.mp4` 를 만듭니다. 규칙은 [docs/HDR.md](../../docs/HDR.md).

`scenes.mjs`의 장면 id는 `script.json`의 `scene` 값과 같아야 합니다. `render.mjs` 는 정지화면을 뽑을 때 확정 틱·고침·위치 알림 같은 잦은 소리 사건은 건너뜁니다(사건마다 뽑으면 500장이 넘음).
자세한 순서와 API는 [pipeline/README.md](../../pipeline/README.md).
