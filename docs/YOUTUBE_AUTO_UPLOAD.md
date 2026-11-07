# 유튜브 쇼츠 자동 업로드 체계 (비공개 업로드 → 사용자가 공개 전환)

최종본 보관함 `finals/<번호>-<slug>/` 의 영상을 채널에 **항상 비공개(private)** 로 자동 업로드합니다. 공개 전환은 사용자가 YouTube Studio 에서 직접 합니다.
업로드 값(카테고리·자막·아동용·합성 표시)은 [업로드 공통 설정](YOUTUBE_UPLOAD.md)의 사용자 결정과 각 편의 `upload.md` 를 그대로 따릅니다.
참고 세션(osint_generator `publish/youtube.py`, 2026-11-03)의 설계를 이 저장소에 맞게 독립 도구로 옮겼습니다.

기록일 2026-11-05. **실제 업로드는 아직 0건**입니다(비밀값·채널 결정 전). 아래 "미시험·미결" 참고.

## 한눈에 보기

```text
[제작]  skills/science-short 7단계 → finals/<NN>-<slug>/ (mp4 · upload.md · thumbnail/poster.jpg · srt …)
   │   브랜치 커밋 → PR (ci: 단위 시험 + 바뀐 편 dry-run 검증)
   ▼
[승인]  사용자가 PR 을 main 에 병합  ← 이것이 "올려도 된다"는 신호
   ▼
[자동]  GitHub Actions youtube-upload — 그 push 에서 바뀐 finals 폴더만
        토큰 갱신 → 채널 확인(channel_id) → 재개 가능 업로드(비공개) → 썸네일 → (선택) 자막
        → finals/<ep>/youtube_upload.json 커밋 → 이슈 "공개 전환 대기: <제목> (<video id>)"
   ▼
[사람]  YouTube Studio 에서 확인 → 공개(또는 예약 공개) → 고정 댓글·관련 동영상(upload.md) → 이슈 닫기
[주간]  youtube-token-check: 토큰 생존·채널 일치 확인, 문제면 이슈
```

| 경로 | 역할 |
|---|---|
| `publish/youtube.py` | 업로더 CLI. 표준 라이브러리만 사용. `--dry-run` `--all` `--list` `--whoami` `--mark-uploaded` |
| `publish/oauth.py` | 리프레시 토큰 1회 발급(사용자 PC, 루프백 OAuth + PKCE). **프로덕션 게시 확인 없이는 발급 거부** |
| `config/youtube.json` | 채널 공통 설정. `privacy_status` 는 `private` 만 허용 |
| `finals/<NN>-<slug>/upload.md` | 제목 / 설명 / 태그(기존 규약 그대로). 두 형식(태그 한 줄 · 태그 블록) 모두 읽음. **'인스타그램(릴스) 설명' 블록은 유튜브에 올라가지 않습니다** — 머리말이 `제목`·`설명`·`태그` 와 정확히 일치할 때만 읽습니다 |
| `finals/<NN>-<slug>/youtube_upload.json` | 업로드 기록(도구가 씀). 영상 ID·URL·md5·채널·시각 |
| `.github/workflows/youtube-upload.yml` | main 의 `finals/**` 변경 → 바뀐 편만 비공개 업로드 → 기록 커밋 → 이슈. 수동 실행은 한 편 또는 전체 |
| `.github/workflows/youtube-token-check.yml` | 매주 월요일 09:17 KST 토큰 점검 |
| `.github/workflows/ci.yml` | 단위 시험 + 바뀐 편 dry-run |
| `.github/scripts/changed_finals.py` | push 범위에서 바뀐 finals 폴더 계산(기록만 바뀐 폴더 제외) |
| `.github/scripts/youtube_report.py` | 작업 요약·이슈 생성 |
| `docs/youtube-app/` | OAuth 앱 게시용 홈페이지·개인정보처리방침(GitHub Pages) |
| `tests/test_publish_youtube.py` | 비밀값·네트워크 없이 도는 단위 시험(실제 13편 `upload.md` 파싱 포함) |

## 장기 토큰 원칙 (7일 만료 토큰을 쓰지 않는다)

사용자 지시(2026-11-05): 7일 뒤 만료되는 토큰이 아니라 오래 유지되는 토큰을 쓴다.

