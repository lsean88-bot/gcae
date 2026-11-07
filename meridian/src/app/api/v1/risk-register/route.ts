import { handle, json } from "@/server/api-route";
import { getRiskRegister } from "@/server/api-modules";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(req, { scope: "read" }, async () => {
    const p = new URL(req.url).searchParams;
    const view = p.get("view") === "inherent" ? "inherent" : "residual";
    const top = Math.min(Math.max(Number(p.get("top")) || 10, 1), 50);
    return json(200, { ok: true, ...(await getRiskRegister(view, top)) });
  });
}
