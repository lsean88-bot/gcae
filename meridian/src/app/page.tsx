import { CommandView } from "@/components/command-view";
import { getDashboard } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getDashboard();
  return <CommandView data={data} />;
}