"""과학쑛츠 주간 채널 보고서 — 편별 조회수·시청 비율·구독 증가와 진행 중인 실험을 한 장으로 정리한다.

2026-11-08 사용자 결정: "주간 자동 보고서". 채널 분석(docs/CHANNEL_GROWTH.md)의 가설을 자료로 판정하려고 만든다.

사용법
    python -m publish.analytics --md report.md --snapshot reports/youtube/2026-11-09.json
    python -m publish.analytics --env-file .env --md -          # 표준 출력으로

자료
    YouTube Data API v3 (youtube.readonly — 이미 있는 권한)
        채널 구독자·영상 수, 업로드 목록, 편별 공개일·길이·공개 상태·조회수·좋아요·댓글
    YouTube Analytics API v2 (yt-analytics.readonly — 추가 권한. 없으면 이 부분만 빠지고 보고서는 나온다)
        편별 누적·최근 7일: views, engagedViews, estimatedMinutesWatched, averageViewDuration,
        averageViewPercentage, likes, shares, subscribersGained / 최근 28일 유입 경로 / 일별 추이
        분석 자료는 보통 2~3일 늦게 채워진다.
편과 영상의 짝: finals/<ep>/youtube_upload.json 의 video_id, 없으면 upload.md 제목(해시태그 뺀 앞부분)으로 맞춘다.
비밀값은 publish.youtube 와 같은 YT_CLIENT_ID·YT_CLIENT_SECRET·YT_REFRESH_TOKEN 환경 변수만 읽는다.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import statistics
import sys
import urllib.parse
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from publish.youtube import (DEFAULT_CONFIG, DEFAULT_FINALS, Transport, TransportError, UploadError, _api_error,
                             access_token, episode_dirs, load_config, load_env_file, parse_dir_name, parse_upload_md,
                             read_record, read_secrets, urllib_transport)

DATA = "https://www.googleapis.com/youtube/v3"
ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports"
VIDEO_METRICS = ("views", "engagedViews", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage",
                 "likes", "shares", "subscribersGained")
CHANNEL_START = "2026-10-01"      # 채널 첫 업로드 이전 날짜면 된다(누적 구간의 시작)
HASHTAG_RE = re.compile(r"#\S+")

# 진행 중인 실험(2026-11-08 사용자 결정). 판정 기준일이 지나면 보고서가 판정 줄을 붙인다.
EXPERIMENTS = {
    "opener": {"title": "첫 문장 — 질문형 대 \"오늘은 ~ 알아볼까요?\"", "uploaded": "2026-11-07", "judge_on": "2026-11-14"},
    "length": {"title": "길이 — 17 초유체 헬륨 3분판 대 60초판", "a": "17-superfluid-helium", "b": "17-superfluid-helium-60s"},
}


@dataclass
class Episode:
    dir: str
    number: int | None
    slug: str
    title: str
    opener: str = "?"          # today(오늘은 ~ 알아볼까요?) · question · ?
    duration_sec: float | None = None


@dataclass
class VideoRow:
    video_id: str
    title: str
    published: str
    privacy: str
    duration_sec: int
    views: int
    likes: int
    comments: int
    episode: str | None = None          # finals 폴더 이름
    number: int | None = None
    opener: str = "?"
    a_total: dict[str, float] = field(default_factory=dict)     # 분석 API 누적
    a_week: dict[str, float] = field(default_factory=dict)      # 분석 API 최근 7일


# ───────────────────────────── 편 정보 ─────────────────────────────

def _norm(title: str) -> str:
    t = HASHTAG_RE.sub("", title)
    t = re.sub(r"[\s|·\-–—:]+", " ", t).strip().lower()
    return t


def classify_opener(text: str) -> str:
    t = text.strip()
    if t.startswith("오늘은") and "알아볼까요" in t:
        return "today"
    if t.endswith("?") or "까요" in t:
        return "question"
    return "?"


def load_episodes(finals: Path) -> tuple[dict[str, Episode], dict[str, Episode]]:
    """(video_id → 편, 정규화 제목 → 편)."""
    by_vid: dict[str, Episode] = {}
    by_title: dict[str, Episode] = {}
    for d in episode_dirs(finals):
        up = d / "upload.md"
        if not up.is_file():
            continue
        try:
            title = parse_upload_md(up.read_text(encoding="utf-8"))["title"]
        except UploadError:
            continue
        number, slug = parse_dir_name(d)
        ep = Episode(dir=d.name, number=number, slug=slug, title=title)
        tl = d / "timeline.json"
        if tl.is_file():
            try:
                t = json.loads(tl.read_text(encoding="utf-8"))
                first = t["sentences"][0]
                ep.opener = classify_opener(first.get("text") or first.get("display") or "")
                ep.duration_sec = float(t.get("duration") or 0) or None
            except (ValueError, KeyError, IndexError):
                pass
        elif (d / "cut.json").is_file():        # 잘라 만든 판은 원본 편의 첫 문장을 그대로 쓴다
            src = json.loads((d / "cut.json").read_text(encoding="utf-8")).get("source", "")
            parent = finals / Path(src).parent.name if src else None
            if parent and (parent / "timeline.json").is_file():
                first = json.loads((parent / "timeline.json").read_text(encoding="utf-8"))["sentences"][0]
                ep.opener = classify_opener(first.get("text") or first.get("display") or "")
        rec = read_record(d)
        if rec is not None:
            by_vid[rec.video_id] = ep
        by_title.setdefault(_norm(title), ep)
        by_title.setdefault(_norm(title.split("|")[0]), ep)
    return by_vid, by_title


def match_episode(row: VideoRow, by_vid: dict[str, Episode], by_title: dict[str, Episode]) -> Episode | None:
    if row.video_id in by_vid:
        return by_vid[row.video_id]
    n = _norm(row.title)
    return by_title.get(n) or by_title.get(_norm(row.title.split("|")[0]))


# ───────────────────────────── API ─────────────────────────────

def _get(send: Transport, token: str, url: str, what: str) -> dict[str, Any]:
    r = send("GET", url, {"Authorization": f"Bearer {token}"}, None)
    if r.status != 200:
        raise _api_error(r, what)
    return r.json()


def iso_duration(s: str) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    d, h, mi, se = (int(x or 0) for x in m.groups())
    return ((d * 24 + h) * 60 + mi) * 60 + se


def channel_info(send: Transport, token: str) -> dict[str, Any]:
    j = _get(send, token, f"{DATA}/channels?" + urllib.parse.urlencode(
        {"part": "snippet,statistics,contentDetails", "mine": "true"}), "채널 정보")
    items = j.get("items") or []
    if not items:
        raise UploadError("토큰 계정에 채널이 없습니다")
    c = items[0]
    st = c.get("statistics", {})
    return {"id": c.get("id", ""), "title": c.get("snippet", {}).get("title", ""),
            "subscribers": int(st.get("subscriberCount", 0) or 0), "video_count": int(st.get("videoCount", 0) or 0),
            "total_views": int(st.get("viewCount", 0) or 0),
            "uploads": c.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads", "")}


def list_videos(send: Transport, token: str, uploads: str) -> list[VideoRow]:
    ids: list[str] = []
    page = ""
    while True:
        q = {"part": "contentDetails", "playlistId": uploads, "maxResults": "50"}
        if page:
            q["pageToken"] = page
        j = _get(send, token, f"{DATA}/playlistItems?" + urllib.parse.urlencode(q), "업로드 목록")
        ids += [it["contentDetails"]["videoId"] for it in j.get("items", []) if it.get("contentDetails", {}).get("videoId")]
        page = j.get("nextPageToken", "")
        if not page or len(ids) >= 2000:
            break
    rows: list[VideoRow] = []
    for i in range(0, len(ids), 50):
        j = _get(send, token, f"{DATA}/videos?" + urllib.parse.urlencode(
            {"part": "snippet,statistics,contentDetails,status", "id": ",".join(ids[i:i + 50])}), "영상 정보")
        for v in j.get("items", []):
            st, sn = v.get("statistics", {}), v.get("snippet", {})
            rows.append(VideoRow(video_id=v["id"], title=sn.get("title", ""), published=sn.get("publishedAt", "")[:10],
                                 privacy=v.get("status", {}).get("privacyStatus", ""),
                                 duration_sec=iso_duration(v.get("contentDetails", {}).get("duration", "")),
                                 views=int(st.get("viewCount", 0) or 0), likes=int(st.get("likeCount", 0) or 0),
                                 comments=int(st.get("commentCount", 0) or 0)))
    return rows


class NoAnalyticsScope(UploadError):
    """토큰에 yt-analytics.readonly 가 없다 — 보고서의 분석 부분만 뺀다."""


def analytics(send: Transport, token: str, *, start: str, end: str, metrics: tuple[str, ...] | str,
              dimensions: str = "", sort: str = "", max_results: int = 0, filters: str = "") -> list[dict[str, Any]]:
    q = {"ids": "channel==MINE", "startDate": start, "endDate": end,
         "metrics": metrics if isinstance(metrics, str) else ",".join(metrics)}
    if dimensions:
        q["dimensions"] = dimensions
    if sort:
        q["sort"] = sort
    if max_results:
        q["maxResults"] = str(max_results)
    if filters:
        q["filters"] = filters
    r = send("GET", ANALYTICS + "?" + urllib.parse.urlencode(q), {"Authorization": f"Bearer {token}"}, None)
    if r.status in (401, 403):
        try:
            reason = json.dumps(r.json().get("error", {}), ensure_ascii=False)
        except ValueError:
            reason = r.body[:200].decode("utf-8", "replace")
        if "insufficient" in reason.lower() or "scope" in reason.lower() or "has not been used" in reason.lower() \
                or "disabled" in reason.lower() or "forbidden" in reason.lower():
            raise NoAnalyticsScope(f"분석 API 를 쓸 수 없습니다(HTTP {r.status}): {reason[:200]}")
    if r.status != 200:
        raise _api_error(r, "분석 보고서")
    j = r.json()
    cols = [h["name"] for h in j.get("columnHeaders", [])]
    return [dict(zip(cols, row)) for row in j.get("rows", []) or []]


# ───────────────────────────── 보고서 ─────────────────────────────

def _fmt(x: Any, kind: str = "") -> str:
    if x is None or x == "":
        return "—"
    if kind == "pct":
        return f"{float(x):.0f}%"
    if kind == "sec":
        return f"{float(x):.0f}초"
    if kind == "min":
        return f"{float(x):,.0f}분"
    if isinstance(x, float) and not x.is_integer():
        return f"{x:,.1f}"
    return f"{int(x):,}"


def _median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def group_line(name: str, rows: list[VideoRow], has_a: bool) -> str:
    v = [r.views for r in rows]
    line = f"| {name} | {len(rows)} | {_fmt(_median(v))} |"
    if has_a:
        apv = [r.a_total.get("averageViewPercentage") for r in rows if r.a_total.get("averageViewPercentage") is not None]
        eng = [r.a_total["engagedViews"] / r.a_total["views"] for r in rows if r.a_total.get("views")]
        line += f" {_fmt(_median(apv), 'pct')} | {_fmt(100 * _median(eng) if eng else None, 'pct')} |"
    return line


def build_report(today: dt.date, ch: dict[str, Any], rows: list[VideoRow], *, has_a: bool, a_note: str,
                 sources: list[dict[str, Any]], daily: list[dict[str, Any]], prev: dict[str, Any] | None) -> str:
    out: list[str] = [f"# 과학쑛츠 주간 채널 보고서 — {today.isoformat()}", ""]
    prev_views = {v["video_id"]: v["views"] for v in (prev or {}).get("videos", [])}
    prev_subs = (prev or {}).get("channel", {}).get("subscribers")
    pub = [r for r in rows if r.privacy == "public"]
    week_views = sum(int(d.get("views", 0)) for d in daily[-7:]) if daily else None
    week_subs = sum(int(d.get("subscribersGained", 0)) for d in daily[-7:]) if daily else None
    out += ["## 채널", "",
            f"- 구독자 **{ch['subscribers']:,}명**" + (f" (지난 보고서보다 {ch['subscribers'] - prev_subs:+,})" if prev_subs is not None else ""),
            f"- 공개 영상 {len(pub)}편 · 비공개 {sum(1 for r in rows if r.privacy == 'private')}편 · 누적 조회수 {ch['total_views']:,}회"]
    if has_a and daily:
        out.append(f"- 최근 7일(분석 자료 기준, 2~3일 늦음): 조회수 {week_views:,}회 · 구독 증가 {week_subs:+,}명")
    if not has_a:
        out += ["", f"> 분석 API 자료 없음: {a_note}", "> 시청 비율·시청 시간·유입 경로가 빠졌습니다. "
                "docs/CHANNEL_GROWTH.md '측정' 절대로 토큰에 분석 읽기 권한을 더하면 다음 보고서부터 나옵니다."]
    out += ["", "## 편별 (공개, 최신순)", ""]
    head = "| 편 | 제목 | 공개일 | 길이 | 첫 문장 | 조회수 | 지난주 대비 |"
    sep = "|---|---|---|---|---|---|---|"
    if has_a:
        head += " 참여 조회 비율 | 평균 시청 비율 | 평균 시청 | 구독 증가 |"
        sep += "---|---|---|---|"
    out += [head, sep]
    for r in sorted(pub, key=lambda x: (x.published, x.video_id), reverse=True):
        delta = r.views - prev_views[r.video_id] if r.video_id in prev_views else None
        title = HASHTAG_RE.sub("", r.title).strip().replace("|", "·")[:34]
        line = (f"| {r.episode or '?'} | {title} | {r.published} | {r.duration_sec}초 | "
                f"{ {'today': '오늘은', 'question': '질문', '?': '?'}[r.opener] } | {r.views:,} | "
                f"{'—' if delta is None else f'{delta:+,}'} |")
        if has_a:
            a = r.a_total
            eng = (100 * a["engagedViews"] / a["views"]) if a.get("views") else None
            line += (f" {_fmt(eng, 'pct')} | {_fmt(a.get('averageViewPercentage'), 'pct')} | "
                     f"{_fmt(a.get('averageViewDuration'), 'sec')} | {_fmt(a.get('subscribersGained'))} |")
        out.append(line)

    out += ["", "## 실험", ""]
    e1 = EXPERIMENTS["opener"]
    grp = [r for r in pub if r.published == e1["uploaded"] and r.episode]
    q = [r for r in grp if r.opener == "question"]
    t = [r for r in grp if r.opener == "today"]
    gh = "| 무리 | 편 수 | 조회수 중앙값 |" + (" 평균 시청 비율 중앙값 | 참여 조회 비율 중앙값 |" if has_a else "")
    gs = "|---|---|---|" + ("---|---|" if has_a else "")
    out += [f"### {e1['title']}", "",
            f"{e1['uploaded']}에 같은 날 공개한 편끼리 비교합니다. 판정일 {e1['judge_on']}.", "", gh, gs,
            group_line("질문형", q, has_a), group_line("오늘은형", t, has_a), ""]
    if today.isoformat() >= e1["judge_on"]:
        out.append("> 판정일이 지났습니다. 위 표로 첫 문장 규칙(2026-11-01 결정)을 다시 정할지 사용자에게 묻습니다.")
    else:
        out.append("> 아직 판정 전입니다. 표본이 작아(질문형 3편) 큰 차이만 의미가 있습니다.")
    e2 = EXPERIMENTS["length"]
    a_row = next((r for r in pub if r.episode == e2["a"]), None)
    b_row = next((r for r in pub if r.episode == e2["b"]), None)
    out += ["", f"### {e2['title']}", ""]
    if b_row is None:
        out.append("60초판이 아직 공개되지 않았습니다(또는 업로드 전).")
    else:
        for name, r in (("3분판", a_row), ("60초판", b_row)):
            if r is None:
                continue
            s = f"- {name}: 공개 {r.published}, 조회수 {r.views:,}"
            if has_a:
                s += (f", 평균 시청 비율 {_fmt(r.a_total.get('averageViewPercentage'), 'pct')}, "
                      f"참여 조회 {_fmt(r.a_total.get('engagedViews'))}")
            out.append(s)
        out.append("> 공개 시점이 달라 누적 조회수는 바로 비교할 수 없습니다. 같은 경과 일수의 값과 평균 시청 비율을 봅니다.")

    if has_a and sources:
        total = sum(int(s.get("views", 0)) for s in sources) or 1
        out += ["", "## 유입 경로 (최근 28일)", "", "| 경로 | 조회수 | 비율 |", "|---|---|---|"]
        for s in sources[:8]:
            out.append(f"| {s.get('insightTrafficSourceType')} | {int(s.get('views', 0)):,} | {100 * int(s.get('views', 0)) / total:.0f}% |")
    out += ["", "---", "자료: YouTube Data API(조회수는 실시간에 가까움) · YouTube Analytics API(2~3일 늦음). "
            "참여 조회 비율 = engagedViews ÷ views(쇼츠에서 넘기지 않고 본 비율의 근사). 원인 해석은 docs/CHANNEL_GROWTH.md."]
    return "\n".join(out) + "\n"


def run(send: Transport, token: str, *, today: dt.date, finals: Path, prev: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    ch = channel_info(send, token)
    rows = list_videos(send, token, ch["uploads"])
    by_vid, by_title = load_episodes(finals)
    for r in rows:
        ep = match_episode(r, by_vid, by_title)
        if ep:
            r.episode, r.number, r.opener = ep.dir, ep.number, ep.opener
    has_a, a_note, sources, daily = True, "", [], []
    end = (today - dt.timedelta(days=1)).isoformat()
    try:
        for row in analytics(send, token, start=CHANNEL_START, end=end, metrics=VIDEO_METRICS, dimensions="video",
                             sort="-views", max_results=200):
            for r in rows:
                if r.video_id == row.get("video"):
                    r.a_total = {k: row.get(k) for k in VIDEO_METRICS}
        wk = (today - dt.timedelta(days=7)).isoformat()
        for row in analytics(send, token, start=wk, end=end, metrics=VIDEO_METRICS, dimensions="video",
                             sort="-views", max_results=200):
            for r in rows:
                if r.video_id == row.get("video"):
                    r.a_week = {k: row.get(k) for k in VIDEO_METRICS}
        m28 = (today - dt.timedelta(days=28)).isoformat()
        sources = analytics(send, token, start=m28, end=end, metrics="views,estimatedMinutesWatched",
                            dimensions="insightTrafficSourceType", sort="-views")
        daily = analytics(send, token, start=m28, end=end, metrics="views,engagedViews,subscribersGained", dimensions="day",
                          sort="day")
    except NoAnalyticsScope as ex:
        has_a, a_note = False, str(ex)
    md = build_report(today, ch, rows, has_a=has_a, a_note=a_note, sources=sources, daily=daily, prev=prev)
    snap = {"date": today.isoformat(), "channel": {k: v for k, v in ch.items() if k != "uploads"},
            "analytics": has_a, "videos": [asdict(r) for r in rows], "sources": sources, "daily": daily}
    return md, snap


def latest_snapshot(folder: Path, before: str) -> dict[str, Any] | None:
    if not folder.is_dir():
        return None
    snaps = sorted(p for p in folder.glob("*.json") if p.stem < before)
    if not snaps:
        return None
    try:
        return json.loads(snaps[-1].read_text(encoding="utf-8"))
    except ValueError:
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m publish.analytics", description="과학쑛츠 주간 채널 보고서")
    ap.add_argument("--md", default="-", help="보고서 마크다운을 쓸 파일(- 이면 표준 출력)")
    ap.add_argument("--snapshot", type=Path, help="자료 스냅숏 JSON 을 쓸 파일(예: reports/youtube/2026-11-09.json)")
    ap.add_argument("--finals", type=Path, default=DEFAULT_FINALS)
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--env-file", type=Path)
    ap.add_argument("--today", help="기준일(YYYY-MM-DD, 시험용)")
    a = ap.parse_args(argv)
    env = dict(os.environ)
    try:
        if a.env_file:
            load_env_file(a.env_file, env)
        cfg = load_config(a.config)
        today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(dt.timezone.utc).date()
        send = urllib_transport(cfg.timeout_sec)
        token = access_token(send, read_secrets(env))
        prev = latest_snapshot(a.snapshot.parent, today.isoformat()) if a.snapshot else None
        md, snap = run(send, token, today=today, finals=a.finals, prev=prev)
    except (UploadError, TransportError, OSError, ValueError) as ex:
        print(f"[analytics] 실패 — {ex}", file=sys.stderr)
        return 1
    if a.md == "-":
        sys.stdout.write(md)
    else:
        Path(a.md).write_text(md, encoding="utf-8")
    if a.snapshot:
        a.snapshot.parent.mkdir(parents=True, exist_ok=True)
        a.snapshot.write_text(json.dumps(snap, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[analytics] 완료 — 영상 {len(snap['videos'])}편, 분석 자료 {'있음' if snap['analytics'] else '없음'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
