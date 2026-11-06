import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { todayIso, uid } from "@/lib/format";
import { denyAuthority, effectiveAuthority } from "@/lib/guard";
import { engagementForObject } from "@/server/access";

export type Result = { ok: true; id?: string; message: string; hash?: string } | { ok: false; error: string };

const SIGNED_OUT = { id: "", name: "Signed out", role: "", team: "", email: "", authority: "none", passwordHash: null, mustChange: false };

/** Identity comes only from the server-side session. */
export async function actorNow() {
  const { getSessionActor } = await import("@/server/session");
  const person = (await getSessionActor()) ?? SIGNED_OUT;
  return { ...person, authority: effectiveAuthority(person) };
}

export function deny(authority: string, allowed: string[], message: string): Result | null {
  const refusal = denyAuthority(authority, allowed, message);
  return refusal ? { ok: false, error: refusal } : null;
}

export async function logEvent(who: { name: string }, action: string, objectType: string, objectId: string, detail: string, before?: string, after?: string, engagementId?: string | null) {
  await db.insert(auditEvents).values({
    id: uid("log"),
    at: todayIso(),
    actor: who.name,
    action,
    objectType,
    objectId,
    beforeState: before || null,
    afterState: after || null,
    detail,
    engagementId: engagementId ?? (await engagementForObject(objectType, objectId)),
  });
}
