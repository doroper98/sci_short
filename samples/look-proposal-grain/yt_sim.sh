#!/usr/bin/env bash
# 유튜브 쇼츠 1080p 압축 흉내 두 가지(2026-11-22 상위 세션 지시) + 인스타 716 폭 흉내. 입력 mp4 옆에 <이름>.yt264.mp4 · .ytvp9.webm · .ig716.mp4
#   samples/look-proposal-grain/yt_sim.sh clip.mp4
set -euo pipefail
in="$1"; b="${in%.mp4}"
ffmpeg -v error -y -i "$in" -an -c:v libx264 -preset medium -b:v 4M -maxrate 5M -bufsize 8M "$b.yt264.mp4"
ffmpeg -v error -y -i "$in" -an -c:v libvpx-vp9 -b:v 2.8M -deadline good -cpu-used 2 -row-mt 1 "$b.ytvp9.webm"
ffmpeg -v error -y -i "$in" -an -vf scale=716:-2 -c:v libx264 -preset medium -b:v 900k -maxrate 1200k -bufsize 2400k "$b.ig716.mp4"
