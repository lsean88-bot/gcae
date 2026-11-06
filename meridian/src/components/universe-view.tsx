"use client";

import { useState } from "react";
import type { getUniverse } from "@/lib/data";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { createEngagement } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getUniverse>>;

export function UniverseView({ data }: { data: Data }) {
  const { busy, result, run } = useBusyRefresh();
  const [open, setOpen] = useState(false);
  const auditors = data.people.filter((person) => ["gcae", "manager", "auditor", "qa"].includes(person.authority));
  return (
    <div className="page">
      <p className="kicker">Audit universe</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="display">Where the plan is thin.</h1>
        <button className="btn primary" type="button" onClick={() => setOpen((value) => !value)}>Open an engagement</button>
      </div>
      <p className="lede">Each entity carries a residual score and a coverage flag. A suggested score from the planning rule is marked pending until a person accepts it. Mexico is waiting.</p>
      <Notice result={result} />
      {open ? (
        <form
          className="panel"
          style={{ marginBottom: 16 }}
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await run(() => createEngagement({
              title: String(form.get("title") || ""),
              entityId: String(form.get("entityId") || ""),
              period: String(form.get("period") || ""),
              objective: String(form.get("objective") || ""),
              scope: String(form.get("scope") || ""),
              leadId: String(form.get("leadId") || ""),
              audience: String(form.get("audience") || ""),
              businessContext: String(form.get("businessContext") || ""),
            }));
          }}
        >
          <h2 className="h3">New engagement</h2>
          <div className="split">
            <Field label="Title"><input className="input" name="title" required placeholder="Payroll bank-account changes" /></Field>
            <Field label="Entity">
              <select className="select" name="entityId" required>
                {data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
              </select>
            </Field>
            <Field label="Period"><input className="input" name="period" placeholder="Q3 2026" required /></Field>
            <Field label="Lead">
              <select className="select" name="leadId">{auditors.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
            </Field>
          </div>
          <Field label="Objective"><textarea className="textarea" name="objective" required /></Field>
          <Field label="Scope"><textarea className="textarea" name="scope" required /></Field>
          <Field label="Why it matters"><textarea className="textarea" name="businessContext" /></Field>
          <Field label="Audience"><input className="input" name="audience" defaultValue="Audit committee" /></Field>
          <button className="btn copper" disabled={busy} type="submit">Open at stage 1</button>
        </form>
      ) : null}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Entity</th><th>Process</th><th>Inherent</th><th>Residual</th><th>Coverage</th><th>Suggestion</th><th>Owner</th><th>Open findings</th>
            </tr>
          </thead>
          <tbody>
            {data.entities.map((entity) => (
              <tr key={entity.id}>
                <td>
                  <strong>{entity.name}</strong>
                  <div className="small muted">{entity.code} · {entity.jurisdiction}</div>
                </td>
                <td>{entity.process}<div className="small muted">{entity.strategicObjective}</div></td>
                <td>{entity.inherentRisk}</td>
                <td><span className={`pill h${entity.residualRisk}`}>{entity.residualRisk}</span></td>
                <td><Pill tone={entity.coverage}>{entity.coverage}</Pill></td>
                <td>
                  <div>{entity.suggestedScore ?? "—"} · {entity.scoreStatus}</div>
                  <div className="small muted">{entity.suggestedRationale}</div>
                </td>
                <td>{entity.owner}</td>
                <td>{entity.openFindings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}