"use client";

import { useState } from "react";
import type { getAgents } from "@/lib/data";
import { AGENTS, AUTHORITY_MATRIX, IRON_RULES, LAYERS, PRINCIPLES } from "@/lib/methodology";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { decideAgentRun, runScreener } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getAgents>>;

export function AgentsView({ data, embedded = false }: { data: Data; embedded?: boolean }) {
  const [layer, setLayer] = useState("Execution");
  const [skill, setSkill] = useState("tester");
  const selected = AGENTS.find((agent) => agent.id === skill) || AGENTS[0];
  const { busy, result, run } = useBusyRefresh();
  return (
    <div className={embedded ? "" : "page"}>
      <p className="kicker">Agent brain · reviewer-first</p>
      <h1 className="display">A procedure with a stop, not a chat that guesses.</h1>
      <p className="lede">
        Optro’s public model is a system of record plus agents that collect evidence, run attribute tests, and draft cited workpapers, while people govern and approve. Meridian uses that pattern without copying a vendor. Calculations are code. Drafting is a template. A missing fact stays missing.
      </p>
      <Notice result={result} />
      <div className="grid-2">
        <section className="panel">
          <h2 className="h3">Five layers</h2>
          {LAYERS.map((item) => (
            <button key={item.id} className="layer" type="button" onClick={() => setLayer(item.id)} style={{ width: "100%", textAlign: "left", background: layer === item.id ? "#fff6f0" : "transparent", borderRight: 0, borderTop: 0, borderBottom: 0 }}>
              <strong>{item.id}</strong>
              <div className="small">{item.summary}</div>
            </button>
          ))}
        </section>
        <section className="panel">
          <h2 className="h3">How a run thinks</h2>
          <ol className="small">
            <li>Screener classifies the request and stops if scope, criteria, or authority is missing.</li>
            <li>One specialist is called. It sees the evidence and the approved parameters, not a licence to improvise.</li>
            <li>QA, when the result is material, recalculates before it is shown the first conclusion.</li>
            <li>The output is a suggestion with its inputs, limits, and hash.</li>
            <li>A person accepts, amends, or rejects. The log stores before, after, and who.</li>
          </ol>
          <p className="small muted">A language model is optional, and only for tone. Report studio calls Claude or another model from the server when a key is set, or you paste a reply from Claude.ai. The draft is a suggestion. It cannot change a score or issue the report.</p>
          <form
            className="row"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await run(() => runScreener(String(form.get("engagementId"))));
            }}
          >
            <select className="select" name="engagementId" style={{ maxWidth: 280 }}>
              {data.engagements.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
            </select>
            <button className="btn copper" disabled={busy} type="submit">Run screener</button>
          </form>
        </section>
      </div>
      <div className="grid-3" style={{ marginTop: 14 }}>
        {AGENTS.filter((agent) => agent.layer === layer).map((agent) => (
          <button key={agent.id} className={skill === agent.id ? "skill on" : "skill"} type="button" onClick={() => setSkill(agent.id)}>
            <div className="kind-chip">{agent.effort}</div>
            <strong>{agent.name}</strong>
            <p className="small">{agent.purpose}</p>
          </button>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h3">{selected.name}</h2>
          <Pill>{selected.layer}</Pill>
        </div>
        <div className="split">
          <div>
            <p className="small"><strong>May.</strong> {selected.may.join(" ")}</p>
            <p className="small"><strong>Must not.</strong> {selected.mustNot.join(" ")}</p>
          </div>
          <p className="small"><strong>Human gate.</strong> {selected.gate}</p>
        </div>
      </section>
      <section style={{ marginTop: 18 }}>
        <h2 className="h3">Suggestions waiting</h2>
        <div className="stack">
          {data.runs.filter((item) => item.status === "suggested").map((item) => (
            <article key={item.id} className="panel">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <span className="kicker">{item.agent} · {item.skill}</span>
                  <h3 className="h3">{item.summary}</h3>
                </div>
                <Pill tone="pending">{item.status}</Pill>
              </div>
              {item.reasoning.map((step) => (
                <div key={step.n} className="trace-step">
                  <span className="num">{step.n}</span>
                  <div>
                    <span className="kind-chip">{step.kind}</span>
                    <strong> {step.title}</strong>
                    <div className="small">{step.detail}</div>
                  </div>
                </div>
              ))}
              {item.limitations ? <p className="small muted">{item.limitations}</p> : null}
              <Decision runId={item.id} busy={busy} run={run} />
            </article>
          ))}
          {data.runs.every((item) => item.status !== "suggested") ? <p>No suggestion is waiting.</p> : null}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2 className="h3">Who may decide</h2>
        <div className="table-wrap" style={{ border: 0 }}>
          <table className="data">
            <thead><tr><th>Responsibility</th><th>Orchestrator</th><th>Specialist</th><th>GCAE</th></tr></thead>
            <tbody>
              {AUTHORITY_MATRIX.map((row) => (
                <tr key={row.responsibility}>
                  <td>{row.responsibility}</td>
                  <td>{row.orchestrator}</td>
                  <td>{row.specialist}</td>
                  <td>{row.gcae}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid-2" style={{ marginTop: 18 }}>
        <section className="panel">
          <h2 className="h3">Five principles</h2>
          {PRINCIPLES.map((item) => (
            <p key={item.title} className="small"><strong>{item.title}.</strong> {item.text}</p>
          ))}
        </section>
        <section className="panel">
          <h2 className="h3">Iron rules</h2>
          <ol className="small">
            {IRON_RULES.map((rule) => <li key={rule}>{rule}</li>)}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Decision({ runId, busy, run }: { runId: string; busy: boolean; run: ReturnType<typeof useBusyRefresh>["run"] }) {
  return (
    <form
      className="row"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await run(() => decideAgentRun(runId, String(form.get("decision")) as "approved" | "rejected", String(form.get("note") || "")));
      }}
    >
      <Field label="Note">
        <input className="input" name="note" placeholder="Why you accept or reject" />
      </Field>
      <select className="select" name="decision" style={{ maxWidth: 160 }}>
        <option value="approved">Accept</option>
        <option value="rejected">Reject</option>
      </select>
      <button className="btn" disabled={busy} type="submit">Decide</button>
    </form>
  );
}