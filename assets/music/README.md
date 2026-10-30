# 배경음악

음악 파일(mp3·wav·m4a)은 Git에 넣지 않습니다. 이 폴더의 `registry.json`이 권리와 해시의 기준입니다.

## 지정 방법

에피소드의 `sound.json`에 `music` 블록을 씁니다.

```json
"music": {"id": "zabriskie_patriarch", "under_db": 12, "duck_db": 6, "start_sec": 0}
```

- `id`: `registry.json`의 키. 또는 `"file": "assets/music/내파일.mp3", "credit": "표기 문구"`로 직접 지정.
- `under_db`: 말하는 동안 음악 RMS를 내레이션 RMS보다 몇 dB 아래로 둘지. osint_generator 최종 영상 실측은 약 12 dB.
- `duck_db`: 말할 때 추가로 내리는 깊이(말 사이 구간은 그만큼 더 큼). osint 는 깊이 0.5(약 6 dB).
- `enabled: false` 또는 환경변수 `NO_MUSIC=1`이면 음악 없이 믹스합니다.

`run.sh`가 이 블록을 읽어 `mix.py --music … --music-credit …`를 호출하고, `finish.py`가 표기 문구를 `validation.json`에 기록합니다.
표기 문구는 엔드카드나 업로드 설명란에 넣어야 합니다. CC BY는 표기가 의무입니다.

## 파일 받기

- `zabriskie_patriarch`: `doroper98/osint_generator` 커밋 `bd37b582…`의 `assets/audio/bgm/` 파일을 그대로 복사했습니다.
  ```bash
  git -C /path/to/osint_generator fetch --depth=1 origin bd37b582bfd78859df89a893670cc191b4072718
  git -C /path/to/osint_generator show "FETCH_HEAD:assets/audio/bgm/The Life and Death of a Certain K. Zabriskie, Patriarch - Chris Zabriskie.mp3" > assets/music/zabriskie-patriarch.mp3
  sha1sum assets/music/zabriskie-patriarch.mp3   # c0ddb7b38ee7866c32d2510a84125cf611a54e93
  ```
- `zabriskie_mario_bava`: `registry.json`의 `source_url`(archive.org). 이 환경에서는 호스트가 차단되어 있습니다.

## 선택 기준

- 말소리 대역(300~3000 Hz)이 비어 있고 박자가 약한 곡. 과학 설명의 핵심 비교 구간에서는 `sound.json` 이벤트로 음악을 비웁니다.
- Kevin MacLeod 곡은 Content ID 사전 등록 공지(osint 기록)로 쓰지 않습니다.
