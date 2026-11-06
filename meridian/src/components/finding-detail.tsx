import Link from "next/link";
import type { getFinding } from "@/lib/data";
import { IMPACT_DIMENSIONS } from "@/lib/methodology";
import { formatDate } from "@/lib/format";
import { Pill } from "@/components/ui";

type Data = NonNullable<Awaited<ReturnType<typeof getFinding>>>;

export function FindingDetail({ data }: { data: Data }) {
  const finding = data.finding;
  const dimension = IMPACT_DIMENSIONS.find((item) => item.id === finding.highestDimension)?.label || finding.highestDimension;
  return (
    <div className="page">
      <p className="kicker">{data.engagement?.code} · {finding.code}</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="display" style={{ fontSize: "clamp(30px, 4vw, 46px)" }}>{finding.title}</h1>
        <Pill tone={finding.priorityBand}>{finding.priorityBand} · {finding.priorityScore}</Pill>
      </div>
      <p className="lede">Likelihood {finding.likelihood} × highest impact {finding.highestImpact} on {dimension}. {finding.likelihoodRationale}</p>
      <div className="grid-2">
        <article className="report-sheet">
          <Section n="1" title="Criteria" body={finding.criteria} />
          <Section n="2" title="Condition" body={finding.condition} />
          <Section n="3" title="Why it matters" body={finding.residualRisk} />
          <p className="small"><strong>Quantified impact. </strong>{finding.quantifiedImpact || "Not quantified."}</p>
          <Section n="4" title="Root cause" body={finding.rootCause} />
          <p className="small"><strong>Symptom. </strong>{finding.symptom}</p>
          <p className="small"><strong>Immediate cause. </strong>{finding.immediateCause}</p>
          <p className="small"><strong>Class. </strong>{finding.rootCauseClass} · {finding.rootCauseTheme} · {finding.isolatedOrRecurring}</p>
          <ol>
            {finding.fiveWhys.map((why, index) => <li key={index}>{why}</li>)}
          </ol>
          <Section n="5" title="Value of addressing it" body={finding.businessValue} />
          <Section n="6" title="Recommendation" body={finding.recommendation} />
          <p className="small"><strong>Expected outcome. </strong>{finding.expectedOutcome}</p>
          <p className="small"><strong>Management. </strong>{finding.managementPosition}</p>
        </article>
        <div className="stack">
          <section className="panel">
            <h2 className="h3">Impact matrix</h2>
            {IMPACT_DIMENSIONS.map((item) => {
              const cell = finding.impacts[item.id];
              if (!cell?.relevant) return null;
              return (
                <p key={item.id} className="small"><strong>{cell.score} · {item.label}.</strong> {cell.note}</p>
              );
            })}
          </section>
          <section className="panel">
            <h2 className="h3">Trace</h2>
            <p className="small">Evidence {finding.evidenceIds}</p>
            <p className="small">Test {finding.testRunId || "Not raised from a procedure."}</p>
            <p className="small">Control {data.control?.title || "Not linked."}</p>
            {data.evidence.map((item) => (
              <p key={item.id} className="small mono">{item.id} · {item.fileHash.slice(0, 12)} · {item.reliability}</p>
            ))}
            <Link href={`/engagements/${finding.engagementId}`}>Back to the engagement</Link>
          </section>
          <section className="panel">
            <h2 className="h3">Actions</h2>
            {data.actions.map((action) => (
              <p key={action.id} className="small"><strong>{action.owner}.</strong> {action.agreedAction} Due {formatDate(action.revisedDue || action.originalDue)}. {action.status}.</p>
            ))}
            {data.actions.length === 0 ? <p className="small">No action on file.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <section>
      <h2>{n}. {title}</h2>
      <p>{body}</p>
    </section>
  );
}