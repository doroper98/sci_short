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

# finals/01~08 형식: 제목·설명은 ```text 블록, 태그는 '- 태그:' 한 줄
UPLOAD_A = """# 업로드 정보 — 1. 중력파 (177.3초)

공통 설정은 [업로드 공통 설정](../../docs/YOUTUBE_UPLOAD.md)에 있습니다.

제목
```text
두 블랙홀이 하나가 될 때, 공간이 출렁인다 | 중력파
```
설명
```text
두 블랙홀이 서로를 돌다 하나가 되는 마지막 0.2초, 공간 자체가 출렁입니다.

· 중력파(重力波): 무거운 것이 움직일 때 생기는 공간의 물결
내레이션: AI 합성 음성 · 배경음악 없음

#중력파 #블랙홀 #과학
```
- 태그: 중력파, 블랙홀, LIGO, 과학
- 썸네일: [thumbnail.jpg](thumbnail.jpg) — 별도 썸네일 이미지
- 고정 댓글: 지구와 달도 중력파를 낼까요?
"""
# finals/09~ 형식: 태그도 블록
UPLOAD_B = """# 업로드 정보 — 13. 감마선 폭발 (175.5초)

제목
```text
단 몇 초에 태양 100억 년 치 에너지 | 감마선 폭발 #감마선폭발 #블랙홀 #천문
```
설명
```text
오늘은 우주에서 가장 밝은 폭발, 감마선 폭발을 알아봅니다.

#감마선폭발 #감마선 #과학쇼츠
```
태그
```text
감마선 폭발, 감마선, gamma-ray burst, GRB, 블랙홀
```
- 썸네일: 0초 프레임
"""
# 블록 없는 평문 형식(SKILL 7단계 "코드 블록 없이")
UPLOAD_C = """제목
평문 제목 #과학

설명
첫 줄입니다.
둘째 줄입니다.

태그
가, 나, 다
"""
SRT = "1\n00:00:01,200 --> 00:00:02,000\n자막입니다.\n"
ENV = {"YT_CLIENT_ID": "id", "YT_CLIENT_SECRET": "sec", "YT_REFRESH_TOKEN": "rt"}
PROBE_OK = {"width": 1080, "height": 1920, "duration_sec": 175.0, "has_audio": True, "video_codec": "h264"}


def _cfg(**over) -> yu.Config:
    base = dict(made_for_kids=False, chunk_mb=1, tries=3)
    base.update(over)
    return yu.Config(**base)


def _episode(tmp: Path, upload: str = UPLOAD_A, video: bytes = b"\0" * 1000, srt: str | None = SRT, meta: dict | None = None,
             name: str = "01-gravitational-waves", slug: str = "gravitational-waves", thumbnail: bool = True,
             poster: bool = True) -> Path:
    d = tmp / name
    d.mkdir(parents=True)
    (d / f"{slug}.mp4").write_bytes(video)
    (d / "upload.md").write_text(upload, encoding="utf-8")
    if srt is not None:
        (d / f"{slug}.srt").write_text(srt, encoding="utf-8")
    if thumbnail:
        (d / "thumbnail.jpg").write_bytes(b"\xff\xd8thumb")
    if poster:
        (d / "poster.jpg").write_bytes(b"\xff\xd8poster")
    if meta is not None:
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return d


class FakeApi:
    """토큰 → 채널 → 업로드 세션 → 조각 PUT(첫 조각 308) → 썸네일 → 자막. 호출 순서와 본문을 기록한다."""

    def __init__(self, *, channel_id: str = "UC1", fail_put_once: bool = False, caption_fail: bool = False,
                 thumb_fail: bool = False) -> None:
        self.calls: list[str] = []
        self.bodies: dict[str, bytes] = {}
        self.channel_id = channel_id
        self.fail_put_once = fail_put_once
        self.caption_fail = caption_fail
        self.thumb_fail = thumb_fail
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
        if url.startswith(yu.THUMBNAILS_URL):
            self.calls.append("thumbnail")
            self.bodies["thumbnail"] = data or b""
            assert "videoId=VID123" in url and headers["Content-Type"] == "image/jpeg"
            if self.thumb_fail:
                return yu.Response(403, {}, json.dumps({"error": {"message": "x", "errors": [{"reason": "forbidden"}]}}).encode())
            return yu.Response(200, {}, b"{}")
        if url.startswith(yu.UPLOAD_URL):
            self.calls.append("start")
            self.bodies["start"] = data or b""
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
            self.bodies["caption"] = data or b""
            if self.caption_fail:
                return yu.Response(403, {}, json.dumps({"error": {"message": "no", "errors": [{"reason": "forbidden"}]}}).encode())
            return yu.Response(200, {}, b'{"id": "CAP1"}')
        raise AssertionError(f"unexpected {method} {url}")


