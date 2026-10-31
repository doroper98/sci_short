import json

import pytest

from pipeline.narration.script_schema import ScriptError, load_script, validate_script
from pipeline.narration.timeline import place_sentences, scene_bounds

BASE = {"title": "t", "language": "ko", "lead_sec": 1.0, "tail_sec": 0.8, "scene_lead_sec": 0.4, "default_gap_sec": 0.6,
        "sentences": [{"id": "s01", "scene": "hook", "text": "가입니다.", "gap": 0.8},
                      {"id": "s02", "scene": "hook", "text": "나입니다."},
                      {"id": "s03", "scene": "mech", "text": "다입니다.", "gap": 0.2},
                      {"id": "s04", "scene": "close", "text": "라입니다.", "gap": 5.0}]}


def _with(**kw):
    d = json.loads(json.dumps(BASE))
    d.update(kw)
    return d


def test_example_script_valid():
    from pathlib import Path
    s = load_script(Path(__file__).resolve().parents[1] / "examples" / "smoke.script.json")
    assert [x.scene for x in s.sentences] == ["hook", "mechanism", "close"]


@pytest.mark.parametrize("d,frag", [
    (_with(language="en"), "language"),
    (_with(extra=1), "모르는 최상위 키"),
    (_with(segments=[]), "segments"),
    (_with(sentences=[]), "sentences"),
    (_with(lead_sec=-1), "lead_sec"),
    (_with(sentences=[{"id": "s01", "scene": "a", "text": "x"}, {"id": "s01", "scene": "a", "text": "y"}]), "중복"),
    (_with(sentences=[{"id": "s 1", "scene": "a", "text": "x"}]), ".id"),
    (_with(sentences=[{"id": "s1", "scene": "a", "text": ""}]), ".text"),
    (_with(sentences=[{"id": "s1", "scene": "a", "text": "x", "tts": ""}]), ".tts"),
    (_with(sentences=[{"id": "s1", "scene": "a", "text": "x", "gap": "1"}]), ".gap"),
    (_with(sentences=[{"id": "s1", "scene": "a", "text": "x", "speed": 1.2}]), "모르는 키"),
    (_with(sentences=[{"id": "s1", "scene": "a", "text": "x"}, {"id": "s2", "scene": "b", "text": "y"},
                      {"id": "s3", "scene": "a", "text": "z"}]), "연속"),
])
def test_validation_errors(d, frag):
    with pytest.raises(ScriptError) as ei:
        validate_script(d)
    assert frag in str(ei.value)


def test_defaults_applied():
    d = _with()
    for k in ("lead_sec", "tail_sec", "scene_lead_sec", "default_gap_sec"):
        d.pop(k)
    s = validate_script(d)
    assert (s.lead_sec, s.tail_sec, s.scene_lead_sec, s.default_gap_sec) == (1.0, 0.8, 0.4, 0.6)


def test_place_and_scene_bounds():
    s = validate_script(_with())
    durs = {"s01": 2.0, "s02": 3.0, "s03": 1.0, "s04": 2.5}
    placed, duration = place_sentences(s, durs)
    assert [x for p in placed for x in (p.start, p.end)] == pytest.approx([1.0, 3.0, 3.8, 6.8, 7.4, 8.4, 8.6, 11.1])
    assert duration == pytest.approx(11.1 + 0.8)      # 마지막 gap(5.0) 대신 tail_sec
    sc = scene_bounds(s, placed, duration)
    assert sc[0] == {"id": "hook", "start": 0.0, "end": pytest.approx(7.0), "sentence_ids": ["s01", "s02"]}
    assert sc[1]["start"] == pytest.approx(7.4 - 0.4) and sc[1]["end"] == pytest.approx(8.4)
    # close: 첫 문장 8.6 − 0.4 = 8.2 < 앞 장면 끝 문장 8.4 → 8.4
    assert sc[2]["start"] == pytest.approx(8.4) and sc[2]["end"] == pytest.approx(duration)
    for a, b in zip(sc, sc[1:]):
        assert a["end"] == b["start"]
