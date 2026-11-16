"""publish.analytics 단위 시험 — 가짜 Data/Analytics API 로 보고서와 스냅숏을 확인한다(비밀값·네트워크 없음)."""

from __future__ import annotations

import datetime as dt
import json
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest import mock

from publish import analytics as an
from publish import youtube as yu

TODAY = dt.date(2026, 11, 9)


def _ep(root: Path, name: str, title: str, first: str, vid: str | None = None) -> None:
    d = root / name
    d.mkdir(parents=True)
    (d / "upload.md").write_text(f"제목\n```text\n{title}\n```\n설명\n```text\n설명\n```\n태그\n```text\n가\n```\n", encoding="utf-8")
    (d / "timeline.json").write_text(json.dumps({"duration": 160.0, "sentences": [{"text": first}]}, ensure_ascii=False),
                                     encoding="utf-8")
    if vid:
        (d / "youtube_upload.json").write_text(json.dumps({
            "video_id": vid, "url": "u", "studio_url": "s", "uploaded_at": "2026-11-07T00:00:00+00:00",
            "privacy_status": "private", "channel_id": "UC1", "channel_title": "과학쑛츠", "video_file": "x.mp4",
            "video_bytes": 1, "video_md5": "m", "title": title, "description_bytes": 1,
            "contains_synthetic_media": True, "made_for_kids": False}, ensure_ascii=False), encoding="utf-8")


VIDEOS = [  # id, title, published, privacy, views
    ("VQ1", "두 블랙홀이 합쳐지면? | 중력파", "2026-11-07", "public", 40),
    ("VT1", "적외선은 빨간빛일까? | 파장", "2026-11-07", "public", 10),
    ("VM1", "헬륨을 영하 271도로 식히면? | 벽을 타는 초유체 #헬륨 #한문철", "2026-11-06", "public", 1200),
    ("VP1", "비공개 편", "2026-11-08", "private", 0),
]


