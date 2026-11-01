# Remaining actions: what only you can do, exactly how, and how we will know it worked

**Status 31 Oct 2026:** Linux verification DONE (`LINUX-VERIFICATION-REPORT.md`); `setup_windows.ps1 -SetEnv` DONE on your profile; CLD-14 dry run DONE on synthetic data (`PILOT-DRY-RUN-REPORT.md`); device encryption: you accepted the risk (keep investigation shelves off this laptop until it is encrypted). Still open: item 2 (replace the plugin), item 3 (the real pilot), item 5 (decisions).

Everything that could be done without admin rights, your documents, or your account UI has been done (see `GAP-CLOSURE-REGISTER.md`).
These five items are left. They are ordered by value. Each says why I did not do it myself.

## 1. Run the Linux suite on this machine (about 15 minutes, once)
**Closes:** the 12 skipped skill tests, the 51 patch-tool tests, UAT scenario S9. **Why not me:** installing WSL changes Windows features and needs an administrator prompt.

1. Open **PowerShell as administrator** and run: `wsl --install -d Ubuntu`  (Windows 11 Home supports WSL2; restart if asked; create a Linux user when Ubuntu first opens).
2. In Ubuntu: `sudo apt update && sudo apt install -y python3 python3-venv python3-pip git`
3. Copy the production package in: `cp "/mnt/d/IA sean/2026 audit plan/claude skill/New folder/Graphify/2.0.7/MKTron-GIA-Production-Package-2.0.5.zip" ~ && unzip -q MKTron-GIA-Production-Package-2.0.5.zip && cd MKTron-GIA-Production-Package`
4. `python3 -m venv .v && . .v/bin/activate && pip install -q openpyxl pyyaml pytest graphifyy` then `python tools/release_gate.py`
5. Done when it prints **RELEASE GATE PASSED** with `skill: ... 0 skipped for symlink/POSIX reasons` and `patch: ... passed` (not skipped). Send me the last 10 lines.
   If a Linux-only test fails, that is a real finding: send me the failing test names.
Alternative that needs no admin: turn on **Settings > System > For developers > Developer Mode**. This closes only the 4 symlink skips.

## 2. Replace the account plugin (about 5 minutes)
**Why not me:** it is an account UI step, and installing a second copy locally would duplicate the skill (the installer refuses it).
1. Claude desktop app: remove the existing `akos-graph` (it is 2.0.0; `post_install_check.py` shows 7 of its 12 smoke steps fail on the new features).
2. Upload `akos-graph-plugin-2.0.5.zip`. Start a new session.
3. Run `python tools/post_install_check.py --expect 2.0.7` from the unzipped package.
4. Done when it prints **POST-INSTALL CHECK PASSED** and shows exactly one installed copy.
Do this after item 1 passes if you want the strongest evidence first; it is safe to do before, for non-confidential libraries.

## 3. Run the CLD-14 pilot (about 2 weeks elapsed, 3 hours of your time)
**Why not me:** it needs your real workpapers, and nothing else can show extraction quality.
Follow `PILOT-CLD-14.md`. Use `python tools/pilot_sampler.py sample <lib> --shelf clld14 --n 40 --out p1.csv`, check each row against its source, then
`python tools/pilot_sampler.py score p1.csv`. For recall: write 20 real questions in a CSV (`question,expected_id,expected_trust`) and run `... recall <lib> --questions q.csv --shelf clld14`.
Done when P1-P8 are filled in. Stop conditions: any wrong CONFIRMED label (P5) or a High/100% node a document does not support (P3).

## 4. Confirm the disk is protected if the laptop is lost (2 minutes)
**Why not me:** it needs an administrator query and is a security setting.
Settings > Privacy & security > **Device encryption** (or BitLocker) should be On. If it is Off, "owner-only" stops other Windows accounts, but anyone with the disk can read it.

## 5. Decide (30 minutes): `DECISION-SHEET.md`
One page, my default for every open decision, D2-D19. Only you can decide. Reply with the numbers you accept; I will apply the file edits.
