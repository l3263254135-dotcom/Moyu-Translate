#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <binary> <destination-app>" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$1"
APP_BUNDLE="$2"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS" "$APP_RESOURCES"
cp "$BINARY" "$APP_MACOS/MoyuTranslate"
chmod +x "$APP_MACOS/MoyuTranslate"
cp "$ROOT_DIR/Config/Info.plist" "$APP_CONTENTS/Info.plist"
cp -R "$ROOT_DIR/Sources/MoyuTranslate/Resources/." "$APP_RESOURCES/"

if [[ -f "$ROOT_DIR/Assets/AppIcon.icns" ]]; then
  cp "$ROOT_DIR/Assets/AppIcon.icns" "$APP_RESOURCES/AppIcon.icns"
fi

codesign --force --deep --sign - \
  --entitlements "$ROOT_DIR/Config/MoyuTranslate.entitlements" \
  "$APP_BUNDLE"
