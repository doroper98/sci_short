"""Automatic checks on a finished episode output directory (standard library + ffprobe only).

  python pipeline/validate.py outputs/<slug> [--mp4 F] [--srt F] [--timeline F] [--max-sec 180]

Expected layout (what run.sh produces):
  outputs/<slug>/narration/timeline.json      outputs/<slug>/stills/contact-sheet.jpg
  outputs/<slug>/final/<slug>.mp4 (+ .srt, validation.json)

Prints a PASS/WARN/FAIL table and writes <dir>/validate.json. Exit 1 if any FAIL.
These are functional checks. They do not replace watching the video and listening on a phone.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

CAPTION_SIZE_PX, CAPTION_MAX_WIDTH_PX = 44, 840  # width + maxChars wrap; keep in sync with pipeline/render/captions.mjs CAPTION_DEFAULTS
MAX_LINES, MAX_LINE_CHARS = 2, 22


def char_em(ch: str) -> float:
    """Rough advance width in em for Noto Sans KR."""
    o = ord(ch)
    if ch == " ":
        return 0.23
    if 0xAC00 <= o <= 0xD7A3 or 0x3130 <= o <= 0x318F or 0x4E00 <= o <= 0x9FFF:
        return 1.0
    if ch in ".,:;!?'\"()[]·-":
        return 0.3
    if ch.isascii():
        return 0.58
    return 0.9


def wrap_estimate(text: str, max_em: float) -> list[str]:
    text = re.sub(r"\*\*", "", text)
    lines = []
    for para in text.split("\n"):
        cur = ""
        for w in para.split():
            cand = f"{cur} {w}" if cur else w
            if (sum(map(char_em, cand)) <= max_em and len(cand) <= MAX_LINE_CHARS) or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def parse_srt(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").strip()
    cues = []
    ts = re.compile(r"(\d+):(\d\d):(\d\d)[,.](\d{3})")
    for block in re.split(r"\n\s*\n", raw):
        lines = block.strip().split("\n")
        if len(lines) < 3 or "-->" not in lines[1]:
            raise ValueError(f"bad SRT block: {block[:60]!r}")
        a, b = (ts.search(x) for x in lines[1].split("-->"))
        if not a or not b:
            raise ValueError(f"bad SRT time line: {lines[1]!r}")
        sec = lambda m: int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) + int(m[4]) / 1000
        cues.append({"index": int(lines[0]), "start": sec(a), "end": sec(b), "text": "\n".join(lines[2:])})
    return cues


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir", type=Path)
    ap.add_argument("--mp4", type=Path)
    ap.add_argument("--srt", type=Path)
    ap.add_argument("--timeline", type=Path)
    ap.add_argument("--max-sec", type=float, default=180.0)
    a = ap.parse_args()
    d = a.dir
    rows: list[tuple[str, str, str]] = []
    add = lambda name, ok, detail, warn=False: rows.append((name, "PASS" if ok else ("WARN" if warn else "FAIL"), detail))

    mp4 = a.mp4
    if not mp4:
        cands = sorted((d / "final").glob("*.mp4")) or [p for p in sorted(d.glob("*.mp4")) if p.name not in ("visual.mp4",)]
        mp4 = cands[0] if cands else None
    add("mp4 exists", bool(mp4 and mp4.exists()), str(mp4) if mp4 else "no final mp4 found")
    tlp = a.timeline or next((p for p in [d / "narration" / "timeline.json", d / "timeline.json"] if p.exists()), None)
    tl = json.loads(tlp.read_text()) if tlp else None
    add("timeline found", tl is not None, str(tlp) if tlp else "narration/timeline.json missing")

    duration = None
    if mp4 and mp4.exists():
        pr = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(mp4)]))
        v = next((s for s in pr["streams"] if s["codec_type"] == "video"), None)
        au = [s for s in pr["streams"] if s["codec_type"] == "audio"]
        duration = float(pr["format"]["duration"])
        add("duration ≤ max", duration <= a.max_sec + 0.05, f"{duration:.2f}s (max {a.max_sec:.0f}s)")
        add("1080×1920", bool(v) and (v["width"], v["height"]) == (1080, 1920), f"{v and v['width']}×{v and v['height']}")
        add("30 fps", bool(v) and v.get("r_frame_rate") == "30/1" and v.get("avg_frame_rate") in ("30/1",), f"r={v and v.get('r_frame_rate')} avg={v and v.get('avg_frame_rate')}")
        add("yuv420p", bool(v) and v.get("pix_fmt") == "yuv420p", str(v and v.get("pix_fmt")))
        add("H.264", bool(v) and v.get("codec_name") == "h264", str(v and v.get("codec_name")))
        kor = [s for s in au if (s.get("tags") or {}).get("language") == "kor"]
        add("Korean audio track", bool(kor), f"{len(au)} audio stream(s); language={[ (s.get('tags') or {}).get('language') for s in au]}")
        if v and au:
            dv, da = float(v.get("duration", duration)), float(au[0].get("duration", duration))
            add("A/V durations match", abs(dv - da) <= 0.1, f"video {dv:.3f}s audio {da:.3f}s")
        if tl:
            add("mp4 matches timeline", abs(duration - float(tl["duration"])) <= 0.1, f"mp4 {duration:.3f}s timeline {float(tl['duration']):.3f}s")

    srt = a.srt or (mp4.with_suffix(".srt") if mp4 and mp4.with_suffix(".srt").exists() else None) or next(
        (p for p in [d / "narration" / "captions.srt", d / "captions.srt"] if p.exists()), None)
    cues = None
    try:
        cues = parse_srt(srt) if srt else None
        add("SRT parses", cues is not None and len(cues) > 0, f"{srt} ({len(cues) if cues else 0} cues)")
    except ValueError as e:
        add("SRT parses", False, f"{srt}: {e}")
    if cues:
        overl = [c["index"] for p, c in zip(cues, cues[1:]) if c["start"] < p["end"] - 1e-3]
        bad = [c["index"] for c in cues if not c["end"] > c["start"]]
        add("cues ordered, non-overlapping", not overl and not bad, f"overlaps {overl[:5]} empty {bad[:5]}" if overl or bad else "ok")
        lim = duration or (float(tl["duration"]) if tl else None)
        if lim:
            outside = [c["index"] for c in cues if c["start"] < 0 or c["end"] > lim + 0.05]
            add("cues inside duration", not outside, f"outside: {outside[:5]}" if outside else f"last cue ends {cues[-1]['end']:.2f}s")
        max_em = CAPTION_MAX_WIDTH_PX / CAPTION_SIZE_PX
        problems = []
        for c in cues:
            ls = wrap_estimate(c["text"], max_em)
            if len(ls) > MAX_LINES or any(len(x) > MAX_LINE_CHARS for x in ls):
                problems.append(f"#{c['index']} {len(ls)} lines / {max(map(len, ls))} chars")
        add(f"captions ≤{MAX_LINES} lines, ≤{MAX_LINE_CHARS} chars/line", not problems, "; ".join(problems[:4]) or f"estimate at {CAPTION_SIZE_PX}px/{CAPTION_MAX_WIDTH_PX}px")
    if cues and tl:
        tc = tl.get("captions") or []
        strip = lambda s: re.sub(r"\*\*", "", re.sub(r"\s+", " ", s)).strip()
        same_n = len(tc) == len(cues)
        mism = [c["index"] for c, t in zip(cues, tc) if strip(c["text"]) != strip(t["text"]) or abs(c["start"] - t["start"]) > 0.05 or abs(c["end"] - t["end"]) > 0.05]
        add("SRT = timeline.captions", same_n and not mism, f"srt {len(cues)} vs timeline {len(tc)} cues; mismatched {mism[:5]}" if not (same_n and not mism) else f"{len(cues)} cues match (±50 ms)")
        sp = [(s["start"], s["end"]) for s in tl.get("sentences", [])]
        orphan = [c["index"] for c in cues if not any(c["start"] < e + 0.2 and c["end"] > s - 0.2 for s, e in sp)]
        add("cues overlap spoken sentences", not orphan, f"cues outside speech: {orphan[:5]}" if orphan else "ok")
    sheet = d / "stills" / "contact-sheet.jpg"
    stills = sorted((d / "stills").glob("still_*.jpg")) if (d / "stills").exists() else []
    add("review stills + contact sheet", sheet.exists() and len(stills) > 0, f"{len(stills)} stills, contact sheet {'present' if sheet.exists() else 'missing'}")
    if tl:
        deg = bool(tl.get("degraded"))
        add("timeline not degraded", not deg, f"degraded={deg} voice={tl.get('voice')!r}", warn=True)
    vj = mp4.with_name("validation.json") if mp4 else None
    add("finish validation.json", bool(vj and vj.exists()), str(vj) if vj else "-", warn=True)

    w = max(len(r[0]) for r in rows)
    print(f"validate {d}")
    for name, status, detail in rows:
        print(f"  {status:4s}  {name:<{w}}  {detail}")
    fails = [r for r in rows if r[1] == "FAIL"]
    overall = "FAIL" if fails else "PASS"
    print(f"RESULT: {overall}  ({len(rows) - len(fails)}/{len(rows)} not failing)")
    (d / "validate.json").write_text(json.dumps({"result": overall, "max_sec": a.max_sec, "mp4": str(mp4) if mp4 else None,
                                                 "checks": [{"check": n, "status": s, "detail": x} for n, s, x in rows],
                                                 "not_checked": ["direct viewing", "listening", "phone playback", "science correctness",
                                                                 "pronunciation", "caption covering key phenomenon"]},
                                                ensure_ascii=False, indent=2) + "\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
