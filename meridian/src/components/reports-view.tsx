"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { getReports } from "@/lib/data";
import { buildBriefing, buildPrompt, qualityChecks, recommendedRating, stakeholderViews } from "@/lib/reports";
import { formatDate, money } from "@/lib/format";
import { Notice, Pill, useBusyRefresh } from "@/components/ui";
import { acceptModelDraft, draftWithModel, fileModelReply } from "@/server/mutations";
import type { AiStatus } from "@/lib/ai";

type Data = NonNullable<Awaited<ReturnType<typeof getReports>>>;

export function ReportsView({ data, providers }: { data: Data; providers: AiStatus }) {
  const router = useRouter();
  const [audience, setAudience] = useState("Audit committee");
  const input = useMemo(() => ({
    title: data.engagement.title,
    code: data.engagement.code,
    period: data.engagement.period,
    entityName: data.entityName,
    objective: data.engagement.objective,
    scope: data.engagement.scope,
    businessContext: data.engagement.businessContext,
    limitations: data.engagement.limitations,
    overallRating: data.engagement.overallRating,
    opinion: data.engagement.opinion,
    ratingOverrideReason: data.engagement.ratingOverrideReason,
    audience,
    materialityAmount: data.engagement.materialityAmount,
    materialityCurrency: data.engagement.materialityCurrency,
    materialityApproved: data.engagement.materialityApproved,
    gcaeApproved: data.engagement.gcaeApproved,
    findings: data.findings,
    actions: data.actions,
    tests: data.tests.map((test) => ({
      id: test.id,
      procedure: test.procedure,
      result: test.result,
      populationCount: test.populationCount,
      recordsTested: test.recordsTested,
      exceptionsCount: test.exceptionsCount,
      exposureAmount: test.exposureAmount,
      currency: test.currency,
      qaStatus: test.qaStatus,
      limitations: test.limitations,
      approvalStatus: test.approvalStatus,
    })),
  }), [data, audience]);
  const briefing = buildBriefing(input);
  const views = stakeholderViews(input);
  const checks = qualityChecks(input);
  const passed = checks.filter((check) => check.pass).length;
  const prompt = buildPrompt(input);
  const [copied, setCopied] = useState(false);
  const activeView = views.find((view) => view.heading.toLowerCase().includes(audience.split(" ")[0].toLowerCase())) || views[0];

  return (
    <div className="page">
      <p className="kicker">Report studio</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="display">Same facts. Different reader.</h1>
        <button className="btn no-print" type="button" onClick={() => window.print()}>Print briefing</button>
      </div>
      <p className="lede">
        The briefing is assembled from the file. A model may rewrite the tone. It may not add a figure, change a score, or issue the report. Connect Claude with a server key, or paste a reply from Claude.ai.
      </p>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 280 }} value={data.engagement.id} onChange={(event) => router.push(`/reports?engagement=${event.target.value}`)}>
          {data.engagements.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
        </select>
        {["Audit committee", "Executive management", "Process owner", "Risk and compliance", "Finance"].map((item) => (
          <button key={item} className={audience === item ? "btn primary small" : "btn small"} type="button" onClick={() => setAudience(item)}>{item}</button>
        ))}
      </div>
      <div className="grid-2">
        <article className="report-sheet">
          <p className="kicker">Executive briefing · {data.engagement.code}</p>
          <h2 style={{ marginTop: 8 }}>{data.engagement.title}</h2>
          <p className="small">{data.entityName} · {data.engagement.period} · Prepared by Internal Audit · Rating {data.engagement.overallRating || "not set"} · Recommended from findings: {recommendedRating(data.findings)}</p>
          <p className="small">Materiality {data.engagement.materialityAmount != null ? money(data.engagement.materialityAmount, data.engagement.materialityCurrency) : "not set"}. Issuance {data.engagement.gcaeApproved ? `approved ${formatDate(data.engagement.issuedAt)}` : "not approved"}.</p>
          {briefing.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            </section>
          ))}
          <h2>Findings at a glance</h2>
          <table className="data">
            <thead>
              <tr><th>Finding</th><th>Issue</th><th>Rating</th><th>Score</th><th>Cause</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.findings.map((finding) => (
                <tr key={finding.id}>
                  <td>{finding.code}</td>
                  <td>{finding.title}</td>
                  <td>{finding.priorityBand}</td>
                  <td>{finding.priorityScore}</td>
                  <td>{finding.rootCauseClass}</td>
                  <td>{finding.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>{activeView.heading} view</h2>
          {activeView.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <ul>{activeView.bullets?.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
        </article>
        <div className="stack no-print">
          <section className="panel">
            <h2 className="h3">Quality check · {passed}/{checks.length}</h2>
            {checks.map((check) => (
              <div key={check.id} className="check">
                <span>{check.pass ? "✓" : "–"}</span>
                <div>
                  <strong>{check.name}</strong>
                  <div className="small muted">{check.detail}</div>
                </div>
              </div>
            ))}
          </section>
          <ModelPanel data={data} providers={providers} audience={audience} prompt={prompt} />
          <section className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="h3">Prompt sent to the model</h2>
              <button
                className="btn small"
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(prompt);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="small muted">Use this if you want a language model to improve tone. It is instructed not to invent. The workbench remains the system of record.</p>
            <textarea className="textarea" readOnly value={prompt} style={{ minHeight: 280 }} />
          </section>
          <section className="panel">
            <h2 className="h3">What good looks like</h2>
            <p className="small">Every in-scope transaction follows the control, exceptions are investigated, and the population that was not tested is named. Internal Audit remains independent: it does not own the process, and it does not soften a gap to win agreement.</p>
            <Pill tone={data.engagement.gcaeApproved ? "Issued" : "pending"}>{data.engagement.gcaeApproved ? "Issued" : "Not issued"}</Pill>
          </section>
        </div>
      </div>
    </div>
  );
}

function ModelPanel({
  data,
  providers,
  audience,
  prompt,
}: {
  data: Data;
  providers: AiStatus;
  audience: string;
  prompt: string;
}) {
  const { busy, result, run } = useBusyRefresh();
  const [reply, setReply] = useState("");
  const [model, setModel] = useState("");
  const connected = [
    providers.claude ? `Claude · ${providers.claudeModel}` : "Claude not connected",
    providers.openai ? `OpenAI · ${providers.openaiModel}` : "OpenAI not connected",
    providers.compatible ? `Other · ${providers.compatibleModel || "set AI_MODEL"}` : "Other model not connected",
  ];

  return (
    <section className="panel">
      <h2 className="h3">Ask a model</h2>
      <p className="small muted">
        The key stays on the server. Connect Claude or ChatGPT from the Connect AI page. You do not edit any file. The model sees only this engagement’s file. Saving a draft does not issue the report.
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        {connected.map((item) => (
          <Pill key={item} tone={item.includes("not connected") ? "pending" : "Low"}>{item}</Pill>
        ))}
      </div>
      <label className="field">
        <span>Model id, if you need to override the server default</span>
        <input className="input" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Leave blank to use the server default" />
      </label>
      <div className="row">
        <button className="btn copper" type="button" disabled={busy || !providers.claude} onClick={() => run(() => draftWithModel({ engagementId: data.engagement.id, provider: "claude", model: model || providers.claudeModel, audience }))}>
          Draft with Claude
        </button>
        <button className="btn" type="button" disabled={busy || !providers.openai} onClick={() => run(() => draftWithModel({ engagementId: data.engagement.id, provider: "openai", model: model || providers.openaiModel, audience }))}>
          Draft with ChatGPT
        </button>
        <button className="btn" type="button" disabled={busy || !providers.gemini} onClick={() => run(() => draftWithModel({ engagementId: data.engagement.id, provider: "gemini", model: model || providers.geminiModel, audience }))}>
          Draft with Gemini
        </button>
        <button className="btn" type="button" disabled={busy || !providers.compatible} onClick={() => run(() => draftWithModel({ engagementId: data.engagement.id, provider: "compatible", model: model || providers.compatibleModel, audience }))}>
          Draft with other model
        </button>
      </div>
      <p className="small" style={{ marginTop: 10 }}>No API key? Copy the prompt, paste it into Claude.ai or another chat, then file the reply here.</p>
      <textarea className="textarea" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Paste the model reply" style={{ minHeight: 120 }} />
      <button className="btn" type="button" disabled={busy || reply.trim().length < 40} onClick={() => run(() => fileModelReply(data.engagement.id, "Claude.ai or other chat", reply))}>
        File the pasted reply
      </button>
      <Notice result={result} />
      {data.drafts.length ? <h3 className="h3" style={{ marginTop: 14 }}>Suggestions on file</h3> : null}
      {data.drafts.map((draft) => (
        <article key={draft.id} className="trace">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{draft.summary}</strong>
            <Pill tone={draft.status}>{draft.status}</Pill>
          </div>
          <p className="small muted">{draft.limitations}</p>
          <pre className="small" style={{ whiteSpace: "pre-wrap" }}>{draft.draft.slice(0, 1800)}{draft.draft.length > 1800 ? "…" : ""}</pre>
          {draft.status === "suggested" ? (
            <button className="btn small" type="button" disabled={busy} onClick={() => run(() => acceptModelDraft(draft.id))}>
              Save into opinion draft
            </button>
          ) : null}
        </article>
      ))}
      <p className="small muted">Prompt length {prompt.length.toLocaleString("en-MY")} characters. The same text is below if you want to copy it.</p>
    </section>
  );
}