#!/usr/bin/env python3
"""묶음 장편의 썸네일(1280×720 JPEG, 2 MB 미만)을 만든다.

    python pipeline/render/fetch_fonts.py          # 글꼴(저장소에 넣지 않음)을 먼저 받는다
    python longform/thumbnail.py longform/01-detection

recipe.json 의 parts 순서대로 각 편의 poster.jpg(0초 프레임)를 세로 띠로 늘어놓고, 가운데 어두운 띠에
큰 제목(GmarketSans Bold)과 작은 줄(Noto Sans KR Bold)을 얹는다. 글자는 이 둘뿐이다.
각 포스터의 물음·답 글은 가운데 띠가 덮는다(띠를 잘라 낸 포스터 글이 비죽 나오지 않게).
글과 자리는 recipe.json 의 "thumbnail" 에서 읽는다:
    {"title": "…", "sub": "…", "focus": [0.5, …]}   # focus: 편마다 포스터를 가로로 자를 때의 중심(0~1, 기본 0.5)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import REPO, BuildError, load_recipe  # noqa: E402

W, H = 1280, 720
MAX_BYTES = 2 * 1024 * 1024
FONTS = REPO / "assets" / "fonts"
TITLE_FONT, SUB_FONT = FONTS / "GmarketSansBold.otf", FONTS / "NotoSansKR-Bold.ttf"
# noturno 테마(pipeline/render/chrome.mjs)
DEEP, BORDER, INK, AMBER = (0, 14, 22), (28, 58, 69), (239, 227, 212), (242, 169, 59)
BAND_TOP, BAND_BOTTOM = 232, 508          # 포스터의 물음·답 글(1920 기준 y 약 700~1290)을 가리는 불투명 띠
TITLE_PX, SUB_PX = 98, 50


def panel(poster: Path, width: int, focus: float) -> Image.Image:
    im = Image.open(poster).convert("RGB")
    scale = H / im.height
    im = im.resize((round(im.width * scale), H), Image.LANCZOS)
    x = round((im.width - width) * min(max(focus, 0.0), 1.0))
    return im.crop((x, 0, x + width, H))


SPACE_EM = 0.28   # GmarketSans 에는 공백(U+0020) 글리프가 없어(fetch_fonts.py) 낱말을 따로 그리고 이만큼 띄운다


def text_box(font: ImageFont.FreeTypeFont, text: str) -> tuple[int, int, int]:
    """(너비, 위, 아래) — 낱말 단위로 재고 공백은 SPACE_EM 으로."""
    words = text.split(" ")
    boxes = [font.getbbox(w) for w in words]
    width = sum(b[2] - b[0] for b in boxes) + round(font.size * SPACE_EM) * (len(words) - 1)
    return width, min(b[1] for b in boxes), max(b[3] for b in boxes)


def fit_font(path: Path, size: int, text: str, max_w: int) -> ImageFont.FreeTypeFont:
    while size > 10:
        f = ImageFont.truetype(str(path), size)
        if text_box(f, text)[0] <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(str(path), size)


def centered(draw: ImageDraw.ImageDraw, y: int, text: str, font: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> None:
    width, top, _ = text_box(font, text)
    x = (W - width) / 2
    for w in text.split(" "):
        l, _, r, _ = font.getbbox(w)
        draw.text((x - l, y - top), w, font=font, fill=fill)
        x += (r - l) + round(font.size * SPACE_EM)


def make(dir_: Path, out: Path | None = None) -> Path:
    recipe = load_recipe(dir_)
    spec = recipe.get("thumbnail") or {}
    title, sub = spec.get("title"), spec.get("sub")
    if not title or not sub:
        raise BuildError("recipe.json thumbnail 에 title·sub 가 있어야 합니다")
    parts = recipe["parts"]
    focus = list(spec.get("focus") or []) + [0.5] * len(parts)
    for f in (TITLE_FONT, SUB_FONT):
        if not f.is_file():
            raise BuildError(f"글꼴 없음: {f} — python pipeline/render/fetch_fonts.py")
    canvas = Image.new("RGB", (W, H), DEEP)
    n = len(parts)
    edges = [round(i * W / n) for i in range(n + 1)]
    for i, part in enumerate(parts):
        poster = REPO / part / "poster.jpg"
        if not poster.is_file():
            raise BuildError(f"포스터 없음: {poster}")
        canvas.paste(panel(poster, edges[i + 1] - edges[i], float(focus[i])), (edges[i], 0))
    # 가운데 띠: 위아래 가장자리를 짧게 흐려 포스터와 잇는다
    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    fade = 26
    for y in range(BAND_TOP - fade, BAND_BOTTOM + fade):
        a = 255 if BAND_TOP <= y < BAND_BOTTOM else round(255 * (1 - (BAND_TOP - y if y < BAND_TOP else y - BAND_BOTTOM + 1) / fade))
        d.line([(0, y), (W, y)], fill=(*DEEP, max(a, 0)))
    for x in edges[1:-1]:   # 편 사이 가는 경계선(띠 밖에서만)
        d.line([(x, 0), (x, BAND_TOP - fade)], fill=(*BORDER, 255), width=3)
        d.line([(x, BAND_BOTTOM + fade), (x, H)], fill=(*BORDER, 255), width=3)
    canvas = Image.alpha_composite(canvas.convert("RGBA"), over).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    tf = fit_font(TITLE_FONT, TITLE_PX, title, W - 90)
    sf = fit_font(SUB_FONT, SUB_PX, sub, W - 160)
    _, tt, tb = text_box(tf, title)
    _, st, sb = text_box(sf, sub)
    gap = 34
    block = (tb - tt) + gap + (sb - st)
    y0 = (BAND_TOP + BAND_BOTTOM) // 2 - block // 2
    centered(draw, y0, title, tf, INK)
    centered(draw, y0 + (tb - tt) + gap, sub, sf, AMBER)
    out = out or dir_ / "thumbnail.jpg"
    for q in (90, 85, 80, 75):
        canvas.save(out, "JPEG", quality=q, optimize=True, progressive=True)
        if out.stat().st_size < MAX_BYTES:
            break
    else:
        raise BuildError(f"{out} 가 2 MB 를 넘습니다")
    print(f"[longform] {out} {W}×{H} {out.stat().st_size / 1024:.0f} KB", file=sys.stderr)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python longform/thumbnail.py", description="묶음 장편 썸네일(1280×720)")
    ap.add_argument("dir", type=Path)
    ap.add_argument("--out", type=Path, help="기본 <dir>/thumbnail.jpg")
    a = ap.parse_args(argv)
    try:
        make(a.dir, a.out)
    except BuildError as e:
        print(f"[longform] 실패 — {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
