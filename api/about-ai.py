"""Vercel serverless handler: Step 2 Gemini AI corporate intelligence synthesis."""
from __future__ import annotations

import os
from http.server import BaseHTTPRequestHandler

from backend.company_research import CompanyResearchError, load_env_setting, synthesize_about_ai
from backend.vercel_http import safe_error_detail, send_json, verify_vercel_request

MAX_BODY_BYTES = 512_000


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path != "/api/about-ai":
            send_json(self, 404, {"detail": "API route not found."})
            return

        body = verify_vercel_request(self, MAX_BODY_BYTES)
        if body is None:
            return

        api_key = load_env_setting("GEMINI_API_KEY")
        if not api_key:
            send_json(self, 503, {"detail": "GEMINI_API_KEY is not configured in Vercel Environment Variables."})
            return

        try:
            os.environ["LEDGER_CLOUD_MODE"] = "1"
            ai_data = synthesize_about_ai(body, api_key=api_key, cloud_mode=True)
        except CompanyResearchError as exc:
            send_json(self, 422, {"detail": safe_error_detail(exc)})
            return
        except Exception as exc:
            detail = safe_error_detail(exc)
            print(f"About AI synthesis failed: {detail}", flush=True)
            send_json(self, 500, {"detail": f"Company AI synthesis failed. {detail}"})
            return

        send_json(self, 200, {"ai": ai_data})
