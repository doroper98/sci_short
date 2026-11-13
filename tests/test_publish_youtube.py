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

    def video(self, vid: str, privacy: str, views: int, *, channel: str = "UC1", published: str = "2026-11-01T00:00:00Z") -> None:
        """조회수 확인(status_map)과 비공개 전환·48시간 점검(videos) 양쪽에 같은 영상을 둔다."""
        self.status_map[vid] = (privacy, views)
        self.videos[vid] = {"id": vid, "snippet": {"channelId": channel, "title": "옛 판", "publishedAt": published},
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

    def _changed_after_upload(self, root: Path, api: FakeApi, **kw) -> tuple[Path, bytes]:
        ep = _episode(root, **kw)
        yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
        next(ep.glob("*.mp4")).write_bytes(b"\2" * 2000)                       # 첫 화면을 고쳐 다시 렌더한 편
        return ep, (ep / yu.RECORD_NAME).read_bytes()

    def test_changed_video_pending_republish_is_skipped_not_error(self) -> None:
        """대기열(config/republish.json queue)의 편은 파일이 바뀌어도 거절하지 않고 아침 다시 올리기에 맡긴다(2026-11-13)."""
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep, rec_before = self._changed_after_upload(root, api)
            q = _republish_cfg(root, ep)
            n = len(api.calls)
            for dry in (True, False):
                for auto in (False, True):
                    res = yu.process_episode(ep, _cfg(auto_from_number=1), dry_run=dry, send=api, env=ENV,
                                             sleep=lambda s: None, auto=auto, morning=set(), republish_path=q)
                    self.assertEqual(res["status"], "skipped", res)
                    self.assertEqual(res["video_id"], "VID123")
                    self.assertTrue(any("다시 올리기" in w and "md5" in w for w in res["warnings"]), res["warnings"])
            self.assertEqual(len(api.calls), n)                                 # 네트워크 호출 없음
            self.assertEqual((ep / yu.RECORD_NAME).read_bytes(), rec_before)    # 기록 그대로

    def test_changed_video_not_pending_is_still_refused(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep, _ = self._changed_after_upload(root, api)
            other = _episode(root, name="02-other", slug="other")
            for q in (_republish_cfg(root, other), root / "missing.json"):  # 대기열에 없음 · 설정 없음
                res = yu.process_episode(ep, _cfg(), dry_run=True, env={}, republish_path=q)
                self.assertEqual(res["status"], "error")
                self.assertIn("allow-reupload", res["error"])
            (root / "broken.json").write_text("{", encoding="utf-8")            # 읽지 못하는 설정도 대기 아님
            res = yu.process_episode(ep, _cfg(), dry_run=True, env={}, republish_path=root / "broken.json")
            self.assertIn("allow-reupload", res["error"])

    def test_changed_video_already_republished_is_refused(self) -> None:
        """대기열에 있어도 이미 다시 올린 편(대기열에서 끝남)은 대기 중이 아니다."""
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep, _ = self._changed_after_upload(root, api)
            rec = yu.read_record(ep)
            rec.previous = [{"video_id": "OLD0", "reason": "republish"}]
            yu.write_record(ep, rec)
            res = yu.process_episode(ep, _cfg(), dry_run=True, env={}, republish_path=_republish_cfg(root, ep))
            self.assertIn("allow-reupload", res["error"])

    def test_changed_video_flagged_by_sweep_is_skipped(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep, _ = self._changed_after_upload(root, api)
            rec = yu.read_record(ep)
            rec.sweep = {"action": "flagged", "checked_at": "2026-11-13T00:00:00+00:00"}
            yu.write_record(ep, rec)
            rec_before = (ep / yu.RECORD_NAME).read_bytes()
            q = _republish_cfg(root)                                            # 대기열은 비어 있음
            n = len(api.calls)
            for dry in (True, False):
                res = yu.process_episode(ep, _cfg(), dry_run=dry, send=api, env=ENV, sleep=lambda s: None, republish_path=q)
                self.assertEqual(res["status"], "skipped", res)
                self.assertTrue(any("다시 올리기 대기" in w for w in res["warnings"]))
            self.assertEqual(len(api.calls), n)
            self.assertEqual((ep / yu.RECORD_NAME).read_bytes(), rec_before)

    def test_changed_video_pending_republish_true_uploads_new_video(self) -> None:
        api = FakeApi()
        cfg = _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep, _ = self._changed_after_upload(root, api)
            api.video("VID123", "public", 3)
            q = _republish_cfg(root, ep)
            res = yu.process_episode(ep, cfg, dry_run=True, env={}, republish=True, republish_path=q)
            self.assertEqual(res["status"], "dry-run")
            uploads = api.uploads
            res = yu.process_episode(ep, cfg, dry_run=False, send=api, env=ENV, sleep=lambda s: None, republish=True,
                                     republish_path=q)
            self.assertEqual(res["status"], "uploaded", res)
            self.assertTrue(res["republish"])
            self.assertEqual(api.uploads, uploads + 1)
            self.assertEqual(yu.read_record(ep).previous[0]["video_id"], "VID123")

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
        self.assertEqual(rc["min_views"], 50)                                   # 2026-11-13 사용자 "조회수 50회 미만인 애들"(전에는 100)
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


NOW = dt.datetime(2026, 11, 13, 0, 0, tzinfo=dt.timezone.utc)
SWEEP = {"enabled": True, "min_age_hours": 48, "max_republish": 2}


def _iso(t: dt.datetime) -> str:
    return t.isoformat(timespec="seconds").replace("+00:00", "Z")


def _ago(hours: float) -> dt.datetime:
    return NOW - dt.timedelta(hours=hours)


def _record(ep: Path, vid: str, *, uploaded: dt.datetime, previous: list | None = None, sweep: dict | None = None) -> yu.Record:
    rec = yu.Record(video_id=vid, url=yu.WATCH_URL_PREFIX + vid, studio_url=yu.STUDIO_URL.format(video_id=vid),
                    uploaded_at=uploaded.isoformat(timespec="seconds"), privacy_status="private", channel_id="UC1",
                    channel_title="과학 채널", video_file="v.mp4", video_bytes=1000, video_md5="x", title="t",
                    description_bytes=1, contains_synthetic_media=True, made_for_kids=False,
                    previous=list(previous or []), sweep=sweep)
    yu.write_record(ep, rec)
    return rec


def _rel_repo(p: Path) -> str:
    return p.relative_to(yu.REPO).as_posix()


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class SweepTest(unittest.TestCase):
    """2026-11-13 사용자: "업로드 48시간 지났는데 조회수 50회 미만인 애들은 비공개로 바꾸고 업로드 일정에 다시 넣어서 재업로드"."""

    def _public(self, api: FakeApi, ep: Path, vid: str, views: int, hours: float, **kw) -> None:
        """hours 시간 전에 공개된 영상(기록의 업로드 시각은 그보다 1시간 앞 — publishedAt 이 공개 시각으로 읽힌다)."""
        _record(ep, vid, uploaded=_ago(hours + 1), **{k: kw.pop(k) for k in ("previous", "sweep") if k in kw})
        api.video(vid, kw.pop("privacy", "public"), views, published=_iso(_ago(hours)), **kw)

    def test_sweep_decisions(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep = {n: _episode(root, name=n, slug=n[3:]) for n in
                  ("02-young", "03-priv", "04-other", "05-ok", "06-low", "07-keep", "08-gone", "09-only", "10-hand")}
            self._public(api, ep["02-young"], "YOUNG", 3, 30)                    # 48시간 전
            self._public(api, ep["03-priv"], "PRIV", 0, 100, privacy="private")  # 아직 공개 전
            self._public(api, ep["04-other"], "OTHER", 2, 100, channel="UC_OTHER")
            self._public(api, ep["05-ok"], "OK", 50, 100)                       # 기준과 같으면 통과
            self._public(api, ep["06-low"], "LOW", 49, 100)
            self._public(api, ep["07-keep"], "KEEP", 3, 100)
            _record(ep["08-gone"], "GONE", uploaded=_ago(200))
            self._public(api, ep["09-only"], "ONLY", 3, 100)
            api.video("HAND1", "public", 4, published=_iso(_ago(300)))          # 기록 없는 편의 previous_ids
            q = _republish_cfg(root, ep["10-hand"], min_views=50, auto_sweep=SWEEP, never_privatize=["KEEP"],
                               privatize_only=[{"video_id": "ONLY", "episode": _rel_repo(ep["09-only"])}],
                               previous_ids={_rel_repo(ep["10-hand"]): "HAND1"})
            out = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            self.assertEqual({it["video_id"]: it["result"] for it in out["items"]},
                             {"YOUNG": "young", "PRIV": "not-public", "OTHER": "other-channel", "OK": "ok", "LOW": "flagged",
                              "GONE": "not-found", "HAND1": "flagged"})                # KEEP·ONLY 는 읽지도 않는다
            self.assertEqual(sorted(u["id"] for u in api.updates), ["HAND1", "LOW"])
            self.assertTrue(all(u["status"]["privacyStatus"] == "private" for u in api.updates))
            self.assertEqual((api.status_map["OTHER"][0], api.status_map["KEEP"][0], api.status_map["YOUNG"][0]),
                             ("public", "public", "public"))
            low = yu.read_record(ep["06-low"])
            self.assertEqual((low.sweep["action"], low.sweep["views"], low.sweep["age_hours"]), ("flagged", 49, 100.0))
            self.assertTrue(low.sweep["privatized_at"])
            self.assertEqual(low.privatized_at, low.sweep["privatized_at"])
            ok = yu.read_record(ep["05-ok"]).sweep
            self.assertEqual((ok["action"], ok["views"]), ("ok", 50))
            for n in ("02-young", "03-priv", "04-other", "08-gone", "07-keep"):
                self.assertIsNone(yu.read_record(ep[n]).sweep, n)
            self.assertIsNone(yu.read_record(ep["10-hand"]))                    # 기록 없는 편은 비공개만(기록을 만들지 않음)
            self.assertEqual(out["counts"]["flagged"], 2)
            self.assertIn(ep["06-low"], yu.republish_todo(json.loads(q.read_text(encoding="utf-8")), root))

            api.video("OK", "public", 10, published=_iso(_ago(100)))            # ok 는 한 번만 적고 다시 보지 않는다
            again = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW + dt.timedelta(hours=24))
            res2 = {it["video_id"]: it["result"] for it in again["items"]}
            self.assertNotIn("OK", res2)
            self.assertNotIn("LOW", res2)
            self.assertEqual((res2["YOUNG"], res2["HAND1"]), ("flagged", "not-public"))
            self.assertEqual(yu.read_record(ep["05-ok"]).sweep, ok)

    def test_ambiguous_published_at_counts_from_first_seen_public(self) -> None:
        """publishedAt 이 업로드 시각과 같으면(주인 토큰으로 읽을 때의 특례) 공개 시각을 모른다 — 처음 본 때부터 잰다."""
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep = _episode(root, name="28-tides", slug="tides")
            _record(ep, "T1", uploaded=_ago(100))
            api.video("T1", "public", 3, published=_iso(_ago(100)))
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            dry = yu.sweep_low_views(cfg, q, root, dry_run=True, send=api, env=ENV, now=NOW)
            self.assertEqual(dry["items"][0]["result"], "young")
            self.assertIsNone(yu.read_record(ep).sweep)                         # dry-run 은 쓰지 않는다
            first = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            self.assertEqual((first["items"][0]["result"], first["items"][0]["age_from"]), ("young", "public_seen_at"))
            self.assertEqual(yu.read_record(ep).sweep, {"action": "watching", "public_seen_at": NOW.isoformat(timespec="seconds"),
                                                        "published_at": _iso(_ago(100))})
            mid = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW + dt.timedelta(hours=47))
            self.assertEqual(mid["items"][0]["result"], "young")
            self.assertEqual(api.updates, [])
            late = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW + dt.timedelta(hours=49))
            self.assertEqual(late["items"][0]["result"], "flagged")
            sw = yu.read_record(ep).sweep
            self.assertEqual((sw["action"], sw["age_hours"], sw["public_seen_at"]), ("flagged", 49.0, NOW.isoformat(timespec="seconds")))

    def test_403_flags_and_pending_pass_retries(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            a = _episode(root, name="06-a", slug="a")
            b = _episode(root, name="07-b", slug="b")
            self._public(api, a, "LA", 3, 60)
            self._public(api, b, "LB", 8, 60)
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            api.update_fail = 403
            out = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            self.assertEqual([it["result"] for it in out["items"]], ["flagged", "flagged"])
            self.assertEqual(len(api.updates), 1)                               # 첫 403 뒤로는 시도하지 않는다
            self.assertTrue(any("youtube.force-ssl" in w for w in out["warnings"]), out["warnings"])
            for ep in (a, b):
                rec = yu.read_record(ep)
                self.assertEqual(rec.sweep["action"], "flagged")
                self.assertIn("insufficientPermissions", rec.sweep["privatize_error"])
                self.assertNotIn("privatized_at", rec.sweep)
                self.assertIsNone(rec.privatized_at)
            rc = json.loads(q.read_text(encoding="utf-8"))
            self.assertEqual([(t["video_id"], t["kind"]) for t in yu.privatize_targets(rc, root)], [("LA", "sweep"), ("LB", "sweep")])
            self.assertEqual(yu.republish_todo(rc, root), [a, b])               # 비공개 전환이 밀려도 다시 올리기 대상
            api.update_fail = None
            pend = yu.privatize_pending(cfg, q, root, dry_run=False, send=api, env=ENV)
            self.assertEqual([(it["video_id"], it["result"]) for it in pend["items"]], [("LA", "privatized"), ("LB", "privatized")])
            for ep in (a, b):
                rec = yu.read_record(ep)
                self.assertTrue(rec.sweep["privatized_at"])
                self.assertNotIn("privatize_error", rec.sweep)
                self.assertEqual(rec.privatized_at, rec.sweep["privatized_at"])
            self.assertEqual(yu.privatize_targets(rc, root), [])

    def test_exhausted_at_cap_stays_public(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            twice = _episode(root, name="06-a", slug="a")
            once = _episode(root, name="07-b", slug="b")
            rep = {"reason": "republish", "privatized_at": "2026-11-01T00:00:00+00:00"}
            self._public(api, twice, "T2", 5, 60, previous=[{**rep, "video_id": "P2"}, {**rep, "video_id": "P1"}])
            self._public(api, once, "O1", 5, 60, previous=[{**rep, "video_id": "P0"}])
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            out = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            self.assertEqual({it["video_id"]: it["result"] for it in out["items"]}, {"T2": "exhausted", "O1": "flagged"})
            self.assertEqual([u["id"] for u in api.updates], ["O1"])
            self.assertEqual(api.status_map["T2"][0], "public")                 # 상한에 이른 편은 공개 그대로
            self.assertEqual(yu.read_record(twice).sweep["action"], "exhausted")
            self.assertEqual(yu.republish_todo(json.loads(q.read_text(encoding="utf-8")), root), [once])
            again = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW + dt.timedelta(hours=24))
            self.assertEqual(again["items"], [])                                # 판정은 한 번만

    def test_eligibility_manual_queue_first_then_flagged_by_check_time(self) -> None:
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            m1 = _episode(root, name="10-m1", slug="m1")                        # 기록 없는 대기열 편
            m2 = _episode(root, name="11-m2", slug="m2")
            _record(m2, "M2", uploaded=_ago(500), sweep={"action": "flagged", "checked_at": "2026-11-13T00:00:00+00:00"})
            m3 = _episode(root, name="12-m3", slug="m3")                        # 이미 다시 올림(대기열에서 끝)
            _record(m3, "M3", uploaded=_ago(10), previous=[{"video_id": "X", "reason": "republish"}])
            late = _episode(root, name="20-late", slug="late")
            _record(late, "L", uploaded=_ago(500), sweep={"action": "flagged", "checked_at": "2026-11-13T02:00:00+00:00"})
            early = _episode(root, name="21-early", slug="early")
            _record(early, "E", uploaded=_ago(500), previous=[{"video_id": "E0", "reason": "republish"}],
                    sweep={"action": "flagged", "checked_at": "2026-11-13T01:00:00+00:00"})   # 한 번 다시 올린 편도 다시
            capped = _episode(root, name="22-cap", slug="cap")
            _record(capped, "C", uploaded=_ago(500), previous=[{"video_id": "C1", "reason": "republish"}, {"video_id": "C0", "reason": "republish"}],
                    sweep={"action": "flagged", "checked_at": "2026-11-12T00:00:00+00:00"})
            refused = _episode(root, name="23-ref", slug="ref")
            _record(refused, "R", uploaded=_ago(500), sweep={"action": "flagged", "checked_at": "2026-11-12T00:00:00+00:00",
                                                              "privatize_refused": "조회수 60회 ≥ 50"})
            ok = _episode(root, name="24-ok", slug="ok")
            _record(ok, "K", uploaded=_ago(500), sweep={"action": "ok", "checked_at": "2026-11-12T00:00:00+00:00"})
            rc = {"start": "2026-11-11", "min_views": 50, "auto_sweep": SWEEP, "queue": [_rel_repo(p) for p in (m1, m2, m3)]}
            self.assertEqual(yu.republish_todo(rc, root), [m1, m2, early, late])
            self.assertEqual(yu.republish_available(rc, dt.date(2026, 11, 13), root), (True, ""))

    def test_second_republish_keeps_sweep_snapshot_and_stops_at_cap(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep = _episode(root, name="06-seasons", slug="seasons")
            self._public(api, ep, "V1", 4, 60, previous=[{"video_id": "V0", "reason": "republish", "views_at_republish": 4,
                                                          "privatized_at": "2026-11-12T21:00:00+00:00"}])
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            snap = yu.read_record(ep).sweep
            self.assertEqual(snap["action"], "flagged")
            out = yu.republish_next(cfg, q, root, today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual(out["results"][0]["status"], "uploaded", out)
            rec = yu.read_record(ep)
            self.assertEqual(rec.video_id, "VID123")
            self.assertIsNone(rec.sweep)                                         # 새 판은 점검 기록 없이 시작
            self.assertIsNone(rec.privatized_at)
            prev = rec.previous[0]
            self.assertEqual((prev["video_id"], prev["views_at_republish"], prev["reason"]), ("V1", 4, "republish"))
            self.assertEqual(prev["sweep"], snap)                               # 옛 판의 점검 기록이 남는다(전후 비교)
            self.assertEqual(prev["privatize_result"], "already-private")
            self.assertEqual(rec.previous[1]["video_id"], "V0")
            self.assertEqual(yu.republish_count(rec), 2)
            self.assertEqual(yu.republish_todo(json.loads(q.read_text(encoding="utf-8")), root), [])
            _set_uploaded_at(ep, NOW.isoformat(timespec="seconds"))
            api.video("VID123", "public", 6, published=_iso(NOW + dt.timedelta(hours=1)))
            n = len(api.updates)
            third = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW + dt.timedelta(hours=60))
            self.assertEqual(third["items"][0]["result"], "exhausted")          # 두 번 다시 올렸으면 더 숨기지 않는다
            self.assertEqual(len(api.updates), n)
            self.assertEqual(api.status_map["VID123"][0], "public")

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_daily_sweeps_first_and_republishes_flagged_same_morning(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            old = _episode(root, name="07-precession", slug="precession")
            _record(old, "OLD7", uploaded=dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc))
            api.video("OLD7", "public", 9, published="2026-11-01T02:00:00Z")
            new = _episode(root, name="32-radar", slug="radar")
            _record(new, "NEW32", uploaded=dt.datetime(2026, 11, 2, tzinfo=dt.timezone.utc))   # 마지막 업로드 = 새 편
            api.video("NEW32", "public", 5000, published="2026-11-02T02:00:00Z")
            nxt = _episode(root, name="33-sar", slug="sar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 33, "topic": "SAR"}]}), encoding="utf-8")
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV, sleep=lambda s: None)
            self.assertEqual((out["kind"], out["results"][0]["dir"], out["results"][0]["status"]), ("republish", yu._rel(old), "uploaded"))
            self.assertLess(api.calls.index("full"), api.calls.index("start"))  # 점검이 업로드보다 먼저
            self.assertEqual({it["video_id"]: it["result"] for it in out["sweep"]["items"]}, {"OLD7": "flagged", "NEW32": "ok"})
            self.assertEqual(yu.read_record(old).previous[0]["sweep"]["action"], "flagged")
            self.assertIsNone(yu.read_record(nxt))                               # 하루 한 편

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_sweep_failure_never_blocks_upload(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            new = _episode(root, name="32-radar", slug="radar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 32, "topic": "레이더"}]}), encoding="utf-8")
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            with mock.patch.object(yu, "sweep_low_views", side_effect=RuntimeError("점검 고장")):
                out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                    sleep=lambda s: None)
            self.assertTrue(out["ok"])
            self.assertEqual((out["kind"], out["results"][0]["dir"], out["results"][0]["status"]), ("new", yu._rel(new), "uploaded"))
            self.assertTrue(any(w.startswith(yu.SWEEP_WARN) and "점검 고장" in w for w in out["warnings"]), out["warnings"])

            def broken(method: str, url: str, headers: dict, data: bytes | None) -> yu.Response:   # 점검 읽기만 500
                if url.startswith(yu.VIDEOS_URL) and method == "GET" and "part=snippet" in url:
                    return yu.Response(500, {}, b"{}")
                return api(method, url, headers, data)
            other = _episode(root, name="33-sar", slug="sar")
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 33, "topic": "SAR"}]}), encoding="utf-8")
            _set_uploaded_at(new, "2026-11-01T00:00:00+00:00")
            out2 = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 14), dry_run=False, send=broken, env=ENV,
                                 sleep=lambda s: None)
            self.assertEqual((out2["results"][0]["dir"], out2["results"][0]["status"]), (yu._rel(other), "uploaded"))
            self.assertTrue(any(w.startswith(yu.SWEEP_WARN) for w in out2["warnings"]))

    def test_dry_run_writes_nothing(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            low = _episode(root, name="06-a", slug="a")
            self._public(api, low, "LA", 3, 60)
            amb = _episode(root, name="07-b", slug="b")
            _record(amb, "LB", uploaded=_ago(60))
            api.video("LB", "public", 3, published=_iso(_ago(60)))
            new = _episode(root, name="32-radar", slug="radar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 32, "topic": "레이더"}]}), encoding="utf-8")
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            before = {p: p.read_bytes() for p in root.glob("*/youtube_upload.json")}
            out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=True, send=api, env=ENV)
            self.assertEqual({it["video_id"]: (it["result"], it.get("privatize")) for it in out["sweep"]["items"]},
                             {"LA": ("flagged", "dry-run"), "LB": ("young", None)})
            self.assertIn("dry-run", out["sweep"]["note"])
            self.assertEqual(api.updates, [])
            self.assertNotIn("update", api.calls)
            self.assertEqual({p: p.read_bytes() for p in root.glob("*/youtube_upload.json")}, before)
            self.assertIsNone(yu.read_record(new))
            n = len(api.calls)
            nos = yu.sweep_low_views(cfg, q, root, dry_run=True, send=api, env={})
            self.assertIn("비밀값이 없어", nos["note"])
            self.assertEqual(len(api.calls), n)                                  # 비밀값이 없으면 네트워크도 없다

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_no_auto_sweep_means_no_sweep(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            low = _episode(root, name="06-a", slug="a")
            self._public(api, low, "LA", 3, 60)
            _episode(root, name="32-radar", slug="radar")
            daily = root / "daily.json"
            daily.write_text(json.dumps({"hold_if_private_within_days": 0, "order": [{"number": 32, "topic": "레이더"}]}), encoding="utf-8")
            for extra in ({}, {"auto_sweep": {**SWEEP, "enabled": False}}):
                q = _republish_cfg(root, min_views=50, **extra)
                out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=True, send=api, env=ENV)
                self.assertNotIn("full", api.calls)
                self.assertEqual(out.get("sweep", {}).get("items", []), [])
                off = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
                self.assertIn("꺼짐", off["note"])
            self.assertIsNone(yu.read_record(low).sweep)
            self.assertEqual(api.updates, [])

    def test_batches_of_fifty(self) -> None:
        api = FakeApi()
        ids = [f"V{i:03d}" for i in range(120)]
        for v in ids:
            api.video(v, "public", 1)
        got = yu.video_details(api, "AT", ids)
        self.assertEqual(len(got), 120)
        self.assertEqual(api.calls, ["full", "full", "full"])
        self.assertEqual(got["V007"], {"channel_id": "UC1", "published_at": "2026-11-01T00:00:00Z", "privacy": "public", "views": 1})

    def test_repo_sweep_config_and_validation(self) -> None:
        rc = json.loads((yu.REPO / "config" / "republish.json").read_text(encoding="utf-8"))
        self.assertEqual(yu.sweep_settings(rc), {"min_age_hours": 48.0, "max_republish": 2, "min_views": 50})
        self.assertIn("50회 미만", rc["_rules"])
        self.assertIn("사용자 결정이 아니다", rc["_rules"])                    # max_republish 는 제작 세션 제안
        self.assertIsNone(yu.sweep_settings({}))
        self.assertIsNone(yu.sweep_settings({"auto_sweep": {"enabled": False}}))
        for bad in ({"auto_sweep": []}, {"auto_sweep": {"enabled": "yes"}}, {"auto_sweep": {"enabled": True, "max_republish": -1}},
                    {"auto_sweep": {"enabled": True, "min_age_hours": 0}}, {"auto_sweep": {"enabled": True, "bogus": 1}},
                    {"auto_sweep": {"enabled": True}, "min_views": 0}, {"auto_sweep": {"enabled": True, "max_republish": True}}):
            with self.assertRaises(yu.UploadError, msg=str(bad)):
                yu.sweep_settings(bad)
        # 저장소 기록 중 privatize_only·never_privatize 영상은 점검 대상이 아니다(01 중력파는 사용자 결정 전까지 다시 올리지 않음)
        self.assertNotIn(yu.DEFAULT_FINALS / "01-gravitational-waves", yu.republish_todo(rc))


EVENING = {"enabled": True, "ready_by_kst": "18:00"}


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class EveningSlotTest(unittest.TestCase):
    """2026-11-13 사용자 "저녁에도 한편 더 올리자." — 아침 새 편, 저녁 다시 올리기 한 편(자리 배정은 제작 세션의 제안)."""

    def _setup(self, root: Path, api: FakeApi, *, evening: dict | None = EVENING, queue_old: bool = True, **rq) -> tuple:
        old = _episode(root, name="06-a", slug="a")                              # 노출을 못 받은 옛 편(다시 올리기 대상)
        _record(old, "OA", uploaded=dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc))
        api.video("OA", "public", 3, published="2026-11-01T02:00:00Z")
        last = _episode(root, name="32-radar", slug="radar")                     # 마지막 업로드 = 새 편
        _record(last, "NEW32", uploaded=dt.datetime(2026, 11, 2, tzinfo=dt.timezone.utc))
        new = _episode(root, name="33-sar", slug="sar")                          # 만들어 두고 아직 안 올린 새 편
        body: dict = {"hold_if_private_within_days": 0, "order": [{"number": 33, "topic": "SAR"}]}
        if evening is not None:
            body["evening"] = evening
        daily = root / "daily.json"
        daily.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
        q = _republish_cfg(root, *((old,) if queue_old else ()), **rq)
        return old, new, daily, q

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_evening_uploads_republish_not_new(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            old, new, daily, q = self._setup(Path(d), api)
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, slot="evening")
            self.assertEqual((out["kind"], out["slot"]), ("republish", "evening"))
            self.assertEqual([(r["dir"], r["status"]) for r in out["results"]], [(yu._rel(old), "uploaded")])
            self.assertTrue(out["note"].startswith("저녁 다시 올리기 — "), out["note"])
            self.assertEqual(api.uploads, 1)
            self.assertTrue(yu.republished(yu.read_record(old)))
            self.assertIsNone(yu.read_record(new))                               # 새 편은 저녁에 올리지 않는다

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_evening_rests_when_nothing_to_republish(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            _, new, daily, q = self._setup(Path(d), api, queue_old=False)        # 대기열 비었고 점검 대상도 없음
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, slot="evening")
            self.assertTrue(out["ok"])
            self.assertEqual(out["counts"]["uploaded"], 0)
            self.assertEqual(out["slot"], "evening")
            self.assertIn("저녁은 쉽니다", out["note"])
            self.assertIn("대기열이 끝났습니다", out["note"])
            self.assertEqual(api.uploads, 0)
            self.assertNotIn("start", api.calls)
            self.assertIsNone(yu.read_record(new))                               # 새 편이 준비돼 있어도 올리지 않는다

    def test_evening_disabled_or_missing_rests(self) -> None:
        for evening in (None, {"enabled": False, "ready_by_kst": "18:00"}):
            api, cfg = FakeApi(), _cfg(channel_id="UC1")
            with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
                old, new, daily, q = self._setup(Path(d), api, evening=evening)
                out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                    sleep=lambda s: None, slot="evening")
                self.assertEqual((out["counts"]["uploaded"], out["results"], out["slot"]), (0, [], "evening"))
                self.assertIn("꺼짐", out["note"])
                self.assertEqual(api.calls, [])                                  # 네트워크도 쓰지 않는다
                self.assertIsNone(yu.read_record(new))
                self.assertFalse(yu.republished(yu.read_record(old)))

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_evening_does_not_sweep(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            _, _, daily, q = self._setup(root, api, queue_old=False, min_views=50, auto_sweep=SWEEP)
            low = _episode(root, name="07-low", slug="low")                      # 48시간 점검이면 걸릴 편
            _record(low, "LOW", uploaded=_ago(101))
            api.video("LOW", "public", 3, published=_iso(_ago(100)))
            out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, slot="evening")
            self.assertNotIn("sweep", out)
            self.assertNotIn("full", api.calls)
            self.assertEqual(api.updates, [])
            self.assertIsNone(yu.read_record(low).sweep)
            self.assertEqual(api.status_map["LOW"][0], "public")
            self.assertEqual(out["counts"]["uploaded"], 0)
            morning = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=True, send=api, env=ENV)
            self.assertEqual({it["video_id"]: it["result"] for it in morning["sweep"]["items"]}.get("LOW"), "flagged")
            self.assertEqual(api.updates, [])                                    # 아침 점검(dry-run)은 그대로 돈다

    @mock.patch.object(yu, "RECENT_HOURS", 0)
    def test_morning_with_evening_uploads_new_then_falls_back(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            old, new, daily, q = self._setup(root, api)
            out = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None)
            self.assertEqual((out["kind"], out["slot"]), ("new", "morning"))  # 마지막이 새 편이어도 번갈아 올리지 않는다
            self.assertEqual([(r["dir"], r["status"]) for r in out["results"]], [(yu._rel(new), "uploaded")])
            self.assertIn("다시 올리기는 저녁", out["note"])
            self.assertNotIn("번갈아", out["note"])
            self.assertFalse(yu.republished(yu.read_record(old)))
            nxt = yu.daily_next(cfg, daily, q, root, today=dt.date(2026, 11, 14), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, slot="morning")
            self.assertEqual((nxt["kind"], nxt["slot"]), ("republish", "morning"))   # 새 편이 없으면 다시 올리기
            self.assertEqual([(r["dir"], r["status"]) for r in nxt["results"]], [(yu._rel(old), "uploaded")])
            self.assertEqual(api.uploads, 2)

    def test_morning_without_evening_keeps_alternation(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            old, _, daily, q = self._setup(Path(d), api, evening=None)
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=True, slot="morning")
            self.assertEqual((out["kind"], out["slot"]), ("republish", "morning"))
            self.assertIn("다시 올리기 차례", out["note"])
            self.assertEqual(out["results"][0]["dir"], yu._rel(old))

    def test_evening_recent_upload_guard(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            old, new, daily, q = self._setup(Path(d), api)
            _record(new, "NEW33", uploaded=dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2))   # 아침에 막 올림
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, slot="evening")
            self.assertIn("6시간", out["note"])
            self.assertEqual((out["counts"]["uploaded"], out["slot"]), (0, "evening"))
            self.assertEqual(api.uploads, 0)
            self.assertFalse(yu.republished(yu.read_record(old)))

    def test_invalid_slot(self) -> None:
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d, self.assertRaises(ValueError):
            yu.daily_next(_cfg(), Path(d) / "daily.json", Path(d) / "none.json", Path(d), today=dt.date(2026, 11, 13),
                          dry_run=True, slot="noon")

    def test_repo_daily_evening_enabled(self) -> None:
        daily = yu.load_daily()
        self.assertIs(daily["evening"]["enabled"], True)                         # 2026-11-13 사용자 "저녁에도 한편 더 올리자."
        self.assertIn("저녁에도 한편 더 올리자.", daily["_evening"])
        self.assertIn("제작 세션의 제안", daily["_evening"])                    # 자리 배정·저녁 창은 사용자 결정이 아니다


