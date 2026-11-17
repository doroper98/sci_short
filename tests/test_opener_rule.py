"""영상 시작에 '오늘은'을 쓰지 않는다 — 2026-11-17 사용자: "영상 시작할때 \"오늘은\"을 빼자. 규칙에 넣어".
대본 점검(pipeline/narration/script_schema.opener_problems), 합성 전 차단(narrate.py), 완성본 검사(pipeline/validate.py opener_row).
실행: python -m unittest discover -s tests -v"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from pipeline import validate as va
from pipeline.narration import script_schema as ss

ROOT = Path(__file__).resolve().parents[1]


class OpenerProblemsTest(unittest.TestCase):
    def test_banned(self) -> None:
        for t in ("오늘은 빛의 파장에 대해 알아볼까요?", "  오늘은 왜 그럴까요?", "오늘 알아볼 것은 무엇일까요?",
                  "“오늘은 바다 이야기입니다.”", "바다는 오늘은 왜 짤까요?"):
            self.assertTrue(ss.opener_problems(t), t)

    def test_allowed(self) -> None:
        for t in ("쓰나미는 어떻게 생기고, 어떻게 바다를 건널까요?", "기상 레이더는 비구름을 어떻게 볼까요?",
                  "오늘날 우리는 왜 전기를 많이 쓸까요?", ""):
            self.assertEqual(ss.opener_problems(t), [], t)

    def test_tts_is_checked_too(self) -> None:
        self.assertTrue(ss.opener_problems("GPT는 어떻게 답할까요?", "오늘은 지피티가 어떻게 답할까요?"))

    def test_script_opener_problems_looks_at_first_sentence_only(self) -> None:
        sc = ss.validate_script({"title": "t", "language": "ko", "sentences": [
            {"id": "s01", "scene": "hook", "text": "밀물은 왜 하루 두 번 올까요?"},
            {"id": "s02", "scene": "hook", "text": "오늘은 바닷물이 두 번 오릅니다."}]})
        self.assertEqual(ss.script_opener_problems(sc), [])
        sc2 = ss.validate_script({"title": "t", "language": "ko", "sentences": [
            {"id": "s01", "scene": "hook", "text": "오늘은 밀물과 썰물에 대해 알아볼까요?"}]})
        self.assertTrue(ss.script_opener_problems(sc2))

    def test_old_scripts_still_load(self) -> None:
        """형식 검증은 그대로라 옛 대본을 읽을 수는 있다(recaption 등). 막는 것은 합성과 완성본 검사다."""
        sc = ss.load_script(ROOT / "episodes" / "tides" / "script.json")
        self.assertTrue(ss.script_opener_problems(sc))


class ValidateOpenerRowTest(unittest.TestCase):
    def test_rows(self) -> None:
        self.assertEqual(va.opener_row({"sentences": [{"text": "오늘은 X에 대해 알아볼까요?"}]})[1], "FAIL")
        self.assertEqual(va.opener_row({"sentences": [{"text": "X는 왜 그럴까요?", "tts": "엑스는 왜 그럴까요?"}]})[1], "PASS")
        self.assertEqual(va.opener_row({"sentences": []})[1], "WARN")
        self.assertEqual(va.opener_row(None)[1], "WARN")

    def test_new_format_finals_pass(self) -> None:
        for d in ("58-tsunami", "64-weather-radar"):
            tl = json.loads((ROOT / "finals" / d / "timeline.json").read_text(encoding="utf-8"))
            self.assertEqual(va.opener_row(tl)[1], "PASS", d)


class NarrateRefusesTest(unittest.TestCase):
    def test_narrate_checks_before_synthesis(self) -> None:
        """narrate.py 는 무거운 의존성을 읽으므로 원문으로 확인한다: 대본을 읽은 바로 뒤, 모델 점검·합성 전에 막는다."""
        src = (ROOT / "pipeline" / "narration" / "narrate.py").read_text(encoding="utf-8")
        i_load = src.index("script = load_script(Path(args.script))")
        i_check = src.index("script_opener_problems(script)")
        i_assets = src.index("synth.require_assets(")
        self.assertLess(i_load, i_check)
        self.assertLess(i_check, i_assets)


if __name__ == "__main__":
    unittest.main()
