import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  actions,
  agentRuns,
  aiSystems,
  auditEvents,
  controls,
  engagementAccess,
  engagements,
  entities,
  evidence,
  findings,
  frameworks,
  lessons,
  pbcRequests,
  people,
  requirements,
  risks,
  testRuns,
  vendors,
} from "@/db/schema";
import { canAdvance, gateBlockers } from "@/lib/gates";
import { effectiveDue, isOverdue } from "@/lib/format";
import { STAGES } from "@/lib/methodology";
import { ensureSeed } from "@/lib/seed";

export async function getActor() {
  const { getSessionActor } = await import("@/server/session");
  const person = await getSessionActor();
  if (!person) throw new Error("Sign in required.");
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    team: person.team,
    email: person.email,
    authority: person.authority,
    mustChangePassword: person.mustChange,
  };
}

export async function bundle() {
  await ensureSeed();
  // Server-side gate for every data read. The layout check alone is not a guarantee in Next.js.
  const { getSessionActor } = await import("@/server/session");
  const signedIn = await getSessionActor();
  if (!signedIn || signedIn.mustChange) throw new Error("Sign in required.");
  return bundleFor(signedIn);
}

/** Every UI read goes through here. Exported so UAT can run the same path for a chosen person. */
export async function bundleFor(signedIn: { id: string; authority: string }) {
  const [
    peopleRows,
    entityRows,
    allEngagementRows,
    allEvidenceRows,
    controlRows,
    riskRows,
    allFindingRows,
    allActionRows,
    allTestRows,
    vendorRows,
    aiRows,
    allRunRows,
    allEventRows,
    allPbcRows,
    frameworkRows,
    requirementRows,
    allLessonRows,
  ] = await Promise.all([
    db.select().from(people),
    db.select().from(entities),
    db.select().from(engagements),
    db.select().from(evidence),
    db.select().from(controls),
    db.select().from(risks),
    db.select().from(findings),
    db.select().from(actions),
    db.select().from(testRuns),
    db.select().from(vendors),
    db.select().from(aiSystems),
    db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)),
    db.select().from(auditEvents).orderBy(desc(auditEvents.at)),
    db.select().from(pbcRequests),
    db.select().from(frameworks),
    db.select().from(requirements),
    db.select().from(lessons),
  ]);
  // Restricted engagements: remove them and every child record for anyone without access. This is the single read gate.
  const { hiddenEngagementIds, childRecordIds } = await import("@/server/access");
  const hidden = await hiddenEngagementIds(signedIn);
  const hiddenIds = hidden.size ? await childRecordIds(hidden) : hidden;
  const visible = <T extends { engagementId?: string | null }>(rows: T[]) => (hidden.size ? rows.filter((row) => !row.engagementId || !hidden.has(row.engagementId)) : rows);
  const engagementRows = allEngagementRows.filter((row) => !hidden.has(row.id));
  const evidenceRows = visible(allEvidenceRows);
  const findingRows = visible(allFindingRows);
  const actionRows = visible(allActionRows);
  const testRows = visible(allTestRows);
  const runRows = visible(allRunRows);
  const pbcRows = visible(allPbcRows);
  const lessonRows = visible(allLessonRows);
  const eventRows = hidden.size ? allEventRows.filter((row) => !hiddenIds.has(row.objectId) && !(row.engagementId && hidden.has(row.engagementId))) : allEventRows;
  const nameOf = (id?: string | null) => peopleRows.find((person) => person.id === id)?.name || "Unassigned";
  const publicPeople = peopleRows.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    team: person.team,
    email: person.email,
    authority: person.authority,
  }));
  return {
    peopleRows: publicPeople,
    entityRows,
    engagementRows,
    evidenceRows,
    controlRows,
    riskRows,
    findingRows,
    actionRows,
    testRows,
    vendorRows,
    aiRows,
    runRows,
    eventRows,
    pbcRows,
    frameworkRows,
    requirementRows,
    lessonRows,
    nameOf,
  };
}

