"""Vercel serverless handler: Step 1 company sources & live 12-month news fetch."""
from __future__ import annotations

import os
from http.server import BaseHTTPRequestHandler

from backend.company_research import CompanyResearchError, gather_company_sources
from backend.vercel_http import safe_error_detail, send_json, verify_vercel_request

MAX_BODY_BYTES = 8_000


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path != "/api/about-sources":
            send_json(self, 404, {"detail": "API route not found."})
            return

        body = verify_vercel_request(self, MAX_BODY_BYTES)
        if body is None:
            return

        code = str(body.get("code", "")).strip()
        company_name = str(body.get("companyName", "")).strip()
        if not code and not company_name:
            send_json(self, 400, {"detail": "Provide a company code or company name."})
            return

        try:
            os.environ["LEDGER_CLOUD_MODE"] = "1"
            payload = gather_company_sources(code or company_name, company_name)
        except CompanyResearchError as exc:
            send_json(self, 422, {"detail": str(exc)})
            return
        except Exception as exc:
            detail = safe_error_detail(exc)
            print(f"About sources fetch failed: {detail}", flush=True)
            send_json(self, 500, {"detail": f"Company source fetch failed. {detail}"})
            return

        send_json(self, 200, payload)
