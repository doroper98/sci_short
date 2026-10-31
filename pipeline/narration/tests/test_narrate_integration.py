"""실제 Supertonic 합성으로 narrate.py 를 한 번 돌린다(자산이 없으면 건너뜀). 길이 초과 = 실패 + 확인용 timeline."""
import json
from pathlib import Path

import pytest

from pipeline.narration import narrate, synth
from pipeline.narration.voice_config import load_voice_config, models_dir

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "smoke.script.json"


def _assets_ok():
    return not synth.mismatches(load_voice_config().supertonic, models_dir())


@pytest.mark.skipif(not _assets_ok(), reason="Supertonic 자산 없음(fetch_assets.py --supertonic)")
def test_too_long_fails_but_writes_timeline(tmp_path, capsys):
    out = tmp_path / "n"
    rc = narrate.main(["--script", str(EXAMPLE), "--out", str(out), "--skip-alignment", "--max-sec", "5"])
    assert rc == 3
    assert "대본을 줄이세요. 음성을 가속하지 않습니다." in capsys.readouterr().err
    t = json.loads((out / "timeline.json").read_text(encoding="utf-8"))
    assert t["degraded"] is True and t["voice"] == f"supertonic-3 M3 ×{load_voice_config().supertonic.speed} (UNALIGNED, final_fall not applied)"
    assert all(s["chars"] == [] and s["alignment"] is None and s["final_fall"]["applied"] is False for s in t["sentences"])
    assert not (out / "narration.wav").exists()
    # 같은 출력 폴더로 다시: 합성 캐시 재사용, 이번엔 통과
    rc = narrate.main(["--script", str(EXAMPLE), "--out", str(out), "--skip-alignment"])
    assert rc == 0 and (out / "narration.wav").exists()
    prov = json.loads((out / "provenance.json").read_text(encoding="utf-8"))
    assert all(s["synth_cached"] for s in prov["sentences"])
    assert narrate.DEFAULT_MAX_SEC == 180.0


def test_lint_error_stops_before_synthesis(tmp_path, capsys):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"title": "t", "language": "ko", "sentences": [
        {"id": "s1", "scene": "a", "text": "아이 14명이 봅니다."}]}, ensure_ascii=False), encoding="utf-8")
    rc = narrate.main(["--script", str(bad), "--out", str(tmp_path / "o"), "--skip-alignment"])
    assert rc == 1 and "고유어 수사" in capsys.readouterr().err
    assert not (tmp_path / "o" / "raw").exists() or not any((tmp_path / "o" / "raw").iterdir())
