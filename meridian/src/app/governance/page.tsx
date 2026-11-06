import { GovernanceView } from "@/components/rest-views";
import { getGovernance } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <GovernanceView data={await getGovernance()} />;
}