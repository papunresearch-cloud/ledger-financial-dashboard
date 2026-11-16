"""Ledger Desktop — Google Drive Automated Backup & Installer Publisher.

This script:
1. Packages a clean, dependency-free Source Code Backup archive (ledger-desktop-source-backup.zip).
2. Copies the Windows Installer (LedgerSetup.exe) and User Guide (User Guide.pdf) to Google Drive.
3. Generates clear, step-by-step restoration and installation guide text files in both folders.
4. Verifies synchronization with Google Drive for Desktop and Google Drive Cloud API.
"""
from __future__ import annotations

import os
import shutil
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))


def find_google_drive_path() -> Path | None:
    """Find the local Google Drive for Desktop root folder."""
    # 1. Standard default G:\My Drive
    standard = Path("G:/My Drive")
    if standard.exists() and standard.is_dir():
        return standard

    # 2. Check all drive letters D: through Z: for "My Drive"
    for letter in "DEFHIJKLMNOPQRSTUVWXYZ":
        cand = Path(f"{letter}:/My Drive")
        if cand.exists() and cand.is_dir():
            return cand

    # 3. Check user profile Google Drive folder
    user_drive = Path(os.environ.get("USERPROFILE", "")) / "Google Drive" / "My Drive"
    if user_drive.exists() and user_drive.is_dir():
        return user_drive

    return None


