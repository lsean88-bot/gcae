<#
.SYNOPSIS
  One-command Windows setup for the MKTron GIA library brain (akos-graphify-bridge). Safe, re-runnable, user-profile only. No administrator rights.

.DESCRIPTION
  What it does, in order (each step prints OK / WARN / FAIL and is skipped if already done):
    1  finds a supported Python (3.11 or 3.12 preferred; 3.10-3.13 accepted; 3.14 warned: not tested with graphify)
    2  creates one virtual environment  (<Root>\gia-venv)  and installs graphify (pinned), openpyxl, pyyaml
    3  copies the skill's scripts to a stable folder  (<Root>\gia-skill)  so deleting the zip never breaks it
    4  writes a launcher  (<Root>\gia-bin\gia.cmd)  so you type  gia doctor / gia recall ... (and giagraph validate ...)  with the right Python and UTF-8 every time
    5  creates your library  (<Root>\GIA-Library)  with an 'inbox' notes shelf, locks it down (owner-only) and runs guard
    6  runs the health checks: doctor, then a full smoke test (validate, capture, recall, seal, anchor, verify, guard)
    7  optional (-SetEnv): sets PYTHONUTF8=1, GIA_ANCHOR_FILE and adds gia-bin to PATH (user level)
  It never touches your evidence folders, never edits the Claude app or its plugins, never deletes your library, and does not change system settings.
  It cannot turn off the Windows 'python3.exe' Store alias (that is a Settings switch): it tells you how.

.PARAMETER Root          Base folder for everything it creates. Default: your user profile.
.PARAMETER Library       Library folder. Default: <Root>\GIA-Library
.PARAMETER AnchorFile    Audit-anchor file, must be OUTSIDE the library (ideally another drive). Default: D:\GIA-Anchors\gia-anchors.jsonl if D: exists, else <Root>\GIA-Anchors\...
.PARAMETER PythonExe     Use this Python instead of auto-detecting.
.PARAMETER GraphifyVersion  Pinned graphify version (tested: 0.8.51, 0.9.38, 0.9.97). Default 0.9.97.
.PARAMETER SetEnv        Also set the environment variables (see 7). Without it the script only prints what to set.
.PARAMETER EnvScope      User (default, persists) or Process (this window only; used by tests).
.PARAMETER Remove        Undo: delete the venv, skill copy and launcher and remove the variables this script set. Never deletes the library or the anchor file.
.PARAMETER CheckOnly     Change nothing: report what is installed and what a run would do.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\tools\setup_windows.ps1
  powershell -ExecutionPolicy Bypass -File .\tools\setup_windows.ps1 -SetEnv
  powershell -ExecutionPolicy Bypass -File .\tools\setup_windows.ps1 -CheckOnly
