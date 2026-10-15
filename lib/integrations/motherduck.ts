import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { DuckDBInstance, DuckDBDataChunk, JSToDuckDBValueConverter, VARCHAR, DOUBLE, BIGINT, type DuckDBConnection, type DuckDBType } from "@duckdb/node-api";
import { createSemanticViews, publishSourceConfiguration, publishWarehouseComments } from "./warehouse-semantics";

// Explicit table/column allowlist: projects contain API keys, paths and private notes.
export const WAREHOUSE_TABLES = [
  "projects", "metric_snapshots", "search_queries", "page_metrics", "opportunities", "connector_runs",
  "ga4_landing_metrics", "web_performance_metrics", "project_interventions",
  "gsc_dimension_breakdowns", "gsc_sitemaps", "gsc_index_inspections", "admob_mediation_metrics",
  "play_vitals_metrics", "play_install_stats", "asc_analytics_metrics", "app_keywords", "aso_keyword_snapshots", "aso_app_rank_snapshots", "seo_geo_observations",
] as const;
const PROJECT_COLUMNS = new Set(["id", "name", "slug", "type", "category", "website_url", "gsc_property", "ga4_property_id", "umami_website_id", "play_console_package_name", "app_store_track_id", "bing_site_url", "created_at", "updated_at"]);
const RUN_COLUMNS = new Set(["id", "source", "project_id", "status", "started_at", "finished_at"]);
const INTERVENTION_COLUMNS = new Set(["id","project_id","date","title","kind","target_url","created_at","updated_at"]);
const q = (s: string) => `"${s.replaceAll('"', '""')}"`;

export function warehouseColumns(table: string, columns: { name: string; type: string }[]) {
  return columns.filter(c => c.name !== "raw_json" && (table !== "projects" || PROJECT_COLUMNS.has(c.name)) && (table !== "connector_runs" || RUN_COLUMNS.has(c.name)) && (table !== "project_interventions" || INTERVENTION_COLUMNS.has(c.name)));
}
export function warehousePredicate(table: string) {
  return table === "search_queries" || table === "page_metrics"
    ? `json_valid(raw_json) AND json_extract(raw_json, '$._openfindability.grain') = 'day'` : "1=1";
}

type Partition = { hash: string; count: number };
type Column = { name: string; type: string };
function projection(sqlite: Database.Database, table: string) {
  const columns = warehouseColumns(table, sqlite.prepare(`PRAGMA table_info(${q(table)})`).all() as Column[]);
  if (!columns.length) throw new Error(`Missing warehouse source table ${table}; run migrations first.`);
  const has = (name: string) => columns.some(c => c.name === name);
  const date = ["date", "window_end", "inspection_date", "range_end", "started_at", "created_at"].find(has);
  const partition = `${has("project_id") ? "COALESCE(project_id, '')" : "''"} || ':' || ${date ? `COALESCE(substr(${q(date)}, 1, 7), '')` : "''"}`;
  return { columns, partition, select: `${columns.map(c => q(c.name)).join(", ")}, ${partition} AS _partition_key`, where: warehousePredicate(table) };
}

export function inspectWarehouseSource(sqlite: Database.Database) {
  return WAREHOUSE_TABLES.map(table => ({ table, rows: (sqlite.prepare(`SELECT count(*) n FROM ${q(table)} WHERE ${warehousePredicate(table)}`).get() as { n: number }).n,
    columns: projection(sqlite, table).columns.map(c => c.name) }));
}

