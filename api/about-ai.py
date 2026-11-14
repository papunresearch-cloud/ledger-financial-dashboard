"""Vercel serverless handler: AI synthesis removed per user request."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler

from backend.vercel_http import send_json, verify_vercel_request

MAX_BODY_BYTES = 512_000


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        send_json(self, 200, {"disabled": True, "detail": "AI synthesis disabled."})
