# HDR 판 만들기

2026-11-15 사용자 결정: **"다음 편부터 hdr 적용해"**. 이 결정 뒤에 새로 만드는 편은 번호와 상관없이 SDR 판과 HDR 판을 함께 만듭니다(이미 만든 편은 그대로).
이 문서는 새 편을 만드는 세션이 그대로 따라 하도록 쓴 절차입니다. 수치(203 nit, 4배, 문의 경계)는 제작 세션의 제안이며 사용자 확정이 아닙니다.

## 말의 뜻

- **HDR**(High Dynamic Range, 넓은 밝기 범위): dynamic range 는 음향·전자공학에서 신호의 가장 큰 값과 가장 작은 값의 비를 가리키던 말입니다. 영상에서는 가장 어두운 곳과 가장 밝은 곳의 비입니다.
- **SDR**(Standard Dynamic Range): 지금까지의 영상. 흰색이 낼 수 있는 가장 밝은 값입니다.
- **PQ**(Perceptual Quantizer, SMPTE ST 2084): 밝기(nit)를 사람 눈의 민감도에 맞춰 숫자로 바꾸는 규칙. 우리 HDR 판이 쓰는 방식입니다.
- **nit**: 밝기의 단위(cd/m²). SDR 흰색을 HDR 에서 203 nit 에 둡니다(ITU-R BT.2408 의 기준 흰색).
- **빛 지도**(gain map): "어디가 빛나는가"를 흰색으로 표시한 흑백 영상(`outputs/<slug>/gain.mp4`).

## 한 줄 원리

**SDR 화면은 지금 그대로 그리고, 빛나는 것만 따로 표시해 그곳만 흰색보다 밝게 한다.**

영상미 문법 "빛나는 것은 에너지·신호뿐"을 HDR 에서 그대로 지키는 방법입니다. 자막·계기·이름표·바탕은 SDR 과 같은 밝기로 남고, `lit()` 로 표시한 빛·신호만 최대 4배(흰색 기준 약 812 nit)까지 밝아집니다.

```text
HDR = SDR × (1 + (peak_boost − 1) × 빛 지도 × 문)
  빛 지도  lit() 가 찍은 흰색(0..1)
  문       그 자리의 SDR 화소가 밝은가 — max(R,G,B) 가 0.40 아래면 0, 0.70 위면 1
```

'문'이 있어서 빛 위를 지나가는 어두운 물체는 밝아지지 않습니다. 따로 가릴 필요가 없습니다.

## 만드는 사람이 할 일 (scenes.mjs)

1. `brief.md` 의 "빛나는 것과 그 뜻" 칸에 적은 것(에너지·신호·섬광·빛줄기·달궈진 것)을 **`lit()` 안에서 그립니다.**

```js
import {lit, glow, line, circle} from '../../pipeline/render/index.mjs';

lit(stage, c => {                         // c 로 그린다(stage.ctx 대신). 화면에도 그려지고 빛 지도에도 찍힌다
  glow(c, x, y, 120, T.accent, 0.5);
  line(c, beam, '#FFE2B0', 6);
});
lit(stage, c => circle(c, x, y, 18, '#fff'), {gain: 0.5});   // gain 0..1 — 얼마나 더 밝게(1 = 최대 4배)
```

2. 지킬 것
   - **`lit()` 에 넣지 않는 것**: 자막, 계기 숫자, 이름표, 머리글, 바탕, 빛을 내지 않는 물체. 흰 글자가 번쩍이면 읽기 어렵습니다.
   - **함수는 두 번 불립니다**(화면용, 빛 지도용). 안에서 `Math.random()`, 호출 횟수를 세는 변수, 바깥 값을 바꾸는 코드를 쓰지 않습니다. 툴킷의 `rand(i)` 는 써도 됩니다.
   - `stage.text()` 처럼 `stage.ctx` 에 직접 그리는 호출은 빛 지도에 찍히지 않습니다. 빛나는 글자가 필요하면 `c.fillText` 로 그립니다(드문 경우).
   - 빛 위에 **밝은** 글자나 흰 이름표를 겹치지 않습니다(함께 밝아집니다). 어두운 판을 깐 이름표는 괜찮습니다.
   - 잘라 그리기(`clipRect` 등) 안에서 `lit()` 를 쓸 때는 `lit()` 안에서 다시 자릅니다. 빛 지도는 바깥의 자르기를 따라가지 않습니다(변환과 투명도만 따라갑니다).
   - 사건의 번쩍임(`events.pulse`)처럼 짧은 신호도 `lit()` 로 그립니다. 화면 전체를 덮는 빛은 여전히 쓰지 않습니다.
