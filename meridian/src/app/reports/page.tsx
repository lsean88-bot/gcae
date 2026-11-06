import { ReportsView } from "@/components/reports-view";
import { loadAiStatus } from "@/server/ai-config";
import { getReports } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ engagement?: string }> }) {
  const params = await searchParams;
  const data = await getReports(params.engagement);
  if (!data) return <div className="page">No engagement is on file.</div>;
  return <ReportsView data={data} providers={await loadAiStatus()} />;
}