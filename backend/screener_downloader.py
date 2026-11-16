"""Local-only Screener export helper. Credentials are never stored in source code."""
from __future__ import annotations

import io
import os
import re
import threading
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

from openpyxl import load_workbook

APP_DIR = Path(__file__).resolve().parents[1]
_DOWNLOAD_LOCK = threading.Lock()
_PREFETCH_LOCK = threading.Lock()
_PREFETCH_TTL_SECONDS = 120.0
_PREFETCHED_PEERS_HTML: dict[str, tuple[float, str]] = {}


def _store_prefetched_peers(code: str, warehouse_id: str, html: str) -> None:
    if not html or not warehouse_id:
        return
    now = time.monotonic()
    with _PREFETCH_LOCK:
        # Prune expired entries opportunistically so memory stays tiny.
        expired = [k for k, (ts, _) in _PREFETCHED_PEERS_HTML.items() if now - ts > _PREFETCH_TTL_SECONDS]
        for k in expired:
            _PREFETCHED_PEERS_HTML.pop(k, None)
        if code:
            _PREFETCHED_PEERS_HTML[f"code:{code.strip().upper()}"] = (now, html)
        _PREFETCHED_PEERS_HTML[f"wh:{warehouse_id.strip()}"] = (now, html)


def _pop_prefetched_peers(warehouse_id: str, company_code: str = "") -> str:
    now = time.monotonic()
    with _PREFETCH_LOCK:
        keys = []
        if warehouse_id:
            keys.append(f"wh:{warehouse_id.strip()}")
        if company_code:
            keys.append(f"code:{company_code.strip().upper()}")
        for key in keys:
            item = _PREFETCHED_PEERS_HTML.pop(key, None)
            if item and (now - item[0]) <= _PREFETCH_TTL_SECONDS and item[1]:
                # Remove sibling alias if both were stored.
                for other in keys:
                    _PREFETCHED_PEERS_HTML.pop(other, None)
                return item[1]
    return ""


def _local_browser_launch_plan() -> list[tuple[str, Path]]:
    """Return [(playwright_channel, profile_dir), ...] under %LOCALAPPDATA%\\Ledger\\browser-profile."""
    try:
        try:
            from backend.desktop_storage import (
                detect_installed_browsers,
                get_browser_preference,
                get_browser_profile_base_dir,
            )
        except ImportError:
            from desktop_storage import (
                detect_installed_browsers,
                get_browser_preference,
                get_browser_profile_base_dir,
            )
        base_dir = get_browser_profile_base_dir()
        pref = get_browser_preference()
        installed = detect_installed_browsers()
    except Exception:
        base_dir = APP_DIR / "backend" / ".browser-profile"
        pref = "auto"
        installed = ["chrome", "msedge"]

    if pref == "edge":
        order = ["msedge", "chrome"]
    elif pref == "chrome":
        order = ["chrome", "msedge"]
    else:
        order = ["chrome", "msedge"]

    if installed:
        candidates = [ch for ch in order if ch in installed]
        for ch in installed:
            if ch not in candidates:
                candidates.append(ch)
    else:
        candidates = order

    return [(channel, base_dir / channel) for channel in candidates]


class ScreenerDownloadError(RuntimeError):
    pass


