# ==============================================================================
#  Bleeds Client — User Uninstaller (PowerShell)
#  Removes the Bleeds Client injection from Discord
#
#  Usage: Right-click -> "Run with PowerShell"
# ==============================================================================

$ErrorActionPreference = "Stop"

$InstallDir    = Join-Path $env:LOCALAPPDATA "Bleeds Client"
$DistDir       = Join-Path $InstallDir "dist\desktop"
$InstallerDir  = Join-Path $InstallDir "installer"
$EquilotlExe   = Join-Path $InstallerDir "EquilotlCli.exe"

Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║      BLEEDS CLIENT — Uninstaller         ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $EquilotlExe)) {
    Write-Host "  [INFO] EquilotlCli.exe not found." -ForegroundColor Yellow
    Write-Host "         Downloading uninstall tool..." -ForegroundColor Yellow
    Write-Host ""
    New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null
    $EquilotlUrl = "https://github.com/Equicord/Equilotl/releases/latest/download/EquilotlCli.exe"
    Invoke-WebRequest -Uri $EquilotlUrl `
        -Headers @{ "User-Agent" = "BleedsClient-Installer/2.0" } `
        -OutFile $EquilotlExe -UseBasicParsing
}

Write-Host "  Launching uninstall GUI..." -ForegroundColor Yellow
Write-Host "  A window will open to choose your Discord target." -ForegroundColor Yellow
Write-Host ""

$env:EQUICORD_USER_DATA_DIR = $InstallDir
$env:EQUICORD_DIRECTORY     = $DistDir
$env:EQUICORD_DEV_INSTALL   = "1"

try {
    & $EquilotlExe "--uninstall"
} catch {
    Write-Host "  [ERROR] Uninstall failed: $_" -ForegroundColor Red
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "  ┌──────────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  Bleeds Client uninstalled successfully!             │" -ForegroundColor Green
Write-Host "  │  Restart Discord to apply the changes.               │" -ForegroundColor Green
Write-Host "  └──────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
