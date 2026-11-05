import math

import numpy as np
import pytest

from pipeline.narration import prosody
from pipeline.narration.prosody import SR, final_fall, span_start_index
from pipeline.narration.voice_config import load_voice_config

from pathlib import Path as _P
FF = load_voice_config(overrides_path=_P("/nonexistent-overrides")).final_fall   # osint 기준값(4반음)으로 이식 검증


@pytest.mark.parametrize("text,want", [
    ("물이 끓습니다.", len("물이 끓") ),          # 끝 3글자 "습니다" 의 첫 글자
    ("이것은 물입니다", len("이것은 물")),         # "입니다"
    ("그렇습니다!\"", len("그렇")),               # 끝 문장부호·따옴표를 떼고 본다
    ("니다.", None),                              # 3글자보다 짧다
    ("데우는 걸까요?", None),                     # ~요
    ("물 분자의 회전.", None),                    # 명사 끝
    ("합니다 그리고", None),                      # 끝이 아니다
])
def test_span_start_index(text, want):
    assert span_start_index(text, FF) == want


def _sawtooth(f0=120.0, dur=2.0):
    t = np.arange(int(dur * SR)) / SR
    phase = (t * f0) % 1.0
    saw = 2.0 * phase - 1.0
    env = np.clip(np.minimum(t - 0.1, 1.9 - t) / 0.05, 0, 1)   # 0.1~1.9 s 소리, 양 끝 50 ms 램프
    return (0.4 * saw * env).astype(np.float32)


def _align(text, t0=0.1, t1=1.9):
    n = len(text)
    starts = [t0 + (t1 - t0) * k / n for k in range(n)]
    ends = [t0 + (t1 - t0) * (k + 1) / n for k in range(n)]
    return {"alignment_source": "mms_forced_alignment", "characters": list(text),
            "character_start_times_seconds": starts, "character_end_times_seconds": ends}


def test_final_fall_synthetic_harmonic():
    text = "가나다라마바사아합니다."
    x = _sawtooth()
    al = _align(text)
    y, rec = final_fall(x, al, text, FF)
    assert rec.applied and rec.reason is None
    assert y.shape == x.shape and y.dtype == x.dtype
    i = span_start_index(text, FF)
    r0, r1 = rec.region_sec
    assert abs(r0 - (al["character_start_times_seconds"][i] - FF.pre_sec)) <= FF.frame_ms / 1000 + 1e-9
    assert 1.8 <= r1 <= 1.95                     # 마지막 유성 프레임 근처
    cs = int(round(r0 * SR))
    assert np.array_equal(y[:cs], x[:cs])        # 구간 앞은 원음 바이트 그대로
    assert abs(rec.f0_start_hz - 120.0) < 3.0
    drop = 12 * math.log2(rec.f0_start_hz / rec.f0_end_hz)
    assert 3.0 <= drop <= 4.5, drop             # 끝 10 프레임 중앙값이라 4반음보다 약간 작다
    assert rec.semitones == 4.0 and rec.octave_fixed_n == 0
    d = rec.model_dump()
    assert isinstance(d["region_sec"], list)


def test_final_fall_skips_non_nida():
    x = _sawtooth()
    y, rec = final_fall(x, _align("데우는 걸까요?"), "데우는 걸까요?", FF)
    assert not rec.applied and y is x


def test_final_fall_rejects_mismatched_alignment():
    x = _sawtooth()
    with pytest.raises(prosody.ProsodyError):
        final_fall(x, _align("다른 글자입니다."), "가나다라마바합니다.", FF)
