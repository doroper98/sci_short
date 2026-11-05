# 대한민국 전기의 하루

사용자 첨부 영상의 시계·전력 흐름·시간 그래프 구성을 한국의 발전원으로 확장한 **90초 / 1080×1350 / 30fps** 애니메이션이다.
0시부터 24시까지 원자력, 석탄, 가스(LNG), 유류, 태양광, 풍력, 수력, 바이오·기타재생의 출력을 보여준다.
양수·ESS의 충전과 방전, 전력망의 소비를 함께 연결한다. 마지막에는 연료전지·조력 등 세부 발전 방식도 설명한다.

## 실제 통계와 설명 모형

**특정 날짜의 실측 전력거래소 운전 자료를 재현한 영상이 아니다.**
2026-10-17 현재 이 실행 환경에서 사용자 지정 KPX URL은 프록시의 CONNECT 403으로 차단되었다.
대신 접근 가능한 Our World in Data 공개 CSV와 코드북에서 한국의 2025년 연간 발전량을 확인했다.

| 통계 항목 | 2025년 발전량(TWh) | 비중 |
|---|---:|---:|
| 원자력 | 184.67 | 29.56% |
| 석탄 | 194.53 | 31.14% |
| 가스 | 174.58 | 27.95% |
| 태양광 | 37.80 | 6.05% |
| 풍력 | 3.64 | 0.58% |
| 수력 | 3.80 | 0.61% |
| 유류 | 5.95 | 0.95% |
| 바이오 포함 기타재생 | 19.69 | 3.15% |
| 합계 | 624.66 | 100% |

