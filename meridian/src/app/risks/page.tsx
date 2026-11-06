import { RisksView } from "@/components/risks-view";
import { getRisks } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <RisksView data={await getRisks()} />;
}