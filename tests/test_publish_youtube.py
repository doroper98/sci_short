"""publish.youtube 단위 시험 — 비밀값·네트워크 없이 돈다(가짜 전송). 실행: python -m unittest discover -s tests -v"""

from __future__ import annotations

import io
import json
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from publish import oauth as oa
from publish import youtube as yu

DESC = "하늘은 왜 파랄까?\n파란빛이 더 많이 흩어집니다.\n\n내레이션은 AI 합성 음성입니다."
SRT = "1\n00:00:01,200 --> 00:00:02,000\n자막입니다.\n"
ENV = {"YT_CLIENT_ID": "id", "YT_CLIENT_SECRET": "sec", "YT_REFRESH_TOKEN": "rt"}
PROBE_OK = {"width": 720, "height": 1280, "duration_sec": 75.0, "has_audio": True, "video_codec": "h264"}


def _cfg(**over) -> yu.Config:
    base = dict(made_for_kids=False, tags=["과학"], chunk_mb=1, tries=3)
    base.update(over)
    return yu.Config(**base)


def _episode(tmp: Path, desc: str = DESC, video: bytes = b"\0" * 1000, srt: str | None = SRT, meta: dict | None = None,
             name: str = "ep") -> Path:
    d = tmp / name
    d.mkdir(parents=True)
    (d / "final.mp4").write_bytes(video)
    (d / "description.txt").write_text(desc, encoding="utf-8")
    if srt is not None:
        (d / "final.srt").write_text(srt, encoding="utf-8")
    if meta is not None:
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return d


class FakeApi:
    """토큰 → 채널 → 업로드 세션 → 조각 PUT(첫 조각 308) → 자막. 호출 순서와 본문을 기록한다."""

    def __init__(self, *, channel_id: str = "UC1", fail_put_once: bool = False, caption_fail: bool = False) -> None:
        self.calls: list[str] = []
        self.bodies: list[bytes] = []
        self.channel_id = channel_id
        self.fail_put_once = fail_put_once
        self.caption_fail = caption_fail
        self.received = 0
        self.total = 0

    def __call__(self, method: str, url: str, headers: dict[str, str], data: bytes | None) -> yu.Response:
        if url.startswith(yu.TOKEN_URL):
            self.calls.append("token")
            assert b"refresh_token=rt" in (data or b"")
            return yu.Response(200, {}, b'{"access_token": "AT"}')
        if url.startswith(yu.CHANNELS_URL):
            self.calls.append("channel")
            assert headers["Authorization"] == "Bearer AT"
            return yu.Response(200, {}, json.dumps({"items": [{"id": self.channel_id, "snippet": {"title": "과학 채널"}}]}).encode())
        if url.startswith(yu.UPLOAD_URL):
            self.calls.append("start")
            self.bodies.append(data or b"")
            self.total = int(headers["X-Upload-Content-Length"])
            self.received = 0
            return yu.Response(200, {"location": "https://upload.session/s"}, b"")
        if url == "https://upload.session/s":
            rng = headers["Content-Range"]
            if rng.startswith("bytes */"):
                self.calls.append("query")
                return yu.Response(308, {"range": f"bytes=0-{self.received - 1}"} if self.received else {}, b"")
            self.calls.append("put")
            if self.fail_put_once:
                self.fail_put_once = False
                return yu.Response(503, {}, b"")
            start, end = (int(x) for x in rng.split(" ")[1].split("/")[0].split("-"))
            assert start == self.received, (start, self.received)
            self.received = end + 1
            if self.received < self.total:
                return yu.Response(308, {"range": f"bytes=0-{end}"}, b"")
            return yu.Response(200, {}, b'{"id": "VID123"}')
        if url.startswith(yu.CAPTIONS_URL):
            self.calls.append("caption")
            self.bodies.append(data or b"")
            if self.caption_fail:
                return yu.Response(403, {}, json.dumps({"error": {"message": "no", "errors": [{"reason": "forbidden"}]}}).encode())
            return yu.Response(200, {}, b'{"id": "CAP1"}')
        raise AssertionError(f"unexpected {method} {url}")


