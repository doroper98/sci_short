---
name: science-short
description: 어떤 과학·공학 주제든 약 1시간 안에 최대 180초 한국어 세로 쇼츠(1080×1920, 표준 M3 음성, 글자 정렬 자막, 설명용 음향)로 제작하는 절차. 주제를 받으면 이 절차를 처음부터 끝까지 따른다.
---

# 과학 쇼츠 제작 스킬

읽을 순서: `docs/EPISODE_FLOW.md`(구성·호흡·톤) → `pipeline/README.md`(도구·계약) → `docs/NETWORK_AND_ASSETS.md`(막힌 호스트가 있을 때).
품질 기준은 `docs/ANIMATION_QUALITY.md`, `docs/SOUND_DESIGN.md`, `docs/NARRATION_AND_CAPTIONS.md`를 따른다.

## 시간 예산 (총 약 60분)

| 단계 | 분 | 산출물 | 끝났다는 기준 |
|---|---|---|---|
| 1. 기획 | 10 | `episodes/<slug>/brief.md` | 질문·핵심 명제·메커니즘 단계·사례·출처가 적혀 있다 |
| 2. 대본 | 10 | `script.json` | 합니다체, 650~750음절(상한 800), 문장마다 scene id, 숫자·단위에 `tts` |
| 3. 음성 | 5 | `outputs/<slug>/narration/` | `timeline.json`의 `degraded: false`, 길이 ≤ 180초 |
| 4. 장면 | 20 | `scenes.mjs`, 검토 정지화면 | 각 비트에서 움직이는 것이 있고 자막이 현상을 가리지 않는다 |
| 5. 소리·렌더 | 8 | `sound.json`, `visual.mp4`, `mix.wav` | 사건마다 소리, 음악은 핵심 비교에서 비움 |
| 6. 마감·검증 | 7 | `<slug>.mp4`, `captions.srt`, `validation.json`, `validate.json` | `validate.py` PASS, 정지화면 육안 확인 |

음성이 먼저, 화면은 실제 음성 길이에 맞춘다. 화면을 먼저 만들고 음성을 끼워 넣지 않는다.

## 절차

### 0. 환경 확인 (처음 한 번, 2분)

```bash
python pipeline/narration/fetch_assets.py --all      # Supertonic 3 FP32(GitHub 미러) + MMS
python pipeline/render/fetch_fonts.py                # GmarketSans + Noto Sans KR
```

실패하면 메시지에 나온 호스트를 `docs/NETWORK_AND_ASSETS.md`의 표와 대조해 사용자에게 허용을 요청한다.
MMS를 받을 수 없을 때 `--skip-alignment`로 진행할 수는 있으나, 그 결과는 표준 음성이 아니다. 완성본으로 전달하지 말고 상태를 알린다.

### 1. 기획

```bash
python pipeline/new_episode.py <slug> --title "제목"
```

`brief.md`를 채운다. 순서대로 쓴다.

1. **첫 문장과 질문** — 첫 문장은 "오늘은 ~에 대해 알아볼까요?"다(2026-11-01 사용자 결정). 양자택일 질문으로 시작하지 않는다. 훅이 품는 질문은 제목이나 두 번째 문장 이후에 두고, 비트 6이 그 질문에 답한다.
2. **기원·배경** — 어원, 발견 맥락, 이전 믿음 중 2~3개. 출처 URL.
3. **본질** — 한 문장 핵심 명제. 따옴표로. 상위 원리(보존·파동·평형·확률 등)와의 연결.
4. **메커니즘 단계** — 2~4단계. 단계마다 "무엇이 움직여 무엇이 바뀌는지"와 화면에서 보여줄 방법.
5. **현상·사례** — 1~2개. 바꿀 조건과 달라지는 결과.
6. **오해** — 선택. 오해 → 판정.
7. **마지막 한 줄** — 핵심 명제와 같은 문장.
8. **공간·카메라**, **소리 이벤트**, **단순화 메모**(관측/모형/비유 구분).

사실 확인이 필요한 수치·연도·인명은 웹에서 확인하고 출처를 남긴다. 확인 못 한 것은 쓰지 않는다.

### 2. 대본

`script.json`의 `sentences`에 비트 순서대로 쓴다. 규칙은 `docs/EPISODE_FLOW.md`의 호흡 절.

