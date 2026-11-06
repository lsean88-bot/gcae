import Link from "next/link";
import { PackSheet } from "@/components/ac-pack-view";
import { getPack } from "@/lib/strategic-data";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPack(id);
  if (!data) return <div className="page"><h1 className="display">Pack not found</h1><p><Link href="/ac-pack">Back to packs</Link></p></div>;
  return <PackSheet data={data} />;
}
