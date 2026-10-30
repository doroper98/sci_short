"""표준 음성 설정 로더 — config/voice-reference.json → dataclass.

Provenance
  source repo   : https://github.com/doroper98/osint_generator
  source commit : 131db0097a547a3fd0742488540eedc229017073 (script/tts/* 는 7d85942e536e0eb0796292aa628540d8319cf9af 와 동일)
  source paths  : config.yaml `tts.supertonic`·`tts.alignment`, rules/video_rules.yaml `tts_rules.forced_align`·
                  `tts_rules.prosody.final_fall`, schemas/rules_models.py `FinalFallRules`·`OctaveCleanRules`
  changed       : pydantic 모델 → frozen dataclass(같은 범위 검사를 __post_init__ 에서). 값은 YAML 대신
                  이 저장소의 config/voice-reference.json 하나에서만 읽는다(이 파일은 바꾸지 않는다).
                  forced_align.min_score(0.62)는 voice-reference.json 에 없어 원 rules 값을 상수로 옮겼다.
                  자산 폴더는 원 `assets/tts/...` 대신 `<models_dir>/supertonic-3`·`<models_dir>/mms_fa`.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
VOICE_REFERENCE = REPO / "config" / "voice-reference.json"
SOURCE_COMMIT = "131db0097a547a3fd0742488540eedc229017073"

# rules/video_rules.yaml tts_rules.forced_align (source commit 위) — 근거: 맞는 원고 최저 0.679 · 틀린 원고 최고 0.569 → 0.62
FORCED_ALIGN_MIN_SCORE = 0.62
# MMS_FA 가중치 크기(원 config.yaml 주석 "1,262,047,414 B")
MMS_MODEL_SIZE = 1262047414
SUPERTONIC_SUBDIR = "supertonic-3"
MMS_SUBDIR = "mms_fa"


class VoiceConfigError(ValueError):
    pass


def _req(cond: bool, msg: str) -> None:
    if not cond:
        raise VoiceConfigError(msg)


def _typed(d: dict, key: str, typ: type | tuple, where: str):
    _req(key in d, f"{where}.{key} 없음")
    v = d[key]
    # bool 은 int 의 하위형이라 따로 막는다
    _req(isinstance(v, typ) and not (isinstance(v, bool) and typ is not bool), f"{where}.{key} 형식 {type(v).__name__} ≠ {typ}")
    return v


@dataclass(frozen=True)
class SupertonicConfig:
    repo: str
    revision: str
    voice_style: str
    speed: float
    total_step: int
    silence_sec: float
    max_chunk_len: int
    seed_salt: str
    assets: dict = field(default_factory=dict)   # 상대 경로 → sha1

    def __post_init__(self) -> None:
        # cache_salt·seed 가 f"{speed}" 로 문자열화된다 — 원 설정과 같은 형(float/int)이어야 같은 시드가 나온다.
        _req(isinstance(self.speed, float), "speed 는 float 이어야 한다(예: 0.95)")
        _req(isinstance(self.total_step, int) and not isinstance(self.total_step, bool), "total_step 은 int")
        _req(isinstance(self.silence_sec, float), "silence_sec 는 float")
        _req(isinstance(self.max_chunk_len, int), "max_chunk_len 은 int")
        _req(self.speed > 0 and self.total_step >= 1 and self.max_chunk_len >= 1, "speed/total_step/max_chunk_len 범위")
        _req(len(self.assets) == 8, f"assets 8개여야 한다(지금 {len(self.assets)})")


@dataclass(frozen=True)
class OctaveCleanRules:
    enabled: bool
    ratio_hi: float
    ratio_lo: float
    gate_db: float
    rms_ms: float
    record_frames: int

    def __post_init__(self) -> None:   # schemas/rules_models.py OctaveCleanRules 의 Field 제약
        _req(self.ratio_hi > 1, "octave_clean.ratio_hi > 1")
        _req(0 < self.ratio_lo < 1, "0 < octave_clean.ratio_lo < 1")
        _req(self.gate_db < 0, "octave_clean.gate_db < 0")
        _req(self.rms_ms > 0, "octave_clean.rms_ms > 0")
        _req(self.record_frames >= 1, "octave_clean.record_frames >= 1")


@dataclass(frozen=True)
class FinalFallRules:
    enabled: bool
    suffix: str
    span_chars: int
    semitones: float
    pre_sec: float
    crossfade_sec: float
    f0_floor_hz: float
    f0_ceil_hz: float
    frame_ms: float
    octave_clean: OctaveCleanRules

    def __post_init__(self) -> None:   # schemas/rules_models.py FinalFallRules 의 Field 제약
        _req(len(self.suffix) >= 1, "final_fall.suffix 비어 있음")
        _req(self.span_chars >= 1, "final_fall.span_chars >= 1")
        _req(self.semitones > 0, "final_fall.semitones > 0")
        _req(self.pre_sec >= 0, "final_fall.pre_sec >= 0")
        _req(self.crossfade_sec > 0, "final_fall.crossfade_sec > 0")
        _req(self.f0_floor_hz > 0 and self.f0_ceil_hz > 0 and self.frame_ms > 0, "final_fall f0/frame > 0")

    def to_dict(self) -> dict:
        d = dict(self.__dict__)
        d["octave_clean"] = dict(self.octave_clean.__dict__)
        return d


@dataclass(frozen=True)
class AlignmentConfig:
    engine: str
    url: str
    assets: dict            # {"model.pt": sha1}
    threads: int
    min_score: float = FORCED_ALIGN_MIN_SCORE
    model_size: int = MMS_MODEL_SIZE

    @property
    def host(self) -> str:
        from urllib.parse import urlparse  # noqa: PLC0415
        return urlparse(self.url).hostname or self.url


@dataclass(frozen=True)
class VoiceConfig:
    supertonic: SupertonicConfig
    final_fall: FinalFallRules
    alignment: AlignmentConfig
    source_path: str
    source_sha256: str


def load_voice_config(path: Path | None = None) -> VoiceConfig:
    p = Path(path) if path else VOICE_REFERENCE
    raw = p.read_bytes()
    d = json.loads(raw.decode("utf-8"))
    _req(d.get("backend") == "supertonic", f"backend {d.get('backend')!r} ≠ supertonic")
    _req(d.get("language") == "ko", "language ≠ ko")
    s = d["synthesis"]
    st = SupertonicConfig(
        repo=_typed(s, "repo", str, "synthesis"), revision=_typed(s, "revision", str, "synthesis"),
        voice_style=_typed(s, "voice_style", str, "synthesis"), speed=_typed(s, "speed", float, "synthesis"),
        total_step=_typed(s, "total_step", int, "synthesis"), silence_sec=_typed(s, "silence_sec", float, "synthesis"),
        max_chunk_len=_typed(s, "max_chunk_len", int, "synthesis"), seed_salt=_typed(s, "seed_salt", str, "synthesis"),
        assets=dict(_typed(s, "assets", dict, "synthesis")))
    ff = d["prosody"]["final_fall"]
    oc = ff["octave_clean"]
    rules = FinalFallRules(
        enabled=bool(ff["enabled"]), suffix=ff["suffix"], span_chars=int(ff["span_chars"]), semitones=float(ff["semitones"]),
        pre_sec=float(ff["pre_sec"]), crossfade_sec=float(ff["crossfade_sec"]), f0_floor_hz=float(ff["f0_floor_hz"]),
        f0_ceil_hz=float(ff["f0_ceil_hz"]), frame_ms=float(ff["frame_ms"]),
        octave_clean=OctaveCleanRules(enabled=bool(oc["enabled"]), ratio_hi=float(oc["ratio_hi"]), ratio_lo=float(oc["ratio_lo"]),
                                      gate_db=float(oc["gate_db"]), rms_ms=float(oc["rms_ms"]),
                                      record_frames=int(oc["record_frames"])))
    a = d["alignment_reference"]
    _req(a.get("engine") == "mms_fa", "alignment_reference.engine ≠ mms_fa")
    al = AlignmentConfig(engine=a["engine"], url=a["url"], assets=dict(a["assets"]), threads=int(a.get("threads", 4)))
    _req(set(al.assets) == {"model.pt"}, "alignment_reference.assets 는 model.pt 하나")
    return VoiceConfig(st, rules, al, str(p), hashlib.sha256(raw).hexdigest())


def models_dir(arg: str | Path | None = None) -> Path:
    """--models-dir > env SCISHORT_MODELS > <repo>/models."""
    if arg:
        return Path(arg).expanduser().resolve()
    env = os.environ.get("SCISHORT_MODELS")
    return Path(env).expanduser().resolve() if env else REPO / "models"


def supertonic_dir(mdir: Path) -> Path:
    return Path(mdir) / SUPERTONIC_SUBDIR


def mms_dir(mdir: Path) -> Path:
    return Path(mdir) / MMS_SUBDIR


def sha1_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha1()
    with Path(path).open("rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()