function gateFor(
  engagement: typeof engagements.$inferSelect,
  data: Awaited<ReturnType<typeof bundle>>,
) {
  const evidenceCount = data.evidenceRows.filter((item) => item.engagementId === engagement.id).length;
  const tests = data.testRows.filter((item) => item.engagementId === engagement.id);
  const exceptionTests = tests.filter((item) => item.exceptionsCount > 0 || item.result === "FAIL_EXCEPTION");
  const linked = new Set(
    data.findingRows.filter((item) => item.engagementId === engagement.id && item.testRunId).map((item) => item.testRunId),
  );
  const input = {
    stage: engagement.stage,
    objective: engagement.objective,
    scope: engagement.scope,
    period: engagement.period,
    evidenceCount,
    materialityApproved: engagement.materialityApproved,
    testCount: tests.length,
    openExceptionTests: exceptionTests.length,
    linkedExceptionFindings: exceptionTests.filter((item) => linked.has(item.id)).length,
    materialTestsWithoutQa: tests.filter((item) => item.qaStatus !== "cleared").length,
  };
  return {
    ...input,
    canAdvance: canAdvance(input),
    blockers: gateBlockers(input),
    stageName: STAGES.find((stage) => stage.n === engagement.stage)?.name || "Unknown",
  };
}

export async function getShell() {
  const data = await bundle();
  const actor = await getActor();
  const openDecisions = data.runRows.filter((run) => run.status === "suggested").length;
  return {
    actor,
    people: data.peopleRows,
    openDecisions,
    org: "MK Tron Group Internal Audit",
  };
}

export async function getDashboard() {
  const data = await bundle();
  const actor = await getActor();
  const openFindings = data.findingRows.filter((finding) => finding.status !== "Closed");
  const highFindings = openFindings.filter((finding) => finding.priorityBand === "Critical" || finding.priorityBand === "High");
  const overdue = data.actionRows.filter((action) => isOverdue(action.status, effectiveDue(action.originalDue, action.revisedDue)));
  const evidenceGaps = data.evidenceRows.filter((item) => item.completeness !== "Complete" || item.reliability === "R4" || item.reliability === "R5");
  const blocked = data.engagementRows.filter((engagement) => engagement.status !== "Issued" && !gateFor(engagement, data).canAdvance && engagement.stage < 7);
  const coverage = {
    covered: data.entityRows.filter((entity) => entity.coverage === "Covered" || entity.coverage === "In progress").length,
    partial: data.entityRows.filter((entity) => entity.coverage === "Partial" || entity.coverage === "Planned").length,
    gap: data.entityRows.filter((entity) => entity.coverage === "Gap").length,
  };
  const decisions = [
    ...data.engagementRows
      .filter((engagement) => engagement.stage === 7 && !engagement.gcaeApproved && engagement.status !== "Issued")
      .map((engagement) => ({
        id: `issue-${engagement.id}`,
        kind: "Issuance",
        title: `Issue or hold ${engagement.code}`,
        detail: `${engagement.code} is at reporting. Issuance stays with the GCAE. An agent cannot issue it.`,
        href: `/engagements/${engagement.id}`,
      })),
    ...data.testRows
      .filter((test) => test.qaStatus !== "cleared")
      .map((test) => ({
        id: `qa-${test.id}`,
        kind: "Re-performance",
        title: `Re-perform ${test.procedure.replaceAll("_", " ")}`,
        detail: "Material result is on file. QA has not recalculated it. Do not rely on the narrative yet.",
        href: `/testing?run=${test.id}`,
      })),
    ...data.runRows
      .filter((run) => run.status === "suggested")
      .map((run) => ({
        id: run.id,
        kind: "Agent suggestion",
        title: run.summary,
        detail: `${run.agent} · ${run.skill}. A person accepts, amends, or rejects.`,
        href: "/agents",
      })),
    ...overdue.slice(0, 4).map((action) => ({
      id: `od-${action.id}`,
      kind: "Overdue action",
      title: action.agreedAction,
      detail: `Owner ${data.nameOf(action.ownerId)}. Past the agreed date and not closed.`,
      href: "/actions",
    })),
    ...data.pbcRows
      .filter((item) => item.status === "Insufficient" || item.status === "Requested")
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        kind: "Evidence request",
        title: item.item,
        detail: item.sufficiencyNote || `Status: ${item.status}. Due ${item.due}.`,
        href: `/engagements/${item.engagementId}`,
      })),
  ];
  const pipeline = STAGES.map((stage) => ({
    ...stage,
    count: data.engagementRows.filter((engagement) => engagement.stage === stage.n && engagement.status !== "Issued").length,
  }));
  return {
    actor,
    people: data.peopleRows,
    kpis: [
      { label: "Open high and critical findings", value: String(highFindings.length), hint: `${openFindings.length} findings still open`, tone: "critical" },
      { label: "Actions past their date", value: String(overdue.length), hint: "Closed only after Internal Audit validates evidence", tone: "high" },
      { label: "Evidence with a stated limit", value: String(evidenceGaps.length), hint: "Partial or inquiry-grade. Not a pass.", tone: "medium" },
      { label: "Engagements held at a gate", value: String(blocked.length), hint: "The next stage is blocked until the gate evidence exists", tone: "info" },
    ],
    decisions: decisions.slice(0, 8),
    entities: data.entityRows.map((entity) => ({
      ...entity,
      owner: data.nameOf(entity.ownerId),
      openFindings: openFindings.filter((finding) => data.engagementRows.find((engagement) => engagement.id === finding.engagementId)?.entityId === entity.id).length,
    })),
    pipeline,
    overdue: overdue.map((action) => ({
      ...action,
      owner: data.nameOf(action.ownerId),
      finding: data.findingRows.find((finding) => finding.id === action.findingId)?.code || "—",
    })),
    risks: data.riskRows.filter((risk) => risk.appetite === "Outside"),
    events: data.eventRows.slice(0, 6),
    coverage,
    engagements: data.engagementRows.map((engagement) => ({
      ...engagement,
      entity: data.entityRows.find((entity) => entity.id === engagement.entityId)?.name || "",
      lead: data.nameOf(engagement.leadId),
      gate: gateFor(engagement, data),
    })),
  };
}

