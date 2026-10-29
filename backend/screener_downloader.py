"""Local-only Screener export helper. Credentials are never stored in source code."""
from __future__ import annotations

import io
import os
import re
import threading
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin

from openpyxl import load_workbook

APP_DIR = Path(__file__).resolve().parents[1]
PROFILE_DIR = APP_DIR / "backend" / ".browser-profile"
_DOWNLOAD_LOCK = threading.Lock()


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
            if target:
                self._form["action"] = target
            if is_export:
                self._form["export"] = True
            if tag == "button":
                self._button = {"export": is_export}

    def handle_data(self, data: str) -> None:
        if self._button and "export" in data.lower() and self._form is not None:
            self._form["export"] = True

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
    if not session.cookies.get("sessionid"):
        raise ScreenerDownloadError("Screener sign-in failed. Check the Vercel Screener credentials.")


def _download_cloud_workbook(code: str) -> bytes:
    """Fetch the same company Excel export over HTTP, without installing Chromium."""
    session = _cloud_proxy_session()
    _cloud_login(session)
    page_url = f"https://www.screener.in/company/{code}/"
    page = session.get(page_url, timeout=60)
    page.raise_for_status()

    parser = _ExportFormParser()
    parser.feed(page.text)
    export_form = next((form for form in parser.forms if form["export"] and form["action"]), None)
    if not export_form:
        raise ScreenerDownloadError("Could not find the company Excel export form. Confirm Screener sign-in and try again.")

    target = urljoin(page.url, export_form["action"])
    headers = {"Referer": page.url, "Origin": "https://www.screener.in"}
    method = export_form["method"]
    if method == "post":
        response = session.post(target, data=export_form["fields"], headers=headers, timeout=90)
    else:
        response = session.get(target, params=export_form["fields"], headers=headers, timeout=90)
    response.raise_for_status()
    content = response.content
    if not content.startswith(b"PK"):
        raise ScreenerDownloadError("Screener did not return an Excel workbook. Check the Screener account and export access.")
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


def _visible_first(page, selectors: tuple[str, ...]):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if locator.count() and locator.is_visible():
                return locator
        except Exception:
            continue
    return None


def _try_environment_login(page) -> bool:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    email = os.environ.get("SCREENER_EMAIL", "").strip()
    password = os.environ.get("SCREENER_PASSWORD", "")
    if not email or not password:
        return False

    email_field = _visible_first(page, (
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[autocomplete="username"]',
        'input[placeholder*="email" i]',
        'input[type="text"]',
    ))
    password_field = _visible_first(page, (
        'input[type="password"]',
        'input[autocomplete="current-password"]',
    ))
    if not email_field or not password_field:
        return False

    email_field.fill(email)
    password_field.fill(password)
    submit = _visible_first(page, (
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Log in")',
    ))
    if not submit:
        return False
    submit.click()
    try:
        page.wait_for_load_state("domcontentloaded", timeout=12000)
    except PlaywrightTimeoutError:
        pass
    return True


def _export_button(page):
    return page.get_by_text(re.compile(r"export\s+to\s+excel", re.IGNORECASE)).first


def _wait_until_signed_in(page, code: str, timeout_seconds: int = 180) -> None:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    company_url = f"https://www.screener.in/company/{code}/"
    end = time.monotonic() + timeout_seconds
    while time.monotonic() < end:
        if "/login" not in page.url.lower():
            if "/company/" not in page.url.lower():
                page.goto(company_url, wait_until="domcontentloaded", timeout=60000)
            try:
                _export_button(page).wait_for(state="visible", timeout=1600)
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
        "and retry. If you use automatic login, check SCREENER_EMAIL and SCREENER_PASSWORD."
    )


def download_company_workbook(company_code: str) -> bytes:
    code = company_code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&._-]{0,31}", code):
        raise ScreenerDownloadError("Enter a Screener company code such as INFY, ITC, or RELIANCE.")

    cloud_mode = os.environ.get("LEDGER_CLOUD_MODE") == "1" or os.environ.get("VERCEL") == "1"
    if cloud_mode:
        return _download_cloud_workbook(code)

    # Browser automation remains available for the local interactive workflow.
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright

    # Serialize browser work because one persistent Chrome profile cannot be opened twice.
    if not _DOWNLOAD_LOCK.acquire(timeout=240):
        raise ScreenerDownloadError("Another Screener download is still running. Wait and retry.")
    context = None
    browser = None
    try:
        with sync_playwright() as playwright:
            PROFILE_DIR.mkdir(parents=True, exist_ok=True)
            # Local mode reuses this app-owned Chrome profile and opens a visible window.
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(PROFILE_DIR),
                channel="chrome",
                headless=False,
                accept_downloads=True,
                args=["--start-maximized"],
            )
            page = context.pages[0] if context.pages else context.new_page()
            company_url = f"https://www.screener.in/company/{code}/"
            page.goto(company_url, wait_until="domcontentloaded", timeout=60000)
            button = _export_button(page)
            try:
                button.wait_for(state="visible", timeout=7000)
            except PlaywrightTimeoutError:
                # Only attempt form login if Screener actually presents its credential fields.
                page.goto("https://www.screener.in/login/", wait_until="domcontentloaded", timeout=60000)
                attempted = _try_environment_login(page)
                if attempted:
                    page.wait_for_timeout(2500)
                page.goto(company_url, wait_until="domcontentloaded", timeout=60000)
                try:
                    _export_button(page).wait_for(state="visible", timeout=7000)
                except PlaywrightTimeoutError:
                    print("Screener sign-in is needed in the opened Chrome window. Complete it there; waiting up to 3 minutes.")
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
                raise ScreenerDownloadError(
                    "Timed out waiting for Screener's Excel export. Confirm you are signed in and that "
                    "the company page shows the Export to Excel button."
                ) from exc
            return _clean_to_data_sheet(downloaded)
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:
                pass
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        _DOWNLOAD_LOCK.release()

