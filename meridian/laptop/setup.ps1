# Meridian laptop setup for Windows 11 (PowerShell). Safe to run again.
# Needs: Node 22 or newer, PostgreSQL (psql) and the PostgreSQL admin password, asked at run time.
# The admin password is never written to disk. It is used once to create a dedicated database user.
# Run from the meridian folder:   powershell -ExecutionPolicy Bypass -File .\laptop\setup.ps1
$ErrorActionPreference = 'Stop'
$App = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $App

function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Stop-Setup($t) { Write-Host ""; Write-Host "STOP: $t" -ForegroundColor Red; exit 1 }
function Run-Native($label, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { Stop-Setup "$label failed (exit code $LASTEXITCODE). Read the messages above." }
}

Step "1. Checking Node and PostgreSQL"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-Setup "Node is not installed. Install Node 22 LTS, then open a new PowerShell window:`n  winget install OpenJS.NodeJS.LTS`n  or download the Node 22 LTS installer from https://nodejs.org"
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) { Stop-Setup "Node $(& node -v) is too old. Meridian needs Node 22 or newer. Install it from https://nodejs.org" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-Setup "npm was not found. Reinstall Node 22 LTS from https://nodejs.org" }
Write-Host "Node $(& node -v) ok"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  if ($found) { $env:Path = (Split-Path $found.FullName) + ";" + $env:Path }
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Stop-Setup "PostgreSQL (psql) was not found. Install PostgreSQL 16 or newer:`n  winget install PostgreSQL.PostgreSQL.16`n  or download the installer from https://www.postgresql.org/download/windows/ (keep the default port 5432 and remember the postgres password you choose).`nThen open a new PowerShell window and run this script again."
}
Write-Host "$(& psql --version) ok"

Step "2. Database and settings file"
$EnvFile = Join-Path $App '.env'
if (Test-Path $EnvFile) {
  Write-Host ".env already exists. Keeping it unchanged. Database creation is skipped."
} else {
  $pgHost = if ($env:PGHOST) { $env:PGHOST } else { '127.0.0.1' }
  $pgPort = if ($env:PGPORT) { $env:PGPORT } else { '5432' }
  $adminUser = Read-Host "PostgreSQL admin user [postgres]"
  if (-not $adminUser) { $adminUser = 'postgres' }
  $secure = Read-Host "Password for PostgreSQL user '$adminUser' (typed here, never saved)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  try {
    function Admin-Sql([string[]]$more) { & psql -h $pgHost -p $pgPort -U $adminUser -d postgres -v ON_ERROR_STOP=1 -X -q @more }
    $ok = Admin-Sql @('-tAc', 'select 1') 2>$null
    if ($LASTEXITCODE -ne 0) { Stop-Setup "Could not connect to PostgreSQL at ${pgHost}:${pgPort} as '$adminUser'. Check that the PostgreSQL service is running and the password is right." }
    $appDbPw = (& node -p "require('crypto').randomBytes(24).toString('hex')").Trim()
    $appSecret = (& node -p "require('crypto').randomBytes(48).toString('base64url')").Trim()
    $roleCount = (Admin-Sql @('-tAc', "select count(*) from pg_roles where rolname='meridian_app'")).Trim()
    if ($roleCount -eq '0') { Admin-Sql @('-c', "create role meridian_app login password '$appDbPw'") } else { Admin-Sql @('-c', "alter role meridian_app login password '$appDbPw'") }
    if ($LASTEXITCODE -ne 0) { Stop-Setup "Could not create the database user." }
    $dbCount = (Admin-Sql @('-tAc', "select count(*) from pg_database where datname='meridian'")).Trim()
    if ($dbCount -eq '0') { Admin-Sql @('-c', 'create database meridian owner meridian_app') }
    else { Admin-Sql @('-c', 'alter database meridian owner to meridian_app'); Write-Host "Database 'meridian' already exists. Kept, ownership given to meridian_app." }
    if ($LASTEXITCODE -ne 0) { Stop-Setup "Could not create the database." }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  $lines = @(
    "# Written by laptop/setup.ps1. Local to this laptop. Never commit or share this file.",
    "DATABASE_URL=postgresql://meridian_app:$appDbPw@${pgHost}:${pgPort}/meridian",
    "APP_SECRET=$appSecret"
  )
  # UTF-8 without a byte-order mark, so the first key is read correctly.
  [System.IO.File]::WriteAllText($EnvFile, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  Remove-Variable appDbPw, appSecret
  Write-Host "Created .env (database user meridian_app with a random password, random APP_SECRET)."
}

Step "3. Checking .env"
$envText = Get-Content $EnvFile
$dbUrl = (($envText | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', '').Trim()
$secretVal = (($envText | Where-Object { $_ -match '^APP_SECRET=' } | Select-Object -First 1) -replace '^APP_SECRET=', '').Trim()
if (-not $dbUrl) { Stop-Setup ".env has no DATABASE_URL line. Fix it or delete .env and run this script again." }
if ($secretVal.Length -lt 32) { Stop-Setup ".env APP_SECRET is missing or shorter than 32 characters. Fix it (see .env.example)." }
$null = & psql $dbUrl -X -q -tAc 'select 1' 2>$null
if ($LASTEXITCODE -ne 0) { Stop-Setup "Cannot connect to the database named in .env. Check that the PostgreSQL service is running. If you changed the database password, delete .env and run this script again." }
Write-Host ".env ok, database reachable"

Step "4. Installing the app (npm ci)";            Run-Native "npm ci" { npm ci }
Step "5. Creating tables (db:push)";              Run-Native "db:push" { npm run db:push }
Step "6. Hardening the audit log (db:harden)";    Run-Native "db:harden" { npm run db:harden }
Step "7. Building the app";                       Run-Native "npm run build" { npm run build }

Step "8. One-time password for the GCAE (p-gcae)"
$hasPw = (& psql $dbUrl -X -q -tAc "select count(*) from people where id='p-gcae' and password_hash is not null" 2>$null)
if ($LASTEXITCODE -eq 0 -and $hasPw -and $hasPw.Trim() -ne '0') {
  Write-Host "p-gcae already has a password. Not issuing another. To reset it: npm run setup:passwords -- p-gcae"
} else {
  Write-Host "Write the password below down now. It is shown once. Only p-gcae gets one. Nobody else can sign in."
  Run-Native "setup:passwords" { npm run --silent setup:passwords -- p-gcae }
}

Step "9. Building the Claude connector (mcp)"
Push-Location (Join-Path $App 'mcp')
try {
  Run-Native "mcp npm ci" { npm ci }
  Run-Native "mcp build" { npm run build }
} finally { Pop-Location }

Write-Host @"

Setup finished.
Next:
  1. Start Meridian:  powershell -ExecutionPolicy Bypass -File .\laptop\start.ps1
  2. Open http://127.0.0.1:3000 , sign in as the GCAE with the one-time password, and choose a new password.
  3. Create your Claude token:  npm run token:create -- --person p-gcae --name laptop --days 90
  See docs\LAPTOP-QUICKSTART.md
"@