- 합니다체. 첫 문장은 "오늘은 ~에 대해 알아볼까요?". 그 밖의 질문형은 전환에 1회까지.
- 한 문장 25~40음절, 새 개념은 하나.
- 숫자·단위·알파벳이 있는 문장은 `tts`를 직접 쓴다. 예: `"text":"2.45 GHz", "tts":"이점사오 기가헤르츠"`. 수사와 단위는 붙여 쓴다("예순두배", "영점이초"). 숫자 셋 이상이 한 문장에 몰리면 고유어 수사로 바꾸거나 문장을 나눈다.
- 비트가 바뀌는 문장의 `gap`은 1.2~2.0, 메커니즘 핵심 단계 뒤는 1.5~2.5.
- 음절 수를 센다. 800을 넘으면 사례나 오해 비트부터 줄인다.
- 문장은 30~45음절로 쓰고 쉼표를 둔다. 같은 목소리라도 **짧은 문장은 더 빠르게 읽힌다**(실측: 15~25음절 문장 7.8음절/초, osint 35~50음절 문장 6.3음절/초). 속도는 `config/voice-overrides.json`의 0.85가 표준이다. 에피소드마다 바꾸지 않는다. 호흡은 문장 길이와 `gap`(0.9~1.2초)으로 조절한다.

### 3. 음성

```bash
python pipeline/narration/narrate.py --script episodes/<slug>/script.json --out outputs/<slug>/narration
```

확인할 것: 총 길이, 문장별 길이, `final_fall.applied`가 `니다` 문장 전부에 참, 정렬 점수 평균 0.75 이상.
점수가 낮은 문장은 발음 텍스트를 고친다. 음성 속도는 건드리지 않는다.
180초를 넘으면 대본으로 돌아간다.

### 4. 장면

`scenes.mjs`에 scene id마다 함수를 쓴다. `pipeline/render`의 `stage`, `draw`, `timeline`, `captions`를 쓴다.

- 비트 3(메커니즘)부터 만든다. 전체 단면 → 번호 붙인 확대 → 측정값 그래프의 3단 계기판과 추적 표식을 먼저 정한다. 가장 어려운 단계 8~12초를 먼저 정지화면으로 뽑아 본다.
- 각 장면에서 실제로 움직이는 대상을 하나 이상 둔다. 숫자 교체·정지 그림·장식 입자만으로 채우지 않는다.
- 전체 → 확대 → 전체의 연결 표시를 넣는다. 확대 장면은 어디를 보고 있는지 알 수 있어야 한다.
- 라벨은 대상 이름, 자막은 문장. 자막이 현상을 가리면 그 장면에서 자막 위치를 올린다.
- 단순화·과장은 각주 줄에 쓴다.
- 쇼츠 UI 안전 영역(하단 약 420px, 우측 약 140px)에 핵심 정보를 두지 않는다.
- **첫 프레임 = 썸네일**(2026-11-03 사용자 결정). 0초 프레임이 그대로 썸네일이 되게 만든다.
  - 검은 화면에서 페이드인하지 않는다. 0초에 이미 핵심 장면이 다 보인다.
  - 큰 제목(1~2줄, 한 줄 약 10자)을 화면 가운데 정사각 영역 안에 둔다. 넓게 잘리는 화면에서도 남게 하기 위함이다.
  - 자막·작은 라벨·각주는 넣지 않는다.
  - 내레이션이 시작될 때(약 1초) 제목이 머리글 크기로 줄어들며 훅이 이어진다. 따로 표지 화면을 붙여 훅을 늦추지 않는다.
  - 0초 프레임을 `poster.jpg`로 저장하고 정지화면 점검에 꼭 넣는다.

```bash
node episodes/<slug>/render.mjs --stills     # 장면 시작·중간·사건 시각의 정지화면과 컨택트 시트
```

정지화면을 **직접 열어 본다**. 한글 깨짐, 겹침, 가독성, 유치함을 점검한다.

### 5. 소리와 렌더

`sound.json`에 사건을 문장 id 기준 시각으로 적는다. 발생 시각과 도착 시각이 다르면 모형에서 계산한다.
배경음악은 기본 꺼짐이다. 쓰려면 `sound.json`의 `music` 블록에서 `enabled: true`(`assets/music/registry.json`의 id, CC BY 4.0 표기 필수). 각주·출처 줄은 화면에 넣지 않고 `brief.md`와 전달 README에 적는다. 화면 표기는 LIGO 같은 고유명사의 원어 표기를 쓴다.

```bash
node episodes/<slug>/render.mjs --video
python pipeline/audio/sfx.py  --sound episodes/<slug>/sound.json --timeline outputs/<slug>/narration/timeline.json --out outputs/<slug>/sfx.wav
python pipeline/audio/mix.py  --narration outputs/<slug>/narration/narration.wav --sfx outputs/<slug>/sfx.wav --timeline outputs/<slug>/narration/timeline.json --out outputs/<slug>/mix.wav
```

### 6. 마감과 검증

```bash
python pipeline/audio/finish.py --visual outputs/<slug>/visual.mp4 --mix outputs/<slug>/mix.wav \
  --timeline outputs/<slug>/narration/timeline.json --captions-srt outputs/<slug>/narration/captions.srt \
  --out outputs/<slug>/<slug>.mp4 --title "제목"
python pipeline/validate.py outputs/<slug>
```

