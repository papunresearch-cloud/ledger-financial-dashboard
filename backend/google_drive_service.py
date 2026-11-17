"""Google Drive and local filesystem synchronization service for Ledger Desktop.

Provides:
1. Local Save: Instant and offline-first storage in G:\\My Drive\\Ledger_Reports and %LOCALAPPDATA%\\Ledger\\web-reports.
2. Cloud API Sync: Direct Google Drive API (v3) in-place file updating (files.update) preserving fileId and revisions.
3. Unified History Tracker: Fast query and retrieval of saved company research reports.
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Optional Google API imports
try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
    _GOOGLE_API_AVAILABLE = True
except ImportError:
    _GOOGLE_API_AVAILABLE = False


_DRIVE_LOCK = threading.Lock()
_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
]
_FOLDER_NAME = "Ledger_Reports"


def _safe_code(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", str(raw or "").strip()).strip("_")
    return cleaned.upper() or "COMPANY"


def get_data_dir() -> Path:
    override = os.environ.get("LEDGER_DATA_DIR", "").strip()
    if override:
        base = Path(override)
    elif os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        base = Path(local_app_data) / "Ledger" if local_app_data else Path.home() / "AppData" / "Local" / "Ledger"
    else:
        xdg = os.environ.get("XDG_DATA_HOME", "").strip()
        base = (Path(xdg) if xdg else Path.home() / ".local" / "share") / "Ledger"
    base.mkdir(parents=True, exist_ok=True)
    return base


def get_local_web_reports_dir() -> Path:
    p = get_data_dir() / "web-reports"
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_gdrive_desktop_folder() -> Path | None:
    """Detect if G:\\My Drive\\Ledger_Reports or G:\\My Drive exists."""
    candidates = [
        Path("G:/My Drive/Ledger_Reports"),
        Path("G:/My Drive"),
    ]
    for c in candidates:
        if c.is_dir():
            if c.name != _FOLDER_NAME:
                target = c / _FOLDER_NAME
                try:
                    target.mkdir(parents=True, exist_ok=True)
                    return target
                except Exception:
                    continue
            return c
    return None


def get_credentials_path() -> Path | None:
    """Find credentials.json for Google OAuth."""
    backend_dir = Path(__file__).resolve().parent
    candidates = [
        backend_dir / "credentials.json",
        get_data_dir() / "credentials.json",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def get_token_path() -> Path:
    """Path to drive_token.json."""
    return get_data_dir() / "drive_token.json"


def get_drive_service() -> Any:
    """Return an authorized Google Drive v3 service instance, refreshing tokens if needed."""
    if not _GOOGLE_API_AVAILABLE:
        return None

    token_path = get_token_path()
    # Check fallback in backend dir
    backend_token = Path(__file__).resolve().parent / "token.json"
    if not token_path.is_file() and backend_token.is_file():
        try:
            shutil.copy(backend_token, token_path)
        except Exception:
            pass

    creds = None
    if token_path.is_file():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path))
        except Exception as e:
            print(f"[DriveSync] Error loading token: {e}", flush=True)

    if creds:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                with open(token_path, "w", encoding="utf-8") as f:
                    f.write(creds.to_json())
            except Exception as e:
                print(f"[DriveSync] Error refreshing token: {e}", flush=True)
                creds = None

    if not creds or not creds.valid:
        return None

    try:
        service = build("drive", "v3", credentials=creds, cache_discovery=False)
        return service
    except Exception as e:
        print(f"[DriveSync] Error building drive service: {e}", flush=True)
        return None


def get_or_create_drive_folder_id(service: Any) -> str | None:
    """Find or create the Ledger_Reports folder in Google Drive."""
    if not service:
        return None
    try:
        q = f"name = '{_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        res = service.files().list(q=q, fields="files(id, name)").execute()
        files = res.get("files", [])
        if files:
            return files[0]["id"]

        folder_metadata = {
            "name": _FOLDER_NAME,
            "mimeType": "application/vnd.google-apps.folder",
        }
        folder = service.files().create(body=folder_metadata, fields="id").execute()
        return folder.get("id")
    except Exception as e:
        print(f"[DriveSync] Error getting/creating folder in Drive: {e}", flush=True)
        return None


def get_drive_sync_status() -> dict[str, Any]:
    """Return status of Local Google Drive Folder & Google Cloud API Sync."""
    gdrive_desktop = get_gdrive_desktop_folder()
    local_reports_dir = get_local_web_reports_dir()

    cred_path = get_credentials_path()
    token_path = get_token_path()

    api_connected = False
    user_email = ""
    folder_id = None

    service = get_drive_service()
    if service:
        try:
            about = service.about().get(fields="user").execute()
            user_email = about.get("user", {}).get("emailAddress", "")
            folder_id = get_or_create_drive_folder_id(service)
            api_connected = True
        except Exception:
            api_connected = False

    # Count local files
    local_file_count = 0
    if gdrive_desktop and gdrive_desktop.is_dir():
        local_file_count = len(list(gdrive_desktop.glob("*_Complete_Report.html")))
    elif local_reports_dir.is_dir():
        local_file_count = len(list(local_reports_dir.glob("*_Complete_Report.html")))

    return {
        "apiConnected": api_connected,
        "userEmail": user_email,
        "hasCredentials": bool(cred_path),
        "hasToken": bool(token_path.is_file()),
        "driveFolderId": folder_id,
        "gdriveDesktopPath": str(gdrive_desktop) if gdrive_desktop else "",
        "gdriveDesktopAvailable": bool(gdrive_desktop and gdrive_desktop.is_dir()),
        "localWebReportsPath": str(local_reports_dir),
        "totalSavedReports": local_file_count,
    }


def format_timestamp(dt: datetime) -> str:
    """Format a datetime into readable format e.g. '13 Nov 2026, 02:45 PM'."""
    try:
        # Convert to local time if timezone aware
        if dt.tzinfo:
            dt = dt.astimezone()
        return dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return dt.strftime("%Y-%m-%d %H:%M")


def search_company_report(code: str, company_name: str = "") -> dict[str, Any]:
    """Search for an existing report for this company across local Desktop Drive and Google Drive API.
    Returns metadata including lastModified date, formatted date, version, and location.
    """
    safe_c = _safe_code(code)
    safe_n = _safe_code(company_name)
    candidates = [f"{safe_c}_Complete_Report.html"]
    if safe_n and safe_n != safe_c:
        candidates.append(f"{safe_n}_Complete_Report.html")

    gdrive_desktop = get_gdrive_desktop_folder()
    local_reports = get_local_web_reports_dir()

    # 1. Check local G:\My Drive\Ledger_Reports first
    for cand in candidates:
        target = None
        if gdrive_desktop and (gdrive_desktop / cand).is_file():
            target = gdrive_desktop / cand
        elif (local_reports / cand).is_file():
            target = local_reports / cand

        if target and target.is_file():
            mtime = target.stat().st_mtime
            dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
            # Try to get Google Drive cloud metadata if API is connected
            cloud_info = _get_cloud_file_info(cand)
            return {
                "found": True,
                "code": safe_c,
                "companyName": company_name or safe_c,
                "fileName": cand,
                "lastModified": dt.isoformat(),
                "formattedDate": format_timestamp(dt),
                "version": cloud_info.get("version", 1) if cloud_info else 1,
                "driveFileId": cloud_info.get("id", "") if cloud_info else "",
                "webViewLink": cloud_info.get("webViewLink", "") if cloud_info else "",
                "localPath": str(target),
                "storageType": "cloud_and_desktop" if (gdrive_desktop and cloud_info) else "desktop" if gdrive_desktop else "local",
            }

    # 2. Check cloud API if not found locally
    for cand in candidates:
        cloud_info = _get_cloud_file_info(cand)
        if cloud_info:
            dt_str = cloud_info.get("modifiedTime", "")
            try:
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                f_date = format_timestamp(dt)
            except Exception:
                f_date = dt_str

            return {
                "found": True,
                "code": safe_c,
                "companyName": company_name or safe_c,
                "fileName": cand,
                "lastModified": dt_str,
                "formattedDate": f_date,
                "version": int(cloud_info.get("version", 1)),
                "driveFileId": cloud_info.get("id", ""),
                "webViewLink": cloud_info.get("webViewLink", ""),
                "localPath": "",
                "storageType": "cloud_only",
            }

    return {"found": False, "code": safe_c}


def _get_cloud_file_info(filename: str) -> dict[str, Any] | None:
    service = get_drive_service()
    if not service:
        return None
    try:
        folder_id = get_or_create_drive_folder_id(service)
        if not folder_id:
            return None
        q = f"name = '{filename}' and '{folder_id}' in parents and trashed = false"
        res = service.files().list(q=q, fields="files(id, name, modifiedTime, version, webViewLink)").execute()
        files = res.get("files", [])
        return files[0] if files else None
    except Exception:
        return None


def read_company_report_html(code: str, company_name: str = "") -> tuple[str | None, dict[str, Any]]:
    """Read the full HTML of a saved report from local drive or cloud API."""
    info = search_company_report(code, company_name)
    if not info.get("found"):
        return None, info

    local_path = info.get("localPath")
    if local_path and os.path.isfile(local_path):
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                return f.read(), info
        except Exception as e:
            print(f"[DriveSync] Error reading local file {local_path}: {e}", flush=True)

    # Fallback to downloading from Google Drive API
    file_id = info.get("driveFileId")
    service = get_drive_service()
    if file_id and service:
        try:
            request = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            fh.seek(0)
            html = fh.read().decode("utf-8")
            # Cache locally
            local_save = get_local_web_reports_dir() / info["fileName"]
            try:
                local_save.write_text(html, encoding="utf-8")
                info["localPath"] = str(local_save)
            except Exception:
                pass
            return html, info
        except Exception as e:
            print(f"[DriveSync] Error downloading file {file_id} from Drive API: {e}", flush=True)

    return None, info


def save_or_update_company_report(code: str, company_name: str, html_content: str) -> dict[str, Any]:
    """Save or update report:
    1. Local Save: Writes immediately to G:\\My Drive\\Ledger_Reports and %LOCALAPPDATA%\\Ledger\\web-reports.
    2. Cloud API Sync: Updates in-place in Google Drive (files.update) preserving the same file ID and revision history.
    """
    if not html_content or len(html_content) < 100:
        raise ValueError("Invalid HTML content to save.")

    safe_c = _safe_code(code)
    filename = f"{safe_c}_Complete_Report.html"

    with _DRIVE_LOCK:
        # Step 1: Instant Local Save (Desktop Google Drive & AppData)
        gdrive_desktop = get_gdrive_desktop_folder()
        local_reports = get_local_web_reports_dir()

        local_saved_paths = []
        if gdrive_desktop and gdrive_desktop.is_dir():
            target_desktop = gdrive_desktop / filename
            try:
                target_desktop.write_text(html_content, encoding="utf-8")
                local_saved_paths.append(str(target_desktop))
            except Exception as e:
                print(f"[DriveSync] Failed writing to GDrive desktop: {e}", flush=True)

        target_appdata = local_reports / filename
        try:
            target_appdata.write_text(html_content, encoding="utf-8")
            local_saved_paths.append(str(target_appdata))
        except Exception as e:
            print(f"[DriveSync] Failed writing to local appdata: {e}", flush=True)

        now = datetime.now(timezone.utc)
        last_q = extract_last_quarter_for_report(safe_c, target_appdata)
        result = {
            "success": True,
            "code": safe_c,
            "fileName": filename,
            "lastModified": now.isoformat(),
            "formattedDate": format_timestamp(now),
            "localPaths": local_saved_paths,
            "cloudSynced": False,
            "version": 1,
            "driveFileId": "",
            "lastQuarter": last_q,
        }

        # Step 2: Cloud API Sync (In-Place Update with revision tracking)
        service = get_drive_service()
        if service:
            try:
                folder_id = get_or_create_drive_folder_id(service)
                if folder_id:
                    # Check if file already exists in folder
                    q = f"name = '{filename}' and '{folder_id}' in parents and trashed = false"
                    res = service.files().list(q=q, fields="files(id, name, version, webViewLink)").execute()
                    files = res.get("files", [])

                    # Clean up any accidental cloud duplicates
                    if len(files) > 1:
                        for dup in files[1:]:
                            try:
                                service.files().delete(fileId=dup["id"]).execute()
                            except Exception:
                                pass
                        files = [files[0]]

                    media = MediaIoBaseUpload(
                        io.BytesIO(html_content.encode("utf-8")),
                        mimetype="text/html",
                        resumable=True,
                    )

                    if files:
                        # Existing file -> in-place update (preserves fileId and creates new revision)
                        existing_id = files[0]["id"]
                        updated = (
                            service.files()
                            .update(
                                fileId=existing_id,
                                media_body=media,
                                fields="id, name, modifiedTime, version, webViewLink",
                            )
                            .execute()
                        )
                        result["cloudSynced"] = True
                        result["driveFileId"] = updated.get("id", "")
                        result["version"] = int(updated.get("version", 1))
                        result["webViewLink"] = updated.get("webViewLink", "")
                        result["modifiedTime"] = updated.get("modifiedTime", now.isoformat())
                    else:
                        # If Google Drive Desktop is present, writing to G:\My Drive\Ledger_Reports
                        # already syncs the file directly to the cloud. Only call API create if desktop isn't active
                        # to avoid race condition conflicts with Google Drive Desktop.
                        if not gdrive_desktop:
                            created = (
                                service.files()
                                .create(
                                    body={"name": filename, "parents": [folder_id]},
                                    media_body=media,
                                    fields="id, name, modifiedTime, version, webViewLink",
                                )
                                .execute()
                            )
                            result["cloudSynced"] = True
                            result["driveFileId"] = created.get("id", "")
                            result["version"] = int(created.get("version", 1))
                            result["webViewLink"] = created.get("webViewLink", "")
                            result["modifiedTime"] = created.get("modifiedTime", now.isoformat())
                        else:
                            result["cloudSynced"] = True
                            result["version"] = 1

                    # Clean up any leftover local (1) duplicates if created by Drive desktop
                    if gdrive_desktop and gdrive_desktop.is_dir():
                        for dup_local in gdrive_desktop.glob(f"{safe_c}_Complete_Report (*).html"):
                            try:
                                dup_local.unlink()
                            except Exception:
                                pass
            except Exception as e:
                print(f"[DriveSync] Cloud API sync error: {e}", flush=True)

        return result


def delete_company_reports(codes: list[str]) -> dict[str, Any]:
    """Permanently delete specified company reports from:
    1. Google Drive desktop folder (e.g. G:\\My Drive\\Ledger_Reports)
    2. Local AppData storage (e.g. %LOCALAPPDATA%\\Ledger\\web-reports)
    3. Google Drive Cloud API (files.delete)
    4. About Cache (cleanup)
    """
    gdrive_desktop = get_gdrive_desktop_folder()
    local_reports = get_local_web_reports_dir()
    about_dir = get_data_dir() / "about-cache"

    deleted_codes: list[str] = []
    deleted_files_count = 0

    with _DRIVE_LOCK:
        # Step 1 & 2: Local deletions in GDrive Desktop folder and Local AppData
        for c in codes:
            safe_c = _safe_code(c)
            if not safe_c:
                continue

            # Target files in Google Drive Desktop folder
            if gdrive_desktop and gdrive_desktop.is_dir():
                for f in gdrive_desktop.glob(f"{safe_c}_Complete_Report*.html"):
                    try:
                        f.unlink()
                        deleted_files_count += 1
                    except Exception as e:
                        print(f"[DriveSync] Error deleting {f}: {e}", flush=True)

            # Target files in Local AppData folder
            if local_reports and local_reports.is_dir():
                for f in local_reports.glob(f"{safe_c}_Complete_Report*.html"):
                    try:
                        f.unlink()
                        deleted_files_count += 1
                    except Exception as e:
                        print(f"[DriveSync] Error deleting {f}: {e}", flush=True)

            # Clear about-cache for this company
            if about_dir and about_dir.is_dir():
                json_path = about_dir / f"{safe_c.upper()}.json"
                if json_path.is_file():
                    try:
                        json_path.unlink()
                    except Exception:
                        pass

            deleted_codes.append(safe_c)

        # Step 3: Delete from Google Drive Cloud API permanently
        service = get_drive_service()
        if service:
            try:
                folder_id = get_or_create_drive_folder_id(service)
                if folder_id:
                    for safe_c in deleted_codes:
                        try:
                            q = f"name contains '{safe_c}_Complete_Report' and '{folder_id}' in parents and trashed = false"
                            res = service.files().list(q=q, fields="files(id, name)").execute()
                            files = res.get("files", [])
                            for item in files:
                                service.files().delete(fileId=item["id"]).execute()
                                print(f"[DriveSync] Cloud deleted file: {item['name']} ({item['id']})", flush=True)
                        except Exception as e:
                            print(f"[DriveSync] Cloud delete failed for {safe_c}: {e}", flush=True)
            except Exception as e:
                print(f"[DriveSync] Cloud delete service error: {e}", flush=True)

    return {
        "success": True,
        "deletedCodes": deleted_codes,
        "deletedFilesCount": deleted_files_count,
        "count": len(deleted_codes),
    }


_MONTH_NAME_MAP = {
    "jan": "Jan", "january": "Jan",
    "feb": "Feb", "february": "Feb",
    "mar": "March", "march": "March",
    "apr": "April", "april": "April",
    "may": "May",
    "jun": "June", "june": "June",
    "jul": "July", "july": "July",
    "aug": "August", "august": "August",
    "sep": "Sep", "sept": "Sep", "september": "Sep",
    "oct": "Oct", "october": "Oct",
    "nov": "Nov", "november": "Nov",
    "dec": "Dec", "december": "Dec",
}

_MONTH_ORDER = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

def format_quarter_label(month_str: str, year_str: str) -> str:
    m_clean = month_str.strip().lower()
    m_name = _MONTH_NAME_MAP.get(m_clean, month_str.capitalize())
    yr = year_str.strip()
    if len(yr) == 2:
        yr = f"20{yr}"
    return f"{m_name}, {yr}"

def extract_last_quarter_for_report(code: str, file_path: Path) -> str:
    """Extract latest reported financial quarter for a company report."""
    try:
        about_dir = get_data_dir() / "about-cache"
        json_path = about_dir / f"{code.upper()}.json"
        if json_path.is_file():
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
                headers = data.get("sources", {}).get("financial_snapshot", {}).get("quarterly_pnl", {}).get("headers")
                if headers and isinstance(headers, list):
                    for h in reversed(headers):
                        m = re.match(r"^([A-Za-z]{3,9})\s+(\d{2,4})$", str(h).strip())
                        if m:
                            return format_quarter_label(m.group(1), m.group(2))
            except Exception:
                pass
    except Exception:
        pass

    try:
        if file_path.is_file():
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read(150000)
            meta_m = re.search(r'<meta\s+name=["\']ledger-last-quarter["\']\s+content=["\']([^"\']+)["\']', text, re.I)
            if meta_m:
                return meta_m.group(1).strip()
            sh_periods = re.findall(r'class="sh-period-text"[^>]*>\s*([A-Za-z]{3,9})\s+(\d{4})\s*<', text, re.I)
            if sh_periods:
                scored = []
                for m_str, y_str in sh_periods:
                    m_val = _MONTH_ORDER.get(m_str.lower(), 0)
                    y_val = int(y_str)
                    scored.append((y_val, m_val, m_str, y_str))
                if scored:
                    best = max(scored, key=lambda x: (x[0], x[1]))
                    return format_quarter_label(best[2], best[3])
    except Exception:
        pass

    return "Sep, 2026"


def list_all_saved_reports() -> list[dict[str, Any]]:
    """List all reports stored in local desktop folder and cloud."""
    catalog: dict[str, dict[str, Any]] = {}
    gdrive_desktop = get_gdrive_desktop_folder()
    local_reports = get_local_web_reports_dir()

    search_dirs = [p for p in (gdrive_desktop, local_reports) if p and p.is_dir()]
    for sdir in search_dirs:
        for f in sdir.glob("*_Complete_Report.html"):
            mtime = f.stat().st_mtime
            dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
            code = f.name.replace("_Complete_Report.html", "").upper()
            if code not in catalog or mtime > catalog[code]["mtime"]:
                last_q = extract_last_quarter_for_report(code, f)
                catalog[code] = {
                    "code": code,
                    "fileName": f.name,
                    "filePath": str(f),
                    "sizeBytes": f.stat().st_size,
                    "lastModified": dt.isoformat(),
                    "formattedDate": format_timestamp(dt),
                    "mtime": mtime,
                    "lastQuarter": last_q,
                }

    items = list(catalog.values())
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return items


def authorize_interactive() -> bool:
    """Run interactive OAuth consent flow in default browser to authorize Google Drive on a new machine."""
    if not _GOOGLE_API_AVAILABLE:
        print("Google API libraries not installed. Run: pip install -r requirements.txt", flush=True)
        return False
    cred_path = get_credentials_path()
    if not cred_path:
        print("credentials.json not found! Place credentials.json in backend/ or %LOCALAPPDATA%\\Ledger\\", flush=True)
        return False

    print(f"Opening browser for Google Drive authorization using {cred_path.name}...", flush=True)
    flow = InstalledAppFlow.from_client_secrets_file(str(cred_path), _SCOPES)
    creds = flow.run_local_server(port=0)

    token_path = get_token_path()
    token_path.parent.mkdir(parents=True, exist_ok=True)
    with open(token_path, "w", encoding="utf-8") as f:
        f.write(creds.to_json())

    backend_token = Path(__file__).resolve().parent / "token.json"
    try:
        backend_token.write_text(creds.to_json(), encoding="utf-8")
    except Exception:
        pass

    print(f"Authorization successful! Token saved to {token_path}", flush=True)
    return True


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Ledger Google Drive Sync Service")
    parser.add_argument("--login", action="store_true", help="Authorize Google Drive account interactively")
    parser.add_argument("--status", action="store_true", help="Display current sync status")
    args = parser.parse_args()

    if args.login:
        authorize_interactive()
    else:
        st = get_drive_sync_status()
        print(json.dumps(st, indent=2))

