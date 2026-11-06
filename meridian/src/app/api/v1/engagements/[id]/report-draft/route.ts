import { DRAFT_ROLES, handle, json, readJson } from "@/server/api-route";
import { draftReportText } from "@/server/api-drafts";

export const dynamic = "force-dynamic";

// Files draft text as a suggestion. There is no route that issues, approves or accepts it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "draft", roles: DRAFT_ROLES }, async (actor) => {
    const body = await readJson(req);
    if (!body) return json(400, { ok: false, error: "Send a JSON object." });
    const result = await draftReportText(actor, (await ctx.params).id, body);
    return json(result.status, result.body);
  });
}
