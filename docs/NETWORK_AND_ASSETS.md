# 네트워크 허용 목록과 외부 자산

**현재 상태(2026-11-07): 이 프로젝트의 클라우드 환경 `sci_shorts` 는 네트워크 제한이 없습니다(Unrestricted).**
사용자가 환경 설정에서 제한을 해제했고, 같은 날 아래 "2026-11-07 확인" 표의 호스트로 실제 접속을 확인했습니다.
아래 허용 목록 기록은 **제한이 있던 환경에서 무엇이 왜 필요했는지**를 남긴 것입니다. 제한이 다시 걸리거나 다른 환경(Codex 등)에서 작업할 때 이 표를 쓰십시오.

제한이 없다고 해서 아무 호스트나 쓰지 않습니다. 작업에 필요한 곳만 쓰고, 받은 파일은 크기·해시를 대조한 뒤에만 사용합니다.

## 왜 음성이 자꾸 어긋났는가 (기록)

표준 음성은 세 단계가 모두 있어야 재현됩니다. 각 단계는 서로 다른 호스트의 자산을 필요로 합니다.

| 단계 | 필요한 것 | 호스트 | 없으면 생기는 일 |
|---|---|---|---|
| 1. 합성 | Supertonic 3 FP32 모델 8개 파일 | `huggingface.co` + 대용량 CDN, 또는 GitHub 릴리스 미러 | 이전 세션은 HF 차단 때문에 다른 INT8 변환본(speaker 7)을 썼다. 목소리는 비슷하지만 원본 파일이 아니다 |
| 2. 정렬 | MMS 강제 정렬 가중치 1.26GB + torch CPU | `dl.fbaipublicfiles.com`, `download.pytorch.org`, `download-r2.pytorch.org` | 글자 시각을 모르므로 끝 억양 보정과 글자 단위 자막이 불가능하다 |
| 3. 억양 보정 | pyworld(PyPI) + 2단계의 글자 시각 | `pypi.org` | 보정 없이 원음만 남는다. 이전 석영 영상은 어미를 `~요`로 바꿔 보정 대상을 없앴다 |

즉 "목소리가 다르게 들린다"의 원인은 셋이었습니다. 모델 변환본 사용, 억양 보정 미적용, 어미 변경. 현재 파이프라인은 셋 다 되돌렸습니다.

## 2026-11-07 확인 — 제한 해제 뒤 실제 접속

제한이 없는 상태에서 `curl` 로 직접 확인한 결과입니다. 404·400 은 연결이 된 뒤 서버가 준 응답이므로 **열린 것**입니다. 막힌 경우는 `000` 또는 프록시의 CONNECT 거부로 나타납니다.

| 호스트 | 용도 | 2026-11-07 | 제한 환경에서의 과거 상태 |
|---|---|---|---|
| `dl.fbaipublicfiles.com` | MMS_FA `model.pt` (1,262,047,414 B, SHA-1 `0300fd9a…`) | 열림 | 2026-10-30 허용 |
| `download.pytorch.org` | torch/torchaudio 2.8.0+cpu 휠 인덱스 | 열림 | 2026-10-30 허용 |
| `download-r2.pytorch.org` | 위 인덱스가 가리키는 실제 휠 파일 | **열림(404)** | **403 차단** — 휠을 손으로 받아 설치해야 했다 |
| `huggingface.co` | Supertonic 3 원본(revision `3cadd1ee…`) | 열림 | 2026-10-30 허용 |
| `us.aws.cdn.hf.co` | HF 대용량 파일(Xet CDN) 리디렉션 대상 | **열림. 실제로 206 부분 내려받기 확인** | **403 차단** — GitHub 미러로 우회 |
| `cdn-lfs.huggingface.co` | 옛 HF 대용량 CDN | **502(호스트 쪽 사정으로 보임)** | 차단 |
| `archive.org` | 배경음악 트랙(Chris Zabriskie 외) | **열림** | **차단** — "Mario Bava" 트랙 미수령 |
| `www.googleapis.com`, `oauth2.googleapis.com` | 유튜브 업로드·토큰 엔드포인트 | **열림** | 확인한 적 없음 |
| `api.github.com` | GitHub API | **열림(400)** | **403** — 릴리스는 직접 URL로 받았다 |
| `graph.facebook.com`, `developers.facebook.com` | 인스타그램 게시 API와 그 문서 | **열림** | 차단 |
| `cdn.jsdelivr.net`, `raw.githubusercontent.com` | 글꼴 | 열림 | 2026-10-30 허용 |
| `pypi.org`, `files.pythonhosted.org`, `registry.npmjs.org` | 파이썬·Node 패키지 | 열림 | 패키지 관리자 허용으로 열려 있었다 |

