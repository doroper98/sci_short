#!/usr/bin/env python3
"""Rebuild the final-video library index: finals/catalog.json and the table in finals/README.md.

Layout (2026-11-03 user decision: a delivered video is final unless the user asks for a remake):
  finals/<NN>-<slug>/   <slug>.mp4, <slug>.srt, poster.jpg, scenes.jpg, timeline.json, validation.json,
                        README.md (what it is, how it was checked), upload.md (title / description / tags)
  finals/legacy/<slug>/ earlier prototypes made before the standard pipeline

Run after adding or replacing a final:  python3 pipeline/catalog.py
Only the standard library and ffprobe are needed.
"""
import hashlib, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FINALS = ROOT / "finals"
START, END = "<!-- catalog:start -->", "<!-- catalog:end -->"


def sh(*a):
    return subprocess.run(a, capture_output=True, text=True, cwd=ROOT).stdout.strip()


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def probe(p):
    out = sh("ffprobe", "-v", "error", "-show_entries", "format=duration:stream=width,height",
             "-of", "json", str(p))
    d = json.loads(out or "{}")
    v = next((s for s in d.get("streams", []) if s.get("width")), {})
    return round(float(d.get("format", {}).get("duration", 0)), 1), v.get("width"), v.get("height")


def entry(folder, number=None):
    mp4s = sorted(folder.glob("*.mp4"))
    if not mp4s:
        return None
    mp4 = mp4s[0]
    readme = folder / "README.md"
    title = ""
    if readme.exists():
        m = re.search(r"^# (.+)$", readme.read_text(encoding="utf-8"), re.M)
        title = m.group(1).strip() if m else ""
    upload = folder / "upload.md"
    thumb = ""
    if upload.exists():
        m = re.search(r"^- 썸네일: (.+)$", upload.read_text(encoding="utf-8"), re.M)
        thumb = m.group(1).strip() if m else ""
    slug = re.sub(r"^\d+-", "", folder.name)
    dur, w, h = probe(mp4)
    rel = lambda p: p.relative_to(ROOT).as_posix()
    committed = sh("git", "log", "-1", "--follow", "--diff-filter=AM", "--format=%cs", "--", rel(mp4))  # content change, not the move
    return {
        "number": number, "slug": slug, "title": title, "status": "final" if number else "legacy",
        "folder": rel(folder), "video": rel(mp4), "duration_sec": dur, "width": w, "height": h,
        "bytes": mp4.stat().st_size, "sha256": sha256(mp4),
        "video_date": committed or "uncommitted",
        "episode_code": rel(ROOT / "episodes" / slug) if (ROOT / "episodes" / slug).is_dir() else None,
        "upload_info": rel(upload) if upload.exists() else None, "thumbnail": thumb,
    }


def main():
    items = []
    for d in sorted(FINALS.iterdir()):
        m = re.match(r"^(\d+)-", d.name)
        if d.is_dir() and m:
            e = entry(d, int(m.group(1)))
            if e:
                items.append(e)
    legacy = [e for d in sorted((FINALS / "legacy").glob("*")) if d.is_dir() for e in [entry(d)] if e]
    (FINALS / "catalog.json").write_text(
        json.dumps({"finals": items, "legacy": legacy}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    rows = ["| 번호 | 제목 | 길이 | 폴더 | 업로드 정보 | 영상 확정일 |", "|---|---|---|---|---|---|"]
    for e in items:
        folder = e["folder"].removeprefix("finals/")
        up = f"[upload.md]({folder}/upload.md)" if e["upload_info"] else "—"
        rows.append(f"| {e['number']:02d} | {e['title']} | {e['duration_sec']}초 | [{folder}/]({folder}/) | {up} | {e['video_date']} |")
    rows += ["", f"합계 {len(items)}편, {sum(e['duration_sec'] for e in items) / 60:.1f}분, "
                 f"{sum(e['bytes'] for e in items) / 1e6:.0f} MB. 파일 해시·해상도는 [catalog.json](catalog.json)."]
    readme = FINALS / "README.md"
    text = readme.read_text(encoding="utf-8")
    if START not in text or END not in text:
        sys.exit(f"{readme}: markers {START} / {END} not found")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    readme.write_text(head + START + "\n" + "\n".join(rows) + "\n" + END + tail, encoding="utf-8")
    print(f"catalog: {len(items)} finals, {len(legacy)} legacy → finals/catalog.json, finals/README.md")


if __name__ == "__main__":
    main()
