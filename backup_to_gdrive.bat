@echo off
setlocal
cd /d "%~dp0"

echo =========================================================
echo    Ledger — Google Drive Backup & Installer Publisher
echo =========================================================
echo.

python .\scripts\backup_to_gdrive.py

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  SUCCESS: Backup & Installer are saved to Google Drive!
    echo =========================================================
) else (
    echo.
    echo [ERROR] Backup failed with exit code %ERRORLEVEL%.
)

echo.
pause