async function loadPartition(connection: DuckDBConnection, sqlite: Database.Database, table: string, partitionKey: string) {
  const p = projection(sqlite, table);
  const types: DuckDBType[] = p.columns.map(c => c.type === "INTEGER" ? BIGINT : c.type === "REAL" ? DOUBLE : VARCHAR);
  types.push(VARCHAR);
  const appender = await connection.createAppender("of_stage");
  try {
    let rows: (string | number | bigint | null)[][] = [];
    const flush = () => {
      if (!rows.length) return;
      const chunk = DuckDBDataChunk.create(types);
      chunk.setRowsConverted(rows, JSToDuckDBValueConverter);
      appender.appendDataChunk(chunk);
      rows = [];
    };
    for (const row of sqlite.prepare("SELECT * FROM temp._of_projection WHERE _partition_key = ? ORDER BY id").iterate(partitionKey) as Iterable<Record<string, string | number | null>>) {
      rows.push([...p.columns.map(c => { const value = row[c.name]; return c.type === "INTEGER" && value !== null ? BigInt(value) : value; }), row._partition_key]);
      if (rows.length >= 2048) flush();
    }
    flush();
  } finally { appender.closeSync(); }
}

export async function replicateWarehouse(connection: DuckDBConnection, sqlite: Database.Database, databaseName: string, log: (message: string) => void = console.log) {
  const catalog = q(databaseName);
  // Materialize only selected columns once per table. Re-reading the original
  // raw GSC payloads for every month otherwise multiplies disk/JSON parsing work.
  sqlite.pragma("temp_store = MEMORY");
  await connection.run(`CREATE TABLE IF NOT EXISTS ${catalog}.main.warehouse_sync_state (
    table_name VARCHAR, partition_key VARCHAR, content_hash VARCHAR, row_count BIGINT, snapshot_at VARCHAR,
    PRIMARY KEY(table_name, partition_key))`);
  const stats: { table: string; rows: number; changedPartitions: number }[] = [];
  for (const table of WAREHOUSE_TABLES) {
    const p = projection(sqlite, table);
    const definitions = [...p.columns.map(c => `${q(c.name)} ${c.type === "INTEGER" ? "BIGINT" : c.type === "REAL" ? "DOUBLE" : "VARCHAR"}`), "_partition_key VARCHAR"].join(", ");
    const target = `${catalog}.main.${q(table)}`;
    await connection.run(`CREATE TABLE IF NOT EXISTS ${target} (${definitions})`);
    // Enforce stable row identity on existing cloud tables without rebuilding them.
    await connection.run(`CREATE UNIQUE INDEX IF NOT EXISTS ${q(`of_${table}_id`)} ON ${target}(id)`);
    sqlite.exec(`DROP TABLE IF EXISTS temp._of_projection;
      CREATE TEMP TABLE _of_projection AS SELECT ${p.select} FROM ${q(table)} WHERE ${p.where};
      CREATE INDEX temp._of_partition ON _of_projection(_partition_key, id);`);
    if (sqlite.prepare("SELECT id FROM temp._of_projection GROUP BY id HAVING id IS NULL OR count(*)>1 LIMIT 1").get()) throw new Error(`Invalid or duplicate warehouse identity: ${table}`);
    if (p.columns.some(c => c.name === "project_id") && sqlite.prepare("SELECT project_id FROM temp._of_projection WHERE project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=_of_projection.project_id) LIMIT 1").get()) throw new Error(`Unknown warehouse project reference: ${table}`);
    const hashes = new Map<string, { digest: ReturnType<typeof createHash>; count: number }>();
    for (const row of sqlite.prepare("SELECT * FROM temp._of_projection ORDER BY id").iterate() as Iterable<Record<string, unknown>>) {
      const key = String(row._partition_key);
      const partition = hashes.get(key) ?? { digest: createHash("sha256"), count: 0 };
      partition.digest.update(JSON.stringify(row) + "\n"); partition.count++;
      hashes.set(key, partition);
    }
    const local = new Map<string, Partition>([...hashes].map(([key, value]) => [key, { hash: value.digest.digest("hex"), count: value.count }]));
    const previous = (await connection.runAndReadAll(`SELECT partition_key, content_hash, row_count FROM ${catalog}.main.warehouse_sync_state WHERE table_name = $1`, [table])).getRowObjectsJson();
    const remote = new Map(previous.map(r => [String(r.partition_key), { hash: String(r.content_hash), count: Number(r.row_count) }]));
    const changed = new Set([...local.keys(), ...remote.keys()].filter(k => local.get(k)?.hash !== remote.get(k)?.hash || local.get(k)?.count !== remote.get(k)?.count));
    // Detect a manually deleted/emptied remote table even if the manifest survived.
    const counts = (await connection.runAndReadAll(`SELECT _partition_key, count(*) n FROM ${target} GROUP BY _partition_key`)).getRowObjectsJson();
    const actual = new Map(counts.map(r => [String(r._partition_key), Number(r.n)]));
    for (const key of new Set([...local.keys(), ...actual.keys()])) if ((actual.get(key) ?? 0) !== (local.get(key)?.count ?? 0)) changed.add(key);
    await connection.run(`CREATE OR REPLACE TEMP TABLE of_stage (${definitions})`);
    for (const key of changed) if (local.has(key)) await loadPartition(connection, sqlite, table, key);
    await connection.run("BEGIN TRANSACTION");
    try {
      for (const key of changed) {
        // Keep stable IDs in place: DuckDB's indexed delete+reinsert can conflict
        // across vector chunks (>2048 rows) inside the same transaction.
        await connection.run(`DELETE FROM ${target} AS dest WHERE _partition_key = $1 AND NOT EXISTS (SELECT 1 FROM of_stage src WHERE src.id=dest.id)`, [key]);
        if (!local.has(key)) await connection.run(`DELETE FROM ${catalog}.main.warehouse_sync_state WHERE table_name = $1 AND partition_key = $2`, [table, key]);
      }
      if (changed.size) {
        const names = [...p.columns.map(col => q(col.name)), "_partition_key"].join(",");
        const columns=[...p.columns.map(col=>col.name),"_partition_key"];
        await connection.run(`MERGE INTO ${target} AS dest USING of_stage AS src ON dest.id=src.id
          WHEN MATCHED THEN UPDATE SET ${columns.filter(name=>name!=="id").map(name=>`${q(name)}=src.${q(name)}`).join(",")}
          WHEN NOT MATCHED THEN INSERT (${names}) VALUES (${columns.map(name=>`src.${q(name)}`).join(",")})`);
      }
      for (const key of changed) {
        const partition = local.get(key);
        if (!partition) continue;
        const count = (await connection.runAndReadAll(`SELECT count(*) n FROM ${target} WHERE _partition_key = $1`, [key])).getRows()[0][0];
        if (Number(count) !== partition.count) throw new Error(`Warehouse row count mismatch: ${table}`);
        await connection.run(`INSERT INTO ${catalog}.main.warehouse_sync_state VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT(table_name,partition_key) DO UPDATE SET content_hash=excluded.content_hash,row_count=excluded.row_count,snapshot_at=excluded.snapshot_at`, [table, key, partition.hash, partition.count, new Date().toISOString()]);
      }
      await connection.run("COMMIT");
    } catch (error) { await connection.run("ROLLBACK"); throw error; }
    const rows = [...local.values()].reduce((sum, p) => sum + p.count, 0);
    stats.push({ table, rows, changedPartitions: changed.size });
    log(`${table}: ${rows} rows, ${changed.size} changed partitions.`);
  }
  await publishSourceConfiguration(connection, sqlite, databaseName);
  await createWarehouseViews(connection, databaseName);
  await createSemanticViews(connection, databaseName);
  await publishWarehouseComments(connection, databaseName);
  return stats;
}

