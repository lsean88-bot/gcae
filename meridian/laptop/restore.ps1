# Meridian database restore (Windows PowerShell 5.1 or 7). REPLACES the current database contents.
# Run from the meridian folder:   powershell -ExecutionPolicy Bypass -File .\laptop\restore.ps1 [-File <backup.dump>]
# Without -File you choose from the backups in %USERPROFILE%\CGAE-backups. Keep this file ASCII only.
param([string]$File)
$ErrorActionPreference = 'Stop'
$App = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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
$pgRestore = Find-PgTool 'pg_restore'

# Choose the backup file.
if (-not $File) {
  $list = @(Get-ChildItem -LiteralPath $Dir -Filter 'meridian-*.dump' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  if ($list.Count -eq 0) { Fail "No backups found in $Dir. Pass one with -File." }
  Write-Host "Backups in ${Dir}:"
  for ($i = 0; $i -lt $list.Count; $i++) { Write-Host ("  [{0}] {1}  ({2})" -f ($i + 1), $list[$i].Name, $list[$i].LastWriteTime) }
  $pick = Read-Host "Number to restore (blank to cancel)"
  $n = 0
  if (-not [int]::TryParse($pick, [ref]$n) -or $n -lt 1 -or $n -gt $list.Count) { Write-Host "Cancelled. Nothing changed."; exit 0 }
  $File = $list[$n - 1].FullName
}
if (-not (Test-Path -LiteralPath $File)) { Fail "File not found: $File" }
$File = (Resolve-Path -LiteralPath $File).Path

$old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& $pgRestore -l $File *> $null
$readable = $LASTEXITCODE
$ErrorActionPreference = $old
if ($readable -ne 0) { Fail "That file is not a readable Meridian backup. Nothing changed." }

$busy = $false
try { $busy = [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop) } catch { }
if ($busy) { Write-Host "Meridian appears to be running on port 3000. Close the start.ps1 window before restoring." -ForegroundColor Yellow }

Write-Host ""
Write-Host "This will REPLACE everything in database '$dbName' with:" -ForegroundColor Yellow
Write-Host "  $File"
Write-Host "Changes made after that backup will be lost. A safety backup of the current data is taken first."
$answer = Read-Host "Type RESTORE (capitals) to continue, anything else cancels"
if ($answer -cne 'RESTORE') { Write-Host "Cancelled. Nothing changed."; exit 0 }

Write-Host ""
Write-Host "Taking a safety backup of the current database..."
$old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup.ps1') -Quiet
$safe = $LASTEXITCODE
$ErrorActionPreference = $old
if ($safe -ne 0) { Fail "The safety backup failed, so nothing was restored." }

Write-Host "Restoring..."
$old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$env:PGPASSWORD = $pw
try {
  # Single transaction: if anything fails the database stays as it was.
  & $pgRestore -h $dbHost -p $dbPort -U $user -d $dbName --no-password --clean --if-exists --no-owner --no-privileges --single-transaction $File
  $code = $LASTEXITCODE
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $ErrorActionPreference = $old
}
if ($code -ne 0) { Fail "Restore failed (exit code $code). The database was left as it was (single transaction). The safety backup is in $Dir." }

Write-Host "Re-applying audit log hardening (db:harden)..."
Set-Location $App
$old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& npm.cmd run db:harden
$h = $LASTEXITCODE
$ErrorActionPreference = $old
if ($h -ne 0) { Fail "Restored, but db:harden failed. Run it again before using the app: npm.cmd run db:harden" }
Write-Host "Restore finished. Start Meridian again with laptop\start.ps1." -ForegroundColor Green
