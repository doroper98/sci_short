"""완성된 쇼츠를 유튜브 채널에 **비공개(private)** 로 올리는 도구.

공개 전환은 사용자가 YouTube Studio 에서 직접 한다. 이 도구는 어떤 설정으로도 public·unlisted 로 올리지 않는다.
바꿀 수 있는 것은 영상을 공개 → 비공개로 돌리는 것 하나뿐이다(set_private — 다시 올린 편의 옛 판 2026-11-12,
48시간 점검에서 조회수 기준 미만인 판 2026-11-13). 삭제는 없다.

사용법
    python -m publish.youtube finals/<NN>-<slug> --dry-run   # 입력·메타데이터·영상 규격 검증만 (비밀값 불필요)
    python -m publish.youtube finals/<NN>-<slug>             # 실제 업로드 (항상 비공개)
    python -m publish.youtube --all                           # finals/ 아래 미업로드 에피소드 전부
    python -m publish.youtube --whoami                        # 토큰이 가리키는 채널 이름·ID 확인
    python -m publish.youtube --list                          # finals 상태표
    python -m publish.youtube finals/<ep> --mark-uploaded <video id>   # 이미 손으로 올린 편을 기록해 건너뛰게 함
    python -m publish.youtube --privatize-pending [--dry-run]           # 다시 올린 편의 옛 판을 비공개로(공개 → 비공개 한 방향만)
    python -m publish.youtube --sweep [--dry-run]                       # 48시간 점검: 공개 48시간 뒤 조회수 50 미만 → 비공개 + 다시 올리기 대상

입력은 최종본 보관함 규약(finals/README.md)을 그대로 쓴다.
    <slug>.mp4           폴더 안의 유일한 .mp4 (pipeline/catalog.py 와 같은 규칙)
    upload.md            제목 / 설명 / 태그 (skills/science-short/SKILL.md 7단계, 2026-11-03 사용자 결정 형식)
    thumbnail.jpg        있으면 썸네일로 올림. 없으면 poster.jpg(0초 프레임). 채널이 맞춤 썸네일을 못 쓰면 경고로 남김
    <slug>.srt           기본 올리지 않음(화면에 자막이 새겨져 있음, docs/YOUTUBE_UPLOAD.md). --caption 으로 올릴 수 있음
    meta.json            (선택) 편별 덧씌움: tags, made_for_kids, contains_synthetic_media, category_id, caption, thumbnail, video
    youtube_upload.json  업로드 기록(도구가 씀). 같은 영상(md5)은 다시 올리지 않는다.

비밀값은 환경 변수 YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_TOKEN 만 읽는다(--env-file 로 .env 를 읽을 수 있다).
값은 로그·기록·저장소에 쓰지 않는다. 표준 오류에 진행 메시지, 표준 출력 마지막 줄에 결과 JSON 을 낸다.
표준 라이브러리만 쓴다(설치 없이 GitHub Actions·로컬·클라우드 세션 어디서나 돈다).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

REPO = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = REPO / "config" / "youtube.json"
DEFAULT_FINALS = REPO / "finals"
DEFAULT_DAILY = REPO / "config" / "daily.json"
KST = dt.timezone(dt.timedelta(hours=9), "KST")   # 사용자 기준 시각(아침 업로드·다시 올리기 시작일)
RECORD_NAME = "youtube_upload.json"
UPLOAD_MD_NAME = "upload.md"
META_NAME = "meta.json"
EPISODE_DIR_RE = re.compile(r"^(\d{2,})-(.+)$")       # finals/<번호>-<slug>/ (legacy/ 등은 제외)
SECTION_RE = re.compile(r"^#{0,3}\s*(제목|설명|태그)\s*:?\s*$")
TAG_LINE_RE = re.compile(r"^-\s*태그\s*:\s*(.+)$")
SECRET_ENV: tuple[str, str, str] = ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
CAPTIONS_URL = "https://www.googleapis.com/upload/youtube/v3/captions"
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
THUMBNAILS_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
WATCH_URL_PREFIX = "https://youtu.be/"
STUDIO_URL = "https://studio.youtube.com/video/{video_id}/edit"

TITLE_MAX_CHARS = 100          # API 한도(문자)
DESCRIPTION_MAX_BYTES = 5000   # API 한도(UTF-8 바이트) — 한글은 한 글자 3바이트
TAGS_MAX_CHARS = 500
FORBIDDEN_CHARS: tuple[str, str] = ("<", ">")
CHUNK_UNIT = 256 * 1024        # 재개 가능 업로드 조각은 256 KiB 배수(API 규약)
MB = 1024 * 1024
RETRY_STATUS: frozenset[int] = frozenset({500, 502, 503, 504})
META_KEYS: frozenset[str] = frozenset({"tags", "made_for_kids", "contains_synthetic_media", "category_id", "caption", "thumbnail", "video",
                                       "auto_publish", "instagram", "tiktok"})   # auto_publish·instagram·tiktok: 자동 대상 지정(publish/instagram.py·tiktok.py 와 공용)
TOKEN_EXPIRED_HINT = ("리프레시 토큰이 만료되거나 철회되었습니다(invalid_grant). OAuth 앱이 '테스트 중'이면 7일마다 만료됩니다. "
                      "앱을 프로덕션으로 게시한 뒤 `python -m publish.oauth` 로 새 토큰을 받아 YT_REFRESH_TOKEN 을 바꾸십시오(docs/YOUTUBE_AUTO_UPLOAD.md).")


class UploadError(RuntimeError):
    """업로드를 멈춰야 하는 오류. 메시지를 그대로 사용자에게 보인다."""


class TransportError(RuntimeError):
    """네트워크 수준 실패(재시도 대상)."""


class ScopeError(UploadError):
    """HTTP 403 — 토큰에 이 호출의 권한(범위)이 없다. 옛 판 비공개 전환은 youtube.force-ssl 이 있어야 한다."""


class PrivatizeRefused(UploadError):
    """옛 판을 비공개로 돌리지 않기로 한 영구적인 거절(다른 채널 영상, 조회수가 기준 이상, 보호 목록). 다시 시도하지 않는다."""


# ───────────────────────────── 전송(HTTP) ─────────────────────────────

@dataclass
class Response:
    status: int
    headers: dict[str, str]
    body: bytes

    def json(self) -> dict[str, Any]:
        try:
            v = json.loads(self.body.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            return {}
        return v if isinstance(v, dict) else {}


Transport = Callable[[str, str, dict[str, str], "bytes | None"], Response]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """3xx 를 따라가지 않는다 — 재개 가능 업로드의 308 은 리디렉션이 아니라 '여기까지 받았다'는 답이다."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        return None


def urllib_transport(timeout_sec: float) -> Transport:
    opener = urllib.request.build_opener(_NoRedirect)

    def send(method: str, url: str, headers: dict[str, str], data: bytes | None = None) -> Response:
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with opener.open(req, timeout=timeout_sec) as r:
                return Response(r.status, {k.lower(): v for k, v in r.headers.items()}, r.read())
        except urllib.error.HTTPError as e:
            return Response(e.code, {k.lower(): v for k, v in e.headers.items()}, e.read())
        except OSError as e:   # URLError·timeout·연결 끊김
            raise TransportError(f"{type(e).__name__}: {e}") from e

    return send


# ───────────────────────────── 설정 ─────────────────────────────

@dataclass
class Config:
    privacy_status: str = "private"
    category_id: str = "27"
    default_language: str = "ko"
    caption_language: str = "ko"
    caption_name: str = "한국어"
    contains_synthetic_media: bool = True
    made_for_kids: bool | None = None
    channel_id: str | None = None
    tags: list[str] = field(default_factory=list)
    upload_captions: bool = False      # 2026-11-03 사용자 결정: 자막은 화면에 새겨져 있어 SRT 를 올리지 않는 것이 기본
    upload_thumbnail: bool = True      # thumbnail.jpg(없으면 poster.jpg) 를 thumbnails.set 으로 시도. 실패는 경고
    thumbnail_max_bytes: int = 2 * 1024 * 1024
    shorts_max_sec: float = 180
    chunk_mb: int = 8
    timeout_sec: float = 120
    tries: int = 5
    auto_from_number: int = 22         # push 자동 실행(--auto)은 이 번호 이상 새 편만. 01~21 은 손으로 올린 편이 섞여 있음
    processing_wait_sec: float = 1200  # 쇼츠 맞춤 썸네일은 처리 완료 뒤에만 적용된다 — 처리 완료를 이만큼 기다린다
    processing_poll_sec: float = 15
    schema_version: int = 1


def load_config(path: Path = DEFAULT_CONFIG) -> Config:
    """config/youtube.json → Config. 모르는 키는 오류('_' 로 시작하는 설명 키는 무시)."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise UploadError(f"설정 파일 없음: {path}") from None
    except ValueError as e:
        raise UploadError(f"설정 파일 JSON 오류: {path}: {e}") from None
    data = {k: v for k, v in raw.items() if not k.startswith("_")}
    unknown = set(data) - set(Config.__dataclass_fields__)
    if unknown:
        raise UploadError(f"설정에 모르는 키: {', '.join(sorted(unknown))} ({path})")
    cfg = Config(**data)
    if cfg.privacy_status != "private":
        raise UploadError(f"privacy_status 는 private 만 허용합니다(현재 {cfg.privacy_status!r}). 공개 전환은 YouTube Studio 에서 직접 합니다")
    if cfg.made_for_kids is not None and not isinstance(cfg.made_for_kids, bool):
        raise UploadError("made_for_kids 는 true/false/null 만 허용합니다")
    if cfg.chunk_mb < 1 or cfg.tries < 1:
        raise UploadError("chunk_mb·tries 는 1 이상이어야 합니다")
    return cfg


# ───────────────────────────── 입력 ─────────────────────────────

@dataclass
class Episode:
    dir: Path
    number: int | None
    slug: str
    video: Path
    upload_md: Path
    srt: Path | None
    thumbnail: Path | None
    meta: dict[str, Any]


def parse_dir_name(dir_: Path) -> tuple[int | None, str]:
    m = EPISODE_DIR_RE.match(dir_.name)
    return (int(m.group(1)), m.group(2)) if m else (None, dir_.name)


def load_meta(dir_: Path) -> dict[str, Any]:
    p = dir_ / META_NAME
    if not p.is_file():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except ValueError as e:
        raise UploadError(f"{p}: JSON 오류: {e}") from None
    if not isinstance(raw, dict):
        raise UploadError(f"{p}: 객체({{...}})여야 합니다")
    meta = {k: v for k, v in raw.items() if not k.startswith("_")}
    unknown = set(meta) - META_KEYS
    if unknown:
        raise UploadError(f"{p}: 모르는 키 {', '.join(sorted(unknown))} — 허용: {', '.join(sorted(META_KEYS))}")
    for key in ("made_for_kids", "contains_synthetic_media", "caption", "thumbnail", "auto_publish", "instagram"):
        if key in meta and not isinstance(meta[key], bool):
            raise UploadError(f"{p}: {key} 는 true/false 여야 합니다")
    if "tags" in meta and not (isinstance(meta["tags"], list) and all(isinstance(t, str) for t in meta["tags"])):
        raise UploadError(f"{p}: tags 는 문자열 배열이어야 합니다")
    return meta


def _single(dir_: Path, pattern: str) -> Path | None:
    files = sorted(p for p in dir_.glob(pattern) if p.is_file())
    return files[0] if len(files) == 1 else None


def load_episode(dir_: Path, *, caption: bool = False, thumbnail: bool = True) -> Episode:
    """finals/<NN>-<slug>/ 를 읽는다. 영상은 폴더 안의 유일한 .mp4(meta.json 의 video 로 지정 가능)."""
    if not dir_.is_dir():
        raise UploadError(f"에피소드 폴더 없음: {dir_}")
    number, slug = parse_dir_name(dir_)
    meta = load_meta(dir_)
    if "video" in meta:
        video = dir_ / str(meta["video"])
    else:
        mp4s = sorted(p for p in dir_.glob("*.mp4") if p.is_file())
        if len(mp4s) != 1:
            raise UploadError(f"{dir_}: .mp4 가 {len(mp4s)}개입니다 — 폴더에 최종 영상 하나만 두거나 meta.json 의 video 로 지정")
        video = mp4s[0]
    if not video.is_file():
        raise UploadError(f"영상 파일 없음: {video}")
    upload_md = dir_ / UPLOAD_MD_NAME
    if not upload_md.is_file():
        raise UploadError(f"{UPLOAD_MD_NAME} 없음: {upload_md} (제목 / 설명 / 태그 — skills/science-short/SKILL.md 7단계)")
    srt: Path | None = None
    if meta.get("caption", caption):
        srt = (video.with_suffix(".srt") if video.with_suffix(".srt").is_file() else _single(dir_, "*.srt"))
        if srt is None:
            raise UploadError(f"{dir_}: 자막을 올리라고 했는데 .srt 가 없습니다")
    thumb: Path | None = None
    if meta.get("thumbnail", thumbnail):
        for name in ("thumbnail.jpg", "thumbnail.png", "poster.jpg", "poster.png"):
            if (dir_ / name).is_file():
                thumb = dir_ / name
                break
    return Episode(dir=dir_, number=number, slug=slug, video=video, upload_md=upload_md, srt=srt, thumbnail=thumb, meta=meta)


def parse_upload_md(text: str) -> dict[str, Any]:
    """upload.md → {'title', 'description', 'tags'}.

    두 형식을 모두 읽는다(2026-11-03 사용자 결정 형식, 01~08 과 09~ 편의 차이).
      제목 / 설명 / 태그 머리말 다음의 ```text 블록, 또는 블록 없이 다음 머리말 전까지의 줄.
      태그는 '- 태그: a, b, c' 한 줄도 허용한다.
    """
    lines = text.splitlines()
    sections: dict[str, str] = {}
    tag_line: str | None = None
    i = 0
    while i < len(lines):
        ln = lines[i]
        m_tag = TAG_LINE_RE.match(ln.strip())
        if m_tag:
            tag_line = m_tag.group(1).strip()
            i += 1
            continue
        m = SECTION_RE.match(ln.strip())
        if not m:
            i += 1
            continue
        key = m.group(1)
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
        body: list[str] = []
        if i < len(lines) and lines[i].strip().startswith("```"):
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1   # 닫는 ```
        else:
            while i < len(lines):
                s = lines[i].strip()
                if SECTION_RE.match(s) or TAG_LINE_RE.match(s) or s.startswith("- ") or s.startswith("#"):
                    break
                body.append(lines[i])
                i += 1
        if key not in sections:   # 같은 머리말이 두 번 나오면 처음 것
            sections[key] = "\n".join(body).strip("\n")
    title = sections.get("제목", "").strip()
    if not title:
        raise UploadError(f"{UPLOAD_MD_NAME}: '제목' 블록이 없거나 비어 있습니다")
    if "\n" in title:
        raise UploadError(f"{UPLOAD_MD_NAME}: 제목은 한 줄이어야 합니다")
    description = sections.get("설명", "").strip("\n")
    if not description.strip():
        raise UploadError(f"{UPLOAD_MD_NAME}: '설명' 블록이 없거나 비어 있습니다")
    raw_tags = sections.get("태그") or tag_line or ""
    tags: list[str] = []
    for tg in raw_tags.replace("\n", ",").split(","):
        tg = tg.strip()
        if tg and tg not in tags:
            tags.append(tg)
    return {"title": title, "description": description, "tags": tags}


