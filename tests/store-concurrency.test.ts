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

test("GSC row-level delta replaces refreshed rows but preserves unrelated history", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openfindability-delta-"));
  const connection = createDb(path.join(dir, "openfindability.db"), path.join(process.cwd(), "drizzle"));
  try {
    const base = readDataWith(connection);
    base.projects.push({ id: "p", slug: "website", name: "Website", type: "web",
      createdAt: "2026-10-01", updatedAt: "2026-10-01" });
    base.searchQueries = [
      { id: "old-day", projectId: "p", date: "2026-10-08", query: "old", page: "/old", clicks: 2, impressions: 100, ctr: 0.02, avgPosition: 8 },
      { id: "replace-me", projectId: "p", date: "2026-10-09", query: "changed", page: "/a", clicks: 1, impressions: 20, ctr: 0.05, avgPosition: 3 },
    ];
    writeDataWith(connection, base);
    const refreshed = readDataWith(connection);
    refreshed.searchQueries = [
      refreshed.searchQueries.find((r) => r.id === "old-day")!,
      { id: "new-row", projectId: "p", date: "2026-10-09", query: "changed", page: "/a",
        clicks: 8, impressions: 100, ctr: 0.08, avgPosition: 2 },
    ];
    writeDataWith(connection, refreshed);
    const stored = readDataWith(connection);
    assert.deepEqual(stored.searchQueries.map((r) => r.id).sort(), ["new-row", "old-day"]);
    assert.equal(stored.searchQueries.find((r) => r.id === "new-row")!.clicks, 8);
    assert.equal(stored.searchQueries.find((r) => r.id === "old-day")!.clicks, 2);
    // Editing a previously existing row with the same ID uses UPDATE, not DELETE table.
    stored.searchQueries[0].clicks = 15;
    writeDataWith(connection, stored);
    assert.equal(readDataWith(connection).searchQueries.find((r) => r.id === stored.searchQueries[0].id)!.clicks, 15);
  } finally {
    getSqliteHandle(connection).close();
    rmSync(dir, { recursive: true, force: true });
  }
});
