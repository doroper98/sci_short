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
        토큰 갱신 → 채널 확인(channel_id) → 재개 가능 업로드(비공개) → 영상 처리 완료 대기 → 썸네일 → (선택) 자막
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

## 권한 — 최소한만 받는다 (2026-11-07)

| 권한 | 쓰는 곳 | 영상 수정·삭제 |
|---|---|---|
| `youtube.upload` | `videos.insert`(업로드), `thumbnails.set`(썸네일) | 불가 |
| `youtube.readonly` | `channels.list(mine=true)` — 업로드 전 채널 확인, 영상 처리 상태, 주간 보고서의 영상 목록·조회수 | 불가 |
| `yt-analytics.readonly` (2026-11-08 추가) | 주간 채널 보고서(`publish/analytics.py`)의 시청 시간·평균 시청 비율·유입 경로·구독 증가 | 불가 |

**분석 권한을 더한 토큰 다시 받기(2026-11-08, 한 번).** 업로드는 지금 토큰으로 계속 됩니다. 이 절차를 마치기 전까지 주간 보고서에는 조회수·좋아요만 나옵니다.
1. 구글 클라우드 콘솔에서 프로젝트 **Osint Gen** → API 및 서비스 → 라이브러리 → **YouTube Analytics API** → 사용.
2. 구글 인증 플랫폼 → 데이터 액세스 → 범위 추가에서 `.../auth/yt-analytics.readonly` 를 더하고 저장(민감 범위 — 미검수 앱 경고가 떠도 소유자 본인은 쓸 수 있음).
3. OAuth Playground(톱니바퀴 → 내 클라이언트 ID·비밀번호, 2026-11-07과 같은 방법)에서 범위 칸에 세 개를 띄어쓰기로 넣는다:
   `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly`
4. Authorize APIs → 계정 → **과학쑛츠** 채널 선택 → 허용 → Exchange authorization code for tokens.
5. 새 Refresh token 을 저장소 Secrets 의 `YT_REFRESH_TOKEN` 에 덮어쓴다(채팅에 붙이지 않는다).
6. Actions → youtube-token-check(채널 확인) → youtube-analytics 수동 실행으로 확인.

**`youtube.force-ssl` 은 받지 않습니다.** 동의 화면에 "동영상, 평가, 댓글, 자막 보기, 수정 및 **완전 삭제**"로 표시되는 권한입니다.
GitHub Secrets 에 오래 두는 토큰이 새면 채널 영상을 지울 수 있어 뺐습니다.
대가로 `captions.insert`(자막 파일 업로드)를 쓸 수 없습니다. 자막은 화면에 새겨져 있어 2026-11-03 결정대로 원래 올리지 않습니다.
YouTube API 공식 문서로 확인한 범위: `videos.insert`·`thumbnails.set` 은 `youtube.upload` 로 되고, `videos.delete` 와 `captions.insert` 는 `youtube.upload` 로 안 됩니다.
`channels.list(mine=true)` 는 문서가 "인증된 요청"이라고만 적고 범위를 나열하지 않아, 첫 `--whoami` 실행으로 확인합니다.

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
4. **클라이언트** → 만들기 → 유형 **웹 애플리케이션**, 승인된 리디렉션 URI `https://developers.google.com/oauthplayground`.
   - "AI 기반 에이전트에 이 클라이언트 사용" 은 **체크하지 않습니다.** 정해진 대로 도는 스크립트라 일반 클라이언트가 맞는 분류입니다.
   - 만들자마자 **JSON 내려받기**. ID·비밀값은 채팅에 붙이지 않습니다.

### 2) 토큰 발급 — 브라우저만으로 (2026-11-07 실제로 쓴 경로)

설치 없이 OAuth Playground 로 받습니다. **반드시 3번(프로덕션 게시)을 끝낸 뒤에** 받습니다.

1. `https://developers.google.com/oauthplayground` → 오른쪽 위 톱니바퀴
2. **"Use your own OAuth credentials"** 체크 → 내려받은 JSON 의 `client_id`·`client_secret` 입력
   (이 체크를 빼면 놀이터 자체 신분증을 써서 토큰이 24시간 뒤 폐기됩니다)
3. Step 1 맨 아래 입력칸에 두 권한을 띄어쓰기로 이어 붙여 넣고 **Authorize APIs**
   ```
   https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly
   ```
