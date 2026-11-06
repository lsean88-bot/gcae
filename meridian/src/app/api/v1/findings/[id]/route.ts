import { handle, json } from "@/server/api-route";
import { getFinding } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "read" }, async (actor) => {
    const found = await getFinding((await ctx.params).id, actor);
    return found ? json(200, { ok: true, finding: found }) : json(404, { ok: false, error: "Finding not found." });
  });
}
