import ExcelJS from "exceljs";
import { getPlanPage } from "@/lib/strategic-data";
import { AGE_CAP_YEARS } from "@/lib/plan-scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let data: Awaited<ReturnType<typeof getPlanPage>>;
  try {
    data = await getPlanPage(new URL(request.url).searchParams.get("plan") || undefined);
  } catch (error) {
    if (error instanceof Error && error.message === "Sign in required.") return new Response("Sign in required.", { status: 401 });
    console.error("Plan export failed", error);
    return new Response("The export could not be produced.", { status: 500 });
  }
  if (data.denied || !data.plan) return new Response("Not available.", { status: 403 });
  const { plan } = data;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Meridian Assurance Workbench";
  const ws = wb.addWorksheet("Audit plan");
  ws.columns = [
    { header: "Entity", key: "entity", width: 28 }, { header: "Audit", key: "title", width: 36 }, { header: "Quarter", key: "q", width: 9 },
    { header: "Budget days", key: "d", width: 12 }, { header: "Risk score", key: "r", width: 12 }, { header: "Last audit", key: "l", width: 14 },
    { header: "Mandatory", key: "m", width: 28 }, { header: "Status", key: "s", width: 14 }, { header: "Change reason", key: "c", width: 36 }, { header: "Rationale", key: "w", width: 48 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const i of data.items) ws.addRow({ entity: i.entity, title: i.title, q: i.quarter, d: i.budgetDays, r: i.riskScore ?? "No linked risk", l: i.lastAuditDate ?? "None on file", m: i.mandatory ? `Yes: ${i.mandatoryReason}` : "No", s: i.status, c: i.changeReason || "", w: i.rationale });
  const n = wb.addWorksheet("Notes");
  n.columns = [{ header: "Item", key: "a", width: 34 }, { header: "Statement", key: "b", width: 110 }];
  n.getRow(1).font = { bold: true };
  const w = plan.weights;
  const rows: [string, string][] = [
    ["Plan", `${plan.year}, version ${plan.version}, status: ${plan.status}`],
    ["Approval", plan.approvedAt ? `Approved by the GCAE on ${plan.approvedAt}. This is not Audit Committee approval.` : "NOT APPROVED. Draft."],
    ["Audit Committee", plan.acMeetingDate ? `Noted on ${plan.acMeetingDate}, minute ${plan.acMinuteRef}. Typed by the GCAE; not verified by the app.` : "No Audit Committee noting recorded."],
    ["Capacity", `${plan.capacityDays} days (figure supplied by a person). Allocated ${data.capacity?.allocated} days${data.capacity?.over ? `: OVER capacity by ${data.capacity.delta} days` : ""}. Deferred and cancelled items are not counted.`],
    ["Weights", `Risk ${w.risk}, years since last audit ${w.age}, mandatory ${w.mandatory}. ${w.approved ? "Approved by the GCAE with the plan." : "Proposed, awaiting GCAE approval."}`],
    ["Method", `Entity score = (risk weight x risk factor + age weight x age factor + mandatory weight x mandatory factor) / sum of weights. Risk factor = highest linked risk score (residual if assessed, otherwise inherent) / 25 x 100. Age factor = years since last audit, capped at ${AGE_CAP_YEARS}, / ${AGE_CAP_YEARS} x 100; never audited = 100. Mandatory factor = 100 if flagged, else 0.`],
    ["Last audit date", "Latest issued engagement in the app; if none, the entity's recorded last audit date."],
    ["Limits", "The ranking is a suggestion. People decide the items. Items linked to restricted engagements are masked for people without access."],
  ];
  for (const [a, b] of rows) n.addRow({ a, b });
  n.getColumn("b").alignment = { wrapText: true, vertical: "top" };
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="audit-plan-${plan.year}-v${plan.version}.xlsx"` } });
}
