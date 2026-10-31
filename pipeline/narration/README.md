# pipeline/narration — 표준 한국어 내레이션

`doroper98/osint_generator`의 최종 영상과 같은 표준 음성을 이 저장소의 과학 영상에 만듭니다.

**Supertonic 3 · M3 · speed 0.95 · 16 steps · 문장별 시드** → **MMS 강제 정렬(torchaudio MMS_FA + uroman, 문장 점수 ≥ 0.62)**
→ **final_fall**(발음 텍스트가 `니다`로 끝나면 마지막 3글자 구간을 0 → −4반음 선형 하강, WORLD/pyworld, 옥타브 오류 정리)
→ **trim(y, ref=원음)** → 타임라인·자막·`narration.wav`.

설정값은 `config/voice-reference.json` 하나에서 읽습니다. 이 파일은 바꾸지 않습니다. 다른 목소리·모델 변형(예: `samples/quartz`의 sherpa-onnx INT8 빌드)으로 대체하지 않습니다.

## 설치

```bash
python3 -m venv ~/.venv-scishort
~/.venv-scishort/bin/pip install -r pipeline/narration/requirements.txt
```

- Python 3.13.17에서 확인했습니다. `pyworld==0.3.5`는 3.13 휠이 없어 소스로 빌드되며(C 컴파일러 필요), import 때 `pkg_resources`를 쓰므로 `setuptools<81`을 고정했습니다.
- `torch==2.8.0`/`torchaudio==2.8.0` 고정: torchaudio 2.9에서 `forced_align`이 제거됩니다. requirements의 `--extra-index-url`로 CPU 휠(약 185 MB)을 받습니다. 이 인덱스가 없으면 리눅스에서는 CUDA 휠(수 GB)이 설치됩니다.
- **Claude 클라우드 샌드박스:** `download.pytorch.org/whl/cpu/torch/` 인덱스는 휠 링크를 `download-r2.pytorch.org`로 주며, 이 호스트는 막혀 있습니다. 같은 경로를 `download.pytorch.org`에서 받으면 됩니다. 인덱스에 적힌 sha256을 확인한 뒤 로컬 휠을 설치합니다.

  ```bash
  D=$(mktemp -d); cd "$D"
  for p in torch torchaudio; do
    l=$(curl -sS https://download.pytorch.org/whl/cpu/$p/ | grep -o "href=\"[^\"]*$p-2.8.0%2Bcpu-cp313-cp313-manylinux_2_28_x86_64[^\"]*\"" | head -1)
    u=$(echo "$l" | sed -E 's/href="([^#]*)#.*/\1/; s#download-r2.pytorch.org#download.pytorch.org#'); h=$(echo "$l" | sed -E 's/.*sha256=([0-9a-f]+)".*/\1/')
    f=$(basename "$u" | sed 's/%2B/+/'); curl -sSfL -o "$f" "$u" && echo "$h  $f" | sha256sum -c -
  done
  ~/.venv-scishort/bin/pip install ./torch-2.8.0+cpu-*.whl ./torchaudio-2.8.0+cpu-*.whl
  ~/.venv-scishort/bin/pip install -r /path/to/sci_short/pipeline/narration/requirements.txt
  ```

- ffmpeg/ffprobe가 PATH에 있어야 합니다. mp3 인코딩·디코딩에 사용합니다.

## 모델 받기

```bash
~/.venv-scishort/bin/python pipeline/narration/fetch_assets.py --supertonic          # 370 MB zip → 8 files, sha1 대조
~/.venv-scishort/bin/python pipeline/narration/fetch_assets.py --mms                 # 1,262,047,414 B, 크기+sha1 대조
~/.venv-scishort/bin/python pipeline/narration/fetch_assets.py --all | --check
#   --source github|hf   (기본 github)   --models-dir DIR (기본 <repo>/models, 환경변수 SCISHORT_MODELS)   --keep-zip
```

모델은 `models/supertonic-3/…`와 `models/mms_fa/model.pt`에 둡니다. `/models/`는 gitignore 대상입니다.
출처·크기·해시는 `assets.json`에 있으며 `config/voice-reference.json`과 일치해야 실행됩니다.
이미 맞는 파일은 다시 받지 않고, 중간에 끊긴 `.part`는 이어받습니다. 실패하면 막힌 호스트 이름을 출력하고 0이 아닌 코드로 끝납니다.

