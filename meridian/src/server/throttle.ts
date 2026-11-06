import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

export const LOCK_WINDOW_MS = 15 * 60 * 1000;
export const MAX_ROLE_FAILURES = 5;
export const MAX_IP_FAILURES = 20;

export async function recentFailures(scope: string, now: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.scope, scope), eq(loginAttempts.ok, false), gt(loginAttempts.at, now - LOCK_WINDOW_MS)));
  return row?.n ?? 0;
}

export async function recordFailure(scope: string, now: number) {
  await db.insert(loginAttempts).values({ scope, at: now, ok: false });
}

export async function clearScope(scope: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.scope, scope));
}

export type Reservation =
  | { locked: true }
  | { locked: false; counts: Record<string, number>; ids: Record<string, number> };

/**
 * Atomically check every scope and reserve one failed-attempt slot in each.
 * Runs under a per-scope advisory lock, so parallel guesses cannot exceed the limit.
 * A successful sign-in releases its slots with releaseAttempts.
 */
export async function reserveAttempts(scopes: { scope: string; max: number }[], now: number): Promise<Reservation> {
  return db.transaction(async (tx) => {
    const sorted = [...scopes].sort((a, b) => (a.scope < b.scope ? -1 : 1));
    for (const item of sorted) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${item.scope}))`);
    const counts: Record<string, number> = {};
    for (const item of sorted) {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.scope, item.scope), eq(loginAttempts.ok, false), gt(loginAttempts.at, now - LOCK_WINDOW_MS)));
      counts[item.scope] = row?.n ?? 0;
      if (counts[item.scope] >= item.max) return { locked: true } as const;
    }
    const ids: Record<string, number> = {};
    for (const item of sorted) {
      const [row] = await tx.insert(loginAttempts).values({ scope: item.scope, at: now, ok: false }).returning({ id: loginAttempts.id });
      ids[item.scope] = row.id;
      counts[item.scope] += 1;
    }
    return { locked: false, counts, ids } as const;
  });
}

export async function releaseAttempts(ids: number[]) {
  if (ids.length) await db.delete(loginAttempts).where(inArray(loginAttempts.id, ids));
}
