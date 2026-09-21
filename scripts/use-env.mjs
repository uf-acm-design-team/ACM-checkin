#!/usr/bin/env node
/**
 * ACM Check-in - Switch which Supabase project .env.local points at
 *
 * Usage:
 *   npm run env:staging     # copies .env.staging    -> .env.local
 *   npm run env:prod        # copies .env.production -> .env.local
 *   npm run env:which       # just report the current target
 *
 * Keep one file per environment (all gitignored):
 *   .env.local        active - whatever you're pointed at right now
 *   .env.staging      staging project creds
 *   .env.production   production creds
 *
 * This only moves the app's credentials. The Supabase CLI link (used by
 * `db push`/`db dump`) lives separately in supabase/.temp/project-ref, so this
 * script reports both and warns when they disagree -- that mismatch is how a
 * migration meant for staging ends up on production.
 */

import { copyFileSync, existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const TARGETS = {
  local: ".env.local",
  staging: ".env.staging",
  production: ".env.production",
};

function readEnvValue(path, key) {
  if (!existsSync(path)) return null;
  for (const raw of readFileSync(path, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim() !== key) continue;
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  }
  return null;
}

// https://<ref>.supabase.co -> <ref>; local Docker URLs have no ref.
function refFromUrl(url) {
  if (!url) return null;
  if (url.includes("127.0.0.1") || url.includes("localhost")) return "local (Docker)";
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\./i);
  return m ? m[1] : url;
}

function linkedRef() {
  const p = join(ROOT, "supabase", ".temp", "project-ref");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8").trim() || null;
}

function report() {
  const envPath = join(ROOT, ".env.local");
  const appUrl = readEnvValue(envPath, "NEXT_PUBLIC_SUPABASE_URL");
  const appRef = refFromUrl(appUrl);
  const cliRef = linkedRef();

  console.log("");
  console.log(`  ${C.dim}app (.env.local)${C.reset}  ${C.bold}${appRef ?? "not set"}${C.reset}`);
  console.log(`  ${C.dim}cli (db push)  ${C.reset}  ${C.bold}${cliRef ?? "not linked"}${C.reset}`);

  // Only a hosted app URL is comparable to the CLI link: with local Docker the
  // two are expected to differ and that's not a problem.
  const appIsHosted = appRef && !appRef.startsWith("local");
  if (appIsHosted && cliRef && appRef !== cliRef) {
    console.log("");
    console.log(`  ${C.red}${C.bold}WARNING${C.reset} ${C.red}app and CLI point at different projects.${C.reset}`);
    console.log(`  ${C.dim}A \`supabase db push\` now targets ${cliRef}, not ${appRef}.${C.reset}`);
    console.log(`  ${C.dim}Re-link with: npx supabase link --project-ref ${appRef}${C.reset}`);
  }
  console.log("");
}

function main() {
  const which = (process.argv[2] || "").toLowerCase();

  if (!which || which === "which") {
    report();
    return;
  }

  const key = which === "prod" ? "production" : which;
  const source = TARGETS[key];

  if (!source || key === "local") {
    console.error(`\n  ${C.red}Unknown target "${which}".${C.reset} Use: staging | prod | which\n`);
    process.exit(1);
  }

  const sourcePath = join(ROOT, source);
  if (!existsSync(sourcePath)) {
    console.error(`\n  ${C.red}${source} does not exist.${C.reset}`);
    console.error(`  ${C.dim}Create it with that project's credentials first - see README.md.${C.reset}`);
    console.error(`  ${C.dim}To snapshot what you have now:  cp .env.local ${source}${C.reset}\n`);
    process.exit(1);
  }

  copyFileSync(sourcePath, join(ROOT, ".env.local"));
  console.log(`\n  ${C.green}Copied ${source} -> .env.local${C.reset}`);
  console.log(`  ${C.dim}Restart \`npm run dev\` for it to take effect.${C.reset}`);
  report();

  if (key === "production") {
    console.log(`  ${C.yellow}${C.bold}You are pointed at PRODUCTION.${C.reset}`);
    console.log(`  ${C.dim}Writes hit real member data.${C.reset}\n`);
  }
}

main();