| 자산 | 출처(순서) | 필요한 호스트 |
|---|---|---|
| Supertonic 3 (HF revision `3cadd1ee…`의 8개 파일) | ① 사용자 GitHub 릴리스 zip `tts-assets-supertonic3-v1` | `github.com`, `release-assets.githubusercontent.com` |
| | ② `huggingface.co/Supertone/supertonic-3/resolve/<rev>/<rel>` | `huggingface.co` + 큰 파일 CDN(`us.aws.cdn.hf.co`(Xet, 2026-10 확인) 또는 `cdn-lfs.huggingface.co`) |
| MMS_FA `model.pt` | `dl.fbaipublicfiles.com/mms/torchaudio/ctc_alignment_mling_uroman/model.pt` | `dl.fbaipublicfiles.com` |
| Python 패키지 | PyPI, PyTorch CPU 인덱스 | `pypi.org`, `files.pythonhosted.org`, `download.pytorch.org` |

## 실행

```bash
~/.venv-scishort/bin/python pipeline/narration/narrate.py \
  --script episodes/<slug>/script.json --out outputs/<slug>/narration \
  [--max-sec 180] [--max-chars 18] [--skip-alignment] [--models-dir DIR]
```

예시: `pipeline/narration/examples/smoke.script.json`(3문장, 장면 hook/mechanism/close).
테스트: `~/.venv-scishort/bin/python -m pytest -q pipeline/narration/tests`. Supertonic 자산이 있으면 실제 합성 통합 테스트도 함께 실행됩니다.

### script.json (v1)

```json
{"title":"…","language":"ko","lead_sec":1.0,"tail_sec":0.8,"scene_lead_sec":0.4,"default_gap_sec":0.6,
 "sentences":[{"id":"s01","scene":"hook","text":"표시용 문장입니다.","tts":"선택: 발음용 문장입니다.","gap":0.8}]}
```

- `text` = 화면 자막, `tts` = 발음 텍스트입니다. `tts`를 생략하면 `pronounce.auto_tts(text)`를 사용합니다. 숫자·소수·%·음수와 짧은 단위 표만 바꿉니다.
- 발음 텍스트에 숫자, 라틴 문자, `% ~ / : →`, 괄호·대괄호, `° μ`, 하이픈 등이 남으면 합성 전에 오류가 납니다(`lint_tts`).
- 한자어 수는 붙여 씁니다(백육십). 소수점은 표준 표기 **“점”**(2.45 → 이 점 사오)이며, 근거는 원 저장소 TTS-AP-061과 docs/NARRATION_AND_CAPTIONS.md입니다.
  6월·10월은 유월·시월로 읽습니다. 고유어 수사가 필요한 수량(14명, 3개, 2번…)과 복합 단위(km/s → “초속 … 킬로미터”)는 자동으로 바꾸지 않습니다. 대본에 `tts`를 직접 씁니다.
- 모르는 키는 오류입니다. 메모는 `"notes"`에 씁니다. id·scene은 `[A-Za-z0-9_-]`만 쓰고, 같은 scene의 문장은 연속해야 합니다.
- 옛 `segments` 형식(samples/quartz)은 받지 않습니다.

### 출력 (`--out`)

| 파일 | 내용 |
|---|---|
| `narration.wav` | 44100 Hz mono PCM_24, 전체 피크 0.8로 정규화, 시간 압축 없음 |
| `timeline.json` | 렌더러 계약 v1(아래) |
| `captions.srt` | 큐 단위 SRT |
| `provenance.json` | 문장별 지문·시드·조각·정렬 점수·final_fall(원본 mp3 축)·모델 해시·라이브러리 버전·degraded·시간 |
| `raw/<id>_<key>.mp3` (+`.provenance.json`, `.align.json`) | 합성 원음(캐시). key = `sha1(tts + cache_salt)[:10]`(원 `cache.py`와 같음) |
| `corrected/<id>.npy` (+`.processing.json`) | 제품 음성: final_fall → trim, 44.1k float32 |

캐시: mp3는 지문(발음 텍스트·전체 음성 설정·cache_salt·시드·MP3 인자)과 파일 sha256이 같을 때만 다시 씁니다.
`.align.json`은 글자·mp3 sha256·MMS 가중치 sha1·min_score가 같을 때만, npy는 원음 sha·정렬·final_fall 설정·트림 상수가 같을 때만 재사용합니다.

**timeline.json 규칙**
- 문장은 `lead_sec`에서 시작해 차례로 놓입니다. 각 문장 뒤에는 `gap`(없으면 `default_gap_sec`)을 둡니다. 마지막 문장 뒤에는 gap 대신 `tail_sec`을 두며, `duration` = 마지막 끝 + `tail_sec`입니다.
  `sentences[].gap`에는 대본 값을 기록합니다. 마지막 문장의 gap은 적용되지 않습니다.
