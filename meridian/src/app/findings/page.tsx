import { FindingsView } from "@/components/findings-view";
import { getFindings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <FindingsView data={await getFindings()} />;
}