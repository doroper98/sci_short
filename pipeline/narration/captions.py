"""자막 큐 — 문장을 의미 단위로 나누고 실제 글자 정렬 시각에 맞춘다. SRT 도 쓴다.

나누기(split_cues)
- 공백에서만 자른다. 큐 하나 = 공백 아닌 글자 max_chars(기본 18) 이하. 렌더러가 두 줄 안에 그린다고 본다.
- 문장이 max_chars 이하면 한 큐. 넘으면 큐 수가 가장 적은 분할 중 절(쉼표·연결 어미) 경계를 고르고, 아주 짧은 큐를 피한다.
- 공백 없는 한 어절이 max_chars 를 넘으면 그 어절 하나가 한 큐(자르지 않는다).

시각(cue_times)
- 표시 텍스트(text)와 발음 텍스트(tts)가 다를 수 있다(2.45 GHz ↔ 이 점 사오 기가헤르츠). 공백을 뺀 두 문자열을
  difflib 로 맞춰 같은 글자는 1:1, 다른 구간은 순서대로 비례 대응한다(map_display_to_tts). 시각 자체는 정렬 결과(chars)다.
- 큐 시작 = 큐 첫 글자(공백 아님)에 대응하는 발음 글자의 시작, 끝 = 마지막 글자에 대응하는 발음 글자의 끝(타임라인 절대 시각).
- degraded(정렬 없음): 문장 구간 [start+PRE, end−POST] 안에서 표시 글자 수 비례(명시적으로 degraded 표시).
- 후처리: 최소 0.3 초, 겹침 없음(fit_cues).
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from pathlib import Path

MAX_CHARS = 18
MIN_CUE_SEC = 0.3
CUE_COST = 100.0
NON_CLAUSE_BREAK = 25.0
CONNECTIVE_BREAK = 8.0
SHORT_CUE = 15.0
SHORT_CUE_CHARS = 6
COMMA_END = re.compile(r"[,，;]$")
CONNECTIVE_END = re.compile(r"(고|며|면|서|지만|는데|니까|도록|려고|면서|다가|듯이|므로|자)$")


@dataclass
class Cue:
    sentence: str
    text: str
    start: float
    end: float

    def to_dict(self) -> dict:
        return {"sentence": self.sentence, "text": self.text, "start": round(self.start, 3), "end": round(self.end, 3)}


def nchars(s: str) -> int:
    return sum(1 for c in s if not c.isspace())


def _break_cost(word: str) -> float:
    if COMMA_END.search(word):
        return 0.0
    if CONNECTIVE_END.search(word.rstrip(".!?…\"'”’")):
        return CONNECTIVE_BREAK
    return NON_CLAUSE_BREAK


def split_cues(text: str, max_chars: int = MAX_CHARS) -> list[str]:
    words = text.split()
    n = len(words)
    if n == 0:
        return []
    if nchars(text) <= max_chars:
        return [" ".join(words)]
    best: list[tuple[float, int]] = [(0.0, -1)] + [(float("inf"), -1)] * n
    for i in range(1, n + 1):
        for j in range(i - 1, -1, -1):
            size = sum(nchars(w) for w in words[j:i])
            if size > max_chars and i - j > 1:
                break
            if best[j][0] == float("inf"):
                continue
            c = best[j][0] + CUE_COST
            if i < n:
                c += _break_cost(words[i - 1])
            if size < SHORT_CUE_CHARS:
                c += SHORT_CUE
            if c < best[i][0]:
                best[i] = (c, j)
    out: list[str] = []
    i = n
    while i > 0:
        j = best[i][1]
        out.append(" ".join(words[j:i]))
        i = j
    return out[::-1]


def map_display_to_tts(text: str, tts: str) -> list[tuple[int, int]]:
    """표시 텍스트의 공백 아닌 글자마다 → 발음 텍스트(공백 포함 원래 색인)의 [시작 색인, 끝 색인]. 끝 < 시작 이면 길이 0(시각만 이음)."""
    d = [c for c in text if not c.isspace()]
    t_idx = [k for k, c in enumerate(tts) if not c.isspace()]
    t = [tts[k] for k in t_idx]
    if not t:
        raise ValueError("발음 텍스트에 글자가 없다")
    rng: list[list[int]] = [[0, -1] for _ in d]
    sm = difflib.SequenceMatcher(None, d, t, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                rng[i1 + k] = [j1 + k, j1 + k]
        elif op == "replace":
            nd, nt = i2 - i1, j2 - j1
            for k in range(nd):
                a = j1 + (k * nt) // nd
                b = j1 + -(-((k + 1) * nt) // nd) - 1
                rng[i1 + k] = [a, max(a, b)]
        elif op == "delete":   # 발음이 없는 표시 글자(문장부호 등) — 앞 발음 글자 끝에 길이 0
            for k in range(i1, i2):
                rng[k] = [j1, j1 - 1]
        elif op == "insert":   # 표시 글자가 없는 발음 — 앞 표시 글자(없으면 뒤 글자)에 붙인다
            if i1 > 0:
                rng[i1 - 1][1] = max(rng[i1 - 1][1], j2 - 1)
                if rng[i1 - 1][0] > rng[i1 - 1][1]:
                    rng[i1 - 1][0] = j1
            elif d:
                rng[0] = [j1, max(rng[0][1], j2 - 1)]
    out = []
    for a, b in rng:
        a_c = min(max(a, 0), len(t) - 1)
        if b < a:   # 길이 0 — a 앞 글자의 끝 시각에 둔다(표시: 시작 색인 = 끝 색인 = -1 은 처음)
            out.append((t_idx[a_c], -1 if a <= 0 else t_idx[a - 1]))
        else:
            out.append((t_idx[a_c], t_idx[min(b, len(t) - 1)]))
    return out


def _range_time(r: tuple[int, int], chars: list[dict], which: str) -> float:
    a, b = r
    if b == -1 and a == 0 and which == "start":
        return chars[0]["start"]
    if b < a:   # 길이 0 → 앞 글자 끝(없으면 첫 글자 시작)
        return chars[b]["end"] if b >= 0 else chars[0]["start"]
    return chars[a]["start"] if which == "start" else chars[b]["end"]


def cue_times(sentence_id: str, text: str, tts: str, chars: list[dict] | None, span: tuple[float, float],
              max_chars: int = MAX_CHARS, pre_sec: float = 0.03, post_sec: float = 0.12) -> list[Cue]:
    """문장 하나의 큐. chars = 타임라인 절대 시각의 발음 글자 목록(공백 포함, tts 와 같은 길이) — None 이면 degraded 비례."""
    parts = split_cues(text, max_chars)
    if not parts:
        return []
    sizes = [nchars(p) for p in parts]
    if chars is None:
        s0, s1 = span[0] + pre_sec, span[1] - post_sec
        if s1 <= s0:
            s0, s1 = span
        total = sum(sizes)
        out, acc = [], 0
        for p, n in zip(parts, sizes):
            a = s0 + (s1 - s0) * acc / total
            acc += n
            out.append(Cue(sentence_id, p, a, s0 + (s1 - s0) * acc / total))
        return out
    if len(chars) != len(tts) or "".join(c["c"] for c in chars) != tts:
        raise ValueError(f"{sentence_id}: chars 가 발음 텍스트와 다르다")
    rng = map_display_to_tts(text, tts)
    out, pos = [], 0
    for p, n in zip(parts, sizes):
        first, last = rng[pos], rng[pos + n - 1]
        a = _range_time(first, chars, "start")
        b = _range_time(last, chars, "end")
        out.append(Cue(sentence_id, p, a, max(a, b)))
        pos += n
    return out


def fit_cues(cues: list[Cue], min_sec: float = MIN_CUE_SEC) -> list[str]:
    """최소 길이·겹침 없음을 맞춘다(제자리). → 경고 목록(이웃이 너무 가까워 최소 길이를 못 채운 큐)."""
    warns = []
    for k, c in enumerate(cues):
        lo = cues[k - 1].end if k else 0.0
        hi = cues[k + 1].start if k + 1 < len(cues) else float("inf")
        c.start = max(c.start, lo)
        c.end = max(c.end, c.start + min_sec)
        if c.end > hi:
            c.end = hi
            c.start = max(lo, min(c.start, c.end - min_sec))
        if c.end - c.start < min_sec - 1e-9:
            warns.append(f"자막 {c.sentence} {c.text!r}: {c.end - c.start:.2f}s < {min_sec}s (이웃 큐가 너무 가깝다)")
    return warns


def _srt_time(t: float) -> str:
    ms = int(round(max(t, 0.0) * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(cues: list[Cue]) -> str:
    return "".join(f"{k}\n{_srt_time(c.start)} --> {_srt_time(c.end)}\n{c.text}\n\n" for k, c in enumerate(cues, 1))


def write_srt(cues: list[Cue], path: Path) -> None:
    Path(path).write_text(to_srt(cues), encoding="utf-8")
