# Plugins to uninstall (old plugins superseded by the five GIA suites)

Scope: installed plugins only. Upload folders are source copies and are excluded.
Test: every skill and command of the plugin is mapped (MERGED, REDIRECT or RETIRED). Planner mappings of 30-Oct-2026 are included; content-port to be verified by QA.

## Superseded (uninstall after the new suites are live and QA confirms the ports)

| Plugin | Replaced by |
|---|---|
| ai-cae-mktron | gia-audit (gia-audit-lifecycle, gia-engagement-planning); gia-core (project-memory, gcgo-router); gia-report-qa (gia-board-brief, gia-evidence-trace) |
| akos-enterprise-orchestrator | gia-core (project-memory; /akos-init, /akos-status) |
| cae-command-centre | gia-core (project-memory) |
| cae-cowork-audit-workbench | gia-audit (gia-fieldwork-workpapers) |
| cae-field-auditor | gia-audit (gia-fieldwork-workpapers) |
| cae-fieldwork-engine | gia-audit (gia-fieldwork-workpapers) |
| cae-rag-document-intelligence | gia-core (project-memory) |
| gcae-assurance | gia-core (safeguard-lint) |
| gia-assurance-value-chain | gia-report-qa (gia-report-qa for assurance-orchestrator; gia-evidence-trace, gia-board-brief for the rest) |
| gia-command-plugin | gia-core (gcgo-router); gia-analytics (gia-performance-analytics, gia-cost-accounting) |
| gia-file-catalog | gia-core (project-memory) |
| grc-agentic-fleet | gia-core (gcgo-router) |
| iron-rules-governance-old | gia-core (iron-rules) |
| mktron-composed-layers | gia-audit (gia-racm-icfr-testing, gia-fieldwork-workpapers); gia-core (gcgo-router); gia-fraud (gia-fraud-investigation) |
| mktron-hybrid | gia-audit (gia-racm-icfr-testing, gia-fieldwork-workpapers); gia-core (gcgo-router); gia-fraud (gia-fraud-investigation) |
| mktron-pune-vda-compliance | gia-audit (gia-pack-india) |

## Keep for now

| Plugin | Reason |
|---|---|
| gia-governance-suite | Holds skills outside the 137 in-scope set that no MIGRATION file maps (gcgo-brief, gcgo-health, gcgo-selftest, gcgo-status, gcgo, gia-analytics, gia-freshness, gia-lesson, gia-mode, gia-qa, gia-screen-evidence, gia-start, gia-verify). |
| mktron-presentation-intelligence | Holds runtime, UAT, pacing and status skills; report-qa MIGRATION DROPPED the runtime and UAT sections and names no mapping for the rest. |
| akos-graph | MIGRATION says the 12 akos-graph slash commands are not carried; they have no mapping. |
