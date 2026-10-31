"""Supertonic 3 합성 + 자산 대조.

Provenance
  source repo   : https://github.com/doroper98/osint_generator
  source paths  : script/tts/supertonic.py, script/tts/supertonic_assets.py, script/tts/cache.py(cache_key)
  source commit : 131db0097a547a3fd0742488540eedc229017073 (script/tts/* identical to 7d85942e536e0eb0796292aa628540d8319cf9af)
  changed       :
    - seed()·cache_salt()·voice_label()·chunks()·synth_wav()·write_mp3()·MP3_ARGS·SEED_BYTES·cache_key(): 같은 수식·같은 순서.
    - 설정은 orchestrator.config 대신 voice_config.SupertonicConfig(config/voice-reference.json).
    - 자산 폴더 = <models_dir>/supertonic-3 (원: assets/tts/supertonic). 안내 명령 = pipeline/narration/fetch_assets.py.
    - supertonic_assets.py 의 mismatches()/require_assets() 를 이 파일로 합쳤다(같은 sha1 대조, 다른 목소리로 넘어가지 않음).
    - onnxruntime 은 engine() 안에서 지연 import(자산 받기·검사 도구가 onnxruntime 없이도 돈다).
    - synth_all() 은 쓰지 않아 옮기지 않았다(narrate.py 가 문장마다 synth_one 호출).
"""

from __future__ import annotations

import hashlib
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from pipeline.narration.voice_config import SupertonicConfig, sha1_file, supertonic_dir

SEED_BYTES = 8
MP3_ARGS = ("-ac", "1", "-codec:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1",
            "-fflags", "+bitexact", "-flags:a", "+bitexact", "-id3v2_version", "0", "-write_xing", "0")
FETCH_CMD = "python pipeline/narration/fetch_assets.py --supertonic"


class SupertonicAssetError(RuntimeError):
    pass


# ---- supertonic_assets.py -------------------------------------------------------------------------------------------

def mismatches(cfg: SupertonicConfig, mdir: Path) -> list[str]:
    """없는 파일·sha1 다른 파일 목록(사람이 읽는 한 줄씩). 빈 목록 = 전부 일치."""
    base = supertonic_dir(mdir)
    out: list[str] = []
    for rel, want in cfg.assets.items():
        p = base / rel
        if not p.is_file():
            out.append(f"{rel}: 없음")
            continue
        got = sha1_file(p)
        if got != want:
            out.append(f"{rel}: sha1 {got} ≠ {want}")
    return out


def require_assets(cfg: SupertonicConfig, mdir: Path) -> Path:
    """자산 폴더를 돌려준다. 자산이 모자라면 받는 명령을 담은 오류(다른 목소리로 넘어가지 않는다)."""
    bad = mismatches(cfg, mdir)
    if bad:
        raise SupertonicAssetError(f"Supertonic 자산 {len(bad)}건 문제({supertonic_dir(mdir)}):\n  "
                                   + "\n  ".join(bad) + f"\n받기·대조: {FETCH_CMD} --models-dir {mdir}")
    return supertonic_dir(mdir)


# ---- supertonic.py --------------------------------------------------------------------------------------------------

def voice_label(cfg: SupertonicConfig) -> str:
    return f"supertonic-3 {cfg.voice_style} ×{cfg.speed}"


def cache_salt(cfg: SupertonicConfig) -> str:
    """캐시 키 소금 — 소리를 바꾸는 값 전부."""
    return (f"|st|{cfg.voice_style}|{cfg.speed}|{cfg.total_step}|{cfg.silence_sec}|{cfg.max_chunk_len}"
            f"|{cfg.seed_salt}|{cfg.revision[:8]}")


def cache_key(tts: str, salt: str) -> str:
    """script/tts/cache.py cache_key(tts, None, supertonic_salt) 와 같은 값."""
    return hashlib.sha1((tts + salt).encode()).hexdigest()[:10]


def seed(tts: str, cfg: SupertonicConfig) -> int:
    h = hashlib.sha1(f"{tts}|{cfg.voice_style}|{cfg.speed}|{cfg.total_step}|{cfg.seed_salt}".encode()).digest()
    return int.from_bytes(h[:SEED_BYTES], "big")


def chunks(tts: str, cfg: SupertonicConfig) -> list[str]:
    """합성 때 나뉠 조각(합성 없이 같은 규칙)."""
    from pipeline.narration.supertonic_runtime import chunk_text  # noqa: PLC0415

    return chunk_text(tts, cfg.max_chunk_len)


@lru_cache(maxsize=1)
def _engine(asset_dir: str, style_name: str):  # noqa: ANN202 — (TextToSpeech, Style)
    from pipeline.narration.supertonic_runtime import TextToSpeech, load_style  # noqa: PLC0415

    base = Path(asset_dir)
    return TextToSpeech(base / "onnx"), load_style(base / "voice_styles" / f"{style_name}.json")


def engine(cfg: SupertonicConfig, mdir: Path):  # noqa: ANN201
    """ONNX 세션은 프로세스당 한 번. 자산 대조를 먼저 한다."""
    base = require_assets(cfg, mdir)
    style_file = base / "voice_styles" / f"{cfg.voice_style}.json"
    if not style_file.is_file():
        raise SupertonicAssetError(f"음성 프리셋 파일 없음: {style_file}\n받기: python pipeline/narration/fetch_assets.py --styles --models-dir {mdir}")
    return _engine(str(base), cfg.voice_style)


def synth_wav(tts: str, cfg: SupertonicConfig, mdir: Path) -> tuple[np.ndarray, int, list[str]]:
    """발음 텍스트 → (wav float32, 표본율, 조각)."""
    eng, style = engine(cfg, mdir)
    wav, parts = eng.synth(tts, style, cfg.total_step, cfg.speed, cfg.silence_sec, cfg.max_chunk_len,
                           np.random.default_rng(seed(tts, cfg)))
    return wav, eng.sample_rate, parts


def write_mp3(wav: np.ndarray, sr: int, path: Path) -> None:
    with tempfile.TemporaryDirectory() as d:
        w = Path(d) / "a.wav"
        wavfile.write(w, sr, np.clip(wav, -1.0, 1.0).astype(np.float32))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(w), *MP3_ARGS, str(path)], check=True)


def synth_one(tts: str, path: Path, cfg: SupertonicConfig, mdir: Path) -> tuple[list[str], int]:
    """→ (조각, 합성 표본율). mp3 는 임시 이름에 쓴 뒤 바꾼다(중간에 끊긴 파일이 캐시로 남지 않게 — 원본과 다른 점)."""
    wav, sr, parts = synth_wav(tts, cfg, mdir)
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.stem + ".part.mp3")
    write_mp3(wav, sr, part)
    part.replace(path)
    return parts, sr
