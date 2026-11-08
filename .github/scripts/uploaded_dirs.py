#!/usr/bin/env python3
"""유튜브 결과 파일(upload-report.json)에서 이번에 올린 편의 폴더를 한 줄에 하나씩 쓴다(인스타 아침 게시의 --prefer 용).
파일이 없거나 깨졌으면 아무것도 쓰지 않는다."""

import json
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    p = Path(argv[0]) if argv else Path("upload-report.json")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return 0
    for r in data.get("results", []):
        if r.get("status") == "uploaded" and r.get("dir"):
            print(r["dir"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
