"use client";

import Link from "next/link";
import type { getPack, getPacks } from "@/lib/strategic-data";
import { BANDS } from "@/lib/erm";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { generatePack, releasePack } from "@/server/strategic";
import { useRouter } from "next/navigation";

export function AcPackList({ data }: { data: Awaited<ReturnType<typeof getPacks>> }) {
  const router = useRouter();
  const { busy, result, run } = useBusyRefresh();
  if (data.denied) return <div className="page"><h1 className="display">Audit Committee pack</h1><div className="note bad">Your role cannot open Audit Committee packs.</div></div>;
  const canGenerate = ["gcae", "manager"].includes(data.actor.authority);
  const year = new Date().getFullYear();
  return (
    <div className="page">
      <p className="kicker">Audit Committee</p>
      <h1 className="display">Audit Committee pack</h1>
      <p className="lede">Built only from records in this app. No model is used. A pack is marked DRAFT until the GCAE releases it. A released pack is frozen and carries a SHA-256 hash.</p>
      {canGenerate ? (
        <form className="panel" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }} onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await run(() => generatePack(String(f.get("from")), String(f.get("to"))));
          if (r.ok && r.id) router.push(`/ac-pack/${r.id}`);
        }}>
          <Field label="Period from"><input name="from" type="date" required defaultValue={`${year}-01-01`} /></Field>
          <Field label="Period to"><input name="to" type="date" required defaultValue={`${year}-12-31`} /></Field>
          <button className="btn copper" disabled={busy}>Generate draft pack</button>
          <Notice result={result} />
        </form>
      ) : <p className="small muted">You can read released packs.</p>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Period</th><th>Status</th><th>Generated</th><th>Released</th><th>Hash (sha256)</th></tr></thead>
          <tbody>
            {data.packs.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/ac-pack/${p.id}`}>{p.periodFrom} to {p.periodTo}</Link></td>
                <td><Pill tone={p.status === "Released" ? "Low" : "High"}>{p.status === "Released" ? "Released" : "DRAFT — not issued"}</Pill></td>
                <td>{p.generatedAt.slice(0, 10)}</td><td>{p.releasedAt ? p.releasedAt.slice(0, 10) : "—"}</td>
                <td className="small" style={{ wordBreak: "break-all" }}>{p.status === "Released" ? p.snapshotHash : "Shown on release"}</td>
              </tr>
            ))}
            {data.packs.length === 0 ? <tr><td colSpan={5} className="muted">No packs yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PackSheet({ data }: { data: NonNullable<Awaited<ReturnType<typeof getPack>>> }) {
  const { busy, result, run } = useBusyRefresh();
  const { pack, snapshot: s, actor } = data;
  const released = pack.status === "Released";
  return (
    <div className="page pack-sheet">
      <style>{`
        .watermark { position: fixed; top: 38%; left: 8%; font-size: 84px; font-weight: 700; color: rgba(160,40,40,.13); transform: rotate(-24deg); pointer-events: none; z-index: 5; white-space: nowrap; }
        @media print { .watermark { position: fixed; } .pack-sheet h2 { break-after: avoid; } .pack-sheet table { break-inside: avoid; } }
      `}</style>
      {released ? null : <div className="watermark" aria-hidden>DRAFT — not issued</div>}
      <div className="no-print" style={{ marginBottom: 12 }}>
        <Link href="/ac-pack">All packs</Link>{" · "}
        <button className="btn small" onClick={() => window.print()}>Print</button>{" "}
        <a className="btn small" href={`/api/export/ac-pack/${pack.id}`}>Download Excel</a>{" "}
        {actor.authority === "gcae" && !released ? <button className="btn copper small" disabled={busy} onClick={() => run(() => releasePack(pack.id))}>Release pack</button> : null}
        <Notice result={result} />
        {!released && actor.authority === "manager" ? <p className="small muted">Only the GCAE can release a pack.</p> : null}
        {!released && pack.generatedByAuthority !== "gcae" ? <p className="small">This draft was generated from a manager&apos;s limited view. The GCAE must generate it again before release.</p> : null}
      </div>
      <p className="kicker">Group Internal Audit · Audit Committee pack</p>
      <h1 className="display">Period {s.period.from} to {s.period.to}</h1>
      <p><strong>{released ? `RELEASED ${pack.releasedAt?.slice(0, 10)}` : "DRAFT — not issued"}</strong>. Generated {pack.generatedAt.slice(0, 10)} by {s.generatedBy}. Status of findings and actions is as at {s.asOf}.</p>
      <p className="small" style={{ wordBreak: "break-all" }}>SHA-256 of the frozen snapshot: {released ? pack.snapshotHash : `${pack.snapshotHash} (not final until release)`} · recomputed hash matches: <strong>{pack.hashVerified ? "Yes" : "NO — do not rely on this pack"}</strong></p>

      {s.restricted ? <div className="note">{s.restricted.note}</div> : null}

      <h2>1. Audit plan progress</h2>
      {s.plan ? (
        <>
          <p>Plan {s.plan.year}, version {s.plan.version}: {s.plan.status}. {s.plan.allocatedDays} of {s.plan.capacityDays} days allocated{s.plan.allocatedDays > s.plan.capacityDays ? " (OVER capacity)" : ""}. {s.plan.weightsApproved ? "" : "Weights not approved by the GCAE."}</p>
          <table className="data"><thead><tr><th>Quarter</th><th>Items</th><th>Planned</th><th>In progress</th><th>Completed</th><th>Deferred</th><th>Cancelled</th></tr></thead>
            <tbody>{Object.entries(s.plan.byQuarter).map(([q, r]) => <tr key={q}><td>{q}</td><td>{r.total}</td><td>{r.Planned}</td><td>{r["In progress"]}</td><td>{r.Completed}</td><td>{r.Deferred}</td><td>{r.Cancelled}</td></tr>)}</tbody></table>
          {s.plan.deferredCancelled.length ? <ul className="small">{s.plan.deferredCancelled.map((d, n) => <li key={n}>{d.status}: {d.title} ({d.quarter}). Reason: {d.reason}</li>)}</ul> : null}
        </>
      ) : <p>No approved plan found for the year of the period end.</p>}

      <h2>2. Reports issued in the period</h2>
      <table className="data"><thead><tr><th>Code</th><th>Title</th><th>Opinion</th><th>Issued</th></tr></thead>
        <tbody>{s.issuedReports.map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.title}</td><td>{r.opinion}</td><td>{r.issuedAt}</td></tr>)}{s.issuedReports.length === 0 ? <tr><td colSpan={4}>No reports were issued in this period.</td></tr> : null}</tbody></table>

      <h2>3. Open findings</h2>
      <p>{s.findings.total} open. {BANDS.map((b) => `${b}: ${s.findings.byBand[b]}`).join(" · ")}</p>
      <table className="data"><thead><tr><th>Age</th>{BANDS.map((b) => <th key={b}>{b}</th>)}</tr></thead>
        <tbody>{s.findings.buckets.map((b) => <tr key={b}><td>{b}</td>{BANDS.map((x) => <td key={x}>{s.findings.ageing[b][x]}</td>)}</tr>)}</tbody></table>

      <h2>4. Overdue actions</h2>
      <table className="data"><thead><tr><th>Finding</th><th>Action</th><th>Owner</th><th>Due</th><th>Days late</th><th>Band</th><th>Follow-up</th></tr></thead>
        <tbody>{s.overdueActions.map((a, n) => <tr key={n}><td>{a.findingCode}</td><td>{a.agreedAction}</td><td>{a.ownerName}<div className="small">{a.ownerRole}</div></td><td>{a.due}</td><td>{a.daysOverdue}</td><td>{a.band}</td><td>{a.cadence}</td></tr>)}{s.overdueActions.length === 0 ? <tr><td colSpan={7}>No overdue actions.</td></tr> : null}</tbody></table>

      <h2>5. Enterprise risk summary</h2>
      <p>{s.erm.total} risks. Residual view: {BANDS.map((b) => `${b} ${s.erm.residualBands[b]}`).join(" · ")}. Residual not assessed: {s.erm.residualNotAssessed}. No linked control: {s.erm.withoutControl}.</p>
      <table className="data"><thead><tr><th>Top residual risks</th><th>Entity</th><th>Inherent</th><th>Residual</th><th>Band</th></tr></thead>
        <tbody>{s.erm.top.map((r, n) => <tr key={n}><td>{r.title}</td><td>{r.entity}</td><td>{r.inherent}</td><td>{r.residual}</td><td>{r.band}</td></tr>)}{s.erm.top.length === 0 ? <tr><td colSpan={5}>No residual assessments recorded.</td></tr> : null}</tbody></table>

      <h2>6. Kaizen lessons accepted</h2>
      {s.lessons.length ? <ul>{s.lessons.map((l, n) => <li key={n}>{l.title} ({l.area}, proposed {l.created})</li>)}</ul> : <p>No accepted lessons were proposed in this period.</p>}

      <h2>7. Limitations</h2>
      <ul>{s.limitations.map((l, n) => <li key={n}>{l}</li>)}</ul>
    </div>
  );
}
