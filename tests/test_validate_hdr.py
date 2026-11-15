"""HDR 판 검사(pipeline/validate.py hdr_rows)와 목록(pipeline/catalog.py)의 hdr 필드 시험 — ffmpeg 없이 돈다.
2026-11-15 사용자 "다음 편부터 hdr 적용해". 실행: python -m unittest discover -s tests -v"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from pipeline import catalog
from pipeline import validate as va


def _probe(**over) -> dict:
    v = {"codec_type": "video", "codec_name": "hevc", "pix_fmt": "yuv420p10le", "color_primaries": "bt2020",
         "color_transfer": "smpte2084", "color_space": "bt2020nc", "width": 1080, "height": 1920,
         "r_frame_rate": "30/1", "avg_frame_rate": "30/1"}
    a = {"codec_type": "audio", "codec_name": "aac"}
    fmt = {"duration": "120.000000"}
    for k, val in over.items():
        if k == "duration":
            fmt["duration"] = val
        elif k == "audio":
            a = val
        else:
            v[k] = val
    return {"streams": [v] + ([a] if a else []), "format": fmt}


def _status(rows: list) -> dict[str, str]:
    return {name: st for name, st, _ in rows}


class HdrRowsTest(unittest.TestCase):
    def test_good_file_all_pass(self) -> None:
        rows = va.hdr_rows(_probe(), 120.05, "x/final/hdr/s.hdr.mp4", "s")
        self.assertEqual(len(rows), 6)
        self.assertTrue(all(st == "PASS" for _, st, _ in rows), rows)
        self.assertEqual(rows[0][0], "HDR 판 exists")

    def test_missing_file_fails_with_run_hint(self) -> None:
        rows = va.hdr_rows(None, 120.0, "x/final/hdr/s.hdr.mp4", "s")
        self.assertEqual([(n, st) for n, st, _ in rows], [("HDR 판 exists", "FAIL")])
        self.assertIn("episodes/s/run.sh hdr", rows[0][2])

    def test_each_wrong_property_fails_its_row(self) -> None:
        cases = [
            (dict(codec_name="h264"), "HDR HEVC yuv420p10le"),
            (dict(pix_fmt="yuv420p"), "HDR HEVC yuv420p10le"),
            (dict(color_transfer="bt709"), "HDR bt2020 / smpte2084 / bt2020nc"),
            (dict(color_primaries="bt709"), "HDR bt2020 / smpte2084 / bt2020nc"),
            (dict(color_space="bt709"), "HDR bt2020 / smpte2084 / bt2020nc"),
            (dict(width=1920, height=1080), "HDR 1080×1920 30 fps"),
            (dict(avg_frame_rate="60/1"), "HDR 1080×1920 30 fps"),
            (dict(duration="120.2"), "HDR duration = SDR ±0.1s"),
            (dict(audio=None), "HDR audio stream (aac)"),
            (dict(audio={"codec_type": "audio", "codec_name": "opus"}), "HDR audio stream (aac)"),
        ]
        for over, failing in cases:
            st = _status(va.hdr_rows(_probe(**over), 120.0, "p", "s"))
            self.assertEqual([n for n, s in st.items() if s == "FAIL"], [failing], over)

    def test_no_sdr_duration_or_video_stream_fails(self) -> None:
        self.assertEqual(_status(va.hdr_rows(_probe(), None, "p", "s"))["HDR duration = SDR ±0.1s"], "FAIL")
        st = _status(va.hdr_rows({"streams": [], "format": {}}, 120.0, "p", "s"))
        self.assertEqual(st["HDR 판 exists"], "PASS")
        self.assertTrue(all(s == "FAIL" for n, s in st.items() if n != "HDR 판 exists"))


class CatalogHdrTest(unittest.TestCase):
    def _entry(self, folder: Path) -> dict:
        with mock.patch.object(catalog, "probe", lambda p: (120.0, 1080, 1920)), mock.patch.object(catalog, "sh", lambda *a: ""):
            return catalog.entry(folder, 99)

    def test_hdr_fields_only_when_present(self) -> None:
        with tempfile.TemporaryDirectory(dir=catalog.ROOT) as d:
            f = Path(d) / "99-sample"
            f.mkdir()
            (f / "sample.mp4").write_bytes(b"\0" * 10)
            e = self._entry(f)
            self.assertNotIn("hdr", e)
            self.assertNotIn("hdr_bytes", e)
            keys = list(e)
            (f / "hdr").mkdir()
            (f / "hdr" / "sample.hdr.mp4").write_bytes(b"\1" * 25)
            e = self._entry(f)
            self.assertEqual(e["video"].rsplit("/", 1)[-1], "sample.mp4")       # 맨 위 SDR 판 그대로
            self.assertEqual(e["hdr"], f.relative_to(catalog.ROOT).as_posix() + "/hdr/sample.hdr.mp4")
            self.assertEqual(e["hdr_bytes"], 25)
            self.assertEqual(list(e)[:len(keys)], keys)                          # 기존 키 순서 그대로, 끝에 덧붙임


if __name__ == "__main__":
    unittest.main()
