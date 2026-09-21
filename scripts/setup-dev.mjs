#!/usr/bin/env node
/**
 * ACM Check-in - Developer Setup Script
 *
 * One-command setup: Docker check, Supabase CLI, env files, migrations, functions, Studio.
 * Run: npm run setup
 */

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { platform } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const DOCKER_INSTALL = {
  darwin: "https://docs.docker.com/desktop/install/mac-install/",
  win32: "https://docs.docker.com/desktop/install/windows-install/",
  linux: "https://docs.docker.com/engine/install/",
};

// ANSI escape codes (no emojis)
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  brightWhite: "\x1b[97m",
  magenta: "\x1b[35m",
  brightMagenta: "\x1b[95m",
};

const W = 56;

const GRADIENT = [C.brightWhite, C.blue, C.brightMagenta];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function line(char = "-") {
  console.log(C.dim + char.repeat(W) + C.reset);
}

function banner() {
  const logoLines = [
    "#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%##% ",
    "%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#% ",
    "#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%*++*#%#%#%##*+===*##%#%*++*#%#%#%##*++*%#%##%#%#%#% ",
    "%#%#%#=         :#%#%#%#%#*    #%#%#%.    *#%#%*          :##    :#%#%#*    -#%#% ",
    "#%*                 +#%*      %#%#%#=  :   *#%#   *#%#%#   -#      ##%*     -#%## ",
    "#:                           #%#%#%*   ##   ##:  .%#%#%#%#%##   +   **      -#%#% ",
    "%*                   **     *#%#%##         :#+   #%#%#%#%#%#   #=      #   -#%#% ",
    "#%##:             :*#%#%*. =%#%#%#    ....   -%    +##*:   +#   #%*   :#%   -#%## ",
    "#%#%#%#%#*===*#%#%#%#%##%#%#%#%#%   .#%#%##   *%*        =%##   #%#%#%#%#   -#%#% ",
    "%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%##%#%#%#%#%%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%%##% ",
    "#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%##%#% ",
    "%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#%#% ",
  ];
  console.log("");
  let charIndex = 0;
  for (const row of logoLines) {
    let out = "";
    for (const ch of row) {
      out += GRADIENT[charIndex % 3] + ch + C.reset;
      charIndex++;
    }
    console.log(out);
  }
  console.log("");
  console.log("     " + C.dim + "ACM Design Team" + C.reset);
  console.log("");
}

async function bannerWithDelays() {
  banner();
  await sleep(5000);
  line("=");
  console.log(C.dim + "  ACM Check-in — Developer Setup" + C.reset);
  line("=");
  await sleep(3000);
}

function section(title) {
  console.log("");
  line("=");
  console.log(C.bold + C.cyan + "  " + title + C.reset);
  line("-");
}

function step(msg) {
  console.log(C.dim + "  | " + C.reset + msg);
}

function ok(msg) {
  console.log(C.dim + "  | " + C.reset + C.green + "[OK] " + C.reset + msg);
}

function warn(msg) {
  console.log(C.dim + "  | " + C.reset + C.yellow + "[!] " + C.reset + msg);
}

function err(msg) {
  console.log(C.dim + "  | " + C.reset + C.red + "[X] " + C.reset + msg);
}

function log(msg, type = "info") {
  if (type === "ok") ok(msg);
  else if (type === "warn") warn(msg);
  else if (type === "err") err(msg);
  else step(msg);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      cwd: ROOT,
      stdio: opts.silent ? "pipe" : "inherit",
      ...opts,
    });
  } catch (e) {
    if (!opts.ignoreError) throw e;
    return null;
  }
}

function runSilent(cmd) {
  return run(cmd, { silent: true, stdio: "pipe" });
}

function openUrl(url) {
  const plat = platform();
  let cmd;
  if (plat === "darwin") cmd = `open "${url}"`;
  else if (plat === "win32") cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore", shell: true });
  } catch {
    warn("Open manually: " + url);
  }
}

function isDockerRunning() {
  try {
    runSilent("docker info");
    return true;
  } catch {
    return false;
  }
}

function isDockerInstalled() {
  try {
    runSilent("docker --version");
    return true;
  } catch {
    return false;
  }
}

async function startDockerMac() {
  step("Starting Docker Desktop...");
  try {
    execSync("open -a Docker", { stdio: "ignore", cwd: ROOT });
  } catch {
    return false;
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (isDockerRunning()) {
      ok("Docker is running");
      return true;
    }
  }
  return false;
}

