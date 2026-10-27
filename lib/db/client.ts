import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrateSqlite } from "@/lib/db/migrate";

import { schema } from "@/lib/db/schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

// Keep the native handle associated with every Drizzle instance (including MCP).
// This permits a database-wide optimistic revision guard without depending on
// internal Drizzle session properties.
const sqliteHandles = new WeakMap<AppDb, Database.Database>();

export function getSqliteHandle(database: AppDb): Database.Database {
  const handle = sqliteHandles.get(database);
  if (!handle) throw new Error("Unknown OpenFindability database instance.");
  return handle;
}

export function createDb(dbFilePath: string, migrationsFolder: string): AppDb {
  mkdirSync(path.dirname(dbFilePath), { recursive: true });

  const sqlite = new Database(dbFilePath);
  sqlite.pragma("busy_timeout = 15000");
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    const db = drizzle(sqlite, { schema });
    migrateSqlite(sqlite, migrationsFolder);
    // Operational metadata, intentionally outside Drizzle migrations: compatible
    // with existing local databases and every independently created MCP handle.
    sqlite.exec("CREATE TABLE IF NOT EXISTS _openfindability_store_revision (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL)");
    sqlite.prepare("INSERT OR IGNORE INTO _openfindability_store_revision (id, revision) VALUES (1, 0)").run();
    sqliteHandles.set(db, sqlite);

    return db;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

export function getDbFilePath(): string {
  return path.join(process.cwd(), "data", "openfindability.db");
}

export const db = createDb(getDbFilePath(), path.join(process.cwd(), "drizzle"));
