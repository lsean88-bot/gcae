"use client";

import { useMemo, useState } from "react";
import type { getActions } from "@/lib/data";
import { ACTION_STATUSES, cadenceLabel } from "@/lib/methodology";
import { daysBetween, effectiveDue, formatDate } from "@/lib/format";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { saveAction } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getActions>>;
type Row = Data["actions"][number];

export function ActionsView({ data }: { data: Data }) {
  const [status, setStatus] = useState("Open");
  const [q, setQ] = useState("");
  const rows = data.actions.filter((action) => {
    const text = `${action.agreedAction} ${action.owner} ${action.findingCode}`.toLowerCase().includes(q.toLowerCase());
    if (!text) return false;
    if (status === "Overdue") return action.overdue;
    if (status === "Open") return action.status !== "Closed";
    if (status === "All") return true;
    return action.status === status;
  });
  const counts = useMemo(() => ({
    open: data.actions.filter((action) => action.status !== "Closed").length,
    overdue: data.actions.filter((action) => action.overdue).length,
    closed: data.actions.filter((action) => action.status === "Closed").length,
  }), [data.actions]);
  return (
    <div className="page">
      <p className="kicker">Follow-up tracker</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="display">Agreed actions, still open until Audit validates them.</h1>
        <a className="btn" href="/api/export/actions">Download workbook</a>
      </div>
      <p className="lede">{counts.overdue} past the agreed date. {counts.open} not closed. {counts.closed} validated and closed. Overdue is calculated. It is not a status someone can type to hide a late action.</p>
      <div className="filters">
        <input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search actions" />
        {["Open", "Overdue", "All", ...ACTION_STATUSES].map((item) => (
          <button key={item} type="button" className={status === item ? "btn primary small" : "btn small"} onClick={() => setStatus(item)}>{item}</button>
        ))}
      </div>
      <div className="stack">
        {rows.map((action) => <ActionCard key={action.id} action={action} people={data.people} />)}
      </div>
    </div>
  );
}

function ActionCard({ action, people }: { action: Row; people: Data["people"] }) {
  const { busy, result, run } = useBusyRefresh();
  const due = effectiveDue(action.originalDue, action.revisedDue);
  const late = action.overdue ? daysBetween(due) : 0;
  return (
    <article className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="kicker">{action.findingCode} · {action.engagement}</span>
          <h2 className="h3">{action.agreedAction}</h2>
        </div>
        <div className="row">
          <Pill tone={action.band}>{action.band}</Pill>
          <Pill tone={action.status}>{action.status}</Pill>
          {action.overdue ? <Pill tone="Critical">{late} days overdue</Pill> : null}
        </div>
      </div>
      <p className="small muted">{action.findingTitle}</p>
      <p className="small">Owner {action.owner}. Due {formatDate(due)}. {action.percentComplete}% complete. Validation {action.validationStatus}. Escalation {action.escalation ? "yes" : "no"}.</p>
      <p className="small">Cadence: {cadenceLabel(action.band, action.overdue)}. Interim: {action.interimControl || "None recorded."}</p>
      <p className="small">Evidence required: {action.evidenceRequired}</p>
      {action.evidenceReceived ? <p className="small">Evidence received: {action.evidenceReceived}</p> : null}
      {action.comments ? <p className="small">{action.comments}</p> : null}
      <Notice result={result} />
      <form
        className="split"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await run(() => saveAction({
            id: action.id,
            findingId: action.findingId,
            engagementId: action.engagementId,
            agreedAction: action.agreedAction,
            ownerId: String(form.get("ownerId") || action.ownerId),
            originalDue: action.originalDue,
            revisedDue: String(form.get("revisedDue") || "") || undefined,
            status: String(form.get("status") || action.status),
            percentComplete: Number(form.get("percentComplete") || 0),
            interimControl: action.interimControl || undefined,
            evidenceRequired: action.evidenceRequired,
            evidenceReceived: String(form.get("evidenceReceived") || ""),
            validationStatus: String(form.get("validationStatus") || action.validationStatus),
            comments: String(form.get("comments") || ""),
            escalation: form.get("escalation") === "on",
            band: action.band,
          }));
        }}
      >
        <Field label="Status">
          <select className="select" name="status" defaultValue={action.status}>
            {ACTION_STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <select className="select" name="ownerId" defaultValue={action.ownerId}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </Field>
        <Field label="Percent"><input className="input" name="percentComplete" type="number" min={0} max={100} defaultValue={action.percentComplete} /></Field>
        <Field label="Revised due"><input className="input" name="revisedDue" type="date" defaultValue={action.revisedDue || ""} /></Field>
        <Field label="Validation">
          <select className="select" name="validationStatus" defaultValue={action.validationStatus}>
            {["Pending", "Received", "Validated", "Rejected"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Evidence received"><input className="input" name="evidenceReceived" defaultValue={action.evidenceReceived || ""} /></Field>
        <Field label="Comment"><input className="input" name="comments" defaultValue={action.comments || ""} /></Field>
        <label className="small"><input type="checkbox" name="escalation" defaultChecked={action.escalation} /> Escalation required</label>
        <button className="btn" disabled={busy} type="submit">Update action</button>
      </form>
    </article>
  );
}