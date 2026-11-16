"""longform/build.py 시험 — 챕터 시각·M:SS·설명란 챕터 줄·ffmpeg 명령·검사를 ffmpeg 없이 확인하고,
저장소의 longform/01-detection 이 업로더 규칙(upload.md·meta.json·썸네일)을 지키는지 본다."""

from __future__ import annotations

import importlib.util
import json
import struct
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
_spec = importlib.util.spec_from_file_location("longform_build", REPO / "longform" / "build.py")
lb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lb)

from publish import youtube as yt  # noqa: E402

DET = REPO / "longform" / "01-detection"


def jpeg_size(p: Path) -> tuple[int, int]:
    """JPEG 의 (너비, 높이) — Pillow 없이 SOF 표지에서 읽는다."""
    b = p.read_bytes()
    i = 2
    while i < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        marker = b[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            return w, h
        i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    raise ValueError("SOF 없음")


class PureTest(unittest.TestCase):
    def test_fmt_mss(self) -> None:
        self.assertEqual(lb.fmt_mss(0), "0:00")
        self.assertEqual(lb.fmt_mss(59.999), "0:59")
        self.assertEqual(lb.fmt_mss(164.333), "2:44")
        self.assertEqual(lb.fmt_mss(600), "10:00")
        self.assertEqual(lb.fmt_mss(3725.4), "1:02:05")
        with self.assertRaises(ValueError):
            lb.fmt_mss(-1)

    def test_chapter_starts(self) -> None:
        self.assertEqual(lb.chapter_starts([164.333333, 169.933333, 149.2, 170.566667]), [0.0, 164.333, 334.267, 483.467])
        with self.assertRaises(lb.BuildError):
            lb.chapter_starts([10, 0])

    def test_chapters_and_block(self) -> None:
        ch = lb.make_chapters([164.333333, 169.933333, 149.2, 170.566667], ["가", "나", "다", "라"])
        self.assertEqual([c["start"] for c in ch], ["0:00", "2:44", "5:34", "8:03"])
        self.assertEqual(lb.chapter_block(ch), "0:00 가\n2:44 나\n5:34 다\n8:03 라")
        self.assertEqual(lb.chapter_problems(ch), [])
        with self.assertRaises(lb.BuildError):
            lb.make_chapters([1, 2], ["가"])

    def test_chapter_problems(self) -> None:
        self.assertTrue(lb.chapter_problems(lb.make_chapters([30, 30], ["가", "나"])))          # 2개
        self.assertTrue(lb.chapter_problems(lb.make_chapters([30, 5, 30], ["가", "나", "다"])))  # 10초 미만

    def test_description_lines_and_compare(self) -> None:
        ch = lb.make_chapters([100, 100, 100], ["가 | 하나", "나", "다"])
        desc = "소개 문장 3:00 은 줄 가운데라 챕터가 아님\n\n0:00 가 | 하나\n1:40 나\n3:20 다\n\n- 1,500 m/s\n#과학"
        self.assertEqual(lb.description_chapter_lines(desc), ["0:00 가 | 하나", "1:40 나", "3:20 다"])
        self.assertEqual(lb.compare_chapters(desc, ch), [])
        self.assertTrue(lb.compare_chapters(desc.replace("1:40 나", "1:41 나"), ch))
        self.assertTrue(lb.compare_chapters(desc.replace("3:20 다", "3:20 다른 제목"), ch))
        self.assertTrue(lb.compare_chapters(desc.replace("\n3:20 다", ""), ch))

    def test_validate_recipe(self) -> None:
        ok = {"slug": "x", "parts": ["finals/a", "finals/b"], "titles": ["가", "나"]}
        self.assertEqual(lb.validate_recipe(ok)["titles"], ["가", "나"])
        for bad in ({**ok, "slug": "X Y"}, {**ok, "titles": ["가"]}, {**ok, "parts": ["finals/a", "finals/a"]},
                    {**ok, "extra": 1}, {**ok, "titles": ["가", "<나>"]}, {**ok, "parts": []}):
            with self.assertRaises(lb.BuildError):
                lb.validate_recipe(bad)

    def test_concat_command(self) -> None:
        cmd = lb.concat_command([Path("a.mp4"), Path("b.mp4")], [10.0, 20.5], Path("out.mp4.part"), ffmpeg="ffmpeg")
        graph = cmd[cmd.index("-filter_complex") + 1]
        self.assertIn("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]", graph)
        self.assertIn("apad,atrim=end=20.500000", graph)
        self.assertIn("trim=end=10.000000", graph)
        self.assertEqual(cmd.count("-i"), 2)
        for a, b in (("-c:v", "libx264"), ("-crf", "18"), ("-preset", "medium"), ("-pix_fmt", "yuv420p"), ("-r", "30"),
                     ("-c:a", "aac"), ("-b:a", "192k"), ("-movflags", "+faststart"), ("-f", "mp4")):
            self.assertEqual(cmd[cmd.index(a) + 1], b)
        self.assertNotIn("-c", cmd)   # 스트림 복사 아님

    def test_check_probe(self) -> None:
        good = {"duration_sec": 654.05, "video": {"width": 1080, "height": 1920, "fps": 30.0, "duration_sec": 654.033},
                "audio": {"duration_sec": 654.04}}
        self.assertEqual(lb.check_probe(good, 654.033), [])
        self.assertTrue(lb.check_probe({**good, "duration_sec": 655.0}, 654.033))
        self.assertTrue(lb.check_probe({**good, "audio": {"duration_sec": 653.8}}, 654.033))
        self.assertTrue(lb.check_probe({**good, "video": {**good["video"], "fps": 29.97}}, 654.033))
        self.assertTrue(lb.check_probe({**good, "video": {**good["video"], "width": 1920, "height": 1080}}, 654.033))
        self.assertTrue(lb.check_probe({**good, "audio": None}, 654.033))


class DetectionFolderTest(unittest.TestCase):
    """저장소의 longform/01-detection — mp4 없이 확인할 수 있는 것."""

    def test_upload_md_chapters_match_chapters_json(self) -> None:
        recipe = lb.load_recipe(DET)
        saved = json.loads((DET / "chapters.json").read_text(encoding="utf-8"))
        self.assertEqual([c["title"] for c in saved["chapters"]], recipe["titles"])
        self.assertEqual([c["dir"] for c in saved["chapters"]], recipe["parts"])
        info = yt.parse_upload_md((DET / "upload.md").read_text(encoding="utf-8"))
        self.assertEqual(lb.compare_chapters(info["description"], saved["chapters"]), [])
        self.assertEqual(lb.chapter_problems(saved["chapters"]), [])
        self.assertTrue(lb.description_chapter_lines(info["description"])[0].startswith("0:00 "))

    def test_parts_exist(self) -> None:
        for part in lb.load_recipe(DET)["parts"]:
            self.assertTrue(part.startswith("finals/"))
            lb.part_video(REPO / part)   # 바로 아래 mp4 하나
            self.assertTrue((REPO / part / "poster.jpg").is_file())

    def test_upload_metadata_rules(self) -> None:
        ep = yt.Episode(dir=DET, number=1, slug="detection", video=DET / "detection.mp4", upload_md=DET / "upload.md",
                        srt=None, thumbnail=None, meta=yt.load_meta(DET))
        meta = yt.build_metadata(ep, yt.load_config())
        self.assertEqual(yt.validate_metadata(meta), [])
        self.assertNotIn("·", meta.title)
        self.assertLessEqual(len(meta.title), yt.TITLE_MAX_CHARS)
        self.assertIsNone(meta.publish_at)
        self.assertEqual(meta.body()["status"]["privacyStatus"], "private")
        self.assertNotIn("publishAt", meta.body()["status"])
        for banned in ("AI", "인공지능", "실제와 다", "합성 음성", "내레이션"):
            self.assertNotIn(banned, meta.description)

    def test_meta_json(self) -> None:
        meta = yt.load_meta(DET)   # 모르는 키가 있으면 UploadError
        self.assertIs(meta["instagram"], False)
        self.assertIs(meta["tiktok"], False)
        self.assertNotIn("auto_publish", meta)
        self.assertEqual(meta["video"], f"{lb.load_recipe(DET)['slug']}.mp4")

    def test_thumbnail(self) -> None:
        p = DET / "thumbnail.jpg"
        self.assertEqual(jpeg_size(p), (1280, 720))
        self.assertLess(p.stat().st_size, 2 * 1024 * 1024)

    def test_not_enumerated_by_finals_paths(self) -> None:
        self.assertNotIn(DET.resolve(), [d.resolve() for d in yt.episode_dirs(yt.DEFAULT_FINALS)])
        spec = importlib.util.spec_from_file_location("changed_finals", REPO / ".github" / "scripts" / "changed_finals.py")
        cf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cf)
        self.assertIsNone(cf.EP_RE.match("longform/01-detection/upload.md"))


if __name__ == "__main__":
    unittest.main()
