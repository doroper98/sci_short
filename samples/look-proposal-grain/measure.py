"""질감 측정 — 정지화면(또는 mp4 에서 뽑은 프레임)의 빈 바탕 조각에서 평균 RGB, 고주파 표준편차, 가로 자기상관 lag1 을 잰다.

    python measure.py still.png [still2.jpg …] --box 100,1450,880,400
    python measure.py clip.mp4 --times 3,9 --box 100,1450,880,400          # ffmpeg 로 프레임을 뽑아 잰다
    python measure.py --changed off.mp4 film.mp4                           # 첫 순간 지표(0초 대비 1·2초에 16/255 넘게 바뀐 화소 %)

재는 법:
  평균 RGB        조각의 채널 평균(0~255).
  고주파 std      밝기(Y = 0.2126R + 0.7152G + 0.0722B)에서 5×5 상자 평균을 뺀 나머지의 표준편차(0~255 단위).
                  그라디언트 바탕의 완만한 변화는 빠지고 알갱이만 남는다. 참고 릴스(716 폭, 인스타 압축본)는 1.0~1.5.
  lag1            같은 나머지의 가로 자기상관(이웃 화소). 알갱이가 클수록 1 에 가깝다. 참고 릴스 0.47(716 폭).
  --box x,y,w,h   잴 조각(화면 화소). 폭이 1080 이 아니면 1080 기준 좌표를 비율로 옮긴다.
  --changed       pipeline/first_moment.py 와 같은 법: 270×480 회색조(ffmpeg gray)로 줄인 0초 프레임과 t 초 프레임의 밝기 차가
                  16/255 를 넘는 화소 비율(%).
numpy·PIL 이 필요하다(/home/user/.venv-scishort-render/bin/python).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


def box_mean(a: np.ndarray, k: int = 5) -> np.ndarray:
    p = k // 2
    q = np.pad(a, p, mode="reflect")
    c = q.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    h, w = a.shape
    return (c[k:k + h, k:k + w] - c[:h, k:k + w] - c[k:k + h, :w] + c[:h, :w]) / (k * k)


def measure(rgb: np.ndarray, box: tuple[int, int, int, int]) -> dict:
    h, w = rgb.shape[:2]
    s = w / 1080
    x, y, bw, bh = (round(v * s) for v in box)
    patch = rgb[y:y + bh, x:x + bw].astype(np.float64)
    lum = patch @ np.array([0.2126, 0.7152, 0.0722])
    res = (lum - box_mean(lum))[2:-2, 2:-2]
    res = res - res.mean()
    a, b = res[:, :-1].ravel(), res[:, 1:].ravel()
    lag1 = float((a * b).mean() / max(1e-12, res.var()))
    return {"size": f"{w}x{h}", "mean_rgb": [round(float(v), 1) for v in patch.reshape(-1, 3).mean(0)],
            "hf_std": round(float(res.std()), 2), "lag1": round(lag1, 2)}


def frames_from_mp4(mp4: str, times: list[float], tmp: Path) -> list[tuple[str, np.ndarray]]:
    out = []
    for t in times:
        f = tmp / f"f_{t:.2f}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t}", "-i", mp4, "-frames:v", "1", str(f)], check=True)
        out.append((f"{mp4}@{t}", np.asarray(Image.open(f).convert("RGB"))))
    return out


def gray_frame(mp4: str, t: float, size=(270, 480)) -> np.ndarray:
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t}", "-i", mp4, "-frames:v", "1", "-vf", f"scale={size[0]}:{size[1]}",
                        "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).astype(np.int16)


def changed(mp4: str, times=(0.5, 1.0, 1.5, 2.0, 3.0), thr: int = 16) -> dict:
    g0 = gray_frame(mp4, 0.0)
    return {f"{t:.1f}": round(100.0 * float((np.abs(gray_frame(mp4, t) - g0) > thr).mean()), 2) for t in times}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--box", default="100,1450,880,400")
    ap.add_argument("--times", default="3")
    ap.add_argument("--changed", action="store_true")
    a = ap.parse_args()
    if a.changed:
        for mp4 in a.inputs:
            print(f"{mp4}\tchanged_pct {changed(mp4)}")
        return 0
    box = tuple(int(v) for v in a.box.split(","))
    with tempfile.TemporaryDirectory() as td:
        items = []
        for p in a.inputs:
            if p.endswith(".mp4"):
                items += frames_from_mp4(p, [float(t) for t in a.times.split(",")], Path(td))
            else:
                items.append((p, np.asarray(Image.open(p).convert("RGB"))))
        for name, rgb in items:
            m = measure(rgb, box)
            print(f"{name}\t{m['size']}\tmean {m['mean_rgb']}\thf_std {m['hf_std']}\tlag1 {m['lag1']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