# ───────────────────────────── 메타데이터 ─────────────────────────────

@dataclass
class Metadata:
    title: str
    description: str
    tags: list[str]
    category_id: str
    default_language: str
    contains_synthetic_media: bool
    made_for_kids: bool
    privacy_status: str = "private"

    def body(self) -> dict[str, Any]:
        """videos.insert 요청 본문. privacyStatus 는 어떤 경로로도 private 이외가 될 수 없다."""
        return {
            "snippet": {"title": self.title, "description": self.description, "tags": self.tags,
                        "categoryId": self.category_id, "defaultLanguage": self.default_language,
                        "defaultAudioLanguage": self.default_language},
            "status": {"privacyStatus": "private", "selfDeclaredMadeForKids": self.made_for_kids,
                       "containsSyntheticMedia": self.contains_synthetic_media},
        }


def _nbytes(s: str) -> int:
    return len(s.encode("utf-8"))


def build_metadata(ep: Episode, cfg: Config, *, synthetic: bool | None = None,
                   made_for_kids: bool | None = None) -> Metadata:
    """upload.md 의 제목·설명·태그에 설정 < meta.json < 명령행 순서로 덧씌운다."""
    info = parse_upload_md(ep.upload_md.read_text(encoding="utf-8"))
    syn = cfg.contains_synthetic_media
    if "contains_synthetic_media" in ep.meta:
        syn = bool(ep.meta["contains_synthetic_media"])
    if synthetic is not None:
        syn = synthetic
    kids = cfg.made_for_kids
    if "made_for_kids" in ep.meta:
        kids = bool(ep.meta["made_for_kids"])
    if made_for_kids is not None:
        kids = made_for_kids
    if kids is None:
        raise UploadError("made_for_kids(아동용 자가 선언)가 정해지지 않았습니다 — config/youtube.json 의 made_for_kids 를 true/false 로 "
                          "정하거나 meta.json·--made-for-kids 로 지정하십시오. 설명은 docs/YOUTUBE_UPLOAD.md '아동용 여부'")
    tags: list[str] = []
    for tg in [*info["tags"], *cfg.tags, *ep.meta.get("tags", [])]:
        tg = tg.strip()
        if tg and tg not in tags:
            tags.append(tg)
    return Metadata(title=info["title"], description=info["description"], tags=tags,
                    category_id=str(ep.meta.get("category_id", cfg.category_id)),
                    default_language=cfg.default_language, contains_synthetic_media=syn, made_for_kids=kids)


def validate_metadata(meta: Metadata) -> list[str]:
    """API 가 거부할 값을 업로드 전에 모두 찾는다. 빈 목록이면 통과."""
    errs: list[str] = []
    if len(meta.title) > TITLE_MAX_CHARS:
        errs.append(f"제목 {len(meta.title)}자 — 한도 {TITLE_MAX_CHARS}자")
    if _nbytes(meta.description) > DESCRIPTION_MAX_BYTES:
        errs.append(f"설명 {_nbytes(meta.description)}바이트(UTF-8) — 한도 {DESCRIPTION_MAX_BYTES}바이트(한글 약 1,600자)")
    if "·" in meta.title:                                  # 2026-11-08 사용자 규칙: "· 이거 절대 쓰지 마. | 이걸 쓰던지 다른걸 써."
        errs.append("제목에 가운뎃점(·) 금지 — 구분은 | 또는 쉼표로(사용자 규칙)")
    for name, val in (("제목", meta.title), ("설명", meta.description)):
        bad = [c for c in FORBIDDEN_CHARS if c in val]
        if bad:
            errs.append(f"{name}에 금지 문자 {''.join(bad)}")
    tag_len = sum(len(t) + (2 if " " in t else 0) for t in meta.tags) + max(len(meta.tags) - 1, 0)
    if tag_len > TAGS_MAX_CHARS:
        errs.append(f"태그 합계 {tag_len}자 — 한도 {TAGS_MAX_CHARS}자")
    if meta.privacy_status != "private":
        errs.append("privacy_status 가 private 이 아닙니다")
    return errs


# ───────────────────────────── 영상 규격 ─────────────────────────────

