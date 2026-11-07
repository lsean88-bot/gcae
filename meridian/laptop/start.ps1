# Starts Meridian on this laptop only: http://127.0.0.1:3000 (not reachable from other computers).
# Run from the meridian folder:   powershell -ExecutionPolicy Bypass -File .\laptop\start.ps1
# Works in Windows PowerShell 5.1 and PowerShell 7. Keep this file ASCII only.
# If Windows says "running scripts is disabled", use the command above (this run only), or once:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
$ErrorActionPreference = 'Stop'
$App = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $App
if (-not (Test-Path (Join-Path $App '.env'))) { Write-Host "No .env found. Run laptop\setup.ps1 first." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $App '.next\BUILD_ID'))) { Write-Host "The app is not built (or the last build failed). Run laptop\setup.ps1 first." -ForegroundColor Red; exit 1 }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Host "npm was not found. Install Node 22 LTS, then open a new PowerShell window." -ForegroundColor Red; exit 1 }
try {
  $busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop
  if ($busy) { Write-Host "Port 3000 is already in use. Meridian may already be running at http://127.0.0.1:3000 , or close the other program first." -ForegroundColor Red; exit 1 }
} catch { }
# Bind to this laptop only. Both the -H flag and HOSTNAME are set, because 'next start' listens on all interfaces by default.
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3000'
Write-Host "Meridian is starting at http://127.0.0.1:3000  (press Ctrl+C to stop)"
# Windows PowerShell 5.1 turns native stderr text into errors under 'Stop'; judge by exit code instead.
$ErrorActionPreference = 'Continue'
& npm.cmd run start -- -H 127.0.0.1 -p 3000
exit $LASTEXITCODE
