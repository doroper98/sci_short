"""publish.instagram 단위 시험 — 비밀값·네트워크 없이 돈다(가짜 그래프 API). 실행: python -m unittest discover -s tests -v"""

from __future__ import annotations

import json
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest import mock

from publish import instagram as ig
from publish import youtube as yu

UPLOAD = """# 업로드 정보 — 22. 시험 편 (120.0초)

제목
```text
시험 편 제목 | 부제
```
설명
```text
유튜브 설명입니다.
```
태그
```text
가, 나
```
인스타그램(릴스) 설명 (2026-11-07 추가, 해시태그 5개 이내)
```text
<시험 편 제목>

첫 줄 = 정의
"핵심 명제"

#과학 #물리 #빛 #파장 #과학릴스
```
- 썸네일: 0초 프레임
"""
PROBE_OK = {"width": 1080, "height": 1920, "fps": 30.0, "video_codec": "h264", "audio_codec": "aac",
            "audio_rate": 48000, "audio_channels": 2, "duration_sec": 120.0}
ENV = {"IG_ACCESS_TOKEN": "sekret-tkn-91"}
IGID = "17841400000000001"


def _cfg(**over) -> ig.IgConfig:
    base = dict(ig_user_id=IGID, username="sci_shorts", tries=2, poll_sec=30, wait_sec=120)
    base.update(over)
    return ig.IgConfig(**base)


def _episode(tmp: Path, upload: str = UPLOAD, video: bytes = b"\0" * 2048, meta: dict | None = None,
             name: str = "22-test-episode", slug: str = "test-episode") -> Path:
    d = tmp / name
    d.mkdir(parents=True)
    (d / f"{slug}.mp4").write_bytes(video)
    (d / "upload.md").write_text(upload, encoding="utf-8")
    if meta is not None:
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return d


class FakeGraph:
    """계정 확인 → 컨테이너 → rupload → 상태(차례로) → 게시 → 주소. 호출 순서와 본문을 기록한다."""

    def __init__(self, *, username: str = "sci_shorts", ig_id: str = IGID, status: list[str] | None = None,
                 publish: str = "ok", token_error: bool = False) -> None:
        self.calls: list[str] = []
        self.forms: dict[str, dict[str, str]] = {}
        self.headers: dict[str, dict[str, str]] = {}
        self.username, self.ig_id = username, ig_id
        self.status = list(status or ["IN_PROGRESS", "FINISHED"])
        self.publish_mode = publish            # ok · transport · 500
        self.token_error = token_error
        self.published = False

    def _status(self) -> str:
        if self.published:
            return "PUBLISHED"
        return self.status.pop(0) if len(self.status) > 1 else self.status[0]

    def __call__(self, method: str, url: str, headers: dict[str, str], data: bytes | None) -> yu.Response:
        u = urllib.parse.urlsplit(url)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.netloc == ig.RUPLOAD_HOST:
            self.calls.append("rupload")
            self.headers["rupload"] = dict(headers)
            assert u.path == "/ig-api-upload/v27.0/C1", u.path
            assert headers["Authorization"] == "OAuth sekret-tkn-91" and headers["offset"] == "0"
            assert int(headers["file_size"]) == len(data or b"")
            return yu.Response(200, {}, b'{"success": true, "message": "Upload successful."}')
        assert headers.get("Authorization") == "Bearer sekret-tkn-91", headers
        if self.token_error:
            return yu.Response(400, {}, json.dumps({"error": {"message": "Error validating access token", "code": 190}}).encode())
        path = u.path.split("/", 2)[2]          # /v27.0/<path>
        if method == "GET" and path == self.ig_id:
            self.calls.append("whoami")
            return yu.Response(200, {}, json.dumps({"id": self.ig_id, "username": self.username}).encode())
        if method == "GET" and path == "me/accounts":
            self.calls.append("accounts")
            return yu.Response(200, {}, json.dumps({"data": [{"name": "과학쑛츠 페이지", "instagram_business_account":
                                                              {"id": self.ig_id, "username": self.username}}]}).encode())
        if method == "POST" and path == f"{IGID}/media":
            self.calls.append("container")
            self.forms["container"] = dict(urllib.parse.parse_qsl((data or b"").decode("utf-8")))
            return yu.Response(200, {}, b'{"id": "C1"}')
        if method == "GET" and path == "C1":
            self.calls.append("status")
            return yu.Response(200, {}, json.dumps({"status_code": self._status(), "status": "detail"}).encode())
        if method == "POST" and path == f"{IGID}/media_publish":
            self.calls.append("publish")
            self.forms["publish"] = dict(urllib.parse.parse_qsl((data or b"").decode("utf-8")))
            if self.publish_mode == "transport":
                self.published = True
                raise yu.TransportError("connection reset")
            if self.publish_mode == "500":
                return yu.Response(500, {}, b"{}")
            self.published = True
            return yu.Response(200, {}, b'{"id": "M9"}')
        if method == "GET" and path == "M9":
            self.calls.append("permalink")
            return yu.Response(200, {}, b'{"permalink": "https://www.instagram.com/reel/ABC/", "shortcode": "ABC"}')
        raise AssertionError(f"예상하지 못한 호출 {method} {url}")


