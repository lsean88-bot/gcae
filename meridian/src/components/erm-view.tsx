"use client";

import { useMemo, useState } from "react";
import type { getErm } from "@/lib/strategic-data";
import { BANDS, NOT_ASSESSED, buildHeat, residualLabel, risksWithoutControl, topRisks, viewScore, type RiskView } from "@/lib/erm";
import { bandFor } from "@/lib/methodology";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { assessResidual } from "@/server/strategic";

type Data = Awaited<ReturnType<typeof getErm>>;
const heatClass = (score: number) => (score >= 20 ? "heat-5" : score >= 12 ? "heat-4" : score >= 6 ? "heat-3" : "heat-1");

export function ErmView({ data }: { data: Data }) {
  const [view, setView] = useState<RiskView>("residual");
  const [entity, setEntity] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");
  const [cell, setCell] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { busy, result, run } = useBusyRefresh();

  const categories = [...new Set(data.risks.map((r) => r.category))].sort();
  const owners = [...new Map(data.risks.map((r) => [r.ownerId, r.owner])).entries()];
  const risks = useMemo(() => data.risks.filter((r) => (!entity || (r.entityId || "group") === entity) && (!category || r.category === category) && (!owner || r.ownerId === owner)), [data.risks, entity, category, owner]);
  const heat = useMemo(() => buildHeat(risks, view), [risks, view]);
  const top = topRisks(risks, view, 10);
  const noControl = risksWithoutControl(risks, new Set(data.controlIds));
  const inCell = cell ? heat.cells[cell].map((id) => risks.find((r) => r.id === id)!).filter(Boolean) : [];
  const detail = data.risks.find((r) => r.id === selected) || null;
  const label = view === "residual" ? "Residual" : "Inherent";

  return (
    <div className="page">
      <p className="kicker">Enterprise risk management</p>
      <h1 className="display">Risk heat map</h1>
      <p className="lede">Every risk sits in one cell: likelihood times impact on the 1 to 5 scales. Bands: 20–25 Critical, 12–19 High, 6–11 Medium, 1–5 Low. Scores are entered by people. The app only counts them.</p>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div role="group" aria-label="View">
            <button type="button" className={view === "inherent" ? "btn copper small" : "btn small"} aria-pressed={view === "inherent"} onClick={() => { setView("inherent"); setCell(null); }}>Inherent</button>{" "}
            <button type="button" className={view === "residual" ? "btn copper small" : "btn small"} aria-pressed={view === "residual"} onClick={() => { setView("residual"); setCell(null); }}>Residual</button>
          </div>
          <Field label="Entity"><select value={entity} onChange={(e) => { setEntity(e.target.value); setCell(null); }}><option value="">All</option><option value="group">Group (no entity)</option>{data.entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Category"><select value={category} onChange={(e) => { setCategory(e.target.value); setCell(null); }}><option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Owner"><select value={owner} onChange={(e) => { setOwner(e.target.value); setCell(null); }}><option value="">All</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        </div>
        <div className="matrix" role="group" aria-label={`${label} risk heat map, likelihood by impact`} style={{ gridTemplateColumns: "80px repeat(5, 1fr)", marginTop: 8 }}>
          <span />
          {[1, 2, 3, 4, 5].map((i) => <strong key={i} className="small">Impact {i}</strong>)}
          {[5, 4, 3, 2, 1].flatMap((l) => [
            <strong key={`l${l}`} className="small">Likelihood {l}</strong>,
            ...[1, 2, 3, 4, 5].map((i) => {
              const key = `${l}-${i}`;
              const n = heat.cells[key].length;
              const score = l * i;
              const band = bandFor(score);
              return (
                <button key={key} type="button" className={heatClass(score)} aria-pressed={cell === key}
                  aria-label={`Likelihood ${l}, impact ${i}, score ${score}, ${band}: ${n} risk${n === 1 ? "" : "s"}`}
                  onClick={() => setCell(cell === key ? null : key)}
                  style={{ borderRadius: 8, padding: 6, minHeight: 56, border: cell === key ? "2px solid #222" : "1px solid #d8d2c4", textAlign: "left", cursor: "pointer" }}>
                  <div className="small">{score} · {band}</div>
                  <strong>{n} {n === 1 ? "risk" : "risks"}</strong>
                </button>
              );
            }),
          ])}
        </div>
        <p className="small muted">{label} view. {heat.notAssessed.length > 0 ? `${heat.notAssessed.length} risk(s) have no residual assessment and are not plotted: residual not assessed.` : "Every risk in this filter is plotted."}</p>
      </div>

      {cell ? (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>Likelihood {cell.split("-")[0]}, impact {cell.split("-")[1]}: {inCell.length} risk(s)</h3>
          {inCell.length === 0 ? <p className="muted small">No risks in this cell.</p> : <ul>{inCell.map((r) => <li key={r.id}><button type="button" className="btn small" onClick={() => setSelected(r.id)}>{r.title}</button> <span className="small muted">{r.entity} · {r.owner}</span></li>)}</ul>}
        </div>
      ) : null}

      <div className="grid-3" style={{ marginBottom: 14 }}>
        {BANDS.map((b) => <div key={b} className="panel"><Pill tone={b}>{b}</Pill><div className="display" style={{ fontSize: 30 }}>{heat.bands[b]}</div><div className="small muted">{label} view</div></div>)}
        <div className="panel"><strong>Residual not assessed</strong><div className="display" style={{ fontSize: 30 }}>{buildHeat(risks, "residual").notAssessed.length}</div><div className="small muted">of {risks.length} risks</div></div>
        <div className="panel"><strong>No linked control</strong><div className="display" style={{ fontSize: 30 }}>{noControl.length}</div><div className="small muted">risks whose control list is empty or names no existing control</div></div>
      </div>
      {noControl.length ? <p className="small">Without a linked control: {noControl.map((r) => r.title).join("; ")}.</p> : null}

      <h2>Top 10 by {label.toLowerCase()} score</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>#</th><th>Risk</th><th>Entity</th><th>Owner</th><th>Inherent</th><th>Residual</th><th>{label} band</th></tr></thead>
          <tbody>
            {top.map(({ risk, score }, n) => (
              <tr key={risk.id}>
                <td>{n + 1}</td>
                <td><button type="button" className="btn small" onClick={() => setSelected(risk.id)}>{risk.title}</button></td>
                <td>{risk.entity}</td><td>{risk.owner}</td>
                <td>{viewScore(risk, "inherent")}</td>
                <td>{viewScore(risk, "residual") ?? NOT_ASSESSED}</td>
                <td><Pill tone={bandFor(score)}>{bandFor(score)}</Pill></td>
              </tr>
            ))}
            {top.length === 0 ? <tr><td colSpan={7} className="muted">No assessed risks in this view.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <form key={detail.id} className="panel" style={{ marginTop: 16 }} onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          await run(() => assessResidual(detail.id, Number(f.get("l")), Number(f.get("i")), String(f.get("why") || "")));
        }}>
          <h3>{detail.title}</h3>
          <p className="small">{detail.statement}</p>
          <p className="small">Inherent: L{detail.inherentLikelihood} x I{detail.inherentImpact} = {detail.inherentLikelihood * detail.inherentImpact}. Residual: {residualLabel(detail)}. {detail.residualRationale ? `Rationale: ${detail.residualRationale}` : ""}</p>
          {detail.canAssess ? (
            <>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Field label="Residual likelihood (1-5)"><input name="l" type="number" min={1} max={5} required defaultValue={detail.residualLikelihood ?? ""} /></Field>
                <Field label="Residual impact (1-5)"><input name="i" type="number" min={1} max={5} required defaultValue={detail.residualImpact ?? ""} /></Field>
              </div>
              <Field label="Rationale (controls relied on)"><textarea name="why" required rows={2} defaultValue={detail.residualRationale ?? ""} /></Field>
              <button className="btn copper" disabled={busy}>Record my residual assessment</button>
            </>
          ) : <p className="small muted">Only the risk owner, an audit manager or the GCAE can assess residual risk.</p>}
          <Notice result={result} />
        </form>
      ) : null}
    </div>
  );
}
