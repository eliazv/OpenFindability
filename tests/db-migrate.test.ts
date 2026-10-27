import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import test from "node:test";
import Database from "better-sqlite3";
import { migrateSqlite } from "../lib/db/migrate";

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "openfindability-migrations-"));
  const migrations = path.join(dir, "drizzle");
  mkdirSync(path.join(migrations, "meta"), { recursive: true });
  writeFileSync(path.join(migrations, "0000_create.sql"), "CREATE TABLE demo (id TEXT PRIMARY KEY);");
  writeFileSync(path.join(migrations, "0001_add.sql"), "ALTER TABLE demo ADD value TEXT;");
  writeFileSync(path.join(migrations, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "sqlite", entries: [
    { idx: 0, version: "6", when: 1, tag: "0000_create", breakpoints: true },
    { idx: 1, version: "6", when: 2, tag: "0001_add", breakpoints: true },
  ] }));
  return { dir, migrations, file: path.join(dir, "test.db") };
}

test("concurrent startup applies pending migrations exactly once", async () => {
  const f = fixture();
  const workers: Worker[] = [];
  try {
    const promises = Array.from({ length: 4 }, () => new Promise<void>((resolve, reject) => {
      const worker = new Worker(`
        require('tsx/cjs');
        const { workerData, parentPort } = require('node:worker_threads');
        const Database = require(workerData.databaseModule);
        const { migrateSqlite } = require(workerData.migrateModule);
        const db = new Database(workerData.file);
        db.pragma('busy_timeout = 15000');
        parentPort.postMessage('ready');
        parentPort.once('message', () => {
          try { migrateSqlite(db, workerData.migrations); db.close(); parentPort.close(); }
          catch(e) { db.close(); throw e; }
        });
      `, { eval: true, workerData: { ...f, databaseModule: require.resolve("better-sqlite3"), migrateModule: path.resolve("lib/db/migrate.ts") } });
      workers.push(worker);
      worker.once("error", reject);
      worker.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Worker failed: ${code}`)));
    }));
    // Wait until every connection exists, then contend for the same migration lock.
    await Promise.all(workers.map((worker) => new Promise<void>((resolve) => worker.once("message", () => resolve()))));
    workers.forEach((worker) => worker.postMessage("start"));
    await Promise.all(promises);
    const db = new Database(f.file);
    try {
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as { n: number }).n, 2);
      migrateSqlite(db, f.migrations);
      db.prepare("INSERT INTO demo (id,value) VALUES (?,?)").run("one", "preserved");
      migrateSqlite(db, f.migrations);
      assert.equal((db.prepare("SELECT value FROM demo").get() as { value: string }).value, "preserved");
    } finally { db.close(); }
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("failed migration rolls back both schema and journal", () => {
  const f = fixture();
  const db = new Database(":memory:");
  try {
    writeFileSync(path.join(f.migrations, "0001_add.sql"), "ALTER TABLE missing ADD value TEXT;");
    assert.throws(() => migrateSqlite(db, f.migrations), /no such table/);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='demo'").get(), undefined);
    writeFileSync(path.join(f.migrations, "0001_add.sql"), "ALTER TABLE demo ADD value TEXT;");
    migrateSqlite(db, f.migrations);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as { n: number }).n, 2);
  } finally { db.close(); rmSync(f.dir, { recursive: true, force: true }); }
});
