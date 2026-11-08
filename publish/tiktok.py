"""틱톡 직접 게시 안내 — 아침마다 틱톡에 올릴 편 하나를 골라 영상 주소와 설명을 내놓는다. 표준 라이브러리만 쓴다.

2026-11-08 사용자 결정: 틱톡은 "반자동: 직접 게시", "새 개인 계정 만들기".
틱톡 공식 게시 API(Content Posting API)는 이 용도로 쓸 수 없다. 개발자 지침(Content Sharing Guidelines,
2026-08-04 갱신)이 "A utility tool to help upload contents to the account(s) you or your team manages"를
허용하지 않는 예로 들고, 심사 전 앱은 게시물이 비공개(SELF_ONLY)로만 올라간다. 그래서 이 도구는 아무것도 올리지 않는다.
아침 업로드(youtube-daily)가 고른 편의 영상 주소(GitHub raw)와 설명을 '공개 전환 대기' 이슈에 넣고, 사용자가 휴대전화로 올린다.

사용법
    python -m publish.tiktok --next --prefer finals/<ep> --report tiktok-report.json   # 오늘 올릴 편 하나
    python -m publish.tiktok --next --dry-run                                         # 고르기만, 기록 안 씀

고르는 순서: 오늘 유튜브에 올린 편(--prefer) → 아직 틱톡 안내를 하지 않은 편(유튜브에 있는 편, 번호 순). 하루 한 편.
기록: finals/<ep>/tiktok_offer.json(안내한 날·영상 md5·설명). 안내한 편은 다시 고르지 않는다(게시 여부는 사람이 한다 —
다시 안내받으려면 기록 파일을 지운다). meta.json 의 tiktok: false 인 편은 고르지 않는다.
설명: upload.md 의 '틱톡 설명' 블록이 있으면 그것, 없으면 '인스타그램(릴스) 설명'(해시태그 5개 이내, AI 안내 금지 규칙 같음).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from publish.instagram import IgConfig, on_youtube, parse_instagram_caption, validate_caption
from publish.instagram import load_config as load_ig_config
from publish.youtube import (DEFAULT_FINALS, REPO, UploadError, _rel, episode_dirs, load_episode, load_meta,
                             md5_file, morning_numbers, parse_dir_name, parse_upload_md, probe_video)

DEFAULT_CONFIG = REPO / "config" / "tiktok.json"
RECORD_NAME = "tiktok_offer.json"
TT_HEADER_RE = re.compile(r"^(#+\s*)?틱톡 설명")
CAPTION_MAX = 2200          # 보수적으로 잡은 설명 길이(틱톡 앱 한도보다 짧게)


@dataclass
class TtConfig:
    enabled: bool = True
    account: str | None = None          # 틱톡 사용자 이름(@ 없이). 비밀 아님. 안내문에 표시만 한다
    hashtags_max: int = 5
    ai_label: bool = True               # 앱에서 'AI 생성 콘텐츠' 표시를 켜라고 안내(2026-11-08 사용자 결정 "켜 둠")


def load_config(path: Path = DEFAULT_CONFIG) -> TtConfig:
    if not path.is_file():
        return TtConfig()
    raw = {k: v for k, v in json.loads(path.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    known = set(TtConfig.__dataclass_fields__)
    unknown = sorted(set(raw) - known - {"schema_version"})
    if unknown:
        raise UploadError(f"{_rel(path)}: 모르는 키 {unknown}")
    raw.pop("schema_version", None)
    return TtConfig(**raw)


def parse_tiktok_caption(text: str) -> str:
    """'틱톡 설명' 머리 다음 ``` 블록. 없으면 인스타그램 설명을 쓴다."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not TT_HEADER_RE.match(line.strip()):
            continue
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j < len(lines) and lines[j].strip().startswith("```"):
            body = []
            for k in range(j + 1, len(lines)):
                if lines[k].strip().startswith("```"):
                    cap = "\n".join(body).strip()
                    if cap:
                        return cap
                    break
                body.append(lines[k])
        raise UploadError("'틱톡 설명' 블록이 비었거나 닫히지 않았습니다")
    return parse_instagram_caption(text)


def check_caption(caption: str, cfg: TtConfig) -> list[str]:
    errs = validate_caption(caption, IgConfig(hashtags_max=cfg.hashtags_max))
    if len(caption) > CAPTION_MAX:
        errs.append(f"설명 {len(caption)}자 — {CAPTION_MAX}자 이내로")
    return errs


@dataclass
class TtRecord:
    offered_at: str
    video_file: str
    video_md5: str
    video_url: str
    title: str
    caption: str
    number: int | None
    slug: str
    account: str | None = None
    note: str = "안내만 했다. 게시는 사람이 틱톡 앱에서 한다."


def read_record(dir_: Path) -> TtRecord | None:
    p = dir_ / RECORD_NAME
    if not p.is_file():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    return TtRecord(**{k: v for k, v in data.items() if k in TtRecord.__dataclass_fields__})


def tt_backlog(finals: Path, morning: set[int] | None = None) -> list[Path]:
    """유튜브에 있고 아직 틱톡 안내를 하지 않은 편, 번호 순."""
    morning = morning_numbers() if morning is None else morning
    return [d.resolve() for d in episode_dirs(finals)
            if read_record(d) is None and load_meta(d).get("tiktok") is not False and on_youtube(d, morning)]


def recently_offered(finals: Path, hours: float) -> bool:
    now = dt.datetime.now(dt.timezone.utc)
    for d in episode_dirs(finals):
        rec = read_record(d)
        if rec and rec.offered_at and (now - dt.datetime.fromisoformat(rec.offered_at)).total_seconds() < hours * 3600:
            return True
    return False


