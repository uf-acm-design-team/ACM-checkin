import { execSync, spawnSync } from "node:child_process";

let status;
try {
  status = execSync("npx supabase status -o env", { cwd: "..", encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error("Local Supabase is not running. Start it from the repo root with `npm run supabase:start`.");
  process.exit(1);
}

const env = { ...process.env, RLS_TEST_REQUIRED: "1" };
for (const line of status.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (match) env[match[1]] = match[2];
}

const result = spawnSync("npx jest src/lib/supabase/rls.integration.test.ts", {
  stdio: "inherit",
  env,
  shell: true,
});
process.exit(result.status ?? 1);
