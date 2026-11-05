# 유튜브 쇼츠 자동 업로드 체계

완성된 쇼츠를 채널에 **비공개(private)** 로 자동 업로드하고, **공개 전환은 사용자가 직접** 하는 체계입니다.
참고 세션(osint_generator 의 `publish/youtube.py`, 2026-11-03)의 설계를 이 저장소 사정에 맞게 독립 도구로 옮겼습니다.
제작 파이프라인이 아직 없으므로 파이프라인과 결합하지 않고 **폴더 규약(outbox/)** 으로만 이어집니다.

기록일 2026-11-05. 실제 업로드는 아직 한 번도 하지 않았습니다(비밀값·채널 결정 전). 아래 "미시험" 참고.

## 한눈에 보기

```text
[제작]  outbox/<ep>/final.mp4 + description.txt (+ final.srt, meta.json)
   │   브랜치 커밋 → PR (ci: 단위 시험 + dry-run 검증)
   ▼
[승인]  사용자가 PR 을 main 에 병합  ← 이것이 "올려도 된다"는 신호
   ▼
[자동]  GitHub Actions youtube-upload
        토큰 갱신 → 채널 확인(channel_id 일치) → 재개 가능 업로드(비공개) → 자막 → youtube_upload.json 커밋
        → 이슈 "공개 전환 대기: <제목> (<video id>)" 생성
   ▼
[사람]  YouTube Studio 에서 확인 → 공개(또는 예약 공개) → 이슈 닫기
[주간]  youtube-token-check: 토큰 생존·채널 일치 확인, 문제면 이슈
```

구성 파일:

| 경로 | 역할 |
|---|---|
| `publish/youtube.py` | 업로더 CLI. 표준 라이브러리만 사용. `--dry-run` `--all` `--list` `--whoami` |
| `publish/oauth.py` | 리프레시 토큰 1회 발급(사용자 PC, 루프백 OAuth + PKCE). **프로덕션 게시 확인 없이는 발급 거부** |
| `config/youtube.json` | 채널 공통 설정. `privacy_status` 는 `private` 만 허용 |
| `outbox/` | 업로드 대기열. 규약은 [outbox/README.md](../outbox/README.md) |
| `.github/workflows/youtube-upload.yml` | main 의 `outbox/**` 변경 → 비공개 업로드 → 기록 커밋 → 이슈 |
| `.github/workflows/youtube-token-check.yml` | 매주 월요일 토큰 생존 점검 |
| `.github/workflows/ci.yml` | 단위 시험 + outbox dry-run |
| `.github/scripts/youtube_report.py` | 작업 요약·이슈 생성 |
| `docs/youtube-app/` | OAuth 앱 게시용 홈페이지·개인정보처리방침(GitHub Pages) |
| `tests/test_publish_youtube.py` | 비밀값·네트워크 없이 도는 단위 시험 |

## 장기 토큰 원칙 (7일 만료 토큰을 쓰지 않는다)

사용자 지시(2026-11-05): 7일 뒤 만료되는 토큰이 아니라 오래 유지되는 토큰을 쓴다.

- Google OAuth 앱이 **외부 + '테스트 중'** 이면 리프레시 토큰이 **7일** 뒤 만료됩니다.
- 앱을 **'프로덕션'으로 게시**하면 토큰은 철회·비밀번호 변경·6개월 미사용 전까지 유지됩니다.
- 따라서 토큰은 **게시가 끝난 뒤** 받습니다. 테스트 중에 받은 토큰은 게시해도 7일 만료가 그대로입니다.
- `publish/oauth.py` 는 게시 상태가 프로덕션임을 확인(`--production` 또는 프롬프트 y)해야 발급을 진행합니다.
  `--allow-testing` 은 알고도 7일 토큰을 받을 때만 쓰는 비상용 옵션입니다.
- 주간 `youtube-token-check` 가 토큰이 죽으면 이슈로 알립니다. 업로드가 `invalid_grant` 로 멈추면 같은 원인입니다.

게시(프로덕션 전환)에는 **앱 홈페이지 URL·개인정보처리방침 URL·승인된 도메인**이 필요합니다. 두 가지 길이 있습니다.

