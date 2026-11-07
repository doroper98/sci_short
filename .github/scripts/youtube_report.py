#!/usr/bin/env python3
"""GitHub Actions 보조 — 업로드 결과를 작업 요약에 쓰고, '공개 전환 대기'·실패 이슈를 만든다. gh CLI(GH_TOKEN) 사용.

    youtube_report.py report upload-report.json
    youtube_report.py token-check whoami-report.json <success|failure>
이슈 제목에 video id·폴더 이름을 넣어 같은 건을 두 번 만들지 않는다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

LABEL_REVIEW = "youtube-review"      # 비공개로 올라감 → 공개 전환 결정 대기
LABEL_ALERT = "youtube-alert"        # 업로드·토큰 문제
REPO = os.environ.get("GITHUB_REPOSITORY", "")
RUN_URL = (f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{REPO}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"
           if REPO else "")


def gh(*args: str) -> str:
    r = subprocess.run(["gh", *args], text=True, capture_output=True)
    if r.returncode != 0:
        print(f"[report] gh {' '.join(args[:3])} 실패: {r.stderr.strip()[:300]}", file=sys.stderr)
        return ""
    return r.stdout


def ensure_labels() -> None:
    gh("label", "create", LABEL_REVIEW, "--color", "0E8A16", "--description", "유튜브 비공개 업로드 완료 — 공개 전환 결정 대기", "--force")
    gh("label", "create", LABEL_ALERT, "--color", "D93F0B", "--description", "유튜브 업로드·토큰 문제", "--force")


def open_issues(label: str) -> list[dict]:
    out = gh("issue", "list", "--label", label, "--state", "open", "--limit", "200", "--json", "number,title")
    try:
        return json.loads(out or "[]")
    except ValueError:
        return []


def create_issue_once(title: str, body: str, label: str, existing: list[dict]) -> None:
    if any(i["title"] == title for i in existing):
        print(f"[report] 이미 있음: {title}", file=sys.stderr)
        return
    url = gh("issue", "create", "--title", title, "--body", body, "--label", label).strip()
    print(f"[report] 이슈 생성: {title} {url}" if url else f"[report] 이슈 생성 실패: {title}", file=sys.stderr)


def summary(md: str) -> None:
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "a", encoding="utf-8") as f:
            f.write(md + "\n")
    print(md, file=sys.stderr)


def load(path: str) -> dict | None:
    p = Path(path)
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return None


def cell(text: str) -> str:
    """표 칸 안의 글. 제목의 '|'(예: "질문? | 부제")가 칸을 나누지 않게 이스케이프하고 줄바꿈을 없앤다."""
    return str(text).replace("|", "\\|").replace("\n", " ")


def cmd_report(path: str) -> int:
    data = load(path)
    if data is None:
        summary("## 유튜브 업로드\n결과 파일이 없습니다 — 업로드 단계가 시작 전에 실패했습니다(비밀값·설정 확인). " + RUN_URL)
        return 0
    if "results" not in data:
        summary(f"## 유튜브 업로드\n실패: {data.get('error', '?')}\n\n{RUN_URL}")
        ensure_labels()
        create_issue_once("유튜브 업로드 실패: 설정·비밀값", f"오류: {data.get('error', '?')}\n\n실행: {RUN_URL}", LABEL_ALERT, open_issues(LABEL_ALERT))
        return 0
    c = data.get("counts", {})
    lines = ["## 유튜브 업로드 (항상 비공개)", "",
             f"업로드 {c.get('uploaded', 0)} · 건너뜀 {c.get('skipped', 0)} · dry-run {c.get('dry-run', 0)} · 오류 {c.get('error', 0)}", "",
             "| 폴더 | 상태 | 제목 | 링크 | 비고 |", "|---|---|---|---|---|"]
    for r in data["results"]:
        note = cell(r.get("error") or " / ".join(r.get("warnings", [])))
        link = f"[youtu.be]({r['url']}) · [Studio]({r['studio_url']})" if r.get("url") else ""
        lines.append(f"| `{r['dir']}` | {r['status']} | {cell(r.get('title', ''))} | {link} | {note} |")
    summary("\n".join(lines))

    ensure_labels()
    review = open_issues(LABEL_REVIEW)
    alerts = open_issues(LABEL_ALERT)
    for r in data["results"]:
        if r["status"] == "uploaded":
            title = f"공개 전환 대기: {r.get('title', '')} ({r['video_id']})"
            warns = "\n".join(f"- {w}" for w in r.get("warnings", [])) or "- 없음"
            body = (f"비공개로 올라갔습니다. YouTube Studio 에서 내용·자막을 확인한 뒤 **공개**로 바꾸고 이 이슈를 닫으십시오.\n\n"
                    f"- 폴더: `{r['dir']}`\n- 채널: {r.get('channel', '')}\n- 보기: {r['url']}\n- Studio: {r['studio_url']}\n\n"
                    f"경고:\n{warns}\n\n확인할 것:\n- [ ] 영상·음성·자막이 맞는가\n- [ ] 제목·설명·태그가 맞는가\n"
                    f"- [ ] 아동용 선언·합성 콘텐츠 표시가 맞는가\n- [ ] 공개(또는 예약 공개)로 전환\n\n실행: {RUN_URL}")
            create_issue_once(title, body, LABEL_REVIEW, review)
        elif r["status"] == "error":
            title = f"유튜브 업로드 실패: {r['dir']}"
            create_issue_once(title, f"오류: {r.get('error', '?')}\n\n실행: {RUN_URL}\n\n원인을 고친 뒤 main 에 다시 반영하거나 "
                              f"Actions 에서 youtube-upload 를 수동 실행하십시오.", LABEL_ALERT, alerts)
    return 0


def cmd_token_check(path: str, outcome: str) -> int:
    data = load(path) or {}
    ensure_labels()
    alerts = open_issues(LABEL_ALERT)
    title = "유튜브 리프레시 토큰 점검 실패"
    if outcome == "success" and data.get("ok"):
        match = data.get("matches_config")
        summary(f"## 토큰 점검\n정상 — 채널 {data.get('channel_title')} ({data.get('channel_id')})"
                + ("" if match is None else (" · 설정과 일치" if match else " · **설정 channel_id 와 다름**")))
        for i in alerts:
            if i["title"] == title:
                gh("issue", "close", str(i["number"]), "--comment", f"토큰 점검이 다시 정상입니다. {RUN_URL}")
        if match is False:
            create_issue_once("유튜브 토큰이 설정과 다른 채널을 가리킴",
                              f"토큰 채널: {data.get('channel_title')} ({data.get('channel_id')}) · 설정 channel_id: {data.get('config_channel_id')}\n\n"
                              f"업로드는 이 상태에서 중단됩니다. 토큰을 다시 받거나 config/youtube.json 을 고치십시오. {RUN_URL}",
                              LABEL_ALERT, alerts)
        return 0
    err = data.get("error", "결과 파일 없음(비밀값 미설정?)")
    summary(f"## 토큰 점검\n실패: {err}\n\n{RUN_URL}")
    create_issue_once(title, f"오류: {err}\n\n`invalid_grant` 면 토큰이 만료·철회된 것입니다. 앱이 프로덕션 게시 상태인지 확인하고 "
                      f"`python -m publish.oauth` 로 새 토큰을 받아 YT_REFRESH_TOKEN 비밀값을 바꾸십시오(docs/YOUTUBE_AUTO_UPLOAD.md).\n\n실행: {RUN_URL}",
                      LABEL_ALERT, alerts)
    return 0


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "report":
        return cmd_report(argv[1])
    if len(argv) >= 3 and argv[0] == "token-check":
        return cmd_token_check(argv[1], argv[2])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
