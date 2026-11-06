import "dotenv/config";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, pool } from "../src/db";
import { auditEvents, people, sessions, settings } from "../src/db/schema";
import { generateOneTimePassword, hashPassword } from "../src/lib/password";
import { ensureSeed } from "../src/lib/seed";
import { applyHardening } from "./db-harden";

// Usage:
//   npm run setup:passwords            first run on a database: issue to everyone (clears any legacy password).
//                                      later runs: issue only to people who have no password
//   npm run setup:passwords -- p-mgr   (re)issue for one person id, replacing any existing password
//   npm run setup:passwords -- --all   (re)issue for every person
// Passwords are printed once to stdout. Only the scrypt hash is stored, with must_change = true.

async function main() {
  const arg = process.argv[2];
  await ensureSeed();
  await applyHardening();
  const everyone = await db.select().from(people);
  let targets;
  if (arg === "--all") targets = everyone;
  else if (arg) {
    targets = everyone.filter((person) => person.id === arg);
    if (!targets.length) throw new Error(`No person with id "${arg}". Ids: ${everyone.map((person) => person.id).join(", ")}`);
  } else targets = everyone.filter((person) => !person.passwordHash);

  // Upgrade safety: earlier versions shipped known default passwords. The first run of this
  // script on a database reissues for everyone so no legacy hash survives.
  const [migrated] = await db.select().from(settings).where(eq(settings.key, "passwords_reissued_v3"));
  const legacySweep = !migrated && !arg;
  if (legacySweep) targets = everyone;

  if (!targets.length) {
    console.log("Nobody needs a password. Pass a person id or --all to reissue.");
    if (!migrated) await db.insert(settings).values({ key: "passwords_reissued_v3", value: new Date().toISOString() }).onConflictDoNothing();
    return;
  }
  console.log("One-time passwords. Shown once. Each person must replace theirs at first sign-in.\n");
  for (const person of targets) {
    const password = generateOneTimePassword();
    await db.update(people).set({ passwordHash: hashPassword(password), mustChange: true }).where(eq(people.id, person.id));
    await db.delete(sessions).where(eq(sessions.personId, person.id));
    await db.insert(auditEvents).values({
      id: `log-${randomBytes(8).toString("hex")}`,
      at: new Date().toISOString(),
      actor: "Administrator (CLI)",
      action: "One-time password issued",
      objectType: "person",
      objectId: person.id,
      beforeState: null,
      afterState: "must_change",
      detail: "One-time password issued from the command line. The password is not stored in the log.",
    });
    console.log(`${person.id.padEnd(8)} ${person.role.padEnd(34)} ${password}`);
  }
  if (!migrated) await db.insert(settings).values({ key: "passwords_reissued_v3", value: new Date().toISOString() }).onConflictDoNothing();
  console.log(`\n${targets.length} password(s) issued.`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => pool.end());
