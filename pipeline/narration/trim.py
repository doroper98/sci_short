"""음성 무음 트림·페이드. 44.1k mono float32 npy 로 저장.

Provenance
  source repo   : https://github.com/doroper98/osint_generator
  source path   : script/tts/trim.py
  source commit : 131db0097a547a3fd0742488540eedc229017073 (script/tts/* identical to 7d85942e536e0eb0796292aa628540d8319cf9af)
  changed       : SR/THRESH/PRE_SEC/POST_SEC/FADE_SEC·decode()·trim() 는 원본과 같다(수식·순서 동일).
                  trim_to_npy() 는 npy 를 mp3 옆이 아니라 호출자가 준 경로(corrected/<id>.npy)에 쓰도록 out 인자를 받는다.

trim_offset(앞에서 잘라낸 길이, 초)을 돌려준다. 정렬 타임스탬프(원본 mp3 기준)를 트림된 음성 시각으로 옮길 때 뺀다.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

SR = 44100
THRESH = 0.012      # 무음 판정 진폭
PRE_SEC = 0.03      # 첫 소리 앞 여유
POST_SEC = 0.12     # 끝 소리 뒤 여유
FADE_SEC = 0.01


def decode(mp3: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp3), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def trim(a: np.ndarray, ref: np.ndarray | None = None) -> tuple[np.ndarray, int]:
    """(트림·페이드된 음성, 앞에서 잘라낸 샘플 수). ref = 자를 자리를 정하는 원음(끝 억양 보정 음성도 원음과 같은 자리에서 자른다:
    합성 꼬리의 잡음이 문턱을 넘어 길이·타임라인이 바뀌지 않게)."""
    idx = np.where(np.abs(a if ref is None else ref) > THRESH)[0]
    if len(idx) == 0:
        raise ValueError("음성에 소리가 없다")
    start = max(0, idx[0] - int(PRE_SEC * SR))
    a = a[start: min(len(a), idx[-1] + int(POST_SEC * SR))].copy()
    f = int(FADE_SEC * SR)
    a[:f] *= np.linspace(0, 1, f)
    a[-f:] *= np.linspace(1, 0, f)
    return a, int(start)


def trim_to_npy(mp3: Path, out: Path, audio: np.ndarray | None = None) -> tuple[Path, float, float]:
    """→ (npy 경로, 트림 후 길이 초, trim_offset 초). audio = 디코드 뒤 보정한 음성(원본과 같은 길이) — 없으면 mp3 디코드."""
    a, start = trim(decode(mp3)) if audio is None else trim(audio, ref=decode(mp3))
    out.parent.mkdir(parents=True, exist_ok=True)
    np.save(out, a)
    return out, len(a) / SR, start / SR
