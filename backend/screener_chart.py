"""Screener.in multi-subwindow time series chart dataset fetcher."""
from __future__ import annotations

import concurrent.futures
import json
import os
import urllib.parse
from urllib.parse import quote
import requests

CHART_CACHE: dict[str, dict] = {}
CHART_QUERIES = [
    'Price-DMA50-DMA200-Volume',
    'Price to Earning-Median PE-EPS',
    'Price to book value-Median PBV-Book value',
    'Market Cap to Sales-Median Market Cap to Sales-Sales',
    'EV Multiple-Median EV Multiple-EBITDA',
    'GPM-OPM-NPM-Quarter Sales'
]


def _get_requests_session() -> requests.Session:
    proxy_server = os.environ.get("SCREENER_PROXY_SERVER", "").strip().strip("\"'")
    if proxy_server:
        try:
            from backend.screener_downloader import _cloud_proxy_session
            return _cloud_proxy_session()
        except Exception:
            try:
                from screener_downloader import _cloud_proxy_session
                return _cloud_proxy_session()
            except Exception:
                pass
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    })
    return s


def fetch_screener_chart_data(symbol: str, days: str = "365", view: str = "") -> dict:
    clean_symbol = symbol.strip().upper()
    if not clean_symbol:
        clean_symbol = "RELIANCE"
    clean_view = view.strip().lower()

    session = _get_requests_session()

    search_url = f"https://www.screener.in/api/company/search/?q={quote(clean_symbol)}"
    resp = session.get(search_url, timeout=10)
    if not resp.ok:
        raise ValueError(f"Failed to query Screener search API (HTTP {resp.status_code})")
    search_res = resp.json()

    if not search_res:
        raise ValueError(f"Symbol {clean_symbol} not found on Screener")

    # Pick exact match if available, or first result
    company_info = search_res[0]
    for item in search_res:
        item_url = item.get("url", "")
        item_name = item.get("name", "")
        if f"/company/{clean_symbol}/" in item_url.upper() or item_name.upper() == clean_symbol:
            company_info = item
            break

    company_id = company_info['id']
    company_name = company_info['name']
    comp_url = company_info.get('url', '')

    has_consolidated = '/consolidated/' in comp_url

    if clean_view == 'standalone':
        use_consolidated = False
    elif clean_view == 'consolidated':
        use_consolidated = True
    else:
        use_consolidated = has_consolidated

    view_type = "Consolidated" if use_consolidated else "Standalone"
    cons_flag = "&consolidated=true" if use_consolidated else ""

    cache_key = f"{clean_symbol}_{days}_{view_type}"
    if cache_key in CHART_CACHE:
        return CHART_CACHE[cache_key]

    def _fetch_single_query(q: str):
        chart_q = quote(q)
        chart_url = f"https://www.screener.in/api/company/{company_id}/chart/?q={chart_q}&days={days}{cons_flag}"
        try:
            r = session.get(chart_url, timeout=10)
            return r.json().get('datasets', [])
        except Exception as e:
            print(f"Chart query {q} note: {e}", flush=True)
            return []

    all_datasets = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        results = list(executor.map(_fetch_single_query, CHART_QUERIES))
        for ds_list in results:
            all_datasets.extend(ds_list)

    payload = {
        "symbol": clean_symbol,
        "companyName": company_name,
        "companyId": company_id,
        "days": int(days) if str(days).isdigit() else 365,
        "isConsolidated": use_consolidated,
        "hasConsolidated": has_consolidated,
        "viewType": view_type,
        "chartData": {
            "datasets": all_datasets
        }
    }
    CHART_CACHE[cache_key] = payload
    return payload
