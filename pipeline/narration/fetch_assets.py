"""표준 음성 자산 받기·대조 — Supertonic 3(8개 파일)·MMS_FA 가중치.

    python pipeline/narration/fetch_assets.py --supertonic [--source github|hf] [--models-dir DIR] [--keep-zip]
    python pipeline/narration/fetch_assets.py --mms
    python pipeline/narration/fetch_assets.py --all
    python pipeline/narration/fetch_assets.py --check          # 받지 않고 대조만

- 출처·크기·해시 = pipeline/narration/assets.json, 정본 sha1 = config/voice-reference.json(둘이 다르면 오류).
- 큰 파일은 curl 로 `.part` 에 흘려 받고(이어받기 -C -) 크기·해시를 확인한 뒤에만 이름을 바꾸거나 압축을 푼다.
- 멱등: 이미 sha1 이 맞는 파일은 받지 않는다.
- 실패하면 막힌 호스트 이름을 담은 메시지와 함께 0 이 아닌 코드로 끝낸다. 다른 목소리·다른 모델로 대체하지 않는다.

Provenance: osint_generator tools/fetch_data.py cmd_supertonic/cmd_mms_fa/stream_download (commit 131db0097a547a3fd0742488540eedc229017073)
를 바탕으로 새로 썼다. 바뀐 점: requests 대신 curl(없으면 urllib), GitHub 릴리스 zip 출처 추가(HF 는 대체 출처),
받은 뒤 크기·sha256/sha1 확인을 이름 바꾸기 전에 한다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pipeline.narration.voice_config import (  # noqa: E402
    load_voice_config, mms_dir, models_dir, sha1_file, sha256_file, supertonic_dir,
)

ASSETS_JSON = Path(__file__).resolve().parent / "assets.json"


class FetchError(RuntimeError):
    pass


def load_assets() -> dict:
    return json.loads(ASSETS_JSON.read_text(encoding="utf-8"))


def _host(url: str) -> str:
    return urlparse(url).hostname or url


def download(url: str, dest: Path, hosts: list[str] | None = None, size: int | None = None) -> None:
    """url → dest.part(이어받기) → 호출자가 확인 뒤 이름을 바꾼다. 실패 = FetchError(호스트 이름 포함)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if size is not None and dest.is_file():
        if dest.stat().st_size == size:
            return   # 이미 다 받은 .part — 해시 확인은 호출자
        if dest.stat().st_size > size:
            dest.unlink()
    hosts = hosts or [_host(url)]
    if shutil.which("curl"):
        base = ["curl", "-sS", "-f", "-L", "--retry", "3", "--retry-delay", "2", "-w", "%{url_effective}"]
        r = subprocess.run([*base, "-C", "-", "-o", str(dest), url], capture_output=True, text=True)
        if r.returncode == 33:   # 서버가 이어받기를 지원하지 않음 → 처음부터
            dest.unlink(missing_ok=True)
            r = subprocess.run([*base, "-o", str(dest), url], capture_output=True, text=True)
        if r.returncode != 0:
            err = r.stderr.strip()
            eff = _host(r.stdout.strip()) if r.stdout.strip() else _host(url)   # 리다이렉트 뒤 실제로 막힌 호스트
            blocked = "CONNECT tunnel failed" in err or r.returncode == 56 or "403" in err
            hint = (f"403 — 네트워크 정책(프록시)이 막았을 가능성이 큰 호스트: {eff} — 허용 목록에 추가 "
                    f"(이 출처에 필요한 호스트: {', '.join(dict.fromkeys([*hosts, eff]))})" if blocked
                    else f"마지막 호스트: {eff} (이 출처에 필요한 호스트: {', '.join(hosts)})")
            raise FetchError(f"다운로드 실패 (curl exit {r.returncode}): {url}\n  curl: {err}\n  {hint}")
        return
    try:   # curl 이 없을 때
        with urllib.request.urlopen(url, timeout=900) as resp, dest.open("wb") as f:
            shutil.copyfileobj(resp, f, 1 << 20)
    except (urllib.error.URLError, OSError) as ex:
        raise FetchError(f"다운로드 실패: {url}: {ex}\n  관련 호스트(허용 목록 확인): {', '.join(hosts)}") from ex


def _hash(path: Path, algo: str) -> str:
    return sha1_file(path) if algo == "sha1" else sha256_file(path)


def _verify(path: Path, size: int | None, algo: str, want: str) -> None:
    got_size = path.stat().st_size
    if size is not None and got_size != size:
        raise FetchError(f"크기 불일치 {path.name}: {got_size} ≠ {size} (중간에 끊겼을 수 있다 — 다시 실행하면 이어받는다)")
    got = _hash(path, algo)
    if got != want:
        path.unlink(missing_ok=True)
        raise FetchError(f"{algo} 불일치 {path.name}: {got} ≠ {want} (지웠다)")


def _check_consistency(assets: dict, vc) -> None:  # noqa: ANN001
    st = assets["supertonic"]
    if st["revision"] != vc.supertonic.revision:
        raise FetchError(f"assets.json revision {st['revision']} ≠ voice-reference {vc.supertonic.revision}")
    a = {k: v["sha1"] for k, v in st["files"].items()}
    if a != vc.supertonic.assets:
        raise FetchError("assets.json supertonic sha1 ≠ config/voice-reference.json synthesis.assets")
    m = assets["mms_fa"]["files"]["model.pt"]
    if m["sha1"] != vc.alignment.assets["model.pt"] or m["url"] != vc.alignment.url or m["size"] != vc.alignment.model_size:
        raise FetchError("assets.json mms_fa ≠ config/voice-reference.json alignment_reference")


