"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { getPlanPage } from "@/lib/strategic-data";
import { DEFAULT_WEIGHTS, ITEM_STATUSES, QUARTERS } from "@/lib/plan-scoring";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { addPlanItem, approvePlan, createPlan, recordAcNoted, removePlanItem, updateItemProgress, updatePlanItem, updatePlanSettings } from "@/server/strategic";

type Data = Awaited<ReturnType<typeof getPlanPage>>;

export function PlanView({ data }: { data: Data }) {
  const router = useRouter();
  const { busy, result, run } = useBusyRefresh();
  const [editing, setEditing] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  if (data.denied) return <div className="page"><h1 className="display">Audit plan</h1><div className="note bad">Your role cannot open the audit plan.</div></div>;
  const { plan, items, ranking, capacity, progress, actor } = data;
  const isGcae = actor.authority === "gcae";
  const superseded = plan?.status === "Superseded";
  const canDraft = (isGcae || actor.authority === "manager") && !superseded;
  const approved = plan ? plan.status !== "Draft" : false;
  const go = (id?: string) => id && router.push(`/plan?plan=${id}`);

  return (
    <div className="page">
      <p className="kicker">Risk-based annual audit plan</p>
      <h1 className="display">Plan the year from the risks</h1>
      <p className="lede">The app ranks auditable entities from the risk register, years since the last audit, and the mandatory flag. People choose what goes in the plan and the GCAE approves it. Approving here is the GCAE&apos;s approval. It is not Audit Committee approval.</p>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Plan version"><select value={plan?.id || ""} onChange={(e) => go(e.target.value)}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.year} v{p.version} · {p.status}</option>)}{data.plans.length === 0 ? <option value="">No plan yet</option> : null}</select></Field>
          {plan ? <a className="btn small" href={`/api/export/plan?plan=${plan.id}`}>Download Excel</a> : null}
        </div>
        {canDraft ? (
          <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 10 }} onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const r = await run(() => createPlan(Number(f.get("year")), Number(f.get("cap"))));
            if (r.ok) go(r.id);
          }}>
            <Field label="New plan year"><input name="year" type="number" required defaultValue={Number(data.today.slice(0, 4)) + 1} /></Field>
            <Field label="Capacity (audit days, your figure)"><input name="cap" type="number" min={1} required /></Field>
            <button className="btn" disabled={busy}>Draft a plan</button>
          </form>
        ) : null}
        <Notice result={result} />
      </div>

      {plan ? (
        <>
          <div className="panel" style={{ marginBottom: 14 }}>
            <h2>{plan.year} · version {plan.version} · <Pill tone={superseded ? "Medium" : approved ? "Low" : "High"}>{plan.status}</Pill></h2>
            <p className="small">{plan.approvedAt ? `Approved by the GCAE on ${plan.approvedAt}. ` : "Not approved. "}{plan.acMeetingDate ? `Audit Committee noted on ${plan.acMeetingDate}, minute ${plan.acMinuteRef} (typed by the GCAE, not verified by the app). ` : "No Audit Committee noting recorded. "}{plan.supersedesId ? "This version supersedes an earlier one, which is unchanged." : ""}</p>
            {capacity ? <div className={capacity.over ? "note bad" : "note ok"} role="status">{capacity.over ? `Over-allocated: ${capacity.allocated} days planned against ${capacity.capacity} available (${capacity.delta} over).` : `${capacity.allocated} of ${capacity.capacity} days allocated.`} Deferred and cancelled items are not counted.</div> : null}
            <p className="small"><strong>Scoring weights</strong>: risk {plan.weights.risk}, years since last audit {plan.weights.age}, mandatory {plan.weights.mandatory}. {plan.weights.approved ? "Approved by the GCAE with this plan." : "Proposed, awaiting GCAE approval. Approving the plan approves these weights."}</p>
            {superseded ? <p className="small muted">Superseded by a later approved version. Read only.</p> : null}
            {approved && !superseded ? <p className="small muted">This plan is approved. Any edit to items, capacity or weights creates a new Draft version. Progress updates are logged in place.</p> : null}
            {canDraft ? (
              <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }} onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const r = await run(() => updatePlanSettings(plan.id, Number(f.get("cap")), isGcae ? { risk: Number(f.get("wr")), age: Number(f.get("wa")), mandatory: Number(f.get("wm")) } : null));
                if (r.ok) go(r.id);
              }}>
                <Field label="Capacity days"><input name="cap" type="number" min={1} defaultValue={plan.capacityDays} required /></Field>
                {isGcae ? (<>
                  <Field label="Weight: risk"><input name="wr" type="number" min={0} max={100} defaultValue={plan.weights.risk} /></Field>
                  <Field label="Weight: years since audit"><input name="wa" type="number" min={0} max={100} defaultValue={plan.weights.age} /></Field>
                  <Field label="Weight: mandatory"><input name="wm" type="number" min={0} max={100} defaultValue={plan.weights.mandatory} /></Field>
                </>) : <span className="small muted">Only the GCAE can change weights. Proposed defaults: risk {DEFAULT_WEIGHTS.risk}, age {DEFAULT_WEIGHTS.age}, mandatory {DEFAULT_WEIGHTS.mandatory}.</span>}
                <button className="btn small" disabled={busy}>Save settings</button>
              </form>
            ) : null}
            {isGcae && !approved ? (
              <div style={{ marginTop: 10 }}>
                {capacity?.over ? <label className="small"><input type="checkbox" checked={over} onChange={(e) => setOver(e.target.checked)} /> I accept this plan is over capacity</label> : null}{" "}
                <button className="btn copper" disabled={busy} onClick={() => run(() => approvePlan(plan.id, over))}>Approve plan (GCAE)</button>
              </div>
            ) : null}
            {isGcae && plan.status === "Approved by GCAE" ? (
              <form style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 10 }} onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run(() => recordAcNoted(plan.id, String(f.get("date")), String(f.get("minute"))));
              }}>
                <Field label="Audit Committee meeting date"><input name="date" type="date" required /></Field>
                <Field label="Minute reference"><input name="minute" required /></Field>
                <button className="btn small" disabled={busy}>Record: noted by Audit Committee</button>
              </form>
            ) : null}
          </div>

          <h2>Plan items</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Entity</th><th>Audit</th><th>Qtr</th><th>Days</th><th>Risk score</th><th>Last audit</th><th>Mandatory</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.entity}</td>
                    <td><strong>{i.title}</strong><div className="small muted">{i.rationale}</div>{i.changeReason ? <div className="small">Change reason: {i.changeReason}</div> : null}{i.engagementCode ? <div className="small">Engagement {i.engagementCode}</div> : null}</td>
                    <td>{i.quarter}</td><td>{i.budgetDays}</td><td>{i.riskScore ?? "No linked risk"}</td><td>{i.lastAuditDate ?? "None on file"}</td>
                    <td>{i.mandatory ? `Yes: ${i.mandatoryReason}` : "No"}</td>
                    <td>{i.status}</td>
                    <td>
                      {canDraft && !i.masked ? (<>
                        <button className="btn small" onClick={() => setEditing(editing === i.id ? null : i.id)}>{editing === i.id ? "Close" : "Edit"}</button>{" "}
                        <button className="btn small" disabled={busy} onClick={async () => { const r = await run(() => removePlanItem(plan.id, i.id)); if (r.ok && r.id !== plan.id) go(r.id); }}>Remove</button>
                      </>) : null}
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? <tr><td colSpan={9} className="muted">No items yet.</td></tr> : null}
              </tbody>
            </table>
          </div>

          {editing ? (() => {
            const i = items.find((x) => x.id === editing)!;
            return (
              <form key={i.id} className="panel" style={{ marginTop: 10 }} onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const r = await run(() => updatePlanItem(plan.id, i.id, { title: String(f.get("title")), quarter: String(f.get("quarter")), budgetDays: Number(f.get("days")), rationale: String(f.get("why")), mandatory: f.get("mandatory") === "on", mandatoryReason: String(f.get("reason") || "") }));
                if (r.ok) { setEditing(null); if (r.id !== plan.id) go(r.id); }
              }}>
                <h3>Edit item{approved ? " (creates a new version)" : ""}</h3>
                <Field label="Title"><input name="title" defaultValue={i.title} required /></Field>
                <Field label="Quarter"><select name="quarter" defaultValue={i.quarter}>{QUARTERS.map((q) => <option key={q}>{q}</option>)}</select></Field>
                <Field label="Budget days"><input name="days" type="number" min={1} defaultValue={i.budgetDays} required /></Field>
                <Field label="Rationale"><textarea name="why" rows={2} defaultValue={i.rationale} required /></Field>
                <label className="small"><input type="checkbox" name="mandatory" defaultChecked={i.mandatory} /> Mandatory</label>
                <Field label="Mandatory reason"><input name="reason" defaultValue={i.mandatoryReason ?? ""} /></Field>
                <button className="btn copper" disabled={busy}>Save edit</button>
              </form>
            );
          })() : null}

          {canDraft ? (
            <form className="panel" style={{ marginTop: 14 }} onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const r = await run(() => addPlanItem(plan.id, { entityId: String(f.get("entity")), title: String(f.get("title")), quarter: String(f.get("quarter")), budgetDays: Number(f.get("days")), rationale: String(f.get("why")), mandatory: f.get("mandatory") === "on", mandatoryReason: String(f.get("reason") || "") }));
              if (r.ok) { form.reset(); if (r.id !== plan.id) go(r.id); }
            }}>
              <h3>Add an item{approved ? " (creates a new version)" : ""}</h3>
              <Field label="Entity"><select name="entity" required>{data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
              <Field label="Audit title"><input name="title" required /></Field>
              <Field label="Quarter"><select name="quarter">{QUARTERS.map((q) => <option key={q}>{q}</option>)}</select></Field>
              <Field label="Budget days"><input name="days" type="number" min={1} required /></Field>
              <Field label="Rationale"><textarea name="why" rows={2} required /></Field>
              <label className="small"><input type="checkbox" name="mandatory" /> Mandatory</label>
              <Field label="Mandatory reason (law, regulator, Board instruction)"><input name="reason" /></Field>
              <p className="small muted">Risk score and last audit date are filled in by the app from the register and issued reports.</p>
              <button className="btn copper" disabled={busy}>Add item</button>
            </form>
          ) : null}

          <h2 style={{ marginTop: 20 }}>Suggested ranking of auditable entities</h2>
          <p className="small muted">A suggestion for the GCAE. It is not a decision. Risk = highest linked risk score (residual if assessed, else inherent) as % of 25. Age = years since last audit, capped at 5, never audited = 100. Mandatory = 100 or 0.</p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>#</th><th>Entity</th><th>Score</th><th>Risk (basis)</th><th>Years since audit</th><th>Mandatory</th></tr></thead>
              <tbody>{ranking.map((r, n) => <tr key={r.entityId}><td>{n + 1}</td><td>{r.name}</td><td><strong>{r.score}</strong></td><td>{r.riskScore ?? "No linked risk"} {r.riskBasis !== "none" ? `(${r.riskBasis}, ${r.riskBand})` : ""}</td><td>{r.yearsSince ?? "Never / none on file"}</td><td>{r.mandatory ? "Yes" : "No"}</td></tr>)}</tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 20 }}>Progress by quarter</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Quarter</th><th>Planned items</th>{ITEM_STATUSES.map((s) => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>{QUARTERS.map((q) => <tr key={q}><td>{q}</td><td>{progress[q].total}</td>{ITEM_STATUSES.map((s) => <td key={s}>{progress[q][s]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {items.some((i) => i.status === "Deferred" || i.status === "Cancelled") ? (
            <ul className="small">{items.filter((i) => i.status === "Deferred" || i.status === "Cancelled").map((i) => <li key={i.id}>{i.status}: {i.title} ({i.quarter}). Reason: {i.changeReason || "none recorded"}</li>)}</ul>
          ) : null}

          {canDraft && approved ? (
            <div className="panel" style={{ marginTop: 14 }}>
              <h3>Update progress</h3>
              {items.filter((i) => !i.masked).map((i) => (
                <form key={i.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 6 }} onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await run(() => updateItemProgress(i.id, String(f.get("status")), String(f.get("why") || ""), String(f.get("eng") || "") || null));
                }}>
                  <span className="small" style={{ minWidth: 200 }}>{i.title}</span>
                  <select name="status" defaultValue={i.status} aria-label={`Status of ${i.title}`}>{ITEM_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                  <select name="eng" defaultValue={i.engagementId ?? ""} aria-label={`Engagement for ${i.title}`}><option value="">No engagement linked</option>{data.engagements.map((en) => <option key={en.id} value={en.id}>{en.code}</option>)}</select>
                  <input name="why" placeholder="Change reason (required to defer or cancel)" defaultValue={i.changeReason ?? ""} />
                  <button className="btn small" disabled={busy}>Save</button>
                </form>
              ))}
            </div>
          ) : null}
        </>
      ) : <p className="muted">No plan exists yet. {canDraft ? "Draft one above." : ""}</p>}
    </div>
  );
}
