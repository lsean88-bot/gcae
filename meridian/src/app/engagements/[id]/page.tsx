import { notFound } from "next/navigation";
import { EngagementView } from "@/components/engagement-view";
import { getEngagement } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEngagement(id);
  if (!data) notFound();
  return <EngagementView data={data} />;
}