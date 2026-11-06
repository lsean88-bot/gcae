import { authenticateBearer, type ApiActor } from "@/server/api-tokens";
import { AUDIT_ROLES } from "@/lib/guard";

export const DRAFT_ROLES = ["gcae", "manager", "auditor"];

export function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a handler: bearer auth, scope and role check, JSON errors, never a stack trace. */
export async function handle(
  req: Request,
  opts: { scope: "read" | "draft"; roles?: string[] },
  fn: (actor: ApiActor) => Promise<Response>,
): Promise<Response> {
  try {
    const auth = await authenticateBearer(req, opts.scope, opts.roles || AUDIT_ROLES);
    if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });
    return await fn(auth.actor);
  } catch (error) {
    console.error("api/v1 error:", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "The request could not be completed." });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.text();
    if (raw.length > 200_000) return null;
    const body = JSON.parse(raw);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
