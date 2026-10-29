"""Local-only Screener export helper. Credentials are never stored in source code."""
from __future__ import annotations

import io
import os
import re
import threading
import time
from pathlib import Path

from openpyxl import load_workbook
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

APP_DIR = Path(__file__).resolve().parents[1]
PROFILE_DIR = APP_DIR / "backend" / ".browser-profile"
_DOWNLOAD_LOCK = threading.Lock()


class ScreenerDownloadError(RuntimeError):
    pass


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
        # The Vercel build installs Chromium with PLAYWRIGHT_BROWSERS_PATH=0,
        # placing it inside the Playwright package. Match that path at runtime.
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "0"

    # Serialize browser work because one persistent Chrome profile cannot be opened twice.
    if not _DOWNLOAD_LOCK.acquire(timeout=240):
        raise ScreenerDownloadError("Another Screener download is still running. Wait and retry.")
    context = None
    browser = None
    try:
        with sync_playwright() as playwright:
            if cloud_mode:
                # Serverless runs have no desktop or durable browser profile. Keep each
                # invocation isolated and route browser traffic through the supplied proxy.
                proxy_server = os.environ.get("SCREENER_PROXY_SERVER", "").strip()
                if not proxy_server:
                    raise ScreenerDownloadError("SCREENER_PROXY_SERVER is not configured for the cloud downloader.")
                proxy = {"server": proxy_server}
                proxy_username = os.environ.get("SCREENER_PROXY_USERNAME", "")
                proxy_password = os.environ.get("SCREENER_PROXY_PASSWORD", "")
                if proxy_username:
                    proxy["username"] = proxy_username
                if proxy_password:
                    proxy["password"] = proxy_password
                browser = playwright.chromium.launch(headless=True, proxy=proxy)
                context = browser.new_context(accept_downloads=True)
            else:
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
                    wait_seconds = 20 if cloud_mode else 180
                    _wait_until_signed_in(page, code, timeout_seconds=wait_seconds)

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

