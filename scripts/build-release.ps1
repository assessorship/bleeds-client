# Bleeds Client — Full Release Builder
# Builds the JS client then compiles the installer exe with the dist files embedded.
# Output: installer-src\bin\Release\...\publish\Bleeds Client-Installer.exe
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "[1/4] Building Bleeds Client..." -ForegroundColor Cyan
Set-Location $root
& pnpm build
if ($LASTEXITCODE -ne 0) { Write-Error "pnpm build failed"; exit 1 }

Write-Host "[2/4] Copying dist files into installer..." -ForegroundColor Cyan
$src  = Join-Path $root "dist\desktop"
$dest = Join-Path $root "installer-src\dist-embed"

# Only copy the runtime files — skip sourcemaps to keep the exe small
$filesToEmbed = @(
    "patcher.js",
    "renderer.js",
    "renderer.css",
    "preload.js",
    "package.json"
)

foreach ($f in $filesToEmbed) {
    $srcFile  = Join-Path $src $f
    $destFile = Join-Path $dest $f
    if (Test-Path $srcFile) {
        Copy-Item $srcFile $destFile -Force
        $size = [math]::Round((Get-Item $destFile).Length / 1KB, 1)
        Write-Host "  + $f ($size KB)"
    } else {
        Write-Warning "  ! $f not found in dist\desktop — skipping"
    }
}

Write-Host "[3/4] Compiling installer exe..." -ForegroundColor Cyan
$csproj = Join-Path $root "installer-src\Bleeds ClientInstaller.csproj"
& dotnet publish $csproj -c Release -r win-x64 --no-self-contained -o (Join-Path $root "installer-src\bin\publish")
if ($LASTEXITCODE -ne 0) { Write-Error "dotnet publish failed"; exit 1 }

Write-Host "[4/4] Done!" -ForegroundColor Green
$exePath = Join-Path $root "installer-src\bin\publish\Bleeds Client-Installer.exe"
if (Test-Path $exePath) {
    $sizeMB = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
    Write-Host ""
    Write-Host "  Output: $exePath" -ForegroundColor White
    Write-Host "  Size:   $sizeMB MB" -ForegroundColor White
    Write-Host ""
    Write-Host "Send Bleeds Client-Installer.exe to users — all client files are embedded inside it." -ForegroundColor Green
} else {
    Write-Warning "Exe not found at expected path. Check dotnet output above."
}