4. 채널을 가진 계정으로 로그인 → **채널 목록에서 과학쑛츠 선택** → "확인되지 않은 앱" 경고에서 고급 → 이동
   - **같은 메일에 채널이 여럿이면 이 목록을 놓치기 쉽습니다.** 2026-11-07 첫 시도에서 이 화면을 지나쳐 토큰이 개인 채널 `_billy` 에 묶였습니다.
   - 확실히 다시 묻게 하려면 먼저 `myaccount.google.com/permissions` 에서 이 앱의 접근을 지우고, 톱니바퀴의 Force prompt 를 `Select Account` 로 둡니다. 회사 PC 라 시크릿 창이 막혀 있어도 이 방법이면 됩니다.
   - 동의 화면 **맨 위의 이름과 사진이 과학쑛츠**인지 보고 계속을 누릅니다.
5. 동의 화면의 두 항목("YouTube 동영상 관리", "YouTube 계정 보기")을 체크 → 계속
6. Step 2 **Exchange authorization code for tokens** → **Refresh token** 값을 복사(채팅에 붙이지 않습니다)

막힐 때: `redirect_uri_mismatch` 는 클라이언트 설정 반영 전이니 10분 뒤 다시. Refresh token 칸이 비면 톱니바퀴의 Force prompt 를 Consent Screen 으로.

**다른 경로 — PC 에 파이썬이 있을 때**: 데스크톱 앱 클라이언트를 만들고 `python -m publish.oauth --production --write-env .env`.
요청 권한은 위와 같고, 끝나면 채널 이름과 ID 를 보여 줍니다.

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
| `channel_id` | **결정 완료: 과학쑛츠 `UCZJSpmlBYUthLg0PSWcbU6w`(2026-11-07).** 토큰이 다른 채널이면 업로드 전에 멈춥니다 |
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

- **자동 대상 = 22번 이상 새 편**(2026-11-07). push 자동 실행은 `--auto` 로 돌며 `auto_from_number`(22) 미만 편은 건너뜁니다. 01~21 은 손으로 올린 편이 섞여 있어, 그 폴더를 고친 PR 이 병합돼도 다시 올라가지 않게 했습니다. 옛 편은 `meta.json` 의 `auto_publish: true` 또는 수동 실행(episode 지정)으로 올립니다. 같은 병합에서 인스타 릴스도 게시됩니다([인스타 릴스 자동 게시](INSTAGRAM_AUTO_POST.md)).
- **승인 신호 = main 병합.** 새 편의 `finals/<NN>-<slug>/` 가 들어온 PR 을 병합하면 Actions 가 그 편만 올립니다. 같은 폴더를 덮어써 다시 만든 편은 md5 가 달라져 멈추며, 새 영상으로 올리려면 수동 실행 전에 `youtube_upload.json` 을 지우거나 `--allow-reupload` 를 씁니다(이전 영상은 유튜브에 남음).
- **공개 전환 = 이슈 처리.** 업로드마다 `youtube-review` 라벨 이슈가 생깁니다. Studio 에서 확인·공개하고 `upload.md` 의 고정 댓글·관련 동영상을 넣은 뒤 닫습니다.
- **수동 실행.** Actions → youtube-upload → Run workflow. `episode` 한 폴더, 또는 `all=true`. `dry_run` 으로 검증만.
- **멱등.** `youtube_upload.json` 이 있고 md5 가 같으면 건너뜁니다. 재실행이 안전합니다.
- **자막·썸네일 실패**는 영상 기록을 남기고 경고로 보고합니다(영상은 올라간 상태).
- **썸네일은 영상 처리가 끝난 뒤 지정합니다.** 공식 문서(thumbnails.set)에 따르면 쇼츠의 맞춤 썸네일은 `processingDetails.processingStatus` 가 `succeeded` 가 된 뒤 지정해야 적용됩니다. 업로더는 업로드 뒤 `videos.list(part=processingDetails)` 를 15초마다 보고(최대 `processing_wait_sec` 1200초, 1회 1단위) 썸네일을 지정합니다. 2026-11-07 첫 업로드(04편)는 처리 전에 지정해 유튜브가 중간 장면을 썸네일로 골랐습니다.
- **썸네일만 다시 지정.** 기록의 `thumbnail_after_processing` 이 true 가 아닌 편(옛 기록·처리 대기 초과)은, 같은 편을 다시 실행하면 영상은 두고 썸네일만 다시 지정합니다. 수동 실행에서 `episode` 에 그 폴더를 적거나, 그 폴더를 바꾼 PR 을 병합하면 됩니다. 손으로 올린 편(`source: manual`)은 건드리지 않습니다.
- **API 로 안 될 때.** 처리 완료 뒤 지정해도 쇼츠에 맞춤 썸네일이 보이지 않으면 유튜브 휴대전화 앱 → 영상 수정 → 썸네일에서 첫 프레임을 고릅니다. 이 채널의 썸네일은 0초 프레임과 같은 그림이라 결과가 같습니다.
- **쇼츠 분류.** 세로·정방형이고 180초 이하면 유튜브가 자동으로 쇼츠로 분류합니다. 13편 모두 1080×1920, 160~179초입니다.
- **할당량(2026-11-03 공식 문서 확인).** videos.insert 는 별도 버킷 하루 100회. captions.insert 400단위, thumbnails.set 50단위, channels.list 1단위(기본 하루 10,000단위). 초과 시 `quotaExceeded` 로 멈추고 태평양 시간 자정(KST 오후 4~5시) 뒤 다시 됩니다.
- **로컬·클라우드 세션에서 직접** 올릴 수도 있습니다: `python -m publish.youtube finals/<ep> --env-file .env`.