export async function getUniverse() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    entities: data.entityRows.map((entity) => ({
      ...entity,
      owner: data.nameOf(entity.ownerId),
      engagements: data.engagementRows.filter((engagement) => engagement.entityId === entity.id).map((engagement) => engagement.code),
      openFindings: data.findingRows.filter((finding) => finding.status !== "Closed" && data.engagementRows.some((engagement) => engagement.id === finding.engagementId && engagement.entityId === entity.id)).length,
    })),
    risks: data.riskRows,
  };
}

export async function getEngagementList() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    entities: data.entityRows,
    engagements: data.engagementRows.map((engagement) => ({
      ...engagement,
      entity: data.entityRows.find((entity) => entity.id === engagement.entityId)?.name || "",
      lead: data.nameOf(engagement.leadId),
      findings: data.findingRows.filter((finding) => finding.engagementId === engagement.id).length,
      gate: gateFor(engagement, data),
    })),
  };
}

export async function getEngagement(id: string) {
  const data = await bundle();
  const engagement = data.engagementRows.find((item) => item.id === id);
  if (!engagement) return null;
  const entity = data.entityRows.find((item) => item.id === engagement.entityId);
  const actor = await getActor();
  let restriction: null | { restricted: boolean; allowExternalModel: boolean; members: { personId: string; name: string }[]; candidates: { id: string; name: string; role: string }[] } = null;
  if (actor.authority === "gcae") {
    const grants = await db.select().from(engagementAccess).where(eq(engagementAccess.engagementId, id));
    restriction = {
      restricted: engagement.restricted,
      allowExternalModel: engagement.allowExternalModel,
      members: grants.map((g) => ({ personId: g.personId, name: data.nameOf(g.personId) })),
      candidates: data.peopleRows.filter((p) => ["manager", "auditor", "qa"].includes(p.authority) && !grants.some((g) => g.personId === p.id)).map((p) => ({ id: p.id, name: p.name, role: p.role })),
    };
  }
  return {
    actor,
    restriction,
    people: data.peopleRows,
    engagement,
    entity,
    lead: data.nameOf(engagement.leadId),
    gate: gateFor(engagement, data),
    evidence: data.evidenceRows.filter((item) => item.engagementId === id),
    tests: data.testRows.filter((item) => item.engagementId === id),
    findings: data.findingRows.filter((item) => item.engagementId === id),
    actions: data.actionRows.filter((item) => item.engagementId === id).map((action) => ({ ...action, owner: data.nameOf(action.ownerId) })),
    pbc: data.pbcRows.filter((item) => item.engagementId === id).map((item) => ({ ...item, owner: data.nameOf(item.ownerId) })),
    controls: data.controlRows.filter((item) => item.entityId === engagement.entityId || data.findingRows.some((finding) => finding.engagementId === id && finding.controlId === item.id)),
  };
}

