"""Explanatory sound events + optional quiet procedural ambient, timed by the narration timeline.

These are *synthesised explanatory sounds* (sonification of events in the model), not recordings of
the phenomenon. Say so on screen or in the episode notes when it matters (docs/SOUND_DESIGN.md).

sound.json
----------
{
  "version": 1,
  "events": [
    {"id": "bond", "at": {"sentence": "s03", "word": "수소 결합"}, "kind": "tick", "params": {"freq": 1760, "gain_db": -20}},
    {"id": "float", "at": ["s05", 0.15], "kind": "swell", "params": {"freqs": [220, 330, 440], "dur": 1.6}}
  ],
  "ambient": {"enabled": false, "kind": "pad", "seed": 7, "gain_db": -32, "root_hz": 110, "intervals": [0, 7, 12, 16]}
}

`at` uses the same grammar as pipeline/render/timeline.mjs (keep both in sync):
  12.0 | "s05" | "s05:end" | "hook" | "hook:mid" | ["s05", 0.4] | {"sentence","word","offset"} | {"scene","p","offset"}

kinds and params (all optional unless noted; every kind also takes gain_db, pan (-1..1), repeat, interval,
delay {"time","feedback","mix"}, offset):
  tick    freq=2000 decay=0.05 click=0.3                  short percussive ping (attach / count / impact)
  tone    freq=440 dur=0.4 wave=sine|tri|saw attack decay sustain release glide_to harmonics=[1,.2]
  noise   dur=0.3 low=300 high=4000 attack=0.005 release=0.2  filtered noise burst
  whoosh  dur=0.6 f_start=300 f_end=3000 q=2.0            band-pass noise sweep (motion / transfer)
  swell   freqs=[220,330] dur=1.5 attack=0.45 detune=0.15  soft chord pad (arrival / resolution)
  custom  layers=[{kind, params, offset}]                  stack of the above
  silent  (no sound; visual-only event kept in the shared list)

CLI:
  python pipeline/audio/sfx.py --sound episodes/<slug>/sound.json --timeline outputs/<slug>/narration/timeline.json \
      --out outputs/<slug>/sfx.wav [--ambient-out outputs/<slug>/ambient.wav] [--no-music] [--events-check outputs/<slug>/events.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000


# ---------------------------------------------------------------- time references
def resolve_at(at, tl: dict) -> float:
    """Absolute seconds for a time reference (mirror of Timeline.at in timeline.mjs)."""
    sents = {s["id"]: s for s in tl["sentences"]}
    scenes = {s["id"]: s for s in tl["scenes"]}
    if isinstance(at, bool):
        raise ValueError(f"bad time reference {at!r}")
    if isinstance(at, (int, float)):
        return float(at)
    if isinstance(at, list):
        return resolve_at(at[0], tl) + (float(at[1]) if len(at) > 1 else 0.0)
    if isinstance(at, dict):
        off = float(at.get("offset", 0.0))
        if at.get("sentence") and at.get("word"):
            return word_start(sents[at["sentence"]], at["word"]) + off
        if at.get("scene"):
            s = scenes[at["scene"]]
            return s["start"] + float(at.get("p", 0.0)) * (s["end"] - s["start"]) + off
        if at.get("sentence"):
            return resolve_at(at["sentence"], tl) + off
        raise ValueError(f"bad time reference {at!r}")
    ref, _, edge = str(at).partition(":")
    edge = edge or "start"
    s = sents.get(ref) or scenes.get(ref)
    if s is None:
        raise ValueError(f'time reference "{at}": no sentence or scene "{ref}"')
    if edge == "start":
        return s["start"]
    if edge == "end":
        return s["end"]
    if edge == "mid":
        return (s["start"] + s["end"]) / 2
    raise ValueError(f'time reference "{at}": edge must be start|end|mid')


def word_start(sent: dict, word: str) -> float:
    chars = sent.get("chars") or []
    joined = "".join(c["c"] for c in chars)
    i = joined.find(word)
    if i >= 0:
        return chars[i]["start"]
    ns = [c for c in chars if c["c"].strip()]
    j = "".join(c["c"] for c in ns).find(word.replace(" ", ""))
    if j < 0:
        raise ValueError(f'word "{word}" not found in chars of {sent["id"]}')
    return ns[j]["start"]


# ---------------------------------------------------------------- building blocks
def db(x: float) -> float:
    return 10 ** (x / 20)


def t_axis(dur: float) -> np.ndarray:
    return np.arange(max(1, round(dur * SR))) / SR


def adsr(n: int, attack=0.005, decay=0.1, sustain=0.0, release=0.05) -> np.ndarray:
    """Linear attack, exponential-ish decay to sustain, linear release at the end. Length n samples."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = sustain + (1 - sustain) * np.exp(-np.maximum(0, t - attack) / max(decay, 1e-4))
    r = np.clip((n / SR - t) / max(release, 1e-4), 0, 1)
    return a * d * r


