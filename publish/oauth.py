"""유튜브 업로드용 리프레시 토큰을 한 번 받는 도구 — 채널 주인의 PC 에서 브라우저로 실행한다.

    python -m publish.oauth                       # 브라우저가 열리고, 동의 뒤 토큰과 채널 이름을 보여 준다
    python -m publish.oauth --write-env .env      # 토큰 3종을 .env(저장소가 무시하는 파일)에 적는다
    python -m publish.oauth --port 8765 --no-browser

전제
  - Google Cloud 프로젝트에 YouTube Data API v3 가 켜져 있고, OAuth 클라이언트 유형이 **데스크톱 앱**이다
    (루프백 http://127.0.0.1:<port>/ 리디렉션을 별도 등록 없이 허용). 웹 애플리케이션 클라이언트를 쓰려면
    승인된 리디렉션 URI 에 http://127.0.0.1:8765/ 를 넣어야 한다.
  - **장기 토큰 원칙**: OAuth 앱이 '테스트 중'이면 받은 토큰이 7일 뒤 만료된다. 프로덕션으로 게시한 뒤 받은 토큰은
    철회·비밀번호 변경·6개월 미사용 전까지 유지된다. 이 도구는 게시 상태가 프로덕션임을 확인(--production 또는 프롬프트)
    해야 발급을 진행한다. 알고도 7일 토큰을 받으려면 --allow-testing.
  - 동의 화면에서 계정에 채널이 여럿(브랜드 계정)이면 **올릴 채널**을 골라야 한다. 끝에 보여 주는 채널 이름으로 확인한다.

클라이언트 ID·비밀값은 환경 변수 YT_CLIENT_ID·YT_CLIENT_SECRET 또는 프롬프트(비밀값은 가려서)로 받는다.
PKCE(S256)와 state 검증을 쓴다. 받은 값은 요청한 곳(터미널 또는 --write-env 파일) 외에는 어디에도 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import http.server
import json
import os
import secrets as pysecrets
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

from publish.youtube import CHANNELS_URL, TOKEN_URL, UploadError, my_channel, urllib_transport

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
SCOPES = ("https://www.googleapis.com/auth/youtube.upload",      # videos.insert
          "https://www.googleapis.com/auth/youtube.force-ssl")   # captions.insert · channels.list
DEFAULT_PORT = 8765
DONE_HTML = ("<!doctype html><meta charset='utf-8'><title>완료</title>"
             "<body style='font:18px/1.6 system-ui;padding:2rem'>인증이 끝났습니다. 이 창을 닫고 터미널로 돌아가십시오.</body>")
FAIL_HTML = "<!doctype html><meta charset='utf-8'><body style='font:18px/1.6 system-ui;padding:2rem'>인증 실패: {msg}</body>"


def pkce_pair() -> tuple[str, str]:
    verifier = pysecrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def auth_url(client_id: str, redirect_uri: str, state: str, challenge: str) -> str:
    q = {"client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": " ".join(SCOPES),
         "access_type": "offline", "prompt": "consent", "include_granted_scopes": "false", "state": state,
         "code_challenge": challenge, "code_challenge_method": "S256"}
    return AUTH_URL + "?" + urllib.parse.urlencode(q)


class _Handler(http.server.BaseHTTPRequestHandler):
    result: dict[str, str] = {}
    expected_state = ""
    event: threading.Event

    def do_GET(self) -> None:  # noqa: N802
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code, state, err = q.get("code", [""])[0], q.get("state", [""])[0], q.get("error", [""])[0]
        if err or not code:
            msg = err or "code 없음"
        elif state != self.expected_state:
            msg = "state 불일치(다른 탭의 요청?) — 다시 실행"
        else:
            msg = ""
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write((DONE_HTML if not msg else FAIL_HTML.format(msg=msg)).encode("utf-8"))
        type(self).result = {"code": code} if not msg else {"error": msg}
        self.event.set()

    def log_message(self, *a: object) -> None:   # 콘솔에 요청 줄(코드 포함)을 찍지 않는다
        return


def wait_for_code(port: int, state: str, timeout_sec: float) -> str:
    _Handler.expected_state = state
    _Handler.result = {}
    _Handler.event = threading.Event()
    srv = http.server.HTTPServer(("127.0.0.1", port), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        if not _Handler.event.wait(timeout_sec):
            raise UploadError(f"{timeout_sec:.0f}초 안에 브라우저 응답이 없었습니다")
    finally:
        srv.shutdown()
        srv.server_close()
    if "error" in _Handler.result:
        raise UploadError(f"동의 실패: {_Handler.result['error']}")
    return _Handler.result["code"]


def exchange_code(send, client_id: str, client_secret: str, code: str, redirect_uri: str, verifier: str) -> dict:  # noqa: ANN001
    data = urllib.parse.urlencode({"code": code, "client_id": client_id, "client_secret": client_secret,
                                   "redirect_uri": redirect_uri, "grant_type": "authorization_code",
                                   "code_verifier": verifier}).encode("utf-8")
    r = send("POST", TOKEN_URL, {"Content-Type": "application/x-www-form-urlencoded"}, data)
    body = r.json()
    if r.status != 200:
        raise UploadError(f"토큰 교환 실패 HTTP {r.status} error={body.get('error', '?')}: {body.get('error_description', '')}")
    if "refresh_token" not in body:
        raise UploadError("응답에 refresh_token 이 없습니다 — 이미 동의한 앱이면 Google 계정 > 보안 > 서드파티 앱에서 접근을 지운 뒤 다시 실행")
    return body


TESTING_MSG = ("OAuth 앱 게시 상태가 '프로덕션'이어야 장기 토큰이 나옵니다. '테스트 중'이면 7일 뒤 만료됩니다. "
               "Google Cloud 콘솔 > Google 인증 플랫폼 > 대상 > '앱 게시' 뒤 다시 실행하십시오(docs/YOUTUBE_AUTO_UPLOAD.md '장기 토큰 원칙'). "
               "알고도 7일 토큰을 받으려면 --allow-testing")


def confirm_production(*, production: bool, allow_testing: bool, interactive: bool,
                       ask=input, warn=lambda s: print(s, file=sys.stderr)) -> None:  # noqa: ANN001
    """장기 토큰 게이트. --production 이면 통과, --allow-testing 이면 경고 후 통과, 대화식이면 묻고, 아니면 거부."""
    if production:
        return
    if allow_testing:
        warn("[oauth] 경고: 테스트 상태 토큰은 7일 뒤 만료됩니다. 운영용으로 쓰지 마십시오.")
        return
    if interactive:
        ans = ask("Google 인증 플랫폼 > 대상 의 게시 상태가 '프로덕션'입니까? [y/N] ").strip().lower()
        if ans in ("y", "yes"):
            return
    raise UploadError(TESTING_MSG)


def write_env(path: Path, values: dict[str, str]) -> None:
    """KEY=VALUE 를 적는다. 같은 키가 있으면 바꾸고, 파일은 소유자만 읽게 만든다."""
    lines: list[str] = []
    if path.is_file():
        lines = [ln for ln in path.read_text(encoding="utf-8").splitlines()
                 if not any(ln.strip().startswith(k + "=") for k in values)]
    lines += [f"{k}={v}" for k, v in values.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m publish.oauth", description="유튜브 업로드용 리프레시 토큰 발급(루프백 OAuth)")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--no-browser", action="store_true", help="브라우저를 자동으로 열지 않고 주소만 보여 준다")
    ap.add_argument("--write-env", type=Path, help="토큰 3종을 이 KEY=VALUE 파일에 적는다(예: .env)")
    ap.add_argument("--timeout", type=float, default=600, help="브라우저 응답 대기 초(기본 600)")
    ap.add_argument("--production", action="store_true", help="앱 게시 상태가 프로덕션임을 확인했다(묻지 않음)")
    ap.add_argument("--allow-testing", action="store_true", help="테스트 상태(7일 만료) 토큰이라도 받는다 — 운영용 금지")
    a = ap.parse_args(argv)
    try:
        confirm_production(production=a.production, allow_testing=a.allow_testing, interactive=sys.stdin.isatty())
    except UploadError as ex:
        print(f"[oauth] 중단 — {ex}", file=sys.stderr)
        return 2

    client_id = os.environ.get("YT_CLIENT_ID") or input("OAuth 클라이언트 ID: ").strip()
    client_secret = os.environ.get("YT_CLIENT_SECRET") or getpass.getpass("OAuth 클라이언트 비밀값(입력이 보이지 않습니다): ").strip()
    if not client_id or not client_secret:
        print("[oauth] 클라이언트 ID·비밀값이 필요합니다", file=sys.stderr)
        return 1
    redirect_uri = f"http://127.0.0.1:{a.port}/"
    state = pysecrets.token_urlsafe(16)
    verifier, challenge = pkce_pair()
    url = auth_url(client_id, redirect_uri, state, challenge)
    print(f"[oauth] 브라우저에서 채널을 소유한 Google 계정으로 로그인하고, 채널이 여럿이면 **올릴 채널**을 고르십시오.", file=sys.stderr)
    print(f"[oauth] 열리지 않으면 이 주소를 직접 여십시오:\n{url}\n", file=sys.stderr)
    if not a.no_browser:
        webbrowser.open(url)
    try:
        code = wait_for_code(a.port, state, a.timeout)
        send = urllib_transport(60)
        tok = exchange_code(send, client_id, client_secret, code, redirect_uri, verifier)
        ch = my_channel(send, tok["access_token"])
    except UploadError as ex:
        print(f"[oauth] 실패 — {ex}", file=sys.stderr)
        return 1
    print(f"[oauth] 채널: {ch['title']} ({ch['id']}) · 범위: {tok.get('scope', '')}", file=sys.stderr)
    print(f"[oauth] config/youtube.json 의 channel_id 에 넣을 값: {ch['id']}", file=sys.stderr)
    values = {"YT_CLIENT_ID": client_id, "YT_CLIENT_SECRET": client_secret, "YT_REFRESH_TOKEN": tok["refresh_token"]}
    if a.write_env:
        write_env(a.write_env, values)
        print(f"[oauth] {a.write_env} 에 YT_CLIENT_ID·YT_CLIENT_SECRET·YT_REFRESH_TOKEN 을 적었습니다(소유자만 읽기). "
              "이 파일을 커밋하지 마십시오.", file=sys.stderr)
    else:
        print("[oauth] 아래 리프레시 토큰을 GitHub Secrets(YT_REFRESH_TOKEN)·클라우드 환경에 저장하십시오. 채팅·커밋에 붙이지 마십시오.",
              file=sys.stderr)
        print(tok["refresh_token"])
    print(json.dumps({"ok": True, "channel_id": ch["id"], "channel_title": ch["title"]}, ensure_ascii=False), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
