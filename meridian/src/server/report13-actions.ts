"use server";

import { revalidatePath } from "next/cache";
import { actorNow } from "@/server/authz";
import { createReportVersion, setReportStatus, type ReportStatus } from "@/server/report13-data";
import type { ActionResult } from "@/server/mutations";

async function viewer() {
  const who = await actorNow();
  if (!who.id || who.authority === "none" || who.authority === "locked") return null;
  return { id: who.id, name: who.name, authority: who.authority };
}

export async function generateVersionAction(engagementId: string): Promise<ActionResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Sign in required." };
  const r = await createReportVersion(v, String(engagementId));
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/reports");
  return { ok: true, id: r.id, message: `Version ${r.versionNo} stored as Draft. Blocking items: ${r.blocking}.` };
}

export async function setReportStatusAction(versionId: string, status: string): Promise<ActionResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Sign in required." };
  const r = await setReportStatus(v, String(versionId), status as ReportStatus);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/reports");
  return { ok: true, message: `Status set to ${status}.` };
}
