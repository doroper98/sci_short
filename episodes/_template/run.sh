#!/usr/bin/env bash
# Whole production order for one episode:
#   narrate → stills → render → sfx → mix → finish → validate
# Usage:  episodes/<slug>/run.sh                 # everything
#         episodes/<slug>/run.sh stills          # one or more named steps, in the order given
#         SKIP_NARRATE=1 episodes/<slug>/run.sh  # reuse outputs/<slug>/narration
# Steps: narrate stills render sfx mix finish validate
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
step_stills()   { SCISHORT_ROOT="$ROOT" "$NODE" "$EP/render.mjs" --stills --out "$OUT" --timeline "$NAR/timeline.json"; }
step_render()   { SCISHORT_ROOT="$ROOT" "$NODE" "$EP/render.mjs" --video  --out "$OUT" --timeline "$NAR/timeline.json"; }
step_sfx()      { "$PY" pipeline/audio/sfx.py --sound "$EP/sound.json" --timeline "$NAR/timeline.json" \
                    --out "$OUT/sfx.wav" --ambient-out "$OUT/ambient.wav" --events-check "$OUT/events.json" ${NO_MUSIC:+--no-music}; }
step_mix()      { local amb=(); [[ -f "$OUT/ambient.wav" && -z "${NO_MUSIC:-}" ]] && amb=(--ambient "$OUT/ambient.wav")
                  "$PY" pipeline/audio/mix.py --narration "$NAR/narration.wav" --sfx "$OUT/sfx.wav" "${amb[@]}" \
                    --timeline "$NAR/timeline.json" --out "$OUT/mix.wav"; }
step_finish()   { local deg=(); [[ "$ALLOW_DEGRADED" == 1 ]] && deg=(--allow-degraded)
                  "$PY" pipeline/audio/finish.py --visual "$OUT/visual.mp4" --mix "$OUT/mix.wav" --timeline "$NAR/timeline.json" \
                    --captions-srt "$NAR/captions.srt" --out "$OUT/final/$SLUG.mp4" --title "$TITLE" --max-sec "$MAX_SEC" "${deg[@]}"; }
step_validate() { "$PY" pipeline/validate.py "$OUT" --max-sec "$MAX_SEC"; }

STEPS=("$@"); [[ ${#STEPS[@]} -eq 0 ]] && STEPS=(narrate stills render sfx mix finish validate)
for s in "${STEPS[@]}"; do
  echo "== $s ($SLUG) =="
  start=$(date +%s); "step_$s"; echo "   $s: $(( $(date +%s) - start )) s"
done
echo "done: $OUT/final/$SLUG.mp4 — now watch it and listen on a phone; record what you checked in brief.md (검증 메모)."
