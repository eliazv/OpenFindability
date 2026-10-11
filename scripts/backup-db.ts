import "dotenv/config";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

// SQLite may be in WAL mode. Copying only the .db file can miss committed
// pages in .db-wal; use SQLite's online backup API instead.
async function main() {
  const root = process.cwd();
  const databasePath = path.join(root, "data", "openfindability.db");
  const backupDir = path.join(root, "data", "backups");
  await stat(databasePath); // fail rather than creating an empty database
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(backupDir, `openfindability-${timestamp}.db`);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destination);
    const backup = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      const result = backup.pragma("integrity_check", { simple: true });
      if (result !== "ok") throw new Error(`Backup integrity_check failed: ${String(result)}`);
    } finally {
      backup.close();
    }
    const size = (await stat(destination)).size;
    console.log(`Backup verified: ${destination} (${size} bytes)`);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
