import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb, getSqliteHandle } from "../lib/db/client";
import { readDataWith, StaleStoreSnapshotError, writeDataWith } from "../lib/store";

test("two SQLite connections cannot silently overwrite each other", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openfindability-revision-"));
  const databaseFile = path.join(dir, "openfindability.db");
  const migrations = path.join(process.cwd(), "drizzle");
  const first = createDb(databaseFile, migrations);
  const second = createDb(databaseFile, migrations);

  try {
    const oldFirst = readDataWith(first);
    const oldSecond = readDataWith(second);
    oldFirst.projects.push({
      id: "p1", slug: "app-one", name: "App One", type: "app",
      createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
    });
    writeDataWith(first, oldFirst);

    oldSecond.projects.push({
      id: "p2", slug: "app-two", name: "App Two", type: "app",
      createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
    });
    assert.throws(() => writeDataWith(second, oldSecond), StaleStoreSnapshotError);

    const recovered = readDataWith(second);
    assert.deepEqual(recovered.projects.map((p) => p.slug), ["app-one"]);
    recovered.projects.push({
      id: "p2", slug: "app-two", name: "App Two", type: "app",
      createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
    });
    writeDataWith(second, recovered);
    assert.deepEqual(readDataWith(first).projects.map((p) => p.slug).sort(), ["app-one", "app-two"]);
  } finally {
    getSqliteHandle(second).close();
    getSqliteHandle(first).close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("untracked data objects may not trigger an unsafe full-store rewrite", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openfindability-revision-untracked-"));
  const db = createDb(path.join(dir, "openfindability.db"), path.join(process.cwd(), "drizzle"));
  try {
    const data = readDataWith(db);
    const spread = { ...data };
    assert.throws(() => writeDataWith(db, spread), /Untracked AppData/);
  } finally {
    getSqliteHandle(db).close();
    rmSync(dir, { recursive: true, force: true });
  }
});
