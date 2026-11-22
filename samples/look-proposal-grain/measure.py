"""질감 측정 — 정지화면(또는 mp4 에서 뽑은 프레임)의 빈 바탕 조각에서 평균 RGB, 고주파 표준편차, 가로 자기상관 lag1 을 잰다.

    python measure.py still.png [still2.jpg …] --box 100,1450,880,400
    python measure.py clip.mp4 --times 3,9 --box 100,1450,880,400          # ffmpeg 로 프레임을 뽑아 잰다
    python measure.py --changed off.mp4 film.mp4                           # 첫 순간 지표(0초 대비 1·2초에 16/255 넘게 바뀐 화소 %)

재는 법:
  평균 RGB        조각의 채널 평균(0~255).
  모두 밝기 Y = 0.2126R + 0.7152G + 0.0722B 에서, 조각마다 잰 뒤 조각들의 평균(괄호 안은 최소~최대).
  std             조각에서 평면(완만한 그라디언트)을 뺀 나머지의 표준편차(0~255).
  hf_std          5×5 상자 평균을 뺀 나머지의 표준편차 — 알갱이만 남는다.
  lag1, lag2, lag4  평면을 뺀 조각의 가로 자기상관(1·2·4 화소 떨어진 이웃). 알갱이가 클수록 1 에 가깝다.
  hf_lag1         5×5 나머지의 가로 자기상관 lag1.
  과녁(2026-11-22, 사용자가 휴대전화 인스타 앱에서 본 참고 릴스 갈무리 1184×2576 의 빈 바탕, 상위 세션 측정):
                  std 1.7~2.5, hf_std 1.3~2.0, lag1 0.63~0.72, lag2 0.19~0.36. 내려받은 716 폭 파일은 hf_std 1.0~1.5, lag1(나머지) 0.47.
  --box x,y,w,h   잴 조각(1080 폭 기준 화소, 여러 번). 폭이 1080 이 아니면 비율로 옮긴다. 기본은 아래쪽 빈 바탕 120×120 네 곳.
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
    yy, xx = np.mgrid[0:lum.shape[0], 0:lum.shape[1]]                     # 평면(완만한 그라디언트)을 빼고 잰다
    A = np.c_[xx.ravel(), yy.ravel(), np.ones(lum.size)]
    flat = lum - (A @ np.linalg.lstsq(A, lum.ravel(), rcond=None)[0]).reshape(lum.shape)
    res = (lum - box_mean(lum))[2:-2, 2:-2]
    res = res - res.mean()
    ac = lambda a, k: float((a[:, :-k] * a[:, k:]).mean() / max(1e-12, a.var()))
    return {"size": f"{w}x{h}", "mean_rgb": [round(float(v), 1) for v in patch.reshape(-1, 3).mean(0)],
            "std": round(float(flat.std()), 2), "hf_std": round(float(res.std()), 2),
            "lag1": round(ac(flat, 1), 2), "lag2": round(ac(flat, 2), 2), "lag4": round(ac(flat, 4), 2),
            "hf_lag1": round(ac(res, 1), 2)}


DEFAULT_BOXES = ["150,1500,120,120", "480,1660,120,120", "800,1540,120,120", "900,1780,120,120"]
KEYS = ("std", "hf_std", "lag1", "lag2", "lag4", "hf_lag1")


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
    ap.add_argument("--box", action="append", help="x,y,w,h (여러 번 줄 수 있음). 기본: 아래 빈 바탕 120×120 네 곳")
    ap.add_argument("--times", default="3")
    ap.add_argument("--changed", action="store_true")
    a = ap.parse_args()
    if a.changed:
        for mp4 in a.inputs:
            print(f"{mp4}\tchanged_pct {changed(mp4)}")
        return 0
    boxes = [tuple(int(v) for v in b.split(",")) for b in (a.box or DEFAULT_BOXES)]
    with tempfile.TemporaryDirectory() as td:
        items = []
        for p in a.inputs:
            if p.endswith(".mp4"):
                items += frames_from_mp4(p, [float(t) for t in a.times.split(",")], Path(td))
            else:
                items.append((p, np.asarray(Image.open(p).convert("RGB"))))
        for name, rgb in items:
            ms = [measure(rgb, b) for b in boxes]
            avg = {k: round(float(np.mean([m[k] for m in ms])), 2) for k in KEYS}
            rng = {k: f"{min(m[k] for m in ms):.2f}~{max(m[k] for m in ms):.2f}" for k in KEYS}
            print(f"{name}\t{ms[0]['size']}\tmean {ms[0]['mean_rgb']}\t" + "  ".join(f"{k} {avg[k]} ({rng[k]})" for k in KEYS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
