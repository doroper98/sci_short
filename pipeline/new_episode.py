"""Create episodes/<slug>/ from episodes/_template/.

  python pipeline/new_episode.py <slug> --title "얼음은 왜 물에 뜰까?" [--theme noturno|slate|graphite|navy]

Substitutes {{slug}}, {{title}}, {{date}} in text files, "__TITLE__" in script.json and the theme in scenes.mjs.
Refuses to overwrite an existing folder.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "episodes" / "_template"
THEMES = ("noturno", "slate", "graphite", "navy")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}$")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", help="lowercase ascii, digits and '-', e.g. ice-floats")
    ap.add_argument("--title", required=True)
    ap.add_argument("--theme", default="noturno", choices=THEMES)
    ap.add_argument("--episodes-dir", type=Path, default=ROOT / "episodes", help=argparse.SUPPRESS)
    a = ap.parse_args()
    if not SLUG_RE.match(a.slug):
        print(f"bad slug {a.slug!r}: use 2–49 chars of a-z, 0-9, '-' (it becomes a folder and file name)", file=sys.stderr)
        return 2
    dest = a.episodes_dir / a.slug
    if dest.exists():
        print(f"refusing to overwrite existing {dest}", file=sys.stderr)
        return 2
    shutil.copytree(TEMPLATE, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", "node_modules"))
    today = dt.date.today().isoformat()
    for f in dest.rglob("*"):
        if f.suffix not in {".md", ".json", ".mjs", ".sh"}:
            continue
        s = f.read_text(encoding="utf-8")
        s = s.replace("{{slug}}", a.slug).replace("{{title}}", a.title).replace("{{date}}", today)
        if f.name == "script.json":
            s = s.replace('"__TITLE__"', json.dumps(a.title, ensure_ascii=False))
        if f.name == "scenes.mjs":
            s = re.sub(r"export const theme = '[a-z]+';", f"export const theme = '{a.theme}';", s, count=1)
        f.write_text(s, encoding="utf-8")
    (dest / "run.sh").chmod(0o755)
    print(f"created {dest.relative_to(ROOT) if dest.is_relative_to(ROOT) else dest}")
    print(f"next: edit brief.md → script.json → scenes.mjs → sound.json, then episodes/{a.slug}/run.sh")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