async function checkDocker() {
  section("Docker");
  step("Checking Docker...");
  if (isDockerRunning()) {
    ok("Docker is running");
    return true;
  }

  const plat = platform();

  if (isDockerInstalled()) {
    if (plat === "darwin") {
      const started = await startDockerMac();
      if (started) return true;
    } else if (plat === "win32") {
      step("Starting Docker Desktop...");
      try {
        execSync('start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', {
          stdio: "ignore",
          shell: true,
          cwd: ROOT,
        });
        step("Waiting for Docker to start...");
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          if (isDockerRunning()) {
            ok("Docker is running");
            return true;
          }
        }
      } catch {
        /* fall through */
      }
    }
    err("Docker installed but not responding. Start Docker Desktop manually, then run: npm run setup");
  } else {
    err("Docker is not installed.");
    if (plat === "darwin") {
      openUrl(DOCKER_INSTALL.darwin);
    } else if (plat === "win32") {
      openUrl(DOCKER_INSTALL.win32);
    } else {
      openUrl(DOCKER_INSTALL.linux);
    }
    warn("Opened Docker install page. Install Docker, start it, then run: npm run setup");
  }
  process.exit(1);
}

function ensureNpmDeps() {
  section("Dependencies");
  step("Installing npm dependencies...");
  run("npm install");
  ok("Dependencies installed");
}

function stopSupabase() {
  section("Supabase");
  step("Stopping any existing Supabase...");
  run("npx supabase stop", { ignoreError: true });
  ok("Stopped");
}

function startSupabase() {
  step("Starting Supabase (first run may take a minute)...");
  run("npx supabase start");
  ok("Supabase started");
}

async function waitForSupabase(maxAttempts = 30) {
  step("Waiting for Supabase API...");
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch("http://127.0.0.1:54321/rest/v1/", {
        method: "HEAD",
        headers: { apikey: "dummy", Authorization: "Bearer dummy" },
      });
      if (res.status < 500) {
        ok("API ready");
        return;
      }
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Supabase did not become ready in time");
}

function getSupabaseEnv() {
  const out = runSilent("npx supabase status -o env");
  const env = {};
  for (const line of out.split("\n")) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// Keys carried over from an existing .env.local when this script rewrites it.
// Anything not listed here is LOST on every `npm run setup`, so this list must
// track the Clerk vars the app actually reads -- see .env.example.
const PRESERVED_ENV_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_FRONTEND_API_DOMAIN",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  // Clerk's current key name. The old NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL is
  // kept only so an older .env.local doesn't silently lose the value on setup.
  "NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL",
];

function readPreservedEnv(path) {
  if (!existsSync(path)) return {};
  const preserved = {};
  const text = readFileSync(path, "utf-8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1);
    if (PRESERVED_ENV_KEYS.includes(key)) preserved[key] = val;
  }
  return preserved;
}

function writeEnvLocal(env) {
  const apiUrl = env.API_URL || "http://127.0.0.1:54321";
  const anonKey = env.ANON_KEY || "";
  // Guest check-in (app/[orgSlug]/checkin/guest-actions.ts) throws without
  // this, because anon deliberately has no SELECT on attendees. It's the local
  // Docker key -- identical on every machine, and not a secret.
  const serviceKey = env.SERVICE_ROLE_KEY || "";
  const path = join(ROOT, ".env.local");
  const preserved = readPreservedEnv(path);
  let content = `# Auto-generated by npm run setup - do not commit
NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
SUPABASE_SERVICE_ROLE_KEY=${serviceKey}
USE_LOCAL_SUPABASE=true
`;
  const preservedKeys = Object.keys(preserved);
  if (preservedKeys.length > 0) {
    content += `\n# Preserved from previous .env.local\n`;
    for (const key of preservedKeys) content += `${key}=${preserved[key]}\n`;
  }
  writeFileSync(path, content);
  if (preservedKeys.length > 0) {
    ok(`.env.local (preserved ${preservedKeys.length} key${preservedKeys.length === 1 ? "" : "s"})`);
  } else {
    ok(".env.local");
  }
}

function writeFunctionsEnv(env) {
  const apiUrl = env.API_URL || "http://127.0.0.1:54321";
  const serviceKey = env.SERVICE_ROLE_KEY || "";
  const dir = join(ROOT, "supabase", "functions");
  const path = join(dir, ".env");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = `# Auto-generated by npm run setup - do not commit
SUPABASE_URL=${apiUrl}
SUPABASE_SERVICE_ROLE_KEY=${serviceKey}
`;
  writeFileSync(path, content);
  ok("supabase/functions/.env");
}

