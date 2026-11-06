import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const LEGACY_SALT = "meridian-model-key";
const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "meridian-dev-only-secret-not-for-production";
let warned = false;

/**
 * Resolve the master secret. Production fails closed: APP_SECRET of at least 32 characters is required.
 * Outside production a fixed development secret is used, with a warning. DATABASE_URL is never used.
 */
export function resolveSecret(env: { NODE_ENV?: string; APP_SECRET?: string }) {
  const secret = env.APP_SECRET;
  if (env.NODE_ENV === "production") {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`APP_SECRET is required in production and must be at least ${MIN_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 48`);
    }
    return secret;
  }
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (!warned) {
    warned = true;
    console.warn("[secret-box] APP_SECRET is missing or shorter than 32 characters. Using a development-only secret. Do not do this in production.");
  }
  return DEV_SECRET;
}

function master() {
  return resolveSecret({ NODE_ENV: process.env.NODE_ENV, APP_SECRET: process.env.APP_SECRET });
}

/** v2 format: v2$salt$iv$tag$data, with a random 16-byte salt per secret. */
export function sealSecret(value: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(master(), salt, 32), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2$${salt.toString("hex")}$${iv.toString("hex")}$${tag.toString("hex")}$${encrypted.toString("hex")}`;
}

function decrypt(keyBytes: Buffer, ivHex: string, tagHex: string, dataHex: string) {
  const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/** Returns undefined for anything that is not a valid sealed value. Unprefixed text is never returned. */
export function openSecret(stored?: string | null) {
  if (!stored) return undefined;
  try {
    const parts = stored.split("$");
    if (parts[0] === "v2" && parts.length === 5) {
      return decrypt(scryptSync(master(), Buffer.from(parts[1], "hex"), 32), parts[2], parts[3], parts[4]);
    }
    if (parts[0] === "v1" && parts.length === 4) {
      // Legacy fixed-salt format. Readable only if the same APP_SECRET was used to write it.
      return decrypt(scryptSync(master(), LEGACY_SALT, 32), parts[1], parts[2], parts[3]);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("APP_SECRET")) throw error;
    return undefined;
  }
  return undefined;
}
