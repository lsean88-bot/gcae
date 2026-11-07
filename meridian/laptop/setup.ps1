# Meridian laptop setup for Windows 11 (PowerShell). Safe to run again.
# Needs: Node 22 or newer, PostgreSQL (psql) and the PostgreSQL admin password, asked at run time.
# The admin password is never written to disk. It is used once to create a dedicated database user.
# Run from the meridian folder:   powershell -ExecutionPolicy Bypass -File .\laptop\setup.ps1
# Works in Windows PowerShell 5.1 (the Windows default) and PowerShell 7. Keep this file ASCII only and avoid PS7-only syntax.
# Execution policy: the command above applies to this run only and changes nothing permanently.
# If you run .\laptop\setup.ps1 directly and Windows says "running scripts is disabled", use the command above,
# or once: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# This script calls npm.cmd (not npm) so npm's .ps1 wrapper is never blocked by the execution policy.
$ErrorActionPreference = 'Stop'
$App = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $App

function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Stop-Setup($t) { Write-Host ""; Write-Host "STOP: $t" -ForegroundColor Red; exit 1 }
function Run-Native($label, [scriptblock]$cmd) {
  # Windows PowerShell 5.1 turns native stderr (warnings) into errors under 'Stop'; judge by exit code instead.
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $cmd } finally { $ErrorActionPreference = $old }
  if ($LASTEXITCODE -ne 0) { Stop-Setup "$label failed (exit code $LASTEXITCODE). Read the messages above." }
}
# psql on Windows needs every option BEFORE the connection string, so the URL is passed with -d.
function Psql-Url([string]$url, [string]$sql) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & psql -X -q -t -A -d $url -c $sql 2>$null } finally { $ErrorActionPreference = $old }
}

Step "1. Checking Node and PostgreSQL"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-Setup "Node is not installed. Install Node 22 LTS, then open a new PowerShell window:`n  winget install OpenJS.NodeJS.LTS`n  or download the Node 22 LTS installer from https://nodejs.org"
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) { Stop-Setup "Node $(& node -v) is too old. Meridian needs Node 22 or newer. Install it from https://nodejs.org" }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Stop-Setup "npm was not found. Reinstall Node 22 LTS from https://nodejs.org" }
Write-Host "Node $(& node -v) ok"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  # Newest installed version first (numeric sort, so 16 beats 9.6).
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object { $v = 0; [void][int]::TryParse((Split-Path (Split-Path $_.FullName -Parent) -Parent | Split-Path -Leaf), [ref]$v); $v } -Descending | Select-Object -First 1
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
    function Admin-Sql([string[]]$more) {
      $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { & psql -h $pgHost -p $pgPort -U $adminUser -d postgres -v ON_ERROR_STOP=1 -X -q @more } finally { $ErrorActionPreference = $old }
    }
    function Admin-SqlText([string]$sql) {
      # SQL goes in on stdin so the generated password never appears on a command line.
      $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $sql | & psql -h $pgHost -p $pgPort -U $adminUser -d postgres -v ON_ERROR_STOP=1 -X -q -f - 2>&1 | Out-Null } finally { $ErrorActionPreference = $old }
    }
    $null = Admin-Sql @('-tAc', 'select 1') 2>$null
    if ($LASTEXITCODE -ne 0) { Stop-Setup "Could not connect to PostgreSQL at ${pgHost}:${pgPort} as '$adminUser'. Check that the PostgreSQL service is running and the password is right." }
    $appDbPw = (& node -p "require('crypto').randomBytes(24).toString('hex')").Trim()
    $appSecret = (& node -p "require('crypto').randomBytes(48).toString('base64url')").Trim()
    $roleCount = (Admin-Sql @('-tAc', "select count(*) from pg_roles where rolname='meridian_app'")).Trim()
    if ($roleCount -eq '0') { Admin-SqlText "create role meridian_app login password '$appDbPw';" } else { Admin-SqlText "alter role meridian_app login password '$appDbPw';" }
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
$envText = Get-Content -Encoding UTF8 $EnvFile
$dbUrl = (($envText | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', '').Trim()
$secretVal = (($envText | Where-Object { $_ -match '^APP_SECRET=' } | Select-Object -First 1) -replace '^APP_SECRET=', '').Trim()
if (-not $dbUrl) { Stop-Setup ".env has no DATABASE_URL line. Fix it or delete .env and run this script again." }
if ($secretVal.Length -lt 32) { Stop-Setup ".env APP_SECRET is missing or shorter than 32 characters. Fix it (see .env.example)." }
$null = Psql-Url $dbUrl 'select 1'
if ($LASTEXITCODE -ne 0) { Stop-Setup "Cannot connect to the database named in .env. Check that the PostgreSQL service is running. If you changed the database password, delete .env and run this script again." }
Write-Host ".env ok, database reachable"

Step "4. Installing the app (npm ci)"
# A running app or editor locks next-swc*.node and makes npm ci fail with EPERM. Stop Node first.
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcs) {
  Write-Host "Stopping $($nodeProcs.Count) running Node process(es) so npm ci can replace locked files."
  $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
if (Test-Path "node_modules") {
  try { Remove-Item -Recurse -Force "node_modules" -ErrorAction Stop }
  catch { Stop-Setup "Could not remove node_modules (a file is locked). Close VS Code and any app window, restart Windows if needed, then run this script again. If it repeats, Windows Defender may be scanning the folder: Add-MpPreference -ExclusionPath '$((Get-Location).Path)' (as Administrator)." }
}
Run-Native "npm ci" { npm.cmd ci }
Step "5. Creating tables (db:push)";              Run-Native "db:push" { npm.cmd run db:push }
Step "6. Hardening the audit log (db:harden)";    Run-Native "db:harden" { npm.cmd run db:harden }
Step "7. Building the app";                       Run-Native "npm run build" { npm.cmd run build }

Step "7b. Self-check (iron rules and analytics tests)"
Run-Native "test:rules" { npm.cmd run test:rules }
Run-Native "test:analytics" { npm.cmd run test:analytics }

Step "8. One-time password for the GCAE (p-gcae)"
$hasPw = Psql-Url $dbUrl "select count(*) from people where id='p-gcae' and password_hash is not null"
if ($LASTEXITCODE -eq 0 -and $hasPw -and $hasPw.Trim() -ne '0') {
  Write-Host "p-gcae already has a password. Not issuing another. To reset it: npm run setup:passwords -- p-gcae"
} else {
  Write-Host "Write the password below down now. It is shown once. Only p-gcae gets one. Nobody else can sign in."
  Run-Native "setup:passwords" { npm.cmd run --silent setup:passwords -- p-gcae }
}

Step "9. Building the Claude connector (mcp)"
Push-Location (Join-Path $App 'mcp')
try {
  Run-Native "mcp npm ci" { npm.cmd ci }
  Run-Native "mcp build" { npm.cmd run build }
} finally { Pop-Location }

Write-Host @"

Setup finished.
Next:
  1. Start Meridian:  powershell -ExecutionPolicy Bypass -File .\laptop\start.ps1
  2. Open http://127.0.0.1:3000 , sign in as the GCAE with the one-time password, and choose a new password.
  3. Create your Claude token:  npm.cmd run token:create -- --person p-gcae --name laptop --days 90
  4. Back up the database any time:  powershell -ExecutionPolicy Bypass -File .\laptop\backup.ps1
     (backups do not contain .env; keep a copy of APP_SECRET if you saved Claude/model keys in the app)
  See docs\LAPTOP-QUICKSTART.md
"@
