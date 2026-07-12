#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ARM_BUILD="$ROOT_DIR/.build/release-arm64"
INTEL_BUILD="$ROOT_DIR/.build/release-x86_64"
UNIVERSAL_DIR="$ROOT_DIR/.build/release-universal"
APP_BUNDLE="$DIST_DIR/Moyu Translate.app"
DMG_PATH="$DIST_DIR/Moyu Translate.dmg"
DMG_STAGE="$ROOT_DIR/.build/dmg-stage"

cd "$ROOT_DIR"
mkdir -p "$DIST_DIR" "$UNIVERSAL_DIR"
swift build -c release --arch arm64 --scratch-path "$ARM_BUILD"
swift build -c release --arch x86_64 --scratch-path "$INTEL_BUILD"

ARM_BIN_DIR="$(swift build -c release --arch arm64 --scratch-path "$ARM_BUILD" --show-bin-path)"
INTEL_BIN_DIR="$(swift build -c release --arch x86_64 --scratch-path "$INTEL_BUILD" --show-bin-path)"
lipo -create \
  "$ARM_BIN_DIR/MoyuTranslate" \
  "$INTEL_BIN_DIR/MoyuTranslate" \
  -output "$UNIVERSAL_DIR/MoyuTranslate"

"$ROOT_DIR/script/stage_app.sh" \
  "$UNIVERSAL_DIR/MoyuTranslate" \
  "$APP_BUNDLE"

rm -rf "$DMG_STAGE" "$DMG_PATH"
mkdir -p "$DMG_STAGE"
cp -R "$APP_BUNDLE" "$DMG_STAGE/Moyu Translate.app"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create \
  -volname "Moyu Translate" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH"
shasum -a 256 "$DMG_PATH" > "$DIST_DIR/Moyu Translate.dmg.sha256"

echo "Created $DMG_PATH"
lipo -archs "$APP_BUNDLE/Contents/MacOS/MoyuTranslate"
