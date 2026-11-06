"use client";

import { useState } from "react";
import type { getAgents } from "@/lib/data";
import { FORBIDDEN, SPECIALISTS, WORKSTREAMS, claudeConstitution } from "@/lib/specialists";
import { Notice, Pill, useBusyRefresh } from "@/components/ui";
import { runHarness } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getAgents>>;

export function HarnessPanel({
  data,
  claudeConnected,
  claudeModel,
}: {
  data: Data;
  claudeConnected: boolean;
  claudeModel: string;
}) {
  const { busy, result, run } = useBusyRefresh();
  const [engagementId, setEngagementId] = useState(data.engagements.find((item) => item.id === "eng-dc")?.id || data.engagements[0]?.id || "");
  const [copied, setCopied] = useState(false);
  const latest = data.runs.find((item) => item.skill === "end_to_end");

  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <p className="kicker">Claude harness</p>
      <h2 className="h2">End-to-end specialists, stopped by iron rules.</h2>
      <p className="small">
        The harness runs knowledge, process, evidence, testing, assurance, reporting, and kaizen in that order. Calculations stay in code. Claude, when connected, only interprets the tool packet. It cannot issue, approve materiality, close an action, or waive a rule.
      </p>
      <div className="row" style={{ margin: "10px 0" }}>
        <Pill tone={claudeConnected ? "Low" : "High"}>{claudeConnected ? `Model connected · ${claudeModel}` : "No model connected"}</Pill>
        <a className="btn small" href="/connect">Connect Claude or ChatGPT</a>
      </div>
      <div className="grid-3">
        {WORKSTREAMS.map((stream) => (
          <article key={stream.id} className="skill">
            <div className="kind-chip">{stream.name}</div>
            <p className="small">{stream.purpose}</p>
            <p className="small muted">{SPECIALISTS.filter((agent) => agent.stream === stream.id).map((agent) => agent.name).join(" · ")}</p>
          </article>
        ))}
      </div>
      <form
        className="row"
        style={{ marginTop: 12 }}
        onSubmit={async (event) => {
          event.preventDefault();
          await run(() => runHarness(engagementId));
        }}
      >
        <select className="select" style={{ maxWidth: 360 }} value={engagementId} onChange={(event) => setEngagementId(event.target.value)}>
          {data.engagements.map((item) => (
            <option key={item.id} value={item.id}>{item.code} · {item.title}</option>
          ))}
        </select>
        <button className="btn copper" disabled={busy} type="submit">{busy ? "Running specialists" : "Run harness"}</button>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(claudeConstitution());
            setCopied(true);
          }}
        >
          {copied ? "Constitution copied" : "Copy Claude constitution"}
        </button>
      </form>
      <p className="small muted">Forbidden even if Claude asks: {FORBIDDEN.join(", ")}.</p>
      <Notice result={result} />
      {latest ? (
        <div className="trace">
          <strong>{latest.summary}</strong>
          <p className="small muted">{latest.limitations}</p>
          {latest.reasoning.map((step) => (
            <div key={step.n} className="trace-step">
              <span className="num">{step.n}</span>
              <div>
                <strong>{step.title}</strong>
                <div className="small">{step.detail}</div>
              </div>
            </div>
          ))}
          {latest.output.claude ? <pre className="small" style={{ whiteSpace: "pre-wrap" }}>{latest.output.claude.slice(0, 2000)}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}