def probe_video(path: Path) -> dict[str, Any] | None:
    """ffprobe 로 해상도·길이·오디오 유무를 읽는다. ffprobe 가 없으면 None(검사 생략)."""
    exe = shutil.which("ffprobe")
    if not exe:
        return None
    r = subprocess.run([exe, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise UploadError(f"ffprobe 실패({path.name}): {r.stderr.strip()[:300]}")
    info = json.loads(r.stdout or "{}")
    streams = info.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    if v is None:
        raise UploadError(f"{path.name}: 영상 스트림이 없습니다")
    dur = float(info.get("format", {}).get("duration") or v.get("duration") or 0.0)
    return {"width": int(v.get("width", 0)), "height": int(v.get("height", 0)), "duration_sec": round(dur, 2),
            "has_audio": any(s.get("codec_type") == "audio" for s in streams), "video_codec": v.get("codec_name")}


def check_video(probe: dict[str, Any] | None, cfg: Config, *, not_shorts: bool = False) -> tuple[list[str], list[str]]:
    """(오류, 경고). 쇼츠 분류 조건(세로·정방형, 길이 한도)에 어긋나면 --not-shorts 없이는 오류."""
    errs: list[str] = []
    warns: list[str] = []
    if probe is None:
        warns.append("ffprobe 없음 — 길이·비율·오디오 검사를 생략했습니다")
        return errs, warns
    w, h, d = probe["width"], probe["height"], probe["duration_sec"]
    if not probe["has_audio"]:
        warns.append("오디오 스트림이 없습니다(내레이션 없는 영상?)")
    problems: list[str] = []
    if d > cfg.shorts_max_sec:
        problems.append(f"길이 {d:.1f}초 — 쇼츠 한도 {cfg.shorts_max_sec:g}초 초과")
    if w > h:
        problems.append(f"가로형 {w}×{h} — 쇼츠는 세로·정방형만 분류")
    for p in problems:
        if not_shorts:
            warns.append(p + " → 일반 영상으로 올립니다(--not-shorts)")
        else:
            errs.append(p + " → 쇼츠로 분류되지 않습니다. 일반 영상으로 올리려면 --not-shorts")
    if d and d < 5:
        warns.append(f"길이 {d:.1f}초 — 너무 짧습니다")
    return errs, warns


def md5_file(p: Path) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(MB), b""):
            h.update(block)
    return h.hexdigest()


# ───────────────────────────── 비밀값·API ─────────────────────────────

def load_env_file(path: Path, env: dict[str, str]) -> None:
    """KEY=VALUE 줄을 env 에 넣는다(이미 있는 키는 유지). 값은 어디에도 찍지 않는다."""
    if not path.is_file():
        raise UploadError(f"--env-file 없음: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in env:
            env[k] = v


def read_secrets(env: dict[str, str] | None = None) -> tuple[str, str, str]:
    env = dict(os.environ) if env is None else env
    missing = [k for k in SECRET_ENV if not env.get(k)]
    if missing:
        raise UploadError(f"환경 변수 없음: {', '.join(missing)} — GitHub Actions 비밀값, 클라우드 환경 설정, 또는 --env-file .env 로 주십시오")
    return env[SECRET_ENV[0]], env[SECRET_ENV[1]], env[SECRET_ENV[2]]


def _api_error(r: Response, what: str) -> UploadError:
    e = r.json().get("error", {})
    reasons = [x.get("reason", "") for x in e.get("errors", [])] if isinstance(e, dict) else []
    msg = e.get("message", "") if isinstance(e, dict) else str(e)
    hint = ""
    if {"quotaExceeded", "uploadLimitExceeded", "rateLimitExceeded"} & set(reasons):
        hint = " — 하루 할당량 소진. 태평양 시간 자정(한국 오후 4~5시) 이후 다시"
    elif r.status == 401:
        hint = " — 액세스 토큰 거부. 토큰 범위에 youtube.upload·youtube.readonly 가 있는지 확인"
    elif r.status == 403 and ("insufficientPermissions" in reasons or "scope" in msg.lower()):
        return ScopeError(f"{what} 실패 HTTP {r.status} {','.join(x for x in reasons if x)} {msg} — 토큰 범위 부족. "
                          "docs/YOUTUBE_AUTO_UPLOAD.md '권한'대로 다시 받으십시오")
    return UploadError(f"{what} 실패 HTTP {r.status} {','.join(x for x in reasons if x)} {msg}{hint}".strip())


def access_token(send: Transport, secrets: tuple[str, str, str]) -> str:
    cid, csec, rtok = secrets
    data = urllib.parse.urlencode({"client_id": cid, "client_secret": csec, "refresh_token": rtok,
                                   "grant_type": "refresh_token"}).encode("utf-8")
    r = send("POST", TOKEN_URL, {"Content-Type": "application/x-www-form-urlencoded"}, data)
    if r.status != 200:
        err = r.json().get("error", "")
        if err == "invalid_grant":
            raise UploadError(TOKEN_EXPIRED_HINT)
        raise UploadError(f"액세스 토큰 갱신 실패 HTTP {r.status} error={err or '?'}")   # 본문은 찍지 않는다(비밀값 보호)
    tok = r.json().get("access_token")
    if not tok:
        raise UploadError("토큰 응답에 access_token 이 없습니다")
    return str(tok)


def my_channel(send: Transport, token: str) -> dict[str, str]:
    """channels.list(mine=true) → {'id', 'title'}. 할당량 1단위."""
    url = CHANNELS_URL + "?" + urllib.parse.urlencode({"part": "id,snippet", "mine": "true"})
    r = send("GET", url, {"Authorization": f"Bearer {token}"}, None)
    if r.status != 200:
        raise _api_error(r, "채널 확인")
    items = r.json().get("items") or []
    if not items:
        raise UploadError("토큰이 가리키는 계정에 유튜브 채널이 없습니다 — 동의 화면에서 채널(브랜드 계정)을 골랐는지 확인")
    return {"id": str(items[0].get("id", "")), "title": str(items[0].get("snippet", {}).get("title", ""))}


def _range_next(r: Response) -> int:
    rng = r.headers.get("range", "")
    return int(rng.split("-")[1]) + 1 if rng and "-" in rng else 0


def upload_video(send: Transport, cfg: Config, token: str, video: Path, meta: Metadata,
                 sleep: Callable[[float], None] = time.sleep, log: Callable[[str], None] = lambda s: None) -> str:
    """재개 가능 업로드. 세션 시작(POST) → 조각 PUT. 308 이면 Range 다음 바이트부터. 5xx·네트워크 오류는 cfg.tries 까지 재시도."""
    size = video.stat().st_size
    auth = {"Authorization": f"Bearer {token}"}
    init_url = UPLOAD_URL + "?" + urllib.parse.urlencode({"uploadType": "resumable", "part": "snippet,status"})
    r = send("POST", init_url, {**auth, "Content-Type": "application/json; charset=UTF-8",
                                "X-Upload-Content-Length": str(size), "X-Upload-Content-Type": "video/mp4"},
             json.dumps(meta.body(), ensure_ascii=False).encode("utf-8"))
    if r.status != 200 or "location" not in r.headers:
        raise _api_error(r, "업로드 세션 시작")
    session = r.headers["location"]
    chunk = max(cfg.chunk_mb * MB // CHUNK_UNIT, 1) * CHUNK_UNIT
    pos, fails = 0, 0
    with video.open("rb") as f:
        while True:
            f.seek(pos)
            data = f.read(chunk)
            last = ""
            try:
                r = send("PUT", session, {**auth, "Content-Range": f"bytes {pos}-{pos + len(data) - 1}/{size}"}, data)
                if r.status in (200, 201):
                    vid = r.json().get("id")
                    if not vid:
                        raise UploadError("업로드 응답에 video id 가 없습니다")
                    return str(vid)
                if r.status == 308:   # Resume Incomplete
                    pos, fails = _range_next(r), 0
                    log(f"업로드 {pos / MB:.1f}/{size / MB:.1f} MB")
                    continue
                if r.status not in RETRY_STATUS:
                    raise _api_error(r, "영상 업로드")
                last = f"HTTP {r.status}"
            except TransportError as ex:
                last = str(ex)
            fails += 1
            if fails >= cfg.tries:
                raise UploadError(f"영상 업로드 재시도 {cfg.tries}회 실패: {last}")
            sleep(float(2 ** fails))
            q = send("PUT", session, {**auth, "Content-Range": f"bytes */{size}"}, b"")   # 서버가 받은 위치 확인
            if q.status in (200, 201):
                vid = q.json().get("id")
                if vid:
                    return str(vid)
            pos = _range_next(q) if q.status == 308 else 0


def upload_caption(send: Transport, cfg: Config, token: str, video_id: str, srt: Path) -> str:
    """captions.insert — multipart/related(메타데이터 JSON + srt 본문). 할당량 400단위."""
    boundary = uuid.uuid4().hex
    meta = json.dumps({"snippet": {"videoId": video_id, "language": cfg.caption_language,
                                   "name": cfg.caption_name, "isDraft": False}}, ensure_ascii=False)
    body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
            f"--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n").encode("utf-8") + srt.read_bytes() + \
        f"\r\n--{boundary}--\r\n".encode("utf-8")
    url = CAPTIONS_URL + "?" + urllib.parse.urlencode({"uploadType": "multipart", "part": "snippet"})
    r = send("POST", url, {"Authorization": f"Bearer {token}", "Content-Type": f"multipart/related; boundary={boundary}"}, body)
    if r.status != 200:
        err = _api_error(r, "자막 업로드")
        if r.status in (401, 403):
            raise UploadError(f"{err} — 자막 업로드에는 youtube.force-ssl 권한이 필요합니다(2026-11-12 사용자 결정으로 "
                              "옛 판 비공개 전환용으로 받기로 했으나 토큰을 아직 다시 받지 않았을 수 있습니다). "
                              "자막은 화면에 새겨져 있어 기본적으로 올리지 않습니다. docs/YOUTUBE_AUTO_UPLOAD.md '권한'")
        raise err
    cid = r.json().get("id")
    if not cid:
        raise UploadError("자막 응답에 id 가 없습니다")
    return str(cid)


def wait_processed(send: Transport, token: str, video_id: str, *, timeout_sec: float, poll_sec: float,
                   sleep: Callable[[float], None] = time.sleep, log: Callable[[str], None] = lambda s: None) -> str:
    """videos.list(part=processingDetails) 로 유튜브의 영상 처리가 끝날 때까지 기다린다. 한 번에 할당량 1단위.

    공식 문서(thumbnails.set): 쇼츠의 맞춤 썸네일은 processingDetails.processingStatus 가 succeeded 가 된 뒤에
    지정해야 한다. 그 전에 지정하면 적용되지 않을 수 있다(2026-11-07 첫 업로드에서 실제로 중간 장면이 썸네일이 됨).
    youtube.readonly 범위로 읽는다(영상 주인에게만 보이는 정보)."""
    url = VIDEOS_URL + "?" + urllib.parse.urlencode({"part": "processingDetails", "id": video_id})
    waited, polls, last = 0.0, 0, "?"
    while True:
        try:
            r = send("GET", url, {"Authorization": f"Bearer {token}"}, None)
            if r.status == 200:
                items = r.json().get("items") or []
                pd = (items[0].get("processingDetails") or {}) if items else {}
                last = str(pd.get("processingStatus") or ("not-found" if not items else "?"))
                if last == "succeeded":
                    return last
                if last in ("failed", "terminated"):
                    raise UploadError(f"유튜브 영상 처리 {last} {pd.get('processingFailureReason', '')}".strip())
            elif r.status in RETRY_STATUS:
                last = f"HTTP {r.status}"
            else:
                raise _api_error(r, "영상 처리 상태 확인")
        except TransportError as ex:
            last = str(ex)
        if waited >= timeout_sec:
            raise UploadError(f"영상 처리 대기 {timeout_sec:.0f}초 초과(마지막 상태 {last})")
        if polls % 4 == 0:
            log(f"영상 처리 대기 중 — {last} ({waited:.0f}초)")
        sleep(poll_sec)
        waited += poll_sec
        polls += 1


def video_status(send: Transport, token: str, ids: list[str]) -> dict[str, dict[str, Any]]:
    """videos.list(part=status,statistics) — 영상 ID 별 공개 상태와 조회수. 없는(지운) 영상은 빠진다. 50개씩, 1회 1단위."""
    out: dict[str, dict[str, Any]] = {}
    ids = [i for i in ids if i]
    for k in range(0, len(ids), 50):
        url = VIDEOS_URL + "?" + urllib.parse.urlencode({"part": "status,statistics", "id": ",".join(ids[k:k + 50])})
        r = send("GET", url, {"Authorization": f"Bearer {token}"}, None)
        if r.status != 200:
            raise _api_error(r, "영상 상태 확인")
        for v in r.json().get("items", []):
            out[v["id"]] = {"privacy": v.get("status", {}).get("privacyStatus", ""),
                            "views": int(v.get("statistics", {}).get("viewCount", 0) or 0)}
    return out


def video_details(send: Transport, token: str, ids: list[str]) -> dict[str, dict[str, Any]]:
    """videos.list(part=snippet,status,statistics) — 48시간 점검용. 영상 ID 별 채널·공개 상태·조회수·publishedAt.
    없는(지운) 영상은 빠진다. 50개씩, 1회 1단위."""
    out: dict[str, dict[str, Any]] = {}
    ids = list(dict.fromkeys(i for i in ids if i))
    for k in range(0, len(ids), 50):
        url = VIDEOS_URL + "?" + urllib.parse.urlencode({"part": "snippet,status,statistics", "id": ",".join(ids[k:k + 50])})
        r = send("GET", url, {"Authorization": f"Bearer {token}"}, None)
        if r.status != 200:
            raise _api_error(r, "영상 점검")
        for v in r.json().get("items", []):
            out[v["id"]] = {"channel_id": v.get("snippet", {}).get("channelId", ""),
                            "published_at": v.get("snippet", {}).get("publishedAt", ""),
                            "privacy": v.get("status", {}).get("privacyStatus", ""),
                            "views": int(v.get("statistics", {}).get("viewCount", 0) or 0)}
    return out


# videos.update(part=status) 로 되돌려 보내 지킬 status 필드. 공식 문서(videos/update, 2026-11-12 확인):
#   "If you are submitting an update request, and your request does not specify a value for a property that already
#    has a value, the property's existing value will be deleted. The following fields are exempt from this behavior and
#    will only update if explicitly set: status.selfDeclaredMadeForKids status.containsSyntheticMedia"
# 그래서 지워질 수 있는 셋(embeddable·license·publicStatsViewable)은 지금 값을 그대로 보내고, 예외인 둘은 보내지 않는다
# (보내지 않으면 바뀌지 않는다). status.publishAt 은 보내지 않는다 — 문서(videos 리소스)상 과거 시각을 넣으면
# "the same as of changing the video's privacyStatus from private to public" 이다.
PRESERVED_STATUS_KEYS: tuple[str, ...] = ("embeddable", "license", "publicStatsViewable")
PRIVATE = "private"   # set_private 가 보내는 유일한 공개 상태 값. public·unlisted 로 바꾸는 경로는 없다


def set_private(send: Transport, token: str, cfg: Config, video_id: str, *, max_views: int) -> dict[str, Any]:
    """우리 채널의 공개 영상 하나를 비공개로 돌린다(공개 → 비공개 한 방향만, 2026-11-12 사용자: "조회수 100회 미만인 애들
    비공개로 돌린다던지"). 삭제는 하지 않는다.

    1) videos.list(part=snippet,status,statistics) 1단위 — 채널·현재 status·조회수를 읽는다.
       없으면 result 'not-found', 이미 비공개면 'already-private'.
       다른 채널 영상이거나 조회수 ≥ max_views(노출을 받은 영상)면 PrivatizeRefused.
    2) videos.update(part=status) 50단위 — 지금 status 의 지워질 수 있는 필드를 그대로 두고 privacyStatus 만 "private".
       문서: "This request requires authorization with at least one of the following scopes" — youtubepartner,
       youtube, youtube.force-ssl. 이 체계는 youtube.force-ssl 을 쓴다. 범위가 없으면 403 → ScopeError."""
    if not cfg.channel_id:
        raise UploadError("config/youtube.json 의 channel_id 가 없어 옛 판 비공개 전환을 하지 않습니다(채널 확인 불가)")
    auth = {"Authorization": f"Bearer {token}"}
    url = VIDEOS_URL + "?" + urllib.parse.urlencode({"part": "snippet,status,statistics", "id": video_id})
    r = send("GET", url, auth, None)
    if r.status != 200:
        raise _api_error(r, "옛 판 상태 확인")
    items = r.json().get("items") or []
    if not items:
        return {"video_id": video_id, "result": "not-found"}
    v = items[0]
    if v.get("snippet", {}).get("channelId") != cfg.channel_id:
        raise PrivatizeRefused(f"{video_id} 는 설정 채널({cfg.channel_id})의 영상이 아닙니다 — 건드리지 않음")
    st = v.get("status") or {}
    views = int(v.get("statistics", {}).get("viewCount", 0) or 0)
    if st.get("privacyStatus") == PRIVATE:
        return {"video_id": video_id, "result": "already-private", "views": views}
    if views >= max_views:
        raise PrivatizeRefused(f"{video_id} 조회수 {views}회 ≥ {max_views} — 노출을 받은 영상이라 비공개로 돌리지 않습니다")
    missing = [k for k in PRESERVED_STATUS_KEYS if k not in st]
    if missing:   # 빠진 값을 보내지 않으면 유튜브가 지운다(기본값으로 돌아감) — 모르는 채로 바꾸지 않는다
        raise UploadError(f"{video_id} 의 현재 status 에 {', '.join(missing)} 가 없어 그대로 보존할 수 없습니다 — 바꾸지 않음")
    status = {k: st[k] for k in PRESERVED_STATUS_KEYS}
    status["privacyStatus"] = PRIVATE
    body = json.dumps({"id": video_id, "status": status}, ensure_ascii=False).encode("utf-8")
    r = send("PUT", VIDEOS_URL + "?" + urllib.parse.urlencode({"part": "status"}),
             {**auth, "Content-Type": "application/json; charset=UTF-8"}, body)
    if r.status != 200:
        raise _api_error(r, "옛 판 비공개 전환")
    got = r.json().get("status", {}).get("privacyStatus")
    if got not in (None, PRIVATE):
        raise UploadError(f"{video_id} 비공개 전환 응답의 공개 상태가 {got!r} 입니다 — 스튜디오에서 확인하십시오")
    return {"video_id": video_id, "result": "privatized", "views": views, "privacy_before": st.get("privacyStatus", "")}


def upload_thumbnail(send: Transport, token: str, video_id: str, image: Path) -> None:
    """thumbnails.set — 채널이 맞춤 썸네일을 쓸 수 있어야 한다(전화 인증). 할당량 50단위."""
    ctype = "image/png" if image.suffix.lower() == ".png" else "image/jpeg"
    url = THUMBNAILS_URL + "?" + urllib.parse.urlencode({"videoId": video_id, "uploadType": "media"})
    r = send("POST", url, {"Authorization": f"Bearer {token}", "Content-Type": ctype}, image.read_bytes())
    if r.status != 200:
        raise _api_error(r, "썸네일 설정")


# ───────────────────────────── 기록 ─────────────────────────────

@dataclass
class Record:
    video_id: str
    url: str
    studio_url: str
    uploaded_at: str                      # UTC ISO 8601
    privacy_status: str
    channel_id: str
    channel_title: str
    video_file: str
    video_bytes: int
    video_md5: str
    title: str
    description_bytes: int
    contains_synthetic_media: bool
    made_for_kids: bool
    duration_sec: float | None = None
    width: int | None = None
    height: int | None = None
    caption_id: str | None = None
    caption_error: str | None = None
    thumbnail_file: str | None = None
    thumbnail_error: str | None = None
    thumbnail_after_processing: bool | None = None   # True = 처리 완료 뒤에 지정(쇼츠에 적용되는 조건). None = 옛 기록
    thumbnail_set_at: str | None = None
    number: int | None = None
    slug: str = ""
    source: str = "api"                   # api(이 도구가 올림) · manual(손으로 올린 것을 --mark-uploaded 로 기록)
    previous: list[dict[str, Any]] = field(default_factory=list)   # 다시 올리기 전의 판들(최근 것이 앞)
    privatized_at: str | None = None      # 이 판(video_id)을 비공개로 돌린 시각(privatize_only · 48시간 점검)
    sweep: dict[str, Any] | None = None   # 이 판의 48시간 점검 결과(sweep_low_views, 2026-11-13). 다시 올리면 previous[0].sweep 으로
    schema_version: int = 1


def read_record(dir_: Path) -> Record | None:
    p = dir_ / RECORD_NAME
    if not p.is_file():
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        return Record(**{k: v for k, v in raw.items() if k in Record.__dataclass_fields__})
    except (ValueError, TypeError) as e:
        raise UploadError(f"{p}: 기록 파일을 읽을 수 없습니다: {e}") from None


def write_record(dir_: Path, rec: Record) -> Path:
    p = dir_ / RECORD_NAME
    p.write_text(json.dumps(asdict(rec), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


# ───────────────────────────── 실행 ─────────────────────────────

def _rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(REPO))
    except ValueError:
        return str(p)


def _log(msg: str) -> None:
    print(f"[youtube] {msg}", file=sys.stderr, flush=True)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def apply_thumbnail(send: Transport, cfg: Config, token: str, rec: Record, image: Path, res: dict[str, Any],
                    sleep: Callable[[float], None] = time.sleep) -> bool:
    """처리 완료를 기다린 뒤 썸네일을 지정하고 기록(rec)을 고친다. 실패는 경고로 남기고 False."""
    try:
        wait_processed(send, token, rec.video_id, timeout_sec=cfg.processing_wait_sec,
                       poll_sec=cfg.processing_poll_sec, sleep=sleep, log=_log)
        upload_thumbnail(send, token, rec.video_id, image)
    except (UploadError, TransportError) as ex:
        rec.thumbnail_error = str(ex)
        res["warnings"].append(f"썸네일 설정 실패(영상은 그대로 — 같은 편을 다시 실행하면 다시 시도합니다. "
                               f"끝내 안 되면 유튜브 휴대전화 앱에서 첫 프레임을 고르십시오): {ex}")
        _log(res["warnings"][-1])
        return False
    rec.thumbnail_file, rec.thumbnail_error = image.name, None
    rec.thumbnail_after_processing, rec.thumbnail_set_at = True, _now()
    _log(f"썸네일 설정 완료(영상 처리 완료 뒤) {image.name}")
    return True


PRIVATIZE_HINT = "옛 판 비공개 전환 실패 — 토큰에 youtube.force-ssl 권한이 있는지 확인하세요: "


def privatize_entry(send: Transport, token: str, cfg: Config, entry: dict[str, Any], video_id: str, *, max_views: int,
                    protected: frozenset[str] = frozenset()) -> dict[str, Any]:
    """set_private 를 부르고 결과를 entry(기록의 previous 항목 등)에 적는다. 예외를 밖으로 내지 않는다 — 업로드를 막지 않는다.

    성공(privatized·already-private·not-found)이면 privatized_at·privatize_result, 영구 거절이면 privatize_refused,
    그 밖의 실패면 privatize_error(짧은 글, 비밀값 없음). 돌려주는 dict 의 result: privatized · already-private ·
    not-found · refused · no-scope · error."""
    out: dict[str, Any] = {"video_id": video_id, "url": WATCH_URL_PREFIX + video_id}
    try:
        if video_id in protected:
            raise PrivatizeRefused(f"{video_id} 는 보호 목록(config/republish.json never_privatize)에 있어 건드리지 않습니다")
        r = set_private(send, token, cfg, video_id, max_views=max_views)
    except PrivatizeRefused as ex:
        entry["privatize_refused"] = str(ex)[:300]
        entry.pop("privatize_error", None)
        out.update(result="refused", error=str(ex)[:300])
        return out
    except (UploadError, TransportError, ValueError) as ex:
        entry["privatize_error"] = str(ex)[:300]
        out.update(result="no-scope" if isinstance(ex, ScopeError) else "error", error=str(ex)[:300])
        return out
    entry["privatized_at"], entry["privatize_result"] = _now(), r["result"]
    entry.pop("privatize_error", None)
    out.update(result=r["result"], views=r.get("views"))
    return out


def process_episode(dir_: Path, cfg: Config, *, dry_run: bool, send: Transport | None = None,
                    env: dict[str, str] | None = None, caption: bool | None = None, thumbnail: bool | None = None,
                    synthetic: bool | None = None, made_for_kids: bool | None = None, not_shorts: bool = False,
                    allow_reupload: bool = False, sleep: Callable[[float], None] = time.sleep, auto: bool = False,
                    republish: bool = False, republish_min_views: int = 100, republish_previous_id: str | None = None,
                    privatize_protected: frozenset[str] = frozenset(),
                    morning: set[int] | None = None, republish_path: Path | None = None) -> dict[str, Any]:
    """에피소드 하나. 결과 dict 의 status: uploaded · skipped · dry-run · error.

    기록이 있는데 영상 파일이 바뀐 편은 보통 --allow-reupload 없이는 거절한다. 다만 다시 올리기 대기 중인 편
    (republish_path 의 대기열에 있고 아직 다시 올리지 않았거나, 48시간 점검이 지금 판을 flagged 로 적은 편)은
    파일이 바뀌는 것이 예정된 일이므로 거절하지 않고 건너뛴다(skipped). 새 파일은 아침 다시 올리기 차례에
    republish=True 로 새 영상이 되어 올라간다(2026-11-13).

    republish=True(다시 올리기, 2026-11-08): 같은 영상이라도 새 영상으로 올린다. 몰아 공개해 노출을 못 받은 편을
    하루 1편씩 새로 올리려는 것이다. 이전 판의 조회수가 republish_min_views 이상이면(그사이 노출을 받음) 올리지 않는다.
    기록이 없는(손으로 올린) 편은 republish_previous_id(config/republish.json previous_ids)로 이전 판을 안다.
    이전 판은 기록의 previous 에 남기고, 새 판이 올라간 뒤 이전 판을 비공개로 돌린다(2026-11-12 사용자 "권한을 너한테
    주면 되잖아"). 비공개 전환이 실패해도(토큰에 youtube.force-ssl 이 아직 없음 등) 업로드는 성공으로 두고 경고만 남긴다.

    auto=True(push 자동 실행): 번호가 cfg.auto_from_number 이상이거나 meta.json auto_publish=true 인 편만 처리한다.
    01~21 은 손으로 올린 편이 섞여 있어, 폴더를 고친 PR 이 병합돼도 다시 올라가지 않게 한다(2026-11-07).
    아침 업로드 대기열(config/daily.json, morning)의 편도 push 에서는 올리지 않는다. 다음 날 아침 daily_next 가 올린다(2026-11-08)."""
    res: dict[str, Any] = {"dir": _rel(dir_), "status": "error", "warnings": []}
    try:
        ep = load_episode(dir_, caption=cfg.upload_captions if caption is None else caption,
                          thumbnail=cfg.upload_thumbnail if thumbnail is None else thumbnail)
        res.update(number=ep.number, slug=ep.slug)
        if auto and not (ep.meta.get("auto_publish") is True or (ep.number is not None and ep.number >= cfg.auto_from_number)):
            res["status"] = "skipped"
            res["warnings"].append(f"자동 대상 아님(번호 {ep.number} < {cfg.auto_from_number}, meta.json auto_publish 없음) — "
                                   "옛 편은 수동 실행(episode 지정)으로만 올립니다")
            _log(f"{_rel(dir_)}: {res['warnings'][-1]}")
            return res
        if auto and ep.number in (morning_numbers() if morning is None else morning):
            res["status"] = "skipped"
            res["warnings"].append("아침 업로드 대기열(config/daily.json) 편 — push 에서는 올리지 않고 "
                                   "아침 youtube-daily 가 비공개로 올립니다")
            _log(f"{_rel(dir_)}: {res['warnings'][-1]}")
            return res
        meta = build_metadata(ep, cfg, synthetic=synthetic, made_for_kids=made_for_kids)
        res["title"] = meta.title
        errs = validate_metadata(meta)
        probe = probe_video(ep.video)
        verrs, vwarns = check_video(probe, cfg, not_shorts=not_shorts)
        errs += verrs
        res["warnings"] += vwarns
        if ep.thumbnail is not None and ep.thumbnail.stat().st_size > cfg.thumbnail_max_bytes:
            res["warnings"].append(f"썸네일 {ep.thumbnail.name} 이 {cfg.thumbnail_max_bytes // MB}MB 를 넘어 올리지 않습니다")
            ep.thumbnail = None
        if errs:
            raise UploadError("검증 실패: " + " · ".join(errs))
        size, md5 = ep.video.stat().st_size, md5_file(ep.video)
        _log(f"{_rel(dir_)}: 제목 「{meta.title}」 · 설명 {_nbytes(meta.description)}B · 태그 {len(meta.tags)}개 · 영상 {size / MB:.1f}MB"
             + (f" · {probe['width']}×{probe['height']} {probe['duration_sec']:.1f}s" if probe else "")
             + f" · 자막 {'올림' if ep.srt else '안 올림'} · 썸네일 {ep.thumbnail.name if ep.thumbnail else '없음'}"
             + f" · 비공개 · 합성표시={meta.contains_synthetic_media} · 아동용={meta.made_for_kids}")
        prev = read_record(dir_)
        if prev is not None and not republish:
            if prev.video_md5 == md5:
                res.update(status="skipped", video_id=prev.video_id, url=prev.url, studio_url=prev.studio_url)
                res["warnings"].append(f"이미 올린 영상(md5 {md5[:8]}, {prev.source}) — {prev.url} · 다시 올리지 않음")
                _log(res["warnings"][-1])
                if ep.thumbnail is not None and prev.source == "api" and not prev.thumbnail_after_processing:
                    # 처리 완료 전에 썸네일을 지정한 옛 기록 → 영상은 두고 썸네일만 다시 지정한다
                    if dry_run:
                        res["warnings"].append("썸네일을 영상 처리 완료 뒤 다시 지정해야 합니다 — dry-run 이라 하지 않음")
                        return res
                    try:
                        tx = send or urllib_transport(cfg.timeout_sec)
                        token = access_token(tx, read_secrets(env))
                        ch = my_channel(tx, token)
                        if ch["id"] != prev.channel_id or (cfg.channel_id and ch["id"] != cfg.channel_id):
                            raise UploadError(f"토큰 채널({ch['title']} {ch['id']})이 기록 채널({prev.channel_id})과 다릅니다")
                    except (UploadError, TransportError) as ex:
                        res["warnings"].append(f"썸네일 다시 지정 못 함: {ex}")
                        _log(res["warnings"][-1])
                        return res
                    res["thumbnail_repaired"] = apply_thumbnail(tx, cfg, token, prev, ep.thumbnail, res, sleep)
                    write_record(dir_, prev)
                    if res["thumbnail_repaired"]:
                        res["warnings"].append(f"썸네일 다시 지정 완료({ep.thumbnail.name}, 영상 처리 완료 뒤)")
                return res
            if not allow_reupload:
                if republish_pending(dir_, DEFAULT_REPUBLISH if republish_path is None else republish_path):
                    res.update(status="skipped", video_id=prev.video_id, url=prev.url, studio_url=prev.studio_url)
                    res["warnings"].append(f"다시 올리기 대기 중인 편 — 영상 파일이 바뀌었습니다(md5 {prev.video_md5[:8]}→{md5[:8]}). "
                                           "아침 다시 올리기 차례에 새 영상으로 올라갑니다(지금은 올리지 않음)")
                    _log(f"{_rel(dir_)}: {res['warnings'][-1]}")
                    return res
                raise UploadError(f"기록({RECORD_NAME})이 있는데 영상 파일이 바뀌었습니다(md5 {prev.video_md5[:8]}→{md5[:8]}). "
                                  "다시 만든 편을 새 영상으로 올리는 것이 맞으면 --allow-reupload (기존 영상은 유튜브에 그대로 남습니다)")
            res["warnings"].append(f"기록을 덮어씁니다 — 이전 영상 {prev.url} 은 유튜브에 그대로 남아 있습니다")
        if dry_run:
            res["status"] = "dry-run"
            res["warnings"].append("dry-run — 올리지 않았습니다" + (" (다시 올리기 — 이전 판 조회수는 실제 실행 때 확인)" if republish else ""))
            return res
        secrets = read_secrets(env)
        tx = send or urllib_transport(cfg.timeout_sec)
        token = access_token(tx, secrets)
        ch = my_channel(tx, token)
        if cfg.channel_id and ch["id"] != cfg.channel_id:
            raise UploadError(f"토큰이 가리키는 채널({ch['title']} {ch['id']})이 설정 channel_id({cfg.channel_id})와 다릅니다 — 업로드 중단")
        _log(f"채널: {ch['title']} ({ch['id']})")
        prev_info: dict[str, Any] | None = None
        if republish:
            old_id = prev.video_id if prev is not None else republish_previous_id
            if old_id:
                st = video_status(tx, token, [old_id]).get(old_id)
                prev_info = ({"video_id": prev.video_id, "url": prev.url, "title": prev.title, "uploaded_at": prev.uploaded_at}
                             if prev is not None else
                             {"video_id": old_id, "url": WATCH_URL_PREFIX + old_id,
                              "note": "손으로 올린 이전 판(config/republish.json previous_ids)"})
                prev_info.update({"views_at_republish": st["views"] if st else None,
                                  "privacy_at_republish": st["privacy"] if st else "not-found",
                                  "republished_at": _now(), "reason": "republish"})
                if prev is not None and prev.sweep:
                    prev_info["sweep"] = prev.sweep   # 옛 판의 48시간 점검 기록 — 새 판과 비교하려고 남긴다(새 기록은 sweep 없이 시작)
                if st and st["views"] >= republish_min_views:
                    res.update(status="skipped", video_id=old_id, url=WATCH_URL_PREFIX + old_id,
                               studio_url=STUDIO_URL.format(video_id=old_id), previous_views=st["views"])
                    res["warnings"].append(f"이전 판이 그사이 노출을 받았습니다({st['views']}회 ≥ {republish_min_views}) — 다시 올리지 않음")
                    _log(res["warnings"][-1])
                    return res
                _log(f"다시 올리기: 이전 판 {WATCH_URL_PREFIX + old_id} 조회 {st['views'] if st else '없음(지워짐)'}회")
            else:
                prev_info = {"video_id": None, "note": "손으로 올린 이전 판(ID 미기록)", "republished_at": _now(), "reason": "republish"}
        vid = upload_video(tx, cfg, token, ep.video, meta, sleep=sleep, log=_log)
        rec = Record(video_id=vid, url=WATCH_URL_PREFIX + vid, studio_url=STUDIO_URL.format(video_id=vid),
                     uploaded_at=_now(), privacy_status="private",
                     channel_id=ch["id"], channel_title=ch["title"], video_file=ep.video.name, video_bytes=size, video_md5=md5,
                     title=meta.title, description_bytes=_nbytes(meta.description),
                     contains_synthetic_media=meta.contains_synthetic_media, made_for_kids=meta.made_for_kids,
                     duration_sec=probe["duration_sec"] if probe else None, width=probe["width"] if probe else None,
                     height=probe["height"] if probe else None, number=ep.number, slug=ep.slug, source="api")
        if prev_info is not None:
            rec.previous = [prev_info] + (prev.previous if prev is not None else [])
            res.update(republish=True, previous_video=prev_info.get("url"), previous_views=prev_info.get("views_at_republish"))
        write_record(dir_, rec)   # 자막·썸네일이 실패해도 영상 기록은 남는다
        _log(f"영상 업로드 완료(비공개) {rec.url} · Studio {rec.studio_url}")
        if prev_info is not None and prev_info.get("video_id"):
            # 새 판이 올라가고 기록이 남은 뒤에만 옛 판을 비공개로(공개 → 비공개). 실패해도 업로드는 성공이다.
            pv = privatize_entry(tx, token, cfg, rec.previous[0], prev_info["video_id"], max_views=republish_min_views,
                                 protected=privatize_protected)
            write_record(dir_, rec)
            res["privatize"] = pv
            if pv["result"] in ("privatized", "already-private", "not-found"):
                _log(f"옛 판 {pv['url']} 비공개 전환: {pv['result']}")
            else:
                res["warnings"].append((PRIVATIZE_HINT if pv["result"] in ("no-scope", "error") else "옛 판 비공개 전환 안 함: ")
                                       + pv.get("error", ""))
                _log(res["warnings"][-1])
        if ep.thumbnail is not None:
            apply_thumbnail(tx, cfg, token, rec, ep.thumbnail, res, sleep)
            write_record(dir_, rec)
        if ep.srt is not None:
            try:
                rec.caption_id = upload_caption(tx, cfg, token, vid, ep.srt)
                _log(f"자막 업로드 완료 {rec.caption_id}")
            except (UploadError, TransportError) as ex:
                rec.caption_error = str(ex)
                res["warnings"].append(f"자막 업로드 실패(영상은 올라감): {ex}")
                _log(res["warnings"][-1])
            write_record(dir_, rec)
        res.update(status="uploaded", video_id=vid, url=rec.url, studio_url=rec.studio_url, channel=ch["title"])
        return res
    except (UploadError, TransportError, OSError, ValueError) as ex:
        res["error"] = str(ex)
        _log(f"{_rel(dir_)}: 실패 — {ex}")
        return res


DEFAULT_REPUBLISH = REPO / "config" / "republish.json"


def republished(rec: Record | None) -> bool:
    return rec is not None and any(p.get("reason") == "republish" for p in rec.previous)


WAITING_NOTE = "아직 공개하지 않은 비공개 영상이 있어 오늘은 쉽니다: "


def private_waiting(send: Transport, token: str, finals: Path, today: dt.date, hold_days: int) -> list[str]:
    """최근 hold_days 일 안에 API 로 올린 영상 중 아직 비공개인 것. 사용자가 공개하기 전에는 다음 편을 쌓지 않는다."""
    recent: dict[str, str] = {}
    for d in episode_dirs(finals):
        rec = read_record(d)
        if rec is None or rec.source != "api" or not rec.uploaded_at:
            continue
        up = dt.datetime.fromisoformat(rec.uploaded_at)
        up_day = (up if up.tzinfo else up.replace(tzinfo=dt.timezone.utc)).astimezone(KST).date()
        if (today - up_day).days <= hold_days:
            recent[rec.video_id] = _rel(d)
    if not recent:
        return []
    st = video_status(send, token, list(recent))
    return [f"{recent[v]}({v})" for v, x in st.items() if x["privacy"] == "private"]


def load_daily(path: Path | None = None) -> dict[str, Any]:
    p = DEFAULT_DAILY if path is None else path
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {"order": []}


def morning_numbers(path: Path | None = None) -> set[int]:
    """아침 업로드 대기열(config/daily.json order)의 번호. push 자동 실행은 이 편들을 올리지 않는다."""
    return {int(o["number"]) for o in load_daily(path).get("order", [])}


def morning_dirs(daily: dict[str, Any], finals: Path) -> list[Path]:
    """대기열 순서대로, 만들어졌고(finals/<NN>-*) 아직 유튜브 기록이 없는 편."""
    out = []
    for o in daily.get("order", []):
        for d in episode_dirs(finals):
            if parse_dir_name(d)[0] == int(o["number"]) and read_record(d) is None:
                out.append(d)
    return out


RECENT_HOURS = 6     # 2026-11-09: 예약 실행이 늦어 예비 실행을 여러 번 걸어 둔다. 먼저 돈 하나만 올린다.


def recently_uploaded(finals: Path, hours: float, now: dt.datetime | None = None) -> bool:
    if hours <= 0:
        return False
    now = now or dt.datetime.now(dt.timezone.utc)
    for d in episode_dirs(finals):
        rec = read_record(d)
        if rec is None or rec.source != "api" or not rec.uploaded_at:
            continue
        up = dt.datetime.fromisoformat(rec.uploaded_at)
        up = up if up.tzinfo else up.replace(tzinfo=dt.timezone.utc)
        if (now - up).total_seconds() < hours * 3600:
            return True
    return False


def daily_next(cfg: Config, daily_path: Path, republish_path: Path, finals: Path, *, today: dt.date, dry_run: bool,
               send: Transport | None = None, env: dict[str, str] | None = None,
               sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
    """아침 업로드 한 번(youtube-daily 워크플로, 매일 아침 7시 전). 2026-11-08 사용자 결정.

    1) 최근 hold 일 안에 올린 영상이 아직 비공개면 쉰다 — hold 가 0 이면 쉬지 않는다
       (2026-11-11 사용자: "비공개가 있어도 예정된 스케줄의 영상들을 올리도록 해", 설정 0).
    2) 대기열(config/daily.json)에서 만들어 두고 아직 안 올린 첫 편을 비공개로 올린다.
    3) 그런 편이 없으면 다시 올리기 대기열(config/republish.json)에서 한 편을 올린다. 하루 한 편만.
    4) republish.json 의 alternate_with_new 가 true 면(2026-11-12 사용자 "하루씩 번갈아") 새 편과 다시 올리기를 번갈아
       올린다. 마지막 업로드가 새 편이면 다시 올리기 차례, 다시 올리기(또는 기록 없음)면 새 편 차례. 다시 올리기 차례인데
       올릴 편이 없으면(모두 min_views 이상으로 건너뜀·대기열 끝·시작 전) 같은 실행에서 새 편을 올린다. 한 실행에 한 편.
    먼저(쉬는 날에도) 48시간 점검(sweep_low_views, 2026-11-13)을 하고, 비공개로 돌리지 못한 옛 판을 다시 시도한다
    (privatize_pending). 둘 다 실패해도 업로드를 막지 않는다. 점검이 비공개로 돌린 편은 같은 실행의 다시 올리기 대상이 된다."""
    daily = load_daily(daily_path)
    hold_days = int(daily.get("hold_if_private_within_days", 3))
    empty = {"uploaded": 0, "skipped": 0, "dry-run": 0, "error": 0}
    rc = load_republish(republish_path)
    sweep = run_sweep(cfg, republish_path, finals, dry_run=dry_run, send=send, env=env) if rc.get("auto_sweep") else None
    catch = privatize_pending(cfg, republish_path, finals, dry_run=dry_run, send=send, env=env) if rc else None

    def done(out: dict[str, Any]) -> dict[str, Any]:
        if sweep is not None:
            out["sweep"] = {k: sweep[k] for k in ("items", "note", "counts") if k in sweep}
            if sweep.get("warnings"):
                out["warnings"] = out.get("warnings", []) + sweep["warnings"]
        if catch is not None:
            out["privatize"] = catch.get("items", [])
            if catch.get("warnings"):
                out["warnings"] = out.get("warnings", []) + catch["warnings"]
        return out

    if not dry_run and recently_uploaded(finals, RECENT_HOURS):
        return done({"ok": True, "counts": empty, "results": [],
                     "note": f"최근 {RECENT_HOURS}시간 안에 올린 영상이 있어 쉽니다(예비 실행이 하루 두 편을 올리지 않게)"})
    if not dry_run and hold_days > 0:
        tx = send or urllib_transport(cfg.timeout_sec)
        waiting = private_waiting(tx, access_token(tx, read_secrets(env)), finals, today, hold_days)
        if waiting:
            return done({"ok": True, "counts": empty, "results": [], "note": WAITING_NOTE + ", ".join(waiting)})
        send = tx
    ready = morning_dirs(daily, finals)
    turn = ""
    pre: list[dict[str, Any]] = []
    if ready and rc and rc.get("alternate_with_new"):
        avail, why = republish_available(rc, today, finals)
        last, last_dir = last_upload(finals)
        last_txt = f"마지막 업로드({_rel(last_dir)})" if last_dir else ""
        if not avail:
            turn = f"번갈아 올리기: 다시 올릴 편이 없어({why}) 새 편"
        elif last == "new":
            out = republish_next(cfg, republish_path, finals, today=today, dry_run=dry_run, send=send, env=env, sleep=sleep,
                                 skip_hold=True)
            c = out["counts"]
            if c["uploaded"] or c["error"] or c["dry-run"]:
                out["kind"] = "republish"
                out["note"] = (f"번갈아 올리기: {last_txt}가 새 편이라 오늘은 다시 올리기 차례 — "
                               + out.get("note", f"다시 올리기 {out['results'][-1]['dir']}") + f" (새 편 대기 {len(ready)}편)")
                return done(out)
            pre = out["results"]
            turn = (f"번갈아 올리기: 다시 올리기 차례였지만 남은 옛 판 {len(pre)}편이 모두 조회수 기준 이상이라 "
                    "건너뛰고 새 편" if pre else f"번갈아 올리기: 다시 올리기 차례였지만 올릴 편이 없어({out.get('note', '')}) 새 편")
        else:
            turn = (f"번갈아 올리기: {last_txt}가 다시 올리기라 오늘은 새 편 차례" if last == "republish" else
                    "번갈아 올리기: 업로드 기록이 없어 새 편부터")
    if ready:
        res = process_episode(ready[0], cfg, dry_run=dry_run, send=send, env=env, sleep=sleep)
        results = pre + [res]
        counts = {s: sum(1 for r in results if r["status"] == s) for s in empty}
        return done({"ok": counts["error"] == 0, "counts": counts, "results": results, "kind": "new",
                     "note": (f"{turn} — " if turn else "") + f"새 편 {_rel(ready[0])}"
                     + (f" · 대기 {len(ready) - 1}편 더" if len(ready) > 1 else "")})
    out = republish_next(cfg, republish_path, finals, today=today, dry_run=dry_run, send=send, env=env, sleep=sleep,
                         skip_hold=True)
    out["kind"] = "republish"
    out["note"] = "올릴 새 편이 없어 다시 올리기 대기열에서 — " + out.get("note", "한 편")
    return done(out)


def load_republish(path: Path) -> dict[str, Any]:
    """config/republish.json. 없으면 빈 dict(다시 올리기·번갈아·비공개 전환 모두 꺼짐)."""
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def republish_count(rec: Record | None) -> int:
    """이 편을 다시 올린 횟수(previous 중 reason == republish)."""
    return 0 if rec is None else sum(1 for p in rec.previous if p.get("reason") == "republish")


def republish_todo(rc: dict[str, Any], finals: Path | None = None) -> list[Path]:
    """다시 올릴 편의 차례. ① 대기열(queue)에서 아직 다시 올리지 않은 편(경로는 저장소 기준), 그다음
    ② 48시간 점검이 지금 판을 flagged 로 적은 편(점검 시각 순, 2026-11-13). ②는 다시 올린 편도 지금 판이 flagged 면
    다시 대상이 되며, 다시 올린 횟수가 auto_sweep.max_republish 에 이르면 빠진다. 비공개 전환이 거절된(그사이 조회수가
    기준을 넘은) 판은 빠진다."""
    manual = [REPO / q for q in rc.get("queue", []) if not republished(read_record(REPO / q))]
    sw_cfg = rc.get("auto_sweep") if isinstance(rc.get("auto_sweep"), dict) else {}
    cap = int(sw_cfg.get("max_republish", 2))
    flagged: list[tuple[str, Path]] = []
    for d in episode_dirs(DEFAULT_FINALS if finals is None else finals):
        rec = read_record(d)
        sw = rec.sweep if rec is not None and isinstance(rec.sweep, dict) else {}
        if sw.get("action") == "flagged" and not sw.get("privatize_refused") and republish_count(rec) < cap:
            flagged.append((str(sw.get("checked_at", "")), d))
    have = {p.resolve() for p in manual}
    return manual + [d for _, d in sorted(flagged, key=lambda x: x[0]) if d.resolve() not in have]


def republish_pending(dir_: Path, republish_path: Path) -> bool:
    """이 편이 다시 올리기 차례를 기다리는가(republish_todo 에 있음). 설정이 없거나 읽지 못하면 False(대기 아님)."""
    try:
        rc = load_republish(republish_path)
        if not rc:
            return False
        todo = republish_todo(rc, dir_.parent)
    except (OSError, ValueError, TypeError, AttributeError):
        return False
    me = dir_.resolve()
    return any(p.resolve() == me for p in todo)


def republish_available(rc: dict[str, Any], today: dt.date, finals: Path | None = None) -> tuple[bool, str]:
    """다시 올리기에 할 일이 있는가(시작일이 지났고 대기열이나 48시간 점검 대상이 남음). 이전 판 조회수는 실제 실행 때 본다."""
    start = dt.date.fromisoformat(rc["start"]) if rc.get("start") else None
    if start is None or today < start:
        return False, f"시작 전({start.isoformat() if start else '시작일 없음'})"
    if not republish_todo(rc, finals):
        return False, "대기열 끝"
    return True, ""


def last_upload_kind(finals: Path) -> str:
    """API 로 올린 기록 중 가장 최근 것이 다시 올리기였으면 'republish', 아니면 'new'. 기록이 없으면 'republish'(새 편 먼저)."""
    return last_upload(finals)[0]


def last_upload(finals: Path) -> tuple[str, Path | None]:
    """(last_upload_kind, 그 기록의 폴더)."""
    latest: tuple[dt.datetime, Record, Path] | None = None
    for d in episode_dirs(finals):
        rec = read_record(d)
        if rec is None or rec.source != "api" or not rec.uploaded_at:
            continue
        try:
            up = dt.datetime.fromisoformat(rec.uploaded_at)
        except ValueError:
            continue
        up = up if up.tzinfo else up.replace(tzinfo=dt.timezone.utc)
        if latest is None or up > latest[0]:
            latest = (up, rec, d)
    if latest is None:
        return "republish", None
    prev = latest[1].previous
    return ("republish" if prev and prev[0].get("reason") == "republish" else "new"), latest[2]


def privatize_targets(rc: dict[str, Any], finals: Path) -> list[dict[str, Any]]:
    """아직 비공개로 돌리지 못한 옛 판. ① 기록 previous 의 다시 올리기 항목(video_id 있고 privatized_at·privatize_refused 없음)
    ② config/republish.json privatize_only(그 편 기록에 privatized_at 이 없을 때)."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for d in episode_dirs(finals):
        rec = read_record(d)
        if rec is None:
            continue
        for i, p in enumerate(rec.previous):
            vid = p.get("video_id")
            if (p.get("reason") == "republish" and vid and not p.get("privatized_at") and not p.get("privatize_refused")
                    and vid not in seen):
                seen.add(vid)
                out.append({"dir": d, "video_id": vid, "kind": "previous", "index": i})
        sw = rec.sweep if isinstance(rec.sweep, dict) else {}
        if (sw.get("action") == "flagged" and rec.video_id and rec.video_id not in seen and not sw.get("privatized_at")
                and not sw.get("privatize_refused")):
            seen.add(rec.video_id)   # ③ 48시간 점검이 flagged 로 적었지만 비공개 전환이 실패한 지금 판(403 등)
            out.append({"dir": d, "video_id": rec.video_id, "kind": "sweep"})
    for item in rc.get("privatize_only", []):
        vid, d = str(item.get("video_id", "")), REPO / str(item.get("episode", ""))
        if not vid or vid in seen:
            continue
        rec = read_record(d)
        if rec is None:
            continue   # 기록 없는 편에는 상태를 남길 곳이 없다 — 대상에서 뺀다
        if rec.video_id == vid and rec.privatized_at:
            continue
        if rec.video_id != vid and any(p.get("video_id") == vid and (p.get("privatized_at") or p.get("privatize_refused"))
                                       for p in rec.previous):
            continue
        seen.add(vid)
        out.append({"dir": d, "video_id": vid, "kind": "only"})
    return out


def privatize_pending(cfg: Config, republish_path: Path, finals: Path, *, dry_run: bool, send: Transport | None = None,
                      env: dict[str, str] | None = None) -> dict[str, Any]:
    """비공개로 돌리지 못한 옛 판을 다시 시도한다(아침 업로드 시작마다, --privatize-pending). 토큰에 youtube.force-ssl 이
    생기면 저절로 따라잡는다. dry_run 이면 목록만. 어떤 실패도 예외로 내보내지 않는다(그날 업로드를 막지 않는다).
    첫 시도가 범위 부족(403)이면 나머지는 시도하지 않고 경고 한 줄만 남긴다."""
    rc = load_republish(republish_path)
    max_views = int(rc.get("min_views", 100))
    protected = frozenset(str(x) for x in rc.get("never_privatize", []))
    items: list[dict[str, Any]] = []
    warnings: list[str] = []
    try:
        targets = privatize_targets(rc, finals)
    except UploadError as ex:
        return {"ok": True, "items": [], "warnings": [f"옛 판 비공개 전환 대상을 읽지 못함: {ex}"]}
    if not targets:
        return {"ok": True, "items": [], "warnings": [], "note": "비공개로 돌릴 옛 판 없음"}
    if dry_run:
        return {"ok": True, "warnings": [], "note": f"비공개로 돌릴 옛 판 {len(targets)}개(dry-run — 바꾸지 않음)",
                "items": [{"dir": _rel(t["dir"]), "video_id": t["video_id"], "url": WATCH_URL_PREFIX + t["video_id"],
                           "result": "dry-run"} for t in targets]}
    try:
        tx = send or urllib_transport(cfg.timeout_sec)
        token = access_token(tx, read_secrets(env))
    except (UploadError, TransportError) as ex:
        return {"ok": True, "items": [], "warnings": [f"옛 판 비공개 전환을 건너뜀(토큰): {ex}"]}
    for n, t in enumerate(targets):
        try:
            rec = read_record(t["dir"])
        except UploadError as ex:
            warnings.append(f"{_rel(t['dir'])}: {ex}")
            continue
        if rec is None:
            continue
        if t["kind"] == "previous":
            entry = rec.previous[t["index"]]
        elif t["kind"] == "sweep":
            entry = rec.sweep if isinstance(rec.sweep, dict) else {}
        elif rec.video_id == t["video_id"]:
            entry = {}
        else:
            entry = next((p for p in rec.previous if p.get("video_id") == t["video_id"]), None)
            if entry is None:
                entry = {"video_id": t["video_id"], "url": WATCH_URL_PREFIX + t["video_id"], "reason": "privatize_only"}
                rec.previous.append(entry)
        pv = privatize_entry(tx, token, cfg, entry, t["video_id"], max_views=max_views, protected=protected)
        pv["dir"] = _rel(t["dir"])
        if t["kind"] in ("only", "sweep") and rec.video_id == t["video_id"] and entry.get("privatized_at"):
            rec.privatized_at = entry["privatized_at"]   # 지금 판 자체를 비공개로 돌림(01 중력파 새 판 · 48시간 점검)
        if pv["result"] == "no-scope" and n == 0:
            warnings.append(PRIVATIZE_HINT + f"범위 부족(403)이라 옛 판 {len(targets)}개를 모두 건너뜁니다. "
                            "토큰을 다시 받으면 다음 아침부터 저절로 처리합니다")
            _log(warnings[-1])
            return {"ok": True, "items": [], "warnings": warnings}
        if t["kind"] in ("previous", "sweep") or rec.video_id != t["video_id"] or entry.get("privatized_at"):
            write_record(t["dir"], rec)
        items.append(pv)
        if pv["result"] in ("privatized", "already-private", "not-found"):
            _log(f"옛 판 {pv['url']} 비공개 전환: {pv['result']} ({pv['dir']})")
        else:
            warnings.append(f"{pv['dir']}: " + (PRIVATIZE_HINT if pv["result"] in ("no-scope", "error") else
                                                "옛 판 비공개 전환 안 함: ") + pv.get("error", ""))
            _log(warnings[-1])
    return {"ok": True, "items": items, "warnings": warnings}


# ───────────────────────────── 48시간 점검(2026-11-13) ─────────────────────────────
# 2026-11-13 사용자: "지금 통계를 보고 업로드 48시간 지났는데 조회수 50회 미만인 애들은 비공개로 바꾸고 업로드 일정에 다시
# 넣어서 재업로드 하는걸로 하자. 뭔가 알고리즘을 못탔기 때문이라고 나는 추정해." · "기본적으로 2~3일 지나면 1000회 정도는
# 나오고 있거든". max_republish(2)는 제작 세션의 안전장치 제안이다(사용자 결정 아님).
#
# 나이는 snippet.publishedAt 부터 잰다. 공식 문서(videos 리소스, 2026-11-13 확인):
#   "The date and time that the video was published. This time might be different than the time that the video was
#    uploaded. For example, if a video is uploaded as a private video and then made public at a later time, this property
#    will specify the time that the video was made public. There are a few special cases: If a video is uploaded as a
#    private video and the video metadata is retrieved by the channel owner, then the property value specifies the date
#    and time that the video was uploaded."
# 이 체계는 모두 비공개로 올리고 주인 토큰으로 읽는다 — 두 문장이 함께 걸리는 경우라 문서만으로는 어느 값이 올지 확정할 수
# 없다. 그래서 publishedAt 이 기록의 uploaded_at 과 거의 같으면(SWEEP_AMBIGUOUS_SEC 안) '올린 시각'일 수 있다고 보고,
# 점검이 처음 공개 상태를 본 시각(public_seen_at)부터 잰다. 늦게 공개한 영상을 일찍 숨기지 않으려는 쪽으로 기운 선택이다.

SWEEP_FINAL = ("flagged", "ok", "exhausted")   # 한 번 적으면 다시 점검하지 않는 판정(그 판의 성적)
SWEEP_AMBIGUOUS_SEC = 600
SWEEP_WARN = "48시간 점검: "


def sweep_settings(rc: dict[str, Any]) -> dict[str, Any] | None:
    """config/republish.json auto_sweep → {'min_age_hours', 'max_republish', 'min_views'}. 없거나 enabled 가 false 면 None."""
    s = rc.get("auto_sweep")
    if s is None:
        return None
    if not isinstance(s, dict):
        raise UploadError("config/republish.json auto_sweep 은 객체여야 합니다")
    unknown = {k for k in s if not k.startswith("_")} - {"enabled", "min_age_hours", "max_republish"}
    if unknown:
        raise UploadError(f"config/republish.json auto_sweep 에 모르는 키: {', '.join(sorted(unknown))}")
    if not isinstance(s.get("enabled", False), bool):
        raise UploadError("config/republish.json auto_sweep.enabled 는 true/false 여야 합니다")
    if not s.get("enabled"):
        return None
    age, cap, views = s.get("min_age_hours", 48), s.get("max_republish", 2), rc.get("min_views", 50)
    if isinstance(age, bool) or not isinstance(age, (int, float)) or age < 1:
        raise UploadError("auto_sweep.min_age_hours 는 1 이상의 수여야 합니다")
    if isinstance(cap, bool) or not isinstance(cap, int) or cap < 0:
        raise UploadError("auto_sweep.max_republish 는 0 이상의 정수여야 합니다")
    if isinstance(views, bool) or not isinstance(views, int) or views < 1:
        raise UploadError("min_views 는 1 이상의 정수여야 합니다")
    return {"min_age_hours": float(age), "max_republish": cap, "min_views": views}


def _parse_time(s: Any) -> dt.datetime | None:
    if not s:
        return None
    try:
        t = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def _repo_key(d: Path) -> str | None:
    try:
        return d.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return None


def sweep_low_views(cfg: Config, republish_path: Path, finals: Path, *, dry_run: bool, send: Transport | None = None,
                    env: dict[str, str] | None = None, now: dt.datetime | None = None) -> dict[str, Any]:
    """48시간 점검. 공개된 지 min_age_hours 가 지났는데 조회수가 min_views 미만인 우리 채널 영상을 비공개로 돌리고
    (set_private — 공개 → 비공개만, 같은 안전 조건) 그 편을 다시 올리기 대상으로 적는다(기록 sweep.action = flagged).

    대상: finals/ 의 모든 기록의 지금 판, 그리고 기록이 없는 편의 previous_ids. never_privatize·privatize_only 영상과
    이미 판정(flagged·ok·exhausted)이 적힌 판·이미 비공개로 돌린 판은 뺀다. 영상마다 차례로
    없음 → 적기만 · 다른 채널 → 건드리지 않음 · 공개가 아님 → 건너뜀(아직 공개 전) · min_age_hours 전 → 건너뜀 ·
    조회수 ≥ min_views → ok(한 번) · 다시 올린 횟수가 max_republish 에 이름 → exhausted(한 번, 공개 그대로) · 그 밖 → flagged.
    비공개 전환이 실패해도(403 등) flagged 로 적고 privatize_pending 이 다음 실행부터 다시 시도한다.
    dry_run 이면 비밀값이 있을 때 읽기(videos.list)만 하고 아무것도 바꾸거나 쓰지 않는다."""
    rc = load_republish(republish_path)
    sc = sweep_settings(rc)
    if sc is None:
        return {"ok": True, "items": [], "warnings": [], "note": "48시간 점검 꺼짐(config/republish.json auto_sweep)"}
    now = now or dt.datetime.now(dt.timezone.utc)
    stamp = now.isoformat(timespec="seconds")
    threshold, min_age, cap = sc["min_views"], sc["min_age_hours"], sc["max_republish"]
    protected = frozenset(str(x) for x in rc.get("never_privatize", []))
    only = {str(o.get("video_id", "")) for o in rc.get("privatize_only", [])}
    previous_ids = {str(k): str(v) for k, v in rc.get("previous_ids", {}).items()}
    warnings: list[str] = []
    cands: list[tuple[Path, str, Record | None]] = []
    for d in episode_dirs(finals):
        try:
            rec = read_record(d)
        except UploadError as ex:
            warnings.append(SWEEP_WARN + str(ex))
            continue
        if rec is None:
            vid = previous_ids.get(_repo_key(d) or "")
            if vid and vid not in protected and vid not in only:
                cands.append((d, vid, None))
            continue
        sw = rec.sweep if isinstance(rec.sweep, dict) else {}
        if (sw.get("action") in SWEEP_FINAL or not rec.video_id or rec.video_id in protected or rec.video_id in only
                or rec.privatized_at):
            continue
        cands.append((d, rec.video_id, rec))
    if not cands:
        return {"ok": True, "items": [], "warnings": warnings, "note": "48시간 점검: 점검할 영상 없음"}
    if not cfg.channel_id:
        return {"ok": True, "items": [], "warnings": warnings + [SWEEP_WARN + "config/youtube.json channel_id 가 없어 하지 않습니다"]}
    try:
        secrets = read_secrets(env)
    except UploadError as ex:
        if dry_run:
            return {"ok": True, "items": [], "warnings": warnings,
                    "note": f"48시간 점검: 대상 {len(cands)}개 — 비밀값이 없어 읽지 않음(dry-run)"}
        raise UploadError(f"48시간 점검을 하지 못함: {ex}") from None
    tx = send or urllib_transport(cfg.timeout_sec)
    token = access_token(tx, secrets)
    info = video_details(tx, token, [c[1] for c in cands])
    items: list[dict[str, Any]] = []
    blocked = ""   # 첫 비공개 전환이 범위 부족(403)이면 나머지는 시도하지 않는다(flagged 로는 적는다)
    for d, vid, rec in cands:
        it: dict[str, Any] = {"dir": _rel(d), "video_id": vid, "url": WATCH_URL_PREFIX + vid}
        items.append(it)
        v = info.get(vid)
        if v is None:
            it["result"] = "not-found"
            continue
        if v["channel_id"] != cfg.channel_id:
            it["result"] = "other-channel"
            continue
        if v["privacy"] != "public":
            it["result"] = "not-public"
            continue
        since, basis = _parse_time(v["published_at"]), "publishedAt"
        if rec is not None and rec.source == "api":
            up = _parse_time(rec.uploaded_at)
            if since is None or (up is not None and (since - up).total_seconds() < SWEEP_AMBIGUOUS_SEC):
                sw = rec.sweep if isinstance(rec.sweep, dict) else {}
                seen = _parse_time(sw.get("public_seen_at"))
                if seen is None:
                    seen = now
                    if not dry_run:
                        rec.sweep = {"action": "watching", "public_seen_at": stamp, "published_at": v["published_at"]}
                        write_record(d, rec)
                since, basis = seen, "public_seen_at"
        if since is None:
            it["result"] = "no-date"
            continue
        age = round((now - since).total_seconds() / 3600, 1)
        it.update(views=v["views"], age_hours=age, age_from=basis)
        if age < min_age:
            it["result"] = "young"
            continue
        snap: dict[str, Any] = {"checked_at": stamp, "views": v["views"], "age_hours": age, "published_at": v["published_at"]}
        if basis == "public_seen_at":
            snap["public_seen_at"] = since.isoformat(timespec="seconds")
        action = ("ok" if v["views"] >= threshold else
                  "exhausted" if rec is not None and republish_count(rec) >= cap else "flagged")
        it["result"] = action
        if dry_run:
            if action == "flagged":
                it["privatize"] = "dry-run"
            continue
        if action == "flagged":
            if blocked:
                snap["privatize_error"] = blocked
                it.update(privatize="no-scope", error=blocked)
            else:
                pv = privatize_entry(tx, token, cfg, snap, vid, max_views=threshold, protected=protected)
                it["privatize"] = pv["result"]
                if pv.get("error"):
                    it["error"] = pv["error"]
                if pv["result"] == "no-scope":
                    blocked = pv.get("error", "403")
                elif pv["result"] == "refused":   # 그사이 조회수가 기준을 넘음 등 — 숨기지 않고 통과로 적는다
                    action = it["result"] = "ok"
                elif pv["result"] == "not-found":
                    it["result"] = "not-found"
                    continue
        if rec is not None:
            rec.sweep = {"action": action, **snap}
            if snap.get("privatized_at"):
                rec.privatized_at = snap["privatized_at"]
            write_record(d, rec)
    if blocked:
        warnings.append(SWEEP_WARN + PRIVATIZE_HINT + blocked + " — flagged 로 적었고 다음 실행부터 다시 시도합니다")
    for it in items:
        if it.get("result") == "flagged" and it.get("privatize") == "error":
            warnings.append(SWEEP_WARN + f"{it['dir']} 비공개 전환 실패(다음 실행에서 다시 시도): {it.get('error', '')}")
    counts: dict[str, int] = {}
    for it in items:
        counts[it["result"]] = counts.get(it["result"], 0) + 1
    note = (f"48시간 점검{'(dry-run — 바꾸지 않음)' if dry_run else ''}: 대상 {len(items)}개 — "
            f"비공개·다시 올리기 {counts.get('flagged', 0)} · 통과 {counts.get('ok', 0)} · 상한 {counts.get('exhausted', 0)} · "
            f"아직 {counts.get('young', 0)} · 공개 전 {counts.get('not-public', 0)}")
    for w in warnings:
        _log(w)
    return {"ok": True, "items": items, "warnings": warnings, "note": note, "counts": counts}


def run_sweep(cfg: Config, republish_path: Path, finals: Path, *, dry_run: bool, send: Transport | None = None,
              env: dict[str, str] | None = None) -> dict[str, Any]:
    """sweep_low_views 를 부르되 어떤 실패도 경고 한 줄로 바꾼다 — 그날 업로드를 막지 않는다."""
    try:
        out = sweep_low_views(cfg, republish_path, finals, dry_run=dry_run, send=send, env=env)
    except Exception as ex:   # noqa: BLE001 — 점검 실패는 업로드를 막지 않는다(2026-11-13)
        out = {"ok": False, "items": [], "warnings": [SWEEP_WARN + f"실패(업로드는 그대로 진행): {type(ex).__name__}: {str(ex)[:300]}"]}
        _log(out["warnings"][-1])
    if out.get("note"):
        _log(out["note"])
    return out


def republish_next(cfg: Config, queue_path: Path, finals: Path, *, today: dt.date, dry_run: bool,
                   send: Transport | None = None, env: dict[str, str] | None = None,
                   sleep: Callable[[float], None] = time.sleep, skip_hold: bool = False) -> dict[str, Any]:
    """대기열(config/republish.json)에서 다음 한 편을 다시 올린다. 아침 업로드(daily_next)가 새 편이 없는 날 부른다.

    쉬는 경우: 시작일 전 · 대기열 끝 · 최근 hold_days 안에 올린 영상이 아직 비공개(사용자가 공개하기 전, hold_days 0 이면 보지 않음).
    이전 판이 그사이 min_views 이상이면 그 편은 건너뛰고 다음 편으로 간다. 한 번에 최대 한 편만 올린다.
    기록이 없는(손으로 올린) 편의 이전 판은 previous_ids 로 안다. 올린 뒤 이전 판을 비공개로 돌린다(process_episode)."""
    rc = json.loads(queue_path.read_text(encoding="utf-8"))
    min_views = int(rc.get("min_views", 100))
    hold_days = int(rc.get("hold_if_private_within_days", 3))
    previous_ids = {str(k): str(v) for k, v in rc.get("previous_ids", {}).items()}
    protected = frozenset(str(x) for x in rc.get("never_privatize", []))
    empty = {"uploaded": 0, "skipped": 0, "dry-run": 0, "error": 0}
    start = dt.date.fromisoformat(rc["start"])
    if today < start:
        return {"ok": True, "counts": empty, "results": [], "note": f"다시 올리기 시작 전입니다({start.isoformat()}부터)"}
    todo = republish_todo(rc, finals)
    if not todo:
        return {"ok": True, "counts": empty, "results": [], "note": "다시 올리기 대기열이 끝났습니다"}
    if not dry_run and not skip_hold and hold_days > 0:
        tx = send or urllib_transport(cfg.timeout_sec)
        waiting = private_waiting(tx, access_token(tx, read_secrets(env)), finals, today, hold_days)
        if waiting:
            return {"ok": True, "counts": empty, "results": [], "note": WAITING_NOTE + ", ".join(waiting)}
        send = tx
    results = []
    for d in todo:
        res = process_episode(d, cfg, dry_run=dry_run, send=send, env=env, sleep=sleep, republish=True,
                              republish_min_views=min_views, privatize_protected=protected,
                              republish_previous_id=previous_ids.get(d.relative_to(REPO).as_posix()))
        results.append(res)
        if res["status"] != "skipped":          # 올렸거나(또는 dry-run·오류) 멈춘다 — 하루 한 편
            break
    counts = {s: sum(1 for r in results if r["status"] == s) for s in empty}
    return {"ok": counts["error"] == 0, "counts": counts, "results": results}


def mark_uploaded(dir_: Path, video_id: str, *, note: str = "") -> Record:
    """이미 손으로 올린 편을 기록해 자동 업로드가 건너뛰게 한다. 영상 md5 를 지금 파일로 계산한다."""
    ep = load_episode(dir_, caption=False, thumbnail=False)
    if read_record(dir_) is not None:
        raise UploadError(f"{_rel(dir_)}: 이미 {RECORD_NAME} 이 있습니다 — 바꾸려면 파일을 지우고 다시")
    vid = video_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,}", vid):
        raise UploadError(f"video id 형식이 아닙니다: {vid!r} (예: dQw4w9WgXcQ)")
    info = parse_upload_md(ep.upload_md.read_text(encoding="utf-8"))
    probe = probe_video(ep.video)
    rec = Record(video_id=vid, url=WATCH_URL_PREFIX + vid, studio_url=STUDIO_URL.format(video_id=vid),
                 uploaded_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), privacy_status="unknown",
                 channel_id="", channel_title=note, video_file=ep.video.name, video_bytes=ep.video.stat().st_size,
                 video_md5=md5_file(ep.video), title=info["title"], description_bytes=_nbytes(info["description"]),
                 contains_synthetic_media=False, made_for_kids=False,
                 duration_sec=probe["duration_sec"] if probe else None, width=probe["width"] if probe else None,
                 height=probe["height"] if probe else None, number=ep.number, slug=ep.slug, source="manual")
    write_record(dir_, rec)
    return rec


def episode_dirs(root: Path) -> list[Path]:
    """finals/ 바로 아래의 <번호>-<slug> 폴더. legacy/·'_'·'.' 폴더는 제외."""
    if not root.is_dir():
        return []
    return sorted(p for p in root.iterdir() if p.is_dir() and EPISODE_DIR_RE.match(p.name))


def list_status(root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for d in episode_dirs(root):
        number, slug = parse_dir_name(d)
        row: dict[str, Any] = {"dir": _rel(d), "number": number, "slug": slug, "title": None}
        up = d / UPLOAD_MD_NAME
        if up.is_file():
            try:
                row["title"] = parse_upload_md(up.read_text(encoding="utf-8"))["title"]
            except UploadError as ex:
                row["error"] = str(ex)
        try:
            rec = read_record(d)
        except UploadError as ex:
            row.update(state="기록 손상", error=str(ex))
            rows.append(row)
            continue
        if rec is not None:
            row.update(state="업로드됨(비공개)" if rec.source == "api" else "업로드됨(수동 기록)", url=rec.url,
                       uploaded_at=rec.uploaded_at, source=rec.source)
        elif up.is_file() and row["title"] and any(d.glob("*.mp4")):
            row["state"] = "대기"
        else:
            row["state"] = "입력 불완전"
        rows.append(row)
    return rows


def whoami(cfg: Config, env: dict[str, str] | None = None, send: Transport | None = None) -> dict[str, Any]:
    tx = send or urllib_transport(cfg.timeout_sec)
    ch = my_channel(tx, access_token(tx, read_secrets(env)))
    match = None if not cfg.channel_id else (ch["id"] == cfg.channel_id)
    return {"channel_id": ch["id"], "channel_title": ch["title"], "config_channel_id": cfg.channel_id, "matches_config": match}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m publish.youtube", description="완성된 쇼츠(finals/)를 유튜브에 비공개로 올린다")
    ap.add_argument("episodes", nargs="*", type=Path, help="finals/<NN>-<slug> 폴더(여러 개 가능)")
    ap.add_argument("--all", action="store_true", help="finals/ 아래 모든 에피소드(이미 올린 것은 건너뜀)")
    ap.add_argument("--finals", type=Path, default=DEFAULT_FINALS, help=f"기본 {DEFAULT_FINALS}")
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help=f"기본 {DEFAULT_CONFIG}")
    ap.add_argument("--dry-run", action="store_true", help="검증만 하고 올리지 않는다(비밀값 불필요)")
    ap.add_argument("--list", action="store_true", help="finals 상태표를 출력한다")
    ap.add_argument("--whoami", action="store_true", help="토큰이 가리키는 채널을 확인한다(할당량 1단위)")
    ap.add_argument("--mark-uploaded", metavar="VIDEO_ID", help="이미 손으로 올린 편의 기록을 만든다(에피소드 하나와 함께)")
    cap = ap.add_mutually_exclusive_group()
    cap.add_argument("--caption", action="store_true", help=".srt 를 자막으로 올린다(기본 config upload_captions)")
    cap.add_argument("--no-caption", action="store_true", help="자막을 올리지 않는다")
    ap.add_argument("--no-thumbnail", action="store_true", help="썸네일을 설정하지 않는다")
    ap.add_argument("--synthetic-media", choices=("yes", "no"), help="합성 미디어 표시(기본 config/meta.json)")
    ap.add_argument("--made-for-kids", choices=("yes", "no"), help="아동용 자가 선언(기본 config/meta.json)")
    ap.add_argument("--not-shorts", action="store_true", help="쇼츠 규격(세로·길이)에 어긋나도 일반 영상으로 올린다")
    ap.add_argument("--allow-reupload", action="store_true", help="기록이 있는데 영상이 바뀐 경우에도 새로 올린다")
    ap.add_argument("--auto", action="store_true", help="push 자동 실행: auto_from_number 이상(또는 meta.json auto_publish) 편만")
    ap.add_argument("--republish", action="store_true", help="지정한 편을 새 영상으로 다시 올린다(이전 판이 min-views 이상이면 건너뜀)")
    ap.add_argument("--republish-next", action="store_true", help="대기열(config/republish.json)에서 다음 한 편을 다시 올린다")
    ap.add_argument("--republish-config", type=Path, default=DEFAULT_REPUBLISH)
    ap.add_argument("--republish-min-views", type=int, default=None, help="기본 config/republish.json min_views")
    ap.add_argument("--privatize-pending", action="store_true",
                    help="다시 올린 편의 옛 판·privatize_only 를 비공개로(공개 → 비공개만). --dry-run 이면 목록만")
    ap.add_argument("--sweep", action="store_true",
                    help="48시간 점검(공개 48시간 뒤 조회수 min_views 미만 → 비공개 + 다시 올리기 대상)과 밀린 비공개 전환만. 올리지 않는다")
    ap.add_argument("--daily-next", action="store_true", help="아침 업로드 한 번: 대기열(config/daily.json)의 새 편, 없으면 다시 올리기 한 편")
    ap.add_argument("--daily-config", type=Path, default=DEFAULT_DAILY)
    ap.add_argument("--today", help="기준일 YYYY-MM-DD(시험용)")
    ap.add_argument("--env-file", type=Path, help="KEY=VALUE 파일(.env)에서 비밀값을 읽는다")
    ap.add_argument("--report", type=Path, help="결과 JSON 을 이 파일에도 쓴다(GitHub Actions 용)")
    a = ap.parse_args(argv)

    env = dict(os.environ)
    out: dict[str, Any] = {"ok": False}
    try:
        if a.env_file:
            load_env_file(a.env_file, env)
        cfg = load_config(a.config)
        if a.list:
            rows = list_status(a.finals)
            for r in rows:
                _log(f"{r['dir']}: {r['state']}" + (f" · 「{r['title']}」" if r.get("title") else "") + (f" · {r['url']}" if r.get("url") else ""))
            out = {"ok": True, "episodes": rows}
        elif a.whoami:
            info = whoami(cfg, env)
            _log(f"채널: {info['channel_title']} ({info['channel_id']})" +
                 ("" if info["matches_config"] is None else (" · 설정과 일치" if info["matches_config"] else " · 설정 channel_id 와 다름!")))
            out = {"ok": True, **info}
        elif a.sweep:
            sw = run_sweep(cfg, a.republish_config, a.finals, dry_run=a.dry_run, env=env)
            catch = privatize_pending(cfg, a.republish_config, a.finals, dry_run=a.dry_run, env=env)
            out = {"ok": bool(sw.get("ok", True)), "kind": "sweep", "note": sw.get("note") or "48시간 점검 실패",
                   "sweep": {k: sw[k] for k in ("items", "note", "counts") if k in sw},
                   "privatize": catch.get("items", []), "warnings": sw.get("warnings", []) + catch.get("warnings", [])}
            for it in out["sweep"].get("items", []):
                _log(f"{it['dir']}: {it['url']} — {it['result']}" + (f" 조회 {it['views']}회 · {it['age_hours']}시간" if "views" in it else "")
                     + (f" · 비공개 전환 {it['privatize']}" if it.get("privatize") else ""))
        elif a.privatize_pending:
            out = privatize_pending(cfg, a.republish_config, a.finals, dry_run=a.dry_run, env=env)
            for it in out.get("items", []):
                _log(f"{it.get('dir', '')}: 옛 판 {it['url']} — {it['result']}" + (f" ({it['error']})" if it.get("error") else ""))
            if out.get("note"):
                _log(out["note"])
        elif a.republish_next or a.daily_next:
            today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(KST).date()
            if a.daily_next:
                out = daily_next(cfg, a.daily_config, a.republish_config, a.finals, today=today, dry_run=a.dry_run, env=env)
            else:
                out = republish_next(cfg, a.republish_config, a.finals, today=today, dry_run=a.dry_run, env=env)
            if out.get("note"):
                _log(out["note"])
        elif a.mark_uploaded:
            if len(a.episodes) != 1:
                raise UploadError("--mark-uploaded 는 에피소드 폴더 하나와 함께 씁니다")
            rec = mark_uploaded(a.episodes[0].resolve(), a.mark_uploaded)
            _log(f"{_rel(a.episodes[0])}: 수동 업로드 기록 작성 {rec.url}")
            out = {"ok": True, "record": asdict(rec)}
        else:
            dirs = [d.resolve() for d in a.episodes]
            if a.all:
                dirs += [d for d in episode_dirs(a.finals) if d.resolve() not in dirs]
            elif not dirs:
                raise UploadError("대상이 없습니다 — finals/<NN>-<slug> 폴더를 주거나 --all 을 쓰십시오")
            if not dirs:
                _log(f"{_rel(a.finals)}: 에피소드 폴더가 없습니다 — 할 일 없음")
            caption = True if a.caption else (False if a.no_caption else None)
            rc = load_republish(a.republish_config) if a.republish else {}
            min_views = a.republish_min_views if a.republish_min_views is not None else int(rc.get("min_views", 100))
            prev_ids = {str(k): str(v) for k, v in rc.get("previous_ids", {}).items()}

            def prev_id(d: Path) -> str | None:
                try:
                    return prev_ids.get(d.resolve().relative_to(REPO).as_posix())
                except ValueError:
                    return None

            results = [process_episode(d, cfg, dry_run=a.dry_run, caption=caption, thumbnail=False if a.no_thumbnail else None,
                                       synthetic=None if a.synthetic_media is None else a.synthetic_media == "yes",
                                       made_for_kids=None if a.made_for_kids is None else a.made_for_kids == "yes",
                                       not_shorts=a.not_shorts, allow_reupload=a.allow_reupload, env=env, auto=a.auto,
                                       republish=a.republish, republish_min_views=min_views,
                                       republish_previous_id=prev_id(d) if a.republish else None,
                                       privatize_protected=frozenset(str(x) for x in rc.get("never_privatize", [])))
                       for d in dirs]
            counts = {s: sum(1 for r in results if r["status"] == s) for s in ("uploaded", "skipped", "dry-run", "error")}
            out = {"ok": counts["error"] == 0, "counts": counts, "results": results}
            if not dirs:
                out["warnings"] = ["finals 에 에피소드 폴더가 없습니다"]
    except (UploadError, TransportError, OSError, ValueError) as ex:
        out = {"ok": False, "error": str(ex)}
        _log(f"실패 — {ex}")
    if a.report:
        a.report.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
