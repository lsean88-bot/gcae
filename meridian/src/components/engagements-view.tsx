import Link from "next/link";
import type { getEngagementList } from "@/lib/data";
import { Pill } from "@/components/ui";

type Data = Awaited<ReturnType<typeof getEngagementList>>;

export function EngagementsView({ data }: { data: Data }) {
  return (
    <div className="page">
      <p className="kicker">Engagements</p>
      <h1 className="display">The work, gate by gate.</h1>
      <p className="lede">An engagement is not a folder of documents. It is a sequence. Testing waits on approved materiality. Issuance waits on the GCAE.</p>
      <div className="stack">
        {data.engagements.map((engagement) => (
          <Link key={engagement.id} href={`/engagements/${engagement.id}`} className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="kicker">{engagement.code} · {engagement.entity}</div>
                <h2 className="h3" style={{ marginTop: 6 }}>{engagement.title}</h2>
              </div>
              <div className="row">
                <Pill tone={engagement.overallRating || "pending"}>{engagement.overallRating || "Not rated"}</Pill>
                <Pill tone={engagement.status}>{engagement.status}</Pill>
              </div>
            </div>
            <p className="small">{engagement.objective}</p>
            <div className="row">
              <span className="small muted">Stage {engagement.stage} · {engagement.gate.stageName}</span>
              <span className="small muted">Lead {engagement.lead}</span>
              <span className="small muted">{engagement.findings} findings</span>
              <span className="small muted">{engagement.period}</span>
              {engagement.gate.canAdvance ? <Pill tone="Low">Gate open</Pill> : <Pill tone="High">Held</Pill>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}