# 에피소드 폴더 `weather-radar` — 64번 기상 레이더(화풍 시험 둘째 편: 픽셀 일러스트 + 3D, HDR 첫 편)

2026-11-15 사용자: "하늘을 꼭 노을로 정해놓지 마. 기상레이더 편 한번 만들어봐 풀로". 58번 쓰나미의 픽셀 화풍에 three.js 3D 층을 더한 편입니다. 이 화풍을 다른 편에 넓히는 결정은 아직 없습니다. 완성본은 [finals/64-weather-radar](../../finals/64-weather-radar/README.md).

| 파일 | 내용 |
|---|---|
| `brief.md` | 기획·근거·출처·단순화·대본 검수 기록·검증 메모 |
| `script.json` | 문장 19개(Fable 검수 반영) |
| `px.mjs` | 픽셀 그림 도구(270×480 버퍼, 흐린 낮의 색 한 벌, 점묘). 58번 것에 **빛 지도**(`P.lit()` — 화소마다 빛나는 정도)와 **3D 층 합성**(`blit3d`)을 더함 |
| `scene3d.html` | three.js 장면: 관측소·땅·거리 고리·비구름·빗줄기·빔. 색은 칠하지 않고 화소마다 (물체 번호, 밝기)만 쓴다 |
| `three3d.mjs` | 헤드리스 Chromium(Playwright)에서 `scene3d.html` 을 열어 프레임마다 3D 층을 받아 온다 |
| `world.mjs` | 2D 세계(하늘·먼 산·땅·비구름)와 계기(레이더 화면, 시간–세기 화면, 방울 상자, 칸), 모형(빔의 높이, 반사도) |
| `scenes.mjs` | 장면(모두 `async`). `plan(tl)` 이 문장·낱말 시각에서 모든 장면의 시계를 만든다. 글자는 키운 그림 위에 얹는다 |
| `emit_sound.mjs` | `sound.json` 을 `plan()` 과 모형에서 써 넣는다 |
| `render.mjs` | 템플릿과 달리 장면을 `await` 하고 끝에 `close()`(브라우저 종료)를 부른다 |
| `sound.json` | 생성물(직접 고치지 않는다) |

```bash
(cd pipeline/render && npm install)                    # three.js(선택 의존성)까지 설치
python3 episodes/tsunami/fetch_pixel_font.py           # 한 번(머리글 글꼴 Galmuri11 Bold)
episodes/weather-radar/run.sh narrate                  # 음성(대본이 바뀌면)
node episodes/weather-radar/emit_sound.mjs             # 타임라인이나 plan() 이 바뀌면 소리 표를 다시 쓴다
SKIP_NARRATE=1 episodes/weather-radar/run.sh stills render sfx mix finish hdr validate
```

- **3D 층의 약속**: 세계는 레이더가 원점, 북 = −z, 동 = +x, 위 = +y. `frame({cam, head, tilt, show, beamLen, points})` 가 층(`solid`, `rain`, `beam`)과 급전부·빔 끝의 화면 자리를 돌려준다. 움직이지 않는 그림(옆에서 본 관측소)은 `key` 를 주어 한 번만 그린다.
- **필요한 것**: Playwright 와 Chromium(Claude 클라우드 세션에는 깔려 있음), `pipeline/render/node_modules/three`. 없으면 `three3d.mjs` 가 까닭을 적고 멈춘다. WebGL 은 소프트웨어 렌더(SwiftShader)로 돈다 — 270×480 이라 초당 약 18프레임으로 렌더된다.
- **HDR**: 픽셀 버퍼는 `lit(stage, …)` 대신 `P.lit(세기, () => …)` 를 쓴다. `blit()` 이 화소별 빛 지도를 `stage.gain` 에 그대로 넣는다. 이름표(`T.tag`)는 제 밑의 빛을 끈다. 색의 자(범례)·글자·바탕은 빛나지 않는다.
- **하늘**: 이 편은 비 오는 흐린 낮이다. 픽셀 화풍의 하늘은 노을로 정해져 있지 않다 — 주제에 맞춰 고른다.
- 한계 장면은 3D 조각을 쓰지 않는다: 둥근 지구의 원호 위에서 관측소가 기울어 서야 해서 작은 2D 레이더(`scenes.mjs` `radar2d`)로 그린다.
- 쏘고 듣는다 장면은 왕복 한 번이다(`plan()` 의 `pEmit`·`pHit`·`pBack`). 같은 왕복을 되풀이하지 않는다(2026-11-15 사용자 지적 — `brief.md` 검증 메모).
- 작은 크기로 그릴 때(`stationScale × zoom < 0.45`)는 접시의 가는 버팀대를 뺀다(점으로 뭉개져 얼굴처럼 보인다).
