"""Cloud-safe, pure-HTTP corporate research & Gemini AI synthesis module.

Designed to run both locally via backend/server.py and on Vercel serverless Python
functions without Playwright or Chromium dependencies.
"""
from __future__ import annotations

import json
import math
import os
import re
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import requests
import urllib3
from bs4 import BeautifulSoup

try:
    from backend.screener_downloader import _cloud_proxy_session, fetch_screener_peers_html_via_profile
except ImportError:  # pragma: no cover - local script import path
    from screener_downloader import _cloud_proxy_session, fetch_screener_peers_html_via_profile

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

APP_DIR = Path(__file__).resolve().parents[1]

CANDIDATE_MODELS = [
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemma-4-26b-a4b-it",
]

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


class CompanyResearchError(RuntimeError):
    """Raised on configuration or unrecoverable upstream failures."""


def load_env_setting(name: str) -> str:
    """Resolve a configuration value from env vars or local .env files."""
    direct = os.environ.get(name, "").strip().strip("\"'")
    if direct:
        return direct
    for candidate in (APP_DIR / ".env", Path.home() / ".env"):
        if not candidate.is_file():
            continue
        try:
            for raw_line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if key.strip() == name:
                    cleaned = val.strip().strip("\"'")
                    if cleaned:
                        return cleaned
        except Exception:
            continue
    return ""


_SCREENER_HTTP_LOCK = threading.Lock()
_SCREENER_HTTP_COOKIE_CACHE: dict[str, Any] = {
    "creds": None,
    "sessionid": "",
    "csrftoken": "",
    "ts": 0.0,
}


def _get_saved_screener_credentials() -> tuple[str, str]:
    try:
        try:
            from backend.desktop_storage import get_effective_screener_credentials
        except ImportError:
            from desktop_storage import get_effective_screener_credentials
        email, password, _ = get_effective_screener_credentials()
        if email and password:
            return email, password
    except Exception:
        pass
    return load_env_setting("SCREENER_EMAIL"), load_env_setting("SCREENER_PASSWORD")


def _authenticate_screener_http_session(session: requests.Session, email: str, password: str) -> None:
    if not email or not password:
        return
    now = time.monotonic()
    with _SCREENER_HTTP_LOCK:
        if (
            _SCREENER_HTTP_COOKIE_CACHE.get("creds") == (email, password)
            and _SCREENER_HTTP_COOKIE_CACHE.get("sessionid")
            and (now - float(_SCREENER_HTTP_COOKIE_CACHE.get("ts") or 0.0)) < 1800.0
        ):
            session.cookies.set("sessionid", _SCREENER_HTTP_COOKIE_CACHE["sessionid"], domain=".screener.in", path="/")
            if _SCREENER_HTTP_COOKIE_CACHE.get("csrftoken"):
                session.cookies.set("csrftoken", _SCREENER_HTTP_COOKIE_CACHE["csrftoken"], domain=".screener.in", path="/")
            return

    try:
        login_url = "https://www.screener.in/login/"
        resp = session.get(login_url, timeout=12)
        if resp.status_code != 200:
            return
        csrf = session.cookies.get("csrftoken", "")
        if not csrf:
            m = re.search(r'name=["\']csrfmiddlewaretoken["\']\s+value=["\']([^"\']+)', resp.text)
            if m:
                csrf = m.group(1)
        form = {"username": email, "password": password, "next": ""}
        if csrf:
            form["csrfmiddlewaretoken"] = csrf
        res = session.post(
            login_url,
            data=form,
            headers={"Referer": login_url, "Origin": "https://www.screener.in"},
            timeout=12,
        )
        sid = session.cookies.get("sessionid", "")
        if res.status_code == 200 and sid and not urllib.parse.urlsplit(res.url).path.rstrip("/").endswith("login"):
            with _SCREENER_HTTP_LOCK:
                _SCREENER_HTTP_COOKIE_CACHE["creds"] = (email, password)
                _SCREENER_HTTP_COOKIE_CACHE["sessionid"] = sid
                _SCREENER_HTTP_COOKIE_CACHE["csrftoken"] = session.cookies.get("csrftoken", "")
                _SCREENER_HTTP_COOKIE_CACHE["ts"] = time.monotonic()
    except Exception:
        pass


def _make_screener_session() -> requests.Session:
    """Create a HTTP session for Screener (routes via proxy when configured)."""
    proxy_server = load_env_setting("SCREENER_PROXY_SERVER")
    if proxy_server:
        try:
            session = _cloud_proxy_session()
        except Exception:
            session = requests.Session()
            session.headers.update(BROWSER_HEADERS)
    else:
        session = requests.Session()
        session.headers.update(BROWSER_HEADERS)

    session_id = load_env_setting("SCREENER_SESSION_ID")
    if session_id:
        session.cookies.set("sessionid", session_id, domain=".screener.in", path="/")
        return session

    email, password = _get_saved_screener_credentials()
    if email and password:
        _authenticate_screener_http_session(session, email, password)
    return session


