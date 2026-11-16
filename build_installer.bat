@echo off
setlocal
cd /d "%~dp0"

echo =========================================================
echo    Building Ledger Desktop Application & Installer
echo =========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File .\desktop\build_desktop.ps1

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  SUCCESS: New installer created in release\LedgerSetup.exe
    echo =========================================================
) else (
    echo.
    echo [ERROR] Build failed with exit code %ERRORLEVEL%.
)

echo.
pause
