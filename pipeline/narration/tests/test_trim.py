import numpy as np
import pytest

from pipeline.narration.trim import FADE_SEC, POST_SEC, PRE_SEC, SR, trim


def _sig():
    a = np.zeros(SR, dtype=np.float32)
    a[10000:30000] = 0.5 * np.sin(np.arange(20000) * 2 * np.pi * 200 / SR)
    a[10000] = 0.5   # 첫 문턱 초과 샘플을 정확히 10000 으로
    a[29999] = 0.5
    return a


def test_trim_offset_and_length():
    a = _sig()
    y, start = trim(a)
    assert start == 10000 - int(PRE_SEC * SR)
    assert len(y) == (29999 + int(POST_SEC * SR)) - start
    f = int(FADE_SEC * SR)
    assert y[0] == 0.0 and y[-1] == 0.0 and np.allclose(y[f + 5: f + 50], a[start + f + 5: start + f + 50])


def test_trim_offset_clamped_at_zero():
    a = _sig()[9000:]
    _, start = trim(a)
    assert start == 0


def test_trim_uses_reference_positions():
    a = _sig()
    noisy = a.copy()
    noisy[-200:] = 0.3   # 보정 음성 꼬리 잡음 — ref(원음) 기준이면 길이가 바뀌지 않는다
    y_ref, s_ref = trim(noisy, ref=a)
    y_raw, s_raw = trim(a)
    assert s_ref == s_raw and len(y_ref) == len(y_raw)
    y_self, _ = trim(noisy)
    assert len(y_self) > len(y_raw)


def test_trim_silence_raises():
    with pytest.raises(ValueError):
        trim(np.zeros(1000, dtype=np.float32))
