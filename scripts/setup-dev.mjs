#!/usr/bin/env node
/**
 * ACM Check-in - Developer Setup Script
 *
 * One-command setup: Docker check, Supabase CLI, env files, migrations, functions, Studio.
 * Run: npm run setup
 */

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
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

function writeEnvLocal(env) {
  const apiUrl = env.API_URL || "http://127.0.0.1:54321";
  const anonKey = env.ANON_KEY || "";
  const path = join(ROOT, ".env.local");
  const content = `# Auto-generated by npm run setup - do not commit
NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
USE_LOCAL_SUPABASE=true
`;
  writeFileSync(path, content);
  ok(".env.local");
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
  console.log(C.dim + "  | " + C.reset + "OTP codes: " + C.cyan + "http://127.0.0.1:54324" + C.reset + " (Inbucket)");
  console.log(C.dim + "  | " + C.reset + "Studio: " + C.cyan + "http://127.0.0.1:54323" + C.reset);
  line("=");
  console.log("");
}

main().catch((e) => {
  section("Error");
  err(e.message || String(e));
  process.exit(1);
});
