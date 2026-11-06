import { buildPackWorkbook } from "@/lib/ac-pack-xlsx";
import { getPack } from "@/lib/strategic-data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getPack>>;
  try {
    data = await getPack(id);
  } catch (error) {
    if (error instanceof Error && error.message === "Sign in required.") return new Response("Sign in required.", { status: 401 });
    console.error("Pack export failed", error);
    return new Response("The export could not be produced.", { status: 500 });
  }
  if (!data) return new Response("Not found.", { status: 404 });
  const { pack, snapshot } = data;
  const released = pack.status === "Released";
  const buffer = await buildPackWorkbook(pack, snapshot);
  return new Response(buffer as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="ac-pack-${pack.periodFrom}-to-${pack.periodTo}${released ? "" : "-DRAFT"}.xlsx"` } });
}
