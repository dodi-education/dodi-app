#!/bin/sh
# Render the standard preview set of the stock dodi plus a contact sheet, and
# dodi wearing the headphones as a .glb for gltf-viewer.
#   sh characters/preview-all.sh        (run from dodi-app/, after building)
set -e
cd "$(dirname "$0")/.."
BLEND=characters/dodi/dodi.blend
OUT=characters/dodi/previews

render() {
  blender --background "$BLEND" --python-exit-code 1 --python characters/blender/preview.py -- "$@" >/dev/null
}

HEADPHONES=characters/accessories/headphones/headphones.glb

render --views hero,front,three-quarter,back
# Clips carry their own expressions.
render --views hero --pose talk:5 --suffix=-talk
render --views hero --pose think:0 --suffix=-think
render --views hero --pose sleep:0 --suffix=-sleep
render --views three-quarter --pose happy:12 --suffix=-happy
render --views three-quarter --pose sad:0 --suffix=-sad
render --views hero,three-quarter --pose deaf:0 --accessory "$HEADPHONES" --suffix=-deaf

blender --background --python-exit-code 1 --python characters/blender/contact_sheet.py -- \
  "$OUT/overview.png" 4 \
  "$OUT/hero.png" "$OUT/three-quarter.png" "$OUT/front.png" "$OUT/back.png" \
  "$OUT/hero-talk.png" "$OUT/hero-think.png" "$OUT/hero-sleep.png" "$OUT/three-quarter-happy.png" \
  "$OUT/three-quarter-sad.png" "$OUT/hero-deaf.png" "$OUT/three-quarter-deaf.png" >/dev/null

# Viewers open one file at a time: dodi wearing its accessories, for review only.
blender --background "$BLEND" --python-exit-code 1 --python characters/blender/attach_preview.py -- \
  "$HEADPHONES" --out "$OUT/dodi-headphones.glb" >/dev/null
echo "previews in $OUT"