def video_url(video: Path, env: dict[str, str]) -> str:
    """사용자가 휴대전화로 받을 주소. 이 실행 커밋의 GitHub raw(저장소 공개)."""
    rel = video.resolve().relative_to(REPO).as_posix()
    repo, sha = env.get("GITHUB_REPOSITORY") or "doroper98/sci_short", env.get("GITHUB_SHA") or "main"
    return f"https://raw.githubusercontent.com/{repo}/{sha}/{urllib.parse.quote(rel)}"


def tt_next(cfg: TtConfig, finals: Path, *, prefer: list[Path] | None = None, dry_run: bool,
            env: dict[str, str] | None = None, morning: set[int] | None = None) -> dict[str, Any]:
    env = dict(os.environ) if env is None else env
    empty = {"offered": 0, "dry-run": 0, "error": 0}
    if not cfg.enabled:
        return {"ok": True, "counts": empty, "results": [], "note": "config/tiktok.json enabled=false — 틱톡 안내 안 함"}
    morning = morning_numbers() if morning is None else morning
    if not dry_run and recently_offered(finals, 6):
        return {"ok": True, "counts": empty, "results": [], "note": "최근 6시간 안에 안내한 편이 있어 쉽니다(예비 실행)"}
    backlog = tt_backlog(finals, morning)
    first = [p.resolve() for p in (prefer or []) if p.resolve() in backlog]
    first += [d for d in backlog if parse_dir_name(d)[0] in morning and d not in first]   # 유튜브에 올라간 새 편 먼저
    cands = first + [d for d in backlog if d not in first]
    if not cands:
        return {"ok": True, "counts": empty, "results": [], "note": "틱톡에 안내할 편이 없습니다(모두 안내함)"}
    d = cands[0]
    res: dict[str, Any] = {"dir": _rel(d), "status": "error", "warnings": []}
    try:
        ep = load_episode(d, caption=False, thumbnail=False)
        text = ep.upload_md.read_text(encoding="utf-8")
        title = parse_upload_md(text)["title"]
        caption = parse_tiktok_caption(text)
        errs = check_caption(caption, cfg)
        if errs:
            raise UploadError("설명 검사 실패: " + "; ".join(errs))
        probe = probe_video(ep.video)
        url = video_url(ep.video, env)
        res.update(number=ep.number, slug=ep.slug, title=title, caption=caption, video_url=url, account=cfg.account,
                   ai_label=cfg.ai_label, size_mb=round(ep.video.stat().st_size / 1e6, 1),
                   duration_sec=probe["duration_sec"] if probe else None, today=d in first)
        if dry_run:
            res["status"] = "dry-run"
        else:
            rec = TtRecord(offered_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), video_file=ep.video.name,
                           video_md5=md5_file(ep.video), video_url=url, title=title, caption=caption, number=ep.number,
                           slug=ep.slug, account=cfg.account)
            (d / RECORD_NAME).write_text(json.dumps(asdict(rec), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            res["status"] = "offered"
    except (UploadError, OSError, ValueError) as ex:
        res["error"] = str(ex)
    counts = {s: int(res["status"] == s) for s in empty}
    left = len(backlog) - (1 if res["status"] in ("offered", "dry-run") else 0)
    return {"ok": res["status"] != "error", "counts": counts, "results": [res], "note": f"틱톡 안내 · 남은 편 {left}편"}


def instructions_md(r: dict[str, Any]) -> str:
    """이슈 본문에 넣을 안내(휴대전화에서 길게 눌러 복사하기 쉽게 평문, `<` `>` 는 이스케이프)."""
    cap = r.get("caption", "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    acct = f" (@{r['account']})" if r.get("account") else ""
    steps = [f"### 틱톡 — 직접 게시{acct}", "",
             f"1. 영상 받기: [{r.get('slug', '영상')}.mp4 ({r.get('size_mb', '?')} MB)]({r['video_url']}) — 길게 눌러 다운로드 → 사진에 저장",
             "2. 틱톡 앱 → + → 업로드 → 이 영상 → 다음",
             "3. 설명: 아래 글을 길게 눌러 복사해 붙여 넣기",
             "4. 커버: 첫 장면(0초)",
             "5. 더보기 → 'AI 생성 콘텐츠' 켜기" if r.get("ai_label", True) else "5. (AI 표시 끔)",
             "6. 게시", "", "설명:", "", cap, ""]
    return "\n".join(steps)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m publish.tiktok", description="틱톡 직접 게시 안내(아무것도 올리지 않는다)")
    ap.add_argument("--next", action="store_true", help="오늘 틱톡에 올릴 편 하나를 고른다")
    ap.add_argument("--prefer", type=Path, action="append", default=[], help="먼저 고를 편(오늘 유튜브에 올린 편)")
    ap.add_argument("--finals", type=Path, default=DEFAULT_FINALS)
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--dry-run", action="store_true", help="고르기만 하고 기록을 쓰지 않는다")
    ap.add_argument("--report", type=Path, help="결과 JSON 을 이 파일에도 쓴다(GitHub Actions 용)")
    a = ap.parse_args(argv)
    out: dict[str, Any]
    try:
        if not a.next:
            raise UploadError("--next 를 주십시오")
        out = tt_next(load_config(a.config), a.finals, prefer=a.prefer, dry_run=a.dry_run)
        for r in out["results"]:
            print(f"[tiktok] {r['dir']}: {r['status']}" + (f" — {r.get('error')}" if r.get("error") else f" · {r.get('title', '')}"),
                  file=sys.stderr)
        print(f"[tiktok] {out['note']}", file=sys.stderr)
    except (UploadError, OSError, ValueError) as ex:
        out = {"ok": False, "error": str(ex)}
        print(f"[tiktok] 실패 — {ex}", file=sys.stderr)
    if a.report:
        a.report.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
