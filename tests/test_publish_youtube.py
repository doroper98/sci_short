"""publish.youtube 단위 시험 — 비밀값·네트워크 없이 돈다(가짜 전송). 실행: python -m unittest discover -s tests -v"""

from __future__ import annotations

import datetime as dt
import io
import json
import shutil
import subprocess
import tempfile
import unittest
import urllib.parse
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
                 thumb_fail: bool = False, processing: list[str] | None = None) -> None:
        self.calls: list[str] = []
        self.processing = list(processing or ["succeeded"])   # videos.list 가 차례로 돌려줄 processingStatus(마지막 값 유지)
        self.status_map: dict[str, tuple[str, int]] = {}         # videos.list(part=status,statistics): id → (공개 상태, 조회수)
        self.uploads = 0
        self.bodies: dict[str, bytes] = {}
        self.channel_id = channel_id
        self.fail_put_once = fail_put_once
        self.caption_fail = caption_fail
        self.thumb_fail = thumb_fail
        self.received = 0
        self.total = 0
        self.videos: dict[str, dict] = {}          # videos.list(part=snippet,status,statistics): id → 영상 리소스(옛 판 비공개 전환)
        self.update_fail: int | None = None        # videos.update 가 돌려줄 오류 상태(403 = 범위 부족)
        self.updates: list[dict] = []              # videos.update 요청 본문

    def video(self, vid: str, privacy: str, views: int, *, channel: str = "UC1") -> None:
        """조회수 확인(status_map)과 비공개 전환(videos) 양쪽에 같은 영상을 둔다."""
        self.status_map[vid] = (privacy, views)
        self.videos[vid] = {"id": vid, "snippet": {"channelId": channel, "title": "옛 판"},
                            "status": {"privacyStatus": privacy, "embeddable": False, "license": "creativeCommon",
                                       "publicStatsViewable": False, "madeForKids": False, "selfDeclaredMadeForKids": False,
                                       "uploadStatus": "processed"},
                            "statistics": {"viewCount": str(views)}}

    def __call__(self, method: str, url: str, headers: dict[str, str], data: bytes | None) -> yu.Response:
        if url.startswith(yu.VIDEOS_URL) and method == "PUT":
            self.calls.append("update")
            assert urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["part"] == ["status"], url
            body = json.loads(data or b"{}")
            self.updates.append(body)
            if self.update_fail:
                return yu.Response(self.update_fail, {}, json.dumps({"error": {
                    "message": "Request had insufficient authentication scopes.",
                    "errors": [{"reason": "insufficientPermissions"}]}}).encode())
            v = self.videos[body["id"]]
            v["status"] = dict(body["status"])
            self.status_map[body["id"]] = (body["status"]["privacyStatus"], self.status_map.get(body["id"], ("", 0))[1])
            return yu.Response(200, {}, json.dumps(v).encode())
        if url.startswith(yu.VIDEOS_URL) and "part=snippet" in url:
            self.calls.append("full")
            ids = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["id"][0].split(",")
            return yu.Response(200, {}, json.dumps({"items": [self.videos[i] for i in ids if i in self.videos]}).encode())
        if url.startswith(yu.TOKEN_URL):
            self.calls.append("token")
            assert b"refresh_token=rt" in (data or b"")
            return yu.Response(200, {}, b'{"access_token": "AT"}')
        if url.startswith(yu.CHANNELS_URL):
            self.calls.append("channel")
            assert headers["Authorization"] == "Bearer AT"
            return yu.Response(200, {}, json.dumps({"items": [{"id": self.channel_id, "snippet": {"title": "과학 채널"}}]}).encode())
        if url.startswith(yu.VIDEOS_URL) and "part=status" in url:
            self.calls.append("status")
            ids = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["id"][0].split(",")
            items = [{"id": i, "status": {"privacyStatus": self.status_map[i][0]}, "statistics": {"viewCount": str(self.status_map[i][1])}}
                     for i in ids if i in self.status_map]
            return yu.Response(200, {}, json.dumps({"items": items}).encode())
        if url.startswith(yu.VIDEOS_URL):
            self.calls.append("processing")
            assert method == "GET" and "part=processingDetails" in url and "id=VID123" in url
            st = self.processing.pop(0) if len(self.processing) > 1 else self.processing[0]
            return yu.Response(200, {}, json.dumps({"items": [{"id": "VID123", "processingDetails": {"processingStatus": st}}]}).encode())
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
            self.uploads += 1
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
        self.assertEqual(cfg.channel_id, "UCZJSpmlBYUthLg0PSWcbU6w", "2026-11-07 사용자 확인: 과학쑛츠 채널로 잠금")
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

    def test_title_middle_dot_forbidden(self) -> None:
        """2026-11-08 사용자 규칙: 제목에 · 절대 쓰지 않는다(| 또는 다른 것)."""
        meta = yu.Metadata(title="질문? · 부제", description="설명", tags=[], category_id="27", default_language="ko",
                           contains_synthetic_media=True, made_for_kids=False)
        self.assertTrue(any("가운뎃점" in e for e in yu.validate_metadata(meta)))
        for f in sorted((yu.REPO / "finals").glob("[0-9]*/upload.md")):
            self.assertNotIn("·", yu.parse_upload_md(f.read_text(encoding="utf-8"))["title"], f)

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
            # 썸네일은 영상 처리 완료를 확인한 뒤에 지정한다(쇼츠 조건). 자막은 기본 안 올림
            self.assertEqual(api.calls, ["token", "channel", "start", "put", "put", "processing", "thumbnail"])
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
            self.assertTrue(rec.thumbnail_after_processing)
            self.assertIsNotNone(rec.thumbnail_set_at)

    def test_thumbnail_waits_until_processing_succeeded(self) -> None:
        api = FakeApi(processing=["uploaded", "processing", "processing", "succeeded"])
        slept: list[float] = []
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=slept.append)
            self.assertEqual(res["status"], "uploaded", res)
            self.assertEqual(api.calls[-5:], ["processing"] * 4 + ["thumbnail"])
            self.assertEqual(slept, [15, 15, 15])

    def test_processing_timeout_keeps_video_and_warns(self) -> None:
        api = FakeApi(processing=["processing"])
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(processing_wait_sec=60, processing_poll_sec=15), dry_run=False,
                                     send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "uploaded")
            self.assertNotIn("thumbnail", api.calls)
            self.assertEqual(api.calls.count("processing"), 5)    # 0·15·30·45·60초
            rec = yu.read_record(ep)
            self.assertIn("초과", rec.thumbnail_error)
            self.assertFalse(rec.thumbnail_after_processing)
            self.assertTrue(any("다시 실행하면 다시 시도" in w for w in res["warnings"]))

    def test_processing_failed_is_reported(self) -> None:
        api = FakeApi(processing=["failed"])
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "uploaded")
            self.assertIn("처리 failed", yu.read_record(ep).thumbnail_error)

    def test_old_record_gets_thumbnail_reapplied_without_reupload(self) -> None:
        """2026-11-07 04편: 처리 전에 썸네일을 지정한 옛 기록. 다시 실행하면 영상은 두고 썸네일만 다시 지정한다."""
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            raw = json.loads((ep / yu.RECORD_NAME).read_text(encoding="utf-8"))
            for k in ("thumbnail_after_processing", "thumbnail_set_at"):
                raw.pop(k)                                             # 옛 스키마 그대로
            (ep / yu.RECORD_NAME).write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
            dry = yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=True, send=api, env={}, sleep=lambda s: None)
            self.assertEqual(dry["status"], "skipped")
            self.assertTrue(any("다시 지정해야" in w for w in dry["warnings"]))
            api.calls.clear()
            res = yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "skipped", res)
            self.assertTrue(res["thumbnail_repaired"])
            self.assertEqual(api.calls, ["token", "channel", "processing", "thumbnail"])   # 영상 업로드 없음
            rec = yu.read_record(ep)
            self.assertTrue(rec.thumbnail_after_processing)
            self.assertEqual(rec.video_id, "VID123")
            api.calls.clear()
            again = yu.process_episode(ep, _cfg(channel_id="UC1"), dry_run=False, send=api, env={}, sleep=lambda s: None)
            self.assertEqual((again["status"], api.calls), ("skipped", []))  # 고친 뒤에는 네트워크도 쓰지 않는다

    def test_auto_mode_skips_old_numbers_without_network(self) -> None:
        """push 자동 실행은 22번 이상 새 편만. 01~21 은 손으로 올린 편이 섞여 있어 폴더를 고쳐도 다시 올리지 않는다."""
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            old = _episode(Path(d))                                   # 01-…
            res = yu.process_episode(old, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, auto=True)
            self.assertEqual(res["status"], "skipped")
            self.assertIn("자동 대상 아님", res["warnings"][0])
            self.assertEqual(api.calls, [])
            optin = _episode(Path(d), name="02-optin", slug="optin", meta={"auto_publish": True})
            self.assertEqual(yu.process_episode(optin, _cfg(), dry_run=True, auto=True)["status"], "dry-run")
            new = _episode(Path(d), name="22-new", slug="new")
            self.assertEqual(yu.process_episode(new, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None,
                                                auto=True)["status"], "uploaded")
            self.assertEqual(yu.process_episode(old, _cfg(), dry_run=True)["status"], "dry-run")   # 수동 지정은 그대로

    def test_meta_switch_types(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), meta={"auto_publish": "yes"})
            with self.assertRaisesRegex(yu.UploadError, "auto_publish"):
                yu.load_episode(ep)

    def test_republish_uploads_new_video_and_keeps_previous(self) -> None:
        """2026-11-08: 몰아 공개해 노출을 못 받은 편을 새 영상으로 다시 올린다. 이전 판은 previous 에 남는다."""
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            old = yu.read_record(ep)
            old.video_id, old.url = "OLD1", "https://youtu.be/OLD1"
            yu.write_record(ep, old)
            api.status_map = {"OLD1": ("public", 7)}
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True)
            self.assertEqual(res["status"], "uploaded", res)
            self.assertEqual((res["previous_video"], res["previous_views"]), ("https://youtu.be/OLD1", 7))
            rec = yu.read_record(ep)
            self.assertEqual(rec.video_id, "VID123")
            self.assertEqual(rec.previous[0]["video_id"], "OLD1")
            self.assertEqual(rec.previous[0]["reason"], "republish")
            self.assertTrue(yu.republished(rec))
            self.assertEqual(api.uploads, 2)

    def test_republish_skips_when_previous_got_views(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            api.status_map = {"VID123": ("public", 900)}
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True)
            self.assertEqual(res["status"], "skipped")
            self.assertIn("노출을 받았습니다", res["warnings"][-1])
            self.assertEqual(api.uploads, 1)

    def test_republish_without_record_notes_manual_previous(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True)
            self.assertEqual(res["status"], "uploaded")
            self.assertIn("ID 미기록", yu.read_record(ep).previous[0]["note"])

    def test_republish_next_queue_gate_and_order(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            a = _episode(root, name="06-a", slug="a")
            b = _episode(root, name="07-b", slug="b")
            for ep, vid, views in ((a, "OA", 900), (b, "OB", 3)):
                yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
                r = yu.read_record(ep)
                r.video_id, r.uploaded_at = vid, "2026-11-10T10:00:00+00:00"   # 보류 창(3일) 안
                yu.write_record(ep, r)
            q = root / "republish.json"
            rel = lambda p: p.relative_to(yu.REPO).as_posix()   # noqa: E731
            q.write_text(json.dumps({"start": "2026-11-11", "min_views": 50, "hold_if_private_within_days": 3,
                                     "queue": [rel(a), rel(b)]}), encoding="utf-8")
            early = yu.republish_next(_cfg(), q, root, today=dt.date(2026, 11, 10), dry_run=False, send=api, env=ENV)
            self.assertIn("시작 전", early["note"])
            api.status_map = {"OA": ("public", 900), "OB": ("private", 3)}
            hold = yu.republish_next(_cfg(), q, root, today=dt.date(2026, 11, 11), dry_run=False,
                                     send=api, env=ENV, sleep=lambda s: None)
            self.assertIn("쉽니다", hold["note"])                                  # 비공개 대기 영상이 있으면 쉰다
            api.status_map = {"OA": ("public", 900), "OB": ("public", 3)}
            n0 = api.uploads
            out = yu.republish_next(_cfg(), q, root, today=dt.date(2026, 11, 11), dry_run=False, send=api, env=ENV,
                                    sleep=lambda s: None)
            self.assertEqual([r["status"] for r in out["results"]], ["skipped", "uploaded"])   # a 는 살아남음 → b 를 올림
            self.assertEqual(api.uploads, n0 + 1)
            self.assertTrue(yu.republished(yu.read_record(b)))
            api.status_map["VID123"] = ("public", 0)
            done = yu.republish_next(_cfg(), q, root, today=dt.date(2026, 11, 20), dry_run=False, send=api, env=ENV,
                                     sleep=lambda s: None)
            self.assertEqual([r["status"] for r in done["results"]], ["skipped"])          # a 는 여전히 건너뜀, b 는 끝
            self.assertEqual(api.uploads, n0 + 1)

    def test_auto_push_skips_morning_queue(self) -> None:
        """아침 업로드 대기열(config/daily.json) 편은 병합 push 에서 올리지 않는다(2026-11-08 사용자 "아침 7시")."""
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), name="32-radar", slug="radar")
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, auto=True,
                                     morning={32})
            self.assertEqual(res["status"], "skipped")
            self.assertIn("아침 업로드 대기열", res["warnings"][0])
            self.assertEqual(api.calls, [])
            self.assertEqual(yu.process_episode(ep, _cfg(), dry_run=True, morning={32})["status"], "dry-run")   # 수동·아침은 올림
        self.assertIn(32, yu.morning_numbers())                                  # 저장소 설정을 읽는다

    def test_daily_next_recent_upload_guard(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep = _episode(root, name="32-radar", slug="radar")
            yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)   # 방금 올림
            _episode(root, name="28-tides", slug="tides")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"order": [{"number": 28, "topic": "조석"}]}), encoding="utf-8")
            n0 = api.uploads
            out = yu.daily_next(_cfg(), daily, root / "none.json", root, today=dt.date(2026, 11, 9), dry_run=False,
                                send=api, env=ENV)
            self.assertIn("6시간", out["note"])                        # 예비 실행은 쉰다
            self.assertEqual(api.uploads, n0)

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_daily_next_new_first_then_hold_then_republish(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            old = _episode(root, name="06-a", slug="a")
            yu.process_episode(old, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            r = yu.read_record(old)
            r.video_id, r.uploaded_at = "OA", "2026-11-01T10:00:00+00:00"       # 보류 창 밖
            yu.write_record(old, r)
            second = _episode(root, name="28-tides", slug="tides")
            first = _episode(root, name="32-radar", slug="radar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 3,
                                         "order": [{"number": 32, "topic": "레이더"}, {"number": 28, "topic": "조석"},
                                                   {"number": 33, "topic": "SAR"}]}), encoding="utf-8")
            rq = root / "republish.json"
            rq.write_text(json.dumps({"start": "2026-11-11", "min_views": 50, "hold_if_private_within_days": 3,
                                      "queue": [old.relative_to(yu.REPO).as_posix()]}), encoding="utf-8")
            self.assertEqual(yu.morning_dirs(json.loads(daily.read_text(encoding="utf-8")), root), [first, second])
            dry = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 9), dry_run=True)
            self.assertEqual((dry["kind"], dry["results"][0]["status"]), ("new", "dry-run"))
            self.assertEqual(api.uploads, 1)
            api.status_map = {"OA": ("public", 3)}
            n0 = api.uploads
            out = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 9), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None)
            self.assertEqual((out["kind"], out["results"][0]["dir"], out["results"][0]["status"]),
                             ("new", yu._rel(first), "uploaded"))                 # 순서대로 32 먼저, 한 편만
            self.assertEqual(api.uploads, n0 + 1)
            self.assertIn("대기 1편 더", out["note"])
            rec = yu.read_record(first)
            rec.uploaded_at = "2026-11-08T21:40:00+00:00"                          # 11-09 06:40 KST
            yu.write_record(first, rec)
            api.status_map[rec.video_id] = ("private", 0)
            hold = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 10), dry_run=False, send=api, env=ENV)
            self.assertIn("쉽니다", hold["note"])                                   # 사용자가 아직 공개하지 않음
            self.assertEqual(api.uploads, n0 + 1)
            api.status_map[rec.video_id] = ("public", 0)
            nxt = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 10), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None)
            self.assertEqual(nxt["results"][0]["dir"], yu._rel(second))
            rec2 = yu.read_record(second)
            rec2.uploaded_at = "2026-11-09T21:40:00+00:00"
            yu.write_record(second, rec2)
            api.status_map[rec2.video_id] = ("public", 0)
            n1 = api.uploads
            rep = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 11), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None)
            self.assertEqual((rep["kind"], rep["results"][0]["status"]), ("republish", "uploaded"))   # 새 편이 없으면 다시 올리기
            self.assertTrue(yu.republished(yu.read_record(old)))
            self.assertEqual(api.uploads, n1 + 1)

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_daily_next_hold_zero_uploads_even_if_private(self) -> None:
        """2026-11-11 사용자: "비공개가 있어도 예정된 스케줄의 영상들을 올리도록 해" — hold 0 이면 비공개가 있어도 다음 편을 올린다."""
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            first = _episode(root, name="32-radar", slug="radar")
            second = _episode(root, name="28-tides", slug="tides")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0,
                                         "order": [{"number": 32, "topic": "레이더"}, {"number": 28, "topic": "조석"}]}), encoding="utf-8")
            rq = root / "republish.json"
            rq.write_text(json.dumps({"start": "2026-11-11", "min_views": 50, "hold_if_private_within_days": 0, "queue": []}), encoding="utf-8")
            out = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 10), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(out["results"][0]["dir"], yu._rel(first))
            rec = yu.read_record(first)
            rec.uploaded_at = "2026-11-09T21:40:00+00:00"
            yu.write_record(first, rec)
            api.status_map = {rec.video_id: ("private", 0)}                     # 아직 비공개 — 그래도 쉬지 않는다
            n0 = api.uploads
            nxt = yu.daily_next(_cfg(), daily, rq, root, today=dt.date(2026, 11, 10), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual((nxt["kind"], nxt["results"][0]["dir"], nxt["results"][0]["status"]), ("new", yu._rel(second), "uploaded"))
            self.assertEqual(api.uploads, n0 + 1)

    def test_repo_hold_is_off(self) -> None:
        """설정의 비공개 보류는 꺼져 있다(2026-11-11 사용자 결정)."""
        self.assertEqual(int(yu.load_daily().get("hold_if_private_within_days", 3)), 0)
        rc = json.loads((yu.REPO / "config" / "republish.json").read_text(encoding="utf-8"))
        self.assertEqual(int(rc.get("hold_if_private_within_days", 3)), 0)

    def test_repo_daily_queue_is_valid(self) -> None:
        daily = yu.load_daily()
        nums = [o["number"] for o in daily["order"]]
        self.assertEqual(len(nums), len(set(nums)))
        self.assertNotIn(26, nums)                                              # 사용자 "26은 보류"
        backlog = (yu.REPO / "docs" / "TOPIC_BACKLOG.md").read_text(encoding="utf-8")
        for o in daily["order"]:
            self.assertIn(f"| {o['number']} | {o['topic']} |", backlog)          # 사용자 문구 그대로

    def test_repo_republish_queue_is_valid(self) -> None:
        rc = json.loads((yu.REPO / "config" / "republish.json").read_text(encoding="utf-8"))
        self.assertEqual(len(rc["queue"]), len(set(rc["queue"])))
        self.assertNotIn("finals/01-gravitational-waves", rc["queue"])     # 옛 판이 살아 있음
        for q in rc["queue"]:
            d = yu.REPO / q
            self.assertTrue((d / "upload.md").is_file(), q)
            meta = yu.build_metadata(yu.load_episode(d, caption=False), yu.load_config())
            self.assertEqual(yu.validate_metadata(meta), [], q)

    def test_thumbnail_reapply_refuses_other_channel(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, _cfg(), dry_run=False, send=FakeApi(), env=ENV, sleep=lambda s: None)
            rec = yu.read_record(ep)
            rec.thumbnail_after_processing = None
            yu.write_record(ep, rec)
            other = FakeApi(channel_id="UC_OTHER")
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=other, env=ENV, sleep=lambda s: None)
            self.assertEqual(res["status"], "skipped")
            self.assertNotIn("thumbnail", other.calls)
            self.assertTrue(any("다시 지정 못 함" in w for w in res["warnings"]))

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


