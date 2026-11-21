"""Local app server: React UI plus same-origin company-download endpoint."""
from __future__ import annotations

import json
import mimetypes
import os
import re
import socket
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from screener_downloader import ScreenerDownloadError, download_company_workbook
from company_research import CompanyResearchError, gather_company_about, load_env_setting

APP_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = APP_DIR / "dist"
HOST = "127.0.0.1"


def get_available_port(host: str = "127.0.0.1", preferred: int = 8000) -> int:
    env_port = os.environ.get("PORT")
    if env_port and env_port.isdigit():
        return int(env_port)
    for p in (preferred, 8001, 8002):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex((host, p)) != 0:
                return p
    return preferred


PORT = get_available_port(HOST, 8000)
MAX_BODY_BYTES = 8_000
MAX_AI_BODY_BYTES = 512_000
ALLOWED_BROWSER_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
    "http://localhost:8002",
    "http://127.0.0.1:8002",
}


class LocalAppHandler(BaseHTTPRequestHandler):
    server_version = "LedgerLocal/1.0"

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}", flush=True)

    def _send_json(self, status: int, value: dict):
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin and origin in ALLOWED_BROWSER_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        self.send_response(204)
        if origin and origin in ALLOWED_BROWSER_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/api/status":
            return self._send_json(200, {"ok": True, "mode": "local", "download": "available", "about": "available"})
        if parsed.path == "/api/chart":
            from urllib.parse import parse_qs
            from screener_chart import fetch_screener_chart_data
            query_params = parse_qs(parsed.query)
            symbol = query_params.get("symbol", ["RELIANCE"])[0].strip().upper() or "RELIANCE"
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
        if route not in ("/api/download", "/api/about-sources", "/api/about-ai"):
            return self._send_json(404, {"detail": "API route not found."})
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        allowed = set(ALLOWED_BROWSER_ORIGINS)
        if host and (host.startswith("127.0.0.1:") or host.startswith("localhost:")):
            allowed.add(f"http://{host}")
        if origin and origin not in allowed:
            return self._send_json(403, {"detail": "Requests must come from the local Ledger app."})
        max_len = MAX_AI_BODY_BYTES if route == "/api/about-ai" else MAX_BODY_BYTES
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > max_len:
                return self._send_json(413, {"detail": "Invalid request size."})
            raw_body = self.rfile.read(length).decode("utf-8")
            body = json.loads(raw_body)
        except Exception as exc:
            print(f"JSON parse error: {exc!r}", flush=True)
            return self._send_json(400, {"detail": f"Invalid JSON request body: {exc}"})

        if route in ("/api/about-sources", "/api/about"):
            code = str(body.get("code", "")).strip()
            company_name = str(body.get("companyName", "")).strip()
            if not code and not company_name:
                return self._send_json(400, {"detail": "Provide a company code or company name."})
            try:
                payload = gather_company_about(code or company_name, company_name)
                return self._send_json(200, payload)
            except CompanyResearchError as exc:
                return self._send_json(422, {"detail": str(exc)})
            except Exception as exc:
                print("Local about fetch failed:", flush=True)
                traceback.print_exc()
                detail = f"{type(exc).__name__}: {exc}"[:600]
                return self._send_json(500, {"detail": f"Company About fetch failed — {detail}"})

        if route == "/api/about-ai":
            return self._send_json(200, {"disabled": True, "detail": "AI synthesis disabled."})

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


if __name__ == "__main__":
    print(f"Ledger is available on this computer at http://{HOST}:{PORT}", flush=True)
    print("Downloaded workbooks are returned to the browser and are not saved by this service.", flush=True)
    ThreadingHTTPServer((HOST, PORT), LocalAppHandler).serve_forever()