- [OWID 원본 CSV](https://github.com/owid/energy-data/blob/master/owid-energy-data.csv)
- [OWID 코드북](https://github.com/owid/energy-data/blob/master/owid-energy-codebook.csv)
- 코드북의 상위 출처: [Ember Yearly Electricity Data](https://ember-energy.org/data/yearly-electricity-data/), [Energy Institute Statistical Review](https://www.energyinst.org/statistical-review/).
- [사용자가 지정한 KPX 페이지](https://new.kpx.or.kr/powerinfoSubmain.es?mid=a10606030000)는 이번 실행에서 내용을 열어 검증하지 못했다.

사용한 한국 행, 다운로드 SHA-256, 확인 시각·리비전은 `data/korea-annual-2025.json`에 저장했다.
원본 코드북도 `data/source-codebook.csv`에 보관했다. 이 수치는 국제 통계의 분류·집계 범위이며 KPX 전력시장 발전량이나 설비용량과 동일하다고 가정하지 않는다.
`other_renewable_electricity`는 바이오를 포함하므로 `biofuel_electricity`를 다시 더하지 않는다.
연료전지·폐기물·조력은 국내 세부 기술을 소개하는 별도 설명이다. 이 기술들의 비중을 위 통계에 임의로 추가하거나 중복 합산하지 않았다.

시간대별 출력 곡선은 직접 설계했다. 각 발전원의 24시간 발전량 적분이 **연간 발전량 ÷ 365**와 같도록 정규화했지만, 이는 실제 어느 하루의 운전과 같다는 뜻이 아니다.
제목 아래, 출력 숫자 옆, 영상 하단에 설명용·예시 표시를 유지한다. 연간 발전량(TWh), 순간 출력(GW), 저장량(GWh)을 구분한다. 화면 출력은 0.1GW로 반올림하므로 표시값끼리 합산하면 0.1GW 차이가 날 수 있다.

## 모형의 가정과 검증

- 원자력은 거의 일정하고, 화력은 완만하게 변화한다. 태양광은 06~18시에만 나오며, 풍력은 별도의 가변 곡선을 쓴다. 이는 특정 계절·날씨의 관측이 아니다.
- 소비 수요는 저장 충전을 제외한 소비이며 외부 실측 곡선이 아니라 발전과 저장의 균형에서 도출했다. **총 발전 + 저장 방전 = 소비 수요 + 저장 충전**을 매 시점에 만족한다.
- 송전·배전 손실, 출력제어, 예비력, 기동 제약, 지역별 송전 제약은 생략했다. 급전 최적화나 운영 계획을 예측하는 모형이 아니다.
- 양수 18GWh / ESS 6GWh는 설명을 위한 가상 용량이며 국내 전체 설치 규모가 아니다.
- 양수의 충전/방전 효율은 0.88/0.90, ESS는 0.95/0.95로 가정했다. 저장 에너지의 변화에 이 효율을 반영했다.
- 선의 움직이는 점은 전력 전달 방향을 보여주는 기호이며 전자의 실제 이동 속도가 아니다. SOC 막대는 가상 저장량을 실제 계산해서 표시한다.
- `model.mjs`는 1분 간격 1,441개 시점에서 수급 균형, 야간 태양광 0, 음수 출력 없음, 저장량 범위와 발전량 적분을 검증한다.

## 참고 영상에서 채택한 연출

첨부 파일은 43.97초, 720×900, 30fps, 오디오 스트림 없는 영상이다.
태양광·공장·계통·배터리 사이의 흐름, 빠르게 흐르는 시계, 누적 그래프를 함께 보여주는 상업시설 ESS 설명 영상이다.
이번 영상에서는 이 정보 구조를 참고했고, 그림·문구·로고·영상 프레임을 복제하지 않았다.
시설의 정전·독립운전 사례를 한국 전체의 정상적인 하루 사건처럼 옮기지 않았다.

## 이미지와 소리

`assets/power-atlas.png`는 이번 작업에서 이미지 생성 도구로 제작한 12종 발전·저장·소비 시설 그림이다.
발전원별 그림, 물·배터리 저장장치와 도시의 모양을 구분했다. 원전 그림은 국내 해안 원전의 형태를 참고한 돔·터빈 건물이며 특정 발전소의 정확한 설계도가 아니다.
화면의 선·입자·회전 표시·그래프·수치·시간은 코드로 매 프레임 다시 그린다.

배경음악은 사인파와 배음으로 직접 합성한 잔잔한 90초 음악이다. 외부 음원이나 첨부 영상의 오디오는 사용하지 않았다.
**내레이션은 없다.** 기존 M3 목소리를 다른 음성으로 대체하지 않았다. 화면 자막은 설명 시간표이며 음성 정렬 결과가 아니다.

## 재생성과 실행

Node.js 24, Python 3 + NumPy, FFmpeg, Noto Sans CJK 글꼴을 사용한다. 현재 환경에서 실행 검증했다.
`@napi-rs/canvas` 0.1.80에는 이 장면의 숫자 일부가 누락되는 출력 문제가 있어, 실제 결과를 확인한 **1.0.11**로 고정했다.

```bash
cd /workspace/sci_short
npm ci --prefix samples/korea-power-day --cache /tmp/power-npm-cache
node samples/korea-power-day/render.mjs
node samples/korea-power-day/render.mjs --video
python samples/korea-power-day/music.py
ffmpeg -v error -y -i outputs/korea-power-day/picture.mp4 -i outputs/korea-power-day/music.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 160k -ar 44100 -t 90 -movflags +faststart outputs/korea-power-day/korea-power-day.mp4
ffmpeg -v error -i outputs/korea-power-day/korea-power-day.mp4 -f null -
```

기본 렌더 명령은 대표 PNG 6장과 수치 검증 결과를 출력한다. `--video`는 전체 영상을 만든다.
생성물은 `outputs/korea-power-day/` 아래에 있고 Git에서는 제외한다. 전달용 MP4는 미리보기 브랜치에 별도로 보존한다.
직접 청취나 실제 휴대전화에서의 재생을 확인했다고 주장하지 않는다. 최종 인코딩 검증 결과는 `validation.json`에 기록한다.