export async function getEvidenceLibrary() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    engagements: data.engagementRows,
    evidence: data.evidenceRows.map((item) => ({
      ...item,
      engagement: data.engagementRows.find((engagement) => engagement.id === item.engagementId)?.code || "Unlinked",
      custodianName: data.nameOf(item.custodian),
      obtainedName: data.nameOf(item.obtainedBy),
    })),
  };
}

export async function getTesting(runId?: string) {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    engagements: data.engagementRows,
    evidence: data.evidenceRows,
    controls: data.controlRows,
    runs: data.testRows,
    selected: data.testRows.find((run) => run.id === runId) || null,
  };
}

export async function getFindings() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    engagements: data.engagementRows,
    controls: data.controlRows,
    findings: data.findingRows.map((finding) => ({
      ...finding,
      engagement: data.engagementRows.find((engagement) => engagement.id === finding.engagementId)?.code || "",
      actionCount: data.actionRows.filter((action) => action.findingId === finding.id).length,
    })),
  };
}

export async function getFinding(id: string) {
  const data = await bundle();
  const finding = data.findingRows.find((item) => item.id === id);
  if (!finding) return null;
  const engagement = data.engagementRows.find((item) => item.id === finding.engagementId);
  return {
    actor: await getActor(),
    people: data.peopleRows,
    finding,
    engagement,
    control: data.controlRows.find((item) => item.id === finding.controlId) || null,
    test: data.testRows.find((item) => item.id === finding.testRunId) || null,
    evidence: data.evidenceRows.filter((item) => finding.evidenceIds.split(",").map((id) => id.trim()).includes(item.id)),
    actions: data.actionRows.filter((item) => item.findingId === id).map((action) => ({ ...action, owner: data.nameOf(action.ownerId) })),
  };
}

export async function getActions() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    actions: data.actionRows.map((action) => {
      const finding = data.findingRows.find((item) => item.id === action.findingId);
      return {
        ...action,
        owner: data.nameOf(action.ownerId),
        findingCode: finding?.code || "—",
        findingTitle: finding?.title || "",
        band: finding?.priorityBand || "Low",
        engagement: data.engagementRows.find((item) => item.id === action.engagementId)?.code || "",
        overdue: isOverdue(action.status, effectiveDue(action.originalDue, action.revisedDue)),
      };
    }),
    findings: data.findingRows,
    engagements: data.engagementRows,
  };
}

export async function getRisks() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    entities: data.entityRows,
    controls: data.controlRows,
    risks: data.riskRows.map((risk) => ({
      ...risk,
      owner: data.nameOf(risk.ownerId),
      entity: data.entityRows.find((entity) => entity.id === risk.entityId)?.name || "Group",
    })),
  };
}

export async function getCompliance() {
  const data = await bundle();
  return {
    frameworks: data.frameworkRows,
    requirements: data.requirementRows.map((requirement) => ({
      ...requirement,
      framework: data.frameworkRows.find((framework) => framework.id === requirement.frameworkId)?.shortName || "",
      controls: requirement.mappedControlIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => data.controlRows.find((control) => control.id === id))
        .filter(Boolean),
    })),
    controls: data.controlRows.map((control) => ({ ...control, owner: data.nameOf(control.ownerId) })),
  };
}

export async function getAgents() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    runs: data.runRows,
    engagements: data.engagementRows,
    events: data.eventRows.slice(0, 12),
    lessons: data.lessonRows,
  };
}

