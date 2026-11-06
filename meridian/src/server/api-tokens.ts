import { createHash, randomBytes } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, auditEvents, people } from "@/db/schema";
import { todayIso, uid } from "@/lib/format";
import { engagementForObject } from "@/server/access";
import { AUDIT_ROLES, denyAuthority, effectiveAuthority } from "@/lib/guard";

export const TOKEN_PREFIX = "mt_";
export const MAX_TOKEN_DAYS = 90;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Per-token request limit. Memory-backed: one counter per running app process (Meridian runs as a single instance). */
export const RATE_LIMIT_PER_MIN = 120;
export const SCOPES = ["read", "draft"] as const;

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function auditApi(actor: string, action: string, objectType: string, objectId: string, detail: string, after?: string) {
  await db.insert(auditEvents).values({
    id: uid("log"),
    at: todayIso(),
    actor,
    action,
    objectType,
    objectId,
    beforeState: null,
    afterState: after || null,
    detail,
    engagementId: await engagementForObject(objectType, objectId),
  });
}

export const viaToken = (personName: string, tokenName: string) => `${personName} via Claude token ${tokenName}`;

/** Only Internal Audit roles, and never a person who still holds a one-time password. */
export function tokenCreationRefusal(person: { authority: string; mustChange: boolean }) {
  return denyAuthority(effectiveAuthority(person), AUDIT_ROLES, "Only Internal Audit staff can create a Claude access token.");
}

export async function createToken(person: { id: string; name: string; authority: string; mustChange: boolean }, name: string, days: number, readOnly: boolean) {
  const refusal = tokenCreationRefusal(person);
  if (refusal) return { ok: false as const, error: refusal };
  const label = name.trim().slice(0, 60);
  if (!label) return { ok: false as const, error: "Give the token a name, for example the PC it is for." };
  const ttl = Math.min(Math.max(Math.floor(Number(days) || MAX_TOKEN_DAYS), 1), MAX_TOKEN_DAYS);
  const now = Date.now();
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const id = uid("tok");
  await db.insert(apiTokens).values({
    id,
    personId: person.id,
    name: label,
    tokenHash: hashApiToken(token),
    scopes: readOnly ? ["read"] : [...SCOPES],
    createdAt: now,
    expiresAt: now + ttl * DAY_MS,
  });
  await auditApi(person.name, "Created Claude token", "api_token", id, `Token "${label}" created, ${ttl} days, scopes ${readOnly ? "read" : "read+draft"}. The token value is not stored or logged.`, "active");
  return { ok: true as const, id, token, expiresAt: now + ttl * DAY_MS };
}

export async function revokeToken(person: { id: string; name: string; authority: string }, tokenId: string) {
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, tokenId));
  if (!row) return { ok: false as const, error: "Token not found." };
  // A person revokes their own tokens. The GCAE can revoke anyone's (leaver).
  if (row.personId !== person.id && person.authority !== "gcae") return { ok: false as const, error: "You can revoke only your own tokens." };
  if (row.revokedAt) return { ok: true as const };
  await db.update(apiTokens).set({ revokedAt: Date.now() }).where(eq(apiTokens.id, tokenId));
  await auditApi(person.name, "Revoked Claude token", "api_token", tokenId, `Token "${row.name}" revoked.`, "revoked");
  return { ok: true as const };
}

export async function listTokens(personId: string) {
  const rows = await db.select().from(apiTokens).where(eq(apiTokens.personId, personId)).orderBy(desc(apiTokens.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    state: tokenState(row, Date.now()),
  }));
}

export type TokenState = "ok" | "revoked" | "expired";
export function tokenState(row: { revokedAt: number | null; expiresAt: number }, now: number): TokenState {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt <= now) return "expired";
  return "ok";
}

const windows = new Map<string, { start: number; n: number }>();
/** Fixed one-minute window per token id. Returns false when the limit is exceeded. */
export function rateAllow(tokenId: string, now: number, limit = RATE_LIMIT_PER_MIN) {
  const w = windows.get(tokenId);
  if (!w || now - w.start >= 60_000) {
    windows.set(tokenId, { start: now, n: 1 });
    if (windows.size > 5000) for (const [k, v] of windows) if (now - v.start >= 60_000) windows.delete(k);
    return true;
  }
  w.n += 1;
  return w.n <= limit;
}

export type ApiActor = {
  person: typeof people.$inferSelect;
  authority: string;
  tokenId: string;
  tokenName: string;
  scopes: string[];
  actorLabel: string;
};

export type AuthResult = { ok: true; actor: ApiActor } | { ok: false; status: number; error: string };

/** Resolves a bearer token to the same actor and authority model as a session. Bearer only: a session cookie is refused. */
export async function authenticateBearer(req: Request, scope: "read" | "draft", roles: string[] = AUDIT_ROLES): Promise<AuthResult> {
  if (req.headers.get("cookie")?.includes("meridian_session")) {
    return { ok: false, status: 400, error: "These routes accept a bearer token only. Do not send a browser session." };
  }
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(mt_[A-Za-z0-9_-]{20,200})$/.exec(header);
  if (!match) return { ok: false, status: 401, error: "A valid bearer token is required." };
  const now = Date.now();
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hashApiToken(match[1])));
  if (!row) return { ok: false, status: 401, error: "A valid bearer token is required." };
  const [person] = await db.select().from(people).where(eq(people.id, row.personId));
  const label = viaToken(person?.name || row.personId, row.name);
  const state = tokenState(row, now);
  if (state !== "ok") {
    await auditApi(label, "Claude token use denied", "api_token", row.id, `Token is ${state}.`, state);
    return { ok: false, status: 401, error: `This token is ${state}. Create a new one on the Account page.` };
  }
  if (!person) return { ok: false, status: 401, error: "A valid bearer token is required." };
  if (!rateAllow(row.id, now)) return { ok: false, status: 429, error: `Rate limit: ${RATE_LIMIT_PER_MIN} requests a minute per token.` };
  const authority = effectiveAuthority(person);
  const refusal = denyAuthority(authority, roles, "This token's owner does not have authority for that.");
  if (refusal || !AUDIT_ROLES.includes(authority)) {
    await auditApi(label, "Claude token use denied", "api_token", row.id, `Authority "${authority}" refused: ${refusal || "not an Internal Audit role"}`, "denied");
    return { ok: false, status: 403, error: refusal || "Internal Audit authority is required." };
  }
  if (!row.scopes.includes(scope)) {
    await auditApi(label, "Claude token use denied", "api_token", row.id, `Token lacks the "${scope}" scope.`, "denied");
    return { ok: false, status: 403, error: `This token does not have the "${scope}" scope.` };
  }
  if (!row.lastUsedAt || now - row.lastUsedAt > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(and(eq(apiTokens.id, row.id)));
  }
  return { ok: true, actor: { person, authority, tokenId: row.id, tokenName: row.name, scopes: row.scopes, actorLabel: label } };
}
