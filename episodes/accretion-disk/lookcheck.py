#!/usr/bin/env python3
"""Per-scene look metrics for one finished video, following the definitions in docs/VISUAL_QUALITY_ANALYSIS.md
appendix A (branch claude/visual-quality-analysis, draft PR #63). Episode-local on purpose: the rule documents have
not adopted these numbers yet.

  python episodes/accretion-disk/lookcheck.py outputs/accretion-disk/final/accretion-disk.mp4 outputs/accretion-disk/narration/timeline.json
"""
import json, subprocess, sys
import numpy as np
from scipy import ndimage

mp4, tlf = sys.argv[1], sys.argv[2]
tl = json.load(open(tlf))
W, H = 270, 480
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", f"fps=2,scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32)
lum = 0.299 * fr[..., 0] + 0.587 * fr[..., 1] + 0.114 * fr[..., 2]
pic = lum[:, 75:362, :]                                   # picture area: rows 300..1450 of 1920
times = np.arange(len(fr)) / 2.0
motion = np.r_[0, np.abs(np.diff(lum, axis=0)).mean(axis=(1, 2))]

def hero(a):                                             # largest bright blob (2x2 reduced, >60, dilated by 1, 4-connected)
    small = a[: a.shape[0] // 2 * 2, : a.shape[1] // 2 * 2].reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).mean(axis=(1, 3))
    m = ndimage.binary_dilation(small > 60)
    lab, n = ndimage.label(m)
    return 0.0 if n == 0 else np.bincount(lab.ravel())[1:].max() / m.size

def colours(f):
    q = (f // 16).astype(np.int32); key = q[..., 0] * 256 + q[..., 1] * 16 + q[..., 2]
    c = np.bincount(key.ravel(), minlength=4096); return int((c >= 0.001 * key.size).sum())

rows = []
for sc in tl["scenes"] + [{"id": "전체", "start": 0, "end": tl["duration"]}]:
    k = (times >= sc["start"]) & (times < sc["end"])
    p = pic[k]
    rows.append({
        "scene": sc["id"], "sec": round(sc["end"] - sc["start"], 1),
        "bright_pct": round(float((p > 70).mean() * 100), 1),
        "hero_pct": round(float(np.median([hero(a) for a in p[::2]]) * 100), 1),
        "top1": round(float(np.mean([np.percentile(a, 99) for a in p])), 0),
        "contrast": round(float(np.mean([np.percentile(a, 99) - np.median(a) for a in p])), 0),
        "colours": int(np.median([colours(f[75:362]) for f in fr[k][::2]])),
        "still_pct": round(float((motion[k] < 1.0).mean() * 100), 0),
        "cuts": int((motion[k] > 40).sum()),
    })
print(json.dumps(rows, ensure_ascii=False, indent=1))
