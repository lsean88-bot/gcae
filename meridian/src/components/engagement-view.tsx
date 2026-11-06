"use client";

import Link from "next/link";
import { useState } from "react";
import type { getEngagement } from "@/lib/data";
import { formatDate, money } from "@/lib/format";
import { STAGES } from "@/lib/methodology";
import { Field, Notice, Pill, outcomeTone, useBusyRefresh } from "@/components/ui";
import {
  advanceStage,
  approveMateriality,
  checkSufficiency,
  issueReport,
  proposeMateriality,
  runScreener,
  saveOpinion,
  updatePbc,
} from "@/server/mutations";

type Data = NonNullable<Awaited<ReturnType<typeof getEngagement>>>;

export function EngagementView({ data }: { data: Data }) {
  const [tab, setTab] = useState("Overview");
  const { busy, result, run } = useBusyRefresh();
  const engagement = data.engagement;
  const tabs = ["Overview", "Evidence", "Tests", "Findings", "Actions", "Requests", "Gates"];
  return (
    <div className="page">
      <p className="kicker">{engagement.code} · {data.entity?.name} · {engagement.period}</p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h1 className="display" style={{ fontSize: "clamp(32px, 4vw, 46px)" }}>{engagement.title}</h1>
        <div className="row">
          <Pill tone={engagement.overallRating || "pending"}>{engagement.overallRating || "Not rated"}</Pill>
          <Pill tone={engagement.status}>{engagement.status}</Pill>
        </div>
      </div>
      <p className="lede">{engagement.objective}</p>
      <Notice result={result} />
      <div className="tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? "tab on" : "tab"} type="button" onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Overview" ? <Overview data={data} busy={busy} run={run} /> : null}
      {tab === "Evidence" ? <EvidenceList data={data} /> : null}
      {tab === "Tests" ? <Tests data={data} /> : null}
      {tab === "Findings" ? <Findings data={data} /> : null}
      {tab === "Actions" ? <Actions data={data} /> : null}
      {tab === "Requests" ? <Requests data={data} busy={busy} run={run} /> : null}
      {tab === "Gates" ? <Gates data={data} busy={busy} run={run} /> : null}
    </div>
  );
}