class CaptionTest(unittest.TestCase):
    def test_parse_caption_block(self) -> None:
        cap = ig.parse_instagram_caption(UPLOAD)
        self.assertTrue(cap.startswith("<시험 편 제목>"))
        self.assertTrue(cap.endswith("#과학릴스"))
        self.assertNotIn("```", cap)

    def test_parse_errors(self) -> None:
        with self.assertRaisesRegex(yu.UploadError, "블록이 없습니다"):
            ig.parse_instagram_caption("제목\n```text\n가\n```\n")
        with self.assertRaisesRegex(yu.UploadError, "```text 블록이 없습니다"):
            ig.parse_instagram_caption("인스타그램(릴스) 설명\n그냥 글\n")
        with self.assertRaisesRegex(yu.UploadError, "닫는"):
            ig.parse_instagram_caption("인스타그램(릴스) 설명\n```text\n가\n")

    def test_real_finals_captions_parse_and_follow_rules(self) -> None:
        cfg = ig.load_config()
        dirs = sorted(p for p in (yu.REPO / "finals").glob("[0-9]*-*") if (p / "upload.md").is_file())
        self.assertGreaterEqual(len(dirs), 21)
        for d in dirs:
            cap = ig.parse_instagram_caption((d / "upload.md").read_text(encoding="utf-8"))
            self.assertEqual(ig.validate_caption(cap, cfg), [], d.name)
            self.assertNotIn("인스타그램", cap.splitlines()[0], d.name)

    def test_youtube_link_goes_before_hashtags(self) -> None:
        """2026-11-08 사용자: 설명 마지막 태그 전에 유튜브 프로필 링크."""
        link = "Youtube : https://www.youtube.com/@Shortform_science"
        cap = "<제목>\n\n본문이에요.\n\n#과학 #물리"
        self.assertEqual(ig.add_youtube_link(cap, link), f"<제목>\n\n본문이에요.\n\n{link}\n\n#과학 #물리")
        self.assertEqual(ig.add_youtube_link(ig.add_youtube_link(cap, link), link).count(link), 1)   # 두 번 붙지 않음
        self.assertEqual(ig.add_youtube_link("본문", link), f"본문\n\n{link}")
        self.assertEqual(ig.add_youtube_link(cap, None), cap)
        self.assertEqual(ig.load_config().youtube_link, link)
        self.assertEqual(ig.validate_caption(ig.add_youtube_link(cap, link), _cfg()), [])

    def test_rules_hashtags_and_ai_notice(self) -> None:
        cfg = _cfg()
        self.assertEqual(ig.validate_caption("광합성은 빛으로 #과학", cfg), [])        # '합성' 단어 자체는 허용
        six = " ".join(f"#t{i}" for i in range(6))
        self.assertTrue(any("해시태그 6개" in e for e in ig.validate_caption(six, cfg)))
        for bad in ("AI 내레이션입니다", "인공지능으로 만든 영상", "합성 음성 사용", "실제와 다릅니다", "나레이션: 합성"):
            self.assertTrue(ig.validate_caption(bad, cfg), bad)
        self.assertTrue(any("2201자" in e for e in ig.validate_caption("가" * 2201, cfg)))
        self.assertEqual(ig.validate_caption("GAIN·EMAIL 같은 단어", cfg), [])        # 낱말 속 ai 는 무시


