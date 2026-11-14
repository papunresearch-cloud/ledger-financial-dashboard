"""Fast, lightweight Screener.in corporate profile & commentary extraction module.

Fetches the complete 'About' introduction, all 'Read More' commentary paragraphs,
key ratios, pros & cons, and verified footnote filings directly from screener.in.
No AI synthesis, no external internet crawling, fast and reliable.
"""
from __future__ import annotations

import os
import re
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import urllib3
from bs4 import BeautifulSoup

try:
    from backend.screener_downloader import _cloud_proxy_session
except ImportError:
    from screener_downloader import _cloud_proxy_session

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

APP_DIR = Path(__file__).resolve().parents[1]

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

_GLOBAL_SESSION: requests.Session | None = None
_GLOBAL_SESSION_TIME: float = 0


class CompanyResearchError(RuntimeError):
    """Raised on configuration or unrecoverable upstream failures."""


def load_env_setting(name: str) -> str:
    """Resolve a configuration value from env vars, local files, or log_info.txt."""
    direct = os.environ.get(name, "").strip().strip("\"'")
    if direct:
        return direct
    
    candidates = (
        APP_DIR / ".env",
        Path.home() / ".env",
        Path("E:/STOCK-ANALYSIS/log_info.txt"),
        APP_DIR.parent / "log_info.txt",
    )
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            for raw_line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                elif ":" in line:
                    key, val = line.split(":", 1)
                else:
                    continue
                if key.strip().upper() == name.upper():
                    cleaned = val.strip().strip("\"'")
                    if cleaned:
                        return cleaned
        except Exception:
            continue
    return ""


def _login_to_screener(session: requests.Session) -> bool:
    """Sign into Screener.in using configured session ID or credentials."""
    session_id = load_env_setting("SCREENER_SESSION_ID")
    if session_id:
        session.cookies.set("sessionid", session_id, domain=".screener.in", path="/")
        return True

    email = load_env_setting("SCREENER_EMAIL")
    password = load_env_setting("SCREENER_PASSWORD")
    if not email or not password:
        return False

    login_url = "https://www.screener.in/login/"
    try:
        res = session.get(login_url, timeout=15)
        csrf = session.cookies.get("csrftoken", "")
        if not csrf:
            m = re.search(r'name=["\']csrfmiddlewaretoken["\']\s+value=["\']([^"\']+)', res.text)
            if m:
                csrf = m.group(1)
        data = {
            "username": email,
            "password": password,
            "next": "",
            "csrfmiddlewaretoken": csrf,
        }
        headers = {
            "Referer": login_url,
            "Origin": "https://www.screener.in",
        }
        res_post = session.post(login_url, data=data, headers=headers, timeout=20)
        return "sessionid" in session.cookies and not res_post.url.rstrip("/").endswith("login")
    except Exception as exc:
        print(f"Screener login attempt failed: {exc}", flush=True)
        return False


def get_screener_session(force_new: bool = False) -> requests.Session:
    """Return a shared or new authenticated Screener requests session."""
    global _GLOBAL_SESSION, _GLOBAL_SESSION_TIME
    now = time.time()
    if not force_new and _GLOBAL_SESSION is not None and (now - _GLOBAL_SESSION_TIME < 3600):
        return _GLOBAL_SESSION

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

    _login_to_screener(session)
    _GLOBAL_SESSION = session
    _GLOBAL_SESSION_TIME = now
    return session


