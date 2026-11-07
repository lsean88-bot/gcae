"use client";

import { useRouter } from "next/navigation";
import { Notice, Pill, useBusyRefresh } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { generateAiVersionAction, generateVersionAction, setReportStatusAction } from "@/server/report13-actions";

type Latest = { id: string; versionNo: number; status: string; gate: { blocking: string[]; warnings: string[] }; sections: { number: number; title: string; paragraphs: string[]; tables?: { headers: string[]; rows: string[][] }[] }[] };
type Version = { id: string; versionNo: number; status: string; sha256: string; createdAt: string; signedOffBy: string | null; signedOffAt: string | null };

export function Report13Panel({ engagementId, engagements, latest, versions, isGcae, aiModel }: {
  aiModel?: string | null;
  engagementId: string;
  engagements: { id: string; code: string; title: string }[];
  latest: Latest | null;
  versions: Version[];
  isGcae: boolean;
}) {
  const router = useRouter();
  const { busy, result, run } = useBusyRefresh();
  const blocked = latest ? latest.gate.blocking.length > 0 : false;
  return (
    <section className="panel" style={{ marginTop: 24 }} id="report13">
      <p className="kicker">13-section report</p>
      <h2>Versioned report and Board brief</h2>
      <p className="small">Each version is a stored snapshot and cannot be edited or deleted. Final is refused while the release gate has blocking items.</p>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 280 }} value={engagementId} onChange={(e) => router.push(`/reports?engagement=${e.target.value}#report13`)}>
          {engagements.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
        </select>
        <button className="btn primary" type="button" disabled={busy} onClick={() => run(() => generateVersionAction(engagementId))}>Generate new version</button>
        {isGcae && aiModel ? <button className="btn" type="button" disabled={busy} onClick={() => run(() => generateAiVersionAction(engagementId))}>Draft narrative with AI</button> : null}
      </div>
      <Notice result={result} />
      {!latest ? <p className="small">No version has been generated for this engagement.</p> : (
        <>
          <div className="row no-print" style={{ marginBottom: 12 }}>
            <Pill>v{latest.versionNo} · {latest.status}</Pill>
            <a className="btn small" href={`/reports/v/${latest.id}/docx?kind=report`}>Download report (.docx)</a>
            <a className="btn small" href={`/reports/v/${latest.id}/docx?kind=brief`}>Download Board brief (.docx)</a>
            {isGcae && latest.status === "Draft" ? <button className="btn small" type="button" disabled={busy} onClick={() => run(() => setReportStatusAction(latest.id, "Reviewed"))}>Mark Reviewed</button> : null}
            {isGcae && latest.status !== "Final" ? <button className="btn small primary" type="button" disabled={busy || blocked} onClick={() => run(() => setReportStatusAction(latest.id, "Final"))}>Mark Final</button> : null}
          </div>
          {isGcae && blocked && latest.status !== "Final" ? <p className="small" style={{ color: "#7a2424" }}>Final is disabled: {latest.gate.blocking.length} blocking item(s) in the release gate.</p> : null}
          <div className="note bad" style={{ marginBottom: 8 }}>
            <strong>Blocking ({latest.gate.blocking.length})</strong>
            {latest.gate.blocking.length ? <ul>{latest.gate.blocking.map((b) => <li key={b}>{b}</li>)}</ul> : <p className="small">None.</p>}
          </div>
          <div className="note" style={{ marginBottom: 12, background: "#fbf3df", color: "#6b4a00" }}>
            <strong>Warnings ({latest.gate.warnings.length})</strong>
            {latest.gate.warnings.length ? <ul>{latest.gate.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="small">None.</p>}
          </div>
          <article className="report-sheet">
            {latest.sections.map((s) => (
              <section key={s.number}>
                <h3>{s.number}. {s.title}</h3>
                {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                {s.tables?.map((t, ti) => (
                  <table key={ti}>
                    <thead><tr>{t.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{t.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
                  </table>
                ))}
              </section>
            ))}
          </article>
        </>
      )}
      {versions.length ? (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Version</th><th>Status</th><th>Created</th><th>Signed off</th><th>sha256</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>v{v.versionNo}</td><td>{v.status}</td><td>{formatDate(v.createdAt)}</td>
                <td>{v.signedOffBy ? `${v.signedOffBy} · ${formatDate(v.signedOffAt || "")}` : "-"}</td>
                <td><code>{v.sha256.slice(0, 12)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
