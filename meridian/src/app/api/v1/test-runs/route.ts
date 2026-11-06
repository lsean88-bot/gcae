import { handle, json } from "@/server/api-route";
import { listTestRuns } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => json(200, { ok: true, testRuns: await listTestRuns(new URL(req.url).searchParams.get("engagementId") || undefined) }));
}
