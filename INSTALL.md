# Install guide: MKTron GIA skill and plugin 2.0.2

**What you are installing:** `akos-graphify-bridge`, a skill that turns audit knowledge and day-to-day project notes into a searchable,
tamper-evident library ("second brain") with trust labels, confidential shelves, a persisted recall index, and 18 slash commands.

**Before you install anything, check what you already have.** If your Claude account already has the `akos-graph` plugin (any version),
installing a second copy gives two routers for the same prompts. `install.py` refuses that unless you pass `--allow-duplicate`.
The right move is to **replace** the old one (Route 1 or 3 below), not add to it.

## Do I need Linux? No: Windows is enough
Everything installs and runs on Windows (tested on Windows 11, Python 3.11, graphify 0.8.51 / 0.9.38 / 0.9.97). Linux is needed only to *verify* more:
12 tests (symlinks, POSIX modes) and the ecosystem-patch tool (it targets the Linux skills catalog) cannot run on Windows; they are skipped, not failed.
Where the skill runs depends on the Claude mode: Claude Code on your PC runs it locally on Windows (NTFS owner-only protection applies); the cloud/Cowork
sandboxes run it on Linux (POSIX modes apply, and files there do not persist, so keep your library on your own disk). One Windows catch: `python3` is often a
Microsoft Store stub that does nothing. The slash commands therefore carry a fallback (`py -3` or `python`), and the installer warns you if it finds the stub.

## One-command Windows setup (recommended first step)
Open PowerShell in the unzipped folder and run:
```
powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1 -SetEnv
```
It needs no administrator rights and touches only your user profile. It finds Python 3.11 (it will not use the Microsoft Store stub), creates one virtual
environment with graphify pinned to a tested version, copies the skill to a stable folder, creates the `gia` and `giagraph` launchers, creates your library
(`%USERPROFILE%\GIA-Library`, with an `inbox` notes shelf), locks it down, and runs `doctor` plus a 10-step smoke test. Every step prints OK / WARN / FAIL, it
is safe to run again, and `-CheckOnly` changes nothing. `-Remove` undoes it (never your library). `-SetEnv` also sets `PYTHONUTF8=1`, `GIA_ANCHOR_FILE`
(default `D:\GIA-Anchors\gia-anchors.jsonl`, outside the library) and adds the launchers to your PATH (user level). Afterwards, in a new terminal:
`gia doctor %USERPROFILE%\GIA-Library`, `gia capture <library> --shelf inbox --text "..." --project X`, `gia brief <library> --project X`.
It does not install the Claude plugin (that is the desktop-app upload below) and cannot switch off the Windows `python3.exe` Store alias; it tells you how.

## Choose your route

| You use | Route | One line |
|---|---|---|
| **Claude desktop app / claude.ai** with the plugin already installed | **3 (replace)** | remove the old `akos-graph` in the app, then upload `plugin/akos-graph-plugin-2.0.5.zip` |
| **claude.ai** skill upload (no plugin) | **1** | upload `claude-ai-upload/akos-graphify-bridge.zip` |
| **Claude Code** (terminal or IDE) | **2** | `python install.py --apply --with-commands` |

## Route 2: Claude Code (installer)
```
python install.py                              # DRY RUN: shows what it would do, changes nothing (also warns about duplicates)
python install.py --apply --with-commands      # installs the skill and the 18 slash commands
python install.py --apply --project .          # or only for the project in the current folder
python install.py --uninstall                  # removes it and restores anything it replaced
python install.py --verify-bundle              # checks every file in this bundle against MANIFEST.sha256
```
* Skill goes to `~/.claude/skills/akos-graphify-bridge`, commands to `~/.claude/commands/`. Anything replaced is backed up first.
* After installing it runs self-checks (validate a sample graph, create a library, verify the audit trail, `doctor`). Open a new session afterwards.
* On Windows use `python` (or `py`). The 18 commands call `python3`; if that name is not on your PATH, create an alias or edit the command files.

## Route 1: claude.ai upload
Settings > Capabilities > make sure *Code execution and file creation* is on > Skills > Upload skill > `claude-ai-upload/akos-graphify-bridge.zip`. Switch it on.
graphify may not exist in that sandbox: `validate`, `recall`, `seal`, `verify`, `capture`, `brief`, `contradictions`, `anchor-*`, `custody-*`,
`guard`, `dashboard`, `doctor` work without it; `to-graphify`, `index`, `remember`, `reflect` say so in one line (exit 2).
(The recall index is built by `index`, so without graphify recall scans: same answers, slower on very large shelves.)

## Route 3: plugin (replace the old version)
1. In the Claude desktop app remove the existing `akos-graph` plugin.
2. Upload `plugin/akos-graph-plugin-2.0.5.zip` (it contains `.claude-plugin/plugin.json`, 18 `commands/` and `skills/`).
3. Open a new session and try `/akos-brain-doctor`.
I could not drive the app's upload from a script, so this step is yours; it is the one part not tested here.

## Requirements
Python 3.10+ and `pip install openpyxl`. graphify (`pip install -e <checkout>` or `uv tool install graphifyy`) is needed only for `to-graphify`, `index`, `remember`, `reflect`.
Tested with graphify 0.9.38. Optional: `pip install mcp` to expose the library to Claude as an MCP server (`brain.py mcp-config`).

## First ten minutes (second brain)
```
S=~/.claude/skills/akos-graphify-bridge/scripts          # adjust if you used --project or --dest
python $S/brain.py doctor ./my-library                   # "owner-only protection" must be OK
python $S/brain.py init ./my-library
python $S/brain.py shelf-add ./my-library inbox --kind notes --entity Group
python $S/brain.py capture ./my-library --shelf inbox --text "Ask Ravi for the CLD-14 sample list" --project CLD-14
python $S/brain.py brief ./my-library --project CLD-14
export GIA_ANCHOR_FILE=/another/drive/gia-anchors.jsonl   # Windows: set GIA_ANCHOR_FILE=D:\anchors\gia-anchors.jsonl
python $S/brain.py seal ./my-library --shelf inbox --reason "Reviewed on <date>"   # also records the audit head off-library
python $S/brain.py anchor-check ./my-library --file "$GIA_ANCHOR_FILE"
```
Read `docs/SECOND-BRAIN-GUIDE.md` next, then `docs/UAT-report-v5.md` section 5 (what is not guaranteed) before relying on it.

## Windows notes
* Confidential shelves are made owner-only with an NTFS ACL. Run `brain.py lockdown <lib>` after copying a library to a new place, and `guard` before sharing.
* Keep the library on a local NTFS disk under your user profile. Network shares and FAT/exFAT drives may not support ACLs (`doctor` will say FAIL).
* The ecosystem patch (`03-ecosystem-patch`) is for the Linux/Cowork skills catalog and does not apply on Windows.
