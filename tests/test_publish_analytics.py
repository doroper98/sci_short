"""publish.analytics 단위 시험 — 가짜 Data/Analytics API 로 보고서와 스냅숏을 확인한다(비밀값·네트워크 없음)."""

from __future__ import annotations

import datetime as dt
import json
import tempfile
import unittest
import urllib.parse
from pathlib import Path

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
    def __init__(self, *, analytics: bool = True) -> None:
        self.analytics = analytics
        self.calls: list[str] = []

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
            dim = q.get("dimensions", "")
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
        self.assertIn("| 질문형 | 1 | 40 | 55% | 75% |", md)
        self.assertIn("| 오늘은형 | 1 | 10 | 25% | 40% |", md)
        self.assertIn("| SHORTS | 1,100 | 96% |", md)
        self.assertNotIn("비공개 편", md)                                         # 편별 표는 공개만
        self.assertIn("공개 영상 3편 · 비공개 1편", md)
        self.assertIn("60초판이 아직 공개되지 않았습니다", md)

    def test_report_without_analytics_scope(self) -> None:
        api = FakeYT(analytics=False)
        md, snap = an.run(api, "AT", today=TODAY, finals=self.finals, prev=None)
        self.assertFalse(snap["analytics"])
        self.assertIn("분석 API 자료 없음", md)
        self.assertNotIn("평균 시청 비율 |", md.split("## 실험")[0])          # 분석 열 없이 표가 나온다
        self.assertEqual(api.calls.count("analytics:video"), 1)                  # 첫 거절에서 멈춘다

    def test_judge_line_after_judge_date(self) -> None:
        md, _ = an.run(FakeYT(), "AT", today=dt.date(2026, 11, 15), finals=self.finals, prev=None)
        self.assertIn("판정일이 지났습니다", md)

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
        cut = [e for e in by_title.values() if e.dir == "17-superfluid-helium-60s"]
        self.assertTrue(cut and cut[0].opener == "today")                        # 잘라 만든 판은 원본의 첫 문장


if __name__ == "__main__":
    unittest.main()