def osc(freq, dur: float, wave="sine", glide_to=None) -> np.ndarray:
    """Oscillator with optional exponential pitch glide. freq may be an array (per-sample Hz)."""
    t = t_axis(dur)
    if glide_to:
        f = freq * (glide_to / freq) ** (t / t[-1] if t[-1] > 0 else t)
    else:
        f = np.full_like(t, float(freq))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if wave == "sine":
        return np.sin(ph)
    if wave == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if wave == "saw":  # band-limited-ish: first 12 harmonics
        return sum(((-1) ** (k + 1)) * np.sin(k * ph) / k for k in range(1, 13)) * (2 / np.pi)
    raise ValueError(f"unknown wave {wave}")


def noise(dur: float, seed=0) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(round(dur * SR))


def bandpass(x: np.ndarray, low: float, high: float, order=2) -> np.ndarray:
    low, high = max(20.0, low), min(SR / 2 - 100, high)
    return sosfilt(butter(order, [low, high], btype="band", fs=SR, output="sos"), x)


def lowpass(x: np.ndarray, cutoff: float, order=2) -> np.ndarray:
    return sosfilt(butter(order, min(cutoff, SR / 2 - 100), btype="low", fs=SR, output="sos"), x)


def sweep_bandpass(x: np.ndarray, f0: float, f1: float, q=2.0, blocks=48) -> np.ndarray:
    """Time-varying band-pass by overlap-adding short filtered blocks (Hann crossfades)."""
    n = len(x)
    if n < blocks * 4:
        return bandpass(x, f0 / (1 + 1 / q), f0 * (1 + 1 / q))
    hop = n // blocks
    win = np.hanning(2 * hop)
    y = np.zeros(n + 2 * hop)
    xp = np.concatenate([x, np.zeros(2 * hop)])
    for b in range(blocks + 1):
        u = min(1.0, b / blocks)
        fc = f0 * (f1 / f0) ** u
        seg = xp[b * hop: b * hop + 2 * hop]
        if len(seg) < 2 * hop:
            break
        y[b * hop: b * hop + 2 * hop] += bandpass(seg, fc / (1 + 1 / q), fc * (1 + 1 / q)) * win
    return y[:n]


def simple_delay(x: np.ndarray, time=0.18, feedback=0.35, mix=0.3, taps=5) -> np.ndarray:
    d = round(time * SR)
    y = np.concatenate([x, np.zeros(d * taps)])
    out = y.copy()
    for k in range(1, taps + 1):
        out[k * d: k * d + len(x)] += x * mix * feedback ** (k - 1)
    return out


def norm_peak(x: np.ndarray, peak=1.0) -> np.ndarray:
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x * (peak / m) if m > 0 else x


# ---------------------------------------------------------------- event voices (mono, peak ≈ 1 before gain)
def v_tick(p, seed):
    f, dec = p.get("freq", 2000), p.get("decay", 0.05)
    t = t_axis(dec * 6)
    body = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t)
    click = bandpass(noise(len(t) / SR, seed), f * 0.8, min(f * 4, 16000)) * np.exp(-t / 0.004)
    return norm_peak(body * np.exp(-t / dec) * np.clip(t / 0.001, 0, 1) + p.get("click", 0.3) * norm_peak(click))


