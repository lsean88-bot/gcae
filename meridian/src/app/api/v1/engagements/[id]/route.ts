import { handle, json } from "@/server/api-route";
import { getEngagement } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "read" }, async () => {
    const found = await getEngagement((await ctx.params).id);
    return found ? json(200, { ok: true, engagement: found }) : json(404, { ok: false, error: "Engagement not found." });
  });
}
