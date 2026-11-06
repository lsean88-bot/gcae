import { createHash, randomBytes } from "crypto";
import { db } from "@/db";
import { sessions } from "@/db/schema";

export const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
export const IDLE_TTL_MS = 30 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionState(row: { lastSeen: number; expiresAt: number }, now: number): "ok" | "idle" | "expired" {
  if (row.expiresAt < now) return "expired";
  if (now - row.lastSeen > IDLE_TTL_MS) return "idle";
  return "ok";
}

/** Creates a session and returns the raw token. Only its SHA-256 is stored. */
export async function createSessionRow(personId: string, now: number) {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    personId,
    createdAt: now,
    lastSeen: now,
    expiresAt: now + ABSOLUTE_TTL_MS,
  });
  return token;
}
