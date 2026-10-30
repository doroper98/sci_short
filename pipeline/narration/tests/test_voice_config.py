import hashlib

import pytest

from pipeline.narration import synth
from pipeline.narration.voice_config import FinalFallRules, OctaveCleanRules, VoiceConfigError, load_voice_config


def test_loads_reference_values():
    vc = load_voice_config()
    st = vc.supertonic
    assert (st.voice_style, st.speed, st.total_step, st.silence_sec, st.max_chunk_len, st.seed_salt) == ("M3", 0.95, 16, 0.3, 120, "v1")
    assert st.revision == "3cadd1ee6394adea1bd021217a0e650ede09a323"
    assert len(st.assets) == 8
    ff = vc.final_fall
    assert (ff.suffix, ff.span_chars, ff.semitones, ff.pre_sec, ff.crossfade_sec) == ("니다", 3, 4.0, 0.03, 0.03)
    assert (ff.f0_floor_hz, ff.f0_ceil_hz, ff.frame_ms) == (60, 260, 5)
    oc = ff.octave_clean
    assert (oc.ratio_hi, oc.ratio_lo, oc.gate_db, oc.rms_ms, oc.record_frames) == (1.5, 0.6, -30, 20, 10)
    al = vc.alignment
    assert al.min_score == 0.62 and al.assets["model.pt"] == "0300fd9ae57a63e3bd239ae1337e32127a587214"
    assert al.model_size == 1262047414 and al.host == "dl.fbaipublicfiles.com"


def test_cache_salt_and_seed_formula_match_source():
    st = load_voice_config().supertonic
    assert synth.cache_salt(st) == "|st|M3|0.95|16|0.3|120|v1|3cadd1ee"
    tts = "물 분자가 흔들립니다."
    h = hashlib.sha1(f"{tts}|M3|0.95|16|v1".encode()).digest()
    assert synth.seed(tts, st) == int.from_bytes(h[:8], "big")
    assert synth.cache_key(tts, synth.cache_salt(st)) == hashlib.sha1((tts + "|st|M3|0.95|16|0.3|120|v1|3cadd1ee").encode()).hexdigest()[:10]
    assert synth.voice_label(st) == "supertonic-3 M3 ×0.95"


def test_rules_validation():
    oc = OctaveCleanRules(True, 1.5, 0.6, -30, 20, 10)
    with pytest.raises(VoiceConfigError):
        OctaveCleanRules(True, 0.9, 0.6, -30, 20, 10)
    with pytest.raises(VoiceConfigError):
        FinalFallRules(True, "니다", 3, 0.0, 0.03, 0.03, 60, 260, 5, oc)
