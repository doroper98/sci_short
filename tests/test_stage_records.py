"""stage_records.py 시험 — 임시 git 저장소에서 기록 스테이지와 누락 감지를 확인한다(2026-11-07 기록 미커밋 사고의 재발 방지)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github" / "scripts" / "stage_records.py"


def _run(cwd: Path, *reports: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *reports], cwd=cwd, capture_output=True, text=True)


class StageRecordsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        (self.root / "finals" / "22-a").mkdir(parents=True)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _report(self, name: str, results: list[dict]) -> str:
        (self.root / name).write_text(json.dumps({"results": results}), encoding="utf-8")
        return name

    def _staged(self) -> list[str]:
        return subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=self.root, capture_output=True,
                              text=True, check=True).stdout.split()

    def test_youtube_record_staged_even_without_instagram_records(self) -> None:
        """사고 재현: 인스타 기록이 하나도 없을 때도 유튜브 기록이 올라가야 한다."""
        (self.root / "finals/22-a/youtube_upload.json").write_text("{}", encoding="utf-8")
        yt = self._report("yt.json", [{"dir": "finals/22-a", "status": "uploaded"}])
        r = _run(self.root, yt, "missing-ig.json")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self._staged(), ["finals/22-a/youtube_upload.json"])

    def test_both_records_staged(self) -> None:
        for name in ("youtube_upload.json", "instagram_post.json"):
            (self.root / "finals/22-a" / name).write_text("{}", encoding="utf-8")
        yt = self._report("yt.json", [{"dir": "finals/22-a", "status": "uploaded"}])
        ig = self._report("ig.json", [{"dir": "finals/22-a", "status": "posted"}])
        self.assertEqual(_run(self.root, yt, ig).returncode, 0)
        self.assertEqual(sorted(self._staged()), ["finals/22-a/instagram_post.json", "finals/22-a/youtube_upload.json"])

    def test_missing_record_fails_loudly(self) -> None:
        yt = self._report("yt.json", [{"dir": "finals/22-a", "status": "uploaded"}])
        r = _run(self.root, yt)
        self.assertEqual(r.returncode, 1)
        self.assertIn("::error::", r.stdout)

    def test_skipped_needs_no_record_and_nothing_to_stage_is_ok(self) -> None:
        yt = self._report("yt.json", [{"dir": "finals/22-a", "status": "skipped"}])
        r = _run(self.root, yt, "nope.json")
        self.assertEqual(r.returncode, 0)
        self.assertIn("staged=0", r.stdout)


if __name__ == "__main__":
    unittest.main()