## 아침 업로드 (2026-11-08)

사용자 결정: "내가 말하지 않아도 제작해서 비공개로 하나씩 올려. 올리는 시간은 아침 7시로 해. 내가 출근하면서 공개로 바꾸게."

| 시각(KST) | 무엇이 | 하는 일 |
|---|---|---|
| 매일 20:13 | 예약 작업(클라우드 세션) | `config/daily.json` 순서에서 아직 없는 첫 편을 만들어 main 에 병합. 만들어 두고 아직 안 올린 편이 있으면 쉰다 |
| 병합 push | `youtube-upload` | 이 목록의 편은 유튜브·인스타 모두 건너뜀(`--auto` 가드) |
| 다음 날 06:37 | `.github/workflows/youtube-daily.yml` | `python -m publish.youtube --daily-next`: 새 편 한 편을 **비공개로** 올리고 '공개 전환 대기' 이슈를 연다 |
| 출근길 | 사용자 | 스튜디오에서 공개로 전환, 이슈 닫기 |

- 예약 시각(2026-11-10 다시 바뀜): **매시간**, 아침 창 05~10시 KST 에 돈 실행만 일한다(GitHub 예약이 6~10시간 늦게 돈 실측 때문). 그 전(11-09): 05:47·06:27·07:07 KST 세 번. 첫날 06:37 예약이 70분 넘게 돌지 않아(GitHub 예약 실행은 늦거나 빠질 수 있다) 앞당기고 예비를 두었다. 먼저 돈 실행만 올리고, 나머지는 '최근 6시간 안에 올린 것이 있으면 쉼' 안전장치로 아무것도 하지 않는다.
- 비공개 보류는 꺼져 있다(2026-11-11 사용자: "비공개가 있어도 예정된 스케줄의 영상들을 올리도록 해 규칙 개선건이야"): `hold_if_private_within_days` 0. 앞서 올린 영상이 아직 비공개여도 다음 편을 올린다. 1 이상으로 되돌리면 그 일수 안에 올린 영상이 비공개일 때 쉰다(2026-11-08~11-10 의 동작). 6시간 안전장치(같은 아침 두 편 방지)는 그대로다.
- 새 편이 없는 날(목록이 끝났거나 밤 제작이 실패한 날)에는 아래 '다시 올리기' 대기열에서 한 편을 올린다. 하루 한 편은 그대로다.
- 인스타(2026-11-08 사용자 결정 "아침 업로드와 동시에"): 같은 실행에서 유튜브 단계 직후 한 편을 게시한다(즉시 공개). 오늘 올린 편이 먼저, 없으면 옛 편. 옛 편은 17시 `instagram-evening`에서도 한 편씩(따라잡을 때까지). 자세히는 `docs/INSTAGRAM_AUTO_POST.md`.
- 손으로 한 번: Actions → youtube-daily → Run workflow(검증만 하려면 dry_run).
- 알림(2026-11-08): '공개 전환 대기'·실패 이슈와 주간 보고서 이슈는 저장소 주인을 **담당자로 지정**해 연다. '할당됨' 알림은 지켜보기 설정과 상관없이 온다. 휴대전화 푸시는 GitHub 모바일 앱(설정 → 알림 → 푸시 켜기, '할당됨' 포함)에서 받는다. 밤 제작 결과는 제작하는 Claude 세션이 Claude 앱 푸시로 알린다.

