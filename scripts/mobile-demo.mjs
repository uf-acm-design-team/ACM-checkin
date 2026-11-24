#!/usr/bin/env node
/**
 * ACM Check-in - Mobile demo in one command
 *
 * Starts everything the phone app needs and keeps it pointed at the right
 * place, so a demo works on any Wi-Fi (eduroam, hotspot, home):
 *
 *   1. local Supabase (starts it if it isn't running)
 *   2. the edge functions (member-check-in etc.)
 *   3. a cloudflared tunnel to the database, so the phone can reach it
 *   4. an open meeting for the org, so "Check in" has something to check into
 *   5. Expo with --tunnel, pointed at the database tunnel
 *
 * It never edits mobile/.env.local: the tunnel address is passed to Expo as
 * an environment variable, which wins over .env files. Ctrl+C stops it all.
 *
 * Run:  npm run demo:mobile
 *       npm run demo:mobile -- --direct             same Wi-Fi, no tunnels
 *       npm run demo:mobile -- --org acm            org to open a meeting for
 *       npm run demo:mobile -- --functions-from ../other-checkout
 */

import { execSync, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const IS_WIN = process.platform === "win32";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const step = (msg) => console.log(`\n${C.cyan}${C.bold}> ${msg}${C.reset}`);
const ok = (msg) => console.log(`  ${C.green}ok${C.reset} ${msg}`);
const warn = (msg) => console.log(`  ${C.yellow}!${C.reset} ${msg}`);
const fail = (msg) => {
  console.error(`\n${C.red}${C.bold}x ${msg}${C.reset}`);
  stopAll();
  process.exit(1);
};

// --- arguments -------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DIRECT = flag("--direct");
const ORG_SLUG = option("--org", "acm");
const FUNCTIONS_DIR = resolve(ROOT, option("--functions-from", "."));

// --- env -------------------------------------------------------------------

/** Minimal .env parser: KEY=value lines, quotes stripped, comments skipped. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const readEnvFile = (path) => (existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {});

// supabase/config.toml reads CLERK_AUTH_DOMAIN from the environment.
const rootEnv = readEnvFile(join(ROOT, ".env.local"));
const childEnv = { ...process.env, ...rootEnv };
if (!childEnv.CLERK_AUTH_DOMAIN) {
  fail("CLERK_AUTH_DOMAIN is missing from .env.local. Run `npm run setup` first.");
}

// --- child processes -------------------------------------------------------

const children = [];

function start(name, command, { cwd = ROOT, env = childEnv, inherit = false } = {}) {
  const child = spawn(command, {
    cwd,
    env,
    shell: true,
    // Background helpers get their own process group so stopAll can kill the
    // tree. Expo stays in ours: on macOS/Linux a process outside the
    // terminal's group is stopped as soon as it reads the keyboard.
    detached: !IS_WIN && !inherit,
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  child.label = name;
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    try {
      // shell:true puts the real process under a shell; kill the whole tree.
      if (IS_WIN) execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
  }
}

process.on("SIGINT", () => {
  console.log(`\n${C.dim}Stopping functions and tunnels...${C.reset}`);
  stopAll();
  process.exit(0);
});

/** Resolves with the first match of `pattern` in a child's output. */
function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let seen = "";
    const timer = setTimeout(
      () => reject(new Error(`${child.label} didn't start within ${timeoutMs / 1000}s:\n${seen.slice(-800)}`)),
      timeoutMs,
    );
    const onData = (chunk) => {
      seen += chunk.toString();
      const m = seen.match(pattern);
      if (m) {
        clearTimeout(timer);
        resolvePromise(m);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${child.label} exited (code ${code}):\n${seen.slice(-800)}`));
    });
  });
}

function hasCommand(cmd) {
  try {
    execSync(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// --- 1. Supabase -----------------------------------------------------------

function supabaseStatus() {
  try {
    return parseEnv(execSync("npx supabase status -o env", { cwd: ROOT, env: childEnv, stdio: "pipe" }).toString());
  } catch {
    return null;
  }
}

step("Local Supabase");
let status = supabaseStatus();
if (!status?.API_URL) {
  warn("not running, starting it (needs Docker Desktop open)...");
  try {
    execSync("npx supabase start", { cwd: ROOT, env: childEnv, stdio: "inherit" });
  } catch {
    fail("`supabase start` failed. Is Docker Desktop running?");
  }
  status = supabaseStatus();
}
const API_URL = status?.API_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = status?.SERVICE_ROLE_KEY;
ok(`running at ${API_URL}`);

// --- 2. Edge functions -----------------------------------------------------

step("Edge functions");
const envFile = join(ROOT, "supabase", "functions", ".env");
const functions = start(
  "supabase functions serve",
  `npx supabase functions serve --workdir "${FUNCTIONS_DIR}"` +
    (existsSync(envFile) ? ` --env-file "${envFile}"` : ""),
);
try {
  await waitForOutput(functions, /Serving functions on|Using supabase-edge-runtime/i, 120_000);
} catch (error) {
  fail(error.message);
}
ok(FUNCTIONS_DIR === ROOT ? "serving this checkout" : `serving ${FUNCTIONS_DIR}`);

// --- 3. Database tunnel ----------------------------------------------------

let phoneSupabaseUrl = "http://127.0.0.1:54321"; // dev-host.ts swaps in the laptop's IP
if (!DIRECT) {
  step("Database tunnel (cloudflared)");
  if (!hasCommand("cloudflared")) {
    fail(
      "cloudflared isn't installed.\n" +
        "  Windows: winget install --id Cloudflare.cloudflared\n" +
        "  macOS:   brew install cloudflared\n" +
        "  Then open a new terminal. Or run with --direct on the same Wi-Fi.",
    );
  }
  const tunnel = start("cloudflared", `cloudflared tunnel --no-autoupdate --url ${API_URL}`);
  try {
    [phoneSupabaseUrl] = await waitForOutput(tunnel, /https:\/\/[a-z0-9-]+\.trycloudflare\.com/, 60_000);
  } catch (error) {
    fail(error.message);
  }
  // cloudflared prints the address a few seconds before its DNS record
  // exists. Looking it up too early gets "no such host" cached by some
  // resolvers (UF's included) for a minute or more, so wait before the first
  // try, then until the tunnel answers.
  await new Promise((r) => setTimeout(r, 8000));
  let reachable = false;
  for (let i = 0; i < 30 && !reachable; i++) {
    const res = await fetch(`${phoneSupabaseUrl}/rest/v1/`).catch(() => null);
    reachable = Boolean(res && res.status < 500);
    if (!reachable) await new Promise((r) => setTimeout(r, 3000));
  }
  if (reachable) ok(phoneSupabaseUrl);
  else warn(`${phoneSupabaseUrl} isn't answering yet. If the app can't load orgs, wait a minute and pull to refresh.`);
}

// --- 4. An open meeting ----------------------------------------------------

step(`Open meeting for "${ORG_SLUG}"`);
if (!SERVICE_KEY) {
  warn("couldn't read the service role key; skipping. Open a meeting from the admin dashboard.");
} else {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  const rest = (path, init) => fetch(`${API_URL}/rest/v1/${path}`, { headers, ...init });

  const [org] = await (await rest(`organizations?slug=eq.${encodeURIComponent(ORG_SLUG)}&select=id,name`)).json();
  if (!org) {
    warn(`no org with slug "${ORG_SLUG}" locally; skipping. Pass --org <slug>.`);
  } else {
    const now = new Date().toISOString();
    const open = await (
      await rest(`meetings?org_id=eq.${org.id}&status=eq.true&start_time=lte.${now}&end_time=gte.${now}&select=title,end_time`)
    ).json();
    if (open.length > 0) {
      ok(`"${open[0].title}" is already open until ${new Date(open[0].end_time).toLocaleTimeString()}`);
    } else {
      const end = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const res = await rest("meetings", {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          org_id: org.id,
          title: "Demo meeting",
          description: "Opened by npm run demo:mobile",
          start_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          end_time: end.toISOString(),
          status: true,
          is_geo_locked: false,
          is_officer_only: false,
        }),
      });
      if (!res.ok) fail(`couldn't open a meeting: HTTP ${res.status} ${await res.text()}`);
      ok(`opened "Demo meeting" for ${org.name} until ${end.toLocaleTimeString()}`);
    }
  }
}

// --- 5. Expo ---------------------------------------------------------------

step(DIRECT ? "Expo (same Wi-Fi)" : "Expo (tunnel)");
console.log(
  `  ${C.dim}Phone: delete old entries under "Recently opened" in Expo Go, then scan the new QR.${C.reset}`,
);
const expo = start("expo", `npx expo start --clear${DIRECT ? "" : " --tunnel"}`, {
  cwd: join(ROOT, "mobile"),
  env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: phoneSupabaseUrl },
  inherit: true,
});
expo.on("exit", (code) => {
  stopAll();
  process.exit(code ?? 0);
});
