# Starts Meridian on this laptop only: http://127.0.0.1:3000 (not reachable from other computers).
# Run from the meridian folder:   powershell -ExecutionPolicy Bypass -File .\laptop\start.ps1
$ErrorActionPreference = 'Stop'
$App = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $App
if (-not (Test-Path (Join-Path $App '.env'))) { Write-Host "No .env found. Run laptop\setup.ps1 first." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $App '.next'))) { Write-Host "The app is not built. Run laptop\setup.ps1 first." -ForegroundColor Red; exit 1 }
Write-Host "Meridian is starting at http://127.0.0.1:3000  (press Ctrl+C to stop)"
npm run start -- -H 127.0.0.1 -p 3000
