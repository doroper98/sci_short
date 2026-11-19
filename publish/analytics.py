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
        깊은 측정(2026-11-16, docs/CHANNEL_GROWTH.md 9-4 방안 4) — 공개 28일 안·조회수 300회 이상인 최근 편만(최대 25편),
        편마다 질의 3개: 시청 지속 곡선의 머리(elapsedVideoTimeRatio), 유입 경로(insightTrafficSourceType), 첫 4일 일별 조회(day).
        채널 전체 최근 28일: 연령·성별(viewerPercentage), 구독 여부별(subscribedStatus). 질의마다 따로 실패해도 그 칸만 빠진다.
편과 영상의 짝: finals/<ep>/youtube_upload.json 의 video_id, 없으면 upload.md 제목(해시태그 뺀 앞부분)으로 맞춘다.
첫 순간의 움직임: finals/<ep>/validation.json 의 first_moment, 없으면 reports/first_moment_baseline.json 의 episodes[<ep>]
(pipeline/first_moment.py 가 만든다). 둘 다 없으면 그 편은 '—'.
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

# 진행 중인 실험. 2026-11-08 사용자 결정으로 첫 문장 실험을 시작했으나(질문형 3편 대 오늘은형), 질문형 3편이 노출을 못 받아
# 판정하지 못했다. 2026-11-13 사용자 결정("1,2다 적용해"): since 뒤에 만드는 편은 ① 무음 없이 시작하고 ② 첫 문장을 그 편의
# 물음으로 한다. 기본 노출을 받은 편(min_views 이상)만, 참여 조회 비율(engagedViews ÷ views)로 견준다. need 편부터 견준다.
EXPERIMENTS = {
    "opener": {"title": "첫 순간 — 물음으로 바로 시작 대 \"오늘은 ~ 알아볼까요?\"", "since": "2026-11-14", "min_views": 300, "need": 4},
    # 2026-11-16 9-4 방안 2 "결과 먼저": since 뒤에 공개한 편 가운데 첫 순간 점검(first_moment.pass)을 통과한 편 대 since 앞의 편.
    # 기준선·목표는 9-5 판정 잣대(14편 합산 48.0%, 편별 38.8~61.2%, 목표 60%). 문턱 값은 제작 세션의 제안이다.
    "result_first": {"title": "결과 먼저 — 첫 2초에 가장 크게 움직이는 장면", "since": "2026-11-17", "min_views": 300, "need": 4,
                     "baseline_pct": 48.0, "baseline_range": "38.8~61.2%", "target_pct": 60.0},
}

# 깊은 측정(2026-11-16, 9-4 방안 4). 편당 질의 3개라 편 수를 묶는다.
DEEP_MIN_VIEWS = 300            # Data API 조회수 이 값 이상인 편만
DEEP_RECENT_DAYS = 28           # 공개 뒤 이 날 수 안의 편만
DEEP_MAX_VIDEOS = 25            # 최신 편부터 이 수까지
DEEP_FAIL_STREAK = 3            # 같은 질의가 성공 없이 이만큼 연달아 실패하면 나머지 편은 그 질의를 묻지 않는다(할당량 보호)
FIRST_DAYS = 3                  # 공개일(태평양 날짜) ~ +3일의 일별 조회
RETENTION_HEAD = 5              # 곡선 앞 5점(0.01~0.05, 170초 영상이면 약 2~8초)
RETENTION_MARKS = (0.10, 0.25, 0.50, 0.75, 1.00)
SEARCH_SOURCES = ("YT_SEARCH",)
FEED_SOURCES = ("SHORTS",)

# 첫 순간의 움직임(pipeline/first_moment.py 의 changed_pct). 1초에 이 비율(%) 이상 바뀐 편과 그 밖을 가른다.
FM_SPLIT_PCT = 10.0
DEFAULT_FM_BASELINE = Path(__file__).resolve().parents[1] / "reports" / "first_moment_baseline.json"

# 기본 노출 표(9-5 첫 줄): 최근 EXPOSURE_DAYS 일 안에 공개한 편, 조회수 EXPOSURE_VIEWS 회 이상 = 받음.
EXPOSURE_DAYS = 14
EXPOSURE_VIEWS = 800
# 방안 1 한 주 시험(새 편만·하루 한 편). 처음에는 17:00 KST 공개였고 11-18·11-19 두 편이 그렇게 나갔다.
# 2026-11-19 사용자: "내 생각에 아침07시가 맞을거 같아 왜냐면 하루종일 노출되는 윈도우가 저녁보다 더 길기 때문이야" → 07:00 KST.
# 판정 구간을 07:00 으로 나가는 7편(11-20~11-26)으로 옮긴 것은 제작 세션의 제안이다(config/daily.json _morning_2026_11_19).
# 공개 KST 날짜가 이 구간이고 낮 12시 전에 공개된 새 편을 공개 48시간 뒤부터 센다(늦게 올린 편은 11:15 까지 나갈 수 있다).
TRIAL = {"start": "2026-11-20", "end": "2026-11-26", "hours": 48, "views": EXPOSURE_VIEWS, "n": 7, "pass": 5, "at": "07:00"}
# 17:00 으로 나간 새 편(견줄 기준, 판정 없음). 전환 때 옛 설정의 실행이 먼저 올린 편은 11-20 17:00 에 나갈 수 있어 그날까지 본다.
TRIAL_PM = {"start": "2026-11-18", "end": "2026-11-20", "at": "17:00"}
NOON = 12
KST = dt.timezone(dt.timedelta(hours=9))


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
    # 2026-11-16 더함(옛 스냅숏에는 없다 — prev 로 읽을 때 쓰지 않는다)
    published_at: str = ""              # Data API snippet.publishedAt 전체(UTC). 비공개 편은 올린 시각
    publish_time: str = ""              # 가장 믿을 만한 공개 시각(UTC ISO): 기록의 sweep.published_at → publish_at → Data API
    publish_src: str = ""               # sweep · publish_at · data
    republished: bool | None = None     # 기록의 previous 가 있으면 다시 올린 판. None = 기록 없음
    a_retention: dict[str, Any] = field(default_factory=dict)   # 시청 지속 곡선의 머리와 표지점
    a_sources: dict[str, Any] = field(default_factory=dict)     # 편별 유입 경로
    a_days: list[dict[str, Any]] = field(default_factory=list)  # 공개일 ~ +3일 일별 조회(태평양 날짜)


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


