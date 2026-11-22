#!/usr/bin/env bash
# Whole production order for one episode:
#   narrate → stills → render → sfx → mix → finish → hdr → validate
# Usage:  episodes/<slug>/run.sh                 # everything
#         episodes/<slug>/run.sh stills          # one or more named steps, in the order given
#         SKIP_NARRATE=1 episodes/<slug>/run.sh  # reuse outputs/<slug>/narration
#         SKIP_HDR=1 episodes/<slug>/run.sh     # HDR 판을 만들지 않는다(빛나는 것이 정말 없는 편 — 까닭을 brief.md 에)
# Steps: narrate sim stills render sfx mix finish hdr validate   (sim: 55 의 시뮬레이션 장 — 없으면 만든다)
# HDR(2026-11-15 사용자 "다음 편부터 hdr 적용해"): render 가 visual.mp4 와 함께 빛 지도 gain.mp4 를 쓰고(scenes.mjs 의 lit()),
#   hdr 단계가 둘을 합쳐 final/hdr/<slug>.hdr.mp4 를 만든다. 유튜브에는 HDR 판, 인스타·틱톡에는 SDR 판이 올라간다. docs/HDR.md
set -euo pipefail

# ---- environment (edit here) ----
VENV="${VENV:-/home/user/.venv-scishort-render}"    # numpy/scipy/soundfile/fonttools (pipeline/audio/requirements.txt)
[[ -x "$VENV/bin/python" ]] || VENV="$HOME/.venv-scishort-render"
PY="${PY:-$VENV/bin/python}"
NVENV="${NVENV:-/home/user/.venv-scishort}"         # pipeline/narration venv (Supertonic M3, MMS; see pipeline/narration/README.md)
[[ -x "$NVENV/bin/python" ]] || NVENV="$HOME/.venv-scishort"
NARRATE_PY="${NARRATE_PY:-$NVENV/bin/python}"
NODE="${NODE:-node}"
MAX_SEC="${MAX_SEC:-180}"
ALLOW_DEGRADED="${ALLOW_DEGRADED:-0}"                # 1 = internal preview only; never for delivery

# ---- paths derived from the slug ----
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLUG="${SLUG:-$(basename "$HERE")}"
ROOT="${SCISHORT_ROOT:-$(cd "$HERE/../.." && pwd)}"
EP="${EP:-$HERE}"
OUT="${OUT:-$ROOT/outputs/$SLUG}"
NAR="$OUT/narration"
cd "$ROOT"
[[ -x "$PY" ]] || { echo "python venv not found ($PY). Create it: python3 -m venv $VENV && $VENV/bin/pip install -r pipeline/audio/requirements.txt" >&2; exit 2; }
TITLE="${TITLE:-$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["title"])' "$EP/script.json")}"

step_narrate()  { [[ "${SKIP_NARRATE:-0}" == 1 ]] && { echo "narrate: skipped (SKIP_NARRATE=1)"; return; }
                  "$NARRATE_PY" pipeline/narration/narrate.py --script "$EP/script.json" --out "$NAR"; }
# 55: 시뮬레이션 장(outputs/<slug>/sim/A.bin, Git 제외)이 없으면 만든다 — 솔버 약 10분(4 vCPU 한 스레드) + 굳히기 수 초. 있으면 건너뛴다.
step_sim()      { local SD="$OUT/sim"; mkdir -p "$SD"
                  if [[ -f "$SD/A.bin" ]]; then echo "sim: $SD/A.bin 있음 — 건너뜀(다시 만들려면 지우고 run.sh sim)"; return; fi
                  local ARGS; ARGS="$("$NODE" -e "import('$EP/simview.mjs').then(m=>console.log(m.SIM_ARGS.A))" 2>/dev/null | tail -1)"
                  RODS_SIM_PREVIEW=1 "$NODE" "$EP/sim/mpm.mjs" $ARGS --out="$SD/A"
                  "$NODE" "$EP/sim/bake.mjs" --run="$SD/A" --out="$SD/A.bin"; }
step_stills()   { SCISHORT_ROOT="$ROOT" "$NODE" "$EP/render.mjs" --stills --out "$OUT" --timeline "$NAR/timeline.json"; }
step_render()   { SCISHORT_ROOT="$ROOT" "$NODE" "$EP/render.mjs" --video  --out "$OUT" --timeline "$NAR/timeline.json"; }
step_sfx()      { "$PY" pipeline/audio/sfx.py --sound "$EP/sound.json" --timeline "$NAR/timeline.json" \
                    --out "$OUT/sfx.wav" --ambient-out "$OUT/ambient.wav" --events-check "$OUT/events.json" ${NO_MUSIC:+--no-music}; }
step_mix()      { local amb=() mus=(); [[ -f "$OUT/ambient.wav" && -z "${NO_MUSIC:-}" ]] && amb=(--ambient "$OUT/ambient.wav")
                  if [[ -z "${NO_MUSIC:-}" ]]; then
                    local resolved; resolved="$("$PY" pipeline/audio/resolve_music.py "$EP/sound.json" --root "$ROOT")" || exit 3
                    if [[ -n "$resolved" ]]; then eval "$resolved"
                      mus=(--music "$MUSIC_FILE" --music-credit "$MUSIC_CREDIT" --music-under-db "$MUSIC_UNDER_DB" --music-duck-db "$MUSIC_DUCK_DB" --music-start-sec "$MUSIC_START"); fi
                  fi
                  "$PY" pipeline/audio/mix.py --narration "$NAR/narration.wav" --sfx "$OUT/sfx.wav" "${amb[@]}" "${mus[@]}" \
                    --timeline "$NAR/timeline.json" --out "$OUT/mix.wav"; }
step_finish()   { local deg=(); [[ "$ALLOW_DEGRADED" == 1 ]] && deg=(--allow-degraded)
                  "$PY" pipeline/audio/finish.py --visual "$OUT/visual.mp4" --mix "$OUT/mix.wav" --timeline "$NAR/timeline.json" \
                    --captions-srt "$NAR/captions.srt" --out "$OUT/final/$SLUG.mp4" --title "$TITLE" --max-sec "$MAX_SEC" "${deg[@]}"; }
step_hdr()      { [[ "${SKIP_HDR:-0}" == 1 ]] && { echo "hdr: skipped (SKIP_HDR=1) — 유튜브에도 SDR 판이 올라갑니다. 까닭을 brief.md 에 적으세요"; return; }
                  "$PY" pipeline/hdr.py --visual "$OUT/visual.mp4" --gain "$OUT/gain.mp4" --final "$OUT/final/$SLUG.mp4" --out "$OUT/final/hdr/$SLUG.hdr.mp4"; }
step_validate() { local h=(--hdr require); [[ "${SKIP_HDR:-0}" == 1 ]] && h=(--hdr skip)
                  "$PY" pipeline/validate.py "$OUT" --max-sec "$MAX_SEC" "${h[@]}"; }

STEPS=("$@"); [[ ${#STEPS[@]} -eq 0 ]] && STEPS=(narrate sim stills render sfx mix finish hdr validate)
for s in "${STEPS[@]}"; do
  echo "== $s ($SLUG) =="
  start=$(date +%s); "step_$s"; echo "   $s: $(( $(date +%s) - start )) s"
done
echo "done: $OUT/final/$SLUG.mp4 — now watch it and listen on a phone; record what you checked in brief.md (검증 메모)."
