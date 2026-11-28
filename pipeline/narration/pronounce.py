"""과학 대본용 최소 발음 도우미 — 숫자·소수·퍼센트·음수·짧은 단위 표만. 일반 사전이 아니다.

규칙 근거(osint_generator docs/handoff/03_SCRIPT_NARRATION_TTS.md §4·§5, commit 131db009…):
- 발음 텍스트에는 숫자·%·~·/·:·→·괄호·대괄호가 없어야 한다(lint_tts).
- 한자어 숫자는 붙여 쓴다: "백육십"(O) / "백 육십"(X) — TTS-AP-058.
- 소수점은 표준 표기 "점"(TTS-AP-061: 된소리 표기 "쩜"을 섞지 말고 엔진에 맡긴다;
  이 저장소 docs/NARRATION_AND_CAPTIONS.md 의 예 "이 점 사오 기가헤르츠"). DECIMAL_WORD 로 바꿀 수 있다.
- 6월·10월 = 유월·시월(TTS-AP-060).
- 고유어 수사가 필요한 개수 단위(개·명·번·살·마리·시간·시…)는 자동 변환하지 않고 오류를 낸다 → 대본에 명시 tts 를 쓴다.
auto_tts 가 모르는 것은 그대로 두고, lint_tts 가 남은 숫자·라틴 문자·기호를 잡는다.

발음 규정집(2026-11-28 사용자: "상대성이론 발음이 왜저래. '상대썽이론'이어야 되자나", "재발 방지 목록과 발음 규정집 같은게
있으면 거기에 다 등록해" — osint 원본에는 없는 부분): 엔진이 표기에 드러나지 않는 된소리를 글자대로 읽는 낱말을
config/pronunciation.json 에 적어 두고, apply_rulebook 이 합성 직전의 발음 텍스트(명시 tts 와 auto_tts 결과 모두)에서
write → say 로 바꾼다. 글자 수는 그대로다(글자 시각 정렬·자막 큐가 글자 자리로 맞물린다). 규정과 재발 방지 목록은
docs/PRONUNCIATION.md.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

DIGITS = "영일이삼사오육칠팔구"
SMALL_UNITS = ("", "십", "백", "천")
LARGE_UNITS = ("", "만", "억", "조", "경")
DECIMAL_WORD = "점"
MINUS_WORD = "마이너스"
PERCENT_WORD = "퍼센트"

# 숫자 뒤 단위(긴 것 먼저 맞춘다). 값 = 읽는 말. km/s 같은 복합 단위는 일부러 없다(호출자가 "초속 … 킬로미터"로 쓴다).
UNITS: dict[str, str] = {
    "GHz": "기가헤르츠", "MHz": "메가헤르츠", "kHz": "킬로헤르츠", "Hz": "헤르츠",
    "nm": "나노미터", "μm": "마이크로미터", "µm": "마이크로미터", "um": "마이크로미터",
    "mm": "밀리미터", "cm": "센티미터", "km": "킬로미터", "m": "미터",
    "°C": "도", "℃": "도", "°": "도", "K": "켈빈",
    "kg": "킬로그램", "g": "그램",
    "ms": "밀리초", "s": "초",
    "V": "볼트", "A": "암페어", "W": "와트", "J": "줄", "N": "뉴턴", "Pa": "파스칼", "eV": "전자볼트",
}
_UNIT_ALT = "|".join(re.escape(u) for u in sorted(UNITS, key=len, reverse=True))

# 고유어 수사(한/두/세…)가 맞는 단위 — 자동 변환 금지(개월은 한자어라 제외).
NATIVE_COUNTERS = ("개(?!월)", "명", "번", "살", "마리", "시간", "시(?![대작점])", "가지", "군데", "켤레", "그루", "송이", "사람")

_NUM = (r"(?P<neg>[-−](?=\d))?"
        r"(?P<int>\d{1,3}(?:,\d{3})+|\d+)"
        r"(?:\.(?P<frac>\d+))?")
TOKEN = re.compile(
    r"(?<![A-Za-z0-9_.,])" + _NUM +
    r"(?:(?P<pct>\s?%)|(?P<usp>\s?)(?P<unit>" + _UNIT_ALT + r")(?![A-Za-z/]))?",
)
_NATIVE = re.compile(r"\s?(?:" + "|".join(NATIVE_COUNTERS) + ")")
_MONTH = re.compile(r"월")

FORBIDDEN = re.compile(r"[0-9０-９A-Za-zＡ-Ｚａ-ｚ%％~～/:：→()\[\]{}（）［］｛｝<>°℃μµ=+×÷\-–—−]|\d")


class PronounceError(ValueError):
    pass


class TtsLintError(ValueError):
    pass


def _four(n: int) -> str:
    """0 < n < 10000 → 한자어. 십·백·천 앞 1 은 읽지 않는다(일십→십, 일백→백, 일천→천)."""
    out = []
    for pos in range(3, -1, -1):
        d = n // 10 ** pos % 10
        if d == 0:
            continue
        out.append(SMALL_UNITS[pos] if (d == 1 and pos > 0) else DIGITS[d] + SMALL_UNITS[pos])
    return "".join(out)


def read_int(n: int) -> str:
    """정수 → 한자어 읽기(공백 없음). 10000 = 만, 1억 = 일억, 1조 = 일조."""
    if n < 0:
        return f"{MINUS_WORD} {read_int(-n)}"
    if n == 0:
        return DIGITS[0]
    groups = []
    k = 0
    while n:
        g = n % 10000
        if g:
            if k >= len(LARGE_UNITS):
                raise PronounceError("숫자가 너무 크다")
            word = "" if (k == 1 and g == 1) else _four(g)
            groups.append(word + LARGE_UNITS[k])
        n //= 10000
        k += 1
    return "".join(reversed(groups))


def read_number(s: str, decimal_word: str = DECIMAL_WORD) -> str:
    """'1,262,047,414' · '2.45' · '-3' · '0.95' → 읽기. 소수 부분은 한 자리씩."""
    m = re.fullmatch(_NUM, s.strip())
    if not m:
        raise PronounceError(f"숫자가 아니다: {s!r}")
    out = read_int(int(m["int"].replace(",", "")))
    if m["frac"]:
        out += f" {decimal_word} " + "".join(DIGITS[int(c)] for c in m["frac"])
    return f"{MINUS_WORD} {out}" if m["neg"] else out


def auto_tts(text: str, decimal_word: str = DECIMAL_WORD) -> str:
    """표시 텍스트 → 발음 텍스트: 숫자와 표의 단위만 바꾸고 나머지는 그대로 둔다."""

    def repl(m: re.Match) -> str:
        after = text[m.end():]
        if not m["frac"] and not m["unit"] and not m["pct"]:
            if _NATIVE.match(after):
                raise PronounceError(f"고유어 수사가 필요한 수량 {text[m.start():m.end() + 3]!r} — 대본에 명시 tts 를 쓰세요(예: 열네 명)")
            if _MONTH.match(after) and int(m["int"].replace(",", "")) in (6, 10) and not m["neg"]:
                return "유" if m["int"] == "6" else "시"
        num = read_number((m["neg"] or "") + m["int"] + (f".{m['frac']}" if m["frac"] else ""), decimal_word)
        if m["pct"]:
            return f"{num} {PERCENT_WORD}"
        if m["unit"]:
            return f"{num} {UNITS[m['unit']]}"
        return num

    return TOKEN.sub(repl, text)


RULEBOOK = Path(__file__).resolve().parents[2] / "config" / "pronunciation.json"
_HANGUL = re.compile(r"^[가-힣]+$")


class RulebookError(ValueError):
    """config/pronunciation.json 의 꼴이 틀렸다(추측하지 않고 멈춘다)."""


def check_rulebook(data: dict) -> list[tuple[str, str]]:
    """규정집 dict → [(write, say)] (긴 낱말부터). 꼴이 틀리면 RulebookError. Pure function."""
    words = data.get("words")
    if not isinstance(words, list):
        raise RulebookError("발음 규정집: words 는 목록이어야 한다")
    out, seen = [], set()
    for i, w in enumerate(words):
        if not isinstance(w, dict) or not isinstance(w.get("write"), str) or not isinstance(w.get("say"), str):
            raise RulebookError(f"발음 규정집 words[{i}]: write·say 문자열이 있어야 한다")
        a, b = w["write"], w["say"]
        if not _HANGUL.match(a) or not _HANGUL.match(b):
            raise RulebookError(f"발음 규정집 words[{i}]: 한글 낱말만 적는다({a!r} → {b!r})")
        if len(a) != len(b):
            raise RulebookError(f"발음 규정집 words[{i}]: write 와 say 의 글자 수가 같아야 한다({a!r} {len(a)}자 → {b!r} {len(b)}자)")
        if a == b:
            raise RulebookError(f"발음 규정집 words[{i}]: write 와 say 가 같다({a!r})")
        if a in seen:
            raise RulebookError(f"발음 규정집 words[{i}]: {a!r} 가 두 번 적혀 있다")
        seen.add(a)
        out.append((a, b))
    for a, _ in out:                      # say 가 다른 항목의 write 를 다시 만들면 적용 순서에 따라 결과가 달라진다
        for _, b in out:
            if a in b:
                raise RulebookError(f"발음 규정집: {b!r}(say) 안에 다른 항목의 write {a!r} 가 들어 있다")
    return sorted(out, key=lambda ab: (-len(ab[0]), ab[0]))


@lru_cache(maxsize=4)
def load_rulebook(path: str | None = None) -> tuple[tuple[str, str], ...]:
    """config/pronunciation.json → ((write, say), …). 파일이 없으면 빈 규정집."""
    p = Path(path) if path else RULEBOOK
    if not p.is_file():
        return ()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as ex:
        raise RulebookError(f"발음 규정집을 읽을 수 없다({p}): {ex}") from ex
    return tuple(check_rulebook(data))


def apply_rulebook(tts: str, rules: tuple[tuple[str, str], ...] | None = None) -> tuple[str, list[tuple[str, str]]]:
    """발음 텍스트의 규정집 낱말을 표준 발음 표기로 바꾼다 → (바뀐 텍스트, [(write, say)] 실제로 바뀐 것). 글자 수는 그대로."""
    rules = load_rulebook() if rules is None else rules
    done = []
    for a, b in rules:
        if a in tts:
            tts = tts.replace(a, b)
            done.append((a, b))
    return tts, done


def lint_tts(tts: str) -> str:
    """발음 텍스트에 숫자·라틴 문자·%·~·/·:·→·괄호·대괄호(그리고 단위 기호 °·μ, 수식 기호, 하이픈·대시)가 남으면 오류. 통과하면 그대로 돌려준다."""
    if not tts.strip():
        raise TtsLintError("발음 텍스트가 비었다")
    bad = [(i, c) for i, c in enumerate(tts) if FORBIDDEN.match(c)]
    if bad:
        shown = ", ".join(f"{c!r}@{i}" for i, c in bad[:12])
        raise TtsLintError(f"발음 텍스트에 읽으면 안 되는 문자 {len(bad)}개: {shown} — {tts!r}\n"
                           "  숫자·단위는 한국어로, 복합 단위(km/s 등)는 '초속 … 킬로미터'처럼 명시 tts 로 쓰세요.")
    return tts
