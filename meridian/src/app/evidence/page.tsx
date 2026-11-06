import { EvidenceView } from "@/components/evidence-view";
import { getEvidenceLibrary } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <EvidenceView data={await getEvidenceLibrary()} />;
}