#!/usr/bin/env python3
"""초유체 헬륨 60초 핵심판 — 길이 실험(2026-11-08 사용자 결정: "60초 핵심판 1편 시험").

다시 렌더하지 않는다. 최종본 finals/17-superfluid-helium/superfluid-helium.mp4 를 문장 경계(문장 사이 쉼)에서
잘라 이어 붙인다. 음성·자막·화면은 원본 그대로라 동기가 유지된다. 첫 문장("오늘은 ~ 알아볼까요?")은
남겨 길이 하나만 바꾼다(첫 문장 비교는 별도 실험, 2026-11-14 판정 예정).

    python3 episodes/superfluid-helium/cut60.py            # 만들기
    python3 episodes/superfluid-helium/cut60.py --plan     # 구간·길이만 출력

구간 규칙: 문장 시작 0.12초 전 ~ 문장 끝 0.35초 뒤(쉼 안). 첫 구간은 0초(포스터 인트로)부터,
마지막 구간은 영상 끝(포스터 복귀)까지. 구간마다 소리에 30 ms 페이드를 넣어 이음매 딸깍임을 막는다.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "finals" / "17-superfluid-helium"
SRC = SRC_DIR / "superfluid-helium.mp4"
OUT_DIR = ROOT / "finals" / "17-superfluid-helium-60s"
OUT = OUT_DIR / "superfluid-helium-60s.mp4"

# 이야기 줄기: 훅 → 람다점 → 이름 → 양자 물결 → 한 덩어리 → 벽 타기 → 결론
KEEP = ["s01", "s02", "s06", "s09", "s10", "s11", "s13", "s20"]
PRE, POST, FADE = 0.12, 0.35, 0.03
MAX_SEC = 60.0


def plan() -> tuple[list[tuple[float, float, list[str]]], float]:
    tl = json.loads((SRC_DIR / "timeline.json").read_text(encoding="utf-8"))
    sent = {s["id"]: s for s in tl["sentences"]}
    total = float(tl["duration"])
    order = [s["id"] for s in tl["sentences"]]
    segs: list[tuple[float, float, list[str]]] = []
    for sid in KEEP:
        s = sent[sid]
        a = 0.0 if sid == order[0] else s["start"] - PRE
        b = total if sid == order[-1] else s["end"] + POST
        i = order.index(sid)
        # 이웃 문장을 침범하지 않는다(쉼 안에서만 자른다)
        if i > 0 and sid != order[0]:
            assert a > sent[order[i - 1]]["end"], (sid, "앞 문장과 겹침")
        if i + 1 < len(order) and sid != order[-1]:
            assert b < sent[order[i + 1]]["start"], (sid, "뒤 문장과 겹침")
        if segs and abs(segs[-1][1] - a) < 1.6 and order.index(segs[-1][2][-1]) + 1 == i:
            segs[-1] = (segs[-1][0], b, segs[-1][2] + [sid])   # 이어진 문장은 한 구간으로
        else:
            segs.append((a, b, [sid]))
    return segs, sum(b - a for a, b, _ in segs)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    a = ap.parse_args(argv)
    segs, dur = plan()
    for x, y, ids in segs:
        print(f"{x:7.2f} – {y:7.2f}  ({y - x:5.2f}s)  {' '.join(ids)}")
    print(f"합계 {dur:.2f}s")
    if dur > MAX_SEC:
        print(f"60초를 넘습니다({dur:.1f}s)", file=sys.stderr)
        return 1
    if a.plan:
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = OUT_DIR / "_parts"
    tmp.mkdir(exist_ok=True)
    listing = []
    try:
        # 구간마다 따로 인코딩한다(한 번에 trim 하면 긴 원본을 통째로 버퍼에 붙잡아 메모리가 모자란다)
        for i, (x, y, _) in enumerate(segs):
            d = y - x
            part = tmp / f"p{i}.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{x:.3f}", "-t", f"{d:.3f}", "-i", str(SRC),
                            "-af", f"afade=t=in:st=0:d={FADE},afade=t=out:st={d - FADE:.3f}:d={FADE}",
                            "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
                            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-threads", "2", str(part)], check=True)
            listing.append(f"file '{part.name}'")
        (tmp / "list.txt").write_text("\n".join(listing) + "\n", encoding="utf-8")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "list.txt"),
                        "-c", "copy", "-movflags", "+faststart", str(OUT)], check=True)
    finally:
        for f in tmp.glob("*"):
            f.unlink()
        tmp.rmdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0", "-i", str(OUT), "-frames:v", "1", "-q:v", "2",
                    str(OUT_DIR / "thumbnail.jpg")], check=True)
    (OUT_DIR / "cut.json").write_text(json.dumps({
        "source": str(SRC.relative_to(ROOT)), "keep": KEEP, "pre": PRE, "post": POST, "fade": FADE,
        "segments": [{"start": round(x, 3), "end": round(y, 3), "sentences": ids} for x, y, ids in segs],
        "duration_planned": round(dur, 3)}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"→ {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
