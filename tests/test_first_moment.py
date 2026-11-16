"""첫 순간 점검(pipeline/first_moment.py)과 validate.py 의 first_moment 행 시험.
docs/CHANNEL_GROWTH.md 9절 방안 2(2026-11-16 사용자 "어 너가 생각하는 모든 것들을 다 적용해봐. 무한한 권한과 지지를 보낸다").
실행: python -m unittest tests.test_first_moment -v   (ffmpeg 가 없으면 영상 시험은 건너뛴다)"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from pipeline import first_moment as fm
from pipeline import validate as va

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
CFG = fm.load_config()


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


class PureTest(unittest.TestCase):
    def test_config_keys_and_values(self) -> None:
        self.assertEqual(CFG["sample_times"], [0.5, 1.0, 1.5, 2.0, 3.0])
        self.assertEqual(CFG["frame_size"], [270, 480])
        self.assertEqual(CFG["pixel_threshold"], 16)
        self.assertEqual(CFG["min_changed_pct"], {"1.0": 10, "2.0": 20})
        self.assertEqual(CFG["max_first_sound_sec"], 0.3)
        self.assertEqual(set(fm.thresholds(CFG)), set(fm.DEFAULTS))

    def test_unknown_config_key_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "c.json"
            p.write_text(json.dumps({"_note": "ok", "frame_size": [10, 10], "typo": 1}))
            with self.assertRaises(ValueError):
                fm.load_config(p)

    def test_changed_share_counts_strictly_above_threshold(self) -> None:
        a = bytes([100] * 10)
        b = bytes([116] * 3 + [117] * 2 + [100] * 5)     # 차이 16 은 세지 않고 17 은 센다
        self.assertAlmostEqual(fm.changed_share(a, b, 16), 20.0)
        with self.assertRaises(ValueError):
            fm.changed_share(a, b[:5], 16)

    def test_mean_pct(self) -> None:
        self.assertAlmostEqual(fm.mean_pct(bytes([0, 255])), 50.0)
        self.assertEqual(fm.mean_pct(b""), 0.0)

    def test_first_sound_parsing(self) -> None:
        lead = "[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 1.0125 | silence_duration: 1.0125\n"
        self.assertAlmostEqual(fm.first_sound_from_silencedetect(lead, 5), 1.0125)
        self.assertEqual(fm.first_sound_from_silencedetect("", 5), 0.0)                       # 맨 앞 무음 없음
        mid = "silence_start: 2.4\nsilence_end: 2.9 | silence_duration: 0.5\n"
        self.assertEqual(fm.first_sound_from_silencedetect(mid, 5), 0.0)                      # 무음이 뒤에만
        self.assertIsNone(fm.first_sound_from_silencedetect("silence_start: 0\n", 5))          # 끝까지 무음
        self.assertIsNone(fm.first_sound_from_silencedetect("silence_start: 0\nsilence_end: 5\n", 5))

    def test_result_shape_rounding_and_pass(self) -> None:
        ch = {"0.5": 0.94, "1.0": 1.06, "1.5": 1.2, "2.0": 0.84, "3.0": 1.46}
        r = fm.result(ch, 27.04, 0.2234, CFG)
        self.assertEqual(r, {"changed_pct": {"0.5": 0.9, "1.0": 1.1, "1.5": 1.2, "2.0": 0.8, "3.0": 1.5},
                             "luma0_pct": 27.0, "first_sound_sec": 0.22, "pass": False})
        self.assertEqual(list(r), ["changed_pct", "luma0_pct", "first_sound_sec", "pass"])
        good = {"0.5": 5, "1.0": 10, "1.5": 15, "2.0": 20, "3.0": 30}
        self.assertTrue(fm.result(good, 20, 0.3, CFG)["pass"])                               # 문턱 그대로는 통과
        self.assertFalse(fm.result(good, 20, 0.31, CFG)["pass"])
        self.assertFalse(fm.result(good, 20, None, CFG)["pass"])
        self.assertFalse(fm.result({**good, "1.0": 9.94}, 20, 0.0, CFG)["pass"])              # 반올림 9.9
        self.assertFalse(fm.result({**good, "2.0": 19.9}, 20, 0.0, CFG)["pass"])

    def test_final_mp4_needs_exactly_one_top_level(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            f = Path(d)
            self.assertIsNone(fm.final_mp4(f))
            (f / "hdr").mkdir()
            (f / "hdr" / "x.hdr.mp4").write_bytes(b"")
            (f / "x.mp4").write_bytes(b"")
            self.assertEqual(fm.final_mp4(f), f / "x.mp4")
            (f / "y.mp4").write_bytes(b"")
            self.assertIsNone(fm.final_mp4(f))


class ValidateRowTest(unittest.TestCase):
    PASSING = {"changed_pct": {"1.0": 12.0, "2.0": 25.0}, "luma0_pct": 12.0, "first_sound_sec": 0.2, "pass": True}
    FAILING = {"changed_pct": {"1.0": 1.1, "2.0": 0.8}, "luma0_pct": 27.0, "first_sound_sec": 0.22, "pass": False}

    def test_pass_is_pass_for_any_episode(self) -> None:
        self.assertEqual(va.first_moment_row(self.PASSING, 0.2, None, 0.3)[1], "PASS")
        self.assertEqual(va.first_moment_row(self.PASSING, 1.0, None, 0.3)[1], "PASS")

    def test_new_format_fails_old_format_warns(self) -> None:
        name, st, detail = va.first_moment_row(self.FAILING, 0.2, None, 0.3)
        self.assertEqual((name, st), (va.FM_CHECK, "FAIL"))
        self.assertIn("--allow-static-open", detail)
        self.assertEqual(va.first_moment_row(self.FAILING, 0.3, None, 0.3)[1], "FAIL")
        self.assertEqual(va.first_moment_row(self.FAILING, 1.0, None, 0.3)[1], "WARN")
        self.assertEqual(va.first_moment_row(self.FAILING, 0.6, None, 0.3)[1], "WARN")
        self.assertEqual(va.first_moment_row(self.FAILING, None, None, 0.3)[1], "WARN")

    def test_waiver_turns_fail_into_warn_with_reason(self) -> None:
        _, st, detail = va.first_moment_row(self.FAILING, 0.2, "우주 배경 복사는 2초 안에 보일 결과가 없음", 0.3)
        self.assertEqual(st, "WARN")
        self.assertIn("예외: 우주 배경 복사", detail)

    def test_measure_error(self) -> None:
        self.assertEqual(va.first_moment_row(None, 0.2, None, 0.3, "boom")[1], "FAIL")
        self.assertIn("재지 못함: boom", va.first_moment_row(None, 1.0, None, 0.3, "boom")[2])

    def test_record_into_validation_json(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "validation.json"
            va.record_first_moment(p, self.FAILING, None)                  # 파일이 없으면 만들지 않는다
            self.assertFalse(p.exists())
            p.write_text(json.dumps({"duration": 1.0}))
            va.record_first_moment(p, self.FAILING, "까닭")
            got = json.loads(p.read_text())
            self.assertEqual(got, {"duration": 1.0, "first_moment": self.FAILING, "first_moment_waiver": "까닭"})


@unittest.skipUnless(HAS_FFMPEG, "ffmpeg/ffprobe 없음")
class ClipTest(unittest.TestCase):
    """lavfi 로 만든 작은 영상(1080×1920 대신 작게 — 재는 쪽이 270×480 으로 줄인다)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        cls.static = d / "static.mp4"            # 그림이 멈추고 소리 없음(무음 줄기) → 못 미침
        _ffmpeg("-f", "lavfi", "-i", "color=c=0x203040:s=270x480:r=30:d=3.5",
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "3.5",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(cls.static))
        # 0.5초까지 검정, 그 뒤 흰색 — 1초·2초에 화면 전부가 바뀜, 0초부터 소리 → 통과
        cls.lively = d / "lively.mp4"
        _ffmpeg("-f", "lavfi", "-i", "color=c=black:s=270x480:r=30:d=3.5",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3.5",
                "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(t,0.5)'",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(cls.lively))
        # 같은 그림, 소리는 1초 무음 뒤 → 소리에서 못 미침
        cls.late = d / "late.mp4"
        _ffmpeg("-f", "lavfi", "-i", "color=c=black:s=270x480:r=30:d=3.5",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3.5",
                "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(t,0.5)'",
                "-af", "adelay=1000", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "3.5", str(cls.late))
        cls.mute = d / "mute.mp4"                # 소리 줄기 자체가 없음 → null
        _ffmpeg("-f", "lavfi", "-i", "color=c=black:s=270x480:r=30:d=2.5", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                str(cls.mute))

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_static_silent_fails(self) -> None:
        r = fm.measure(self.static, CFG)
        self.assertEqual(set(r["changed_pct"]), {"0.5", "1.0", "1.5", "2.0", "3.0"})
        self.assertTrue(all(v == 0.0 for v in r["changed_pct"].values()), r)
        self.assertIsNone(r["first_sound_sec"])
        self.assertFalse(r["pass"])
        self.assertTrue(0 < r["luma0_pct"] < 30, r)

    def test_lively_with_tone_passes(self) -> None:
        r = fm.measure(self.lively, CFG)
        self.assertGreaterEqual(r["changed_pct"]["1.0"], 99.0)
        self.assertGreaterEqual(r["changed_pct"]["2.0"], 99.0)
        self.assertEqual(r["first_sound_sec"], 0.0)
        self.assertLess(r["luma0_pct"], 1.0)
        self.assertTrue(r["pass"], r)

    def test_leading_silence_fails_on_sound(self) -> None:
        r = fm.measure(self.late, CFG)
        self.assertGreaterEqual(r["changed_pct"]["1.0"], 99.0)
        self.assertAlmostEqual(r["first_sound_sec"], 1.0, delta=0.1)
        self.assertFalse(r["pass"])

    def test_no_audio_stream_is_null(self) -> None:
        self.assertIsNone(fm.first_sound_sec(self.mute, CFG))

    def test_cli_exit_codes_and_json(self) -> None:
        out = Path(self.tmp.name) / "r.json"
        self.assertEqual(fm.main([str(self.lively), "--json", str(out)]), 0)
        self.assertTrue(json.loads(out.read_text())["pass"])
        self.assertEqual(fm.main([str(self.static)]), 1)

    def test_all_writes_baseline_keyed_by_folder(self) -> None:
        root = Path(self.tmp.name) / "finals"
        (root / "01-lively").mkdir(parents=True)
        (root / "02-two").mkdir()
        (root / "legacy").mkdir()
        shutil.copy(self.lively, root / "01-lively" / "lively.mp4")
        (root / "01-lively" / "hdr").mkdir()
        shutil.copy(self.static, root / "01-lively" / "hdr" / "lively.hdr.mp4")   # hdr/ 는 보지 않는다
        shutil.copy(self.static, root / "02-two" / "a.mp4")
        shutil.copy(self.static, root / "02-two" / "b.mp4")                         # mp4 둘 → 뺀다
        shutil.copy(self.static, root / "legacy" / "old.mp4")
        out = Path(self.tmp.name) / "base.json"
        self.assertEqual(fm.main(["--all", str(root), "--out", str(out)]), 0)
        base = json.loads(out.read_text())
        self.assertEqual(base["schema_version"], 1)
        self.assertEqual(list(base["episodes"]), ["01-lively"])
        self.assertTrue(base["episodes"]["01-lively"]["pass"])
        self.assertEqual(base["thresholds"]["min_changed_pct"], {"1.0": 10, "2.0": 20})
        self.assertIn("measured", base)
        self.assertTrue(base["method"])


if __name__ == "__main__":
    unittest.main()
