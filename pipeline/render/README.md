# pipeline/render — 세로 과학 쇼츠 렌더 툴킷

Node 22 + `@napi-rs/canvas` 1.0.11(정확히 고정) + ffmpeg. 1080×1920, 30 fps 화면을 프레임 단위로 그려 ffmpeg로 인코딩합니다.
에피소드는 `episodes/<slug>/scenes.mjs` 하나만 쓰고, 나머지는 이 툴킷과 `episodes/_template/render.mjs`가 처리합니다.

```bash
cd pipeline/render && npm install          # node_modules는 Git에 넣지 않음 (플랫폼 바이너리 포함)
npm test                                   # node --test tests/test_*.mjs
~/.venv-scishort-render/bin/python fetch_fonts.py   # GmarketSans + Noto Sans KR → assets/fonts/ (Git 제외)
```

## 모듈

| 파일 | 내용 |
|---|---|
| `stage.mjs` | `createStage({width,height,fps,theme})` → `{canvas, ctx, W, H, FPS, safe, theme, text(), wrap(), measure(), drawSafeZones(), draw}`. 글꼴 등록, `SAFE_ZONES`, `fontString(role,size,weight)` |
| `draw.mjs` | `circle ring/arc line poly rect glow sphere contactShadow arrow curve withAlpha clipEllipse clipRect`(ctx 첫 인자 또는 `stage.draw.*`), `leader scaleBar`(stage 첫 인자), `rgba mix`, `clamp lerp invLerp remap smooth easeInOut easeOut easeIn bump`, `rand rng`, `project camera lambert`, `DrawQueue` |
| `timeline.mjs` | `loadTimeline(file)` → `Timeline`: `sceneAt(t)`, `sentenceAt(t)`, `at(ref, offset)`, `wordStart(id, word)`, `progress(t, from, to)`, `captionAt(t)`, `events(spec)`, `isDegraded()` |
| `captions.mjs` | `drawCaptions(stage, tl, t, opts)`(문장 역할), `drawLabel(stage, text, x, y, opts)`(이름 역할), `layoutCaption`, `parseMarked` |
| `chrome.mjs` | `THEMES`(noturno 기본·slate·graphite·navy), `resolveTheme`, `background`, `header`, `progressBar`, `sourceLine`, `endCard`. 모두 선택 사항 |
| `encode.mjs` | `renderVideo({stage, duration, frame, out})` → visual.mp4(무음), `renderStills({stage, times, frame, outDir})` → JPG + `contact-sheet.jpg` |
| `fetch_fonts.py` | 글꼴 내려받기·변환, `assets/fonts/fonts-manifest.json`에 sha256 기록 |

`index.mjs`가 전부 다시 내보냅니다: `import {createStage, …} from '../../pipeline/render/index.mjs'`.

## 글꼴 역할

| 역할 | 글꼴 | 쓰는 곳 |
|---|---|---|
| `display` 700 / 500 | GmarketSans Bold / Medium (자간 −0.011em) | 장면 제목, 헤드라인, 큰 숫자, kicker(500, 대문자·자간 넓힘, accent) |
| `body` 400 / 500 / 700 | Noto Sans KR | 자막(500), 라벨(500), 출처 줄(400) |
| 대체 | 시스템 Noto Sans CJK → DejaVu Sans | 빠진 글리프(GmarketSans의 공백, Noto Sans KR의 ₂ 등) |

`stage.text(s, x, y, {role:'display', weight:700, size:70, color, align, maxWidth, tracking, upper})`. 기본 `textBaseline`은 `middle`.
assets/fonts가 비면 경고 한 줄과 함께 시스템 Noto CJK로 그리고, 한국어 글꼴이 아예 없으면 오류로 멈춥니다.
@napi-rs/canvas는 가변 글꼴의 기본 인스턴스(굵기 100)만 쓰므로 `fetch_fonts.py`가 400/500/700 고정 파일을 만듭니다.

## 화면 영역 (1080×1920)

| 상수 | 값 | 의미 |
|---|---|---|
| `safe.top` | 200 | 제목 영역. kicker·진행 막대는 여기, 제목은 ~200–420 |
| `safe.bottom` | 420 | 플랫폼 UI(채널명·설명·음악). 핵심 내용 금지 → `safe.y1 = 1500` |
| `safe.right` | 140 | 좋아요·댓글 버튼. 라벨·핵심 물체 금지 → `safe.x1 = 940` |
| `safe.left` | 60 | 여백 |
| `safe.captionTop` | 1360 | 기본 2줄 자막 판의 위쪽. 핵심 현상은 ~1340 위에 |

`--safe` 옵션(또는 `stage.drawSafeZones()`)으로 스틸에 겹쳐 확인합니다. 실제 앱 화면에서의 확인은 별도입니다.

## 자막

