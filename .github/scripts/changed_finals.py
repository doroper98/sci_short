#!/usr/bin/env python3
"""BASE..HEAD 사이에 바뀐 finals/<NN>-<slug>/ 폴더를 한 줄씩 출력한다(GitHub Actions 용).

    changed_finals.py <base sha|ref> <head sha|ref>
업로드·게시 기록(youtube_upload.json·instagram_post.json·tiktok_offer.json)만 바뀐 폴더와 작업 트리에 없는 폴더는 제외한다.
얕은 체크아웃이라 base 커밋이 없으면 조금씩 더 받아 본다. 끝내 못 찾으면 아무것도 출력하지 않고 표준 오류에 사유를 적는다.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

EP_RE = re.compile(r"^finals/(\d{2,}-[^/]+)/")
RECORDS = {"youtube_upload.json", "instagram_post.json", "tiktok_offer.json"}


def git(*a: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *a], text=True, capture_output=True)


def have(rev: str) -> bool:
    return git("cat-file", "-e", f"{rev}^{{commit}}").returncode == 0


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    base, head = argv
    if not base or set(base) == {"0"}:
        print("[changed] base 가 없습니다(첫 push?) — 대상 없음. 필요하면 workflow_dispatch 로 지정", file=sys.stderr)
        return 0
    for depth in (50, 500, 5000):
        if have(base):
            break
        git("fetch", "--quiet", f"--deepen={depth}", "origin")
    if not have(base):
        print(f"[changed] base {base[:12]} 를 받을 수 없습니다 — 대상 없음. workflow_dispatch 로 지정", file=sys.stderr)
        return 0
    r = git("diff", "--name-only", "--diff-filter=AMRC", base, head, "--", "finals/")
    if r.returncode != 0:
        print(f"[changed] git diff 실패: {r.stderr.strip()[:200]}", file=sys.stderr)
        return 0
    by_dir: dict[str, set[str]] = {}
    for line in r.stdout.splitlines():
        m = EP_RE.match(line)
        if m:
            by_dir.setdefault(m.group(1), set()).add(line.rsplit("/", 1)[1])
    for name in sorted(by_dir):
        if by_dir[name] <= RECORDS:
            print(f"[changed] finals/{name}: 업로드 기록만 바뀜 — 제외", file=sys.stderr)
            continue
        if not Path("finals", name).is_dir():
            print(f"[changed] finals/{name}: 작업 트리에 없음 — 제외", file=sys.stderr)
            continue
        print(f"finals/{name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
