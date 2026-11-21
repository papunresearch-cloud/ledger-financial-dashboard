"""Local app server: React UI plus same-origin company-download, About research, cache, and settings endpoints."""
from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit
import urllib.request

try:
    from backend.company_research import CompanyResearchError, gather_company_sources, synthesize_about_ai
    from backend.desktop_storage import (
        clear_about_cache,
        get_data_dir,
        get_effective_gemini_api_key,
        get_public_settings_summary,
        load_about_cache,
        save_about_ai,
        save_about_sources,
        save_settings,
    )
    from backend.screener_downloader import ScreenerDownloadError, download_company_workbook
    from backend.google_drive_service import (
        get_drive_sync_status,
        search_company_report,
        read_company_report_html,
        save_or_update_company_report,
        list_all_saved_reports,
        delete_company_reports,
    )
except ImportError:  # pragma: no cover - direct script execution from backend/
    from company_research import CompanyResearchError, gather_company_sources, synthesize_about_ai
    from desktop_storage import (
        clear_about_cache,
        get_data_dir,
        get_effective_gemini_api_key,
        get_public_settings_summary,
        load_about_cache,
        save_about_ai,
        save_about_sources,
        save_settings,
    )
    from screener_downloader import ScreenerDownloadError, download_company_workbook
    from google_drive_service import (
        get_drive_sync_status,
        search_company_report,
        read_company_report_html,
        save_or_update_company_report,
        list_all_saved_reports,
        delete_company_reports,
    )

# Prevent Windows registry quirks from serving ES modules or CSS with text/plain.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/x-icon", ".ico")
mimetypes.add_type("font/woff2", ".woff2")


def get_bundle_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parents[1]


APP_DIR = get_bundle_dir()
DIST_DIR = APP_DIR / "dist"
HOST = "127.0.0.1"
PORT = 8000
MAX_BODY_BYTES = 16_000
MAX_AI_BODY_BYTES = 1_024_000
MAX_REPORT_HTML_BYTES = 16 * 1024 * 1024
ALLOWED_BROWSER_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}


CHART_CACHE: dict[str, dict] = {}
CHART_QUERIES = [
    'Price-DMA50-DMA200-Volume',
    'Price to Earning-Median PE-EPS',
    'Price to book value-Median PBV-Book value',
    'Market Cap to Sales-Median Market Cap to Sales-Sales',
    'EV Multiple-Median EV Multiple-EBITDA',
    'GPM-OPM-NPM-Quarter Sales'
]

def fetch_screener_chart_data(symbol: str, days: str = "365", view: str = "") -> dict:
    clean_symbol = symbol.strip().upper()
    clean_view = view.strip().lower()

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    search_url = f"https://www.screener.in/api/company/search/?q={quote(clean_symbol)}"
    search_req = urllib.request.Request(search_url, headers=headers)
    search_res = json.loads(urllib.request.urlopen(search_req, timeout=10).read().decode('utf-8'))

    if not search_res:
        raise ValueError(f"Symbol {clean_symbol} not found on Screener")

    company_info = search_res[0]
    company_id = company_info['id']
    company_name = company_info['name']
    comp_url = company_info.get('url', '')

    # Check whether Screener offers consolidated statements for this company
    has_consolidated = '/consolidated/' in comp_url

    # Determine active view (Consolidated vs Standalone)
    if clean_view == 'standalone':
        use_consolidated = False
    elif clean_view == 'consolidated':
        use_consolidated = True
    else:
        use_consolidated = has_consolidated

    view_type = "Consolidated" if use_consolidated else "Standalone"
    cons_flag = "&consolidated=true" if use_consolidated else ""

    cache_key = f"{clean_symbol}_{days}_{view_type}"
    if cache_key in CHART_CACHE:
        return CHART_CACHE[cache_key]

    all_datasets = []
    for q in CHART_QUERIES:
        chart_q = quote(q)
        chart_url = f"https://www.screener.in/api/company/{company_id}/chart/?q={chart_q}&days={days}{cons_flag}"
        try:
            chart_req = urllib.request.Request(chart_url, headers=headers)
            c_data = json.loads(urllib.request.urlopen(chart_req, timeout=10).read().decode('utf-8'))
            all_datasets.extend(c_data.get('datasets', []))
        except Exception as e:
            print(f"Chart query {q} note: {e}")

    payload = {
        "symbol": clean_symbol,
        "companyName": company_name,
        "companyId": company_id,
        "days": int(days) if str(days).isdigit() else 365,
        "isConsolidated": use_consolidated,
        "hasConsolidated": has_consolidated,
        "viewType": view_type,
        "chartData": {
            "datasets": all_datasets
        }
    }
    CHART_CACHE[cache_key] = payload
    return payload


