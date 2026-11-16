"""첫 순간 점검 — 완성 mp4 의 첫 3초에 화면이 얼마나 바뀌고 첫 소리가 언제 나는지 잰다(표준 라이브러리 + ffmpeg).

    python -m pipeline.first_moment finals/58-tsunami/tsunami.mp4 [--json out.json]     # 표를 찍고, 통과 못 하면 exit 1
    python -m pipeline.first_moment --all finals --out reports/first_moment_baseline.json  # finals/<NN>-<slug>/ 전부

까닭: docs/CHANNEL_GROWTH.md 9절 O3·O4·방안 2. 14편 합산 넘기지 않고 본 비율 48.0%(바깥 표본 평균 약 61%),
새 형식 58 쓰나미도 첫 3초 동안 화면의 1.5% 이하만 바뀌었다. 문턱과 재는 법은 config/first_moment.json(제작 세션의 제안을
2026-11-16 사용자 말 "어 너가 생각하는 모든 것들을 다 적용해봐. 무한한 권한과 지지를 보낸다"로 적용한 것).

재는 법(9-1 과 같다):
  changed_pct[t]  t 초 프레임과 0초 프레임을 270×480 회색조(ffmpeg gray)로 줄여, 밝기 차이가 16/255 를 넘는 화소의 비율(%)
  luma0_pct       0초 프레임의 평균 밝기(0~100)
  first_sound_sec 앞 5초에 silencedetect(noise=-40dB, d=0.05) 를 돌려 맨 앞 무음이 끝나는 시각. 맨 앞 무음이 없으면 0.0, 재지 못하면 null
  pass            changed_pct["1.0"] ≥ 10 그리고 changed_pct["2.0"] ≥ 20 그리고 first_sound_sec 가 null 이 아니고 ≤ 0.3

출력 꼴(다른 도구와의 약속 — 키 이름을 바꾸지 않는다):
  {"changed_pct": {"0.5": 0.9, "1.0": 1.1, "1.5": 1.2, "2.0": 0.8, "3.0": 1.5}, "luma0_pct": 27.0, "first_sound_sec": 0.22, "pass": false}

이 점검은 '그림이 움직이는가'만 잰다. 그 움직임이 인과 사슬의 한 고리인지(장식이 아닌지)는 사람이 정지화면으로 본다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "first_moment.json"
DEFAULTS = {"sample_times": [0.5, 1.0, 1.5, 2.0, 3.0], "frame_size": [270, 480], "pixel_threshold": 16,
            "silence_noise_db": -40, "silence_min_sec": 0.05, "audio_window_sec": 5,
            "min_changed_pct": {"1.0": 10, "2.0": 20}, "max_first_sound_sec": 0.3, "enforce_lead_sec": 0.3}
METHOD = ("ffmpeg 로 0초와 0.5·1·1.5·2·3초 프레임을 270×480 회색조로 뽑아 0초보다 16/255 넘게 달라진 화소의 비율을 세고, "
          "앞 5초에 silencedetect(-40 dB, 0.05초)를 돌려 맨 앞 무음이 끝나는 시각을 첫 소리로 잰다.")


def load_config(path: Path = DEFAULT_CONFIG) -> dict:
    cfg = json.loads(json.dumps(DEFAULTS))
    if path.is_file():
        raw = json.loads(path.read_text(encoding="utf-8"))
        unknown = {k for k in raw if not k.startswith("_")} - set(DEFAULTS)
        if unknown:
            raise ValueError(f"{path}: 모르는 키 {sorted(unknown)}")
        cfg.update({k: v for k, v in raw.items() if not k.startswith("_")})
    return cfg


def thresholds(cfg: dict) -> dict:
    """baseline 에 그대로 옮겨 적는 값(설명 키 제외)."""
    return {k: cfg[k] for k in DEFAULTS}


def tkey(t: float) -> str:
    return f"{float(t):.1f}"


# ---------- 순수 함수 ----------

def changed_share(a: bytes, b: bytes, threshold: int) -> float:
    """두 회색조 프레임에서 밝기 차이가 threshold 를 넘는 화소의 비율(%)."""
    if len(a) != len(b) or not a:
        raise ValueError(f"프레임 크기가 다름: {len(a)} vs {len(b)}")
    return 100.0 * sum(1 for x, y in zip(a, b) if abs(x - y) > threshold) / len(a)


def mean_pct(gray: bytes) -> float:
    return 100.0 * sum(gray) / (255 * len(gray)) if gray else 0.0


def first_sound_from_silencedetect(stderr: str, window: float) -> float | None:
    """silencedetect 로그 → 첫 소리 시각. 맨 앞(0.02초 안에 시작) 무음이 없으면 0.0. 창 끝까지 무음이면 None."""
    starts = [float(x) for x in re.findall(r"silence_start:\s*(-?[\d.]+)", stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*(-?[\d.]+)", stderr)]
    if not starts or starts[0] > 0.02:
        return 0.0
    if not ends:
        return None                                  # 창 전체가 무음
    end = ends[0]
    return None if end >= window - 0.05 else max(0.0, end)


def judge(changed: dict, first_sound: float | None, cfg: dict) -> bool:
    if first_sound is None or first_sound > cfg["max_first_sound_sec"] + 1e-9:
        return False
    for k, need in cfg["min_changed_pct"].items():
        v = changed.get(tkey(float(k)))
        if v is None or v < need:
            return False
    return True


def result(changed: dict, luma0: float, first_sound: float | None, cfg: dict) -> dict:
    """약속한 꼴의 결과(퍼센트 소수 1자리, 초 소수 2자리). pass 는 반올림한 값으로 판정해 표와 어긋나지 않게 한다."""
    ch = {tkey(t): round(v, 1) for t, v in sorted(changed.items(), key=lambda kv: float(kv[0]))}
    fs = None if first_sound is None else round(first_sound, 2)
    return {"changed_pct": ch, "luma0_pct": round(luma0, 1), "first_sound_sec": fs, "pass": judge(ch, fs, cfg)}


# ---------- ffmpeg ----------

def grab_gray(mp4: Path, t: float, size: tuple[int, int]) -> bytes:
    """t 초(그 시각 이후 첫 프레임)를 w×h 8비트 회색조로. 회색조는 ffmpeg 의 gray(제한 범위 Y → 0~255)."""
    w, h = size
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", str(mp4), "-frames:v", "1",
                          "-vf", f"scale={w}:{h}", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    if len(out) != w * h:
        raise RuntimeError(f"{mp4}: {t:.2f}초 프레임을 뽑지 못함({len(out)} 바이트)")
    return out


def first_sound_sec(mp4: Path, cfg: dict) -> float | None:
    win = float(cfg["audio_window_sec"])
    pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index:format=duration",
                         "-of", "json", str(mp4)], capture_output=True, text=True)
    info = json.loads(pr.stdout or "{}") if pr.returncode == 0 else {}
    if not info.get("streams"):
        return None                                  # 소리 줄기 없음
    try:
        win = min(win, float(info["format"]["duration"]))   # 창보다 짧은 영상: 끝까지 무음이면 재지 못함
    except (KeyError, TypeError, ValueError):
        pass
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-t", f"{cfg['audio_window_sec']}", "-i", str(mp4), "-vn",
                        "-af", f"silencedetect=noise={cfg['silence_noise_db']}dB:d={cfg['silence_min_sec']}",
                        "-f", "null", "-"], capture_output=True, text=True)
    if p.returncode != 0:
        return None
    return first_sound_from_silencedetect(p.stderr, win)


def measure(mp4: Path, cfg: dict | None = None) -> dict:
    cfg = cfg or load_config()
    size = tuple(cfg["frame_size"])
    f0 = grab_gray(mp4, 0.0, size)
    changed = {tkey(t): changed_share(f0, grab_gray(mp4, float(t), size), int(cfg["pixel_threshold"]))
               for t in cfg["sample_times"]}
    return result(changed, mean_pct(f0), first_sound_sec(mp4, cfg), cfg)


def final_mp4(folder: Path) -> Path | None:
    """finals/<NN>-<slug>/ 맨 위의 mp4 가 꼭 하나일 때만 그것(hdr/·legacy/ 는 보지 않는다)."""
    mp4s = sorted(p for p in folder.glob("*.mp4") if p.is_file())
    return mp4s[0] if len(mp4s) == 1 else None


def measure_all(finals: Path, cfg: dict) -> dict:
    eps = {}
    for d in sorted(p for p in finals.iterdir() if p.is_dir() and re.match(r"\d+-", p.name)):
        mp4 = final_mp4(d)
        if mp4:
            eps[d.name] = measure(mp4, cfg)
            print(f"  {d.name:<28} {fmt_row(eps[d.name])}", file=sys.stderr)
    return {"schema_version": 1, "measured": dt.date.today().isoformat(), "method": METHOD,
            "thresholds": thresholds(cfg), "episodes": eps}


# ---------- 표 ----------

def fmt_row(r: dict) -> str:
    ch = " ".join(f"{k}s {v:5.1f}%" for k, v in r["changed_pct"].items())
    fs = "재지 못함" if r["first_sound_sec"] is None else f"{r['first_sound_sec']:.2f}s"
    return f"{ch} | 밝기 {r['luma0_pct']:.1f}% | 첫 소리 {fs} | {'통과' if r['pass'] else '못 미침'}"


def table(mp4: Path, r: dict, cfg: dict) -> str:
    need = cfg["min_changed_pct"]
    lines = [f"첫 순간 점검 {mp4}", "  시각   바뀐 화면   문턱"]
    for k, v in r["changed_pct"].items():
        th = next((n for kk, n in need.items() if tkey(float(kk)) == k), None)
        mark = "" if th is None else (f"≥ {th}%  {'통과' if v >= th else '못 미침'}")
        lines.append(f"  {k:>4}초  {v:6.1f}%    {mark}")
    fs = r["first_sound_sec"]
    lines.append(f"  0초 화면 평균 밝기 {r['luma0_pct']:.1f}%")
    lines.append(f"  첫 소리 {'재지 못함' if fs is None else f'{fs:.2f}초'}   문턱 ≤ {cfg['max_first_sound_sec']}초  "
                 f"{'통과' if fs is not None and fs <= cfg['max_first_sound_sec'] else '못 미침'}")
    lines.append(f"결과: {'통과' if r['pass'] else '못 미침'}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mp4", nargs="?", type=Path, help="잴 mp4")
    ap.add_argument("--json", type=Path, help="결과 객체를 이 파일에 쓴다")
    ap.add_argument("--all", type=Path, metavar="FINALS", help="finals 폴더의 <NN>-<slug>/ 전부를 잰다")
    ap.add_argument("--out", type=Path, help="--all 결과(baseline)를 쓸 파일")
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    if a.all:
        base = measure_all(a.all, cfg)
        text = json.dumps(base, ensure_ascii=False, indent=1) + "\n"
        if a.out:
            a.out.parent.mkdir(parents=True, exist_ok=True)
            a.out.write_text(text, encoding="utf-8")
            n = len(base["episodes"])
            print(f"{a.out}: {n}편, 통과 {sum(r['pass'] for r in base['episodes'].values())}편")
        else:
            sys.stdout.write(text)
        return 0
    if not a.mp4:
        ap.error("mp4 또는 --all 이 필요합니다")
    r = measure(a.mp4, cfg)
    print(table(a.mp4, r, cfg))
    if a.json:
        a.json.write_text(json.dumps(r, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0 if r["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
