# pipeline — 대본에서 완성 MP4까지

목표: 새 세션이 **에피소드 전용 파일 셋**(`script.json`, `scenes.mjs`, 선택 `sound.json`)만 써서
약 1시간 안에 **최대 180초, 1080×1920, 30 fps 한국어 과학 쇼츠**를 완성하는 것.
주제 설계 흐름은 [docs/EPISODE_FLOW.md](../docs/EPISODE_FLOW.md), 품질 기준은 [ANIMATION_QUALITY](../docs/ANIMATION_QUALITY.md) ·
[SOUND_DESIGN](../docs/SOUND_DESIGN.md) · [NARRATION_AND_CAPTIONS](../docs/NARRATION_AND_CAPTIONS.md).

## 디렉터리

```text
pipeline/
  narration/        표준 M3 음성 → narration.wav, timeline.json, captions.srt   (README: narration/README.md)
  render/           Node 캔버스 툴킷: stage·draw·timeline·captions·chrome·encode, fetch_fonts.py   (README: render/README.md)
    tests/          node --test, fixtures/timeline.sample.json, make_fixture.py
  audio/            sfx.py(설명용 소리), mix.py(덕킹 믹스), finish.py(마스터링·mux·validation.json), tests/
  validate.py       완성 폴더 자동 검사 → validate.json
  new_episode.py    episodes/_template → episodes/<slug>
episodes/
  _template/        brief.md script.json scenes.mjs sound.json render.mjs run.sh README.md
  <slug>/           에피소드별 작업 폴더 (Git 추적)
outputs/<slug>/     모든 생성물 (Git 제외)
  narration/        timeline.json narration.wav captions.srt …
  stills/           still_*.jpg contact-sheet.jpg
  events.json visual.mp4 sfx.wav [ambient.wav] sound-design.json mix.wav mix-report.json validate.json
  final/<slug>.mp4  final/<slug>.srt  final/validation.json
assets/fonts/       GmarketSans·Noto Sans KR (Git 제외, fetch_fonts.py로 받음)
```

## 한 번만 준비

```bash
# 렌더(Node 22)
(cd pipeline/render && npm install)
# 오디오·글꼴 도구 (저장소 밖 venv)
python3 -m venv /home/user/.venv-scishort-render
/home/user/.venv-scishort-render/bin/pip install -r pipeline/audio/requirements.txt
/home/user/.venv-scishort-render/bin/python pipeline/render/fetch_fonts.py
# 내레이션 venv와 모델: pipeline/narration/README.md (/home/user/.venv-scishort)
```

시스템: ffmpeg/ffprobe 6.x, 대체 글꼴 `fonts-noto-cjk`(없으면 `apt-get install fonts-noto-cjk`), `fonts-dejavu`.
`run.sh` 맨 위의 `VENV`, `NVENV`, `NODE`, `MAX_SEC` 변수로 경로를 바꿉니다.

## 타임라인 계약 (narration → render/audio)

`outputs/<slug>/narration/timeline.json` v1:
```json
{"schema_version":1,"title":"…","language":"ko",
 "voice":"supertonic-3 M3 ×0.95 + final_fall","degraded":false,"sample_rate":44100,
 "duration":87.43,"lead_sec":1.0,"tail_sec":0.8,
 "scenes":[{"id":"hook","start":0.0,"end":12.3,"sentence_ids":["s01","s02"]}],
 "sentences":[{"id":"s01","scene":"hook","text":"…","tts":"…","start":1.0,"end":4.2,"gap":0.6,
    "chars":[{"c":"수","start":1.02,"end":1.15}],
    "alignment":{"source":"mms_forced_alignment","score_mean":0.91},
    "final_fall":{"applied":true},
    "audio":{"raw_mp3":"raw/s01_ab12cd34ef.mp3","npy":"corrected/s01.npy","trim_offset":0.03}}],
 "captions":[{"sentence":"s01","text":"…","start":1.0,"end":2.4}]}
```
Scenes partition [0, duration] contiguously. Also `outputs/<slug>/narration/narration.wav` (44.1 kHz mono) and `captions.srt`.

