import { ErmView } from "@/components/erm-view";
import { getErm } from "@/lib/strategic-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <ErmView data={await getErm()} />;
}
