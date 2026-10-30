# sci_short

어떤 과학·공학 주제든 **최대 3분, 1080×1920 세로 쇼츠**의 한국어 과학 영상으로 만드는 저장소입니다.
대상은 초등학교 고학년부터 고등학교 저학년(약 11~16세)입니다. 장치 해부도 수준의 메커니즘 자세함, 이해를 돕는 배경지식, 소화할 수 있는 호흡을 함께 설계하고, 유치하지 않은 톤을 유지합니다.

현재 상태(2026-10-30): **표준 음성 파이프라인과 공통 제작 도구가 작동하며 통합 테스트를 통과했습니다.** 첫 실제 에피소드는 아직 만들지 않았습니다. 상세는 [HANDOFF.md](HANDOFF.md).

## 시작하기

1. [AGENTS.md](AGENTS.md) — 작업 범위와 이어가기 원칙
2. [HANDOFF.md](HANDOFF.md) — 현재 상태, 결정 사항, 남은 한계
3. [에피소드 구성](docs/EPISODE_FLOW.md) — 기원·배경 → 본질 → 메커니즘 → 현상·사례 → 한 줄 결론, 시간 예산과 호흡
4. [제작 스킬](skills/science-short/SKILL.md) — 주제 지시 후 약 1시간 안에 완성하는 절차
5. [파이프라인 안내](pipeline/README.md) — 도구, 타임라인 계약, 단계별 실행
6. [네트워크·자산](docs/NETWORK_AND_ASSETS.md) — 허용해야 할 호스트와 모델·글꼴 출처
7. [한국어 음성·자막](docs/NARRATION_AND_CAPTIONS.md) — 표준 음성 근거와 구현 상태
8. [애니메이션 품질](docs/ANIMATION_QUALITY.md), [과학을 설명하는 소리](docs/SOUND_DESIGN.md), [화면 설계](docs/CREATIVE_DIRECTION.md)
9. [참고 영상 분석](docs/REFERENCE_ANALYSIS.md) — 현상 설명 계열 1~8번, 장치 해부도 계열 9~13번

## 한 편 만들기

```bash
python pipeline/narration/fetch_assets.py --all     # Supertonic 3 FP32 + MMS (처음 한 번)
python pipeline/render/fetch_fonts.py               # GmarketSans + Noto Sans KR (처음 한 번)
python pipeline/new_episode.py <slug> --title "제목"
#   episodes/<slug>/brief.md → script.json → scenes.mjs → sound.json 작성
episodes/<slug>/run.sh                               # narrate → stills → render → sfx → mix → finish → validate
```

가상환경과 설치 방법은 [pipeline/narration/README.md](pipeline/narration/README.md)와 [pipeline/README.md](pipeline/README.md)에 있습니다.

## 확정된 기준

- **음성**: Supertonic 3 남성 M3 ×0.95 + MMS 강제 정렬 + `니다` 문장 끝 억양 보정. `doroper98/osint_generator`의 최종 음성과 같은 코드·설정·모델 파일입니다. 내레이션은 합니다체.
- **자막**: 실제 음성의 글자 시각에 맞춘 큐. 화면의 핵심 현상을 가리지 않도록 장면별 위치 조정.
- **화면**: 하나의 무대, 전체 단면 → 번호 붙인 확대 → 측정값 그래프의 3단 계기판, 역할 색 고정, 시간 배율·단순화를 화면에 선언.
- **소리**: 화면 사건과 같은 시간표에서 생성한 설명용 음향. 핵심 비교 구간에서 음악을 비움.
- **글꼴·테마**: GmarketSans(제목)·Noto Sans KR(본문), 기본 테마 `noturno`. `agents_reviewer` 르포 템플릿 기준.
- **길이**: 최대 180초, 권장 150~170초. 음성 가속 금지.

## 구조

```text
AGENTS.md                         작업 안내
HANDOFF.md                        현재 상태와 다음 작업
skills/science-short/SKILL.md     1시간 제작 절차
docs/EPISODE_FLOW.md              구성·호흡·톤 기준
docs/NETWORK_AND_ASSETS.md        허용 호스트와 자산 출처
docs/NARRATION_AND_CAPTIONS.md    음성 근거·후처리·자막
docs/ANIMATION_QUALITY.md         밀도·입체감·움직임과 결과 검토
docs/SOUND_DESIGN.md              과학을 설명하는 음향 설계
docs/CREATIVE_DIRECTION.md        주제별 시각 설계 방향
docs/REFERENCE_ANALYSIS.md        참고 영상 13편 분석
config/voice-reference.json       출처 커밋에 고정한 음성 기준값
pipeline/narration/               표준 음성 합성·정렬·억양 보정·자막 큐
pipeline/render/                  세로 무대·그리기·자막·인코딩 (Node)
pipeline/audio/                   설명용 음향·믹스·마감
pipeline/validate.py              완성본 검증
pipeline/new_episode.py           에피소드 스캐폴드
episodes/_template/               에피소드 양식(brief, script, scenes, sound, run.sh)
assets/fonts/                     글꼴 해시 목록(바이너리는 받아서 사용)
references/                       참고 영상 13편·장면 모음·음성 발췌·무결성 확인값
previews/, samples/               이전 시제품(석영·전력·태양)과 그 제작 코드
templates/episode-brief.md        기획 메모 양식
```

자산 확인은 저장소 루트에서 `sha256sum -c references/SHA256SUMS`로 할 수 있습니다.
모델 가중치·글꼴 바이너리·가상환경·출력물은 Git에 넣지 않습니다. 참고 영상은 스타일·설명 방식 연구용이며 재배포 권리를 부여하지 않습니다.
