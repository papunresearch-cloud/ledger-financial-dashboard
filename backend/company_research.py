"""Cloud-safe, pure-HTTP corporate research & Gemini AI synthesis module.

Designed to run both locally via backend/server.py and on Vercel serverless Python
functions without Playwright or Chromium dependencies.
"""
from __future__ import annotations

import json
import os
import re
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
    from backend.screener_downloader import _cloud_proxy_session
except ImportError:  # pragma: no cover - local script import path
    from screener_downloader import _cloud_proxy_session

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


def parse_screener_financial_intelligence(
    main_html: str,
    standalone_html: str = "",
    peers_html: str = "",
    segments_html: str = "",
    promoters_data: dict[str, Any] | None = None,
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

    sh_tbl = soup.select_one("#shareholding table")
    if sh_tbl:
        sh_rows = []
        for tr in sh_tbl.select("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
            if cells:
                lbl = cells[0].rstrip("+- ").strip()
                latest = cells[-1] if len(cells) > 1 else ""
                prev = cells[-2] if len(cells) > 2 else ""
                if lbl == "" and len(cells) > 1:
                    sh_rows.append(f"Quarters: {cells[-3:]}")
                elif lbl:
                    sh_rows.append(f"{lbl}: {latest} (prev: {prev})")
        if sh_rows:
            lines.append("SHAREHOLDING & PROMOTERS (Latest Qtr):\n  " + "\n  ".join(sh_rows[:12]))

    if isinstance(promoters_data, dict) and promoters_data:
        promoter_holders = []
        for holder, qmap in list(promoters_data.items())[:12]:
            if isinstance(qmap, dict) and qmap:
                last_q = list(qmap.keys())[-1]
                promoter_holders.append(f"{holder}: {qmap[last_q]}% ({last_q})")
        if promoter_holders:
            lines.append("NAMED PROMOTER SHAREHOLDERS:\n  " + "\n  ".join(promoter_holders))

    peers_soup = BeautifulSoup(peers_html, "html.parser") if peers_html else soup
    peers_tbl = peers_soup.select_one("table") if peers_html else soup.select_one("#peers table")
    if peers_tbl:
        p_rows = peers_tbl.select("tr")
        if len(p_rows) > 1:
            headers = [th.get_text(" ", strip=True) for th in p_rows[0].select("th")]
            want_keys = ["company", "cmp", "mar cap", "sales rs", "opm %", "p/e", "roce", "debt / eq"]
            col_indices = []
            col_names = []
            for idx, h in enumerate(headers):
                hl = h.lower()
                if any(wk in hl for wk in want_keys) or idx == 1:
                    col_indices.append(idx)
                    col_names.append(h)
            if col_indices:
                peer_lines = [" | ".join(col_names)]
                for tr in p_rows[1:8]:
                    tds = [td.get_text(" ", strip=True) for td in tr.select("td")]
                    if len(tds) >= max(col_indices, default=0) + 1:
                        peer_lines.append(" | ".join(tds[i] for i in col_indices))
                lines.append("PEER COMPARISON TABLE:\n  " + "\n  ".join(peer_lines))

    def summarize_fin_table(selector: str, wanted_labels: list[str]) -> str:
        tbl = soup.select_one(f"{selector} table")
        if not tbl:
            return ""
        out = []
        for tr in tbl.select("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
            if not cells:
                continue
            lbl = cells[0].strip()
            if lbl == "" or any(w.lower() in lbl.lower() for w in wanted_labels):
                out.append(f"{lbl or 'Period'}: {cells[-5:]}")
        return "\n  ".join(out)

    pl_sec = soup.select_one("#profit-loss")
    if pl_sec:
        main_pl_tbl = pl_sec.select_one("table")
        if main_pl_tbl:
            pl_out = []
            for tr in main_pl_tbl.select("tr"):
                cells = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
                if not cells:
                    continue
                lbl = cells[0].strip()
                if lbl == "" or any(
                    k in lbl
                    for k in [
                        "Sales",
                        "Operating Profit",
                        "OPM",
                        "Other Income",
                        "Interest",
                        "Depreciation",
                        "Profit before tax",
                        "Net Profit",
                        "Dividend",
                    ]
                ):
                    pl_out.append(f"{lbl or 'Period'}: {cells[-5:]}")
            if pl_out:
                lines.append("CONSOLIDATED / PRIMARY P&L:\n  " + "\n  ".join(pl_out))

        cagr_boxes = [" | ".join(t.get_text(" ", strip=True).split()) for t in pl_sec.select("table.ranges-table tr")]
        if cagr_boxes:
            lines.append("HISTORICAL GROWTH & ROE RANGES: " + " ; ".join(cagr_boxes))

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

    bs_sum = summarize_fin_table(
        "#balance-sheet",
        ["Equity", "Reserves", "Borrowings", "Other Liabilities", "CWIP", "Fixed Assets", "Total Liabilities"],
    )
    if bs_sum:
        lines.append("BALANCE SHEET KEY ITEMS:\n  " + bs_sum)

    cf_sum = summarize_fin_table(
        "#cash-flow",
        ["Operating Activity", "Investing Activity", "Financing Activity", "Free Cash Flow", "CFO/EBITDA"],
    )
    if cf_sum:
        lines.append("CASH FLOW KEY ITEMS:\n  " + cf_sum)

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


def fetch_screener_http(session: requests.Session, company_info: dict[str, Any]) -> dict[str, Any]:
    """Fetch Screener pages, Read More commentary, peers, segments & promoters over HTTP."""
    primary_url = urllib.parse.urljoin("https://www.screener.in", str(company_info.get("url_path") or ""))
    main_html = ""
    final_url = primary_url
    candidate_urls = [primary_url]
    if "/consolidated/" in primary_url:
        candidate_urls.append(primary_url.replace("/consolidated/", "/"))

    for target_url in candidate_urls:
        try:
            resp = session.get(target_url, timeout=15)
            if resp.status_code == 200 and len(resp.text) > 5000 and "/login" not in urllib.parse.urlsplit(resp.url).path:
                main_html = resp.text
                final_url = resp.url
                break
        except Exception:
            continue

    if not main_html:
        return {
            "text": "",
            "financial_intel": "",
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

    with ThreadPoolExecutor(max_workers=5) as pool:
        f_comm = pool.submit(safe_get_text, commentary_path or "")
        f_standalone = pool.submit(safe_get_text, standalone_path)
        f_peers = pool.submit(safe_get_text, peers_path)
        f_segments = pool.submit(safe_get_text, segments_path)
        f_promoters = pool.submit(safe_get_json, promoters_path)

        raw_comm_html = f_comm.result()
        standalone_html = f_standalone.result()
        peers_html = f_peers.result()
        segments_html = f_segments.result()
        promoters_data = f_promoters.result()

    financial_intel_text = parse_screener_financial_intelligence(
        main_html,
        standalone_html=standalone_html,
        peers_html=peers_html,
        segments_html=segments_html,
        promoters_data=promoters_data,
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

    return {
        "text": full_popup_text,
        "financial_intel": financial_intel_text,
        "website": official_website,
        "sources": unique_sources,
        "screener_url": final_url,
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


def fetch_live_web_intelligence(company_name: str, symbol: str) -> dict[str, list[dict[str, Any]]]:
    """Fetch real-time Capex, Regulatory, and 12-Month News via parallel Google News RSS queries."""
    now_utc = datetime.now(timezone.utc)
    cutoff_12m = now_utc - timedelta(days=366)

    def search_news(query_term: str, max_items: int = 10) -> list[dict[str, Any]]:
        items_found: list[dict[str, Any]] = []
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
                        "within_12m": bool(dt_obj and dt_obj >= cutoff_12m),
                    })
        except Exception:
            pass
        return items_found

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
        f_capex = pool.submit(search_news, capex_q, 4)
        f_capex_alt = pool.submit(search_news, capex_alt_q, 4)
        f_reg = pool.submit(search_news, reg_q, 4)
        f_reg_alt = pool.submit(search_news, reg_alt_q, 4)
        f_tl = pool.submit(search_news, timeline_q, 22)
        f_tl_alt = pool.submit(search_news, timeline_alt_q, 15)

        capex_results = f_capex.result()
        if len(capex_results) < 2 and clean_name:
            capex_results = f_capex_alt.result()

        reg_results = f_reg.result()
        if len(reg_results) < 2 and clean_name:
            reg_results = f_reg_alt.result()

        raw_timeline = f_tl.result()
        if len(raw_timeline) < 6:
            raw_timeline.extend(f_tl_alt.result())

    noise_phrases = (
        "share price today",
        "stock price today",
        "52 week low",
        "52-week low",
        "share price live",
        "stock price - nse/bse",
    )
    merged_timeline = []
    seen_titles = set()
    for candidate in capex_results + reg_results + raw_timeline:
        if not candidate.get("within_12m"):
            continue
        hl_low = candidate.get("headline", "").lower()
        if any(np in hl_low for np in noise_phrases):
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


def build_master_sources_registry(
    popup_data: dict[str, Any],
    official_site: dict[str, str],
    live_intel: dict[str, list[dict[str, Any]]],
) -> tuple[list[dict[str, Any]], int | None, int | None]:
    """Consolidate filings, dossier, official site, and live news into numbered references."""
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

    def register_news_list(items: list[dict[str, Any]], src_type: str, default_title: str) -> None:
        nonlocal next_id
        for item in items:
            u = item.get("url")
            if not u:
                continue
            if u in url_to_id:
                item["ref_id"] = url_to_id[u]
            else:
                item["ref_id"] = next_id
                url_to_id[u] = next_id
                master.append({
                    "id": next_id,
                    "title": item.get("title") or default_title,
                    "url": u,
                    "type": src_type,
                    "date": item.get("date", ""),
                })
                next_id += 1

    register_news_list(live_intel.get("capex_news", []), "Capex & Order Win", "Capex / Contract Announcement")
    register_news_list(live_intel.get("regulatory_news", []), "Regulatory & Legal Risk", "Regulatory / Litigation News")
    register_news_list(live_intel.get("recent_news_12m", []), "Corporate News", "Recent Corporate News")

    master.sort(key=lambda x: x["id"])
    return master, official_ref_id, screener_ref_id


def gather_company_sources(code_or_name: str, company_name_hint: str = "") -> dict[str, Any]:
    """Step 1 endpoint: Resolve company and fetch Screener + Official Site + 12-Month News in parallel."""
    session = _make_screener_session()
    company_info = resolve_company(session, code_or_name, company_name_hint)

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_screener = pool.submit(fetch_screener_http, session, company_info)
        f_news = pool.submit(fetch_live_web_intelligence, company_info["name"], company_info["symbol"])
        popup_data = f_screener.result()
        official_site = fetch_official_website(popup_data.get("website", "N/A"), company_info["name"])
        live_intel = f_news.result()

    master_sources, official_ref_id, screener_ref_id = build_master_sources_registry(
        popup_data, official_site, live_intel
    )

    return {
        "company_info": company_info,
        "official_site": {
            "url": official_site.get("url", "N/A"),
            "title": official_site.get("title", ""),
            "status": official_site.get("status", ""),
        },
        "live_intel": live_intel,
        "master_sources": master_sources,
        "official_ref_id": official_ref_id,
        "screener_ref_id": screener_ref_id,
        "generated_at": time.strftime("%d %b %Y, %I:%M %p"),
        "prompt_context": {
            "popup_text": (popup_data.get("text") or "")[:18000],
            "financial_intel": (popup_data.get("financial_intel") or "")[:14000],
            "official_content": (official_site.get("content") or "")[:3000],
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

    summary_report = {
        "company_name": _as_text(sr_in.get("company_name")) or f"{comp_name} ({comp_symbol})",
        "promoter_and_owner": _as_text(sr_in.get("promoter_and_owner")),
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
        "additional_insights": _as_text(sr_in.get("additional_insights")),
    }

    quick_stats = []
    if isinstance(raw.get("quick_stats"), list):
        for st in raw["quick_stats"]:
            if isinstance(st, dict) and (_as_text(st.get("label")) or _as_text(st.get("value"))):
                quick_stats.append({"label": _as_text(st.get("label")), "value": _as_text(st.get("value"))})

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
        "   - PART A ('summary_report'): Build an authoritative, crisp Summary Report strictly UNDER 2,000 words total (target 900-1,500 words across all sub-fields combined). "
        "It MUST cover all 14 topics using verified figures from Screener's financial tables, top 4-5 peers, promoter names/holding %, "
        "consolidated vs standalone sales/profit/debt comparison, operating cash flow vs profit, debt-to-equity, product/geography breakups, commentary, official website, and live news. "
        "Explicitly highlight key Consolidated vs Standalone contrasts where applicable (e.g. standalone margin/debt vs subsidiary-driven consolidated margin/debt). "
        "If data for any specific item is genuinely absent in the provided materials, leave that field as an empty string \"\" instead of guessing!\n"
        "   - PART B (All remaining fields: 'executive_summary', 'quick_stats', 'revenue_breakup', 'geographical_reach', 'capex_and_order_book', 'regulatory_and_litigation', 'official_site_highlights', 'sections'): "
        "Maintain exhaustive operational depth! Include 3-4 distinct items in 'capex_and_order_book' (synthesizing all Capex & Order Win news references plus Screener filings), "
        "2-4 distinct items in 'regulatory_and_litigation' (synthesizing all Regulatory & Legal Risk news references), and 2-3 metric-dense bullet points in EVERY ONE of the 18 'sections'.\n"
        "2. SOURCE POINTING NUMBERS ONLY: Whenever citing a fact, financial figure, capex project, peer stat, or regulatory event, append ONLY the pointing "
        "number in brackets like [[1]], [[15]]. DO NOT output any raw URLs or web addresses anywhere in your prose!\n"
        "3. NO NUMBERS IN HEADINGS: Never prefix headings in 'sections' or sub-titles with numbers like '1.', '2.'.\n"
        "4. OUTPUT FORMAT: Respond strictly in valid JSON."
    )

    popup_text = prompt_context.get("popup_text") or "Commentary unavailable"
    financial_intel = prompt_context.get("financial_intel") or "Structured financial tables unavailable"
    official_content = prompt_context.get("official_content") or "Official site data unavailable"

    prompt = f"""
Analyze the following multi-source corporate intelligence for:
Company: **{comp_name}** (Symbol: {comp_symbol})

MASTER SOURCES REGISTRY (ALL URLS ARE LOGGED HERE - DO NOT REPEAT RAW URLS IN TEXT):
{sources_listing}

SOURCE A: SCREENER.IN VERIFIED COMMENTARY, OPERATIONS & PRODUCTION DATA:
\"\"\"
{popup_text}
\"\"\"

SOURCE B: SCREENER.IN VERIFIED FINANCIAL TABLES, PEERS, PROMOTERS, CASH FLOW & STANDALONE VS CONSOLIDATED (Ref [{screener_ref_id or 'N/A'}]):
\"\"\"
{financial_intel}
\"\"\"

SOURCE C: OFFICIAL COMPANY WEBSITE DISCLOSURES (Ref [{official_ref_id or 'N/A'}]):
\"\"\"
{official_content}
\"\"\"

Return ONLY a valid JSON object matching this exact schema:
{{
  "summary_report": {{
    "company_name": "{comp_name} ({comp_symbol})",
    "promoter_and_owner": "Who promotes/owns the company (Promoter Group / Govt / Founders), current promoter holding %, pledged %, institutional holding %, with [[{screener_ref_id or 1}]].",
    "sector_and_industry": "Exact Sector -> Industry -> Sub-industry classification and flagship index membership.",
    "market_position_and_peers": "2-4 crisp sentences on current market cap & revenue rank among domestic peers, relative valuation and margin standing.",
    "peer_table": [
      {{"company": "Top 4-5 Peers from Peer Comparison Table (first row is target company)", "mcap_cr": "2,93,750", "revenue_cr": "7,44,475", "opm_pct": "13.9%", "pe": "5.9", "roce_pct": "14.2%", "is_target": true}}
    ],
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
    "additional_insights": "Optional high-value strategic point beyond the 14 items above (or empty string \"\" if not needed)."
  }},
  "executive_summary": "3-4 concise sentences describing the core business engine, primary products, industry stature, and current operational posture.",
  "quick_stats": [
    {{"label": "Stat Name", "value": "Value"}},
    {{"label": "Stat Name", "value": "Value"}},
    {{"label": "Stat Name", "value": "Value"}}
  ],
  "revenue_breakup": [
    {{"category": "Division / Segment Name", "percentage": 35.0, "details": "Description of products in this division"}}
  ],
  "geographical_reach": [
    {{"region": "Region Name", "percentage": 50.0, "details": "Operational presence"}}
  ],
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