`episodes/<slug>/run.sh`가 3~6단계를 순서대로 실행한다. 중간 단계가 바뀌면 그 뒤를 모두 다시 돌린다.

### 7. 전달

- **전달본이 곧 최종본**이다(2026-11-03 사용자 결정). 사용자가 다시 만들라고 하지 않으면 바꾸지 않는다.
- 다음 번호로 `finals/<번호>-<slug>/`를 만들고 넣는다. 들어갈 것은 mp4, srt, poster.jpg(0초 프레임), scenes.jpg, timeline.json, validation.json, README.md, upload.md다. 다시 만들 때는 같은 폴더를 덮어쓴다.
- `python3 pipeline/catalog.py`로 `finals/README.md` 목록과 `finals/catalog.json`(길이·해상도·SHA-256)을 갱신한다.
- README에는 길이, 음성 상태(`degraded` 여부), 검증 방법, 직접 청취·휴대전화 재생 여부를 사실대로 적는다.
- `HANDOFF.md`에 날짜·주제·결과·남은 한계를 추가한다.
- **업로드 정보 세 가지**(2026-11-03 사용자 결정)를 `finals/<번호>-<slug>/upload.md`에 적고 사용자에게 평문으로 준다(복사 버튼이 아니라 길게 눌러 복사하므로 코드 블록 없이).
  - 제목: 해시태그 2~3개 포함, 100자 이내.
  - 설명: 본문 끝에 해시태그 줄.
  - 태그: 쉼표로 구분한 한 줄, 500자 이내.
- PR 이 main 에 병합되면 `youtube-upload` 워크플로가 그 편을 유튜브에 **비공개**로 올린다(`docs/YOUTUBE_AUTO_UPLOAD.md`). 병합 전 `python -m publish.youtube finals/<번호>-<slug> --dry-run` 으로 검증한다. 공개 전환은 사용자가 한다. 병합 뒤에는 `youtube-upload` 실행 결과를 확인해 영상 ID·스튜디오 주소를 사용자에게 알린다(실행 목록은 공개 API `https://api.github.com/repos/doroper98/sci_short/actions/workflows/youtube-upload.yml/runs`, 기록은 main 의 `finals/<번호>-<slug>/youtube_upload.json`). 이미 올린 편의 영상을 다시 렌더해 병합하면 업로더가 멈춘다(새 영상으로 다시 올릴지는 사용자가 정한다).
- **설명란에 넣지 않는 것**(2026-11-07 사용자 규칙: "설명내용에 뭐 ai로 만들어서 실제와 다르다느니, ai 나레이션이라느니 하는 설명은 유튜브 인스타 모두 빼. 규칙이야"): 유튜브·인스타그램 설명 모두에 "AI 합성 음성/내레이션" 표기와 "설명용 그림·모형이라 실제와 다르다(과장·단순화·도식)"는 안내를 쓰지 않는다. "과학 교육 영상입니다", "구조나 설계는 다루지 않음" 같은 제작 범위·목적 고지도 쓰지 않는다(2026-11-07 사용자 재지시 "이런 문구 빼라니까?"). 과학 내용 자체의 단서("경향", "가장 유력한 설명", 출처 수치)는 내용이므로 남긴다. 모형·과장 구분은 화면 표식과 `README.md`·`brief.md`에만 둔다.
- **인스타그램(릴스) 설명**(2026-11-07 사용자 요청 "각 영상별 인스타 친화적 설명도 추가해줘")도 `upload.md`에 함께 적고 평문으로 준다. 사용자 SNS 정리본 규격(<제목>, 개요식 짧은 줄, 음슴체·명사형, "핵심 명제", 오해 -> 판정, 마크다운 없음), 끝에 해시태그 5개 이내. 모음은 `finals/INSTAGRAM.md`.
- **마무리하면 main으로 머지**(2026-11-05 사용자 결정: "언제나 영상 마무리 하고 머지해. 규칙이야"). 최종본·문서를 커밋·푸시한 뒤 PR을 검토 준비로 바꾸고 main에 머지한다. 머지된 뒤의 다음 작업은 최신 main에서 브랜치를 다시 시작하고 새 PR을 연다.

## 하지 않는 것

- 다른 목소리·다른 모델 변환본·speaker id 추정으로 조용히 대체하기.
- 음성 가속으로 길이 맞추기.
- 정렬 실패를 글자 수 비례 추정으로 덮기.
- 비유를 사실처럼 말하기, 확인 안 된 일화 넣기.
- 마스코트·이모지·의성어 자막·"신기하죠?"류 감탄.
- 자동 검사만으로 "봤다", "들었다"고 기록하기.
