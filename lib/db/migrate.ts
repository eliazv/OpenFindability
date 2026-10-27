import type Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";

/** Read the migration watermark only AFTER acquiring SQLite's writer lock. */
export function migrateSqlite(sqlite: Database.Database, migrationsFolder: string): void {
  const migrations = readMigrationFiles({ migrationsFolder });
  sqlite.transaction(() => {
    // Preserve Drizzle's journal schema and hashes; existing migration files stay immutable.
    sqlite.exec("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
    const latest = sqlite.prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1").get() as { created_at: number } | undefined;
    const insert = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations) {
      if (latest && Number(latest.created_at) >= migration.folderMillis) continue;
      for (const statement of migration.sql) sqlite.exec(statement);
      insert.run(migration.hash, migration.folderMillis);
    }
  }).immediate();
}