- Google OAuth 앱이 **외부 + '테스트 중'** 이면 리프레시 토큰이 **7일** 뒤 만료됩니다.
- 앱을 **'프로덕션'으로 게시**하면 토큰은 철회·비밀번호 변경·6개월 미사용 전까지 유지됩니다.
- 토큰은 **게시가 끝난 뒤** 받습니다. 테스트 중에 받은 토큰은 게시해도 7일 만료가 그대로입니다.
- `publish/oauth.py` 는 게시 상태가 프로덕션임을 확인(`--production` 또는 프롬프트 y)해야 발급을 진행합니다. `--allow-testing` 은 알고도 7일 토큰을 받을 때만 쓰는 비상용 옵션입니다.
- 주간 `youtube-token-check` 가 토큰이 죽으면 이슈로 알립니다. 업로드가 `invalid_grant` 로 멈추면 같은 원인입니다.

게시(프로덕션 전환)에는 **앱 홈페이지 URL·개인정보처리방침 URL·승인된 도메인**이 필요합니다.

| 길 | 내용 | 현재 상태 |
|---|---|---|
| **B. sci_short 전용 (권장)** | 이 저장소 `docs/youtube-app/` 을 GitHub Pages 로 배포하고, 그 주소를 브랜딩에 넣는다 | 저장소는 공개. **Pages 는 아직 꺼져 있다.** PR 병합 뒤 Settings → Pages → `main` / `docs` 로 켠다 |
| A. osint_generator 앱 재사용 | 그 저장소의 페이지(`osint-generator.vercel.app/youtube-app`)를 쓰고 이 채널 토큰만 새로 받는다 | **2026-11-07 확인: 두 주소 모두 404.** 그 저장소에서 페이지를 main 에 병합·배포해야 쓸 수 있다 |

2026-11-07 확인 결과 A 안의 페이지가 열리지 않아 **B 안을 기준으로 합니다.**

같은 Google 계정이 두 채널을 소유하면 A 로 충분합니다. 리프레시 토큰은 **동의할 때 고른 채널**에 묶이므로 채널만 다르게 고르면 됩니다.

## 1회 설정 절차

### 1) Google Cloud (브라우저)

1. 프로젝트 선택(A: 기존 / B: 새 프로젝트). `console.cloud.google.com/apis/library/youtube.googleapis.com` 에서 **YouTube Data API v3 사용**.
2. Google 인증 플랫폼 → **브랜딩**: 앱 이름, 지원 이메일, 앱 홈페이지, 개인정보처리방침, 승인된 도메인.
   - 저장소 Settings → Pages → Deploy from a branch, `main` / `/docs` 로 배포한 뒤:
     (`docs/.nojekyll` 이 있어야 밑줄로 시작하는 `_style.css` 가 404 가 되지 않습니다. 이미 넣어 두었습니다.)
     - 앱 홈페이지 `https://doroper98.github.io/sci_short/youtube-app/`
     - 개인정보처리방침 `https://doroper98.github.io/sci_short/youtube-app/privacy.html`
     - 승인된 도메인 `doroper98.github.io`
   - **주소 두 개가 실제로 열리는지 먼저 확인하십시오.** 구글이 접속해 봅니다.
3. **대상** → **앱 게시** → 프로덕션.
   - `youtube.upload` 은 구글이 **민감한 범위**로 분류합니다. 심사를 받지 않은 앱은 **신규 사용자 100명 상한**이 붙습니다(구글 공식 FAQ). 1인용이라 문제가 없습니다.
   - 동의할 때 "확인되지 않은 앱" 경고가 한 번 뜹니다. 고급 → 이동 → 허용.
   - **심사(verification)는 받지 않아도 됩니다.** 받으면 몇 달 걸릴 수 있고, 100명 상한이 풀릴 뿐입니다.
   - 심사 제출을 강제하는 화면이 나오면 캡처를 다음 세션에 보여 주십시오.
4. **클라이언트** → 만들기 → 유형 **데스크톱 앱**. ID·비밀값은 채팅에 붙이지 말고 다음 단계에서 터미널에만 넣습니다. (기존 '웹 애플리케이션' 클라이언트를 쓰려면 승인된 리디렉션 URI 에 `http://127.0.0.1:8765/` 추가.)

### 2) 토큰 발급 (사용자 PC, 1회)

```bash
git clone https://github.com/doroper98/sci_short && cd sci_short
python -m publish.oauth --production --write-env .env
```

