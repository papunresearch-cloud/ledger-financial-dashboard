"""Vercel serverless handler for Screener stock time series chart data."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit

from backend.screener_chart import fetch_screener_chart_data
from backend.vercel_http import safe_error_detail


class handler(BaseHTTPRequestHandler):
    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.send_header("Cache-Control", "public, max-age=180")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path not in ("/api/chart", "/api/chart/"):
            return self._send_json(404, {"detail": "API route not found."})

        query_params = parse_qs(parsed.query)
        symbol = query_params.get("symbol", ["RELIANCE"])[0].strip().upper() or "RELIANCE"
        days = query_params.get("days", ["365"])[0].strip()
        view = query_params.get("view", [""])[0].strip()

        try:
            data = fetch_screener_chart_data(symbol, days, view)
            self._send_json(200, data)
        except Exception as exc:
            detail = safe_error_detail(exc)
            print(f"Chart fetch failed: {detail}", flush=True)
            self._send_json(500, {"detail": f"Chart data fetch failed. {detail}"})
