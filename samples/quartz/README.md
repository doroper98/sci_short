# 수정은 어떻게 자랄까?

한국어 내레이션·한국어 자막으로 수정과 석영의 결정 성장을 설명하는 약 1분 54초 세로 영상입니다.
열수 성장이라는 한 경로를 따라 **용존 성분 → 과포화 → 핵 형성 → 표면 결합 → 반복 구조 → 결정면**을 연결합니다.

사용자의 추가 요청에 따라 용존 규산 분자, 수산기의 표면 축합, 물 분자 형성, 산소 공유, 장거리 반복 구조에 시간을 더 배정했습니다. 결합이 생겼다는 사실만으로 결정이라고 말하지 않고, 결정질과 비정질을 구분합니다.

## 제작 내용

- 화면: 1080×1920, 30fps. 회전하는 결정 외형, 암석 틈의 유체, 핵 형성, 실제 좌표 기반 원자 구조, 표면 성장과 공간 제약 비교를 직접 렌더합니다.
- 내레이션: 한국어 Supertonic 3 M3, speed 0.95, 16 steps. 문장마다 실제 생성 음성 길이로 장면·자막 시간을 계산합니다.
- 자막: 한국어 번인 자막 + 별도 SRT. 단어별 강제 정렬이 아닌 문장별 실제 음성 경계입니다.
- 소리: 원자 구조가 추가되는 사건을 같은 시간표의 하이라이트·음형으로 표현합니다. 반복 음형은 구조의 반복을 설명하며 실제 원자의 소리로 소개하지 않습니다. 자체 합성한 잔잔한 음악은 말소리 아래에 배치합니다.
- 관찰 여유: 원자 구조·핵·표면 성장 장면은 문장이 끝난 뒤에도 잠시 움직임을 관찰할 수 있게 했습니다.

## 음성 모델 접근 문제의 해결

현재 환경은 Hugging Face 연결을 프록시에서 차단합니다. 네트워크 설정 초안과 실행 중인 정책이 다르다는 점을 확인했습니다.
프록시를 우회하지 않고, 허용된 GitHub에서 **변환 도구 개발자가 배포하는 Supertonic 3 INT8 모델**을 내려받아 로컬에서 합성했습니다.

배포처: [k2-fsa/sherpa-onnx, 2026-05-11](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2).
아카이브와 모든 파일의 SHA-256은 [voice-model.json](assets/voice-model.json)에 고정했습니다. `fetch_model.py`와 `narrate.py`가 이를 검사합니다.
M3는 `F1..F5, M1..M5` 사전순 배열의 speaker ID 7입니다. 매핑 근거는 manifest에 고정한 upstream 변환 코드입니다.

이는 원래 참조 모델과 **동일한 파일이 아닙니다**. 원래 FP32 모델을 INT8로 변환한 런타임이며, 기존 M3 프리셋을 유지합니다. `config/voice-reference.json`의 원래 해시를 새 파일에 맞춰 바꾸지 않았습니다.
이번 대본은 `요/죠/까요` 종결형이므로, 기존 규칙의 `니다` 접미사에만 적용하는 끝 억양 보정 대상이 없습니다.
Upstream README는 모델 라이선스를 OpenRAIL-M, 예제 코드를 MIT로 안내합니다. 모델 가중치는 Git에 포함하지 않습니다.

## 과학 근거와 단순화

석영은 SiO₂ 광물이며 투명한 수정은 석영의 한 변종입니다. 마그마에서 결정화할 수도 있고, 열수에서 석출될 수도 있습니다. 영상은 열수 성장만 자세히 다룹니다.
냉각으로 용해도가 낮아져 과포화가 되는 경로를 보여주며, 모든 조건의 냉각이 반드시 석출을 일으킨다는 보편 법칙으로 사용하지 않습니다. 실제 핵 형성과 성장은 온도·압력·유체 조성·불순물 등에 영향을 받습니다.

원자 구조는 pymatgen의 석영 SiO₂ ICSD 174 시험 자료를 사용했습니다.