- 브라우저가 열리면 채널을 소유한 Google 계정으로 로그인하고, 채널이 여럿이면 **과학 쇼츠 채널**을 고릅니다.
- "확인되지 않은 앱" 경고 → 고급 → 이동 → 허용.
- 끝나면 터미널에 채널 이름과 ID(UC…)가 나옵니다. 이 ID 를 `config/youtube.json` 의 `channel_id` 에 넣으십시오.
- `.env` 는 저장소가 무시하는 파일입니다. 커밋하지 마십시오.

### 3) 비밀값 저장

| 어디서 올리나 | 저장 위치 |
|---|---|
| GitHub Actions(기본 자동화) | 저장소 Settings → Secrets and variables → Actions → `YT_CLIENT_ID` `YT_CLIENT_SECRET` `YT_REFRESH_TOKEN` |
| Claude 클라우드 세션 | 환경 설정의 환경 변수(저장 뒤 새 세션부터 읽힘) |
| 로컬 PC | `.env` + `--env-file .env` |

### 4) 설정 확정 (`config/youtube.json`)

| 키 | 결정 |
|---|---|
| `made_for_kids` | **결정 완료: `false`(아동용 아님, 2026-11-07).** 주 시청자가 약 11~16세이고 13세 미만 어린이를 주 대상으로 하지 않기 때문입니다. 편마다 `meta.json` 으로 바꿀 수 있습니다 |
| `channel_id` | 토큰 발급 때 나온 UC… 값. 다른 채널로 올라가는 사고를 막습니다 |
| `category_id` | 27 교육(공통 설정과 같음) |
| `upload_captions` | false(공통 설정: SRT 는 올리지 않음). 편별 `--caption` 가능 |
| `upload_thumbnail` | true. `thumbnail.jpg`(없으면 0초 프레임 `poster.jpg`)를 `thumbnails.set` 으로 시도. 채널이 맞춤 썸네일을 못 쓰면 경고로 남기고 Studio 에서 고르십시오 |
| `contains_synthetic_media` | true(AI 합성 내레이션). 공통 설정의 판단대로 꺼도 됩니다 |

### 5) 백로그 처리 — 이미 손으로 올린 편 등록

13편 가운데 이미 채널에 올린 편이 있으면 먼저 기록해 두어야 자동화가 건너뜁니다.

```bash
python -m publish.youtube finals/01-gravitational-waves --mark-uploaded <video id>
```

기록이 없는 편은 수동 실행(Actions → youtube-upload → `all=true`)으로 한 번에 비공개 업로드할 수 있습니다. 하루 업로드 한도는 100회입니다.

### 6) 첫 시험

```bash
python -m publish.youtube --whoami --env-file .env            # 채널 이름·ID 확인
python -m publish.youtube finals/13-gamma-ray-burst --dry-run # 검증만
python -m publish.youtube finals/13-gamma-ray-burst --env-file .env   # 비공개 업로드 1건
```

## 운영

- **승인 신호 = main 병합.** 새 편의 `finals/<NN>-<slug>/` 가 들어온 PR 을 병합하면 Actions 가 그 편만 올립니다. 같은 폴더를 덮어써 다시 만든 편은 md5 가 달라져 멈추며, 새 영상으로 올리려면 수동 실행 전에 `youtube_upload.json` 을 지우거나 `--allow-reupload` 를 씁니다(이전 영상은 유튜브에 남음).
- **공개 전환 = 이슈 처리.** 업로드마다 `youtube-review` 라벨 이슈가 생깁니다. Studio 에서 확인·공개하고 `upload.md` 의 고정 댓글·관련 동영상을 넣은 뒤 닫습니다.
- **수동 실행.** Actions → youtube-upload → Run workflow. `episode` 한 폴더, 또는 `all=true`. `dry_run` 으로 검증만.
- **멱등.** `youtube_upload.json` 이 있고 md5 가 같으면 건너뜁니다. 재실행이 안전합니다.
- **자막·썸네일 실패**는 영상 기록을 남기고 경고로 보고합니다(영상은 올라간 상태).
- **쇼츠 분류.** 세로·정방형이고 180초 이하면 유튜브가 자동으로 쇼츠로 분류합니다. 13편 모두 1080×1920, 160~179초입니다.
- **할당량(2026-11-03 공식 문서 확인).** videos.insert 는 별도 버킷 하루 100회. captions.insert 400단위, thumbnails.set 50단위, channels.list 1단위(기본 하루 10,000단위). 초과 시 `quotaExceeded` 로 멈추고 태평양 시간 자정(KST 오후 4~5시) 뒤 다시 됩니다.
- **로컬·클라우드 세션에서 직접** 올릴 수도 있습니다: `python -m publish.youtube finals/<ep> --env-file .env`.

