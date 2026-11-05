"""Deterministic test fixture for the render/audio toolkit (no TTS involved).

  python pipeline/render/tests/make_fixture.py --json            # rewrite tests/fixtures/timeline.sample.json
  python pipeline/render/tests/make_fixture.py --out DIR         # DIR/timeline.json + narration.wav + captions.srt

narration.wav is a synthetic stand-in: a 180 Hz buzz with a ~6 Hz syllable envelope inside each
sentence span and silence elsewhere. It only lets the mixer/ducking/finish/validate stages run;
it is NOT a voice and never a substitute for the M3 narration. WAVs are not committed.
Only the Python standard library + numpy/soundfile are used (soundfile only for --out).
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "timeline.sample.json"
SR = 44100

SENTENCES = [
    ("s01", "hook", "얼음이 물에 뜨는 이유를 살펴봅니다.", None),
    ("s02", "hook", "같은 부피에서는 얼음이 물보다 가볍습니다.", None),
    ("s03", "mechanism", "물이 얼 때 분자들은 수소 결합으로 육각형 틀을 만듭니다.", None),
    ("s04", "mechanism", "이 틀에는 빈 공간이 많아 밀도가 약 9% 낮아집니다.", "이 틀에는 빈 공간이 많아 밀도가 약 구 퍼센트 낮아집니다."),
    ("s05", "close", "그래서 얼음은 물 위에 뜹니다.", None),
]
LEAD, TAIL, SCENE_LEAD, GAP = 1.0, 0.8, 0.4, 0.4
SEC_PER_CHAR = 0.1  # rough non-space syllable pace (fixture only)


def split_cues(text: str, max_chars: int = 18) -> list[str]:
    words, cues, cur = text.split(), [], []
    for w in words:
        if cur and sum(len(x) for x in cur + [w]) > max_chars:
            cues.append(" ".join(cur)); cur = []
        cur.append(w)
    if cur:
        cues.append(" ".join(cur))
    return cues


def build() -> dict:
    t, prev_scene, sents = LEAD, None, []
    for sid, scene, text, tts in SENTENCES:
        spoken = tts or text
        if prev_scene is not None and scene != prev_scene:
            t += SCENE_LEAD
        n = len(spoken.replace(" ", ""))
        dur = round(n * SEC_PER_CHAR + 0.25, 3)
        start, end = round(t, 3), round(t + dur, 3)
        # character timings: spaces get 0.03 s, others share the rest evenly
        nspace = spoken.count(" ")
        step = (dur - 0.03 * nspace) / max(1, n)
        chars, c = [], start
        for ch in spoken:
            d = 0.03 if ch == " " else step
            chars.append({"c": ch, "start": round(c, 3), "end": round(c + d, 3)})
            c += d
        chars[-1]["end"] = end
        sents.append({"id": sid, "scene": scene, "text": text, "tts": spoken, "start": start, "end": end, "gap": GAP,
                      "chars": chars, "alignment": {"source": "synthetic_fixture", "score_mean": None},
                      "final_fall": {"applied": spoken.rstrip(".?! ").endswith("니다")},
                      "audio": {"raw_mp3": None, "npy": None, "trim_offset": 0.0}})
        t = end + GAP
        prev_scene = scene
    duration = round(sents[-1]["end"] + TAIL, 3)
    scenes = []
    for s in sents:
        if not scenes or scenes[-1]["id"] != s["scene"]:
            st = 0.0 if not scenes else round(s["start"] - SCENE_LEAD, 3)
            if scenes:
                scenes[-1]["end"] = st
            scenes.append({"id": s["scene"], "start": st, "end": None, "sentence_ids": []})
        scenes[-1]["sentence_ids"].append(s["id"])
    scenes[-1]["end"] = duration
    captions = []
    for s in sents:
        parts = split_cues(s["text"])
        total = sum(len(p.replace(" ", "")) for p in parts)
        c = s["start"]
        for p in parts:
            d = (s["end"] - s["start"]) * len(p.replace(" ", "")) / total
            captions.append({"sentence": s["id"], "text": p, "start": round(c, 3), "end": round(c + d, 3)})
            c += d
    return {"schema_version": 1, "title": "얼음은 왜 물에 뜰까", "language": "ko",
            "voice": "FIXTURE (synthetic buzz, not a voice)", "degraded": False, "sample_rate": SR,
            "duration": duration, "lead_sec": LEAD, "tail_sec": TAIL, "scenes": scenes, "sentences": sents, "captions": captions}


def srt_time(t: float) -> str:
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_outputs(tl: dict, out: Path) -> None:
    import numpy as np
    import soundfile as sf
    out.mkdir(parents=True, exist_ok=True)
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1) + "\n")
    n = round(tl["duration"] * SR)
    y = np.zeros(n, dtype=np.float32)
    for s in tl["sentences"]:
        a, b = round(s["start"] * SR), round(s["end"] * SR)
        tt = np.arange(b - a) / SR
        env = 0.55 + 0.45 * np.sin(2 * np.pi * 6.0 * tt) ** 2
        ramp = np.minimum(1, np.minimum(tt / 0.02, (tt[-1] - tt) / 0.02 + 1e-9))
        y[a:b] = 0.35 * env * ramp * (np.sin(2 * np.pi * 180 * tt) + 0.3 * np.sin(2 * np.pi * 360 * tt))
    sf.write(out / "narration.wav", y, SR, subtype="PCM_16")
    srt = "".join(f"{i}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}\n\n" for i, c in enumerate(tl["captions"], 1))
    (out / "captions.srt").write_text(srt)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="rewrite the committed fixture JSON")
    ap.add_argument("--out", type=Path, help="write timeline.json, narration.wav, captions.srt here")
    a = ap.parse_args()
    tl = build()
    if a.json:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(tl, ensure_ascii=False, indent=1) + "\n")
        print(FIXTURE, tl["duration"], "s")
    if a.out:
        write_outputs(tl, a.out)
        print(a.out, tl["duration"], "s")


if __name__ == "__main__":
    main()
