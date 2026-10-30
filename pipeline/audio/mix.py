"""narration.wav + sfx.wav (+ ambient.wav) → mix.wav (48 kHz stereo float), ducked under speech.

Ducking uses the timeline's measured sentence spans (not a level detector), so it is deterministic and
follows the same clock as the picture: gain falls over `--pre` seconds before each sentence start, stays
down until its end, and recovers over `--post` seconds. Overlapping spans merge.

  python pipeline/audio/mix.py --narration outputs/<slug>/narration/narration.wav --sfx outputs/<slug>/sfx.wav \
      [--ambient outputs/<slug>/ambient.wav] --timeline outputs/<slug>/narration/timeline.json --out outputs/<slug>/mix.wav \
      [--music-duck-db 12] [--sfx-duck-db 6] [--pre 0.25] [--post 0.3] [--narration-peak 0.8] [--master-peak 0.97]

Prints a loudness summary measured by ffmpeg loudnorm (analysis only; finish.py normalises).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

SR = 48000


def load(path, n: int, stereo=True) -> np.ndarray:
    x, sr = sf.read(str(path), dtype="float64", always_2d=True)
    if sr != SR:
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    if stereo and x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    if not stereo:
        x = x.mean(axis=1, keepdims=True)
    out = np.zeros((n, x.shape[1]))
    m = min(n, len(x))
    out[:m] = x[:m]
    return out


def duck_curve(n: int, spans, pre: float, post: float) -> np.ndarray:
    """0 = no duck, 1 = full duck. Trapezoid per span: ramp `pre` before start, hold, ramp `post` after end."""
    t = np.arange(n) / SR
    d = np.zeros(n)
    for a, b in spans:
        up = np.clip((t - (a - pre)) / max(pre, 1e-4), 0, 1)
        down = np.clip(((b + post) - t) / max(post, 1e-4), 0, 1)
        d = np.maximum(d, np.minimum(up, down))
    return d


def loudness(path) -> dict:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json",
                        "-f", "null", "-"], text=True, capture_output=True)
    s = r.stderr
    try:
        return json.loads(s[s.rfind("{"): s.rfind("}") + 1])
    except ValueError:
        return {"error": s[-400:]}


def mix(narration, sfx, timeline, out, ambient=None, music_duck_db=12.0, sfx_duck_db=6.0, pre=0.25, post=0.3,
        narration_peak=0.8, master_peak=0.97, quiet=False) -> dict:
    tl = json.loads(Path(timeline).read_text())
    n = round(float(tl["duration"]) * SR)
    v = load(narration, n, stereo=False)[:, 0]
    vp = float(np.max(np.abs(v)))
    if vp > 0:
        v *= narration_peak / vp
    spans = [(s["start"], s["end"]) for s in tl["sentences"]]
    d = duck_curve(n, spans, pre, post)
    fx = load(sfx, n) if sfx and Path(sfx).exists() else np.zeros((n, 2))
    amb = load(ambient, n) if ambient and Path(ambient).exists() else np.zeros((n, 2))
    g_fx = 10 ** (-sfx_duck_db * d / 20)
    g_amb = 10 ** (-music_duck_db * d / 20)
    m = v[:, None] + fx * g_fx[:, None] + amb * g_amb[:, None]
    peak = float(np.max(np.abs(m)))
    scale = master_peak / peak if peak > master_peak else 1.0
    m *= scale
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), m.astype(np.float32), SR, subtype="FLOAT")
    speech = d >= 0.999
    rms = lambda x: float(np.sqrt(np.mean(x ** 2))) if x.size else 0.0
    bed = fx * g_fx[:, None] + amb * g_amb[:, None]
    rep = {"out": str(out), "sample_rate": SR, "channels": 2, "duration": n / SR, "narration_peak_in": vp,
           "narration_peak": narration_peak * scale, "pre_master_peak": peak, "master_scale": scale,
           "master_peak": float(np.max(np.abs(m))), "duck": {"music_db": music_duck_db, "sfx_db": sfx_duck_db, "pre": pre, "post": post},
           "bed_rms_in_speech": rms(bed[speech]), "bed_rms_outside_speech": rms(bed[d <= 0.001]),
           "has_ambient": bool(ambient and Path(ambient).exists())}
    rep["loudness"] = loudness(out)
    if not quiet:
        L = rep["loudness"]
        print(f"mix: {out}  {rep['duration']:.2f}s  48 kHz stereo float")
        print(f"  narration peak {rep['narration_peak']:.3f}  master peak {rep['master_peak']:.3f} (scale {scale:.3f})")
        print(f"  bed RMS in speech {rep['bed_rms_in_speech']:.5f} / outside {rep['bed_rms_outside_speech']:.5f}")
        print(f"  loudness (pre-master): I {L.get('input_i')} LUFS  TP {L.get('input_tp')} dBTP  LRA {L.get('input_lra')} LU")
    Path(out).with_name("mix-report.json").write_text(json.dumps(rep, indent=2) + "\n")
    return rep


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--narration", required=True)
    ap.add_argument("--sfx", default=None)
    ap.add_argument("--ambient", default=None)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--music-duck-db", type=float, default=12.0)
    ap.add_argument("--sfx-duck-db", type=float, default=6.0)
    ap.add_argument("--pre", type=float, default=0.25)
    ap.add_argument("--post", type=float, default=0.3)
    ap.add_argument("--narration-peak", type=float, default=0.8)
    ap.add_argument("--master-peak", type=float, default=0.97)
    a = ap.parse_args()
    if not Path(a.narration).exists():
        print(f"narration not found: {a.narration}", file=sys.stderr)
        return 2
    mix(a.narration, a.sfx, a.timeline, a.out, a.ambient, a.music_duck_db, a.sfx_duck_db, a.pre, a.post, a.narration_peak, a.master_peak)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