3. **픽셀 버퍼로 그리는 편**(58번 화풍, `episodes/weather-radar/px.mjs`)은 `lit(stage, …)` 대신 버퍼의 `P.lit(세기, () => { … })` 를 씁니다. 버퍼가 화소마다 빛나는 정도를 함께 적고(뒤에 다른 것을 덧그리면 그 화소의 빛은 꺼짐), 그림을 무대에 올릴 때 그 지도를 `ensureGain(stage)` 의 캔버스에 그대로 넣습니다(`scenes.mjs` `blit()`). 빛 위에 얹는 이름표는 제 밑의 빛 지도를 검게 지웁니다(`T.tag` 의 `unlit`).
4. 확인: `run.sh stills` 가 `outputs/<slug>/stills/contact-sheet-hdr.jpg` 를 함께 씁니다(어둡게 한 화면 위에 빛 지도만 밝게). **빛나야 할 것만 밝은지 직접 열어 봅니다.**

## 명령

```bash
episodes/<slug>/run.sh                 # narrate → stills → render → sfx → mix → finish → hdr → validate
episodes/<slug>/run.sh render hdr validate     # 그림만 고쳤을 때(render 가 visual.mp4 와 gain.mp4 를 함께 쓴다)
SKIP_HDR=1 episodes/<slug>/run.sh      # HDR 판 없이(빛나는 것이 정말 없는 편 — 까닭을 brief.md 에 적는다)
```

| 단계 | 하는 일 | 결과 |
|---|---|---|
| render | 그림과 빛 지도를 같은 반복에서 씀 | `visual.mp4`, `gain.mp4`, `gain.json`(lit 프레임 수) |
| finish | SDR 최종본(지금과 같음) | `final/<slug>.mp4` |
| hdr | 둘을 합쳐 HDR 판 | `final/hdr/<slug>.hdr.mp4`, `final/hdr/hdr.json` |
| validate | SDR 19행 + HDR 6행 | `--hdr require` 라 HDR 판이 없으면 FAIL |

`hdr` 단계가 "빛 지도가 비어 있습니다"(종료 코드 3)로 멈추면 `lit()` 를 한 번도 쓰지 않은 것입니다. `scenes.mjs` 를 고치고 `render` 부터 다시 돌립니다.

## 완성본 폴더와 업로드

```text
finals/<NN>-<slug>/
  <slug>.mp4              SDR 판 — 인스타·틱톡·카탈로그. 폴더 맨 위의 .mp4 는 이것 하나
  hdr/<slug>.hdr.mp4      HDR 판 — 유튜브에 올라간다
  hdr/hdr.json            HDR 판의 설정·최대 밝기 기록
```

- `publish/youtube.py` 는 `hdr/<slug>.hdr.mp4` 가 있으면 그것을 올리고 기록합니다(`config/youtube.json` `prefer_hdr`). 없으면 지금처럼 SDR 판입니다.
- 인스타·틱톡은 늘 SDR 판입니다(인스타 API 문서에 HDR 처리가 적혀 있지 않습니다).
- **이미 올린 편의 폴더에는 `hdr/` 를 넣지 않습니다.** 올릴 파일이 기록과 달라져 업로더가 멈춥니다. HDR 은 새 편에만 씁니다.
- 58번까지의 편과 다시 올리기 대기열의 옛 편은 SDR 그대로입니다.

## 규격과 설정

- HDR 판: HEVC Main 10, `yuv420p10le`, BT.2020 원색, PQ(`smpte2084`), `bt2020nc`, 1080×1920, 30 fps, 소리는 SDR 최종본의 AAC 그대로.
- 메타데이터: 마스터링 모니터 P3-D65·1000 nit, MaxCLL = 203 × 4 를 올림한 값, MaxFALL 300.
- 설정은 `config/hdr.json`: `sdr_white_nits` 203, `peak_boost` 4, `gate` [0.40, 0.70], `crf` 18, `preset` medium. `enabled` 를 false 로 하면 `hdr` 단계가 아무것도 만들지 않습니다.
- 빛 지도는 절반 해상도(540×960)입니다. 가장자리는 합성할 때 SDR 화면이 정합니다.

