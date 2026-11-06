import { handle, json } from "@/server/api-route";
import { getEvidence } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "read" }, async () => {
    const found = await getEvidence((await ctx.params).id, new URL(req.url).searchParams.get("include") === "body");
    return found ? json(200, { ok: true, evidence: found }) : json(404, { ok: false, error: "Evidence not found." });
  });
}
