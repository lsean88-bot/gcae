import { handle, json } from "@/server/api-route";
import { listActions } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => {
    const q = new URL(req.url).searchParams;
    return json(200, { ok: true, actions: await listActions({ engagementId: q.get("engagementId") || undefined, findingId: q.get("findingId") || undefined, status: q.get("status") || undefined }) });
  });
}
