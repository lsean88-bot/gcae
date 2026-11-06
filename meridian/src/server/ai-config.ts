import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { AiProvider, AiStatus } from "@/lib/ai";
import { openSecret, sealSecret } from "@/lib/secret-box";

const CLAUDE_KEY = "secret_anthropic_key";
const OPENAI_KEY = "secret_openai_key";
const GEMINI_KEY = "secret_gemini_key";
const PREFERRED = "ai_preferred";

export async function loadAiStatus(): Promise<AiStatus & { preferred: "claude" | "openai" | "gemini" | "none"; active: AiProvider | "none" }> {
  const rows = await db.select().from(settings);
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const claude = Boolean(process.env.ANTHROPIC_API_KEY || saved[CLAUDE_KEY]);
  const openai = Boolean(process.env.OPENAI_API_KEY || saved[OPENAI_KEY]);
  const gemini = Boolean(process.env.GEMINI_API_KEY || saved[GEMINI_KEY]);
  const preferred = saved[PREFERRED] === "openai" || saved[PREFERRED] === "claude" || saved[PREFERRED] === "gemini" ? saved[PREFERRED] : "none";
  const active: AiProvider | "none" =
    preferred === "claude" && claude ? "claude"
      : preferred === "openai" && openai ? "openai"
        : preferred === "gemini" && gemini ? "gemini"
          : claude ? "claude"
            : openai ? "openai"
              : gemini ? "gemini"
                : "none";
  return {
    claude,
    openai,
    gemini,
    compatible: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY),
    claudeModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    compatibleModel: process.env.AI_MODEL || "",
    preferred: preferred === "none" ? (active === "none" ? "none" : active) : preferred,
    active,
  };
}

export async function loadProviderKey(provider: AiProvider) {
  if (provider === "compatible") return process.env.AI_API_KEY;
  if (provider === "gemini") {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    const [row] = await db.select().from(settings).where(eq(settings.key, GEMINI_KEY));
    return openSecret(row?.value);
  }
  if (provider === "claude") {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    const [row] = await db.select().from(settings).where(eq(settings.key, CLAUDE_KEY));
    return openSecret(row?.value);
  }
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const [row] = await db.select().from(settings).where(eq(settings.key, OPENAI_KEY));
  return openSecret(row?.value);
}

export async function saveProviderKey(provider: "claude" | "openai" | "gemini", key: string) {
  const settingKey = provider === "claude" ? CLAUDE_KEY : provider === "gemini" ? GEMINI_KEY : OPENAI_KEY;
  const sealed = sealSecret(key);
  await db.insert(settings).values({ key: settingKey, value: sealed }).onConflictDoUpdate({
    target: settings.key,
    set: { value: sealed },
  });
  await db.insert(settings).values({ key: PREFERRED, value: provider }).onConflictDoUpdate({
    target: settings.key,
    set: { value: provider },
  });
}

export async function removeProviderKey(provider: "claude" | "openai" | "gemini") {
  const settingKey = provider === "claude" ? CLAUDE_KEY : provider === "gemini" ? GEMINI_KEY : OPENAI_KEY;
  await db.delete(settings).where(eq(settings.key, settingKey));
}

export async function preferProvider(provider: "claude" | "openai" | "gemini") {
  await db.insert(settings).values({ key: PREFERRED, value: provider }).onConflictDoUpdate({
    target: settings.key,
    set: { value: provider },
  });
}
