import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { people } from "../src/db/schema";
import { MAX_TOKEN_DAYS, createToken } from "../src/server/api-tokens";

// Usage:
//   npm run token:create -- --person p-gcae --name laptop --days 90 [--read-only]
// Prints the token once. Only its SHA-256 is stored. Uses the same rules as the Account page:
// Internal Audit roles only, 90 days at most, and a person who still holds a one-time password is refused.

const URL_HINT = "http://127.0.0.1:3000";

function parse(argv: string[]) {
  const out = { person: "", name: "", days: MAX_TOKEN_DAYS, readOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--read-only") out.readOnly = true;
    else if (a === "--person") out.person = argv[++i] ?? "";
    else if (a === "--name") out.name = argv[++i] ?? "";
    else if (a === "--days") out.days = Number(argv[++i]);
    else throw new Error(`Unknown option "${a}". Usage: --person <id> --name <label> [--days 1-${MAX_TOKEN_DAYS}] [--read-only]`);
  }
  if (!out.person) throw new Error("--person <person id> is required, for example --person p-gcae.");
  if (!out.name.trim()) throw new Error("--name <label> is required, for example --name laptop.");
  if (!Number.isFinite(out.days) || out.days < 1) throw new Error(`--days must be a number from 1 to ${MAX_TOKEN_DAYS}.`);
  return out;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const [person] = await db.select().from(people).where(eq(people.id, args.person));
  if (!person) throw new Error(`No person with id "${args.person}".`);
  if (person.mustChange) {
    throw new Error(`${person.id} still has a one-time password, so no token can be created. Sign in at ${URL_HINT}, change the one-time password, then run this command again.`);
  }
  const result = await createToken(person, args.name, args.days, args.readOnly);
  if (!result.ok) throw new Error(result.error);
  console.log(`Token for ${person.name} (${person.id}), name "${args.name.trim()}", ${args.readOnly ? "read only" : "read and draft"}.`);
  console.log(`Expires ${new Date(result.expiresAt).toISOString().slice(0, 10)}. Shown once. Meridian keeps only a fingerprint and cannot show it again.\n`);
  console.log(result.token);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => pool.end());
