import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.narration import voice_config as vc


def test_overrides_apply_and_whitelist(tmp_path):
    base = vc.load_voice_config(overrides_path=tmp_path / "none.json")   # no file → osint reference values
    assert base.supertonic.speed == 0.95 and base.final_fall.semitones == 4.0 and base.overrides == {}
    o = tmp_path / "o.json"
    o.write_text(json.dumps({"supertonic": {"speed": 0.85}, "final_fall": {"semitones": 6, "curve": "ease_in"}}))
    c = vc.load_voice_config(overrides_path=o)
    assert c.supertonic.speed == 0.85 and c.final_fall.semitones == 6.0 and c.final_fall.curve == "ease_in"
    assert c.overrides == {"supertonic.speed": 0.85, "final_fall.semitones": 6, "final_fall.curve": "ease_in"}
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"supertonic": {"voice_style": "F1"}}))
    with pytest.raises(vc.VoiceConfigError):
        vc.load_voice_config(overrides_path=bad)


def test_repo_overrides_file_is_valid():
    c = vc.load_voice_config()
    assert c.overrides_path and Path(c.overrides_path).name == "voice-overrides.json"
    assert c.supertonic.speed == 0.85 and c.final_fall.semitones == 6.0


def test_ease_in_curve_falls_more_at_the_end():
    import dataclasses
    from pipeline.narration import prosody
    base = vc.load_voice_config(overrides_path=Path("/nonexistent")).final_fall
    lin = dataclasses.replace(base, semitones=6.0, curve="linear")
    ease = dataclasses.replace(base, semitones=6.0, curve="ease_in")
    sr = prosody.SR
    t = np.arange(int(sr * 1.2)) / sr
    x = (np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t)).astype(np.float32) * 0.5
    x *= np.minimum(1, t * 20) * np.minimum(1, (1.2 - t) * 20)
    chars = list("가나다합니다")
    n = len(chars); st = [i * 1.2 / n for i in range(n)]; en = [(i + 1) * 1.2 / n for i in range(n)]
    al = {"characters": chars, "character_start_times_seconds": st, "character_end_times_seconds": en}
    _, r1 = prosody.final_fall(x, al, "가나다합니다", lin)
    _, r2 = prosody.final_fall(x, al, "가나다합니다", ease)
    assert r1.applied and r2.applied
    # both end about 6 semitones down; the ease_in record keeps the same end but its mid-region is higher
    assert abs(12 * np.log2(r1.f0_end_hz / r1.f0_start_hz) + 6) < 1.5
    assert abs(12 * np.log2(r2.f0_end_hz / r2.f0_start_hz) + 6) < 1.5