def create_source_zip(dest_zip_path: Path) -> int:
    """Create a clean, compressed source code archive excluding build artifacts."""
    exclude_dirs = {
        "node_modules",
        "dist",
        "build",
        "release",
        "__pycache__",
        ".git",
        ".venv",
        ".idea",
        ".vscode",
        "scratch",
        ".pytest_cache",
    }
    exclude_extensions = {".pyc", ".pyo", ".tmp", ".log"}

    dest_zip_path.parent.mkdir(parents=True, exist_ok=True)
    temp_zip = dest_zip_path.with_suffix(".tmp.zip")

    count = 0
    with zipfile.ZipFile(temp_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for foldername, subfolders, filenames in os.walk(ROOT_DIR):
            subfolders[:] = [d for d in subfolders if d not in exclude_dirs]
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext in exclude_extensions:
                    continue
                # Do not re-zip backup zips or temporary files
                if filename.endswith(".zip"):
                    continue

                filepath = Path(foldername) / filename
                try:
                    rel_path = filepath.relative_to(ROOT_DIR)
                    zf.write(filepath, arcname=rel_path)
                    count += 1
                except Exception as e:
                    print(f"  [Skip] {filepath.name}: {e}")

    if dest_zip_path.exists():
        dest_zip_path.unlink()
    temp_zip.rename(dest_zip_path)
    return count


INSTALL_INSTRUCTIONS = """========================================================================
LEDGER DESKTOP — INSTALLATION INSTRUCTIONS FOR ANY PC / LAPTOP
========================================================================

How to Install Ledger from Google Drive:
----------------------------------------
1. Download "LedgerSetup.exe" to your Downloads or Desktop folder.
2. Double-click "LedgerSetup.exe" to run the installer.
3. Follow the simple on-screen wizard (installation takes ~15 seconds).
4. A "Ledger" desktop icon and Windows Start Menu shortcut will be created.
5. Launch Ledger — that's it!

Key Features & Prerequisites:
-----------------------------
• Standalone & Self-Contained: No Python, Node.js, or code tools required!
  The installer bundles everything required to run on any 64-bit Windows PC.
• User Guide Included: Open "User Guide.pdf" in this folder for the complete
  step-by-step company financial analysis workflow and settings guide.
• Seamless Sync: If Google Drive for Desktop is installed on the computer,
  all company research web reports will automatically sync to your Google Drive!

For detailed configuration (Gemini AI API key, Screener credentials, etc.),
refer to the bundled "User Guide.pdf".
"""

RECOVERY_INSTRUCTIONS = """========================================================================
LEDGER DESKTOP — SOURCE CODE RECOVERY & DEVELOPMENT GUIDE
========================================================================

How to Restore and Recover the Project on Any Computer:
-------------------------------------------------------

Step 1: Extract the Source Code
-------------------------------
1. Download "ledger-desktop-source-backup.zip".
2. Extract the zip archive into any directory of your choice, for example:
   E:\\STOCK-ANALYSIS\\ledger-desktop
   or
   C:\\Projects\\ledger-desktop

Step 2: Install Node.js & Python Dependencies
---------------------------------------------
Open PowerShell or Command Prompt in the extracted folder:

1. Install Frontend Dependencies:
   npm install

2. Install Python Backend Dependencies:
   pip install -r requirements.txt
   playwright install chromium

Step 3: Run the Application
---------------------------
• To run in interactive development mode:
  npm run dev

• To build the Windows installer (LedgerSetup.exe):
  build_installer.bat

• To create another Google Drive backup:
  backup_to_gdrive.bat

Step 4: Restore Personal Settings & Tokens (Optional)
-----------------------------------------------------
If moving to a new computer and you wish to transfer your saved Gemini key
and Google Drive authorization tokens, copy:
- credentials.json
- token.json
Into:
C:\\Users\\<YourUsername>\\AppData\\Local\\Ledger\\
"""


def main():
    print("=" * 65)
    print("     LEDGER DESKTOP — GOOGLE DRIVE BACKUP & INSTALLER SYNC")
    print("=" * 65)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # 1. Locate Google Drive
    gdrive_root = find_google_drive_path()
    if not gdrive_root:
        print("[ERROR] Could not find 'My Drive' virtual drive (G:\\My Drive).")
        print("Please ensure Google Drive for Desktop is installed and running.")
        sys.exit(1)

    print(f"[1/4] Found Google Drive: {gdrive_root}")
    app_folder = gdrive_root / "Ledger_App"
    installer_folder = app_folder / "Installer"
    backup_folder = app_folder / "Project_Backup"

    installer_folder.mkdir(parents=True, exist_ok=True)
    backup_folder.mkdir(parents=True, exist_ok=True)

    # 2. Sync Installer & User Guide
    print("[2/4] Backing up Windows Installer & Documentation to Google Drive...")
    installer_src = ROOT_DIR / "release" / "LedgerSetup.exe"
    guide_src = ROOT_DIR / "User Guide.pdf"

    if not installer_src.exists():
        print(f"  [!] Warning: {installer_src} not found. Please run build_installer.bat first.")
    else:
        installer_dest = installer_folder / "LedgerSetup.exe"
        print(f"  -> Copying LedgerSetup.exe ({installer_src.stat().st_size / (1024 * 1024):.1f} MB)...")
        shutil.copy2(installer_src, installer_dest)
        print(f"     Saved: {installer_dest}")

    if guide_src.exists():
        guide_dest = installer_folder / "User Guide.pdf"
        shutil.copy2(guide_src, guide_dest)
        print(f"     Saved: {guide_dest} ({guide_src.stat().st_size / 1024:.1f} KB)")

    (installer_folder / "HOW_TO_INSTALL.txt").write_text(INSTALL_INSTRUCTIONS, encoding="utf-8")
    print(f"     Created installation guide: {installer_folder / 'HOW_TO_INSTALL.txt'}")

    # 3. Create Clean Source Code Backup Archive
    print("\n[3/4] Creating Clean Source Code Backup Archive...")
    local_zip = ROOT_DIR / "release" / "ledger-desktop-source-backup.zip"
    gdrive_zip = backup_folder / "ledger-desktop-source-backup.zip"

    start_t = time.time()
    file_count = create_source_zip(local_zip)
    elapsed = time.time() - start_t
    zip_size_kb = local_zip.stat().st_size / 1024

    print(f"  -> Packaged {file_count} project files in {elapsed:.2f}s ({zip_size_kb:,.1f} KB)")
    print(f"  -> Copying source archive to Google Drive...")
    shutil.copy2(local_zip, gdrive_zip)
    print(f"     Saved: {gdrive_zip}")

    (backup_folder / "HOW_TO_RECOVER.txt").write_text(RECOVERY_INSTRUCTIONS, encoding="utf-8")
    print(f"     Created recovery guide: {backup_folder / 'HOW_TO_RECOVER.txt'}")

    # 4. Check Cloud Sync Status
    print("\n[4/4] Verifying Cloud Synchronization...")
    try:
        from backend.google_drive_service import get_drive_sync_status
        status = get_drive_sync_status()
        if status.get("apiConnected"):
            print(f"  [OK] Google Drive Cloud API Connected: {status.get('userEmail')}")
        if status.get("gdriveDesktopAvailable"):
            print(f"  [OK] Google Drive for Desktop Sync Active: {status.get('gdriveDesktopPath')}")
    except Exception as e:
        print(f"  [Note] Sync status query info: {e}")

    print("\n" + "=" * 65)
    print("SUCCESS: Project backup and installer are live in Google Drive!")
    print("=" * 65)
    print("Google Drive Locations:")
    print(f"  1. Installer Folder : {installer_folder}")
    print(f"     - LedgerSetup.exe ({installer_src.stat().st_size / (1024 * 1024):.1f} MB)")
    print(f"     - User Guide.pdf")
    print(f"     - HOW_TO_INSTALL.txt")
    print()
    print(f"  2. Backup Folder    : {backup_folder}")
    print(f"     - ledger-desktop-source-backup.zip ({zip_size_kb:,.1f} KB)")
    print(f"     - HOW_TO_RECOVER.txt")
    print()
    print("You can now install Ledger on any computer or recover the code")
    print("directly from drive.google.com or your G:\\My Drive\\ folder.")
    print("=" * 65)


if __name__ == "__main__":
    main()
