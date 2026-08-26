import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function parseDotEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

if (!existsSync(envPath)) {
  console.log("No .env.local — skipping HOUSEHOLD_PASSWORD sync.");
  process.exit(0);
}

const env = parseDotEnv(readFileSync(envPath, "utf8"));
if (env.VITE_HOUSEHOLD_PASSWORD) {
  console.error(
    "Do not set VITE_HOUSEHOLD_PASSWORD. That prefix ships the secret in the browser bundle. Use HOUSEHOLD_PASSWORD instead.",
  );
  process.exit(1);
}

const password = env.HOUSEHOLD_PASSWORD;
if (!password) {
  console.log(
    "No HOUSEHOLD_PASSWORD in .env.local — leaving Convex env unchanged.",
  );
  process.exit(0);
}

const convexBin = path.join(root, "node_modules/.bin/convex");
const result = spawnSync(convexBin, ["env", "set", "HOUSEHOLD_PASSWORD"], {
  cwd: root,
  encoding: "utf8",
  input: password,
  stdio: ["pipe", "pipe", "pipe"],
});

if (result.status !== 0) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  console.error(output || "Failed to set HOUSEHOLD_PASSWORD on Convex.");
  process.exit(result.status ?? 1);
}

console.log("Synced HOUSEHOLD_PASSWORD from .env.local to Convex.");