## 안전장치

| 위험 | 장치 |
|---|---|
| 실수로 공개 업로드 | `privacy_status` 가 private 이외면 설정 로드 실패. 요청 본문도 항상 `private` 고정 |
| 다른 채널에 업로드 | 업로드 전 `channels.list` 로 확인, `channel_id` 불일치면 중단. 기록에 채널 이름 저장 |
| 백로그 일괄 업로드 사고 | push 트리거는 바뀐 폴더만. 전체는 수동 `all=true` 에서만. 손으로 올린 편은 `--mark-uploaded` |
| 같은 영상 두 번 | md5 기록으로 건너뜀. 동시 실행은 Actions concurrency 로 직렬화 |
| 토큰 조용히 만료 | 테스트 상태 발급 거부 + 주간 점검 이슈 |
| 비밀값 유출 | 환경 변수만 읽음. 로그·기록·커밋에 값 없음. `.env` 는 gitignore |
| API 거부 | 제목 100자·설명 5000바이트·`<>`·태그 500자·아동용 선언 누락을 업로드 전에 검사(실제 13편 `upload.md` 는 모두 통과) |
| 쇼츠 아님 | 180초 초과·가로형은 `--not-shorts` 없이 거부 |

## 문제 해결

| 증상 | 조치 |
|---|---|
| `환경 변수 없음: YT_…` | 비밀값 저장 위치 확인(Actions Secrets / 환경 / `--env-file`) |
| `invalid_grant` | 토큰 만료·철회. 앱이 프로덕션인지 확인 → `python -m publish.oauth --production` → `YT_REFRESH_TOKEN` 교체 |
| `토큰이 가리키는 채널 … 다릅니다` | 토큰을 받을 때 다른 채널을 골랐음. 다시 발급하거나 `channel_id` 수정 |
| `made_for_kids … 정해지지 않았습니다` | `config/youtube.json` 의 `made_for_kids` 를 true/false 로 |
| `썸네일 설정 실패 … forbidden` | 채널 전화 인증(맞춤 썸네일 권한) 필요. Studio 에서 직접 고르거나 `upload_thumbnail: false` |
| `HTTP 401/403 insufficientPermissions` | 범위 부족. `publish.oauth` 로 다시 발급(youtube.upload + youtube.force-ssl) |
| `quotaExceeded` / `uploadLimitExceeded` | 하루 한도. 다음 날 다시 |
| 기록 커밋 push 실패 | main 에 보호 규칙이 있으면 `github-actions[bot]` 의 push 를 허용 |
| push 트리거가 아무것도 안 올림 | 그 push 에서 바뀐 finals 폴더가 없거나 기록 파일만 바뀜. 수동 실행으로 폴더 지정 |

## 미시험 · 미결

- **실제 업로드 0건.** 가짜 전송으로 흐름(토큰→채널→세션→308 재개→200→썸네일→자막)을 시험했고, 실제 API 응답은 아직 보지 못했습니다. main 의 실제 21편 영상·`upload.md` 로 dry-run 은 통과했습니다.
- 남은 사용자 결정: `channel_id`(토큰 발급 때 나옴), 이미 손으로 올린 편의 목록(`--mark-uploaded` 로 등록).
- 남은 사용자 작업: PR 병합 → GitHub Pages 켜기 → 구글 브랜딩·게시 → 토큰 발급 → Secrets 저장.
- 맞춤 썸네일은 채널 권한(전화 인증)에 따라 실패할 수 있습니다. 실패해도 영상은 올라가고 경고로 남습니다.
- 고정 댓글·관련 동영상·재생목록·예약 공개는 범위에 넣지 않았습니다. `upload.md` 에 적힌 고정 댓글은 사람이 답니다.
- **인스타그램 업로드는 포함되어 있지 않습니다.** 인스타 게시 API 에는 비공개·초안 상태가 없어 "비공개로 올리고 사람이 공개"를 재현할 수 없습니다. `finals/INSTAGRAM.md` 의 설명문은 사람이 붙여 넣는 용도입니다.
- Actions 의 기록 커밋은 main 보호 규칙이 없다는 전제입니다.
