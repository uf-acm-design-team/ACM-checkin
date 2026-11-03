/**
 * Upgrade the app to a new Expo SDK in one command, the same way every time.
 *
 *   npm run upgrade:sdk            upgrade to the latest SDK
 *   npm run upgrade:sdk -- 59      upgrade to a specific SDK
 *
 * Expo Go only opens projects on the SDK it was built for, so when the store
 * updates Expo Go to a new SDK, phones stop opening this app until it's
 * upgraded too. This script does the whole upgrade:
 *
 *   1. bumps `expo`, then lets `expo install --fix` move every expo-* and
 *      React Native package to the versions that SDK expects
 *   2. if npm can't resolve that in place (a stale lockfile still holding the
 *      old SDK, which is what usually happens), rebuilds the lockfile
 *   3. moves the dev tools Expo doesn't manage to match: jest + @types/jest
 *      (to the major jest-expo uses) and @types/react (to react's version)
 *   4. runs expo-doctor, lint, typecheck and the tests
 *
 * It only changes package.json and package-lock.json. Code that the new
 * React Native breaks shows up as typecheck or test failures at the end.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, opts = {}) => execSync(cmd, { cwd: MOBILE, stdio: "inherit", ...opts });
const read = (cmd) => execSync(cmd, { cwd: MOBILE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const readJson = (path) => JSON.parse(readFileSync(join(MOBILE, path), "utf8"));
const step = (msg) => console.log(`\n\x1b[36m\x1b[1m> ${msg}\x1b[0m`);
const major = (range) => Number(String(range).match(/\d+/)?.[0]);

const current = major(readJson("package.json").dependencies.expo);
const target = Number(process.argv[2]) || major(read("npm view expo@latest version"));

if (!target) {
  console.error("Couldn't work out the target SDK. Pass it: npm run upgrade:sdk -- 59");
  process.exit(1);
}
if (target <= current) {
  console.log(`Already on SDK ${current}. Checking that every package matches it...`);
  run("npx expo install --check");
  process.exit(0);
}

// The upgrade rewrites package.json and the lockfile; don't mix it into other work.
const dirty = read("git status --porcelain -- package.json package-lock.json");
if (dirty) {
  console.error("package.json / package-lock.json have uncommitted changes. Commit or stash them first.");
  process.exit(1);
}

step(`Expo SDK ${current} -> ${target}`);
// Newest release of that SDK. (Only older SDKs get an `sdk-N` dist-tag.)
const released = [read(`npm view expo@^${target}.0.0 version --json`)].flatMap((out) => JSON.parse(out || "[]"));
const expoVersion = released.at(-1);
if (!expoVersion) {
  console.error(`No expo ${target}.x release on npm yet.`);
  process.exit(1);
}

function upgradeInPlace() {
  run(`npm install expo@~${expoVersion}`);
  run("npx expo install --fix");
}

function upgradeFromScratch() {
  // Old-SDK entries in the lockfile pin peers the new SDK can't satisfy
  // (npm reports ERESOLVE). Resolving from package.json alone fixes it.
  console.log("\nnpm couldn't upgrade in place. Rebuilding the lockfile from package.json...");
  rmSync(join(MOBILE, "node_modules"), { recursive: true, force: true });
  rmSync(join(MOBILE, "package-lock.json"), { force: true });
  run(`npm pkg set dependencies.expo=~${expoVersion}`);
  run("npm install");
  run("npx expo install --fix");
}

try {
  upgradeInPlace();
} catch {
  upgradeFromScratch();
}

step("Dev tools Expo doesn't manage");
const installed = (name) => {
  const path = join("node_modules", name, "package.json");
  return existsSync(join(MOBILE, path)) ? readJson(path) : null;
};
const devUpdates = [];

// jest-expo is built against one jest major; jest and @types/jest must match it.
const jestMajor = major(installed("jest-expo")?.dependencies?.["babel-jest"]);
if (jestMajor) devUpdates.push(`jest@^${jestMajor}`, `@types/jest@^${jestMajor}`);

// @types/react tracks react's minor version.
const reactVersion = installed("react")?.version?.match(/^(\d+)\.(\d+)/);
if (reactVersion) devUpdates.push(`@types/react@~${reactVersion[1]}.${reactVersion[2]}.0`);

if (devUpdates.length) run(`npm install --save-dev ${devUpdates.join(" ")}`);

step("Checking the result");
const failed = [];
for (const [label, cmd] of [
  ["expo install --check", "npx expo install --check"],
  ["expo-doctor", "npx expo-doctor"],
  ["lint", "npm run lint"],
  ["typecheck", "npm run typecheck"],
  ["tests", "npm test -- --ci"],
]) {
  try {
    run(cmd);
  } catch {
    failed.push(label);
  }
}

console.log(`\n\x1b[1mUpgraded to Expo SDK ${target}.\x1b[0m`);
if (failed.length) {
  console.log(`\x1b[33mStill failing: ${failed.join(", ")}.\x1b[0m Fix those (usually small type changes from the new React Native), then re-run them.`);
}
console.log(`Next:
  1. Update Expo Go on your phone and open the app (npx expo start). Check sign-in, Home and the Check in tab.
  2. Commit package.json + package-lock.json (+ any fixes) as "chore(mobile): upgrade to Expo SDK ${target}" and open a PR.
  3. After it merges, teammates run \`npm ci\` in mobile/ and update Expo Go.`);
process.exit(failed.length ? 1 : 0);
