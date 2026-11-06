import { notFound } from "next/navigation";
import { FindingDetail } from "@/components/finding-detail";
import { getFinding } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getFinding(id);
  if (!data) notFound();
  return <FindingDetail data={data} />;
}