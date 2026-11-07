import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagements, reportVersions } from "@/db/schema";
import { actorNow } from "@/server/authz";
import { exportVersionDocx } from "@/server/report13-data";

export const dynamic = "force-dynamic";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const notFound = () => new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const who = await actorNow();
    if (!who.id || who.authority === "none" || who.authority === "locked") return notFound();
    const kind = new URL(req.url).searchParams.get("kind") === "brief" ? "brief" : "report";
    const { id } = await ctx.params;
    const out = await exportVersionDocx({ id: who.id, name: who.name, authority: who.authority }, id, kind);
    if (!out.ok) return notFound();
    const [row] = await db.select({ v: reportVersions.versionNo, s: reportVersions.status, e: reportVersions.engagementId }).from(reportVersions).where(eq(reportVersions.id, id));
    const [eng] = row ? await db.select({ code: engagements.code }).from(engagements).where(eq(engagements.id, row.e)) : [];
    const name = `${safe(eng?.code || "engagement")}-${kind}-v${row?.v}-${safe(row?.s || "")}.docx`;
    return new Response(new Uint8Array(out.buffer), {
      status: 200,
      headers: { "Content-Type": DOCX, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch {
    return notFound();
  }
}
