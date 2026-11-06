"use client";

import { useMemo, useState } from "react";
import type { getTesting } from "@/lib/data";
import { PROCEDURES, procedureById, resultLabel } from "@/lib/engine";
import { money } from "@/lib/format";
import { Field, Notice, Pill, outcomeTone, useBusyRefresh } from "@/components/ui";
import { decideTest, reperformTest, runTest } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getTesting>>;

export function TestingView({ data, initialEngagement }: { data: Data; initialEngagement?: string }) {
  const { busy, result, run } = useBusyRefresh();
  const [engagementId, setEngagementId] = useState(initialEngagement || data.selected?.engagementId || data.engagements[0]?.id || "");
  const [procedureId, setProcedureId] = useState(data.selected?.procedure || "dual_approval");
  const procedure = procedureById(procedureId) || PROCEDURES[0];
  const evidence = data.evidence.filter((item) => item.engagementId === engagementId);
  const [evidenceId, setEvidenceId] = useState(data.selected?.evidenceId || evidence[0]?.id || "");
  const engagement = data.engagements.find((item) => item.id === engagementId);
  const defaults = { ...Object.fromEntries(procedure.thresholds.map((item) => [item.key, item.defaultValue])), ...(engagement?.thresholdJson || {}) };
  const [thresholds, setThresholds] = useState<Record<string, number>>(defaults);
  const selected = data.selected;
  const visibleEvidence = useMemo(() => data.evidence.filter((item) => item.engagementId === engagementId), [data.evidence, engagementId]);

  return (
    <div className="page">
      <p className="kicker">Testing bench</p>
      <h1 className="display">Run the procedure. Then stop.</h1>
      <p className="lede">
        The executor applies an approved criterion to a registered extract. It writes a tickmark for every row. It does not invent a threshold, drop a row, or call an indicator fraud. QA recalculates before anyone relies on the result.
      </p>
      <Notice result={result} />
      <div className="workpaper">
        <form
          className="panel"
          onSubmit={async (event) => {
            event.preventDefault();
            await run(() => runTest({
              engagementId,
              procedure: procedureId,
              evidenceId,
              thresholds,
            }));
          }}
        >
          <h2 className="h3">New run</h2>
          <Field label="Engagement">
            <select className="select" value={engagementId} onChange={(event) => {
              setEngagementId(event.target.value);
              const next = data.evidence.find((item) => item.engagementId === event.target.value);
              setEvidenceId(next?.id || "");
            }}>
              {data.engagements.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
            </select>
          </Field>
          <Field label="Procedure">
            <select className="select" value={procedureId} onChange={(event) => {
              setProcedureId(event.target.value);
              const next = procedureById(event.target.value);
              if (!next) return;
              const base = data.engagements.find((item) => item.id === engagementId)?.thresholdJson || {};
              setThresholds({ ...Object.fromEntries(next.thresholds.map((item) => [item.key, item.defaultValue])), ...base });
            }}>
              {PROCEDURES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <p className="small">{procedure.criterion}</p>
          <Field label="Registered evidence">
            <select className="select" value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}>
              {visibleEvidence.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.originalFilename} · {item.reliability}</option>)}
            </select>
          </Field>
          {procedure.thresholds.map((item) => (
            <Field key={item.key} label={item.label}>
              <input
                className="input"
                type="number"
                value={thresholds[item.key] ?? item.defaultValue}
                onChange={(event) => setThresholds((current) => ({ ...current, [item.key]: Number(event.target.value) }))}
              />
              <span className="small muted" style={{ textTransform: "none", letterSpacing: 0 }}>{item.help}</span>
            </Field>
          ))}
          <p className="small muted">
            {engagement?.materialityApproved
              ? "Materiality is approved. A change from the stored matrix is refused unless you are the GCAE."
              : "Materiality is not approved. The run will be refused."}
          </p>
          <button className="btn copper" disabled={busy || !evidenceId} type="submit">{busy ? "Running" : "Run procedure"}</button>
        </form>
        <aside className="panel">
          <h2 className="h3">Library</h2>
          {PROCEDURES.map((item) => (
            <p key={item.id} className="small"><strong>{item.name}.</strong> {item.objective}</p>
          ))}
          <p className="small muted">Required columns are checked. A missing column is Unable to conclude, not a quiet skip.</p>
        </aside>
      </div>
      <section style={{ marginTop: 18 }}>
        <h2 className="h3">Workpapers on file</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Procedure</th><th>Result</th><th>Tested</th><th>Exceptions</th><th>QA</th><th>Approval</th><th></th></tr>
            </thead>
            <tbody>
              {data.runs.map((item) => (
                <tr key={item.id}>
                  <td>{item.executedAt}</td>
                  <td>{item.procedure.replaceAll("_", " ")}</td>
                  <td><Pill tone={outcomeTone(item.result)}>{resultLabel(item.result)}</Pill></td>
                  <td>{item.recordsTested}/{item.populationCount}</td>
                  <td>{item.exceptionsCount}</td>
                  <td><Pill tone={item.qaStatus}>{item.qaStatus}</Pill></td>
                  <td>{item.approvalStatus}</td>
                  <td><a href={`/testing?run=${item.id}`}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <p className="kicker">{selected.id} · {selected.scriptVersion}</p>
              <h2 className="h3">{selected.workpaper.procedureName}</h2>
            </div>
            <div className="row">
              <Pill tone={outcomeTone(selected.result)}>{resultLabel(selected.result)}</Pill>
              <Pill tone={selected.qaStatus}>QA {selected.qaStatus}</Pill>
            </div>
          </div>
          <p>{selected.workpaper.narrative}</p>
          <p className="small"><strong>Criterion. </strong>{selected.workpaper.criterion}</p>
          <p className="small"><strong>Population. </strong>{selected.populationDefinition}</p>
          <p className="small"><strong>Exposure. </strong>{money(selected.exposureAmount, selected.currency || "MYR")} · parameter hash {selected.parameterHash}</p>
          <p className="small"><strong>Limitations. </strong>{selected.limitations}</p>
          <p className="small">{selected.workpaper.fraudNote}</p>
          {selected.qaNotes ? <div className="note ok">{selected.qaNotes}</div> : null}
          <form
            className="row"
            style={{ margin: "10px 0" }}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const note = String(form.get("note") || "");
              const decision = (String(form.get("decision") || "approved") === "rejected" ? "rejected" : "approved") as "approved" | "rejected";
              await run(() => decideTest(selected.id, decision, note));
            }}
          >
            <input className="input" name="note" placeholder="Why you approve or reject this result" />
            <button className="btn" type="button" disabled={busy} onClick={() => run(() => reperformTest(selected.id))}>Re-perform</button>
            <button className="btn copper" name="decision" value="approved" disabled={busy} type="submit">Approve result</button>
            <button className="btn danger" name="decision" value="rejected" disabled={busy} type="submit">Reject</button>
          </form>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Record</th><th>Tick</th><th>Reason</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {selected.workpaper.rowResults.map((row) => (
                  <tr key={row.key}>
                    <td className="mono">{row.key}</td>
                    <td className={`tick ${row.outcome.startsWith("Fail") ? "Fail" : row.outcome.startsWith("Unable") ? "Unable" : row.outcome.startsWith("Not") ? "na" : "Pass"}`}>{row.outcome}</td>
                    <td>{row.reason}</td>
                    <td>{row.amount == null ? "—" : row.amount.toLocaleString("en-MY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}