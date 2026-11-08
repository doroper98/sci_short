"""완성된 쇼츠(finals/<NN>-<slug>/)를 인스타그램 **릴스**로 게시하는 도구. 표준 라이브러리만 쓴다.

인스타 게시 API 에는 비공개·초안 상태가 없다. **게시하는 순간 공개된다**(2026-11-07 메타 공식 문서 확인).
2026-11-07 사용자 결정 "병합 즉시 양쪽": main 병합 push 에서 유튜브(비공개)와 인스타(공개)를 함께 올린다.
그래서 이 도구는 게시 전 검사를 엄격히 한다(계정 잠금, 설명 규칙, 영상 규격, 같은 영상 재게시 금지).

사용법
    python -m publish.instagram finals/<NN>-<slug> --dry-run   # 검증만 (비밀값 불필요)
    python -m publish.instagram finals/<NN>-<slug>             # 실제 게시 (즉시 공개)
    python -m publish.instagram finals/<NN>-<slug> --auto      # push 자동 실행용: auto_from_number 이상 새 편만
    python -m publish.instagram --whoami                        # 토큰이 가리키는 인스타 계정(ID·사용자 이름) 확인
    python -m publish.instagram finals/<ep> --mark-posted <미디어 ID 또는 게시물 주소>   # 손으로 올린 편 기록

흐름(메타 공식 문서 Content Publishing):
    컨테이너 생성  POST /<IG_ID>/media  media_type=REELS, caption, share_to_feed, thumb_offset=0(첫 프레임 = 커버)
    영상 전송      transfer=upload: POST rupload.facebook.com/ig-api-upload/<버전>/<컨테이너>  (파일 직접 전송)
                   transfer=url:    컨테이너 생성 때 video_url(공개 주소, 기본 GitHub raw)
    준비 대기      GET /<컨테이너>?fields=status_code  → FINISHED (ERROR·EXPIRED 면 중단)
    게시           POST /<IG_ID>/media_publish creation_id=<컨테이너>   ← 이 순간 공개
    주소           GET /<미디어>?fields=permalink,shortcode

입력
    upload.md            '인스타그램(릴스) 설명' 머리 다음의 ```text 블록(2026-11-07 사용자 규칙: 해시태그 5개 이내,
                         AI 제작·AI 내레이션·"실제와 다르다" 안내 금지)
    <slug>.mp4           폴더 안의 유일한 .mp4 (유튜브 업로더와 같은 규칙)
    meta.json            (선택) instagram: false → 이 편은 인스타에 올리지 않음. auto_publish: true → 옛 번호도 자동 대상
    instagram_post.json  게시 기록(도구가 씀). 같은 영상(md5)은 다시 게시하지 않는다.

비밀값은 환경 변수 IG_ACCESS_TOKEN 만 읽는다. 값은 로그·기록·저장소에 쓰지 않는다(토큰은 URL 이 아니라 헤더로 보낸다).
계정 ID·사용자 이름은 비밀이 아니므로 config/instagram.json 에 잠근다. 잠금이 없으면 실제 게시를 거부한다.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

from publish.youtube import (DEFAULT_FINALS, MB, REPO, RETRY_STATUS, UPLOAD_MD_NAME, Response, Transport, TransportError,
                             UploadError, _rel, load_env_file, load_episode, md5_file, morning_numbers, parse_upload_md,
                             urllib_transport)

DEFAULT_CONFIG = REPO / "config" / "instagram.json"
RECORD_NAME = "instagram_post.json"
RUPLOAD_HOST = "rupload.facebook.com"
SECRET_ENV = "IG_ACCESS_TOKEN"

IG_HEADER_RE = re.compile(r"^#{0,3}\s*인스타그램.*설명")
HASHTAG_RE = re.compile(r"(?<![\w&])#[^\s#]+")
MENTION_RE = re.compile(r"(?<![\w.])@[A-Za-z0-9._]+")
CAPTION_MAX_CHARS = 2200          # 인스타 캡션 한도
HASHTAG_HARD_MAX = 30             # 인스타 해시태그 한도
MENTION_HARD_MAX = 20
# 2026-11-07 사용자 규칙: "설명내용에 뭐 ai로 만들어서 실제와 다르다느니, ai 나레이션이라느니 하는 설명은 유튜브 인스타 모두 빼"
FORBIDDEN_CAPTION = (re.compile(r"(?<![A-Za-z])AI(?![A-Za-z])", re.I), re.compile("인공지능"), re.compile("음성 ?합성|합성 ?음성"),
                     re.compile("[내나]레이션"), re.compile("실제와 다[르릅]"))

# 릴스 영상 규격(메타 공식 문서 Reel Specifications, 2026-11-07 확인)
REEL_MIN_SEC, REEL_MAX_SEC = 3.0, 15 * 60.0
REEL_MAX_BYTES = 300 * MB
REEL_MAX_COLUMNS = 1920
REEL_FPS = (23.0, 60.0)
REEL_VIDEO_CODECS = {"h264", "hevc"}

TOKEN_HINT = ("인스타 토큰이 만료·무효입니다(오류 190). 인스타그램 로그인 토큰은 60일이면 만료됩니다. "
              "docs/INSTAGRAM_AUTO_POST.md '토큰' 절차대로 다시 발급해 IG_ACCESS_TOKEN 을 바꾸십시오")


# ───────────────────────────── 설정 ─────────────────────────────

@dataclass
class IgConfig:
    enabled: bool = True
    api_host: str = "graph.facebook.com"      # 시스템 사용자·페이스북 로그인. 인스타그램 로그인 토큰이면 graph.instagram.com
    api_version: str = "v27.0"
    transfer: str = "upload"                  # upload = rupload 로 파일 직접 전송, url = 공개 주소(video_url)
    public_base_url: str | None = None        # transfer=url 일 때 영상 주소의 앞부분. 없으면 GitHub raw(GITHUB_REPOSITORY·GITHUB_SHA)
    ig_user_id: str | None = None             # 게시할 인스타 계정 ID(--whoami 로 확인). 없으면 실제 게시 거부
    username: str | None = None               # 같은 계정의 사용자 이름. 토큰 계정과 다르면 게시 중단
    auto_from_number: int = 22                # push 자동 실행은 이 번호 이상만(01~21 은 손으로 올린 편이 섞여 있음)
    share_to_feed: bool = True
    thumb_offset_ms: int = 0                  # 커버 = 0초 프레임(2026-11-07 사용자 원칙: 썸네일은 첫 프레임)
    ai_label: bool = True                     # is_ai_generated(메타 'AI 정보' 표시). 유튜브 합성 표시와 같은 결정 대기
    hashtags_max: int = 5                     # 2026-11-07 사용자 규칙: 해시태그 5개 이내
    poll_sec: float = 30
    wait_sec: float = 900
    timeout_sec: float = 300
    tries: int = 3
    schema_version: int = 1


def load_config(path: Path = DEFAULT_CONFIG) -> IgConfig:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise UploadError(f"설정 파일 없음: {path}") from None
    except ValueError as e:
        raise UploadError(f"설정 파일 JSON 오류: {path}: {e}") from None
    data = {k: v for k, v in raw.items() if not k.startswith("_")}
    unknown = set(data) - set(IgConfig.__dataclass_fields__)
    if unknown:
        raise UploadError(f"설정에 모르는 키: {', '.join(sorted(unknown))} ({path})")
    cfg = IgConfig(**data)
    if cfg.transfer not in ("upload", "url"):
        raise UploadError(f"transfer 는 upload 또는 url 입니다(현재 {cfg.transfer!r})")
    if cfg.api_host not in ("graph.facebook.com", "graph.instagram.com"):
        raise UploadError(f"api_host 는 graph.facebook.com 또는 graph.instagram.com 입니다(현재 {cfg.api_host!r})")
    if cfg.api_host == "graph.instagram.com" and cfg.transfer == "upload":
        raise UploadError("인스타그램 로그인(graph.instagram.com)은 파일 직접 전송(rupload)이 문서에 없습니다 — transfer 를 url 로")
    if not re.fullmatch(r"v\d+\.\d+", cfg.api_version):
        raise UploadError(f"api_version 형식 오류: {cfg.api_version!r} (예: v27.0)")
    return cfg


# ───────────────────────────── 입력 ─────────────────────────────

def parse_instagram_caption(text: str) -> str:
    """upload.md 의 '인스타그램(릴스) 설명 …' 머리 바로 다음 ``` 블록을 캡션으로 읽는다."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not IG_HEADER_RE.match(line.strip()):
            continue
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j >= len(lines) or not lines[j].strip().startswith("```"):
            raise UploadError("'인스타그램(릴스) 설명' 머리 다음에 ```text 블록이 없습니다")
        body: list[str] = []
        for k in range(j + 1, len(lines)):
            if lines[k].strip().startswith("```"):
                caption = "\n".join(body).strip()
                if not caption:
                    raise UploadError("인스타그램 설명 블록이 비어 있습니다")
                return caption
            body.append(lines[k])
        raise UploadError("인스타그램 설명 블록의 닫는 ``` 가 없습니다")
    raise UploadError(f"{UPLOAD_MD_NAME} 에 '인스타그램(릴스) 설명' 블록이 없습니다(finals/INSTAGRAM.md 규칙)")


