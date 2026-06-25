import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { schema } from "@/lib/db/schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

export function createDb(dbFilePath: string, migrationsFolder: string): AppDb {
  mkdirSync(path.dirname(dbFilePath), { recursive: true });

  const sqlite = new Database(dbFilePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  return db;
}

export function getDbFilePath(): string {
  return path.join(process.cwd(), "data", "openfindability.db");
}

export const db = createDb(getDbFilePath(), path.join(process.cwd(), "drizzle"));
