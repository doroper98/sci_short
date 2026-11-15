"""SDR 영상(visual.mp4)과 빛 지도(gain.mp4)를 합쳐 HDR 판을 만든다 — HEVC Main 10, BT.2020, PQ(SMPTE ST 2084).

    python pipeline/hdr.py --visual outputs/<slug>/visual.mp4 --gain outputs/<slug>/gain.mp4 \
        --final outputs/<slug>/final/<slug>.mp4 --out outputs/<slug>/final/hdr/<slug>.hdr.mp4

2026-11-15 사용자 결정: "다음 편부터 hdr 적용해". SDR 판은 그대로 두고(인스타·틱톡·카탈로그용), 유튜브에는 HDR 판을 올린다.

어떻게 만드나 (수식은 시험 무늬로 확인했다 — docs/HDR.md '확인한 값'):
  1. SDR 화면을 빛의 세기(선형)로 되돌린다. SDR 흰색 = sdr_white_nits(기본 203 nit, ITU-R BT.2408 의 HDR 기준 흰색).
  2. 빛 지도 M(0..1, pipeline/render/hdr.mjs 의 lit() 가 그린 흑백 영상)에 '화면이 밝은 곳만' 통과시키는 문 G 를 곱한다.
     G 는 SDR 화소의 max(R,G,B) 가 gate[0] 아래면 0, gate[1] 위면 1 인 경사다 — 빛 위를 지나가는 어두운 물체가 밝아지지 않게 한다.
  3. HDR = SDR × (1 + (peak_boost − 1) × M × G). 지도가 0 인 곳은 SDR 과 똑같고, 가장 밝은 곳은 peak_boost 배(기본 4배 ≈ 812 nit).
  4. BT.2020 원색, PQ 로 바꿔 10비트 HEVC 로 인코딩한다. 소리는 SDR 최종본의 AAC 를 그대로 옮긴다.

종료 코드: 0 성공(또는 config 에서 꺼짐), 2 입력·인코딩 오류, 3 빛 지도가 비어 있음(lit() 를 쓴 프레임이 없음 — --allow-empty 로 넘길 수 있다).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "hdr.json"
DEFAULTS = {"enabled": True, "sdr_white_nits": 203, "peak_boost": 4, "gate": [0.40, 0.70], "crf": 18, "preset": "medium",
            "max_cll": None, "max_fall": 300}
MASTER_DISPLAY = "G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50)"   # P3-D65 원색, 1000 nit 마스터링 모니터


def load_config(path: Path = DEFAULT_CONFIG) -> dict:
    cfg = dict(DEFAULTS)
    if path.is_file():
        raw = json.loads(path.read_text(encoding="utf-8"))
        unknown = {k for k in raw if not k.startswith("_")} - set(DEFAULTS)
        if unknown:
            raise ValueError(f"{path}: 모르는 키 {', '.join(sorted(unknown))}")
        cfg.update({k: v for k, v in raw.items() if not k.startswith("_")})
    b, w, g = float(cfg["peak_boost"]), float(cfg["sdr_white_nits"]), cfg["gate"]
    if not 1 <= b <= 10:
        raise ValueError("peak_boost 는 1~10")
    if not 80 <= w <= 400:
        raise ValueError("sdr_white_nits 는 80~400")
    if not (isinstance(g, list) and len(g) == 2 and 0 <= g[0] < g[1] <= 1):
        raise ValueError("gate 는 [낮은 값, 높은 값] (0~1, 낮은 값 < 높은 값)")
    return cfg


def pq_encode(nits: float) -> float:
    """밝기(nit) → PQ 신호(0..1)."""
    m1, m2, c1, c2, c3 = 2610 / 16384, 2523 / 4096 * 128, 3424 / 4096, 2413 / 4096 * 32, 2392 / 4096 * 32
    y = (max(nits, 0) / 10000) ** m1
    return ((c1 + c2 * y) / (1 + c3 * y)) ** m2


def pq_decode(signal: float) -> float:
    """PQ 신호(0..1) → 밝기(nit)."""
    m1, m2, c1, c2, c3 = 2610 / 16384, 2523 / 4096 * 128, 3424 / 4096, 2413 / 4096 * 32, 2392 / 4096 * 32
    p = max(signal, 0) ** (1 / m2)
    return 10000 * (max(p - c1, 0) / (c2 - c3 * p)) ** (1 / m1)


def code10(nits: float) -> int:
    """밝기(nit)의 10비트 제한 범위 luma 코드(무채색 기준)."""
    return round(64 + 876 * pq_encode(nits))


def nits_of_code10(code: float) -> float:
    return pq_decode((code - 64) / 876)


def filter_graph(cfg: dict, width: int, height: int) -> str:
    """SDR(0) + 빛 지도(1) → HDR [v]. 16비트 선형 정수에서 계산한다: SDR 흰색을 전체 범위의 1/boost 에 두고(base),
    원래 선형 값(lin = base × boost)과 빛 지도로 섞으면 base × (1 + (boost − 1) × g) 가 된다."""
    b, white = float(cfg["peak_boost"]), float(cfg["sdr_white_nits"])
    lo, span = cfg["gate"][0] * 255, (cfg["gate"][1] - cfg["gate"][0]) * 255
    return (
        "[0:v]split=2[sa][sb];"
        "[sa]zscale=tin=bt709:min=bt709:pin=bt709:rin=tv:t=linear:r=pc,format=gbrp16le,split=2[lin][lin2];"
        f"[lin2]lutrgb=r='val/{b:g}':g='val/{b:g}':b='val/{b:g}'[base];"
        "[sb]scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=gbrp,extractplanes=r+g+b[r][g][b];"
        "[r][g]blend=all_mode=lighten[rg];"
        f"[rg][b]blend=all_mode=lighten,lut=y='clip((val-{lo:g})*255/{span:g}\\,0\\,255)'[gate];"
        f"[1:v]scale={width}:{height}:flags=bilinear:in_range=tv:out_range=pc,format=gray[m];"
        "[m][gate]blend=all_mode=multiply,format=gbrp16le[g16];"
        "[base][lin][g16]maskedmerge[hl];"
        f"[hl]zscale=tin=linear:pin=bt709:p=bt2020:t=smpte2084:m=bt2020nc:r=tv:npl={white * b:g},format=yuv420p10le[v]"
    )


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)


def probe(path: Path) -> dict:
    r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", "-count_packets", path])
    if r.returncode != 0:
        raise RuntimeError(f"ffprobe 실패({path}): {r.stderr.strip()[:300]}")
    return json.loads(r.stdout)


def vstream(info: dict) -> dict:
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if v is None:
        raise RuntimeError("영상 스트림이 없습니다")
    return v


def frames_of(v: dict) -> int:
    return int(v.get("nb_read_packets") or v.get("nb_frames") or 0)


def peak_luma(path: Path) -> int:
    """HDR 판 전체에서 가장 밝은 luma 코드(10비트). 전체를 한 번 디코딩한다."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-v", "info", "-i", path, "-an",
             "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YMAX", "-f", "null", "-"])
    vals = [float(x) for x in re.findall(r"lavfi\.signalstats\.YMAX=([0-9.]+)", r.stderr + r.stdout)]
    if not vals:
        raise RuntimeError("최대 밝기를 재지 못했습니다(signalstats 출력 없음)")
    return int(max(vals))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--visual", required=True, type=Path, help="SDR 그림(outputs/<slug>/visual.mp4)")
    ap.add_argument("--gain", required=True, type=Path, help="빛 지도(outputs/<slug>/gain.mp4, 옆의 gain.json 도 읽는다)")
    ap.add_argument("--final", required=True, type=Path, help="SDR 최종본(소리를 옮겨 오고 길이를 견준다)")
    ap.add_argument("--out", required=True, type=Path, help="HDR 판(…/final/hdr/<slug>.hdr.mp4)")
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--allow-empty", action="store_true", help="빛 지도가 비어 있어도 만든다(SDR 과 같은 밝기의 HDR 판)")
    a = ap.parse_args(argv)

    try:
        cfg = load_config(a.config)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"hdr: 설정 오류 — {e}", file=sys.stderr)
        return 2
    if not cfg["enabled"]:
        print(f"hdr: 꺼져 있음({a.config.name} enabled=false) — HDR 판을 만들지 않습니다")
        return 0
    for p in (a.visual, a.gain, a.final):
        if not p.is_file():
            print(f"hdr: 파일 없음 — {p}" + ("  (render 단계가 gain.mp4 를 함께 씁니다: run.sh render)" if p == a.gain else ""), file=sys.stderr)
            return 2
    gj = a.gain.with_suffix(".json")
    lit = int(json.loads(gj.read_text(encoding="utf-8")).get("lit_frames", 0)) if gj.is_file() else -1
    if lit == 0 and not a.allow_empty:
        print("hdr: 빛 지도가 비어 있습니다 — lit() 를 쓴 프레임이 없습니다.\n"
              "     빛나는 것(에너지·신호)을 scenes.mjs 에서 lit(stage, c => …) 안에서 그린 뒤 render 부터 다시 돌리세요.\n"
              "     정말 빛나는 것이 없는 편이면 SKIP_HDR=1 로 건너뛰고 까닭을 brief.md 에 적습니다.", file=sys.stderr)
        return 3

    try:
        v0, v1 = vstream(probe(a.visual)), vstream(probe(a.gain))
        fin = probe(a.final)
    except RuntimeError as e:
        print(f"hdr: {e}", file=sys.stderr)
        return 2
    w, h, n0, n1 = int(v0["width"]), int(v0["height"]), frames_of(v0), frames_of(v1)
    if n0 != n1:
        print(f"hdr: 프레임 수가 다릅니다 — visual {n0}, gain {n1}. render 를 다시 돌리세요(둘은 같은 실행에서 나와야 합니다)", file=sys.stderr)
        return 2
    if not any(s.get("codec_type") == "audio" for s in fin.get("streams", [])):
        print(f"hdr: SDR 최종본에 소리가 없습니다 — {a.final}", file=sys.stderr)
        return 2

    white, boost = float(cfg["sdr_white_nits"]), float(cfg["peak_boost"])
    max_cll = int(cfg["max_cll"] or math.ceil(white * boost))
    x265 = (f"log-level=error:hdr-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited:"
            f"master-display={MASTER_DISPLAY}:max-cll={max_cll},{int(cfg['max_fall'])}")
    a.out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-v", "warning", "-i", a.visual, "-i", a.gain, "-i", a.final,
           "-filter_complex", filter_graph(cfg, w, h), "-map", "[v]", "-map", "2:a:0", "-c:a", "copy",
           "-c:v", "libx265", "-preset", str(cfg["preset"]), "-crf", str(cfg["crf"]), "-pix_fmt", "yuv420p10le", "-x265-params", x265,
           "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", "-color_range", "tv",
           "-tag:v", "hvc1", "-map_metadata", "2", "-metadata:s:a:0", "language=kor", "-movflags", "+faststart", a.out]
    t0 = dt.datetime.now()
    r = run(cmd)
    if r.returncode != 0:
        print(f"hdr: ffmpeg 실패\n{r.stderr.strip()[-1500:]}", file=sys.stderr)
        return 2
    secs = (dt.datetime.now() - t0).total_seconds()

    out = probe(a.out)
    vo = vstream(out)
    problems = []
    for key, want in (("codec_name", "hevc"), ("pix_fmt", "yuv420p10le"), ("color_primaries", "bt2020"),
                      ("color_transfer", "smpte2084"), ("color_space", "bt2020nc")):
        if vo.get(key) != want:
            problems.append(f"{key}={vo.get(key)} (기대 {want})")
    d_out, d_fin = float(out["format"]["duration"]), float(fin["format"]["duration"])
    if abs(d_out - d_fin) > 0.1:
        problems.append(f"길이 {d_out:.2f}s ≠ SDR 최종본 {d_fin:.2f}s")
    if problems:
        print("hdr: 만든 파일의 규격이 틀립니다 — " + "; ".join(problems), file=sys.stderr)
        return 2
    peak = peak_luma(a.out)
    white_code = code10(white)
    data = a.out.read_bytes()
    report = {
        "file": a.out.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "created": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "codec": "hevc Main 10", "pix_fmt": "yuv420p10le", "color": "bt2020 / smpte2084 (PQ) / bt2020nc", "duration": round(d_out, 3),
        "settings": {k: cfg[k] for k in ("sdr_white_nits", "peak_boost", "gate", "crf", "preset")} | {"max_cll": max_cll, "max_fall": int(cfg["max_fall"])},
        "frames": n0, "lit_frames": lit, "sdr_white_code": white_code, "peak_code": peak, "peak_nits_estimate": round(nits_of_code10(peak)),
        "encode_seconds": round(secs, 1), "note": "peak_nits_estimate 는 무채색으로 보고 luma 코드에서 어림한 값",
    }
    a.out.with_name("hdr.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"hdr: {a.out}  ({len(data)} bytes, {secs:.0f} s)")
    print(f"  HEVC Main 10 · BT.2020 · PQ · SDR 흰색 {white:g} nit(코드 {white_code}) · 최대 {boost:g}배")
    print(f"  빛 지도: lit() 프레임 {lit}/{n0} · 가장 밝은 화소 코드 {peak} ≈ {report['peak_nits_estimate']} nit")
    if lit > 0 and peak <= white_code + 8:
        print("  경고: 빛 지도는 있는데 HDR 판의 최대 밝기가 SDR 흰색을 넘지 않습니다 — lit() 로 표시한 곳의 화면이 어둡거나(gate 아래) gain 이 낮습니다. "
              "stills/contact-sheet-hdr.jpg 로 빛 지도를 확인하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