## 다시 올리기 (2026-11-08)

한꺼번에 공개해 노출을 못 받은 편을 **새 영상으로** 하루 1편씩 다시 올립니다(`docs/CHANNEL_GROWTH.md` H3).
- 대기열과 규칙: `config/republish.json`(시작일, `min_views` 50, 비공개 보류 0 = 끔, 2026-11-11)
- 실행: 아침 업로드(`.github/workflows/youtube-daily.yml`, 06:37 KST)가 올릴 새 편이 없는 날 대기열에서 한 편(`--daily-next` 안에서 `--republish-next` 와 같은 규칙)
- 이전 판의 조회수를 `videos.list(part=status,statistics)`로 확인해 `min_views` 이상이면 건너뜁니다
- 앞서 올린 영상이 비공개여도 쉬지 않습니다(2026-11-11 사용자 결정, 보류 0)
- 새 기록의 `previous`에 이전 판(영상 ID, 다시 올릴 때의 조회수·공개 상태)이 남습니다
- 알림 이슈에 "이전 판 비공개로 전환" 체크가 붙습니다. 이 토큰에는 수정 권한이 없어 사람이 합니다
- 한 편만 손으로: `python -m publish.youtube finals/<ep> --republish`

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
| 쇼츠 썸네일이 중간 장면 | 처리 완료 전에 지정된 것. 같은 편을 다시 실행하면 썸네일만 다시 지정(위 '운영'). 그래도 안 되면 휴대전화 앱에서 첫 프레임 선택 |
| `영상 처리 대기 … 초과` | 유튜브 처리가 늦음. 영상은 올라감. 나중에 같은 편을 다시 실행 |
| `HTTP 401/403 insufficientPermissions` | 범위 부족. 위 '토큰 발급'대로 다시 받습니다(youtube.upload + youtube.readonly) |
| `자막 업로드 실패 … force-ssl` | 의도된 동작입니다. 자막 업로드 권한은 받지 않습니다('권한' 절) |
| `quotaExceeded` / `uploadLimitExceeded` | 하루 한도. 다음 날 다시 |
| 기록 커밋 push 실패 | main 에 보호 규칙이 있으면 `github-actions[bot]` 의 push 를 허용 |
| push 트리거가 아무것도 안 올림 | 그 push 에서 바뀐 finals 폴더가 없거나 기록 파일만 바뀜. 수동 실행으로 폴더 지정 |

## 미시험 · 미결

- **실제 업로드 1건(2026-11-07, 04편 `dbnYxnEgtpo`).** 병합 push → 바뀐 편 선택 → 채널 확인 → 비공개 업로드 → 기록 커밋 → 이슈까지 실제로 확인했습니다. 썸네일은 처리 전에 지정되어 적용되지 않았고, 처리 완료 대기를 넣어 고쳤습니다. 쇼츠에서 API 썸네일이 실제로 보이는지는 다시 지정한 뒤 확인합니다.
- 남은 사용자 결정: 이미 손으로 올린 편의 목록(`--mark-uploaded` 로 등록). `channel_id` 는 2026-11-07 에 과학쑛츠로 정해졌습니다.
- 맞춤 썸네일은 채널 권한(전화 인증)에 따라 실패할 수 있습니다. 실패해도 영상은 올라가고 경고로 남습니다.
- 고정 댓글·관련 동영상·재생목록·예약 공개는 범위에 넣지 않았습니다. `upload.md` 에 적힌 고정 댓글은 사람이 답니다.
- **인스타그램 업로드는 포함되어 있지 않습니다.** 인스타 게시 API 에는 비공개·초안 상태가 없어 "비공개로 올리고 사람이 공개"를 재현할 수 없습니다. `finals/INSTAGRAM.md` 의 설명문은 사람이 붙여 넣는 용도입니다.
- Actions 의 기록 커밋은 main 보호 규칙이 없다는 전제입니다.
