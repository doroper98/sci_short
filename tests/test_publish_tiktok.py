"""틱톡 직접 게시 안내(publish/tiktok.py) 시험. 2026-11-08 사용자 결정 "반자동: 직접 게시" — 도구는 아무것도 올리지 않는다."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from publish import tiktok as tt
from publish import youtube as yu
from test_publish_instagram import UPLOAD

PROBE = {"width": 1080, "height": 1920, "duration_sec": 120.0}
ENV = {"GITHUB_REPOSITORY": "doroper98/sci_short", "GITHUB_SHA": "abc123"}


def _ep(root: Path, name: str, upload: str = UPLOAD, meta: dict | None = None) -> Path:
    d = root / name
    d.mkdir(parents=True)
    slug = name.split("-", 1)[1]
    (d / f"{slug}.mp4").write_bytes(b"\0" * 2048)
    (d / "upload.md").write_text(upload, encoding="utf-8")
    if meta is not None:
        (d / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return d


class CaptionTest(unittest.TestCase):
    def test_tiktok_block_preferred_else_instagram(self) -> None:
        ig_cap = tt.parse_tiktok_caption(UPLOAD)
        self.assertTrue(ig_cap.startswith("<시험 편 제목>"))                      # 인스타 설명을 그대로 씀
        own = UPLOAD + "\n틱톡 설명\n```text\n틱톡 전용 설명 #과학\n```\n"
        self.assertEqual(tt.parse_tiktok_caption(own), "틱톡 전용 설명 #과학")
        self.assertTrue(tt.check_caption("AI 내레이션입니다 #과학", tt.TtConfig()))   # 사용자 규칙: AI 안내 금지
        self.assertTrue(tt.check_caption(" ".join(f"#t{i}" for i in range(6)), tt.TtConfig()))

    def test_instructions_escape_and_link(self) -> None:
        md = tt.instructions_md({"caption": "<제목>\n본문 #과학", "video_url": "https://x/y.mp4", "slug": "y",
                                 "size_mb": 20.1, "account": "sci_short", "ai_label": True})
        self.assertIn("&lt;제목&gt;", md)
        self.assertIn("(https://x/y.mp4)", md)
        self.assertIn("@sci_short", md)
        self.assertIn("AI 생성 콘텐츠", md)

    def test_repo_config(self) -> None:
        cfg = tt.load_config()
        self.assertTrue(cfg.enabled and cfg.ai_label)
        self.assertEqual(cfg.hashtags_max, 5)


@mock.patch.object(tt, "probe_video", lambda p: dict(PROBE))
class NextTest(unittest.TestCase):
    def test_prefer_backlog_record_and_skips(self) -> None:
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            old = _ep(root, "01-old")
            _ep(root, "05-off", meta={"tiktok": False})
            night = _ep(root, "32-night")                      # 밤에 만들고 아직 유튜브 전 → 고르지 않음
            today = _ep(root, "33-today")
            (today / "youtube_upload.json").write_text("{}", encoding="utf-8")
            morning = {32, 33}
            self.assertEqual(tt.tt_backlog(root, morning), [old.resolve(), today.resolve()])
            cfg = tt.TtConfig(account="sci_short")
            dry = tt.tt_next(cfg, root, prefer=[today], dry_run=True, env=ENV, morning=morning)
            self.assertEqual(dry["results"][0]["dir"], yu._rel(today))
            self.assertIsNone(tt.read_record(today))                       # dry-run 은 기록 안 씀
            out = tt.tt_next(cfg, root, prefer=[today], dry_run=False, env=ENV, morning=morning)
            r = out["results"][0]
            self.assertEqual((r["status"], r["today"]), ("offered", True))
            self.assertEqual(r["video_url"], "https://raw.githubusercontent.com/doroper98/sci_short/abc123/"
                             + today.relative_to(yu.REPO).as_posix() + "/today.mp4")
            self.assertEqual(tt.read_record(today).account, "sci_short")
            nxt = tt.tt_next(cfg, root, prefer=[today], dry_run=False, env=ENV, morning=morning)
            self.assertEqual(nxt["results"][0]["dir"], yu._rel(old))       # 오늘 편은 이미 안내 → 옛 편
            done = tt.tt_next(cfg, root, dry_run=False, env=ENV, morning=morning)
            self.assertEqual(done["results"], [])
            self.assertIsNone(tt.read_record(night))

    def test_disabled_and_bad_caption(self) -> None:
        with tempfile.TemporaryDirectory(dir=yu.REPO) as d:
            root = Path(d)
            self.assertEqual(tt.tt_next(tt.TtConfig(enabled=False), root, dry_run=False, env=ENV, morning=set())["results"], [])
            bad = UPLOAD.replace("#과학릴스", "#과학릴스 #하나더")
            _ep(root, "02-bad", upload=bad)
            out = tt.tt_next(tt.TtConfig(), root, dry_run=False, env=ENV, morning=set())
            self.assertFalse(out["ok"])
            self.assertIn("해시태그", out["results"][0]["error"])
            self.assertIsNone(tt.read_record(root / "02-bad"))


if __name__ == "__main__":
    unittest.main()
