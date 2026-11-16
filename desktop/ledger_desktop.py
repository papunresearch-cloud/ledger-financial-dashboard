"""Standalone Windows desktop shell for Ledger (pywebview + local HTTP backend)."""
from __future__ import annotations

import ctypes
import os
import sys
import threading
from pathlib import Path

# Ensure repo root is importable when launched as `python desktop/ledger_desktop.py`
if not getattr(sys, "frozen", False):
    ROOT_DIR = Path(__file__).resolve().parents[1]
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))

from backend.desktop_storage import (  # noqa: E402
    get_data_dir,
    get_logs_dir,
    get_webview_data_dir,
)
from backend.server import get_bundle_dir, start_local_server  # noqa: E402


def _configure_stdio_and_logging() -> None:
    """Prevent None stdout/stderr crashes in --windowed PyInstaller builds and log to AppData."""
    if not getattr(sys, "frozen", False) and sys.stdout is not None and sys.stderr is not None:
        return
    try:
        logs_dir = get_logs_dir()
        log_file = logs_dir / "ledger.log"
        if log_file.exists() and log_file.stat().st_size > 2 * 1024 * 1024:
            backup = logs_dir / "ledger.log.1"
            if backup.exists():
                backup.unlink()
            log_file.rename(backup)
        stream = open(log_file, "a", encoding="utf-8", buffering=1)
        sys.stdout = stream
        sys.stderr = stream
    except Exception:
        devnull = open(os.devnull, "w", encoding="utf-8")
        if sys.stdout is None:
            sys.stdout = devnull
        if sys.stderr is None:
            sys.stderr = devnull


def _set_windows_app_id() -> None:
    if os.name != "nt":
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Ledger.FinancialVisualizer.Desktop")
    except Exception:
        pass


def _resolve_icon_path() -> Path | None:
    bundle_dir = get_bundle_dir()
    candidates = [
        bundle_dir / "desktop" / "assets" / "Ledger.ico",
        bundle_dir / "assets" / "Ledger.ico",
        Path(__file__).resolve().parent / "assets" / "Ledger.ico",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _default_downloads_dir() -> str:
    if os.name == "nt":
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders",
            ) as key:
                folder = winreg.QueryValueEx(key, "{374DE290-123F-4565-9164-39C4925E467B}")[0]
                if folder and os.path.isdir(folder):
                    return folder
        except Exception:
            pass
    downloads = Path.home() / "Downloads"
    return str(downloads if downloads.is_dir() else Path.home())


def _attach_webview_download_handler(window) -> None:
    """Attach native Windows Save As dialog with PDF/Excel filters to Edge WebView2."""
    if os.name != "nt":
        return
    try:
        import System.Windows.Forms as WinForms
        from System import Action
        from webview.platforms.winforms import BrowserView
    except Exception:
        return

    state = {"last_dir": _default_downloads_dir(), "attached": False}

    def _on_download_starting(_sender, args) -> None:
        suggested = os.path.basename(str(args.ResultFilePath or "")).strip() or "Ledger_Report"
        ext = os.path.splitext(suggested)[1].lower()
        bv = BrowserView.instances.get(window.uid)

        dialog = WinForms.SaveFileDialog()
        dialog.InitialDirectory = state["last_dir"]
        dialog.FileName = suggested
        dialog.RestoreDirectory = True
        dialog.AddExtension = True
        if ext == ".pdf":
            dialog.DefaultExt = "pdf"
            dialog.Filter = "PDF Document (*.pdf)|*.pdf|All Files (*.*)|*.*"
        elif ext == ".xlsx":
            dialog.DefaultExt = "xlsx"
            dialog.Filter = "Excel Workbook (*.xlsx)|*.xlsx|All Files (*.*)|*.*"
        else:
            dialog.Filter = "All Files (*.*)|*.*"

        result = dialog.ShowDialog(bv) if bv is not None else dialog.ShowDialog()
        if result == WinForms.DialogResult.OK and dialog.FileName:
            chosen = str(dialog.FileName)
            args.ResultFilePath = chosen
            parent_dir = os.path.dirname(chosen)
            if parent_dir and os.path.isdir(parent_dir):
                state["last_dir"] = parent_dir
        else:
            args.Cancel = True

    def _hook_core_webview() -> None:
        bv = BrowserView.instances.get(window.uid)
        if bv is None or not getattr(bv, "browser", None):
            return
        wv = getattr(bv.browser, "webview", None)
        if wv is None:
            return

        def _bind_events() -> None:
            if state["attached"] or wv.CoreWebView2 is None:
                return
            try:
                wv.CoreWebView2.DownloadStarting -= bv.browser.on_download_starting
            except Exception:
                pass
            wv.CoreWebView2.DownloadStarting += _on_download_starting
            state["attached"] = True

        if wv.CoreWebView2 is not None:
            _bind_events()
        else:
            def _on_init(_s, init_args) -> None:
                if getattr(init_args, "IsSuccess", False):
                    _bind_events()

            wv.CoreWebView2InitializationCompleted += _on_init

    bv = BrowserView.instances.get(window.uid)
    if bv is not None:
        try:
            bv.Invoke(Action(_hook_core_webview))
        except Exception as exc:
            print(f"Download handler hook skipped: {exc}", flush=True)


def main() -> int:
    os.environ["LEDGER_DESKTOP"] = "1"
    _configure_stdio_and_logging()
    _set_windows_app_id()

    # Ensure AppData directories exist upfront.
    get_data_dir()
    webview_dir = get_webview_data_dir()

    import webview

    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True

    httpd, port = start_local_server("127.0.0.1", 8000, allow_ephemeral_fallback=True)
    server_thread = threading.Thread(target=httpd.serve_forever, name="ledger-http", daemon=True)
    server_thread.start()

    app_url = f"http://127.0.0.1:{port}"
    print(f"Ledger desktop started at {app_url} (data dir: {get_data_dir()})", flush=True)

    icon_path = _resolve_icon_path()
    window = webview.create_window(
        "Ledger — Company Financial Visualizer",
        url=app_url,
        width=1380,
        height=880,
        min_size=(1024, 680),
        resizable=True,
        text_select=True,
        zoomable=True,
        background_color="#07100f",
    )

    def _on_gui_started() -> None:
        _attach_webview_download_handler(window)

    try:
        webview.start(
            _on_gui_started,
            gui="edgechromium" if os.name == "nt" else None,
            private_mode=False,
            storage_path=str(webview_dir),
            icon=str(icon_path) if icon_path else None,
        )
    finally:
        try:
            httpd.shutdown()
            httpd.server_close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
