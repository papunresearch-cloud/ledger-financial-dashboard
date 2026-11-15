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


def parse_financial_snapshot(soup: BeautifulSoup) -> dict[str, Any]:
    """Extract Screener Balance Sheet table for bank deposits/borrowings enrichment."""
    bs_sec = soup.select_one("#balance-sheet")
    if not bs_sec:
        return {}
    bs_table = bs_sec.select_one("table")
    if not bs_table:
        return {}
    headers = [th.get_text(" ", strip=True) for th in bs_table.select("thead th") if th.get_text(" ", strip=True)]
    rows = []
    for tr in bs_table.select("tbody tr"):
        tds = [td.get_text(" ", strip=True) for td in tr.select("th, td")]
        if tds and tds[0]:
            lbl = tds[0].replace("+", "").strip()
            rows.append({"label": lbl, "values": tds[1:]})
    return {
        "balance_sheet": {
            "headers": headers,
            "rows": rows,
        }
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


PEER_COMPARISON_FOOTNOTE = (
    "Sales growth, Profit growth, OPM, ROE, ROA, D.Payout, CFO/EBIT%, PE, PB => 3 years average data"
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


def _is_bullet_or_item(line: str) -> bool:
    """Determine whether a line represents a standalone list item, bullet, or metric."""
    s = line.strip()
    if not s:
        return False
    # Explicit bullet symbols: -, •, *, –, —
    if re.match(r"^[-•*–—]\s+", s):
        return True
    # Numbered / lettered list: 1., 1), a), (a), i.
    if re.match(r"^(\d+[\.\)]|[a-zA-Z][\.\)]|\([a-zA-Z0-9]+\))\s+", s):
        return True
    # Key-value metric: "Label: Value", e.g. "MSME: 29%", "GNPA: 0.91%", "Employees: 5,98,056"
    m = re.match(r"^([^:]{2,35}):\s*(.*)$", s)
    if m:
        label = m.group(1).strip()
        words = label.split()
        disallowed = {"note", "however", "furthermore", "moreover", "in addition", "for example", "specifically"}
        if len(words) <= 5 and not any(w.lower() in disallowed for w in words):
            return True
    # Mini header: short (<=30 chars), Title Case or All-Caps, no ending sentence punctuation
    if len(s) <= 30 and not s.endswith((".", ",", ";", ":", "-", "–")) and (s.istitle() or s.isupper()):
        words = s.split()
        if len(words) <= 4:
            return True
    return False


def _merge_broken_lines(lines: list[str]) -> list[str]:
    """Merge lines that were arbitrarily split due to column width / space scarcity in source documents."""
    if not lines or len(lines) <= 1:
        return lines or []

    merged: list[str] = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if not merged:
            merged.append(line)
            continue

        prev = merged[-1]
        curr_is_item = _is_bullet_or_item(line)
        prev_is_item = _is_bullet_or_item(prev)

        # 1. If current line is a distinct bullet / metric item, keep it on a new line
        if curr_is_item:
            merged.append(line)
            continue

        # 2. If previous line was a bullet / metric item:
        if prev_is_item:
            # Check if previous item was hyphenated at line end: "cost-to-" -> merge with "income"
            if re.search(r"[a-zA-Z][-–]$", prev):
                merged[-1] = re.sub(r"[-–]$", "", prev) + "-" + line
                continue
            # If current line starts with lowercase, it is definitively a continuation of previous line
            if line[0].islower():
                merged[-1] = prev + " " + line
                continue
            # If previous item ended in incomplete preposition / conjunction / comma
            if re.search(r"[,;]$|\b(and|or|with|to|for|in|of|the|a|an|by|from|as|at)$", prev, re.IGNORECASE):
                merged[-1] = prev + " " + line
                continue
            # Otherwise, keep current line separate
            merged.append(line)
            continue

        # 3. Both lines are narrative text: merge them together into a flowing sentence/paragraph
        if re.search(r"[a-zA-Z][-–]$", prev):
            merged[-1] = re.sub(r"[-–]$", "", prev) + "-" + line
        else:
            merged[-1] = prev + " " + line

    return merged


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

    # Merge broken lines caused by column width / space scarcity in source documents
    content_lines = _merge_broken_lines(content_lines)

    bullets: list[str] = []
    for line in content_lines:
        if line.startswith(("-", "•", "*")):
            bullets.append(re.sub(r"^[-•*]\s*", "", line).strip())

    return {
        "title": title,
        "html": str(p_elem),
        "text": "\n".join(content_lines),
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
                        sections[-1]["lines"] = _merge_broken_lines(sections[-1]["lines"])
                        sections[-1]["text"] = "\n".join(sections[-1]["lines"])
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
                # Final cleanup of section lines and subsections
                for sec in sections:
                    sec["lines"] = _merge_broken_lines(sec.get("lines", []))
                    sec["text"] = "\n".join(sec["lines"])
                paragraphs = sections
        except Exception as exc:
            print(f"Error fetching Screener Read More commentary: {exc}", flush=True)

    # Extract Shareholding Pattern (Quarterly and Yearly)
    try:
        shareholding = parse_shareholding_pattern(soup)
    except Exception as exc:
        print(f"Error parsing shareholding pattern: {exc}", flush=True)
        shareholding = {"quarterly": None, "yearly": None}

    # Extract Peer Comparison from Screener
    peer_comparison = {
        "rows": [],
        "median": None,
        "sector_path": sector_links,
        "authenticated": False,
        "source_url": final_url,
        "footnote": PEER_COMPARISON_FOOTNOTE,
    }
    try:
        info_el = soup.select_one("#company-info")
        wh_id = (info_el.get("data-warehouse-id") or "").strip() if info_el else ""
        if not wh_id:
            m_wh = re.search(r'data-warehouse-id="(\d+)"', main_html)
            wh_id = m_wh.group(1) if m_wh else ""

        peers_html = ""
        if wh_id:
            try:
                peers_resp = session.get(
                    f"https://www.screener.in/api/company/{wh_id}/peers/",
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Referer": final_url,
                    },
                    timeout=15,
                )
                if peers_resp.status_code == 200 and len(peers_resp.text) > 50:
                    peers_html = peers_resp.text
            except Exception as exc:
                print(f"Error fetching Screener peers: {exc}", flush=True)

        peer_comparison = parse_screener_peers_section(
            main_html,
            peers_html=peers_html,
            company_id=wh_id,
            company_symbol=symbol,
            company_name=company_name,
            screener_url=final_url,
        )
    except Exception as exc:
        print(f"Error parsing peer comparison: {exc}", flush=True)

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
        "peer_comparison": peer_comparison,
        "financial_snapshot": parse_financial_snapshot(soup),
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
