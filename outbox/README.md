# outbox — 업로드 대기열

완성된 쇼츠 한 편 = 폴더 하나. `publish/youtube.py` 가 이 폴더를 읽어 **비공개**로 올리고 기록을 남깁니다.
공개 전환은 YouTube Studio 에서 사용자가 직접 합니다. 전체 절차는 [docs/YOUTUBE_UPLOAD.md](../docs/YOUTUBE_UPLOAD.md).

## 폴더 규약

```text
outbox/<episode>/
  final.mp4            세로(9:16) 쇼츠 원본. 없으면 폴더 안의 유일한 .mp4 를 씀
  description.txt      1행 = 제목(100자 이하) · 2행 = 빈 줄 · 3행~ = 설명(UTF-8 5000바이트 이하)
  final.srt            (선택) 한국어 자막. 있으면 captions.insert 로 함께 올림
  meta.json            (선택) 편별 덧씌움 — tags, made_for_kids, contains_synthetic_media, category_id, caption, video
  youtube_upload.json  도구가 씀. 영상 ID·URL·md5·채널·시각. 이 파일이 있고 md5 가 같으면 다시 올리지 않음
```

- 폴더 이름은 `01-sky-blue` 처럼 번호-영문 slug 를 권장합니다. 유튜브 제목은 `description.txt` 첫 줄입니다.
- `_` 또는 `.` 로 시작하는 폴더(`_example` 등)는 `--all` 대상에서 빠집니다.
- 제목·설명에 `<` `>` 는 쓸 수 없습니다(API 거부). 한글은 1자 3바이트이므로 설명은 약 1,600자가 한도입니다.
- 길이 180초 초과 또는 가로형이면 쇼츠로 분류되지 않아 기본 거부합니다. 일반 영상으로 올리려면 `--not-shorts`.
- 영상 파일을 바꿔 다시 올리려면 새 폴더에 두십시오. 같은 폴더에서 바꾸면 도구가 멈춥니다(`--allow-reupload` 로만 허용).

## 흐름

```text
제작 세션이 outbox/<ep>/ 를 만들어 브랜치에 커밋 → PR → 사용자가 병합(= 업로드 승인)
→ GitHub Actions youtube-upload: 비공개 업로드 → youtube_upload.json 커밋 → '공개 전환 대기' 이슈
→ 사용자가 Studio 에서 확인 후 공개 → 이슈 닫기
```

로컬·클라우드 세션에서 직접 올릴 때:

```bash
python -m publish.youtube outbox/<episode> --dry-run   # 검증만(비밀값 불필요)
python -m publish.youtube outbox/<episode>             # 비공개 업로드
python -m publish.youtube --list                        # 상태표
```

예시 입력은 [`_example/`](_example/) 에 있습니다(영상 없음).