def _republish_cfg(root: Path, *queue: Path, **extra) -> Path:
    q = root / "republish.json"
    body = {"start": "2026-11-11", "min_views": 100, "hold_if_private_within_days": 0, "alternate_with_new": True,
            "queue": [p.relative_to(yu.REPO).as_posix() for p in queue]}
    body.update(extra)
    q.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    return q


def _set_uploaded_at(ep: Path, when: str) -> yu.Record:
    rec = yu.read_record(ep)
    rec.uploaded_at = when
    yu.write_record(ep, rec)
    return rec


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class PrivatizeTest(unittest.TestCase):
    """2026-11-12 사용자: "권한을 너한테 주면 되잖아" — 다시 올린 편의 옛 판을 공개 → 비공개로만 돌린다."""

    def test_set_private_sends_literal_private_and_preserves_status(self) -> None:
        api = FakeApi()
        api.video("OLD1", "public", 7)
        out = yu.set_private(api, "AT", _cfg(channel_id="UC1"), "OLD1", max_views=100)
        self.assertEqual((out["result"], out["views"]), ("privatized", 7))
        self.assertEqual(api.calls, ["full", "update"])
        body = api.updates[0]
        self.assertEqual(body["id"], "OLD1")
        self.assertEqual(body["status"]["privacyStatus"], "private")            # 문자 그대로 "private"
        self.assertEqual({k: body["status"][k] for k in ("embeddable", "license", "publicStatsViewable")},
                         {"embeddable": False, "license": "creativeCommon", "publicStatsViewable": False})  # 지금 값 그대로
        for k in ("publishAt", "selfDeclaredMadeForKids", "containsSyntheticMedia", "madeForKids", "uploadStatus"):
            self.assertNotIn(k, body["status"])                                 # 예외 필드·읽기 전용·예약 공개는 보내지 않는다
        self.assertEqual(set(body), {"id", "status"})

    def test_set_private_guards(self) -> None:
        cfg = _cfg(channel_id="UC1")
        api = FakeApi()
        api.video("OTHER", "public", 3, channel="UC_OTHER")
        with self.assertRaises(yu.PrivatizeRefused):
            yu.set_private(api, "AT", cfg, "OTHER", max_views=100)              # 다른 채널 영상
        api.video("BIG", "public", 100)
        with self.assertRaisesRegex(yu.PrivatizeRefused, "100회"):
            yu.set_private(api, "AT", cfg, "BIG", max_views=100)                # 노출을 받은 영상은 숨기지 않는다
        api.video("PRIV", "private", 2)
        self.assertEqual(yu.set_private(api, "AT", cfg, "PRIV", max_views=100)["result"], "already-private")
        self.assertEqual(yu.set_private(api, "AT", cfg, "GONE", max_views=100)["result"], "not-found")
        self.assertEqual(api.updates, [])                                       # 어느 경우도 update 를 부르지 않았다
        n = len(api.calls)
        with self.assertRaisesRegex(yu.UploadError, "channel_id"):
            yu.set_private(api, "AT", _cfg(), "OLD1", max_views=100)            # 채널 잠금이 없으면 네트워크 전에 거절
        self.assertEqual(len(api.calls), n)
        api.update_fail = 403
        api.video("OLD1", "public", 3)
        with self.assertRaises(yu.ScopeError):
            yu.set_private(api, "AT", cfg, "OLD1", max_views=100)

    def test_no_public_or_delete_path_in_code(self) -> None:
        src = (yu.REPO / "publish" / "youtube.py").read_text(encoding="utf-8")
        self.assertNotIn('"DELETE"', src)
        self.assertNotRegex(src, r'privacyStatus"\s*:\s*"(public|unlisted)"')
        self.assertNotRegex(src, r'status\["privacyStatus"\]\s*=\s*(?!\s|PRIVATE\b)')

    def test_republish_privatizes_previous_after_upload(self) -> None:
        api = FakeApi()
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            old = yu.read_record(ep)
            old.video_id, old.url = "OLD1", "https://youtu.be/OLD1"
            yu.write_record(ep, old)
            api.video("OLD1", "public", 7)
            res = yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True)
            self.assertEqual(res["status"], "uploaded", res)
            self.assertEqual(res["privatize"]["result"], "privatized")
            self.assertLess(api.calls.index("put"), api.calls.index("update"))  # 새 판이 올라간 뒤에만
            prev = yu.read_record(ep).previous[0]
            self.assertEqual(prev["video_id"], "OLD1")
            self.assertTrue(prev["privatized_at"])
            self.assertNotIn("privatize_error", prev)
            self.assertEqual(api.status_map["OLD1"][0], "private")

    def test_republish_403_keeps_upload_and_warns(self) -> None:
        api = FakeApi()
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            old = yu.read_record(ep)
            old.video_id = "OLD1"
            yu.write_record(ep, old)
            api.video("OLD1", "public", 7)
            api.update_fail = 403
            res = yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True)
            self.assertEqual(res["status"], "uploaded")
            self.assertEqual(res["privatize"]["result"], "no-scope")
            self.assertTrue(any(w.startswith(yu.PRIVATIZE_HINT) for w in res["warnings"]), res["warnings"])
            rec = yu.read_record(ep)
            self.assertEqual(rec.video_id, "VID123")
            self.assertIn("insufficientPermissions", rec.previous[0]["privatize_error"])
            self.assertNotIn("privatized_at", rec.previous[0])
            self.assertNotIn("AT", rec.previous[0]["privatize_error"].split())   # 토큰 값이 기록에 없다

    def test_previous_ids_for_hand_uploaded_episode(self) -> None:
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory() as d:
            api = FakeApi()
            ep = _episode(Path(d))
            api.video("HAND1", "public", 150)
            res = yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True,
                                     republish_min_views=100, republish_previous_id="HAND1")
            self.assertEqual((res["status"], res["video_id"], res["previous_views"]), ("skipped", "HAND1", 150))
            self.assertEqual(api.uploads, 0)
            api.video("HAND1", "public", 9)
            res = yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True,
                                     republish_min_views=100, republish_previous_id="HAND1")
            self.assertEqual(res["status"], "uploaded")
            self.assertEqual(res["previous_video"], "https://youtu.be/HAND1")
            prev = yu.read_record(ep).previous[0]
            self.assertEqual((prev["video_id"], prev["views_at_republish"], prev["reason"]), ("HAND1", 9, "republish"))
            self.assertTrue(prev["privatized_at"])

    def test_republish_next_reads_previous_ids(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep = _episode(root, name="10-aurora", slug="aurora")
            q = _republish_cfg(root, ep, previous_ids={ep.relative_to(yu.REPO).as_posix(): "HAND1"})
            api.video("HAND1", "public", 6)
            out = yu.republish_next(_cfg(channel_id="UC1"), q, root, today=dt.date(2026, 11, 12), dry_run=False,
                                    send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(out["results"][0]["status"], "uploaded")
            self.assertEqual(yu.read_record(ep).previous[0]["video_id"], "HAND1")
            self.assertEqual(api.updates[0]["id"], "HAND1")

    def test_catch_up_pass_self_heals_after_token_update(self) -> None:
        cfg = _cfg(channel_id="UC1")
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            a = _episode(root, name="06-a", slug="a")
            b = _episode(root, name="07-b", slug="b")
            for ep in (a, b):
                yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)
                rec = yu.read_record(ep)
                rec.previous = [{"video_id": f"OLD_{ep.name}", "reason": "republish", "privatize_error": "403"}]
                yu.write_record(ep, rec)
                api.video(f"OLD_{ep.name}", "public", 5)
            only = _episode(root, name="01-gw", slug="gw")
            yu.process_episode(only, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            rel = only.relative_to(yu.REPO).as_posix()
            api.video("VID123", "public", 3)                                    # 01 새 판(지금 기록의 판)
            api.video("KEEP", "public", 654)
            q = _republish_cfg(root, privatize_only=[{"video_id": "VID123", "episode": rel}, {"video_id": "KEEP", "episode": rel}],
                               never_privatize=["KEEP"])
            n = len(api.calls)
            dry = yu.privatize_pending(cfg, q, root, dry_run=True, send=api, env=ENV)
            self.assertEqual(len(dry["items"]), 4)
            self.assertEqual(len(api.calls), n)                                 # dry-run 은 목록만(네트워크 없음)
            api.update_fail = 403
            first = yu.privatize_pending(cfg, q, root, dry_run=False, send=api, env=ENV)
            self.assertEqual(len(first["warnings"]), 1)                         # 범위 부족이면 경고 한 줄로 조용히 건너뜀
            self.assertIn("youtube.force-ssl", first["warnings"][0])
            self.assertEqual(len(api.updates), 1)                               # 첫 시도 뒤 멈춤
            api.update_fail = None
            second = yu.privatize_pending(cfg, q, root, dry_run=False, send=api, env=ENV)
            res = {(it["video_id"], it["result"]) for it in second["items"]}
            self.assertEqual(res, {("OLD_06-a", "privatized"), ("OLD_07-b", "privatized"), ("VID123", "privatized"),
                                   ("KEEP", "refused")})
            self.assertNotIn("KEEP", [u["id"] for u in api.updates])            # 보호 목록은 부르지도 않는다
            self.assertEqual(api.status_map["KEEP"][0], "public")
            self.assertTrue(yu.read_record(a).previous[0]["privatized_at"])
            self.assertNotIn("privatize_error", yu.read_record(a).previous[0])
            rec = yu.read_record(only)
            self.assertTrue(rec.privatized_at)
            self.assertTrue(any(p.get("video_id") == "KEEP" and p.get("privatize_refused") for p in rec.previous))
            calls = len(api.calls)
            third = yu.privatize_pending(cfg, q, root, dry_run=False, send=api, env=ENV)
            self.assertEqual((third["items"], len(api.calls)), ([], calls))      # 다 끝나면 네트워크도 쓰지 않는다

    def test_catch_up_failure_never_blocks_daily_upload(self) -> None:
        api = FakeApi()
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d, mock.patch.object(yu, "RECENT_HOURS", 0):
            root = Path(d)
            a = _episode(root, name="06-a", slug="a")
            yu.process_episode(a, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            rec = _set_uploaded_at(a, "2026-11-01T00:00:00+00:00")
            rec.previous = [{"video_id": "OLDA", "reason": "republish"}]
            yu.write_record(a, rec)
            api.video("OLDA", "public", 5)
            api.update_fail = 403
            new = _episode(root, name="32-radar", slug="radar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 32, "topic": "레이더"}]}),
                             encoding="utf-8")
            q = _republish_cfg(root)
            out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 12), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None)
            self.assertTrue(out["ok"])
            self.assertEqual((out["kind"], out["results"][0]["dir"], out["results"][0]["status"]), ("new", yu._rel(new), "uploaded"))
            self.assertEqual(len(out["warnings"]), 1)
            self.assertIn("youtube.force-ssl", out["warnings"][0])


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class AlternateTest(unittest.TestCase):
    """2026-11-12 사용자 "하루씩 번갈아": 새 편 → 다시 올리기 → 새 편 … 하루 한 편."""

    def test_last_upload_kind(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            self.assertEqual(yu.last_upload_kind(root), "republish")           # 기록 없음 → 새 편부터
            a = _episode(root, name="06-a", slug="a")
            b = _episode(root, name="32-b", slug="b")
            for ep in (a, b):
                yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            _set_uploaded_at(a, "2026-11-10T00:00:00+00:00")
            _set_uploaded_at(b, "2026-11-11T00:00:00+00:00")
            self.assertEqual(yu.last_upload_kind(root), "new")
            rec = _set_uploaded_at(a, "2026-11-12T00:00:00+00:00")
            rec.previous = [{"video_id": "X", "reason": "republish"}]
            yu.write_record(a, rec)
            self.assertEqual(yu.last_upload_kind(root), "republish")

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_daily_alternates_and_falls_back(self) -> None:
        api = FakeApi()
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            old = _episode(root, name="06-a", slug="a")
            big = _episode(root, name="07-big", slug="big")
            for ep, vid in ((old, "OA"), (big, "OBIG")):
                yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)
                rec = _set_uploaded_at(ep, "2026-11-07T07:00:00+00:00")
                rec.video_id = vid
                yu.write_record(ep, rec)
            api.video("OA", "public", 3)
            api.video("OBIG", "public", 500)                                    # 노출을 받음 → 다시 올리지 않음
            first = _episode(root, name="32-radar", slug="radar")
            second = _episode(root, name="33-sar", slug="sar")
            third = _episode(root, name="38-sub", slug="sub")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [
                {"number": 32, "topic": "레이더"}, {"number": 33, "topic": "SAR"}, {"number": 38, "topic": "잠수함"}]}),
                encoding="utf-8")
            q = _republish_cfg(root, big, old)

            dry = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 12), dry_run=True)
            self.assertEqual(dry["kind"], "republish")                          # 마지막 업로드(06·07 첫 판)가 새 편
            self.assertIn("다시 올리기 차례", dry["note"])

            n0 = api.uploads
            day1 = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 12), dry_run=False, send=api, env=ENV,
                                 sleep=lambda s: None)
            self.assertEqual(day1["kind"], "republish")
            self.assertEqual([r["status"] for r in day1["results"]], ["skipped", "uploaded"])   # 07 건너뛰고 06
            self.assertEqual(api.uploads, n0 + 1)
            self.assertTrue(yu.republished(yu.read_record(old)))
            self.assertEqual(api.status_map["OA"][0], "private")               # 옛 판 비공개
            _set_uploaded_at(old, "2026-11-11T22:00:00+00:00")

            dry2 = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=True)
            self.assertIn("새 편 차례", dry2["note"])
            day2 = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                 sleep=lambda s: None)
            self.assertEqual((day2["kind"], day2["results"][0]["dir"]), ("new", yu._rel(first)))
            self.assertEqual(api.uploads, n0 + 2)
            _set_uploaded_at(first, "2026-11-12T22:00:00+00:00")

            # 다시 올리기 차례지만 남은 07 은 기준 이상 → 같은 실행에서 새 편(33)을 올린다. 한 편만
            day3 = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 14), dry_run=False, send=api, env=ENV,
                                 sleep=lambda s: None)
            self.assertEqual(day3["kind"], "new")
            self.assertEqual([(r["dir"], r["status"]) for r in day3["results"]],
                             [(yu._rel(big), "skipped"), (yu._rel(second), "uploaded")])
            self.assertIn("기준 이상", day3["note"])
            self.assertEqual(api.uploads, n0 + 3)
            self.assertEqual(api.status_map["OBIG"][0], "public")              # 노출을 받은 옛 판은 그대로

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_only_one_kind_available(self) -> None:
        api = FakeApi()
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            new = _episode(root, name="32-radar", slug="radar")
            yu.process_episode(new, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None)   # 마지막 = 새 편
            nxt = _episode(root, name="33-sar", slug="sar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 32, "topic": "레이더"},
                                                                                       {"number": 33, "topic": "SAR"}]}),
                             encoding="utf-8")
            early = yu.daily_next(cfg, daily, _republish_cfg(root, start="2026-11-20"), root, today=dt.date(2026, 11, 12),
                                  dry_run=True)
            self.assertEqual(early["kind"], "new")                              # 다시 올리기 시작 전 → 새 편
            self.assertIn("시작 전", early["note"])
            empty = yu.daily_next(cfg, daily, _republish_cfg(root), root, today=dt.date(2026, 11, 12), dry_run=True)
            self.assertEqual(empty["kind"], "new")
            self.assertIn("대기열 끝", empty["note"])
            off = yu.daily_next(cfg, daily, _republish_cfg(root, new, alternate_with_new=False), root,
                                today=dt.date(2026, 11, 12), dry_run=True)
            self.assertEqual(off["kind"], "new")                               # 끄면 예전처럼 새 편 먼저
            self.assertNotIn("번갈아", off["note"])
            self.assertEqual(off["results"][0]["dir"], yu._rel(nxt))

    def test_repo_republish_config(self) -> None:
        rc = json.loads((yu.REPO / "config" / "republish.json").read_text(encoding="utf-8"))
        self.assertEqual(rc["min_views"], 100)                                  # 사용자 "조회수 100회 미만인 애들"
        self.assertIs(rc["alternate_with_new"], True)                           # 사용자 "하루씩 번갈아"
        for ep, vid in rc["previous_ids"].items():
            self.assertIn(ep, rc["queue"])
            self.assertIsNone(yu.read_record(yu.REPO / ep), ep)                  # 기록이 없는 손으로 올린 편에만
            self.assertRegex(vid, r"^[A-Za-z0-9_-]{11}$")
        self.assertIn("GMkRzXt78TI", rc["never_privatize"])
        only = [o["video_id"] for o in rc["privatize_only"]]
        self.assertEqual(only, ["3n4MJZM6trk"])
        self.assertNotIn("GMkRzXt78TI", only + list(rc["previous_ids"].values()))
        targets = yu.privatize_targets(rc, yu.DEFAULT_FINALS)
        self.assertNotIn("GMkRzXt78TI", [t["video_id"] for t in targets])
        self.assertEqual(yu.load_config().privacy_status, "private")


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
        self.assertIn("youtube.readonly", q["scope"])
        self.assertIn("yt-analytics.readonly", q["scope"])          # 주간 채널 보고서(읽기 전용)
        self.assertNotIn("yt-analytics-monetary", q["scope"])
        # 2026-11-12 사용자 "권한을 너한테 주면 되잖아": 옛 판 비공개 전환용 youtube.force-ssl 만 더한다. 더 넓은 범위는 요청하지 않는다
        self.assertIn("youtube.force-ssl", q["scope"])
        for broad in ("auth%2Fyoutube+", "auth%2Fyoutube%20", "youtubepartner"):
            self.assertNotIn(broad, q["scope"])
        self.assertFalse(q["scope"].endswith("auth%2Fyoutube"))

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