def v_tone(p, seed):
    dur = p.get("dur", 0.4)
    harm = p.get("harmonics", [1.0, 0.2])
    x = sum(a * osc(p.get("freq", 440) * (k + 1), dur, p.get("wave", "sine"),
                    p.get("glide_to") and p["glide_to"] * (k + 1)) for k, a in enumerate(harm))
    env = adsr(len(x), p.get("attack", 0.01), p.get("decay", dur * 0.4), p.get("sustain", 0.0), p.get("release", min(0.1, dur / 3)))
    return norm_peak(x * env)


def v_noise(p, seed):
    dur = p.get("dur", 0.3)
    x = bandpass(noise(dur, seed), p.get("low", 300), p.get("high", 4000))
    return norm_peak(x * adsr(len(x), p.get("attack", 0.005), dur, 1.0, p.get("release", min(0.2, dur / 2))))


def v_whoosh(p, seed):
    dur = p.get("dur", 0.6)
    x = sweep_bandpass(noise(dur, seed), p.get("f_start", 300), p.get("f_end", 3000), p.get("q", 2.0))
    t = t_axis(dur)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return norm_peak(x * env)


def v_swell(p, seed):
    dur, freqs = p.get("dur", 1.5), p.get("freqs", [220, 330])
    rng = np.random.default_rng(seed)
    x = sum(osc(f * (1 + rng.uniform(-1, 1) * p.get("detune", 0.15) / 100), dur) + 0.15 * osc(2 * f, dur) for f in freqs)
    t = t_axis(dur)
    att = p.get("attack", 0.45)
    env = np.minimum(np.clip(t / (dur * att), 0, 1) ** 2, np.clip((dur - t) / (dur * (1 - att)), 0, 1))
    return norm_peak(lowpass(x * env, p.get("cutoff", 3000)))


VOICES = {"tick": v_tick, "tone": v_tone, "noise": v_noise, "whoosh": v_whoosh, "swell": v_swell}


def event_voice(kind: str, p: dict, seed: int) -> np.ndarray:
    if kind == "silent":
        return np.zeros(1)
    if kind == "custom":
        layers = [(round(float(L.get("offset", 0)) * SR), event_voice(L["kind"], L.get("params", {}), seed + i) * db(L.get("params", {}).get("gain_db", 0)))
                  for i, L in enumerate(p.get("layers", []))]
        if not layers:
            return np.zeros(1)
        n = max(o + len(v) for o, v in layers)
        x = np.zeros(n)
        for o, v in layers:
            x[o:o + len(v)] += v
        return x
    if kind not in VOICES:
        raise ValueError(f"unknown sound kind {kind!r} (have {sorted(VOICES)} + custom, silent)")
    return VOICES[kind](p, seed)


def place(dest: np.ndarray, x: np.ndarray, at: float, pan=0.0) -> None:
    """Add mono x into stereo dest at time `at` with constant-power pan (mono-compatible)."""
    i = round(at * SR)
    if i < 0:
        x, i = x[-i:], 0
    if i >= len(dest) or not len(x):
        return
    x = x[: len(dest) - i]
    pan = float(np.clip(pan, -1, 1))
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    dest[i:i + len(x), 0] += x * gl
    dest[i:i + len(x), 1] += x * gr


# ---------------------------------------------------------------- ambient
def ambient_pad(duration: float, spec: dict) -> np.ndarray:
    """Very quiet, slowly breathing pad; seeded so re-renders are identical. Not linked to physics."""
    rng = np.random.default_rng(int(spec.get("seed", 7)))
    n = round(duration * SR)
    t = np.arange(n) / SR
    root = float(spec.get("root_hz", 110))
    out = np.zeros((n, 2))
    for k, semi in enumerate(spec.get("intervals", [0, 7, 12, 16])):
        f = root * 2 ** (semi / 12)
        ph = rng.uniform(0, 2 * np.pi, 2)
        lfo = 0.65 + 0.35 * np.sin(2 * np.pi * rng.uniform(0.03, 0.08) * t + rng.uniform(0, 6.28))
        for ch in range(2):
            det = 1 + (ch - 0.5) * rng.uniform(0.0005, 0.0015)
            out[:, ch] += lfo * (np.sin(2 * np.pi * f * det * t + ph[ch]) + 0.12 * np.sin(4 * np.pi * f * det * t)) / (k + 1.5)
    fade = np.minimum(np.clip(t / 3, 0, 1), np.clip((duration - t) / 3, 0, 1))
    out *= fade[:, None]
    out = np.stack([lowpass(out[:, 0], 2500), lowpass(out[:, 1], 2500)], axis=1)
    return norm_peak(out, 1.0) * db(float(spec.get("gain_db", -32)))


