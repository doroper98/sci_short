#!/usr/bin/env python3
"""유튜브 결과 파일(upload-report.json)에서 이번에 올린 편의 폴더를 한 줄에 하나씩 쓴다(인스타 아침 게시의 --prefer 용).
파일이 없거나 깨졌으면 아무것도 쓰지 않는다.

저녁 몫(다시 올리기)으로 올린 편은 쓰지 않는다(2026-11-13 예약 공개: 한 실행이 아침 몫과 저녁 몫을 함께 올릴 수 있다).
인스타 아침 게시와 틱톡 안내는 아침 편을 먼저 다뤄야 하기 때문이다. 결과 항목의 slot, 없으면 보고서의 slot 을 본다."""

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
        if r.get("status") == "uploaded" and r.get("dir") and (r.get("slot") or data.get("slot")) != "evening":
            print(r["dir"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
