"""narration script.json(v1) 검증.

    {"title": "…", "language": "ko", "lead_sec": 1.0, "tail_sec": 0.8, "scene_lead_sec": 0.4, "default_gap_sec": 0.6,
     "sentences": [{"id": "s01", "scene": "hook", "text": "표시용 문장입니다.", "tts": "선택: 발음용 문장입니다.", "gap": 0.8}]}

- 모르는 키는 오류(오타가 조용히 무시되지 않게). 주석이 필요하면 "notes"(문자열) 를 쓴다.
- id·scene 은 파일 이름에 들어가므로 [A-Za-z0-9_-] 만. id 는 유일, 같은 scene 의 문장은 연속해야 한다.
- lead_sec·tail_sec·scene_lead_sec·default_gap_sec 는 생략하면 1.0·0.8·0.4·0.6.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

TOP_KEYS = {"title", "language", "lead_sec", "tail_sec", "scene_lead_sec", "default_gap_sec", "sentences", "notes"}
SENTENCE_KEYS = {"id", "scene", "text", "tts", "gap", "notes"}
DEFAULTS = {"lead_sec": 1.0, "tail_sec": 0.8, "scene_lead_sec": 0.4, "default_gap_sec": 0.6}
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class ScriptError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("script.json 오류 " + str(len(errors)) + "건:\n  " + "\n  ".join(errors))


@dataclass(frozen=True)
class Sentence:
    id: str
    scene: str
    text: str
    tts: Optional[str]
    gap: Optional[float]


@dataclass(frozen=True)
class Script:
    title: str
    language: str
    lead_sec: float
    tail_sec: float
    scene_lead_sec: float
    default_gap_sec: float
    sentences: tuple[Sentence, ...]

    def gap_of(self, s: Sentence) -> float:
        return self.default_gap_sec if s.gap is None else s.gap

    def scene_order(self) -> list[str]:
        out: list[str] = []
        for s in self.sentences:
            if not out or out[-1] != s.scene:
                out.append(s.scene)
        return out


def _num(v, where: str, errs: list[str]) -> Optional[float]:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
        errs.append(f"{where}: 0 이상의 숫자여야 한다 (지금 {v!r})")
        return None
    return float(v)


def validate_script(d: object) -> Script:
    errs: list[str] = []
    if not isinstance(d, dict):
        raise ScriptError(["최상위는 객체여야 한다"])
    if "segments" in d:
        errs.append("옛 'segments' 형식은 받지 않는다 — 'sentences' 를 쓴다")
    for k in sorted(set(d) - TOP_KEYS):
        errs.append(f"모르는 최상위 키 {k!r} (허용: {sorted(TOP_KEYS)})")
    title = d.get("title")
    if not isinstance(title, str) or not title.strip():
        errs.append("title: 비어 있지 않은 문자열")
    if d.get("language") != "ko":
        errs.append(f"language: 'ko' 여야 한다 (지금 {d.get('language')!r})")
    nums = {k: _num(d.get(k, v), k, errs) for k, v in DEFAULTS.items()}
    sents_raw = d.get("sentences")
    sents: list[Sentence] = []
    if not isinstance(sents_raw, list) or not sents_raw:
        errs.append("sentences: 비어 있지 않은 배열")
        sents_raw = []
    seen: set[str] = set()
    for n, s in enumerate(sents_raw):
        w = f"sentences[{n}]"
        if not isinstance(s, dict):
            errs.append(f"{w}: 객체여야 한다")
            continue
        for k in sorted(set(s) - SENTENCE_KEYS):
            errs.append(f"{w}: 모르는 키 {k!r} (허용: {sorted(SENTENCE_KEYS)})")
        sid, scene, text, tts, gap = s.get("id"), s.get("scene"), s.get("text"), s.get("tts"), s.get("gap")
        if not isinstance(sid, str) or not ID_RE.match(sid):
            errs.append(f"{w}.id: [A-Za-z0-9_-] 1~64자 (지금 {sid!r})")
        elif sid in seen:
            errs.append(f"{w}.id: 중복 {sid!r}")
        else:
            seen.add(sid)
        if not isinstance(scene, str) or not ID_RE.match(scene):
            errs.append(f"{w}.scene: [A-Za-z0-9_-] 1~64자 (지금 {scene!r})")
        if not isinstance(text, str) or not text.strip():
            errs.append(f"{w}.text: 비어 있지 않은 문자열")
        if tts is not None and (not isinstance(tts, str) or not tts.strip()):
            errs.append(f"{w}.tts: 생략하거나 비어 있지 않은 문자열")
        g = None if gap is None else _num(gap, f"{w}.gap", errs)
        sents.append(Sentence(str(sid), str(scene), str(text).strip() if isinstance(text, str) else "",
                              tts.strip() if isinstance(tts, str) else None, g))
    # 같은 scene 은 연속
    closed: set[str] = set()
    prev = None
    for s in sents:
        if s.scene != prev:
            if s.scene in closed:
                errs.append(f"scene {s.scene!r} 의 문장이 연속하지 않는다({s.id}) — 장면은 한 덩어리여야 한다")
            if prev is not None:
                closed.add(prev)
            prev = s.scene
    if errs:
        raise ScriptError(errs)
    return Script(title=title.strip(), language="ko", sentences=tuple(sents), **nums)  # type: ignore[arg-type]


def load_script(path: Path) -> Script:
    try:
        d = json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as ex:
        raise ScriptError([f"JSON 문법 오류: {ex}"]) from ex
    return validate_script(d)
