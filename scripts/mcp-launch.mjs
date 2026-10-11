import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let tsxCli;
try {
  tsxCli = require.resolve("tsx/cli");
} catch {
  console.error("tsx is not installed in OpenFindability. Run pnpm install in the project folder.");
  process.exit(1);
}

// Run the MCP server with OpenFindability as working directory so TS path
// aliases and its own SQLite/config resolve even when the MCP client starts
// from a completely different repo. stdio is owned by the MCP protocol.
const child = spawn(process.execPath, [tsxCli, join(root, "mcp", "server.ts")], {
  cwd: root,
  env: { ...process.env, TSX_TSCONFIG_PATH: join(root, "tsconfig.json") },
  stdio: "inherit",
  windowsHide: true,
});

child.on("error", (error) => {
  console.error("Cannot start OpenFindability MCP:", error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