def validate_caption(caption: str, cfg: IgConfig) -> list[str]:
    errs: list[str] = []
    if len(caption) > CAPTION_MAX_CHARS:
        errs.append(f"캡션 {len(caption)}자 — 한도 {CAPTION_MAX_CHARS}자")
    tags = HASHTAG_RE.findall(caption)
    if len(tags) > min(cfg.hashtags_max, HASHTAG_HARD_MAX):
        errs.append(f"해시태그 {len(tags)}개 — 규칙 {cfg.hashtags_max}개 이내(2026-11-07 사용자 규칙)")
    if len(MENTION_RE.findall(caption)) > MENTION_HARD_MAX:
        errs.append(f"@언급 {MENTION_HARD_MAX}개 초과")
    for pat in FORBIDDEN_CAPTION:
        m = pat.search(caption)
        if m:
            errs.append(f"캡션에 '{m.group(0)}' — AI 제작·내레이션·'실제와 다르다' 안내는 쓰지 않습니다(2026-11-07 사용자 규칙)")
    return errs


def probe_reel(path: Path) -> dict[str, Any] | None:
    """ffprobe 로 릴스 규격 항목을 읽는다. ffprobe 가 없으면 None."""
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
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if v is None:
        raise UploadError(f"{path.name}: 영상 스트림이 없습니다")
    num, _, den = str(v.get("avg_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    return {"width": int(v.get("width", 0)), "height": int(v.get("height", 0)), "fps": round(fps, 3),
            "video_codec": v.get("codec_name"), "audio_codec": a.get("codec_name") if a else None,
            "audio_rate": int(a.get("sample_rate", 0)) if a else 0, "audio_channels": int(a.get("channels", 0)) if a else 0,
            "duration_sec": round(float(info.get("format", {}).get("duration") or v.get("duration") or 0.0), 2)}


def top_atoms(path: Path, limit: int = 64) -> list[str]:
    """MP4 최상위 상자 이름들(moov 가 mdat 앞에 있는지 보려고)."""
    out: list[str] = []
    with path.open("rb") as f:
        pos = 0
        while len(out) < limit:
            f.seek(pos)
            head = f.read(8)
            if len(head) < 8:
                break
            size, typ = int.from_bytes(head[:4], "big"), head[4:8].decode("latin1")
            if size == 1:
                size = int.from_bytes(f.read(8), "big")
            out.append(typ)
            if size < 8:
                break
            pos += size
    return out


def check_reel(path: Path, probe: dict[str, Any] | None) -> tuple[list[str], list[str]]:
    """(오류, 경고). 메타 공식 '릴스 규격'에 어긋나면 게시 전에 멈춘다."""
    errs: list[str] = []
    warns: list[str] = []
    size = path.stat().st_size
    if size > REEL_MAX_BYTES:
        errs.append(f"파일 {size / MB:.0f}MB — 릴스 한도 300MB")
    atoms = top_atoms(path)
    if "moov" in atoms and "mdat" in atoms and atoms.index("moov") > atoms.index("mdat"):
        errs.append("moov 상자가 mdat 뒤에 있습니다 — 릴스는 앞에 있어야 합니다(ffmpeg -movflags +faststart)")
    if probe is None:
        warns.append("ffprobe 없음 — 길이·코덱·프레임률 검사를 생략했습니다")
        return errs, warns
    d = probe["duration_sec"]
    if not REEL_MIN_SEC <= d <= REEL_MAX_SEC:
        errs.append(f"길이 {d:.1f}초 — 릴스는 3초~15분")
    if probe["video_codec"] not in REEL_VIDEO_CODECS:
        errs.append(f"영상 코덱 {probe['video_codec']} — 릴스는 H.264·HEVC")
    if probe["width"] > REEL_MAX_COLUMNS:
        errs.append(f"가로 {probe['width']}픽셀 — 릴스 최대 {REEL_MAX_COLUMNS}")
    if probe["fps"] and not REEL_FPS[0] <= probe["fps"] <= REEL_FPS[1]:
        errs.append(f"프레임률 {probe['fps']:g} — 릴스는 23~60")
    if probe["audio_codec"] is None:
        warns.append("오디오 스트림이 없습니다")
    else:
        if probe["audio_codec"] != "aac":
            errs.append(f"오디오 코덱 {probe['audio_codec']} — 릴스는 AAC")
        if probe["audio_rate"] > 48000:
            errs.append(f"오디오 {probe['audio_rate']}Hz — 릴스 최대 48kHz")
        if probe["audio_channels"] > 2:
            errs.append(f"오디오 {probe['audio_channels']}채널 — 릴스는 모노·스테레오")
    if probe["width"] * 16 != probe["height"] * 9:
        warns.append(f"비율 {probe['width']}×{probe['height']} — 9:16 이 아니면 잘리거나 여백이 생깁니다")
    return errs, warns


def auto_allowed(number: int | None, meta: dict[str, Any], auto_from: int) -> bool:
    """push 자동 실행 대상인가. 새 번호(auto_from 이상)이거나 meta.json auto_publish=true."""
    if meta.get("auto_publish") is True:
        return True
    return number is not None and number >= auto_from


# ───────────────────────────── API ─────────────────────────────

def _graph(cfg: IgConfig, path: str, query: dict[str, str] | None = None) -> str:
    url = f"https://{cfg.api_host}/{cfg.api_version}/{path.lstrip('/')}"
    return url + ("?" + urllib.parse.urlencode(query) if query else "")


def _api_error(r: Response, what: str) -> UploadError:
    try:
        e = r.json().get("error") or {}
    except ValueError:
        e = {}
    code, sub = e.get("code"), e.get("error_subcode")
    msg = str(e.get("error_user_msg") or e.get("message") or "")[:300]
    if code == 190:
        return UploadError(f"{what}: {TOKEN_HINT}")
    hint = ""
    if code in (10, 200) or (isinstance(code, int) and 200 <= code < 300):
        hint = " — 권한 부족: 토큰에 instagram_content_publish(인스타그램 로그인이면 instagram_business_content_publish)가 있는지 확인"
    elif code in (4, 17, 32, 613) or sub == 2207042:
        hint = " — 호출·게시 한도 초과(게시는 24시간 100건). 나중에 다시"
    elif code == 100:
        hint = " — 요청 값 오류(계정 ID·버전·영상 주소 확인)"
    return UploadError(f"{what} 실패 HTTP {r.status} code={code} sub={sub}: {msg}{hint}")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _form(params: dict[str, str]) -> bytes:
    return urllib.parse.urlencode(params).encode("utf-8")


def _call(send: Transport, cfg: IgConfig, method: str, url: str, headers: dict[str, str], data: bytes | None,
          what: str, sleep: Callable[[float], None]) -> Response:
    """5xx·네트워크 오류만 cfg.tries 까지 재시도. 게시(media_publish)에는 쓰지 않는다(중복 게시 위험)."""
    last = ""
    for attempt in range(1, cfg.tries + 1):
        try:
            r = send(method, url, headers, data)
            if r.status not in RETRY_STATUS:
                return r
            last = f"HTTP {r.status}"
        except TransportError as ex:
            last = str(ex)
        if attempt < cfg.tries:
            sleep(float(2 ** attempt))
    raise UploadError(f"{what} 재시도 {cfg.tries}회 실패: {last}")


def whoami(send: Transport, cfg: IgConfig, token: str, sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
    """토큰이 가리키는 인스타 계정. ig_user_id 가 있으면 그 계정을 읽고, 없으면 후보를 찾는다."""
    if cfg.ig_user_id:
        r = _call(send, cfg, "GET", _graph(cfg, cfg.ig_user_id, {"fields": "id,username"}), _auth(token), None, "계정 확인", sleep)
        if r.status != 200:
            raise _api_error(r, "계정 확인")
        j = r.json()
        return {"ig_user_id": str(j.get("id", "")), "username": str(j.get("username", "")), "candidates": []}
    if cfg.api_host == "graph.instagram.com":
        r = _call(send, cfg, "GET", _graph(cfg, "me", {"fields": "user_id,username"}), _auth(token), None, "계정 확인", sleep)
        if r.status != 200:
            raise _api_error(r, "계정 확인")
        j = r.json()
        return {"ig_user_id": str(j.get("user_id") or j.get("id") or ""), "username": str(j.get("username", "")), "candidates": []}
    # 페이스북 쪽 토큰(시스템 사용자·페이지): 연결된 페이지의 인스타 비즈니스 계정을 후보로 보여 준다
    r = _call(send, cfg, "GET", _graph(cfg, "me/accounts", {"fields": "name,instagram_business_account{id,username}"}),
              _auth(token), None, "계정 후보 찾기", sleep)
    if r.status != 200:
        raise _api_error(r, "계정 후보 찾기")
    cands = []
    for page in r.json().get("data") or []:
        ig = page.get("instagram_business_account") or {}
        if ig.get("id"):
            cands.append({"page": page.get("name", ""), "ig_user_id": str(ig["id"]), "username": str(ig.get("username", ""))})
    return {"ig_user_id": "", "username": "", "candidates": cands}


def create_container(send: Transport, cfg: IgConfig, token: str, caption: str, *, video_url: str | None,
                     sleep: Callable[[float], None] = time.sleep) -> str:
    params = {"media_type": "REELS", "caption": caption, "share_to_feed": "true" if cfg.share_to_feed else "false",
              "thumb_offset": str(int(cfg.thumb_offset_ms))}
    if cfg.ai_label:
        params["is_ai_generated"] = "true"
    if video_url:
        params["video_url"] = video_url
    else:
        params["upload_type"] = "resumable"
    r = _call(send, cfg, "POST", _graph(cfg, f"{cfg.ig_user_id}/media"),
              {**_auth(token), "Content-Type": "application/x-www-form-urlencoded"}, _form(params), "컨테이너 생성", sleep)
    if r.status != 200:
        raise _api_error(r, "컨테이너 생성")
    cid = r.json().get("id")
    if not cid:
        raise UploadError("컨테이너 응답에 id 가 없습니다")
    return str(cid)


def rupload(send: Transport, cfg: IgConfig, token: str, container_id: str, video: Path,
            sleep: Callable[[float], None] = time.sleep) -> None:
    """파일 직접 전송(rupload.facebook.com). 한 번에 보낸다(릴스 한도 300MB)."""
    size = video.stat().st_size
    url = f"https://{RUPLOAD_HOST}/ig-api-upload/{cfg.api_version}/{container_id}"
    r = _call(send, cfg, "POST", url, {"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size),
                                       "Content-Type": "application/octet-stream"}, video.read_bytes(), "영상 전송", sleep)
    body: dict[str, Any] = {}
    try:
        body = r.json()
    except ValueError:
        pass
    if r.status != 200 or body.get("success") is not True:
        info = body.get("debug_info") or body.get("error") or {}
        raise UploadError(f"영상 전송 실패 HTTP {r.status}: {str(info)[:300]}")


def container_status(send: Transport, cfg: IgConfig, token: str, container_id: str,
                     sleep: Callable[[float], None] = time.sleep) -> tuple[str, str]:
    r = _call(send, cfg, "GET", _graph(cfg, container_id, {"fields": "status_code,status"}), _auth(token), None,
              "컨테이너 상태", sleep)
    if r.status != 200:
        raise _api_error(r, "컨테이너 상태")
    j = r.json()
    return str(j.get("status_code") or "?"), str(j.get("status") or "")


def wait_container(send: Transport, cfg: IgConfig, token: str, container_id: str,
                   sleep: Callable[[float], None] = time.sleep) -> None:
    """FINISHED 까지 기다린다. 문서 권고는 1분에 한 번 정도 — 기본 30초 간격, 최대 wait_sec."""
    waited = 0.0
    while True:
        code, detail = container_status(send, cfg, token, container_id, sleep)
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise UploadError(f"인스타가 영상을 처리하지 못했습니다({code}: {detail[:200]}). 영상 규격(편집 목록·코덱) 확인")
        if code == "PUBLISHED":
            raise UploadError("컨테이너가 이미 게시되었습니다 — 중복을 막으려고 멈춥니다. 인스타에서 확인")
        if waited >= cfg.wait_sec:
            raise UploadError(f"인스타 처리 대기 {cfg.wait_sec:.0f}초 초과(상태 {code}) — 게시하지 않았습니다")
        _log(f"인스타 처리 대기 — {code} ({waited:.0f}초)")
        sleep(cfg.poll_sec)
        waited += cfg.poll_sec


class PublishUncertain(UploadError):
    """게시 요청의 응답을 받지 못했다 — 게시됐을 수도 있다. 다시 게시하지 않는다."""


def publish(send: Transport, cfg: IgConfig, token: str, container_id: str,
            sleep: Callable[[float], None] = time.sleep) -> str:
    """media_publish — 이 순간 공개된다. 재시도하지 않는다(응답이 없으면 컨테이너 상태로 판단)."""
    r: Response | None = None
    err = ""
    try:
        r = send("POST", _graph(cfg, f"{cfg.ig_user_id}/media_publish"),
                 {**_auth(token), "Content-Type": "application/x-www-form-urlencoded"}, _form({"creation_id": container_id}))
    except TransportError as ex:
        err = str(ex)
    if r is not None and r.status == 200 and r.json().get("id"):
        return str(r.json()["id"])
    if r is not None and r.status not in RETRY_STATUS:
        raise _api_error(r, "게시")
    reason = err if r is None else f"HTTP {r.status}"
    try:
        code, _ = container_status(send, cfg, token, container_id, sleep)
    except UploadError:
        code = "?"
    if code == "FINISHED":
        raise UploadError(f"게시 실패({reason}) — 컨테이너는 아직 게시 전(FINISHED). 다시 실행하면 새로 게시합니다")
    raise PublishUncertain(f"게시 응답 없음({reason}, 컨테이너 상태 {code}) — 게시됐을 수 있어 다시 게시하지 않습니다. 인스타에서 확인")


def media_info(send: Transport, cfg: IgConfig, token: str, media_id: str,
               sleep: Callable[[float], None] = time.sleep) -> dict[str, str]:
    r = _call(send, cfg, "GET", _graph(cfg, media_id, {"fields": "permalink,shortcode,timestamp"}), _auth(token), None,
              "게시물 주소", sleep)
    if r.status != 200:
        raise _api_error(r, "게시물 주소")
    j = r.json()
    return {k: str(j.get(k) or "") for k in ("permalink", "shortcode", "timestamp")}


def public_video_url(video: Path, cfg: IgConfig, env: dict[str, str]) -> str:
    """transfer=url 일 때 인스타가 내려받을 공개 주소. 기본은 이 커밋의 GitHub raw 주소(저장소가 공개일 때)."""
    rel = video.resolve().relative_to(REPO).as_posix()
    if cfg.public_base_url:
        return cfg.public_base_url.rstrip("/") + "/" + urllib.parse.quote(rel)
    repo, sha = env.get("GITHUB_REPOSITORY"), env.get("GITHUB_SHA")
    if not (repo and sha):
        raise UploadError("transfer=url 인데 영상 주소를 만들 수 없습니다 — public_base_url 을 정하거나 GitHub Actions 에서 실행")
    return f"https://raw.githubusercontent.com/{repo}/{sha}/{urllib.parse.quote(rel)}"


# ───────────────────────────── 기록 ─────────────────────────────

@dataclass
class IgRecord:
    media_id: str | None
    permalink: str | None
    posted_at: str
    ig_user_id: str
    username: str
    video_file: str
    video_bytes: int
    video_md5: str
    caption_chars: int
    hashtags: list[str]
    container_id: str | None = None
    shortcode: str | None = None
    transfer: str = ""
    ai_label: bool | None = None
    number: int | None = None
    slug: str = ""
    status: str = "posted"                # posted · uncertain(응답 없음 — 게시됐을 수 있음, 다시 게시하지 않음)
    note: str = ""
    source: str = "api"                   # api · manual(--mark-posted)
    schema_version: int = 1


def read_record(dir_: Path) -> IgRecord | None:
    p = dir_ / RECORD_NAME
    if not p.is_file():
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        return IgRecord(**{k: v for k, v in raw.items() if k in IgRecord.__dataclass_fields__})
    except (ValueError, TypeError) as e:
        raise UploadError(f"{p}: 기록 파일을 읽을 수 없습니다: {e}") from None


def write_record(dir_: Path, rec: IgRecord) -> Path:
    p = dir_ / RECORD_NAME
    p.write_text(json.dumps(asdict(rec), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


# ───────────────────────────── 실행 ─────────────────────────────

def _log(msg: str) -> None:
    print(f"[instagram] {msg}", file=sys.stderr, flush=True)


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def process_episode(dir_: Path, cfg: IgConfig, *, dry_run: bool, auto: bool = False, send: Transport | None = None,
                    env: dict[str, str] | None = None, allow_repost: bool = False,
                    sleep: Callable[[float], None] = time.sleep, morning: set[int] | None = None) -> dict[str, Any]:
    """에피소드 하나. status: posted · skipped · dry-run · error.

    아침 업로드 대기열(config/daily.json)의 편은 push 에서 게시하지 않는다(2026-11-08). 인스타는 게시 즉시 공개라,
    사용자가 유튜브 비공개 판을 보기 전에 밤에 공개되면 안 된다. 언제 게시할지는 인스타 연결 뒤 정한다."""
    env = dict(os.environ) if env is None else env
    res: dict[str, Any] = {"dir": _rel(dir_), "status": "error", "warnings": []}
    try:
        ep = load_episode(dir_, caption=False, thumbnail=False)
        res.update(number=ep.number, slug=ep.slug)
        text = ep.upload_md.read_text(encoding="utf-8")
        res["title"] = parse_upload_md(text)["title"]
        if ep.meta.get("instagram") is False:
            res.update(status="skipped")
            res["warnings"].append("meta.json instagram=false — 인스타에 올리지 않는 편")
            return res
        if auto and not auto_allowed(ep.number, ep.meta, cfg.auto_from_number):
            res.update(status="skipped")
            res["warnings"].append(f"자동 대상 아님(번호 {ep.number} < {cfg.auto_from_number}, meta.json auto_publish 없음) — "
                                   "옛 편은 손으로 올린 것이 섞여 있어 자동 게시하지 않습니다")
            return res
        if auto and ep.number in (morning_numbers() if morning is None else morning):
            res.update(status="skipped")
            res["warnings"].append("아침 업로드 대기열(config/daily.json) 편 — push 에서는 게시하지 않습니다"
                                   "(인스타는 즉시 공개라 사용자가 유튜브 비공개 판을 보기 전에 공개되지 않게)")
            return res
        caption = parse_instagram_caption(text)
        errs = validate_caption(caption, cfg)
        probe = probe_reel(ep.video)
        verrs, vwarns = check_reel(ep.video, probe)
        errs += verrs
        res["warnings"] += vwarns
        if errs:
            raise UploadError("검증 실패: " + " · ".join(errs))
        size, md5 = ep.video.stat().st_size, md5_file(ep.video)
        tags = HASHTAG_RE.findall(caption)
        _log(f"{_rel(dir_)}: 캡션 {len(caption)}자 · 해시태그 {len(tags)}개 · 영상 {size / MB:.1f}MB"
             + (f" · {probe['width']}×{probe['height']} {probe['duration_sec']:.1f}s {probe['fps']:g}fps" if probe else "")
             + f" · 커버 {cfg.thumb_offset_ms}ms 프레임 · AI 표시={cfg.ai_label} · 전송={cfg.transfer} · **즉시 공개**")
        prev = read_record(dir_)
        if prev is not None:
            if prev.video_md5 == md5:
                res.update(status="skipped", media_id=prev.media_id, permalink=prev.permalink)
                res["warnings"].append(f"이미 게시한 영상({prev.status}, {prev.source}) — {prev.permalink or prev.media_id or '주소 미상'}"
                                       " · 다시 게시하지 않음")
                return res
            if not allow_repost:
                raise UploadError(f"기록({RECORD_NAME})이 있는데 영상이 바뀌었습니다(md5 {prev.video_md5[:8]}→{md5[:8]}). "
                                  "인스타는 게시 즉시 공개라 자동으로 다시 올리지 않습니다. 새 게시물로 올리려면 --allow-repost")
            res["warnings"].append(f"기록을 덮어씁니다 — 이전 게시물 {prev.permalink or prev.media_id} 은 그대로 남습니다")
        if not cfg.enabled:
            res.update(status="skipped")
            res["warnings"].append("config/instagram.json enabled=false — 게시하지 않음")
            return res
        if dry_run:
            res["status"] = "dry-run"
            res["warnings"].append("dry-run — 게시하지 않았습니다")
            return res
        if not cfg.ig_user_id:
            raise UploadError("config/instagram.json 의 ig_user_id 가 비어 있습니다 — 게시는 즉시 공개라 계정을 잠근 뒤에만 합니다"
                              "(python -m publish.instagram --whoami 로 확인)")
        token = env.get(SECRET_ENV, "").strip()
        if not token:
            raise UploadError(f"환경 변수 없음: {SECRET_ENV}")
        tx = send or urllib_transport(cfg.timeout_sec)
        acct = whoami(tx, cfg, token, sleep)
        if acct["ig_user_id"] != cfg.ig_user_id or (cfg.username and acct["username"] != cfg.username):
            raise UploadError(f"토큰 계정({acct['username']} {acct['ig_user_id']})이 설정({cfg.username} {cfg.ig_user_id})과 다릅니다 — 게시 중단")
        _log(f"계정: @{acct['username']} ({acct['ig_user_id']})")
        url = public_video_url(ep.video, cfg, env) if cfg.transfer == "url" else None
        cid = create_container(tx, cfg, token, caption, video_url=url, sleep=sleep)
        _log(f"컨테이너 {cid}")
        if cfg.transfer == "upload":
            rupload(tx, cfg, token, cid, ep.video, sleep)
            _log(f"영상 전송 완료 {size / MB:.1f}MB")
        wait_container(tx, cfg, token, cid, sleep)
        rec = IgRecord(media_id=None, permalink=None, posted_at=_now(), ig_user_id=acct["ig_user_id"], username=acct["username"],
                       video_file=ep.video.name, video_bytes=size, video_md5=md5, caption_chars=len(caption), hashtags=tags,
                       container_id=cid, transfer=cfg.transfer, ai_label=cfg.ai_label, number=ep.number, slug=ep.slug)
        try:
            rec.media_id = publish(tx, cfg, token, cid, sleep)
        except PublishUncertain as ex:
            rec.status, rec.note = "uncertain", str(ex)
            write_record(dir_, rec)       # 기록을 남겨 다음 실행이 다시 게시하지 않게 한다
            raise
        write_record(dir_, rec)
        _log(f"게시 완료(공개) 미디어 {rec.media_id}")
        try:
            info = media_info(tx, cfg, token, rec.media_id, sleep)
            rec.permalink, rec.shortcode = info["permalink"] or None, info["shortcode"] or None
            write_record(dir_, rec)
            _log(f"주소 {rec.permalink}")
        except (UploadError, TransportError) as ex:
            res["warnings"].append(f"게시는 됐지만 주소를 읽지 못했습니다: {ex}")
        res.update(status="posted", media_id=rec.media_id, permalink=rec.permalink, username=acct["username"])
        return res
    except (UploadError, TransportError, OSError, ValueError) as ex:
        res["error"] = str(ex)
        _log(f"{_rel(dir_)}: 실패 — {ex}")
        return res


def mark_posted(dir_: Path, ref: str, *, note: str = "") -> IgRecord:
    """이미 손으로 올린 편을 기록해 자동 게시가 건너뛰게 한다. ref 는 미디어 ID 또는 게시물 주소."""
    ep = load_episode(dir_, caption=False, thumbnail=False)
    if read_record(dir_) is not None:
        raise UploadError(f"{_rel(dir_)}: 이미 {RECORD_NAME} 이 있습니다 — 바꾸려면 파일을 지우고 다시")
    ref = ref.strip()
    media_id = permalink = None
    if re.match(r"https://(www\.)?instagram\.com/(reel|p)/[\w-]+/?", ref):
        permalink = ref
    elif re.fullmatch(r"\d{6,}", ref):
        media_id = ref
    else:
        raise UploadError(f"미디어 ID(숫자) 또는 https://www.instagram.com/reel/… 주소가 아닙니다: {ref!r}")
    rec = IgRecord(media_id=media_id, permalink=permalink, posted_at=_now(), ig_user_id="", username=note,
                   video_file=ep.video.name, video_bytes=ep.video.stat().st_size, video_md5=md5_file(ep.video),
                   caption_chars=0, hashtags=[], number=ep.number, slug=ep.slug, source="manual")
    write_record(dir_, rec)
    return rec


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m publish.instagram", description="완성된 쇼츠(finals/)를 인스타 릴스로 게시한다(즉시 공개)")
    ap.add_argument("episodes", nargs="*", type=Path, help="finals/<NN>-<slug> 폴더(여러 개 가능)")
    ap.add_argument("--auto", action="store_true", help="자동 실행: auto_from_number 이상(또는 meta.json auto_publish) 편만")
    ap.add_argument("--finals", type=Path, default=DEFAULT_FINALS)
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--dry-run", action="store_true", help="검증만 하고 게시하지 않는다(비밀값 불필요)")
    ap.add_argument("--whoami", action="store_true", help="토큰이 가리키는 인스타 계정을 확인한다")
    ap.add_argument("--mark-posted", metavar="ID_OR_URL", help="이미 손으로 올린 편의 기록을 만든다(에피소드 하나와 함께)")
    ap.add_argument("--allow-repost", action="store_true", help="기록이 있는데 영상이 바뀐 경우에도 새 게시물로 올린다")
    ap.add_argument("--env-file", type=Path, help="KEY=VALUE 파일(.env)에서 비밀값을 읽는다")
    ap.add_argument("--report", type=Path, help="결과 JSON 을 이 파일에도 쓴다(GitHub Actions 용)")
    a = ap.parse_args(argv)

    env = dict(os.environ)
    out: dict[str, Any] = {"ok": False}
    try:
        if a.env_file:
            load_env_file(a.env_file, env)
        cfg = load_config(a.config)
        if a.whoami:
            token = env.get(SECRET_ENV, "").strip()
            if not token:
                raise UploadError(f"환경 변수 없음: {SECRET_ENV}")
            info = whoami(urllib_transport(cfg.timeout_sec), cfg, token)
            if info["ig_user_id"]:
                match = (info["ig_user_id"] == cfg.ig_user_id and (not cfg.username or info["username"] == cfg.username)) \
                    if cfg.ig_user_id else None
                _log(f"계정: @{info['username']} ({info['ig_user_id']})" +
                     ("" if match is None else (" · 설정과 일치" if match else " · 설정과 다름!")))
                out = {"ok": match is not False, **info, "config_ig_user_id": cfg.ig_user_id, "matches_config": match}
            else:
                for c in info["candidates"]:
                    _log(f"후보: @{c['username']} ({c['ig_user_id']}) — 페이지 「{c['page']}」")
                if not info["candidates"]:
                    _log("연결된 인스타 비즈니스 계정을 찾지 못했습니다 — 페이지 연결·토큰 권한 확인")
                out = {"ok": bool(info["candidates"]), **info, "config_ig_user_id": cfg.ig_user_id, "matches_config": None}
        elif a.mark_posted:
            if len(a.episodes) != 1:
                raise UploadError("--mark-posted 는 에피소드 폴더 하나와 함께 씁니다")
            rec = mark_posted(a.episodes[0].resolve(), a.mark_posted)
            _log(f"{_rel(a.episodes[0])}: 수동 게시 기록 작성 {rec.permalink or rec.media_id}")
            out = {"ok": True, "record": asdict(rec)}
        else:
            dirs = [d.resolve() for d in a.episodes]
            if not dirs:
                raise UploadError("대상이 없습니다 — finals/<NN>-<slug> 폴더를 주십시오(인스타는 전체 게시 옵션이 없습니다)")
            results = [process_episode(d, cfg, dry_run=a.dry_run, auto=a.auto, env=env, allow_repost=a.allow_repost) for d in dirs]
            counts = {s: sum(1 for r in results if r["status"] == s) for s in ("posted", "skipped", "dry-run", "error")}
            out = {"ok": counts["error"] == 0, "counts": counts, "results": results}
    except (UploadError, TransportError, OSError, ValueError) as ex:
        out = {"ok": False, "error": str(ex)}
        _log(f"실패 — {ex}")
    if a.report:
        a.report.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
