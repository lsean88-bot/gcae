import { LogView } from "@/components/rest-views";
import { getLog } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <LogView data={await getLog()} />;
}