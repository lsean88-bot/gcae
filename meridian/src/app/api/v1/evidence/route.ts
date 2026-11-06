import { handle, json } from "@/server/api-route";
import { listEvidence } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => {
    const q = new URL(req.url).searchParams;
    return json(200, { ok: true, evidence: await listEvidence(q.get("engagementId") || undefined) });
  });
}
