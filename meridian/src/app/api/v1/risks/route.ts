import { handle, json } from "@/server/api-route";
import { listRisks } from "@/server/api-read";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => json(200, { ok: true, risks: await listRisks() }));
}
