import ExcelJS from "exceljs";
import { getActions } from "@/lib/data";

export const dynamic = "force-dynamic";

function excelDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export async function GET() {
  let data: Awaited<ReturnType<typeof getActions>>;
  try {
    data = await getActions();
  } catch (error) {
    if (error instanceof Error && error.message === "Sign in required.") return new Response("Sign in required.", { status: 401 });
    console.error("Action export failed", error);
    return new Response("The export could not be produced.", { status: 500 });
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Meridian Assurance Workbench";
  workbook.created = new Date();

  const tracker = workbook.addWorksheet("Action Tracker");
  tracker.columns = [
    { header: "Finding", key: "finding", width: 14 },
    { header: "Engagement", key: "engagement", width: 18 },
    { header: "Band", key: "band", width: 12 },
    { header: "Agreed action", key: "action", width: 64 },
    { header: "Owner", key: "owner", width: 22 },
    { header: "Original due", key: "originalDue", width: 16 },
    { header: "Revised due", key: "revisedDue", width: 16 },
    { header: "Status", key: "status", width: 24 },
    { header: "Percent", key: "percent", width: 12 },
    { header: "Validation", key: "validation", width: 16 },
    { header: "Evidence required", key: "required", width: 42 },
    { header: "Evidence received", key: "received", width: 36 },
    { header: "Interim control", key: "interim", width: 36 },
    { header: "Escalation", key: "escalation", width: 14 },
    { header: "Days overdue", key: "overdue", width: 16 },
    { header: "Comments", key: "comments", width: 40 },
  ];
  tracker.getRow(1).font = { bold: true };
  data.actions.forEach((action, index) => {
    const rowNumber = index + 2;
    tracker.addRow({
      finding: action.findingCode,
      engagement: action.engagement,
      band: action.band,
      action: action.agreedAction,
      owner: action.owner,
      originalDue: excelDate(action.originalDue),
      revisedDue: action.revisedDue ? excelDate(action.revisedDue) : "",
      status: action.status,
      percent: action.percentComplete,
      validation: action.validationStatus,
      required: action.evidenceRequired,
      received: action.evidenceReceived || "",
      interim: action.interimControl || "",
      escalation: action.escalation ? "Yes" : "No",
      comments: action.comments || "",
    });
    tracker.getCell(`F${rowNumber}`).numFmt = "yyyy-mm-dd";
    if (action.revisedDue) tracker.getCell(`G${rowNumber}`).numFmt = "yyyy-mm-dd";
  });
  const last = Math.max(data.actions.length + 1, 2);
  for (let row = 2; row <= last; row += 1) {
    tracker.getCell(`H${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"Not started,In progress,Partially implemented,Implemented,Closed,Deferred,Disputed"'],
    };
    tracker.getCell(`J${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"Pending,Received,Validated,Rejected"'],
    };
    tracker.getCell(`N${row}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"Yes,No"'],
    };
    tracker.getCell(`O${row}`).value = {
      formula: `IF(OR(H${row}="Closed",H${row}="Deferred"),0,MAX(0,TODAY()-IF(G${row}="",F${row},G${row})))`,
    };
  }
  tracker.autoFilter = { from: "A1", to: `P${last}` };

  const dashboard = workbook.addWorksheet("Dashboard");
  dashboard.getCell("A1").value = "Meridian action dashboard";
  dashboard.getCell("A1").font = { bold: true, size: 16 };
  dashboard.getCell("A3").value = "Open";
  dashboard.getCell("B3").value = { formula: `COUNTIFS('Action Tracker'!H2:H500,"<>Closed",'Action Tracker'!H2:H500,"<>")` };
  dashboard.getCell("A4").value = "Closed";
  dashboard.getCell("B4").value = { formula: `COUNTIF('Action Tracker'!H2:H500,"Closed")` };
  dashboard.getCell("A5").value = "Overdue rows";
  dashboard.getCell("B5").value = { formula: `COUNTIF('Action Tracker'!O:O,">0")` };
  dashboard.getCell("A6").value = "Critical or high";
  dashboard.getCell("B6").value = { formula: `COUNTIF('Action Tracker'!C:C,"Critical")+COUNTIF('Action Tracker'!C:C,"High")` };
  dashboard.getColumn(1).width = 24;
  dashboard.getCell("A8").value = "Closure rule";
  dashboard.getCell("A9").value = "Do not mark Closed unless Validation is Validated and Internal Audit has seen evidence that the root cause is addressed. A management statement is not enough.";
  dashboard.getCell("A9").alignment = { wrapText: true };

  const instructions = workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width = 110;
  [
    "How to use this tracker",
    "One row is one agreed action. Do not delete a row to hide a late action.",
    "Status: Not started means no substantive work. In progress means work has begun. Partially implemented means some steps are done but the root cause remains. Implemented means management says it is done and Audit has not yet validated. Closed means Audit has validated. Deferred needs a revised date and a reason. Disputed needs escalation.",
    "Days overdue calculates from the revised date if present, otherwise the original date, and only if the status is not Closed or Deferred.",
    "Cadence: critical fortnightly or weekly if overdue; high monthly; medium quarterly; low before the next cycle. Overdue actions go to the accountable executive and the next audit-committee update.",
    "Colour and dropdowns are there to keep the language consistent. They are not a substitute for the evidence.",
  ].forEach((line, index) => {
    instructions.getCell(`A${index + 1}`).value = line;
    instructions.getCell(`A${index + 1}`).alignment = { wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=meridian-action-tracker.xlsx",
    },
  });
}