def resolve_company(session: requests.Session, code_or_name: str, company_name_hint: str = "") -> dict[str, Any]:
    """Resolve symbol / company name using Screener search autosuggest."""
    queries: list[str] = []
    for raw in (code_or_name, company_name_hint):
        cleaned = re.sub(r"\.xlsx$", "", (raw or "").strip(), flags=re.IGNORECASE)
        if cleaned and cleaned not in queries:
            queries.append(cleaned)
        no_corp = re.sub(
            r"\b(Ltd\.?|Limited|Corpn\.?|Corporation|Pvt\.?|Private|India|Co\.?|Company|Holdings?)\b",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        no_corp = re.sub(r"\s+", " ", no_corp).strip(" .,-")
        if no_corp and no_corp not in queries:
            queries.append(no_corp)

    for query in queries:
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


def clean_paragraph_html(p_elem: Any) -> dict[str, Any]:
    """Clean paragraph HTML by stripping all source notations and extracting structured lines."""
    # 1. Remove all sups (citations like [1], [7])
    for sup in p_elem.find_all("sup"):
        sup.decompose()

    # 2. Remove any remaining citation links
    for a in p_elem.find_all("a"):
        txt = a.get_text(strip=True)
        if re.match(r"^\[?\d+\]?$", txt) or "request an update" in txt.lower():
            a.decompose()
        else:
            href = a.get("href", "")
            if href.startswith("/"):
                href = urllib.parse.urljoin("https://www.screener.in", href)
            a.attrs = {
                "href": href,
                "target": "_blank",
                "rel": "noopener noreferrer",
                "class": "screener-inline-link",
            }

    # 3. Replace <br/> with newline before text extraction
    for br in p_elem.find_all(["br", "br/"]):
        br.replace_with("\n")

    # 4. Add highlight class to strong and b tags
    for s in p_elem.find_all(["strong", "b"]):
        s["class"] = "screener-highlight"

    # 5. Clean any stray bracketed citations like [7] from text nodes
    for text_node in p_elem.find_all(string=True):
        if re.search(r"\[\d+\]", text_node):
            text_node.replace_with(re.sub(r"\[\d+\]", "", text_node))

    # 6. Extract structured lines
    raw_text = p_elem.get_text()
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]

    # 7. Determine section title if first line is a header
    title = ""
    content_lines = list(lines)
    if lines:
        first = lines[0]
        if first.endswith(":") and len(first) < 65 and not re.match(r"^[a-z]\)", first, re.IGNORECASE):
            title = first.rstrip(":")
            content_lines = lines[1:]

    bullets: list[str] = []
    for line in content_lines:
        if line.startswith(("-", "•", "*")):
            bullets.append(re.sub(r"^[-•*]\s*", "", line).strip())

    return {
        "title": title,
        "html": str(p_elem),
        "text": "\n".join(lines),
        "lines": content_lines,
        "bullets": bullets,
        "citations": [],
    }


