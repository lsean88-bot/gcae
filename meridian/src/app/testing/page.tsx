import { TestingView } from "@/components/testing-view";
import { getTesting } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ run?: string; engagement?: string }> }) {
  const params = await searchParams;
  const data = await getTesting(params.run);
  return <TestingView data={data} initialEngagement={params.engagement} />;
}