class ConfigTest(unittest.TestCase):
    def test_repo_config_loads_and_follows_user_decisions(self) -> None:
        cfg = yu.load_config()
        self.assertEqual(cfg.privacy_status, "private")
        self.assertIs(cfg.made_for_kids, False, "2026-11-07 사용자 결정: 아동용 아님")
        self.assertTrue(cfg.contains_synthetic_media)
        self.assertFalse(cfg.upload_captions, "2026-11-03 결정: SRT 는 기본 올리지 않음")
        self.assertTrue(cfg.upload_thumbnail)
        self.assertEqual(cfg.category_id, "27")

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


class UploadMdTest(unittest.TestCase):
    def test_format_a_blocks_and_tag_line(self) -> None:
        info = yu.parse_upload_md(UPLOAD_A)
        self.assertEqual(info["title"], "두 블랙홀이 하나가 될 때, 공간이 출렁인다 | 중력파")
        self.assertTrue(info["description"].startswith("두 블랙홀이 서로를"))
        self.assertTrue(info["description"].endswith("#중력파 #블랙홀 #과학"))
        self.assertIn("\n\n· 중력파", info["description"])          # 빈 줄·글머리 유지
        self.assertEqual(info["tags"], ["중력파", "블랙홀", "LIGO", "과학"])

    def test_format_b_tag_block(self) -> None:
        info = yu.parse_upload_md(UPLOAD_B)
        self.assertEqual(info["title"], "단 몇 초에 태양 100억 년 치 에너지 | 감마선 폭발 #감마선폭발 #블랙홀 #천문")
        self.assertEqual(info["tags"], ["감마선 폭발", "감마선", "gamma-ray burst", "GRB", "블랙홀"])

    def test_format_c_plain_text(self) -> None:
        info = yu.parse_upload_md(UPLOAD_C)
        self.assertEqual(info["title"], "평문 제목 #과학")
        self.assertEqual(info["description"], "첫 줄입니다.\n둘째 줄입니다.")
        self.assertEqual(info["tags"], ["가", "나", "다"])

    def test_missing_or_multiline_title(self) -> None:
        with self.assertRaises(yu.UploadError):
            yu.parse_upload_md("설명\n```text\n본문\n```\n")
        with self.assertRaises(yu.UploadError):
            yu.parse_upload_md("제목\n```text\n한 줄\n두 줄\n```\n설명\n```text\n본문\n```\n")
        with self.assertRaises(yu.UploadError):
            yu.parse_upload_md("제목\n```text\n제목만\n```\n")

    def test_real_finals_upload_md_all_parse(self) -> None:
        """저장소의 실제 finals/*/upload.md 가 모두 읽히고 API 한도 안이어야 한다."""
        dirs = yu.episode_dirs(yu.DEFAULT_FINALS)
        if not dirs:
            self.skipTest("finals/ 없음")
        for d in dirs:
            with self.subTest(d.name):
                info = yu.parse_upload_md((d / "upload.md").read_text(encoding="utf-8"))
                self.assertLessEqual(len(info["title"]), yu.TITLE_MAX_CHARS)
                self.assertLessEqual(len(info["description"].encode("utf-8")), yu.DESCRIPTION_MAX_BYTES)
                self.assertGreaterEqual(len(info["tags"]), 3, "태그를 못 읽었다")
                self.assertNotIn("```", info["description"])