export async function getReports(engagementId?: string) {
  const data = await bundle();
  const engagement = data.engagementRows.find((item) => item.id === engagementId) || data.engagementRows.find((item) => item.id === "eng-ap") || data.engagementRows[0];
  if (!engagement) return null;
  const findings = data.findingRows.filter((item) => item.engagementId === engagement.id);
  return {
    actor: await getActor(),
    people: data.peopleRows,
    engagements: data.engagementRows.map((item) => ({ id: item.id, code: item.code, title: item.title })),
    engagement,
    entityName: data.entityRows.find((entity) => entity.id === engagement.entityId)?.name || "",
    findings,
    actions: data.actionRows
      .filter((action) => action.engagementId === engagement.id)
      .map((action) => ({
        ...action,
        ownerName: data.nameOf(action.ownerId),
      })),
    tests: data.testRows.filter((test) => test.engagementId === engagement.id),
    drafts: data.runRows
      .filter((run) => run.engagementId === engagement.id && run.skill === "model_draft")
      .slice(0, 4)
      .map((run) => ({
        id: run.id,
        agent: run.agent,
        status: run.status,
        summary: run.summary,
        draft: run.output.draft || "",
        limitations: run.limitations,
        startedAt: run.startedAt,
      })),
  };
}

export async function getKaizen() {
  const data = await bundle();
  return {
    actor: await getActor(),
    lessons: data.lessonRows.map((lesson) => ({
      ...lesson,
      engagement: data.engagementRows.find((item) => item.id === lesson.engagementId)?.code || "Group",
    })),
    engagements: data.engagementRows.map((item) => ({ id: item.id, code: item.code, title: item.title })),
  };
}

export async function getVendors() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    vendors: data.vendorRows.map((vendor) => ({ ...vendor, owner: data.nameOf(vendor.ownerId) })),
  };
}

export async function getGovernance() {
  const data = await bundle();
  return {
    actor: await getActor(),
    people: data.peopleRows,
    systems: data.aiRows.map((system) => ({ ...system, owner: data.nameOf(system.ownerId) })),
    events: data.eventRows.slice(0, 8),
  };
}

export async function getLog() {
  const data = await bundle();
  return { events: data.eventRows, runs: data.runRows };
}

export async function searchAll(q: string) {
  const data = await bundle();
  const query = q.trim().toLowerCase();
  if (!query) return { q, results: [] as { href: string; kind: string; title: string; detail: string }[] };
  const results = [
    ...data.engagementRows.filter((item) => `${item.code} ${item.title} ${item.objective}`.toLowerCase().includes(query)).map((item) => ({ href: `/engagements/${item.id}`, kind: "Engagement", title: `${item.code} · ${item.title}`, detail: item.objective })),
    ...data.findingRows.filter((item) => `${item.code} ${item.title} ${item.condition}`.toLowerCase().includes(query)).map((item) => ({ href: `/findings/${item.id}`, kind: "Finding", title: `${item.code} · ${item.title}`, detail: item.priorityBand })),
    ...data.evidenceRows.filter((item) => `${item.id} ${item.originalFilename} ${item.sourceSystem}`.toLowerCase().includes(query)).map((item) => ({ href: "/evidence", kind: "Evidence", title: item.originalFilename, detail: `${item.id} · ${item.reliability}` })),
    ...data.controlRows.filter((item) => `${item.id} ${item.title}`.toLowerCase().includes(query)).map((item) => ({ href: "/compliance", kind: "Control", title: item.title, detail: item.process })),
    ...data.riskRows.filter((item) => `${item.title} ${item.statement}`.toLowerCase().includes(query)).map((item) => ({ href: "/risks", kind: "Risk", title: item.title, detail: item.appetite })),
    ...data.actionRows.filter((item) => item.agreedAction.toLowerCase().includes(query)).map((item) => ({ href: "/actions", kind: "Action", title: item.agreedAction, detail: item.status })),
    ...data.vendorRows.filter((item) => item.name.toLowerCase().includes(query)).map((item) => ({ href: "/vendors", kind: "Vendor", title: item.name, detail: `Tier ${item.tier}` })),
  ];
  return { q, results };
}
