import "dotenv/config";
import { syncMotherDuck } from "@/lib/integrations/motherduck";
import { db, getSqliteHandle } from "@/lib/db/client";
import { createId } from "@/lib/id";

async function main() {
  const args = process.argv.slice(2).filter(a => a !== "--");
  if (args.some(a => !["--apply", "--dry-run", "--verify-local"].includes(a)) || (args.includes("--apply") && (args.includes("--dry-run") || args.includes("--verify-local")))) throw new Error("Usage: sync:warehouse [--apply | --dry-run | --verify-local]");
  const apply = args.includes("--apply");
  const startedAt = new Date().toISOString();
  const sqlite = getSqliteHandle(db);
  const record = (status: string) => sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO connector_runs (id,source,status,started_at,finished_at) VALUES (?,'motherduck',?,?,?)").run(createId("run"), status, startedAt, new Date().toISOString());
    sqlite.prepare("UPDATE _openfindability_store_revision SET revision=revision+1 WHERE id=1").run();
  })();
  try {
    const result = await syncMotherDuck({ apply, verifyLocal: args.includes("--verify-local") });
    console.log(JSON.stringify(result, null, 2));
    if (apply) record("success");
  } catch (error) {
    if (apply) record("failed");
    throw error;
  }
}
main().catch(error => {
  // Native driver errors can contain connection details. Redact configured credentials.
  let message = error instanceof Error ? error.message : "Warehouse sync failed.";
  for (const [key, value] of Object.entries(process.env)) if (/token|key|secret|password/i.test(key) && value && value.length > 6) message = message.split(value).join("[REDACTED]");
  console.error(message); process.exitCode = 1;
});
