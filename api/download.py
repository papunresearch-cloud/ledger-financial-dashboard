"""Vercel serverless adapter for Ledger's existing workbook download flow."""
from __future__ import annotations

import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler

from backend.screener_downloader import ScreenerDownloadError, download_company_workbook

MAX_BODY_BYTES = 8_000
MAX_RESPONSE_BYTES = 4_000_000  # Leave margin below Vercel's 4.5 MB function payload ceiling.


class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/status":
            self._json(200, {"ok": True, "mode": "vercel", "download": "available"})
            return
        self._json(404, {"detail": "API route not found."})

    def do_POST(self) -> None:
        if self.path != "/api/download":
            self._json(404, {"detail": "API route not found."})
            return

        expected_key = os.environ.get("LEDGER_ACCESS_KEY", "")
        supplied_key = self.headers.get("X-Ledger-Key", "")
        if not expected_key:
            self._json(503, {"detail": "The download endpoint is not configured. Set LEDGER_ACCESS_KEY in Vercel."})
            return
        if not supplied_key or not hmac.compare_digest(supplied_key, expected_key):
            self._json(401, {"detail": "Enter the Ledger download access key."})
            return

        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if origin and origin not in (f"https://{host}", f"http://{host}"):
            self._json(403, {"detail": "Requests must come from the Ledger site."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                self._json(413, {"detail": "Invalid request size."})
                return
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            code = str(body.get("code", "")).strip()
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9&._-]{0,31}", code):
                self._json(400, {"detail": "Enter a Screener company code such as INFY, ITC, or RELIANCE."})
                return
            os.environ["LEDGER_CLOUD_MODE"] = "1"
            workbook = download_company_workbook(code)
            if len(workbook) > MAX_RESPONSE_BYTES:
                self._json(413, {"detail": "The exported workbook exceeds Vercel's function response-size limit."})
                return
        except ScreenerDownloadError as exc:
            self._json(422, {"detail": str(exc)})
            return
        except Exception as exc:
            print(f"Company download failed: {type(exc).__name__}", flush=True)
            # Do not return or log exception text: it can include proxy details.
            self._json(500, {"detail": f"Screener export failed ({type(exc).__name__}). Check the Vercel function logs."})
            return

        filename = f"{code.upper()}.xlsx"
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(workbook)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(workbook)