# ---------------------------------------------------------------- main entry
def render_sfx(sound_json, timeline_json, out_wav, ambient_out=None, no_music=False, events_check=None) -> dict:
    sound = json.loads(Path(sound_json).read_text()) if sound_json and Path(sound_json).exists() else {"events": []}
    tl = json.loads(Path(timeline_json).read_text())
    dur = float(tl["duration"])
    n = round(dur * SR)
    fx = np.zeros((n, 2))
    resolved = []
    for k, e in enumerate(sound.get("events", [])):
        p = dict(e.get("params", {}))
        t0 = resolve_at(e.get("at", e.get("time", 0)), tl)
        kind = e.get("kind", "tone")
        x = event_voice(kind, p, seed=int(p.get("seed", k + 1)))
        if p.get("delay"):
            x = simple_delay(x, **p["delay"])
        x = x * db(float(p.get("gain_db", -18)))
        times = [t0 + float(p.get("offset", 0)) + i * float(p.get("interval", 0.12)) for i in range(int(p.get("repeat", 1)))]
        for tt in times:
            place(fx, x, tt, p.get("pan", 0.0))
        if any(tt < 0 or tt >= dur for tt in times):
            print(f"warning: event {e.get('id')} at {times} is outside 0..{dur:.2f}s", file=sys.stderr)
        resolved.append({"id": e.get("id"), "kind": kind, "time": round(t0, 4), "onsets": [round(x, 4) for x in times],
                         "means": e.get("means")})
    mismatches = []
    if events_check and Path(events_check).exists():
        vis = {e.get("id"): e["time"] for e in json.loads(Path(events_check).read_text()).get("events", [])}
        for r in resolved:
            if r["id"] in vis and abs(vis[r["id"]] - r["time"]) > 0.002:
                mismatches.append({"id": r["id"], "sound": r["time"], "picture": vis[r["id"]]})
        if mismatches:
            print(f"ERROR: sound/picture event times differ: {mismatches}", file=sys.stderr)
    out_wav = Path(out_wav)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_wav, fx.astype(np.float32), SR, subtype="FLOAT")
    amb = sound.get("ambient") or {}
    amb_written = None
    if amb.get("enabled") and not no_music:
        a = ambient_pad(dur, amb)
        amb_path = Path(ambient_out) if ambient_out else out_wav.with_name("ambient.wav")
        sf.write(amb_path, a.astype(np.float32), SR, subtype="FLOAT")
        amb_written = str(amb_path)
    report = {"sample_rate": SR, "duration": dur, "events": resolved, "sfx_wav": str(out_wav), "ambient_wav": amb_written,
              "ambient": {**amb, "enabled": bool(amb.get("enabled")) and not no_music},
              "nature": "synthesised explanatory sounds (not recordings); ambient is procedural, seeded, not linked to the physics",
              "picture_sync_mismatches": mismatches,
              "sfx_peak": float(np.max(np.abs(fx))) if n else 0.0}
    out_wav.with_name("sound-design.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sound", required=True, help="episodes/<slug>/sound.json (missing file = no events)")
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--out", required=True, help="sfx.wav (48 kHz stereo float)")
    ap.add_argument("--ambient-out", default=None)
    ap.add_argument("--no-music", action="store_true", help="skip the ambient pad even if enabled in sound.json")
    ap.add_argument("--events-check", default=None, help="events.json written by render.mjs; exit 3 if times differ")
    a = ap.parse_args()
    r = render_sfx(a.sound, a.timeline, a.out, a.ambient_out, a.no_music, a.events_check)
    for e in r["events"]:
        print(f"  {e['time']:7.3f}s  {e['kind']:7s} {e['id']}")
    print(f"sfx: {r['sfx_wav']}  peak {r['sfx_peak']:.3f}" + (f"  ambient: {r['ambient_wav']}" if r["ambient_wav"] else "  (no ambient)"))
    return 3 if r["picture_sync_mismatches"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
