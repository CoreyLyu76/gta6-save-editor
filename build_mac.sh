#!/bin/bash
# 打包成 build_out/dist/GTA6SaveEditor.app 和 GTA6SaveEditor-mac.zip（架构跟随所用 Python）
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
PY="${PYTHON:-python3}"
[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/pip install -q -r requirements.txt pyinstaller

.venv/bin/python -m PyInstaller engine/main.py --name GTA6SaveEditor --windowed --onedir --noconfirm --clean \
  --osx-bundle-identifier io.github.coreylyu76.gta6saveeditor \
  --distpath build_out/dist --workpath build_out/work --specpath build_out \
  --paths "$ROOT/engine" \
  --add-data "$ROOT/vendor:vendor" --add-data "$ROOT/ui:ui" --add-data "$ROOT/engine/workers:engine/workers" \
  --add-data "$ROOT/LICENSE:." --add-data "$ROOT/README.md:." \
  --hidden-import app --hidden-import money --hidden-import garlic \
  --hidden-import sqlite3 --hidden-import ipaddress --hidden-import select --hidden-import uuid --hidden-import dataclasses \
  --hidden-import tempfile --hidden-import argparse --hidden-import contextlib --hidden-import stat --hidden-import zipfile \
  --collect-all cryptography

APP=build_out/dist/GTA6SaveEditor.app
PLIST="$APP/Contents/Info.plist"
# 界面在浏览器里，App 本身不进 Dock；再次双击会重新打开页面
plutil -replace LSUIElement -bool true "$PLIST"
plutil -replace NSLocalNetworkUsageDescription -string "Finds your PS5 and moves your save over your home network." "$PLIST"
codesign --force --deep --sign - "$APP"

rm -f build_out/dist/GTA6SaveEditor-mac.zip
ditto -c -k --keepParent "$APP" build_out/dist/GTA6SaveEditor-mac.zip
echo "Built $APP"
