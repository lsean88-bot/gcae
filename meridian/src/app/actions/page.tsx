import { ActionsView } from "@/components/actions-view";
import { getActions } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <ActionsView data={await getActions()} />;
}