"""Shared Vercel HTTP helpers for Python serverless handlers."""
from __future__ import annotations

import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler

MAX_RESPONSE_BYTES = 4_000_000


def safe_error_detail(exc: Exception) -> str:
    """Expose non-secret diagnostics while redacting configured credentials."""
    message = str(exc).replace("\r", " ").replace("\n", " ").strip()
    secret_names = (
        "LEDGER_ACCESS_KEY",
        "GEMINI_API_KEY",
        "SCREENER_PROXY_USERNAME",
        "SCREENER_PROXY_PASSWORD",
        "SCREENER_SESSION_ID",
        "SCREENER_EMAIL",
        "SCREENER_PASSWORD",
    )
    for name in secret_names:
        secret = os.environ.get(name, "")
        if secret:
            message = message.replace(secret, "[redacted]")
    message = re.sub(r"(?i)(https?://)[^/\s@]+@", r"\1[redacted]@", message)
    message = re.sub(r"(?i)([?&]key=)[^&\s]+", r"\1[redacted]", message)
    message = re.sub(r"AIzaSy[0-9A-Za-z_-]{10,}", "[redacted]", message)
    message = message[:600] if message else "(no exception message)"
    return f"{type(exc).__name__}: {message}"


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def verify_vercel_request(handler: BaseHTTPRequestHandler, max_body_bytes: int) -> dict | None:
    """Validate access key, same-origin header, and JSON body for Vercel POST endpoints."""
    expected_key = os.environ.get("LEDGER_ACCESS_KEY", "")
    supplied_key = handler.headers.get("X-Ledger-Key", "")
    if not expected_key:
        send_json(handler, 503, {"detail": "The endpoint is not configured. Set LEDGER_ACCESS_KEY in Vercel."})
        return None
    if not supplied_key or not hmac.compare_digest(supplied_key, expected_key):
        send_json(handler, 401, {"detail": "Enter the Ledger access key."})
        return None

    origin = handler.headers.get("Origin")
    host = handler.headers.get("Host", "")
    if origin and origin not in (f"https://{host}", f"http://{host}"):
        send_json(handler, 403, {"detail": "Requests must come from the Ledger site."})
        return None

    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0 or length > max_body_bytes:
        send_json(handler, 413, {"detail": "Invalid request size."})
        return None
    return json.loads(handler.rfile.read(length).decode("utf-8"))