function Overview({ data, busy, run }: { data: Data; busy: boolean; run: ReturnType<typeof useBusyRefresh>["run"] }) {
  const engagement = data.engagement;
  return (
    <div className="grid-2">
      <section className="panel">
        <h2 className="h3">Business context</h2>
        <p>{engagement.businessContext}</p>
        <p className="small"><strong>Scope. </strong>{engagement.scope}</p>
        <p className="small"><strong>Appetite. </strong>{engagement.riskAppetite || "Not recorded."}</p>
        <p className="small"><strong>Limitations. </strong>{engagement.limitations || "None recorded."}</p>
        <p className="small"><strong>Lead. </strong>{data.lead} · Audience: {engagement.audience}</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await run(() => saveOpinion(
              engagement.id,
              String(form.get("opinion") || ""),
              String(form.get("rating") || ""),
              String(form.get("reason") || ""),
            ));
          }}
        >
          <Field label="Opinion draft">
            <textarea className="textarea" name="opinion" defaultValue={engagement.opinion || ""} />
          </Field>
          <div className="split">
            <Field label="Rating on file">
              <select className="select" name="rating" defaultValue={engagement.overallRating || ""}>
                <option value="">Not set</option>
                {["Satisfactory", "Low", "Medium", "High", "Critical"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Reason if this differs from the highest finding">
              <input className="input" name="reason" defaultValue={engagement.ratingOverrideReason || ""} />
            </Field>
          </div>
          <button className="btn" disabled={busy} type="submit">Save draft</button>
        </form>
      </section>
      <section className="stack">
        <div className="panel">
          <h2 className="h3">Materiality</h2>
          <p className="small">
            {engagement.materialityAmount != null
              ? money(engagement.materialityAmount, engagement.materialityCurrency)
              : "No amount proposed."}{" "}
            {engagement.materialityApproved ? "Approved." : "Not approved."}
          </p>
          <p className="small muted">Thresholds: {JSON.stringify(engagement.thresholdJson || {})}</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const thresholds: Record<string, number> = {};
              const raw = String(form.get("thresholds") || "");
              raw.split(",").forEach((pair) => {
                const [key, value] = pair.split("=").map((part) => part.trim());
                if (key && value && !Number.isNaN(Number(value))) thresholds[key] = Number(value);
              });
              await run(() => proposeMateriality(engagement.id, Number(form.get("amount")), String(form.get("currency") || "MYR"), thresholds));
            }}
          >
            <div className="split">
              <Field label="Amount"><input className="input" name="amount" type="number" defaultValue={engagement.materialityAmount ?? ""} /></Field>
              <Field label="Currency"><input className="input" name="currency" defaultValue={engagement.materialityCurrency} /></Field>
            </div>
            <Field label="Thresholds, key=value">
              <input className="input" name="thresholds" placeholder="amount=50000, pct=2" defaultValue={Object.entries(engagement.thresholdJson || {}).map(([key, value]) => `${key}=${value}`).join(", ")} />
            </Field>
            <Field label="Why this materiality is appropriate">
              <input className="input" name="approvalNote" placeholder="Required only when the GCAE approves" />
            </Field>
            <div className="row">
              <button className="btn" disabled={busy} type="submit">Propose</button>
              <button
                className="btn copper"
                type="button"
                disabled={busy}
                onClick={async (event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  const note = String(new FormData(form).get("approvalNote") || "");
                  await run(() => approveMateriality(engagement.id, note));
                }}
              >
                GCAE approves
              </button>
            </div>
          </form>
        </div>
        <div className="panel">
          <h2 className="h3">Controls in this entity</h2>
          {data.controls.map((control) => (
            <p key={control.id} className="small"><strong>{control.title}</strong> · design {control.designEffectiveness} · operating {control.operatingEffectiveness}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

function EvidenceList({ data }: { data: Data }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Id</th><th>Source</th><th>Reliability</th><th>Completeness</th><th>Hash</th><th>Limitation</th></tr>
        </thead>
        <tbody>
          {data.evidence.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.id}</strong><div className="small muted">{item.originalFilename}</div></td>
              <td>{item.sourceSystem}<div className="small muted">{item.documentType} · {item.recordCount} rows</div></td>
              <td><Pill tone={item.reliability}>{item.reliability}</Pill></td>
              <td><Pill tone={item.completeness}>{item.completeness}</Pill></td>
              <td className="mono">{item.fileHash.slice(0, 12)}</td>
              <td className="small">{item.limitations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tests({ data }: { data: Data }) {
  return (
    <div className="stack">
      <div className="row">
        <Link className="btn copper" href={`/testing?engagement=${data.engagement.id}`}>Run a procedure</Link>
        <span className="small muted">Procedures read registered evidence. They do not edit it.</span>
      </div>
      {data.tests.map((test) => (
        <article key={test.id} className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{test.procedure.replaceAll("_", " ")}</strong>
            <div className="row">
              <Pill tone={outcomeTone(test.result)}>{test.result}</Pill>
              <Pill tone={test.qaStatus}>QA {test.qaStatus}</Pill>
              <Pill tone={test.approvalStatus}>{test.approvalStatus}</Pill>
            </div>
          </div>
          <p className="small">{test.populationDefinition}</p>
          <p className="small muted">Tested {test.recordsTested} of stated population {test.populationCount}. Exceptions {test.exceptionsCount}. Exposure {money(test.exposureAmount, test.currency || "MYR")}. Parameter hash {test.parameterHash}.</p>
          <p className="small">{test.workpaper.narrative}</p>
          <Link href={`/testing?run=${test.id}`}>Open workpaper</Link>
        </article>
      ))}
      {data.tests.length === 0 ? <p>No procedure has been run. If materiality is unapproved, that is the gate, not an oversight.</p> : null}
    </div>
  );
}

function Findings({ data }: { data: Data }) {
  return (
    <div className="stack">
      {data.findings.map((finding) => (
        <Link key={finding.id} href={`/findings/${finding.id}`} className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{finding.code} · {finding.title}</strong>
            <Pill tone={finding.priorityBand}>{finding.priorityBand} · {finding.priorityScore}</Pill>
          </div>
          <p className="small">{finding.condition}</p>
          <p className="small muted">Cause: {finding.rootCause}</p>
        </Link>
      ))}
      {data.findings.length === 0 ? <p>No finding. That is not a satisfactory opinion.</p> : null}
    </div>
  );
}

function Actions({ data }: { data: Data }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>Validation</th></tr></thead>
        <tbody>
          {data.actions.map((action) => (
            <tr key={action.id}>
              <td>{action.agreedAction}<div className="small muted">{action.interimControl}</div></td>
              <td>{action.owner}</td>
              <td>{formatDate(action.revisedDue || action.originalDue)}</td>
              <td><Pill tone={action.status}>{action.status}</Pill></td>
              <td>{action.validationStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Requests({ data, busy, run }: { data: Data; busy: boolean; run: ReturnType<typeof useBusyRefresh>["run"] }) {
  return (
    <div className="stack">
      {data.pbc.map((item) => (
        <article key={item.id} className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{item.item}</strong>
            <Pill tone={item.status}>{item.status}</Pill>
          </div>
          <p className="small muted">Owner {item.owner} · due {formatDate(item.due)} · evidence {item.evidenceId || "not linked"}</p>
          <p className="small">{item.sufficiencyNote || "No sufficiency note yet."}</p>
          <div className="row">
            <button className="btn small" type="button" disabled={busy} onClick={() => run(() => checkSufficiency(item.id))}>Check sufficiency</button>
            <button className="btn small" type="button" disabled={busy} onClick={() => run(() => updatePbc(item.id, "Received", "Marked received by the acting person. Sufficiency is a separate check."))}>Mark received</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function Gates({ data, busy, run }: { data: Data; busy: boolean; run: ReturnType<typeof useBusyRefresh>["run"] }) {
  const engagement = data.engagement;
  return (
    <div className="stack">
      <div className="banner">
        <div>
          <strong>Next gate.</strong>
          <div className="small">{data.gate.blockers[0] || "The recorded gate is met. A person can move the stage."}</div>
        </div>
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={() => run(() => runScreener(engagement.id))}>Ask the screener</button>
          <button className="btn copper" type="button" disabled={busy || !data.gate.canAdvance} onClick={() => run(() => advanceStage(engagement.id))}>Advance stage</button>
        </div>
      </div>
      <div className="stages">
        {STAGES.map((stage) => (
          <div key={stage.n} className={stage.n === engagement.stage ? "stage on" : "stage"}>
            <div className="n">{stage.n}</div>
            <p><strong>{stage.name}</strong><br />{stage.gate}</p>
          </div>
        ))}
      </div>
      {engagement.stage >= 7 && engagement.status !== "Issued" ? (
        <form
          className="panel"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await run(() => issueReport(engagement.id, form.get("ack") === "on", String(form.get("note") || "")));
          }}
        >
          <h2 className="h3">Issue the report</h2>
          <p className="small">Only the GCAE can do this. QA must be cleared. Limitations stay in the file.</p>
          <label className="row small"><input type="checkbox" name="ack" /> I have read the limitations and the untested population.</label>
          <Field label="Issuance note"><textarea className="textarea" name="note" required /></Field>
          <button className="btn primary" disabled={busy} type="submit">Issue under my name</button>
        </form>
      ) : null}
      {engagement.status === "Issued" ? <div className="note ok">Issued {formatDate(engagement.issuedAt)} by GCAE approval. The assembler did not issue it.</div> : null}
    </div>
  );
}