| 길 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A. osint_generator 의 OAuth 앱 재사용 (권장) | 이미 만든 Google Cloud 프로젝트·클라이언트·브랜딩 페이지(`osint-generator.vercel.app/youtube-app`)를 그대로 쓰고, **이 채널용 리프레시 토큰만** 새로 받음 | 설정이 한 곳. 게시 작업 1회 | 그 저장소의 페이지가 main 에 병합·배포돼 있어야 함 |
| B. sci_short 전용 프로젝트 | 새 Google Cloud 프로젝트. 브랜딩 페이지는 이 저장소 `docs/youtube-app/` 을 GitHub Pages 로 배포 | 저장소 하나로 완결 | Pages 활성화·동의 화면·게시를 다시 해야 함 |

같은 Google 계정이 두 채널(브리핑·과학)을 소유하면 A 로 충분합니다. 리프레시 토큰은 **동의할 때 고른 채널**에 묶이므로, 채널만 다르게 고르면 됩니다.

## 1회 설정 절차

### 1) Google Cloud 쪽 (브라우저)

1. 프로젝트 선택(A: 기존 프로젝트 / B: 새 프로젝트). `console.cloud.google.com/apis/library/youtube.googleapis.com` 에서 **YouTube Data API v3 사용**.
2. Google 인증 플랫폼 → **브랜딩**: 앱 이름, 지원 이메일, 앱 홈페이지, 개인정보처리방침, 승인된 도메인.
   - A: `https://osint-generator.vercel.app/youtube-app`, `.../youtube-app/privacy`, 도메인 `osint-generator.vercel.app`
   - B: 저장소 Settings → Pages → Source: Deploy from a branch, `main` / `/docs` 로 배포한 뒤
     `https://doroper98.github.io/sci_short/youtube-app/`, `.../youtube-app/privacy.html`, 도메인 `doroper98.github.io`
3. **대상** → **앱 게시** → 프로덕션. 개인용(사용자 100명 미만)은 심사 없이 "확인되지 않은 앱" 경고만 뜹니다.
   화면이 심사 제출을 요구하면 그 캡처를 다음 세션에 보여 주십시오.
4. **클라이언트** → 클라이언트 만들기 → 유형 **데스크톱 앱**. ID·비밀값은 채팅에 붙이지 말고 다음 단계에서 터미널에만 넣습니다.
   (A 에서 기존 '웹 애플리케이션' 클라이언트를 쓰려면 승인된 리디렉션 URI 에 `http://127.0.0.1:8765/` 를 추가하십시오.)

### 2) 토큰 발급 (사용자 PC, 1회)

```bash
git clone https://github.com/doroper98/sci_short && cd sci_short
python -m publish.oauth --production --write-env .env
```

- 브라우저가 열리면 채널을 소유한 Google 계정으로 로그인하고, 채널이 여럿이면 **과학 채널**을 고릅니다.
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
| `made_for_kids` | **반드시 true/false 로 정합니다.** null 이면 업로드를 거부합니다. 아동용(COPPA) 자가 선언은 채널 운영자의 법적 책임이라 도구가 대신 정하지 않습니다. 쇼츠가 어린이를 **주 시청자**로 삼으면 true, 가족·일반 시청자 대상이면 false 가 통례입니다. true 면 댓글·알림·맞춤 광고가 제한됩니다. 편마다 `meta.json` 으로 바꿀 수 있습니다 |
| `channel_id` | `--whoami` 또는 토큰 발급 때 나온 UC… 값. 넣어 두면 다른 채널로 올라가는 사고를 막습니다 |
| `category_id` | 27 교육(기본) 또는 28 과학기술 |
| `contains_synthetic_media` | AI 합성 내레이션(Supertonic) → true(기본) |
| `tags` | 공통 태그. 편별 태그는 `meta.json` |

### 5) 첫 시험

```bash
python -m publish.youtube --whoami --env-file .env          # 채널 이름·ID 확인
python -m publish.youtube outbox/<ep> --dry-run             # 검증만
python -m publish.youtube outbox/<ep> --env-file .env       # 비공개 업로드 1건
```

## 운영

