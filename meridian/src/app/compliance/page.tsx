import { ComplianceView } from "@/components/rest-views";
import { getCompliance } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <ComplianceView data={await getCompliance()} />;
}