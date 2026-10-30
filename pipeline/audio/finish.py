"""Master the mix (two-pass loudnorm), mux with visual.mp4, verify, and write validation.json.

  python pipeline/audio/finish.py --visual outputs/<slug>/visual.mp4 --mix outputs/<slug>/mix.wav \
      --timeline outputs/<slug>/narration/timeline.json --captions-srt outputs/<slug>/narration/captions.srt \
      --out outputs/<slug>/final/<slug>.mp4 --title "…" [--max-sec 180] [--allow-degraded] [--lufs -14 --tp -1.5 --lra 11]  (defaults follow osint_generator final mixes)

Refuses (exit 2) when the timeline is longer than --max-sec, or marked degraded without --allow-degraded.
Captions are burned into the picture by the renderer; the SRT is copied next to the MP4 as <stem>.srt
(no selectable subtitle track, so captions are never shown twice).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe(path) -> dict:
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)]))


def loudnorm_measure(path, lufs, tp, lra, extra=()) -> dict:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *extra, "-i", str(path), "-map", "0:a:0", "-af",
                        f"loudnorm=I={lufs}:TP={tp}:LRA={lra}:print_format=json", "-f", "null", "-"],
                       text=True, capture_output=True, check=True)
    s = r.stderr
    return json.loads(s[s.rfind("{"): s.rfind("}") + 1])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--visual", required=True)
    ap.add_argument("--mix", required=True)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--captions-srt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--max-sec", type=float, default=180.0)
    ap.add_argument("--allow-degraded", action="store_true")
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--tp", type=float, default=-1.5)
    ap.add_argument("--lra", type=float, default=11.0)
    a = ap.parse_args()

    tl = json.loads(Path(a.timeline).read_text())
    dur = float(tl["duration"])
    if dur > a.max_sec:
        print(f"REFUSED: timeline duration {dur:.2f}s exceeds --max-sec {a.max_sec:.0f}s. Shorten the script/observation time "
              f"(do not speed up the voice).", file=sys.stderr)
        return 2
    if tl.get("degraded") and not a.allow_degraded:
        print(f"REFUSED: timeline is marked degraded (voice: {tl.get('voice')!r}). The standard M3 voice/alignment was not "
              f"fully reproduced. Fix narration, or pass --allow-degraded for an internal preview only.", file=sys.stderr)
        return 2
    for f in (a.visual, a.mix, a.captions_srt):
        if not Path(f).exists():
            print(f"missing input: {f}", file=sys.stderr)
            return 2

    vprobe = probe(a.visual)
    vdur = float(vprobe["format"]["duration"])
    if vdur + 1 / 30 < dur - 0.05:
        print(f"warning: visual.mp4 is {vdur:.3f}s, shorter than timeline {dur:.3f}s", file=sys.stderr)

    stats = loudnorm_measure(a.mix, a.lufs, a.tp, a.lra)
    filt = (f"loudnorm=I={a.lufs}:TP={a.tp}:LRA={a.lra}:linear=true:print_format=json"
            f":measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}"
            f":measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-v", "warning", "-i", a.visual, "-i", a.mix, "-map", "0:v:0", "-map", "1:a:0",
         "-c:v", "copy", "-af", filt, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
         "-metadata:s:a:0", "language=kor", "-metadata", f"title={a.title}", "-t", f"{dur:.3f}",
         "-movflags", "+faststart", str(out)])
    run(["ffmpeg", "-v", "error", "-i", str(out), "-map", "0:v", "-map", "0:a", "-f", "null", "-"])  # full decode
    final_probe = probe(out)
    encoded = loudnorm_measure(out, a.lufs, a.tp, a.lra)
    srt_out = out.with_suffix(".srt")
    shutil.copyfile(a.captions_srt, srt_out)
    sents = tl.get("sentences", [])
    mix_report = Path(a.mix).with_name("mix-report.json")
    music = json.loads(mix_report.read_text()).get("music") if mix_report.exists() else None
    report = {
        "file": out.name, "bytes": out.stat().st_size, "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "title": a.title, "timeline_duration": dur, "max_sec": a.max_sec,
        "probe": {"streams": final_probe["streams"], "format": final_probe["format"]},
        "audio_mastering_input": stats, "encoded_audio": {k: encoded.get(k) for k in ("input_i", "input_tp", "input_lra")},
        "targets": {"lufs": a.lufs, "tp": a.tp, "lra": a.lra},
        "voice": tl.get("voice"), "degraded": bool(tl.get("degraded")), "allow_degraded_used": bool(a.allow_degraded and tl.get("degraded")),
        "alignment_sources": sorted({(s.get("alignment") or {}).get("source") or "unknown" for s in sents}),
        "final_fall_applied": sum(1 for s in sents if (s.get("final_fall") or {}).get("applied")),
        "music": music, "music_credit_required": bool(music) and not (music or {}).get("credit"),
        "captions_srt": srt_out.name, "captions_delivery": "burned into picture; sidecar SRT; no subtitle track",
        "verification": {
            "full_decode": "passed",
            "direct_listening": "not performed",
            "physical_phone_playback": "not performed",
            "visual_review_of_stills": "not recorded by finish.py",
        },
    }
    out.with_name("validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"final: {out}  ({report['bytes']} bytes)")
    if music:
        print(f"  music: {Path(music['file']).name} — credit: {music.get('credit') or 'MISSING: add attribution to the description/end card'}")
    print(f"  audio in  I {stats['input_i']} LUFS TP {stats['input_tp']}  →  encoded I {encoded.get('input_i')} TP {encoded.get('input_tp')}")
    print(f"  validation: {out.with_name('validation.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
