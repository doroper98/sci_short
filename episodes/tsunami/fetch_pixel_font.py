#!/usr/bin/env python3
"""58번 쓰나미(픽셀 일러스트 화풍 시험)의 머리글 글꼴 Galmuri11 Bold(SIL OFL 1.1, quiple/galmuri)를 받는다.

    python3 episodes/tsunami/fetch_pixel_font.py

2026-11-15 사용자 결정("그리고 폰트는 e가 좋은데?" — 다섯 가지 가운데 E = 픽셀 글꼴)으로 이 편의 머리글 한 줄에만 쓴다.
결과: assets/fonts/Galmuri11-Bold.ttf (Git 제외). npm 꾸러미 galmuri 2.40.3 의 dist/Galmuri11-Bold.ttf 한 파일만 꺼내고 SHA-256 을 확인한다.
표준 글꼴(GmarketSans, Noto Sans KR)은 pipeline/render/fetch_fonts.py 가 받는다.
"""
import hashlib
import io
import tarfile
from pathlib import Path
from urllib.request import urlopen

URL = "https://registry.npmjs.org/galmuri/-/galmuri-2.40.3.tgz"
MEMBER = "package/dist/Galmuri11-Bold.ttf"
SHA256 = "5265b2f437fe81f0c8095b44c0173dd9a276b58a42552bf983f21c0e69e6e8af"
DEST = Path(__file__).resolve().parents[2] / "assets" / "fonts" / "Galmuri11-Bold.ttf"


def main() -> None:
    if DEST.is_file() and hashlib.sha256(DEST.read_bytes()).hexdigest() == SHA256:
        print(f"이미 있음: {DEST.relative_to(DEST.parents[2])}")
        return
    blob = urlopen(URL, timeout=180).read()
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        data = tar.extractfile(MEMBER).read()
    got = hashlib.sha256(data).hexdigest()
    if got != SHA256:
        raise SystemExit(f"SHA-256 불일치: {got} (기대 {SHA256}) — 저장하지 않았습니다")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_bytes(data)
    print(f"저장: {DEST.relative_to(DEST.parents[2])} ({len(data)} bytes, SHA-256 일치)")


if __name__ == "__main__":
    main()
