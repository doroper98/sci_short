"""pytest pipeline/audio/tests  (venv: pipeline/audio/requirements.txt)"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "audio"))
sys.path.insert(0, str(ROOT / "pipeline" / "render" / "tests"))
import make_fixture  # noqa: E402
import mix as mixmod  # noqa: E402
import sfx  # noqa: E402

FIXTURE = ROOT / "pipeline" / "render" / "tests" / "fixtures" / "timeline.sample.json"


@pytest.fixture()
def tl() -> dict:
    return json.loads(FIXTURE.read_text())


def onset(x: np.ndarray, thresh=1e-4) -> float:
    m = np.abs(x).max(axis=1) if x.ndim > 1 else np.abs(x)
    return int(np.argmax(m > thresh)) / sfx.SR


def test_resolve_at_grammar(tl):
    s3 = next(s for s in tl["sentences"] if s["id"] == "s03")
    mech = next(s for s in tl["scenes"] if s["id"] == "mechanism")
    assert sfx.resolve_at(3.25, tl) == 3.25
    assert sfx.resolve_at("s03", tl) == s3["start"]
    assert sfx.resolve_at("s03:end", tl) == s3["end"]
    assert sfx.resolve_at(["s03", 0.4], tl) == pytest.approx(s3["start"] + 0.4)
    assert sfx.resolve_at({"scene": "mechanism", "p": 0.5}, tl) == pytest.approx((mech["start"] + mech["end"]) / 2)
    i = "".join(c["c"] for c in s3["chars"]).index("수소 결합")
    assert sfx.resolve_at({"sentence": "s03", "word": "수소 결합", "offset": 0.1}, tl) == pytest.approx(s3["chars"][i]["start"] + 0.1)
    with pytest.raises(ValueError):
        sfx.resolve_at("zzz", tl)


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_js_python_reference_parity(tl):
    """The picture (timeline.mjs) and the sound (sfx.py) must resolve the same refs to the same seconds."""
    refs = [7.5, "s02", "s04:end", "hook:mid", ["s05", 0.15], {"scene": "close", "p": 0.25, "offset": -0.1},
            {"sentence": "s03", "word": "수소 결합"}, {"sentence": "s04", "word": "빈 공간", "offset": 0.05}]
    js = ("import {loadTimeline} from %s; const tl = loadTimeline(%s); const refs = JSON.parse(process.argv[1]);"
          "console.log(JSON.stringify(refs.map(r => tl.at(r))));") % (
        json.dumps((ROOT / "pipeline/render/timeline.mjs").as_uri()), json.dumps(str(FIXTURE)))
    out = subprocess.run(["node", "--input-type=module", "-e", js, json.dumps(refs, ensure_ascii=False)],
                         capture_output=True, text=True, check=True, cwd=ROOT / "pipeline" / "render")
    js_times = json.loads(out.stdout)
    py_times = [sfx.resolve_at(r, tl) for r in refs]
    assert js_times == pytest.approx(py_times, abs=1e-9)


def test_event_onsets_land_on_resolved_time(tmp_path, tl):
    t_tick = sfx.resolve_at(["s03", 0.4], tl)
    t_noise = sfx.resolve_at({"sentence": "s04", "word": "빈 공간"}, tl)
    for kind, at, params, expect in [
        ("tick", ["s03", 0.4], {"gain_db": -6}, t_tick),
        ("noise", {"sentence": "s04", "word": "빈 공간"}, {"gain_db": -6, "attack": 0.0005}, t_noise),
        ("tone", 2.0, {"gain_db": -6, "attack": 0.001}, 2.0),
        ("whoosh", 5.0, {"gain_db": -6, "dur": 0.4}, 5.0),
        ("swell", "s05", {"gain_db": -6}, sfx.resolve_at("s05", tl)),
    ]:
        sound = tmp_path / f"{kind}.json"
        sound.write_text(json.dumps({"events": [{"id": kind, "at": at, "kind": kind, "params": params}]}))
        out = tmp_path / f"{kind}.wav"
        rep = sfx.render_sfx(sound, FIXTURE, out)
        x, sr = sf.read(out)
        assert sr == 48000 and x.shape == (round(tl["duration"] * sr), 2)
        assert rep["events"][0]["time"] == pytest.approx(expect, abs=1e-4)
        # first audible sample within 2 ms after the event time (whoosh/swell ramp in slowly: allow 60 ms)
        tol = 0.06 if kind in ("whoosh", "swell") else 0.002
        assert expect - 1 / sr <= onset(x) <= expect + tol, (kind, onset(x), expect)


def test_repeat_interval_and_ambient_toggle(tmp_path, tl):
    sound = tmp_path / "s.json"
    sound.write_text(json.dumps({"events": [{"id": "r", "at": 3.0, "kind": "tick", "params": {"repeat": 3, "interval": 0.25, "decay": 0.01}}],
                                 "ambient": {"enabled": True, "seed": 3, "gain_db": -30}}))
    rep = sfx.render_sfx(sound, FIXTURE, tmp_path / "fx.wav", tmp_path / "amb.wav")
    assert rep["events"][0]["onsets"] == pytest.approx([3.0, 3.25, 3.5])
    amb, _ = sf.read(tmp_path / "amb.wav")
    assert 0 < np.abs(amb).max() <= 10 ** (-30 / 20) + 1e-6
    # same seed → identical ambient; --no-music → no file
    sfx.render_sfx(sound, FIXTURE, tmp_path / "fx2.wav", tmp_path / "amb2.wav")
    assert np.array_equal(amb, sf.read(tmp_path / "amb2.wav")[0])
    rep3 = sfx.render_sfx(sound, FIXTURE, tmp_path / "fx3.wav", tmp_path / "amb3.wav", no_music=True)
    assert rep3["ambient_wav"] is None and not (tmp_path / "amb3.wav").exists()


def test_mix_ducks_bed_under_speech(tmp_path, tl):
    make_fixture.write_outputs(tl, tmp_path)  # synthetic narration.wav (44.1 kHz)
    n = round(tl["duration"] * 48000)
    t = np.arange(n) / 48000
    bed = np.stack([0.1 * np.sin(2 * np.pi * 300 * t)] * 2, axis=1)
    sf.write(tmp_path / "amb.wav", bed.astype(np.float32), 48000, subtype="FLOAT")
    sf.write(tmp_path / "fx.wav", bed.astype(np.float32), 48000, subtype="FLOAT")
    # isolate the bed by mixing against silent narration
    silent = tmp_path / "silent.wav"
    sf.write(silent, np.zeros(round(tl["duration"] * 44100), dtype=np.float32), 44100)
    rep = mixmod.mix(silent, tmp_path / "fx.wav", FIXTURE, tmp_path / "mix.wav", ambient=tmp_path / "amb.wav",
                     music_duck_db=12, sfx_duck_db=6, quiet=True)
    m, sr = sf.read(tmp_path / "mix.wav")
    assert sr == 48000 and m.shape[1] == 2
    rms = lambda a, b: float(np.sqrt(np.mean(m[round(a * sr):round(b * sr), 0] ** 2)))
    s3 = next(s for s in tl["sentences"] if s["id"] == "s03")
    inside = rms(s3["start"] + 0.5, s3["end"] - 0.3)
    outside = rms(0.1, tl["sentences"][0]["start"] - 0.4)         # before the first sentence, beyond the pre-ramp
    expect = (10 ** (-12 / 20) + 10 ** (-6 / 20)) / 2               # amb + fx, each 0.1 amplitude, relative
    assert inside / outside == pytest.approx(expect, rel=0.02)
    # ramp: halfway through the 0.25 s pre-roll the duck is half applied (in dB)
    d = mixmod.duck_curve(n, [(s3["start"], s3["end"])], 0.25, 0.3)
    assert d[round((s3["start"] - 0.125) * 48000)] == pytest.approx(0.5, abs=0.01)
    assert d[round((s3["end"] + 0.31) * 48000)] == 0
    assert rep["master_peak"] <= 0.97 + 1e-6


def test_mix_levels_with_real_fixture_narration(tmp_path, tl):
    make_fixture.write_outputs(tl, tmp_path)
    rep = mixmod.mix(tmp_path / "narration.wav", None, FIXTURE, tmp_path / "mix.wav", quiet=True)
    assert rep["narration_peak"] == pytest.approx(0.8, abs=1e-3)
    assert rep["master_peak"] <= 0.97 + 1e-6
    assert rep["duration"] == pytest.approx(tl["duration"], abs=1 / 48000)