class ConfigTest(unittest.TestCase):
    def test_repo_config_loads_and_is_private(self) -> None:
        cfg = yu.load_config()
        self.assertEqual(cfg.privacy_status, "private")
        self.assertIsNone(cfg.made_for_kids, "저장소 기본 설정은 아동용 선언을 비워 두어 사용자가 정하게 한다")
        self.assertTrue(cfg.contains_synthetic_media)

    def test_non_private_config_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "c.json"
            p.write_text(json.dumps({"privacy_status": "public", "made_for_kids": False}), encoding="utf-8")
            with self.assertRaises(yu.UploadError):
                yu.load_config(p)
            p.write_text(json.dumps({"privacy_status": "private", "bogus": 1}), encoding="utf-8")
            with self.assertRaises(yu.UploadError):
                yu.load_config(p)

    def test_metadata_body_is_always_private(self) -> None:
        m = yu.Metadata(title="t", description="d", tags=[], category_id="27", default_language="ko",
                        contains_synthetic_media=True, made_for_kids=False, privacy_status="public")
        self.assertEqual(m.body()["status"]["privacyStatus"], "private")
        self.assertIn("privacy_status", " ".join(yu.validate_metadata(m)))


class InputTest(unittest.TestCase):
    def test_parse_description(self) -> None:
        title, body = yu.parse_description(DESC)
        self.assertEqual(title, "하늘은 왜 파랄까?")
        self.assertTrue(body.startswith("파란빛"))
        with self.assertRaises(yu.UploadError):
            yu.parse_description(" \n본문만")   # 첫 줄이 공백이면 제목 없음

    def test_build_metadata_overrides_in_order(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = yu.load_episode(_episode(Path(d), meta={"tags": ["하늘", "과학"], "made_for_kids": True,
                                                         "contains_synthetic_media": False, "category_id": "28"}))
            m = yu.build_metadata(ep, _cfg(made_for_kids=False))
            self.assertEqual(m.tags, ["과학", "하늘"])            # 공통 + 편별, 중복 제거
            self.assertTrue(m.made_for_kids)                     # meta.json 이 설정을 덧씌움
            self.assertFalse(m.contains_synthetic_media)
            self.assertEqual(m.category_id, "28")
            m2 = yu.build_metadata(ep, _cfg(made_for_kids=False), made_for_kids=False, synthetic=True)
            self.assertFalse(m2.made_for_kids)                   # 명령행이 meta.json 을 덧씌움
            self.assertTrue(m2.contains_synthetic_media)

    def test_made_for_kids_must_be_decided(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = yu.load_episode(_episode(Path(d)))
            with self.assertRaises(yu.UploadError) as cm:
                yu.build_metadata(ep, _cfg(made_for_kids=None))
            self.assertIn("made_for_kids", str(cm.exception))

    def test_meta_json_unknown_key_and_types(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(yu.UploadError):
                yu.load_episode(_episode(Path(d), meta={"privacy": "public"}, name="a"))
            with self.assertRaises(yu.UploadError):
                yu.load_episode(_episode(Path(d), meta={"made_for_kids": "yes"}, name="b"))

    def test_video_resolution_rules(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            e = t / "e"
            e.mkdir()
            (e / "description.txt").write_text(DESC, encoding="utf-8")
            with self.assertRaises(yu.UploadError):          # mp4 없음
                yu.load_episode(e)
            (e / "a.mp4").write_bytes(b"1")
            self.assertEqual(yu.load_episode(e).video.name, "a.mp4")   # 유일한 mp4
            (e / "b.mp4").write_bytes(b"2")
            with self.assertRaises(yu.UploadError):          # 둘이면 모호
                yu.load_episode(e)
            (e / "final.mp4").write_bytes(b"3")
            self.assertEqual(yu.load_episode(e).video.name, "final.mp4")
            self.assertIsNone(yu.load_episode(e).srt)
            (e / "final.srt").write_text(SRT, encoding="utf-8")
            self.assertIsNotNone(yu.load_episode(e).srt)
            self.assertIsNone(yu.load_episode(e, caption=False).srt)

    def test_validate_limits(self) -> None:
        m = yu.Metadata(title="가" * 101 + "<", description="나" * 1700 + ">", tags=["t" * 501], category_id="27",
                        default_language="ko", contains_synthetic_media=True, made_for_kids=False)
        errs = yu.validate_metadata(m)
        self.assertEqual(len(errs), 5, errs)   # 제목 길이·제목 문자·설명 바이트·설명 문자·태그

    def test_check_video_shorts_rules(self) -> None:
        cfg = _cfg()
        self.assertEqual(yu.check_video(PROBE_OK, cfg), ([], []))
        errs, _ = yu.check_video({**PROBE_OK, "duration_sec": 181}, cfg)
        self.assertEqual(len(errs), 1)
        errs, _ = yu.check_video({**PROBE_OK, "width": 1280, "height": 720}, cfg)
        self.assertEqual(len(errs), 1)
        errs, warns = yu.check_video({**PROBE_OK, "width": 1280, "height": 720, "duration_sec": 200}, cfg, not_shorts=True)
        self.assertEqual(errs, [])
        self.assertEqual(len(warns), 2)
        errs, warns = yu.check_video(None, cfg)
        self.assertEqual(errs, [])
        self.assertIn("ffprobe", warns[0])
        _, warns = yu.check_video({**PROBE_OK, "has_audio": False}, cfg)
        self.assertTrue(any("오디오" in w for w in warns))

    def test_secrets_and_env_file(self) -> None:
        with self.assertRaises(yu.UploadError) as cm:
            yu.read_secrets({"YT_CLIENT_ID": "x"})
        self.assertIn("YT_REFRESH_TOKEN", str(cm.exception))
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / ".env"
            p.write_text("# c\nYT_CLIENT_ID=a\nYT_CLIENT_SECRET='b'\nYT_REFRESH_TOKEN=\"c\"\n", encoding="utf-8")
            env = {"YT_CLIENT_ID": "keep"}
            yu.load_env_file(p, env)
            self.assertEqual(yu.read_secrets(env), ("keep", "b", "c"))


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class UploadFlowTest(unittest.TestCase):
    def test_full_upload_writes_record_and_caption(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), video=b"\1" * (3 * yu.MB // 2))   # 1 MB 조각 × 2
            res = yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "uploaded", res)
            self.assertEqual(api.calls, ["token", "channel", "start", "put", "put", "caption"])
            start_body = json.loads(api.bodies[0])
            self.assertEqual(start_body["status"], {"privacyStatus": "private", "selfDeclaredMadeForKids": False,
                                                    "containsSyntheticMedia": True})
            self.assertEqual(start_body["snippet"]["title"], "하늘은 왜 파랄까?")
            self.assertEqual(start_body["snippet"]["tags"], ["과학"])
            self.assertIn(b'"videoId": "VID123"', api.bodies[1])
            self.assertIn(SRT.encode("utf-8"), api.bodies[1])
            rec = yu.read_record(ep)
            self.assertEqual((rec.video_id, rec.caption_id, rec.channel_id, rec.privacy_status), ("VID123", "CAP1", "UC1", "private"))
            self.assertEqual(rec.url, "https://youtu.be/VID123")
            self.assertEqual(rec.duration_sec, 75.0)
            self.assertEqual(rec.video_md5, yu.md5_file(ep / "final.mp4"))

    def test_rerun_skips_same_video_without_network(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            n = len(api.calls)
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env={}, sleep=lambda s: None)   # 비밀값조차 필요 없다
            self.assertEqual(res["status"], "skipped")
            self.assertEqual(res["video_id"], "VID123")
            self.assertEqual(len(api.calls), n)

    def test_changed_video_with_record_is_refused_unless_allowed(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            (ep / "final.mp4").write_bytes(b"\2" * 2000)
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "error")
            self.assertIn("allow-reupload", res["error"])
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, allow_reupload=True)
            self.assertEqual(res["status"], "uploaded")

    def test_channel_mismatch_blocks_before_upload(self) -> None:
        api = FakeApi(channel_id="UC_OTHER")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "error")
            self.assertIn("channel_id", res["error"])
            self.assertNotIn("start", api.calls)
            self.assertIsNone(yu.read_record(ep))

    def test_retry_after_503_resumes_from_server_range(self) -> None:
        api = FakeApi(fail_put_once=True)
        waits: list[float] = []
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), video=b"\1" * (3 * yu.MB // 2), srt=None)
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=waits.append)
            self.assertEqual(res["status"], "uploaded")
            self.assertEqual(api.calls, ["token", "channel", "start", "put", "query", "put", "put"])
            self.assertEqual(waits, [2.0])

    def test_caption_failure_keeps_video_record_as_warning(self) -> None:
        api = FakeApi(caption_fail=True)
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "uploaded")
            self.assertTrue(any("자막" in w for w in res["warnings"]))
            rec = yu.read_record(ep)
            self.assertIsNone(rec.caption_id)
            self.assertIn("HTTP 403", rec.caption_error)

    def test_dry_run_needs_no_secrets_and_writes_nothing(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=True, env={})
            self.assertEqual(res["status"], "dry-run")
            self.assertIsNone(yu.read_record(ep))

    def test_validation_error_reported_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), desc="제" * 101 + "\n\n본문")
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=FakeApi(), env=ENV)
            self.assertEqual(res["status"], "error")
            self.assertIn("제목 101자", res["error"])

    def test_token_expired_message(self) -> None:
        def api(method, url, headers, data):  # noqa: ANN001, ANN202
            return yu.Response(400, {}, b'{"error": "invalid_grant"}')
        with self.assertRaises(yu.UploadError) as cm:
            yu.access_token(api, ("a", "b", "c"))
        self.assertIn("invalid_grant", str(cm.exception))
        self.assertIn("publish.oauth", str(cm.exception))

    def test_quota_hint(self) -> None:
        r = yu.Response(403, {}, json.dumps({"error": {"message": "x", "errors": [{"reason": "quotaExceeded"}]}}).encode())
        self.assertIn("할당량", str(yu._api_error(r, "업로드")))


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class CliTest(unittest.TestCase):
    def _main(self, argv: list[str]) -> tuple[int, dict]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = yu.main(argv)
        return rc, json.loads(out.getvalue().strip().splitlines()[-1])

    def _cfg_file(self, tmp: Path, **over) -> Path:
        p = tmp / "youtube.json"
        p.write_text(json.dumps({"privacy_status": "private", "made_for_kids": False, "tags": ["과학"], **over}), encoding="utf-8")
        return p

    def test_all_dry_run_skips_underscore_dirs_and_reports(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            outbox = t / "outbox"
            _episode(outbox, name="01-sky")
            _episode(outbox, name="_example")
            rep = t / "report.json"
            rc, res = self._main(["--all", "--dry-run", "--outbox", str(outbox), "--config", str(self._cfg_file(t)),
                                  "--report", str(rep)])
            self.assertEqual(rc, 0)
            self.assertEqual(res["counts"], {"uploaded": 0, "skipped": 0, "dry-run": 1, "error": 0})
            self.assertTrue(res["results"][0]["dir"].endswith("01-sky"))
            self.assertEqual(json.loads(rep.read_text(encoding="utf-8"))["ok"], True)

    def test_undecided_kids_flag_fails_dry_run(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            ep = _episode(t)
            rc, res = self._main([str(ep), "--dry-run", "--config", str(self._cfg_file(t, made_for_kids=None))])
            self.assertEqual(rc, 1)
            self.assertIn("made_for_kids", res["results"][0]["error"])
            rc, _ = self._main([str(ep), "--dry-run", "--made-for-kids", "no", "--config", str(self._cfg_file(t, made_for_kids=None))])
            self.assertEqual(rc, 0)

    def test_missing_secrets_is_an_error_exit(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            ep = _episode(t)
            with mock.patch.dict("os.environ", {}, clear=True):
                rc, res = self._main([str(ep), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 1)
            self.assertIn("환경 변수 없음", res["results"][0]["error"])

    def test_all_with_empty_outbox_is_ok_but_no_args_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            (t / "outbox").mkdir()
            rc, res = self._main(["--all", "--outbox", str(t / "outbox"), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 0)
            self.assertEqual(res["counts"]["uploaded"], 0)
            self.assertIn("에피소드 폴더가 없습니다", res["warnings"][0])
            rc, res = self._main(["--outbox", str(t / "outbox"), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 1)
            self.assertIn("대상이 없습니다", res["error"])

    def test_list(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            outbox = t / "outbox"
            _episode(outbox, name="01-sky")
            (outbox / "02-empty").mkdir()
            rc, res = self._main(["--list", "--outbox", str(outbox), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 0)
            self.assertEqual([e["state"] for e in res["episodes"]], ["대기", "입력 불완전"])


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg 없음")
class RealProbeTest(unittest.TestCase):
    def test_probe_vertical_clip(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "v.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=720x1280:r=30:d=2",
                            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-shortest", str(p)], check=True, timeout=120)
            info = yu.probe_video(p)
            self.assertEqual((info["width"], info["height"], info["has_audio"]), (720, 1280, True))
            self.assertAlmostEqual(info["duration_sec"], 2.0, delta=0.2)
            self.assertEqual(yu.check_video(info, _cfg())[0], [])


class OAuthHelperTest(unittest.TestCase):
    def test_auth_url_requests_offline_consent_with_pkce(self) -> None:
        v, c = oa.pkce_pair()
        url = oa.auth_url("cid", "http://127.0.0.1:8765/", "st", c)
        q = dict(x.split("=", 1) for x in url.split("?", 1)[1].split("&"))
        self.assertEqual(q["access_type"], "offline")
        self.assertEqual(q["prompt"], "consent")
        self.assertEqual(q["code_challenge_method"], "S256")
        self.assertIn("youtube.upload", q["scope"])
        self.assertIn("youtube.force-ssl", q["scope"])
        self.assertNotIn("youtube.readonly", q["scope"])

    def test_exchange_requires_refresh_token(self) -> None:
        def ok(method, url, headers, data):  # noqa: ANN001, ANN202
            self.assertIn(b"code_verifier=v", data)
            return yu.Response(200, {}, b'{"access_token": "a", "refresh_token": "r", "scope": "s"}')

        def no_rt(method, url, headers, data):  # noqa: ANN001, ANN202
            return yu.Response(200, {}, b'{"access_token": "a"}')
        self.assertEqual(oa.exchange_code(ok, "i", "s", "c", "http://127.0.0.1:8765/", "v")["refresh_token"], "r")
        with self.assertRaises(yu.UploadError):
            oa.exchange_code(no_rt, "i", "s", "c", "http://127.0.0.1:8765/", "v")

    def test_production_gate_blocks_seven_day_tokens(self) -> None:
        oa.confirm_production(production=True, allow_testing=False, interactive=False)        # 확인함 → 통과
        warned: list[str] = []
        oa.confirm_production(production=False, allow_testing=True, interactive=False, warn=warned.append)
        self.assertTrue(warned and "7일" in warned[0])
        with self.assertRaises(yu.UploadError) as cm:                                          # 비대화식·확인 없음 → 거부
            oa.confirm_production(production=False, allow_testing=False, interactive=False)
        self.assertIn("프로덕션", str(cm.exception))
        oa.confirm_production(production=False, allow_testing=False, interactive=True, ask=lambda s: "y")
        with self.assertRaises(yu.UploadError):
            oa.confirm_production(production=False, allow_testing=False, interactive=True, ask=lambda s: "")

    def test_write_env_replaces_keys(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / ".env"
            p.write_text("OTHER=1\nYT_CLIENT_ID=old\n", encoding="utf-8")
            oa.write_env(p, {"YT_CLIENT_ID": "new", "YT_CLIENT_SECRET": "s", "YT_REFRESH_TOKEN": "r"})
            lines = p.read_text(encoding="utf-8").splitlines()
            self.assertEqual(lines, ["OTHER=1", "YT_CLIENT_ID=new", "YT_CLIENT_SECRET=s", "YT_REFRESH_TOKEN=r"])


if __name__ == "__main__":
    unittest.main()
