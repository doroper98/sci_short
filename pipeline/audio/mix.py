"""narration.wav + sfx.wav (+ ambient.wav) → mix.wav (48 kHz stereo float), ducked under speech.

Ducking uses the timeline's measured sentence spans (not a level detector), so it is deterministic and
follows the same clock as the picture: gain falls over `--pre` seconds before each sentence start, stays
down until its end, and recovers over `--post` seconds. Overlapping spans merge.

  python pipeline/audio/mix.py --narration outputs/<slug>/narration/narration.wav --sfx outputs/<slug>/sfx.wav \
      [--music assets/music/<file>.mp3 --music-credit "…" --music-under-db 12 --music-duck-db 6] \
      [--ambient outputs/<slug>/ambient.wav] --timeline outputs/<slug>/narration/timeline.json --out outputs/<slug>/mix.wav \
      [--ambient-duck-db 12] [--sfx-duck-db 6] [--pre 0.25] [--post 0.3] [--narration-peak 0.8] [--master-peak 0.97]

Music (a licensed track file) is looped with a crossfade, faded in/out, ducked under speech by --music-duck-db, and then
scaled so that its RMS *during speech* sits --music-under-db below the narration RMS (osint_generator's final mixes measured
about −12 dB; audio_qa music_under_narration_db). The credit text is carried into mix-report.json → validation.json.

Prints a loudness summary measured by ffmpeg loudnorm (analysis only; finish.py normalises).
"""
from __future__ import annotations

import argparse
import hashlib
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


def loop_to(x: np.ndarray, n: int, xfade_sec: float) -> np.ndarray:
    """Loop a stereo track to n samples with a linear crossfade of xfade_sec at each seam."""
    xf = max(1, int(xfade_sec * SR))
    if len(x) < 2 * xf + 1:
        reps = int(np.ceil(n / max(len(x), 1))) + 1
        return np.tile(x, (reps, 1))[:n]
    while len(x) < n:
        tail, head = x[-xf:], x[:xf]
        r = np.linspace(0, 1, xf)[:, None]
        x = np.concatenate([x[:-xf], tail * (1 - r) + head * r, x[xf:]])
    return x[:n]


def load_music(path, n: int, start_sec=0.0, fade_in=1.2, fade_out=4.0, xfade=4.0) -> np.ndarray:
    x, sr = sf.read(str(path), dtype="float64", always_2d=True)
    if sr != SR:
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    x = x[int(max(0.0, start_sec) * SR):]
    x = loop_to(x, n, xfade)
    pk = float(np.max(np.abs(x))) or 1.0
    x = x / pk
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    env = np.ones(n)
    if fi > 0:
        env[:fi] = np.linspace(0, 1, fi)
    if fo > 0:
        env[-fo:] = np.minimum(env[-fo:], np.linspace(1, 0, fo))
    return x * env[:, None]


def loudness(path) -> dict:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json",
                        "-f", "null", "-"], text=True, capture_output=True)
    s = r.stderr
    try:
        return json.loads(s[s.rfind("{"): s.rfind("}") + 1])
    except ValueError:
        return {"error": s[-400:]}


