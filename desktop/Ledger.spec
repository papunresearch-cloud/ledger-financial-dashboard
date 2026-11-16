# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

SPEC_DIR = Path(SPECPATH).resolve()
ROOT_DIR = SPEC_DIR.parent

datas = [
    (str(ROOT_DIR / "dist"), "dist"),
    (str(SPEC_DIR / "assets" / "Ledger.ico"), "desktop/assets"),
]
datas += collect_data_files("webview", subdir="lib")
datas += collect_data_files("webview", subdir="js")
datas += collect_data_files("playwright")
datas += collect_data_files("certifi")
datas += collect_data_files("pythonnet")
datas += collect_data_files("clr_loader")

binaries = []
binaries += collect_dynamic_libs("webview")
binaries += collect_dynamic_libs("pythonnet")
binaries += collect_dynamic_libs("clr_loader")

hiddenimports = [
    "backend",
    "backend.server",
    "backend.desktop_storage",
    "backend.company_research",
    "backend.screener_downloader",
    "backend.google_drive_service",
    "googleapiclient",
    "googleapiclient.discovery",
    "google.oauth2.credentials",
    "google_auth_oauthlib.flow",
    "webview.platforms.edgechromium",
    "webview.platforms.winforms",
    "pythonnet",
    "clr",
    "clr_loader",
    "greenlet",
    "pyee",
    "openpyxl",
    "bs4",
    "requests",
    "certifi",
    "urllib3",
]

excludes = [
    "pandas",
    "numpy",
    "scipy",
    "matplotlib",
    "plotly",
    "streamlit",
    "jupyter",
    "jupyterlab",
    "notebook",
    "IPython",
    "ipykernel",
    "pyarrow",
    "yfinance",
    "firebase_admin",
    "grpc",
    "tornado",
    "zmq",
    "selenium",
    "tkinter",
    "PIL",
    "PyQt5",
    "PyQt6",
    "PySide2",
    "PySide6",
    "lxml",
    "duckduckgo_search",
    "altair",
    "pydeck",
    "sklearn",
    "torch",
]

a = Analysis(
    [str(SPEC_DIR / "ledger_desktop.py")],
    pathex=[str(ROOT_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Ledger",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(SPEC_DIR / "assets" / "Ledger.ico"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Ledger",
)