- `timeline.captions` 큐를 `start`부터 `min(다음 큐 start, end + 0.15 s)`까지 그립니다. 0.08 s 페이드.
- Noto Sans KR 500, 44 px, 최대 폭 840 px, **최대 2줄·한 줄 22자(공백 포함)**, 두 줄은 길이를 고르게 나눕니다. 넘치면 한 번만 0.92배로 줄이고 경고합니다(계속 줄이지 않음 — 대본에서 큐를 나누세요).
- 기본 위치: 마지막 줄 baseline `y = H − safe.bottom − 20 ≈ 1480`, 가로 중심은 안전 열 중앙(500). 장면마다 `captionLayout = {scene: {y: 1300}}`로 옮길 수 있습니다(현상이 화면 아래쪽일 때).
- 텍스트에 `**강조**`가 있으면 accent 색으로 그립니다(SRT와 validate는 표시를 지움).
- `drawLabel`은 대상 이름용(작은 색 상자 + 500 굵기, 판 없음 기본). 자막과 역할을 섞지 마세요.

## scenes.mjs 계약

```js
export const theme = 'noturno';                 // 또는 {base:'noturno', accent:'#…'}
export const events = [{id: 'flash', at: ['s04', 0.2]}];   // 화면 전용 사건(소리 사건은 sound.json)
export const captionLayout = {phenomenon: {y: 1300}};
export const titles = {hook: ['KICKER', '제목\n두 줄', '부제'], …};   // 템플릿 overlays가 사용
export const scenes = {
  hook(stage, t, p, ctx) { … },                 // p: 장면 안 0..1, ctx: {tl, events, theme, scene, local, kit}
  …                                             // 키 = script.json의 scene id (전부 있어야 함)
};
export function overlays(stage, t, ctx) { … }   // 선택: 장면 뒤·자막 앞
export function background(stage, t, ctx) { … } // 선택: 기본은 chrome.background
```

`render.mjs`는 매 프레임: 배경 → `scenes[sceneAt(t).id]` → `overlays` → 자막(맨 마지막) 순서로 그립니다.
`ctx.events`는 `sound.json`의 `events`와 `scenes.mjs`의 `events`를 같은 타임라인으로 계산한 **하나의 목록**입니다.
`events.pulse(id, t, dur)`(번쩍임), `events.after(id, t, dur)`(이후 상태), `events.age(id, t)`.
render는 `outputs/<slug>/events.json`을 쓰고, `sfx.py --events-check`가 소리 시각과 1 ms 단위로 대조합니다.

### 시간 참조(`at`) 문법 — timeline.mjs와 audio/sfx.py가 같은 규칙

| 형태 | 뜻 |
|---|---|
| `12.0` | 절대 초 |
| `"s05"` / `"s05:end"` / `"s05:mid"` | 문장 시작/끝/중간 |
| `"hook"` / `"hook:end"` | 장면 시작/끝 |
| `["s05", 0.4]` | 참조 + 오프셋(음수 가능) |
| `{"sentence":"s05","word":"결합","offset":0.1}` | 정렬된 `chars`에서 그 낱말의 첫 글자가 발음되는 시각 |
| `{"scene":"hook","p":0.5}` | 장면 안 비율 |

## 3D와 깊이

`project([x,y,z], {angle, tilt, scale, cx, cy, distance})` → `[x, y, depth, s]`(depth가 클수록 가까움, s = 원근 배율).
면·구·결합을 `DrawQueue.push(depth, fn)`에 넣고 `flush()`하면 먼 것부터 그립니다. 면 밝기는 `lambert(normal, light)`.
비교 장면에서는 카메라를 고정하고(변수 하나만 바꾸기), 대상만 회전시키세요. 템플릿의 `tank()`가 예입니다.

## 명령 순서 (에피소드 하나)

```bash
python pipeline/new_episode.py <slug> --title "…"                 # episodes/<slug>/ 생성
# brief.md → script.json → scenes.mjs → sound.json 작성
episodes/<slug>/run.sh                                             # 전체
episodes/<slug>/run.sh stills                                      # 스틸만: outputs/<slug>/stills/contact-sheet.jpg
SCISHORT_ROOT=$PWD node episodes/<slug>/render.mjs --stills --safe # 안전 영역 겹쳐 보기
SCISHORT_ROOT=$PWD node episodes/<slug>/render.mjs --video         # outputs/<slug>/visual.mp4
```

`render.mjs` 인자: `--timeline F`(기본 `outputs/<slug>/narration/timeline.json`), `--out DIR`, `--scenes F`, `--sound F`, `--safe`.

## 성능 (이 컨테이너, 4 vCPU 기준 실측)

템플릿 장면 1080×1920: 렌더+libx264(medium, crf 18) 합쳐 약 23–24 fps → 180초 영상 ≈ 4분. 무거운 장면(수백 개 구·그라디언트)은 더 느립니다.
`getImageData()`는 straight RGBA를 돌려주며(확인함) ffmpeg에 `-pix_fmt rgba`로 넘기고 BT.709 limited-range yuv420p로 변환합니다.
