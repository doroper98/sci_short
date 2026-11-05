"""완성된 쇼츠를 유튜브 채널에 **비공개(private)** 로 올리는 도구.

공개 전환은 사용자가 YouTube Studio 에서 직접 한다. 이 도구는 어떤 설정으로도 public·unlisted 로 올리지 않는다.

사용법
    python -m publish.youtube outbox/<episode> --dry-run   # 입력·메타데이터·영상 규격 검증만 (비밀값 불필요)
    python -m publish.youtube outbox/<episode>             # 실제 업로드 (항상 비공개)
    python -m publish.youtube --all                         # outbox/ 아래 미업로드 에피소드 전부
    python -m publish.youtube --whoami                      # 토큰이 가리키는 채널 이름·ID 확인
    python -m publish.youtube --list                        # outbox 상태표

에피소드 폴더 규약 (outbox/README.md)
    final.mp4            세로 쇼츠 원본. 없으면 폴더 안의 유일한 .mp4 를 쓴다.
    description.txt      첫 줄 = 제목(100자 이하), 빈 줄, 그 뒤 = 설명(UTF-8 5000바이트 이하). '<' '>' 금지.
    final.srt            (선택) 한국어 자막 → captions.insert
    meta.json            (선택) 편별 덧씌움: tags, made_for_kids, contains_synthetic_media, category_id, caption, video
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
DEFAULT_OUTBOX = REPO / "outbox"
RECORD_NAME = "youtube_upload.json"
DESCRIPTION_NAME = "description.txt"
META_NAME = "meta.json"
SECRET_ENV: tuple[str, str, str] = ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN")

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
CAPTIONS_URL = "https://www.googleapis.com/upload/youtube/v3/captions"
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
WATCH_URL_PREFIX = "https://youtu.be/"
STUDIO_URL = "https://studio.youtube.com/video/{video_id}/edit"

TITLE_MAX_CHARS = 100          # API 한도(문자)
DESCRIPTION_MAX_BYTES = 5000   # API 한도(UTF-8 바이트) — 한글은 한 글자 3바이트
TAGS_MAX_CHARS = 500
FORBIDDEN_CHARS: tuple[str, str] = ("<", ">")
CHUNK_UNIT = 256 * 1024        # 재개 가능 업로드 조각은 256 KiB 배수(API 규약)
MB = 1024 * 1024
RETRY_STATUS: frozenset[int] = frozenset({500, 502, 503, 504})
META_KEYS: frozenset[str] = frozenset({"tags", "made_for_kids", "contains_synthetic_media", "category_id", "caption", "video"})
TOKEN_EXPIRED_HINT = ("리프레시 토큰이 만료되거나 철회되었습니다(invalid_grant). OAuth 앱이 '테스트 중'이면 7일마다 만료됩니다. "
                      "앱을 프로덕션으로 게시한 뒤 `python -m publish.oauth` 로 새 토큰을 받아 YT_REFRESH_TOKEN 을 바꾸십시오.")


class UploadError(RuntimeError):
    """업로드를 멈춰야 하는 오류. 메시지를 그대로 사용자에게 보인다."""


class TransportError(RuntimeError):
    """네트워크 수준 실패(재시도 대상)."""


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
    shorts_max_sec: float = 180
    chunk_mb: int = 8
    timeout_sec: float = 120
    tries: int = 5
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
    video: Path
    description: Path
    srt: Path | None
    meta: dict[str, Any]


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
    for key in ("made_for_kids", "contains_synthetic_media", "caption"):
        if key in meta and not isinstance(meta[key], bool):
            raise UploadError(f"{p}: {key} 는 true/false 여야 합니다")
    if "tags" in meta and not (isinstance(meta["tags"], list) and all(isinstance(t, str) for t in meta["tags"])):
        raise UploadError(f"{p}: tags 는 문자열 배열이어야 합니다")
    return meta


def load_episode(dir_: Path, caption: bool = True) -> Episode:
    if not dir_.is_dir():
        raise UploadError(f"에피소드 폴더 없음: {dir_}")
    meta = load_meta(dir_)
    if "video" in meta:
        video = dir_ / str(meta["video"])
    elif (dir_ / "final.mp4").is_file():
        video = dir_ / "final.mp4"
    else:
        mp4s = sorted(p for p in dir_.glob("*.mp4") if p.is_file())
        if len(mp4s) != 1:
            raise UploadError(f"{dir_}: final.mp4 가 없고 .mp4 가 {len(mp4s)}개입니다 — final.mp4 로 두거나 meta.json 의 video 로 지정")
        video = mp4s[0]
    if not video.is_file():
        raise UploadError(f"영상 파일 없음: {video}")
    desc = dir_ / DESCRIPTION_NAME
    if not desc.is_file():
        raise UploadError(f"{DESCRIPTION_NAME} 없음: {desc} (첫 줄 제목, 빈 줄, 설명)")
    srt: Path | None = None
    if caption and meta.get("caption", True):
        cand = dir_ / "final.srt"
        srt = cand if cand.is_file() else None
    return Episode(dir=dir_, video=video, description=desc, srt=srt, meta=meta)


def parse_description(text: str) -> tuple[str, str]:
    """description.txt → (제목, 설명). 첫 줄이 제목이다."""
    lines = text.strip("\n").split("\n")
    title = lines[0].strip()
    if not title:
        raise UploadError(f"{DESCRIPTION_NAME} 첫 줄(제목)이 비어 있습니다")
    return title, "\n".join(lines[1:]).strip("\n")


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
    """설정 < meta.json < 명령행 순서로 덧씌운다."""
    title, body = parse_description(ep.description.read_text(encoding="utf-8"))
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
                          "정하거나 meta.json·--made-for-kids 로 지정하십시오. 자세한 설명은 docs/YOUTUBE_UPLOAD.md")
    tags: list[str] = []
    for t in [*cfg.tags, *ep.meta.get("tags", [])]:
        t = t.strip()
        if t and t not in tags:
            tags.append(t)
    return Metadata(title=title, description=body, tags=tags,
                    category_id=str(ep.meta.get("category_id", cfg.category_id)),
                    default_language=cfg.default_language, contains_synthetic_media=syn, made_for_kids=kids)


def validate_metadata(meta: Metadata) -> list[str]:
    """API 가 거부할 값을 업로드 전에 모두 찾는다. 빈 목록이면 통과."""
    errs: list[str] = []
    if len(meta.title) > TITLE_MAX_CHARS:
        errs.append(f"제목 {len(meta.title)}자 — 한도 {TITLE_MAX_CHARS}자")
    if _nbytes(meta.description) > DESCRIPTION_MAX_BYTES:
        errs.append(f"설명 {_nbytes(meta.description)}바이트(UTF-8) — 한도 {DESCRIPTION_MAX_BYTES}바이트(한글 약 1,600자)")
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
        hint = " — 액세스 토큰 거부. 범위(scope)에 youtube.upload·youtube.force-ssl 이 있는지 확인"
    elif r.status == 403 and "insufficientPermissions" in reasons:
        hint = " — 토큰 범위 부족. python -m publish.oauth 로 다시 받으십시오"
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
        raise _api_error(r, "자막 업로드")
    cid = r.json().get("id")
    if not cid:
        raise UploadError("자막 응답에 id 가 없습니다")
    return str(cid)


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


def process_episode(dir_: Path, cfg: Config, *, dry_run: bool, send: Transport | None = None,
                    env: dict[str, str] | None = None, caption: bool = True, synthetic: bool | None = None,
                    made_for_kids: bool | None = None, not_shorts: bool = False, allow_reupload: bool = False,
                    sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
    """에피소드 하나. 결과 dict 의 status: uploaded · skipped · dry-run · error."""
    res: dict[str, Any] = {"dir": _rel(dir_), "status": "error", "warnings": []}
    try:
        ep = load_episode(dir_, caption=caption)
        meta = build_metadata(ep, cfg, synthetic=synthetic, made_for_kids=made_for_kids)
        res["title"] = meta.title
        errs = validate_metadata(meta)
        probe = probe_video(ep.video)
        verrs, vwarns = check_video(probe, cfg, not_shorts=not_shorts)
        errs += verrs
        res["warnings"] += vwarns
        if errs:
            raise UploadError("검증 실패: " + " · ".join(errs))
        size, md5 = ep.video.stat().st_size, md5_file(ep.video)
        _log(f"{_rel(dir_)}: 제목 「{meta.title}」 · 설명 {_nbytes(meta.description)}B · 영상 {size / MB:.1f}MB"
             + (f" · {probe['width']}×{probe['height']} {probe['duration_sec']:.1f}s" if probe else "")
             + f" · 자막 {'있음' if ep.srt else '없음'} · 비공개 · 합성표시={meta.contains_synthetic_media} · 아동용={meta.made_for_kids}")
        prev = read_record(dir_)
        if prev is not None:
            if prev.video_md5 == md5:
                res.update(status="skipped", video_id=prev.video_id, url=prev.url, studio_url=prev.studio_url)
                res["warnings"].append(f"이미 올린 영상(md5 {md5[:8]}) — {prev.url} · 다시 올리지 않음")
                _log(res["warnings"][-1])
                return res
            if not allow_reupload:
                raise UploadError(f"기록({RECORD_NAME})이 있는데 영상 파일이 바뀌었습니다(md5 {prev.video_md5[:8]}→{md5[:8]}). "
                                  "새 편이면 새 폴더에 두고, 교체 업로드가 맞으면 --allow-reupload (기존 영상은 유튜브에 그대로 남습니다)")
            res["warnings"].append(f"기록을 덮어씁니다 — 이전 영상 {prev.url} 은 유튜브에 그대로 남아 있습니다")
        if dry_run:
            res["status"] = "dry-run"
            res["warnings"].append("dry-run — 올리지 않았습니다")
            return res
        secrets = read_secrets(env)
        tx = send or urllib_transport(cfg.timeout_sec)
        token = access_token(tx, secrets)
        ch = my_channel(tx, token)
        if cfg.channel_id and ch["id"] != cfg.channel_id:
            raise UploadError(f"토큰이 가리키는 채널({ch['title']} {ch['id']})이 설정 channel_id({cfg.channel_id})와 다릅니다 — 업로드 중단")
        _log(f"채널: {ch['title']} ({ch['id']})")
        vid = upload_video(tx, cfg, token, ep.video, meta, sleep=sleep, log=_log)
        rec = Record(video_id=vid, url=WATCH_URL_PREFIX + vid, studio_url=STUDIO_URL.format(video_id=vid),
                     uploaded_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), privacy_status="private",
                     channel_id=ch["id"], channel_title=ch["title"], video_file=ep.video.name, video_bytes=size, video_md5=md5,
                     title=meta.title, description_bytes=_nbytes(meta.description),
                     contains_synthetic_media=meta.contains_synthetic_media, made_for_kids=meta.made_for_kids,
                     duration_sec=probe["duration_sec"] if probe else None, width=probe["width"] if probe else None,
                     height=probe["height"] if probe else None)
        write_record(dir_, rec)   # 자막이 실패해도 영상 기록은 남는다
        _log(f"영상 업로드 완료(비공개) {rec.url} · Studio {rec.studio_url}")
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


def episode_dirs(outbox: Path) -> list[Path]:
    """outbox/ 바로 아래 폴더. '_'·'.' 로 시작하는 폴더(예시·임시)는 제외."""
    if not outbox.is_dir():
        return []
    return sorted(p for p in outbox.iterdir() if p.is_dir() and not p.name.startswith(("_", ".")))


def list_status(outbox: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for d in episode_dirs(outbox):
        row: dict[str, Any] = {"dir": _rel(d)}
        desc = d / DESCRIPTION_NAME
        row["title"] = parse_description(desc.read_text(encoding="utf-8"))[0] if desc.is_file() else None
        try:
            rec = read_record(d)
        except UploadError as ex:
            row.update(state="기록 손상", error=str(ex))
            rows.append(row)
            continue
        if rec is not None:
            row.update(state="업로드됨(비공개)", url=rec.url, uploaded_at=rec.uploaded_at, caption=bool(rec.caption_id))
        elif desc.is_file() and (any(d.glob("*.mp4"))):
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
    ap = argparse.ArgumentParser(prog="python -m publish.youtube", description="완성된 쇼츠를 유튜브에 비공개로 올린다")
    ap.add_argument("episodes", nargs="*", type=Path, help="outbox/<episode> 폴더(여러 개 가능)")
    ap.add_argument("--all", action="store_true", help="outbox/ 아래 모든 에피소드(이미 올린 것은 건너뜀)")
    ap.add_argument("--outbox", type=Path, default=DEFAULT_OUTBOX, help=f"기본 {DEFAULT_OUTBOX}")
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help=f"기본 {DEFAULT_CONFIG}")
    ap.add_argument("--dry-run", action="store_true", help="검증만 하고 올리지 않는다(비밀값 불필요)")
    ap.add_argument("--list", action="store_true", help="outbox 상태표를 출력한다")
    ap.add_argument("--whoami", action="store_true", help="토큰이 가리키는 채널을 확인한다(할당량 1단위)")
    ap.add_argument("--no-caption", action="store_true", help="final.srt 가 있어도 자막을 올리지 않는다")
    ap.add_argument("--synthetic-media", choices=("yes", "no"), help="합성 미디어 표시(기본 config/meta.json)")
    ap.add_argument("--made-for-kids", choices=("yes", "no"), help="아동용 자가 선언(기본 config/meta.json)")
    ap.add_argument("--not-shorts", action="store_true", help="쇼츠 규격(세로·길이)에 어긋나도 일반 영상으로 올린다")
    ap.add_argument("--allow-reupload", action="store_true", help="기록이 있는데 영상이 바뀐 경우에도 새로 올린다")
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
            rows = list_status(a.outbox)
            for r in rows:
                _log(f"{r['dir']}: {r['state']}" + (f" · 「{r['title']}」" if r.get("title") else "") + (f" · {r['url']}" if r.get("url") else ""))
            out = {"ok": True, "episodes": rows}
        elif a.whoami:
            info = whoami(cfg, env)
            _log(f"채널: {info['channel_title']} ({info['channel_id']})" +
                 ("" if info["matches_config"] is None else (" · 설정과 일치" if info["matches_config"] else " · 설정 channel_id 와 다름!")))
            out = {"ok": True, **info}
        else:
            dirs = [d.resolve() for d in a.episodes]
            if a.all:
                dirs += [d for d in episode_dirs(a.outbox) if d.resolve() not in dirs]
            elif not dirs:
                raise UploadError("대상이 없습니다 — outbox/<episode> 폴더를 주거나 --all 을 쓰십시오")
            if not dirs:
                _log(f"{_rel(a.outbox)}: 에피소드 폴더가 없습니다 — 할 일 없음")
            results = [process_episode(d, cfg, dry_run=a.dry_run, caption=not a.no_caption,
                                       synthetic=None if a.synthetic_media is None else a.synthetic_media == "yes",
                                       made_for_kids=None if a.made_for_kids is None else a.made_for_kids == "yes",
                                       not_shorts=a.not_shorts, allow_reupload=a.allow_reupload, env=env) for d in dirs]
            counts = {s: sum(1 for r in results if r["status"] == s) for s in ("uploaded", "skipped", "dry-run", "error")}
            out = {"ok": counts["error"] == 0, "counts": counts, "results": results}
            if not dirs:
                out["warnings"] = ["outbox 에 에피소드 폴더가 없습니다"]
    except (UploadError, TransportError, OSError, ValueError) as ex:
        out = {"ok": False, "error": str(ex)}
        _log(f"실패 — {ex}")
    if a.report:
        a.report.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
