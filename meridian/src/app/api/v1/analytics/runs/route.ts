import { DRAFT_ROLES, handle, json } from "@/server/api-route";
import { listAnalyticsRuns, runAnalyticsFromApi } from "@/server/api-modules";

export const dynamic = "force-dynamic";
const MAX_BODY = 30 * 1024 * 1024; // base64 of a 20 MB file, plus params

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async (actor) => json(200, { ok: true, runs: await listAnalyticsRuns(actor) }));
}

// Runs a test on an uploaded file and saves a read-only run. Never approves, rates or issues anything.
export async function POST(req: Request) {
  return handle(req, { scope: "draft", roles: DRAFT_ROLES }, async (actor) => {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json(413, { ok: false, error: "Request is too large." });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, error: "Send a JSON object." });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { ok: false, error: "Send a JSON object." });
    const out = await runAnalyticsFromApi(actor, body as Record<string, unknown>);
    return json(out.status, out.body);
  });
}
