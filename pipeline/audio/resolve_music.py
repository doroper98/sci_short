"""Resolve the `music` block of an episode sound.json against assets/music/registry.json.

  python pipeline/audio/resolve_music.py episodes/<slug>/sound.json --root <repo>
Prints shell-safe KEY=VALUE lines (MUSIC_FILE, MUSIC_CREDIT, MUSIC_UNDER_DB, MUSIC_DUCK_DB, MUSIC_START) or nothing when
music is disabled. Exit 3 when the referenced file is missing or its sha1 does not match the registry (never play an
unverified file).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sound_json")
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    root = Path(a.root).resolve()
    snd = json.loads(Path(a.sound_json).read_text())
    m = snd.get("music")
    if not m or m.get("enabled") is False:
        return 0
    credit = m.get("credit")
    if m.get("id"):
        reg = json.loads((root / "assets/music/registry.json").read_text())["tracks"]
        if m["id"] not in reg:
            print(f"music id {m['id']!r} not in assets/music/registry.json", file=sys.stderr)
            return 3
        tr = reg[m["id"]]
        f = root / "assets/music" / tr["file"]
        credit = credit or tr.get("attribution")
        if not f.exists():
            print(f"music file missing: {f}\n→ assets/music/README.md 의 받기 절차를 따르거나 NO_MUSIC=1 로 실행", file=sys.stderr)
            return 3
        if tr.get("sha1") and hashlib.sha1(f.read_bytes()).hexdigest() != tr["sha1"]:
            print(f"music sha1 mismatch for {f}; refusing to use an unverified file", file=sys.stderr)
            return 3
    elif m.get("file"):
        f = (root / m["file"]) if not Path(m["file"]).is_absolute() else Path(m["file"])
        if not f.exists():
            print(f"music file missing: {f}", file=sys.stderr)
            return 3
        if not credit:
            print("music.credit is required when music.file is used (licence attribution)", file=sys.stderr)
            return 3
    else:
        print("music block needs 'id' or 'file'", file=sys.stderr)
        return 3
    print(f"MUSIC_FILE={shlex.quote(str(f))}")
    print(f"MUSIC_CREDIT={shlex.quote(credit or '')}")
    print(f"MUSIC_UNDER_DB={float(m.get('under_db', 12))}")
    print(f"MUSIC_DUCK_DB={float(m.get('duck_db', 6))}")
    print(f"MUSIC_START={float(m.get('start_sec', 0))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
