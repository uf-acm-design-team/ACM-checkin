#!/usr/bin/env node
/**
 * ACM Check-in - Database backup
 *
 * Dumps every row of every table (via the service-role key, bypassing RLS)
 * to timestamped JSON files under backups/<timestamp>/. Data only - schema
 * lives in supabase/migrations/.
 *
 * Run: npm run db:backup
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

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

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Order doesn't matter for a read-only dump.
const TABLES = [
  "organizations",
  "memberships",
  "meetings",
  "attendees",
  "attendance",
  "audit_log",
];

const PAGE_SIZE = 1000;

async function dumpTable(table) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(ROOT, "backups", timestamp);
  mkdirSync(outDir, { recursive: true });

  const summary = {};
  for (const table of TABLES) {
    process.stdout.write(`Dumping ${table}... `);
    const rows = await dumpTable(table);
    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    summary[table] = rows.length;
    console.log(`${rows.length} rows`);
  }

  writeFileSync(
    join(outDir, "_summary.json"),
    JSON.stringify({ timestamp, supabaseUrl: url, rowCounts: summary }, null, 2),
  );

  console.log(`\nBackup complete: backups/${timestamp}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
