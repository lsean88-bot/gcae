import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// No password is stored in source. Accounts have no password until an administrator
// runs `npm run setup:passwords`, which issues a random one-time password per person.

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

// Sign-in list order only. Not a credential store.
export const ACCOUNT_ORDER = [
  "p-gcae", "p-mgr", "p-aud1", "p-aud2", "p-frd", "p-qa",
  "p-own1", "p-own2", "p-own3", "p-own4", "p-cfo", "p-coo",
] as const;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored?: string | null) {
  if (!stored || password.length > MAX_PASSWORD_LENGTH) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// Burn the same scrypt cost when no real hash exists, so timing does not reveal the role state.
const DUMMY_HASH = hashPassword(randomBytes(12).toString("hex"));
export function verifyAgainstNothing(password: string) {
  verifyPassword(password, DUMMY_HASH);
  return false;
}

export function generateOneTimePassword() {
  // 18 random bytes -> 24 base64url characters, about 144 bits.
  return randomBytes(18).toString("base64url");
}

function squash(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Returns an error message, or null when the new password is acceptable. */
export function validateNewPassword(
  next: string,
  person: { id: string; role: string },
  currentHash?: string | null,
): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next.length > MAX_PASSWORD_LENGTH) return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  if (verifyPassword(next, currentHash)) return "Choose a password that is different from the current one.";
  const lower = next.toLowerCase();
  const flat = squash(next);
  for (const term of [person.id, person.role]) {
    const t = term.toLowerCase();
    const f = squash(term);
    if (lower.includes(t) || (f.length >= 3 && flat.includes(f))) return "The password must not contain your role or id.";
  }
  return null;
}
