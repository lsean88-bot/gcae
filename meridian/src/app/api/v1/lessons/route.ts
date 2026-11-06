import { DRAFT_ROLES, handle, json, readJson } from "@/server/api-route";
import { proposeLesson } from "@/server/api-drafts";
import { listLessons } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => json(200, { ok: true, lessons: await listLessons() }));
}

// Proposes a lesson (status proposed). Acceptance stays with the audit manager or the GCAE.
export async function POST(req: Request) {
  return handle(req, { scope: "draft", roles: DRAFT_ROLES }, async (actor) => {
    const body = await readJson(req);
    if (!body) return json(400, { ok: false, error: "Send a JSON object." });
    const result = await proposeLesson(actor, body);
    return json(result.status, result.body);
  });
}
