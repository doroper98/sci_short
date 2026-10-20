# sci_short

아이가 과학 현상을 직관적으로 이해할 수 있는 **약 60~90초 한국어 과학 영상**을 만드는 프로젝트입니다.
현상의 작동 과정과 공간 관계가 보이는 밀도 있는 애니메이션, 과학을 설명하는 소리, 한국어 나레이션과 자막을 함께 설계합니다.

현재는 **참고자료·제작 기준과 한국 전력 하루 영상 시제품**이 있습니다. [시제품 실행 방법과 한계](samples/korea-power-day/README.md)를 참고하세요. 내레이션과 현상에 연결된 설명용 음향은 해당 시제품에 아직 구현하지 않았습니다.

추가 제작: [태양·노을 영어 영상](samples/sunlight-color/README.md)의 1분 43초 검토본에는 영어 자막과 현상에 연결된 음향이 있습니다. 영어 내레이션은 모델 다운로드 제한으로 아직 대기 중입니다.

## Codex에서 시작하기

1. [AGENTS.md](AGENTS.md) — 작업 범위와 이어가기 원칙
2. [HANDOFF.md](HANDOFF.md) — 확정 사항, 미정 사항, 다음 작업
3. [참고 영상 분석](docs/REFERENCE_ANALYSIS.md) — 7개 영상의 장면·장점·주의점
4. [유연한 화면 설계](docs/CREATIVE_DIRECTION.md) — 주제에 따라 표현을 선택하는 방법
5. [한국어 음성·자막](docs/NARRATION_AND_CAPTIONS.md) — 확인된 표준 음성과 동기화 방향
6. [애니메이션 품질](docs/ANIMATION_QUALITY.md) — 설명의 밀도, 공간·움직임, 실제 렌더 검토
7. [과학을 설명하는 소리](docs/SOUND_DESIGN.md) — 원인과 결과를 귀로도 이해시키는 설계

원본 영상은 [references/videos](references/videos)에 실제 파일로 들어 있습니다. 채팅의 임시 첨부 경로나 외부 다운로드에 의존하지 않습니다.
빠르게 훑으려면 [전체 비교 이미지](references/contact-sheets/overview.jpg)와 [참고자료 안내](references/README.md)를 보세요.

## 확정된 방향

- 아이도 이해할 수 있는 직관적인 과학 설명, 길이는 약 1분~1분 30초.
- 한국어 나레이션은 `doroper98/osint_generator`에서 최종 채택한 목소리·억양을 참고.
- 한국어 자막을 적절하게 넣고 실제 발화와 화면 변화에 맞춤.
- 다양한 과학 주제를 다룰 수 있도록 화면 구성·장면 수·표현 방식을 획일적으로 고정하지 않음.
- 입체감 있는 공간에서 현상의 작동 과정을 보여주고, 관찰·원인·비교가 이어지며 설명의 밀도를 높임.
- 화면과 소리를 같은 사건·물리 모형·시간표에 연결하고 중요한 차이를 듣는 여유를 확보함.

음성 기준은 **Supertonic 3 남성 M3, speed 0.95 + 문장 끝 억양 보정**입니다.
단순 M3 원음과 최종 후처리 음성을 구분하세요. [기준값 스냅샷](config/voice-reference.json)은 실행 설정이 아닌 재현을 위한 참조 자료입니다.

## 구조

```text
AGENTS.md                         Codex 작업 안내
HANDOFF.md                        현재 상태와 다음 작업
docs/REFERENCE_ANALYSIS.md        영상별 분석과 관찰 한계
docs/CREATIVE_DIRECTION.md        주제별 시각 설계 방향
docs/ANIMATION_QUALITY.md         밀도·입체감·움직임과 결과 검토
docs/SOUND_DESIGN.md              과학을 설명하는 음향 설계
docs/NARRATION_AND_CAPTIONS.md    음성 근거·후처리·자막
config/voice-reference.json       출처 커밋에 고정한 음성 기준값
references/manifest.json          원본 파일명·영상 정보·SHA-256
references/videos/               초기 MP4 7개와 추가 천둥 참고
references/contact-sheets/       시간표시가 있는 장면 모음
references/narration/            기존 최종 영상의 음성 참고 발췌
references/SHA256SUMS             보관 자산의 무결성 확인값
templates/episode-brief.md        필요에 맞게 바꾸는 기획 메모 양식
samples/korea-power-day/          전력 하루 시제품·모형·자산·실행 안내
```

자산 확인은 저장소 루트에서 `sha256sum -c references/SHA256SUMS`로 할 수 있습니다.
3번 영상은 원본 말미에 디코딩 경고가 있습니다. 원본을 수정하지 않고 보존했으며 상세는 manifest와 분석 문서에 기록했습니다.

이 저장소의 참고 영상은 스타일·설명 방식 연구용입니다. 파일 포함 자체가 원본 영상·음악·로고의 재배포나 완성작 재사용 권리를 새로 부여하지는 않습니다.
