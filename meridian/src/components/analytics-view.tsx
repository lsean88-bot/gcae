"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { analyticsPageData, RunView } from "@/server/analytics";
import { Field, Pill } from "@/components/ui";
import { inspectUploadAction, linkRunAction, loadRunAction, runAnalyticsAction } from "@/server/analytics-actions";

type Data = Awaited<ReturnType<typeof analyticsPageData>>;
type Info = { headers: string[]; rowCount: number; sheetNames: string[]; sheet: string | null; sha256: string; preview: Record<string, string>[] };
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TESTS = [
  { id: "profile", name: "Profile", help: "Row count, blanks, distinct values, numeric range and literal error strings per column." },
  { id: "benford", name: "Benford first digit", help: "First-digit distribution of one amount column against Benford's law (MAD, Nigrini bands)." },
  { id: "duplicates", name: "Duplicates", help: "Exact and normalised (trim, case, leading zero) matches on one or more key columns." },
  { id: "reconcile", name: "Reconcile two files", help: "Match A to B on a key, compare an amount within a tolerance. Net and gross variance." },
];

const fmt = (n: unknown, d = 2) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "–");
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="data">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="panel flat stat"><div className="label">{label}</div><div className="value" style={{ fontSize: 26 }}>{value}</div></div>;
}

