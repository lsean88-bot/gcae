import { AccountView } from "@/components/account-view";
import { getActor } from "@/lib/data";
import { AUDIT_ROLES } from "@/lib/guard";
import { listTokens } from "@/server/api-tokens";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = await getActor();
  const canToken = !actor.mustChangePassword && AUDIT_ROLES.includes(actor.authority);
  const tokens = canToken ? await listTokens(actor.id) : [];
  return <AccountView name={actor.name} mustChange={actor.mustChangePassword} canToken={canToken} tokens={tokens} />;
}
