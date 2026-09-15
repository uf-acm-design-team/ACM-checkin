#!/usr/bin/env node
/**
 * ACM Check-in - Database restore
 *
 * Restores JSON dumps produced by `npm run db:backup` back into Supabase
 * via upsert (matched on each table's primary key), so it's safe to re-run.
 *
 * This restores DATA only. The target project must already have the schema
 * applied (`supabase db push` / `supabase migration up` against
 * supabase/migrations/) before you run this.
 *
 * Usage:
 *   npm run db:restore                    # restores the most recent backup
 *   npm run db:restore -- backups/<dir>   # restores a specific backup
 *   npm run db:restore -- --yes           # skip the confirmation prompt
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import readline from "node:readline/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(join(ROOT, ".env"));
loadEnv(join(ROOT, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env/.env.local",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const skipConfirm = args.includes("--yes") || args.includes("-y");
const explicitDir = args.find((a) => !a.startsWith("-"));

function findLatestBackup() {
  const backupsRoot = join(ROOT, "backups");
  if (!existsSync(backupsRoot)) return null;
  const dirs = readdirSync(backupsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs.length ? join(backupsRoot, dirs[dirs.length - 1]) : null;
}

const backupDir = explicitDir
  ? join(ROOT, explicitDir)
  : findLatestBackup();

if (!backupDir || !existsSync(backupDir)) {
  console.error("No backup directory found. Pass one explicitly, e.g.:");
  console.error("  npm run db:restore -- backups/2026-09-09T06-11-18-025Z");
  process.exit(1);
}

// Order matters: parents before children (foreign keys).
const TABLES = [
  { name: "organizations", onConflict: "id" },
  { name: "memberships", onConflict: "org_id,user_id" },
  { name: "meetings", onConflict: "id" },
  { name: "attendees", onConflict: "id" },
  { name: "audit_log", onConflict: "id" },
  { name: "attendance", onConflict: "id" },
];

const BATCH_SIZE = 500;

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function confirm() {
  if (skipConfirm) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `This will upsert the contents of ${backupDir} into ${url}\n` +
      `Existing rows with matching IDs will be overwritten. Continue? (yes/no) `,
  );
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

async function restoreTable({ name, onConflict }) {
  const file = join(backupDir, `${name}.json`);
  if (!existsSync(file)) {
    console.log(`Skipping ${name} (no ${name}.json in backup)`);
    return;
  }
  const rows = JSON.parse(readFileSync(file, "utf8"));
  if (rows.length === 0) {
    console.log(`Skipping ${name} (0 rows)`);
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(name).upsert(batch, { onConflict });
    if (error) throw new Error(`Error restoring ${name}: ${error.message}`);
  }
  console.log(`Restored ${name}: ${rows.length} rows`);
}

async function main() {
  console.log(`Restoring from ${backupDir}`);
  if (!(await confirm())) {
    console.log("Aborted.");
    process.exit(0);
  }
  for (const table of TABLES) {
    await restoreTable(table);
  }
  console.log("\nRestore complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