export async function createWarehouseViews(c: DuckDBConnection, name: string) {
  const d = `${q(name)}.main`;
  // Qualify every reference; GPT's default database need not be openfindability.
  await c.run(`CREATE OR REPLACE VIEW ${d}.search_performance AS
    SELECT m.project_id, p.slug, m.source, m.date, m.clicks, m.impressions, m.ctr, m.avg_position
    FROM ${d}.metric_snapshots m LEFT JOIN ${d}.projects p ON p.id=m.project_id WHERE m.source IN ('gsc','bing_webmaster')`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.daily_ad_revenue AS
    SELECT project_id, date, 'admob' AS source, currency, sum(estimated_earnings) AS revenue FROM ${d}.admob_mediation_metrics GROUP BY project_id,date,currency
    UNION ALL SELECT m.project_id,m.date,m.source,m.currency,m.revenue FROM ${d}.metric_snapshots m
    WHERE m.source='adsense' OR (m.source='admob' AND NOT EXISTS (SELECT 1 FROM ${d}.admob_mediation_metrics a WHERE a.project_id=m.project_id AND a.date=m.date))`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.revenuecat_latest AS SELECT * EXCLUDE(_rank) FROM (
    SELECT *, row_number() OVER(PARTITION BY project_id ORDER BY date DESC) _rank FROM ${d}.metric_snapshots WHERE source='revenuecat') WHERE _rank=1`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.bing_details AS SELECT project_id, kind, window_start AS provider_report_date, grain, scope,
    try_cast(json_extract(metrics,'$.clicks') AS DOUBLE) clicks, try_cast(json_extract(metrics,'$.impressions') AS DOUBLE) impressions,
    try_cast(json_extract(metrics,'$.avgPosition') AS DOUBLE) avg_position, coverage, fetched_at
    FROM ${d}.seo_geo_observations WHERE source='bing_webmaster' AND kind IN ('query','page')`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.ai_crawler_requests AS SELECT project_id,window_start,window_end,
    json_extract_string(metrics,'$.crawler') crawler, json_extract_string(metrics,'$.host') host, json_extract_string(metrics,'$.path') path,
    try_cast(json_extract(metrics,'$.httpStatus') AS INTEGER) http_status, try_cast(json_extract(metrics,'$.requests') AS BIGINT) requests,
    coverage, fetched_at FROM ${d}.seo_geo_observations WHERE source='cloudflare_ai' AND kind='crawler_requests'`);
  await c.run(`CREATE OR REPLACE VIEW ${d}.clarity_latest AS SELECT * FROM ${d}.seo_geo_observations
    WHERE source='clarity' QUALIFY fetched_at=max(fetched_at) OVER(PARTITION BY project_id)`);
  await c.run(`CREATE TABLE IF NOT EXISTS ${d}.metric_dictionary (name VARCHAR PRIMARY KEY, definition VARCHAR)`);
  for (const [key, definition] of Object.entries({
    search_queries: "GSC true daily top rows only; legacy range aggregates excluded. Query and page reports overlap; never add them to site totals.",
    search_performance: "Daily totals by engine. Compare aligned finalized days. Never average Google and Bing positions together.",
    daily_ad_revenue: "AdMob mediation is complete total; network is fallback only on days without mediation. Group revenue by currency; unknown currencies must stay separate.",
    revenuecat_latest: "revenue is a rolling 28-day snapshot, never sum across dates. MRR/subscribers are point-in-time gauges.",
    clarity_latest: "Last 24h rolling export per URL/metric; snapshot windows overlap. Do not sum windows or treat daily users as unique period users. Top 1000 rows, not exhaustive.",
    ai_crawler_requests: "Cloudflare adaptive analytics for proxied requests; user-agent detection may be spoofed. Sampled counts and incomplete coverage; crawler requests do not prove AI citations.",
    bing_details: "Provider report dates and top query/page rows. Interval semantics not inferred; not guaranteed daily; do not sum into daily site totals.",
    warehouse_sync_state: "Per-table/project/month content hashes and snapshot timestamps. Tables publish atomically, but a failed run can leave tables at different snapshots; inspect warehouse_runs.",
    ga4: "Daily users are not unique users over the period. GA4 and Umami are separate measurements; never add them.",
    asc_analytics_metrics: "Downloads are first-time downloads. Dates before 2025-09-21 are inflated and cannot be re-fetched.",
    project_daily_kpis: "Long-format daily metrics. Preserve source,metric,unit,currency,grain. No RevenueCat rolling snapshots or Clarity rolling windows. Unknown values stay NULL; old inflated iOS downloads excluded.",
    project_latest_kpis: "Latest value per project/source/metric/currency; metric dates can differ. RevenueCat rows identify rolling_28d vs snapshot gauges. Not a same-day cross-source total.",
    source_coverage: "Actual dates/rows with data and current local source configuration. Historical rows survive disabled tracking. Dates with rows do not prove continuous or exhaustive coverage.",
    data_freshness: "Latest connector outcome, actual metric date, natural lag and stale threshold. Disabled sources are not_configured, even if old failures exist. A successful sync can return zero observations.",
    app_store_daily_quality: "trusted_downloads is NULL before 2025-09-21; original inflated downloads retained for audit. Retention fields are missing until cohort/unit mapping is implemented; do not coalesce to zero.",
    gsc_page_monthly: "Aggregate GSC pages by project/page/month before joining to query aggregates, using the same period. Do not join raw query rows to raw page rows (many-to-many multiplication). Partial months must be compared on aligned dates.",
    gsc_query_monthly: "Query+page monthly aggregates, not independent traffic. Join only pre-aggregated datasets on complete matching keys and same periods; do not add page and query reports.",
    index_audit_latest: "Latest inspection per site_url+url; inspection date is separate from GSC traffic freshness. An old audit is not evidence of current indexing state.",
  })) await c.run(`INSERT OR REPLACE INTO ${d}.metric_dictionary VALUES ($1,$2)`, [key, definition]);
}

