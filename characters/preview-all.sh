#!/bin/sh
# Render the standard preview set of the stock dodi plus a contact sheet, and
# dodi wearing its accessories as .glb files for gltf-viewer.
#   sh characters/preview-all.sh        (run from dodi-app/, after building)
set -e
cd "$(dirname "$0")/.."
BLEND=characters/dodi/dodi.blend
OUT=characters/dodi/previews

render() {
  blender --background "$BLEND" --python-exit-code 1 --python characters/blender/preview.py -- "$@" >/dev/null
}

HEADPHONES=characters/accessories/headphones/headphones.glb
PARTY_HAT=characters/accessories/party_hat/party_hat.glb
GLASSES=characters/accessories/glasses/glasses.glb
SCARF=characters/accessories/scarf/scarf.glb

render --views hero,front,three-quarter,back
# Clips carry their own expressions.
render --views hero --pose talk:5 --suffix=-talk
render --views hero --pose think:0 --suffix=-think
render --views hero --pose sleep:0 --suffix=-sleep
render --views three-quarter --pose happy:12 --suffix=-happy
render --views three-quarter --pose sad:0 --suffix=-sad
render --views hero,three-quarter --pose deaf:0 --accessory "$HEADPHONES" --suffix=-deaf
render --views three-quarter,front --accessory "$PARTY_HAT" --suffix=-party-hat
render --views three-quarter,front --accessory "$GLASSES" --suffix=-glasses
render --views three-quarter,front --accessory "$SCARF" --suffix=-scarf
render --views hero,three-quarter --pose happy:12 --accessory "$PARTY_HAT" --accessory "$GLASSES" --accessory "$SCARF" --suffix=-dressed

blender --background --python-exit-code 1 --python characters/blender/contact_sheet.py -- \
  "$OUT/overview.png" 4 \
  "$OUT/hero.png" "$OUT/three-quarter.png" "$OUT/front.png" "$OUT/back.png" \
  "$OUT/hero-talk.png" "$OUT/hero-think.png" "$OUT/hero-sleep.png" "$OUT/three-quarter-happy.png" \
  "$OUT/three-quarter-sad.png" "$OUT/hero-deaf.png" "$OUT/three-quarter-deaf.png" \
  "$OUT/three-quarter-party-hat.png" "$OUT/three-quarter-glasses.png" "$OUT/three-quarter-scarf.png" \
  "$OUT/three-quarter-dressed.png" >/dev/null

# Viewers open one file at a time: dodi wearing its accessories, for review only.
blender --background "$BLEND" --python-exit-code 1 --python characters/blender/attach_preview.py -- \
  "$HEADPHONES" --out "$OUT/dodi-headphones.glb" >/dev/null
blender --background "$BLEND" --python-exit-code 1 --python characters/blender/attach_preview.py -- \
  "$PARTY_HAT" "$GLASSES" "$SCARF" --out "$OUT/dodi-dressed.glb" >/dev/null
echo "previews in $OUT"
