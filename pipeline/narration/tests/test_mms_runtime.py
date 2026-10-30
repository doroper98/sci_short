"""MMS 런타임 확인 — torch/torchaudio 2.8 의 MMS_FA API 가 있고, 가중치가 없으면 오류가 호스트·명령을 말하는지."""
import pytest

from pipeline.narration import forced_align as fa
from pipeline.narration.voice_config import load_voice_config


def test_missing_weights_message_names_host(tmp_path):
    cfg = load_voice_config().alignment
    with pytest.raises(fa.ForcedAlignError) as ei:
        fa.require_assets(cfg, tmp_path)
    msg = str(ei.value)
    assert "dl.fbaipublicfiles.com" in msg and "fetch_assets.py --mms" in msg


def test_wrong_size_rejected(tmp_path):
    cfg = load_voice_config().alignment
    (tmp_path / "mms_fa").mkdir()
    (tmp_path / "mms_fa" / "model.pt").write_bytes(b"x" * 10)
    with pytest.raises(fa.ForcedAlignError, match="크기"):
        fa.require_assets(cfg, tmp_path)


def test_mms_fa_api_present():
    pytest.importorskip("torchaudio")
    import torchaudio
    from torchaudio.pipelines import MMS_FA

    assert torchaudio.__version__.startswith("2.8.")
    assert hasattr(torchaudio.functional, "forced_align")
    assert MMS_FA.sample_rate == 16000
    assert "a" in MMS_FA.get_labels(star=None)


def test_from_forced_alignment_requires_same_chars():
    spans = [fa.CharSpan("가", 0.0, 0.1, 1.0)]
    with pytest.raises(fa.AlignmentError):
        fa.from_forced_alignment("가나", spans)
    out = fa.from_forced_alignment("가", spans)
    assert out["alignment_source"] == "mms_forced_alignment" and out["characters"] == ["가"]