`cdn-lfs.huggingface.co` 만 닿지 않습니다. 허깅페이스가 Xet CDN(`us.aws.cdn.hf.co`)으로 옮기면서 접은 것으로 보이며, 정책 문제가 아닙니다. 대체 경로가 열려 있어 쓸 일이 없습니다.

### 제한 해제로 달라진 것

- **torch 설치**: `pipeline/narration/README.md` 의 "휠을 손으로 받아 설치" 우회가 더는 필요 없습니다. `pip install -r pipeline/narration/requirements.txt` 한 줄로 끝납니다. 그 우회 절차는 제한 환경을 위해 문서에 남겨 둡니다.
- **Supertonic 원본**: `fetch_assets.py --source hf` 로 허깅페이스에서 직접 받을 수 있습니다. 기본값은 여전히 GitHub 미러(`--source github`)이며, 둘 다 같은 8개 파일이고 해시로 대조합니다.
- **배경음악**: `assets/music/registry.json` 의 archive.org URL 을 이제 받을 수 있습니다. 다만 **배경음악 기본 꺼짐은 2026-10-31 사용자 결정이며 그대로입니다.** 받을 수 있다는 것과 쓴다는 것은 다릅니다.
- **유튜브 업로드**: 업로드·토큰 엔드포인트가 닿습니다. 비밀값만 있으면 이 환경에서 실제 비공개 업로드를 시험할 수 있습니다(`docs/YOUTUBE_AUTO_UPLOAD.md`).

## Higgsfield (AI 생성 클립, 선택)

2026-10-31 사용자가 `*.higgsfield.ai` 를 허용했습니다. 공식 API 문서는 `docs.higgsfield.ai/docs`(마크다운은 각 경로 뒤에 `.md`), 키 발급은 `console.higgsfield.ai`, 호출은 `api.higgsfield.ai` 입니다.
자격 증명은 키 ID와 시크릿 한 쌍이며 환경 secret `HF_API_KEY_ID`, `HF_API_KEY_SECRET` 으로만 둡니다. 클라이언트는 `pipeline/genvideo/higgsfield.py`, 결과 보관 원칙은 `assets/generated/README.md`.

## 제한이 있는 환경에서 (Codex 등)

환경 설정의 Network access 에서 Limited 를 고르고 Allowed domains 에 위 표의 호스트를 넣습니다. 패키지 관리자 허용 상자는 켜 둡니다.
**저장만 하면 적용되지 않을 수 있습니다.** 새 세션에서 아래로 실제 접속을 확인하십시오.

```bash
for h in dl.fbaipublicfiles.com download.pytorch.org download-r2.pytorch.org huggingface.co us.aws.cdn.hf.co; do
  printf '%-28s ' "$h"; curl -sS -o /dev/null -I --max-time 15 -w '%{http_code}\n' "https://$h/" || true
done
```

`000` 이나 `CONNECT tunnel failed, response 403` 이면 아직 막힌 것입니다. 2xx·3xx·4xx 는 모두 연결된 것입니다.

막힌 호스트를 우회하지 않습니다. 대체 경로는 **같은 파일임을 해시로 증명할 수 있을 때만** 씁니다.

## 자산 보관 원칙

- 모델 가중치·글꼴 바이너리·가상환경은 Git 에 넣지 않습니다. `/models/`, `/assets/fonts/*.ttf` 등은 `.gitignore` 에 있습니다.
- 받은 파일은 크기와 해시를 대조한 뒤에만 사용합니다. 기준값은 `config/voice-reference.json` 과 `pipeline/narration/assets.json` 에 있습니다.
- 라이선스: Supertonic 코드 MIT, 가중치 OpenRAIL-M(사용 제한 조항 있음), **MMS 가중치 CC BY-NC 4.0(비상업)**, Noto·IBM Plex OFL, GmarketSans 는 지마켓 무료 글꼴 약관. 공개·수익화 범위를 정할 때 MMS 의 비상업 조건을 다시 검토합니다.