class FakeYT:
    def __init__(self, *, analytics: bool = True, fail: dict[str, int] | None = None, empty: set[str] | None = None) -> None:
        """fail: '<차원>' 또는 '<차원>|<video id>' → 그 질의에 돌려줄 HTTP 상태. empty: 같은 꼴의 키 → 빈 rows."""
        self.analytics = analytics
        self.fail = fail or {}
        self.empty = empty or set()
        self.calls: list[str] = []
        self.queries: list[dict[str, str]] = []

    def __call__(self, method: str, url: str, headers: dict[str, str], data: bytes | None) -> yu.Response:
        u = urllib.parse.urlsplit(url)
        q = dict(urllib.parse.parse_qsl(u.query))
        assert headers.get("Authorization") == "Bearer AT"
        if u.path.endswith("/channels") and ("id" in q or "forHandle" in q):      # 동종 채널
            self.calls.append("peer:" + q.get("id", q.get("forHandle", "")))
            if q.get("id") == "UCMISSING":
                return yu.Response(200, {}, b'{"items": []}')
            return yu.Response(200, {}, json.dumps({"items": [{"id": "UCP", "statistics": {"subscriberCount": "500"},
                "contentDetails": {"relatedPlaylists": {"uploads": "UUP"}}}]}).encode())
        if u.path.endswith("/channels"):
            self.calls.append("channels")
            return yu.Response(200, {}, json.dumps({"items": [{"id": "UC1", "snippet": {"title": "과학쑛츠"},
                "statistics": {"subscriberCount": "21", "videoCount": "4", "viewCount": "1250"},
                "contentDetails": {"relatedPlaylists": {"uploads": "UU1"}}}]}).encode())
        if u.path.endswith("/playlistItems") and q["playlistId"] == "UUP":
            return yu.Response(200, {}, json.dumps({"items": [{"contentDetails": {"videoId": f"P{i}"}} for i in range(12)]}).encode())
        if u.path.endswith("/playlistItems"):
            self.calls.append("playlistItems")
            return yu.Response(200, {}, json.dumps({"items": [{"contentDetails": {"videoId": v[0]}} for v in VIDEOS]}).encode())
        if u.path.endswith("/videos") and q["id"].startswith("P"):
            # 동종 채널: 짧은 편(40초)이 긴 편(150초)보다 잘된다. 하나는 너무 새 편, 하나는 긴 영상(10분)
            items = []
            for i, vid in enumerate(q["id"].split(",")):
                dur = "PT40S" if i % 2 == 0 else "PT2M30S"
                if i == 11:
                    dur = "PT10M"
                pub = "2026-11-08" if i == 10 else f"2026-10-{10 + i:02d}"
                views = 5000 + 100 * i if i % 2 == 0 else 800 + 10 * i
                items.append({"id": vid, "snippet": {"title": vid, "publishedAt": pub + "T00:00:00Z"}, "status": {"privacyStatus": "public"},
                              "contentDetails": {"duration": dur}, "statistics": {"viewCount": str(views)}})
            return yu.Response(200, {}, json.dumps({"items": items}).encode())
        if u.path.endswith("/videos"):
            self.calls.append("videos")
            ids = q["id"].split(",")
            items = [{"id": v[0], "snippet": {"title": v[1], "publishedAt": v[2] + "T10:00:00Z"}, "status": {"privacyStatus": v[3]},
                      "contentDetails": {"duration": "PT2M46S"}, "statistics": {"viewCount": str(v[4]), "likeCount": "3"}}
                     for v in VIDEOS if v[0] in ids]
            return yu.Response(200, {}, json.dumps({"items": items}, ensure_ascii=False).encode())
        if u.netloc == "youtubeanalytics.googleapis.com":
            self.calls.append("analytics:" + q.get("dimensions", ""))
            if not self.analytics:
                return yu.Response(403, {}, json.dumps({"error": {"code": 403, "message": "Request had insufficient authentication scopes.",
                                                                  "errors": [{"reason": "insufficientPermissions"}]}}).encode())
            assert q["ids"] == "channel==MINE"
            self.queries.append(q)
            dim = q.get("dimensions", "")
            vid = q.get("filters", "").removeprefix("video==")
            for key in (f"{dim}|{vid}", dim):
                if key in self.fail:
                    st = self.fail[key]
                    msg = "Forbidden" if st == 403 else "The query is not supported."
                    return yu.Response(st, {}, json.dumps({"error": {"code": st, "message": msg,
                                                                     "errors": [{"reason": "badRequest"}]}}).encode())
            if f"{dim}|{vid}" in self.empty or dim in self.empty:
                return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": dim}], "rows": []}).encode())
            if dim == "elapsedVideoTimeRatio":
                assert vid and "," not in vid and q["metrics"] == "audienceWatchRatio,relativeRetentionPerformance"
                cols = ["elapsedVideoTimeRatio", "audienceWatchRatio", "relativeRetentionPerformance"]
                rows = [[i / 100, round(1.0 - 0.06 * min(i, 5) - 0.003 * max(i - 5, 0), 4), 0.4] for i in range(1, 101)]
                return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": c} for c in cols], "rows": rows}).encode())
            if dim == "insightTrafficSourceType" and vid:
                assert q["metrics"] == "views,engagedViews"
                cols, rows = ["insightTrafficSourceType", "views", "engagedViews"], [["SHORTS", 900, 450], ["YT_SEARCH", 60, 40],
                                                                                      ["YT_CHANNEL", 40, 30]]
                return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": c} for c in cols], "rows": rows}).encode())
            if dim == "day" and vid:
                assert q["metrics"] == "views,engagedViews"
                d0 = dt.date.fromisoformat(q["startDate"])
                n = (dt.date.fromisoformat(q["endDate"]) - d0).days + 1
                cols = ["day", "views", "engagedViews"]
                rows = [[(d0 + dt.timedelta(days=i)).isoformat(), [700, 300, 30, 5][i % 4], [350, 150, 15, 2][i % 4]] for i in range(n)]
                return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": c} for c in cols], "rows": rows}).encode())
            if dim == "ageGroup,gender":
                assert q["metrics"] == "viewerPercentage"
                cols = ["ageGroup", "gender", "viewerPercentage"]
                rows = [["age13-17", "male", 20.0], ["age13-17", "female", 10.0], ["age18-24", "male", 45.0], ["age25-34", "female", 25.0]]
                return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": c} for c in cols], "rows": rows}).encode())
            if dim == "subscribedStatus":
                cols, rows = ["subscribedStatus", "views", "engagedViews"], [["UNSUBSCRIBED", 1180, 590], ["SUBSCRIBED", 20, 15]]
                return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": c} for c in cols], "rows": rows}).encode())
            if dim == "video":
                assert q["sort"] == "-views" and int(q["maxResults"]) <= 200
                cols = ["video", *an.VIDEO_METRICS]
                rows = [["VQ1", 40, 30, 50, 80, 55.0, 2, 0, 1], ["VT1", 10, 4, 10, 40, 25.0, 0, 0, 0],
                        ["VM1", 1200, 800, 900, 50, 30.0, 20, 1, 3]]
            elif dim == "insightTrafficSourceType":
                cols, rows = ["insightTrafficSourceType", "views", "estimatedMinutesWatched"], [["SHORTS", 1100, 800], ["YT_SEARCH", 50, 40]]
            else:
                cols = ["day", "views", "engagedViews", "subscribersGained"]
                rows = [[f"2026-11-0{i}", 10 * i, 5 * i, 1] for i in range(1, 9)]
            return yu.Response(200, {}, json.dumps({"columnHeaders": [{"name": c} for c in cols], "rows": rows}).encode())
        raise AssertionError(url)


class AnalyticsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.finals = Path(self.tmp.name)
        _ep(self.finals, "01-gravitational-waves", "두 블랙홀이 합쳐지면? | 중력파", "두 블랙홀이 … 출렁일까요, 아무 일도 없을까요?", "VQ1")
        _ep(self.finals, "04-wavelength", "적외선은 빨간빛일까? | 파장", "오늘은 빛의 파장에 대해 알아볼까요?", "VT1")
        _ep(self.finals, "17-superfluid-helium", "헬륨을 영하 271도로 식히면? | 벽을 타는 초유체 #헬륨 #초유체 #과학",
            "오늘은 헬륨을 … 알아볼까요?")                     # 손으로 올린 편: 기록 없음 → 제목으로 짝

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_helpers(self) -> None:
        self.assertEqual(an.iso_duration("PT2M46S"), 166)
        self.assertEqual(an.iso_duration("PT59S"), 59)
        self.assertEqual(an.classify_opener("오늘은 헬륨에 대해 알아볼까요?"), "today")
        self.assertEqual(an.classify_opener("밝아질까요, 어두워질까요?"), "question")
        self.assertEqual(an._norm("헬륨을 영하 271도로 식히면? | 벽 #헬륨 #한문철"), an._norm("헬륨을 영하 271도로 식히면? | 벽 #헬륨"))

    def test_full_report_with_analytics(self) -> None:
        api = FakeYT()
        prev = {"channel": {"subscribers": 19}, "videos": [{"video_id": "VM1", "views": 1100}]}
        md, snap = an.run(api, "AT", today=TODAY, finals=self.finals, prev=prev)
        self.assertTrue(snap["analytics"])
        by = {v["video_id"]: v for v in snap["videos"]}
        self.assertEqual((by["VQ1"]["episode"], by["VQ1"]["opener"]), ("01-gravitational-waves", "question"))
        self.assertEqual((by["VT1"]["episode"], by["VT1"]["opener"]), ("04-wavelength", "today"))
        self.assertEqual(by["VM1"]["episode"], "17-superfluid-helium")          # 제목에 해시태그가 더 붙어도 짝이 맞는다
        self.assertEqual(by["VM1"]["a_total"]["averageViewPercentage"], 30.0)
        self.assertIn("구독자 **21명** (지난 보고서보다 +2)", md)
        self.assertIn("+100", md)                                                # 1100 → 1200
        self.assertIn("| 새 형식(물음으로 시작) | 0 | — | — | — |", md)           # 기본 노출(300회 이상)을 받은 새 형식 편이 아직 없다
        self.assertIn("| 이전 형식(오늘은형) | 1 | 1,200 | 30% | 67% |", md)      # 300회 미만인 VT1 은 견주지 않는다
        self.assertIn("새 형식 편이 아직 0편입니다. 4편부터 견줍니다.", md)
        self.assertIn("| SHORTS | 1,100 | 96% |", md)
        self.assertNotIn("비공개 편", md)                                         # 편별 표는 공개만
        self.assertIn("공개 영상 3편 · 비공개 1편", md)
        self.assertIn("60초판 시험은 2026-11-08 사용자 결정으로 접었습니다", md)

    def test_report_without_analytics_scope(self) -> None:
        api = FakeYT(analytics=False)
        md, snap = an.run(api, "AT", today=TODAY, finals=self.finals, prev=None)
        self.assertFalse(snap["analytics"])
        self.assertIn("분석 API 자료 없음", md)
        self.assertNotIn("평균 시청 비율 |", md.split("## 실험")[0])          # 분석 열 없이 표가 나온다
        self.assertEqual(api.calls.count("analytics:video"), 1)                  # 첫 거절에서 멈춘다

    def test_opening_experiment_compares_engaged_ratio(self) -> None:
        """2026-11-13 사용자 "1,2다 적용해": 새 형식(물음으로 시작) 대 오늘은형을 참여 조회 비율로 견준다."""
        with mock.patch.dict(an.EXPERIMENTS["opener"], {"since": "2026-11-01", "min_views": 0, "need": 1}):
            md, _ = an.run(FakeYT(), "AT", today=dt.date(2026, 11, 15), finals=self.finals, prev=None)
        self.assertIn("| 새 형식(물음으로 시작) | 1 | 40 | 55% | 75% |", md)       # VQ1: 30/40
        self.assertIn("| 이전 형식(오늘은형) | 2 | 605 | 28% | 53% |", md)         # VT1 4/10, VM1 800/1200 → 중앙값 53%
        self.assertIn("새 형식 1편이 모였습니다. 참여 조회 비율 중앙값 차이는 +21.7%p", md)
        with mock.patch.dict(an.EXPERIMENTS["opener"], {"since": "2026-11-08", "min_views": 0, "need": 1}):
            md, _ = an.run(FakeYT(), "AT", today=dt.date(2026, 11, 15), finals=self.finals, prev=None)
        self.assertIn("| 새 형식(물음으로 시작) | 0 |", md)                        # since 앞에 공개한 질문형 편은 새 형식이 아니다
        self.assertIn("새 형식 편이 아직 0편입니다", md)

    def test_opening_experiment_without_analytics(self) -> None:
        md, _ = an.run(FakeYT(analytics=False), "AT", today=TODAY, finals=self.finals, prev=None)
        self.assertIn("분석 API 자료가 있어야 참여 조회 비율이 나옵니다", md)
        self.assertIn("| 이전 형식(오늘은형) | 1 | 1,200 |", md)

    def test_benchmark_table_and_length_effect(self) -> None:
        cfg = {"recent": 50, "peers": [{"id": "UCPEER", "label": "동종A", "tier": "small"},
                                       {"id": "@zack", "label": "핸들", "tier": "ref"},
                                       {"id": "UCMISSING", "label": "없는 채널", "tier": "small"}]}
        api = FakeYT()
        md, snap = an.run(api, "AT", today=TODAY, finals=self.finals, prev=None, bench_cfg=cfg)
        self.assertIn("peer:@zack", api.calls)                                      # 핸들은 forHandle 로 찾는다
        b = snap["benchmark"]
        a = b["channels"][0]
        self.assertEqual((a["n_shorts"], a["n_judged"]), (11, 10))                  # 10분 영상 제외, 새 편은 판단에서 제외
        self.assertEqual(a["median_sec"], 40)
        eff = {x["bucket"]: x for x in b["length_effect"]}
        self.assertGreater(eff["60초 이하"]["mean_pct"], 0.6)
        self.assertLess(eff["121~180초"]["mean_pct"], 0.4)
        self.assertEqual(b["own"]["tier"], "self")
        self.assertIn("## 동종 채널 비교", md)
        self.assertIn("### 길이와 조회수", md)
        self.assertIn("없는 채널: 채널을 찾지 못함", md)

    # ── 2026-11-16 깊은 측정(9-4 방안 4) ──

    def test_deep_measure_happy_path(self) -> None:
        api = FakeYT()
        md, snap = an.run(api, "AT", today=TODAY, finals=self.finals, prev=None)
        by = {v["video_id"]: v for v in snap["videos"]}
        ret = by["VM1"]["a_retention"]                             # 1,200회 · 공개 3일 → 대상. 40회인 VQ1 은 묻지 않는다
        self.assertAlmostEqual(ret["head_drop"], 0.24)             # 0.94(0.01) − 0.70(0.05)
        self.assertAlmostEqual(ret["head_rrp"], 0.4)
        self.assertEqual([p[0] for p in ret["points"]], [0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0])
        self.assertEqual(ret["n_points"], 100)
        self.assertEqual(by["VQ1"]["a_retention"], {})
        src = by["VM1"]["a_sources"]
        self.assertEqual((src["feed"], src["search"], src["other"]), (0.9, 0.06, 0.04))
        self.assertEqual(src["by_type"]["SHORTS"], [900, 450])
        self.assertEqual([d["day"] for d in by["VM1"]["a_days"]], ["2026-11-06", "2026-11-07", "2026-11-08"])   # 분석 기간 끝(어제)에서 자른다
        vids = [q.get("filters") for q in api.queries if q.get("filters")]
        self.assertEqual(vids, ["video==VM1"] * 3)                 # 편마다 질의 3개, 필터는 한 편씩
        self.assertEqual(snap["deep_calls"], 5)                    # 3 + 연령·성별 + 구독 여부
        self.assertEqual(len(snap["demographics"]["rows"]), 4)
        self.assertEqual(snap["subscribed"]["rows"][1], {"subscribedStatus": "SUBSCRIBED", "views": 20, "engagedViews": 15})
        self.assertIn("## 편별 깊은 측정", md)
        self.assertIn("| 17-superfluid-helium | 11-06 19:00 | 1,200 | 90% | 6% | 4% | 700 · 300 · 30 | 94% | 24%p | 0.40 |", md)
        self.assertIn("태평양 시간 자정", md)
        self.assertIn("- 연령: 13-17 30% · 18-24 45% · 25-34 25%", md)
        self.assertIn("- 성별: male 65% · female 35%", md)
        self.assertIn("| 구독 안 함 | 1,180 | 98.3% | 50.0% |", md)
        self.assertNotIn("빠진 것:", md)

    def test_deep_query_failure_leaves_rest(self) -> None:
        """한 질의의 400·403 은 그 칸만 빼고 메모를 남긴다. 기존 절과 다른 질의는 그대로."""
        api = FakeYT(fail={"elapsedVideoTimeRatio": 400, "ageGroup,gender": 403})
        md, snap = an.run(api, "AT", today=TODAY, finals=self.finals, prev=None)
        self.assertTrue(snap["analytics"])
        by = {v["video_id"]: v for v in snap["videos"]}
        self.assertEqual(by["VM1"]["a_retention"], {})
        self.assertEqual(by["VM1"]["a_sources"]["feed"], 0.9)
        self.assertEqual(len(by["VM1"]["a_days"]), 3)
        self.assertEqual(snap["demographics"], {})
        self.assertTrue(snap["subscribed"]["rows"])
        self.assertIn("시청 지속 곡선: 1건 실패(그 칸만 뺌) — 17-superfluid-helium: 분석 보고서 실패 HTTP 400", md)
        self.assertIn("연령·성별: 1건 실패", md)
        self.assertIn("- 연령·성별: 자료 없음", md)
        self.assertIn("| SHORTS | 1,100 | 96% |", md)               # 기존 유입 경로 절
        self.assertIn("| 이전 형식(오늘은형) | 1 | 1,200 | 30% | 67% |", md)

    def test_deep_query_empty_result(self) -> None:
        md, snap = an.run(FakeYT(empty={"day|VM1"}), "AT", today=TODAY, finals=self.finals, prev=None)
        by = {v["video_id"]: v for v in snap["videos"]}
        self.assertEqual(by["VM1"]["a_days"], [])
        self.assertIn("첫 4일 일별 조회: 자료 없음 1건(17-superfluid-helium)", md)
        self.assertIn("| 17-superfluid-helium | 11-06 19:00 | 1,200 | 90% | 6% | 4% | — |", md)

    def test_deep_fail_streak_stops_one_kind(self) -> None:
        rows = [an.VideoRow(video_id=f"VM{i}", title="t", published="2026-11-06", privacy="public", duration_sec=160,
                            views=500, likes=0, comments=0, published_at="2026-11-06T10:00:00Z") for i in range(6)]
        api = FakeYT(fail={"elapsedVideoTimeRatio": 500})
        demo, subs, notes, calls = an.deep_measure(api, "AT", rows, today=TODAY, end="2026-11-08")
        dims = [q.get("dimensions") for q in api.queries]
        self.assertEqual(dims.count("elapsedVideoTimeRatio"), an.DEEP_FAIL_STREAK)     # 연달아 실패하면 나머지 편은 묻지 않는다
        self.assertEqual(dims.count("insightTrafficSourceType"), 6)
        self.assertTrue(all(r.a_sources for r in rows))
        self.assertIn(f"시청 지속 곡선: 연달아 {an.DEEP_FAIL_STREAK}번 실패해 나머지 3편은 묻지 않음", notes)
        self.assertEqual(calls, 3 + 6 + 6 + 2)

    def test_deep_targets_limits(self) -> None:
        rows = [an.VideoRow(video_id=f"V{i:02d}", title="t", published=(TODAY - dt.timedelta(days=i)).isoformat(), privacy="public",
                            duration_sec=160, views=400, likes=0, comments=0) for i in range(40)]
        rows.append(an.VideoRow(video_id="LOW", title="t", published="2026-11-08", privacy="public", duration_sec=160, views=299,
                                likes=0, comments=0))
        rows.append(an.VideoRow(video_id="PRV", title="t", published="2026-11-08", privacy="private", duration_sec=160, views=999,
                                likes=0, comments=0))
        got = [r.video_id for r in an.deep_targets(rows, TODAY)]
        self.assertEqual(len(got), min(an.DEEP_MAX_VIDEOS, an.DEEP_RECENT_DAYS))
        self.assertEqual(got[0], "V00")
        self.assertNotIn("LOW", got)
        self.assertNotIn("PRV", got)

    def test_old_snapshot_as_prev(self) -> None:
        """새 키가 없는 옛 스냅숏도 prev 로 읽힌다."""
        old = json.loads((yu.REPO / "reports" / "youtube" / "2026-11-09.json").read_text(encoding="utf-8"))
        self.assertNotIn("demographics", old)
        md, snap = an.run(FakeYT(), "AT", today=TODAY, finals=self.finals, prev=old)
        self.assertIn("## 편별 (공개, 최신순)", md)
        self.assertIn("a_retention", snap["videos"][0])
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "2026-11-02.json").write_text(json.dumps({"date": "2026-11-02", "channel": {"subscribers": 5},
                                                                 "videos": [{"video_id": "VM1", "views": 1000}]}), encoding="utf-8")
            prev = an.latest_snapshot(Path(t), TODAY.isoformat())
        md, _ = an.run(FakeYT(), "AT", today=TODAY, finals=self.finals, prev=prev)
        self.assertIn("(지난 보고서보다 +16)", md)
        self.assertIn("+200", md)

    # ── 첫 순간의 움직임 ──

    def _fm(self, ch1: float, ch2: float, ok: bool) -> dict:
        return {"changed_pct": {"0.5": 0.5, "1.0": ch1, "1.5": 1.0, "2.0": ch2, "3.0": 2.0}, "luma0_pct": 12.0,
                "first_sound_sec": 0.22, "pass": ok}

    def test_first_moment_table_and_groups(self) -> None:
        (self.finals / "17-superfluid-helium" / "validation.json").write_text(
            json.dumps({"ok": True, "first_moment": self._fm(12.6, 32.5, False)}), encoding="utf-8")
        (self.finals / "01-gravitational-waves" / "validation.json").write_text(json.dumps({"ok": True}), encoding="utf-8")
        base = self.finals.parent / (self.finals.name + "-fm.json")
        base.write_text(json.dumps({"schema_version": 1, "measured": "2026-11-16", "method": "m", "thresholds": {},
                                    "episodes": {"01-gravitational-waves": self._fm(1.1, 0.8, False),
                                                 "17-superfluid-helium": self._fm(99.0, 99.0, True)}}), encoding="utf-8")
        try:
            with mock.patch.dict(an.EXPERIMENTS["result_first"], {"min_views": 0}):
                md, snap = an.run(FakeYT(), "AT", today=TODAY, finals=self.finals, prev=None, fm_baseline=base)
        finally:
            base.unlink()
        sec = md.split("## 첫 순간의 움직임과 넘기지 않고 본 비율")[1].split("\n## ")[0]
        self.assertIn("| 17-superfluid-helium | 11-06 19:00 | 12.6% | 32.5% | 0.2초 | 못 함 | 66.7% | 24%p |", sec)   # validation 이 먼저
        self.assertIn("| 01-gravitational-waves | 11-07 19:00 | 1.1% | 0.8% | 0.2초 | 못 함 | 75.0% | — |", sec)        # baseline 으로
        self.assertIn("| 04-wavelength | 11-07 19:00 | — | — | — | — | 40.0% | — |", sec)
        self.assertLess(sec.index("17-superfluid-helium"), sec.index("01-gravitational-waves"))                       # 공개 순
        self.assertIn("- 1초 변화 10% 이상: 1편, 넘기지 않고 본 비율 중앙값 66.7%", sec)
        self.assertIn("- 1초 변화 10% 미만: 1편, 중앙값 75.0%", sec)
        self.assertIn("첫 순간 측정이 없는 편 1편", sec)
        self.assertIn("주제·공개 시각·하루 편 수가 함께 다릅니다", sec)
        self.assertEqual(snap["first_moment"]["17-superfluid-helium"]["src"], "validation")
        self.assertEqual(snap["first_moment"]["01-gravitational-waves"]["changed_1s"], 1.1)

    def test_first_moment_absent(self) -> None:
        md, snap = an.run(FakeYT(), "AT", today=TODAY, finals=self.finals, prev=None,
                          fm_baseline=self.finals / "없는-파일.json")
        self.assertEqual(snap["first_moment"], {})
        self.assertIn("| 17-superfluid-helium | 11-06 19:00 | — | — | — | — | 66.7% | 24%p |", md)
        self.assertIn("첫 순간 측정이 없는 편 1편", md)
        self.assertIn("결과 먼저 편이 아직 0편입니다. 4편부터 판정합니다.", md)
        md, _ = an.run(FakeYT(analytics=False), "AT", today=TODAY, finals=self.finals, prev=None)
        self.assertIn("분석 API 자료가 없어 넘기지 않고 본 비율을 견줄 수 없습니다", md)

    def test_result_first_experiment_verdict(self) -> None:
        (self.finals / "01-gravitational-waves" / "validation.json").write_text(
            json.dumps({"first_moment": self._fm(15.0, 25.0, True)}), encoding="utf-8")
        (self.finals / "17-superfluid-helium" / "validation.json").write_text(
            json.dumps({"first_moment": self._fm(15.0, 25.0, False)}), encoding="utf-8")
        with mock.patch.dict(an.EXPERIMENTS["result_first"], {"since": "2026-11-07", "min_views": 0, "need": 1}):
            md, _ = an.run(FakeYT(), "AT", today=TODAY, finals=self.finals, prev=None)
        self.assertIn("| 결과 먼저(점검 통과) | 1 | 40 | 55% | 75% |", md)                   # VQ1 (11-07, 통과)
        self.assertIn("| 2026-11-07 앞의 편 | 1 | 1,200 | 30% | 67% |", md)                 # VM1 (11-06)
        self.assertIn("점검을 통과하지 못했거나 측정이 없는 1편은 어느 무리에도 넣지 않았습니다: 04-wavelength.", md)
        self.assertIn("결과 먼저 1편이 모였습니다. 넘기지 않고 본 비율 중앙값 75.0% — 기준선 48.0% 보다 +27.0%p, 목표 60% 이상입니다"
                      "(앞의 편 중앙값과 차이 +8.3%p)", md)
        self.assertIn("| 이전 형식(오늘은형) |", md)                                         # opener 실험은 그대로

    # ── 기본 노출과 한 주 시험 ──

    TRIAL_VIDEOS = [
        ("T1", "시험 첫 편 | 가", "2026-11-18", "public", 900),
        ("T2", "시험 둘째 편 | 나", "2026-11-19", "public", 500),
        ("R1", "다시 올린 편 | 다", "2026-11-19", "public", 950),
        ("T3", "시험 셋째 편 | 라", "2026-11-20", "public", 1000),
        ("OLD", "오래된 편 | 마", "2026-11-01", "public", 1300),
    ]

    def _trial_finals(self) -> Path:
        root = self.finals / "trial"
        _ep(root, "60-a", "시험 첫 편 | 가", "가는 왜 그럴까요?", "T1")
        _ep(root, "61-b", "시험 둘째 편 | 나", "나는 왜 그럴까요?", "T2")
        _ep(root, "07-c", "다시 올린 편 | 다", "다는 왜 그럴까요?", "R1")
        for name, patch in (("60-a", {"publish_at": "2026-11-18T08:00:00Z"}),
                            ("61-b", {"sweep": {"action": "watching", "published_at": "2026-11-19T08:01:30Z"}}),
                            ("07-c", {"previous": [{"video_id": "R0"}], "publish_at": "2026-11-19T08:00:00Z"})):
            p = root / name / "youtube_upload.json"
            rec = json.loads(p.read_text(encoding="utf-8"))
            rec.update(patch)
            p.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
        return root

    def test_exposure_table_and_trial_line(self) -> None:
        root = self._trial_finals()
        now = dt.datetime(2026, 11, 21, 12, 0, tzinfo=dt.timezone.utc)
        with mock.patch(f"{__name__}.VIDEOS", self.TRIAL_VIDEOS):
            md, snap = an.run(FakeYT(), "AT", today=now.date(), finals=root, prev=None, now=now)
        sec = md.split("## 기본 노출 (최근 14일 공개)")[1].split("\n## ")[0]
        self.assertIn("| 60-a | 11-18 17:00 | 예약 시각 | 76시간 | 900 | 받음 |", sec)
        self.assertIn("| 61-b | 11-19 17:01 | 점검 기록 | 52시간 | 500 | 못 받음 |", sec)
        self.assertIn("| 07-c (다시 올림) | 11-19 17:00 | 예약 시각 | 52시간 | 950 | 받음 |", sec)
        self.assertIn("| T3 | 11-20 19:00 | Data API | 26시간 | 1,000 | 받음 |", sec)       # 기록 없는 편은 Data API 시각
        self.assertNotIn("OLD", sec)                                                      # 14일 넘은 편
        self.assertIn("공개 48시간이 지난 **3편 중 2편**이 800회 이상입니다.", sec)
        self.assertIn("- 한 주 시험(11-18~11-24 공개, 새 편만·하루 한 편·17:00): 공개 48시간이 지난 2편 중 1편이 800회 이상 "
                      "— 기준 7편 중 5편 이상.", sec)                                     # 다시 올린 편은 빼고 센다
        self.assertNotIn("판정:", sec)
        by = {v["video_id"]: v for v in snap["videos"]}
        self.assertEqual((by["T1"]["publish_src"], by["T1"]["republished"]), ("publish_at", False))
        self.assertEqual(by["R1"]["republished"], True)

    def test_trial_line_waits_for_48h(self) -> None:
        root = self._trial_finals()
        now = dt.datetime(2026, 11, 19, 12, 0, tzinfo=dt.timezone.utc)
        with mock.patch(f"{__name__}.VIDEOS", self.TRIAL_VIDEOS):
            md, _ = an.run(FakeYT(), "AT", today=now.date(), finals=root, prev=None, now=now)
        self.assertIn("| 60-a | 11-18 17:00 | 예약 시각 | 28시간 | 900 | 받음 |", md)
        self.assertIn("| 61-b | 11-19 17:01 | 점검 기록 | 4시간 | 500 | 아직(48시간 전) |", md)
        self.assertNotIn("한 주 시험", md)

    def test_trial_verdict_after_seven(self) -> None:
        vids = [(f"W{i}", f"주간 {i} | 가", f"2026-11-{18 + i}", "public", 900 if i < 5 else 100) for i in range(7)]
        now = dt.datetime(2026, 11, 28, 0, 0, tzinfo=dt.timezone.utc)
        with mock.patch(f"{__name__}.VIDEOS", vids):
            md, _ = an.run(FakeYT(), "AT", today=now.date(), finals=self.finals, prev=None, now=now)
        self.assertIn("공개 48시간이 지난 7편 중 5편이 800회 이상 — 기준 7편 중 5편 이상. 판정: 기준을 채웠습니다", md)

    def test_real_benchmark_config_loads(self) -> None:
        cfg = json.loads((yu.REPO / "config" / "benchmark.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(cfg["peers"]), 10)
        for p in cfg["peers"]:
            self.assertTrue(p["id"].startswith(("UC", "@")), p)
            self.assertIn(p["tier"], ("small", "mid", "ref"))

    def test_real_finals_mapping(self) -> None:
        by_vid, by_title = an.load_episodes(yu.REPO / "finals")
        self.assertEqual(by_vid["dbnYxnEgtpo"].dir, "04-wavelength")
        self.assertEqual(by_vid["3n4MJZM6trk"].opener, "question")             # 01 은 질문으로 시작
        self.assertFalse((yu.REPO / "finals" / "17-superfluid-helium-60s").exists())   # 2026-11-08 사용자 결정으로 접음


if __name__ == "__main__":
    unittest.main()
