"""강제 정렬 — 합성 음성 ↔ 발음 텍스트 글자 시각 (MMS_FA + uroman).

Provenance
  source repo   : https://github.com/doroper98/osint_generator
  source paths  : script/tts/forced_align.py, script/tts/align.py (from_forced_alignment·align_path·read·write)
  source commit : 131db0097a547a3fd0742488540eedc229017073 (script/tts/* identical to 7d85942e536e0eb0796292aa628540d8319cf9af)
  changed       :
    - 설정: orchestrator.config/rules 대신 voice_config.AlignmentConfig(config/voice-reference.json alignment_reference,
      min_score 0.62 = 원 rules tts_rules.forced_align.min_score).
    - 가중치 폴더 = <models_dir>/mms_fa (원 assets/tts/mms_fa). require_assets() 가 sha1 에 더해 크기도 대조하고,
      torch/torchaudio/uroman import 실패와 가중치 없음을 "어느 호스트를 허용 목록에 넣고 어떤 명령을 돌릴지" 로 알린다.
    - engine()/romanize()/align_sentence() 가 models_dir 를 인자로 받는다. 수식·순서는 같다:
      어절 = 공백 분리, 어절 구간 = MMS 토큰 스팬 첫 start ~ 마지막 end × ratio, 어절 안 글자 = 글자별 uroman 길이 비례,
      공백 = 앞 어절 끝 길이 0, 어절 점수 = 토큰 점수 평균, 문장 점수 = 어절 점수 평균 < min_score 이면 오류.
    - align.py 의 alignment_sources 등재 검사는 출처 하나("mms_forced_alignment")만 허용하는 상수 검사로 바꿨다.
    - .align.json 에 audio_sha256·model_sha1·min_score 를 더 기록한다(재사용 판정용; narrate.py).
    - realign_project()/main()(옛 음성 재정렬 CLI)은 옮기지 않았다.
  license note  : MMS_FA 가중치는 원 저장소 문서에 CC-BY-NC 4.0 으로 기록되어 있다(README 참조).
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.narration.voice_config import AlignmentConfig, mms_dir, sha1_file

SOURCE = "mms_forced_alignment"
FETCH_CMD = "python pipeline/narration/fetch_assets.py --mms"
PIP_CMD = "pip install -r pipeline/narration/requirements.txt"


class ForcedAlignError(ValueError):
    """강제 정렬 실패 — 무음·빈 로마자·신뢰도 미달·가중치 없음. 비율 추정으로 대신하지 않는다."""


class AlignmentError(ValueError):
    pass


@dataclass(frozen=True)
class CharSpan:
    char: str
    start: float
    end: float
    score: float


def model_path(mdir: Path) -> Path:
    return mms_dir(mdir) / "model.pt"


def require_assets(cfg: AlignmentConfig, mdir: Path) -> str:
    """가중치가 없거나 크기·sha1 이 다르면 받는 명령·호스트를 담은 오류. → sha1."""
    p = model_path(mdir)
    want = cfg.assets["model.pt"]
    if not p.is_file():
        raise ForcedAlignError(
            f"강제 정렬 가중치 없음: {p}\n  받기: {FETCH_CMD} --models-dir {mdir}\n"
            f"  필요한 네트워크 허용: {cfg.host} ({cfg.url})\n"
            "  정렬 없이 확인만 하려면 narrate.py --skip-alignment (degraded: final_fall 미적용·비례 자막)")
    size = p.stat().st_size
    if size != cfg.model_size:
        raise ForcedAlignError(f"강제 정렬 가중치 크기 {size} ≠ {cfg.model_size}: {p} — 지우고 {FETCH_CMD}")
    got = sha1_file(p)
    if got != want:
        raise ForcedAlignError(f"강제 정렬 가중치 sha1 {got} ≠ {want}: {p} — 지우고 {FETCH_CMD}")
    return got


def require_runtime() -> dict:
    """torch·torchaudio·uroman 버전. 없으면 설치 명령과 호스트를 담은 오류."""
    try:
        import torch  # noqa: PLC0415
        import torchaudio  # noqa: PLC0415
        import uroman  # noqa: PLC0415, F401
        from torchaudio.pipelines import MMS_FA  # noqa: PLC0415, F401
    except ImportError as ex:
        raise ForcedAlignError(
            f"강제 정렬 런타임 없음({ex}). 설치: {PIP_CMD}\n"
            "  필요한 네트워크 허용: pypi.org, files.pythonhosted.org (torch==2.8.0·torchaudio==2.8.0·uroman; "
            "CPU 전용 휠은 download.pytorch.org)") from ex
    from importlib.metadata import version  # noqa: PLC0415

    return {"torch": torch.__version__, "torchaudio": torchaudio.__version__, "uroman": version("uroman")}


_ENGINE: dict = {}


def engine(cfg: AlignmentConfig, mdir: str):  # noqa: ANN201 — (model, tokenizer, aligner, labels, sample_rate, uroman)
    """프로세스당 한 번 — 가중치 대조 → 로컬 파일로 모델 생성(torch.hub 캐시 경로 = mms_dir, 파일이 있으면 받지 않는다).
    (원본 = @lru_cache(maxsize=1); 설정 dataclass 가 dict 를 담아 해시가 안 되므로 (폴더, 스레드) 키 사전으로 같은 효과.)"""
    key = (str(mdir), cfg.threads)
    if key in _ENGINE:
        return _ENGINE[key]
    require_assets(cfg, Path(mdir))
    require_runtime()
    import torch  # noqa: PLC0415
    import uroman  # noqa: PLC0415
    from torchaudio.pipelines import MMS_FA  # noqa: PLC0415

    torch.set_num_threads(cfg.threads)
    model = MMS_FA.get_model(dl_kwargs={"model_dir": str(mms_dir(Path(mdir))), "progress": False})
    _ENGINE.clear()
    _ENGINE[key] = (model, MMS_FA.get_tokenizer(), MMS_FA.get_aligner(), frozenset(MMS_FA.get_labels(star=None)),
                    MMS_FA.sample_rate, uroman.Uroman())
    return _ENGINE[key]


def decode(audio: Path, sr: int) -> np.ndarray:
    """mp3·wav → 단일 채널 float32 sr Hz(ffmpeg)."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768


