"""자막만 다시 만든다 — 음성·정렬은 그대로 두고 timeline.json 의 captions 와 captions.srt 를 새 규칙으로 다시 쓴다.

  python pipeline/narration/recaption.py outputs/<slug>/narration [--check] [--max-chars 18]

타임라인의 문장별 글자 시각(sentences[].chars)과 표시·발음 텍스트(text, tts)로 captions.cue_times 를 다시 돌린다.
합성·정렬을 다시 하지 않으므로 목소리 설정(config/voice-overrides.json)이 바뀐 뒤에도 이전 편의 음성을 건드리지 않는다.
--check: 아무것도 쓰지 않고, 현재 자막과 새 규칙의 자막이 다른 문장만 출력한다(종료 코드 1 = 다름).
첫 사용: 2026-11-07 숫자·단위 붙여 두기 규칙(captions.number_glue) 소급 적용.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pipeline.narration import captions as cap  # noqa: E402


def rebuild(timeline: dict, max_chars: int) -> list[cap.Cue]:
    cues: list[cap.Cue] = []
    for s in timeline["sentences"]:
        chars = s.get("chars") or None
        if timeline.get("degraded") or not chars:
            chars = None
        cues += cap.cue_times(s["id"], s["text"], s["tts"], chars, (s["start"], s["end"]), max_chars)
    for w in cap.fit_cues(cues):
        print("경고: " + w, file=sys.stderr)
    return cues


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("narration_dir", help="outputs/<slug>/narration (timeline.json, captions.srt)")
    ap.add_argument("--check", action="store_true", help="쓰지 않고 달라질 문장만 보인다")
    ap.add_argument("--max-chars", type=int, default=cap.MAX_CHARS)
    a = ap.parse_args()
    d = Path(a.narration_dir)
    tl_path = d / "timeline.json"
    tl = json.loads(tl_path.read_text(encoding="utf-8"))
    new = rebuild(tl, a.max_chars)
    old_by = {}
    for c in tl.get("captions", []):
        old_by.setdefault(c["sentence"], []).append(c["text"])
    new_by = {}
    for c in new:
        new_by.setdefault(c.sentence, []).append(c.text)
    changed = [sid for sid in new_by if new_by[sid] != old_by.get(sid)]
    for sid in changed:
        print(f"{sid}: {' | '.join(old_by.get(sid, []))}\n   → {' | '.join(new_by[sid])}")
    if a.check:
        return 1 if changed else 0
    tl["captions"] = [c.to_dict() for c in new]
    tl_path.write_text(json.dumps(tl, ensure_ascii=False, indent=2), encoding="utf-8")
    cap.write_srt(new, d / "captions.srt")
    print(f"recaption: {d} — {len(new)} cues, {len(changed)} sentence(s) changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