def _parse_utc(s: Any) -> dt.datetime | None:
    if not s or not isinstance(s, str):
        return None
    try:
        t = dt.datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def load_publish_records(finals: Path) -> dict[str, dict[str, Any]]:
    """video_id → {'time': 공개 시각(UTC ISO), 'src', 'republished'}. 기록의 지금 판(video_id)에만 쓴다.

    공개 시각은 48시간 점검이 본 실제 공개 시각(sweep.published_at)을 먼저, 없으면 예약 공개 시각(publish_at)을 쓴다.
    """
    out: dict[str, dict[str, Any]] = {}
    for d in episode_dirs(finals):
        try:
            rec = read_record(d)
        except UploadError:
            continue
        if rec is None:
            continue
        sw = rec.sweep if isinstance(rec.sweep, dict) else {}
        t, src = None, ""
        if _parse_utc(sw.get("published_at")):
            t, src = _parse_utc(sw.get("published_at")), "sweep"
        elif _parse_utc(rec.publish_at):
            t, src = _parse_utc(rec.publish_at), "publish_at"
        out[rec.video_id] = {"time": t.astimezone(dt.timezone.utc).isoformat(timespec="seconds") if t else "",
                             "src": src, "republished": bool(rec.previous)}
    return out


def _fm_ok(v: Any) -> dict[str, Any] | None:
    """first_moment 객체의 꼴을 확인한다(다른 도구가 쓰는 파일이라 꼴이 틀리면 없는 것으로 본다)."""
    if not isinstance(v, dict) or not isinstance(v.get("changed_pct"), dict):
        return None
    return v


def load_first_moment(finals: Path, baseline: Path | None) -> dict[str, dict[str, Any]]:
    """finals 폴더 이름 → first_moment. validation.json 을 먼저, 없으면 baseline 파일의 episodes[폴더 이름]."""
    base: dict[str, Any] = {}
    if baseline is not None and baseline.is_file():
        try:
            eps = json.loads(baseline.read_text(encoding="utf-8")).get("episodes")
            base = eps if isinstance(eps, dict) else {}
        except (ValueError, OSError, AttributeError):
            base = {}
    out: dict[str, dict[str, Any]] = {}
    for d in episode_dirs(finals):
        fm = None
        v = d / "validation.json"
        if v.is_file():
            try:
                j = json.loads(v.read_text(encoding="utf-8"))
                fm = _fm_ok(j.get("first_moment")) if isinstance(j, dict) else None
            except (ValueError, OSError):
                fm = None
        if fm is not None:
            out[d.name] = {**fm, "src": "validation"}
        elif _fm_ok(base.get(d.name)) is not None:
            out[d.name] = {**base[d.name], "src": "baseline"}
    return out


def fm_changed(fm: dict[str, Any] | None, t: str) -> float | None:
    """changed_pct 에서 t 초('1.0')의 값. 키가 '1' 처럼 적혀 있어도 찾는다."""
    if not fm:
        return None
    ch = fm.get("changed_pct") or {}
    for k, v in ch.items():
        try:
            if abs(float(k) - float(t)) < 1e-9 and v is not None:
                return float(v)
        except (TypeError, ValueError):
            continue
    return None


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