def romanize(s: str, cfg: AlignmentConfig, mdir: str) -> str:
    _, _, _, labels, _, ur = engine(cfg, mdir)
    return "".join(c for c in ur.romanize_string(s).lower() if c in labels)


def align_sentence(audio: Path, pron_text: str, cfg: AlignmentConfig, mdir: Path) -> list[CharSpan]:
    """발음 텍스트 글자마다 (시작, 끝, 점수). 시각은 음성 파일 처음 기준(초). 실패 = ForcedAlignError."""
    import torch  # noqa: PLC0415

    md = str(mdir)
    model, tok, aligner, _, sr, _ = engine(cfg, md)
    words = pron_text.split()
    if not words:
        raise ForcedAlignError("발음 텍스트가 비었다")
    roms = [romanize(w, cfg, md) for w in words]
    empty = [w for w, r in zip(words, roms) if not r]
    if empty:
        raise ForcedAlignError(f"로마자로 바꿀 수 없는 어절 {empty}: {pron_text!r}")
    x = decode(audio, sr)
    if x.size == 0 or float(np.abs(x).max()) < 1e-3:
        raise ForcedAlignError(f"무음·길이 0 음성: {audio}")
    wav = torch.from_numpy(x).unsqueeze(0)
    with torch.inference_mode():
        emission, _ = model(wav)
    try:
        spans = aligner(emission[0], tok(roms))
    except Exception as ex:  # noqa: BLE001 — 토큰이 프레임보다 많은 경우 등
        raise ForcedAlignError(f"정렬 실패({type(ex).__name__}: {ex}): {audio}") from ex
    ratio = wav.size(1) / emission.size(1) / sr
    min_score = cfg.min_score
    out: list[CharSpan] = []
    pos = 0
    for wi, (w, sp) in enumerate(zip(words, spans)):
        i = pron_text.index(w, pos)
        out += [CharSpan(c, out[-1].end if out else 0.0, out[-1].end if out else 0.0, 1.0) for c in pron_text[pos:i]]   # 공백
        t0, t1 = sp[0].start * ratio, sp[-1].end * ratio
        score = float(sum(t.score for t in sp) / len(sp))
        weights = [max(len(romanize(c, cfg, md)), 0) for c in w]
        total = sum(weights) or len(w)
        acc = 0
        for c, wt in zip(w, weights if sum(weights) else [1] * len(w)):
            a = t0 + (t1 - t0) * acc / total
            acc += wt
            out.append(CharSpan(c, a, t0 + (t1 - t0) * acc / total, score))
        pos = i + len(w)
        if wi == len(words) - 1:
            out += [CharSpan(c, out[-1].end, out[-1].end, 1.0) for c in pron_text[pos:]]
    mean = sentence_score(out, pron_text)
    if mean < min_score:
        raise ForcedAlignError(f"정렬 신뢰도 문장 평균 {mean:.3f} < min_score {min_score} — 원고·음성 불일치 의심: {audio}")
    return out


