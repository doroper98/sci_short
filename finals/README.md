# 최종본 보관함

이 폴더의 영상이 이 프로젝트의 **최종본**입니다.
2026-11-03 사용자 결정: 전달한 영상은 사용자가 다시 만들라고 하지 않는 한 최종본입니다.

## 규칙

- 번호는 제작 순서입니다. 한 편은 폴더 하나 `<번호>-<slug>/`에 모읍니다.
- 다시 만들라는 지시가 있으면 같은 폴더의 파일을 덮어쓰고 목록을 갱신합니다. 이전 판은 Git 기록에 남습니다.
- 영상을 만든 코드는 `episodes/<slug>/`에 있습니다. 렌더 중간 산출물(`outputs/`)은 Git에 넣지 않습니다.
- 목록과 해시는 `python3 pipeline/catalog.py`로 다시 만듭니다. 아래 표를 손으로 고치지 않습니다.

## 폴더마다 들어 있는 것

| 파일 | 내용 |
|---|---|
| `<slug>.mp4` | 최종 영상, 1080×1920, 30 fps, H.264/AAC |
| `<slug>.srt` | 자막(화면에 이미 새겨져 있음, 업로드하지 않는 것이 기본) |
| `poster.jpg` | 대표 정지화면 |
| `scenes.jpg` | 장면별 정지화면 모음 |
| `timeline.json` | 문장·낱말·자막 시각 |
| `validation.json` | 자동 검증 기록 |
| `README.md` | 흐름, 모형과 단순화, 검증 방법, 청취 여부 |
| `upload.md` | 유튜브 제목·설명·태그·썸네일 시각·고정 댓글. 공통 설정은 [업로드 공통 설정](../docs/YOUTUBE_UPLOAD.md) |

## 목록

<!-- catalog:start -->
| 번호 | 제목 | 길이 | 폴더 | 업로드 정보 | 영상 확정일 |
|---|---|---|---|---|---|
| 01 | 두 블랙홀의 마지막 춤, 중력파 | 177.3초 | [01-gravitational-waves/](01-gravitational-waves/) | [upload.md](01-gravitational-waves/upload.md) | 2026-10-31 |
| 02 | LIGO는 어떻게 잴까 — 어둠 속의 작은 밝아짐 | 175.5초 | [02-ligo-how-it-works/](02-ligo-how-it-works/) | [upload.md](02-ligo-how-it-works/upload.md) | 2026-11-01 |
| 03 | 엘니뇨와 라니냐 — 바람이 물을 밀고, 물이 바람을 만든다 | 178.0초 | [03-el-nino-la-nina/](03-el-nino-la-nina/) | [upload.md](03-el-nino-la-nina/upload.md) | 2026-11-01 |
| 04 | 파장 — 전파에서 감마선까지, 다른 것은 길이 하나 | 176.6초 | [04-wavelength/](04-wavelength/) | [upload.md](04-wavelength/upload.md) | 2026-11-01 |
| 05 | 지구를 두른 바람의 띠 — 무역풍·무풍대·편서풍 | 179.0초 | [05-global-winds/](05-global-winds/) | [upload.md](05-global-winds/upload.md) | 2026-11-02 |
| 06 | 계절은 왜 생길까 — 거리가 아니라 기울기 | 160.0초 | [06-seasons/](06-seasons/) | [upload.md](06-seasons/upload.md) | 2026-11-02 |
| 07 | 지구 자전축의 느린 원 — 세차운동과 장동 | 173.9초 | [07-precession/](07-precession/) | [upload.md](07-precession/upload.md) | 2026-11-03 |
| 08 | 한 칸에 열 배 — 지진 규모·데시벨·pH와 로그 | 165.8초 | [08-log-scale/](08-log-scale/) | [upload.md](08-log-scale/upload.md) | 2026-11-03 |
| 09 | 별은 왜 반짝일까 — 반짝임은 공기가 만든다 | 175.7초 | [09-twinkle/](09-twinkle/) | [upload.md](09-twinkle/upload.md) | 2026-11-03 |
| 10 | 오로라는 왜 극지방에서만 보일까 | 161.3초 | [10-aurora/](10-aurora/) | [upload.md](10-aurora/upload.md) | 2026-11-03 |
| 11 | 에딩턴 한계 — 빛이 별을 밀어낸다 | 171.5초 | [11-eddington-limit/](11-eddington-limit/) | [upload.md](11-eddington-limit/upload.md) | 2026-11-04 |
| 12 | 퀘이사 — 별처럼 보인 블랙홀 | 174.3초 | [12-quasar/](12-quasar/) | [upload.md](12-quasar/upload.md) | uncommitted |

합계 12편, 34.5분, 280 MB. 파일 해시·해상도는 [catalog.json](catalog.json).
<!-- catalog:end -->

## 이전 작품 (`legacy/`)

표준 제작 도구 이전에 만든 시제품입니다. 시리즈 최종본 목록에는 넣지 않았습니다.

| 폴더 | 내용 | 상태 |
|---|---|---|
| [legacy/quartz/](legacy/quartz/) | 수정은 어떻게 자랄까? (113.7초) | 완성. 표준 음성이 아님(임시 변환 모델, `~요` 어미), 자체 음악 포함 |
| [legacy/korea-power-day/](legacy/korea-power-day/) | 대한민국 전기의 하루 (90초, 4:5) | 완성. 내레이션 없음, 자체 음악 |
| [legacy/sunlight-color/](legacy/sunlight-color/) | One Sun. Two Colors. | 영어 내레이션 없는 검토본. 업로드 보류 |
