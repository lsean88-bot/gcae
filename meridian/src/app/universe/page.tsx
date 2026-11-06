import { UniverseView } from "@/components/universe-view";
import { getUniverse } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <UniverseView data={await getUniverse()} />;
}