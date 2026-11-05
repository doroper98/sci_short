"""Original quiet ambient score; no samples and no substitute narration."""
from pathlib import Path
import json
import subprocess
import wave
import numpy as np

OUT = Path(__file__).resolve().parents[2] / 'outputs/korea-power-day'
SR, DURATION = 44100, 90
mix = np.zeros((SR * DURATION, 2), dtype=np.float64)

def add(notes, start, seconds, gain):
    n = min(round(seconds * SR), len(mix) - round(start * SR))
    if n <= 0:
        return
    t = np.arange(n) / SR
    env = np.minimum(1, t / 1.8) * np.minimum(1, (seconds - t) / 2.8)
    for j, midi in enumerate(notes):
        f = 440 * 2 ** ((midi - 69) / 12)
        a = (np.sin(2 * np.pi * f * t) + .12 * np.sin(4 * np.pi * f * t))
        b = (np.sin(2 * np.pi * f * t + .08) + .12 * np.sin(4 * np.pi * f * t + .05))
        i = round(start * SR)
        mix[i:i+n, 0] += gain * env * a / len(notes)
        mix[i:i+n, 1] += gain * env * b / len(notes)

chords = [[50, 57, 61, 64], [47, 54, 57, 62], [43, 50, 57, 59], [45, 52, 55, 59]]
for k in range(10):
    add(chords[k % 4], k * 9, 12, .105)
    for step in [2, 5, 7]:
        i = (step + k) % 4
        add([chords[k % 4][i] + 12], k * 9 + step, 3, .018)
fade = np.minimum(1, np.arange(len(mix)) / SR / 3) * np.minimum(1, (len(mix) - np.arange(len(mix))) / SR / 4)
mix *= fade[:, None]
assert np.max(np.abs(mix)) < 1
with wave.open(str(OUT / 'music-raw.wav'), 'wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes((mix * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(OUT / 'music-raw.wav'), '-af', 'loudnorm=I=-25:TP=-3:LRA=6', '-ar', str(SR), str(OUT / 'music.wav')], check=True)
(OUT / 'sound-provenance.json').write_text(json.dumps({'composition':'Original ambient Dmaj9 / Bm7 / Gadd9 / Asus2-derived voicings','duration':DURATION,'samples_used':False,'narration':False,'target_lufs':-25,'direct_listening_performed':False}, indent=2))
print('Created original 90-second ambient score.')
