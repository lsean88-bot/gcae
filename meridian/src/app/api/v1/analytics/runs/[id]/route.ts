import { handle, json } from "@/server/api-route";
import { getAnalyticsRun } from "@/server/api-modules";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "read" }, async (actor) => {
    const run = await getAnalyticsRun(actor, (await ctx.params).id);
    return run ? json(200, { ok: true, run }) : json(404, { ok: false, error: "Not found." });
  });
}
