#!/usr/bin/env python3
"""GitHub Actions 보조 — 업로드·게시 결과를 작업 요약에 쓰고, '공개 전환 대기'·실패 이슈를 만든다. gh CLI(GH_TOKEN) 사용.

    youtube_report.py report upload-report.json [instagram-report.json]
    youtube_report.py token-check whoami-report.json <success|failure>
    youtube_report.py ig-token-check ig-whoami-report.json <success|failure|skipped>
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
LABEL_IG_ALERT = "instagram-alert"   # 인스타 게시·토큰 문제
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
    gh("label", "create", LABEL_IG_ALERT, "--color", "B60205", "--description", "인스타 릴스 게시·토큰 문제", "--force")


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
    # 저장소 주인을 담당자로 지정한다(2026-11-08). '할당됨' 알림은 지켜보기 설정과 상관없이 휴대전화로 온다.
    # 지정이 거부되면(주인이 조직 등) 담당자 없이 다시 만든다 — 알림보다 이슈가 먼저다.
    owner = os.environ.get("GITHUB_REPOSITORY_OWNER", "")
    url = gh("issue", "create", "--title", title, "--body", body, "--label", label, "--assignee", owner).strip() if owner else ""
    if not url:
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


def instagram_section(ig: dict | None) -> dict[str, dict]:
    """인스타 결과를 요약에 쓰고 실패 이슈를 만든다. 폴더 → 결과 사전을 돌려준다(유튜브 이슈 본문에 주소를 넣으려고)."""
    if ig is None:
        return {}                     # 인스타 단계가 건너뛰었거나(비밀값 없음 등) 결과 파일이 없음 — 단계가 요약에 직접 적는다
    ensure_labels()
    alerts = open_issues(LABEL_IG_ALERT)
    if "results" not in ig:
        summary(f"## 인스타 릴스\n실패: {ig.get('error', '?')}\n\n{RUN_URL}")
        create_issue_once("인스타 게시 실패: 설정·비밀값", f"오류: {ig.get('error', '?')}\n\n실행: {RUN_URL}\n\n"
                          "docs/INSTAGRAM_AUTO_POST.md '문제 해결'을 보십시오.", LABEL_IG_ALERT, alerts)
        return {}
    c = ig.get("counts", {})
    lines = ["## 인스타 릴스 (게시 즉시 공개)", "",
             f"게시 {c.get('posted', 0)} · 건너뜀 {c.get('skipped', 0)} · dry-run {c.get('dry-run', 0)} · 오류 {c.get('error', 0)}", "",
             *([f"일정 게시: {ig['note']}", ""] if ig.get("note") else []),
             "| 폴더 | 상태 | 제목 | 게시물 | 비고 |", "|---|---|---|---|---|"]
    for r in ig["results"]:
        note = cell(r.get("error") or " / ".join(r.get("warnings", [])))
        link = f"[instagram]({r['permalink']})" if r.get("permalink") else ""
        lines.append(f"| `{r['dir']}` | {r['status']} | {cell(r.get('title', ''))} | {link} | {note} |")
        if r["status"] == "error":
            create_issue_once(f"인스타 게시 실패: {r['dir']}",
                              f"오류: {r.get('error', '?')}\n\n실행: {RUN_URL}\n\n'게시됐을 수 있어 다시 게시하지 않습니다'라는 오류면 "
                              "인스타 앱에서 실제 게시 여부를 먼저 확인하십시오. 원인을 고친 뒤 Actions → youtube-upload 수동 실행"
                              "(episode 지정, instagram 켬)으로 다시 게시할 수 있습니다. 그대로 두면 다음 일정 게시(아침·17시)가 "
                              "같은 편을 다시 시도합니다.", LABEL_IG_ALERT, alerts)
    summary("\n".join(lines))
    return {r["dir"]: r for r in ig["results"]}


def cmd_report(path: str, ig_path: str | None = None) -> int:
    ig_by_dir = instagram_section(load(ig_path) if ig_path else None)
    data = load(path)
    if data is None:
        summary("## 유튜브 업로드\n결과 파일이 없습니다 — 업로드 단계가 시작 전에 실패했습니다(비밀값·설정 확인). " + RUN_URL)
        return 0
    if data.get("note") and not data.get("results"):
        summary(f"## 유튜브 아침 업로드\n{data['note']}")       # 쉬는 날(비공개 대기·시작 전·대기열 끝)
        return 0
    if "results" not in data:
        summary(f"## 유튜브 업로드\n실패: {data.get('error', '?')}\n\n{RUN_URL}")
        ensure_labels()
        create_issue_once("유튜브 업로드 실패: 설정·비밀값", f"오류: {data.get('error', '?')}\n\n실행: {RUN_URL}", LABEL_ALERT, open_issues(LABEL_ALERT))
        return 0
    c = data.get("counts", {})
    lines = ["## 유튜브 업로드 (항상 비공개)", "",
             f"업로드 {c.get('uploaded', 0)} · 건너뜀 {c.get('skipped', 0)} · dry-run {c.get('dry-run', 0)} · 오류 {c.get('error', 0)}", "",
             *([f"아침 업로드: {data['note']}", ""] if data.get("note") else []),
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
            igr = ig_by_dir.get(r["dir"]) or {}
            ig_line = (f"- 인스타 릴스(이미 공개): {igr.get('permalink') or igr.get('media_id')}\n" if igr.get("status") == "posted" else
                       f"- 인스타 릴스: {igr.get('status')} — {igr.get('error') or ' / '.join(igr.get('warnings', []))}\n" if igr else "")
            prev_line = (f"- **다시 올림**: 이전 판 {r['previous_video']} (조회 {r.get('previous_views')}회). 새 판을 공개한 뒤 "
                         "**이전 판은 비공개로** 돌리십시오(같은 영상이 두 개 공개되지 않게)\n" if r.get("previous_video") else
                         "- **다시 올림**: 이전 판은 손으로 올린 것이라 ID 기록이 없습니다. 스튜디오에서 찾아 비공개로 돌리십시오\n"
                         if r.get("republish") else "")
            body = (f"비공개로 올라갔습니다. YouTube Studio 에서 내용·자막을 확인한 뒤 **공개**로 바꾸고 이 이슈를 닫으십시오.\n"
                    f"공개는 하루 1편, 다른 영상과 같은 날 몰아 하지 않습니다(docs/CHANNEL_GROWTH.md H3).\n\n"
                    f"- 폴더: `{r['dir']}`\n- 채널: {r.get('channel', '')}\n- 보기: {r['url']}\n- Studio: {r['studio_url']}\n{ig_line}{prev_line}\n"
                    f"경고:\n{warns}\n\n확인할 것:\n- [ ] 영상·음성·자막이 맞는가\n- [ ] 제목·설명·태그가 맞는가\n"
                    f"- [ ] 아동용 선언·합성 콘텐츠 표시가 맞는가\n- [ ] 공개(또는 예약 공개)로 전환\n"
                    + ("- [ ] 이전 판을 비공개로 전환\n" if (r.get("previous_video") or r.get("republish")) else "")
                    + f"\n실행: {RUN_URL}")
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


def cmd_ig_token_check(path: str, outcome: str) -> int:
    if outcome == "skipped":
        summary("## 인스타 토큰 점검\nIG_ACCESS_TOKEN 비밀값이 없어 건너뜀(인스타 연결 전)")
        return 0
    data = load(path) or {}
    ensure_labels()
    alerts = open_issues(LABEL_IG_ALERT)
    title = "인스타 토큰 점검 실패"
    if outcome == "success" and data.get("ok"):
        if data.get("ig_user_id"):
            summary(f"## 인스타 토큰 점검\n정상 — @{data.get('username')} ({data.get('ig_user_id')})"
                    + ("" if data.get("matches_config") is None else " · 설정과 일치"))
        else:                         # 계정 잠금 전: 토큰이 닿는 인스타 계정 후보를 보여 준다(config 에 넣을 값)
            rows = "\n".join(f"- @{c.get('username')} — ig_user_id `{c.get('ig_user_id')}` (페이지 「{c.get('page')}」)"
                             for c in data.get("candidates", []))
            summary("## 인스타 토큰 점검\n토큰 정상. 아직 계정이 잠기지 않았습니다. 아래 값을 config/instagram.json 에 넣습니다.\n\n" + rows)
        for i in alerts:
            if i["title"] == title:
                gh("issue", "close", str(i["number"]), "--comment", f"인스타 토큰 점검이 다시 정상입니다. {RUN_URL}")
        return 0
    err = data.get("error") or ("설정과 다른 계정" if data.get("matches_config") is False else "결과 파일 없음")
    summary(f"## 인스타 토큰 점검\n실패: {err}\n\n{RUN_URL}")
    create_issue_once(title, f"오류: {err}\n\n오류 190 이면 토큰이 만료·무효입니다. docs/INSTAGRAM_AUTO_POST.md '토큰' 절차로 새 토큰을 받아 "
                      f"IG_ACCESS_TOKEN 비밀값을 바꾸십시오. 이 상태에서는 새 편이 병합돼도 인스타에 게시되지 않습니다.\n\n실행: {RUN_URL}",
                      LABEL_IG_ALERT, alerts)
    return 0


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "report":
        return cmd_report(argv[1], argv[2] if len(argv) >= 3 else None)
    if len(argv) >= 2 and argv[0] == "ig-report":          # 17시 일정 게시(instagram-evening)
        instagram_section(load(argv[1]))
        return 0
    if len(argv) >= 3 and argv[0] == "ig-token-check":
        return cmd_ig_token_check(argv[1], argv[2])
    if len(argv) >= 3 and argv[0] == "token-check":
        return cmd_token_check(argv[1], argv[2])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
