# Linux verification report: WSL2 Ubuntu (packages 2.0.5 and 2.0.6)

Evidence grade: Rank 1: tool output captured 31 Oct 2026 on your Acer Swift Go 14, inside WSL2. Ubuntu 26.04.1 LTS, kernel 6.18.54.1-microsoft-standard-WSL2,
**Python 3.14.4, graphify 0.9.99, pytest 9.2.0** (all newer than anything tested on Windows: Python 3.11, graphify 0.8.51 / 0.9.38 / 0.9.97). Run as the normal user
`sean` (not root) from the delivered zip, extracted in the Linux home folder. No Windows file was touched; none of your real skills were copied into Linux.

| Check | Windows | Linux |
|---|---|---|
| Release gate (full mode) | PASSED | **PASSED**, 2.0.5 and again on **2.0.6** (golden master 0 regressions) |
| Skill tests | 364 / 366 passed, 12 skipped | **376 (2.0.5) / 378 (2.0.6) passed, 0 skipped** |
| Plugin tests | 74 passed | **74 passed** |
| Ecosystem-patch tests | 51 skipped (not applicable on NTFS) | **48 passed, 3 skipped** |
| UAT S1 / S2 / S3+S5 / S4 / S7 / S8 (2.0.5) | all passed | **26/26, 14/14, 21/21, 7/7, 7/7, 6/6** |
| UAT S9 (13 SIGKILL points through the patch tool; byte-identical rollback) | not run | **28/28**, all 13 kills landed mid-apply |

Closed by this: the 12 Windows skips (symlinks, POSIX modes, time zones), the patch tool's crash safety and rollback, and the untested newer Python / graphify combination.

Not closed: **S9 ran against a synthetic catalog with the real layout, not your real skills** (deliberately not copied). The 3 skipped patch tests need a real maintainer catalog or its exact layout.
UAT S1-S9 were run on 2.0.5; the 2.0.6 change (opt-in `contradictions` flags) is covered by the gate. One machine, one OS pair: not macOS, not another Windows build.
Extraction quality on your real documents is still untested (see `PILOT-DRY-RUN-REPORT.md` for the synthetic dry run).

Housekeeping: WSL keeps a small VM and about 1 GB of disk. `wsl --shutdown` frees the memory; `wsl --unregister Ubuntu` removes everything it created (not Windows files). You do not need WSL to use the package.
