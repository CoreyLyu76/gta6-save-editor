@echo off
rem 打包成 dist\GTA6SaveEditor\GTA6SaveEditor.exe（免安装目录版）
cd /d "%~dp0"
python -m PyInstaller engine\main.py --name GTA6SaveEditor --noconsole --onedir --noconfirm --clean ^
  --distpath build_out\dist --workpath build_out\work --specpath build_out ^
  --paths engine ^
  --add-data "%~dp0vendor;vendor" --add-data "%~dp0ui;ui" --add-data "%~dp0engine\workers;engine\workers" ^
  --add-data "%~dp0LICENSE;." --add-data "%~dp0README.md;." ^
  --hidden-import app --hidden-import money --hidden-import garlic ^
  --hidden-import sqlite3 --hidden-import ipaddress --hidden-import select --hidden-import uuid --hidden-import dataclasses ^
  --hidden-import tempfile --hidden-import argparse --hidden-import contextlib --hidden-import stat --hidden-import zipfile ^
  --collect-all cryptography