def word_starts(spans: list[CharSpan], pron_text: str) -> list[float]:
    """어절 첫 글자 시작 시각."""
    starts, pos = [], 0
    for w in pron_text.split():
        i = pron_text.index(w, pos)
        starts.append(spans[i].start)
        pos = i + len(w)
    return starts


def sentence_score(spans: list[CharSpan], pron_text: str) -> float:
    """문장 점수 = 어절 점수(어절 첫 글자에 실린 값) 평균."""
    scores, pos = [], 0
    for w in pron_text.split():
        i = pron_text.index(w, pos)
        scores.append(spans[i].score)
        pos = i + len(w)
    return float(sum(scores) / len(scores))


# ---- align.py -------------------------------------------------------------------------------------------------------

def from_forced_alignment(text: str, spans: list) -> dict:
    """강제 정렬 글자 구간(발음 텍스트 글자마다 하나) → 공통 형식. 글자 수가 다르면 오류(조용히 맞추지 않는다)."""
    if len(spans) != len(text) or any(sp.char != c for sp, c in zip(spans, text)):
        raise AlignmentError(f"강제 정렬 글자 {len(spans)}개 ↔ 발음 텍스트 {len(text)}글자 불일치: {text!r}")
    return dict(alignment_source=SOURCE, characters=list(text),
                character_start_times_seconds=[round(sp.start, 4) for sp in spans],
                character_end_times_seconds=[round(sp.end, 4) for sp in spans])


def align_file(audio: Path, pron_text: str, cfg: AlignmentConfig, mdir: Path) -> dict:
    """정렬 → `.align.json` 공통 형식 + score_mean·elapsed_ms. 실패 = ForcedAlignError."""
    t = time.perf_counter()
    spans = align_sentence(audio, pron_text, cfg, mdir)
    al = from_forced_alignment(pron_text, spans)
    al["score_mean"] = round(sentence_score(spans, pron_text), 4)
    al["elapsed_ms"] = round((time.perf_counter() - t) * 1000)
    return al


def align_path(mp3: Path) -> Path:
    return Path(str(mp3) + ".align.json")


def write(mp3: Path, al: dict) -> None:
    if al.get("alignment_source") != SOURCE:
        raise AlignmentError(f"alignment_source {al.get('alignment_source')!r} ≠ {SOURCE}")
    align_path(mp3).write_text(json.dumps(al, ensure_ascii=False), encoding="utf-8")


def read(mp3: Path) -> dict | None:
    p = align_path(mp3)
    if not p.exists():
        return None
    al = json.loads(p.read_text(encoding="utf-8"))
    if al.get("alignment_source") != SOURCE:
        raise AlignmentError(f"{p.name}: alignment_source {al.get('alignment_source')!r} ≠ {SOURCE}")
    if len(al["characters"]) != len(al["character_start_times_seconds"]):
        raise AlignmentError(f"{p.name}: characters 와 시각 길이가 다르다")
    return al
