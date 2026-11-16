param(
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

$DesktopDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $DesktopDir
$DistUiDir = Join-Path $RootDir "dist"
$PyDistDir = Join-Path $DesktopDir "dist"
$PyWorkDir = Join-Path $DesktopDir "build"
$ReleaseDir = Join-Path $RootDir "release"

Push-Location $RootDir
try {
    if (-not $SkipFrontendBuild) {
        Write-Host "1/4 Building React production UI (dist/)..." -ForegroundColor Cyan
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
    } elseif (-not (Test-Path (Join-Path $DistUiDir "index.html"))) {
        throw "dist/index.html is missing. Run without -SkipFrontendBuild."
    }

    Write-Host "2/4 Generating Ledger.ico..." -ForegroundColor Cyan
    & python (Join-Path $DesktopDir "generate_icon.py")
    if ($LASTEXITCODE -ne 0) { throw "Icon generation failed." }

    Write-Host "3/4 Packaging standalone Ledger.exe via PyInstaller..." -ForegroundColor Cyan
    if (Test-Path $PyDistDir) { Remove-Item $PyDistDir -Recurse -Force }
    if (Test-Path $PyWorkDir) { Remove-Item $PyWorkDir -Recurse -Force }
    & python -m PyInstaller --noconfirm --clean `
        --distpath $PyDistDir `
        --workpath $PyWorkDir `
        (Join-Path $DesktopDir "Ledger.spec")
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed with exit code $LASTEXITCODE" }

    $BuiltExe = Join-Path $PyDistDir "Ledger\Ledger.exe"
    if (-not (Test-Path $BuiltExe)) { throw "Expected $BuiltExe was not produced." }

    Write-Host "4/4 Compiling single installer LedgerSetup.exe via Inno Setup 6..." -ForegroundColor Cyan
    $IsccCandidates = @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $IsccExe = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $IsccExe) {
        $Cmd = Get-Command iscc -ErrorAction SilentlyContinue
        if ($Cmd) { $IsccExe = $Cmd.Source }
    }
    if (-not $IsccExe) {
        throw "Inno Setup 6 (ISCC.exe) not found. Install Inno Setup 6 and retry."
    }

    New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
    & $IsccExe (Join-Path $DesktopDir "LedgerSetup.iss")
    if ($LASTEXITCODE -ne 0) { throw "ISCC failed with exit code $LASTEXITCODE" }

    $SetupExe = Join-Path $ReleaseDir "LedgerSetup.exe"
    if (-not (Test-Path $SetupExe)) { throw "Expected $SetupExe was not produced." }

    Write-Host ""
    Write-Host "Build succeeded!" -ForegroundColor Green
    Write-Host ("  Standalone desktop app : {0}" -f $BuiltExe)
    Write-Host ("  Single Windows installer: {0} ({1:N1} MB)" -f $SetupExe, ((Get-Item $SetupExe).Length / 1MB))
}
finally {
    Pop-Location
}
