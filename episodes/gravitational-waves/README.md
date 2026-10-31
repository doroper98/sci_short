# 에피소드 폴더 `gravitational-waves`

`python pipeline/new_episode.py <slug> --title "…"`로 만든 폴더입니다. 직접 쓰는 파일은 셋입니다.

| 파일 | 내용 |
|---|---|
| `script.json` | 문장(표시 `text` / 발음 `tts`), 장면 id, 문장 뒤 쉼 `gap`. 스키마: `pipeline/narration/script_schema.py` |
| `scenes.mjs` | `theme`, `scenes.{id}(stage, t, p, ctx)`, 선택 `overlays`, `titles`, `captionLayout`, `events` |
| `sound.json` | 설명용 소리 사건(`events`)과 선택 배경음(`ambient`, 기본 꺼짐). 사건 시각은 화면과 공유 |

`brief.md`는 기획·단순화·검증 메모, `render.mjs`와 `run.sh`는 보통 고치지 않습니다.

```bash
episodes/gravitational-waves/run.sh                       # narrate → stills → render → sfx → mix → finish → validate
episodes/gravitational-waves/run.sh stills                # 스틸만 다시 (outputs/gravitational-waves/stills/contact-sheet.jpg)
SCISHORT_ROOT=$PWD node episodes/gravitational-waves/render.mjs --stills --safe   # 플랫폼 UI 영역 겹쳐 보기
```

`scenes.mjs`의 장면 id는 `script.json`의 `scene` 값과 같아야 합니다. 예시는 "얼음은 왜 물에 뜰까"이며 내용은 바꿉니다.
자세한 순서와 API는 [pipeline/README.md](../../pipeline/README.md).

## 이 에피소드의 모형과 소리 (중력파, GW150914)

`scenes.mjs` 맨 위의 순수 함수 구역 하나가 그림·측정값·파형·처프음을 모두 만듭니다. 출처와 단순화는 이 표와 `brief.md`에만 둡니다.
2026-10-31 수정 라운드(아이와 함께 볼 영상)에서 화면 각주를 모두 지웠습니다. 남긴 화면 안내는 kicker의 시간 배율과
detect의 "팔 길이 변화는 크게 과장해서 그림" 같은 그림 속 라벨뿐입니다.

| 항목 | 값 / 식 | 비고 |
|---|---|---|
| 모형 | 점질량 원궤도, 사중극 복사(Peters 1964) | 병합 직전 ±수 ms는 모형 밖 → 그림은 보간 |
| 질량 | m1 36, m2 29, M 65, Mc 28.3, 최종 62 M☉ | GW150914 (PRL 116, 061102) |
| f_gw(τ) | (1/π)(5/256·1/(−τ))^(3/8)(G·Mc/c³)^(−5/8), 250 Hz에서 고정 | 35 Hz ↔ τ ≈ −0.188 s, 24 Hz ↔ τ0 ≈ −0.514 s |
| 위상 φ(τ) | π∫f_gw dτ, 4000점 표(τ→0 쪽으로 촘촘) | 공전·파면 방출·h(t)·처프음이 모두 이 표를 읽음 |
| r, v/c | 케플러 r³ = GM/(πf)², v = (πGMf)^(1/3) | 24 Hz: 1,149 km·0.29c / 250 Hz: 241 km·0.63c |
| 블랙홀 크기 | 슈바르츠실트 반지름 106·86 → 183 km, 궤도와 같은 축척(1 단위 = 1000 km, 1,150 km ≈ 330 px) | 바깥 희미한 빛(~1.5 Rs)은 장식, 사건 지평선 아님 |
| h(t) | f^(2/3)·cos 2φ, 병합 때 1 / 링다운 e^(−τ/4 ms)·cos(2φ(0)+2π·250·τ), 25 ms | 링다운 위상은 처프와 연속 |
| 시간 배율 | mechanism 시작 = τ0, `merge` 사건(s13 + 0.3 s) = τ0 → 0 직선. 현재 타임라인에서 N = 74.3 → 화면 "70×"(10 단위 반올림) | hook·essence·myth·detect도 같은 N(기준점만 다름) |
| 파면 | 반 바퀴(=GW 한 주기)마다 고리 하나, 화면 속도 0.30 단위/s | 실제는 빛의 속도·두 갈래 나선, 파장 1,200~12,500 km |
| LIGO | 연속 레이저 → 빔 분할기 → 두 팔 왕복 → 다시 겹침 → 광검출기 밝기. 화면 ΔL/L = 0.10·h_model(실제 1×10⁻²¹의 약 10²⁰배 과장), 밝기 = sin²(π/2·|h|) (어두운 무늬 근처 동작을 단순화) | 신호는 s17c 시작 0.2 s 뒤 도착, 최대는 "변합니다". 두 관측소: 리빙스턴 먼저, 핸퍼드 6.9 ms 뒤(같은 N으로 화면 표시) → 방향 |
| 출력 비교 | 최대 3.6×10⁴⁹ W ≈ 관측 가능한 우주의 모든 별빛의 약 50배 | detect s16 막대 |

소리(`sound.json`): 배경음악 없음(`music.enabled: false`, 사용자 요청).

- `chirp`(sfx 종류): `points = [[t_rel, f_hz, amp], …]` 표를 따라 위상 연속으로 합성. 기본음 = 모형의 f_gw(24→250 Hz), 세기 ∝ f_gw^(2/3), 링다운(250 Hz, 실제 4 ms → 화면 배율)까지 같은 표. 배음(×2~×8)은 휴대전화 스피커에서 저음의 음높이가 들리도록 더한 것. `gain_db −2.5`: 병합 순간 덕킹 후 처프 RMS가 s13 내레이션 RMS보다 약 6 dB 낮음(수치 측정, 청취 아님).
- `merge`: 병합(τ = 0) 순간의 낮은 swell. 이 사건 시각이 시간 배율의 기준점이므로 화면과 소리가 같은 수를 씁니다.

**타임라인이 바뀌면 반드시** 처프 표를 다시 만듭니다(그렇지 않으면 mechanism 장면이 경고를 한 번 출력):

```bash
SCISHORT_ROOT=$PWD node episodes/gravitational-waves/scenes.mjs --emit-chirp   # sound.json의 chirp.points·model 갱신
SKIP_NARRATE=1 episodes/gravitational-waves/run.sh stills render sfx mix finish validate
```
