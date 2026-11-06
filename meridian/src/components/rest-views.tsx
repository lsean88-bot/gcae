"use client";

import { useState } from "react";
import type { getCompliance, getGovernance, getLog, getVendors, searchAll } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { saveVendorAction, updateAiSystem } from "@/server/mutations";

type Compliance = Awaited<ReturnType<typeof getCompliance>>;
type Vendors = Awaited<ReturnType<typeof getVendors>>;
type Governance = Awaited<ReturnType<typeof getGovernance>>;
type Log = Awaited<ReturnType<typeof getLog>>;
type Search = Awaited<ReturnType<typeof searchAll>>;

export function ComplianceView({ data }: { data: Compliance }) {
  const [framework, setFramework] = useState(data.frameworks[0]?.id || "");
  const rows = data.requirements.filter((item) => item.frameworkId === framework);
  return (
    <div className="page">
      <p className="kicker">Control map</p>
      <h1 className="display">Test once. See every theme it serves.</h1>
      <p className="lede">Mappings are the group’s own statements, not the text of a standard. A control linked to a theme is not a certification.</p>
      <div className="tabs">
        {data.frameworks.map((item) => (
          <button key={item.id} className={framework === item.id ? "tab on" : "tab"} type="button" onClick={() => setFramework(item.id)}>{item.shortName}</button>
        ))}
      </div>
      <p className="small muted">{data.frameworks.find((item) => item.id === framework)?.description}</p>
      <div className="stack">
        {rows.map((row) => (
          <article key={row.id} className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{row.code} · {row.title}</strong>
              <Pill tone={row.controls.some((control) => control && control.operatingEffectiveness === "Exception") ? "High" : "Low"}>
                {row.controls.length ? `${row.controls.length} controls` : "Unmapped"}
              </Pill>
            </div>
            <p className="small">{row.statement}</p>
            {row.controls.map((control) => control ? (
              <p key={control.id} className="small muted">{control.title} · design {control.designEffectiveness} · operating {control.operatingEffectiveness}</p>
            ) : null)}
          </article>
        ))}
      </div>
    </div>
  );
}

export function VendorsView({ data }: { data: Vendors }) {
  const { busy, result, run } = useBusyRefresh();
  return (
    <div className="page">
      <p className="kicker">Third parties</p>
      <h1 className="display">Tier from the written rule. A person accepts it.</h1>
      <p className="lede">Production-critical operations technology is tier 1 even without personal data. A missing SOC report is disclosed. It is not a clean bill, and it is not a finding by itself.</p>
      <Notice result={result} />
      <div className="stack">
        {data.vendors.map((vendor) => (
          <article key={vendor.id} className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <h2 className="h3">{vendor.name}</h2>
                <p className="small">{vendor.service} · {vendor.dataAccess} · criticality {vendor.criticality}</p>
              </div>
              <div className="row">
                <Pill tone={vendor.tier === "1" ? "High" : "Low"}>Tier {vendor.tier}</Pill>
                <Pill tone={vendor.tierStatus}>{vendor.tierStatus}</Pill>
              </div>
            </div>
            <p className="small">{vendor.tierRationale}</p>
            <p className="small muted">Suggested tier {vendor.suggestedTier || "—"}. SOC: {vendor.socReport}. Next review {formatDate(vendor.nextReview)}. Owner {vendor.owner}.</p>
            {vendor.notes ? <p className="small">{vendor.notes}</p> : null}
          </article>
        ))}
      </div>
      <form
        className="panel"
        style={{ marginTop: 16 }}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await run(() => saveVendorAction({
            name: String(form.get("name") || ""),
            service: String(form.get("service") || ""),
            dataAccess: String(form.get("dataAccess") || ""),
            criticality: String(form.get("criticality") || "Medium"),
            ownerId: String(form.get("ownerId") || ""),
          }));
        }}
      >
        <h2 className="h3">Add a vendor and apply the tier rule</h2>
        <div className="split">
          <Field label="Name"><input className="input" name="name" required /></Field>
          <Field label="Service"><input className="input" name="service" required /></Field>
          <Field label="Data or system access"><input className="input" name="dataAccess" required /></Field>
          <Field label="Criticality">
            <select className="select" name="criticality">{["High", "Medium", "Low"].map((item) => <option key={item}>{item}</option>)}</select>
          </Field>
          <Field label="Owner">
            <select className="select" name="ownerId">{data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          </Field>
        </div>
        <button className="btn copper" disabled={busy} type="submit">Suggest a tier</button>
      </form>
    </div>
  );
}

export function GovernanceView({ data }: { data: Governance }) {
  const { busy, result, run } = useBusyRefresh();
  return (
    <div className="page">
      <p className="kicker">AI governance</p>
      <h1 className="display">The tools are on the register, including this one.</h1>
      <p className="lede">Internal ratings are not a legal classification. A high rating means a person should look before the output is treated as a record. Meridian’s own procedures are listed so the register is not only other people’s tools.</p>
      <Notice result={result} />
      <div className="stack">
        {data.systems.map((system) => (
          <article key={system.id} className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="h3">{system.name}</h2>
              <div className="row">
                <Pill tone={system.riskLevel === "High" ? "High" : "Low"}>{system.riskLevel}</Pill>
                <Pill tone={system.status}>{system.status}</Pill>
              </div>
            </div>
            <p className="small">{system.purpose}</p>
            <p className="small muted">{system.modelType} · {system.dataClass} · owner {system.owner}</p>
            <p className="small"><strong>Oversight. </strong>{system.humanOversight}</p>
            <p className="small">{system.reviewNote}</p>
            <form
              className="row"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await run(() => updateAiSystem(system.id, String(form.get("status")), String(form.get("note") || "")));
              }}
            >
              <select className="select" name="status" defaultValue={system.status} style={{ maxWidth: 220 }}>
                {["Approved for use", "Approved with conditions", "Review open", "Not approved", "Paused"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <input className="input" name="note" placeholder="Reason for the status" />
              <button className="btn small" disabled={busy} type="submit">Update</button>
            </form>
          </article>
        ))}
      </div>
    </div>
  );
}

export function LogView({ data }: { data: Log }) {
  return (
    <div className="page">
      <p className="kicker">Audit log</p>
      <h1 className="display">Who changed what, and the state before.</h1>
      <p className="lede">Agent actions and human decisions sit in the same log. A suggestion is not a change until a person accepts it.</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>When</th><th>Actor</th><th>Action</th><th>Object</th><th>Before</th><th>After</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id}>
                <td>{formatDate(event.at)}</td>
                <td>{event.actor}</td>
                <td>{event.action}</td>
                <td className="mono">{event.objectType} {event.objectId}</td>
                <td>{event.beforeState || "—"}</td>
                <td>{event.afterState || "—"}</td>
                <td>{event.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SearchView({ data }: { data: Search }) {
  return (
    <div className="page">
      <p className="kicker">Search</p>
      <h1 className="display">{data.q ? `Results for “${data.q}”` : "Search the file."}</h1>
      <div className="stack">
        {data.results.map((item) => (
          <a key={`${item.kind}-${item.title}`} href={item.href} className="panel">
            <span className="kicker">{item.kind}</span>
            <h2 className="h3">{item.title}</h2>
            <p className="small muted">{item.detail}</p>
          </a>
        ))}
        {data.q && data.results.length === 0 ? <p>Nothing on file matches that.</p> : null}
      </div>
    </div>
  );
}