def _normalize_search_candidates(code_or_name: str, company_name_hint: str = "") -> list[str]:
    candidates: list[str] = []
    for raw in (code_or_name, company_name_hint):
        cleaned = re.sub(r"\.xlsx$", "", (raw or "").strip(), flags=re.IGNORECASE)
        if cleaned and cleaned not in candidates:
            candidates.append(cleaned)
        no_corp = re.sub(
            r"\b(Ltd\.?|Limited|Corpn\.?|Corporation|Pvt\.?|Private|India|Co\.?|Company|Holdings?)\b",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        no_corp = re.sub(r"\s+", " ", no_corp).strip(" .,-")
        if no_corp and no_corp not in candidates:
            candidates.append(no_corp)
        words = no_corp.split()
        if len(words) >= 2:
            prefix = " ".join(words[:2])
            if prefix not in candidates:
                candidates.append(prefix)
    return candidates


def resolve_company(session: requests.Session, code_or_name: str, company_name_hint: str = "") -> dict[str, Any]:
    """Resolve symbol / company name using Screener search autosuggest."""
    for query in _normalize_search_candidates(code_or_name, company_name_hint):
        search_url = f"https://www.screener.in/api/company/search/?q={urllib.parse.quote(query)}"
        try:
            resp = session.get(search_url, timeout=10)
            if resp.status_code == 200:
                results = resp.json()
                if isinstance(results, list) and results:
                    match = results[0]
                    url_path = str(match.get("url") or "")
                    m = re.search(r"/company/([^/]+)/", url_path)
                    symbol = m.group(1) if m else query.upper()
                    return {
                        "id": match.get("id"),
                        "name": str(match.get("name") or company_name_hint or query).strip(),
                        "symbol": symbol.upper(),
                        "url_path": url_path or f"/company/{symbol.upper()}/consolidated/",
                    }
        except Exception:
            continue

    fallback_raw = (code_or_name or company_name_hint or "COMPANY").strip()
    fallback_sym = re.sub(r"[^A-Za-z0-9&._-]", "", fallback_raw.upper())[:24] or "COMPANY"
    return {
        "id": None,
        "name": (company_name_hint or fallback_raw).strip(),
        "symbol": fallback_sym,
        "url_path": f"/company/{fallback_sym}/consolidated/",
    }


def _extract_official_website_from_soup(soup: BeautifulSoup) -> str:
    skip_domains = (
        "screener.in",
        "bseindia.com",
        "nseindia.com",
        "facebook.com",
        "twitter.com",
        "x.com",
        "linkedin.com",
        "youtube.com",
        "instagram.com",
    )
    for selector in (".company-links a[href]", "main a[href]", "a[href]"):
        for a in soup.select(selector):
            href = (a.get("href") or "").strip()
            txt = a.get_text(" ", strip=True).lower()
            if not href.startswith(("http://", "https://")):
                continue
            low_href = href.lower()
            if any(bad in low_href for bad in skip_domains):
                continue
            if txt in ("website", "company website") or (
                "." in txt and len(txt) > 3 and " " not in txt
            ):
                return href
            if selector == ".company-links a[href]":
                return href
    return "N/A"


PEER_COMPARISON_FOOTNOTE = (
    "Sales growth, Profit growth, OPM, ROE, ROA, D.Payout, CFO/EBIT%, PE, PB => 3 years average data · "
    "52W Range Bar: ━━ Track = 52W Low to High · ▲ Lower Arrow = CMP · ▼ Small Blue Triangle = 50 DMA · "
    "▼ Big Orange Triangle = 200 DMA · XX% = [200 × (52W High − 52W Low) / (52W High + 52W Low)]"
)


def _clean_num_val(raw: str) -> float | None:
    cleaned = re.sub(r"[,\s%]", "", str(raw or ""))
    if not cleaned or cleaned in ("-", "--", "N/A", "NA"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _format_indian_commas(value: float, decimals: int = 0) -> str:
    sign = "-" if value < 0 else ""
    rounded = f"{abs(value):.{decimals}f}"
    if "." in rounded:
        int_part, frac_part = rounded.split(".", 1)
    else:
        int_part, frac_part = rounded, ""
    if len(int_part) > 3:
        last3 = int_part[-3:]
        rest = int_part[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        int_part = ",".join(groups) + "," + last3
    return f"{sign}{int_part}" + (f".{frac_part}" if frac_part else "")


def _fmt_peer_cr(raw: str) -> str:
    val = _clean_num_val(raw)
    if val is None:
        return "-"
    av = abs(val)
    decimals = 0 if av >= 100 else (1 if av >= 10 else 2)
    return _format_indian_commas(val, decimals)


def _fmt_peer_pct(raw: str) -> str:
    val = _clean_num_val(raw)
    if val is None:
        return "-"
    return f"{val:.2f}%"


def _fmt_peer_mult(raw: str) -> str:
    val = _clean_num_val(raw)
    if val is None:
        return "-"
    return f"{val:.2f}"


def _fmt_peer_pair(curr_raw: str, avg3_raw: str) -> str:
    curr = _fmt_peer_mult(curr_raw)
    avg3 = _fmt_peer_mult(avg3_raw)
    if curr != "-" and avg3 != "-":
        try:
            c = float(str(curr).replace(",", ""))
            a = float(str(avg3).replace(",", ""))
            if a > 0:
                diff = 100.0 * (c - a) / a
                sign = "+" if diff > 0 else ""
                return f"{curr} [{avg3}] ({sign}{diff:.2f}%)"
        except Exception:
            pass
        return f"{curr} [{avg3}]"
    if curr != "-":
        return curr
    if avg3 != "-":
        return f"- [{avg3}]"
    return "-"


def _norm_company_token(name: str) -> str:
    s = re.sub(r"\b(ltd|limited|ind|industries|corpn|corporation|co)\b", "", (name or "").lower())
    return re.sub(r"[^a-z0-9]", "", s)


def _extract_screener_symbol_from_href(href: str) -> str:
    m = re.search(r"/company/([^/]+)/", str(href or ""))
    return m.group(1).upper() if m else ""


def _match_screener_peer_columns(ths: list[Any]) -> dict[str, int]:
    """Map Screener peer table header elements to deterministic column indices."""
    meta: list[tuple[int, str, str]] = []
    for idx, th in enumerate(ths):
        htext = " ".join(th.get_text(" ", strip=True).split()).lower()
        ttext = " ".join(str(th.get("data-tooltip") or "").split()).lower()
        meta.append((idx, htext, ttext))

    cols: dict[str, int] = {}

    def find_col(pred: Any) -> int | None:
        for idx, h, t in meta:
            if pred(idx, h, t):
                return idx
        return None

    def assign(key: str, *preds: Any) -> None:
        for pred in preds:
            idx = find_col(pred)
            if idx is not None:
                cols[key] = idx
                return

    assign("s_no", lambda _i, h, _t: h in ("s.no.", "s.no", "sno"))
    assign("company", lambda _i, h, _t: h == "company", lambda i, _h, _t: i == 1)
    assign(
        "mcap",
        lambda _i, h, _t: h == "mar cap rs.cr.",
        lambda _i, h, t: h.startswith("mar cap") or t == "market capitalization",
    )
    assign(
        "ttm_sales",
        lambda _i, h, t: (h == "sales rs.cr." or h == "sales" or t == "sales")
        and "/" not in h
        and "var" not in h
        and "qtr" not in h
        and "growth" not in h,
    )
    assign(
        "sales_growth_3y",
        lambda _i, h, _t: "sales var 3yrs" in h or "sales var 3yr" in h,
        lambda _i, _h, t: "sales growth 3years" in t or "sales growth 3year" in t,
    )
    assign(
        "profit_growth_3y",
        lambda _i, h, _t: "profit var 3yrs" in h or "profit var 3yr" in h,
        lambda _i, _h, t: "profit growth 3years" in t or "profit growth 3year" in t,
    )
    assign(
        "opm_3y",
        lambda _i, h, _t: h == "average opm",
        lambda _i, h, t: "average opm" in h or t == "avgopm",
    )
    assign(
        "roe_3y",
        lambda _i, h, _t: "roe 3yr" in h,
        lambda _i, _h, t: "average return on equity 3years" in t,
    )
    assign(
        "roa_3y",
        lambda _i, h, _t: "roa 3yr" in h,
        lambda _i, _h, t: "return on assets 3years" in t,
    )
    assign(
        "payout_3y",
        lambda _i, h, _t: "avg div payout 3yrs" in h or "avg div payout 3yr" in h,
        lambda _i, _h, t: "average dividend payout 3years" in t,
    )
    assign(
        "cfo_ebit_3y",
        lambda _i, h, _t: "average ocf ebit pct" in h or "ocf ebit pct" in h,
        lambda _i, h, t: "average ocf ebit pct" in t or "ocf/ebit" in h,
    )
    assign("pe_curr", lambda _i, h, _t: h == "p/e", lambda _i, _h, t: t == "price to earning")
    assign(
        "pe_3y",
        lambda _i, h, _t: "3yrs pe" in h or "3yr pe" in h,
        lambda _i, _h, t: "historical pe 3years" in t,
    )
    assign(
        "pb_curr",
        lambda _i, h, _t: h in ("cmp / bv", "cmp/bv"),
        lambda _i, _h, t: t == "price to book value",
        lambda _i, h, _t: h == "pbv",
    )
    assign(
        "pb_3y",
        lambda _i, h, _t: "3yrs pbv" in h or "3yr pbv" in h,
        lambda _i, _h, t: "historical pbv 3years" in t,
    )
    assign(
        "ps",
        lambda _i, h, _t: "cmp / sales" in h or "cmp/sales" in h,
        lambda _i, _h, t: t == "price to sales",
    )
    assign(
        "div_yield",
        lambda _i, h, _t: h.startswith("div yld"),
        lambda _i, _h, t: t == "dividend yield",
    )
    assign(
        "cmp",
        lambda _i, h, t: "cmp" in h
        or "current price" in h
        or t == "current price"
        or (
            "price" in h
            and "sales" not in h
            and "book" not in h
            and "cash" not in h
            and "earning" not in h
            and "free" not in h
            and "high" not in h
            and "low" not in h
        ),
    )
    assign(
        "high_52w",
        lambda _i, h, t: (
            ("high" in h and "all time" not in h and "down" not in h and "from" not in h and "return" not in h and "median" not in h and "low" not in h)
            or ("high price" in t and "all time" not in t)
            or ("52" in t and "high" in t and "down" not in t)
        ),
    )
    assign(
        "low_52w",
        lambda _i, h, t: (
            ("low" in h and "all time" not in h and "up" not in h and "from" not in h and "flow" not in h and "high" not in h)
            or ("low price" in t and "all time" not in t)
            or ("52" in t and "low" in t and "up" not in t)
        ),
    )
    assign(
        "dma_50",
        lambda _i, h, t: (
            ("50" in h and "dma" in h and "prev" not in h and "yesterday" not in h)
            or ("50" in t and "dma" in t and "previous" not in t)
            or ("50 days exponential" in t and "yesterday" not in t)
            or (h == "50 dma" or h == "dma 50" or h == "50dma")
        ),
    )
    assign(
        "dma_200",
        lambda _i, h, t: (
            ("200" in h and "dma" in h and "prev" not in h and "yesterday" not in h)
            or ("200" in t and "dma" in t and "previous" not in t)
            or ("200 days exponential" in t and "yesterday" not in t)
            or (h == "200 dma" or h == "dma 200" or h == "200dma")
        ),
    )
    assign(
        "high_low_combined",
        lambda _i, h, t: ("high" in h and "low" in h) or ("high / low" in t or "52w high / low" in t),
    )
    assign(
        "debt_to_equity",
        lambda _i, h, _t: "debt / eq" in h or "debt/eq" in h or "debt to equity" in h,
        lambda _i, _h, t: "debt to equity" in t or "debt to eq" in t,
    )
    assign(
        "bv_growth",
        lambda _i, h, _t: "book value cagr" in h or "bvgr" in h or "bv growt" in h,
        lambda _i, _h, t: "bvgr" in t or "book value cagr" in t or "bv growth" in t,
    )
    return cols


def parse_screener_peers_section(
    main_html: str,
    peers_html: str = "",
    company_id: Any = None,
    company_symbol: str = "",
    company_name: str = "",
    screener_url: str = "",
) -> dict[str, Any]:
    """Deterministically parse all rows and the Median row from Screener's Peer Comparison table."""
    main_soup = BeautifulSoup(main_html or "", "html.parser")
    sector_links = [
        a.get_text(strip=True)
        for a in main_soup.select("#peers a[href*='/market/']")
        if a.get_text(strip=True)
    ]

    top_ratios: dict[str, str] = {}
    for li in main_soup.select("#top-ratios li"):
        n = li.select_one(".name")
        v = li.select_one(".value")
        if n and v:
            top_ratios[n.get_text(" ", strip=True).lower()] = v.get_text(" ", strip=True)

    peers_soup = BeautifulSoup(peers_html, "html.parser") if peers_html else main_soup
    peers_tbl = peers_soup.select_one("table") if peers_html else main_soup.select_one("#peers table")
    if not peers_tbl:
        return {
            "rows": [],
            "median": None,
            "sector_path": sector_links,
            "authenticated": False,
            "source_url": screener_url,
            "footnote": PEER_COMPARISON_FOOTNOTE,
        }

    header_ths: list[Any] = []
    for tr in peers_tbl.select("tr"):
        ths = tr.select("th")
        if ths:
            header_ths = ths
            break
    if not header_ths:
        return {
            "rows": [],
            "median": None,
            "sector_path": sector_links,
            "authenticated": False,
            "source_url": screener_url,
            "footnote": PEER_COMPARISON_FOOTNOTE,
        }

    cols = _match_screener_peer_columns(header_ths)
    target_id_str = str(company_id).strip() if company_id is not None else ""
    target_sym = (company_symbol or "").strip().upper()
    target_norm = _norm_company_token(company_name)

    def cell(tds: list[Any], key: str) -> str:
        idx = cols.get(key)
        if idx is None or idx >= len(tds):
            return ""
        return " ".join(tds[idx].get_text(" ", strip=True).split())

    def build_row(tr: Any, *, is_median: bool = False) -> dict[str, Any] | None:
        tds = tr.select("td")
        if not tds:
            return None
        comp_idx = cols.get("company", 1)
        if comp_idx >= len(tds):
            return None
        comp_td = tds[comp_idx]
        comp_link = comp_td.select_one("a[href]")
        cname = " ".join(comp_td.get_text(" ", strip=True).split())
        if not cname:
            return None
        href = str(comp_link.get("href") or "") if comp_link else ""
        full_href = urllib.parse.urljoin("https://www.screener.in", href) if href else ""
        row_sym = _extract_screener_symbol_from_href(href)
        row_cid = str(tr.get("data-row-company-id") or "").strip()

        is_target = False
        if not is_median:
            if target_id_str and row_cid and row_cid == target_id_str:
                is_target = True
            elif target_sym and row_sym and row_sym == target_sym:
                is_target = True
            elif target_norm and _norm_company_token(cname) == target_norm:
                is_target = True

        r_cmp = cell(tds, "cmp")
        r_high = cell(tds, "high_52w")
        r_low = cell(tds, "low_52w")
        r_d50 = cell(tds, "dma_50")
        r_d200 = cell(tds, "dma_200")

        # Fallback to combined high/low column if present
        if (not r_high or not r_low) and "high_low_combined" in cols:
            comb = cell(tds, "high_low_combined")
            if "/" in comb:
                parts = [p.strip() for p in comb.split("/", 1)]
                if not r_high and parts[0]:
                    r_high = parts[0]
                if not r_low and len(parts) > 1 and parts[1]:
                    r_low = parts[1]

        # For target company row, fallback to top-ratios on Screener's page
        if is_target and top_ratios:
            if not r_cmp:
                r_cmp = top_ratios.get("current price", "")
            if not r_high or not r_low:
                hl = top_ratios.get("high / low", "")
                if "/" in hl:
                    hl_parts = [p.strip() for p in hl.split("/", 1)]
                    if not r_high and hl_parts[0]:
                        r_high = hl_parts[0].replace("₹", "").strip()
                    if not r_low and len(hl_parts) > 1 and hl_parts[1]:
                        r_low = hl_parts[1].replace("₹", "").strip()

        return {
            "s_no": cell(tds, "s_no") if not is_median else "",
            "company": cname,
            "screener_url": full_href,
            "mcap": _fmt_peer_cr(cell(tds, "mcap")),
            "ttm_sales": _fmt_peer_cr(cell(tds, "ttm_sales")),
            "sales_growth": _fmt_peer_pct(cell(tds, "sales_growth_3y")),
            "profit_growth": _fmt_peer_pct(cell(tds, "profit_growth_3y")),
            "opm": _fmt_peer_pct(cell(tds, "opm_3y")),
            "roe": _fmt_peer_pct(cell(tds, "roe_3y")),
            "roa": _fmt_peer_pct(cell(tds, "roa_3y")),
            "payout": _fmt_peer_pct(cell(tds, "payout_3y")),
            "cfo_ebit_pct": _fmt_peer_pct(cell(tds, "cfo_ebit_3y")),
            "pe": _fmt_peer_pair(cell(tds, "pe_curr"), cell(tds, "pe_3y")),
            "pb": _fmt_peer_pair(cell(tds, "pb_curr"), cell(tds, "pb_3y")),
            "ps": _fmt_peer_mult(cell(tds, "ps")),
            "d_yield": _fmt_peer_pct(cell(tds, "div_yield")),
            "debt_to_equity": _fmt_peer_mult(cell(tds, "debt_to_equity")),
            "bv_growth": _fmt_peer_pct(cell(tds, "bv_growth")),
            "cmp": r_cmp,
            "high_52w": r_high,
            "low_52w": r_low,
            "dma_50": r_d50,
            "dma_200": r_d200,
            "is_target": is_target,
            "is_median": is_median,
        }

    tbody = peers_tbl.select_one("tbody")
    body_trs = tbody.select("tr") if tbody else peers_tbl.select("tr")
    rows: list[dict[str, Any]] = []
    for tr in body_trs:
        if tr.select("th"):
            continue
        parsed_row = build_row(tr, is_median=False)
        if parsed_row:
            rows.append(parsed_row)

    median_row: dict[str, Any] | None = None
    tfoot_tr = peers_tbl.select_one("tfoot tr")
    if tfoot_tr:
        median_row = build_row(tfoot_tr, is_median=True)

    authenticated = any(
        cols.get(k) is not None
        for k in (
            "sales_growth_3y",
            "profit_growth_3y",
            "opm_3y",
            "roe_3y",
            "roa_3y",
            "payout_3y",
            "cfo_ebit_3y",
            "pe_3y",
            "pb_3y",
        )
    )

    return {
        "rows": rows,
        "median": median_row,
        "sector_path": sector_links,
        "authenticated": authenticated,
        "source_url": screener_url,
        "footnote": PEER_COMPARISON_FOOTNOTE,
    }


_SHAREHOLDING_CANONICAL_ORDER = [
    ("promoter", "Promoter", False),
    ("fii", "FII", False),
    ("dii", "DII", False),
    ("government", "Government", False),
    ("public", "Public", False),
    ("others", "Others", False),
    ("shareholders", "No. of Shareholders", True),
]


def _normalize_shareholding_row_key(raw_label: str) -> tuple[str, str, bool] | None:
    cleaned = re.sub(r"[\+\-]+$", "", raw_label or "").strip().lower()
    if not cleaned:
        return None
    if "no. of shareholder" in cleaned or "shareholder" in cleaned:
        return ("shareholders", "No. of Shareholders", True)
    if "promoter" in cleaned:
        return ("promoter", "Promoter", False)
    if cleaned.startswith("fii") or "foreign institutional" in cleaned:
        return ("fii", "FII", False)
    if cleaned.startswith("dii") or "domestic institutional" in cleaned:
        return ("dii", "DII", False)
    if "government" in cleaned or cleaned == "govt":
        return ("government", "Government", False)
    if "public" in cleaned:
        return ("public", "Public", False)
    if "other" in cleaned:
        return ("others", "Others", False)
    return None


def _parse_single_shareholding_table(
    soup: BeautifulSoup,
    section_id: str,
    mode: str,
    max_periods: int | None = None,
) -> dict[str, Any]:
    """Parse Screener #quarterly-shp or #yearly-shp table into all available (or capped) periods cleanly."""
    sec = soup.find(id=section_id)
    tbl = sec.find("table") if sec else None
    if not tbl:
        return {"headers": [], "rows_map": {}, "has_others": False, "note": ""}

    raw_headers: list[str] = []
    header_tr = None
    for tr in tbl.find_all("tr"):
        ths = [th.get_text(" ", strip=True) for th in tr.find_all("th")]
        if len(ths) > 1:
            raw_headers = ths[1:]
            header_tr = tr
            break

    if not raw_headers:
        return {"headers": [], "rows_map": {}, "has_others": False, "note": ""}

    valid_indices = list(range(len(raw_headers)))
    note = ""
    if mode == "yearly" and len(raw_headers) >= 3:
        months = [h.split()[0][:3].lower() if h.split() else "" for h in raw_headers]
        hist_months = [m for m in months[:-1] if m]
        if hist_months:
            dom_month, dom_count = max(
                ((m, hist_months.count(m)) for m in set(hist_months)),
                key=lambda item: item[1],
            )
            # Screener appends the latest interim quarter at the end of yearly-shp;
            # exclude it when full annual snapshots exist so yearly columns stay annual.
            if dom_count >= 2 and months[-1] and months[-1] != dom_month:
                excluded_hdr = raw_headers[-1]
                valid_indices = valid_indices[:-1]
                note = f"Excludes trailing interim quarter ({excluded_hdr}) to preserve annual snapshots."

    if max_periods is not None and max_periods > 0:
        selected_indices = valid_indices[-max_periods:]
    else:
        selected_indices = valid_indices
    selected_headers = [raw_headers[i] for i in selected_indices]

    rows_map: dict[str, list[str]] = {}
    has_others = False
    for tr in tbl.find_all("tr"):
        if tr is header_tr:
            continue
        tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if len(tds) <= 1:
            continue
        mapped = _normalize_shareholding_row_key(tds[0])
        if not mapped:
            continue
        key, _, _ = mapped
        vals = tds[1:]
        if key == "others":
            has_others = True
        rows_map[key] = [
            (vals[i] if i < len(vals) and vals[i] else "-")
            for i in selected_indices
        ]

    return {
        "headers": selected_headers,
        "rows_map": rows_map,
        "has_others": has_others,
        "note": note,
    }


def _extract_named_promoters(promoters_data: dict[str, Any] | None, limit: int = 15) -> list[dict[str, str]]:
    if not isinstance(promoters_data, dict) or not promoters_data:
        return []
    extracted: list[tuple[float, dict[str, str]]] = []
    for holder_raw, qmap in promoters_data.items():
        if not isinstance(qmap, dict):
            continue
        periods = [(k, v) for k, v in qmap.items() if k != "setAttributes" and not isinstance(v, dict)]
        if not periods:
            continue
        latest_period, latest_raw = periods[-1]
        prev_raw = periods[-2][1] if len(periods) >= 2 else ""
        try:
            pct_num = float(str(latest_raw).replace("%", "").replace(",", "").strip())
        except Exception:
            pct_num = 0.0
        # Keep active holders (>0%) first; skip zeroed historical entries.
        if pct_num <= 0.0:
            continue
        clean_holder = " ".join(str(holder_raw or "").split()).strip()
        if not clean_holder:
            continue
        extracted.append((
            pct_num,
            {
                "name": clean_holder,
                "latest_pct": f"{pct_num:.2f}%",
                "prev_pct": f"{str(prev_raw).strip()}%" if str(prev_raw).strip() else "-",
                "period": str(latest_period).strip(),
            },
        ))
    extracted.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in extracted[:limit]]


def parse_shareholding_pattern(soup: BeautifulSoup) -> dict[str, Any]:
    """Extract Quarterly and Yearly Shareholding Pattern tables from Screener."""
    sh_section = soup.select_one("#shareholding")
    if not sh_section:
        return {"quarterly": None, "yearly": None}

    tables = sh_section.find_all("table")

    def parse_table(table):
        if not table:
            return None
        thead = table.find("thead")
        headers = [th.get_text(strip=True) for th in thead.find_all("th")] if thead else []
        periods = headers[1:] if len(headers) > 1 else []
        rows = []
        tbody = table.find("tbody")
        if tbody:
            for tr in tbody.find_all("tr"):
                cells = [td.get_text(strip=True).rstrip("+").strip() for td in tr.find_all(["td", "th"])]
                if cells:
                    cat = cells[0].strip()
                    vals = cells[1:]
                    rows.append({
                        "category": cat,
                        "values": vals,
                        "is_total": "total" in cat.lower(),
                        "is_shareholders": "shareholder" in cat.lower(),
                    })
        return {"periods": periods, "rows": rows}

    quarterly = parse_table(tables[0]) if len(tables) > 0 else None
    yearly = parse_table(tables[1]) if len(tables) > 1 else None

    return {
        "quarterly": quarterly,
        "yearly": yearly,
    }


def parse_screener_shareholding_section(
    main_html: str,
    promoters_data: dict[str, Any] | None = None,
    screener_url: str = "",
) -> dict[str, Any]:
    """Deterministically extract 5-quarter and 5-year shareholding + No. of Shareholders + named promoters."""
    empty_payload = {
        "screener_url": f"{screener_url}#shareholding" if screener_url and "#" not in screener_url else screener_url,
        "pledged_pct": "",
        "quarterly": {"headers": [], "rows": [], "note": ""},
        "yearly": {"headers": [], "rows": [], "note": ""},
        "named_promoters": [],
    }
    if not main_html:
        return empty_payload

    soup = BeautifulSoup(main_html, "html.parser")
    q_parsed = _parse_single_shareholding_table(soup, "quarterly-shp", "quarterly", max_periods=None)
    y_parsed = _parse_single_shareholding_table(soup, "yearly-shp", "yearly", max_periods=None)
    include_others = bool(q_parsed["has_others"] or y_parsed["has_others"])

    def build_rows(parsed: dict[str, Any]) -> list[dict[str, Any]]:
        headers = parsed["headers"]
        if not headers:
            return []
        rows: list[dict[str, Any]] = []
        rows_map = parsed["rows_map"]
        for key, label, is_count in _SHAREHOLDING_CANONICAL_ORDER:
            if key == "others" and not include_others:
                continue
            vals = rows_map.get(key)
            if not vals:
                vals = ["-" for _ in headers]
            rows.append({"label": label, "values": vals, "is_count": is_count})
        return rows

    pledged_pct = ""
    for li in soup.select("#top-ratios li"):
        name_el = li.select_one(".name")
        val_el = li.select_one(".value")
        if name_el and val_el and "pledge" in name_el.get_text(" ", strip=True).lower():
            pledged_pct = " ".join(val_el.get_text(" ", strip=True).split())
            break

    sh_url = f"{screener_url.split('#')[0]}#shareholding" if screener_url else ""
    return {
        "screener_url": sh_url,
        "pledged_pct": pledged_pct,
        "quarterly": {
            "headers": q_parsed["headers"],
            "rows": build_rows(q_parsed),
            "note": q_parsed["note"],
        },
        "yearly": {
            "headers": y_parsed["headers"],
            "rows": build_rows(y_parsed),
            "note": y_parsed["note"],
        },
        "named_promoters": _extract_named_promoters(promoters_data),
    }


def _extract_screener_section_table(
    soup: BeautifulSoup,
    section_id: str,
    max_cols: int = 6,
    exclude_labels: tuple[str, ...] = ("raw pdf",),
) -> dict[str, Any]:
    """Extract period headers and cleaned rows for a Screener financial table (#quarters, #profit-loss, etc.)."""
    sec = soup.select_one(f"#{section_id}")
    tbl = sec.select_one("table") if sec else None
    if not tbl:
        return {"headers": [], "rows": []}

    raw_headers: list[str] = []
    header_tr = None
    for tr in tbl.select("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
        if len(cells) > 1 and cells[0] == "":
            raw_headers = cells[1:]
            header_tr = tr
            break

    if not raw_headers:
        return {"headers": [], "rows": []}

    keep_count = min(max_cols, len(raw_headers))
    start_idx = len(raw_headers) - keep_count
    headers = raw_headers[start_idx:]

    rows: list[dict[str, Any]] = []
    for tr in tbl.select("tr"):
        if tr is header_tr:
            continue
        cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
        if len(cells) <= 1:
            continue
        raw_lbl = " ".join(cells[0].split()).strip()
        clean_lbl = re.sub(r"\s*[\+\-]+$", "", raw_lbl).strip()
        if not clean_lbl:
            continue
        if any(ex in clean_lbl.lower() for ex in exclude_labels):
            continue
        # Normalize tooltip text like "CFO/EBITDA Share of operating profit..." -> "CFO/EBITDA"
        if clean_lbl.lower().startswith("cfo/ebitda"):
            clean_lbl = "CFO/EBITDA"
        vals = cells[1:]
        sliced = [(vals[i] if i < len(vals) and vals[i] else "-") for i in range(start_idx, len(raw_headers))]
        rows.append({"label": clean_lbl, "values": sliced})

    return {"headers": headers, "rows": rows}


def _parse_screener_num(raw: str | None) -> float | None:
    if not raw:
        return None
    cleaned = str(raw).replace(",", "").replace("%", "").replace("+", "").strip()
    if not cleaned or cleaned in ("-", "--", "N/A", "NA"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _table_row_map(table: dict[str, Any]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for row in table.get("rows") or []:
        lbl = str(row.get("label") or "").strip().lower()
        if lbl and lbl not in out:
            out[lbl] = list(row.get("values") or [])
    return out


def _lookup_row_val(
    row_map: dict[str, list[str]],
    aliases: tuple[str, ...],
    col_idx: int,
) -> tuple[float | None, str]:
    for alias in aliases:
        key = alias.lower()
        vals = row_map.get(key)
        if vals and 0 <= col_idx < len(vals):
            raw = vals[col_idx]
            return _parse_screener_num(raw), str(raw or "-")
    return None, "-"


def _fmt_pct(val: float | None, signed: bool = False) -> str:
    if val is None or not math.isfinite(val):
        return "-"
    prefix = "+" if signed and val > 0 else ""
    return f"{prefix}{val:.1f}%"


def _fmt_mult(val: float | None) -> str:
    if val is None or not math.isfinite(val):
        return "-"
    return f"{val:.2f}x"


def _fmt_num(val: float | None, decimals: int = 2) -> str:
    if val is None or not math.isfinite(val):
        return "-"
    return f"{val:.{decimals}f}"


def _growth_pct(curr: float | None, prev: float | None) -> float | None:
    if curr is None or prev is None or abs(prev) < 0.05:
        return None
    return ((curr - prev) / abs(prev)) * 100.0


def _prune_empty_ratio_rows(
    rows: list[dict[str, Any]],
    formula_pairs: list[tuple[str, str]],
) -> tuple[list[dict[str, Any]], list[str]]:
    kept_rows = [
        r for r in rows
        if any(str(v or "").strip() not in ("", "-", "--", "N/A") for v in r.get("values") or [])
    ]
    kept_labels = {r["label"] for r in kept_rows}
    kept_formulas = [f"{lbl}: {expr}" for lbl, expr in formula_pairs if lbl in kept_labels]
    return kept_rows, kept_formulas


def _extract_schedule_num(
    sched_dict: dict[str, Any] | None,
    item_aliases: tuple[str, ...],
    period: str,
) -> float | None:
    if not isinstance(sched_dict, dict) or not period:
        return None
    low_map = {str(k).strip().lower(): v for k, v in sched_dict.items() if isinstance(v, dict)}
    for alias in item_aliases:
        item = low_map.get(alias.lower())
        if isinstance(item, dict) and period in item:
            return _parse_screener_num(str(item.get(period) or ""))
    return None


def _compute_quarterly_ratios_table(
    q_full: dict[str, Any],
    y_full: dict[str, Any],
    sa_q_full: dict[str, Any] | None = None,
    sa_y_full: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute Quarterly Ratios (Up to Last 8 Quarters + TTM) from Screener data, adapting cleanly for Banks."""
    q_map_primary = _table_row_map(q_full)
    y_map_primary = _table_row_map(y_full)
    is_bank = (
        ("financing profit" in q_map_primary)
        or ("financing profit" in y_map_primary)
        or ("revenue" in q_map_primary and "sales" not in q_map_primary)
    )

    # For Consolidated Banks (which bundle life/general insurance premiums & distort NPA/Expenses),
    # use the bank's Standalone quarterly/annual book when available for accurate banking ratios.
    use_sa = bool(is_bank and sa_q_full and (sa_q_full.get("headers") or []))
    q_src = sa_q_full if use_sa else q_full
    y_src = sa_y_full if (use_sa and sa_y_full and (sa_y_full.get("headers") or [])) else y_full

    q_headers: list[str] = list((q_src or {}).get("headers") or [])
    y_headers: list[str] = list((y_src or {}).get("headers") or [])
    if not q_headers:
        return {"headers": [], "rows": [], "formulas": [], "is_bank": is_bank}

    q_map = _table_row_map(q_src or {})
    y_map = _table_row_map(y_src or {})

    sales_keys = ("sales", "revenue")
    op_keys = ("financing profit", "operating profit")
    opm_keys = ("financing margin %", "opm %")
    pbt_keys = ("profit before tax",)
    np_keys = ("net profit",)
    oi_keys = ("other income",)
    int_keys = ("interest",)
    exp_keys = ("expenses",)
    tax_keys = ("tax %",)
    eps_keys = ("eps in rs",)
    yoy_sales_keys = ("yoy sales growth", "yoy revenue growth")

    selected_q_indices = list(range(max(0, len(q_headers) - 8), len(q_headers)))
    ttm_y_idx = next((i for i, h in enumerate(y_headers) if h.strip().upper() == "TTM"), None)

    out_headers = [q_headers[i] for i in selected_q_indices]
    if ttm_y_idx is not None:
        out_headers.append("TTM")

    n_q = len(q_headers)

    def _sum_q_window(aliases: tuple[str, ...], end_excl: int, length: int = 4) -> float | None:
        start = end_excl - length
        if start < 0:
            return None
        vals: list[float] = []
        for idx in range(start, end_excl):
            num, _ = _lookup_row_val(q_map, aliases, idx)
            if num is None:
                return None
            vals.append(num)
        return sum(vals)

    metric_specs: list[tuple[str, str, str, list[str]]] = []

    def add_row(label: str, category: str, formula: str) -> list[str]:
        vals: list[str] = []
        metric_specs.append((label, category, formula, vals))
        return vals

    if is_bank:
        r_sales_yoy = add_row("Interest Earned (Revenue) YoY Growth (%)", "Growth", "[ (Interest Earned_Q(t) − Interest Earned_Q(t-4)) / |Interest Earned_Q(t-4)| ] × 100 (TTM: trailing 4Q vs prior 4Q)")
        r_sales_qoq = add_row("Interest Earned (Revenue) QoQ Growth (%)", "Growth", "[ (Interest Earned_Q(t) − Interest Earned_Q(t-1)) / |Interest Earned_Q(t-1)| ] × 100")
        r_nii_yoy = add_row("Net Interest Income (NII) YoY Growth (%)", "Growth", "NII = Interest Earned − Interest Expended; [ (NII_Q(t) − NII_Q(t-4)) / |NII_Q(t-4)| ] × 100")
        r_np_yoy = add_row("Net Profit YoY Growth (%)", "Growth", "[ (Net Profit_Q(t) − Net Profit_Q(t-4)) / |Net Profit_Q(t-4)| ] × 100")
        r_np_qoq = add_row("Net Profit QoQ Growth (%)", "Growth", "[ (Net Profit_Q(t) − Net Profit_Q(t-1)) / |Net Profit_Q(t-1)| ] × 100")
        r_nii_spread = add_row("NII Spread — NII / Revenue (%)", "Spread & Margins", "[ (Interest Earned − Interest Expended) / Interest Earned ] × 100")
        r_opm = add_row("Financing Margin (%)", "Spread & Margins", "(Financing Profit / Interest Earned) × 100")
        r_cti = add_row("Cost-to-Income (incl. Provisions %)", "Spread & Margins", "[ Operating Expenses / (NII + Other Income) ] × 100")
        r_oi_tot = add_row("Other Income vs Total Income (%)", "Income Mix & Margins", "[ Other Income / (Interest Earned + Other Income) ] × 100")
        r_non_int = add_row("Non-Interest Income Share — Other Inc / (NII + Other Inc) (%)", "Income Mix & Margins", "[ Other Income / (NII + Other Income) ] × 100")
        r_npm = add_row("Net Profit Margin — NPM (%)", "Income Mix & Margins", "(Net Profit after Tax / Interest Earned) × 100")
        r_gnpa = add_row("Gross NPA (%)", "Asset Quality", "(Gross Non-Performing Assets / Gross Advances) × 100 (Reported Standalone Bank Book)")
        r_nnpa = add_row("Net NPA (%)", "Asset Quality", "(Net Non-Performing Assets / Net Advances) × 100 (Reported Standalone Bank Book)")
        r_pcr = add_row("Provision Coverage Proxy (%)", "Asset Quality", "[ (Gross NPA % − Net NPA %) / Gross NPA % ] × 100")
        r_tax = add_row("Effective Tax Rate (%)", "Tax & Per Share", "Reported Tax % or [ (Profit Before Tax − Net Profit) / Profit Before Tax ] × 100")
        r_eps = add_row("EPS (Rs)", "Tax & Per Share", "Net Profit after Tax / Number of Diluted Equity Shares (₹ per share)")

        def _append_bank_period(rev: float | None, rev_prev_q: float | None, rev_prev_y: float | None,
                                intr: float | None, intr_prev_y: float | None,
                                exp: float | None, op: float | None, opm_rep: float | None,
                                oi: float | None, pbt: float | None, np_v: float | None,
                                np_prev_q: float | None, np_prev_y: float | None,
                                yoy_rep: float | None, gnpa_v: float | None, nnpa_v: float | None,
                                tax_rep: float | None, eps_v: float | None, eps_raw: str,
                                is_ttm: bool = False, nii_yoy_override: float | None = None) -> None:
            s_yoy = _growth_pct(rev, rev_prev_y) if not is_ttm else nii_yoy_override
            if is_ttm and rev is not None and rev_prev_y is not None:
                s_yoy = nii_yoy_override if nii_yoy_override is not None else _growth_pct(rev, rev_prev_y)
            if s_yoy is None:
                s_yoy = yoy_rep
            r_sales_yoy.append(_fmt_pct(s_yoy, signed=True))
            r_sales_qoq.append("-" if is_ttm else _fmt_pct(_growth_pct(rev, rev_prev_q), signed=True))

            nii_curr = (rev - intr) if (rev is not None and intr is not None) else None
            nii_prev_y = (rev_prev_y - intr_prev_y) if (rev_prev_y is not None and intr_prev_y is not None) else None
            r_nii_yoy.append(_fmt_pct(_growth_pct(nii_curr, nii_prev_y), signed=True))

            r_np_yoy.append(_fmt_pct(_growth_pct(np_v, np_prev_y), signed=True))
            r_np_qoq.append("-" if is_ttm else _fmt_pct(_growth_pct(np_v, np_prev_q), signed=True))

            r_nii_spread.append(_fmt_pct((nii_curr / rev * 100.0) if (nii_curr is not None and rev and abs(rev) > 0) else None))
            opm_val = (op / rev * 100.0) if (op is not None and rev and abs(rev) > 0) else opm_rep
            r_opm.append(_fmt_pct(opm_val))

            op_inc = ((nii_curr or 0.0) + (oi or 0.0)) if (nii_curr is not None or oi is not None) else None
            r_cti.append(_fmt_pct((exp / op_inc * 100.0) if (exp is not None and op_inc and op_inc > 0.05) else None))

            tot_inc = ((rev or 0.0) + (oi or 0.0)) if (rev is not None and oi is not None) else None
            r_oi_tot.append(_fmt_pct((oi / tot_inc * 100.0) if (oi is not None and tot_inc and tot_inc > 0.05) else None))
            r_non_int.append(_fmt_pct((oi / op_inc * 100.0) if (oi is not None and op_inc and op_inc > 0.05) else None))
            r_npm.append(_fmt_pct((np_v / rev * 100.0) if (np_v is not None and rev and abs(rev) > 0) else None))

            r_gnpa.append(_fmt_pct(gnpa_v) if not is_ttm else "-")
            r_nnpa.append(_fmt_pct(nnpa_v) if not is_ttm else "-")
            pcr_v = ((gnpa_v - nnpa_v) / gnpa_v * 100.0) if (not is_ttm and gnpa_v is not None and nnpa_v is not None and gnpa_v > 0.01) else None
            r_pcr.append(_fmt_pct(pcr_v))

            tax_v = tax_rep
            if tax_v is None and pbt and pbt > 0 and np_v is not None:
                tax_v = (pbt - np_v) / pbt * 100.0
            r_tax.append(_fmt_pct(tax_v))
            r_eps.append(_fmt_num(eps_v, 2) if eps_v is not None else (eps_raw or "-"))

        for qi in selected_q_indices:
            rev, _ = _lookup_row_val(q_map, sales_keys, qi)
            rev_pq, _ = _lookup_row_val(q_map, sales_keys, qi - 1) if qi >= 1 else (None, "-")
            rev_py, _ = _lookup_row_val(q_map, sales_keys, qi - 4) if qi >= 4 else (None, "-")
            intr, _ = _lookup_row_val(q_map, int_keys, qi)
            intr_py, _ = _lookup_row_val(q_map, int_keys, qi - 4) if qi >= 4 else (None, "-")
            exp, _ = _lookup_row_val(q_map, exp_keys, qi)
            op, _ = _lookup_row_val(q_map, op_keys, qi)
            opm_rep, _ = _lookup_row_val(q_map, opm_keys, qi)
            oi, _ = _lookup_row_val(q_map, oi_keys, qi)
            pbt, _ = _lookup_row_val(q_map, pbt_keys, qi)
            np_v, _ = _lookup_row_val(q_map, np_keys, qi)
            np_pq, _ = _lookup_row_val(q_map, np_keys, qi - 1) if qi >= 1 else (None, "-")
            np_py, _ = _lookup_row_val(q_map, np_keys, qi - 4) if qi >= 4 else (None, "-")
            yoy_rep, _ = _lookup_row_val(q_map, yoy_sales_keys, qi)
            gnpa_v, _ = _lookup_row_val(q_map, ("gross npa %",), qi)
            nnpa_v, _ = _lookup_row_val(q_map, ("net npa %",), qi)
            tax_rep, _ = _lookup_row_val(q_map, tax_keys, qi)
            eps_v, eps_raw = _lookup_row_val(q_map, eps_keys, qi)
            _append_bank_period(
                rev, rev_pq, rev_py, intr, intr_py, exp, op, opm_rep,
                oi, pbt, np_v, np_pq, np_py, yoy_rep, gnpa_v, nnpa_v, tax_rep, eps_v, eps_raw
            )

        if ttm_y_idx is not None:
            rev_ttm, _ = _lookup_row_val(y_map, sales_keys, ttm_y_idx)
            q4_rev_c = _sum_q_window(sales_keys, n_q, 4)
            q4_rev_p = _sum_q_window(sales_keys, n_q - 4, 4)
            q4_int_c = _sum_q_window(int_keys, n_q, 4)
            q4_int_p = _sum_q_window(int_keys, n_q - 4, 4)
            ttm_rev_yoy = _growth_pct(q4_rev_c, q4_rev_p)
            if ttm_rev_yoy is None:
                ttm_rev_yoy, _ = _lookup_row_val(y_map, ("sales growth", "revenue growth"), ttm_y_idx)

            np_ttm, _ = _lookup_row_val(y_map, np_keys, ttm_y_idx)
            q4_np_c = _sum_q_window(np_keys, n_q, 4)
            q4_np_p = _sum_q_window(np_keys, n_q - 4, 4)
            np_prev_fy, _ = _lookup_row_val(y_map, np_keys, ttm_y_idx - 1) if ttm_y_idx >= 1 else (None, "-")
            ttm_np_prev = q4_np_p if (q4_np_c is not None and q4_np_p is not None) else np_prev_fy
            ttm_np_for_yoy = q4_np_c if (q4_np_c is not None and q4_np_p is not None) else np_ttm

            intr_ttm, _ = _lookup_row_val(y_map, int_keys, ttm_y_idx)
            exp_ttm, _ = _lookup_row_val(y_map, exp_keys, ttm_y_idx)
            op_ttm, _ = _lookup_row_val(y_map, op_keys, ttm_y_idx)
            opm_ttm_rep, _ = _lookup_row_val(y_map, opm_keys, ttm_y_idx)
            oi_ttm, _ = _lookup_row_val(y_map, oi_keys, ttm_y_idx)
            pbt_ttm, _ = _lookup_row_val(y_map, pbt_keys, ttm_y_idx)
            tax_ttm, _ = _lookup_row_val(y_map, tax_keys, ttm_y_idx)
            eps_ttm, eps_ttm_raw = _lookup_row_val(y_map, eps_keys, ttm_y_idx)

            _append_bank_period(
                rev_ttm, None, None, intr_ttm, None, exp_ttm, op_ttm, opm_ttm_rep,
                oi_ttm, pbt_ttm, ttm_np_for_yoy, None, ttm_np_prev, ttm_rev_yoy, None, None,
                tax_ttm, eps_ttm, eps_ttm_raw, is_ttm=True, nii_yoy_override=ttm_rev_yoy
            )
            # Replace TTM NII YoY & NPM/NP using 4Q trailing NII comparison + actual TTM net profit
            if q4_rev_c is not None and q4_rev_p is not None and q4_int_c is not None and q4_int_p is not None:
                r_nii_yoy[-1] = _fmt_pct(_growth_pct(q4_rev_c - q4_int_c, q4_rev_p - q4_int_p), signed=True)
            if np_ttm is not None and rev_ttm and abs(rev_ttm) > 0:
                r_npm[-1] = _fmt_pct(np_ttm / rev_ttm * 100.0)

        raw_rows = [{"label": lbl, "category": cat, "values": vals} for lbl, cat, _, vals in metric_specs]
        formula_pairs = [(lbl, form) for lbl, _, form, _ in metric_specs]
        kept_rows, kept_formulas = _prune_empty_ratio_rows(raw_rows, formula_pairs)
        return {
            "headers": out_headers,
            "rows": kept_rows,
            "formulas": kept_formulas,
            "is_bank": True,
            "scope": "Standalone Bank Book" if use_sa else "Bank Book",
        }

    # --- Standard Corporate Quarterly Ratios (Up to 8 Quarters + TTM) ---
    r_sales_yoy = add_row("Sales YoY Growth (%)", "Growth", "(Sales_Q(t) - Sales_Q(t-4)) / |Sales_Q(t-4)| × 100 (TTM uses 4Q trailing vs prior 4Q)")
    r_sales_qoq = add_row("Sales QoQ Growth (%)", "Growth", "(Sales_Q(t) - Sales_Q(t-1)) / |Sales_Q(t-1)| × 100")
    r_np_yoy = add_row("Net Profit YoY Growth (%)", "Growth", "(Net Profit_Q(t) - Net Profit_Q(t-4)) / |Net Profit_Q(t-4)| × 100 (TTM uses 4Q trailing vs prior 4Q)")
    r_np_qoq = add_row("Net Profit QoQ Growth (%)", "Growth", "(Net Profit_Q(t) - Net Profit_Q(t-1)) / |Net Profit_Q(t-1)| × 100")
    r_op_yoy = add_row("Operating Profit YoY Growth (%)", "Growth", "(Operating Profit_Q(t) - Operating Profit_Q(t-4)) / |Operating Profit_Q(t-4)| × 100")
    r_opm = add_row("Operating Margin — OPM (%)", "Margins", "Operating Profit / Sales × 100 (Screener reported % when matched)")
    r_pbt_m = add_row("Pre-Tax Margin — PBT (%)", "Margins", "Profit before tax / Sales × 100")
    r_npm = add_row("Net Profit Margin — NPM (%)", "Margins", "Net Profit / Sales × 100")
    r_oi_tot = add_row("Other Income vs Total Income (%)", "Earnings Quality & Coverage", "Other Income / (Sales + Other Income) × 100")
    r_oi_pbt = add_row("Other Income / PBT (%)", "Earnings Quality & Coverage", "Other Income / Profit before tax × 100 (shown when PBT > 0)")
    r_ic = add_row("Interest Coverage (x)", "Earnings Quality & Coverage", "(Profit before tax + Interest) / Interest")
    r_tax = add_row("Effective Tax Rate (%)", "Earnings Quality & Coverage", "Screener Tax % (or (PBT - Net Profit) / PBT × 100)")
    r_eps = add_row("EPS (Rs)", "Per Share", "Screener diluted quarterly / TTM Earnings Per Share (Rs)")

    for qi in selected_q_indices:
        s_t, _ = _lookup_row_val(q_map, sales_keys, qi)
        s_prev_q, _ = _lookup_row_val(q_map, sales_keys, qi - 1) if qi >= 1 else (None, "-")
        s_prev_y, _ = _lookup_row_val(q_map, sales_keys, qi - 4) if qi >= 4 else (None, "-")
        yoy_s_calc = _growth_pct(s_t, s_prev_y)
        if yoy_s_calc is None:
            yoy_s_calc, _ = _lookup_row_val(q_map, yoy_sales_keys, qi)
        r_sales_yoy.append(_fmt_pct(yoy_s_calc, signed=True))
        r_sales_qoq.append(_fmt_pct(_growth_pct(s_t, s_prev_q), signed=True))

        np_t, _ = _lookup_row_val(q_map, np_keys, qi)
        np_prev_q, _ = _lookup_row_val(q_map, np_keys, qi - 1) if qi >= 1 else (None, "-")
        np_prev_y, _ = _lookup_row_val(q_map, np_keys, qi - 4) if qi >= 4 else (None, "-")
        r_np_yoy.append(_fmt_pct(_growth_pct(np_t, np_prev_y), signed=True))
        r_np_qoq.append(_fmt_pct(_growth_pct(np_t, np_prev_q), signed=True))

        op_t, _ = _lookup_row_val(q_map, op_keys, qi)
        opm_t, _ = _lookup_row_val(q_map, opm_keys, qi)
        op_prev_y, _ = _lookup_row_val(q_map, op_keys, qi - 4) if qi >= 4 else (None, "-")
        r_op_yoy.append(_fmt_pct(_growth_pct(op_t, op_prev_y), signed=True))

        opm_val = (op_t / s_t * 100.0) if (op_t is not None and s_t and abs(s_t) > 0) else opm_t
        r_opm.append(_fmt_pct(opm_val))

        pbt_t, _ = _lookup_row_val(q_map, pbt_keys, qi)
        r_pbt_m.append(_fmt_pct((pbt_t / s_t * 100.0) if (pbt_t is not None and s_t and abs(s_t) > 0) else None))
        r_npm.append(_fmt_pct((np_t / s_t * 100.0) if (np_t is not None and s_t and abs(s_t) > 0) else None))

        oi_t, _ = _lookup_row_val(q_map, oi_keys, qi)
        tot_inc_t = ((s_t or 0.0) + (oi_t or 0.0)) if (s_t is not None and oi_t is not None) else None
        r_oi_tot.append(_fmt_pct((oi_t / tot_inc_t * 100.0) if (oi_t is not None and tot_inc_t and tot_inc_t > 0.05) else None))
        r_oi_pbt.append(_fmt_pct((oi_t / pbt_t * 100.0) if (oi_t is not None and pbt_t and pbt_t > 0) else None))

        int_t, _ = _lookup_row_val(q_map, int_keys, qi)
        ic_val = ((pbt_t + int_t) / int_t) if (pbt_t is not None and int_t is not None and int_t >= 0.05) else None
        r_ic.append(_fmt_mult(ic_val))

        tax_t, _ = _lookup_row_val(q_map, tax_keys, qi)
        if tax_t is None and pbt_t and pbt_t > 0 and np_t is not None:
            tax_t = (pbt_t - np_t) / pbt_t * 100.0
        r_tax.append(_fmt_pct(tax_t))

        eps_t, eps_raw = _lookup_row_val(q_map, eps_keys, qi)
        r_eps.append(_fmt_num(eps_t, 2) if eps_t is not None else (eps_raw or "-"))

    if ttm_y_idx is not None:
        s_ttm, _ = _lookup_row_val(y_map, sales_keys, ttm_y_idx)
        q4_s_curr = _sum_q_window(sales_keys, n_q, 4)
        q4_s_prev = _sum_q_window(sales_keys, n_q - 4, 4)
        ttm_s_yoy = _growth_pct(q4_s_curr, q4_s_prev)
        if ttm_s_yoy is None:
            ttm_s_yoy, _ = _lookup_row_val(y_map, ("sales growth", "revenue growth"), ttm_y_idx)
        r_sales_yoy.append(_fmt_pct(ttm_s_yoy, signed=True))
        r_sales_qoq.append("-")

        np_ttm, _ = _lookup_row_val(y_map, np_keys, ttm_y_idx)
        q4_np_curr = _sum_q_window(np_keys, n_q, 4)
        q4_np_prev = _sum_q_window(np_keys, n_q - 4, 4)
        ttm_np_yoy = _growth_pct(q4_np_curr, q4_np_prev)
        if ttm_np_yoy is None and ttm_y_idx >= 1:
            np_prev_fy, _ = _lookup_row_val(y_map, np_keys, ttm_y_idx - 1)
            ttm_np_yoy = _growth_pct(np_ttm, np_prev_fy)
        r_np_yoy.append(_fmt_pct(ttm_np_yoy, signed=True))
        r_np_qoq.append("-")

        op_ttm, _ = _lookup_row_val(y_map, op_keys, ttm_y_idx)
        opm_ttm, _ = _lookup_row_val(y_map, opm_keys, ttm_y_idx)
        q4_op_curr = _sum_q_window(op_keys, n_q, 4)
        q4_op_prev = _sum_q_window(op_keys, n_q - 4, 4)
        ttm_op_yoy = _growth_pct(q4_op_curr, q4_op_prev)
        if ttm_op_yoy is None and ttm_y_idx >= 1:
            op_prev_fy, _ = _lookup_row_val(y_map, op_keys, ttm_y_idx - 1)
            ttm_op_yoy = _growth_pct(op_ttm, op_prev_fy)
        r_op_yoy.append(_fmt_pct(ttm_op_yoy, signed=True))

        opm_ttm_val = (op_ttm / s_ttm * 100.0) if (op_ttm is not None and s_ttm and abs(s_ttm) > 0) else opm_ttm
        r_opm.append(_fmt_pct(opm_ttm_val))

        pbt_ttm, _ = _lookup_row_val(y_map, pbt_keys, ttm_y_idx)
        r_pbt_m.append(_fmt_pct((pbt_ttm / s_ttm * 100.0) if (pbt_ttm is not None and s_ttm and abs(s_ttm) > 0) else None))
        r_npm.append(_fmt_pct((np_ttm / s_ttm * 100.0) if (np_ttm is not None and s_ttm and abs(s_ttm) > 0) else None))

        oi_ttm, _ = _lookup_row_val(y_map, oi_keys, ttm_y_idx)
        tot_inc_ttm = ((s_ttm or 0.0) + (oi_ttm or 0.0)) if (s_ttm is not None and oi_ttm is not None) else None
        r_oi_tot.append(_fmt_pct((oi_ttm / tot_inc_ttm * 100.0) if (oi_ttm is not None and tot_inc_ttm and tot_inc_ttm > 0.05) else None))
        r_oi_pbt.append(_fmt_pct((oi_ttm / pbt_ttm * 100.0) if (oi_ttm is not None and pbt_ttm and pbt_ttm > 0) else None))

        int_ttm, _ = _lookup_row_val(y_map, int_keys, ttm_y_idx)
        ic_ttm = ((pbt_ttm + int_ttm) / int_ttm) if (pbt_ttm is not None and int_ttm is not None and int_ttm >= 0.05) else None
        r_ic.append(_fmt_mult(ic_ttm))

        tax_ttm, _ = _lookup_row_val(y_map, tax_keys, ttm_y_idx)
        if tax_ttm is None and pbt_ttm and pbt_ttm > 0 and np_ttm is not None:
            tax_ttm = (pbt_ttm - np_ttm) / pbt_ttm * 100.0
        r_tax.append(_fmt_pct(tax_ttm))

        eps_ttm, eps_ttm_raw = _lookup_row_val(y_map, eps_keys, ttm_y_idx)
        r_eps.append(_fmt_num(eps_ttm, 2) if eps_ttm is not None else (eps_ttm_raw or "-"))

    raw_rows = [{"label": lbl, "category": cat, "values": vals} for lbl, cat, _, vals in metric_specs]
    formula_pairs = [(lbl, form) for lbl, _, form, _ in metric_specs]
    kept_rows, kept_formulas = _prune_empty_ratio_rows(raw_rows, formula_pairs)
    return {"headers": out_headers, "rows": kept_rows, "formulas": kept_formulas, "is_bank": False}


def _compute_yearly_ratios_table(
    y_full: dict[str, Any],
    bs_full: dict[str, Any],
    cf_full: dict[str, Any],
    rat_full: dict[str, Any],
    sa_y_full: dict[str, Any] | None = None,
    sa_bs_full: dict[str, Any] | None = None,
    bs_schedules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute Yearly Ratios (Up to Last 8 Full Years), including Liquidity & Consol-vs-Standalone or Banking Ratios."""
    y_map_primary = _table_row_map(y_full)
    bs_map_primary = _table_row_map(bs_full)
    is_bank = (
        ("financing profit" in y_map_primary)
        or ("deposits" in bs_map_primary)
        or ("revenue" in y_map_primary and "sales" not in y_map_primary)
    )

    has_standalone = bool(sa_y_full and (sa_y_full.get("headers") or []))
    use_sa = bool(is_bank and has_standalone)
    y_src = sa_y_full if use_sa else y_full
    bs_src = sa_bs_full if (use_sa and sa_bs_full and (sa_bs_full.get("headers") or [])) else bs_full

    y_headers: list[str] = list((y_src or {}).get("headers") or [])
    annual_pairs = [(i, h) for i, h in enumerate(y_headers) if h.strip().upper() != "TTM"]
    if not annual_pairs:
        return {"headers": [], "rows": [], "formulas": [], "is_bank": is_bank}
    selected_years = annual_pairs[-8:]
    out_headers = [h for _, h in selected_years]

    y_map = _table_row_map(y_src or {})
    bs_map = _table_row_map(bs_src or {})
    cf_map = _table_row_map(cf_full)
    rat_map = _table_row_map(rat_full)

    sa_y_map = _table_row_map(sa_y_full or {}) if has_standalone else {}
    sa_y_idx = {h: i for i, h in enumerate((sa_y_full or {}).get("headers") or [])}
    prim_y_idx = {h: i for i, h in enumerate(y_full.get("headers") or [])}

    bs_idx = {h: i for i, h in enumerate((bs_src or {}).get("headers") or [])}
    cf_idx = {h: i for i, h in enumerate(cf_full.get("headers") or [])}
    rat_idx = {h: i for i, h in enumerate(rat_full.get("headers") or [])}

    sales_keys = ("sales", "revenue")
    op_keys = ("financing profit", "operating profit")
    opm_keys = ("financing margin %", "opm %")
    pbt_keys = ("profit before tax",)
    np_keys = ("net profit",)
    oi_keys = ("other income",)
    int_keys = ("interest",)
    exp_keys = ("expenses",)
    div_keys = ("dividend payout %",)

    metric_specs: list[tuple[str, str, str, list[str]]] = []

    def add_row(label: str, category: str, formula: str) -> list[str]:
        vals: list[str] = []
        metric_specs.append((label, category, formula, vals))
        return vals

    if is_bank:
        r_rev_yoy = add_row("Interest Earned (Revenue) YoY Growth (%)", "Growth", "[ (Interest Earned_t − Interest Earned_{t-1}) / |Interest Earned_{t-1}| ] × 100")
        r_nii_yoy = add_row("Net Interest Income (NII) YoY Growth (%)", "Growth", "NII = Interest Earned − Interest Expended; [ (NII_t − NII_{t-1}) / |NII_{t-1}| ] × 100")
        r_dep_yoy = add_row("Deposits YoY Growth (%)", "Growth", "[ (Deposits_t − Deposits_{t-1}) / |Deposits_{t-1}| ] × 100")
        r_np_yoy = add_row("Net Profit YoY Growth (%)", "Growth", "[ (Net Profit_t − Net Profit_{t-1}) / |Net Profit_{t-1}| ] × 100")
        r_nim = add_row("Net Interest Margin Proxy — NII / Total Assets (%)", "Spread & Profitability", "[ (Interest Earned − Interest Expended) / Total Assets ] × 100")
        r_spread = add_row("NII Spread — NII / Revenue (%)", "Spread & Profitability", "[ (Interest Earned − Interest Expended) / Interest Earned ] × 100")
        r_opm = add_row("Financing Margin (%)", "Spread & Profitability", "(Financing Profit / Interest Earned) × 100")
        r_cti = add_row("Cost-to-Income (incl. Provisions %)", "Spread & Profitability", "[ Operating Expenses / (NII + Other Income) ] × 100")
        r_oi_tot = add_row("Other Income vs Total Income (%)", "Income Mix", "[ Other Income / (Interest Earned + Other Income) ] × 100")
        r_non_int = add_row("Non-Interest Income Share (%)", "Income Mix", "[ Other Income / (NII + Other Income) ] × 100")
        r_npm = add_row("Net Profit Margin — NPM (%)", "Income Mix", "(Net Profit after Tax / Interest Earned) × 100")
        r_roe = add_row("Return on Equity — ROE (%)", "Capital Returns & Leverage", "[ Net Profit after Tax / (Equity Share Capital + Reserves) ] × 100")
        r_roa = add_row("Return on Assets — ROA (%)", "Capital Returns & Leverage", "(Net Profit after Tax / Total Assets) × 100")
        r_assets_eq = add_row("Asset Leverage (Assets / Net Worth x)", "Capital Returns & Leverage", "Total Balance-Sheet Assets / (Equity Share Capital + Reserves)")
        r_ldr = add_row("LDR (%) [Credit-to-Deposit Ratio]", "Asset Quality", "(Loans & Advances / Customer Deposits) × 100")
        r_borr_dep = add_row("Borrowings / Deposits (%)", "Asset Quality", "(Non-Deposit Wholesale Borrowings / Customer Deposits) × 100")
        r_cap_assets = add_row("Equity / Total Assets (%)", "Asset Quality", "[ (Equity Share Capital + Reserves) / Total Assets ] × 100 (Capital Buffer Cushion)")
        r_inv_dep = add_row("Investments / Deposits (%)", "Funding & Treasury Mix", "(Total Investments / Customer Deposits) × 100 (Treasury / SLR Liquidity Buffer)")
        r_sa_rev = add_row("Standalone vs Consolidated Revenue (%)", "Standalone vs Consolidated", "(Standalone Revenue / Consolidated Revenue) × 100") if has_standalone else []
        r_sa_np = add_row("Standalone vs Consolidated Net Profit (%)", "Standalone vs Consolidated", "(Standalone Net Profit / Consolidated Net Profit) × 100") if has_standalone else []
        r_payout = add_row("Dividend Payout (%)", "Payout", "(Dividends Disbursed / Net Profit after Tax) × 100")

        sched_assets = (bs_schedules or {}).get("other_assets")
        for yi, yr in selected_years:
            bi = bs_idx.get(yr)
            ri = rat_idx.get(yr)
            rev_t, _ = _lookup_row_val(y_map, sales_keys, yi)
            rev_prev, _ = _lookup_row_val(y_map, sales_keys, yi - 1) if yi >= 1 else (None, "-")
            rev_yoy = _growth_pct(rev_t, rev_prev)
            if rev_yoy is None:
                rev_yoy, _ = _lookup_row_val(y_map, ("sales growth", "revenue growth"), yi)
            r_rev_yoy.append(_fmt_pct(rev_yoy, signed=True))

            intr_t, _ = _lookup_row_val(y_map, int_keys, yi)
            intr_prev, _ = _lookup_row_val(y_map, int_keys, yi - 1) if yi >= 1 else (None, "-")
            nii_t = (rev_t - intr_t) if (rev_t is not None and intr_t is not None) else None
            nii_prev = (rev_prev - intr_prev) if (rev_prev is not None and intr_prev is not None) else None
            r_nii_yoy.append(_fmt_pct(_growth_pct(nii_t, nii_prev), signed=True))

            dep_t, _ = _lookup_row_val(bs_map, ("deposits",), bi) if bi is not None else (None, "-")
            dep_prev, _ = _lookup_row_val(bs_map, ("deposits",), bi - 1) if (bi is not None and bi >= 1) else (None, "-")
            r_dep_yoy.append(_fmt_pct(_growth_pct(dep_t, dep_prev), signed=True))

            np_t, _ = _lookup_row_val(y_map, np_keys, yi)
            np_prev, _ = _lookup_row_val(y_map, np_keys, yi - 1) if yi >= 1 else (None, "-")
            r_np_yoy.append(_fmt_pct(_growth_pct(np_t, np_prev), signed=True))

            tot_assets, _ = _lookup_row_val(bs_map, ("total assets", "total liabilities"), bi) if bi is not None else (None, "-")
            r_nim.append(_fmt_pct((nii_t / tot_assets * 100.0) if (nii_t is not None and tot_assets and tot_assets > 0.05) else None))
            r_spread.append(_fmt_pct((nii_t / rev_t * 100.0) if (nii_t is not None and rev_t and abs(rev_t) > 0) else None))

            op_t, _ = _lookup_row_val(y_map, op_keys, yi)
            opm_t, _ = _lookup_row_val(y_map, opm_keys, yi)
            r_opm.append(_fmt_pct((op_t / rev_t * 100.0) if (op_t is not None and rev_t and abs(rev_t) > 0) else opm_t))

            exp_t, _ = _lookup_row_val(y_map, exp_keys, yi)
            oi_t, _ = _lookup_row_val(y_map, oi_keys, yi)
            op_inc = ((nii_t or 0.0) + (oi_t or 0.0)) if (nii_t is not None or oi_t is not None) else None
            r_cti.append(_fmt_pct((exp_t / op_inc * 100.0) if (exp_t is not None and op_inc and op_inc > 0.05) else None))

            tot_inc = ((rev_t or 0.0) + (oi_t or 0.0)) if (rev_t is not None and oi_t is not None) else None
            r_oi_tot.append(_fmt_pct((oi_t / tot_inc * 100.0) if (oi_t is not None and tot_inc and tot_inc > 0.05) else None))
            r_non_int.append(_fmt_pct((oi_t / op_inc * 100.0) if (oi_t is not None and op_inc and op_inc > 0.05) else None))
            r_npm.append(_fmt_pct((np_t / rev_t * 100.0) if (np_t is not None and rev_t and abs(rev_t) > 0) else None))

            eq_cap, _ = _lookup_row_val(bs_map, ("equity capital",), bi) if bi is not None else (None, "-")
            reserves, _ = _lookup_row_val(bs_map, ("reserves",), bi) if bi is not None else (None, "-")
            net_worth = ((eq_cap or 0.0) + (reserves or 0.0)) if (eq_cap is not None or reserves is not None) else None
            roe_v = (np_t / net_worth * 100.0) if (np_t is not None and net_worth and net_worth > 0.05) else None
            if roe_v is None and ri is not None:
                roe_v, _ = _lookup_row_val(rat_map, ("roe %",), ri)
            r_roe.append(_fmt_pct(roe_v))
            r_roa.append(_fmt_pct((np_t / tot_assets * 100.0) if (np_t is not None and tot_assets and tot_assets > 0.05) else None))
            r_cap_assets.append(_fmt_pct((net_worth / tot_assets * 100.0) if (net_worth is not None and tot_assets and tot_assets > 0.05) else None))
            r_assets_eq.append(_fmt_mult((tot_assets / net_worth) if (tot_assets is not None and net_worth and net_worth > 0.05) else None))

            loans_adv = _extract_schedule_num(sched_assets, ("loans n advances", "loans & advances", "advances"), yr) if sched_assets else None
            if loans_adv is None:
                loans_adv, _ = _lookup_row_val(bs_map, ("other assets", "advances"), bi) if bi is not None else (None, "-")
            ldr_v = (loans_adv / dep_t * 100.0) if (loans_adv is not None and dep_t and dep_t > 0.05) else None
            r_ldr.append(_fmt_pct(ldr_v))

            borr_t, _ = _lookup_row_val(bs_map, ("borrowings", "borrowing"), bi) if bi is not None else (None, "-")
            inv_t, _ = _lookup_row_val(bs_map, ("investments",), bi) if bi is not None else (None, "-")
            r_borr_dep.append(_fmt_pct((borr_t / dep_t * 100.0) if (borr_t is not None and dep_t and dep_t > 0.05) else None))
            r_inv_dep.append(_fmt_pct((inv_t / dep_t * 100.0) if (inv_t is not None and dep_t and dep_t > 0.05) else None))

            if has_standalone:
                pi = prim_y_idx.get(yr)
                c_rev, _ = _lookup_row_val(y_map_primary, sales_keys, pi) if pi is not None else (None, "-")
                c_np, _ = _lookup_row_val(y_map_primary, np_keys, pi) if pi is not None else (None, "-")
                r_sa_rev.append(_fmt_pct((rev_t / c_rev * 100.0) if (rev_t is not None and c_rev and abs(c_rev) > 0.05) else None))
                r_sa_np.append(_fmt_pct((np_t / c_np * 100.0) if (np_t is not None and c_np and abs(c_np) > 0.05) else None))

            pay_t, _ = _lookup_row_val(y_map, div_keys, yi)
            r_payout.append(_fmt_pct(pay_t))

        raw_rows = [{"label": lbl, "category": cat, "values": vals} for lbl, cat, _, vals in metric_specs]
        formula_pairs = [(lbl, form) for lbl, _, form, _ in metric_specs]
        kept_rows, kept_formulas = _prune_empty_ratio_rows(raw_rows, formula_pairs)
        return {
            "headers": out_headers,
            "rows": kept_rows,
            "formulas": kept_formulas,
            "is_bank": True,
            "scope": "Standalone Bank Book" if use_sa else "Bank Book",
        }

    # --- Standard Corporate Yearly Ratios (Up to Last 8 Full Years) ---
    sched_assets = (bs_schedules or {}).get("other_assets")
    sched_liab = (bs_schedules or {}).get("other_liabilities")
    sched_borr = (bs_schedules or {}).get("borrowings")

    r_sales_yoy = add_row("Sales YoY Growth (%)", "Growth", "(Sales_t - Sales_(t-1)) / |Sales_(t-1)| × 100")
    r_np_yoy = add_row("Net Profit YoY Growth (%)", "Growth", "(Net Profit_t - Net Profit_(t-1)) / |Net Profit_(t-1)| × 100")
    r_opm = add_row("Operating Margin — OPM (%)", "Profitability & Income Mix", "Operating Profit / Sales × 100")
    r_pbt_m = add_row("Pre-Tax Margin — PBT (%)", "Profitability & Income Mix", "Profit before tax / Sales × 100")
    r_npm = add_row("Net Profit Margin — NPM (%)", "Profitability & Income Mix", "Net Profit / Sales × 100")
    r_oi_tot = add_row("Other Income vs Total Income (%)", "Profitability & Income Mix", "Other Income / (Sales + Other Income) × 100")
    r_curr = add_row("Current Ratio (x)", "Liquidity Ratios", "Current Assets (Other Assets) / Current Liabilities (Short term Borrowings + Non-NCI Other Liabilities)")
    r_quick = add_row("Quick Ratio (x)", "Liquidity Ratios", "(Current Assets - Inventories) / Current Liabilities")
    r_cash = add_row("Cash Ratio (x)", "Liquidity Ratios", "Cash & Cash Equivalents / Current Liabilities")
    r_roe = add_row("Return on Equity — ROE (%)", "Capital Returns", "Net Profit / (Equity Capital + Reserves) × 100")
    r_roce = add_row("ROCE (%)", "Capital Returns", "Screener ROCE % (or EBIT / (Equity Capital + Reserves + Borrowings) × 100)")
    r_roa = add_row("Return on Assets — ROA (%)", "Capital Returns", "Net Profit / Total Assets × 100")
    r_de = add_row("Debt-to-Equity (x)", "Solvency & Efficiency", "Borrowings / (Equity Capital + Reserves)")
    r_ic = add_row("Interest Coverage (x)", "Solvency & Efficiency", "(Profit before tax + Interest) / Interest")
    r_at = add_row("Asset Turnover (x)", "Solvency & Efficiency", "Sales / Total Assets")
    r_cfo_sales = add_row("CFO / Sales (%)", "Cash Flow & Payout", "Cash from Operating Activity / Sales × 100")
    r_cfo_ebitda = add_row("CFO / Operating Profit (%)", "Cash Flow & Payout", "Cash from Operating Activity / Operating Profit × 100 (or Screener CFO/EBITDA)")
    r_cfo_np = add_row("CFO / Net Profit (%)", "Cash Flow & Payout", "Cash from Operating Activity / Net Profit × 100 (when Net Profit > 0)")
    r_fcf_ocf = add_row("FCF / OCF (%)", "Cash Flow & Payout", "Free Cash Flow / Cash from Operating Activity × 100")
    r_fcf_np = add_row("FCF / Net Profit (%)", "Cash Flow & Payout", "Free Cash Flow / Net Profit × 100 (when Net Profit > 0)")
    r_payout = add_row("Dividend Payout (%)", "Cash Flow & Payout", "Screener Dividend Payout % (Dividends / Net Profit)")
    r_sa_rev = add_row("Standalone vs Consolidated Revenue (%)", "Standalone vs Consolidated", "Standalone Sales / Consolidated Sales × 100") if has_standalone else []
    r_sa_np = add_row("Standalone vs Consolidated Net Profit (%)", "Standalone vs Consolidated", "Standalone Net Profit / Consolidated Net Profit × 100") if has_standalone else []
    r_debtor = add_row("Debtor Days", "Working Capital", "Screener Trade Receivables / (Sales / 365)")
    r_inv = add_row("Inventory Days", "Working Capital", "Screener Inventory / (COGS or Sales / 365)")
    r_payable = add_row("Days Payable", "Working Capital", "Screener Trade Payables / (Purchases or Expenses / 365)")
    r_ccc = add_row("Cash Conversion Cycle (Days)", "Working Capital", "Debtor Days + Inventory Days - Days Payable")
    r_wcd = add_row("Working Capital Days", "Working Capital", "Screener Net Working Capital Days")

    for yi, yr in selected_years:
        bi = bs_idx.get(yr)
        ci = cf_idx.get(yr)
        ri = rat_idx.get(yr)

        s_t, _ = _lookup_row_val(y_map, sales_keys, yi)
        s_prev, _ = _lookup_row_val(y_map, sales_keys, yi - 1) if yi >= 1 else (None, "-")
        s_yoy = _growth_pct(s_t, s_prev)
        if s_yoy is None:
            s_yoy, _ = _lookup_row_val(y_map, ("sales growth", "revenue growth"), yi)
        r_sales_yoy.append(_fmt_pct(s_yoy, signed=True))

        np_t, _ = _lookup_row_val(y_map, np_keys, yi)
        np_prev, _ = _lookup_row_val(y_map, np_keys, yi - 1) if yi >= 1 else (None, "-")
        r_np_yoy.append(_fmt_pct(_growth_pct(np_t, np_prev), signed=True))

        op_t, _ = _lookup_row_val(y_map, op_keys, yi)
        opm_t, _ = _lookup_row_val(y_map, opm_keys, yi)
        opm_val = (op_t / s_t * 100.0) if (op_t is not None and s_t and abs(s_t) > 0) else opm_t
        r_opm.append(_fmt_pct(opm_val))

        pbt_t, _ = _lookup_row_val(y_map, pbt_keys, yi)
        r_pbt_m.append(_fmt_pct((pbt_t / s_t * 100.0) if (pbt_t is not None and s_t and abs(s_t) > 0) else None))
        r_npm.append(_fmt_pct((np_t / s_t * 100.0) if (np_t is not None and s_t and abs(s_t) > 0) else None))

        oi_t, _ = _lookup_row_val(y_map, oi_keys, yi)
        tot_inc_t = ((s_t or 0.0) + (oi_t or 0.0)) if (s_t is not None and oi_t is not None) else None
        r_oi_tot.append(_fmt_pct((oi_t / tot_inc_t * 100.0) if (oi_t is not None and tot_inc_t and tot_inc_t > 0.05) else None))

        eq_cap, _ = _lookup_row_val(bs_map, ("equity capital",), bi) if bi is not None else (None, "-")
        reserves, _ = _lookup_row_val(bs_map, ("reserves",), bi) if bi is not None else (None, "-")
        net_worth = ((eq_cap or 0.0) + (reserves or 0.0)) if (eq_cap is not None or reserves is not None) else None
        tot_assets, _ = _lookup_row_val(bs_map, ("total assets", "total liabilities"), bi) if bi is not None else (None, "-")
        debt, _ = _lookup_row_val(bs_map, ("borrowings", "borrowing"), bi) if bi is not None else (None, "-")
        other_assets, _ = _lookup_row_val(bs_map, ("other assets",), bi) if bi is not None else (None, "-")
        other_liab, _ = _lookup_row_val(bs_map, ("other liabilities",), bi) if bi is not None else (None, "-")

        # Liquidity ratios from Screener BS + Schedules
        inv_s = _extract_schedule_num(sched_assets, ("inventories",), yr)
        cash_s = _extract_schedule_num(sched_assets, ("cash equivalents", "cash & cash equivalents"), yr)
        st_borr = _extract_schedule_num(sched_borr, ("short term borrowings",), yr)
        nci_liab = _extract_schedule_num(sched_liab, ("non controlling int", "non controlling interest"), yr)
        tp_s = _extract_schedule_num(sched_liab, ("trade payables",), yr)
        adv_s = _extract_schedule_num(sched_liab, ("advance from customers",), yr)
        oth_liab_s = _extract_schedule_num(sched_liab, ("other liability items",), yr)

        curr_assets = other_assets
        if curr_assets is None and sched_assets is not None:
            parts_a = [
                _extract_schedule_num(sched_assets, (k,), yr)
                for k in ("inventories", "trade receivables", "cash equivalents", "loans n advances", "other asset items")
            ]
            if any(p is not None for p in parts_a):
                curr_assets = sum(p or 0.0 for p in parts_a)

        curr_liab: float | None = None
        if other_liab is not None:
            curr_liab = max(0.0, other_liab - (nci_liab or 0.0)) + (st_borr or 0.0)
        elif any(x is not None for x in (tp_s, adv_s, oth_liab_s, st_borr)):
            curr_liab = (tp_s or 0.0) + (adv_s or 0.0) + (oth_liab_s or 0.0) + (st_borr or 0.0)

        if curr_assets is not None and curr_liab is not None and curr_liab > 0.05:
            r_curr.append(_fmt_mult(curr_assets / curr_liab))
            quick_num = (curr_assets - inv_s) if inv_s is not None else None
            r_quick.append(_fmt_mult(quick_num / curr_liab) if quick_num is not None else "-")
            r_cash.append(_fmt_mult(cash_s / curr_liab) if cash_s is not None else "-")
        else:
            r_curr.append("-")
            r_quick.append("-")
            r_cash.append("-")

        roe_val = (np_t / net_worth * 100.0) if (np_t is not None and net_worth is not None and net_worth > 0.05) else None
        if roe_val is None and ri is not None:
            roe_val, _ = _lookup_row_val(rat_map, ("roe %",), ri)
        r_roe.append(_fmt_pct(roe_val))

        int_t, _ = _lookup_row_val(y_map, int_keys, yi)
        roce_val, _ = _lookup_row_val(rat_map, ("roce %",), ri) if ri is not None else (None, "-")
        if roce_val is None and pbt_t is not None and net_worth is not None:
            cap_emp = net_worth + (debt or 0.0)
            if cap_emp > 0.05:
                roce_val = ((pbt_t + (int_t or 0.0)) / cap_emp) * 100.0
        r_roce.append(_fmt_pct(roce_val))

        r_roa.append(_fmt_pct((np_t / tot_assets * 100.0) if (np_t is not None and tot_assets and tot_assets > 0.05) else None))

        de_val = (debt / net_worth) if (debt is not None and net_worth is not None and net_worth > 0.05) else None
        r_de.append(_fmt_mult(de_val))
        ic_val = ((pbt_t + int_t) / int_t) if (pbt_t is not None and int_t is not None and int_t >= 0.05) else None
        r_ic.append(_fmt_mult(ic_val))

        r_at.append(_fmt_mult((s_t / tot_assets) if (s_t is not None and tot_assets and tot_assets > 0.05) else None))

        cfo_t, _ = _lookup_row_val(cf_map, ("cash from operating activity",), ci) if ci is not None else (None, "-")
        r_cfo_sales.append(_fmt_pct((cfo_t / s_t * 100.0) if (cfo_t is not None and s_t and abs(s_t) > 0.05) else None))
        cfo_op = (cfo_t / op_t * 100.0) if (cfo_t is not None and op_t is not None and abs(op_t) > 0.05) else None
        if cfo_op is None and ci is not None:
            cfo_op, _ = _lookup_row_val(cf_map, ("cfo/ebitda",), ci)
        r_cfo_ebitda.append(_fmt_pct(cfo_op))
        r_cfo_np.append(_fmt_pct((cfo_t / np_t * 100.0) if (cfo_t is not None and np_t is not None and np_t > 0.05) else None))

        fcf_t, _ = _lookup_row_val(cf_map, ("free cash flow",), ci) if ci is not None else (None, "-")
        r_fcf_ocf.append(_fmt_pct((fcf_t / cfo_t * 100.0) if (fcf_t is not None and cfo_t and abs(cfo_t) > 0.05) else None))
        r_fcf_np.append(_fmt_pct((fcf_t / np_t * 100.0) if (fcf_t is not None and np_t is not None and np_t > 0.05) else None))

        pay_t, _ = _lookup_row_val(y_map, div_keys, yi)
        r_payout.append(_fmt_pct(pay_t))

        if has_standalone:
            si = sa_y_idx.get(yr)
            sa_s, _ = _lookup_row_val(sa_y_map, sales_keys, si) if si is not None else (None, "-")
            sa_np, _ = _lookup_row_val(sa_y_map, np_keys, si) if si is not None else (None, "-")
            r_sa_rev.append(_fmt_pct((sa_s / s_t * 100.0) if (sa_s is not None and s_t and abs(s_t) > 0.05) else None))
            r_sa_np.append(_fmt_pct((sa_np / np_t * 100.0) if (sa_np is not None and np_t and abs(np_t) > 0.05) else None))

        for target_list, r_keys in (
            (r_debtor, ("debtor days",)),
            (r_inv, ("inventory days",)),
            (r_payable, ("days payable",)),
            (r_ccc, ("cash conversion cycle",)),
            (r_wcd, ("working capital days",)),
        ):
            r_val, _ = _lookup_row_val(rat_map, r_keys, ri) if ri is not None else (None, "-")
            target_list.append(str(int(round(r_val))) if r_val is not None else "-")

    raw_rows = [{"label": lbl, "category": cat, "values": vals} for lbl, cat, _, vals in metric_specs]
    formula_pairs = [(lbl, form) for lbl, _, form, _ in metric_specs]
    kept_rows, kept_formulas = _prune_empty_ratio_rows(raw_rows, formula_pairs)
    return {"headers": out_headers, "rows": kept_rows, "formulas": kept_formulas, "is_bank": False}


def parse_screener_financial_snapshot(
    main_html: str,
    standalone_html: str = "",
    bs_schedules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Deterministically extract financial snapshots and computed 8Q+TTM / 8Y Ratio tables."""
    empty_tbl = {"headers": [], "rows": []}
    empty_ratio_tbl = {"headers": [], "rows": [], "formulas": []}
    if not main_html:
        return {
            "quarterly_pnl": empty_tbl,
            "yearly_pnl": empty_tbl,
            "balance_sheet": empty_tbl,
            "cash_flow": empty_tbl,
            "ratios": empty_tbl,
            "quarterly_ratios": empty_ratio_tbl,
            "yearly_ratios": empty_ratio_tbl,
            "growth_ranges": [],
        }

    soup = BeautifulSoup(main_html, "html.parser")
    growth_ranges = []
    pl_sec = soup.select_one("#profit-loss")
    if pl_sec:
        for rt in pl_sec.select("table.ranges-table"):
            title_th = rt.select_one("th")
            title = " ".join(title_th.get_text(" ", strip=True).split()) if title_th else ""
            pairs = []
            for tr in rt.select("tr"):
                tds = [td.get_text(" ", strip=True) for td in tr.select("td")]
                if len(tds) >= 2:
                    pairs.append({"period": tds[0].rstrip(":"), "value": tds[1]})
            if title and pairs:
                growth_ranges.append({"metric": title, "items": pairs})

    q_full = _extract_screener_section_table(soup, "quarters", max_cols=20)
    y_full = _extract_screener_section_table(soup, "profit-loss", max_cols=20)
    bs_full = _extract_screener_section_table(soup, "balance-sheet", max_cols=20)
    cf_full = _extract_screener_section_table(soup, "cash-flow", max_cols=20)
    rat_full = _extract_screener_section_table(soup, "ratios", max_cols=20)

    sa_q_full = None
    sa_y_full = None
    sa_bs_full = None
    if standalone_html:
        sa_soup = BeautifulSoup(standalone_html, "html.parser")
        sa_q_full = _extract_screener_section_table(sa_soup, "quarters", max_cols=20)
        sa_y_full = _extract_screener_section_table(sa_soup, "profit-loss", max_cols=20)
        sa_bs_full = _extract_screener_section_table(sa_soup, "balance-sheet", max_cols=20)

    def _slice_cols(tbl: dict[str, Any], max_cols: int = 8) -> dict[str, Any]:
        hdrs = tbl.get("headers") or []
        if len(hdrs) <= max_cols:
            return tbl
        start = len(hdrs) - max_cols
        return {
            "headers": hdrs[start:],
            "rows": [
                {"label": r.get("label", ""), "values": (r.get("values") or [])[start:]}
                for r in tbl.get("rows") or []
            ],
        }

    return {
        "quarterly_pnl": _slice_cols(q_full, 8),
        "yearly_pnl": _slice_cols(y_full, 8),
        "balance_sheet": _slice_cols(bs_full, 8),
        "cash_flow": _slice_cols(cf_full, 8),
        "ratios": _slice_cols(rat_full, 8),
        "quarterly_ratios": _compute_quarterly_ratios_table(
            q_full, y_full, sa_q_full=sa_q_full, sa_y_full=sa_y_full
        ),
        "yearly_ratios": _compute_yearly_ratios_table(
            y_full, bs_full, cf_full, rat_full,
            sa_y_full=sa_y_full, sa_bs_full=sa_bs_full, bs_schedules=bs_schedules,
        ),
        "growth_ranges": growth_ranges,
    }


def parse_screener_financial_intelligence(
    main_html: str,
    standalone_html: str = "",
    peers_html: str = "",
    segments_html: str = "",
    promoters_data: dict[str, Any] | None = None,
    peer_comparison: dict[str, Any] | None = None,
    shareholding: dict[str, Any] | None = None,
    financial_snapshot: dict[str, Any] | None = None,
) -> str:
    """Extract structured verified financials, peers, promoters, segments, and consolidated vs standalone context."""
    soup = BeautifulSoup(main_html, "html.parser")
    lines: list[str] = []

    sector_links = [
        a.get_text(strip=True)
        for a in soup.select("#peers a[href*='/market/']")
        if a.get_text(strip=True)
    ]
    if sector_links:
        lines.append("SECTOR & INDUSTRY: " + " > ".join(sector_links))

    ratios = []
    for li in soup.select("#top-ratios li"):
        name_el = li.select_one(".name")
        val_el = li.select_one(".value")
        if name_el and val_el:
            r_name = " ".join(name_el.get_text(" ", strip=True).split())
            r_val = " ".join(val_el.get_text(" ", strip=True).split())
            if r_name and r_val:
                ratios.append(f"{r_name}: {r_val}")
    if ratios:
        lines.append("KEY RATIOS & METRICS: " + " | ".join(ratios))

    pros = [li.get_text(" ", strip=True) for li in soup.select("#analysis .pros li")]
    cons = [li.get_text(" ", strip=True) for li in soup.select("#analysis .cons li")]
    if pros:
        lines.append("SCREENER PROS: " + " ; ".join(pros))
    if cons:
        lines.append("SCREENER CONS / ALERTS: " + " ; ".join(cons))

    parsed_sh = shareholding or parse_screener_shareholding_section(main_html, promoters_data=promoters_data)
    for title_tag, block_key in [
        ("QUARTERLY SHAREHOLDING PATTERN (Up to 5 Quarters)", "quarterly"),
        ("YEARLY SHAREHOLDING PATTERN (Up to 5 Years)", "yearly"),
    ]:
        blk = parsed_sh.get(block_key) or {}
        hdrs = blk.get("headers") or []
        rws = blk.get("rows") or []
        if hdrs and rws:
            tbl_lines = ["Category | " + " | ".join(hdrs)]
            for r in rws:
                tbl_lines.append(f"{r.get('label', '')} | " + " | ".join(r.get("values") or []))
            lines.append(f"{title_tag}:\n  " + "\n  ".join(tbl_lines))

    if parsed_sh.get("pledged_pct"):
        lines.append(f"PROMOTER PLEDGED HOLDING: {parsed_sh['pledged_pct']}")

    named_proms = parsed_sh.get("named_promoters") or []
    if named_proms:
        lines.append(
            "NAMED PROMOTER SHAREHOLDERS:\n  "
            + "\n  ".join(f"{p['name']}: {p['latest_pct']} ({p['period']})" for p in named_proms[:12])
        )

    parsed_peers = peer_comparison or parse_screener_peers_section(main_html, peers_html=peers_html)
    peer_rows = parsed_peers.get("rows") or []
    peer_median = parsed_peers.get("median")
    if peer_rows:
        peer_headers = [
            "Company",
            "MCAP",
            "TTM sales",
            "Sales growth",
            "Profit growth",
            "OPM",
            "ROE",
            "ROA",
            "Payout",
            "CFO/EBIT%",
            "PE",
            "PB",
            "PS",
            "D.Yield",
        ]
        peer_lines = [" | ".join(peer_headers)]
        for pr in peer_rows:
            label = f"{pr.get('company', '')}{' [TARGET]' if pr.get('is_target') else ''}"
            peer_lines.append(
                " | ".join([
                    label,
                    str(pr.get("mcap") or "-"),
                    str(pr.get("ttm_sales") or "-"),
                    str(pr.get("sales_growth") or "-"),
                    str(pr.get("profit_growth") or "-"),
                    str(pr.get("opm") or "-"),
                    str(pr.get("roe") or "-"),
                    str(pr.get("roa") or "-"),
                    str(pr.get("payout") or "-"),
                    str(pr.get("cfo_ebit_pct") or "-"),
                    str(pr.get("pe") or "-"),
                    str(pr.get("pb") or "-"),
                    str(pr.get("ps") or "-"),
                    str(pr.get("d_yield") or "-"),
                ])
            )
        if isinstance(peer_median, dict) and peer_median.get("company"):
            peer_lines.append(
                " | ".join([
                    str(peer_median.get("company") or "Median"),
                    str(peer_median.get("mcap") or "-"),
                    str(peer_median.get("ttm_sales") or "-"),
                    str(peer_median.get("sales_growth") or "-"),
                    str(peer_median.get("profit_growth") or "-"),
                    str(peer_median.get("opm") or "-"),
                    str(peer_median.get("roe") or "-"),
                    str(peer_median.get("roa") or "-"),
                    str(peer_median.get("payout") or "-"),
                    str(peer_median.get("cfo_ebit_pct") or "-"),
                    str(peer_median.get("pe") or "-"),
                    str(peer_median.get("pb") or "-"),
                    str(peer_median.get("ps") or "-"),
                    str(peer_median.get("d_yield") or "-"),
                ])
            )
        lines.append("PEER COMPARISON TABLE (Screener #peers — All Peers + Sector Median; Footnote: " + PEER_COMPARISON_FOOTNOTE + "):\n  " + "\n  ".join(peer_lines))

    snap = financial_snapshot or parse_screener_financial_snapshot(main_html)

    def format_snap_table(title: str, tbl_data: dict[str, Any]) -> None:
        hdrs = tbl_data.get("headers") or []
        rws = tbl_data.get("rows") or []
        if not hdrs or not rws:
            return
        tbl_lines = ["Metric | " + " | ".join(hdrs)]
        for r in rws:
            tbl_lines.append(f"{r.get('label', '')} | " + " | ".join(r.get("values") or []))
        lines.append(f"{title}:\n  " + "\n  ".join(tbl_lines))

    format_snap_table("QUARTERLY P&L (Last 6 Quarters — Consol/Primary)", snap.get("quarterly_pnl") or {})
    format_snap_table("YEARLY P&L & TTM (Last 5 FYs + TTM)", snap.get("yearly_pnl") or {})

    gr_list = snap.get("growth_ranges") or []
    if gr_list:
        gr_str = " ; ".join(
            f"{g['metric']}: " + ", ".join(f"{it['period']}={it['value']}" for it in g.get("items") or [])
            for g in gr_list
        )
        lines.append("HISTORICAL GROWTH & ROE RANGES: " + gr_str)

    if segments_html:
        seg_soup = BeautifulSoup(segments_html, "html.parser")
        seg_tbl = seg_soup.select_one("table")
        if seg_tbl:
            seg_out = []
            for tr in seg_tbl.select("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
                if cells and any(c for c in cells[-2:]):
                    seg_out.append(f"{cells[0]} -> {cells[-3:]}")
            if seg_out:
                lines.append("AUDITED PRODUCT SEGMENTS (Sales & PBIT):\n  " + "\n  ".join(seg_out[:38]))

    format_snap_table("BALANCE SHEET (Last 5-6 Periods)", snap.get("balance_sheet") or {})
    format_snap_table("CASH FLOW STATEMENT (Last 5-6 Years)", snap.get("cash_flow") or {})
    format_snap_table("WORKING CAPITAL & EFFICIENCY RATIOS (Last 5-6 Years)", snap.get("ratios") or {})
    format_snap_table("COMPUTED QUARTERLY RATIOS (Last 5 Quarters + TTM)", snap.get("quarterly_ratios") or {})
    format_snap_table("COMPUTED YEARLY RATIOS (Last 5 Full Years)", snap.get("yearly_ratios") or {})

    if standalone_html:
        s_soup = BeautifulSoup(standalone_html, "html.parser")
        st_lines = []
        s_pl = s_soup.select_one("#profit-loss table")
        if s_pl:
            for tr in s_pl.select("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
                if cells and (cells[0] == "" or any(k in cells[0] for k in ["Sales", "Operating Profit", "OPM", "Net Profit"])):
                    st_lines.append(f"Standalone {cells[0] or 'Period'}: {cells[-4:]}")
        s_bs = s_soup.select_one("#balance-sheet table")
        if s_bs:
            for tr in s_bs.select("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
                if cells and (cells[0] == "" or any(k in cells[0] for k in ["Borrowings", "Reserves", "Total Liabilities"])):
                    st_lines.append(f"Standalone BS {cells[0] or 'Period'}: {cells[-3:]}")
        if st_lines:
            lines.append("STANDALONE FINANCIALS FOR COMPARISON:\n  " + "\n  ".join(st_lines))

    return "\n\n".join(lines)


def _extract_screener_market_docs(soup: BeautifulSoup) -> dict[str, Any]:
    """Extract Screener's #documents Credit ratings & Concalls links plus Stock P/E and exchange symbols."""
    ratings: list[dict[str, str]] = []
    concalls: list[dict[str, str]] = []
    screener_stock_pe = ""
    nse_symbol = ""
    bse_code = ""

    for block in soup.select("#documents .documents, .documents"):
        h = block.find(["h3", "h4"])
        htxt = (h.get_text(" ", strip=True).lower() if h else "")
        if "rating" in htxt:
            for a in block.select("a"):
                txt = " ".join(a.get_text(" ", strip=True).split())
                href = a.get("href") or ""
                if txt and href and not txt.lower().startswith("all"):
                    ratings.append({"title": txt, "url": href})
        elif "concall" in htxt:
            for a in block.select("a"):
                txt = " ".join(a.get_text(" ", strip=True).split())
                href = a.get("href") or ""
                if txt and href:
                    concalls.append({"title": txt, "url": href})

    for li in soup.select("#top-ratios li"):
        nm = li.select_one(".name")
        vl = li.select_one(".value")
        if nm and vl and "stock p/e" in nm.get_text().lower():
            screener_stock_pe = " ".join(vl.get_text(" ", strip=True).split())

    for a in soup.select(".company-links a, #top a[href*='nseindia.com'], #top a[href*='bseindia.com']"):
        href = a.get("href") or ""
        txt = " ".join(a.get_text(" ", strip=True).split())
        m_nse = re.search(r"NSE:\s*([A-Z0-9&._-]+)", txt, re.IGNORECASE)
        if m_nse and not nse_symbol:
            nse_symbol = m_nse.group(1).upper()
        m_bse = re.search(r"BSE:\s*(\d{5,7})", txt, re.IGNORECASE)
        if m_bse and not bse_code:
            bse_code = m_bse.group(1)
        if not nse_symbol and "nseindia.com" in href:
            m_q = re.search(r"symbol=([A-Z0-9&._-]+)", href, re.IGNORECASE)
            if m_q:
                nse_symbol = m_q.group(1).upper()
        if not bse_code and "bseindia.com" in href:
            m_b = re.search(r"/(\d{6})(?:/|$)", href)
            if m_b:
                bse_code = m_b.group(1)

    return {
        "ratings": ratings[:8],
        "concalls": concalls[:8],
        "stock_pe": screener_stock_pe,
        "nse_symbol": nse_symbol,
        "bse_code": bse_code,
    }


def parse_screener_ratios(soup: BeautifulSoup) -> dict[str, Any]:
    """Extract Screener #ratios table (Debtor Days, Inventory Days, Days Payable, CCC, Working Capital Days, etc.)."""
    r_sec = soup.select_one("#ratios")
    if not r_sec:
        return {}
    tbl = r_sec.select_one("table")
    if not tbl:
        return {}
    thead = tbl.select_one("thead")
    headers = [th.get_text(" ", strip=True) for th in thead.select("th")] if thead else []
    if not headers:
        first_tr = tbl.select_one("tr")
        if first_tr:
            headers = [th.get_text(" ", strip=True) for th in first_tr.select("th, td")]
    rows = []
    tbody = tbl.select_one("tbody") or tbl
    for tr in tbody.select("tr"):
        tds = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
        if tds and tds[0] and (not headers or tds[0] != headers[0]):
            lbl = tds[0].replace("+", "").strip()
            rows.append({"label": lbl, "values": tds[1:]})
    return {
        "headers": headers,
        "rows": rows,
    }


def fetch_screener_http(
    session: requests.Session,
    company_info: dict[str, Any],
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Fetch Screener pages, Read More commentary, peers, segments & promoters over HTTP."""
    symbol = str(company_info.get("symbol") or "").strip().upper()
    raw_path = str(company_info.get("url_path") or "").strip()
    primary_url = urllib.parse.urljoin("https://www.screener.in", raw_path or (f"/company/{symbol}/consolidated/" if symbol else ""))
    main_html = ""
    final_url = primary_url

    candidate_urls: list[str] = []
    if symbol:
        candidate_urls.append(f"https://www.screener.in/company/{symbol}/consolidated/")
        candidate_urls.append(f"https://www.screener.in/company/{symbol}/")
    if primary_url and primary_url not in candidate_urls:
        candidate_urls.append(primary_url)
    if "/consolidated/" in primary_url:
        fallback_std = primary_url.replace("/consolidated/", "/")
        if fallback_std not in candidate_urls:
            candidate_urls.append(fallback_std)

    for target_url in candidate_urls:
        try:
            resp = session.get(target_url, timeout=15)
            if resp.status_code == 200 and len(resp.text) > 5000 and "/login" not in urllib.parse.urlsplit(resp.url).path:
                has_wh = bool(re.search(r'data-warehouse-id="(\d+)"', resp.text))
                has_export = "export to excel" in resp.text.lower()
                main_html = resp.text
                final_url = resp.url
                # If target is consolidated and has warehouse ID or export button, or if target is standalone, accept it
                if has_wh or has_export or not target_url.rstrip("/").endswith("/consolidated"):
                    break
        except Exception:
            continue

    if not main_html:
        return {
            "text": "",
            "financial_intel": "",
            "peer_comparison": parse_screener_peers_section("", screener_url=primary_url),
            "shareholding": parse_screener_shareholding_section("", screener_url=primary_url),
            "financial_snapshot": parse_screener_financial_snapshot(""),
            "website": "N/A",
            "sources": [],
            "screener_url": primary_url,
        }

    soup = BeautifulSoup(main_html, "html.parser")
    official_website = _extract_official_website_from_soup(soup)

    info_el = soup.select_one("#company-info")
    company_id = (info_el.get("data-company-id") if info_el else None) or company_info.get("id")
    warehouse_id = info_el.get("data-warehouse-id") if info_el else None
    if not company_id:
        m_comp = re.search(r'data-company-id="(\d+)"', main_html)
        if m_comp:
            company_id = m_comp.group(1)
    if not warehouse_id:
        m_wh = re.search(r'data-warehouse-id="(\d+)"', main_html)
        if m_wh:
            warehouse_id = m_wh.group(1)

    read_more_btn = soup.select_one("button[data-url*='commentary']")
    commentary_path = read_more_btn.get("data-url") if read_more_btn else (
        f"/wiki/company/{company_id}/commentary/v2/" if company_id else ""
    )

    def safe_get_text(url_path: str, timeout_s: int = 10) -> str:
        if not url_path:
            return ""
        full = urllib.parse.urljoin("https://www.screener.in", str(url_path))
        try:
            r = session.get(full, timeout=timeout_s)
            return r.text if r.status_code == 200 else ""
        except Exception:
            return ""

    def safe_get_json(url_path: str, timeout_s: int = 10) -> dict[str, Any] | None:
        if not url_path:
            return None
        full = urllib.parse.urljoin("https://www.screener.in", str(url_path))
        try:
            r = session.get(full, timeout=timeout_s)
            return r.json() if r.status_code == 200 else None
        except Exception:
            return None

    is_consolidated = "/consolidated/" in final_url
    standalone_path = final_url.replace("/consolidated/", "/") if is_consolidated else ""
    peers_path = f"/api/company/{warehouse_id}/peers/" if warehouse_id else ""
    seg_type = "1" if is_consolidated else "0"
    segments_path = f"/api/segments/{company_id}/profit-loss/{seg_type}/" if company_id else ""
    promoters_path = f"/api/3/{company_id}/investors/promoters/quarterly/" if company_id else ""

    def get_peers_html() -> str:
        # Prefer Ledger's local signed-in Playwright profile so Screener returns user-configured peer columns.
        if warehouse_id:
            profile_html = fetch_screener_peers_html_via_profile(
                str(warehouse_id),
                company_code=str(company_info.get("symbol") or ""),
                force_fresh=force_refresh,
            )
            if profile_html:
                return profile_html
        return safe_get_text(peers_path)

    with ThreadPoolExecutor(max_workers=8) as pool:
        f_comm = pool.submit(safe_get_text, commentary_path or "")
        f_standalone = pool.submit(safe_get_text, standalone_path)
        f_peers = pool.submit(get_peers_html)
        f_segments = pool.submit(safe_get_text, segments_path)
        f_promoters = pool.submit(safe_get_json, promoters_path)
        sched_suffix = "&consolidated=" if is_consolidated else ""
        f_sched_assets = pool.submit(
            safe_get_json,
            f"/api/company/{company_id}/schedules/?parent=Other+Assets&section=balance-sheet{sched_suffix}" if company_id else "",
        )
        f_sched_liab = pool.submit(
            safe_get_json,
            f"/api/company/{company_id}/schedules/?parent=Other+Liabilities&section=balance-sheet{sched_suffix}" if company_id else "",
        )
        f_sched_borr = pool.submit(
            safe_get_json,
            f"/api/company/{company_id}/schedules/?parent=Borrowings&section=balance-sheet{sched_suffix}" if company_id else "",
        )
        f_sched_cf = pool.submit(
            safe_get_json,
            f"/api/company/{company_id}/schedules/?parent=Cash+from+Operating+Activity&section=cash-flow{sched_suffix}" if company_id else "",
        )

        raw_comm_html = f_comm.result()
        standalone_html = f_standalone.result()
        peers_html = f_peers.result()
        segments_html = f_segments.result()
        promoters_data = f_promoters.result()
        bs_schedules = {
            "other_assets": f_sched_assets.result(),
            "other_liabilities": f_sched_liab.result(),
            "borrowings": f_sched_borr.result(),
        }

    peer_comparison = parse_screener_peers_section(
        main_html,
        peers_html=peers_html,
        company_id=company_id,
        company_symbol=str(company_info.get("symbol") or ""),
        company_name=str(company_info.get("name") or ""),
        screener_url=final_url,
    )

    shareholding = parse_screener_shareholding_section(
        main_html,
        promoters_data=promoters_data,
        screener_url=final_url,
    )

    financial_snapshot = parse_screener_financial_snapshot(
        main_html,
        standalone_html=standalone_html,
        bs_schedules=bs_schedules,
    )

    financial_intel_text = parse_screener_financial_intelligence(
        main_html,
        standalone_html=standalone_html,
        peers_html=peers_html,
        segments_html=segments_html,
        promoters_data=promoters_data,
        peer_comparison=peer_comparison,
        shareholding=shareholding,
        financial_snapshot=financial_snapshot,
    )

    if raw_comm_html:
        raw_html = raw_comm_html
    else:
        comm_box = soup.select_one("div.commentary")
        raw_html = str(comm_box) if comm_box else ""

    comm_soup = BeautifulSoup(raw_html, "html.parser")
    for br in comm_soup.find_all(["br", "hr"]):
        br.replace_with("\n")

    footnote_sources: list[dict[str, str]] = []
    for a in comm_soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/"):
            href = urllib.parse.urljoin("https://www.screener.in", href)
        t = a.get_text(strip=True)
        if re.match(r"^\[?\d+\]?$", t):
            num = t.strip("[]")
            footnote_sources.append({"num": num, "url": href})
            a.replace_with(f"[[{num}]]")
        elif t.lower() == "edit":
            a.decompose()
        elif t:
            a.replace_with(f"[{t}]")
        else:
            a.decompose()

    for b in comm_soup.find_all(
        ["button", "div"],
        class_=lambda c: c and any(k in str(c).lower() for k in ["close", "request an update"]),
    ):
        b.decompose()

    full_popup_text = "\n".join(l.strip() for l in comm_soup.get_text().splitlines() if l.strip())

    unique_sources = []
    seen = set()
    for src in footnote_sources:
        if src["url"] not in seen:
            seen.add(src["url"])
            unique_sources.append(src)

    try:
        shareholding_pattern = parse_shareholding_pattern(soup)
    except Exception as exc:
        print(f"Error parsing shareholding pattern: {exc}", flush=True)
        shareholding_pattern = {"quarterly": None, "yearly": None}

    return {
        "text": full_popup_text,
        "financial_intel": financial_intel_text,
        "peer_comparison": peer_comparison,
        "shareholding": shareholding,
        "shareholding_pattern": shareholding_pattern,
        "financial_snapshot": financial_snapshot,
        "cash_flow_schedule": f_sched_cf.result() or {},
        "screener_ratios": parse_screener_ratios(soup),
        "promoters_data": promoters_data,
        "website": official_website,
        "sources": unique_sources,
        "screener_url": final_url,
        "screener_market_docs": _extract_screener_market_docs(soup),
    }


def fetch_official_website(website_url: str, company_name: str) -> dict[str, str]:
    """Crawl the company's official corporate website (Home + About/At a Glance)."""
    if not website_url or website_url == "N/A" or "screener" in website_url:
        return {"url": "N/A", "content": "", "title": "", "status": "no_url"}

    if not website_url.startswith("http"):
        website_url = "https://" + website_url

    try:
        r = requests.get(website_url, headers=BROWSER_HEADERS, timeout=7, verify=False)
        soup = BeautifulSoup(r.text, "html.parser")

        sub_links = []
        for a in soup.find_all("a", href=True):
            h = a["href"].lower()
            t = a.get_text(strip=True).lower()
            if any(k in h or k in t for k in ["about", "glance", "profile", "business", "operations", "overview", "who-we-are"]):
                full = urllib.parse.urljoin(website_url, a["href"])
                if full.startswith("http") and not any(full.endswith(ext) for ext in [".pdf", ".jpg", ".png", ".zip"]):
                    if full not in sub_links:
                        sub_links.append(full)

        target_url = sub_links[0] if sub_links else website_url
        if sub_links:
            try:
                target_resp = requests.get(target_url, headers=BROWSER_HEADERS, timeout=7, verify=False)
                target_soup = BeautifulSoup(target_resp.text, "html.parser")
            except Exception:
                target_url = website_url
                target_soup = soup
        else:
            target_soup = soup

        for tag in target_soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()

        page_title = (
            target_soup.title.string.strip()
            if target_soup.title and target_soup.title.string
            else company_name
        )
        clean_text = " ".join(target_soup.get_text().split())[:3500]
        return {"url": target_url, "title": page_title, "content": clean_text, "status": "success"}
    except Exception as exc:
        return {"url": website_url, "content": "", "title": "", "status": f"failed: {type(exc).__name__}"}


_NEWS_NOISE_PHRASES = (
    "share price today",
    "stock price today",
    "52 week low",
    "52-week low",
    "share price live",
    "stock price - nse/bse",
)

_WIKI_HEADERS = {"User-Agent": "LedgerDesktopResearch/1.0 (https://localhost)"}


def _search_google_news_rss(
    query_term: str,
    max_items: int = 10,
    cutoff_12m: datetime | None = None,
) -> list[dict[str, Any]]:
    """Query Google News RSS (India edition) and parse normalized article records."""
    items_found: list[dict[str, Any]] = []
    if not query_term.strip():
        return items_found
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query_term)}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=7)
        if resp.status_code != 200:
            return items_found
        root = ET.fromstring(resp.content)
        for item in root.findall(".//item")[:max_items]:
            title_elem = item.find("title")
            link_elem = item.find("link")
            date_elem = item.find("pubDate")
            raw_title = (title_elem.text or "").strip() if title_elem is not None else ""
            link = (link_elem.text or "").strip() if link_elem is not None else ""
            raw_date = (date_elem.text or "").strip() if date_elem is not None else ""

            ts = 0.0
            fmt_date = raw_date[:16]
            dt_obj = None
            if raw_date:
                try:
                    dt_obj = parsedate_to_datetime(raw_date)
                    if dt_obj.tzinfo is None:
                        dt_obj = dt_obj.replace(tzinfo=timezone.utc)
                    ts = dt_obj.timestamp()
                    fmt_date = dt_obj.strftime("%d %b %Y")
                except Exception:
                    pass

            headline = raw_title
            publisher = "News Feed"
            if " - " in raw_title:
                parts = raw_title.rsplit(" - ", 1)
                if len(parts[1]) <= 45:
                    headline, publisher = parts[0].strip(), parts[1].strip()

            if headline:
                items_found.append({
                    "title": raw_title,
                    "headline": headline,
                    "publisher": publisher,
                    "url": link,
                    "date": fmt_date,
                    "timestamp": ts,
                    "within_12m": bool(cutoff_12m and dt_obj and dt_obj >= cutoff_12m),
                })
    except Exception:
        pass
    return items_found


def fetch_live_web_intelligence(company_name: str, symbol: str) -> dict[str, list[dict[str, Any]]]:
    """Fetch real-time Capex, Regulatory, and 12-Month News via parallel Google News RSS queries."""
    now_utc = datetime.now(timezone.utc)
    cutoff_12m = now_utc - timedelta(days=366)

    clean_name = re.sub(
        r"\b(Ltd|Limited|Corpn|Corporation|India|Pvt)\b",
        "",
        company_name,
        flags=re.IGNORECASE,
    ).strip()
    is_generic_name = len(clean_name.split()) >= 3 and symbol.isalpha()

    capex_q = f"{symbol} capex OR order OR contract OR deal win"
    capex_alt_q = f"{clean_name} capex OR order OR contract" if clean_name else capex_q
    reg_q = f"{symbol} penalty OR litigation OR lawsuit OR fine OR SEBI OR NCLT OR court"
    reg_alt_q = f"{clean_name} penalty OR litigation OR court OR SEBI" if clean_name else reg_q
    timeline_q = (
        f'"{symbol}" when:1y'
        if is_generic_name
        else (f'"{clean_name}" when:1y' if clean_name else f"{symbol} when:1y")
    )
    timeline_alt_q = f"{symbol} business OR results OR project OR order when:1y"

    with ThreadPoolExecutor(max_workers=6) as pool:
        f_capex = pool.submit(_search_google_news_rss, capex_q, 4, cutoff_12m)
        f_capex_alt = pool.submit(_search_google_news_rss, capex_alt_q, 4, cutoff_12m)
        f_reg = pool.submit(_search_google_news_rss, reg_q, 4, cutoff_12m)
        f_reg_alt = pool.submit(_search_google_news_rss, reg_alt_q, 4, cutoff_12m)
        f_tl = pool.submit(_search_google_news_rss, timeline_q, 22, cutoff_12m)
        f_tl_alt = pool.submit(_search_google_news_rss, timeline_alt_q, 15, cutoff_12m)

        capex_results = f_capex.result()
        if len(capex_results) < 2 and clean_name:
            capex_results = f_capex_alt.result()

        reg_results = f_reg.result()
        if len(reg_results) < 2 and clean_name:
            reg_results = f_reg_alt.result()

        raw_timeline = f_tl.result()
        if len(raw_timeline) < 6:
            raw_timeline.extend(f_tl_alt.result())

    merged_timeline = []
    seen_titles = set()
    for candidate in capex_results + reg_results + raw_timeline:
        if not candidate.get("within_12m"):
            continue
        hl_low = candidate.get("headline", "").lower()
        if any(np in hl_low for np in _NEWS_NOISE_PHRASES):
            continue
        if is_generic_name and symbol.lower() not in hl_low and clean_name.lower() not in hl_low:
            continue
        norm = re.sub(r"[^a-z0-9]", "", hl_low)[:45]
        if norm and norm not in seen_titles:
            seen_titles.add(norm)
            merged_timeline.append(candidate)

    merged_timeline.sort(key=lambda x: x.get("timestamp", 0.0), reverse=True)
    return {
        "capex_news": capex_results,
        "regulatory_news": reg_results,
        "recent_news_12m": merged_timeline[:10],
    }


def _clean_search_company_name(company_name: str) -> str:
    cleaned = re.sub(
        r"\b(Ltd\.?|Limited|Pvt\.?|Private)\b",
        "",
        company_name or "",
        flags=re.IGNORECASE,
    )
    return " ".join(cleaned.split()).strip()


def _detect_rating_agency(text: str, url: str) -> str:
    low = f"{text} {url}".lower()
    if "crisil" in low:
        return "CRISIL"
    if "icra" in low:
        return "ICRA"
    if "care" in low:
        return "CARE Ratings"
    if "indiaratings" in low or "india ratings" in low or "fitch" in low:
        return "India Ratings (Fitch)"
    if "infomerics" in low:
        return "Infomerics"
    if "brickwork" in low:
        return "Brickwork"
    return "Credit Rating Agency"


def _is_within_last_12_months(date_str: str) -> bool:
    """Return True if date_str represents a date within the last 12 months.
    If no date can be parsed, returns True so valid undated items are preserved.
    """
    if not date_str:
        return True
    now = datetime.now()
    cutoff = now - timedelta(days=370)
    clean = re.sub(r"[,\.]", "", date_str).strip()

    for fmt in ("%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(clean, fmt)
            return dt >= cutoff
        except Exception:
            pass

    for fmt in ("%b %Y", "%B %Y"):
        try:
            dt = datetime.strptime(clean, fmt)
            return dt >= cutoff
        except Exception:
            pass

    m_yr = re.search(r"\b(20\d\d)\b", date_str)
    if m_yr:
        yr = int(m_yr.group(1))
        if yr < cutoff.year - 1:
            return False
        if yr == cutoff.year - 1 and now.month > 1:
            return False
    return True


def _fetch_credit_rating_snippet(url: str) -> tuple[str, str]:
    """Fetch HTML rating rationale (e.g. CRISIL / ICRA / India Ratings) and return (grade_tag, short_details)."""
    if not url or url.lower().endswith(".pdf"):
        return "", ""
    low_u = url.lower()
    if not any(dom in low_u for dom in ("crisil.com", "icra.in", "indiaratings.co.in", "careratings.com")):
        return "", ""
    try:
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=6, verify=False)
        if resp.status_code != 200 or len(resp.text) < 200:
            return "", ""
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        txt = " ".join(soup.get_text(" ", strip=True).split())
        # Look for rating grades like CRISIL AAA/Stable, ICRA AA+/Positive, IND A1+, CARE AA
        grade_matches = re.findall(
            r"\b((?:CRISIL|Crisil|ICRA|CARE|IND|BWR|IVR)\s*[A-Z]{1,4}[+-]?(?:\s*/\s*(?:Stable|Positive|Negative|Watch|Developing))?(?:\s*\([^)]{2,24}\))?)",
            txt,
        )
        grades: list[str] = []
        for g in grade_matches:
            clean_g = " ".join(g.split())
            if clean_g not in grades and len(clean_g) >= 5:
                grades.append(clean_g)
            if len(grades) >= 3:
                break
        summary_grade = " · ".join(grades[:2])

        # Try pulling concise instrument/rationale line from table cells or body
        details = ""
        for kw in ("Rating Action", "Ratings Reaffirmed", "Ratings Upgraded", "Ratings Assigned", "Total Bank Loan Facilities"):
            idx = txt.find(kw)
            if idx != -1:
                snippet = txt[idx : idx + 280].strip()
                if len(snippet) > 40:
                    details = snippet + ("…" if len(txt) > idx + 280 else "")
                    break
        return summary_grade, details
    except Exception:
        return "", ""


def fetch_market_forward_intelligence(
    company_name: str,
    symbol: str,
    screener_docs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Gather Credit Ratings, Management Guidance, Trailing/Forward P/E & Institutional Analyst Consensus."""
    docs = screener_docs or {}
    raw_ratings = docs.get("ratings") or []
    raw_concalls = docs.get("concalls") or []
    screener_pe = str(docs.get("stock_pe") or "").strip()
    nse_sym = str(docs.get("nse_symbol") or "").strip().upper()
    bse_code = str(docs.get("bse_code") or "").strip()

    clean_name = _clean_search_company_name(company_name)
    is_generic_name = len(clean_name.split()) >= 3 and symbol.isalpha()
    clean_tokens = [t.lower() for t in clean_name.split() if len(t) >= 3]

    def _matches_company(headline: str) -> bool:
        hl_low = (headline or "").lower()
        if any(np in hl_low for np in _NEWS_NOISE_PHRASES):
            return False
        if not is_generic_name:
            return True
        if symbol.lower() in hl_low or clean_name.lower() in hl_low:
            return True
        return bool(clean_tokens and all(tok in hl_low for tok in clean_tokens[:2]))

    # Candidate Yahoo Finance symbols ordered cleanly
    y_candidates: list[str] = []
    for cand in (
        f"{nse_sym}.NS" if nse_sym else "",
        f"{bse_code}.BO" if bse_code else "",
        f"{symbol}.NS" if symbol and not symbol.isdigit() else "",
        f"{symbol}.BO" if symbol else "",
    ):
        if cand and cand not in y_candidates:
            y_candidates.append(cand)

    def _fetch_yahoo_bundle() -> tuple[dict[str, str], dict[str, Any], str]:
        val: dict[str, str] = {}
        if screener_pe:
            val["screener_pe"] = screener_pe
        ana: dict[str, Any] = {}
        matched_url = ""
        for y_sym in y_candidates:
            try:
                target_yh = f"https://finance.yahoo.com/quote/{urllib.parse.quote(y_sym)}/"
                r_yh = requests.get(target_yh, headers=BROWSER_HEADERS, timeout=9)
                if r_yh.status_code != 200 or len(r_yh.text) < 2000:
                    continue
                y_soup = BeautifulSoup(r_yh.text, "html.parser")
                for sc in y_soup.find_all("script", attrs={"type": "application/json"}):
                    if "quoteSummary" not in (sc.get("data-url") or ""):
                        continue
                    try:
                        raw_json = json.loads(sc.string or "{}")
                        body_raw = raw_json.get("body")
                        body = json.loads(body_raw) if isinstance(body_raw, str) else raw_json
                        res_list = (body.get("quoteSummary") or {}).get("result") or []
                        if not res_list or not isinstance(res_list[0], dict):
                            continue
                        res = res_list[0]
                        sum_dtl = res.get("summaryDetail") or {}
                        stat = res.get("defaultKeyStatistics") or {}
                        fin = res.get("financialData") or {}
                        trend = res.get("recommendationTrend") or {}
                        price_mod = res.get("price") or {}
                        upg_mod = res.get("upgradeDowngradeHistoryLatest") or {}

                        def fmt_of(obj: Any, key: str) -> str:
                            entry = obj.get(key) if isinstance(obj, dict) else None
                            if isinstance(entry, dict):
                                return str(entry.get("fmt") or "").strip()
                            return ""

                        def raw_num(obj: Any, key: str) -> float | None:
                            entry = obj.get(key) if isinstance(obj, dict) else None
                            if isinstance(entry, dict) and isinstance(entry.get("raw"), (int, float)):
                                return float(entry["raw"])
                            return None

                        val["trailing_pe"] = fmt_of(sum_dtl, "trailingPE") or fmt_of(stat, "trailingPE")
                        val["forward_pe"] = fmt_of(sum_dtl, "forwardPE") or fmt_of(stat, "forwardPE")
                        val["peg_ratio"] = fmt_of(stat, "pegRatio")
                        val["price_to_book"] = fmt_of(sum_dtl, "priceToBook") or fmt_of(stat, "priceToBook")
                        val["trailing_eps"] = fmt_of(stat, "trailingEps")
                        val["forward_eps"] = fmt_of(stat, "forwardEps")
                        val["current_price"] = fmt_of(fin, "currentPrice") or fmt_of(price_mod, "regularMarketPrice")

                        rec_key = str(fin.get("recommendationKey") or "").strip()
                        if rec_key:
                            ana["rating"] = rec_key
                        rec_mean = fmt_of(fin, "recommendationMean")
                        if rec_mean:
                            ana["recommendation_mean"] = rec_mean
                        ana_cnt = fmt_of(fin, "numberOfAnalystOpinions")
                        if ana_cnt:
                            ana["analyst_count"] = ana_cnt
                        t_mean = fmt_of(fin, "targetMeanPrice")
                        t_med = fmt_of(fin, "targetMedianPrice")
                        t_high = fmt_of(fin, "targetHighPrice")
                        t_low = fmt_of(fin, "targetLowPrice")
                        if t_mean:
                            ana["target_mean_price"] = t_mean
                        if t_med:
                            ana["target_median_price"] = t_med
                        if t_high:
                            ana["target_high_price"] = t_high
                        if t_low:
                            ana["target_low_price"] = t_low

                        cmp_raw = raw_num(fin, "currentPrice") or raw_num(price_mod, "regularMarketPrice")
                        tgt_raw = raw_num(fin, "targetMeanPrice")
                        if cmp_raw and tgt_raw and cmp_raw > 0:
                            upside = ((tgt_raw - cmp_raw) / cmp_raw) * 100.0
                            ana["implied_upside_pct"] = f"{upside:+.1f}%"

                        trends = trend.get("trend") or []
                        if trends and isinstance(trends[0], dict):
                            t0 = trends[0]
                            ana["distribution"] = {
                                "strongBuy": int(t0.get("strongBuy") or 0),
                                "buy": int(t0.get("buy") or 0),
                                "hold": int(t0.get("hold") or 0),
                                "sell": int(t0.get("sell") or 0),
                                "strongSell": int(t0.get("strongSell") or 0),
                            }

                        actions = []
                        cutoff_ep = (datetime.now(timezone.utc) - timedelta(days=370)).timestamp()
                        for act in (upg_mod.get("history") or [])[:6]:
                            if not isinstance(act, dict):
                                continue
                            ts_ep = act.get("epochGradeDate")
                            if isinstance(ts_ep, (int, float)) and ts_ep > 0 and ts_ep < cutoff_ep:
                                continue
                            firm = str(act.get("firm") or "").strip()
                            to_g = str(act.get("toGrade") or "").strip()
                            from_g = str(act.get("fromGrade") or "").strip()
                            act_type = str(act.get("action") or "").strip()
                            dt_str = ""
                            if isinstance(ts_ep, (int, float)) and ts_ep > 0:
                                try:
                                    dt_str = datetime.fromtimestamp(ts_ep, tz=timezone.utc).strftime("%b %Y")
                                except Exception:
                                    pass
                            if firm and (to_g or act_type):
                                actions.append({
                                    "firm": firm,
                                    "action": act_type,
                                    "toGrade": to_g,
                                    "fromGrade": from_g,
                                    "date": dt_str,
                                })
                                if len(actions) >= 4:
                                    break
                        if actions:
                            ana["recent_actions"] = actions

                        if any(val.get(k) for k in ("trailing_pe", "forward_pe")) or ana:
                            matched_url = target_yh
                            return val, ana, matched_url
                    except Exception:
                        continue
            except Exception:
                continue
        return val, ana, matched_url

    search_tok = f'"{clean_name}"' if clean_name else symbol
    guidance_q = f'{search_tok} ("revenue guidance" OR "margin guidance" OR "growth guidance" OR "FY guidance" OR "management guidance" OR "earnings guidance") when:1y'
    analyst_q = f'{search_tok} ("target price" OR "analyst" OR "brokerage" OR "consensus" OR "buy rating" OR "earnings forecast") when:1y'
    rating_q = f'{search_tok} ("credit rating" OR CRISIL OR ICRA OR CARE OR "India Ratings") when:1y'

    html_rating_targets = [
        item for item in raw_ratings
        if isinstance(item, dict) and item.get("url") and not str(item["url"]).lower().endswith(".pdf")
    ][:2]

    with ThreadPoolExecutor(max_workers=6) as pool:
        f_yh = pool.submit(_fetch_yahoo_bundle)
        f_gui = pool.submit(_search_google_news_rss, guidance_q, 6, None)
        f_ana = pool.submit(_search_google_news_rss, analyst_q, 6, None)
        f_rat = pool.submit(_search_google_news_rss, rating_q, 5, None)
        f_rat_snippets = [pool.submit(_fetch_credit_rating_snippet, it["url"]) for it in html_rating_targets]

        valuation, analyst_consensus, yahoo_url = f_yh.result()
        raw_gui = f_gui.result()
        raw_ana = f_ana.result()
        raw_rat_news = f_rat.result()
        snippet_results = [f.result() for f in f_rat_snippets]

    snippet_by_url = {
        html_rating_targets[i]["url"]: snippet_results[i]
        for i in range(len(html_rating_targets))
    }

    credit_ratings: list[dict[str, Any]] = []
    for item in raw_ratings[:12]:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item["url"]).strip()
        m_dt = re.search(r"\b\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{4})?\b", title)
        dt_str = m_dt.group(0) if m_dt else ""
        if dt_str and not _is_within_last_12_months(dt_str):
            continue
        agency = _detect_rating_agency(title, url)
        grade_tag, details = snippet_by_url.get(url, ("", ""))
        credit_ratings.append({
            "agency": agency,
            "rating": grade_tag,
            "date": dt_str,
            "title": title,
            "url": url,
            "details": details,
        })
        if len(credit_ratings) >= 6:
            break

    def _filter_market_news(items: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        seen_h: set[str] = set()
        for it in items:
            hl = str(it.get("headline") or "").strip()
            if not hl or not _matches_company(hl):
                continue
            norm = re.sub(r"[^a-z0-9]", "", hl.lower())[:50]
            if not norm or norm in seen_h:
                continue
            seen_h.add(norm)
            out.append({
                "title": it.get("title") or hl,
                "headline": hl,
                "publisher": it.get("publisher") or "",
                "url": it.get("url") or "",
                "date": it.get("date") or "",
            })
            if len(out) >= limit:
                break
        return out

    cleaned_valuation = {k: v for k, v in valuation.items() if v and v != "-"}

    return {
        "credit_ratings": credit_ratings,
        "credit_rating_news": _filter_market_news(raw_rat_news, limit=4),
        "management_guidance_news": _filter_market_news(raw_gui, limit=4),
        "concalls": [c for c in raw_concalls[:5] if isinstance(c, dict) and c.get("url")],
        "valuation": cleaned_valuation,
        "analyst_consensus": analyst_consensus,
        "analyst_news": _filter_market_news(raw_ana, limit=4),
        "yahoo_url": yahoo_url,
    }


def _format_market_intel_prompt_text(market_intel: dict[str, Any] | None) -> str:
    """Format credit ratings, management guidance, P/E multiples & analyst consensus with [[ref_id]] markers."""
    if not isinstance(market_intel, dict) or not market_intel:
        return ""
    lines: list[str] = []

    cr_list = market_intel.get("credit_ratings") or []
    cr_news = market_intel.get("credit_rating_news") or []
    if cr_list or cr_news:
        cr_lines = []
        for item in cr_list[:4]:
            rid = item.get("ref_id")
            ref_tag = f" [Ref [{rid}]]" if rid else ""
            grade = f" -> Grade: {item['rating']}" if item.get("rating") else ""
            dt = f" ({item['date']})" if item.get("date") else ""
            det = f" | {item['details']}" if item.get("details") else ""
            cr_lines.append(f"- {item.get('agency', 'Agency')}{dt}: {item.get('title', '')}{grade}{det}{ref_tag}")
        for item in cr_news[:3]:
            rid = item.get("ref_id")
            ref_tag = f" [Ref [{rid}]]" if rid else ""
            dt = f" ({item['date']})" if item.get("date") else ""
            cr_lines.append(f"- [News] {item.get('headline', '')} - {item.get('publisher', '')}{dt}{ref_tag}")
        lines.append("CREDIT RATINGS & AGENCY ACTIONS:\n" + "\n".join(cr_lines))

    gui_news = market_intel.get("management_guidance_news") or []
    concalls = market_intel.get("concalls") or []
    if gui_news or concalls:
        g_lines = []
        for item in gui_news[:4]:
            rid = item.get("ref_id")
            ref_tag = f" [Ref [{rid}]]" if rid else ""
            dt = f" ({item['date']})" if item.get("date") else ""
            g_lines.append(f"- {item.get('headline', '')} - {item.get('publisher', '')}{dt}{ref_tag}")
        for cc in concalls[:3]:
            rid = cc.get("ref_id")
            ref_tag = f" [Ref [{rid}]]" if rid else ""
            g_lines.append(f"- Concall Filing: {cc.get('title', '')}{ref_tag}")
        lines.append("MANAGEMENT GUIDANCE & CONCALL FILINGS:\n" + "\n".join(g_lines))

    val = market_intel.get("valuation") or {}
    y_rid = market_intel.get("yahoo_ref_id")
    y_tag = f" [Ref [{y_rid}]]" if y_rid else ""
    if val:
        parts = [f"{k}={v}" for k, v in val.items() if v]
        lines.append(f"TRAILING & FORWARD P/E VALUATION METRICS{y_tag}:\n- " + " | ".join(parts))

    ana = market_intel.get("analyst_consensus") or {}
    ana_news = market_intel.get("analyst_news") or []
    if ana or ana_news:
        a_lines = []
        if ana:
            dist = ana.get("distribution") or {}
            dist_txt = ""
            if any(dist.get(k) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")):
                dist_txt = (
                    f" | Breakdown: StrongBuy={dist.get('strongBuy', 0)}, "
                    f"Buy={dist.get('buy', 0)}, Hold={dist.get('hold', 0)}, "
                    f"Sell={dist.get('sell', 0)}, StrongSell={dist.get('strongSell', 0)}"
                )
            a_lines.append(
                f"- Consensus Rating: {ana.get('rating', 'N/A')} | Analysts: {ana.get('analyst_count', 'N/A')} | "
                f"Target Price (Low/Mean/High): {ana.get('target_low_price', '-')} / {ana.get('target_mean_price', '-')} / {ana.get('target_high_price', '-')} "
                f"(Implied Upside: {ana.get('implied_upside_pct', '-')}){dist_txt}{y_tag}"
            )
        for item in ana_news[:4]:
            rid = item.get("ref_id")
            ref_tag = f" [Ref [{rid}]]" if rid else ""
            dt = f" ({item['date']})" if item.get("date") else ""
            a_lines.append(f"- [Analyst News] {item.get('headline', '')} - {item.get('publisher', '')}{dt}{ref_tag}")
        lines.append("ANALYST RECOMMENDATIONS, TARGET PRICES & FORECASTS:\n" + "\n".join(a_lines))

    return "\n\n".join(lines).strip()


def _derive_promoter_entity_queries(
    shareholding: dict[str, Any] | None,
    promoters_data: dict[str, Any] | None = None,
) -> list[str]:
    """Extract distinctive promoter person/parent names (skipping SPVs/subsidiary holdings) for web lookup."""
    corp_or_spv_re = re.compile(
        r"\b(llp|commercials|enterprises|trading|tradecom|holdings|holding|investments|investment|"
        r"trust|trustees|beneficiary|pte|topco|mirror|services|infra|infralog|synthetics|"
        r"ports|terminals|utilities|power|welfare|association|foundation|industries|relatives|"
        r"life|sciences|officeinfra|carat|neutron|futura|synergy|president|government|bank|"
        r"finance|finvest|capital|ventures|systems|solutions|technologies|ltd\.?|limited|"
        r"pvt\.?|private|inc\.?|corp\.?|corporation)\b",
        re.IGNORECASE,
    )
    parent_mnc_re = re.compile(
        r"\b(asea brown boveri|suzuki|siemens|honeywell|cummins|bosch|schneider|timken|schaeffler|skf)\b",
        re.IGNORECASE,
    )

    pool_holders: list[tuple[float, str]] = []
    if isinstance(promoters_data, dict) and promoters_data:
        for raw_name, qmap in promoters_data.items():
            if not isinstance(qmap, dict):
                continue
            periods = [(k, v) for k, v in qmap.items() if k != "setAttributes" and not isinstance(v, dict)]
            if not periods:
                continue
            try:
                pct = float(str(periods[-1][1]).replace("%", "").replace(",", "").strip())
            except Exception:
                pct = 0.0
            if pct > 0.0:
                pool_holders.append((pct, " ".join(str(raw_name).split())))
        pool_holders.sort(key=lambda x: x[0], reverse=True)
    else:
        for item in (shareholding or {}).get("named_promoters") or []:
            pool_holders.append((1.0, str(item.get("name") or "").strip()))

    person_candidates: list[str] = []
    parent_candidates: list[str] = []
    seen_low: set[str] = set()

    for _, raw_name in pool_holders:
        if not raw_name:
            continue
        is_corp = bool(corp_or_spv_re.search(raw_name))
        no_corp = re.sub(
            r"\b(Ltd\.?|Limited|Pvt\.?|Private|Inc\.?|Corp\.?|Corporation|AB|AG)\b",
            "",
            raw_name,
            flags=re.IGNORECASE,
        )
        # Collapse single-letter middle initials like "Mukesh D Ambani" -> "Mukesh Ambani"
        tokens = [tok for tok in no_corp.split() if len(tok) > 1 or tok.isdigit()]
        cleaned = " ".join(tokens).strip()
        if len(cleaned) < 5 or cleaned.lower() in seen_low:
            continue

        if not is_corp and 2 <= len(tokens) <= 4 and all(re.match(r"^[A-Za-z.\-]+$", t) for t in tokens):
            seen_low.add(cleaned.lower())
            person_candidates.append(cleaned)
        elif parent_mnc_re.search(raw_name):
            seen_low.add(cleaned.lower())
            parent_candidates.append(cleaned)

    return (person_candidates + parent_candidates)[:4]


def _condense_wikipedia_extract(extract: str, max_chars: int = 2600) -> str:
    """Preserve Wikipedia lead plus History, Ownership, and Controversies/Criticism sections."""
    text = (extract or "").strip()
    if not text:
        return ""
    if len(text) <= max_chars:
        return text

    parts = re.split(r"\n(?===+\s*[^=]+\s*===+\n)", text)
    lead = parts[0].strip()
    priority_blocks: list[str] = []
    other_blocks: list[str] = []
    priority_re = re.compile(
        r"(history|founder|promoter|ownership|shareholding|governance|controvers|criticism|"
        r"scandal|legal|regulat|litigation|dispute|allegation|investigation)",
        re.IGNORECASE,
    )
    for block in parts[1:]:
        head_line = block.splitlines()[0] if block.splitlines() else ""
        if priority_re.search(head_line):
            priority_blocks.append(block.strip())
        else:
            other_blocks.append(block.strip())

    out_chunks = [lead[:1200]]
    remaining = max_chars - len(out_chunks[0]) - 10
    for block in priority_blocks + other_blocks:
        if remaining <= 120:
            break
        snippet = block[:min(len(block), remaining, 950)].strip()
        if snippet:
            out_chunks.append(snippet)
            remaining -= len(snippet) + 2
    return "\n\n".join(out_chunks)[:max_chars]


def _fetch_wikipedia_profile(
    query: str,
    relevance_tokens: list[str],
    strict_title: bool = False,
) -> dict[str, str] | None:
    """Fetch a verified Wikipedia summary + history/controversy extract using the official MediaWiki API."""
    if not query or len(query.strip()) < 2:
        return None
    try:
        sr_resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "search",
                "srsearch": query,
                "srlimit": 5,
                "format": "json",
            },
            headers=_WIKI_HEADERS,
            timeout=8,
        )
        if not sr_resp.ok:
            return None
        hits = sr_resp.json().get("query", {}).get("search", [])
        chosen_title = ""
        q_tokens = [w.lower() for w in re.findall(r"[A-Za-z]{3,}", query)]
        for h in hits:
            title = str(h.get("title") or "").strip()
            t_low = title.lower()
            snippet_txt = BeautifulSoup(str(h.get("snippet") or ""), "html.parser").get_text(" ", strip=True)
            if (
                not title
                or "disambiguation" in t_low
                or t_low.startswith(("list of ", "index of ", "timeline of ", "category:"))
                or "may refer to" in snippet_txt.lower()
            ):
                continue
            if strict_title and q_tokens:
                # For individual promoter pages, require key surname / entity word inside the page title itself.
                surname = q_tokens[-1]
                if surname not in t_low:
                    continue
                if len(q_tokens) >= 2 and not (q_tokens[0] in t_low or q_tokens[0] in snippet_txt.lower()):
                    continue
            combined_low = f"{title} {snippet_txt}".lower()
            if any(tok in combined_low for tok in relevance_tokens):
                chosen_title = title
                break
        if not chosen_title:
            return None

        ex_resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "titles": chosen_title,
                "prop": "extracts|info",
                "inprop": "url",
                "explaintext": 1,
                "exchars": 8500,
                "format": "json",
            },
            headers=_WIKI_HEADERS,
            timeout=8,
        )
        if not ex_resp.ok:
            return None
        pages = ex_resp.json().get("query", {}).get("pages", {})
        for p in pages.values():
            raw_extract = str(p.get("extract") or "").strip()
            full_url = str(p.get("fullurl") or "").strip()
            title = str(p.get("title") or chosen_title).strip()
            if not raw_extract or not full_url:
                continue
            condensed = _condense_wikipedia_extract(raw_extract, max_chars=2600)
            return {
                "title": f"{title} — Wikipedia",
                "url": full_url,
                "summary": condensed,
            }
    except Exception:
        pass
    return None


def fetch_promoter_web_intelligence(
    company_name: str,
    symbol: str,
    shareholding: dict[str, Any] | None = None,
    promoters_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Gather external Wikipedia & business-news evidence covering promoter history, reputation, positives & risks."""
    company_q = _clean_search_company_name(company_name) or symbol
    entity_candidates = _derive_promoter_entity_queries(shareholding, promoters_data=promoters_data)
    primary_entity = entity_candidates[0] if entity_candidates else ""

    comp_tokens = [
        w.lower()
        for w in re.findall(r"[A-Za-z0-9]+", f"{company_q} {symbol}")
        if len(w) >= 3 and w.lower() not in {"india", "bank", "limited", "industries"}
    ] or [symbol.lower(), company_q.lower()]

    entity_clause = f'"{primary_entity}" OR ' if primary_entity else ""
    rep_q = f'"{company_q}" ({entity_clause}founder OR promoter OR chairmanship OR succession OR reputation OR history)'
    pos_q = (
        f'"{company_q}" ({entity_clause}promoter) '
        '("stake increase" OR "creeping acquisition" OR "no encumbrance" OR governance OR philanthropy OR award OR dividend OR "nil salary")'
    )
    neg_q = (
        f'"{company_q}" ({entity_clause}promoter OR founder OR chairman) '
        '(pledge OR "stake sale" OR SEBI OR ED OR CBI OR fraud OR controversy OR dispute OR penalty OR probe OR litigation)'
    )

    wiki_profiles: list[dict[str, Any]] = []
    seen_wiki_urls: set[str] = set()

    with ThreadPoolExecutor(max_workers=5) as pool:
        f_wiki_comp = pool.submit(_fetch_wikipedia_profile, company_q, comp_tokens, False)
        f_wiki_prom = (
            pool.submit(
                _fetch_wikipedia_profile,
                primary_entity,
                [t.lower() for t in primary_entity.split() if len(t) >= 3] + comp_tokens,
                True,
            )
            if primary_entity
            else None
        )
        f_rep = pool.submit(_search_google_news_rss, rep_q, 6, None)
        f_pos = pool.submit(_search_google_news_rss, pos_q, 6, None)
        f_neg = pool.submit(_search_google_news_rss, neg_q, 6, None)

        for fut in (f_wiki_comp, f_wiki_prom):
            if fut is None:
                continue
            prof = fut.result()
            if prof and prof["url"] not in seen_wiki_urls:
                seen_wiki_urls.add(prof["url"])
                wiki_profiles.append(prof)

        # If top promoter entity wasn't matched on Wikipedia, try remaining candidates cleanly.
        if len(wiki_profiles) < 2 and len(entity_candidates) >= 2:
            for alt_ent in entity_candidates[1:]:
                alt_prof = _fetch_wikipedia_profile(
                    alt_ent,
                    [t.lower() for t in alt_ent.split() if len(t) >= 3] + comp_tokens,
                    True,
                )
                if alt_prof and alt_prof["url"] not in seen_wiki_urls:
                    seen_wiki_urls.add(alt_prof["url"])
                    wiki_profiles.append(alt_prof)
                    break

        raw_rep = f_rep.result()
        raw_pos = f_pos.result()
        raw_neg = f_neg.result()

    seen_news_norms: set[str] = set()

    def filter_bucket(items: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for it in items:
            hl_low = (it.get("headline") or "").lower()
            if not hl_low or any(np in hl_low for np in _NEWS_NOISE_PHRASES):
                continue
            norm = re.sub(r"[^a-z0-9]", "", hl_low)[:50]
            if not norm or norm in seen_news_norms:
                continue
            seen_news_norms.add(norm)
            out.append({
                "title": it.get("title") or it.get("headline"),
                "headline": it.get("headline") or "",
                "publisher": it.get("publisher") or "",
                "url": it.get("url") or "",
                "date": it.get("date") or "",
            })
            if len(out) >= limit:
                break
        return out

    return {
        "entity_candidates": entity_candidates,
        "wiki_profiles": wiki_profiles,
        "reputation_news": filter_bucket(raw_rep, limit=5),
        "positive_news": filter_bucket(raw_pos, limit=5),
        "negative_news": filter_bucket(raw_neg, limit=5),
    }


def _format_promoter_prompt_text(promoter_intel: dict[str, Any]) -> str:
    """Format verified external Wikipedia & news promoter intelligence with assigned [[ref_id]] markers."""
    lines: list[str] = []
    for prof in promoter_intel.get("wiki_profiles") or []:
        rid = prof.get("ref_id")
        ref_tag = f" [Ref [{rid}]]" if rid else ""
        lines.append(f"ENCYCLOPEDIA PROFILE ({prof.get('title', 'Wikipedia')}){ref_tag}:\n{prof.get('summary', '')}")

    for heading, key in [
        ("EXTERNAL PROMOTER HISTORY & REPUTATION COVERAGE", "reputation_news"),
        ("PROMOTER POSITIVES / GOVERNANCE / STAKE SUPPORT NEWS", "positive_news"),
        ("PROMOTER CONCERNS / CONTROVERSIES / REGULATORY / PLEDGE / STAKE SALE NEWS", "negative_news"),
    ]:
        items = promoter_intel.get(key) or []
        if not items:
            continue
        bullets = []
        for it in items:
            rid = it.get("ref_id")
            ref_tag = f" [Ref [{rid}]]" if rid else ""
            date_str = f" ({it['date']})" if it.get("date") else ""
            pub_str = f" — {it['publisher']}" if it.get("publisher") else ""
            bullets.append(f"- {it.get('headline', '')}{pub_str}{date_str}{ref_tag}")
        lines.append(f"{heading}:\n" + "\n".join(bullets))

    return "\n\n".join(lines).strip()


def build_master_sources_registry(
    popup_data: dict[str, Any],
    official_site: dict[str, str],
    live_intel: dict[str, list[dict[str, Any]]],
    promoter_intel: dict[str, Any] | None = None,
    market_intel: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], int | None, int | None, int | None]:
    """Consolidate filings, dossier, official site, live news, promoter and market research into numbered references."""
    master: list[dict[str, Any]] = []
    url_to_id: dict[str, int] = {}

    for s in popup_data.get("sources", []):
        try:
            num = int(s["num"])
        except (TypeError, ValueError):
            num = len(master) + 1
        url_to_id[s["url"]] = num
        master.append({
            "id": num,
            "title": "BSE/NSE Regulatory Filing & Corporate Release",
            "url": s["url"],
            "type": "Regulatory Filing",
            "date": "",
        })

    next_id = max((s["id"] for s in master), default=0) + 1

    screener_ref_id = None
    if popup_data.get("screener_url"):
        screener_ref_id = next_id
        url_to_id[popup_data["screener_url"]] = next_id
        master.append({
            "id": next_id,
            "title": "Screener.in Verified Financial Statements, Peer Comparison & Shareholding Pattern",
            "url": popup_data["screener_url"],
            "type": "Financial Dossier",
            "date": "",
        })
        next_id += 1

    official_ref_id = None
    if official_site.get("url") and official_site["url"] != "N/A":
        official_ref_id = next_id
        url_to_id[official_site["url"]] = next_id
        master.append({
            "id": next_id,
            "title": official_site.get("title") or "Official Corporate Website & Disclosures",
            "url": official_site["url"],
            "type": "Official Website",
            "date": "",
        })
        next_id += 1

    yahoo_ref_id = None
    if isinstance(market_intel, dict) and market_intel.get("yahoo_url"):
        yahoo_url = str(market_intel["yahoo_url"])
        if yahoo_url in url_to_id:
            yahoo_ref_id = url_to_id[yahoo_url]
        else:
            yahoo_ref_id = next_id
            url_to_id[yahoo_url] = next_id
            master.append({
                "id": next_id,
                "title": "Institutional Market Valuation, Forward P/E & Analyst Consensus",
                "url": yahoo_url,
                "type": "Market Intelligence",
                "date": "",
            })
            next_id += 1
        market_intel["yahoo_ref_id"] = yahoo_ref_id

    def register_news_list(items: list[dict[str, Any]], src_type: str, default_title: str) -> None:
        nonlocal next_id
        for item in items:
            raw_u = item.get("url")
            if not raw_u:
                continue
            u = str(raw_u).strip().replace(" ", "%20")
            item["url"] = u
            if u in url_to_id:
                item["ref_id"] = url_to_id[u]
            else:
                item["ref_id"] = next_id
                url_to_id[u] = next_id
                master.append({
                    "id": next_id,
                    "title": item.get("title") or item.get("headline") or default_title,
                    "url": u,
                    "type": src_type,
                    "date": item.get("date", ""),
                })
                next_id += 1

    register_news_list(live_intel.get("capex_news", []), "Capex & Order Win", "Capex / Contract Announcement")
    register_news_list(live_intel.get("regulatory_news", []), "Regulatory & Legal Risk", "Regulatory / Litigation News")
    register_news_list(live_intel.get("recent_news_12m", []), "Corporate News", "Recent Corporate News")

    if isinstance(promoter_intel, dict):
        register_news_list(
            promoter_intel.get("wiki_profiles", []),
            "Encyclopedia Profile",
            "Wikipedia Company & Promoter History",
        )
        register_news_list(
            promoter_intel.get("reputation_news", []),
            "Promoter Reputation",
            "Promoter History & Reputation Coverage",
        )
        register_news_list(
            promoter_intel.get("positive_news", []),
            "Promoter Positives",
            "Promoter Governance & Positive Coverage",
        )
        register_news_list(
            promoter_intel.get("negative_news", []),
            "Promoter Risks & Watch",
            "Promoter Controversies, Pledge or Stake-Sale News",
        )

    if isinstance(market_intel, dict):
        register_news_list(
            market_intel.get("credit_ratings", []),
            "Credit Rating Rationale",
            "Credit Rating Agency Release & Rationale",
        )
        register_news_list(
            market_intel.get("credit_rating_news", []),
            "Credit Rating Action",
            "Credit Rating Upgrade/Downgrade News",
        )
        register_news_list(
            market_intel.get("management_guidance_news", []),
            "Management Guidance",
            "Management Guidance & Annual Outlook News",
        )
        register_news_list(
            market_intel.get("concalls", []),
            "Earnings Concall",
            "Investor Earnings Call Transcript / Audio",
        )
        register_news_list(
            market_intel.get("analyst_news", []),
            "Analyst Forecast",
            "Brokerage Target Price & Consensus Report",
        )

    master.sort(key=lambda x: x["id"])
    return master, official_ref_id, screener_ref_id, yahoo_ref_id


def gather_company_sources(
    code_or_name: str,
    company_name_hint: str = "",
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Step 1 endpoint: Resolve company and fetch Screener + Official Site + Promoter + Market Intelligence in parallel."""
    session = _make_screener_session()
    company_info = resolve_company(session, code_or_name, company_name_hint)

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_screener = pool.submit(fetch_screener_http, session, company_info, force_refresh)
        f_news = pool.submit(fetch_live_web_intelligence, company_info["name"], company_info["symbol"])
        popup_data = f_screener.result()
        with ThreadPoolExecutor(max_workers=3) as sub_pool:
            f_official = sub_pool.submit(
                fetch_official_website,
                popup_data.get("website", "N/A"),
                company_info["name"],
            )
            f_promoter = sub_pool.submit(
                fetch_promoter_web_intelligence,
                company_info["name"],
                company_info["symbol"],
                popup_data.get("shareholding"),
                popup_data.get("promoters_data"),
            )
            f_market = sub_pool.submit(
                fetch_market_forward_intelligence,
                company_info["name"],
                company_info["symbol"],
                popup_data.get("screener_market_docs") or {},
            )
            official_site = f_official.result()
            promoter_intel = f_promoter.result()
            market_intel = f_market.result()
        live_intel = f_news.result()

    master_sources, official_ref_id, screener_ref_id, yahoo_ref_id = build_master_sources_registry(
        popup_data, official_site, live_intel, promoter_intel=promoter_intel, market_intel=market_intel
    )
    promoter_prompt_text = _format_promoter_prompt_text(promoter_intel)
    market_prompt_text = _format_market_intel_prompt_text(market_intel)

    return {
        "company_info": company_info,
        "official_site": {
            "url": official_site.get("url", "N/A"),
            "title": official_site.get("title", ""),
            "status": official_site.get("status", ""),
        },
        "live_intel": live_intel,
        "promoter_intel": promoter_intel,
        "market_intelligence": market_intel,
        "master_sources": master_sources,
        "official_ref_id": official_ref_id,
        "screener_ref_id": screener_ref_id,
        "yahoo_ref_id": yahoo_ref_id,
        "peer_comparison": popup_data.get("peer_comparison"),
        "shareholding": popup_data.get("shareholding"),
        "shareholding_pattern": popup_data.get("shareholding_pattern"),
        "financial_snapshot": popup_data.get("financial_snapshot"),
        "cash_flow_schedule": popup_data.get("cash_flow_schedule") or {},
        "screener_ratios": popup_data.get("screener_ratios") or {},
        "generated_at": time.strftime("%d %b %Y, %I:%M %p"),
        "prompt_context": {
            "popup_text": (popup_data.get("text") or "")[:18000],
            "financial_intel": (popup_data.get("financial_intel") or "")[:20000],
            "official_content": (official_site.get("content") or "")[:3000],
            "promoter_intel": promoter_prompt_text[:10000],
            "market_intel": market_prompt_text[:10000],
        },
    }


def _extract_json_object(raw_text: str) -> dict[str, Any] | None:
    text = raw_text.strip()
    if "```" in text:
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start : end + 1]
    cleaned = re.sub(r",\s*([\]}])", r"\1", text)
    parsed = json.loads(cleaned, strict=False)
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
        parsed = parsed[0]
    return parsed if isinstance(parsed, dict) and parsed else None


def _as_text(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, (int, float, bool)):
        return str(val)
    if isinstance(val, list):
        parts = [_as_text(item) for item in val]
        return "\n".join(p for p in parts if p)
    if isinstance(val, dict):
        parts = []
        for k, v in val.items():
            sub = _as_text(v)
            if sub:
                parts.append(f"{str(k).replace('_', ' ').title()}: {sub}")
        return "; ".join(parts)
    return str(val).strip()


def _as_str_list(val: Any) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [_as_text(item) for item in val if _as_text(item)]
    txt = _as_text(val)
    if not txt:
        return []
    lines = [re.sub(r"^[•\-\*]\s*", "", ln).strip() for ln in txt.splitlines() if ln.strip()]
    return lines or [txt]


def _as_float(val: Any) -> float:
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return float(val)
    if isinstance(val, str):
        cleaned = re.sub(r"[^0-9.\-]", "", val)
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return 0.0


def _as_int_or_none(val: Any) -> int | None:
    if isinstance(val, int) and not isinstance(val, bool):
        return val
    if isinstance(val, (float, str)):
        digits = re.findall(r"\d+", str(val))
        if digits:
            return int(digits[0])
    return None


def _normalize_ai_payload(raw: dict[str, Any], comp_name: str, comp_symbol: str) -> dict[str, Any]:
    """Strictly normalize all AI response fields to prevent inconsistent frontend shapes."""
    sr_raw = raw.get("summary_report")
    sr_in = sr_raw if isinstance(sr_raw, dict) else {}

    bm_raw = sr_in.get("business_model_type")
    if isinstance(bm_raw, dict):
        tags_raw = bm_raw.get("primary_tags")
        if isinstance(tags_raw, list):
            bm_tags = [_as_text(t) for t in tags_raw if _as_text(t)]
        else:
            bm_tags = [t.strip() for t in _as_text(tags_raw).split(",") if t.strip()]
        bm_type = {"primary_tags": bm_tags, "note": _as_text(bm_raw.get("note"))}
    else:
        bm_type = {"primary_tags": [], "note": _as_text(bm_raw)}

    peers_raw = sr_in.get("peer_table")
    peer_table = []
    if isinstance(peers_raw, list):
        for pr in peers_raw:
            if not isinstance(pr, dict):
                continue
            cname = _as_text(pr.get("company"))
            if not cname:
                continue
            peer_table.append({
                "company": cname,
                "mcap_cr": _as_text(pr.get("mcap_cr")) or "-",
                "revenue_cr": _as_text(pr.get("revenue_cr")) or "-",
                "opm_pct": _as_text(pr.get("opm_pct")) or "-",
                "pe": _as_text(pr.get("pe")) or "-",
                "roce_pct": _as_text(pr.get("roce_pct")) or "-",
                "is_target": bool(pr.get("is_target")),
            })

    rb_raw = sr_in.get("revenue_breakups")
    if isinstance(rb_raw, dict):
        rev_breakups: dict[str, str] | str = {
            "product_wise": _as_text(rb_raw.get("product_wise")),
            "geography_wise": _as_text(rb_raw.get("geography_wise")),
            "consolidated_vs_standalone": _as_text(rb_raw.get("consolidated_vs_standalone")),
        }
    else:
        rev_breakups = _as_text(rb_raw)

    pa_raw = sr_in.get("profitability_analysis")
    if isinstance(pa_raw, dict):
        prof_analysis: dict[str, str] | str = {
            "current_vs_avg_margin": _as_text(pa_raw.get("current_vs_avg_margin")),
            "profitability_factors": _as_text(pa_raw.get("profitability_factors")),
            "profit_contribution_consol_vs_standalone": _as_text(
                pa_raw.get("profit_contribution_consol_vs_standalone")
            ),
        }
    else:
        prof_analysis = _as_text(pa_raw)

    ro_raw = sr_in.get("investor_risks_and_opportunities")
    if isinstance(ro_raw, dict):
        risks_opps: dict[str, str] | str = {
            "opportunities": _as_text(ro_raw.get("opportunities")),
            "risks": _as_text(ro_raw.get("risks")),
        }
    else:
        risks_opps = _as_text(ro_raw)

    po_raw = sr_in.get("promoter_and_owner")
    if isinstance(po_raw, dict):
        promoter_owner: dict[str, Any] | str = {
            "main_promoter_group": _as_text(po_raw.get("main_promoter_group") or po_raw.get("overview")),
            "short_history": _as_text(po_raw.get("short_history") or po_raw.get("history")),
            "reputation": _as_text(po_raw.get("reputation") or po_raw.get("reputation_summary")),
            "positives": _as_str_list(po_raw.get("positives") or po_raw.get("good")),
            "negatives_and_risks": _as_str_list(
                po_raw.get("negatives_and_risks") or po_raw.get("negatives") or po_raw.get("concerns")
            ),
            "ownership_takeaway": _as_text(po_raw.get("ownership_takeaway") or po_raw.get("shareholding_trend")),
        }
    else:
        promoter_owner = _as_text(po_raw)

    summary_report = {
        "company_name": _as_text(sr_in.get("company_name")) or f"{comp_name} ({comp_symbol})",
        "promoter_and_owner": promoter_owner,
        "sector_and_industry": _as_text(sr_in.get("sector_and_industry")),
        "market_position_and_peers": _as_text(sr_in.get("market_position_and_peers")),
        "peer_table": peer_table,
        "business_model_short": _as_text(sr_in.get("business_model_short")),
        "business_model_type": bm_type,
        "revenue_sources_short": _as_text(sr_in.get("revenue_sources_short")),
        "revenue_breakups": rev_breakups,
        "profitability_analysis": prof_analysis,
        "financial_issues": _as_text(sr_in.get("financial_issues")),
        "partners_and_subsidiaries": _as_text(sr_in.get("partners_and_subsidiaries")),
        "growth_capex_orderbook": _as_text(sr_in.get("growth_capex_orderbook")),
        "current_issues": _as_text(sr_in.get("current_issues")),
        "investor_risks_and_opportunities": risks_opps,
        "credit_rating_summary": _as_text(sr_in.get("credit_rating_summary")),
        "management_guidance": _as_text(sr_in.get("management_guidance")),
        "valuation_and_pe": _as_text(sr_in.get("valuation_and_pe")),
        "analyst_forecasts": _as_text(sr_in.get("analyst_forecasts")),
        "additional_insights": _as_text(sr_in.get("additional_insights")),
    }

    quick_stats = []
    excluded_qs_re = re.compile(r"(market\s*cap|dividend\s*yield|ttm\s*net\s*profit)", re.IGNORECASE)
    if isinstance(raw.get("quick_stats"), list):
        for st in raw["quick_stats"]:
            if not isinstance(st, dict):
                continue
            lbl = _as_text(st.get("label"))
            val = _as_text(st.get("value"))
            if (lbl or val) and not excluded_qs_re.search(lbl):
                quick_stats.append({"label": lbl, "value": val})

    rev_breakup = []
    if isinstance(raw.get("revenue_breakup"), list):
        for item in raw["revenue_breakup"]:
            if isinstance(item, dict) and _as_text(item.get("category")):
                rev_breakup.append({
                    "category": _as_text(item.get("category")),
                    "percentage": _as_float(item.get("percentage")),
                    "details": _as_text(item.get("details")),
                })

    geo_reach = []
    if isinstance(raw.get("geographical_reach"), list):
        for item in raw["geographical_reach"]:
            if isinstance(item, dict) and _as_text(item.get("region")):
                geo_reach.append({
                    "region": _as_text(item.get("region")),
                    "percentage": _as_float(item.get("percentage")),
                    "details": _as_text(item.get("details")),
                })

    capex_list = []
    if isinstance(raw.get("capex_and_order_book"), list):
        for item in raw["capex_and_order_book"]:
            if isinstance(item, dict) and (_as_text(item.get("headline")) or _as_text(item.get("details"))):
                capex_list.append({
                    "headline": _as_text(item.get("headline")) or "Capital Project",
                    "date": _as_text(item.get("date")),
                    "details": _as_text(item.get("details")),
                    "source_num": _as_int_or_none(item.get("source_num")),
                })

    reg_list = []
    if isinstance(raw.get("regulatory_and_litigation"), list):
        for item in raw["regulatory_and_litigation"]:
            if isinstance(item, dict) and (_as_text(item.get("issue")) or _as_text(item.get("details"))):
                reg_list.append({
                    "issue": _as_text(item.get("issue")) or "Regulatory Notice",
                    "severity": _as_text(item.get("severity")) or "Medium",
                    "details": _as_text(item.get("details")),
                    "source_num": _as_int_or_none(item.get("source_num")),
                })

    off_raw = raw.get("official_site_highlights")
    off_in = off_raw if isinstance(off_raw, dict) else {}
    official_highlights = {
        "headline": _as_text(off_in.get("headline")),
        "core_assets": _as_text(off_in.get("core_assets")),
        "source_num": _as_int_or_none(off_in.get("source_num")),
    }

    factories_list = []
    if isinstance(raw.get("factories_and_plants"), list):
        for item in raw["factories_and_plants"]:
            if isinstance(item, dict):
                nm = _as_text(item.get("name") or item.get("facility") or item.get("plant"))
                loc = _as_text(item.get("location"))
                det = _as_text(item.get("details") or item.get("capacity") or item.get("products"))
                if nm or loc or det:
                    factories_list.append({"name": nm or loc, "location": loc, "details": det})
            elif _as_text(item):
                factories_list.append({"name": _as_text(item), "location": "", "details": ""})

    subsidiaries_list = []
    if isinstance(raw.get("subsidiaries_list"), list):
        for item in raw["subsidiaries_list"]:
            if isinstance(item, dict):
                nm = _as_text(item.get("name") or item.get("entity"))
                rel = _as_text(item.get("relationship") or item.get("type") or item.get("stake"))
                det = _as_text(item.get("details") or item.get("business"))
                if nm or det:
                    subsidiaries_list.append({"name": nm, "relationship": rel, "details": det})
            elif _as_text(item):
                subsidiaries_list.append({"name": _as_text(item), "relationship": "", "details": ""})

    fp_raw = raw.get("financial_position_summary")
    fp_in = fp_raw if isinstance(fp_raw, dict) else {}
    financial_position_summary = {
        "overall_stance": _as_text(fp_in.get("overall_stance")),
        "sales_yearly_and_ttm": _as_text(fp_in.get("sales_yearly_and_ttm")),
        "sales_quarterly_momentum": _as_text(fp_in.get("sales_quarterly_momentum")),
        "pnl_yearly_and_ttm": _as_text(fp_in.get("pnl_yearly_and_ttm")),
        "pnl_quarterly_trend": _as_text(fp_in.get("pnl_quarterly_trend")),
        "balance_sheet_health": _as_text(fp_in.get("balance_sheet_health")),
        "cash_flow_quality": _as_text(fp_in.get("cash_flow_quality")),
        "strengths_good": _as_str_list(fp_in.get("strengths_good") or fp_in.get("good")),
        "watchpoints_bad": _as_str_list(fp_in.get("watchpoints_bad") or fp_in.get("bad")),
        "trend_status": _as_text(fp_in.get("trend_status")),
        "current_trend_verdict": _as_text(fp_in.get("current_trend_verdict")),
    }

    sections = []
    if isinstance(raw.get("sections"), list):
        for sec in raw["sections"]:
            if not isinstance(sec, dict):
                continue
            title = _as_text(sec.get("title"))
            content = _as_text(sec.get("content") or sec.get("points") or sec.get("bullets") or sec.get("details"))
            if title or content:
                sections.append({"title": title, "content": content})

    return {
        "summary_report": summary_report,
        "executive_summary": _as_text(raw.get("executive_summary")),
        "quick_stats": quick_stats,
        "revenue_breakup": rev_breakup,
        "geographical_reach": geo_reach,
        "factories_and_plants": factories_list,
        "subsidiaries_list": subsidiaries_list,
        "financial_position_summary": financial_position_summary,
        "capex_and_order_book": capex_list,
        "regulatory_and_litigation": reg_list,
        "official_site_highlights": official_highlights,
        "sections": sections,
    }


def _build_model_payload(model_name: str, system_instruction: str, prompt: str) -> dict[str, Any]:
    if model_name.startswith("gemma-"):
        return {
            "contents": [{"parts": [{"text": f"{system_instruction}\n\n{prompt}"}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 12288,
            },
        }
    return {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 16384,
            "responseMimeType": "application/json",
        },
    }


def synthesize_about_ai(sources_payload: dict[str, Any], api_key: str, cloud_mode: bool = False) -> dict[str, Any]:
    """Step 2 endpoint: Synthesize gathered corporate intelligence using Gemini Flash."""
    if not api_key:
        raise CompanyResearchError("GEMINI_API_KEY is not configured on the server.")

    company_info = sources_payload.get("company_info") or {}
    master_sources = sources_payload.get("master_sources") or []
    official_ref_id = sources_payload.get("official_ref_id")
    screener_ref_id = sources_payload.get("screener_ref_id")
    yahoo_ref_id = sources_payload.get("yahoo_ref_id")
    prompt_context = sources_payload.get("prompt_context") or {}

    comp_name = str(company_info.get("name") or "Company")
    comp_symbol = str(company_info.get("symbol") or "TICKER")

    sources_listing = "\n".join(
        f"- Reference [{s['id']}] ({s.get('type', 'Source')}): {s.get('title', '')} -> {s.get('url', '')}"
        for s in master_sources
    )

    system_instruction = (
        "You are an elite equity research director synthesizing verified corporate intelligence for investors.\n"
        "STRICT GUIDELINES:\n"
        "1. TWO-PART SYNTHESIS:\n"
        "   - PART A ('summary_report'): Build an authoritative, crisp Summary Report strictly UNDER 2,400 words total (target 1,200-1,900 words across all sub-fields combined). "
        "It MUST cover all topics using verified figures from Screener's financial tables, all peers in Screener's Peer Comparison table, named promoter holders, "
        "5-quarter & 5-year shareholding trends (Promoter, FII, DII, Government, Public, No. of Shareholders), external promoter history/reputation/positives/controversies (SOURCES A-D), "
        "credit ratings, management guidance, trailing vs forward P/E valuation, and institutional analyst forecasts/recommendations (SOURCE E), "
        "consolidated vs standalone sales/profit/debt comparison, operating cash flow vs profit, debt-to-equity, product/geography breakups, commentary, official website, and live news. "
        "NEVER fabricate controversies, penalties, awards, credit ratings, guidance numbers, target prices, or share pledges absent from SOURCES A-E! "
        "Explicitly highlight key Consolidated vs Standalone contrasts where applicable (e.g. standalone margin/debt vs subsidiary-driven consolidated margin/debt). "
        "If data for any specific item (such as credit rating, management guidance, forward PE, or analyst forecast) is genuinely absent in the provided materials, leave that field as an empty string \"\" instead of guessing!\n"
        "   - PART B (All remaining fields: 'executive_summary', 'revenue_breakup', 'geographical_reach', 'factories_and_plants', 'subsidiaries_list', 'financial_position_summary', 'capex_and_order_book', 'regulatory_and_litigation', 'official_site_highlights', 'sections'): "
        "Maintain exhaustive operational depth! NEVER output Market Capitalization, Dividend Yield, or TTM Net Profit inside 'quick_stats' (leave 'quick_stats' empty []). "
        "Populate 'factories_and_plants' ONLY with verified plants/facilities found in SOURCES A-D ([] if unavailable/inapplicable), and 'subsidiaries_list' ONLY with verified subsidiaries/JVs/associates ([] if standalone/unavailable). "
        "Write 'financial_position_summary' like an institutional credit & equity analyst using exact quarterly + yearly P&L, Balance Sheet, Cash Flow, and Computed Ratios from SOURCE B (including dedicated 'sales_yearly_and_ttm' and 'sales_quarterly_momentum' sales explanations, plus Good strengths, Bad watchpoints, and current trend). "
        "Inside 'financial_position_summary' text values: ALWAYS wrap key calculated numerical values (e.g. **+18.4%**, **14.2%**, **Rs 13,477 Cr**, **29.9% ROE**) in **double asterisks** AND wrap important conclusive summary statements (1 per field) in __double underscores__ (e.g. __Long-term top-line compounding remains structurally strong despite cyclical moderation.__). "
        "Include 3-4 distinct items in 'capex_and_order_book' (synthesizing all Capex & Order Win news references plus Screener filings), "
        "2-4 distinct items in 'regulatory_and_litigation' (synthesizing all Regulatory & Legal Risk news references), and 2-3 metric-dense bullet points in EVERY ONE of the 18 'sections'.\n"
        "2. SOURCE POINTING NUMBERS ONLY: Whenever citing a fact, financial figure, capex project, peer stat, credit rating, guidance figure, target price, promoter reputation point, or regulatory event, append ONLY the pointing "
        "number in brackets like [[1]], [[15]]. DO NOT output any raw URLs or web addresses anywhere in your prose!\n"
        "3. NO NUMBERS IN HEADINGS: Never prefix headings in 'sections' or sub-titles with numbers like '1.', '2.'.\n"
        "4. OUTPUT FORMAT: Respond strictly in valid JSON."
    )

    popup_text = prompt_context.get("popup_text") or "Commentary unavailable"
    financial_intel = prompt_context.get("financial_intel") or "Structured financial tables unavailable"
    official_content = prompt_context.get("official_content") or "Official site data unavailable"
    promoter_intel_ctx = prompt_context.get("promoter_intel") or "No external Wikipedia or promoter news retrieved."
    market_intel_ctx = prompt_context.get("market_intel") or "No external credit rating, forward P/E, or analyst consensus retrieved."

    prompt = f"""
Analyze the following multi-source corporate intelligence for:
Company: **{comp_name}** (Symbol: {comp_symbol})

MASTER SOURCES REGISTRY (ALL URLS ARE LOGGED HERE - DO NOT REPEAT RAW URLS IN TEXT):
{sources_listing}

SOURCE A: SCREENER.IN VERIFIED COMMENTARY, OPERATIONS & PRODUCTION DATA:
\"\"\"
{popup_text}
\"\"\"

SOURCE B: SCREENER.IN VERIFIED FINANCIAL TABLES, PEERS, PROMOTERS, 5Q & 5Y SHAREHOLDING, CASH FLOW & STANDALONE VS CONSOLIDATED (Ref [{screener_ref_id or 'N/A'}]):
\"\"\"
{financial_intel}
\"\"\"

SOURCE C: OFFICIAL COMPANY WEBSITE DISCLOSURES (Ref [{official_ref_id or 'N/A'}]):
\"\"\"
{official_content}
\"\"\"

SOURCE D: EXTERNAL PROMOTER GROUP HISTORY, REPUTATION, POSITIVES & CONTROVERSIES (Wikipedia & Business News with Ref IDs):
\"\"\"
{promoter_intel_ctx}
\"\"\"

SOURCE E: VERIFIED CREDIT RATINGS, MANAGEMENT GUIDANCE, TRAILING & FORWARD P/E, AND INSTITUTIONAL ANALYST CONSENSUS (Ref [{yahoo_ref_id or 'N/A'}]):
\"\"\"
{market_intel_ctx}
\"\"\"

Return ONLY a valid JSON object matching this exact schema:
{{
  "summary_report": {{
    "company_name": "{comp_name} ({comp_symbol})",
    "promoter_and_owner": {{
      "main_promoter_group": "Main controlling promoter group / founder / parent / PSU ministry (or note if widely held with 0% promoter), key named promoter holders, current Promoter / FII / DII / Govt / Public % and pledge status with [[{screener_ref_id or 1}]].",
      "short_history": "2-3 sentences covering founding background, promoter lineage or PE/MNC parent history, and key control milestones strictly from SOURCES A-D with [[N]] citations.",
      "reputation": "2-3 balanced sentences evaluating promoter execution track record, capital allocation / governance reputation, and institutional market standing strictly from SOURCES A-D with [[N]] citations.",
      "positives": [
        "Verified positive signal 1 (e.g., stake increase/creeping acquisition, zero/low share pledge, succession clarity, strong execution, dividend discipline, philanthropy/recognition) with [[N]].",
        "Verified positive signal 2 with [[N]]."
      ],
      "negatives_and_risks": [
        "Verified negative/watchpoint signal (e.g., promoter share pledges, stake sales/reclassification, SEBI/DOJ/regulatory inquiries, litigation, governance or family controversies) with [[N]]; if none found in SOURCES A-D, explicitly write 'No material promoter-level regulatory sanctions, pledges, or governance controversies surfaced in reviewed sources [[{screener_ref_id or 1}]].'"
      ],
      "ownership_takeaway": "1-2 sentences summarizing the 5-quarter and 5-year shift across Promoter, FII, DII, Government, Public holdings and No. of Shareholders retail participation trend [[{screener_ref_id or 1}]]."
    }},
    "sector_and_industry": "Exact Sector -> Industry -> Sub-industry classification and flagship index membership.",
    "market_position_and_peers": "2-4 crisp sentences on market cap & TTM sales rank across ALL peers in Screener's Peer Comparison Table, 3Y growth/OPM/ROE/ROA/Payout/CFO-to-EBIT standing, and current vs 3Y valuation (PE, PB, PS, D.Yield) vs peers and median.",
    "business_model_short": "What the company does, how it makes money across its value chain, and list of core products & services.",
    "business_model_type": {{
      "primary_tags": ["Choose 1-3 exact labels from: Asset Heavy, Capex Heavy, Man-Power Related, Intellectual Property, Lending, Working Capital Intensive, Consumer Brand"],
      "note": "1-2 short sentences justifying these archetypes with concrete asset/CWIP/op-model evidence."
    }},
    "revenue_sources_short": "Concise explanation of primary monetization streams and pricing/contract structure.",
    "revenue_breakups": {{
      "product_wise": "Product/segment-wise sales breakup in Rs Cr and % shares (leave empty if unavailable).",
      "geography_wise": "Geography-wise (Domestic India vs Overseas/Regions) sales shares (leave empty if unavailable).",
      "consolidated_vs_standalone": "Consolidated vs Standalone annual/TTM revenue numbers in Rs Cr and why they differ (leave empty if no standalone/consolidated split exists)."
    }},
    "profitability_analysis": {{
      "current_vs_avg_margin": "Current Operating Profit Margin (OPM %) and Net Margin vs historical 3Y/5Y average margin (for Consol and Standalone if distinct).",
      "profitability_factors": "Key structural, realization, raw material cost, or operating leverage factors driving margins.",
      "profit_contribution_consol_vs_standalone": "Profit contribution across key product segments (PBIT & Margin %) AND exact Consolidated vs Standalone Net Profit / OPM comparison."
    }},
    "financial_issues": "Clear assessment of Operating Cash Flow (CFO) vs Net Profit, Free Cash Flow (FCF), Total Borrowings & Debt-to-Equity (compare Consol vs Standalone Debt if distinct!), CWIP/working capital strain, and whether any high debt or financial statement doubts/red flags exist.",
    "partners_and_subsidiaries": "Key subsidiaries, joint ventures, associates, and strategic business/EPC partners.",
    "growth_capex_orderbook": "Future growth probability, order book / contract visibility, volume targets, and ongoing capex / CWIP pipeline.",
    "current_issues": "Major current legal disputes, arbitrations, regulatory penalties, or operational headwinds.",
    "investor_risks_and_opportunities": {{
      "opportunities": "2-3 crisp bullish catalysts and competitive tailwinds for investors.",
      "risks": "2-3 crisp key operational, financial, commodity, or regulatory risks for investors."
    }},
    "credit_rating_summary": "1-2 crisp sentences on credit rating agencies (CRISIL/ICRA/CARE/India Ratings), exact long-term/short-term rating grades & outlook (e.g. AAA/Stable), and recent affirmations/upgrades strictly from the last 12 months from SOURCE E with [[N]] citations (or empty string \"\" if unavailable).",
    "management_guidance": "2-3 crisp sentences summarizing management's disclosed forward guidance on revenue growth, margin band, volume/order targets, and outlook from filings/concalls/news strictly from SOURCES A & E with [[N]] citations (or empty string \"\" if unavailable).",
    "valuation_and_pe": "2-3 crisp sentences analyzing Trailing P/E vs Forward P/E, PEG ratio, and implied forward earnings expectations strictly from SOURCES B & E with [[N]] citations (or empty string \"\" if unavailable).",
    "analyst_forecasts": "2-3 crisp sentences summarizing institutional analyst consensus (Buy/Hold/Sell distribution, total analysts), 1-year target price band (Low/Mean/High vs CMP), and key brokerage outlook/forecasts strictly from the last 12 months from SOURCE E with [[N]] citations (or empty string \"\" if unavailable).",
    "additional_insights": "Optional high-value strategic point beyond the items above (or empty string \"\" if not needed)."
  }},
  "executive_summary": "3-4 concise sentences describing the core business engine, primary products, industry stature, and current operational posture.",
  "quick_stats": [],
  "revenue_breakup": [
    {{"category": "Division / Segment Name", "percentage": 35.0, "details": "Description of products in this division"}}
  ],
  "geographical_reach": [
    {{"region": "Region Name", "percentage": 50.0, "details": "Operational presence"}}
  ],
  "factories_and_plants": [
    {{"name": "Plant / Facility Name", "location": "City, State / Country", "details": "Products manufactured or installed capacity (ONLY if mentioned in SOURCES A-D; else empty list [])"}}
  ],
  "subsidiaries_list": [
    {{"name": "Subsidiary / JV / Associate Name", "relationship": "Wholly-owned Subsidiary / JV / Associate", "details": "Core business line & ownership/contribution if stated (ONLY if mentioned in SOURCES A-D; else empty list [])"}}
  ],
  "financial_position_summary": {{
    "overall_stance": "2-sentence institutional assessment combining Balance Sheet solvency, Cash Flow quality, and P&L trajectory (bold **calculated values** and underline __conclusive takeaway__) with [[{screener_ref_id or 1}]].",
    "sales_yearly_and_ttm": "2-3 sentences giving a conclusive explanation of 5Y -> TTM sales trajectory, multi-year sales CAGR vs latest FY/TTM growth rate (bold **growth % / Rs Cr values** and underline __conclusive takeaway__) [[{screener_ref_id or 1}]].",
    "sales_quarterly_momentum": "2-3 sentences explaining the last 5 quarters' sales momentum across QoQ & YoY growth rates, sequential trajectory, and acceleration/moderation conclusion (bold **QoQ / YoY growth % values** and underline __conclusive takeaway__) [[{screener_ref_id or 1}]].",
    "pnl_yearly_and_ttm": "2-3 metric-dense sentences on 5Y -> TTM Operating Profit, OPM%, Net Profit, EPS, and Profit CAGR ranges (bold **calculated figures** and underline __conclusive statement__) [[{screener_ref_id or 1}]].",
    "pnl_quarterly_trend": "2-3 crisp sentences comparing the latest 5 quarters (QoQ & YoY): margin expansion/compression, other income/interest/depreciation impact, and EPS momentum (bold **calculated figures** and underline __conclusive statement__) [[{screener_ref_id or 1}]].",
    "balance_sheet_health": "2-3 crisp sentences covering Equity+Reserves compounding, Borrowings trend & Debt-to-Equity, Fixed Assets + CWIP, liquidity, and Working Capital cycle or ROCE%/ROE% (bold **calculated figures** and underline __conclusive statement__) [[{screener_ref_id or 1}]].",
    "cash_flow_quality": "2-3 crisp sentences analyzing CFO / Sales %, CFO / Operating Profit %, CFO / Net Profit %, FCF / OCF %, and FCF / Net Profit % (bold **calculated figures** and underline __conclusive statement__) [[{screener_ref_id or 1}]].",
    "strengths_good": [
      "Good financial strength 1 with **bold calculated Rs Cr / % / days** [[{screener_ref_id or 1}]].",
      "Good financial strength 2 [[{screener_ref_id or 1}]]."
    ],
    "watchpoints_bad": [
      "Financial concern / risk / pressure 1 with **bold calculated Rs Cr / % / days** [[{screener_ref_id or 1}]].",
      "Financial concern / watchpoint 2 [[{screener_ref_id or 1}]]."
    ],
    "trend_status": "Improving / Stable / Mixed / Cautious",
    "current_trend_verdict": "1 crisp sentence with __underlined conclusive verdict__ and **bold growth/margin numbers** summarizing current quarterly & annual financial momentum [[{screener_ref_id or 1}]]."
  }},
  "capex_and_order_book": [
    {{
      "headline": "Brief title of project, contract win, or capex allocation",
      "date": "Date or Quarter",
      "details": "Details including financial outlay in Rs Cr, counterparty, or site location",
      "source_num": 1
    }}
  ],
  "regulatory_and_litigation": [
    {{
      "issue": "Brief title of the case, penalty, or compliance matter",
      "severity": "Low / Medium / High",
      "details": "Specific background, penalty amount, or court dispute status",
      "source_num": 1
    }}
  ],
  "official_site_highlights": {{
    "headline": "Core corporate mission or corporate positioning from official site",
    "core_assets": "Key infrastructure, operating divisions, or technological capabilities highlighted on official website",
    "source_num": {official_ref_id or 1}
  }},
  "sections": [
    {{"title": "Company Introduction & Background", "content": "• Point 1 [[1]]... • Point 2 [[2]]..."}},
    {{"title": "Core Business Activities & Operational Profile", "content": "• Point 1..."}},
    {{"title": "Business Model & Value Chain Workflow", "content": "• Point 1..."}},
    {{"title": "Products & Services Portfolio", "content": "• Point 1..."}},
    {{"title": "Manufacturing Facilities & Service Delivery Infrastructure", "content": "• Point 1..."}},
    {{"title": "Raw Materials, Inputs & Sourcing Dependencies", "content": "• Point 1..."}},
    {{"title": "Upstream & Downstream Operations & Integration", "content": "• Point 1..."}},
    {{"title": "Revenue Sources & Business-Segment Descriptions", "content": "• Point 1..."}},
    {{"title": "Domestic & International Market Presence", "content": "• Point 1..."}},
    {{"title": "Subsidiaries, Joint Ventures & Strategic Alliances", "content": "• Point 1..."}},
    {{"title": "Customer Profile, Commercial Relationships & Concentration", "content": "• Point 1..."}},
    {{"title": "Competitors & Industry Market Positioning", "content": "• Point 1..."}},
    {{"title": "Competitive Moats & Sustainable Advantages", "content": "• Point 1..."}},
    {{"title": "Operational Factors Influencing Business Profitability", "content": "• Point 1..."}},
    {{"title": "Growth Opportunities, Capital Projects & Capex Allocation", "content": "• Point 1..."}},
    {{"title": "Operational, Industry & Regulatory Risks", "content": "• Point 1..."}},
    {{"title": "Future Business Prospects & Secular Industry Trends", "content": "• Point 1..."}},
    {{"title": "Overall Investor Synthesis & Business Verdict", "content": "• Point 1..."}}
  ]
}}
"""

    per_attempt_timeout = 45 if cloud_mode else 60
    total_deadline = time.monotonic() + (175 if cloud_mode else 220)
    attempts: list[str] = []
    retry_queue: list[str] = []

    def try_model(model_name: str, timeout_limit: int) -> tuple[dict[str, Any] | None, str]:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        model_payload = _build_model_payload(model_name, system_instruction, prompt)
        try:
            resp = requests.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json=model_payload,
                timeout=timeout_limit,
            )
            if resp.status_code == 200:
                result_json = resp.json()
                candidates = result_json.get("candidates", [])
                if candidates and isinstance(candidates[0], dict):
                    parts = candidates[0].get("content", {}).get("parts", [])
                    non_thought_texts = [
                        p.get("text", "")
                        for p in parts
                        if isinstance(p, dict) and not p.get("thought") and isinstance(p.get("text"), str) and p.get("text").strip()
                    ]
                    fallback_texts = [
                        p.get("text", "")
                        for p in parts
                        if isinstance(p, dict) and isinstance(p.get("text"), str) and p.get("text").strip()
                    ]
                    text_content = "\n".join(non_thought_texts or fallback_texts)
                    parsed = _extract_json_object(text_content) if text_content else None
                    if parsed and (parsed.get("summary_report") or parsed.get("executive_summary") or parsed.get("sections")):
                        return _normalize_ai_payload(parsed, comp_name, comp_symbol), "ok"
                return None, "empty/invalid-json"
            if resp.status_code in (400, 401, 403):
                # Do not fail fatally if a specific fallback model rejects an optional parameter
                try:
                    err_msg = str(resp.json().get("error", {}).get("message", ""))
                except Exception:
                    err_msg = ""
                if "API key" in err_msg or "API_KEY" in err_msg or resp.status_code == 401:
                    raise CompanyResearchError(
                        f"Gemini API rejected the key (HTTP {resp.status_code}). Check GEMINI_API_KEY."
                    )
                return None, f"HTTP {resp.status_code}"
            return None, f"HTTP {resp.status_code}"
        except CompanyResearchError:
            raise
        except requests.exceptions.Timeout:
            return None, f"timeout({timeout_limit}s)"
        except Exception as exc:
            return None, type(exc).__name__

    # Pass 1: try diverse model families; skip quota-exhausted (429) & deprecated (404), queue transient 503/500
    for model_name in CANDIDATE_MODELS:
        remaining = total_deadline - time.monotonic()
        if remaining <= 12:
            break
        req_timeout = min(per_attempt_timeout, max(12, int(remaining)))
        parsed, outcome = try_model(model_name, req_timeout)
        if parsed is not None:
            return parsed
        attempts.append(f"{model_name}={outcome}")
        if outcome in ("HTTP 503", "HTTP 500") or outcome.startswith("timeout"):
            retry_queue.append(model_name)

    # Pass 2: brief cooldown and one retry on the top fast transient-503 models
    if retry_queue and (total_deadline - time.monotonic()) > 25:
        time.sleep(2.5)
        for model_name in retry_queue[:4]:
            remaining = total_deadline - time.monotonic()
            if remaining <= 12:
                break
            req_timeout = min(40, max(12, int(remaining)))
            parsed, outcome = try_model(model_name, req_timeout)
            if parsed is not None:
                return parsed
            attempts.append(f"{model_name}(retry)={outcome}")

    summary = ", ".join(attempts[-6:]) if attempts else "no attempts made"
    raise CompanyResearchError(f"All Gemini synthesis models were busy or unavailable ({summary}).")
