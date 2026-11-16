#!/usr/bin/env python3
"""묶음 장편: 완성된 쇼츠 여러 편을 이어 붙인 일반(가로 아님·쇼츠 아님) 영상 한 편을 만든다.

    python longform/build.py longform/01-detection            # 이어 붙이기(다시 인코딩) + chapters.json
    python longform/build.py longform/01-detection --check    # 만든 파일과 upload.md 의 챕터 줄을 검사
    python longform/build.py longform/01-detection --chapters-only   # 인코딩 없이 chapters.json 만(원본 길이로)

입력은 <dir>/recipe.json 하나다.
    {"slug": "detection", "parts": ["finals/32-radar", …], "titles": ["레이더를 피하려면? | …", …]}
각 part 폴더 바로 아래의 .mp4 하나(hdr/ 판은 보지 않는다)를 순서대로 이어 <dir>/<slug>.mp4 를 만든다.
원본들은 따로 인코딩된 파일이라 스트림 복사로 잇지 않고, concat 필터로 이어 다시 인코딩한다
(libx264 crf 18 · preset medium · yuv420p · 30 fps, AAC 48 kHz 스테레오 192 kbps, +faststart).
편마다 소리는 그 편의 영상 길이에 맞춰 무음을 덧대거나 잘라, 이음매마다 소리와 그림이 같은 시각에 넘어간다.

chapters.json 의 시작 시각은 원본들의 실제 영상 길이(ffprobe)를 더해 얻는다. 설명란 챕터 줄은 'M:SS 제목' 이고,
시각은 초 아래를 버린다(챕터를 누르면 그 편의 첫 프레임보다 1초 안쪽 앞에서 시작한다 — 다음 편을 건너뛰지 않게).
--check 는 upload.md 설명의 챕터 줄이 chapters.json 과 한 글자도 다르지 않은지도 본다(한쪽만 고치면 실패).

mp4 는 저장소에 넣지 않는다(.gitignore longform/**/*.mp4). 유튜브 업로드는 .github/workflows/youtube-longform.yml.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
RECIPE_NAME = "recipe.json"
CHAPTERS_NAME = "chapters.json"
UPLOAD_MD_NAME = "upload.md"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CHAPTER_LINE_RE = re.compile(r"^(?:\d+:)?\d{1,2}:\d{2} \S.*$")

WIDTH, HEIGHT, FPS = 1080, 1920, 30
AUDIO_RATE = 48000
TOTAL_TOL_SEC = 0.5        # 만든 파일의 길이 ≈ 원본 길이의 합
AV_TOL_SEC = 0.1           # 만든 파일의 영상·소리 스트림 길이 차
CHAPTER_MIN_SEC = 10       # 유튜브 챕터 조건: 3개 이상, 0:00 에서 시작, 각 10초 이상
CHAPTER_MIN_COUNT = 3


class BuildError(RuntimeError):
    """멈춰야 하는 오류. 메시지를 그대로 보인다."""


# ───────────────────────────── 순수 함수(ffmpeg 없이 시험) ─────────────────────────────

def load_recipe(dir_: Path) -> dict[str, Any]:
    p = dir_ / RECIPE_NAME
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise BuildError(f"{RECIPE_NAME} 없음: {p}") from None
    except ValueError as e:
        raise BuildError(f"{p}: JSON 오류: {e}") from None
    return validate_recipe({k: v for k, v in raw.items() if not k.startswith("_")}, where=str(p))


def validate_recipe(r: dict[str, Any], *, where: str = RECIPE_NAME) -> dict[str, Any]:
    unknown = set(r) - {"slug", "parts", "titles", "thumbnail"}   # thumbnail: longform/thumbnail.py 가 읽는다
    if unknown:
        raise BuildError(f"{where}: 모르는 키 {', '.join(sorted(unknown))}")
    slug, parts, titles = r.get("slug"), r.get("parts"), r.get("titles")
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        raise BuildError(f"{where}: slug 는 영문 소문자·숫자·'-' 여야 합니다({slug!r})")
    if not (isinstance(parts, list) and parts and all(isinstance(x, str) and x for x in parts)):
        raise BuildError(f"{where}: parts 는 폴더 경로 문자열의 배열이어야 합니다")
    if len(set(parts)) != len(parts):
        raise BuildError(f"{where}: parts 에 같은 폴더가 두 번 있습니다")
    if not (isinstance(titles, list) and len(titles) == len(parts) and all(isinstance(t, str) and t.strip() for t in titles)):
        raise BuildError(f"{where}: titles 는 parts 와 같은 개수의 비지 않은 문자열이어야 합니다")
    for t in titles:
        if "\n" in t or "<" in t or ">" in t:
            raise BuildError(f"{where}: 챕터 제목에 줄바꿈·'<'·'>' 를 쓸 수 없습니다: {t!r}")
    out = {"slug": slug, "parts": list(parts), "titles": [t.strip() for t in titles]}
    if "thumbnail" in r:
        if not isinstance(r["thumbnail"], dict):
            raise BuildError(f"{where}: thumbnail 은 객체여야 합니다")
        out["thumbnail"] = r["thumbnail"]
    return out


def chapter_starts(durations: list[float]) -> list[float]:
    """각 편의 시작 시각(초) — 앞 편들의 길이의 합."""
    out, t = [], 0.0
    for d in durations:
        if not d > 0:
            raise BuildError(f"편의 길이가 0 이하입니다({d})")
        out.append(round(t, 3))
        t += d
    return out


def fmt_mss(sec: float) -> str:
    """초 → 'M:SS'(1시간 이상이면 'H:MM:SS'). 초 아래는 버린다."""
    if sec < 0:
        raise ValueError(f"음수 시각 {sec}")
    s = int(math.floor(sec + 1e-6))
    h, rem = divmod(s, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def make_chapters(durations: list[float], titles: list[str]) -> list[dict[str, Any]]:
    if len(durations) != len(titles):
        raise BuildError("편 수와 챕터 제목 수가 다릅니다")
    return [{"start_sec": st, "start": fmt_mss(st), "title": ti, "duration_sec": round(d, 3)}
            for st, ti, d in zip(chapter_starts(durations), titles, durations)]


def chapter_lines(chapters: list[dict[str, Any]]) -> list[str]:
    return [f"{c['start']} {c['title']}" for c in chapters]


def chapter_block(chapters: list[dict[str, Any]]) -> str:
    """설명란에 그대로 넣는 챕터 목록(한 줄에 하나)."""
    return "\n".join(chapter_lines(chapters))


def chapter_problems(chapters: list[dict[str, Any]]) -> list[str]:
    """유튜브가 챕터로 인식하는 조건(0:00 시작, 3개 이상, 각 10초 이상, 오름차순)."""
    errs: list[str] = []
    if len(chapters) < CHAPTER_MIN_COUNT:
        errs.append(f"챕터 {len(chapters)}개 — 유튜브는 {CHAPTER_MIN_COUNT}개 이상이어야 챕터로 봅니다")
    if chapters and chapters[0]["start"] != "0:00":
        errs.append(f"첫 챕터가 {chapters[0]['start']} — 0:00 이어야 합니다")
    for c in chapters:
        if c["duration_sec"] < CHAPTER_MIN_SEC:
            errs.append(f"챕터 「{c['title']}」 {c['duration_sec']:.1f}초 — {CHAPTER_MIN_SEC}초 이상이어야 합니다")
    starts = [c["start_sec"] for c in chapters]
    if starts != sorted(starts) or len(set(fmt_mss(s) for s in starts)) != len(starts):
        errs.append("챕터 시각이 오름차순이 아니거나 같은 시각이 둘입니다")
    return errs


def description_chapter_lines(description: str) -> list[str]:
    """설명에서 'M:SS 제목' 꼴의 줄만 순서대로."""
    return [ln.strip() for ln in description.splitlines() if CHAPTER_LINE_RE.match(ln.strip())]


def compare_chapters(description: str, chapters: list[dict[str, Any]]) -> list[str]:
    got, want = description_chapter_lines(description), chapter_lines(chapters)
    if got == want:
        return []
    return ["upload.md 설명의 챕터 줄이 chapters.json 과 다릅니다 — 둘 중 하나만 고친 것 같습니다.\n"
            "  upload.md  : " + " / ".join(got) + "\n  chapters.json: " + " / ".join(want)]


def concat_command(inputs: list[Path], durations: list[float], out: Path, *, ffmpeg: str = "ffmpeg") -> list[str]:
    """ffmpeg 명령(목록). 편마다 영상은 30 fps·1080×1920·yuv420p 로 맞추고, 소리는 48 kHz 스테레오로 맞춘 뒤
    그 편의 영상 길이까지 무음을 덧대고 잘라(apad + atrim) concat 필터로 잇는다."""
    if len(inputs) != len(durations) or not inputs:
        raise BuildError("입력과 길이의 개수가 다릅니다")
    args = [ffmpeg, "-hide_banner", "-nostdin", "-y"]
    for p in inputs:
        args += ["-i", str(p)]
    chains, pads = [], []
    for i, d in enumerate(durations):
        chains.append(f"[{i}:v:0]setpts=PTS-STARTPTS,fps={FPS},scale={WIDTH}:{HEIGHT},setsar=1,format=yuv420p,"
                      f"trim=end={d:.6f},setpts=PTS-STARTPTS[v{i}]")
        chains.append(f"[{i}:a:0]asetpts=PTS-STARTPTS,aresample={AUDIO_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,"
                      f"apad,atrim=end={d:.6f},asetpts=PTS-STARTPTS[a{i}]")
        pads.append(f"[v{i}][a{i}]")
    graph = ";".join(chains) + ";" + "".join(pads) + f"concat=n={len(inputs)}:v=1:a=1[v][a]"
    args += ["-filter_complex", graph, "-map", "[v]", "-map", "[a]",
             "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
             "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
             "-c:a", "aac", "-b:a", "192k", "-ar", str(AUDIO_RATE), "-ac", "2",
             "-movflags", "+faststart", "-f", "mp4", str(out)]
    return args


def check_probe(info: dict[str, Any], expected_total: float) -> list[str]:
    """만든 파일의 ffprobe 결과(probe() 꼴)를 검사한다."""
    errs: list[str] = []
    v, a = info.get("video"), info.get("audio")
    if v is None:
        return ["영상 스트림이 없습니다"]
    if a is None:
        errs.append("소리 스트림이 없습니다")
    if (v["width"], v["height"]) != (WIDTH, HEIGHT):
        errs.append(f"해상도 {v['width']}×{v['height']} — {WIDTH}×{HEIGHT} 이어야 합니다")
    if abs(v["fps"] - FPS) > 1e-3:
        errs.append(f"프레임률 {v['fps']:.3f} — {FPS} 이어야 합니다")
    total = info["duration_sec"]
    if abs(total - expected_total) > TOTAL_TOL_SEC:
        errs.append(f"길이 {total:.2f}초 — 원본 합 {expected_total:.2f}초와 {abs(total - expected_total):.2f}초 차(한도 {TOTAL_TOL_SEC}초)")
    if a is not None and abs(v["duration_sec"] - a["duration_sec"]) > AV_TOL_SEC:
        errs.append(f"영상 {v['duration_sec']:.3f}초 · 소리 {a['duration_sec']:.3f}초 — 차가 {AV_TOL_SEC}초를 넘습니다")
    return errs


# ───────────────────────────── 파일·ffprobe ─────────────────────────────

def part_video(part_dir: Path) -> Path:
    """편 폴더 바로 아래의 .mp4 하나(하위 폴더 hdr/ 는 보지 않는다)."""
    if not part_dir.is_dir():
        raise BuildError(f"편 폴더 없음: {part_dir}")
    mp4s = sorted(p for p in part_dir.glob("*.mp4") if p.is_file())
    if len(mp4s) != 1:
        raise BuildError(f"{part_dir}: 바로 아래 .mp4 가 {len(mp4s)}개 — 하나여야 합니다")
    return mp4s[0]


def _fraction(s: str) -> float:
    n, _, d = (s or "0/1").partition("/")
    return float(n) / float(d or 1) if float(d or 1) else 0.0


def probe(path: Path) -> dict[str, Any]:
    exe = shutil.which("ffprobe")
    if not exe:
        raise BuildError("ffprobe 가 없습니다(ffmpeg 설치)")
    r = subprocess.run([exe, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise BuildError(f"ffprobe 실패({path}): {r.stderr.strip()[:300]}")
    raw = json.loads(r.stdout or "{}")
    out: dict[str, Any] = {"duration_sec": float(raw.get("format", {}).get("duration") or 0.0), "video": None, "audio": None}
    for s in raw.get("streams", []):
        kind = s.get("codec_type")
        if kind == "video" and out["video"] is None:
            fps = _fraction(s.get("avg_frame_rate") or s.get("r_frame_rate"))
            nb = int(s["nb_frames"]) if str(s.get("nb_frames", "")).isdigit() else None
            dur = nb / fps if nb and fps else float(s.get("duration") or 0.0)
            out["video"] = {"width": int(s.get("width", 0)), "height": int(s.get("height", 0)), "fps": fps,
                            "frames": nb, "duration_sec": dur, "codec": s.get("codec_name"), "pix_fmt": s.get("pix_fmt")}
        elif kind == "audio" and out["audio"] is None:
            out["audio"] = {"duration_sec": float(s.get("duration") or 0.0), "sample_rate": int(s.get("sample_rate") or 0),
                            "channels": int(s.get("channels") or 0), "codec": s.get("codec_name")}
    return out


def _rel(p: Path) -> str:
    try:
        return p.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return str(p)


def _log(msg: str) -> None:
    print(f"[longform] {msg}", file=sys.stderr, flush=True)


def sources(recipe: dict[str, Any]) -> list[dict[str, Any]]:
    """각 편의 원본 파일과 실제 영상 길이."""
    out = []
    for part in recipe["parts"]:
        video = part_video(REPO / part)
        info = probe(video)
        if info["video"] is None or info["audio"] is None:
            raise BuildError(f"{_rel(video)}: 영상·소리 스트림이 다 있어야 합니다")
        out.append({"dir": part, "video": _rel(video), "bytes": video.stat().st_size,
                    "duration_sec": round(info["video"]["duration_sec"], 6), "audio_duration_sec": info["audio"]["duration_sec"]})
    return out


def write_chapters(dir_: Path, recipe: dict[str, Any], srcs: list[dict[str, Any]]) -> dict[str, Any]:
    chapters = make_chapters([s["duration_sec"] for s in srcs], recipe["titles"])
    errs = chapter_problems(chapters)
    if errs:
        raise BuildError("챕터 조건: " + " · ".join(errs))
    for c, s in zip(chapters, srcs):
        c.update(dir=s["dir"], video=s["video"])
    data = {"slug": recipe["slug"], "video": f"{recipe['slug']}.mp4",
            "total_sec": round(sum(s["duration_sec"] for s in srcs), 3), "chapters": chapters,
            "_": "longform/build.py 가 원본들의 실제 영상 길이(ffprobe)로 쓴다. 손으로 고치지 말 것. "
                 "upload.md 설명의 챕터 줄은 이 파일과 같아야 한다(--check)."}
    (dir_ / CHAPTERS_NAME).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return data


def build(dir_: Path, *, chapters_only: bool = False) -> dict[str, Any]:
    recipe = load_recipe(dir_)
    srcs = sources(recipe)
    data = write_chapters(dir_, recipe, srcs)
    for c in data["chapters"]:
        _log(f"{c['start']:>6}  {c['title']}  ({c['duration_sec']:.2f}초, {c['dir']})")
    _log(f"합계 {data['total_sec']:.2f}초 = {fmt_mss(data['total_sec'])}")
    if chapters_only:
        return data
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise BuildError("ffmpeg 가 없습니다")
    out = dir_ / f"{recipe['slug']}.mp4"
    tmp = dir_ / f"{recipe['slug']}.mp4.part"   # .mp4 로 끝나지 않게 — 실패해도 업로더가 mp4 둘로 보지 않는다
    cmd = concat_command([REPO / s["video"] for s in srcs], [s["duration_sec"] for s in srcs], tmp, ffmpeg=ffmpeg)
    t0 = time.monotonic()
    _log("인코딩 시작(다시 인코딩 — 몇 분 걸립니다)")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise BuildError("ffmpeg 실패:\n" + r.stderr[-2000:])
    tmp.replace(out)
    data["build_sec"] = round(time.monotonic() - t0, 1)
    data["bytes"] = out.stat().st_size
    _log(f"{_rel(out)} {out.stat().st_size / 1024 / 1024:.1f} MB · {data['build_sec']:.0f}초 걸림")
    return data


def check(dir_: Path) -> list[str]:
    """만든 파일과 upload.md 를 검사한다. 빈 목록이면 통과."""
    recipe = load_recipe(dir_)
    errs: list[str] = []
    srcs = sources(recipe)
    expected = make_chapters([s["duration_sec"] for s in srcs], recipe["titles"])
    errs += chapter_problems(expected)
    cp = dir_ / CHAPTERS_NAME
    try:
        saved = json.loads(cp.read_text(encoding="utf-8"))["chapters"]
    except (FileNotFoundError, ValueError, KeyError) as e:
        return errs + [f"{_rel(cp)} 를 읽을 수 없습니다({e}) — 먼저 build"]
    if chapter_lines(saved) != chapter_lines(expected):
        errs.append(f"{CHAPTERS_NAME} 가 지금 원본 길이·recipe 제목과 다릅니다 — build 를 다시 돌리십시오")
    up = dir_ / UPLOAD_MD_NAME
    if not up.is_file():
        errs.append(f"{UPLOAD_MD_NAME} 없음")
    else:
        sys.path.insert(0, str(REPO))
        from publish.youtube import UploadError, parse_upload_md   # 업로더와 같은 읽기
        try:
            errs += compare_chapters(parse_upload_md(up.read_text(encoding="utf-8"))["description"], saved)
        except UploadError as e:
            errs.append(f"{UPLOAD_MD_NAME}: {e}")
    out = dir_ / f"{recipe['slug']}.mp4"
    if not out.is_file():
        return errs + [f"{_rel(out)} 없음 — 먼저 build"]
    info = probe(out)
    errs += check_probe(info, sum(s["duration_sec"] for s in srcs))
    v, a = info["video"] or {}, info["audio"] or {}
    _log(f"{_rel(out)}: {info['duration_sec']:.3f}초(원본 합 {sum(s['duration_sec'] for s in srcs):.3f}) · "
         f"영상 {v.get('duration_sec', 0):.3f}초 {v.get('width')}×{v.get('height')} {v.get('fps', 0):.2f} fps · "
         f"소리 {a.get('duration_sec', 0):.3f}초 {a.get('sample_rate')} Hz {a.get('channels')}ch")
    return errs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python longform/build.py", description="완성 쇼츠 여러 편을 이은 묶음 장편을 만든다")
    ap.add_argument("dir", type=Path, help="longform/<NN>-<slug> (recipe.json 이 있는 폴더)")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true", help="만든 파일(길이·규격·소리 동기)과 upload.md 챕터 줄을 검사")
    g.add_argument("--chapters-only", action="store_true", help="인코딩 없이 chapters.json 만 쓴다")
    a = ap.parse_args(argv)
    try:
        if a.check:
            errs = check(a.dir)
            for e in errs:
                _log("실패 — " + e)
            if not errs:
                _log("검사 통과")
            return 1 if errs else 0
        build(a.dir, chapters_only=a.chapters_only)
        return 0
    except BuildError as e:
        _log("실패 — " + str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
