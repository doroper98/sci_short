"""Automatic checks on a finished episode output directory (standard library + ffprobe only).

  python pipeline/validate.py outputs/<slug> [--mp4 F] [--srt F] [--timeline F] [--max-sec 180] [--hdr auto|require|skip]
                               [--allow-static-open "<까닭>"]

Expected layout (what run.sh produces):
  outputs/<slug>/narration/timeline.json      outputs/<slug>/stills/contact-sheet.jpg
  outputs/<slug>/final/<slug>.mp4 (+ .srt, validation.json)
  outputs/<slug>/final/hdr/<slug>.hdr.mp4      HDR version for YouTube (2026-11-15 user: "다음 편부터 hdr 적용해")

--hdr auto (default) checks the HDR version only when the file exists (no file = no HDR rows, so older episodes
validate as before). require also FAILs when it is missing (new episodes' run.sh passes this); skip adds one WARN row.

First moment (pipeline/first_moment.py, config/first_moment.json; docs/CHANNEL_GROWTH.md 9절 방안 2, applied under the
2026-11-16 user statement "어 너가 생각하는 모든 것들을 다 적용해봐. 무한한 권한과 지지를 보낸다"): how much of the screen changes
by 1 s / 2 s and when the first sound starts. The result is written as "first_moment" into validate.json and into
final/validation.json (which goes to finals/). Not passing is FAIL only for new-format episodes (timeline lead_sec ≤ 0.3);
older episodes get a WARN row. --allow-static-open "<까닭>" (or env ALLOW_STATIC_OPEN, so run.sh needs no change) turns the
FAIL into a WARN and records the reason as "first_moment_waiver" — for topics where a result-first opening is impossible.

Prints a PASS/WARN/FAIL table and writes <dir>/validate.json. Exit 1 if any FAIL.
These are functional checks. They do not replace watching the video and listening on a phone.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from pipeline import first_moment as fmod
except ImportError:          # python pipeline/validate.py (script dir on sys.path, not the repo root)
    import first_moment as fmod

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


def hdr_rows(pr: dict | None, sdr_duration: float | None, hdr_path: str, slug: str) -> list[tuple[str, str, str]]:
    """HDR version checks from ffprobe JSON (-show_format -show_streams). pr None = file missing. Pure function."""
    rows: list[tuple[str, str, str]] = []
    add = lambda name, ok, detail: rows.append((name, "PASS" if ok else "FAIL", detail))
    if pr is None:
        add("HDR 판 exists", False, f"{hdr_path} missing — make it with episodes/{slug}/run.sh hdr")
        return rows
    add("HDR 판 exists", True, hdr_path)
    streams = pr.get("streams") or []
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    au = [s for s in streams if s.get("codec_type") == "audio"]
    g = lambda k: v.get(k) if v else None
    add("HDR HEVC yuv420p10le", g("codec_name") == "hevc" and g("pix_fmt") == "yuv420p10le", f"{g('codec_name')} {g('pix_fmt')}")
    add("HDR bt2020 / smpte2084 / bt2020nc",
        (g("color_primaries"), g("color_transfer"), g("color_space")) == ("bt2020", "smpte2084", "bt2020nc"),
        f"primaries={g('color_primaries')} transfer={g('color_transfer')} space={g('color_space')}")
    add("HDR 1080×1920 30 fps", bool(v) and (g("width"), g("height")) == (1080, 1920) and g("r_frame_rate") == "30/1"
        and g("avg_frame_rate") == "30/1", f"{g('width')}×{g('height')} r={g('r_frame_rate')} avg={g('avg_frame_rate')}")
    try:
        dur = float((pr.get("format") or {}).get("duration"))
    except (TypeError, ValueError):
        dur = None
    add("HDR duration = SDR ±0.1s", dur is not None and sdr_duration is not None and abs(dur - sdr_duration) <= 0.1,
        f"hdr {dur if dur is None else f'{dur:.3f}s'} sdr {sdr_duration if sdr_duration is None else f'{sdr_duration:.3f}s'}")
    add("HDR audio stream (aac)", any(s.get("codec_name") == "aac" for s in au), f"{[s.get('codec_name') for s in au]}")
    return rows


FM_CHECK = "첫 순간 (1초·2초 화면 변화, 첫 소리)"


def first_moment_row(fm: dict | None, lead_sec, waiver: str | None, enforce_lead_sec: float,
                     error: str | None = None) -> tuple[str, str, str]:
    """first_moment 결과 → 검사 행. 새 형식(lead_sec ≤ enforce_lead_sec)만 FAIL, 예외 까닭이 있으면 WARN. Pure function."""
    enforced = lead_sec is not None and float(lead_sec) <= enforce_lead_sec + 1e-9
    if fm is None:
        detail = f"재지 못함: {error}"
        ok = False
    else:
        ch = fm.get("changed_pct") or {}
        fs = fm.get("first_sound_sec")
        detail = (f"1.0s {ch.get('1.0')}% · 2.0s {ch.get('2.0')}% · 첫 소리 {'재지 못함' if fs is None else f'{fs:.2f}s'}"
                  f" (문턱 10% · 20% · 0.3s)")
        ok = bool(fm.get("pass"))
    if ok:
        return (FM_CHECK, "PASS", detail)
    if waiver:
        return (FM_CHECK, "WARN", f"{detail} — 예외: {waiver}")
    if enforced:
        return (FM_CHECK, "FAIL", f"{detail} — 첫 2초를 '결과 먼저'로 고치거나, 불가능하면 --allow-static-open \"까닭\"")
    return (FM_CHECK, "WARN", f"{detail} — lead_sec {lead_sec}: 첫 순간 결정 전 편이라 FAIL 로 치지 않음")


def record_first_moment(path: Path, fm: dict | None, waiver: str | None) -> None:
    """finish.py 의 validation.json 에 first_moment(·예외 까닭)를 더한다. 파일이 없으면 아무것도 하지 않는다."""
    if not path.is_file():
        return
    rep = json.loads(path.read_text(encoding="utf-8"))
    rep["first_moment"] = fm
    rep["first_moment_waiver"] = waiver
    path.write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir", type=Path)
    ap.add_argument("--mp4", type=Path)
    ap.add_argument("--srt", type=Path)
    ap.add_argument("--timeline", type=Path)
    ap.add_argument("--max-sec", type=float, default=180.0)
    ap.add_argument("--hdr", choices=("auto", "require", "skip"), default="auto",
                    help="HDR version check: auto = only if final/hdr/<slug>.hdr.mp4 exists · require = missing is FAIL · skip = one WARN row")
    ap.add_argument("--allow-static-open", metavar="까닭", default=os.environ.get("ALLOW_STATIC_OPEN") or None,
                    help="첫 순간 점검을 못 넘어도 FAIL 로 치지 않는다(까닭을 validate.json·validation.json 에 적음). 환경 변수 ALLOW_STATIC_OPEN 도 같다")
    a = ap.parse_args()
    if a.allow_static_open is not None and not a.allow_static_open.strip():
        ap.error("--allow-static-open 에는 까닭을 적어야 합니다")
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
    slug = mp4.stem if mp4 else d.name
    hp = (mp4.parent if mp4 else d / "final") / "hdr" / f"{slug}.hdr.mp4"
    if a.hdr == "skip":
        add("HDR 판", False, "건너뜀 — --hdr skip", warn=True)
    elif a.hdr == "require" or hp.exists():   # auto: only when the HDR file exists (older episodes: no rows)
        hpr = (json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(hp)]))
               if hp.exists() else None)
        rows += hdr_rows(hpr, duration, str(hp), slug)

    fm, fm_err = None, None
    if mp4 and mp4.exists():
        fcfg = fmod.load_config()
        try:
            fm = fmod.measure(mp4, fcfg)
        except (subprocess.CalledProcessError, RuntimeError, ValueError) as e:
            fm_err = str(e)
        rows.append(first_moment_row(fm, tl.get("lead_sec") if tl else None, a.allow_static_open,
                                     float(fcfg["enforce_lead_sec"]), fm_err))
        record_first_moment(mp4.with_name("validation.json"), fm, a.allow_static_open)

    w = max(len(r[0]) for r in rows)
    print(f"validate {d}")
    for name, status, detail in rows:
        print(f"  {status:4s}  {name:<{w}}  {detail}")
    fails = [r for r in rows if r[1] == "FAIL"]
    overall = "FAIL" if fails else "PASS"
    print(f"RESULT: {overall}  ({len(rows) - len(fails)}/{len(rows)} not failing)")
    (d / "validate.json").write_text(json.dumps({"result": overall, "max_sec": a.max_sec, "mp4": str(mp4) if mp4 else None,
                                                 "checks": [{"check": n, "status": s, "detail": x} for n, s, x in rows],
                                                 "first_moment": fm, "first_moment_waiver": a.allow_static_open,
                                                 "not_checked": ["direct viewing", "listening", "phone playback", "science correctness",
                                                                 "pronunciation", "caption covering key phenomenon"]},
                                                ensure_ascii=False, indent=2) + "\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
