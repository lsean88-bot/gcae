import { DRAFT_ROLES, handle, json, readJson } from "@/server/api-route";
import { draftFinding } from "@/server/api-drafts";
import { listFindings } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => json(200, { ok: true, findings: await listFindings(new URL(req.url).searchParams.get("engagementId") || undefined) }));
}

// Creates a Draft finding only. Status is forced server-side; the priority is computed from likelihood and impact.
export async function POST(req: Request) {
  return handle(req, { scope: "draft", roles: DRAFT_ROLES }, async (actor) => {
    const body = await readJson(req);
    if (!body) return json(400, { ok: false, error: "Send a JSON object." });
    const result = await draftFinding(actor, body);
    return json(result.status, result.body);
  });
}
