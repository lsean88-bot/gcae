import { handle, json } from "@/server/api-route";
import { getEvidence } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, { scope: "read" }, async (actor) => {
    const out = await getEvidence((await ctx.params).id, new URL(req.url).searchParams.get("include") === "body", actor);
    if (out.kind === "forbidden") return json(403, { ok: false, error: "The evidence body is available only to the GCAE, the audit manager, or the auditor leading the engagement. Metadata is available without include=body." });
    return out.kind === "ok" ? json(200, { ok: true, evidence: out.evidence }) : json(404, { ok: false, error: "Evidence not found." });
  });
}
