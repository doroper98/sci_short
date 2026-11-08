#!/usr/bin/env python3
"""업로드·게시 기록 파일을 git 에 올리고(stage), 올라간 편의 기록이 빠지지 않았는지 확인한다(GitHub Actions 용).

    stage_records.py [upload-report.json] [instagram-report.json] [tiktok-report.json]

2026-11-07 사고: 셸에서 `git add -- finals/*/youtube_upload.json finals/*/instagram_post.json` 을 썼는데,
인스타 기록이 하나도 없어 두 번째 패턴이 그대로 남자 git add 전체가 실패했고(`|| true` 로 묻힘)
유튜브 7편의 기록이 커밋되지 않았다. 그래서 있는 파일만 골라 올리고, 업로드·게시한 편의 기록이
스테이지되지 않았으면 종료 코드 1 로 크게 알린다(있는 기록은 그래도 커밋하도록 호출 쪽이 처리).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

RECORDS = {"youtube_upload.json": ("uploaded",), "instagram_post.json": ("posted",), "tiktok_offer.json": ("offered",)}


def staged_files() -> set[str]:
    out = subprocess.run(["git", "diff", "--cached", "--name-only"], capture_output=True, text=True, check=True).stdout
    return set(out.split())


def main(argv: list[str]) -> int:
    files = sorted(p.as_posix() for name in RECORDS for p in Path("finals").glob(f"*/{name}") if p.is_file())
    if files:
        subprocess.run(["git", "add", "--", *files], check=True)
    staged = staged_files()
    missing: list[str] = []
    for report, name in zip(argv[:3], RECORDS):
        p = Path(report)
        if not p.is_file():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            continue
        for r in data.get("results", []):
            changed = r.get("status") in RECORDS[name] or (name == "youtube_upload.json" and r.get("thumbnail_repaired"))
            rec = f"{r.get('dir', '')}/{name}"
            if changed and rec not in staged:
                missing.append(rec)
    print(f"staged={len(staged)}")
    if missing:
        print("::error::업로드·게시했는데 기록이 스테이지되지 않았습니다(다시 올라갈 위험): " + ", ".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
