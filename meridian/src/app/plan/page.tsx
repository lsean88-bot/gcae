import { PlanView } from "@/components/plan-view";
import { getPlanPage } from "@/lib/strategic-data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <PlanView data={await getPlanPage(plan)} />;
}
