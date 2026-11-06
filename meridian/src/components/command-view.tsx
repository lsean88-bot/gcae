import Link from "next/link";
import type { getDashboard } from "@/lib/data";
import { formatDate } from "@/lib/format";

type Data = Awaited<ReturnType<typeof getDashboard>>;

export function CommandView({ data }: { data: Data }) {
  const first = data.actor.name.split(" ")[0];
  const waiting = data.decisions.length;
  const covered = data.entities.filter((entity) => entity.coverage === "In progress" || entity.coverage === "Covered").length;
  const pct = Math.round((covered / Math.max(data.entities.length, 1)) * 100);
  return (
    <div className="page">
      <p className="kicker">Command · {data.actor.role}</p>
      <h1 className="display">{waiting ? `${first}, ${waiting} decisions are waiting on a person.` : `${first}, the queue is clear.`}</h1>
      <p className="lede">
        Agents can test, score, and draft. They cannot invent a fact, approve a rating, or issue a report. You are acting as {data.actor.name}. Switch the role in the header to see what that authority can and cannot do.
      </p>
      <div className="grid-4" style={{ marginBottom: 18 }}>
        {data.kpis.map((kpi) => (
          <article key={kpi.label} className={`panel stat ${kpi.tone}`}>
            <div className="label">{kpi.label}</div>
            <div className="value">{kpi.value}</div>
            <div className="small muted">{kpi.hint}</div>
          </article>
        ))}
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h2">What needs a decision</h2>
            <Link href="/agents" className="btn small">Open the brain</Link>
          </div>
          <div style={{ marginTop: 8 }}>
            {data.decisions.map((item, index) => (
              <Link key={item.id} href={item.href} className="decision">
                <span className="num">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <span className="kind">{item.kind}</span>
                  <strong>{item.title}</strong>
                  <span className="small muted">{item.detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <div className="stack">
          <section className="panel">
            <h2 className="h3">Universe coverage</h2>
            <div className="arc-wrap">
              <CoverageArc pct={pct} />
              <div className="arc-copy">
                <strong>{covered} of {data.entities.length}</strong> entities are in fieldwork or covered this cycle. {data.coverage.gap} have no recent audit. A planning score is a suggestion, not an opinion.
              </div>
            </div>
          </section>
          <section className="panel">
            <h2 className="h3">Residual heat</h2>
            <div className="heat">
              {data.entities.map((entity) => (
                <Link key={entity.id} href="/universe" className={`h${entity.residualRisk}`}>
                  <strong>{entity.code}</strong>
                  <div className="small">{entity.coverage} · residual {entity.residualRisk}</div>
                  <div className="small muted">{entity.openFindings} open findings</div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2 className="h3">Evidence-to-assurance pipeline</h2>
        <p className="small muted">Seven gates. A stage does not move because an agent finished a task. It moves when the gate evidence is on file.</p>
        <div className="stages" style={{ marginTop: 10 }}>
          {data.pipeline.map((stage) => (
            <div key={stage.n} className={stage.count ? "stage on" : "stage"}>
              <div className="n">{stage.count}</div>
              <p><strong>{stage.n}. {stage.name}</strong></p>
            </div>
          ))}
        </div>
      </section>
      <div className="grid-2" style={{ marginTop: 18 }}>
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="h3">Actions past their date</h2>
            <Link href="/actions" className="btn small">Tracker</Link>
          </div>
          <div className="table-wrap" style={{ marginTop: 10, border: 0 }}>
            <table className="data">
              <thead>
                <tr><th>Finding</th><th>Action</th><th>Owner</th><th>Due</th></tr>
              </thead>
              <tbody>
                {data.overdue.map((action) => (
                  <tr key={action.id}>
                    <td>{action.finding}</td>
                    <td>{action.agreedAction}</td>
                    <td>{action.owner}</td>
                    <td>{formatDate(action.revisedDue || action.originalDue)}</td>
                  </tr>
                ))}
                {data.overdue.length === 0 ? <tr><td colSpan={4}>No open action is past its date.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2 className="h3">Outside appetite</h2>
          {data.risks.map((risk) => (
            <div key={risk.id} className="trace">
              <span className="pill Outside">Outside</span>
              <strong style={{ marginLeft: 8 }}>{risk.title}</strong>
              <p className="small muted">{risk.statement}</p>
            </div>
          ))}
          <div className="trace">
            <h2 className="h3">Latest log</h2>
            {data.events.map((event) => (
              <p key={event.id} className="small"><strong>{event.actor}</strong> · {event.action} · {event.detail}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CoverageArc({ pct }: { pct: number }) {
  const r = 46;
  const c = Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="140" height="86" viewBox="0 0 140 86" aria-label={`${pct} percent coverage`}>
      <path d="M16 74 A54 54 0 0 1 124 74" fill="none" stroke="#eadfD2" strokeWidth="8" strokeLinecap="round" />
      <path d="M16 74 A54 54 0 0 1 124 74" fill="none" stroke="#c4622d" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
      <text x="70" y="68" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="26" fill="#1b1714">{pct}%</text>
    </svg>
  );
}