def list_videos(send: Transport, token: str, uploads: str, limit: int = 2000) -> list[VideoRow]:
    ids: list[str] = []
    page = ""
    while True:
        q = {"part": "contentDetails", "playlistId": uploads, "maxResults": "50"}
        if page:
            q["pageToken"] = page
        j = _get(send, token, f"{DATA}/playlistItems?" + urllib.parse.urlencode(q), "업로드 목록")
        ids += [it["contentDetails"]["videoId"] for it in j.get("items", []) if it.get("contentDetails", {}).get("videoId")]
        page = j.get("nextPageToken", "")
        if not page or len(ids) >= limit:
            break
    ids = ids[:limit]
    rows: list[VideoRow] = []
    for i in range(0, len(ids), 50):
        j = _get(send, token, f"{DATA}/videos?" + urllib.parse.urlencode(
            {"part": "snippet,statistics,contentDetails,status", "id": ",".join(ids[i:i + 50])}), "영상 정보")
        for v in j.get("items", []):
            st, sn = v.get("statistics", {}), v.get("snippet", {})
            rows.append(VideoRow(video_id=v["id"], title=sn.get("title", ""), published=sn.get("publishedAt", "")[:10],
                                 published_at=sn.get("publishedAt", ""),
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


# ───────────────────────────── 깊은 측정(9-4 방안 4) ─────────────────────────────
# 질의 조합은 2026-11-16 공식 문서(developers.google.com/youtube/analytics/channel_reports · dimensions · metrics)로 확인했다.
#   시청 지속: 차원 elapsedVideoTimeRatio 하나, 필터 video 는 필수이고 한 편만(쉼표 목록 안 됨). 지표 audienceWatchRatio,
#             relativeRetentionPerformance. 편마다 0.01~1.0 의 100점. engagedViews 는 이 보고서에 없다.
#   유입 경로: 차원 insightTrafficSourceType, 필터 video 0~1개, 지표 views·engagedViews 모두 됨.
#   일별: 차원 day, 필터 video 0~1개, 지표 views·engagedViews. 날짜는 태평양 시간 자정 기준.
#   연령·성별: 차원 ageGroup,gender, 지표 viewerPercentage 만(engagedViews 안 됨).
#   구독 여부: 차원 subscribedStatus(SUBSCRIBED·UNSUBSCRIBED), 지표 views·engagedViews 됨.

try:
    from zoneinfo import ZoneInfo
    PACIFIC: dt.tzinfo = ZoneInfo("America/Los_Angeles")
except Exception:                                  # tzdata 가 없는 환경 — 11월(표준시) 기준으로 어림
    PACIFIC = dt.timezone(dt.timedelta(hours=-8))


def pacific_date(t: dt.datetime) -> dt.date:
    return t.astimezone(PACIFIC).date()


def _num(x: Any) -> float | None:
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None


def compact_retention(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """100점 곡선에서 앞 5점과 표지점(0.10·0.25·0.50·0.75·1.00 에 가장 가까운 점)만 남긴다.

    head_drop = 첫 점의 audienceWatchRatio − 0.05 에 가장 가까운 점의 값(170초 영상이면 약 8초 동안 잃은 몫).
    head_rrp = 앞 5점 relativeRetentionPerformance 의 평균(0.5 = 비슷한 길이 영상의 중간).
    """
    pts = []
    for r in rows:
        x, w, p = _num(r.get("elapsedVideoTimeRatio")), _num(r.get("audienceWatchRatio")), _num(r.get("relativeRetentionPerformance"))
        if x is not None:
            pts.append((x, w, p))
    pts.sort(key=lambda t: t[0])
    if not pts:
        return {}
    head = pts[:RETENTION_HEAD]
    keep = {round(x, 4): (x, w, p) for x, w, p in head}
    for m in RETENTION_MARKS:
        x, w, p = min(pts, key=lambda t: abs(t[0] - m))
        keep.setdefault(round(x, 4), (x, w, p))
    near05 = min(pts, key=lambda t: abs(t[0] - 0.05))
    drop = (pts[0][1] - near05[1]) if pts[0][1] is not None and near05[1] is not None else None
    rrp = [p for _, _, p in head if p is not None]
    return {"points": [[round(x, 4), w, p] for x, w, p in sorted(keep.values())],
            "head_drop": round(drop, 4) if drop is not None else None,
            "head_rrp": round(statistics.mean(rrp), 4) if rrp else None, "n_points": len(pts)}


def compact_sources(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by = {}
    for r in rows:
        k = r.get("insightTrafficSourceType")
        if k:
            by[str(k)] = [int(_num(r.get("views")) or 0), int(_num(r.get("engagedViews")) or 0)]
    total = sum(v[0] for v in by.values())
    if not by:
        return {}

    def share(keys: tuple[str, ...]) -> float | None:
        return round(sum(v[0] for k, v in by.items() if k in keys) / total, 4) if total else None
    feed, search = share(FEED_SOURCES), share(SEARCH_SOURCES)
    other = round(1 - feed - search, 4) if feed is not None and search is not None else None
    return {"by_type": by, "views": total, "feed": feed, "search": search, "other": other}


class _Deep:
    """질의마다 따로 실패를 담는다. 한 질의·한 편의 실패는 그 칸만 빼고 짧은 메모를 남긴다."""

    def __init__(self, send: Transport, token: str) -> None:
        self.send, self.token = send, token
        self.notes: list[str] = []
        self.calls = 0
        self._streak: dict[str, int] = {}
        self._ok: set[str] = set()
        self._fail: dict[str, list[str]] = {}
        self._empty: dict[str, list[str]] = {}
        self._skipped: dict[str, int] = {}

    def ask(self, kind: str, who: str, **kw: Any) -> list[dict[str, Any]] | None:
        if kind not in self._ok and self._streak.get(kind, 0) >= DEEP_FAIL_STREAK:
            self._skipped[kind] = self._skipped.get(kind, 0) + 1
            return None
        self.calls += 1
        try:
            rows = analytics(self.send, self.token, **kw)
        except (UploadError, TransportError, ValueError, KeyError, TypeError) as ex:
            self._streak[kind] = self._streak.get(kind, 0) + 1
            self._fail.setdefault(kind, []).append(f"{who}: {str(ex)[:160]}")
            return None
        self._ok.add(kind)
        self._streak[kind] = 0
        if not rows:
            self._empty.setdefault(kind, []).append(who)
        return rows

    def summary(self) -> list[str]:
        out = []
        for kind, errs in self._fail.items():
            out.append(f"{kind}: {len(errs)}건 실패(그 칸만 뺌) — {errs[0]}")
        for kind, n in self._skipped.items():
            out.append(f"{kind}: 연달아 {DEEP_FAIL_STREAK}번 실패해 나머지 {n}편은 묻지 않음")
        for kind, who in self._empty.items():
            out.append(f"{kind}: 자료 없음 {len(who)}건({', '.join(who[:6])}{' …' if len(who) > 6 else ''})")
        return out


def deep_targets(rows: list[VideoRow], today: dt.date) -> list[VideoRow]:
    def pub(r: VideoRow) -> dt.date | None:
        t = _parse_utc(r.publish_time) or _parse_utc(r.published_at)
        return t.date() if t else (dt.date.fromisoformat(r.published) if r.published else None)
    out = [r for r in rows if r.privacy == "public" and r.views >= DEEP_MIN_VIEWS and pub(r) is not None
           and (today - pub(r)).days < DEEP_RECENT_DAYS]
    out.sort(key=lambda r: (r.publish_time or r.published_at or r.published, r.video_id), reverse=True)
    return out[:DEEP_MAX_VIDEOS]


def deep_measure(send: Transport, token: str, rows: list[VideoRow], *, today: dt.date, end: str
                 ) -> tuple[dict[str, Any], dict[str, Any], list[str], int]:
    """편별 시청 지속·유입 경로·첫 4일, 채널 전체 연령·성별·구독 여부. (demographics, subscribed, notes, 질의 수)."""
    q = _Deep(send, token)
    end_d = dt.date.fromisoformat(end)
    for r in deep_targets(rows, today):
        t = _parse_utc(r.publish_time) or _parse_utc(r.published_at)
        start_d = pacific_date(t) if t else dt.date.fromisoformat(r.published)
        if start_d > end_d:
            q.notes.append(f"{r.episode or r.video_id}: 공개가 분석 기간 끝({end})보다 늦어 묻지 않음")
            continue
        who, f = r.episode or r.video_id, f"video=={r.video_id}"
        rr = q.ask("시청 지속 곡선", who, start=start_d.isoformat(), end=end,
                   metrics="audienceWatchRatio,relativeRetentionPerformance", dimensions="elapsedVideoTimeRatio", filters=f)
        if rr:
            r.a_retention = compact_retention(rr)
        sr = q.ask("편별 유입 경로", who, start=start_d.isoformat(), end=end, metrics="views,engagedViews",
                   dimensions="insightTrafficSourceType", filters=f)
        if sr:
            r.a_sources = compact_sources(sr)
        d_end = min(start_d + dt.timedelta(days=FIRST_DAYS), end_d)
        dr = q.ask("첫 4일 일별 조회", who, start=start_d.isoformat(), end=d_end.isoformat(), metrics="views,engagedViews",
                   dimensions="day", sort="day", filters=f)
        if dr:
            r.a_days = [{"day": d.get("day"), "views": int(_num(d.get("views")) or 0),
                         "engagedViews": int(_num(d.get("engagedViews")) or 0)} for d in dr]
    m28 = (today - dt.timedelta(days=28)).isoformat()
    demo: dict[str, Any] = {}
    dm = q.ask("연령·성별", "채널", start=m28, end=end, metrics="viewerPercentage", dimensions="ageGroup,gender")
    if dm:
        demo = {"start": m28, "end": end, "rows": [{"ageGroup": d.get("ageGroup"), "gender": d.get("gender"),
                                                    "viewerPercentage": _num(d.get("viewerPercentage"))} for d in dm]}
    subs: dict[str, Any] = {}
    ss = q.ask("구독 여부별", "채널", start=m28, end=end, metrics="views,engagedViews", dimensions="subscribedStatus")
    if ss:
        subs = {"start": m28, "end": end, "rows": [{"subscribedStatus": d.get("subscribedStatus"),
                                                    "views": int(_num(d.get("views")) or 0),
                                                    "engagedViews": int(_num(d.get("engagedViews")) or 0)} for d in ss]}
    return demo, subs, q.notes + q.summary(), q.calls


# ───────────────────────────── 동종 채널 비교 ─────────────────────────────

DEFAULT_BENCHMARK = Path(__file__).resolve().parents[1] / "config" / "benchmark.json"
BUCKETS = ((0, 60, "60초 이하"), (61, 120, "61~120초"), (121, 180, "121~180초"))
FRESH_DAYS = 3          # 공개 3일 안의 편은 조회수 비교에서 뺀다(아직 노출이 끝나지 않음)


def _percentiles(vals: list[float]) -> list[float]:
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    out = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            out[order[k]] = ((i + j) / 2) / max(len(vals) - 1, 1)
        i = j + 1
    return out


def channel_stats(label: str, tier: str, subs: int | None, rows: list[VideoRow], today: dt.date) -> dict[str, Any]:
    shorts = [r for r in rows if 0 < r.duration_sec <= 180 and r.privacy in ("public", "")]
    judged = [r for r in shorts if r.published and (today - dt.date.fromisoformat(r.published)).days >= FRESH_DAYS]
    recent = [r for r in shorts if r.published and (today - dt.date.fromisoformat(r.published)).days < 28]
    dates = sorted(dt.date.fromisoformat(r.published) for r in shorts if r.published)
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    v = [r.views for r in judged]
    return {"label": label, "tier": tier, "subs": subs, "n_shorts": len(shorts), "n_judged": len(judged),
            "median_sec": _median([r.duration_sec for r in shorts]),
            "share_le60": (sum(r.duration_sec <= 60 for r in shorts) / len(shorts)) if shorts else None,
            "median_views": _median(v), "p90_views": sorted(v)[int(0.9 * (len(v) - 1))] if v else None,
            "lt50": (sum(x < 50 for x in v) / len(v)) if v else None,
            "per_week": len(recent) / 4, "median_gap_days": _median(gaps),
            "same_day_share": (sum(g == 0 for g in gaps) / len(gaps)) if gaps else None}


def length_effect(per_channel: list[list[VideoRow]], today: dt.date) -> list[dict[str, Any]]:
    """채널 안 조회수 백분위를 길이 구간별로 모은다(채널 규모 효과 제거). 3구간 중 2구간 이상에 각 3편+ 있는 채널만."""
    acc: dict[str, list[float]] = {b[2]: [] for b in BUCKETS}
    chans: dict[str, int] = {b[2]: 0 for b in BUCKETS}
    for rows in per_channel:
        js = [r for r in rows if 0 < r.duration_sec <= 180 and r.published
              and (today - dt.date.fromisoformat(r.published)).days >= FRESH_DAYS]
        if len(js) < 10:
            continue
        counts = {b[2]: sum(b[0] <= r.duration_sec <= b[1] for r in js) for b in BUCKETS}
        if sum(c >= 3 for c in counts.values()) < 2:
            continue
        pct = _percentiles([float(r.views) for r in js])
        for r, q in zip(js, pct):
            for lo, hi, name in BUCKETS:
                if lo <= r.duration_sec <= hi:
                    acc[name].append(q)
        for name, c in counts.items():
            chans[name] += c >= 3
    return [{"bucket": name, "n": len(acc[name]), "channels": chans[name],
             "mean_pct": (statistics.mean(acc[name]) if acc[name] else None)} for _, _, name in BUCKETS]


def benchmark(send: Transport, token: str, cfg: dict[str, Any], today: dt.date,
              own: tuple[str, int | None, list[VideoRow]] | None = None) -> dict[str, Any]:
    recent = int(cfg.get("recent", 50))
    rows_out, per_channel, errors = [], [], []
    for p in cfg.get("peers", []):
        ref = p["id"]
        q = {"part": "snippet,statistics,contentDetails"}
        q.update({"forHandle": ref} if ref.startswith("@") else {"id": ref})
        try:
            j = _get(send, token, f"{DATA}/channels?" + urllib.parse.urlencode(q), f"동종 채널 {p.get('label', ref)}")
            items = j.get("items") or []
            if not items:
                errors.append(f"{p.get('label', ref)}: 채널을 찾지 못함")
                continue
            c = items[0]
            uploads = c.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads", "")
            vids = list_videos(send, token, uploads, limit=recent)
        except (UploadError, TransportError) as ex:
            errors.append(f"{p.get('label', ref)}: {ex}")
            continue
        subs = int(c.get("statistics", {}).get("subscriberCount", 0) or 0)
        rows_out.append(channel_stats(p.get("label", ref), p.get("tier", ""), subs, vids, today))
        per_channel.append(vids)
    own_stats = channel_stats(own[0], "self", own[1], own[2], today) if own else None
    return {"channels": rows_out, "own": own_stats, "length_effect": length_effect(per_channel, today), "errors": errors}


def benchmark_md(b: dict[str, Any]) -> list[str]:
    out = ["", "## 동종 채널 비교 (공식 Data API, 최근 업로드)", "",
           "| 채널 | 층 | 구독자 | 쇼츠 길이 중앙값 | 60초 이하 비율 | 조회수 중앙값 | 상위 10% | 50회 미만 | 주당 공개 | 같은 날 공개 비율 |",
           "|---|---|---|---|---|---|---|---|---|---|"]
    rows = sorted(b["channels"], key=lambda r: -(r["subs"] or 0)) + ([b["own"]] if b.get("own") else [])
    for r in rows:
        name = f"**{r['label']}**" if r["tier"] == "self" else r["label"]
        out.append(f"| {name} | {r['tier']} | {_fmt(r['subs'])} | {_fmt(r['median_sec'], 'sec')} | {_fmt(100 * r['share_le60'] if r['share_le60'] is not None else None, 'pct')} | "
                   f"{_fmt(r['median_views'])} | {_fmt(r['p90_views'])} | {_fmt(100 * r['lt50'] if r['lt50'] is not None else None, 'pct')} | "
                   f"{r['per_week']:.1f} | {_fmt(100 * r['same_day_share'] if r['same_day_share'] is not None else None, 'pct')} |")
    le = b.get("length_effect") or []
    if any(x["n"] for x in le):
        out += ["", "### 길이와 조회수 — 같은 채널 안에서 비교", "",
                "채널마다 조회수를 0(가장 낮음)~1(가장 높음) 백분위로 바꾼 뒤 길이 구간별로 평균했습니다. 0.5 보다 크면 그 채널 안에서 평균보다 잘된 편입니다.", "",
                "| 길이 | 편 수 | 채널 수 | 평균 백분위 |", "|---|---|---|---|"]
        for x in le:
            mp = "—" if x["mean_pct"] is None else "%.2f" % x["mean_pct"]
            out.append(f"| {x['bucket']} | {x['n']} | {x['channels']} | {mp} |")
        out += ["", "> 길이를 섞어 쓰는 채널만 들어갑니다. 길이와 주제가 함께 움직일 수 있어 원인이 아니라 관계입니다."]
    if b.get("errors"):
        out += ["", "가져오지 못한 채널: " + " · ".join(b["errors"])]
    return out


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


def _eng(r: VideoRow) -> float | None:
    """넘기지 않고 본 비율(참여 조회 비율) = engagedViews ÷ views, 분석 누적 기준."""
    a = r.a_total
    v, e = _num(a.get("views")), _num(a.get("engagedViews"))
    return e / v if v and e is not None else None


def _p1(x: float | None, suffix: str = "%") -> str:
    return "—" if x is None else f"{x:.1f}{suffix}"


def _kst(r: VideoRow) -> dt.datetime | None:
    t = _parse_utc(r.publish_time) or _parse_utc(r.published_at)
    return t.astimezone(KST) if t else None


def _kst_label(r: VideoRow) -> str:
    t = _kst(r)
    return t.strftime("%m-%d %H:%M") if t else (r.published or "—")


def _a_views(r: VideoRow) -> float:
    return _num(r.a_total.get("views")) or 0.0


def result_first_md(pub: list[VideoRow], fm: dict[str, dict[str, Any]], has_a: bool) -> list[str]:
    """실험 '결과 먼저'(9-4 방안 2): since 뒤 공개·첫 순간 점검 통과 편 대 since 앞의 편, 넘기지 않고 본 비율로."""
    e = EXPERIMENTS["result_first"]
    seen = [r for r in pub if r.episode and (_a_views(r) if has_a else r.views) >= e["min_views"]]
    new = [r for r in seen if r.published >= e["since"] and (fm.get(r.episode) or {}).get("pass") is True]
    miss = [r for r in seen if r.published >= e["since"] and (fm.get(r.episode) or {}).get("pass") is not True]
    old = [r for r in seen if r.published < e["since"]]
    gh = "| 무리 | 편 수 | 조회수 중앙값 |" + (" 평균 시청 비율 중앙값 | 참여 조회 비율 중앙값 |" if has_a else "")
    gs = "|---|---|---|" + ("---|---|" if has_a else "")
    out = ["", f"### {e['title']}", "",
           f"{e['since']} 뒤에 공개한 편 가운데 첫 순간 점검(pipeline/first_moment.py, first_moment.pass)을 통과한 편과 그 앞의 편을 "
           f"넘기지 않고 본 비율로 견줍니다. 기준선은 합산 {e['baseline_pct']:.1f}%(편별 {e['baseline_range']}), 목표 {e['target_pct']:.0f}%"
           f"입니다(docs/CHANNEL_GROWTH.md 9-5). 조회수 {e['min_views']:,}회 이상만 셉니다.", "", gh, gs,
           group_line("결과 먼저(점검 통과)", new, has_a), group_line(f"{e['since']} 앞의 편", old, has_a), ""]
    if miss:
        out.append(f"> {e['since']} 뒤 편 가운데 점검을 통과하지 못했거나 측정이 없는 {len(miss)}편은 어느 무리에도 넣지 않았습니다: "
                   + ", ".join(r.episode or r.video_id for r in miss) + ".")
    en = _median([x for x in map(_eng, new) if x is not None])
    eo = _median([x for x in map(_eng, old) if x is not None])
    if has_a and len(new) >= e["need"] and en is not None:
        verdict = "이상입니다" if 100 * en >= e["target_pct"] else "에 못 미칩니다"
        line = (f"> 결과 먼저 {len(new)}편이 모였습니다. 넘기지 않고 본 비율 중앙값 {100 * en:.1f}% — 기준선 {e['baseline_pct']:.1f}% 보다 "
                f"{100 * en - e['baseline_pct']:+.1f}%p, 목표 {e['target_pct']:.0f}% {verdict}")
        if eo is not None:
            line += f"(앞의 편 중앙값과 차이 {100 * (en - eo):+.1f}%p)"
        out.append(line + ". 편당 오차가 약 ±3%p 입니다. 이 결과를 사용자에게 알립니다.")
    else:
        out.append(f"> 결과 먼저 편이 아직 {len(new)}편입니다. {e['need']}편부터 판정합니다"
                   + ("." if has_a else "(분석 API 자료가 있어야 참여 조회 비율이 나옵니다)."))
    return out


def first_moment_md(pub: list[VideoRow], fm: dict[str, dict[str, Any]], has_a: bool) -> list[str]:
    """첫 순간의 움직임(changed_pct)과 넘기지 않고 본 비율을 편마다 나란히 놓는다."""
    out = ["", "## 첫 순간의 움직임과 넘기지 않고 본 비율", ""]
    if not has_a:
        return out + ["> 분석 API 자료가 없어 넘기지 않고 본 비율을 견줄 수 없습니다."]
    min_v = EXPERIMENTS["result_first"]["min_views"]
    rs = sorted([r for r in pub if r.episode and _a_views(r) >= min_v and _eng(r) is not None],
                key=lambda r: (r.publish_time or r.published_at or r.published, r.video_id))
    out += [f"분석 누적 조회수 {min_v:,}회 이상인 편, 공개 순. 화면 변화 = 0초 프레임보다 달라진 화면의 비율(pipeline/first_moment.py). "
            "머리 낙폭 = 곡선 첫 점과 5% 지점의 audienceWatchRatio 차(아래 '편별 깊은 측정', 공개 28일 안 편만).", "",
            "| 편 | 공개 | 1초 변화 | 2초 변화 | 첫 소리 | 점검 | 넘기지 않고 본 비율 | 머리 낙폭 |", "|---|---|---|---|---|---|---|---|"]
    hi, lo, none = [], [], 0
    for r in rs:
        f = fm.get(r.episode or "")
        c1, c2 = fm_changed(f, "1.0"), fm_changed(f, "2.0")
        fs = _num((f or {}).get("first_sound_sec"))
        ok = {True: "통과", False: "못 함"}.get((f or {}).get("pass"), "—") if f else "—"
        hd = (r.a_retention or {}).get("head_drop")
        out.append(f"| {r.episode} | {_kst_label(r)} | {_p1(c1)} | {_p1(c2)} | {_p1(fs, '초')} | {ok} | "
                   f"{_p1(100 * _eng(r))} | {'—' if hd is None else f'{100 * hd:.0f}%p'} |")
        if c1 is None:
            none += 1
        else:
            (hi if c1 >= FM_SPLIT_PCT else lo).append(_eng(r))
    mh, ml = _median(hi), _median(lo)
    out += ["", f"- 1초 변화 {FM_SPLIT_PCT:.0f}% 이상: {len(hi)}편, 넘기지 않고 본 비율 중앙값 {_p1(100 * mh if mh is not None else None)}",
            f"- 1초 변화 {FM_SPLIT_PCT:.0f}% 미만: {len(lo)}편, 중앙값 {_p1(100 * ml if ml is not None else None)}"]
    if none:
        out.append(f"- 첫 순간 측정이 없는 편 {none}편은 나누지 않았습니다(validation.json·reports/first_moment_baseline.json 에 없음).")
    out.append("> 주의: 두 무리는 주제·공개 시각·하루 편 수가 함께 다릅니다. 차이가 나도 화면 움직임의 효과라고 말할 수 없습니다.")
    return out


def exposure_md(pub: list[VideoRow], now: dt.datetime) -> list[str]:
    """기본 노출(9-5 첫 줄): 최근 14일 공개 편이 800회를 넘었는가, 그리고 방안 1 한 주 시험 줄(17:00 두 편 · 07:00 일곱 편)."""
    hours = TRIAL["hours"]
    rs = sorted([r for r in pub if _kst(r) and now - _kst(r) < dt.timedelta(days=EXPOSURE_DAYS)],
                key=lambda r: (_kst(r), r.video_id))
    out = ["", f"## 기본 노출 (최근 {EXPOSURE_DAYS}일 공개)", "",
           f"공개 시각은 업로드 기록의 실제 공개 시각(48시간 점검) → 예약 공개 시각 → Data API 순으로 씁니다. 조회수는 지금 값이라 "
           f"공개 {hours}시간 때의 값보다 클 수 있습니다.", "",
           f"| 편 | 공개(KST) | 시각 출처 | 경과 | 조회수 | {EXPOSURE_VIEWS:,}회 |", "|---|---|---|---|---|---|"]
    judged = got = 0
    for r in rs:
        age = (now - _kst(r)).total_seconds() / 3600
        if r.views >= EXPOSURE_VIEWS:
            mark = "받음"
        elif age < hours:
            mark = f"아직({hours}시간 전)"
        else:
            mark = "못 받음"
        if age >= hours:
            judged += 1
            got += r.views >= EXPOSURE_VIEWS
        src = {"sweep": "점검 기록", "publish_at": "예약 시각"}.get(r.publish_src, "Data API")
        kind = " (다시 올림)" if r.republished else ""
        out.append(f"| {r.episode or r.video_id}{kind} | {_kst_label(r)} | {src} | {age:.0f}시간 | {r.views:,} | {mark} |")
    out += ["", f"- 공개 {hours}시간이 지난 **{judged}편 중 {got}편**이 {EXPOSURE_VIEWS:,}회 이상입니다."]
    # 방안 1 한 주 시험(새 편만, 하루 한 편). 17:00 으로 나간 편(견줄 기준) → 07:00 으로 나가는 7편(판정).
    def judged_new(span: dict[str, Any], morning: bool) -> list[VideoRow]:
        return [r for r in pub if _kst(r) and span["start"] <= _kst(r).date().isoformat() <= span["end"]
                and (_kst(r).hour < NOON) is morning and r.republished is not True
                and (now - _kst(r)).total_seconds() / 3600 >= hours]

    pm = judged_new(TRIAL_PM, False)
    if pm:
        out.append(f"- {TRIAL_PM['at']} 으로 공개한 새 편({TRIAL_PM['start'][5:]}~, 하루 한 편, 견줄 기준): 공개 {hours}시간이 지난 "
                   f"{len(pm)}편 중 {sum(r.views >= TRIAL['views'] for r in pm)}편이 {TRIAL['views']:,}회 이상.")
    tj = judged_new(TRIAL, True)
    if tj:
        tg = sum(r.views >= TRIAL["views"] for r in tj)
        line = (f"- 한 주 시험({TRIAL['start'][5:]}~{TRIAL['end'][5:]} 공개, 새 편만·하루 한 편·{TRIAL['at']}): 공개 {hours}시간이 지난 "
                f"{len(tj)}편 중 {tg}편이 {TRIAL['views']:,}회 이상 — 기준 {TRIAL['n']}편 중 {TRIAL['pass']}편 이상.")
        if len(tj) >= TRIAL["n"]:
            line += (" 판정: 기준을 채웠습니다(하루 여러 편 쪽 원인 — 아침 공개는 걸림돌이 아닙니다)." if tg >= TRIAL["pass"]
                     else f" 판정: 기준에 못 미칩니다(주제·형식 또는 아침 공개 쪽 — {TRIAL_PM['at']} 편과 견줍니다, 9-8).")
        out.append(line)
    return out


def deep_md(pub: list[VideoRow], notes: list[str]) -> list[str]:
    rs = sorted([r for r in pub if r.a_retention or r.a_sources or r.a_days],
                key=lambda r: (r.publish_time or r.published_at or r.published, r.video_id), reverse=True)
    out = ["", f"## 편별 깊은 측정 (공개 {DEEP_RECENT_DAYS}일 안 · 조회수 {DEEP_MIN_VIEWS:,}회 이상 · 최대 {DEEP_MAX_VIDEOS}편)", ""]
    if rs:
        out += ["| 편 | 공개(KST) | 조회수 | 쇼츠 피드 | 검색 | 그 밖 | 첫 4일 일별 조회 | 첫 점 시청 비율 | 머리 낙폭 | 앞 5점 상대 성적 |",
                "|---|---|---|---|---|---|---|---|---|---|"]
        for r in rs:
            s, t = r.a_sources or {}, r.a_retention or {}
            pts = t.get("points") or []
            first = pts[0][1] if pts and pts[0][1] is not None else None
            sh = [_p1(100 * s[k] if s.get(k) is not None else None).replace(".0%", "%") for k in ("feed", "search", "other")]
            days = " · ".join(f"{d.get('views', 0):,}" for d in r.a_days) or "—"
            hd, rp = t.get("head_drop"), t.get("head_rrp")
            out.append(f"| {r.episode or r.video_id} | {_kst_label(r)} | {r.views:,} | {sh[0]} | {sh[1]} | {sh[2]} | {days} | "
                       f"{'—' if first is None else f'{100 * first:.0f}%'} | {'—' if hd is None else f'{100 * hd:.0f}%p'} | "
                       f"{'—' if rp is None else f'{rp:.2f}'} |")
        out += ["", "> 첫 4일은 분석 API 의 날짜 경계(태평양 시간 자정 = 한국 17:00, 서머타임이면 16:00) 기준이라 공개 시각과 어긋납니다. "
                "17:00 KST 공개는 첫날이 거의 온전한 하루이고, 06:00 KST 공개는 첫날이 11시간쯤입니다. "
                "앞 5점은 영상 길이의 1~5%(170초 영상이면 약 2~8초)이고, 상대 성적 0.5 는 비슷한 길이 영상의 중간입니다. "
                "시청 비율은 다시 보기 때문에 100% 를 넘을 수 있습니다."]
    else:
        out.append("> 해당하는 편이 없거나 자료가 아직 없습니다.")
    if notes:
        out += ["", "빠진 것: " + " · ".join(notes)]
    return out


def audience_md(demo: dict[str, Any], subs: dict[str, Any]) -> list[str]:
    out = ["", "## 시청자 (최근 28일, 채널 전체)", ""]
    rows = demo.get("rows") or []
    if rows:
        age: dict[str, float] = {}
        gen: dict[str, float] = {}
        for d in rows:
            p = d.get("viewerPercentage") or 0.0
            age[str(d.get("ageGroup"))] = age.get(str(d.get("ageGroup")), 0.0) + p
            gen[str(d.get("gender"))] = gen.get(str(d.get("gender")), 0.0) + p
        out += ["- 연령: " + " · ".join(f"{k.replace('age', '')} {v:.0f}%" for k, v in sorted(age.items())),
                "- 성별: " + " · ".join(f"{k} {v:.0f}%" for k, v in sorted(gen.items(), key=lambda kv: -kv[1])),
                "> 로그인한 시청자 기준입니다(viewerPercentage). 13세 미만은 나오지 않으므로 목표(11~16세) 가운데 13~16세만 13-17 칸에 보입니다."]
    else:
        out.append("- 연령·성별: 자료 없음")
    srows = subs.get("rows") or []
    if srows:
        total = sum(d["views"] for d in srows) or 1
        out += ["", "| 구독 여부 | 조회수 | 비율 | 참여 조회 비율 |", "|---|---|---|---|"]
        for d in sorted(srows, key=lambda d: -d["views"]):
            name = {"SUBSCRIBED": "구독자", "UNSUBSCRIBED": "구독 안 함"}.get(str(d.get("subscribedStatus")), str(d.get("subscribedStatus")))
            eng = 100 * d["engagedViews"] / d["views"] if d["views"] else None
            out.append(f"| {name} | {d['views']:,} | {100 * d['views'] / total:.1f}% | {_p1(eng)} |")
    else:
        out.append("- 구독 여부별: 자료 없음")
    return out


def build_report(today: dt.date, ch: dict[str, Any], rows: list[VideoRow], *, has_a: bool, a_note: str,
                 sources: list[dict[str, Any]], daily: list[dict[str, Any]], prev: dict[str, Any] | None,
                 bench: dict[str, Any] | None = None, fm: dict[str, dict[str, Any]] | None = None,
                 now: dt.datetime | None = None, demographics: dict[str, Any] | None = None,
                 subscribed: dict[str, Any] | None = None, deep_notes: list[str] | None = None) -> str:
    now = now or dt.datetime.combine(today, dt.time(0, 0), dt.timezone.utc)
    fm = fm or {}
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
    seen = [r for r in pub if r.episode and (r.a_total.get("views", 0) if has_a else r.views) >= e1["min_views"]]
    fresh = [r for r in seen if r.opener == "question" and r.published >= e1["since"]]
    base = [r for r in seen if r.opener == "today"]
    gh = "| 무리 | 편 수 | 조회수 중앙값 |" + (" 평균 시청 비율 중앙값 | 참여 조회 비율 중앙값 |" if has_a else "")
    gs = "|---|---|---|" + ("---|---|" if has_a else "")
    out += [f"### {e1['title']}", "",
            f"2026-11-13 사용자 결정으로 {e1['since']} 뒤에 만드는 편은 무음 없이 시작하고 첫 문장을 그 편의 물음으로 합니다"
            f"(둘을 함께 바꿔 어느 쪽 효과인지는 가를 수 없습니다). 기본 노출을 받은 편(조회수 {e1['min_views']:,}회 이상)만 견주고, "
            "잣대는 참여 조회 비율(넘기지 않고 본 비율의 근사)입니다.", "", gh, gs,
            group_line("새 형식(물음으로 시작)", fresh, has_a), group_line("이전 형식(오늘은형)", base, has_a), ""]

    def eng_median(rs: list[VideoRow]) -> float | None:
        return _median([r.a_total["engagedViews"] / r.a_total["views"] for r in rs if r.a_total.get("views")])

    if has_a and len(fresh) >= e1["need"] and eng_median(fresh) is not None and eng_median(base) is not None:
        diff = 100 * (eng_median(fresh) - eng_median(base))
        out.append(f"> 새 형식 {len(fresh)}편이 모였습니다. 참여 조회 비율 중앙값 차이는 {diff:+.1f}%p 입니다. 편당 오차가 약 ±3%p 라 "
                   "7%p 이상이면 뜻있는 차이로 봅니다. 이 결과를 사용자에게 알립니다.")
    else:
        out.append(f"> 새 형식 편이 아직 {len(fresh)}편입니다. {e1['need']}편부터 견줍니다"
                   + ("." if has_a else "(분석 API 자료가 있어야 참여 조회 비율이 나옵니다)."))
    out += result_first_md(pub, fm, has_a)
    out += ["", "### 길이",
            "", "60초판 시험은 2026-11-08 사용자 결정으로 접었습니다(\"설명력이 떨어질 것 같아\"). 길이는 아래 동종 채널 비교의 "
            "'길이와 조회수' 표와 우리 편들의 평균 시청 비율로만 지켜봅니다."]

    if has_a and sources:
        total = sum(int(s.get("views", 0)) for s in sources) or 1
        out += ["", "## 유입 경로 (최근 28일)", "", "| 경로 | 조회수 | 비율 |", "|---|---|---|"]
        for s in sources[:8]:
            out.append(f"| {s.get('insightTrafficSourceType')} | {int(s.get('views', 0)):,} | {100 * int(s.get('views', 0)) / total:.0f}% |")
    out += first_moment_md(pub, fm, has_a)
    out += exposure_md(pub, now)
    if has_a:
        out += deep_md(pub, deep_notes or [])
        out += audience_md(demographics or {}, subscribed or {})
    if bench:
        out += benchmark_md(bench)
    out += ["", "---", "자료: YouTube Data API(조회수는 실시간에 가까움) · YouTube Analytics API(2~3일 늦음). "
            "참여 조회 비율 = engagedViews ÷ views(쇼츠에서 넘기지 않고 본 비율의 근사). 원인 해석은 docs/CHANNEL_GROWTH.md."]
    return "\n".join(out) + "\n"


def run(send: Transport, token: str, *, today: dt.date, finals: Path, prev: dict[str, Any] | None,
        bench_cfg: dict[str, Any] | None = None, fm_baseline: Path | None = None,
        now: dt.datetime | None = None) -> tuple[str, dict[str, Any]]:
    """fm_baseline: reports/first_moment_baseline.json(없어도 된다). now: 기본 노출 표의 경과 시간 기준(없으면 today 00:00 UTC)."""
    now = now or dt.datetime.combine(today, dt.time(0, 0), dt.timezone.utc)
    ch = channel_info(send, token)
    rows = list_videos(send, token, ch["uploads"])
    by_vid, by_title = load_episodes(finals)
    recs = load_publish_records(finals)
    for r in rows:
        ep = match_episode(r, by_vid, by_title)
        if ep:
            r.episode, r.number, r.opener = ep.dir, ep.number, ep.opener
        rec = recs.get(r.video_id)
        if rec and rec["time"]:
            r.publish_time, r.publish_src = rec["time"], rec["src"]
        elif _parse_utc(r.published_at):
            r.publish_time, r.publish_src = _parse_utc(r.published_at).isoformat(timespec="seconds"), "data"
        if rec:
            r.republished = rec["republished"]
    fm = load_first_moment(finals, fm_baseline)
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
    demo: dict[str, Any] = {}
    subs: dict[str, Any] = {}
    deep_notes: list[str] = []
    deep_calls = 0
    if has_a:                       # 깊은 측정은 질의마다 따로 실패한다. 무엇이 터져도 위의 자료와 보고서는 그대로 나온다
        try:
            demo, subs, deep_notes, deep_calls = deep_measure(send, token, rows, today=today, end=end)
        except (UploadError, TransportError, ValueError, KeyError, TypeError) as ex:
            deep_notes = [f"깊은 측정 중단: {str(ex)[:200]}"]
    bench = benchmark(send, token, bench_cfg, today, own=(ch["title"] or "우리", ch["subscribers"], rows)) if bench_cfg else None
    md = build_report(today, ch, rows, has_a=has_a, a_note=a_note, sources=sources, daily=daily, prev=prev, bench=bench,
                      fm=fm, now=now, demographics=demo, subscribed=subs, deep_notes=deep_notes)
    snap = {"date": today.isoformat(), "channel": {k: v for k, v in ch.items() if k != "uploads"},
            "analytics": has_a, "videos": [asdict(r) for r in rows], "sources": sources, "daily": daily,
            "benchmark": bench, "demographics": demo, "subscribed": subs, "deep_notes": deep_notes, "deep_calls": deep_calls,
            "first_moment": {k: {"changed_1s": fm_changed(v, "1.0"), "changed_2s": fm_changed(v, "2.0"),
                                 "first_sound_sec": v.get("first_sound_sec"), "pass": v.get("pass"), "src": v.get("src")}
                             for k, v in sorted(fm.items())}}
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
    ap.add_argument("--benchmark", type=Path, default=DEFAULT_BENCHMARK, help="동종 채널 목록(config/benchmark.json)")
    ap.add_argument("--no-benchmark", action="store_true", help="동종 채널 비교를 건너뛴다")
    ap.add_argument("--first-moment-baseline", type=Path, default=DEFAULT_FM_BASELINE,
                    help="첫 순간 측정 묶음(reports/first_moment_baseline.json, 없어도 된다)")
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
        bench_cfg = None
        if not a.no_benchmark and a.benchmark.is_file():
            bench_cfg = json.loads(a.benchmark.read_text(encoding="utf-8"))
        now = dt.datetime.now(dt.timezone.utc) if not a.today else None
        md, snap = run(send, token, today=today, finals=a.finals, prev=prev, bench_cfg=bench_cfg,
                       fm_baseline=a.first_moment_baseline, now=now)
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
