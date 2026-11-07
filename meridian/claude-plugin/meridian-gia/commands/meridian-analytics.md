---
description: Run a deterministic analytics test on a local file and summarise the saved run (staged, read only result)
allowed-tools: mcp__plugin_meridian-gia_meridian__run_analytics, mcp__plugin_meridian-gia_meridian__list_analytics_runs, mcp__plugin_meridian-gia_meridian__get_analytics_run, mcp__plugin_meridian-gia_meridian__lint_text
---

Arguments: `$ARGUMENTS` (file path, test type, parameters, optional engagement id).

1. If the file path, test (profile, benford, duplicates, reconcile) or a required column is missing, ask. Do not guess column names.
2. Call `run_analytics`. If it fails, report the error exactly and stop.
3. Report only values in the returned run: file name, SHA-256, row count, result figures. Label them as auditor analysis [ANA], not as findings.
4. Do not rate, conclude or name anyone. Run `lint_text` on any narrative you write. A person reviews the run in the Meridian Analytics page.