- `chars`는 `tts`와 같은 길이(공백 포함)이고 시각은 타임라인 절대 초입니다. `{"sentence","word"}` 시간 참조가 이것을 씁니다.
- `degraded: true`면 표준 음성·정렬을 완전히 재현하지 못한 것입니다. `finish.py`는 `--allow-degraded` 없이 거부합니다(내부 미리보기 전용).

## 1시간 작업 체크리스트

| 분 | 할 일 | 결과 확인 |
|---|---|---|
| 0–5 | `python pipeline/new_episode.py <slug> --title "…" [--theme noturno]` | `episodes/<slug>/` |
| 5–15 | `brief.md`: 질문 → 기원·배경 → 본질 → 메커니즘 → 현상 → 오해 → 마지막 한 줄, 소리 사건 표, 단순화 메모 | 과학 근거·단순화가 적혀 있음 |
| 15–22 | `script.json` 합니다체 문장, 숫자·기호는 `tts`로 발음 지정, 장면 id | `narrate` 실행 → `timeline.json`의 `duration` ≤ 180, `degraded:false` |
| 22–45 | `scenes.mjs`: 장면마다 실제로 작동하는 대상, 같은 공간 유지, 라벨·리더선, 비교, 사건 번쩍임 | `run.sh stills` → `contact-sheet.jpg`를 **직접 보고** 고침(반복) |
| 45–50 | `sound.json`: 화면 사건과 같은 `id`·`at`. 필요할 때만 ambient | `sfx.py`가 events.json과 시각 대조(불일치 시 exit 3) |
| 50–55 | `run.sh render sfx mix finish validate` | `validate.py` PASS |
| 55–60 | 완성 MP4를 처음부터 끝까지 보고 듣기(휴대전화 크기·모노), `brief.md` 검증 메모 | 확인한 것/못 한 것 기록 |

## 단계별 단독 실행

```bash
S=<slug>; O=outputs/$S; PY=/home/user/.venv-scishort-render/bin/python
/home/user/.venv-scishort/bin/python pipeline/narration/narrate.py --script episodes/$S/script.json --out $O/narration
node episodes/$S/render.mjs --stills                 # → $O/stills/, $O/events.json   (--safe: 안전 영역 표시)
node episodes/$S/render.mjs --video                  # → $O/visual.mp4 (무음, H.264 crf18 medium, BT.709)
$PY pipeline/audio/sfx.py --sound episodes/$S/sound.json --timeline $O/narration/timeline.json --out $O/sfx.wav \
    --ambient-out $O/ambient.wav --events-check $O/events.json [--no-music]
$PY pipeline/audio/mix.py --narration $O/narration/narration.wav --sfx $O/sfx.wav [--ambient $O/ambient.wav] \
    --timeline $O/narration/timeline.json --out $O/mix.wav [--music assets/music/x.mp3 --music-credit "…" --music-under-db 12 --music-duck-db 6] [--ambient-duck-db 12 --sfx-duck-db 6 --pre 0.25 --post 0.3]
$PY pipeline/audio/finish.py --visual $O/visual.mp4 --mix $O/mix.wav --timeline $O/narration/timeline.json \
    --captions-srt $O/narration/captions.srt --out $O/final/$S.mp4 --title "…" [--max-sec 180] [--allow-degraded]
python3 pipeline/validate.py $O [--max-sec 180]
episodes/$S/run.sh                                   # 위 전체를 순서대로 (단계 이름을 인자로 주면 그 단계만)
```

테스트:
```bash
(cd pipeline/render && npm test)                                         # timeline/captions/3D 단위 테스트
/home/user/.venv-scishort-render/bin/python -m pytest pipeline/audio/tests   # 소리 시각, JS↔Python 참조 일치, 덕킹
/home/user/.venv-scishort-render/bin/python pipeline/render/tests/make_fixture.py --out /tmp/x/narration   # 가짜 내레이션(음성 아님)
```

## 소리 단계 요약

