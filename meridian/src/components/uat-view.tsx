"use client";

import { Notice, Pill, useBusyRefresh } from "@/components/ui";
import { rerunUat } from "@/server/mutations";

type Latest = {
  at: string;
  passed: number;
  failed: number;
  total: number;
  cases: { id: string; name: string; pass: boolean; evidence: string }[];
} | null;

export function UatView({ latest }: { latest: Latest }) {
  const { busy, result, run } = useBusyRefresh();
  return (
    <div className="page">
      <p className="kicker">User acceptance test</p>
      <h1 className="display">{latest ? `${latest.passed} of ${latest.total} checks passed.` : "No UAT run is stored yet."}</h1>
      <p className="lede">
        These checks run the real procedures, the scoring rule, the gates, and the harness. A pass means the result matched the expected evidence. The harness test must refuse testing when materiality is not approved, and it must not issue a report.
      </p>
      <button className="btn copper" type="button" disabled={busy} onClick={() => run(() => rerunUat())}>
        {busy ? "Running UAT" : "Run UAT again"}
      </button>
      <div style={{ marginTop: 10 }}><Notice result={result} /></div>
      {latest ? <p className="small muted">Last run {latest.at}. Failed {latest.failed}.</p> : null}
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="data">
          <thead>
            <tr><th>Check</th><th>Result</th><th>What was proved</th><th>Evidence</th></tr>
          </thead>
          <tbody>
            {latest?.cases.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.id}</td>
                <td><Pill tone={item.pass ? "Pass" : "Fail"}>{item.pass ? "Pass" : "Fail"}</Pill></td>
                <td>{item.name}</td>
                <td className="mono">{item.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}