class InputTest(unittest.TestCase):
    def test_load_episode_finals_layout(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = yu.load_episode(_episode(Path(d)))
            self.assertEqual((ep.number, ep.slug, ep.video.name), (1, "gravitational-waves", "gravitational-waves.mp4"))
            self.assertIsNone(ep.srt, "자막은 기본 올리지 않는다")
            self.assertEqual(ep.thumbnail.name, "thumbnail.jpg")
            ep2 = yu.load_episode(ep.dir, caption=True)
            self.assertEqual(ep2.srt.name, "gravitational-waves.srt")
            self.assertIsNone(yu.load_episode(ep.dir, thumbnail=False).thumbnail)

    def test_poster_is_thumbnail_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = yu.load_episode(_episode(Path(d), thumbnail=False, name="09-twinkle", slug="twinkle"))
            self.assertEqual(ep.thumbnail.name, "poster.jpg")
            self.assertEqual(ep.number, 9)

    def test_video_resolution_rules(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            e = Path(d) / "02-x"
            e.mkdir()
            (e / "upload.md").write_text(UPLOAD_A, encoding="utf-8")
            with self.assertRaises(yu.UploadError):          # mp4 없음
                yu.load_episode(e)
            (e / "a.mp4").write_bytes(b"1")
            self.assertEqual(yu.load_episode(e).video.name, "a.mp4")
            (e / "b.mp4").write_bytes(b"2")
            with self.assertRaises(yu.UploadError):          # 둘이면 모호
                yu.load_episode(e)
            (e / "meta.json").write_text('{"video": "b.mp4"}', encoding="utf-8")
            self.assertEqual(yu.load_episode(e).video.name, "b.mp4")
            with self.assertRaises(yu.UploadError):          # 자막 요청했는데 srt 없음
                yu.load_episode(e, caption=True)

    def test_build_metadata_overrides_in_order(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = yu.load_episode(_episode(Path(d), meta={"tags": ["추가", "과학"], "made_for_kids": True,
                                                         "contains_synthetic_media": False, "category_id": "28"}))
            m = yu.build_metadata(ep, _cfg(made_for_kids=False, tags=["공통"]))
            self.assertEqual(m.tags, ["중력파", "블랙홀", "LIGO", "과학", "공통", "추가"])   # upload.md → 공통 → 편별, 중복 제거
            self.assertTrue(m.made_for_kids)
            self.assertFalse(m.contains_synthetic_media)
            self.assertEqual(m.category_id, "28")
            m2 = yu.build_metadata(ep, _cfg(made_for_kids=False), made_for_kids=False, synthetic=True)
            self.assertFalse(m2.made_for_kids)
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
                yu.load_episode(_episode(Path(d), meta={"privacy": "public"}, name="01-a"))
            with self.assertRaises(yu.UploadError):
                yu.load_episode(_episode(Path(d), meta={"made_for_kids": "yes"}, name="02-b"))

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
        errs, _ = yu.check_video({**PROBE_OK, "width": 1920, "height": 1080}, cfg)
        self.assertEqual(len(errs), 1)
        errs, warns = yu.check_video({**PROBE_OK, "width": 1920, "height": 1080, "duration_sec": 200}, cfg, not_shorts=True)
        self.assertEqual(errs, [])
        self.assertEqual(len(warns), 2)
        errs, warns = yu.check_video(None, cfg)
        self.assertEqual(errs, [])
        self.assertIn("ffprobe", warns[0])
        _, warns = yu.check_video({**PROBE_OK, "has_audio": False}, cfg)
        self.assertTrue(any("오디오" in w for w in warns))

    def test_episode_dirs_skip_legacy_and_underscore(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for n in ("01-a", "13-b", "legacy", "_tmp", ".hidden", "notes"):
                (root / n).mkdir()
            self.assertEqual([p.name for p in yu.episode_dirs(root)], ["01-a", "13-b"])

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
    def test_full_upload_writes_record_thumbnail_no_caption(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), video=b"\1" * (3 * yu.MB // 2))   # 1 MB 조각 × 2
            res = yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "uploaded", res)
            self.assertEqual(api.calls, ["token", "channel", "start", "put", "put", "thumbnail"])   # 자막은 기본 안 올림
            start_body = json.loads(api.bodies["start"])
            self.assertEqual(start_body["status"], {"privacyStatus": "private", "selfDeclaredMadeForKids": False,
                                                    "containsSyntheticMedia": True})
            self.assertEqual(start_body["snippet"]["title"], "두 블랙홀이 하나가 될 때, 공간이 출렁인다 | 중력파")
            self.assertEqual(start_body["snippet"]["tags"], ["중력파", "블랙홀", "LIGO", "과학"])
            self.assertEqual(start_body["snippet"]["categoryId"], "27")
            self.assertEqual(api.bodies["thumbnail"], b"\xff\xd8thumb")
            rec = yu.read_record(ep)
            self.assertEqual((rec.video_id, rec.caption_id, rec.channel_id, rec.privacy_status), ("VID123", None, "UC1", "private"))
            self.assertEqual((rec.number, rec.slug, rec.source, rec.thumbnail_file), (1, "gravitational-waves", "api", "thumbnail.jpg"))
            self.assertEqual(rec.url, "https://youtu.be/VID123")
            self.assertEqual(rec.video_md5, yu.md5_file(ep / "gravitational-waves.mp4"))

    def test_caption_opt_in(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, caption=True)
            self.assertEqual(res["status"], "uploaded")
            self.assertEqual(api.calls[-1], "caption")
            self.assertIn(b'"videoId": "VID123"', api.bodies["caption"])
            self.assertIn(SRT.encode("utf-8"), api.bodies["caption"])
            self.assertEqual(yu.read_record(ep).caption_id, "CAP1")

    def test_thumbnail_failure_is_warning(self) -> None:
        api = FakeApi(thumb_fail=True)
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "uploaded")
            self.assertTrue(any("썸네일" in w for w in res["warnings"]))
            rec = yu.read_record(ep)
            self.assertIsNone(rec.thumbnail_file)
            self.assertIn("HTTP 403", rec.thumbnail_error)

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
            (ep / "gravitational-waves.mp4").write_bytes(b"\2" * 2000)
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
            ep = _episode(Path(d), video=b"\1" * (3 * yu.MB // 2), thumbnail=False, poster=False)
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=waits.append)
            self.assertEqual(res["status"], "uploaded")
            self.assertEqual(api.calls, ["token", "channel", "start", "put", "query", "put", "put"])
            self.assertEqual(waits, [2.0])

    def test_caption_failure_keeps_video_record_as_warning(self) -> None:
        api = FakeApi(caption_fail=True)
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), thumbnail=False, poster=False)
            res = yu.process_episode(ep, _cfg(upload_captions=True), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
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
            self.assertEqual(res["number"], 1)
            self.assertIsNone(yu.read_record(ep))

    def test_validation_error_reported_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), upload=UPLOAD_A.replace("두 블랙홀이 하나가 될 때, 공간이 출렁인다 | 중력파", "제" * 101))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=FakeApi(), env=ENV)
            self.assertEqual(res["status"], "error")
            self.assertIn("제목 101자", res["error"])

    def test_mark_uploaded_then_skipped(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            rec = yu.mark_uploaded(ep, "dQw4w9WgXcQ")
            self.assertEqual((rec.source, rec.url), ("manual", "https://youtu.be/dQw4w9WgXcQ"))
            with self.assertRaises(yu.UploadError):
                yu.mark_uploaded(ep, "dQw4w9WgXcQ")          # 두 번은 거부
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "skipped")
            self.assertEqual(api.calls, [])
            with self.assertRaises(yu.UploadError):
                yu.mark_uploaded(_episode(Path(d), name="02-x", slug="x"), "bad id!")

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
        p.write_text(json.dumps({"privacy_status": "private", "made_for_kids": False, **over}), encoding="utf-8")
        return p

    def test_all_dry_run_skips_legacy_and_reports(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            finals = t / "finals"
            _episode(finals, name="01-sky", slug="sky")
            _episode(finals, name="legacy", slug="old")
            rep = t / "report.json"
            rc, res = self._main(["--all", "--dry-run", "--finals", str(finals), "--config", str(self._cfg_file(t)),
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

    def test_all_with_empty_finals_is_ok_but_no_args_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            (t / "finals").mkdir()
            rc, res = self._main(["--all", "--finals", str(t / "finals"), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 0)
            self.assertEqual(res["counts"]["uploaded"], 0)
            self.assertIn("에피소드 폴더가 없습니다", res["warnings"][0])
            rc, res = self._main(["--finals", str(t / "finals"), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 1)
            self.assertIn("대상이 없습니다", res["error"])

    def test_mark_uploaded_cli_and_list(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            t = Path(d)
            finals = t / "finals"
            ep = _episode(finals, name="01-sky", slug="sky")
            (finals / "02-empty").mkdir()
            rc, res = self._main([str(ep), "--mark-uploaded", "dQw4w9WgXcQ", "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 0)
            self.assertEqual(res["record"]["source"], "manual")
            rc, res = self._main(["--list", "--finals", str(finals), "--config", str(self._cfg_file(t))])
            self.assertEqual(rc, 0)
            self.assertEqual([e["state"] for e in res["episodes"]], ["업로드됨(수동 기록)", "입력 불완전"])
            self.assertEqual(res["episodes"][0]["title"], "두 블랙홀이 하나가 될 때, 공간이 출렁인다 | 중력파")


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg 없음")
class RealProbeTest(unittest.TestCase):
    def test_probe_vertical_clip(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "v.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=30:d=2",
                            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-shortest", str(p)], check=True, timeout=120)
            info = yu.probe_video(p)
            self.assertEqual((info["width"], info["height"], info["has_audio"]), (1080, 1920, True))
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
        oa.confirm_production(production=True, allow_testing=False, interactive=False)
        warned: list[str] = []
        oa.confirm_production(production=False, allow_testing=True, interactive=False, warn=warned.append)
        self.assertTrue(warned and "7일" in warned[0])
        with self.assertRaises(yu.UploadError) as cm:
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
