#!/usr/bin/env bash
# Build sprint-100m-top20.mp4 (+ poster.jpg, stills.jpg) from data.json / timeline.json.
# Needs: node (with pipeline/render's node_modules installed), python3 + numpy, ffmpeg with libx264 and drawtext,
# fonts in assets/fonts (python pipeline/render/fetch_fonts.py).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="${TMPDIR:-/tmp}/sprint-100m-top20.$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
cd "$HERE"

echo '== model tests'
node --test test_model.mjs 2>&1 | grep -E '^# (pass|fail)|behind'

echo '== label overlap check (every frame until the board)'
node run.mjs check

echo '== events (crossings, footsteps) for the sound'
node run.mjs events "$HERE/events.json"

echo '== picture'
node run.mjs video "$TMP/picture.mp4"

echo '== sound'
python3 sound.py "$HERE/events.json" "$TMP/sound.wav"

echo '== mux'
ffmpeg -y -hide_banner -v warning -i "$TMP/picture.mp4" -i "$TMP/sound.wav" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart \
  "$HERE/sprint-100m-top20.mp4"

echo '== poster (frame 0) and contact sheet'
ffmpeg -y -hide_banner -v error -i "$HERE/sprint-100m-top20.mp4" -frames:v 1 -q:v 2 "$HERE/poster.jpg"
TIMES=(0 0.5 1.2 2.5 5 8 10.4 10.7 11.6 12.8 14.8 17)
ARGS=(); i=0
for t in "${TIMES[@]}"; do
  ffmpeg -y -hide_banner -v error -ss "$t" -i "$HERE/sprint-100m-top20.mp4" -frames:v 1 \
    -vf "scale=360:640,drawtext=text='t=${t}s':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6" "$TMP/s$i.png"
  ARGS+=(-i "$TMP/s$i.png"); i=$((i+1))
done
ffmpeg -y -hide_banner -v error "${ARGS[@]}" -filter_complex \
  "xstack=inputs=12:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0|0_h0+h4|w0_h0+h4|w0+w1_h0+h4|w0+w1+w2_h0+h4" \
  -q:v 3 "$HERE/stills.jpg"

echo '== result'
ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,pix_fmt,sample_rate,channels,bit_rate,duration \
  -show_entries format=duration,size -of compact "$HERE/sprint-100m-top20.mp4"