SCHED = {"enabled": True, "morning_kst": "07:00", "evening_kst": "17:00", "min_lead_min": 15}


def _kst(y: int, mo: int, d: int, h: int, mi: int, s: int = 0) -> dt.datetime:
    return dt.datetime(y, mo, d, h, mi, s, tzinfo=yu.KST)


class ScheduledPublishAtTest(unittest.TestCase):
    """2026-11-13 사용자: "오 좋다 예약 공개. …", "아침에도 예약공개로 하자" — 저녁 17:00(사용자 "저녁편 등록 시점을 17시로"),
    아침 07:00·최소 여유 15분은 제작 세션의 제안."""

    def test_disabled_or_missing_is_none(self) -> None:
        now = _kst(2026, 11, 13, 16, 25)
        for daily in ({}, {"scheduled_publish": None}, {"scheduled_publish": {**SCHED, "enabled": False}},
                      {"scheduled_publish": {"enabled": True}}):
            self.assertIsNone(yu.scheduled_publish_at(daily, "evening", now), daily)

    def test_on_time_runs(self) -> None:
        d = {"scheduled_publish": SCHED}
        self.assertEqual(yu.scheduled_publish_at(d, "evening", _kst(2026, 11, 13, 16, 25)), "2026-11-13T08:00:00Z")
        self.assertEqual(yu.scheduled_publish_at(d, "morning", _kst(2026, 11, 13, 5, 25)), "2026-11-12T22:00:00Z")

    def test_late_runs_use_now_plus_lead_same_day(self) -> None:
        d = {"scheduled_publish": SCHED}
        self.assertEqual(yu.scheduled_publish_at(d, "evening", _kst(2026, 11, 13, 16, 50)), "2026-11-13T08:05:00Z")  # 17:05 KST
        self.assertEqual(yu.scheduled_publish_at(d, "evening", _kst(2026, 11, 13, 18, 10)), "2026-11-13T09:25:00Z")  # 18:25 KST
        self.assertEqual(yu.scheduled_publish_at(d, "morning", _kst(2026, 11, 13, 9, 40)), "2026-11-13T00:55:00Z")   # 09:55 KST

    def test_rounds_up_to_whole_minute(self) -> None:
        d = {"scheduled_publish": SCHED}
        self.assertEqual(yu.scheduled_publish_at(d, "evening", _kst(2026, 11, 13, 16, 50, 1)), "2026-11-13T08:06:00Z")
        t = _kst(2026, 11, 13, 16, 50) + dt.timedelta(microseconds=1)
        self.assertEqual(yu.scheduled_publish_at(d, "evening", t), "2026-11-13T08:06:00Z")

    def test_malformed_time_raises(self) -> None:
        for bad in ("7:00", "17", "24:00", "17:60", "17:00 KST", 1700):
            with self.assertRaises(ValueError):
                yu.scheduled_publish_at({"scheduled_publish": {**SCHED, "evening_kst": bad}}, "evening", _kst(2026, 11, 13, 16, 0))
        with self.assertRaises(ValueError):
            yu.scheduled_publish_at({"scheduled_publish": {**SCHED, "min_lead_min": 2}}, "evening", _kst(2026, 11, 13, 16, 0))

    def test_metadata_body_publish_at_keeps_private(self) -> None:
        m = yu.Metadata(title="t", description="d", tags=[], category_id="27", default_language="ko",
                        contains_synthetic_media=True, made_for_kids=False)
        self.assertNotIn("publishAt", m.body()["status"])
        self.assertEqual(m.body()["status"]["privacyStatus"], "private")
        self.assertEqual(yu.validate_metadata(m), [])
        m.publish_at = "2026-11-14T08:00:00Z"
        self.assertEqual(m.body()["status"]["publishAt"], "2026-11-14T08:00:00Z")
        self.assertEqual(m.body()["status"]["privacyStatus"], "private")
        self.assertEqual(yu.validate_metadata(m), [])
        for bad in ("2026-11-14T17:00:00+09:00", "2026-11-14 08:00:00Z", "2026-11-14T08:00Z", "2026-13-14T08:00:00Z"):
            m.publish_at = bad
            self.assertIn("예약 공개", " ".join(yu.validate_metadata(m)), bad)

    def test_check_publish_at_window(self) -> None:
        now = dt.datetime(2026, 11, 13, 7, 0, tzinfo=dt.timezone.utc)
        self.assertEqual(yu.check_publish_at("2026-11-13T07:15:00Z", now), [])
        self.assertTrue(yu.check_publish_at("2026-11-13T07:02:00Z", now))     # 5분 안
        self.assertTrue(yu.check_publish_at("2026-11-13T06:00:00Z", now))     # 지난 시각
        self.assertTrue(yu.check_publish_at("2026-11-21T07:00:00Z", now))     # 8일 뒤
        self.assertTrue(yu.check_publish_at("bogus", now))

    def test_repo_config_scheduled(self) -> None:
        sp = yu.load_daily()["scheduled_publish"]
        # 2026-11-13 사용자: "아침에도 예약공개로 하자", "저녁편 등록 시점을 17시로 바꿀 수 있어?" — 아침 07:00 은 제작 세션의 제안
        self.assertIs(sp["enabled"], True)
        self.assertEqual((sp["morning_kst"], sp["evening_kst"]), ("07:00", "17:00"))
        self.assertIn("아침에도 예약공개로 하자", yu.load_daily()["_scheduled_publish"])
        self.assertIn("제작 세션의 제안", yu.load_daily()["_scheduled_publish"])


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
@mock.patch.object(yu, "RECENT_HOURS", 0)
class ScheduledPublishFlowTest(unittest.TestCase):
    """예약 공개는 daily_next 가 올리는 편에만 걸린다. privacyStatus 는 어디서나 "private", publishAt 은 insert 본문에만."""

    def _setup(self, root: Path, api: FakeApi, sched: dict | None = SCHED) -> tuple:
        old, new, daily, q = EveningSlotTest._setup(self, root, api)
        body = json.loads(daily.read_text(encoding="utf-8"))
        if sched is not None:
            body["scheduled_publish"] = sched
        daily.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
        return old, new, daily, q

    def _insert_status(self, api: FakeApi) -> dict:
        return json.loads(api.bodies["start"])["status"]

    def _assert_never_public(self, api: FakeApi) -> None:
        self.assertEqual(self._insert_status(api)["privacyStatus"], "private")
        for u in api.updates:                                                    # 옛 판 비공개 전환 등 videos.update 전부
            self.assertNotIn("publishAt", u.get("status", {}))
            self.assertEqual(u["status"]["privacyStatus"], "private")

    def test_evening_republish_scheduled_at_17(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        now = _kst(2026, 11, 13, 16, 25)
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d, mock.patch.object(yu, "_utcnow", lambda: now):
            old, new, daily, q = self._setup(Path(d), api)
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, slot="evening", now=now)
            self.assertEqual(out["counts"]["uploaded"], 1)
            self.assertEqual(out["publish_at"], "2026-11-13T08:00:00Z")
            self.assertTrue(out["note"].endswith(" · 예약 공개 17:00 KST"), out["note"])
            st = self._insert_status(api)
            self.assertEqual((st["privacyStatus"], st["publishAt"]), ("private", "2026-11-13T08:00:00Z"))
            rec = yu.read_record(old)
            self.assertEqual((rec.publish_at, rec.privacy_status), ("2026-11-13T08:00:00Z", "private"))
            self.assertEqual(out["results"][0]["publish_at"], "2026-11-13T08:00:00Z")
            self.assertEqual([u["id"] for u in api.updates], ["OA"])             # 옛 판 비공개 전환(공개 → 비공개)
            self._assert_never_public(api)

    def test_morning_new_episode_scheduled_at_07(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        now = _kst(2026, 11, 13, 5, 25)
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d, mock.patch.object(yu, "_utcnow", lambda: now):
            old, new, daily, q = self._setup(Path(d), api)
            dry = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=True, now=now)
            self.assertEqual((dry["kind"], dry["publish_at"], dry["results"][0]["publish_at"]),
                             ("new", "2026-11-12T22:00:00Z", "2026-11-12T22:00:00Z"))
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, now=now)
            self.assertEqual((out["kind"], out["publish_at"]), ("new", "2026-11-12T22:00:00Z"))
            self.assertIn("예약 공개 07:00 KST", out["note"])
            st = self._insert_status(api)
            self.assertEqual((st["privacyStatus"], st["publishAt"]), ("private", "2026-11-12T22:00:00Z"))
            self.assertEqual(yu.read_record(new).publish_at, "2026-11-12T22:00:00Z")
            self._assert_never_public(api)

    def test_morning_republish_fallback_is_scheduled(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        now = _kst(2026, 11, 13, 7, 40)                                          # 늦은 실행 → 07:55 KST
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d, mock.patch.object(yu, "_utcnow", lambda: now):
            old, new, daily, q = self._setup(Path(d), api)
            _record(new, "NEW33", uploaded=dt.datetime(2026, 11, 3, tzinfo=dt.timezone.utc))   # 새 편 없음
            out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                sleep=lambda s: None, now=now)
            self.assertEqual((out["kind"], out["publish_at"]), ("republish", "2026-11-12T22:55:00Z"))
            self.assertEqual(self._insert_status(api)["publishAt"], "2026-11-12T22:55:00Z")
            self.assertEqual(yu.read_record(old).publish_at, "2026-11-12T22:55:00Z")
            self._assert_never_public(api)

    def test_disabled_or_missing_sends_no_publish_at(self) -> None:
        for sched in (None, {**SCHED, "enabled": False}):
            api, cfg = FakeApi(), _cfg(channel_id="UC1")
            with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
                old, new, daily, q = self._setup(Path(d), api, sched=sched)
                out = yu.daily_next(cfg, daily, q, Path(d), today=dt.date(2026, 11, 13), dry_run=False, send=api, env=ENV,
                                    sleep=lambda s: None, now=_kst(2026, 11, 13, 5, 25))
                self.assertEqual(out["counts"]["uploaded"], 1)
                self.assertNotIn("publish_at", out)
                self.assertNotIn("예약 공개", out["note"])
                self.assertNotIn("publishAt", self._insert_status(api))
                self.assertIsNone(yu.read_record(new).publish_at)

    def test_push_and_manual_paths_are_not_scheduled(self) -> None:
        api = FakeApi()
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d), name="50-x", slug="x")
            res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None, auto=True, morning=set())
            self.assertEqual(res["status"], "uploaded")
            self.assertNotIn("publish_at", res)
            st = self._insert_status(api)
            self.assertNotIn("publishAt", st)
            self.assertEqual(st["privacyStatus"], "private")
            self.assertIsNone(yu.read_record(ep).publish_at)

    def test_bad_publish_at_blocks_upload(self) -> None:
        now = dt.datetime(2026, 11, 13, 7, 0, tzinfo=dt.timezone.utc)
        for when in (now + dt.timedelta(minutes=2), now + dt.timedelta(days=8), now - dt.timedelta(minutes=1)):
            api = FakeApi()
            with tempfile.TemporaryDirectory() as d, mock.patch.object(yu, "_utcnow", lambda: now):
                ep = _episode(Path(d))
                res = yu.process_episode(ep, _cfg(), dry_run=False, send=api, env=ENV, sleep=lambda s: None,
                                         publish_at=_iso(when))
                self.assertEqual(res["status"], "error", when)
                self.assertIn("예약 공개 검사 실패", res["error"])
                self.assertNotIn("start", api.calls)                             # insert 를 시작하지도 않았다
                self.assertEqual(api.uploads, 0)
                self.assertIsNone(yu.read_record(ep))

    def test_old_records_without_publish_at_still_load(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            ep = _episode(Path(d))
            rec = _record(ep, "V1", uploaded=NOW)
            raw = json.loads((ep / yu.RECORD_NAME).read_text(encoding="utf-8"))
            raw.pop("publish_at")
            (ep / yu.RECORD_NAME).write_text(json.dumps(raw), encoding="utf-8")
            self.assertIsNone(yu.read_record(ep).publish_at)
            self.assertEqual(yu.read_record(ep).video_id, rec.video_id)


@mock.patch.object(yu, "probe_video", lambda p: dict(PROBE_OK))
class SweepScheduledTest(unittest.TestCase):
    """예약 공개한 판은 48시간 점검을 예약 시각(publish_at)부터 잰다 — publishedAt 모호함 우회(watching)를 쓰지 않는다."""

    def _scheduled(self, api: FakeApi, ep: Path, vid: str, views: int, publish_hours_ago: float) -> None:
        rec = _record(ep, vid, uploaded=_ago(publish_hours_ago + 10))
        rec.publish_at = _iso(_ago(publish_hours_ago))
        yu.write_record(ep, rec)
        api.video(vid, "public", views, published=_iso(_ago(publish_hours_ago + 10)))   # 업로드 시각과 같은 모호한 publishedAt

    def test_counts_from_publish_at(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            old = _episode(root, name="06-old", slug="old")
            young = _episode(root, name="07-young", slug="young")
            self._scheduled(api, old, "S50", 3, 50)
            self._scheduled(api, young, "S10", 3, 10)
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            out = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            got = {it["video_id"]: (it["result"], it.get("age_from"), it.get("age_hours")) for it in out["items"]}
            self.assertEqual(got, {"S50": ("flagged", "publish_at", 50.0), "S10": ("young", "publish_at", 10.0)})
            self.assertEqual(yu.read_record(old).sweep["action"], "flagged")
            self.assertEqual(yu.read_record(old).sweep["publish_at"], _iso(_ago(50)))
            self.assertIsNone(yu.read_record(young).sweep)                       # watching 기록을 만들지 않는다
            self.assertEqual([u["id"] for u in api.updates], ["S50"])

    def test_future_publish_at_is_not_public(self) -> None:
        api, cfg = FakeApi(), _cfg(channel_id="UC1")
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            ep = _episode(root, name="06-later", slug="later")
            self._scheduled(api, ep, "LATER", 0, -3)                             # 3시간 뒤 공개 예정
            q = _republish_cfg(root, min_views=50, auto_sweep=SWEEP)
            out = yu.sweep_low_views(cfg, q, root, dry_run=False, send=api, env=ENV, now=NOW)
            self.assertEqual(out["items"][0]["result"], "not-public")
            self.assertEqual(api.updates, [])
            self.assertIsNone(yu.read_record(ep).sweep)


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

    def test_sweep_cli_dry_run_without_secrets(self) -> None:
        """저장소 설정·기록 그대로 --sweep --dry-run: 비밀값이 없으면 읽지도 쓰지도 않고 그렇다고 말한다."""
        before = {p: p.read_bytes() for p in yu.DEFAULT_FINALS.glob("*/youtube_upload.json")}
        with mock.patch.dict("os.environ", {}, clear=True):
            rc, res = self._main(["--sweep", "--dry-run"])
        self.assertEqual(rc, 0, res)
        self.assertEqual(res["kind"], "sweep")
        self.assertIn("비밀값이 없어", res["note"])
        self.assertEqual({p: p.read_bytes() for p in yu.DEFAULT_FINALS.glob("*/youtube_upload.json")}, before)

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
