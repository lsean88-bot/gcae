"use client";

import { useState } from "react";
import type { getKaizen } from "@/lib/data";
import { Field, Notice, Pill, useBusyRefresh } from "@/components/ui";
import { decideLesson } from "@/server/mutations";

type Data = Awaited<ReturnType<typeof getKaizen>>;

export function KaizenView({ data }: { data: Data }) {
  const [area, setArea] = useState("All");
  const areas = ["All", ...new Set(data.lessons.map((lesson) => lesson.area))];
  const rows = data.lessons.filter((lesson) => area === "All" || lesson.area === area);
  return (
    <div className="page">
      <p className="kicker">Kaizen</p>
      <h1 className="display">Improve the next audit. Do not weaken the rule.</h1>
      <p className="lede">
        A lesson is a proposed change in how the team works. It can make a gate stricter. It cannot waive an iron rule, skip evidence, or let an agent issue a report. The GCAE or the audit manager accepts it.
      </p>
      <div className="filters">
        {areas.map((item) => (
          <button key={item} className={area === item ? "btn primary small" : "btn small"} type="button" onClick={() => setArea(item)}>{item}</button>
        ))}
      </div>
      <div className="stack">
        {rows.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)}
      </div>
    </div>
  );
}

function LessonCard({ lesson }: { lesson: Data["lessons"][number] }) {
  const { busy, result, run } = useBusyRefresh();
  return (
    <article className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="kicker">{lesson.area} · {lesson.engagement}</span>
          <h2 className="h3">{lesson.title}</h2>
        </div>
        <Pill tone={lesson.status === "accepted" ? "Low" : lesson.status === "rejected" ? "Fail" : "pending"}>{lesson.status}</Pill>
      </div>
      <p className="small"><strong>What we saw. </strong>{lesson.observation}</p>
      <p className="small"><strong>Change. </strong>{lesson.change}</p>
      <p className="small"><strong>Iron rule it must keep. </strong>{lesson.ironRule}</p>
      {lesson.decisionNote ? <p className="small muted">{lesson.decisionNote}</p> : null}
      <Notice result={result} />
      {lesson.status === "proposed" ? (
        <form
          className="row"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const decision = String(form.get("decision")) === "rejected" ? "rejected" : "accepted";
            await run(() => decideLesson(lesson.id, decision, String(form.get("note") || "")));
          }}
        >
          <Field label="Decision note"><input className="input" name="note" placeholder="Why this tightens, or why it does not" /></Field>
          <button className="btn copper" name="decision" value="accepted" disabled={busy} type="submit">Accept</button>
          <button className="btn danger" name="decision" value="rejected" disabled={busy} type="submit">Reject</button>
        </form>
      ) : null}
    </article>
  );
}