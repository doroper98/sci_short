import pytest

from pipeline.narration.pronounce import PronounceError, TtsLintError, auto_tts, lint_tts, read_int, read_number


@pytest.mark.parametrize("n,want", [
    (0, "영"), (1, "일"), (10, "십"), (11, "십일"), (19, "십구"), (100, "백"), (110, "백십"), (160, "백육십"),
    (1000, "천"), (1001, "천일"), (2009, "이천구"), (10000, "만"), (11000, "만천"), (20000, "이만"),
    (100000000, "일억"), (1000000000, "십억"), (1262047414, "십이억육천이백사만칠천사백십사"),
    (1000000000000, "일조"), (-3, "마이너스 삼"),
])
def test_read_int(n, want):
    assert read_int(n) == want


@pytest.mark.parametrize("s,want", [
    ("2.45", "이 점 사오"), ("0.95", "영 점 구오"), ("10.05", "십 점 영오"), ("1,262,047,414", "십이억육천이백사만칠천사백십사"),
    ("-1.5", "마이너스 일 점 오"),
])
def test_read_number(s, want):
    assert read_number(s) == want


@pytest.mark.parametrize("text,want", [
    ("주파수는 2.45 GHz입니다.", "주파수는 이 점 사오 기가헤르츠입니다."),
    ("2.45GHz", "이 점 사오 기가헤르츠"),
    ("61%", "육십일 퍼센트"),
    ("61 %가", "육십일 퍼센트가"),
    ("1,262,047,414 바이트", "십이억육천이백사만칠천사백십사 바이트"),
    ("속도는 0.95배", "속도는 영 점 구오배"),
    ("10억 배럴", "십억 배럴"),
    ("2009년에", "이천구년에"),
    ("-3 °C", "마이너스 삼 도"),
    ("25℃", "이십오 도"),
    ("300 K", "삼백 켈빈"),
    ("5 nm와 3 μm", "오 나노미터와 삼 마이크로미터"),
    ("2 um", "이 마이크로미터"),
    ("4 mm, 5 cm, 6 m, 7 km", "사 밀리미터, 오 센티미터, 육 미터, 칠 킬로미터"),
    ("3 kg과 20 g", "삼 킬로그램과 이십 그램"),
    ("1 s와 15 ms", "일 초와 십오 밀리초"),
    ("220 V, 2 A, 60 W", "이백이십 볼트, 이 암페어, 육십 와트"),
    ("4 J, 9.8 N, 101325 Pa", "사 줄, 구 점 팔 뉴턴, 십만천삼백이십오 파스칼"),
    ("13.6 eV", "십삼 점 육 전자볼트"),
    ("60 Hz와 100 MHz", "육십 헤르츠와 백 메가헤르츠"),
    ("6월과 10월", "유월과 시월"),
    ("18개월", "십팔개월"),
    ("제2법칙", "제이법칙"),
    ("물은 무색입니다.", "물은 무색입니다."),
])
def test_auto_tts(text, want):
    assert auto_tts(text) == want


def test_auto_tts_leaves_unknown_latin_and_compound_units():
    assert auto_tts("CO2") == "CO2"            # 라틴 문자 뒤 숫자는 건드리지 않는다 → lint 가 잡는다
    assert auto_tts("3 km/s") == "삼 km/s"     # 복합 단위는 호출자가 "초속 삼 킬로미터"로
    assert auto_tts("5 more") == "오 more"     # 단위처럼 보여도 라틴 낱말의 일부면 단위가 아니다
    with pytest.raises(TtsLintError):
        lint_tts(auto_tts("3 km/s"))


@pytest.mark.parametrize("text", ["14명", "3개", "2 번", "7살", "5마리", "3시간"])
def test_auto_tts_refuses_native_counters(text):
    with pytest.raises(PronounceError):
        auto_tts(text)


def test_decimal_word_override():
    assert auto_tts("2.45", decimal_word="쩜") == "이 쩜 사오"


@pytest.mark.parametrize("bad", ["숫자 3", "GHz", "61%", "1~2", "a/b", "시각 10:30", "→ 다음", "(괄호)", "[대괄호]",
                                 "중괄호{", "삼-오", "２", "온도 °"])
def test_lint_rejects(bad):
    with pytest.raises(TtsLintError):
        lint_tts(bad)


def test_lint_accepts_clean():
    s = "전자레인지 전파는 이 점 사오 기가헤르츠로, 일초에 약 이십사억 번 진동합니다."
    assert lint_tts(s) == s
    with pytest.raises(TtsLintError):
        lint_tts("   ")
