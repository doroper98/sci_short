#!/usr/bin/env python3
"""화풍 시안의 곁들임 글꼴(Noto Serif KR, OFL)을 받아 굵기 600 고정 파일로 만든다.

    ~/.venv-scishort-render/bin/python samples/look-proposal-pixel/fetch_serif.py

결과: assets/fonts/NotoSerifKR-SemiBold.ttf (Git 제외). @napi-rs/canvas 는 가변 글꼴의 기본 굵기만 쓰므로 고정 파일이 필요하다.
표준 글꼴(GmarketSans, Noto Sans KR)은 pipeline/render/fetch_fonts.py 가 받는다 — 이 파일은 시험용이다.
"""
from pathlib import Path
from urllib.request import urlopen

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifkr/NotoSerifKR%5Bwght%5D.ttf"
DEST = Path(__file__).resolve().parents[2] / "assets" / "fonts"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    var = DEST / "NotoSerifKR[wght].ttf"
    if not var.is_file():
        var.write_bytes(urlopen(URL, timeout=120).read())
    out = DEST / "NotoSerifKR-SemiBold.ttf"
    instancer.instantiateVariableFont(TTFont(str(var)), {"wght": 600}).save(str(out))
    print(f"saved {out.relative_to(DEST.parents[1])} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
