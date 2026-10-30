# 네트워크 허용 목록과 외부 자산

2026-10-30, Claude 클라우드 세션에서 프록시를 통해 직접 접속을 시험한 결과입니다.
Codex 환경은 정책이 다를 수 있으므로 새 환경에서는 아래 표의 호스트를 같은 방법으로 다시 확인합니다.

## 왜 음성이 자꾸 어긋났는가

표준 음성은 세 단계가 모두 있어야 재현됩니다. 각 단계는 서로 다른 호스트의 자산을 필요로 합니다.

| 단계 | 필요한 것 | 호스트 | 없으면 생기는 일 |
|---|---|---|---|
| 1. 합성 | Supertonic 3 FP32 모델 8개 파일 | `huggingface.co` 또는 **GitHub 릴리스 미러** | 이전 세션은 HF 차단 때문에 다른 INT8 변환본(speaker 7)을 썼다. 목소리는 비슷하지만 원본 파일이 아니다 |
| 2. 정렬 | MMS 강제 정렬 가중치 1.26GB + torch CPU | `dl.fbaipublicfiles.com`, `download.pytorch.org` | 글자 시각을 모르므로 끝 억양 보정과 글자 단위 자막이 불가능하다 |
| 3. 억양 보정 | pyworld(PyPI) + 2단계의 글자 시각 | `pypi.org` | 보정 없이 M3 원음만 남는다. 이전 석영 영상은 어미를 `~요`로 바꿔 보정 대상을 없앴다 |

즉 "목소리가 다르게 들린다"는 문제의 원인은 셋입니다. 모델 변환본 사용, 억양 보정 미적용, 어미 변경. 이번 파이프라인은 셋 다 되돌립니다.

## 허용이 필요한 호스트

| 호스트 | 용도 | 이 세션 상태 | 필수 여부 |
|---|---|---|---|
| `dl.fbaipublicfiles.com` | MMS_FA `model.pt` (1,262,047,414 B, SHA-1 `0300fd9a…`) | 2026-10-30 허용됨. 다운로드 47초 | **필수** |
| `download.pytorch.org` | `torch==2.8.0+cpu`, `torchaudio==2.8.0+cpu` 휠 인덱스 | 2026-10-30 허용됨 | **필수**. PyPI 기본 휠은 CUDA 포함으로 수 GB |
| `download-r2.pytorch.org` | 위 인덱스가 실제 휠 파일을 가리키는 호스트 | 403 차단 | **필수에 가깝다.** 막혀 있으면 `download.pytorch.org`의 같은 경로를 curl로 받아 로컬 설치(`pipeline/narration/README.md`) |
| `huggingface.co`, `us.aws.cdn.hf.co` | Supertonic 3 원본(revision `3cadd1ee…`). 대용량 파일은 `us.aws.cdn.hf.co`로 리디렉션 | 전자 허용, 후자 403 | 선택. GitHub 미러로 대체 가능 |
| `cdn.jsdelivr.net` | 르포 템플릿이 쓰는 GmarketSans woff | 2026-10-30 허용됨 | 선택. `raw.githubusercontent.com`의 원 저장소로도 가능 |

사용자가 2026-10-30에 `dl.fbaipublicfiles.com`, `download.pytorch.org`, `huggingface.co`, `cdn.jsdelivr.net`을 허용했고 같은 날 접속을 확인했습니다. 추가로 `download-r2.pytorch.org`를 허용하면 pip 한 줄로 torch를 설치할 수 있습니다.

## 이미 허용되어 쓰고 있는 호스트

| 호스트 | 용도 |
|---|---|
| `github.com` → `release-assets.githubusercontent.com` | 사용자 릴리스 `doroper98/prismatic_nplm_git` `tts-assets-supertonic3-v1`의 Supertonic 3 FP32 zip(370,277,184 B, SHA-256 `842e9f83…`). osint_generator와 같은 8개 파일 |
| `raw.githubusercontent.com` | 글꼴: `google/fonts`의 IBM Plex Sans KR·Noto Sans KR·Noto Serif KR, `projectnoonnu/noonfonts_2001` master 브랜치의 GmarketSans woff |
| `pypi.org`, `files.pythonhosted.org` | onnxruntime, pyworld, uroman, numpy, scipy, soundfile 등 |
| `registry.npmjs.org` | `@napi-rs/canvas` |
| `fonts.googleapis.com` | CSS만 응답. 글꼴 파일 호스트 `fonts.gstatic.com`은 별도 확인 필요 |

`api.github.com`은 403입니다. 릴리스 자산은 API가 아니라 `github.com/<owner>/<repo>/releases/download/...` 직접 URL로 받습니다.

## 설정 위치

클라우드 환경 설정의 Network access에서 Limited 수준을 고르고 Allowed domains에 위 "필수" 호스트를 추가합니다. 패키지 관리자 허용 상자는 켜 둡니다.
저장만 하면 적용되지 않습니다. 이전 세션 기록처럼 **초안 저장과 실제 적용이 다를 수 있으므로**, 새 세션에서 아래 명령으로 실제 접속을 확인합니다.

```bash
for h in dl.fbaipublicfiles.com download.pytorch.org huggingface.co; do
  printf '%-28s ' "$h"; curl -sS -o /dev/null -I --max-time 15 -w '%{http_code}\n' "https://$h/" || true
done
```

`000`이나 `CONNECT tunnel failed, response 403`이 나오면 아직 막힌 것입니다.

## 자산 보관 원칙

- 모델 가중치·글꼴 바이너리·가상환경은 Git에 넣지 않습니다. `/models/`, `/assets/fonts/*.ttf` 등은 `.gitignore`에 있습니다.
- 받은 파일은 크기와 해시를 대조한 뒤에만 사용합니다. 기준값은 `config/voice-reference.json`과 `pipeline/narration/assets.json`에 있습니다.
- 라이선스: Supertonic 코드 MIT, 가중치 OpenRAIL-M(사용 제한 조항 있음), MMS 가중치 CC BY-NC 4.0(비상업), Noto·IBM Plex OFL, GmarketSans는 지마켓 무료 글꼴 약관. 공개·수익화 범위를 정할 때 MMS의 비상업 조건을 다시 검토합니다.
- 차단된 호스트를 우회하지 않습니다. 대체 경로는 같은 파일임을 해시로 증명할 수 있을 때만 씁니다.
