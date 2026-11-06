"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { getFindings } from "@/lib/data";
import { IMPACT_DIMENSIONS, IMPACT_SCALE, LIKELIHOOD_SCALE, ROOT_CLASSES, ROOT_THEMES } from "@/lib/methodology";
import { emptyImpacts, scoreImpacts } from "@/lib/scoring";
import type { ImpactMap } from "@/db/schema";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { saveFinding } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getFindings>>;

export function FindingsView({ data }: { data: Data }) {
  const [band, setBand] = useState("All");
  const [q, setQ] = useState("");
  const rows = data.findings.filter((finding) => (band === "All" || finding.priorityBand === band) && `${finding.code} ${finding.title} ${finding.rootCauseClass}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <p className="kicker">Findings</p>
      <h1 className="display">The issue, the cause, the consequence.</h1>
      <p className="lede">Priority is likelihood times the highest relevant impact. The band is arithmetic. The rationale is yours. A missing fact stays in brackets.</p>
      <div className="filters">
        <input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search findings" />
        {["All", "Critical", "High", "Medium", "Low"].map((item) => (
          <button key={item} className={band === item ? "btn primary small" : "btn small"} type="button" onClick={() => setBand(item)}>{item}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Finding</th><th>Engagement</th><th>Class</th><th>Score</th><th>Status</th><th>Evidence</th></tr>
          </thead>
          <tbody>
            {rows.map((finding) => (
              <tr key={finding.id}>
                <td><Link className="grow" href={`/findings/${finding.id}`}><strong>{finding.code}</strong> {finding.title}</Link></td>
                <td>{finding.engagement}</td>
                <td>{finding.rootCauseClass}<div className="small muted">{finding.rootCauseTheme}</div></td>
                <td><Pill tone={finding.priorityBand}>{finding.priorityBand} {finding.priorityScore}</Pill></td>
                <td>{finding.status}</td>
                <td className="mono">{finding.evidenceIds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Composer data={data} />
    </div>
  );
}

function Composer({ data }: { data: Data }) {
  const { busy, result, run } = useBusyRefresh();
  const [likelihood, setLikelihood] = useState(3);
  const [impacts, setImpacts] = useState<ImpactMap>(emptyImpacts());
  const scored = useMemo(() => scoreImpacts(likelihood, impacts), [likelihood, impacts]);
  const [engagementId, setEngagementId] = useState(data.engagements[0]?.id || "");
  return (
    <form
      className="panel"
      style={{ marginTop: 18 }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await run(() => saveFinding({
          engagementId,
          controlId: String(form.get("controlId") || ""),
          title: String(form.get("title") || ""),
          criteria: String(form.get("criteria") || ""),
          condition: String(form.get("condition") || ""),
          symptom: String(form.get("symptom") || ""),
          immediateCause: String(form.get("immediateCause") || ""),
          rootCause: String(form.get("rootCause") || ""),
          fiveWhys: [1, 2, 3, 4, 5].map((n) => String(form.get(`why${n}`) || "")),
          rootCauseClass: String(form.get("rootCauseClass") || ROOT_CLASSES[0]),
          rootCauseTheme: String(form.get("rootCauseTheme") || ROOT_THEMES[0]),
          likelihood,
          likelihoodRationale: String(form.get("likelihoodRationale") || ""),
          impacts,
          residualRisk: String(form.get("residualRisk") || ""),
          businessValue: String(form.get("businessValue") || ""),
          valueLevel: scored.band,
          recommendation: String(form.get("recommendation") || ""),
          expectedOutcome: String(form.get("expectedOutcome") || ""),
          managementPosition: String(form.get("managementPosition") || "Pending"),
          quantifiedImpact: String(form.get("quantifiedImpact") || ""),
          evidenceIds: String(form.get("evidenceIds") || ""),
          isolatedOrRecurring: String(form.get("isolatedOrRecurring") || ""),
        }));
      }}
    >
      <h2 className="h3">Draft a finding</h2>
      <p className="small muted">The score updates as you mark dimensions. Server-side scoring is the one that is stored.</p>
      <Notice result={result} />
      <div className="split">
        <Field label="Engagement">
          <select className="select" value={engagementId} onChange={(event) => setEngagementId(event.target.value)}>
            {data.engagements.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
          </select>
        </Field>
        <Field label="Control">
          <select className="select" name="controlId">
            <option value="">None linked</option>
            {data.controls.map((control) => <option key={control.id} value={control.id}>{control.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Business title"><input className="input" name="title" required placeholder="What can go wrong, in plain words" /></Field>
      <Field label="Criteria — what should happen"><textarea className="textarea" name="criteria" /></Field>
      <Field label="Condition — what we found"><textarea className="textarea" name="condition" required /></Field>
      <div className="split">
        <Field label="Symptom"><input className="input" name="symptom" /></Field>
        <Field label="Immediate cause"><input className="input" name="immediateCause" /></Field>
      </div>
      <Field label="Root cause"><textarea className="textarea" name="rootCause" required placeholder="Or [ROOT CAUSE TO BE CONFIRMED WITH MANAGEMENT]" /></Field>
      {[1, 2, 3, 4, 5].map((n) => (
        <Field key={n} label={`Why ${n}`}><input className="input" name={`why${n}`} /></Field>
      ))}
      <div className="split">
        <Field label="Class">
          <select className="select" name="rootCauseClass">{ROOT_CLASSES.map((item) => <option key={item}>{item}</option>)}</select>
        </Field>
        <Field label="Theme">
          <select className="select" name="rootCauseTheme">{ROOT_THEMES.map((item) => <option key={item}>{item}</option>)}</select>
        </Field>
      </div>
      <h3 className="h3">Business impact</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <Pill tone={scored.band}>{scored.band} · {scored.score || "—"}</Pill>
        <span className="small muted">Likelihood {likelihood} × highest relevant impact {scored.highest || 0}</span>
      </div>
      <div className="matrix" style={{ marginBottom: 10 }}>
        {LIKELIHOOD_SCALE.map((item) => (
          <button key={item.score} type="button" className={likelihood === item.score ? "on" : ""} onClick={() => setLikelihood(item.score)}>
            {item.score} {item.label}
          </button>
        ))}
      </div>
      <Field label="Likelihood rationale"><input className="input" name="likelihoodRationale" required /></Field>
      {IMPACT_DIMENSIONS.map((dimension) => {
        const cell = impacts[dimension.id];
        return (
          <div key={dimension.id} className="score-grid">
            <label className="small">
              <input
                type="checkbox"
                checked={cell.relevant}
                onChange={(event) => setImpacts((current) => ({
                  ...current,
                  [dimension.id]: { ...current[dimension.id], relevant: event.target.checked, score: event.target.checked ? current[dimension.id].score || 3 : 0 },
                }))}
              />{" "}
              {dimension.label}
              <div className="muted">{dimension.consider}</div>
            </label>
            <select
              className="select"
              value={cell.score}
              onChange={(event) => setImpacts((current) => ({
                ...current,
                [dimension.id]: { ...current[dimension.id], score: Number(event.target.value), relevant: true },
              }))}
            >
              <option value={0}>—</option>
              {IMPACT_SCALE.map((item) => <option key={item.score} value={item.score}>{item.score} {item.label}</option>)}
            </select>
            <input
              className="input"
              placeholder="Why this score"
              value={cell.note}
              onChange={(event) => setImpacts((current) => ({
                ...current,
                [dimension.id]: { ...current[dimension.id], note: event.target.value },
              }))}
            />
          </div>
        );
      })}
      <Field label="Quantified impact, or say it is not quantified"><input className="input" name="quantifiedImpact" /></Field>
      <Field label="Residual risk"><textarea className="textarea" name="residualRisk" /></Field>
      <Field label="Value of addressing it"><textarea className="textarea" name="businessValue" /></Field>
      <Field label="Recommendation"><textarea className="textarea" name="recommendation" /></Field>
      <Field label="Expected outcome"><input className="input" name="expectedOutcome" /></Field>
      <div className="split">
        <Field label="Management position">
          <select className="select" name="managementPosition">
            {["Pending", "Agree", "Partially agree", "Disagree"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Isolated or recurring"><input className="input" name="isolatedOrRecurring" placeholder="Isolated in this extract" /></Field>
      </div>
      <Field label="Evidence ids, comma separated"><input className="input" name="evidenceIds" required placeholder="ev-ap-inv" /></Field>
      <button className="btn copper" disabled={busy} type="submit">Save finding</button>
    </form>
  );
}