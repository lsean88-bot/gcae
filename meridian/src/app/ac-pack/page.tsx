import { AcPackList } from "@/components/ac-pack-view";
import { getPacks } from "@/lib/strategic-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <AcPackList data={await getPacks()} />;
}
