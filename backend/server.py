"""Local app server: React UI plus same-origin company-download endpoint."""
from __future__ import annotations

import json
import mimetypes
import re
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from screener_downloader import ScreenerDownloadError, download_company_workbook

APP_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = APP_DIR / "dist"
HOST = "127.0.0.1"
PORT = 8000
MAX_BODY_BYTES = 8_000
ALLOWED_BROWSER_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
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
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/api/status":
            return self._send_json(200, {"ok": True, "mode": "local", "download": "available"})
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
        if urlsplit(self.path).path != "/api/download":
            return self._send_json(404, {"detail": "API route not found."})
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_BROWSER_ORIGINS:
            return self._send_json(403, {"detail": "Requests must come from the local Ledger app."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                return self._send_json(413, {"detail": "Invalid request size."})
            body = json.loads(self.rfile.read(length).decode("utf-8"))
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

