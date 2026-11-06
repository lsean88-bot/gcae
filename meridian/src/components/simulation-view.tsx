"use client";

import Link from "next/link";
import { Notice, Pill, useBusyRefresh } from "@/components/ui";
import { rerunSimulation } from "@/server/mutations";

type Step = { id: string; phase: string; scenario: string; pass: boolean; evidence: string };
type Latest = {
  at: string;
  caseName: string;
  engagementId: string;
  passed: number;
  failed: number;
  total: number;
  exposure: number;
  candidateRepeat: number;
  steps: Step[];
} | null;

export function SimulationView({ latest }: { latest: Latest }) {
  const { busy, result, run } = useBusyRefresh();
  const phases = latest ? [...new Set(latest.steps.map((step) => step.phase))] : [];
  return (
    <div className="page">
      <p className="kicker">Complex case simulation</p>
      <h1 className="display">{latest ? `${latest.passed} of ${latest.total} scenarios passed.` : "The case has not been run yet."}</h1>
      <p className="lede">
        Northline Metals buys alloy, pays it, counts it, and keeps SAP access. The extract is incomplete. One invoice has no amount. One invoice was paid twice. One receipt is missing. A leaver account is still enabled. A journal was approved by the person who prepared it. The case walks planning, evidence, gates, six tests, re-performance, scoring, reporting, kaizen, and the harness.
      </p>
      <div className="row">
        <button className="btn copper" type="button" disabled={busy} onClick={() => run(() => rerunSimulation())}>
          {busy ? "Running the case" : "Run the case again"}
        </button>
        <Link className="btn" href="/engagements/eng-sim-q1">Open the simulated engagement</Link>
      </div>
      <div style={{ marginTop: 10 }}><Notice result={result} /></div>
      {latest ? (
        <div className="grid-4" style={{ margin: "14px 0" }}>
          <article className="panel stat"><div className="label">Passed</div><div className="value">{latest.passed}</div></article>
          <article className="panel stat"><div className="label">Failed</div><div className="value">{latest.failed}</div></article>
          <article className="panel stat"><div className="label">Invoice exposure</div><div className="value" style={{ fontSize: 28 }}>MYR {latest.exposure.toLocaleString("en-MY")}</div></article>
          <article className="panel stat"><div className="label">Repeat candidate</div><div className="value" style={{ fontSize: 28 }}>MYR {latest.candidateRepeat.toLocaleString("en-MY")}</div></article>
        </div>
      ) : null}
      {phases.map((phase) => (
        <section key={phase} style={{ marginTop: 16 }}>
          <h2 className="h3">{phase}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Step</th><th>Result</th><th>Scenario</th><th>Evidence</th></tr></thead>
              <tbody>
                {latest?.steps.filter((step) => step.phase === phase).map((step) => (
                  <tr key={step.id}>
                    <td className="mono">{step.id}</td>
                    <td><Pill tone={step.pass ? "Pass" : "Fail"}>{step.pass ? "Pass" : "Fail"}</Pill></td>
                    <td>{step.scenario}</td>
                    <td className="mono">{step.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="small muted">This is a practice case. It is not an issued opinion and it is not proof of fraud. The repeated payment is a candidate only.</p>
    </div>
  );
}