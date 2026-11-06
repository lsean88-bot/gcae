import { EngagementsView } from "@/components/engagements-view";
import { getEngagementList } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <EngagementsView data={await getEngagementList()} />;
}