- [원자료](https://github.com/materialsproject/pymatgen/blob/9438adb2e5bbef0512f1a5764747b22336c3151d/test-files/analysis/chemenv/json/test_T--4_SiO2_icsd_174.json)
- 저장 원본: [quartz-structure.json](assets/quartz-structure.json).
- 렌더용 부분 구조: [lattice.json](assets/lattice.json), 규소 19개를 중심으로 선택한 71개 원자와 76개 Si–O 결합.
- 모든 선택된 Si는 O 네 개에 연결되고, Si–O 거리는 약 1.61 Å입니다. O는 최대 두 Si에 연결됩니다. 잘라낸 가장자리에는 이웃이 생략되므로, 부분 구조의 전체 원자 수 비율을 벌크 화학식으로 해석하지 않습니다.

구·막대·사면체는 설명용 표현입니다. 용액 속 성분을 독립된 Si/O 원자들이 떠다니는 실제 모습으로 주장하지 않습니다. 결합·성장 사건은 수치 동역학 계산이 아닌 교육용 시간표입니다. 핵의 원자 수와 시간은 실제 임계핵 측정값이 아닙니다.
결정 외형은 육각기둥과 단순화한 종단면으로 그렸습니다. 석영의 결정계는 삼방정계이며, 육각기둥 외형을 내부의 육방정계 분류와 혼동하지 않습니다. 모든 석영이 뚜렷한 기둥·끝을 갖는다고 설명하지 않습니다.
성장 속도가 면마다 다르고 공간이 제한되면 겉모양이 달라집니다. 불규칙한 외형과 내부 결정질은 양립할 수 있습니다.

### 분자와 결합 장면의 고증

용액의 예로 중성에 가까운 조건에서의 규산 `H4SiO4 = Si(OH)4`를 보여줍니다. pH·온도 등에 따라 이온화 상태와 용존 종은 달라질 수 있습니다. 용액의 분자와, 독립된 SiO₂ 분자들의 집합이 아닌 석영의 삼차원 공유결합망을 구분합니다.

[USGS PHREEQC 데이터베이스의 Quartz 상 반응](https://github.com/usgs-coupled/phreeqc3/blob/master/database/phreeqc.dat)은 `SiO2 + 2 H2O = H4SiO4`로 주어집니다. 가져온 발췌는 [chemistry-source.txt](assets/chemistry-source.txt)에 보존했습니다. 이 식은 벌크 용해·석출 평형의 근거이며, 유일한 원자 수준 반응 경로를 증명하는 자료로 사용하지 않습니다.

`chemistry.mjs`는 **수산화된 표면의 수산기와 규산이 축합하는 대표적 결합 단계**를 단순화해 보여줍니다. 하나의 Si–O–Si 다리가 생성되는 동안 표면의 산소는 남고, 다른 산소와 수소 두 개가 물 분자로 이어집니다. 새로 붙은 규소의 나머지 OH는 후속 표면 반응에 참여합니다. 한 번의 결합 단계에서 물 한 분자가 나오는 그림을, SiO₂ 한 단위의 전체 순반응과 혼동하지 않습니다.

- 반응 전후 표시한 Si 2개·O 8개·H 5개 보존, 두 Si의 4배위, 수소의 1개 결합, 공유 산소의 두 Si 연결을 검사합니다.
- 규소 주변 산소는 사면체로 배치합니다. 설명용 Si–O 약 1.62 Å, O–H 약 0.96 Å, 물의 굽은 H–O–H 약 104.5°, 예시 Si–O–Si 약 144°를 사용합니다. 물에 붙은 수소를 직선 분자로 만들지 않습니다. Si–O–H는 약 115°로 단순화했으며 고정된 보편 각도로 소개하지 않습니다.
- 반응 중의 이동·보간은 분자동역학이나 전이상태 계산이 아닙니다. 물속 실제 성장에는 흡착·양성자 이동·탈수·재배열 등 여러 단계와 표면 조건이 영향을 줍니다. 표면 절단부의 나머지 벌크 연결은 그림에서 생략됩니다.
- 규칙적인 격자 자리에서 결합이 반복돼 장거리 질서가 생기는 것을 결정화의 핵심으로 설명합니다. 같은 Si–O 공유결합도 배열이 불규칙하면 비정질 실리카가 될 수 있습니다.

## 재현

FFmpeg와 Noto CJK·DejaVu 글꼴, Node.js, Python 3.12 이상이 필요합니다.

```bash
cd /workspace/sci_short
python -m venv /workspace/.venv-crystal
/workspace/.venv-crystal/bin/pip install -r samples/quartz/requirements.txt
npm ci --prefix samples/quartz --cache /workspace/.cache/npm --ignore-scripts
/workspace/.venv-crystal/bin/python samples/quartz/fetch_model.py
/workspace/.venv-crystal/bin/python samples/quartz/narrate.py
cd samples/quartz
node model.mjs --validate
node render.mjs
/workspace/.venv-crystal/bin/python sound.py
node render.mjs --video
/workspace/.venv-crystal/bin/python finish.py
```

산출물: `outputs/quartz/quartz-growth-ko.mp4`, `captions.srt`, `timeline.json`, `validation.json`.
`QUARTZ_TTS_MODEL` 환경 변수로 모델 위치를 바꿀 수 있습니다. 문장 텍스트가 바뀌면 해당 음성 캐시를 갱신합니다. 장면·음향은 반드시 새 시간표로 다시 생성해야 합니다.

검증은 최종 디코딩, 인코딩 후 프레임 확인, 문장 시간·구조 모델 검사, 자동 음성 인식을 구분해 기록합니다. 자동 음성 인식은 직접 청취를 대신하지 않으며, 실제 휴대전화 재생 여부도 별도로 기록합니다.