## 확인한 값 (2026-11-15, 이 컨테이너)

시험 무늬(흰색·호박색·회색·어두운 회색, 위아래에 빛 지도)를 합성해 10비트 luma 코드를 쟀습니다.

| 곳 | 기대 | 잰 값 |
|---|---|---|
| 흰색, 빛 지도 0 | 573 (203 nit) | 573 |
| 흰색, 빛 지도 1 | 703 (812 nit) | 702 |
| 회색 0x80, 빛 지도 1(문 0.34) | 488 | 488 |
| 어두운 회색 0x33, 빛 지도 1(문 0) | 271 | 272 |

- SDR 을 빛의 세기로 되돌릴 때는 감마 2.4(BT.1886)입니다(zscale 의 `tin=bt709`).
- 템플릿 예시로 끝에서 끝까지 돌려 본 결과는 `HANDOFF.md` 2026-11-15 HDR 절에 있습니다.

## 첫 HDR 편 — 64번 기상 레이더 (2026-11-15)

- `finals/64-weather-radar/hdr/weather-radar.hdr.mp4`(17.1 MB, 인코딩 269초), `validate` 25/25.
- 빛나는 것: 전파 묶음, 메아리 고리, 빔, 레이더 화면의 색과 훑는 선, 켜진 칸·막대, 급전부. lit 프레임 4,916/4,943, 빛 지도가 있는 화소는 프레임의 0.1~0.9%(뽑아 본 5프레임).
- **최대 밝기가 설계값을 넘게 기록됐습니다**: `hdr.json` 의 가장 밝은 화소 luma 코드 727(무채색으로 어림해 약 1,047 nit). 설계 최대는 703(812 nit)이고 메타데이터의 MaxCLL 은 812 입니다. 뽑아 본 5프레임의 최대는 707 이하였습니다. 합성 그래프는 16비트 정수에서 4배를 넘길 수 없으므로, 픽셀 그림의 날카로운 경계에서 생긴 HEVC 인코딩 오버슈트로 봅니다 — 어느 프레임의 어느 화소인지까지는 확인하지 못했습니다. 다음에 볼 것: `config/hdr.json` `max_cll` 을 실제 값에 맞출지(제안, 결정 아님).
- 색의 자(범례)를 처음에 `P.lit()` 에 넣었다가 뺐습니다 — 화면의 '색 설명'은 신호가 아닙니다.
- **HDR 화면에서 보지 못했습니다.** 아래 세 가지는 이 편이 올라간 뒤 사용자가 휴대전화에서 봅니다.

## 확인하지 못한 것

- **HDR 화면으로 본 모습.** 제작 세션은 HDR 화면을 볼 수 없습니다. 밝기가 과한지, 색이 틀어지는지는 사용자가 휴대전화에서 봅니다.
- **유튜브가 쇼츠를 HDR 로 재생하는가.** 공식 문서를 찾지 못했습니다. 2023년 보도는 쇼츠가 HDR 로 재생되지 않는다고 했고, 2026년 2월에는 HDR 처리 장애 보고가 있었습니다(비공식).
- **SDR 기기 시청자가 보는 자동 변환본.** 유튜브가 HDR 판을 SDR 로 바꿔 보여 줍니다. 색과 밝기가 SDR 판과 달라질 수 있고 우리가 정하지 못합니다.
- 첫 HDR 편(64번)이 올라가면 위 세 가지를 확인해 이 문서와 `docs/CHANNEL_GROWTH.md` 에 적습니다. 문제가 있으면 `config/youtube.json` 의 `prefer_hdr` 를 false 로 바꾸면 그 뒤 업로드는 SDR 판으로 돌아갑니다(HDR 판 파일은 남습니다).

## 구현

- `pipeline/render/hdr.mjs` — `lit()`, 빛 지도 캔버스. `pipeline/render/encode.mjs` — `gain.mp4`·`gain.json`, 빛 지도 묶음(`contact-sheet-hdr.jpg`).
- `pipeline/hdr.py` — 합성과 인코딩, 규격·최대 밝기 확인, `hdr.json`.
- `pipeline/validate.py --hdr auto|require|skip`, `publish/youtube.py`(`upload_file`, `check_hdr`), `pipeline/catalog.py`(`hdr`, `hdr_bytes`).
