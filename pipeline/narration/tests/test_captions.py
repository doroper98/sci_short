import pytest

from pipeline.narration.captions import Cue, cue_times, fit_cues, map_display_to_tts, nchars, split_cues, to_srt


def test_short_sentence_one_cue():
    assert split_cues("물이 끓습니다.") == ["물이 끓습니다."]


def test_split_prefers_clause_boundary():
    text = "전자레인지 전파는 2.45 GHz로, 1초에 약 24억 번 진동합니다."
    cues = split_cues(text, 18)
    assert cues == ["전자레인지 전파는 2.45 GHz로,", "1초에 약 24억 번 진동합니다."]
    assert all(nchars(c) <= 18 for c in cues)


def test_split_connective_boundary_and_limits():
    text = "물 분자가 그 흔들림을 따라가며 열이 생기고 음식이 데워집니다."
    cues = split_cues(text, 18)
    assert " ".join(cues) == text and all(nchars(c) <= 18 for c in cues)
    assert cues[0].endswith("따라가며") or cues[0].endswith("생기고")


def test_long_word_alone():
    w = "가" * 25
    assert split_cues(f"앞 {w} 뒤", 18) == ["앞", w, "뒤"]


def test_map_identical_text():
    r = map_display_to_tts("물이 끓는다", "물이 끓는다")
    assert r == [(0, 0), (1, 1), (3, 3), (4, 4), (5, 5)]


def test_map_number_gap_monotone():
    text, tts = "약 2.45 GHz로", "약 이 점 사오 기가헤르츠로"
    r = map_display_to_tts(text, tts)
    assert r[0] == (0, 0) and r[-1] == (len(tts) - 1, len(tts) - 1)
    starts = [a for a, _ in r]
    assert starts == sorted(starts)


def _chars(tts, t0, t1):
    n = len(tts)
    return [{"c": c, "start": t0 + (t1 - t0) * k / n, "end": t0 + (t1 - t0) * (k + 1) / n} for k, c in enumerate(tts)]


def test_cue_times_from_alignment():
    text = "전자레인지 전파는 2.45 GHz로, 1초에 약 24억 번 진동합니다."
    tts = "전자레인지 전파는 이 점 사오 기가헤르츠로, 일초에 약 이십사억 번 진동합니다."
    chars = _chars(tts, 10.0, 15.0)
    cues = cue_times("s02", text, tts, chars, (9.9, 15.2))
    assert [c.text for c in cues] == split_cues(text)
    assert cues[0].start == pytest.approx(chars[0]["start"])
    i = tts.index(",")
    assert cues[0].end == pytest.approx(chars[i]["end"])
    assert cues[1].start == pytest.approx(chars[tts.index("일초")]["start"])
    assert cues[1].end == pytest.approx(chars[len(tts) - 1]["end"])


def test_cue_times_degraded_proportional():
    text = "가나다라 마바사아 자차카타 파하가나 다라마바 사아자차"
    cues = cue_times("s01", text, text, None, (1.0, 5.0), max_chars=8)
    assert cues[0].start == pytest.approx(1.03) and cues[-1].end == pytest.approx(5.0 - 0.12)
    total = sum(nchars(c.text) for c in cues)
    assert cues[0].end - cues[0].start == pytest.approx((5.0 - 0.12 - 1.03) * nchars(cues[0].text) / total)


def test_cue_times_rejects_wrong_chars():
    with pytest.raises(ValueError):
        cue_times("s", "가나", "가나", _chars("다라", 0, 1), (0, 1))


def test_fit_cues_min_length_and_no_overlap():
    cues = [Cue("a", "x", 1.0, 1.1), Cue("a", "y", 1.2, 2.0), Cue("b", "z", 1.9, 2.5)]
    warns = fit_cues(cues)
    for c in cues:
        assert c.end - c.start >= 0.3 - 1e-9 or warns
    for a, b in zip(cues, cues[1:]):
        assert a.end <= b.start + 1e-9
    assert cues[0].end - cues[0].start == pytest.approx(0.3) or cues[0].end == pytest.approx(cues[1].start)


def test_srt_format():
    s = to_srt([Cue("a", "물이 끓습니다.", 1.0, 2.5), Cue("a", "둘", 3661.2345, 3662.0)])
    assert s.startswith("1\n00:00:01,000 --> 00:00:02,500\n물이 끓습니다.\n\n2\n01:01:01,234 --> 01:01:02,000\n둘\n")
