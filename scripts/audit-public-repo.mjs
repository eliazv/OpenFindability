#!/usr/bin/env node
// Scan tracked files (and, with --history, reachable historical blobs) for
// recognized credentials. Never print the matched secret text.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const history = process.argv.includes("--history");
function git(args, encoding = "utf8") {
  return execFileSync("git", args, { encoding: encoding === "buffer" ? null : encoding, maxBuffer: 64 * 1024 * 1024 });
}
const badPaths = [
  /(^|\/)\.env(?:\..+)?$/i,
  /(^|\/)(secrets|sensibili|private-notes|project-reports)\/.+/i,
  /^project\/.+/i, // Private reports at repo root; app/project/[slug] is application source.
  /(^|\/)(data|exports|backups|tmp)\/.+/i,
  /\.(csv|tsv|xls|xlsx|ods|parquet|arrow|feather|duckdb|ndjson|jsonl)$/i,
  /\.(p8|p12|pfx|pem|key|keystore|jks)$/i,
  /(^|\/)(google-services\.json|GoogleService-Info\.plist)$/i,
  /\.(db|sqlite|sqlite3)(?:-(?:wal|shm))?$/i,
  /(^|\/)[^/]*(service.account|credentials|oauth[^/]*token)[^/]*\.json$/i,
];
const badValues = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,})\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bsk_[A-Za-z0-9_-]{25,}\b/, // RevenueCat and other provider keys
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  /\b1\/\/[A-Za-z0-9_-]{25,}\b/, // OAuth refresh token form
  /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/, // JWT-like bearer token
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/,
  /"private_key"\s*:\s*"-----BEGIN/,
  /\b(?:api_key|client_secret|refresh_token|access_token|service_role_key|password)\s*[:=]\s*["'`][^"'`\r\n]{18,}["'`]/i,
];
const seen = new Set();
const issues = [];
function audit(path, bytes, location) {
  const key = location + ":" + path;
  if (seen.has(key)) return;
  seen.add(key);
  if (path !== ".env.example" && path !== "data/.gitkeep" && badPaths.some((rule) => rule.test(path))) {
    issues.push({ path, location, category: "tracked private filename" });
  }
  if (bytes.length > 8_000_000) {
    issues.push({ path, location, category: "large artifact, manual review" });
    return;
  }
  if (!bytes.includes(0) && badValues.some((rule) => rule.test(bytes.toString("utf8")))) {
    issues.push({ path, location, category: "possible credential signature" });
  }
}
try {
  const tracked = git(["ls-files", "-z"], "buffer").toString("utf8").split("\0").filter(Boolean);
  for (const path of tracked) if (existsSync(path)) audit(path, readFileSync(path), "worktree");
  if (history) {
    const entries = git(["rev-list", "--objects", "--all"]).trim().split("\n");
    const checked = new Set();
    for (const entry of entries) {
      const match = entry.match(/^([a-f0-9]{40,64}) (.+)$/);
      if (!match) continue;
      const oid = match[1], path = match[2];
      if (checked.has(oid + ":" + path)) continue;
      checked.add(oid + ":" + path);
      if (git(["cat-file", "-t", oid]).trim() !== "blob") continue;
      const size = Number(git(["cat-file", "-s", oid]).trim());
      if (size > 8_000_000) {
        issues.push({ path, location: "history " + oid.slice(0, 10), category: "large artifact, manual review" });
        continue;
      }
      audit(path, git(["cat-file", "blob", oid], "buffer"), "history " + oid.slice(0, 10));
    }
  }
  console.log("Scanned " + seen.size + " file versions (history: " + history + ").");
  for (const item of issues.slice(0, 100)) {
    // Report only the file path and finding category, NEVER the value.
    console.error("[REVIEW] " + item.path + " [" + item.location + "]: " + item.category);
  }
  if (issues.length > 100) console.error((issues.length - 100) + " additional findings omitted.");
  if (issues.length) {
    console.error("Rotate actual leaked keys immediately; gitignore does not remove past commits.");
    process.exitCode = 1;
  } else {
    console.log("No recognized credentials/private filenames found. This does NOT guarantee a clean history.");
  }
} catch (error) {
  console.error("Could not complete git secret scan: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
}