function Result({ run }: { run: RunView }) {
  const r = run.result as R;
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <p className="kicker">{run.id} · {run.testType}</p>
      <h2 className="h3">{run.inputFilename}</h2>
      <p className="note bad" style={{ margin: "8px 0" }}><strong>{run.label}</strong></p>
      <p className="small muted">Saved {run.createdAt} by {run.createdBy} · {run.rowCount} rows · SHA-256 <code>{run.inputSha256}</code>{run.engagementCode ? ` · linked to ${run.engagementCode}` : " · not linked to an engagement"}</p>
      {run.testType === "profile" ? (
        <>
          <p className="small"><strong>{r.rowCount}</strong> rows, <strong>{r.columnCount}</strong> columns, <strong>{r.totalErrorStrings}</strong> literal error strings.</p>
          <Table head={["Column", "Blank", "Distinct", "Numeric", "Min", "Max", "Sum", "Error strings"]} rows={r.columns.map((c: R) => [c.name, c.blank, c.distinct, c.numericCount, fmt(c.min), fmt(c.max), fmt(c.sum), c.errorStrings ? <Pill key="e" tone="High">{c.errorStrings} {Object.keys(c.errorByString).join(" ")}</Pill> : 0])} />
        </>
      ) : null}
      {run.testType === "benford" ? (
        <>
          <p className="small"><strong>n = {r.n}</strong> · MAD {r.mad === null ? "–" : r.mad.toFixed(5)} · <Pill tone={r.band === "nonconformity" ? "High" : ""}>{r.band}</Pill> · ignored: {r.ignoredBelowTen} below 10, {r.ignoredNonNumeric} non-numeric</p>
          {r.warnings.map((w: string) => <p key={w} className="note bad">{w}</p>)}
          <Table head={["Digit", "Count", "Observed", "Expected", "Difference"]} rows={r.digits.map((d: R) => [d.digit, d.count, pct(d.observed), pct(d.expected), `${d.difference >= 0 ? "+" : ""}${pct(d.difference)}`])} />
          <p className="small muted">{r.basis}</p>
        </>
      ) : null}
      {run.testType === "duplicates" ? (
        <>
          <p className="small">Keys: <strong>{r.keyCols.join(", ")}</strong> · {r.rowsTested} rows tested, {r.skippedBlankKey} skipped (blank key). Exact: <strong>{r.exact.groupCount}</strong> groups ({r.exact.rowsInGroups} rows). Normalised: <strong>{r.normalised.groupCount}</strong> groups ({r.normalised.rowsInGroups} rows). Found only after normalising: <strong>{r.normalisedOnly.groupCount}</strong>.</p>
          {(["normalisedOnly", "exact"] as const).map((k) => (
            <div key={k}>
              <h3 className="h3" style={{ marginTop: 12 }}>{k === "exact" ? "Exact matches" : "Normalised-only matches (spacing, case or leading zeros differ)"}</h3>
              <Table head={["Key", "Rows", "Row numbers", "Raw variants"]} rows={r[k].groups.map((g: R) => [g.key, g.count, g.rowNumbers.slice(0, 20).join(", "), g.variants.join(" ; ")])} />
              {r[k].truncated ? <p className="small muted">List truncated; counts above are complete.</p> : null}
            </div>
          ))}
          <p className="small muted">{r.note}</p>
        </>
      ) : null}
      {run.testType === "reconcile" ? (
        <>
          <div className="grid-4" style={{ marginTop: 8 }}>
            <Stat label="Matched in tolerance" value={r.matchedWithinTolerance} />
            <Stat label="Mismatched beyond tolerance" value={r.mismatchedBeyondTolerance} />
            <Stat label="Only in A" value={r.onlyInACount} />
            <Stat label="Only in B" value={r.onlyInBCount} />
          </div>
          <p className="small" style={{ marginTop: 10 }}>Tolerance {fmt(r.tolerance)} · keys A {r.keysA}, B {r.keysB} · {r.matchedByNormalisedKey} matched only after key normalisation · {r.unparseableAmountPairs} pairs with unusable amounts.</p>
          <Table head={["Measure", "Net", "Gross absolute", "Offsetting"]} rows={[
            ["All paired keys (B minus A)", fmt(r.pairedVariance.net), fmt(r.pairedVariance.grossAbsolute), r.pairedVariance.offsetting ? "Yes" : "No"],
            ["Mismatched pairs only", fmt(r.mismatchedVariance.net), fmt(r.mismatchedVariance.grossAbsolute), r.mismatchedVariance.offsetting ? "Yes" : "No"],
          ]} />
          <p className="small">Total A {fmt(r.totalA)} · Total B {fmt(r.totalB)} · difference {fmt(r.totalDifferenceBMinusA)} · only in A {fmt(r.onlyInAAmount)} · only in B {fmt(r.onlyInBAmount)} · repeated keys (summed): A {r.duplicateKeysA}, B {r.duplicateKeysB}</p>
          <h3 className="h3" style={{ marginTop: 12 }}>Mismatched</h3>
          <Table head={["Key A", "Key B", "Matched by", "A", "B", "B minus A"]} rows={r.mismatched.map((p: R) => [p.key, p.keyB, p.matchedBy, fmt(p.amountA), fmt(p.amountB), fmt(p.difference)])} />
          <div className="grid-2" style={{ marginTop: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div><h3 className="h3">Only in A</h3><Table head={["Key", "Amount"]} rows={r.onlyInA.map((p: R) => [p.key, fmt(p.amount)])} /></div>
            <div><h3 className="h3">Only in B</h3><Table head={["Key", "Amount"]} rows={r.onlyInB.map((p: R) => [p.key, fmt(p.amount)])} /></div>
          </div>
          {r.truncated ? <p className="small muted">Lists truncated; counts and totals are complete.</p> : null}
          <p className="small muted">{r.note}</p>
        </>
      ) : null}
    </section>
  );
}

export function AnalyticsView({ data }: { data: Data }) {
  const router = useRouter();
  const [test, setTest] = useState("profile");
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [infoA, setInfoA] = useState<Info | null>(null);
  const [infoB, setInfoB] = useState<Info | null>(null);
  const [sheetA, setSheetA] = useState("");
  const [sheetB, setSheetB] = useState("");
  const [column, setColumn] = useState("");
  const [keyCols, setKeyCols] = useState<string[]>([]);
  const [keyCol, setKeyCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [keyColB, setKeyColB] = useState("");
  const [amountColB, setAmountColB] = useState("");
  const [tolerance, setTolerance] = useState("0");
  const [engagementId, setEngagementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shown, setShown] = useState<RunView | null>(null);
  const [linkTo, setLinkTo] = useState("");

  async function inspect(side: "A" | "B", file: File | null, sheet: string) {
    const set = side === "A" ? setInfoA : setInfoB;
    set(null);
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("sheet", sheet);
    const res = await inspectUploadAction(fd);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setMsg(null);
    set(res);
    const first = res.headers[0] || "";
    if (side === "A") { setColumn(res.headers[0] || ""); setKeyCols(first ? [first] : []); setKeyCol(first); setAmountCol(res.headers[1] || first); if (sheet === "") setSheetA(res.sheet || ""); }
    else { setKeyColB(first); setAmountColB(res.headers[1] || first); if (sheet === "") setSheetB(res.sheet || ""); }
  }

  async function run() {
    if (!fileA) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("fileA", fileA);
    fd.set("sheetA", sheetA);
    if (test === "reconcile" && fileB) { fd.set("fileB", fileB); fd.set("sheetB", sheetB); }
    fd.set("test", test);
    fd.set("engagementId", engagementId);
    fd.set("params", JSON.stringify({ column, keyCols, keyCol, amountCol, keyColB, amountColB, tolerance: Number(tolerance) }));
    try {
      const res = await runAnalyticsAction(fd);
      if (res.ok) { setShown(res.run); setMsg({ ok: true, text: `Saved ${res.id}. Read-only from here.` }); router.refresh(); }
      else setMsg({ ok: false, text: res.error });
    } catch {
      setMsg({ ok: false, text: "Sign in again, or the file was too large for the server." });
    } finally { setBusy(false); }
  }

  const def = TESTS.find((t) => t.id === test)!;
  const headersA = infoA?.headers || [];
  const headersB = infoB?.headers || [];
  const ready = Boolean(infoA) && (test !== "reconcile" || Boolean(infoB)) && (test !== "duplicates" || keyCols.length > 0);
  const colSelect = (value: string, onChange: (v: string) => void, headers: string[]) => (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select>
  );

  return (
    <div className="page">
      <p className="kicker">Analytics</p>
      <h1 className="display">Test the data. Then say what it is.</h1>
      <p className="lede">
        Profile, Benford, duplicate and reconciliation tests on a CSV or Excel extract. Files are read on this machine, never sent to a model, and not stored: only the SHA-256, the settings and the result are saved. Every output is [ANA] auditor analysis, an indicator and not a finding.
      </p>
      {msg ? <div className={msg.ok ? "note ok" : "note bad"} style={{ marginBottom: 12 }}>{msg.text}</div> : null}
      <div className="workpaper">
        <form className="panel" onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <h2 className="h3">New run</h2>
          <Field label="Test">
            <select className="select" value={test} onChange={(e) => setTest(e.target.value)}>{TESTS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </Field>
          <p className="small muted">{def.help}</p>
          <Field label={test === "reconcile" ? `File A (.csv or .xlsx, max ${data.maxMb} MB)` : `File (.csv or .xlsx, max ${data.maxMb} MB)`}>
            <input className="input" type="file" accept=".csv,.xlsx" onChange={(e) => { const f = e.target.files?.[0] || null; setFileA(f); setSheetA(""); void inspect("A", f, ""); }} />
          </Field>
          {infoA && infoA.sheetNames.length > 1 ? (
            <Field label="Sheet (A)"><select className="select" value={sheetA} onChange={(e) => { setSheetA(e.target.value); void inspect("A", fileA, e.target.value); }}>{infoA.sheetNames.map((s) => <option key={s}>{s}</option>)}</select></Field>
          ) : null}
          {infoA ? <p className="small muted">{infoA.rowCount} rows · {infoA.headers.length} columns · SHA-256 {infoA.sha256.slice(0, 16)}…</p> : null}
          {test === "benford" && infoA ? <Field label="Amount column">{colSelect(column, setColumn, headersA)}</Field> : null}
          {test === "duplicates" && infoA ? (
            <Field label="Key columns (hold Ctrl or Cmd for several)">
              <select className="select" multiple size={Math.min(6, headersA.length)} value={keyCols} onChange={(e) => setKeyCols([...e.target.selectedOptions].map((o) => o.value))}>{headersA.map((h) => <option key={h} value={h}>{h}</option>)}</select>
            </Field>
          ) : null}
          {test === "reconcile" ? (
            <>
              {infoA ? <div className="row"><Field label="Key column (A)">{colSelect(keyCol, setKeyCol, headersA)}</Field><Field label="Amount column (A)">{colSelect(amountCol, setAmountCol, headersA)}</Field></div> : null}
              <Field label={`File B (.csv or .xlsx, max ${data.maxMb} MB)`}>
                <input className="input" type="file" accept=".csv,.xlsx" onChange={(e) => { const f = e.target.files?.[0] || null; setFileB(f); setSheetB(""); void inspect("B", f, ""); }} />
              </Field>
              {infoB && infoB.sheetNames.length > 1 ? (
                <Field label="Sheet (B)"><select className="select" value={sheetB} onChange={(e) => { setSheetB(e.target.value); void inspect("B", fileB, e.target.value); }}>{infoB.sheetNames.map((s) => <option key={s}>{s}</option>)}</select></Field>
              ) : null}
              {infoB ? <div className="row"><Field label="Key column (B)">{colSelect(keyColB, setKeyColB, headersB)}</Field><Field label="Amount column (B)">{colSelect(amountColB, setAmountColB, headersB)}</Field></div> : null}
              <Field label="Tolerance (amount, inclusive)"><input className="input" type="number" min="0" step="any" value={tolerance} onChange={(e) => setTolerance(e.target.value)} /></Field>
            </>
          ) : null}
          <Field label="Link to engagement (optional)">
            <select className="select" value={engagementId} onChange={(e) => setEngagementId(e.target.value)}>
              <option value="">Not linked</option>
              {data.engagements.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.title}</option>)}
            </select>
          </Field>
          <button className="btn copper" type="submit" disabled={busy || !ready}>{busy ? "Running" : "Run and save"}</button>
        </form>
        <aside className="panel">
          <h2 className="h3">Rules of use</h2>
          <p className="small"><strong>[ANA] auditor analysis — indicator, not a finding.</strong> Alone, it caps any resulting finding at High until independent evidence corroborates it.</p>
          <p className="small">Saved runs cannot be edited or deleted. An unlinked run can be linked to an engagement once. Every run and link is written to the audit log.</p>
          <p className="small muted">CSV headers are lower-cased. Quoted cells that span lines are not supported in CSV; use XLSX for those.</p>
        </aside>
      </div>
      {shown ? <Result run={shown} /> : null}
      <section style={{ marginTop: 18 }}>
        <h2 className="h3">Saved runs</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>When</th><th>Test</th><th>File</th><th>Rows</th><th>SHA-256</th><th>Engagement</th><th>By</th><th></th></tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.createdAt.slice(0, 16).replace("T", " ")}</td><td>{r.testType}</td><td>{r.inputFilename}</td><td>{r.rowCount}</td>
                  <td><code>{r.inputSha256.slice(0, 12)}</code></td>
                  <td>{r.engagementCode || (
                    <span className="row">
                      <select className="select" style={{ width: 140 }} value={shown?.id === r.id ? linkTo : ""} onChange={(e) => { void loadRunAction(r.id).then((v) => v && setShown(v)); setLinkTo(e.target.value); }}>
                        <option value="">Link…</option>
                        {data.engagements.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}
                      </select>
                      <button className="btn small" type="button" disabled={shown?.id !== r.id || !linkTo} onClick={async () => { const res = await linkRunAction(r.id, linkTo); setMsg({ ok: res.ok, text: res.ok ? res.message : res.error }); if (res.ok) { setShown(await loadRunAction(r.id)); setLinkTo(""); router.refresh(); } }}>Link</button>
                    </span>
                  )}</td>
                  <td>{r.createdBy}</td>
                  <td><button className="btn small ghost" type="button" onClick={async () => { const v = await loadRunAction(r.id); if (v) setShown(v); }}>Open</button></td>
                </tr>
              ))}
              {data.runs.length === 0 ? <tr><td colSpan={8} className="muted">No saved runs.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
