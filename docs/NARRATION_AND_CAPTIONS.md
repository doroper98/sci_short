# 한국어 나레이션과 자막

## 확인한 최종 음성

사용자는 `doroper98/osint_generator`의 최종 목소리를 참고하라고 지시했습니다.
2026-10-16에 main의 설정·표준 문서·후처리 코드를 확인하고 실제 최종 산출물의 provenance와 교차 확인했습니다.

| 항목 | 확인값 |
|---|---|
| TTS | Supertonic 3 |
| 프리셋 | 남성 M3 |
| 언어 | 한국어 `ko` |
| 속도 | `0.95` |
| 합성 단계 | `total_step: 16` |
| 긴 문장 조각 사이 무음 | `silence_sec: 0.3` |
| 최대 조각 길이 | `max_chunk_len: 120` |
| 시드 salt | `v1` |
| 모델 저장소 | `Supertone/supertonic-3` |
| 모델 revision | `3cadd1ee6394adea1bd021217a0e650ede09a323` |
| 문장 끝 보정 | `니다`로 끝나는 발음 텍스트의 마지막 3글자 구간, 0→−4반음 선형 하강 |
| 추가 보정 | 끝 구간 피치 추적의 옥타브 오류 정리 |

정확한 전체 값과 자산 해시는 [voice-reference.json](../config/voice-reference.json)에 보관했습니다.
이 파일은 아직 실행 코드와 연결되지 않았습니다.

### 근거와 고정 출처

소스 main 커밋: `5fa37c141f74f818a2320fa043a67b27a3411aa4`.

