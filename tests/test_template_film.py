"""새 편 틀의 질감 층 기본값 시험(2026-11-22): new_episode.py 기본 테마 film, chrome.mjs 의 film 테마, 틀 render.mjs 의 그리는 순서.
이미 만든 편은 각자 render.mjs 를 가지므로 여기서 보지 않는다. node 나 @napi-rs/canvas 가 없으면 node 쪽만 건너뛴다.
실행: python -m unittest tests.test_template_film -v"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDER = ROOT / "pipeline" / "render"
TEMPLATE = ROOT / "episodes" / "_template"
HAS_NODE = bool(shutil.which("node")) and (RENDER / "node_modules" / "@napi-rs" / "canvas").is_dir()


class NewEpisodeTest(unittest.TestCase):
    def run_new(self, *extra: str) -> str:
        with tempfile.TemporaryDirectory() as d:
            r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "new_episode.py"), "zz-film-test", "--title", "질감 시험",
                                "--episodes-dir", d, *extra], capture_output=True, text=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stderr)
            return (Path(d) / "zz-film-test" / "scenes.mjs").read_text(encoding="utf-8")

    def test_default_theme_is_film(self) -> None:
        self.assertIn("export const theme = 'film';", self.run_new())

    def test_theme_option_still_substitutes(self) -> None:
        self.assertIn("export const theme = 'noturno';", self.run_new("--theme", "noturno"))

    def test_template_theme_line_matches_substitution_regex(self) -> None:
        src = (TEMPLATE / "scenes.mjs").read_text(encoding="utf-8")
        self.assertRegex(src, r"export const theme = '[a-z]+';")


class TemplateRenderOrderTest(unittest.TestCase):
    def test_film_look_after_captions_before_safe_guides(self) -> None:
        src = (TEMPLATE / "render.mjs").read_text(encoding="utf-8")
        body = src[src.index("function frame("):]
        i_cap, i_look, i_safe = body.index("kit.drawCaptions("), body.index("kit.filmLook("), body.index("drawSafeZones")
        self.assertLess(i_cap, i_look)
        self.assertLess(i_look, i_safe)
        self.assertIn("kit.filmBackground(", src)
        self.assertRegex(src, r"ep\.look !== false")

    def test_template_has_no_fixed_teal_panels(self) -> None:
        src = (TEMPLATE / "scenes.mjs").read_text(encoding="utf-8")
        for hexcol in ("#0b2a36", "#06202a", "#0b1a22", "#0f3343", "#0c2b3b", "#9fd9c8"):
            self.assertNotIn(hexcol, src)


@unittest.skipUnless(HAS_NODE, "node 또는 pipeline/render/node_modules 없음")
class ThemeTest(unittest.TestCase):
    def test_resolve_film_and_default_unchanged(self) -> None:
        js = ("import {resolveTheme, DEFAULT_THEME} from './index.mjs';"
              "console.log(JSON.stringify({film: resolveTheme('film'), def: DEFAULT_THEME, part: resolveTheme({base: 'film', accent: '#123456'})}));")
        r = subprocess.run(["node", "--input-type=module", "-e", js], cwd=RENDER, capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout.strip().splitlines()[-1])
        self.assertEqual(out["film"]["name"], "film")
        self.assertEqual(out["film"]["bg"], "#1A1A1D")
        self.assertEqual(out["def"], "noturno", "옛 편의 재렌더가 바뀌지 않게 기본 테마는 noturno 그대로")
        self.assertEqual(out["part"]["name"], "film")
        self.assertEqual(out["part"]["accent"], "#123456")


if __name__ == "__main__":
    unittest.main()
