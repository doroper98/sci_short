# 렌더용 글꼴 (Git에 넣지 않음)

글꼴 파일은 저장소에 커밋하지 않습니다. 다음 명령으로 받아 이 폴더에 둡니다.

```bash
python3 -m venv ~/.venv-scishort-render
~/.venv-scishort-render/bin/pip install -r pipeline/audio/requirements.txt   # fonttools 포함
~/.venv-scishort-render/bin/python pipeline/render/fetch_fonts.py
```

| 역할 | 글꼴 | 파일 | 출처 | 라이선스 |
|---|---|---|---|---|
| 제목·헤드라인·큰 숫자·kicker | GmarketSans Bold 700 / Medium 500 (Light 300 보조) | `GmarketSans{Bold,Medium,Light}.otf` | `https://raw.githubusercontent.com/projectnoonnu/noonfonts_2001/master/GmarketSans*.woff` (WOFF → fontTools로 OTF 변환, CFF 윤곽) | Gmarket 무료 글꼴: 개인·상업 사용 무료. 재배포 전 약관 확인 |
| 자막·라벨·출처 줄 | Noto Sans KR 400/500/700 | `NotoSansKR-{Regular,Medium,Bold}.ttf` (가변 `NotoSansKR[wght].ttf`에서 fontTools instancer로 고정 굵기 생성) | `https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf` | SIL Open Font License 1.1 |
| 대체 | 시스템 Noto Sans CJK KR, DejaVu Sans(₂ 같은 기호) | `/usr/share/fonts/...` | OS 패키지 `fonts-noto-cjk`, `fonts-dejavu` | OFL / Bitstream Vera 계열 |

- 받은 원본과 변환 파일의 sha256은 `fonts-manifest.json`에 기록됩니다(이 JSON은 추적).
- GmarketSans 웹 배포본에는 공백(U+0020) 글리프가 없습니다. 툴킷은 항상 `GmarketSans → Noto Sans KR → Noto CJK → DejaVu` 순서의 대체 목록으로 그려 공백·첨자가 깨지지 않게 합니다.
- @napi-rs/canvas는 가변 글꼴의 기본 인스턴스(굵기 100)만 노출하므로 고정 굵기 파일을 별도로 만듭니다.
- 파일이 없으면 `pipeline/render/stage.mjs`가 경고 한 줄을 출력하고 시스템 Noto Sans CJK로 대체합니다. 한국어 글꼴이 하나도 없으면 오류로 중단합니다.
