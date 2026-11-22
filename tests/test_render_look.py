"""질감 층(pipeline/render/look.mjs, config/look.json) 시험.
node 시험(pipeline/render/tests/test_look.mjs)을 그대로 돌린다 — node 나 @napi-rs/canvas 가 없으면 건너뛰고, 설정 파일 꼴만 본다.
실행: python -m unittest tests.test_render_look -v"""

from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDER = ROOT / "pipeline" / "render"
HAS_NODE = bool(shutil.which("node")) and (RENDER / "node_modules" / "@napi-rs" / "canvas").is_dir()


class ConfigTest(unittest.TestCase):
    def test_look_config_shape(self) -> None:
        cfg = json.loads((ROOT / "config" / "look.json").read_text(encoding="utf-8"))
        self.assertIn("제작 세션의 제안", cfg["_purpose"])
        for sec, keys in {"background": {"center", "edge", "cx", "cy", "r0", "r1"},
                          "grain": {"amount", "size", "hold_frames", "highlight", "tiles", "tile", "seed"},
                          "bloom": {"tight_px", "tight_alpha", "wide_px", "wide_alpha"},
                          "vignette": {"strength", "r0", "r1"}}.items():
            self.assertTrue(keys <= set(cfg[sec]), f"{sec}: {keys - set(cfg[sec])}")
        self.assertGreaterEqual(cfg["grain"]["hold_frames"], 1)
        self.assertLessEqual(cfg["vignette"]["strength"], 0.3, "비네트는 약하게")


@unittest.skipUnless(HAS_NODE, "node 또는 pipeline/render/node_modules 없음")
class NodeTest(unittest.TestCase):
    def test_node_look_suite(self) -> None:
        r = subprocess.run(["node", "--test", "tests/test_look.mjs"], cwd=RENDER, capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