- 장면 k 시작 = max(앞 장면 마지막 문장 끝, 첫 문장 시작 − `scene_lead_sec`)입니다. 첫 장면은 0에서 시작하고, 장면 끝은 다음 장면 시작이며, 마지막 장면 끝은 `duration`입니다.
- `chars`는 **발음 텍스트의 모든 글자(공백·문장부호 포함)**를 담으며 `tts[i]`와 순서가 같습니다. 시각은 타임라인 절대값(문장 시작 + 정렬 시각 − trim_offset, 문장 구간으로 제한)입니다. degraded이면 `[]`입니다.
- `final_fall.region_sec`은 **타임라인 절대 시각**으로 바꿔 기록합니다. 원본 mp3 축의 값(원 저장소 plan row와 같은 축)은 provenance의 `final_fall_raw_axis`에 있습니다.
- 자막 큐: 공백에서만 자르고, 큐 하나는 공백 제외 18자(`--max-chars`) 이하입니다. 큐 수를 최소로 하면서 쉼표 → 연결 어미(…고/…며/…면서 등) 경계를 우선합니다.
  시각은 큐 첫/마지막 글자에 대응하는 발음 글자의 정렬 시각입니다. 표시·발음 텍스트가 다르면(`2.45 GHz` ↔ `이 점 사오 기가헤르츠`) 공통 글자를 1:1로 고정하고, 사이 구간은 순서대로 비례 대응합니다.
  최소 0.3초이며 큐끼리 겹치지 않습니다.

길이가 `--max-sec`(기본 **180초**)을 넘으면 `대본을 줄이세요. 음성을 가속하지 않습니다.`를 출력하고 종료 코드 3으로 끝납니다. 이때 `timeline.json`·`provenance.json`만 남기고 `narration.wav`는 만들지 않습니다.

## degraded 모드(`--skip-alignment`)

정렬·final_fall을 하지 않고, 자막 시각은 문장 구간 [start+0.03, end−0.12] 안에서 표시 글자 수에 비례해 정합니다.
`timeline.voice` = `"supertonic-3 M3 ×0.95 (UNALIGNED, final_fall not applied)"`, `degraded: true`이며, 시작·끝에 경고 배너를 출력합니다.
**표준 음성이 아닙니다.** 대본·길이 확인용이며 최종 영상은 기본 경로로 다시 만들어야 합니다.
기본 경로에서 MMS 가중치·torch·uroman·pyworld가 없으면 조용히 degraded로 내려가지 않고 오류를 냅니다. 오류 메시지에 허용할 호스트와 실행할 명령이 나옵니다.

## 출처(provenance)

옮긴 코드는 `https://github.com/doroper98/osint_generator` commit `131db0097a547a3fd0742488540eedc229017073`입니다. 이 commit의 `script/tts/*`는 이전 제작에 쓴 `7d85942e…`와 같습니다.
각 파일 머리에 원본 경로와 바뀐 점을 적었습니다.

| 이 저장소 | 원본 | 차이 |
|---|---|---|
| `supertonic_runtime.py` | `script/tts/supertonic_runtime.py` | 머리 주석 외 바이트 동일(MIT 고지 포함) |
| `synth.py` | `supertonic.py`, `supertonic_assets.py`, `cache.py` | 설정 출처·자산 폴더·mp3를 `.part` 뒤 이름 바꾸기 |
| `forced_align.py` | `forced_align.py`, `align.py` | 설정 출처, 크기 검사, 호스트 안내, `lru_cache` → 같은 효과의 dict, align.json에 재사용 판정 필드 추가 |
| `prosody.py` | `prosody.py`, `schemas/rules_models.py` | `FinalFallRecord` pydantic → dataclass; 계산 동일 |
| `trim.py` | `trim.py` | `trim_to_npy`의 출력 경로 인자 |
| `voice_config.py` | `config.yaml`·`video_rules.yaml`·`rules_models.py` | dataclass, `min_score 0.62`는 원 rules 값 상수 |

처리 순서는 원 `script/plan.py build()`와 같습니다. 합성 → 정렬(mp3를 16 kHz로 디코드) → 44.1 kHz 디코드 → final_fall → trim(ref=원음) 순서입니다.

## 라이선스 주의

- Supertonic 코드는 MIT, 가중치는 BigScience OpenRAIL-M입니다(`models/supertonic-3/LICENSE`).
- **MMS_FA 가중치는 원 저장소에 CC-BY-NC 4.0으로 기록되어 있습니다.** 공개·수익화 전에 정렬 도구의 사용 조건을 확인하세요(docs/NARRATION_AND_CAPTIONS.md).

## 확인하지 않은 것

코드 실행과 수치(정렬 점수, f0 기록, ffprobe)만 확인했습니다. **사람이 들어 보는 청취 검사는 하지 않았습니다.** 숫자·단위 발음과 문장 끝 억양은 실제 결과를 들어 보고 판단해야 합니다.
