import { handle, json } from "@/server/api-route";
import { getBriefing } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "read" }, async () => {
    const audience = new URL(req.url).searchParams.get("audience") || "Audit committee";
    const found = await getBriefing((await ctx.params).id, audience.slice(0, 80));
    return found ? json(200, { ok: true, briefing: found }) : json(404, { ok: false, error: "Engagement not found." });
  });
}