export async function migrateWarehouseSchema(c: DuckDBConnection, database: string) {
  const d = `${q(database)}.main`;
  await c.run(`CREATE TABLE IF NOT EXISTS ${d}.warehouse_schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ)`);
  const exists = (await c.runAndReadAll("SELECT count(*) FROM information_schema.tables WHERE table_catalog=$1 AND table_schema='main' AND table_name='metric_snapshots'", [database])).getRows()[0][0];
  const playExists=(await c.runAndReadAll("SELECT count(*) FROM information_schema.tables WHERE table_catalog=$1 AND table_schema='main' AND table_name='play_install_stats'",[database])).getRows()[0][0];
  await c.run("BEGIN TRANSACTION");
  try {
    if (Number(exists)) {
      await c.run(`ALTER TABLE ${d}.metric_snapshots ADD COLUMN IF NOT EXISTS sessions BIGINT`);
      await c.run(`ALTER TABLE ${d}.metric_snapshots ADD COLUMN IF NOT EXISTS key_events BIGINT`);
    }
    await c.run(`INSERT OR IGNORE INTO ${d}.warehouse_schema_migrations VALUES (2,current_timestamp)`);
    await c.run(`INSERT OR IGNORE INTO ${d}.warehouse_schema_migrations VALUES (3,current_timestamp)`);
    if(Number(playExists))for(const column of ["user_installs","user_uninstalls","install_events","uninstall_events"])await c.run(`ALTER TABLE ${d}.play_install_stats ADD COLUMN IF NOT EXISTS ${q(column)} BIGINT`);
    await c.run(`INSERT OR IGNORE INTO ${d}.warehouse_schema_migrations VALUES (4,current_timestamp)`);
    await c.run(`UPDATE ${d}.warehouse_metadata SET schema_version=4 WHERE owner='openfindability'`);
    await c.run("COMMIT");
  } catch (error) { await c.run("ROLLBACK"); throw error; }
}