- **승인 신호 = main 병합.** `outbox/<ep>/` 가 들어온 PR 을 병합하면 Actions 가 올립니다. PR 단계의 ci 가 제목 길이·설명 바이트·쇼츠 규격·아동용 선언 누락을 미리 잡습니다.
- **공개 전환 = 이슈 처리.** 업로드마다 `youtube-review` 라벨 이슈가 생깁니다. Studio 에서 확인·공개 후 닫습니다.
- **수동 실행.** Actions → youtube-upload → Run workflow. `episode` 에 폴더 하나를 적거나 비워 전체, `dry_run` 체크로 검증만.
- **멱등.** `youtube_upload.json` 이 있고 md5 가 같으면 건너뜁니다. 재실행이 안전합니다. 영상이 바뀌면 멈춥니다(`--allow-reupload` 로만 교체 업로드. 이전 영상은 유튜브에 남습니다).
- **자막 실패**는 영상 기록을 남기고 경고로 보고합니다(영상은 올라간 상태).
- **쇼츠 분류.** 세로·정방형이고 3분(180초) 이하면 유튜브가 자동으로 쇼츠로 분류합니다. `#Shorts` 태그는 필요 없습니다.
- **할당량(2026-11-03 공식 문서 확인).** videos.insert 는 별도 버킷 하루 100회. captions.insert 400단위, channels.list 1단위(기본 하루 10,000단위). 쇼츠 하루 수 편은 여유가 큽니다. 초과 시 `quotaExceeded` 로 멈추고 태평양 시간 자정(KST 오후 4~5시) 뒤 다시 됩니다.
- **영상 파일을 Git 에 둡니다.** 720×1280 쇼츠는 편당 수 MB~15MB 수준입니다(참고 영상 1~11MB). 편수가 수백이 되면 저장소가 커지므로 그때 제작 세션에서 직접 올리는 경로(비밀값을 클라우드 환경에 저장)로 바꾸는 것을 검토하십시오.

## 안전장치

| 위험 | 장치 |
|---|---|
| 실수로 공개 업로드 | `privacy_status` 가 private 이외면 설정 로드 실패. 요청 본문도 항상 `private` 고정 |
| 다른 채널에 업로드 | 업로드 전 `channels.list` 로 확인, `channel_id` 불일치면 중단. 기록에 채널 이름 저장 |
| 같은 영상 두 번 | md5 기록으로 건너뜀. 동시 실행은 Actions concurrency 로 직렬화 |
| 토큰 조용히 만료 | 테스트 상태 발급 거부 + 주간 점검 이슈 |
| 비밀값 유출 | 환경 변수만 읽음. 로그·기록·커밋에 값 없음. `.env` 는 gitignore |
| API 거부 | 제목 100자·설명 5000바이트·`<>`·태그 500자·아동용 선언 누락을 업로드 전에 검사 |
| 쇼츠 아님 | 180초 초과·가로형은 `--not-shorts` 없이 거부 |

## 문제 해결

| 증상 | 조치 |
|---|---|
| `환경 변수 없음: YT_…` | 비밀값 저장 위치 확인(Actions Secrets / 환경 / `--env-file`) |
| `invalid_grant` | 토큰 만료·철회. 앱이 프로덕션인지 확인 → `python -m publish.oauth --production` → `YT_REFRESH_TOKEN` 교체 |
| `토큰이 가리키는 채널 … 다릅니다` | 토큰을 받을 때 다른 채널을 골랐음. 다시 발급하거나 `channel_id` 수정 |
| `made_for_kids … 정해지지 않았습니다` | `config/youtube.json` 의 `made_for_kids` 를 true/false 로 |
| `HTTP 401/403 insufficientPermissions` | 범위 부족. `publish.oauth` 로 다시 발급(youtube.upload + youtube.force-ssl) |
| `quotaExceeded` / `uploadLimitExceeded` | 하루 한도. 다음 날 다시 |
| 기록 커밋 push 실패 | main 에 보호 규칙이 있으면 `github-actions[bot]` 의 push 를 허용하거나 보호 규칙에서 Actions 를 우회 설정 |

## 미시험 · 미결

- **실제 업로드 0건.** 가짜 전송으로 흐름(토큰→채널→세션→308 재개→200→자막)을 시험했고, 실제 API 응답은 아직 보지 못했습니다.
- `made_for_kids`, `channel_id`, Google 프로젝트 재사용(A/B) 은 사용자 결정 대기입니다.
- Actions 의 기록 커밋은 main 보호 규칙이 없다는 전제입니다.
- 썸네일·예약 공개(`publishAt`)·재생목록 추가는 범위에 넣지 않았습니다. 필요하면 다음 작업으로 분리합니다.
