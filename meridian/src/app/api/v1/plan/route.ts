import { handle, json } from "@/server/api-route";
import { getAuditPlan } from "@/server/api-modules";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => {
    const p = new URL(req.url).searchParams;
    const year = Number(p.get("year")) || undefined;
    const plan = await getAuditPlan({ planId: p.get("planId") || undefined, year });
    return plan ? json(200, { ok: true, ...plan }) : json(404, { ok: false, error: "No audit plan found." });
  });
}
