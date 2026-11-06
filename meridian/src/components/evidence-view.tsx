"use client";

import { Fragment, useState } from "react";
import type { getEvidenceLibrary } from "@/lib/data";
import { RELIABILITY } from "@/lib/methodology";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { registerEvidence } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getEvidenceLibrary>>;

export function EvidenceView({ data }: { data: Data }) {
  const { busy, result, run } = useBusyRefresh();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="page">
      <p className="kicker">Evidence ledger</p>
      <h1 className="display">The file, before the opinion.</h1>
      <p className="lede">Every extract is hashed, versioned, and left alone. A new version is a new row. Reliability is a grade, not a compliment. R4 and R5 cannot support a pass.</p>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        {RELIABILITY.map((item) => (
          <article key={item.id} className="panel">
            <strong>{item.label}</strong>
            <p className="small muted">{item.text}</p>
          </article>
        ))}
      </div>
      <form
        className="panel"
        style={{ marginBottom: 16 }}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await run(() => registerEvidence({
            engagementId: String(form.get("engagementId") || ""),
            sourceSystem: String(form.get("sourceSystem") || ""),
            filename: String(form.get("filename") || ""),
            documentType: String(form.get("documentType") || ""),
            process: String(form.get("process") || ""),
            period: String(form.get("period") || ""),
            body: String(form.get("body") || ""),
            completeness: String(form.get("completeness") || "Partial"),
            reliability: String(form.get("reliability") || "R3"),
            limitations: String(form.get("limitations") || ""),
            custodianId: String(form.get("custodianId") || ""),
            sheet: String(form.get("sheet") || ""),
          }));
        }}
      >
        <h2 className="h3">Register evidence</h2>
        <Notice result={result} />
        <div className="split">
          <Field label="Engagement">
            <select className="select" name="engagementId">
              <option value="">Unlinked</option>
              {data.engagements.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
            </select>
          </Field>
          <Field label="Custodian">
            <select className="select" name="custodianId">
              {data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </Field>
          <Field label="Source system"><input className="input" name="sourceSystem" required placeholder="SAP B1" /></Field>
          <Field label="Filename"><input className="input" name="filename" required placeholder="extract.csv" /></Field>
          <Field label="Type"><input className="input" name="documentType" defaultValue="System extract" /></Field>
          <Field label="Process"><input className="input" name="process" /></Field>
          <Field label="Period"><input className="input" name="period" /></Field>
          <Field label="Sheet or section"><input className="input" name="sheet" /></Field>
          <Field label="Completeness">
            <select className="select" name="completeness">{["Complete", "Partial", "Unknown", "Not applicable"].map((item) => <option key={item}>{item}</option>)}</select>
          </Field>
          <Field label="Reliability">
            <select className="select" name="reliability">{RELIABILITY.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </Field>
        </div>
        <Field label="Limitation"><input className="input" name="limitations" placeholder="What this file does not cover" /></Field>
        <Field label="Body — paste the extract. It will be hashed and then read-only.">
          <textarea className="textarea" name="body" required style={{ minHeight: 140 }} placeholder="invoice_id,vendor,amount" />
        </Field>
        <button className="btn copper" disabled={busy} type="submit">Register and hash</button>
      </form>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Evidence</th><th>Engagement</th><th>Grade</th><th>Rows</th><th>Hash</th><th>Limitation</th></tr>
          </thead>
          <tbody>
            {data.evidence.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <button className="btn small ghost" type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{item.originalFilename}</button>
                    <div className="small muted">{item.id} · {item.sourceSystem}</div>
                  </td>
                  <td>{item.engagement}</td>
                  <td><Pill tone={item.reliability}>{item.reliability}</Pill> <Pill tone={item.completeness}>{item.completeness}</Pill></td>
                  <td>{item.recordCount}</td>
                  <td className="mono">{item.fileHash.slice(0, 16)}</td>
                  <td className="small">{item.limitations}</td>
                </tr>
                {openId === item.id ? (
                  <tr>
                    <td colSpan={6}><pre className="small" style={{ whiteSpace: "pre-wrap" }}>{item.body}</pre></td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}