class _ExportFormParser(HTMLParser):
    """Find Screener's company export form and the fields it submits."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[dict] = []
        self._form: dict | None = None
        self._button: dict | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs)
        if tag == "form":
            self._form = {"action": attrs.get("action", ""), "method": attrs.get("method", "get").lower(), "fields": {}, "export": False}
            self.forms.append(self._form)
        elif self._form is not None and tag == "input" and attrs.get("name"):
            self._form["fields"][attrs["name"]] = attrs.get("value", "") or ""
        elif self._form is not None and tag in ("button", "input"):
            target = attrs.get("formaction", "")
            label = " ".join(filter(None, (attrs.get("value", ""), attrs.get("aria-label", ""), attrs.get("title", ""))))
            is_export = "export" in (target + " " + label).lower()
            if target and is_export:
                self._form["action"] = target
            if is_export:
                self._form["export"] = True
            if tag == "button":
                self._button = {"export": is_export, "target": target}

    def handle_data(self, data: str) -> None:
        if self._button and "export" in data.lower() and self._form is not None:
            self._form["export"] = True
            if self._button["target"]:
                self._form["action"] = self._button["target"]

    def handle_endtag(self, tag: str) -> None:
        if tag == "button":
            self._button = None
        elif tag == "form":
            self._form = None


def _cloud_proxy_session():
    """Create a Requests session routed through the supplied Webshare proxy."""
    import requests

    server = os.environ.get("SCREENER_PROXY_SERVER", "").strip().strip("\"'")
    if not server:
        raise ScreenerDownloadError("SCREENER_PROXY_SERVER is not configured for the cloud downloader.")
    if "://" not in server:
        server = "http://" + server
    username = os.environ.get("SCREENER_PROXY_USERNAME", "").strip()
    password = os.environ.get("SCREENER_PROXY_PASSWORD", "")
    if username and not password:
        raise ScreenerDownloadError("SCREENER_PROXY_PASSWORD is missing for the configured proxy username.")
    if username:
        scheme, address = server.split("://", 1)
        server = f"{scheme}://{quote(username, safe='')}:{quote(password, safe='')}@{address.rstrip('/')}"
    else:
        server = server.rstrip("/")

    session = requests.Session()
    session.trust_env = False
    session.proxies.update({"http": server, "https": server})
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    })
    return session


def _cloud_login(session) -> None:
    # Reuse a known-good browser session when provided. Screener may issue an
    # anonymous sessionid cookie before login, so cookie existence alone cannot
    # prove that a credential login succeeded.
    session_id = os.environ.get("SCREENER_SESSION_ID", "").strip().strip("\"'")
    if session_id:
        session.cookies.set("sessionid", session_id, domain=".screener.in", path="/")
        return

    email = os.environ.get("SCREENER_EMAIL", "").strip()
    password = os.environ.get("SCREENER_PASSWORD", "")
    if not email or not password:
        raise ScreenerDownloadError("Set SCREENER_EMAIL and SCREENER_PASSWORD in Vercel to sign in to Screener.")

    login_url = "https://www.screener.in/login/"
    response = session.get(login_url, timeout=45)
    response.raise_for_status()
    csrf = session.cookies.get("csrftoken", "")
    if not csrf:
        match = re.search(r'name=[\"\']csrfmiddlewaretoken[\"\']\s+value=[\"\']([^\"\']+)', response.text)
        if match:
            csrf = match.group(1)
    form = {"username": email, "password": password, "next": ""}
    if csrf:
        form["csrfmiddlewaretoken"] = csrf
    result = session.post(login_url, data=form, headers={"Referer": login_url, "Origin": "https://www.screener.in"}, timeout=45)
    result.raise_for_status()
    if not session.cookies.get("sessionid") or urlsplit(result.url).path.rstrip("/").endswith("login"):
        raise ScreenerDownloadError("Screener sign-in failed. Check the Vercel Screener credentials.")


def _download_cloud_workbook(code: str) -> bytes:
    """Fetch the same company Excel export over HTTP, without installing Chromium."""
    session = _cloud_proxy_session()
    _cloud_login(session)
    primary_url = f"https://www.screener.in/company/{code}/consolidated/"
    fallback_url = f"https://www.screener.in/company/{code}/"

    export_form = None
    target_page_url = primary_url

    # Priority 1: Consolidated
    try:
        page = session.get(primary_url, timeout=60)
        page.raise_for_status()
        if not urlsplit(page.url).path.rstrip("/").endswith("login"):
            parser = _ExportFormParser()
            parser.feed(page.text)
            export_form = next((form for form in parser.forms if form["export"] and form["action"]), None)
            if export_form:
                target_page_url = page.url
    except Exception:
        export_form = None

    # Priority 2: Standalone (if Priority 1 lacked export form or was redirected)
    if not export_form:
        page = session.get(fallback_url, timeout=60)
        page.raise_for_status()
        if urlsplit(page.url).path.rstrip("/").endswith("login"):
            raise ScreenerDownloadError(
                "Screener redirected the company page to login. Set a valid SCREENER_SESSION_ID in Vercel, "
                "or check SCREENER_EMAIL and SCREENER_PASSWORD."
            )
        parser = _ExportFormParser()
        parser.feed(page.text)
        export_form = next((form for form in parser.forms if form["export"] and form["action"]), None)
        target_page_url = page.url

    if not export_form:
        raise ScreenerDownloadError("Could not find the company Excel export form. Confirm Screener sign-in and try again.")

    target = urljoin(target_page_url, export_form["action"])
    headers = {"Referer": target_page_url, "Origin": "https://www.screener.in"}
    # Screener's company workbook action is a POST. Some pages express this as a
    # button `formaction`, so relying on the enclosing form's default method can
    # accidentally issue a GET and return HTML instead of the workbook.
    export_data = dict(export_form["fields"])
    csrf = session.cookies.get("csrftoken", "")
    if csrf:
        export_data.setdefault("csrfmiddlewaretoken", csrf)
    export_data.setdefault("next", urlsplit(target_page_url).path)
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    if csrf:
        headers["X-CSRFToken"] = csrf
    response = session.post(target, data=export_data, headers=headers, timeout=90)
    if response.status_code >= 400:
        raise ScreenerDownloadError(
            f"Screener's Excel export endpoint returned HTTP {response.status_code}. "
            "Check Screener sign-in and export access."
        )
    content = response.content
    if not content.startswith(b"PK"):
        content_type = response.headers.get("Content-Type", "unknown").split(";", 1)[0]
        final_path = urlsplit(response.url).path
        page_text = response.text[:20000].lower()
        indicators = [
            label for label, terms in (
                ("login", ("please log in to continue", "invalid username or password", "login required")),
                ("csrf-rejection", ("csrf verification failed", "csrf token missing", "csrf cookie not set")),
                ("captcha", ("captcha", "verify you are human")),
                ("access-denied", ("access denied", "temporarily blocked", "rate limit exceeded")),
                ("subscription-required", ("subscription required to export", "upgrade your plan to export")),
            ) if any(term in page_text for term in terms)
        ]
        if "/login" in final_path:
            reason = "Screener redirected the export to its login page; check the Screener credentials."
        elif "text/html" in content_type or "html" in content[:300].lower().decode("utf-8", errors="ignore"):
            clue = ", ".join(indicators) if indicators else "no explicit rejection marker"
            redirects = ",".join(str(item.status_code) for item in response.history) or "none"
            reason = (
                f"Screener returned HTML instead of the workbook (export endpoint {urlsplit(target).path}; "
                f"final page {final_path}; redirects {redirects}; clues: {clue})."
            )
        else:
            reason = "Screener returned a response that is not an Excel workbook."
        raise ScreenerDownloadError(f"{reason} (HTTP {response.status_code}, {content_type}).")
    return _clean_to_data_sheet(content)


def _clean_to_data_sheet(downloaded: bytes) -> bytes:
    source = io.BytesIO(downloaded)
    workbook = load_workbook(source)
    try:
        if "Data Sheet" not in workbook.sheetnames:
            raise ScreenerDownloadError(
                "Screener's export did not contain a worksheet named 'Data Sheet'. "
                f"Found: {', '.join(workbook.sheetnames)}"
            )
        for name in list(workbook.sheetnames):
            if name != "Data Sheet":
                del workbook[name]
        workbook.active = 0
        output = io.BytesIO()
        workbook.save(output)
        return output.getvalue()
    finally:
        workbook.close()


def _inject_bank_balance_sheet_into_workbook(
    excel_bytes: bytes,
    deposits_by_year: dict[str, float],
    borrowings_by_year: dict[str, float] | None = None,
) -> bytes:
    if not deposits_by_year:
        return excel_bytes
    try:
        source = io.BytesIO(excel_bytes)
        wb = load_workbook(source)
        ws = wb["Data Sheet"] if "Data Sheet" in wb.sheetnames else wb.active
        bs_row = None
        for r in range(1, 100):
            val = str(ws.cell(row=r, column=1).value or "").strip().upper()
            if val == "BALANCE SHEET":
                bs_row = r
                break
        if not bs_row:
            return excel_bytes

        date_row = bs_row + 1
        col_years: dict[int, str] = {}
        for c in range(2, ws.max_column + 1):
            cell_val = str(ws.cell(row=date_row, column=c).value or "")
            m = re.search(r"(\d{4})", cell_val)
            if m:
                col_years[c] = m.group(1)

        borr_row = None
        for r in range(bs_row + 1, bs_row + 25):
            val = str(ws.cell(row=r, column=1).value or "").strip().lower()
            if val == "deposits":
                return excel_bytes
            if val == "borrowings" and borr_row is None:
                borr_row = r

        if not borr_row:
            return excel_bytes

        ws.insert_rows(borr_row)
        ws.cell(row=borr_row, column=1, value="Deposits")
        for c, yr in col_years.items():
            if yr in deposits_by_year:
                ws.cell(row=borr_row, column=c, value=deposits_by_year[yr])

        if borrowings_by_year:
            actual_borr_row = borr_row + 1
            for c, yr in col_years.items():
                if yr in borrowings_by_year:
                    ws.cell(row=actual_borr_row, column=c, value=borrowings_by_year[yr])

        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()
    except Exception:
        return excel_bytes


def _visible_first(page, selectors: tuple[str, ...]):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if locator.count() and locator.is_visible():
                return locator
        except Exception:
            continue
    return None


def _get_screener_credentials() -> tuple[str, str]:
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
    return os.environ.get("SCREENER_EMAIL", "").strip(), os.environ.get("SCREENER_PASSWORD", "")


def _try_environment_login(page) -> tuple[bool, str]:
    """Attempt automatic Screener form login using saved Settings or environment credentials.
    Returns (attempted, error_message).
    """
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    email, password = _get_screener_credentials()
    if not email or not password:
        return False, ""

    email_field = _visible_first(page, (
        '#id_username',
        'input[name="username"]',
        'input[type="email"]',
        'input[name="email"]',
        'input[autocomplete="username"]',
        'input[placeholder*="email" i]',
        'input[type="text"]',
    ))
    password_field = _visible_first(page, (
        '#id_password',
        'input[name="password"]',
        'input[type="password"]',
        'input[autocomplete="current-password"]',
    ))
    if not email_field or not password_field:
        return False, ""

    email_field.fill(email)
    password_field.fill(password)
    submit = _visible_first(page, (
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Log in")',
    ))
    if not submit:
        return False, ""
    submit.click()
    try:
        page.wait_for_load_state("domcontentloaded", timeout=15000)
    except PlaywrightTimeoutError:
        pass

    # Detect immediate credential rejection on Screener's login form
    try:
        if "/login" in page.url.lower():
            err_loc = _visible_first(page, ("ul.errorlist", ".errorlist li", ".alert-error"))
            if err_loc is not None:
                err_txt = " ".join((err_loc.inner_text() or "").split())
                if err_txt:
                    return True, err_txt
    except Exception:
        pass
    return True, ""


def _export_button(page):
    return page.get_by_text(re.compile(r"export\s+to\s+excel", re.IGNORECASE)).first


def _wait_until_signed_in(page, code: str, timeout_seconds: int = 180) -> None:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    primary_url = f"https://www.screener.in/company/{code}/consolidated/"
    fallback_url = f"https://www.screener.in/company/{code}/"
    end = time.monotonic() + timeout_seconds
    while time.monotonic() < end:
        current_url = page.url.lower()
        if "/login" not in current_url:
            # If not on either company page, go to primary URL first
            if f"/company/{code.lower()}" not in current_url:
                page.goto(primary_url, wait_until="domcontentloaded", timeout=60000)

            # Check if current page (or primary) has export button
            try:
                _export_button(page).wait_for(state="visible", timeout=1500)
                return
            except PlaywrightTimeoutError:
                pass

            # If not visible and currently on /consolidated/, try fallback standalone URL
            if "/consolidated" in page.url.lower():
                try:
                    page.goto(fallback_url, wait_until="domcontentloaded", timeout=60000)
                    _export_button(page).wait_for(state="visible", timeout=1500)
                    return
                except PlaywrightTimeoutError:
                    pass
            elif f"/company/{code.lower()}" in page.url.lower():
                try:
                    _export_button(page).wait_for(state="visible", timeout=1500)
                    return
                except PlaywrightTimeoutError:
                    pass
        page.wait_for_timeout(500)
    if os.environ.get("LEDGER_CLOUD_MODE") == "1" or os.environ.get("VERCEL") == "1":
        raise ScreenerDownloadError(
            "Screener did not show the export control in the headless cloud browser. Check proxy and "
            "server-side Screener credentials; interactive verification cannot be completed in the cloud."
        )
    raise ScreenerDownloadError(
        "Screener sign-in was not completed. Sign in in the opened browser, return to the company page, "
        "and retry — or save your Screener Email & Password in Ledger Settings for automatic sign-in."
    )


class _RetryVisibleBrowser(RuntimeError):
    pass


def download_company_workbook(company_code: str) -> bytes:
    code = company_code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&._-]{0,31}", code):
        raise ScreenerDownloadError("Enter a Screener company code such as INFY, ITC, or RELIANCE.")

    cloud_mode = os.environ.get("LEDGER_CLOUD_MODE") == "1" or os.environ.get("VERCEL") == "1"
    if cloud_mode:
        return _download_cloud_workbook(code)

    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright

    # Serialize browser work because one persistent Chrome profile cannot be opened twice.
    if not _DOWNLOAD_LOCK.acquire(timeout=240):
        raise ScreenerDownloadError("Another Screener download is still running. Wait and retry.")

    saved_email, saved_pw = _get_screener_credentials()
    has_creds = bool(saved_email and saved_pw)

    def _run_with_browser(playwright, headless: bool) -> bytes:
        context = None
        try:
            launch_plan = _local_browser_launch_plan()
            launch_errors: list[str] = []
            for channel, profile_dir in launch_plan:
                try:
                    profile_dir.mkdir(parents=True, exist_ok=True)
                    context = playwright.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        channel=channel,
                        headless=headless,
                        accept_downloads=True,
                        args=[] if headless else ["--start-maximized"],
                    )
                    break
                except Exception as exc:
                    launch_errors.append(f"{channel}: {exc}")
                    context = None
            if context is None:
                detail = "; ".join(launch_errors)[:400]
                raise ScreenerDownloadError(
                    "Could not open Google Chrome or Microsoft Edge for Screener export. "
                    f"Install Chrome or Edge, or upload a saved .xlsx workbook. ({detail})"
                )

            page = context.pages[0] if context.pages else context.new_page()
            primary_url = f"https://www.screener.in/company/{code}/consolidated/"
            fallback_url = f"https://www.screener.in/company/{code}/"

            # 1. First priority: Try Consolidated
            page.goto(primary_url, wait_until="domcontentloaded", timeout=60000)

            has_export_btn = False
            needs_login = "/login" in page.url.lower()
            if not needs_login:
                try:
                    _export_button(page).wait_for(state="visible", timeout=3000 if has_creds else 5000)
                    has_export_btn = True
                except PlaywrightTimeoutError:
                    has_export_btn = False

            # 2. Second priority: If no export button on consolidated and not redirected to /login,
            # try Standalone BEFORE concluding that login is required (e.g. standalone banks/companies like TMB)
            if not needs_login and not has_export_btn:
                page.goto(fallback_url, wait_until="domcontentloaded", timeout=60000)
                needs_login = "/login" in page.url.lower()
                if not needs_login:
                    try:
                        _export_button(page).wait_for(state="visible", timeout=3000 if has_creds else 5000)
                        has_export_btn = True
                    except PlaywrightTimeoutError:
                        has_export_btn = False

            # 3. If neither consolidated nor standalone showed the button, or redirected to /login:
            if needs_login or not has_export_btn:
                if "/login" not in page.url.lower():
                    page.goto("https://www.screener.in/login/", wait_until="domcontentloaded", timeout=60000)
                attempted, login_err = _try_environment_login(page)
                if login_err:
                    raise ScreenerDownloadError(
                        f"Screener rejected the saved login credentials: {login_err} "
                        "Update your Screener Email & Password in Ledger Settings."
                    )
                if attempted:
                    page.wait_for_timeout(1500)

                # After login attempt, check Priority 1 (Consolidated) first:
                page.goto(primary_url, wait_until="domcontentloaded", timeout=60000)
                has_export_btn = False
                try:
                    _export_button(page).wait_for(state="visible", timeout=4000)
                    has_export_btn = True
                except PlaywrightTimeoutError:
                    has_export_btn = False

                # If Priority 1 does not show the button, check Priority 2 (Standalone):
                if not has_export_btn:
                    page.goto(fallback_url, wait_until="domcontentloaded", timeout=60000)
                    try:
                        _export_button(page).wait_for(state="visible", timeout=4000)
                        has_export_btn = True
                    except PlaywrightTimeoutError:
                        has_export_btn = False

                # If still not visible after automatic login, wait for interactive sign-in
                if not has_export_btn:
                    if headless:
                        raise _RetryVisibleBrowser("Headless session needs interactive verification.")
                    print("Screener sign-in is needed in the opened browser window. Complete it there; waiting up to 3 minutes.")
                    _wait_until_signed_in(page, code, timeout_seconds=180)

            try:
                with page.expect_download(timeout=60000) as download_event:
                    _export_button(page).click()
                download = download_event.value
                download_path = download.path()
                if not download_path:
                    raise ScreenerDownloadError("Screener did not provide a downloadable Excel file.")
                downloaded = Path(download_path).read_bytes()
            except PlaywrightTimeoutError as exc:
                if headless:
                    raise _RetryVisibleBrowser("Timed out waiting for Excel export in headless mode.") from exc
                raise ScreenerDownloadError(
                    "Timed out waiting for Screener's Excel export. Confirm you are signed in and that "
                    "the company page shows the Export to Excel button."
                ) from exc

            try:
                wh_id = page.locator("#company-info").get_attribute("data-warehouse-id") or ""
                if not wh_id:
                    m_wh = re.search(r'data-warehouse-id="(\d+)"', page.content())
                    wh_id = m_wh.group(1) if m_wh else ""
                if wh_id:
                    peers_resp = context.request.get(
                        f"https://www.screener.in/api/company/{wh_id}/peers/",
                        timeout=15000,
                    )
                    if peers_resp.status == 200:
                        _store_prefetched_peers(code, wh_id, peers_resp.text())
            except Exception:
                pass
            try:
                page_html = page.content()
                if "balance-sheet" in page_html and ("Deposits" in page_html or "deposits" in page_html):
                    from bs4 import BeautifulSoup
                    bs_soup = BeautifulSoup(page_html, "html.parser")
                    bs_sec = bs_soup.select_one("#balance-sheet")
                    if bs_sec:
                        tbl = bs_sec.select_one("table.data-table")
                        if tbl:
                            th_cols = [th.get_text(" ", strip=True) for th in tbl.select("thead th")[1:]]
                            dep_map: dict[str, float] = {}
                            borr_map: dict[str, float] = {}
                            for tr in tbl.select("tbody tr"):
                                tds = [td.get_text(" ", strip=True) for td in tr.select("td")]
                                if not tds:
                                    continue
                                lbl = tds[0].strip().lower()
                                if lbl.startswith("deposits"):
                                    for h, v in zip(th_cols, tds[1:]):
                                        m = re.search(r"(\d{4})", h)
                                        if m and v and v not in ("-", "--"):
                                            try:
                                                dep_map[m.group(1)] = float(v.replace(",", ""))
                                            except ValueError:
                                                pass
                                elif lbl.startswith("borrowing"):
                                    for h, v in zip(th_cols, tds[1:]):
                                        m = re.search(r"(\d{4})", h)
                                        if m and v and v not in ("-", "--"):
                                            try:
                                                borr_map[m.group(1)] = float(v.replace(",", ""))
                                            except ValueError:
                                                pass
                            if dep_map:
                                downloaded = _inject_bank_balance_sheet_into_workbook(downloaded, dep_map, borr_map)
            except Exception:
                pass
            return _clean_to_data_sheet(downloaded)
        finally:
            if context is not None:
                try:
                    context.close()
                except Exception:
                    pass

    try:
        with sync_playwright() as playwright:
            if has_creds:
                try:
                    return _run_with_browser(playwright, headless=True)
                except _RetryVisibleBrowser:
                    pass
            return _run_with_browser(playwright, headless=False)
    finally:
        _DOWNLOAD_LOCK.release()


def fetch_screener_peers_html_via_profile(
    warehouse_id: str,
    company_code: str = "",
    force_fresh: bool = False,
) -> str:
    """Fetch Screener's #peers HTML fragment using the local signed-in Playwright browser profile."""
    wh = str(warehouse_id or "").strip()
    if not wh:
        return ""
    if not force_fresh:
        cached = _pop_prefetched_peers(wh, company_code)
        if cached:
            return cached

    if os.environ.get("LEDGER_CLOUD_MODE") == "1" or os.environ.get("VERCEL") == "1":
        return ""

    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return ""

    if not _DOWNLOAD_LOCK.acquire(timeout=60):
        return ""
    context = None
    try:
        with sync_playwright() as playwright:
            for channel, profile_dir in _local_browser_launch_plan():
                if not profile_dir.exists():
                    continue
                try:
                    context = playwright.chromium.launch_persistent_context(
                        user_data_dir=str(profile_dir),
                        channel=channel,
                        headless=True,
                    )
                    resp = context.request.get(
                        f"https://www.screener.in/api/company/{wh}/peers/",
                        timeout=15000,
                    )
                    if resp.status == 200:
                        text = resp.text()
                        if text and "<table" in text.lower():
                            return text
                except Exception:
                    continue
                finally:
                    if context is not None:
                        try:
                            context.close()
                        except Exception:
                            pass
                        context = None
        return ""
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:
                pass
        _DOWNLOAD_LOCK.release()

