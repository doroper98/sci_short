"""대본(script.json) → 표준 음성 내레이션·타임라인·자막.

    python pipeline/narration/narrate.py --script episodes/<slug>/script.json --out outputs/<slug>/narration
                                         [--max-sec 180] [--skip-alignment] [--models-dir DIR] [--max-chars 18]

표준(기본) 경로 — osint_generator script/plan.py build() 의 Supertonic 갈래와 같은 순서:
  발음 텍스트(명시 tts 또는 auto_tts) → lint_tts → Supertonic 3 M3 ×0.95 합성(문장 시드) → raw/<id>_<key>.mp3
  → MMS 강제 정렬(.align.json, min_score 0.62) → mp3 디코드(44.1k) → final_fall(‘니다’ 끝 3글자 −4반음)
  → trim(y, ref=원음) → corrected/<id>.npy → 타임라인·자막·narration.wav(시간 압축 없음)
--skip-alignment = 명시적 degraded: 정렬·final_fall 없음, 비례 자막, timeline.degraded = true.
기본 경로에서 MMS 가중치·torch 가 없으면 오류다(조용히 degraded 로 내려가지 않는다).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
import warnings
from dataclasses import asdict
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np  # noqa: E402

from pipeline.narration import captions as cap  # noqa: E402
from pipeline.narration import forced_align as fa  # noqa: E402
from pipeline.narration import prosody, synth  # noqa: E402
from pipeline.narration import trim as trim_mod  # noqa: E402
from pipeline.narration.pronounce import PronounceError, TtsLintError, auto_tts, lint_tts  # noqa: E402
from pipeline.narration.script_schema import Script, ScriptError, load_script  # noqa: E402
from pipeline.narration.timeline import place_sentences, scene_bounds  # noqa: E402
from pipeline.narration.voice_config import (  # noqa: E402
    SOURCE_COMMIT, VoiceConfig, load_voice_config, models_dir, sha256_file,
)

# 알려진 무해한 경고 두 개만 숨긴다: pyworld 0.3.5 의 pkg_resources import, torchaudio 2.8 의 forced_align 폐지 예고(2.9 에서 제거 →
# torchaudio==2.8.0 고정의 이유).
warnings.filterwarnings("ignore", message="pkg_resources is deprecated", category=UserWarning)
warnings.filterwarnings("ignore", message=r".*forced_align has been deprecated", category=UserWarning)

SR = trim_mod.SR
PEAK = 0.8
DEFAULT_MAX_SEC = 180.0
PIPELINE_VERSION = "narration-v1"
TOO_LONG = "대본을 줄이세요. 음성을 가속하지 않습니다."
DEGRADED_BANNER = ("!" * 78 + "\n!! DEGRADED (--skip-alignment): MMS 정렬 없음 · final_fall(문장 끝 억양) 미적용 · 자막 시각은 글자 수 비례.\n"
                   "!! 표준 음성이 아니다. 확인용으로만 쓰고 최종 영상에는 기본 경로로 다시 만든다.\n" + "!" * 78)


class NarrateError(RuntimeError):
    pass


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _sha256_json(obj) -> str:  # noqa: ANN001
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _read_json(p: Path) -> dict | None:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _ver(pkg: str) -> str | None:
    try:
        return version(pkg)
    except PackageNotFoundError:
        return None


def library_versions(degraded: bool) -> dict:
    out = {k: _ver(k) for k in ("numpy", "scipy", "onnxruntime", "soundfile", "pyworld")}
    if not degraded:
        out.update({k: _ver(k) for k in ("torch", "torchaudio", "uroman")})
    try:
        out["ffmpeg"] = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    except (OSError, IndexError):
        out["ffmpeg"] = None
    out["python"] = sys.version.split()[0]
    return out


# ---- 1. 발음 텍스트 -------------------------------------------------------------------------------------------------

def resolve_tts(script: Script) -> dict[str, tuple[str, str]]:
    """id → (발음 텍스트, 'explicit'|'auto'). 오류는 모아서 한 번에."""
    out, errs = {}, []
    for s in script.sentences:
        try:
            tts = s.tts if s.tts is not None else auto_tts(s.text)
            out[s.id] = (lint_tts(tts), "explicit" if s.tts is not None else "auto")
        except (PronounceError, TtsLintError) as ex:
            errs.append(f"{s.id}: {ex}")
    if errs:
        raise NarrateError("발음 텍스트 오류(합성 전에 멈춤):\n  " + "\n  ".join(errs))
    return out


# ---- 2. 합성(캐시) --------------------------------------------------------------------------------------------------

def synth_cached(sid: str, tts: str, vc: VoiceConfig, mdir: Path, raw_dir: Path) -> tuple[Path, dict, bool]:
    cfg = vc.supertonic
    salt = synth.cache_salt(cfg)
    mp3 = raw_dir / f"{sid}_{synth.cache_key(tts, salt)}.mp3"
    side = Path(str(mp3) + ".provenance.json")
    voice = asdict(cfg)
    fp = _sha256_json({"tts": tts, "voice": voice, "cache_salt": salt, "mp3_args": list(synth.MP3_ARGS),
                       "seed": synth.seed(tts, cfg)})
    old = _read_json(side)
    if old and old.get("fingerprint") == fp and mp3.is_file() and mp3.stat().st_size > 1000 \
            and sha256_file(mp3) == old.get("audio_sha256"):
        return mp3, old, True
    t = time.perf_counter()
    parts, sr = synth.synth_one(tts, mp3, cfg, mdir)
    rec = {"kind": "supertonic_synthesis", "fingerprint": fp, "tts": tts, "voice": voice, "voice_label": synth.voice_label(cfg),
           "cache_salt": salt, "seed": synth.seed(tts, cfg), "chunks": parts, "synth_sample_rate": sr,
           "mp3_args": list(synth.MP3_ARGS), "audio_sha256": sha256_file(mp3),
           "elapsed_ms": round((time.perf_counter() - t) * 1000), "ported_from": f"osint_generator@{SOURCE_COMMIT}"}
    side.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    return mp3, rec, False


# ---- 3. 정렬(캐시) --------------------------------------------------------------------------------------------------

def align_cached(mp3: Path, tts: str, audio_sha: str, model_sha1: str, vc: VoiceConfig, mdir: Path) -> tuple[dict, bool]:
    al = None
    try:
        al = fa.read(mp3)
    except (fa.AlignmentError, KeyError, json.JSONDecodeError):
        al = None
    if al and "".join(al["characters"]) == tts and al.get("audio_sha256") == audio_sha \
            and al.get("model_sha1") == model_sha1 and al.get("min_score") == vc.alignment.min_score:
        return al, True
    try:
        al = fa.align_file(mp3, tts, vc.alignment, mdir)
    except (fa.ForcedAlignError, fa.AlignmentError) as ex:
        raise NarrateError(f"강제 정렬 실패 — {ex}") from ex
    al.update(audio_sha256=audio_sha, model_sha1=model_sha1, min_score=vc.alignment.min_score)
    fa.write(mp3, al)
    return al, False


# ---- 4. 끝 억양 + 트림(캐시) ---------------------------------------------------------------------------------------

DEGRADED_FF = {"applied": False, "reason": "degraded: --skip-alignment (정렬 없음, final_fall 미적용)", "region_sec": None,
               "semitones": None, "f0_start_hz": None, "f0_end_hz": None, "octave_fixed_n": None}


def process_cached(sid: str, mp3: Path, audio_sha: str, tts: str, al: dict | None, vc: VoiceConfig, cor_dir: Path,
                   degraded: bool) -> tuple[Path, dict, bool]:
    npy = cor_dir / f"{sid}.npy"
    side = cor_dir / f"{sid}.processing.json"
    al_fp = None if al is None else _sha256_json({k: al[k] for k in ("characters", "character_start_times_seconds",
                                                                     "character_end_times_seconds")})
    fp = _sha256_json({"v": PIPELINE_VERSION, "raw_sha256": audio_sha, "tts": tts, "align": al_fp, "degraded": degraded,
                       "final_fall": None if degraded else vc.final_fall.to_dict(),
                       "trim": [trim_mod.SR, trim_mod.THRESH, trim_mod.PRE_SEC, trim_mod.POST_SEC, trim_mod.FADE_SEC]})
    old = _read_json(side)
    if old and old.get("fingerprint") == fp and npy.is_file() and sha256_file(npy) == old.get("npy_sha256"):
        return npy, old, True
    t = time.perf_counter()
    raw = trim_mod.decode(mp3)
    if degraded:
        ff = dict(DEGRADED_FF)
        a, start = trim_mod.trim(raw)
    else:
        try:
            y, rec = prosody.final_fall(raw, al or {}, tts, vc.final_fall)
        except prosody.ProsodyError as ex:
            raise NarrateError(f"{sid}: 문장 끝 억양 보정 실패 — {ex}") from ex
        ff = rec.model_dump()
        a, start = trim_mod.trim(y, ref=raw)
    cor_dir.mkdir(parents=True, exist_ok=True)
    np.save(npy, a)
    rec = {"fingerprint": fp, "npy_sha256": sha256_file(npy), "trim_offset": start / SR, "trim_offset_samples": start,
           "duration": len(a) / SR, "final_fall": ff, "elapsed_ms": round((time.perf_counter() - t) * 1000)}
    side.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    return npy, rec, False


# ---- 5. 조립 ---------------------------------------------------------------------------------------------------------

def _abs(t_raw: float, start: float, end: float, off: float) -> float:
    return min(max(start + t_raw - off, start), end)


def build(args: argparse.Namespace) -> int:
    t_all = time.perf_counter()
    degraded = bool(args.skip_alignment)
    vc = load_voice_config()
    mdir = models_dir(args.models_dir)
    script = load_script(Path(args.script))
    out = Path(args.out).resolve()
    raw_dir, cor_dir = out / "raw", out / "corrected"
    raw_dir.mkdir(parents=True, exist_ok=True)
    if degraded:
        log(DEGRADED_BANNER)

    tts_of = resolve_tts(script)
    # 사전 점검 — 합성 전에 실패
    synth.require_assets(vc.supertonic, mdir)
    model_sha1 = None
    runtime = None
    if not degraded:
        runtime = fa.require_runtime()
        model_sha1 = fa.require_assets(vc.alignment, mdir)
        try:
            prosody._pyworld()  # noqa: SLF001 — 없으면 폴백 없이 오류
        except prosody.ProsodyError as ex:
            raise NarrateError(str(ex)) from ex

    timings = {"synth_sec": 0.0, "align_sec": 0.0, "prosody_trim_sec": 0.0}
    rows: dict[str, dict] = {}
    for s in script.sentences:
        tts, src = tts_of[s.id]
        t = time.perf_counter()
        mp3, srec, hit = synth_cached(s.id, tts, vc, mdir, raw_dir)
        timings["synth_sec"] += time.perf_counter() - t
        audio_sha = srec["audio_sha256"]
        al, al_hit = None, None
        if not degraded:
            t = time.perf_counter()
            al, al_hit = align_cached(mp3, tts, audio_sha, model_sha1, vc, mdir)
            timings["align_sec"] += time.perf_counter() - t
        t = time.perf_counter()
        npy, prec, p_hit = process_cached(s.id, mp3, audio_sha, tts, al, vc, cor_dir, degraded)
        timings["prosody_trim_sec"] += time.perf_counter() - t
        ff = prec["final_fall"]
        expects = prosody.span_start_index(tts, vc.final_fall) is not None
        if not degraded and expects and not ff["applied"]:
            raise NarrateError(f"{s.id}: '{vc.final_fall.suffix}' 로 끝나는데 final_fall 이 적용되지 않았다 — {ff['reason']}")
        rows[s.id] = dict(tts=tts, tts_source=src, mp3=mp3, synth=srec, synth_cached=hit, align=al, align_cached=al_hit,
                          npy=npy, proc=prec, proc_cached=p_hit)
        score = f" score {al['score_mean']:.3f}" if al else ""
        log(f"{s.id}: {prec['duration']:.2f}s{score} final_fall={'applied' if ff['applied'] else 'no'}"
            f" (synth {'cache' if hit else 'new'}{'' if degraded else ', align ' + ('cache' if al_hit else 'new')})")

    placed, duration = place_sentences(script, {k: r["proc"]["duration"] for k, r in rows.items()})
    scenes = scene_bounds(script, placed, duration)
    sent_out, all_cues = [], []
    for s, p in zip(script.sentences, placed):
        r = rows[s.id]
        off = r["proc"]["trim_offset"]
        chars, alignment, chars_full = [], None, None
        if r["align"] is not None:
            al = r["align"]
            chars_full = [{"c": c, "start": _abs(a, p.start, p.end, off), "end": _abs(b, p.start, p.end, off)}
                          for c, a, b in zip(al["characters"], al["character_start_times_seconds"],
                                             al["character_end_times_seconds"])]
            chars = [{"c": c["c"], "start": round(c["start"], 3), "end": round(c["end"], 3)} for c in chars_full]
            alignment = {"source": al["alignment_source"], "score_mean": al["score_mean"]}
        ff = dict(r["proc"]["final_fall"])
        if ff.get("region_sec"):   # 원본 mp3 축 → 타임라인 절대 시각(원본 축 값은 provenance 에)
            ff["region_sec"] = [round(_abs(x, p.start, p.end, off), 3) for x in ff["region_sec"]]
        sent_out.append({"id": s.id, "scene": s.scene, "text": s.text, "tts": r["tts"], "start": round(p.start, 3),
                         "end": round(p.end, 3), "gap": p.gap, "chars": chars, "alignment": alignment, "final_fall": ff,
                         "audio": {"raw_mp3": str(r["mp3"].relative_to(out)), "npy": str(r["npy"].relative_to(out)),
                                   "trim_offset": round(off, 4)}})
        all_cues += cap.cue_times(s.id, s.text, r["tts"], chars_full, (p.start, p.end), args.max_chars)
    cue_warns = cap.fit_cues(all_cues)
    for w in cue_warns:
        log("경고: " + w)
    timeline = {"schema_version": 1, "title": script.title, "language": script.language,
                "voice": (f"{synth.voice_label(vc.supertonic)} (UNALIGNED, final_fall not applied)" if degraded
                          else f"{synth.voice_label(vc.supertonic)} + final_fall"),
                "degraded": degraded, "sample_rate": SR, "duration": round(duration, 3),
                "lead_sec": script.lead_sec, "tail_sec": script.tail_sec,
                "scenes": [{**sc, "start": round(sc["start"], 3), "end": round(sc["end"], 3)} for sc in scenes],
                "sentences": sent_out, "captions": [c.to_dict() for c in all_cues]}
    too_long = duration > args.max_sec
    prov = {
        "schema_version": 1, "pipeline": PIPELINE_VERSION, "ported_from": {"repo": "https://github.com/doroper98/osint_generator",
                                                                         "commit": SOURCE_COMMIT},
        "script": str(Path(args.script).resolve()), "script_sha256": sha256_file(Path(args.script)),
        "voice_reference": {"path": vc.source_path, "sha256": vc.source_sha256},
        "voice": timeline["voice"], "degraded": degraded, "max_sec": args.max_sec, "too_long": too_long,
        "models": {"dir": str(mdir), "supertonic": {"revision": vc.supertonic.revision, "sha1": vc.supertonic.assets},
                   "mms_fa": None if degraded else {"url": vc.alignment.url, "sha1": model_sha1, "min_score": vc.alignment.min_score}},
        "final_fall_rules": None if degraded else vc.final_fall.to_dict(),
        "libraries": library_versions(degraded), "alignment_runtime": runtime,
        "timings_sec": {k: round(v, 2) for k, v in timings.items()},
        "caption_warnings": cue_warns,
        "sentences": [{"id": s.id, "tts": rows[s.id]["tts"], "tts_source": rows[s.id]["tts_source"],
                       "synth_fingerprint": rows[s.id]["synth"]["fingerprint"], "seed": rows[s.id]["synth"]["seed"],
                       "chunks": rows[s.id]["synth"]["chunks"], "raw_mp3_sha256": rows[s.id]["synth"]["audio_sha256"],
                       "synth_cached": rows[s.id]["synth_cached"],
                       "alignment": None if rows[s.id]["align"] is None else {
                           "source": rows[s.id]["align"]["alignment_source"], "score_mean": rows[s.id]["align"]["score_mean"],
                           "elapsed_ms": rows[s.id]["align"].get("elapsed_ms"), "cached": rows[s.id]["align_cached"]},
                       "final_fall_raw_axis": rows[s.id]["proc"]["final_fall"],
                       "processing_fingerprint": rows[s.id]["proc"]["fingerprint"], "npy_sha256": rows[s.id]["proc"]["npy_sha256"],
                       "trim_offset": rows[s.id]["proc"]["trim_offset"], "duration": rows[s.id]["proc"]["duration"]}
                      for s in script.sentences],
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")
    if too_long:
        prov["error"] = f"duration {duration:.2f}s > max {args.max_sec}s — {TOO_LONG}"
        (out / "provenance.json").write_text(json.dumps(prov, ensure_ascii=False, indent=1), encoding="utf-8")
        (out / "narration.wav").unlink(missing_ok=True)
        log(f"실패: 길이 {duration:.2f}s > {args.max_sec}s. {TOO_LONG} (확인용 timeline.json 은 썼다; narration.wav 는 만들지 않았다)")
        return 3
    cap.write_srt(all_cues, out / "captions.srt")
    import soundfile as sf  # noqa: PLC0415

    buf = np.zeros(int(round(duration * SR)) + 1, dtype=np.float64)
    for s, p in zip(script.sentences, placed):
        a = np.load(rows[s.id]["npy"]).astype(np.float64)
        i = int(round(p.start * SR))
        buf[i:i + len(a)] += a[: max(0, len(buf) - i)]
    buf = buf[: int(round(duration * SR))]
    peak = float(np.max(np.abs(buf)))
    gain = PEAK / peak if peak > 0 else 1.0
    sf.write(out / "narration.wav", (buf * gain).astype(np.float32), SR, subtype="PCM_24")
    prov["mix"] = {"peak_before": round(peak, 6), "gain": round(gain, 6), "target_peak": PEAK, "subtype": "PCM_24",
                   "narration_wav_sha256": sha256_file(out / "narration.wav")}
    prov["timings_sec"]["total"] = round(time.perf_counter() - t_all, 2)
    (out / "provenance.json").write_text(json.dumps(prov, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"완료: {len(placed)}문장, {duration:.2f}s, voice = {timeline['voice']} → {out}")
    log(f"시간: {prov['timings_sec']}")
    if degraded:
        log(DEGRADED_BANNER)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="script.json → 표준 음성(Supertonic 3 M3 ×0.95 + final_fall) 내레이션")
    ap.add_argument("--script", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-sec", type=float, default=DEFAULT_MAX_SEC)
    ap.add_argument("--max-chars", type=int, default=cap.MAX_CHARS, help="자막 큐 하나의 최대 글자(공백 제외)")
    ap.add_argument("--skip-alignment", action="store_true",
                    help="DEGRADED: 정렬·final_fall 없이(비례 자막). 최종 산출물용이 아니다")
    ap.add_argument("--models-dir", default=None)
    args = ap.parse_args(argv)
    try:
        return build(args)
    except ScriptError as ex:
        log(str(ex))
        return 2
    except (NarrateError, synth.SupertonicAssetError, fa.ForcedAlignError, ValueError, OSError,
            subprocess.CalledProcessError) as ex:
        log(f"narrate 실패: {ex}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