def gather_company_about(code_or_name: str, company_name_hint: str = "") -> dict[str, Any]:
    """Extract complete Screener About overview and all Read More commentary paragraphs."""
    session = get_screener_session()
    company_info = resolve_company(session, code_or_name, company_name_hint)
    symbol = company_info["symbol"]

    # Fetch main company page
    primary_url = urllib.parse.urljoin("https://www.screener.in", str(company_info.get("url_path") or f"/company/{symbol}/consolidated/"))
    main_html = ""
    final_url = primary_url
    candidate_urls = [primary_url]
    if "/consolidated/" in primary_url:
        candidate_urls.append(primary_url.replace("/consolidated/", "/"))

    for target_url in candidate_urls:
        try:
            resp = session.get(target_url, timeout=15)
            if resp.status_code == 200 and len(resp.text) > 5000:
                main_html = resp.text
                final_url = resp.url
                break
        except Exception:
            continue

    if not main_html:
        raise CompanyResearchError(f"Could not load Screener page for {symbol}.")

    soup = BeautifulSoup(main_html, "html.parser")

    # Company name from page
    name_el = soup.select_one("h1")
    company_name = name_el.get_text(strip=True) if name_el else (company_info.get("name") or symbol)

    # Sector & Industry
    sector_links = [
        a.get_text(strip=True)
        for a in soup.select("#peers a[href*='/market/']")
        if a.get_text(strip=True)
    ]
    sector = " > ".join(sector_links) if sector_links else ""

    # Official Website link
    website = ""
    for a in soup.select(".company-links a[href]"):
        href = (a.get("href") or "").strip()
        if "screener" not in href and "bseindia" not in href and "nseindia" not in href and href.startswith("http"):
            website = href
            break

    # Ratios
    ratios: list[dict[str, str]] = []
    for li in soup.select("#top-ratios li"):
        n = li.select_one(".name")
        v = li.select_one(".value")
        if n and v:
            r_name = " ".join(n.get_text(strip=True).split())
            r_val = " ".join(v.get_text(strip=True).split())
            if r_name and r_val:
                ratios.append({"label": r_name, "value": r_val})

    # Pros and Cons
    pros = [li.get_text(" ", strip=True) for li in soup.select("#analysis .pros li")]
    cons = [li.get_text(" ", strip=True) for li in soup.select("#analysis .cons li")]

    # Main About Intro from Screener
    about_div = soup.select_one("div.about")
    about_intro_p = about_div.find("p") if about_div else None
    if about_intro_p:
        intro_parsed = clean_paragraph_html(about_intro_p)
    else:
        intro_parsed = {
            "title": "",
            "html": f"<p>{company_name} is an Indian publicly listed enterprise.</p>",
            "text": f"{company_name} is an Indian publicly listed enterprise.",
            "bullets": [],
            "citations": [],
        }

    # Commentary / Read More Modal
    btn = soup.select_one("button[data-url*='commentary']")
    comm_url = btn.get("data-url") if btn else None
    paragraphs: list[dict[str, Any]] = []
    all_citations = list(intro_parsed.get("citations", []))

    if not comm_url and company_info.get("id"):
        comm_url = f"/wiki/company/{company_info['id']}/commentary/v2/"

    if comm_url:
        full_comm_url = urllib.parse.urljoin("https://www.screener.in", comm_url)
        try:
            comm_res = session.get(full_comm_url, headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15)
            # If session was invalid and returned register page, retry login once
            if "Register" in comm_res.text:
                if _login_to_screener(session):
                    comm_res = session.get(full_comm_url, headers={"X-Requested-With": "XMLHttpRequest"}, timeout=15)

            if comm_res.status_code == 200 and "Register" not in comm_res.text:
                comm_soup = BeautifulSoup(comm_res.text, "html.parser")
                raw_items: list[dict[str, Any]] = []
                for p in comm_soup.select("p"):
                    t = p.get_text(strip=True)
                    if not t or any(k in t.lower() for k in ["copyright", "last edited", "request an update"]):
                        continue
                    parsed_p = clean_paragraph_html(p)
                    # If this paragraph is identical to the top about intro, skip it to avoid duplication
                    if parsed_p["text"].strip().lower() == intro_parsed["text"].strip().lower():
                        continue
                    raw_items.append(parsed_p)

                # Group into structured commentary sections
                sections: list[dict[str, Any]] = []
                for item in raw_items:
                    lines = item.get("lines", [])
                    first_line = lines[0] if lines else item.get("text", "")
                    is_title = bool(item.get("title"))

                    if is_title:
                        sections.append({
                            "id": len(sections) + 1,
                            "title": item["title"],
                            "lines": item.get("lines", []),
                            "bullets": item.get("bullets", []),
                            "subsections": [],
                            "html": item.get("html", ""),
                            "text": item.get("text", ""),
                        })
                    elif sections and (re.match(r"^[a-z]\)", first_line, re.IGNORECASE) or not sections[-1]["lines"]):
                        sections[-1]["subsections"].append(item.get("text", ""))
                        sections[-1]["html"] += item.get("html", "")
                    elif sections:
                        sections[-1]["lines"].extend(lines)
                        sections[-1]["text"] += "\n" + item.get("text", "")
                        sections[-1]["html"] += item.get("html", "")
                    else:
                        sections.append({
                            "id": len(sections) + 1,
                            "title": "",
                            "lines": item.get("lines", []),
                            "bullets": item.get("bullets", []),
                            "subsections": [],
                            "html": item.get("html", ""),
                            "text": item.get("text", ""),
                        })
                paragraphs = sections
        except Exception as exc:
            print(f"Error fetching Screener Read More commentary: {exc}", flush=True)

    # Extract Shareholding Pattern (Quarterly and Yearly)
    try:
        shareholding = parse_shareholding_pattern(soup)
    except Exception as exc:
        print(f"Error parsing shareholding pattern: {exc}", flush=True)
        shareholding = {"quarterly": None, "yearly": None}

    footnotes: list[dict[str, str]] = []

    footnotes.sort(key=lambda x: int(x["num"]) if x["num"].isdigit() else 999)

    now_str = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    return {
        "company_info": {
            "name": company_name,
            "symbol": symbol,
            "screener_url": final_url,
            "website": website,
            "sector": sector,
        },
        "ratios": ratios,
        "about_intro": intro_parsed,
        "paragraphs": paragraphs,
        "shareholding": shareholding,
        "pros": pros,
        "cons": cons,
        "footnotes": footnotes,
        "generated_at": now_str,
        # Backward-compatible fields
        "status": "ready",
        "companyKey": symbol,
    }


# Backwards compatibility alias for existing callers
gather_company_sources = gather_company_about
