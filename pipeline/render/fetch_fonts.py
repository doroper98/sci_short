"""Download the display/body fonts used by the render toolkit into assets/fonts/.

Roles (see pipeline/render/README.md):
  Display  GmarketSans Bold (700) / Medium (500)  -- titles, kicker, big numbers
  Body     Noto Sans KR (variable wght)           -- captions, labels, source line

GmarketSans is published as WOFF with CFF outlines; it is unwrapped to .otf with
fontTools (WOFF 1 needs only zlib). Its cmap has no U+0020 space glyph, so the
toolkit always puts Noto Sans KR after it in the font fallback list.
Noto Sans KR is a variable font; @napi-rs/canvas only exposes its default
instance (weight 100), so static Regular/Medium/Bold instances are cut with
fontTools.varLib.instancer and the variable file is kept only as the source.
Font binaries are NOT committed (see .gitignore). A manifest with sha256 of the
downloaded and converted files is written to assets/fonts/fonts-manifest.json.

Usage:  python pipeline/render/fetch_fonts.py [--force]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "assets" / "fonts"
NOONFONTS = "https://raw.githubusercontent.com/projectnoonnu/noonfonts_2001/master/"
FONTS = [
    {"file": "GmarketSansBold.otf", "url": NOONFONTS + "GmarketSansBold.woff", "family": "GmarketSans", "weight": 700,
     "licence": "Gmarket free font (free for personal/commercial use; check terms before redistribution)"},
    {"file": "GmarketSansMedium.otf", "url": NOONFONTS + "GmarketSansMedium.woff", "family": "GmarketSans", "weight": 500,
     "licence": "Gmarket free font (free for personal/commercial use; check terms before redistribution)"},
    {"file": "GmarketSansLight.otf", "url": NOONFONTS + "GmarketSansLight.woff", "family": "GmarketSans", "weight": 300,
     "licence": "Gmarket free font (free for personal/commercial use; check terms before redistribution)"},
    {"file": "NotoSansKR[wght].ttf", "url": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf",
     "family": "Noto Sans KR", "weight": "100-900 (variable)", "licence": "SIL Open Font License 1.1"},
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "scishort-fetch-fonts/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def woff_to_ttf(raw: bytes, out: Path) -> None:
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit("fontTools missing: pip install -r pipeline/audio/requirements.txt (or pip install fonttools)")
    import io
    font = TTFont(io.BytesIO(raw))
    font.flavor = None
    font.save(str(out))


NOTO_INSTANCES = [(400, "Regular"), (500, "Medium"), (700, "Bold")]


def instance_noto(src: Path) -> list[dict]:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    made = []
    for weight, name in NOTO_INSTANCES:
        out = src.parent / f"NotoSansKR-{name}.ttf"
        inst = instancer.instantiateVariableFont(TTFont(str(src)), {"wght": weight}, updateFontNames=True)
        inst["OS/2"].usWeightClass = weight
        inst.save(str(out))
        made.append({"file": out.name, "derived_from": src.name, "method": f"fontTools instancer wght={weight}",
                     "family": "Noto Sans KR", "weight": weight, "licence": "SIL Open Font License 1.1",
                     "sha256": sha256(out.read_bytes())})
        print(f"cut   {out.relative_to(ROOT)}")
    return made


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-download even if files exist")
    args = ap.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    old_path = DEST / "fonts-manifest.json"
    old = {e["file"]: e for e in json.loads(old_path.read_text()).get("fonts", [])} if old_path.exists() else {}
    manifest = {"fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "fonts": []}
    for f in FONTS:
        out = DEST / f["file"]
        if out.exists() and not args.force:
            print(f"keep  {out.relative_to(ROOT)}")
            entry = {**old.get(f["file"], f), "sha256": sha256(out.read_bytes()), "note": "existing file kept"}
            manifest["fonts"].append(entry)
            continue
        raw = download(f["url"])
        if f["url"].endswith(".woff"):
            woff_to_ttf(raw, out)
        else:
            out.write_bytes(raw)
        entry = {**f, "source_bytes": len(raw), "source_sha256": sha256(raw), "sha256": sha256(out.read_bytes())}
        manifest["fonts"].append(entry)
        print(f"wrote {out.relative_to(ROOT)}  ({len(raw)} bytes source)")
    noto = DEST / "NotoSansKR[wght].ttf"
    if noto.exists() and (args.force or not all((DEST / f"NotoSansKR-{n}.ttf").exists() for _, n in NOTO_INSTANCES)):
        manifest["fonts"].extend(instance_noto(noto))
    else:
        for _, n in NOTO_INSTANCES:
            f = DEST / f"NotoSansKR-{n}.ttf"
            if f.exists():
                base = old.get(f.name, {"file": f.name, "derived_from": noto.name})
                manifest["fonts"].append({**base, "sha256": sha256(f.read_bytes()), "note": "existing file kept"})
    (DEST / "fonts-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"manifest {DEST.relative_to(ROOT) / 'fonts-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