class ConfigTest(unittest.TestCase):
    def test_repo_config_follows_decisions(self) -> None:
        cfg = ig.load_config()
        self.assertTrue(cfg.enabled)
        self.assertEqual((cfg.ig_user_id, cfg.username), ("17841457693338876", "_quasarlab"))   # 2026-11-08 잠금
        self.assertTrue(cfg.ai_label)                                          # 2026-11-08 사용자 "켜 둠"
        self.assertEqual((cfg.auto_from_number, cfg.thumb_offset_ms, cfg.hashtags_max), (22, 0, 5))
        self.assertTrue(cfg.share_to_feed)
        self.assertEqual(yu.load_config().auto_from_number, cfg.auto_from_number)   # 두 플랫폼의 자동 대상이 같다

    def test_bad_config_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "c.json"
            for raw, msg in (({"transfer": "ftp"}, "transfer"), ({"api_host": "evil.com"}, "api_host"),
                             ({"api_host": "graph.instagram.com", "transfer": "upload"}, "rupload"),
                             ({"api_version": "27"}, "api_version"), ({"privacy": "x"}, "모르는 키")):
                p.write_text(json.dumps(raw), encoding="utf-8")
                with self.assertRaisesRegex(yu.UploadError, msg):
                    ig.load_config(p)

    def test_auto_allowed(self) -> None:
        self.assertFalse(ig.auto_allowed(4, {}, 22))
        self.assertTrue(ig.auto_allowed(22, {}, 22))
        self.assertTrue(ig.auto_allowed(4, {"auto_publish": True}, 22))
        self.assertFalse(ig.auto_allowed(None, {}, 22))


