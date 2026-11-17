"""Sound for the 100 m piece (no music, no voice). numpy only.

    python3 sound.py [events.json] [OUT.wav]

Reads events.json (written by `node run.mjs events` from the same model and timeline.json as the picture) and writes a
48 kHz stereo 16-bit WAV of exactly the video's length:
  hushed crowd bed -> starting gun at the gun time (noise crack + low thump) -> crowd roar swelling through the race with a
  light patter of footfalls (every foot strike of every runner, panned by lane) -> at Bolt's finish a camera-shutter click
  and the bed going darker and lower for the freeze and slow motion, a soft blip at every crossing (20, timed from the
  model) -> a short whoosh and a two-note chime as the board lands. Peak normalised to -1.5 dBFS, last 0.3 s faded.
Nobody has listened to this file; it was checked numerically only (see README).
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SR = 48000
rng = np.random.default_rng(100)


def smooth(q):
    q = np.clip(q, 0, 1)
    return q * q * (3 - 2 * q)


def envelope(t, pts):
    """piecewise-linear curve through (time, value) points"""
    xs, ys = zip(*pts)
    return np.interp(t, xs, ys)


def noise_bed(n, frame_t, level_db, cutoff_hz, tilt):
    """stereo noise with a time-varying spectrum: random-phase STFT frames shaped per frame, overlap-added"""
    N, hop = 2048, 512
    win = np.hanning(N)
    f = np.fft.rfftfreq(N, 1 / SR)
    out = np.zeros((2, n + N))
    for k, t0 in enumerate(range(0, n, hop)):
        tc = (t0 + N / 2) / SR
        i = min(len(frame_t) - 1, int(tc * 100))
        shape = (1 + f / 250.0) ** (-tilt[i]) * np.exp(-(f / cutoff_hz[i]) ** 2) * (f > 40)
        amp = 10 ** (level_db[i] / 20)
        for ch in range(2):
            spec = (rng.standard_normal(len(f)) + 1j * rng.standard_normal(len(f))) * shape
            x = np.fft.irfft(spec, N) * win
            out[ch, t0:t0 + N] += x * amp
    out = out[:, :n]
    return out / (np.sqrt(np.mean(out ** 2)) + 1e-12) * 10 ** (-20 / 20)   # normalised so level_db is relative to -20 dBFS RMS


def burst(dur, decay, sr=SR):
    t = np.arange(int(dur * sr)) / sr
    return rng.standard_normal(len(t)) * np.exp(-t / decay)


def place(buf, x, t, gain=1.0, pan=0.0):
    """add mono x at time t (s) with equal-power pan (-1 left .. +1 right)"""
    s = int(round(t * SR))
    if s >= buf.shape[1]:
        return
    e = min(buf.shape[1], s + len(x))
    a = (pan + 1) * np.pi / 4
    buf[0, s:e] += x[:e - s] * gain * np.cos(a)
    buf[1, s:e] += x[:e - s] * gain * np.sin(a)


def bandpass_click(dur, lo, hi):
    """a short noise click band-limited by FFT masking"""
    n = int(dur * SR)
    x = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.0035 * SR))
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X *= (f > lo) & (f < hi)
    return np.fft.irfft(X, n)


def tone(freq, dur, decay, harm=0.25):
    t = np.arange(int(dur * SR)) / SR
    att = np.minimum(1, t / 0.004)
    return (np.sin(2 * np.pi * freq * t) + harm * np.sin(4 * np.pi * freq * t)) * np.exp(-t / decay) * att


def main():
    ev_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'events.json'
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / 'sound.wav'
    ev = json.loads(ev_path.read_text())
    D, gun, (f0, f1), sm_end, (b0, _b1) = ev['duration'], ev['gun'], ev['freeze'], ev['slowmo_end'], ev['board_in']
    n = int(round(D * SR))
    ft = np.arange(0, D + 0.01, 0.01)   # control curves at 100 Hz

    # ---- crowd bed: hushed -> roar -> darker for the freeze/slow motion -> settles under the board ----
    lvl = envelope(ft, [(0, -14), (0.7, -16), (0.95, -21), (gun, -21), (gun + 0.15, -9), (gun + 3, -6), (f0 - 1.5, -2), (f0, 0),
                        (f0 + 0.05, -4), (f1, -7), (sm_end, -6), (b0, -9), (b0 + 1.0, -12), (D, -14)])
    cut = envelope(ft, [(0, 1400), (gun, 1200), (gun + 2, 2600), (f0, 4200), (f0 + 0.08, 700), (f1, 520), (sm_end, 650), (b0, 900), (D, 1000)])
    tilt = envelope(ft, [(0, 0.9), (gun, 0.9), (f0, 0.6), (f0 + 0.08, 1.4), (sm_end, 1.3), (b0, 1.0), (D, 1.0)])
    bed = noise_bed(n, ft, lvl, cut, tilt) * 0.8
    # slow crowd swell (amplitude wobble) so the bed breathes; slower during the slow motion
    tt = np.arange(n) / SR
    wob_rate = np.interp(tt, [0, f0, f0 + 0.1, D], [0.9, 1.6, 0.35, 0.35])
    wob = 1 + 0.12 * np.sin(2 * np.pi * np.cumsum(wob_rate) / SR)
    bed *= wob
    # low rumble that rises when the picture goes slow ("drop in pitch")
    rum_amp = np.interp(tt, [0, f0, f0 + 0.15, sm_end, b0 + 0.5, D], [0, 0, 0.05, 0.04, 0.0, 0.0])
    rum = np.sin(2 * np.pi * 52 * tt + 0.6 * np.sin(2 * np.pi * 0.7 * tt)) * rum_amp
    buf = bed + rum
    gunbuf = np.zeros_like(buf)                       # the gun is levelled on its own (it would otherwise set the peak)

    # ---- starting gun: bright crack + low thump + short tail ----
    crack = np.diff(burst(0.12, 0.012), prepend=0) * 0.9
    place(gunbuf, crack, gun, 1.0, 0.0)
    th_t = np.arange(int(0.45 * SR)) / SR
    thump = np.sin(2 * np.pi * np.cumsum(np.interp(th_t, [0, 0.15], [95, 45])) / SR) * np.exp(-th_t / 0.12) * 0.9
    place(gunbuf, thump, gun, 1.0, 0.0)
    place(gunbuf, burst(0.9, 0.25) * 0.06, gun + 0.01, 1.0, -0.2)
    place(gunbuf, burst(0.9, 0.25) * 0.06, gun + 0.013, 1.0, 0.2)

    # ---- footfalls: every strike, panned by lane (near lane 19 = left, far lane 0 = right), quieter in slow motion ----
    for t, lane in ev['footsteps']:
        slow = t >= f0
        click = bandpass_click(0.03, 120 if slow else 500, 1200 if slow else 3800)
        g = (0.05 if slow else 0.11) * (0.8 + 0.4 * rng.random())
        place(buf, click, t, g, (9.5 - lane) / 12)

    # ---- Bolt's finish: camera shutter (two mechanical clicks) ----
    place(buf, bandpass_click(0.02, 2000, 9000) * 1.4, f0, 1.0, 0.1)
    place(buf, bandpass_click(0.02, 1500, 7000) * 1.0, f0 + 0.055, 1.0, 0.1)

    # ---- a soft blip at each crossing; runners crossing at the same instant share one blip (1/sqrt(n) each) ----
    times = [c['video_t'] for c in ev['crossings']]
    for c in ev['crossings']:
        k = sum(1 for x in times if abs(x - c['video_t']) < 1e-6)
        place(buf, tone(1318.5, 0.25, 0.06, 0.15) * 0.22 / np.sqrt(k), c['video_t'], 1.0, 0.0)

    # ---- board: whoosh (noise swept up) then a two-note chime ----
    wn = int(0.55 * SR)
    w = rng.standard_normal(wn)
    W = np.fft.rfft(w)
    fw = np.fft.rfftfreq(wn, 1 / SR)
    W *= np.exp(-((fw - 1800) / 1500) ** 2)
    w = np.fft.irfft(W, wn) * np.sin(np.pi * np.linspace(0, 1, wn)) ** 2
    w = w / np.max(np.abs(w)) * 0.35
    place(buf, w, b0 - 0.2, 1.0, -0.3)
    place(buf, w[::-1] * 0.6, b0 - 0.17, 1.0, 0.3)
    place(buf, tone(659.25, 1.6, 0.45) * 0.3, b0 + 0.35, 1.0, -0.1)
    place(buf, tone(987.77, 1.8, 0.55) * 0.3, b0 + 0.53, 1.0, 0.1)

    # ---- master: everything but the gun to -21 dBFS RMS over the race, gun peak at -3 dBFS on top, then -1.5 dBFS peak ----
    a, b = int((gun + 1.5) * SR), int(f0 * SR)
    buf *= 10 ** (-21 / 20) / np.sqrt(np.mean(buf[:, a:b] ** 2))
    buf += gunbuf * (10 ** (-3 / 20) / np.max(np.abs(gunbuf)))
    fo = int(ev['fade_out_s'] * SR)
    buf[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5
    fi = int(0.02 * SR)
    buf[:, :fi] *= np.linspace(0, 1, fi)
    pk = np.max(np.abs(buf))
    if pk > 10 ** (-1.5 / 20):                           # soft-knee squash of the few hottest transients instead of turning it all down
        th = 10 ** (-6 / 20)
        m = np.abs(buf) > th
        buf[m] = np.sign(buf[m]) * (th + (10 ** (-1.5 / 20) - th) * np.tanh((np.abs(buf[m]) - th) / (10 ** (-1.5 / 20) - th)))
    buf *= min(1.0, 10 ** (-1.5 / 20) / np.max(np.abs(buf)))
    pcm = np.clip(np.round(buf.T * 32767), -32768, 32767).astype('<i2')
    with wave.open(str(out_path), 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    # ---- numeric report (nobody listened) ----
    peak = 20 * np.log10(np.max(np.abs(pcm)) / 32767)
    mono = buf.mean(axis=0)
    seg = [(a, 20 * np.log10(np.sqrt(np.mean(mono[int(a * SR):int((a + 0.5) * SR)] ** 2)) + 1e-12)) for a in np.arange(0, D, 0.5)]
    print(f'sound: {out_path}  {pcm.shape[0] / SR:.3f} s  {SR} Hz stereo  peak {peak:.2f} dBFS  clipped samples {int(np.sum(np.abs(pcm) >= 32767))}')
    print('RMS per 0.5 s (dBFS): ' + ' '.join(f'{a:.1f}:{r:.0f}' for a, r in seg))
    print(f'events: gun {gun:.2f}  shutter {f0:.2f}  blips {sorted(set(round(x, 2) for x in times))}  whoosh {b0 - 0.2:.2f}  chime {b0 + 0.35:.2f}/{b0 + 0.53:.2f}  footsteps {len(ev["footsteps"])}')


if __name__ == '__main__':
    main()
