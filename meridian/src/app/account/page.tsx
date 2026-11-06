import { AccountView } from "@/components/account-view";
import { getActor } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = await getActor();
  return <AccountView name={actor.name} mustChange={actor.mustChangePassword} />;
}