export async function syncMotherDuck(options: { apply?: boolean; verifyLocal?: boolean; sqlitePath?: string; database?: string } = {}) {
  if (options.apply && options.verifyLocal) throw new Error("Local verification cannot be combined with apply.");
  const databaseName = options.database ?? process.env.MOTHERDUCK_DATABASE ?? "openfindability";
  if (!/^[a-z][a-z0-9_]*$/.test(databaseName)) throw new Error("MOTHERDUCK_DATABASE must be a simple lowercase SQL identifier.");
  const source = new Database(options.sqlitePath ?? path.join(process.cwd(), "data/openfindability.db"), { readonly: true, fileMustExist: true });
  const directory = await mkdtemp(path.join(tmpdir(), "openfindability-warehouse-"));
  const snapshotPath = path.join(directory, "snapshot.db");
  let sqlite: Database.Database | undefined;
  let connection: DuckDBConnection | undefined;
  let instance: DuckDBInstance | undefined;
  const runId = randomUUID();
  try {
    await source.backup(snapshotPath); source.close();
    sqlite = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    if (options.verifyLocal) {
      instance = await DuckDBInstance.create(); connection = await instance.connect();
      const tables = await replicateWarehouse(connection, sqlite, "memory");
      return { dryRun: true, localVerification: true, database: "memory", tables };
    }
    if (!options.apply) return { dryRun: true, database: databaseName, tables: inspectWarehouseSource(sqlite) };
    const token = process.env.MOTHERDUCK_API_TOKEN;
    if (!token) throw new Error("MOTHERDUCK_API_TOKEN is not configured.");
    // MotherDuck reads this SDK-standard variable; do not embed tokens in SQL/URLs.
    process.env.motherduck_token = token;
    instance = await DuckDBInstance.create(); connection = await instance.connect();
    await connection.run("ATTACH 'md:'");
    await connection.run(`CREATE DATABASE IF NOT EXISTS ${q(databaseName)}`);
    const existing = (await connection.runAndReadAll("SELECT table_name FROM information_schema.tables WHERE table_catalog=$1 AND table_schema='main'", [databaseName])).getRows().map(r => String(r[0]));
    if (existing.length && !existing.includes("warehouse_metadata")) throw new Error("Destination contains unmanaged tables. Choose a new MOTHERDUCK_DATABASE; no existing tables were changed.");
    await connection.run(`CREATE TABLE IF NOT EXISTS ${q(databaseName)}.main.warehouse_metadata (owner VARCHAR PRIMARY KEY, schema_version BIGINT)`);
    const owners = (await connection.runAndReadAll(`SELECT owner,schema_version FROM ${q(databaseName)}.main.warehouse_metadata`)).getRows();
    if (owners.length && (owners.length !== 1 || owners[0][0] !== "openfindability" || ![1,2,3,4].includes(Number(owners[0][1])))) throw new Error("Incompatible MotherDuck warehouse ownership/schema version.");
    await connection.run(`INSERT OR IGNORE INTO ${q(databaseName)}.main.warehouse_metadata VALUES ('openfindability',1)`);
    await migrateWarehouseSchema(connection, databaseName);
    await connection.run(`CREATE TABLE IF NOT EXISTS ${q(databaseName)}.main.warehouse_runs (id VARCHAR PRIMARY KEY, started_at VARCHAR, finished_at VARCHAR, status VARCHAR)`);
    await connection.run(`INSERT INTO ${q(databaseName)}.main.warehouse_runs VALUES ($1,$2,NULL,'running')`, [runId, new Date().toISOString()]);
    try {
      const tables = await replicateWarehouse(connection, sqlite, databaseName);
      await connection.run(`UPDATE ${q(databaseName)}.main.warehouse_runs SET finished_at=$1,status='success' WHERE id=$2`, [new Date().toISOString(), runId]);
      return { dryRun: false, database: databaseName, runId, tables };
    } catch (error) {
      await connection.run(`UPDATE ${q(databaseName)}.main.warehouse_runs SET finished_at=$1,status='failed' WHERE id=$2`, [new Date().toISOString(), runId]);
      throw error;
    }
  } finally {
    if (source.open) source.close();
    sqlite?.close(); connection?.closeSync(); instance?.closeSync();
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      await unlink(snapshotPath + suffix).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
    await rmdir(directory);
  }
}
