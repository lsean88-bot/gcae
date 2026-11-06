import { SimulationView } from "@/components/simulation-view";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function Page() {
  await ensureSeed();
  const [row] = await db.select().from(settings).where(eq(settings.key, "simulation_latest"));
  const latest = row ? JSON.parse(row.value) : null;
  return <SimulationView latest={latest} />;
}