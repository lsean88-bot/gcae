"use client";

import type { getRisks } from "@/lib/data";
import { riskProduct } from "@/lib/scoring";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { saveRisk } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getRisks>>;

export function RisksView({ data }: { data: Data }) {
  const { busy, result, run } = useBusyRefresh();
  const max = 25;
  return (
    <div className="page">
      <p className="kicker">Risk register</p>
      <h1 className="display">Appetite is a line. Residual is a position.</h1>
      <p className="lede">Scores are likelihood times impact, on the same 1 to 5 scales used for findings. Outside appetite is a management position, not an audit rating.</p>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="matrix" style={{ gridTemplateColumns: "80px repeat(5, 1fr)" }}>
          <span />
          {[1, 2, 3, 4, 5].map((impact) => <strong key={impact} className="small">Impact {impact}</strong>)}
          {[5, 4, 3, 2, 1].map((likelihood) => (
            <>
              <strong key={`l${likelihood}`} className="small">L {likelihood}</strong>
              {[1, 2, 3, 4, 5].map((impact) => {
                const score = likelihood * impact;
                const hits = data.risks.filter((risk) => risk.residualLikelihood === likelihood && risk.residualImpact === impact);
                return (
                  <div key={`${likelihood}-${impact}`} className={`heat-${score >= 20 ? 5 : score >= 15 ? 4 : score >= 9 ? 3 : score >= 4 ? 2 : 1}`} style={{ borderRadius: 8, padding: 6, minHeight: 42 }}>
                    <div className="small">{score}</div>
                    {hits.map((risk) => <div key={risk.id} className="small">{risk.title}</div>)}
                  </div>
                );
              })}
            </>
          ))}
        </div>
        <p className="small muted">Cells show residual position. Maximum product is {max}.</p>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Risk</th><th>Entity</th><th>Inherent</th><th>Residual</th><th>Appetite</th><th>Treatment</th><th>Owner</th></tr>
          </thead>
          <tbody>
            {data.risks.map((risk) => (
              <tr key={risk.id}>
                <td><strong>{risk.title}</strong><div className="small muted">{risk.statement}</div></td>
                <td>{risk.entity}</td>
                <td>{riskProduct(risk.inherentLikelihood, risk.inherentImpact)}</td>
                <td>{riskProduct(risk.residualLikelihood, risk.residualImpact)}</td>
                <td><Pill tone={risk.appetite}>{risk.appetite}</Pill></td>
                <td>{risk.treatment}<div className="small muted">{risk.velocity} velocity</div></td>
                <td>{risk.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="panel"
        style={{ marginTop: 16 }}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await run(() => saveRisk({
            title: String(form.get("title") || ""),
            category: String(form.get("category") || ""),
            statement: String(form.get("statement") || ""),
            entityId: String(form.get("entityId") || ""),
            inherentLikelihood: Number(form.get("inherentLikelihood")),
            inherentImpact: Number(form.get("inherentImpact")),
            residualLikelihood: Number(form.get("residualLikelihood")),
            residualImpact: Number(form.get("residualImpact")),
            appetite: String(form.get("appetite") || "Within"),
            treatment: String(form.get("treatment") || "Mitigate"),
            ownerId: String(form.get("ownerId") || ""),
            velocity: String(form.get("velocity") || "Moderate"),
            linkedControlIds: String(form.get("linkedControlIds") || ""),
          }));
        }}
      >
        <h2 className="h3">Add a risk</h2>
        <Notice result={result} />
        <div className="split">
          <Field label="Title"><input className="input" name="title" required /></Field>
          <Field label="Category"><input className="input" name="category" defaultValue="Operational" /></Field>
          <Field label="Entity">
            <select className="select" name="entityId">
              <option value="">Group</option>
              {data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <select className="select" name="ownerId">{data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          </Field>
          {["inherentLikelihood", "inherentImpact", "residualLikelihood", "residualImpact"].map((name) => (
            <Field key={name} label={name}><input className="input" name={name} type="number" min={1} max={5} defaultValue={3} /></Field>
          ))}
          <Field label="Appetite">
            <select className="select" name="appetite">{["Within", "Approaching", "Outside"].map((item) => <option key={item}>{item}</option>)}</select>
          </Field>
          <Field label="Treatment">
            <select className="select" name="treatment">{["Mitigate", "Monitor", "Accept", "Avoid", "Transfer"].map((item) => <option key={item}>{item}</option>)}</select>
          </Field>
          <Field label="Velocity"><input className="input" name="velocity" defaultValue="Moderate" /></Field>
          <Field label="Linked control ids"><input className="input" name="linkedControlIds" placeholder="c-ap-01" /></Field>
        </div>
        <Field label="Statement"><textarea className="textarea" name="statement" required /></Field>
        <button className="btn copper" disabled={busy} type="submit">Add to register</button>
      </form>
    </div>
  );
}