- [표준 음성 문서 §0](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/docs/handoff/03_SCRIPT_NARRATION_TTS.md): 사용자 확정 목소리·억양 명시.
- [config.yaml](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/config.yaml): `tts.backend_default`, `tts.supertonic`.
- [video_rules.yaml](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/rules/video_rules.yaml): `tts_rules.prosody.final_fall`.
- [supertonic.py](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/script/tts/supertonic.py), [supertonic_runtime.py](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/script/tts/supertonic_runtime.py): 합성·시드·조각·ONNX 실행.
- [prosody.py](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/script/tts/prosody.py): 실제 최종 억양 처리.
- [script/plan.py](https://github.com/doroper98/osint_generator/blob/5fa37c141f74f818a2320fa043a67b27a3411aa4/script/plan.py): 합성 뒤 정렬·보정·트림을 연결하는 통합 위치.

실제 최종 영상의 근거는 `artifacts/gulf_china_arms_2026-v7.2.0`의 커밋 `2e39d4160080739ceedc74f16a6dc4a852664fca`입니다.
[provenance.json](https://github.com/doroper98/osint_generator/blob/2e39d4160080739ceedc74f16a6dc4a852664fca/provenance.json)에 목소리 `supertonic-3 M3 ×0.95`, 억양 보정 적용 33문장/건너뜀 0문장이 기록되어 있습니다.

[최종 영상 첫 25초 음성 발췌](../references/narration/osint-final-voice-0-25s.m4a)는 해당 `final.mp4`의 오디오를 재인코딩 없이 추출했습니다.
**배경음악이 섞인 최종 믹스**이며, 깨끗한 TTS 학습·복제용 음원이 아닙니다. 이 자료는 기존 프리셋과 후처리의 결과를 비교하기 위한 참고입니다.
브리핑 주제·문체·음악·가로 화면 구성까지 채택한다는 뜻은 아닙니다.

## 원음과 최종 음성의 차이

M3를 speed 0.95로 실행하는 것만으로는 최종 기준을 완전히 재현하지 못합니다.
원 저장소는 합성한 mp3와 정렬 파일을 유지하고, 디코드된 오디오에 문장 끝 보정을 적용한 뒤 원음 기준의 트림 위치를 사용합니다.

```text
표시용 문장 + 발음용 문장
  → Supertonic 3 M3 합성
  → 원음의 글자/어절 시간 정렬
  → 끝 억양 보정(피치 오류 정리 포함, 길이 보존)
  → 원음 기준 트림 위치 적용, 정렬 시간 보정
  → 문장별 음성과 장면 시간축
  → 자막·화면·최종 믹스
```

- 마지막 문장부호를 제외한 발음 텍스트가 `니다`로 끝날 때 적용합니다. 명사형·질문형·`~요`형에 무조건 적용하지 않습니다.
- 마지막 3글자의 첫 글자 시작보다 0.03초 앞에서 시작하고, 마지막 유성 프레임까지 상대적인 피치를 내립니다.
- WORLD/pyworld 처리, 0.03초 크로스페이드, f0 60~260Hz, 5ms 프레임 등이 기준값입니다.
- 원래 억양에 상대적으로 적용하는 값이므로 모든 문장의 실제 들리는 끝 음이 정확히 4반음 낮다는 뜻은 아닙니다.
- 보정 전 mp3 캐시를 최종 음성이라고 착각하지 마세요. 적용 여부·설정·정렬/트림 시간을 결과와 함께 남깁니다.
- 재현할 수 없는 경우 상태와 원인을 알립니다. 다른 TTS로 조용히 대체하지 않습니다.

## 정렬 구현은 독립적으로 선택

원 저장소는 MMS forced alignment + uroman을 사용합니다. 음성 길이를 문자 수로 나눈 추정 시간과 실제 음성 정렬은 다릅니다.
다만 MMS 가중치는 원 저장소 문서에 **CC-BY-NC 4.0**으로 기록되어 있습니다. 향후 공개·수익화 범위에 맞는 정렬 도구를 선택해야 하며, 목소리를 참고한다는 지시가 MMS까지 그대로 채택하라는 뜻은 아닙니다.
Supertonic 코드/가중치도 출처에 각각 MIT/OpenRAIL-M으로 기록되어 있으므로 구현 시 고정 revision의 실제 라이선스 파일을 확인합니다.
현재 이 저장소에는 모델 가중치나 정렬 런타임을 넣지 않았습니다.

## 한국어 대본과 자막

- **표시 텍스트와 발음 텍스트를 분리:** 화면에는 `2.45 GHz`, 발음에는 `이 점 사오 기가헤르츠`처럼 쓸 수 있습니다. 수치나 의미는 서로 같아야 합니다.
- 과학 용어는 먼저 현상을 보여주고 필요한 이름을 붙입니다. 약어·기호를 자동으로 길게 읽는 문장을 피합니다.
- 원 저장소의 브리핑 문체를 그대로 옮기지 않습니다. 아이가 이해할 문장과 관찰 시간을 사용하되 목소리·후처리 기준을 유지합니다.
- 자막은 의미 단위로 끊고 한두 줄을 우선 검토합니다. 글자 수만으로 기계적으로 쪼개거나 글자를 계속 줄여 맞추지 않습니다.
- 실제 발화 시작·끝에 맞춰 노출합니다. 음성 텍스트를 고치면 정렬과 자막도 함께 갱신합니다.
- 중요한 물체나 움직임을 가리지 않도록 위치·여백·대비를 장면별로 판단합니다. 세로 플랫폼의 UI 영역도 실제 출력에서 확인합니다.
- 화면 라벨은 대상 이름, 자막은 설명 문장으로 역할을 나눌 수 있습니다. 긴 문장과 여러 라벨이 동시에 읽히도록 강요하지 않습니다.
- 한국어가 깨지지 않는 글꼴을 사용하고 휴대전화 크기에서 읽어 봅니다. 원 저장소의 854×480 자막 좌표·22px를 세로 영상에 그대로 복사하지 않습니다.
- 화면 자막과 별도로 SRT/VTT를 내보낼 수 있도록 설계하는 것을 권장합니다. 구체적 출력 형식은 구현 시 선택합니다.

## 실제 결과에서 확인할 것

숫자·단위·과학 용어의 발음, 문장 끝 억양과 합성 잡음, 자막 누락·겹침·타이밍, 핵심 움직임을 볼 여유,
배경음이 말소리를 가리는지 확인합니다. 음악의 고정 gain이나 브리핑 영상의 믹스를 과학 영상 전체에 강제하지 않습니다.
