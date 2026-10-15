import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { DuckDBInstance } from "@duckdb/node-api";
import { replicateWarehouse, WAREHOUSE_TABLES, warehouseColumns, migrateWarehouseSchema } from "../lib/integrations/motherduck";
import { createDb, getSqliteHandle } from "../lib/db/client";

test("project credentials, notes, raw payloads and run errors never enter warehouse projection", () => {
  assert.deepEqual(warehouseColumns("projects", ["id", "slug", "revenue_cat_api_key", "notes", "flutter_project_path", "raw_json", "clarity_token_env"].map(name => ({ name, type: "TEXT" }))).map(c => c.name), ["id", "slug"]);
  assert.deepEqual(warehouseColumns("connector_runs", ["id", "status", "error_message", "stats"].map(name => ({ name, type: "TEXT" }))).map(c => c.name), ["id", "status"]);
});

test("warehouse partitions are idempotent, replace deleted rows, exclude legacy GSC and preserve metric semantics", async () => {
  const app = createDb(":memory:", "drizzle");
  const sqlite: Database.Database = getSqliteHandle(app);
  const instance = await DuckDBInstance.create();
  const connection = await instance.connect();
  try {
    sqlite.prepare("INSERT INTO projects (id,name,slug,type,created_at,updated_at,revenue_cat_api_key) VALUES ('p','Site','site','web','2026-10-01','2026-10-01','SECRET')").run();
    const insert = sqlite.prepare("INSERT INTO search_queries (id,project_id,date,query,clicks,impressions,ctr,avg_position,raw_json) VALUES (?,'p','2026-10-14','q',1,10,0.1,5,?)");
    insert.run("daily", JSON.stringify({ _openfindability: { grain: "day" } })); insert.run("legacy", "{}");
    sqlite.prepare("INSERT INTO metric_snapshots (id,project_id,source,date,revenue,currency,created_at) VALUES ('n','p','admob','2026-10-14',2,'EUR','2026-10-15'),('r','p','revenuecat','2026-10-14',50,'EUR','2026-10-15')").run();
    sqlite.prepare("INSERT INTO admob_mediation_metrics (id,project_id,date,ad_source_name,estimated_earnings,currency,created_at) VALUES ('m','p','2026-10-14','all',3,'EUR','2026-10-15')").run();
    const first = await replicateWarehouse(connection, sqlite, "memory", () => {});
    assert.equal(first.length, WAREHOUSE_TABLES.length);
    assert.equal(first.find(t => t.table === "search_queries")?.rows, 1);
    assert.equal((await connection.runAndReadAll("SELECT revenue FROM daily_ad_revenue")).getRows()[0][0], 3);
    assert.equal((await connection.runAndReadAll("SELECT revenue FROM revenuecat_latest")).getRows()[0][0], 50);
    assert.equal(Number((await connection.runAndReadAll("SELECT count(*) FROM project_daily_kpis WHERE source='revenuecat'")).getRows()[0][0]),0);
    sqlite.prepare("INSERT INTO asc_analytics_metrics (id,project_id,date,downloads,created_at) VALUES ('old','p','2025-09-20',99,'2026-10-15'),('new','p','2026-10-14',2,'2026-10-15')").run();
    sqlite.prepare("INSERT INTO metric_snapshots (id,project_id,source,date,sessions,key_events,created_at) VALUES ('ga','p','ga4','2026-10-14',12,0,'2026-10-15')").run();
    await replicateWarehouse(connection,sqlite,"memory",()=>{});
    assert.equal((await connection.runAndReadAll("SELECT trusted_downloads FROM app_store_daily_quality WHERE id='old'")).getRows()[0][0],null);
    assert.equal(Number((await connection.runAndReadAll("SELECT value FROM project_daily_kpis WHERE metric='key_events'")).getRows()[0][0]),0);
    assert.equal(Number((await connection.runAndReadAll("SELECT count(*) FROM project_daily_kpis WHERE date<'2025-09-21' AND source='asc_analytics'")).getRows()[0][0]),0);
    assert.equal((await connection.runAndReadAll("SELECT freshness_status FROM data_freshness WHERE source='asc_analytics'")).getRows()[0][0],"not_configured");
    const columns = (await connection.runAndReadAll("DESCRIBE projects")).getRowObjects().map(r => r.column_name);
    assert.ok(!columns.includes("revenue_cat_api_key"));
    const unchanged = await replicateWarehouse(connection, sqlite, "memory", () => {});
    assert.ok(unchanged.every(t => t.changedPartitions === 0));
    sqlite.prepare("DELETE FROM search_queries WHERE id='daily'").run();
    const removed = await replicateWarehouse(connection, sqlite, "memory", () => {});
    assert.equal(removed.find(t => t.table === "search_queries")?.changedPartitions, 1);
    assert.equal(Number((await connection.runAndReadAll("SELECT count(*) FROM search_queries")).getRows()[0][0]), 0);
    await connection.run("DELETE FROM projects");
    const repaired = await replicateWarehouse(connection, sqlite, "memory", () => {});
    assert.equal(repaired.find(t => t.table === "projects")?.changedPartitions, 1);
  } finally { connection.closeSync(); instance.closeSync(); sqlite.close(); }
});

test("warehouse v2 migration is additive and repeatable on old tables", async () => {
  const instance=await DuckDBInstance.create(); const c=await instance.connect();
  try {
    await c.run("CREATE TABLE warehouse_metadata(owner VARCHAR,schema_version INTEGER); INSERT INTO warehouse_metadata VALUES ('openfindability',1); CREATE TABLE metric_snapshots(id VARCHAR,revenue DOUBLE,_partition_key VARCHAR); INSERT INTO metric_snapshots VALUES ('old',3,'p'); CREATE VIEW old_report AS SELECT * FROM metric_snapshots");
    await migrateWarehouseSchema(c,"memory"); await migrateWarehouseSchema(c,"memory");
    const row=(await c.runAndReadAll("SELECT revenue,sessions,key_events FROM metric_snapshots WHERE id='old'")).getRows()[0];
    assert.deepEqual(row,[3,null,null]);
    assert.equal(Number((await c.runAndReadAll("SELECT schema_version FROM warehouse_metadata")).getRows()[0][0]),2);
  } finally { c.closeSync(); instance.closeSync(); }
});
