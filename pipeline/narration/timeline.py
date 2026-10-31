"""문장 배치와 장면 경계 — 시간 압축 없음.

- 커서는 lead_sec 에서 시작한다. 문장 = [커서, 커서 + 트림된 음성 길이], 그 뒤 커서 += gap(문장 값, 없으면 default_gap_sec).
- 마지막 문장 뒤에는 gap 대신 tail_sec: duration = 마지막 문장 끝 + tail_sec.
- 장면 k 시작 = max(앞 장면 마지막 문장 끝, 장면 첫 문장 시작 − scene_lead_sec). 첫 장면 시작 = 0.
  장면 끝 = 다음 장면 시작, 마지막 장면 끝 = duration.
"""

from __future__ import annotations

from dataclasses import dataclass

from pipeline.narration.script_schema import Script


@dataclass(frozen=True)
class Placed:
    id: str
    scene: str
    start: float
    end: float
    gap: float


def place_sentences(script: Script, durations: dict[str, float]) -> tuple[list[Placed], float]:
    t = script.lead_sec
    out: list[Placed] = []
    for k, s in enumerate(script.sentences):
        d = durations[s.id]
        if d <= 0:
            raise ValueError(f"{s.id}: 음성 길이 {d}")
        gap = script.gap_of(s)
        out.append(Placed(s.id, s.scene, t, t + d, gap))
        t = t + d + (gap if k + 1 < len(script.sentences) else 0.0)
    duration = out[-1].end + script.tail_sec
    return out, duration


def scene_bounds(script: Script, placed: list[Placed], duration: float) -> list[dict]:
    order = script.scene_order()
    by_scene: dict[str, list[Placed]] = {}
    for p in placed:
        by_scene.setdefault(p.scene, []).append(p)
    starts: list[float] = []
    for k, sc in enumerate(order):
        if k == 0:
            starts.append(0.0)
            continue
        prev_end = by_scene[order[k - 1]][-1].end
        starts.append(max(prev_end, by_scene[sc][0].start - script.scene_lead_sec))
    return [{"id": sc, "start": starts[k], "end": starts[k + 1] if k + 1 < len(order) else duration,
             "sentence_ids": [p.id for p in by_scene[sc]]} for k, sc in enumerate(order)]