// The Clerk publishable key encodes the instance's frontend API host as
// base64 (pk_test_<base64 domain>$). Supabase verifies Clerk JWTs against the
// literal `domain` in supabase/config.toml, so if the two disagree every
// user-scoped RLS policy sees a NULL subject and denies -- which looks like an
// app with no data, not like a misconfiguration. Catch it at setup instead.
function clerkDomainFromPublishableKey(pk) {
  const body = pk.replace(/^pk_(test|live)_/, "");
  try {
    const decoded = Buffer.from(body, "base64").toString("utf-8");
    const domain = decoded.replace(/\$+$/, "").trim();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : null;
  } catch {
    return null;
  }
}

function checkClerkConfig() {
  section("Clerk");

  const envPath = join(ROOT, ".env.local");
  const preserved = readPreservedEnv(envPath);
  const pk = preserved.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!pk) {
    warn("No Clerk publishable key in .env.local yet.");
    step("Add your Clerk keys, then re-run this check with: npm run setup");
    step("See ONBOARDING.md step 5 for which instance to use.");
    return;
  }

  const configPath = join(ROOT, "supabase", "config.toml");
  const configText = readFileSync(configPath, "utf-8");
  // Scoped to the clerk block only: [^[] stops at the next section header, so a
  // commented-out/disabled clerk block can't pick up some later section's key.
  const match = configText.match(/^\[auth\.third_party\.clerk\]([^[]*)/m);
  const clerkBlock = match ? match[1] : "";
  const domainMatch = clerkBlock.match(/^\s*domain\s*=\s*"([^"]+)"/m);
  const configDomain = domainMatch ? domainMatch[1] : null;
  const keyDomain = clerkDomainFromPublishableKey(pk);

  if (!configDomain) {
    warn("Could not find [auth.third_party.clerk] domain in supabase/config.toml");
    return;
  }
  if (!keyDomain) {
    warn("Could not decode the Clerk domain from your publishable key; skipping check.");
    return;
  }

  if (keyDomain === configDomain) {
    ok(`Clerk instance matches config.toml (${configDomain})`);
    return;
  }

  err("Clerk instance MISMATCH -- RLS will deny every user-scoped query.");
  step(`  .env.local key points at: ${keyDomain}`);
  step(`  config.toml expects:      ${configDomain}`);
  step("");
  step("Fix either side, then re-run `npm run setup`:");
  step(`  - use the shared dev instance (${configDomain}), or`);
  step(`  - set domain = "${keyDomain}" in supabase/config.toml (do NOT commit)`);
}

function runMigrations() {
  section("Database");
  step("Running migrations and seed...");
  run("npx supabase db reset");
  ok("Migrations applied");
}

function startFunctionsInBackground() {
  section("Edge Functions");
  step("Starting Edge Functions in background...");
  const child = spawn("npx", ["supabase", "functions", "serve", "--env-file", "supabase/functions/.env"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
    shell: true,
  });
  child.unref();
  ok("Serving on port 54321/functions/v1");
}

function openStudio() {
  setTimeout(() => {
    openUrl("http://127.0.0.1:54323");
    ok("Supabase Studio opened in browser");
  }, 1500);
}

async function main() {
  await bannerWithDelays();

  await checkDocker();
  ensureNpmDeps();
  stopSupabase();
  startSupabase();
  await waitForSupabase();

  const env = getSupabaseEnv();
  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    section("Error");
    err("Could not parse Supabase credentials. Run: npx supabase status -o env");
    process.exit(1);
  }

  section("Environment");
  step("Writing .env.local and supabase/functions/.env...");
  writeEnvLocal(env);
  writeFunctionsEnv(env);

  runMigrations();
  checkClerkConfig();
  startFunctionsInBackground();

  section("Studio");
  step("Opening Supabase Studio...");
  openStudio();

  console.log("");
  line("=");
  console.log(C.bold + C.green + "  Setup complete" + C.reset);
  line("-");
  console.log(C.dim + "  | " + C.reset + "Next: run " + C.cyan + "npm run dev" + C.reset + " in a new terminal");
  console.log(C.dim + "  | " + C.reset + "App:  " + C.cyan + "http://localhost:3000" + C.reset);
  console.log(C.dim + "  | " + C.reset + "Sign up with an @ufl.edu email");
  console.log(
    C.dim + "  | " + C.reset + C.dim + "Clerk emails the verification code to that real address" + C.reset,
  );
  console.log(C.dim + "  | " + C.reset + "Studio: " + C.cyan + "http://127.0.0.1:54323" + C.reset);
  console.log(
    C.dim +
      "  | " +
      C.reset +
      C.dim +
      "Meetings don't auto-close locally (pg_cron) - see ONBOARDING.md" +
      C.reset,
  );
  line("=");
  console.log("");
}

main().catch((e) => {
  section("Error");
  err(e.message || String(e));
  process.exit(1);
});
