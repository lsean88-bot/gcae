import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { pool } from "../src/db";

export async function applyHardening() {
  await pool.query(readFileSync(join(__dirname, "hardening.sql"), "utf8"));
}

if (require.main === module) {
  applyHardening()
    .then(() => console.log("audit_events is now append-only (update, delete and truncate are blocked)."))
    .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(() => pool.end());
}
