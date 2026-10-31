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

1. **질문** — 예/아니오 또는 둘 중 하나로 답하는 예측 질문으로 쓴다. 비트 6이 이 질문에 답한다.
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

- 합니다체. 질문형은 훅과 전환에 각 1회까지.
- 한 문장 25~40음절, 새 개념은 하나.
- 숫자·단위·알파벳이 있는 문장은 `tts`를 직접 쓴다. 예: `"text":"2.45 GHz", "tts":"이 쩜 사오 기가헤르츠"`.
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

```bash
node episodes/<slug>/render.mjs --stills     # 장면 시작·중간·사건 시각의 정지화면과 컨택트 시트
```

정지화면을 **직접 열어 본다**. 한글 깨짐, 겹침, 가독성, 유치함을 점검한다.

### 5. 소리와 렌더

`sound.json`에 사건을 문장 id 기준 시각으로 적는다. 발생 시각과 도착 시각이 다르면 모형에서 계산한다.
배경음악은 `sound.json`의 `music` 블록으로 지정한다(`assets/music/registry.json`의 id, 기본 `zabriskie_patriarch`, CC BY 4.0). 핵심 비교 구간에서 비우려면 `enabled: false`로 끄거나 그 구간만 음악 없는 버전을 쓴다. 표기 문구는 엔드카드·설명란에 넣는다.

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

- 전달 브랜치 `preview/<slug>`에 `previews/<slug>/` (mp4, srt, poster, validation.json, README)를 둔다.
- README에는 길이, 음성 상태(`degraded` 여부), 검증 방법, 직접 청취·휴대전화 재생 여부를 사실대로 적는다.
- `HANDOFF.md`에 날짜·주제·결과·남은 한계를 추가한다.

## 하지 않는 것

- 다른 목소리·다른 모델 변환본·speaker id 추정으로 조용히 대체하기.
- 음성 가속으로 길이 맞추기.
- 정렬 실패를 글자 수 비례 추정으로 덮기.
- 비유를 사실처럼 말하기, 확인 안 된 일화 넣기.
- 마스코트·이모지·의성어 자막·"신기하죠?"류 감탄.
- 자동 검사만으로 "봤다", "들었다"고 기록하기.
