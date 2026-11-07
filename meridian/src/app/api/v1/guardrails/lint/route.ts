import { handle, json, readJson } from "@/server/api-route";
import { lintForApi } from "@/server/api-modules";

export const dynamic = "force-dynamic";

// Read only: checks draft text against the iron rules and stores nothing.
export async function POST(req: Request) {
  return handle(req, { scope: "read" }, async () => {
    const body = await readJson(req);
    if (!body) return json(400, { ok: false, error: "Send a JSON object." });
    const out = lintForApi(body);
    return json(out.status, out.body);
  });
}