class LocalAppHandler(BaseHTTPRequestHandler):
    server_version = "LedgerLocal/1.0"

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}", flush=True)

    def _send_json(self, status: int, value: dict):
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _check_origin(self) -> bool:
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        allowed = set(ALLOWED_BROWSER_ORIGINS)
        if host and (host.startswith("127.0.0.1:") or host.startswith("localhost:")):
            allowed.add(f"http://{host}")
        if origin and origin not in allowed and not re.fullmatch(r"http://(127\.0\.0\.1|localhost):\d+", origin):
            self._send_json(403, {"detail": "Requests must come from the local Ledger app."})
            return False
        return True

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/api/status":
            api_key, key_source = get_effective_gemini_api_key()
            return self._send_json(
                200,
                {
                    "ok": True,
                    "mode": "local",
                    "download": "available",
                    "about": "available",
                    "desktop": os.environ.get("LEDGER_DESKTOP") == "1",
                    "geminiConfigured": bool(api_key),
                    "keySource": key_source,
                    "dataDir": str(get_data_dir()),
                },
            )
        if parsed.path == "/api/settings":
            return self._send_json(200, get_public_settings_summary())
        if parsed.path == "/api/drive/status":
            return self._send_json(200, get_drive_sync_status())
        if parsed.path == "/api/drive/history":
            return self._send_json(200, list_all_saved_reports())
        if parsed.path == "/api/chart":
            query_params = parse_qs(parsed.query)
            symbol = query_params.get("symbol", ["SBIN"])[0].strip().upper()
            days = query_params.get("days", ["365"])[0].strip()
            view = query_params.get("view", [""])[0].strip()
            try:
                data = fetch_screener_chart_data(symbol, days, view)
                return self._send_json(200, data)
            except Exception as e:
                return self._send_json(500, {"detail": f"Error fetching chart data: {str(e)}"})
        if parsed.path.startswith("/api/"):
            return self._send_json(404, {"detail": "API route not found."})
        if not DIST_DIR.exists():
            return self._send_json(503, {"detail": "Build the React app with npm run build first."})

        relative = unquote(parsed.path).lstrip("/")
        candidate = (DIST_DIR / relative).resolve()
        try:
            candidate.relative_to(DIST_DIR.resolve())
        except ValueError:
            return self._send_json(400, {"detail": "Invalid file path."})
        if not candidate.is_file():
            candidate = DIST_DIR / "index.html"
        if not candidate.is_file():
            return self._send_json(404, {"detail": "App file not found."})
        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        route = urlsplit(self.path).path
        if route not in (
            "/api/download",
            "/api/about-sources",
            "/api/about-ai",
            "/api/about-cache",
            "/api/settings",
            "/api/drive/check",
            "/api/drive/get-report",
            "/api/drive/save-report",
            "/api/drive/delete-reports",
        ):
            return self._send_json(404, {"detail": "API route not found."})
        if not self._check_origin():
            return

        max_len = (
            MAX_REPORT_HTML_BYTES
            if route == "/api/drive/save-report"
            else MAX_AI_BODY_BYTES
            if route == "/api/about-ai"
            else MAX_BODY_BYTES
        )
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > max_len:
                return self._send_json(413, {"detail": "Invalid request size."})
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(body, dict):
                return self._send_json(400, {"detail": "JSON request body must be an object."})
        except Exception:
            return self._send_json(400, {"detail": "Invalid JSON request body."})

        if route == "/api/settings":
            clear_key = bool(body.get("clearGeminiApiKey"))
            raw_key = body.get("geminiApiKey")
            if raw_key is not None and not isinstance(raw_key, str):
                return self._send_json(400, {"detail": "geminiApiKey must be a string."})
            scr_email = body.get("screenerEmail")
            if scr_email is not None and not isinstance(scr_email, str):
                return self._send_json(400, {"detail": "screenerEmail must be a string."})
            scr_pw = body.get("screenerPassword")
            if scr_pw is not None and not isinstance(scr_pw, str):
                return self._send_json(400, {"detail": "screenerPassword must be a string."})
            clear_scr = bool(body.get("clearScreenerCredentials"))
            browser_pref = body.get("browserPreference")
            if browser_pref is not None and str(browser_pref).strip().lower() not in ("auto", "chrome", "edge"):
                return self._send_json(400, {"detail": "browserPreference must be auto, chrome, or edge."})
            if body.get("clearAboutCache"):
                clear_about_cache()
            summary = save_settings(
                gemini_api_key=raw_key,
                clear_gemini_api_key=clear_key,
                screener_email=scr_email,
                screener_password=scr_pw,
                clear_screener_credentials=clear_scr,
                browser_preference=str(browser_pref) if browser_pref is not None else None,
            )
            return self._send_json(200, summary)

        if route == "/api/about-cache":
            action = str(body.get("action") or "lookup").strip().lower()
            code = str(body.get("code", "")).strip()
            company_name = str(body.get("companyName", "")).strip()
            if action == "clear":
                removed = clear_about_cache(code, company_name)
                summary = get_public_settings_summary()
                return self._send_json(
                    200,
                    {
                        "cleared": removed,
                        "aboutCacheCount": summary["aboutCacheCount"],
                        "aboutCacheBytes": summary["aboutCacheBytes"],
                    },
                )
            if not code and not company_name:
                return self._send_json(200, {"hit": False})
            return self._send_json(200, load_about_cache(code, company_name))

        if route == "/api/about-sources":
            code = str(body.get("code", "")).strip()
            company_name = str(body.get("companyName", "")).strip()
            force_refresh = bool(body.get("forceRefresh"))
            if not code and not company_name:
                return self._send_json(400, {"detail": "Provide a company code or company name."})
            try:
                payload = gather_company_sources(
                    code or company_name,
                    company_name,
                    force_refresh=force_refresh,
                )
                save_about_sources(code, company_name, payload)
                return self._send_json(200, payload)
            except CompanyResearchError as exc:
                return self._send_json(422, {"detail": str(exc)})
            except Exception as exc:
                print("Local about-sources failed:", flush=True)
                traceback.print_exc()
                detail = f"{type(exc).__name__}: {exc}"[:600]
                return self._send_json(500, {"detail": f"Company source fetch failed — {detail}"})

        if route == "/api/about-ai":
            api_key, _source = get_effective_gemini_api_key()
            if not api_key:
                return self._send_json(
                    503,
                    {
                        "detail": "GEMINI_API_KEY is not configured. Add it in Ledger Settings.",
                        "missingKey": True,
                    },
                )
            try:
                ai_data = synthesize_about_ai(body, api_key=api_key, cloud_mode=False)
                save_about_ai(body, ai_data)
                return self._send_json(200, {"ai": ai_data})
            except CompanyResearchError as exc:
                return self._send_json(422, {"detail": str(exc)})
            except Exception as exc:
                print("Local about-ai failed:", flush=True)
                traceback.print_exc()
                detail = f"{type(exc).__name__}: {exc}"[:600]
                return self._send_json(500, {"detail": f"Company AI synthesis failed — {detail}"})

        if route == "/api/drive/check":
            code = str(body.get("code", "")).strip()
            company_name = str(body.get("companyName", "")).strip()
            if not code and not company_name:
                return self._send_json(200, {"found": False, "code": ""})
            return self._send_json(200, search_company_report(code, company_name))

        if route == "/api/drive/get-report":
            code = str(body.get("code", "")).strip()
            company_name = str(body.get("companyName", "")).strip()
            if not code and not company_name:
                return self._send_json(400, {"detail": "Provide a company code or name."})
            html, info = read_company_report_html(code, company_name)
            if not html:
                return self._send_json(404, {"detail": "Saved report not found in Google Drive or local storage.", "info": info})
            return self._send_json(200, {"html": html, "info": info})

        if route == "/api/drive/save-report":
            code = str(body.get("code", "")).strip()
            company_name = str(body.get("companyName", "")).strip()
            html_doc = str(body.get("html", ""))
            if not code or len(html_doc) < 100:
                return self._send_json(400, {"detail": "Invalid company code or report HTML content."})
            try:
                res = save_or_update_company_report(code, company_name, html_doc)
                return self._send_json(200, res)
            except Exception as exc:
                print("Drive save-report failed:", flush=True)
                traceback.print_exc()
                detail = f"{type(exc).__name__}: {exc}"[:600]
                return self._send_json(500, {"detail": f"Failed to save report to Google Drive — {detail}"})

        if route == "/api/drive/delete-reports":
            raw_codes = body.get("codes", [])
            if isinstance(raw_codes, str):
                raw_codes = [raw_codes]
            if not isinstance(raw_codes, list) or not raw_codes:
                return self._send_json(400, {"detail": "Provide a list of company codes to delete."})
            codes = [str(c).strip().upper() for c in raw_codes if str(c).strip()]
            if not codes:
                return self._send_json(400, {"detail": "No valid company codes provided."})
            try:
                res = delete_company_reports(codes)
                return self._send_json(200, res)
            except Exception as exc:
                print("Drive delete-reports failed:", flush=True)
                traceback.print_exc()
                detail = f"{type(exc).__name__}: {exc}"[:600]
                return self._send_json(500, {"detail": f"Failed to delete reports from Google Drive — {detail}"})

        try:
            code = str(body.get("code", "")).strip()
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9&._-]{0,31}", code):
                return self._send_json(400, {"detail": "Enter a Screener company code such as INFY, ITC, or RELIANCE."})
            workbook = download_company_workbook(code)
        except ScreenerDownloadError as exc:
            return self._send_json(422, {"detail": str(exc)})
        except Exception as exc:
            print("Company download failed:", flush=True)
            traceback.print_exc()
            # Return the actual exception summary so the UI can show a useful
            # diagnosis. Never include request headers or environment secrets.
            detail = f"{type(exc).__name__}: {exc}"[:700]
            return self._send_json(500, {"detail": f"Screener export failed — {detail}"})

        filename = f"{code.upper()}.xlsx"
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(workbook)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(workbook)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    # SO_REUSEADDR on Windows lets a second listener hijack an already-bound port.
    allow_reuse_address = os.name != "nt"
    daemon_threads = True

    def server_bind(self):
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def start_local_server(
    host: str = HOST,
    port: int = PORT,
    *,
    allow_ephemeral_fallback: bool = False,
) -> tuple[ThreadingHTTPServer, int]:
    """Bind the local HTTP server and return (server, actual_port)."""
    try:
        httpd = ReusableThreadingHTTPServer((host, port), LocalAppHandler)
    except OSError:
        if not allow_ephemeral_fallback or port == 0:
            raise
        httpd = ReusableThreadingHTTPServer((host, 0), LocalAppHandler)
    actual_port = int(httpd.server_address[1])
    return httpd, actual_port


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the local Ledger web server.")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("LEDGER_PORT", str(PORT)) or PORT),
        help="TCP port on 127.0.0.1 (defaults to 8000; picks a free port if 8000 is busy).",
    )
    args = parser.parse_args()
    server, bound_port = start_local_server(HOST, args.port, allow_ephemeral_fallback=True)
    print(f"Ledger is available on this computer at http://{HOST}:{bound_port}", flush=True)
    print(f"Local storage directory: {get_data_dir()}", flush=True)
    print("Downloaded workbooks are returned to the app and are not saved by this service.", flush=True)
    server.serve_forever()
