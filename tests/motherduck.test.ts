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
    sqlite.prepare("UPDATE projects SET website_url='https://example.org',ga4_property_id='123' WHERE id='p'").run();
    sqlite.prepare("INSERT INTO ga4_landing_metrics(id,project_id,date,hostname,landing_page,channel,source_medium,device,sessions,engaged_sessions,key_events,session_key_event_rate,time_zone,quality,fetched_at) VALUES ('landing','p','2026-10-14','example.org','/','Organic Search','google / organic','mobile',10,3,3.5,0.2,'Europe/Rome','standard','2026-10-15')").run();
    sqlite.prepare("INSERT INTO project_interventions(id,project_id,date,title,kind,notes,reference,created_at,updated_at) VALUES ('change','p','2026-10-15','Title changed','title','PRIVATE NOTE','PRIVATE REFERENCE','2026-10-15','2026-10-15')").run();
    sqlite.prepare("INSERT INTO web_performance_metrics(id,project_id,source,url,scope,device,date,status,lcp_ms,fetched_at) VALUES ('perf','p','crux','https://example.org/','url','mobile','2026-10-15','no_data',NULL,'2026-10-15')").run();
    const insert = sqlite.prepare("INSERT INTO search_queries (id,project_id,date,query,clicks,impressions,ctr,avg_position,raw_json) VALUES (?,'p','2026-10-14','q',1,10,0.1,5,?)");
    insert.run("daily", JSON.stringify({ _openfindability: { grain: "day" } })); insert.run("legacy", "{}");
    sqlite.prepare("INSERT INTO metric_snapshots (id,project_id,source,date,revenue,currency,created_at) VALUES ('n','p','admob','2026-10-14',2,'EUR','2026-10-15'),('r','p','revenuecat','2026-10-14',50,'EUR','2026-10-15')").run();
    sqlite.prepare("INSERT INTO admob_mediation_metrics (id,project_id,date,ad_source_name,estimated_earnings,currency,created_at) VALUES ('m','p','2026-10-14','all',3,'EUR','2026-10-15')").run();
    const first = await replicateWarehouse(connection, sqlite, "memory", () => {});
    assert.equal(first.length, WAREHOUSE_TABLES.length);
    assert.equal(first.find(t => t.table === "search_queries")?.rows, 1);
    assert.equal(Number((await connection.runAndReadAll("SELECT session_key_event_rate FROM ga4_landing_monthly")).getRows()[0][0]),0.2);
    assert.equal((await connection.runAndReadAll("SELECT lcp_ms FROM web_performance_latest")).getRows()[0][0],null);
    assert.equal(Number((await connection.runAndReadAll("SELECT value FROM intervention_summary WHERE source='ga4_landing' AND metric='sessions' AND period='before'")).getRows()[0][0]),10);
    assert.equal((await connection.runAndReadAll("SELECT value FROM intervention_summary WHERE source='ga4_landing' AND metric='sessions' AND period='after'")).getRows()[0][0],null);
    assert.equal((await connection.runAndReadAll("SELECT complete FROM intervention_summary WHERE source='ga4_landing' AND metric='sessions' AND period='before'")).getRows()[0][0],false);
    assert.ok(!(await connection.runAndReadAll("DESCRIBE project_interventions")).getRowObjects().some(r=>r.column_name==='notes'||r.column_name==='reference'));
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
    // Updating a large indexed partition must retain stable IDs in place.
    const addRun=sqlite.prepare("INSERT INTO connector_runs(id,project_id,source,status,started_at,finished_at) VALUES (?,'p','ga4','success','2026-10-14','2026-10-14')");
    sqlite.transaction(()=>{for(let i=0;i<4100;i++)addRun.run(`run-${i}`);})();
    await replicateWarehouse(connection,sqlite,"memory",()=>{});
    addRun.run("new-run");
    sqlite.prepare("UPDATE connector_runs SET finished_at='2026-10-15' WHERE id='run-0'").run();
    await replicateWarehouse(connection,sqlite,"memory",()=>{});
    assert.equal(Number((await connection.runAndReadAll("SELECT count(*) FROM connector_runs")).getRows()[0][0]),4101);
    assert.equal((await connection.runAndReadAll("SELECT finished_at FROM connector_runs WHERE id='run-0'")).getRows()[0][0],"2026-10-15");
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
    assert.equal(Number((await c.runAndReadAll("SELECT schema_version FROM warehouse_metadata")).getRows()[0][0]),4);
  } finally { c.closeSync(); instance.closeSync(); }
});