def mix(narration, sfx, timeline, out, ambient=None, ambient_duck_db=12.0, sfx_duck_db=6.0, pre=0.25, post=0.3,
        narration_peak=0.8, master_peak=0.97, quiet=False, music=None, music_credit=None, music_under_db=12.0,
        music_duck_db=6.0, music_start_sec=0.0, music_fade_in=1.2, music_fade_out=4.0, music_loop_xfade=4.0) -> dict:
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
    g_amb = 10 ** (-ambient_duck_db * d / 20)
    speech = d >= 0.999
    rms = lambda x: float(np.sqrt(np.mean(x ** 2))) if x.size else 0.0
    mus = np.zeros((n, 2)); music_info = None
    if music and Path(music).exists():
        raw_m = load_music(music, n, music_start_sec, music_fade_in, music_fade_out, music_loop_xfade)
        g_m = 10 ** (-music_duck_db * d / 20)
        ducked = raw_m * g_m[:, None]
        narr_rms = rms(v[speech]) if speech.any() else rms(v)
        in_speech = rms(ducked[speech]) if speech.any() else rms(ducked)
        gain = (narr_rms * 10 ** (-music_under_db / 20) / in_speech) if in_speech > 0 else 0.0
        mus = ducked * gain
        music_info = {"file": str(music), "sha1": hashlib.sha1(Path(music).read_bytes()).hexdigest(), "credit": music_credit,
                      "gain_applied": gain, "under_db_target": music_under_db, "duck_db": music_duck_db,
                      "start_sec": music_start_sec, "fade_in": music_fade_in, "fade_out": music_fade_out,
                      "measured_under_narration_db": (20 * np.log10(rms(mus[speech]) / narr_rms) if speech.any() and narr_rms > 0 and rms(mus[speech]) > 0 else None),
                      "rms_outside_speech": rms(mus[d <= 0.001])}
    elif music:
        raise SystemExit(f"music file not found: {music}  (see assets/music/README.md)")
    m = v[:, None] + fx * g_fx[:, None] + amb * g_amb[:, None] + mus
    peak = float(np.max(np.abs(m)))
    scale = master_peak / peak if peak > master_peak else 1.0
    m *= scale
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), m.astype(np.float32), SR, subtype="FLOAT")
    bed = fx * g_fx[:, None] + amb * g_amb[:, None] + mus
    rep = {"out": str(out), "sample_rate": SR, "channels": 2, "duration": n / SR, "narration_peak_in": vp,
           "narration_peak": narration_peak * scale, "pre_master_peak": peak, "master_scale": scale,
           "master_peak": float(np.max(np.abs(m))), "duck": {"ambient_db": ambient_duck_db, "music_db": music_duck_db, "sfx_db": sfx_duck_db, "pre": pre, "post": post},
           "music": music_info,
           "bed_rms_in_speech": rms(bed[speech]), "bed_rms_outside_speech": rms(bed[d <= 0.001]),
           "has_ambient": bool(ambient and Path(ambient).exists())}
    rep["loudness"] = loudness(out)
    if not quiet:
        L = rep["loudness"]
        print(f"mix: {out}  {rep['duration']:.2f}s  48 kHz stereo float")
        print(f"  narration peak {rep['narration_peak']:.3f}  master peak {rep['master_peak']:.3f} (scale {scale:.3f})")
        print(f"  bed RMS in speech {rep['bed_rms_in_speech']:.5f} / outside {rep['bed_rms_outside_speech']:.5f}")
        if music_info:
            mu = music_info["measured_under_narration_db"]
            print(f"  music: {Path(music).name}  under narration {mu:.1f} dB (target -{music_under_db})  duck {music_duck_db} dB  credit: {music_credit or 'MISSING'}")
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
    ap.add_argument("--ambient-duck-db", type=float, default=12.0)
    ap.add_argument("--sfx-duck-db", type=float, default=6.0)
    ap.add_argument("--music", default=None, help="licensed music file (assets/music/…); looped, faded, ducked under speech")
    ap.add_argument("--music-credit", default=None, help="attribution text (CC BY etc.), recorded in mix-report/validation")
    ap.add_argument("--music-under-db", type=float, default=12.0, help="music RMS during speech sits this far below narration RMS")
    ap.add_argument("--music-duck-db", type=float, default=6.0, help="extra duck depth inside speech vs outside")
    ap.add_argument("--music-start-sec", type=float, default=0.0)
    ap.add_argument("--music-fade-in", type=float, default=1.2)
    ap.add_argument("--music-fade-out", type=float, default=4.0)
    ap.add_argument("--music-loop-xfade", type=float, default=4.0)
    ap.add_argument("--pre", type=float, default=0.25)
    ap.add_argument("--post", type=float, default=0.3)
    ap.add_argument("--narration-peak", type=float, default=0.8)
    ap.add_argument("--master-peak", type=float, default=0.97)
    a = ap.parse_args()
    if not Path(a.narration).exists():
        print(f"narration not found: {a.narration}", file=sys.stderr)
        return 2
    mix(a.narration, a.sfx, a.timeline, a.out, a.ambient, a.ambient_duck_db, a.sfx_duck_db, a.pre, a.post, a.narration_peak, a.master_peak,
        music=a.music, music_credit=a.music_credit, music_under_db=a.music_under_db, music_duck_db=a.music_duck_db,
        music_start_sec=a.music_start_sec, music_fade_in=a.music_fade_in, music_fade_out=a.music_fade_out, music_loop_xfade=a.music_loop_xfade)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
