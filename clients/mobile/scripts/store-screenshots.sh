#!/usr/bin/env bash
# App Store screenshots (macOS, Xcode): installs a `simulator` profile build
# into an iPhone 17 Pro and an iPad 13" Simulator, sets a clean status bar and
# walks through the shot list. You sign in once per device and set each
# screen up; the script opens the screen by deep link where it can, captures
# it and checks the pixel size App Store Connect expects.
#
#   bash store-screenshots.sh [simulator build .tar.gz URL or path]
#
# Output: ~/dodi-screenshots/{iphone,ipad}/NN-name.png
set -euo pipefail

BUILD="${1:-https://expo.dev/artifacts/eas/yide1PAbPO6fqaeRG_ocexHQbqBLGy-LmnNhl32oY90.tar.gz}"
OUT="$HOME/dodi-screenshots"
BUNDLE_ID="app.dodi"

# name | deep link (empty: navigate by hand) | what the screen should show
SHOTS=(
  "01-home|dodi://home|Kid View home: the companion on screen, idle and fully loaded"
  "02-game||Kid View > Games: open a game and play until it looks lively"
  "03-game-studio|dodi://parent/game-studio/new|Game Studio: type a game idea, or start a build and capture while it works"
  "04-memory||Parent area > Kids > Mia > Memory: the memory page with entries"
  "05-discover|dodi://parent/games|Games: scroll so the Discover section is in view"
  "06-ai-providers|dodi://parent/settings/ai-providers|Settings > AI providers with the provider added"
)

# Accepted sizes (portrait) per display class in App Store Connect.
IPHONE_SIZES="1206x2622"
IPAD_SIZES="2064x2752 2048x2732"

command -v xcrun >/dev/null || { echo "xcrun not found: install Xcode first"; exit 1; }
mkdir -p "$OUT/build"

app_path() { find "$OUT/build" -maxdepth 3 -name "*.app" -type d | head -1; }

if [ -z "$(app_path)" ]; then
  echo "Fetching the simulator build"
  if [ -f "$BUILD" ]; then cp "$BUILD" "$OUT/build/app.tar.gz"; else curl -fL "$BUILD" -o "$OUT/build/app.tar.gz"; fi
  tar -xzf "$OUT/build/app.tar.gz" -C "$OUT/build"
fi
APP="$(app_path)"
[ -n "$APP" ] || { echo "No .app in the build archive"; exit 1; }
echo "App: $APP"

# Newest device type whose name matches, e.g. "iPhone 17 Pro Max".
device_type() {
  xcrun simctl list devicetypes | grep -E "$1" | tail -1 | sed -E 's/.*\((com\.apple[^)]*)\).*/\1/'
}

# Reuses the simulator from an earlier run, otherwise creates it.
ensure_device() {
  local name="$1" pattern="$2" udid type
  udid="$(xcrun simctl list devices | grep -E "^ +$name \(" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)"
  if [ -z "$udid" ]; then
    type="$(device_type "$pattern")"
    [ -n "$type" ] || { echo "No device type matches '$pattern' (xcrun simctl list devicetypes)" >&2; exit 1; }
    udid="$(xcrun simctl create "$name" "$type")"
  fi
  echo "$udid"
}

size_of() {
  local w h
  w="$(sips -g pixelWidth "$1" | awk '/pixelWidth/ {print $2}')"
  h="$(sips -g pixelHeight "$1" | awk '/pixelHeight/ {print $2}')"
  echo "${w}x${h}"
}

shoot_device() {
  local label="$1" pattern="$2" sizes="$3" udid dir
  udid="$(ensure_device "dodi-shots-$label" "$pattern")"
  dir="$OUT/$label"
  mkdir -p "$dir"

  echo
  echo "=== $label ($(xcrun simctl list devices | grep "$udid" | sed -E 's/^ +//; s/ \(.*//')) ==="
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" >/dev/null
  open -a DeviceHub 2>/dev/null || open -a Simulator 2>/dev/null || true
  xcrun simctl ui "$udid" appearance light || true
  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100 || true
  xcrun simctl install "$udid" "$APP"
  xcrun simctl launch "$udid" "$BUNDLE_ID" >/dev/null

  echo "Sign in with the reviewer account in the $label Simulator and allow what it asks for."
  read -r -p "Press Enter when you see the app signed in. " _

  local entry name link hint file answer
  for entry in "${SHOTS[@]}"; do
    IFS='|' read -r name link hint <<<"$entry"
    echo
    echo "[$name] $hint"
    if [ -n "$link" ]; then
      xcrun simctl openurl "$udid" "$link" || true
      echo "  Opened $link (tap Open if iOS asks)."
    fi
    read -r -p "  Enter: capture, s: skip " answer
    [ "$answer" = "s" ] && continue
    file="$dir/$name.png"
    xcrun simctl io "$udid" screenshot --type=png "$file" >/dev/null
    local size
    size="$(size_of "$file")"
    if [[ " $sizes " == *" $size "* ]]; then
      echo "  Saved $file ($size)"
    else
      echo "  Saved $file, but $size is not an accepted size ($sizes): check the device model"
    fi
  done
  xcrun simctl status_bar "$udid" clear || true
}

shoot_device iphone "iPhone [0-9]+ Pro \(" "$IPHONE_SIZES"
shoot_device ipad "iPad Pro 13-inch" "$IPAD_SIZES"

echo
echo "Done: $OUT/iphone and $OUT/ipad"
open "$OUT"
