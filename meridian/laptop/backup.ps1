# Meridian database backup (Windows PowerShell 5.1 or 7). Safe to run any time, also while the app is running.
# Writes a timestamped pg_dump file to %USERPROFILE%\CGAE-backups and keeps the newest 14.
# Run from the meridian folder:   powershell -ExecutionPolicy Bypass -File .\laptop\backup.ps1
# Keep this file ASCII only. The password is read from .env, passed to pg_dump through the environment, and never printed.
param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$App = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Keep = 14
$Dir = Join-Path $env:USERPROFILE 'CGAE-backups'
function Fail($t) { Write-Host ""; Write-Host "STOP: $t" -ForegroundColor Red; exit 1 }

$EnvFile = Join-Path $App '.env'
if (-not (Test-Path $EnvFile)) { Fail "No .env found in $App. Run laptop\setup.ps1 first." }
$line = Get-Content -Encoding UTF8 $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { Fail ".env has no DATABASE_URL line." }
$u = $null
try { $u = [Uri](($line -replace '^DATABASE_URL=', '').Trim()) } catch { Fail "DATABASE_URL in .env is not a valid address." }
$user = ''; $pw = ''
if ($u.UserInfo) {
  $parts = $u.UserInfo.Split(':', 2)
  $user = [Uri]::UnescapeDataString($parts[0])
  if ($parts.Count -gt 1) { $pw = [Uri]::UnescapeDataString($parts[1]) }
}
$dbHost = $u.Host
$dbPort = if ($u.Port -gt 0) { [string]$u.Port } else { '5432' }
$dbName = $u.AbsolutePath.TrimStart('/')
if (-not $user -or -not $dbName) { Fail "Could not read the database user or name from DATABASE_URL." }

function Find-PgTool([string]$name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $f = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$name.exe" -ErrorAction SilentlyContinue |
    Sort-Object { $v = 0; [void][int]::TryParse((Split-Path (Split-Path $_.FullName -Parent) -Parent | Split-Path -Leaf), [ref]$v); $v } -Descending | Select-Object -First 1
  if ($f) { return $f.FullName }
  Fail "$name was not found. Install PostgreSQL client tools or add the PostgreSQL bin folder to PATH."
}
$pgDump = Find-PgTool 'pg_dump'
$pgRestore = Find-PgTool 'pg_restore'

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$final = Join-Path $Dir "meridian-$stamp.dump"
$tmp = "$final.partial"

$old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$env:PGPASSWORD = $pw
try {
  & $pgDump -h $dbHost -p $dbPort -U $user -d $dbName -Fc --no-password -f $tmp
  $code = $LASTEXITCODE
  if ($code -eq 0) { & $pgRestore -l $tmp *> $null; $code = $LASTEXITCODE }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $ErrorActionPreference = $old
}
if ($code -ne 0 -or -not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  Fail "Backup failed (exit code $code). Check that the PostgreSQL service is running. Nothing was kept."
}
Move-Item -LiteralPath $tmp -Destination $final
$size = [math]::Round((Get-Item $final).Length / 1KB)
Write-Host "Backup written: $final ($size KB, readable check passed)"

# Keep the newest $Keep backups only.
Get-ChildItem -LiteralPath $Dir -Filter 'meridian-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Not included in the backup: the .env file (it holds APP_SECRET, which unlocks model keys saved in the app)."
  Write-Host "Backups are not encrypted. They stay protected only by your Windows account and disk encryption."
  Write-Host ""
  Write-Host "Nothing is scheduled. To run this backup every day at 18:30 you could run this once (not run for you):"
  Write-Host ('schtasks /Create /SC DAILY /ST 18:30 /TN "Meridian backup" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"' + $PSCommandPath + '\" -Quiet"')
  Write-Host "Remove it later with:  schtasks /Delete /TN `"Meridian backup`" /F"
}
