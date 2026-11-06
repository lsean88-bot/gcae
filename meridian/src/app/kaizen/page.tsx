import { KaizenView } from "@/components/kaizen-view";
import { getKaizen } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <KaizenView data={await getKaizen()} />;
}