import { AnalyticsView } from "@/components/analytics-view";
import { analyticsPageData } from "@/server/analytics";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await analyticsPageData();
  return <AnalyticsView data={data} />;
}
