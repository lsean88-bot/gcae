import { UatView } from "@/components/uat-view";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { runUat } from "@/server/uat";

export const dynamic = "force-dynamic";

export default async function Page() {
  await ensureSeed();
  const [row] = await db.select().from(settings).where(eq(settings.key, "uat_latest"));
  const latest = row
    ? JSON.parse(row.value) as { at: string; passed: number; failed: number; total: number; cases: { id: string; name: string; pass: boolean; evidence: string }[] }
    : await runUat("UAT");
  return <UatView latest={latest} />;
}