class ReelSpecTest(unittest.TestCase):
    def test_moov_after_mdat_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.mp4"
            box = lambda t, n: (8 + n).to_bytes(4, "big") + t + b"\0" * n   # noqa: E731
            p.write_bytes(box(b"ftyp", 8) + box(b"mdat", 100) + box(b"moov", 20))
            errs, _ = ig.check_reel(p, dict(PROBE_OK))
            self.assertTrue(any("moov" in e for e in errs))
            p.write_bytes(box(b"ftyp", 8) + box(b"moov", 20) + box(b"mdat", 100))
            self.assertEqual(ig.check_reel(p, dict(PROBE_OK))[0], [])

    def test_spec_limits(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.mp4"
            p.write_bytes(b"\0" * 100)
            bad = dict(PROBE_OK, duration_sec=2.0, video_codec="vp9", fps=120.0, audio_codec="opus", audio_rate=96000)
            errs, _ = ig.check_reel(p, bad)
            self.assertEqual(len(errs), 5, errs)
            _, warns = ig.check_reel(p, dict(PROBE_OK, width=1080, height=1080))
            self.assertTrue(any("9:16" in w for w in warns))


@mock.patch.object(ig, "probe_reel", lambda p: dict(PROBE_OK))
class ScheduleTest(unittest.TestCase):
    """2026-11-08 사용자 결정: 새 편은 아침 업로드와 동시에, 옛 편은 아침·17시 하루 두 편, 따라잡으면 아침 1회만."""

    def test_backlog_and_slots(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            old = _episode(root, name="01-old", slug="old")
            off = _episode(root, name="05-off", slug="off", meta={"instagram": False})
            done = _episode(root, name="22-done", slug="done")
            self.assertEqual(ig.process_episode(done, _cfg(), dry_run=False, send=FakeGraph(), env=ENV,
                                                sleep=lambda s: None)["status"], "posted")
            night = _episode(root, name="32-night", slug="night")             # 밤에 만들고 아직 유튜브 전
            today = _episode(root, name="33-today", slug="today")             # 오늘 아침 유튜브에 올림
            (today / "youtube_upload.json").write_text("{}", encoding="utf-8")
            morning = {32, 33}
            self.assertEqual(ig.ig_backlog(root, morning), [old.resolve(), today.resolve()])
            self.assertNotIn(off.resolve(), ig.ig_backlog(root, morning))
            self.assertNotIn(night.resolve(), ig.ig_backlog(root, morning))
            am = ig.ig_next(_cfg(), root, slot="morning", prefer=[today], dry_run=True, morning=morning)
            self.assertEqual([r["dir"] for r in am["results"]], [yu._rel(today)])      # 오늘 올린 편이 먼저
            pm = ig.ig_next(_cfg(), root, slot="evening", prefer=[today], dry_run=True, morning=morning)
            self.assertEqual([r["dir"] for r in pm["results"]], [yu._rel(old)])        # 17시는 옛 편, prefer 무시
            for slot in ("morning", "evening"):
                out = ig.ig_next(_cfg(), root, slot=slot, prefer=[today], dry_run=False, send=FakeGraph(), env=ENV,
                                 sleep=lambda s: None, morning=morning)
                self.assertEqual(out["counts"]["posted"], 1, out)
            rest = ig.ig_next(_cfg(), root, slot="evening", dry_run=False, send=FakeGraph(), env=ENV, morning=morning)
            self.assertEqual(rest["results"], [])
            self.assertIn("따라잡았습니다", rest["note"])                          # 따라잡으면 17시는 쉼
            self.assertIsNotNone(ig.read_record(today))
            self.assertIsNotNone(ig.read_record(old))


@mock.patch.object(ig, "probe_reel", lambda p: dict(PROBE_OK))
class PostFlowTest(unittest.TestCase):
    def test_full_post_upload_transfer(self) -> None:
        api = FakeGraph()
        slept: list[float] = []
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=slept.append)
            self.assertEqual(res["status"], "posted", res)
            self.assertEqual(api.calls, ["whoami", "container", "rupload", "status", "status", "publish", "permalink"])
            form = api.forms["container"]
            self.assertEqual((form["media_type"], form["upload_type"], form["thumb_offset"], form["share_to_feed"]),
                             ("REELS", "resumable", "0", "true"))
            self.assertEqual(form["is_ai_generated"], "true")
            self.assertTrue(form["caption"].startswith("<시험 편 제목>"))
            self.assertNotIn("video_url", form)
            self.assertEqual(api.forms["publish"], {"creation_id": "C1"})
            self.assertEqual(slept, [30])
            rec = ig.read_record(ep)
            self.assertEqual((rec.media_id, rec.permalink, rec.status, rec.username), ("M9", "https://www.instagram.com/reel/ABC/", "posted", "sci_shorts"))
            self.assertEqual(rec.hashtags, ["#과학", "#물리", "#빛", "#파장", "#과학릴스"])
            self.assertEqual(rec.video_md5, yu.md5_file(ep / "test-episode.mp4"))
            for h in api.headers["rupload"].values():
                self.assertNotIn("Bearer", h)
            api.calls.clear()
            again = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env={}, sleep=slept.append)
            self.assertEqual((again["status"], api.calls), ("skipped", []))   # 같은 영상은 다시 게시하지 않는다

    def test_url_transfer_uses_github_raw(self) -> None:
        api = FakeGraph()
        env = dict(ENV, GITHUB_REPOSITORY="doroper98/sci_short", GITHUB_SHA="abc123")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:      # REPO 기준 상대 경로가 필요하다
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(api_host="graph.instagram.com", transfer="url"), dry_run=False, send=api,
                                     env=env, sleep=lambda s: None)
            self.assertEqual(res["status"], "posted", res)
            self.assertNotIn("rupload", api.calls)
            url = api.forms["container"]["video_url"]
            rel = (ep / "test-episode.mp4").relative_to(yu.REPO).as_posix()
            self.assertEqual(url, f"https://raw.githubusercontent.com/doroper98/sci_short/abc123/{rel}")
            self.assertNotIn("upload_type", api.forms["container"])

    def test_account_mismatch_stops_before_container(self) -> None:
        api = FakeGraph(username="someone_else")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "error")
            self.assertIn("게시 중단", res["error"])
            self.assertEqual(api.calls, ["whoami"])
            self.assertIsNone(ig.read_record(ep))

    def test_unlocked_account_refuses_without_network(self) -> None:
        api = FakeGraph()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(ig_user_id=None), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertIn("ig_user_id", res["error"])
            self.assertEqual(api.calls, [])

    def test_container_error_does_not_publish(self) -> None:
        api = FakeGraph(status=["ERROR"])
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertIn("처리하지 못했습니다", res["error"])
            self.assertNotIn("publish", api.calls)
            self.assertIsNone(ig.read_record(ep))

    def test_wait_timeout_does_not_publish(self) -> None:
        api = FakeGraph(status=["IN_PROGRESS"])
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertIn("초과", res["error"])
            self.assertEqual(api.calls.count("status"), 5)          # 0·30·60·90·120초
            self.assertNotIn("publish", api.calls)

    def test_publish_without_response_is_recorded_and_never_reposted(self) -> None:
        api = FakeGraph(publish="transport")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "error")
            self.assertIn("다시 게시하지 않습니다", res["error"])
            self.assertEqual(api.calls.count("publish"), 1)                 # 재시도하지 않는다
            rec = ig.read_record(ep)
            self.assertEqual((rec.status, rec.media_id), ("uncertain", None))
            api.calls.clear()
            again = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual((again["status"], api.calls), ("skipped", []))

    def test_publish_500_before_publishing_leaves_no_record(self) -> None:
        api = FakeGraph(publish="500")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertIn("아직 게시 전", res["error"])
            self.assertIsNone(ig.read_record(ep))                          # 다음 실행이 다시 시도할 수 있다

    def test_changed_video_refused_unless_allowed(self) -> None:
        api = FakeGraph()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            (ep / "test-episode.mp4").write_bytes(b"\1" * 2048)
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=FakeGraph(), env=ENV, sleep=lambda s: None)
            self.assertIn("즉시 공개", res["error"])
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=FakeGraph(), env=ENV, sleep=lambda s: None, allow_repost=True)
            self.assertEqual(res["status"], "posted")

    def test_token_error_message(self) -> None:
        api = FakeGraph(token_error=True)
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertIn("오류 190", res["error"])
            self.assertNotIn("sekret-tkn-91", res["error"])

    def test_auto_guard_and_meta_switches(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            old = _episode(Path(d), name="04-old", slug="old")
            res = ig.process_episode(old, _cfg(), dry_run=False, auto=True, send=FakeGraph(), env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "skipped")
            self.assertIn("자동 대상 아님", res["warnings"][0])
            optin = _episode(Path(d), name="05-optin", slug="optin", meta={"auto_publish": True})
            self.assertEqual(ig.process_episode(optin, _cfg(), dry_run=True, auto=True, env={})["status"], "dry-run")
            off = _episode(Path(d), name="23-off", slug="off", meta={"instagram": False})
            self.assertEqual(ig.process_episode(off, _cfg(), dry_run=False, auto=True, send=FakeGraph(), env=ENV)["status"], "skipped")
            new = _episode(Path(d), name="24-new", slug="new")
            self.assertEqual(ig.process_episode(new, _cfg(), dry_run=True, auto=True, env={})["status"], "dry-run")
            morning = _episode(Path(d), name="32-radar", slug="radar")            # 아침 업로드 대기열은 push 에서 게시 안 함
            res = ig.process_episode(morning, _cfg(), dry_run=False, auto=True, send=FakeGraph(), env=ENV, morning={32})
            self.assertEqual(res["status"], "skipped")
            self.assertIn("아침 업로드 대기열", res["warnings"][0])

    def test_disabled_config_skips(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = ig.process_episode(ep, _cfg(enabled=False), dry_run=False, send=FakeGraph(), env=ENV)
            self.assertEqual(res["status"], "skipped")

    def test_validation_error_reported_without_network(self) -> None:
        api = FakeGraph()
        bad = UPLOAD.replace("#과학릴스", "#과학릴스 #여섯번째")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), upload=bad)
            res = ig.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV)
            self.assertIn("해시태그 6개", res["error"])
            self.assertEqual(api.calls, [])

    def test_mark_posted(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            rec = ig.mark_posted(ep, "https://www.instagram.com/reel/XYZ123/")
            self.assertEqual((rec.source, rec.permalink), ("manual", "https://www.instagram.com/reel/XYZ123/"))
            self.assertEqual(ig.process_episode(ep, _cfg(), dry_run=False, send=FakeGraph(), env=ENV)["status"], "skipped")
            with self.assertRaisesRegex(yu.UploadError, "이미"):
                ig.mark_posted(ep, "123456789")
            ep2 = _episode(Path(d), name="23-x", slug="x")
            with self.assertRaisesRegex(yu.UploadError, "주소가 아닙니다"):
                ig.mark_posted(ep2, "not-an-id")


class WhoamiTest(unittest.TestCase):
    def test_locked_account(self) -> None:
        info = ig.whoami(FakeGraph(), _cfg(), "sekret-tkn-91", sleep=lambda s: None)
        self.assertEqual((info["ig_user_id"], info["username"]), (IGID, "sci_shorts"))

    def test_candidates_from_pages(self) -> None:
        api = FakeGraph()
        info = ig.whoami(api, _cfg(ig_user_id=None), "sekret-tkn-91", sleep=lambda s: None)
        self.assertEqual(api.calls, ["accounts"])
        self.assertEqual(info["candidates"], [{"page": "과학쑛츠 페이지", "ig_user_id": IGID, "username": "sci_shorts"}])


if __name__ == "__main__":
    unittest.main()
