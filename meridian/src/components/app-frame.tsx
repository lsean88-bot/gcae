import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { LoginView } from "@/components/login-view";
import { getShell } from "@/lib/data";
import { db } from "@/db";
import { people } from "@/db/schema";
import { ACCOUNT_ORDER } from "@/lib/password";
import { ForcedPasswordView } from "@/components/account-view";
import { getSessionActor } from "@/server/session";

export async function AppFrame({ children }: { children: ReactNode }) {
  const actor = await getSessionActor();
  if (!actor) {
    const rows = await db.select().from(people);
    const known: string[] = ACCOUNT_ORDER.map((id) => rows.find((person) => person.id === id)?.role).filter((role): role is string => Boolean(role));
    const extra = rows.map((person) => person.role).filter((role) => !known.includes(role));
    return <LoginView roles={[...known, ...extra]} />;
  }
  if (actor.mustChange) return <ForcedPasswordView name={actor.name} />;
  const shell = await getShell();
  return (
    <Shell actor={shell.actor} people={shell.people} openDecisions={shell.openDecisions}>
      {children}
    </Shell>
  );
}