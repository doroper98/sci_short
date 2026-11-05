"""Higgsfield 공식 API 클라이언트 (생성 영상 클립을 에피소드 자산으로 받는다).

근거: https://docs.higgsfield.ai/docs (quickstart, authentication, concepts/polling, concepts/billing-and-retention,
models/kling-3/*, models/ltx-2-5/*, models/hailuo-2-3/*) — 2026-10-31 확인.
- 인증: `Authorization: Key <KEY_ID>:<KEY_SECRET>` (환경변수 HF_API_KEY_ID / HF_API_KEY_SECRET, 또는 HF_CREDENTIALS="id:secret").
  키는 환경 secret 으로만 둔다. 저장소·로그·메시지에 쓰지 않는다.
- 제출: POST https://api.higgsfield.ai/<endpoint-id>  → {status: queued, request_id, status_url, cancel_url}
- 상태: GET status_url → completed | failed | nsfw | canceled. 2초에서 10초까지 늘리며 폴링.
- 견적: POST https://api.higgsfield.ai/estimate/<endpoint-id> (같은 본문) → {"usd": "…"}. 실패·nsfw 는 과금 없음.
- 결과 파일은 7일 뒤 삭제되므로 바로 내려받아 assets/generated/<slug>/ 에 둔다(바이너리는 Git 제외, provenance JSON 만 추적).

  python pipeline/genvideo/higgsfield.py estimate --model kling-video/v3.0/std/text-to-video --prompt "…" [--duration 5] [--aspect 9:16]
  python pipeline/genvideo/higgsfield.py generate --slug gravitational-waves --name hook-accretion --model … --prompt "…" [--image-url …] [--sound off]
  python pipeline/genvideo/higgsfield.py status --request-id …
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BASE = "https://api.higgsfield.ai"
TERMINAL = {"completed", "failed", "nsfw", "canceled"}
# 문서에서 확인한 세로(9:16) 지원 영상 엔드포인트. 요금은 estimate 로 매번 확인한다(문서에 단가 표 없음).
MODELS = {
    "kling-video/v3.0/std/text-to-video": {"aspect_ratio": "9:16", "duration": 5, "sound": "off"},
    "kling-video/v3.0/std/image-to-video": {"aspect_ratio": "9:16", "duration": 5, "sound": "off"},
    "kling-video/v3.0/pro/text-to-video": {"aspect_ratio": "9:16", "duration": 5, "sound": "off"},
    "kling-video/v3.0/pro/image-to-video": {"aspect_ratio": "9:16", "duration": 5, "sound": "off"},
    "lightricks/ltx-2.5/text-to-video/pro": {"aspect_ratio": "9:16", "duration": 6, "resolution": "1080p", "generate_audio": False},
    "lightricks/ltx-2.5/image-to-video/pro": {"aspect_ratio": "9:16", "duration": 6, "resolution": "1080p", "generate_audio": False},
    "minimax/hailuo-2.3/standard/text-to-video": {"duration": 6},
}


def credentials() -> str:
    c = os.environ.get("HF_CREDENTIALS")
    if not c:
        kid, sec = os.environ.get("HF_API_KEY_ID"), os.environ.get("HF_API_KEY_SECRET")
        if kid and sec:
            c = f"{kid}:{sec}"
    if not c or ":" not in c:
        sys.exit("Higgsfield 자격 증명 없음: 환경 secret HF_API_KEY_ID / HF_API_KEY_SECRET (또는 HF_CREDENTIALS=id:secret). "
                 "키는 https://console.higgsfield.ai 에서 만든다.")
    return c


def call(method: str, url: str, body: dict | None = None, idem: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Key {credentials()}")
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if idem:
        req.add_header("Idempotency-Key", idem)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:600]
        sys.exit(f"HTTP {e.code} {url}\n{detail}")


def build_body(a: argparse.Namespace) -> dict:
    body = dict(MODELS.get(a.model, {}))
    body["prompt"] = a.prompt
    if a.duration: body["duration"] = a.duration
    if a.aspect and "aspect_ratio" in body: body["aspect_ratio"] = a.aspect
    if a.image_url: body["image_url"] = a.image_url
    if a.sound and "sound" in body: body["sound"] = a.sound
    if a.resolution and "resolution" in body: body["resolution"] = a.resolution
    return body


def poll(status_url: str, timeout_s: float = 1200) -> dict:
    delay, t0 = 2.0, time.monotonic()
    while True:
        st = call("GET", status_url)
        if st.get("status") in TERMINAL:
            return st
        if time.monotonic() - t0 > timeout_s:
            sys.exit(f"시간 초과: {status_url} 마지막 상태 {st.get('status')}")
        print(f"  … {st.get('status')} ({int(time.monotonic() - t0)}s)", flush=True)
        time.sleep(delay + random.uniform(0, 0.5))
        delay = min(delay * 1.5, 10.0)


def download(url: str, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        h = hashlib.sha256()
        while chunk := r.read(1 << 20):
            f.write(chunk); h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("estimate", "generate"):
        p = sub.add_parser(name)
        p.add_argument("--model", required=True, help="endpoint id, 예: kling-video/v3.0/std/text-to-video")
        p.add_argument("--prompt", required=True)
        p.add_argument("--duration", type=int)
        p.add_argument("--aspect", default=None, help="9:16 | 16:9 | 1:1 (모델이 지원할 때)")
        p.add_argument("--image-url", default=None)
        p.add_argument("--sound", default=None, help="on | off (Kling). 우리 영상은 자체 음향을 쓰므로 off 권장")
        p.add_argument("--resolution", default=None)
        if name == "generate":
            p.add_argument("--slug", required=True, help="episodes/<slug>")
            p.add_argument("--name", required=True, help="클립 이름 (파일명)")
            p.add_argument("--no-wait", action="store_true")
    s = sub.add_parser("status"); s.add_argument("--request-id", required=True)
    a = ap.parse_args()

    if a.cmd == "status":
        print(json.dumps(call("GET", f"{BASE}/requests/{a.request_id}/status"), ensure_ascii=False, indent=2)); return 0

    body = build_body(a)
    est = call("POST", f"{BASE}/estimate/{a.model}", body)
    print(f"estimate: {est.get('usd')} USD  model={a.model}  body={json.dumps(body, ensure_ascii=False)}")
    if a.cmd == "estimate":
        return 0

    out_dir = REPO / "assets" / "generated" / a.slug
    prov_path = out_dir / f"{a.name}.json"
    idem = str(uuid.uuid4())
    sub_resp = call("POST", f"{BASE}/{a.model}", body, idem=idem)
    rec = {"schema_version": 1, "service": "higgsfield", "model": a.model, "body": body, "estimate_usd": est.get("usd"),
           "request_id": sub_resp.get("request_id"), "status_url": sub_resp.get("status_url"), "idempotency_key": idem,
           "submitted": datetime.now(timezone.utc).isoformat(timespec="seconds"), "status": sub_resp.get("status"),
           "nature": "AI-generated illustrative clip; not a simulation or observation. Use for mood/hook shots only."}
    out_dir.mkdir(parents=True, exist_ok=True)
    prov_path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
    print(f"submitted: {rec['request_id']}  → {prov_path}")
    if a.no_wait:
        return 0
    st = poll(rec["status_url"])
    rec["status"] = st.get("status"); rec["expires_at"] = st.get("expires_at"); rec["raw_status"] = st
    if st.get("status") != "completed":
        prov_path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
        sys.exit(f"생성 실패: {st.get('status')} {st.get('error') or ''}")
    url = (st.get("video") or {}).get("url") or next((v.get("url") for v in st.get("videos", []) if v.get("url")), None)
    if not url:
        prov_path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
        sys.exit(f"결과에 video url 이 없다: {json.dumps(st)[:400]}")
    dest = out_dir / f"{a.name}.mp4"
    rec["file"] = str(dest.relative_to(REPO)); rec["sha256"] = download(url, dest); rec["source_url"] = url
    prov_path.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
    print(f"saved: {dest}  sha256 {rec['sha256'][:12]}…  (원본 URL 은 7일 뒤 만료)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