def supertonic_status(mdir: Path, files: dict) -> list[str]:
    base = supertonic_dir(mdir)
    return [rel for rel, meta in files.items()
            if not (base / rel).is_file() or (base / rel).stat().st_size != meta["size"] or sha1_file(base / rel) != meta["sha1"]]


def fetch_supertonic(mdir: Path, source: str = "github", keep_zip: bool = False) -> list[str]:
    assets = load_assets()
    st = assets["supertonic"]
    files = st["files"]
    base = supertonic_dir(mdir)
    todo = supertonic_status(mdir, files)
    if not todo:
        return [f"supertonic: {base} 8개 sha1 일치(받지 않음)"]
    log = []
    t0 = time.perf_counter()
    if source == "github":
        src = next(s for s in st["sources"] if s["kind"] == "github_release_zip")
        dl = mdir / ".downloads"
        zpath = dl / Path(urlparse(src["url"]).path).name
        part = zpath.with_name(zpath.name + ".part")
        if not (zpath.is_file() and zpath.stat().st_size == src["size"] and sha256_file(zpath) == src["sha256"]):
            download(src["url"], part, src["hosts"], src["size"])
            _verify(part, src["size"], "sha256", src["sha256"])
            part.replace(zpath)
            log.append(f"zip 받음 {src['size']} B, sha256 일치 ({time.perf_counter() - t0:.1f}s)")
        stage = mdir / ".staging-supertonic"
        shutil.rmtree(stage, ignore_errors=True)
        with zipfile.ZipFile(zpath) as z:
            names = set(z.namelist())
            missing = [rel for rel in files if rel not in names]
            if missing:
                raise FetchError(f"zip 에 없는 파일: {missing}")
            for rel in todo:   # 아는 이름만 푼다(경로 조작 방지)
                out = stage / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                with z.open(rel) as fi, out.open("wb") as fo:
                    shutil.copyfileobj(fi, fo, 1 << 20)
                _verify(out, files[rel]["size"], "sha1", files[rel]["sha1"])
        for rel in todo:
            (base / rel).parent.mkdir(parents=True, exist_ok=True)
            (stage / rel).replace(base / rel)
        shutil.rmtree(stage, ignore_errors=True)
        if not keep_zip:
            zpath.unlink(missing_ok=True)
    elif source == "hf":
        src = next(s for s in st["sources"] if s["kind"] == "huggingface_resolve")
        for rel in todo:
            url = src["url_template"].format(revision=st["revision"], rel=rel)
            part = base / (rel + ".part")
            download(url, part, src["hosts"], files[rel]["size"])
            _verify(part, files[rel]["size"], "sha1", files[rel]["sha1"])
            part.replace(base / rel)
    else:
        raise FetchError(f"--source {source!r} (github|hf)")
    bad = supertonic_status(mdir, files)
    if bad:
        raise FetchError(f"대조 실패: {bad}")
    log.append(f"supertonic: {base} 8개 sha1 일치 (받은 파일 {len(todo)}개, {time.perf_counter() - t0:.1f}s)")
    return log


def fetch_mms(mdir: Path) -> list[str]:
    m = load_assets()["mms_fa"]["files"]["model.pt"]
    dest = mms_dir(mdir) / "model.pt"
    if dest.is_file() and dest.stat().st_size == m["size"] and sha1_file(dest) == m["sha1"]:
        return [f"mms_fa: {dest} 크기·sha1 일치(받지 않음)"]
    t0 = time.perf_counter()
    part = dest.with_name("model.pt.part")
    download(m["url"], part, m["hosts"], m["size"])
    _verify(part, m["size"], "sha1", m["sha1"])
    part.replace(dest)
    return [f"mms_fa: {dest} {m['size']} B sha1 {m['sha1']} 일치 ({time.perf_counter() - t0:.1f}s)"]


def check(mdir: Path) -> list[str]:
    files = load_assets()["supertonic"]["files"]
    bad = supertonic_status(mdir, files)
    out = [f"supertonic: {'일치' if not bad else '문제 ' + str(bad)} ({supertonic_dir(mdir)})"]
    m = load_assets()["mms_fa"]["files"]["model.pt"]
    p = mms_dir(mdir) / "model.pt"
    ok = p.is_file() and p.stat().st_size == m["size"] and sha1_file(p) == m["sha1"]
    out.append(f"mms_fa: {'일치' if ok else '없음/불일치'} ({p})")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="표준 음성 자산 받기·대조")
    ap.add_argument("--supertonic", action="store_true")
    ap.add_argument("--mms", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--check", action="store_true", help="받지 않고 대조만")
    ap.add_argument("--source", choices=["github", "hf"], default="github")
    ap.add_argument("--models-dir", default=None, help="기본 <repo>/models, 환경변수 SCISHORT_MODELS")
    ap.add_argument("--keep-zip", action="store_true")
    a = ap.parse_args(argv)
    if not (a.supertonic or a.mms or a.all or a.check):
        ap.error("--supertonic, --mms, --all, --check 중 하나")
    mdir = models_dir(a.models_dir)
    try:
        vc = load_voice_config()
        _check_consistency(load_assets(), vc)
        lines: list[str] = []
        if a.check:
            lines += check(mdir)
        if a.supertonic or a.all:
            lines += fetch_supertonic(mdir, a.source, a.keep_zip)
        if a.mms or a.all:
            lines += fetch_mms(mdir)
    except FetchError as ex:
        print(f"fetch_assets 실패: {ex}", file=sys.stderr)
        return 2
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