- `sfx.py` 사건 종류: `tick tone noise whoosh swell custom silent`. 공통 `gain_db pan repeat interval delay offset`. 문법·파라미터는 파일 머리말.
- 모두 **합성한 설명용 소리**이며 현상의 녹음이 아닙니다. 필요하면 화면이나 메모에 밝힙니다. ambient는 시드 고정 절차 생성 패드이며 물리와 무관합니다(기본 꺼짐).
- `sfx.py` 이벤트 종류에 `chirp`가 있습니다: `points: [[t_rel, f_hz, amp], …]`로 진동수·진폭이 조각별 선형, 위상 연속인 음. 물리 모형의 진동수 표를 그대로 소리로 바꿀 때 씁니다(중력파 에피소드의 처프). 표는 장면 코드에서 내보내므로 대본이 바뀌면 다시 내보낸 뒤 `sfx`를 돌립니다.
- 자막 배경판은 기본적으로 **없음**(글자 그림자만). 배경이 복잡한 장면에서만 `captionLayout`에 `{plate: true}`(각진 판) 또는 `{plate: 'round'}`를 준다.
- `mix.py`: 내레이션 피크 0.8, 문장 구간(앞 0.25 s 하강, 뒤 0.3 s 회복)에 ambient −12 dB·sfx −6 dB 덕킹, 마스터 피크 ≤ 0.97, 48 kHz 스테레오 float. loudnorm 측정값을 출력.
- **배경음악**: `sound.json`의 `music` 블록(`{"id": "zabriskie_patriarch", "under_db": 12, "duck_db": 6}`)을 `run.sh`가 `pipeline/audio/resolve_music.py`로 `assets/music/registry.json`과 대조(해시 불일치·파일 없음이면 중단)한 뒤 `mix.py --music … --music-credit …`에 넘깁니다. 음악은 4 s 크로스페이드 루프, 1.2 s 페이드인·4 s 페이드아웃, 말할 때 `duck_db`만큼 더 내리고, **말하는 동안 음악 RMS가 내레이션 RMS보다 `under_db` 아래**가 되도록 자동 스케일합니다(osint_generator 최종 영상 실측 약 −12 dB). 표기 문구는 `mix-report.json` → `validation.json`에 기록되며 엔드카드·설명란에 넣어야 합니다. `NO_MUSIC=1`로 생략. 파일 받기와 권리는 [assets/music/README.md](../assets/music/README.md).
- `finish.py` 기본 loudness 목표는 osint_generator 최종 믹스와 같은 **−14 LUFS / TP −1.5 / LRA 11**입니다(이전 −16/−1.5/9). AAC 인코딩 뒤 TP가 0.1~0.2 dB 넘칠 수 있습니다.
- `finish.py`: loudnorm 2-pass(−16 LUFS, −1.5 dBTP, LRA 9), 영상 copy, AAC 192k 48 kHz, `language=kor`, `-t duration`, faststart, 전체 디코드 확인, `<stem>.srt` 복사, `validation.json`.
  `duration > --max-sec`(기본 180) 또는 `degraded`(허용 플래그 없음)이면 exit 2.

## 자동으로 확인되는 것 / 사람이 봐야 하는 것

| 자동 (validate.py, finish.py, sfx.py, 테스트) | 사람이 직접 |
|---|---|
| 길이 ≤ 180초, 1080×1920, 30 fps, yuv420p, H.264, `kor` 오디오, A/V 길이 일치 | 과학 설명이 맞는가, 인과가 화면에서 보이는가 |
| SRT 파싱·순서·겹침·길이 안, 2줄·22자 추정, SRT = timeline.captions(±50 ms) | 자막이 **핵심 현상을 가리지 않는가**(스틸·영상으로 확인) |
| 스틸·contact sheet 존재, `degraded` 표시 | 발음(숫자·용어), 문장 끝 억양, 합성 잡음 |
| 소리 사건 시각 = 화면 사건 시각(events.json 대조), 전체 디코드 | 소리와 화면이 같은 사건으로 **들리고 보이는가**, 음악이 말을 가리는가 |
| loudnorm 측정값, 피크 | 휴대전화 크기에서 라벨이 읽히는가, 모노 재생, 플랫폼 UI와 실제 겹침 |

자동 검사 PASS는 기능 검증입니다. 시청·청취를 대신했다고 기록하지 마세요.
`validation.json`의 `direct_listening`, `physical_phone_playback`은 기본값 `not performed`이며 직접 한 경우에만 바꿉니다.