#>
[CmdletBinding()]
param(
    [string]$Root = $env:USERPROFILE,
    [string]$Library,
    [string]$AnchorFile,
    [string]$PythonExe,
    [string]$GraphifyVersion = "0.9.97",
    [switch]$SetEnv,
    [ValidateSet("User", "Process")][string]$EnvScope = "User",
    [switch]$Remove,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
$script:fails = 0; $script:warns = 0
$venv = Join-Path $Root "gia-venv"; $skillCopy = Join-Path $Root "gia-skill"; $binDir = Join-Path $Root "gia-bin"
if (-not $Library) { $Library = Join-Path $Root "GIA-Library" }
if (-not $AnchorFile) {
    $drive = if (Test-Path "D:\") { "D:\GIA-Anchors" } else { Join-Path $Root "GIA-Anchors" }
    $AnchorFile = Join-Path $drive "gia-anchors.jsonl"
}
$logFile = Join-Path $Root "gia-setup.log"

function Say($status, $msg) {
    $line = "[{0,-4}] {1}" -f $status, $msg
    switch ($status) { "FAIL" { $script:fails++; Write-Host $line -ForegroundColor Red } "WARN" { $script:warns++; Write-Host $line -ForegroundColor Yellow } "OK" { Write-Host $line -ForegroundColor Green } default { Write-Host $line } }
    if (-not $CheckOnly) { try { Add-Content -Path $logFile -Value ("{0} {1}" -f (Get-Date -Format s), $line) -ErrorAction SilentlyContinue } catch { } }
}

# Run a native program safely under Windows PowerShell 5.1 (no NativeCommandError, UTF-8, captured output).
function Invoke-Native([string]$Exe, [string[]]$Arguments, [hashtable]$Env = @{}) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = ($Arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join " "
    $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $psi.EnvironmentVariables["PYTHONUTF8"] = "1"
    foreach ($dbg in "GIA_NO_FSYNC", "GIA_SKIP_PERF", "GIA_TODAY", "GIA_DEBUG") { if ($psi.EnvironmentVariables.ContainsKey($dbg)) { $psi.EnvironmentVariables.Remove($dbg) } }   # test/debug switches must never leak into real use
    foreach ($k in $Env.Keys) { $psi.EnvironmentVariables[$k] = [string]$Env[$k] }
    $p = [System.Diagnostics.Process]::Start($psi)
    $out = $p.StandardOutput.ReadToEnd(); $err = $p.StandardError.ReadToEnd(); $p.WaitForExit()
    [pscustomobject]@{ Code = $p.ExitCode; Out = ($out + $err).Trim() }
}

function Get-PyVersion([string]$exe) {
    try { $r = Invoke-Native $exe @("-c", "import sys;print('%d.%d.%d' % sys.version_info[:3])"); if ($r.Code -eq 0 -and $r.Out -match '^\d+\.\d+\.\d+$') { return [version]$r.Out } } catch { }
    return $null
}

function Find-Python {
    if ($PythonExe) { return $PythonExe }
    $cands = New-Object System.Collections.ArrayList
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        foreach ($v in "3.11", "3.12", "3.13", "3.10") {
            $r = Invoke-Native $py.Source @("-$v", "-c", "import sys;print(sys.executable)")
            if ($r.Code -eq 0 -and (Test-Path $r.Out)) { [void]$cands.Add($r.Out) }
        }
    }
    foreach ($glob in "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe", "$env:APPDATA\uv\python\cpython-3.1*\python.exe", "$env:LOCALAPPDATA\Python\pythoncore-3.1*\python.exe") {
        Get-ChildItem $glob -ErrorAction SilentlyContinue | ForEach-Object { [void]$cands.Add($_.FullName) }
    }
    foreach ($c in $cands) {
        if ($c -like "*WindowsApps*") { continue }                       # the Microsoft Store stub
        $v = Get-PyVersion $c
        if ($v -and $v.Major -eq 3 -and $v.Minor -in 11, 12) { return $c }
    }
    foreach ($c in $cands) { $v = Get-PyVersion $c; if ($v -and $v.Major -eq 3 -and $v.Minor -in 10, 13) { return $c } }
    return $null
}

function Set-Var([string]$name, [string]$value) {
    $old = [Environment]::GetEnvironmentVariable($name, $EnvScope)
    if ($old -eq $value) { Say "OK" "$name already set"; return }
    [Environment]::SetEnvironmentVariable($name, $value, $EnvScope)
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
    Say "OK" ("$name set ($EnvScope)" + $(if ($old) { " (was: $old)" } else { "" }))
}

Say "INFO" "GIA Windows setup | Root=$Root | Library=$Library | graphify==$GraphifyVersion | mode=$(if ($Remove) {'REMOVE'} elseif ($CheckOnly) {'CHECK ONLY'} else {'SETUP'})"

# ------------------------------------------------------------------ remove
if ($Remove) {
    foreach ($p in $venv, $skillCopy, $binDir) {
        if (Test-Path $p) { Remove-Item -LiteralPath $p -Recurse -Force; Say "OK" "removed $p" } else { Say "INFO" "not present: $p" }
    }
    foreach ($n in "PYTHONUTF8", "GIA_ANCHOR_FILE") {
        if ([Environment]::GetEnvironmentVariable($n, $EnvScope)) { [Environment]::SetEnvironmentVariable($n, $null, $EnvScope); Say "OK" "$n cleared ($EnvScope)" }
    }
    $path = [Environment]::GetEnvironmentVariable("Path", $EnvScope)
    if ($path -and $path.Split(";") -contains $binDir) { [Environment]::SetEnvironmentVariable("Path", (($path.Split(";") | Where-Object { $_ -ne $binDir }) -join ";"), $EnvScope); Say "OK" "gia-bin removed from PATH" }
    Say "INFO" "Your library ($Library) and anchor file ($AnchorFile) were NOT touched."
    exit 0
}

# ------------------------------------------------------------------ 0 preflight
if ($env:OS -ne "Windows_NT") { Say "FAIL" "this script is for Windows"; exit 2 }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$skillSrc = @( (Join-Path $scriptDir "..\01-skill\akos-graphify-bridge"), (Join-Path $scriptDir "..\skill\akos-graphify-bridge"), (Join-Path $scriptDir "skill\akos-graphify-bridge") ) | Where-Object { Test-Path (Join-Path $_ "scripts\brain.py") } | Select-Object -First 1
if (-not $skillSrc) { Say "FAIL" "cannot find the skill next to this script (expected ..\01-skill or ..\skill). Run it from the unzipped package."; exit 2 }
$skillSrc = (Resolve-Path $skillSrc).Path
Say "OK" "skill source: $skillSrc"
foreach ($bad in @($Library, $AnchorFile)) { if ($bad -match "IA sean\\2026 audit plan") { Say "WARN" "$bad is inside your evidence folders; the evidence-protection rules advise keeping libraries elsewhere" } }
if ($AnchorFile.StartsWith($Library, [StringComparison]::OrdinalIgnoreCase)) { Say "FAIL" "the anchor file must be OUTSIDE the library"; exit 2 }
$drv = Get-PSDrive -Name ($Root.Substring(0, 1)) -ErrorAction SilentlyContinue
if ($drv -and $drv.Free -lt 2GB) { Say "FAIL" ("less than 2 GB free on {0}:" -f $drv.Name); exit 2 }
if (-not (Test-Path $Root)) { Say "FAIL" "Root does not exist: $Root"; exit 2 }

# ------------------------------------------------------------------ 1 python
$pyBase = Find-Python
if (-not $pyBase) {
    Say "FAIL" "no usable Python found. Install Python 3.11 once, then re-run:  winget install -e --id Python.Python.3.11   (no admin needed with --scope user)"
    Say "INFO" "the Microsoft Store 'python3.exe' does not count: it is a stub that prints 'Python was not found'."
    exit 2
}
$pv = Get-PyVersion $pyBase
if (-not $pv) { Say "FAIL" "$pyBase did not run"; exit 2 }
if ($pv.Major -ne 3 -or $pv.Minor -lt 10) { Say "FAIL" "Python $pv is too old (3.10+ needed)"; exit 2 }
if ($pv.Minor -ge 14) { Say "WARN" "Python $pv has not been tested with graphify; 3.11 is the tested version" } else { Say "OK" "Python $pv  ($pyBase)" }
if ($CheckOnly) {
    foreach ($p in $venv, $skillCopy, $binDir, $Library) { Say "INFO" ("{0}: {1}" -f $(if (Test-Path $p) { "present " } else { "missing " }), $p) }
    Say "INFO" "a normal run would create the missing items above and run the health checks. Nothing was changed."
    exit 0
}
foreach ($d in $Root) { try { $t = Join-Path $d ".gia-write-test"; Set-Content $t "x"; Remove-Item $t -Force } catch { Say "FAIL" "cannot write to $d"; exit 2 } }

# ------------------------------------------------------------------ 2 venv + packages
$vpy = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $vpy)) {
    $r = Invoke-Native $pyBase @("-m", "venv", $venv)
    if ($r.Code -ne 0) { Say "FAIL" "could not create the virtual environment: $($r.Out)"; exit 1 }
    Say "OK" "virtual environment created: $venv"
} else { Say "OK" "virtual environment exists: $venv" }
$have = Invoke-Native $vpy @("-c", "import importlib.metadata as m;print(m.version('graphifyy'));import openpyxl,yaml")
if ($have.Code -eq 0 -and $have.Out.Split("`n")[0].Trim() -eq $GraphifyVersion) {
    Say "OK" "graphify $GraphifyVersion, openpyxl and pyyaml already installed"
} else {
    Say "INFO" "installing graphifyy==$GraphifyVersion, openpyxl, pyyaml (needs internet; about 1-2 minutes)"
    $r = Invoke-Native $vpy @("-m", "pip", "install", "--disable-pip-version-check", "-q", "graphifyy==$GraphifyVersion", "openpyxl", "pyyaml")
    if ($r.Code -ne 0) { Say "FAIL" "pip install failed: $(($r.Out -split "`n" | Select-Object -Last 3) -join ' | ')"; exit 1 }
    Say "OK" "packages installed"
}

# ------------------------------------------------------------------ 3 skill copy (lean: no tests, no evals)
$srcHash = (Get-ChildItem (Join-Path $skillSrc "scripts") -Filter *.py | Sort-Object Name | ForEach-Object { (Get-FileHash $_.FullName -Algorithm SHA256).Hash }) -join ""
$dstScripts = Join-Path $skillCopy "akos-graphify-bridge\scripts"
$dstHash = if (Test-Path $dstScripts) { (Get-ChildItem $dstScripts -Filter *.py | Sort-Object Name | ForEach-Object { (Get-FileHash $_.FullName -Algorithm SHA256).Hash }) -join "" } else { "" }
if ($srcHash -eq $dstHash) { Say "OK" "skill copy up to date: $skillCopy" } else {
    $stage = "$skillCopy.new"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Path (Join-Path $stage "akos-graphify-bridge") -Force | Out-Null
    Get-ChildItem $skillSrc -Force | Where-Object { $_.Name -notin "tests", "evals", "__pycache__" } | Copy-Item -Destination (Join-Path $stage "akos-graphify-bridge") -Recurse -Force
    Get-ChildItem $stage -Recurse -Directory -Filter __pycache__ -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
    if (Test-Path $skillCopy) { Remove-Item $skillCopy -Recurse -Force }
    Rename-Item $stage $skillCopy
    Say "OK" "skill copied to $skillCopy"
}
$brain = Join-Path $skillCopy "akos-graphify-bridge\scripts\brain.py"
$akg = Join-Path $skillCopy "akos-graphify-bridge\scripts\akos_graph.py"

# ------------------------------------------------------------------ 4 launcher
New-Item -ItemType Directory -Path $binDir -Force | Out-Null
function New-Launcher([string]$name, [string]$script) {
    $c = "@echo off`r`nsetlocal`r`nset PYTHONUTF8=1`r`n`"$vpy`" `"$skillCopy\akos-graphify-bridge\scripts\$script`" %*`r`nexit /b %ERRORLEVEL%`r`n"
    Set-Content -Path (Join-Path $binDir $name) -Value $c -Encoding ASCII
}
New-Launcher "gia.cmd" "brain.py"
New-Launcher "giagraph.cmd" "akos_graph.py"
Say "OK" "launchers in $binDir :  gia <command>  (library brain: doctor, recall, capture, brief, seal ...)   giagraph <command>  (validate, merge, deliverable ...)"

# ------------------------------------------------------------------ 5 library
$newLib = -not (Test-Path (Join-Path $Library "brain.json"))
if ($newLib) {
    if ((Test-Path $Library) -and (Get-ChildItem $Library -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) { Say "FAIL" "$Library exists, is not a library and is not empty: refusing to use it"; exit 2 }
    New-Item -ItemType Directory -Path $Library -Force | Out-Null
    $r = Invoke-Native $vpy @($brain, "init", $Library); if ($r.Code -ne 0) { Say "FAIL" "init failed: $($r.Out)"; exit 1 }
    $r = Invoke-Native $vpy @($brain, "shelf-add", $Library, "inbox", "--kind", "notes", "--entity", "Group"); if ($r.Code -ne 0) { Say "FAIL" "shelf-add failed: $($r.Out)"; exit 1 }
    Say "OK" "library created with an 'inbox' notes shelf: $Library"
} else { Say "OK" "library exists (left as it is): $Library" }
$r = Invoke-Native $vpy @($brain, "lockdown", $Library)
if ($r.Code -eq 0) { Say "OK" "owner-only protection applied and verified on confidential shelves (none yet is normal)" } else { Say "FAIL" "lockdown: $($r.Out.Split("`n")[-1])" }

# ------------------------------------------------------------------ 6 health checks
$docEnv = @{}; if ($SetEnv) { $docEnv["GIA_ANCHOR_FILE"] = $AnchorFile }
$r = Invoke-Native $vpy @($brain, "doctor", $Library) $docEnv
$failLines = @($r.Out -split "`n" | Where-Object { $_ -match "^\[FAIL" }); $warnLines = @($r.Out -split "`n" | Where-Object { $_ -match "^\[WARN" })
if ($failLines.Count -eq 0) { Say "OK" "doctor: 0 failures, $($warnLines.Count) warning(s)" } else { foreach ($l in $failLines) { Say "FAIL" "doctor: $l" } }
foreach ($l in $warnLines) { if ($l -match "audit anchor") { Say "INFO" "doctor: no anchor configured yet (see step 7)" } elseif ($l -match "mcp") { Say "INFO" "doctor: optional 'mcp' package not installed (only needed for the MCP server)" } else { Say "WARN" "doctor: $l" } }
$r = Invoke-Native $vpy @($brain, "guard", $Library)
if ($r.Code -eq 0) { Say "OK" "guard: library is safe to use" } else { Say "FAIL" "guard reported problems: $($r.Out.Split("`n")[-1])" }

# smoke test in a throw-away folder (never in your library)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("gia-setup-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $kg = Join-Path $tmp "k.json"
    $obj = '{"engagement":"smoke","nodes":[{"id":"A","type":"Risk","label":"a","entity":"Group","created_date":"2026-01-01","confidence":"High","source_location":"x"},{"id":"B","type":"Control","label":"b","entity":"Group","created_date":"2026-01-01","confidence":"High","source_location":"x"}],"edges":[{"from":"A","to":"B","relationship":"mitigates","evidence":"e","confidence":"High"}]}'
    [IO.File]::WriteAllText($kg, $obj, (New-Object Text.UTF8Encoding($false)))
    $lib = Join-Path $tmp "lib"; $anc = Join-Path $tmp "outside\a.jsonl"
    $steps = @(
        @("validate a sample graph at the FINAL gate", $akg, @("validate", $kg, "--gate", "final")),
        @("create a library", $brain, @("init", $lib)),
        @("add a project shelf", $brain, @("shelf-add", $lib, "proj", "--kind", "project", "--entity", "Group")),
        @("add a confidential investigation shelf", $brain, @("shelf-add", $lib, "inv-t", "--kind", "investigation", "--entity", "MKSDL")),
        @("capture a note", $brain, @("capture", $lib, "--shelf", "proj", "--text", "setup smoke note", "--project", "SMOKE")),
        @("recall finds it", $brain, @("recall", $lib, "smoke note", "--shelf", "proj")),
        @("seal and anchor outside the library", $brain, @("seal", $lib, "--shelf", "proj", "--reason", "smoke", "--anchor-file", $anc)),
        @("anchor check", $brain, @("anchor-check", $lib, "--file", $anc)),
        @("verify the audit trail", $brain, @("verify", $lib)),
        @("owner-only protection holds (guard)", $brain, @("guard", $lib))
    )
    $bad = 0
    foreach ($s in $steps) { $r = Invoke-Native $vpy (@($s[1]) + $s[2]); if ($r.Code -ne 0) { $bad++; Say "FAIL" ("smoke: {0}: {1}" -f $s[0], ($r.Out -split "`n" | Select-Object -Last 1)) } }
    if ($bad -eq 0) { Say "OK" "smoke test: $($steps.Count) of $($steps.Count) steps passed (validate, capture, recall, seal, anchor, verify, guard)" }
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }

# ------------------------------------------------------------------ 7 environment
$anchorDir = Split-Path -Parent $AnchorFile
if ($SetEnv) {
    Set-Var "PYTHONUTF8" "1"
    try { New-Item -ItemType Directory -Path $anchorDir -Force | Out-Null; Set-Var "GIA_ANCHOR_FILE" $AnchorFile } catch { Say "WARN" "could not create $anchorDir : set GIA_ANCHOR_FILE yourself" }
    $path = [Environment]::GetEnvironmentVariable("Path", $EnvScope)
    if (-not $path -or -not ($path.Split(";") -contains $binDir)) { [Environment]::SetEnvironmentVariable("Path", ($(if ($path) { $path.TrimEnd(";") + ";" } else { "" }) + $binDir), $EnvScope); Say "OK" "gia-bin added to PATH ($EnvScope): open a new terminal to use 'gia'" } else { Say "OK" "gia-bin already on PATH" }
} else {
    Say "INFO" "not set (add -SetEnv to set them for you): PYTHONUTF8=1 ; GIA_ANCHOR_FILE=$AnchorFile ; PATH += $binDir"
}
$p3 = Get-Command python3 -ErrorAction SilentlyContinue
if ($p3 -and $p3.Source -like "*WindowsApps*") { Say "INFO" "'python3' on your PATH is the Microsoft Store stub. Turn it off: Settings > Apps > Advanced app settings > App execution aliases > python3.exe = Off. (The slash commands already fall back to 'py -3'.)" }
$bde = $null; try { $bde = (Get-BitLockerVolume -MountPoint "C:" -ErrorAction Stop).ProtectionStatus } catch { }
if ($null -eq $bde) { Say "INFO" "could not read disk-encryption status (needs admin). Check Settings > Privacy & security > Device encryption is On." } elseif ($bde -ne "On") { Say "WARN" "BitLocker is not On for C:" }

Write-Host ""
if ($script:fails -gt 0) { Say "FAIL" "SETUP FINISHED WITH $($script:fails) PROBLEM(S). Nothing was deleted. Fix the FAIL lines above and re-run (safe to repeat). Log: $logFile"; exit 1 }
Say "OK" "SETUP COMPLETE ($($script:warns) warning(s)). Try:  $binDir\gia.cmd doctor $Library"
Write-Host "Next: capture a note:  $binDir\gia.cmd capture `"$Library`" --shelf inbox --text `"first note`" --project DEMO"
Write-Host "      brief a project: $binDir\gia.cmd brief `"$Library`" --project DEMO"
exit 0
