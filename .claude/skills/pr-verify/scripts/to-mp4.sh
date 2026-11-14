#!/usr/bin/env bash
# Convert Playwright's WebM recordings to MP4 (H.264, yuv420p, faststart) so that
# every browser plays them inline, Safari included. Playwright writes VP8/VP9
# WebM, which Safari and some embedded viewers do not play.
#   to-mp4.sh <in.webm> <out.mp4>
#   to-mp4.sh --dir <dir>   converts every *.webm under <dir> to a sibling .mp4
# Prints each written .mp4 path. Requires ffmpeg with libx264.
set -euo pipefail

convert() {
  # Even dimensions are required by yuv420p; Playwright's sizes usually are, but pad to be safe.
  ffmpeg -nostdin -loglevel error -y -i "$1" \
    -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p \
    -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" -movflags +faststart -an "$2"
  echo "$2"
}

if [ "${1:-}" = "--dir" ]; then
  dir="${2:?usage: to-mp4.sh --dir <dir>}"
  find "$dir" -name '*.webm' -print0 | while IFS= read -r -d '' f; do
    convert "$f" "${f%.webm}.mp4"
  done
else
  convert "${1:?usage: to-mp4.sh <in.webm> <out.mp4>}" "${2:?usage: to-mp4.sh <in.webm> <out.mp4>}"
fi
