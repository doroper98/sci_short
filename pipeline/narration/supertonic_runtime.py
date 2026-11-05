# Provenance
#   source repo   : https://github.com/doroper98/osint_generator
#   source path   : script/tts/supertonic_runtime.py
#   source commit : 131db0097a547a3fd0742488540eedc229017073 (script/tts/* identical to 7d85942e536e0eb0796292aa628540d8319cf9af)
#   changed       : nothing below this header — byte-identical copy (MIT notice of Supertone Inc. kept verbatim).
#                   The "assets/tts/supertonic/LICENSE" path in the docstring refers to the original repo;
#                   here the same LICENSE file lives at <models_dir>/supertonic-3/LICENSE (pipeline/narration/assets.json).
"""Supertonic 3 ONNX 추론(v5.11.0 back_and_forth D-0152 V1, 설계 D147 §1).

원본: supertone-inc/supertonic `py/helper.py`(main, sha1 b65eeb8dadc28466aa873eaba19ee7f5ceddcfa3) — 아래 MIT 고지 유지.
옮기며 바꾼 것(동작이 달라지는 것은 ①뿐):
  ① 잠재 벡터 난수 = 전역 `np.random` 대신 호출자가 주는 `numpy.random.Generator`(문장 시드 고정 → 같은 입력 = 같은 wav).
  ② 속도·단계·조각 무음·조각 길이는 인자로만 받는다(값은 config.yaml tts.supertonic, 모듈 상수 없음 — 15 P3).
  ③ 조각(chunk) 목록을 돌려준다(plan 이 기록 — 조각 사이 무음은 자막 앵커에 영향).
  ④ 타입 힌트, 쓰지 않는 함수(timer·sanitize_filename·batch·GPU 분기) 삭제.
  ⑤ 조각마다 예측 길이로 자른 뒤 무음을 끼운다(원 example_onnx.py 는 이어 붙인 뒤 전체 예측 길이로 한 번 자른다 —
     조각이 하나면 같고, 여럿이면 조각 끝의 잠재 길이 덧붙임이 중간에 남지 않는다).

---
MIT License

Copyright (c) 2025 Supertone Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
---
모델 가중치는 별도 라이선스(BigScience OpenRAIL-M, `assets/tts/supertonic/LICENSE`)다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from unicodedata import normalize

import numpy as np
import onnxruntime as ort

LANG = "ko"
AVAILABLE_LANGS = ("en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu", "id", "it",
                   "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "na")
EMOJI = re.compile("[\U0001f600-\U0001f64f\U0001f300-\U0001f5ff\U0001f680-\U0001f6ff\U0001f700-\U0001f77f\U0001f780-\U0001f7ff"
                   "\U0001f800-\U0001f8ff\U0001f900-\U0001f9ff\U0001fa00-\U0001fa6f\U0001fa70-\U0001faff☀-⛿✀-➿"
                   "\U0001f1e6-\U0001f1ff]+", flags=re.UNICODE)
REPLACEMENTS = {"–": "-", "‑": "-", "—": "-", "_": " ", "“": '"', "”": '"', "‘": "'", "’": "'",
                "´": "'", "`": "'", "[": " ", "]": " ", "|": " ", "/": " ", "#": " ", "→": " ", "←": " "}
EXPR_REPLACEMENTS = {"@": " at ", "e.g.,": "for example, ", "i.e.,": "that is, "}
SENTENCE_SPLIT = (r"(?<!Mr\.)(?<!Mrs\.)(?<!Ms\.)(?<!Dr\.)(?<!Prof\.)(?<!Sr\.)(?<!Jr\.)(?<!Ph\.D\.)(?<!etc\.)(?<!e\.g\.)"
                  r"(?<!i\.e\.)(?<!vs\.)(?<!Inc\.)(?<!Ltd\.)(?<!Co\.)(?<!Corp\.)(?<!St\.)(?<!Ave\.)(?<!Blvd\.)(?<!\b[A-Z]\.)"
                  r"(?<=[.!?])\s+")
ONNX_FILES = ("duration_predictor", "text_encoder", "vector_estimator", "vocoder")


def preprocess_text(text: str, lang: str) -> str:
    """원본 UnicodeProcessor._preprocess_text 그대로(NFKD·기호 치환·끝 문장부호·언어 태그)."""
    text = EMOJI.sub("", normalize("NFKD", text))
    for k, v in REPLACEMENTS.items():
        text = text.replace(k, v)
    text = re.sub(r"[♥☆♡©\\]", "", text)
    for k, v in EXPR_REPLACEMENTS.items():
        text = text.replace(k, v)
    for p in (",", r"\.", "!", r"\?", ";", ":", "'"):
        text = re.sub(" " + p, p.replace("\\", ""), text)
    for q in ('""', "''", "``"):
        while q in text:
            text = text.replace(q, q[0])
    text = re.sub(r"\s+", " ", text).strip()
    if not re.search(r"[.!?;:,'\"')\]}…。」』】〉》›»]$", text):
        text += "."
    if lang not in AVAILABLE_LANGS:
        raise ValueError(f"Invalid language: {lang}")
    return f"<{lang}>" + text + f"</{lang}>"


def length_to_mask(lengths: np.ndarray, max_len: Optional[int] = None) -> np.ndarray:
    max_len = max_len or int(lengths.max())
    ids = np.arange(0, max_len)
    return (ids < np.expand_dims(lengths, axis=1)).astype(np.float32).reshape(-1, 1, max_len)


def chunk_text(text: str, max_len: int) -> list[str]:
    """문단·문장 경계로 자른다(원본 그대로). 문장 하나가 max_len 보다 길면 자르지 않는다."""
    chunks: list[str] = []
    for paragraph in (p.strip() for p in re.split(r"\n\s*\n+", text.strip()) if p.strip()):
        current = ""
        for sentence in re.split(SENTENCE_SPLIT, paragraph):
            if len(current) + len(sentence) + 1 <= max_len:
                current += (" " if current else "") + sentence
            else:
                if current:
                    chunks.append(current.strip())
                current = sentence
        if current:
            chunks.append(current.strip())
    return chunks


@dataclass(frozen=True)
class Style:
    ttl: np.ndarray
    dp: np.ndarray


def load_style(path: Path) -> Style:
    d = json.loads(path.read_text(encoding="utf-8"))
    t, p = d["style_ttl"]["dims"], d["style_dp"]["dims"]
    return Style(np.array(d["style_ttl"]["data"], dtype=np.float32).reshape(1, t[1], t[2]),
                 np.array(d["style_dp"]["data"], dtype=np.float32).reshape(1, p[1], p[2]))


class TextToSpeech:
    """ONNX 세션 4개 + 글자 색인. 프로세스당 한 번 만든다(D147 §1)."""

    def __init__(self, onnx_dir: Path) -> None:
        cfgs = json.loads((onnx_dir / "tts.json").read_text(encoding="utf-8"))
        self.indexer: list[int] = json.loads((onnx_dir / "unicode_indexer.json").read_text(encoding="utf-8"))
        opts = ort.SessionOptions()
        self.dp, self.text_enc, self.vector_est, self.vocoder = (
            ort.InferenceSession(str(onnx_dir / f"{n}.onnx"), sess_options=opts, providers=["CPUExecutionProvider"])
            for n in ONNX_FILES)
        self.sample_rate: int = cfgs["ae"]["sample_rate"]
        self.base_chunk_size: int = cfgs["ae"]["base_chunk_size"]
        self.chunk_compress_factor: int = cfgs["ttl"]["chunk_compress_factor"]
        self.ldim: int = cfgs["ttl"]["latent_dim"]

    def _text_ids(self, text: str, lang: str) -> tuple[np.ndarray, np.ndarray]:
        t = preprocess_text(text, lang)
        ids = np.array([[self.indexer[ord(c)] for c in t]], dtype=np.int64)
        return ids, length_to_mask(np.array([len(t)], dtype=np.int64))

    def _noisy_latent(self, duration: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
        wav_lengths = (duration * self.sample_rate).astype(np.int64)
        chunk = self.base_chunk_size * self.chunk_compress_factor
        latent_len = int((duration.max() * self.sample_rate + chunk - 1) / chunk)
        x = rng.standard_normal((len(duration), self.ldim * self.chunk_compress_factor, latent_len)).astype(np.float32)
        mask = length_to_mask((wav_lengths + chunk - 1) // chunk)
        return x * mask, mask

    def infer(self, text: str, style: Style, total_step: int, speed: float, rng: np.random.Generator,
              lang: str = LANG) -> tuple[np.ndarray, float]:
        """조각 하나 → (wav float32 1차원, 예측 길이 초)."""
        ids, mask = self._text_ids(text, lang)
        dur, *_ = self.dp.run(None, {"text_ids": ids, "style_dp": style.dp, "text_mask": mask})
        dur = dur / speed
        emb, *_ = self.text_enc.run(None, {"text_ids": ids, "style_ttl": style.ttl, "text_mask": mask})
        xt, lmask = self._noisy_latent(dur, rng)
        total = np.array([total_step], dtype=np.float32)
        for step in range(total_step):
            xt, *_ = self.vector_est.run(None, {"noisy_latent": xt, "text_emb": emb, "style_ttl": style.ttl,
                                                "text_mask": mask, "latent_mask": lmask,
                                                "current_step": np.array([step], dtype=np.float32), "total_step": total})
        wav, *_ = self.vocoder.run(None, {"latent": xt})
        return wav[0], float(dur[0])

    def synth(self, text: str, style: Style, total_step: int, speed: float, silence_sec: float, max_chunk_len: int,
              rng: np.random.Generator, lang: str = LANG) -> tuple[np.ndarray, list[str]]:
        """문장 → (조각 사이 무음을 끼운 wav, 조각 목록). 원본 __call__ 과 같고 조각을 함께 돌려준다."""
        chunks = chunk_text(text, max_chunk_len)
        if not chunks:
            raise ValueError(f"합성할 글자가 없다: {text!r}")
        silence = np.zeros(int(silence_sec * self.sample_rate), dtype=np.float32)
        parts: list[np.ndarray] = []
        for k, c in enumerate(chunks):
            wav, dur = self.infer(c, style, total_step, speed, rng, lang)
            parts += ([silence] if k else []) + [wav[: int(self.sample_rate * dur)]]
        return np.concatenate(parts), chunks
